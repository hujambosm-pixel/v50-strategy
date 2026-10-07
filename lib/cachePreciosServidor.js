// lib/cachePreciosServidor.js — la caché de precios en los backtests (SOLO servidor).
//
// Detrás de un interruptor: el ajuste «Usar caché de precios» (Ajustes → Integraciones, apagado por
// defecto). Con él encendido el cliente manda la cabecera `x-cache-precios: 1` en todas sus peticiones
// (apiFetch, pages/index.js). Las rutas de backtest —datos (salvo priceOnly), que sirve también al
// ranking, multibacktest y asset-detail— abren con conCachePrecios un contexto POR PETICIÓN con el JWT del
// usuario, y fetchAVDetalle (pages/api/datos.js) lo lee con cacheDeLaPeticion. Así no hay que pasar nada
// por cada una de las llamadas de descarga. Sin la cabecera, o sin JWT, no hay contexto y todo va como
// siempre.
//
// QUÉ HACE diariasConCache con un símbolo y N años (lib/cachePrecios.js tiene la lógica pura):
//   1. Lee de la caché, con leer_velas y el JWT del usuario, las velas desde el inicio de la ventana.
//      La ventana es la de range=Ny de Yahoo: desde la misma fecha de hace N años (UTC), comprobado
//      con AAPL, SAN.MC, ^GSPC, BTC-USD, ^N225 y META a 1, 5, 20 y 25 años.
//   2. Pide a Yahoo solo lo reciente (el último mes, o desde la décima vela guardada empezando por el
//      final, que es el solape, si es antes): trae
//      las velas cerradas que falten, la vela en curso y el meta con la sesión, exactamente como
//      range=Ny (comprobado en vivo con la sesión abierta).
//   3. decideActualizacion compara el solape: si el histórico guardado ya no es el de Yahoo (split o
//      corrección) se descarga el símbolo entero y se REEMPLAZA, con el motivo; si no, se guarda lo
//      nuevo con guardar_velas.
//   4. Si la ventana empieza antes que lo guardado y el activo ya cotizaba entonces (firstTradeDate del
//      meta), se descarga SOLO ese tramo con period1/period2 y se guarda.
//   5. Devuelve las velas de la ventana: lo guardado hasta donde empieza lo reciente y, desde ahí, lo que
//      acaba de dar Yahoo, con su meta y su última marca de tiempo. Es lo mismo que daría range=Ny.
// Lo leído se recuerda en la memoria del proceso, y con revisado_en se puede servir solo desde la caché
// (ver «Memoria del proceso» y «revisado_en» más abajo).
// Si no hay nada guardado en la ventana, se hace la descarga de siempre (range=Ny) y se guarda lo
// cerrado. Si Supabase no responde en 2 s, o falla cualquier paso, diariasConCache lanza y
// fetchAVDetalle sigue con la descarga de Yahoo de siempre. Un fallo al GUARDAR no hace eso: las velas
// ya son las correctas; solo se anota en el log.

import { AsyncLocalStorage } from 'async_hooks'
import { velasCerradas, combinaVelas, decideActualizacion, deColumnasBd, aFilasBd, VENTANA_SOLAPE } from './cachePrecios'
import { periodoRegular } from './sesion'

export const CABECERA_CACHE = 'x-cache-precios'
export const ESPERA_SUPABASE_MS = 2000      // lectura: si no responde en esto, a Yahoo
export const ESPERA_ESCRITURA_MS = 5000
export const ANIOS_PROFUNDIDAD = 20         // lo que se descarga como mínimo al recargar un símbolo
const MAX_POR_LLAMADA = 10000               // guardar_velas admite 12.000 por llamada
export const PAUSA_TRAS_CAIDA_MS = 60 * 1000 // tras una caída de Supabase, esta instancia no lo intenta en este tiempo
let supabaseCaidoHasta = 0

const almacen = new AsyncLocalStorage()

// Ejecuta fn con la caché activada si la petición la pide y trae JWT.
export function conCachePrecios(req, fn) {
  const usar = String(req?.headers?.[CABECERA_CACHE] ?? '') === '1'
  const jwt = req?.headers?.['x-supa-jwt']
  if (!usar || !jwt || typeof jwt !== 'string') return fn()
  return almacen.run({ jwt }, fn)
}
export const cacheDeLaPeticion = () => almacen.getStore() ?? null

