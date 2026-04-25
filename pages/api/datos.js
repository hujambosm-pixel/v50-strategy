// pages/api/datos.js — Motor V50 v3.0
// FASE 3 pendiente: motor de backtest en construcción

import { calcEMA } from '../../lib/backtester'

function stooqSym(symbol) {
  const MAP={
    '^GSPC':'spy.us','^NDX':'ndx.us','^IBEX':'ibex.es','^GDAXI':'dax.de',
    '^FTSE':'ftse.uk','^N225':'n225.jp','BTC-USD':'btc-usd.v','ETH-USD':'eth-usd.v',
    'GC=F':'gc.f','CL=F':'cl.f',
    '^IXIC':'ndx.us','^DJI':'dji.us','^FCHI':'cac.fr','^STOXX50E':'sx5e.de','^HSI':'hsi.hk',
    'SI=F':'si.f',
  }
  if(MAP[symbol]) return MAP[symbol]
  if(symbol.endsWith('=F')) return symbol.replace('=F','').toLowerCase()+'.f'
  if(symbol.includes('-')) return symbol.toLowerCase()+'.v'
  if(symbol.startsWith('^')) return symbol.slice(1).toLowerCase()+'.us'
  return symbol.toLowerCase()+'.us'
}

export async function fetchAV(symbol, years=5) {
  const sym = stooqSym(symbol)
  const url = `https://stooq.com/q/d/l/?s=${sym}&i=d`
  const res = await fetch(url)
  const text = await res.text()
  let rawData = null
  if (text && !text.includes('No data') && text.trim().length >= 50) {
    rawData = text.trim().split('\n').slice(1).filter(l=>l.trim()).map(l=>{
      const [date,open,high,low,close,volume] = l.split(',')
      return { date, open:parseFloat(open), high:parseFloat(high), low:parseFloat(low), close:parseFloat(close), volume:parseFloat(volume)||0 }
    }).filter(d=>d.close&&!isNaN(d.close)).sort((a,b)=>a.date.localeCompare(b.date))
  }
  if (!rawData || rawData.length === 0) {
    try {
      const yfYears = Math.min(Math.max(Math.ceil(years), 1), 10)
      const yfUrl = yfYears <= 10
        ? `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=${yfYears}y`
        : (() => { const p1=Math.floor(Date.now()/1000)-Math.ceil(years)*365*24*3600; return `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&period1=${p1}&period2=${Math.floor(Date.now()/1000)}` })()
      const yfR = await fetch(yfUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json'
        }
      })
      if (yfR.ok) {
        const yfJson = await yfR.json()
        const timestamps = yfJson?.chart?.result?.[0]?.timestamp
        const quotes = yfJson?.chart?.result?.[0]?.indicators?.quote?.[0]
        if (timestamps && quotes) {
          rawData = timestamps.map((t,i) => ({
            date: new Date(t*1000).toISOString().slice(0,10),
            open:  quotes.open?.[i]  || quotes.close?.[i],
            high:  quotes.high?.[i]  || quotes.close?.[i],
            low:   quotes.low?.[i]   || quotes.close?.[i],
            close: quotes.close?.[i],
            volume: quotes.volume?.[i] || 0
          })).filter(d=>d.close&&!isNaN(d.close))
        }
      }
    } catch(_) {}
  }
  if (!rawData || rawData.length === 0) throw new Error(`Sin datos para ${symbol}`)
  return rawData
}

export function calcEquityCurves(trades, data, capitalIni, startDate, sp500Data) {
  const filtered = data.filter(d=>new Date(d.date)>=new Date(startDate))
  if (!filtered.length) return {
    strategyCurve:[],bhCurve:[],sp500BHCurve:[],compoundCurve:[],
    maxDDStrategy:0,maxDDBH:0,maxDDSP500:0,maxDDCompound:0,
    maxDDStrategyDate:null,maxDDBHDate:null,maxDDSP500Date:null,maxDDCompoundDate:null
  }
  const p0   = filtered[0].close
  const step = Math.max(1, Math.floor(filtered.length/300))
  const sampled = filtered.filter((_,i)=>i%step===0||i===filtered.length-1)
  const strategyCurve=[], bhCurve=[], sp500BHCurve=[], compoundCurve=[]
  let lastStrat=capitalIni, lastCompound=capitalIni
  let sp0Close=null
  if (sp500Data) { const sp0=sp500Data.find(d=>d.date>=filtered[0].date); if(sp0) sp0Close=sp0.close }
  sampled.forEach(d=>{
    const exits=trades.filter(t=>t.exitDate<=d.date)
    if (exits.length) {
      lastStrat    = capitalIni+exits.reduce((s,t)=>s+t.pnlSimple,0)
      lastCompound = exits[exits.length-1].capitalTras
    }
    strategyCurve.push({date:d.date,value:lastStrat})
    compoundCurve.push({date:d.date,value:lastCompound})
    bhCurve.push({date:d.date,value:capitalIni*(d.close/p0)})
    if (sp500Data&&sp0Close) {
      let spBar=null
      for(let i=sp500Data.length-1;i>=0;i--){if(sp500Data[i].date<=d.date){spBar=sp500Data[i];break}}
      if (spBar) sp500BHCurve.push({date:d.date,value:capitalIni*(spBar.close/sp0Close)})
    }
  })
  const calcDD = (curve) => {
    let peak=curve[0]?.value||capitalIni, maxDD=0, maxDDDate=null
    curve.forEach(p=>{
      if(p.value>peak) peak=p.value
      const dd=(peak-p.value)/peak*100
      if(dd>maxDD){maxDD=dd;maxDDDate=p.date}
    })
    return {maxDD,maxDDDate}
  }
  return {
    strategyCurve,bhCurve,sp500BHCurve,compoundCurve,
    ...Object.fromEntries(['Strategy','BH','SP500','Compound'].map((n,i)=>{
      const curve=[strategyCurve,bhCurve,sp500BHCurve,compoundCurve][i]
      const {maxDD,maxDDDate}=calcDD(curve)
      return [[`maxDD${n}`,maxDD],[`maxDD${n}Date`,maxDDDate]]
    }).flat())
  }
}

// ── Handler ──────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  return res.status(501).json({ error: 'Motor de backtest en construcción — FASE 3 pendiente' })
}
