// lib/azar.js — «Prueba contra el azar»: ¿la combinación aporta algo, o cualquier entrada en esos mismos activos y
// fechas habría dado lo mismo? Posprocesado puro: parte de las operaciones REALES de cada activo (las de /api/datos,
// la misma llamada que «Probar en backtest») y de sus velas del periodo; no ejecuta la estrategia ni toca el motor.
//
// Por activo, cada simulación coloca las k operaciones reales —mismo número y mismas duraciones en velas, en orden
// barajado— en posiciones al azar del periodo, sin solaparse: los huecos libres (n − suma de duraciones) se reparten
// al azar entre los k + 1 huecos («barras y estrellas»: todos los repartos igual de probables, sin reintentos). Cada
// operación entra en la apertura de su vela y sale en la apertura de la vela entrada + duración (o en el cierre de la
// última vela si no hay siguiente), con las mismas comisiones (netoDeOperacion) y el mismo CAGR simple del optimizador
// (cagrSimple sobre los días naturales del periodo). Global: en cada simulación, la mediana entre activos (como el
// optimizador), y el resultado real se sitúa en esa distribución.
//
// Caída máxima (V9.946): con la MISMA función para la estrategia real y para cada simulación (caidaMaxima), sobre la
// curva de capital SIMPLE (sin reinvertir, como el CAGR simple) valorada al cierre de cada vela: capital inicial +
// beneficio de las operaciones cerradas + flotante de la abierta. Puede diferir algo de la del backtest; lo que importa
// es que las dos se miden igual. Percentil de la caída = % de simulaciones que caen MÁS que la real.
import { cagrSimple } from './metricasRanking'
import { netoDeOperacion } from './comisiones'
import { mediana, media, cagrAgregable } from './optimizacion'
import { percentil as cuantil } from './robustez'

// ── Umbrales y límites (PROVISIONALES) ──────────────────────────────────────────────────────────────────────────
export const AZAR = {
  simulaciones: 1000,   // por defecto
  minSimulaciones: 100,
  maxSimulaciones: 5000,
  supera: 95,           // percentil ≥ 95 → «Supera al azar»
  algoMejor: 75,        // 75–95 → «Algo mejor que el azar, no concluyente»; < 75 → «No se distingue del azar»
  peor: 5,              // < 5 → «Peor que el azar»
  minOperaciones: 3,    // activos con menos operaciones reales: se muestran, sin veredicto propio
}

