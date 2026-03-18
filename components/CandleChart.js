import { useRef, useEffect } from 'react'
import { MONO, f2, fmtDate } from '../lib/utils'

export default function CandleChart({ data, emaRPeriod, emaLPeriod, trades, maxDD, labelMode, rulerActive, onChartReady, onPriceAlarm, syncRef, savedRangeRef, chartHeight=480, priceAlarms=[], tlOpenTrades=[] }) {
  const containerRef=useRef(null), svgRef=useRef(null), legendRef=useRef(null), tooltipRef=useRef(null)
  const chartRef=useRef(null), candlesRef=useRef(null)
  const chartAliveRef=useRef(true)
  const rulerStart=useRef(null), rulerActiveR=useRef(rulerActive)
  useEffect(()=>{
    rulerActiveR.current=rulerActive
    if(!rulerActive){
      rulerStart.current=null
      svgRef.current?.querySelectorAll('.ruler-el').forEach(el=>el.remove())
    }
  },[rulerActive])

  useEffect(()=>{
    if(typeof window==='undefined'||!containerRef.current) return
    import('lightweight-charts').then(({createChart,CrosshairMode,LineStyle})=>{
      if(chartRef.current){chartRef.current.remove();chartRef.current=null}
      const chart=createChart(containerRef.current,{
        width:containerRef.current.clientWidth,height:chartHeight,
        layout:{background:{color:'#080c14'},textColor:'#7a9bc0'},
        grid:{vertLines:{color:'#0d1520'},horzLines:{color:'#0d1520'}},
        crosshair:{mode:CrosshairMode.Normal},
        rightPriceScale:{borderColor:'#1a2d45'},
        timeScale:{borderColor:'#1a2d45',timeVisible:true},
      })
      chartRef.current=chart

      const candles=chart.addCandlestickSeries({
        upColor:'#00e5a0',downColor:'#ff4d6d',
        borderUpColor:'#00e5a0',borderDownColor:'#ff4d6d',
        wickUpColor:'#00e5a0',wickDownColor:'#ff4d6d'
      })
      candles.setData(data.map(d=>({time:d.date,open:d.open,high:d.high,low:d.low,close:d.close})))
      candlesRef.current=candles

      // EMA series — sin title para no generar leyenda inferior
      const erS=chart.addLineSeries({color:'#ffd166',lineWidth:1,lastValueVisible:false,priceLineVisible:false})
      erS.setData(data.filter(d=>d.emaR!=null).map(d=>({time:d.date,value:d.emaR})))
      const elS=chart.addLineSeries({color:'#ff4d6d',lineWidth:1,lastValueVisible:false,priceLineVisible:false})
      elS.setData(data.filter(d=>d.emaL!=null).map(d=>({time:d.date,value:d.emaL})))

      // Líneas de trades — diagonal P&L + horizontales entrada/stop estilo TV
      trades.forEach(t=>{
        if(!t.entryDate||!t.exitDate) return
        // Diagonal P&L
        const ls=chart.addLineSeries({color:t.pnlPct>=0?'#00e5a0':'#ff4d6d',lineWidth:2,lastValueVisible:false,priceLineVisible:false,crosshairMarkerVisible:false})
        ls.setData([{time:t.entryDate,value:t.entryPx},{time:t.exitDate,value:t.exitPx}])
        // Línea horizontal blanca intermitente — nivel de entrada
        const entryLine=chart.addLineSeries({color:'rgba(255,255,255,0.65)',lineWidth:1,lineStyle:LineStyle.Dashed,lastValueVisible:false,priceLineVisible:false,crosshairMarkerVisible:false})
        entryLine.setData([{time:t.entryDate,value:t.entryPx},{time:t.exitDate,value:t.entryPx}])
        // Línea horizontal roja — stop loss
        if(t.stopPx!=null){
          const stopLine=chart.addLineSeries({color:'rgba(255,77,109,0.8)',lineWidth:2,lineStyle:LineStyle.Solid,lastValueVisible:false,priceLineVisible:false,crosshairMarkerVisible:false})
          stopLine.setData([{time:t.entryDate,value:t.stopPx},{time:t.exitDate,value:t.stopPx}])
        }
      })

      // ── Flechas de cruce EMA ──
      // shape:'circle' size:1 → punto invisible, solo muestra el texto diagonal ↗↘
      const marks=[]
      for(let i=1;i<data.length;i++){
        const p=data[i-1],c=data[i]
        if(!p.emaR||!p.emaL||!c.emaR||!c.emaL) continue
        if(p.emaR<p.emaL&&c.emaR>=c.emaL)
          marks.push({time:c.date,position:'belowBar',color:'#00e5a0',shape:'circle',size:1,text:'↗'})
        else if(p.emaR>p.emaL&&c.emaR<=c.emaL)
          marks.push({time:c.date,position:'aboveBar',color:'#ff4d6d',shape:'circle',size:1,text:'↘'})
      }
      if(marks.length) candles.setMarkers(marks)

      // ── Línea amarilla de entrada para posiciones abiertas (Tradelog) ──
      // tlOpenTrades usa campos de Supabase: entry_price, entry_date (distinto al backtest)
      tlOpenTrades.forEach(t=>{
        const px=parseFloat(t.entry_price)
        if(!px||isNaN(px)) return
        candles.createPriceLine({
          price: px,
          color: '#ffd166',
          lineWidth: 2,
          lineStyle: 0,
          axisLabelVisible: false,
          title: '',
        })
      })

      // ── Líneas de alertas de precio ──
      priceAlarms.forEach(alarm=>{
        if(!alarm.price_level) return
        const isAbove = alarm.condition_detail==='price_above'
        candles.createPriceLine({
          price: Number(alarm.price_level),
          color: isAbove ? '#00e5a0' : '#ff4d6d',
          lineWidth: 2,
          lineStyle: 0, // Solid
          axisLabelVisible: false,
          title: '',
        })
      })

      const ohlcMap={},erMap={},elMap={}
      data.forEach(d=>{ohlcMap[d.date]=d;if(d.emaR!=null)erMap[d.date]=d.emaR;if(d.emaL!=null)elMap[d.date]=d.emaL})

      // ── Imán Ctrl — snap al O/H/L/C más cercano (independiente de la regla) ──
      const snapToOHLC=(px,py,isCtrl)=>{
        if(!isCtrl) return {
          x:px, y:py,
          price:candlesRef.current?.coordinateToPrice(py),
          time:chart.timeScale().coordinateToTime(px)
        }
        const time=chart.timeScale().coordinateToTime(px)
        const bar=time&&ohlcMap[time]
        if(!bar) return {
          x:px, y:py,
          price:candlesRef.current?.coordinateToPrice(py),
          time
        }
        const candidates=[bar.open,bar.high,bar.low,bar.close]
        const snappedPrice=candidates.reduce((best,p)=>{
          const coord=candlesRef.current?.priceToCoordinate(p)
          const bestCoord=candlesRef.current?.priceToCoordinate(best)
          if(coord==null) return best
          return Math.abs(coord-py)<Math.abs(bestCoord-py)?p:best
        })
        const sy=candlesRef.current?.priceToCoordinate(snappedPrice)??py
        return {x:px, y:sy, price:snappedPrice, time}
      }

      // Punto visual del imán en SVG
      const NS2='http://www.w3.org/2000/svg'
      const snapDot=document.createElementNS(NS2,'circle')
      Object.entries({r:'4',fill:'none',stroke:'#ffd166','stroke-width':'1.5',display:'none',class:'snap-dot','pointer-events':'none'}).forEach(([k,v])=>snapDot.setAttribute(k,v))
      svgRef.current?.appendChild(snapDot)

      const ctrlState={pressed:false}
      const onKeyDown=(e)=>{if(e.key==='Control'){ctrlState.pressed=true}}
      const onKeyUp=(e)=>{if(e.key==='Control'){ctrlState.pressed=false;snapDot.setAttribute('display','none')}}
      window.addEventListener('keydown',onKeyDown)
      window.addEventListener('keyup',onKeyUp)
      const drawTradeLabels=()=>{
        const svg=svgRef.current; if(!svg||!candlesRef.current||!chartRef.current) return
        svg.querySelectorAll('.trade-label').forEach(el=>el.remove())
        const NS='http://www.w3.org/2000/svg'
        trades.forEach((t,idx)=>{
          if(!t.entryDate||!t.exitDate) return
          try {
            const ts=chartRef.current.timeScale()
            const x1=ts.timeToCoordinate(t.entryDate), x2=ts.timeToCoordinate(t.exitDate)
            if(x1==null||x2==null) return
            const midX=(x1+x2)/2
            // Precio medio del trade para la posición Y base
            const midPrice=(t.entryPx+t.exitPx)/2
            const pyBase=candlesRef.current.priceToCoordinate(midPrice)
            if(pyBase==null) return
            const isWin=t.pnlPct>=0
            const bc=isWin?'#00e5a0':'#ff4d6d'
            const g=document.createElementNS(NS,'g'); g.setAttribute('class','trade-label')

            const chartH=containerRef.current?.clientHeight||480
            const mkConnector=(y1start,y2end)=>{
              const l=document.createElementNS(NS,'line')
              Object.entries({x1:midX,y1:y1start,x2:midX,y2:y2end,
                stroke:bc,'stroke-width':'1','stroke-dasharray':'3,3','opacity':'0.45'
              }).forEach(([k,v])=>l.setAttribute(k,v))
              return l
            }

            if(labelMode===2){
              // ── Modo completo: % + € (sin fechas) ──
              const line1=`${t.pnlPct>=0?'+':''}${t.pnlPct.toFixed(2)}%`
              const line2=`€${t.pnlSimple>=0?'+':''}${Math.round(t.pnlSimple)}  ·  ${t.dias}d`
              const charW=8, BOX_H=40
              const w=Math.max(line1.length,line2.length)*charW+24
              const ZONE_TOP=22, ZONE_H=chartH*0.26
              const labelY=ZONE_TOP + (idx % 3)*(ZONE_H/3) + BOX_H/2
              const rect=document.createElementNS(NS,'rect')
              Object.entries({
                x:midX-w/2, y:labelY-BOX_H/2, width:w, height:BOX_H,
                fill:isWin?'rgba(0,229,160,0.18)':'rgba(255,77,109,0.18)',
                rx:'5', stroke:bc, 'stroke-width':'1.5'
              }).forEach(([k,v])=>rect.setAttribute(k,v))
              g.appendChild(rect)
              g.appendChild(mkConnector(labelY+BOX_H/2+2, Math.max(labelY+BOX_H/2+4,pyBase-4)))
              const mkT=(txt,y,sz)=>{
                const el=document.createElementNS(NS,'text')
                Object.entries({x:midX,y,'font-size':sz,'font-family':MONO,'text-anchor':'middle',fill:bc,'font-weight':'700'}).forEach(([k,v])=>el.setAttribute(k,v))
                el.textContent=txt; return el
              }
              g.appendChild(mkT(line1,labelY-4,'13'))
              g.appendChild(mkT(line2,labelY+12,'10.5'))

            } else if(labelMode===1){
              // ── Modo solo %: más grande, franja alta ──
              const ZONE_TOP=18, ZONE_H=chartH*0.22
              const labelY=ZONE_TOP + (idx % 4)*(ZONE_H/4) + 12
              const lbl=`${t.pnlPct>=0?'+':''}${t.pnlPct.toFixed(1)}%`
              const bw=lbl.length*8+14
              const bg=document.createElementNS(NS,'rect')
              Object.entries({
                x:midX-bw/2, y:labelY-14, width:bw, height:20,
                fill:isWin?'rgba(0,229,160,0.1)':'rgba(255,77,109,0.1)',
                rx:'3', stroke:bc, 'stroke-width':'0.7', opacity:'0.9'
              }).forEach(([k,v])=>bg.setAttribute(k,v))
              g.appendChild(bg)
              g.appendChild(mkConnector(labelY+6, pyBase-4))
              const txt=document.createElementNS(NS,'text')
              Object.entries({
                x:midX, y:labelY, 'font-size':'12', 'font-family':MONO,
                'text-anchor':'middle', fill:bc, 'font-weight':'700'
              }).forEach(([k,v])=>txt.setAttribute(k,v))
              txt.textContent=lbl
              g.appendChild(txt)
            }
            // labelMode===0 → no se añade nada al svg
            svg.appendChild(g)
          } catch(_){}
        })
      }

      // Redibujar etiquetas al hacer zoom/scroll — guardamos unsub para cleanup
      chartAliveRef.current=true
      const unsubLabels=chart.timeScale().subscribeVisibleTimeRangeChange(()=>{ if(chartAliveRef.current) setTimeout(()=>{ if(chartAliveRef.current) drawTradeLabels() },30) })

      // ── Regla SVG ──
      const svg=svgRef.current, NS='http://www.w3.org/2000/svg'
      const mk=(tag,attrs)=>{const el=document.createElementNS(NS,tag);Object.entries(attrs).forEach(([k,v])=>el.setAttribute(k,v));return el}
      const clearRuler=()=>{svg?.querySelectorAll('.ruler-el').forEach(el=>el.remove())}
      const drawRuler=(s,e)=>{
        clearRuler(); if(!svg) return
        const {x:x1,y:y1}=s,{x:x2,y:y2,price:pe,time:te}=e
        const diff=pe-s.price, pct=s.price>0?(diff/s.price)*100:0
        let days=0
        if(s.time&&te){
          const t1=typeof s.time==='string'?new Date(s.time).getTime():s.time*1000
          const t2=typeof te==='string'?new Date(te).getTime():te*1000
          days=Math.round(Math.abs(t2-t1)/86400000)
        }
        const addC=(el)=>{el.setAttribute('class','ruler-el');svg.appendChild(el);return el}
        addC(mk('line',{x1,y1,x2,y2:y1,stroke:'rgba(255,209,102,0.22)','stroke-width':'1','stroke-dasharray':'4,3'}))
        addC(mk('line',{x1:x2,y1,x2,y2,stroke:'rgba(255,209,102,0.22)','stroke-width':'1','stroke-dasharray':'4,3'}))
        addC(mk('line',{x1,y1,x2,y2,stroke:'#ffd166','stroke-width':'1.8'}))
        ;[[x1,y1],[x2,y2]].forEach(([cx,cy])=>addC(mk('circle',{cx,cy,r:'3',fill:'#ffd166',stroke:'#080c14','stroke-width':'1'})))
        const mx=(x1+x2)/2, lineAngle=Math.atan2(y2-y1,x2-x1)
        // Label: 26px perpendicular above the midpoint of the line
        const perp = lineAngle - Math.PI/2
        const lx = mx + Math.cos(perp)*26, ly = (y1+y2)/2 + Math.sin(perp)*26
        const label=`${days}d  ${diff>=0?'+':''}${pct.toFixed(2)}%`
        const bw=label.length*7+14
        addC(mk('rect',{x:lx-bw/2,y:ly-10,width:bw,height:16,fill:'rgba(8,12,20,0.96)',rx:'3',stroke:'#ffd166','stroke-width':'0.8'}))
        const txt=addC(mk('text',{x:lx,y:ly+1,fill:'#ffd166','font-size':'10','font-family':MONO,'text-anchor':'middle','dominant-baseline':'middle'}))
        txt.textContent=label
      }

      const getPoint=(px,py)=>snapToOHLC(px,py,ctrlState.pressed)
      const cnt=containerRef.current

      // ── Ruler: click sets start/end; dblclick anywhere clears; dblclick outside ruler = price alarm ──
      const rulerFixed=svgRef.current  // frozen ruler lives in svg; check if line exists
      const rulerExists=()=>svgRef.current?.querySelector('.ruler-el')!=null
      chart.subscribeClick(param=>{
        if(!rulerActiveR.current) return
        if(param.point==null) return
        const px=param.point.x, py=param.point.y
        const price=candlesRef.current?.coordinateToPrice(py)
        const time=param.time
        if(!rulerStart.current){
          rulerStart.current={x:px,y:py,price,time}
        } else {
          // freeze: keep SVG, clear start ref
          rulerStart.current=null
        }
      })
      chart.subscribeDblClick(param=>{
        if(rulerActiveR.current){
          // dblclick while ruler active → clear ruler
          rulerStart.current=null; clearRuler(); return
        }
        // dblclick while ruler inactive → price alarm
        if(onPriceAlarm&&param.point&&param.point.y!=null){
          const price=candlesRef.current?.coordinateToPrice(param.point.y)
          if(price!=null) onPriceAlarm(Math.round(price*100)/100)
        }
      })

      const onMove=e=>{
        const rect=containerRef.current.getBoundingClientRect()
        const px=e.clientX-rect.left,py=e.clientY-rect.top
        if(ctrlState.pressed){
          const snapped=snapToOHLC(px,py,true)
          snapDot.setAttribute('cx',String(snapped.x))
          snapDot.setAttribute('cy',String(snapped.y))
          snapDot.setAttribute('display','block')
        } else { snapDot.setAttribute('display','none') }
        if(rulerActiveR.current&&rulerStart.current) drawRuler(rulerStart.current,getPoint(px,py))
      }
      cnt.addEventListener('mousemove',onMove)

      // ── Leyenda OHLC + EMAs ──
      chart.subscribeCrosshairMove(param=>{
        const leg=legendRef.current
        if(leg){
          if(param.time){
            const b=ohlcMap[param.time],er=erMap[param.time],el=elMap[param.time]
            if(b){
              const chg=b.close-b.open,pct=(chg/b.open)*100,cc=chg>=0?'#00e5a0':'#ff4d6d'
              leg.innerHTML=
                `<span style="color:#7a9bc0;margin-right:8px">${b.date}</span>`+
                `<span style="margin-right:7px">O <b>${f2(b.open)}</b></span>`+
                `<span style="margin-right:7px">H <b style="color:#00e5a0">${f2(b.high)}</b></span>`+
                `<span style="margin-right:7px">L <b style="color:#ff4d6d">${f2(b.low)}</b></span>`+
                `<span style="margin-right:12px">C <b>${f2(b.close)}</b></span>`+
                `<span style="color:${cc};margin-right:14px">${chg>=0?'+':''}${f2(chg)} (${pct>=0?'+':''}${pct.toFixed(2)}%)</span>`+
                (er!=null?`<span style="margin-right:7px">EMA${emaRPeriod} <b style="color:#ffd166">${f2(er)}</b></span>`:'')+
                (el!=null?`<span>EMA${emaLPeriod} <b style="color:#ff4d6d">${f2(el)}</b></span>`:'')
            }
          } else leg.innerHTML=''
        }
        // Tooltip de trade (solo cuando etiquetas OFF)
        const tt=tooltipRef.current
        if(tt){
          if(!param.time||!param.point){tt.style.display='none';return}
          const trade=trades.find(t=>t.entryDate<=param.time&&param.time<=t.exitDate)
          if(!trade){tt.style.display='none';return}
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

      // addDays: extend 'to' past last bar → permanent right gap, immune to resets
      const GAP_DAYS = 12  // calendar days of right margin
      const addDays=(dateStr,n)=>{ const d=new Date(dateStr); d.setDate(d.getDate()+n); return d.toISOString().split('T')[0] }
      // Restore saved range OR default to last 3 months
      try {
        if(savedRangeRef?.current){
          const r=savedRangeRef.current
          const lastBar=data[data.length-1]
          const minTo=lastBar?addDays(lastBar.date,GAP_DAYS):r.to
          const finalTo=r.to>=minTo?r.to:minTo
          chart.timeScale().setVisibleRange({from:r.from, to:finalTo})
        } else {
          const lastBar = data[data.length-1]
          if(lastBar){
            const from = new Date(lastBar.date)
            from.setMonth(from.getMonth()-3)
            chart.timeScale().setVisibleRange({
              from: from.toISOString().split('T')[0],
              to:   addDays(lastBar.date, GAP_DAYS)
            })
          }
        }
      } catch(_){ chart.timeScale().fitContent() }
      // Save range whenever user zooms/scrolls — always bake in GAP_DAYS on 'to'
      chart.timeScale().subscribeVisibleTimeRangeChange(range=>{
        if(range && savedRangeRef){
          const lastBar=data[data.length-1]
          const toStr = typeof range.to==='object'
            ? `${range.to.year}-${String(range.to.month).padStart(2,'0')}-${String(range.to.day).padStart(2,'0')}`
            : String(range.to)
          const fromStr = typeof range.from==='object'
            ? `${range.from.year}-${String(range.from.month).padStart(2,'0')}-${String(range.from.day).padStart(2,'0')}`
            : String(range.from)
          // Always ensure 'to' is at least lastBar.date + GAP_DAYS
          const minTo = lastBar ? addDays(lastBar.date, GAP_DAYS) : toStr
          const finalTo = toStr >= minTo ? toStr : minTo
          savedRangeRef.current = {from: fromStr, to: finalTo}
        }
      })

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
        chart.__syncCleanup=()=>{
          try{unsub()}catch(_){}
          if(syncRef.current) syncRef.current.listeners=syncRef.current.listeners.filter(e=>e.id!==syncId)
        }
      }

      // Exponer navigateTo + fitAll + captureChart
      if(onChartReady) onChartReady({
        captureJpg:(wrapEl, captureSymbol, entryPrice)=>{
          try {
            // chart.takeScreenshot() returns HTMLCanvasElement with full chart (axes + candles)
            const chartCanvas = chart.takeScreenshot()
            if(!chartCanvas) return null

            const cw = chartCanvas.width, ch = chartCanvas.height

            // Build final canvas: background + chart + legend overlay
            const out = document.createElement('canvas')
            // Add header height (≈36px) on top
            const HEADER_H = 36
            out.width  = cw
            out.height = ch + HEADER_H
            const ctx = out.getContext('2d')

            // Background
            ctx.fillStyle = '#080c14'
            ctx.fillRect(0, 0, out.width, out.height)

            // Header bar with symbol + price info
            ctx.fillStyle = '#0d1520'
            ctx.fillRect(0, 0, out.width, HEADER_H)
            ctx.fillStyle = '#1a2d45'
            ctx.fillRect(0, HEADER_H - 1, out.width, 1)

            // Header text: SYMBOL  |  date  O H L C
            const lastBar = data[data.length - 1]
            if(lastBar) {
              ctx.font = 'bold 13px "JetBrains Mono", monospace'
              ctx.fillStyle = '#00d4ff'
              const displaySym = captureSymbol || emaRPeriod+'·'+emaLPeriod
              ctx.fillText(displaySym, 10, 22)
              const symEnd = ctx.measureText(displaySym).width + 16
              ctx.font = '10px "JetBrains Mono", monospace'
              ctx.fillStyle = '#3d5a7a'
              ctx.fillText(lastBar.date || '', symEnd, 22)
              const dateEnd = symEnd + ctx.measureText(lastBar.date || '').width + 14
              ctx.font = '11px "JetBrains Mono", monospace'
              const chg = lastBar.close - lastBar.open
              const pct = (chg / lastBar.open * 100).toFixed(2)
              const ohlc = [
                ['O', lastBar.open?.toFixed(2), '#e2eaf5'],
                ['H', lastBar.high?.toFixed(2), '#00e5a0'],
                ['L', lastBar.low?.toFixed(2),  '#ff4d6d'],
                ['C', lastBar.close?.toFixed(2),'#e2eaf5'],
                [chg>=0?`+${pct}%`:`${pct}%`, '', chg>=0?'#00e5a0':'#ff4d6d'],
              ]
              let x = dateEnd + 8
              ohlc.forEach(([label, val, col])=>{
                if(val) {
                  ctx.fillStyle = '#5a7a95'
                  ctx.fillText(label+' ', x, 22)
                  x += ctx.measureText(label+' ').width
                  ctx.fillStyle = col
                  ctx.fillText(val+'  ', x, 22)
                  x += ctx.measureText(val+'  ').width
                } else {
                  ctx.fillStyle = col
                  ctx.fillText(label+'  ', x, 22)
                  x += ctx.measureText(label+'  ').width
                }
              })
            }

            // Draw chart below header
            ctx.drawImage(chartCanvas, 0, HEADER_H)

            // Línea amarilla de precio de entrada
            if(entryPrice && candlesRef.current) {
              try {
                const py = candlesRef.current.priceToCoordinate(entryPrice)
                if(py != null) {
                  const lineY = HEADER_H + py
                  ctx.strokeStyle = '#ffd166'
                  ctx.lineWidth = 1.5
                  ctx.setLineDash([6, 4])
                  ctx.beginPath()
                  ctx.moveTo(0, lineY)
                  ctx.lineTo(cw, lineY)
                  ctx.stroke()
                  ctx.setLineDash([])
                  // Etiqueta precio
                  ctx.font = 'bold 10px "JetBrains Mono", monospace'
                  const priceLabel = entryPrice.toFixed(2)
                  const lw = ctx.measureText(priceLabel).width + 8
                  ctx.fillStyle = 'rgba(255,209,102,0.18)'
                  ctx.fillRect(4, lineY - 9, lw, 13)
                  ctx.strokeStyle = '#ffd166'
                  ctx.lineWidth = 0.7
                  ctx.setLineDash([])
                  ctx.strokeRect(4, lineY - 9, lw, 13)
                  ctx.fillStyle = '#ffd166'
                  ctx.fillText(priceLabel, 8, lineY + 2)
                }
              } catch(_){}
            }

            return out.toDataURL('image/jpeg', 0.93)
          } catch(e) {
            // Fallback: composite ALL canvases in the container
            try {
              const canvases = Array.from(containerRef.current?.querySelectorAll('canvas')||[])
              if(!canvases.length) return null
              // Find the largest canvas (main chart canvas)
              const main = canvases.reduce((a,b)=>b.width*b.height>a.width*a.height?b:a)
              const w = main.width, h = main.height
              const out = document.createElement('canvas')
              out.width = w; out.height = h
              const ctx = out.getContext('2d')
              ctx.fillStyle = '#080c14'
              ctx.fillRect(0,0,w,h)
              // Draw all same-size canvases (layers)
              canvases.filter(c=>c.width===w&&c.height===h)
                .forEach(c=>{ try{ ctx.drawImage(c,0,0) }catch(_){} })
              return out.toDataURL('image/jpeg', 0.93)
            } catch(_){ return null }
          }
        },
        scrollBy:(bars)=>{ try{ chart.timeScale().scrollToPosition(chart.timeScale().scrollPosition()-bars, false) }catch(_){} },
        navigateTo:(entryDate,exitDate)=>{
          try{
            const pad=Math.max(5,Math.round((new Date(exitDate)-new Date(entryDate))/86400000*0.3))
            const d1=new Date(entryDate); d1.setDate(d1.getDate()-pad)
            const d2=new Date(exitDate); d2.setDate(d2.getDate()+pad+6)
            chart.timeScale().setVisibleRange({from:d1.toISOString().split('T')[0],to:d2.toISOString().split('T')[0]})
          }catch(_){}
        },
        fitAll:()=>{ try{ const lb=data[data.length-1]; if(lb){ const fr=data[0]; chart.timeScale().setVisibleRange({from:fr.date,to:addDays(lb.date,GAP_DAYS)}) } else chart.timeScale().fitContent() }catch(_){} },
        showRecent:(months)=>{
          try{
            const lastBar=data[data.length-1]
            if(!lastBar) return
            const from=new Date(lastBar.date)
            from.setMonth(from.getMonth()-(months||3))
            chart.timeScale().setVisibleRange({from:from.toISOString().split('T')[0],to:addDays(lastBar.date,GAP_DAYS)})
          }catch(_){}
        },
        setRange:(from,to)=>{ try{ chart.timeScale().setVisibleRange({from,to}) }catch(_){} },
        showEntryLine:(entryDate, entryPrice, opts={})=>{
          // opts.permanent=true → no auto-remove; opts.label → texto eje precio
          if(!entryDate||!entryPrice) return
          try{
            const ep = parseFloat(entryPrice)
            const label = opts.label || '● ENTRADA'
            const color = opts.color || '#ffd166'
            // Línea horizontal fina en el precio de entrada
            const priceLine = candlesRef.current.createPriceLine({
              price: ep,
              color,
              lineWidth: 1,
              lineStyle: 0,   // sólida
              axisLabelVisible: true,
              title: label,
            })
            if(opts.permanent) return priceLine  // caller keeps reference for cleanup
            // No-permanent: auto-limpiar después de 6s
            setTimeout(()=>{ try{ candlesRef.current.removePriceLine(priceLine) }catch(_){} }, 6000)
          }catch(e){}
        },
        // Dibuja líneas permanentes de entradas abiertas del símbolo actual
        openEntryLinesRef: { current: [] },
        setOpenTradeLines:(openTrades)=>{
          if(!candlesRef.current) return
          // Limpiar líneas anteriores
          const prevLines = chartRef.current?._openEntryLines || []
          prevLines.forEach(pl=>{ try{ candlesRef.current.removePriceLine(pl) }catch(_){} })
          const newLines = openTrades.map(t=>{
            try{
              const ep = parseFloat(t.entry_price)
              if(!ep) return null
              const sym = t.symbol?.toUpperCase()
              return candlesRef.current.createPriceLine({
                price: ep,
                color: '#ffd166',
                lineWidth: 1,
                lineStyle: 0,
                axisLabelVisible: true,
                title: `${sym} ${ep.toFixed(2)} ●`,
              })
            }catch(_){ return null }
          }).filter(Boolean)
          if(chartRef.current) chartRef.current._openEntryLines = newLines
        }
      })

      const ro=new ResizeObserver(()=>{
        if(!containerRef.current||!chartRef.current) return
        try{chart.applyOptions({width:containerRef.current.clientWidth})}catch(_){}
        setTimeout(drawTradeLabels,50)
      })
      ro.observe(containerRef.current)
      setTimeout(drawTradeLabels,200)

      return()=>{chartAliveRef.current=false;try{unsubLabels()}catch(_){};cnt.removeEventListener('mousemove',onMove);window.removeEventListener('keydown',onKeyDown);window.removeEventListener('keyup',onKeyUp);ro.disconnect()}
    })
    return()=>{chartAliveRef.current=false;if(chartRef.current){try{chartRef.current.__syncCleanup?.()}catch(_){};chartRef.current.remove();chartRef.current=null}}
  },[data,emaRPeriod,emaLPeriod,trades,maxDD,labelMode])

  // Apply height changes without recreating chart
  useEffect(()=>{
    if(chartRef.current) try{chartRef.current.applyOptions({height:chartHeight})}catch(_){}
  },[chartHeight])

  return (
    <div style={{position:'relative'}}>
      <div ref={legendRef} style={{position:'absolute',top:8,left:8,zIndex:10,fontFamily:MONO,fontSize:12,color:'#7a9bc0',background:'rgba(8,12,20,0.82)',padding:'4px 10px',borderRadius:4,pointerEvents:'none',whiteSpace:'nowrap'}}/>
      <div ref={containerRef} style={{minHeight:480}}/>
      <svg ref={svgRef} style={{position:'absolute',top:0,left:0,width:'100%',height:'100%',pointerEvents:'none',zIndex:5}}/>
      <div ref={tooltipRef} style={{position:'absolute',display:'none',pointerEvents:'none',background:'rgba(8,12,20,0.96)',border:'1px solid #00e5a0',borderRadius:6,padding:'8px 12px',fontFamily:MONO,fontSize:12,color:'#e2eaf5',zIndex:15,minWidth:200,boxShadow:'0 4px 20px rgba(0,0,0,0.5)'}}/>
    </div>
  )
}
