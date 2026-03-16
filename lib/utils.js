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
export function fmtDate(s){if(!s)return'—';return new Date(s).toLocaleDateString('es-ES',{day:'2-digit',month:'2-digit',year:'numeric'})}
export function f2(v){if(v==null||isNaN(v))return'—';return v.toLocaleString('es-ES',{minimumFractionDigits:2,maximumFractionDigits:2})}
export function tvSym(sym){if(sym==='^GSPC')return'SP:SPX';if(sym==='^IBEX')return'BME:IBC';if(sym==='^GDAXI')return'XETR:DAX';if(sym==='^NDX')return'NASDAQ:NDX';if(sym.includes('-USD'))return`BINANCE:${sym.replace('-','')}`;return sym}
