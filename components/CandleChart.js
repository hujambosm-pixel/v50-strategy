import { useRef, useEffect } from 'react'
import { MONO, f2, fmtDate } from '../lib/utils'

// ── Indicator calc functions ───────────────────────────────────────────
export function calcEMA(closes, period) {
  if (!closes?.length || period < 1) return []
  const k = 2 / (period + 1)
  const out = new Array(closes.length).fill(null)
  let sum = 0, valid = 0
  for (let i = 0; i < closes.length; i++) {
    sum += closes[i]; valid++
    if (valid < period) continue
    if (valid === period) { out[i] = sum / period; continue }
    out[i] = closes[i] * k + out[i - 1] * (1 - k)
  }
  return out
}
export function calcSMA(closes, period) {
  if (!closes?.length || period < 1) return []
  const out = new Array(closes.length).fill(null)
  for (let i = period - 1; i < closes.length; i++) {
    let s = 0
    for (let j = i - period + 1; j <= i; j++) s += closes[j]
    out[i] = s / period
  }
  return out
}
export function calcRSI(closes, period = 14) {
  if (!closes?.length || period < 1) return []
  const out = new Array(closes.length).fill(null)
  let gains = 0, losses = 0
  for (let i = 1; i <= period && i < closes.length; i++) {
    const d = closes[i] - closes[i - 1]
    if (d > 0) gains += d; else losses -= d
  }
  if (period >= closes.length) return out
  gains /= period; losses /= period
  out[period] = losses === 0 ? 100 : 100 - 100 / (1 + gains / losses)
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1]
    gains = (gains * (period - 1) + Math.max(d, 0)) / period
    losses = (losses * (period - 1) + Math.max(-d, 0)) / period
    out[i] = losses === 0 ? 100 : 100 - 100 / (1 + gains / losses)
  }
  return out
}
export function calcMACD(closes, fast = 12, slow = 26, signal = 9) {
  const emaFast = calcEMA(closes, fast)
  const emaSlow = calcEMA(closes, slow)
  const macdLine = closes.map((_, i) =>
    emaFast[i] != null && emaSlow[i] != null ? emaFast[i] - emaSlow[i] : null)
  // Signal line: EMA of valid MACD values
  const signalLine = new Array(closes.length).fill(null)
  const firstIdx = macdLine.findIndex(v => v != null)
  if (firstIdx >= 0) {
    const validMacd = []
    const validIdxs = []
    macdLine.forEach((v, i) => { if (v != null) { validMacd.push(v); validIdxs.push(i) } })
    const sigEMA = calcEMA(validMacd, signal)
    validIdxs.forEach((idx, j) => { signalLine[idx] = sigEMA[j] })
  }
  const histogram = closes.map((_, i) =>
    macdLine[i] != null && signalLine[i] != null ? macdLine[i] - signalLine[i] : null)
  return { macdLine, signalLine, histogram }
}

// ── Indicator detection helpers ────────────────────────────────────────
function _blockInd(block) {
  if (!block) return null
  if (block.indicator) return String(block.indicator).toUpperCase()
  const t = block.type || ''
  if (['ema_cross_up','ema_cross_down','price_above_ma','price_below_ma','close_above_ma','close_below_ma'].includes(t)) return 'EMA'
  if (['rsi_above','rsi_below','rsi_cross_up','rsi_cross_down'].includes(t)) return 'RSI'
  if (['macd_cross_up','macd_cross_down'].includes(t)) return 'MACD'
  if (t === 'volume') return 'VOLUME'
  return null
}
function getActiveIndicator(definition) {
  const fromBlocks = _blockInd(definition?.setup) || _blockInd(definition?.trigger)
  if (fromBlocks) return fromBlocks
  // FIX 1 — fallback para estrategias antiguas con definition.entry
  const t = (definition?.entry?.type || '').toLowerCase()
  if (!t) return null
  if (t.includes('ema') || t.includes('sma') || t.includes('ma_')) return t.includes('sma') ? 'SMA' : 'EMA'
  if (t.includes('rsi'))    return 'RSI'
  if (t.includes('macd'))   return 'MACD'
  if (t.includes('volume')) return 'VOLUME'
  return null
}
function getEmaParams(definition, emaRPeriod, emaLPeriod) {
  for (const role of ['setup','trigger']) {
    const b = definition?.[role]
    if (!b || !['EMA','SMA'].includes(_blockInd(b))) continue
    const maType = b.ma_type || (b.indicator === 'SMA' ? 'SMA' : 'EMA')
    const t = b.type || ''
    if (['ema_cross_up','ema_cross_down'].includes(t) || ['crosses_above','crosses_below'].includes(b.condition))
      return { fast: b.ma_fast ?? b.params?.fast ?? emaRPeriod ?? 10, slow: b.ma_slow ?? b.params?.slow ?? emaLPeriod ?? 20, type: maType }
    if (['price_above_ma','price_below_ma','close_above_ma','close_below_ma'].includes(t) || ['price_above','price_below'].includes(b.condition))
      return { fast: b.ma_period ?? b.params?.slow ?? b.params?.fast ?? emaRPeriod ?? 50, slow: null, type: maType }
  }
  // FIX 2 — fallback para estrategias antiguas con definition.entry
  const e = definition?.entry
  if (e) {
    const maType = e.ma_type || 'EMA'
    if (e.ma_fast != null || e.ma_slow != null)
      return { fast: e.ma_fast ?? emaRPeriod ?? 10, slow: e.ma_slow ?? emaLPeriod ?? 20, type: maType }
    if (e.ma_period != null)
      return { fast: e.ma_period ?? emaRPeriod ?? 50, slow: null, type: maType }
  }
  return { fast: emaRPeriod ?? 10, slow: emaLPeriod ?? 20, type: 'EMA' }
}
function getRsiParams(definition) {
  // Fuente 1: bloques de definición
  const blocks = [
    definition?.setup,
    definition?.trigger,
    definition?.exit,
    definition?.trigger_out,
  ]
  let period = 14
  let entryLevel = null   // nivel de entrada (bajo, zona sobrevendida)
  let exitLevel  = null   // nivel de salida (alto, zona sobrecomprada)
  for (const b of blocks) {
    if (!b || !b.type?.includes('rsi')) continue
    if (period === 14) period = b.rsi_period || b.period || 14
    if (b === definition?.setup || b === definition?.trigger) {
      if (b.level != null) entryLevel = b.level
    }
    if (b === definition?.exit || b === definition?.trigger_out) {
      if (b.level != null) exitLevel = b.level
    }
  }
  // Fuente 2: visuals.indicators — sobreescribe si el usuario editó el nivel
  const visRsi = (definition?.visuals?.indicators || []).filter(i => i.type === 'rsi' && i.visible !== false)
  for (const vi of visRsi) {
    if (vi.level == null) continue
    const src = vi.source?.toLowerCase() || ''
    if (src.includes('setup') || src.includes('trigger in')) {
      entryLevel = vi.level
      period = vi.period || period
    } else if (src.includes('trigger out') || src.includes('exit')) {
      exitLevel = vi.level
    }
  }
  return { period, entryLevel, exitLevel }
}
function getMacdParams(definition) {
  for (const role of ['setup','trigger']) {
    const b = definition?.[role]
    if (!b || _blockInd(b) !== 'MACD') continue
    return { fast: b.fast ?? b.params?.fast ?? 12, slow: b.slow ?? b.params?.slow ?? 26, signal: b.signal ?? b.params?.signal ?? 9 }
  }
  return { fast: 12, slow: 26, signal: 9 }
}

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

