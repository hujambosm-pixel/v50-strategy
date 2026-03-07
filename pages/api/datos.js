// pages/api/datos.js — Motor modular de estrategias V2.5
// Acepta: { simbolo, cfg }       → convierte cfg a definition (compat V50)
//         { simbolo, definition } → usa definition directamente

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

function calcSMA(values, period) {
  const res = new Array(values.length).fill(null)
  for (let i = period - 1; i < values.length; i++) {
    let s = 0, n = 0
    for (let j = i - period + 1; j <= i; j++) { if (values[j] != null) { s += values[j]; n++ } }
    if (n === period) res[i] = s / period
  }
  return res
}

function calcMA(values, period, type = 'EMA') {
  return type === 'SMA' ? calcSMA(values, period) : calcEMA(values, period)
}

function calcATR(highs, lows, closes, period) {
  const tr = closes.map((_, i) => {
    if (i === 0) return highs[i] - lows[i]
    return Math.max(highs[i]-lows[i], Math.abs(highs[i]-closes[i-1]), Math.abs(lows[i]-closes[i-1]))
  })
  return calcEMA(tr, period)
}

function calcRSI(closes, period) {
  const res = new Array(closes.length).fill(null)
  if (closes.length < period + 1) return res
  let ag = 0, al = 0
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i-1]
    if (d > 0) ag += d; else al -= d
  }
  ag /= period; al /= period
  res[period] = al === 0 ? 100 : 100 - 100 / (1 + ag / al)
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i-1]
    ag = (ag * (period-1) + Math.max(d,0)) / period
    al = (al * (period-1) + Math.max(-d,0)) / period
    res[i] = al === 0 ? 100 : 100 - 100 / (1 + ag / al)
  }
  return res
}

async function fetchAV(symbol) {
  const sym = symbol === '^GSPC' ? 'spy' : symbol.replace('^','').toLowerCase()
  const url = `https://stooq.com/q/d/l/?s=${sym}.us&i=d`
  const res = await fetch(url)
  const text = await res.text()
  if (!text || text.includes('No data') || text.trim().length < 50) throw new Error(`Sin datos para ${symbol}`)
  return text.trim().split('\n').slice(1).filter(l=>l.trim()).map(l=>{
    const [date,open,high,low,close,volume] = l.split(',')
    return { date, open:parseFloat(open), high:parseFloat(high), low:parseFloat(low), close:parseFloat(close), volume:parseFloat(volume)||0 }
  }).filter(d=>d.close&&!isNaN(d.close)).sort((a,b)=>a.date.localeCompare(b.date))
}

// ── cfg legacy → definition ──────────────────────────────────
function cfgToDefinition(cfg) {
  return {
    entry: { type:'breakout_high_above_ma', ma_type:'EMA', ma_fast:cfg.emaR, ma_slow:cfg.emaL },
    exit:  { type:'breakout_low_below_ma',  ma_type:'EMA', ma_period:cfg.emaR },
    stop:  cfg.tipoStop === 'atr'  ? { type:'atr_based', atr_period:cfg.atrPeriod, atr_mult:cfg.atrMult }
         : cfg.tipoStop === 'none' ? { type:'none' }
         : { type:'below_ma_at_signal', ma_type:'EMA', ma_period:cfg.emaR },
    management: { sin_perdidas:cfg.sinPerdidas, reentry:cfg.reentry },
    filters: {
      market: cfg.tipoFiltro !== 'none' ? [{
        type:'external_ma', condition:cfg.tipoFiltro,
        ma_type:'EMA', ma_fast:cfg.sp500EmaR, ma_slow:cfg.sp500EmaL,
      }] : [],
      signal: [{ type:'breakout_rolling', max_candles:null }],
    },
    years: cfg.years,
    capitalIni: cfg.capitalIni,
  }
}

