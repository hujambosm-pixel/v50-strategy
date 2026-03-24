import { useRef, useEffect, useState } from 'react'

export function MultiCartChart({simpleCurve,compoundCurve,bhCurve,sp500BHCurve,capitalIni,
  maxDDSimple,maxDDSimpleDate,maxDDCompound,maxDDCompoundDate,maxDDBH,maxDDBHDate,
  maxDDSP500,maxDDSP500Date,
  showSimple,showCompound,showBH,showSP500,onReady,syncRef,chartHeight=300}) {
  const ref=useRef(null),chartRef=useRef(null)

  useEffect(()=>{
    if(!ref.current) return
    import('lightweight-charts').then(({createChart,CrosshairMode,LineStyle})=>{
      if(chartRef.current){chartRef.current.remove();chartRef.current=null}
      const chart=createChart(ref.current,{
        width:ref.current.clientWidth,height:chartHeight,
        layout:{background:{color:'#080c14'},textColor:'#7a9bc0'},
        grid:{vertLines:{color:'#0d1520'},horzLines:{color:'#0d1520'}},
        crosshair:{mode:CrosshairMode.Normal},
        rightPriceScale:{borderColor:'#1a2d45'},
        timeScale:{borderColor:'#1a2d45',timeVisible:false},
      })
      chartRef.current=chart
      const base=simpleCurve||compoundCurve||bhCurve||sp500BHCurve
      if(base?.length) chart.addLineSeries({color:'#2a3f55',lineWidth:1,lineStyle:LineStyle.Dotted,lastValueVisible:false,priceLineVisible:false})
        .setData([{time:base[0].date,value:capitalIni},{time:base[base.length-1].date,value:capitalIni}])
      if(showSimple&&simpleCurve?.length) chart.addLineSeries({color:'#00d4ff',lineWidth:2,lastValueVisible:true,priceLineVisible:false}).setData(simpleCurve.map(p=>({time:p.date,value:p.value})))
      if(showCompound&&compoundCurve?.length) chart.addLineSeries({color:'#00e5a0',lineWidth:2,lastValueVisible:true,priceLineVisible:false}).setData(compoundCurve.map(p=>({time:p.date,value:p.value})))
      if(showBH&&bhCurve?.length) chart.addLineSeries({color:'#ffd166',lineWidth:2,lineStyle:LineStyle.Dashed,lastValueVisible:true,priceLineVisible:false}).setData(bhCurve.map(p=>({time:p.date,value:p.value})))
      if(showSP500&&sp500BHCurve?.length) chart.addLineSeries({color:'#9b72ff',lineWidth:2,lineStyle:LineStyle.Dotted,lastValueVisible:true,priceLineVisible:false}).setData(sp500BHCurve.map(p=>({time:p.date,value:p.value})))
      const addDD=(curve,date,dd,color)=>{
        if(!date||!dd||!curve?.length) return
        let peak={date:curve[0].date,value:curve[0].value}
        for(const p of curve){if(p.date>date)break;if(p.value>peak.value)peak=p}
        const trough=curve.find(p=>p.date===date)
        if(!trough||peak.date===trough.date) return
        const s=chart.addLineSeries({color,lineWidth:1,lineStyle:LineStyle.Dashed,lastValueVisible:false,priceLineVisible:false})
        s.setData([{time:peak.date,value:peak.value},{time:trough.date,value:trough.value}])
        s.setMarkers([{time:trough.date,position:'belowBar',color,shape:'circle',size:0,text:`↓ -${dd.toFixed(1)}%`}])
      }
      if(showSimple) addDD(simpleCurve,maxDDSimpleDate,maxDDSimple,'#ff4d6d')
      if(showCompound) addDD(compoundCurve,maxDDCompoundDate,maxDDCompound,'#00a870')
      if(showBH) addDD(bhCurve,maxDDBHDate,maxDDBH,'#ff9a3c')
      if(showSP500) addDD(sp500BHCurve,maxDDSP500Date,maxDDSP500,'#7b5fe0')
      // Cross-chart sync
      if(syncRef?.current){
        const syncId=Symbol()
        const unsub=chart.timeScale().subscribeVisibleTimeRangeChange(range=>{
          if(!range||syncRef.current.syncing) return
          syncRef.current.syncing=true
          syncRef.current.listeners.forEach(fn=>{if(fn.id!==syncId)try{fn.handler(range)}catch(_){}})
          syncRef.current.syncing=false
        })
        const handler=(range)=>{try{chart.timeScale().setVisibleRange(range)}catch(_){}}
        syncRef.current.listeners.push({id:syncId,handler})
        chart.__syncCleanup=()=>{try{unsub()}catch(_){};if(syncRef.current)syncRef.current.listeners=syncRef.current.listeners.filter(e=>e.id!==syncId)}
      }
      chart.timeScale().fitContent()
      if(onReady) onReady({fitAll:()=>{try{chart.timeScale().fitContent()}catch(_){}}})
      const ro=new ResizeObserver(()=>{if(ref.current&&chartRef.current){try{chart.applyOptions({width:ref.current.clientWidth})}catch(_){}}})
      ro.observe(ref.current)
      return()=>ro.disconnect()
    })
    return()=>{if(chartRef.current){chartRef.current.remove();chartRef.current=null}}
  },[simpleCurve,compoundCurve,bhCurve,sp500BHCurve,capitalIni,maxDDSimple,maxDDSimpleDate,maxDDCompound,maxDDCompoundDate,maxDDBH,maxDDBHDate,maxDDSP500,maxDDSP500Date,showSimple,showCompound,showBH,showSP500])

  useEffect(()=>{
    if(chartRef.current) try{chartRef.current.applyOptions({height:chartHeight})}catch(_){}
  },[chartHeight])



  return <div ref={ref} style={{minHeight:chartHeight}}/>
}

