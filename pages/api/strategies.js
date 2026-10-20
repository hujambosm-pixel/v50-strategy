import { exigeAuth } from '../../lib/verificaJwt'
import { validaCodeJs } from '../../lib/validaCodeJs'
import { preparaGuardado } from '../../lib/editor/guardar'
import { esDefinicionEditor } from '../../lib/editor/fuente'

// pages/api/strategies.js — CRUD de estrategias en Supabase
// Métodos: GET (list) | POST (create) | PUT (update) | DELETE (soft delete)

const SUPA_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPA_KEY = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
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

  // CÓDIGO DE ESTRATEGIA: solo se revisa si VIENE en el cuerpo. Las actualizaciones parciales —el
  // interruptor de habilitada, el intervalo del badge D/W— no mandan code_js y siguen pasando sin
  // tocar nada. Si viene y no compila, 422 ANTES de hablar con Supabase, y con un tipo propio para
  // que el cliente pueda distinguirlo de un fallo de descarga.
  if (req.body && req.body.code_js != null) {
    const v = validaCodeJs(req.body.code_js)
    if (!v.ok) return res.status(422).json({ error: v.error, tipo: 'codigo_estrategia' })
    req.body.code_js = v.codigo
  }

  // ESTRATEGIA DEL EDITOR (docs/editor-visual.md, E5): si el cuerpo trae una definición del editor, se valida ANTES de
  // hablar con Supabase (422 con la lista de errores, tipo propio) y se guarda con code_js a null y en params los valores
  // de sus parámetros (lib/editor/guardar.js). El motor la ejecuta con el intérprete (lib/editor/fuente.js).
  const editor = esDefinicionEditor(req.body?.definition)
  if (editor) {
    if (req.body.code_js != null) return res.status(422).json({ error: 'Una estrategia del editor no lleva code_js.', tipo: 'definicion_editor', errores: ['Una estrategia del editor no lleva code_js.'] })
    const g = preparaGuardado(req.body.definition, req.body.params)
    if (!g.ok) return res.status(422).json({ error: g.errores.join(' '), tipo: 'definicion_editor', errores: g.errores })
    req.body.params = g.params
    req.body.code_js = null
  }

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
        // La del editor lleva además sus params (y code_js a null); las demás, como siempre.
        const fila = { name, description, symbol, years, capital_ini, definition, color, active: true }
        if (editor) Object.assign(fila, { code_js: null, params: req.body.params })
        const data = await supa('/strategies', {
          method: 'POST',
          body: JSON.stringify(fila),
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
