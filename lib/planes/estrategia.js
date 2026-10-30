// lib/planes/estrategia.js — la pieza «estrategia» de un plan (P8, versión «una acción»; docs/planes-inversion.md §10 y
// docs/builder.md §47): las OPERACIONES de una estrategia de tarjetas en un valor y los precios con que las ejecuta el plan. Puro.
//
// LAS OPERACIONES SON LAS DEL PASO 1 Y EL PASO 2: las velas DIARIAS del valor (solo las cerradas), el calentamiento que pide la regla
// antes del periodo y nada después de su última vela (lib/pruebaAzar.js preparaPeriodo, el mismo intérprete y las mismas referencias
// del filtro de mercado), las que ENTRAN en el periodo (una que viene del calentamiento no cuenta, y mientras dura la estrategia no
// puede volver a entrar), y el precio de cada entrada y salida ajustado a su vela como en «Backtest de un valor» (lib/precioEnVela.js:
// fuera de [mínimo, máximo], a la apertura). La que sigue abierta al final no tiene salida: el plan la valora al cierre.
// Precios del valor SIN dividendos, como el paso 1. Con apalancamiento 2 o 3, un sintético diario sobre el valor como los del QQQ
// (lib/etfSintetico.js, con su comisión y su ajuste): el precio de una entrada o salida p dentro de la vela t es el cierre del
// sintético en t − 1 × (1 + k × (p / cierre del valor en t − 1 − 1)), así que a la apertura es la apertura del sintético; al cierre,
// su cierre (con el coste del día).
import { preparaPeriodo, tickersDe } from '../pruebaAzar'
import { valoresDe } from '../editor/definicion'
import { esDefinicionEditor } from '../editor/fuente'
import { ajustaPreciosAVela } from '../precioEnVela'
import { soloCerradas } from '../sesion'
import { construyeSintetico } from '../etfSintetico'
import SINTETICOS from '../etfSinteticos.json'

export const APALANCAMIENTOS = [1, 2, 3]
export const MODOS_APORTACION = ['espera', 'compra']
const params = (p) => { try { return typeof p === 'string' ? JSON.parse(p || '{}') : (p || {}) } catch (_) { return {} } }
const simboloOk = (s) => typeof s === 'string' && /^[A-Za-z0-9.^=-]{1,15}$/.test(s) && !['LIQUIDEZ', 'ETF'].includes(s)

// Los errores de una pieza «estrategia» (sin el id ni el peso, que valida el plan).
export function validaPiezaEstrategia(x) {
  const e = []
  if (!x?.estrategia || typeof x.estrategia !== 'object' || !esDefinicionEditor(x.estrategia.definition)) e.push('la estrategia tiene que ser una de tarjetas (su foto: { id, name, definition, params }).')
  if (!simboloOk(x?.activo)) e.push('el activo de la estrategia tiene que ser un símbolo de la caché.')
  if (!(x?.ocioso === 'LIQUIDEZ' || simboloOk(x?.ocioso))) e.push('el dinero ocioso: LIQUIDEZ o un símbolo de la caché.')
  else if (x.ocioso === x.activo) e.push('el dinero ocioso no puede ser el mismo activo de la estrategia.')
  if (x?.aportacionDentro != null && !MODOS_APORTACION.includes(x.aportacionDentro)) e.push('las aportaciones con una operación abierta: «espera» o «compra».')
  if (x?.apalancamiento != null && !APALANCAMIENTOS.includes(x.apalancamiento)) e.push('el apalancamiento: 1, 2 o 3.')
  if (x?.velas != null && x.velas !== 'diarias') e.push('por ahora, solo con velas diarias.')
  return e
}
export const apalancamientoDe = (x) => x?.apalancamiento || 1
// El símbolo de lo que se tiene DENTRO de una operación (el valor, o su sintético: «AAPL×2»).
export const simboloDentro = (x) => apalancamientoDe(x) > 1 ? `${x.activo}×${apalancamientoDe(x)}` : x.activo
// Los símbolos cuyas velas necesita una pieza: el valor, el ocioso (salvo liquidez) y los índices de su regla.
export const simbolosDe = (x) => [...new Set([x.activo, ...(x.ocioso && x.ocioso !== 'LIQUIDEZ' ? [x.ocioso] : []), ...tickersDe(x.estrategia?.definition)])]

// ── Cachés por juego de datos (los inicios rodantes y las referencias repiten las mismas cuentas) ──
const CACHE = new WeakMap()
const cacheDe = (datos) => { let c = CACHE.get(datos); if (!c) { c = { ops: new Map(), series: new Map() }; CACHE.set(datos, c) } return c }
const velasDe = (datos, s) => {
  const xs = datos.velas?.[s]
  if (!xs?.length) throw new Error(`Faltan las velas de ${s}.`)
  return soloCerradas(xs)
}

