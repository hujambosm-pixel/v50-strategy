// lib/backtester.js — Indicadores base

// ── Indicadores ─────────────────────────────────────────────
export function calcEMA(values, period) {
  if (!values?.length || period < 1) return []
  const k = 2 / (period + 1)
  const out = new Array(values.length).fill(null)
  let sum = 0, valid = 0
  for (let i = 0; i < values.length; i++) {
    if (values[i] == null) continue
    sum += values[i]; valid++
    if (valid < period) continue
    if (valid === period) { out[i] = sum / period; continue }
    out[i] = values[i] * k + out[i - 1] * (1 - k)
  }
  return out
}

// Ventana deslizante: O(n) en vez de O(n·p), y sin el slice() por barra, que reservaba un array nuevo
// en cada iteración. Una SMA200 sobre 40 años pasa de ~2 ms a ~0,2 ms.
// MISMO RESULTADO que la versión anterior, comprobado sobre series limpias, con nulos por delante y con
// huecos, y sobre 10.080 barras con periodos 20 y 200: el error relativo máximo por acumulación es de
// 3,5e-15, unos pocos ULP. Importa porque esta función se inyecta en el sandbox del code_js de las
// estrategias (ver datos.js y multibacktest.js), así que un cambio de valores cambiaría backtests.
// LOS NULOS NO SE TRATAN, a diferencia del resto de la librería, y es DELIBERADO: la versión anterior
// los sumaba como cero —tanto en `slice().reduce()` como aquí, por la misma aritmética de JS— y tratarlos
// movería los valores. Queda como divergencia conocida, no como olvido.
export function calcSMA(values, p) {
  if (!values?.length || p < 1) return []
  const out = new Array(values.length).fill(null)
  let suma = 0
  for (let i = 0; i < values.length; i++) {
    suma += values[i]
    if (i >= p) suma -= values[i - p]
    if (i >= p - 1) out[i] = suma / p
  }
  return out
}

export function calcRSI(values, period = 14) {
  if (!values?.length || period < 1) return []
  const res = new Array(values.length).fill(null)
  // Se calcula SOLO sobre los valores válidos y se re-alinea a sus índices. Antes los nulos entraban
  // como ceros vía `(values[i] ?? 0) - (values[i-1] ?? 0)`: con un prefijo de nulos —lo que produce
  // buildAlignedCloses cuando la serie externa empieza más tarde que el activo— todos los
  // diferenciales de ese tramo salían 0, avgLoss quedaba en 0 y la rama `? 100` dejaba el RSI
  // clavado en 100. Medido con 20 nulos por delante: 100 en vez de 42,24, y 91 barras reales
  // contaminadas por encima de 0,5 puntos, porque el suavizado de Wilder arranca de una siembra 0/0
  // y converge despacio.
  // Mismo criterio que calcRSI de components/CandleChart.js: con entrada limpia, valores idénticos.
  const validos = [], indices = []
  values.forEach((v, i) => { if (v != null && !isNaN(v)) { validos.push(v); indices.push(i) } })
  if (validos.length <= period) return res
  let avgGain = 0, avgLoss = 0
  for (let i = 1; i <= period; i++) {
    const diff = validos[i] - validos[i - 1]
    if (diff > 0) avgGain += diff; else avgLoss -= diff
  }
  avgGain /= period; avgLoss /= period
  res[indices[period]] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
  for (let i = period + 1; i < validos.length; i++) {
    const diff = validos[i] - validos[i - 1]
    avgGain = (avgGain * (period - 1) + Math.max(diff, 0)) / period
    avgLoss = (avgLoss * (period - 1) + Math.max(-diff, 0)) / period
    res[indices[i]] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
  }
  return res
}

export function calcATR(data, period = 14) {
  const tr = data.map((d, i) => {
    if (i === 0) return d.high - d.low
    const prev = data[i - 1]
    return Math.max(d.high - d.low, Math.abs(d.high - prev.close), Math.abs(d.low - prev.close))
  })
  const atr = new Array(data.length).fill(null)
  let sum = 0
  for (let i = 0; i < period && i < tr.length; i++) sum += tr[i]
  atr[period - 1] = sum / period
  for (let i = period; i < tr.length; i++) atr[i] = (atr[i - 1] * (period - 1) + tr[i]) / period
  return atr
}

