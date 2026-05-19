// pages/api/datos.js — Motor V50 v3.0 (V9.254)

import { calcEMA, calcSMA, calcRSI, calcATR, calcMACD } from '../../lib/backtester'

const SUPA_URL = process.env.SUPABASE_URL || 'https://uqjngxxbdlquiuhywiuc.supabase.co'
const SUPA_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_st9QJ3zcQbY5ec-JhxwqXQ_joy3udz3'

// ── In-memory price cache (priceOnly mode) — 60s TTL ──────────
// Shared across requests within the same Vercel function instance.
// Avoids redundant Stooq/Yahoo fetches when multiple open positions
// are fetched sequentially within the same refresh cycle.
const priceCache = new Map() // key: symbol → { price, date, timestamp }
const CACHE_TTL  = 60 * 1000 // 60 seconds

function getCachedPrice(symbol) {
  const entry = priceCache.get(symbol)
  if (!entry) return null
  if (Date.now() - entry.timestamp > CACHE_TTL) { priceCache.delete(symbol); return null }
  return entry
}
function setCachedPrice(symbol, price, date) {
  priceCache.set(symbol, { price, date, timestamp: Date.now() })
}

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
  let rawData = null

  // ── Stooq fetch with 3-second timeout ──
  // Stooq hangs 10-12s from Vercel IPs; abort early so Yahoo fallback runs immediately
  const stooqCtrl = new AbortController()
  const stooqTimer = setTimeout(() => stooqCtrl.abort(), 3000)
  try {
    const res = await fetch(url, { signal: stooqCtrl.signal })
    const text = await res.text()
    if (text && !text.includes('No data') && text.trim().length >= 50) {
      rawData = text.trim().split('\n').slice(1).filter(l=>l.trim()).map(l=>{
        const [date,open,high,low,close,volume] = l.split(',')
        return { date, open:parseFloat(open), high:parseFloat(high), low:parseFloat(low), close:parseFloat(close), volume:parseFloat(volume)||0 }
      }).filter(d=>d.close&&!isNaN(d.close)).sort((a,b)=>a.date.localeCompare(b.date))
    }
  } catch(_) {
    // timeout or network error → fall through to Yahoo Finance
  } finally {
    clearTimeout(stooqTimer)
  }

  // ── Yahoo Finance fallback with 4-second timeout ──
  if (!rawData || rawData.length === 0) {
    const yfYears = Math.min(Math.max(Math.ceil(years), 1), 10)
    const yfUrl = yfYears <= 10
      ? `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=${yfYears}y`
      : (() => { const p1=Math.floor(Date.now()/1000)-Math.ceil(years)*365*24*3600; return `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&period1=${p1}&period2=${Math.floor(Date.now()/1000)}` })()
    const yfCtrl = new AbortController()
    const yfTimer = setTimeout(() => yfCtrl.abort(), 4000)
    try {
      const yfR = await fetch(yfUrl, {
        signal: yfCtrl.signal,
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
    } catch(_) {
      // timeout or network error → rawData stays null
    } finally {
      clearTimeout(yfTimer)
    }
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

// ── Align external close series to asset dates with forward-fill ──
function buildAlignedCloses(externalData, assetDates) {
  if (!externalData?.length) return assetDates.map(() => null)
  const closeMap = {}
  externalData.forEach(d => { closeMap[d.date] = d.close })
  const aligned = []
  let last = null
  for (const date of assetDates) {
    if (closeMap[date] != null) last = closeMap[date]
    aligned.push(last)
  }
  return aligned
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

      return { ...t, shares: sharesSimple, pnlSimple, pnlPct, capitalTras: compoundCapital, dias,
        entryPx: t.entryPrice, exitPx: t.exitPrice, tipo: t.exitReason ?? null }
    })
}

// ── Handler ──────────────────────────────────────────────────
export default async function handler(req, res) {
  try {
  if (req.method !== 'POST') return res.status(405).end()

  const { simbolo, strategyId, capital_ini = 10000, years = 5, allocation_pct = 100, priceOnly, filtros } = req.body || {}
  if (!simbolo) return res.status(400).json({ error: 'simbolo requerido' })

  // ── Price-only mode: last close, no strategy execution ──
  if (priceOnly) {
    // Check in-memory cache first (60s TTL) — avoids repeated Stooq/Yahoo hits
    const cached = getCachedPrice(simbolo)
    if (cached !== null) {
      return res.status(200).json({ meta: { ultimaFecha: cached.date, ultimoPrecio: cached.price, simbolo }, fromCache: true })
    }
    try {
      const data = await fetchAV(simbolo, 1)
      const last = data[data.length - 1]
      setCachedPrice(simbolo, last.close, last.date)
      return res.status(200).json({ meta: { ultimaFecha: last.date, ultimoPrecio: last.close, simbolo } })
    } catch(e) {
      console.error(`[datos] priceOnly fetch failed for ${simbolo}:`, e.message)
      return res.status(200).json({ error: true, errorMessage: `Sin precio para ${simbolo}: ${e.message}` })
    }
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

    // ── Fetch SP500 + filtro auxiliares en paralelo ──
    const filtrosCfg = filtros || {}
    const anyFiltroOn = !!(filtrosCfg.vix?.activo || filtrosCfg.indiceEma?.activo || filtrosCfg.sectorEma?.activo)
    let sp500Data = null, vixRawData = null, indiceAuxData = null, sectorAuxData = null
    const sp500Map = {}

    const fetchJobs = [
      fetchAV('^GSPC', years + 1)
        .then(r => { sp500Data = r.filter(d => d.date >= data[0].date); sp500Data.forEach(d => { sp500Map[d.date] = d.close }) })
        .catch(() => {}),
    ]
    if (anyFiltroOn) {
      if (filtrosCfg.vix?.activo)
        fetchJobs.push(fetchAV('^VIX', years + 1).then(r => { vixRawData = r.filter(d => d.date >= data[0].date) }).catch(() => {}))
      if (filtrosCfg.indiceEma?.activo && filtrosCfg.indiceEma.ticker && filtrosCfg.indiceEma.ticker !== '^GSPC')
        fetchJobs.push(fetchAV(filtrosCfg.indiceEma.ticker, years + 1).then(r => { indiceAuxData = r.filter(d => d.date >= data[0].date) }).catch(() => {}))
      if (filtrosCfg.sectorEma?.activo && filtrosCfg.sectorEma.ticker &&
          filtrosCfg.sectorEma.ticker !== '^GSPC' &&
          filtrosCfg.sectorEma.ticker !== (filtrosCfg.indiceEma?.ticker || ''))
        fetchJobs.push(fetchAV(filtrosCfg.sectorEma.ticker, years + 1).then(r => { sectorAuxData = r.filter(d => d.date >= data[0].date) }).catch(() => {}))
    }
    await Promise.all(fetchJobs)

    // ── Compute filtroActivo per date ──
    const assetDates = data.map(d => d.date)
    const filtroActivoMap = {} // date -> boolean (true = entrada permitida)
    let filterZonesFromFiltros = []

    if (anyFiltroOn) {
      // Resuelve el dataset para cada filtro
      const resolveData = (ticker, auxData) =>
        ticker === '^GSPC' ? sp500Data : (auxData ?? sp500Data)

      // VIX
      const vixCloses = filtrosCfg.vix?.activo ? buildAlignedCloses(vixRawData, assetDates) : null

      // Índice EMA
      const indiceDataRes = filtrosCfg.indiceEma?.activo
        ? resolveData(filtrosCfg.indiceEma.ticker, indiceAuxData)
        : null
      const indiceCloses  = indiceDataRes ? buildAlignedCloses(indiceDataRes, assetDates) : null
      const indiceEmaArr  = indiceCloses  ? calcEMA(indiceCloses, Math.max(1, filtrosCfg.indiceEma?.periodo ?? 200)) : null

      // Sector EMA
      const sectorDataRes = filtrosCfg.sectorEma?.activo
        ? (filtrosCfg.sectorEma.ticker === (filtrosCfg.indiceEma?.ticker || '')
            ? indiceDataRes
            : resolveData(filtrosCfg.sectorEma.ticker, sectorAuxData))
        : null
      const sectorCloses  = sectorDataRes ? buildAlignedCloses(sectorDataRes, assetDates) : null
      const sectorEmaArr  = sectorCloses  ? calcEMA(sectorCloses, Math.max(1, filtrosCfg.sectorEma?.periodo ?? 50)) : null

      // Mapas de visualización
      const vixMap = {}, indiceMap = {}
      if (vixRawData) vixRawData.forEach(d => { vixMap[d.date] = d.close })
      if (indiceDataRes) indiceDataRes.forEach(d => { indiceMap[d.date] = d.close })

      for (let i = 0; i < data.length; i++) {
        const date = data[i].date
        let vixOk = true, indiceOk = true, sectorOk = true

        if (filtrosCfg.vix?.activo) {
          const vc = vixCloses?.[i]
          vixOk = vc == null ? true : vc < (filtrosCfg.vix.umbral ?? 25)
        }
        if (filtrosCfg.indiceEma?.activo) {
          const ic = indiceCloses?.[i], ie = indiceEmaArr?.[i]
          indiceOk = ic == null || ie == null ? true : ic >= ie
        }
        if (filtrosCfg.sectorEma?.activo) {
          const sc = sectorCloses?.[i], se = sectorEmaArr?.[i]
          sectorOk = sc == null || se == null ? true : sc >= se
        }
        filtroActivoMap[date] = vixOk && indiceOk && sectorOk

        // Inyectar en barra para visualización
        data[i].vixClose    = vixMap[date]    ?? null
        data[i].indiceClose = indiceMap[date] ?? null
      }

      // Build filterZones (franjas donde filtroActivo = false)
      let zoneStart = null
      for (const bar of data) {
        const blocked = !filtroActivoMap[bar.date]
        if (blocked && zoneStart === null)        zoneStart = bar.date
        else if (!blocked && zoneStart !== null) { filterZonesFromFiltros.push({ from: zoneStart, to: bar.date }); zoneStart = null }
      }
      if (zoneStart !== null) filterZonesFromFiltros.push({ from: zoneStart, to: data[data.length - 1].date })
    }

    // ── Inyectar sp500Close + filtroActivo en cada barra ──
    data.forEach(d => {
      d.sp500Close    = sp500Map[d.date] ?? null
      d.filtroActivo  = anyFiltroOn ? (filtroActivoMap[d.date] ?? true) : true
    })

    // ── Execute strategy in sandbox ──
    const wrappedCode = `"use strict";\n${codeJs}\nreturn run;`
    const getRunFn = new Function('calcEMA','calcSMA','calcRSI','calcATR','calcMACD', wrappedCode)
    const runFn    = getRunFn(calcEMA, calcSMA, calcRSI, calcATR, calcMACD)
    const userParams = stratParams ? JSON.parse(stratParams) : {}
    const _result = runFn(data, { capital_ini, years, allocation_pct, ...userParams })
    let rawTrades        = _result.trades       ?? []
    const indicators     = _result.indicators   ?? {}
    const rawFilterZones = _result.filterZones  ?? []
    const slopeChanges   = _result.slopeChanges ?? []

    // ── Flush virtual: posición abierta al final del periodo ──
    const lastBar = data[data.length - 1]
    const openPos = _result.openPosition ?? null
    if (openPos && openPos.entryDate && openPos.entryPrice > 0) {
      // Convención nueva: la estrategia expone openPosition explícitamente
      rawTrades.push({
        entryDate:     openPos.entryDate,
        exitDate:      lastBar.date,
        entryPrice:    openPos.entryPrice,
        exitPrice:     lastBar.close,
        stopPx:        openPos.stopPx ?? null,
        exitReason:    'virtual_close',
        _virtualClose: true,
      })
    } else if (rawTrades.length > 0) {
      // Fallback: convención antigua (push sin exitDate en entrada)
      const lastRaw = rawTrades[rawTrades.length - 1]
      if (lastRaw && !lastRaw.exitDate && lastRaw.entryPrice > 0) {
        rawTrades[rawTrades.length - 1] = {
          ...lastRaw,
          exitDate:      lastBar.date,
          exitPrice:     lastBar.close,
          _virtualClose: true,
        }
      }
    }

    // ── Aplicar filtros de mercado ──
    if (anyFiltroOn) {
      const isZeroStrategy = rawTrades.length === 0 && !openPos

      if (isZeroStrategy) {
        // "0 No Strategy": generar trades a partir de transiciones del filtro
        // Señal al cierre de bar[i] → entrada al open de bar[i+1]
        // Salida al cierre de bar[i] cuando el filtro se pone en rojo
        let inPosition = false, entryIdx = -1
        for (let i = 0; i < data.length; i++) {
          const curr = filtroActivoMap[data[i].date] ?? true
          const prev = i === 0 ? false : (filtroActivoMap[data[i - 1].date] ?? true)

          // Transición false→true: entrada al open del día SIGUIENTE
          if (!prev && curr && !inPosition && i + 1 < data.length) {
            inPosition = true
            entryIdx   = i + 1
          }
          // Transición true→false: salida al cierre de este día
          if (prev && !curr && inPosition && entryIdx >= 0) {
            rawTrades.push({
              entryDate:  data[entryIdx].date,
              exitDate:   data[i].date,
              entryPrice: data[entryIdx].open,
              exitPrice:  data[i].close,
              exitReason: 'filter_exit',
            })
            inPosition = false
            entryIdx   = -1
          }
        }
        // Cierre virtual si el periodo termina con filtro verde
        if (inPosition && entryIdx >= 0 && entryIdx < data.length) {
          rawTrades.push({
            entryDate:  data[entryIdx].date,
            exitDate:   lastBar.date,
            entryPrice: data[entryIdx].open,
            exitPrice:  lastBar.close,
            exitReason: 'virtual_close',
            _virtualClose: true,
          })
        }
      } else {
        // Estrategia normal: descartar trades cuya entrada fue bloqueada por el filtro
        rawTrades = rawTrades.filter(t => filtroActivoMap[t.entryDate] !== false)
      }
    }

    // ── Enrich trades ──
    const trades = buildTrades(rawTrades, capital_ini, allocation_pct)

    // ── Inject indicators into chartData bars ──
    const emaRArr      = indicators.emaR       || indicators.emaFast  || null
    const emaLArr      = indicators.emaL       || indicators.emaSlow  || null
    const ema3Arr      = indicators.ema3       || null
    const macdLineArr  = indicators.macdLine   || null
    const signalLineArr= indicators.signalLine || null
    const histogramArr = indicators.histogram  || null
    if (indicators?.ema3) {
      console.log('[EMA3-DEBUG]', {
        ema3Length: indicators.ema3.length,
        sampleValues: indicators.ema3.slice(50, 53)
      })
    }
    const chartData = data.map((d, i) => ({
      ...d,
      emaR:       emaRArr?.[i]       ?? null,
      emaL:       emaLArr?.[i]       ?? null,
      ema3:       ema3Arr?.[i]       ?? null,
      macdLine:   macdLineArr?.[i]   ?? null,
      signalLine: signalLineArr?.[i] ?? null,
      histogram:  histogramArr?.[i]  ?? null,
    }))
    if (indicators?.macdLine) {
      const first3 = chartData.filter(b => b.macdLine != null).slice(0, 3)
        .map(b => ({ date: b.date, macdLine: b.macdLine, signalLine: b.signalLine, histogram: b.histogram }))
      console.log('[MACD-INJECT]', {
        macdLineLength: indicators.macdLine.length,
        barsLength: chartData.length,
        aligned: indicators.macdLine.length === chartData.length,
        first3WithData: first3,
      })
    }

    // ── Summary metrics ──
    const gananciaSimple = trades.reduce((s, t) => s + t.pnlSimple, 0)
    const capitalReinv   = trades.length ? trades[trades.length - 1].capitalTras : capital_ini
    const p0 = data[0].close, pN = data[data.length - 1].close
    const ganBH = capital_ini * (pN / p0 - 1)

    // ── Equity curves (reutiliza sp500Data ya fetchado arriba) ──
    const curves = calcEquityCurves(trades, data, capital_ini, data[0].date, sp500Data)

    return res.status(200).json({
      chartData,
      trades,
      filterZones: anyFiltroOn ? filterZonesFromFiltros : (Array.isArray(rawFilterZones) ? rawFilterZones : []),
      slopeChanges: Array.isArray(slopeChanges) ? slopeChanges : [],
      gananciaSimple,
      capitalReinv,
      ganBH,
      startDate: data[0].date,
      ...curves,
      visuals: stratVisuals ? JSON.parse(stratVisuals) : null,
      meta: { ultimaFecha: data[data.length - 1].date, ultimoPrecio: data[data.length - 1].close, simbolo },
    })
  } catch (e) {
    console.error(`[datos] strategy execution error for ${req.body?.simbolo}:`, e.message, e.stack)
    return res.status(500).json({ error: e.message })
  }

  } catch (e) {
    console.error('[datos] unhandled crash:', e.message, e.stack)
    return res.status(500).json({ error: 'Internal error: ' + e.message })
  }
}
