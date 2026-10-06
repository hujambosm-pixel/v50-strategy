// lib/graficoEstrategia.js — normalizador del campo opcional `grafico` que puede devolver run().
//
// QUÉ ES `grafico`. Lo que una estrategia quiere que se VEA para poder comprobar a ojo que sigue sus
// reglas: qué indicadores usa y en qué panel, los eventos que no salen de sus operaciones (armado,
// vela de señal, cruces) y sus órdenes pendientes nivel a nivel. Es OPCIONAL: una estrategia que no lo
// devuelve se ve exactamente como hasta ahora, y las rutas no añaden el campo a la respuesta.
//
//   grafico: {
//     version: 1,
//     series:  [{ clave, nombre?, panel?, tipo?, color?, niveles?, escala?, equivale? }],
//     eventos: [{ date, tipo, panel?, precio?, valor?, texto? }],
//     ordenes: [{ id?, lado?, clase?, niveles:[{ date, precio, decididaEn }], fin, finDate?, motivo?, entryDate? }],
//   }
//
// LO QUE NO VA AQUÍ, A PROPÓSITO. Entradas, salidas y stops ya están en `trades` (entryDate, exitDate,
// exitReason, stopHistory): el gráfico los deduce de ahí. Repetirlos como eventos daría dos fuentes de
// la misma verdad y, tarde o temprano, dos verdades. Los VALORES de las series tampoco: siguen en
// `indicators[clave]`, con la misma rejilla y el mismo recorte de calentamiento de siempre; `series`
// solo los describe.
//
// LA REJILLA. run() ve `fechasVistas`: las velas CERRADAS con el calentamiento delante. El periodo
// empieza en `iDesde` dentro de esa lista y la rejilla de salida tiene `n` posiciones —las del periodo,
// incluida la vela en curso si la hay, que run() no vio pero el gráfico sí pinta—.
//
// REGLAS (cada descarte queda anotado en `descartadas`, con dónde y por qué):
//   · Series: clave válida y sin repetir; su array en `indicators` con la LONGITUD de las velas vistas.
//     Una longitud distinta significa que la serie no está alineada y se dibujaría desplazada.
//   · Eventos: fecha de una vela vista. Los del calentamiento y los posteriores a `hasta` se quitan sin
//     anotarse uno a uno —son legítimos, solo que no son del periodo—: se cuentan.
//   · Órdenes: cada nivel con fecha de una vela vista, precio positivo y `decididaEn` ESTRICTAMENTE
//     anterior a `date`. Un nivel decidido en la misma vela en la que rige se decidió con una vela que
//     aún no había cerrado: se descarta y se anota, para que la infracción se vea y no se dibuje como
//     si fuera buena.
//   · Calentamiento: una orden que terminó antes de `desde` desaparece; una viva al empezar el periodo
//     se recorta a `desde` y se marca `heredada: true`, igual que posicionesHeredadas con las operaciones.
//   · Vela en curso: una orden `abierta` se prolonga con su último nivel hasta la vela en curso, marcado
//     `prolongado: true`. run() no ha visto esa vela, así que el nivel no puede ser otro que el último
//     que decidió.
//
// No lanza nunca: un `grafico` malformado no puede tumbar un backtest que, por lo demás, es correcto.

import { permiteEntrada, fechaQueDecide } from './filtroEntrada'

export const VERSION_GRAFICO = 1

const MAX_SERIES  = 8
const MAX_NIVELES = 8
const MAX_EVENTOS = 5000
const MAX_ORDENES = 2000
const MAX_DESCARTES = 50

const TIPOS_SERIE  = new Set(['linea', 'histograma'])
const TIPOS_EVENTO = new Set(['armado', 'senal', 'cruce', 'aviso'])
const LADOS        = new Set(['compra', 'venta'])
const CLASES       = new Set(['stop', 'limite', 'mercado'])
const FINES        = new Set(['ejecutada', 'cancelada', 'abierta'])

