export function calcMetrics(trades, capitalIni, capitalReinv, gananciaSimple, ganBH, startDate, endDate, yearsConfig) {
  if (!trades||trades.length===0) return null
  const n=trades.length, wins=trades.filter(t=>t.pnlPct>=0), losses=trades.filter(t=>t.pnlPct<0)
  const winRate=(wins.length/n)*100
  const avgWin=wins.length?wins.reduce((s,t)=>s+t.pnlPct,0)/wins.length:0
  const avgLoss=losses.length?losses.reduce((s,t)=>s+Math.abs(t.pnlPct),0)/losses.length:0
  const totalDias=trades.reduce((s,t)=>s+t.dias,0)
  // Periodo real: siempre desde fechas reales del calendario (startDate→endDate)
  // Esto da los años correctos para CAGR y Tiempo Invertido
  let totalDiasNat = Number(yearsConfig||5) * 365.25
  if (startDate && endDate) {
    const ms = new Date(endDate).getTime() - new Date(startDate).getTime()
    if (!isNaN(ms) && ms > 0) totalDiasNat = ms / 86400000
  }
  const anios = Math.max(totalDiasNat / 365.25, 0.01)
  const safYears = anios
  const aniosInv=totalDias/365.25, tiempoInvPct=(totalDias/totalDiasNat)*100
  const cagrS=Math.pow(Math.max(capitalIni+gananciaSimple,0.01)/capitalIni,1/safYears)-1
  const cagrC=capitalReinv>0?Math.pow(capitalReinv/capitalIni,1/safYears)-1:0
  const capBH=capitalIni+ganBH, cagrBH=capBH>0?Math.pow(capBH/capitalIni,1/safYears)-1:0
  const gBrute=wins.reduce((s,t)=>s+t.pnlSimple,0), lBrute=losses.reduce((s,t)=>s+Math.abs(t.pnlSimple),0)
  const factorBen=lBrute>0?gBrute/lBrute:999
  let peakS=capitalIni,maxDDS=0; trades.forEach(t=>{const eq=capitalIni+trades.slice(0,trades.indexOf(t)+1).reduce((s,x)=>s+x.pnlSimple,0);if(eq>peakS)peakS=eq;const dd=(peakS-eq)/peakS*100;if(dd>maxDDS)maxDDS=dd})
  let peakR=capitalIni,maxDDR=0; trades.forEach(t=>{if(t.capitalTras>peakR)peakR=t.capitalTras;const dd=(peakR-t.capitalTras)/peakR*100;if(dd>maxDDR)maxDDR=dd})
  return {n,wins:wins.length,losses:losses.length,winRate,avgWin,avgLoss,totalDias,diasProm:totalDias/n,ganSimple:gananciaSimple,ganComp:capitalReinv-capitalIni,ganBH,ganTotalPct:(gananciaSimple/capitalIni)*100,cagrS:cagrS*100,cagrC:cagrC*100,cagrBH:cagrBH*100,factorBen,ddSimple:maxDDS,ddComp:maxDDR,tiempoInvPct,aniosInv,anios:safYears}
}

export const MONO='"JetBrains Mono","Fira Code","IBM Plex Mono",monospace'

export function fmt(v,dec=2,suf=''){if(v==null||isNaN(v))return'—';return v.toLocaleString('es-ES',{minimumFractionDigits:dec,maximumFractionDigits:dec})+suf}
export function fmtDate(s){if(!s)return'—';const d=typeof s==='string'?s.slice(0,10):null;if(d&&/^\d{4}-\d{2}-\d{2}$/.test(d)){const[y,m,day]=d.split('-');return`${day}/${m}/${y}`}return new Date(s).toLocaleDateString('es-ES',{day:'2-digit',month:'2-digit',year:'numeric'})}
export function f2(v){if(v==null||isNaN(v))return'—';return v.toLocaleString('es-ES',{minimumFractionDigits:2,maximumFractionDigits:2})}
export function tvSym(sym){if(sym==='^GSPC')return'SP:SPX';if(sym==='^IBEX')return'BME:IBC';if(sym==='^GDAXI')return'XETR:DAX';if(sym==='^NDX')return'NASDAQ:NDX';if(sym.includes('-USD'))return`BINANCE:${sym.replace('-','')}`;return sym}

