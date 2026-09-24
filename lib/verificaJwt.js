// lib/verificaJwt.js — verificación REAL del JWT de sesión en las rutas de pages/api/.
//
// SOLO SERVIDOR. Usa node:crypto, así que no puede importarse desde el cliente.
//
// ─────────────────────────────────────────────────────────────────────────────
// POR QUÉ HACE FALTA VERIFICAR Y NO BASTA CON REENVIAR
// ─────────────────────────────────────────────────────────────────────────────
// Hoy las rutas hacen `Bearer ${jwt || CLAVE_ANONIMA}` y dejan que Supabase decida. Mientras el RLS esté
// apagado eso NO es un control: sin políticas que consultar, Postgres atiende igual con un token bueno,
// con uno caducado o sin ninguno, porque la `apikey` ya le da paso. Para que el candado exista antes del
// RLS, la ruta tiene que poder rechazar por sí misma, y para eso tiene que saber si el token es de verdad.
//
// ─────────────────────────────────────────────────────────────────────────────
// POR QUÉ JWKS Y NO auth.getUser()
// ─────────────────────────────────────────────────────────────────────────────
// Las dos opciones eran llamar a /auth/v1/user con el token —que Supabase valide— o verificar la firma
// aquí con la clave pública del proyecto. Elegida la segunda, por tres motivos:
//
//   1. NO AÑADE UNA PETICIÓN DE RED POR LLAMADA. getUser() obliga a un viaje extra a Supabase en CADA
//      petición a la API, y cachear el resultado de getUser significa cachear "este token es bueno", que
//      es justo lo que no conviene cachear. Aquí lo que se cachea es la CLAVE PÚBLICA, que es pública,
//      cambia muy de tarde en tarde y vale para todos los tokens.
//   2. NO AÑADE DEPENDENCIAS. El proyecto firma con ES256 (comprobado en el JWKS del proyecto: una clave,
//      alg ES256, kty EC) y node:crypto verifica ES256 sin ayuda de nadie. Meter `jose` en un despliegue
//      automático a producción es riesgo que no hace falta correr.
//   3. FUNCIONA SIN RED en el caso normal. Si Supabase no responde, un token ya verificado antes sigue
//      verificándose, porque la clave está en memoria.
//
// La contrapartida es que hay que saber de formatos: la firma ES256 de un JWT viene como R||S en crudo
// (64 bytes), mientras que node:crypto espera DER salvo que se le diga `dsaEncoding: 'ieee-p1363'`.
//
// ─────────────────────────────────────────────────────────────────────────────
// ESTE MÓDULO NUNCA LANZA
// ─────────────────────────────────────────────────────────────────────────────
// verificaJwt devuelve SIEMPRE un objeto con `estado`. Cualquier fallo —JWKS caído, red, token con una
// forma inesperada, un bug de aquí dentro— sale como un estado más, nunca como una excepción. Quien lo
// llama decide qué hacer; hoy, en modo auditoría, solo lo registra.

import crypto from 'crypto'

// Estados posibles. Son los que distingue el encargo, más los que hacen falta para que el registro de
// auditoría diga la verdad en vez de meterlo todo en "inválido".
export const JWT_SIN_TOKEN   = 'sin_token'      // no llegó la cabecera
export const JWT_MALFORMADO  = 'malformado'     // no tiene tres partes, o no son JSON/base64url
export const JWT_CADUCADO    = 'caducado'       // firma buena, exp pasado
export const JWT_FIRMA_MALA  = 'firma_invalida' // la firma no cuadra con la clave pública
export const JWT_CLAVE_DESC  = 'clave_desconocida'  // el kid no está en el JWKS (¿rotación?)
export const JWT_ALG_RARO    = 'alg_no_soportado'   // p.ej. HS256 heredado, que no se puede verificar sin el secreto
export const JWT_ERROR       = 'error_verificador'  // JWKS inalcanzable o fallo interno
export const JWT_VALIDO      = 'valido'

const SUPA_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ''

// ── Caché del JWKS ──────────────────────────────────────────────────────────
// Una sola descarga cada TTL_MS, compartida por todas las peticiones de la misma instancia. `enVuelo`
// evita que un arranque en frío con varias peticiones a la vez dispare varias descargas iguales.
const TTL_MS = 60 * 60 * 1000      // 1 hora: las claves de firma no cambian a menudo
const REINTENTO_MS = 60 * 1000     // tras un kid desconocido, no refrescar más de una vez por minuto
let _claves = null                 // Map kid -> KeyObject
let _traidoEn = 0
let _ultimoRefresco = 0
let _enVuelo = null

async function descargaJwks() {
  // CON PLAZO. Las rutas hacen `await` de esto antes de servir, asi que un JWKS que no conteste dejaria
  // la peticion colgada: el verificador pasaria de no bloquear nada a bloquearlo todo. Tres segundos, el
  // mismo plazo que el proyecto usa para Stooq. Si vence, sale como error_verificador y la ruta sigue.
  const res = await fetch(`${SUPA_URL}/auth/v1/.well-known/jwks.json`, { signal: AbortSignal.timeout(3000) })
  if (!res.ok) throw new Error(`JWKS HTTP ${res.status}`)
  const json = await res.json()
  const mapa = new Map()
  for (const jwk of (json?.keys || [])) {
    if (!jwk?.kid) continue
    try {
      // createPublicKey entiende el JWK tal cual: no hay que convertir nada a PEM a mano.
      mapa.set(jwk.kid, { key: crypto.createPublicKey({ key: jwk, format: 'jwk' }), alg: jwk.alg || '' })
    } catch (_) { /* una clave ilegible no invalida las demás */ }
  }
  return mapa
}

