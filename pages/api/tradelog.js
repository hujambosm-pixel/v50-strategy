// pages/api/tradelog.js
// TradeLog API — CRUD operaciones + FX histórico + parsers importación

// Hardcoded Supabase credentials (same as frontend)
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://uqjngxxbdlquiuhywiuc.supabase.co'
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_st9QJ3zcQbY5ec-JhxwqXQ_joy3udz3'

async function sb(path, opts = {}) {
  // SUPABASE_URL always available (hardcoded fallback)
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

// ── FX: obtener tipo de cambio histórico ─────────────────────
// Usa frankfurter.app (ECB data, gratuito, sin API key)
async function getFxRate(date, fromCur, toCur = 'EUR') {
  if (fromCur === toCur) return 1.0

  // Guardamos siempre como EURUSD (>1): cuántos USD vale 1 EUR
  // Así la fórmula de conversión es: importe_EUR = importe_USD / rate
  // Ej: EUR→USD = 1.1641 → $559.5 / 1.1641 = €480.5
  const baseCur = toCur   // EUR (la divisa base, >1)
  const quoteCur = fromCur  // USD (la que compramos)

  // 1. Buscar en cache Supabase (guardado como EUR→USD)
  try {
    const cached = await sb(
      `/fx_rates?date=eq.${date}&from_cur=eq.${baseCur}&to_cur=eq.${quoteCur}&select=rate`
    )
    if (cached?.length) return parseFloat(cached[0].rate)
  } catch (_) {}

  // 2. Llamar a frankfurter.app: from=EUR&to=USD → devuelve 1.1641
  try {
    const url = `https://api.frankfurter.app/${date}?from=${baseCur}&to=${quoteCur}`
    const res = await fetch(url)
    if (res.ok) {
      const data = await res.json()
      const rate = data?.rates?.[quoteCur]
      if (rate) {
        try {
          await sb('/fx_rates', {
            method: 'POST',
            prefer: 'return=minimal',
            body: JSON.stringify({ date, from_cur: baseCur, to_cur: quoteCur, rate, source: 'frankfurter' }),
          })
        } catch (_) {}
        return parseFloat(rate)
      }
    }
  } catch (_) {}

  return null
}

// Precio actual de un símbolo vía Stooq (para flotante)
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

// ── Parser IBKR CSV ──────────────────────────────────────────
function parseIBKRcsv(csvText) {
  const lines = csvText.split('\n').map(l => l.trim()).filter(Boolean)
  const trades = []

  // IBKR Flex Report o Activity Statement
  // Buscamos secciones "Trades" con cabecera: Symbol, Date/Time, Quantity, T. Price, Comm/Fee
  let inTrades = false
  let headers = []

  for (const line of lines) {
    const cols = line.split(',').map(c => c.replace(/"/g, '').trim())

    if (cols[0] === 'Trades' && cols[1] === 'Header') {
      headers = cols
      inTrades = true
      continue
    }
    if (cols[0] === 'Trades' && cols[1] === 'Data' && inTrades) {
      const get = (key) => {
        const idx = headers.indexOf(key)
        return idx >= 0 ? cols[idx] : null
      }
      const symbol   = get('Symbol')
      const datetime = get('Date/Time') || get('TradeDate')
      const qty      = parseFloat(get('Quantity') || '0')
      const price    = parseFloat(get('T. Price') || get('TradePrice') || '0')
      const comm     = Math.abs(parseFloat(get('Comm/Fee') || get('Commission') || '0'))
      const currency = get('Currency') || 'USD'
      const assetCat = get('Asset Category') || 'Stocks'

      if (!symbol || !qty || !price) continue

      const date = datetime ? datetime.split(' ')[0].split(',')[0] : null

      trades.push({
        symbol,
        entry_date: date,
        shares: Math.abs(qty),
        entry_price: price,
        entry_currency: currency,
        commission_buy: qty > 0 ? comm : 0,
        commission_sell: qty < 0 ? comm : 0,
        fill_type: qty > 0 ? 'buy' : 'sell',
        asset_type: assetCat.toLowerCase().includes('crypto') ? 'crypto'
          : assetCat.toLowerCase().includes('etf') ? 'etf' : 'stock',
        broker: 'ibkr',
        import_source: 'ibkr_csv',
      })
      continue
    }
    if (inTrades && cols[0] !== 'Trades') inTrades = false
  }
  return trades
}

// ── Parser Degiro CSV ────────────────────────────────────────
function parseDegiroCSV(csvText) {
  const lines = csvText.split('\n').map(l => l.trim()).filter(Boolean)
  if (!lines.length) return []
  const headers = lines[0].split(',').map(c => c.replace(/"/g, '').trim())
  const trades = []

  for (const line of lines.slice(1)) {
    const cols = line.split(',').map(c => c.replace(/"/g, '').trim())
    const get = (key) => {
      const idx = headers.findIndex(h => h.toLowerCase().includes(key.toLowerCase()))
      return idx >= 0 ? cols[idx] : null
    }
    const date     = get('fecha') || get('date')
    const symbol   = get('producto') || get('symbol') || get('isin')
    const qty      = parseFloat((get('número') || get('quantity') || '0').replace(',', '.'))
    const price    = parseFloat((get('precio') || get('price') || '0').replace(',', '.'))
    const currency = get('divisa') || get('currency') || 'EUR'
    const comm     = Math.abs(parseFloat((get('costes') || get('commission') || '0').replace(',', '.')))

    if (!symbol || !qty || !price) continue

    trades.push({
      symbol: symbol.toUpperCase(),
      entry_date: date,
      shares: Math.abs(qty),
      entry_price: price,
      entry_currency: currency,
      commission_buy: qty > 0 ? comm : 0,
      commission_sell: qty < 0 ? comm : 0,
      fill_type: qty > 0 ? 'buy' : 'sell',
      broker: 'degiro',
      import_source: 'degiro_csv',
    })
  }
  return trades
}


// ── Parser IBKR texto pegado (Activity Statement) ───────────
// Soporta: tabuladores, espacios múltiples, formato en inglés y español
// U17100954  ACLS  2026-02-17, 14:35:09  2026-02-18  -  BUY  12  95.6197  -1,147.44  -0.35
function parseIBKRtext(text) {
  const trades = []
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  let currency = 'USD'

  for (const line of lines) {
    // Detectar divisa de sección
    if (/^(USD|EUR|GBP|CHF|CAD|AUD|JPY)$/.test(line.trim())) {
      currency = line.trim(); continue
    }
    // Dividir por tabuladores o espacios múltiples (≥2)
    const cols = line.split(/\t|  +/).map(c => c.trim()).filter(Boolean)
    // Necesitamos al menos 8 columnas y que la primera sea cuenta IBKR (U + dígitos)
    if (cols.length < 8 || !/^U\d+$/.test(cols[0])) continue

    // cols: [cuenta, symbol, fecha+hora, fechaLiq, -, tipo, cantidad, precio, importe, comision, ...]
    const symbol   = cols[1]
    const dateStr  = cols[2]  // "2026-02-17, 14:35:09" o "2026-02-17"
    const typeCol  = cols[5]  // BUY / SELL / COMPRA / VENTA
    const qtyRaw   = cols[6]
    const priceRaw = cols[7]
    const commRaw  = cols[9] || cols[8] || '0'

    if (!symbol || !dateStr || !typeCol) continue
    if (!/BUY|SELL|COMPRA|VENTA/i.test(typeCol)) continue

    const date  = dateStr.split(/[,\s]/)[0]  // tomar solo YYYY-MM-DD
    const qty   = parseFloat(qtyRaw.replace(/[,\s]/g,''))
    const price = parseFloat(priceRaw.replace(/[,\s]/g,''))
    const comm  = Math.abs(parseFloat(commRaw.replace(/[,\s]/g,'')) || 0)

    if (!date || isNaN(qty) || isNaN(price) || !qty || !price) continue

    const isBuy = /BUY|COMPRA/i.test(typeCol)
    trades.push({
      symbol,
      entry_date: date,
      shares: Math.abs(qty),
      entry_price: price,
      entry_currency: currency,
      commission_buy:  isBuy ? comm : 0,
      commission_sell: isBuy ? 0 : comm,
      fill_type: isBuy ? 'buy' : 'sell',
      broker: 'ibkr',
      import_source: 'ibkr_text',
    })
  }
  return trades
}

// ── Parser IBKR detalle de orden (formato móvil/web) ────────
// Ej: "Sold 1 @ 732.095 on DARK" + "Filled" + "09/03/2026, 14:30" + "Fees: 0.35"
function parseIBKRorderDetail(text, useDDMM=true) {
  const trades = []
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

      // Buscar en líneas siguientes: fecha y fees
      for (let j = i + 1; j < Math.min(i + 15, lines.length); j++) {
        if (!date) {
          const dm = dateRe.exec(lines[j])
          if (dm) {
            const p1 = parseInt(dm[1]), p2 = parseInt(dm[2]), year = dm[3]
            // Si p1 > 12 => formato DD/MM/YYYY
            // p1>12 => claramente es día (DD/MM); p2>12 => claramente es mes (MM/DD)
            // Si ambiguo, usar la preferencia del usuario
            let day, month
            if (p1 > 12)       { day=p1; month=p2 }   // unambiguously DD/MM
            else if (p2 > 12)  { day=p2; month=p1 }   // unambiguously MM/DD
            else if (useDDMM)  { day=p1; month=p2 }   // user preference: DD/MM (Europa)
            else               { day=p2; month=p1 }   // user preference: MM/DD (USA)
            date = year + '-' + String(month).padStart(2,'0') + '-' + String(day).padStart(2,'0')
          }
        }
        const fm = /Fees?:\s*([\d.,]+)/i.exec(lines[j])
        if (fm) fees = parseFloat(fm[1].replace(',','.'))
        // Nueva acción => parar
        if (j > i && actionRe.test(lines[j])) break
      }
      // Buscar símbolo en líneas anteriores (ticker solo, ej "UI", "ACLS")
      for (let j = Math.max(0, i - 8); j < i; j++) {
        if (/^[A-Z]{1,6}$/.test(lines[j])) { symbol = lines[j] }
      }

      if (symbol && price && qty && date) {
        trades.push({
          symbol,
          entry_date: date,
          shares: qty,
          entry_price: price,
          entry_currency: 'USD',
          commission_buy:  isBuy ? fees : 0,
          commission_sell: isBuy ? 0 : fees,
          fill_type: isBuy ? 'buy' : 'sell',
          broker: 'ibkr',
          import_source: 'ibkr_order',
        })
      }
    }
    i++
  }
  return trades
}

// ── Auto-detect formato texto ────────────────────────────────
function autoParseText(text, useDDMM=true) {
  // 1. IBKR Activity Statement (tabla tabulada)
  if (/U\d{7,}\s+[A-Z]+\s+\d{4}-\d{2}-\d{2}/m.test(text) ||
      /Id\. de cuenta|Account ID/i.test(text)) {
    const result = parseIBKRtext(text)
    if (result.length > 0) return { trades: result, source: 'ibkr_text' }
  }
  // 2. IBKR detalle de orden móvil ("Sold 1 @ 732.095 on DARK")
  if (/^(Bought|Bot|Bght|Sold|Sld|Comprado|Vendido)\s+\d/im.test(text)) {
    const result = parseIBKRorderDetail(text, useDDMM)
    if (result.length > 0) return { trades: result, source: 'ibkr_order' }
  }
  return null
}

// ── Parser texto libre (Groq API) ───────────────────────────
async function parseWithAI(text, apiKey) {
  const GROQ_KEY = apiKey || process.env.GROQ_API_KEY
  if (!GROQ_KEY) throw new Error('API key de Groq no configurada. Ve a ⚙ Config → Integraciones y añade tu clave Groq.')

  const PROMPT = `Extrae las operaciones de trading del siguiente texto y devuelve SOLO un JSON array.
Cada operación debe tener estos campos (todos opcionales excepto symbol):
- symbol (string, ticker, en mayúsculas)
- fill_type ("buy" o "sell")
- entry_date (YYYY-MM-DD)
- shares (número positivo)
- entry_price (número)
- entry_currency ("USD", "EUR", "GBP"...)
- commission_buy (número, solo si fill_type=buy)
- commission_sell (número, solo si fill_type=sell)
- broker (si se menciona: "ibkr","degiro","binance","myinvestor")

Ignora líneas de totales, subtotales, cabeceras y resúmenes.
Si no hay operaciones claras, devuelve [].
Responde SOLO con el JSON array, sin texto adicional, sin markdown.

TEXTO:
${text.slice(0, 6000)}`

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${GROQ_KEY}`,
    },
    body: JSON.stringify({
      model: 'llama-3.1-8b-instant',
      max_tokens: 2000,
      temperature: 0,
      messages: [{ role: 'user', content: PROMPT }]
    })
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Groq API ${res.status}: ${err}`)
  }
  const data = await res.json()
  const raw = data.choices?.[0]?.message?.content || '[]'
  try {
    return JSON.parse(raw.replace(/```json|```/g, '').trim())
  } catch {
    return []
  }
}

// ── Calcular P&L de un trade ─────────────────────────────────
function calcPnL(trade) {
  const fxEntry = trade.fx_entry || 1
  const fxExit  = trade.fx_exit  || fxEntry
  const capital = trade.shares * trade.entry_price / fxEntry
  const commBuyEur  = (trade.commission_buy  || 0) / fxEntry
  const commSellEur = (trade.commission_sell || 0) / fxExit

  let pnlEur = null, pnlPct = null, pnlCur = null
  if (trade.status === 'closed' && trade.exit_price) {
    pnlCur = (trade.exit_price - trade.entry_price) * trade.shares
    pnlEur = pnlCur / fxExit - commBuyEur - commSellEur
    pnlPct = capital > 0 ? (pnlEur / capital) * 100 : null
  }
  return { capital_eur: capital, pnl_currency: pnlCur, pnl_eur: pnlEur, pnl_pct: pnlPct }
}

// ── Handler principal ────────────────────────────────────────
export default async function handler(req, res) {
  const { action } = req.query

  // ── GET /api/tradelog?action=list ──
  if (req.method === 'GET' && action === 'list') {
    try {
      const { broker, status, year, symbol } = req.query
      let path = '/trades_log?order=entry_date.desc,created_at.desc&limit=500'
      if (broker)  path += `&broker=eq.${broker}`
      if (status)  path += `&status=eq.${status}`
      if (symbol)  path += `&symbol=eq.${symbol.toUpperCase()}`
      if (year)    path += `&entry_date=gte.${year}-01-01&entry_date=lte.${year}-12-31`

      const trades = await sb(path)

      // Para operaciones abiertas: añadir precio actual
      const openTrades = trades.filter(t => t.status === 'open')
      if (openTrades.length) {
        const priceCache = {}
        await Promise.all(openTrades.map(async t => {
          if (!priceCache[t.symbol]) {
            const r = await getCurrentPrice(t.symbol).catch(() => null)
            priceCache[t.symbol] = r
          }
          const cur = priceCache[t.symbol]
          if (cur) {
            t._current_price = cur.price
            t._current_date  = cur.date
            const fxEntry = t.fx_entry || 1
            const fxNow = t.fx_entry || 1 // usamos fx_entry como aproximación flotante
            const capitalEur = t.shares * t.entry_price / fxEntry
            const pnlCur = (cur.price - t.entry_price) * t.shares
            t._pnl_float_eur = pnlCur / fxNow - (t.commission_buy || 0) / fxEntry
            t._pnl_float_pct = capitalEur > 0 ? (t._pnl_float_eur / capitalEur) * 100 : 0
          }
        }))
      }

      return res.status(200).json({ trades: trades || [] })
    } catch (e) {
      return res.status(500).json({ error: e.message })
    }
  }

  // ── GET /api/tradelog?action=fills&id=xxx ──
  if (req.method === 'GET' && action === 'fills') {
    try {
      const fills = await sb(`/trade_fills?trade_id=eq.${req.query.id}&order=date.asc`)
      return res.status(200).json({ fills: fills || [] })
    } catch (e) {
      return res.status(500).json({ error: e.message })
    }
  }

  // ── GET /api/tradelog?action=fx&date=2025-01-15&from=USD ──
  if (req.method === 'GET' && action === 'fx') {
    try {
      // Accept both ?from=USD and ?currency=USD
      const fromCur = req.query.from || req.query.currency || 'USD'
      const toCur   = req.query.to || 'EUR'
      // For today, frankfurter might not have data yet — try yesterday
      let dateStr = req.query.date || new Date().toISOString().slice(0,10)
      if (fromCur === toCur) return res.status(200).json({ fx: 1, rate: 1, date: dateStr, from: fromCur })
      let rate = await getFxRate(dateStr, fromCur, toCur)
      // If no rate for today (weekend/holiday), try last 3 days
      if (!rate) {
        for (let i=1; i<=3; i++) {
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

  if (req.method !== 'POST') return res.status(405).end()
  const body = req.body

  // ── POST save (crear o actualizar) ──
  if (action === 'save') {
    try {
      let trade = { ...body }

      // Auto-fetch FX si no viene manual
      if (trade.entry_date && trade.entry_currency && trade.entry_currency !== 'EUR') {
        if (!trade.fx_entry || !trade.fx_entry_manual) {
          const rate = await getFxRate(trade.entry_date, trade.entry_currency)
          if (rate) trade.fx_entry = rate
        }
      } else {
        trade.fx_entry = 1.0
      }
      if (trade.status === 'closed' && trade.exit_date && trade.exit_currency && trade.exit_currency !== 'EUR') {
        if (!trade.fx_exit || !trade.fx_exit_manual) {
          const rate = await getFxRate(trade.exit_date, trade.exit_currency)
          if (rate) trade.fx_exit = rate
        }
      }

      // Recalcular P&L
      const pnl = calcPnL(trade)
      trade = { ...trade, ...pnl }

      let saved
      if (trade.id) {
        saved = await sb(`/trades_log?id=eq.${trade.id}`, { method: 'PATCH', body: JSON.stringify(trade) })
      } else {
        saved = await sb('/trades_log', { method: 'POST', body: JSON.stringify(trade) })
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

  // ── POST close (cerrar operación abierta) ──
  if (action === 'close') {
    try {
      const { id, exit_date, exit_price, exit_currency, commission_sell, fx_exit_manual, fx_exit } = body

      let fxExit = fx_exit
      if (!fx_exit_manual) {
        const cur = exit_currency || 'USD'
        if (cur !== 'EUR') fxExit = await getFxRate(exit_date, cur) || fxExit
        else fxExit = 1.0
      }

      // Obtener trade actual para recalcular
      const existing = await sb(`/trades_log?id=eq.${id}&select=*`)
      if (!existing?.length) return res.status(404).json({ error: 'Trade no encontrado' })
      const trade = {
        ...existing[0],
        exit_date, exit_price: parseFloat(exit_price),
        exit_currency: exit_currency || existing[0].entry_currency,
        commission_sell: parseFloat(commission_sell || 0),
        fx_exit: fxExit,
        fx_exit_manual: !!fx_exit_manual,
        status: 'closed',
      }
      const pnl = calcPnL(trade)
      const updated = await sb(`/trades_log?id=eq.${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ ...trade, ...pnl }),
      })
      return res.status(200).json({ trade: Array.isArray(updated) ? updated[0] : updated })
    } catch (e) {
      return res.status(500).json({ error: e.message })
    }
  }

  // ── POST fill (añadir entrada parcial) ──
  if (action === 'fill') {
    try {
      const { trade_id, ...fill } = body
      // FX automático del fill
      if (fill.currency && fill.currency !== 'EUR' && fill.date) {
        fill.fx_rate = await getFxRate(fill.date, fill.currency) || null
      }
      await sb('/trade_fills', { method: 'POST', body: JSON.stringify({ ...fill, trade_id }) })
      // Marcar trade como multi-fill
      await sb(`/trades_log?id=eq.${trade_id}`, {
        method: 'PATCH', prefer: 'return=minimal',
        body: JSON.stringify({ has_fills: true }),
      })
      return res.status(200).json({ ok: true })
    } catch (e) {
      return res.status(500).json({ error: e.message })
    }
  }

  // ── POST parse (importar CSV o texto) ──
  if (action === 'parse') {
    try {
      const { text, format, apiKey, ibkrDateFormat } = body
      const useDDMM = ibkrDateFormat !== 'MM/DD'  // default DD/MM (Europa)
      let parsed = []

      if (format === 'ibkr_csv')      parsed = parseIBKRcsv(text)
      else if (format === 'degiro_csv') parsed = parseDegiroCSV(text)
      else if (format === 'ai') {
        // Intentar parseo local primero (sin AI)
        const local = autoParseText(text, useDDMM)
        if (local && local.trades.length > 0) {
          parsed = local.trades
        } else {
          // Fallback: Claude API (requiere apiKey)
          parsed = await parseWithAI(text, apiKey)
        }
      }
      else return res.status(400).json({ error: 'Formato no soportado: ibkr_csv | degiro_csv | ai' })

      // Enriquecer con FX automático
      for (const t of parsed) {
        if (t.entry_date && t.entry_currency && t.entry_currency !== 'EUR') {
          t.fx_entry = await getFxRate(t.entry_date, t.entry_currency) || null
        } else {
          t.fx_entry = 1.0
        }
        const pnl = calcPnL({ ...t, status: 'open' })
        t.capital_eur = pnl.capital_eur
      }

      return res.status(200).json({ parsed, count: parsed.length })
    } catch (e) {
      return res.status(500).json({ error: e.message })
    }
  }

  return res.status(400).json({ error: 'Acción no reconocida' })
}
