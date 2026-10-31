// lib/tesis.js — las TESIS DE INVERSIÓN de la pantalla «Tesis» (V9.1092, components/TesisPanel.js; tabla tesis_inversion,
// sql/tesis_inversion.sql; docs/tesis.md): leer, crear, cambiar, marcar revisada y borrar las del usuario (la RLS deja ver y tocar
// solo las suyas), y las piezas puras de la pantalla (estados, filtros, búsqueda, fechas). No toca el motor ni ninguna cifra.
//   ctx: { url, headers, fetch } — ctxConSesion() de lib/supabase.js (el token vigente en cada llamada y reintento ante 401).
import { coincide } from './builder/buscar'

export const ESTADOS_TESIS = Object.freeze([
  { id: 'idea', nombre: 'Idea', fondo: '#263040', color: '#c9d4df' },
  { id: 'estudio', nombre: 'En estudio', fondo: '#13283f', color: '#79c0ff' },
  { id: 'marcha', nombre: 'En marcha', fondo: '#14301f', color: '#56d364' },
  { id: 'descartada', nombre: 'Descartada', fondo: '#3b1d22', color: '#ff8b8b' },
])
export const estadoTesis = (id) => ESTADOS_TESIS.find(e => e.id === id) || ESTADOS_TESIS[0]
export const TITULO_NUEVA = 'Nueva tesis'
export const MAX_TEXTO = 102400   // bytes (UTF-8), como la tabla
export const AYUDA_TESIS = 'Escribe aquí tus ideas de inversión: qué crees que va a pasar, qué tendría que ocurrir para entrar y qué te haría descartarla. Revísalas de vez en cuando y cambia su estado.'
export const AYUDA_RELACIONADO = 'Enlaza estrategias o planes que tengan que ver con esta tesis.'

const COLUMNAS = 'id,titulo,texto,estado,relacionados,created_at,updated_at,revisada_en'
const jsonDe = async (r, que) => { if (!r.ok) { let m = ''; try { m = (await r.json())?.message || '' } catch (_) {} throw new Error(`No se pudo ${que} (HTTP ${r.status}${m ? `: ${m}` : ''}).`) } return r.status === 204 ? null : r.json() }
const una = (j) => Array.isArray(j) ? j[0] : j
const conJson = (headers) => ({ ...headers, 'Content-Type': 'application/json', Prefer: 'return=representation' })
export const tituloLimpio = (t) => String(t ?? '').trim().replace(/\s+/g, ' ').slice(0, 200)
export const bytesDe = (s) => new TextEncoder().encode(String(s ?? '')).length
// Lo que se guarda de una tesis (el borrador de la pantalla): título limpio, texto tal cual, estado válido y enlaces { tipo, id }.
export const camposDe = (b) => ({
  titulo: tituloLimpio(b.titulo), texto: String(b.texto ?? ''), estado: estadoTesis(b.estado).id,
  relacionados: (b.relacionados || []).filter(r => r && (r.tipo === 'estrategia' || r.tipo === 'plan') && r.id != null).map(r => ({ tipo: r.tipo, id: String(r.id) })),
})
// ¿Se puede guardar? null si sí; si no, por qué.
export function problemaDe(b) {
  if (!tituloLimpio(b.titulo)) return 'Ponle un título.'
  if (bytesDe(b.texto) > MAX_TEXTO) return 'El texto es demasiado largo (máximo 100 KB).'
  return null
}

