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
// r: { trades, capitalReinv, gananciaSimple, ganBH, startDate, ultimaFecha, maxDDStrategyFloat, maxDDStrategy, barras }
//    — los campos de la respuesta de /api/datos (ultimaFecha es meta.ultimaFecha); `barras`, las velas del periodo.
// porAnio: ver resultadoPorAnio (lo ganado DENTRO de cada año, con las posiciones abiertas valoradas al cierre
// del año) y, como dato secundario, las operaciones CERRADAS ese año y su beneficio.
// ── Año a año, VALORADO A FIN DE AÑO ────────────────────────────────────────────────────────────────────────
// Antes cada operación contaba entera en el año en que se CERRABA: en semanal, una operación abierta en 2016 y
// cerrada en 2018 ponía en 2018 todo lo ganado en tres años. Ahora cada año refleja lo ganado o perdido DENTRO
// de él: el valor de la cuenta (modo simple) al cierre de la última vela de cada año, menos el del año anterior.
//   valor(fin de año) = capital inicial + beneficio de las operaciones cerradas hasta esa vela
//                       + Σ (cierre de esa vela − precio de entrada) × acciones de las que siguen abiertas
// Es la misma valoración que la curva con flotante (lib/nucleoBacktest.js, calcMaxDDFloat): el resultado de
// una operación abierta sale del cierre de la vela; las comisiones cuentan cuando se cierra. Así la suma de los
// años es exactamente el beneficio simple del periodo (la última vela cierra todo). En semanal, «la última vela
// del año» es la de la semana que EMPIEZA ese año (las semanas se fechan en su lunes, lib/velasSemanales.js).
// Coste: una pasada por las velas y, por año, una por las operaciones: O(velas + años × operaciones).
// Sin `barras` (otra ruta), se cae al criterio anterior: todo el resultado en el año de cierre.
// Devuelve por año: { anio, beneficioSimple, rentabilidadPct (sobre el capital inicial), operaciones y
// beneficioCerradas (las cerradas ese año, el dato de antes), metodo }.
export function resultadoPorAnio(trades, barras, { capitalIni, desde = null, hasta = null }) {
  const a0 = Number(String(desde).slice(0, 4)), a1 = Number(String(hasta).slice(0, 4))
  const anios = new Map()
  const fila = (y) => { if (!anios.has(y)) anios.set(y, { anio: y, beneficioSimple: 0, operaciones: 0, beneficioCerradas: 0 }); return anios.get(y) }
  if (Number.isInteger(a0) && Number.isInteger(a1)) for (let y = a0; y <= a1; y++) fila(y)
  for (const t of trades || []) { const a = fila(Number(String(t.exitDate).slice(0, 4))); a.operaciones++; a.beneficioCerradas += t.pnlSimple }
  const conVelas = Array.isArray(barras) && barras.length > 0
  if (conVelas) {
    const finDeAnio = new Map()
    for (const b of barras) if (b?.date && b.close != null) finDeAnio.set(Number(String(b.date).slice(0, 4)), b)
    let anterior = capitalIni
    for (const y of [...anios.keys()].sort((a, b) => a - b)) {
      const b = finDeAnio.get(y)
      if (!b) continue   // un año sin velas en el periodo no gana ni pierde nada
      let valor = capitalIni
      for (const t of trades || []) {
        if (!t.entryDate || t.entryDate > b.date) continue
        if (t.exitDate && t.exitDate <= b.date) valor += t.pnlSimple
        else if (t.entryPrice && t.shares) valor += (b.close - t.entryPrice) * t.shares
      }
      anios.get(y).beneficioSimple = valor - anterior
      anterior = valor
    }
  }
  return [...anios.values()].sort((a, b) => a.anio - b.anio).map(a => {
    const beneficioSimple = conVelas ? a.beneficioSimple : a.beneficioCerradas
    return { anio: a.anio, operaciones: a.operaciones, beneficioSimple, rentabilidadPct: (beneficioSimple / capitalIni) * 100,
      beneficioCerradas: a.beneficioCerradas, metodo: conVelas ? 'fin de año' : 'cierre' }
  })
}

export function metricasOptimizacion(r, { capitalIni, years = 5, desde = null, hasta = null }) {
  const trades = r?.trades || []
  const rk = metricasRanking(r, { capitalIni, years, minTrades: 0 })
  const m = calcMetrics(trades, capitalIni, r.capitalReinv, r.gananciaSimple, r.ganBH, r.startDate, r.ultimaFecha, years)
  const porAnio = resultadoPorAnio(trades, r.barras, { capitalIni, desde: desde || r.startDate, hasta: hasta || r.ultimaFecha })
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