// ── Bandas de Bollinger ─────────────────────────────────────────────────────
// Media móvil de `period` con `mult` desviaciones típicas a cada lado. Devuelve tres series alineadas
// con la entrada: {upper, mid, lower}.
//
// NULOS: mismo criterio que calcEMA, calcRSI y calcMACD —se calcula SOLO sobre los valores válidos y se
// re-alinea a sus índices—, no el de calcSMA, que los suma como cero. calcSMA no puede cambiar porque se
// inyecta en el sandbox del code_js y movería backtests existentes; esta función es nueva y no arrastra
// esa deuda.
//
// LA DESVIACIÓN SE CALCULA EN DOS PASADAS SOBRE LA VENTANA, no con sumas de cuadrados acumuladas.
// La vía rápida —mantener Σx y Σx² e ir restando el valor que sale— es O(n) pero resta dos números
// grandes y casi iguales para obtener uno pequeño: medido sobre una serie plana en 70.000 con ruido de
// ±0,01, el ancho de banda salía con un 40% de error. Con precios normales el error es de 1e-12, pero
// una cripto estable o un tramo lateral caen justo en el caso malo. La media sí va por ventana
// deslizante, que ahí no hay cancelación. Coste: ~0,3 ms con periodo 20 sobre 10.080 barras.
export function calcBollinger(values, period = 20, mult = 2) {
  const n = values?.length || 0
  const upper = new Array(n).fill(null)
  const mid   = new Array(n).fill(null)
  const lower = new Array(n).fill(null)
  if (!n || period < 1) return { upper, mid, lower }
  const validos = [], indices = []
  for (let i = 0; i < n; i++) {
    const v = values[i]
    if (v != null && !isNaN(v)) { validos.push(v); indices.push(i) }
  }
  if (validos.length < period) return { upper, mid, lower }
  let suma = 0
  for (let i = 0; i < validos.length; i++) {
    suma += validos[i]
    if (i >= period) suma -= validos[i - period]
    if (i < period - 1) continue
    const media = suma / period
    let q = 0
    for (let j = i - period + 1; j <= i; j++) { const d = validos[j] - media; q += d * d }
    // Desviación POBLACIONAL (÷period), que es la convención de las bandas de Bollinger y la que usan
    // los proveedores de gráficos. Con ÷(period−1) las bandas salen algo más anchas.
    const sd = Math.sqrt(q / period)
    const k = indices[i]
    mid[k]   = media
    upper[k] = media + mult * sd
    lower[k] = media - mult * sd
  }
  return { upper, mid, lower }
}

// ── Media móvil del volumen ─────────────────────────────────────────────────
// Simple, de `period` barras, alineada con la entrada. Mismo tratamiento de nulos que calcBollinger.
// El CERO es un valor válido, no un hueco: los dos proveedores devuelven 0 cuando una sesión no tuvo
// volumen —o cuando no lo publican— y descartarlo cambiaría la media sin que nadie lo pidiera. Solo
// null y NaN cuentan como ausencia.
export function calcVolumeAvg(volumes, period = 20) {
  const n = volumes?.length || 0
  const out = new Array(n).fill(null)
  if (!n || period < 1) return out
  const validos = [], indices = []
  for (let i = 0; i < n; i++) {
    const v = volumes[i]
    if (v != null && !isNaN(v)) { validos.push(v); indices.push(i) }
  }
  if (validos.length < period) return out
  let suma = 0
  for (let i = 0; i < validos.length; i++) {
    suma += validos[i]
    if (i >= period) suma -= validos[i - period]
    if (i >= period - 1) out[indices[i]] = suma / period
  }
  return out
}

export function calcMACD(values, fast = 12, slow = 26, sig = 9) {
  const emaF = calcEMA(values, fast)
  const emaS = calcEMA(values, slow)
  const line   = values.map((_, i) => (emaF[i] != null && emaS[i] != null) ? emaF[i] - emaS[i] : null)
  // La señal se calcula SOLO sobre los valores válidos de la línea y se re-alinea. Antes era
  // calcEMA(line.map(v => v ?? 0), sig): los ~25 nulos iniciales entraban como ceros, así que la
  // señal arrancaba pegada a cero y tardaba decenas de barras en converger. En ese tramo
  // line > signal era casi siempre cierto, con señales espurias durante el calentamiento.
  // Mismo criterio que calcMACD de components/CandleChart.js, cuya calcEMA es equivalente a esta.
  const signal = new Array(values.length).fill(null)
  const validos = [], indices = []
  line.forEach((v, i) => { if (v != null) { validos.push(v); indices.push(i) } })
  const sigEma = calcEMA(validos, sig)
  indices.forEach((idx, j) => { signal[idx] = sigEma[j] ?? null })
  return { line, signal }
}
