// scripts/cargaScreener.js — CARGA SEMANAL del screener (docs/screener.md): el universo, sus cuentas de la SEC (EDGAR) y,
// de Yahoo, el último cierre y el PEG esperado. Escribe en public.screener_empresas y public.screener_cuentas
// (sql/screener.sql). Se lanza a mano desde el ordenador de Sergi (unos 15–20 minutos para ~600 empresas); más adelante,
// sola, con las Alertas.
//
//   node scripts/cargaScreener.js                    todo el universo
//   node scripts/cargaScreener.js --solo AAPL,MSFT   solo esos (para probar; no cambia las marcas de los demás)
//   node scripts/cargaScreener.js --ensayo           lo descarga y lo cuenta todo, pero no escribe nada (ROLLBACK)
//   node scripts/cargaScreener.js --metricas         solo vuelve a calcular la columna `metricas` con lo que ya hay en la base
//                                                    (sin descargar nada: tras cambiar una fórmula de lib/screener/metricas.js)
//   node scripts/cargaScreener.js --tecnico          solo vuelve a calcular la columna `tecnico` (piso técnico, parte 2) con las velas
//                                                    que YA están en la caché de precios (sin descargar: antes, llenaCachePrecios.js
//                                                    --screener). Escribe con guardar_tecnico_screener, como la app (botón
//                                                    «Actualizar precios»), simulando al usuario de Sergi. Admite --solo.
//   node scripts/cargaScreener.js --splits           solo pregunta a Yahoo los SPLITS de las empresas del screener y los guarda en
//                                                    public.precios_splits (sql/precios_splits.sql; ~3 min). Admite --solo. La carga
//                                                    entera también lo hace (paso 5).
//   node scripts/cargaScreener.js --peg              solo pregunta a Yahoo el HISTORIAL del PEG esperado (desde 2010) de las empresas
//                                                    del screener y lo guarda en public.screener_peg (sql/screener_peg.sql; ~3 min). Admite
//                                                    --solo. La carga entera también lo hace (con el PEG de cada empresa, paso 2).
//   opciones: --pausa-sec 150 (ms entre peticiones a la SEC; su límite es 10 por segundo) · --pausa-yahoo 250
//
// LA SEC EXIGE que cada petición diga quién la hace (nombre y correo de contacto). Se lee de SEC_UA en .env.local (no
// está en git: el repositorio es público). Sin SEC_UA, el script para sin pedir nada.
//
// QUÉ HACE:
//   1. Universo (lib/screener/universo.js): S&P 500 de Wikipedia (si la tabla no trae al menos 480 filas, PARA), miembros
//      actuales del Nasdaq-100 (universo_miembros) y los valores de las listas de la Watchlist que la SEC conoce.
//   2. Por empresa: companyfacts → filas (lib/screener/edgar.js, con las acciones en miles o millones ya corregidas: lib/screener/escala.js); submissions → código SIC (sector si no es del S&P 500,
//      lib/screener/sectores.js); Yahoo → último cierre (chart v8) y PEG esperado (trailingPegRatio, «solo hoy»).
//      Un fallo en una empresa no para la carga: se anota en su columna `aviso` y se sigue.
//   3. Escribe por tandas de 20 empresas, cada tanda en UNA transacción: upsert de las empresas y, de sus CIK, se borran
//      las cuentas y se meten las nuevas (la SEC puede corregir cifras: se guarda siempre lo último). Al final (sin --solo),
//      las empresas que ya no están en el universo se quedan con sus marcas a false (no se borran).
//   4. Calcula las cifras de cada empresa (lib/screener/metricas.js) con lo guardado en la base y las escribe en `metricas`.
//   5. Los splits de cada empresa (Yahoo, chart v8 con events=split) en public.precios_splits (lib/screener/splits.js).
// Escribe por la Management API (conecta como postgres), como scripts/universoNasdaq100.js.
const fs = require('fs')
const path = require('path')
const { preparaEsm, RAIZ } = require('./guardian/cargaEsm')
const { consulta } = require('./universoNasdaq100')

