// lib/tesis.js — las TESIS DE INVERSIÓN de la pantalla «Tesis» (V9.1092, components/TesisPanel.js; tabla tesis_inversion,
// sql/tesis_inversion.sql; docs/tesis.md): leer, crear, cambiar, marcar revisada y borrar las del usuario (la RLS deja ver y tocar
// solo las suyas), y las piezas puras de la pantalla (estados, filtros, búsqueda, fechas en hora de Madrid, salir sin guardar) y del editor (V9.1093: colores, texto plano ↔ HTML,
// pegado). No toca el motor ni ninguna cifra. TipTap NO se importa aquí: va solo en components/TesisEditor.js, que se carga aparte.
//   ctx: { url, headers, fetch } — ctxConSesion() de lib/supabase.js (el token vigente en cada llamada y reintento ante 401).
import { coincide, sinTildes, trozosResaltados } from './builder/buscar'

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
export const AYUDA_RELACIONADO = 'Enlaza estrategias o planes que tengan que ver con esta tesis. «Abrir» lleva a la estrategia en el paso 1 o al plan en el paso 3; y desde allí, «💡 …» vuelve aquí. Ejemplo: «Plan · Cruce de medias / oro» abre esa pestaña en el Builder.'
export const AVISO_IMAGENES_PEGADAS = 'Las imágenes pegadas junto con texto no se copian: pégalas una a una.'
export const TAMANOS_IMAGEN = Object.freeze([{ id: 'pequena', nombre: 'Pequeña', ancho: 33 }, { id: 'mediana', nombre: 'Mediana', ancho: 60 }, { id: 'ancho', nombre: 'Ancho completo', ancho: 100 }])
export const tamanoImagen = (id) => (TAMANOS_IMAGEN.some(t => t.id === id) ? id : 'mediana')
// La «hoja» del editor (gris, para cansar menos la vista) y sus colores: docs/tesis.md. scripts/comprobaciones/tesis.js mide los contrastes.
export const HOJA = Object.freeze({ fondo: '#2a2e35', texto: '#d4d7dc', titulo: '#eceef1', enlace: '#9cc2f9', borde: '#4a505a', cabecera: '#363b44', apagado: '#a3a9b3', recuadroFondo: '#3a3424', recuadroBorde: '#d4a72c' })
export const COLORES_LETRA = Object.freeze([
  { nombre: 'Rojo', color: '#ffaaa3' }, { nombre: 'Naranja', color: '#f5b26b' }, { nombre: 'Amarillo', color: '#f2d675' }, { nombre: 'Verde', color: '#8fdc9c' },
  { nombre: 'Turquesa', color: '#7fdbd0' }, { nombre: 'Azul', color: '#9cc2f9' }, { nombre: 'Violeta', color: '#c9b1f7' }, { nombre: 'Rosa', color: '#f5aad2' },
])
export const COLORES_RESALTE = Object.freeze([
  { nombre: 'Ámbar', color: '#5a4a1c' }, { nombre: 'Verde', color: '#1f4d38' }, { nombre: 'Azul', color: '#1f4066' }, { nombre: 'Rosa', color: '#5c2c49' },
])

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
  const r = await f(`${url}/rest/v1/tesis_inversion?select=${COLUMNAS}&order=revisada_en.desc.nullslast,id.desc&limit=1000`, { headers })
  return jsonDe(r, 'leer tus tesis')
}
// Crear y guardar cambios NO tocan las fechas: una nueva nace sin revisar (revisada_en vacía) y created_at lo pone la base y no cambia nunca.
export async function crearTesis({ url, headers, fetch: f = fetch }, borrador) {
  const r = await f(`${url}/rest/v1/tesis_inversion?select=${COLUMNAS}`, { method: 'POST', headers: conJson(headers), body: JSON.stringify(camposDe(borrador)) })
  return una(await jsonDe(r, 'guardar la tesis'))
}
export async function cambiarTesis({ url, headers, fetch: f = fetch }, id, borrador) {
  const r = await f(`${url}/rest/v1/tesis_inversion?id=eq.${Number(id)}&select=${COLUMNAS}`, { method: 'PATCH', headers: conJson(headers), body: JSON.stringify(camposDe(borrador)) })
  const j = una(await jsonDe(r, 'guardar los cambios'))
  if (!j) throw new Error('No se pudo guardar los cambios: la tesis ya no existe.')
  return j
}
// «Marcar como revisada hoy»: lo ÚNICO que cambia revisada_en; solo esa columna, sin tocar el texto.
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

