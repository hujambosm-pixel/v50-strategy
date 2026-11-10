// scripts/comprobaciones/plan-por-dentro.js — «La cartera por dentro» del plan (fase 4 de «el plan con lista», docs/builder.md §84).
// Las corre comunes.sh. Termina en 0 si todo va bien.
// 1 · La petición del plan (peticionPorDentro) es la que haría el Backtesting con los mismos ajustes: el código de runBacktesting de
//     antes (copiado literal en peticion-mc.js) con los valores de partida del panel, la lista del bloque, el periodo y el dinero
//     inicial del plan y SUS comisiones (fase 5, §86: % con mínimo por orden, escritas a mano). 400 listas al azar, JSON idéntico. Y los
//     motivos para no calcular. 1b · El mínimo por orden de lib/comisiones.js, con cuentas hechas a mano.
// 2 · Con la foto de precios de la lista Degiro (datos/, sin red) y una estrategia de tarjetas, /api/multibacktest responde a esa
//     petición, y la pestaña (montada con estado en domFalso.js) pinta los paneles del Backtesting con ese resultado.
// 1c · §111: con el Nasdaq-100, la petición es la del universo dinámico de runBacktesting (copiado literal abajo, antesUniverso), con un
//     universo de prueba (filas y miembros escritos aquí); y los motivos (leyendo la base, error, periodo antes de 2016).
// 3 · En el paso 3: con «Una lista» salen las pestañas «Tu dinero» / «La cartera por dentro»; «por dentro» no se calcula hasta abrirla (§89: «Tu dinero», sí);
//     abierta, una petición ~1 s después; cerrada, los cambios no piden nada; al volver, la petición nueva.
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://arnes.invalid'; process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'clave-falsa-del-arnes'
const path = require('path')
const C0 = require('./cargador'), R = C0.RAIZ, D = require('./domFalso')
const E = require('./entorno')
let fallos = 0
const ok = (c, t) => { console.log(`${c ? 'OK  ' : 'MAL '} ${t}`); if (!c) fallos++ }

// El código de runBacktesting de antes («Single mode run»), literal, con los nombres del estado de pages/index.js.
function antes(st) {
  const {mcMode,mcSelected,mcWeights,emaR,emaL,_mcYears,mcCapitalIni,_mcFrom,_mcTo,tipoStop,atrP,atrM,sinPerdidas,reentry,tipoFiltro,sp500EmaR,sp500EmaL,mcCapital,
    mcRiskPerTrade,mcMaxPortfolioPct,mcMaxAccumRisk,mcAssumedStopPct,mcMaxPosiciones,mcPrioridad,mcCriterioUso,mcMomentumN,mcRsWindow,mcRsGateThr,mcMomGateThr,mcProxGateThr,mcCalculoPrioridad,
    _activosMc,wlData,modesToRun,stratIds,isNoStrategy,filtrosBackend,mcIntervalo,mcComisiones,_prueba} = st
    const weightsNorm={}
    if(mcMode==='custom'){
      const total=mcSelected.reduce((s,sym)=>s+(Number(mcWeights[sym])||0),0)
      mcSelected.forEach(sym=>{weightsNorm[sym]=total>0?(Number(mcWeights[sym])||0)/total*100:100/mcSelected.length})
    }
    const baseCfg={emaR:Number(emaR),emaL:Number(emaL),years:_mcYears,capitalIni:mcCapitalIni,
      fromDate:_mcFrom,toDate:_mcTo,
      tipoStop,atrPeriod:Number(atrP),atrMult:Number(atrM),sinPerdidas,reentry,
      tipoFiltro,sp500EmaR:Number(sp500EmaR),sp500EmaL:Number(sp500EmaL),tipoCapital:mcCapital,
      sizeRules:{riskPerTrade:mcRiskPerTrade,maxPortfolioPct:mcMaxPortfolioPct,maxAccumRisk:mcMaxAccumRisk,assumedStopPct:mcAssumedStopPct,maxPosiciones:mcMaxPosiciones,prioridad:mcPrioridad,criterioUso:mcCriterioUso,momentumN:Number(mcMomentumN),rsWindow:Number(mcRsWindow),rsGateThr:Number(mcRsGateThr),momGateThr:Number(mcMomGateThr),proxGateThr:Number(mcProxGateThr),
        ...(mcCalculoPrioridad===1?{calculoPrioridad:1}:{}),
        scoreMap:Object.fromEntries(_activosMc.map(sym=>[sym,wlData[sym.toUpperCase()]?.active?.scoreMetricas??null]))}}
          const _cuerpoMc={symbols:mcSelected,modoAsig:modesToRun[0],weights:weightsNorm,cfg:baseCfg,strategyId:stratIds[0]||null,isNoStrategy,filtros:filtrosBackend,intervalo:mcIntervalo,comisiones:mcComisiones,..._prueba}
  return _cuerpoMc
}

