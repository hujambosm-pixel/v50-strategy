import yahooFinance from 'yahoo-finance2'

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

function projectEMA(lastEMA, lastClose, period, bars = 20) {
  const k = 2 / (period + 1)
  let v = lastEMA
  const pts = [{ offset: 0, value: v }]
  for (let i = 1; i <= bars; i++) {
    v = lastClose * k + v * (1 - k)
    pts.push({ offset: i, value: v })
  }
  return pts
}

function runBacktest(data, sp500Data, cfg) {
  const { emaR, emaL, capitalIni, tipoStop, atrPeriod, atrMult, sinPerdidas, reentry, tipoFiltro, sp500EmaR, sp500EmaL, years } = cfg
  const closes  = data.map(d => d.close)
  const highs   = data.map(d => d.high)
  const lows    = data.map(d => d.low)
  const emaRArr = calcEMA(closes, emaR)
  const emaLArr = calcEMA(closes, emaL)
  const atrArr  = tipoStop === 'atr' ? calcATR(highs, lows, closes, atrPeriod) : null

  let filtroArr = new Array(data.length).fill(false)
  if (sp500Data && tipoFiltro !== 'none') {
    const sp500Closes = data.map(d => { const m = sp500Data.find(s => s.date === d.date); return m ? m.close : null })
    let last = null
    for (let i = 0; i < sp500Closes.length; i++) {
      if (sp500Closes[i] != null) last = sp500Closes[i]; else sp500Closes[i] = last
    }
    const spEmaR = calcEMA(sp500Closes, sp500EmaR)
    const spEmaL = calcEMA(sp500Closes, sp500EmaL)
    filtroArr = data.map((_, i) => {
      if (sp500Closes[i] == null || spEmaR[i] == null) return false
      if (tipoFiltro === 'precio_ema') return sp500Closes[i] < spEmaR[i]
      if (tipoFiltro === 'ema_ema')   return spEmaR[i] < spEmaL[i]
      return false
    })
  }

  const lastDate  = new Date(data[data.length - 1].date)
  const startDate = new Date(lastDate)
  startDate.setFullYear(startDate.getFullYear() - years)

  let enPosicion=false, precioEntrada=null, idxEntrada=null, stopNivel=null
  let entradaPend=false, breakout=null, salidaPend=false, bkSalida=null
  let sinPerdAct=false, reentryMode=false, reentryPend=false
  let capitalReinv=capitalIni, gananciaSimple=0
  const trades = []

  const chartData = data.map((d, i) => ({ ...d, emaR: emaRArr[i], emaL: emaLArr[i], filtro: filtroArr[i], signal: null, breakoutLine: null, stopLine: null }))
  const inWindow = (i) => new Date(data[i].date) >= startDate

  for (let i = 1; i < data.length; i++) {
    const d=data[i], dp=data[i-1]
    const er=emaRArr[i], el=emaLArr[i], erp=emaRArr[i-1], elp=emaLArr[i-1]
    const filt=filtroArr[i], inW=inWindow(i)
    const cruceAlc = erp < elp && er >= el
    const cruceBaj = erp > elp && er <= el
    const cierreBaj = dp.close >= erp && d.close < er
    const cierreAlc = dp.close <= erp && d.close > er

    if (cruceBaj) { reentryMode = reentryPend = false }

    if (enPosicion && cruceBaj && sinPerdidas) {
      const pxSal=d.open, pnl=(pxSal-precioEntrada)/precioEntrada
      gananciaSimple+=pnl*capitalIni; capitalReinv+=pnl*capitalReinv
      trades.push(makeTrade(data[idxEntrada].date,d.date,precioEntrada,pxSal,pnl,capitalReinv,capitalIni,'Stop Emergencia'))
      chartData[i].signal='exit'
      enPosicion=false; precioEntrada=stopNivel=null; salidaPend=sinPerdAct=false
      if (reentry && er>el) reentryMode=true
      continue
    }

    if (enPosicion && stopNivel && d.low<=stopNivel) {
      const pnl=(stopNivel-precioEntrada)/precioEntrada
      gananciaSimple+=pnl*capitalIni; capitalReinv+=pnl*capitalReinv
      trades.push(makeTrade(data[idxEntrada].date,d.date,precioEntrada,stopNivel,pnl,capitalReinv,capitalIni,'Stop'))
      chartData[i].signal='exit'
      enPosicion=false; precioEntrada=stopNivel=null; salidaPend=sinPerdAct=false
      if (reentry && er>el) reentryMode=true
      continue
    }

    if (enPosicion && salidaPend && bkSalida) {
      if (sinPerdidas) { sinPerdAct = d.low > precioEntrada } else { sinPerdAct = true }
      if (sinPerdAct && d.low<=bkSalida) {
        const pnl=(bkSalida-precioEntrada)/precioEntrada
        gananciaSimple+=pnl*capitalIni; capitalReinv+=pnl*capitalReinv
        trades.push(makeTrade(data[idxEntrada].date,d.date,precioEntrada,bkSalida,pnl,capitalReinv,capitalIni,'Exit'))
        chartData[i].signal='exit'
        enPosicion=false; precioEntrada=stopNivel=null; salidaPend=sinPerdAct=false; bkSalida=null
        if (reentry && er>el) reentryMode=true
        continue
      }
    }

    if (enPosicion && cierreBaj && precioEntrada) {
      stopNivel=null; bkSalida=d.low; salidaPend=true
      sinPerdAct = sinPerdidas ? d.low>precioEntrada : true
    }

    if (cruceAlc && !enPosicion && inW && !reentryMode && !filt) {
      entradaPend=true; breakout=d.high; reentryPend=false
      if (tipoStop==='tecnico') stopNivel=Math.min(er,d.low)
      chartData[i].breakoutLine=breakout
    }

    if (entradaPend && !enPosicion && filt && !reentryPend) { entradaPend=false; breakout=null }

    if (entradaPend && !enPosicion && inW && !cruceAlc && !reentryPend) {
      if (d.high<breakout) { breakout=d.high; if(tipoStop==='tecnico') stopNivel=Math.min(er,d.low) }
      chartData[i].breakoutLine=breakout
      if (d.high>=breakout) {
        precioEntrada=breakout; idxEntrada=i; enPosicion=true; entradaPend=false; salidaPend=false
        chartData[i].signal='entry'
        if (tipoStop==='atr'&&atrArr?.[i]) stopNivel=precioEntrada-atrArr[i]*atrMult
        else if (tipoStop!=='tecnico') stopNivel=null
      }
    }

    if (reentry && reentryMode && !enPosicion && inW && er>el && !filt && cierreAlc && !entradaPend) {
      entradaPend=true; reentryPend=true; breakout=d.high
      if (tipoStop==='tecnico') stopNivel=Math.min(er,d.low)
      chartData[i].breakoutLine=breakout
    }

    if (reentryPend && !enPosicion && filt) { entradaPend=reentryPend=false; breakout=null }

    if (entradaPend && reentryPend && !enPosicion && inW && !cierreAlc) {
      if (d.high<breakout) { breakout=d.high; if(tipoStop==='tecnico') stopNivel=Math.min(er,d.low) }
      chartData[i].breakoutLine=breakout
      if (d.high>=breakout) {
        precioEntrada=breakout; idxEntrada=i; enPosicion=true
        entradaPend=reentryPend=reentryMode=false; salidaPend=false
        chartData[i].signal='entry'
        if (tipoStop==='atr'&&atrArr?.[i]) stopNivel=precioEntrada-atrArr[i]*atrMult
        else if (tipoStop!=='tecnico') stopNivel=null
      }
    }

    if (cierreBaj && entradaPend && !reentryMode) { entradaPend=false; breakout=null }
    if (enPosicion && stopNivel) chartData[i].stopLine=stopNivel
  }

  return { chartData, trades, capitalReinv, gananciaSimple, startDate }
}

