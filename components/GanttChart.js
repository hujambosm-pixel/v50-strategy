// components/GanttChart.js — Diagrama de Gantt interactivo de operaciones multiactivo
// SVG + HTML. Zoom/scroll custom; sin overflow-x nativo.

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'

const MONO = "'JetBrains Mono', 'Fira Mono', 'Cascadia Code', monospace"

const LABEL_W  = 90   // ancho columna activos (px)
const HEADER_H = 48   // altura cabecera meses/años (px)
const ROW_H    = 26   // altura de fila por activo (px)
const BAR_PAD  = 3    // padding vertical dentro de la fila
const MIN_TEXT_W = 40 // ancho mínimo de barra para mostrar texto

const MONTHS_ES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

// ── Colores según P&L% ────────────────────────────────────────────────────────
function barColor(pct) {
  if (pct == null) return '#334155'
  if (pct >  20) return '#0d6e2e'
  if (pct >   5) return '#16a34a'
  if (pct >=  0) return '#22c55e'
  if (pct >  -5) return '#ef4444'
  if (pct > -15) return '#dc2626'
  return '#991b1b'
}

// ── Formateo español ──────────────────────────────────────────────────────────
function fmtPct(v) {
  if (v == null || isNaN(v)) return '-'
  const sign = v >= 0 ? '+' : ''
  return sign + v.toFixed(1).replace('.', ',') + '%'
}
function fmtEur(v) {
  if (v == null || isNaN(v)) return '-'
  const sign = v >= 0 ? '+' : '-'
  const abs  = Math.abs(v)
  return sign + abs.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '€'
}
function fmtDateES(s) {
  if (!s) return '-'
  const [y, m, d] = s.split('-')
  return `${d}/${m}/${y}`
}
function dateToMs(s) {
  if (!s) return 0
  return new Date(s + 'T00:00:00').getTime()
}

// ── Markers de meses en el rango visible ─────────────────────────────────────
function genMonthMarkers(startMs, endMs) {
  const markers = []
  const cur = new Date(startMs)
  cur.setDate(1)
  while (cur.getTime() <= endMs) {
    markers.push({ ms: cur.getTime(), year: cur.getFullYear(), month: cur.getMonth() })
    cur.setMonth(cur.getMonth() + 1)
  }
  return markers
}

// ── Clamp helper ─────────────────────────────────────────────────────────────
function clampRange(start, end, minMs, maxMs) {
  const range = end - start
  if (range <= 0) return { start: minMs, end: maxMs }
  if (start < minMs) return { start: minMs, end: minMs + range }
  if (end   > maxMs) return { start: maxMs - range, end: maxMs }
  return { start, end }
}

