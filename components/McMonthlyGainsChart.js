// McMonthlyGainsChart — Ganancias mensuales por estrategia (recharts)
// Importado con ssr:false desde pages/index.js para evitar problemas de SSR
import { useMemo, useState, useEffect } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ReferenceLine, ResponsiveContainer, CartesianGrid
} from 'recharts'

const MONO = '"JetBrains Mono","Fira Code","IBM Plex Mono",monospace'

// Fallback right-gutter width. The real value is the equity LW chart's measured
// rightPriceScale width, passed in via the `axisWidth` prop so this chart's plot
// area ends at exactly the same x as the equity chart.
const Y_AXIS_W_DEFAULT = 72

// LW visible range values can be date strings ('YYYY-MM-DD') or Unix timestamps (seconds)
function rangeValToMonth(v) {
  if (!v && v !== 0) return null
  if (typeof v === 'number') return new Date(v * 1000).toISOString().slice(0, 7)
  return String(v).slice(0, 7)
}

function computeMonthlyGains(curve, capitalIni) {
  if (!curve?.length) return {}
  const firstByMonth = {}
  const lastByMonth = {}
  curve.forEach(p => {
    const date = p.date || (p.time ? String(p.time) : null)
    if (!date) return
    const m = date.slice(0, 7)
    if (firstByMonth[m] === undefined) firstByMonth[m] = p.value
    lastByMonth[m] = p.value
  })
  const months = Object.keys(lastByMonth).sort()
  const result = {}
  months.forEach((m, i) => {
    // curr = first point of next month (cross-month gaps go into the earlier month),
    // or last point of this month if it's the terminal month.
    const nextM = months[i + 1]
    const curr = nextM !== undefined ? firstByMonth[nextM] : lastByMonth[m]
    const prev = i === 0 ? capitalIni : firstByMonth[m]
    result[m] = {
      eur: curr - prev,
      pct: prev > 0 ? (curr - prev) / prev * 100 : 0,
    }
  })
  return result
}

function fmtMonth(m) {
  if (!m || m.length < 7) return m
  return `${m.slice(5, 7)}/${m.slice(2, 4)}`
}

function fmtEur(v) {
  const n = Math.round(v || 0)
  const abs = Math.abs(n)
  if (abs >= 1000000) return (n >= 0 ? '+' : '-') + (abs / 1000000).toFixed(1) + 'M€'
  if (abs >= 1000)    return (n >= 0 ? '+' : '-') + (abs / 1000).toFixed(0) + 'k€'
  return (n >= 0 ? '+' : '') + n.toLocaleString('es-ES') + '€'
}

function fmtPct(v) {
  const n = v || 0
  return (n >= 0 ? '+' : '') + n.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%'
}

const TICK_COLOR = '#8899aa'
const TICK_SIZE  = 11
const GRID_COLOR = '#1a2a3a'

