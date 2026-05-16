// McMonthlyGainsChart — Ganancias mensuales por estrategia (recharts)
// Importado con ssr:false desde pages/index.js para evitar problemas de SSR
import { useMemo, useState, useEffect } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ReferenceLine, ResponsiveContainer
} from 'recharts'

const MONO = '"JetBrains Mono","Fira Code","IBM Plex Mono",monospace'

// LW visible range values can be date strings ('YYYY-MM-DD') or Unix timestamps (seconds)
function rangeValToMonth(v) {
  if (!v && v !== 0) return null
  if (typeof v === 'number') return new Date(v * 1000).toISOString().slice(0, 7)
  return String(v).slice(0, 7)
}

function computeMonthlyGains(curve, capitalIni) {
  if (!curve?.length) return {}
  const byMonth = {}
  curve.forEach(p => {
    const date = p.date || (p.time ? String(p.time) : null)
    if (date) byMonth[date.slice(0, 7)] = p.value
  })
  const months = Object.keys(byMonth).sort()
  const result = {}
  months.forEach((m, i) => {
    result[m] = byMonth[m] - (i === 0 ? capitalIni : byMonth[months[i - 1]])
  })
  return result
}

function fmtMonth(m) {
  // 'YYYY-MM' → 'MM/YY'
  if (!m || m.length < 7) return m
  return `${m.slice(5, 7)}/${m.slice(2, 4)}`
}

export default function McMonthlyGainsChart({ series = [], capitalIni, syncRef }) {
  // FIX 1: track the visible time range published by the LW sync bus
  const [visibleRange, setVisibleRange] = useState(null)

  useEffect(() => {
    if (!syncRef?.current) return
    const id = Symbol()
    const handler = (range) => {
      if (!range) return
      setVisibleRange({
        from: rangeValToMonth(range.from),
        to:   rangeValToMonth(range.to),
      })
    }
    syncRef.current.listeners.push({ id, handler })
    return () => {
      if (syncRef.current)
        syncRef.current.listeners = syncRef.current.listeners.filter(e => e.id !== id)
    }
  }, [syncRef])

  const validSeries = useMemo(
    () => series.filter(s => s.compoundCurve?.length),
    [series]
  )

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
        row[s.id] = monthlyBySeries[s.id][month] ?? null
      })
      return row
    })
    return { data, allMonths }
  }, [validSeries, capitalIni])

  if (!validSeries.length || !data.length) return null

  // FIX 1: filter to visible range when sync provides one
  const displayData = visibleRange?.from && visibleRange?.to
    ? data.filter(d => d.month >= visibleRange.from && d.month <= visibleRange.to)
    : data

  const months = displayData.map(d => d.month)

  // Show at most one tick label every N months to avoid crowding
  const tickEvery = months.length > 48 ? 6 : months.length > 24 ? 3 : months.length > 12 ? 2 : 1
  const xTicks = months.filter((_, i) => i % tickEvery === 0)

  // FIX 2: right-axis width — LW rightPriceScale auto-sizes; 56px matches typical
  // auto-width for financial values (no explicit width set in LW chart options)
  const yAxisWidth = 56

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null
    return (
      <div style={{
        background: '#0a1628', border: '1px solid #1a3d6d', borderRadius: 4,
        padding: '5px 9px', fontFamily: MONO, fontSize: 10
      }}>
        <div style={{ color: '#7aabcc', marginBottom: 3 }}>{fmtMonth(label)}</div>
        {payload.map(p => {
          const s = validSeries.find(x => x.id === p.dataKey)
          const v = Math.round(p.value || 0)
          const color = s?.color || '#7aabcc'
          return (
            <div key={p.dataKey} style={{ display: 'flex', gap: 6 }}>
              <span style={{ color: '#4a6a88' }}>{s?.name || p.dataKey}:</span>
              <span style={{ color }}>{v >= 0 ? '+' : ''}{v.toLocaleString('es-ES')}€</span>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div style={{ borderTop: '1px solid var(--border)' }}>
      <div style={{
        padding: '3px 12px 2px', display: 'flex', alignItems: 'center',
        gap: 6, fontFamily: MONO, fontSize: 11
      }}>
        <span style={{ color: '#00e5a0', fontWeight: 600 }}>Ganancias mensuales</span>
      </div>
      <div style={{ height: 110 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={displayData}
            margin={{ top: 4, right: 0, left: 0, bottom: 2 }}
            barCategoryGap="20%"
            barGap={1}
          >
            <XAxis
              dataKey="month"
              ticks={xTicks}
              tickFormatter={fmtMonth}
              tick={{ fill: '#4a6a88', fontSize: 8, fontFamily: MONO }}
              axisLine={{ stroke: '#1a2d45' }}
              tickLine={false}
            />
            {/* FIX 2: orientation=right, width matches LW rightPriceScale auto-width */}
            <YAxis
              orientation="right"
              tickFormatter={v => {
                const n = Math.abs(Math.round(v))
                if (n >= 1000000) return (v >= 0 ? '+' : '-') + (n / 1000000).toFixed(1) + 'M€'
                if (n >= 1000) return (v >= 0 ? '+' : '-') + (n / 1000).toFixed(0) + 'k€'
                return (v >= 0 ? '+' : '') + Math.round(v) + '€'
              }}
              tick={{ fill: '#4a6a88', fontSize: 8, fontFamily: MONO }}
              axisLine={false}
              tickLine={false}
              width={yAxisWidth}
            />
            <ReferenceLine y={0} stroke="rgba(255,255,255,0.12)" />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(0,212,255,0.06)' }} />
            {validSeries.map(s => (
              <Bar
                key={s.id}
                dataKey={s.id}
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