// ── Construir todos los indicadores que necesita la definition ─
function buildIndicators(data, sp500Data, def) {
  const closes = data.map(d=>d.close)
  const highs   = data.map(d=>d.high)
  const lows    = data.map(d=>d.low)
  const ind = {}

  const addMA = (type, period) => {
    const k = `${type}_${period}`
    if (!ind[k]) ind[k] = calcMA(closes, period, type)
    return k
  }
  const addRSI = (period) => {
    const k = `RSI_${period}`
    if (!ind[k]) ind[k] = calcRSI(closes, period)
    return k
  }
  const addATR = (period) => {
    const k = `ATR_${period}`
    if (!ind[k]) ind[k] = calcATR(highs, lows, closes, period)
    return k
  }

  const e = def.entry
  if (['breakout_high_above_ma','next_open_after_cross'].includes(e.type)) {
    addMA(e.ma_type||'EMA', e.ma_fast); addMA(e.ma_type||'EMA', e.ma_slow)
  }
  if (e.type === 'next_open_above_ma') addMA(e.ma_type||'EMA', e.ma_period)
  if (e.type === 'rsi_level') addRSI(e.rsi_period||14)

  const x = def.exit
  if (['breakout_low_below_ma','next_open_below_ma'].includes(x.type)) addMA(x.ma_type||'EMA', x.ma_period)
  if (x.type === 'next_open_after_bearish_cross') { addMA(x.ma_type||'EMA', x.ma_fast); addMA(x.ma_type||'EMA', x.ma_slow) }
  if (x.type === 'rsi_level') addRSI(x.rsi_period||14)

  const s = def.stop
  if (s.type === 'below_ma_at_signal') addMA(s.ma_type||'EMA', s.ma_period)
  if (s.type === 'atr_based') addATR(s.atr_period||14)

  // Filtros de mercado externos
  for (const f of def.filters?.market || []) {
    if (f.type === 'external_ma' && sp500Data) {
      const spC = data.map(d=>{ const m=sp500Data.find(s=>s.date===d.date); return m?m.close:null })
      let last=null; for(let i=0;i<spC.length;i++){if(spC[i]!=null)last=spC[i];else spC[i]=last}
      ind['EXT_CLOSE'] = spC
      const t = f.ma_type||'EMA'
      if (f.ma_fast) { ind[`EXT_${t}_${f.ma_fast}`]=calcMA(spC,f.ma_fast,t) }
      if (f.ma_slow) { ind[`EXT_${t}_${f.ma_slow}`]=calcMA(spC,f.ma_slow,t) }
      // also period-based for simple filters
      if (f.ma_period) { ind[`EXT_${t}_${f.ma_period}`]=calcMA(spC,f.ma_period,t) }
    }
    if (f.type === 'own_ma') addMA(f.ma_type||'SMA', f.ma_period)
  }

  return ind
}

// ── Aplicar filtros de mercado → devuelve true si BLOQUEADO ──
function applyMarketFilters(market, i, ind) {
  for (const f of market) {
    if (f.type === 'external_ma') {
      const t = f.ma_type||'EMA'
      if (f.condition === 'precio_ema') {
        const sp = ind['EXT_CLOSE']?.[i], ma = ind[`EXT_${t}_${f.ma_fast||f.ma_period}`]?.[i]
        if (sp != null && ma != null && sp < ma) return true
      }
      if (f.condition === 'ema_ema') {
        const maF = ind[`EXT_${t}_${f.ma_fast}`]?.[i], maS = ind[`EXT_${t}_${f.ma_slow}`]?.[i]
        if (maF != null && maS != null && maF < maS) return true
      }
    }
    if (f.type === 'own_ma') {
      const k = `${f.ma_type||'SMA'}_${f.ma_period}`
      const close = ind['CLOSE']?.[i], ma = ind[k]?.[i]  // CLOSE added below if needed
      if (close != null && ma != null) {
        if (f.condition === 'price_below' && close < ma) return true
        if (f.condition === 'price_above' && close > ma) return true
      }
    }
  }
  return false
}

