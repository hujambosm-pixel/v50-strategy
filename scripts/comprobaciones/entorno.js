// scripts/comprobaciones/entorno.js — el entorno de la batería de V9.949. Nada sale a la red:
//   · Yahoo simulado con una FOTO real (datos/yahoo_foto.json y las fotos de las listas). range=Ny devuelve desde la misma fecha
//     de hace N años; period1/period2, las velas con marca de tiempo en [period1, period2); un tramo vacío da el 400 de Yahoo.
//   · Supabase simulado (https://arnes.invalid): las estrategias, de la última copia de seguridad (backups/, que NO está en git:
//     tiene el code_js de todas las estrategias); leer_velas por GET y guardar_velas por POST contra una caché EN MEMORIA con las
//     mismas validaciones que la función real. Cualquier otro método distinto de GET contra /rest/v1/ revienta.
//   · modoSupabase: 'ok' | 'error' (la red falla) | 'http500' | 'colgado' (no responde hasta que se aborta).
process.env.SUPABASE_URL = 'https://arnes.invalid'
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://arnes.invalid'
process.env.SUPABASE_ANON_KEY = 'clave-falsa-del-arnes'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'clave-falsa-del-arnes'
const fs = require('fs'), path = require('path')
const RAIZ = path.resolve(__dirname, '..', '..')
const DATOS = process.env.COMPROBACIONES_DATOS || path.join(__dirname, 'datos')
const B = path.join(RAIZ, 'backups')
const ultimaCopia = fs.readdirSync(B).filter(d => d.startsWith('datos_completos_')).sort().pop()
if (!ultimaCopia) throw new Error('No hay ninguna copia en backups/: ejecuta «npm run backup» primero.')
const FILAS = JSON.parse(fs.readFileSync(path.join(B, ultimaCopia, 'strategies.json'), 'utf8')).filas
const ESTRATEGIAS = new Map(FILAS.map(s => [s.id, s]))
const FOTO = require(path.join(DATOS, 'yahoo_foto.json'))
const HOY = new Date().toISOString().slice(0, 10)
const fechaMenosAnios = (f, n) => { const [y, m, d] = f.split('-').map(Number); return new Date(Date.UTC(y - n, m - 1, d)).toISOString().slice(0, 10) }
const fechaTs = (t) => new Date(t * 1000).toISOString().slice(0, 10)

const estado = { enCurso: true, modoSupabase: 'ok', yahoo: [], leer: [], guardar: [], foto: FOTO, estados: [], marcar: [], bytesSupabase: 0,
  // Sesión forzada: { start, end } sustituye al periodo regular; sinHoy quita las velas de hoy (premercado).
  sesion: null, sinHoy: false }
const ESTADO = new Map()   // símbolo → { revisado_en, sesion }
// Series SINTÉTICAS deterministas para los símbolos que no están en la foto, con el mismo formato que la foto y velas fechadas a
// las 13:30 UTC.
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 } }
const hash = s => [...s].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261)
function sintetica(sym) {
  const r = rng(hash(sym)), ts = [], o = [], h = [], l = [], c = [], v = []
  let px = 50 + r() * 150, deriva = 0.0004, vol = 0.012
  const hoy = new Date(); hoy.setUTCHours(13, 30, 0, 0)
  for (let d = new Date(Date.UTC(1998, 0, 5, 13, 30)); d <= hoy; d = new Date(d.getTime() + 86400000)) {
    const dia = d.getUTCDay(); if (dia === 0 || dia === 6) continue
    if (r() < 0.01) { deriva = (r() - 0.45) * 0.003; vol = 0.006 + r() * 0.025 }
    const ab = px * (1 + (r() - 0.5) * vol * 0.6), ci = ab * (1 + deriva + (r() - 0.5) * 2 * vol)
    const hi = Math.max(ab, ci) * (1 + r() * vol), lo = Math.min(ab, ci) * (1 - r() * vol)
    ts.push(Math.floor(d.getTime() / 1000)); o.push(+ab.toFixed(4)); h.push(+hi.toFixed(4)); l.push(+lo.toFixed(4)); c.push(+ci.toFixed(4)); v.push(Math.floor(1e6 + r() * 5e6)); px = ci
  }
  const ult = ts[ts.length - 1]
  return { meta: { firstTradeDate: ts[0], currentTradingPeriod: { regular: { start: ult, end: ult + 23400 } } }, timestamp: ts, quote: { open: o, high: h, low: l, close: c, volume: v } }
}
function asegura(sym) { if (!estado.foto[sym]) estado.foto[sym] = sintetica(sym); return estado.foto[sym] }
const CACHE = new Map()    // símbolo → Map(fecha → { fecha, open, high, low, close, volumen })