const args = process.argv.slice(2)
const opcion = (n, def = null) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : def }
const SOLO = opcion('--solo') ? opcion('--solo').split(',').map(s => s.trim().toUpperCase()).filter(Boolean) : null
const ENSAYO = args.includes('--ensayo')
const SOLO_METRICAS = args.includes('--metricas')
const SOLO_TECNICO = args.includes('--tecnico')
const SOLO_SPLITS = args.includes('--splits')
const SOLO_PEG = args.includes('--peg')
const USUARIO = 'c006506d-084b-4c2e-a458-70c5caa35d3a'   // el de Sergi (guardar_tecnico_screener exige un usuario)
const PAUSA_SEC = Number(opcion('--pausa-sec', 150))
const PAUSA_YAHOO = Number(opcion('--pausa-yahoo', 250))
const TANDA = 20
const UA_YAHOO = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
const UA_WIKI = 'TradingSimulator/1.0 (uso personal; screener)'
const pausa = (ms) => new Promise(r => setTimeout(r, ms))
const lit = (s) => s == null ? 'NULL' : "'" + String(s).replace(/'/g, "''") + "'"
const num = (x) => x == null || !Number.isFinite(Number(x)) ? 'NULL' : String(Number(x))

function leeSecUa() {
  if (process.env.SEC_UA) return process.env.SEC_UA.trim()
  try {
    for (const l of fs.readFileSync(path.join(RAIZ, '.env.local'), 'utf8').split(/\r?\n/)) {
      const m = l.match(/^SEC_UA=(.*)$/)
      if (m && m[1].trim()) return m[1].trim()
    }
  } catch (_) {}
  return null
}

// Una petición con reintentos (3, esperando 2, 5 y 15 s; un 404 no se reintenta). Devuelve el texto o lanza.
async function pide(url, cabeceras) {
  const esperas = [2000, 5000, 15000]
  for (let i = 0; ; i++) {
    let r
    try { r = await fetch(url, { headers: cabeceras }) } catch (e) { r = { ok: false, status: 0, error: e.message } }
    if (r.ok) return await r.text()
    if (r.status === 404) throw Object.assign(new Error('HTTP 404'), { status: 404 })
    if (i >= esperas.length) throw Object.assign(new Error(r.error || ('HTTP ' + r.status)), { status: r.status })
    await pausa(r.status === 429 || r.status === 403 ? 60000 : esperas[i])
  }
}

async function yahooCierre(simbolo) {
  const t = await pide(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(simbolo)}?interval=1d&range=5d`, { 'User-Agent': UA_YAHOO, Accept: 'application/json' })
  const r = JSON.parse(t)?.chart?.result?.[0]
  const ts = r?.timestamp || [], c = r?.indicators?.quote?.[0]?.close || []
  for (let i = ts.length - 1; i >= 0; i--) if (c[i] != null) return { precio: c[i], fecha: new Date(ts[i] * 1000).toISOString().slice(0, 10) }
  return null
}
// Los splits de toda la historia (velas mensuales: la respuesta es pequeña; los splits vienen igual).
async function yahooSplits(simbolo, splitsDeYahoo) {
  const t = await pide(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(simbolo)}?interval=1mo&period1=0&period2=${Math.floor(Date.now() / 1000)}&events=split`, { 'User-Agent': UA_YAHOO, Accept: 'application/json' })
  const r = JSON.parse(t)?.chart?.result?.[0]
  if (!r) throw new Error('Yahoo no da datos')
  return splitsDeYahoo(r.events)
}
// 5. Guarda los splits de las empresas del screener (todas, o las de `simbolos`). Un fallo en una no para: se cuenta y se sigue
// (su fila anterior, si la había, se queda). Escribe de 50 en 50.
async function cargaSplits({ splitsDeYahoo }, simbolos = null) {
  const lista = (await consulta(`SELECT simbolo FROM public.screener_empresas${simbolos ? ` WHERE simbolo IN (${simbolos.map(lit).join(', ')})` : ''} ORDER BY simbolo;`)).map(e => e.simbolo)
  const fallan = [], filas = []
  let conSplits = 0
  const escribe = async () => {
    if (!filas.length) return
    if (!ENSAYO) await consulta(`INSERT INTO public.precios_splits (simbolo, splits, revisado) VALUES ${filas.join(', ')}
      ON CONFLICT (simbolo) DO UPDATE SET splits = EXCLUDED.splits, revisado = EXCLUDED.revisado;`)
    filas.length = 0
  }
  for (const s of lista) {
    try { const sp = await yahooSplits(s, splitsDeYahoo); if (sp.length) conSplits++; filas.push(`(${lit(s)}, ${lit(JSON.stringify(sp))}::jsonb, now())`) }
    catch (err) { fallan.push(s + ' (' + err.message + ')') }
    await pausa(PAUSA_YAHOO)
    if (filas.length >= 50) await escribe()
  }
  await escribe()
  return { total: lista.length, conSplits, fallan }
}
// El PEG esperado de Yahoo: toda la serie que guarda (desde 2010; son pocos puntos sueltos) → { serie: [{ fecha, peg }] ordenada,
// hoy: { peg, fecha } | null }. «hoy» = el último, si es de los últimos 40 días (la regla de siempre de la pantalla del screener).
const PEG_DESDE = Math.floor(Date.UTC(2010, 0, 1) / 1000)
async function yahooPeg(simbolo) {
  const ahora = Math.floor(Date.now() / 1000), e = encodeURIComponent(simbolo)
  const t = await pide(`https://query1.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${e}?symbol=${e}&type=trailingPegRatio&period1=${PEG_DESDE}&period2=${ahora}`, { 'User-Agent': UA_YAHOO, Accept: 'application/json' })
  const crudo = JSON.parse(t)?.timeseries?.result?.[0]?.trailingPegRatio || []
  const serie = crudo.filter(x => x?.asOfDate && Number.isFinite(x?.reportedValue?.raw)).map(x => ({ fecha: x.asOfDate, peg: x.reportedValue.raw }))
    .sort((a, b) => a.fecha < b.fecha ? -1 : 1)
  const u = serie[serie.length - 1]
  const hace40 = new Date((ahora - 40 * 86400) * 1000).toISOString().slice(0, 10)
  return { serie, hoy: u && u.fecha >= hace40 ? { peg: u.peg, fecha: u.fecha } : null }
}
// Las filas de public.screener_peg de un símbolo (VALUES de un INSERT).
const filasPeg = (simbolo, serie) => (serie || []).map(p => `(${lit(simbolo)}, ${lit(p.fecha)}, ${num(p.peg)}, now())`)
const SQL_PEG = (filas) => `INSERT INTO public.screener_peg (simbolo, fecha, peg, leido) VALUES ${filas.join(', ')}
ON CONFLICT (simbolo, fecha) DO UPDATE SET peg = EXCLUDED.peg, leido = EXCLUDED.leido;`
// Solo el historial del PEG (--peg): todas las empresas del screener (o las de `simbolos`), de 50 en 50 filas.
async function cargaPegs(simbolos = null) {
  const lista = (await consulta(`SELECT simbolo FROM public.screener_empresas${simbolos ? ` WHERE simbolo IN (${simbolos.map(lit).join(', ')})` : ''} ORDER BY simbolo;`)).map(e => e.simbolo)
  const fallan = [], filas = []
  let conPeg = 0, puntos = 0
  const escribe = async () => { if (filas.length && !ENSAYO) await consulta(SQL_PEG(filas)); filas.length = 0 }
  for (const s of lista) {
    try { const { serie } = await yahooPeg(s); if (serie.length) conPeg++; puntos += serie.length; filas.push(...filasPeg(s, serie)) }
    catch (err) { fallan.push(s + ' (' + err.message + ')') }
    await pausa(PAUSA_YAHOO)
    if (filas.length >= 200) await escribe()
  }
  await escribe()
  return { total: lista.length, conPeg, puntos, fallan }
}

