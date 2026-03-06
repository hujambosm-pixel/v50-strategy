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
  for (let i = 1; i <= bars; i++) { v = lastClose * k + v * (1 - k); pts.push({ offset: i, value: v }) }
  return pts
}
async function fetchAV(symbol) {
  const sym = symbol === '^GSPC' ? 'spy' : symbol.replace('^','').toLowerCase()
  const url = `https://stooq.com/q/d/l/?s=${sym}.us&i=d`
  const res = await fetch(url)
  const text = await res.text()
  if (!text || text.includes('No data') || text.trim().length < 50) throw new Error(`Sin datos para ${symbol}`)
  return text.trim().split('\n').slice(1).filter(l=>l.trim()).map(l=>{
    const [date,open,high,low,close,volume] = l.split(',')
    return { date, open:parseFloat(open), high:parseFloat(high), low:parseFloat(low), close:parseFloat(close), volume:parseFloat(volume)||0 }
  }).filter(d=>d.close&&!isNaN(d.close)).sort((a,b)=>a.date.localeCompare(b.date))
}
function runBacktest(data, sp500Data, cfg) {
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
  const chartData=data.map((d,i)=>({...d,emaR:emaRArr[i],emaL:emaLArr[i],filtro:filtroArr[i],signal:null,breakoutLine:null,stopLine:null}))
  const inWindow=(i)=>new Date(data[i].date)>=startDate
  for (let i=1;i<data.length;i++) {
    const d=data[i],dp=data[i-1],er=emaRArr[i],el=emaLArr[i],erp=emaRArr[i-1],elp=emaLArr[i-1]
    const filt=filtroArr[i],inW=inWindow(i)
    const cruceAlc=erp<elp&&er>=el, cruceBaj=erp>elp&&er<=el
    const cierreBaj=dp.close>=erp&&d.close<er, cierreAlc=dp.close<=erp&&d.close>er
    if(cruceBaj){reentryMode=reentryPend=false}
    if(enPosicion&&cruceBaj&&sinPerdidas){
      const pxSal=d.open,pnl=(pxSal-precioEntrada)/precioEntrada
      gananciaSimple+=pnl*capitalIni;capitalReinv+=pnl*capitalReinv
      trades.push(makeTrade(data[idxEntrada].date,d.date,precioEntrada,pxSal,pnl,capitalReinv,capitalIni,'Stop Emergencia'))
      chartData[i].signal='exit';enPosicion=false;precioEntrada=stopNivel=null;salidaPend=sinPerdAct=false
      if(reentry&&er>el)reentryMode=true;continue
    }
    if(enPosicion&&stopNivel&&d.low<=stopNivel){
      const pnl=(stopNivel-precioEntrada)/precioEntrada
      gananciaSimple+=pnl*capitalIni;capitalReinv+=pnl*capitalReinv
      trades.push(makeTrade(data[idxEntrada].date,d.date,precioEntrada,stopNivel,pnl,capitalReinv,capitalIni,'Stop'))
      chartData[i].signal='exit';enPosicion=false;precioEntrada=stopNivel=null;salidaPend=sinPerdAct=false
      if(reentry&&er>el)reentryMode=true;continue
    }
    if(enPosicion&&salidaPend&&bkSalida){
      if(sinPerdidas){sinPerdAct=d.low>precioEntrada}else{sinPerdAct=true}
      if(sinPerdAct&&d.low<=bkSalida){
        const pnl=(bkSalida-precioEntrada)/precioEntrada
        gananciaSimple+=pnl*capitalIni;capitalReinv+=pnl*capitalReinv
        trades.push(makeTrade(data[idxEntrada].date,d.date,precioEntrada,bkSalida,pnl,capitalReinv,capitalIni,'Exit'))
        chartData[i].signal='exit';enPosicion=false;precioEntrada=stopNivel=null;salidaPend=sinPerdAct=false;bkSalida=null
        if(reentry&&er>el)reentryMode=true;continue
      }
    }
    if(enPosicion&&cierreBaj&&precioEntrada){stopNivel=null;bkSalida=d.low;salidaPend=true;sinPerdAct=sinPerdidas?d.low>precioEntrada:true}
    if(cruceAlc&&!enPosicion&&inW&&!reentryMode&&!filt){entradaPend=true;breakout=d.high;reentryPend=false;if(tipoStop==='tecnico')stopNivel=Math.min(er,d.low);chartData[i].breakoutLine=breakout}
    if(entradaPend&&!enPosicion&&filt&&!reentryPend){entradaPend=false;breakout=null}
    if(entradaPend&&!enPosicion&&inW&&!cruceAlc&&!reentryPend){
      if(d.high<breakout){breakout=d.high;if(tipoStop==='tecnico')stopNivel=Math.min(er,d.low)}
      chartData[i].breakoutLine=breakout
      if(d.high>=breakout){
        precioEntrada=breakout;idxEntrada=i;enPosicion=true;entradaPend=false;salidaPend=false
        chartData[i].signal='entry'
        if(tipoStop==='atr'&&atrArr?.[i])stopNivel=precioEntrada-atrArr[i]*atrMult
        else if(tipoStop!=='tecnico')stopNivel=null
      }
    }
    if(reentry&&reentryMode&&!enPosicion&&inW&&er>el&&!filt&&cierreAlc&&!entradaPend){
      entradaPend=true;reentryPend=true;breakout=d.high
      if(tipoStop==='tecnico')stopNivel=Math.min(er,d.low);chartData[i].breakoutLine=breakout
    }
    if(reentryPend&&!enPosicion&&filt){entradaPend=reentryPend=false;breakout=null}
    if(entradaPend&&reentryPend&&!enPosicion&&inW&&!cierreAlc){
      if(d.high<breakout){breakout=d.high;if(tipoStop==='tecnico')stopNivel=Math.min(er,d.low)}
      chartData[i].breakoutLine=breakout
      if(d.high>=breakout){
        precioEntrada=breakout;idxEntrada=i;enPosicion=true
        entradaPend=reentryPend=reentryMode=false;salidaPend=false
        chartData[i].signal='entry'
        if(tipoStop==='atr'&&atrArr?.[i])stopNivel=precioEntrada-atrArr[i]*atrMult
        else if(tipoStop!=='tecnico')stopNivel=null
      }
    }
    if(cierreBaj&&entradaPend&&!reentryMode){entradaPend=false;breakout=null}
    if(enPosicion&&stopNivel)chartData[i].stopLine=stopNivel
  }
  return {chartData,trades,capitalReinv,gananciaSimple,startDate}
}
function makeTrade(entryDate,exitDate,entryPx,exitPx,pnl,capitalReinv,capitalIni,tipo){
  return {entryDate,exitDate,entryPx,exitPx,pnlPct:pnl*100,pnlSimple:pnl*capitalIni,capitalTras:capitalReinv,dias:Math.round((new Date(exitDate)-new Date(entryDate))/86400000),tipo}
}
function calcEquityCurves(trades, data, capitalIni, startDate, sp500Data) {
  const filtered = data.filter(d=>new Date(d.date)>=new Date(startDate))
  if (!filtered.length) return {strategyCurve:[],bhCurve:[],sp500BHCurve:[],maxDDStrategy:0,maxDDBH:0,maxDDSP500:0,maxDDStrategyDate:null,maxDDBHDate:null,maxDDSP500Date:null}
  const p0 = filtered[0].close
  const step = Math.max(1, Math.floor(filtered.length/300))
  const sampled = filtered.filter((_,i)=>i%step===0||i===filtered.length-1)

  // Strategy curve
  const strategyCurve=[], bhCurve=[], sp500BHCurve=[]
  let lastStrat=capitalIni

  // SP500 start price
  let sp0Close=null
  if (sp500Data) {
    const sp0=sp500Data.find(d=>d.date>=filtered[0].date)
    if(sp0) sp0Close=sp0.close
  }

  sampled.forEach(d=>{
    const exits=trades.filter(t=>t.exitDate<=d.date)
    if(exits.length) lastStrat=capitalIni+exits.reduce((s,t)=>s+t.pnlSimple,0)
    strategyCurve.push({date:d.date,value:lastStrat})
    bhCurve.push({date:d.date,value:capitalIni*(d.close/p0)})
    if(sp500Data&&sp0Close){
      let spBar=null
      for(let i=sp500Data.length-1;i>=0;i--){if(sp500Data[i].date<=d.date){spBar=sp500Data[i];break}}
      if(spBar) sp500BHCurve.push({date:d.date,value:capitalIni*(spBar.close/sp0Close)})
    }
  })

  const calcDD=(curve)=>{
    let peak=curve[0]?.value||capitalIni, maxDD=0, maxDDDate=null
    curve.forEach(p=>{
      if(p.value>peak)peak=p.value
      const dd=(peak-p.value)/peak*100
      if(dd>maxDD){maxDD=dd;maxDDDate=p.date}
    })
    return {maxDD,maxDDDate}
  }
  const {maxDD:maxDDStrategy,maxDDDate:maxDDStrategyDate}=calcDD(strategyCurve)
  const {maxDD:maxDDBH,maxDDDate:maxDDBHDate}=calcDD(bhCurve)
  const {maxDD:maxDDSP500,maxDDDate:maxDDSP500Date}=calcDD(sp500BHCurve)
  return {strategyCurve,bhCurve,sp500BHCurve,maxDDStrategy,maxDDBH,maxDDSP500,maxDDStrategyDate,maxDDBHDate,maxDDSP500Date}
}
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const { simbolo, cfg } = req.body
  try {
    const data = await fetchAV(simbolo)
    if (!data||data.length===0) return res.status(404).json({error:`No se encontraron datos para "${simbolo}"`})
    // Always fetch SP500
    let sp500Data=null
    try { sp500Data=await fetchAV('^GSPC') } catch(_) {}
    const {chartData,trades,capitalReinv,gananciaSimple,startDate}=runBacktest(data,sp500Data,cfg)
    const filteredData=data.filter(d=>new Date(d.date)>=new Date(startDate))
    let ganBH=0
    if(filteredData.length>=2) ganBH=cfg.capitalIni*(filteredData[filteredData.length-1].close/filteredData[0].close)-cfg.capitalIni
    const {strategyCurve,bhCurve,sp500BHCurve,maxDDStrategy,maxDDBH,maxDDSP500,maxDDStrategyDate,maxDDBHDate,maxDDSP500Date}=calcEquityCurves(trades,data,cfg.capitalIni,startDate,sp500Data)
    let sp500Status=null
    if(sp500Data&&sp500Data.length>0){
      const spC=sp500Data.map(d=>d.close)
      const spEmaR=calcEMA(spC,cfg.sp500EmaR), spEmaL=calcEMA(spC,cfg.sp500EmaL)
      const lastSP=sp500Data[sp500Data.length-1]
      sp500Status={precio:lastSP.close,emaR:spEmaR[spEmaR.length-1],emaL:spEmaL[spEmaL.length-1],date:lastSP.date,change:0,changePct:0}
    }
    res.status(200).json({
      chartData:chartData.filter(d=>new Date(d.date)>=new Date(startDate)),
      trades,capitalReinv,gananciaSimple,ganBH,
      startDate:startDate.toISOString().split('T')[0],
      sp500Status,strategyCurve,bhCurve,sp500BHCurve,
      maxDDStrategy,maxDDBH,maxDDSP500,
      maxDDStrategyDate,maxDDBHDate,maxDDSP500Date,
      meta:{simbolo,ultimaFecha:data[data.length-1].date,ultimoPrecio:data[data.length-1].close,totalBars:data.length}
    })
  } catch(err) {
    console.error(err); res.status(500).json({error:err.message||'Error interno'})
  }
}
