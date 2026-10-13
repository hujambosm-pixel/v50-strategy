// lib/edge.js — «Calidad de las entradas (Edge Ratio)»: ¿las entradas de la combinación van más a favor que en contra,
// y más que entrar al azar en los mismos activos y fechas? Mide solo las ENTRADAS: no depende de cómo se sale.
// Posprocesado puro sobre las mismas operaciones y velas que la prueba contra el azar (lib/azar.js).
//
// Para cada entrada (precio real de entrada, huecos incluidos) y cada N de EDGE_N velas desde la de entrada (incluida):
//   MFE = máximo de los máximos − entrada (mínimo 0) · MAE = entrada − mínimo de los mínimos (mínimo 0)
// los dos divididos por el ATR14 calculado con las velas ANTERIORES a la de entrada (calcATR hasta la vela previa: sin
// mirar el futuro). Edge Ratio(N) = media(MFE/ATR) / media(MAE/ATR), juntando las entradas de todos los activos; una
// entrada sin N velas por delante no cuenta para ese N. El azar: en cada simulación, por activo, el mismo número de
// entradas en velas al azar con ATR disponible (pueden repetirse: solo se miden entradas), entrando en la apertura.
import { calcATR } from './backtester'
import { AZAR, generador, semillaDeActivo, percentilDe, veredictoAzar } from './azar'
import { mediana } from './optimizacion'
import { percentil as cuantil } from './robustez'

export const EDGE_N = [1, 3, 5, 10, 20, 40]
export const EDGE_CORTO_MAX = 5   // N ≤ 5: corto plazo (el momento de la entrada); N ≥ 10: largo (si engancha tendencias)
export const PERIODO_ATR = 14

// ATR de cada vela calculado SOLO con las anteriores: atrPrevio[i] = calcATR(...)[i − 1] (null si aún no hay).
export function atrPrevio(altos, bajos, cierra, periodo = PERIODO_ATR) {
  const atr = calcATR(altos.map((h, i) => ({ high: h, low: bajos[i], close: cierra[i] })), periodo)
  return altos.map((_, i) => i > 0 && atr[i - 1] != null && atr[i - 1] > 0 ? atr[i - 1] : null)
}

// Suma, en `acum` ({ mfe: [], mae: [], n: [] } por índice de EDGE_N), las excursiones de una entrada en la vela e al
// precio `entrada`, en ATR. Recorre una sola vez las velas e … e + Nmax − 1.
export function sumaExcursiones(acum, altos, bajos, atr, e, entrada, ns = EDGE_N) {
  const n = altos.length, a = atr[e]
  if (a == null || !(entrada > 0)) return false
  let alto = -Infinity, bajo = Infinity, k = 0
  const nMax = ns[ns.length - 1]
  for (let j = 0; j < nMax && e + j < n; j++) {
    if (altos[e + j] > alto) alto = altos[e + j]
    if (bajos[e + j] < bajo) bajo = bajos[e + j]
    while (k < ns.length && ns[k] === j + 1) {
      acum.mfe[k] += Math.max(0, alto - entrada) / a; acum.mae[k] += Math.max(0, entrada - bajo) / a; acum.n[k]++
      k++
    }
  }
  return true
}
export const acumuladorVacio = (ns = EDGE_N) => ({ mfe: ns.map(() => 0), mae: ns.map(() => 0), n: ns.map(() => 0) })
// Edge Ratio de un acumulador: media(MFE) / media(MAE) = ΣMFE / ΣMAE (las dos medias tienen el mismo número de entradas).
export const ratioDe = (acum, k) => acum.n[k] && acum.mae[k] > 0 ? acum.mfe[k] / acum.mae[k] : null

// Un activo preparado: { fechas, abre, altos, bajos, cierra, trades } → índices y precios de sus entradas reales con
// ATR, las velas válidas para el azar (con ATR) y el ATR previo.
export function preparaActivo({ fechas, abre, altos, bajos, cierra, trades }) {
  const atr = atrPrevio(altos, bajos, cierra)
  const idx = new Map(fechas.map((f, i) => [String(f).slice(0, 10), i]))
  const reales = (trades || []).filter(t => t.entryDate && idx.has(String(t.entryDate).slice(0, 10)))
    .map(t => ({ e: idx.get(String(t.entryDate).slice(0, 10)), entrada: t.entryPrice }))
    .filter(x => atr[x.e] != null && x.entrada > 0)
  const validas = []
  for (let i = 0; i < atr.length; i++) if (atr[i] != null && abre[i] > 0) validas.push(i)
  return { abre, altos, bajos, atr, reales, validas, sinAtr: (trades || []).length - reales.length }
}

// La prueba completa: activos { [sym]: { fechas, abre, altos, bajos, cierra, trades } }.
export function edgeContraAzar({ activos, nSim = AZAR.simulaciones, semilla = 0, ns = EDGE_N }) {
  const prep = Object.entries(activos).map(([sym, d]) => ({ sym, ...preparaActivo(d) })).filter(p => p.validas.length)
  const real = acumuladorVacio(ns)
  for (const p of prep) for (const x of p.reales) sumaExcursiones(real, p.altos, p.bajos, p.atr, x.e, x.entrada, ns)
  const sims = ns.map(() => new Float64Array(nSim))
  const rnds = prep.map(p => generador(semillaDeActivo(semilla, `${p.sym}|edge`)))
  for (let s = 0; s < nSim; s++) {
    const acc = acumuladorVacio(ns)
    prep.forEach((p, j) => {
      const rnd = rnds[j]
      for (let r = 0; r < p.reales.length; r++) {
        const i = p.validas[Math.floor(rnd() * p.validas.length)]
        sumaExcursiones(acc, p.altos, p.bajos, p.atr, i, p.abre[i], ns)
      }
    })
    ns.forEach((_, k) => { const v = ratioDe(acc, k); sims[k][s] = v == null ? NaN : v })
  }
  const filas = ns.map((N, k) => {
    const v = Array.from(sims[k]).filter(Number.isFinite), r = ratioDe(real, k), p = percentilDe(v, r)
    return { N, usadas: real.n[k], real: r, mediana: mediana(v), p5: cuantil(v, 0.05), p95: cuantil(v, 0.95), percentil: p, veredicto: veredictoAzar(p), sims: sims[k] }
  })
  return { nSim, filas, entradas: prep.reduce((s, p) => s + p.reales.length, 0), sinAtr: prep.reduce((s, p) => s + p.sinAtr, 0), activos: prep.length }
}
