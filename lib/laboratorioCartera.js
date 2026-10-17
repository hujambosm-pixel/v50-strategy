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
    frase: (p) => `el QQQ cierra por debajo de su ${p.tipo} ${p.periodo}`,
    prepara: (c, p, velas) => ({ c, m: media(velas, p.tipo, p.periodo) }),
    evalua: (pr, t) => pr.m[t] != null && pr.c[t] < pr.m[t],
  },
  cierreSobreMedia: {
    frase: (p) => `el QQQ cierra por encima de su ${p.tipo} ${p.periodo}`,
    prepara: (c, p, velas) => ({ c, m: media(velas, p.tipo, p.periodo) }),
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
  : `${tr.desde} → ${tr.hacia}: si ${tr.si.map(s => CONDICIONES[s.c].frase(s)).join(' y ')}; ${tr.hacer.map(fraseAccion).join('; ')}`
    + (tr.fijaMaxRef ? ' (se fija el máximo de referencia)' : '') + (tr.terminaCiclo ? ' (fin del ciclo)' : '')

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
    for (const s of tr.si || []) if (!CONDICIONES[s.c]) e.push(`Transición ${k + 1}: condición «${s.c}» desconocida.`)
    for (const h of tr.hacer || []) if (!['QQQ', 'ETF', 'LIQUIDEZ'].includes(h.mover) || !['QQQ', 'ETF', 'LIQUIDEZ'].includes(h.a) || !(h.todo || (h.fraccionCartera > 0 && h.fraccionCartera <= 1))) e.push(`Transición ${k + 1}: movimiento no válido.`)
  }
  for (const s of (regla?.transiciones || []).flatMap(t => t.si || [])) {
    if (s.c === 'caidaDesdeMaximo' && !(s.pct > 0 && s.pct < 100 && Number.isInteger(s.ventana) && s.ventana >= 2 && s.ventana <= 2000)) e.push('La caída tiene que estar entre 0 y 100 % y la ventana ser un número entero de velas.')
    if (['cierreBajoMedia', 'cierreSobreMedia'].includes(s.c) && !(Number.isInteger(s.periodo) && s.periodo >= 1 && ['EMA', 'SMA'].includes(s.tipo))) e.push('La media tiene que ser EMA o SMA con un periodo entero.')
    if (s.c === 'cruceMedias' && !(Number.isInteger(s.rapida) && Number.isInteger(s.lenta) && s.rapida < s.lenta && ['EMA', 'SMA'].includes(s.tipo))) e.push('El cruce necesita una media rápida menor que la lenta.')
  }
  const condicionales = (regla?.transiciones || []).filter(t => !esCalendario(t))
  if (condicionales.length && !condicionales.some(t => t.iniciaCiclo)) e.push('Alguna transición tiene que iniciar el ciclo.')
  if (!(regla?.transiciones || []).length) e.push('La regla necesita al menos una transición.')
  return e
}
// ¿Elige momentos? (si no tiene transiciones por condición, no hay nada que comparar con el azar)
export const eligeMomentos = (regla) => (regla?.transiciones || []).some(t => !esCalendario(t))

// Las condiciones preparadas de una regla sobre las velas (precio) del QQQ, una vez.
export function preparaRegla(regla, velasQqq) {
  const c = velasQqq.map(v => v.close)
  return regla.transiciones.map(tr => (tr.si || []).map(s => ({ s, pr: CONDICIONES[s.c].prepara(c, s, velasQqq) })))
}