// ── OccupancyBarChart — individual asset capital invested chart ────
// showMode: 'compound'|'simple' — independent filter, own toggle
export function OccupancyBarChart({trades, chartData, capitalIni, syncRef, showMode='compound'}) {
  const ref=useRef(null), chartRef=useRef(null)
  useEffect(()=>{
    if(!ref.current||!trades?.length||!chartData?.length) return
    import('lightweight-charts').then(({createChart,CrosshairMode})=>{
      if(chartRef.current){chartRef.current.__syncCleanup?.();chartRef.current.remove();chartRef.current=null}
      const chart=createChart(ref.current,{
        width:ref.current.clientWidth,height:100,
        layout:{background:{color:'#080c14'},textColor:'#7a9bc0'},
        grid:{vertLines:{color:'transparent'},horzLines:{color:'rgba(26,45,69,0.4)'}},
        crosshair:{mode:CrosshairMode.Normal},
        rightPriceScale:{borderColor:'#1a2d45',scaleMargins:{top:0.08,bottom:0.0}},
        timeScale:{borderColor:'#1a2d45',timeVisible:false},
        leftPriceScale:{visible:false},
      })
      chartRef.current=chart
      // Accumulate capital at each bar
      const color=showMode==='compound'?'rgba(0,229,160,':'rgba(0,212,255,'
      let lastCap=capitalIni
      const barData=chartData.map(d=>{
        const inPos=trades.some(t=>d.date>=t.entryDate&&d.date<=t.exitDate)
        if(showMode==='compound'){
          const t=trades.filter(x=>x.exitDate<=d.date)
          if(t.length) lastCap=t[t.length-1].capitalTras
          else lastCap=capitalIni
        } else { lastCap=capitalIni }
        return{time:d.date,value:inPos?lastCap:0}
      })
      // Area series for smooth filled look
      const area=chart.addAreaSeries({
        topColor:`${color}0.5)`,
        bottomColor:`${color}0.03)`,
        lineColor:`${color}0.9)`,
        lineWidth:1,
        crosshairMarkerVisible:false,
        lastValueVisible:false,priceLineVisible:false,
      })
      area.setData(barData)
      if(syncRef?.current){
        const syncId=Symbol()
        const unsub=chart.timeScale().subscribeVisibleTimeRangeChange(range=>{
          if(!range||syncRef.current.syncing) return
          syncRef.current.syncing=true
          syncRef.current.listeners.forEach(fn=>{if(fn.id!==syncId)try{fn.handler(range)}catch(_){}})
          syncRef.current.syncing=false
        })
        const handler=(range)=>{try{chart.timeScale().setVisibleRange(range)}catch(_){}}
        syncRef.current.listeners.push({id:syncId,handler})
        chart.__syncCleanup=()=>{try{unsub()}catch(_){};if(syncRef.current)syncRef.current.listeners=syncRef.current.listeners.filter(e=>e.id!==syncId)}
      }
      chart.timeScale().fitContent()
      const ro=new ResizeObserver(()=>{if(ref.current)chart.applyOptions({width:ref.current.clientWidth})})
      ro.observe(ref.current)
      return()=>ro.disconnect()
    })
    return()=>{if(chartRef.current){chartRef.current.__syncCleanup?.();chartRef.current.remove();chartRef.current=null}}
  },[trades,chartData,showMode,capitalIni])
  return <div ref={ref} style={{minHeight:100}}/>
}

