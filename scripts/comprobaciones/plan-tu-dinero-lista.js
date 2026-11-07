// scripts/comprobaciones/plan-tu-dinero-lista.js — «Tu dinero» con «Una lista» (fase 6 de «el plan con lista», docs/builder.md §89).
// Las corre comunes.sh. Termina en 0 si todo va bien.
// 1 · Cuentas a mano con dos valores inventados (A y B): Capital compartido y Capital concentrado, con 1 € de comisión por orden.
// 1b · Fase 7 (§91), a mano: las aportaciones y el dinero de las ventas esperan en el ocioso hasta la siguiente compra; para comprar se
//      vende del ocioso solo lo que falta; lo que sobra con una orden de más del 1 % de coste se queda en liquidez.
// 2 · Qué se puede calcular todavía (motivoListaNoCalculable) y qué se deja fuera (planListaCalculable).
// 3 · LA PRUEBA DE ORO: con la foto de precios de la lista Degiro (sin red), para muchas combinaciones de reparto, prioridad, puerta,
//     máximo de posiciones, comisión, periodo y filtros, el plan acaba con el MISMO dinero que «La cartera por dentro» (la curva
//     compuesta del Backtesting con la misma petición), al céntimo. Y §91: con comisión 0 y un ocioso de precio fijo, el plan con
//     aportaciones acaba con el mismo dinero que con el ocioso en liquidez (vender del ocioso lo justo no cambia nada).
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

  // ── 1b · Aportaciones y ocioso (§91), a mano ──
  {
    const G = ['2020-01-30', '2020-01-31', '2020-02-03', '2020-02-04']
    const act = (symbol, abre, cierra, candidatos) => ({ symbol, fechas: G, abre, cierra, candidatos })
    const O = [50, 50, 55, 60], velasO = G.map((date, k) => ({ date, open: O[k], high: O[k], low: O[k], close: O[k], volume: 0 }))
    const plan7 = (modo, { ocioso = 'O', aporta = 0 } = {}) => ({ ...planA(modo), dinero: { capitalInicial: 1000, aportaciones: aporta ? { frecuencia: 'mensual', importe: aporta } : { frecuencia: 'ninguna' }, extraordinarias: [] },
      piezas: [{ ...planA(modo).piezas[0], ocioso }], periodo: { desde: G[0], hasta: G[3] } })
    const datos7 = (modo, activos) => ({ fechas: G, qqq: G.map(() => null), etf: G.map(() => null), spy: G.map(() => null), velas: { O: velasO }, lista: { opciones: { modo, n: 2, maxPosiciones: 1, prioridad: 'alfabetico' }, activos } })
    const A1 = act('A', [10, 10, 10, 12], [10, 10, 11, 12], [{ symbol: 'A', entryDate: G[2], entryPx: 10, exitDate: G[3], exitPx: 12, pasaPuerta: true }])
    // Concentrado máx. 1, 1.000 € + 300 €/mes, ocioso O, 1 € por orden. Día 1: los 1.000 € al ocioso al cierre: 999 / 50 = 19,98. Día 3:
    // entra A; libre = 19,98 × 55 = 1.098,90 € (todo el techo): se vende todo el ocioso (1.098,90 − 1 = 1.097,90 €) y se compra A con
    // 1.097,90 € → 1.096,90 / 10 = 109,69 acciones. Llegan los 300 € (cambio de mes) y al cierre van al ocioso: 299 / 55 = 5,436… Día 4
    // (el último): sale A a 12: 109,69 × 12 − 1 = 1.315,28 €; venta final del ocioso: 299 / 55 × 60 − 1 = 325,18 €. Final 1.640,46 €, 6 órdenes.
    const r = Pl.ejecutaPlan(plan7('concentrado', { aporta: 300 }), datos7('concentrado', [A1]))
    ok(cerca(r.valorNeto, 1315.28 + 299 / 55 * 60 - 1) && r.costes.ordenes === 6 && cerca(r.costes.pagados, 6) && r.aportado === 1300,
      `aportación al ocioso a mano: 1.640,46 € con 6 órdenes y 6 € de comisiones (${r.valorNeto}, ${r.costes.ordenes}, ${r.costes.pagados})`)
    ok(cerca(r.serie[2].patrimonio, 109.69 * 11 + 299) && cerca(r.serie[0].patrimonio, 999), `al cierre: día 1, 999 € en el ocioso; día 3, 109,69 × 11 + 5,436 × 55 = 1.505,59 € (${r.serie[2].patrimonio})`)
    ok(cerca(r.estrategias.e.dentro[2], 109.69 * 11 / (109.69 * 11 + 299)) && r.estrategias.e.dentro[0] === 0, `la franja no cuenta el ocioso como dentro (${r.estrategias.e.dentro.map(x => x.toFixed(3)).join(' · ')})`)
    // La misma con 50 € de aportación: 1 € de comisión es más del 1 % de 50 €: se quedan en liquidez. Final 1.315,28 + 50 = 1.365,28 €, 4 órdenes.
    const r2 = Pl.ejecutaPlan(plan7('concentrado', { aporta: 50 }), datos7('concentrado', [A1]))
    ok(cerca(r2.valorNeto, 1365.28) && r2.costes.ordenes === 4, `50 € no se mueven al ocioso (la orden costaría el 2 %): 1.365,28 € con 4 órdenes (${r2.valorNeto}, ${r2.costes.ordenes})`)
    // Con el ocioso en liquidez y 300 €/mes: A con 1.000 € → 999 / 10 = 99,9; 99,9 × 12 − 1 = 1.197,80 € + 300 € = 1.497,80 €, 2 órdenes.
    const r3 = Pl.ejecutaPlan(plan7('concentrado', { aporta: 300, ocioso: 'LIQUIDEZ' }), datos7('concentrado', [A1]))
    ok(cerca(r3.valorNeto, 1497.8) && r3.costes.ordenes === 2, `con el ocioso en liquidez, la aportación espera en liquidez: 1.497,80 € (${r3.valorNeto})`)
    // Compartido n = 2, sin aportaciones. Día 1: 19,98 en el ocioso. Día 2: entra A; libre 999 €, mín(999 / 2, 999) = 499,50 €: se venden
    // 500,50 € del ocioso (10,01 a 50; 499,50 € tras el euro) y se compra A: 498,50 / 10 = 49,85. Quedan 9,97. Día 3: entra B; libre
    // 9,97 × 55 = 548,35 €, mín((548,35 + 499,50) / 2, 548,35) = 523,925 €: se venden 524,925 € (9,544… a 55) y B: 522,925 / 20 = 26,14625.
    // Día 4: A 49,85 × 12 − 1 = 597,20 €; B 26,14625 × 18 − 1 = 469,6325 €; ocioso (9,97 − 524,925 / 55) × 60 − 1. 8 órdenes.
    const A2 = act('A', [10, 10, 10, 12], [10, 10, 11, 12], [{ symbol: 'A', entryDate: G[1], entryPx: 10, exitDate: G[3], exitPx: 12, pasaPuerta: true }])
    const B2 = act('B', [20, 20, 20, 18], [20, 20, 19, 18], [{ symbol: 'B', entryDate: G[2], entryPx: 20, exitDate: G[3], exitPx: 18, pasaPuerta: true }])
    const r4 = Pl.ejecutaPlan(plan7('compartido'), datos7('compartido', [A2, B2]))
    const esp4 = 597.2 + 469.6325 + (9.97 - 524.925 / 55) * 60 - 1
    ok(cerca(r4.valorNeto, esp4) && r4.costes.ordenes === 8, `compartido vendiendo del ocioso solo lo que falta: ${esp4.toFixed(4)} € con 8 órdenes (${r4.valorNeto}, ${r4.costes.ordenes})`)
    ok(r4.estrategias.e.operaciones.map(o => o.capital.toFixed(3)).join() === '499.500,523.925', `capital de cada entrada: 499,50 € y 523,925 € (${r4.estrategias.e.operaciones.map(o => o.capital).join(', ')})`)
    ok(Pl.motivoListaNoCalculable(plan7('compartido', { ocioso: 'A' })) === Pl.AVISO_LISTA_OCIOSO_EN_LISTA, 'el ocioso no puede ser un valor de la lista, y lo dice')
  }

  // ── 2 · Qué se calcula ──
  const est = E.FILAS.find(s => s.name === 'Prueba editor EMA20'); if (!est) throw new Error('falta «Prueba editor EMA20»')
  const SIMB = ['AAPL', 'AMZN', 'ASML', 'GOOGL', 'MA', 'META', 'MSFT', 'NFLX', 'NVDA', 'TSLA', 'UNH', 'V']
  const aBase = { ...Pa.AJUSTES_PLAN, donde: 'lista', periodo: 'todo', capital: 10000, lista: Li.mergeLista({ simbolos: SIMB, modo: 'compartido' }) }
  {
    const p = Pa.planDe(aBase, est)   // por defecto: 300 €/mes, impuestos de España, ocioso en liquidez
    const c = Pl.planListaCalculable(p)
    ok(JSON.stringify(c.ignorado) === '["impuestos"]' && Pl.motivoListaNoCalculable(c.plan) === null && Pl.motivoListaNoCalculable(p) === Pl.AVISO_LISTA_SIMPLE && c.plan.dinero.aportaciones.frecuencia === 'mensual',
      `por defecto se dejan fuera solo los impuestos (${c.ignorado.join(', ')}; las aportaciones ya cuentan), y así sí se calcula`)
    const c2 = Pl.planListaCalculable(Pa.planDe({ ...aBase, ocioso: 'GLD', apalancamiento: 2 }, est))
    ok(JSON.stringify(c2.ignorado) === '["impuestos","apalancamiento"]' && c2.plan.piezas[0].ocioso === 'GLD' && c2.plan.piezas[0].apalancamiento === 1, 'con oro y ×2: el oro se queda; el apalancamiento, todavía no')
    ok(Pl.motivoListaNoCalculable(Pl.planListaCalculable(Pa.planDe({ ...aBase, lista: { ...aBase.lista, modo: 'slots' } }, est)).plan) === Pl.AVISO_LISTA_MODO
      && Pl.motivoListaNoCalculable(Pl.planListaCalculable(Pa.planDe({ ...aBase, lista: { ...aBase.lista, universo: 'ndx_vol_10', modo: 'concentrado' } }, est)).plan) === Pl.AVISO_LISTA_UNIVERSO,
      'con «Slots iguales» o el Nasdaq-100: todavía no, y lo dice')
    ok(Pl.planListaCalculable(Pa.planDe({ ...aBase, donde: 'accion' }, est)).ignorado.length === 0 && Pl.motivoListaNoCalculable(Pa.planDe({ ...aBase, donde: 'accion' }, est)) === null, 'con «Una acción», nada cambia')
  }

  // ── 3 · La prueba de oro ──
  const foto = require(path.join(E.DATOS, 'foto_degiro.json'))
  foto.QQQ = foto.AAPL; foto.SPY = foto.MSFT; foto.GLD = foto.MA   // GLD no está en la foto: las velas de MA con su nombre (para el ocioso)
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
    const a = { ...Pa.AJUSTES_PLAN, ...cs.com, donde: 'lista', periodo: cs.periodo || 'todo', capital: 10000, aportacion: 0,
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
  // §91: con comisión 0, un ocioso de precio fijo es como la liquidez: el plan con 300 €/mes acaba igual con los dos.
  for (const [k, cs] of [{ modo: 'compartido' }, { modo: 'concentrado', extra: { maxPosiciones: 4 } }, { modo: 'concentrado', extra: { prioridad: 'momentum', maxPosiciones: 2 } }].entries()) {
    const a = { ...Pa.AJUSTES_PLAN, comisionTipo: 'pct', comision: 0, donde: 'lista', periodo: 'todo', capital: 10000, aportacion: 300, lista: Li.mergeLista({ simbolos: SIMB, modo: cs.modo, ...(cs.extra || {}) }) }
    const r = await E.llama(H, { ...PD.peticionPorDentro({ a, estrategia: est }), conCandidatos: true }), j = JSON.parse(r.cuerpo)
    const fechas = [...new Set(j.candidatosAzar.activos.flatMap(x => x.fechas))].sort()
    const datos = { fechas, qqq: fechas.map(() => null), etf: fechas.map(() => null), spy: fechas.map(() => null), lista: j.candidatosAzar, velas: { FIJO: fechas.map(date => ({ date, open: 100, high: 100, low: 100, close: 100, volume: 0 })) } }
    const base = Pl.planListaCalculable(Pa.planDe(a, est)).plan
    const rl = Pl.ejecutaPlan(base, datos), rf = Pl.ejecutaPlan({ ...base, piezas: base.piezas.map(x => ({ ...x, ocioso: 'FIJO' })) }, datos)
    ok(Math.abs(rl.valorNeto - rf.valorNeto) < 1e-6 && rl.aportado > 10000 && rl.estrategias.e.operaciones.length === rf.estrategias.e.operaciones.length,
      `ocioso fijo ${k} · ${cs.modo}: con liquidez ${rl.valorNeto.toFixed(2)} € · con ocioso fijo ${rf.valorNeto.toFixed(2)} € · aportado ${rl.aportado} € · ${rl.estrategias.e.operaciones.length} operaciones`)
  }
  ok(iguales === CASOS.length, `LA PRUEBA DE ORO: «Tu dinero» acaba con el mismo dinero que «La cartera por dentro» en ${iguales}/${CASOS.length} casos (la mayor diferencia, ${peor.toExponential(2)} €)`)

  // ── 4 · /api/plan y la pantalla ──
  const HP = require(R + '/pages/api/plan.js').default
  const aP = { ...Pa.AJUSTES_PLAN, comisionTipo: 'fija', comisionFija: 0.185, donde: 'lista', periodo: 'todo', capital: 10000, aportacion: 0, lista: Li.mergeLista({ simbolos: SIMB, modo: 'concentrado', maxPosiciones: 4 }) }
  const cuerpoP = PD.peticionPorDentro({ a: aP, estrategia: est }), planP = Pl.planListaCalculable(Pa.planDe(aP, est)).plan
  const rp = await E.llama(HP, { plan: planP, curvas: true, cuerpoLista: cuerpoP })
  const jp = rp.status === 200 ? JSON.parse(rp.cuerpo) : null
  ok(!!jp && Math.abs(jp.evaluacion.plan.medidas.valorNeto - jp.finalPorDentro) < 0.005 && jp.evaluacion.referencias.map(x => x.id).join() === 'QQQ,SPY,LIQUIDEZ',
    `/api/plan con lista: ${jp ? jp.evaluacion.plan.medidas.valorNeto.toFixed(2) + ' € y «por dentro» ' + jp.finalPorDentro.toFixed(2) + ' €; comparaciones ' + jp.evaluacion.referencias.map(x => x.id).join(', ') : rp.status + ' ' + String(rp.cuerpo).slice(0, 200)}`)
  const r400 = await E.llama(HP, { plan: Pa.planDe(aP, est), curvas: true, cuerpoLista: cuerpoP }), r400b = await E.llama(HP, { plan: planP, curvas: true, cuerpoLista: { ...cuerpoP, symbols: ['AAPL'] } })
  ok(r400.status === 400 && JSON.parse(r400.cuerpo).error === Pl.AVISO_LISTA_SIMPLE && r400b.status === 400 && /no corresponde/.test(JSON.parse(r400b.cuerpo).error), '/api/plan rechaza un plan con impuestos y una petición de lista que no es la del plan')
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
  const aPant = { ...aP, aportacion: 300, impuestos: 'ES-ahorro', ocioso: 'GLD' }   // §91: con aportaciones y oro (GLD = las velas de MA, solo para probar)
  const datosLista = { watchlist: SIMB.map(s => ({ symbol: s, name: s, list_ids: [1] })), wlLists: [{ id: 1, name: 'Degiro' }], rankingData: {} }
  const b = D.monta(React.createElement(BP, { estrategias: [est], estrategiaId: est.id, datosLista, deps: { ctx: null, calcula, calculaPorDentro: async () => { throw new Error('no') } },
    inicial: { planes: [], pestana: 'n1', simbolos: ['AAPL'], pruebas: [], resultadoPrueba: { periodos: [] }, ajustes: aPant } }), RDC)
  for (let k = 0; k < 120 && !b.raiz.conAtributo('data-cifras').length; k++) await D.espera(250)
  const txt = b.raiz.textContent
  ok(llamadas.length === 1 && JSON.stringify(llamadas[0].c) === JSON.stringify(PD.peticionPorDentro({ a: aPant, estrategia: est, wlData: {} })) && llamadas[0].p.impuestos.regimen === 'ninguno' && llamadas[0].p.piezas[0].ocioso === 'GLD' && llamadas[0].p.dinero.aportaciones.frecuencia === 'mensual' && llamadas[0].p.dinero.aportaciones.importe === 300,
    'con «Tu dinero» abierta: una petición, con la misma petición de «La cartera por dentro» y el plan con 300 €/mes y el ocioso en oro, sin impuestos')
  ok(b.raiz.conAtributo('data-cifras').length === 1 && !b.raiz.conAtributo('data-oro').length, 'pinta el resultado; sin la línea «Comprobación» (con aportaciones no tiene que coincidir con «La cartera por dentro»)')
  ok(!txt.includes('Si llega una aportación con la operación abierta'), 'con lista no sale «Si llega una aportación con la operación abierta» (siempre espera en el ocioso)')
  ok((b.raiz.conAtributo('data-aviso-lista-simple')[0]?.textContent || '').startsWith('De momento, con una lista, se calcula sin impuestos: llegarán en los pasos siguientes.'),
    `la línea de lo que todavía no cuenta: «${b.raiz.conAtributo('data-aviso-lista-simple')[0]?.textContent}»`)
  ok(!b.raiz.conAtributo('data-cifra', 'ocioso').length && !txt.includes('dentro de la acción') && !txt.includes('Buy&Hold del valor') && !b.raiz.conAtributo('data-tabla', 'caidas').length && !txt.includes('¿qué hace el ocioso?') && b.raiz.conAtributo('data-tabla', 'alternativas').length === 1,
    'sin lo que todavía no sirve con una lista (en el ocioso, franja, Buy&Hold del valor, caídas frente al ocioso); con la tabla de comparaciones')
  const fin = Number((b.raiz.conAtributo('data-cifra', 'final')[0]?.textContent.match(/([\d.]+)\s*€/) || [])[1]?.replace(/\./g, ''))
  const rp7 = await E.llama(HP, { plan: llamadas[0].p, curvas: true, cuerpoLista: llamadas[0].c }), m7 = JSON.parse(rp7.cuerpo).evaluacion.plan
  ok(fin === Math.round(m7.medidas.valorNeto) && m7.ejecucion.aportado > 10000, `«Tienes al final» ${fin} € = el de /api/plan con 300 €/mes y oro (${m7.medidas.valorNeto.toFixed(2)} €, aportado ${m7.ejecucion.aportado} €, ${m7.ejecucion.costes.ordenes} órdenes)`)
  b.quita()

  console.log(fallos ? `FALLOS: ${fallos}` : 'plan-tu-dinero-lista: todo bien')
  process.exit(fallos ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
