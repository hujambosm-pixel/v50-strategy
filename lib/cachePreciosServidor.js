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
//   2. A la vez, pide a Yahoo solo lo reciente (el último mes; si no llega a la décima vela guardada
//      empezando por el final, que es el solape, se vuelve a pedir desde ahí): trae
//      las velas cerradas que falten, la vela en curso y el meta con la sesión, exactamente como
//      range=Ny (comprobado en vivo con la sesión abierta).
//   3. decideActualizacion compara el solape: si el histórico guardado ya no es el de Yahoo (split o
//      corrección) se descarga el símbolo entero y se REEMPLAZA, con el motivo; si no, se guarda lo
//      nuevo con guardar_velas.
//   4. Si la ventana empieza antes que lo guardado y el activo ya cotizaba entonces (firstTradeDate del
//      meta), se descarga SOLO ese tramo con period1/period2 y se guarda.
//   5. Devuelve las velas de la ventana: lo guardado hasta donde empieza lo reciente y, desde ahí, lo que
//      acaba de dar Yahoo, con su meta y su última marca de tiempo. Es lo mismo que daría range=Ny.
// Si no hay nada guardado en la ventana, se hace la descarga de siempre (range=Ny) y se guarda lo
// cerrado. Si Supabase no responde en 2 s, o falla cualquier paso, diariasConCache lanza y
// fetchAVDetalle sigue con la descarga de Yahoo de siempre. Un fallo al GUARDAR no hace eso: las velas
// ya son las correctas; solo se anota en el log.

import { AsyncLocalStorage } from 'async_hooks'
import { velasCerradas, decideActualizacion, deColumnasBd, aFilasBd, VENTANA_SOLAPE } from './cachePrecios'

export const CABECERA_CACHE = 'x-cache-precios'
export const ESPERA_SUPABASE_MS = 2000      // lectura: si no responde en esto, a Yahoo
export const ESPERA_ESCRITURA_MS = 5000
export const ANIOS_PROFUNDIDAD = 20         // lo que se descarga como mínimo al recargar un símbolo
const MAX_POR_LLAMADA = 10000               // guardar_velas admite 12.000 por llamada

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
const DIAS_RECIENTES = 31                   // lo reciente que se pide a Yahoo a la vez que se lee la caché
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
    const ctx = almacen.getStore()
    if (ctx && !(e?.status < 500)) ctx.caido = true
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

// descarga(url) → { rawData, metaSesion, tsUltima, estado: 'ok' | 'sin-datos' | 'error' } con el parseo
// de fetchAVDetalle. urlRango es la URL de range=Ny que usaría la descarga de siempre.
export async function diariasConCache(symbol, anios, { jwt, descarga, urlRango, hoy = hoyUTC(), ahora = Date.now() }) {
  if (almacen.getStore()?.caido) throw new Error('Supabase ya ha fallado en esta petición')
  const inicio = fechaMenosAnios(hoy, anios)
  const hasta = Math.floor(ahora / 1000) + 86400
  // La lectura de la caché y lo reciente de Yahoo (el último mes) van A LA VEZ: el tiempo es el del más
  // lento, no la suma. Se lee con unos días de margen por delante: si hay velas guardadas ANTES del
  // inicio, lo guardado cubre la ventana aunque esta empiece en un día sin sesión (sábado, festivo).
  const [leidas, ultimoMes] = await Promise.all([
    leeVelas(symbol, fechaMenosDias(inicio, MARGEN_DIAS), jwt),
    descarga(urlPeriodo(symbol, fechaMenosDias(hoy, DIAS_RECIENTES), hasta)),
  ])
  const cubreInicio = leidas.length > 0 && leidas[0].date < inicio
  const guardadas = leidas.filter(v => v.date >= inicio)

  // Nada guardado en la ventana: la descarga de siempre, y se guarda lo cerrado.
  if (!guardadas.length) {
    const y = await descarga(urlRango)
    if (y.estado !== 'ok') throw new Error('Yahoo no ha devuelto velas')
    const n = await guarda(symbol, velasCerradas(y.rawData, hoy), jwt, { reemplazar: true, motivo: 'primera carga en la caché' })
    console.log(`[cache-precios] ${symbol}: no estaba en la caché; descargado de Yahoo y guardadas ${n} velas`)
    return { rawData: y.rawData, metaSesion: y.metaSesion, tsUltima: y.tsUltima }
  }

  // Lo reciente tiene que empezar como muy tarde en la décima vela guardada empezando por el final (el
  // solape). El último mes casi siempre basta; si la caché lleva tiempo sin ponerse al día, se pide desde ahí.
  const desdeSolape = guardadas[Math.max(0, guardadas.length - VENTANA_SOLAPE)].date
  const reciente = ultimoMes.estado === 'ok' && ultimoMes.rawData[0].date <= desdeSolape
    ? ultimoMes
    : await descarga(urlPeriodo(symbol, desdeSolape, hasta))
  if (reciente.estado !== 'ok') throw new Error('Yahoo no ha devuelto las velas recientes')
  const d = decideActualizacion(guardadas, reciente.rawData, { hoy })
  if (d.accion === 'ampliar-solape') throw new Error('lo reciente no cubre las últimas velas guardadas')

  if (d.accion === 'recargar') {
    // Split o corrección: el histórico guardado ya no vale. Se descarga entero y se reemplaza.
    const desde = [inicio, fechaMenosAnios(hoy, ANIOS_PROFUNDIDAD), guardadas[0].date].sort()[0]
    const y = await descarga(urlPeriodo(symbol, desde, hasta))
    if (y.estado !== 'ok') throw new Error('Yahoo no ha devuelto el histórico para recargar')
    const n = await guarda(symbol, velasCerradas(y.rawData, hoy), jwt, { reemplazar: true, motivo: d.motivo })
    console.log(`[cache-precios] ${symbol}: RECARGADO (${d.motivo}); guardadas ${n} velas desde ${desde}`)
    return { rawData: y.rawData.filter(v => v.date >= inicio), metaSesion: y.metaSesion, tsUltima: y.tsUltima }
  }
  if (d.paraGuardar.length) await guarda(symbol, d.paraGuardar, jwt)

  // Tramo anterior a lo guardado, si el activo ya cotizaba.
  let anteriores = []
  const primera = guardadas[0].date
  const ftd = Number(reciente.metaSesion?.firstTradeDate)
  const primeraCotizacion = Number.isFinite(ftd) ? new Date(ftd * 1000).toISOString().slice(0, 10) : null
  if (!cubreInicio && primera > inicio && (!primeraCotizacion || primeraCotizacion < primera)) {
    const t = await descarga(urlPeriodo(symbol, inicio, epoch(primera)))
    if (t.estado === 'error') throw new Error('Yahoo no ha devuelto el tramo anterior a lo guardado')
    anteriores = (t.rawData || []).filter(v => v.date >= inicio && v.date < primera)
    const n = await guarda(symbol, velasCerradas(anteriores, hoy), jwt)
    console.log(`[cache-precios] ${symbol}: tramo ${inicio} → ${primera} descargado (${anteriores.length} velas, ${n} guardadas)`)
  }

  const desdeReciente = reciente.rawData[0].date
  const rawData = [...anteriores, ...guardadas.filter(v => v.date < desdeReciente), ...reciente.rawData]
    .filter(v => v.date >= inicio)
  return { rawData, metaSesion: reciente.metaSesion, tsUltima: reciente.tsUltima }
}