// El cuerpo del universo dinámico de runBacktesting (pages/index.js), literal, con los nombres de allí.
function antesUniverso({ _estU, baseCfg, stratIds, _strat1, filtrosBackend, mcIntervalo, mcComisiones, _prueba, mcUniverso, _nUniv, reglaDeUniverso }) {
        const u=_estU.universo
        const _cuerpoMc={symbols:u.simbolos,modoAsig:'concentrado',weights:{},cfg:baseCfg,strategyId:stratIds[0],isNoStrategy:(_strat1?.name||'').includes('No Strategy'),filtros:filtrosBackend,intervalo:mcIntervalo,comisiones:mcComisiones,..._prueba,
          universo:{regla:reglaDeUniverso(mcUniverso),n:_nUniv,mascara:u.mascara,elegidos:u.elegidos}}
  return _cuerpoMc
}
// Un universo de prueba: los 12 de Degiro, miembros desde 2000; cada año, N elegidos que van rotando.
function universoPrueba(SIMB, regla, n) {
  const miembros = SIMB.map(s => ({ simbolo: s, simbolo_yahoo: s, nombre: s, desde: '2000-01-01', hasta: null, excluido_motivo: null }))
  const filas = []
  for (let anio = 2016; anio <= 2026; anio++) for (let k = 0; k < n; k++) filas.push({ regla, n, anio, simbolo_yahoo: SIMB[(anio + k) % SIMB.length], posicion: k + 1, volatilidad: 50 - k })
  return { filas, miembros }
}

