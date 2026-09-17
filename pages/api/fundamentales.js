// pages/api/fundamentales.js — ficha fundamental de un activo (Yahoo), normalizada y cacheada.
//
// Dos vías, porque no todas las fuentes piden lo mismo:
//  · quoteSummary (v10) es la completa, pero exige cookie A3 + crumb. Funciona desde una IP doméstica;
//    desde una IP de centro de datos NO está comprobado, y es justo lo que este endpoint sirve para saber.
//  · chart v8 + fundamentals-timeseries NO piden crumb y ya se usan desde Vercel (ver fetchAV en datos.js).
// Si la primera falla, se sirve lo que dé la segunda y se dice en `origen` qué vía se usó y qué falta:
// la ruta no falla del todo mientras haya algo que devolver.
//
// GET /api/fundamentales?symbol=NVDA
//   &refrescar=1  ignora la caché (para diagnosticar en producción)
//   &sinCrumb=1   fuerza la vía degradada (para comparar las dos vías sin tocar nada)

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
const MODULOS = 'price,summaryDetail,defaultKeyStatistics,financialData,calendarEvents,earnings,recommendationTrend,fundProfile'
const TIPOS_TS = 'annualTotalRevenue,annualNetIncome,annualDilutedEPS,annualBasicAverageShares,trailingTotalRevenue,trailingNetIncome,trailingDilutedEPS'

// ── Caché en memoria, mismo patrón que priceCache de datos.js ────────────────
// Vive dentro de cada instancia de Vercel: no se comparte entre instancias ni sobrevive a un despliegue.
// Vidas distintas según el ritmo del dato (ver auditoría):
//   · mercado    — se mueve con el precio (precio, volumen, rangos, PER, capitalización)
//   · evento     — consenso, precio objetivo, fechas de resultados y dividendo
//   · trimestral — ingresos, beneficio, BPA, acciones e histórico anual: cambian 4 veces al año
const fichaCache = new Map()   // símbolo → ficha normalizada con sus marcas de tiempo
const TTL_MERCADO    = 60 * 1000
const TTL_EVENTO     = 6 * 60 * 60 * 1000
const TTL_TRIMESTRAL = 24 * 60 * 60 * 1000
const MAX_CACHE = 200          // tope defensivo: una instancia no acumula fichas sin límite

// ── Sesión (cookie + crumb), reutilizada mientras siga válida ────────────────
// El crumb no caduca en cada llamada: pedirlo cada vez serían 2 peticiones extra por ficha. Se guarda
// en memoria y solo se renueva al caducar o cuando quoteSummary responde 401.
let sesion = { cookie: null, crumb: null, ts: 0 }
const TTL_SESION = 30 * 60 * 1000

async function pedir(url, { cookie = null, ms = 4000, accept = 'application/json' } = {}) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  const t0 = Date.now()
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': UA, 'Accept': accept, ...(cookie ? { Cookie: cookie } : {}) },
    })
    const texto = await r.text()
    return { ok: r.ok, estado: r.status, texto, ms: Date.now() - t0 }
  } catch (e) {
    return { ok: false, estado: 0, error: e.name === 'AbortError' ? 'timeout' : (e.message || 'error de red'), ms: Date.now() - t0 }
  } finally { clearTimeout(timer) }
}
const json = (r) => { try { return JSON.parse(r.texto) } catch { return null } }

