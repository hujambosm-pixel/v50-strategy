// lib/condiciones/indicadores.js — los indicadores del catálogo de condiciones, con su caché (commit 2 del plan de
// docs/catalogo-condiciones.md). MOVIDOS TAL CUAL desde lib/senales.js en V9.1000 (mismo código, mismo orden de las
// operaciones): lib/senales.js los importa y los reexporta, y lib/laboratorioCartera.js sigue usando media() desde allí.
//
// · Precios: los no válidos (null, NaN, ±Infinity, <= 0; en el volumen, también el 0) son null.
// · EMA y RSI de Wilder, los de lib/backtester.js (calcEMA arranca con la SMA de los N primeros; calcRSI con las medias
//   simples de N diferencias y luego el suavizado de Wilder); SMA, calcSMAEstricta de lib/indicadores.js (null si falta
//   algún dato de la ventana); ATR de Wilder (calcATR) en t.
// · Cada indicador se calcula una vez por serie: caché por array de velas y clave de parámetros (WeakMap), así no se
//   mezcla entre activos. memo() es la misma caché para cualquier cálculo derivado (la usan también las señales).
import { calcEMA, calcRSI, calcATR } from '../backtester'
import { calcSMAEstricta } from '../indicadores'

const finito = (x) => typeof x === 'number' && Number.isFinite(x)
const precioOk = (x) => finito(x) && x > 0
const CACHE = new WeakMap()
export function memo(velas, clave, calcular) {
  let m = CACHE.get(velas)
  if (!m) { m = new Map(); CACHE.set(velas, m) }
  if (!m.has(clave)) m.set(clave, calcular())
  return m.get(clave)
}
// Precios de un campo, con los no válidos como null.
export const precios = (velas, campo) => memo(velas, `precio|${campo}`, () => velas.map(v => precioOk(v?.[campo]) ? v[campo] : null))
// Media móvil (EMA o SMA) del cierre.
export function media(velas, tipo, periodo) {
  return memo(velas, `media|${tipo}|${periodo}`, () => {
    const c = precios(velas, 'close')
    return tipo === 'SMA' ? calcSMAEstricta(c, periodo) : calcEMA(c, periodo).map(x => finito(x) ? x : null)
  })
}
export function rsi(velas, periodo) {
  return memo(velas, `rsi|${periodo}`, () => calcRSI(precios(velas, 'close'), periodo).map(x => finito(x) ? x : null))
}
// Para cada t, el máximo de los máximos de t−N … t−1, o null si alguno falta (o t < N).
export function maximoPrevio(velas, n) {
  return memo(velas, `maxPrevio|${n}`, () => {
    const h = precios(velas, 'high'), out = new Array(velas.length).fill(null)
    for (let t = n; t < velas.length; t++) {
      let m = -Infinity, ok = true
      for (let j = t - n; j < t; j++) { if (h[j] == null) { ok = false; break } if (h[j] > m) m = h[j] }
      if (ok) out[t] = m
    }
    return out
  })
}
// ATR de Wilder: calcATR de lib/backtester.js, el mismo del que sale el de lib/edge.js (atrPrevio[i] = calcATR[i − 1]);
// aquí se usa el ATR EN t (con la vela t). Con un precio no válido el suavizado se rompe: desde ahí, null.
export function atr(velas, periodo) {
  return memo(velas, `atr|${periodo}`, () => {
    if (velas.length < periodo) return velas.map(() => null)
    const a = calcATR(velas.map(v => ({ high: v?.high, low: v?.low, close: v?.close })), periodo)
    return velas.map((_, i) => finito(a[i]) && a[i] > 0 ? a[i] : null)
  })
}
