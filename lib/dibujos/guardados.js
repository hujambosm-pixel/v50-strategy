// lib/dibujos/guardados.js — LEER y GUARDAR los dibujos de un valor en la base (tabla public.dibujos_grafico, sql/dibujos_grafico.sql;
// docs/builder.md §206 y §209). Una fila por usuario y valor; la RLS deja ver y tocar solo lo suyo. ctx: { url, headers, fetch? }
// (ctxConSesion de lib/supabase.js, como los planes).
// Lo que se lee y lo que se guarda pasa SIEMPRE por limpiaDibujos (lib/dibujos/geometria.js): lo que no vale se tira.
// Sin dibujos, la fila se BORRA (no se dejan filas vacías).
import { limpiaDibujos } from './geometria'

// El valor tal como lo exige la base: en mayúsculas y sin espacios; '' si no vale (de 1 a 30 letras).
export const simboloDe = (s) => { const x = String(s || '').trim().toUpperCase(); return x.length >= 1 && x.length <= 30 ? x : '' }
const filtro = (s) => `simbolo=eq.${encodeURIComponent(s)}`
const falla = async (r, que) => { let m = ''; try { m = (await r.json())?.message || '' } catch (_) {} throw new Error(`No se pudo ${que} (HTTP ${r.status}${m ? `: ${m}` : ''}).`) }

export async function leerDibujos({ url, headers, fetch: f = fetch }, simbolo) {
  const s = simboloDe(simbolo); if (!s) return []
  const r = await f(`${url}/rest/v1/dibujos_grafico?select=dibujos&${filtro(s)}`, { headers })
  if (!r.ok) await falla(r, 'leer tus dibujos')
  const j = await r.json()
  return limpiaDibujos(j?.[0]?.dibujos || [])
}

// Cuántos dibujos hay en cada valor: [{ simbolo, n }] (los que tienen alguno).
export async function resumenDibujos({ url, headers, fetch: f = fetch }) {
  const r = await f(`${url}/rest/v1/dibujos_grafico?select=simbolo,dibujos`, { headers })
  if (!r.ok) await falla(r, 'leer tus dibujos')
  const j = await r.json()
  return (Array.isArray(j) ? j : []).map(x => ({ simbolo: x.simbolo, n: limpiaDibujos(x.dibujos).length })).filter(x => x.n > 0)
}
// Borra los dibujos de TODOS los valores del usuario (la RLS solo deja tocar los suyos). No se puede deshacer.
export async function borrarTodosLosDibujos({ url, headers, fetch: f = fetch }) {
  const r = await f(`${url}/rest/v1/dibujos_grafico?simbolo=not.is.null`, { method: 'DELETE', headers: { ...headers, Prefer: 'return=minimal' } })
  if (!r.ok) await falla(r, 'borrar tus dibujos')
  return true
}

export async function guardarDibujos({ url, headers, fetch: f = fetch }, simbolo, lista) {
  const s = simboloDe(simbolo); if (!s) return false
  const dibujos = limpiaDibujos(lista)
  if (!dibujos.length) {
    const r = await f(`${url}/rest/v1/dibujos_grafico?${filtro(s)}`, { method: 'DELETE', headers: { ...headers, Prefer: 'return=minimal' } })
    if (!r.ok) await falla(r, 'guardar tus dibujos')
    return true
  }
  const r = await f(`${url}/rest/v1/dibujos_grafico?on_conflict=user_id,simbolo`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ simbolo: s, dibujos }) })
  if (!r.ok) await falla(r, 'guardar tus dibujos')
  return true
}
