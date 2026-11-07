// scripts/comprobaciones/plan-tu-dinero-lista.js — «Tu dinero» con «Una lista» (fase 6 de «el plan con lista», docs/builder.md §89).
// Las corre comunes.sh. Termina en 0 si todo va bien.
// 1 · Cuentas a mano con dos valores inventados (A y B): Capital compartido y Capital concentrado, con 1 € de comisión por orden.
// 2 · Qué se puede calcular todavía (motivoListaNoCalculable) y qué se deja fuera (planListaCalculable).
// 3 · LA PRUEBA DE ORO: con la foto de precios de la lista Degiro (sin red), para muchas combinaciones de reparto, prioridad, puerta,
//     máximo de posiciones, comisión, periodo y filtros, el plan acaba con el MISMO dinero que «La cartera por dentro» (la curva
//     compuesta del Backtesting con la misma petición), al céntimo.
// 4 · /api/plan entero (con la petición de la lista, que pasa a /api/multibacktest en el mismo proceso) y la pantalla del paso 3 montada:
//     «Tu dinero» con lista enseña el resultado, la línea de lo que todavía no cuenta y la comprobación con «La cartera por dentro».
//     QQQ y SPY no están en la foto: se usan las velas de AAPL y MSFT con su nombre (solo para las comparaciones de la tabla).
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://arnes.invalid'; process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'clave-falsa-del-arnes'
const path = require('path')
const C0 = require('./cargador'), R = C0.RAIZ
const E = require('./entorno')
let fallos = 0
const ok = (c, t) => { console.log(`${c ? 'OK  ' : 'MAL '} ${t}`); if (!c) fallos++ }
const cerca = (x, y, tol = 1e-9) => Math.abs(x - y) < tol

