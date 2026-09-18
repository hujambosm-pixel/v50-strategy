// components/FundamentalsAnnualChart.js — barras agrupadas de ingresos y beneficio neto por ejercicio.
// Se carga con ssr:false desde FundamentalsPanel, igual que McMonthlyGainsChart, por recharts.
//
// Dos series por año: ingresos en azul y beneficio en verde. El BPA NO entra: su escala es de otro
// orden (euros por acción frente a miles de millones) y aplastaría las barras contra el cero.
// Los años sin dato no pintan barra (recharts salta los null) y los beneficios negativos bajan del
// cero, en rojo: una barra verde por debajo del eje se lee como positiva de un vistazo.
import { BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer, CartesianGrid } from 'recharts'
import { MONO } from '../lib/utils'

export const COLOR_INGRESOS = '#378add'
export const COLOR_BENEFICIO = '#00e5a0'
export const COLOR_PERDIDA = '#ff5d5d'
const TICK = '#7a9bc0'
const REJILLA = '#1a2d45'

export default function FundamentalsAnnualChart({ datos, fmt, fmtEje }) {
  const filas = (datos || []).filter(a => a && (a.ingresos != null || a.beneficio != null))
  if (!filas.length) return null
  const hayPerdidas = filas.some(a => a.beneficio < 0)
  // Con pocos años las barras se vuelven gigantes; con muchos, hilos. El tope las mantiene legibles.
  const anchoBarra = filas.length <= 2 ? 54 : filas.length <= 4 ? 46 : filas.length <= 8 ? 34 : 22

  const Globo = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null
    return (
      <div style={{ background: '#0a1628', border: '1px solid #1a3d6d', borderRadius: 4, padding: '6px 10px', fontFamily: MONO, fontSize: 11 }}>
        <div style={{ color: '#7aabcc', marginBottom: 4 }}>{label}</div>
        {payload.map(p => (
          <div key={p.dataKey} style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
            <span style={{ color: p.dataKey === 'ingresos' ? COLOR_INGRESOS : (p.value < 0 ? COLOR_PERDIDA : COLOR_BENEFICIO) }}>
              {p.dataKey === 'ingresos' ? 'Ingresos' : 'Beneficio neto'}
            </span>
            <span style={{ color: 'var(--text)', fontWeight: 600 }}>{fmt(p.value) ?? '—'}</span>
          </div>
        ))}
      </div>
    )
  }
  const Punto = ({ color, texto }) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'var(--text2)' }}>
      <span style={{ width: 9, height: 9, borderRadius: 2, background: color, display: 'inline-block' }} />{texto}
    </span>
  )

  return (
    <div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 6, fontFamily: MONO }}>
        <Punto color={COLOR_INGRESOS} texto="Ingresos" />
        <Punto color={COLOR_BENEFICIO} texto="Beneficio neto" />
        {hayPerdidas && <Punto color={COLOR_PERDIDA} texto="Pérdidas" />}
      </div>
      <div style={{ height: 230 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={filas} margin={{ top: 6, right: 4, left: 0, bottom: 2 }} barCategoryGap="22%" barGap={4}>
            <CartesianGrid vertical={false} stroke={REJILLA} strokeOpacity={0.8} />
            <XAxis dataKey="anio" tick={{ fill: TICK, fontSize: 11, fontFamily: MONO }} axisLine={{ stroke: REJILLA }} tickLine={false} />
            <YAxis orientation="right" tickFormatter={v => (fmtEje || fmt)(v) ?? ''} tickCount={5} width={64}
              tick={{ fill: TICK, fontSize: 10, fontFamily: MONO }} axisLine={false} tickLine={false} />
            <ReferenceLine y={0} stroke="rgba(255,255,255,0.22)" strokeWidth={1} />
            <Tooltip content={<Globo />} cursor={{ fill: 'rgba(0,212,255,0.06)' }} />
            <Bar dataKey="ingresos" fill={COLOR_INGRESOS} maxBarSize={anchoBarra} isAnimationActive={false} radius={[2, 2, 0, 0]} />
            <Bar dataKey="beneficio" fill={COLOR_BENEFICIO} maxBarSize={anchoBarra} isAnimationActive={false} radius={[2, 2, 0, 0]}>
              {filas.map((a, i) => <Cell key={i} fill={a.beneficio < 0 ? COLOR_PERDIDA : COLOR_BENEFICIO} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
