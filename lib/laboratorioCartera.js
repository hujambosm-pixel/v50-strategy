// lib/laboratorioCartera.js — laboratorio de CARTERA (CARTERA_1): una máquina de ESTADOS sobre el QQQ y un ETF apalancado.
// Puro: recibe las velas (de la caché) y los dividendos (lib/dividendosCartera.json); no toca la red.
//
// PRECIOS. Las velas de la caché están ajustadas por splits pero no por dividendos. Aquí se usa RENTABILIDAD TOTAL para los
// cuatro ETF (QQQ, QLD, TQQQ, SPY), igual para todos (preciosTotales): el día ex-dividendo el dividendo se reinvierte a la
// apertura (factor F_t = F_{t−1} · (1 + dividendo / apertura)); la apertura y el cierre ajustados son los de la vela × F_t.
// Las CONDICIONES se miran sobre el PRECIO del QQQ (los cierres de la caché, como en un gráfico), no sobre el ajustado.
//
// LA MÁQUINA (genérica; un editor visual puede generar la misma configuración). regla = {
//   inicial: 'NORMAL', estados: { ID: { nombre, composicion (texto) } },
//   transiciones: [{ desde, hacia, si: [condición, …] (todas a la vez), hacer: [{ mover: 'QQQ'|'ETF'|'LIQUIDEZ',
//     a: …, todo: true | fraccionCartera: f }], fijaMaxRef?, iniciaCiclo?, terminaCiclo? }] }
// Al cierre de t se miran, en orden, las transiciones que salen del estado actual; la primera que se cumple se ejecuta a la
// APERTURA de t+1 (con los precios de esa apertura). La liquidez renta el 0 %. El valor de la cartera se da a cada cierre.
// REBALANCEO POR CALENDARIO (V9.982): una transición con `calendario: 'anual' | 'trimestral' | 'mensual'` y
// `rebalancea: true` devuelve la cartera a los PESOS objetivo de su estado (estados[ID].pesos = { QQQ, ETF, LIQUIDEZ },
// suman 1) a la apertura del primer día hábil de cada año / trimestre / mes (no la del primer día del periodo). Sus ventas
// realizan plusvalías FIFO como cualquier otra. Si el estado inicial tiene pesos, la cartera se compra con esos pesos a la
// apertura del primer día (sin pesos: 100 % QQQ, como en CARTERA_1). Para planes de inversión y el editor visual.
// Ciclo: de la transición que lo inicia a la que lo termina. El MÁXIMO DE REFERENCIA (fijaMaxRef) se fija en la señal de
// entrada (el máximo de cierre de la ventana de la condición de caída) y no cambia en todo el ciclo; «superado» se marca
// con el primer cierre del QQQ por encima de él desde la entrada (incluido el día de la entrada).
// FILTRO DE TENDENCIA (V9.986, CARTERA_3): las condiciones de media admiten `evaluacion: 'semanal'` (el último cierre de cada
// semana frente a la media de `periodo` semanas; se ejecuta a la apertura del primer día de la semana siguiente); sin ella,
// diaria como siempre. Una transición por condición con `rebalancea: true` deja la cartera en los PESOS de su estado de
// llegada después de sus movimientos. `inicio: { segun: condición, si, no }` elige el estado del primer día con esa
// condición el último día evaluable ANTES del periodo (si no hay datos para la media —1999—, el estado inicial de la regla);
// si es un estado al que se entra iniciando ciclo, el ciclo está abierto desde el primer día. `medidaAzar: 'cagrPorCaida'`:
// el azar compara el CAGR / caída máxima en lugar del CAGR. La liquidez sigue rentando el 0 %.
// VERSIÓN DEL CÁLCULO (V9.988). config.calculo: sin él (los lotes congelados y todo lo guardado antes) es el CÁLCULO 1,
// que no cambia ni un byte; con calculo: 2, los IMPUESTOS SALEN DE LA CARTERA (impuestosEnCaja): el impuesto de cada año
// (plusvalías FIFO por activo, tramos del ahorro con CAPITAL_EUR, compensación de las pérdidas de los 4 años anteriores) se
// paga a la apertura del primer día hábil del año siguiente, con la liquidez y, si no basta, vendiendo QQQ y ETF a prorrata
// (esa venta también realiza plusvalía, del año nuevo). Al final del periodo se liquida todo (como comprar y mantener, que
// paga al vender al final): el valor neto es el de la curva después de impuestos menos ese último impuesto, nunca negativo.
// Las medidas principales (CAGR, caída, CAGR / caída), el azar y los criterios siguen siendo ANTES de impuestos.
// COSTE POR OPERACIÓN (V9.989, solo en el cálculo 2): config.costes = { comisionPct, comisionMinEur, horquillaPct: { QQQ,
// ETF } } (en %; por defecto COSTES_DEFECTO: media horquilla del 0,05 % y sin comisión). Cada orden de compra o de venta de
// QQQ o del ETF (la compra del primer día, las de cada transición y rebalanceo, las ventas para pagar impuestos y la venta
// final al liquidar) cuesta max(comisión % × importe, mínimo en €) —si hay comisión— más la media horquilla × importe. En
// una venta se cobra del importe vendido; en una compra, del dinero que se invierte. El coste forma parte del precio de
// adquisición o de transmisión (reduce las plusvalías). Se aplica igual al azar. Comprar y mantener QQQ y SPY, sin costes.
import { media } from './senales'
import { generador, semillaDeActivo, percentilDe } from './azar'
import { percentil as cuantil } from './robustez'
import { calcImpuestoTramos, taxStrategyCurve, taxBHCurve } from './afterTaxSim'

export const N_SIM_CARTERA = 1000
export const CAPITAL_EUR = 10000   // solo para los impuestos (los tramos dependen del importe)
const ok = (x) => typeof x === 'number' && Number.isFinite(x) && x > 0
const dias = (a, b) => (Date.parse(b) - Date.parse(a)) / 864e5

// ── Precios de rentabilidad total ──
export function preciosTotales(velas, dividendos = []) {
  const div = {}
  for (const d of dividendos) div[d.fecha] = (div[d.fecha] || 0) + d.importe
  let F = 1
  return velas.map(v => {
    if (div[v.date] && ok(v.open)) F *= 1 + div[v.date] / v.open
    return { date: v.date, open: v.open * F, close: v.close * F, factor: F }
  })
}

// ── Medias semanales (V9.986) ──
// La semana va de lunes a domingo (número de semana desde 1970). El día t cierra su semana si el siguiente día con datos es
// de otra semana (el calendario del mercado se sabe de antemano); el último dato no se da por cerrado, así que nada mira
// al futuro. La media semanal solo tiene valor en los días que cierran semana (null en el resto: ahí no se evalúa).
export const semanaDe = (fecha) => Math.floor((Date.parse(fecha) / 864e5 + 3) / 7)
export function mediaSemanal(velas, tipo, periodo) {
  const n = velas.length, m = new Array(n).fill(null), cierres = [], idx = []
  for (let t = 0; t < n - 1; t++) if (semanaDe(velas[t + 1].date) !== semanaDe(velas[t].date)) { cierres.push({ close: velas[t].close }); idx.push(t) }
  const mm = media(cierres, tipo, periodo)
  idx.forEach((t, j) => { m[t] = mm[j] })
  return m
}
const mediaDe = (velas, p) => p.evaluacion === 'semanal' ? mediaSemanal(velas, p.tipo, p.periodo) : media(velas, p.tipo, p.periodo)
const textoMedia = (p) => p.evaluacion === 'semanal' ? `cierra la semana por __ de su ${p.tipo} de ${p.periodo} semanas` : `cierra por __ de su ${p.tipo} ${p.periodo}`

