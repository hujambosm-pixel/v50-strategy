// scripts/guardian.js — guardián de la regla de la vela cerrada.
//
//   npm run guardian                        todas las estrategias habilitadas de la base de datos
//   npm run guardian -- --solo "^23"        solo las que casen con la expresión
//   npm run guardian -- --estrategias f.json   estrategias de un fichero en vez de la base de datos
//                                           ([{ name, params, code_js }], para probar código sin guardarlo)
//
// LA REGLA (de Sergi): una decisión se toma con la vela CERRADA y actúa desde la siguiente. Un stop
// decidido con la vela de señal cerrada puede actuar el mismo día de la entrada.
//
// QUÉ HACE. Ejecuta el MOTOR REAL —pages/api/datos.js y multibacktest en modo slots, compilados con el SWC
// de Next— con el code_js actual de cada estrategia y un fixture de precios CONGELADO
// (test/fixtures/precios.json: ^GSPC, AAPL, NVDA y SAN.MC), cada estrategia en su intervalo, sin y con
// una configuración de filtros fija. Nada sale a la red salvo la lectura de las estrategias, en solo
// lectura y con el mismo token que scripts/backup.js. Cualquier escritura contra la API REST revienta.
//
// COMPROBACIONES (columna de la tabla final):
//   motor  el motor responde sin error.
//   a      ninguna operación sale en su vela de entrada (salvo fin de periodo), salvo que el stop con el que
//          sale estuviera decidido ANTES de la entrada.
//   b      ningún precio de salida es el cierre de la vela que decide la salida (salvo fin de periodo y
//          coincidencias numéricas con la apertura o con un nivel de stop).
//   c      ningún stop llega tarde ni se usa antes de regir (stopHistory). La fecha de stopHistory no tiene
//          un significado único: unas estrategias anotan la vela que DECIDE el stop y otras la primera vela
//          en que RIGE. Se prueban las dos lecturas y se deduce la de cada estrategia; si no se puede
//          deducir, se dice en el informe en vez de dar la comprobación por buena o por mala.
//   d      órdenes de grafico.ordenes: todo nivel con decididaEn anterior a su fecha, ninguna orden de compra
//          stop sube, y cada operación tiene su orden ejecutada y al revés.
//   e      todo precio dentro de [low, high] de su vela (lo que la estrategia DECLARÓ: el motor corrige los
//          que caen fuera y lo deja anotado en precioAjustado).
//   f      cortes: las operaciones cerradas antes de 4 fechas de corte son idénticas a las de la serie
//          completa (nada mira el futuro).
//   g      coherencia: mismas operaciones en datos.js y en multibacktest (slots, una estrategia).
//   h      serie semanal: un solo día de la semana y 7 días entre velas, como el fixture.
// PARÁMETROS DECLARADOS (fuera de la tabla, solo avisa): en las estrategias que declaran run.parametros
// (lib/parametrosEstrategia.js), cada parámetro, cambiado dentro de su rango —los extremos de su rejilla
// sugerida y de su rango, un paso arriba y abajo, el otro sí/no o las otras opciones, siempre que cumplan las
// restricciones con los demás valores guardados—, tiene que cambiar las operaciones en al menos un símbolo
// del fixture (sin filtros). Si ninguno las cambia, AVISO: el parámetro está declarado pero run() no lo usa,
// o no se nota con estos precios. No hace fallar al guardián.
//
// Estados: ok · n/a (no aplica) · ambiguo (no se puede decidir; se explica) · conocido (fallo en la lista de
// scripts/guardian/conocidos.json) · FALLO. Cualquier FALLO termina con código de salida 1.
const path = require('path')
const fs = require('fs')
const { preparaEsm, RAIZ } = require('./guardian/cargaEsm')

