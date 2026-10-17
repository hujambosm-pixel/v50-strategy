// lib/etfSintetico.js — ETF APALANCADOS SINTÉTICOS (×2, ×3) sobre el QQQ, para la prueba de estrés 1999–2025 (antes de
// 2006 no existían QLD ni TQQQ: esto es una reconstrucción). Puro.
//
// REAJUSTE DIARIO, como los reales: rendimiento del día (cierre a cierre) = k × rendimiento del QQQ − coste del día, con
//   coste anual = comisión del ETF + (k − 1) × tipo a corto del día (DTB3, lib/tiposCortoUsd.json; el último conocido) +
//   un AJUSTE constante calibrado para que el sintético siga al real (scripts/calibraSinteticos.js → lib/etfSinteticos.json),
// repartido entre 252 días. El QQQ es el de rentabilidad total (dividendos reinvertidos, lib/laboratorioCartera.js,
// preciosTotales), y el sintético también lo es (los reales se comparan con sus repartos reinvertidos).
// APERTURA: k × el tramo cierre → apertura del QQQ sobre el cierre anterior del sintético; el cierre sale del rendimiento
// cierre a cierre (así el reajuste diario es exacto y el tramo apertura → cierre queda ≈ k × el del QQQ, menos el coste).
// El primer día: el cierre vale 100 y la apertura es la que da k × el tramo apertura → cierre del QQQ.
// Si un día el factor fuera <= 0 (una caída del QQQ mayor que 1/k), el sintético quedaría a cero: se deja en 1e-9 × y se
// marca (no ocurre con el QQQ desde 1999: su peor día es de −9 % aproximadamente).
import TIPOS from './tiposCortoUsd.json'

export const COMISION = Object.freeze({ 2: 0.0095, 3: 0.0084 })   // QLD 0,95 %; TQQQ 0,84 % (comisión anual publicada)
// El tipo a corto (fracción anual) de una fecha: el último dato de DTB3 con fecha <= la pedida (antes del primero, el primero).
export function tipoEn(fecha, tipos = TIPOS) {
  const fs = tipos.fechas
  let lo = 0, hi = fs.length - 1
  if (fecha < fs[0]) return tipos.tipos[0] / 100
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (fs[m] <= fecha) lo = m; else hi = m - 1 }
  return tipos.tipos[lo] / 100
}
// Velas del sintético a partir del QQQ de rentabilidad total ([{ date, open, close }]). k, comision y ajuste (anuales).
export function construyeSintetico(qqqTotal, { k, comision = COMISION[k] ?? 0, ajuste = 0, tipos = TIPOS, sinCostes = false } = {}) {
  const out = []
  let cPrev = 100, aCero = 0
  for (let t = 0; t < qqqTotal.length; t++) {
    const q = qqqTotal[t]
    if (t === 0) { const o = 100 / (1 + k * (q.close / q.open - 1)); out.push({ date: q.date, open: o, high: Math.max(o, 100), low: Math.min(o, 100), close: 100, volume: 0 }); continue }
    const qp = qqqTotal[t - 1], coste = sinCostes ? 0 : (comision + (k - 1) * tipoEn(q.date, tipos) + ajuste) / 252
    let fc = 1 + k * (q.close / qp.close - 1) - coste, fo = 1 + k * (q.open / qp.close - 1)
    if (!(fc > 0)) { fc = 1e-9; aCero++ } if (!(fo > 0)) fo = 1e-9
    const o = cPrev * fo, c = cPrev * fc
    out.push({ date: q.date, open: o, high: Math.max(o, c), low: Math.min(o, c), close: c, volume: 0 })
    cPrev = c
  }
  if (aCero) out.aCero = aCero
  return out
}

// ── Validación frente a un real (los dos de rentabilidad total, por fecha) ──
const porFecha = (vs) => Object.fromEntries(vs.map(v => [v.date, v]))
// Rendimientos por año natural (el primero, desde el primer cierre del tramo) y CAGR del tramo.
function anualesYCagr(vs) {
  const out = {}
  let base = vs[0].close
  for (let i = 0; i < vs.length; i++) {
    const a = vs[i].date.slice(0, 4)
    if (i === vs.length - 1 || vs[i + 1].date.slice(0, 4) !== a) { out[a] = vs[i].close / base - 1; base = vs[i].close }
  }
  const anios = (Date.parse(vs[vs.length - 1].date) - Date.parse(vs[0].date)) / 864e5 / 365.25
  return { porAnio: out, cagr: Math.pow(vs[vs.length - 1].close / vs[0].close, 1 / anios) - 1 }
}
function caidaMax(vs) {
  let pico = vs[0].close, fPico = vs[0].date, caida = 0, fP = null, fV = null
  for (const v of vs) { if (v.close > pico) { pico = v.close; fPico = v.date } const d = v.close / pico - 1; if (d < caida) { caida = d; fP = fPico; fV = v.date } }
  return { caida, pico: fP, valle: fV }
}
// real y sintetico: velas (rentabilidad total) en las mismas fechas; desde / hasta acotan el tramo.
export function valida(real, sintetico, desde, hasta) {
  const s = porFecha(sintetico), r = real.filter(v => v.date >= desde && v.date <= hasta && s[v.date]), sv = r.map(v => s[v.date])
  const ar = anualesYCagr(r), as = anualesYCagr(sv)
  const anios = Object.keys(ar.porAnio).map(a => ({ anio: a, real: ar.porAnio[a], sintetico: as.porAnio[a], diferencia: as.porAnio[a] - ar.porAnio[a] }))
  const completos = anios.filter(x => x.anio > r[0].date.slice(0, 4) || r[0].date.slice(5) <= '01-10')
  const dif = (xs) => xs.reduce((a, x) => a + x.diferencia, 0) / xs.length, difAbs = (xs) => xs.reduce((a, x) => a + Math.abs(x.diferencia), 0) / xs.length
  const rr = r.slice(1).map((v, i) => v.close / r[i].close - 1), rs = sv.slice(1).map((v, i) => v.close / sv[i].close - 1)
  const m = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length, mr = m(rr), ms = m(rs)
  const cov = rr.reduce((a, x, i) => a + (x - mr) * (rs[i] - ms), 0), vr = rr.reduce((a, x) => a + (x - mr) ** 2, 0), vs2 = rs.reduce((a, x) => a + (x - ms) ** 2, 0)
  return { desde: r[0].date, hasta: r[r.length - 1].date, dias: r.length, cagrReal: ar.cagr, cagrSintetico: as.cagr, anios,
    diferenciaMediaAnual: dif(completos), diferenciaMediaAbsoluta: difAbs(completos), aniosCompletos: completos.length,
    correlacionDiaria: cov / Math.sqrt(vr * vs2), caidaReal: caidaMax(r), caidaSintetica: caidaMax(sv) }
}