// ── Señal de entrada ─────────────────────────────────────────
// Retorna null | { mode:'breakout'|'next_open', level }
function checkEntrySignal(entry, i, data, ind) {
  const bar = data[i], prev = data[i-1]
  switch (entry.type) {
    case 'breakout_high_above_ma': {
      const t=entry.ma_type||'EMA'
      const erp=ind[`${t}_${entry.ma_fast}`]?.[i-1], elp=ind[`${t}_${entry.ma_slow}`]?.[i-1]
      const er =ind[`${t}_${entry.ma_fast}`]?.[i],   el =ind[`${t}_${entry.ma_slow}`]?.[i]
      if (erp==null||er==null||el==null) return null
      if (erp<elp && er>=el) return { mode:'breakout', level:bar.high }
      return null
    }
    case 'next_open_above_ma': {
      const k=`${entry.ma_type||'EMA'}_${entry.ma_period}`
      const mp=ind[k]?.[i-1], mc=ind[k]?.[i]
      if (mp==null||mc==null) return null
      if (prev.close<mp && bar.close>=mc) return { mode:'next_open', level:null }
      return null
    }
    case 'next_open_after_cross': {
      const t=entry.ma_type||'EMA'
      const erp=ind[`${t}_${entry.ma_fast}`]?.[i-1], elp=ind[`${t}_${entry.ma_slow}`]?.[i-1]
      const er =ind[`${t}_${entry.ma_fast}`]?.[i],   el =ind[`${t}_${entry.ma_slow}`]?.[i]
      if (erp==null||er==null) return null
      if (erp<elp && er>=el) return { mode:'next_open', level:null }
      return null
    }
    case 'pullback_pct_from_high': {
      const pct = entry.pct||5, lb = entry.lookback||20
      const slc = data.slice(Math.max(0,i-lb), i+1)
      const rHigh = Math.max(...slc.map(d=>d.high))
      const threshold = rHigh * (1 - pct/100)
      if (prev.close>threshold && bar.close<=threshold) return { mode:'next_open', level:null }
      return null
    }
    case 'rsi_level': {
      const k=`RSI_${entry.rsi_period||14}`
      const rp=ind[k]?.[i-1], rc=ind[k]?.[i], lvl=entry.rsi_level||30
      if (rp==null||rc==null) return null
      // Cross below threshold (oversold entry)
      if (rp>=lvl && rc<lvl) return { mode:'next_open', level:null }
      return null
    }
    default: return null
  }
}

// ── Señal de reentrada (cuando reentryMode está activo) ───────
function checkReentrySignal(entry, i, data, ind) {
  const bar = data[i], prev = data[i-1]
  // Para tipos basados en cruce: reentrada cuando precio supera la EMA rápida
  // mientras las EMAs siguen alcistas (fast > slow)
  if (['breakout_high_above_ma','next_open_after_cross'].includes(entry.type)) {
    const t=entry.ma_type||'EMA'
    const maF=`${t}_${entry.ma_fast}`, maS=`${t}_${entry.ma_slow}`
    const er=ind[maF]?.[i], el=ind[maS]?.[i], erp=ind[maF]?.[i-1]
    if (er==null||el==null||erp==null) return null
    // EMAs alcistas + cierre alcista de la EMA rápida
    if (er>el && prev.close<=erp && bar.close>er) return { mode:'breakout', level:bar.high }
    return null
  }
  // Para otros tipos, reusar la señal normal de entrada
  return checkEntrySignal(entry, i, data, ind)
}

// ── Cancelar entrada pendiente ────────────────────────────────
function checkEntryCancelSignal(entry, i, data, ind) {
  if (['breakout_high_above_ma'].includes(entry.type)) {
    const t=entry.ma_type||'EMA'
    const erp=ind[`${t}_${entry.ma_fast}`]?.[i-1], elp=ind[`${t}_${entry.ma_slow}`]?.[i-1]
    const er =ind[`${t}_${entry.ma_fast}`]?.[i],   el =ind[`${t}_${entry.ma_slow}`]?.[i]
    // Cruce bajista cancela la entrada
    if (erp!=null && er!=null && erp>elp && er<=el) return true
  }
  return false
}

