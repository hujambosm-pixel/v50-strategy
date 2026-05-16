// McMonthlyGainsChart — Ganancias mensuales por estrategia (recharts)
// Importado con ssr:false desde pages/index.js para evitar problemas de SSR
import { useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ReferenceLine, ResponsiveContainer
} from 'recharts'

const MONO = '"JetBrains Mono","Fira Code","IBM Plex Mono",monospace'

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

export default function McMonthlyGainsChart({ series = [], capitalIni }) {
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

  // Show at most one tick label every N months to avoid crowding
  const tickEvery = data.length > 48 ? 6 : data.length > 24 ? 3 : data.length > 12 ? 2 : 1
  const xTicks = allMonths.filter((_, i) => i % tickEvery === 0)

  // FIX 1: right-axis width mirrors lightweight-charts rightPriceScale width (~58px)
  const yAxisWidth = 58

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
            data={data}
            margin={{ top: 4, right: 0, left: 4, bottom: 2 }}
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
            {/* FIX 2: YAxis a la derecha, alineado con rightPriceScale de lightweight-charts */}
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
            {/* FIX 3: color fijo por estrategia, sin Cell verde/rojo */}
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
