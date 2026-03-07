// pages/api/status.js
// Evalúa condiciones de alarma — devuelve {active, bars} por cada alarma/símbolo

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
  } catch { return null }
  finally { clearTimeout(timer) }
}

// Devuelve {active: bool, bars: number|null}
// bars = velas desde que la condición se cumple consecutivamente (price_above/below)
//      = velas desde el último cruce (cross_up/down)
function evalConditionFull(condition, closes, emaR, emaL) {
  const needed = Math.max(emaR, emaL) * 3
  if (!closes || closes.length < needed) return { active: null, bars: null }

  const last = closes.slice(-Math.max(300, needed))
  const erArr = calcEMAArr(last, emaR)
  const elArr = calcEMAArr(last, emaL)
  const n = last.length - 1

  const er = erArr[n], el = elArr[n], price = last[n]
  if (er == null || el == null) return { active: null, bars: null }

  if (condition === 'ema_cross_up') {
    const active = er > el
    if (!active) return { active: false, bars: null }
    // Contar velas desde el cruce alcista más reciente
    for (let i = n; i >= 1; i--) {
      if (erArr[i] != null && elArr[i] != null && erArr[i - 1] != null && elArr[i - 1] != null) {
        if (erArr[i] > elArr[i] && erArr[i - 1] <= elArr[i - 1]) {
          return { active: true, bars: n - i }
        }
      }
    }
    return { active: true, bars: n } // lleva todo el historial en bullish
  }

  if (condition === 'ema_cross_down') {
    const active = er < el
    if (!active) return { active: false, bars: null }
    for (let i = n; i >= 1; i--) {
      if (erArr[i] != null && elArr[i] != null && erArr[i - 1] != null && elArr[i - 1] != null) {
        if (erArr[i] < elArr[i] && erArr[i - 1] >= elArr[i - 1]) {
          return { active: true, bars: n - i }
        }
      }
    }
    return { active: true, bars: n }
  }

  if (condition === 'price_above_ema') {
    const active = price > er
    if (!active) return { active: false, bars: null }
    let count = 0
    for (let i = n; i >= 0; i--) {
      if (erArr[i] == null) break
      if (last[i] > erArr[i]) count++
      else break
    }
    return { active: true, bars: count }
  }

  if (condition === 'price_below_ema') {
    const active = price < er
    if (!active) return { active: false, bars: null }
    let count = 0
    for (let i = n; i >= 0; i--) {
      if (erArr[i] == null) break
      if (last[i] < erArr[i]) count++
      else break
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
            symResult[a.id] = evalConditionFull(a.condition, closes, Number(a.ema_r), Number(a.ema_l))
          })
          result[sym] = symResult
        } catch { result[sym] = null }
      })
    )
    if (i + BATCH < symbols.length) await sleep(DELAY)
  }

  res.status(200).json(result)
}