// ── Señal de salida ────────────────────────────────────────────
// Retorna null | { mode:'breakout'|'next_open', level }
function checkExitSignal(exitDef, i, data, ind) {
  const bar = data[i], prev = data[i-1]
  switch (exitDef.type) {
    case 'breakout_low_below_ma': {
      const k=`${exitDef.ma_type||'EMA'}_${exitDef.ma_period}`
      const mp=ind[k]?.[i-1], mc=ind[k]?.[i]
      if (mp==null) return null
      if (prev.close>=mp && bar.close<mc) return { mode:'breakout', level:bar.low }
      return null
    }
    case 'next_open_below_ma': {
      const k=`${exitDef.ma_type||'EMA'}_${exitDef.ma_period}`
      const mp=ind[k]?.[i-1], mc=ind[k]?.[i]
      if (mp==null) return null
      if (prev.close>=mp && bar.close<mc) return { mode:'next_open', level:null }
      return null
    }
    case 'next_open_after_bearish_cross': {
      const t=exitDef.ma_type||'EMA'
      const erp=ind[`${t}_${exitDef.ma_fast}`]?.[i-1], elp=ind[`${t}_${exitDef.ma_slow}`]?.[i-1]
      const er =ind[`${t}_${exitDef.ma_fast}`]?.[i],   el =ind[`${t}_${exitDef.ma_slow}`]?.[i]
      if (erp==null||er==null) return null
      if (erp>elp && er<=el) return { mode:'next_open', level:null }
      return null
    }
    case 'rsi_level': {
      const k=`RSI_${exitDef.rsi_period||14}`
      const rp=ind[k]?.[i-1], rc=ind[k]?.[i], lvl=exitDef.rsi_level||70
      if (rp==null||rc==null) return null
      // Cross above threshold (overbought exit)
      if (rp<=lvl && rc>lvl) return { mode:'next_open', level:null }
      return null
    }
    default: return null
  }
}

// ── Salida de emergencia (cruce bajista con posición abierta) ─
function checkEmergencyExit(exitDef, entry, i, data, ind) {
  // Si el tipo de entrada o salida involucra cruce de EMAs,
  // un cruce bajista estando en posición es salida de emergencia al open
  const hasEMACross = ['breakout_high_above_ma','next_open_after_cross'].includes(entry.type)
                   || ['next_open_after_bearish_cross'].includes(exitDef.type)
  if (!hasEMACross) return false
  const t = entry.ma_type || exitDef.ma_type || 'EMA'
  const fP = entry.ma_fast || exitDef.ma_fast
  const sP = entry.ma_slow || exitDef.ma_slow
  if (!fP || !sP) return false
  const erp=ind[`${t}_${fP}`]?.[i-1], elp=ind[`${t}_${sP}`]?.[i-1]
  const er =ind[`${t}_${fP}`]?.[i],   el =ind[`${t}_${sP}`]?.[i]
  if (erp==null||er==null) return false
  return erp>elp && er<=el  // cruce bajista
}

