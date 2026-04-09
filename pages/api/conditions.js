// pages/api/conditions.js
// CRUD para la tabla `conditions` (condiciones globales reutilizables)
// GET    → lista todas las condiciones activas
// POST   → crear nueva condición
// PATCH  → actualizar condición (id en query)
// DELETE → eliminar condición (id en query)
// POST ?action=groq → pide a Groq que traduzca lenguaje natural → JSON de condición

// Supabase credentials: env vars take priority, client headers as fallback
// JWT from x-supa-jwt header takes precedence over anon key for Authorization
function getSupaCreds(req) {
  const url = process.env.SUPABASE_URL || req?.headers?.['x-supa-url'] || ''
  const key = process.env.SUPABASE_ANON_KEY || req?.headers?.['x-supa-key'] || ''
  const jwt = req?.headers?.['x-supa-jwt'] || null
  const h = { 'Content-Type':'application/json', apikey: key, Authorization:`Bearer ${jwt || key}` }
  return { url, key, h }
}

const GROQ_SYSTEM = `Eres un asistente especializado en análisis técnico de trading.
Tu tarea es convertir una descripción en lenguaje natural de una condición de mercado
en un objeto JSON estructurado.

TIPOS DISPONIBLES y sus params:
- ema_cross_up:    { ma_fast: int, ma_slow: int }         — EMA rápida cruza por encima de EMA lenta
- ema_cross_down:  { ma_fast: int, ma_slow: int }         — EMA rápida cruza por debajo de EMA lenta
- price_above_ma:  { ma_period: int, ma_type?: "EMA"|"SMA" }  — Precio > media móvil
- price_below_ma:  { ma_period: int, ma_type?: "EMA"|"SMA" }  — Precio < media móvil
- rsi_above:       { period: int, level: int }            — RSI por encima de nivel (ej. 50)
- rsi_below:       { period: int, level: int }            — RSI por debajo de nivel (ej. 30)
- rsi_cross_up:    { period: int, level: int }            — RSI cruza hacia arriba nivel
- rsi_cross_down:  { period: int, level: int }            — RSI cruza hacia abajo nivel
- macd_cross_up:   { fast: int, slow: int, signal: int }  — MACD cruza por encima de señal
- macd_cross_down: { fast: int, slow: int, signal: int }  — MACD cruza por debajo de señal

REGLAS:
- Responde ÚNICAMENTE con JSON válido. Sin texto adicional, sin markdown, sin backticks.
- El JSON debe tener exactamente: { "name", "description", "type", "params" }
- name: nombre corto en español (máx 40 chars)
- description: explicación técnica en español (1-2 frases, máx 120 chars)
- Si el usuario no especifica parámetros, usa los valores por defecto más comunes.
- Si la descripción no corresponde a ningún tipo disponible, devuelve { "error": "No puedo modelar esta condición con los tipos disponibles." }`

// ── System prompts por role para groq_block ──────────────────────────
const GROQ_BLOCK_BASE = `Eres un asistente que convierte descripciones de condiciones de trading al siguiente JSON. Responde ÚNICAMENTE con JSON válido sin explicaciones ni markdown.`

const GROQ_BLOCK_COND_SCHEMA = `${GROQ_BLOCK_BASE}
Esquema válido: { "type": string, "ma_fast"?: number, "ma_slow"?: number, "ma_period"?: number, "ma_type"?: "EMA"|"SMA", "period"?: number, "level"?: number, "fast"?: number, "slow"?: number, "signal"?: number }
Valores de type: ema_cross_up, ema_cross_down, price_above_ma, price_below_ma, close_above_ma, close_below_ma, rsi_cross_up, rsi_cross_down, rsi_above, rsi_below, macd_cross_up, macd_cross_down
IMPORTANTE para RSI: solo existe UN parámetro 'level' (número entre 1-99). No existe 'signal', 'level2', ni ningún otro parámetro de nivel. Si la descripción menciona dos niveles, usa el nivel de entrada como 'level' e ignora el segundo. Nunca incluyas campos con valor null.`

