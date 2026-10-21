// lib/planes/medidas.js — cómo se mide un plan con APORTACIONES (docs/planes-inversion.md, §4 y decisión 6). Puro.
//
// Con dinero que entra, el CAGR de siempre no sirve (la curva sube porque entra dinero). Dos rentabilidades:
//   · TWR (ponderada por TIEMPO): la de las reglas. Un valor liquidativo (VL) por participación: el capital inicial compra
//     participaciones a VL 1 y cada aportación las compra al VL de ese momento, así que entrar dinero no mueve el VL. El
//     TWR anual es el del VL de principio a fin. Es la que da el VEREDICTO.
//   · TIR (ponderada por DINERO, XIRR): la que consigue la persona con sus flujos y sus fechas. Solo informativa.
// Caídas: en % sobre el VL (la principal), en € sobre el patrimonio (engaña: las aportaciones tapan las caídas) y frente a
// lo aportado (cuánto y cuánto tiempo estuvo el patrimonio por debajo de lo puesto). Tiempo bajo el agua del VL.

const DIA = 864e5
const dias = (a, b) => (Date.parse(b) - Date.parse(a)) / DIA
export const anios = (a, b) => dias(a, b) / 365.25

// TWR anual (en fracción) de una serie de VL [{ date, vl }].
export function twrAnual(serieVl) {
  if (!serieVl?.length) return null
  const a = serieVl[0], b = serieVl[serieVl.length - 1], t = anios(a.date, b.date)
  return t > 0 && a.vl > 0 ? Math.pow(Math.max(b.vl, 1e-12) / a.vl, 1 / t) - 1 : null
}

// TIR anual (XIRR): la tasa r con Σ flujo_k / (1 + r)^(años desde el primero) = 0. flujos: [{ fecha, importe }] con el
// signo del inversor (aportaciones negativas; el valor final, positivo). Newton desde 10 %, con respaldo por bisección en
// [−99,99 %, 1000 %]. null si no hay cambio de signo.
export function tir(flujos) {
  const fs = (flujos || []).filter(f => Number.isFinite(f.importe) && f.importe !== 0).sort((x, y) => x.fecha < y.fecha ? -1 : x.fecha > y.fecha ? 1 : 0)
  if (fs.length < 2 || !fs.some(f => f.importe < 0) || !fs.some(f => f.importe > 0)) return null
  const t0 = fs[0].fecha, ts = fs.map(f => anios(t0, f.fecha))
  const vpn = (r) => fs.reduce((s, f, k) => s + f.importe / Math.pow(1 + r, ts[k]), 0)
  const dvpn = (r) => fs.reduce((s, f, k) => s - ts[k] * f.importe / Math.pow(1 + r, ts[k] + 1), 0)
  let r = 0.1
  for (let k = 0; k < 60; k++) {
    const v = vpn(r), d = dvpn(r)
    if (!Number.isFinite(v) || !Number.isFinite(d) || d === 0) break
    const n = r - v / d
    if (!(n > -0.9999) || !Number.isFinite(n)) break
    if (Math.abs(n - r) < 1e-12) return n
    r = n
  }
  let lo = -0.9999, hi = 10, vlo = vpn(lo), vhi = vpn(hi)
  if (!Number.isFinite(vlo) || !Number.isFinite(vhi) || vlo * vhi > 0) return null
  for (let k = 0; k < 200; k++) { const m = (lo + hi) / 2, vm = vpn(m); if (vlo * vm <= 0) { hi = m } else { lo = m; vlo = vm } if (hi - lo < 1e-12) break }
  return (lo + hi) / 2
}

