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
import { calcEMA, calcRSI, calcATR, calcMACD, calcBollinger } from '../backtester'
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
// ── V9.1047 (condiciones nuevas del Builder): solo funciones NUEVAS; las de arriba no cambian. ──
// Para cada t, el mínimo de los mínimos de t−N … t−1, o null si alguno falta (o t < N): el espejo de maximoPrevio.
export function minimoPrevio(velas, n) {
  return memo(velas, `minPrevio|${n}`, () => {
    const l = precios(velas, 'low'), out = new Array(velas.length).fill(null)
    for (let t = n; t < velas.length; t++) {
      let m = Infinity, ok = true
      for (let j = t - n; j < t; j++) { if (l[j] == null) { ok = false; break } if (l[j] < m) m = l[j] }
      if (ok) out[t] = m
    }
    return out
  })
}
// Para cada t, el máximo de los máximos de t−N+1 … t (CONTANDO la vela t), o null si alguno falta (o t < N − 1).
export function maximoHasta(velas, n) {
  return memo(velas, `maxHasta|${n}`, () => {
    const h = precios(velas, 'high'), out = new Array(velas.length).fill(null)
    for (let t = n - 1; t < velas.length; t++) {
      let m = -Infinity, ok = true
      for (let j = t - n + 1; j <= t; j++) { if (h[j] == null) { ok = false; break } if (h[j] > m) m = h[j] }
      if (ok) out[t] = m
    }
    return out
  })
}
// MACD del cierre: calcMACD de lib/backtester.js tal cual (línea = EMA rápida − EMA lenta; señal = EMA de la línea), con los
// no finitos como null. Usa calcEMA, así que hereda su fallo latente con un cierre que falta a mitad de la serie (§7 de
// docs/catalogo-condiciones.md); con datos limpios no ocurre.
export function macd(velas, rapida, lenta, senal) {
  return memo(velas, `macd|${rapida}|${lenta}|${senal}`, () => {
    const { line, signal } = calcMACD(precios(velas, 'close'), rapida, lenta, senal)
    return { linea: line.map(x => finito(x) ? x : null), senal: signal.map(x => finito(x) ? x : null) }
  })
}
// Bandas de Bollinger del cierre: calcBollinger de lib/backtester.js tal cual (media de N y desviación poblacional), pero
// «sin dato» si falta algún cierre de la ventana t−N+1 … t (calcBollinger salta los huecos y alargaría la ventana).
export function bollinger(velas, periodo, desviaciones) {
  return memo(velas, `bollinger|${periodo}|${desviaciones}`, () => {
    const c = precios(velas, 'close'), { upper, lower } = calcBollinger(c, periodo, desviaciones)
    const superior = new Array(velas.length).fill(null), inferior = new Array(velas.length).fill(null)
    let malos = 0
    for (let t = 0; t < velas.length; t++) {
      if (c[t] == null) malos++
      if (t >= periodo && c[t - periodo] == null) malos--
      if (t >= periodo - 1 && malos === 0) { superior[t] = finito(upper[t]) ? upper[t] : null; inferior[t] = finito(lower[t]) ? lower[t] : null }
    }
    return { superior, inferior }
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
// ── V9.1059 (swings confirmados): solo funciones NUEVAS; las de arriba no cambian. ──
// Los swings de máximos (lado 'max', con los máximos) o de mínimos ('min', con los mínimos), con L velas a la izquierda y R a la
// derecha: la vela v es un swing si su máximo es ESTRICTAMENTE mayor que el de las L anteriores y que el de las R siguientes (con
// los mínimos, estrictamente menor). Un empate no es swing; un dato que falte en la ventana, tampoco. El swing se CONFIRMA al
// cierre de la vela v + R: antes no existe para nadie.
//   lista: [{ v, conf: v + R, precio }] en orden; porVela[t]: el índice en lista del último swing confirmado hasta el cierre de t
//   (conf <= t), o -1. Lo que hay en porVela[t] solo depende de las velas hasta t.
export function swings(velas, lado, L, R) {
  return memo(velas, `swings|${lado}|${L}|${R}`, () => {
    const x = precios(velas, lado === 'max' ? 'high' : 'low'), n = velas.length, lista = [], porVela = new Array(n).fill(-1)
    for (let v = L; v + R < n; v++) {
      if (x[v] == null) continue
      let ok = true
      for (let j = v - L; j <= v + R && ok; j++) if (j !== v && (x[j] == null || (lado === 'max' ? !(x[v] > x[j]) : !(x[v] < x[j])))) ok = false
      if (ok) lista.push({ v, conf: v + R, precio: x[v] })
    }
    for (let t = 0, k = -1; t < n; t++) { while (k + 1 < lista.length && lista[k + 1].conf <= t) k++; porVela[t] = k }
    return { lista, porVela }
  })
}
// El precio del último swing confirmado hasta el cierre de t (o null): el que pueden usar las condiciones de la vela t.
export function ultimoSwing(velas, lado, L, R) {
  return memo(velas, `ultSwing|${lado}|${L}|${R}`, () => { const { lista, porVela } = swings(velas, lado, L, R); return porVela.map(k => k < 0 ? null : lista[k].precio) })
}
// Para la vela t, el del cierre de t − 1 (o null): el que pueden usar las órdenes y los stops que actúan DENTRO de la vela t. Es
// también la línea del gráfico: empieza en la vela siguiente a la confirmación (v + R + 1), nunca en v.
export function swingPrevio(velas, lado, L, R) {
  return memo(velas, `swingPrevio|${lado}|${L}|${R}`, () => { const u = ultimoSwing(velas, lado, L, R); return u.map((_, t) => t >= 1 ? u[t - 1] : null) })
}
// Los n últimos swings confirmados hasta el cierre de t, ¿cada uno más alto que el anterior? (máximos o mínimos crecientes). Con
// menos de n confirmados, null (sin dato).
export function swingsCrecientes(velas, lado, L, R, n) {
  return memo(velas, `swingsCrec|${lado}|${L}|${R}|${n}`, () => {
    const { lista, porVela } = swings(velas, lado, L, R)
    return porVela.map(k => { if (k + 1 < n) return null; for (let j = k - n + 2; j <= k; j++) if (!(lista[j].precio > lista[j - 1].precio)) return false; return true })
  })
}
// La orden en el último máximo de swing: para la vela t, el nivel al que compra (el último máximo de swing confirmado hasta el
// cierre de t − 1), o null si no hay o si ese swing ya se superó antes (con o sin compra): CADA SWING SE USA UNA VEZ. Que se supere
// solo depende del precio (no de si había operación abierta), así que se calcula aquí, una vez.
export function ordenSwing(velas, L, R) {
  return memo(velas, `ordenSwing|${L}|${R}`, () => {
    const { lista, porVela } = swings(velas, 'max', L, R), h = precios(velas, 'high'), out = new Array(velas.length).fill(null)
    let usado = -1
    for (let t = 1; t < velas.length; t++) {
      const k = porVela[t - 1]
      if (k < 0 || k === usado) continue
      out[t] = lista[k].precio
      if (h[t] != null && h[t] > lista[k].precio) usado = k
    }
    return out
  })
}