const GROQ_BLOCK_SYSTEMS = {
  filter:  `${GROQ_BLOCK_BASE}\nEsquema válido: { "type": string, "sp500EmaR"?: number, "sp500EmaL"?: number }\nValores de type: precio_ema, ema_ema, none`,
  setup:   GROQ_BLOCK_COND_SCHEMA,
  trigger: GROQ_BLOCK_COND_SCHEMA,
  abort:   GROQ_BLOCK_COND_SCHEMA,
  exit:    GROQ_BLOCK_COND_SCHEMA,
  stop:    `${GROQ_BLOCK_BASE}\nEsquema válido: { "type": string, "ma_period"?: number, "atr_period"?: number, "atr_mult"?: number, "pct"?: number }\nValores de type: tecnico, atr_based, fixed_pct, trailing_atr, none`,
}

const GROQ_STRATEGY_SYSTEM = `Eres un asistente que convierte descripciones de estrategias de trading al siguiente esquema JSON. Responde ÚNICAMENTE con JSON válido, sin explicaciones, sin markdown, sin backticks.

Esquema obligatorio:
{
  "filter": { "type": null },
  "setup": {
    "indicator": null,
    "condition": null,
    "params": {}
  },
  "trigger": {
    "indicator": null,
    "condition": null,
    "params": {}
  },
  "abort": { "type": null },
  "exit": {
    "type": null,
    "params": {}
  },
  "stop": {
    "type": null,
    "params": {}
  },
  "mgmt": {
    "trailing": false,
    "reentry": false
  }
}

IMPORTANTE: cuando un campo no aplica, usa null (el valor JSON), NUNCA el string "null".
Indicadores válidos para setup/trigger: EMA, SMA, RSI, MACD.
Valores válidos para condition en EMA/SMA: 'crosses_above', 'crosses_below', 'price_above', 'price_below'.
Para RSI: 'below', 'above', 'crosses_above', 'crosses_below'.
Para MACD: 'crosses_signal_up', 'crosses_signal_down'.
Valores válidos para stop.type: fixed_pct, trailing_pct, below_ma_at_signal.
Params para EMA/SMA cruce: { fast: number, slow: number }.
Params para EMA/SMA precio: { slow: number } — usa el número de periodos mencionado exactamente.
Params para RSI: { period: number, level: number }.
Params para MACD: { fast: number, slow: number, signal: number }.

Ejemplos de periodos:
- 'precio cruza EMA 10' → params: { slow: 10 }
- 'precio sobre media 20 periodos' → params: { slow: 20 }
- 'EMA rápida 10, lenta 20' → params: { fast: 10, slow: 20 }
Siempre leer el número de periodos exacto de la descripción del usuario.

Si algo no se menciona, usa null.`

// ── Transform new schema → flat frontend schema ───────────────────────
function transformGroqStrategy(parsed) {
  const result = {}

  // Helper: convert { indicator, condition, params } → flat condition block
  function toCondBlock(block) {
    if (!block || !block.indicator || block.indicator === 'null') return null
    const ind  = String(block.indicator).toUpperCase()
    const cond = block.condition || ''
    const p    = block.params || {}

    if (ind === 'EMA' || ind === 'SMA') {
      const maType = ind === 'SMA' ? 'SMA' : 'EMA'
      if (cond === 'crosses_above') return { type: 'ema_cross_up',    ma_fast: p.fast ?? 10, ma_slow: p.slow ?? 20 }
      if (cond === 'crosses_below') return { type: 'ema_cross_down',  ma_fast: p.fast ?? 10, ma_slow: p.slow ?? 20 }
      if (cond === 'price_above')   return { type: 'price_above_ma',  ma_period: p.slow ?? p.fast ?? 50, ma_type: maType }
      if (cond === 'price_below')   return { type: 'price_below_ma',  ma_period: p.slow ?? p.fast ?? 50, ma_type: maType }
    }
    if (ind === 'RSI') {
      if (cond === 'below')         return { type: 'rsi_below',      period: p.period ?? 14, level: p.level ?? 30 }
      if (cond === 'above')         return { type: 'rsi_above',      period: p.period ?? 14, level: p.level ?? 70 }
      if (cond === 'crosses_above') return { type: 'rsi_cross_up',   period: p.period ?? 14, level: p.level ?? 30 }
      if (cond === 'crosses_below') return { type: 'rsi_cross_down', period: p.period ?? 14, level: p.level ?? 70 }
    }
    if (ind === 'MACD') {
      if (cond === 'crosses_signal_up')   return { type: 'macd_cross_up',   fast: p.fast ?? 12, slow: p.slow ?? 26, signal: p.signal ?? 9 }
      if (cond === 'crosses_signal_down') return { type: 'macd_cross_down', fast: p.fast ?? 12, slow: p.slow ?? 26, signal: p.signal ?? 9 }
    }
    return null
  }

  // Helper: rechaza el string literal "null" que la IA devuelve cuando no aplica
  const notNull = v => v && v !== 'null'

  // filter: { type: string | null } → flat block (type string maps directly to CREV)
  result.filter  = notNull(parsed.filter?.type)  ? { type: parsed.filter.type }  : null

  // setup / trigger: full indicator+condition+params → flat
  result.setup   = toCondBlock(parsed.setup)
  result.trigger = toCondBlock(parsed.trigger)

  // abort: { type: string | null }
  result.abort = notNull(parsed.abort?.type) ? { type: parsed.abort.type } : null

  // exit: { type: string | null, params: {...} }
  result.exit = notNull(parsed.exit?.type)
    ? { type: parsed.exit.type, ...(parsed.exit.params || {}) }
    : null

  // stop → stop_loss
  const st = parsed.stop
  if (st?.type === 'below_ma_at_signal') {
    result.stop_loss = { type: 'tecnico',   ma_period:  st.params?.period ?? st.params?.ma_period ?? 20 }
  } else if (st?.type === 'trailing_pct') {
    result.stop_loss = { type: 'atr_based', atr_period: st.params?.period ?? 14, atr_mult: st.params?.mult ?? 1.5 }
  } else if (st?.type === 'fixed_pct') {
    result.stop_loss = { type: 'tecnico',   ma_period:  st.params?.period ?? 20 }
  } else {
    result.stop_loss = null
  }

  // mgmt → management  (trailing → sin_perdidas)
  result.management = {
    sin_perdidas: !!(parsed.mgmt?.trailing),
    reentry:      !!(parsed.mgmt?.reentry),
  }

  return result
}

