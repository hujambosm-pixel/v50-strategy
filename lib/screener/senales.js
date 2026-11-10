// lib/screener/senales.js — «Da señal de compra con…» del screener (parte 2, fase 2b; docs/screener.md §11). Lógica PURA.
//
// senalDe({ def, params, velas, referencias }) mira en qué vela, de las últimas VELAS_SENAL, la estrategia de tarjetas «da señal
// de compra», con el MISMO motor que el paso 1 (lib/editor/interprete.js), sobre velas DIARIAS CERRADAS (la vela en curso ya quitada):
//   · Órdenes que se deciden al cierre (a la apertura siguiente, al cierre, stop o límite): la vela k da señal si al cierre de k se
//     cumplen la señal de compra y el filtro de mercado (interpreta con ctx.senalCompra) y la estrategia NO tiene la operación
//     abierta en k. Con la orden a la apertura, la compra sería en la vela siguiente: si k es la última, MAÑANA.
//     «Abierta en k»: comprada en k o antes (con la orden al cierre, antes de k: compra al cierre de esa misma vela) y aún no
//     vendida al terminar k (una venta en k la deja fuera en k).
//   · Órdenes en un nivel dentro de la vela (ruptura del máximo de N velas, último máximo de swing, línea del SuperTrend, línea
//     bajista): sin la vela de mañana no se sabe si se tocará el nivel, así que la señal es la vela en que la estrategia COMPRÓ
//     (tocó el nivel). Es la misma vela que marca el gráfico del paso 1.
// Devuelve { hace, fecha, tipo, precio, ultima, velas } o, sin señal en esas velas, { hace: null, ultima, velas }:
//   hace: 0 = la última vela cerrada, 1 = la anterior…; fecha: la de esa vela; tipo: 'cierre' | 'nivel'; precio: el de compra en
//   las de nivel (null en las otras: aún no se ha comprado); ultima: la fecha de la última vela usada; velas: cuántas.
import { interpreta } from '../editor/interprete'
import { valoresDe } from '../editor/definicion'
import { calentamientoDe } from '../builder/senales'

export const VELAS_SENAL = 20             // el N más alto que se puede pedir («en las últimas N velas»)
export const ORDENES_NIVEL = ['ruptura', 'swing', 'supertrend', 'lineaBajista']

export function senalDe({ def, params = {}, velas, referencias = {} }) {
  const bars = (velas || []).filter(b => b && b.date)
  const n = bars.length
  if (!n) return null
  const v = valoresDe(def, params)
  const ultima = bars[n - 1].date
  const nCal = calentamientoDe(def, v, 'diario')
  if (n < nCal + VELAS_SENAL) return { hace: null, ultima, velas: n, error: `pocas velas (${n}; la regla pide ${nCal} de calentamiento)` }
  const refs = Object.fromEntries(Object.entries(referencias).map(([k, xs]) => [k, (xs || []).filter(b => b.date <= ultima)]))
  const r = interpreta(def, bars, v, { referencias: refs, senalCompra: true })
  const idx = new Map(bars.map((b, k) => [b.date, k]))
  const ops = [...r.trades, ...(r.openPosition ? [r.openPosition] : [])]
  const tipoOrden = def?.entrada?.orden?.tipo
  const desde = n - VELAS_SENAL
  if (ORDENES_NIVEL.includes(tipoOrden)) {
    let mejor = null
    for (const t of ops) { const k = idx.get(t.entryDate); if (k != null && k >= desde && (!mejor || k > mejor.k)) mejor = { k, precio: t.entryPrice } }
    return mejor ? { hace: n - 1 - mejor.k, fecha: bars[mejor.k].date, tipo: 'nivel', precio: mejor.precio, ultima, velas: n } : { hace: null, ultima, velas: n }
  }
  const s = r.senalCompra || []
  const alCierre = tipoOrden === 'cierre'
  const tramos = ops.map(t => [idx.get(t.entryDate), t.exitDate ? idx.get(t.exitDate) : Infinity]).filter(([e]) => e != null)
  const dentro = (k) => tramos.some(([e, x]) => (alCierre ? e < k : e <= k) && x > k)
  for (let k = n - 1; k >= desde; k--) if (s[k] === true && !dentro(k)) return { hace: n - 1 - k, fecha: bars[k].date, tipo: 'cierre', precio: null, ultima, velas: n }
  return { hace: null, ultima, velas: n }
}

// ¿Pasa con «en las últimas N velas»? (N ≥ 1; 1 = solo la última).
export const pasaSenal = (hace, N) => hace != null && hace < N
// El texto de la celda: «la última», «hace 1 vela», «hace 3 velas».
export const textoHace = (hace) => hace == null ? '—' : hace === 0 ? 'la última' : `hace ${hace} vela${hace === 1 ? '' : 's'}`