// ── Configuración fija ────────────────────────────────────────────────────────────────────────────────
const SIMBOLOS = ['^GSPC', 'AAPL', 'NVDA', 'SAN.MC']
const DESDE = '2021-01-04', HASTA = '2025-12-31'
const CORTES = ['2022-06-30', '2023-06-30', '2024-06-28', '2025-06-30']
const FILTROS = [
  { tipo: 'indiceEma', ambito: 'mercado', activo: true, params: { ticker: '^GSPC', periodo: 50, intervalo: 'diario' } },
  { tipo: 'indiceEma', ambito: 'activo', activo: true, params: { periodo: 30, intervalo: 'diario' } },
]
const COMPROBACIONES = ['motor', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
const MAX_DETALLES = 3          // fallos que se enseñan por estrategia y comprobación (el resto se cuenta)

const args = process.argv.slice(2)
const opcion = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null }
const SOLO = opcion('--solo') ? new RegExp(opcion('--solo')) : null
const DE_FICHERO = opcion('--estrategias')

// ── Entorno del motor: nada a la red ──────────────────────────────────────────────────────────────────
// Variables FALSAS: el motor necesita una URL de Supabase para pedir la estrategia, y esa petición la
// contesta el fetch simulado de abajo. Se ponen DESPUÉS de leer las estrategias (ver ponEntornoFalso):
// la lectura saca de SUPABASE_URL a qué proyecto conectarse.
function ponEntornoFalso() {
  process.env.SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://guardian.invalid'
  process.env.SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'clave-falsa-del-guardian'
}
const FIXTURE = JSON.parse(fs.readFileSync(path.join(RAIZ, 'test', 'fixtures', 'precios.json'), 'utf8'))
const ESTRATEGIAS = new Map()
const fetchReal = global.fetch
const respuesta = (status, cuerpo) => ({ ok: status >= 200 && status < 300, status, json: async () => cuerpo, text: async () => JSON.stringify(cuerpo) })
function fetchSimulado(url, opciones) {
  url = String(url)
  const metodo = String(opciones?.method || 'GET').toUpperCase()
  if (url.includes('/rest/v1/') && metodo !== 'GET') throw new Error(`guardián: escritura ${metodo} bloqueada`)
  let m = url.match(/finance\/chart\/([^?]+)\?/)
  if (m) {
    const s = FIXTURE.simbolos[decodeURIComponent(m[1])]
    if (!s) return Promise.resolve(respuesta(404, {}))
    const d = s.diario
    const ts = d.fecha.map(f => Math.floor(Date.parse(f + 'T14:30:00Z') / 1000))
    const ult = ts[ts.length - 1]
    // Sesión de la última vela ya CERRADA: el fixture termina en una fecha pasada.
    const meta = { currentTradingPeriod: { regular: { start: ult, end: ult + 6.5 * 3600 } } }
    return Promise.resolve(respuesta(200, { chart: { result: [{ meta, timestamp: ts, indicators: { quote: [{ open: d.o, high: d.h, low: d.l, close: d.c, volume: d.v }] } }] } }))
  }
  m = url.match(/\/rest\/v1\/strategies\?id=eq\.([^&]+)/)
  if (m) {
    const e = ESTRATEGIAS.get(decodeURIComponent(m[1]))
    return Promise.resolve(respuesta(200, e ? [{ code_js: e.code_js, params: e.params, visuals: null, name: e.name }] : []))
  }
  if (url.includes('jwks')) return Promise.resolve(respuesta(503, {}))
  return Promise.reject(new Error('guardián: red bloqueada: ' + url.split('?')[0]))
}
// Token bien formado con el JWKS «caído»: la ruta deja pasar con x-supa-jwt, como en producción cuando el
// verificador no puede comprobar.
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url')
const JWT = `${b64({ alg: 'ES256', kid: 'guardian' })}.${b64({ sub: 'guardian', exp: 9999999999 })}.firma`
async function llama(handler, body) {
  let status = 200, cuerpo = null
  const res = { status(c) { status = c; return res }, json(b) { cuerpo = b; return res }, end() { return res }, setHeader() { return res } }
  const silencio = [console.log, console.warn, console.error]
  console.log = console.warn = console.error = () => {}
  try { await handler({ method: 'POST', headers: { 'x-supa-jwt': JWT }, query: {}, body }, res) }
  catch (e) { status = -1; cuerpo = { error: e.message } }
  finally { [console.log, console.warn, console.error] = silencio }
  return { status, cuerpo }
}

