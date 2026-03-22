// pages/api/tradelog.js
// TradeLog API — CRUD fills individuales + FX histórico + parsers importación
// V5.29: arquitectura fill-first (una fila = un fill BUY o SELL)
// Columnas trades_log: id, symbol, fill_type, date, price, shares, commission,
//                      currency, fx, broker, strategy, notes, import_source, created_at

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://uqjngxxbdlquiuhywiuc.supabase.co'
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_st9QJ3zcQbY5ec-JhxwqXQ_joy3udz3'

const ALLOWED_COLS = new Set([
  'id','symbol','fill_type','date','price','shares',
  'commission','currency','fx','broker','strategy','notes','import_source',
])

async function sb(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: opts.prefer || 'return=representation',
    },
    ...opts,
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Supabase ${res.status}: ${err}`)
  }
  const text = await res.text()
  return text ? JSON.parse(text) : null
}

// ── FX: tipo de cambio histórico (frankfurter.app) ───────────
async function getFxRate(date, fromCur, toCur = 'EUR') {
  if (fromCur === toCur) return 1.0
  const baseCur = toCur, quoteCur = fromCur
  try {
    const cached = await sb(`/fx_rates?date=eq.${date}&from_cur=eq.${baseCur}&to_cur=eq.${quoteCur}&select=rate`)
    if (cached?.length) return parseFloat(cached[0].rate)
  } catch (_) {}
  try {
    const res = await fetch(`https://api.frankfurter.app/${date}?from=${baseCur}&to=${quoteCur}`)
    if (res.ok) {
      const data = await res.json()
      const rate = data?.rates?.[quoteCur]
      if (rate) {
        try {
          await sb('/fx_rates', { method: 'POST', prefer: 'return=minimal',
            body: JSON.stringify({ date, from_cur: baseCur, to_cur: quoteCur, rate, source: 'frankfurter' }) })
        } catch (_) {}
        return parseFloat(rate)
      }
    }
  } catch (_) {}
  return null
}

// ── Precio actual (Stooq) ────────────────────────────────────
const MAP_STOOQ = {
  '^GSPC':'spy.us','^NDX':'ndx.us','^IBEX':'ibex.es','^GDAXI':'dax.de',
  '^FTSE':'ftse.uk','^N225':'n225.jp','BTC-USD':'btc-usd.v','ETH-USD':'eth-usd.v',
  'GC=F':'gc.f','CL=F':'cl.f',
}
async function getCurrentPrice(symbol) {
  try {
    const sym = MAP_STOOQ[symbol] || (symbol.toLowerCase() + '.us')
    const res = await fetch(`https://stooq.com/q/d/l/?s=${sym}&i=d`)
    const text = await res.text()
    if (!text || text.includes('No data')) return null
    const lines = text.trim().split('\n').slice(1).filter(l => l.trim())
    if (!lines.length) return null
    const last = lines[lines.length - 1].split(',')
    return { price: parseFloat(last[4]), date: last[0] }
  } catch { return null }
}

// ── Parsers de importación ───────────────────────────────────
// Todos devuelven fills con campos nuevos: date, price, currency, commission

