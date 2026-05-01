// pages/api/multibacktest.js
// Backtest de cartera multi-activo — Slots iguales | Capital rotativo | Pesos personalizados

import { calcEMA as _libEMA, calcSMA, calcRSI, calcATR as _libATR, calcMACD } from '../../lib/backtester'

const SUPA_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPA_KEY = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

function calcEMA(values, period) {
  const k = 2 / (period + 1)
  const result = new Array(values.length).fill(null)
  let ema = null
  for (let i = 0; i < values.length; i++) {
    if (values[i] == null) continue
    if (ema === null) { ema = values[i]; result[i] = ema; continue }
    ema = values[i] * k + ema * (1 - k)
    result[i] = ema
  }
  return result
}
function calcATR(highs, lows, closes, period) {
  const tr = closes.map((_, i) => {
    if (i === 0) return highs[i] - lows[i]
    return Math.max(highs[i]-lows[i], Math.abs(highs[i]-closes[i-1]), Math.abs(lows[i]-closes[i-1]))
  })
  return calcEMA(tr, period)
}

async function fetchData(symbol, years=5, fromDate=null, toDate=null) {
  try {
    const encoded = encodeURIComponent(symbol)
    let url
    if (fromDate && toDate) {
      const p1 = Math.floor(new Date(fromDate).getTime() / 1000)
      const p2 = Math.floor(new Date(toDate).getTime() / 1000)
      url = `https://query1.finance.yahoo.com/v8/finance/chart/${encoded}?interval=1d&period1=${p1}&period2=${p2}`
    } else {
      url = `https://query1.finance.yahoo.com/v8/finance/chart/${encoded}?interval=1d&range=${Math.min(years,10)}y`
    }
    const res = await fetch(url, { headers: { 'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36','Accept':'application/json' } })
    if (!res.ok) return null
    const json = await res.json()
    const timestamps = json?.chart?.result?.[0]?.timestamp
    const closes    = json?.chart?.result?.[0]?.indicators?.quote?.[0]?.close
    const opens     = json?.chart?.result?.[0]?.indicators?.quote?.[0]?.open
    const highs     = json?.chart?.result?.[0]?.indicators?.quote?.[0]?.high
    const lows      = json?.chart?.result?.[0]?.indicators?.quote?.[0]?.low
    if (!timestamps?.length) return null
    return timestamps.map((ts,i) => ({
      date:  new Date(ts*1000).toISOString().slice(0,10),
      open:  opens?.[i]  ?? null,
      high:  highs?.[i]  ?? null,
      low:   lows?.[i]   ?? null,
      close: closes?.[i] ?? null,
    })).filter(d => d.close && !isNaN(d.close))
      .sort((a,b) => a.date.localeCompare(b.date))
  } catch { return null }
}

