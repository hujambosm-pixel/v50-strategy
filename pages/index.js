import { useState, useRef, useEffect, useCallback } from 'react'
import Head from 'next/head'

// ── Métricas ──────────────────────────────────────────────────
function calcMetrics(trades, capitalIni, capitalReinv, gananciaSimple, ganBH, startDate, endDate) {
  if (!trades || trades.length === 0) return null
  const n = trades.length
  const wins = trades.filter(t => t.pnlPct >= 0)
  const losses = trades.filter(t => t.pnlPct < 0)
  const winRate = (wins.length / n) * 100
  const avgWin  = wins.length  ? wins.reduce((s,t)=>s+t.pnlPct,0)/wins.length : 0
  const avgLoss = losses.length ? losses.reduce((s,t)=>s+Math.abs(t.pnlPct),0)/losses.length : 0
  const totalDias = trades.reduce((s,t)=>s+t.dias,0)

  // Años reales del periodo total (días naturales entre primera y última fecha)
  const totalDiasNaturales = startDate && endDate
    ? (new Date(endDate)-new Date(startDate)) / 86400000
    : 365
  const anios = totalDiasNaturales / 365.25
  const safYears = Math.max(anios, 0.01)

  // Años reales invertidos (días de trades / 365.25)
  const aniosInv = totalDias / 365.25
  const tiempoInvPct = (totalDias / totalDiasNaturales) * 100

  const cagrS  = Math.pow(Math.max(capitalIni+gananciaSimple,0.01)/capitalIni, 1/safYears) - 1
  const cagrC  = capitalReinv > 0 ? Math.pow(capitalReinv/capitalIni, 1/safYears) - 1 : 0
  const capBH  = capitalIni + ganBH
  const cagrBH = capBH > 0 ? Math.pow(capBH/capitalIni, 1/safYears) - 1 : 0

  const gBrute = wins.reduce((s,t)=>s+t.pnlSimple,0)
  const lBrute = losses.reduce((s,t)=>s+Math.abs(t.pnlSimple),0)
  const factorBen = lBrute > 0 ? gBrute/lBrute : 999

  let peakS=capitalIni, maxDDS=0
  trades.forEach(t=>{
    const eq=capitalIni+trades.slice(0,trades.indexOf(t)+1).reduce((s,x)=>s+x.pnlSimple,0)
    if(eq>peakS)peakS=eq; const dd=(peakS-eq)/peakS*100; if(dd>maxDDS)maxDDS=dd
  })
  let peakR=capitalIni, maxDDR=0
  trades.forEach(t=>{
    if(t.capitalTras>peakR)peakR=t.capitalTras
    const dd=(peakR-t.capitalTras)/peakR*100; if(dd>maxDDR)maxDDR=dd
  })

  return {
    n, wins:wins.length, losses:losses.length, winRate, avgWin, avgLoss,
    totalDias, diasProm:totalDias/n,
    ganSimple:gananciaSimple, ganComp:capitalReinv-capitalIni, ganBH,
    ganTotalPct:(gananciaSimple/capitalIni)*100,
    cagrS:cagrS*100, cagrC:cagrC*100, cagrBH:cagrBH*100,
    factorBen, ddSimple:maxDDS, ddComp:maxDDR,
    tiempoInvPct, aniosInv, anios:safYears,
  }
}

// ── Helpers ───────────────────────────────────────────────────
const MONO = '"JetBrains Mono", "Fira Code", "IBM Plex Mono", monospace'

function fmt(v, dec=2, suf='') {
  if (v==null||isNaN(v)) return '—'
  return v.toLocaleString('es-ES',{minimumFractionDigits:dec,maximumFractionDigits:dec})+suf
}
function fmtDate(s) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('es-ES',{day:'2-digit',month:'2-digit',year:'numeric'})
}
function f2(v) {
  if (v==null||isNaN(v)) return '—'
  return v.toLocaleString('es-ES',{minimumFractionDigits:2,maximumFractionDigits:2})
}
function tvSym(sym) {
  if (sym==='^GSPC') return 'SP:SPX'
  if (sym==='^IBEX') return 'BME:IBC'
  if (sym==='^GDAXI') return 'XETR:DAX'
  if (sym==='^NDX') return 'NASDAQ:NDX'
  if (sym.includes('-USD')) return `BINANCE:${sym.replace('-','')}`
  return sym
}