const RE_CLAVE = /^[A-Za-z_][A-Za-z0-9_]{0,39}$/
const RE_PANEL = /^[a-z][a-z0-9_-]{0,23}$/
const RE_COLOR = /^(#[0-9a-fA-F]{3,8}|rgba?\([0-9.,\s%]+\))$/
const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/

const finito = (v) => typeof v === 'number' && Number.isFinite(v)
const texto  = (v, max) => (typeof v === 'string' && v.trim()) ? v.trim().slice(0, max) : null

// Fecha de vela: 'YYYY-MM-DD' tal cual, o un timestamp Unix en segundos —el mismo formato que aceptan
// los customMarkers—. Cualquier otra cosa no es una fecha.
function fecha(v) {
  if (typeof v === 'string' && RE_FECHA.test(v)) return v
  if (finito(v) && v > 0) {
    const d = new Date(v * 1000)
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
  }
  return null
}

// equivale: solo valores primitivos, para comparar firmas con los indicadores del usuario.
function equivalencia(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const out = {}
  for (const [k, x] of Object.entries(v)) {
    if (!RE_CLAVE.test(k)) continue
    if (typeof x === 'string') out[k] = x.slice(0, 40)
    else if (finito(x) || typeof x === 'boolean') out[k] = x
  }
  return (typeof out.tipo === 'string' && out.tipo) ? out : null
}

// Valores de la serie en la rejilla del periodo: mismo recorte que recortaIndicadores —slice desde
// iDesde y relleno con null por el final para la vela en curso—, y los no finitos pasan a null.
function aRejilla(arr, iDesde, n) {
  const s = arr.slice(iDesde, iDesde + n).map(v => finito(v) ? v : null)
  while (s.length < n) s.push(null)
  return s
}

/**
 * @param {object} grafico       lo que devolvió run() en `grafico`
 * @param {object} ctx
 *   fechasVistas  fechas de las velas que vio run() (cerradas, con calentamiento)
 *   iDesde        índice del primer día del periodo dentro de fechasVistas
 *   n             posiciones de la rejilla de salida (periodo + vela en curso)
 *   desde, hasta  límites del periodo ('YYYY-MM-DD'; hasta puede faltar)
 *   fechaEnCurso  fecha de la vela en curso, o null si no la hay
 *   indicators    los indicators CRUDOS de run(), sin recortar
 *   conocidas     claves que la ruta ya transporta por su cuenta: de esas no se copian los valores
 * @returns {object|null} null si la estrategia no devolvió `grafico`
 */
export function normalizaGrafico(grafico, ctx = {}) {
  if (grafico == null) return null
  const descartadas = []
  let nDescartes = 0
  const anota = (donde, motivo) => {
    nDescartes++
    if (descartadas.length < MAX_DESCARTES) descartadas.push({ donde, motivo })
  }
  const salida = (series, eventos, ordenes, extra = {}) => ({
    version: VERSION_GRAFICO, series, eventos, ordenes, ...extra,
    ...(nDescartes ? { descartadas, ...(nDescartes > descartadas.length ? { descartesNoListados: nDescartes - descartadas.length } : {}) } : {}),
  })

  try {
    if (typeof grafico !== 'object' || Array.isArray(grafico)) {
      anota('grafico', `no es un objeto (${Array.isArray(grafico) ? 'array' : typeof grafico})`)
      return salida([], [], [])
    }
    if (grafico.version !== VERSION_GRAFICO) {
      anota('version', `versión ${JSON.stringify(grafico.version)} no soportada (se espera ${VERSION_GRAFICO})`)
      return salida([], [], [])
    }

    const fechasVistas = Array.isArray(ctx.fechasVistas) ? ctx.fechasVistas : []
    const nVistas = fechasVistas.length
    const iDesde = Math.max(0, Math.min(nVistas, Math.floor(ctx.iDesde ?? 0) || 0))
    const n = Math.max(0, Math.floor(ctx.n ?? (nVistas - iDesde)) || 0)
    const desde = ctx.desde ?? fechasVistas[iDesde] ?? null
    const hasta = ctx.hasta ?? null
    const fechaEnCurso = ctx.fechaEnCurso ?? null
    const indicators = (ctx.indicators && typeof ctx.indicators === 'object') ? ctx.indicators : {}
    const conocidas = ctx.conocidas instanceof Set ? ctx.conocidas : new Set(ctx.conocidas || [])
    const vistas = new Set(fechasVistas)
    const delPeriodo = (f) => (!desde || f >= desde) && (!hasta || f <= hasta)

    // ── Series ──
    const series = []
    const paneles = new Set(['precio'])
    const lista = grafico.series == null ? [] : grafico.series
    if (!Array.isArray(lista)) anota('series', 'no es un array')
    else {
      if (lista.length > MAX_SERIES) anota('series', `${lista.length} series, máximo ${MAX_SERIES}: sobran las últimas`)
      const vistasClave = new Set()
      lista.slice(0, MAX_SERIES).forEach((s, i) => {
        const donde = `series[${i}]`
        if (!s || typeof s !== 'object') return anota(donde, 'no es un objeto')
        const clave = s.clave
        if (typeof clave !== 'string' || !RE_CLAVE.test(clave)) return anota(donde, `clave no válida (${JSON.stringify(clave)})`)
        if (vistasClave.has(clave)) return anota(donde, `clave repetida (${clave})`)
        const arr = indicators[clave]
        if (!Array.isArray(arr)) return anota(donde, `indicators.${clave} no es un array`)
        if (arr.length !== nVistas) return anota(donde, `indicators.${clave}: longitud ${arr.length}, se esperaban ${nVistas}`)
        const panel = s.panel == null ? 'precio' : s.panel
        if (typeof panel !== 'string' || !RE_PANEL.test(panel)) return anota(donde, `panel no válido (${JSON.stringify(s.panel)})`)
        const tipo = s.tipo == null ? 'linea' : s.tipo
        if (!TIPOS_SERIE.has(tipo)) return anota(donde, `tipo no válido (${JSON.stringify(s.tipo)})`)
        vistasClave.add(clave)
        paneles.add(panel)
        const out = { clave, nombre: texto(s.nombre, 60) ?? clave, panel, tipo }
        if (s.color != null) {
          if (typeof s.color === 'string' && RE_COLOR.test(s.color.trim())) out.color = s.color.trim()
          else anota(`${donde}.color`, 'color no válido: se usa el de por defecto')
        }
        if (s.niveles != null) {
          if (!Array.isArray(s.niveles)) anota(`${donde}.niveles`, 'no es un array')
          else {
            const nv = []
            s.niveles.slice(0, MAX_NIVELES).forEach((l, j) => {
              if (!l || !finito(l.valor)) return anota(`${donde}.niveles[${j}]`, 'valor no numérico')
              const o = { valor: l.valor }
              const t = texto(l.texto, 40); if (t) o.texto = t
              if (typeof l.color === 'string' && RE_COLOR.test(l.color.trim())) o.color = l.color.trim()
              nv.push(o)
            })
            if (s.niveles.length > MAX_NIVELES) anota(`${donde}.niveles`, `máximo ${MAX_NIVELES}: sobran los últimos`)
            if (nv.length) out.niveles = nv
          }
        }
        if (s.escala != null) {
          const e = s.escala
          if (e && finito(e.min) && finito(e.max) && e.min < e.max) out.escala = { min: e.min, max: e.max }
          else anota(`${donde}.escala`, 'se espera {min, max} numéricos con min < max')
        }
        const eq = equivalencia(s.equivale)
        if (eq) out.equivale = eq
        else if (s.equivale != null) anota(`${donde}.equivale`, 'se espera un objeto con `tipo`')
        // Los valores solo viajan aquí si la ruta no los transporta ya por su cuenta.
        if (!conocidas.has(clave)) out.valores = aRejilla(arr, iDesde, n)
        series.push(out)
      })
    }

    // ── Eventos ──
    const eventos = []
    let fueraDelPeriodo = 0
    const listaEv = grafico.eventos == null ? [] : grafico.eventos
    if (!Array.isArray(listaEv)) anota('eventos', 'no es un array')
    else {
      if (listaEv.length > MAX_EVENTOS) anota('eventos', `${listaEv.length} eventos, máximo ${MAX_EVENTOS}: sobran los últimos`)
      listaEv.slice(0, MAX_EVENTOS).forEach((e, i) => {
        const donde = `eventos[${i}]`
        if (!e || typeof e !== 'object') return anota(donde, 'no es un objeto')
        const date = fecha(e.date)
        if (!date) return anota(donde, `fecha no válida (${JSON.stringify(e.date)})`)
        if (!vistas.has(date)) return anota(donde, `${date} no es una vela que viera la estrategia`)
        if (!TIPOS_EVENTO.has(e.tipo)) return anota(donde, `tipo no válido (${JSON.stringify(e.tipo)})`)
        const panel = e.panel == null ? 'precio' : e.panel
        if (!paneles.has(panel)) return anota(donde, `panel ${JSON.stringify(panel)} sin ninguna serie declarada`)
        if (!delPeriodo(date)) { fueraDelPeriodo++; return }
        const out = { date, tipo: e.tipo, panel }
        if (finito(e.precio)) out.precio = e.precio
        if (finito(e.valor)) out.valor = e.valor
        const t = texto(e.texto, 80); if (t) out.texto = t
        eventos.push(out)
      })
    }
    eventos.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0)

    // ── Órdenes ──
    const ordenes = []
    let ordenesFuera = 0
    const listaOr = grafico.ordenes == null ? [] : grafico.ordenes
    const ultimaVista = fechasVistas[nVistas - 1] ?? null
    if (!Array.isArray(listaOr)) anota('ordenes', 'no es un array')
    else {
      if (listaOr.length > MAX_ORDENES) anota('ordenes', `${listaOr.length} órdenes, máximo ${MAX_ORDENES}: sobran las últimas`)
      const ids = new Set()
      listaOr.slice(0, MAX_ORDENES).forEach((o, i) => {
        const donde = `ordenes[${i}]`
        if (!o || typeof o !== 'object') return anota(donde, 'no es un objeto')
        let id = (typeof o.id === 'string' && o.id.trim()) ? o.id.trim().slice(0, 40) : finito(o.id) ? String(o.id) : `o${i}`
        if (ids.has(id)) return anota(donde, `id repetido (${id})`)
        const lado = o.lado == null ? 'compra' : o.lado
        if (!LADOS.has(lado)) return anota(donde, `lado no válido (${JSON.stringify(o.lado)})`)
        const clase = o.clase == null ? 'stop' : o.clase
        if (!CLASES.has(clase)) return anota(donde, `clase no válida (${JSON.stringify(o.clase)})`)
        if (!FINES.has(o.fin)) return anota(donde, `fin no válido (${JSON.stringify(o.fin)})`)
        let finDate = null
        if (o.fin !== 'abierta') {
          finDate = fecha(o.finDate)
          if (!finDate) return anota(donde, `orden ${o.fin} sin finDate válida`)
        }
        if (!Array.isArray(o.niveles) || !o.niveles.length) return anota(donde, 'sin niveles')

        // Niveles válidos, ordenados y con una sola entrada por vela.
        const porFecha = new Map()
        o.niveles.forEach((l, j) => {
          const dn = `${donde}.niveles[${j}]`
          if (!l || typeof l !== 'object') return anota(dn, 'no es un objeto')
          const date = fecha(l.date)
          if (!date) return anota(dn, `fecha no válida (${JSON.stringify(l.date)})`)
          if (!vistas.has(date)) return anota(dn, `${date} no es una vela que viera la estrategia`)
          if (!finito(l.precio) || l.precio <= 0) return anota(dn, `precio no válido (${JSON.stringify(l.precio)})`)
          const dec = fecha(l.decididaEn)
          if (!dec) return anota(dn, 'sin decididaEn válida')
          if (dec >= date) return anota(dn, `decididaEn ${dec} no es anterior a la vela en la que rige (${date})`)
          if (porFecha.has(date)) return anota(dn, `segundo nivel para ${date}`)
          porFecha.set(date, { date, precio: l.precio, decididaEn: dec })
        })
        let niveles = [...porFecha.values()].sort((a, b) => a.date < b.date ? -1 : 1)
        if (!niveles.length) return anota(donde, 'ningún nivel válido')

        // Calentamiento: terminó antes del periodo → no es del periodo. Viva al empezar → heredada.
        const fin = finDate ?? niveles[niveles.length - 1].date
        if (desde && fin < desde && o.fin !== 'abierta') { ordenesFuera++; return }
        let heredada = false
        if (desde && niveles[0].date < desde) {
          heredada = true
          niveles = niveles.filter(l => l.date >= desde)
          if (!niveles.length) { ordenesFuera++; return }
        }
        if (hasta) niveles = niveles.filter(l => l.date <= hasta)
        if (!niveles.length) { ordenesFuera++; return }

        // Vela en curso: la orden abierta sigue valiendo en ella con el último nivel decidido.
        if (o.fin === 'abierta' && fechaEnCurso && ultimaVista && fechaEnCurso > ultimaVista
            && niveles[niveles.length - 1].date < fechaEnCurso) {
          const u = niveles[niveles.length - 1]
          niveles.push({ date: fechaEnCurso, precio: u.precio, decididaEn: u.decididaEn, prolongado: true })
        }

        ids.add(id)
        const out = { id, lado, clase, niveles, fin: o.fin }
        if (finDate) out.finDate = finDate
        const motivo = texto(o.motivo, 120); if (motivo) out.motivo = motivo
        if (o.fin === 'ejecutada') {
          const ed = fecha(o.entryDate)
          if (ed) out.entryDate = ed
        }
        if (heredada) out.heredada = true
        ordenes.push(out)
      })
    }

    const extra = (fueraDelPeriodo || ordenesFuera)
      ? { fueraDelPeriodo: { eventos: fueraDelPeriodo, ordenes: ordenesFuera } } : {}
    return salida(series, eventos, ordenes, extra)
  } catch (e) {
    anota('grafico', `error al normalizar: ${e?.message || e}`)
    return salida([], [], [])
  }
}

