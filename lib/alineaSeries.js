// lib/alineaSeries.js — alinear una serie externa (un índice, otro ticker) con las fechas del activo, para los filtros del
// backtest (lib/filtros.js). Había DOS copias idénticas, en lib/backtestActivo.js y en pages/api/multibacktest.js (que
// también usa pages/api/asset-detail.js); desde V9.1008 viven aquí, movidas tal cual (docs/catalogo-condiciones.md, commit 8).
import { calcEMA } from './backtester'
import { proyectarSemanal } from './filtros'

// ── Align external close series to asset dates with forward-fill (for market filters) ──
export function buildAlignedCloses(externalData, assetDates) {
  if (!externalData?.length) return assetDates.map(()=>null)
  const closeMap = {}
  externalData.forEach(d => { closeMap[d.date] = d.close })
  const aligned = []
  let last = null
  for (const date of assetDates) {
    if (closeMap[date] != null) last = closeMap[date]
    aligned.push(last)
  }
  return aligned
}

// ── Compute EMA on native weekly series then forward-fill to daily asset dates ──
// Use this when a filter has intervalo:'semanal' — EMA is computed on the weekly series
// so periods like 200 refer to 200 weeks, not 200 daily bars.
export function buildAlignedWeekly(weeklyData, assetDates, emaPeriod) {
  if (!weeklyData?.length || !assetDates?.length)
    return { closes: assetDates.map(()=>null), ema: assetDates.map(()=>null) }
  // La regla de la última semana CERRADA (corregida en V9.709) vive ahora en proyectarSemanal, en
  // lib/filtros.js, para que no haya dos calendarios que puedan divergir. Aquí solo se preparan las
  // series semanales y se proyectan ambas con esa misma regla.
  const sorted = [...weeklyData].sort((a,b)=>a.date.localeCompare(b.date))
  const wDates  = sorted.map(d=>d.date)
  const wCloses = sorted.map(d=>d.close)
  const wEma    = calcEMA(wCloses, Math.max(1, emaPeriod))
  return {
    closes: proyectarSemanal(wCloses, wDates, assetDates),
    ema:    proyectarSemanal(wEma,    wDates, assetDates),
  }
}