// ── CandleChart ───────────────────────────────────────────────
function CandleChart({ data, emaRPeriod, emaLPeriod, trades, maxDD, showTradeLabels, rulerActive }) {
  const containerRef = useRef(null)
  const svgRef       = useRef(null)
  const legendRef    = useRef(null)
  const tooltipRef   = useRef(null)
  const chartRef     = useRef(null)
  const candlesRef   = useRef(null)
  const rulerStart   = useRef(null)
  const rulerActiveR = useRef(rulerActive)

  useEffect(() => { rulerActiveR.current = rulerActive }, [rulerActive])

  useEffect(() => {
    if (typeof window==='undefined'||!containerRef.current) return

    import('lightweight-charts').then(({createChart,CrosshairMode,LineStyle}) => {
      if (chartRef.current) { chartRef.current.remove(); chartRef.current=null }

      const chart = createChart(containerRef.current, {
        width: containerRef.current.clientWidth, height: 480,
        layout: {background:{color:'#080c14'}, textColor:'#7a9bc0'},
        grid: {vertLines:{color:'#0d1520'}, horzLines:{color:'#0d1520'}},
        crosshair: {mode: CrosshairMode.Normal},
        rightPriceScale: {borderColor:'#1a2d45'},
        timeScale: {borderColor:'#1a2d45', timeVisible:true},
      })
      chartRef.current = chart

      // Velas
      const candles = chart.addCandlestickSeries({
        upColor:'#00e5a0', downColor:'#ff4d6d',
        borderUpColor:'#00e5a0', borderDownColor:'#ff4d6d',
        wickUpColor:'#00e5a0', wickDownColor:'#ff4d6d',
      })
      candles.setData(data.map(d=>({time:d.date,open:d.open,high:d.high,low:d.low,close:d.close})))
      candlesRef.current = candles

      // EMAs sin línea de precio en el eje
      const erS = chart.addLineSeries({color:'#ffd166',lineWidth:2,title:`EMA ${emaRPeriod}`,lastValueVisible:true,priceLineVisible:false})
      erS.setData(data.filter(d=>d.emaR!=null).map(d=>({time:d.date,value:d.emaR})))
      const elS = chart.addLineSeries({color:'#ff4d6d',lineWidth:2,title:`EMA ${emaLPeriod}`,lastValueVisible:true,priceLineVisible:false})
      elS.setData(data.filter(d=>d.emaL!=null).map(d=>({time:d.date,value:d.emaL})))

      // Líneas de trades
      trades.forEach(t => {
        if (!t.entryDate||!t.exitDate) return
        const ls = chart.addLineSeries({
          color:t.pnlPct>=0?'#00e5a0':'#ff4d6d', lineWidth:2,
          lastValueVisible:false, priceLineVisible:false, crosshairMarkerVisible:false,
        })
        ls.setData([{time:t.entryDate,value:t.entryPx},{time:t.exitDate,value:t.exitPx}])
      })

      // Cruces EMA — flechas oblicuas con texto ↗ ↘, sin cuerpo de flecha vertical
      const marks = []
      for (let i=1; i<data.length; i++) {
        const p=data[i-1], c=data[i]
        if (!p.emaR||!p.emaL||!c.emaR||!c.emaL) continue
        if (p.emaR<p.emaL && c.emaR>=c.emaL)
          marks.push({time:c.date, position:'belowBar', color:'#00e5a0', shape:'circle', size:0, text:'↗'})
        else if (p.emaR>p.emaL && c.emaR<=c.emaL)
          marks.push({time:c.date, position:'aboveBar', color:'#ff4d6d', shape:'circle', size:0, text:'↘'})
      }
      if (marks.length) candles.setMarkers(marks)

      // Lookup maps
      const ohlcMap={}, erMap={}, elMap={}
      data.forEach(d=>{
        ohlcMap[d.date]=d
        if(d.emaR!=null) erMap[d.date]=d.emaR
        if(d.emaL!=null) elMap[d.date]=d.emaL
      })

      // ── Ruler SVG helpers ──
      const svg = svgRef.current
      const NS  = 'http://www.w3.org/2000/svg'
      const mk  = (tag,attrs) => {
        const el=document.createElementNS(NS,tag)
        Object.entries(attrs).forEach(([k,v])=>el.setAttribute(k,v))
        return el
      }
      const clearSvg = () => { if(svg) svg.innerHTML='' }

      const drawRulerLine = (s, e) => {
        if (!svg) return
        clearSvg()
        const {x:x1,y:y1}=s, {x:x2,y:y2,price:pe,time:te}=e
        const sp=s.price, diff=pe-sp, pct=sp>0?(diff/sp)*100:0
        let days=0
        if(s.time&&te){
          const t1=typeof s.time==='string'?new Date(s.time).getTime():s.time*1000
          const t2=typeof te==='string'?new Date(te).getTime():te*1000
          days=Math.round(Math.abs(t2-t1)/86400000)
        }
        // Horizontal guide
        svg.appendChild(mk('line',{x1,y1,x2,y2:y1,stroke:'rgba(255,209,102,0.25)','stroke-width':'1','stroke-dasharray':'4,3'}))
        // Vertical guide
        svg.appendChild(mk('line',{x1:x2,y1,x2,y2,stroke:'rgba(255,209,102,0.25)','stroke-width':'1','stroke-dasharray':'4,3'}))
        // Main diagonal line
        svg.appendChild(mk('line',{x1,y1,x2,y2,stroke:'#ffd166','stroke-width':'1.5'}))
        // Endpoint circles
        [[x1,y1],[x2,y2]].forEach(([cx,cy])=>svg.appendChild(mk('circle',{cx,cy,r:'3',fill:'#ffd166',stroke:'#080c14','stroke-width':'1'})))
        // Label on line midpoint
        const mx=(x1+x2)/2, my=(y1+y2)/2
        const label=`${days}d  ${diff>=0?'+':''}${pct.toFixed(2)}%`
        const bw=label.length*7+16
        svg.appendChild(mk('rect',{x:mx-bw/2,y:my-13,width:bw,height:17,fill:'rgba(8,12,20,0.92)',rx:'3',stroke:'#ffd166','stroke-width':'0.5'}))
        const txt=mk('text',{x:mx,y:my+1,fill:'#ffd166','font-size':'11','font-family':MONO,'text-anchor':'middle','dominant-baseline':'middle'})
        txt.textContent=label; svg.appendChild(txt)
      }

      const getPoint = (e) => {
        const rect=containerRef.current.getBoundingClientRect()
        const px=e.clientX-rect.left, py=e.clientY-rect.top
        const time=chartRef.current?.timeScale().coordinateToTime(px)
        let price = candlesRef.current?.coordinateToPrice(py)
        // Ctrl = magnet to close
        if (e.ctrlKey && time && ohlcMap[time]) price = ohlcMap[time].close
        const sy = (price!=null&&candlesRef.current) ? (candlesRef.current.priceToCoordinate(price)??py) : py
        return {x:px, y:sy, price, time}
      }

      const onMouseMove = (e) => {
        if (!rulerActiveR.current) return
        if (rulerStart.current) drawRulerLine(rulerStart.current, getPoint(e))
      }
      const onClick = (e) => {
        if (!rulerActiveR.current) return
        const pt=getPoint(e)
        if (!rulerStart.current) { rulerStart.current=pt }
        else { rulerStart.current=null }
      }
      const onDblClick = () => { rulerStart.current=null; clearSvg() }

      const cnt=containerRef.current
      cnt.addEventListener('mousemove', onMouseMove)
      cnt.addEventListener('click', onClick)
      cnt.addEventListener('dblclick', onDblClick)

      // ── OHLC Legend ──
      chart.subscribeCrosshairMove(param => {
        const leg=legendRef.current
        if (leg) {
          if (param.time) {
            const b=ohlcMap[param.time], er=erMap[param.time], el=elMap[param.time]
            if (b) {
              const chg=b.close-b.open, pct=(chg/b.open)*100, cc=chg>=0?'#00e5a0':'#ff4d6d'
              leg.innerHTML=
                `<span style="color:#7a9bc0;margin-right:8px">${b.date}</span>`+
                `<span style="margin-right:8px">O <b>${f2(b.open)}</b></span>`+
                `<span style="margin-right:8px">H <b style="color:#00e5a0">${f2(b.high)}</b></span>`+
                `<span style="margin-right:8px">L <b style="color:#ff4d6d">${f2(b.low)}</b></span>`+
                `<span style="margin-right:12px">C <b>${f2(b.close)}</b></span>`+
                `<span style="color:${cc};margin-right:14px">${chg>=0?'+':''}${f2(chg)} (${pct>=0?'+':''}${pct.toFixed(2)}%)</span>`+
                (er!=null?`<span style="margin-right:8px">EMA${emaRPeriod} <b style="color:#ffd166">${f2(er)}</b></span>`:'')+
                (el!=null?`<span>EMA${emaLPeriod} <b style="color:#ff4d6d">${f2(el)}</b></span>`:'')
            }
          } else leg.innerHTML=''
        }

        // Tooltip trades
        const tt=tooltipRef.current
        if (tt&&!showTradeLabels) {
          if (!param.time||!param.point) { tt.style.display='none'; return }
          const trade=trades.find(t=>t.entryDate<=param.time&&param.time<=t.exitDate)
          if (!trade) { tt.style.display='none'; return }
          const bc=trade.pnlPct>=0?'#00e5a0':'#ff4d6d'
          const w=containerRef.current?.clientWidth||600
          tt.style.display='block'
          tt.style.left=((param.point.x+210>w)?param.point.x-220:param.point.x+16)+'px'
          tt.style.top=Math.max(8,param.point.y-70)+'px'
          tt.style.borderColor=bc
          tt.innerHTML=
            `<div style="font-size:10px;color:#7a9bc0;margin-bottom:4px">${fmtDate(trade.entryDate)} → ${fmtDate(trade.exitDate)}</div>`+
            `<div style="display:flex;justify-content:space-between;gap:16px"><span style="color:#7a9bc0">Capital</span><b style="color:#e2eaf5">€${f2(trade.capitalTras)}</b></div>`+
            `<div style="display:flex;justify-content:space-between;gap:16px"><span style="color:#7a9bc0">Profit</span><b style="color:${bc}">${trade.pnlPct>=0?'+':''}${trade.pnlPct.toFixed(2)}%</b></div>`+
            `<div style="display:flex;justify-content:space-between;gap:16px"><span style="color:#7a9bc0">P&L</span><b style="color:${bc}">${trade.pnlSimple>=0?'€+':'€-'}${f2(Math.abs(trade.pnlSimple))}</b></div>`+
            `<div style="display:flex;justify-content:space-between;gap:16px"><span style="color:#7a9bc0">Días</span><span>${trade.dias}</span></div>`+
            `<div style="display:flex;justify-content:space-between;gap:16px"><span style="color:#7a9bc0">Max DD</span><span style="color:#ff4d6d">${maxDD.toFixed(2)}%</span></div>`
        }
      })

      chart.timeScale().fitContent()
      const ro=new ResizeObserver(()=>{ if(containerRef.current) chart.applyOptions({width:containerRef.current.clientWidth}) })
      ro.observe(containerRef.current)

      return () => {
        cnt.removeEventListener('mousemove',onMouseMove)
        cnt.removeEventListener('click',onClick)
        cnt.removeEventListener('dblclick',onDblClick)
        ro.disconnect()
      }
    })
    return () => { if(chartRef.current){chartRef.current.remove();chartRef.current=null} }
  }, [data, emaRPeriod, emaLPeriod, trades, maxDD, showTradeLabels])

  return (
    <div style={{position:'relative'}}>
      <div ref={legendRef} style={{
        position:'absolute',top:8,left:8,zIndex:10,
        fontFamily:MONO,fontSize:12,color:'#7a9bc0',
        background:'rgba(8,12,20,0.82)',padding:'4px 10px',borderRadius:4,
        pointerEvents:'none',whiteSpace:'nowrap',
      }}/>
      {showTradeLabels&&trades.length>0&&(
        <div style={{
          position:'absolute',top:38,left:8,right:8,zIndex:10,
          display:'flex',flexWrap:'wrap',gap:3,pointerEvents:'none',
        }}>
          {trades.map((t,i)=>(
            <span key={i} style={{
              background:t.pnlPct>=0?'rgba(0,229,160,0.12)':'rgba(255,77,109,0.12)',
              border:`1px solid ${t.pnlPct>=0?'#00e5a0':'#ff4d6d'}`,
              borderRadius:3,padding:'1px 5px',
              fontFamily:MONO,fontSize:9,
              color:t.pnlPct>=0?'#00e5a0':'#ff4d6d',
            }}>
              {fmtDate(t.entryDate)} {t.pnlPct>=0?'+':''}{t.pnlPct.toFixed(1)}% €{t.pnlSimple>=0?'+':''}{Math.round(t.pnlSimple)} {t.dias}d
            </span>
          ))}
        </div>
      )}
      <div ref={containerRef} style={{minHeight:480}}/>
      <svg ref={svgRef} style={{position:'absolute',top:0,left:0,width:'100%',height:'100%',pointerEvents:'none',zIndex:5}}/>
      <div ref={tooltipRef} style={{
        position:'absolute',display:'none',pointerEvents:'none',
        background:'rgba(8,12,20,0.96)',border:'1px solid #00e5a0',
        borderRadius:6,padding:'8px 12px',
        fontFamily:MONO,fontSize:12,color:'#e2eaf5',
        zIndex:15,minWidth:200,boxShadow:'0 4px 20px rgba(0,0,0,0.5)',
      }}/>
    </div>
  )
}