// ── Condiciones (sobre los cierres del QQQ; ctx = { maxRef, superado } del ciclo) ──
const fmt = (x) => String(x).replace('.', ',')
export const CONDICIONES = {
  caidaDesdeMaximo: {
    frase: (p) => `el QQQ está, o ha estado desde el máximo de cierre de las últimas ${p.ventana ?? '…'} velas, al menos un ${p.pct == null ? '…' : fmt(p.pct)} % por debajo de ese máximo sin haberlo vuelto a superar`,
    prepara: (c, p) => {
      // M[t]: máximo de cierre de t−ventana+1 … t (el último día con ese máximo); ok[t]: el mínimo de cierre desde ese día
      // hasta t está al menos pct % por debajo de M[t]. (Ninguno lo supera: es el máximo de la ventana.)
      const n = c.length, M = new Array(n).fill(null), si = new Array(n).fill(false)
      for (let t = p.ventana - 1; t < n; t++) {
        let m = -Infinity, j = -1
        for (let i = t - p.ventana + 1; i <= t; i++) if (c[i] >= m) { m = c[i]; j = i }
        let mn = Infinity
        for (let i = j; i <= t; i++) if (c[i] < mn) mn = c[i]
        M[t] = m; si[t] = mn <= m * (1 - p.pct / 100)
      }
      return { M, si }
    },
    evalua: (pr, t) => pr.si[t], maxRef: (pr, t) => pr.M[t],
  },
  cruceMedias: {
    frase: (p) => `la ${p.tipo} ${p.rapida} del QQQ cruza por encima de la ${p.tipo} ${p.lenta}`,
    prepara: (c, p, velas) => ({ r: media(velas, p.tipo, p.rapida), l: media(velas, p.tipo, p.lenta) }),
    evalua: (pr, t) => t > 0 && pr.r[t] != null && pr.l[t] != null && pr.r[t - 1] != null && pr.l[t - 1] != null && pr.r[t] > pr.l[t] && pr.r[t - 1] <= pr.l[t - 1],
  },
  cierreBajoMedia: {
    frase: (p) => `el QQQ ${textoMedia(p).replace('__', 'debajo')}`,
    prepara: (c, p, velas) => ({ c, m: mediaDe(velas, p) }),
    evalua: (pr, t) => pr.m[t] != null && pr.c[t] < pr.m[t],
  },
  cierreSobreMedia: {
    frase: (p) => `el QQQ ${textoMedia(p).replace('__', 'encima')}`,
    prepara: (c, p, velas) => ({ c, m: mediaDe(velas, p) }),
    evalua: (pr, t) => pr.m[t] != null && pr.c[t] > pr.m[t],
  },
  haSuperadoMaxRef: { frase: () => 'el QQQ ya ha cerrado por encima del máximo de referencia desde la entrada', prepara: () => ({}), evalua: (pr, t, ctx) => !!ctx.superado },
  noHaSuperadoMaxRef: { frase: () => 'el QQQ no ha cerrado aún por encima del máximo de referencia', prepara: () => ({}), evalua: (pr, t, ctx) => !ctx.superado },
  cierreSobreMaxRef: { frase: () => 'el QQQ cierra por encima del máximo de referencia', prepara: (c) => ({ c }), evalua: (pr, t, ctx) => ctx.maxRef != null && pr.c[t] > ctx.maxRef },
}
const NOMBRE_ACTIVO = { QQQ: 'QQQ', ETF: 'el ETF', LIQUIDEZ: 'liquidez' }, A_ACTIVO = { QQQ: 'a QQQ', ETF: 'al ETF', LIQUIDEZ: 'a liquidez' }
export const fraseAccion = (h) => h.todo ? `${NOMBRE_ACTIVO[h.mover] === 'liquidez' ? 'toda la liquidez' : `todo ${NOMBRE_ACTIVO[h.mover]}`} pasa ${A_ACTIVO[h.a]}`
  : `se vende ${fmt(h.fraccionCartera * 100)} % del valor de la cartera en ${NOMBRE_ACTIVO[h.mover]} y se compra ${NOMBRE_ACTIVO[h.a]}`
export const fraseTransicion = (tr, regla = null) => tr.calendario
  ? `${tr.desde}: ${FRECUENCIAS[tr.calendario] || tr.calendario}, a la apertura, se rebalancea a sus pesos${regla?.estados?.[tr.hacia]?.pesos ? ` (${Object.entries(regla.estados[tr.hacia].pesos).filter(([, w]) => w > 0).map(([a, w]) => `${fmt(Math.round(w * 1000) / 10)} % ${a === 'ETF' ? 'ETF' : a === 'LIQUIDEZ' ? 'liquidez' : a}`).join(' + ')})` : ''}`
  : `${tr.desde} → ${tr.hacia}: si ${tr.si.map(s => CONDICIONES[s.c].frase(s)).join(' y ')}; ${[...tr.hacer.map(fraseAccion), ...(tr.rebalancea ? [`se vuelve a los pesos de ${tr.hacia}${regla?.estados?.[tr.hacia]?.pesos ? ` (${textoPesos(regla.estados[tr.hacia].pesos)})` : ''}`] : [])].join('; ')}`
    + (tr.fijaMaxRef ? ' (se fija el máximo de referencia)' : '') + (tr.terminaCiclo ? ' (fin del ciclo)' : '')

export const textoPesos = (pesos) => Object.entries(pesos).filter(([, w]) => w > 0).map(([a, w]) => `${fmt(Math.round(w * 1000) / 10)} % ${a === 'ETF' ? 'ETF' : a === 'LIQUIDEZ' ? 'liquidez' : a}`).join(' + ')
export const FRECUENCIAS = Object.freeze({ anual: 'el primer día hábil de cada año', trimestral: 'el primer día hábil de cada trimestre', mensual: 'el primer día hábil de cada mes' })
// ¿Empieza en el día b un año / trimestre / mes nuevo respecto al día a?
export function cambiaPeriodo(a, b, frecuencia) {
  if (frecuencia === 'anual') return a.slice(0, 4) !== b.slice(0, 4)
  if (frecuencia === 'mensual') return a.slice(0, 7) !== b.slice(0, 7)
  return a.slice(0, 4) !== b.slice(0, 4) || Math.floor((Number(a.slice(5, 7)) - 1) / 3) !== Math.floor((Number(b.slice(5, 7)) - 1) / 3)
}
const esCalendario = (tr) => !!tr.calendario
// Errores de una regla.
export function validaRegla(regla) {
  const e = []
  if (!regla?.estados || !regla.estados[regla.inicial]) e.push('La regla necesita sus estados y un estado inicial.')
  for (const [id, est] of Object.entries(regla?.estados || {})) if (est.pesos) {
    const ws = Object.entries(est.pesos)
    if (!ws.every(([a, w]) => ['QQQ', 'ETF', 'LIQUIDEZ'].includes(a) && typeof w === 'number' && w >= 0 && w <= 1) || Math.abs(ws.reduce((s, [, w]) => s + w, 0) - 1) > 1e-9) e.push(`Estado ${id}: los pesos tienen que ir de 0 a 100 % y sumar 100 %.`)
  }
  for (const [k, tr] of (regla?.transiciones || []).entries()) {
    if (!regla.estados?.[tr.desde] || !regla.estados?.[tr.hacia]) e.push(`Transición ${k + 1}: estado desconocido.`)
    if (esCalendario(tr) && (!FRECUENCIAS[tr.calendario] || !tr.rebalancea || !regla.estados?.[tr.hacia]?.pesos)) e.push(`Transición ${k + 1}: el rebalanceo necesita una frecuencia (anual, trimestral o mensual) y pesos en su estado.`)
    if (!esCalendario(tr) && tr.rebalancea && !regla.estados?.[tr.hacia]?.pesos) e.push(`Transición ${k + 1}: volver a los pesos necesita pesos en el estado de llegada.`)
    for (const s of tr.si || []) if (!CONDICIONES[s.c]) e.push(`Transición ${k + 1}: condición «${s.c}» desconocida.`)
    for (const h of tr.hacer || []) if (!['QQQ', 'ETF', 'LIQUIDEZ'].includes(h.mover) || !['QQQ', 'ETF', 'LIQUIDEZ'].includes(h.a) || !(h.todo || (h.fraccionCartera > 0 && h.fraccionCartera <= 1))) e.push(`Transición ${k + 1}: movimiento no válido.`)
  }
  for (const s of (regla?.transiciones || []).flatMap(t => t.si || [])) {
    if (s.c === 'caidaDesdeMaximo' && !(s.pct > 0 && s.pct < 100 && Number.isInteger(s.ventana) && s.ventana >= 2 && s.ventana <= 2000)) e.push('La caída tiene que estar entre 0 y 100 % y la ventana ser un número entero de velas.')
    if (['cierreBajoMedia', 'cierreSobreMedia'].includes(s.c) && !(Number.isInteger(s.periodo) && s.periodo >= 1 && s.periodo <= 1000 && ['EMA', 'SMA'].includes(s.tipo))) e.push('La media tiene que ser EMA o SMA con un periodo entero (de 1 a 1000).')
    if (['cierreBajoMedia', 'cierreSobreMedia'].includes(s.c) && s.evaluacion !== undefined && s.evaluacion !== 'semanal') e.push('La evaluación de la media tiene que ser diaria o semanal.')
    if (s.c === 'cruceMedias' && !(Number.isInteger(s.rapida) && Number.isInteger(s.lenta) && s.rapida < s.lenta && ['EMA', 'SMA'].includes(s.tipo))) e.push('El cruce necesita una media rápida menor que la lenta.')
  }
  const condicionales = (regla?.transiciones || []).filter(t => !esCalendario(t))
  if (condicionales.length && !condicionales.some(t => t.iniciaCiclo)) e.push('Alguna transición tiene que iniciar el ciclo.')
  if (!(regla?.transiciones || []).length) e.push('La regla necesita al menos una transición.')
  if (regla?.inicio) {
    const s = regla.inicio.segun
    if (!s || !['cierreBajoMedia', 'cierreSobreMedia'].includes(s.c) || !regla.estados?.[regla.inicio.si] || !regla.estados?.[regla.inicio.no]) e.push('El inicio necesita una condición de media y dos estados.')
    else if (!(Number.isInteger(s.periodo) && s.periodo >= 1 && s.periodo <= 1000 && ['EMA', 'SMA'].includes(s.tipo) && (s.evaluacion === undefined || s.evaluacion === 'semanal'))) e.push('La media del inicio no es válida.')
    if (!regla.estados?.[regla.inicio.si]?.pesos || !regla.estados?.[regla.inicio.no]?.pesos) e.push('Los dos estados del inicio necesitan pesos (la compra del primer día).')
  }
  if (regla?.medidaAzar !== undefined && regla.medidaAzar !== 'cagrPorCaida') e.push('La medida del azar tiene que ser el CAGR (por defecto) o el CAGR / caída máxima.')
  return e
}
// ¿Elige momentos? (si no tiene transiciones por condición, no hay nada que comparar con el azar)
export const eligeMomentos = (regla) => (regla?.transiciones || []).some(t => !esCalendario(t))

