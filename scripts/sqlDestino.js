// scripts/sqlDestino.js — a dónde mandan el SQL los scripts (backup, guardián, caché de precios, universo y los que tiran de ellos).
//
// Desde el 12/11/2026 la base de Trading Simulator es Supabase LOCAL (docs/builder.md §129). Si .env.local (o el entorno) tiene
// SUPABASE_SQL_URL, el SQL va a ese postgres-meta local, que responde IGUAL que la Management API de la nube (mismo formato JSON,
// conecta como postgres, extra_float_digits = 0): no hace falta el token de `supabase login`. Sin SUPABASE_SQL_URL, todo va a la
// nube como siempre (volver atrás = restaurar el .env.local de la nube, guardado en .env.nube.local).
const fs = require('fs')
const path = require('path')

const RAIZ = path.join(__dirname, '..')
function sqlLocal() {
  if (process.env.SUPABASE_SQL_URL != null) return process.env.SUPABASE_SQL_URL.trim() || null
  try {
    for (const l of fs.readFileSync(path.join(RAIZ, '.env.local'), 'utf8').split(/\r?\n/)) {
      const m = l.match(/^SUPABASE_SQL_URL=(.*)$/)
      if (m) return m[1].trim() || null
    }
  } catch (_) {}
  return null
}
const urlSql = (ref) => sqlLocal() || 'https://api.supabase.com/v1/projects/' + ref + '/database/query'
const cabecerasSql = (token) => sqlLocal() ? { 'Content-Type': 'application/json' } : { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }

module.exports = { sqlLocal, urlSql, cabecerasSql }