// Los enlaces en los dos sentidos (docs/tesis.md, «Relacionado en los dos sentidos»): lo justo para saber qué tesis enlazan qué, sin el texto. Solo se lee.
export async function listarEnlacesTesis({ url, headers, fetch: f = fetch }) {
  const r = await f(`${url}/rest/v1/tesis_inversion?select=id,titulo,relacionados,created_at,updated_at,revisada_en&order=revisada_en.desc.nullslast,id.desc&limit=1000`, { headers })
  return jsonDe(r, 'leer tus tesis')
}

// ── Piezas puras de la pantalla ──
// Por la última revisión; las aún sin revisar, por cuándo se crearon.
const momento = (t) => new Date(t.revisada_en || t.created_at || 0).getTime()
export const ordenTesis = (xs) => [...xs].sort((a, b) => momento(b) - momento(a) || Number(b.id) - Number(a.id))
// Por defecto, solo en los títulos; con enTexto, también en el texto visible (nunca en las etiquetas ni en las direcciones de los enlaces).
export const buscaTesis = (xs, consulta, enTexto = false) => xs.filter(t => enTexto ? coincide(consulta, t.titulo, textoSinEtiquetas(t.texto)) : coincide(consulta, t.titulo))
// El trozo de texto de una tesis que aparece por su texto: [{ t, marca }] para la línea bajo el título, con lo buscado marcado. null si
// todas las palabras están en el título (se resaltan allí) o no están en el texto.
export function lineaCoincidencia(t, consulta, antes = 30, despues = 40) {
  const enTitulo = sinTildes(t.titulo)
  const faltan = sinTildes(consulta).split(/\s+/).filter(p => p && !enTitulo.includes(p))
  if (!faltan.length) return null
  const visible = textoSinEtiquetas(t.texto).normalize('NFC').replace(/\s+/g, ' ').trim()
  const plano = visible.split('').map(ch => sinTildes(ch).charAt(0) || ch).join('')   // un carácter por carácter, como trozosResaltados
  const halladas = faltan.map(p => [plano.indexOf(p), p.length]).filter(x => x[0] >= 0).sort((a, b) => a[0] - b[0])
  if (!halladas.length) return null
  const [i, largo] = halladas[0]
  let ini = Math.max(0, i - antes), fin = Math.min(visible.length, i + largo + despues)
  if (ini > 0) { const e = visible.indexOf(' ', ini); if (e >= 0 && e < i) ini = e + 1 }   // sin cortar palabras, si hay un espacio a mano
  if (fin < visible.length) { const e = visible.lastIndexOf(' ', fin); if (e >= i + largo) fin = e }
  return trozosResaltados(`${ini > 0 ? '…' : ''}${visible.slice(ini, fin)}${fin < visible.length ? '…' : ''}`, consulta)
}
// «Buscar también en el texto» se recuerda en este navegador (si no se puede leer o escribir, apagado y sin más).
const CLAVE_EN_TEXTO = 'tesis_buscar_en_texto'
export const leeBuscarEnTexto = (almacen) => { try { return (almacen ?? window.localStorage).getItem(CLAVE_EN_TEXTO) === '1' } catch (_) { return false } }
export const guardaBuscarEnTexto = (v, almacen) => { try { (almacen ?? window.localStorage).setItem(CLAVE_EN_TEXTO, v ? '1' : '0') } catch (_) {} }
// La respuesta a «Tienes cambios sin guardar…». 'sigue': se ha continuado; 'fallo': guardar ha fallado y NO se continúa; 'queda': cancelado.
export async function respondeSalida(que, { guardar, descartar, seguir }) {
  if (que === 'cancelar') return 'queda'
  if (que === 'guardar') { if (!(await guardar())) return 'fallo' } else descartar()
  seguir?.()
  return 'sigue'
}
export function cuentasTesis(xs) {
  const c = { todas: xs.length }
  for (const e of ESTADOS_TESIS) c[e.id] = xs.filter(t => t.estado === e.id).length
  return c
}
// Las fechas se muestran SIEMPRE en hora de Madrid, esté donde esté el ordenador (la base las guarda en UTC).
const FORMATO_MADRID = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
const enMadrid = (d) => { const x = new Date(d); if (Number.isNaN(x.getTime())) return null; const p = {}; for (const { type, value } of FORMATO_MADRID.formatToParts(x)) p[type] = value; return p }
const diaMadrid = (d) => { const p = enMadrid(d); return p ? Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day)) : NaN }
export const diasEntre = (antes, ahora) => Math.round((diaMadrid(ahora) - diaMadrid(antes)) / 86400000)
const haceDias = (n) => n <= 0 ? 'hoy' : n === 1 ? 'ayer' : `hace ${n} días`
// «creada hoy» / «creada hace X días» si aún no se ha revisado; si no, «revisada hoy» / «revisada hace X días».
export function haceTexto(t, ahora = new Date()) {
  return t.revisada_en ? `revisada ${haceDias(diasEntre(t.revisada_en, ahora))}` : `creada ${haceDias(diasEntre(t.created_at, ahora))}`
}
export function fechaCorta(d) {
  const p = d ? enMadrid(d) : null
  return p ? `${p.day}/${p.month}/${p.year}` : '—'
}
// Con la hora, para el tooltip: «01/11/2026 a las 00:21».
export function fechaHora(d) {
  const p = d ? enMadrid(d) : null
  return p ? `${p.day}/${p.month}/${p.year} a las ${p.hour}:${p.minute}` : '—'
}
// Un enlace con su nombre de ahora (o borrado: la estrategia o el plan ya no está).
export function fichaDe(r, estrategias = [], planes = []) {
  const lista = r.tipo === 'plan' ? planes : estrategias
  const x = lista.find(e => String(e.id) === String(r.id))
  return { ...r, etiqueta: r.tipo === 'plan' ? 'Plan' : 'Estrategia', nombre: x ? (x.nombre ?? x.name ?? `#${r.id}`) : null, borrado: !x, fila: x || null }
}
// Lo que dice el icono de enlace de la lista: los enlaces que aún existen (uno borrado no cuenta) y su tooltip.
export function cuentaRelacionados(relacionados, estrategias = [], planes = []) {
  const vivos = (Array.isArray(relacionados) ? relacionados : []).filter(r => (r?.tipo === 'estrategia' || r?.tipo === 'plan') && !fichaDe(r, estrategias, planes).borrado)
  const p = vivos.filter(r => r.tipo === 'plan').length, e = vivos.length - p
  const es = e === 1 ? '1 estrategia' : `${e} estrategias`, ps = p === 1 ? '1 plan' : `${p} planes`
  const pista = e && p ? `${es} y ${ps} relacionados` : e ? `${es} ${e === 1 ? 'relacionada' : 'relacionadas'}` : p ? `${ps} ${p === 1 ? 'relacionado' : 'relacionados'}` : ''
  return { total: vivos.length, estrategias: e, planes: p, pista }
}
// Las tesis que enlazan DIRECTAMENTE esa estrategia o ese plan (la más reciente primero). Un plan sin guardar (id null) no tiene ninguna.
export const tesisDe = (tesis, tipo, id) => id == null ? [] : ordenTesis((tesis || []).filter(t => (Array.isArray(t.relacionados) ? t.relacionados : []).some(r => r?.tipo === tipo && String(r.id) === String(id))))
export const igualesTesis = (a, b) => JSON.stringify(camposDe(a)) === JSON.stringify(camposDe(b)) && String(a.titulo ?? '') === String(b.titulo ?? '')