// Las condiciones preparadas de una regla sobre las velas (precio) del QQQ, una vez.
export function preparaRegla(regla, velasQqq) {
  const c = velasQqq.map(v => v.close)
  const out = regla.transiciones.map(tr => (tr.si || []).map(s => ({ s, pr: CONDICIONES[s.c].prepara(c, s, velasQqq) })))
  if (regla.inicio) out.inicio = { s: regla.inicio.segun, pr: CONDICIONES[regla.inicio.segun.c].prepara(c, regla.inicio.segun, velasQqq) }
  return out
}
// El estado del primer día de una regla con `inicio`: su condición el último día evaluable antes de i0 (con la media
// calculada); si no lo hay (sin datos para calentar la media), el estado inicial de la regla.
export function estadoDeInicio(regla, pi, i0) {
  for (let j = i0 - 1; j >= 0; j--) if (pi.pr.m[j] != null) return CONDICIONES[pi.s.c].evalua(pi.pr, j, {}) ? regla.inicio.si : regla.inicio.no
  return regla.inicial
}

// ── El motor ──
// datos: { fechas, qqq, etf (precios totales {open, close}), qqqVelas (precio, para las condiciones) }, i0 … i1 (índices).
// programa: null (lo decide la regla) o Map(día → índice de transición) (el azar: transiciones forzadas en esos días).
export const CALCULO_ACTUAL = 2
export const calculoDe = (config) => config?.calculo ?? 1
export const AÑOS_COMPENSACION = 4
export const COSTES_DEFECTO = Object.freeze({ comisionPct: 0, comisionMinEur: 0, horquillaPct: Object.freeze({ QQQ: 0.05, ETF: 0.05 }) })
export function validaCostes(c) {
  const ok = (x, max) => typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= max
  return c && ok(c.comisionPct, 5) && ok(c.comisionMinEur, 1000) && c.horquillaPct && ok(c.horquillaPct.QQQ, 5) && ok(c.horquillaPct.ETF, 5) ? [] : ['Los costes por operación no son válidos (comisión y horquilla de 0 a 5 %, mínimo de 0 a 1000 €).']
}
// El impuesto del año `anio` sobre su ganancia neta G (fracción del capital inicial; los tramos, con CAPITAL_EUR): primero
// se compensan las pérdidas netas de los AÑOS_COMPENSACION años anteriores, las más antiguas antes; las de más de 4 años
// caducan. Una G negativa queda como pérdida para los siguientes. Puro: devuelve las pérdidas que quedan.
export function liquidaAnio(perdidas, anio, G) {
  const y = Number(anio), quedan = perdidas.filter(p => p.anio >= y - AÑOS_COMPENSACION && p.resto > 1e-15).map(p => ({ ...p }))
  let compensado = 0, base = 0, impuesto = 0
  if (G > 0) {
    for (const p of quedan) { if (compensado >= G) break; const x = Math.min(p.resto, G - compensado); p.resto -= x; compensado += x }
    base = G - compensado
    impuesto = calcImpuestoTramos(base * CAPITAL_EUR) / CAPITAL_EUR
  } else if (G < 0) quedan.push({ anio: y, resto: -G })
  return { impuesto, compensado, base, perdidas: quedan.filter(p => p.resto > 1e-15) }
}
export function simula({ datos, regla, preparadas = null, i0, i1, programa = null, detalle = true, impuestosEnCaja = false, costes = null }) {
  const { fechas, qqq, etf } = datos
  const prep = programa ? null : (preparadas || preparaRegla(regla, datos.qqqVelas))
  const precio = (a, i, campo) => a === 'QQQ' ? qqq[i][campo] : a === 'ETF' ? etf[i][campo] : 1
  // Estado del primer día: el inicial de la regla; con `inicio`, el que diga su condición antes del periodo (el azar empieza
  // siempre en el inicial de la regla).
  const inicial = !programa && regla.inicio ? estadoDeInicio(regla, prep.inicio, i0) : regla.inicial
  // Compra inicial: con los pesos del estado inicial si los tiene; si no, 100 % QQQ.
  const w0 = regla.estados[inicial]?.pesos
  const h = w0 ? { QQQ: (w0.QQQ || 0) / qqq[i0].open, ETF: (w0.ETF || 0) / (etf[i0]?.open || 1), LIQUIDEZ: w0.LIQUIDEZ || 0 } : { QQQ: 1 / qqq[i0].open, ETF: 0, LIQUIDEZ: 0 }
  const lotes = { QQQ: h.QQQ > 0 ? [{ u: h.QQQ, coste: qqq[i0].open }] : [], ETF: h.ETF > 0 ? [{ u: h.ETF, coste: etf[i0].open }] : [] }, ganancias = {}, operaciones = []
  let rebalanceos = 0, diasConEtf = 0, diasConLiquidez = 0
  if (!w0) lotes.QQQ[0].coste = 1 / h.QQQ   // como siempre (CARTERA_1)
  // ── Costes por operación (V9.989; null en el cálculo 1) ──
  const cst = costes ? { com: costes.comisionPct / 100, min: costes.comisionMinEur / CAPITAL_EUR, h: { QQQ: costes.horquillaPct.QQQ / 100, ETF: costes.horquillaPct.ETF / 100 } } : null
  let costePagado = 0, ordenes = 0
  const costeOrden = (a, X) => { if (!cst || a === 'LIQUIDEZ' || !(X > 0)) return 0; ordenes++; const c = (cst.com > 0 || cst.min > 0 ? Math.max(cst.com * X, cst.min) : 0) + X * cst.h[a]; costePagado += c; return c }
  // Compra de `a` con el dinero C a la apertura del día i: lo que queda tras el coste compra participaciones; el precio de
  // adquisición del lote incluye el coste.
  const compra = (a, C, i) => { const c = costeOrden(a, C); if (!(C - c > 0)) return; const u = (C - c) / precio(a, i, 'open'); h[a] += u; lotes[a].push({ u, coste: C / u }) }
  if (cst) {   // la compra del primer día, con su coste
    const ws = w0 || { QQQ: 1 }
    h.QQQ = 0; h.ETF = 0; lotes.QQQ = []; lotes.ETF = []; h.LIQUIDEZ = ws.LIQUIDEZ || 0
    for (const a of ['QQQ', 'ETF']) if (ws[a] > 0) compra(a, ws[a], i0)
  }
  let estado = inicial, pendiente = null, ctx = { maxRef: null, superado: false }, ciclo = null
  const ciclos = [], curva = detalle ? [] : null, estados = detalle ? [] : null
  let valor = 1, picoV = 1, caidaV = 0
  // Si empieza en un estado al que se entra iniciando ciclo (FUERA), el ciclo está abierto desde el primer día; para el azar,
  // como si esa transición se hubiera hecho el primer día.
  if (inicial !== regla.inicial) {
    const kIni = regla.transiciones.findIndex(t => t.iniciaCiclo && t.hacia === inicial)
    if (kIni >= 0) ciclo = { inicio: fechas[i0], iInicio: i0, valorInicio: 1, maxRef: null, eventos: [], programa: [{ desfase: 0, k: kIni }], alInicio: true }
  }
  const vende = (a, u, i) => {   // FIFO: ganancia realizada (en fracción del capital inicial) del año
    if (a === 'LIQUIDEZ' || !(u > 0)) return
    const p = precio(a, i, 'open'), anio = fechas[i].slice(0, 4)
    let resto = u
    while (resto > 1e-15 && lotes[a].length) {
      const l = lotes[a][0], x = Math.min(resto, l.u)
      ganancias[anio] = (ganancias[anio] || 0) + x * (p - l.coste)
      l.u -= x; resto -= x
      if (l.u <= 1e-15) lotes[a].shift()
    }
  }
  // ── Impuestos en caja (cálculo 2) ──
  const fiscal = impuestosEnCaja ? { perdidas: [], porAnio: [], pagado: 0 } : null
  // El impuesto (en fracción del capital inicial) de la ganancia G del año `anio`, compensando las pérdidas de los
  // AÑOS_COMPENSACION años anteriores (las más antiguas primero); una pérdida neta del año queda para los siguientes.
  const liquida = (anio, G, pagoEl) => {
    const x = liquidaAnio(fiscal.perdidas, anio, G)
    fiscal.perdidas = x.perdidas
    fiscal.porAnio.push({ anio, plusvalia: G * CAPITAL_EUR, compensado: x.compensado * CAPITAL_EUR, base: x.base * CAPITAL_EUR, impuesto: x.impuesto * CAPITAL_EUR, pagadoEl: pagoEl })
    return x.impuesto
  }
  // Paga T a la apertura del día i: primero la liquidez; el resto, vendiendo QQQ y ETF a prorrata de su valor.
  const paga = (T, i) => {
    if (!(T > 0)) return
    const deCaja = Math.min(T, h.LIQUIDEZ)
    h.LIQUIDEZ -= deCaja
    let resto = T - deCaja
    const vQ = h.QQQ * qqq[i].open, vE = h.ETF * (etf[i]?.open || 0), tot = vQ + vE
    if (resto > 0 && tot > 0 && cst) {
      // Con costes, se vende algo más para que lo cobrado (menos el coste de la venta) cubra el impuesto.
      const hm = (vQ * cst.h.QQQ + vE * cst.h.ETF) / tot, f = Math.min(1, resto / (tot * Math.max(1e-9, 1 - hm - cst.com)) + (cst.min > 0 ? 2 * cst.min / tot : 0))
      let cobrado = 0
      for (const a of ['QQQ', 'ETF']) { const u = h[a] * f; if (u > 0) { const X = u * precio(a, i, 'open'), c = costeOrden(a, X); vende(a, u, i); ganancias[fechas[i].slice(0, 4)] = (ganancias[fechas[i].slice(0, 4)] || 0) - c; h[a] = Math.max(0, h[a] - u); cobrado += X - c } }
      h.LIQUIDEZ += Math.max(0, cobrado - resto); resto = Math.max(0, resto - cobrado)
    } else if (resto > 0 && tot > 0) {
      const f = Math.min(1, resto / tot)
      for (const a of ['QQQ', 'ETF']) { const u = h[a] * f; if (u > 0) { vende(a, u, i); h[a] = Math.max(0, h[a] - u) } }
      resto -= f * tot
    }
    fiscal.pagado += T - Math.max(0, resto)
  }
  const ejecuta = (k, i) => {
    const tr = regla.transiciones[k], val = (a) => a === 'LIQUIDEZ' ? h.LIQUIDEZ : h[a] * precio(a, i, 'open')
    const total = val('QQQ') + val('ETF') + val('LIQUIDEZ')
    for (const m of tr.hacer) {
      const importe = Math.min(m.todo ? val(m.mover) : m.fraccionCartera * total, val(m.mover))
      if (!(importe > 0)) continue
      const uVende = m.mover === 'LIQUIDEZ' ? importe : importe / precio(m.mover, i, 'open')
      vende(m.mover, uVende, i)
      h[m.mover] = Math.max(0, h[m.mover] - uVende)
      if (cst) {   // cálculo 2 con costes: la venta cobra su coste (y reduce la plusvalía); la compra, el suyo
        const cv = costeOrden(m.mover, importe), neto = importe - cv
        if (cv) ganancias[fechas[i].slice(0, 4)] = (ganancias[fechas[i].slice(0, 4)] || 0) - cv
        if (m.a === 'LIQUIDEZ') h.LIQUIDEZ += neto; else compra(m.a, neto, i)
        continue
      }
      if (m.a === 'LIQUIDEZ') h.LIQUIDEZ += importe
      else { const u = importe / precio(m.a, i, 'open'); h[m.a] += u; lotes[m.a].push({ u, coste: precio(m.a, i, 'open') }) }
    }
    if (tr.rebalancea && !esCalendario(tr)) aPesos(regla.estados[tr.hacia].pesos, i)
    if (detalle) operaciones.push({ fecha: fechas[i], de: estado, a: tr.hacia })
    if (tr.iniciaCiclo) { ciclo = { inicio: fechas[i], iInicio: i, valorInicio: total, maxRef: pendiente?.maxRef ?? null, eventos: [], programa: [] }; ctx = { maxRef: ciclo.maxRef, superado: false } }
    if (ciclo) { ciclo.eventos.push({ fecha: fechas[i], de: estado, a: tr.hacia }); ciclo.programa.push({ desfase: i - ciclo.iInicio, k }) }
    estado = tr.hacia
    if (tr.terminaCiclo && ciclo) {
      const v = val('QQQ') + val('ETF') + val('LIQUIDEZ')
      ciclos.push({ ...ciclo, fin: fechas[i], iFin: i, valorFin: v, rentabilidad: v / ciclo.valorInicio - 1, abierto: false }); ciclo = null; ctx = { maxRef: null, superado: false }
    }
  }
  // Rebalanceo a los pesos del estado `hacia` a la apertura del día i: primero se vende lo que sobra (FIFO), luego se compra
  // lo que falta con lo vendido. Diferencias por debajo de 1e-12 del total no se tocan (con un peso del 100 % no hay venta).
  const aPesos = (pesos, i) => {
    const val = (a) => a === 'LIQUIDEZ' ? h.LIQUIDEZ : h[a] * precio(a, i, 'open')
    const total = val('QQQ') + val('ETF') + val('LIQUIDEZ'), objetivo = (a) => (pesos[a] || 0) * total
    let caja = 0, hubo = false
    if (cst) {   // cálculo 2 con costes: cada venta y cada compra pagan el suyo
      for (const a of ['QQQ', 'ETF', 'LIQUIDEZ']) { const sobra = val(a) - objetivo(a); if (sobra > 1e-12 * total) { const u = a === 'LIQUIDEZ' ? sobra : sobra / precio(a, i, 'open'); vende(a, u, i); h[a] = Math.max(0, h[a] - u); const c = costeOrden(a, sobra); if (c) ganancias[fechas[i].slice(0, 4)] = (ganancias[fechas[i].slice(0, 4)] || 0) - c; caja += sobra - c; hubo = true } }
      for (const a of ['QQQ', 'ETF', 'LIQUIDEZ']) { const falta = objetivo(a) - val(a); if (falta > 1e-12 * total && caja > 0) { const x = Math.min(falta, caja); if (a === 'LIQUIDEZ') h.LIQUIDEZ += x; else compra(a, x, i); caja -= x } }
      if (caja > 0) h.LIQUIDEZ += caja
      return hubo
    }
    for (const a of ['QQQ', 'ETF', 'LIQUIDEZ']) { const sobra = val(a) - objetivo(a); if (sobra > 1e-12 * total) { const u = a === 'LIQUIDEZ' ? sobra : sobra / precio(a, i, 'open'); vende(a, u, i); h[a] = Math.max(0, h[a] - u); caja += sobra; hubo = true } }
    for (const a of ['QQQ', 'ETF', 'LIQUIDEZ']) { const falta = objetivo(a) - val(a); if (falta > 1e-12 * total && caja > 0) { const x = Math.min(falta, caja); if (a === 'LIQUIDEZ') h.LIQUIDEZ += x; else { const u = x / precio(a, i, 'open'); h[a] += u; lotes[a].push({ u, coste: precio(a, i, 'open') }) } caja -= x } }
    return hubo
  }
  const rebalancea = (tr, i) => {
    const hubo = aPesos(regla.estados[tr.hacia].pesos, i)
    if (hubo) { rebalanceos++; if (detalle) operaciones.push({ fecha: fechas[i], de: estado, a: tr.hacia, rebalanceo: true }) }
    estado = tr.hacia
  }
  const calendario = regla.transiciones.filter(esCalendario)
  const diasEstado = {}
  for (let i = i0; i <= i1; i++) {
    if (fiscal && i > i0 && fechas[i].slice(0, 4) !== fechas[i - 1].slice(0, 4)) { const y = fechas[i - 1].slice(0, 4); paga(liquida(y, ganancias[y] || 0, fechas[i]), i) }
    if (programa) { const k = programa.get(i); if (k != null) { pendiente = { k }; } }
    if (pendiente) { ejecuta(pendiente.k, i); pendiente = null }
    if (i > i0) for (const tr of calendario) if ((tr.desde === estado || tr.desde === '*') && cambiaPeriodo(fechas[i - 1], fechas[i], tr.calendario)) { rebalancea(tr, i); break }
    valor = h.QQQ * qqq[i].close + h.ETF * (etf[i]?.close || 0) + h.LIQUIDEZ
    if (valor > picoV) picoV = valor; else if (valor / picoV - 1 < caidaV) caidaV = valor / picoV - 1
    diasEstado[estado] = (diasEstado[estado] || 0) + 1
    if (h.ETF > 0) diasConEtf++
    if (h.LIQUIDEZ > 0) diasConLiquidez++
    if (detalle) { curva.push(valor); estados.push(estado) }
    if (ciclo && ctx.maxRef != null && datos.qqqVelas[i].close > ctx.maxRef) ctx.superado = true
    if (!programa && i < i1) {
      for (let k = 0; k < regla.transiciones.length; k++) {
        const tr = regla.transiciones[k]
        if (tr.desde !== estado || esCalendario(tr)) continue
        if (prep[k].every(({ s, pr }) => CONDICIONES[s.c].evalua(pr, i, ctx))) {
          const cMax = prep[k].find(x => CONDICIONES[x.s.c].maxRef)
          pendiente = { k, maxRef: tr.fijaMaxRef && cMax ? CONDICIONES[cMax.s.c].maxRef(cMax.pr, i) : null }
          break
        }
      }
    }
  }
  if (ciclo) ciclos.push({ ...ciclo, fin: null, iFin: i1, valorFin: valor, rentabilidad: valor / ciclo.valorInicio - 1, abierto: true })
  // Cálculo 2: liquidación final (se vende todo al último cierre): la ganancia realizada del último año más la latente.
  if (fiscal) {
    const y = fechas[i1].slice(0, 4)
    let latente = 0, costeVentaFinal = 0
    for (const a of ['QQQ', 'ETF']) for (const l of lotes[a]) latente += l.u * ((a === 'QQQ' ? qqq[i1].close : etf[i1]?.close || 0) - l.coste)
    // Con costes, la venta final también paga el suyo (sin contarlo entre las operaciones del periodo).
    if (cst) for (const a of ['QQQ', 'ETF']) { const X = h[a] * (a === 'QQQ' ? qqq[i1].close : etf[i1]?.close || 0); if (X > 0) costeVentaFinal += (cst.com > 0 || cst.min > 0 ? Math.max(cst.com * X, cst.min) : 0) + X * cst.h[a] }
    const impFinal = liquida(y, (ganancias[y] || 0) + latente - costeVentaFinal, 'al final (venta de todo)')
    fiscal.final = { latente, impuesto: impFinal, costeVenta: costeVentaFinal, valorNeto: Math.max(0, valor - costeVentaFinal - impFinal) }
  }
  return { valorFinal: valor, curva, estados, ciclos, operaciones, ganancias, diasEstado, dias: i1 - i0 + 1, rebalanceos, diasConEtf, diasConLiquidez, caidaMaxima: caidaV, inicial, ...(fiscal ? { fiscal } : {}),
    ...(cst ? { costes: { pagado: costePagado, ordenes } } : {}) }
}
// Cálculo 2: los impuestos de una regla en caja (otra simulación de la misma regla, pagando los impuestos de la cartera).
// refQqq: comprar y mantener QQQ (paga una sola vez, al vender al final: igual que en el cálculo 1).
export function impuestosEnCajaDe({ datos, regla, preparadas = null, i0, i1, refQqq = null, puntos = null, costes = null }) {
  const { fechas } = datos
  const r = simula({ datos, regla, preparadas, i0, i1, impuestosEnCaja: true, costes }), f = r.fiscal
  const txBh = refQqq ? taxBHCurve(refQqq.map((v, j) => ({ date: fechas[i0 + j], value: v * CAPITAL_EUR })), CAPITAL_EUR) : null
  const anios = (dias(fechas[i0], fechas[i1]) + 1) / 365.25
  return { calculo: 2, capital: CAPITAL_EUR, plusvaliasPorAnio: f.porAnio, pagadoDuranteEuros: f.pagado * CAPITAL_EUR, impuestoFinal: f.final.impuesto * CAPITAL_EUR,
    totalPagado: (f.pagado + f.final.impuesto) * CAPITAL_EUR, valorFinalNeto: f.final.valorNeto * CAPITAL_EUR, cagrNeto: f.final.valorNeto > 0 ? Math.pow(f.final.valorNeto, 1 / anios) - 1 : -1,
    ...(txBh ? { qqqTotalPagado: txBh.totalTax, qqqValorFinalNeto: txBh.curve[txBh.curve.length - 1].value } : {}),
    ...(puntos ? { curvaNeta: puntos.map(j => Math.round(r.curva[j] * 1e5) / 1e5) } : {}) }
}

