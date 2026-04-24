// lib/backtester.js — Motor V50 backtester (extraído de pages/api/datos.js)

// ── Indicadores ─────────────────────────────────────────────
export function calcEMA(values, period) {
  const k = 2 / (period + 1)
  const res = new Array(values.length).fill(null)
  let ema = null
  for (let i = 0; i < values.length; i++) {
    if (values[i] == null) continue
    ema = ema === null ? values[i] : values[i] * k + ema * (1 - k)
    res[i] = ema
  }
  return res
}

export function calcSMA(arr, p) {
  return arr.map((_, i) => {
    if (i < p - 1) return null
    return arr.slice(i - p + 1, i + 1).reduce((a, b) => a + b, 0) / p
  })
}

export function calcRSI(values, period = 14) {
  const res = new Array(values.length).fill(null)
  if (values.length <= period) return res
  let avgGain = 0, avgLoss = 0
  for (let i = 1; i <= period; i++) {
    const diff = (values[i] ?? 0) - (values[i - 1] ?? 0)
    if (diff > 0) avgGain += diff; else avgLoss -= diff
  }
  avgGain /= period; avgLoss /= period
  res[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
  for (let i = period + 1; i < values.length; i++) {
    const diff = (values[i] ?? 0) - (values[i - 1] ?? 0)
    avgGain = (avgGain * (period - 1) + Math.max(diff, 0)) / period
    avgLoss = (avgLoss * (period - 1) + Math.max(-diff, 0)) / period
    res[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
  }
  return res
}

// New ATR implementation that takes a data array (objects with high/low/close)
export function calcATR(data, period = 14) {
  const tr = data.map((d, i) => {
    if (i === 0) return d.high - d.low
    const prev = data[i - 1]
    return Math.max(d.high - d.low, Math.abs(d.high - prev.close), Math.abs(d.low - prev.close))
  })
  const atr = new Array(data.length).fill(null)
  let sum = 0
  for (let i = 0; i < period && i < tr.length; i++) sum += tr[i]
  atr[period - 1] = sum / period
  for (let i = period; i < tr.length; i++) atr[i] = (atr[i - 1] * (period - 1) + tr[i]) / period
  return atr
}

// Legacy ATR using separate arrays (used internally in runBacktestV50 for tipoStop)
function calcATRArrays(highs, lows, closes, period) {
  const tr = closes.map((_, i) => {
    if (i === 0) return highs[i] - lows[i]
    return Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1]))
  })
  return calcEMA(tr, period)
}

export function calcMACD(values, fast = 12, slow = 26, sig = 9) {
  const emaF = calcEMA(values, fast)
  const emaS = calcEMA(values, slow)
  const line   = values.map((_, i) => (emaF[i] != null && emaS[i] != null) ? emaF[i] - emaS[i] : null)
  const signal = calcEMA(line.map(v => v ?? 0), sig)
  return { line, signal }
}

