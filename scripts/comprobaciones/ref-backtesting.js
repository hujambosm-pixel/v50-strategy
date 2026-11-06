// scripts/comprobaciones/ref-backtesting.js — las cifras de referencia del Backtesting R1–R3 (fijadas el 05/11/2026 con los precios
// REALES; docs/builder.md §76): el motor de /api/multibacktest del árbol de trabajo, con el entorno de la batería (entorno.js) pero con
// la «foto» hecha de precios_diarios (solo lectura, con el token de «supabase login») en lugar de la de datos/. Cuerpos como los arma
// la pantalla. Antes era backups/fase0-referencias/refMC.js (fase 0 de «el plan con lista»).
// Uso: node scripts/comprobaciones/ref-backtesting.js      Termina en 0 si las tres salen como se fijaron. Deja las respuestas en
// salida/ref-backtesting.json. Si un valor de la lista hace un split, la caché puede cambiar y estas cifras también: avisar a Sergi.
const path = require('path'), crypto = require('crypto'), fs = require('fs')
const { prepara, registra, RAIZ } = require('./cargador')
const { consultaSoloLectura } = require(path.join(RAIZ, 'scripts/guardian/lecturaBd.js'))
const SIMBOLOS = ['AAPL', 'AMZN', 'ASML', 'GOOGL', 'MA', 'META', 'MSFT', 'NFLX', 'NVDA', 'TSLA', 'UNH', 'V']   // la lista «Degiro»
// Lo fijado (CLAUDE.local.md, «Regla de oro de la C»): final, Max DD con flotante (el de la tabla) y operaciones.
const FIJADAS = { R1: { final: '38435.90', dd: '24.43', ops: 1859 }, R2: { final: '62992.32', dd: '32.12', ops: 234 }, R3: { final: '21769.29', dd: '20.01', ops: 1316 } }
;(async () => {
  await prepara(); registra(RAIZ)
  // 1 · La foto con los precios reales (cifras completas: extra_float_digits).
  const foto = {}
  for (const s of [...SIMBOLOS, '^GSPC']) {
    const r = await consultaSoloLectura(`SET LOCAL extra_float_digits = 1; select * from public.leer_velas('${s}', '2004-01-01', '2026-01-31');`)
    const v = r[r.length - 1].leer_velas
    const ts = v.fecha.map(f => Math.floor(Date.parse(f + 'T13:30:00Z') / 1000))
    foto[s] = { meta: { firstTradeDate: ts[0], currentTradingPeriod: { regular: { start: ts[ts.length - 1], end: ts[ts.length - 1] + 23400 } } }, timestamp: ts, quote: { open: v.open, high: v.high, low: v.low, close: v.close, volume: v.volumen } }
  }
  const E = require('./entorno')
  const H = require(path.join(RAIZ, 'pages/api/multibacktest.js')).default
  { const orig = globalThis.fetch; globalThis.fetch = async (url, o) => { const m = String(url).match(/\/rest\/v1\/strategies\?id=eq\.([^&]+)/); if (m) { const s = E.ESTRATEGIAS.get(m[1]); const filas = s ? [{ code_js: s.code_js, params: s.params, name: s.name, definition: s.definition ?? null }] : []; return { ok: true, status: 200, json: async () => filas, text: async () => JSON.stringify(filas) } } return orig(url, o) } }
  E.estado.foto = foto; E.estado.enCurso = false
  for (const s of Object.keys(foto)) E.llenaCache(s, { desde: '2004-01-01' })
  const est = (n) => { const f = E.FILAS.find(x => x.name === n); if (!f) throw new Error('falta ' + n); return f }
  const params = (f) => { try { return typeof f.params === 'string' ? JSON.parse(f.params) : (f.params || {}) } catch (_) { return {} } }
  const COM = { compra: 0.36, venta: 0, porcentaje: 0 }
  const sizeRules = (x) => ({ riskPerTrade: 1, maxPortfolioPct: 25, maxAccumRisk: 6, assumedStopPct: 8, maxPosiciones: 4, prioridad: 'alfabetico', criterioUso: 'filtro', momentumN: 20, rsWindow: 63, rsGateThr: 0, momGateThr: 10, proxGateThr: 10, ...x })
  const filtroMercado = { id: 'indiceEma@mercado', tipo: 'indiceEma', ambito: 'mercado', activo: true, params: { ticker: '^GSPC', periodo: 200, intervalo: 'diario' } }
  const filtroActivo = { id: 'indiceEma@activo', tipo: 'indiceEma', ambito: 'activo', activo: true, params: { periodo: 200, intervalo: 'diario' } }
  const CASOS = [
    ['R1', 'Capital compartido · Prueba editor EMA20 · sin filtros', 'compartido', 'Prueba editor EMA20', {}, []],
    ['R2', 'Capital concentrado · máx. 4 · Momentum 20 días · Desempate · SuperTrend 10/3 · sin filtros', 'concentrado', 'SuperTrend 10/3', { prioridad: 'momentum', criterioUso: 'desempate', momentumN: 20 }, []],
    ['R3', 'Slots iguales · Prueba editor EMA20 · mercado ^GSPC > EMA 200 y activo > EMA 200', 'slots', 'Prueba editor EMA20', {}, [filtroMercado, filtroActivo]],
  ]
  const out = {}; let fallos = 0
  for (const [id, nombre, modo, est1, sr, filtros] of CASOS) {
    const s = est(est1), rules = sizeRules(sr)
    const cfg = { capitalIni: 10000, years: null, fromDate: '2016-01-01', toDate: '2025-12-31', sizeRules: rules, ...params(s) }
    const body = { symbols: SIMBOLOS, modoAsig: modo, weights: {}, cfg, strategyId: s.id, isNoStrategy: false, filtros, intervalo: 'diario', comisiones: COM }
    const r = await E.llama(H, body)
    if (r.status !== 200) { console.log(id, 'HTTP', r.status, String(r.cuerpo).slice(0, 300)); fallos++; continue }
    const j = JSON.parse(r.cuerpo), c = j.compoundCurve
    const sale = { final: c[c.length - 1].value.toFixed(2), dd: j.maxDDFloatCompound.toFixed(2), ops: (j.allTrades || []).length }
    const f = FIJADAS[id], igual = sale.final === f.final && sale.dd === f.dd && sale.ops === f.ops
    if (!igual) fallos++
    out[id] = { nombre, md5: crypto.createHash('md5').update(r.cuerpo).digest('hex'), sale, resp: j }
    console.log(`${igual ? 'OK ' : 'MAL'} ${id} · ${nombre}: final ${sale.final} € · Max DD ${sale.dd} % · ${sale.ops} operaciones · md5 ${out[id].md5}${igual ? '' : `  (fijado: ${f.final} € · ${f.dd} % · ${f.ops})`}`)
  }
  fs.mkdirSync(path.join(__dirname, 'salida'), { recursive: true })
  fs.writeFileSync(path.join(__dirname, 'salida', 'ref-backtesting.json'), JSON.stringify(out))
  console.log(`ref-backtesting: fallos: ${fallos}`)
  process.exit(fallos ? 1 : 0)
})().catch(e => { console.error('FALLO', e.stack); process.exit(1) })
