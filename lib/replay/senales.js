// lib/replay/senales.js — «Saltar a la señal» del Replay (docs/builder.md §231; boceto bocetos/replay-simulacion.html v2). PURO.
// La señal se busca con TODAS las velas del valor, pero cada fecha solo depende de lo que se sabía al cierre de esa vela (los indicadores
// y las condiciones del catálogo miran hacia atrás; una fila semanal vale lo de la semana ya cerrada). Así, saltar a la señal deja como
// última vela la de la señal y no enseña nada de después.
//   · Condición del catálogo (filas como las de las alertas, todas con «Y»): la vela en que PASA a cumplirse (la anterior no se cumplía).
//     Así una condición «de estado» (cierre sobre la EMA 200) da una señal por tramo, y una «de un momento» (cruce) la suya.
//   · Estrategia de tarjetas: el MISMO criterio que «Da señal de compra con…» del screener (lib/screener/senales.js): con orden al cierre
//     o a la apertura siguiente, la vela en que se cumplen la señal de compra y su filtro de mercado sin tener la operación abierta; con
//     orden en un nivel (ruptura, swing, SuperTrend, línea bajista), la vela en que compró.
import { interpreta } from '../editor/interprete'
import { valoresDe } from '../editor/definicion'
import { ORDENES_NIVEL } from '../screener/senales'
import { serieFilas } from '../planes/pesos'

const cerradas = (velas) => (velas || []).filter(b => b && b.date && !b.enCurso)

export function senalesCondicion(filas, velasDe, fechas) {
  if (!Array.isArray(filas) || !filas.length || !fechas?.length) return []
  const s = serieFilas(filas, velasDe, fechas)
  return fechas.filter((f, i) => i > 0 && s[i] === true && s[i - 1] !== true)
}

export function senalesEstrategia({ def, params = {}, velas, referencias = {} }) {
  const bars = cerradas(velas)
  if (!bars.length) return []
  const r = interpreta(def, bars, valoresDe(def, typeof params === 'string' ? JSON.parse(params || '{}') : params), { referencias, senalCompra: true })
  const idx = new Map(bars.map((b, k) => [b.date, k]))
  const ops = [...(r.trades || []), ...(r.openPosition ? [r.openPosition] : [])]
  const tipo = def?.entrada?.orden?.tipo
  if (ORDENES_NIVEL.includes(tipo)) return [...new Set(ops.map(t => t.entryDate).filter(d => idx.has(d)))].sort()
  const s = r.senalCompra || [], alCierre = tipo === 'cierre'
  const tramos = ops.map(t => [idx.get(t.entryDate), t.exitDate ? idx.get(t.exitDate) : Infinity]).filter(([e]) => e != null)
  const dentro = (k) => tramos.some(([e, x]) => (alCierre ? e < k : e <= k) && x > k)
  const out = []
  for (let k = 0; k < bars.length; k++) if (s[k] === true && !dentro(k)) out.push(bars[k].date)
  return out
}

// La señal siguiente (después de hoy) o la anterior (antes de hoy y no antes del inicio). null si no hay.
export const siguienteSenal = (fechas, hoy) => (fechas || []).find(f => f > hoy) || null
export function anteriorSenal(fechas, hoy, desde) {
  const l = fechas || []
  for (let i = l.length - 1; i >= 0; i--) if (l[i] < hoy && l[i] >= desde) return l[i]
  return null
}

// ▲ morado bajo las velas con señal que ya se ven (hasta hoy).
export const COLOR_SENAL = '#bc8cff'
export const marcasSenal = (fechas, hoy) => (fechas || []).filter(f => f <= hoy).map(date => ({ date, position: 'belowBar', shape: 'arrowUp', color: COLOR_SENAL, text: '' }))

// Los símbolos cuyas velas hacen falta, aparte del valor del Replay.
export function simbolosSenal(senal, simbolo, tickersDeDef) {
  if (!senal) return []
  if (senal.tipo === 'condicion') return [...new Set((senal.filas || []).map(f => f.quien).filter(q => q && q !== simbolo && q !== 'valor'))]
  if (senal.tipo === 'estrategia' && senal.def) return tickersDeDef(senal.def).filter(t => t !== simbolo)
  return []
}