// Las operaciones de la pieza en [desde, hasta]: { ops: [{ entryDate, entryPrice, exitDate, exitPrice, exitReason }],
// calentamiento: { pedidas, reales } }.
export function operacionesDe(x, datos, desde, hasta) {
  const c = cacheDe(datos), clave = JSON.stringify([x.activo, x.estrategia, desde, hasta])
  if (c.ops.has(clave)) return c.ops.get(clave)
  const def = x.estrategia.definition, v = valoresDe(def, params(x.estrategia.params))
  const referencias = Object.fromEntries(tickersDe(def).map(t => [t, velasDe(datos, t)]))
  const pp = preparaPeriodo({ def, valores: v, velasValor: velasDe(datos, x.activo), referencias, desde, hasta, intervalo: 'diario' })
  if (!pp.bars.length) throw new Error(`No hay velas de ${x.activo} entre ${desde} y ${hasta}.`)
  const d0 = pp.corte.periodo[0].date, ultima = pp.bars[pp.bars.length - 1].date
  const crudas = pp.reales.filter(t => t.entryDate >= d0 && t.entryDate <= ultima)
    .map(t => ({ entryDate: t.entryDate, entryPrice: t.entryPrice, exitDate: t.exitDate || null, exitPrice: t.exitDate ? t.exitPrice : null, exitReason: t.exitDate ? (t.exitReason ?? null) : null }))
  const ops = ajustaPreciosAVela(crudas, pp.bars).map(t => ({ entryDate: t.entryDate, entryPrice: t.entryPrice, exitDate: t.exitDate, exitPrice: t.exitPrice, exitReason: t.exitReason }))
  const r = { ops, calentamiento: { pedidas: pp.nCal, reales: pp.corte.calentamientoReal } }
  c.ops.set(clave, r)
  return r
}

// Una serie de velas llevada a las fechas del plan: { open, close } por día; un día sin vela repite el cierre anterior (solo para
// valorar; ninguna operación cae en un día sin vela). null antes de la primera.
export function alinea(velas, fechas) {
  const porFecha = new Map(velas.map(v => [v.date, v]))
  let prev = null
  return fechas.map(f => { const v = porFecha.get(f); if (v) { prev = v.close; return { open: v.open, close: v.close } } return prev == null ? null : { open: prev, close: prev } })
}
// La serie (alineada a las fechas del plan) de un símbolo de la pieza: el valor, su sintético «AAPL×k» o el ocioso.
// QQQ y SPY, los de rentabilidad total del plan; el resto, sus velas tal cual.
export function serieDe(simbolo, datos) {
  if (simbolo === 'QQQ') return datos.qqq
  if (simbolo === 'SPY') return datos.spy
  const c = cacheDe(datos)
  if (c.series.has(simbolo)) return c.series.get(simbolo)
  const m = /^(.+)×([23])$/.exec(simbolo)
  const s = m ? alinea(sinteticoDe(m[1], Number(m[2]), datos).velas, datos.fechas) : alinea(velasDe(datos, simbolo), datos.fechas)
  c.series.set(simbolo, s)
  return s
}
// El sintético ×k de un valor (todas sus velas), con el precio equivalente de un precio del valor dentro de una vela.
export function sinteticoDe(activo, k, datos) {
  const c = cacheDe(datos), clave = `sint|${activo}|${k}`
  if (c.series.has(clave)) return c.series.get(clave)
  const base = velasDe(datos, activo), velas = construyeSintetico(base, { k, comision: SINTETICOS.comision[k], ajuste: SINTETICOS.ajuste[k] })
  const idx = new Map(base.map((v, t) => [v.date, t]))
  const equivalente = (date, p) => {
    const t = idx.get(date)
    if (t == null) throw new Error(`${activo} no tiene vela el ${date}.`)
    if (p === base[t].close) return velas[t].close
    if (t === 0) return velas[0].open * p / base[0].open
    return velas[t - 1].close * (1 + k * (p / base[t - 1].close - 1))
  }
  const r = { velas, equivalente }
  c.series.set(clave, r)
  return r
}
// El precio al que el plan ejecuta una entrada o una salida de la pieza (el del valor o su equivalente en el sintético).
export function precioOperacion(x, datos, date, p) {
  const k = apalancamientoDe(x)
  return k > 1 ? sinteticoDe(x.activo, k, datos).equivalente(date, p) : p
}
// ¿La salida fue a la apertura de su vela? (el ocioso se compra entonces a la apertura; si no, al cierre).
export function salidaAlAbrir(x, datos, t) {
  const v = velasDe(datos, x.activo).find(b => b.date === t.exitDate)
  return !!v && t.exitPrice === v.open
}

// La curva de la estrategia SOLA (sin el ocioso: fuera de operación, el dinero quieto; sin flujos, costes ni impuestos), por día del
// plan de i0 a i1, empezando en 1 a la apertura de i0: para las peores caídas (lib/planes/descorrelacion.js).
export function curvaSola(ops, serie, idx, i0, i1) {
  const out = []
  let val = 1, u = 0, dentro = false, k = 0
  for (let i = i0; i <= i1; i++) {
    for (;;) {
      const t = ops[k]
      if (!t) break
      if (dentro && t.exitDate && idx[t.exitDate] === i) { val = u * t.pxSalida; u = 0; dentro = false; k++; continue }
      if (!dentro && idx[t.entryDate] === i) { u = val / t.pxEntrada; dentro = true; if (!t.exitDate) break; continue }
      break
    }
    out.push(dentro ? u * serie[i].close : val)
  }
  return out
}