// Caída máxima de una serie de valores (en fracción, negativa o 0) con su pico, su valle y la recuperación (o no).
export function caidaMaxima(fechas, valores) {
  let pico = -Infinity, iPico = 0, mejor = 0, res = { caida: 0, pico: null, valle: null, recuperacion: null, dias: null, diasHastaElFinal: null }
  for (let i = 0; i < valores.length; i++) {
    if (valores[i] > pico) { pico = valores[i]; iPico = i }
    const dd = pico > 0 ? valores[i] / pico - 1 : 0
    if (dd < mejor) { mejor = dd; res = { caida: dd, pico: fechas[iPico], valle: fechas[i], iPico, iValle: i } }
  }
  if (res.pico) {
    let r = -1
    for (let i = res.iValle; i < valores.length; i++) if (valores[i] >= valores[res.iPico]) { r = i; break }
    res = { caida: res.caida, pico: res.pico, valle: res.valle, recuperacion: r >= 0 ? fechas[r] : null, dias: r >= 0 ? dias(res.pico, fechas[r]) : null, diasHastaElFinal: r >= 0 ? null : dias(res.pico, fechas[fechas.length - 1]) }
  }
  return res
}
// La mayor caída en EUROS del patrimonio (pico a valle) y en qué fechas.
export function caidaEuros(fechas, patrimonio) {
  let pico = -Infinity, iPico = 0, peor = 0, res = { euros: 0, pico: null, valle: null }
  for (let i = 0; i < patrimonio.length; i++) {
    if (patrimonio[i] > pico) { pico = patrimonio[i]; iPico = i }
    if (patrimonio[i] - pico < peor) { peor = patrimonio[i] - pico; res = { euros: peor, pico: fechas[iPico], valle: fechas[i] } }
  }
  return res
}
// Frente a lo aportado: el peor momento (patrimonio − aportado hasta ese día, en € y en % de lo aportado) y los días
// naturales con el patrimonio por debajo de lo puesto (en total y el tramo más largo).
export function frenteAportado(fechas, patrimonio, aportado) {
  let peor = 0, peorPct = 0, fechaPeor = null, diasDebajo = 0, tramo = 0, tramoMax = 0, inicioTramo = null, tramoMaxDesde = null
  for (let i = 0; i < patrimonio.length; i++) {
    const d = patrimonio[i] - aportado[i]
    if (d < peor) { peor = d; peorPct = aportado[i] > 0 ? d / aportado[i] : 0; fechaPeor = fechas[i] }
    const paso = i + 1 < fechas.length ? dias(fechas[i], fechas[i + 1]) : 1
    if (d < 0) { if (tramo === 0) inicioTramo = fechas[i]; tramo += paso; diasDebajo += paso; if (tramo > tramoMax) { tramoMax = tramo; tramoMaxDesde = inicioTramo } } else tramo = 0
  }
  return { peorEuros: peor, peorPct, fecha: fechaPeor, diasDebajo, tramoMasLargo: tramoMax, tramoMasLargoDesde: tramoMaxDesde }
}
// Rentabilidad de cada año natural por TWR (del VL) y lo que cambió el patrimonio ese año descontando lo aportado.
export function porAnio(serie) {
  const out = []
  let ant = null
  for (const p of serie) {
    const y = p.date.slice(0, 4)
    if (!ant || ant.y !== y) { if (ant) out.push(ant); ant = { y, vl0: ant ? ant.vlFin : p.vl, pat0: ant ? ant.patFin : p.patrimonio - p.aportadoHoy, aport0: ant ? ant.aportFin : p.aportado - p.aportadoHoy } }
    ant.vlFin = p.vl; ant.patFin = p.patrimonio; ant.aportFin = p.aportado
  }
  if (ant) out.push(ant)
  return out.map(a => ({ anio: a.y, twr: a.vl0 > 0 ? a.vlFin / a.vl0 - 1 : null, euros: (a.patFin - a.pat0) - (a.aportFin - a.aport0) }))
}

// Todas las medidas de una ejecución. serie: [{ date, vl, patrimonio, aportado, aportadoHoy }]; flujos: los del inversor;
// valorNeto: lo que queda al liquidar todo al final (tras costes e impuestos).
export function medidasPlan({ serie, flujos, valorNeto, impuestosPagados = 0, costesPagados = 0 }) {
  if (!serie?.length) return null
  const fechas = serie.map(p => p.date), vl = serie.map(p => p.vl), pat = serie.map(p => p.patrimonio), apo = serie.map(p => p.aportado)
  const ultimo = serie[serie.length - 1]
  // El VL empieza en 1 a la APERTURA del primer día (cuando entra el capital): sin aportaciones, el TWR es el CAGR de siempre
  // (de la primera apertura al último cierre). El VL tras liquidar: el último × (valor neto / patrimonio), para el TWR neto.
  const inicio = { date: fechas[0], vl: 1 }
  const vlNeto = ultimo.patrimonio > 0 ? ultimo.vl * (valorNeto / ultimo.patrimonio) : 0
  const conNeto = [inicio, ...serie.slice(0, -1).map(p => ({ date: p.date, vl: p.vl })), { date: ultimo.date, vl: vlNeto }]
  const anuales = porAnio(serie)
  const peor = anuales.filter(a => a.twr != null).reduce((m, a) => (m == null || a.twr < m.twr ? a : m), null)
  return {
    desde: fechas[0], hasta: ultimo.date, anios: anios(fechas[0], ultimo.date),
    aportado: ultimo.aportado, patrimonio: ultimo.patrimonio, valorNeto, ganancia: valorNeto - ultimo.aportado,
    twr: twrAnual([inicio, ...serie.map(p => ({ date: p.date, vl: p.vl }))]), twrNeto: twrAnual(conNeto),
    tir: tir([...flujos, { fecha: ultimo.date, importe: valorNeto }]),
    caida: caidaMaxima([fechas[0], ...fechas], [1, ...vl]), caidaEuros: caidaEuros(fechas, pat), frenteAportado: frenteAportado(fechas, pat, apo),
    peorAnio: peor ? { anio: peor.anio, twr: peor.twr } : null, porAnio: anuales,
    impuestosPagados, costesPagados,
  }
}