// ── evaluateSetup — returns true if setup condition fires at bar i ──────
export function evaluateSetup(i, cfg, data, ind) {
  const { setupType = 'ema_cross_up', setupParams = {} } = cfg
  const bar = data[i], prev = data[i - 1]
  const eF = ind.emaFast, eS = ind.emaSlow
  switch (setupType) {
    case 'ema_cross_up':
      return eF[i - 1] != null && eS[i - 1] != null && eF[i - 1] < eS[i - 1] && eF[i] >= eS[i]
    case 'ema_cross_down':
      return eF[i - 1] != null && eS[i - 1] != null && eF[i - 1] > eS[i - 1] && eF[i] <= eS[i]
    case 'price_above_ma':
      return ind.setupMA?.[i] != null && bar.close > ind.setupMA[i]
    case 'price_below_ma':
      return ind.setupMA?.[i] != null && bar.close < ind.setupMA[i]
    case 'close_above_ma':
      return ind.setupMA?.[i] != null && ind.setupMA?.[i - 1] != null &&
             prev.close <= ind.setupMA[i - 1] && bar.close > ind.setupMA[i]
    case 'close_below_ma':
      return ind.setupMA?.[i] != null && ind.setupMA?.[i - 1] != null &&
             prev.close >= ind.setupMA[i - 1] && bar.close < ind.setupMA[i]
    case 'rsi_above':
      return ind.rsiSetup?.[i] != null && ind.rsiSetup[i] > (setupParams.level ?? 50)
    case 'rsi_below':
      return ind.rsiSetup?.[i] != null && ind.rsiSetup[i] < (setupParams.level ?? 50)
    case 'rsi_cross_up':
      return ind.rsiSetup?.[i] != null && ind.rsiSetup?.[i - 1] != null &&
             ind.rsiSetup[i - 1] <= (setupParams.level ?? 50) && ind.rsiSetup[i] > (setupParams.level ?? 50)
    case 'rsi_cross_down':
      return ind.rsiSetup?.[i] != null && ind.rsiSetup?.[i - 1] != null &&
             ind.rsiSetup[i - 1] >= (setupParams.level ?? 50) && ind.rsiSetup[i] < (setupParams.level ?? 50)
    case 'macd_cross_up':
      return ind.macdSetup?.line[i] != null && ind.macdSetup.line[i - 1] != null &&
             ind.macdSetup.line[i - 1] <= ind.macdSetup.signal[i - 1] && ind.macdSetup.line[i] > ind.macdSetup.signal[i]
    case 'macd_cross_down':
      return ind.macdSetup?.line[i] != null && ind.macdSetup.line[i - 1] != null &&
             ind.macdSetup.line[i - 1] >= ind.macdSetup.signal[i - 1] && ind.macdSetup.line[i] < ind.macdSetup.signal[i]
    case 'price_below_52w_high_pct': {
      const pct = setupParams.pct ?? 20
      return ind.high52w?.[i] != null && data[i].close <= ind.high52w[i] * (1 - pct / 100)
    }
    case 'none':
      return false
    default:
      return eF[i - 1] != null && eS[i - 1] != null && eF[i - 1] < eS[i - 1] && eF[i] >= eS[i]
  }
}

// ── evaluateExit — returns true if exit signal fires at bar i ────────────
export function evaluateExit(i, cfg, data, ind, entryPx = null) {
  const { exitType = 'close_below_ma', exitParams = {} } = cfg
  const bar = data[i], prev = data[i - 1]
  const eF = ind.emaFast
  switch (exitType) {
    case 'ema_cross_down':
      return ind.emaSlow[i] != null && eF[i - 1] != null &&
             eF[i - 1] > ind.emaSlow[i - 1] && eF[i] <= ind.emaSlow[i]
    case 'rsi_above':
      return ind.rsiExit?.[i] != null && ind.rsiExit[i] > (exitParams.level ?? 70)
    case 'rsi_cross_down':
      return ind.rsiExit?.[i] != null && ind.rsiExit?.[i - 1] != null &&
             ind.rsiExit[i - 1] >= (exitParams.level ?? 70) && ind.rsiExit[i] < (exitParams.level ?? 70)
    case 'macd_cross_down':
      return ind.macdExit?.line[i] != null && ind.macdExit.line[i - 1] != null &&
             ind.macdExit.line[i - 1] >= ind.macdExit.signal[i - 1] && ind.macdExit.line[i] < ind.macdExit.signal[i]
    case 'profit_pct': {
      const target = exitParams.pct ?? 10
      return entryPx != null && data[i].close >= entryPx * (1 + target / 100)
    }
    default: { // close_below_ma, breakout_low_after_close_below_ma
      const ma = ind.exitMA || eF
      return ma[i] != null && ma[i - 1] != null && prev.close >= ma[i - 1] && bar.close < ma[i]
    }
  }
}