async function dameClaves(forzar = false) {
  const ahora = Date.now()
  if (!forzar && _claves && (ahora - _traidoEn) < TTL_MS) return _claves
  if (_enVuelo) return _enVuelo
  _enVuelo = (async () => {
    try {
      const mapa = await descargaJwks()
      if (mapa.size) { _claves = mapa; _traidoEn = Date.now() }
      return _claves
    } finally { _enVuelo = null }
  })()
  return _enVuelo
}

const b64url = (s) => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64')

// Verifica el JWT que venga en x-supa-jwt. NUNCA lanza.
// Devuelve { estado, userId?, motivo?, expEn? }.
export async function verificaJwt(req) {
  try {
    const token = req?.headers?.['x-supa-jwt']
    if (!token || typeof token !== 'string') return { estado: JWT_SIN_TOKEN }
    if (!SUPA_URL) return { estado: JWT_ERROR, motivo: 'sin SUPABASE_URL' }

    const partes = token.split('.')
    if (partes.length !== 3) return { estado: JWT_MALFORMADO, motivo: 'no tiene tres partes' }

    let cab, cuerpo
    try {
      cab = JSON.parse(b64url(partes[0]).toString('utf8'))
      cuerpo = JSON.parse(b64url(partes[1]).toString('utf8'))
    } catch (_) { return { estado: JWT_MALFORMADO, motivo: 'cabecera o cuerpo ilegibles' } }

    const alg = String(cab?.alg || '')
    // HS256 es el esquema heredado: se firma con el SECRETO del proyecto, que no está —ni debe estar— en
    // este repositorio. Se distingue de "firma inválida" a propósito: son cosas muy distintas y mezclarlas
    // haría creer que llegan tokens falsos cuando lo que llega es un token de otra época.
    if (alg !== 'ES256' && alg !== 'RS256') return { estado: JWT_ALG_RARO, motivo: alg || 'sin alg' }

    let claves = await dameClaves()
    if (!claves) return { estado: JWT_ERROR, motivo: 'JWKS no disponible' }
    let entrada = cab.kid ? claves.get(cab.kid) : null
    if (!entrada && Date.now() - _ultimoRefresco > REINTENTO_MS) {
      // kid desconocido: puede ser una rotación de claves. Se refresca UNA vez, con freno para que un
      // token basura en bucle no convierta esto en un ataque a nuestro propio proyecto.
      _ultimoRefresco = Date.now()
      claves = await dameClaves(true)
      entrada = cab.kid ? claves?.get(cab.kid) : null
    }
    if (!entrada) return { estado: JWT_CLAVE_DESC, motivo: cab.kid ? 'kid no publicado' : 'sin kid' }

    // ES256 en JWT = R||S en crudo. Sin dsaEncoding, node espera DER y toda firma buena saldría mala.
    const datos = Buffer.from(`${partes[0]}.${partes[1]}`, 'utf8')
    const firma = b64url(partes[2])
    const opciones = alg === 'ES256'
      ? { key: entrada.key, dsaEncoding: 'ieee-p1363' }
      : entrada.key
    let ok = false
    try { ok = crypto.verify('sha256', datos, opciones, firma) } catch (_) { ok = false }
    if (!ok) return { estado: JWT_FIRMA_MALA }

    // La caducidad se mira DESPUÉS de la firma: un token con exp manipulado no merece que se le crea el
    // exp. 30 s de holgura por desajustes de reloj entre Vercel y Supabase.
    const exp = Number(cuerpo?.exp || 0)
    if (!exp || (exp + 30) * 1000 < Date.now()) return { estado: JWT_CADUCADO, expEn: exp || null }

    return { estado: JWT_VALIDO, userId: cuerpo?.sub || null, expEn: exp }
  } catch (e) {
    // Red de seguridad. Si algo de aquí arriba falla de una forma que no previmos, la ruta que llame
    // recibe un estado, no una excepción, y sigue sirviendo.
    return { estado: JWT_ERROR, motivo: e?.message || 'fallo interno' }
  }
}

// Una línea por petición, con prefijo fijo para poder filtrarla en los logs de Vercel.
// NO se registra el token ni nada del usuario salvo su identificador.
export function registraAuth(ruta, req, resultado, accion) {
  try {
    const partes = [
      '[auth-audit]',
      'ruta=' + ruta,
      'metodo=' + (req?.method || '?'),
      accion ? 'accion=' + accion : null,
      'estado=' + (resultado?.estado || '?'),
      resultado?.userId ? 'user=' + resultado.userId : null,
      resultado?.motivo ? 'motivo=' + String(resultado.motivo).slice(0, 60) : null,
    ].filter(Boolean)
    console.log(partes.join(' '))
  } catch (_) { /* el registro jamás puede tumbar una petición */ }
}

// Azúcar para las rutas: verifica, registra y devuelve el resultado. Nunca lanza.
export async function auditaAuth(ruta, req, accion) {
  let r
  try { r = await verificaJwt(req) } catch (e) { r = { estado: JWT_ERROR, motivo: e?.message || 'fallo' } }
  registraAuth(ruta, req, r, accion)
  return r
}
