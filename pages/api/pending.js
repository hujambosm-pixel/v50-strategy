// pages/api/pending.js — CRUD pending_orders (órdenes pendientes)
// Patrón idéntico a risk.js: JWT del cliente vía x-supa-jwt, user_id lo rellena
// la DB (DEFAULT auth.uid()) — nunca se manda en el body. Una orden por (user_id, symbol).
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
  const { action, id, symbol } = req.query

  try {
    // ── GET: listar órdenes del usuario ──
    if (req.method === 'GET' && (action === 'list' || !action)) {
      const data = await sb('/pending_orders?order=created_at.desc')
      return res.json(Array.isArray(data) ? data : [])
    }

    // ── POST action=upsert — una orden por (user_id, symbol) ──
    // ON CONFLICT (user_id, symbol) DO UPDATE vía PostgREST (merge-duplicates).
    // user_id lo pone la DB (DEFAULT auth.uid()); el conflicto se detecta sobre ese default.
    // Refresca created_at y updated_at a now() en cada upsert.
    if (req.method === 'POST' && action === 'upsert') {
      const { symbol: sym, entry_price, stop_price, tp_price, shares, currency, profile_id, notes } = req.body || {}
      if (!sym) return res.status(400).json({ error: 'symbol requerido' })
      if (entry_price == null || stop_price == null) return res.status(400).json({ error: 'entry_price y stop_price requeridos' })
      const now = new Date().toISOString()
      const row = {
        symbol: sym,
        entry_price: Number(entry_price),
        stop_price: Number(stop_price),
        tp_price: tp_price != null ? Number(tp_price) : null,
        shares: shares != null ? Math.round(Number(shares)) : null,
        currency: currency || null,
        profile_id: profile_id || null,
        notes: notes || null,
        created_at: now,
        updated_at: now,
      }
      const data = await sb('/pending_orders?on_conflict=user_id,symbol', {
        method: 'POST',
        prefer: 'resolution=merge-duplicates,return=representation',
        body: JSON.stringify(row),
      })
      return res.json(Array.isArray(data) ? data[0] : data)
    }

    // ── POST action=delete — por symbol o id (funcional, sin UI en este ladrillo) ──
    if (req.method === 'POST' && action === 'delete') {
      const delSym = symbol || req.body?.symbol
      const delId = id || req.body?.id
      if (!delSym && !delId) return res.status(400).json({ error: 'symbol o id requerido' })
      const filter = delId ? `id=eq.${delId}` : `symbol=eq.${encodeURIComponent(delSym)}`
      await sb(`/pending_orders?${filter}`, { method: 'DELETE', prefer: 'return=minimal' })
      return res.json({ ok: true })
    }

    return res.status(405).json({ error: 'Método/acción no permitido' })
  } catch (e) {
    console.error('[pending]', e.message)
    return res.status(500).json({ error: e.message })
  }
}