function makeTrade(entryDate, exitDate, entryPx, exitPx, pnl, capitalReinv, capitalIni, tipo) {
  return {
    entryDate, exitDate, entryPx, exitPx,
    pnlPct: pnl*100,
    pnlSimple: pnl*capitalIni,
    capitalTras: capitalReinv,
    dias: Math.round((new Date(exitDate)-new Date(entryDate))/86400000),
    tipo,
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const { simbolo, cfg } = req.body
  try {
    const period2 = new Date()
    const period1 = new Date(); period1.setFullYear(period1.getFullYear()-(cfg.years+1))
    const raw = await yahooFinance.historical(simbolo, { period1, period2, interval: '1d' })
    if (!raw||raw.length===0) return res.status(404).json({ error: `No se encontraron datos para "${simbolo}"` })
    const data = raw.filter(d=>d.close!=null).map(d=>({
      date: d.date.toISOString().split('T')[0],
      open:d.open, high:d.high, low:d.low, close:d.close, volume:d.volume
    }))
    let sp500Data=null
    if (cfg.tipoFiltro!=='none') {
      try {
        const rawSP=await yahooFinance.historical('^GSPC',{period1,period2,interval:'1d'})
        sp500Data=rawSP.filter(d=>d.close!=null).map(d=>({date:d.date.toISOString().split('T')[0],close:d.close}))
      } catch(_) {}
    }
    let sp500Quote=null
    try {
      const q=await yahooFinance.quote('^GSPC')
      sp500Quote={price:q.regularMarketPrice,change:q.regularMarketChange,changePct:q.regularMarketChangePercent,date:q.regularMarketTime}
    } catch(_) {}
    const {chartData,trades,capitalReinv,gananciaSimple,startDate}=runBacktest(data,sp500Data,cfg)
    const last=chartData[chartData.length-1]
    const projR=projectEMA(last.emaR,last.close,cfg.emaR)
    const projL=projectEMA(last.emaL,last.close,cfg.emaL)
    const lastDate=new Date(last.date)
    const projDates=projR.map(p=>{ const d=new Date(lastDate); d.setDate(d.getDate()+p.offset); return d.toISOString().split('T')[0] })
    let sp500Status=null
    if (sp500Data&&sp500Data.length>0) {
      const spC=sp500Data.map(d=>d.close)
      const spEmaR=calcEMA(spC,cfg.sp500EmaR), spEmaL=calcEMA(spC,cfg.sp500EmaL)
      sp500Status={
        precio:sp500Quote?.price??spC[spC.length-1],
        emaR:spEmaR[spEmaR.length-1], emaL:spEmaL[spEmaL.length-1],
        date:sp500Quote?.date??sp500Data[sp500Data.length-1].date,
        change:sp500Quote?.change??0, changePct:sp500Quote?.changePct??0
      }
    }
    res.status(200).json({
      chartData:chartData.filter(d=>new Date(d.date)>=new Date(startDate)),
      trades, capitalReinv, gananciaSimple,
      startDate:startDate.toISOString().split('T')[0],
      sp500Status,
      projR:projR.map((p,i)=>({date:projDates[i],value:p.value})),
      projL:projL.map((p,i)=>({date:projDates[i],value:p.value})),
      meta:{simbolo,ultimaFecha:last.date,ultimoPrecio:last.close,totalBars:data.length}
    })
  } catch(err) {
    console.error(err)
    res.status(500).json({error:err.message||'Error interno'})
  }
}