export default function CandleChart({ data, emaRPeriod, emaLPeriod, trades, maxDD, labelMode, rulerActive, onChartReady, onPriceAlarm, onAlarmPriceDrag, syncRef, savedRangeRef, isNewResultRef=null, chartHeight=480, priceAlarms=[], tlOpenTrades=[], ackedAlarms, externalLegendRef, riskMode=null, onRiskPrice, riskLevels=null, riskLineActive=null, onRiskLevelChange, fillHeight=false, definition=null, isBareChart=false, visuals=null, filterZones=[], slopeChanges=[], customMarkers=[] }) {
  const containerRef=useRef(null), svgRef=useRef(null), legendRef=useRef(null), tooltipRef=useRef(null)
  const activeLegendRef = externalLegendRef || legendRef
  const chartRef=useRef(null), candlesRef=useRef(null)
  const rsiChartRef=useRef(null), macdChartRef=useRef(null), volumeChartRef=useRef(null)
  const rsiContainerRef=useRef(null), macdContainerRef=useRef(null), volumeContainerRef=useRef(null)
  const chartAliveRef=useRef(true)
  const innerCleanupRef=useRef(null)
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
  const labelModeRef=useRef(labelMode)
  useEffect(()=>{ labelModeRef.current=labelMode },[labelMode])
  const filterZonesRef=useRef(filterZones)
  useEffect(()=>{ filterZonesRef.current=filterZones },[filterZones])
  useEffect(()=>{
    if(!fillHeight||!containerRef.current) return
    const forceResize=()=>{
      if(!chartRef.current||!containerRef.current) return
      const cont=containerRef.current
      const w=cont.clientWidth||window.innerWidth
      // Sin fallback a la ventana: usa clientHeight; si aún es 0, la altura REAL del padre (chart-wrap con height:velasH,
      // definido); si tampoco hay, NO redimensiona y espera al ResizeObserver. Nunca innerHeight-30 (estiraba el canvas).
      const h=cont.clientHeight||cont.parentElement?.getBoundingClientRect().height||0
      if(w>0&&h>0) chartRef.current.resize(w,h)
    }
    setTimeout(forceResize,0)
    setTimeout(forceResize,50)
    setTimeout(forceResize,150)
    window.addEventListener('resize',forceResize)
    return()=>window.removeEventListener('resize',forceResize)
  },[fillHeight])
  useEffect(()=>{ onRiskLevelChangeRef.current=onRiskLevelChange },[onRiskLevelChange])
  useEffect(()=>{
    rulerActiveR.current=rulerActive
    if(!rulerActive){
      rulerStart.current=null
      svgRef.current?.querySelectorAll('.ruler-el').forEach(el=>el.remove())
    }
  },[rulerActive])

  useEffect(()=>{
    // Limpiar SVG inmediatamente si labelMode=0 para no dejar residuos de modos anteriores
    if(labelMode===0&&svgRef.current){
      svgRef.current.querySelectorAll('.trade-label,.obl-marker').forEach(el=>el.remove())
    }
    if(typeof window==='undefined'||!containerRef.current) return
    import('lightweight-charts').then(({createChart,CrosshairMode,LineStyle})=>{
      let disposed=false
      if(chartRef.current){chartRef.current.remove();chartRef.current=null}
      if(!containerRef.current||containerRef.current.clientWidth<=0) return
      const chart=createChart(containerRef.current,{
        width:containerRef.current.clientWidth,height:chartHeight,
        layout:{background:{color:visuals?.chartBg||'#080c14'},textColor:'#7a9bc0',fontFamily:'-apple-system, BlinkMacSystemFont, Trebuchet MS, Roboto, Ubuntu, sans-serif'},
        grid:{vertLines:{color:'#0d1520'},horzLines:{color:'#0d1520'}},
        crosshair:{mode:CrosshairMode.Normal},
        rightPriceScale:{borderColor:'#1a2d45',minimumWidth:70},
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

      // ── Dynamic indicator overlay ──────────────────────────────────
      const _closes=data.map(d=>d.close)
      const _indType=getActiveIndicator(definition)
      // visuals.indicators es la fuente de verdad para EMA/SMA overlay.
      // Si no hay definition (legacy sin estrategia) se usan emaR/emaL precomputados.
      const _emaIndicators=(definition?.visuals?.indicators||[])
        .filter(i=>(i.type==='ema'||i.type==='sma')&&i.visible!==false)
        .sort((a,b)=>(a.period||0)-(b.period||0))
      const _showEma=!isBareChart&&(!definition||_emaIndicators.length>0)
      if(_showEma){
        if(!definition){
          // Ruta legacy: sin definition, usar emaR/emaL precomputados del chartData
          const fs=chart.addLineSeries({color:'#ffd166',lineWidth:1,lastValueVisible:false,priceLineVisible:false})
          fs.setData(data.map(d=>({time:d.date,value:d.emaR})).filter(x=>x.value!=null))
          const ss=chart.addLineSeries({color:'#ff4d6d',lineWidth:1,lastValueVisible:false,priceLineVisible:false})
          ss.setData(data.map(d=>({time:d.date,value:d.emaL})).filter(x=>x.value!=null))
          const hasEma3=data.some(d=>d.ema3!=null)
          if(hasEma3){
            const s3=chart.addLineSeries({color:'#9C27B0',lineWidth:2,lastValueVisible:false,priceLineVisible:false,title:'EMA50'})
            s3.setData(data.filter(d=>d.ema3!=null).map(d=>({time:d.date,value:d.ema3})))
          }
        } else {
          _emaIndicators.forEach((ind,idx)=>{
            const mtype=(ind.type||'ema').toUpperCase()
            const p=ind.period
            // Reutilizar arrays precomputados si el período coincide
            const vals=(p===emaRPeriod&&data[0]?.emaR!=null)?data.map(d=>d.emaR):
                       (p===emaLPeriod&&data[0]?.emaL!=null)?data.map(d=>d.emaL):
                       (mtype==='SMA'?calcSMA(_closes,p):calcEMA(_closes,p))
            const defColor=idx===0?'#ffd166':'#ff4d6d'
            const series=chart.addLineSeries({color:ind.color||defColor,lineWidth:ind.lineWidth||1,lastValueVisible:false,priceLineVisible:false})
            series.setData(data.map((d,j)=>({time:d.date,value:vals[j]})).filter(x=>x.value!=null))
          })
        }
      }

      // ── Bandas de Bollinger (bbUpper, bbMid, bbLower desde chartData) ──
      if (data.some(d => d.bbUpper != null)) {
        const bbU = chart.addLineSeries({ color: '#2196F3', lineWidth: 1, lastValueVisible: false, priceLineVisible: false, title: 'BB Upper' })
        bbU.setData(data.filter(d => d.bbUpper != null).map(d => ({ time: d.date, value: d.bbUpper })))
        const bbM = chart.addLineSeries({ color: '#FF6D00', lineWidth: 1, lastValueVisible: false, priceLineVisible: false, title: 'BB Mid' })
        bbM.setData(data.filter(d => d.bbMid != null).map(d => ({ time: d.date, value: d.bbMid })))
        const bbL = chart.addLineSeries({ color: '#2196F3', lineWidth: 1, lastValueVisible: false, priceLineVisible: false, title: 'BB Lower' })
        bbL.setData(data.filter(d => d.bbLower != null).map(d => ({ time: d.date, value: d.bbLower })))
      }

      // ── MAE (Maximum Adverse Excursion) por trade ──
      const tradeMAEs = trades.map(t => {
        if(!t.entryDate||!t.exitDate||!t.entryPrice) return { ...t, mae:0, minLow:t.entryPrice, minDate:t.entryDate }
        const velas = data.filter(d => d && d.date >= t.entryDate && d.date <= t.exitDate)
        if(!velas.length) return { ...t, mae:0, minLow:t.entryPrice, minDate:t.entryDate }
        let peak=t.entryPrice, maxDD=0, minDate=null, minLow=t.entryPrice
        velas.forEach(v=>{
          if(v.high>peak) peak=v.high
          const dd=(v.low-peak)/peak*100
          if(dd<maxDD){maxDD=dd;minDate=v.date;minLow=v.low}
        })
        return { ...t, mae:maxDD, minLow, minDate:minDate||t.entryDate }
      })
      const worstMAETrade = tradeMAEs.length
        ? tradeMAEs.reduce((worst, t) => t.mae < worst.mae ? t : worst, tradeMAEs[0])
        : null

      // Líneas de trades — diagonal P&L + horizontales entrada/stop estilo TV
      tradeMAEs.forEach(t=>{
        if(!t.entryDate||!t.exitDate) return
        if(visuals?.lines!==false){
          const ls=chart.addLineSeries({color:t.pnlPct>=0?(visuals?.linesColor||'#00e5a0'):'#ff4d6d',lineWidth:2,lastValueVisible:false,priceLineVisible:false,crosshairMarkerVisible:false})
          ls.setData([{time:t.entryDate,value:t.entryPrice},{time:t.exitDate,value:t.exitPrice}])
        }
        if(visuals?.entryLine!==false){
          const entryLine=chart.addLineSeries({color:visuals?.entryLineColor||'rgba(255,255,255,0.65)',lineWidth:1,lineStyle:LineStyle.Dashed,lastValueVisible:false,priceLineVisible:false,crosshairMarkerVisible:false})
          entryLine.setData([{time:t.entryDate,value:t.entryPrice},{time:t.exitDate,value:t.entryPrice}])
        }
        if(visuals?.lines!==false){
          // Línea de stop: escalonada (lineType:1=WithSteps) si hay historial, horizontal si stopPx simple
          const hist=t.stopHistory
          const hasHist=Array.isArray(hist)&&hist.length>0
          const hasSimple=t.stopPx!=null
          if(hasHist||hasSimple){
            // lineType:1 (LineType.WithSteps) → horizontal primero, luego escalón vertical automático
            const stopLine=chart.addLineSeries({color:'rgba(255,77,109,0.9)',lineWidth:2,lineStyle:LineStyle.Solid,lineType:1,lastValueVisible:false,priceLineVisible:false,crosshairMarkerVisible:false})
            if(hasHist){
              const sorted=[...hist].sort((a,b)=>a.date.localeCompare(b.date)).filter(h=>h.stopPx!=null)
              if(sorted.length){
                const pts=[]
                // Arrancar en entryDate con el primer nivel de stop
                pts.push({time:t.entryDate,value:sorted[0].stopPx})
                // Un punto por cada cambio de nivel posterior a entryDate
                for(const h of sorted) if(h.date>t.entryDate) pts.push({time:h.date,value:h.stopPx})
                // Extender último nivel hasta exitDate
                if(pts[pts.length-1].time<t.exitDate) pts.push({time:t.exitDate,value:sorted[sorted.length-1].stopPx})
                stopLine.setData(pts)
              }
            } else {
              // Sin historial — línea horizontal simple
              stopLine.setData([{time:t.entryDate,value:t.stopPx},{time:t.exitDate,value:t.stopPx}])
            }
          }
        }
      })

      // ── Marcadores: flechas entrada/salida + círculos cruces EMA ──
      const allMarkers=[]
      const oblMarkers=[]  // emoji ↗/↘ dibujados en SVG overlay, sin shape nativo
      const _isRsiMode=!_indType&&data.some(d=>d.rsiLine!=null)
      if(visuals?.arrows!==false&&!_isRsiMode){
        tradeMAEs.forEach(t=>{
          const _as=visuals?.arrowsShape||'arrowUp'
          const _asExit=_as==='arrowUp'?'arrowDown':_as==='arrowDown'?'arrowUp':_as
          if(_as==='oblicua'){
            if(t.entryDate) oblMarkers.push({date:t.entryDate,anchor:'low', text:'↗',color:visuals?.arrowsColor||'#00d4ff'})
            if(t.exitDate)  oblMarkers.push({date:t.exitDate, anchor:'high',text:'↘',color:t.pnlPct>=0?'#00e5a0':'#ff4d6d'})
          } else {
            if(t.entryDate) allMarkers.push({time:t.entryDate,position:'belowBar',color:visuals?.arrowsColor||'#00d4ff',shape:_as,text:''})
            if(t.exitDate)  allMarkers.push({time:t.exitDate, position:'aboveBar',color:t.pnlPct>=0?'#00e5a0':'#ff4d6d',shape:_asExit,text:''})
          }
        })
      }
      for(let j=1;j<data.length;j++){
        const er=data[j].emaR,el=data[j].emaL,erP=data[j-1].emaR,elP=data[j-1].emaL
        if(er==null||el==null||erP==null||elP==null) continue
        if(visuals?.emaCrossUp===true&&erP<elP&&er>=el){
          const _su=visuals?.emaCrossUpShape||'circle'
          if(_su==='oblicua') oblMarkers.push({date:data[j].date,anchor:'low', text:'↗',color:visuals?.emaCrossUpColor||'#00e5a0'})
          else allMarkers.push({time:data[j].date,position:'belowBar',color:visuals?.emaCrossUpColor||'#00e5a0',shape:_su,text:''})}
        if(visuals?.emaCrossDown===true&&erP>elP&&er<=el){
          const _sd=visuals?.emaCrossDownShape||'circle'
          if(_sd==='oblicua') oblMarkers.push({date:data[j].date,anchor:'high',text:'↘',color:visuals?.emaCrossDownColor||'#ff4d6d'})
          else allMarkers.push({time:data[j].date,position:'aboveBar',color:visuals?.emaCrossDownColor||'#ff4d6d',shape:_sd,text:''})}
      }
      // ── Marcadores personalizados desde code_js → customMarkers ──
      // Si tiene shape (y opcionalmente text): marcador nativo LW-Charts (circle, arrowUp, arrowDown, square)
      // Si tiene solo text: marcador SVG oblicuo (emoji/texto)
      if(customMarkers?.length){
        const VALID_SHAPES=new Set(['circle','arrowUp','arrowDown','square'])
        customMarkers.forEach(m=>{
          if(!m?.date) return
          const hasShape=m.shape&&VALID_SHAPES.has(m.shape)
          // Normalizar fecha: string 'YYYY-MM-DD' o timestamp Unix → string
          const _mDate = typeof m.date === 'number'
            ? new Date(m.date * 1000).toISOString().slice(0,10)
            : m.date
          if(hasShape){
            // Marcador nativo: soporta circle, arrowUp, arrowDown, square
            allMarkers.push({
              time:_mDate,
              position:m.position||(m.anchor==='high'?'aboveBar':'belowBar'),
              color:m.color??'#ffffff',
              shape:m.shape,
              text:m.text??'',
            })
          } else if(m.text){
            // Marcador de texto/emoji via SVG overlay
            oblMarkers.push({date:_mDate,anchor:m.anchor??'low',text:m.text,color:m.color??'#ffffff'})
          }
        })
      }
      // setMarkers siempre DESPUÉS de añadir customMarkers
      if(allMarkers.length) candles.setMarkers(allMarkers.sort((a,b)=>a.time.localeCompare(b.time)))
      // ── Flechas oblicuas RSI: cruces RSI/MA → ↗/↘ en gráfico principal ──
      if(!_indType&&data.some(d=>d.rsiLine!=null)&&slopeChanges?.length){
        slopeChanges.forEach(sc=>{
          const _dir=sc.direction||sc.type
          oblMarkers.push({date:sc.date,anchor:_dir==='up'?'low':'high',text:_dir==='up'?'↗':'↘',color:_dir==='up'?'#00e5a0':'#ff4d6d'})
        })
      }

      // ── Paneles secundarios (RSI / MACD / VOLUME) ─────────────────────
      const _panelOpts=(h)=>({
        width:containerRef.current?.clientWidth||400, height:h,
        layout:{background:{color:'#080c14'},textColor:'#7a9bc0',fontFamily:'-apple-system,BlinkMacSystemFont,Trebuchet MS,Roboto,Ubuntu,sans-serif'},
        grid:{vertLines:{color:'#0d1520'},horzLines:{color:'#0d1520'}},
        rightPriceScale:{borderColor:'#1a2d45',scaleMargins:{top:0.1,bottom:0.1},minimumWidth:70},
        leftPriceScale:{visible:false},
        timeScale:{borderColor:'#1a2d45',timeVisible:true,visible:false},
        crosshair:{mode:CrosshairMode.Normal},
        handleScroll:false,handleScale:false,
      })
      // 4-color TradingView-style histogram coloring
      const _histColor=(val,prev)=>{
        if(val==null) return '#26a69a'
        if(val>=0) return (prev==null||val>prev)?'#26a69a':'#b2dfdb'
        return (prev==null||val<prev)?'#ef5350':'#ffcdd2'
      }
      const _syncPanels=(panelChart,panelSeries)=>{
        // Sync visible range (zoom / scroll)
        chart.timeScale().subscribeVisibleTimeRangeChange(range=>{
          if(range)try{panelChart.timeScale().setVisibleRange(range)}catch(_){}
        })
        panelChart.timeScale().subscribeVisibleTimeRangeChange(range=>{
          if(range)try{chart.timeScale().setVisibleRange(range)}catch(_){}
        })
        // Sync crosshair vertical line (optional — only when panelSeries provided)
        if(panelSeries){
          let _syncing=false
          chart.subscribeCrosshairMove(param=>{
            if(_syncing)return
            if(param.time){_syncing=true;try{panelChart.setCrosshairPosition(50,param.time,panelSeries)}catch(_){};_syncing=false}
            else try{panelChart.clearCrosshairPosition()}catch(_){}
          })
          panelChart.subscribeCrosshairMove(param=>{
            if(_syncing)return
            const cs=candlesRef.current
            if(param.time&&cs){_syncing=true;try{chart.setCrosshairPosition(0,param.time,cs)}catch(_){};_syncing=false}
            else try{chart.clearCrosshairPosition()}catch(_){}
          })
        }
      }

      if(_indType==='RSI'){
        rsiChartRef.current=null  // chart es nuevo; series anteriores ya destruidas
        const rp=getRsiParams(definition)
        const rsiVals=calcRSI(_closes,rp.period)
        const entryLevel=rp.entryLevel??30
        const exitLevel=rp.exitLevel??70
        const visRsiInd=(definition?.visuals?.indicators||[]).find(i=>i.type==='rsi'&&i.visible!==false)
        const rsiS=chart.addLineSeries({
          priceScaleId:'rsi',
          color:visRsiInd?.color||'#a78bfa',
          lineWidth:visRsiInd?.lineWidth||1,
          lastValueVisible:true,
          priceLineVisible:false,
          crosshairMarkerVisible:true,
          title:'',
        })
        chart.priceScale('rsi').applyOptions({
          scaleMargins:{top:0.72,bottom:0.02},
          visible:true,
          borderVisible:true,
          borderColor:'#1a2d45',
          entireTextOnly:true,
          position:'left',
        })
        // Empujar las velas al 70% superior para que no solapen con el RSI
        chart.priceScale('right').applyOptions({
          scaleMargins:{top:0.02,bottom:0.32},
        })
        const d0=data[0].date,dN=data[data.length-1].date
        rsiS.setData(data.map((d,i)=>({time:d.date,value:rsiVals[i]})).filter(x=>x.value!=null))
        // Niveles de entrada/salida como priceLines sobre rsiS
        // Se destruyen automáticamente al hacer removeSeries(rsiS)
        rsiS.createPriceLine({price:entryLevel,color:'rgba(0,200,80,0.8)',lineWidth:1,lineStyle:LineStyle.Dashed,axisLabelVisible:true,title:`${entryLevel}`})
        rsiS.createPriceLine({price:exitLevel,color:'rgba(255,100,100,0.8)',lineWidth:1,lineStyle:LineStyle.Dashed,axisLabelVisible:true,title:`${exitLevel}`})
        // Series ancla visibles (color transparente) para forzar rango 0-100
        // visible:false las excluye del cálculo de escala — se omite intencionalmente
        const rsiAnchorMin=chart.addLineSeries({priceScaleId:'rsi',color:'rgba(0,0,0,0.004)',lineWidth:1,lastValueVisible:false,priceLineVisible:false,crosshairMarkerVisible:false})
        rsiAnchorMin.setData([{time:d0,value:0},{time:dN,value:0}])
        const rsiAnchorMax=chart.addLineSeries({priceScaleId:'rsi',color:'rgba(0,0,0,0.004)',lineWidth:1,lastValueVisible:false,priceLineVisible:false,crosshairMarkerVisible:false})
        rsiAnchorMax.setData([{time:d0,value:100},{time:dN,value:100}])
        rsiChartRef.current={_isOverlay:true,_series:[rsiS,rsiAnchorMin,rsiAnchorMax]}
      }

      if(_indType==='MACD'&&macdContainerRef.current){
        const mp=getMacdParams(definition)
        const {macdLine,signalLine,histogram}=calcMACD(_closes,mp.fast,mp.slow,mp.signal)
        if(macdChartRef.current){try{macdChartRef.current.remove()}catch(_){};macdChartRef.current=null}
        if(macdContainerRef.current.clientWidth<=0) return
        console.log('[CHART-DEBUG] CandleChart MACD-indicator',macdContainerRef.current?.clientWidth,macdContainerRef.current?.clientHeight)
        const macdChart=createChart(macdContainerRef.current,_panelOpts(100))
        macdChartRef.current=macdChart
        const histS=macdChart.addHistogramSeries({lastValueVisible:false,priceLineVisible:false})
        histS.setData(data.map((d,i)=>({time:d.date,value:histogram[i],color:_histColor(histogram[i],histogram[i-1])})).filter(x=>x.value!=null))
        const macdS=macdChart.addLineSeries({color:'#06b6d4',lineWidth:1,lastValueVisible:false,priceLineVisible:false,title:`MACD ${mp.fast}/${mp.slow}`})
        macdS.setData(data.map((d,i)=>({time:d.date,value:macdLine[i]})).filter(x=>x.value!=null))
        const sigS=macdChart.addLineSeries({color:'#ff8c00',lineWidth:1,lastValueVisible:false,priceLineVisible:false,title:`Signal ${mp.signal}`})
        sigS.setData(data.map((d,i)=>({time:d.date,value:signalLine[i]})).filter(x=>x.value!=null))
        _syncPanels(macdChart,macdS)
      }

      if(_indType==='VOLUME'&&macdContainerRef.current){
        if(macdChartRef.current){try{macdChartRef.current.remove()}catch(_){};macdChartRef.current=null}
        const volData=data.filter(d=>d.volume!=null)
        if(volData.length&&macdContainerRef.current.clientWidth>0){
          console.log('[CHART-DEBUG] CandleChart VOLUME-macd',macdContainerRef.current?.clientWidth,macdContainerRef.current?.clientHeight)
          const volChart=createChart(macdContainerRef.current,_panelOpts(80))
          macdChartRef.current=volChart
          const volS=volChart.addHistogramSeries({lastValueVisible:false,priceLineVisible:false,title:'Volume'})
          volS.setData(volData.map(d=>({time:d.date,value:d.volume,color:d.close>=d.open?'rgba(0,229,160,0.5)':'rgba(255,77,109,0.5)'})))
          _syncPanels(volChart)
        }
      }

      // ── MACD subpanel from strategy bar data (code_js strategies returning indicators.macdLine) ──
      // Triggered when bars carry macdLine/signalLine/histogram injected by datos.js.
      // Only fires when definition-based _indType is absent (avoids double-render).
      const _hasMacdBars=!_indType&&data.some(d=>d.macdLine!=null)
      if(_hasMacdBars&&macdContainerRef.current){
        if(macdChartRef.current){try{macdChartRef.current.remove()}catch(_){};macdChartRef.current=null}
        if(macdContainerRef.current.clientWidth<=0) return
        console.log('[CHART-DEBUG] CandleChart MACD-bars',macdContainerRef.current?.clientWidth,macdContainerRef.current?.clientHeight)
        const macdChart=createChart(macdContainerRef.current,_panelOpts(120))
        macdChartRef.current=macdChart
        const validMacdData=data.filter(d=>d.macdLine!=null&&d.signalLine!=null&&d.histogram!=null)
        // Histogram — 4-color TradingView style; honour d.histColor from strategy if set
        const histS=macdChart.addHistogramSeries({lastValueVisible:false,priceLineVisible:false})
        histS.setData(validMacdData.map((d,i)=>({time:d.date,value:d.histogram,color:d.histColor||_histColor(d.histogram,validMacdData[i-1]?.histogram)})))
        // MACD line — blue
        const macdS=macdChart.addLineSeries({color:'#2962ff',lineWidth:1,lastValueVisible:false,priceLineVisible:false})
        macdS.setData(validMacdData.map(d=>({time:d.date,value:d.macdLine})))
        // Signal line — orange
        const sigS=macdChart.addLineSeries({color:'#ff6d00',lineWidth:1,lastValueVisible:false,priceLineVisible:false})
        sigS.setData(validMacdData.map(d=>({time:d.date,value:d.signalLine})))
        // Slope change markers
        if(slopeChanges?.length){
          const markers=slopeChanges.map(sc=>({
            time:sc.date,
            position:'inBar',
            color:sc.direction==='up'?'#26a69a':'#ef5350',
            shape:sc.direction==='up'?'arrowUp':'arrowDown',
            text:sc.direction==='up'?'↑':'↓',
          }))
          macdS.setMarkers(markers)
        }
        // Zero line — subtle gray reference
        const zeroS=macdChart.addLineSeries({color:'rgba(120,140,160,0.25)',lineWidth:1,lastValueVisible:false,priceLineVisible:false,crosshairMarkerVisible:false})
        zeroS.setData([{time:data[0].date,value:0},{time:data[data.length-1].date,value:0}])
        _syncPanels(macdChart,macdS)
      }

      // ── RSI subpanel from strategy bar data (code_js strategies returning indicators.rsi) ──
      // Triggered when bars carry rsiLine injected by datos.js.
      // Only fires when definition-based _indType is absent (avoids double-render).
      const _hasRsiBars=!_indType&&data.some(d=>d.rsiLine!=null)
      if(_hasRsiBars&&rsiContainerRef.current){
        // Cleanup previous chart (overlay or standalone)
        if(rsiChartRef.current){
          if(rsiChartRef.current._isOverlay){
            try{const c=chartRef.current;if(c){for(const s of rsiChartRef.current._series){c.removeSeries(s)};c.priceScale('rsi').applyOptions({visible:false});c.priceScale('right').applyOptions({scaleMargins:{top:0.02,bottom:0.02}})}}catch(_){}
          }else{try{rsiChartRef.current.remove()}catch(_){}}
          rsiChartRef.current=null
        }
        if(rsiContainerRef.current.clientWidth<=0) return
        console.log('[CHART-DEBUG] CandleChart RSI',rsiContainerRef.current?.clientWidth,rsiContainerRef.current?.clientHeight)
        const rsiChart=createChart(rsiContainerRef.current,_panelOpts(120))
        rsiChartRef.current=rsiChart
        const validRsiData=data.filter(d=>d.rsiLine!=null)
        const obLevel=validRsiData[0]?.rsiOB??75
        const osLevel=validRsiData[0]?.rsiOS??25
        // RSI MA — yellow (optional, rendered before RSI so RSI is on top)
        if(validRsiData.some(d=>d.rsiMA!=null)){
          const maS=rsiChart.addLineSeries({color:'#f0c040',lineWidth:1,lastValueVisible:false,priceLineVisible:false,
            autoscaleInfoProvider:()=>({priceRange:{minValue:0,maxValue:100},margins:{above:0.05,below:0.05}})})
          maS.setData(validRsiData.filter(d=>d.rsiMA!=null).map(d=>({time:d.date,value:d.rsiMA})))
        }
        // RSI main line — purple #7E57C2
        // autoscaleInfoProvider forces fixed 0-100 scale (prevents BaselineSeries/distortion issues)
        const rsiS=rsiChart.addLineSeries({color:'#7E57C2',lineWidth:2,lastValueVisible:false,priceLineVisible:false,
          autoscaleInfoProvider:()=>({priceRange:{minValue:0,maxValue:100},margins:{above:0.05,below:0.05}})})
        rsiS.setData(validRsiData.map(d=>({time:d.date,value:d.rsiLine})))
        // Reference lines via createPriceLine — don't distort auto-scale
        rsiS.createPriceLine({price:obLevel,color:'rgba(255,80,80,0.55)',lineWidth:1,lineStyle:LineStyle.Dashed,axisLabelVisible:false})
        rsiS.createPriceLine({price:osLevel,color:'rgba(80,200,80,0.55)',lineWidth:1,lineStyle:LineStyle.Dashed,axisLabelVisible:false})
        rsiS.createPriceLine({price:50,color:'rgba(120,140,160,0.3)',lineWidth:1,lineStyle:LineStyle.Solid,axisLabelVisible:false})
        // Cross markers ▲/▼ en el panel RSI (calculados desde los datos de barras)
        const _rsiCrossMarkers=[]
        for(let i=1;i<validRsiData.length;i++){
          const rP=validRsiData[i-1].rsiLine,mP=validRsiData[i-1].rsiMA
          const rC=validRsiData[i].rsiLine,mC=validRsiData[i].rsiMA
          if(rP==null||mP==null||rC==null||mC==null) continue
          if(rP<=mP&&rC>mC) _rsiCrossMarkers.push({time:validRsiData[i].date,position:'belowBar',color:'#00e5a0',shape:'arrowUp',text:''})
          if(rP>=mP&&rC<mC) _rsiCrossMarkers.push({time:validRsiData[i].date,position:'aboveBar',color:'#ff4d6d',shape:'arrowDown',text:''})
        }
        if(_rsiCrossMarkers.length) rsiS.setMarkers(_rsiCrossMarkers)
        _syncPanels(rsiChart,rsiS)
      }

      // ── Volume subpanel — siempre que haya barras con volume > 0, independiente de MACD/RSI ──
      const _hasVolume = data.some(d => d.volume > 0)
      if (_hasVolume && volumeContainerRef.current) {
        if (volumeChartRef.current) { try { volumeChartRef.current.remove() } catch(_) {}; volumeChartRef.current = null }
        if(volumeContainerRef.current.clientWidth<=0) return
        console.log('[CHART-DEBUG] CandleChart Volume-subpanel',volumeContainerRef.current?.clientWidth,volumeContainerRef.current?.clientHeight)
        const volChart = createChart(volumeContainerRef.current, _panelOpts(80))
        volumeChartRef.current = volChart
        volChart.applyOptions({ localization: { priceFormatter: () => '' } })
        const volS = volChart.addHistogramSeries({ lastValueVisible: false, priceLineVisible: false, title: 'Vol' })
        volS.setData(data.filter(d => d.volume > 0).map(d => ({
          time: d.date,
          value: d.volume,
          color: (d.close >= d.open) ? '#26a69a80' : '#ef535080',
        })))
        if (data.some(d => d.volumeAvg != null)) {
          const volAvgS = volChart.addLineSeries({ color: '#FFB30080', lineWidth: 1, lastValueVisible: false, priceLineVisible: false })
          volAvgS.setData(data.filter(d => d.volumeAvg != null).map(d => ({ time: d.date, value: d.volumeAvg })))
        }
        _syncPanels(volChart, volS)
      } else {
        if (volumeChartRef.current) { try { volumeChartRef.current.remove() } catch(_) {}; volumeChartRef.current = null }
      }

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
        const NS='http://www.w3.org/2000/svg'
        // BUG 1 FIX: si ningún trade tiene coordenadas válidas, es un estado transitorio
        // (chart en resize/applyOptions) — no limpiar para evitar que queden vacías
        const hasValidCoords=tradeMAEs.some(t=>{
          if(!t.entryDate&&!t.exitDate) return false
          const ts=chartRef.current?.timeScale()
          const x1=ts?.timeToCoordinate(t.entryDate)
          const x2=ts?.timeToCoordinate(t.exitDate)
          return x1!=null||x2!=null
        })
        // Guard solo cuando labelMode>0: si es transitorio, conservar labels existentes
        // Cuando labelMode===0, SIEMPRE limpiar (nunca dejar residuos de modos anteriores)
        if(labelMode>0&&tradeMAEs.length>0&&!hasValidCoords) return
        svg.querySelectorAll('.trade-label').forEach(el=>el.remove())
        svg.querySelectorAll('.obl-marker').forEach(el=>el.remove())
        // Dibujar marcadores oblicuos (independiente del toggle labels)
        if(oblMarkers.length){
          const ts=chartRef.current.timeScale()
          oblMarkers.forEach(m=>{
            try{
              const x=ts.timeToCoordinate(m.date); if(x==null) return
              const bar=data.find(d=>d.date===m.date); if(!bar) return
              const anchorPx=m.anchor==='low'?bar.low:bar.high
              const y0=candlesRef.current.priceToCoordinate(anchorPx); if(y0==null) return
              const y=m.anchor==='low'?y0+18:y0-4
              const el=document.createElementNS(NS,'text')
              Object.entries({x,y,'font-size':'14','font-family':'sans-serif',
                'text-anchor':'middle',fill:m.color,class:'obl-marker','pointer-events':'none'
              }).forEach(([k,v])=>el.setAttribute(k,v))
              el.textContent=m.text; svg.appendChild(el)
            }catch(_){}
          })
        }
        if(visuals?.labels===false) return
        tradeMAEs.forEach((t,idx)=>{
          if(!t.entryDate||!t.exitDate) return
          try {
            const ts=chartRef.current.timeScale()
            const x1=ts.timeToCoordinate(t.entryDate), x2=ts.timeToCoordinate(t.exitDate)
            if(x1==null&&x2==null) return  // CAMBIO 3: skip solo si ambas coords son null
            const midX=x1!=null&&x2!=null?(x1+x2)/2:(x1??x2)  // fallback a la coord disponible
            // Precio medio del trade para la posición Y base
            const midPrice=(t.entryPrice+t.exitPrice)/2
            const pyBase=candlesRef.current.priceToCoordinate(midPrice)
            if(pyBase==null) return
            const isWin=t.pnlPct>=0
            const winC=isWin?'#00e5a0':'#ff4d6d'
            const bc=visuals?.labelsColor||winC
            const g=document.createElementNS(NS,'g'); g.setAttribute('class','trade-label')

            const chartH=containerRef.current?.clientHeight||480
            const mkConnector=(y1start,y2end)=>{
              const l=document.createElementNS(NS,'line')
              Object.entries({x1:midX,y1:y1start,x2:midX,y2:y2end,
                stroke:bc,'stroke-width':'1','stroke-dasharray':'3,3','opacity':'0.45'
              }).forEach(([k,v])=>l.setAttribute(k,v))
              return l
            }
            // Añadir MAE% al label del peor trade
            const isWorstMAE=worstMAETrade&&t.entryDate===worstMAETrade.entryDate&&t.exitDate===worstMAETrade.exitDate

            // Helpers compartidos CAMBIO 2
            const mkRect=(x,y,w,h,fill,stroke)=>{
              const r=document.createElementNS(NS,'rect')
              Object.entries({x,y,width:w,height:h,fill,rx:'4',stroke,
                'stroke-width':'1','pointer-events':'none'}).forEach(([k,v])=>r.setAttribute(k,v))
              return r
            }
            const mkTxt=(txt,x,y,sz,anchor='middle')=>{
              const el=document.createElementNS(NS,'text')
              Object.entries({x,y,'font-size':sz,'font-family':MONO,'text-anchor':anchor,
                fill:'#ffffff','font-weight':'600','pointer-events':'none'}).forEach(([k,v])=>el.setAttribute(k,v))
              el.textContent=txt; return el
            }

            const BAND_TOP=8, BAND_H=112  // zona fija y=8..120px, nunca sobre velas
            const fillC=isWin?'rgba(0,229,160,0.40)':'rgba(255,77,109,0.40)'
            const strokeC=isWin?'rgba(0,229,160,0.80)':'rgba(255,77,109,0.80)'

            if(labelMode===2){
              // ── Modo completo: caja multi-línea compacta ──
              const cap=t.capitalTras!=null?`€${Math.round(t.capitalTras).toLocaleString('es-ES')}`:'-'
              const lines=[
                `#${idx+1}`,
                `Capital: ${cap}`,
                `Profit:  ${t.pnlPct.toFixed(2)}%`,
                `P&L:     €${t.pnlSimple<0?'-':''}${Math.abs(Math.round(t.pnlSimple)).toLocaleString('es-ES')}`,
                `${t.dias}d`,
              ]
              const W=Math.max(...lines.map(l=>l.length))*5.8+20
              const ROW_H=11, BOX_H=lines.length*ROW_H+8
              const boxY=BAND_TOP+(idx%5)*(BAND_H/5)
              g.appendChild(mkRect(midX-W/2,boxY,W,BOX_H,fillC,strokeC))
              g.appendChild(mkConnector(boxY+BOX_H+2,Math.max(boxY+BOX_H+4,pyBase-4)))
              lines.forEach((line,i)=>g.appendChild(mkTxt(line,midX-W/2+10,boxY+10+i*ROW_H,'9','start')))

            } else if(labelMode===1){
              // ── Modo solo %: caja simple compacta ──
              const lbl=`#${idx+1} ${t.pnlPct.toFixed(1)}%`
              const W=lbl.length*6.2+16, BOX_H=18
              const boxY=BAND_TOP+(idx%5)*(BAND_H/5)
              g.appendChild(mkRect(midX-W/2,boxY,W,BOX_H,fillC,strokeC))
              g.appendChild(mkConnector(boxY+BOX_H+2,Math.max(boxY+BOX_H+4,pyBase-4)))
              g.appendChild(mkTxt(lbl,midX,boxY+BOX_H/2+4,'10'))
            }
            // labelMode===0 → no se añade nada al svg
            svg.appendChild(g)
          } catch(_){}
        })
      }

      // ── Zonas de filtro SP500 — bandas de fondo rojas ──
      const drawFilterZones=()=>{
        const svg=svgRef.current; if(!svg||!chartRef.current) return
        if(visuals?.filterZones===false) { svg.querySelectorAll('.filter-zone').forEach(el=>el.remove()); return }
        svg.querySelectorAll('.filter-zone').forEach(el=>el.remove())
        const zones=filterZonesRef.current; if(!zones?.length) return
        const ts=chartRef.current.timeScale()
        const chartW=containerRef.current?.clientWidth||800
        const chartH=containerRef.current?.clientHeight||480
        const NS2='http://www.w3.org/2000/svg'
        const zoneFill=(()=>{
          const hex=(visuals?.filterZonesColor||'#ff5050').replace('#','')
          const r=parseInt(hex.slice(0,2),16),g=parseInt(hex.slice(2,4),16),b=parseInt(hex.slice(4,6),16)
          return `rgba(${r},${g},${b},0.13)`
        })()
        zones.forEach(zone=>{
          try{
            const rawX1=ts.timeToCoordinate(zone.from)
            const rawX2=ts.timeToCoordinate(zone.to)
            if(rawX1==null&&rawX2==null) return
            const left=rawX1!=null?Math.max(0,rawX1):0
            const right=rawX2!=null?Math.min(chartW,rawX2):chartW
            if(right<=left) return
            const rect=document.createElementNS(NS2,'rect')
            Object.entries({x:String(left),y:'0',width:String(right-left),
              height:String(chartH),fill:zoneFill,
              class:'filter-zone','pointer-events':'none'
            }).forEach(([k,v])=>rect.setAttribute(k,v))
            svg.insertBefore(rect,svg.firstChild)  // detrás de labels/markers
          }catch(_){}
        })
      }

      // Redibujar etiquetas al hacer zoom/scroll — guardamos unsub para cleanup
      chartAliveRef.current=true
      const unsubLabels=chart.timeScale().subscribeVisibleTimeRangeChange(()=>{ if(!disposed&&chartAliveRef.current) setTimeout(()=>{ if(!disposed&&chartAliveRef.current){drawTradeLabels();drawFilterZones()} },30) })

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
      // Read recentMonths once (used later in applyInitialRange)
      const _recentM=(()=>{try{return JSON.parse(localStorage.getItem('v50_settings')||'{}')?.chart?.recentMonths??3}catch(_){return 3}})()
      // applyInitialRange: called after ResizeObserver settles so it's the last range op
      const applyInitialRange=()=>{
        if(disposed) return
        try{
          // isNewResultRef.current=true → new strategy/asset loaded; ignore saved zoom, apply recentMonths
          const forceRecent = isNewResultRef?.current === true
          if(forceRecent && isNewResultRef) isNewResultRef.current=false
          if(!forceRecent && savedRangeRef?.current){
            const r=savedRangeRef.current
            const lastBar=data[data.length-1]
            const minTo=lastBar?addDays(lastBar.date,GAP_DAYS):r.to
            const finalTo=r.to>=minTo?r.to:minTo
            chart.timeScale().setVisibleRange({from:r.from, to:finalTo})
          } else {
            const lastBar=data[data.length-1]
            if(lastBar){
              const from=new Date(lastBar.date)
              from.setMonth(from.getMonth()-_recentM)
              const fromStr=from.toISOString().split('T')[0]
              chart.timeScale().setVisibleRange({
                from:fromStr,
                to:addDays(lastBar.date,GAP_DAYS)
              })
            }
          }
        }catch(_){ try{chart.timeScale().fitContent()}catch(__){} }
      }
      // Save range whenever user zooms/scrolls — always bake in GAP_DAYS on 'to'
      chart.timeScale().subscribeVisibleTimeRangeChange(range=>{
        if(disposed) return  // guard: skip if chart being torn down
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
        if(disposed||!chartAliveRef.current) return  // callback zombie post-dispose/disconnect — ignorar
        if(!containerRef.current||!chartRef.current) return
        try{
          const opts={width:containerRef.current.clientWidth}
          if(fillHeightRef.current){const h=containerRef.current.clientHeight;if(h>0)opts.height=h}
          chart.applyOptions(opts)
        }catch(_){}
        // labelMode=0: solo limpiar SVG, nunca redibujar
        if(labelModeRef.current===0){
          svgRef.current?.querySelectorAll('.trade-label,.obl-marker').forEach(el=>el.remove())
          drawFilterZones()
          return
        }
        setTimeout(()=>{drawTradeLabels();drawFilterZones()},50)
      })
      ro.observe(containerRef.current)
      // Apply initial range AFTER ResizeObserver (setTimeout 0 = next task, after any RO callback)
      // This guarantees setVisibleRange wins over any applyOptions/fitContent from RO
      setTimeout(()=>applyInitialRange(), 0)
      setTimeout(()=>{if(disposed)return;drawTradeLabels();drawFilterZones()},200)

      // FIX 2: si el chart se crea en modo fillHeight, forzar un resize inicial a la altura REAL del
      // contenedor (el mismo clientHeight que lee el ResizeObserver). Antes usaba window.innerHeight-30,
      // válido solo a pantalla completa; en el individual embebido (fillHeight sobre un contenedor de
      // altura velasH) sobredimensionaba el canvas y recortaba las velas inferiores (overflow:hidden).
      // clientHeight es correcto en AMBOS casos: en fullscreen el contenedor ya mide ~100dvh-30-subpaneles.
      if(fillHeightRef.current){
        setTimeout(()=>{
          if(disposed) return
          const cont=containerRef.current
          const w=cont?.clientWidth||window.innerWidth
          // Sin fallback a la ventana: clientHeight, o la altura REAL del padre (chart-wrap); si 0, esperar al RO. Nunca innerHeight-30.
          const h=cont?.clientHeight||cont?.parentElement?.getBoundingClientRect().height||0
          if(w>0&&h>0) chartRef.current?.resize(w,h)
        },50)
      }

      innerCleanupRef.current=()=>{disposed=true;chartAliveRef.current=false;try{unsubLabels()}catch(_){};cnt.removeEventListener('mousemove',onMove);cnt.removeEventListener('mousedown',onMouseDown);window.removeEventListener('mouseup',onMouseUp);window.removeEventListener('keydown',onKeyDown);window.removeEventListener('keyup',onKeyUp);ro.disconnect()}
    })
    return()=>{innerCleanupRef.current?.();innerCleanupRef.current=null;chartAliveRef.current=false;if(rsiChartRef.current){if(rsiChartRef.current._isOverlay){try{const c=chartRef.current;if(c){for(const s of rsiChartRef.current._series){c.removeSeries(s)};c.priceScale('rsi').applyOptions({visible:false});c.priceScale('right').applyOptions({scaleMargins:{top:0.02,bottom:0.02}})}}catch(_){}}else{try{rsiChartRef.current.remove()}catch(_){}};rsiChartRef.current=null};if(macdChartRef.current){try{macdChartRef.current.remove()}catch(_){};macdChartRef.current=null};if(volumeChartRef.current){try{volumeChartRef.current.remove()}catch(_){};volumeChartRef.current=null};if(chartRef.current){try{chartRef.current.__syncCleanup?.()}catch(_){};chartRef.current.remove();chartRef.current=null}}
  },[data,emaRPeriod,emaLPeriod,trades,maxDD,labelMode,definition,isBareChart])

  // ── isBareChart: ajustar altura al resize de ventana ──
  const updateHeightRef=useRef(null)
  useEffect(()=>{
    if(!isBareChart) return
    const updateHeight=()=>{
      if(!chartRef.current) return
      const h=window.innerHeight-chartHeight
      if(h>100){try{chartRef.current.applyOptions({height:h})}catch(_){}}
    }
    updateHeightRef.current=updateHeight
    window.addEventListener('resize',updateHeight)
    return()=>window.removeEventListener('resize',updateHeight)
  },[isBareChart,chartHeight])

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

    if (!riskLevels?.entry && !riskLevels?.stop && !riskLevels?.tp) { cleanup(); return }

    const { entry=null, stop=null, tp=null, shares=0, tradeRiskEur=0, rrRatio=0 } = riskLevels
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
      try {
        riskLinesRef.current[idx]=candles.createPriceLine({price,color,lineWidth:2,lineStyle:0,axisLabelVisible:true,title})
      } catch(_) {}
    }
    upsertLine(0, entry,  '#00d4ff', entry ? `Entrada: ${entry.toFixed(2)}` : '')
    upsertLine(1, stop,   '#ff4d6d', stop  ? `Stop: ${stop.toFixed(2)}`    : '')
    upsertLine(2, tp,     '#00e5a0', tp    ? `Objetivo: ${tp.toFixed(2)}`  : '')

    // Create primitive once (it reads from riskConfigRef which we mutate in place)
    if (!riskBandSeriesRef.current && data?.length && entry) {
      const fd=data[0].date, ld=data[data.length-1].date
      try {
        const dummy=chart.addLineSeries({lastValueVisible:false,priceLineVisible:false,crosshairMarkerVisible:false,visible:false,color:'transparent'})
        dummy.setData([{time:fd,value:entry},{time:ld,value:entry}])
        dummy.attachPrimitive(createRiskPrimitive(riskConfigRef))
        riskBandSeriesRef.current=dummy
      } catch(_) {}
    }
  // eslint-disable-next-line
  },[riskLevels, riskLineActive, data])

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

  const activeIndType = definition ? getActiveIndicator(definition) : null
  const hasMacdBars   = !activeIndType && data?.some(d => d.macdLine != null)
  const hasRsiBars    = !activeIndType && data?.some(d => d.rsiLine  != null)
  const hasVolumeBars = data?.some(d => d.volume > 0)
  return (
    <div style={{display:'flex',flexDirection:'column',...(fillHeight?{flex:1,minHeight:0}:{})}}>
    <div style={{position:'relative',...(fillHeight?{flex:1,minHeight:0}:{})}}>
      <div ref={legendRef} style={{position:'absolute',top:8,left:8,zIndex:10,fontFamily:MONO,fontSize:12,color:'#7a9bc0',background:'rgba(8,12,20,0.82)',padding:'4px 10px',borderRadius:4,pointerEvents:'none',whiteSpace:'nowrap',display:externalLegendRef?'none':'block'}}/>
      <div ref={containerRef} style={{minHeight:0,...(fillHeight?{height:'100%'}:{})}}/>
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
            {riskMode==='capture_entry'?'▶ Clic en el gráfico para definir la Entrada':riskMode==='capture_stop'?'▶ Clic en el gráfico para definir el Stop':'▶ Clic en el gráfico para definir el TP'}
          </div>
        </div>
      )}
    </div>
    {/* ── Paneles de indicadores secundarios ── */}
    {(activeIndType==='MACD'||activeIndType==='VOLUME'||hasMacdBars)&&(
      <div ref={macdContainerRef} style={{width:'100%',height:hasMacdBars?120:activeIndType==='VOLUME'?80:100,background:'#080c14',borderTop:'1px solid #1a2d45'}}/>
    )}
    {hasRsiBars&&(
      <div style={{position:'relative',width:'100%',background:'#080c14',borderTop:'1px solid #1a2d45'}}>
        <div ref={rsiContainerRef} style={{width:'100%',height:120}}/>
        <span style={{position:'absolute',top:4,left:8,fontFamily:MONO,fontSize:9,color:'#7a9bc0',pointerEvents:'none',zIndex:10,letterSpacing:'0.06em',userSelect:'none'}}>RSI</span>
      </div>
    )}
    <div style={{display:hasVolumeBars?'block':'none',position:'relative',width:'100%',background:'#080c14',borderTop:'1px solid #1a2d45'}}>
      <div ref={volumeContainerRef} style={{width:'100%',height:80}}/>
      <span style={{position:'absolute',top:4,left:8,fontFamily:MONO,fontSize:9,color:'#7a9bc0',pointerEvents:'none',zIndex:10,letterSpacing:'0.06em',userSelect:'none'}}>VOL</span>
    </div>
    </div>
  )
}
