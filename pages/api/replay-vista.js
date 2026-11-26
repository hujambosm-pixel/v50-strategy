// pages/api/replay-vista.js — la lista de cada LUNES de una vista del screener, para el Replay con varios valores (docs/builder.md §270).
//
// POST { vista: { filtros, sectoresFuera, universo }, desde: 'aaaa-mm-dd' }, con sesión (x-supa-jwt). Lee con el JWT del usuario las
// fotos semanales (public.screener_fotos, sql/screener_fotos.sql) desde el lunes que vale `desde` hasta la última, y las fichas de las
// empresas (sector, en_sp500, en_ndx, en_listas: las de HOY), y evalúa la vista en cada foto (evaluaFoto de lib/screener/enFecha.js).
// Responde { semanas: [[lunes, [símbolos]], …], noSeAplican: [ids], primera, ultima } o { error }.
import { exigeAuth } from '../../lib/verificaJwt'
import { evaluaFoto } from '../../lib/screener/enFecha'
import { normalizaVista } from '../../lib/screener/vista'

export const config = { maxDuration: 60 }
const FECHA = /^\d{4}-\d{2}-\d{2}$/
const PAGINA = 100

export function erroresPeticion(b) {
  const e = []
  if (!b || typeof b !== 'object') return ['falta el cuerpo']
  if (!b.vista || typeof b.vista !== 'object' || typeof b.vista.filtros !== 'object') e.push('falta la vista')
  if (!FECHA.test(String(b.desde || ''))) e.push('fecha de inicio no válida')
  return e
}

// El lunes de la semana de `f` (o el mismo día si es lunes).
export function lunesDe(f) {
  const d = new Date(Date.parse(f + 'T00:00:00Z'))
  const dia = (d.getUTCDay() + 6) % 7   // lunes = 0
  return new Date(d.getTime() - dia * 86400000).toISOString().slice(0, 10)
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const auth = await exigeAuth('replay-vista', req, null)
  if (!auth.ok) return res.status(401).json({ error: 'no autenticado' })
  const errs = erroresPeticion(req.body)
  if (errs.length) return res.status(400).json({ error: errs.join('; ') })
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const headers = { apikey: key, Authorization: `Bearer ${req.headers['x-supa-jwt']}` }
  const lee = async (ruta) => { const r = await fetch(`${url}/rest/v1/${ruta}`, { headers }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() }
  try {
    const fichasL = await lee('screener_empresas?select=simbolo,sector,en_sp500,en_ndx,en_listas&limit=5000')
    const fichas = Object.fromEntries(fichasL.map(f => [f.simbolo, f]))
    const primera = (await lee('screener_fotos?select=fecha&order=fecha.asc&limit=1'))[0]?.fecha || null
    const ultima = (await lee('screener_fotos?select=fecha&order=fecha.desc&limit=1'))[0]?.fecha || null
    if (!primera) return res.status(200).json({ error: 'Aún no hay fotos del screener (node scripts/fotosScreener.js).', semanas: [], noSeAplican: [], primera, ultima })
    const desde = lunesDe(req.body.desde)
    if (desde < primera) return res.status(200).json({ error: `Las fotos del screener empiezan el lunes ${primera.split('-').reverse().join('/')}: empieza ese día o después.`, semanas: [], noSeAplican: [], primera, ultima })
    // La vista completada como la pantalla del screener (las vistas viejas guardan menos campos).
    const vista = normalizaVista(req.body.vista)
    const semanas = []
    let noSeAplican = []
    for (let off = 0; ; off += PAGINA) {
      const filas = await lee(`screener_fotos?select=fecha,campos,datos&fecha=gte.${desde}&order=fecha.asc&limit=${PAGINA}&offset=${off}`)
      for (const f of filas) { const r = evaluaFoto(f, fichas, vista); semanas.push([f.fecha, r.pasan]); noSeAplican = r.noSeAplican }
      if (filas.length < PAGINA) break
    }
    return res.status(200).json({ semanas, noSeAplican, primera, ultima })
  } catch (e) {
    return res.status(500).json({ error: `No se pudieron leer las fotos del screener (${e.message}).` })
  }
}
