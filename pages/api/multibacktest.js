// pages/api/multibacktest.js
// Backtest de cartera multi-activo — Slots iguales | Capital compartido | Pesos personalizados

import { calcEMA as _libEMA, calcSMA, calcRSI, calcATR as _libATR, calcMACD } from '../../lib/backtester'
import { fetchAV } from './datos'

const SUPA_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPA_KEY = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

function calcEMA(values, period) {
  if (!values?.length || period < 1) return []
  const k = 2 / (period + 1)
  const out = new Array(values.length).fill(null)
  let sum = 0, valid = 0
  for (let i = 0; i < values.length; i++) {
    if (values[i] == null) continue
    sum += values[i]; valid++
    if (valid < period) continue
    if (valid === period) { out[i] = sum / period; continue }
    out[i] = values[i] * k + out[i - 1] * (1 - k)
  }
  return out
}
// ── Align external close series to asset dates with forward-fill (for market filters) ──
function buildAlignedCloses(externalData, assetDates) {
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
function buildAlignedWeekly(weeklyData, assetDates, emaPeriod) {
  if (!weeklyData?.length || !assetDates?.length)
    return { closes: assetDates.map(()=>null), ema: assetDates.map(()=>null) }
  const sorted = [...weeklyData].sort((a,b)=>a.date.localeCompare(b.date))
  const wCloses = sorted.map(d=>d.close)
  const wEma = calcEMA(wCloses, Math.max(1, emaPeriod))
  const closes = [], ema = []
  let ptr = 0, lastClose = null, lastEma = null
  for (const date of assetDates) {
    while (ptr < sorted.length-1 && sorted[ptr+1].date <= date) ptr++
    if (sorted[ptr].date <= date) { lastClose = sorted[ptr].close; lastEma = wEma[ptr] }
    closes.push(lastClose); ema.push(lastEma)
  }
  return { closes, ema }
}

// ── Rebuild compound capitalTras after filtering trades ──
function rebuildCapitalTras(trades, initCapital) {
  let capital = initCapital
  return trades.map(t => {
    if (!t.exitPrice || !t.entryPrice || t._virtualClose) return t
    const pnlComp = capital * ((t.exitPrice - t.entryPrice) / t.entryPrice)
    capital += pnlComp
    return { ...t, capitalTras: capital }
  })
}

// Adaptador sobre fetchAV (Stooq primario + Yahoo fallback, con timeouts) — MISMA fuente robusta
// que los gráficos individuales (datos.js). Mantiene la firma de fetchData y el contrato null-on-failure
// que espera multibacktest.js. Antes usaba solo Yahoo → NVDA y otros llegaban truncados (~21 may).
async function fetchData(symbol, years=5, fromDate=null, toDate=null, interval='1d') {
  try {
    const avInterval = (interval === '1wk' || interval === 'w') ? 'w' : 'd'
    // +1 año de buffer para warm-up de la EMA (igual que datos.js)
    let data = await fetchAV(symbol, Math.ceil(years) + 1, avInterval)
    if (!data?.length) return null
    if (fromDate && toDate) {
      data = data.filter(d => d.date >= fromDate && d.date <= toDate)
    } else {
      const cut = new Date(); cut.setFullYear(cut.getFullYear() - Math.ceil(years))
      const cutStr = cut.toISOString().slice(0, 10)
      data = data.filter(d => d.date >= cutStr)
    }
    return data.length ? data : null
  } catch { return null }
}

// Muestreo de fechas para curvas: intervalos fijos (cada step días) + SIEMPRE las fechas
// donde cambia la ocupación (entryDate/exitDate de cada operación), para que el "capital empleado"
// no se pierda picos de posiciones cortas (1-2 días) que caen entre muestras. Dedup + orden asc.
function _sampledWithChanges(filteredDates, step, trades) {
  const inAxis = new Set(filteredDates)
  const set = new Set()
  filteredDates.forEach((d, i) => { if (i % step === 0 || i === filteredDates.length - 1) set.add(d) })
  ;(trades || []).forEach(t => {
    if (t.entryDate && inAxis.has(t.entryDate)) set.add(t.entryDate)
    if (t.exitDate && inAxis.has(t.exitDate)) set.add(t.exitDate)
  })
  return [...set].sort()
}

// ── MODO SLOTS: capital dividido en N partes iguales ─────────
function buildSlotsCurves(assetResults, capitalIni) {
  const n = assetResults.length
  if (!n) return _emptyCurves()
  const slotCapital = capitalIni / n
  const { allDates, startDate, filteredDates } = _commonDates(assetResults)
  if (!filteredDates.length) return _emptyCurves(startDate)

  const assetEquities = assetResults.map(ar => {
    const { trades, data } = ar
    const filtData = data ? data.filter(d => d.date >= startDate) : []
    const p0 = filtData.length ? filtData[0].close : null
    const byDate = {}
    filteredDates.forEach(date => {
      const exitsBefore = trades.filter(t => t.exitDate <= date)
      const simple = slotCapital + exitsBefore.reduce((s,t) => s + t.pnlSimple, 0)
      const compound = exitsBefore.length ? exitsBefore[exitsBefore.length-1].capitalTras : slotCapital
      const openTrades = trades.filter(t => t.entryDate <= date && (!t.exitDate || t.exitDate > date || (t._virtualClose && t.exitDate >= date)))
      const open = openTrades.length > 0
      let bh = slotCapital, closePx = null
      if (p0 && filtData.length) {
        let bar = null
        for (let i = filtData.length-1; i>=0; i--) { if (filtData[i].date <= date) { bar=filtData[i]; break } }
        if (bar) { bh = slotCapital * (bar.close / p0); closePx = bar.close }
      }
      // openPnl SOLO sobre posiciones estrictamente abiertas (exitDate > date o sin exitDate).
      // Las ya realizadas en `compound` (incl. cierres virtuales en su exitDate) se excluyen para
      // no contar su ganancia dos veces. `open`/ocupación siguen usando openTrades (sin tocar).
      const openPnl = openTrades.reduce((s,t) => { if(closePx==null) return s; if(t.exitDate && t.exitDate <= date) return s; const ep=t.entryPx??t.entryPrice; const capAtEntry=t.capitalTras/(1+t.pnlPct/100); return ep!=null ? s+(closePx-ep)/ep*capAtEntry : s }, 0)
      byDate[date] = { simple, compound, open, bh, openPnl }
    })
    return byDate
  })

  const simpleCurve=[], compoundCurve=[], bhCurve=[], occupancyCurve=[], floatSimpleCurve=[], floatCompoundCurve=[]
  const step = Math.max(1, Math.floor(filteredDates.length / 400))
  _sampledWithChanges(filteredDates, step, assetResults.flatMap(ar=>ar.trades||[])).forEach(date => {
    let totSimple=0, totCompound=0, totBH=0, openSlots=0, totOpenPnl=0
    assetEquities.forEach(byDate => {
      const e = byDate[date]
      if (e) { totSimple+=e.simple; totCompound+=e.compound; totBH+=e.bh; if(e.open)openSlots++; totOpenPnl+=e.openPnl||0 }
    })
    simpleCurve.push({ date, value: totSimple })
    compoundCurve.push({ date, value: totCompound })
    bhCurve.push({ date, value: totBH })
    // CAPITAL EMPLEADO unificado: euros de COSTE = nº slots abiertos × coste fijo por slot.
    occupancyCurve.push({ date, value: openSlots * slotCapital })
    floatSimpleCurve.push({ date, value: totSimple+totOpenPnl })
    floatCompoundCurve.push({ date, value: totCompound+totOpenPnl })
  })

  const tInvEstrategia = occupancyCurve.length
    ? (occupancyCurve.filter(p => p.value > 0).length / occupancyCurve.length) * 100
    : 0
  // Cap.inv% sobre base COSTE: media de (capitalEmpleado_coste / portfolioTotal × 100)
  const avgCapOccupancy = occupancyCurve.length && compoundCurve.length
    ? occupancyCurve.reduce((s, p, i) => {
        const total = compoundCurve[i]?.value || capitalIni
        return s + (total > 0 ? (p.value / total) * 100 : 0)
      }, 0) / occupancyCurve.length
    : 0
  const _totalSenalesSlots = assetResults.reduce((s, ar) => s + (ar.trades?.length || 0), 0)
  const senalStatsSlots = {
    generadas:             _totalSenalesSlots,
    ejecutadas:            _totalSenalesSlots,
    descartadasPorSlots:   0,
    descartadasPorCapital: 0,
    descartadasPorRiesgo:  0,
    winRateDescartadas:    null,
    pfDescartadas:         null,
    pnlHipoteticoDescartadas: 0,
  }
  return { simpleCurve, compoundCurve, bhCurve, occupancyCurve, startDate, floatSimpleCurve, floatCompoundCurve, tInvEstrategia, avgCapOccupancy, senalStats: senalStatsSlots, ..._calcDD(simpleCurve, compoundCurve, bhCurve, capitalIni), ..._calcFloatDD(floatSimpleCurve, floatCompoundCurve, capitalIni) }
}

// ── MODO CAPITAL COMPARTIDO: pool libre repartido entre slots activos ──
// symbolOrder: array opcional de símbolos para desempate en entradas simultáneas
//   null → desempate alfabético (modo compartido estándar)
//   array → desempate por posición en la lista (modo ranking)
function buildCompartidoCurves(assetResults, capitalIni, symbolOrder = null) {
  const n = assetResults.length
  if (!n) return _emptyCurves()
  const { startDate, filteredDates } = _commonDates(assetResults)
  if (!filteredDates.length) return _emptyCurves(startDate)

  // Recopilar todos los trades de todos los activos con pnlPct pre-calculado
  const allCandidates = assetResults.flatMap(ar =>
    (ar.trades || []).map(t => ({
      symbol:       ar.symbol,
      entryDate:    t.entryDate,
      exitDate:     t.exitDate,
      pnlPct:       t.pnlPct,
      entryPx:      t.entryPrice ?? t.entryPx,
      stopPx:       t.stopHistory?.[0]?.stopPx ?? null,
      dias:         t.dias,
      _virtualClose: !!t._virtualClose,
    }))
  ).sort((a, b) => {
    if (a.entryDate < b.entryDate) return -1
    if (a.entryDate > b.entryDate) return 1
    if (symbolOrder) return symbolOrder.indexOf(a.symbol) - symbolOrder.indexOf(b.symbol)
    return a.symbol < b.symbol ? -1 : 1
  })

  if (!allCandidates.length) return buildSlotsCurves(assetResults, capitalIni)

  const senalesGeneradasC = allCandidates.length
  let cntEjecutadasC = 0, cntDescCapitalC = 0
  let pnlHipEurC = 0
  const pnlDescartadosC = []

  // Pool de capital libre y slots abiertos
  let poolLibre = capitalIni
  const openSlots = {}          // { symbol: { trade, capAsignado } }
  const executedTrades = []
  const capitalAtEntryMap = {}  // `${symbol}:${entryDate}` → capAsignado

  // Agrupar entradas por fecha
  const entriesByDate = {}
  allCandidates.forEach(t => {
    if (!entriesByDate[t.entryDate]) entriesByDate[t.entryDate] = []
    entriesByDate[t.entryDate].push(t)
  })

  // Timeline: todas las fechas de entrada y salida relevantes
  const eventDates = [...new Set([
    ...allCandidates.map(t => t.entryDate),
    ...allCandidates.map(t => t.exitDate).filter(d => d != null),
  ])].sort()

  eventDates.forEach(date => {
    // 1. Cerrar primero (libera capital para nuevas entradas del mismo día)
    const toClose = Object.keys(openSlots).filter(sym => openSlots[sym].trade.exitDate === date)
    toClose.forEach(symbol => {
      const { trade, capAsignado, totalPortfolioAtEntry: _tpAtEntry } = openSlots[symbol]
      if (!isFinite(trade.pnlPct)) { poolLibre += capAsignado; delete openSlots[symbol]; return }  // skip NaN/Infinity
      const capFinal = capAsignado * (1 + trade.pnlPct / 100)
      poolLibre += capFinal
      const _distC = (trade.stopPx && trade.entryPx && trade.entryPx > trade.stopPx)
        ? (trade.entryPx - trade.stopPx) / trade.entryPx : null
      const _riesgoC = _distC ? capAsignado * _distC : capAsignado * 0.05
      executedTrades.push({
        ...trade,
        _capitalAtEntry: capAsignado,
        _totalPortfolioAtEntry: _tpAtEntry || capitalIni,
        capitalTras: capFinal,
        pnlSimple: capFinal - capAsignado,
        riesgoAcum: _riesgoC,
      })
      delete openSlots[symbol]
    })

    // 2. Abrir entradas del día (solo activos sin posición abierta)
    const entries = (entriesByDate[date] || []).filter(t => !openSlots[t.symbol])
    if (entries.length > 0 && poolLibre <= 0) {
      const _openCapsBlkC = Object.values(openSlots).reduce((s, slot) => s + (slot.capAsignado || 0), 0)
      const _capMaxBlkC = (poolLibre + _openCapsBlkC) / n
      entries.forEach(t => {
        cntDescCapitalC++
        if (isFinite(t.pnlPct)) { pnlDescartadosC.push(t.pnlPct); pnlHipEurC += _capMaxBlkC * t.pnlPct / 100 }
      })
    }
    if (entries.length > 0 && poolLibre > 0) {
      entries.forEach(t => {
        // Recalculate per entrant: poolLibre and openSlots change with each iteration
        const openCapsTotal = Object.values(openSlots).reduce((s, slot) => s + (slot.capAsignado || 0), 0)
        const totalPortfolio = poolLibre + openCapsTotal
        const capPorSlot = Math.min(totalPortfolio / n, poolLibre)
        if (capPorSlot < 0.01) { cntDescCapitalC++; if (isFinite(t.pnlPct)) { pnlDescartadosC.push(t.pnlPct); pnlHipEurC += (totalPortfolio / n) * t.pnlPct / 100 } return }
        cntEjecutadasC++
        poolLibre -= capPorSlot
        // Same-day trade (entryDate === exitDate): abrir y cerrar atómicamente
        // para evitar que quede bloqueado en openSlots sin salida
        if (t.exitDate === date) {
          if (isFinite(t.pnlPct)) {
            const capFinal = capPorSlot * (1 + t.pnlPct / 100)
            poolLibre += capFinal
            const _distSD = (t.stopPx && t.entryPx && t.entryPx > t.stopPx)
              ? (t.entryPx - t.stopPx) / t.entryPx : null
            const _riesgoSD = _distSD ? capPorSlot * _distSD : capPorSlot * 0.05
            executedTrades.push({
              ...t,
              _capitalAtEntry: capPorSlot,
              _totalPortfolioAtEntry: totalPortfolio,
              capitalTras: capFinal,
              pnlSimple: capFinal - capPorSlot,
              riesgoAcum: _riesgoSD,
            })
          } else {
            poolLibre += capPorSlot  // NaN: devolver capital sin P&L
          }
          // NO añadir a openSlots — se resuelve inmediatamente
        } else {
          openSlots[t.symbol] = { trade: t, capAsignado: capPorSlot, totalPortfolioAtEntry: totalPortfolio }
          capitalAtEntryMap[`${t.symbol}:${t.entryDate}`] = capPorSlot
        }
      })
    }
  })

  // Cerrar posiciones que quedaron abiertas al final (exitDate: null — trade abierto al cierre del periodo)
  Object.entries(openSlots).forEach(([sym, slot]) => {
    const capFinal = slot.capAsignado * (1 + (slot.trade.pnlPct || 0) / 100)
    poolLibre += capFinal
    delete openSlots[sym]
  })

  // Build symbol → filtered OHLCV map para curva flotante
  const symbolDataMap = {}
  assetResults.forEach(ar => { symbolDataMap[ar.symbol] = ar.data ? ar.data.filter(d => d.date >= startDate) : [] })

  // Construir curvas fecha a fecha
  const step = Math.max(1, Math.floor(filteredDates.length / 400))
  const sampledDates = _sampledWithChanges(filteredDates, step, executedTrades)

  const simpleCurve = [], compoundCurve = [], floatSimpleCurve = [], floatCompoundCurve = []

  sampledDates.forEach(date => {
    const closedSoFar = executedTrades.filter(t => t.exitDate <= date)
    // Compound: capitalIni + suma de pnlSimple de trades cerrados
    // (= pool_libre + capital locked in open slots, sin flotar)
    const val = capitalIni + closedSoFar.reduce((s, t) => s + t.pnlSimple, 0)
    compoundCurve.push({ date, value: val })
    // Simple: base fija = capitalIni
    const simpleVal = capitalIni + closedSoFar.reduce((s, t) => s + capitalIni * (t.pnlPct / 100), 0)
    simpleCurve.push({ date, value: simpleVal })

    // Float: P&L no realizado de todos los trades activos
    const activeNow = allCandidates.filter(t => t.entryDate <= date && t.exitDate > date)
    let openPnlSimple = 0, openPnlCompound = 0
    activeNow.forEach(t => {
      const capEntry = capitalAtEntryMap[`${t.symbol}:${t.entryDate}`]
      if (capEntry == null) return
      const fData = symbolDataMap[t.symbol] || []
      let closePx = null
      for (let i = fData.length - 1; i >= 0; i--) { if (fData[i].date <= date) { closePx = fData[i].close; break } }
      if (closePx != null && t.entryPx) {
        const ret = (closePx - t.entryPx) / t.entryPx
        openPnlSimple += ret * capEntry
        openPnlCompound += ret * capEntry
      }
    })
    floatSimpleCurve.push({ date, value: simpleVal + openPnlSimple })
    floatCompoundCurve.push({ date, value: val + openPnlCompound })
  })

  // Ocupación: % del capital total desplegado en posiciones abiertas (capital-weighted)
  let _tInvDays = 0
  const occupancyCurve = sampledDates.map((date, i) => {
    const openTrades = allCandidates.filter(t =>
      capitalAtEntryMap[`${t.symbol}:${t.entryDate}`] != null &&
      t.entryDate <= date && (!t.exitDate || t.exitDate > date || (t._virtualClose && t.exitDate >= date))
    )
    // CAPITAL EMPLEADO unificado: COSTE de entrada de las posiciones abiertas (Σ capEntry), en EUROS.
    const openCapTotal = openTrades.reduce((s, t) => s + (capitalAtEntryMap[`${t.symbol}:${t.entryDate}`] || 0), 0)
    if (openTrades.length > 0) _tInvDays++
    return { date, value: openCapTotal }  // euros de coste
  })
  const tInvEstrategia = sampledDates.length > 0 ? (_tInvDays / sampledDates.length) * 100 : 0
  // Cap.inv% sobre base COSTE: media de (capitalEmpleado_coste / portfolioTotal × 100)
  const avgCapOccupancy = occupancyCurve.length && compoundCurve.length
    ? occupancyCurve.reduce((s, p, i) => {
        const total = compoundCurve[i]?.value || capitalIni
        return s + (total > 0 ? (p.value / total) * 100 : 0)
      }, 0) / occupancyCurve.length
    : 0

  // B&H combinado
  const slotBH = capitalIni / n
  const bhCurve = sampledDates.map(date => {
    let total = 0
    assetResults.forEach(ar => {
      const filtData = ar.data ? ar.data.filter(d => d.date >= startDate) : []
      const p0 = filtData.length ? filtData[0].close : null
      if (!p0) { total += slotBH; return }
      let bar = null
      for (let i = filtData.length - 1; i >= 0; i--) { if (filtData[i].date <= date) { bar = filtData[i]; break } }
      total += bar ? slotBH * (bar.close / p0) : slotBH
    })
    return { date, value: total }
  })

  const _descWinsCC = pnlDescartadosC.filter(p => p >= 0)
  const _descGrossWinCC = _descWinsCC.reduce((s, p) => s + p, 0)
  const _descGrossLossCC = Math.abs(pnlDescartadosC.filter(p => p < 0).reduce((s, p) => s + p, 0))
  const senalStatsC = {
    generadas:             senalesGeneradasC,
    ejecutadas:            cntEjecutadasC,
    descartadasPorSlots:   0,
    descartadasPorCapital: cntDescCapitalC,
    winRateDescartadas:    pnlDescartadosC.length ? _descWinsCC.length / pnlDescartadosC.length * 100 : null,
    pfDescartadas:         _descGrossLossCC > 0 ? _descGrossWinCC / _descGrossLossCC : _descGrossWinCC > 0 ? 99 : null,
    pnlHipoteticoDescartadas: pnlHipEurC,
  }

  return {
    simpleCurve, compoundCurve, bhCurve, occupancyCurve, startDate,
    executedTrades, floatSimpleCurve, floatCompoundCurve,
    tInvEstrategia, avgCapOccupancy, senalStats: senalStatsC,
    ..._calcDD(simpleCurve, compoundCurve, bhCurve, capitalIni),
    ..._calcFloatDD(floatSimpleCurve, floatCompoundCurve, capitalIni)
  }
}

// ── MODO CAPITAL CONCENTRADO: pool compartido con techo por posición según maxPosiciones ──
// prioridad: 'alfabetico' | 'score_metricas' | 'momentum' | 'fuerza_relativa' | 'max52'
// momentumN: lookback en días para criterio 'momentum' (default 20)
// sp500Data: array de barras del SP500 (para fuerza_relativa)
// symbolsList: array ordenado de símbolos del watchlist (para score_metricas legacy)
// scoreMap: {symbol: scoreMetricas} para prioridad 'score_metricas'
function buildConcentradoCurves(assetResults, capitalIni, maxPosiciones = 5, prioridad = 'alfabetico', momentumN = 20, sp500Data = null, symbolsList = null, scoreMap = null, criterioUso = 'desempate') {
  const n = assetResults.length
  if (!n) return _emptyCurves()
  const { startDate, filteredDates } = _commonDates(assetResults)
  if (!filteredDates.length) return _emptyCurves(startDate)

  // ── Índices de fecha por activo (para cálculo de scores de prioridad) ─────
  const _dataMap = {}
  const _dateIdxMap = {}
  assetResults.forEach(ar => {
    _dataMap[ar.symbol] = ar.data || []
    const m = {}
    ;(ar.data || []).forEach((d, i) => { m[d.date] = i })
    _dateIdxMap[ar.symbol] = m
  })

  // ── Función de score: menor score = mayor prioridad (entra antes) ──────────
  function _priorityScore(t) {
    if (prioridad === 'alfabetico') return null  // handled inline in sort
    if (prioridad === 'score_metricas' || prioridad === 'ranking') {
      // 'ranking' mantenido como alias legacy — ambos usan scoreMap si disponible
      if (scoreMap) {
        const s = scoreMap[t.symbol] ?? null
        return s != null ? -s : 999  // mayor score → entra antes
      }
      // fallback: orden por symbolsList
      const ri = symbolsList ? symbolsList.indexOf(t.symbol) : -1
      return ri >= 0 ? ri : (symbolsList ? symbolsList.length : 999)
    }
    const data = _dataMap[t.symbol] || []
    const idx  = _dateIdxMap[t.symbol]?.[t.entryDate]
    if (idx == null || data.length === 0) return 0

    if (prioridad === 'momentum') {
      const N = Math.max(1, momentumN || 20)
      if (idx < N) return 0
      const ret = (data[idx].close - data[idx - N].close) / data[idx - N].close
      return -ret  // mayor retorno → score más bajo → entra antes
    }
    if (prioridad === 'fuerza_relativa') {
      const LB = 63
      if (idx < LB) return 0
      const retAsset = (data[idx].close - data[idx - LB].close) / data[idx - LB].close
      if (!sp500Data || !sp500Data.length) {
        console.warn('[concentrado] fuerza_relativa: sp500Data no disponible, usando momentum N=63')
        return -retAsset
      }
      let spIdx = -1
      for (let i = sp500Data.length - 1; i >= 0; i--) {
        if (sp500Data[i].date <= t.entryDate) { spIdx = i; break }
      }
      if (spIdx < LB) return -retAsset
      const retSP = (sp500Data[spIdx].close - sp500Data[spIdx - LB].close) / sp500Data[spIdx - LB].close
      return -(retAsset - retSP)  // mayor alfa vs SP500 → entra antes
    }
    if (prioridad === 'max52') {
      const LB = Math.min(idx, 251)
      let max252 = -Infinity
      for (let i = idx - LB; i <= idx; i++) {
        const h = (data[i].high != null ? data[i].high : data[i].close)
        if (h > max252) max252 = h
      }
      if (max252 <= 0 || max252 === -Infinity) return 0
      return -(data[idx].close / max252)  // más cercano al máximo → entra antes
    }
    return 0
  }

  const allCandidates = assetResults.flatMap(ar =>
    (ar.trades || []).map(t => {
      const c = {
        symbol:        ar.symbol,
        entryDate:     t.entryDate,
        exitDate:      t.exitDate,
        pnlPct:        t.pnlPct,
        entryPx:       t.entryPrice ?? t.entryPx,
        stopPx:        t.stopHistory?.[0]?.stopPx ?? null,
        dias:          t.dias,
        _virtualClose: !!t._virtualClose,
      }
      c._ps = _priorityScore(c)
      return c
    })
  )
  allCandidates.sort((a, b) => {
    if (a.entryDate < b.entryDate) return -1
    if (a.entryDate > b.entryDate) return 1
    if (prioridad === 'alfabetico') return a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0
    return (a._ps ?? 0) - (b._ps ?? 0)
  })

  if (!allCandidates.length) return buildSlotsCurves(assetResults, capitalIni)

  const senalesGeneradas = allCandidates.length
  let cntEjecutadas = 0, cntDescSlots = 0, cntDescCapital = 0, cntDescGate = 0
  let pnlHipEur = 0
  const pnlDescartados = []

  let poolLibre = capitalIni
  const openSlots = {}
  const executedTrades = []
  const capitalAtEntryMap = {}

  const entriesByDate = {}
  allCandidates.forEach(t => {
    if (!entriesByDate[t.entryDate]) entriesByDate[t.entryDate] = []
    entriesByDate[t.entryDate].push(t)
  })

  const eventDates = [...new Set([
    ...allCandidates.map(t => t.entryDate),
    ...allCandidates.map(t => t.exitDate).filter(d => d != null),
  ])].sort()

  eventDates.forEach(date => {
    // 1. Cerrar primero (libera capital)
    const toClose = Object.keys(openSlots).filter(sym => openSlots[sym].trade.exitDate === date)
    toClose.forEach(symbol => {
      const { trade, capAsignado, totalPortfolioAtEntry: _tpAtEntry } = openSlots[symbol]
      if (!isFinite(trade.pnlPct)) { poolLibre += capAsignado; delete openSlots[symbol]; return }
      const capFinal = capAsignado * (1 + trade.pnlPct / 100)
      poolLibre += capFinal
      const _dist = (trade.stopPx && trade.entryPx && trade.entryPx > trade.stopPx)
        ? (trade.entryPx - trade.stopPx) / trade.entryPx : null
      executedTrades.push({
        ...trade,
        _capitalAtEntry: capAsignado,
        _totalPortfolioAtEntry: _tpAtEntry || capitalIni,
        capitalTras: capFinal,
        pnlSimple: capFinal - capAsignado,
        riesgoAcum: _dist ? capAsignado * _dist : capAsignado * 0.05,
      })
      delete openSlots[symbol]
    })

    // 2. Abrir entradas: cada una calcula su tamaño dinámicamente
    const entries = (entriesByDate[date] || []).filter(t => !openSlots[t.symbol])
    if (entries.length > 0 && poolLibre <= 0.01) {
      const _openCapsBlk = Object.values(openSlots).reduce((s, sl) => s + (sl.capAsignado || 0), 0)
      const _capMaxBlk = (poolLibre + _openCapsBlk) / Math.min(maxPosiciones, n)
      entries.forEach(t => {
        cntDescCapital++
        if (isFinite(t.pnlPct)) { pnlDescartados.push(t.pnlPct); pnlHipEur += _capMaxBlk * t.pnlPct / 100 }
      })
    }
    if (entries.length > 0 && poolLibre > 0.01) {
      // BUG B fix: contador de same-day trades abiertos en este batch
      // (no añaden a openSlots, así que slotsLibres debe compensarlo manualmente)
      let sameDayOpen = 0
      entries.forEach(t => {
        const posicionesAbiertas = Object.keys(openSlots).length
        // BUG B fix: descontar same-day trades del mismo batch para no superar maxPosiciones
        const slotsLibresEfectivos = maxPosiciones - posicionesAbiertas - sameDayOpen
        const openCapsTotal = Object.values(openSlots).reduce((s, sl) => s + (sl.capAsignado || 0), 0)
        const capitalTotal = poolLibre + openCapsTotal
        // Techo por posición: dividir entre el mínimo real de slots disponibles
        // (si hay menos activos que maxPosiciones, cada activo recibe mayor fracción)
        const slotsEfectivos = Math.min(maxPosiciones, n)
        const capMaxPorPosicion = capitalTotal / slotsEfectivos
        if (slotsLibresEfectivos <= 0) { cntDescSlots++; if (isFinite(t.pnlPct)) { pnlDescartados.push(t.pnlPct); pnlHipEur += capMaxPorPosicion * t.pnlPct / 100 } return }
        // GATE v1 (filtro de entrada): solo si criterioUso==='filtro' && prioridad==='fuerza_relativa'.
        // t._ps es el score NEGADO de la RS → "RS vs SP500 > 0" ⟺ t._ps < 0. Si la RS no es válida
        // (null/NaN: <63 barras o sin ^GSPC) se DEJA PASAR (no filtra ante la duda). Solo bloquea con dato válido y RS no positiva.
        if (criterioUso === 'filtro' && prioridad === 'fuerza_relativa' && t._ps != null && isFinite(t._ps) && t._ps >= 0) {
          cntDescGate++
          if (isFinite(t.pnlPct)) { pnlDescartados.push(t.pnlPct); pnlHipEur += capMaxPorPosicion * t.pnlPct / 100 }
          return
        }
        const capPorEntrada = Math.min(poolLibre, capMaxPorPosicion)
        if (capPorEntrada < 0.01) { cntDescCapital++; if (isFinite(t.pnlPct)) { pnlDescartados.push(t.pnlPct); pnlHipEur += capMaxPorPosicion * t.pnlPct / 100 } return }
        cntEjecutadas++
        poolLibre -= capPorEntrada
        const totalPortfolio = capitalTotal
        if (t.exitDate === date) {
          if (isFinite(t.pnlPct)) {
            const capFinal = capPorEntrada * (1 + t.pnlPct / 100)
            poolLibre += capFinal
            const _dist = (t.stopPx && t.entryPx && t.entryPx > t.stopPx)
              ? (t.entryPx - t.stopPx) / t.entryPx : null
            executedTrades.push({
              ...t,
              _capitalAtEntry: capPorEntrada,
              _totalPortfolioAtEntry: totalPortfolio,
              capitalTras: capFinal,
              pnlSimple: capFinal - capPorEntrada,
              riesgoAcum: _dist ? capPorEntrada * _dist : capPorEntrada * 0.05,
            })
          } else { poolLibre += capPorEntrada }
          sameDayOpen++  // BUG B fix: contabilizar slot consumido aunque no esté en openSlots
        } else {
          openSlots[t.symbol] = { trade: t, capAsignado: capPorEntrada, totalPortfolioAtEntry: totalPortfolio }
          capitalAtEntryMap[`${t.symbol}:${t.entryDate}`] = capPorEntrada
        }
      })
    }
  })

  // Cerrar posiciones abiertas al final del periodo (exitDate null o futuro)
  // BUG C fix: también registrar en executedTrades para que la compoundCurve
  // y assetStats los contabilicen correctamente
  Object.entries(openSlots).forEach(([, slot]) => {
    const { trade, capAsignado, totalPortfolioAtEntry } = slot
    const capFinal = capAsignado * (1 + (trade.pnlPct || 0) / 100)
    poolLibre += capFinal
    const _dist = (trade.stopPx && trade.entryPx && trade.entryPx > trade.stopPx)
      ? (trade.entryPx - trade.stopPx) / trade.entryPx : null
    executedTrades.push({
      ...trade,
      _capitalAtEntry: capAsignado,
      _totalPortfolioAtEntry: totalPortfolioAtEntry || capitalIni,
      capitalTras: capFinal,
      pnlSimple: capFinal - capAsignado,
      riesgoAcum: _dist ? capAsignado * _dist : capAsignado * 0.05,
    })
  })
  Object.keys(openSlots).forEach(sym => { delete openSlots[sym] })

  const symbolDataMap = {}
  assetResults.forEach(ar => { symbolDataMap[ar.symbol] = ar.data ? ar.data.filter(d => d.date >= startDate) : [] })

  const step = Math.max(1, Math.floor(filteredDates.length / 400))
  const sampledDates = _sampledWithChanges(filteredDates, step, executedTrades)

  const simpleCurve = [], compoundCurve = [], floatSimpleCurve = [], floatCompoundCurve = []
  sampledDates.forEach(date => {
    const closedSoFar = executedTrades.filter(t => t.exitDate <= date)
    const val = capitalIni + closedSoFar.reduce((s, t) => s + t.pnlSimple, 0)
    compoundCurve.push({ date, value: val })
    const simpleVal = capitalIni + closedSoFar.reduce((s, t) => s + capitalIni * (t.pnlPct / 100), 0)
    simpleCurve.push({ date, value: simpleVal })
    const activeNow = allCandidates.filter(t => t.entryDate <= date && t.exitDate > date)
    let openPnlSimple = 0, openPnlCompound = 0
    activeNow.forEach(t => {
      const capEntry = capitalAtEntryMap[`${t.symbol}:${t.entryDate}`]
      if (capEntry == null) return
      const fData = symbolDataMap[t.symbol] || []
      let closePx = null
      for (let i = fData.length - 1; i >= 0; i--) { if (fData[i].date <= date) { closePx = fData[i].close; break } }
      if (closePx != null && t.entryPx) {
        const ret = (closePx - t.entryPx) / t.entryPx
        openPnlSimple += ret * capEntry
        openPnlCompound += ret * capEntry
      }
    })
    floatSimpleCurve.push({ date, value: simpleVal + openPnlSimple })
    floatCompoundCurve.push({ date, value: val + openPnlCompound })
  })

  let _tInvDays = 0
  const occupancyCurve = sampledDates.map((date, i) => {
    const openTrades = allCandidates.filter(t =>
      capitalAtEntryMap[`${t.symbol}:${t.entryDate}`] != null &&
      t.entryDate <= date && (!t.exitDate || t.exitDate > date || (t._virtualClose && t.exitDate >= date))
    )
    // CAPITAL EMPLEADO unificado: COSTE de entrada de las posiciones abiertas (Σ capEntry), en EUROS.
    // Sin (1+ret): estable, no se mueve con el precio (mismo criterio que Cap. disponible del Dashboard).
    const openCapTotal = openTrades.reduce((s, t) => s + (capitalAtEntryMap[`${t.symbol}:${t.entryDate}`] || 0), 0)
    if (openTrades.length > 0) _tInvDays++
    return { date, value: openCapTotal }  // euros de coste
  })
  const tInvEstrategia = sampledDates.length > 0 ? (_tInvDays / sampledDates.length) * 100 : 0
  // avgCapOccupancy: media de (capitalEmpleado_coste / portfolioTotal × 100) — % para la tabla
  const avgCapOccupancy = occupancyCurve.length && compoundCurve.length
    ? occupancyCurve.reduce((s, p, i) => {
        const total = compoundCurve[i]?.value || capitalIni
        return s + (total > 0 ? (p.value / total) * 100 : 0)
      }, 0) / occupancyCurve.length
    : 0

  const slotBH = capitalIni / n
  const bhCurve = sampledDates.map(date => {
    let total = 0
    assetResults.forEach(ar => {
      const filtData = ar.data ? ar.data.filter(d => d.date >= startDate) : []
      const p0 = filtData.length ? filtData[0].close : null
      if (!p0) { total += slotBH; return }
      let bar = null
      for (let i = filtData.length - 1; i >= 0; i--) { if (filtData[i].date <= date) { bar = filtData[i]; break } }
      total += bar ? slotBH * (bar.close / p0) : slotBH
    })
    return { date, value: total }
  })

  const _descWinsC = pnlDescartados.filter(p => p >= 0)
  const _descGrossWinC = _descWinsC.reduce((s, p) => s + p, 0)
  const _descGrossLossC = Math.abs(pnlDescartados.filter(p => p < 0).reduce((s, p) => s + p, 0))
  const senalStats = {
    generadas:            senalesGeneradas,
    ejecutadas:           cntEjecutadas,
    descartadasPorSlots:  cntDescSlots,
    descartadasPorCapital: cntDescCapital,
    descartadasPorGate:   cntDescGate,
    winRateDescartadas:   pnlDescartados.length ? _descWinsC.length / pnlDescartados.length * 100 : null,
    pfDescartadas:        _descGrossLossC > 0 ? _descGrossWinC / _descGrossLossC : _descGrossWinC > 0 ? 99 : null,
    pnlHipoteticoDescartadas: pnlHipEur,
  }

  return {
    simpleCurve, compoundCurve, bhCurve, occupancyCurve, startDate,
    executedTrades, floatSimpleCurve, floatCompoundCurve,
    tInvEstrategia, avgCapOccupancy, senalStats,
    ..._calcDD(simpleCurve, compoundCurve, bhCurve, capitalIni),
    ..._calcFloatDD(floatSimpleCurve, floatCompoundCurve, capitalIni)
  }
}

// ── MODO POSITION SIZING: tamaño variable basado en stop loss ──
function buildPositionSizingCurves(assetResults, capitalIni, sizeRules) {
  const { riskPerTrade=5, maxPortfolioPct=20, maxAccumRisk=20 } = sizeRules || {}
  const riskPct   = riskPerTrade / 100
  const maxPctCap = maxPortfolioPct / 100
  const maxAccum  = maxAccumRisk / 100
  const n = assetResults.length
  if (!n) return _emptyCurves()
  const { startDate, filteredDates } = _commonDates(assetResults)
  if (!filteredDates.length) return _emptyCurves(startDate)

  const allCandidates = assetResults.flatMap(ar =>
    (ar.trades || []).map(t => ({
      symbol:        ar.symbol,
      entryDate:     t.entryDate,
      exitDate:      t.exitDate,
      pnlPct:        t.pnlPct,
      entryPrice:    t.entryPrice ?? t.entryPx,
      stopPx:        t.stopHistory?.[0]?.stopPx ?? null,
      dias:          Math.round((new Date(t.exitDate) - new Date(t.entryDate)) / 86400000),
      _virtualClose: !!t._virtualClose,
    }))
  ).sort((a, b) => a.entryDate < b.entryDate ? -1 : a.entryDate > b.entryDate ? 1 : a.symbol < b.symbol ? -1 : 1)

  if (!allCandidates.length) return buildSlotsCurves(assetResults, capitalIni)

  const senalesGeneradasPS = allCandidates.length
  let cntEjecutadasPS = 0, cntDescRiesgoPS = 0, cntDescCapitalPS = 0
  let pnlHipEurPS = 0
  const pnlDescartadosPS = []

  let poolLibre = capitalIni
  let riesgoAcumulado = 0
  const openSlots = {}          // { symbol: { trade, capAsignado, riesgoAsignado } }
  const executedTrades = []
  const capitalAtEntryMap = {}  // `${symbol}:${entryDate}` → capAsignado

  const entriesByDate = {}
  allCandidates.forEach(t => {
    if (!entriesByDate[t.entryDate]) entriesByDate[t.entryDate] = []
    entriesByDate[t.entryDate].push(t)
  })

  const eventDates = [...new Set([
    ...allCandidates.map(t => t.entryDate),
    ...allCandidates.map(t => t.exitDate),
  ])].sort()

  eventDates.forEach(date => {
    // 1. Cerrar posiciones que cierran hoy
    const toClose = Object.keys(openSlots)
      .filter(sym => openSlots[sym].trade.exitDate === date)
    toClose.forEach(symbol => {
      const { trade, capAsignado, riesgoAsignado, totalPortfolioAtEntry: _tpAtEntryPS } = openSlots[symbol]
      if (!isFinite(trade.pnlPct)) {
        poolLibre += capAsignado
        riesgoAcumulado -= riesgoAsignado
        delete openSlots[symbol]
        return
      }
      const capFinal = capAsignado * (1 + trade.pnlPct / 100)
      poolLibre += capFinal
      const riesgoAntes = riesgoAcumulado
      riesgoAcumulado -= riesgoAsignado
      executedTrades.push({
        ...trade,
        _capitalAtEntry: capAsignado,
        _totalPortfolioAtEntry: _tpAtEntryPS || capitalIni,
        capitalTras: capFinal,
        pnlSimple: capFinal - capAsignado,
        riesgoAcum: riesgoAntes,
      })
      delete openSlots[symbol]
    })

    // 2. Abrir entradas de hoy
    const entries = (entriesByDate[date] || [])
      .filter(t => !openSlots[t.symbol])

    entries.forEach(t => {
      if (!isFinite(t.pnlPct)) return
      const ep = t.entryPrice
      if (!ep || ep <= 0) return

      // Capital dinámico: capitalIni + ganancias realizadas hasta ahora
      const capitalActual = capitalIni + executedTrades.reduce((s, x) => s + x.pnlSimple, 0)
      const _openCapsPS = Object.values(openSlots).reduce((s, slot) => s + (slot.capAsignado || 0), 0)
      const _totalPortfolioPS = poolLibre + _openCapsPS

      let distancia = null
      if (t.stopPx != null && t.stopPx > 0 && ep > t.stopPx) {
        distancia = (ep - t.stopPx) / ep
      }

      let capAsignado
      if (distancia && distancia > 0) {
        capAsignado = Math.min(
          capitalActual * riskPct / distancia,
          capitalActual * maxPctCap
        )
      } else {
        capAsignado = capitalActual * maxPctCap
      }

      const riesgoEsteTrade = distancia
        ? capAsignado * distancia
        : capitalActual * maxPctCap

      const _capSizedPS = capAsignado  // tamaño dimensionado antes del clamp a poolLibre
      if (riesgoAcumulado + riesgoEsteTrade > capitalActual * maxAccum) { cntDescRiesgoPS++; if (isFinite(t.pnlPct)) { pnlDescartadosPS.push(t.pnlPct); pnlHipEurPS += _capSizedPS * t.pnlPct / 100 } return }
      if (capAsignado > poolLibre) capAsignado = poolLibre
      if (capAsignado <= 0) { cntDescCapitalPS++; if (isFinite(t.pnlPct)) { pnlDescartadosPS.push(t.pnlPct); pnlHipEurPS += _capSizedPS * t.pnlPct / 100 } return }
      cntEjecutadasPS++

      if (t.exitDate === date) {
        const capFinal = capAsignado * (1 + t.pnlPct / 100)
        poolLibre -= capAsignado
        poolLibre += capFinal
        executedTrades.push({
          ...t,
          _capitalAtEntry: capAsignado,
          _totalPortfolioAtEntry: _totalPortfolioPS,
          capitalTras: capFinal,
          pnlSimple: capFinal - capAsignado,
          riesgoAcum: riesgoAcumulado,
        })
        return
      }

      poolLibre -= capAsignado
      riesgoAcumulado += riesgoEsteTrade
      openSlots[t.symbol] = { trade: t, capAsignado, riesgoAsignado: riesgoEsteTrade, totalPortfolioAtEntry: _totalPortfolioPS }
      capitalAtEntryMap[`${t.symbol}:${t.entryDate}`] = capAsignado
    })
  })

  // ── Build symbol → filtered OHLCV map para curva flotante ──
  const symbolDataMap = {}
  assetResults.forEach(ar => { symbolDataMap[ar.symbol] = ar.data ? ar.data.filter(d => d.date >= startDate) : [] })

  // ── Construir curvas (mismo patrón que buildCompartidoCurves) ──
  const step = Math.max(1, Math.floor(filteredDates.length / 400))
  const sampledDates = _sampledWithChanges(filteredDates, step, executedTrades)

  const simpleCurve = [], compoundCurve = [], floatSimpleCurve = [], floatCompoundCurve = []

  sampledDates.forEach(date => {
    const closedSoFar = executedTrades.filter(t => t.exitDate <= date)
    const val = capitalIni + closedSoFar.reduce((s, t) => s + t.pnlSimple, 0)
    compoundCurve.push({ date, value: val })
    const simpleVal = capitalIni + closedSoFar.reduce((s, t) => s + capitalIni * (t.pnlPct / 100), 0)
    simpleCurve.push({ date, value: simpleVal })

    const activeNow = allCandidates.filter(t => t.entryDate <= date && t.exitDate > date)
    let openPnlSimple = 0, openPnlCompound = 0
    activeNow.forEach(t => {
      const capEntry = capitalAtEntryMap[`${t.symbol}:${t.entryDate}`]
      if (capEntry == null) return
      const fData = symbolDataMap[t.symbol] || []
      let closePx = null
      for (let i = fData.length - 1; i >= 0; i--) { if (fData[i].date <= date) { closePx = fData[i].close; break } }
      if (closePx != null && t.entryPrice) {
        const ret = (closePx - t.entryPrice) / t.entryPrice
        openPnlSimple += ret * capEntry
        openPnlCompound += ret * capEntry
      }
    })
    floatSimpleCurve.push({ date, value: simpleVal + openPnlSimple })
    floatCompoundCurve.push({ date, value: val + openPnlCompound })
  })

  let _tInvDaysPS = 0
  const occupancyCurve = sampledDates.map((date, i) => {
    const openTrades = allCandidates.filter(t =>
      capitalAtEntryMap[`${t.symbol}:${t.entryDate}`] != null &&
      t.entryDate <= date && (!t.exitDate || t.exitDate > date || (t._virtualClose && t.exitDate >= date))
    )
    // CAPITAL EMPLEADO unificado: COSTE de entrada de las posiciones abiertas (Σ capEntry), en EUROS.
    const openCapTotal = openTrades.reduce((s, t) => s + (capitalAtEntryMap[`${t.symbol}:${t.entryDate}`] || 0), 0)
    if (openTrades.length > 0) _tInvDaysPS++
    return { date, value: openCapTotal }  // euros de coste
  })
  const tInvEstrategia = sampledDates.length > 0 ? (_tInvDaysPS / sampledDates.length) * 100 : 0
  // Cap.inv% sobre base COSTE: media de (capitalEmpleado_coste / portfolioTotal × 100)
  const avgCapOccupancy = occupancyCurve.length && compoundCurve.length
    ? occupancyCurve.reduce((s, p, i) => {
        const total = compoundCurve[i]?.value || capitalIni
        return s + (total > 0 ? (p.value / total) * 100 : 0)
      }, 0) / occupancyCurve.length
    : 0

  const slotBH = capitalIni / n
  const bhCurve = sampledDates.map(date => {
    let total = 0
    assetResults.forEach(ar => {
      const filtData = ar.data ? ar.data.filter(d => d.date >= startDate) : []
      const p0 = filtData.length ? filtData[0].close : null
      if (!p0) { total += slotBH; return }
      let bar = null
      for (let i = filtData.length - 1; i >= 0; i--) { if (filtData[i].date <= date) { bar = filtData[i]; break } }
      total += bar ? slotBH * (bar.close / p0) : slotBH
    })
    return { date, value: total }
  })

  const _descWinsPS = pnlDescartadosPS.filter(p => p >= 0)
  const _descGrossWinPS = _descWinsPS.reduce((s, p) => s + p, 0)
  const _descGrossLossPS = Math.abs(pnlDescartadosPS.filter(p => p < 0).reduce((s, p) => s + p, 0))
  const senalStatsPS = {
    generadas:             senalesGeneradasPS,
    ejecutadas:            cntEjecutadasPS,
    descartadasPorSlots:   0,
    descartadasPorRiesgo:  cntDescRiesgoPS,
    descartadasPorCapital: cntDescCapitalPS,
    winRateDescartadas:    pnlDescartadosPS.length ? _descWinsPS.length / pnlDescartadosPS.length * 100 : null,
    pfDescartadas:         _descGrossLossPS > 0 ? _descGrossWinPS / _descGrossLossPS : _descGrossWinPS > 0 ? 99 : null,
    pnlHipoteticoDescartadas: pnlHipEurPS,
  }

  return {
    simpleCurve, compoundCurve, bhCurve, occupancyCurve, startDate,
    executedTrades, floatSimpleCurve, floatCompoundCurve,
    tInvEstrategia, avgCapOccupancy, senalStats: senalStatsPS,
    ..._calcDD(simpleCurve, compoundCurve, bhCurve, capitalIni),
    ..._calcFloatDD(floatSimpleCurve, floatCompoundCurve, capitalIni)
  }
}

// ── MODO PESOS PERSONALIZADOS: cada activo con su % fijo ─────
// weights: {symbol: pct}  (pct en 0–100, suma = 100)
function buildCustomCurves(assetResults, capitalIni, weights) {
  const n = assetResults.length
  if (!n) return _emptyCurves()
  const { filteredDates, startDate } = _commonDates(assetResults)
  if (!filteredDates.length) return _emptyCurves(startDate)

  // Capital por activo según su peso
  const assetEquities = assetResults.map(ar => {
    const pct = weights?.[ar.symbol] ?? (100 / n)
    const slotCapital = capitalIni * (pct / 100)
    const { trades, data } = ar
    const filtData = data ? data.filter(d => d.date >= startDate) : []
    const p0 = filtData.length ? filtData[0].close : null
    const byDate = {}
    filteredDates.forEach(date => {
      const exitsBefore = trades.filter(t => t.exitDate <= date)
      // Reescalar pnlSimple al capital real del slot (el backtest usó slotCapital=capitalIni/n)
      // pnlPct es independiente → recalcular
      const simple = slotCapital + exitsBefore.reduce((s,t) => s + (slotCapital * t.pnlPct / 100), 0)
      // Para compuesta: escalar capitalTras (fue calculado con capitalIni/n)
      const origSlot = capitalIni / n  // capital usado en el backtest original
      const scale = slotCapital / origSlot
      const compound = exitsBefore.length
        ? slotCapital + (exitsBefore[exitsBefore.length-1].capitalTras - origSlot) * scale
        : slotCapital
      const openTrades = trades.filter(t => t.entryDate <= date && (!t.exitDate || t.exitDate > date || (t._virtualClose && t.exitDate >= date)))
      const open = openTrades.length > 0
      let bh = slotCapital, closePx = null
      if (p0 && filtData.length) {
        let bar = null
        for (let i = filtData.length-1; i>=0; i--) { if (filtData[i].date <= date) { bar=filtData[i]; break } }
        if (bar) { bh = slotCapital * (bar.close / p0); closePx = bar.close }
      }
      const openPnl = openTrades.reduce((s,t) => { if(closePx==null) return s; const ep=t.entryPx??t.entryPrice; return ep!=null ? s+(closePx-ep)/ep*slotCapital : s }, 0)
      byDate[date] = { simple, compound, open, bh, openPnl }
    })
    return { byDate, slotCapital }
  })

  const simpleCurve=[], compoundCurve=[], bhCurve=[], occupancyCurve=[], floatSimpleCurve=[], floatCompoundCurve=[]
  const totalSlots = assetResults.length
  const step = Math.max(1, Math.floor(filteredDates.length / 400))
  _sampledWithChanges(filteredDates, step, assetResults.flatMap(ar=>ar.trades||[])).forEach(date => {
    let totSimple=0, totCompound=0, totBH=0, openSlots=0, totOpenPnl=0
    assetEquities.forEach(({ byDate }) => {
      const e = byDate[date]
      if (e) { totSimple+=e.simple; totCompound+=e.compound; totBH+=e.bh; if(e.open)openSlots++; totOpenPnl+=e.openPnl||0 }
    })
    simpleCurve.push({ date, value: totSimple })
    compoundCurve.push({ date, value: totCompound })
    bhCurve.push({ date, value: totBH })
    occupancyCurve.push({ date, value: (openSlots/totalSlots)*100 })
    floatSimpleCurve.push({ date, value: totSimple+totOpenPnl })
    floatCompoundCurve.push({ date, value: totCompound+totOpenPnl })
  })

  return { simpleCurve, compoundCurve, bhCurve, occupancyCurve, startDate, floatSimpleCurve, floatCompoundCurve, ..._calcDD(simpleCurve, compoundCurve, bhCurve, capitalIni), ..._calcFloatDD(floatSimpleCurve, floatCompoundCurve, capitalIni) }
}

// ── Helpers ──────────────────────────────────────────────────
function _emptyCurves(startDate=null) {
  return { simpleCurve:[], compoundCurve:[], bhCurve:[], occupancyCurve:[], startDate,
    maxDDSimple:0, maxDDSimpleDate:null, maxDDCompound:0, maxDDCompoundDate:null, maxDDBH:0, maxDDBHDate:null,
    floatSimpleCurve:[], floatCompoundCurve:[],
    maxDDFloatSimple:0, maxDDFloatSimpleDate:null, maxDDFloatCompound:0, maxDDFloatCompoundDate:null }
}
function _commonDates(assetResults) {
  const dateSet = new Set()
  assetResults.forEach(ar => { if (ar.data) ar.data.forEach(d => dateSet.add(d.date)) })
  const allDates = [...dateSet].sort()
  const startDate = assetResults.reduce((mx, ar) => {
    const s = ar.startDate?.toISOString?.().split('T')[0] || ar.startDate
    return s > mx ? s : mx
  }, '0000-00-00')
  const filteredDates = allDates.filter(d => d >= startDate)
  return { allDates, startDate, filteredDates }
}
function _calcDD(simpleCurve, compoundCurve, bhCurve, capitalIni) {
  const calcDD = curve => {
    let peak=curve[0]?.value||capitalIni, maxDD=0, maxDDDate=null, ddPeak=peak, ddValley=peak
    curve.forEach(p=>{ if(p.value>peak)peak=p.value; const dd=(peak-p.value)/peak*100; if(dd>maxDD){maxDD=dd;maxDDDate=p.date;ddPeak=peak;ddValley=p.value} })
    return { maxDD, maxDDDate, maxDDEur: ddValley - ddPeak }
  }
  const { maxDD:maxDDSimple, maxDDDate:maxDDSimpleDate, maxDDEur:maxDDSimpleEur } = calcDD(simpleCurve)
  const { maxDD:maxDDCompound, maxDDDate:maxDDCompoundDate, maxDDEur:maxDDCompoundEur } = calcDD(compoundCurve)
  const { maxDD:maxDDBH, maxDDDate:maxDDBHDate, maxDDEur:maxDDBHEur } = calcDD(bhCurve)
  return { maxDDSimple, maxDDSimpleDate, maxDDCompound, maxDDCompoundDate, maxDDBH, maxDDBHDate, maxDDSimpleEur, maxDDCompoundEur, maxDDBHEur }
}
function _calcFloatDD(floatSimpleCurve, floatCompoundCurve, capitalIni) {
  const calcDD = curve => {
    if(!curve?.length) return { maxDD:0, maxDDDate:null, maxDDEur:0 }
    let peak=curve[0]?.value||capitalIni, maxDD=0, maxDDDate=null, ddPeak=peak, ddValley=peak
    curve.forEach(p=>{ if(!p)return; if(p.value>peak)peak=p.value; const dd=(peak-p.value)/peak*100; if(dd>maxDD){maxDD=dd;maxDDDate=p.date;ddPeak=peak;ddValley=p.value} })
    return { maxDD, maxDDDate, maxDDEur: ddValley - ddPeak }
  }
  const { maxDD:maxDDFloatSimple, maxDDDate:maxDDFloatSimpleDate, maxDDEur:maxDDFloatSimpleEur } = calcDD(floatSimpleCurve)
  const { maxDD:maxDDFloatCompound, maxDDDate:maxDDFloatCompoundDate, maxDDEur:maxDDFloatCompoundEur } = calcDD(floatCompoundCurve)
  return { maxDDFloatSimple, maxDDFloatSimpleDate, maxDDFloatCompound, maxDDFloatCompoundDate, maxDDFloatSimpleEur, maxDDFloatCompoundEur }
}

// ── buildTrades: convierte rawTrades {entryDate,exitDate,entryPrice,exitPrice} a trades enriquecidos ──
// Copia exacta de datos.js para mantener formato compatible con curvas de equity
function buildTrades(rawTrades, capitalIni, allocationPct = 100) {
  const fixedAlloc = capitalIni * (allocationPct / 100)
  let compoundCapital = capitalIni
  return rawTrades
    .filter(t => t.entryDate && t.exitDate && t.entryPrice > 0 && t.exitPrice > 0)
    .map(t => {
      const sharesSimple   = fixedAlloc / t.entryPrice
      const pnlSimple      = (t.exitPrice - t.entryPrice) * sharesSimple
      const pnlPct         = (t.exitPrice / t.entryPrice - 1) * 100
      const compAlloc      = compoundCapital * (allocationPct / 100)
      const sharesCompound = compAlloc / t.entryPrice
      const pnlCompound    = (t.exitPrice - t.entryPrice) * sharesCompound
      compoundCapital     += pnlCompound
      const dias = Math.max(1, Math.round((new Date(t.exitDate) - new Date(t.entryDate)) / 86400000))
      return { ...t, shares: sharesSimple, pnlSimple, pnlPct, capitalTras: compoundCapital, dias }
    })
}

// ── runCodeJsAsset: ejecuta code_js de una estrategia sobre un activo ──
// Sandbox idéntica a datos.js. Si falla → { trades:[], indicators:{}, filterZones:[] }
function runCodeJsAsset(data, sp500Data, codeJs, slotCapital, years, cfg) {
  try {
    const sp500Map = {}
    if (sp500Data) sp500Data.forEach(d => { sp500Map[d.date] = d.close })
    const enrichedData = data.map(d => ({ ...d, sp500Close: sp500Map[d.date] ?? null }))
    const wrappedCode = `"use strict";\n${codeJs}\nreturn run;`
    const getRunFn = new Function('calcEMA','calcSMA','calcRSI','calcATR','calcMACD', wrappedCode)
    const runFn = getRunFn(_libEMA, calcSMA, calcRSI, _libATR, calcMACD)
    const result = runFn(enrichedData, {
      ...(cfg || {}),
      capital_ini:    slotCapital,
      years:          cfg?.years ?? 5,
      allocation_pct: 100,
    })
    const rawTrades   = result.trades      ?? []
    const indicators  = result.indicators  ?? {}
    const filterZones = result.filterZones ?? []
    // Flush virtual: posición abierta al final del periodo
    const lastBar = data[data.length - 1]
    const openPos = result.openPosition ?? null
    if (openPos && openPos.entryDate && openPos.entryPrice > 0) {
      // Convención nueva: la estrategia expone openPosition explícitamente
      rawTrades.push({
        entryDate:     openPos.entryDate,
        exitDate:      lastBar.date,
        entryPrice:    openPos.entryPrice,
        exitPrice:     lastBar.close,
        stopPx:        openPos.stopPx ?? null,
        exitReason:    'virtual_close',
        _virtualClose: true,
      })
    } else if (rawTrades.length > 0) {
      // Fallback: convención antigua (push sin exitDate en entrada)
      const lastRaw = rawTrades[rawTrades.length - 1]
      if (lastRaw && !lastRaw.exitDate && lastRaw.entryPrice > 0) {
        rawTrades[rawTrades.length - 1] = {
          ...lastRaw,
          exitDate:      lastBar.date,
          exitPrice:     lastBar.close,
          _virtualClose: true,
        }
      }
    }
    const trades = buildTrades(rawTrades, slotCapital)
    return { trades, indicators, filterZones }
  } catch(e) {
    console.error('[runCodeJsAsset] error:', e.message)
    return { trades: [], indicators: {}, filterZones: [] }
  }
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

// ── Max Drawdown del precio de cierre (para B&H por activo) ──
function _calcPriceMaxDD(data, startDate) {
  const filtered = startDate ? data.filter(d => d.date >= startDate) : data
  if (!filtered.length) return { pct: 0, factor: 0 }
  const p0 = filtered[0].close
  let peak = filtered[0].close, maxDD = 0, ddPeak = peak, ddValley = peak
  filtered.forEach(d => {
    if (d.close > peak) peak = d.close
    const dd = (peak - d.close) / peak * 100
    if (dd > maxDD) { maxDD = dd; ddPeak = peak; ddValley = d.close }
  })
  return { pct: maxDD, factor: p0 > 0 ? (ddValley - ddPeak) / p0 : 0 }
}

// ── Max Drawdown real + T.invertido + Cap.inv.medio con curva de precio diaria ──
function _calcAssetMaxDD(trades, data, slotCapital, startDate) {
  if (!data || data.length === 0) return { maxDD: 0, maxDDDate: null, tInvertido: 0, capInvMedio: 0 }
  const filteredData = startDate ? data.filter(d => d.date >= startDate) : data
  if (!filteredData.length) return { maxDD: 0, maxDDDate: null, tInvertido: 0, capInvMedio: 0 }
  let peak = slotCapital, maxDD = 0, maxDDDate = null, lastCapital = slotCapital
  let ddPeak = slotCapital, ddValley = slotCapital
  let daysOpen = 0, sumCapInvRatio = 0, totalBars = 0
  filteredData.forEach(bar => {
    const date = bar.date, close = bar.close
    const closed = trades.filter(t => t.exitDate && t.exitDate <= date)
    if (closed.length > 0) { lastCapital = closed[closed.length - 1].capitalTras }
    const open = trades.filter(t => t.entryDate <= date && (!t.exitDate || t.exitDate > date))
    const openPnl = open.reduce((s, t) => {
      const ep = t.entryPrice || t.entryPx
      if (!ep || ep <= 0) return s
      return s + ((close - ep) / ep) * (t.shares * ep)
    }, 0)
    const floatEquity = lastCapital + openPnl
    if (floatEquity > peak) peak = floatEquity
    if (peak > 0) { const dd = (peak - floatEquity) / peak * 100; if (dd > maxDD) { maxDD = dd; maxDDDate = date; ddPeak = peak; ddValley = floatEquity } }
    totalBars++
    if (open.length > 0) {
      daysOpen++
      const capInv = open.reduce((s, t) => s + (t.shares || 0) * close, 0)
      sumCapInvRatio += slotCapital > 0 ? capInv / slotCapital : 0
    }
  })
  return {
    maxDD,
    maxDDDate,
    maxDDEur: ddValley - ddPeak,
    tInvertido: totalBars > 0 ? (daysOpen / totalBars) * 100 : 0,
    capInvMedio: totalBars > 0 ? (sumCapInvRatio / totalBars) * 100 : 0,
    totalBars,
  }
}

// ── PORTFOLIO MODE: N estrategias × M símbolos, un único pool ────────────────
// req.body: {
//   portfolioMode: true,
//   strategies: [{ id, name, symbols[] }],   // orden = prioridad de desempate
//   cfg: { capitalIni, years, fromDate?, toDate? },
//   modoAsig: 'concentrado' | 'compartido',
//   sizeRules: { maxPosiciones },             // prioridad forzada a 'alfabetico' (Fase 2: momentum/score)
//   intervalo: 'diario' | 'semanal',
// }
// Símbolo sintético: `${ticker}#${stratOrder.padStart(3,'0')}`
// → orden alfabético del sintético = (ticker, orden_estrategia)  → desempate determinista
// → buildConcentradoCurves no se modifica; ve N activos "distintos"
async function handlePortfolioMode(req, res) {
  const {
    strategies,
    cfg,
    modoAsig = 'concentrado',
    sizeRules: sizeRulesBody = null,
    filtros: filtrosCfg,
    intervalo,
  } = req.body

  if (!Array.isArray(strategies) || strategies.length < 2)
    return res.status(400).json({ error: 'portfolioMode requiere strategies[] con ≥2 entradas' })
  if (!cfg?.capitalIni)
    return res.status(400).json({ error: 'cfg.capitalIni requerido' })

  const sizeRules     = sizeRulesBody || {}
  const assetInterval = intervalo === 'semanal' ? '1wk' : '1d'

  try {
    // 1. Cargar code_js + params de cada estrategia desde Supabase (en paralelo)
    const stratMeta = await Promise.all(strategies.map(async (s, stratOrder) => {
      const base = { ...s, stratOrder, codeJs: null, effectiveCfg: cfg }
      if (!SUPA_URL || !SUPA_KEY) return base
      try {
        const sr = await fetch(
          `${SUPA_URL}/rest/v1/strategies?id=eq.${s.id}&select=code_js,params,name`,
          { headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` } }
        )
        if (!sr.ok) return base
        const row = (await sr.json())?.[0] || {}
        let stratParams = {}
        try { stratParams = row.params ? (typeof row.params === 'string' ? JSON.parse(row.params) : row.params) : {} } catch(_) {}
        return {
          ...s,
          stratOrder,
          name:        s.name || row.name || s.id,
          codeJs:      row.code_js || null,
          effectiveCfg: { ...cfg, ...stratParams },
        }
      } catch(_) { return base }
    }))

    // 2. Descargar OHLCV con cache por ticker (cada ticker solo una vez)
    const allTickers = [...new Set(stratMeta.flatMap(s => s.symbols || []))]
    const tickerCache = {}
    const BATCH = 4
    for (let i = 0; i < allTickers.length; i += BATCH) {
      const chunk = allTickers.slice(i, i + BATCH)
      await Promise.all(chunk.map(async ticker => {
        tickerCache[ticker] = await fetchData(ticker, cfg.years ?? 5, cfg.fromDate ?? null, cfg.toDate ?? null, assetInterval)
      }))
      if (i + BATCH < allTickers.length) await sleep(400)
    }

    let sp500Data = null
    try { sp500Data = await fetchData('^GSPC', cfg.years ?? 5, cfg.fromDate ?? null, cfg.toDate ?? null) } catch(_) {}

    // 3. Pre-contar pares válidos → slotCapital correcto antes de runCodeJsAsset
    let nPairs = 0
    for (const s of stratMeta) {
      if (!s.codeJs) continue
      for (const ticker of (s.symbols || []))
        if (tickerCache[ticker]?.length) nPairs++
    }
    if (!nPairs) return res.status(400).json({ error: 'No hay pares (estrategia×símbolo) con datos válidos' })
    const slotCapital = cfg.capitalIni / nPairs

    // 4. runCodeJsAsset por (estrategia, símbolo) → símbolo sintético determinista
    //    Símbolo sintético: `${ticker}#${stratOrder.padStart(3,'0')}`
    //    → el orden alfabético del sintético refleja (ticker, orden_estrategia)
    //    → buildConcentradoCurves ve N activos distintos; openSlots no colisiona
    //    Nota: slotCapital pasado a runCodeJsAsset solo afecta capitalTras del
    //    historial por símbolo — el pool recalcula todo desde pnlPct × capAsignado
    const assetResults = []
    for (const s of stratMeta) {
      if (!s.codeJs) continue
      const orderTag = String(s.stratOrder).padStart(3, '0')
      for (const ticker of (s.symbols || [])) {
        const data = tickerCache[ticker]
        if (!data?.length) continue
        const synSym = `${ticker}#${orderTag}`
        const { trades: rawTrades } = runCodeJsAsset(data, sp500Data, s.codeJs, slotCapital, cfg.years ?? 5, s.effectiveCfg)
        // Enriquecer cada trade con metadata de estrategia
        const trades = rawTrades.map(t => ({
          ...t,
          _stratId:    s.id,
          _stratName:  s.name,
          _stratOrder: s.stratOrder,
          _realSymbol: ticker,
        }))
        const cutoff = new Date(data[data.length - 1].date)
        cutoff.setFullYear(cutoff.getFullYear() - (cfg.years ?? 5))
        const startDate = cutoff.toISOString().split('T')[0]
        assetResults.push({
          symbol:      synSym,
          _realSymbol: ticker,
          _stratId:    s.id,
          _stratName:  s.name,
          _stratOrder: s.stratOrder,
          data,
          trades,
          capitalReinv:   trades.length ? trades[trades.length - 1].capitalTras : slotCapital,
          gananciaSimple: trades.reduce((acc, t) => acc + t.pnlSimple, 0),
          startDate,
          blockEvents: {},
        })
      }
    }

    const n = assetResults.length
    if (!n) return res.status(400).json({ error: 'No se pudieron ejecutar señales para ningún par (estrategia×símbolo)' })

    // 4b. Filtros de mercado — portar el mismo bloque del path único
    //     Se ejecuta DESPUÉS de runCodeJsAsset (assetResults ya tiene trades con metadata)
    //     y ANTES de construir curvas. Los datos auxiliares se descargan UNA sola vez.
    const anyFiltroOn = !!(filtrosCfg?.vix?.activo || filtrosCfg?.indiceEma?.activo || filtrosCfg?.sectorEma?.activo || filtrosCfg?.cruceEma?.activo)
    if (anyFiltroOn && filtrosCfg) {
      // Descargar datos auxiliares una vez (VIX + EMA indices)
      let vixRawData = null
      const filterAuxData = {}
      const filterFetchJobs = []
      const vixIv = filtrosCfg.vix?.intervalo === 'semanal' ? '1wk' : '1d'
      if (filtrosCfg.vix?.activo)
        filterFetchJobs.push(fetchData('^VIX', cfg.years ?? 5, cfg.fromDate ?? null, cfg.toDate ?? null, vixIv).then(r => { vixRawData = r }).catch(() => {}))
      const auxKeys = new Set()
      for (const key of ['indiceEma','sectorEma','cruceEma']) {
        const f = filtrosCfg[key]
        if (f?.activo && f.ticker) {
          const iv = f.intervalo === 'semanal' ? '1wk' : '1d'
          const akey = `${f.ticker}:${iv}`
          if (f.ticker !== '^GSPC' || iv === '1wk') auxKeys.add(akey)
        }
      }
      for (const akey of auxKeys) {
        const colonIdx = akey.lastIndexOf(':')
        const ticker = akey.slice(0, colonIdx), iv = akey.slice(colonIdx + 1)
        filterFetchJobs.push(fetchData(ticker, cfg.years ?? 5, cfg.fromDate ?? null, cfg.toDate ?? null, iv).then(r => { filterAuxData[akey] = r }).catch(() => {}))
      }
      if (filterFetchJobs.length) await Promise.all(filterFetchJobs)

      const resolveFilterData = (ticker, iv) =>
        (ticker === '^GSPC' && iv !== '1wk') ? sp500Data : (filterAuxData[`${ticker}:${iv}`] ?? sp500Data)

      // Aplicar filtro por activo — ar.data = tickerCache[ar._realSymbol]
      // rebuildCapitalTras usa {...t} → preserva _stratId/_stratName/_realSymbol
      for (const ar of assetResults) {
        const assetDates = ar.data.map(d => d.date)
        const filtroActivoMap = {}

        const vixCloses = filtrosCfg.vix?.activo ? buildAlignedCloses(vixRawData, assetDates) : null

        const indiceIv = filtrosCfg.indiceEma?.intervalo === 'semanal' ? '1wk' : '1d'
        const indiceDataRes = filtrosCfg.indiceEma?.activo ? resolveFilterData(filtrosCfg.indiceEma.ticker, indiceIv) : null
        let indiceCloses = null, indiceEmaArr = null
        if (indiceDataRes) {
          if (indiceIv === '1wk') { const r = buildAlignedWeekly(indiceDataRes, assetDates, Math.max(1, filtrosCfg.indiceEma?.periodo ?? 200)); indiceCloses = r.closes; indiceEmaArr = r.ema }
          else { indiceCloses = buildAlignedCloses(indiceDataRes, assetDates); indiceEmaArr = calcEMA(indiceCloses, Math.max(1, filtrosCfg.indiceEma?.periodo ?? 200)) }
        }

        const sectorIv = filtrosCfg.sectorEma?.intervalo === 'semanal' ? '1wk' : '1d'
        const sectorDataRes = filtrosCfg.sectorEma?.activo ? resolveFilterData(filtrosCfg.sectorEma.ticker, sectorIv) : null
        let sectorCloses = null, sectorEmaArr = null
        if (sectorDataRes) {
          if (sectorIv === '1wk') { const r = buildAlignedWeekly(sectorDataRes, assetDates, Math.max(1, filtrosCfg.sectorEma?.periodo ?? 50)); sectorCloses = r.closes; sectorEmaArr = r.ema }
          else { sectorCloses = buildAlignedCloses(sectorDataRes, assetDates); sectorEmaArr = calcEMA(sectorCloses, Math.max(1, filtrosCfg.sectorEma?.periodo ?? 50)) }
        }

        const cruceIv = filtrosCfg.cruceEma?.intervalo === 'semanal' ? '1wk' : '1d'
        const cruceDataRes = filtrosCfg.cruceEma?.activo ? resolveFilterData(filtrosCfg.cruceEma.ticker, cruceIv) : null
        let cruceCloses = null, cruceEmaRArr = null, cruceEmaLArr = null
        if (cruceDataRes) {
          if (cruceIv === '1wk') { const rR = buildAlignedWeekly(cruceDataRes, assetDates, Math.max(1, filtrosCfg.cruceEma?.periodoR ?? 10)); const rL = buildAlignedWeekly(cruceDataRes, assetDates, Math.max(1, filtrosCfg.cruceEma?.periodoL ?? 11)); cruceCloses = rR.closes; cruceEmaRArr = rR.ema; cruceEmaLArr = rL.ema }
          else { cruceCloses = buildAlignedCloses(cruceDataRes, assetDates); cruceEmaRArr = calcEMA(cruceCloses, Math.max(1, filtrosCfg.cruceEma?.periodoR ?? 10)); cruceEmaLArr = calcEMA(cruceCloses, Math.max(1, filtrosCfg.cruceEma?.periodoL ?? 11)) }
        }

        for (let i = 0; i < ar.data.length; i++) {
          const date = ar.data[i].date
          let vixOk = true, indiceOk = true, sectorOk = true, cruceOk = true
          if (filtrosCfg.vix?.activo) { const vc = vixCloses?.[i]; vixOk = vc == null ? true : vc < (filtrosCfg.vix.umbral ?? 25) }
          if (filtrosCfg.indiceEma?.activo) { const ic = indiceCloses?.[i], ie = indiceEmaArr?.[i]; indiceOk = ic == null || ie == null ? true : ic >= ie }
          if (filtrosCfg.sectorEma?.activo) { const sc = sectorCloses?.[i], se = sectorEmaArr?.[i]; sectorOk = sc == null || se == null ? true : sc >= se }
          if (filtrosCfg.cruceEma?.activo) { const er = cruceEmaRArr?.[i], el = cruceEmaLArr?.[i]; cruceOk = er == null || el == null ? true : er > el }
          filtroActivoMap[date] = vixOk && indiceOk && sectorOk && cruceOk
        }

        const filtered = ar.trades.filter(t => filtroActivoMap[t.entryDate] !== false)
        if (filtered.length !== ar.trades.length) {
          // rebuildCapitalTras hace {...t} → _stratId/_stratName/_realSymbol se preservan
          const rebuilt = rebuildCapitalTras(filtered, slotCapital)
          ar.trades = rebuilt
          ar.capitalReinv = rebuilt.length ? rebuilt[rebuilt.length - 1].capitalTras : slotCapital
          ar.gananciaSimple = rebuilt.reduce((s, t) => s + t.pnlSimple, 0)
        }
      }
    }

    // 5. Curvas — prioridad FORZADA a 'alfabetico' en esta fase
    //    (momentum/fuerza_relativa/scoreMap requieren lookups por synSym → Fase 2)
    const _maxPos   = sizeRules.maxPosiciones ?? 5
    const _momentN  = sizeRules.momentumN ?? 20
    const synList   = assetResults.map(ar => ar.symbol)
    let curves
    if (modoAsig === 'compartido') {
      curves = buildCompartidoCurves(assetResults, cfg.capitalIni)
    } else if (modoAsig === 'positionsizing') {
      // positionsizing: sizing por riesgo desde stopPx — slotCapital=capitalIni/nPairs es inocuo
      // (igual que concentrado: pool recalcula todo desde pnlPct × capAsignado)
      // executedTrades tendrá mismo problema de pérdida de metadata → cubierto por enrichedExec
      curves = buildPositionSizingCurves(assetResults, cfg.capitalIni, sizeRules || {})
    } else {
      // concentrado (default) — prioridad 'alfabetico' → desempate por (ticker, stratOrder) via synSym
      curves = buildConcentradoCurves(
        assetResults, cfg.capitalIni, _maxPos,
        'alfabetico',  // Fase 2: añadir momentum/scoreMap con synSym→data mapping
        _momentN, sp500Data, synList, null
      )
    }

    // 6. assetStats agrupado por símbolo REAL (no sintético)
    //    buildConcentradoCurves reconstruye allCandidates con campos explícitos y pierde
    //    _stratId/_stratName/_realSymbol. Re-enriquecer executedTrades desde synMeta
    //    (assetResults sí conserva la metadata original del loop runCodeJsAsset).
    const synMeta = {}
    assetResults.forEach(ar => {
      synMeta[ar.symbol] = { _stratId: ar._stratId, _stratName: ar._stratName, _realSymbol: ar._realSymbol }
    })
    const enrichedExec = (curves.executedTrades || []).map(t => {
      const meta = synMeta[t.symbol] || {}
      return {
        ...t,
        _stratId:    t._stratId    ?? meta._stratId,
        _stratName:  t._stratName  ?? meta._stratName,
        _realSymbol: t._realSymbol ?? meta._realSymbol ?? (t.symbol || '').split('#')[0],
      }
    })
    // Fuente unificada: enrichedExec si hay executedTrades, fallback a trades directos (ya tienen metadata)
    const execSource = enrichedExec.length
      ? enrichedExec
      : assetResults.flatMap(ar => ar.trades)

    const execByRealSym = {}
    execSource.forEach(t => {
      const real = t._realSymbol || t.symbol.split('#')[0]
      if (!execByRealSym[real]) execByRealSym[real] = []
      execByRealSym[real].push(t)
    })

    const nRealSyms = Object.keys(execByRealSym).length || 1
    const assetStats = Object.entries(execByRealSym).map(([realSym, execTrades]) => {
      const wins   = execTrades.filter(t => t.pnlPct >= 0)
      const losses = execTrades.filter(t => t.pnlPct < 0)
      const totalDias     = execTrades.reduce((acc, t) => acc + (t.dias || 0), 0)
      const ganSimple     = execTrades.reduce((acc, t) => acc + (t.pnlSimple || 0), 0)
      const avgCapAsignado = execTrades.length
        ? execTrades.reduce((acc, t) => acc + (t._capitalAtEntry ?? 0), 0) / execTrades.length
        : slotCapital
      // Datos OHLCV del ticker (cualquier assetResult que lo tenga)
      const arRef = assetResults.find(a => a._realSymbol === realSym)
      const { maxDD, maxDDDate, maxDDEur, tInvertido } =
        _calcAssetMaxDD(execTrades, arRef?.data, avgCapAsignado, curves.startDate)
      const capInvMedio = execTrades.length
        ? execTrades.reduce((acc, t) => {
            const tp = t._totalPortfolioAtEntry || cfg.capitalIni
            return acc + (t._capitalAtEntry ?? 0) / tp * 100
          }, 0) / execTrades.length
        : 0
      const filtData = arRef?.data?.filter(d => d.date >= curves.startDate) ?? []
      const p0 = filtData[0]?.close
      const pN = filtData[filtData.length - 1]?.close
      const ganBH   = (p0 && pN && p0 > 0) ? slotCapital * (pN / p0 - 1) : 0
      const { pct: priceMaxDD, factor: priceMaxDDFactor } = _calcPriceMaxDD(arRef?.data || [], curves.startDate)
      const capInvertidoTotal = execTrades.reduce((acc, t) => acc + (t._capitalAtEntry || 0), 0)
      return {
        symbol:   realSym,
        trades:   execTrades.length,
        wins:     wins.length,
        losses:   losses.length,
        winRate:  execTrades.length ? (wins.length / execTrades.length) * 100 : 0,
        ganSimple,
        ganComp:  ganSimple,
        totalDias,
        weight:   100 / nRealSyms,
        maxDD, maxDDDate, maxDDEur,
        tInvertido, capInvMedio,
        ganBH, priceMaxDD,
        priceMaxDDEur:    slotCapital * priceMaxDDFactor,
        avgCapAsignado,
        capInvertidoTotal,
        _stratBreakdown: (()=>{
          const m = new Map()
          execTrades.forEach(t => {
            const k = t._stratId
            if (!m.has(k)) m.set(k, { id: t._stratId, name: t._stratName, trades: 0 })
            m.get(k).trades++
          })
          return [...m.values()].sort((a, b) => b.trades - a.trades)
        })(),
      }
    })

    // 7. allTrades: restaurar symbol = realSymbol para el render de tabla (usa execSource enriquecido)
    const sourceTrades = execSource
      .map(t => ({ ...t, symbol: t._realSymbol || t.symbol.split('#')[0] }))
      .sort((a, b) => (a.exitDate || '').localeCompare(b.exitDate || ''))

    // 8. SP500 B&H benchmark
    let sp500BHCurve = []
    if (sp500Data?.length && curves.simpleCurve?.length) {
      const sp0 = sp500Data.find(d => d.date >= curves.startDate)
      if (sp0) {
        sp500BHCurve = curves.simpleCurve.map(({ date }) => {
          let bar = null
          for (let i = sp500Data.length - 1; i >= 0; i--) {
            if (sp500Data[i].date <= date) { bar = sp500Data[i]; break }
          }
          return bar ? { date, value: cfg.capitalIni * (bar.close / sp0.close) } : null
        }).filter(Boolean)
      }
    }

    const avgOccupancy = curves.avgCapOccupancy ?? (
      curves.occupancyCurve?.length
        ? curves.occupancyCurve.reduce((acc, p) => acc + p.value, 0) / curves.occupancyCurve.length
        : 0
    )

    return res.status(200).json({
      ...curves,
      sp500BHCurve,
      assetStats,
      allTrades:       sourceTrades,
      avgOccupancy,
      tInvEstrategia:  curves.tInvEstrategia ?? 0,
      avgCapOccupancy: curves.avgCapOccupancy ?? avgOccupancy,
      n,
      slotCapital,
      modoAsig,
      startDate:       curves.startDate,
      senalStats:      curves.senalStats ?? null,
      portfolioMode:   true,
      strategyCount:   strategies.length,
    })
  } catch (err) {
    console.error('[handlePortfolioMode]', err)
    return res.status(500).json({ error: err.message || 'Error interno en portfolioMode' })
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  // ── NUEVA RAMA: portfolioMode ─────────────────────────────────────────────
  if (req.body?.portfolioMode) return handlePortfolioMode(req, res)
  // ── PATH EXISTENTE: estrategia única — sin cambio ninguno desde aquí ──────
  const { symbols, cfg: cfgInput, definition, modoAsig = 'slots', weights = {}, sizeRules: sizeRulesBody = null, strategyId = null, isNoStrategy = false, filtros: filtrosCfg, intervalo } = req.body
  const sizeRules = sizeRulesBody || cfgInput?.sizeRules || {}
  if (!Array.isArray(symbols) || !symbols.length) return res.status(400).json({ error: 'symbols requerido' })
  let cfg = cfgInput
  if (!cfg && definition) {
    const entry = definition.entry || {}
    const stop  = definition.stop  || {}
    const mgmt  = definition.management || {}
    const rawFilt = definition.filter || {}
    const filt    = rawFilt.conditions?.length ? rawFilt.conditions[0] : rawFilt
    cfg = {
      emaR:        entry.ma_fast   || 10,
      emaL:        entry.ma_slow   || 11,
      capitalIni:  definition.capitalIni || 10000,
      years:       definition.years      || 5,
      tipoStop:    stop.type === 'atr_based' ? 'atr' : stop.type === 'none' ? 'none' : 'tecnico',
      atrPeriod:   stop.atr_period || 14,
      atrMult:     stop.atr_mult   || 1.0,
      sinPerdidas: mgmt.sin_perdidas !== false,
      reentry:     mgmt.reentry     !== false,
      tipoFiltro:  filt.type        || 'none',
      sp500EmaR:   filt.sp500EmaR   || filt.ma_fast || 10,
      sp500EmaL:   filt.sp500EmaL   || filt.ma_slow || 20,
    }
  }
  if (!cfg) return res.status(400).json({ error: 'Se requiere cfg o definition' })

  // Fetch code_js y params desde Supabase si se proporcionó strategyId
  let codeJs = null
  let effectiveCfg = cfg
  if (strategyId && SUPA_URL && SUPA_KEY) {
    try {
      const sr = await fetch(
        `${SUPA_URL}/rest/v1/strategies?id=eq.${strategyId}&select=code_js,params`,
        { headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` } }
      )
      if (sr.ok) {
        const row = (await sr.json())?.[0] || {}
        codeJs = row.code_js || null
        let stratParams = {}
        try {
          stratParams = row.params
            ? (typeof row.params === 'string' ? JSON.parse(row.params) : row.params)
            : {}
        } catch(_) {}
        // cfg del frontend + params de Supabase (stratParams tiene prioridad)
        effectiveCfg = { ...cfg, ...stratParams }
      }
    } catch(_) { codeJs = null }
  }
  // Guard: sin code_js y no es "0 No Strategy" → error claro, nunca ejecutar estrategia hardcoded
  if (!codeJs && !isNoStrategy) {
    return res.status(400).json({ error: 'La estrategia no tiene código ejecutable (code_js). Comprueba que la estrategia esté guardada correctamente en Supabase.' })
  }

  try {
    // Descargar datos en batches para no saturar el proveedor
    const assetInterval = intervalo === 'semanal' ? '1wk' : '1d'
    const BATCH = 4
    const allData = {}
    for (let i = 0; i < symbols.length; i += BATCH) {
      const chunk = symbols.slice(i, i+BATCH)
      await Promise.all(chunk.map(async sym => { allData[sym] = await fetchData(sym, cfg.years ?? 5, cfg.fromDate ?? null, cfg.toDate ?? null, assetInterval) }))
      if (i+BATCH < symbols.length) await sleep(400)
    }

    // SP500 para el filtro (siempre diario)
    let sp500Data = null
    try { sp500Data = await fetchData('^GSPC', cfg.years ?? 5, cfg.fromDate ?? null, cfg.toDate ?? null) } catch(_) {}

    // ── Fetch datos auxiliares para filtros de mercado ──
    const anyFiltroOn = !!(filtrosCfg?.vix?.activo || filtrosCfg?.indiceEma?.activo || filtrosCfg?.sectorEma?.activo || filtrosCfg?.cruceEma?.activo)
    let vixRawData = null
    const filterAuxData = {} // key: `${ticker}:${iv}` → data
    if (anyFiltroOn && filtrosCfg) {
      const filterFetchJobs = []
      const vixIv = filtrosCfg.vix?.intervalo === 'semanal' ? '1wk' : '1d'
      if (filtrosCfg.vix?.activo)
        filterFetchJobs.push(
          fetchData('^VIX', cfg.years ?? 5, cfg.fromDate ?? null, cfg.toDate ?? null, vixIv)
            .then(r => { vixRawData = r }).catch(() => {})
        )
      const auxKeys = new Set()
      for (const key of ['indiceEma','sectorEma','cruceEma']) {
        const f = filtrosCfg[key]
        if (f?.activo && f.ticker) {
          const iv = f.intervalo === 'semanal' ? '1wk' : '1d'
          const akey = `${f.ticker}:${iv}`
          if (f.ticker !== '^GSPC' || iv === '1wk') auxKeys.add(akey)
        }
      }
      for (const akey of auxKeys) {
        const colonIdx = akey.lastIndexOf(':')
        const ticker = akey.slice(0, colonIdx), iv = akey.slice(colonIdx + 1)
        filterFetchJobs.push(
          fetchData(ticker, cfg.years ?? 5, cfg.fromDate ?? null, cfg.toDate ?? null, iv)
            .then(r => { filterAuxData[akey] = r }).catch(() => {})
        )
      }
      if (filterFetchJobs.length) await Promise.all(filterFetchJobs)
    }

    // Capital por slot (base para pnlPct; reescalado en modos con pool compartido)
    const n = symbols.filter(s => allData[s]?.length).length
    if (!n) return res.status(400).json({ error: 'No se pudieron cargar datos de ningún símbolo' })
    const slotCapital = cfg.capitalIni / n

    // Ejecutar backtest individual por activo
    const assetResults = symbols.map(sym => {
      const data = allData[sym]
      if (!data?.length) return null
      if (codeJs) {
        // Motor code_js: sandbox por activo con slotCapital = capital total / nº activos
        const { trades } = runCodeJsAsset(data, sp500Data, codeJs, slotCapital, cfg.years ?? 5, effectiveCfg)
        const capitalReinv = trades.length ? trades[trades.length-1].capitalTras : slotCapital
        const gananciaSimple = trades.reduce((s,t) => s + t.pnlSimple, 0)
        const cutoff = new Date(data[data.length-1].date)
        cutoff.setFullYear(cutoff.getFullYear() - (cfg.years ?? 5))
        const startDate = cutoff.toISOString().split('T')[0]
        return { symbol: sym, data, trades, capitalReinv, gananciaSimple, startDate, blockEvents: {} }
      }
      // isNoStrategy: sin código → trades vacíos; los filtros los poblarán si están activos
      const cutoff = new Date(data[data.length-1].date)
      cutoff.setFullYear(cutoff.getFullYear() - (cfg.years ?? 5))
      const startDate = cutoff.toISOString().split('T')[0]
      return { symbol: sym, data, trades: [], capitalReinv: slotCapital, gananciaSimple: 0, startDate, blockEvents: {} }
    }).filter(Boolean)

    // ── Aplicar filtros de mercado a trades por activo ──
    let filterZones = []
    if (anyFiltroOn && filtrosCfg) {
      for (const ar of assetResults) {
        const assetDates = ar.data.map(d => d.date)
        const filtroActivoMap = {}

        // Resuelve dataset para ticker+interval (^GSPC diario → sp500Data)
        const resolveFilterData = (ticker, iv) =>
          (ticker === '^GSPC' && iv !== '1wk') ? sp500Data : (filterAuxData[`${ticker}:${iv}`] ?? sp500Data)

        // VIX
        const vixCloses = filtrosCfg.vix?.activo ? buildAlignedCloses(vixRawData, assetDates) : null

        // Índice EMA
        const indiceIv = filtrosCfg.indiceEma?.intervalo === 'semanal' ? '1wk' : '1d'
        const indiceDataRes = filtrosCfg.indiceEma?.activo ? resolveFilterData(filtrosCfg.indiceEma.ticker, indiceIv) : null
        let indiceCloses = null, indiceEmaArr = null
        if (indiceDataRes) {
          if (indiceIv === '1wk') {
            const r = buildAlignedWeekly(indiceDataRes, assetDates, Math.max(1, filtrosCfg.indiceEma?.periodo ?? 200))
            indiceCloses = r.closes; indiceEmaArr = r.ema
          } else {
            indiceCloses = buildAlignedCloses(indiceDataRes, assetDates)
            indiceEmaArr = calcEMA(indiceCloses, Math.max(1, filtrosCfg.indiceEma?.periodo ?? 200))
          }
        }

        // Sector EMA
        const sectorIv = filtrosCfg.sectorEma?.intervalo === 'semanal' ? '1wk' : '1d'
        const sectorDataRes = filtrosCfg.sectorEma?.activo ? resolveFilterData(filtrosCfg.sectorEma.ticker, sectorIv) : null
        let sectorCloses = null, sectorEmaArr = null
        if (sectorDataRes) {
          if (sectorIv === '1wk') {
            const r = buildAlignedWeekly(sectorDataRes, assetDates, Math.max(1, filtrosCfg.sectorEma?.periodo ?? 50))
            sectorCloses = r.closes; sectorEmaArr = r.ema
          } else {
            sectorCloses = buildAlignedCloses(sectorDataRes, assetDates)
            sectorEmaArr = calcEMA(sectorCloses, Math.max(1, filtrosCfg.sectorEma?.periodo ?? 50))
          }
        }

        // Cruce EMA
        const cruceIv = filtrosCfg.cruceEma?.intervalo === 'semanal' ? '1wk' : '1d'
        const cruceDataRes = filtrosCfg.cruceEma?.activo ? resolveFilterData(filtrosCfg.cruceEma.ticker, cruceIv) : null
        let cruceCloses = null, cruceEmaRArr = null, cruceEmaLArr = null
        if (cruceDataRes) {
          if (cruceIv === '1wk') {
            const rR = buildAlignedWeekly(cruceDataRes, assetDates, Math.max(1, filtrosCfg.cruceEma?.periodoR ?? 10))
            const rL = buildAlignedWeekly(cruceDataRes, assetDates, Math.max(1, filtrosCfg.cruceEma?.periodoL ?? 11))
            cruceCloses = rR.closes; cruceEmaRArr = rR.ema; cruceEmaLArr = rL.ema
          } else {
            cruceCloses = buildAlignedCloses(cruceDataRes, assetDates)
            cruceEmaRArr = calcEMA(cruceCloses, Math.max(1, filtrosCfg.cruceEma?.periodoR ?? 10))
            cruceEmaLArr = calcEMA(cruceCloses, Math.max(1, filtrosCfg.cruceEma?.periodoL ?? 11))
          }
        }

        // Calcular filtroActivoMap para este activo
        for (let i = 0; i < ar.data.length; i++) {
          const date = ar.data[i].date
          let vixOk = true, indiceOk = true, sectorOk = true, cruceOk = true
          if (filtrosCfg.vix?.activo) {
            const vc = vixCloses?.[i]
            vixOk = vc == null ? true : vc < (filtrosCfg.vix.umbral ?? 25)
          }
          if (filtrosCfg.indiceEma?.activo) {
            const ic = indiceCloses?.[i], ie = indiceEmaArr?.[i]
            indiceOk = ic == null || ie == null ? true : ic >= ie
          }
          if (filtrosCfg.sectorEma?.activo) {
            const sc = sectorCloses?.[i], se = sectorEmaArr?.[i]
            sectorOk = sc == null || se == null ? true : sc >= se
          }
          if (filtrosCfg.cruceEma?.activo) {
            const er = cruceEmaRArr?.[i], el = cruceEmaLArr?.[i]
            cruceOk = er == null || el == null ? true : er > el
          }
          filtroActivoMap[date] = vixOk && indiceOk && sectorOk && cruceOk
        }

        // Guardar filterZones del primer activo para incluirlas en la respuesta
        if (!filterZones.length) {
          let zoneStart = null
          for (const bar of ar.data) {
            const blocked = !filtroActivoMap[bar.date]
            if (blocked && zoneStart === null) zoneStart = bar.date
            else if (!blocked && zoneStart !== null) { filterZones.push({ from: zoneStart, to: bar.date }); zoneStart = null }
          }
          if (zoneStart !== null) filterZones.push({ from: zoneStart, to: ar.data[ar.data.length-1].date })
        }

        // "0 No Strategy": generar trades desde transiciones del filtro (solo si isNoStrategy)
        if (isNoStrategy && ar.trades.length === 0) {
          const genRaw = []
          let entryPx = null, entryDate = null
          const startDateStr = ar.startDate
          for (let i = 0; i < ar.data.length; i++) {
            const bar = ar.data[i]
            if (bar.date < startDateStr) continue
            const active = filtroActivoMap[bar.date] !== false
            const prevActive = i > 0 ? filtroActivoMap[ar.data[i-1].date] !== false : false
            if (!prevActive && active && i + 1 < ar.data.length) {
              // Entry at next bar's open (no look-ahead): price AND date from bar[i+1]
              // Consistent with datos.js filter path (entryIdx = i+1, date = data[i+1].date)
              entryPx = ar.data[i+1].open; entryDate = ar.data[i+1].date
            }
            if (prevActive && !active && entryPx != null) {
              genRaw.push({ entryDate, exitDate: bar.date, entryPrice: entryPx, exitPrice: bar.close })
              entryPx = null; entryDate = null
            }
          }
          if (entryPx != null) {
            const lastBar = ar.data[ar.data.length-1]
            genRaw.push({ entryDate, exitDate: lastBar.date, entryPrice: entryPx, exitPrice: lastBar.close, _virtualClose: true })
          }
          if (genRaw.length) {
            ar.trades = buildTrades(genRaw, slotCapital)
            ar.capitalReinv = ar.trades[ar.trades.length-1].capitalTras
            ar.gananciaSimple = ar.trades.reduce((s,t) => s + t.pnlSimple, 0)
          }
        } else {
          // Filtrar trades existentes por filtroActivoMap
          const filtered = ar.trades.filter(t => filtroActivoMap[t.entryDate] !== false)
          if (filtered.length !== ar.trades.length) {
            const rebuilt = rebuildCapitalTras(filtered, slotCapital)
            ar.trades = rebuilt
            ar.capitalReinv = rebuilt.length ? rebuilt[rebuilt.length-1].capitalTras : slotCapital
            ar.gananciaSimple = rebuilt.reduce((s,t) => s + t.pnlSimple, 0)
          }
        }
      }
    }

    // Calcular curvas según modo de asignación
    let curves
    if (modoAsig === 'compartido') {
      curves = buildCompartidoCurves(assetResults, cfg.capitalIni)
    } else if (modoAsig === 'concentrado') {
      const _prior    = sizeRules.prioridad  ?? 'alfabetico'
      const _momentN  = sizeRules.momentumN  ?? 20
      const _scoreMap = sizeRules.scoreMap   ?? null
      const _criterio = sizeRules.criterioUso ?? 'desempate'
      curves = buildConcentradoCurves(assetResults, cfg.capitalIni, sizeRules.maxPosiciones ?? 5, _prior, _momentN, sp500Data, symbols, _scoreMap, _criterio)
    } else if (modoAsig === 'positionsizing') {
      curves = buildPositionSizingCurves(assetResults, cfg.capitalIni, sizeRules)
    } else {
      // 'slots' por defecto — también maneja legacy 'custom'
      curves = buildSlotsCurves(assetResults, cfg.capitalIni)
    }

    // Métricas por activo (tabla resumen)
    let assetStats = assetResults.map(ar => {
      const wins = ar.trades.filter(t=>t.pnlPct>=0)
      const losses = ar.trades.filter(t=>t.pnlPct<0)
      const totalDias = ar.trades.reduce((s,t)=>s+t.dias,0)
      const pct = weights?.[ar.symbol] ?? (100 / n)
      const { maxDD: assetMaxDD, maxDDDate: assetMaxDDDate, maxDDEur: assetMaxDDEur, tInvertido, capInvMedio } = _calcAssetMaxDD(ar.trades, ar.data, slotCapital, curves.startDate)
      const filtData = ar.data?.filter(d => d.date >= curves.startDate) ?? []
      const p0 = filtData[0]?.close
      const pN = filtData[filtData.length - 1]?.close
      const ganBH = (p0 && pN && p0 > 0) ? slotCapital * (pN / p0 - 1) : 0
      const { pct: priceMaxDD, factor: priceMaxDDFactor } = _calcPriceMaxDD(ar.data, curves.startDate)
      return {
        symbol: ar.symbol,
        trades: ar.trades.length,
        wins: wins.length,
        losses: losses.length,
        winRate: ar.trades.length ? (wins.length/ar.trades.length)*100 : 0,
        ganSimple: ar.gananciaSimple,
        ganComp: ar.capitalReinv - slotCapital,
        totalDias,
        weight: pct,
        maxDD: assetMaxDD,
        maxDDDate: assetMaxDDDate,
        maxDDEur: assetMaxDDEur,
        tInvertido,
        capInvMedio,
        ganBH,
        priceMaxDD,
        priceMaxDDEur: slotCapital * priceMaxDDFactor,
        capInvertidoTotal: ar.trades.length * slotCapital,  // slots: capital fijo por trade
      }
    })

    // En modos compartido/concentrado/positionsizing: recalcular assetStats desde los trades realmente ejecutados
    if ((modoAsig === 'compartido' || modoAsig === 'concentrado' || modoAsig === 'positionsizing') && curves.executedTrades?.length) {
      const execBySymbol = {}
      curves.executedTrades.forEach(t => {
        if (!execBySymbol[t.symbol]) execBySymbol[t.symbol] = []
        execBySymbol[t.symbol].push(t)
      })
      assetStats = assetResults.map(ar => {
        const execTrades = execBySymbol[ar.symbol] || []
        const wins   = execTrades.filter(t => t.pnlPct >= 0)
        const losses = execTrades.filter(t => t.pnlPct < 0)
        const totalDias = execTrades.reduce((s,t) => s + (t.dias||0), 0)
        const ganSimple = execTrades.reduce((s,t) => s + (t.pnlSimple||0), 0)
        const pct = weights?.[ar.symbol] ?? (100 / n)
        const avgCapAsignado = execTrades.length
          ? execTrades.reduce((s,t) => s + (t._capitalAtEntry ?? 0), 0) / execTrades.length
          : cfg.capitalIni / n
        const { maxDD: assetMaxDD, maxDDDate: assetMaxDDDate, maxDDEur: assetMaxDDEur, tInvertido } =
          _calcAssetMaxDD(execTrades, ar.data, avgCapAsignado, curves.startDate)
        // Cap.Inv% per-asset: avg of (capAtEntry / totalPortfolioAtEntry) × 100
        const capInvMedio = execTrades.length
          ? execTrades.reduce((s, t) => {
              const tp = t._totalPortfolioAtEntry || cfg.capitalIni
              return s + (t._capitalAtEntry ?? 0) / tp * 100
            }, 0) / execTrades.length
          : 0
        const filtData = ar.data?.filter(d => d.date >= curves.startDate) ?? []
        const p0 = filtData[0]?.close
        const pN = filtData[filtData.length - 1]?.close
        const ganBH = (p0 && pN && p0 > 0) ? (cfg.capitalIni / n) * (pN / p0 - 1) : 0
        const { pct: priceMaxDD, factor: priceMaxDDFactor } = _calcPriceMaxDD(ar.data, curves.startDate)
        const capInvertidoTotal = execTrades.reduce((s, t) => s + (t._capitalAtEntry || 0), 0)
        return {
          symbol:    ar.symbol,
          trades:    execTrades.length,
          wins:      wins.length,
          losses:    losses.length,
          winRate:   execTrades.length ? (wins.length / execTrades.length) * 100 : 0,
          ganSimple,
          ganComp:   ganSimple,
          totalDias,
          weight:    pct,
          maxDD:     assetMaxDD,
          maxDDDate: assetMaxDDDate,
          maxDDEur:  assetMaxDDEur,
          tInvertido,
          capInvMedio,
          ganBH,
          priceMaxDD,
          priceMaxDDEur: (cfg.capitalIni / n) * priceMaxDDFactor,
          avgCapAsignado,     // capital medio real por trade — usado por frontend para CAGR en modo concentrado
          capInvertidoTotal,  // suma del capital de entrada de todos los trades ejecutados
        }
      })
    }

    // % medio de capital invertido (usa avgCapOccupancy capital-weighted si está disponible)
    const avgOccupancy = curves.avgCapOccupancy ?? (
      curves.occupancyCurve.length
        ? curves.occupancyCurve.reduce((s,p)=>s+p.value,0)/curves.occupancyCurve.length
        : 0
    )

    // Historial combinado ordenado por fecha salida
    const sourceTrades = (modoAsig === 'compartido' || modoAsig === 'concentrado' || modoAsig === 'positionsizing')
      ? (curves.executedTrades || []).map(t => {
          if (t.riesgoAcum !== undefined) return t  // positionsizing ya lo tiene
          const ep = t.entryPrice ?? t.entryPx
          const stopIni = t.stopHistory?.[0]?.stopPx
          const dist = (ep && stopIni && ep > stopIni) ? (ep - stopIni) / ep : null
          const cap = t._capitalAtEntry ?? slotCapital
          return { ...t, riesgoAcum: dist != null ? dist * cap : null }
        })
      : assetResults.flatMap(ar => ar.trades.map(t => {
          const ep = t.entryPrice ?? t.entryPx
          const stopIni = t.stopHistory?.[0]?.stopPx
          const dist = (ep && stopIni && ep > stopIni) ? (ep - stopIni) / ep : null
          return { ...t, symbol: ar.symbol, riesgoAcum: dist != null ? dist * slotCapital : null }
        })).sort((a,b) => a.exitDate.localeCompare(b.exitDate))

    // SP500 B&H benchmark
    let sp500BHCurve = []
    if (sp500Data && sp500Data.length && curves.simpleCurve.length) {
      const startD = curves.startDate
      const filteredDates = curves.simpleCurve.map(p => p.date)
      const sp0 = sp500Data.find(d => d.date >= startD)
      if (sp0) {
        const sp0Close = sp0.close
        sp500BHCurve = filteredDates.map(date => {
          let spBar = null
          for (let i = sp500Data.length - 1; i >= 0; i--) {
            if (sp500Data[i].date <= date) { spBar = sp500Data[i]; break }
          }
          return spBar ? { date, value: cfg.capitalIni * (spBar.close / sp0Close) } : null
        }).filter(Boolean)
      }
    }

    res.status(200).json({
      ...curves,
      sp500BHCurve,
      assetStats,
      allTrades: sourceTrades,
      avgOccupancy,
      tInvEstrategia: curves.tInvEstrategia ?? 0,
      avgCapOccupancy: curves.avgCapOccupancy ?? avgOccupancy,
      n,
      slotCapital,
      modoAsig,
      startDate: curves.startDate,
      blockEventsBySymbol: Object.fromEntries(assetResults.map(ar => [ar.symbol, ar.blockEvents])),
      senalStats: curves.senalStats ?? null,
      filterZones: filterZones.length ? filterZones : undefined,
    })
  } catch(err) {
    console.error(err)
    res.status(500).json({ error: err.message || 'Error interno' })
  }
}
