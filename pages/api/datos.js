// pages/api/datos.js — Motor V50 v2.5
// Lógica fiel al Pine Script de TradingView V50_17
// Acepta: { simbolo, cfg }        → motor V50 hardcodeado (máxima fidelidad)
//         { simbolo, definition } → motor modular (futuras estrategias)

import { calcEMA, runBacktestV50 } from '../../lib/backtester'

function stooqSym(symbol) {
  const MAP={
    '^GSPC':'spy.us','^NDX':'ndx.us','^IBEX':'ibex.es','^GDAXI':'dax.de',
    '^FTSE':'ftse.uk','^N225':'n225.jp','BTC-USD':'btc-usd.v','ETH-USD':'eth-usd.v',
    'GC=F':'gc.f','CL=F':'cl.f',
    '^IXIC':'ndx.us','^DJI':'dji.us','^FCHI':'cac.fr','^STOXX50E':'sx5e.de','^HSI':'hsi.hk',
    'SI=F':'si.f',
  }
  if(MAP[symbol]) return MAP[symbol]
  // Futures (end in =F) -> lowercase, strip =F, add .f
  if(symbol.endsWith('=F')) return symbol.replace('=F','').toLowerCase()+'.f'
  // Crypto (-USD, -EUR) -> lowercase, add .v
  if(symbol.includes('-')) return symbol.toLowerCase()+'.v'
  // European indices (^XX) -> lowercase, try common suffixes
  if(symbol.startsWith('^')) return symbol.slice(1).toLowerCase()+'.us'
  // Default: US stock
  return symbol.toLowerCase()+'.us'
}
async function fetchAV(symbol, years=5) {
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

function calcEquityCurves(trades, data, capitalIni, startDate, sp500Data) {
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
  const { simbolo, cfg, definition } = req.body
  try {
    const reqYears = Number(cfg?.years ?? definition?.years ?? 5)
    const data = await fetchAV(simbolo, reqYears)
    if (!data||!data.length) return res.status(404).json({error:`Sin datos para "${simbolo}"`})
    let sp500Data=null; try { sp500Data=await fetchAV('^GSPC', reqYears) } catch(_) {}

    let cfgFinal = cfg

    // Si viene definition, convertir a cfg para usar el motor V50 fiel
    if (!cfgFinal && definition) {
      const setup      = definition.setup       || {}
      const trigger    = definition.trigger     || {}
      const abort_     = definition.abort       || {}
      const exit_      = definition.exit        || {}
      const triggerOut = definition.trigger_out || {}
      const stopLoss   = definition.stop_loss   || {}
      const mgmt       = definition.management  || {}
      const rawFilt_   = definition.filter      || {}
      const filter_    = rawFilt_.conditions?.length ? rawFilt_.conditions[0] : rawFilt_

      // Solo tipos reconocidos por evaluateTrigger/evaluateTriggerOut.
      // Si definition.trigger contiene un tipo de setup (ej: "ema_cross_up"),
      // se ignora y el motor usa el breakout rolling legacy.
      const TRIGGER_IN_TYPES  = new Set(['breakout_high','breakout_close','open_after_n_bars','ma_direction_up','rsi_cross_up','rsi_direction_up','price_below_52w_high_pct'])
      const TRIGGER_OUT_TYPES = new Set(['breakdown_low','open_after_n_bars','ma_direction_down','rsi_cross_down','rsi_direction_down','profit_pct'])

      cfgFinal = {
        // ── EMA base (compatibilidad con estrategias antiguas) ──
        emaR: setup.ma_fast || setup.ema_r || 10,
        emaL: setup.ma_slow || setup.ema_l || 11,

        // ── FILTER ──
        filterType:   filter_.type   || undefined,
        filterParams: filter_,
        tipoFiltro:   filter_.type   || undefined,
        sp500EmaR:    filter_.sp500EmaR || filter_.ma_fast || 10,
        sp500EmaL:    filter_.sp500EmaL || filter_.ma_slow || 20,

        // ── SETUP IN ──
        setupType:    setup.type    || 'ema_cross_up',
        setupParams:  setup,

        // ── TRIGGER IN — solo si es tipo trigger reconocido ──
        triggerType:   TRIGGER_IN_TYPES.has(trigger.type) ? trigger.type : undefined,
        triggerParams: trigger,

        // ── ABORT ──
        abortType:    abort_.type   || undefined,
        abortParams:  abort_,

        // ── SETUP OUT (exit) ──
        exitType:     exit_.type    || undefined,
        exitParams:   exit_,

        // ── TRIGGER OUT — solo si es tipo trigger out reconocido ──
        triggerOutType:   TRIGGER_OUT_TYPES.has(triggerOut.type) ? triggerOut.type : undefined,
        triggerOutParams: triggerOut,

        // ── STOP LOSS ──
        stopType:   stopLoss.type  || undefined,
        stopParams: stopLoss,
        // Compatibilidad con campos legacy de stop:
        tipoStop:          stopLoss.type === 'atr_based'    ? 'atr'          :
                           stopLoss.type === 'none'         ? 'none'         :
                           stopLoss.type === 'fixed_pct'    ? 'fixed_pct'    :
                           stopLoss.type === 'trailing_atr' ? 'trailing_atr' :
                           stopLoss.type === 'tecnico'      ? 'tecnico'      : undefined,
        atrPeriod:         stopLoss.atr_period              || 14,
        atrMult:           stopLoss.atr_mult                || 2,
        fixedPct:          stopLoss.params?.pct             ?? stopLoss.pct  ?? undefined,
        trailingAtrPeriod: stopLoss.params?.atr_period      ?? stopLoss.atr_period ?? 14,
        trailingAtrMult:   stopLoss.params?.atr_mult        ?? stopLoss.atr_mult   ?? 2.0,

        // ── MANAGEMENT ──
        sinPerdidas: mgmt.sin_perdidas ?? false,
        reentry:     mgmt.reentry      ?? false,

        // ── OTROS ──
        years:       req.body.years       || 5,
        capitalIni:  req.body.capital_ini || req.body.capitalIni || 1000,
        modoAsig:    req.body.modoAsig    || 'fijo',
        slotCapital: req.body.slotCapital || 1000,
      }
    }

    if (!cfgFinal) return res.status(400).json({error:'Se requiere cfg o definition'})

    const { chartData, trades, capitalReinv, gananciaSimple, startDate, blockEvents } =
      runBacktestV50(data, sp500Data, cfgFinal)

    const capIni       = cfgFinal.capitalIni
    const filteredData = data.filter(d=>new Date(d.date)>=new Date(startDate))
    let ganBH=0
    if (filteredData.length>=2)
      ganBH = capIni*(filteredData[filteredData.length-1].close/filteredData[0].close)-capIni

    const curves = calcEquityCurves(trades, data, capIni, startDate, sp500Data)

    let sp500Status=null
    if (sp500Data?.length) {
      const spEmaRP = cfgFinal.sp500EmaR || 10
      const spEmaLP = cfgFinal.sp500EmaL || 11
      const spC     = sp500Data.map(d=>d.close)
      const spEmaR  = calcEMA(spC,spEmaRP)
      const spEmaL  = calcEMA(spC,spEmaLP)
      const last    = sp500Data[sp500Data.length-1]
      sp500Status   = { precio:last.close, emaR:spEmaR[spEmaR.length-1], emaL:spEmaL[spEmaL.length-1], date:last.date, sp500EmaR:spEmaRP, sp500EmaL:spEmaLP }
    }

    res.status(200).json({
      chartData: chartData.filter(d=>new Date(d.date)>=new Date(startDate)),
      trades, capitalReinv, gananciaSimple, ganBH,
      startDate: startDate.toISOString().split('T')[0],
      sp500Status, ...curves,
      blockEvents: blockEvents || {filter:[],setup_in:[],setup_in_range:[],trigger_in:[],abort:[],setup_out:[],setup_out_range:[],trigger_out:[],stop_loss:[]},
      meta: {
        simbolo,
        ultimaFecha:  data[data.length-1].date,
        ultimoPrecio: data[data.length-1].close,
        totalBars:    data.length,
        emaRPeriod:   cfgFinal.emaR,
        emaLPeriod:   cfgFinal.emaL,
      },
    })
  } catch(err) {
    console.error(err)
    res.status(500).json({error:err.message||'Error interno'})
  }
}