// ── Motor principal ───────────────────────────────────────────
function runBacktest(data, sp500Data, cfg, definition = null) {
  const def = definition || cfgToDefinition(cfg)
  const { entry, exit:exitDef, stop, management, filters } = def
  const capIni = def.capitalIni || cfg?.capitalIni || 10000
  const years  = def.years      || cfg?.years      || 5

  const ind = buildIndicators(data, sp500Data, def)

  const lastDate = new Date(data[data.length-1].date)
  const startDate = new Date(lastDate)
  startDate.setFullYear(startDate.getFullYear() - years)

  const inWindow = (i) => new Date(data[i].date) >= startDate
  const market = filters?.market || []
  const sigFilters = filters?.signal || []
  const hasRolling = sigFilters.some(f=>f.type==='breakout_rolling')
  const maxCandlesWait = sigFilters.find(f=>f.type==='max_candles_waiting')?.max_candles || null

  // Claves de los MAs de entrada (para chartData)
  const t = entry.ma_type||'EMA'
  const emaRKey = entry.ma_fast  ? `${t}_${entry.ma_fast}`
                : entry.ma_period ? `${t}_${entry.ma_period}` : null
  const emaLKey = entry.ma_slow  ? `${t}_${entry.ma_slow}` : null

  // Estado de la máquina
  let inPos=false, entryPend=false, exitPend=false
  let reentryMode=false, reentryPend=false
  let entryPx=null, entryIdx=null, signalIdx=null
  let stopLevel=null, exitBkLevel=null, bkLevel=null
  let sinPerdAct=false, entryMode=null, exitMode=null
  let candlesWaiting=0

  let capitalReinv=capIni, gananciaSimple=0
  const trades = []

  const chartData = data.map((d,i)=>({
    ...d,
    emaR: emaRKey ? ind[emaRKey]?.[i] ?? null : null,
    emaL: emaLKey ? ind[emaLKey]?.[i] ?? null : null,
    filtro: false, signal: null, breakoutLine: null, stopLine: null,
  }))

  // Cierra un trade y resetea estado
  const doExit = (i, px, tipo) => {
    const pnl = (px - entryPx) / entryPx
    gananciaSimple += pnl * capIni
    capitalReinv   += pnl * capitalReinv
    trades.push(makeTrade(data[entryIdx].date, data[i].date, entryPx, px, pnl, capitalReinv, capIni, tipo))
    chartData[i].signal = 'exit'
    inPos=false; entryPx=entryIdx=signalIdx=stopLevel=exitBkLevel=null
    exitPend=false; sinPerdAct=false; exitMode=null
  }

  // Abre un trade
  const doEntry = (i, px) => {
    entryPx=px; entryIdx=i; inPos=true
    entryPend=false; reentryPend=false; reentryMode=false
    exitPend=false; exitBkLevel=null; sinPerdAct=false; exitMode=null
    // Stop según tipo que necesita precio de entrada
    if (stop.type==='low_of_entry_candle') stopLevel = data[i].low
    else if (stop.type==='atr_based') {
      const atr = ind[`ATR_${stop.atr_period||14}`]?.[i]
      stopLevel = atr ? px - atr*(stop.atr_mult||1) : null
    }
    else if (stop.type==='low_of_signal_candle') {
      stopLevel = signalIdx!=null ? data[signalIdx].low : data[i].low
    }
    else if (stop.type==='none') stopLevel = null
    // below_ma_at_signal ya se calculó durante la fase de breakout
    chartData[i].signal = 'entry'
  }

  // ── Bucle principal ──────────────────────────────────────────
  for (let i=1; i<data.length; i++) {
    const bar=data[i], prev=data[i-1]
    const inW = inWindow(i)
    const blocked = applyMarketFilters(market, i, ind)
    chartData[i].filtro = blocked

    // ═══ EN POSICIÓN ═══════════════════════════════════════════
    if (inPos) {
      // 1. Salida de emergencia por cruce bajista
      if (checkEmergencyExit(exitDef, entry, i, data, ind)) {
        doExit(i, bar.open, 'Stop Emergencia')
        const eFast=`${t}_${entry.ma_fast||entry.ma_period}`
        const eSlow=entry.ma_slow ? `${t}_${entry.ma_slow}` : null
        if (management.reentry && (!eSlow || ind[eFast]?.[i]>ind[eSlow]?.[i])) reentryMode=true
        continue
      }

      // 2. Stop hit
      if (stopLevel!=null && bar.low<=stopLevel) {
        doExit(i, stopLevel, 'Stop')
        const eFast=`${t}_${entry.ma_fast||entry.ma_period}`
        const eSlow=entry.ma_slow ? `${t}_${entry.ma_slow}` : null
        if (management.reentry && (!eSlow || ind[eFast]?.[i]>ind[eSlow]?.[i])) reentryMode=true
        continue
      }

      // 3. Salida pendiente — modo next_open
      if (exitPend && exitMode==='next_open') {
        doExit(i, bar.open, 'Exit')
        if (management.reentry) reentryMode=true
        continue
      }

      // 4. Salida pendiente — modo breakout
      if (exitPend && exitMode==='breakout' && exitBkLevel!=null) {
        // Actualizar nivel en breakout_low_below_ma (siguen los cierres bajo EMA)
        if (exitDef.type==='breakout_low_below_ma') {
          const k=`${exitDef.ma_type||'EMA'}_${exitDef.ma_period}`
          if (bar.close < (ind[k]?.[i]??Infinity)) exitBkLevel = bar.low
        }
        sinPerdAct = management.sin_perdidas ? bar.low>entryPx : true
        if (sinPerdAct && bar.low<=exitBkLevel) {
          doExit(i, exitBkLevel, 'Exit')
          if (management.reentry) reentryMode=true
          continue
        }
      }

      // 5. Nueva señal de salida
      if (!exitPend) {
        const sig = checkExitSignal(exitDef, i, data, ind)
        if (sig) { exitPend=true; exitMode=sig.mode; exitBkLevel=sig.level }
      }

      // 6. Sin pérdidas — mover stop a entrada cuando hay beneficio
      if (management.sin_perdidas && stopLevel!=null && stopLevel<entryPx && bar.low>entryPx) {
        stopLevel = entryPx
      }

      if (stopLevel!=null) chartData[i].stopLine = stopLevel
      continue
    }

    // ═══ FUERA DE POSICIÓN ═══════════════════════════════════════
    if (!inW) continue

    // Cancelar entrada pendiente si hay filtro activo
    if (entryPend && blocked) {
      entryPend=false; reentryPend=false; bkLevel=null; stopLevel=null
      continue
    }

    // ── Ejecutar entrada pendiente ─────────────────────────────
    if (entryPend) {
      candlesWaiting++

      if (maxCandlesWait!=null && candlesWaiting>maxCandlesWait) {
        entryPend=false; reentryPend=false; bkLevel=null; stopLevel=null
        continue
      }

      if (entryMode==='next_open') {
        doEntry(i, bar.open)
        continue
      }

      if (entryMode==='breakout') {
        // Rolling: ajustar breakout al nuevo máximo
        if (hasRolling && bar.high<bkLevel) {
          bkLevel = bar.high
          if (stop.type==='below_ma_at_signal') {
            const k=`${stop.ma_type||'EMA'}_${stop.ma_period}`
            stopLevel = Math.min(ind[k]?.[i]??Infinity, bar.low)
          }
        }
        chartData[i].breakoutLine = bkLevel

        if (bar.high>=bkLevel) {
          doEntry(i, bkLevel)
          continue
        }

        // Cancelar si cruce bajista (solo entrada normal, no reentry)
        if (!reentryPend && checkEntryCancelSignal(entry, i, data, ind)) {
          entryPend=false; bkLevel=null; stopLevel=null
        }
        continue
      }
    }

    // ── Detectar nueva señal de entrada ───────────────────────
    if (!blocked) {
      let sig = null

      if (reentryMode && !reentryPend) {
        sig = checkReentrySignal(entry, i, data, ind)
        if (sig) reentryPend=true
      } else if (!reentryMode && !entryPend) {
        sig = checkEntrySignal(entry, i, data, ind)
      }

      if (sig) {
        entryPend=true; entryMode=sig.mode; signalIdx=i; candlesWaiting=0
        if (sig.mode==='breakout') {
          bkLevel = sig.level
          if (stop.type==='below_ma_at_signal') {
            const k=`${stop.ma_type||'EMA'}_${stop.ma_period}`
            stopLevel = Math.min(ind[k]?.[i]??Infinity, bar.low)
          }
          chartData[i].breakoutLine = bkLevel
        } else {
          bkLevel = null
          // Stop se calculará en doEntry para tipos que dependen de la vela de entrada
        }
      }
    }

    // Cancelar entrada breakout normal si cruce bajista (fuera de reentry)
    if (entryPend && !reentryPend && entryMode==='breakout') {
      if (checkEntryCancelSignal(entry, i, data, ind)) {
        entryPend=false; bkLevel=null; stopLevel=null
      }
    }
  }

  return { chartData, trades, capitalReinv, gananciaSimple, startDate,
    meta: { emaRPeriod: entry.ma_fast||entry.ma_period, emaLPeriod: entry.ma_slow } }
}

