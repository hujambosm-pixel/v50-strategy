// pages/api/risk.js — CRUD risk_profiles
import { exigeAuth } from '../../lib/verificaJwt'

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://uqjngxxbdlquiuhywiuc.supabase.co'
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_st9QJ3zcQbY5ec-JhxwqXQ_joy3udz3'

// EL TOKEN VA POR PETICIÓN, NO POR MÓDULO.
// Antes esto era un `let _reqJwt` de módulo: el handler lo asignaba al entrar y sb() lo leía
// después de varios await. En un contenedor caliente de Vercel dos peticiones concurrentes comparten
// el módulo, así que la segunda pisaba el token de la primera y las consultas de una salían firmadas
// con el JWT de la otra. Con RLS activado eso no es un fallo que la base de datos pueda atrapar: el
// token es válido, solo que de otra persona.
//
// Ahora el token entra por argumento y el handler se queda un alias atado al suyo, que vive en su
// propio ámbito y nadie puede pisar. Los puntos de llamada no cambian.
async function sbCon(jwt, path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${jwt}`,
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
  const jwt = req.headers['x-supa-jwt'] || null
  const sb = (path, opts) => sbCon(jwt, path, opts)
  // AUTENTICACIÓN OBLIGATORIA. Sin JWT válido no se sirve nada: 401 antes de tocar Supabase o
  // cualquier proveedor. Incluye las acciones que no hablan con la base de datos, a propósito.
  // La única excepción es que el verificador no haya podido comprobar el token (JWKS caído): ahí
  // exigeAuth deja pasar con el token del cliente y lo registra. Ver lib/verificaJwt.js.
  const auth = await exigeAuth('risk', req, req.query?.action)
  if (!auth.ok) return res.status(401).json({ error: 'no autenticado' })

  const { action, id } = req.query

  try {
    // ── GET: listar perfiles ──
    if (req.method === 'GET' && !action) {
      const data = await sb('/risk_profiles?order=created_at.asc')
      return res.json(Array.isArray(data) ? data : [])
    }

    // ── POST action=create ──
    if (req.method === 'POST' && action === 'create') {
      const { name, risk_per_trade_type, risk_per_trade_value, max_total_risk, max_simultaneous_positions, active_riesgo_op, active_capital_op, active_slots } = req.body
      if (!name?.trim()) return res.status(400).json({ error: 'name requerido' })
      const data = await sb('/risk_profiles', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          risk_per_trade_type: risk_per_trade_type || '%',
          risk_per_trade_value: risk_per_trade_value != null ? Number(risk_per_trade_value) : 1,
          max_total_risk: max_total_risk != null ? Number(max_total_risk) : null,
          max_simultaneous_positions: max_simultaneous_positions != null ? Number(max_simultaneous_positions) : null,
          active_riesgo_op: active_riesgo_op !== undefined ? Boolean(active_riesgo_op) : true,
          active_capital_op: active_capital_op !== undefined ? Boolean(active_capital_op) : false,
          active_slots: active_slots !== undefined ? Boolean(active_slots) : false,
        }),
      })
      return res.json(Array.isArray(data) ? data[0] : data)
    }

    // ── PATCH action=update&id=... ──
    if (req.method === 'POST' && action === 'update') {
      if (!id) return res.status(400).json({ error: 'id requerido' })
      const { name, risk_per_trade_type, risk_per_trade_value, max_total_risk, max_simultaneous_positions, active_riesgo_op, active_capital_op, active_slots } = req.body
      const updates = {}
      if (name !== undefined) updates.name = name.trim()
      if (risk_per_trade_type !== undefined) updates.risk_per_trade_type = risk_per_trade_type
      if (risk_per_trade_value !== undefined) updates.risk_per_trade_value = risk_per_trade_value===null?null:Number(risk_per_trade_value)
      if (max_total_risk !== undefined) updates.max_total_risk = max_total_risk===null?null:Number(max_total_risk)
      if (max_simultaneous_positions !== undefined) updates.max_simultaneous_positions = max_simultaneous_positions===null?null:Number(max_simultaneous_positions)
      if (active_riesgo_op !== undefined) updates.active_riesgo_op = Boolean(active_riesgo_op)
      if (active_capital_op !== undefined) updates.active_capital_op = Boolean(active_capital_op)
      if (active_slots !== undefined) updates.active_slots = Boolean(active_slots)
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