// ── Mezcla con filtro de tendencia (V9.986, CARTERA_3) ──
// DENTRO: 50 % QQQ + 50 % ETF, rebalanceo anual a 50/50. DENTRO → FUERA si el QQQ cierra por debajo de su SMA (diaria o
// semanal); FUERA → DENTRO si cierra por encima, volviendo a 50/50. Alcance «apalancado»: al salir, el ETF pasa a liquidez
// (FUERA = QQQ + liquidez; si el periodo empieza fuera, 50 % QQQ + 50 % liquidez); alcance «todo»: todo a liquidez. La
// liquidez renta el 0 %. Cada periodo empieza DENTRO o FUERA según la media el último día evaluable antes del periodo.
export const ALCANCES = Object.freeze({ apalancado: 'solo el apalancado (el ETF pasa a liquidez; el QQQ se queda)', todo: 'todo (QQQ y ETF pasan a liquidez)' })
export const EVALUACIONES = Object.freeze({ diario: 'diaria (cierre de cada día)', semanal: 'semanal (último cierre de la semana)' })
const mediaFiltro = (periodo, evaluacion) => ({ tipo: 'SMA', periodo, ...(evaluacion === 'semanal' ? { evaluacion: 'semanal' } : {}) })
export function reglaFiltro(periodo = 200, evaluacion = 'diario', alcance = 'apalancado') {
  const m = mediaFiltro(periodo, evaluacion), todo = alcance === 'todo'
  return {
    id: 'filtro', nombre: 'Mezcla con filtro de tendencia', inicial: 'DENTRO', filtro: { periodo, evaluacion, alcance }, medidaAzar: 'cagrPorCaida',
    inicio: { segun: { c: 'cierreSobreMedia', ...m }, si: 'DENTRO', no: 'FUERA' },
    estados: {
      DENTRO: { nombre: 'Dentro', composicion: '50 % QQQ + 50 % ETF (rebalanceo anual a 50/50)', pesos: { QQQ: 0.5, ETF: 0.5 } },
      FUERA: todo ? { nombre: 'Fuera', composicion: '100 % liquidez al 0 %', pesos: { LIQUIDEZ: 1 } }
        : { nombre: 'Fuera', composicion: 'el QQQ + el valor del ETF en liquidez al 0 % (si el periodo empieza fuera: 50 % QQQ + 50 % liquidez)', pesos: { QQQ: 0.5, LIQUIDEZ: 0.5 } },
    },
    transiciones: [
      { desde: 'DENTRO', hacia: 'DENTRO', calendario: 'anual', rebalancea: true },
      { desde: 'DENTRO', hacia: 'FUERA', si: [{ c: 'cierreBajoMedia', ...m }], hacer: todo ? [{ mover: 'ETF', a: 'LIQUIDEZ', todo: true }, { mover: 'QQQ', a: 'LIQUIDEZ', todo: true }] : [{ mover: 'ETF', a: 'LIQUIDEZ', todo: true }], iniciaCiclo: true },
      { desde: 'FUERA', hacia: 'DENTRO', si: [{ c: 'cierreSobreMedia', ...m }], hacer: [], rebalancea: true, terminaCiclo: true },
    ],
  }
}
// Referencia «QQQ con el mismo filtro sin apalancar»: 100 % QQQ ↔ 100 % liquidez con la misma media.
export function reglaFiltroQqq(periodo = 200, evaluacion = 'diario') {
  const m = mediaFiltro(periodo, evaluacion)
  return {
    id: 'filtroQqq', nombre: 'QQQ con el mismo filtro sin apalancar', inicial: 'DENTRO', inicio: { segun: { c: 'cierreSobreMedia', ...m }, si: 'DENTRO', no: 'FUERA' },
    estados: { DENTRO: { nombre: 'Dentro', composicion: '100 % QQQ', pesos: { QQQ: 1 } }, FUERA: { nombre: 'Fuera', composicion: '100 % liquidez al 0 %', pesos: { LIQUIDEZ: 1 } } },
    transiciones: [
      { desde: 'DENTRO', hacia: 'FUERA', si: [{ c: 'cierreBajoMedia', ...m }], hacer: [{ mover: 'QQQ', a: 'LIQUIDEZ', todo: true }], iniciaCiclo: true },
      { desde: 'FUERA', hacia: 'DENTRO', si: [{ c: 'cierreSobreMedia', ...m }], hacer: [], rebalancea: true, terminaCiclo: true },
    ],
  }
}
// La mezcla 50/50 sin filtro con rebalanceo anual (la de la prueba de estrés).
const MEZCLA_50 = { id: 'mezcla', nombre: 'Mezcla fija', inicial: 'MEZCLA', estados: { MEZCLA: { nombre: 'Mezcla', composicion: '50 % QQQ + 50 % ETF (rebalanceo anual)', pesos: { QQQ: 0.5, ETF: 0.5 } } },
  transiciones: [{ desde: 'MEZCLA', hacia: 'MEZCLA', calendario: 'anual', rebalancea: true }] }