// ── evaluateFilter ───────────────────────────────────────────
// sp500Closes/spEmaR/spEmaL/closes son arrays pre-calculados (performance)
// Retorna true cuando el filtro BLOQUEA (mercado desfavorable)
export function evaluateFilter(i, cfg, sp500Closes, spEmaR, spEmaL, closes) {
  const tipoFiltro = cfg?.tipoFiltro || cfg?.filterType
  if (!tipoFiltro || tipoFiltro === 'none') return false

  // SP500 sobre su EMA — bloquea cuando SP500 está BAJO la EMA
  if (tipoFiltro === 'sp500_above_ema' || tipoFiltro === 'precio_ema') {
    if (!sp500Closes?.[i] || !spEmaR?.[i]) return false
    return sp500Closes[i] < spEmaR[i]
  }

  // SP500 EMA rápida > lenta — bloquea cuando EMA rápida < EMA lenta
  if (tipoFiltro === 'sp500_ema_fast_above_slow' || tipoFiltro === 'ema_ema') {
    if (!spEmaR?.[i] || !spEmaL?.[i]) return false
    return spEmaR[i] < spEmaL[i]
  }

  // Precio activo sobre EMA — bloquea cuando precio < EMA
  if (tipoFiltro === 'price_above_ema') {
    if (!cfg._filterMA?.[i]) return false
    return closes[i] < cfg._filterMA[i]
  }

  // Caída desde máximo 52 semanas — bloquea cuando el activo
  // NO ha caído suficiente (precio aún alto, fuera de zona)
  if (tipoFiltro === 'price_below_52w_high_pct') {
    const pct = cfg.filterParams?.pct ?? 20
    if (!cfg._high52w?.[i]) return false
    return closes[i] > cfg._high52w[i] * (1 - pct / 100)
  }

  return false
}

// ── evaluateTrigger — entry trigger ─────────────────────────
export function evaluateTrigger(i, cfg, data, ind, setupBarIdx, setupBarHigh, setupBarClose, barsAfterSetup) {
  const { triggerType = 'breakout_high', triggerParams = {} } = cfg
  if (!triggerType || triggerType === 'none') return false
  const bar = data[i]
  switch (triggerType) {
    case 'breakout_high':
      return setupBarHigh != null && bar.high >= setupBarHigh
    case 'breakout_close':
      return setupBarClose != null && bar.close >= setupBarClose
    case 'open_after_n_bars': {
      const n = triggerParams.n ?? 1
      return barsAfterSetup === n
    }
    case 'ma_direction_up': {
      const ma = ind.triggerMA
      if (!ma?.[i] || !ma?.[i - 1]) return false
      return ma[i] > ma[i - 1]
    }
    case 'rsi_cross_up': {
      const lvl = triggerParams.level ?? 30
      const rsi = ind.rsiTrigger
      if (!rsi?.[i]) return false
      return rsi[i - 1] <= lvl && rsi[i] > lvl
    }
    case 'rsi_direction_up': {
      const rsi = ind.rsiTrigger
      if (!rsi?.[i] || !rsi?.[i - 1] || !rsi?.[i - 2]) return false
      return rsi[i] > rsi[i - 1] && rsi[i - 1] <= rsi[i - 2]
    }
    case 'price_below_52w_high_pct': {
      const pct = triggerParams.pct ?? 20
      return ind.high52w?.[i] != null && data[i].close <= ind.high52w[i] * (1 - pct / 100)
    }
    default: return false
  }
}

// ── evaluateTriggerOut — exit trigger ───────────────────────
export function evaluateTriggerOut(i, cfg, data, ind, setupOutBarIdx, setupOutBarLow, barsAfterSetupOut, entryPrice) {
  const { triggerOutType = 'breakdown_low', triggerOutParams = {} } = cfg
  if (!triggerOutType || triggerOutType === 'none') return false
  const bar = data[i]
  switch (triggerOutType) {
    case 'breakdown_low':
      return setupOutBarLow != null && bar.low <= setupOutBarLow
    case 'open_after_n_bars': {
      const n = triggerOutParams.n ?? 1
      return barsAfterSetupOut === n
    }
    case 'ma_direction_down': {
      const ma = ind.triggerOutMA
      if (!ma?.[i] || !ma?.[i - 1]) return false
      return ma[i] < ma[i - 1]
    }
    case 'rsi_cross_down': {
      const lvl = triggerOutParams.level ?? 70
      const rsi = ind.rsiTriggerOut
      if (!rsi?.[i]) return false
      return rsi[i - 1] >= lvl && rsi[i] < lvl
    }
    case 'rsi_direction_down': {
      const rsi = ind.rsiTriggerOut
      if (!rsi?.[i] || !rsi?.[i - 1] || !rsi?.[i - 2]) return false
      return rsi[i] < rsi[i - 1] && rsi[i - 1] >= rsi[i - 2]
    }
    case 'profit_pct': {
      const pct = triggerOutParams.pct ?? 10
      if (!entryPrice) return false
      return (bar.close - entryPrice) / entryPrice * 100 >= pct
    }
    default: return false
  }
}

