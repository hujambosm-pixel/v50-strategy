// pages/api/status.js
// Evalúa condiciones de alarma — devuelve {active, bars} por cada alarma/símbolo
// Soporta: ema_cross_*, price_*_ma, rsi_*, macd_cross_*

// ── Indicadores ──────────────────────────────────────────────
function calcEMAArr(values, period) {
  const k = 2 / (period + 1)
  const result = new Array(values.length).fill(null)
  let ema = null
  for (let i = 0; i < values.length; i++) {
    const v = values[i]
    if (v == null || isNaN(v)) continue
    ema = ema === null ? v : v * k + ema * (1 - k)
    result[i] = ema
  }
  return result
}

function calcRSI(closes, period) {
  const result = new Array(closes.length).fill(null)
  let avgGain = 0, avgLoss = 0
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1]
    if (diff > 0) avgGain += diff; else avgLoss -= diff
  }
  avgGain /= period; avgLoss /= period
  result[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1]
    const gain = diff > 0 ? diff : 0
    const loss = diff < 0 ? -diff : 0
    avgGain = (avgGain * (period - 1) + gain) / period
    avgLoss = (avgLoss * (period - 1) + loss) / period
    result[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
  }
  return result
}

function calcMACD(closes, fast, slow, signal) {
  const emaFast = calcEMAArr(closes, fast)
  const emaSlow = calcEMAArr(closes, slow)
  const macdLine = closes.map((_, i) =>
    emaFast[i] != null && emaSlow[i] != null ? emaFast[i] - emaSlow[i] : null
  )
  const signalLine = calcEMAArr(macdLine.filter(v => v != null), signal)
  // Re-align signal to original indices
  const signalFull = new Array(closes.length).fill(null)
  let si = 0
  for (let i = 0; i < closes.length; i++) {
    if (macdLine[i] != null) { signalFull[i] = signalLine[si] ?? null; si++ }
  }
  return { macdLine, signalLine: signalFull }
}

// ── Stooq fetch ───────────────────────────────────────────────
function toStooqSym(symbol) {
  const MAP = {
    '^GSPC':'spy.us','^NDX':'ndx.us','^IBEX':'ibex.es','^GDAXI':'dax.de',
    '^FTSE':'ftse.uk','^N225':'n225.jp','BTC-USD':'btc-usd.v','ETH-USD':'eth-usd.v',
    'GC=F':'gc.f','CL=F':'cl.f'
  }
  if (MAP[symbol]) return MAP[symbol]
  if (symbol.endsWith('=F')) return symbol.replace('=F','').toLowerCase()+'.f'
  if (symbol.includes('-')) return symbol.toLowerCase()+'.v'
  if (symbol.startsWith('^')) return symbol.slice(1).toLowerCase()+'.us'
  return symbol.toLowerCase()+'.us'
}

async function fetchCloses(symbol) {
  const sym = toStooqSym(symbol)
  const url = `https://stooq.com/q/d/l/?s=${sym}&i=d`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  try {
    const res = await fetch(url, { signal: controller.signal })
    const text = await res.text()
    if (!text || text.includes('No data') || text.trim().length < 50) return null
    const closes = text.trim().split('\n').slice(1)
      .filter(l => l.trim())
      .map(l => parseFloat(l.split(',')[4]))
      .filter(v => !isNaN(v))
    return closes.length >= 30 ? closes : null
  } catch { return null }
  finally { clearTimeout(timer) }
}

// ── Condition evaluator ───────────────────────────────────────
// alarm: { id, condition, ema_r, ema_l, params }
// params overrides ema_r/ema_l when condition comes from a global condition
function evalConditionFull(alarm, closes, sym) {
  const condition = alarm.condition
  const p = alarm.params || {}

  // Resolve params — global condition params take priority over legacy fields
  const maFast   = p.ma_fast   ?? Number(alarm.ema_r)  ?? 10
  const maSlow   = p.ma_slow   ?? Number(alarm.ema_l)  ?? 11
  const maPeriod = p.ma_period ?? maFast
  const rsiPer   = p.period    ?? 14
  const rsiLev   = p.level     ?? 50
  const macdF    = p.fast      ?? 12
  const macdS    = p.slow      ?? 26
  const macdSig  = p.signal    ?? 9

  const needed = Math.max(maSlow, maPeriod, rsiPer * 3, macdS * 3, 50)
  if (!closes || closes.length < needed) return { active: null, bars: null }

  const last = closes.slice(-Math.max(400, needed))
  const n = last.length - 1

  // ── EMA cross ──
  if (condition === 'ema_cross_up' || condition === 'ema_cross_down') {
    const erArr = calcEMAArr(last, maFast)
    const elArr = calcEMAArr(last, maSlow)
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
    const maArr = calcEMAArr(last, maPeriod)
    const price = last[n], ma = maArr[n]
    if (ma == null) return { active: null, bars: null }
    const isAbove = condition === 'price_above_ma' || condition === 'price_above_ema'
    const active = isAbove ? price > ma : price < ma
    console.log(`[status:${sym||'?'}] ${condition}(period=${maPeriod}) lastClose=${price?.toFixed(3)} EMA${maPeriod}=${ma?.toFixed(3)} active=${active} closes[-3]=${last.slice(-3).map(v=>v?.toFixed(2)).join(',')}`)
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
    const { macdLine, signalLine } = calcMACD(last, macdF, macdS, macdSig)
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

  const { symbols, alarms } = req.body
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
          const closes = await fetchCloses(sym)
          if (!closes) { result[sym] = null; return }
          const symResult = {}
          alarms.forEach(a => {
            // If alarm is symbol-specific, only evaluate for its own symbol
            if (a.symbol && a.symbol.toUpperCase() !== sym.toUpperCase()) return
            symResult[a.id] = evalConditionFull(a, closes, sym)
          })
          result[sym] = symResult
        } catch { result[sym] = null }
      })
    )
    if (i + BATCH < symbols.length) await sleep(DELAY)
  }

  res.status(200).json(result)
}