// ══════════════════════════════════════════════════════════════════════════════
// TOOLTIP
// ══════════════════════════════════════════════════════════════════════════════
function GanttTooltip({ trade, mouseX, mouseY, isDiscarded, slotCapital }) {
  const t = trade
  const pnlEur = t.pnlSimple != null
    ? t.pnlSimple
    : slotCapital != null ? slotCapital * (t.pnlPct || 0) / 100 : null
  const dias = t.dias != null
    ? t.dias
    : (t.entryDate && t.exitDate
        ? Math.round((dateToMs(t.exitDate) - dateToMs(t.entryDate)) / 86400000)
        : null)

  const W = 230, H = isDiscarded ? 175 : 155
  const left = mouseX + 14 + W > (typeof window !== 'undefined' ? window.innerWidth  : 1200) ? mouseX - W - 10 : mouseX + 14
  const top  = mouseY + 14 + H > (typeof window !== 'undefined' ? window.innerHeight : 800)  ? mouseY - H - 10 : mouseY + 14

  const pct = t.pnlPct || 0
  const posColor = pct >= 0 ? '#4ade80' : '#f87171'

  return (
    <div style={{
      position:'fixed', left, top, zIndex:99999,
      background:'#060d18', border:'1px solid #1a3a5c',
      borderRadius:6, padding:'9px 13px', minWidth:W,
      fontFamily:MONO, fontSize:10, color:'#e2e8f0',
      pointerEvents:'none', boxShadow:'0 6px 24px rgba(0,0,0,0.7)',
      lineHeight:'1.65',
    }}>
      <div style={{fontWeight:700, fontSize:12, color:'#00d4ff', marginBottom:6, letterSpacing:'0.03em'}}>
        {t.symbol}
        {t._virtualClose && <span style={{marginLeft:6, color:'#fbbf24', fontSize:9}}>⟳ abierta</span>}
        {isDiscarded && <span style={{marginLeft:6, color:'#6b7280', fontSize:9}}>✗ descartada</span>}
      </div>
      <div style={{display:'grid', gridTemplateColumns:'auto 1fr', gap:'1px 10px'}}>
        <span style={{color:'#4a6a8a'}}>Entrada:</span>
        <span style={{color:'#a8c4dc'}}>{fmtDateES(t.entryDate)}</span>

        <span style={{color:'#4a6a8a'}}>Salida:</span>
        <span style={{color:'#a8c4dc'}}>
          {t._virtualClose ? <span style={{color:'#fbbf24'}}>aún abierta</span> : fmtDateES(t.exitDate)}
        </span>

        {dias != null && <>
          <span style={{color:'#4a6a8a'}}>Días:</span>
          <span style={{color:'#a8c4dc'}}>{dias}</span>
        </>}

        <span style={{color:'#4a6a8a'}}>P&amp;L%:</span>
        <span style={{color:posColor, fontWeight:600}}>{fmtPct(pct)}</span>

        {pnlEur != null && <>
          <span style={{color:'#4a6a8a'}}>P&amp;L€:</span>
          <span style={{color:posColor, fontWeight:600}}>{fmtEur(isDiscarded ? pnlEur : t.pnlSimple ?? pnlEur)}</span>
        </>}
      </div>
      {isDiscarded && (
        <div style={{marginTop:7, paddingTop:6, borderTop:'1px solid #1a2d45', color:'#f59e0b', fontSize:9}}>
          ⚠ Señal descartada (sin slot disponible)
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// GANTT CHART
// ══════════════════════════════════════════════════════════════════════════════
export default function GanttChart({
  trades = [],
  startDate,
  endDate,
  slotCapital,
  onRequestDiscarded,
  discardedTrades = null,
  loadingDiscarded = false,
}) {
  // ── Rango global ───────────────────────────────────────────────────────────
  const overallStart = useMemo(() => {
    const sd = startDate ? dateToMs(startDate) : null
    const td = trades.filter(t => t.entryDate).map(t => dateToMs(t.entryDate))
    return sd ?? (td.length ? Math.min(...td) : Date.now() - 365 * 86400000)
  }, [startDate, trades])

  const overallEnd = useMemo(() => {
    const ed = endDate ? dateToMs(endDate) : null
    const td = trades.filter(t => t.exitDate || t.entryDate).map(t => dateToMs(t.exitDate || t.entryDate))
    const today = Date.now()
    return ed ?? (td.length ? Math.max(...td, today) : today)
  }, [endDate, trades])

  // ── Visible range (zoom state) ────────────────────────────────────────────
  const [vStart, setVStart] = useState(overallStart)
  const [vEnd,   setVEnd]   = useState(overallEnd)

  // Re-initialise when data changes (new mcResult)
  useEffect(() => {
    setVStart(overallStart)
    setVEnd(overallEnd)
  }, [overallStart, overallEnd])

  const vRange = vEnd - vStart

  // ── Container width (measured) ────────────────────────────────────────────
  const barsContainerRef = useRef(null)
  const [containerW, setContainerW] = useState(600)

  useEffect(() => {
    const el = barsContainerRef.current
    if (!el) return
    const obs = new ResizeObserver(([e]) => setContainerW(e.contentRect.width))
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  // ── x mapping ─────────────────────────────────────────────────────────────
  const msToX = useCallback(ms => (ms - vStart) / vRange * containerW, [vStart, vRange, containerW])

  // ── Symbols (sorted, only with trades) ───────────────────────────────────
  const symbols = useMemo(() => {
    const s = new Set(trades.filter(t => t.entryDate && (t.exitDate || t._virtualClose)).map(t => t.symbol))
    return [...s].sort()
  }, [trades])

  // ── Month markers ─────────────────────────────────────────────────────────
  const monthMarkers = useMemo(() => genMonthMarkers(vStart, vEnd), [vStart, vEnd])

  // ── Today ─────────────────────────────────────────────────────────────────
  const todayMs = useMemo(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d.getTime()
  }, [])
  const todayX   = todayMs >= vStart && todayMs <= vEnd ? msToX(todayMs) : null

  // ── Toggle descartados ────────────────────────────────────────────────────
  const [showDiscarded, setShowDiscarded] = useState(false)
  const discardedRequested = useRef(false)

  function handleToggleDiscarded(checked) {
    setShowDiscarded(checked)
    if (checked && !discardedRequested.current) {
      discardedRequested.current = true
      onRequestDiscarded?.()
    }
  }

  // ── Tooltip state ─────────────────────────────────────────────────────────
  const [tooltip, setTooltip] = useState(null) // {trade, mouseX, mouseY, isDiscarded}

  // ── Wheel handler (zoom + scroll) ─────────────────────────────────────────
  const scrollRef = useRef(null)

  const handleWheel = useCallback(e => {
    e.preventDefault()
    if (e.ctrlKey || e.metaKey) {
      // Zoom centrado en la posición del ratón horizontalmente
      const rect = barsContainerRef.current?.getBoundingClientRect()
      const mouseX = rect ? e.clientX - rect.left : containerW / 2
      const mouseMs = vStart + (mouseX / containerW) * vRange
      const factor  = e.deltaY > 0 ? 1.25 : 0.8
      const newRange = Math.max(vRange * factor, 3 * 86400000) // mínimo 3 días
      const newStart = mouseMs - (mouseX / containerW) * newRange
      const { start, end } = clampRange(newStart, newStart + newRange, overallStart, overallEnd)
      setVStart(start); setVEnd(end)
    } else {
      // Scroll horizontal
      const delta = e.shiftKey ? e.deltaY : (e.deltaX || e.deltaY)
      const shift = (delta / containerW) * vRange
      const { start, end } = clampRange(vStart + shift, vEnd + shift, overallStart, overallEnd)
      setVStart(start); setVEnd(end)
    }
  }, [vStart, vEnd, vRange, containerW, overallStart, overallEnd])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [handleWheel])

  // ── Zoom buttons ──────────────────────────────────────────────────────────
  function zoomIn() {
    const center = (vStart + vEnd) / 2
    const nr = Math.max(vRange * 0.65, 3 * 86400000)
    const { start, end } = clampRange(center - nr / 2, center + nr / 2, overallStart, overallEnd)
    setVStart(start); setVEnd(end)
  }
  function zoomOut() {
    const center = (vStart + vEnd) / 2
    const nr = Math.min(vRange / 0.65, overallEnd - overallStart)
    const { start, end } = clampRange(center - nr / 2, center + nr / 2, overallStart, overallEnd)
    setVStart(start); setVEnd(end)
  }
  function resetZoom() { setVStart(overallStart); setVEnd(overallEnd) }

  // ── SVG total height ──────────────────────────────────────────────────────
  const totalBarsH = symbols.length * ROW_H

  // ── BtnStyle helper ───────────────────────────────────────────────────────
  const btnSt = (active) => ({
    padding:'2px 9px', fontFamily:MONO, fontSize:10, borderRadius:3, cursor:'pointer',
    border:`1px solid ${active?'#1a3a5c':'#1a2d45'}`,
    background:active?'rgba(0,212,255,0.08)':'transparent',
    color:active?'#00d4ff':'#4a7a9a',
  })

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{display:'flex', flexDirection:'column', height:'100%', fontFamily:MONO, userSelect:'none'}}>

      {/* ── TOOLBAR ─────────────────────────────────────────────────────── */}
      <div style={{flexShrink:0, padding:'5px 12px', borderBottom:'1px solid #1a2d45',
        display:'flex', gap:6, alignItems:'center', background:'#060d18'}}>
        <button style={btnSt(false)} onClick={zoomIn}  title="Zoom in (Ctrl+rueda)">＋</button>
        <button style={btnSt(false)} onClick={zoomOut} title="Zoom out (Ctrl+rueda)">－</button>
        <button style={btnSt(false)} onClick={resetZoom} title="Ver período completo">↺ Reset</button>
        <div style={{width:1, height:14, background:'#1a2d45', margin:'0 4px'}} />
        <label style={{display:'flex', alignItems:'center', gap:5, cursor:'pointer', color:'#6b7280', fontSize:10}}>
          <input
            type="checkbox"
            checked={showDiscarded}
            onChange={e => handleToggleDiscarded(e.target.checked)}
            style={{accentColor:'#6b7280'}}
          />
          Mostrar descartados
        </label>
        {loadingDiscarded && (
          <span style={{color:'#4a7a9a', fontSize:9}}>⏳ cargando…</span>
        )}
        {showDiscarded && discardedTrades && (
          <span style={{color:'#6b7280', fontSize:9}}>
            ({discardedTrades.length} señales descartadas)
          </span>
        )}
        <div style={{marginLeft:'auto', color:'#2a3a50', fontSize:9}}>
          Ctrl+rueda: zoom · rueda: scroll · Shift+rueda: scroll rápido
        </div>
      </div>

      {/* ── HEADER: mes/año labels ───────────────────────────────────────── */}
      <div style={{flexShrink:0, display:'flex', background:'#080e1a', borderBottom:'1px solid #1a2d45'}}>
        {/* Placeholder para la columna de etiquetas */}
        <div style={{width:LABEL_W, flexShrink:0, borderRight:'1px solid #1a2d45'}} />
        {/* Meses */}
        <div style={{flex:1, position:'relative', height:HEADER_H, overflow:'hidden'}}>
          {monthMarkers.map((m, i) => {
            const x = msToX(m.ms)
            if (x < -80 || x > containerW + 20) return null
            const isJan = m.month === 0
            return (
              <div key={`${m.year}-${m.month}`} style={{position:'absolute', left:x, top:0, pointerEvents:'none'}}>
                <div style={{position:'absolute', left:0, top:0, bottom:0, width:1, background:isJan?'#1a3a5c':'#111d2e'}} />
                {isJan && (
                  <div style={{position:'absolute', left:4, top:4, fontSize:11, fontWeight:700, color:'#00d4ff', whiteSpace:'nowrap'}}>
                    {m.year}
                  </div>
                )}
                <div style={{position:'absolute', left:4, top:isJan?22:10, fontSize:9, color:isJan?'#3d7a9a':'#2a4a5a', whiteSpace:'nowrap'}}>
                  {MONTHS_ES[m.month]}
                </div>
              </div>
            )
          })}
          {/* Label "Hoy" en header */}
          {todayX != null && (
            <div style={{position:'absolute', left:todayX + 3, top:6, fontSize:8, color:'#fbbf24', pointerEvents:'none', whiteSpace:'nowrap'}}>
              Hoy
            </div>
          )}
        </div>
      </div>

      {/* ── CONTENT: etiquetas + barras ─────────────────────────────────── */}
      <div
        ref={scrollRef}
        style={{flex:1, minHeight:0, overflowY:'auto', overflowX:'hidden', display:'flex', position:'relative'}}
      >
        {/* Columna de etiquetas (fija horizontalmente) */}
        <div style={{width:LABEL_W, flexShrink:0, borderRight:'1px solid #1a2d45', background:'#060d18'}}>
          {symbols.map((sym, i) => (
            <div key={sym} style={{
              height:ROW_H, padding:'0 6px', display:'flex', alignItems:'center',
              borderBottom:'1px solid #111d2e',
              background:i % 2 === 0 ? '#080e1a' : '#060c16',
              fontSize:9, color:'#7aa0be', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
            }} title={sym}>
              {sym}
            </div>
          ))}
        </div>

        {/* Área de barras */}
        <div ref={barsContainerRef} style={{flex:1, position:'relative', minWidth:0}}>
          <svg
            width={containerW}
            height={Math.max(totalBarsH, 1)}
            style={{display:'block', overflow:'visible'}}
          >
            {/* ── Fondo alternado de filas ── */}
            {symbols.map((_, i) => (
              <rect key={i} x={0} y={i * ROW_H} width={containerW} height={ROW_H}
                fill={i % 2 === 0 ? '#080e1a' : '#060c16'} />
            ))}

            {/* ── Grid vertical: líneas de mes ── */}
            {monthMarkers.map(m => {
              const x = msToX(m.ms)
              if (x < 0 || x > containerW) return null
              return (
                <line key={`${m.year}-${m.month}`}
                  x1={x} y1={0} x2={x} y2={totalBarsH}
                  stroke={m.month === 0 ? '#1a3a5c' : '#111d2e'}
                  strokeWidth={m.month === 0 ? 1 : 0.5} />
              )
            })}

            {/* ── Línea "Hoy" ── */}
            {todayX != null && (
              <line x1={todayX} y1={0} x2={todayX} y2={totalBarsH}
                stroke="#fbbf24" strokeWidth={1} strokeDasharray="4 3" />
            )}

            {/* ── Barras: señales DESCARTADAS (debajo de las ejecutadas) ── */}
            {showDiscarded && discardedTrades && symbols.map((sym, si) => {
              const symDisc = discardedTrades.filter(t => t.symbol === sym && t.entryDate && t.exitDate)
              return symDisc.map((t, ti) => {
                const x1 = msToX(dateToMs(t.entryDate))
                const x2 = msToX(dateToMs(t.exitDate))
                const bx = Math.max(0, x1)
                const bw = Math.max(2, Math.min(containerW, x2) - bx)
                if (x2 < -2 || x1 > containerW + 2) return null
                const y = si * ROW_H + BAR_PAD
                const h = ROW_H - BAR_PAD * 2
                return (
                  <g key={`disc-${sym}-${t.entryDate}-${ti}`}
                    style={{cursor:'pointer'}}
                    onMouseEnter={ev => setTooltip({trade:t, mouseX:ev.clientX, mouseY:ev.clientY, isDiscarded:true})}
                    onMouseMove={ev  => setTooltip(p => p ? {...p, mouseX:ev.clientX, mouseY:ev.clientY} : null)}
                    onMouseLeave={() => setTooltip(null)}>
                    <rect x={bx} y={y} width={bw} height={h}
                      fill="rgba(107,114,128,0.22)" rx={2}
                      stroke="#6b7280" strokeWidth={0.8} strokeDasharray="3 2" />
                    {bw >= MIN_TEXT_W && (
                      <text x={bx + 4} y={y + h / 2 + 3.5} fontSize={7.5}
                        fill="#6b7280" fontFamily="monospace">
                        {fmtPct(t.pnlPct)}
                      </text>
                    )}
                  </g>
                )
              })
            })}

            {/* ── Barras: señales EJECUTADAS ── */}
            {symbols.map((sym, si) => {
              const symTrades = trades.filter(t =>
                t.symbol === sym && t.entryDate && (t.exitDate || t._virtualClose))
              return symTrades.map((t, ti) => {
                const exitDate = t.exitDate || endDate || new Date().toISOString().split('T')[0]
                const x1 = msToX(dateToMs(t.entryDate))
                const x2 = msToX(dateToMs(exitDate))
                const bx = Math.max(0, x1)
                const bw = Math.max(2, Math.min(containerW, x2) - bx)
                if (x2 < -2 || x1 > containerW + 2) return null
                const y = si * ROW_H + BAR_PAD
                const h = ROW_H - BAR_PAD * 2
                const color = barColor(t.pnlPct)
                return (
                  <g key={`exec-${sym}-${t.entryDate}-${ti}`}
                    style={{cursor:'pointer'}}
                    onMouseEnter={ev => setTooltip({trade:t, mouseX:ev.clientX, mouseY:ev.clientY, isDiscarded:false})}
                    onMouseMove={ev  => setTooltip(p => p ? {...p, mouseX:ev.clientX, mouseY:ev.clientY} : null)}
                    onMouseLeave={() => setTooltip(null)}>
                    <rect x={bx} y={y} width={bw} height={h}
                      fill={color} rx={2}
                      stroke={t._virtualClose ? '#fbbf24' : 'transparent'}
                      strokeWidth={t._virtualClose ? 1 : 0}
                      strokeDasharray={t._virtualClose ? '3 2' : null} />
                    {bw >= MIN_TEXT_W && (
                      <text x={bx + 4} y={y + h / 2 + 3.5} fontSize={7.5}
                        fill="rgba(255,255,255,0.88)" fontFamily="monospace">
                        {fmtPct(t.pnlPct)}
                      </text>
                    )}
                  </g>
                )
              })
            })}

            {/* ── Líneas horizontales separadoras de fila ── */}
            {symbols.map((_, i) => (
              <line key={`hl-${i}`} x1={0} y1={(i + 1) * ROW_H} x2={containerW} y2={(i + 1) * ROW_H}
                stroke="#111d2e" strokeWidth={0.5} />
            ))}
          </svg>
        </div>
      </div>

      {/* ── TOOLTIP ─────────────────────────────────────────────────────── */}
      {tooltip && (
        <GanttTooltip
          trade={tooltip.trade}
          mouseX={tooltip.mouseX}
          mouseY={tooltip.mouseY}
          isDiscarded={tooltip.isDiscarded}
          slotCapital={slotCapital}
        />
      )}
    </div>
  )
}
