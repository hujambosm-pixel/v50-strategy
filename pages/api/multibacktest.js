// pages/api/multibacktest.js
// Backtest de cartera multi-activo — Slots iguales | Capital rotativo | Pesos personalizados

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

function stooqSym(symbol) {
  const MAP={
    '^GSPC':'spy.us','^NDX':'ndx.us','^IBEX':'ibex.es','^GDAXI':'dax.de',
    '^FTSE':'ftse.uk','^N225':'n225.jp','BTC-USD':'btc-usd.v','ETH-USD':'eth-usd.v',
    'GC=F':'gc.f','CL=F':'cl.f',
  }
  if(MAP[symbol]) return MAP[symbol]
  if(symbol.endsWith('=F')) return symbol.replace('=F','').toLowerCase()+'.f'
  if(symbol.includes('-')) return symbol.toLowerCase()+'.v'
  if(symbol.startsWith('^')) return symbol.slice(1).toLowerCase()+'.us'
  return symbol.toLowerCase()+'.us'
}
async function fetchData(symbol) {
  const sym = stooqSym(symbol)
  const url = `https://stooq.com/q/d/l/?s=${sym}&i=d`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10000)
  try {
    const res = await fetch(url, { signal: controller.signal })
    const text = await res.text()
    if (!text || text.includes('No data') || text.trim().length < 50) return null
    return text.trim().split('\n').slice(1).filter(l=>l.trim()).map(l=>{
      const [date,open,high,low,close,volume] = l.split(',')
      return { date, open:parseFloat(open), high:parseFloat(high), low:parseFloat(low), close:parseFloat(close), volume:parseFloat(volume)||0 }
    }).filter(d=>d.close&&!isNaN(d.close)).sort((a,b)=>a.date.localeCompare(b.date))
  } catch { return null }
  finally { clearTimeout(timer) }
}