function sqlTanda(lote) {
  const empresas = lote.map(e => `(${[lit(e.simbolo), num(e.cik), lit(e.nombre), num(e.sic), lit(e.sic_descripcion), lit(e.sector), lit(e.sector_fuente),
    e.en_sp500, e.en_ndx, e.en_listas, num(e.precio), lit(e.precio_fecha), num(e.peg_esperado), lit(e.peg_esperado_fecha), lit(e.aviso)].join(', ')}, now())`)
  const pegs = lote.flatMap(e => filasPeg(e.simbolo, e.pegSerie))
  const ciks = [...new Set(lote.filter(e => e.filas).map(e => e.cik))]
  const vistos = new Set(), cuentas = []
  for (const e of lote) {
    if (!e.filas) continue
    for (const f of e.filas) {
      const k = f.cik + '|' + f.concepto + '|' + f.periodo + '|' + f.fin
      if (vistos.has(k)) continue   // GOOGL y GOOG comparten CIK: sus cuentas, una vez
      vistos.add(k)
      cuentas.push(`(${[num(f.cik), lit(f.concepto), lit(f.periodo), lit(f.fin), lit(f.inicio), num(f.anio_fiscal), num(f.valor), lit(f.unidad), lit(f.etiqueta), lit(f.presentado), lit(f.conocido_desde)].join(', ')})`)
    }
  }
  return `BEGIN;
INSERT INTO public.screener_empresas (simbolo, cik, nombre, sic, sic_descripcion, sector, sector_fuente, en_sp500, en_ndx, en_listas, precio, precio_fecha, peg_esperado, peg_esperado_fecha, aviso, actualizada)
VALUES ${empresas.join(',\n')}
ON CONFLICT (simbolo) DO UPDATE SET cik = EXCLUDED.cik, nombre = EXCLUDED.nombre, sic = EXCLUDED.sic, sic_descripcion = EXCLUDED.sic_descripcion,
  sector = EXCLUDED.sector, sector_fuente = EXCLUDED.sector_fuente, en_sp500 = EXCLUDED.en_sp500, en_ndx = EXCLUDED.en_ndx, en_listas = EXCLUDED.en_listas,
  precio = coalesce(EXCLUDED.precio, screener_empresas.precio), precio_fecha = coalesce(EXCLUDED.precio_fecha, screener_empresas.precio_fecha),
  peg_esperado = EXCLUDED.peg_esperado, peg_esperado_fecha = EXCLUDED.peg_esperado_fecha, aviso = EXCLUDED.aviso, actualizada = now();
${ciks.length ? `DELETE FROM public.screener_cuentas WHERE cik IN (${ciks.join(', ')});` : ''}
${cuentas.length ? `INSERT INTO public.screener_cuentas (cik, concepto, periodo, fin, inicio, anio_fiscal, valor, unidad, etiqueta, presentado, conocido_desde) VALUES ${cuentas.join(',\n')};` : ''}
${pegs.length ? SQL_PEG(pegs) : ''}
SELECT ${lote.length} AS empresas, ${cuentas.length} AS cuentas, ${pegs.length} AS pegs;
${ENSAYO ? 'ROLLBACK' : 'COMMIT'};`
}