export default function McMonthlyGainsChart({ series = [], capitalIni, syncRef, axisWidth = Y_AXIS_W_DEFAULT }) {
  const [showPct, setShowPct] = useState(false)

  // FIX (sync): track the visible time range published by the LW sync bus
  const [visibleRange, setVisibleRange] = useState(null)
  useEffect(() => {
    if (!syncRef?.current) return
    const id = Symbol()
    const handler = (range) => {
      if (!range) return
      setVisibleRange({ from: rangeValToMonth(range.from), to: rangeValToMonth(range.to) })
    }
    syncRef.current.listeners.push({ id, handler })
    return () => {
      if (syncRef.current)
        syncRef.current.listeners = syncRef.current.listeners.filter(e => e.id !== id)
    }
  }, [syncRef])

  const validSeries = useMemo(() => series.filter(s => s.compoundCurve?.length), [series])

  const { data, allMonths } = useMemo(() => {
    if (!validSeries.length) return { data: [], allMonths: [] }
    const monthlyBySeries = {}
    const allMonthsSet = new Set()
    validSeries.forEach(s => {
      const m = computeMonthlyGains(s.compoundCurve, capitalIni)
      monthlyBySeries[s.id] = m
      Object.keys(m).forEach(k => allMonthsSet.add(k))
    })
    const allMonths = [...allMonthsSet].sort()
    const data = allMonths.map(month => {
      const row = { month }
      validSeries.forEach(s => {
        const g = monthlyBySeries[s.id][month]
        row[s.id + '_eur'] = g?.eur ?? null
        row[s.id + '_pct'] = g?.pct ?? null
      })
      return row
    })
    return { data, allMonths }
  }, [validSeries, capitalIni])

  if (!validSeries.length || !data.length) return null

  // Filter to visible range when sync provides one
  const displayData = visibleRange?.from && visibleRange?.to
    ? data.filter(d => d.month >= visibleRange.from && d.month <= visibleRange.to)
    : data

  const months = displayData.map(d => d.month)
  const tickEvery = months.length > 48 ? 6 : months.length > 24 ? 3 : months.length > 12 ? 2 : 1
  const xTicks = months.filter((_, i) => i % tickEvery === 0)

  const suffix = showPct ? '_pct' : '_eur'
  const fmtVal = showPct ? fmtPct : fmtEur
  const fmtAxis = showPct
    ? v => (v >= 0 ? '+' : '') + v.toFixed(1) + '%'
    : fmtEur

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null
    return (
      <div style={{
        background: '#0a1628', border: '1px solid #1a3d6d', borderRadius: 4,
        padding: '5px 9px', fontFamily: MONO, fontSize: 10
      }}>
        <div style={{ color: '#7aabcc', marginBottom: 3 }}>{fmtMonth(label)}</div>
        {payload.map(p => {
          const s = validSeries.find(x => x.id + suffix === p.dataKey)
          if (!s) return null
          const v = p.value ?? 0
          return (
            <div key={p.dataKey} style={{ display: 'flex', gap: 6 }}>
              <span style={{ color: '#4a6a88' }}>{s.name}:</span>
              <span style={{ color: s.color }}>{fmtVal(v)}</span>
            </div>
          )
        })}
      </div>
    )
  }

  const btnStyle = (active) => ({
    fontFamily: MONO, fontSize: 9, padding: '1px 6px', borderRadius: 3,
    cursor: 'pointer', border: `1px solid ${active ? '#00e5a0' : '#3d5a7a'}`,
    background: active ? 'rgba(0,229,160,0.12)' : 'transparent',
    color: active ? '#00e5a0' : '#4a6a88',
  })

  return (
    <div style={{ borderTop: '1px solid var(--border)' }}>
      <div style={{
        padding: '3px 12px 2px', display: 'flex', alignItems: 'center',
        gap: 6, fontFamily: MONO, fontSize: 11
      }}>
        <span style={{ color: '#00e5a0', fontWeight: 600 }}>Ganancias mensuales</span>
        <button style={btnStyle(!showPct)} onClick={() => setShowPct(false)}
          title="Ganancia del mes en euros: diferencia entre el primer día hábil del mes siguiente y el primer día hábil del mes actual">€</button>
        <button style={btnStyle(showPct)}  onClick={() => setShowPct(true)}
          title="Ganancia del mes en porcentaje: diferencia entre el primer día hábil del mes siguiente y el primer día hábil del mes actual, dividida entre el valor del primer día hábil del mes actual">%</button>
      </div>
      <div style={{ height: 180 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={displayData}
            margin={{ top: 4, right: 0, left: 0, bottom: 2 }}
            barCategoryGap="20%"
            barGap={1}
          >
            <CartesianGrid vertical={false} horizontal={true} stroke={GRID_COLOR} strokeOpacity={0.7} />
            <XAxis
              dataKey="month"
              ticks={xTicks}
              tickFormatter={fmtMonth}
              tick={{ fill: TICK_COLOR, fontSize: TICK_SIZE, fontFamily: MONO }}
              axisLine={{ stroke: '#1a2d45' }}
              tickLine={false}
            />
            <YAxis
              orientation="right"
              tickFormatter={fmtAxis}
              tickCount={5}
              tick={{ fill: TICK_COLOR, fontSize: TICK_SIZE, fontFamily: MONO }}
              axisLine={false}
              tickLine={false}
              width={axisWidth}
            />
            <ReferenceLine y={0} stroke="rgba(255,255,255,0.18)" strokeWidth={1} />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(0,212,255,0.06)' }} />
            {validSeries.map(s => (
              <Bar
                key={s.id}
                dataKey={s.id + suffix}
                fill={s.color}
                fillOpacity={0.85}
                maxBarSize={20}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