// ── McOccupancyChart — MC capital invertido chart (same style as OccupancyBarChart) ──
export function McOccupancyChart({occupancyCurve, compoundCurve, capitalIni, occMode='compound', syncRef}) {
  const ref=useRef(null), chartRef=useRef(null)
  useEffect(()=>{
    if(!ref.current||!occupancyCurve?.length) return
    import('lightweight-charts').then(({createChart,CrosshairMode})=>{
      if(chartRef.current){chartRef.current.__syncCleanup?.();chartRef.current.remove();chartRef.current=null}
      const chart=createChart(ref.current,{
        width:ref.current.clientWidth,height:100,
        layout:{background:{color:'#080c14'},textColor:'#7a9bc0'},
        grid:{vertLines:{color:'transparent'},horzLines:{color:'rgba(26,45,69,0.4)'}},
        crosshair:{mode:CrosshairMode.Normal},
        rightPriceScale:{borderColor:'#1a2d45',scaleMargins:{top:0.08,bottom:0.0}},
        timeScale:{borderColor:'#1a2d45',timeVisible:false},
      })
      chartRef.current=chart
      const isComp=occMode==='compound'
      const color=isComp?'#00e5a0':'#00d4ff'
      const area=chart.addAreaSeries({
        lineColor:color,topColor:`${color}55`,bottomColor:`${color}08`,
        lineWidth:2,lastValueVisible:true,priceLineVisible:false,
        priceFormat:{type:'price',precision:0,minMove:1},
      })
      // Convert % occupancy → € amount invested
      const lastCompound=compoundCurve?.slice(-1)[0]?.value||capitalIni
      area.setData(occupancyCurve.map(p=>{
        const pct=p.value/100
        const total=isComp?lastCompound:capitalIni
        return{time:p.date,value:pct*total}
      }))
      // Sync
      if(syncRef?.current){
        const syncId=Symbol()
        const unsub=chart.timeScale().subscribeVisibleTimeRangeChange(range=>{
          if(!range||syncRef.current.syncing) return
          syncRef.current.syncing=true
          syncRef.current.listeners.forEach(fn=>{if(fn.id!==syncId)try{fn.handler(range)}catch(_){}})
          syncRef.current.syncing=false
        })
        const handler=(range)=>{try{chart.timeScale().setVisibleRange(range)}catch(_){}}
        syncRef.current.listeners.push({id:syncId,handler})
        chart.__syncCleanup=()=>{try{unsub()}catch(_){};if(syncRef.current)syncRef.current.listeners=syncRef.current.listeners.filter(e=>e.id!==syncId)}
      }
      chart.timeScale().fitContent()
      const ro=new ResizeObserver(()=>{if(ref.current)chart.applyOptions({width:ref.current.clientWidth})})
      ro.observe(ref.current)
      return()=>ro.disconnect()
    })
    return()=>{if(chartRef.current){chartRef.current.__syncCleanup?.();chartRef.current.remove();chartRef.current=null}}
  },[occupancyCurve,compoundCurve,capitalIni,occMode,syncRef])
  return <div ref={ref} style={{minHeight:100}}/>
}