// 4. La columna `metricas` de las empresas (todas, o las de `simbolos`), con sus cuentas de la base. Por tandas de 40.
async function recalculaMetricas(metricasDe, simbolos = null) {
  const empresas = await consulta(`SELECT e.simbolo, e.cik, e.precio, e.precio_fecha::text AS precio_fecha, e.peg_esperado, s.splits FROM public.screener_empresas e LEFT JOIN public.precios_splits s USING (simbolo)${simbolos ? ` WHERE simbolo IN (${simbolos.map(lit).join(', ')})` : ''} ORDER BY simbolo;`)
  let hechas = 0
  for (let i = 0; i < empresas.length; i += 40) {
    const lote = empresas.slice(i, i + 40)
    const ciks = [...new Set(lote.map(e => e.cik).filter(c => c != null))]
    const cuentas = ciks.length ? await consulta(`SELECT cik, concepto, periodo, fin::text AS fin, valor::text AS valor, unidad, presentado::text AS presentado FROM public.screener_cuentas WHERE cik IN (${ciks.join(', ')});`) : []
    const porCik = {}
    for (const c of cuentas) (porCik[c.cik] ||= []).push(c)
    const valores = lote.map(e => {
      const r = metricasDe(e, porCik[e.cik] || [], e.splits)
      const x = { moneda: r.moneda, cuentasHasta: r.cuentasHasta, fechas: r.fechas, piezas: r.piezas, m: r.m }
      return `(${lit(e.simbolo)}, ${lit(JSON.stringify(x))}::jsonb)`
    })
    await consulta(`UPDATE public.screener_empresas s SET metricas = v.m FROM (VALUES ${valores.join(', ')}) AS v(simbolo, m) WHERE s.simbolo = v.simbolo;`)
    hechas += lote.length
  }
  return hechas
}