export default async function handler(req, res) {
  // ── POST ?action=groq_block — genera un bloque JSON para una sección ──
  if (req.method === 'POST' && req.query.action === 'groq_block') {
    const { text, role } = req.body
    if (!text?.trim() || !role) return res.status(400).json({ error: 'text y role requeridos' })
    const apiKey = process.env.GROQ_API_KEY || req.headers['x-groq-key'] || ''
    if (!apiKey) return res.status(400).json({ error: 'No hay Groq API Key configurada. Añádela en ⚙ Configuración → Integraciones.' })
    const system = GROQ_BLOCK_SYSTEMS[role] || GROQ_BLOCK_COND_SCHEMA
    try {
      const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: 'llama-3.1-8b-instant',
          max_tokens: 200,
          temperature: 0.1,
          messages: [
            { role: 'system', content: system },
            { role: 'user',   content: text.trim() },
          ]
        })
      })
      if (!groqRes.ok) return res.status(502).json({ error: `Groq error: ${await groqRes.text()}` })
      const data  = await groqRes.json()
      const raw   = data.choices?.[0]?.message?.content || ''
      const clean = raw.replace(/```json|```/g, '').trim()
      const parsed = JSON.parse(clean)
      if (parsed.error) return res.status(422).json({ error: parsed.error })
      return res.status(200).json(parsed)
    } catch(e) {
      return res.status(500).json({ error: `Error parseando respuesta de Groq: ${e.message}` })
    }
  }

  // ── POST ?action=groq_strategy ──
  if (req.method === 'POST' && req.query.action === 'groq_strategy') {
    const { text } = req.body
    if (!text?.trim()) return res.status(400).json({ error: 'text requerido' })
    const apiKey = process.env.GROQ_API_KEY || req.headers['x-groq-key'] || ''
    if (!apiKey) return res.status(400).json({ error: 'No hay Groq API Key configurada. Añádela en ⚙ Configuración → Integraciones.' })
    try {
      const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${apiKey}` },
        body: JSON.stringify({
          model: 'llama-3.1-8b-instant',
          max_tokens: 600,
          temperature: 0.1,
          messages: [
            { role: 'system', content: GROQ_STRATEGY_SYSTEM },
            { role: 'user',   content: text.trim() }
          ]
        })
      })
      if (!groqRes.ok) return res.status(502).json({ error: `Groq error: ${await groqRes.text()}` })
      const data   = await groqRes.json()
      const raw    = data.choices?.[0]?.message?.content || ''
      const clean  = raw.replace(/```json|```/g, '').trim()
      const parsed = JSON.parse(clean)
      return res.status(200).json(transformGroqStrategy(parsed))
    } catch(e) {
      return res.status(500).json({ error: `Error parseando respuesta de Groq: ${e.message}` })
    }
  }

  // ── POST ?action=groq — NO necesita Supabase, va primero ──
  if (req.method === 'POST' && req.query.action === 'groq') {
    const { text } = req.body
    if (!text?.trim()) return res.status(400).json({ error: 'text requerido' })
    const apiKey = process.env.GROQ_API_KEY || req.headers['x-groq-key'] || ''
    if (!apiKey) return res.status(400).json({ error: 'No hay Groq API Key configurada. Añádela en ⚙ Configuración → Integraciones.' })
    try {
      const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${apiKey}` },
        body: JSON.stringify({
          model: 'llama-3.1-8b-instant',
          max_tokens: 300,
          temperature: 0.1,
          messages: [
            { role: 'system', content: GROQ_SYSTEM },
            { role: 'user',   content: text.trim() }
          ]
        })
      })
      if (!groqRes.ok) return res.status(502).json({ error: `Groq error: ${await groqRes.text()}` })
      const data  = await groqRes.json()
      const raw   = data.choices?.[0]?.message?.content || ''
      const clean = raw.replace(/```json|```/g, '').trim()
      const parsed = JSON.parse(clean)
      return res.status(200).json(parsed)
    } catch (e) {
      return res.status(500).json({ error: `Error parseando respuesta de Groq: ${e.message}` })
    }
  }

  // Supabase requerido para el resto de operaciones
  const { url: SUPA_URL, key: SUPA_KEY, h: H } = getSupaCreds(req)
  if (!SUPA_URL || !SUPA_KEY) return res.status(500).json({ error: 'Supabase no configurado' })

  // ── GET — listar condiciones ──
  if (req.method === 'GET') {
    const r = await fetch(`${SUPA_URL}/rest/v1/conditions?order=created_at.asc`, { headers: H })
    if (!r.ok) {
      // If table doesn't exist yet, return empty array gracefully
      return res.status(200).json([])
    }
    return res.status(200).json(await r.json())
  }

  // ── DELETE ──
  if (req.method === 'DELETE') {
    const { id } = req.query
    if (!id) return res.status(400).json({ error: 'id requerido' })
    const r = await fetch(`${SUPA_URL}/rest/v1/conditions?id=eq.${id}`, { method:'DELETE', headers: H })
    if (!r.ok) return res.status(500).json({ error: 'Error eliminando' })
    return res.status(200).json({ ok: true })
  }

  // ── PATCH — actualizar condición (id en query) ──
  if (req.method === 'PATCH') {
    const { id } = req.query
    if (!id) return res.status(400).json({ error: 'id requerido' })
    const updates = {}
    const allowed = ['name','description','type','params','source','role','active']
    allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k] })
    const r = await fetch(`${SUPA_URL}/rest/v1/conditions?id=eq.${id}`, {
      method: 'PATCH',
      headers: { ...H, 'Prefer':'return=representation' },
      body: JSON.stringify(updates),
    })
    if (!r.ok) return res.status(500).json({ error: 'Error actualizando' })
    const rows = await r.json()
    return res.status(200).json(Array.isArray(rows) ? rows[0] : rows)
  }

  if (req.method !== 'POST') return res.status(405).end()

  // ── POST — crear condición ──
  const { name, description, type, params, source, role } = req.body
  if (!name || !type || !params) return res.status(400).json({ error: 'name, type y params son requeridos' })
  const r = await fetch(`${SUPA_URL}/rest/v1/conditions`, {
    method: 'POST',
    headers: { ...H, 'Prefer':'return=representation' },
    body: JSON.stringify({ name, description: description||'', type, params, source: source||'manual', role: role||null, active: true })
  })
  if (!r.ok) {
    let detail = ''
    try { const e = await r.json(); detail = e?.message || e?.hint || JSON.stringify(e) } catch(_) {}
    // Common case: table doesn't exist yet
    if (detail.includes('relation') && detail.includes('does not exist')) {
      return res.status(500).json({ error: 'La tabla "conditions" no existe. Ejecuta supabase_conditions_migration.sql en el SQL Editor de Supabase.' })
    }
    return res.status(500).json({ error: `Error guardando condición: ${detail || r.status}` })
  }
  const rows = await r.json()
  return res.status(201).json(Array.isArray(rows) ? rows[0] : rows)
}
