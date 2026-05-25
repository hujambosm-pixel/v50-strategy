// components/GanttChart.js — Diagrama de Gantt interactivo de operaciones multiactivo
// SVG + HTML. Zoom/scroll custom; sin overflow-x nativo.

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'

const MONO = "'JetBrains Mono', 'Fira Mono', 'Cascadia Code', monospace"

const LABEL_W   = 90  // ancho columna activos (px)
const YEAR_ROW_H  = 20 // altura fila "años" (px)
const MONTH_ROW_H = 18 // altura fila "meses" (px)
const HEADER_H  = YEAR_ROW_H + MONTH_ROW_H  // 38 px total
const ROW_H     = 26  // altura de fila por activo (px)
const BAR_PAD   = 3   // padding vertical dentro de la fila

// Umbrales de texto en barras
const TEXT_NONE = 14  // < 14 px → sin texto
const TEXT_FULL = 40  // >= 40 px → mostrar número+%

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

// ── Agrupar monthMarkers por año ─────────────────────────────────────────────
function groupByYear(monthMarkers) {
  const groups = []
  let cur = null
  monthMarkers.forEach((m, i) => {
    if (m.year !== cur?.year) {
      cur = { year: m.year, firstIdx: i, lastIdx: i }
      groups.push(cur)
    } else {
      cur.lastIdx = i
    }
  })
  return groups
}