// ── Entradas bloqueadas por los filtros ──
// La estrategia no ve los filtros: llena su orden y el motor descarta DESPUÉS esa entrada
// (filtraPorEntrada). Sin esto, la orden queda «ejecutada» sin operación, y en el gráfico parece una
// entrada que falta. Aquí, con la MISMA regla que filtraPorEntrada —el estado del filtro en el cierre
// anterior a la vela de entrada, o en el de la propia vela si la estrategia entra al cierre—, cada orden
// ejecutada cuya entrada el filtro no permite pasa a `fin: 'bloqueada'`, con el motivo: los filtros que
// estaban en rojo en el cierre que decidió. Muta `grafico` (ya normalizado) y lo devuelve.
export function marcaBloqueadas(grafico, { filtroActivoMap, assetDates, entradaAlCierre = false, motivos = {} } = {}) {
  if (!grafico || !Array.isArray(grafico.ordenes) || !grafico.ordenes.length || !filtroActivoMap) return grafico
  const indice = new Map()
  if (Array.isArray(assetDates)) for (let i = 0; i < assetDates.length; i++) indice.set(assetDates[i], i)
  for (const o of grafico.ordenes) {
    if (o?.fin !== 'ejecutada' || !o.entryDate) continue
    if (permiteEntrada(filtroActivoMap, assetDates, o.entryDate, { entradaAlCierre, indice })) continue
    const decide = fechaQueDecide(assetDates, o.entryDate, entradaAlCierre, indice)
    const nombres = (decide && motivos?.[decide]) || []
    o.fin = 'bloqueada'
    o.motivo = 'Filtro en rojo' + (nombres.length ? ': ' + nombres.join(', ') : '')
  }
  return grafico
}

export default { normalizaGrafico, marcaBloqueadas, VERSION_GRAFICO }
