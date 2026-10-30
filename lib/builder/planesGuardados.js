// lib/builder/planesGuardados.js — los PLANES GUARDADOS del paso 3 (tabla planes_inversion, sql/planes_inversion.sql; docs/builder.md,
// §48): leer, crear, cambiar y borrar los del usuario (la RLS deja ver y tocar solo los suyos). No se congelan: se cambian y se vuelven
// a guardar. Cada uno guarda el plan entero (formato 1, con la foto de la estrategia) y su huella (huellaPlan). Y el aviso de que la
// estrategia ha cambiado desde que se guardó (la huella de la foto guardada frente a la de la estrategia de ahora).
//   ctx: { url, headers, fetch? } (la sesión de Supabase, como lib/pruebaAzar.js).
import { huellaPlan } from '../planes/plan'
import { huella } from '../lotesLab'
import { fotoDe, huellaEstrategia } from '../pruebaAzar'

const COLUMNAS = 'id,nombre,plan,huella,created_at,updated_at'
const jsonDe = async (r, que) => { if (!r.ok) { let m = ''; try { m = (await r.json())?.message || '' } catch (_) {} throw new Error(`No se pudo ${que} (HTTP ${r.status}${m ? `: ${m}` : ''}).`) } return r.status === 204 ? null : r.json() }
const una = (j) => Array.isArray(j) ? j[0] : j
export const nombreLimpio = (n) => String(n || '').trim().replace(/\s+/g, ' ').slice(0, 200)

export async function listarPlanes({ url, headers, fetch: f = fetch }) {
  const r = await f(`${url}/rest/v1/planes_inversion?select=${COLUMNAS}&order=created_at.asc,id.asc&limit=200`, { headers })
  return jsonDe(r, 'leer tus planes')
}
// Crea un plan nuevo con ese nombre (el nombre va también dentro del plan; la huella no lo cuenta).
export async function crearPlan({ url, headers, fetch: f = fetch }, { nombre, plan }) {
  const n = nombreLimpio(nombre), p = { ...plan, nombre: n }
  const r = await f(`${url}/rest/v1/planes_inversion?select=${COLUMNAS}`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify({ nombre: n, plan: p, huella: await huellaPlan(p) }) })
  return una(await jsonDe(r, 'guardar el plan'))
}
// Guarda los cambios de un plan (el plan entero y, si se da, el nombre nuevo).
export async function cambiarPlan({ url, headers, fetch: f = fetch }, id, { nombre, plan }) {
  const n = nombreLimpio(nombre), p = { ...plan, nombre: n }
  const r = await f(`${url}/rest/v1/planes_inversion?id=eq.${Number(id)}&select=${COLUMNAS}`, { method: 'PATCH', headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify({ nombre: n, plan: p, huella: await huellaPlan(p) }) })
  const j = una(await jsonDe(r, 'guardar los cambios'))
  if (!j) throw new Error('No se pudo guardar los cambios: el plan ya no existe.')
  return j
}
export async function borrarPlan({ url, headers, fetch: f = fetch }, id) {
  const r = await f(`${url}/rest/v1/planes_inversion?id=eq.${Number(id)}`, { method: 'DELETE', headers: { ...headers, Prefer: 'return=representation' } })
  const j = await jsonDe(r, 'borrar el plan')
  if (!j?.length) throw new Error('No se pudo borrar el plan: ya no existe.')
  return true
}

// §49: las pruebas del paso 2 de TODAS las estrategias del usuario (sin la foto), con su veredicto: para «pasa el azar / no pasa /
// sin prueba» del desplegable y el aviso de la estrategia abierta (lib/builder/planPantalla.js estadoPrueba).
export async function listarPruebasUsuario({ url, headers, fetch: f = fetch }) {
  const cols = 'id,creada_en,estrategia_id,estrategia_nombre,estrategia_huella,valor,velas,res:pruebas_azar_resultados(id,creado_en,veredicto:resultado->>veredicto,texto:resultado->>texto)'
  const r = await f(`${url}/rest/v1/pruebas_azar?select=${cols}&order=creada_en.desc,id.desc&limit=1000`, { headers })
  return (await jsonDe(r, 'leer las pruebas contra el azar')).map(({ res, ...x }) => ({ ...x, resultado: (Array.isArray(res) ? res[0] : res) || null }))
}
// La foto de la estrategia guardada en un plan, y si la estrategia de ahora (la fila de `strategies` con ese id, o null si ya no está)
// es otra: { foto, actual, cambiada, borrada }.
export const fotoDelPlan = (plan) => plan?.piezas?.find(p => p.tipo === 'estrategia')?.estrategia || null
export async function comparaEstrategia(plan, estrategias) {
  const foto = fotoDelPlan(plan)
  if (!foto) return { foto: null, actual: null, cambiada: false, borrada: true }
  const actual = estrategias.find(s => String(s.id) === String(foto.id)) || null
  if (!actual) return { foto, actual: null, cambiada: false, borrada: true }
  const [hg, ha] = await Promise.all([huella(fotoDe(foto)), huellaEstrategia(actual)])
  return { foto, actual, cambiada: hg !== ha, borrada: false }
}
export const AVISO_CAMBIADA = 'La estrategia ha cambiado desde que guardaste este plan'
export const AVISO_BORRADA = 'La estrategia de este plan ya no está entre las tuyas: se usa la versión guardada'
export const AYUDA_CAMBIADA = 'El plan guarda una foto de la estrategia tal como era al guardarlo. Desde entonces la has cambiado en el paso 1. «Usar la versión guardada»: el plan sigue calculándose con la regla de entonces. «Usar la versión actual»: con la regla de ahora (al guardar los cambios, la foto se actualiza). Ejemplo: guardaste el plan con EMA20 y luego cambiaste a EMA30.'
export const AYUDA_COMPARAR = 'Para ver varios planes guardados uno al lado del otro (sus cifras y sus curvas). Llegará en la parte 3c.'