// Tiempo bajo el agua de la caída máxima de una curva (valores a cada cierre desde i0): del pico al valle y del pico a volver
// a él (días naturales), o «sin recuperar» con los días hasta el final.
export function bajoAgua(fechas, curva, i0) {
  let pico = 0, iPico = 0, caida = 0, p = 0, v = 0
  for (let j = 0; j < curva.length; j++) { if (curva[j] > curva[pico]) pico = j; const d = curva[j] / curva[pico] - 1; if (d < caida) { caida = d; p = pico; v = j } iPico = pico }
  if (caida === 0) return { caida: 0, pico: null, valle: null, recuperacion: null, recuperado: true, dias: 0 }
  let r = -1
  for (let j = v + 1; j < curva.length; j++) if (curva[j] >= curva[p]) { r = j; break }
  const dias = (a, b) => Math.round((Date.parse(fechas[i0 + b]) - Date.parse(fechas[i0 + a])) / 864e5)
  return { caida, pico: fechas[i0 + p], valle: fechas[i0 + v], recuperacion: r >= 0 ? fechas[i0 + r] : null, recuperado: r >= 0, dias: r >= 0 ? dias(p, r) : null, diasHastaElFinal: r >= 0 ? null : dias(p, curva.length - 1) }
}
// Lo mismo sin lo que se deduce (la caída, «recuperado») ni los campos vacíos, para los resúmenes que se guardan.
export function bajoAguaCorto(fechas, curva, i0) {
  const { caida, recuperado, ...ba } = bajoAgua(fechas, curva, i0)
  if (ba.diasHastaElFinal == null) delete ba.diasHastaElFinal
  if (ba.recuperacion == null) delete ba.dias
  return ba
}

