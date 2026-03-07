// pages/api/status.js
// Evalúa condiciones de alarma para una lista de símbolos (server-side, sin CORS)

function calcEMA(values, period) {
  const k = 2 / (period + 1)
  let ema = null
  for (const v of values) {
    if (v == null || isNaN(v)) continue
    if (ema === null) { ema = v; continue }
    ema = v * k + ema * (1 - k)
  }
  return ema
}

async function fetchCloses(symbol) {
  const raw = symbol === '^GSPC' ? 'spy'
    : symbol.includes('-USD') ? symbol.replace('-USD', '').toLowerCase() + '.us'
    : symbol.replace('^', '').toLowerCase() + '.us'

  const sym = raw.includes('.us') ? raw : raw + '.us'
  const url = `https://stooq.com/q/d/l/?s=${sym}&i=d`
  const res = await fetch(url)
  const text = await res.text()
  if (!text || text.includes('No data') || text.trim().length < 50) return null
  return text.trim().split('\n').slice(1)
    .filter(l => l.trim())
    .map(l => parseFloat(l.split(',')[4]))
    .filter(v => !isNaN(v))
}

function evalCondition(condition, closes, emaR, emaL) {
  if (!closes || closes.length < Math.max(emaR, emaL) + 10) return null
  const last = closes.slice(-200)
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

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { symbols, alarms } = req.body
  if (!Array.isArray(symbols) || !Array.isArray(alarms)) {
    return res.status(400).json({ error: 'symbols y alarms son requeridos' })
  }

  const result = {}

  await Promise.all(
    symbols.map(async sym => {
      try {
        const closes = await fetchCloses(sym)
        if (!closes) { result[sym] = null; return }
        const symResult = {}
        alarms.forEach(a => {
          symResult[a.id] = evalCondition(a.condition, closes, a.ema_r, a.ema_l)
        })
        result[sym] = symResult
      } catch {
        result[sym] = null
      }
    })
  )

  res.status(200).json(result)
}
