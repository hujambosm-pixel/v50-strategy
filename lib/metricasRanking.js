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