const hoyUTC = () => new Date().toISOString().slice(0, 10)
export function fechaMenosAnios(fecha, anios) {
  const [y, m, d] = fecha.split('-').map(Number)
  return new Date(Date.UTC(y - anios, m - 1, d)).toISOString().slice(0, 10)
}
const MARGEN_DIAS = 10
const DIAS_RECIENTES = 31                   // lo reciente que se pide a Yahoo (como mínimo)
const fechaMenosDias = (fecha, dias) => new Date(Date.parse(fecha + 'T00:00:00Z') - dias * 86400000).toISOString().slice(0, 10)
const epoch = (fecha) => Math.floor(Date.parse(fecha + 'T00:00:00Z') / 1000)
const urlPeriodo = (symbol, desde, hastaEpoch) =>
  `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&period1=${epoch(desde)}&period2=${hastaEpoch}`

async function supabase(ruta, { jwt, cuerpo = null, ms }) {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('sin configuración de Supabase')
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  try {
    const r = await fetch(`${url}/rest/v1/${ruta}`, {
      method: cuerpo ? 'POST' : 'GET',
      signal: ctrl.signal,
      headers: { apikey: key, Authorization: `Bearer ${jwt}`, Accept: 'application/json',
        ...(cuerpo ? { 'Content-Type': 'application/json' } : {}) },
      ...(cuerpo ? { body: JSON.stringify(cuerpo) } : {}),
    })
    const txt = await r.text()
    if (!r.ok) throw Object.assign(new Error(`Supabase ${r.status}: ${txt.slice(0, 160)}`), { status: r.status })
    return txt ? JSON.parse(txt) : null
  } catch (e) {
    // Si Supabase está caído (red, espera agotada o un 5xx), el resto de descargas de ESTA petición van
    // directas a Yahoo: con Supabase colgado, un multiactivo o una tanda del ranking esperarían 2 s por
    // cada símbolo. Un 4xx (una vela rechazada, por ejemplo) no cuenta como caída.
    // Y durante PAUSA_TRAS_CAIDA_MS tampoco lo intentan las peticiones siguientes de esta instancia (salvo
    // lo que ya esté en la memoria del proceso, que no necesita Supabase): si no, cada backtest de una
    // tanda del ranking volvería a esperar sus 2 s.
    const ctx = almacen.getStore()
    if (!(e?.status < 500)) {
      if (ctx) ctx.caido = true
      supabaseCaidoHasta = Date.now() + PAUSA_TRAS_CAIDA_MS
    }
    if (e?.name === 'AbortError') throw new Error(`Supabase no ha respondido en ${ms} ms`)
    throw e
  } finally { clearTimeout(t) }
}

// leer_velas es STABLE: PostgREST la sirve por GET.
const leeVelas = async (symbol, desde, jwt) => deColumnasBd(await supabase(
  `rpc/leer_velas?p_simbolo=${encodeURIComponent(symbol)}&p_desde=${desde}`, { jwt, ms: ESPERA_SUPABASE_MS }))

// Guarda en tandas; con reemplazar, solo la primera borra lo anterior. Nunca lanza: lo que se devuelve
// ya está bien, así que un fallo aquí solo se anota.
async function guarda(symbol, velas, jwt, { reemplazar = false, motivo = null } = {}) {
  if (!velas.length && !reemplazar) return 0
  let n = 0
  try {
    for (let i = 0; i < Math.max(velas.length, 1); i += MAX_POR_LLAMADA) {
      n += Number(await supabase('rpc/guardar_velas', { jwt, ms: ESPERA_ESCRITURA_MS, cuerpo: {
        p_simbolo: symbol, p_filas: aFilasBd(velas.slice(i, i + MAX_POR_LLAMADA)),
        p_reemplazar: reemplazar && i === 0, p_motivo: reemplazar && i === 0 ? motivo : null } })) || 0
    }
  } catch (e) {
    console.log(`[cache-precios] ${symbol}: no se han podido guardar las velas (${e.message}); el backtest sigue`)
  }
  return n
}

