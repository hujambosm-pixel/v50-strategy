// pages/api/strategy-blocks.js — CRUD de bloques reutilizables
// Sin RLS, sin user_id — app de usuario único
// GET    → SELECT * FROM strategy_blocks ORDER BY role, name
// POST   → INSERT { role, name, definition }
// DELETE → DELETE WHERE id = ?

const SUPA_URL = process.env.SUPABASE_URL || 'https://uqjngxxbdlquiuhywiuc.supabase.co'
const SUPA_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_st9QJ3zcQbY5ec-JhxwqXQ_joy3udz3'

async function supa(path, options = {}) {
  const res = await fetch(`${SUPA_URL}/rest/v1${path}`, {
    headers: {
      'apikey': SUPA_KEY,
      'Authorization': `Bearer ${SUPA_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': options.prefer || 'return=representation',
    },
    ...options,
  })
  const text = await res.text()
  if (!res.ok) throw new Error(text || `Supabase error ${res.status}`)
  return text ? JSON.parse(text) : null
}

export default async function handler(req, res) {
  try {
    switch (req.method) {

      // GET /api/strategy-blocks
      case 'GET': {
        const data = await supa('/strategy_blocks?order=role.asc,name.asc&select=*')
        return res.status(200).json(data || [])
      }

      // POST /api/strategy-blocks — crear bloque
      case 'POST': {
        const { role, name, definition } = req.body
        if (!role || !name || !definition) {
          return res.status(400).json({ error: 'role, name y definition requeridos' })
        }
        const data = await supa('/strategy_blocks', {
          method: 'POST',
          body: JSON.stringify({ role, name, definition }),
        })
        return res.status(201).json(Array.isArray(data) ? data[0] : data)
      }

      // DELETE /api/strategy-blocks?id=...
      case 'DELETE': {
        const { id } = req.query
        if (!id) return res.status(400).json({ error: 'id requerido' })
        await supa(`/strategy_blocks?id=eq.${id}`, {
          method: 'DELETE',
          prefer: 'return=minimal',
        })
        return res.status(200).json({ ok: true })
      }

      default:
        return res.status(405).end()
    }
  } catch (err) {
    console.error('[strategy-blocks]', err)
    return res.status(500).json({ error: err.message || 'Error interno' })
  }
}
