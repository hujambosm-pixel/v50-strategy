import { useRef, useEffect, useState } from 'react'

const MONO = '"JetBrains Mono",monospace'

// Marker config per contribution type
const CONTRIB_MARKER = {
  aportacion: { color:'#2a7fff', shape:'arrowUp',   position:'belowBar', prefix:'+' },
  retirada:   { color:'#ff4d6d', shape:'arrowDown',  position:'aboveBar', prefix:'-' },
  dividendo:  { color:'#aaff44', shape:'circle',     position:'belowBar', prefix:'D+' },
}

export function TlEquityChart({ curve, curveSinFx, curveSinComm, curveWithContribs, contributions, showWithContribs, onToggleContribs, height, showTimeScale, syncRef }) {
  const ref = useRef(null), chartRef = useRef(null), equityTooltipRef = useRef(null)
  const [showSinFx, setShowSinFx] = useState(false)
  const [showSinComm, setShowSinComm] = useState(false)
  const [showAportacion, setShowAportacion] = useState(true)
  const [showRetirada, setShowRetirada] = useState(true)
  const [showDividendo, setShowDividendo] = useState(true)

  // Active main curve
  const activeCurve = showWithContribs && curveWithContribs?.length > 1 ? curveWithContribs : curve
  // Derive legend color from final active curve value
  const lineColor = activeCurve?.length ? (activeCurve[activeCurve.length-1].value >= 0 ? '#00e5a0' : '#ff4d6d') : '#00e5a0'

  useEffect(()=>{
    if(!ref.current||!activeCurve?.length) return
    import('lightweight-charts').then(({createChart,CrosshairMode,LineStyle})=>{
      if(chartRef.current){chartRef.current.remove();chartRef.current=null}
      const chart = createChart(ref.current,{
        width:ref.current.clientWidth, height:height||ref.current.clientHeight||200,
        layout:{background:{color:'#080c14'},textColor:'#7a9bc0'},
        grid:{vertLines:{color:'#0d1520'},horzLines:{color:'#0d1520'}},
        crosshair:{mode:CrosshairMode.Normal},
        rightPriceScale:{borderColor:'#1a2d45'},
        timeScale:{borderColor:'#1a2d45',timeVisible:true,visible:showTimeScale!==false},
        localization:{priceFormatter:v=>'€'+Math.round(v)},
      })
      chartRef.current = chart
      // Zero baseline
      chart.addLineSeries({color:'#2a3f55',lineWidth:1,lineStyle:LineStyle.Dotted,lastValueVisible:false,priceLineVisible:false})
        .setData([{time:activeCurve[0].date,value:0},{time:activeCurve[activeCurve.length-1].date,value:0}])
      // Track series data by date for crosshair tooltip
      const eqData={}
      const track=(arr,key)=>arr?.forEach(p=>{if(!eqData[p.date])eqData[p.date]={};eqData[p.date][key]=p.value})
      // Main series
      const finalVal = activeCurve[activeCurve.length-1].value
      const lc = finalVal >= 0 ? '#00e5a0' : '#ff4d6d'
      const label = showWithContribs ? 'Patrimonio' : 'P&L real'
      const mainSeries = chart.addLineSeries({color:lc,lineWidth:2,lastValueVisible:true,priceLineVisible:false,title:label})
      mainSeries.setData(activeCurve.map(p=>({time:p.date,value:p.value})))
      track(activeCurve,'main')
      // Contribution markers on main series
      if(showWithContribs && contributions?.length){
        const activeTypes = new Set(['aportacion','retirada','dividendo'].filter(t=>
          t==='aportacion'?showAportacion:t==='retirada'?showRetirada:showDividendo
        ))
        const markers = contributions
          .filter(c=>c.date && activeTypes.has(c.type))
          .map(c=>{
            const m = CONTRIB_MARKER[c.type] || CONTRIB_MARKER.aportacion
            const amt = Math.round(parseFloat(c.amount||0))
            const txt = amt>=1000 ? m.prefix+(amt/1000).toFixed(0)+'k' : m.prefix+amt
            return { time:c.date, position:m.position, color:m.color, shape:m.shape, size:0.3, text:txt }
          })
          .sort((a,b)=>a.time.localeCompare(b.time))
        if(markers.length) mainSeries.setMarkers(markers)
      }
      // Sin FX line (hidden when showWithContribs — patrimony doesn't split FX)
      if(!showWithContribs && showSinFx && curveSinFx?.length>1){
        chart.addLineSeries({color:'#7a9bc0',lineWidth:1,lineStyle:LineStyle.Dashed,lastValueVisible:true,priceLineVisible:false,title:'Sin FX'})
          .setData(curveSinFx.map(p=>({time:p.date,value:p.value})))
        track(curveSinFx,'fx')
      }
      // Sin Comisiones line
      if(!showWithContribs && showSinComm && curveSinComm?.length>1){
        chart.addLineSeries({color:'#ffd166',lineWidth:1,lineStyle:LineStyle.Dashed,lastValueVisible:true,priceLineVisible:false,title:'Sin Comm'})
          .setData(curveSinComm.map(p=>({time:p.date,value:p.value})))
        track(curveSinComm,'comm')
      }
      // Cross-chart time sync (time range)
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
        chartRef.current.__syncCleanup=()=>{try{unsub()}catch(_){};if(syncRef.current)syncRef.current.listeners=syncRef.current.listeners.filter(e=>e.id!==syncId)}
      }
      // Crosshair tooltip
      const MONO2='"JetBrains Mono",monospace'
      chart.subscribeCrosshairMove(param=>{
        const tt=equityTooltipRef.current; if(!tt) return
        if(!param.time||!param.point){tt.style.display='none';return}
        const d=eqData[param.time]; if(!d){tt.style.display='none';return}
        const rows=[]
        if(d.main!=null) rows.push(`<div style="display:flex;justify-content:space-between;gap:20px"><span style="color:${lc}">${label}</span><b style="color:${lc}">€${Math.round(d.main).toLocaleString('es-ES')}</b></div>`)
        if(d.fx!=null)   rows.push(`<div style="display:flex;justify-content:space-between;gap:20px"><span style="color:#7a9bc0">Sin FX</span><b style="color:#7a9bc0">€${Math.round(d.fx).toLocaleString('es-ES')}</b></div>`)
        if(d.comm!=null) rows.push(`<div style="display:flex;justify-content:space-between;gap:20px"><span style="color:#ffd166">Sin Comm</span><b style="color:#ffd166">€${Math.round(d.comm).toLocaleString('es-ES')}</b></div>`)
        if(!rows.length){tt.style.display='none';return}
        const cw=ref.current?.clientWidth||600
        tt.style.display='block'
        tt.style.left=((param.point.x+200>cw)?param.point.x-210:param.point.x+14)+'px'
        tt.style.top=Math.max(4,param.point.y-40)+'px'
        tt.innerHTML=rows.join('')
      })
      chart.timeScale().fitContent()
      if(syncRef?.current){
        syncRef.current.getRange=()=>{try{return chart.timeScale().getVisibleRange()}catch(_){return null}}
      }
      const ro = new ResizeObserver(()=>{
        if(!ref.current) return
        chart.applyOptions({width:ref.current.clientWidth,height:height||ref.current.clientHeight||200})
      })
      ro.observe(ref.current)
      return ()=>ro.disconnect()
    })
    return ()=>{ if(chartRef.current){try{chartRef.current.__syncCleanup?.()}catch(_){};chartRef.current.remove();chartRef.current=null} }
  },[activeCurve, curveSinFx, curveSinComm, showSinFx, showSinComm, showWithContribs, contributions, showAportacion, showRetirada, showDividendo])

  const btnStyle = (active, color) => ({
    display:'flex',alignItems:'center',gap:4,
    fontFamily:MONO,fontSize:9,color:active?color:'#3d5a7a',
    cursor:'pointer',background:'none',border:'none',padding:'1px 4px',
    borderRadius:3,opacity:active?1:0.5,
    transition:'opacity 0.15s',
  })

  return (
    <div style={{borderTop:'1px solid var(--border)'}}>
      <div style={{padding:'4px 14px 0',display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}>
        <span style={{fontFamily:MONO,fontSize:9,color:'#3d5a7a',letterSpacing:'0.1em',textTransform:'uppercase',marginRight:4}}>Equity</span>
        {/* Main legend */}
        <span style={{display:'flex',alignItems:'center',gap:4,fontFamily:MONO,fontSize:9,color:lineColor}}>
          <span style={{display:'inline-block',width:10,height:2,background:lineColor,borderRadius:1}}/>
          {showWithContribs ? 'Patrimonio' : 'P&L real'}
        </span>
        {/* Con aportaciones toggle — only when data available */}
        {curveWithContribs?.length>1&&onToggleContribs&&(
          <button onClick={onToggleContribs} style={btnStyle(showWithContribs,'#9b72ff')}
            title={showWithContribs?'Mostrar solo P&L':'Mostrar patrimonio con aportaciones'}>
            <span style={{display:'inline-block',width:8,height:8,borderRadius:'50%',
              background:showWithContribs?'#9b72ff':'#3d5a7a',marginRight:2}}/> Con aport.
          </button>
        )}
        {/* Sin FX toggle — hidden when showWithContribs */}
        {!showWithContribs&&curveSinFx?.length>1&&(
          <button onClick={()=>setShowSinFx(v=>!v)} style={btnStyle(showSinFx,'#7a9bc0')} title={showSinFx?'Ocultar Sin FX':'Mostrar Sin FX'}>
            <span style={{display:'inline-block',width:10,height:2,background:'#7a9bc0',borderRadius:1,opacity:showSinFx?0.8:0.3,borderBottom:'1px dashed #7a9bc0'}}/> Sin FX
          </button>
        )}
        {/* Sin Comisiones toggle — hidden when showWithContribs */}
        {!showWithContribs&&curveSinComm?.length>1&&(
          <button onClick={()=>setShowSinComm(v=>!v)} style={btnStyle(showSinComm,'#ffd166')} title={showSinComm?'Ocultar Sin Comisiones':'Mostrar Sin Comisiones'}>
            <span style={{display:'inline-block',width:10,height:2,background:'#ffd166',borderRadius:1,opacity:showSinComm?0.8:0.3,borderBottom:'1px dashed #ffd166'}}/> Sin Comm.
          </button>
        )}
        {/* Contribution type toggles when showWithContribs */}
        {showWithContribs&&contributions?.length>0&&(()=>{
          const cfg=[
            {type:'aportacion', label:'Aport.', icon:'↑', show:showAportacion, set:setShowAportacion},
            {type:'retirada',   label:'Retir.', icon:'↓', show:showRetirada,   set:setShowRetirada},
            {type:'dividendo',  label:'Divid.', icon:'↑', show:showDividendo,  set:setShowDividendo},
          ].filter(({type})=>contributions.some(c=>c.type===type))
          return(
            <span style={{display:'flex',gap:6,marginLeft:4}}>
              {cfg.map(({type,label,icon,show,set})=>(
                <button key={type} onClick={()=>set(v=>!v)} style={btnStyle(show, CONTRIB_MARKER[type].color)}
                  title={show?`Ocultar ${label}`:`Mostrar ${label}`}>
                  <span style={{fontSize:9,opacity:show?1:0.4}}>{icon}</span> {label}
                </button>
              ))}
            </span>
          )
        })()}
      </div>
      <div style={{position:'relative',height:'100%'}}>
        <div ref={ref} style={{height:'100%'}}/>
        <div ref={equityTooltipRef} style={{position:'absolute',display:'none',pointerEvents:'none',background:'rgba(8,12,20,0.96)',border:'1px solid #1a2d45',borderRadius:6,padding:'8px 12px',fontFamily:'"JetBrains Mono",monospace',fontSize:12,color:'#e2eaf5',zIndex:15,minWidth:160,boxShadow:'0 4px 20px rgba(0,0,0,0.5)'}}/>
      </div>
    </div>
  )
}

