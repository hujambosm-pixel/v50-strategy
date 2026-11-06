// scripts/comprobaciones/peticion-mc.js — lib/peticionMc.js (docs/builder.md §83) arma la petición a /api/multibacktest IGUAL que el
// código de runBacktesting de antes (pages/index.js, hasta V9.1143), copiado aquí TAL CUAL como referencia: en 3.000 ajustes al azar
// (modos, pesos raros o que suman 0, números tecleados como texto, calculoPrioridad 1 o 2, años o fechas, con y sin prueba de la
// Optimización) el JSON de los pesos, del cfg y del cuerpo de «una estrategia en un modo» debe ser idéntico carácter a carácter (mismas
// claves y en el mismo orden). Además, pages/index.js tiene que usar la librería en esos tres sitios.
// Uso: node scripts/comprobaciones/peticion-mc.js      Termina en 0 si todo es idéntico.
const fs = require('fs'), path = require('path')
const { prepara, registra, RAIZ } = require('./cargador')

// ── La referencia: el código de antes, literal, con los nombres del estado de pages/index.js como parámetros ──
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
  return { weightsNorm, baseCfg, _cuerpoMc }
}
// ── Lo de ahora: las mismas llamadas que hace pages/index.js ──
function ahora(L, st) {
  const {mcMode,mcSelected,mcWeights,emaR,emaL,_mcYears,mcCapitalIni,_mcFrom,_mcTo,tipoStop,atrP,atrM,sinPerdidas,reentry,tipoFiltro,sp500EmaR,sp500EmaL,mcCapital,
    mcRiskPerTrade,mcMaxPortfolioPct,mcMaxAccumRisk,mcAssumedStopPct,mcMaxPosiciones,mcPrioridad,mcCriterioUso,mcMomentumN,mcRsWindow,mcRsGateThr,mcMomGateThr,mcProxGateThr,mcCalculoPrioridad,
    _activosMc,wlData,modesToRun,stratIds,isNoStrategy,filtrosBackend,mcIntervalo,mcComisiones,_prueba} = st
  const { cfgBaseMc, cuerpoMc, pesosNormalizadosMc } = L
    const weightsNorm=pesosNormalizadosMc(mcMode,mcSelected,mcWeights)
    const baseCfg=cfgBaseMc({emaR,emaL,years:_mcYears,capitalIni:mcCapitalIni,fromDate:_mcFrom,toDate:_mcTo,
      tipoStop,atrP,atrM,sinPerdidas,reentry,tipoFiltro,sp500EmaR,sp500EmaL,tipoCapital:mcCapital,
      riskPerTrade:mcRiskPerTrade,maxPortfolioPct:mcMaxPortfolioPct,maxAccumRisk:mcMaxAccumRisk,assumedStopPct:mcAssumedStopPct,maxPosiciones:mcMaxPosiciones,prioridad:mcPrioridad,criterioUso:mcCriterioUso,momentumN:mcMomentumN,rsWindow:mcRsWindow,rsGateThr:mcRsGateThr,momGateThr:mcMomGateThr,proxGateThr:mcProxGateThr,
      calculoPrioridad:mcCalculoPrioridad,
      scoreMap:Object.fromEntries(_activosMc.map(sym=>[sym,wlData[sym.toUpperCase()]?.active?.scoreMetricas??null]))})
          const _cuerpoMc={...cuerpoMc({symbols:mcSelected,modoAsig:modesToRun[0],weights:weightsNorm,cfg:baseCfg,strategyId:stratIds[0]||null,isNoStrategy,filtros:filtrosBackend,intervalo:mcIntervalo,comisiones:mcComisiones}),..._prueba}
  return { weightsNorm, baseCfg, _cuerpoMc }
}
// ── Ajustes al azar (semilla fija) ──
let semilla = 20261106
const az = () => { semilla = (semilla * 1103515245 + 12345) % 2147483648; return semilla / 2147483648 }
const uno = (xs) => xs[Math.floor(az() * xs.length)]
const numRaro = () => uno([10, 0, 5.5, '12', '12.5', '', 'abc', null, undefined, -3, 63, '63'])
const SIMB = ['AAPL', 'MSFT', 'nvda', 'GLD', '^GSPC', 'BRK.B', 'V']
function estado() {
  const sel = SIMB.filter(() => az() < 0.5)
  const pesos = {}; sel.forEach(s => { if (az() < 0.8) pesos[s] = uno([0, 10, '25', '', 'x', 33.3, 100]) })
  const wl = {}; SIMB.forEach(s => { if (az() < 0.6) wl[s.toUpperCase()] = az() < 0.8 ? { active: { scoreMetricas: uno([null, 0, 7.5, 92]) } } : {} })
  const anios = az() < 0.5
  return {
    mcMode: uno(['slots', 'compartido', 'concentrado', 'custom', 'positionsizing']), mcSelected: sel, mcWeights: pesos,
    emaR: numRaro(), emaL: numRaro(), _mcYears: anios ? uno([5, '10', 3]) : null, mcCapitalIni: uno([10000, '10000', 2500.5]),
    _mcFrom: uno(['2016-01-01', null, '2021-06-30']), _mcTo: uno(['2025-12-31', null]), tipoStop: uno(['tecnico', 'atr', 'none']), atrP: numRaro(), atrM: numRaro(),
    sinPerdidas: az() < 0.5, reentry: az() < 0.5, tipoFiltro: uno(['none', 'sp500ema']), sp500EmaR: numRaro(), sp500EmaL: numRaro(), mcCapital: uno(['simple', 'compound']),
    mcRiskPerTrade: numRaro(), mcMaxPortfolioPct: numRaro(), mcMaxAccumRisk: numRaro(), mcAssumedStopPct: numRaro(), mcMaxPosiciones: uno([1, 4, 20, '4']),
    mcPrioridad: uno(['alfabetico', 'momentum', 'rs', 'score']), mcCriterioUso: uno(['desempate', 'filtro']), mcMomentumN: numRaro(), mcRsWindow: numRaro(),
    mcRsGateThr: numRaro(), mcMomGateThr: numRaro(), mcProxGateThr: numRaro(), mcCalculoPrioridad: uno([1, 2, '1', undefined]),
    _activosMc: az() < 0.8 ? sel : SIMB, wlData: wl, modesToRun: [uno(['slots', 'concentrado', 'custom'])], stratIds: uno([['id-1'], [''], []]),
    isNoStrategy: az() < 0.2, filtrosBackend: uno([[], [{ id: 'f1', tipo: 'benchmarkEma' }]]), mcIntervalo: uno(['diario', 'semanal']),
    mcComisiones: uno([{ compraFija: 0.36, ventaFija: 0, pct: 0 }, { compraFija: 0, ventaFija: 0, pct: 0.1 }]),
    _prueba: uno([{}, { filtros: [], params: { emaR: 20 } }, { filtros: [], params: {}, calentamiento: 200 }]),
  }
}
;(async () => {
  await prepara(); registra(RAIZ)
  const L = require(path.join(RAIZ, 'lib/peticionMc.js'))
  let fallos = 0, n = 0
  for (let i = 0; i < 3000; i++) {
    const st = estado(), a = antes(st), b = ahora(L, st)
    for (const k of ['weightsNorm', 'baseCfg', '_cuerpoMc']) {
      n++
      if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) { fallos++; if (fallos < 4) console.log('DISTINTO', k, '\n antes:', JSON.stringify(a[k]).slice(0, 300), '\n ahora:', JSON.stringify(b[k]).slice(0, 300)) }
    }
  }
  // pages/index.js usa la librería en sus tres sitios (y ya no tiene el código de antes).
  const idx = fs.readFileSync(path.join(RAIZ, 'pages/index.js'), 'utf8')
  const usa = ['const weightsNorm=pesosNormalizadosMc(mcMode,mcSelected,mcWeights)', 'const baseCfg=cfgBaseMc({', 'const _cuerpoMc={...cuerpoMc({symbols:mcSelected,modoAsig:modesToRun[0]']
  usa.forEach(u => { if (idx.split(u).length !== 2) { fallos++; console.log('pages/index.js no usa la librería así una vez:', u) } })
  console.log(`peticion-mc: ${n} comparaciones (3.000 ajustes al azar), ${fallos ? fallos + ' FALLOS' : 'todas idénticas'}`)
  process.exit(fallos ? 1 : 0)
})().catch(e => { console.error('FALLO', e.stack); process.exit(1) })