;(async () => {
  D.pon(); await C0.prepara(); C0.registra(R)
  // El DOM falso no tiene ResizeObserver (el autoajuste del alto lo usa, como en el Backtesting): uno que no hace nada.
  // Ni dibuja gráficos: recharts y lightweight-charts necesitan un DOM de verdad. Aquí se cambia por piezas vacías (solo en esta comprobación).
  { const Mod = require('module'), orig = Mod._load; const vacio = new Proxy({}, { get: (_, k) => k === '__esModule' ? true : () => null }); const nada = new Proxy(function () {}, { get: (_, k) => k === '__esModule' ? true : k === Symbol.toPrimitive ? () => 0 : k === 'then' ? undefined : nada, apply: () => nada, construct: () => nada })
    Mod._load = function (req, ...r) { return req === 'recharts' ? vacio : req === 'lightweight-charts' ? nada : orig.call(this, req, ...r) } }
  { const proto = Object.getPrototypeOf(globalThis.document.createElement('div')); if (!proto.querySelectorAll) { proto.querySelectorAll = () => []; proto.querySelector = () => null } }
  if (!globalThis.ResizeObserver) globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
  if (!globalThis.requestAnimationFrame) { globalThis.requestAnimationFrame = (f) => setTimeout(f, 0); globalThis.cancelAnimationFrame = (t) => clearTimeout(t) }
  const PD = require(R + '/components/backtesting/PlanPorDentro.js'), Li = require(R + '/lib/planes/lista.js'), Pa = require(R + '/lib/builder/planPantalla.js')
  const EMA20 = E.FILAS.find(s => s.name === 'Prueba editor EMA20'); if (!EMA20) throw new Error('falta «Prueba editor EMA20» en la copia de backups/')
  const est = { ...EMA20 }

  // ── 1 · La petición ──
  let semilla = 7310; const az = () => (semilla = (semilla * 16807) % 2147483647) / 2147483647, uno = (xs) => xs[Math.floor(az() * xs.length)]
  const SIMB = ['AAPL', 'AMZN', 'ASML', 'GOOGL', 'MA', 'META', 'MSFT', 'NFLX', 'NVDA', 'TSLA', 'UNH', 'V']
  const FILTROS = [[], [{ id: 'indiceEma@mercado', tipo: 'indiceEma', ambito: 'mercado', activo: true, params: { ticker: '^GSPC', periodo: 200, intervalo: 'diario' } }]]
  let iguales = 0
  for (let i = 0; i < 400; i++) {
    const sim = SIMB.filter(() => az() < 0.6); if (!sim.length) sim.push('AAPL')
    const lista = Li.mergeLista({ simbolos: sim, modo: uno(['slots', 'compartido', 'concentrado', 'positionsizing']), maxPosiciones: uno([1, 4, 7]), prioridad: uno(['alfabetico', 'momentum', 'fuerza_relativa']),
      criterioUso: uno(['desempate', 'filtro']), momentumN: uno([20, 60]), rsWindow: uno([63, 126]), calculoPrioridad: uno([1, 2]), riskPerTrade: uno([1, 5]), filtros: uno(FILTROS) })
    // La comisión del plan, de sus cuatro formas, y lo que debe llegar al motor (escrito a mano: fijas 0, % y mínimo por orden).
    const [com, comEsperada] = uno([[{ comisionTipo: 'pct', comision: 0 }, { compra: 0, venta: 0, porcentaje: 0 }], [{ comisionTipo: 'pct', comision: 0.1 }, { compra: 0, venta: 0, porcentaje: 0.1 }],
      [{ comisionTipo: 'fija', comisionFija: 2 }, { compra: 0, venta: 0, porcentaje: 0, minimo: 2 }], [{ comisionTipo: 'pctMin', comision: 0.25, comisionMin: 1.5 }, { compra: 0, venta: 0, porcentaje: 0.25, minimo: 1.5 }]])
    const a = { ...Pa.AJUSTES_PLAN, ...com, donde: 'lista', lista, capital: uno([10000, 2500, 50000]), periodo: uno(['todo', 'p1', 'p2']) }
    const wl = Object.fromEntries(SIMB.filter(() => az() < 0.5).map(s => [s, { active: { scoreMetricas: Math.round(az() * 100) } }]))
    const per = Pa.fechasDe(a), l = Li.mergeLista(a.lista), P = PD.PANEL_DEFECTO
    const ref = antes({ mcMode: l.modo, mcSelected: l.simbolos, mcWeights: l.pesos, emaR: P.emaR, emaL: P.emaL, _mcYears: null, mcCapitalIni: a.capital, _mcFrom: per.desde, _mcTo: per.hasta,
      tipoStop: P.tipoStop, atrP: P.atrP, atrM: P.atrM, sinPerdidas: P.sinPerdidas, reentry: P.reentry, tipoFiltro: P.tipoFiltro, sp500EmaR: P.sp500EmaR, sp500EmaL: P.sp500EmaL, mcCapital: P.mcCapital,
      mcRiskPerTrade: l.riskPerTrade, mcMaxPortfolioPct: l.maxPortfolioPct, mcMaxAccumRisk: l.maxAccumRisk, mcAssumedStopPct: l.assumedStopPct, mcMaxPosiciones: l.maxPosiciones, mcPrioridad: l.prioridad,
      mcCriterioUso: l.criterioUso, mcMomentumN: l.momentumN, mcRsWindow: l.rsWindow, mcRsGateThr: l.rsGateThr, mcMomGateThr: l.momGateThr, mcProxGateThr: l.proxGateThr, mcCalculoPrioridad: l.calculoPrioridad,
      _activosMc: l.simbolos, wlData: wl, modesToRun: [l.modo], stratIds: [est.id], isNoStrategy: false, filtrosBackend: l.filtros, mcIntervalo: 'diario', mcComisiones: comEsperada, _prueba: {} })
    if (JSON.stringify(ref) === JSON.stringify(PD.peticionPorDentro({ a, estrategia: est, wlData: wl }))) iguales++
  }
  ok(iguales === 400, `la petición del plan es la del Backtesting con los mismos ajustes y las comisiones del plan (${iguales}/400 listas al azar)`)
  const aBase = { ...Pa.AJUSTES_PLAN, donde: 'lista', periodo: 'todo', capital: 10000, lista: Li.mergeLista({ simbolos: SIMB, modo: 'compartido' }) }
  ok(PD.peticionPorDentro({ a: { ...aBase, lista: { ...aBase.lista, simbolos: [] } }, estrategia: est }) === null && PD.motivoSinPeticion({ a: { ...aBase, lista: { ...aBase.lista, simbolos: [] } }, estrategia: est }) === 'Elige al menos un valor de la lista.', 'sin valores: no pide nada y lo dice')
  // ── 1c · §111: el Nasdaq-100 ──
  { const UM = require(R + '/lib/universoMc.js'); let igualesU = 0, casosU = 0
    for (const univ of ['ndx_vol_10', 'ndx_mom_20', 'ndx_vol_30']) for (const periodo of ['todo', 'p1', 'p2']) for (const filtros of FILTROS) {
      const n = UM.nDeUniverso(univ), datosU = universoPrueba(SIMB, UM.reglaDeUniverso(univ), Math.min(n, 5))
      const a = { ...Pa.AJUSTES_PLAN, donde: 'lista', periodo, capital: 10000, lista: Li.mergeLista({ universo: univ, modo: 'concentrado', simbolos: ['AAPL'], maxPosiciones: 4, prioridad: 'momentum', filtros }) }
      const per = Pa.fechasDe(a), l = Li.mergeLista(a.lista), P = PD.PANEL_DEFECTO
      const _estU = UM.estadoUniversoMc({ universo: univ, datos: datosU, fromDate: per.desde, toDate: per.hasta, estrategias: [est.id] })
      const _activosMc = _estU.universo.simbolos
      const ref = antes({ mcMode: l.modo, mcSelected: l.simbolos, mcWeights: l.pesos, emaR: P.emaR, emaL: P.emaL, _mcYears: null, mcCapitalIni: a.capital, _mcFrom: per.desde, _mcTo: per.hasta,
        tipoStop: P.tipoStop, atrP: P.atrP, atrM: P.atrM, sinPerdidas: P.sinPerdidas, reentry: P.reentry, tipoFiltro: P.tipoFiltro, sp500EmaR: P.sp500EmaR, sp500EmaL: P.sp500EmaL, mcCapital: P.mcCapital,
        mcRiskPerTrade: l.riskPerTrade, mcMaxPortfolioPct: l.maxPortfolioPct, mcMaxAccumRisk: l.maxAccumRisk, mcAssumedStopPct: l.assumedStopPct, mcMaxPosiciones: l.maxPosiciones, mcPrioridad: l.prioridad,
        mcCriterioUso: l.criterioUso, mcMomentumN: l.momentumN, mcRsWindow: l.rsWindow, mcRsGateThr: l.rsGateThr, mcMomGateThr: l.momGateThr, mcProxGateThr: l.proxGateThr, mcCalculoPrioridad: l.calculoPrioridad,
        _activosMc, wlData: {}, modesToRun: [l.modo], stratIds: [est.id], isNoStrategy: false, filtrosBackend: l.filtros, mcIntervalo: 'diario', mcComisiones: { compra: 0, venta: 0, porcentaje: 0.1 }, _prueba: {} })
      const refU = antesUniverso({ _estU, baseCfg: ref.cfg, stratIds: [est.id], _strat1: est, filtrosBackend: l.filtros, mcIntervalo: 'diario', mcComisiones: { compra: 0, venta: 0, porcentaje: 0.1 }, _prueba: {}, mcUniverso: univ, _nUniv: n, reglaDeUniverso: UM.reglaDeUniverso })
      casosU++
      if (JSON.stringify(refU) === JSON.stringify(PD.peticionPorDentro({ a, estrategia: est, wlData: {}, universoDatos: { [univ]: datosU } }))) igualesU++
    }
    ok(igualesU === casosU && casosU === 18, `con el Nasdaq-100, la petición del plan es la del Backtesting con universo dinámico (${igualesU}/${casosU}: 3 universos × 3 periodos × con y sin filtro)`)
    const aU = { ...aBase, lista: Li.mergeLista({ universo: 'ndx_vol_10', modo: 'concentrado' }) }, dU = universoPrueba(SIMB, 'volatilidad', 5)
    const cU = PD.peticionPorDentro({ a: aU, estrategia: est, universoDatos: { ndx_vol_10: dU } })
    ok(!!cU && cU.modoAsig === 'concentrado' && cU.universo.regla === 'volatilidad' && cU.universo.n === 10 && cU.symbols.length === 12 && Object.keys(cU.universo.elegidos).join() === '2016,2017,2018,2019,2020,2021,2022,2023,2024,2025',
      `con el Nasdaq-100 los valores son los del universo, no los marcados (${cU?.symbols.length}), y van los elegidos de cada año del periodo (${Object.keys(cU?.universo.elegidos || {}).join(', ')})`)
    ok(PD.peticionPorDentro({ a: aU, estrategia: est }) === null && PD.motivoSinPeticion({ a: aU, estrategia: est }) === 'Leyendo de la base el universo (Nasdaq-100 · 10 más volátiles)…', 'sin lo de la base aún: no pide nada y dice que lo está leyendo')
    ok(PD.motivoSinPeticion({ a: aU, estrategia: est, universoDatos: { ndx_vol_10: { error: 'No se pudo leer el universo de la base de datos.' } } }) === 'No se pudo leer el universo de la base de datos.', 'si la base falla, su error')
    const aEns = { ...aU, periodo: 'otras', desde: '2012-01-01', hasta: '2015-12-31' }
    ok(PD.peticionPorDentro({ a: aEns, estrategia: est, universoDatos: { ndx_vol_10: dU } }) === null && PD.motivoSinPeticion({ a: aEns, estrategia: est, universoDatos: { ndx_vol_10: dU } }) === 'Con el Nasdaq-100 no se calcula: el universo empieza el 01/01/2016.',
      `con un periodo antes de 2016 (2012–2015): no pide nada y lo dice («${PD.motivoSinPeticion({ a: aEns, estrategia: est, universoDatos: { ndx_vol_10: dU } })}»)`) }
  ok(PD.peticionPorDentro({ a: { ...aBase, capital: 0 }, estrategia: est }) === null && PD.peticionPorDentro({ a: aBase, estrategia: null }) === null && PD.peticionPorDentro({ a: { ...aBase, donde: 'accion' }, estrategia: est }) === null, 'sin dinero inicial, sin estrategia o con «Una acción»: no pide nada')
  const c0 = PD.peticionPorDentro({ a: aBase, estrategia: est })
  ok(c0.cfg.capitalIni === 10000 && c0.cfg.fromDate === '2016-01-01' && c0.cfg.toDate === '2025-12-31' && c0.cfg.years === null && c0.intervalo === 'diario' && JSON.stringify(c0.comisiones) === JSON.stringify({ compra: 0, venta: 0, porcentaje: 0.1 }),
    `dinero inicial, periodo del plan (${c0.cfg.fromDate} → ${c0.cfg.toDate}), velas diarias y la comisión del plan por defecto (0,1 %): ${JSON.stringify(c0.comisiones)}`)

  // ── 1b · El mínimo por orden (cuentas a mano) ──
  const Co = require(R + '/lib/comisiones.js'), cerca = (x, y) => Math.abs(x - y) < 1e-9
  const m01 = { porcentaje: 0.1, minimo: 1 }
  ok(cerca(Co.comisionDe({ importeCompra: 500 }, m01).compra, 1) && cerca(Co.comisionDe({ importeCompra: 5000 }, m01).compra, 5) && cerca(Co.comisionDe({ importeVenta: 999 }, m01).venta, 1), '0,1 % con mínimo de 1 €: 500 € pagan 1 €, 5.000 € pagan 5 €, una venta de 999 € paga 1 €')
  { const n = Co.netoDeOperacion(1000, 10, { porcentaje: 0.1, minimo: 2 }); ok(cerca(n.comisionTotal, 4) && cerca(n.capitalInvertido, 998) && cerca(n.capitalFinal, 1095.8), `1.000 € que suben un 10 % con 0,1 % y mínimo 2 €: compra 2 €, 998 € dentro, salen 1.097,80 €, venta 2 € → 1.095,80 € (${n.capitalFinal})`) }
  { const n = Co.netoDeOperacion(10000, 10, { porcentaje: 0.1, minimo: 2 }); ok(cerca(n.comisionTotal, 20.989) && cerca(n.capitalFinal, 10978.011), `10.000 € que suben un 10 %: compra 10 €, 9.990 € dentro, salen 10.989 €, venta 10,989 € → 10.978,011 € (${n.capitalFinal})`) }
  ok(!Co.sinComisiones({ minimo: 2 }) && Co.sinComisiones({ compra: 0, venta: 0, porcentaje: 0 }), 'solo un mínimo ya es «con comisiones»; todo a 0, sin')
  ok(JSON.stringify(Co.normalizaComisiones({ compra: 0.36, venta: 0, porcentaje: 0 })) === '{"compra":0.36,"venta":0,"porcentaje":0}' && JSON.stringify(Co.normalizaComisiones({ compra: 0.36, minimo: 0 })) === '{"compra":0.36,"venta":0,"porcentaje":0}', 'sin mínimo, las comisiones del Backtesting quedan como antes (tres campos)')
  ok(Co.comisionesDePlan(null) === Co.COMISIONES_CERO && JSON.stringify(Co.comisionesDePlan({ comisionPct: 0, comisionMinEur: 2 })) === '{"compra":0,"venta":0,"porcentaje":0,"minimo":2}', 'las comisiones de un plan: sin costes, ninguna; «2 € fijos» = mínimo de 2 € sin %')

  // ── 2 · El motor y la pestaña ──
  const foto = require(path.join(E.DATOS, 'foto_degiro.json'))
  E.estado.foto = foto; E.estado.enCurso = false
  for (const s of Object.keys(foto)) E.llenaCache(s, { desde: '2006-01-01' })
  const simbolosFoto = Object.keys(foto).filter(s => s !== '^GSPC')
  const H = require(R + '/pages/api/multibacktest.js').default
  { const orig = globalThis.fetch; globalThis.fetch = async (url, o) => { const m = String(url).match(/\/rest\/v1\/strategies\?id=eq\.([^&]+)/); if (m) { const s = E.ESTRATEGIAS.get(m[1]); const filas = s ? [{ code_js: s.code_js, params: s.params, name: s.name, definition: s.definition ?? null }] : []; return { ok: true, status: 200, json: async () => filas, text: async () => JSON.stringify(filas) } } return orig(url, o) } }
  const aFoto = { ...aBase, periodo: 'otras', desde: '2016-01-01', hasta: '2025-12-31', lista: Li.mergeLista({ simbolos: simbolosFoto, modo: 'compartido' }) }
  const cuerpo = PD.peticionPorDentro({ a: aFoto, estrategia: est })
  const r = await E.llama(H, cuerpo)
  const j = r.status === 200 ? JSON.parse(r.cuerpo) : null
  ok(!!j && Array.isArray(j.compoundCurve) && j.compoundCurve.length > 100 && (j.allTrades || []).length > 0, `/api/multibacktest responde a la petición del plan (${r.status}; ${j ? j.allTrades.length + ' operaciones, final ' + j.compoundCurve[j.compoundCurve.length - 1].value.toFixed(2) + ' €' : String(r.cuerpo).slice(0, 200)})`)
  const React = require(path.join(R, 'node_modules', 'react')), RDC = require(path.join(R, 'node_modules', 'react-dom', 'client'))
  let pedidas = []
  const calcula = async (c) => { pedidas.push(c); return JSON.parse(r.cuerpo) }
  const m = D.monta(React.createElement(PD.default, { a: aFoto, estrategia: est, estrategias: [est], visible: true, calcula, version: 'V-prueba' }), RDC)
  await D.espera(300)
  ok(pedidas.length === 0 && m.raiz.conAtributo('data-calculando-por-dentro').length === 1, 'abierta: «Calculando…» y aún sin pedir (espera ~1 s)')
  await D.espera(1100)
  ok(pedidas.length === 1 && JSON.stringify(pedidas[0]) === JSON.stringify(cuerpo), 'a ~1 s, una petición: la del plan')
  const caja = m.raiz.conAtributo('data-cartera-por-dentro')
  ok(caja.length === 1 && caja[0].textContent.includes('📊 Multicartera') && caja[0].textContent.includes('Capital compartido'), 'pinta los paneles del Backtesting («📊 Multicartera», «Capital compartido»)')
  ok(m.raiz.conAtributo('data-linea-por-dentro')[0]?.textContent.includes('con las comisiones del plan (0,10 % por operación; «Comprar y mantener», sin comisión)'), `la línea dice con qué se calcula y con qué comisiones: «${m.raiz.conAtributo('data-linea-por-dentro')[0]?.textContent}»`)
  m.quita()
  { const m0 = D.monta(React.createElement(PD.default, { a: { ...aFoto, comision: 0 }, estrategia: est, estrategias: [est], visible: true, calcula: async () => JSON.parse(r.cuerpo) }), RDC); await D.espera(30)
    ok((m0.raiz.conAtributo('data-linea-por-dentro')[0]?.textContent || '').includes('sin comisiones (el plan no tiene)'), 'un plan sin comisión: la línea dice «sin comisiones (el plan no tiene)»')
    m0.quita() }
  // Con 0,1 % y mínimo de 1 €, cada operación paga a mano max(0,1 % de lo que entra, 1 €) + max(0,1 % de lo que sale, 1 €).
  { const aMin = { ...aFoto, comisionTipo: 'pctMin', comision: 0.1, comisionMin: 1 }, rm = await E.llama(H, PD.peticionPorDentro({ a: aMin, estrategia: est })), jm = JSON.parse(rm.cuerpo)
    let bien = 0, conMin = 0
    for (const t of jm.allTrades) { const cap = t._capitalAtEntry, cc = Math.max(cap * 0.001, 1), sale = (cap - cc) * (1 + t.pnlPct / 100), cv = Math.max(sale * 0.001, 1)
      if (Math.abs(t.comision - (cc + cv)) < 1e-6) bien++; if (cap * 0.001 < 1 || sale * 0.001 < 1) conMin++ }
    const f0 = j.compoundCurve[j.compoundCurve.length - 1].value, fm = jm.compoundCurve[jm.compoundCurve.length - 1].value
    ok(bien === jm.allTrades.length && conMin > 0 && fm < f0, `con 0,1 % y mínimo de 1 €: la comisión de las ${jm.allTrades.length} operaciones cuadra a mano (${bien}); en ${conMin} manda el mínimo; final ${fm.toFixed(2)} € < ${f0.toFixed(2)} € con 0,1 % solo`) }

  // §111: con el Nasdaq-100 (universo de prueba sobre la foto; QQQ = las velas de AAPL con su nombre), el motor responde con el universo
  // y sus dos referencias, y la pestaña pinta la línea del universo.
  { if (!foto.QQQ) { foto.QQQ = foto.AAPL; E.llenaCache('QQQ', { desde: '2006-01-01' }) }
    const dU = universoPrueba(simbolosFoto, 'volatilidad', 5), uD = { ndx_vol_10: dU }
    const aU = { ...aFoto, lista: Li.mergeLista({ universo: 'ndx_vol_10', modo: 'concentrado', maxPosiciones: 4 }) }
    const cU = PD.peticionPorDentro({ a: aU, estrategia: est, universoDatos: uD })
    const rU = await E.llama(H, cU), jU = rU.status === 200 ? JSON.parse(rU.cuerpo) : null
    ok(!!jU?.universo && jU.universo.n === 10 && jU.universo.bhUniversoCurve?.length > 1000 && jU.universo.qqqBHCurve?.length > 1000 && jU.universo.descartadasPorUniverso > 0,
      `con el Nasdaq-100, /api/multibacktest responde con el universo (${rU.status}; ${jU?.allTrades?.length} operaciones, ${jU?.universo?.descartadasPorUniverso} entradas descartadas por universo, B&H universo y B&H QQQ)`)
    const pedU = []
    const bU = D.monta(React.createElement(PD.default, { a: aU, estrategia: est, estrategias: [est], universoDatos: uD, calcula: async (c) => { pedU.push(c); return jU } }), RDC); await D.espera(1300)
    const txtU = bU.raiz.textContent || ''
    ok(pedU.length === 1 && JSON.stringify(pedU[0]) === JSON.stringify(cU) && txtU.includes('Universo: Nasdaq-100 · 10 más volátiles') && txtU.includes('B&H universo') && txtU.includes('B&H QQQ'),
      'la pestaña pide la petición del universo y pinta su línea (universo, B&H universo, B&H QQQ)')
    bU.quita() }

  // ── 3 · En el paso 3 ──
  const BP = require(R + '/components/BuilderPlan.js').default
  pedidas = []; let dineros = 0
  const datosLista = { watchlist: simbolosFoto.map(s => ({ symbol: s, name: s, list_ids: [1] })), wlLists: [{ id: 1, name: 'Degiro' }], rankingData: {} }
  const props = { estrategias: [est], estrategiaId: est.id, datosLista, deps: { ctx: null, calcula: async () => { dineros++; throw new Error('sin motor en esta comprobación') }, calculaPorDentro: calcula },
    inicial: { planes: [], pestana: 'n1', simbolos: ['AAPL'], pruebas: [], resultadoPrueba: { periodos: [] }, ajustes: aFoto } }
  const b = D.monta(React.createElement(BP, props), RDC); await D.espera(1300)
  const pest = (id) => b.raiz.busca(n => n.nodeName === 'BUTTON' && n.getAttribute?.('data-vista-der') === id)
  ok(!!pest('dinero') && !!pest('dentro') && pest('dinero').getAttribute('aria-pressed') === 'true', 'con lista: las pestañas «Tu dinero» (abierta) y «La cartera por dentro»')
  ok(pedidas.length === 0 && dineros === 1, `§89: con «Tu dinero» abierta se calcula «Tu dinero» (${dineros}) y no «La cartera por dentro» (${pedidas.length})`)
  D.pulsa(pest('dentro')); await D.espera(1300)
  ok(pedidas.length === 1 && b.raiz.conAtributo('data-cartera-por-dentro').length === 1 && !b.raiz.conAtributo('data-sin-motor-lista').length, 'al abrir «La cartera por dentro»: una petición y sus paneles')
  D.pulsa(pest('dinero')); await D.espera(30)
  const modo = b.raiz.busca(n => n.nodeName === 'DIV' && n.textContent === 'Slots iguales' && typeof D.propsDe(n).onClick === 'function')
  D.pulsa(modo); await D.espera(1300)
  ok(pedidas.length === 1, 'con la pestaña cerrada, cambiar el reparto no pide nada')
  D.pulsa(pest('dentro')); await D.espera(1300)
  ok(pedidas.length === 2 && pedidas[1].modoAsig === 'slots', `al volver, la petición nueva (${pedidas[1]?.modoAsig})`)
  D.pulsa(pest('dinero')); await D.espera(30); D.pulsa(pest('dentro')); await D.espera(1300)
  ok(pedidas.length === 2, 'abrirla otra vez sin cambios no repite el cálculo')
  b.quita()

  console.log(fallos ? `FALLOS: ${fallos}` : 'plan-por-dentro: todo bien')
  process.exit(fallos ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
