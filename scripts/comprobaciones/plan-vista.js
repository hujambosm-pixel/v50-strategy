// scripts/comprobaciones/plan-vista.js — una vista del screener como valores del plan, el MOTOR (docs/builder.md §274).
// Las corre comunes.sh. Termina en 0 si todo da lo esperado.
//
// A mano.
//   1 · La máscara de las listas de cada lunes (lib/planes/vistaUniverso.js universoDeSemanas):
//       lunes 02/03/2020 [A, B] · 09/03 [A] · 16/03 [B, A]  →  A [[02/03, 23/03)] (tres semanas seguidas, un solo tramo; la última foto vale
//       7 días) · B [[02/03, 09/03), [16/03, 23/03)]. Con el plan desde el 10/03, la semana del 02/03 (acaba el 09/03) ya no cuenta.
//   2 · La lista en la SEÑAL (lib/editor/interprete.js, ctx.puedeEntrar). 30 sesiones desde el lunes 02/03/2020 (d0…d29); VAL a 100 hasta
//       d9 y desde d10 cierra a 104, 106, 108… (+2 al día); cada vela abre al cierre de la anterior.
//       «De estado» (cierre > SMA 3, cierto desde d10): sin la lista, señal al cierre de d10 → compra a la apertura de d11 = 104.
//       Con VAL en la lista solo desde el lunes 23/03 (d15): la compra se mira en la vela en que se haría (la siguiente a la señal) →
//       señal al cierre del viernes d14 → compra a la apertura del lunes d15 = cierre de d14 = 112.
//       Con la orden «al cierre», se mira la misma vela: compra al cierre de d15 = 114.
//       «De un momento» (el cierre CRUZA su SMA 3: solo en d10): con la lista desde d15, NINGUNA operación (se pierde, como con un filtro).
//       Con la máscara SOLO después (lo que hace el Nasdaq-100), el «de estado» tampoco compraría: su operación de d11 se descarta y no hay otra
//       mientras sigue «dentro» → por eso la vista va en la señal.
process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://arnes.invalid'; process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'clave-falsa-del-arnes'
const C0 = require('./cargador'), R = C0.RAIZ, D = require('./domFalso')
const E = require('./entorno')
let fallos = 0
const ok = (c, t) => { console.log(`${c ? 'OK  ' : 'MAL '} ${t}`); if (!c) fallos++ }
const txt = (x) => JSON.stringify(x)