function runSingleBacktest(data, sp500Data, cfg) {
  const { emaR, emaL, capitalIni, tipoStop, atrPeriod, atrMult, sinPerdidas, reentry, tipoFiltro, sp500EmaR, sp500EmaL, years } = cfg
  const closes = data.map(d=>d.close), highs = data.map(d=>d.high), lows = data.map(d=>d.low)
  const emaRArr = calcEMA(closes, emaR), emaLArr = calcEMA(closes, emaL)
  const atrArr = tipoStop === 'atr' ? calcATR(highs, lows, closes, atrPeriod) : null
  let filtroArr = new Array(data.length).fill(false)
  if (sp500Data && tipoFiltro !== 'none') {
    const sp500Closes = data.map(d=>{ const m=sp500Data.find(s=>s.date===d.date); return m?m.close:null })
    let last=null; for(let i=0;i<sp500Closes.length;i++){if(sp500Closes[i]!=null)last=sp500Closes[i];else sp500Closes[i]=last}
    const spEmaR=calcEMA(sp500Closes,sp500EmaR), spEmaL=calcEMA(sp500Closes,sp500EmaL)
    filtroArr=data.map((_,i)=>{
      if(sp500Closes[i]==null||spEmaR[i]==null) return false
      if(tipoFiltro==='precio_ema') return sp500Closes[i]<spEmaR[i]
      if(tipoFiltro==='ema_ema') return spEmaR[i]<spEmaL[i]
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
  const inWindow=(i)=>new Date(data[i].date)>=startDate
  for (let i=1;i<data.length;i++) {
    const d=data[i],dp=data[i-1],er=emaRArr[i],el=emaLArr[i],erp=emaRArr[i-1],elp=emaLArr[i-1]
    if(!er||!el||!erp||!elp) continue
    const filt=filtroArr[i],inW=inWindow(i)
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
      trades.push({entryDate:data[idxEntrada].date,exitDate:d.date,entryPx:precioEntrada,exitPx:stopNivel,pnlPct:pnl*100,pnlSimple:pnl*capitalIni,capitalTras:capitalReinv,dias:Math.round((new Date(d.date)-new Date(data[idxEntrada].date))/86400000),tipo:'Stop'})
      enPosicion=false;precioEntrada=stopNivel=null;salidaPend=sinPerdAct=false
      if(reentry&&er>el)reentryMode=true;continue
    }
    if(enPosicion&&salidaPend&&bkSalida){
      if(sinPerdidas){sinPerdAct=d.low>precioEntrada}else{sinPerdAct=true}
      if(sinPerdAct&&d.low<=bkSalida){
        const pnl=(bkSalida-precioEntrada)/precioEntrada
        gananciaSimple+=pnl*capitalIni;capitalReinv+=pnl*capitalReinv
        trades.push({entryDate:data[idxEntrada].date,exitDate:d.date,entryPx:precioEntrada,exitPx:bkSalida,pnlPct:pnl*100,pnlSimple:pnl*capitalIni,capitalTras:capitalReinv,dias:Math.round((new Date(d.date)-new Date(data[idxEntrada].date))/86400000),tipo:'Exit'})
        enPosicion=false;precioEntrada=stopNivel=null;salidaPend=sinPerdAct=false;bkSalida=null
        if(reentry&&er>el)reentryMode=true;continue
      }
    }
    if(enPosicion&&cierreBaj&&precioEntrada){stopNivel=null;bkSalida=d.low;salidaPend=true;sinPerdAct=sinPerdidas?d.low>precioEntrada:true}
    if(cruceAlc&&!enPosicion&&inW&&!reentryMode&&!filt){entradaPend=true;breakout=d.high;reentryPend=false;if(tipoStop==='tecnico')stopNivel=Math.min(er,d.low)}
    if(entradaPend&&!enPosicion&&filt&&!reentryPend){entradaPend=false;breakout=null}
    if(entradaPend&&!enPosicion&&inW&&!cruceAlc&&!reentryPend){
      if(d.high<breakout){breakout=d.high;if(tipoStop==='tecnico')stopNivel=Math.min(er,d.low)}
      if(d.high>=breakout){
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
        precioEntrada=breakout;idxEntrada=i;enPosicion=true
        entradaPend=reentryPend=reentryMode=false;salidaPend=false
        if(tipoStop==='atr'&&atrArr?.[i])stopNivel=precioEntrada-atrArr[i]*atrMult
        else if(tipoStop!=='tecnico')stopNivel=null
      }
    }
    if(cierreBaj&&entradaPend&&!reentryMode){entradaPend=false;breakout=null}
  }
  return { trades, capitalReinv, gananciaSimple, startDate }
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
      const open = trades.some(t => t.entryDate <= date && t.exitDate > date)
      let bh = slotCapital
      if (p0 && filtData.length) {
        let bar = null
        for (let i = filtData.length-1; i>=0; i--) { if (filtData[i].date <= date) { bar=filtData[i]; break } }
        if (bar) bh = slotCapital * (bar.close / p0)
      }
      byDate[date] = { simple, compound, open, bh }
    })
    return byDate
  })

  const simpleCurve=[], compoundCurve=[], bhCurve=[], occupancyCurve=[]
  const step = Math.max(1, Math.floor(filteredDates.length / 400))
  filteredDates.filter((_,i)=>i%step===0||i===filteredDates.length-1).forEach(date => {
    let totSimple=0, totCompound=0, totBH=0, openSlots=0
    assetEquities.forEach(byDate => {
      const e = byDate[date]
      if (e) { totSimple+=e.simple; totCompound+=e.compound; totBH+=e.bh; if(e.open)openSlots++ }
    })
    simpleCurve.push({ date, value: totSimple })
    compoundCurve.push({ date, value: totCompound })
    bhCurve.push({ date, value: totBH })
    occupancyCurve.push({ date, value: (openSlots/n)*100 })
  })

  return { simpleCurve, compoundCurve, bhCurve, occupancyCurve, startDate, ..._calcDD(simpleCurve, compoundCurve, bhCurve, capitalIni) }
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

  // Construir curva de equity (step function en cierres)
  // Para cada fecha: pool = capitalTras del último trade cerrado antes de esa fecha
  const closedByDate = {}
  executedTrades.forEach(t => {
    closedByDate[t.exitDate] = t.capitalTras
  })

  const step = Math.max(1, Math.floor(filteredDates.length / 400))
  const sampledDates = filteredDates.filter((_,i) => i%step===0 || i===filteredDates.length-1)

  const compoundCurve = []
  let lastPool = capitalIni
  sampledDates.forEach(date => {
    // Actualizar pool con todos los cierres hasta esta fecha
    executedTrades
      .filter(t => t.exitDate <= date)
      .forEach(t => { lastPool = Math.max(lastPool, 0); lastPool = t.capitalTras })
    // La última asignación da el valor real
    const closedSoFar = executedTrades.filter(t => t.exitDate <= date)
    const val = closedSoFar.length ? closedSoFar[closedSoFar.length-1].capitalTras : capitalIni
    compoundCurve.push({ date, value: val })
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

  // Simple = compuesta en rotativo (no hay distinción sin reinversión; usamos compuesta)
  const simpleCurve = compoundCurve

  return {
    simpleCurve, compoundCurve, bhCurve, occupancyCurve, startDate,
    executedTrades,
    ..._calcDD(simpleCurve, compoundCurve, bhCurve, capitalIni)
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
      const open = trades.some(t => t.entryDate <= date && t.exitDate > date)
      let bh = slotCapital
      if (p0 && filtData.length) {
        let bar = null
        for (let i = filtData.length-1; i>=0; i--) { if (filtData[i].date <= date) { bar=filtData[i]; break } }
        if (bar) bh = slotCapital * (bar.close / p0)
      }
      byDate[date] = { simple, compound, open, bh }
    })
    return { byDate, slotCapital }
  })

  const simpleCurve=[], compoundCurve=[], bhCurve=[], occupancyCurve=[]
  const totalSlots = assetResults.length
  const step = Math.max(1, Math.floor(filteredDates.length / 400))
  filteredDates.filter((_,i)=>i%step===0||i===filteredDates.length-1).forEach(date => {
    let totSimple=0, totCompound=0, totBH=0, openSlots=0
    assetEquities.forEach(({ byDate }) => {
      const e = byDate[date]
      if (e) { totSimple+=e.simple; totCompound+=e.compound; totBH+=e.bh; if(e.open)openSlots++ }
    })
    simpleCurve.push({ date, value: totSimple })
    compoundCurve.push({ date, value: totCompound })
    bhCurve.push({ date, value: totBH })
    occupancyCurve.push({ date, value: (openSlots/totalSlots)*100 })
  })

  return { simpleCurve, compoundCurve, bhCurve, occupancyCurve, startDate, ..._calcDD(simpleCurve, compoundCurve, bhCurve, capitalIni) }
}