function makeTrade(entryDate,exitDate,entryPx,exitPx,pnl,capitalReinv,capitalIni,tipo){
  return {entryDate,exitDate,entryPx,exitPx,pnlPct:pnl*100,pnlSimple:pnl*capitalIni,capitalTras:capitalReinv,
    dias:Math.round((new Date(exitDate)-new Date(entryDate))/86400000),tipo}
}

function calcEquityCurves(trades,data,capitalIni,startDate,sp500Data) {
  const filtered=data.filter(d=>new Date(d.date)>=new Date(startDate))
  if(!filtered.length) return {strategyCurve:[],bhCurve:[],sp500BHCurve:[],compoundCurve:[],
    maxDDStrategy:0,maxDDBH:0,maxDDSP500:0,maxDDCompound:0,
    maxDDStrategyDate:null,maxDDBHDate:null,maxDDSP500Date:null,maxDDCompoundDate:null}
  const p0=filtered[0].close
  const step=Math.max(1,Math.floor(filtered.length/300))
  const sampled=filtered.filter((_,i)=>i%step===0||i===filtered.length-1)
  const strategyCurve=[],bhCurve=[],sp500BHCurve=[],compoundCurve=[]
  let lastStrat=capitalIni,lastCompound=capitalIni
  let sp0Close=null
  if(sp500Data){const sp0=sp500Data.find(d=>d.date>=filtered[0].date);if(sp0)sp0Close=sp0.close}
  sampled.forEach(d=>{
    const exits=trades.filter(t=>t.exitDate<=d.date)
    if(exits.length){lastStrat=capitalIni+exits.reduce((s,t)=>s+t.pnlSimple,0);lastCompound=exits[exits.length-1].capitalTras}
    strategyCurve.push({date:d.date,value:lastStrat})
    compoundCurve.push({date:d.date,value:lastCompound})
    bhCurve.push({date:d.date,value:capitalIni*(d.close/p0)})
    if(sp500Data&&sp0Close){
      let spBar=null;for(let i=sp500Data.length-1;i>=0;i--){if(sp500Data[i].date<=d.date){spBar=sp500Data[i];break}}
      if(spBar)sp500BHCurve.push({date:d.date,value:capitalIni*(spBar.close/sp0Close)})
    }
  })
  const calcDD=(curve)=>{
    let peak=curve[0]?.value||capitalIni,maxDD=0,maxDDDate=null
    curve.forEach(p=>{if(p.value>peak)peak=p.value;const dd=(peak-p.value)/peak*100;if(dd>maxDD){maxDD=dd;maxDDDate=p.date}})
    return{maxDD,maxDDDate}
  }
  const {maxDD:maxDDStrategy,maxDDDate:maxDDStrategyDate}=calcDD(strategyCurve)
  const {maxDD:maxDDBH,maxDDDate:maxDDBHDate}=calcDD(bhCurve)
  const {maxDD:maxDDSP500,maxDDDate:maxDDSP500Date}=calcDD(sp500BHCurve)
  const {maxDD:maxDDCompound,maxDDDate:maxDDCompoundDate}=calcDD(compoundCurve)
  return{strategyCurve,bhCurve,sp500BHCurve,compoundCurve,
    maxDDStrategy,maxDDBH,maxDDSP500,maxDDCompound,
    maxDDStrategyDate,maxDDBHDate,maxDDSP500Date,maxDDCompoundDate}
}