// ── evaluateAbort — abort a pending entry ───────────────────
export function evaluateAbort(i, cfg, data, ind) {
  const { abortType, abortParams = {} } = cfg
  if (!abortType || abortType === 'none') return false
  const bar = data[i]
  const eF = ind.emaFast, eS = ind.emaSlow
  switch (abortType) {
    case 'ema_cross_down':
      return eF[i - 1] > eS[i - 1] && eF[i] <= eS[i]
    case 'price_below_ema': {
      const ma = ind.abortMA || eF
      return ma[i] != null && bar.close < ma[i]
    }
    default: return false
  }
}

// ── Motor V50 — fiel al Pine Script ─────────────────────────
// Reproduce exactamente la lógica de TradingView V50_17
export function runBacktestV50(data, sp500Data, cfg) {
  const { emaR, emaL, capitalIni, tipoStop, atrPeriod, atrMult,
          sinPerdidas, reentry, tipoFiltro, sp500EmaR, sp500EmaL, years,
          fixedPct, trailingAtrPeriod, trailingAtrMult,
          setupType = 'ema_cross_up', setupParams = {},
          exitType  = 'close_below_ma', exitParams  = {} } = cfg

  const closes = data.map(d => d.close)
  const highs   = data.map(d => d.high)
  const lows    = data.map(d => d.low)

  const emaRArr = calcEMA(closes, emaR)
  const emaLArr = calcEMA(closes, emaL)
  const atrArr  = tipoStop === 'atr'          ? calcATRArrays(highs, lows, closes, atrPeriod) :
                  tipoStop === 'trailing_atr'  ? calcATRArrays(highs, lows, closes, trailingAtrPeriod || 14) :
                  null

  // ── Indicadores adicionales según setup/exit ────────────────
  let setupMA = null, exitMA = null, rsiSetup = null, rsiExit = null, macdSetup = null, macdExit = null
  if (['price_above_ma', 'price_below_ma', 'close_above_ma', 'close_below_ma'].includes(setupType)) {
    const p = setupParams?.ma_period || 50
    setupMA = setupParams?.ma_type === 'SMA' ? calcSMA(closes, p) : calcEMA(closes, p)
  }
  if (['rsi_above', 'rsi_below', 'rsi_cross_up', 'rsi_cross_down'].includes(setupType)) {
    rsiSetup = calcRSI(closes, setupParams?.period || 14)
  }
  if (['macd_cross_up', 'macd_cross_down'].includes(setupType)) {
    macdSetup = calcMACD(closes, setupParams?.fast || 12, setupParams?.slow || 26, setupParams?.signal || 9)
  }
  if (['close_below_ma', 'price_below_ma', 'close_above_ma', 'price_above_ma'].includes(exitType)) {
    const p = exitParams?.ma_period || 10
    exitMA = exitParams?.ma_type === 'SMA' ? calcSMA(closes, p) : calcEMA(closes, p)
  }
  if (['rsi_above', 'rsi_below', 'rsi_cross_up', 'rsi_cross_down'].includes(exitType)) {
    rsiExit = calcRSI(closes, exitParams?.period || 14)
  }
  if (['macd_cross_up', 'macd_cross_down'].includes(exitType)) {
    macdExit = calcMACD(closes, exitParams?.fast || 12, exitParams?.slow || 26, exitParams?.signal || 9)
  }
  const indicators = { emaFast: emaRArr, emaSlow: emaLArr, setupMA, exitMA, rsiSetup, rsiExit, macdSetup, macdExit }

  // ── Indicadores adicionales para nuevos trigger/abort/stop types ──
  // Trigger MA
  if (cfg.triggerType === 'ma_direction_up' || cfg.triggerOutType === 'ma_direction_down') {
    const p = cfg.triggerParams?.maPeriod || cfg.triggerOutParams?.maPeriod || 10
    const mt = cfg.triggerParams?.maType || 'ema'
    const ma = mt === 'sma' ? calcSMA(closes, p) : calcEMA(closes, p)
    indicators.triggerMA = ma
    indicators.triggerOutMA = ma
  }
  // RSI for trigger in
  if (cfg.triggerType === 'rsi_cross_up' || cfg.triggerType === 'rsi_direction_up') {
    indicators.rsiTrigger = calcRSI(closes, cfg.triggerParams?.rsiPeriod || 14)
  }
  // RSI for trigger out
  if (cfg.triggerOutType === 'rsi_cross_down' || cfg.triggerOutType === 'rsi_direction_down') {
    indicators.rsiTriggerOut = calcRSI(closes, cfg.triggerOutParams?.rsiPeriod || 14)
  }
  // 52-week high
  if (cfg.setupType === 'price_below_52w_high_pct' || cfg.triggerType === 'price_below_52w_high_pct') {
    indicators.high52w = data.map((_, i) => {
      const start = Math.max(0, i - 252)
      return Math.max(...data.slice(start, i + 1).map(d => d.high))
    })
  }
  // ATR for new stop types
  if (cfg.stopType === 'atr_multiple' || cfg.stopType === 'atr_trailing') {
    indicators.atr = calcATR(data, cfg.stopParams?.atrPeriod || 14)
  }
  // Stop MA
  if (cfg.stopType === 'below_ema') {
    indicators.stopMA = calcEMA(closes, cfg.stopParams?.period || 10)
  }

  // Filtro SP500 — pre-calculado para performance, evaluado por evaluateFilter()
  let _sp500Closes = null, _spEmaR = null, _spEmaL = null
  if (sp500Data) {
    _sp500Closes = data.map(d => { const m = sp500Data.find(s => s.date === d.date); return m ? m.close : null })
    let last = null; for (let i = 0; i < _sp500Closes.length; i++) { if (_sp500Closes[i] != null) last = _sp500Closes[i]; else _sp500Closes[i] = last }
    _spEmaR = calcEMA(_sp500Closes, sp500EmaR)
    _spEmaL = calcEMA(_sp500Closes, sp500EmaL)
  }
  // Indicadores extra para tipos de filtro sobre el activo
  if (cfg.filterType === 'price_above_ema') {
    const p = cfg.filterParams?.period || 10
    cfg._filterMA = calcEMA(closes, p)
  }
  if (cfg.filterType === 'price_below_52w_high_pct') {
    cfg._high52w = data.map((_, i) => {
      const start = Math.max(0, i - 252)
      return Math.max(...data.slice(start, i + 1).map(d => d.high))
    })
  }
  const filtroArr = data.map((_, i) => {
    if (i === 0) return false
    return evaluateFilter(i, cfg, _sp500Closes, _spEmaR, _spEmaL, closes)
  })

  const lastDate = new Date(data[data.length - 1].date)
  const startDate = new Date(lastDate)
  startDate.setFullYear(startDate.getFullYear() - years)
  const inWindow = (i) => new Date(data[i].date) >= startDate

  // Estado — espejo de las variables Pine Script
  let inPos          = false
  let entradaPend    = false
  let bkEntrada      = 0
  let salidaPend     = false
  let bkSalida       = 0
  let stopNivel      = null    // fijado en vela de setup, NO se actualiza al hacer rolling
  let sinPerdAct     = false
  let reentryMode    = false
  let reentryPend    = false
  let precioEntrada  = null
  let entryIdx       = null

  // Nuevas variables para trigger/triggerOut/abort
  let setupBarIdx    = null
  let setupBarHigh   = null
  let setupBarClose  = null
  let barsAfterSetup = 0
  let setupOutBarIdx  = null
  let setupOutBarLow  = null
  let barsAfterSetupOut = 0

  let capitalReinv   = capitalIni
  let gananciaSimple = 0
  const trades       = []
  const blockEvents  = {
    filter: [], setup_in: [], setup_in_range: [], trigger_in: [],
    abort: [], setup_out: [], setup_out_range: [], trigger_out: [], stop_loss: [],
  }
  let prevSetupIn = false

  const chartData = data.map((d, i) => ({
    ...d,
    emaR: emaRArr[i],
    emaL: emaLArr[i],
    filtro: filtroArr[i],
    signal: null, breakoutLine: null, stopLine: null,
  }))

  const doExit = (i, px, tipo) => {
    const pnl = (px - precioEntrada) / precioEntrada
    gananciaSimple += pnl * capitalIni
    capitalReinv   += pnl * capitalReinv
    trades.push(makeTrade(data[entryIdx].date, data[i].date, precioEntrada, px, pnl, capitalReinv, capitalIni, tipo, stopNivel))
    chartData[i].signal = 'exit'
    inPos = false; precioEntrada = null; entryIdx = null
    salidaPend = false; sinPerdAct = false; stopNivel = null; bkSalida = 0
    prevSetupIn = false
    // Reset trigger out state
    setupOutBarIdx = null; setupOutBarLow = null; barsAfterSetupOut = 0
  }

  for (let i = 1; i < data.length; i++) {
    const bar  = data[i]
    const prev = data[i - 1]
    const er   = emaRArr[i],   el  = emaLArr[i]
    const erp  = emaRArr[i - 1], elp = emaLArr[i - 1]
    const filt = filtroArr[i]
    const inW  = inWindow(i)

    if (er == null || el == null) continue

    // Increment bar counters for pending triggers
    if (entradaPend) barsAfterSetup++
    if (salidaPend) barsAfterSetupOut++

    // ── Señales (equivalentes Pine Script) ──────────────────
    // cruce_alcista = ta.crossover(ema_rapida, ema_lenta)
    const cruceAlc  = erp != null && erp < elp && er >= el
    // cruce_bajista = ta.crossunder(ema_rapida, ema_lenta)
    const cruceBaj  = erp != null && erp > elp && er <= el
    // cierre_bajo_ema_rapida = ta.crossunder(close, ema_rapida)
    const cierreBaj = prev.close >= erp && bar.close < er
    // cierre_sobre_ema_rapida = ta.crossover(close, ema_rapida)
    const cierreAlc = prev.close <= erp && bar.close > er
    // ema_rapida_sobre_lenta
    const emaAlcista = er > el
    if (filt && inW) blockEvents.filter.push(bar.date)

    // Pine: if cruce_bajista and modo_reentry → resetear reentry
    if (cruceBaj && reentry) {
      reentryMode = false
      reentryPend = false
    }

    // ════════════════════════════════════════════════════════
    // EN POSICIÓN
    // ════════════════════════════════════════════════════════
    if (inPos) {
      // 1. STOP EMERGENCIA — solo si sinPerdidas activo
      //    Pine: if modo_sin_perdidas and cruce_bajista and position > 0
      if (sinPerdidas && cruceBaj) {
        blockEvents.stop_loss.push(bar.date)
        doExit(i, bar.open, 'Stop Emergencia')
        if (reentry && emaAlcista) reentryMode = true
        continue
      }

      // 2a. TRAILING ATR — actualizar stop (solo sube) antes de evaluar hit
      if (tipoStop === 'trailing_atr' && atrArr?.[i]) {
        const newStop = bar.close - atrArr[i] * (trailingAtrMult || 2)
        if (stopNivel === null || newStop > stopNivel) stopNivel = newStop
      }

      // 2. STOP HIT — if gap-down opens below stop, use open (realistic fill)
      if (stopNivel != null && bar.low <= stopNivel) {
        const fillPx = bar.open <= stopNivel ? bar.open : stopNivel
        blockEvents.stop_loss.push(bar.date)
        doExit(i, fillPx, 'Stop')
        if (reentry && emaAlcista) reentryMode = true
        continue
      }

      // 3. SALIDA PENDIENTE — breakout del mínimo
      if (salidaPend && bkSalida > 0) {
        if (sinPerdidas) {
          // Pine: low_por_encima_breakeven = low > precio_entrada_ejecutado
          //       activar/desactivar salida_sin_perdidas_activa
          const lowSobreEntry = bar.low > precioEntrada
          if (lowSobreEntry && !sinPerdAct)    sinPerdAct = true
          if (!lowSobreEntry && sinPerdAct)    sinPerdAct = false
          if (sinPerdAct && bar.low <= bkSalida) {
            const fillPx = bar.open <= bkSalida ? bar.open : bkSalida
            blockEvents.trigger_out.push(bar.date)
            doExit(i, fillPx, 'Exit')
            if (reentry && emaAlcista) reentryMode = true
            continue
          }
        } else {
          if (bar.low <= bkSalida) {
            const fillPx = bar.open <= bkSalida ? bar.open : bkSalida
            blockEvents.trigger_out.push(bar.date)
            doExit(i, fillPx, 'Exit')
            if (reentry && emaAlcista) reentryMode = true
            continue
          }
        }
      }

      // 4. NUEVA SEÑAL DE SALIDA — evaluateExit (crossunder close/ema, RSI, MACD, etc.)
      //    Pine siempre actualiza precio_breakout_salida y cancela stops.
      //    Removemos !salidaPend para actualizar bkSalida en nuevos cruces.
      if (evaluateExit(i, cfg, data, indicators, precioEntrada)) {
        blockEvents.setup_out.push(bar.date)
        blockEvents.setup_out_range.push(bar.date)  // todas las barras
        bkSalida  = bar.low
        stopNivel = null  // cancela stop loss técnico/ATR
        // Capture setup_out bar info for evaluateTriggerOut
        setupOutBarIdx = i
        setupOutBarLow = bar.low
        barsAfterSetupOut = 0
        if (sinPerdidas) {
          // sinPerdidas: solo colocar orden de salida si low > precio de entrada
          // (si low < entry, la salida queda suspendida hasta recuperar entry)
          sinPerdAct = bar.low > precioEntrada
          salidaPend = sinPerdAct  // solo pendiente si low sobre entry
        } else {
          salidaPend = true
          sinPerdAct = false  // !sinPerdidas: siempre salir, sin condición extra
        }
      }

      if (stopNivel != null) chartData[i].stopLine = stopNivel
      continue
    }

    // ════════════════════════════════════════════════════════
    // FUERA DE POSICIÓN
    // ════════════════════════════════════════════════════════
    if (!inW) continue

    // Cancelar entrada si filtro activo
    if (entradaPend && filt && !reentryPend) {
      blockEvents.abort.push(bar.date)
      entradaPend = false; bkEntrada = 0; stopNivel = null
      setupBarIdx = null; setupBarHigh = null; setupBarClose = null; barsAfterSetup = 0
      continue
    }
    if (reentryPend && filt) {
      blockEvents.abort.push(bar.date)
      entradaPend = false; reentryPend = false; bkEntrada = 0; stopNivel = null
      setupBarIdx = null; setupBarHigh = null; setupBarClose = null; barsAfterSetup = 0
      continue
    }

    // ── Ejecutar entrada pendiente ──────────────────────────
    if (entradaPend) {
      // Abort via evaluateAbort (non-filter based)
      if (evaluateAbort(i, cfg, data, indicators)) {
        blockEvents.abort.push(bar.date)
        entradaPend = false; bkEntrada = 0; stopNivel = null
        setupBarIdx = null; setupBarHigh = null; setupBarClose = null; barsAfterSetup = 0
        continue
      }

      // ── Rolling breakout (fiel a TV) ──────────────────────
      // TV coloca un stop-order en el nivel. Si el high de esta vela
      // supera el nivel ANTERIOR → entrada. Si no → baja el nivel al
      // high de esta vela para la siguiente vela.
      // CRÍTICO: comprobar breakout con el nivel PREVIO antes de actualizarlo.
      const prevBk = bkEntrada

      // Determine if trigger fires: use evaluateTrigger if triggerType is set,
      // otherwise fall back to existing breakout_high logic (bar.high >= prevBk)
      const triggerFires = cfg.triggerType && cfg.triggerType !== 'none'
        ? evaluateTrigger(i, cfg, data, indicators, setupBarIdx, setupBarHigh, setupBarClose, barsAfterSetup)
        : bar.high >= prevBk

      if (triggerFires) {
        // ✅ Breakout conseguido — entrada al nivel previo
        blockEvents.trigger_in.push(bar.date)
        precioEntrada = prevBk
        entryIdx      = i
        inPos = true; entradaPend = false; reentryPend = false; salidaPend = false; sinPerdAct = false; reentryMode = false
        prevSetupIn = false
        // Reset trigger in state
        setupBarIdx = null; setupBarHigh = null; setupBarClose = null; barsAfterSetup = 0
        chartData[i].signal = 'entry'
        if (tipoStop === 'atr' && atrArr?.[i]) {
          stopNivel = precioEntrada - atrArr[i] * atrMult
        }
        if (tipoStop === 'fixed_pct' && fixedPct > 0) {
          stopNivel = precioEntrada * (1 - fixedPct / 100)
        }
        if (tipoStop === 'trailing_atr' && atrArr?.[i]) {
          stopNivel = precioEntrada - atrArr[i] * (trailingAtrMult || 2)
        }
        if (tipoStop === 'none') stopNivel = null
        if (stopNivel != null) chartData[i].stopLine = stopNivel
        continue
      }

      // ❌ No breakout — rolling: bajar nivel al high de esta vela
      // Stop NO se recalcula (fijado en vela de setup)
      if (bar.high < prevBk) bkEntrada = bar.high
      chartData[i].breakoutLine = bkEntrada

      // Abort — Pine: if exit signal and entrada_pendiente and not reentry_mode_activo
      if (evaluateExit(i, cfg, data, indicators, precioEntrada) && !reentryPend) {
        entradaPend = false; bkEntrada = 0; stopNivel = null
        setupBarIdx = null; setupBarHigh = null; setupBarClose = null; barsAfterSetup = 0
      }
      continue
    }

    // ── SETUP — evaluateSetup (EMA cross, RSI, MACD, etc.) ──────────────
    // Pine: if setup_signal and position==0 and backtestWindow and not reentry_mode and not filtro
    const setupNow = evaluateSetup(i, cfg, data, indicators)
    if (setupNow && !reentryMode && !filt) {
      if (!prevSetupIn) blockEvents.setup_in.push(bar.date)  // solo flanco false→true
      blockEvents.setup_in_range.push(bar.date)              // todas las barras
      entradaPend = true
      reentryPend = false
      bkEntrada   = bar.high
      // Capture setup bar info for evaluateTrigger
      setupBarIdx   = i
      setupBarHigh  = bar.high
      setupBarClose = bar.close
      barsAfterSetup = 0
      // Stop técnico fijado aquí — Pine: nivel_stop_tecnico := math.min(ema_rapida, low)
      if (tipoStop === 'tecnico') stopNivel = Math.min(er, bar.low)
      else stopNivel = null
      chartData[i].breakoutLine = bkEntrada
    }
    prevSetupIn = setupNow && !reentryMode && !filt

    // ── NO SETUP — si setup es none/null, armar trigger directamente cada barra ──
    // entradaPend se vuelve true en la barra siguiente a un abort (o desde el inicio).
    // Esto permite que el trigger evalúe sin necesitar una ventana de setup previa.
    const noSetup = !cfg.setupType || cfg.setupType === 'none'
    if (noSetup && !entradaPend && !reentryMode && !filt) {
      entradaPend   = true
      bkEntrada     = bar.high
      setupBarIdx   = i
      setupBarHigh  = bar.high
      setupBarClose = bar.close
      barsAfterSetup = 0
      chartData[i].breakoutLine = bkEntrada
    }

    // ── REENTRY — setup ─────────────────────────────────────
    // Pine: if modo_reentry and reentry_mode_activo and position==0
    //            and ema_rapida_sobre_lenta and cierre_sobre_ema_rapida and not entrada_pendiente
    if (reentry && reentryMode && !entradaPend && emaAlcista && !filt && cierreAlc) {
      entradaPend = true
      reentryPend = true
      bkEntrada   = bar.high
      // Capture setup bar info for reentry trigger
      setupBarIdx   = i
      setupBarHigh  = bar.high
      setupBarClose = bar.close
      barsAfterSetup = 0
      if (tipoStop === 'tecnico') stopNivel = Math.min(er, bar.low)
      else stopNivel = null
      chartData[i].breakoutLine = bkEntrada
    }
  }

  return { chartData, trades, capitalReinv, gananciaSimple, startDate, blockEvents }
}

function makeTrade(entryDate, exitDate, entryPx, exitPx, pnl, capitalReinv, capitalIni, tipo, stopPx = null) {
  return {
    entryDate, exitDate, entryPx, exitPx,
    pnlPct: pnl * 100,
    pnlSimple: pnl * capitalIni,
    capitalTras: capitalReinv,
    dias: Math.round((new Date(exitDate) - new Date(entryDate)) / 86400000),
    tipo, stopPx
  }
}