// Las velas que daría la foto, con el parseo de fetchAVDetalle.
function velasFoto(sym, foto = estado.foto) {
  const F = foto === estado.foto ? asegura(sym) : foto[sym], q = F.quote
  return F.timestamp.map((t, i) => ({ date: fechaTs(t), open: q.open?.[i] || q.close?.[i], high: q.high?.[i] || q.close?.[i],
    low: q.low?.[i] || q.close?.[i], close: q.close?.[i], volume: q.volume?.[i] || 0 })).filter(d => d.close && !isNaN(d.close))
}
// Rellena la caché simulada con las velas CERRADAS de la foto desde `desde` (por defecto, 20 años), opcionalmente transformadas.
function llenaCache(sym, { desde = fechaMenosAnios(HOY, 20), hasta = HOY, transforma = (v) => v } = {}) {
  const m = new Map()
  for (const v of velasFoto(sym)) if (v.date >= desde && v.date < hasta && v.date < HOY) {
    const w = transforma(v)
    m.set(w.date, { fecha: w.date, open: w.open, high: w.high, low: w.low, close: w.close, volumen: Math.round(w.volume) })
  }
  CACHE.set(sym, m)
}
const vaciaCache = () => { CACHE.clear(); ESTADO.clear() }

const resp = (status, cuerpo) => ({ ok: status >= 200 && status < 300, status,
  json: async () => typeof cuerpo === 'string' ? JSON.parse(cuerpo) : cuerpo,
  text: async () => typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo) })

function yahoo(url) {
  const m = url.match(/finance\/chart\/([^?]+)\?(.*)$/)
  const sym = decodeURIComponent(m[1]), q = new URLSearchParams(m[2])
  estado.yahoo.push(`${sym} ${q.get('range') ? 'range=' + q.get('range') : fechaTs(+q.get('period1')) + '→' + fechaTs(+q.get('period2'))}`)
  const F = /^SINT/.test(sym) ? asegura(sym) : estado.foto[sym]
  if (!F) return resp(404, { chart: { result: null, error: { code: 'Not Found', description: 'No data found, symbol may be delisted' } } })
  let idx
  if (q.get('range')) { const ini = fechaMenosAnios(HOY, parseInt(q.get('range'))); idx = F.timestamp.map((t, i) => i).filter(i => fechaTs(F.timestamp[i]) >= ini) }
  else { const p1 = +q.get('period1'), p2 = +q.get('period2'); idx = F.timestamp.map((t, i) => i).filter(i => F.timestamp[i] >= p1 && F.timestamp[i] < p2) }
  if (estado.sinHoy) idx = idx.filter(i => fechaTs(F.timestamp[i]) < HOY)
  if (!idx.length) return resp(400, { chart: { result: null, error: { code: 'Bad Request', description: `Data doesn't exist for startDate = ${q.get('period1')}, endDate = ${q.get('period2')}` } } })
  const quote = {}
  for (const k of ['open', 'high', 'low', 'close', 'volume']) quote[k] = idx.map(i => F.quote[k][i])
  const reg = F.meta.currentTradingPeriod.regular
  const meta = { ...F.meta, currentTradingPeriod: { ...F.meta.currentTradingPeriod, regular: estado.sesion ? { ...reg, ...estado.sesion } : { ...reg, end: estado.enCurso ? 4102444800 : reg.start + 60 } } }
  return resp(200, JSON.stringify({ chart: { result: [{ meta, timestamp: idx.map(i => F.timestamp[i]), indicators: { quote: [quote] } }], error: null } }))
}

function leerVelas(q) {
  const sym = q.get('p_simbolo'), desde = q.get('p_desde')
  estado.leer.push(`${sym} desde ${desde}`)
  const filas = [...(CACHE.get(sym)?.values() || [])].filter(f => !desde || f.fecha >= desde).sort((a, b) => a.fecha < b.fecha ? -1 : 1)
  const col = (k) => filas.map(f => f[k])
  return cuenta({ simbolo: sym, fecha: col('fecha'), open: col('open'), high: col('high'), low: col('low'), close: col('close'), volumen: col('volumen') })
}
const cuenta = (x) => { const txt = typeof x === 'string' ? x : JSON.stringify(x); estado.bytesSupabase += Buffer.byteLength(txt); return txt }
function leerEstado(q) {
  const sym = decodeURIComponent((q.match(/simbolo=eq.([^&]+)/) || [])[1] || '')
  estado.estados.push(sym)
  const m = CACHE.get(sym)
  if (!m) return cuenta('[]')
  const fechas = [...m.keys()].sort()
  const e = ESTADO.get(sym) || {}
  return cuenta(JSON.stringify([{ revisado_en: e.revisado_en ?? null, ultima_fecha: fechas[fechas.length - 1] ?? null, sesion: e.sesion ?? null }]))
}
function marcarRevisado(c) {
  const s = c.p_sesion
  estado.marcar.push({ sym: c.p_simbolo, sesion: s })
  if (!s || ['inicio', 'fin', 'tsUltima'].some(k => typeof s[k] !== 'number') || typeof s.fechaUltima !== 'string' || !(s.fin > s.inicio)) return resp(400, { message: 'marcar_revisado: sesión incompleta' })
  const m = CACHE.get(c.p_simbolo); const ult = m ? [...m.keys()].sort().pop() : null
  if (ult !== s.fechaUltima) return resp(200, 'false')
  const en = new Date().toISOString()
  ESTADO.set(c.p_simbolo, { revisado_en: en, sesion: { ...s, en } })
  return resp(200, 'true')
}
function guardarVelas(cuerpo) {
  const { p_simbolo: sym, p_filas: filas, p_reemplazar: reemplazar = false, p_motivo: motivo = null } = cuerpo
  const vistas = new Set()
  for (const f of filas) {
    if (!f.fecha || ['open', 'high', 'low', 'close'].some(k => typeof f[k] !== 'number' || !Number.isFinite(f[k]))) return resp(400, { message: 'guardar_velas: vela incompleta' })
    if (f.fecha >= HOY) return resp(400, { message: `guardar_velas: la vela del ${f.fecha} es de hoy o futura` })
    if (vistas.has(f.fecha)) return resp(400, { message: 'guardar_velas: hay fechas repetidas en las velas' })
    vistas.add(f.fecha)
  }
  estado.guardar.push({ sym, n: filas.length, reemplazar, motivo, desde: filas[0]?.fecha ?? null, hasta: filas.at(-1)?.fecha ?? null, fechas: filas.map(f => f.fecha) })
  if (reemplazar || !CACHE.has(sym)) CACHE.set(sym, new Map())
  ESTADO.set(sym, { ...(ESTADO.get(sym) || {}), revisado_en: new Date().toISOString() })
  const m = CACHE.get(sym)
  for (const f of filas) m.set(f.fecha, { fecha: f.fecha, open: f.open, high: f.high, low: f.low, close: f.close, volumen: f.volumen })
  return resp(200, String(filas.length))
}