// ── Memoria del proceso ─────────────────────────────────────────────────────────────────────────────
// Dentro de una misma instancia del servidor, lo leído de la caché se reutiliza en las peticiones
// siguientes: en una tanda del ranking el mismo activo se pide una vez por estrategia.
//   velas     las CERRADAS de cada símbolo (fecha < hoy UTC), tal como las devolvería leer_velas desde
//             `desde`, más el estado de precios_simbolos (revisado_en, ultima_fecha, sesion). Valen
//             MEMORIA_VELAS_MS y solo el mismo día UTC. Se actualizan con lo que se guarda.
//   recientes lo último que dio Yahoo (el último mes, con la vela de hoy y el meta de la sesión). SOLO se
//             reutiliza con la sesión CERRADA, durante MEMORIA_RECIENTE_MS como mucho y nunca pasado el
//             primer momento en que podría empezar la sesión siguiente: el inicio anunciado si todavía no
//             ha llegado, o el inicio de la sesión terminada más 23 horas (una sesión diaria no vuelve a
//             abrir antes; con el cambio de hora, una hora antes). Con la sesión abierta, nunca: la vela en
//             curso se pide siempre a Yahoo.
// Lo que sale de aquí son COPIAS: el motor puede tocar las velas que recibe.
export const MEMORIA_VELAS_MS = 10 * 60 * 1000
export const MEMORIA_RECIENTE_MS = 60 * 1000
export const REVISADO_VALIDO_MS = 15 * 60 * 1000
const MAX_SIMBOLOS_MEMORIA = 300
const memoriaVelas = new Map()
const memoriaReciente = new Map()
const lecturasEnCurso = new Map()
export function vaciaMemoriaPrecios() { memoriaVelas.clear(); memoriaReciente.clear(); supabaseCaidoHasta = 0 }
const copia = (velas) => velas.map(v => ({ ...v }))
function recuerda(mapa, symbol, valor) {
  mapa.delete(symbol)
  mapa.set(symbol, valor)
  if (mapa.size > MAX_SIMBOLOS_MEMORIA) mapa.delete(mapa.keys().next().value)   // el más antiguo
  return valor
}
function velasDeMemoria(symbol, hoy, desde, ahora) {
  const m = memoriaVelas.get(symbol)
  if (!m || m.hoy !== hoy || ahora - m.t > MEMORIA_VELAS_MS || m.desde > desde) return null
  return m
}
function recienteDeMemoria(symbol, hoy, ahora) {
  const r = memoriaReciente.get(symbol)
  return r && r.hoy === hoy && ahora < r.hasta ? r : null
}
// Lo reciente se recuerda solo si la sesión está cerrada (ver arriba).
function recuerdaReciente(symbol, r, hoy, ahora) {
  const p = periodoRegular(r.metaSesion)
  const ahoraSeg = Math.floor(ahora / 1000)
  if (!p || (ahoraSeg >= p.inicio && ahoraSeg < p.fin)) return
  const proxima = ahoraSeg < p.inicio ? p.inicio : p.inicio + 23 * 3600
  const hasta = Math.min(ahora + MEMORIA_RECIENTE_MS, proxima * 1000)
  if (hasta > ahora) recuerda(memoriaReciente, symbol, { hoy, hasta, rawData: r.rawData, metaSesion: r.metaSesion, tsUltima: r.tsUltima })
}

// ── revisado_en: solo la caché, sin preguntar a Yahoo ──────────────────────────────────────────────
// Si otra petición (de esta u otra instancia) revisó el símbolo contra Yahoo hace menos de 15 minutos, y
// entonces Yahoo ya anunciaba la sesión siguiente, no tenía ninguna vela que no estuviera en la caché y
// esa sesión todavía no ha empezado, Yahoo devolvería ahora exactamente lo mismo: las velas guardadas,
// la misma última marca de tiempo y el mismo periodo de sesión. Eso guarda marcar_revisado en
// precios_simbolos.sesion, y es lo único del meta que usa el motor (lib/sesion.js).
function atajoRevisado(estado, guardadas, ahora) {
  const s = estado?.sesion
  if (!s || !estado.revisado_en) return null
  if (!(ahora - Date.parse(s.en) < REVISADO_VALIDO_MS) || !(ahora - Date.parse(estado.revisado_en) < REVISADO_VALIDO_MS)) return null
  if (!(Math.floor(ahora / 1000) < Number(s.inicio))) return null
  if (estado.ultima_fecha !== s.fechaUltima || guardadas[guardadas.length - 1]?.date !== s.fechaUltima) return null
  return { rawData: [], tsUltima: Number(s.tsUltima),
    metaSesion: { currentTradingPeriod: { regular: { start: Number(s.inicio), end: Number(s.fin) } },
      ...(s.firstTradeDate != null ? { firstTradeDate: s.firstTradeDate } : {}) } }
}
// ¿Se puede anotar la sesión para el atajo? Yahoo ya anuncia la sesión siguiente, su última vela es
// anterior a hoy y la caché la tiene.
function sesionParaAnotar(r, hoy, ahora, ultimaGuardada) {
  const p = periodoRegular(r.metaSesion)
  const ultima = r.rawData[r.rawData.length - 1]
  if (!p || !(Math.floor(ahora / 1000) < p.inicio) || !(ultima.date < hoy) || ultima.date !== ultimaGuardada) return null
  if (!Number.isFinite(r.tsUltima) || r.tsUltima === p.inicio) return null
  const ftd = Number(r.metaSesion?.firstTradeDate)
  return { inicio: p.inicio, fin: p.fin, tsUltima: r.tsUltima, fechaUltima: ultima.date, ...(Number.isFinite(ftd) ? { firstTradeDate: ftd } : {}) }
}
const leeEstado = async (symbol, jwt) => (await supabase(
  `precios_simbolos?simbolo=eq.${encodeURIComponent(symbol)}&select=revisado_en,ultima_fecha,sesion`, { jwt, ms: ESPERA_SUPABASE_MS }))?.[0] ?? null
