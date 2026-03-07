// pages/api/status.js
// Evalúa condiciones de alarma para una lista de símbolos (server-side, sin CORS)

function calcEMA(values, period) {
  const k = 2 / (period + 1)
  let ema = null
  for (const v of values) {
    if (v == null || isNaN(v)) continue
    ema = ema === null ? v : v * k + ema * (1 - k)
  }
  return ema
}

// Misma lógica exacta que datos.js
function toStooqSym(symbol) {
  if (symbol === '^GSPC') return 'spy.us'
  return symbol.replace('^', '').toLowerCase() + '.us'
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
    return closes.length >= 20 ? closes : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

function evalCondition(condition, closes, emaR, emaL) {
  if (!closes || closes.length < Math.max(emaR, emaL) + 5) return null
  const last = closes.slice(-Math.max(200, emaL * 3))
  const er = calcEMA(last, emaR)
  const el = calcEMA(last, emaL)
  const price = last[last.length - 1]
  if (er == null || el == null || price == null) return null
  if (condition === 'ema_cross_up')    return er > el
  if (condition === 'ema_cross_down')  return er < el
  if (condition === 'price_above_ema') return price > er
  if (condition === 'price_below_ema') return price < er
  return null
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
            symResult[a.id] = evalCondition(a.condition, closes, Number(a.ema_r), Number(a.ema_l))
          })
          result[sym] = symResult
        } catch {
          result[sym] = null
        }
      })
    )
    if (i + BATCH < symbols.length) await sleep(DELAY)
  }

  res.status(200).json(result)
}