// ── EquityChart ───────────────────────────────────────────────
function EquityChart({strategyCurve,bhCurve,maxDDStrategy,maxDDBH,maxDDStrategyDate,maxDDBHDate,capitalIni}) {
  const ref=useRef(null), chartRef=useRef(null)
  useEffect(()=>{
    if(!ref.current||!strategyCurve?.length) return
    import('lightweight-charts').then(({createChart,CrosshairMode,LineStyle})=>{
      if(chartRef.current){chartRef.current.remove();chartRef.current=null}
      const chart=createChart(ref.current,{
        width:ref.current.clientWidth,height:280,
        layout:{background:{color:'#080c14'},textColor:'#7a9bc0'},
        grid:{vertLines:{color:'#0d1520'},horzLines:{color:'#0d1520'}},
        crosshair:{mode:CrosshairMode.Normal},
        rightPriceScale:{borderColor:'#1a2d45'},
        timeScale:{borderColor:'#1a2d45',timeVisible:false},
      })
      chartRef.current=chart
      chart.addLineSeries({color:'#00d4ff',lineWidth:2,title:'Estrategia'})
        .setData(strategyCurve.map(p=>({time:p.date,value:p.value})))
      chart.addLineSeries({color:'#ffd166',lineWidth:2,lineStyle:LineStyle.Dashed,title:'B&H'})
        .setData(bhCurve.map(p=>({time:p.date,value:p.value})))
      chart.addLineSeries({color:'#3d5a7a',lineWidth:1,lineStyle:LineStyle.Dotted,lastValueVisible:false,priceLineVisible:false})
        .setData([{time:strategyCurve[0].date,value:capitalIni},{time:strategyCurve[strategyCurve.length-1].date,value:capitalIni}])

      const addDD=(curve,date,dd,color,label)=>{
        if(!date||!dd) return
        let peak={date:curve[0].date,value:curve[0].value}
        for(const p of curve){if(p.date>date)break;if(p.value>peak.value)peak=p}
        const trough=curve.find(p=>p.date===date)
        if(!trough||peak.date===trough.date) return
        const s=chart.addLineSeries({color,lineWidth:2,lastValueVisible:false,priceLineVisible:false})
        s.setData([{time:peak.date,value:peak.value},{time:trough.date,value:trough.value}])
        s.setMarkers([{time:trough.date,position:'belowBar',color,shape:'circle',size:0,text:`↓${label} -${dd.toFixed(1)}%`}])
      }
      addDD(strategyCurve,maxDDStrategyDate,maxDDStrategy,'#ff4d6d','DD Est.')
      addDD(bhCurve,maxDDBHDate,maxDDBH,'#ff9a3c','DD B&H')

      chart.timeScale().fitContent()
      const ro=new ResizeObserver(()=>{if(ref.current)chart.applyOptions({width:ref.current.clientWidth})})
      ro.observe(ref.current)
      return ()=>ro.disconnect()
    })
    return ()=>{if(chartRef.current){chartRef.current.remove();chartRef.current=null}}
  },[strategyCurve,bhCurve,maxDDStrategy,maxDDBH,maxDDStrategyDate,maxDDBHDate,capitalIni])
  return <div ref={ref} style={{minHeight:280}}/>
}

