import { useRef, useEffect, useState } from 'react'

const MONO = '"JetBrains Mono",monospace'

// Marker config per contribution type
const CONTRIB_MARKER = {
  aportacion: { color:'#2a7fff', shape:'arrowUp',   position:'belowBar', prefix:'+' },
  retirada:   { color:'#ff4d6d', shape:'arrowDown',  position:'aboveBar', prefix:'-' },
  dividendo:  { color:'#aaff44', shape:'circle',     position:'belowBar', prefix:'D+' },
}

export function TlEquityChart({ curve, curveSinFx, curveSinComm, curveWithContribs, contributions, showWithContribs, onToggleContribs }) {
  const ref = useRef(null), chartRef = useRef(null)
  const [showSinFx, setShowSinFx] = useState(true)
  const [showSinComm, setShowSinComm] = useState(true)

  // Active main curve
  const activeCurve = showWithContribs && curveWithContribs?.length > 1 ? curveWithContribs : curve
  // Derive legend color from final active curve value
  const lineColor = activeCurve?.length ? (activeCurve[activeCurve.length-1].value >= 0 ? '#00e5a0' : '#ff4d6d') : '#00e5a0'

  useEffect(()=>{
    if(!ref.current||!activeCurve?.length) return
    import('lightweight-charts').then(({createChart,CrosshairMode,LineStyle})=>{
      if(chartRef.current){chartRef.current.remove();chartRef.current=null}
      const chart = createChart(ref.current,{
        width:ref.current.clientWidth, height:200,
        layout:{background:{color:'#080c14'},textColor:'#7a9bc0'},
        grid:{vertLines:{color:'#0d1520'},horzLines:{color:'#0d1520'}},
        crosshair:{mode:CrosshairMode.Normal},
        rightPriceScale:{borderColor:'#1a2d45'},
        timeScale:{borderColor:'#1a2d45',timeVisible:true},
        localization:{priceFormatter:v=>'€'+Math.round(v)},
      })
      chartRef.current = chart
      // Zero baseline
      chart.addLineSeries({color:'#2a3f55',lineWidth:1,lineStyle:LineStyle.Dotted,lastValueVisible:false,priceLineVisible:false})
        .setData([{time:activeCurve[0].date,value:0},{time:activeCurve[activeCurve.length-1].date,value:0}])
      // Main series
      const finalVal = activeCurve[activeCurve.length-1].value
      const lc = finalVal >= 0 ? '#00e5a0' : '#ff4d6d'
      const label = showWithContribs ? 'Patrimonio' : 'P&L real'
      const mainSeries = chart.addLineSeries({color:lc,lineWidth:2,lastValueVisible:true,priceLineVisible:false,title:label})
      mainSeries.setData(activeCurve.map(p=>({time:p.date,value:p.value})))
      // Contribution markers on main series
      if(showWithContribs && contributions?.length){
        const markers = contributions
          .filter(c=>c.date)
          .map(c=>{
            const m = CONTRIB_MARKER[c.type] || CONTRIB_MARKER.aportacion
            return { time:c.date, position:m.position, color:m.color, shape:m.shape,
              text: m.prefix+'€'+Math.round(parseFloat(c.amount||0)) }
          })
          .sort((a,b)=>a.time.localeCompare(b.time))
        if(markers.length) mainSeries.setMarkers(markers)
      }
      // Sin FX line (hidden when showWithContribs — patrimony doesn't split FX)
      if(!showWithContribs && showSinFx && curveSinFx?.length>1){
        chart.addLineSeries({color:'#7a9bc0',lineWidth:1,lineStyle:LineStyle.Dashed,lastValueVisible:true,priceLineVisible:false,title:'Sin FX'})
          .setData(curveSinFx.map(p=>({time:p.date,value:p.value})))
      }
      // Sin Comisiones line
      if(!showWithContribs && showSinComm && curveSinComm?.length>1){
        chart.addLineSeries({color:'#ffd166',lineWidth:1,lineStyle:LineStyle.Dashed,lastValueVisible:true,priceLineVisible:false,title:'Sin Comm'})
          .setData(curveSinComm.map(p=>({time:p.date,value:p.value})))
      }
      chart.timeScale().fitContent()
      const ro = new ResizeObserver(()=>{ if(ref.current) chart.applyOptions({width:ref.current.clientWidth}) })
      ro.observe(ref.current)
      return ()=>ro.disconnect()
    })
    return ()=>{ if(chartRef.current){chartRef.current.remove();chartRef.current=null} }
  },[activeCurve, curveSinFx, curveSinComm, showSinFx, showSinComm, showWithContribs, contributions])

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
        {/* Contribution type legend when showWithContribs */}
        {showWithContribs&&contributions?.length>0&&(
          <span style={{display:'flex',gap:8,marginLeft:4}}>
            {['aportacion','retirada','dividendo'].filter(t=>contributions.some(c=>c.type===t)).map(t=>(
              <span key={t} style={{display:'flex',alignItems:'center',gap:3,fontFamily:MONO,fontSize:8,color:CONTRIB_MARKER[t].color}}>
                <span style={{fontSize:10}}>{t==='retirada'?'↓':'↑'}</span>
                {t==='aportacion'?'Aport.':t==='retirada'?'Retir.':'Divid.'}
              </span>
            ))}
          </span>
        )}
      </div>
      <div ref={ref} style={{minHeight:200}}/>
    </div>
  )
}