// ── Piezas puras del editor (V9.1093, components/TesisEditor.js; docs/tesis.md) ──
const escapa = (s) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
// ¿Lo guardado es HTML del editor o texto plano de antes de V9.1093? El editor siempre guarda bloques enteros: empieza por una etiqueta de bloque (o por una imagen suya) y acaba en «>».
export const esHtmlTesis = (s) => /^\s*(<(p|h[1-6]|ul|ol|table|div|hr|blockquote|pre)(\s[^>]*)?\/?>|<img data-archivo=")/i.test(String(s ?? '')) && />\s*$/.test(String(s ?? ''))
// Lo que recibe el editor al abrir: el HTML tal cual; el texto plano, escapado y con cada línea en su párrafo.
export function textoAHtml(s) {
  const t = String(s ?? '')
  if (!t || esHtmlTesis(t)) return t
  return t.split(/\r\n|\r|\n/).map(l => l ? `<p>${escapa(l)}</p>` : '<p></p>').join('')
}
const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
// El texto sin etiquetas, para buscar y para cualquier vista previa (nada de lo que hay dentro se interpreta). El texto plano, tal cual.
export function textoSinEtiquetas(s) {
  const t = String(s ?? '')
  if (!esHtmlTesis(t)) return t
  return t.replace(/<\/(p|h[1-6]|li|td|th|tr|div|ul|ol|table|blockquote|pre)>|<(br|hr)\b[^>]*>/gi, ' ')
    .replace(/<\/?[a-z](?:[^>"']|"[^"]*"|'[^']*')*>/gi, '')
    .replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi, (m, d, h, n) => d ? String.fromCodePoint(Number(d)) : h ? String.fromCodePoint(parseInt(h, 16)) : (ENTIDADES[n.toLowerCase()] ?? m))
    .replace(/\s+/g, ' ').trim()
}
// Lo que el editor pasa a la pantalla tras un cambio. base = { html, valor }: el contenido al abrir, ya normalizado por el editor, y lo
// guardado. Si se vuelve a ese mismo contenido, es lo guardado (por eso abrir o deshacer no deja «● sin guardar», ni siquiera en una tesis antigua en texto plano).
export function valorDelEditor(html, vacio, base) {
  if (base && html === base.html) return base.valor
  return vacio ? '' : html
}
// Word no pega sus listas como listas: son párrafos con «mso-list:l0 level2» y la viñeta escrita entre comentarios condicionales. Aquí se vuelven <ul>/<ol> anidadas.
const MARCA_WORD = /<!(?:--)?\[if !supportLists\](?:--)?>([\s\S]*?)<!(?:--)?\[endif\](?:--)?>/i
function listasDeWord(html) {
  let sal = '', cursor = 0
  const abiertas = []
  const cierra = (hasta) => { let c = ''; while (abiertas.length > hasta) c += `</li></${abiertas.pop()}>`; return c }
  for (const m of html.matchAll(/<p\b([^>]*)>([\s\S]*?)<\/p>/gi)) {
    const nivel = /mso-list:\s*l\d+\s+level(\d+)/i.exec(m[1])
    if (!nivel) continue
    const entre = html.slice(cursor, m.index)
    if (entre.replace(/<!--[\s\S]*?-->/g, '').trim()) sal += cierra(0) + entre
    cursor = m.index + m[0].length
    const marca = MARCA_WORD.exec(m[2])
    const signo = marca ? marca[1].replace(/<[^>]*>/g, '').replace(/&nbsp;/gi, ' ').trim() : ''
    const etiqueta = /^\(?[0-9a-z]{1,4}[.)]/i.test(signo) ? 'ol' : 'ul'
    const hondo = Math.min(Number(nivel[1]), abiertas.length + 1)
    if (hondo > abiertas.length) { sal += `<${etiqueta}><li>`; abiertas.push(etiqueta) }
    else {
      sal += cierra(hondo)
      if (abiertas[hondo - 1] === etiqueta) sal += '</li><li>'
      else { sal += `</li></${abiertas[hondo - 1]}><${etiqueta}><li>`; abiertas[hondo - 1] = etiqueta }
    }
    sal += m[2].replace(MARCA_WORD, '')
  }
  return sal + cierra(0) + html.slice(cursor)
}
// Lo pegado desde Word o una web, antes de que el editor lo lea (el editor luego descarta lo que no admite, y lo lee en un documento inerte):
// fuera el ruido de Word, sus listas como listas, sus títulos como títulos, y sin colores de letra ni de fondo (suelen ser negro: ilegibles
// sobre la hoja gris). Lo copiado del propio editor (data-pm-slice) conserva los suyos.
export function limpiarPegado(html) {
  const s = String(html ?? '')
  if (s.includes('data-pm-slice')) return s
  return listasDeWord(s.replace(/<(head|style|script|xml)\b[\s\S]*?<\/\1>/gi, ''))
    .replace(/<!--[\s\S]*?-->|<!\[[^\]]*\]>|<\/?o:p\b[^>]*>/gi, '')
    .replace(/<p\b[^>]*class=["']?MsoTitle\b[^>]*>([\s\S]*?)<\/p>/gi, '<h1>$1</h1>')
    .replace(/<p\b[^>]*class=["']?MsoSubtitle\b[^>]*>([\s\S]*?)<\/p>/gi, '<h2>$1</h2>')
    .replace(/<(\/?)h[456]\b[^>]*>/gi, '<$1h3>')
    .replace(/\sstyle=(?:"([^"]*)"|'([^']*)')/gi, (_, a, b) => {
      const quedan = (a ?? b).split(';').filter(d => d.trim() && !/^\s*(color|background(-[a-z]+)?|mso-[a-z-]+)\s*:/i.test(d)).join(';').replace(/"/g, "'")
      return quedan ? ` style="${quedan}"` : ''
    })
}
// ── Imágenes dentro del texto (docs/tesis.md, «Imágenes y adjuntos») ──
// En «texto» solo se guarda la referencia estable, <img data-archivo="<ruta>" data-tamano="…">; la URL firmada, solo en pantalla (components/TesisEditor.js).
export const rutaImagenValida = (r) => /^[0-9a-f-]{36}\/\d+\/imagen\/[0-9a-f-]{36}\.(png|jpe?g|gif|webp)$/i.test(String(r ?? ''))
const ETIQUETA_IMG = /<img\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi
const archivoDeImg = (etiqueta) => { const a = /\sdata-archivo=(?:"([^"]*)"|'([^']*)')/i.exec(etiqueta); return a ? (a[1] ?? a[2]) : null }
export function rutasEnTexto(html) {
  const rutas = new Set()
  for (const m of String(html ?? '').matchAll(ETIQUETA_IMG)) { const r = archivoDeImg(m[0]); if (r) rutas.add(r) }
  return [...rutas]
}
// Lo pegado solo conserva las imágenes de la carpeta del propio usuario y de esa tesis; cualquier otro <img> (de Word, de webs, data:…) se quita.
export function quitarImagenesAjenas(html, carpeta) {
  let quitadas = 0
  const limpio = String(html ?? '').replace(ETIQUETA_IMG, (e) => {
    const r = archivoDeImg(e)
    if (carpeta && rutaImagenValida(r) && r.startsWith(carpeta)) return e
    quitadas++
    return ''
  })
  return { html: limpio, quitadas }
}
const textoVisible = (html) => String(html).replace(/<(head|style|script|xml)\b[\s\S]*?<\/\1>|<!--[\s\S]*?-->/gi, '').replace(/<[^>]*>/g, '').replace(/&nbsp;/gi, ' ').trim()
// ¿Qué hacer con lo pegado o arrastrado? archivos: [{ name, type }]. Word y Excel añaden siempre una «foto» de lo copiado junto al texto: con texto, se pega
// el texto. Sin texto, se suben las imágenes. subir: subirlas. bloquea: que el editor no pegue nada. aviso: la línea que hay que enseñar (o null).
// carpeta: la de imágenes de esta tesis (null en una nueva sin guardar). esImagen y avisoTipo, de lib/tesisArchivos.js.
export function imagenEnPegado({ html = '', texto = '', archivos = [], carpeta = null, esImagen = () => false, avisoTipo = null } = {}) {
  const hayTexto = html ? !!textoVisible(html) : !!String(texto).trim()
  if (archivos.length && !hayTexto) return archivos.some(esImagen) ? { subir: true, bloquea: true, aviso: null } : { subir: false, bloquea: true, aviso: avisoTipo }
  return { subir: false, bloquea: false, aviso: quitarImagenesAjenas(html, carpeta).quitadas ? AVISO_IMAGENES_PEGADAS : null }
}
// Las imágenes de una tesis que ya no están en su texto (filas de tesis_adjuntos). Los adjuntos no cuentan: no viven en el texto.
export function imagenesSobrantes(filas, ...textos) {
  const quedan = new Set(textos.flatMap(rutasEnTexto))
  return (filas || []).filter(f => f.clase === 'imagen' && !quedan.has(f.ruta))
}
// La dirección de un enlace: http, https o correo (sin esquema, https); cualquier otra cosa (javascript:…), null.
export function direccionEnlace(s) {
  const d = String(s ?? '').trim()
  if (!d || /\s/.test(d)) return null
  if (/^(https?:\/\/|mailto:)/i.test(d)) return d
  if (/^[a-z][a-z0-9+.-]*:(?!\d)/i.test(d)) return null
  return `https://${d}`
}