// ── Handler ──────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const { simbolo, cfg, definition } = req.body
  try {
    const data = await fetchAV(simbolo)
    if (!data||!data.length) return res.status(404).json({error:`Sin datos para "${simbolo}"`})
    let sp500Data=null; try { sp500Data=await fetchAV('^GSPC') } catch(_) {}

    const { chartData, trades, capitalReinv, gananciaSimple, startDate, meta:runMeta }
      = runBacktest(data, sp500Data, cfg, definition||null)

    const capIni = definition?.capitalIni || cfg?.capitalIni || 10000
    const filteredData = data.filter(d=>new Date(d.date)>=new Date(startDate))
    let ganBH=0
    if (filteredData.length>=2) ganBH=capIni*(filteredData[filteredData.length-1].close/filteredData[0].close)-capIni

    const curves = calcEquityCurves(trades,data,capIni,startDate,sp500Data)

    let sp500Status=null
    if (sp500Data?.length) {
      // Usar EMAs del filtro de mercado si existe, sino defaults
      const filt = (definition?.filters?.market||cfg&&[{ma_fast:cfg.sp500EmaR,ma_slow:cfg.sp500EmaL}])||[]
      const spEmaRP = filt[0]?.ma_fast||10, spEmaLP = filt[0]?.ma_slow||11
      const spC=sp500Data.map(d=>d.close)
      const spEmaR=calcEMA(spC,spEmaRP), spEmaL=calcEMA(spC,spEmaLP)
      const last=sp500Data[sp500Data.length-1]
      sp500Status={precio:last.close,emaR:spEmaR[spEmaR.length-1],emaL:spEmaL[spEmaL.length-1],
        date:last.date, sp500EmaR:spEmaRP, sp500EmaL:spEmaLP}
    }

    res.status(200).json({
      chartData: chartData.filter(d=>new Date(d.date)>=new Date(startDate)),
      trades, capitalReinv, gananciaSimple, ganBH,
      startDate: startDate.toISOString().split('T')[0],
      sp500Status, ...curves,
      meta: {
        simbolo,
        ultimaFecha: data[data.length-1].date,
        ultimoPrecio: data[data.length-1].close,
        totalBars: data.length,
        emaRPeriod: runMeta?.emaRPeriod,
        emaLPeriod: runMeta?.emaLPeriod,
      }
    })
  } catch(err) {
    console.error(err); res.status(500).json({error:err.message||'Error interno'})
  }
}