// ── Score histórico ponderado ────────────────────────────────
// Fuente ÚNICA del criterio "mejor estrategia": lo usan calcScoreMetricas (score que se muestra y
// se persiste), calcMetricas (elección de la top) y refreshWlData (re-elección al recargar).
// Métricas crudas: {winRate, cagr, cagrRobust, maxDD}. cagrRobust se persiste en ranking_results
// (columna cagr_robusto, ver sql/add_cagr_robusto.sql); mientras una fila no la tenga rellena se
// aplica el fallback de siempre: cagrRobust ?? cagr.
export function pctOf(arr,p){const s=[...arr].sort((a,b)=>a-b);return s[Math.max(0,Math.floor(p*(s.length-1)))]??0}
export function normDynVal(v,floor,ceil){return Math.max(0,Math.min(100,ceil===floor?50:(v-floor)/(ceil-floor)*100))}

// Pesos (tanto por uno) desde el objeto de settings
export function pesosScoreHistorico(sett){
  return {
    wrPct:      (sett?.ranking?.rankingWinRatePct     ?? 33)/100,
    cagrPct:    (sett?.ranking?.rankingCAGRPct        ?? 33)/100,
    cagrRobPct: (sett?.ranking?.rankingCAGRRobustoPct ?? 34)/100,
    ddPct:      (sett?.ranking?.rankingMaxDDPct       ?? 0)/100,
  }
}

// Suelos/techos por percentil a partir de una lista de métricas (el universo de comparación)
export function floorsDe(metricas,pct){
  const wr=[],ca=[],cr=[],dd=[]
  ;(metricas||[]).forEach(m=>{
    if(!m) return
    if(m.winRate!=null) wr.push(m.winRate)
    if(m.cagr!=null)    ca.push(m.cagr)
    const r=m.cagrRobust??m.cagr; if(r!=null) cr.push(r)
    if(m.maxDD!=null)   dd.push(m.maxDD)
  })
  return {
    wrFl:pctOf(wr,1-pct), wrCe:pctOf(wr,pct),
    caFl:pctOf(ca,1-pct), caCe:pctOf(ca,pct),
    crFl:pctOf(cr,1-pct), crCe:pctOf(cr,pct),
    ddFl:pctOf(dd,1-pct), ddCe:pctOf(dd,pct),
  }
}

// Desglose auditable del score: por métrica {valor, norm 0-100, peso, puntos} + total.
// scoreHistoricoDe es un simple envoltorio de esta función → la fórmula vive en UN solo sitio
// y el desglose no puede divergir del score.
export function desgloseScoreHistorico(m,f,w){
  if(!m) return null
  const comp=(valor,floor,ceil,peso,resta=false)=>{
    const norm=normDynVal(valor,floor,ceil)
    return {valor,norm,peso,puntos:resta?-(norm*peso):norm*peso}
  }
  const winRate    = comp(m.winRate,            f.wrFl,f.wrCe,w.wrPct)
  const cagr       = comp(m.cagr,               f.caFl,f.caCe,w.cagrPct)
  const cagrRobust = comp(m.cagrRobust??m.cagr, f.crFl,f.crCe,w.cagrRobPct)
  const maxDD      = comp(m.maxDD,              f.ddFl,f.ddCe,w.ddPct,true)   // penaliza: resta
  const total=Math.max(0,Math.min(100,
    winRate.puntos+cagr.puntos+cagrRobust.puntos+maxDD.puntos))
  return {winRate,cagr,cagrRobust,maxDD,total,cagrRobustEsFallback:m.cagrRobust==null}
}

// Score 0-100 — réplica EXACTA de la fórmula que ya usaba calcScoreMetricas
export function scoreHistoricoDe(m,f,w){
  const d=desgloseScoreHistorico(m,f,w)
  return d?d.total:null
}