// ── Capital Invertido vs Profit acumulado (area + line) ──
export function TlInvestChart({ investData }) {
  // investData: [{date, capital, profit}]  sorted by date
  const ref = useRef(null), chartRef = useRef(null)
  useEffect(()=>{
    if(!ref.current||!investData?.length) return
    import('lightweight-charts').then(({createChart,CrosshairMode,LineStyle})=>{
      if(chartRef.current){chartRef.current.remove();chartRef.current=null}
      const chart = createChart(ref.current,{
        width:ref.current.clientWidth, height:200,
        layout:{background:{color:'#0b0f1a'},textColor:'#7a9bc0'},
        grid:{vertLines:{color:'#0d1520'},horzLines:{color:'#0d1520'}},
        crosshair:{mode:CrosshairMode.Normal},
        rightPriceScale:{borderColor:'#1a2d45',scaleMargins:{top:0.08,bottom:0.06}},
        timeScale:{borderColor:'#1a2d45',timeVisible:true},
        localization:{priceFormatter:v=>'€'+Math.round(v)},
      })
      chartRef.current = chart
      // Area — Capital Invertido (azul con relleno)
      const areaSeries = chart.addAreaSeries({
        lineColor:'#2a7fff',
        topColor:'rgba(42,127,255,0.55)',
        bottomColor:'rgba(42,127,255,0.04)',
        lineWidth:2,
        title:'Capital inv.',
        lastValueVisible:true,
        priceLineVisible:false,
      })
      areaSeries.setData(investData.map(p=>({time:p.date,value:p.capital})))
      // Line — Profit acumulado (verde lima)
      const profitSeries = chart.addLineSeries({
        color:'#aaff44',
        lineWidth:2,
        title:'Profit',
        lastValueVisible:true,
        priceLineVisible:false,
      })
      profitSeries.setData(investData.map(p=>({time:p.date,value:p.profit})))
      // Zero dotted
      if(investData.length>1){
        chart.addLineSeries({color:'#2a3f55',lineWidth:1,lineStyle:LineStyle.Dotted,lastValueVisible:false,priceLineVisible:false})
          .setData([{time:investData[0].date,value:0},{time:investData[investData.length-1].date,value:0}])
      }
      chart.timeScale().fitContent()
      const ro = new ResizeObserver(()=>{ if(ref.current) chart.applyOptions({width:ref.current.clientWidth}) })
      ro.observe(ref.current)
      return ()=>ro.disconnect()
    })
    return ()=>{ if(chartRef.current){chartRef.current.remove();chartRef.current=null} }
  },[investData])
  return (
    <div style={{borderTop:'1px solid var(--border)'}}>
      <div style={{padding:'6px 14px 0',display:'flex',alignItems:'center',gap:14}}>
        <span style={{fontFamily:'"JetBrains Mono",monospace',fontSize:9,color:'#3d5a7a',letterSpacing:'0.1em',textTransform:'uppercase'}}>Capital Invertido vs Profit</span>
        <span style={{display:'flex',alignItems:'center',gap:4,fontFamily:'"JetBrains Mono",monospace',fontSize:9,color:'#2a7fff'}}>
          <span style={{display:'inline-block',width:10,height:2,background:'#2a7fff',borderRadius:1}}/> Capital inv.
        </span>
        <span style={{display:'flex',alignItems:'center',gap:4,fontFamily:'"JetBrains Mono",monospace',fontSize:9,color:'#aaff44'}}>
          <span style={{display:'inline-block',width:10,height:2,background:'#aaff44',borderRadius:1}}/> Profit acum.
        </span>
      </div>
      <div ref={ref} style={{minHeight:200}}/>
    </div>
  )
}
