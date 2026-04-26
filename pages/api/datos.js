// pages/api/datos.js — Motor V50 v3.0

import { calcEMA, calcSMA, calcRSI, calcATR, calcMACD } from '../../lib/backtester'

const SUPA_URL = process.env.SUPABASE_URL || 'https://uqjngxxbdlquiuhywiuc.supabase.co'
const SUPA_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_st9QJ3zcQbY5ec-JhxwqXQ_joy3udz3'

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

// ── Build full trade objects from raw { entryDate, exitDate, entryPrice, exitPrice } ──
function buildTrades(rawTrades, capitalIni, allocationPct = 100) {
  const fixedAlloc = capitalIni * (allocationPct / 100)
  let compoundCapital = capitalIni
  return rawTrades
    .filter(t => t.entryDate && t.exitDate && t.entryPrice > 0 && t.exitPrice > 0)
    .map(t => {
      const sharesSimple   = fixedAlloc / t.entryPrice
      const pnlSimple      = (t.exitPrice - t.entryPrice) * sharesSimple
      const pnlPct         = (t.exitPrice / t.entryPrice - 1) * 100

      const compAlloc      = compoundCapital * (allocationPct / 100)
      const sharesCompound = compAlloc / t.entryPrice
      const pnlCompound    = (t.exitPrice - t.entryPrice) * sharesCompound
      compoundCapital     += pnlCompound

      const dias = Math.max(1, Math.round((new Date(t.exitDate) - new Date(t.entryDate)) / 86400000))

      return { ...t, shares: sharesSimple, pnlSimple, pnlPct, capitalTras: compoundCapital, dias }
    })
}

// ── Handler ──────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { simbolo, strategyId, capital_ini = 10000, years = 5, allocation_pct = 100, priceOnly } = req.body || {}
  if (!simbolo) return res.status(400).json({ error: 'simbolo requerido' })

  // ── Price-only mode: last close, no strategy execution ──
  if (priceOnly) {
    try {
      const data = await fetchAV(simbolo, 1)
      const last = data[data.length - 1]
      return res.status(200).json({ meta: { ultimaFecha: last.date, ultimoPrecio: last.close, simbolo } })
    } catch(e) { return res.status(500).json({ error: e.message }) }
  }

  // ── Fetch code_js from Supabase ──
  let codeJs = null, stratParams = null, stratVisuals = null
  if (strategyId) {
    try {
      const r = await fetch(
        `${SUPA_URL}/rest/v1/strategies?id=eq.${strategyId}&select=code_js,params,visuals`,
        { headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` } }
      )
      if (r.ok) {
        const row = (await r.json())?.[0] || {}
        codeJs       = row.code_js || null
        stratParams  = row.params  || null
        stratVisuals = row.visuals || null
      }
    } catch (_) {}
  }

  if (!codeJs) {
    return res.status(400).json({ error: 'Esta estrategia no tiene código generado. Abre el editor y usa "Generar con Claude".' })
  }

  try {
    // ── Fetch market data ──
    const allData = await fetchAV(simbolo, years + 1)
    const cutoff  = new Date(); cutoff.setFullYear(cutoff.getFullYear() - years)
    const data    = allData.filter(d => new Date(d.date) >= cutoff)
    if (!data.length) throw new Error('Sin datos para ' + simbolo)

    // ── Execute strategy in sandbox ──
    const wrappedCode = `"use strict";\n${codeJs}\nreturn run;`
    const getRunFn = new Function('calcEMA','calcSMA','calcRSI','calcATR','calcMACD', wrappedCode)
    const runFn    = getRunFn(calcEMA, calcSMA, calcRSI, calcATR, calcMACD)
    const userParams = stratParams ? JSON.parse(stratParams) : {}
    const { trades: rawTrades = [], indicators = {} } = runFn(data, { capital_ini, years, allocation_pct, ...userParams })

    // ── Enrich trades ──
    const trades = buildTrades(rawTrades, capital_ini, allocation_pct)
    console.log('[TRADES]', JSON.stringify(trades.slice(0,3).map(t=>({
      entryDate: t.entryDate, exitDate: t.exitDate,
      entryPrice: t.entryPrice, exitPrice: t.exitPrice,
      pnlPct: t.pnlPct
    })), null, 2))

    // ── Inject indicators into chartData bars ──
    const emaRArr = indicators.emaR || indicators.emaFast || null
    const emaLArr = indicators.emaL || indicators.emaSlow || null
    const chartData = data.map((d, i) => ({
      ...d,
      emaR: emaRArr?.[i] ?? null,
      emaL: emaLArr?.[i] ?? null,
    }))

    // ── Summary metrics ──
    const gananciaSimple = trades.reduce((s, t) => s + t.pnlSimple, 0)
    const capitalReinv   = trades.length ? trades[trades.length - 1].capitalTras : capital_ini
    const p0 = data[0].close, pN = data[data.length - 1].close
    const ganBH = capital_ini * (pN / p0 - 1)

    // ── Equity curves ──
    let sp500Data = null
    try {
      const sp500Raw = await fetchAV('^GSPC', years + 1)
      sp500Data = sp500Raw.filter(d => d.date >= data[0].date)
    } catch (_) { sp500Data = null }
    const curves = calcEquityCurves(trades, data, capital_ini, data[0].date, sp500Data)

    return res.status(200).json({
      chartData,
      trades,
      gananciaSimple,
      capitalReinv,
      ganBH,
      startDate: data[0].date,
      ...curves,
      visuals: stratVisuals ? JSON.parse(stratVisuals) : null,
      meta: { ultimaFecha: data[data.length - 1].date, ultimoPrecio: data[data.length - 1].close, simbolo },
    })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
