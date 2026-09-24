import { getSupabase } from './supabaseClient'

// ── Configuración de Supabase para las llamadas DIRECTAS a PostgREST ────────
// ENTORNO PRIMERO, localStorage después.
//
// Antes esto salía SOLO de localStorage.v50_settings.integrations, que se rellena a mano en el formulario
// de Ajustes. En un navegador que no lo tuviera —uno nuevo, una ventana de incógnito, otro dispositivo, o
// después de limpiar los datos del sitio— devolvía cadena vacía, y las 47 llamadas del tipo
// `fetch(`${getSupaUrl()}/rest/v1/…`)` se convertían en rutas RELATIVAS contra el propio dominio:
// https://<la-app>/rest/v1/watchlist, que responde 404. La aplicación salía vacía y sin decir por qué.
//
// Los nombres de las variables son los MISMOS que ya usa lib/supabaseClient.js para la autenticación
// (NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY), no unos nuevos: si la autenticación
// funciona en producción, estas dos existen allí, porque getSupabase() devuelve null sin ellas y sin
// cliente no habría ni pantalla de login.
//
// OJO, son NEXT_PUBLIC_: Next.js las incrusta en el bundle al COMPILAR, no las lee en ejecución. Añadir o
// cambiar una en Vercel no tiene efecto hasta el siguiente despliegue.
//
// localStorage SE QUEDA como respaldo, a propósito: es lo que hace funcionar la aplicación hoy en el
// navegador habitual. Si por lo que sea el entorno no llegara, el camino de siempre sigue intacto.
const ENV_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const ENV_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
function deAjustes(campo) {
  try { return JSON.parse(localStorage.getItem('v50_settings')||'{}')?.integrations?.[campo]||'' } catch(_){ return '' }
}
export function getSupaUrl() { return ENV_URL || deAjustes('supabaseUrl') }
export function getSupaKey() { return ENV_KEY || deAjustes('supabaseKey') }

// ¿Hay configuración utilizable? Mismo criterio que tlUseLocal: una URL https y una clave con pinta de
// serlo. Lo consulta la interfaz para avisar en lugar de enseñar una aplicación vacía.
export function hayConfigSupabase() {
  try { return getSupaUrl().startsWith('https') && getSupaKey().length > 10 } catch(_) { return false }
}
// De dónde ha salido la configuración vigente, para poder decirlo en el aviso.
export function origenConfigSupabase() {
  if (ENV_URL && ENV_KEY) return 'entorno'
  if (deAjustes('supabaseUrl')) return 'ajustes'
  return 'ninguno'
}

// JWT from active Supabase Auth session — set by pages/index.js on auth state change
let _currentJwt = null
export function setCurrentJwt(jwt) { _currentJwt = jwt }
export function getCurrentJwt() { return _currentJwt }

// Headers for direct Supabase REST calls — uses session JWT when available, anon key as fallback
export function getSupaH() {
  const k = getSupaKey()
  return { apikey: k, Authorization: `Bearer ${_currentJwt || k}`, 'Content-Type': 'application/json' }
}

// ── Sesión caducada: manejo compartido del 401/403 ──────────────────────────
// Vive aquí y no en pages/index.js porque lo necesitan DOS sitios —apiFetch y lib/conditions.js— y dos
// copias del mismo reintento se desincronizan en cuanto una de las dos cambie.
//
// Quién avisa a la interfaz: pages/index.js registra su callback con setOnSesionCaducada al montar. Sin
// callback registrado no pasa nada malo: la petición devuelve su 401 y quien llame lo verá.
let _onSesionCaducada = null
export function setOnSesionCaducada(fn) { _onSesionCaducada = fn }

// Pide a supabase-js la sesión viva. getSession() devuelve la que tiene en memoria y solo va a la red si
// ha caducado, que es exactamente el caso que nos ocupa. Devuelve el token nuevo, o null si ya no hay
// sesión que refrescar.
async function refrescaJwt() {
  try {
    const sb = getSupabase()
    if (!sb) return null
    const { data } = await sb.auth.getSession()
    const jwt = data?.session?.access_token || null
    setCurrentJwt(jwt)
    return jwt
  } catch (_) { return null }
}

// fetch con UN solo reintento ante 401/403.
//
// `conCabeceras(jwt)` lo pone quien llama, porque las dos familias de llamadas mandan el token en sitios
// distintos: apiFetch en x-supa-jwt a secas, y lib/conditions.js dentro de su propio juego de cabeceras.
//
// POR QUÉ UN SOLO REINTENTO: un 401 significa que la petición NO se ejecutó, así que repetirla es seguro
// incluso en un POST. Pero si el segundo intento también falla, el token no es el problema y reintentar
// más solo alarga el bloqueo. El cuerpo se reenvía tal cual: en todas las llamadas del proyecto es una
// cadena de JSON.stringify, que se puede releer; con un stream habría que rehacerlo.
export async function fetchConSesion(url, opts = {}, conCabeceras) {
  const res = await fetch(url, { ...opts, headers: conCabeceras(getCurrentJwt()) })
  if (res.status !== 401 && res.status !== 403) return res

  const nuevo = await refrescaJwt()
  if (!nuevo) { _onSesionCaducada?.(); return res }

  const res2 = await fetch(url, { ...opts, headers: conCabeceras(nuevo) })
  if (res2.status === 401 || res2.status === 403) _onSesionCaducada?.()
  return res2
}