function runSingleBacktest(data, sp500Data, cfg) {
  const { emaR, emaL, capitalIni, tipoStop, atrPeriod, atrMult, sinPerdidas, reentry, tipoFiltro, sp500EmaR, sp500EmaL, years } = cfg
  const closes = data.map(d=>d.close), highs = data.map(d=>d.high), lows = data.map(d=>d.low)
  const emaRArr = calcEMA(closes, emaR), emaLArr = calcEMA(closes, emaL)
  const atrArr = tipoStop === 'atr' ? calcATR(highs, lows, closes, atrPeriod) : null
  let filtroArr = new Array(data.length).fill(false)
  let _sp500C = [], _spEmaRArr = []  // DEBUG — hoisted para console.log
  if (sp500Data && tipoFiltro !== 'none') {
    const sp500Closes = data.map(d=>{ const m=sp500Data.find(s=>s.date===d.date); return m?m.close:null })
    let last=null; for(let i=0;i<sp500Closes.length;i++){if(sp500Closes[i]!=null)last=sp500Closes[i];else sp500Closes[i]=last}
    const spEmaR=calcEMA(sp500Closes,sp500EmaR), spEmaL=calcEMA(sp500Closes,sp500EmaL)
    _sp500C=sp500Closes; _spEmaRArr=spEmaR  // DEBUG
    filtroArr=data.map((_,i)=>{
      if(sp500Closes[i]==null||spEmaR[i]==null) return false
      if(tipoFiltro==='sp500_above_ema'||tipoFiltro==='precio_ema'||tipoFiltro==='price_above_ema') return sp500Closes[i]<spEmaR[i]
      if(tipoFiltro==='sp500_ema_fast_above_slow'||tipoFiltro==='ema_ema') return spEmaR[i]<spEmaL[i]
      return false
    })
  }
  const lastDate=new Date(data[data.length-1].date), startDate=new Date(lastDate)
  startDate.setFullYear(startDate.getFullYear()-years)
  let enPosicion=false, precioEntrada=null, idxEntrada=null, stopNivel=null
  let entradaPend=false, breakout=null, salidaPend=false, bkSalida=null
  let sinPerdAct=false, reentryMode=false, reentryPend=false
  let capitalReinv=capitalIni, gananciaSimple=0
  const trades=[]
  const blockEvents={filter:[],setup_in:[],setup_out:[],abort:[],trigger_in:[],trigger_out:[],stop_loss:[]}
  const inWindow=(i)=>new Date(data[i].date)>=startDate
  for (let i=1;i<data.length;i++) {
    const d=data[i],dp=data[i-1],er=emaRArr[i],el=emaLArr[i],erp=emaRArr[i-1],elp=emaLArr[i-1]
    if(!er||!el||!erp||!elp) continue
    const filt=filtroArr[i],inW=inWindow(i)
    if(filt&&inW) blockEvents.filter.push(d.date)
    const cruceAlc=erp<elp&&er>=el, cruceBaj=erp>elp&&er<=el
    const cierreBaj=dp.close>=erp&&d.close<er, cierreAlc=dp.close<=erp&&d.close>er
    if(cruceBaj){reentryMode=reentryPend=false}
    if(enPosicion&&cruceBaj&&sinPerdidas){
      const pxSal=d.open,pnl=(pxSal-precioEntrada)/precioEntrada
      gananciaSimple+=pnl*capitalIni;capitalReinv+=pnl*capitalReinv
      trades.push({entryDate:data[idxEntrada].date,exitDate:d.date,entryPx:precioEntrada,exitPx:pxSal,pnlPct:pnl*100,pnlSimple:pnl*capitalIni,capitalTras:capitalReinv,dias:Math.round((new Date(d.date)-new Date(data[idxEntrada].date))/86400000),tipo:'Stop Emergencia'})
      enPosicion=false;precioEntrada=stopNivel=null;salidaPend=sinPerdAct=false
      if(reentry&&er>el)reentryMode=true;continue
    }
    if(enPosicion&&stopNivel&&d.low<=stopNivel){
      const pnl=(stopNivel-precioEntrada)/precioEntrada
      gananciaSimple+=pnl*capitalIni;capitalReinv+=pnl*capitalReinv
      blockEvents.stop_loss.push(d.date)
      trades.push({entryDate:data[idxEntrada].date,exitDate:d.date,entryPx:precioEntrada,exitPx:stopNivel,pnlPct:pnl*100,pnlSimple:pnl*capitalIni,capitalTras:capitalReinv,dias:Math.round((new Date(d.date)-new Date(data[idxEntrada].date))/86400000),tipo:'Stop'})
      enPosicion=false;precioEntrada=stopNivel=null;salidaPend=sinPerdAct=false
      if(reentry&&er>el)reentryMode=true;continue
    }
    if(enPosicion&&salidaPend&&bkSalida){
      if(sinPerdidas){sinPerdAct=d.low>precioEntrada}else{sinPerdAct=true}
      if(sinPerdAct&&d.low<=bkSalida){
        const pnl=(bkSalida-precioEntrada)/precioEntrada
        gananciaSimple+=pnl*capitalIni;capitalReinv+=pnl*capitalReinv
        blockEvents.trigger_out.push(d.date)
        trades.push({entryDate:data[idxEntrada].date,exitDate:d.date,entryPx:precioEntrada,exitPx:bkSalida,pnlPct:pnl*100,pnlSimple:pnl*capitalIni,capitalTras:capitalReinv,dias:Math.round((new Date(d.date)-new Date(data[idxEntrada].date))/86400000),tipo:'Exit'})
        enPosicion=false;precioEntrada=stopNivel=null;salidaPend=sinPerdAct=false;bkSalida=null
        if(reentry&&er>el)reentryMode=true;continue
      }
    }
    if(enPosicion&&cierreBaj&&precioEntrada){blockEvents.setup_out.push(d.date);stopNivel=null;bkSalida=d.low;salidaPend=true;sinPerdAct=sinPerdidas?d.low>precioEntrada:true}
    if(cruceAlc&&!enPosicion&&inW&&!reentryMode&&!filt){blockEvents.setup_in.push(d.date);entradaPend=true;breakout=d.high;reentryPend=false;if(tipoStop==='tecnico')stopNivel=Math.min(er,d.low)}
    if(entradaPend&&!enPosicion&&filt&&!reentryPend){blockEvents.abort.push(d.date);entradaPend=false;breakout=null}
    if(entradaPend&&!enPosicion&&inW&&!cruceAlc&&!reentryPend){
      if(d.high<breakout){breakout=d.high;if(tipoStop==='tecnico')stopNivel=Math.min(er,d.low)}
      if(d.high>=breakout){
        blockEvents.trigger_in.push(d.date)
        console.log(`[TRIGGER_IN] fecha=${d.date} sp500C=${_sp500C[i]?.toFixed(2)} spEmaR=${_spEmaRArr[i]?.toFixed(2)} filt=${filtroArr[i]} tipoFiltro=${tipoFiltro} px=${breakout}`)
        precioEntrada=breakout;idxEntrada=i;enPosicion=true;entradaPend=false;salidaPend=false
        if(tipoStop==='atr'&&atrArr?.[i])stopNivel=precioEntrada-atrArr[i]*atrMult
        else if(tipoStop!=='tecnico')stopNivel=null
      }
    }
    if(reentry&&reentryMode&&!enPosicion&&inW&&er>el&&!filt&&cierreAlc&&!entradaPend){
      entradaPend=true;reentryPend=true;breakout=d.high
      if(tipoStop==='tecnico')stopNivel=Math.min(er,d.low)
    }
    if(reentryPend&&!enPosicion&&filt){entradaPend=reentryPend=false;breakout=null}
    if(entradaPend&&reentryPend&&!enPosicion&&inW&&!cierreAlc){
      if(d.high<breakout){breakout=d.high;if(tipoStop==='tecnico')stopNivel=Math.min(er,d.low)}
      if(d.high>=breakout){
        blockEvents.trigger_in.push(d.date)
        console.log(`[TRIGGER_IN reentry] fecha=${d.date} sp500C=${_sp500C[i]?.toFixed(2)} spEmaR=${_spEmaRArr[i]?.toFixed(2)} filt=${filtroArr[i]} tipoFiltro=${tipoFiltro} px=${breakout}`)
        precioEntrada=breakout;idxEntrada=i;enPosicion=true
        entradaPend=reentryPend=reentryMode=false;salidaPend=false
        if(tipoStop==='atr'&&atrArr?.[i])stopNivel=precioEntrada-atrArr[i]*atrMult
        else if(tipoStop!=='tecnico')stopNivel=null
      }
    }
    if(cierreBaj&&entradaPend&&!reentryMode){entradaPend=false;breakout=null}
  }
  return { trades, capitalReinv, gananciaSimple, startDate, blockEvents }
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
      const openTrades = trades.filter(t => t.entryDate <= date && t.exitDate > date)
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
    return byDate
  })

  const simpleCurve=[], compoundCurve=[], bhCurve=[], occupancyCurve=[], floatSimpleCurve=[], floatCompoundCurve=[]
  const step = Math.max(1, Math.floor(filteredDates.length / 400))
  filteredDates.filter((_,i)=>i%step===0||i===filteredDates.length-1).forEach(date => {
    let totSimple=0, totCompound=0, totBH=0, openSlots=0, totOpenPnl=0
    assetEquities.forEach(byDate => {
      const e = byDate[date]
      if (e) { totSimple+=e.simple; totCompound+=e.compound; totBH+=e.bh; if(e.open)openSlots++; totOpenPnl+=e.openPnl||0 }
    })
    simpleCurve.push({ date, value: totSimple })
    compoundCurve.push({ date, value: totCompound })
    bhCurve.push({ date, value: totBH })
    occupancyCurve.push({ date, value: (openSlots/n)*100 })
    floatSimpleCurve.push({ date, value: totSimple+totOpenPnl })
    floatCompoundCurve.push({ date, value: totCompound+totOpenPnl })
  })

  return { simpleCurve, compoundCurve, bhCurve, occupancyCurve, startDate, floatSimpleCurve, floatCompoundCurve, ..._calcDD(simpleCurve, compoundCurve, bhCurve, capitalIni), ..._calcFloatDD(floatSimpleCurve, floatCompoundCurve, capitalIni) }
}

