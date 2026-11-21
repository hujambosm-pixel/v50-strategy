// lib/alertas/guardadas.js — LEER y GUARDAR las alertas nuevas desde la app (tablas public.alertas y public.alertas_saltos, sql/alertas.sql;
// docs/builder.md §218). ctx: { url, headers, fetch? } (ctxConSesion de lib/supabase.js, como los dibujos). La RLS deja ver y tocar solo lo
// del usuario; el dueño, el id y las fechas los pone la base. Lo que se guarda pasa antes por validaAlerta (lib/alertas/motor.js).
import { validaAlerta } from './motor'

const falla = async (r, que) => { let m = ''; try { m = (await r.json())?.message || '' } catch (_) {} throw new Error(`No se pudo ${que} (HTTP ${r.status}${m ? `: ${m}` : ''}).`) }
const json = (headers, prefer) => ({ ...headers, 'Content-Type': 'application/json', Prefer: prefer })
// Las columnas que la app puede escribir (las demás las pone la base o el comprobador).
const CAMPOS = ['simbolo', 'tipo', 'regla', 'despues', 'activa', 'armada', 'caduca', 'nota']
const soloCampos = (a) => Object.fromEntries(CAMPOS.filter(k => a[k] !== undefined).map(k => [k, a[k]]))

// Todas las alertas del usuario (encendidas y apagadas), las más nuevas primero; con simbolo, solo las de ese valor.
export async function leerAlertas({ url, headers, fetch: f = fetch }, simbolo = null) {
  const r = await f(`${url}/rest/v1/alertas?select=*${simbolo ? `&simbolo=eq.${encodeURIComponent(simbolo)}` : ''}&order=creada.desc`, { headers })
  if (!r.ok) await falla(r, 'leer tus alertas')
  return r.json()
}
// Los saltos («Saltaron»), los más nuevos primero; con simbolo, solo los de ese valor. Como mucho «max».
export async function leerSaltos({ url, headers, fetch: f = fetch }, simbolo = null, max = 50) {
  const r = await f(`${url}/rest/v1/alertas_saltos?select=*${simbolo ? `&simbolo=eq.${encodeURIComponent(simbolo)}` : ''}&order=cuando.desc&limit=${max}`, { headers })
  if (!r.ok) await falla(r, 'leer las alertas que saltaron')
  return r.json()
}
// Crea una alerta (o la cambia, si lleva id). Devuelve la fila guardada.
export async function guardarAlerta({ url, headers, fetch: f = fetch }, alerta) {
  const e = validaAlerta({ despues: 'una_vez', ...alerta })
  if (e.length) throw new Error(e.join(' '))
  const cuerpo = soloCampos(alerta)
  const r = alerta.id
    ? await f(`${url}/rest/v1/alertas?id=eq.${encodeURIComponent(alerta.id)}`, { method: 'PATCH', headers: json(headers, 'return=representation'), body: JSON.stringify(cuerpo) })
    : await f(`${url}/rest/v1/alertas`, { method: 'POST', headers: json(headers, 'return=representation'), body: JSON.stringify(cuerpo) })
  if (!r.ok) await falla(r, 'guardar la alerta')
  return (await r.json())[0]
}
// Cambia solo unas columnas (encender / apagar, mover el nivel…) sin volver a validar el resto.
export async function cambiarAlerta({ url, headers, fetch: f = fetch }, id, cambios) {
  const r = await f(`${url}/rest/v1/alertas?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', headers: json(headers, 'return=representation'), body: JSON.stringify(soloCampos(cambios)) })
  if (!r.ok) await falla(r, 'cambiar la alerta')
  return (await r.json())[0]
}
export async function borrarAlerta({ url, headers, fetch: f = fetch }, id) {
  const r = await f(`${url}/rest/v1/alertas?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE', headers: json(headers, 'return=minimal') })
  if (!r.ok) await falla(r, 'borrar la alerta')
  return true
}
// Marca como vistos los saltos indicados (ids) o, sin ids, todos los de un valor.
export async function marcarVistos({ url, headers, fetch: f = fetch }, { ids = null, simbolo = null } = {}) {
  const q = ids?.length ? `id=in.(${ids.map(Number).filter(Number.isFinite).join(',')})` : simbolo ? `simbolo=eq.${encodeURIComponent(simbolo)}&visto=eq.false` : null
  if (!q) return false
  const r = await f(`${url}/rest/v1/alertas_saltos?${q}`, { method: 'PATCH', headers: json(headers, 'return=minimal'), body: JSON.stringify({ visto: true }) })
  if (!r.ok) await falla(r, 'marcar como vista')
  return true
}