// ── StratCompareChart — multiple strategy equity curves ──────────────────────
export function StratCompareChart({curves,capitalIni,chartHeight=300,syncRef,onReady}) {
  const ref=useRef(null),chartRef=useRef(null)
  useEffect(()=>{
    if(!ref.current||!curves?.length) return
    import('lightweight-charts').then(({createChart,CrosshairMode,LineStyle})=>{
      if(chartRef.current){chartRef.current.__syncCleanup?.();chartRef.current.remove();chartRef.current=null}
      const chart=createChart(ref.current,{
        width:ref.current.clientWidth,height:chartHeight,
        layout:{background:{color:'#080c14'},textColor:'#7a9bc0'},
        grid:{vertLines:{color:'#0d1520'},horzLines:{color:'#0d1520'}},
        crosshair:{mode:CrosshairMode.Normal},
        rightPriceScale:{borderColor:'#1a2d45'},
        timeScale:{borderColor:'#1a2d45',timeVisible:false},
      })
      chartRef.current=chart
      const base=curves.find(c=>c.data?.length)?.data
      if(base?.length) chart.addLineSeries({color:'#2a3f55',lineWidth:1,lineStyle:LineStyle.Dotted,lastValueVisible:false,priceLineVisible:false})
        .setData([{time:base[0].date,value:capitalIni},{time:base[base.length-1].date,value:capitalIni}])
      curves.forEach(c=>{
        if(!c.show||!c.data?.length) return
        chart.addLineSeries({color:c.color,lineWidth:2,lastValueVisible:true,priceLineVisible:false,
          lineStyle:c.dashed?LineStyle.Dashed:LineStyle.Solid})
          .setData(c.data.map(p=>({time:p.date,value:p.value})))
      })
      if(syncRef?.current){
        const syncId=Symbol()
        const unsub=chart.timeScale().subscribeVisibleTimeRangeChange(range=>{
          if(!range||syncRef.current.syncing) return
          syncRef.current.syncing=true
          syncRef.current.listeners.forEach(fn=>{if(fn.id!==syncId)try{fn.handler(range)}catch(_){}})
          syncRef.current.syncing=false
        })
        const handler=(range)=>{try{chart.timeScale().setVisibleRange(range)}catch(_){}}
        syncRef.current.listeners.push({id:syncId,handler})
        chart.__syncCleanup=()=>{try{unsub()}catch(_){};if(syncRef.current)syncRef.current.listeners=syncRef.current.listeners.filter(e=>e.id!==syncId)}
      }
      chart.timeScale().fitContent()
      if(onReady) onReady({fitAll:()=>{try{chart.timeScale().fitContent()}catch(_){}}})
      const ro=new ResizeObserver(()=>{if(ref.current&&chartRef.current){try{chart.applyOptions({width:ref.current.clientWidth})}catch(_){}}})
      ro.observe(ref.current)
      return()=>ro.disconnect()
    })
    return()=>{if(chartRef.current){chartRef.current.__syncCleanup?.();chartRef.current.remove();chartRef.current=null}}
  },[curves,capitalIni])
  useEffect(()=>{
    if(chartRef.current) try{chartRef.current.applyOptions({height:chartHeight})}catch(_){}
  },[chartHeight])
  return <div ref={ref} style={{minHeight:chartHeight}}/>
}