// ── MODO ROTATIVO: pool único, una posición a la vez ─────────
// rankMap: {symbol: rank} — menor rank = mayor prioridad en señales simultáneas
function buildRotativoCurves(assetResults, capitalIni, rankMap) {
  const n = assetResults.length
  if (!n) return _emptyCurves()
  const { startDate, filteredDates } = _commonDates(assetResults)
  if (!filteredDates.length) return _emptyCurves(startDate)

  // Recopilar todos los trades de todos los activos, con símbolo
  const allCandidates = []
  assetResults.forEach(ar => {
    ar.trades.forEach(t => allCandidates.push({ ...t, symbol: ar.symbol }))
  })

  // Ordenar por fecha de entrada; empate → menor rank primero
  allCandidates.sort((a,b) => {
    if (a.entryDate !== b.entryDate) return a.entryDate.localeCompare(b.entryDate)
    const ra = rankMap?.[a.symbol] ?? 9999
    const rb = rankMap?.[b.symbol] ?? 9999
    return ra - rb
  })

  // Simular pool secuencial: una posición activa al mismo tiempo
  // pnlPct es independiente del capital → reescalamos con el pool real en cada entrada
  let pool = capitalIni
  let activeUntil = null  // fecha de cierre del trade activo
  const executedTrades = []

  for (const trade of allCandidates) {
    // Saltamos si se solapan con el trade activo
    if (activeUntil && trade.entryDate < activeUntil) continue
    if (!isFinite(trade.pnlPct)) continue  // skip trades con pnlPct NaN/Infinity
    // Ejecutar este trade con el pool actual
    const pnlAbs = pool * (trade.pnlPct / 100)
    pool += pnlAbs
    const simTrade = {
      ...trade,
      pnlSimple: pnlAbs,
      capitalTras: pool
    }
    executedTrades.push(simTrade)
    activeUntil = trade.exitDate
  }

  // Precompute capital at entry per trade (= pool before the trade started)
  executedTrades.forEach((t,i)=>{ t._capitalAtEntry = i===0 ? capitalIni : executedTrades[i-1].capitalTras })

  // Build symbol → filtered OHLCV map for float curve
  const symbolDataMap={}
  assetResults.forEach(ar=>{ symbolDataMap[ar.symbol] = ar.data ? ar.data.filter(d=>d.date>=startDate) : [] })

  // Construir curva de equity (step function en cierres)
  // Para cada fecha: pool = capitalTras del último trade cerrado antes de esa fecha
  const closedByDate = {}
  executedTrades.forEach(t => {
    closedByDate[t.exitDate] = t.capitalTras
  })

  const step = Math.max(1, Math.floor(filteredDates.length / 400))
  const sampledDates = filteredDates.filter((_,i) => i%step===0 || i===filteredDates.length-1)

  const simpleCurve=[], compoundCurve=[], floatSimpleCurve=[], floatCompoundCurve=[]
  let lastPool = capitalIni
  sampledDates.forEach(date => {
    // Actualizar pool con todos los cierres hasta esta fecha
    executedTrades
      .filter(t => t.exitDate <= date)
      .forEach(t => { lastPool = Math.max(lastPool, 0); lastPool = t.capitalTras })
    // Compuesta: pool real acumulado (reinvierte beneficios)
    const closedSoFar = executedTrades.filter(t => t.exitDate <= date)
    const val = closedSoFar.length ? closedSoFar[closedSoFar.length-1].capitalTras : capitalIni
    compoundCurve.push({ date, value: val })
    // Simple: capitalIni fijo como base de cada trade (no reinvierte)
    const simpleVal = capitalIni + closedSoFar.reduce((s,t) => s + capitalIni*(t.pnlPct/100), 0)
    simpleCurve.push({ date, value: simpleVal })
    // Float: unrealized P&L del trade activo (rotativo = máximo uno a la vez)
    const activeTrade = executedTrades.find(t => t.entryDate <= date && t.exitDate > date)
    let openPnlSimple = 0, openPnlCompound = 0
    if(activeTrade) {
      const fData = symbolDataMap[activeTrade.symbol]||[]
      let closePx = null
      for(let i=fData.length-1;i>=0;i--){if(fData[i].date<=date){closePx=fData[i].close;break}}
      if(closePx!=null){
        const ret = (closePx-activeTrade.entryPx)/activeTrade.entryPx
        openPnlSimple  = ret * capitalIni
        openPnlCompound = ret * activeTrade._capitalAtEntry
      }
    }
    floatSimpleCurve.push({date, value:simpleVal+openPnlSimple})
    floatCompoundCurve.push({date, value:val+openPnlCompound})
  })

  // Ocupación: ¿hay trade abierto en esa fecha?
  const occupancyCurve = sampledDates.map(date => {
    const busy = executedTrades.some(t => t.entryDate <= date && t.exitDate > date)
    return { date, value: busy ? 100 : 0 }
  })

  // B&H combinado: suma de BH de cada activo con capital proporcional (1/n por activo)
  const slotBH = capitalIni / n
  const bhCurve = sampledDates.map(date => {
    let total = 0
    assetResults.forEach(ar => {
      const filtData = ar.data ? ar.data.filter(d => d.date >= startDate) : []
      const p0 = filtData.length ? filtData[0].close : null
      if (!p0) { total += slotBH; return }
      let bar = null
      for (let i = filtData.length-1; i>=0; i--) { if (filtData[i].date <= date) { bar=filtData[i]; break } }
      total += bar ? slotBH * (bar.close / p0) : slotBH
    })
    return { date, value: total }
  })

  return {
    simpleCurve, compoundCurve, bhCurve, occupancyCurve, startDate,
    executedTrades, floatSimpleCurve, floatCompoundCurve,
    ..._calcDD(simpleCurve, compoundCurve, bhCurve, capitalIni),
    ..._calcFloatDD(floatSimpleCurve, floatCompoundCurve, capitalIni)
  }
}