// ── Referencias ──
export function compraMantiene(serie, i0, i1) { const u = 1 / serie[i0].open, out = []; for (let i = i0; i <= i1; i++) out.push(u * serie[i].close); return out }
// 50 % QQQ + 50 % ETF, rebalanceada a la apertura del primer día hábil de cada año (y al empezar).
export function mitadMitad(fechas, qqq, etf, i0, i1) {
  let uq = 0.5 / qqq[i0].open, ue = 0.5 / etf[i0].open
  const out = []
  for (let i = i0; i <= i1; i++) {
    if (i > i0 && fechas[i].slice(0, 4) !== fechas[i - 1].slice(0, 4)) { const v = uq * qqq[i].open + ue * etf[i].open; uq = v / 2 / qqq[i].open; ue = v / 2 / etf[i].open }
    out.push(uq * qqq[i].close + ue * etf[i].close)
  }
  return out
}

// ── Medidas de una curva (valores a cada cierre, empezando en 1 a la primera apertura) ──
export function medidas(fechas, curva, i0) {
  const n = curva.length, anios = (dias(fechas[i0], fechas[i0 + n - 1]) + 1) / 365.25
  const cagr = Math.pow(curva[n - 1], 1 / anios) - 1
  let pico = 1, caida = 0, fCaida = null, fPico = fechas[i0], fPicoCaida = null
  for (let j = 0; j < n; j++) {
    if (curva[j] > pico) { pico = curva[j]; fPico = fechas[i0 + j] }
    const d = curva[j] / pico - 1
    if (d < caida) { caida = d; fCaida = fechas[i0 + j]; fPicoCaida = fPico }
  }
  const porAnio = {}
  let prev = 1
  for (let j = 0; j < n; j++) {
    const a = fechas[i0 + j].slice(0, 4)
    if (j === n - 1 || fechas[i0 + j + 1].slice(0, 4) !== a) { porAnio[a] = curva[j] / prev - 1; prev = curva[j] }
  }
  const peor = Object.entries(porAnio).sort((x, y) => x[1] - y[1])[0]
  return { cagr, valorFinal: curva[n - 1], caidaMaxima: caida, fechaCaida: fCaida, fechaPicoCaida: fPicoCaida, cagrPorCaida: caida < 0 ? cagr / -caida : null,
    peorAnio: peor ? { anio: peor[0], rentabilidad: peor[1] } : null, porAnio }
}

// ── Azar: los ciclos reales como bloques en fechas de inicio al azar ──
// Cada ciclo es un bloque (su secuencia de transiciones con los mismos desfases) que ocupa de su día de entrada al de su
// última transición; el siguiente bloque empieza como pronto el día después (como en lo real: la señal de un ciclo nuevo
// llega al cierre del día en que el anterior vuelve a NORMAL). Un ciclo abierto al final del periodo se coloca entero y, si
// no llega al final, se cierra a la fuerza al acabar su duración (todo a QQQ, a la apertura de ese día). Todas las
// colocaciones dentro de [i0+1, i1] son igual de probables: orden al azar de los bloques y huecos al azar (k barras entre
// R + k, con R = días libres), que no dependen del orden. Fuera de los bloques, 100 % QQQ.
export function programaAzar(ciclos, i0, i1, rnd, nTrans) {
  const k = ciclos.length
  if (!k) return new Map()
  const L = ciclos.map(c => c.iFin - c.iInicio), occ = L.map(x => x + 1), a = i0 + 1, R = (i1 - a + 1) - occ.reduce((s, x) => s + x, 0)
  if (R < 0) return null
  const orden = ciclos.map((_, j) => j)
  for (let j = k - 1; j > 0; j--) { const m = Math.floor(rnd() * (j + 1)); [orden[j], orden[m]] = [orden[m], orden[j]] }
  const N = R + k, barras = new Set()
  for (let j = N - k; j < N; j++) { const x = Math.floor(rnd() * (j + 1)); barras.add(barras.has(x) ? j : x) }
  const bs = [...barras].sort((x, y) => x - y), prog = new Map()
  let s = a + bs[0]
  for (let j = 0; j < k; j++) {
    const c = ciclos[orden[j]]
    for (const p of c.programa) prog.set(s + p.desfase, p.k)
    if (c.abierto && s + L[orden[j]] < i1) prog.set(s + L[orden[j]], nTrans)   // cierre forzado
    if (j < k - 1) s += occ[orden[j]] + (bs[j + 1] - bs[j] - 1)
  }
  return prog
}
// La regla con una transición más al final: el cierre forzado (todo a QQQ) que usa el azar con los ciclos abiertos.
const conCierreForzado = (regla) => ({ ...regla, transiciones: [...regla.transiciones, { desde: '*', hacia: regla.inicial, si: [], terminaCiclo: true,
  hacer: [{ mover: 'ETF', a: 'QQQ', todo: true }, { mover: 'LIQUIDEZ', a: 'QQQ', todo: true }] }] })

