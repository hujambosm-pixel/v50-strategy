// lib/screener/lista.js — «☰ Guardar como lista» del screener (docs/screener.md): los valores que pasan la vista pasan a una
// lista FIJA de la Watchlist, con nombre y fecha, que se puede usar en «Una lista» del plan o en el Backtesting.
// Cómo se guarda, igual que la Watchlist (pages/index.js: createWatchlistList, upsertWatchlistItem, setItemLists):
//   · una fila nueva en watchlist_lists (con user_id explícito: esa tabla no lo pone sola);
//   · los valores que aún no están en la Watchlist se añaden a `watchlist` con el grupo «Screener» (para que no se mezclen
//     con los tuyos); los que ya están se reutilizan (no se tocan);
//   · una fila en watchlist_list_members por valor.
// Si algo falla a mitad, la lista ya creada se borra (y con ella sus miembros, en cascada); los valores añadidos a la
// Watchlist se quedan (no molestan: grupo «Screener»).
//   ctx: { url, headers, fetch } — ctxConSesion() de lib/supabase.js.

export const GRUPO_SCREENER = 'Screener'
const jsonDe = async (r, que) => { if (!r.ok) { let m = ''; try { m = (await r.json())?.message || '' } catch (_) {} throw new Error(`No se pudo ${que} (HTTP ${r.status}${m ? `: ${m}` : ''}).`) } return r.status === 204 ? null : r.json() }
const conJson = (headers) => ({ ...headers, 'Content-Type': 'application/json', Prefer: 'return=representation' })

// El nombre que se propone: «<vista> · dd/mm/aaaa».
export const nombrePropuesto = (vista, hoy = new Date()) => `${String(vista || 'Screener').trim()} · ${String(hoy.getDate()).padStart(2, '0')}/${String(hoy.getMonth() + 1).padStart(2, '0')}/${hoy.getFullYear()}`

// El usuario (sub) del token de la cabecera Authorization, o null.
export function usuarioDe(headers) {
  const jwt = String(headers?.Authorization || headers?.authorization || '').replace(/^Bearer\s+/i, '')
  try {
    const p = jwt.split('.')[1]; if (!p) return null
    const b = p.replace(/-/g, '+').replace(/_/g, '/')
    const txt = typeof atob === 'function' ? atob(b) : Buffer.from(b, 'base64').toString('utf8')
    return JSON.parse(txt).sub || null
  } catch (_) { return null }
}

// Qué hay que hacer (lógica pura): empresas [{ simbolo, nombre }], watchlist [{ id, symbol }] → { existentes: [id…], nuevos:
// [{ symbol, name, group_name }] } (sin repetir símbolos; la Watchlist se compara sin distinguir mayúsculas).
export function planDeLista(empresas, watchlist) {
  const ya = new Map()
  for (const w of watchlist || []) { const s = String(w.symbol || '').toUpperCase(); if (s && !ya.has(s)) ya.set(s, w.id) }
  const existentes = [], nuevos = [], vistos = new Set()
  for (const e of empresas || []) {
    const s = String(e.simbolo || '').toUpperCase(); if (!s || vistos.has(s)) continue
    vistos.add(s)
    if (ya.has(s)) existentes.push(ya.get(s))
    else nuevos.push({ symbol: s, name: e.nombre || s, group_name: GRUPO_SCREENER })
  }
  return { existentes, nuevos }
}

// Guarda la lista. Devuelve { lista: { id, name }, total, nuevos }. Errores con texto para la pantalla (p. ej. nombre repetido).
export async function guardarComoLista({ url, headers, fetch: f = fetch }, { nombre, empresas }) {
  const name = String(nombre || '').trim().replace(/\s+/g, ' ').slice(0, 120)
  if (!name) throw new Error('Ponle un nombre a la lista.')
  if (!empresas || !empresas.length) throw new Error('No hay valores que guardar.')
  const user_id = usuarioDe(headers)
  if (!user_id) throw new Error('Para guardar listas hay que haber iniciado sesión.')
  const listas = await jsonDe(await f(`${url}/rest/v1/watchlist_lists?select=id,name`, { headers }), 'leer tus listas')
  if ((listas || []).some(l => String(l.name).trim().toLowerCase() === name.toLowerCase())) throw new Error(`Ya tienes una lista que se llama «${name}». Ponle otro nombre.`)
  const wl = await jsonDe(await f(`${url}/rest/v1/watchlist?select=id,symbol`, { headers }), 'leer tu Watchlist')
  const { existentes, nuevos } = planDeLista(empresas, wl)
  const lista = (await jsonDe(await f(`${url}/rest/v1/watchlist_lists`, { method: 'POST', headers: conJson(headers), body: JSON.stringify({ name, user_id }) }), 'crear la lista'))[0]
  try {
    const creados = nuevos.length ? await jsonDe(await f(`${url}/rest/v1/watchlist`, { method: 'POST', headers: conJson(headers), body: JSON.stringify(nuevos) }), 'añadir los valores a la Watchlist') : []
    const ids = [...existentes, ...(creados || []).map(c => c.id)]
    await jsonDe(await f(`${url}/rest/v1/watchlist_list_members`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(ids.map(watchlist_id => ({ watchlist_id, list_id: lista.id }))) }), 'meter los valores en la lista')
    return { lista: { id: lista.id, name: lista.name }, total: ids.length, nuevos: nuevos.length }
  } catch (e) {
    try { await f(`${url}/rest/v1/watchlist_lists?id=eq.${lista.id}`, { method: 'DELETE', headers }) } catch (_) {}
    throw e
  }
}