// ── Capital Invertido vs Profit acumulado (area + line) ──
export function TlInvestChart({ investData, syncRef, patrimonyCurve, compact, height }) {
  // investData: [{date, capital, profit}]  sorted by date
  // compact=true: no header/legend, chart fills container height (used in Dashboard mini view)
  const ref = useRef(null), chartRef = useRef(null), investTooltipRef = useRef(null)
  const [showPatrimony, setShowPatrimony] = useState(false)

  useEffect(()=>{
    if(!ref.current||!investData?.length) return
    import('lightweight-charts').then(({createChart,CrosshairMode,LineStyle})=>{
      if(chartRef.current){chartRef.current.remove();chartRef.current=null}
      // compact mode: inherit container height; standalone mode: use clientHeight or default 200
      const chartH=compact
        ? Math.max(40, ref.current.parentElement?.clientHeight||ref.current.clientHeight||120)
        : Math.max(60, height||ref.current.clientHeight||200)
      const chart = createChart(ref.current,{
        width:ref.current.clientWidth, height:chartH,
        layout:{background:{color:'#0b0f1a'},textColor:'#7a9bc0'},
        grid:{vertLines:{color:'#0d1520'},horzLines:{color:'#0d1520'}},
        crosshair:{mode:CrosshairMode.Normal},
        rightPriceScale:{borderColor:'#1a2d45',scaleMargins:{top:0.08,bottom:0.06}},
        timeScale:{borderColor:'#1a2d45',timeVisible:!compact,visible:!compact},
        localization:{priceFormatter:v=>'€'+Math.round(v)},
      })
      chartRef.current = chart
      const eqData={}
      const track=(arr,key)=>arr?.forEach(p=>{if(!eqData[p.date])eqData[p.date]={};eqData[p.date][key]=p.value})
      // Patrimonio area — renderizada ANTES del capital para quedar detrás
      if(showPatrimony && patrimonyCurve?.length>1){
        chart.addAreaSeries({
          lineColor:'rgba(0,229,160,0.35)',
          topColor:'rgba(0,229,160,0.15)',
          bottomColor:'rgba(0,229,160,0.02)',
          lineWidth:1,
          title:'Patrimonio',
          lastValueVisible:true,
          priceLineVisible:false,
        }).setData(patrimonyCurve.map(p=>({time:p.date,value:p.value})))
        track(patrimonyCurve,'pat')
      }
      // Area — Capital Invertido (azul con relleno)
      chart.addAreaSeries({
        lineColor:'#2a7fff',
        topColor:'rgba(42,127,255,0.55)',
        bottomColor:'rgba(42,127,255,0.04)',
        lineWidth:2,
        title:'Capital inv.',
        lastValueVisible:true,
        priceLineVisible:false,
      }).setData(investData.map(p=>({time:p.date,value:p.capital})))
      track(investData.map(p=>({date:p.date,value:p.capital})),'cap')
      // Line — Profit acumulado (verde lima)
      chart.addLineSeries({
        color:'#aaff44',
        lineWidth:2,
        title:'Profit',
        lastValueVisible:true,
        priceLineVisible:false,
      }).setData(investData.map(p=>({time:p.date,value:p.profit})))
      track(investData.map(p=>({date:p.date,value:p.profit})),'pnl')
      // Zero dotted
      if(investData.length>1){
        chart.addLineSeries({color:'#2a3f55',lineWidth:1,lineStyle:LineStyle.Dotted,lastValueVisible:false,priceLineVisible:false})
          .setData([{time:investData[0].date,value:0},{time:investData[investData.length-1].date,value:0}])
      }
      // Crosshair tooltip
      const MONO2='"JetBrains Mono",monospace'
      chart.subscribeCrosshairMove(param=>{
        const tt=investTooltipRef.current; if(!tt) return
        if(!param.time||!param.point){tt.style.display='none';return}
        const d=eqData[param.time]; if(!d){tt.style.display='none';return}
        const rows=[]
        if(d.pat!=null) rows.push(`<div style="display:flex;justify-content:space-between;gap:20px"><span style="color:#00e5a0">Patrimonio</span><b style="color:#00e5a0">€${Math.round(d.pat).toLocaleString('es-ES')}</b></div>`)
        if(d.cap!=null) rows.push(`<div style="display:flex;justify-content:space-between;gap:20px"><span style="color:#2a7fff">Capital inv.</span><b style="color:#2a7fff">€${Math.round(d.cap).toLocaleString('es-ES')}</b></div>`)
        if(d.pnl!=null) rows.push(`<div style="display:flex;justify-content:space-between;gap:20px"><span style="color:#aaff44">Profit acum.</span><b style="color:#aaff44">${d.pnl>=0?'':'−'}€${Math.abs(Math.round(d.pnl)).toLocaleString('es-ES')}</b></div>`)
        if(!rows.length){tt.style.display='none';return}
        const cw=ref.current?.clientWidth||600
        tt.style.display='block'
        tt.style.left=((param.point.x+200>cw)?param.point.x-210:param.point.x+14)+'px'
        tt.style.top=Math.max(4,param.point.y-40)+'px'
        tt.innerHTML=rows.join('')
      })
      // Cross-chart time sync (time range)
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
        chartRef.current.__syncCleanup=()=>{try{unsub()}catch(_){};if(syncRef.current)syncRef.current.listeners=syncRef.current.listeners.filter(e=>e.id!==syncId)}
      }
      chart.timeScale().fitContent()
      if(syncRef?.current?.getRange){
        const range=syncRef.current.getRange()
        if(range){try{chart.timeScale().setVisibleRange(range)}catch(_){}}
      }
      const ro = new ResizeObserver(()=>{
        if(!ref.current) return
        const w=ref.current.clientWidth||300
        if(compact){
          chart.applyOptions({width:w})
        } else {
          const h=ref.current.getBoundingClientRect().height||ref.current.parentElement?.getBoundingClientRect().height||200
          chart.applyOptions({width:w,height:h})
        }
      })
      ro.observe(ref.current)
      return ()=>ro.disconnect()
    })
    return ()=>{ if(chartRef.current){try{chartRef.current.__syncCleanup?.()}catch(_){};chartRef.current.remove();chartRef.current=null} }
  },[investData, showPatrimony, patrimonyCurve])

  const btnStyle = (active, color) => ({
    display:'flex',alignItems:'center',gap:4,
    fontFamily:MONO,fontSize:9,color:active?color:'#3d5a7a',
    cursor:'pointer',background:'none',border:'none',padding:'1px 4px',
    borderRadius:3,opacity:active?1:0.5,transition:'opacity 0.15s',
  })
  // Compact mode: bare chart, no header, fills parent height
  if(compact) return (
    <div style={{position:'relative',height:'100%',width:'100%'}}>
      <div ref={ref} style={{height:'100%',width:'100%',minHeight:0}}/>
      <div ref={investTooltipRef} style={{position:'absolute',display:'none',pointerEvents:'none',background:'rgba(8,12,20,0.96)',border:'1px solid #1a2d45',borderRadius:6,padding:'6px 10px',fontFamily:'"JetBrains Mono",monospace',fontSize:11,color:'#e2eaf5',zIndex:15,minWidth:140,boxShadow:'0 4px 20px rgba(0,0,0,0.5)'}}/>
    </div>
  )

  return (
    <div style={{borderTop:'1px solid var(--border)'}}>
      <div style={{padding:'6px 14px 0',display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
        <span style={{fontFamily:MONO,fontSize:9,color:'#3d5a7a',letterSpacing:'0.1em',textTransform:'uppercase',marginRight:4}}>Capital Invertido vs Profit</span>
        <span style={{display:'flex',alignItems:'center',gap:4,fontFamily:MONO,fontSize:9,color:'#2a7fff'}}>
          <span style={{display:'inline-block',width:10,height:2,background:'#2a7fff',borderRadius:1}}/> Capital inv.
        </span>
        <span style={{display:'flex',alignItems:'center',gap:4,fontFamily:MONO,fontSize:9,color:'#aaff44'}}>
          <span style={{display:'inline-block',width:10,height:2,background:'#aaff44',borderRadius:1}}/> Profit acum.
        </span>
        {patrimonyCurve?.length>1&&(
          <button onClick={()=>setShowPatrimony(v=>!v)} style={btnStyle(showPatrimony,'#00e5a0')}
            title={showPatrimony?'Ocultar Patrimonio':'Mostrar Patrimonio total'}>
            <span style={{display:'inline-block',width:10,height:6,borderRadius:1,
              background:showPatrimony?'rgba(0,229,160,0.4)':'transparent',
              border:'1px solid '+(showPatrimony?'#00e5a0':'#3d5a7a')}}/> Patrimonio
          </button>
        )}
      </div>
      <div style={{position:'relative'}}>
        <div ref={ref} style={{minHeight:200}}/>
        <div ref={investTooltipRef} style={{position:'absolute',display:'none',pointerEvents:'none',background:'rgba(8,12,20,0.96)',border:'1px solid #1a2d45',borderRadius:6,padding:'8px 12px',fontFamily:'"JetBrains Mono",monospace',fontSize:12,color:'#e2eaf5',zIndex:15,minWidth:160,boxShadow:'0 4px 20px rgba(0,0,0,0.5)'}}/>
      </div>
    </div>
  )
}
