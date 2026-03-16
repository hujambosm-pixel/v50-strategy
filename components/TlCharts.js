import { useRef, useEffect } from 'react'

export function TlEquityChart({ curve }) {
  const ref = useRef(null), chartRef = useRef(null)
  useEffect(()=>{
    if(!ref.current||!curve?.length) return
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
      chart.addLineSeries({color:'#2a3f55',lineWidth:1,lineStyle:LineStyle.Dotted,lastValueVisible:false,priceLineVisible:false})
        .setData([{time:curve[0].date,value:0},{time:curve[curve.length-1].date,value:0}])
      const finalVal = curve[curve.length-1].value
      const lineColor = finalVal >= 0 ? '#00e5a0' : '#ff4d6d'
      chart.addLineSeries({color:lineColor,lineWidth:2,lastValueVisible:true,priceLineVisible:false})
        .setData(curve.map(p=>({time:p.date,value:p.value})))
      chart.timeScale().fitContent()
      const ro = new ResizeObserver(()=>{ if(ref.current) chart.applyOptions({width:ref.current.clientWidth}) })
      ro.observe(ref.current)
      return ()=>ro.disconnect()
    })
    return ()=>{ if(chartRef.current){chartRef.current.remove();chartRef.current=null} }
  },[curve])
  return <div ref={ref} style={{minHeight:200,borderTop:'1px solid var(--border)'}}/>
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
