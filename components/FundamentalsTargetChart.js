// components/FundamentalsTargetChart.js — precio del último año y proyección a 12 meses hacia los tres
// precios objetivo de los analistas (alto, medio y bajo).
// Se carga con ssr:false desde FundamentalsPanel, igual que FundamentalsAnnualChart, por recharts.
//
// Las tres rectas NACEN del último cierre real: ese punto lleva a la vez el precio histórico y los tres
// valores de proyección, así que el empalme es continuo y ninguna recta flota suelta. De ahí en adelante
// solo hay proyección —discontinua, para que no se lea como dato— y el histórico se corta, porque sus
// puntos futuros son null y las líneas van con connectNulls={false}.
import { useMemo } from 'react'
import { LineChart, Line, LabelList, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer, CartesianGrid } from 'recharts'
import { COLOR_INGRESOS, COLOR_BENEFICIO, COLOR_PERDIDA } from './FundamentalsAnnualChart'
import { MONO } from '../lib/utils'

// Mismos tonos de eje y rejilla que el gráfico de ingresos (allí son privados del módulo).
const TICK = '#7a9bc0'
const REJILLA = '#1a2d45'
const COLOR_HISTORICO = '#8aadcc'
const MESES = 12

const finito = (v) => typeof v === 'number' && Number.isFinite(v)
const esFecha = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)
const dec = (v, d = 2) => v.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d })