async function marcaRevisado(symbol, sesion, jwt) {
  try { return (await supabase('rpc/marcar_revisado', { jwt, ms: ESPERA_ESCRITURA_MS, cuerpo: { p_simbolo: symbol, p_sesion: sesion } })) === true }
  catch (e) { console.log(`[cache-precios] ${symbol}: no se ha podido anotar la revisión (${e.message})`); return false }
}

// descarga(url) → { rawData, metaSesion, tsUltima, estado: 'ok' | 'sin-datos' | 'error' } con el parseo
// de fetchAVDetalle. urlRango es la URL de range=Ny que usaría la descarga de siempre.
export async function diariasConCache(symbol, anios, { jwt, descarga, urlRango, hoy = hoyUTC(), ahora = Date.now() }) {
  const inicio = fechaMenosAnios(hoy, anios)
  const hasta = Math.floor(ahora / 1000) + 86400
  // Se lee con unos días de margen por delante: si hay velas guardadas ANTES del inicio, lo guardado
  // cubre la ventana aunque esta empiece en un día sin sesión (sábado, festivo).
  const desdeLectura = fechaMenosDias(inicio, MARGEN_DIAS)

  // 1. Las velas cerradas: de la memoria del proceso o, si no están, de la caché (con su estado).
  let mem = velasDeMemoria(symbol, hoy, desdeLectura, ahora)
  if (!mem) {
    if (almacen.getStore()?.caido) throw new Error('Supabase ya ha fallado en esta petición')
    if (ahora < supabaseCaidoHasta) throw new Error('Supabase ha fallado hace menos de un minuto en esta instancia')
    // Varias peticiones a la vez por el mismo símbolo (el primer lote de una tanda, el ^GSPC de todas)
    // comparten UNA lectura.
    const clave = `${symbol}|${desdeLectura}|${hoy}`
    let lectura = lecturasEnCurso.get(clave)
    if (!lectura) {
      lectura = Promise.all([leeVelas(symbol, desdeLectura, jwt), leeEstado(symbol, jwt)]).finally(() => lecturasEnCurso.delete(clave))
      lecturasEnCurso.set(clave, lectura)
    }
    const [velas, estado] = await lectura
    mem = velasDeMemoria(symbol, hoy, desdeLectura, ahora) || recuerda(memoriaVelas, symbol, { hoy, desde: desdeLectura, velas, estado, t: ahora })
  }
  const leidas = mem.velas.filter(v => v.date >= desdeLectura)
  const cubreInicio = leidas.length > 0 && leidas[0].date < inicio
  const guardadas = leidas.filter(v => v.date >= inicio)

  // Nada guardado en la ventana: la descarga de siempre, y se guarda lo cerrado.
  if (!guardadas.length) {
    const y = await descarga(urlRango)
    if (y.estado !== 'ok') throw new Error('Yahoo no ha devuelto velas')
    const cerradas = velasCerradas(y.rawData, hoy)
    const n = await guarda(symbol, cerradas, jwt, { reemplazar: true, motivo: 'primera carga en la caché' })
    console.log(`[cache-precios] ${symbol}: no estaba en la caché; descargado de Yahoo y guardadas ${n} velas`)
    recuerda(memoriaVelas, symbol, { hoy, desde: desdeLectura, velas: cerradas, estado: null, t: ahora })
    recuerdaReciente(symbol, { ...y, rawData: y.rawData.filter(v => v.date >= fechaMenosDias(hoy, DIAS_RECIENTES)) }, hoy, ahora)
    return { rawData: copia(y.rawData), metaSesion: y.metaSesion, tsUltima: y.tsUltima }
  }

  // 2. Lo reciente: de la memoria (sesión cerrada), solo de la caché (revisado_en) o de Yahoo.
  let reciente = recienteDeMemoria(symbol, hoy, ahora) || atajoRevisado(mem.estado, guardadas, ahora)
  if (!reciente) {
    // Tiene que empezar como muy tarde en la décima vela guardada empezando por el final (el solape).
    const desdeSolape = guardadas[Math.max(0, guardadas.length - VENTANA_SOLAPE)].date
    const r = await descarga(urlPeriodo(symbol, [fechaMenosDias(hoy, DIAS_RECIENTES), desdeSolape].sort()[0], hasta))
    if (r.estado !== 'ok') throw new Error('Yahoo no ha devuelto las velas recientes')
    const d = decideActualizacion(guardadas, r.rawData, { hoy })
    if (d.accion === 'ampliar-solape') throw new Error('lo reciente no cubre las últimas velas guardadas')

    if (d.accion === 'recargar') {
      // Split o corrección: el histórico guardado ya no vale. Se descarga entero y se reemplaza.
      const desde = [inicio, fechaMenosAnios(hoy, ANIOS_PROFUNDIDAD), guardadas[0].date].sort()[0]
      const y = await descarga(urlPeriodo(symbol, desde, hasta))
      if (y.estado !== 'ok') throw new Error('Yahoo no ha devuelto el histórico para recargar')
      const cerradas = velasCerradas(y.rawData, hoy)
      const n = await guarda(symbol, cerradas, jwt, { reemplazar: true, motivo: d.motivo })
      console.log(`[cache-precios] ${symbol}: RECARGADO (${d.motivo}); guardadas ${n} velas desde ${desde}`)
      recuerda(memoriaVelas, symbol, { hoy, desde, velas: cerradas, estado: null, t: ahora })
      memoriaReciente.delete(symbol)
      return { rawData: copia(y.rawData.filter(v => v.date >= inicio)), metaSesion: y.metaSesion, tsUltima: y.tsUltima }
    }
    let guardadoTodo = true
    if (d.paraGuardar.length) {
      guardadoTodo = (await guarda(symbol, d.paraGuardar, jwt)) === d.paraGuardar.length
      mem.velas = combinaVelas(mem.velas, d.paraGuardar)
    }
    reciente = r
    recuerdaReciente(symbol, r, hoy, ahora)
    // revisado_en con la sesión anunciada, para que otras peticiones puedan servir solo desde la caché.
    const sesion = guardadoTodo ? sesionParaAnotar(r, hoy, ahora, mem.velas[mem.velas.length - 1]?.date) : null
    if (sesion && await marcaRevisado(symbol, sesion, jwt)) {
      const en = new Date(ahora).toISOString()
      mem.estado = { ...(mem.estado || {}), revisado_en: en, ultima_fecha: sesion.fechaUltima, sesion: { ...sesion, en } }
    }
  }

  // 3. Tramo anterior a lo guardado, si el activo ya cotizaba.
  let anteriores = []
  const primera = guardadas[0].date
  const ftd = Number(reciente.metaSesion?.firstTradeDate)
  const primeraCotizacion = Number.isFinite(ftd) ? new Date(ftd * 1000).toISOString().slice(0, 10) : null
  if (!cubreInicio && primera > inicio && (!primeraCotizacion || primeraCotizacion < primera)) {
    const t = await descarga(urlPeriodo(symbol, inicio, epoch(primera)))
    if (t.estado === 'error') throw new Error('Yahoo no ha devuelto el tramo anterior a lo guardado')
    anteriores = (t.rawData || []).filter(v => v.date >= inicio && v.date < primera)
    const cerradas = velasCerradas(anteriores, hoy)
    const n = await guarda(symbol, cerradas, jwt)
    mem.velas = combinaVelas(cerradas, mem.velas)
    console.log(`[cache-precios] ${symbol}: tramo ${inicio} → ${primera} descargado (${anteriores.length} velas, ${n} guardadas)`)
  }

  // 4. La ventana: lo guardado hasta donde empieza lo reciente y, desde ahí, lo reciente.
  const desdeReciente = reciente.rawData[0]?.date ?? '9999-12-31'
  const rawData = [...anteriores, ...guardadas.filter(v => v.date < desdeReciente), ...reciente.rawData]
    .filter(v => v.date >= inicio)
  return { rawData: copia(rawData), metaSesion: reciente.metaSesion, tsUltima: reciente.tsUltima }
}
