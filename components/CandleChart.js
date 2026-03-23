import { useRef, useEffect } from 'react'
import { MONO, f2, fmtDate } from '../lib/utils'

// ── Risk primitive: bands + labels + R:R (TradingView Long Position style) ──
function createRiskPrimitive(configRef) {
  return {
    _configRef: configRef,
    _series: null,
    attached(p) { this._series = p.series },
    detached()  { this._series = null },
    paneViews() {
      const self = this
      return [{
        renderer() {
          return {
            draw(target) {
              if (!self._series) return
              const cfg = self._configRef.current
              if (!cfg?.entry) return
              const { entry, stop, tp, shares=0, tradeRiskEur=0, rrRatio=0 } = cfg
              target.useBitmapCoordinateSpace(scope => {
                const ctx = scope.context
                const vpr = scope.verticalPixelRatio
                const hpr = scope.horizontalPixelRatio
                const W = scope.bitmapSize.width
                const yE = self._series.priceToCoordinate(entry)
                const yS = stop ? self._series.priceToCoordinate(stop) : null
                const yT = tp   ? self._series.priceToCoordinate(tp)   : null
                if (yE == null) return
                // ── Shaded bands ──
                const band = (y1, y2, color) => {
                  if (y1==null||y2==null) return
                  ctx.globalAlpha = 0.13
                  ctx.fillStyle = color
                  ctx.fillRect(0, Math.min(y1,y2)*vpr, W, Math.abs(y1-y2)*vpr)
                  ctx.globalAlpha = 1
                }
                if (yS!=null) band(yE, yS, '#ff4d6d')
                if (yT!=null) band(yE, yT, '#00e5a0')
                // ── Label boxes ──
                const lh  = Math.round(16 * vpr)
                const lw  = Math.round(162 * hpr)
                const lx  = W - lw - Math.round(72 * hpr)
                const lbl = (y, color, main, sub) => {
                  if (y==null) return
                  const yp = y * vpr
                  ctx.fillStyle = color + '28'
                  ctx.fillRect(lx, yp - lh/2, lw, lh)
                  ctx.strokeStyle = color + 'cc'
                  ctx.lineWidth = Math.max(1, hpr * 0.8)
                  ctx.strokeRect(lx, yp - lh/2, lw, lh)
                  ctx.font = `bold ${Math.round(8.5*hpr)}px monospace`
                  ctx.fillStyle = color
                  ctx.textAlign = 'left'
                  ctx.textBaseline = 'middle'
                  ctx.fillText(main, lx + 4*hpr, yp)
                  if (sub) {
                    ctx.font = `${Math.round(7.5*hpr)}px monospace`
                    ctx.fillStyle = color + 'cc'
                    ctx.textAlign = 'right'
                    ctx.fillText(sub, lx + lw - 4*hpr, yp)
                  }
                }
                lbl(yE, '#00d4ff', `↔ ENTRADA  ${entry.toFixed(2)}`, '')
                if (yS!=null && stop) {
                  const dp = ((stop-entry)/entry*100).toFixed(2)+'%'
                  const ls = shares>0 ? ` -€${Math.round(tradeRiskEur)}` : ''
                  lbl(yS, '#ff4d6d', `▼ STOP  ${stop.toFixed(2)}`, dp+ls)
                }
                if (yT!=null && tp) {
                  const dp = '+'+((tp-entry)/entry*100).toFixed(2)+'%'
                  const gs = shares>0&&rrRatio>0 ? ` +€${Math.round(tradeRiskEur*rrRatio)}` : ''
                  lbl(yT, '#00e5a0', `▲ TP  ${tp.toFixed(2)}`, dp+gs)
                }
                // ── R:R ratio ──
                if (yT!=null && rrRatio>0) {
                  const my = ((yE+yT)/2) * vpr
                  ctx.font = `bold ${Math.round(10*hpr)}px monospace`
                  ctx.fillStyle = 'rgba(0,229,160,0.85)'
                  ctx.textAlign = 'center'
                  ctx.textBaseline = 'middle'
                  ctx.fillText(`R:R  1 : ${rrRatio.toFixed(2)}`, W*0.38, my)
                }
              })
            }
          }
        },
        zOrder() { return 'normal' }
      }]
    }
  }
}