// ── Main ─────────────────────────────────────────────────────
export default function Home() {
  const [simbolo,       setSimbolo]       = useState('^GSPC')
  const [emaR,          setEmaR]          = useState(10)
  const [emaL,          setEmaL]          = useState(11)
  const [years,         setYears]         = useState(5)
  const [capitalIni,    setCapitalIni]    = useState(10000)
  const [tipoStop,      setTipoStop]      = useState('tecnico')
  const [atrP,          setAtrP]          = useState(14)
  const [atrM,          setAtrM]          = useState(1.0)
  const [sinPerdidas,   setSinPerdidas]   = useState(true)
  const [reentry,       setReentry]       = useState(true)
  const [tipoFiltro,    setTipoFiltro]    = useState('none')
  const [sp500EmaR,     setSp500EmaR]     = useState(10)
  const [sp500EmaL,     setSp500EmaL]     = useState(11)
  const [result,        setResult]        = useState(null)
  const [loading,       setLoading]       = useState(false)
  const [error,         setError]         = useState(null)
  const [showLabels,    setShowLabels]    = useState(false)
  const [metricsLayout, setMetricsLayout] = useState('grid')
  const [rulerOn,       setRulerOn]       = useState(false)
  const debounceRef = useRef(null)

  const run = useCallback(async (sym,cfg) => {
    setLoading(true); setError(null)
    try {
      const res=await fetch('/api/datos',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({simbolo:sym,cfg})
      })
      const json=await res.json()
      if(!res.ok) throw new Error(json.error||'Error')
      setResult(json)
    } catch(e){setError(e.message)}
    finally{setLoading(false)}
  },[])

  // Auto-run on any parameter change (debounced 800ms)
  useEffect(()=>{
    if(debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current=setTimeout(()=>{
      run(simbolo,{
        emaR:Number(emaR), emaL:Number(emaL), years:Number(years),
        capitalIni:Number(capitalIni), tipoStop,
        atrPeriod:Number(atrP), atrMult:Number(atrM),
        sinPerdidas, reentry, tipoFiltro,
        sp500EmaR:Number(sp500EmaR), sp500EmaL:Number(sp500EmaL),
      })
    }, 800)
    return ()=>clearTimeout(debounceRef.current)
  },[simbolo,emaR,emaL,years,capitalIni,tipoStop,atrP,atrM,sinPerdidas,reentry,tipoFiltro,sp500EmaR,sp500EmaL,run])

  const metrics=result ? calcMetrics(
    result.trades,Number(capitalIni),result.capitalReinv,
    result.gananciaSimple,result.ganBH||0,
    result.startDate,result.meta?.ultimaFecha
  ) : null

  const sp5=result?.sp500Status
  let spStatus='neutral', spTxt='SIN FILTRO'
  if(sp5&&tipoFiltro!=='none'){
    const blq=tipoFiltro==='precio_ema'?sp5.precio<sp5.emaR:sp5.emaR<sp5.emaL
    spStatus=blq?'bad':'ok'; spTxt=blq?'⚠ EVITAR ENTRADAS':'✓ APTO PARA OPERAR'
  }

  const TICKERS=['^GSPC','AAPL','^IBEX','^GDAXI','MSFT','BTC-USD','GC=F']

  const metricRows = metrics ? [
    {label:'Total Operaciones',                                     val:metrics.n,                         color:'#ffd166'},
    {label:`Tiempo Invertido (${fmt(metrics.aniosInv,2)}a)`,        val:fmt(metrics.tiempoInvPct,0,'%'),   color:'#ffd166'},
    {label:'Ganadoras',                                             val:metrics.wins,                      color:'#00e5a0'},
    {label:'Perdedoras',                                            val:metrics.losses,                    color:'#ff4d6d'},
    {label:'Win Rate',                                              val:fmt(metrics.winRate,1,'%'),         color:metrics.winRate>=50?'#00e5a0':'#ff4d6d'},
    {label:'Ganancia Media (%)',                                    val:fmt(metrics.avgWin,2,'%'),          color:'#00e5a0'},
    {label:'Pérdida Media (%)',                                     val:fmt(metrics.avgLoss,2,'%'),         color:'#ff4d6d'},
    {label:'Días Promedio',                                         val:fmt(metrics.diasProm,1,' días'),    color:'#00d4ff'},
    {label:'Total Días Invertido',                                  val:metrics.totalDias,                 color:'#00d4ff'},
    {label:'Ganancia Simple (€)',                                   val:fmt(metrics.ganSimple,2,'€'),       color:metrics.ganSimple>=0?'#00e5a0':'#ff4d6d'},
    {label:'Ganancia Compuesta (€)',                                val:fmt(metrics.ganComp,2,'€'),         color:metrics.ganComp>=0?'#00e5a0':'#ff4d6d'},
    {label:'Ganancia Buy&Hold (€)',                                 val:fmt(metrics.ganBH,2,'€'),           color:metrics.ganBH>=0?'#00e5a0':'#ff4d6d'},
    {label:'Ganancia Total (%)',                                    val:fmt(metrics.ganTotalPct,2,'%'),     color:metrics.ganTotalPct>=0?'#00e5a0':'#ff4d6d'},
    {label:'Factor de Beneficio',                                   val:fmt(metrics.factorBen,2),           color:metrics.factorBen>=1?'#00e5a0':'#ff4d6d'},
    {label:`CAGR Estrategia (${fmt(metrics.anios,2)}a)`,            val:fmt(metrics.cagrS,2,'%'),           color:metrics.cagrS>=0?'#00e5a0':'#ff4d6d'},
    {label:'Max Drawdown (%)',                                      val:fmt(metrics.ddSimple,2,'%'),        color:'#ff4d6d'},
    {label:`CAGR Buy&Hold (${fmt(metrics.anios,2)}a)`,              val:fmt(metrics.cagrBH,2,'%'),          color:metrics.cagrBH>=0?'#00e5a0':'#ff4d6d'},
    {label:'Max Drawdown Buy&Hold (%)',                             val:fmt(result?.maxDDBH,2,'%'),         color:'#ff4d6d'},
    {label:`CAGR Compuesto (${fmt(metrics.anios,2)}a)`,             val:fmt(metrics.cagrC,2,'%'),           color:metrics.cagrC>=0?'#00e5a0':'#ff4d6d'},
    {label:'Max DD Compuesto (%)',                                  val:fmt(metrics.ddComp,2,'%'),          color:'#ff4d6d'},
  ] : []

  const MetricsTable = () => (
    <table style={{width:'100%',borderCollapse:'collapse',fontFamily:MONO,fontSize:12}}>
      <tbody>
        {metricRows.map(m=>(
          <tr key={m.label} style={{borderBottom:'1px solid var(--border)'}}>
            <td style={{padding:'7px 12px',color:'var(--text2)'}}>{m.label}</td>
            <td style={{padding:'7px 12px',textAlign:'right',color:m.color,fontWeight:600}}>{m.val}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )

  return (
    <>
      <Head>
        <title>V50 — EMA Strategy</title>
        <meta name="viewport" content="width=device-width, initial-scale=1"/>
        <link rel="preconnect" href="https://fonts.googleapis.com"/>
        <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@300;400;500;600&display=swap" rel="stylesheet"/>
      </Head>
      <div className="app">
        <header className="header">
          <div className="header-logo"><span className="dot"/>V50 · CRUCE EMAs</div>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            {/* Ruler toggle in header */}
            <button onClick={()=>setRulerOn(r=>!r)} title="Regla: clic inicio · mover · clic fin · Ctrl=imán · doble-clic=borrar" style={{
              background:rulerOn?'rgba(255,209,102,0.15)':'rgba(13,21,32,0.9)',
              border:`1px solid ${rulerOn?'#ffd166':'#2d3748'}`,
              color:rulerOn?'#ffd166':'#7a9bc0',
              fontFamily:MONO,fontSize:11,padding:'5px 10px',
              borderRadius:4,cursor:'pointer',display:'flex',alignItems:'center',gap:5,
            }}>
              📏 Regla {rulerOn?'(ON)':''}
            </button>
            {result&&(
              <button onClick={()=>window.open(`https://www.tradingview.com/chart/?symbol=${tvSym(simbolo)}`,'_blank')} style={{
                background:'#131722',border:'1px solid #2d3748',color:'#00d4ff',
                fontFamily:MONO,fontSize:11,padding:'5px 10px',borderRadius:4,
                cursor:'pointer',display:'flex',alignItems:'center',gap:5,
              }}
              onMouseOver={e=>e.currentTarget.style.borderColor='#00d4ff'}
              onMouseOut={e=>e.currentTarget.style.borderColor='#2d3748'}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="#00d4ff"><path d="M3 3h7v2H5v14h14v-5h2v7H3V3zm11 0h7v7h-2V6.41l-9.29 9.3-1.42-1.42L17.59 5H14V3z"/></svg>
                TradingView · {simbolo}
              </button>
            )}
            {result&&metrics&&(
              <button onClick={()=>setMetricsLayout(l=>l==='grid'?'panel':'grid')} style={{
                background:'rgba(13,21,32,0.9)',border:'1px solid #1a2d45',color:'#7a9bc0',
                fontFamily:MONO,fontSize:11,padding:'5px 10px',borderRadius:4,cursor:'pointer',
              }}>
                {metricsLayout==='grid'?'⊞ Panel lateral':'⊟ Cuadrícula'}
              </button>
            )}
            <div style={{fontFamily:MONO,fontSize:11,color:'var(--text3)'}}>Stooq · diario</div>
          </div>
        </header>

        <div className="main">
          <aside className="sidebar">
            <div className="sidebar-section">
              <div className="sidebar-title">Activo</div>
              <label>Símbolo<input type="text" value={simbolo} onChange={e=>setSimbolo(e.target.value.toUpperCase())} placeholder="^GSPC"/></label>
              <div style={{display:'flex',flexWrap:'wrap',gap:4,marginTop:2}}>
                {TICKERS.map(t=><div key={t} className="ticker-pill" onClick={()=>setSimbolo(t)}>{t}</div>)}
              </div>
            </div>
            <div className="sidebar-section">
              <div className="sidebar-title">Estrategia</div>
              <div className="row2">
                <label>EMA Rápida<input type="number" value={emaR} min={1} max={500} onChange={e=>setEmaR(e.target.value)}/></label>
                <label>EMA Lenta<input  type="number" value={emaL} min={1} max={500} onChange={e=>setEmaL(e.target.value)}/></label>
              </div>
              <div className="row2">
                <label>Capital (€)<input type="number" value={capitalIni} min={100} onChange={e=>setCapitalIni(e.target.value)}/></label>
                <label>Años BT<input    type="number" value={years} min={1} max={20} onChange={e=>setYears(e.target.value)}/></label>
              </div>
            </div>
            <div className="sidebar-section">
              <div className="sidebar-title">Stop Loss</div>
              <label>Tipo
                <select value={tipoStop} onChange={e=>setTipoStop(e.target.value)}>
                  <option value="tecnico">Stop Técnico (EMA)</option>
                  <option value="atr">Stop ATR</option>
                  <option value="none">Ninguno</option>
                </select>
              </label>
              {tipoStop==='atr'&&(
                <div className="row2">
                  <label>Periodo ATR<input type="number" value={atrP} min={1} onChange={e=>setAtrP(e.target.value)}/></label>
                  <label>Mult.<input type="number" value={atrM} min={0.1} step={0.1} onChange={e=>setAtrM(e.target.value)}/></label>
                </div>
              )}
              <label className="checkbox-row"><input type="checkbox" checked={sinPerdidas} onChange={e=>setSinPerdidas(e.target.checked)}/>Sin Pérdidas</label>
              <label className="checkbox-row"><input type="checkbox" checked={reentry} onChange={e=>setReentry(e.target.checked)}/>Re-Entry</label>
            </div>
            <div className="sidebar-section">
              <div className="sidebar-title">Filtro SP500</div>
              <label>Filtro
                <select value={tipoFiltro} onChange={e=>setTipoFiltro(e.target.value)}>
                  <option value="none">Sin filtro</option>
                  <option value="precio_ema">Precio sobre EMA rápida</option>
                  <option value="ema_ema">EMA rápida sobre EMA lenta</option>
                </select>
              </label>
              {tipoFiltro!=='none'&&(
                <div className="row2">
                  <label>EMA R<input type="number" value={sp500EmaR} min={1} onChange={e=>setSp500EmaR(e.target.value)}/></label>
                  <label>EMA L<input type="number" value={sp500EmaL} min={1} onChange={e=>setSp500EmaL(e.target.value)}/></label>
                </div>
              )}
            </div>
            <div className="sidebar-section">
              <div className="sidebar-title">Visualización</div>
              <label className="checkbox-row"><input type="checkbox" checked={showLabels} onChange={e=>setShowLabels(e.target.checked)}/>Etiquetas trades visibles</label>
            </div>
            {loading&&<div style={{fontFamily:MONO,fontSize:11,color:'var(--accent)',textAlign:'center',padding:'8px 0'}}>⟳ Actualizando...</div>}
          </aside>

          <div className="content">
            {sp5&&(
              <div className="sp500-bar">
                <span className="label">SP500</span>
                <span className={`val ${sp5.changePct>=0?'green':'red'}`}>{fmt(sp5.precio,2)}</span>
                <span className="label">EMA {sp500EmaR}</span><span className="val yellow">{fmt(sp5.emaR,2)}</span>
                <span className="label">EMA {sp500EmaL}</span><span className="val yellow">{fmt(sp5.emaL,2)}</span>
                <span className="label" style={{marginLeft:'auto',marginRight:8,fontSize:10}}>{fmtDate(sp5.date)}</span>
                <span className={`status-badge ${spStatus}`}>{spTxt}</span>
              </div>
            )}
            {error&&<div className="error-msg">⚠ {error}</div>}
            {!result&&!error&&!loading&&(
              <div className="loading"><div className="spinner"/><div className="loading-text">CARGANDO DATOS...</div></div>
            )}

            {result&&(
              <div style={{display:'flex',flex:1,minHeight:0,overflow:'hidden',height:'100%'}}>
                <div style={{flex:1,overflowY:'auto'}}>
                  <div className="chart-wrap">
                    <div className="chart-header">
                      <div className="chart-title">{simbolo}</div>
                      <div className="chart-price">{fmt(result.meta?.ultimoPrecio,2)}</div>
                      <div className="chart-date">{fmtDate(result.meta?.ultimaFecha)}</div>
                    </div>
                    <CandleChart
                      data={result.chartData} emaRPeriod={emaR} emaLPeriod={emaL}
                      trades={result.trades||[]} maxDD={metrics?.ddSimple||0}
                      showTradeLabels={showLabels} rulerActive={rulerOn}
                    />
                    <div style={{display:'flex',gap:14,marginTop:8,fontFamily:MONO,fontSize:11,color:'var(--text3)',flexWrap:'wrap'}}>
                      <span><span style={{color:'#ffd166'}}>─</span> EMA {emaR}</span>
                      <span><span style={{color:'#ff4d6d'}}>─</span> EMA {emaL}</span>
                      <span><span style={{color:'#00e5a0'}}>─</span> Trade +</span>
                      <span><span style={{color:'#ff4d6d'}}>─</span> Trade −</span>
                      <span style={{color:'#00e5a0'}}>↗ Cruce alcista</span>
                      <span style={{color:'#ff4d6d'}}>↘ Cruce bajista</span>
                      {rulerOn&&<span style={{color:'#ffd166'}}>📏 Regla activa · Ctrl=imán · doble-clic=borrar</span>}
                    </div>
                  </div>

                  {metricsLayout==='grid'&&metrics&&(
                    <div className="metrics-section">
                      {metricRows.map(m=>(
                        <div key={m.label} className="metric-card">
                          <span className="metric-label">{m.label}</span>
                          <span className="metric-val" style={{color:m.color}}>{m.val}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {result.strategyCurve?.length>0&&(
                    <div className="equity-section">
                      <div className="section-title">
                        Equity — Estrategia vs B&H
                        <span style={{marginLeft:12,fontWeight:400,fontSize:10}}>
                          <span style={{color:'#00d4ff'}}>─ Estrategia</span>
                          <span style={{marginLeft:8,color:'#ffd166'}}>- - B&H</span>
                          <span style={{marginLeft:8,color:'#ff4d6d'}}>─ Max DD Est.</span>
                          <span style={{marginLeft:8,color:'#ff9a3c'}}>─ Max DD B&H</span>
                        </span>
                      </div>
                      <EquityChart
                        strategyCurve={result.strategyCurve} bhCurve={result.bhCurve}
                        maxDDStrategy={result.maxDDStrategy} maxDDBH={result.maxDDBH}
                        maxDDStrategyDate={result.maxDDStrategyDate} maxDDBHDate={result.maxDDBHDate}
                        capitalIni={Number(capitalIni)}
                      />
                    </div>
                  )}

                  {result.trades?.length>0&&(
                    <div className="equity-section">
                      <div className="section-title">Resultados por Operación</div>
                      <div className="equity-bars">
                        {result.trades.map((t,i)=>{
                          const mx=Math.max(...result.trades.map(x=>Math.abs(x.pnlPct)))
                          return <div key={i} className="equity-bar"
                            style={{height:Math.max(4,Math.abs(t.pnlPct)/mx*56),background:t.pnlPct>=0?'var(--green)':'var(--red)'}}
                            title={`${fmtDate(t.exitDate)}: ${fmt(t.pnlPct,2)}%`}/>
                        })}
                      </div>
                    </div>
                  )}

                  {result.trades?.length>0&&(
                    <div className="trades-section">
                      <div className="section-title">Historial — {result.trades.length} operaciones</div>
                      <div style={{overflowX:'auto'}}>
                        <table className="trades-table" style={{fontFamily:MONO}}>
                          <thead><tr>
                            <th>#</th><th>Entrada</th><th>Salida</th>
                            <th>Px Entrada</th><th>Px Salida</th>
                            <th>P&L %</th><th>P&L €</th><th>Días</th><th>Tipo</th>
                          </tr></thead>
                          <tbody>
                            {[...result.trades].reverse().map((t,i)=>(
                              <tr key={i}>
                                <td style={{color:'var(--text3)'}}>{result.trades.length-i}</td>
                                <td>{fmtDate(t.entryDate)}</td><td>{fmtDate(t.exitDate)}</td>
                                <td>{fmt(t.entryPx,2)}</td><td>{fmt(t.exitPx,2)}</td>
                                <td style={{color:t.pnlPct>=0?'var(--green)':'var(--red)',fontWeight:600}}>
                                  {t.pnlPct>=0?'+':''}{fmt(t.pnlPct,2)}%
                                </td>
                                <td style={{color:t.pnlSimple>=0?'var(--green)':'var(--red)'}}>
                                  {t.pnlSimple>=0?'+':''}{fmt(t.pnlSimple,2)}€
                                </td>
                                <td>{t.dias}</td>
                                <td><span className={`tag ${t.pnlPct>=0?'win':'loss'}`}>{t.tipo}</span></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>

                {metricsLayout==='panel'&&metrics&&(
                  <div style={{
                    width:290,flexShrink:0,borderLeft:'1px solid var(--border)',
                    background:'var(--bg2)',overflowY:'auto',
                  }}>
                    <div style={{padding:'10px 12px',borderBottom:'1px solid var(--border)',fontFamily:MONO,fontSize:10,color:'var(--text3)',letterSpacing:'0.1em'}}>
                      RESUMEN ESTRATEGIA
                    </div>
                    <MetricsTable/>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