// La columna `tecnico` (lib/screener/tecnico.js) con las velas de la caché: la MISMA ventana que la ruta /api/screener-tecnico
// (desde el mismo día de hace ANIOS_TECNICO años, UTC) y los precios exactos (extra_float_digits = 1). Por tandas de 20.
async function recalculaTecnico({ tecnicoDe, ANIOS_TECNICO }, simbolos = null) {
  const empresas = (await consulta(`SELECT simbolo FROM public.screener_empresas${simbolos ? ` WHERE simbolo IN (${simbolos.map(lit).join(', ')})` : ''} ORDER BY simbolo;`)).map(e => e.simbolo)
  const hoy = new Date().toISOString().slice(0, 10)
  const [y, m, d] = hoy.split('-').map(Number)
  const inicio = new Date(Date.UTC(y - ANIOS_TECNICO, m - 1, d)).toISOString().slice(0, 10)
  let hechas = 0; const sin = []
  for (let i = 0; i < empresas.length; i += 20) {
    const lote = empresas.slice(i, i + 20)
    const filas = await consulta(`BEGIN READ ONLY; SET LOCAL extra_float_digits = 1;
      SELECT simbolo, json_agg(json_build_array(fecha::text, high, close, volumen) ORDER BY fecha) AS d FROM public.precios_diarios
      WHERE simbolo IN (${lote.map(lit).join(', ')}) AND fecha >= ${lit(inicio)} AND fecha < ${lit(hoy)} GROUP BY simbolo; ROLLBACK;`)
    const porSimbolo = Object.fromEntries(filas.map(f => [f.simbolo, f.d]))
    const llamadas = []
    for (const s of lote) {
      const t = porSimbolo[s] ? tecnicoDe(porSimbolo[s].map(([date, high, close, volume]) => ({ date, high, close, volume: volume ?? 0 }))) : null
      if (!t) { sin.push(s); continue }
      llamadas.push(`public.guardar_tecnico_screener(${lit(s)}, ${lit(JSON.stringify(t))}::jsonb)`)
    }
    if (llamadas.length) await consulta(`BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claims', '{"sub":"${USUARIO}","role":"authenticated"}', true);
      SELECT ${llamadas.join(', ')}; COMMIT;`)
    hechas += llamadas.length
  }
  return { hechas, sin }
}

