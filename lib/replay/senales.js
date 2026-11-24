// lib/replay/senales.js — «Saltar a la señal» del Replay (docs/builder.md §231; boceto bocetos/replay-simulacion.html v2). PURO.
// La señal se busca con TODAS las velas del valor, pero cada fecha solo depende de lo que se sabía al cierre de esa vela (los indicadores
// y las condiciones del catálogo miran hacia atrás; una fila semanal vale lo de la semana ya cerrada). Así, saltar a la señal deja como
// última vela la de la señal y no enseña nada de después.
//   · Condición del catálogo (filas como las de las alertas, unidas con «y además» u «o bien», §240): la vela en que PASA a cumplirse (la anterior no se cumplía).
//     Así una condición «de estado» (cierre sobre la EMA 200) da una señal por tramo, y una «de un momento» (cruce) la suya.
//   · Estrategia de tarjetas: el MISMO criterio que «Da señal de compra con…» del screener (lib/screener/senales.js): con orden al cierre
//     o a la apertura siguiente, la vela en que se cumplen la señal de compra y su filtro de mercado sin tener la operación abierta; con
//     orden en un nivel (ruptura, swing, SuperTrend, línea bajista), la vela en que compró.
import { interpreta, mediasDe } from '../editor/interprete'
import { media } from '../condiciones/indicadores'
import { valoresDe } from '../editor/definicion'
import { ORDENES_NIVEL } from '../screener/senales'
import { serieFilas } from '../planes/pesos'

const cerradas = (velas) => (velas || []).filter(b => b && b.date && !b.enCurso)

// §240: con «o bien» (union 'O') las filas se parten en grupos ((A y B) o C: «y además» une antes que «o bien») y la señal es la vela en
// que CUALQUIER grupo pasa a cumplirse, mirando cada grupo por separado. Si se mirara la unión entera, «cierre sobre la EMA 20 o bien
// cierre bajo la EMA 20» se cumpliría siempre y daría una sola señal; así da una en cada cruce, hacia arriba y hacia abajo. Con todo
// «y además» hay un solo grupo: lo de siempre.
export function gruposFilas(filas) {
  const gs = []
  ;(filas || []).forEach((f, k) => { const { union, ...r } = f || {}; if (!k || union !== 'O') (gs[gs.length - 1] || gs[gs.push([]) - 1]).push(k ? { ...r, union: 'Y' } : r); else gs.push([r]) })
  return gs
}
export function senalesCondicion(filas, velasDe, fechas) {
  if (!Array.isArray(filas) || !filas.length || !fechas?.length) return []
  const ss = gruposFilas(filas).map(g => serieFilas(g, velasDe, fechas))
  return fechas.filter((f, i) => i > 0 && ss.some(s => s[i] === true && s[i - 1] !== true))
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

// §234: los indicadores de la señal elegida, para dibujarlos en el gráfico del Replay (prop grafico de CandleChart: solo series sobre el
// precio, sin eventos ni órdenes). bars = las velas que ya se ven (hasta hoy): nada mira al futuro.
//   · Condición del catálogo: las medias (EMA / SMA) de las filas del propio valor (p. ej. las dos EMA de un cruce).
//   · Estrategia de tarjetas: las series sobre el precio que dibuja la estrategia (medias, máximo de la ruptura, swings, SuperTrend…).
// null si no hay nada que dibujar.
const COLORES_SENAL = ['#58a6ff', '#f0883e', '#3fb950', '#e3b341']
export function graficoSenal(senal, bars, simbolo, referencias = {}) {
  const b = (bars || []).filter(x => x && x.date)   // las mismas velas que recibe el gráfico (los valores van por posición)
  if (!senal || !b.length) return null
  let series = []
  if (senal.tipo === 'condicion') {
    const ms = new Map()
    for (const f of senal.filas || []) if ((f.quien === simbolo || f.quien === 'valor') && f.velas !== 'semanales') mediasDe(f.si, ms)
    series = [...ms.values()].filter(m => ['EMA', 'SMA'].includes(m.tipo) && Number.isInteger(m.periodo) && m.periodo > 0)
      .map((m, k) => ({ clave: `senal${m.tipo}${m.periodo}`, nombre: `${m.tipo} ${m.periodo}`, panel: 'precio', tipo: 'linea', color: COLORES_SENAL[k % COLORES_SENAL.length], valores: media(b, m.tipo, m.periodo) }))
  } else if (senal.tipo === 'estrategia' && senal.def) {
    try {
      const r = interpreta(senal.def, b, valoresDe(senal.def, typeof senal.params === 'string' ? JSON.parse(senal.params || '{}') : (senal.params || {})), { referencias })
      series = (r.grafico?.series || []).filter(s => (s.panel || 'precio') === 'precio' && Array.isArray(r.indicators?.[s.clave]))
        .map((s, k) => ({ ...s, color: s.color || COLORES_SENAL[k % COLORES_SENAL.length], valores: r.indicators[s.clave] }))
    } catch (_) { series = [] }
  }
  return series.length ? { version: 1, series, eventos: [], ordenes: [] } : null
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
