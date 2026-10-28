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
// ── V9.1062: solo funciones NUEVAS; las de arriba no cambian. ──
// Estructura alcista: en la vela t, los K últimos mínimos de swing confirmados hasta su cierre son cada uno más alto que el anterior
// Y los K se confirmaron después de la última ROTURA: la última vela cuyo CIERRE cayó por debajo del último mínimo de swing
// confirmado entonces. Así una rotura la apaga en esa misma vela (cerrada) y no vuelve hasta que se confirmen otra vez K mínimos
// crecientes. Con menos de K mínimos confirmados en total, null (sin dato). Solo mira las velas hasta t.
export function estructuraAlcistaSwing(velas, L, R, K) {
  return memo(velas, `estructuraAlcista|${L}|${R}|${K}`, () => {
    const { lista, porVela } = swings(velas, 'min', L, R), c = precios(velas, 'close')
    let rotura = -1
    return porVela.map((k, t) => {
      if (k >= 0 && c[t] != null && c[t] < lista[k].precio) rotura = t
      if (k + 1 < K) return null
      if (lista[k - K + 1].conf <= rotura) return false
      for (let j = k - K + 2; j <= k; j++) if (!(lista[j].precio > lista[j - 1].precio)) return false
      return true
    })
  })
}
// ── V9.1064: el SuperTrend (la definición estándar, la de TradingView). Solo funciones NUEVAS. ──
// Con el ATR de Wilder de N velas (atr, arriba) y el multiplicador M, en cada vela con ATR:
//   bandas básicas: (máximo + mínimo) / 2 ∓ M × ATR;
//   banda inferior final: la básica si es mayor que la final anterior o si el cierre anterior cayó bajo la final anterior; si no, la
//   final anterior (solo sube mientras dura la tendencia). La superior, lo simétrico (solo baja);
//   tendencia (1 alcista, −1 bajista): en la primera vela con ATR, bajista (como TradingView); después, de bajista pasa a alcista
//   cuando el cierre supera la banda superior final, y de alcista a bajista cuando cae bajo la inferior final;
//   línea: la banda inferior final en tendencia alcista, la superior en bajista.
// Todo con la vela cerrada: lo de la vela t solo depende de las velas hasta t. Sin ATR (o con un dato que falte), null y vuelve a
// empezar. { inferior, superior, tendencia, linea } por vela.
export function supertrend(velas, N, M) {
  return memo(velas, `supertrend|${N}|${M}`, () => {
    const a = atr(velas, N), n = velas.length
    const inferior = new Array(n).fill(null), superior = new Array(n).fill(null), tendencia = new Array(n).fill(null), linea = new Array(n).fill(null)
    let pInf = null, pSup = null, pDir = null, pC = null
    for (let t = 0; t < n; t++) {
      const v = velas[t], h = v?.high, l = v?.low, c = v?.close
      if (a[t] == null || !finito(h) || !finito(l) || !finito(c)) { pInf = pSup = pDir = null; pC = finito(c) ? c : null; continue }
      const medio = (h + l) / 2, bInf = medio - M * a[t], bSup = medio + M * a[t]
      const fInf = pInf == null || bInf > pInf || (pC != null && pC < pInf) ? bInf : pInf
      const fSup = pSup == null || bSup < pSup || (pC != null && pC > pSup) ? bSup : pSup
      const d = pDir == null ? -1 : pDir === -1 ? (c > fSup ? 1 : -1) : (c < fInf ? -1 : 1)
      inferior[t] = fInf; superior[t] = fSup; tendencia[t] = d; linea[t] = d === 1 ? fInf : fSup
      pInf = fInf; pSup = fSup; pDir = d; pC = c
    }
    return { inferior, superior, tendencia, linea }
  })
}
// La línea del SuperTrend al cierre de la vela anterior (o null): la del stop, que actúa DENTRO de la vela t.
export function supertrendPrevio(velas, N, M) {
  return memo(velas, `supertrendPrevio|${N}|${M}`, () => { const l = supertrend(velas, N, M).linea; return l.map((_, t) => t >= 1 ? l[t - 1] : null) })
}
// El dibujo de los swings, por vela: el nivel del tramo PUNTEADO (de la vela del swing a la que lo confirma, v … v + R: aún nadie lo
// puede usar) y el del SÓLIDO (desde la vela siguiente a la confirmación hasta la vela cuyo máximo lo supera —o cuyo mínimo lo
// perfora—, incluida, o hasta la confirmación del swing siguiente, lo que llegue antes); null donde no hay nivel. Si dos punteados se
// pisan (solo con L < R), manda el más nuevo.
export function lineasSwing(velas, lado, L, R) {
  return memo(velas, `lineasSwing|${lado}|${L}|${R}`, () => {
    const { lista } = swings(velas, lado, L, R), x = precios(velas, lado === 'max' ? 'high' : 'low'), n = velas.length
    const punteada = new Array(n).fill(null), solida = new Array(n).fill(null)
    lista.forEach((s, j) => {
      for (let t = s.v; t <= s.conf; t++) punteada[t] = s.precio
      const tope = j + 1 < lista.length ? lista[j + 1].conf : n - 1
      for (let t = s.conf + 1; t <= tope; t++) { solida[t] = s.precio; if (x[t] != null && (lado === 'max' ? x[t] > s.precio : x[t] < s.precio)) break }
    })
    return { punteada, solida }
  })
}
