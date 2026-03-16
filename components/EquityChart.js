import { useRef, useEffect } from 'react'

// ── EquityChart — con curva compuesta ────────────────────────
export default function EquityChart({
  strategyCurve,bhCurve,sp500BHCurve,compoundCurve,
  maxDDStrategy,maxDDBH,maxDDSP500,maxDDCompound,
  maxDDStrategyDate,maxDDBHDate,maxDDSP500Date,maxDDCompoundDate,
  capitalIni,showStrategy,showBH,showSP500,showCompound,syncRef,chartHeight=260
}) {
  const ref=useRef(null),chartRef=useRef(null),equityTooltipRef=useRef(null)
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
      // Track series data by date for crosshair tooltip
      const equityDataByDate={}
      const trackSeries=(curve,key)=>{ curve?.forEach(p=>{ if(!equityDataByDate[p.date]) equityDataByDate[p.date]={}; equityDataByDate[p.date][key]=p.value }) }

      if(showStrategy&&strategyCurve?.length){
        chart.addLineSeries({color:'#00d4ff',lineWidth:2,lastValueVisible:true,priceLineVisible:false})
          .setData(strategyCurve.map(p=>({time:p.date,value:p.value})))
        trackSeries(strategyCurve,'st')
      }
      if(showCompound&&compoundCurve?.length){
        chart.addLineSeries({color:'#00e5a0',lineWidth:2,lastValueVisible:true,priceLineVisible:false})
          .setData(compoundCurve.map(p=>({time:p.date,value:p.value})))
        trackSeries(compoundCurve,'co')
      }
      if(showBH&&bhCurve?.length){
        chart.addLineSeries({color:'#ffd166',lineWidth:2,lineStyle:LineStyle.Dashed,lastValueVisible:true,priceLineVisible:false})
          .setData(bhCurve.map(p=>({time:p.date,value:p.value})))
        trackSeries(bhCurve,'bh')
      }
      if(showSP500&&sp500BHCurve?.length){
        chart.addLineSeries({color:'#9b72ff',lineWidth:2,lineStyle:LineStyle.Dotted,lastValueVisible:true,priceLineVisible:false})
          .setData(sp500BHCurve.map(p=>({time:p.date,value:p.value})))
        trackSeries(sp500BHCurve,'sp')
      }
      const base=strategyCurve||compoundCurve||bhCurve||sp500BHCurve
      if(base?.length)
        chart.addLineSeries({color:'#3d5a7a',lineWidth:1,lineStyle:LineStyle.Dotted,lastValueVisible:false,priceLineVisible:false})
          .setData([{time:base[0].date,value:capitalIni},{time:base[base.length-1].date,value:capitalIni}])
      const addDD=(curve,date,dd,color)=>{
        if(!date||!dd||!curve?.length) return
        let peak={date:curve[0].date,value:curve[0].value}
        for(const p of curve){if(p.date>date)break;if(p.value>peak.value)peak=p}
        const trough=curve.find(p=>p.date===date)
        if(!trough||peak.date===trough.date) return
        const s=chart.addLineSeries({color,lineWidth:2,lastValueVisible:false,priceLineVisible:false})
        s.setData([{time:peak.date,value:peak.value},{time:trough.date,value:trough.value}])
        s.setMarkers([{time:trough.date,position:'belowBar',color,shape:'circle',size:0,text:`↓ -${dd.toFixed(1)}%`}])
      }
      if(showStrategy) addDD(strategyCurve,maxDDStrategyDate,maxDDStrategy,'#ff4d6d')
      if(showCompound) addDD(compoundCurve,maxDDCompoundDate,maxDDCompound,'#00a870')
      if(showBH)       addDD(bhCurve,maxDDBHDate,maxDDBH,'#ff9a3c')
      if(showSP500)    addDD(sp500BHCurve,maxDDSP500Date,maxDDSP500,'#7b5fe0')
      // ── Cross-chart time sync ──
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
        chart.__syncCleanup=()=>{try{unsub()}catch(_){};if(syncRef.current) syncRef.current.listeners=syncRef.current.listeners.filter(e=>e.id!==syncId)}
      }
      // Crosshair tooltip — valores de cada curva al pasar el cursor
      chart.subscribeCrosshairMove(param=>{
        const tt=equityTooltipRef.current; if(!tt) return
        if(!param.time||!param.point){tt.style.display='none';return}
        const d=equityDataByDate[param.time]
        if(!d){tt.style.display='none';return}
        const rows=[]
        const MONO2='"JetBrains Mono",monospace'
        if(d.st!=null) rows.push(`<div style="display:flex;justify-content:space-between;gap:20px"><span style="color:#00d4ff">Simple</span><b style="color:#00d4ff">€${d.st.toLocaleString('es-ES',{minimumFractionDigits:2,maximumFractionDigits:2})}</b></div>`)
        if(d.co!=null) rows.push(`<div style="display:flex;justify-content:space-between;gap:20px"><span style="color:#00e5a0">Compuesta</span><b style="color:#00e5a0">€${d.co.toLocaleString('es-ES',{minimumFractionDigits:2,maximumFractionDigits:2})}</b></div>`)
        if(d.bh!=null) rows.push(`<div style="display:flex;justify-content:space-between;gap:20px"><span style="color:#ffd166">B&H Activo</span><b style="color:#ffd166">€${d.bh.toLocaleString('es-ES',{minimumFractionDigits:2,maximumFractionDigits:2})}</b></div>`)
        if(d.sp!=null) rows.push(`<div style="display:flex;justify-content:space-between;gap:20px"><span style="color:#9b72ff">B&H SP500</span><b style="color:#9b72ff">€${d.sp.toLocaleString('es-ES',{minimumFractionDigits:2,maximumFractionDigits:2})}</b></div>`)
        if(!rows.length){tt.style.display='none';return}
        const cw=ref.current?.clientWidth||600
        tt.style.display='block'
        tt.style.left=((param.point.x+200>cw)?param.point.x-210:param.point.x+14)+'px'
        tt.style.top=Math.max(4,param.point.y-40)+'px'
        tt.innerHTML=`<div style="font-size:10px;color:#7a9bc0;margin-bottom:4px;font-family:${MONO2}">${param.time}</div>`+rows.join('')
      })

      chart.timeScale().fitContent()
      const ro=new ResizeObserver(()=>{if(ref.current&&chartRef.current){try{chart.applyOptions({width:ref.current.clientWidth})}catch(_){}}})
      ro.observe(ref.current)
      return()=>ro.disconnect()
    })
    return()=>{if(chartRef.current){try{chartRef.current.__syncCleanup?.()}catch(_){};chartRef.current.remove();chartRef.current=null}}
  },[strategyCurve,bhCurve,sp500BHCurve,compoundCurve,maxDDStrategy,maxDDBH,maxDDSP500,maxDDCompound,maxDDStrategyDate,maxDDBHDate,maxDDSP500Date,maxDDCompoundDate,capitalIni,showStrategy,showBH,showSP500,showCompound])

  useEffect(()=>{
    if(chartRef.current) try{chartRef.current.applyOptions({height:chartHeight})}catch(_){}
  },[chartHeight])
  return (
    <div style={{position:'relative'}}>
      <div ref={ref} style={{minHeight:260}}/>
      <div ref={equityTooltipRef} style={{position:'absolute',display:'none',pointerEvents:'none',background:'rgba(8,12,20,0.96)',border:'1px solid #1a2d45',borderRadius:6,padding:'8px 12px',fontFamily:'"JetBrains Mono",monospace',fontSize:12,color:'#e2eaf5',zIndex:15,minWidth:180,boxShadow:'0 4px 20px rgba(0,0,0,0.5)'}}/>
    </div>
  )
}