// ── Utilidades de las comprobaciones ──────────────────────────────────────────────────────────────────
const igual = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(b))
const n2 = (v) => Number.isFinite(v) ? Number(v.toFixed(4)) : v
const clave = (t) => [t.entryDate, t.exitDate, n2(t.entryPrice), n2(t.exitPrice), t.exitReason ?? null, !!t._virtualClose].join('|')

// Nivel de stop con el que salió una operación: el de stopHistory que coincide con el precio, o, si salió
// en la apertura por debajo del stop (hueco), el más alto que la apertura no alcanzó.
function stopDeSalida(t, vela) {
  const hist = Array.isArray(t.stopHistory) ? t.stopHistory.filter(h => h && Number.isFinite(h.stopPx)) : []
  const exacto = hist.filter(h => igual(h.stopPx, t.exitPrice))
  if (exacto.length) return exacto
  if (vela && igual(t.exitPrice, vela.open)) return hist.filter(h => h.stopPx >= vela.open - 1e-9)
  return []
}

// c) Violaciones de stopHistory en una operación, con una LECTURA de la fecha:
//    'decide' → la fecha es la vela que decide el stop; rige desde la vela siguiente.
//    'rige'   → la fecha es la primera vela en que rige.
// Un `decididaEn` explícito manda sobre las dos lecturas.
// Devuelve [{ texto, ambiguo }]. Dos casos se marcan como AMBIGUOS en vez de como fallo, porque con lo
// que anota stopHistory no se puede decidir:
//   · Un stop «tocado» al que sigue en stopHistory otro MÁS BAJO. Un stop vigente solo sube, así que uno
//     más bajo después es la huella de una cancelación que stopHistory no anota (p. ej. la 32.1 retira el
//     stop si vuelve a cerrar sobre la EMA). Una entrada { date, stopPx: null } anota una cancelación de
//     forma explícita, y entonces no hay ambigüedad.
//   · El stop inicial anotado con la MISMA fecha de la entrada: se lee como «rige desde la entrada»; si la
//     operación sale en esa vela, la comprobación a) lo trata.
function violacionesStop(t, velas, fechas, lectura) {
  const hist = Array.isArray(t.stopHistory) ? t.stopHistory.filter(h => h && h.date && (h.stopPx === null || Number.isFinite(h.stopPx))) : []
  if (!hist.some(h => Number.isFinite(h.stopPx))) return []
  const siguiente = (f) => { const i = fechas.indexOf(f); return i >= 0 && i + 1 < fechas.length ? fechas[i + 1] : '9999-12-31' }
  const rigeDesde = (h) => {
    if (h.decididaEn) return siguiente(h.decididaEn)
    if (h === hist[0] && h.date === t.entryDate) return t.entryDate
    return lectura === 'decide' ? siguiente(h.date) : h.date
  }
  const vigente = (f) => {
    let s = null, desde = ''
    hist.forEach(h => { const r = rigeDesde(h); if (r <= f && r >= desde) { s = h; desde = r } })
    return s && Number.isFinite(s.stopPx) ? s : null
  }
  const out = []
  for (const f of fechas) {
    if (f <= t.entryDate || f >= t.exitDate) continue
    const h = vigente(f), v = velas[f]
    if (h && v && v.low <= h.stopPx + 1e-9 * Math.max(1, Math.abs(h.stopPx))) {
      const ambiguo = hist.some(o => o.date > h.date && Number.isFinite(o.stopPx) && o.stopPx < h.stopPx - 1e-9)
      out.push({ ambiguo, texto: `el ${f} el mínimo (${n2(v.low)}) toca el stop vigente (${n2(h.stopPx)}, anotado el ${h.date}) y la operación sigue abierta hasta el ${t.exitDate}`
        + (ambiguo ? '; después se anota un stop más bajo, señal de que este se canceló sin quedar anotado' : '') })
    }
  }
  if (!t._virtualClose && t.exitDate !== t.entryDate) {
    const cand = stopDeSalida(t, velas[t.exitDate])
    if (cand.length && !cand.some(h => rigeDesde(h) <= t.exitDate))
      out.push({ ambiguo: false, texto: `sale el ${t.exitDate} a ${n2(t.exitPrice)} por un stop que aún no regía (anotado el ${cand[0].date})` })
  }
  return out
}

