// lib/peticionMc.js — cómo se arma la petición a /api/multibacktest (el Backtesting y, desde la fase 4 de «el plan con lista»,
// «La cartera por dentro» del plan: docs/builder.md §83). Se sacó de runBacktesting (pages/index.js) TAL CUAL, para que el plan pida
// EXACTAMENTE lo mismo que el Backtesting con los mismos ajustes: mismas claves, mismo orden y mismas conversiones. Lo comprueba
// scripts/comprobaciones/peticion-mc.js contra una copia del código de antes.

// Pesos del modo «Pesos personalizados» (custom), normalizados a 100. En los demás modos, vacío.
export function pesosNormalizadosMc(modo, simbolos, pesos) {
  const weightsNorm={}
  if(modo==='custom'){
    const total=simbolos.reduce((s,sym)=>s+(Number(pesos[sym])||0),0)
    simbolos.forEach(sym=>{weightsNorm[sym]=total>0?(Number(pesos[sym])||0)/total*100:100/simbolos.length})
  }
  return weightsNorm
}

// El cfg común de la petición: los parámetros del panel (los de «Backtest de un valor»: las estrategias de tarjetas no los usan; las
// de código pueden), capital, periodo, tipo de capital y las reglas del reparto (sizeRules). scoreMap llega ya hecho (sale de la
// Watchlist de la app).
export function cfgBaseMc({ emaR, emaL, years, capitalIni, fromDate, toDate, tipoStop, atrP, atrM, sinPerdidas, reentry, tipoFiltro, sp500EmaR, sp500EmaL, tipoCapital,
  riskPerTrade, maxPortfolioPct, maxAccumRisk, assumedStopPct, maxPosiciones, prioridad, criterioUso, momentumN, rsWindow, rsGateThr, momGateThr, proxGateThr, calculoPrioridad, scoreMap }) {
  return {emaR:Number(emaR),emaL:Number(emaL),years,capitalIni,
    fromDate,toDate,
    tipoStop,atrPeriod:Number(atrP),atrMult:Number(atrM),sinPerdidas,reentry,
    tipoFiltro,sp500EmaR:Number(sp500EmaR),sp500EmaL:Number(sp500EmaL),tipoCapital,
    sizeRules:{riskPerTrade,maxPortfolioPct,maxAccumRisk,assumedStopPct,maxPosiciones,prioridad,criterioUso,momentumN:Number(momentumN),rsWindow:Number(rsWindow),rsGateThr:Number(rsGateThr),momGateThr:Number(momGateThr),proxGateThr:Number(proxGateThr),
      ...(calculoPrioridad===1?{calculoPrioridad:1}:{}),
      scoreMap}}
}

// El cuerpo de UNA estrategia en UN modo (el caso «Single mode run» de runBacktesting), con las claves en su orden.
export function cuerpoMc({ symbols, modoAsig, weights, cfg, strategyId, isNoStrategy, filtros, intervalo, comisiones }) {
  return {symbols,modoAsig,weights,cfg,strategyId,isNoStrategy,filtros,intervalo,comisiones}
}
