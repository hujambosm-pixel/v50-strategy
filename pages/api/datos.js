// pages/api/datos.js — Motor V50 v3.0 (V9.260)

import { exigeAuth } from '../../lib/verificaJwt'
import { semanalesDesdeDiarias } from '../../lib/velasSemanales'
import { marcaDiariaEnCurso, semanaEnCurso } from '../../lib/sesion'
import { recortaIndicadores, marcasDelPeriodo } from '../../lib/periodo'
import { normalizaComisiones } from '../../lib/comisiones'
import { calcEquityCurves } from '../../lib/nucleoBacktest'
import { backtestActivo } from '../../lib/backtestActivo'
import { conCachePrecios, cacheDeLaPeticion, diariasConCache } from '../../lib/cachePreciosServidor'

const SUPA_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPA_KEY = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// ── In-memory price cache (priceOnly mode) — 60s TTL ──────────
// Shared across requests within the same Vercel function instance.
// Avoids redundant Stooq/Yahoo fetches when multiple open positions
// are fetched sequentially within the same refresh cycle.
// La clave llevaba SOLO el símbolo, así que podía servir a cualquiera el precio que hubiera dejado
// cualquier otro. Ahora lleva también el intervalo, y el valor guarda de qué proveedor salió.
// El proveedor NO puede formar parte de la clave de LECTURA —no se sabe hasta después de descargar—, así
// que va en el valor: quien lea sabe qué está leyendo en vez de recibirlo a ciegas.
const priceCache = new Map() // key: `símbolo|intervalo` → { price, date, origen, timestamp }
const CACHE_TTL  = 60 * 1000 // 60 seconds

const clavePrecio = (symbol, interval='d') => `${symbol}|${interval}`
// Exportadas para que /api/precios use ESTA caché y no una paralela: un símbolo que acabe de pedir el
// Dashboard llega allí ya resuelto. El valor guarda además el cierre ANTERIOR (`prev`), que es lo que
// permite calcular la variación diaria sin una segunda ronda de descargas. Es un campo más en un valor
// interno: la respuesta de esta ruta no cambia.
export function getCachedPrice(symbol, interval='d') {
  const k = clavePrecio(symbol, interval)
  const entry = priceCache.get(k)
  if (!entry) return null
  if (Date.now() - entry.timestamp > CACHE_TTL) { priceCache.delete(k); return null }
  return entry
}
export function setCachedPrice(symbol, price, date, origen, interval='d', prev=null) {
  priceCache.set(clavePrecio(symbol, interval), { price, date, origen, prev, timestamp: Date.now() })
}

// Una descarga de Yahoo con 4 segundos de espera, parseada como la ha usado siempre el motor. La usan la
// descarga de siempre (range=Ny) y la caché de precios (period1/period2), para que las dos den los
// mismos números. estado: 'ok' (hay velas), 'sin-datos' (Yahoo responde que no hay nada en ese tramo)
// o 'error' (red, espera agotada u otra respuesta).
export async function descargaYahoo(yfUrl) {
  let rawData = null, metaSesion = null, tsUltima = null, estado = 'error'
  const yfCtrl = new AbortController()
  const yfTimer = setTimeout(() => yfCtrl.abort(), 4000)
  try {
    const yfR = await fetch(yfUrl, {
      signal: yfCtrl.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json'
      }
    })
    if (yfR.ok) {
      const yfJson = await yfR.json()
      const timestamps = yfJson?.chart?.result?.[0]?.timestamp
      const quotes = yfJson?.chart?.result?.[0]?.indicators?.quote?.[0]
      // El meta trae el periodo regular de la sesión: con él se sabe si la última vela está
      // cerrada. Ver lib/sesion.js.
      metaSesion = yfJson?.chart?.result?.[0]?.meta ?? null
      estado = 'sin-datos'
      if (timestamps && quotes) {
        tsUltima = Number(timestamps[timestamps.length - 1])
        rawData = timestamps.map((t,i) => ({
          date: new Date(t*1000).toISOString().slice(0,10),
          open:  quotes.open?.[i]  || quotes.close?.[i],
          high:  quotes.high?.[i]  || quotes.close?.[i],
          low:   quotes.low?.[i]   || quotes.close?.[i],
          close: quotes.close?.[i],
          volume: quotes.volume?.[i] || 0
        })).filter(d=>d.close&&!isNaN(d.close))
        if (rawData.length) estado = 'ok'
      }
    } else if (yfR.status === 400) {
      // «Data doesn't exist for startDate…»: un tramo anterior a la salida a bolsa.
      const txt = await yfR.text().catch(() => '')
      if (/Data doesn't exist/i.test(txt)) estado = 'sin-datos'
    }
  } catch(_) {
    // timeout or network error → rawData stays null
  } finally {
    clearTimeout(yfTimer)
  }
  return { rawData, metaSesion, tsUltima, estado }
}