global.fetch = async (url, opts) => {
  url = String(url)
  const metodo = String(opts?.method || 'GET').toUpperCase()
  if (url.includes('finance/chart/')) return yahoo(url)
  if (url.includes('jwks')) return resp(503, {})
  if (url.includes('/rest/v1/rpc/')) {
    if (estado.modoSupabase === 'error') throw new TypeError('fetch failed')
    if (estado.modoSupabase === 'http500') return resp(500, { message: 'caído' })
    if (estado.modoSupabase === 'colgado') return new Promise((_, rej) => opts?.signal?.addEventListener('abort', () => { const e = new Error('aborted'); e.name = 'AbortError'; rej(e) }))
    const [ruta, qs] = url.split('?')
    if (ruta.endsWith('/rpc/leer_velas') && metodo === 'GET') return resp(200, leerVelas(new URLSearchParams(qs)))
    if (ruta.endsWith('/rpc/guardar_velas') && metodo === 'POST') return guardarVelas(JSON.parse(opts.body))
    if (ruta.endsWith('/rpc/marcar_revisado') && metodo === 'POST') return marcarRevisado(JSON.parse(opts.body))
  }
  if (url.includes('/rest/v1/precios_simbolos?') && metodo === 'GET') {
    if (estado.modoSupabase === 'error') throw new TypeError('fetch failed')
    return resp(200, leerEstado(url))
  }
  // Solo lectura: cualquier otra escritura contra la API REST revienta el arnés.
  if (url.includes('/rest/v1/') && metodo !== 'GET') throw new Error(`ARNÉS: método ${metodo} bloqueado contra ${url.split('?')[0]}`)
  const m = url.match(/\/rest\/v1\/strategies\?id=eq\.([^&]+)/)
  if (m) {
    const s = ESTRATEGIAS.get(m[1])
    return resp(200, s ? [{ code_js: s.code_js, params: s.params, visuals: s.visuals ?? null, name: s.name }] : [])
  }
  return resp(404, {})
}

// Un JWT falso con la forma de uno de verdad (el verificador no llega a comprobarlo: jwks responde 503 y deja pasar).
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url')
const JWT = `${b64({ alg: 'ES256', kid: 'k' })}.${b64({ sub: 'arnes', exp: 9999999999 })}.firma`
let LOGS = []
async function llama(handler, body, { cache = false } = {}) {
  let status = 200, cuerpo = null
  const res = { status(c) { status = c; return res }, json(b) { cuerpo = JSON.stringify(b); return res }, end() { return res }, setHeader() { return res } }
  const req = { method: 'POST', headers: { 'x-supa-jwt': JWT, ...(cache ? { 'x-cache-precios': '1' } : {}) }, query: {}, body }
  const log = console.log, warn = console.warn, err = console.error
  console.log = (...a) => LOGS.push(a.join(' ')); console.warn = console.error = () => {}
  try { await handler(req, res) } catch (e) { cuerpo = 'EXCEPCION ' + e.message; status = -1 }
  finally { console.log = log; console.warn = warn; console.error = err }
  return { status, cuerpo }
}
// Quita SOLO los campos `origen` (en cualquier nivel).
const sinOrigen = (txt) => { try { return JSON.stringify(JSON.parse(txt), (k, v) => k === 'origen' ? undefined : v) } catch (_) { return txt } }
module.exports = { ESTADO, asegura, ESTRATEGIAS, FILAS, FOTO, HOY, estado, CACHE, llenaCache, vaciaCache, velasFoto, llama, sinOrigen, fechaMenosAnios, DATOS,
  logs: () => LOGS, limpiaLogs: () => { LOGS = [] } }