// ── Comprobaciones de una respuesta de datos.js ───────────────────────────────────────────────────────
function compruebaRespuesta(R, intervalo, anota) {
  const velas = {}, fechas = []
  for (const b of R.chartData || []) { velas[b.date] = b; fechas.push(b.date) }
  const trades = R.trades || []
  const violC = { decide: [], rige: [] }
  for (const t of trades) {
    // b) salida al cierre de la vela que la decide.
    const v = velas[t.exitDate]
    if (!t._virtualClose && v && igual(t.exitPrice, v.close) && !igual(t.exitPrice, v.open) && !stopDeSalida(t, v).length && !igual(t.exitPrice, t.stopPx))
      anota('b', 'FALLO', t.exitDate, `sale a ${n2(t.exitPrice)} (${t.exitReason ?? 'sin motivo'}), el cierre de la vela del ${t.exitDate}, que es la que decide la salida`)
    // e) precios dentro de su vela, tal como los declaró la estrategia.
    for (const a of (t.precioAjustado || [])) {
      const vv = velas[a.campo === 'entrada' ? t.entryDate : t.exitDate]
      anota('e', 'FALLO', a.campo === 'entrada' ? t.entryDate : t.exitDate,
        `${a.campo} declarada a ${n2(a.declarado)}, fuera de [${n2(vv?.low)}, ${n2(vv?.high)}] de su vela; el motor la ejecutó a ${n2(a.ejecutado)} (apertura)`)
    }
    if (t.sinVela) anota('e', 'FALLO', t.entryDate, `operación con ${t.sinVela.join(' y ')} en una fecha sin vela`)
    for (const [campo, f, p] of [['entrada', t.entryDate, t.entryPrice], ['salida', t.exitDate, t.exitPrice]]) {
      const vv = velas[f]
      if (vv && (p < vv.low - 1e-6 || p > vv.high + 1e-6)) anota('e', 'FALLO', f, `${campo} a ${n2(p)} fuera de [${n2(vv.low)}, ${n2(vv.high)}]`)
    }
    // c) las dos lecturas de stopHistory.
    for (const l of ['decide', 'rige']) violacionesStop(t, velas, fechas, l).forEach(v => violC[l].push({ f: t.entryDate, x: v.texto, ambiguo: v.ambiguo }))
  }
  // d) órdenes.
  const ordenes = R.grafico?.ordenes || []
  if (ordenes.length) {
    for (const d of (R.grafico.descartadas || [])) anota('d', 'FALLO', null, `el normalizador descartó ${d.donde}: ${d.motivo}`)
    for (const o of ordenes) {
      if (o.lado !== 'compra' || o.clase !== 'stop') continue
      for (let i = 1; i < o.niveles.length; i++) {
        const a = o.niveles[i - 1], b = o.niveles[i]
        if (!b.prolongado && b.precio > a.precio + 1e-9) anota('d', 'FALLO', b.date, `la orden ${o.id} sube de ${n2(a.precio)} a ${n2(b.precio)}`)
        if (!(b.decididaEn < b.date)) anota('d', 'FALLO', b.date, `nivel de ${o.id} con decididaEn ${b.decididaEn} no anterior a su fecha`)
      }
    }
    const ejec = new Set(ordenes.filter(o => o.fin === 'ejecutada').map(o => o.entryDate))
    const entradas = new Set(trades.map(t => t.entryDate))
    for (const f of entradas) if (!ejec.has(f)) anota('d', 'FALLO', f, 'operación sin su orden ejecutada')
    for (const f of ejec) if (!entradas.has(f)) anota('d', 'FALLO', f, 'orden ejecutada sin operación (ni bloqueada por un filtro)')
  } else anota('d', 'n/a')
  // h) serie semanal.
  if (intervalo === 'semanal') {
    const sem = new Set(Object.values(FIXTURE.simbolos).flatMap(s => s.semanal.fecha))
    fechas.forEach((f, i) => {
      if (new Date(f + 'T00:00:00Z').getUTCDay() !== 1) anota('h', 'FALLO', f, 'vela semanal que no está en lunes')
      if (!sem.has(f)) anota('h', 'FALLO', f, 'vela semanal que no está en el fixture semanal')
      if (i && (Date.parse(f) - Date.parse(fechas[i - 1])) / 86400000 !== 7) anota('h', 'FALLO', f, `${(Date.parse(f) - Date.parse(fechas[i - 1])) / 86400000} días desde la vela anterior (${fechas[i - 1]})`)
    })
  } else anota('h', 'n/a')
  return { violC, trades, velas }
}