function parseIBKRcsv(csvText) {
  const lines = csvText.split('\n').map(l => l.trim()).filter(Boolean)
  const fills = []
  let inTrades = false, headers = []

  for (const line of lines) {
    const cols = line.split(',').map(c => c.replace(/"/g, '').trim())
    if (cols[0] === 'Trades' && cols[1] === 'Header') { headers = cols; inTrades = true; continue }
    if (cols[0] === 'Trades' && cols[1] === 'Data' && inTrades) {
      const get = (key) => { const i = headers.indexOf(key); return i >= 0 ? cols[i] : null }
      const symbol   = get('Symbol')
      const datetime = get('Date/Time') || get('TradeDate')
      const qty      = parseFloat(get('Quantity') || '0')
      const price    = parseFloat(get('T. Price') || get('TradePrice') || '0')
      const comm     = Math.abs(parseFloat(get('Comm/Fee') || get('Commission') || '0'))
      const currency = get('Currency') || 'USD'
      if (!symbol || !qty || !price) continue
      const date = datetime ? datetime.split(' ')[0].split(',')[0] : null
      fills.push({ symbol, date, price, shares: Math.abs(qty), currency, commission: comm,
        fill_type: qty > 0 ? 'buy' : 'sell', broker: 'ibkr', import_source: 'ibkr_csv' })
      continue
    }
    if (inTrades && cols[0] !== 'Trades') inTrades = false
  }
  return fills
}

function parseDegiroCSV(csvText) {
  const lines = csvText.split('\n').map(l => l.trim()).filter(Boolean)
  if (!lines.length) return []
  const headers = lines[0].split(',').map(c => c.replace(/"/g, '').trim())
  const fills = []
  for (const line of lines.slice(1)) {
    const cols = line.split(',').map(c => c.replace(/"/g, '').trim())
    const get = (key) => { const i = headers.findIndex(h => h.toLowerCase().includes(key.toLowerCase())); return i >= 0 ? cols[i] : null }
    const date     = get('fecha') || get('date')
    const symbol   = get('producto') || get('symbol') || get('isin')
    const qty      = parseFloat((get('número') || get('quantity') || '0').replace(',', '.'))
    const price    = parseFloat((get('precio') || get('price') || '0').replace(',', '.'))
    const currency = get('divisa') || get('currency') || 'EUR'
    const comm     = Math.abs(parseFloat((get('costes') || get('commission') || '0').replace(',', '.')))
    if (!symbol || !qty || !price) continue
    fills.push({ symbol: symbol.toUpperCase(), date, price, shares: Math.abs(qty),
      currency, commission: comm, fill_type: qty > 0 ? 'buy' : 'sell',
      broker: 'degiro', import_source: 'degiro_csv' })
  }
  return fills
}

function parseIBKRtext(text) {
  const fills = []
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  let currency = 'USD'
  for (const line of lines) {
    if (/^(USD|EUR|GBP|CHF|CAD|AUD|JPY)$/.test(line.trim())) { currency = line.trim(); continue }
    const cols = line.split(/\t|  +/).map(c => c.trim()).filter(Boolean)
    if (cols.length < 8 || !/^U\d+$/.test(cols[0])) continue
    const symbol   = cols[1]
    const dateStr  = cols[2]
    const typeCol  = cols[5]
    const qtyRaw   = cols[6]
    const priceRaw = cols[7]
    const commRaw  = cols[9] || cols[8] || '0'
    if (!symbol || !dateStr || !typeCol) continue
    if (!/BUY|SELL|COMPRA|VENTA/i.test(typeCol)) continue
    const date  = dateStr.split(/[,\s]/)[0]
    const qty   = parseFloat(qtyRaw.replace(/[,\s]/g,''))
    const price = parseFloat(priceRaw.replace(/[,\s]/g,''))
    const comm  = Math.abs(parseFloat(commRaw.replace(/[,\s]/g,'')) || 0)
    if (!date || isNaN(qty) || isNaN(price) || !qty || !price) continue
    fills.push({ symbol, date, price, shares: Math.abs(qty), currency, commission: comm,
      fill_type: /BUY|COMPRA/i.test(typeCol) ? 'buy' : 'sell',
      broker: 'ibkr', import_source: 'ibkr_text' })
  }
  return fills
}

function parseIBKRorderDetail(text, useDDMM = true) {
  const fills = []
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  const actionRe = /^(Bought|Bot|Bght|Sold|Sld|Comprado|Vendido)\s+(\d+(?:[.,]\d+)?)\s+@\s+([\d.,]+)/i
  const dateRe = /^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})/
  let i = 0
  while (i < lines.length) {
    const m = actionRe.exec(lines[i])
    if (m) {
      const qty   = parseFloat(m[2].replace(',','.'))
      const price = parseFloat(m[3].replace(',','.'))
      const isBuy = /Bought|Bot|Bght|Comprado/i.test(m[1])
      let date = null, fees = 0, symbol = null
      for (let j = i + 1; j < Math.min(i + 15, lines.length); j++) {
        if (!date) {
          const dm = dateRe.exec(lines[j])
          if (dm) {
            const p1 = parseInt(dm[1]), p2 = parseInt(dm[2]), year = dm[3]
            let day, month
            if (p1 > 12)      { day=p1; month=p2 }
            else if (p2 > 12) { day=p2; month=p1 }
            else if (useDDMM) { day=p1; month=p2 }
            else              { day=p2; month=p1 }
            date = year+'-'+String(month).padStart(2,'0')+'-'+String(day).padStart(2,'0')
          }
        }
        const fm = /Fees?:\s*([\d.,]+)/i.exec(lines[j])
        if (fm) fees = parseFloat(fm[1].replace(',','.'))
        if (j > i && actionRe.test(lines[j])) break
      }
      for (let j = Math.max(0, i - 8); j < i; j++) {
        if (/^[A-Z]{1,6}$/.test(lines[j])) symbol = lines[j]
      }
      if (symbol && price && qty && date) {
        fills.push({ symbol, date, price, shares: qty, currency: 'USD', commission: fees,
          fill_type: isBuy ? 'buy' : 'sell', broker: 'ibkr', import_source: 'ibkr_order' })
      }
    }
    i++
  }
  return fills
}

function parseIBKRtabSpanish(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  const fills = []
  let currency = 'USD'
  for (const line of lines) {
    if (/^(USD|EUR|GBP|CHF|CAD|AUD|JPY)$/.test(line)) { currency = line; continue }
    const cols = line.split('\t')
    if (!cols[0] || /^(Símbolo|Symbol|Acciones|Stocks|Total)/i.test(cols[0])) continue
    if (cols.length < 7) continue
    const symbol   = cols[0].trim()
    const dateStr  = (cols[1] || '').trim()
    const qtyRaw   = (cols[2] || '').trim()
    const priceRaw = (cols[3] || '').trim()
    const commRaw  = (cols[6] || '0').trim()
    const date = dateStr.split(/[,\s]/)[0]
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
    const qty  = parseFloat(qtyRaw.replace(/,/g, ''))
    const price = parseFloat(priceRaw.replace(/,/g, ''))
    const comm  = Math.abs(parseFloat(commRaw.replace(/,/g, '')) || 0)
    if (!qty || !price || isNaN(qty) || isNaN(price)) continue
    fills.push({ symbol, date, price, shares: Math.abs(qty), currency, commission: comm,
      fill_type: qty > 0 ? 'buy' : 'sell', broker: 'ibkr', import_source: 'ibkr_tab_es' })
  }
  return fills
}

function autoParseText(text, useDDMM = true) {
  if (/Símbolo\tFecha|Fecha\/Hora\tCantidad/m.test(text) ||
      /\t\d{4}-\d{2}-\d{2},\s*\d{2}:\d{2}/.test(text)) {
    const result = parseIBKRtabSpanish(text)
    if (result.length > 0) return { fills: result, source: 'ibkr_tab_es' }
  }
  if (/U\d{7,}\s+[A-Z]+\s+\d{4}-\d{2}-\d{2}/m.test(text) ||
      /Id\. de cuenta|Account ID/i.test(text)) {
    const result = parseIBKRtext(text)
    if (result.length > 0) return { fills: result, source: 'ibkr_text' }
  }
  if (/^(Bought|Bot|Bght|Sold|Sld|Comprado|Vendido)\s+\d/im.test(text)) {
    const result = parseIBKRorderDetail(text, useDDMM)
    if (result.length > 0) return { fills: result, source: 'ibkr_order' }
  }
  return null
}

async function parseWithAI(text, apiKey) {
  const GROQ_KEY = apiKey || process.env.GROQ_API_KEY
  if (!GROQ_KEY) throw new Error('API key de Groq no configurada. Ve a ⚙ Config → Integraciones y añade tu clave Groq.')
  const PROMPT = `Extrae las operaciones de trading del siguiente texto y devuelve SOLO un JSON array.
Cada operación debe tener estos campos (todos opcionales excepto symbol):
- symbol (string, ticker, en mayúsculas)
- fill_type ("buy" o "sell")
- date (YYYY-MM-DD)
- shares (número positivo)
- price (número, precio de ejecución)
- currency ("USD", "EUR", "GBP"...)
- commission (número, comisión total del fill)
- broker (si se menciona: "ibkr","degiro","binance","myinvestor")

Ignora líneas de totales, subtotales, cabeceras y resúmenes.
Si no hay operaciones claras, devuelve [].
Responde SOLO con el JSON array, sin texto adicional, sin markdown.

TEXTO:
${text.slice(0, 3500)}`

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_KEY}` },
    body: JSON.stringify({ model: 'llama-3.1-8b-instant', max_tokens: 2000, temperature: 0,
      messages: [{ role: 'user', content: PROMPT }] })
  })
  if (!res.ok) {
    const errText = await res.text()
    try {
      const errJson = JSON.parse(errText)
      const errDetail = errJson?.error?.message || errText
      const m = errDetail.match(/try again in ([\d.]+)s/i)
      throw new Error(`Groq API ${res.status}${m ? ` — espera ${Math.ceil(parseFloat(m[1]))}s` : ''}: ${errDetail}`)
    } catch(pe) {
      if (pe.message.startsWith('Groq API')) throw pe
      throw new Error(`Groq API ${res.status}: ${errText}`)
    }
  }
  const data = await res.json()
  const raw = data.choices?.[0]?.message?.content || '[]'
  try { return JSON.parse(raw.replace(/```json|```/g, '').trim()) } catch { return [] }
}

// ── Handler principal ────────────────────────────────────────
export default async function handler(req, res) {
  const { action } = req.query

  // ── GET list — devuelve todos los fills + precios actuales por símbolo ──
  if (req.method === 'GET' && action === 'list') {
    try {
      const { broker, year, symbol } = req.query
      let path = '/trades_log?order=date.desc,created_at.desc&limit=2000'
      if (broker) path += `&broker=eq.${broker}`
      if (symbol) path += `&symbol=eq.${symbol.toUpperCase()}`
      if (year)   path += `&date=gte.${year}-01-01&date=lte.${year}-12-31`

      const fills = await sb(path)

      // Precio actual por símbolo único (para P&L flotante de posiciones abiertas)
      const symbols = [...new Set((fills || []).map(t => t.symbol))]
      const prices = {}
      await Promise.all(symbols.map(async sym => {
        const r = await getCurrentPrice(sym).catch(() => null)
        if (r) prices[sym] = r
      }))

      return res.status(200).json({ trades: fills || [], prices })
    } catch (e) {
      return res.status(500).json({ error: e.message })
    }
  }

  // ── GET fx ──
  if (req.method === 'GET' && action === 'fx') {
    try {
      const fromCur = req.query.from || req.query.currency || 'USD'
      const toCur   = req.query.to || 'EUR'
      let dateStr = req.query.date || new Date().toISOString().slice(0,10)
      if (fromCur === toCur) return res.status(200).json({ fx: 1, rate: 1, date: dateStr, from: fromCur })
      let rate = await getFxRate(dateStr, fromCur, toCur)
      if (!rate) {
        for (let i = 1; i <= 3; i++) {
          const d = new Date(dateStr); d.setDate(d.getDate()-i)
          const ds = d.toISOString().slice(0,10)
          rate = await getFxRate(ds, fromCur, toCur)
          if (rate) { dateStr = ds; break }
        }
      }
      return res.status(200).json({ fx: rate, rate, date: dateStr, from: fromCur })
    } catch (e) {
      return res.status(500).json({ error: e.message })
    }
  }

  // ── GET contributions ──
  if (req.method === 'GET' && action === 'contributions') {
    try {
      const data = await sb('/capital_contributions?order=date.desc,created_at.desc')
      return res.status(200).json(data || [])
    } catch (e) { return res.status(500).json({ error: e.message }) }
  }

  if (req.method !== 'POST') return res.status(405).end()
  const body = req.body

  // ── POST save — crear o actualizar un fill individual ──
  if (action === 'save') {
    try {
      let fill = { ...body }

      // Auto-fetch FX si no viene provisto
      if (fill.date && fill.currency && fill.currency !== 'EUR' && !fill.fx) {
        fill.fx = await getFxRate(fill.date, fill.currency) || null
      } else if (fill.currency === 'EUR') {
        fill.fx = 1.0
      }

      // Solo columnas permitidas en DB
      const clean = Object.fromEntries(Object.entries(fill).filter(([k]) => ALLOWED_COLS.has(k)))

      let saved
      if (clean.id) {
        saved = await sb(`/trades_log?id=eq.${clean.id}`, { method: 'PATCH', body: JSON.stringify(clean) })
      } else {
        saved = await sb('/trades_log', { method: 'POST', body: JSON.stringify(clean) })
      }
      return res.status(200).json({ trade: Array.isArray(saved) ? saved[0] : saved })
    } catch (e) {
      return res.status(500).json({ error: e.message })
    }
  }

  // ── POST delete ──
  if (action === 'delete') {
    try {
      await sb(`/trades_log?id=eq.${body.id}`, { method: 'DELETE', prefer: 'return=minimal' })
      return res.status(200).json({ ok: true })
    } catch (e) {
      return res.status(500).json({ error: e.message })
    }
  }

  // ── POST delete-multi ──
  if (action === 'delete-multi') {
    try {
      const ids = body.ids
      if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'ids requerido' })
      await sb(`/trades_log?id=in.(${ids.join(',')})`, { method: 'DELETE', prefer: 'return=minimal' })
      return res.status(200).json({ ok: true, deleted: ids.length })
    } catch (e) {
      return res.status(500).json({ error: e.message })
    }
  }

  // ── POST parse — parsear texto/CSV de importación ──
  if (action === 'parse') {
    try {
      const { text, format, apiKey, ibkrDateFormat } = body
      const useDDMM = ibkrDateFormat !== 'MM/DD'
      let parsed = []

      if (format === 'ibkr_csv')       parsed = parseIBKRcsv(text)
      else if (format === 'degiro_csv') parsed = parseDegiroCSV(text)
      else if (format === 'ai') {
        const local = autoParseText(text, useDDMM)
        if (local && local.fills.length > 0) {
          parsed = local.fills
        } else {
          parsed = await parseWithAI(text, apiKey)
        }
      }
      else return res.status(400).json({ error: 'Formato no soportado: ibkr_csv | degiro_csv | ai' })

      // Enriquecer con FX automático
      for (const t of parsed) {
        if (t.date && t.currency && t.currency !== 'EUR') {
          t.fx = await getFxRate(t.date, t.currency) || null
        } else {
          t.fx = 1.0
        }
      }

      return res.status(200).json({ parsed, count: parsed.length })
    } catch (e) {
      return res.status(500).json({ error: e.message })
    }
  }

  // ── POST add-contribution ──
  if (action === 'add-contribution') {
    try {
      const { date, amount, type, notes } = body
      if (!date || !amount || !type) return res.status(400).json({ error: 'Faltan campos obligatorios' })
      const data = await sb('/capital_contributions', {
        method: 'POST',
        body: JSON.stringify({ date, amount: parseFloat(amount), type, notes: notes || null }),
      })
      return res.status(200).json(data?.[0] || {})
    } catch (e) { return res.status(500).json({ error: e.message }) }
  }

  // ── POST delete-contribution ──
  if (action === 'delete-contribution') {
    try {
      const { id } = body
      if (!id) return res.status(400).json({ error: 'Falta id' })
      await sb('/capital_contributions?id=eq.' + id, { method: 'DELETE', prefer: 'return=minimal' })
      return res.status(200).json({ ok: true })
    } catch (e) { return res.status(500).json({ error: e.message }) }
  }

  // ── POST update-contribution ──
  if (action === 'update-contribution') {
    try {
      const { id, date, amount, type, notes } = body
      if (!id || !date || !amount || !type) return res.status(400).json({ error: 'Faltan campos' })
      const data = await sb('/capital_contributions?id=eq.' + id, {
        method: 'PATCH',
        body: JSON.stringify({ date, amount: parseFloat(amount), type, notes: notes || null }),
      })
      return res.status(200).json(data?.[0] || {})
    } catch (e) { return res.status(500).json({ error: e.message }) }
  }

  return res.status(400).json({ error: 'Acción no reconocida' })
}
