// pages/api/status.js
// Evalúa condiciones de alarma — devuelve {active, bars} por cada alarma/símbolo
// Soporta: ema_cross_*, price_*_ma, rsi_*, macd_cross_*

// ── Indicadores ──────────────────────────────────────────────
// Los mismos que el gráfico y que el backtest. Este archivo tenía copias propias desde antes de que
// lib/backtester.js existiera, y su EMA sembraba con el PRIMER valor en vez de con la SMA de los
// primeros `period`. Consecuencia: una alarma podía dar el veredicto contrario al que se veía en el
// gráfico. Con periodos cortos daba igual —medido, 0 diferencias con 10/11, RSI 14 y MACD
// 12/26/9—, pero con una media de 200 el error de siembra llegaba al 12%.
import { calcEMA, calcRSI, calcMACD } from '../../lib/backtester'
import { stooqSym } from '../../lib/simbolos'

// ── Stooq fetch ───────────────────────────────────────────────
// La traducción es la compartida (lib/simbolos.js). La copia que había aquí tenía seis entradas menos que
// la del motor, así que un mismo símbolo podía traducirse distinto según quién preguntara.

async function fetchCloses(symbol, bodyCloses) {
  // Prefer closes pre-fetched by the client (Stooq blocks server IPs on Vercel)
  if (bodyCloses?.[symbol]?.length >= 30) return bodyCloses[symbol]
  // Fallback: fetch from Stooq (works locally, may fail on Vercel)
  const sym = stooqSym(symbol)
  // Sin equivalencia segura no se pregunta: mejor sin alarma que una alarma sobre otro instrumento.
  if (!sym) { console.log(`[status] ${symbol}: sin equivalencia en Stooq`); return null }
  const url = `https://stooq.com/q/d/l/?s=${sym}&i=d`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15000)
  try {
    const res = await fetch(url, { signal: controller.signal })
    const text = await res.text()
    if (!text || text.includes('No data') || text.trim().length < 50) {
      console.log(`[status] ${symbol}: sin datos de Stooq (${sym})`)
      return null
    }
    const closes = text.trim().split('\n').slice(1)
      .filter(l => l.trim())
      .map(l => parseFloat(l.split(',')[4]))
      .filter(v => !isNaN(v))
    if (closes.length < 30) {
      console.log(`[status] ${symbol}: solo ${closes.length} velas`)
      return null
    }
    return closes
  } catch(e) {
    console.log(`[status] ${symbol}: fetch falló — ${e.message}`)
    return null
  }
  finally { clearTimeout(timer) }
}

