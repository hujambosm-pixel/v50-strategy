// lib/screener/vistasBase.js — las VISTAS GUARDADAS del screener en public.screener_vistas (sql/screener.sql; docs/screener.md):
// leer, crear, cambiar, ordenar y borrar las del usuario (la RLS deja ver y tocar solo las suyas).
//   ctx: { url, headers, fetch } — ctxConSesion() de lib/supabase.js.
import { VISTAS_EJEMPLO, normalizaVista } from './vista'

const COLUMNAS = 'id,nombre,vista,posicion,created_at,updated_at'
const jsonDe = async (r, que) => { if (!r.ok) { let m = ''; try { m = (await r.json())?.message || '' } catch (_) {} throw new Error(`No se pudo ${que} (HTTP ${r.status}${m ? `: ${m}` : ''}).`) } return r.status === 204 ? null : r.json() }
const una = (j) => Array.isArray(j) ? j[0] : j
const conJson = (headers) => ({ ...headers, 'Content-Type': 'application/json', Prefer: 'return=representation' })
export const nombreLimpio = (t) => String(t ?? '').trim().replace(/\s+/g, ' ').slice(0, 200)

// Lo que se guarda de una vista: nombre limpio (o «Vista sin nombre»), la vista completa y su posición.
export const camposVista = ({ nombre, vista, posicion = 0 }) => ({ nombre: nombreLimpio(nombre) || 'Vista sin nombre', vista: normalizaVista(vista), posicion: Number(posicion) || 0 })

export async function listarVistas({ url, headers, fetch: f = fetch }) {
  const r = await f(`${url}/rest/v1/screener_vistas?select=${COLUMNAS}&order=posicion.asc,id.asc&limit=1000`, { headers })
  return jsonDe(r, 'leer tus vistas del screener')
}
export async function crearVista({ url, headers, fetch: f = fetch }, v) {
  const r = await f(`${url}/rest/v1/screener_vistas?select=${COLUMNAS}`, { method: 'POST', headers: conJson(headers), body: JSON.stringify(camposVista(v)) })
  return una(await jsonDe(r, 'guardar la vista'))
}
export async function cambiarVista({ url, headers, fetch: f = fetch }, id, v) {
  const r = await f(`${url}/rest/v1/screener_vistas?id=eq.${Number(id)}&select=${COLUMNAS}`, { method: 'PATCH', headers: conJson(headers), body: JSON.stringify(camposVista(v)) })
  return una(await jsonDe(r, 'guardar la vista'))
}
export async function borrarVista({ url, headers, fetch: f = fetch }, id) {
  const r = await f(`${url}/rest/v1/screener_vistas?id=eq.${Number(id)}`, { method: 'DELETE', headers })
  await jsonDe(r, 'borrar la vista')
}
// La primera vez (el usuario no tiene ninguna vista): se crean las 3 de ejemplo, en su orden, y se devuelven.
export async function creaEjemplos(ctx) {
  const hechas = []
  for (let i = 0; i < VISTAS_EJEMPLO.length; i++) hechas.push(await crearVista(ctx, { ...VISTAS_EJEMPLO[i], posicion: i }))
  return hechas
}