export default function CandleChart({ data, emaRPeriod, emaLPeriod, trades, maxDD, labelMode, rulerActive, onChartReady, onPriceAlarm, onAlarmPriceDrag, syncRef, savedRangeRef, chartHeight=480, priceAlarms=[], tlOpenTrades=[], ackedAlarms, externalLegendRef, riskMode=null, onRiskPrice, riskLevels=null, onRiskLevelChange, fillHeight=false }) {
  const containerRef=useRef(null), svgRef=useRef(null), legendRef=useRef(null), tooltipRef=useRef(null)
  const activeLegendRef = externalLegendRef || legendRef
  const chartRef=useRef(null), candlesRef=useRef(null)
  const chartAliveRef=useRef(true)
  const rulerStart=useRef(null), rulerActiveR=useRef(rulerActive)
  const priceAlarmLinesRef=useRef([])    // [{alarmId, priceLine, price}]
  const dragRef=useRef(null)             // {lineObj} while dragging
  const priceAlarmTimersRef=useRef([])   // setInterval IDs for blinking
  const lastCloseRef=useRef(null)        // último close cargado
  const riskLinesRef=useRef([null,null,null]) // [entryLine, stopLine, tpLine]
  const riskBandSeriesRef=useRef(null)         // dummy LineSeries hosting risk primitive
  const riskConfigRef=useRef({entry:null,stop:null,tp:null,shares:0,tradeRiskEur:0,rrRatio:0})
  const onRiskLevelChangeRef=useRef(onRiskLevelChange)
  const fillHeightRef=useRef(fillHeight)
  useEffect(()=>{ fillHeightRef.current=fillHeight },[fillHeight])
  useEffect(()=>{ onRiskLevelChangeRef.current=onRiskLevelChange },[onRiskLevelChange])
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
          axisLabelVisible: true,
          title: '',
        })
      })

      // ── Líneas de alertas de precio — gestionadas en efecto separado ──

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
              // ── Modo completo: # · % + € ──
              const num=`#${idx+1}`
              const line1=`${num} · ${t.pnlPct>=0?'+':''}${t.pnlPct.toFixed(2)}%`
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
              const lbl=`#${idx+1} ${t.pnlPct>=0?'+':''}${t.pnlPct.toFixed(1)}%`
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

      // ── Drag de líneas de precio de alarma ──
      const DRAG_HIT=8 // px de tolerancia
      const onMouseDown=e=>{
        if(rulerActiveR.current) return
        const rect=containerRef.current.getBoundingClientRect()
        const py=e.clientY-rect.top
        let nearest=null,nearestDist=Infinity
        if(candlesRef.current){
          priceAlarmLinesRef.current.forEach(lineObj=>{
            const lineY=candlesRef.current.priceToCoordinate(lineObj.price)
            if(lineY==null) return
            const dist=Math.abs(py-lineY)
            if(dist<DRAG_HIT&&dist<nearestDist){nearest=lineObj;nearestDist=dist}
          })
        }
        if(nearest){
          dragRef.current={lineObj:nearest}
          // Deshabilitar scroll/zoom del chart mientras dura el drag
          chart.applyOptions({handleScroll:false,handleScale:false})
          e.preventDefault();e.stopPropagation()
        }
      }
      const onMouseUp=()=>{
        // Siempre restaurar scroll (safety net aunque no haya drag activo)
        try{chart.applyOptions({handleScroll:true,handleScale:true})}catch(_){}
        if(dragRef.current){
          const{lineObj}=dragRef.current
          if(onAlarmPriceDrag) onAlarmPriceDrag(lineObj.alarmId,Math.round(lineObj.price*100)/100)
          dragRef.current=null
          if(containerRef.current) containerRef.current.style.cursor=''
        }
      }
      cnt.addEventListener('mousedown',onMouseDown)
      // mouseup en window para capturarlo aunque el ratón salga del chart
      window.addEventListener('mouseup',onMouseUp)

      const onMove=e=>{
        const rect=containerRef.current.getBoundingClientRect()
        const px=e.clientX-rect.left,py=e.clientY-rect.top
        // Drag activo: mover línea de precio
        if(dragRef.current&&candlesRef.current){
          const newPrice=candlesRef.current.coordinateToPrice(py)
          if(newPrice!=null){
            const rounded=Math.round(newPrice*100)/100
            const{lineSeries,firstDate,lastDate}=dragRef.current.lineObj
            try{lineSeries.setData([{time:firstDate,value:rounded},{time:lastDate,value:rounded}])}catch(_){}
            dragRef.current.lineObj.price=rounded
          }
          return
        }
        // Cursor hint cuando estamos cerca de una línea de alarma
        if(candlesRef.current&&!rulerActiveR.current){
          let nearAlarm=false
          priceAlarmLinesRef.current.forEach(lineObj=>{
            const lineY=candlesRef.current.priceToCoordinate(lineObj.price)
            if(lineY!=null&&Math.abs(py-lineY)<DRAG_HIT) nearAlarm=true
          })
          containerRef.current.style.cursor=nearAlarm?'ns-resize':''
        }
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
        const leg=activeLegendRef.current
        if(leg){
          if(param.time){
            const b=ohlcMap[param.time],er=erMap[param.time],el=elMap[param.time]
            if(b){
              const chg=b.close-b.open,pct=(chg/b.open)*100,cc=chg>=0?'#00e5a0':'#ff4d6d'
              leg.innerHTML=
                `<span style="margin-right:7px">O <b>${f2(b.open)}</b></span>`+
                `<span style="margin-right:7px">H <b style="color:#00e5a0">${f2(b.high)}</b></span>`+
                `<span style="margin-right:7px">L <b style="color:#ff4d6d">${f2(b.low)}</b></span>`+
                `<span style="margin-right:10px">C <b>${f2(b.close)}</b></span>`+
                `<span style="color:${cc};margin-right:12px">${chg>=0?'+':''}${f2(chg)} (${pct>=0?'+':''}${pct.toFixed(2)}%)</span>`+
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
        try{
          const opts={width:containerRef.current.clientWidth}
          if(fillHeightRef.current){const h=containerRef.current.clientHeight;if(h>0)opts.height=h}
          chart.applyOptions(opts)
        }catch(_){}
        setTimeout(drawTradeLabels,50)
      })
      ro.observe(containerRef.current)
      setTimeout(drawTradeLabels,200)

      return()=>{chartAliveRef.current=false;try{unsubLabels()}catch(_){};cnt.removeEventListener('mousemove',onMove);cnt.removeEventListener('mousedown',onMouseDown);window.removeEventListener('mouseup',onMouseUp);window.removeEventListener('keydown',onKeyDown);window.removeEventListener('keyup',onKeyUp);ro.disconnect()}
    })
    return()=>{chartAliveRef.current=false;if(chartRef.current){try{chartRef.current.__syncCleanup?.()}catch(_){};chartRef.current.remove();chartRef.current=null}}
  },[data,emaRPeriod,emaLPeriod,trades,maxDD,labelMode])

  // Mantener lastCloseRef actualizado sin recrear el chart
  useEffect(()=>{
    if(data?.length) lastCloseRef.current=data[data.length-1]?.close
  },[data])

  // Apply height changes without recreating chart
  useEffect(()=>{
    if(chartRef.current) try{chartRef.current.applyOptions({height:chartHeight})}catch(_){}
  },[chartHeight])

  // ── Líneas de alertas de precio — addLineSeries para forzar eje a incluir el nivel ──
  useEffect(()=>{
    const chart=chartRef.current
    if(!chart||!data?.length) return
    // Limpiar timers y series anteriores
    priceAlarmTimersRef.current.forEach(id=>clearInterval(id))
    priceAlarmTimersRef.current=[]
    priceAlarmLinesRef.current.forEach(({lineSeries})=>{try{chart.removeSeries(lineSeries)}catch(_){}})
    const firstDate=data[0]?.date
    const lastDate=data[data.length-1]?.date
    if(!firstDate||!lastDate){priceAlarmLinesRef.current=[];return}
    const lastClose=lastCloseRef.current
    priceAlarmLinesRef.current=priceAlarms
      .filter(a=>a.price_level)
      .map(alarm=>{
        const isAbove=alarm.condition_detail==='price_above'
        const actualColor=isAbove?'#00e5a0':'#ff4d6d'
        const level=Number(alarm.price_level)
        const triggered=lastClose!=null&&(isAbove?lastClose>=level:lastClose<=level)
        const ackKey=`${alarm.symbol}::${alarm.id}`
        const isAcked=ackedAlarms instanceof Set&&ackedAlarms.has(ackKey)
        const shouldBlink=triggered&&!isAcked
        // addLineSeries: la serie forma parte de los datos → el eje siempre incluye el nivel
        const lineSeries=chart.addLineSeries({
          color:actualColor,lineWidth:2,
          lastValueVisible:true,priceLineVisible:false,crosshairMarkerVisible:false,
        })
        lineSeries.setData([{time:firstDate,value:level},{time:lastDate,value:level}])
        if(shouldBlink){
          let vis=true
          const tid=setInterval(()=>{
            try{lineSeries.applyOptions({color:vis?actualColor:'rgba(0,0,0,0)'})}catch(_){}
            vis=!vis
          },500)
          priceAlarmTimersRef.current.push(tid)
        }
        return{alarmId:alarm.id,lineSeries,price:level,firstDate,lastDate}
      })
    return()=>{
      priceAlarmTimersRef.current.forEach(id=>clearInterval(id))
      priceAlarmTimersRef.current=[]
    }
  },[priceAlarms,ackedAlarms,data])

  // ── Risk levels: price lines + labels + bands (update-in-place to avoid flicker) ──
  useEffect(()=>{
    const chart   = chartRef.current
    const candles = candlesRef.current
    if (!chart || !candles) return

    const cleanup = () => {
      riskLinesRef.current.forEach((pl,i)=>{ if(pl){ try{candles.removePriceLine(pl)}catch(_){}; riskLinesRef.current[i]=null } })
      if(riskBandSeriesRef.current){ try{chart.removeSeries(riskBandSeriesRef.current)}catch(_){}; riskBandSeriesRef.current=null }
      Object.assign(riskConfigRef.current,{entry:null,stop:null,tp:null,shares:0,tradeRiskEur:0,rrRatio:0})
    }

    if (!riskLevels?.entry) { cleanup(); return }

    const { entry, stop=null, tp=null, shares=0, tradeRiskEur=0, rrRatio=0 } = riskLevels
    Object.assign(riskConfigRef.current, { entry, stop, tp, shares, tradeRiskEur, rrRatio })

    // Update or create a price line (update-in-place avoids flicker)
    const upsertLine = (idx, price, color, title) => {
      if (!price) {
        if (riskLinesRef.current[idx]) { try{candles.removePriceLine(riskLinesRef.current[idx])}catch(_){}; riskLinesRef.current[idx]=null }
        return
      }
      if (riskLinesRef.current[idx]) {
        try { riskLinesRef.current[idx].applyOptions({ price, title }); return } catch(_) { riskLinesRef.current[idx]=null }
      }
      try { riskLinesRef.current[idx]=candles.createPriceLine({price,color,lineWidth:2,lineStyle:0,axisLabelVisible:true,title}) } catch(_) {}
    }
    upsertLine(0, entry,  '#00d4ff', `Entrada: ${entry.toFixed(2)}`)
    upsertLine(1, stop,   '#ff4d6d', stop ? `Stop: ${stop.toFixed(2)}`     : '')
    upsertLine(2, tp,     '#00e5a0', tp   ? `Objetivo: ${tp.toFixed(2)}`   : '')

    // Create primitive once (it reads from riskConfigRef which we mutate in place)
    if (!riskBandSeriesRef.current && data?.length) {
      const fd=data[0].date, ld=data[data.length-1].date
      try {
        const dummy=chart.addLineSeries({lastValueVisible:false,priceLineVisible:false,crosshairMarkerVisible:false,visible:false,color:'transparent'})
        dummy.setData([{time:fd,value:entry},{time:ld,value:entry}])
        dummy.attachPrimitive(createRiskPrimitive(riskConfigRef))
        riskBandSeriesRef.current=dummy
      } catch(_) {}
    }
  // eslint-disable-next-line
  },[riskLevels, data])

  // ── Risk drag: mousedown near a line → drag to update prices ──
  useEffect(()=>{
    const container = containerRef.current
    if (!container) return
    let dragging = null // 'entry'|'stop'|'tp'|null

    const snap = (rawPrice, e, x) => {
      if (!e.ctrlKey || !data?.length || !chartRef.current) return rawPrice
      try {
        const time = chartRef.current.timeScale().coordinateToTime(x)
        if (!time) return rawPrice
        const bar = data.find(d=>d.date===time)
        if (!bar) return rawPrice
        const ohlc = [bar.open, bar.high, bar.low, bar.close]
        return ohlc.reduce((a,b)=>Math.abs(b-rawPrice)<Math.abs(a-rawPrice)?b:a)
      } catch(_) { return rawPrice }
    }

    const onDown = (e) => {
      const cfg = riskConfigRef.current
      if (!cfg?.entry) return
      const rect = container.getBoundingClientRect()
      const y = e.clientY - rect.top
      const THRESH = 8
      const candles = candlesRef.current
      if (!candles) return
      for (const [type, price] of [['entry',cfg.entry],['stop',cfg.stop],['tp',cfg.tp]]) {
        if (!price) continue
        const lineY = candles.priceToCoordinate(price)
        if (lineY!=null && Math.abs(y-lineY)<=THRESH) {
          dragging = type
          e.preventDefault()
          e.stopPropagation()
          container.style.cursor = 'ns-resize'
          break
        }
      }
    }

    const onMove = (e) => {
      if (!dragging) return
      const candles = candlesRef.current
      if (!candles) return
      const rect = container.getBoundingClientRect()
      const y = e.clientY - rect.top
      const x = e.clientX - rect.left
      let price = candles.coordinateToPrice(y)
      if (price==null) return
      price = snap(price, e, x)
      price = parseFloat(price.toFixed(4))

      // Validate: stop must be below entry, tp above
      const cfg = riskConfigRef.current
      if (dragging==='stop'  && cfg.entry && price>=cfg.entry) return
      if (dragging==='tp'    && cfg.entry && price<=cfg.entry) return

      // Update config ref (read by primitive on next repaint)
      riskConfigRef.current[dragging] = price
      // Update price line directly (triggers LWC repaint which redraws primitive)
      const lineIdx = {entry:0,stop:1,tp:2}
      const titles  = {entry:`Entrada: ${price.toFixed(2)}`,stop:`Stop: ${price.toFixed(2)}`,tp:`Objetivo: ${price.toFixed(2)}`}
      const pl = riskLinesRef.current[lineIdx[dragging]]
      if (pl) try { pl.applyOptions({price, title: titles[dragging]}) } catch(_) {}
      // Sync to form (real-time update)
      onRiskLevelChangeRef.current?.(dragging, price)
    }

    const onUp = () => {
      if (dragging) { dragging=null; container.style.cursor='' }
    }

    container.addEventListener('mousedown', onDown, true)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      container.removeEventListener('mousedown', onDown, true)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  // eslint-disable-next-line
  }, [data])

  return (
    <div style={{position:'relative'}}>
      <div ref={legendRef} style={{position:'absolute',top:8,left:8,zIndex:10,fontFamily:MONO,fontSize:12,color:'#7a9bc0',background:'rgba(8,12,20,0.82)',padding:'4px 10px',borderRadius:4,pointerEvents:'none',whiteSpace:'nowrap',display:externalLegendRef?'none':'block'}}/>
      <div ref={containerRef} style={fillHeight?{height:'100%',minHeight:0}:{minHeight:480}}/>
      <svg ref={svgRef} style={{position:'absolute',top:0,left:0,width:'100%',height:'100%',pointerEvents:'none',zIndex:5}}/>
      <div ref={tooltipRef} style={{position:'absolute',display:'none',pointerEvents:'none',background:'rgba(8,12,20,0.96)',border:'1px solid #00e5a0',borderRadius:6,padding:'8px 12px',fontFamily:MONO,fontSize:12,color:'#e2eaf5',zIndex:15,minWidth:200,boxShadow:'0 4px 20px rgba(0,0,0,0.5)'}}/>
      {/* ── Overlay de captura de clics en modo risk ── */}
      {riskMode&&(
        <div
          onClick={e=>{
            if(!candlesRef.current||!containerRef.current) return
            const rect=containerRef.current.getBoundingClientRect()
            let price=candlesRef.current.coordinateToPrice(e.clientY-rect.top)
            if(price==null) return
            // Magnet: snap to nearest OHLC when Ctrl is held
            if(e.ctrlKey&&data?.length&&chartRef.current){
              try{
                const x=e.clientX-rect.left
                const time=chartRef.current.timeScale().coordinateToTime(x)
                const bar=time&&data.find(d=>d.date===time)
                if(bar){const ohlc=[bar.open,bar.high,bar.low,bar.close];price=ohlc.reduce((a,b)=>Math.abs(b-price)<Math.abs(a-price)?b:a)}
              }catch(_){}
            }
            if(onRiskPrice) onRiskPrice(price)
            e.stopPropagation()
          }}
          style={{position:'absolute',inset:0,zIndex:20,cursor:'crosshair',
            display:'flex',alignItems:'flex-end',justifyContent:'center',paddingBottom:10,
            background:'transparent'}}>
          <div style={{fontFamily:MONO,fontSize:11,color:'#00d4ff',
            background:'rgba(8,12,20,0.88)',border:'1px solid rgba(0,212,255,0.5)',
            borderRadius:4,padding:'3px 12px',pointerEvents:'none',
            boxShadow:'0 2px 8px rgba(0,0,0,0.5)'}}>
            {riskMode==='waiting_entry'?'▶ Clic para definir precio de entrada':'▶ Clic para definir stop loss'}
          </div>
        </div>
      )}
    </div>
  )
}
