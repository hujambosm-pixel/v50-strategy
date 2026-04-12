import { useRef, useEffect, useState } from 'react'

const MONO = '"JetBrains Mono",monospace'

// Marker config per contribution type
const CONTRIB_MARKER = {
  aportacion: { color:'#2a7fff', shape:'arrowUp',   position:'belowBar', prefix:'+' },
  retirada:   { color:'#ff4d6d', shape:'arrowDown',  position:'aboveBar', prefix:'-' },
  dividendo:  { color:'#aaff44', shape:'circle',     position:'belowBar', prefix:'D+' },
}

export function TlEquityChart({ curve, curveSinFx, curveSinComm, curveWithContribs, curveBH, showBH, onToggleBH, equityMode, onToggleMode, contributions, showWithContribs, onToggleContribs, curveFloat, floatLoading, showFloat, onToggleFloat, onFirstFloat, height, showTimeScale, syncRef }) {
  const ref = useRef(null), chartRef = useRef(null), equityTooltipRef = useRef(null), lastTTStateRef = useRef(null)
  const mainSeriesRef = useRef(null)
  const [showSinFx, setShowSinFx] = useState(false)
  const [showSinComm, setShowSinComm] = useState(false)
  const [showAportacion, setShowAportacion] = useState(true)
  const [showRetirada, setShowRetirada] = useState(true)
  const [showDividendo, setShowDividendo] = useState(true)
  const [showDD, setShowDD] = useState(false)

  const isEquityMode = equityMode === 'equity'
  // Active main curve: equity mode + float toggle → floatCurve; equity mode → curveWithContribs; P&L mode → existing logic
  const activeCurve = isEquityMode
    ? (showFloat && curveFloat?.length > 1 ? curveFloat : curveWithContribs?.length > 1 ? curveWithContribs : curve)
    : (showWithContribs && curveWithContribs?.length > 1 ? curveWithContribs : curve)
  // Keep a ref to activeCurve so the chart-creation effect can read the latest value without depending on it
  const activeCurveRef = useRef(activeCurve)
  activeCurveRef.current = activeCurve
  const lineColor = '#00e676'

  // Date formatter for tooltip: "2025-03-15" → "15 Mar 2025"
  const fmtDate = d => {
    if(!d||typeof d!=='string') return ''
    const months=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
    const [y,m,day]=d.split('-')
    return `${parseInt(day)} ${months[parseInt(m)-1]} ${y}`
  }

  useEffect(()=>{
    const ac = activeCurveRef.current
    if(!ref.current||!ac?.length) return
    let cancelled = false
    import('lightweight-charts').then(({createChart,CrosshairMode,LineStyle})=>{
      if(cancelled) return
      if(chartRef.current){chartRef.current.remove();chartRef.current=null;mainSeriesRef.current=null}
      const chart = createChart(ref.current,{
        width:ref.current.clientWidth, height:height||ref.current.clientHeight||200,
        layout:{background:{color:'#080c14'},textColor:'#7a9bc0',fontFamily:'-apple-system, BlinkMacSystemFont, Trebuchet MS, Roboto, Ubuntu, sans-serif'},
        grid:{vertLines:{color:'#0d1520'},horzLines:{color:'#0d1520'}},
        crosshair:{mode:CrosshairMode.Normal},
        rightPriceScale:{borderColor:'#1a2d45'},
        timeScale:{borderColor:'#1a2d45',timeVisible:true,visible:showTimeScale!==false},
        localization:{priceFormatter:v=>'€'+Math.round(v)},
      })
      chartRef.current = chart
      // Zero baseline (only in P&L mode where 0 is meaningful)
      if(!isEquityMode){
        chart.addLineSeries({color:'#2a3f55',lineWidth:1,lineStyle:LineStyle.Dotted,lastValueVisible:false,priceLineVisible:false})
          .setData([{time:ac[0].date,value:0},{time:ac[ac.length-1].date,value:0}])
      }
      // Track series data by date for crosshair tooltip
      const eqData={}
      const track=(arr,key,valFn)=>arr?.forEach(p=>{if(!eqData[p.date])eqData[p.date]={};eqData[p.date][key]=valFn?valFn(p):p.value})
      // Main series — always green
      lastTTStateRef.current = null
      const lc = '#00e676'
      const mainSeries = chart.addLineSeries({color:lc,lineWidth:2,lastValueVisible:true,priceLineVisible:false})
      mainSeries.setData(activeCurveRef.current.map(p=>({time:p.date,value:p.value})))
      mainSeriesRef.current = mainSeries
      track(activeCurveRef.current,'main')
      // Contribution markers — only in equity mode
      if(isEquityMode && contributions?.length){
        const activeTypes = new Set(['aportacion','retirada','dividendo'].filter(t=>
          t==='aportacion'?showAportacion:t==='retirada'?showRetirada:showDividendo
        ))
        const markers = contributions
          .filter(c=>c.date && activeTypes.has(c.type))
          .map(c=>{
            const m = CONTRIB_MARKER[c.type] || CONTRIB_MARKER.aportacion
            const amt = Math.round(parseFloat(c.amount||0))
            const txt = amt>=1000 ? m.prefix+(amt/1000).toFixed(0)+'k' : m.prefix+amt
            return { time:c.date, position:m.position, color:m.color, shape:m.shape, size:1, text:txt }
          })
          .sort((a,b)=>a.time.localeCompare(b.time))
        if(markers.length) mainSeries.setMarkers(markers)
      }
      // Sin FX / Sin Comm — only in P&L mode
      if(!isEquityMode && showSinFx && curveSinFx?.length>1){
        chart.addLineSeries({color:'#7a9bc0',lineWidth:1,lineStyle:LineStyle.Dashed,lastValueVisible:true,priceLineVisible:false,title:'Sin FX'})
          .setData(curveSinFx.map(p=>({time:p.date,value:p.value})))
        track(curveSinFx,'fx')
      }
      if(!isEquityMode && showSinComm && curveSinComm?.length>1){
        chart.addLineSeries({color:'#ffd166',lineWidth:1,lineStyle:LineStyle.Dashed,lastValueVisible:true,priceLineVisible:false,title:'Sin Comm'})
          .setData(curveSinComm.map(p=>({time:p.date,value:p.value})))
        track(curveSinComm,'comm')
      }
      // B&H line — value depends on mode; hoisted so crosshair callback can do nearest-neighbor lookup
      let bhDataForTooltip = null
      if(showBH && curveBH?.length>1){
        const bhData = isEquityMode
          ? curveBH.map(p=>({time:p.date, value:(p.capitalAcum||0)+p.value}))
          : curveBH.map(p=>({time:p.date, value:p.value}))
        bhDataForTooltip = bhData
        chart.addLineSeries({color:'#f59e0b',lineWidth:1,lineStyle:LineStyle.Dashed,lastValueVisible:true,priceLineVisible:false,title:''})
          .setData(bhData)
        // Nearest-neighbor fill for tooltip on dates that have equity data
        if(bhData.length){let bhi=0;ac.forEach(p=>{while(bhi<bhData.length-1&&bhData[bhi+1].date<p.date)bhi++;const prev=bhi>0?bhData[bhi-1]:null;const curr=bhData[bhi];const pick=prev&&Math.abs(new Date(prev.date)-new Date(p.date))<Math.abs(new Date(curr.date)-new Date(p.date))?prev:curr;const diff=Math.abs(new Date(pick.date)-new Date(p.date))/86400000;if(diff<5){if(!eqData[p.date])eqData[p.date]={};eqData[p.date].bh=pick.value}})}
      }
      // Drawdown diagonal (peak → trough) — equity mode only
      if(showDD && isEquityMode && ac.length > 1){
        // Computes max drawdown: finds peak then deepest subsequent trough
        // Returns real temporal coordinates for the diagonal line
        const computeMaxDD = (data) => {
          let bestPeakIdx=0, bestTroughIdx=0, bestDD=0, peakIdx=0
          for(let i=1; i<data.length; i++){
            if(data[i].value > data[peakIdx].value) peakIdx=i
            if(data[peakIdx].value !== 0){
              const dd=(data[i].value - data[peakIdx].value)/Math.abs(data[peakIdx].value)
              if(dd < bestDD){ bestDD=dd; bestPeakIdx=peakIdx; bestTroughIdx=i }
            }
          }
          if(bestDD===0) return null
          return {
            peakDate:data[bestPeakIdx].date, peakVal:data[bestPeakIdx].value,
            troughDate:data[bestTroughIdx].date, troughVal:data[bestTroughIdx].value,
            ddPct:(bestDD*100).toFixed(1)
          }
        }

        const dd = computeMaxDD(ac)
        if(dd){
          const peakIdx2=ac.findIndex(p=>p.date===dd.peakDate)
          const troughIdx2=ac.findIndex(p=>p.date===dd.troughDate)
          const midIdx2=peakIdx2>=0&&troughIdx2>peakIdx2?Math.round((peakIdx2+troughIdx2)/2):- 1
          const midDate2=midIdx2>=0?ac[midIdx2].date:null
          const midVal2=(dd.peakVal+dd.troughVal)/2
          const pct2=Math.abs(parseFloat(dd.ddPct)).toFixed(1)
          const eur2=Math.round(dd.peakVal-dd.troughVal).toLocaleString('de-DE')
          const s=chart.addLineSeries({color:'#ff4d6d',lineWidth:2,lastValueVisible:false,priceLineVisible:false,title:''})
          const pts=[{time:dd.peakDate,value:dd.peakVal}]
          if(midDate2&&midDate2!==dd.peakDate&&midDate2!==dd.troughDate) pts.push({time:midDate2,value:midVal2})
          pts.push({time:dd.troughDate,value:dd.troughVal})
          s.setData(pts)
          if(midDate2) s.setMarkers([{time:midDate2,position:'aboveBar',color:'#ff4d6d',shape:'circle',size:0,text:`-${pct2}% · -€${eur2}`}])
        }
        if(showBH && curveBH?.length>1){
          const bhAbsData = curveBH.map(p=>({date:p.date,value:(p.capitalAcum||0)+p.value}))
          const bhDD = computeMaxDD(bhAbsData)
          if(bhDD){
            const bPeakIdx=bhAbsData.findIndex(p=>p.date===bhDD.peakDate)
            const bTroughIdx=bhAbsData.findIndex(p=>p.date===bhDD.troughDate)
            const bMidIdx=bPeakIdx>=0&&bTroughIdx>bPeakIdx?Math.round((bPeakIdx+bTroughIdx)/2):-1
            const bMidDate=bMidIdx>=0?bhAbsData[bMidIdx].date:null
            const bMidVal=(bhDD.peakVal+bhDD.troughVal)/2
            const bPct=Math.abs(parseFloat(bhDD.ddPct)).toFixed(1)
            const bEur=Math.round(bhDD.peakVal-bhDD.troughVal).toLocaleString('de-DE')
            const bs=chart.addLineSeries({color:'#f59e0b',lineWidth:1,lastValueVisible:false,priceLineVisible:false,title:''})
            const bPts=[{time:bhDD.peakDate,value:bhDD.peakVal}]
            if(bMidDate&&bMidDate!==bhDD.peakDate&&bMidDate!==bhDD.troughDate) bPts.push({time:bMidDate,value:bMidVal})
            bPts.push({time:bhDD.troughDate,value:bhDD.troughVal})
            bs.setData(bPts)
            if(bMidDate) bs.setMarkers([{time:bMidDate,position:'belowBar',color:'#f59e0b',shape:'circle',size:0,text:`-${bPct}% · -€${bEur}`}])
          }
        }
      }
      // Cross-chart time sync
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
      // Crosshair tooltip with date
      chart.subscribeCrosshairMove(param=>{
        const tt=equityTooltipRef.current; if(!tt) return
        if(param.time && param.point){
          const d=eqData[param.time]||{}
          // Nearest-neighbor main lookup for dates without equity data
          if(d.main==null&&ac?.length){
            let aci=0
            while(aci<ac.length-1&&ac[aci+1].date<param.time)aci++
            const aprev=aci>0?ac[aci-1]:null
            const acurr=ac[aci]
            const apick=aprev&&Math.abs(new Date(aprev.date)-new Date(param.time))<Math.abs(new Date(acurr.date)-new Date(param.time))?aprev:acurr
            if(Math.abs(new Date(apick.date)-new Date(param.time))/86400000<5)d.main=apick.value
          }
          // Nearest-neighbor bh lookup for dates without equity data
          if(d.bh==null&&bhDataForTooltip?.length){
            let bhi=0
            while(bhi<bhDataForTooltip.length-1&&bhDataForTooltip[bhi+1].time<param.time)bhi++
            const prev=bhi>0?bhDataForTooltip[bhi-1]:null
            const curr=bhDataForTooltip[bhi]
            const pick=prev&&Math.abs(new Date(prev.time)-new Date(param.time))<Math.abs(new Date(curr.time)-new Date(param.time))?prev:curr
            if(Math.abs(new Date(pick.time)-new Date(param.time))/86400000<5)d.bh=pick.value
          }
          lastTTStateRef.current={d,point:param.point,time:param.time}
        }
        const state=lastTTStateRef.current; if(!state){tt.style.display='none';return}
        const {d,point,time}=state
        const rows=[]
        rows.push(`<div style="color:#4a6a88;font-size:10px;margin-bottom:4px">${fmtDate(time)}</div>`)
        if(d.main!=null) rows.push(`<div style="display:flex;justify-content:space-between;gap:20px"><span style="color:${lc}">${isEquityMode?'Equity':'P&L'}</span><b style="color:${lc}">${d.main>=0?'':'-'}€${Math.abs(Math.round(d.main)).toLocaleString('es-ES')}</b></div>`)
        if(d.fx!=null)   rows.push(`<div style="display:flex;justify-content:space-between;gap:20px"><span style="color:#7a9bc0">Sin FX</span><b style="color:#7a9bc0">${d.fx>=0?'':'-'}€${Math.abs(Math.round(d.fx)).toLocaleString('es-ES')}</b></div>`)
        if(d.comm!=null) rows.push(`<div style="display:flex;justify-content:space-between;gap:20px"><span style="color:#ffd166">Sin Comm</span><b style="color:#ffd166">${d.comm>=0?'':'-'}€${Math.abs(Math.round(d.comm)).toLocaleString('es-ES')}</b></div>`)
        if(d.bh!=null)   rows.push(`<div style="display:flex;justify-content:space-between;gap:20px"><span style="color:#f59e0b">B&H SP500</span><b style="color:#f59e0b">${d.bh>=0?'':'-'}€${Math.abs(Math.round(d.bh)).toLocaleString('es-ES')}</b></div>`)
        if(rows.length<=1){tt.style.display='none';return}
        const cw=ref.current?.clientWidth||600
        tt.style.display='block'
        tt.style.left=((point.x+200>cw)?point.x-210:point.x+14)+'px'
        tt.style.top=Math.max(4,point.y-40)+'px'
        tt.innerHTML=rows.join('')
      })
      chart.timeScale().fitContent()
      if(syncRef?.current){
        syncRef.current.getRange=()=>{try{return chart.timeScale().getVisibleRange()}catch(_){return null}}
      }
      const ro = new ResizeObserver(()=>{
        if(!ref.current||!chartRef.current) return
        try{chart.applyOptions({width:ref.current.clientWidth,height:height||ref.current.clientHeight||200})}catch(_){}
      })
      ro.observe(ref.current)
      return ()=>ro.disconnect()
    })
    return ()=>{ cancelled=true; if(chartRef.current){try{chartRef.current.__syncCleanup?.()}catch(_){};try{chartRef.current.remove()}catch(_){};chartRef.current=null;mainSeriesRef.current=null} }
  },[curve, curveWithContribs, curveSinFx, curveSinComm, showSinFx, showSinComm, showWithContribs, contributions, showAportacion, showRetirada, showDividendo, showBH, curveBH, isEquityMode, showDD])

  // Secondary effect: update main series data only when activeCurve changes (e.g. float toggle)
  // This avoids full chart recreation and prevents "Object is disposed" errors
  useEffect(()=>{
    if(mainSeriesRef.current && chartRef.current){
      try{ mainSeriesRef.current.setData(activeCurve.map(p=>({time:p.date,value:p.value}))) }catch(_){}
    }
  },[activeCurve])

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
        {/* Mode toggle: P&L | Equity */}
        {onToggleMode&&(
          <span style={{display:'flex',borderRadius:4,overflow:'hidden',border:'1px solid #1a2d45',flexShrink:0}}>
            <button onClick={()=>!isEquityMode||onToggleMode()} style={{fontFamily:MONO,fontSize:9,padding:'2px 7px',border:'none',cursor:'pointer',background:!isEquityMode?'#1a2d45':'transparent',color:!isEquityMode?'#00d4ff':'#3d5a7a'}}>P&L</button>
            <button onClick={()=>isEquityMode||onToggleMode()} style={{fontFamily:MONO,fontSize:9,padding:'2px 7px',border:'none',cursor:'pointer',background:isEquityMode?'#1a2d45':'transparent',color:isEquityMode?'#00e5a0':'#3d5a7a'}}>Equity</button>
          </span>
        )}
        {/* Sin FX toggle — P&L mode only */}
        {!isEquityMode&&curveSinFx?.length>1&&(
          <button onClick={()=>setShowSinFx(v=>!v)} style={btnStyle(showSinFx,'#7a9bc0')} title={showSinFx?'Ocultar Sin FX':'Mostrar Sin FX'}>
            <span style={{display:'inline-block',width:10,height:2,background:'#7a9bc0',borderRadius:1,opacity:showSinFx?0.8:0.3,borderBottom:'1px dashed #7a9bc0'}}/> Sin FX
          </button>
        )}
        {/* Sin Comisiones toggle — P&L mode only */}
        {!isEquityMode&&curveSinComm?.length>1&&(
          <button onClick={()=>setShowSinComm(v=>!v)} style={btnStyle(showSinComm,'#ffd166')} title={showSinComm?'Ocultar Sin Comisiones':'Mostrar Sin Comisiones'}>
            <span style={{display:'inline-block',width:10,height:2,background:'#ffd166',borderRadius:1,opacity:showSinComm?0.8:0.3,borderBottom:'1px dashed #ffd166'}}/> Sin Comm.
          </button>
        )}
        {/* B&H SP500 toggle — both modes */}
        {onToggleBH&&(
          <button onClick={onToggleBH} style={btnStyle(showBH,'#f59e0b')} title={showBH?'Ocultar B&H SP500':'Mostrar Buy & Hold SP500'}>
            <span style={{display:'inline-block',width:10,height:2,background:'#f59e0b',borderRadius:1,opacity:showBH?0.8:0.3,borderBottom:'1px dashed #f59e0b'}}/> B&H SP500
          </button>
        )}
        {/* Max Drawdown toggle — equity mode only */}
        {isEquityMode&&activeCurve?.length>1&&(
          <button onClick={()=>setShowDD(v=>!v)} style={btnStyle(showDD,'#ff4d6d')} title={showDD?'Ocultar Max Drawdown':'Mostrar Max Drawdown'}>
            Max DD
          </button>
        )}
        {/* Float curve toggle — equity mode, always visible; lazy fetch on first click */}
        {isEquityMode&&(
          <button
            onClick={()=>{
              const next=!showFloat
              onToggleFloat?.(next)
              // First activation: trigger the lazy fetch if data not yet loaded
              if(next && !curveFloat && !floatLoading) onFirstFloat?.()
            }}
            style={btnStyle(showFloat,'#52c788')}
            title={floatLoading?'Cargando precios históricos…':showFloat?'Ocultar curva con flotante':'Mostrar curva con flotante'}
            disabled={floatLoading}
          >
            <span style={{display:'inline-block',width:10,height:2,background:'#52c788',borderRadius:1,opacity:showFloat?0.8:0.3,borderBottom:'1px dashed #52c788'}}/>{floatLoading?' ⟳':' Flotante'}
          </button>
        )}
        {/* Contribution type toggles — equity mode only */}
        {isEquityMode&&contributions?.length>0&&(()=>{
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
        <div ref={equityTooltipRef} style={{position:'absolute',display:'none',pointerEvents:'none',background:'rgba(8,12,20,0.96)',border:'1px solid #1a2d45',borderRadius:6,padding:'8px 12px',fontFamily:'"JetBrains Mono",monospace',fontSize:11,color:'#e2eaf5',zIndex:15,minWidth:160,boxShadow:'0 4px 20px rgba(0,0,0,0.5)'}}/>
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
        layout:{background:{color:'#0b0f1a'},textColor:'#7a9bc0',fontFamily:'-apple-system, BlinkMacSystemFont, Trebuchet MS, Roboto, Ubuntu, sans-serif'},
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
        title:'',
        lastValueVisible:false,
        priceLineVisible:false,
      }).setData(investData.map(p=>({time:p.date,value:p.capital})))
      track(investData.map(p=>({date:p.date,value:p.capital})),'cap')
      // Line — Profit acumulado (verde lima)
      chart.addLineSeries({
        color:'#aaff44',
        lineWidth:2,
        title:'',
        lastValueVisible:false,
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
        if(!ref.current||!chartRef.current) return
        try{
          const w=ref.current.clientWidth||300
          if(compact){
            chart.applyOptions({width:w})
          } else {
            const h=ref.current.getBoundingClientRect().height||ref.current.parentElement?.getBoundingClientRect().height||200
            chart.applyOptions({width:w,height:h})
          }
        }catch(_){}
      })
      ro.observe(ref.current)
      return ()=>ro.disconnect()
    })
    return ()=>{ if(chartRef.current){try{chartRef.current.__syncCleanup?.()}catch(_){};try{chartRef.current.remove()}catch(_){};chartRef.current=null} }
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
    <div style={{borderTop:'1px solid var(--border)',display:'flex',flexDirection:'column',height:'100%'}}>
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
      <div style={{position:'relative',flex:1,minHeight:0}}>
        <div ref={ref} style={{width:'100%',height:'100%',minHeight:200}}/>
        <div ref={investTooltipRef} style={{position:'absolute',display:'none',pointerEvents:'none',background:'rgba(8,12,20,0.96)',border:'1px solid #1a2d45',borderRadius:6,padding:'8px 12px',fontFamily:'"JetBrains Mono",monospace',fontSize:12,color:'#e2eaf5',zIndex:15,minWidth:160,boxShadow:'0 4px 20px rgba(0,0,0,0.5)'}}/>
      </div>
    </div>
  )
}