// ── Helpers ──────────────────────────────────────────────────
function _emptyCurves(startDate=null) {
  return { simpleCurve:[], compoundCurve:[], bhCurve:[], occupancyCurve:[], startDate,
    maxDDSimple:0, maxDDSimpleDate:null, maxDDCompound:0, maxDDCompoundDate:null, maxDDBH:0, maxDDBHDate:null }
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

const sleep = ms => new Promise(r => setTimeout(r, ms))

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const { symbols, cfg, modoAsig = 'slots', weights = {}, rankMap = {} } = req.body
  if (!Array.isArray(symbols) || !symbols.length) return res.status(400).json({ error: 'symbols requerido' })
  if (!cfg) return res.status(400).json({ error: 'cfg requerido' })

  try {
    // Descargar datos en batches para no saturar Stooq
    const BATCH = 4
    const allData = {}
    for (let i = 0; i < symbols.length; i += BATCH) {
      const chunk = symbols.slice(i, i+BATCH)
      await Promise.all(chunk.map(async sym => { allData[sym] = await fetchData(sym) }))
      if (i+BATCH < symbols.length) await sleep(400)
    }

    // SP500 para el filtro
    let sp500Data = null
    try { sp500Data = await fetchData('^GSPC') } catch(_) {}

    // Capital por slot (base para pnlPct; reescalado en modos rotativo/custom)
    const n = symbols.filter(s => allData[s]).length
    if (!n) return res.status(400).json({ error: 'No se pudieron cargar datos de ningún símbolo' })
    const slotCapital = cfg.capitalIni / n

    // Ejecutar backtest individual por activo (siempre con slotCapital como base para pnlPct)
    const assetResults = symbols.map(sym => {
      const data = allData[sym]
      if (!data) return null
      const slotCfg = { ...cfg, capitalIni: slotCapital }
      const { trades, capitalReinv, gananciaSimple, startDate } = runSingleBacktest(data, sp500Data, slotCfg)
      return { symbol: sym, data, trades, capitalReinv, gananciaSimple, startDate }
    }).filter(Boolean)

    // Calcular curvas según modo de asignación
    let curves
    if (modoAsig === 'rotativo') {
      curves = buildRotativoCurves(assetResults, cfg.capitalIni, rankMap)
    } else if (modoAsig === 'custom') {
      curves = buildCustomCurves(assetResults, cfg.capitalIni, weights)
    } else {
      // 'slots' (por defecto)
      curves = buildSlotsCurves(assetResults, cfg.capitalIni)
    }

    // Métricas por activo (tabla resumen)
    const assetStats = assetResults.map(ar => {
      const wins = ar.trades.filter(t=>t.pnlPct>=0)
      const losses = ar.trades.filter(t=>t.pnlPct<0)
      const totalDias = ar.trades.reduce((s,t)=>s+t.dias,0)
      const pct = weights?.[ar.symbol] ?? (100 / n)
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
      }
    })

    // % medio de capital invertido
    const avgOccupancy = curves.occupancyCurve.length
      ? curves.occupancyCurve.reduce((s,p)=>s+p.value,0)/curves.occupancyCurve.length
      : 0

    // Historial combinado ordenado por fecha salida
    // En modo rotativo usamos los trades efectivamente ejecutados (reescalados)
    const sourceTrades = modoAsig === 'rotativo'
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
    })
  } catch(err) {
    console.error(err)
    res.status(500).json({ error: err.message || 'Error interno' })
  }
}