;(async () => {
  await C0.prepara(); C0.registra(R)
  const Pl = require(R + '/lib/planes/plan.js'), Pa = require(R + '/lib/builder/planPantalla.js'), Li = require(R + '/lib/planes/lista.js')
  const PD = require(R + '/components/backtesting/PlanPorDentro.js')

  // ── 1 · A mano ──
  const F = ['2020-01-02', '2020-01-03', '2020-01-06', '2020-01-07']
  const activo = (symbol, abre, cierra, candidatos) => ({ symbol, fechas: F, abre, cierra, candidatos })
  const A = activo('A', [10, 10, 11, 12], [10, 11, 11.5, 12], [{ symbol: 'A', entryDate: F[1], entryPx: 10, exitDate: F[3], exitPx: 12, pasaPuerta: true }])
  const B = activo('B', [20, 20, 18, 18], [20, 19, 18, 18], [{ symbol: 'B', entryDate: F[1], entryPx: 20, exitDate: F[2], exitPx: 18, pasaPuerta: true }])
  const planA = (modo) => ({ tipo: 'plan', formato: 1, calculo: 1, dinero: { capitalInicial: 1000, aportaciones: { frecuencia: 'ninguna' }, extraordinarias: [] },
    piezas: [{ id: 'e', tipo: 'estrategia', donde: 'lista', lista: Li.mergeLista({ simbolos: ['A', 'B'], modo, maxPosiciones: 1 }), activo: 'A', ocioso: 'LIQUIDEZ', peso: 1, apalancamiento: 1, estrategia: { id: 'x', name: 'Inventada' } }],
    reparto: { aportacionesA: 'pesos', rebalanceo: { calendario: 'nunca', banda: null } }, impuestos: { regimen: 'ninguno', reglaDosMeses: true },
    costes: { comisionPct: 0, comisionMinEur: 1, horquillaPct: { QQQ: 0, ETF: 0, SPY: 0 } }, periodo: { desde: F[0], hasta: F[3] } })
  const datosA = (modo) => ({ fechas: F, qqq: F.map(() => null), etf: F.map(() => null), spy: F.map(() => null), lista: { opciones: { modo, n: 2, maxPosiciones: 1, prioridad: 'alfabetico' }, activos: [A, B] } })
  {
    // Compartido, n = 2: el día 2 entra A con mín(1.000/2, 1.000) = 500 € (1 € de comisión → 499 € / 10 = 49,9 acciones) y B con
    // mín((500 + 500)/2, 500) = 500 € (499 / 20 = 24,95). El día 3 sale B a 18: 24,95 × 18 = 449,10 − 1 = 448,10 €. El día 4 sale A a 12:
    // 49,9 × 12 = 598,80 − 1 = 597,80 €. Final: 448,10 + 597,80 = 1.045,90 €, 4 órdenes, 4 € de comisiones.
    const r = Pl.ejecutaPlan(planA('compartido'), datosA('compartido'))
    ok(cerca(r.valorNeto, 1045.9, 1e-9) && r.costes.ordenes === 4 && cerca(r.costes.pagados, 4), `compartido a mano: 1.045,90 € con 4 órdenes y 4 € de comisiones (${r.valorNeto}, ${r.costes.ordenes}, ${r.costes.pagados})`)
    ok(cerca(r.serie[1].patrimonio, 49.9 * 11 + 24.95 * 19), `día 2 al cierre: 49,9 × 11 + 24,95 × 19 = 1.022,95 € (${r.serie[1].patrimonio})`)
  }
  {
    // Concentrado, máx. 1: el día 2 entra solo A (alfabético) con mín(1.000, 1.000 / mín(1, 2)) = 1.000 € → 999 / 10 = 99,9 acciones; B no
    // cabe. El día 4: 99,9 × 12 = 1.198,80 − 1 = 1.197,80 €.
    const r = Pl.ejecutaPlan(planA('concentrado'), datosA('concentrado'))
    ok(cerca(r.valorNeto, 1197.8, 1e-9) && r.costes.ordenes === 2, `concentrado máx. 1 a mano: 1.197,80 € con 2 órdenes (${r.valorNeto}, ${r.costes.ordenes})`)
    const d = datosA('concentrado'); d.lista.activos = [A, { ...B, candidatos: [{ ...B.candidatos[0], symbol: 'B' }] }]
    d.lista.activos[0] = { ...A, candidatos: [{ ...A.candidatos[0], pasaPuerta: false }] }
    const r2 = Pl.ejecutaPlan(planA('concentrado'), d)
    // A no pasa la puerta: entra B con 1.000 € → 999 / 20 = 49,95; sale a 18: 899,10 − 1 = 898,10 €.
    ok(cerca(r2.valorNeto, 898.1, 1e-9), `con A fuera por la puerta, entra B: 898,10 € (${r2.valorNeto})`)
    const e = r.estrategias.e
    ok(e.lista === true && e.operaciones.length === 1 && e.operaciones[0].symbol === 'A' && e.dentro.length === 4 && e.dentro[0] === 0 && cerca(e.dentro[1], 1), `la pieza devuelve sus operaciones (1, de A) y la parte del dinero dentro cada día (${e.dentro.map(x => x.toFixed(3)).join(' · ')})`)
  }

  // ── 2 · Qué se calcula ──
  const est = E.FILAS.find(s => s.name === 'Prueba editor EMA20'); if (!est) throw new Error('falta «Prueba editor EMA20»')
  const SIMB = ['AAPL', 'AMZN', 'ASML', 'GOOGL', 'MA', 'META', 'MSFT', 'NFLX', 'NVDA', 'TSLA', 'UNH', 'V']
  const aBase = { ...Pa.AJUSTES_PLAN, donde: 'lista', periodo: 'todo', capital: 10000, lista: Li.mergeLista({ simbolos: SIMB, modo: 'compartido' }) }
  {
    const p = Pa.planDe(aBase, est)   // por defecto: 300 €/mes, impuestos de España, ocioso en liquidez
    const c = Pl.planListaCalculable(p)
    ok(JSON.stringify(c.ignorado) === '["aportaciones","impuestos"]' && Pl.motivoListaNoCalculable(c.plan) === null && Pl.motivoListaNoCalculable(p) === Pl.AVISO_LISTA_SIMPLE,
      `por defecto se dejan fuera las aportaciones y los impuestos (${c.ignorado.join(', ')}), y así sí se calcula`)
    const c2 = Pl.planListaCalculable(Pa.planDe({ ...aBase, ocioso: 'GLD', apalancamiento: 2 }, est))
    ok(JSON.stringify(c2.ignorado) === '["aportaciones","impuestos","ocioso","apalancamiento"]' && c2.plan.piezas[0].ocioso === 'LIQUIDEZ' && c2.plan.piezas[0].apalancamiento === 1, 'con oro y ×2, también el ocioso y el apalancamiento')
    ok(Pl.motivoListaNoCalculable(Pl.planListaCalculable(Pa.planDe({ ...aBase, lista: { ...aBase.lista, modo: 'slots' } }, est)).plan) === Pl.AVISO_LISTA_MODO
      && Pl.motivoListaNoCalculable(Pl.planListaCalculable(Pa.planDe({ ...aBase, lista: { ...aBase.lista, universo: 'ndx_vol_10', modo: 'concentrado' } }, est)).plan) === Pl.AVISO_LISTA_UNIVERSO,
      'con «Slots iguales» o el Nasdaq-100: todavía no, y lo dice')
    ok(Pl.planListaCalculable(Pa.planDe({ ...aBase, donde: 'accion' }, est)).ignorado.length === 0 && Pl.motivoListaNoCalculable(Pa.planDe({ ...aBase, donde: 'accion' }, est)) === null, 'con «Una acción», nada cambia')
  }

  // ── 3 · La prueba de oro ──
  const foto = require(path.join(E.DATOS, 'foto_degiro.json'))
  foto.QQQ = foto.AAPL; foto.SPY = foto.MSFT
  E.estado.foto = foto; E.estado.enCurso = false
  for (const s of Object.keys(foto)) E.llenaCache(s, { desde: '2006-01-01' })
  const H = require(R + '/pages/api/multibacktest.js').default
  { const orig = globalThis.fetch; globalThis.fetch = async (url, o) => { const m = String(url).match(/\/rest\/v1\/strategies\?id=eq\.([^&]+)/); if (m) { const s = E.ESTRATEGIAS.get(m[1]); const filas = s ? [{ code_js: s.code_js, params: s.params, name: s.name, definition: s.definition ?? null }] : []; return { ok: true, status: 200, json: async () => filas, text: async () => JSON.stringify(filas) } } return orig(url, o) } }
  const ST = E.FILAS.find(s => s.name === 'SuperTrend 10/3')
  const filtroMercado = [{ id: 'indiceEma@mercado', tipo: 'indiceEma', ambito: 'mercado', activo: true, params: { ticker: '^GSPC', periodo: 200, intervalo: 'diario' } }]
  const COMS = [{ comisionTipo: 'pct', comision: 0 }, { comisionTipo: 'pct', comision: 0.1 }, { comisionTipo: 'fija', comisionFija: 0.185 }, { comisionTipo: 'pctMin', comision: 0.1, comisionMin: 1 }]
  const CASOS = []
  for (const modo of ['compartido', 'concentrado']) for (const com of COMS) CASOS.push({ modo, com, est })
  CASOS.push({ modo: 'concentrado', com: COMS[1], est, extra: { prioridad: 'momentum', criterioUso: 'desempate', maxPosiciones: 4 } })
  CASOS.push({ modo: 'concentrado', com: COMS[2], est, extra: { prioridad: 'momentum', criterioUso: 'filtro', maxPosiciones: 4 } })
  CASOS.push({ modo: 'concentrado', com: COMS[3], est, extra: { prioridad: 'fuerza_relativa', criterioUso: 'desempate', maxPosiciones: 2 } })
  CASOS.push({ modo: 'concentrado', com: COMS[1], est, extra: { maxPosiciones: 1 } })
  CASOS.push({ modo: 'concentrado', com: COMS[1], est: ST, extra: { prioridad: 'momentum', criterioUso: 'desempate', maxPosiciones: 4 } })
  CASOS.push({ modo: 'compartido', com: COMS[2], est: ST })
  CASOS.push({ modo: 'compartido', com: COMS[1], est, periodo: 'p1' })
  CASOS.push({ modo: 'concentrado', com: COMS[1], est, periodo: 'p2', extra: { maxPosiciones: 3 } })
  CASOS.push({ modo: 'concentrado', com: COMS[2], est, filtros: filtroMercado })
  CASOS.push({ modo: 'compartido', com: COMS[3], est, filtros: filtroMercado, simbolos: ['AAPL', 'MSFT', 'NVDA', 'TSLA'] })
  let iguales = 0, peor = 0
  for (const [k, cs] of CASOS.entries()) {
    const a = { ...Pa.AJUSTES_PLAN, ...cs.com, donde: 'lista', periodo: cs.periodo || 'todo', capital: 10000,
      lista: Li.mergeLista({ simbolos: cs.simbolos || SIMB, modo: cs.modo, filtros: cs.filtros || [], ...(cs.extra || {}) }) }
    const cuerpo = PD.peticionPorDentro({ a, estrategia: cs.est })
    const r = await E.llama(H, { ...cuerpo, conCandidatos: true })
    if (r.status !== 200) { ok(false, `caso ${k}: /api/multibacktest ${r.status} ${String(r.cuerpo).slice(0, 200)}`); continue }
    const j = JSON.parse(r.cuerpo), finalMc = j.compoundCurve[j.compoundCurve.length - 1].value
    const plan = Pl.planListaCalculable(Pa.planDe(a, cs.est)).plan
    const fechas = [...new Set(j.candidatosAzar.activos.flatMap(x => x.fechas))].sort()
    const res = Pl.ejecutaPlan(plan, { fechas, qqq: fechas.map(() => null), etf: fechas.map(() => null), spy: fechas.map(() => null), lista: j.candidatosAzar })
    const dif = Math.abs(res.valorNeto - finalMc); peor = Math.max(peor, dif)
    const bien = dif < 0.005
    if (bien) iguales++
    console.log(`${bien ? 'OK  ' : 'MAL '}   caso ${k} · ${cs.est.name} · ${cs.modo}${cs.extra ? ' ' + JSON.stringify(cs.extra) : ''} · ${Pa.textoComision(a)}${cs.filtros ? ' · filtro de mercado' : ''}${cs.periodo ? ' · ' + cs.periodo : ''}: por dentro ${finalMc.toFixed(2)} € · tu dinero ${res.valorNeto.toFixed(2)} € · ${res.estrategias.e.operaciones.length} operaciones · ${res.costes.ordenes} órdenes`)
  }
  ok(iguales === CASOS.length, `LA PRUEBA DE ORO: «Tu dinero» acaba con el mismo dinero que «La cartera por dentro» en ${iguales}/${CASOS.length} casos (la mayor diferencia, ${peor.toExponential(2)} €)`)

  // ── 4 · /api/plan y la pantalla ──
  const HP = require(R + '/pages/api/plan.js').default
  const aP = { ...Pa.AJUSTES_PLAN, comisionTipo: 'fija', comisionFija: 0.185, donde: 'lista', periodo: 'todo', capital: 10000, lista: Li.mergeLista({ simbolos: SIMB, modo: 'concentrado', maxPosiciones: 4 }) }
  const cuerpoP = PD.peticionPorDentro({ a: aP, estrategia: est }), planP = Pl.planListaCalculable(Pa.planDe(aP, est)).plan
  const rp = await E.llama(HP, { plan: planP, curvas: true, cuerpoLista: cuerpoP })
  const jp = rp.status === 200 ? JSON.parse(rp.cuerpo) : null
  ok(!!jp && Math.abs(jp.evaluacion.plan.medidas.valorNeto - jp.finalPorDentro) < 0.005 && jp.evaluacion.referencias.map(x => x.id).join() === 'QQQ,SPY,LIQUIDEZ',
    `/api/plan con lista: ${jp ? jp.evaluacion.plan.medidas.valorNeto.toFixed(2) + ' € y «por dentro» ' + jp.finalPorDentro.toFixed(2) + ' €; comparaciones ' + jp.evaluacion.referencias.map(x => x.id).join(', ') : rp.status + ' ' + String(rp.cuerpo).slice(0, 200)}`)
  const r400 = await E.llama(HP, { plan: Pa.planDe(aP, est), curvas: true, cuerpoLista: cuerpoP }), r400b = await E.llama(HP, { plan: planP, curvas: true, cuerpoLista: { ...cuerpoP, symbols: ['AAPL'] } })
  ok(r400.status === 400 && JSON.parse(r400.cuerpo).error === Pl.AVISO_LISTA_SIMPLE && r400b.status === 400 && /no corresponde/.test(JSON.parse(r400b.cuerpo).error), '/api/plan rechaza un plan con aportaciones o impuestos y una petición de lista que no es la del plan')
  // La pantalla, con /api/plan de verdad detrás.
  const D = require('./domFalso'); D.pon()
  { const Mod = require('module'), orig = Mod._load; const vacio = new Proxy({}, { get: (_, k) => k === '__esModule' ? true : () => null }); const nada = new Proxy(function () {}, { get: (_, k) => k === '__esModule' ? true : k === Symbol.toPrimitive ? () => 0 : k === 'then' ? undefined : nada, apply: () => nada, construct: () => nada })
    Mod._load = function (req, ...r) { return req === 'recharts' ? vacio : req === 'lightweight-charts' ? nada : orig.call(this, req, ...r) } }
  { const proto = Object.getPrototypeOf(globalThis.document.createElement('div')); if (!proto.querySelectorAll) { proto.querySelectorAll = () => []; proto.querySelector = () => null } }
  if (!globalThis.ResizeObserver) globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
  if (!globalThis.requestAnimationFrame) { globalThis.requestAnimationFrame = (f) => setTimeout(f, 0); globalThis.cancelAnimationFrame = (t) => clearTimeout(t) }
  const React = require(path.join(R, 'node_modules', 'react')), RDC = require(path.join(R, 'node_modules', 'react-dom', 'client'))
  const BP = require(R + '/components/BuilderPlan.js').default
  const llamadas = []
  const calcula = async (p, c) => { llamadas.push({ p, c }); const r = await E.llama(HP, { plan: p, curvas: true, cuerpoLista: c }); const j = JSON.parse(r.cuerpo); if (r.status !== 200) throw new Error(j.error); return j }
  const aPant = { ...aP, aportacion: 300, impuestos: 'ES-ahorro', ocioso: 'GLD' }
  const datosLista = { watchlist: SIMB.map(s => ({ symbol: s, name: s, list_ids: [1] })), wlLists: [{ id: 1, name: 'Degiro' }], rankingData: {} }
  const b = D.monta(React.createElement(BP, { estrategias: [est], estrategiaId: est.id, datosLista, deps: { ctx: null, calcula, calculaPorDentro: async () => { throw new Error('no') } },
    inicial: { planes: [], pestana: 'n1', simbolos: ['AAPL'], pruebas: [], resultadoPrueba: { periodos: [] }, ajustes: aPant } }), RDC)
  for (let k = 0; k < 120 && !b.raiz.conAtributo('data-cifras').length; k++) await D.espera(250)
  const txt = b.raiz.textContent
  ok(llamadas.length === 1 && JSON.stringify(llamadas[0].c) === JSON.stringify(PD.peticionPorDentro({ a: aPant, estrategia: est, wlData: {} })) && llamadas[0].p.impuestos.regimen === 'ninguno' && llamadas[0].p.piezas[0].ocioso === 'LIQUIDEZ' && llamadas[0].p.dinero.aportaciones.frecuencia === 'ninguna',
    'con «Tu dinero» abierta: una petición, con la misma petición de «La cartera por dentro» y el plan sin aportaciones, sin impuestos y con el ocioso en liquidez')
  ok(b.raiz.conAtributo('data-cifras').length === 1 && b.raiz.conAtributo('data-oro')[0]?.textContent.endsWith('✓'), `pinta el resultado y la comprobación: «${b.raiz.conAtributo('data-oro')[0]?.textContent}»`)
  ok((b.raiz.conAtributo('data-aviso-lista-simple')[0]?.textContent || '').startsWith('De momento, con una lista, se calcula sin tus aportaciones, sin impuestos y con el dinero ocioso en liquidez (no en oro): llegarán en los pasos siguientes.'),
    `la línea de lo que todavía no cuenta: «${b.raiz.conAtributo('data-aviso-lista-simple')[0]?.textContent}»`)
  ok(!b.raiz.conAtributo('data-cifra', 'ocioso').length && !txt.includes('dentro de la acción') && !txt.includes('Buy&Hold del valor') && !b.raiz.conAtributo('data-tabla', 'caidas').length && !txt.includes('¿qué hace el ocioso?') && b.raiz.conAtributo('data-tabla', 'alternativas').length === 1,
    'sin lo que todavía no sirve con una lista (en el ocioso, franja, Buy&Hold del valor, caídas frente al ocioso); con la tabla de comparaciones')
  const fin = Number((b.raiz.conAtributo('data-cifra', 'final')[0]?.textContent.match(/([\d.]+)\s*€/) || [])[1]?.replace(/\./g, ''))
  ok(fin === Math.round(jp.finalPorDentro), `«Tienes al final» ${fin} € = «La cartera por dentro» redondeado (${Math.round(jp.finalPorDentro)} €)`)
  b.quita()

  console.log(fallos ? `FALLOS: ${fallos}` : 'plan-tu-dinero-lista: todo bien')
  process.exit(fallos ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
