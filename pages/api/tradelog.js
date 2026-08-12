// pages/api/tradelog.js
// TradeLog API — CRUD fills individuales + FX histórico + parsers importación
// V5.29: arquitectura fill-first (una fila = un fill BUY o SELL)
// Columnas trades_log: id, symbol, fill_type, date, price, shares, commission,
//                      currency, fx, broker, strategy, notes, import_source, created_at

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://uqjngxxbdlquiuhywiuc.supabase.co'
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_st9QJ3zcQbY5ec-JhxwqXQ_joy3udz3'

// JWT inyectado por el cliente en cada request (set en handler, leído por sb())
let _reqJwt = null

const ALLOWED_COLS = new Set([
  'id','symbol','fill_type','date','price','shares',
  'commission','currency','fx','broker','strategy','notes','import_source',
])

async function sb(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${_reqJwt || SUPABASE_KEY}`,
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

// Auto-detect CSV broker by headers and dispatch to the right parser
function autoDetectCSV(csvText) {
  // IBKR: characteristic "Trades,Header" or "Statement,Header" sections
  if (/Trades[,"]/.test(csvText) && /Header/.test(csvText)) return parseIBKRcsv(csvText)
  // Degiro: first line contains typical Spanish/English Degiro headers
  const firstLine = csvText.split('\n')[0].toLowerCase()
  if (firstLine.includes('producto') || firstLine.includes('product') ||
      firstLine.includes('datum') || firstLine.includes('fecha')) return parseDegiroCSV(csvText)
  // Fallback: try each parser and return whichever gets results
  const ibkr = parseIBKRcsv(csvText)
  if (ibkr.length) return ibkr
  const degiro = parseDegiroCSV(csvText)
  if (degiro.length) return degiro
  return []
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
  // Cantidad: con grupos de millares (1,500 · 1,234,567 · 7,742.8) o sin ellos (11 · 425.6995).
  // La alternativa de millares va PRIMERO para que consuma la cantidad entera; antes el grupo era
  // (\d+(?:[.,]\d+)?), que solo admitía UN separador: ante "7,742.8" capturaba "7,742" y luego
  // exigía espacio donde encontraba ".", de modo que la línea no casaba y la operación se perdía
  // en silencio. Se conservan el ancla ^, el verbo obligatorio y el @, que son lo que impide que
  // casen líneas que no son operaciones (detalle de cuenta, importes, "Filled", fechas…).
  const actionRe = /^(Bought|Bot|Bght|Sold|Sld|Comprado|Vendido)\s+(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)\s+@\s+([\d.,]+)/i
  const dateRe = /^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})/
  // Venues/ECN a excluir como símbolo (el ticker nunca es uno de estos)
  const VENUES = new Set(['DARK','IDEALPRO','IBKRATS','ISLAND','ARCA','NYSE','NASDAQ','BATS','EDGX','LSE','AMEX','OVERNIGHT','PSX','MEMX','IEX'])
  // Venues de DIVISA: si el bloque se ejecutó en uno de estos, es una conversión de moneda y no
  // una operación de acciones. Lista PROPIA, separada de VENUES a propósito: VENUES sirve para lo
  // contrario (que un venue no se confunda con un ticker) e IDEALPRO debe seguir en ambas.
  // FXCONV es el que usa IBKR para las conversiones automáticas de divisa.
  const FX_VENUES = new Set(['IDEALPRO','IDEALFX','FXCONV'])
  // Códigos ISO de divisa habituales en IBKR. Solo intervienen en la forma SIN separador (EURUSD),
  // donde un ticker de 6 letras podría confundirse con un par; con separador la forma ya es
  // inequívoca. Exigirlos evita clasificar como divisa un ticker legítimo.
  const ISO_CCY = new Set(['USD','EUR','GBP','CHF','JPY','CAD','AUD','NZD','SEK','NOK','DKK',
    'HKD','SGD','MXN','PLN','CZK','HUF','ILS','TRY','ZAR','CNH','CNY','KRW','INR','BRL','RUB'])
  // Par de divisas en cualquiera de sus formas: EUR.USD | EUR/USD | EUR-USD | EURUSD, con
  // mayúsculas o minúsculas. Exactamente 3 letras por lado.
  const esParDivisa = (s) => {
    const u = String(s || '').toUpperCase()
    if (/^[A-Z]{3}[./-][A-Z]{3}$/.test(u)) return true
    const n = /^([A-Z]{3})([A-Z]{3})$/.exec(u)
    return !!(n && ISO_CCY.has(n[1]) && ISO_CCY.has(n[2]))
  }
  let i = 0
  while (i < lines.length) {
    const m = actionRe.exec(lines[i])
    if (m) {
      // La COMA es separador de MILLARES y se elimina; el PUNTO es el decimal. Es lo que emite
      // IBKR en este panel y la convención que ya usan parseIBKRtext y parseIBKRtabSpanish.
      // Antes era `.replace(',','.')`: tomaba la coma por decimal y además solo sustituía la
      // PRIMERA ocurrencia, así que "1,500" acciones entraban como 1,5 y un precio de "1,234.56"
      // como 1,234 — sin aviso, directo a trades_log.
      const qty   = parseFloat(m[2].replace(/,/g,''))
      const price = parseFloat(m[3].replace(/,/g,''))
      const isBuy = /Bought|Bot|Bght|Comprado/i.test(m[1])

      // A) VENUE: capturado de la propia línea de acción (… on VENUE), sin tocar m1/m2/m3.
      //    Ya NO se ancla al final de línea: si IBKR añadiera texto detrás, el venue quedaba a
      //    null y un bloque de divisa perdía su señal principal. Se recorre y se toma la ÚLTIMA
      //    aparición de "on X"; la clase de caracteres excluye dígitos, así que una fecha u hora
      //    posterior no puede capturarse por error.
      let venue = null
      const vRe = /\bon\s+([A-Za-z.]{2,15})/g
      for (let vm; (vm = vRe.exec(lines[i])) !== null; ) venue = vm[1].toUpperCase()
      const fxVenue = venue ? FX_VENUES.has(venue) : false

      // B) SÍMBOLO robusto: línea inmediatamente anterior a la acción (A−1)
      const cand = (lines[i-1] || '').trim()
      const symFX = esParDivisa(cand)
      let symbol = (/^[A-Z]{1,6}$/.test(cand) && !VENUES.has(cand)) ? cand : null
      let symHeredado = false   // true si el símbolo NO vino de A−1 sino del rastreo hacia arriba
      // Fallback conservador: subir i-2..i-4 buscando un ticker válido (nunca un venue).
      // CERRADO ante cualquier señal de divisa (par en A−1 o venue de divisa): sin este guard,
      // una conversión de moneda sin su par en A−1 heredaba el ticker del bloque ANTERIOR y se
      // emitía como operación de acciones de ese símbolo.
      if (!symbol && !symFX && !fxVenue) {
        for (let j = i - 2; j >= Math.max(0, i - 4); j--) {
          const c = (lines[j] || '').trim()
          if (/^[A-Z]{1,6}$/.test(c) && !VENUES.has(c)) { symbol = c; symHeredado = true; break }
        }
      }

      // Fecha + fees: bucle hacia abajo (i+1..i+15, break en otra acción)
      // Ambos toman el PRIMER valor encontrado y no se vuelven a escribir: la ventana puede
      // alcanzar el bloque de la operación siguiente (p.ej. la conversión EUR.USD que IBKR
      // intercala entre dos fills), cuyo "Fees:" machacaba la comisión ya leída.
      // feesFound es un flag explícito, no `fees === 0`: 0.0 es una comisión legítima.
      let date = null, fees = 0, feesFound = false
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
        if (!feesFound) {
          const fm = /Fees?:\s*([\d.,]+)/i.exec(lines[j])
          // Misma convención que qty/price: coma = millares, global.
          if (fm) { fees = parseFloat(fm[1].replace(/,/g,'')); feesFound = true }
        }
        if (j > i && actionRe.test(lines[j])) break
      }

      // C) DESCARTE FX: par de divisas (en A−1 o en el propio símbolo) o venue de divisa → no emitir
      const isFX = symFX || fxVenue || esParDivisa(symbol)

      // D) FECHA hoy si falta (solo hora) para operaciones válidas no-FX.
      //    Anclada a Europe/Madrid ('en-CA' → 'YYYY-MM-DD') para que "hoy" sea el día
      //    real del usuario, no el UTC (que de madrugada daría el día anterior).
      if (!date && symbol && price && qty && !isFX) {
        const hoyMadrid = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })
        date = /^\d{4}-\d{2}-\d{2}$/.test(hoyMadrid) ? hoyMadrid : new Date().toISOString().slice(0,10)
      }

      // E) DEFENSA FINAL: un símbolo HEREDADO del bloque anterior nunca se emite si algo apunta a
      //    divisa. Con el fallback ya cerrado en B esto es redundante por construcción; se deja
      //    como invariante explícito para que la protección no se pierda si alguien reabre aquel
      //    guard sin reparar en esta consecuencia.
      const heredadoSospechoso = symHeredado && (symFX || fxVenue)

      // PUSH: mismos campos que antes; date ya nunca null para válidas no-FX
      if (!isFX && !heredadoSospechoso && symbol && price && qty && date) {
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
  _reqJwt = req.headers['x-supa-jwt'] || null
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

      if (format === 'csv')             parsed = autoDetectCSV(text)
      else if (format === 'ibkr_csv')   parsed = parseIBKRcsv(text)   // legacy compat
      else if (format === 'degiro_csv') parsed = parseDegiroCSV(text)  // legacy compat
      else if (format === 'ai') {
        const local = autoParseText(text, useDDMM)
        if (local && local.fills.length > 0) {
          parsed = local.fills
        } else {
          parsed = await parseWithAI(text, apiKey)
        }
      }
      else return res.status(400).json({ error: 'Formato no soportado: csv | ai' })

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