export async function listarTesis({ url, headers, fetch: f = fetch }) {
  const r = await f(`${url}/rest/v1/tesis_inversion?select=${COLUMNAS}&order=revisada_en.desc,id.desc&limit=1000`, { headers })
  return jsonDe(r, 'leer tus tesis')
}
// Crear y guardar cambios ponen revisada_en = ahora (guardar es revisarla).
export async function crearTesis({ url, headers, fetch: f = fetch }, borrador, ahora = new Date()) {
  const r = await f(`${url}/rest/v1/tesis_inversion?select=${COLUMNAS}`, { method: 'POST', headers: conJson(headers), body: JSON.stringify({ ...camposDe(borrador), revisada_en: ahora.toISOString() }) })
  return una(await jsonDe(r, 'guardar la tesis'))
}
export async function cambiarTesis({ url, headers, fetch: f = fetch }, id, borrador, ahora = new Date()) {
  const r = await f(`${url}/rest/v1/tesis_inversion?id=eq.${Number(id)}&select=${COLUMNAS}`, { method: 'PATCH', headers: conJson(headers), body: JSON.stringify({ ...camposDe(borrador), revisada_en: ahora.toISOString() }) })
  const j = una(await jsonDe(r, 'guardar los cambios'))
  if (!j) throw new Error('No se pudo guardar los cambios: la tesis ya no existe.')
  return j
}
// «Marcar como revisada hoy»: solo revisada_en, sin tocar el texto.
export async function marcarRevisada({ url, headers, fetch: f = fetch }, id, ahora = new Date()) {
  const r = await f(`${url}/rest/v1/tesis_inversion?id=eq.${Number(id)}&select=${COLUMNAS}`, { method: 'PATCH', headers: conJson(headers), body: JSON.stringify({ revisada_en: ahora.toISOString() }) })
  const j = una(await jsonDe(r, 'marcarla como revisada'))
  if (!j) throw new Error('No se pudo marcarla como revisada: la tesis ya no existe.')
  return j
}
export async function borrarTesis({ url, headers, fetch: f = fetch }, id) {
  const r = await f(`${url}/rest/v1/tesis_inversion?id=eq.${Number(id)}`, { method: 'DELETE', headers: { ...headers, Prefer: 'return=representation' } })
  const j = await jsonDe(r, 'borrar la tesis')
  if (!j?.length) throw new Error('No se pudo borrar la tesis: ya no existe.')
  return true
}
// Los planes guardados, solo id y nombre (para enlazarlos; el plan entero no hace falta aquí).
export async function listarNombresPlanes({ url, headers, fetch: f = fetch }) {
  const r = await f(`${url}/rest/v1/planes_inversion?select=id,nombre&order=created_at.asc,id.asc&limit=200`, { headers })
  return jsonDe(r, 'leer tus planes')
}

// ── Piezas puras de la pantalla ──
export const ordenTesis = (xs) => [...xs].sort((a, b) => String(b.revisada_en).localeCompare(String(a.revisada_en)) || Number(b.id) - Number(a.id))
export const buscaTesis = (xs, consulta) => xs.filter(t => coincide(consulta, t.titulo, t.texto))
export function cuentasTesis(xs) {
  const c = { todas: xs.length }
  for (const e of ESTADOS_TESIS) c[e.id] = xs.filter(t => t.estado === e.id).length
  return c
}
const diaLocal = (d) => { const x = new Date(d); return new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime() }
export const diasEntre = (antes, ahora) => Math.round((diaLocal(ahora) - diaLocal(antes)) / 86400000)
const haceDias = (n) => n <= 0 ? 'hoy' : n === 1 ? 'ayer' : `hace ${n} días`
// «creada hoy» / «creada hace X días» si no se ha revisado desde que se creó; si no, «revisada hoy» / «revisada hace X días».
export function haceTexto(t, ahora = new Date()) {
  const creada = t.created_at || t.revisada_en
  const sinRevisar = !t.revisada_en || Math.abs(new Date(t.revisada_en) - new Date(creada)) < 60000
  return sinRevisar ? `creada ${haceDias(diasEntre(creada, ahora))}` : `revisada ${haceDias(diasEntre(t.revisada_en, ahora))}`
}
export function fechaCorta(d) {
  if (!d) return '—'
  const x = new Date(d), dos = (n) => String(n).padStart(2, '0')
  return `${dos(x.getDate())}/${dos(x.getMonth() + 1)}/${x.getFullYear()}`
}
// Un enlace con su nombre de ahora (o borrado: la estrategia o el plan ya no está).
export function fichaDe(r, estrategias = [], planes = []) {
  const lista = r.tipo === 'plan' ? planes : estrategias
  const x = lista.find(e => String(e.id) === String(r.id))
  return { ...r, etiqueta: r.tipo === 'plan' ? 'Plan' : 'Estrategia', nombre: x ? (x.nombre ?? x.name ?? `#${r.id}`) : null, borrado: !x, fila: x || null }
}
export const igualesTesis = (a, b) => JSON.stringify(camposDe(a)) === JSON.stringify(camposDe(b)) && String(a.titulo ?? '') === String(b.titulo ?? '')