// Impuestos de una simulación (FIFO por activo; los tramos y la compensación de la app, lib/afterTaxSim.js) con CAPITAL_EUR.
export function impuestosDe(real, fechas, i0, refQqq) {
  const gan = Object.fromEntries(Object.entries(real.ganancias).map(([a, g]) => [a, g * CAPITAL_EUR]))
  const tx = taxStrategyCurve(real.curva.map((v, j) => ({ date: fechas[i0 + j], value: v * CAPITAL_EUR })), gan, CAPITAL_EUR)
  const txBh = refQqq ? taxBHCurve(refQqq.map((v, j) => ({ date: fechas[i0 + j], value: v * CAPITAL_EUR })), CAPITAL_EUR) : null
  return { capital: CAPITAL_EUR, plusvaliasPorAnio: Object.entries(gan).sort().map(([anio, g]) => ({ anio, plusvalia: g, impuestoSinCompensar: calcImpuestoTramos(g) })),
    totalPagado: tx.totalTax, valorFinalNeto: tx.curve[tx.curve.length - 1].value, ...(txBh ? { qqqTotalPagado: txBh.totalTax, qqqValorFinalNeto: txBh.curve[txBh.curve.length - 1].value } : {}) }
}
export const SIN_AZAR = 'sin azar: no hay momentos que elegir'

// Un periodo completo. datos: { fechas, qqq, etf, spy (totales), qqqVelas }; periodo { desde, hasta, total? }.
// comparaCon: { nombre, regla } (opcional): otra regla sobre los mismos datos y periodo, para comparar (CARTERA_2 frente a
// V3 / V4 de CARTERA_1), con sus medidas e impuestos.
export function ejecutaPeriodoCartera({ datos, regla, periodo, nSim = N_SIM_CARTERA, semilla = 0, preparadas = null, puntosCurva = 5, comparaCon = null, calculo = 1, costes = null }) {
  const cs = calculo === 2 ? costes : null   // los costes por operación solo existen en el cálculo 2
  const { fechas } = datos
  const i0 = fechas.findIndex(f => f >= periodo.desde), i1 = fechas.reduce((m, f, i) => f <= periodo.hasta ? i : m, -1)
  if (i0 < 0 || i1 <= i0) throw new Error(`Sin datos para ${periodo.desde} → ${periodo.hasta}.`)
  if (!datos.etf[i0] || !datos.spy[i0]) throw new Error(`El ETF o el SPY no tienen datos al empezar ${periodo.desde}.`)
  const prep = preparadas || preparaRegla(regla, datos.qqqVelas)
  const real = simula({ datos, regla, preparadas: prep, i0, i1, costes: cs })
  const m = medidas(fechas, real.curva, i0)
  const refQqq = compraMantiene(datos.qqq, i0, i1), refMix = mitadMitad(fechas, datos.qqq, datos.etf, i0, i1), refSpy = compraMantiene(datos.spy, i0, i1)
  const mq = medidas(fechas, refQqq, i0), mm = medidas(fechas, refMix, i0), ms = medidas(fechas, refSpy, i0)
  // Azar. Con el filtro de tendencia, los bloques son los periodos FUERA reales; uno abierto al final se cierra con la propia
  // vuelta a DENTRO (no con el cierre forzado a QQQ), y la medida es el CAGR / caída máxima.
  const esFiltro = !!regla.inicio, porCaida = regla.medidaAzar === 'cagrPorCaida'
  const rf = esFiltro ? regla : conCierreForzado(regla), kCierre = esFiltro ? regla.transiciones.findIndex(t => t.terminaCiclo) : rf.transiciones.length - 1
  const rnd = generador(semillaDeActivo(semilla, `cartera|${periodo.desde}|${periodo.hasta}`))
  const anios = (dias(fechas[i0], fechas[i1]) + 1) / 365.25, cagrs = []
  let imposibles = 0
  if (real.ciclos.length) for (let s = 0; s < nSim; s++) {
    const prog = programaAzar(real.ciclos, i0, i1, rnd, kCierre)
    if (!prog) { imposibles++; continue }
    const r = simula({ datos, regla: rf, i0, i1, programa: prog, detalle: false, costes: cs }), cg = Math.pow(r.valorFinal, 1 / anios) - 1
    cagrs.push(porCaida ? (r.caidaMaxima < 0 ? cg / -r.caidaMaxima : cg > 0 ? Infinity : cg) : cg)
  }
  const azar = !eligeMomentos(regla) ? { nSim: 0, semilla, media: null, p5: null, p95: null, percentil: null, imposibles: 0, nota: SIN_AZAR }
    : real.ciclos.length ? { nSim, semilla, media: cuantil(cagrs, 0.5), p5: cuantil(cagrs, 0.05), p95: cuantil(cagrs, 0.95), percentil: percentilDe(cagrs, porCaida ? m.cagrPorCaida : m.cagr), imposibles, ...(porCaida ? { medida: 'cagrPorCaida' } : {}) }
    : { nSim: 0, semilla, media: null, p5: null, p95: null, percentil: null, imposibles: 0, nota: 'sin ciclos: no hay nada que colocar al azar' }
  const impuestos = impuestosDe(real, fechas, i0, refQqq)
  let comparacion = null
  if (comparaCon) {
    const rc = simula({ datos, regla: comparaCon.regla, i0, i1, costes: cs }), mc = medidas(fechas, rc.curva, i0), ic = impuestosDe(rc, fechas, i0, null)
    comparacion = { nombre: comparaCon.nombre, cagr: mc.cagr, caidaMaxima: mc.caidaMaxima, fechaCaida: mc.fechaCaida, cagrPorCaida: mc.cagrPorCaida, peorAnio: mc.peorAnio, ciclos: rc.ciclos.length,
      impuestosPagados: ic.totalPagado, valorFinalNeto: ic.valorFinalNeto, supera: m.cagr > mc.cagr }
  }
  // Curva reducida (un punto cada `puntosCurva` velas y el último) para la pantalla.
  const idx = []; for (let j = 0; j < real.curva.length; j += puntosCurva) idx.push(j); if (idx[idx.length - 1] !== real.curva.length - 1) idx.push(real.curva.length - 1)
  const r5 = (x) => Math.round(x * 1e5) / 1e5
  const n = i1 - i0 + 1
  // Cálculo 2: impuestos en caja (la curva neta, el valor neto y lo pagado salen de otra simulación que los paga).
  const c2 = calculo === 2
  let imp = impuestos, curvaNeta = null
  if (c2) {
    imp = impuestosEnCajaDe({ datos, regla, preparadas: prep, i0, i1, refQqq, puntos: idx, costes: cs }); curvaNeta = imp.curvaNeta; delete imp.curvaNeta
    if (comparacion) { const ic2 = impuestosEnCajaDe({ datos, regla: comparaCon.regla, i0, i1, costes: cs }); comparacion = { ...comparacion, impuestosPagados: ic2.totalPagado, valorFinalNeto: ic2.valorFinalNeto } }
  }
  const conCostes = real.costes ? { costes: { pagados: real.costes.pagado * CAPITAL_EUR, operaciones: real.costes.ordenes } } : {}
  if (esFiltro) return { prueba: 'cartera', ...(c2 ? { calculo: 2 } : {}), ...conCostes, desde: periodo.desde, hasta: periodo.hasta, total: !!periodo.total, fechaIni: fechas[i0], fechaFin: fechas[i1], dias: n,
    ...filtroPeriodo({ datos, regla, periodo, i0, i1, real, m, refQqq, refSpy, mq, ms, impuestos: imp, prep, idx, r5, c2, curvaNeta, costes: cs }), azar }
  return {
    prueba: 'cartera', desde: periodo.desde, hasta: periodo.hasta, total: !!periodo.total, fechaIni: fechas[i0], fechaFin: fechas[i1], dias: n,
    ...m, ciclos: real.ciclos.length, operaciones: real.operaciones.length,
    tiempoApalancado: (real.diasEstado.APALANCADO || 0) / n, tiempoLiquidez: (real.diasEstado.ESPERA || 0) / n,
    tiempoConEtf: real.diasConEtf / n, tiempoConLiquidez: real.diasConLiquidez / n, rebalanceos: real.rebalanceos, comparacion,
    tablaCiclos: real.ciclos.map(c => ({ inicio: c.inicio, fin: c.fin, abierto: c.abierto, maxRef: c.maxRef, rentabilidad: c.rentabilidad,
      entradasEtf: c.eventos.filter(e => e.a === 'APALANCADO').map(e => e.fecha), salidasEtf: c.eventos.filter(e => e.de === 'APALANCADO').map(e => e.fecha) })),
    referencias: { qqq: mq, mitad: mm, spy: ms },
    supera: { qqq: m.cagr > mq.cagr, mitad: m.cagr > mm.cagr, spy: m.cagr > ms.cagr },
    azar, impuestos: imp,
    curva: { fechas: idx.map(j => fechas[i0 + j]), estrategia: idx.map(j => r5(real.curva[j])), qqq: idx.map(j => r5(refQqq[j])), mitad: idx.map(j => r5(refMix[j])), spy: idx.map(j => r5(refSpy[j])), ...(curvaNeta ? { neta: curvaNeta } : {}) },
    ...(c2 ? { calculo: 2 } : {}), ...conCostes,
  }
}

