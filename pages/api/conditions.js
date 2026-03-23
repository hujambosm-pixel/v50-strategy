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

const GROQ_STRATEGY_SYSTEM = `Eres un experto en análisis técnico de trading. Convierte una descripción en lenguaje natural en una configuración JSON de estrategia con 7 bloques.

TIPOS DE CONDICIÓN (únicos disponibles) y sus params:
- ema_cross_up / ema_cross_down:   { ma_fast: int, ma_slow: int }
- price_above_ma / price_below_ma: { ma_period: int, ma_type?: "EMA"|"SMA" }
- close_above_ma / close_below_ma: { ma_period: int, ma_type?: "EMA"|"SMA" }
- rsi_above / rsi_below / rsi_cross_up / rsi_cross_down: { period: int, level: int }
- macd_cross_up / macd_cross_down: { fast: int, slow: int, signal: int }

TIPOS DE STOP:
- { "type": "tecnico", "ma_period": int }
- { "type": "atr_based", "atr_period": int, "atr_mult": float }
- null

REGLAS:
- Responde ÚNICAMENTE con JSON válido. Sin texto adicional, sin markdown.
- Estructura exacta: { "filter", "setup", "trigger", "abort", "stop_loss", "exit", "management" }
- Bloques no aplicables → null. management nunca es null.
- Cada bloque de condición: { "type": "tipo", ...params }
- management: { "sin_perdidas": bool, "reentry": bool }
- Si faltan parámetros usa los valores más comunes.`

export default async function handler(req, res) {
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
      return res.status(200).json(parsed)
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