export default function FundamentalsTargetChart({ serie, precioActual, objetivoMedio, objetivoMax, objetivoMin, moneda, alto = 200 }) {
  const datos = useMemo(() => {
    if (![objetivoMedio, objetivoMax, objetivoMin].every(finito)) return []
    // Fechas únicas y ascendentes: el Map se queda con el último cierre de cada día y luego se ordena.
    // Un valor no finito no entra, así que ninguna serie puede acabar con NaN.
    const porFecha = new Map()
    for (const p of serie || []) if (p && esFecha(p.date) && finito(p.close)) porFecha.set(p.date, p.close)
    const fechas = [...porFecha.keys()].sort()
    if (fechas.length < 2) return []

    const ultima = fechas[fechas.length - 1]
    const cierre = porFecha.get(ultima)
    const filas = fechas.map(f => ({ fecha: f, precio: porFecha.get(f) }))
    // Punto de empalme: el último real lleva también los tres valores de proyección, todos al cierre.
    filas[filas.length - 1] = { ...filas[filas.length - 1], alto: cierre, medio: cierre, bajo: cierre }

    // 12 puntos, uno por mes. Aritmética de año y mes por separado, con el día acotado al último del mes
    // de destino: sumar meses con setMonth desbordaría (31 de enero + 1 mes = 3 de marzo) y podría
    // repetir fecha. El Set es el cinturón de seguridad de que ninguna se duplica.
    const vistas = new Set(fechas)
    const [a0, m0, d0] = ultima.split('-').map(Number)
    for (let i = 1; i <= MESES; i++) {
      const total = (m0 - 1) + i
      const anio = a0 + Math.floor(total / 12)
      const mes = total % 12                                    // 0-11
      const diasDelMes = new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate()
      const fecha = new Date(Date.UTC(anio, mes, Math.min(d0, diasDelMes))).toISOString().slice(0, 10)
      if (vistas.has(fecha)) continue
      vistas.add(fecha)
      const t = i / MESES                                       // interpolación lineal hasta el objetivo
      filas.push({
        fecha,
        alto:  cierre + (objetivoMax - cierre) * t,
        medio: cierre + (objetivoMedio - cierre) * t,
        bajo:  cierre + (objetivoMin - cierre) * t,
      })
    }
    return filas
  }, [serie, objetivoMedio, objetivoMax, objetivoMin])

  if (datos.length < 3) return null

  const simboloMoneda = moneda === 'USD' ? '$' : moneda === 'EUR' ? '€' : moneda ? ` ${moneda}` : ''
  const fVal = (v) => finito(v) ? `${dec(v, 2)}${simboloMoneda}` : '—'
  const pct = (v) => finito(v) && finito(precioActual) && precioActual !== 0
    ? `${v / precioActual - 1 >= 0 ? '+' : ''}${dec((v / precioActual - 1) * 100, 1)} %` : ''
  // Las tres etiquetas viven en la banda del eje, a la derecha del trazado: el texto sale del último
  // punto hacia fuera (textAnchor start y dx positivo) en vez de caer encima de su propia recta.
  // Si dos quedan a menos de SEPARACION_MIN, la de abajo baja lo justo; el orden de pintado es
  // alto → medio → bajo, así que se respeta. La posición se memoriza por serie dentro del mismo pase de
  // render para que un segundo pase no la vuelva a desplazar.
  const SEPARACION_MIN = 12
  // Objeto normal, no un ref: se crea en cada render, que es justo el reinicio que hace falta, y así no
  // hay un hook por debajo del return de arriba.
  const ysEtiquetas = {}
  const etiqueta = (clave, color, objetivo) => (props) => {
    const { x, y, index } = props
    if (index !== datos.length - 1 || !finito(objetivo) || !finito(y)) return null
    if (ysEtiquetas[clave] == null) {
      let yFinal = y
      for (const otra of Object.values(ysEtiquetas)) if (Math.abs(yFinal - otra) < SEPARACION_MIN) yFinal = otra + SEPARACION_MIN
      ysEtiquetas[clave] = yFinal
    }
    return (
      <text x={x} y={ysEtiquetas[clave]} dx={10} dy={3.5} textAnchor="start" fill={color} fontSize={10} fontFamily={MONO} fontWeight={600}>
        {fVal(objetivo)} {pct(objetivo)}
      </text>
    )
  }
  // Pocas marcas en el eje de fechas: cinco repartidas, para que no se amontonen.
  const paso = Math.max(1, Math.ceil(datos.length / 5))
  const marcas = datos.filter((_, i) => i % paso === 0 || i === datos.length - 1).map(d => d.fecha)
  const fFecha = (f) => { const [a, m] = String(f).split('-'); return `${m}/${a.slice(2)}` }

  const Globo = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null
    const real = payload.find(p => p.dataKey === 'precio' && finito(p.value))
    const proy = ['alto', 'medio', 'bajo'].map(k => payload.find(p => p.dataKey === k)).filter(p => p && finito(p.value))
    const [a, m, d] = String(label).split('-')
    return (
      <div style={{ background: '#0a1628', border: '1px solid #1a3d6d', borderRadius: 4, padding: '6px 10px', fontFamily: MONO, fontSize: 11 }}>
        <div style={{ color: '#7aabcc', marginBottom: 4 }}>{`${d}/${m}/${a}`}{real ? '' : ' · proyección'}</div>
        {real && (
          <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between' }}>
            <span style={{ color: COLOR_HISTORICO }}>Precio</span><span style={{ fontWeight: 600 }}>{fVal(real.value)}</span>
          </div>
        )}
        {!real && proy.map(p => (
          <div key={p.dataKey} style={{ display: 'flex', gap: 10, justifyContent: 'space-between' }}>
            <span style={{ color: p.stroke }}>{p.dataKey === 'alto' ? 'Objetivo alto' : p.dataKey === 'medio' ? 'Objetivo medio' : 'Objetivo bajo'}</span>
            <span style={{ fontWeight: 600 }}>{fVal(p.value)}</span>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div style={{ height: alto }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={datos} margin={{ top: 12, right: 2, left: 0, bottom: 2 }}>
          <CartesianGrid vertical={false} stroke={REJILLA} strokeOpacity={0.8} />
          <XAxis dataKey="fecha" ticks={marcas} tickFormatter={fFecha} tick={{ fill: TICK, fontSize: 10, fontFamily: MONO }}
            axisLine={{ stroke: REJILLA }} tickLine={false} />
          {/* El eje derecho no pinta cifras: reserva la banda donde van las tres etiquetas. El ancho da
              para el texto más largo del caso real, "15,00$ -61,6 %" (14 caracteres a 10 px de
              monoespaciada, ~84 px) más los 10 px que el texto sale del último punto. Sin `domain`, para
              no tocar el que ya tenía: de 0 al objetivo alto. */}
          <YAxis orientation="right" width={104} tick={false} axisLine={false} tickLine={false} />
          {finito(precioActual) && <ReferenceLine y={precioActual} stroke="rgba(255,255,255,0.18)" strokeDasharray="2 3" />}
          <Tooltip content={<Globo />} cursor={{ stroke: 'rgba(0,212,255,0.25)' }} />
          <Line type="linear" dataKey="precio" stroke={COLOR_HISTORICO} strokeWidth={1.8} dot={false} connectNulls={false} isAnimationActive={false} />
          <Line type="linear" dataKey="alto" stroke={COLOR_BENEFICIO} strokeWidth={1.4} strokeDasharray="4 3" dot={false} connectNulls={false} isAnimationActive={false}>
            <LabelList dataKey="alto" content={etiqueta('alto', COLOR_BENEFICIO, objetivoMax)} />
          </Line>
          <Line type="linear" dataKey="medio" stroke={COLOR_INGRESOS} strokeWidth={1.4} strokeDasharray="4 3" dot={false} connectNulls={false} isAnimationActive={false}>
            <LabelList dataKey="medio" content={etiqueta('medio', COLOR_INGRESOS, objetivoMedio)} />
          </Line>
          <Line type="linear" dataKey="bajo" stroke={COLOR_PERDIDA} strokeWidth={1.4} strokeDasharray="4 3" dot={false} connectNulls={false} isAnimationActive={false}>
            <LabelList dataKey="bajo" content={etiqueta('bajo', COLOR_PERDIDA, objetivoMin)} />
          </Line>
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