// Devuelve las barras Y su procedencia. `fetchAV` sigue existiendo con su firma y su valor de siempre
// —el array— como envoltorio, así que ningún consumidor cambia.
//   origen              'yahoo', o 'cache' si las velas han salido de la caché de precios (el interruptor
//                       de Ajustes; ver lib/cachePreciosServidor.js). La cabecera del multiactivo lo muestra.
//   ajustadoDividendos  SIEMPRE false, y por eso se llama así. El campo se llamaba `ajustado` y valía
//                       `origen === 'stooq'`, lo que insinuaba que lo de Yahoo no estaba ajustado de
//                       ninguna manera. Sí lo está por SPLITS —el cierre de indicators.quote[0] los
//                       incorpora, comprobado con NVDA— y no lo está por DIVIDENDOS. El nombre nuevo
//                       dice exactamente eso y no deja sitio a la duda.
//   ms                  cuánto tardó.
//
// STOOQ, FUERA. Respondía 403 «Access denied» a todas las peticiones y se gastaba hasta 3 segundos de
// espera antes de caer a Yahoo, en cada símbolo y cada intervalo. El 100 % de los datos venía ya de
// Yahoo, así que lo único que aportaba era latencia y una rama de código que nadie recorría.
//
// SEMANALES: se descarga SIEMPRE en diario y se agregan aquí (lib/velasSemanales.js). Yahoo devuelve
// dos velas para la última semana —la del lunes y otra con solo el último día— y el motor tomaba la
// segunda como una semana más.
export async function fetchAVDetalle(symbol, years=5, interval='d') {
  const _t0 = Date.now()
  let origen = null
  let rawData = null
  let metaSesion = null, tsUltima = null
  const semanal = interval === 'w'
  // Siempre diario: las semanales se construyen después a partir de estas mismas velas.
  const yfInterval = '1d'
  // Se piden los años solicitados, sin tope: range=Ny sirve velas diarias hasta toda la historia
  // del activo (si se pide más, Yahoo devuelve lo que hay). NO usar range=max: degrada a velas
  // trimestrales. En semanal NO hace falta pedir más: la diaria a 20 años son ~5.031 velas sin un
  // solo hueco de más de 5 días, así que el mismo rango de calendario cubre las mismas semanas.
  const yfYears = Math.max(Math.ceil(years), 1)
  const yfUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${yfInterval}&range=${yfYears}y`

  // ── Caché de precios, si la petición la pide (ver lib/cachePreciosServidor.js) ──
  // Devuelve la misma ventana que range=Ny. Si falla cualquier paso, se sigue con la descarga de siempre.
  const _cache = cacheDeLaPeticion()
  if (_cache) {
    try {
      ;({ rawData, metaSesion, tsUltima } = await diariasConCache(symbol, yfYears,
        { jwt: _cache.jwt, descarga: descargaYahoo, urlRango: yfUrl }))
      origen = 'cache'
    } catch (e) {
      console.log(`[cache-precios] ${symbol}: ${e.message}; se sigue con la descarga de Yahoo`)
      rawData = null; metaSesion = null; tsUltima = null
    }
  }

  // ── Yahoo Finance, con 4 segundos de espera ──
  if (!rawData) {
    ;({ rawData, metaSesion, tsUltima } = await descargaYahoo(yfUrl))
    if (rawData?.length) origen = 'yahoo'
  }

  const _ms = Date.now() - _t0
  if (!rawData || rawData.length === 0) {
    console.log(`[precios] ${symbol} (${interval}): SIN DATOS tras ${_ms} ms`)
    throw new Error(`Sin datos para ${symbol}`)
  }
  // ¿Está abierta la sesión de la última vela? Si no hay información de sesión se trata como
  // cerrada —el comportamiento de siempre— y se deja dicho en el log: tratarla como abierta
  // descartaría la última vela de todos los símbolos cuyo meta venga incompleto.
  const marcada = marcaDiariaEnCurso(rawData, tsUltima, metaSesion)
  if (marcada.sinDato) console.log(`[precios] ${symbol}: sin currentTradingPeriod en el meta; la última vela se trata como CERRADA`)
  rawData = marcada.barras
  // En semanal, las velas que salen de aquí son las construidas, no las de Yahoo.
  const data = semanal
    ? semanalesDesdeDiarias(rawData, { semanaEnCurso: (lunes) => semanaEnCurso(lunes, metaSesion) })
    : rawData
  // Una línea por descarga, con las dos cifras cuando hay agregación: así en el log se ve de cuántas
  // velas diarias salió cada serie semanal.
  console.log(`[precios] ${symbol} (${interval}): ${origen} · ${data.length} velas
    ${semanal ? `(de ${rawData.length} diarias) ` : ''}· ${_ms} ms`.replace(/\s+/g, ' '))
  return { data, origen, ajustadoDividendos: false, ms: _ms }
}
// calcEquityCurves vive ahora en lib/nucleoBacktest.js; se sigue exportando desde aquí.
export { calcEquityCurves }

// Envoltorio de compatibilidad: mismo nombre, misma firma y mismo valor de retorno de siempre.
export async function fetchAV(symbol, years=5, interval='d') {
  return (await fetchAVDetalle(symbol, years, interval)).data
}

// ── Handler ──────────────────────────────────────────────────
// La caché de precios va en un contexto por petición (lib/cachePreciosServidor.js). priceOnly queda
// fuera: es una consulta de un año para el último precio y la descarga de siempre es más rápida.
export default function handler(req, res) {
  if (req.body?.priceOnly) return handlerDatos(req, res)
  return conCachePrecios(req, () => handlerDatos(req, res))
}
async function handlerDatos(req, res) {
  try {
  if (req.method !== 'POST') return res.status(405).end()
  // AUTENTICACIÓN OBLIGATORIA. Sin JWT válido no se sirve nada: 401 antes de tocar Supabase o
  // cualquier proveedor. Incluye las acciones que no hablan con la base de datos, a propósito.
  // La única excepción es que el verificador no haya podido comprobar el token (JWKS caído): ahí
  // exigeAuth deja pasar con el token del cliente y lo registra. Ver lib/verificaJwt.js.
  const auth = await exigeAuth('datos', req, req.query?.action)
  if (!auth.ok) return res.status(401).json({ error: 'no autenticado' })
  // Igual que asset-detail: no miraba la cabecera. Local a la petición, no de módulo.
  const _jwt = req.headers['x-supa-jwt'] || null

  const { simbolo, strategyId, capital_ini = 10000, years = 5, allocation_pct = 100, priceOnly, filtros, intervalo,
          fromDate = null, toDate = null, comisiones = null, params = null } = req.body || {}
  // Si no llegan, todo a cero: el cliente todavia no las manda. Ver lib/comisiones.js.
  const _com = normalizaComisiones(comisiones)
  if (!simbolo) return res.status(400).json({ error: 'simbolo requerido' })

  // ── Price-only mode: last close, no strategy execution ──
  if (priceOnly) {
    // Check in-memory cache first (60s TTL) — avoids repeated Stooq/Yahoo hits
    const cached = getCachedPrice(simbolo)
    if (cached !== null) {
      return res.status(200).json({ meta: { ultimaFecha: cached.date, ultimoPrecio: cached.price, simbolo, origen: cached.origen ?? null }, fromCache: true })
    }
    try {
      const { data, origen } = await fetchAVDetalle(simbolo, 1)
      const last = data[data.length - 1]
      // Se guarda también el cierre anterior, que ya está aquí a mano: así una llamada de priceOnly deja
      // la caché completa para /api/precios y no hace falta volver a descargar para la variación diaria.
      const prev = data.length > 1 ? data[data.length - 2]?.close ?? null : null
      setCachedPrice(simbolo, last.close, last.date, origen, 'd', prev)
      return res.status(200).json({ meta: { ultimaFecha: last.date, ultimoPrecio: last.close, simbolo, origen } })
    } catch(e) {
      console.error(`[datos] priceOnly fetch failed for ${simbolo}:`, e.message)
      return res.status(200).json({ error: true, errorMessage: `Sin precio para ${simbolo}: ${e.message}` })
    }
  }

  // ── Fetch code_js from Supabase ──
  let codeJs = null, stratParams = null, stratVisuals = null, stratName = null
  if (strategyId) {
    try {
      const r = await fetch(
        `${SUPA_URL}/rest/v1/strategies?id=eq.${strategyId}&select=code_js,params,visuals,name`,
        { headers: { apikey: SUPA_KEY, Authorization: `Bearer ${_jwt}` } }
      )
      if (r.ok) {
        const row = (await r.json())?.[0] || {}
        codeJs       = row.code_js || null
        stratParams  = row.params  || null
        stratVisuals = row.visuals || null
        stratName    = row.name    || null
      }
    } catch (_) {}
  }

  if (!codeJs) {
    return res.status(400).json({ error: 'Esta estrategia no tiene código generado. Abre el editor y usa "Generar con Claude".' })
  }

  try {
    // Periodo, calentamiento, descargas, filtros, compilar el code_js y el núcleo: lib/backtestActivo.js,
    // que comparte /api/ranking-activo. Aquí se construye la respuesta con lo que devuelve.
    const { desde, hasta, modo, nCal, data, _corte, anyFiltroOn, filterZonesFromFiltros, sinSerieSemanal, _nucleo } =
      await backtestActivo({ simbolo, codeJs, stratParams, stratName, capital_ini, years, allocation_pct, filtros,
        intervalo, fromDate, toDate, comisiones: _com, params }, { fetchAV, grafico: true })
    const _result = _nucleo.resultado
    // Calculados sobre la serie con calentamiento y consumidos por indice contra las velas del
    // periodo: hay que devolverlos a esa rejilla o salen desplazados. Ver lib/periodo.js.
    const indicators     = recortaIndicadores(_result.indicators ?? {}, _corte.iDesde, data.length)
    const rawFilterZones = _result.filterZones  ?? []
    const slopeChanges   = _result.slopeChanges   ?? []
    const customMarkers  = _result.customMarkers  ?? []
    const grafico        = _nucleo.grafico
    const trades         = _nucleo.trades
    const _heredadas     = _nucleo.heredadas
    const _nAjustados    = _nucleo.nAjustados

    // ── Inject indicators into chartData bars ──
    const emaRArr      = indicators.emaR       || indicators.emaFast  || null
    const emaLArr      = indicators.emaL       || indicators.emaSlow  || null
    const ema3Arr      = indicators.ema3       || null
    const macdLineArr  = indicators.macdLine   || null
    const signalLineArr= indicators.signalLine || null
    const histogramArr = indicators.histogram  || null
    const rsiLineArr   = indicators.rsi        || indicators.rsiLine  || null
    const rsiMAArr     = indicators.rsiMA      || null
    const rsiOBVal     = indicators.obLevel    ?? indicators.rsiOB    ?? null
    const rsiOSVal     = indicators.osLevel    ?? indicators.rsiOS    ?? null
    const bbUpperArr   = indicators.bbUpper    || null
    const bbMidArr     = indicators.bbMid      || null
    const bbLowerArr   = indicators.bbLower    || null
    const volArr       = indicators.volume     || null
    const volAvgArr    = indicators.volumeAvg  || null
    if (indicators?.ema3) {
      console.log('[EMA3-DEBUG]', {
        ema3Length: indicators.ema3.length,
        sampleValues: indicators.ema3.slice(50, 53)
      })
    }
    const chartData = data.map((d, i) => ({
      ...d,
      emaR:       emaRArr?.[i]       ?? null,
      emaL:       emaLArr?.[i]       ?? null,
      ema3:       ema3Arr?.[i]       ?? null,
      macdLine:   macdLineArr?.[i]   ?? null,
      signalLine: signalLineArr?.[i] ?? null,
      histogram:  histogramArr?.[i]  ?? null,
      rsiLine:    rsiLineArr?.[i]    ?? null,
      rsiMA:      rsiMAArr?.[i]      ?? null,
      rsiOB:      rsiLineArr         ? (rsiOBVal ?? 75) : null,
      rsiOS:      rsiLineArr         ? (rsiOSVal ?? 25) : null,
      bbUpper:    bbUpperArr?.[i]    ?? null,
      bbMid:      bbMidArr?.[i]      ?? null,
      bbLower:    bbLowerArr?.[i]    ?? null,
      // EL VOLUMEN DESCARGADO MANDA. Antes era `volArr?.[i] ?? null`, y volArr es indicators.volume del
      // code_js: una estrategia que no devolviera volumen dejaba la barra SIN volumen aunque la descarga
      // lo trajera —Stooq lo parsea (l.split) y Yahoo también (quotes.volume)—, y el panel de volumen
      // del gráfico, que se enciende con `d.volume > 0`, no aparecía nunca. El dato estaba y se tiraba.
      // El del code_js sigue teniendo preferencia cuando existe: una estrategia puede devolver un
      // volumen tratado —ajustado, en otra unidad— y ese es el que miró para decidir.
      volume:     volArr?.[i]        ?? d.volume ?? null,
      volumeAvg:  volAvgArr?.[i]     ?? null,
    }))
    if (indicators?.macdLine) {
      const first3 = chartData.filter(b => b.macdLine != null).slice(0, 3)
        .map(b => ({ date: b.date, macdLine: b.macdLine, signalLine: b.signalLine, histogram: b.histogram }))
      console.log('[MACD-INJECT]', {
        macdLineLength: indicators.macdLine.length,
        barsLength: chartData.length,
        aligned: indicators.macdLine.length === chartData.length,
        first3WithData: first3,
      })
    }

    // ── Summary metrics, curvas de equity y MaxDD con flotante: del núcleo ──
    const { gananciaSimple, capitalReinv, ganBH, curves, maxDDStrategyFloat } = _nucleo.metricas

    // ── Cobertura del periodo pedido ──
    // Si el activo no tiene datos desde el corte (hoy − años), el backtest cubre menos de lo pedido y hasta
    // ahora no lo decía: las cifras ya se calculan sobre data[0].date, pero el usuario no sabía que sus N
    // años eran menos. Tolerancia de 10 días naturales: el corte es una fecha de calendario y la primera
    // vela puede llegar días después por fin de semana, festivo o vela semanal. La causa —activo que empezó
    // a cotizar más tarde o descarga sin más historia— no se puede distinguir con lo que devuelve fetchAV.
    // Lo pedido es ahora la fecha de inicio del periodo, no un corte calculado de los años:
    // «últimos N años» ya se ha traducido a desde/hasta en normalizaPeriodo.
    const solicitadoDesde = desde
    const avisosHistorico = (new Date(data[0].date) - new Date(solicitadoDesde)) / 86400000 > 10
      ? { solicitadoDesde, realDesde: data[0].date }
      : null

    return res.status(200).json({
      chartData,
      // Solo presente si el activo no cubre el periodo pedido (se omite en otro caso, como avisosFiltros)
      ...(avisosHistorico ? { avisosHistorico } : {}),
      // Solo si hubo alguna corrección, igual que avisosHistorico y avisosFiltros: así una
      // respuesta sin correcciones sigue siendo idéntica a la de antes de este cambio.
      ...(_nAjustados ? { preciosAjustados: _nAjustados } : {}),
      trades,
      filterZones: anyFiltroOn ? filterZonesFromFiltros : marcasDelPeriodo(rawFilterZones, desde, hasta),
      // Solo presente si hay algo que avisar: símbolos cuya serie semanal no se pudo descargar y
      // que por tanto operaron SIN el filtro de activo en semanal (fail-open silencioso de otro modo).
      ...(sinSerieSemanal.length ? { avisosFiltros: { sinSerieSemanal } } : {}),
      // Del PERIODO: la estrategia tambien ha mirado las velas de calentamiento, y sus cruces y
      // marcadores existen de verdad, pero no son del backtest y el grafico no los puede pintar.
      slopeChanges:   marcasDelPeriodo(slopeChanges, desde, hasta),
      customMarkers:  marcasDelPeriodo(customMarkers, desde, hasta),
      gananciaSimple,
      capitalReinv,
      ganBH,
      startDate: data[0].date,
      // El periodo puede empezar con la estrategia ya dentro de una operación: entonces no puede
      // entrar hasta que salga, y eso explica un arranque sin operar. Solo viaja si hay alguna.
      ...(_heredadas.length ? { posicionesHeredadas: _heredadas } : {}),
      periodo: { desde, hasta, modo, calentamiento: _corte.calentamientoReal, calentamientoPedido: nCal },
      maxDDStrategyFloat,
      ...curves,
      visuals: stratVisuals ? JSON.parse(stratVisuals) : null,
      meta: { ultimaFecha: data[data.length - 1].date, ultimoPrecio: data[data.length - 1].close, simbolo },
      // Solo si la estrategia lo devuelve, y al final: sin él la respuesta es la de siempre, byte a byte.
      ...(grafico ? { grafico } : {}),
    })
  } catch (e) {
    // El código de la estrategia es lo ÚNICO que se separa: 422 y un tipo propio, para que el
    // cliente no lo confunda con un fallo de descarga. Todo lo demás sale igual que siempre —500 y
    // el mismo cuerpo—, solo con la etiqueta del registro corregida: antes TODO se anotaba como
    // «strategy execution error», incluida una descarga que no llega.
    // Cambios de parámetros no válidos (campo `params`), o una estrategia que no declara run.parametros:
    // 422 con los errores en castellano. Ver lib/parametrosEstrategia.js.
    if (e && e._tipoFallo === 'parametros') {
      return res.status(422).json({ error: e.message, tipo: 'parametros', errores: e.errores })
    }
    if (e && e._tipoFallo === 'codigo_estrategia') {
      const quien = stratName || strategyId || '(sin identificar)'
      console.error(`[datos] error en el code_js de la estrategia "${quien}" para ${req.body?.simbolo}:`, e.message, e.stack)
      return res.status(422).json({ error: e.message, tipo: 'codigo_estrategia', estrategia: quien })
    }
    console.error(`[datos] fallo al calcular ${req.body?.simbolo}:`, e.message, e.stack)
    return res.status(500).json({ error: e.message })
  }

  } catch (e) {
    console.error('[datos] unhandled crash:', e.message, e.stack)
    return res.status(500).json({ error: 'Internal error: ' + e.message })
  }
}
