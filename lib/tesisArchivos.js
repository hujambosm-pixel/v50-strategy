// lib/tesisArchivos.js — las IMÁGENES y los ADJUNTOS de una tesis (docs/tesis.md, «Imágenes y adjuntos»; tabla tesis_adjuntos y bucket privado
// tesis-archivos, sql/tesis_adjuntos.sql): subir, listar, firmar, descargar y borrar, con la API REST de Storage y PostgREST (la RLS deja ver y
// tocar solo lo del usuario), y las piezas puras (tamaños, tipos, límites, avisos). No toca el motor ni ninguna cifra.
//   ctx: { url, headers, fetch } — ctxConSesion() de lib/supabase.js, como lib/tesis.js.
export const BUCKET = 'tesis-archivos'
export const MAX_ARCHIVO = 52428800     // 50 MB, como la tabla y el bucket
export const MAX_TOTAL = 1073741824     // 1 GB entre todas las tesis
export const AVISO_SIN_GUARDAR = 'Guarda la tesis antes de añadir archivos.'
export const AVISO_TIPO = 'Ese tipo de archivo no se puede añadir.'

// ── Piezas puras ──
const MIMES = Object.freeze({
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', pdf: 'application/pdf',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  csv: 'text/csv', txt: 'text/plain',
})
const DE_IMAGEN = Object.freeze({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' })
export const ACEPTA_IMAGENES = Object.keys(DE_IMAGEN).join(',')
export const ACEPTA_ARCHIVOS = Object.keys(MIMES).map(x => `.${x}`).join(',')
export const extensionDe = (nombre) => { const m = /\.([a-z0-9]{1,8})$/i.exec(String(nombre ?? '').trim()); return m ? m[1].toLowerCase() : '' }
// La extensión con la que se guarda y su tipo: manda la del nombre; una captura pegada sin extensión, la de su tipo. null: ese tipo no se admite (svg y html, nunca).
export function tipoDe(nombre, mime = '') {
  const e = extensionDe(nombre)
  if (MIMES[e]) return { extension: e, mime: MIMES[e] }
  if (!e && DE_IMAGEN[mime]) return { extension: DE_IMAGEN[mime], mime }
  return null
}
export const esImagenAdmitida = (nombre, mime = '') => /^image\//.test(tipoDe(nombre, mime)?.mime || '')
// Cómo se ve dentro de la app: 'imagen', 'pdf' o 'descargar' (Word, Excel y demás).
export function visorDe(nombre) {
  const e = extensionDe(nombre)
  if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(e)) return 'imagen'
  return e === 'pdf' ? 'pdf' : 'descargar'
}
const unDecimal = (x) => (Math.round(x * 10) / 10).toString().replace('.', ',').replace(/,0$/, '')
// «85 KB», «1,1 MB», «1,2 GB»: base 1024 y coma decimal.
export function tamanoLegible(bytes) {
  const b = Math.max(0, Number(bytes) || 0)
  if (b < 1024) return `${b} bytes`
  if (b < 1048576) { const kb = Math.round(b / 1024); return kb < 1024 ? `${kb} KB` : '1 MB' }
  if (b < 1073741824) { const mb = unDecimal(b / 1048576); return mb === '1024' ? '1 GB' : `${mb} MB` }
  return `${unDecimal(b / 1073741824)} GB`
}
// ¿Cabe? null si sí; si no, 'vacio', 'archivo' (más de 50 MB) o 'total' (se pasaría de 1 GB).
export function cabe(bytes, usados = 0) {
  if (!(Number(bytes) > 0)) return 'vacio'
  if (bytes > MAX_ARCHIVO) return 'archivo'
  return Number(usados) + Number(bytes) > MAX_TOTAL ? 'total' : null
}
export const avisoPesa = (nombre, bytes) => `⚠ «${nombre}» pesa ${tamanoLegible(bytes)}: el máximo por archivo es 50 MB.`
export const avisoEspacio = (usados) => `⚠ No queda espacio: usas ${tamanoLegible(usados)} de 1 GB. Borra adjuntos que no necesites.`
export const avisoVacio = (nombre) => `⚠ «${nombre}» está vacío.`
// El aviso de un archivo que no se puede añadir (null si se puede).
export function avisoDe(archivo, usados = 0) {
  if (!tipoDe(archivo.name, archivo.type)) return AVISO_TIPO
  const no = cabe(archivo.size, usados)
  return no === 'vacio' ? avisoVacio(archivo.name) : no === 'archivo' ? avisoPesa(archivo.name, archivo.size) : no === 'total' ? avisoEspacio(usados) : null
}
// El nombre original se guarda en la tabla, con sus tildes y hasta 200 caracteres (sin perder la extensión); en la ruta, nunca.
export function nombreLimpio(nombre) {
  const n = String(nombre ?? '').trim().replace(/\s+/g, ' ') || 'archivo'
  if (n.length <= 200) return n
  const e = extensionDe(n)
  return e ? `${n.slice(0, 199 - e.length).trimEnd()}.${e}` : n.slice(0, 200)
}
export const carpetaDe = (usuario, tesisId, clase) => `${usuario}/${Number(tesisId)}/${clase}/`
// El usuario del token de la sesión (su «sub»), para la carpeta: la que manda de verdad es la RLS, que lo saca del mismo token. null si no hay sesión.
export function usuarioDe(ctx) {
  try {
    const parte = String(ctx.headers?.Authorization || '').replace(/^Bearer\s+/i, '').split('.')[1]
    const crudo = atob(parte.replace(/-/g, '+').replace(/_/g, '/'))
    return JSON.parse(decodeURIComponent(escape(crudo))).sub || null
  } catch (_) { return null }
}
// Cuántos adjuntos e imágenes tiene cada tesis y cuánto ocupan. filas: [{ tesis_id, clase, bytes }] de todas las tesis.
export function resumenArchivos(filas = []) {
  const porTesis = {}
  let bytes = 0
  for (const f of filas) {
    const b = Number(f.bytes) || 0, t = (porTesis[f.tesis_id] ||= { adjuntos: 0, imagenes: 0, bytes: 0 })
    bytes += b; t.bytes += b
    if (f.clase === 'imagen') t.imagenes++; else t.adjuntos++
  }
  return { bytes, porTesis }
}

// Las URL firmadas de las imágenes que se ven en pantalla, para el editor: cada imagen pide la suya y salen todas juntas en un solo lote. Si una caduca
// (la hora) o falla, se pide una vez más. firma(rutas) → { ruta: url }. oye(fn): fn() en cada cambio; devuelve cómo dejar de oír.
export function tiendaUrls(firma) {
  const urls = new Map(), oyentes = new Set(), pendientes = new Set(), rotas = new Set(), renovadas = new Set()
  let enCola = false
  const avisa = () => { for (const fn of [...oyentes]) fn() }
  const vuelta = async () => {
    enCola = false
    const rutas = [...pendientes]; pendientes.clear()
    let mapa = {}
    try { mapa = await firma(rutas) } catch (_) {}
    for (const r of rutas) { if (mapa[r]) { urls.set(r, mapa[r]); rotas.delete(r) } else rotas.add(r) }
    avisa()
  }
  const encola = (r) => { pendientes.add(r); if (!enCola) { enCola = true; Promise.resolve().then(vuelta) } }
  return {
    url: (r) => urls.get(r) || null,
    rota: (r) => rotas.has(r),
    pide: (r) => { if (!urls.has(r) && !rotas.has(r)) encola(r) },
    pon: (r, u) => { urls.set(r, u); rotas.delete(r); avisa() },
    fallo: (r) => { urls.delete(r); if (renovadas.has(r)) { rotas.add(r); avisa() } else { renovadas.add(r); encola(r) } },
    oye: (fn) => { oyentes.add(fn); return () => oyentes.delete(fn) },
  }
}

// ── La base y el bucket ──
const COLUMNAS = 'id,tesis_id,clase,ruta,nombre,tipo,bytes,created_at'
const POR_PAGINA = 1000
const jsonDe = async (r, que) => { if (!r.ok) { let m = ''; try { m = (await r.json())?.message || '' } catch (_) {} throw new Error(`No se pudo ${que} (HTTP ${r.status}${m ? `: ${m}` : ''}).`) } return r.status === 204 ? null : r.json() }
const conJson = (headers) => ({ ...headers, 'Content-Type': 'application/json' })
const urlObjeto = (url, ruta) => `${url}/storage/v1/object/${BUCKET}/${ruta}`

// La subida, con su progreso (fetch no lo da: XMLHttpRequest). Si el token ha caducado (401/403), una vez más por ctx.fetch, que renueva la sesión.
function conProgreso(destino, headers, archivo, alProgreso) {
  return new Promise((bien, mal) => {
    const x = new XMLHttpRequest()
    x.open('POST', destino)
    for (const [k, v] of Object.entries(headers)) x.setRequestHeader(k, v)
    x.upload.onprogress = (e) => { if (e.lengthComputable) alProgreso(e.loaded / e.total) }
    x.onerror = () => mal(new Error('No se pudo subir el archivo: sin conexión.'))
    x.onload = () => bien({ ok: x.status >= 200 && x.status < 300, status: x.status, json: async () => JSON.parse(x.responseText) })
    x.send(archivo)
  })
}
async function enviaArchivo({ url, headers, fetch: f = fetch }, ruta, archivo, mime, alProgreso) {
  const destino = urlObjeto(url, ruta), cabeceras = { ...headers, 'Content-Type': mime, 'x-upsert': 'false', 'cache-control': 'max-age=3600' }
  if (alProgreso && typeof XMLHttpRequest !== 'undefined') {
    const r = await conProgreso(destino, cabeceras, archivo, alProgreso)
    if (r.status !== 401 && r.status !== 403) return r
  }
  return f(destino, { method: 'POST', headers: cabeceras, body: archivo })
}
async function borraDelBucket({ url, headers, fetch: f = fetch }, prefixes) {
  const r = await f(`${url}/storage/v1/object/${BUCKET}`, { method: 'DELETE', headers: conJson(headers), body: JSON.stringify({ prefixes }) })
  return jsonDe(r, 'borrar el archivo')
}
// Sube el archivo y crea su fila; si la fila falla, borra lo subido. Devuelve la fila.
export async function subir(ctx, { tesisId, clase, archivo, alProgreso = null }) {
  const { url, headers, fetch: f = fetch } = ctx
  const tipo = tipoDe(archivo.name, archivo.type)
  if (!tipo) throw new Error(AVISO_TIPO)
  const usuario = usuarioDe(ctx)
  if (!usuario) throw new Error('No se pudo subir el archivo: no hay sesión.')
  const ruta = `${carpetaDe(usuario, tesisId, clase)}${globalThis.crypto.randomUUID()}.${tipo.extension}`
  await jsonDe(await enviaArchivo(ctx, ruta, archivo, tipo.mime, alProgreso), `subir «${archivo.name}»`)
  try {
    const r = await f(`${url}/rest/v1/tesis_adjuntos?select=${COLUMNAS}`, { method: 'POST', headers: { ...conJson(headers), Prefer: 'return=representation' },
      body: JSON.stringify({ tesis_id: Number(tesisId), clase, ruta, nombre: nombreLimpio(archivo.name), tipo: tipo.mime, bytes: archivo.size }) })
    const j = await jsonDe(r, `guardar «${archivo.name}»`)
    return Array.isArray(j) ? j[0] : j
  } catch (e) {
    try { await borraDelBucket(ctx, [ruta]) } catch (_) {}
    throw e
  }
}
// Los archivos de una tesis, el más reciente primero.
export async function listar({ url, headers, fetch: f = fetch }, tesisId) {
  const r = await f(`${url}/rest/v1/tesis_adjuntos?select=${COLUMNAS}&tesis_id=eq.${Number(tesisId)}&order=created_at.desc,id.desc&limit=${POR_PAGINA}`, { headers })
  return jsonDe(r, 'leer los archivos de la tesis')
}
// { tesis_id, clase, bytes } de TODOS los archivos del usuario, por páginas (la base da 1000 de una vez).
export async function filasDeTodas({ url, headers, fetch: f = fetch }) {
  const filas = []
  for (let desde = 0; ; desde += POR_PAGINA) {
    const r = await f(`${url}/rest/v1/tesis_adjuntos?select=tesis_id,clase,bytes&order=id.asc&limit=${POR_PAGINA}&offset=${desde}`, { headers })
    const xs = await jsonDe(r, 'leer el espacio usado')
    filas.push(...xs)
    if (xs.length < POR_PAGINA) return filas
  }
}
export const espacioUsado = async (ctx) => resumenArchivos(await filasDeTodas(ctx)).bytes
export async function urlFirmada({ url, headers, fetch: f = fetch }, ruta, segundos = 3600) {
  const r = await f(`${url}/storage/v1/object/sign/${BUCKET}/${ruta}`, { method: 'POST', headers: conJson(headers), body: JSON.stringify({ expiresIn: segundos }) })
  const j = await jsonDe(r, 'preparar el archivo')
  return `${url}/storage/v1${j.signedURL}`
}
// En lote: { ruta: url }. Lo que no se pueda firmar (no existe o no es suyo) no sale.
export async function urlsFirmadas({ url, headers, fetch: f = fetch }, rutas, segundos = 3600) {
  const paths = [...new Set(rutas)]
  if (!paths.length) return {}
  const r = await f(`${url}/storage/v1/object/sign/${BUCKET}`, { method: 'POST', headers: conJson(headers), body: JSON.stringify({ expiresIn: segundos, paths }) })
  const j = await jsonDe(r, 'preparar los archivos')
  const sal = {}
  for (const x of j) if (x.signedURL && !x.error) sal[x.path] = `${url}/storage/v1${x.signedURL}`
  return sal
}
export const urlDescarga = (firmada, nombre) => `${firmada}${firmada.includes('?') ? '&' : '?'}download=${encodeURIComponent(nombre)}`
const descargaEnNavegador = (u) => { const a = document.createElement('a'); a.href = u; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove() }
// Lo descarga con su NOMBRE ORIGINAL (el bucket lo pone al responder, por el «download» de la URL).
export async function descargar(ctx, fila, abre = descargaEnNavegador) {
  const u = urlDescarga(await urlFirmada(ctx, fila.ruta, 300), fila.nombre)
  abre(u)
  return u
}
// Primero el archivo, luego la fila: si el bucket falla, la fila sigue y se puede reintentar.
export async function borrar(ctx, filas) {
  const xs = (filas || []).filter(Boolean)
  if (!xs.length) return 0
  const { url, headers, fetch: f = fetch } = ctx
  await borraDelBucket(ctx, xs.map(x => x.ruta))
  const r = await f(`${url}/rest/v1/tesis_adjuntos?id=in.(${xs.map(x => Number(x.id)).join(',')})`, { method: 'DELETE', headers })
  await jsonDe(r, 'borrar la fila del archivo')
  return xs.length
}
export async function borrarTodoDeTesis(ctx, tesisId) {
  let total = 0
  for (;;) {
    const xs = await listar(ctx, tesisId)
    total += await borrar(ctx, xs)
    if (xs.length < POR_PAGINA) return total
  }
}
