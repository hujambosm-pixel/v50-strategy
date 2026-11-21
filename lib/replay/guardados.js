// lib/replay/guardados.js — GUARDAR y ABRIR los Replays (tabla public.simulaciones, sql/simulaciones.sql; docs/builder.md §232).
// ctx: { url, headers, fetch? } (ctxConSesion de lib/supabase.js, como los dibujos). La RLS deja ver y tocar solo lo de cada usuario.
// Cada Replay se guarda SOLO en cuanto tiene algo (has avanzado alguna vela u operado): primero se crea la fila y después se actualiza.
// En «estado» va el estado del motor (lib/replay/motor.js) y, para la lista, un «resumen» { final, pct, operaciones } calculado al guardar.
import { cifras } from './motor'

const falla = async (r, que) => { let m = ''; try { m = (await r.json())?.message || '' } catch (_) {} throw new Error(`No se pudo ${que} (HTTP ${r.status}${m ? `: ${m}` : ''}).`) }
const fmt = (f) => (f ? `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}` : '')

// El nombre que se propone: «^GSPC · desde 20/11/2025».
export const nombreDe = (estado) => `${(estado?.valores || [])[0] || 'Replay'} · desde ${fmt(estado?.desde)}`.slice(0, 120)
// ¿Hay algo que guardar? (un Replay recién empezado, sin avanzar ni operar, no se guarda).
export const hayQueGuardar = (estado) => !!estado && (estado.hoy > estado.desde || (estado.acciones || []).length > 0 || !!estado.terminada)

// Lo que se guarda: el estado del motor + el resumen para la lista.
export function paraGuardar(estado, velas, r) {
  const { resumen, ...e } = estado || {}
  let res = null
  try { const c = cifras(e, velas, r); res = { final: c.final, pct: c.pct, operaciones: c.operaciones } } catch (_) {}
  return { ...e, resumen: res }
}
// Lo que se abre: el estado del motor sin el resumen.
export const deGuardado = (estado) => { const { resumen, ...e } = estado || {}; return { retrocesos: 0, terminada: false, acciones: [], ...e } }

export async function leerSimulaciones({ url, headers, fetch: f = fetch }) {
  const r = await f(`${url}/rest/v1/simulaciones?select=id,tipo,nombre,estado,creada,actualizada&tipo=eq.replay&order=actualizada.desc`, { headers })
  if (!r.ok) await falla(r, 'leer tus replays')
  const j = await r.json()
  return Array.isArray(j) ? j : []
}

export async function crearSimulacion({ url, headers, fetch: f = fetch }, nombre, estado) {
  const r = await f(`${url}/rest/v1/simulaciones`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({ tipo: 'replay', nombre: String(nombre || '').trim().slice(0, 120) || 'Replay', estado }) })
  if (!r.ok) await falla(r, 'guardar el replay')
  const j = await r.json()
  return (Array.isArray(j) ? j[0] : j)?.id || null
}

export async function guardarSimulacion({ url, headers, fetch: f = fetch }, id, cambios) {
  const body = {}
  if (cambios.nombre != null) body.nombre = String(cambios.nombre).trim().slice(0, 120) || 'Replay'
  if (cambios.estado != null) body.estado = cambios.estado
  const r = await f(`${url}/rest/v1/simulaciones?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(body) })
  if (!r.ok) await falla(r, 'guardar el replay')
  return true
}

export async function borrarSimulacion({ url, headers, fetch: f = fetch }, id) {
  const r = await f(`${url}/rest/v1/simulaciones?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE', headers: { ...headers, Prefer: 'return=minimal' } })
  if (!r.ok) await falla(r, 'borrar el replay')
  return true
}

// Buscar en la lista sin distinguir mayúsculas ni acentos (nombre y valor).
const llano = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
export const filtraSimulaciones = (filas, q) => { const t = llano(q).trim(); return t ? (filas || []).filter(x => llano(`${x.nombre} ${(x.estado?.valores || []).join(' ')}`).includes(t)) : (filas || []) }
