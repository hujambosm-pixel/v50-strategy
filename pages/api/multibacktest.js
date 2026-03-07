// pages/api/multibacktest.js
// Backtest de cartera multi-activo — Slots iguales con capital simple o compuesto

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

async function fetchData(symbol) {
  const sym = symbol === '^GSPC' ? 'spy' : symbol.replace('^','').toLowerCase()
  const url = `https://stooq.com/q/d/l/?s=${sym}.us&i=d`
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

// Combinar curvas de N activos por fecha, calculando equity total de cartera
function buildPortfolioCurves(assetResults, capitalIni, tipoCapital) {
  const n = assetResults.length
  if (!n) return { simpleCurve:[], compoundCurve:[], bhCurve:[], occupancyCurve:[], startDate:null }

  // Capital por slot
  const slotCapital = capitalIni / n

  // Recopilar todas las fechas únicas de todos los activos
  const dateSet = new Set()
  assetResults.forEach(ar => {
    if (ar.data) ar.data.forEach(d => dateSet.add(d.date))
  })
  const allDates = [...dateSet].sort()

  // startDate = max de todos los startDates (el periodo más corto que cubre todos)
  const startDate = assetResults.reduce((mx, ar) => {
    const s = ar.startDate?.toISOString?.().split('T')[0] || ar.startDate
    return s > mx ? s : mx
  }, '0000-00-00')

  const filteredDates = allDates.filter(d => d >= startDate)
  if (!filteredDates.length) return { simpleCurve:[], compoundCurve:[], bhCurve:[], occupancyCurve:[], startDate }

  // Para cada activo, calcular equity simple y compuesta por fecha
  const assetEquities = assetResults.map(ar => {
    const { trades, data } = ar
    const byDate = {}
    // B&H de este activo
    const filtData = data ? data.filter(d => d.date >= startDate) : []
    const p0 = filtData.length ? filtData[0].close : null

    filteredDates.forEach(date => {
      const exitsBefore = trades.filter(t => t.exitDate <= date)
      const simple = slotCapital + exitsBefore.reduce((s,t) => s + t.pnlSimple, 0)
      const compound = exitsBefore.length ? exitsBefore[exitsBefore.length-1].capitalTras : slotCapital
      // ¿hay trade abierto en esta fecha?
      const open = trades.some(t => t.entryDate <= date && t.exitDate > date)
      // BH de este activo en esta fecha
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

  // Sumar todos los activos en cada fecha
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

  // Max Drawdown helper
  const calcDD = curve => {
    let peak=curve[0]?.value||capitalIni, maxDD=0, maxDDDate=null
    curve.forEach(p=>{if(p.value>peak)peak=p.value;const dd=(peak-p.value)/peak*100;if(dd>maxDD){maxDD=dd;maxDDDate=p.date}})
    return { maxDD, maxDDDate }
  }

  return {
    simpleCurve, compoundCurve, bhCurve, occupancyCurve, startDate,
    ...(() => {
      const { maxDD:ddS, maxDDDate:ddSDate } = calcDD(simpleCurve)
      const { maxDD:ddC, maxDDDate:ddCDate } = calcDD(compoundCurve)
      const { maxDD:ddBH, maxDDDate:ddBHDate } = calcDD(bhCurve)
      return { maxDDSimple:ddS, maxDDSimpleDate:ddSDate, maxDDCompound:ddC, maxDDCompoundDate:ddCDate, maxDDBH:ddBH, maxDDBHDate:ddBHDate }
    })()
  }
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const { symbols, cfg } = req.body
  if (!Array.isArray(symbols) || !symbols.length) return res.status(400).json({ error: 'symbols requerido' })
  if (!cfg) return res.status(400).json({ error: 'cfg requerido' })

  try {
    // Descargar datos en batches para no saturar Stooq
    const BATCH = 4
    const allData = {}
    for (let i = 0; i < symbols.length; i += BATCH) {
      const chunk = symbols.slice(i, i+BATCH)
      await Promise.all(chunk.map(async sym => {
        allData[sym] = await fetchData(sym)
      }))
      if (i+BATCH < symbols.length) await sleep(400)
    }

    // SP500 para el filtro
    let sp500Data = null
    try { sp500Data = await fetchData('^GSPC') } catch(_) {}

    // Capital por slot
    const n = symbols.filter(s => allData[s]).length
    if (!n) return res.status(400).json({ error: 'No se pudieron cargar datos de ningún símbolo' })
    const slotCapital = cfg.capitalIni / n

    // Ejecutar backtest por activo
    const assetResults = symbols.map(sym => {
      const data = allData[sym]
      if (!data) return null
      const slotCfg = { ...cfg, capitalIni: slotCapital }
      const { trades, capitalReinv, gananciaSimple, startDate } = runSingleBacktest(data, sp500Data, slotCfg)
      return { symbol: sym, data, trades, capitalReinv, gananciaSimple, startDate }
    }).filter(Boolean)

    // Calcular curvas combinadas
    const curves = buildPortfolioCurves(assetResults, cfg.capitalIni, cfg.tipoCapital)

    // Métricas por activo (para tabla)
    const assetStats = assetResults.map(ar => {
      const wins = ar.trades.filter(t=>t.pnlPct>=0)
      const losses = ar.trades.filter(t=>t.pnlPct<0)
      const totalDias = ar.trades.reduce((s,t)=>s+t.dias,0)
      return {
        symbol: ar.symbol,
        trades: ar.trades.length,
        wins: wins.length,
        losses: losses.length,
        winRate: ar.trades.length ? (wins.length/ar.trades.length)*100 : 0,
        ganSimple: ar.gananciaSimple,
        ganComp: ar.capitalReinv - (cfg.capitalIni / n),
        totalDias,
      }
    })

    // % medio de capital invertido
    const avgOccupancy = curves.occupancyCurve.length
      ? curves.occupancyCurve.reduce((s,p)=>s+p.value,0)/curves.occupancyCurve.length
      : 0

    res.status(200).json({
      ...curves,
      assetStats,
      avgOccupancy,
      n,
      slotCapital,
      startDate: curves.startDate,
    })
  } catch(err) {
    console.error(err)
    res.status(500).json({ error: err.message || 'Error interno' })
  }
}
