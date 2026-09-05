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

export function calcSMA(arr, p) {
  return arr.map((_, i) => {
    if (i < p - 1) return null
    return arr.slice(i - p + 1, i + 1).reduce((a, b) => a + b, 0) / p
  })
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