// ── MODO CAPITAL COMPARTIDO: pool libre repartido entre slots activos ──
function buildCompartidoCurves(assetResults, capitalIni) {
  const n = assetResults.length
  if (!n) return _emptyCurves()
  const { startDate, filteredDates } = _commonDates(assetResults)
  if (!filteredDates.length) return _emptyCurves(startDate)

  // Recopilar todos los trades de todos los activos con pnlPct pre-calculado
  const allCandidates = assetResults.flatMap(ar =>
    (ar.trades || []).map(t => ({
      symbol:    ar.symbol,
      entryDate: t.entryDate,
      exitDate:  t.exitDate,
      pnlPct:    t.pnlPct,
      entryPx:   t.entryPrice ?? t.entryPx,
      dias:      t.dias,
    }))
  ).sort((a, b) => a.entryDate < b.entryDate ? -1 : 1)

  if (!allCandidates.length) return buildSlotsCurves(assetResults, capitalIni)

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
    ...allCandidates.map(t => t.exitDate),
  ])].sort()

  eventDates.forEach(date => {
    // 1. Cerrar primero (libera capital para nuevas entradas del mismo día)
    const toClose = Object.keys(openSlots).filter(sym => openSlots[sym].trade.exitDate === date)
    toClose.forEach(symbol => {
      const { trade, capAsignado } = openSlots[symbol]
      if (!isFinite(trade.pnlPct)) { poolLibre += capAsignado; delete openSlots[symbol]; return }  // skip NaN/Infinity
      const capFinal = capAsignado * (1 + trade.pnlPct / 100)
      poolLibre += capFinal
      executedTrades.push({
        ...trade,
        _capitalAtEntry: capAsignado,
        capitalTras: capFinal,
        pnlSimple: capFinal - capAsignado,
      })
      delete openSlots[symbol]
    })

    // 2. Abrir entradas del día (solo activos sin posición abierta)
    const entries = (entriesByDate[date] || []).filter(t => !openSlots[t.symbol])
    if (entries.length > 0 && poolLibre > 0) {
      const nLibres = n - Object.keys(openSlots).length
      const capPorSlot = nLibres > 0 ? poolLibre / nLibres : 0
      entries.forEach(t => {
        poolLibre -= capPorSlot
        // Same-day trade (entryDate === exitDate): abrir y cerrar atómicamente
        // para evitar que quede bloqueado en openSlots sin salida
        if (t.exitDate === date) {
          if (isFinite(t.pnlPct)) {
            const capFinal = capPorSlot * (1 + t.pnlPct / 100)
            poolLibre += capFinal
            executedTrades.push({
              ...t,
              _capitalAtEntry: capPorSlot,
              capitalTras: capFinal,
              pnlSimple: capFinal - capPorSlot
            })
          } else {
            poolLibre += capPorSlot  // NaN: devolver capital sin P&L
          }
          // NO añadir a openSlots — se resuelve inmediatamente
        } else {
          openSlots[t.symbol] = { trade: t, capAsignado: capPorSlot }
          capitalAtEntryMap[`${t.symbol}:${t.entryDate}`] = capPorSlot
        }
      })
    }
  })

  // Build symbol → filtered OHLCV map para curva flotante
  const symbolDataMap = {}
  assetResults.forEach(ar => { symbolDataMap[ar.symbol] = ar.data ? ar.data.filter(d => d.date >= startDate) : [] })

  // Construir curvas fecha a fecha (mismo patrón que buildRotativoCurves)
  const step = Math.max(1, Math.floor(filteredDates.length / 400))
  const sampledDates = filteredDates.filter((_, i) => i % step === 0 || i === filteredDates.length - 1)

  const simpleCurve = [], compoundCurve = [], floatSimpleCurve = [], floatCompoundCurve = []

  sampledDates.forEach(date => {
    const closedSoFar = executedTrades.filter(t => t.exitDate <= date)
    // Compound: capitalIni + suma de pnlSimple de trades cerrados
    // (= pool_libre + capital locked in open slots, sin flotar)
    const val = capitalIni + closedSoFar.reduce((s, t) => s + t.pnlSimple, 0)
    compoundCurve.push({ date, value: val })
    // Simple: base fija = capitalIni (mismo patrón que buildRotativoCurves)
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
        openPnlSimple += ret * capitalIni
        openPnlCompound += ret * capEntry
      }
    })
    floatSimpleCurve.push({ date, value: simpleVal + openPnlSimple })
    floatCompoundCurve.push({ date, value: val + openPnlCompound })
  })

  // Ocupación: % de slots con posición abierta
  const occupancyCurve = sampledDates.map(date => {
    const busy = allCandidates.filter(t =>
      capitalAtEntryMap[`${t.symbol}:${t.entryDate}`] != null &&
      t.entryDate <= date && t.exitDate > date
    ).length
    return { date, value: n > 0 ? (busy / n) * 100 : 0 }
  })

  // B&H combinado: mismo patrón que buildRotativoCurves
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

  return {
    simpleCurve, compoundCurve, bhCurve, occupancyCurve, startDate,
    executedTrades, floatSimpleCurve, floatCompoundCurve,
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
      const openTrades = trades.filter(t => t.entryDate <= date && t.exitDate > date)
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
  filteredDates.filter((_,i)=>i%step===0||i===filteredDates.length-1).forEach(date => {
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
    let peak=curve[0]?.value||capitalIni, maxDD=0, maxDDDate=null
    curve.forEach(p=>{ if(p.value>peak)peak=p.value; const dd=(peak-p.value)/peak*100; if(dd>maxDD){maxDD=dd;maxDDDate=p.date} })
    return { maxDD, maxDDDate }
  }
  const { maxDD:maxDDSimple, maxDDDate:maxDDSimpleDate } = calcDD(simpleCurve)
  const { maxDD:maxDDCompound, maxDDDate:maxDDCompoundDate } = calcDD(compoundCurve)
  const { maxDD:maxDDBH, maxDDDate:maxDDBHDate } = calcDD(bhCurve)
  return { maxDDSimple, maxDDSimpleDate, maxDDCompound, maxDDCompoundDate, maxDDBH, maxDDBHDate }
}
function _calcFloatDD(floatSimpleCurve, floatCompoundCurve, capitalIni) {
  const calcDD = curve => {
    if(!curve?.length) return { maxDD:0, maxDDDate:null }
    let peak=curve[0]?.value||capitalIni, maxDD=0, maxDDDate=null
    curve.forEach(p=>{ if(!p)return; if(p.value>peak)peak=p.value; const dd=(peak-p.value)/peak*100; if(dd>maxDD){maxDD=dd;maxDDDate=p.date} })
    return { maxDD, maxDDDate }
  }
  const { maxDD:maxDDFloatSimple, maxDDDate:maxDDFloatSimpleDate } = calcDD(floatSimpleCurve)
  const { maxDD:maxDDFloatCompound, maxDDDate:maxDDFloatCompoundDate } = calcDD(floatCompoundCurve)
  return { maxDDFloatSimple, maxDDFloatSimpleDate, maxDDFloatCompound, maxDDFloatCompoundDate }
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
function runCodeJsAsset(data, sp500Data, codeJs, slotCapital, years) {
  try {
    const sp500Map = {}
    if (sp500Data) sp500Data.forEach(d => { sp500Map[d.date] = d.close })
    const enrichedData = data.map(d => ({ ...d, sp500Close: sp500Map[d.date] ?? null }))
    const wrappedCode = `"use strict";\n${codeJs}\nreturn run;`
    const getRunFn = new Function('calcEMA','calcSMA','calcRSI','calcATR','calcMACD', wrappedCode)
    const runFn = getRunFn(_libEMA, calcSMA, calcRSI, _libATR, calcMACD)
    const { trades: rawTrades = [], indicators = {}, filterZones = [] } =
      runFn(enrichedData, { capital_ini: slotCapital, years, allocation_pct: 100 })
    // Flush virtual de posición abierta al último precio
    const lastBar = data[data.length - 1]
    if (rawTrades.length > 0) {
      const lastRaw = rawTrades[rawTrades.length - 1]
      if (lastRaw && !lastRaw.exitDate && lastRaw.entryPrice > 0) {
        rawTrades[rawTrades.length - 1] = {
          ...lastRaw,
          exitDate:  lastBar.date,
          exitPrice: lastBar.close,
          _virtualClose: true
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
  if (!filtered.length) return 0
  let peak = filtered[0].close, maxDD = 0
  filtered.forEach(d => {
    if (d.close > peak) peak = d.close
    const dd = (peak - d.close) / peak * 100
    if (dd > maxDD) maxDD = dd
  })
  return maxDD
}

// ── Max Drawdown real + T.invertido + Cap.inv.medio con curva de precio diaria ──
function _calcAssetMaxDD(trades, data, slotCapital, startDate) {
  if (!data || data.length === 0) return { maxDD: 0, maxDDDate: null, tInvertido: 0, capInvMedio: 0 }
  const filteredData = startDate ? data.filter(d => d.date >= startDate) : data
  if (!filteredData.length) return { maxDD: 0, maxDDDate: null, tInvertido: 0, capInvMedio: 0 }
  let peak = slotCapital, maxDD = 0, maxDDDate = null, lastCapital = slotCapital
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
    if (peak > 0) { const dd = (peak - floatEquity) / peak * 100; if (dd > maxDD) { maxDD = dd; maxDDDate = date } }
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
    tInvertido: totalBars > 0 ? (daysOpen / totalBars) * 100 : 0,
    capInvMedio: totalBars > 0 ? (sumCapInvRatio / totalBars) * 100 : 0,
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const { symbols, cfg: cfgInput, definition, modoAsig = 'slots', weights = {}, rankMap = {}, strategyId = null } = req.body
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

  // Fetch code_js desde Supabase si se proporcionó strategyId
  let codeJs = null
  if (strategyId && SUPA_URL && SUPA_KEY) {
    try {
      const sr = await fetch(
        `${SUPA_URL}/rest/v1/strategies?id=eq.${strategyId}&select=code_js`,
        { headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` } }
      )
      if (sr.ok) {
        const row = (await sr.json())?.[0] || {}
        codeJs = row.code_js || null
      }
    } catch(_) { codeJs = null }
  }

  try {
    // Descargar datos en batches para no saturar Stooq
    const BATCH = 4
    const allData = {}
    for (let i = 0; i < symbols.length; i += BATCH) {
      const chunk = symbols.slice(i, i+BATCH)
      await Promise.all(chunk.map(async sym => { allData[sym] = await fetchData(sym, cfg.years ?? 5, cfg.fromDate ?? null, cfg.toDate ?? null) }))
      if (i+BATCH < symbols.length) await sleep(400)
    }

    // SP500 para el filtro
    let sp500Data = null
    try { sp500Data = await fetchData('^GSPC', cfg.years ?? 5, cfg.fromDate ?? null, cfg.toDate ?? null) } catch(_) {}

    // Capital por slot (base para pnlPct; reescalado en modos rotativo/custom)
    const n = symbols.filter(s => allData[s]?.length).length
    if (!n) return res.status(400).json({ error: 'No se pudieron cargar datos de ningún símbolo' })
    const slotCapital = cfg.capitalIni / n

    // Ejecutar backtest individual por activo
    const assetResults = symbols.map(sym => {
      const data = allData[sym]
      if (!data?.length) return null
      if (codeJs) {
        // Motor code_js: sandbox por activo con slotCapital = capital total / nº activos
        const { trades } = runCodeJsAsset(data, sp500Data, codeJs, slotCapital, cfg.years ?? 5)
        const capitalReinv = trades.length ? trades[trades.length-1].capitalTras : slotCapital
        const gananciaSimple = trades.reduce((s,t) => s + t.pnlSimple, 0)
        const cutoff = new Date(data[data.length-1].date)
        cutoff.setFullYear(cutoff.getFullYear() - (cfg.years ?? 5))
        const startDate = cutoff.toISOString().split('T')[0]
        return { symbol: sym, data, trades, capitalReinv, gananciaSimple, startDate, blockEvents: {} }
      }
      // Fallback: motor EMA hardcoded (runSingleBacktest intacto)
      const slotCfg = { ...cfg, capitalIni: slotCapital }
      const { trades, capitalReinv, gananciaSimple, startDate, blockEvents } = runSingleBacktest(data, sp500Data, slotCfg)
      return { symbol: sym, data, trades, capitalReinv, gananciaSimple, startDate, blockEvents }
    }).filter(Boolean)

    // Calcular curvas según modo de asignación
    let curves
    if (modoAsig === 'rotativo') {
      curves = buildRotativoCurves(assetResults, cfg.capitalIni, rankMap)
    } else if (modoAsig === 'compartido') {
      curves = buildCompartidoCurves(assetResults, cfg.capitalIni)
    } else {
      // 'slots' por defecto — también maneja legacy 'custom'
      curves = buildSlotsCurves(assetResults, cfg.capitalIni)
    }

    // Métricas por activo (tabla resumen)
    const assetStats = assetResults.map(ar => {
      const wins = ar.trades.filter(t=>t.pnlPct>=0)
      const losses = ar.trades.filter(t=>t.pnlPct<0)
      const totalDias = ar.trades.reduce((s,t)=>s+t.dias,0)
      const pct = weights?.[ar.symbol] ?? (100 / n)
      const { maxDD: assetMaxDD, maxDDDate: assetMaxDDDate, tInvertido, capInvMedio } = _calcAssetMaxDD(ar.trades, ar.data, slotCapital, curves.startDate)
      const filtData = ar.data?.filter(d => d.date >= curves.startDate) ?? []
      const p0 = filtData[0]?.close
      const pN = filtData[filtData.length - 1]?.close
      const ganBH = (p0 && pN && p0 > 0) ? slotCapital * (pN / p0 - 1) : 0
      const priceMaxDD = _calcPriceMaxDD(ar.data, curves.startDate)
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
        tInvertido,
        capInvMedio,
        ganBH,
        priceMaxDD,
      }
    })

    // % medio de capital invertido
    const avgOccupancy = curves.occupancyCurve.length
      ? curves.occupancyCurve.reduce((s,p)=>s+p.value,0)/curves.occupancyCurve.length
      : 0

    // Historial combinado ordenado por fecha salida
    // En modo rotativo usamos los trades efectivamente ejecutados (reescalados)
    const sourceTrades = (modoAsig === 'rotativo' || modoAsig === 'compartido')
      ? (curves.executedTrades || [])
      : assetResults.flatMap(ar => ar.trades.map(t => ({ ...t, symbol: ar.symbol })))
            .sort((a,b) => a.exitDate.localeCompare(b.exitDate))

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
      n,
      slotCapital,
      modoAsig,
      startDate: curves.startDate,
      blockEventsBySymbol: Object.fromEntries(assetResults.map(ar => [ar.symbol, ar.blockEvents])),
    })
  } catch(err) {
    console.error(err)
    res.status(500).json({ error: err.message || 'Error interno' })
  }
}