// ── AssetSignalChart — candles + strategy entry/exit markers, lazy-loaded ──
// stratSignals: [{id, name, color, entries:[{date,price}], exits:[{date,price}]}]
// syncRef: {isSyncing:bool, charts:[], lastRange} — shared across all instances for logical-range sync
const _MONO='"Roboto Mono",monospace'
export function AssetSignalChart({symbol,stratSignals,years=5,height=400,syncRef}) {
  const containerRef=useRef(null)
  const chartDivRef=useRef(null)
  const chartRef=useRef(null)
  const [inView,setInView]=useState(false)
  const [ohlcv,setOhlcv]=useState(null)
  const [loading,setLoading]=useState(false)
  const [err,setErr]=useState(null)

  // Lazy: IntersectionObserver — trigger when container scrolls near viewport
  useEffect(()=>{
    if(!containerRef.current) return
    const obs=new IntersectionObserver(([e])=>{
      if(e.isIntersecting){setInView(true);obs.disconnect()}
    },{rootMargin:'200px'})
    obs.observe(containerRef.current)
    return()=>obs.disconnect()
  },[])

  // Fetch OHLCV once visible
  useEffect(()=>{
    if(!inView||ohlcv!==null||loading) return
    setLoading(true)
    fetch(`/api/chartdata?symbol=${encodeURIComponent(symbol)}&years=${years}`)
      .then(r=>r.json())
      .then(d=>{
        if(d.error) throw new Error(d.error)
        setOhlcv(Array.isArray(d)?d:[])
        setLoading(false)
      })
      .catch(e=>{setErr(e.message);setLoading(false)})
  },[inView,symbol,years])

  // Build/rebuild chart when data or signals change
  useEffect(()=>{
    if(!ohlcv?.length||!chartDivRef.current) return
    import('lightweight-charts').then(({createChart,CrosshairMode})=>{
      // Cleanup previous instance and remove from sync group
      if(chartRef.current){chartRef.current.__syncCleanup?.();chartRef.current.remove();chartRef.current=null}
      const chart=createChart(chartDivRef.current,{
        width:chartDivRef.current.clientWidth,height,
        layout:{background:{color:'#080c14'},textColor:'#7a9bc0'},
        grid:{vertLines:{color:'#0d1520'},horzLines:{color:'#0d1520'}},
        crosshair:{mode:CrosshairMode.Normal},
        rightPriceScale:{borderColor:'#1a2d45',scaleMargins:{top:0.15,bottom:0.05}},
        timeScale:{borderColor:'#1a2d45',timeVisible:false},
        handleScroll:{mouseWheel:true,pressedMouseMove:true},
        handleScale:{mouseWheel:true,pinch:true},
      })
      chartRef.current=chart
      const candles=chart.addCandlestickSeries({
        upColor:'#00e5a0',downColor:'#ff4d6d',
        borderUpColor:'#00e5a0',borderDownColor:'#ff4d6d',
        wickUpColor:'#3a7a6a',wickDownColor:'#7a3a4a',
      })
      // ── Load data ──
      candles.setData(ohlcv.map(d=>({time:d.date,open:d.open,high:d.high,low:d.low,close:d.close})))
      // Build sorted markers — use explicit entryColor/exitColor when provided
      const markers=[]
      stratSignals.forEach(s=>{
        const ec=s.entryColor||s.color, xc=s.exitColor||s.color
        ;(s.entries||[]).forEach(e=>{
          markers.push({time:e.date,position:'belowBar',color:ec,shape:'arrowUp',text:'',size:1})
        })
        ;(s.exits||[]).forEach(e=>{
          markers.push({time:e.date,position:'aboveBar',color:xc,shape:'arrowDown',text:'',size:1})
        })
      })
      markers.sort((a,b)=>a.time.localeCompare(b.time))
      if(markers.length) candles.setMarkers(markers)
      // ── fitContent first, then apply sync range ──
      chart.timeScale().fitContent()
      // ── Logical-range sync — set up AFTER data is loaded ──
      // Uses direct chart instance array + isSyncing flag to avoid callback-chain loops
      if(syncRef?.current){
        // Register this chart in the shared pool
        syncRef.current.charts.push(chart)
        // Subscribe to range changes — propagate to all peer charts directly
        const unsub=chart.timeScale().subscribeVisibleLogicalRangeChange(range=>{
          if(!range||syncRef.current.isSyncing) return
          syncRef.current.isSyncing=true
          syncRef.current.lastRange=range
          syncRef.current.charts.forEach(c=>{
            if(c!==chart) try{c.timeScale().setVisibleLogicalRange(range)}catch(_){}
          })
          syncRef.current.isSyncing=false
        })
        // Late-join: snap immediately to the group's current zoom level
        if(syncRef.current.lastRange){
          try{chart.timeScale().setVisibleLogicalRange(syncRef.current.lastRange)}catch(_){}
        }
        // Cleanup: deregister from pool and unsubscribe
        chart.__syncCleanup=()=>{
          try{unsub()}catch(_){}
          if(syncRef.current) syncRef.current.charts=syncRef.current.charts.filter(c=>c!==chart)
        }
      }
      const ro=new ResizeObserver(()=>{
        if(chartDivRef.current&&chartRef.current){
          try{chart.applyOptions({width:chartDivRef.current.clientWidth})}catch(_){}
        }
      })
      ro.observe(chartDivRef.current)
      return()=>ro.disconnect()
    })
    return()=>{if(chartRef.current){chartRef.current.__syncCleanup?.();chartRef.current.remove();chartRef.current=null}}
  },[ohlcv,stratSignals,height])

  return(
    <div ref={containerRef} style={{borderBottom:'1px solid var(--border)'}}>
      {/* Header: symbol + strategy signals */}
      <div style={{padding:'5px 12px',display:'flex',alignItems:'flex-start',gap:10,background:'#050c18',
        borderBottom:'1px solid var(--border)',flexWrap:'wrap'}}>
        <span style={{fontFamily:_MONO,fontSize:12,color:'#a8d8f0',fontWeight:700,flexShrink:0}}>{symbol}</span>
        <div style={{display:'flex',flexWrap:'wrap',gap:8,flex:1}}>
          {stratSignals.map(s=>(
            <span key={s.id} style={{fontFamily:_MONO,fontSize:10,color:s.color,display:'flex',alignItems:'center',gap:4,flexShrink:0}}>
              <span style={{fontWeight:600}}>{s.name}</span>
              <span style={{opacity:0.5}}>·</span>
              <span>▲{s.entries?.length||0}</span>
              <span style={{opacity:0.4}}>·</span>
              <span>▼{s.exits?.length||0}</span>
            </span>
          ))}
        </div>
      </div>
      {/* Chart area */}
      {!inView?(
        <div style={{height,display:'flex',alignItems:'center',justifyContent:'center',color:'#1a2d45',fontFamily:_MONO,fontSize:10}}>···</div>
      ):loading?(
        <div style={{height,display:'flex',alignItems:'center',justifyContent:'center',color:'#4a6a88',fontFamily:_MONO,fontSize:10}}>Cargando {symbol}...</div>
      ):err?(
        <div style={{height,display:'flex',alignItems:'center',justifyContent:'center',color:'#ff4d6d',fontFamily:_MONO,fontSize:10}}>⚠ {err}</div>
      ):(
        <div ref={chartDivRef} style={{height}}/>
      )}
    </div>
  )
}
