// pages/api/risk.js — CRUD risk_profiles
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://uqjngxxbdlquiuhywiuc.supabase.co'
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_st9QJ3zcQbY5ec-JhxwqXQ_joy3udz3'

let _reqJwt = null

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

export default async function handler(req, res) {
  _reqJwt = req.headers['x-supa-jwt'] || null
  const { action, id } = req.query

  try {
    // ── GET: listar perfiles ──
    if (req.method === 'GET' && !action) {
      const data = await sb('/risk_profiles?order=created_at.asc')
      return res.json(Array.isArray(data) ? data : [])
    }

    // ── POST action=create ──
    if (req.method === 'POST' && action === 'create') {
      const { name, risk_per_trade_type, risk_per_trade_value, max_total_risk, max_simultaneous_positions } = req.body
      if (!name?.trim()) return res.status(400).json({ error: 'name requerido' })
      const data = await sb('/risk_profiles', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          risk_per_trade_type: risk_per_trade_type || '%',
          risk_per_trade_value: Number(risk_per_trade_value) || 1,
          max_total_risk: Number(max_total_risk) || 5,
          max_simultaneous_positions: Number(max_simultaneous_positions) || 5,
        }),
      })
      return res.json(Array.isArray(data) ? data[0] : data)
    }

    // ── PATCH action=update&id=... ──
    if (req.method === 'POST' && action === 'update') {
      if (!id) return res.status(400).json({ error: 'id requerido' })
      const { name, risk_per_trade_type, risk_per_trade_value, max_total_risk, max_simultaneous_positions } = req.body
      const updates = {}
      if (name !== undefined) updates.name = name.trim()
      if (risk_per_trade_type !== undefined) updates.risk_per_trade_type = risk_per_trade_type
      if (risk_per_trade_value !== undefined) updates.risk_per_trade_value = Number(risk_per_trade_value)
      if (max_total_risk !== undefined) updates.max_total_risk = Number(max_total_risk)
      if (max_simultaneous_positions !== undefined) updates.max_simultaneous_positions = Number(max_simultaneous_positions)
      await sb(`/risk_profiles?id=eq.${id}`, {
        method: 'PATCH',
        prefer: 'return=minimal',
        body: JSON.stringify(updates),
      })
      return res.json({ ok: true })
    }

    // ── POST action=delete&id=... ──
    if (req.method === 'POST' && action === 'delete') {
      if (!id) return res.status(400).json({ error: 'id requerido' })
      await sb(`/risk_profiles?id=eq.${id}`, { method: 'DELETE', prefer: 'return=minimal' })
      return res.json({ ok: true })
    }

    return res.status(405).json({ error: 'Método no permitido' })
  } catch (e) {
    console.error('[risk]', e.message)
    return res.status(500).json({ error: e.message })
  }
}