// ── Condition evaluator ───────────────────────────────────────
// alarm: { id, condition, ema_r, ema_l, params }
// params overrides ema_r/ema_l when condition comes from a global condition
function evalConditionFull(alarm, closes, sym) {
  const condition = alarm.condition
  const p = alarm.params || {}

  // Resolve params — global condition params take priority over legacy fields.
  // Un periodo tiene que ser un entero >= 1; cualquier otra cosa cae al valor por defecto. Antes era
  // `p.ma_fast ?? Number(alarm.ema_r) ?? 10`, y ahí `??` NO captura el 0 mientras que Number(null)
  // SÍ vale 0: un ema_r nulo se convertía en periodo 0, con k = 2/(0+1) = 2, y la EMA degeneraba en
  // la oscilación 2v−ema. Sin excepción, sin log, y con veredictos de aspecto normal —medido: activa
  // el 50% de los días, contraria a la correcta en el 50,8%—. Con la guarda, un valor imposible cae
  // al default en vez de producir una serie sin sentido.
  const per = (v, def) => { const n = Math.floor(Number(v)); return Number.isFinite(n) && n >= 1 ? n : def }
  const maFast   = per(p.ma_fast   ?? alarm.ema_r, 10)
  const maSlow   = per(p.ma_slow   ?? alarm.ema_l, 11)
  const maPeriod = per(p.ma_period, maFast)
  const rsiPer   = per(p.period, 14)
  const rsiLev   = p.level ?? 50   // es un NIVEL, no un periodo: el 0 es legítimo
  const macdF    = per(p.fast, 12)
  const macdS    = per(p.slow, 26)
  const macdSig  = per(p.signal, 9)

  // `needed` es el MÍNIMO para no abortar; sigue igual.
  const needed = Math.max(maSlow, maPeriod, rsiPer * 3, macdS * 3, 50)
  if (!closes || closes.length < needed) return { active: null, bars: null }

  // La ventana que se EVALÚA es otra cosa. Estaba topada en 400 barras, y desde V9.733 el cliente
  // descarga hasta 4× el periodo más largo —797 sesiones para una 50/200—, así que el tope tiraba
  // más de la mitad de lo descargado. Ahora vale 4× el periodo más largo de ESTA alarma: el mismo
  // criterio que usa el cliente al pedir, y ni una barra más de las que hacen falta para que el
  // indicador converja (la influencia de la siembra tras 4·P barras es ~e^-8, un 0,03%).
  // El suelo de 400 se mantiene: con periodos cortos es lo que ya se evaluaba.
  const ventana = Math.max(400, 4 * Math.max(maSlow, maPeriod, rsiPer, macdS))
  const last = closes.slice(-ventana)
  const n = last.length - 1

  // ── EMA cross ──
  if (condition === 'ema_cross_up' || condition === 'ema_cross_down') {
    const erArr = calcEMA(last, maFast)
    const elArr = calcEMA(last, maSlow)
    const er = erArr[n], el = elArr[n]
    if (er == null || el == null) return { active: null, bars: null }
    const isUp = condition === 'ema_cross_up'
    const active = isUp ? er > el : er < el
    if (!active) return { active: false, bars: null }
    for (let i = n; i >= 1; i--) {
      if (erArr[i] != null && elArr[i] != null && erArr[i-1] != null && elArr[i-1] != null) {
        const cross = isUp
          ? (erArr[i] > elArr[i] && erArr[i-1] <= elArr[i-1])
          : (erArr[i] < elArr[i] && erArr[i-1] >= elArr[i-1])
        if (cross) return { active: true, bars: n - i }
      }
    }
    return { active: true, bars: n }
  }

  // ── Price vs MA ──
  if (condition === 'price_above_ma' || condition === 'price_below_ma' ||
      condition === 'price_above_ema' || condition === 'price_below_ema') {
    const maArr = calcEMA(last, maPeriod)
    const price = last[n], ma = maArr[n]
    if (ma == null) return { active: null, bars: null }
    const isAbove = condition === 'price_above_ma' || condition === 'price_above_ema'
    const active = isAbove ? price > ma : price < ma
    if (!active) return { active: false, bars: null }
    let count = 0
    for (let i = n; i >= 0; i--) {
      if (maArr[i] == null) break
      const ok = isAbove ? last[i] > maArr[i] : last[i] < maArr[i]
      if (ok) count++; else break
    }
    return { active: true, bars: count }
  }

  // ── RSI above/below level ──
  if (condition === 'rsi_above' || condition === 'rsi_below') {
    if (last.length < rsiPer + 5) return { active: null, bars: null }
    const rsiArr = calcRSI(last, rsiPer)
    const rsi = rsiArr[n]
    if (rsi == null) return { active: null, bars: null }
    const active = condition === 'rsi_above' ? rsi > rsiLev : rsi < rsiLev
    if (!active) return { active: false, bars: null }
    let count = 0
    for (let i = n; i >= 0; i--) {
      if (rsiArr[i] == null) break
      const ok = condition === 'rsi_above' ? rsiArr[i] > rsiLev : rsiArr[i] < rsiLev
      if (ok) count++; else break
    }
    return { active: true, bars: count }
  }

  // ── RSI cross up/down ──
  if (condition === 'rsi_cross_up' || condition === 'rsi_cross_down') {
    if (last.length < rsiPer + 5) return { active: null, bars: null }
    const rsiArr = calcRSI(last, rsiPer)
    const rsi = rsiArr[n], rsiPrev = rsiArr[n - 1]
    if (rsi == null || rsiPrev == null) return { active: null, bars: null }
    const isUp = condition === 'rsi_cross_up'
    // Active if currently crossed (rsi is on the other side of the level)
    const active = isUp ? rsi > rsiLev : rsi < rsiLev
    if (!active) return { active: false, bars: null }
    // Find bars since the cross
    for (let i = n; i >= 1; i--) {
      if (rsiArr[i] != null && rsiArr[i-1] != null) {
        const cross = isUp
          ? (rsiArr[i] > rsiLev && rsiArr[i-1] <= rsiLev)
          : (rsiArr[i] < rsiLev && rsiArr[i-1] >= rsiLev)
        if (cross) return { active: true, bars: n - i }
      }
    }
    return { active: true, bars: n }
  }

  // ── MACD cross up/down ──
  if (condition === 'macd_cross_up' || condition === 'macd_cross_down') {
    const { line: macdLine, signal: signalLine } = calcMACD(last, macdF, macdS, macdSig)
    const m = macdLine[n], s = signalLine[n], mp = macdLine[n-1], sp = signalLine[n-1]
    if (m == null || s == null || mp == null || sp == null) return { active: null, bars: null }
    const isUp = condition === 'macd_cross_up'
    const active = isUp ? m > s : m < s
    if (!active) return { active: false, bars: null }
    for (let i = n; i >= 1; i--) {
      if (macdLine[i] != null && signalLine[i] != null && macdLine[i-1] != null && signalLine[i-1] != null) {
        const cross = isUp
          ? (macdLine[i] > signalLine[i] && macdLine[i-1] <= signalLine[i-1])
          : (macdLine[i] < signalLine[i] && macdLine[i-1] >= signalLine[i-1])
        if (cross) return { active: true, bars: n - i }
      }
    }
    return { active: true, bars: n }
  }

  // ── Precio vs nivel fijo (alertas de precio) ──
  if (condition === 'price_level') {
    const level = Number(alarm.price_level)
    if (!level || !closes?.length) return { active: null, bars: null }
    const lastClose = closes[closes.length - 1]
    const isAbove = alarm.condition_detail === 'price_above'
    const active = isAbove ? lastClose >= level : lastClose <= level
    if (!active) return { active: false, bars: null }
    let count = 0
    for (let i = closes.length - 1; i >= 0; i--) {
      const ok = isAbove ? closes[i] >= level : closes[i] <= level
      if (ok) count++; else break
    }
    return { active: true, bars: count }
  }

  return { active: null, bars: null }
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { symbols, alarms, closes: bodyCloses } = req.body
  if (!Array.isArray(symbols) || !Array.isArray(alarms)) {
    return res.status(400).json({ error: 'symbols y alarms son requeridos' })
  }

  const result = {}
  const BATCH = 4
  const DELAY = 300

  for (let i = 0; i < symbols.length; i += BATCH) {
    const chunk = symbols.slice(i, i + BATCH)
    await Promise.all(
      chunk.map(async sym => {
        try {
          const closes = await fetchCloses(sym, bodyCloses)
          if (!closes) { result[sym] = null; return }
          const symResult = {}
          alarms.forEach(a => {
            // If alarm is symbol-specific, only evaluate for its own symbol
            if (a.symbol && a.symbol.toUpperCase() !== sym.toUpperCase()) return
            symResult[a.id] = evalConditionFull(a, closes, sym)
          })
          result[sym] = symResult
        } catch(e) { console.log(`[status] ${sym}: error en eval — ${e.message}`); result[sym] = null }
      })
    )
    if (i + BATCH < symbols.length) await sleep(DELAY)
  }

  res.status(200).json(result)
}