// ── Principal ─────────────────────────────────────────────────────────────────────────────────────────
;(async () => {
  const t0 = Date.now()
  await preparaEsm()
  // Estrategias: de la base de datos (solo lectura) o de un fichero.
  let lista
  if (DE_FICHERO) {
    lista = JSON.parse(fs.readFileSync(DE_FICHERO, 'utf8')).map((e, i) => ({ id: e.id || `fichero-${i}`, active: true, ...e }))
  } else {
    const { consultaSoloLectura } = require('./guardian/lecturaBd')
    lista = await consultaSoloLectura(`SELECT id, name, active, params, code_js FROM strategies
      WHERE active AND code_js IS NOT NULL AND length(trim(code_js)) > 0 ORDER BY name;`)
  }
  if (SOLO) lista = lista.filter(e => SOLO.test(e.name))
  for (const e of lista) ESTRATEGIAS.set(e.id, e)
  ponEntornoFalso()
  global.fetch = fetchSimulado
  const datos = require(path.join(RAIZ, 'pages', 'api', 'datos.js')).default
  const multi = require(path.join(RAIZ, 'pages', 'api', 'multibacktest.js')).default
  const { esquemaDeCodigo, validaCombinacion } = require(path.join(RAIZ, 'lib', 'parametrosEstrategia.js'))
  const parametros = []      // { nombre, lista: [{ nombre, usado, probados }] } de las que declaran
  // ¿Cambia algo cada parámetro declarado? Ver la cabecera. `base`: las operaciones sin filtros por símbolo.
  const compruebaParametros = async (est, intervalo, base) => {
    const esquema = esquemaDeCodigo(est.code_js)
    if (!esquema || !esquema.lista.length) return null
    let guardados = {}; try { guardados = typeof est.params === 'string' ? JSON.parse(est.params || '{}') : (est.params || {}) } catch (_) {}
    const lista = []
    for (const p of esquema.lista) {
      const actual = Object.prototype.hasOwnProperty.call(guardados, p.nombre) ? guardados[p.nombre] : p.defecto
      const candidatos = p.tipo === 'sino' ? [!actual] : p.tipo === 'opcion' ? p.opciones.filter(o => o !== actual)
        : [p.sugerido?.min, p.sugerido?.max, p.min, p.max, actual + p.paso, actual - p.paso].filter(v => v != null)
      const validos = [...new Set(candidatos)].filter(v => v !== actual && validaCombinacion(esquema, { [p.nombre]: v }, guardados).ok)
      let usado = false
      const probados = []
      for (const v of validos) {
        probados.push(v)
        for (const sym of SIMBOLOS) {
          const r = await llama(datos, { simbolo: sym, strategyId: est.id, years: 5, fromDate: DESDE, toDate: HASTA, capital_ini: 10000,
            allocation_pct: 100, intervalo, filtros: [], params: { [p.nombre]: v } })
          if (r.status !== 200 || !base[`${sym} sin filtros`]) continue
          if ((r.cuerpo.trades || []).map(clave).join('\n') !== base[`${sym} sin filtros`].map(clave).join('\n')) { usado = true; break }
        }
        if (usado) break
      }
      lista.push({ nombre: p.nombre, usado, probados })
    }
    return lista
  }
  const conocidos = JSON.parse(fs.readFileSync(path.join(__dirname, 'guardian', 'conocidos.json'), 'utf8')).conocidos
    .map(c => ({ ...c, re: new RegExp(c.estrategias) }))
  const esConocido = (nombre, comp) => conocidos.find(c => c.re.test(nombre) && (c.comprobaciones === '*' || c.comprobaciones.includes(comp)))

  const tabla = [], detalles = [], notas = []
  // Conocidos que el guardián HA VISTO fallar: estrategia → { motivo, columnas }. Los demás conocidos
  // que estén en la lista de estrategias se informan como «no detectables por el guardián».
  const conocidosVistos = new Map()
  console.log(`Guardián: ${lista.length} estrategias × ${SIMBOLOS.length} símbolos, periodo ${DESDE} → ${HASTA}, fixture de ${FIXTURE.generado}`)
  for (const est of lista) {
    let params = {}; try { params = typeof est.params === 'string' ? JSON.parse(est.params || '{}') : (est.params || {}) } catch (_) {}
    const intervalo = params.intervalo === 'semanal' ? 'semanal' : 'diario'
    const estados = Object.fromEntries(COMPROBACIONES.map(c => [c, 'ok']))
    const porComp = {}
    const anota = (comp, estado, fecha = null, texto = '', contexto = '') => {
      if (estado === 'n/a') { if (estados[comp] === 'ok') estados[comp] = 'n/a'; return }
      if (estados[comp] === 'n/a') estados[comp] = 'ok'
      let e = estado
      if (e === 'FALLO') {
        const k = esConocido(est.name, comp)
        if (k) {
          e = 'conocido'
          if (!conocidosVistos.has(est.name)) conocidosVistos.set(est.name, { motivo: k.motivo, columnas: new Set() })
          conocidosVistos.get(est.name).columnas.add(comp)
        }
      }
      const rango = { ok: 0, 'n/a': 0, ambiguo: 1, conocido: 2, FALLO: 3 }
      if (rango[e] > rango[estados[comp]]) estados[comp] = e
      if (e === 'FALLO') {
        porComp[comp] = (porComp[comp] || 0) + 1
        if (porComp[comp] <= MAX_DETALLES) detalles.push(`FALLO · ${est.name} · ${contexto} · ${fecha ?? '-'} · ${comp}: ${texto}`)
      }
    }
    const violC = { decide: [], rige: [] }
    const salidasMismaVela = []
    const tradesDatos = {}
    for (const sym of SIMBOLOS) for (const conF of [false, true]) {
      const ctx = `${sym} ${conF ? 'con filtros' : 'sin filtros'}`
      const body = { simbolo: sym, strategyId: est.id, years: 5, fromDate: DESDE, toDate: HASTA, capital_ini: 10000, allocation_pct: 100, intervalo, filtros: conF ? FILTROS : [] }
      const r = await llama(datos, body)
      if (r.status !== 200) { anota('motor', 'FALLO', null, `HTTP ${r.status}: ${r.cuerpo?.error || ''}`.slice(0, 200), ctx); continue }
      const R = r.cuerpo
      const an = (comp, estado, fecha, texto) => anota(comp, estado, fecha, texto, ctx)
      const { violC: vc, trades, velas } = compruebaRespuesta(R, intervalo, an)
      for (const l of ['decide', 'rige']) vc[l].forEach(v => violC[l].push({ ...v, ctx }))
      for (const t of trades) if (t.entryDate === t.exitDate && !t._virtualClose) salidasMismaVela.push({ t, ctx, vela: velas[t.exitDate] })
      tradesDatos[ctx] = trades
      // f) cortes (sin filtros).
      if (!conF) for (const corte of CORTES) {
        const rc = await llama(datos, { ...body, toDate: corte })
        if (rc.status !== 200) { anota('f', 'FALLO', corte, `el corte no responde (HTTP ${rc.status})`, ctx); continue }
        const antes = (ts) => ts.filter(t => !t._virtualClose && t.exitDate < corte).map(clave)
        const a = antes(trades), b = antes(rc.cuerpo.trades || [])
        const i = a.findIndex((k, j) => k !== b[j])
        if (i >= 0 || a.length !== b.length) {
          const j = i >= 0 ? i : Math.min(a.length, b.length)
          anota('f', 'FALLO', corte, `cortando en ${corte}, la operación nº ${j + 1} cambia: completa «${a[j] ?? 'no existe'}» · cortada «${b[j] ?? 'no existe'}»`, ctx)
        }
      }
    }
    // g) multibacktest (slots) contra datos.js.
    for (const conF of [false, true]) {
      const r = await llama(multi, { symbols: SIMBOLOS, strategyId: est.id, cfg: { capitalIni: 10000, years: 5, fromDate: DESDE, toDate: HASTA }, intervalo, filtros: conF ? FILTROS : [], isNoStrategy: /No Strategy/.test(est.name) })
      if (r.status !== 200) { anota('motor', 'FALLO', null, `multibacktest HTTP ${r.status}: ${r.cuerpo?.error || ''}`.slice(0, 200), conF ? 'con filtros' : 'sin filtros'); continue }
      for (const sym of SIMBOLOS) {
        const ctx = `${sym} ${conF ? 'con filtros' : 'sin filtros'}`
        if (!tradesDatos[ctx]) continue
        const a = tradesDatos[ctx].map(clave), b = (r.cuerpo.allTrades || []).filter(t => t.symbol === sym).map(clave)
        if (a.join('\n') !== b.join('\n')) {
          const j = a.findIndex((k, x) => k !== b[x])
          const x = j >= 0 ? j : Math.min(a.length, b.length)
          anota('g', 'FALLO', null, `datos.js ${a.length} operaciones, multibacktest ${b.length}; la nº ${x + 1}: «${a[x] ?? 'no existe'}» frente a «${b[x] ?? 'no existe'}»`, ctx)
        }
      }
    }
    // Parámetros declarados: ¿cambia algo cada uno? (solo avisa; ver la cabecera)
    const usoParametros = await compruebaParametros(est, intervalo, tradesDatos)
    if (usoParametros) parametros.push({ nombre: est.name, lista: usoParametros })
    // c) Se deduce la lectura de la fecha de stopHistory de ESTA estrategia, con las incoherencias que no
    //    son ambiguas. Las ambiguas no deciden nada: se informan.
    const ambiguasC = { decide: violC.decide.filter(v => v.ambiguo), rige: violC.rige.filter(v => v.ambiguo) }
    violC.decide = violC.decide.filter(v => !v.ambiguo); violC.rige = violC.rige.filter(v => !v.ambiguo)
    const nd = violC.decide.length, nr = violC.rige.length
    let lectura = null
    if (nd === 0 && nr > 0) lectura = 'decide'
    else if (nr === 0 && nd > 0) lectura = 'rige'
    if (nd > 0 && nr > 0) {
      const peor = nd <= nr ? violC.decide : violC.rige
      peor.slice(0, MAX_DETALLES + 1).forEach(v => anota('c', 'FALLO', v.f, v.x + ` (con las dos lecturas de la fecha de stopHistory; se enseña la de menos fallos)`, v.ctx))
    } else if (nd === 0 && nr === 0) {
      if (salidasMismaVela.length) lectura = null
    } else notas.push(`${est.name}: la fecha de stopHistory se lee como «${lectura === 'decide' ? 'vela que decide el stop' : 'primera vela en que rige'}» (la otra lectura daría ${lectura === 'decide' ? nr : nd} incoherencias)`)
    // Las ambiguas, con la lectura deducida (o con la de menos casos si no se pudo deducir).
    const amb = ambiguasC[lectura || (ambiguasC.decide.length <= ambiguasC.rige.length ? 'decide' : 'rige')]
    if (amb.length) {
      anota('c', 'ambiguo')
      notas.push(`${est.name}: ${amb.length} ${amb.length === 1 ? 'caso' : 'casos'} de stop «tocado» que no se puede juzgar (posible cancelación sin anotar), p. ej. ${amb[0].ctx}: ${amb[0].x}`)
    }
    // a) salidas en la vela de entrada: permitidas solo con un stop decidido antes de la entrada.
    for (const { t, ctx, vela } of salidasMismaVela) {
      const cand = stopDeSalida(t, vela)
      const texto = `entra y sale el ${t.entryDate} (${t.exitReason ?? 'sin motivo'}, a ${n2(t.exitPrice)})`
      // Decidido antes de la entrada sin ninguna duda: con decididaEn, o anotado en una vela anterior.
      const antes = cand.some(h => h.decididaEn ? h.decididaEn < t.entryDate : h.date < t.entryDate)
      // Anotado con la fecha de la entrada: vale si la estrategia anota «la primera vela en que rige».
      const enLaEntrada = cand.some(h => !h.decididaEn && h.date === t.entryDate)
      if (!cand.length) anota('a', 'FALLO', t.entryDate, `${texto} sin un stop anotado en stopHistory que explique la salida`, ctx)
      else if (antes) { /* ok */ }
      else if (enLaEntrada && lectura === 'rige') { /* ok: la estrategia anota la vela desde la que rige */ }
      else if (enLaEntrada) {
        anota('a', 'ambiguo', t.entryDate, '', ctx)
        notas.push(`${est.name} · ${ctx}: ${texto} con el stop anotado el mismo día de la entrada; vale si el stop se decidió con la vela de señal, y stopHistory no lo dice${lectura ? ' (esta estrategia anota la vela que decide en los demás stops)' : ''}`)
      } else anota('a', 'FALLO', t.entryDate, `${texto} con un stop anotado el ${cand[0].date}, que no estaba decidido antes de la entrada`, ctx)
    }
    for (const [comp, n] of Object.entries(porComp)) if (n > MAX_DETALLES) detalles.push(`FALLO · ${est.name} · … y ${n - MAX_DETALLES} más en «${comp}»`)
    tabla.push({ nombre: est.name, intervalo, estados })
    process.stdout.write('.')
  }
  process.stdout.write('\n\n')

  // ── Informe ──
  const ancho = Math.min(46, Math.max(10, ...tabla.map(f => f.nombre.length)))
  const celda = (s) => s.padEnd(9)
  console.log('ESTRATEGIA'.padEnd(ancho) + ' INT ' + COMPROBACIONES.map(c => celda(c)).join(''))
  for (const f of tabla) console.log(f.nombre.slice(0, ancho).padEnd(ancho) + ' ' + (f.intervalo === 'semanal' ? 'W' : 'D') + '   ' + COMPROBACIONES.map(c => celda(f.estados[c])).join(''))
  const fallos = tabla.filter(f => Object.values(f.estados).includes('FALLO'))
  if (notas.length) { console.log('\nNOTAS (stopHistory y casos ambiguos):'); [...new Set(notas)].slice(0, 40).forEach(n => console.log('  · ' + n)) }
  if (detalles.length) { console.log('\nFALLOS:'); detalles.forEach(d => console.log('  ' + d)) }
  if (parametros.length) {
    console.log('\nPARÁMETROS DECLARADOS (¿cambia algo cada uno dentro de su rango?):')
    for (const e of parametros) console.log(`  · ${e.nombre}: ${e.lista.map(p => `${p.nombre} ${p.usado ? 'sí' : 'NO'}`).join(', ')}`)
    const avisos = parametros.flatMap(e => e.lista.filter(p => !p.usado).map(p => `AVISO · ${e.nombre} · «${p.nombre}»: ningún valor probado (${p.probados.length ? p.probados.join(', ') : 'ninguno válido'}) cambia las operaciones en ${SIMBOLOS.join(', ')}; o run() no lo usa o no se nota con estos precios`))
    avisos.forEach(a => console.log('  ' + a))
  }
  // Conocidos: los detectados (con sus columnas) y los que estas comprobaciones no ven, con su nota.
  const detectados = [], noDetectables = []
  for (const f of tabla) {
    const k = conocidos.find(c => c.re.test(f.nombre))
    if (!k) continue
    const visto = conocidosVistos.get(f.nombre)
    if (visto) detectados.push(`${f.nombre} — conocido (detectado en ${[...visto.columnas].sort().join(', ')}): ${k.motivo}`)
    else noDetectables.push(`${f.nombre} — conocido (no detectable por el guardián): ${k.motivo}`)
  }
  if (detectados.length || noDetectables.length) {
    console.log('\nCONOCIDOS:')
    detectados.forEach(c => console.log('  · ' + c))
    noDetectables.forEach(c => console.log('  · ' + c))
  }
  console.log(`\n${tabla.length} estrategias · ${fallos.length} con FALLO · ${detectados.length + noDetectables.length} conocidas `
    + `(${detectados.length} detectadas, ${noDetectables.length} no detectables por el guardián) · ${((Date.now() - t0) / 1000).toFixed(0)} s`)
  global.fetch = fetchReal
  if (fallos.length) { console.log('GUARDIÁN: FALLO'); process.exit(1) }
  console.log('GUARDIÁN: OK')
})().catch(e => { console.error('El guardián no ha podido terminar:', e.message); process.exit(1) })