// Cookie de sesión anónima: basta con A3. getSetCookie no existe en todas las versiones de Node, así que
// se cae a la cabecera unida.
function cookieDe(headers) {
  const lista = headers.getSetCookie?.() ?? (headers.get('set-cookie') ? [headers.get('set-cookie')] : [])
  const unida = lista.join(', ')
  return /A3=[^;,]+/.exec(unida)?.[0] ?? (lista[0]?.split(';')[0] || null)
}
async function resolverSesion(peticiones, forzar = false) {
  if (!forzar && sesion.crumb && Date.now() - sesion.ts < TTL_SESION) return true
  sesion = { cookie: null, crumb: null, ts: 0 }
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 3000)
  const t0 = Date.now()
  let cookie = null
  try {
    const r = await fetch('https://fc.yahoo.com/', { signal: ctrl.signal, headers: { 'User-Agent': UA }, redirect: 'manual' })
    cookie = cookieDe(r.headers)
    peticiones.push({ nombre: 'cookie', estado: r.status, ms: Date.now() - t0, ok: !!cookie })
  } catch (e) {
    peticiones.push({ nombre: 'cookie', estado: 0, ms: Date.now() - t0, ok: false, error: e.name === 'AbortError' ? 'timeout' : 'error de red' })
  } finally { clearTimeout(timer) }
  if (!cookie) return false
  // getcrumb devuelve TEXTO PLANO: con Accept: application/json responde 406 y no hay crumb.
  const r = await pedir('https://query1.finance.yahoo.com/v1/test/getcrumb', { cookie, ms: 3000, accept: 'text/plain, */*' })
  const crumb = (r.texto || '').trim()
  // Un crumb válido es una cadena corta sin HTML: si Yahoo devuelve una página, no sirve.
  const valido = r.ok && crumb.length > 0 && crumb.length < 40 && !crumb.includes('<')
  peticiones.push({ nombre: 'crumb', estado: r.estado, ms: r.ms, ok: valido, ...(r.error ? { error: r.error } : {}) })
  if (!valido) return false
  sesion = { cookie, crumb, ts: Date.now() }
  return true
}

// ── Normalización ───────────────────────────────────────────────────────────
// Yahoo marca lo ausente con {} y lo presente con {raw, fmt}: hay que distinguir "sin dato" de cero.
const num = (v) => {
  if (v == null) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'object' && 'raw' in v) return typeof v.raw === 'number' && Number.isFinite(v.raw) ? v.raw : null
  return null
}
const txt = (v) => (typeof v === 'string' && v ? v : null)
const fechaDe = (v) => {
  const n = num(v)
  if (n != null) return new Date(n * 1000).toISOString().slice(0, 10)
  return typeof v === 'object' && txt(v?.fmt) ? v.fmt : null
}
const TIPOS = { EQUITY: 'accion', ETF: 'etf', MUTUALFUND: 'fondo', INDEX: 'indice', FUTURE: 'futuro', CRYPTOCURRENCY: 'cripto', CURRENCY: 'divisa' }
const tipoDe = (t) => TIPOS[String(t || '').toUpperCase()] || 'otro'