if (require.main === module) (async () => {
  if (SOLO_PEG) {
    const t0 = Date.now(), r = await cargaPegs(SOLO)
    const tot = ENSAYO ? null : (await consulta(`SELECT count(*) AS filas, count(DISTINCT simbolo) AS simbolos, min(fecha)::text AS primera FROM public.screener_peg;`))[0]
    console.log(`PEG esperado: ${r.total - r.fallan.length} de ${r.total} empresas revisadas (${r.conPeg} con algún PEG, ${r.puntos} puntos) en ${Math.round((Date.now() - t0) / 1000)} s${ENSAYO ? ' · ENSAYO: no se ha escrito nada' : ' · en la base: ' + JSON.stringify(tot)}.${r.fallan.length ? ` Fallan (${r.fallan.length}): ${r.fallan.join(', ')}.` : ''}`)
    return
  }
  if (SOLO_SPLITS) {
    await preparaEsm()
    const t0 = Date.now(), r = await cargaSplits(require('../lib/screener/splits'), SOLO)
    console.log(`Splits: ${r.total - r.fallan.length} de ${r.total} empresas revisadas (${r.conSplits} con algún split) en ${Math.round((Date.now() - t0) / 1000)} s${ENSAYO ? ' · ENSAYO: no se ha escrito nada' : ''}.${r.fallan.length ? ` Fallan (${r.fallan.length}): ${r.fallan.join(', ')}.` : ''}`)
    return
  }
  if (SOLO_TECNICO) {
    await preparaEsm()
    const t0 = Date.now(), r = await recalculaTecnico(require('../lib/screener/tecnico'), SOLO)
    console.log(`Técnico calculado de ${r.hechas} empresas en ${Math.round((Date.now() - t0) / 1000)} s.${r.sin.length ? ` Sin velas en la caché (${r.sin.length}): ${r.sin.join(', ')}.` : ''}`)
    return
  }
  if (SOLO_METRICAS) {
    await preparaEsm()
    const { metricasDe } = require('../lib/screener/metricas')
    const t0 = Date.now(), n = await recalculaMetricas(metricasDe, SOLO)
    console.log(`Métricas calculadas de ${n} empresas en ${Math.round((Date.now() - t0) / 1000)} s.`)
    return
  }
  const UA_SEC = leeSecUa()
  if (!UA_SEC) { console.error('Falta SEC_UA en .env.local (la SEC exige nombre y correo de contacto). No se ha pedido nada.'); process.exit(2) }
  const t0 = Date.now()
  await preparaEsm()
  const { universoDe, sp500DeWikipedia, CIK_ANTERIOR } = require('../lib/screener/universo')
  const { filasDeEmpresa } = require('../lib/screener/edgar')
  const { sectorDe } = require('../lib/screener/sectores')
  const sec = { 'User-Agent': UA_SEC, Accept: 'application/json' }

  // 1. Universo.
  const sp500 = sp500DeWikipedia(await pide('https://en.wikipedia.org/wiki/List_of_S%26P_500_companies', { 'User-Agent': UA_WIKI }))
  if (sp500.length < 480) throw new Error(`la lista del S&P 500 de Wikipedia trae ${sp500.length} filas (se esperaban ~503): ¿ha cambiado la página?`)
  const ndx = await consulta(`SELECT simbolo_yahoo, nombre FROM public.universo_miembros WHERE indice = 'NDX' AND hasta IS NULL AND simbolo_yahoo IS NOT NULL;`)
  const listas = (await consulta(`SELECT DISTINCT w.symbol FROM public.watchlist w JOIN public.watchlist_list_members m ON m.watchlist_id = w.id;`)).map(r => r.symbol)
  const tickersSec = JSON.parse(await pide('https://www.sec.gov/files/company_tickers.json', sec))
  const { empresas: todas, sinCik } = universoDe({ sp500, ndx, listas, tickersSec })
  const empresas = SOLO ? todas.filter(e => SOLO.includes(e.simbolo)) : todas
  console.log(`Universo: ${todas.length} empresas (S&P 500 ${todas.filter(e => e.en_sp500).length} · Nasdaq-100 ${todas.filter(e => e.en_ndx).length} · listas ${todas.filter(e => e.en_listas).length}) · sin CIK de la SEC: ${sinCik.length}${sinCik.length ? ' (' + sinCik.join(', ') + ')' : ''}`)
  if (SOLO) console.log(`--solo: ${empresas.length} de ${SOLO.length} pedidas`)

  // 2 y 3. Descarga y escritura por tandas.
  let n = 0, conAviso = 0, filasTot = 0, escaladas = 0
  const conEscala = []
  const cachePorCik = new Map()
  for (let i = 0; i < empresas.length; i += TANDA) {
    const lote = empresas.slice(i, i + TANDA)
    for (const e of lote) {
      const avisos = []
      if (CIK_ANTERIOR[e.cik]) { avisos.push(`cuentas de la CIK anterior ${CIK_ANTERIOR[e.cik]} (reorganizada en la ${e.cik})`); e.cik = CIK_ANTERIOR[e.cik] }
      const c10 = String(e.cik).padStart(10, '0')
      if (cachePorCik.has(e.cik)) Object.assign(e, cachePorCik.get(e.cik))
      else {
        try { e.filas = filasDeEmpresa(JSON.parse(await pide(`https://data.sec.gov/api/xbrl/companyfacts/CIK${c10}.json`, sec))) }
        catch (err) { e.filas = null; avisos.push('cuentas de la SEC: ' + err.message) }
        await pausa(PAUSA_SEC)
        try { const s = JSON.parse(await pide(`https://data.sec.gov/submissions/CIK${c10}.json`, sec)); e.sic = Number(s.sic) || null; e.sic_descripcion = s.sicDescription || null }
        catch (err) { avisos.push('SIC: ' + err.message) }
        await pausa(PAUSA_SEC)
        cachePorCik.set(e.cik, { filas: e.filas, sic: e.sic, sic_descripcion: e.sic_descripcion })
      }
      if (e.filas && !e.filas.some(f => f.concepto === 'ventas' || f.concepto === 'beneficio_neto')) avisos.push('la SEC no tiene sus ventas ni su beneficio')
      Object.assign(e, sectorDe({ gics: e.gics, sic: e.sic }))
      try { const y = await yahooCierre(e.simbolo); if (y) { e.precio = y.precio; e.precio_fecha = y.fecha } else avisos.push('Yahoo: sin cierre') }
      catch (err) { avisos.push('Yahoo cierre: ' + err.message) }
      await pausa(PAUSA_YAHOO)
      try { const p = await yahooPeg(e.simbolo); e.pegSerie = p.serie; if (p.hoy) { e.peg_esperado = p.hoy.peg; e.peg_esperado_fecha = p.hoy.fecha } }
      catch (err) { avisos.push('Yahoo PEG: ' + err.message) }
      await pausa(PAUSA_YAHOO)
      e.aviso = avisos.length ? avisos.join(' · ') : null
      if (e.aviso) conAviso++
      filasTot += e.filas ? e.filas.length : 0
      const esc = e.filas ? e.filas.filter(f => f.escala).length : 0
      if (esc) { escaladas += esc; conEscala.push(e.simbolo) }
      n++
    }
    const r = await consulta(sqlTanda(lote))
    const res = Array.isArray(r) ? r[r.length - 1] || r[0] : r
    console.log(`  ${n}/${empresas.length} · ${Math.round((Date.now() - t0) / 1000)} s · tanda: ${JSON.stringify(res)}${ENSAYO ? ' (ensayo, sin escribir)' : ''}`)
    for (const e of lote) { e.filas = null; e.pegSerie = null }   // libera memoria
  }

  // Las que ya no están en el universo: marcas a false (no se borran).
  if (!SOLO && !ENSAYO) {
    const dentro = todas.map(e => lit(e.simbolo)).join(', ')
    await consulta(`UPDATE public.screener_empresas SET en_sp500 = false, en_ndx = false, en_listas = false WHERE simbolo NOT IN (${dentro}) AND (en_sp500 OR en_ndx OR en_listas);`)
  }
  if (!ENSAYO) {
    const { metricasDe } = require('../lib/screener/metricas')
    console.log(`Métricas: ${await recalculaMetricas(metricasDe, SOLO ? empresas.map(e => e.simbolo) : null)} empresas.`)
  }
  {
    const r = await cargaSplits(require('../lib/screener/splits'), SOLO ? empresas.map(e => e.simbolo) : null)
    console.log(`Splits: ${r.total - r.fallan.length} de ${r.total} revisadas (${r.conSplits} con algún split).${r.fallan.length ? ` Fallan: ${r.fallan.join(', ')}.` : ''}`)
  }
  const tot = await consulta(`SELECT (SELECT count(*) FROM public.screener_empresas) AS empresas, (SELECT count(*) FROM public.screener_cuentas) AS cuentas, pg_size_pretty(pg_total_relation_size('public.screener_cuentas')) AS tamano;`)
  console.log(`Hecho en ${Math.round((Date.now() - t0) / 1000)} s: ${n} empresas (${conAviso} con aviso), ${filasTot} filas de cuentas descargadas (${escaladas} de acciones pasadas de miles o millones a acciones sueltas${conEscala.length ? ': ' + conEscala.join(', ') : ''})${ENSAYO ? ' · ENSAYO: no se ha escrito nada' : ''}. En la base: ${JSON.stringify(tot[0])}`)
})().catch(e => { console.error('La carga del screener ha fallado:', e.message); process.exit(1) })

module.exports = { sqlTanda }
