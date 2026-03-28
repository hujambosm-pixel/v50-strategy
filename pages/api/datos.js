// pages/api/datos.js — Motor V50 v2.5
// Lógica fiel al Pine Script de TradingView V50_17
// Acepta: { simbolo, cfg }        → motor V50 hardcodeado (máxima fidelidad)
//         { simbolo, definition } → motor modular (futuras estrategias)

// ── Indicadores ─────────────────────────────────────────────
function calcEMA(values, period) {
  const k = 2 / (period + 1)
  const res = new Array(values.length).fill(null)
  let ema = null
  for (let i = 0; i < values.length; i++) {
    if (values[i] == null) continue
    ema = ema === null ? values[i] : values[i] * k + ema * (1 - k)
    res[i] = ema
  }
  return res
}

function calcATR(highs, lows, closes, period) {
  const tr = closes.map((_, i) => {
    if (i === 0) return highs[i] - lows[i]
    return Math.max(highs[i]-lows[i], Math.abs(highs[i]-closes[i-1]), Math.abs(lows[i]-closes[i-1]))
  })
  return calcEMA(tr, period)
}

function stooqSym(symbol) {
  const MAP={
    '^GSPC':'spy.us','^NDX':'ndx.us','^IBEX':'ibex.es','^GDAXI':'dax.de',
    '^FTSE':'ftse.uk','^N225':'n225.jp','BTC-USD':'btc-usd.v','ETH-USD':'eth-usd.v',
    'GC=F':'gc.f','CL=F':'cl.f',
    '^IXIC':'ndx.us','^DJI':'dji.us','^FCHI':'cac.fr','^STOXX50E':'sx5e.de','^HSI':'hsi.hk',
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
async function fetchAV(symbol) {
  const sym = stooqSym(symbol)
  const url = `https://stooq.com/q/d/l/?s=${sym}&i=d`
  const res = await fetch(url)
  const text = await res.text()
  if (!text || text.includes('No data') || text.trim().length < 50) throw new Error(`Sin datos para ${symbol}`)
  return text.trim().split('\n').slice(1).filter(l=>l.trim()).map(l=>{
    const [date,open,high,low,close,volume] = l.split(',')
    return { date, open:parseFloat(open), high:parseFloat(high), low:parseFloat(low), close:parseFloat(close), volume:parseFloat(volume)||0 }
  }).filter(d=>d.close&&!isNaN(d.close)).sort((a,b)=>a.date.localeCompare(b.date))
}

// ── Motor V50 — fiel al Pine Script ─────────────────────────
// Reproduce exactamente la lógica de TradingView V50_17
function runBacktestV50(data, sp500Data, cfg) {
  const { emaR, emaL, capitalIni, tipoStop, atrPeriod, atrMult,
          sinPerdidas, reentry, tipoFiltro, sp500EmaR, sp500EmaL, years } = cfg

  const closes = data.map(d=>d.close)
  const highs   = data.map(d=>d.high)
  const lows    = data.map(d=>d.low)

  const emaRArr = calcEMA(closes, emaR)
  const emaLArr = calcEMA(closes, emaL)
  const atrArr  = tipoStop === 'atr' ? calcATR(highs, lows, closes, atrPeriod) : null

  // Filtro SP500
  let filtroArr = new Array(data.length).fill(false)
  if (sp500Data && tipoFiltro !== 'none') {
    const sp500Closes = data.map(d=>{ const m=sp500Data.find(s=>s.date===d.date); return m?m.close:null })
    let last=null; for(let i=0;i<sp500Closes.length;i++){if(sp500Closes[i]!=null)last=sp500Closes[i];else sp500Closes[i]=last}
    const spEmaR=calcEMA(sp500Closes,sp500EmaR), spEmaL=calcEMA(sp500Closes,sp500EmaL)
    filtroArr = data.map((_,i)=>{
      if(sp500Closes[i]==null||spEmaR[i]==null) return false
      if(tipoFiltro==='precio_ema') return sp500Closes[i]<spEmaR[i]
      if(tipoFiltro==='ema_ema')   return spEmaR[i]<spEmaL[i]
      return false
    })
  }

  const lastDate = new Date(data[data.length-1].date)
  const startDate = new Date(lastDate)
  startDate.setFullYear(startDate.getFullYear() - years)
  const inWindow = (i) => new Date(data[i].date) >= startDate

  // Estado — espejo de las variables Pine Script
  let inPos          = false
  let entradaPend    = false
  let bkEntrada      = 0
  let salidaPend     = false
  let bkSalida       = 0
  let stopNivel      = null    // fijado en vela de setup, NO se actualiza al hacer rolling
  let sinPerdAct     = false
  let reentryMode    = false
  let reentryPend    = false
  let precioEntrada  = null
  let entryIdx       = null

  let capitalReinv   = capitalIni
  let gananciaSimple = 0
  const trades       = []

  const chartData = data.map((d,i)=>({
    ...d,
    emaR: emaRArr[i],
    emaL: emaLArr[i],
    filtro: filtroArr[i],
    signal: null, breakoutLine: null, stopLine: null,
  }))

  const doExit = (i, px, tipo) => {
    const pnl = (px - precioEntrada) / precioEntrada
    gananciaSimple += pnl * capitalIni
    capitalReinv   += pnl * capitalReinv
    trades.push(makeTrade(data[entryIdx].date, data[i].date, precioEntrada, px, pnl, capitalReinv, capitalIni, tipo, stopNivel))
    chartData[i].signal = 'exit'
    inPos=false; precioEntrada=null; entryIdx=null
    salidaPend=false; sinPerdAct=false; stopNivel=null; bkSalida=0
  }

  for (let i=1; i<data.length; i++) {
    const bar  = data[i]
    const prev = data[i-1]
    const er   = emaRArr[i],   el  = emaLArr[i]
    const erp  = emaRArr[i-1], elp = emaLArr[i-1]
    const filt = filtroArr[i]
    const inW  = inWindow(i)

    if (er == null || el == null) continue

    // ── Señales (equivalentes Pine Script) ──────────────────
    // cruce_alcista = ta.crossover(ema_rapida, ema_lenta)
    const cruceAlc  = erp != null && erp < elp && er >= el
    // cruce_bajista = ta.crossunder(ema_rapida, ema_lenta)
    const cruceBaj  = erp != null && erp > elp && er <= el
    // cierre_bajo_ema_rapida = ta.crossunder(close, ema_rapida)
    const cierreBaj = prev.close >= erp && bar.close < er
    // cierre_sobre_ema_rapida = ta.crossover(close, ema_rapida)
    const cierreAlc = prev.close <= erp && bar.close > er
    // ema_rapida_sobre_lenta
    const emaAlcista = er > el

    // Pine: if cruce_bajista and modo_reentry → resetear reentry
    if (cruceBaj && reentry) {
      reentryMode = false
      reentryPend = false
    }

    // ════════════════════════════════════════════════════════
    // EN POSICIÓN
    // ════════════════════════════════════════════════════════
    if (inPos) {
      // 1. STOP EMERGENCIA — solo si sinPerdidas activo
      //    Pine: if modo_sin_perdidas and cruce_bajista and position > 0
      if (sinPerdidas && cruceBaj) {
        doExit(i, bar.open, 'Stop Emergencia')
        if (reentry && emaAlcista) reentryMode = true
        continue
      }

      // 2. STOP HIT — if gap-down opens below stop, use open (realistic fill)
      if (stopNivel != null && bar.low <= stopNivel) {
        const fillPx = bar.open <= stopNivel ? bar.open : stopNivel
        doExit(i, fillPx, 'Stop')
        if (reentry && emaAlcista) reentryMode = true
        continue
      }

      // 3. SALIDA PENDIENTE — breakout del mínimo
      if (salidaPend && bkSalida > 0) {
        if (sinPerdidas) {
          // Pine: low_por_encima_breakeven = low > precio_entrada_ejecutado
          //       activar/desactivar salida_sin_perdidas_activa
          const lowSobreEntry = bar.low > precioEntrada
          if (lowSobreEntry && !sinPerdAct)    sinPerdAct = true
          if (!lowSobreEntry && sinPerdAct)    sinPerdAct = false
          if (sinPerdAct && bar.low <= bkSalida) {
            const fillPx = bar.open <= bkSalida ? bar.open : bkSalida
            doExit(i, fillPx, 'Exit')
            if (reentry && emaAlcista) reentryMode = true
            continue
          }
        } else {
          if (bar.low <= bkSalida) {
            const fillPx = bar.open <= bkSalida ? bar.open : bkSalida
            doExit(i, fillPx, 'Exit')
            if (reentry && emaAlcista) reentryMode = true
            continue
          }
        }
      }

      // 4. NUEVA SEÑAL DE SALIDA — cierre_bajo_ema_rapida (crossunder)
      //    Pine siempre actualiza precio_breakout_salida y cancela stops.
      //    Removemos !salidaPend para actualizar bkSalida en nuevos cruces.
      if (cierreBaj) {
        bkSalida  = bar.low
        stopNivel = null  // cancela stop loss técnico/ATR
        if (sinPerdidas) {
          // sinPerdidas: solo colocar orden de salida si low > precio de entrada
          // (si low < entry, la salida queda suspendida hasta recuperar entry)
          sinPerdAct = bar.low > precioEntrada
          salidaPend = sinPerdAct  // solo pendiente si low sobre entry
        } else {
          salidaPend = true
          sinPerdAct = false  // !sinPerdidas: siempre salir, sin condición extra
        }
      }

      if (stopNivel != null) chartData[i].stopLine = stopNivel
      continue
    }

    // ════════════════════════════════════════════════════════
    // FUERA DE POSICIÓN
    // ════════════════════════════════════════════════════════
    if (!inW) continue

    // Cancelar entrada si filtro activo
    if (entradaPend && filt && !reentryPend) {
      entradaPend = false; bkEntrada = 0; stopNivel = null; continue
    }
    if (reentryPend && filt) {
      entradaPend = false; reentryPend = false; bkEntrada = 0; stopNivel = null; continue
    }

    // ── Ejecutar entrada pendiente ──────────────────────────
    if (entradaPend) {
      // ── Rolling breakout (fiel a TV) ──────────────────────
      // TV coloca un stop-order en el nivel. Si el high de esta vela
      // supera el nivel ANTERIOR → entrada. Si no → baja el nivel al
      // high de esta vela para la siguiente vela.
      // CRÍTICO: comprobar breakout con el nivel PREVIO antes de actualizarlo.
      const prevBk = bkEntrada

      if (bar.high >= prevBk) {
        // ✅ Breakout conseguido — entrada al nivel previo
        precioEntrada = prevBk
        entryIdx      = i
        inPos=true; entradaPend=false; reentryPend=false; salidaPend=false; sinPerdAct=false; reentryMode=false
        chartData[i].signal = 'entry'
        if (tipoStop === 'atr' && atrArr?.[i]) {
          stopNivel = precioEntrada - atrArr[i] * atrMult
        }
        if (tipoStop === 'none') stopNivel = null
        if (stopNivel != null) chartData[i].stopLine = stopNivel
        continue
      }

      // ❌ No breakout — rolling: bajar nivel al high de esta vela
      // Stop NO se recalcula (fijado en vela de setup)
      if (bar.high < prevBk) bkEntrada = bar.high
      chartData[i].breakoutLine = bkEntrada

      // Abort — Pine: if cierre_bajo_ema_rapida and entrada_pendiente and not reentry_mode_activo
      if (cierreBaj && !reentryPend) {
        entradaPend = false; bkEntrada = 0; stopNivel = null
      }
      continue
    }

    // ── SETUP — cruce alcista de EMAs ────────────────────────
    // Pine: if cruce_alcista and position==0 and backtestWindow and not reentry_mode and not filtro
    if (cruceAlc && !reentryMode && !filt) {
      entradaPend = true
      reentryPend = false
      bkEntrada   = bar.high
      // Stop técnico fijado aquí — Pine: nivel_stop_tecnico := math.min(ema_rapida, low)
      if (tipoStop === 'tecnico') stopNivel = Math.min(er, bar.low)
      else stopNivel = null
      chartData[i].breakoutLine = bkEntrada
    }

    // ── REENTRY — setup ─────────────────────────────────────
    // Pine: if modo_reentry and reentry_mode_activo and position==0
    //            and ema_rapida_sobre_lenta and cierre_sobre_ema_rapida and not entrada_pendiente
    if (reentry && reentryMode && !entradaPend && emaAlcista && !filt && cierreAlc) {
      entradaPend = true
      reentryPend = true
      bkEntrada   = bar.high
      if (tipoStop === 'tecnico') stopNivel = Math.min(er, bar.low)
      else stopNivel = null
      chartData[i].breakoutLine = bkEntrada
    }
  }

  return { chartData, trades, capitalReinv, gananciaSimple, startDate }
}

function makeTrade(entryDate,exitDate,entryPx,exitPx,pnl,capitalReinv,capitalIni,tipo,stopPx=null){
  return {
    entryDate, exitDate, entryPx, exitPx,
    pnlPct: pnl*100,
    pnlSimple: pnl*capitalIni,
    capitalTras: capitalReinv,
    dias: Math.round((new Date(exitDate)-new Date(entryDate))/86400000),
    tipo, stopPx
  }
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
    const data = await fetchAV(simbolo)
    if (!data||!data.length) return res.status(404).json({error:`Sin datos para "${simbolo}"`})
    let sp500Data=null; try { sp500Data=await fetchAV('^GSPC') } catch(_) {}

    let cfgFinal = cfg

    // Si viene definition, convertir a cfg para usar el motor V50 fiel
    if (!cfgFinal && definition) {
      const entry = definition.entry || {}
      const stop  = definition.stop  || {}
      const mgmt  = definition.management || {}
      const filt  = definition.filters?.market?.[0] || {}
      cfgFinal = {
        emaR:        entry.ma_fast   || 10,
        emaL:        entry.ma_slow   || 11,
        capitalIni:  definition.capitalIni || 10000,
        years:       definition.years      || 5,
        tipoStop:    stop.type === 'atr_based' ? 'atr' : stop.type === 'none' ? 'none' : 'tecnico',
        atrPeriod:   stop.atr_period || 14,
        atrMult:     stop.atr_mult   || 1.0,
        sinPerdidas: mgmt.sin_perdidas !== false,
        reentry:     mgmt.reentry     !== false,
        tipoFiltro:  filt.condition   || 'none',
        sp500EmaR:   filt.ma_fast     || 10,
        sp500EmaL:   filt.ma_slow     || 11,
      }
    }

    if (!cfgFinal) return res.status(400).json({error:'Se requiere cfg o definition'})

    const { chartData, trades, capitalReinv, gananciaSimple, startDate } =
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
      meta: {
        simbolo,
        ultimaFecha:  data[data.length-1].date,
        ultimoPrecio: data[data.length-1].close,
        totalBars:    data.length,
        emaRPeriod:   cfgFinal.emaR,
        emaLPeriod:   cfgFinal.emaL,
      }
    })
  } catch(err) {
    console.error(err)
    res.status(500).json({error:err.message||'Error interno'})
  }
}
