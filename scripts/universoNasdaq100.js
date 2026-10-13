// scripts/universoNasdaq100.js — miembros HISTÓRICOS del Nasdaq-100 (con sus fechas de entrada y salida), desde Wikipedia.
//
//   node scripts/universoNasdaq100.js                 construye, contrasta y comprueba (no escribe nada)
//   node scripts/universoNasdaq100.js --guardar       además escribe la tabla public.universo_miembros (indice 'NDX')
//   opciones: --desde 2008-01-01 (primer 1 de enero del universo) · --json fichero.json (vuelca el resultado)
//             --sin-cache (vuelve a descargar de Wikipedia)
//
// FUENTES (API de Wikipedia; cada respuesta se guarda en una carpeta temporal, así que el script es reanudable):
//   · «List of NASDAQ-100 companies»: los componentes ACTUALES (ticker y empresa).
//   · «Historical components of the Nasdaq-100»: la tabla de CAMBIOS (fecha, alta, baja, motivo), desde febrero de 2007,
//     con la nota de prensa de Nasdaq de casi cada cambio. Es la fuente principal.
//   · Contraste: la lista de componentes del artículo «Nasdaq-100» en la última revisión anterior a cada 1 de enero.
//
// RECONSTRUCCIÓN: se parte de los miembros de hoy y se deshacen los cambios del más reciente al más antiguo (deshacer un
// alta quita el valor; deshacer una baja lo vuelve a poner). Así salen los tramos de cada valor (puede entrar, salir y
// volver). Un mismo valor puede haber cambiado de ticker (FB → META, PCLN → BKNG…): es UNA entidad, con el ticker y el
// símbolo de Yahoo actuales. Se reconoce por el artículo de Wikipedia de la empresa, resolviendo las redirecciones (el
// enlace a «Facebook» y el de «Meta Platforms» llevan al mismo artículo). Las clases de acciones (GOOG/GOOGL, FOX/FOXA)
// comparten artículo, pero son tickers distintos y se tratan como valores distintos: solo se unifican por artículo cuando
// el ticker NO coincide con ningún miembro (un cambio de ticker), nunca dos tickers que conviven.
// Fechas: «desde» es el primer día como miembro y «hasta» el primer día ya fuera (la fecha efectiva del cambio).
//
// CONTRASTE: cada discrepancia entre la reconstrucción y la foto de cada 1 de enero se informa y se clasifica; manda la
// tabla de cambios (citada con las notas de Nasdaq), salvo que la foto la contradiga varios años seguidos (se avisa).
//
// ESCRITURA (--guardar): por la Management API, en UNA transacción: borra las filas de indice 'NDX' y escribe las nuevas.
// Antes comprueba: miembros a cada 1 de enero entre 95 y 105, ningún tramo solapado del mismo valor y ningún «hasta»
// anterior a su «desde». Si algo falla, no escribe.
const fs = require('fs')
const os = require('os')
const path = require('path')
const crypto = require('crypto')
const { spawnSync } = require('child_process')
const NL = String.fromCharCode(10)
const RAIZ = path.join(__dirname, '..')