;(async () => {
  D.pon(); await C0.prepara(); C0.registra(R)
  { const Mod = require('module'), orig = Mod._load; const vacio = new Proxy({}, { get: (_, k) => k === '__esModule' ? true : () => null }); const nada = new Proxy(function () {}, { get: (_, k) => k === '__esModule' ? true : k === Symbol.toPrimitive ? () => 0 : nada, apply: () => nada })
    Mod._load = function (req, ...r) { return req === 'recharts' ? vacio : req === 'lightweight-charts' ? nada : orig.call(this, req, ...r) } }
  if (!globalThis.ResizeObserver) globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
  const V = require(R + '/lib/planes/vistaUniverso.js'), I = require(R + '/lib/editor/interprete.js'), U = require(R + '/lib/universoDinamico.js')
  const Li = require(R + '/lib/planes/lista.js'), PD = require(R + '/components/backtesting/PlanPorDentro.js'), Pa = require(R + '/lib/builder/planPantalla.js'), Api = require(R + '/pages/api/plan.js')

  // ── 1 · La máscara ──
  const S = [['2020-03-09', ['A']], ['2020-03-02', ['A', 'B']], ['2020-03-16', ['B', 'A']]]   // desordenadas a propósito
  const u = V.universoDeSemanas(S, '2020-01-01', '2020-12-31')
  ok(txt(u.mascara) === txt({ A: [['2020-03-02', '2020-03-23']], B: [['2020-03-02', '2020-03-09'], ['2020-03-16', '2020-03-23']] }) && txt(u.simbolos) === '["A","B"]' && u.semanas === 3 && u.primera === '2020-03-02' && u.ultima === '2020-03-16',
    `la máscara: A un tramo de tres semanas; B dos tramos (${txt(u.mascara)})`)
  const u2 = V.universoDeSemanas(S, '2020-03-10', '2020-12-31')
  ok(txt(u2.mascara) === txt({ A: [['2020-03-09', '2020-03-23']], B: [['2020-03-16', '2020-03-23']] }) && u2.semanas === 2, `desde el 10/03: la semana del 02/03 ya no cuenta (${txt(u2.mascara)})`)
  const u3 = V.universoDeSemanas(S, '2020-01-01', '2020-03-08')
  ok(txt(u3.mascara) === txt({ A: [['2020-03-02', '2020-03-09']], B: [['2020-03-02', '2020-03-09']] }), 'hasta el 08/03: solo la primera semana')
  ok(U.admiteEntrada(u.mascara, 'B', '2020-03-06') && !U.admiteEntrada(u.mascara, 'B', '2020-03-09') && U.admiteEntrada(u.mascara, 'B', '2020-03-20') && !U.admiteEntrada(u.mascara, 'B', '2020-03-23'),
    'con admiteEntrada de siempre: B entra el 06/03 y el 20/03; no el 09/03 ni el 23/03')
  ok(V.esUniversoVista('vista:12') && !V.esUniversoVista('vista:') && !V.esUniversoVista('ndx_vol_10') && V.idDeVista('vista:12') === 12 && V.universoDeVista(12) === 'vista:12', 'el universo se guarda como «vista:<id>»')

  // ── El estado (como estadoUniversoMc) ──
  const d0 = { semanas: S, nombre: 'Poca deuda' }
  const e = (o) => V.estadoUniversoVista({ datos: d0, nombre: 'Poca deuda', desde: '2020-03-02', hasta: '2020-12-31', ...o })
  ok(e({ datos: undefined }).motivo === 'Leyendo la vista del screener «Poca deuda»…' && e({ datos: { error: 'Sin sesión' } }).motivo === 'Sin sesión', 'leyendo y error')
  ok(e({ desde: '2019-01-01' }).motivo === 'las fotos del screener empiezan el lunes 02/03/2020: empieza el plan ese día o después.', `antes de la primera foto: lo dice (${e({ desde: '2019-01-01' }).motivo})`)
  ok(e({ datos: { semanas: [['2020-03-02', []]] } }).motivo === 'ningún valor pasa la vista «Poca deuda» en ese periodo.', 'sin valores')
  const muchas = [['2020-03-02', Array.from({ length: 151 }, (_, i) => `S${i}`)]]
  ok(e({ datos: { semanas: muchas } }).motivo.startsWith('en ese periodo pasan la vista 151 valores distintos; como mucho, 150'), 'más de 150 valores distintos: lo dice')
  ok(e({ conEstrategia: false }).activo === false && e({}).activo === true && txt(e({}).universo.simbolos) === '["A","B"]', 'con todo: activo, con sus valores')

  // ── 2 · La lista en la señal ──
  const dias = []; for (let d = new Date('2020-03-02T00:00:00Z'); dias.length < 30; d = new Date(d.getTime() + 864e5)) { const w = d.getUTCDay(); if (w >= 1 && w <= 5) dias.push(d.toISOString().slice(0, 10)) }
  const VAL = dias.map((date, i) => { const c = i < 10 ? 100 : 104 + 2 * (i - 10), o = i < 1 ? c : (i - 1 < 10 ? 100 : 104 + 2 * (i - 11)); return { date, open: o, high: Math.max(o, c), low: Math.min(o, c), close: c, volume: 1000 } })
  ok(dias[10] === '2020-03-16' && dias[14] === '2020-03-20' && dias[15] === '2020-03-23' && VAL[14].close === 112 && VAL[15].open === 112 && VAL[15].close === 114, 'las fechas y los precios del dibujo')
  const sobre = { c: 'precioVsMedia', p: { tipo: 'SMA', periodo: 3, lado: 'encima' } }
  const base = (senal, orden = 'apertura') => ({ tipo: 'editor', motor: 1, formato: 1, nombre: 'P', entrada: { orden: { tipo: orden }, senal }, stops: [{ id: 'inicial', tipo: 'porcentaje', pct: 50, motivo: 'stop' }], salidas: [] })
  const ESTADO = base(sobre), CIERRE = base(sobre, 'cierre'), MOMENTO = base({ c: 'cruza', de: sobre })
  const ops = (def, ctx = {}) => { const r = I.interpreta(def, VAL, {}, ctx); return [...r.trades, ...(r.openPosition ? [r.openPosition] : [])].map(t => [t.entryDate, t.entryPrice]) }
  const desde23 = (f) => f >= '2020-03-23'
  ok(txt(ops(ESTADO)) === txt([['2020-03-17', 104]]), `sin la lista: compra a la apertura de d11 a 104 (${txt(ops(ESTADO))})`)
  ok(txt(ops(ESTADO, { puedeEntrar: desde23 })) === txt([['2020-03-23', 112]]), `«de estado» con la lista desde el lunes 23/03: compra ese lunes a 112 (${txt(ops(ESTADO, { puedeEntrar: desde23 }))})`)
  ok(txt(ops(CIERRE, { puedeEntrar: desde23 })) === txt([['2020-03-23', 114]]), `con la orden «al cierre»: compra al cierre del 23/03 a 114 (${txt(ops(CIERRE, { puedeEntrar: desde23 }))})`)
  ok(txt(ops(MOMENTO)) === txt([['2020-03-17', 104]]) && txt(ops(MOMENTO, { puedeEntrar: desde23 })) === '[]', '«de un momento» bloqueado por la lista: se pierde (ninguna operación)')
  ok(txt(ops(ESTADO, { puedeEntrar: undefined })) === txt(ops(ESTADO)) && txt(I.interpreta(ESTADO, VAL, {}, {})) === txt(I.interpreta(ESTADO, VAL, {}, { referencias: {} })), 'sin puedeEntrar: exactamente como siempre')
  const soloDespues = ops(ESTADO).filter(([f]) => U.admiteEntrada({ VAL: [['2020-03-23', '2020-04-30']] }, 'VAL', f))
  ok(soloDespues.length === 0, 'con la máscara solo después (como el Nasdaq-100), el «de estado» no compraría: por eso la vista va en la señal')

  // ── 3 · La lista guardada en el plan ──
  ok(Li.mergeLista({ universo: 'vista:7' }).universo === 'vista:7' && Li.mergeLista({ universo: 'vista:x' }).universo === 'manual', 'mergeLista guarda «vista:7» y descarta lo que no vale')
  ok(txt(Li.validaLista(Li.mergeLista({ universo: 'vista:7', modo: 'concentrado' }))) === '[]' && Li.validaLista(Li.mergeLista({ universo: 'vista:7', modo: 'compartido' })).some(x => x.includes('con una vista del screener, el reparto tiene que ser «Capital concentrado»')),
    'con una vista: solo «Capital concentrado» (los demás, más adelante)')
  ok(Li.validaLista(Li.mergeLista({ universo: 'ndx_vol_10', modo: 'compartido' })).includes('con el Nasdaq-100, el reparto tiene que ser «Capital concentrado».'), 'el Nasdaq-100 dice lo de siempre')

  // ── 4 · La petición y /api/plan ──
  const EMA20 = E.FILAS.find(s => s.name === 'Prueba editor EMA20'); if (!EMA20) throw new Error('falta «Prueba editor EMA20» en la copia de backups/')
  const est = { ...EMA20 }
  const SIMB = ['AAPL', 'AMZN', 'MSFT', 'NVDA', 'META', 'GOOGL']
  const semanas = []; for (let d = new Date('2011-01-03T00:00:00Z'), k = 0; d < new Date('2026-11-24T00:00:00Z'); d = new Date(d.getTime() + 7 * 864e5), k++) semanas.push([d.toISOString().slice(0, 10), [SIMB[k % 6], SIMB[(k + 1) % 6]]])
  const a = { ...Pa.AJUSTES_PLAN, activo: 'AAPL', ocioso: 'LIQUIDEZ', donde: 'lista', lista: Li.mergeLista({ universo: 'vista:7', modo: 'concentrado' }) }
  const datos = { 'vista:7': { semanas, nombre: 'Poca deuda' } }
  const c = PD.peticionPorDentro({ a, estrategia: est, universoDatos: datos })
  const per = Pa.fechasDe(a)
  ok(!!c && c.modoAsig === 'concentrado' && c.universo?.regla === 'vista' && c.universo.n === 7 && txt(c.universo.elegidos) === '{}' && txt(c.symbols) === txt([...SIMB].sort()) && txt(Object.keys(c.universo.mascara)) === txt(c.symbols) && c.cfg.fromDate === per.desde,
    `la petición: concentrado, regla «vista», n = 7, los 6 valores (${c && txt(c.symbols)})`)
  ok(PD.peticionPorDentro({ a, estrategia: est }) === null && PD.motivoSinPeticion({ a, estrategia: est }) === 'Leyendo la vista del screener «la vista»…', 'sin lo de la base aún: no pide nada y dice que lo está leyendo')
  ok(PD.motivoSinPeticion({ a, estrategia: est, universoDatos: { 'vista:7': { semanas: [['2011-01-03', []]] } } }) === 'Con la vista del screener no se calcula: ningún valor pasa la vista «la vista» en ese periodo.', 'sin valores: lo dice')
  const plan = Pa.planDe(a, est), pieza = plan.piezas[0]
  ok(Api.errorCuerpoLista(plan, pieza, c) === null, `/api/plan acepta la petición de su vista (${Api.errorCuerpoLista(plan, pieza, c)})`)
  ok(Api.errorCuerpoLista(plan, pieza, { ...c, universo: { ...c.universo, n: 8 } }) !== null && Api.errorCuerpoLista(plan, pieza, { ...c, universo: { ...c.universo, regla: 'volatilidad' } }) !== null, 'y rechaza la de otra vista o la de otro universo')
  const aN = { ...a, lista: Li.mergeLista({ universo: 'ndx_vol_10', modo: 'concentrado' }) }, pN = Pa.planDe(aN, est)
  ok(Api.errorCuerpoLista(pN, pN.piezas[0], c) !== null, 'un plan del Nasdaq-100 no acepta la petición de una vista')

  console.log(fallos ? `FALLOS: ${fallos}` : 'plan-vista: todo bien')
  process.exit(fallos ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