// ══════════════════════════════════════════════════════════════════════════════
// TOOLTIP
// ══════════════════════════════════════════════════════════════════════════════
function GanttTooltip({ trade, mouseX, mouseY, isDiscarded, slotCapital }) {
  const t = trade
  const capInv = t._capitalAtEntry != null ? t._capitalAtEntry : slotCapital
  const pnlEur = t.pnlSimple != null
    ? t.pnlSimple
    : capInv != null ? capInv * (t.pnlPct || 0) / 100 : null
  const dias = t.dias != null
    ? t.dias
    : (t.entryDate && t.exitDate
        ? Math.round((dateToMs(t.exitDate) - dateToMs(t.entryDate)) / 86400000)
        : null)

  const W   = 235
  const H   = (capInv != null ? 195 : 175) + (isDiscarded ? 30 : 0)
  const left = mouseX + 14 + W > (typeof window !== 'undefined' ? window.innerWidth  : 1200) ? mouseX - W - 10 : mouseX + 14
  const top  = mouseY + 14 + H > (typeof window !== 'undefined' ? window.innerHeight : 800)  ? mouseY - H - 10 : mouseY + 14
  const pct  = t.pnlPct || 0
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
      <div style={{fontWeight:700, fontSize:12, color:'#00d4ff', marginBottom:6}}>
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
        {capInv != null && <>
          <span style={{color:'#4a6a8a'}}>Capital inv.:</span>
          <span style={{color:'#c8dff5'}}>{fmtEur(capInv)}</span>
        </>}
        <span style={{color:'#4a6a8a'}}>P&amp;L%:</span>
        <span style={{color:posColor, fontWeight:600}}>{fmtPct(pct)}</span>
        {pnlEur != null && <>
          <span style={{color:'#4a6a8a'}}>P&amp;L€:</span>
          <span style={{color:posColor, fontWeight:600}}>{fmtEur(pnlEur)}</span>
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

  // ── Visible range ─────────────────────────────────────────────────────────
  const [vStart, setVStart] = useState(overallStart)
  const [vEnd,   setVEnd]   = useState(overallEnd)
  useEffect(() => { setVStart(overallStart); setVEnd(overallEnd) }, [overallStart, overallEnd])
  const vRange = vEnd - vStart

  // ── Container width ───────────────────────────────────────────────────────
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

  // ── Symbols ───────────────────────────────────────────────────────────────
  const symbols = useMemo(() => {
    const s = new Set(trades.filter(t => t.entryDate && (t.exitDate || t._virtualClose)).map(t => t.symbol))
    return [...s].sort()
  }, [trades])

  // ── Month markers + year groups ───────────────────────────────────────────
  const monthMarkers = useMemo(() => genMonthMarkers(vStart, vEnd), [vStart, vEnd])
  const yearGroups   = useMemo(() => groupByYear(monthMarkers), [monthMarkers])

  // ── Today ─────────────────────────────────────────────────────────────────
  const todayMs = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d.getTime() }, [])
  const todayX  = todayMs >= vStart && todayMs <= vEnd ? msToX(todayMs) : null

  // ── Descartados toggle ────────────────────────────────────────────────────
  const [showDiscarded, setShowDiscarded] = useState(false)
  const discardedRequested = useRef(false)
  function handleToggleDiscarded(checked) {
    setShowDiscarded(checked)
    if (checked && !discardedRequested.current) { discardedRequested.current = true; onRequestDiscarded?.() }
  }

  // ── Tooltip ───────────────────────────────────────────────────────────────
  const [tooltip, setTooltip] = useState(null)

  // ── Wheel handler ─────────────────────────────────────────────────────────
  const scrollRef = useRef(null)
  const handleWheel = useCallback(e => {
    e.preventDefault()
    if (e.ctrlKey || e.metaKey) {
      const rect = barsContainerRef.current?.getBoundingClientRect()
      const mouseX = rect ? e.clientX - rect.left : containerW / 2
      const mouseMs = vStart + (mouseX / containerW) * vRange
      const factor  = e.deltaY > 0 ? 1.25 : 0.8
      const newRange = Math.max(vRange * factor, 3 * 86400000)
      const { start, end } = clampRange(mouseMs - (mouseX / containerW) * newRange,
        mouseMs + (1 - mouseX / containerW) * newRange, overallStart, overallEnd)
      setVStart(start); setVEnd(end)
    } else {
      const delta = e.shiftKey ? e.deltaY : (e.deltaX || e.deltaY)
      const { start, end } = clampRange(vStart + delta / containerW * vRange,
        vEnd + delta / containerW * vRange, overallStart, overallEnd)
      setVStart(start); setVEnd(end)
    }
  }, [vStart, vEnd, vRange, containerW, overallStart, overallEnd])
  useEffect(() => {
    const el = scrollRef.current; if (!el) return
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [handleWheel])

  // ── Zoom buttons ──────────────────────────────────────────────────────────
  function zoomIn()  { const c=(vStart+vEnd)/2, nr=Math.max(vRange*0.65, 3*86400000); const {start,end}=clampRange(c-nr/2,c+nr/2,overallStart,overallEnd); setVStart(start);setVEnd(end) }
  function zoomOut() { const c=(vStart+vEnd)/2, nr=Math.min(vRange/0.65, overallEnd-overallStart); const {start,end}=clampRange(c-nr/2,c+nr/2,overallStart,overallEnd); setVStart(start);setVEnd(end) }
  function resetZoom() { setVStart(overallStart); setVEnd(overallEnd) }

  const totalBarsH = symbols.length * ROW_H
  const btnSt = () => ({ padding:'2px 9px', fontFamily:MONO, fontSize:10, borderRadius:3, cursor:'pointer', border:'1px solid #1a2d45', background:'transparent', color:'#4a7a9a' })

  // ── Bar text helper (inline, no clipPath) ─────────────────────────────────
  // bw = ancho REAL de la barra en px (pre-clamp, puede superar containerW).
  // La comparación con los umbrales usa el ancho completo para que barras
  // parcialmente fuera del viewport muestren texto en la porción visible.
  // textAnchor="end" pins text to the right edge — never overflows right.
  function barLabel(bw, pct) {
    if (pct == null) return null
    const r = Math.round(Math.abs(pct))   // siempre positivo; el color ya indica ganancia/pérdida
    if (bw >= TEXT_FULL) return r + '%'
    if (bw >= TEXT_NONE) return String(r)
    return null
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{display:'flex', flexDirection:'column', height:'100%', fontFamily:MONO, userSelect:'none'}}>

      {/* ── TOOLBAR ─────────────────────────────────────────────────────── */}
      <div style={{flexShrink:0, padding:'4px 10px', borderBottom:'1px solid #1a2d45',
        display:'flex', gap:5, alignItems:'center', background:'#060d18'}}>
        <button style={btnSt()} onClick={zoomIn}  title="Zoom in (Ctrl+rueda)">＋</button>
        <button style={btnSt()} onClick={zoomOut} title="Zoom out">－</button>
        <button style={btnSt()} onClick={resetZoom} title="Ver período completo">↺ Reset</button>
        <div style={{width:1, height:14, background:'#1a2d45', margin:'0 3px'}} />
        <label style={{display:'flex', alignItems:'center', gap:5, cursor:'pointer', color:'#6b7280', fontSize:10}}>
          <input type="checkbox" checked={showDiscarded} onChange={e => handleToggleDiscarded(e.target.checked)}
            style={{accentColor:'#6b7280'}} />
          Mostrar descartados
        </label>
        {loadingDiscarded && <span style={{color:'#4a7a9a', fontSize:9}}>⏳ cargando…</span>}
        {showDiscarded && discardedTrades && (
          <span style={{color:'#6b7280', fontSize:9}}>({discardedTrades.length} descartadas)</span>
        )}
        <div style={{marginLeft:'auto', color:'#1e2d3d', fontSize:9}}>Ctrl+rueda: zoom · rueda: scroll</div>
      </div>

      {/* ── HEADER ──────────────────────────────────────────────────────── */}
      {/* Dos filas: [años] sobre [meses] */}
      <div style={{flexShrink:0, display:'flex', borderBottom:'1px solid #2a3a5a'}}>
        {/* Spacer para la columna de etiquetas */}
        <div style={{width:LABEL_W, flexShrink:0, borderRight:'1px solid #2a3a5a',
          background:'#060d18'}} />

        {/* Columna de años + meses */}
        <div style={{flex:1, display:'flex', flexDirection:'column', minWidth:0}}>

          {/* ── FILA DE AÑOS ── */}
          <div style={{height:YEAR_ROW_H, position:'relative', overflow:'hidden',
            background:'#071929', borderBottom:'1px solid #1a3050'}}>
            {yearGroups.map(g => {
              // x del inicio del año (primer mes del grupo)
              const xStart = msToX(monthMarkers[g.firstIdx].ms)
              // x del inicio del año siguiente (o fin del container)
              const xEnd = g.lastIdx < monthMarkers.length - 1
                ? msToX(monthMarkers[g.lastIdx + 1].ms)
                : containerW
              // Solo renderizar si hay intersección con el área visible
              if (xEnd < 0 || xStart > containerW) return null
              const visStart = Math.max(0, xStart)
              const visEnd   = Math.min(containerW, xEnd)
              return (
                <div key={g.year} style={{
                  position:'absolute', left:visStart, width: visEnd - visStart,
                  top:0, bottom:0, overflow:'hidden',
                  display:'flex', alignItems:'center', justifyContent:'center',
                  borderLeft: xStart >= 0 ? '1px solid #2a3a5a' : 'none',
                  boxSizing:'border-box',
                }}>
                  <span style={{
                    fontSize:11, fontWeight:700, color:'#60a5fa',
                    whiteSpace:'nowrap', letterSpacing:'0.04em',
                  }}>{g.year}</span>
                </div>
              )
            })}
            {/* Label "Hoy" en la fila años */}
            {todayX != null && (
              <div style={{position:'absolute', left:todayX+3, top:2, fontSize:8,
                color:'#fbbf24', whiteSpace:'nowrap', pointerEvents:'none'}}>Hoy</div>
            )}
          </div>

          {/* ── FILA DE MESES ── */}
          <div style={{height:MONTH_ROW_H, position:'relative', overflow:'hidden',
            background:'#0f2942'}}>
            {monthMarkers.map(m => {
              const x = msToX(m.ms)
              if (x < -80 || x > containerW + 20) return null
              return (
                <div key={`${m.year}-${m.month}`} style={{
                  position:'absolute', left:x, top:0, bottom:0,
                  display:'flex', alignItems:'center',
                  pointerEvents:'none',
                }}>
                  <div style={{
                    position:'absolute', left:0, top:0, bottom:0, width:1,
                    background: m.month === 0 ? '#2a3a5a' : '#1a2a3a',
                  }} />
                  <span style={{
                    position:'absolute', left:4,
                    fontSize:9, color: m.month === 0 ? '#7ab8d4' : '#3d6a80',
                    whiteSpace:'nowrap',
                  }}>{MONTHS_ES[m.month]}</span>
                </div>
              )
            })}
            {/* Línea "Hoy" en meses */}
            {todayX != null && (
              <div style={{position:'absolute', left:todayX, top:0, bottom:0, width:1,
                background:'#fbbf2488', pointerEvents:'none'}} />
            )}
          </div>

        </div>
      </div>

      {/* ── CONTENT: etiquetas + barras ─────────────────────────────────── */}
      <div ref={scrollRef}
        style={{flex:1, minHeight:0, overflowY:'auto', overflowX:'hidden', display:'flex'}}>

        {/* Columna de etiquetas */}
        <div style={{width:LABEL_W, flexShrink:0, borderRight:'1px solid #2a3a5a', background:'#060d18'}}>
          {symbols.map((sym, i) => (
            <div key={sym} style={{
              height:ROW_H, padding:'0 6px', display:'flex', alignItems:'center',
              borderBottom:'1px solid #2a3a5a',
              background: i % 2 === 0 ? '#090f1c' : '#060c18',
              fontSize:9, color:'#7aa0be', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
            }} title={sym}>{sym}</div>
          ))}
        </div>

        {/* Área de barras */}
        <div ref={barsContainerRef} style={{flex:1, position:'relative', minWidth:0}}>
          <svg width={containerW} height={Math.max(totalBarsH, 1)} style={{display:'block'}}>

            {/* Fondo alternado */}
            {symbols.map((_, i) => (
              <rect key={`bg-${i}`} x={0} y={i*ROW_H} width={containerW} height={ROW_H}
                fill={i % 2 === 0 ? '#090f1c' : '#060c18'} />
            ))}

            {/* Grid vertical */}
            {monthMarkers.map(m => {
              const x = msToX(m.ms)
              if (x < 0 || x > containerW) return null
              return (
                <line key={`grid-${m.year}-${m.month}`}
                  x1={x} y1={0} x2={x} y2={totalBarsH}
                  stroke={m.month === 0 ? '#2a3a5a' : '#182030'}
                  strokeWidth={m.month === 0 ? 1 : 0.5} />
              )
            })}

            {/* Línea Hoy */}
            {todayX != null && (
              <line x1={todayX} y1={0} x2={todayX} y2={totalBarsH}
                stroke="#fbbf24" strokeWidth={1} strokeDasharray="4 3" />
            )}

            {/* Barras DESCARTADAS */}
            {showDiscarded && discardedTrades && symbols.map((sym, si) =>
              discardedTrades.filter(t => t.symbol === sym && t.entryDate && t.exitDate).map((t, ti) => {
                const x1 = msToX(dateToMs(t.entryDate))
                const x2 = msToX(dateToMs(t.exitDate))
                if (x2 < -2 || x1 > containerW + 2) return null
                const rawBw = x2 - x1                                         // ancho real pre-clamp
                const bx   = Math.max(0, x1)
                const bw   = Math.max(2, Math.min(containerW, x2) - bx)       // ancho visible renderizado
                const y = si * ROW_H + BAR_PAD, h = ROW_H - BAR_PAD * 2
                const label = barLabel(rawBw, t.pnlPct)
                return (
                  <g key={`disc-${sym}-${t.entryDate}-${ti}`} style={{cursor:'pointer'}}
                    onMouseEnter={ev => setTooltip({trade:t, mouseX:ev.clientX, mouseY:ev.clientY, isDiscarded:true})}
                    onMouseMove={ev  => setTooltip(p => p ? {...p, mouseX:ev.clientX, mouseY:ev.clientY} : null)}
                    onMouseLeave={() => setTooltip(null)}>
                    <rect x={bx} y={y} width={bw} height={h}
                      fill="rgba(107,114,128,0.22)" rx={2}
                      stroke="#6b7280" strokeWidth={0.8} strokeDasharray="3 2" />
                    {label && bw >= 6 && (
                      <text x={bx + bw - 3} y={y + h/2 + 3.5}
                        fontSize={rawBw >= TEXT_FULL ? 9 : 8} fontWeight="bold"
                        fill="#9ca3af" fontFamily="monospace" textAnchor="end">
                        {label}
                      </text>
                    )}
                  </g>
                )
              })
            )}

            {/* Barras EJECUTADAS */}
            {symbols.map((sym, si) =>
              trades.filter(t => t.symbol === sym && t.entryDate && (t.exitDate || t._virtualClose))
                .map((t, ti) => {
                  const exitDate = t.exitDate || endDate || new Date().toISOString().split('T')[0]
                  const x1 = msToX(dateToMs(t.entryDate))
                  const x2 = msToX(dateToMs(exitDate))
                  if (x2 < -2 || x1 > containerW + 2) return null
                  const rawBw = x2 - x1                                        // ancho real pre-clamp
                  const bx   = Math.max(0, x1)
                  const bw   = Math.max(2, Math.min(containerW, x2) - bx)      // ancho visible renderizado
                  const y = si * ROW_H + BAR_PAD, h = ROW_H - BAR_PAD * 2
                  const color = barColor(t.pnlPct)
                  const label = barLabel(rawBw, t.pnlPct)
                  return (
                    <g key={`exec-${sym}-${t.entryDate}-${ti}`} style={{cursor:'pointer'}}
                      onMouseEnter={ev => setTooltip({trade:t, mouseX:ev.clientX, mouseY:ev.clientY, isDiscarded:false})}
                      onMouseMove={ev  => setTooltip(p => p ? {...p, mouseX:ev.clientX, mouseY:ev.clientY} : null)}
                      onMouseLeave={() => setTooltip(null)}>
                      <rect x={bx} y={y} width={bw} height={h}
                        fill={color} rx={2}
                        stroke={t._virtualClose ? '#fbbf24' : 'transparent'}
                        strokeWidth={t._virtualClose ? 1 : 0}
                        strokeDasharray={t._virtualClose ? '3 2' : null} />
                      {label && bw >= 6 && (
                        <text x={bx + bw - 3} y={y + h/2 + 3.5}
                          fontSize={rawBw >= TEXT_FULL ? 9 : 8} fontWeight="bold"
                          fill="#ffffff" fontFamily="monospace" textAnchor="end">
                          {label}
                        </text>
                      )}
                    </g>
                  )
                })
            )}

            {/* Separadores de fila */}
            {symbols.map((_, i) => (
              <line key={`hl-${i}`} x1={0} y1={(i+1)*ROW_H} x2={containerW} y2={(i+1)*ROW_H}
                stroke="#2a3a5a" strokeWidth={1} />
            ))}
          </svg>
        </div>
      </div>

      {/* TOOLTIP */}
      {tooltip && (
        <GanttTooltip trade={tooltip.trade} mouseX={tooltip.mouseX} mouseY={tooltip.mouseY}
          isDiscarded={tooltip.isDiscarded} slotCapital={slotCapital} />
      )}
    </div>
  )
}