// ── El motor ──
// datos: { fechas, qqq, etf (precios totales {open, close}), qqqVelas (precio, para las condiciones) }, i0 … i1 (índices).
// programa: null (lo decide la regla) o Map(día → índice de transición) (el azar: transiciones forzadas en esos días).
export function simula({ datos, regla, preparadas = null, i0, i1, programa = null, detalle = true }) {
  const { fechas, qqq, etf } = datos
  const prep = programa ? null : (preparadas || preparaRegla(regla, datos.qqqVelas))
  const precio = (a, i, campo) => a === 'QQQ' ? qqq[i][campo] : a === 'ETF' ? etf[i][campo] : 1
  // Compra inicial: con los pesos del estado inicial si los tiene; si no, 100 % QQQ.
  const w0 = regla.estados[regla.inicial]?.pesos
  const h = w0 ? { QQQ: (w0.QQQ || 0) / qqq[i0].open, ETF: (w0.ETF || 0) / (etf[i0]?.open || 1), LIQUIDEZ: w0.LIQUIDEZ || 0 } : { QQQ: 1 / qqq[i0].open, ETF: 0, LIQUIDEZ: 0 }
  const lotes = { QQQ: h.QQQ > 0 ? [{ u: h.QQQ, coste: qqq[i0].open }] : [], ETF: h.ETF > 0 ? [{ u: h.ETF, coste: etf[i0].open }] : [] }, ganancias = {}, operaciones = []
  let rebalanceos = 0, diasConEtf = 0, diasConLiquidez = 0
  if (!w0) lotes.QQQ[0].coste = 1 / h.QQQ   // como siempre (CARTERA_1)
  let estado = regla.inicial, pendiente = null, ctx = { maxRef: null, superado: false }, ciclo = null
  const ciclos = [], curva = detalle ? [] : null, estados = detalle ? [] : null
  let valor = 1
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
  const ejecuta = (k, i) => {
    const tr = regla.transiciones[k], val = (a) => a === 'LIQUIDEZ' ? h.LIQUIDEZ : h[a] * precio(a, i, 'open')
    const total = val('QQQ') + val('ETF') + val('LIQUIDEZ')
    for (const m of tr.hacer) {
      const importe = Math.min(m.todo ? val(m.mover) : m.fraccionCartera * total, val(m.mover))
      if (!(importe > 0)) continue
      const uVende = m.mover === 'LIQUIDEZ' ? importe : importe / precio(m.mover, i, 'open')
      vende(m.mover, uVende, i)
      h[m.mover] = Math.max(0, h[m.mover] - uVende)
      if (m.a === 'LIQUIDEZ') h.LIQUIDEZ += importe
      else { const u = importe / precio(m.a, i, 'open'); h[m.a] += u; lotes[m.a].push({ u, coste: precio(m.a, i, 'open') }) }
    }
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
  const rebalancea = (tr, i) => {
    const pesos = regla.estados[tr.hacia].pesos, val = (a) => a === 'LIQUIDEZ' ? h.LIQUIDEZ : h[a] * precio(a, i, 'open')
    const total = val('QQQ') + val('ETF') + val('LIQUIDEZ'), objetivo = (a) => (pesos[a] || 0) * total
    let caja = 0, hubo = false
    for (const a of ['QQQ', 'ETF', 'LIQUIDEZ']) { const sobra = val(a) - objetivo(a); if (sobra > 1e-12 * total) { const u = a === 'LIQUIDEZ' ? sobra : sobra / precio(a, i, 'open'); vende(a, u, i); h[a] = Math.max(0, h[a] - u); caja += sobra; hubo = true } }
    for (const a of ['QQQ', 'ETF', 'LIQUIDEZ']) { const falta = objetivo(a) - val(a); if (falta > 1e-12 * total && caja > 0) { const x = Math.min(falta, caja); if (a === 'LIQUIDEZ') h.LIQUIDEZ += x; else { const u = x / precio(a, i, 'open'); h[a] += u; lotes[a].push({ u, coste: precio(a, i, 'open') }) } caja -= x } }
    if (hubo) { rebalanceos++; if (detalle) operaciones.push({ fecha: fechas[i], de: estado, a: tr.hacia, rebalanceo: true }) }
    estado = tr.hacia
  }
  const calendario = regla.transiciones.filter(esCalendario)
  const diasEstado = {}
  for (let i = i0; i <= i1; i++) {
    if (programa) { const k = programa.get(i); if (k != null) { pendiente = { k }; } }
    if (pendiente) { ejecuta(pendiente.k, i); pendiente = null }
    if (i > i0) for (const tr of calendario) if ((tr.desde === estado || tr.desde === '*') && cambiaPeriodo(fechas[i - 1], fechas[i], tr.calendario)) { rebalancea(tr, i); break }
    valor = h.QQQ * qqq[i].close + h.ETF * (etf[i]?.close || 0) + h.LIQUIDEZ
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
  return { valorFinal: valor, curva, estados, ciclos, operaciones, ganancias, diasEstado, dias: i1 - i0 + 1, rebalanceos, diasConEtf, diasConLiquidez }
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
function impuestosDe(real, fechas, i0, refQqq) {
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
export function ejecutaPeriodoCartera({ datos, regla, periodo, nSim = N_SIM_CARTERA, semilla = 0, preparadas = null, puntosCurva = 5, comparaCon = null }) {
  const { fechas } = datos
  const i0 = fechas.findIndex(f => f >= periodo.desde), i1 = fechas.reduce((m, f, i) => f <= periodo.hasta ? i : m, -1)
  if (i0 < 0 || i1 <= i0) throw new Error(`Sin datos para ${periodo.desde} → ${periodo.hasta}.`)
  if (!datos.etf[i0] || !datos.spy[i0]) throw new Error(`El ETF o el SPY no tienen datos al empezar ${periodo.desde}.`)
  const prep = preparadas || preparaRegla(regla, datos.qqqVelas)
  const real = simula({ datos, regla, preparadas: prep, i0, i1 })
  const m = medidas(fechas, real.curva, i0)
  const refQqq = compraMantiene(datos.qqq, i0, i1), refMix = mitadMitad(fechas, datos.qqq, datos.etf, i0, i1), refSpy = compraMantiene(datos.spy, i0, i1)
  const mq = medidas(fechas, refQqq, i0), mm = medidas(fechas, refMix, i0), ms = medidas(fechas, refSpy, i0)
  // Azar.
  const rf = conCierreForzado(regla), rnd = generador(semillaDeActivo(semilla, `cartera|${periodo.desde}|${periodo.hasta}`))
  const anios = (dias(fechas[i0], fechas[i1]) + 1) / 365.25, cagrs = []
  let imposibles = 0
  if (real.ciclos.length) for (let s = 0; s < nSim; s++) {
    const prog = programaAzar(real.ciclos, i0, i1, rnd, rf.transiciones.length - 1)
    if (!prog) { imposibles++; continue }
    const r = simula({ datos, regla: rf, i0, i1, programa: prog, detalle: false })
    cagrs.push(Math.pow(r.valorFinal, 1 / anios) - 1)
  }
  const azar = !eligeMomentos(regla) ? { nSim: 0, semilla, media: null, p5: null, p95: null, percentil: null, imposibles: 0, nota: SIN_AZAR }
    : real.ciclos.length ? { nSim, semilla, media: cuantil(cagrs, 0.5), p5: cuantil(cagrs, 0.05), p95: cuantil(cagrs, 0.95), percentil: percentilDe(cagrs, m.cagr), imposibles }
    : { nSim: 0, semilla, media: null, p5: null, p95: null, percentil: null, imposibles: 0, nota: 'sin ciclos: no hay nada que colocar al azar' }
  const impuestos = impuestosDe(real, fechas, i0, refQqq)
  let comparacion = null
  if (comparaCon) {
    const rc = simula({ datos, regla: comparaCon.regla, i0, i1 }), mc = medidas(fechas, rc.curva, i0), ic = impuestosDe(rc, fechas, i0, null)
    comparacion = { nombre: comparaCon.nombre, cagr: mc.cagr, caidaMaxima: mc.caidaMaxima, fechaCaida: mc.fechaCaida, cagrPorCaida: mc.cagrPorCaida, peorAnio: mc.peorAnio, ciclos: rc.ciclos.length,
      impuestosPagados: ic.totalPagado, valorFinalNeto: ic.valorFinalNeto, supera: m.cagr > mc.cagr }
  }
  // Curva reducida (un punto cada `puntosCurva` velas y el último) para la pantalla.
  const idx = []; for (let j = 0; j < real.curva.length; j += puntosCurva) idx.push(j); if (idx[idx.length - 1] !== real.curva.length - 1) idx.push(real.curva.length - 1)
  const r5 = (x) => Math.round(x * 1e5) / 1e5
  const n = i1 - i0 + 1
  return {
    prueba: 'cartera', desde: periodo.desde, hasta: periodo.hasta, total: !!periodo.total, fechaIni: fechas[i0], fechaFin: fechas[i1], dias: n,
    ...m, ciclos: real.ciclos.length, operaciones: real.operaciones.length,
    tiempoApalancado: (real.diasEstado.APALANCADO || 0) / n, tiempoLiquidez: (real.diasEstado.ESPERA || 0) / n,
    tiempoConEtf: real.diasConEtf / n, tiempoConLiquidez: real.diasConLiquidez / n, rebalanceos: real.rebalanceos, comparacion,
    tablaCiclos: real.ciclos.map(c => ({ inicio: c.inicio, fin: c.fin, abierto: c.abierto, maxRef: c.maxRef, rentabilidad: c.rentabilidad,
      entradasEtf: c.eventos.filter(e => e.a === 'APALANCADO').map(e => e.fecha), salidasEtf: c.eventos.filter(e => e.de === 'APALANCADO').map(e => e.fecha) })),
    referencias: { qqq: mq, mitad: mm, spy: ms },
    supera: { qqq: m.cagr > mq.cagr, mitad: m.cagr > mm.cagr, spy: m.cagr > ms.cagr },
    azar, impuestos,
    curva: { fechas: idx.map(j => fechas[i0 + j]), estrategia: idx.map(j => r5(real.curva[j])), qqq: idx.map(j => r5(refQqq[j])), mitad: idx.map(j => r5(refMix[j])), spy: idx.map(j => r5(refSpy[j])) },
  }
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
