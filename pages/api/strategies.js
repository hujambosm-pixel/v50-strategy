import { exigeAuth } from '../../lib/verificaJwt'

// pages/api/strategies.js — CRUD de estrategias en Supabase
// Métodos: GET (list) | POST (create) | PUT (update) | DELETE (soft delete)

const SUPA_URL = process.env.SUPABASE_URL || 'https://uqjngxxbdlquiuhywiuc.supabase.co'
const SUPA_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_st9QJ3zcQbY5ec-JhxwqXQ_joy3udz3'
// EL TOKEN VA POR PETICIÓN, NO POR MÓDULO.
// Antes esto era un `let _reqJwt` de módulo: el handler lo asignaba al entrar y supa() lo leía
// después de varios await. En un contenedor caliente de Vercel dos peticiones concurrentes comparten
// el módulo, así que la segunda pisaba el token de la primera y las consultas de una salían firmadas
// con el JWT de la otra. Con RLS activado eso no es un fallo que la base de datos pueda atrapar: el
// token es válido, solo que de otra persona.
//
// Ahora el token entra por argumento y el handler se queda un alias atado al suyo, que vive en su
// propio ámbito y nadie puede pisar. Los puntos de llamada no cambian.
async function supaCon(jwt, path, options = {}) {
  const res = await fetch(`${SUPA_URL}/rest/v1${path}`, {
    headers: {
      'apikey': SUPA_KEY,
      'Authorization': `Bearer ${jwt}`,
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
  const jwt = req.headers['x-supa-jwt'] || null
  const supa = (path, options) => supaCon(jwt, path, options)
  // AUTENTICACIÓN OBLIGATORIA. Sin JWT válido no se sirve nada: 401 antes de tocar Supabase o
  // cualquier proveedor. Incluye las acciones que no hablan con la base de datos, a propósito.
  // La única excepción es que el verificador no haya podido comprobar el token (JWKS caído): ahí
  // exigeAuth deja pasar con el token del cliente y lo registra. Ver lib/verificaJwt.js.
  const auth = await exigeAuth('strategies', req, req.query?.action)
  if (!auth.ok) return res.status(401).json({ error: 'no autenticado' })

  try {
    switch (req.method) {

      // ── GET /api/strategies — lista activas, ordenadas por fecha ──
      case 'GET': {
        const data = await supa('/strategies?active=eq.true&order=created_at.desc&select=*')
        return res.status(200).json(data || [])
      }

      // ── POST /api/strategies — crear nueva estrategia ──
      case 'POST': {
        const { name, description, symbol, years, capital_ini, definition, color } = req.body
        if (!name || !definition) return res.status(400).json({ error: 'name y definition requeridos' })
        const data = await supa('/strategies', {
          method: 'POST',
          body: JSON.stringify({ name, description, symbol, years, capital_ini, definition, color, active: true }),
        })
        return res.status(201).json(Array.isArray(data) ? data[0] : data)
      }

      // ── PUT /api/strategies — actualizar estrategia existente ──
      case 'PUT': {
        const { id, ...updates } = req.body
        if (!id) return res.status(400).json({ error: 'id requerido' })
        delete updates.created_at
        const data = await supa(`/strategies?id=eq.${id}`, {
          method: 'PATCH',
          body: JSON.stringify(updates),
        })
        return res.status(200).json(Array.isArray(data) ? data[0] : data)
      }

      // ── DELETE /api/strategies?id=... — soft delete ──
      case 'DELETE': {
        const { id } = req.query
        if (!id) return res.status(400).json({ error: 'id requerido' })
        await supa(`/strategies?id=eq.${id}`, {
          method: 'PATCH',
          body: JSON.stringify({ active: false }),
          prefer: 'return=minimal',
        })
        return res.status(200).json({ ok: true })
      }

      default:
        return res.status(405).end()
    }
  } catch (err) {
    console.error('[strategies]', err)
    return res.status(500).json({ error: err.message || 'Error interno' })
  }
}


// ── API route para guardar resultado de backtest ─────────────
// POST /api/backtest-history { strategy_id?, strategy_name, symbol, metrics, trades, curves }
// (archivo separado: pages/api/backtest-history.js — pendiente)