// Lo propio de un periodo con el filtro de tendencia: las medidas de la cartera y de las cuatro referencias (mezcla 50/50 sin
// filtro, comprar y mantener QQQ, SPY y el QQQ con el mismo filtro sin apalancar) con su tiempo bajo el agua y su valor neto;
// el tiempo FUERA, las salidas y entradas, los 15 periodos FUERA más largos y, en el periodo total, la tabla año a año.
const MAX_CICLOS_FILTRO = 15
function filtroPeriodo({ datos, regla, periodo, i0, i1, real, m, refQqq, refSpy, mq, ms, impuestos, prep, idx, r5, c2 = false, curvaNeta = null, costes = null }) {
  const { fechas } = datos, n = i1 - i0 + 1, f = regla.filtro || {}
  const rm = simula({ datos, regla: MEZCLA_50, i0, i1, costes }), rq = simula({ datos, regla: reglaFiltroQqq(f.periodo, f.evaluacion), i0, i1, costes })
  const mm = medidas(fechas, rm.curva, i0), mf = medidas(fechas, rq.curva, i0), im = c2 ? impuestosEnCajaDe({ datos, regla: MEZCLA_50, i0, i1, costes }) : impuestosDe(rm, fechas, i0, null), iq = c2 ? impuestosEnCajaDe({ datos, regla: reglaFiltroQqq(f.periodo, f.evaluacion), i0, i1, costes }) : impuestosDe(rq, fechas, i0, null)
  const ref = (x, curva, neto, extra = {}) => ({ cagr: x.cagr, caidaMaxima: x.caidaMaxima, cagrPorCaida: x.cagrPorCaida, peorAnio: x.peorAnio, bajoAgua: bajoAguaCorto(fechas, curva, i0), valorFinalNeto: neto, ...extra })
  const cambios = (r, de, a) => r.operaciones.filter(o => !o.rebalanceo && o.de === de && o.a === a).length
  let mediaDesde = null
  for (let j = 0; j < n; j++) if (prep.inicio.pr.m[i0 + j] != null) { mediaDesde = fechas[i0 + j]; break }
  const largos = [...real.ciclos].sort((a, b) => (b.iFin - b.iInicio) - (a.iFin - a.iInicio)).slice(0, MAX_CICLOS_FILTRO).sort((a, b) => a.iInicio - b.iInicio)
  const out = {
    cagr: m.cagr, valorFinal: m.valorFinal, caidaMaxima: m.caidaMaxima, fechaCaida: m.fechaCaida, fechaPicoCaida: m.fechaPicoCaida, cagrPorCaida: m.cagrPorCaida, peorAnio: m.peorAnio,
    bajoAgua: bajoAguaCorto(fechas, real.curva, i0), ciclos: real.ciclos.length, operaciones: real.operaciones.length, rebalanceos: real.rebalanceos,
    tiempoConEtf: real.diasConEtf / n, tiempoConLiquidez: real.diasConLiquidez / n,
    filtro: { periodo: f.periodo, evaluacion: f.evaluacion, alcance: f.alcance, empiezaFuera: real.inicial === 'FUERA', mediaDesde, tiempoFuera: (real.diasEstado.FUERA || 0) / n,
      salidas: cambios(real, 'DENTRO', 'FUERA'), entradas: cambios(real, 'FUERA', 'DENTRO') },
    tablaCiclos: largos.map(c => ({ inicio: c.inicio, fin: c.fin, abierto: c.abierto, dias: c.iFin - c.iInicio, rentabilidad: c.rentabilidad })),
    referencias: { mitad: ref(mm, rm.curva, im.valorFinalNeto), qqq: ref(mq, refQqq, impuestos.qqqValorFinalNeto), spy: ref(ms, refSpy, null),
      qqqFiltro: ref(mf, rq.curva, iq.valorFinalNeto, { tiempoFuera: (rq.diasEstado.FUERA || 0) / n, salidas: cambios(rq, 'DENTRO', 'FUERA'), entradas: cambios(rq, 'FUERA', 'DENTRO') }) },
    supera: { qqq: m.cagr > mq.cagr, mitad: m.cagr > mm.cagr, spy: m.cagr > ms.cagr },
    mejoraMezcla: m.cagrPorCaida != null && mm.cagrPorCaida != null && m.cagrPorCaida > mm.cagrPorCaida,
    impuestos,
    curva: { fechas: idx.map(j => fechas[i0 + j]), estrategia: idx.map(j => r5(real.curva[j])), qqq: idx.map(j => r5(refQqq[j])), mitad: idx.map(j => r5(rm.curva[j])), spy: idx.map(j => r5(refSpy[j])), ...(curvaNeta ? { neta: curvaNeta } : {}) },
  }
  if (periodo.total) {
    const qf = mf.porAnio, ms2 = medidas(fechas, refSpy, i0).porAnio
    out.anioAnio = Object.keys(m.porAnio).map(a => ({ anio: a, cartera: m.porAnio[a], mezcla: mm.porAnio[a], qqq: mq.porAnio[a], spy: ms2[a], qqqFiltro: qf[a] }))
  }
  return out
}

// La curva con menos puntos (para guardar el resumen en lab_pruebas por debajo de 50 KB).
export function reduceCurva(curva, cada = 4) {
  if (!curva?.fechas) return curva
  const idx = []; for (let j = 0; j < curva.fechas.length; j += cada) idx.push(j); if (idx[idx.length - 1] !== curva.fechas.length - 1) idx.push(curva.fechas.length - 1)
  return Object.fromEntries(Object.entries(curva).map(([k, v]) => [k, idx.map(j => v[j])]))
}

// Datos alineados por fecha (el calendario del QQQ) a partir de las velas de la caché y los dividendos.
export function alineaDatos({ qqq, etf, spy }, dividendos) {
  const tq = preciosTotales(qqq, dividendos.QQQ), porFecha = (vs, divs) => { const t = preciosTotales(vs, divs); return Object.fromEntries(t.map(x => [x.date, x])) }
  const te = porFecha(etf.velas, dividendos[etf.simbolo]), ts = porFecha(spy, dividendos.SPY)
  return { fechas: qqq.map(v => v.date), qqqVelas: qqq, qqq: tq, etf: qqq.map(v => te[v.date] || null), spy: qqq.map(v => ts[v.date] || null) }
}