function deQuoteSummary(qs) {
  const p = qs.price || {}, sd = qs.summaryDetail || {}, ks = qs.defaultKeyStatistics || {}
  const fd = qs.financialData || {}, ce = qs.calendarEvents || {}, ea = qs.earnings || {}, fp = qs.fundProfile || {}
  const tend = qs.recommendationTrend?.trend?.[0] || null
  const tipo = tipoDe(p.quoteType)
  const esFondo = tipo === 'etf' || tipo === 'fondo'
  return {
    nombre: txt(p.longName) || txt(p.shortName) || null,
    tipo,
    tipoYahoo: txt(p.quoteType) || null,
    moneda: txt(p.currency) || null,
    mercado: {
      precio:        num(p.regularMarketPrice),
      apertura:      num(p.regularMarketOpen) ?? num(sd.open),
      cierrePrevio:  num(p.regularMarketPreviousClose) ?? num(sd.previousClose),
      minDia:        num(p.regularMarketDayLow) ?? num(sd.dayLow),
      maxDia:        num(p.regularMarketDayHigh) ?? num(sd.dayHigh),
      min52Semanas:  num(sd.fiftyTwoWeekLow),
      max52Semanas:  num(sd.fiftyTwoWeekHigh),
      volumen:       num(p.regularMarketVolume) ?? num(sd.volume),
      volumenMedio:  num(sd.averageVolume),
    },
    valoracion: {
      capitalizacion: num(p.marketCap) ?? num(sd.marketCap),
      per:            num(sd.trailingPE),
      perAdelantado:  num(sd.forwardPE) ?? num(ks.forwardPE),
      bpa:            num(ks.trailingEps),
      acciones:       num(ks.sharesOutstanding),
      beta:           num(sd.beta) ?? num(ks.beta),
    },
    negocio: {
      ingresosTtm:      num(fd.totalRevenue),
      beneficioNetoTtm: num(ks.netIncomeToCommon),
    },
    dividendo: {
      importe:       num(sd.dividendRate),
      // En ETF y fondos la rentabilidad va en `yield`, no en `dividendYield`.
      rentabilidad:  num(sd.dividendYield) ?? (esFondo ? num(sd.yield) ?? num(ks.yield) : null),
      exDividendo:   fechaDe(sd.exDividendDate),
      payout:        num(sd.payoutRatio),
    },
    analistas: {
      consenso:      txt(fd.recommendationKey),
      consensoMedia: num(fd.recommendationMean),
      numAnalistas:  num(fd.numberOfAnalystOpinions),
      objetivoMedio: num(fd.targetMeanPrice),
      objetivoMin:   num(fd.targetLowPrice),
      objetivoMax:   num(fd.targetHighPrice),
      distribucion:  tend ? { compraFuerte: tend.strongBuy ?? null, compra: tend.buy ?? null, mantener: tend.hold ?? null, venta: tend.sell ?? null, ventaFuerte: tend.strongSell ?? null } : null,
    },
    eventos: {
      proximosResultados: fechaDe(ce.earnings?.earningsDate?.[0]),
      resultadosEstimado: typeof ce.earnings?.isEarningsDateEstimate === 'boolean' ? ce.earnings.isEarningsDateEstimate : null,
    },
    // Bloque propio de ETF y fondos: sus datos no son los de una acción (ver auditoría).
    fondo: esFondo ? {
      patrimonio:     num(sd.totalAssets) ?? num(ks.totalAssets),
      rentabilidad:   num(sd.yield) ?? num(ks.yield),
      beta3Anios:     num(ks.beta3Year),
      rentabilidadYtd: num(ks.ytdReturn),
      comisionAnual:  num(fp.feesExpensesInvestment?.annualReportExpenseRatio),
      categoria:      txt(ks.category) || txt(fp.categoryName),
    } : null,
    // 4 ejercicios; fundamentals-timeseries da más y es la fuente preferente cuando se pide.
    historicoAnual: (ea.financialsChart?.yearly || []).map(y => ({
      anio: y.date ?? null, ingresos: num(y.revenue), beneficio: num(y.earnings), bpa: null, acciones: null,
    })).filter(x => x.anio != null),
  }
}

function deChart(meta, velas) {
  // `meta` no trae la apertura del día: sale de la última vela del propio chart.
  const abiertas = (velas?.open || []).filter(v => typeof v === 'number' && Number.isFinite(v))
  return {
    nombre: txt(meta.longName) || txt(meta.shortName) || null,
    tipo: tipoDe(meta.instrumentType),
    tipoYahoo: txt(meta.instrumentType) || null,
    moneda: txt(meta.currency) || null,
    mercado: {
      precio:        num(meta.regularMarketPrice),
      apertura:      abiertas.length ? abiertas[abiertas.length - 1] : null,
      cierrePrevio:  num(meta.chartPreviousClose) ?? num(meta.previousClose),
      minDia:        num(meta.regularMarketDayLow),
      maxDia:        num(meta.regularMarketDayHigh),
      min52Semanas:  num(meta.fiftyTwoWeekLow),
      max52Semanas:  num(meta.fiftyTwoWeekHigh),
      volumen:       num(meta.regularMarketVolume),
      volumenMedio:  null,
    },
  }
}

// fundamentals-timeseries: anuales → histórico; trailing → TTM (ingresos, beneficio y BPA sin crumb).
function deTimeseries(j) {
  const series = {}
  for (const res of j?.timeseries?.result || []) {
    const clave = Object.keys(res).find(k => k !== 'meta' && k !== 'timestamp')
    if (!clave) continue
    for (const punto of res[clave] || []) {
      if (!punto?.asOfDate) continue
      series[clave] = series[clave] || {}
      series[clave][punto.asOfDate] = num(punto.reportedValue)
    }
  }
  const ultimo = (k) => { const s = series[k]; if (!s) return null; const f = Object.keys(s).sort().pop(); return f ? s[f] : null }
  const fechas = [...new Set(Object.entries(series).filter(([k]) => k.startsWith('annual')).flatMap(([, s]) => Object.keys(s)))].sort()
  return {
    historicoAnual: fechas.map(f => ({
      anio: Number(f.slice(0, 4)),
      fecha: f,
      ingresos:  series.annualTotalRevenue?.[f] ?? null,
      beneficio: series.annualNetIncome?.[f] ?? null,
      bpa:       series.annualDilutedEPS?.[f] ?? null,
      acciones:  series.annualBasicAverageShares?.[f] ?? null,
    })),
    ttm: {
      ingresosTtm:      ultimo('trailingTotalRevenue'),
      beneficioNetoTtm: ultimo('trailingNetIncome'),
      bpa:              ultimo('trailingDilutedEPS'),
    },
  }
}