// ── Token y proyecto: copiados de scripts/llenaCachePrecios.js (que a su vez los copia de scripts/backup.js) ──────────
function leeToken() {
  if (process.env.SUPABASE_ACCESS_TOKEN) return process.env.SUPABASE_ACCESS_TOKEN.trim()
  if (process.platform !== 'win32') return null
  const ps = [
    '$ErrorActionPreference = "Stop"',
    '$sig = @"',
    'using System;',
    'using System.Runtime.InteropServices;',
    'public class CredLector {',
    '  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]',
    '  public struct CREDENTIAL {',
    '    public uint Flags; public uint Type; public IntPtr TargetName; public IntPtr Comment;',
    '    public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;',
    '    public uint CredentialBlobSize; public IntPtr CredentialBlob; public uint Persist;',
    '    public uint AttributeCount; public IntPtr Attributes; public IntPtr TargetAlias; public IntPtr UserName;',
    '  }',
    '  [DllImport("advapi32.dll", CharSet=CharSet.Unicode, SetLastError=true)]',
    '  public static extern bool CredRead(string target, uint type, uint flags, out IntPtr credential);',
    '  [DllImport("advapi32.dll")] public static extern void CredFree(IntPtr buffer);',
    '  public static string Get(string target) {',
    '    IntPtr p; if (!CredRead(target, 1, 0, out p)) { return null; }',
    '    CREDENTIAL c = (CREDENTIAL)Marshal.PtrToStructure(p, typeof(CREDENTIAL));',
    '    byte[] b = new byte[c.CredentialBlobSize];',
    '    Marshal.Copy(c.CredentialBlob, b, 0, (int)c.CredentialBlobSize);',
    '    CredFree(p); return System.Text.Encoding.UTF8.GetString(b);',
    '  }',
    '}',
    '"@',
    'Add-Type -TypeDefinition $sig',
    '$v = [CredLector]::Get("Supabase CLI:supabase")',
    'if ($v -eq $null) { exit 1 }',
    'if ($v.StartsWith("go-keyring-base64:")) { $v = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($v.Substring(18))) }',
    'Write-Output $v',
  ].join(NL)
  const r = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], { encoding: 'utf8', windowsHide: true, maxBuffer: 1024 * 1024 })
  if (r.status !== 0 || !r.stdout || !r.stdout.trim()) return null
  return r.stdout.trim()
}
function leeRef() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || (() => {
    try {
      for (const l of fs.readFileSync(path.join(RAIZ, '.env.local'), 'utf8').split(/\r?\n/)) {
        const m = l.match(/^NEXT_PUBLIC_SUPABASE_URL=(.*)$/)
        if (m) return m[1].trim()
      }
    } catch (_) {}
    return null
  })()
  const m = url ? String(url).match(/https?:\/\/([^.]+)\./) : null
  return m ? m[1] : null
}
async function consulta(q) {
  const TOKEN = leeToken(), REF = leeRef()
  if (!TOKEN || !REF) throw new Error('sin sesión con Supabase (token o proyecto)')
  const res = await fetch('https://api.supabase.com/v1/projects/' + REF + '/database/query', {
    method: 'POST', headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: q }),
  })
  const txt = await res.text()
  let datos; try { datos = JSON.parse(txt) } catch (_) { datos = txt }
  if (!res.ok) throw new Error((datos && datos.message) ? datos.message : String(txt).slice(0, 300))
  return datos
}
const lit = (s) => s == null ? 'NULL' : "'" + String(s).replace(/'/g, "''") + "'"

// ── Wikipedia ──────────────────────────────────────────────────────────────────────────────────────────────────────────
const UA = 'v50-strategy/1.0 (backtester personal; universo historico del Nasdaq-100)'
const CACHE = path.join(os.tmpdir(), 'v50-universo-nasdaq100')
const pausa = (ms) => new Promise(r => setTimeout(r, ms))
let SIN_CACHE = false
async function api(q) {
  const f = path.join(CACHE, crypto.createHash('sha1').update(q).digest('hex') + '.json')
  if (!SIN_CACHE && fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8'))
  // Una petición cada 1,5 s; ante un error (429 incluido), esperas crecientes: 10, 30 y 60 s.
  const esperas = [10000, 30000, 60000]
  for (let intento = 0; intento <= esperas.length; intento++) {
    await pausa(1500)
    let estado = 0
    try {
      const r = await fetch('https://en.wikipedia.org/w/api.php?' + q + '&format=json&formatversion=2', { headers: { 'User-Agent': UA } })
      estado = r.status
      if (r.ok) { const j = await r.json(); fs.mkdirSync(CACHE, { recursive: true }); fs.writeFileSync(f, JSON.stringify(j)); return j }
    } catch (_) {}
    if (intento === esperas.length) throw new Error(`Wikipedia HTTP ${estado || 'sin respuesta'} tras ${esperas.length + 1} intentos`)
    console.log(`  (Wikipedia HTTP ${estado || 'sin respuesta'}; espero ${esperas[intento] / 1000} s)`)
    await pausa(esperas[intento])
  }
}

// ── Lectura del wikitexto (exportado para las pruebas) ─────────────────────────────────────────────────────────────────
const quitaRefs = (s) => s.replace(/<ref[^>]*\/>/g, '').replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '')
const limpia = (s) => quitaRefs(s).replace(/\{\{[^{}]*\}\}/g, '').replace(/'''?/g, '').trim()
const textoPlano = (s) => limpia(s).replace(/\[\[(?:[^\]|]+\|)?([^\]]+)\]\]/g, '$1').replace(/\s+/g, ' ').trim()
function enlace(s) {
  const m = String(s).match(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]/)
  return m ? { destino: m[1].trim(), texto: (m[2] || m[1]).trim() } : null
}
const ES_TICKER = /^[A-Z][A-Z0-9.]{0,5}$/
const fechaIso = (s) => { const d = new Date(textoPlano(s) + ' UTC'); return isNaN(d) ? null : d.toISOString().slice(0, 10) }

// La tabla de cambios: [{ fecha, alta, altaEnlace, baja, bajaEnlace, motivo }], de la más reciente a la más antigua.
function leeCambios(wt) {
  const ini = wt.indexOf('id="changes"')
  if (ini < 0) throw new Error('no encuentro la tabla de cambios (id="changes")')
  const tabla = wt.slice(ini, wt.indexOf(NL + '|}', ini))
  const filas = tabla.split(/\n\|-+\s*(?=\n)/).slice(1)
    .map(f => f.split(NL).filter(l => l.startsWith('|') && !l.startsWith('|-')).map(l => l.slice(1))).filter(c => c.length)
  const raras = filas.filter(c => c.length !== 6)
  if (raras.length) throw new Error(`${raras.length} filas de la tabla de cambios no tienen 6 celdas`)
  return filas.map(c => ({ fecha: fechaIso(c[0]), alta: textoPlano(c[1]) || null, altaEnlace: enlace(c[2]), altaNombre: textoPlano(c[2]) || null,
    baja: textoPlano(c[3]) || null, bajaEnlace: enlace(c[4]), bajaNombre: textoPlano(c[4]) || null, motivo: textoPlano(c[5]) }))
    .sort((a, b) => b.fecha.localeCompare(a.fecha))
}
// La lista de componentes de una revisión: Map ticker → { destino del enlace, nombre }. Solo la sección de componentes
// («Components», «Current components» o «Component changes») hasta el primer subtítulo; tres formatos según la época:
// «#[[Empresa]] (TICKER)» / «* [[Empresa]] (TICKER)» (con o sin [[ ]] en el ticker) y tablas con una celda ticker.
function leeComponentes(wt) {
  let texto = wt
  const iCons = wt.indexOf('id="constituents"')
  const h = iCons >= 0 ? null : wt.match(/^==\s*(Current components|Components|Component changes|Constituents)\s*==\s*$/m)
  if (iCons >= 0) texto = wt.slice(iCons, wt.indexOf(NL + '|}', iCons))
  else if (h) { const ini = h.index + h[0].length, sig = wt.slice(ini).search(/^=+[^=]/m); texto = sig < 0 ? wt.slice(ini) : wt.slice(ini, ini + sig) }
  const out = new Map()
  for (const l of texto.split(NL)) {
    if (!/^[#*]/.test(l)) continue
    const e = enlace(l), m = l.match(/\((?:\[\[(?:[^\]|]+\|)?)?([A-Z][A-Z0-9.]{0,5})(?:\]\])?\)/)
    if (e && m) out.set(m[1], { destino: e.destino, nombre: textoPlano(l.replace(/^[#*]+/, '').replace(/\([^)]*\)\s*$/, '')) })
  }
  if (out.size >= 50) return out
  out.clear()
  for (const fila of texto.split(/\n\|-/)) {
    const celdas = fila.split(/\n\||\n!|\|\|/).map(x => x.replace(/^[|!]/, '')).map(x => ({ crudo: x, plano: textoPlano(x) })).filter(x => x.plano)
    const tick = celdas.find(c => ES_TICKER.test(c.plano)), e = celdas.map(c => enlace(c.crudo)).find(Boolean)
    if (tick && e && celdas.length >= 2 && celdas.length <= 8) out.set(tick.plano, { destino: e.destino, nombre: textoPlano(celdas.find(c => enlace(c.crudo)).crudo) })
  }
  return out
}
// El motivo de salida, en una categoría y el texto (recortado).
function motivoSalida(m) {
  const t = String(m || '').toLowerCase()
  const cat = /acquir|merg|purchas|bought|takeover|buyout|taken private|went private|privat/.test(t) ? 'adquisición o fusión'
    : /bankrupt|chapter 11|delist/.test(t) ? 'quiebra o exclusión'
    : /moved|transferr|switch|listing to the nyse|to nyse|nyse/.test(t) ? 'cambio de bolsa'
    : /spun|spin|split into|separat/.test(t) ? 'escisión'
    : /annual|reconstitution|rebalanc|rank|weight|market cap|did not meet|no longer met|eligib|quarterly/.test(t) ? 'reconstitución o tamaño'
    : t ? 'otro' : 'desconocido'
  return `${cat}: ${String(m || '').slice(0, 220)}`
}

// ── Correcciones a la tabla de cambios de Wikipedia (cada una, con su motivo; salen en el informe) ───────────────────────
// La tabla mezcla tickers de la época y actuales, y tiene filas que no son cambios de miembros. Lo que se corrige:
const CORRECCIONES = [
  { fecha: '2016-02-01', lado: 'alta', ticker: 'AVGO', accion: 'ignorar', nota: 'Avago (AVGO, miembro desde 2011) solo cambió su nombre a Broadcom: no es un cambio de miembros' },
  { fecha: '2015-11-11', lado: 'baja', ticker: 'AVGO', accion: 'ticker', nuevo: 'BRCM', nota: 'la baja es Broadcom Corporation (BRCM), absorbida por Avago; la fila pone el ticker de hoy' },
  { fecha: '2014-12-22', lado: 'alta', ticker: 'CMCSA', accion: 'ignorar', nota: 'Comcast clase A (CMCSA) ya era miembro (fotos 2008–2014); la clase que entró fue CMCSK, que se fundió con CMCSA en 2015 sin baja en la tabla: se omite CMCSK' },
  { fecha: '2014-12-22', lado: 'alta', ticker: 'DISCK', accion: 'añadir', nota: 'la tabla no registra la entrada de Discovery clase C (DISCK) con la admisión de varias clases el 22/12/2014; su baja del 18/12/2017 sí está' },
  { fecha: '2014-12-22', lado: 'alta', ticker: 'LMCK', accion: 'añadir', nota: 'la tabla no registra la entrada de Liberty Media clase C (LMCK) con la admisión de varias clases el 22/12/2014; su baja del 20/06/2016 sí está' },
]
// Cambios de ticker que el artículo de Wikipedia no une (la empresa tiene otro artículo): ticker antiguo → actual.
// Solo empresas que SIGUEN siendo la misma (mismo historial de cotización). Keurig Green Mountain (GMCR) no: la compró JAB y
// KDP cotiza con la historia de Dr Pepper Snapple.
const ALIAS = { PCLN: 'BKNG', KFT: 'MDLZ', SYMC: 'NLOK', CTRP: 'TCOM', LINTA: 'QRTEA', QVCA: 'QRTEA', NWSA: 'FOXA', ERTS: 'EA', FB: 'META', FISV: 'FI', WLTW: 'WTW', HANS: 'MNST', WFMI: 'WFM', CDWC: 'CDW' }
// En las fotos de antes del 3/4/2014, GOOG es la clase A de Google (la actual GOOGL); desde entonces, la clase C.
const ALIAS_FOTO = (t, fecha) => t === 'GOOG' && fecha < '2014-04-03' ? 'GOOGL' : t
// Símbolo de Yahoo cuando el ticker de la tabla ya no es el que cotiza.
const YAHOO = { NLOK: 'GEN' }
const normaliza = (t) => t ? (ALIAS[t] || t) : t
function aplicaCorrecciones(cambios) {
  const out = [], usadas = new Set()
  for (const c0 of cambios) {
    const c = { ...c0 }
    for (const k of CORRECCIONES) {
      if (k.accion === 'añadir' || k.fecha !== c.fecha || c[k.lado] !== k.ticker) continue
      usadas.add(k)
      if (k.accion === 'ignorar') { c[k.lado] = null; c[k.lado + 'Enlace'] = null }
      if (k.accion === 'ticker') c[k.lado] = k.nuevo
    }
    c.alta = normaliza(c.alta); c.baja = normaliza(c.baja)
    if (c.alta || c.baja) out.push(c)
  }
  for (const k of CORRECCIONES) if (k.accion === 'añadir') { usadas.add(k); out.push({ fecha: k.fecha, alta: k.ticker, altaEnlace: null, altaNombre: k.ticker, baja: null, bajaEnlace: null, bajaNombre: null, motivo: k.nota }) }
  const sinUsar = CORRECCIONES.filter(k => !usadas.has(k))
  return { cambios: out.sort((a, b) => b.fecha.localeCompare(a.fecha)), sinUsar }
}

// ── Reconstrucción (pura; exportada para las pruebas) ──────────────────────────────────────────────────────────────────
//   actuales: Map ticker → { destino, nombre } · cambios: de la tabla · canon(destino) → artículo canónico
// Devuelve { entidades: [{ id, ticker, tickers[], nombre, canon, tramos: [{ desde, hasta, motivo }] }], avisos[] }.
function reconstruye(actuales, cambios, canon = (x) => x) {
  // Los miembros se llevan por ENTIDAD (no por ticker): dos empresas distintas pueden haber usado el mismo ticker
  // (MNST: Monster Worldwide hasta 2008, Monster Beverage desde 2012).
  const entidades = new Map(), miembros = new Set(), avisos = [], renombres = []
  let n = 0
  const nueva = (ticker, info) => { const e = { id: `e${++n}`, ticker, tickers: new Set([ticker]), nombre: info?.nombre || ticker, canon: info?.destino ? canon(info.destino) : null, tramos: [] }; entidades.set(e.id, e); return e }
  for (const [t, info] of actuales) { const e = nueva(t, info); e.tramos.push({ desde: null, hasta: null, motivo: null }); miembros.add(e.id) }
  // Compatibles: sin artículo en uno de los dos, el mismo artículo, o uno contenido en el otro («Trip.com» y «Trip.com Group»;
  // «Norwegian Cruise Line» y «… Holdings»). «Monster Worldwide» y «Monster Beverage» no lo son.
  const compatible = (e, enl) => { const cn = enl ? canon(enl.destino) : null; return !cn || !e.canon || e.canon === cn || e.canon.includes(cn) || cn.includes(e.canon) }
  // Por ticker; el artículo solo desempata si hay varias entidades con ese ticker.
  const elige = (lista, t, enl) => { const c = lista.filter(e => e.tickers.has(t)); return c.length <= 1 ? c[0] : (c.find(e => compatible(e, enl)) || c[0]) }
  const actuales_ = () => [...miembros].map(id => entidades.get(id))
  const miembroPor = (t, enl) => elige(actuales_(), t, enl)
  for (const c of [...cambios].sort((a, b) => b.fecha.localeCompare(a.fecha))) {
    // Deshacer el alta: el valor no era miembro antes de esta fecha.
    if (c.alta) {
      let e = miembroPor(c.alta, c.altaEnlace)
      if (!e && c.altaEnlace) {   // ¿un cambio de ticker? el mismo artículo que UN miembro con otro ticker
        const cn = canon(c.altaEnlace.destino)
        const cand = [...miembros].map(id => entidades.get(id)).filter(x => x.canon === cn && !x.tickers.has(c.alta))
        if (cand.length === 1) { e = cand[0]; renombres.push(`${c.alta} → ${e.ticker} (${cn})`); e.tickers.add(c.alta) }
        else if (cand.length > 1) avisos.push(`${c.fecha}: alta ${c.alta} (${cn}) podría ser ${cand.map(x => x.ticker).join(' o ')}: no se unifica`)
      }
      if (!e) avisos.push(`${c.fecha}: alta ${c.alta} (${c.altaNombre || '?'}) no es miembro al deshacerla; se ignora`)
      else { e.tramos[e.tramos.length - 1].desde = c.fecha; miembros.delete(e.id) }
    }
    // Deshacer la baja: el valor era miembro hasta esta fecha (exclusiva). Se une a una entidad existente solo por su
    // ticker (y si el artículo es compatible); nunca solo por el artículo: una empresa absorbida tiene a menudo el
    // artículo de quien la compró (Keurig Green Mountain → Keurig Dr Pepper, que cotiza con la historia de otra empresa).
    if (c.baja) {
      // Un miembro con ese ticker: si es la misma empresa, la fila sobra; si es otra (otro artículo), es OTRA entidad.
      const m = miembroPor(c.baja, c.bajaEnlace)
      if (m && compatible(m, c.bajaEnlace)) { avisos.push(`${c.fecha}: baja ${c.baja} ya es miembro al deshacerla; se ignora`); continue }
      let e = m ? null : [...entidades.values()].find(x => !miembros.has(x.id) && x.tickers.has(c.baja) && compatible(x, c.bajaEnlace))
      if (!e) e = nueva(c.baja, { destino: c.bajaEnlace?.destino, nombre: c.bajaNombre })
      e.tramos.push({ desde: null, hasta: c.fecha, motivo: motivoSalida(c.motivo) })
      miembros.add(e.id)
    }
  }
  // Un ticker que hoy (o más tarde) usa OTRA empresa: su símbolo de Yahoo no sirve para esta (daría los precios de la otra).
  const lista = [...entidades.values()].map(e => ({ ...e, tickers: [...e.tickers], tramos: e.tramos.slice().reverse() }))
  const finDe = (e) => e.tramos.some(t => t.hasta == null) ? '9999' : e.tramos.map(t => t.hasta).sort().pop()
  for (const e of lista) e.tickerReutilizado = lista.some(o => o !== e && o.tickers.includes(e.ticker) && finDe(o) > finDe(e))
  return { entidades: lista, avisos, renombres }
}
// Miembros en una fecha (por entidad), a partir de los tramos (desde inclusivo; hasta exclusivo; desde null = antes).
const miembrosEn = (entidades, fecha) => entidades.filter(e => e.tramos.some(t => (t.desde == null || t.desde <= fecha) && (t.hasta == null || fecha < t.hasta)))
// Las comprobaciones que tienen que pasar antes de escribir.
function compruebaTramos(entidades, cortes, { min = 95, max = 105 } = {}) {
  const errores = []
  for (const f of cortes) { const n = miembrosEn(entidades, f).length; if (n < min || n > max) errores.push(`${f}: ${n} miembros (fuera de ${min}–${max})`) }
  for (const e of entidades) {
    const ts = e.tramos.slice().sort((a, b) => String(a.desde ?? '').localeCompare(String(b.desde ?? '')))
    for (const t of ts) if (t.desde != null && t.hasta != null && t.hasta < t.desde) errores.push(`${e.ticker}: «hasta» ${t.hasta} anterior a «desde» ${t.desde}`)
    for (let i = 1; i < ts.length; i++) if (ts[i - 1].hasta == null || (ts[i].desde != null && ts[i].desde < ts[i - 1].hasta)) errores.push(`${e.ticker}: tramos solapados (${ts[i - 1].desde}–${ts[i - 1].hasta} y ${ts[i].desde}–${ts[i].hasta})`)
  }
  return errores
}
module.exports = { leeCambios, leeComponentes, reconstruye, miembrosEn, compruebaTramos, motivoSalida, textoPlano, enlace, aplicaCorrecciones, normaliza, CORRECCIONES, ALIAS }

// ── Programa ───────────────────────────────────────────────────────────────────────────────────────────────────────────
if (require.main === module) (async () => {
  const args = process.argv.slice(2), opcion = (n, d = null) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d }
  const DESDE = opcion('--desde', '2008-01-01'), GUARDAR = args.includes('--guardar'), JSON_OUT = opcion('--json')
  SIN_CACHE = args.includes('--sin-cache')
  const hoy = new Date().toISOString().slice(0, 10)
  const t0 = Date.now()
  const histWt = (await api('action=parse&page=Historical_components_of_the_Nasdaq-100&prop=wikitext|revid')).parse
  const listaWt = (await api('action=parse&page=List_of_NASDAQ-100_companies&prop=wikitext|revid')).parse
  const crudos = leeCambios(histWt.wikitext), actuales = leeComponentes(listaWt.wikitext)
  const { cambios, sinUsar } = aplicaCorrecciones(crudos)
  console.log(`Fuentes: «Historical components of the Nasdaq-100» (revisión ${histWt.revid}): ${cambios.length} cambios, ${cambios[cambios.length - 1].fecha} → ${cambios[0].fecha}` +
    ` · «List of NASDAQ-100 companies» (revisión ${listaWt.revid}): ${actuales.size} componentes actuales`)
  console.log('Correcciones a la tabla de cambios:')
  for (const k of CORRECCIONES) console.log(`  ✎ ${k.fecha} ${k.lado} ${k.ticker}: ${k.accion}${k.nuevo ? ` → ${k.nuevo}` : ''} — ${k.nota}${sinUsar.includes(k) ? ' (NO SE HA APLICADO: la fila ya no está)' : ''}`)
  console.log('Cambios de ticker con otro artículo (alias): ' + Object.entries(ALIAS).map(([a, b]) => `${a}→${b}`).join(', '))
  // Fotos a cada 1 de enero (revisión del artículo «Nasdaq-100» anterior a esa fecha; si no trae la lista, la de la lista).
  const anioIni = Number(DESDE.slice(0, 4)), cortes = []
  for (let y = anioIni; `${y}-01-01` <= hoy; y++) cortes.push(`${y}-01-01`)
  const fotos = {}
  for (const corte of cortes) {
    for (const titulo of ['Nasdaq-100', 'List_of_NASDAQ-100_companies']) {
      const j = await api(`action=query&titles=${titulo}&prop=revisions&rvlimit=1&rvstart=${corte}T00:00:00Z&rvdir=older&rvprop=timestamp|ids|content&rvslots=main`)
      const r = j.query.pages[0].revisions?.[0]
      const foto = r ? leeComponentes(r.slots.main.content) : new Map()
      if (foto.size >= 50 && foto.size <= 130) { fotos[corte] = { foto, origen: `${titulo.replace(/_/g, ' ')} (revisión ${r.revid} del ${r.timestamp.slice(0, 10)})` }; break }
    }
  }
  // Artículos canónicos de todos los enlaces (redirecciones resueltas), de 50 en 50.
  const destinos = new Set()
  for (const [, i] of actuales) destinos.add(i.destino)
  for (const c of cambios) { if (c.altaEnlace) destinos.add(c.altaEnlace.destino); if (c.bajaEnlace) destinos.add(c.bajaEnlace.destino) }
  for (const f of Object.values(fotos)) for (const [, i] of f.foto) destinos.add(i.destino)
  const canonico = new Map(), lista = [...destinos]
  for (let i = 0; i < lista.length; i += 50) {
    const parte = lista.slice(i, i + 50)
    const j = await api(`action=query&redirects=1&titles=${parte.map(encodeURIComponent).join('|')}`)
    const norm = new Map((j.query.normalized || []).map(x => [x.from, x.to])), red = new Map((j.query.redirects || []).map(x => [x.from, x.to]))
    for (const t of parte) { let x = norm.get(t) || t; x = red.get(x) || x; canonico.set(t, x) }
  }
  const canon = (d) => canonico.get(d) || d
  const { entidades, avisos, renombres } = reconstruye(actuales, cambios, canon)
  console.log(`\nEntidades: ${entidades.length} · cambios de ticker unificados: ${renombres.length}`)
  for (const r of renombres) console.log(`  ↺ ${r}`)
  for (const a of avisos) console.log(`  ⚠ ${a}`)

  // Contraste con las fotos.
  console.log('\nCONTRASTE con la lista del artículo a cada 1 de enero (manda la tabla de cambios):')
  const porTicker = new Map(); for (const e of entidades) for (const t of e.tickers) porTicker.set(t, e)
  const discrepancias = []
  for (const corte of cortes) {
    const f = fotos[corte], rec = miembrosEn(entidades, corte)
    if (!f) { console.log(`  ${corte}: sin foto legible`); continue }
    const enFoto = new Set(), desconocidos = []
    for (const [t0, info] of f.foto) {
      const t = ALIAS_FOTO(normaliza(t0), corte)
      // Por ticker entre los miembros de esa fecha aún sin emparejar; con varios (HANS y MNST en 2008), desempata el artículo.
      const cands = rec.filter(x => x.tickers.includes(t) && !enFoto.has(x.id)), cnF = canon(info.destino)
      let e = cands.find(x => x.canon === cnF || (x.canon && cnF && (x.canon.includes(cnF) || cnF.includes(x.canon)))) || cands[0]
      if (!e) { const c = canon(info.destino), cand = rec.filter(x => x.canon === c && !f.foto.has(x.ticker)); if (cand.length === 1) e = cand[0] }
      if (!e) e = porTicker.get(t)
      if (e) enFoto.add(e.id); else desconocidos.push(t)
    }
    const soloRec = rec.filter(e => !enFoto.has(e.id)), soloFoto = [...enFoto].map(id => entidades.find(e => e.id === id)).filter(e => !rec.includes(e))
    const cerca = (fecha) => fecha && fecha <= corte && (new Date(corte) - new Date(fecha)) / 864e5 <= 45
    const desplaza = (f, d) => new Date(Date.parse(f) + d * 864e5).toISOString().slice(0, 10)
    const explica = (e, enRec) => {
      const tr = e.tramos.find(t => enRec ? cerca(t.desde) : cerca(t.hasta))
      if (tr) return `foto atrasada: ${enRec ? 'entró' : 'salió'} el ${enRec ? tr.desde : tr.hasta}, poco antes del corte`
      if (enRec && [-365, 365].every(d => miembrosEn([e], desplaza(corte, d)).length)) return 'omisión de la foto: miembro sin cambios un año antes y un año después'
      return null
    }
    const porCorreccion = (t) => { const k = CORRECCIONES.find(x => x.nota.includes(t)); return k ? `explicada por la corrección del ${k.fecha} (${k.ticker})` : null }
    const lineas = [...soloRec.map(e => ({ e, lado: 'solo en la reconstrucción', motivo: explica(e, true) })), ...soloFoto.map(e => ({ e, lado: 'solo en la foto', motivo: explica(e, false) })),
      ...desconocidos.map(t => ({ e: { ticker: t }, lado: 'solo en la foto (ticker desconocido)', motivo: porCorreccion(t) }))]
    console.log(`  ${corte}: reconstrucción ${rec.length} · foto ${f.foto.size} (${f.origen})${lineas.length ? '' : ' · coinciden'}`)
    for (const l of lineas) { console.log(`     · ${l.e.ticker}: ${l.lado}${l.motivo ? ` — ${l.motivo}` : ' — SIN EXPLICAR'}`); discrepancias.push({ corte, ticker: l.e.ticker, lado: l.lado, motivo: l.motivo }) }
  }
  // Comprobaciones.
  const errores = compruebaTramos(entidades, cortes)
  console.log('\nMIEMBROS a cada 1 de enero: ' + cortes.map(c => `${c.slice(0, 4)} ${miembrosEn(entidades, c).length}`).join(' · '))
  console.log(errores.length ? `\n✗ COMPROBACIONES: ${errores.length} fallos:\n  ` + errores.join('\n  ') : '\n✓ Comprobaciones: 95–105 miembros cada 1 de enero, sin tramos solapados ni «hasta» anterior a «desde».')
  // Filas (recortadas al universo: desde DESDE).
  const filas = []
  const antes = (e) => [...new Set([...e.tickers.filter(x => x !== e.ticker), ...Object.keys(ALIAS).filter(k => ALIAS[k] === e.ticker)])]
  for (const e of entidades) for (const t of e.tramos) {
    if (t.hasta != null && t.hasta <= DESDE) continue
    const desde = t.desde == null || t.desde < DESDE ? DESDE : t.desde
    filas.push({ indice: 'NDX', simbolo: e.ticker, simbolo_yahoo: e.tickerReutilizado ? null : (YAHOO[e.ticker] || e.ticker).replace(/\./g, '-'), nombre: e.nombre, desde, hasta: t.hasta, motivo_salida: t.hasta ? t.motivo : null,
      fuente: `Wikipedia: tabla de cambios (rev. ${histWt.revid}) y lista actual (rev. ${listaWt.revid})${antes(e).length ? `; otros tickers: ${antes(e).join(', ')}` : ''}${t.desde == null || t.desde < DESDE ? `; ya era miembro antes del ${DESDE}` : ''}${e.tickerReutilizado ? `; sin símbolo de Yahoo: el ticker ${e.ticker} lo usa después otra empresa` : ''}` })
  }
  filas.sort((a, b) => a.simbolo.localeCompare(b.simbolo) || a.desde.localeCompare(b.desde))
  console.log(`\n${filas.length} tramos de ${new Set(filas.map(f => f.simbolo)).size} valores desde el ${DESDE} · discrepancias sin explicar: ${discrepancias.filter(d => !d.motivo).length} · ${((Date.now() - t0) / 1000).toFixed(1)} s`)
  if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify({ desde: DESDE, filas, discrepancias, renombres, avisos }, null, 1))
  if (errores.length) { console.error('No se escribe nada: fallan las comprobaciones.'); process.exit(1) }
  if (!GUARDAR) return
  const valores = filas.map(f => `(${[f.indice, f.simbolo, f.simbolo_yahoo, f.nombre].map(lit).join(', ')}, ${lit(f.desde)}::date, ${f.hasta ? lit(f.hasta) + '::date' : 'NULL'}, ${lit(f.motivo_salida)}, ${lit(f.fuente)})`)
  const r = await consulta(`BEGIN;
DELETE FROM public.universo_miembros WHERE indice = 'NDX';
INSERT INTO public.universo_miembros (indice, simbolo, simbolo_yahoo, nombre, desde, hasta, motivo_salida, fuente) VALUES
${valores.join(',' + NL)};
SELECT count(*)::int AS filas FROM public.universo_miembros WHERE indice = 'NDX';
COMMIT;`)
  console.log(`Escrito: ${r?.[0]?.filas ?? '?'} filas de indice NDX en public.universo_miembros.`)
})().catch(e => { console.error('El universo no ha podido construirse:', e.message); process.exit(1) })
