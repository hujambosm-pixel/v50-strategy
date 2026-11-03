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

export const AYUDA_ADJUNTOS = 'Guarda aquí guías en PDF, capturas o tus hojas de Excel. Las imágenes y los PDF se ven dentro de la app; Word y Excel se descargan para abrirlos en tu PC. Los archivos viven en la nube de la app, no en tu ordenador. Máximo 50 MB por archivo y 1 GB en total. Ejemplo: una guía de 24 páginas en PDF suele ocupar entre 2 y 20 MB.'
export const AYUDA_GUARDAR_PDF = 'En Word: Archivo › Guardar como › Tipo: PDF › Guardar. Después, en la tesis, «+ Añadir archivos» y elige el PDF. Igual con Excel.'
// La etiqueta de un archivo: su extensión en mayúsculas; PDF rojo, Word azul, Excel verde, el resto gris.
export function etiquetaTipo(nombre) {
  const e = extensionDe(nombre)
  return { texto: e ? e.toUpperCase() : 'ARCHIVO', color: e === 'pdf' ? '#d1242f' : ['doc', 'docx'].includes(e) ? '#1f6feb' : ['xls', 'xlsx'].includes(e) ? '#1a7f37' : '#57606a' }
}
// Para «Los archivos de … no se ven dentro de la app».
export function nombreDocumento(nombre) {
  const e = extensionDe(nombre)
  return ['doc', 'docx'].includes(e) ? 'Word' : ['xls', 'xlsx'].includes(e) ? 'Excel' : ['ppt', 'pptx'].includes(e) ? 'PowerPoint' : e === 'csv' ? 'CSV' : e === 'txt' ? 'texto' : 'este tipo'
}
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`
// El añadido al aviso de borrar una tesis; null si no tiene archivos. r: lo de esa tesis en resumenArchivos.
export function avisoBorrarTesis(r) {
  if (!r || !(r.adjuntos + r.imagenes)) return null
  const partes = [r.adjuntos ? plural(r.adjuntos, 'adjunto', 'adjuntos') : null, r.imagenes ? plural(r.imagenes, 'imagen del texto', 'imágenes del texto') : null].filter(Boolean)
  return `Se borran también sus ${partes.join(' y ')} (${tamanoLegible(r.bytes)} en total). No se puede recuperar.`
}
// El color de la barra de espacio usado: verde, ámbar desde el 80 % y roja desde el 95 %.
export const colorEspacio = (bytes) => { const p = Number(bytes) / MAX_TOTAL; return p >= 0.95 ? '#f85149' : p >= 0.8 ? '#d4a72c' : '#3fb950' }
export const porcentajeEspacio = (bytes) => Math.min(100, Math.max(0, (Number(bytes) / MAX_TOTAL) * 100))

// «Leer al lado del texto»: cerrado al entrar y al cambiar de tesis; ya no se recuerda. Solo con la ventana ancha.
export const ANCHO_MIN_LADO = 1100
// Lista, texto y panel a la vez: 360 + 480 (lo mínimo para el texto) + 560, dos huecos de 16, los márgenes de la página (20 y 20) y su barra de desplazamiento (18).
export const ANCHO_MIN_TEXTO = 480
export const ANCHO_TRES_COLUMNAS = 360 + ANCHO_MIN_TEXTO + 560 + 2 * 16 + 2 * 20 + 18
// Con el panel abierto, ¿la lista de tesis plegada? Manda lo pulsado con ≡ ('abierta' o 'plegada'); sin pulsar (null), plegada solo si no caben las tres columnas.
export const listaPlegadaDe = (ancho, elegida) => elegida == null ? ancho < ANCHO_TRES_COLUMNAS : elegida === 'plegada'
// La clave con la que antes se recordaba: se quita para que no estorbe (si no se puede, sin más).
export const olvidaAlLadoViejo = (almacen) => { try { (almacen ?? window.localStorage).removeItem('tesis_adjuntos_al_lado') } catch (_) {} }

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
// Storage responde bien aunque no borre nada (sin permiso, una lista vacía): devuelve las rutas pedidas que NO están en su lista de borrados.
async function borraDelBucket({ url, headers, fetch: f = fetch }, prefixes) {
  const r = await f(`${url}/storage/v1/object/${BUCKET}`, { method: 'DELETE', headers: conJson(headers), body: JSON.stringify({ prefixes }) })
  const j = await jsonDe(r, 'borrar el archivo')
  const borrados = new Set((Array.isArray(j) ? j : []).map(x => x?.name))
  return prefixes.filter(x => !borrados.has(x))
}
// De las rutas que Storage no ha confirmado, las que siguen en el bucket (o no se sabe). Solo se dan por desaparecidas las de la carpeta del propio usuario y si la firma en
// lote dice que no existen: esa respuesta es la misma sin permiso, así que lo ajeno nunca cuenta como desaparecido. Si no se puede comprobar, siguen.
export const SIN_ARCHIVO = /object does not exist/i
async function rutasQueSiguen(ctx, rutas) {
  const { url, headers, fetch: f = fetch } = ctx, usuario = usuarioDe(ctx)
  const propias = usuario ? rutas.filter(x => x.startsWith(`${usuario}/`)) : []
  if (!propias.length) return rutas
  try {
    const r = await f(`${url}/storage/v1/object/sign/${BUCKET}`, { method: 'POST', headers: conJson(headers), body: JSON.stringify({ expiresIn: 60, paths: propias }) })
    const j = await jsonDe(r, 'comprobar los archivos')
    const fuera = new Set((Array.isArray(j) ? j : []).filter(x => !x?.signedURL && SIN_ARCHIVO.test(x?.error || '')).map(x => x.path))
    return rutas.filter(x => !fuera.has(x))
  } catch (_) { return rutas }
}
// «No se pudo borrar el archivo «a.pdf».»; con varios, hasta tres nombres.
function avisoNoBorrados(filas) {
  if (filas.length === 1) return `No se pudo borrar el archivo «${filas[0].nombre}».`
  const resto = filas.length - 3
  return `No se pudieron borrar ${filas.length} archivos: ${filas.slice(0, 3).map(x => `«${x.nombre}»`).join(', ')}${resto > 0 ? ` y ${resto} más` : ''}.`
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
// Primero el archivo, luego la fila: el archivo que el bucket no borre conserva su fila (no queda huérfano y se puede reintentar) y da error; los que sí, pierden la suya.
// Un archivo que ya no estaba cuenta como borrado: su fila se va, sin error.
// Devuelve cuántos se han borrado de verdad; si falta alguno, lanza el error.
export async function borrar(ctx, filas) {
  const xs = (filas || []).filter(Boolean)
  if (!xs.length) return 0
  const { url, headers, fetch: f = fetch } = ctx
  const sinConfirmar = await borraDelBucket(ctx, xs.map(x => x.ruta))
  const faltan = new Set(sinConfirmar.length ? await rutasQueSiguen(ctx, sinConfirmar) : [])
  const hechos = xs.filter(x => !faltan.has(x.ruta)), noBorrados = xs.filter(x => faltan.has(x.ruta))
  if (hechos.length) {
    const r = await f(`${url}/rest/v1/tesis_adjuntos?id=in.(${hechos.map(x => Number(x.id)).join(',')})`, { method: 'DELETE', headers: { ...headers, Prefer: 'return=representation' } })
    const j = await jsonDe(r, 'borrar la fila del archivo')
    const n = Array.isArray(j) ? j.length : 0
    if (n !== hechos.length) throw new Error(`No se pudo borrar la fila del archivo: se pedían ${hechos.length} y se han borrado ${n}.`)
  }
  if (noBorrados.length) throw new Error(avisoNoBorrados(noBorrados))
  return hechos.length
}
export async function borrarTodoDeTesis(ctx, tesisId) {
  let total = 0
  for (;;) {
    const xs = await listar(ctx, tesisId)
    const n = await borrar(ctx, xs)
    total += n
    if (xs.length < POR_PAGINA) return total
    if (!n) throw new Error('No se pudieron borrar los archivos de la tesis.')   // nunca en bucle
  }
}