const vacio = (o) => o == null || (typeof o === 'object' && !Array.isArray(o) && Object.values(o).every(v => v == null || (Array.isArray(v) && !v.length)))

export default async function handler(req, res) {
  const symbol = String(req.query.symbol || '').trim().slice(0, 24)
  if (!symbol) return res.status(400).json({ error: 'symbol requerido' })
  const refrescar = req.query.refrescar === '1'
  const sinCrumb  = req.query.sinCrumb === '1'
  const ahora = Date.now()
  const peticiones = [], errores = []

  try {
    const previa = fichaCache.get(symbol)
    if (!refrescar && previa && ahora - previa._tsMercado < TTL_MERCADO) {
      return res.status(200).json({ ...sinInternos(previa), origen: { ...previa._origen, cache: 'ficha servida de caché', edadSegundos: Math.round((ahora - previa._tsMercado) / 1000) } })
    }

    // ── Vía completa: quoteSummary con cookie + crumb ──
    let qs = null, estadoCrumb = 'omitido'
    if (!sinCrumb) {
      for (const intento of [1, 2]) {
        // Segundo intento solo si el 401 pudo ser por un crumb caducado: se renueva la sesión y se repite.
        if (!await resolverSesion(peticiones, intento === 2)) { estadoCrumb = 'fallido'; break }
        estadoCrumb = 'ok'
        const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${MODULOS}&crumb=${encodeURIComponent(sesion.crumb)}`
        const r = await pedir(url, { cookie: sesion.cookie })
        peticiones.push({ nombre: 'quoteSummary', estado: r.estado, ms: r.ms, ok: r.ok, ...(r.error ? { error: r.error } : {}) })
        const j = r.ok ? json(r) : null
        qs = j?.quoteSummary?.result?.[0] || null
        if (qs) break
        if (r.estado === 401) { sesion = { cookie: null, crumb: null, ts: 0 }; estadoCrumb = 'rechazado'; if (intento === 1) continue }
        errores.push(`quoteSummary: ${r.error || 'HTTP ' + r.estado}`)
        break
      }
    }

    // ── Vía sin crumb: chart v8 (mercado) ──
    let chartMeta = null, chartVelas = null
    if (!qs) {
      const r = await pedir(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`)
      peticiones.push({ nombre: 'chart', estado: r.estado, ms: r.ms, ok: r.ok, ...(r.error ? { error: r.error } : {}) })
      const resultado = r.ok ? json(r)?.chart?.result?.[0] || null : null
      chartMeta = resultado?.meta || null
      chartVelas = resultado?.indicators?.quote?.[0] || null
      if (!chartMeta) errores.push(`chart: ${r.error || 'HTTP ' + r.estado}`)
    }

    // ── Trimestral: solo si caducó o no está (ahorra una petición cuando la ficha ya lo trae) ──
    let ts = null
    const trimestralFresco = previa && ahora - previa._tsTrimestral < TTL_TRIMESTRAL && previa.historicoAnual?.length
    if (!trimestralFresco || refrescar) {
      const desde = Math.floor(ahora / 1000) - 8 * 365 * 86400
      const enc = encodeURIComponent(symbol)
      const r = await pedir(`https://query1.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${enc}?symbol=${enc}&type=${TIPOS_TS}&period1=${desde}&period2=${Math.floor(ahora / 1000)}&merge=false`)
      peticiones.push({ nombre: 'timeseries', estado: r.estado, ms: r.ms, ok: r.ok, ...(r.error ? { error: r.error } : {}) })
      const j = r.ok ? json(r) : null
      ts = j ? deTimeseries(j) : null
      if (!j) errores.push(`timeseries: ${r.error || 'HTTP ' + r.estado}`)
    }

    if (!qs && !chartMeta && !previa) {
      return res.status(502).json({ error: `Yahoo no devolvió datos para ${symbol}`, origen: { via: 'ninguna', crumb: estadoCrumb, peticiones, errores } })
    }

    // ── Montaje de la ficha ──
    const base = qs ? deQuoteSummary(qs) : (chartMeta ? deChart(chartMeta, chartVelas) : {})
    const via = qs ? 'quoteSummary' : 'degradado'
    const historico = (ts?.historicoAnual?.length ? ts.historicoAnual : null)
      ?? (base.historicoAnual?.length ? base.historicoAnual : null)
      ?? (trimestralFresco ? previa.historicoAnual : null)
      ?? []
    const ficha = {
      symbol,
      nombre:    base.nombre ?? previa?.nombre ?? null,
      tipo:      base.tipo ?? previa?.tipo ?? 'otro',
      tipoYahoo: base.tipoYahoo ?? previa?.tipoYahoo ?? null,
      moneda:    base.moneda ?? previa?.moneda ?? null,
      mercado:   base.mercado ?? null,
      valoracion: base.valoracion ?? null,
      negocio: base.negocio && !vacio(base.negocio) ? base.negocio
        : (ts?.ttm && !vacio(ts.ttm) ? { ingresosTtm: ts.ttm.ingresosTtm, beneficioNetoTtm: ts.ttm.beneficioNetoTtm } : null),
      dividendo: base.dividendo ?? null,
      analistas: base.analistas ?? null,
      eventos:   base.eventos ?? null,
      fondo:     base.fondo ?? null,
      historicoAnual: historico,
    }
    // En la vía degradada, el BPA de timeseries cubre el hueco de defaultKeyStatistics.
    if (!qs && ts?.ttm?.bpa != null) ficha.valoracion = { ...(ficha.valoracion || {}), bpa: ts.ttm.bpa }
    // Bloques sin ningún dato → null, y se nombran en `faltan` para que el cliente sepa qué no hay.
    const faltan = []
    for (const k of ['mercado', 'valoracion', 'negocio', 'dividendo', 'analistas', 'eventos', 'fondo']) {
      if (vacio(ficha[k])) { ficha[k] = null; if (!(k === 'fondo' && ficha.tipo !== 'etf' && ficha.tipo !== 'fondo')) faltan.push(k) }
    }
    if (!ficha.historicoAnual.length) faltan.push('historicoAnual')

    ficha._tsMercado = ahora
    ficha._tsEvento = qs ? ahora : (previa?._tsEvento ?? 0)
    ficha._tsTrimestral = (ts?.historicoAnual?.length || base.historicoAnual?.length) ? ahora : (previa?._tsTrimestral ?? 0)
    ficha._origen = {
      via,
      crumb: estadoCrumb,
      // Diagnóstico para producción: qué se pidió, con qué respuesta y cuánto tardó. Sin valores de cookie ni crumb.
      peticiones,
      ...(errores.length ? { errores } : {}),
      faltan,
      ...(via === 'degradado' ? { nota: 'quoteSummary no respondió: faltan capitalización, PER, dividendo, beta, analistas y fechas de resultados.' } : {}),
    }
    if (fichaCache.size >= MAX_CACHE && !fichaCache.has(symbol)) fichaCache.delete(fichaCache.keys().next().value)
    fichaCache.set(symbol, ficha)
    return res.status(200).json({ ...sinInternos(ficha), origen: { ...ficha._origen, cache: 'recién pedida' } })
  } catch (e) {
    // La ruta nunca se cuelga ni lanza: devuelve el diagnóstico de lo que se llegó a pedir.
    return res.status(500).json({ error: e.message || 'Error interno', origen: { via: 'error', peticiones, errores } })
  }
}
function sinInternos(ficha) {
  const { _tsMercado, _tsEvento, _tsTrimestral, _origen, ...limpia } = ficha
  return limpia
}
