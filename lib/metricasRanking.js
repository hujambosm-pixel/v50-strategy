// lib/metricasRanking.js — las métricas que el ranking guarda en ranking_results para una estrategia en un
// activo, a partir del resultado de su backtest. Es la MISMA cuenta que hacía calcMetricas en el cliente
// (pages/index.js) con la respuesta de /api/datos; ahora la hace /api/ranking-activo en el servidor.
//
// r: { trades, gananciaSimple, startDate, ultimaFecha, maxDDStrategyFloat, maxDDStrategy } — los campos
//    de la respuesta de /api/datos que usaba el cliente (ultimaFecha es meta.ultimaFecha).
// cond: { capitalIni, years, minTrades } de los ajustes del ranking.
// Devuelve null si no hay operaciones o hay menos de minTrades (entonces no se escribe fila), y si no
// { winRate, cagr, robustez, maxDD, trades, profit }. cagr = -99 es el centinela de «no calculable»
// (capital final ≤ 0): upsertMetricsRemote lo guarda como null.
import { calcMetrics } from './utils'

export function metricasRanking(r, { capitalIni, years, minTrades }) {
  if (!r?.trades?.length) return null
  const trades = r.trades; if (trades.length < minTrades) return null
  const wins = trades.filter(t => t.pnlPct >= 0), winRate = (wins.length / trades.length) * 100
  const totalDiasNat = r.startDate ? (new Date(r.ultimaFecha) - new Date(r.startDate)) / 86400000 : 365 * years
  const anios = Math.max(totalDiasNat / 365.25, 0.01)
  const capFinal = capitalIni + r.gananciaSimple
  const cagr = capFinal > 0 ? (Math.pow(capFinal / capitalIni, 1 / anios) - 1) * 100 : -99
  // ROBUSTEZ: qué % de las ganancias NO depende del mejor trade. Denominador = beneficio BRUTO (suma de
  // ganadoras), siempre >= el mejor trade → cae solo en [0,100), sin clamps ni centinelas. Beneficio NETO
  // <= 0 → 0 (una estrategia perdedora no es robusta).
  const ganadoras = trades.filter(t => t.pnlSimple > 0).reduce((s, t) => s + t.pnlSimple, 0)
  const mejor = trades.length ? Math.max(...trades.map(t => t.pnlSimple)) : 0
  const robustez = ((r.gananciaSimple ?? 0) <= 0 || ganadoras <= 0) ? 0 : Math.max(0, 100 - (mejor / ganadoras) * 100)
  const maxDD = r.maxDDStrategyFloat ?? r.maxDDStrategy ?? 0
  return { winRate, cagr, robustez, maxDD, trades: trades.length, profit: r.gananciaSimple ?? null }
}

// ── Métricas del OPTIMIZADOR (/api/optimiza) ─────────────────────────────────────────────────────────────
// Las de una combinación de parámetros, con las MISMAS fórmulas que la app: las del ranking (arriba:
// CAGR, % de acierto, robustez y maxDD con flotante) y las del resumen del backtest (calcMetrics de
// lib/utils.js: beneficio y CAGR compuestos, factor de beneficio, drawdowns y tiempo invertido). Sin
// operaciones ni chartData: solo números. Con cero operaciones, lo que no existe va a null.
// r: { trades, capitalReinv, gananciaSimple, ganBH, startDate, ultimaFecha, maxDDStrategyFloat, maxDDStrategy }
//    — los campos de la respuesta de /api/datos (ultimaFecha es meta.ultimaFecha).
// porAnio: por año natural del periodo (de `desde` a `hasta`, también los años sin operaciones), las
// operaciones CERRADAS ese año (por fecha de salida) y su beneficio simple, en euros y en % del capital.
export function metricasOptimizacion(r, { capitalIni, years = 5, desde = null, hasta = null }) {
  const trades = r?.trades || []
  const rk = metricasRanking(r, { capitalIni, years, minTrades: 0 })
  const m = calcMetrics(trades, capitalIni, r.capitalReinv, r.gananciaSimple, r.ganBH, r.startDate, r.ultimaFecha, years)
  const a0 = Number(String(desde || r.startDate).slice(0, 4)), a1 = Number(String(hasta || r.ultimaFecha).slice(0, 4))
  const anios = new Map()
  if (Number.isInteger(a0) && Number.isInteger(a1)) for (let y = a0; y <= a1; y++) anios.set(y, { anio: y, operaciones: 0, beneficioSimple: 0 })
  for (const t of trades) {
    const y = Number(String(t.exitDate).slice(0, 4))
    if (!anios.has(y)) anios.set(y, { anio: y, operaciones: 0, beneficioSimple: 0 })
    const a = anios.get(y); a.operaciones++; a.beneficioSimple += t.pnlSimple
  }
  const porAnio = [...anios.values()].sort((a, b) => a.anio - b.anio)
    .map(a => ({ ...a, rentabilidadPct: (a.beneficioSimple / capitalIni) * 100 }))
  return {
    operaciones: trades.length,
    cagr: rk ? rk.cagr : null,                    // CAGR simple, como el ranking (-99 = no calculable)
    cagrCompuesto: m ? m.cagrC : null,
    beneficioSimple: r.gananciaSimple ?? 0,
    beneficioCompuesto: m ? m.ganComp : (r.capitalReinv ?? capitalIni) - capitalIni,
    maxDD: rk ? rk.maxDD : (r.maxDDStrategyFloat ?? r.maxDDStrategy ?? 0),   // con flotante, como el ranking
    ddSimple: m ? m.ddSimple : 0,
    ddCompuesto: m ? m.ddComp : 0,
    winRate: rk ? rk.winRate : null,
    factorBeneficio: m ? m.factorBen : null,      // 999 si no hay ninguna perdedora, como el resumen
    tiempoInvertidoPct: m ? m.tiempoInvPct : 0,
    robustez: rk ? rk.robustez : null,
    porAnio,
  }
}