// Semilla de 32 bits a partir de un texto (FNV-1a) y generador determinista (mulberry32) en [0, 1).
export function semillaDe(texto) {
  let h = 0x811c9dc5
  for (let i = 0; i < texto.length; i++) { h ^= texto.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 }
  return h >>> 0
}
export function generador(semilla) {
  let a = semilla >>> 0
  return () => {
    a = (a + 0x6D2B79F5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const entero = (rnd, n) => Math.floor(rnd() * n)   // 0 … n − 1

// Las duraciones en velas de las operaciones reales: índice de la vela de salida − índice de la de entrada (mínimo 1),
// con las fechas de las velas del periodo. Una fecha que no esté entre las velas cae en la primera vela posterior.
export function duracionesEnVelas(trades, fechas) {
  const n = fechas.length, idx = new Map(fechas.map((f, i) => [String(f).slice(0, 10), i]))
  const posicion = (f) => {
    const k = String(f).slice(0, 10)
    if (idx.has(k)) return idx.get(k)
    let lo = 0, hi = n   // primera vela con fecha ≥ f
    while (lo < hi) { const m = (lo + hi) >> 1; if (String(fechas[m]).slice(0, 10) < k) lo = m + 1; else hi = m }
    return Math.min(lo, n - 1)
  }
  return (trades || []).filter(t => t.entryDate && t.exitDate).map(t => Math.max(1, posicion(t.exitDate) - posicion(t.entryDate)))
}

// Coloca al azar k operaciones con esas duraciones (barajadas) en n velas, sin solaparse. Devuelve [{ inicio, d }] en
// orden de tiempo: la operación ocupa las velas inicio … inicio + d − 1 y sale en la apertura de inicio + d (= n:
// cierre de la última vela). null si no caben (suma de duraciones > n).
export function colocaAlAzar(n, duraciones, rnd) {
  const k = duraciones.length, total = duraciones.reduce((s, d) => s + d, 0), libres = n - total
  if (libres < 0) return null
  const ds = [...duraciones]
  for (let i = k - 1; i > 0; i--) { const j = entero(rnd, i + 1); [ds[i], ds[j]] = [ds[j], ds[i]] }   // Fisher–Yates
  // Barras y estrellas: k posiciones distintas entre libres + k (algoritmo de Floyd), ordenadas; los huecos son las
  // estrellas entre barras consecutivas.
  const m = libres + k, elegidas = new Set()
  for (let j = m - k; j < m; j++) { const t = entero(rnd, j + 1); elegidas.add(elegidas.has(t) ? j : t) }
  const barras = [...elegidas].sort((a, b) => a - b)
  const out = []
  let vela = 0, previa = -1
  for (let i = 0; i < k; i++) {
    vela += barras[i] - previa - 1   // las estrellas (velas libres) antes de esta operación
    out.push({ inicio: vela, d: ds[i] })
    vela += ds[i]; previa = barras[i]
  }
  return out
}

// ── Curva simple y caída máxima ─────────────────────────────────────────────────────────────────────────────────────
// Una operación para la curva: { e, s, entrada, acciones, pnl } — flotante (cierre − entrada) × acciones al cierre de
// las velas e … s − 1; desde el cierre de la vela s, cerrada con su resultado neto pnl (comisiones incluidas). Con
// e = s se cierra en la misma vela. En orden de tiempo y sin solaparse.
// La curva entera (para comprobarla): valor al cierre de cada vela.
export function curvaSimple(cierra, ops, capitalIni) {
  const n = cierra.length, curva = new Array(n).fill(capitalIni)
  let cerrado = 0, j = 0
  for (let i = 0; i < n; i++) {
    while (j < ops.length && ops[j].s < i) { cerrado += ops[j].pnl; j++ }
    const o = ops[j]
    curva[i] = capitalIni + cerrado + (o && o.e <= i ? (i < o.s ? (cierra[i] - o.entrada) * o.acciones : o.pnl) : 0)
  }
  return curva
}
// Mayor caída desde un máximo previo de esa curva, en % (el máximo de partida es el capital inicial). Solo recorre las
// velas dentro de alguna operación: fuera, la curva no se mueve y no puede marcar ni máximo ni caída nuevos.
export function caidaMaxima(cierra, ops, capitalIni) {
  let cerrado = 0, pico = capitalIni, caida = 0
  for (const o of ops) {
    for (let i = o.e; i < o.s; i++) {
      const v = capitalIni + cerrado + (cierra[i] - o.entrada) * o.acciones
      if (v > pico) pico = v; else if (pico > 0 && (pico - v) / pico * 100 > caida) caida = (pico - v) / pico * 100
    }
    cerrado += o.pnl
    const v = capitalIni + cerrado
    if (v > pico) pico = v; else if (pico > 0 && (pico - v) / pico * 100 > caida) caida = (pico - v) / pico * 100
  }
  return caida
}
// Las operaciones reales como tramos de la curva (índices de vela de entrada y salida, precio y acciones de la operación).
export function tramosReales(trades, fechas) {
  const n = fechas.length, idx = new Map(fechas.map((f, i) => [String(f).slice(0, 10), i]))
  const pos = (f) => { const k = String(f).slice(0, 10); if (idx.has(k)) return idx.get(k); let i = 0; while (i < n - 1 && String(fechas[i]).slice(0, 10) < k) i++; return i }
  return (trades || []).filter(t => t.entryDate && t.exitDate).map(t => ({ e: pos(t.entryDate), s: pos(t.exitDate), entrada: t.entryPrice, acciones: t.shares, pnl: t.pnlSimple ?? 0 }))
    .sort((a, b) => a.e - b.e)
}

// El % de una operación al azar: apertura de la vela de entrada → apertura de la de salida (o cierre de la última).
export const pctAlAzar = (abre, cierra, inicio, d) => {
  const n = abre.length, entrada = abre[inicio], salida = inicio + d < n ? abre[inicio + d] : cierra[n - 1]
  return (salida / entrada - 1) * 100
}

// Un activo: { fechas, abre, cierra } (velas del periodo), trades reales (con pnlSimple), capital, comisiones.
// Devuelve { k, cagrReal, mediaReal, cagrs: Float64Array(nSim), medias: Float64Array(nSim) } o { k, error }.
export function simulaActivo({ fechas, abre, cierra, trades, capitalIni, comisiones = null, nSim = AZAR.simulaciones, semilla }) {
  const n = fechas.length, ops = (trades || []).filter(t => t.entryDate && t.exitDate), k = ops.length
  if (!n) return { k, error: 'sin velas' }
  const dias = (new Date(fechas[n - 1]) - new Date(fechas[0])) / 86400000
  const cagrReal = k ? cagrSimple(capitalIni, ops.reduce((s, t) => s + (t.pnlSimple ?? 0), 0), dias) : null
  const mediaReal = k ? media(ops.map(t => (t.pnlSimple ?? 0) / capitalIni * 100)) : null
  const reales = tramosReales(ops, fechas)
  const caidaReal = k && reales.every(o => o.entrada > 0 && Number.isFinite(o.acciones)) ? caidaMaxima(cierra, reales, capitalIni) : null
  const cagrs = new Float64Array(nSim), medias = new Float64Array(nSim), caidas = new Float64Array(nSim)
  if (!k) return { k, cagrReal, mediaReal, caidaReal, cagrs: null, medias: null, caidas: null, n }
  const duraciones = duracionesEnVelas(ops, fechas), rnd = generador(semilla)
  if (duraciones.reduce((s, d) => s + d, 0) > n) return { k, cagrReal, mediaReal, caidaReal, error: 'las duraciones no caben en el periodo' }
  for (let s = 0; s < nSim; s++) {
    let suma = 0
    const tramos = colocaAlAzar(n, duraciones, rnd).map(({ inicio, d }) => {
      const neto = netoDeOperacion(capitalIni, pctAlAzar(abre, cierra, inicio, d), comisiones)
      suma += neto.pnlNeto
      // Entra en la apertura de `inicio` con lo invertido (asignado − comisión de compra); cerrada desde el cierre de la
      // vela de salida (inicio + d), o de la última si sale en su cierre.
      return { e: inicio, s: Math.min(inicio + d, n - 1), entrada: abre[inicio], acciones: neto.capitalInvertido / abre[inicio], pnl: neto.pnlNeto }
    })
    cagrs[s] = cagrSimple(capitalIni, suma, dias); medias[s] = suma / k / capitalIni * 100; caidas[s] = caidaMaxima(cierra, tramos, capitalIni)
  }
  return { k, cagrReal, mediaReal, caidaReal, cagrs, medias, caidas, n, duraciones }
}

// Percentil del real en la distribución: % de simulaciones con resultado menor (los empates cuentan la mitad).
export function percentilDe(sims, real) {
  if (real == null || !sims?.length) return null
  let menor = 0, igual = 0
  for (const x of sims) { if (x < real) menor++; else if (x === real) igual++ }
  return (menor + igual / 2) / sims.length * 100
}
export const veredictoAzar = (p) => p == null ? null : p >= AZAR.supera ? 'supera' : p >= AZAR.algoMejor ? 'algo' : p < AZAR.peor ? 'peor' : 'igual'
export const TEXTO_VEREDICTO = { supera: 'Supera al azar', algo: 'Algo mejor que el azar, no concluyente', igual: 'No se distingue del azar', peor: 'Peor que el azar' }
// La caída: percentil = % de simulaciones que caen MÁS que la real (empates, la mitad); alto = cae menos que el azar.
export function percentilCaida(sims, real) { return real == null || !sims?.length ? null : percentilDe(Array.from(sims, x => -x), -real) }
export const TEXTO_VEREDICTO_CAIDA = { supera: 'Cae menos que el azar', algo: 'Cae algo menos, no concluyente', igual: 'Cae como el azar', peor: 'Cae más que el azar' }
export function resumenCaida(sims, real) {
  const v = sims ? Array.from(sims) : []
  const p = percentilCaida(v, real)
  return { real, mediana: mediana(v), p5: cuantil(v, 0.05), p95: cuantil(v, 0.95), percentil: p, veredicto: veredictoAzar(p) }
}
// Resumen de una distribución frente al real: mediana, P5–P95, percentil y veredicto.
export function resumenAzar(sims, real) {
  const v = sims ? Array.from(sims) : []
  const p = percentilDe(v, real)
  return { real, mediana: mediana(v), p5: cuantil(v, 0.05), p95: cuantil(v, 0.95), percentil: p, veredicto: veredictoAzar(p) }
}

// Todos los activos: { [sym]: { fechas, abre, cierra, trades } }. La semilla de cada activo sale de la base y su
// símbolo (así el orden de cálculo no importa). realGlobal: la mediana real (la del optimizador); si falta, la mediana
// de los CAGR reales de los activos con operaciones.
export function semillaDeActivo(base, sym) { return semillaDe(`${base}|${sym}`) }
export function porActivoAzar(datos, sim) {
  const sinVeredicto = !(sim.k >= AZAR.minOperaciones) || !!sim.error || !sim.cagrs
  return { k: sim.k, error: sim.error || null, sinVeredicto,
    ...resumenAzar(sim.cagrs ? Array.from(sim.cagrs, cagrAgregable) : null, cagrAgregable(sim.cagrReal)),
    mediaReal: sim.mediaReal, mediaAzar: sim.medias ? mediana(Array.from(sim.medias)) : null,
    caida: { ...resumenCaida(sim.caidas, sim.caidaReal), ...(sinVeredicto ? { veredicto: null } : {}) },
    ...(sinVeredicto ? { veredicto: null } : {}) }
}
// Global: por simulación, mediana entre los activos con operaciones de su CAGR al azar (−99 cuenta como −100).
export function combinaGlobal(sims, nSim, realGlobal = null) {
  const con = Object.values(sims).filter(s => s.cagrs && !s.error)
  const meds = new Float64Array(con.length ? nSim : 0), medsCaida = new Float64Array(meds.length), fila = new Array(con.length), filaC = new Array(con.length)
  for (let s = 0; s < meds.length; s++) {
    for (let j = 0; j < con.length; j++) { fila[j] = cagrAgregable(con[j].cagrs[s]); filaC[j] = con[j].caidas[s] }
    meds[s] = mediana(fila); medsCaida[s] = mediana(filaC)
  }
  const real = realGlobal ?? mediana(con.map(s => cagrAgregable(s.cagrReal)))
  // La caída: mediana entre activos, igual que el CAGR.
  const caida = { sims: medsCaida, ...resumenCaida(medsCaida, mediana(con.map(s => s.caidaReal))) }
  return { sims: meds, activos: con.length, ...resumenAzar(meds, real), caida }
}
export function pruebaContraAzar({ activos, capitalIni, comisiones = null, nSim = AZAR.simulaciones, semilla = 0, realGlobal = null }) {
  const sims = {}, porActivo = {}
  for (const [sym, d] of Object.entries(activos)) {
    sims[sym] = simulaActivo({ ...d, capitalIni, comisiones, nSim, semilla: semillaDeActivo(semilla, sym) })
    porActivo[sym] = porActivoAzar(d, sims[sym])
  }
  return { nSim, porActivo, global: combinaGlobal(sims, nSim, realGlobal) }
}

// Las velas y operaciones de un activo a partir de la respuesta de /api/datos (solo lo que hace falta).
export function datosDeRespuesta(j) {
  const v = (j?.chartData || []).filter(b => b?.date && b.open != null && b.close != null)
  return { fechas: v.map(b => String(b.date).slice(0, 10)), abre: v.map(b => b.open), cierra: v.map(b => b.close),
    trades: (j?.trades || []).map(t => ({ entryDate: t.entryDate, exitDate: t.exitDate, pnlSimple: t.pnlSimple, pnlPct: t.pnlPct, entryPrice: t.entryPrice, shares: t.shares })) }
}
