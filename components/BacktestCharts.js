import { useRef, useEffect } from 'react'

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
        chart.addLineSeries({color:c.color,lineWidth:2,lastValueVisible:true,priceLineVisible:false})
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
