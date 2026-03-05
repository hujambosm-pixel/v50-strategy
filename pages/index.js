import { useState, useRef, useEffect, useCallback } from 'react'
import Head from 'next/head'

function calcMetrics(trades, capitalIni, capitalReinv, gananciaSimple, ganBH, startDate, endDate) {
  if (!trades || trades.length === 0) return null
  const n      = trades.length
  const wins   = trades.filter(t => t.pnlPct >= 0)
  const losses = trades.filter(t => t.pnlPct < 0)
  const winRate = (wins.length / n) * 100
  const avgWin  = wins.length  ? wins.reduce((s,t) => s + t.pnlPct, 0) / wins.length  : 0
  const avgLoss = losses.length ? losses.reduce((s,t) => s + Math.abs(t.pnlPct), 0) / losses.length : 0
  const totalDias = trades.reduce((s,t) => s + t.dias, 0)
  const anios = startDate && endDate ? (new Date(endDate) - new Date(startDate)) / (365.25 * 86400000) : 1
  const safYears = Math.max(anios, 0.01)
  const capSimple = capitalIni + gananciaSimple
  const cagrS = Math.pow(Math.max(capSimple,0.01) / capitalIni, 1 / safYears) - 1
  const cagrC = capitalReinv > 0 ? Math.pow(capitalReinv / capitalIni, 1 / safYears) - 1 : 0
  const capBH = capitalIni + ganBH
  const cagrBH = capBH > 0 ? Math.pow(capBH / capitalIni, 1 / safYears) - 1 : 0
  const gBrute = wins.reduce((s,t) => s + t.pnlSimple, 0)
  const lBrute = losses.reduce((s,t) => s + Math.abs(t.pnlSimple), 0)
  const factorBen = lBrute > 0 ? gBrute / lBrute : 999
  const ganTotalPct = (gananciaSimple / capitalIni) * 100

  let peakS = capitalIni, maxDDS = 0
  trades.forEach(t => {
    const eq = capitalIni + trades.slice(0, trades.indexOf(t)+1).reduce((s,x) => s + x.pnlSimple, 0)
    if (eq > peakS) peakS = eq
    const dd = (peakS - eq) / peakS * 100
    if (dd > maxDDS) maxDDS = dd
  })
  let peakR = capitalIni, maxDDR = 0
  trades.forEach(t => {
    if (t.capitalTras > peakR) peakR = t.capitalTras
    const dd = (peakR - t.capitalTras) / peakR * 100
    if (dd > maxDDR) maxDDR = dd
  })
  const tiempoInv = totalDias / (safYears * 365.25) * 100

  return {
    n, wins: wins.length, losses: losses.length,
    winRate, avgWin, avgLoss,
    totalDias, diasProm: totalDias / n,
    ganSimple: gananciaSimple, ganComp: capitalReinv - capitalIni,
    ganBH, ganTotalPct,
    cagrS: cagrS * 100, cagrC: cagrC * 100, cagrBH: cagrBH * 100,
    factorBen, ddSimple: maxDDS, ddComp: maxDDR,
    tiempoInv, anios: safYears,
  }
}

function fmt(v, dec=2, suf='') {
  if (v == null || isNaN(v)) return '—'
  return v.toLocaleString('es-ES', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + suf
}

function fmtDate(s) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('es-ES', { day:'2-digit', month:'2-digit', year:'numeric' })
}

function tvSymbol(sym) {
  if (sym === '^GSPC') return 'SP:SPX'
  if (sym === '^IBEX') return 'BME:IBC'
  if (sym === '^GDAXI') return 'XETR:DAX'
  if (sym === '^NDX') return 'NASDAQ:NDX'
  if (sym.includes('-USD')) return `BINANCE:${sym.replace('-','')}`
  return sym
}

// ── Equity Chart ─────────────────────────────────────────────
function EquityChart({ strategyCurve, bhCurve, maxDDStrategyDate, maxDDBHDate, capitalIni }) {
  const ref = useRef(null)
  const chartRef = useRef(null)

  useEffect(() => {
    if (!ref.current || !strategyCurve?.length) return
    import('lightweight-charts').then(({ createChart, CrosshairMode, LineStyle }) => {
      if (chartRef.current) { chartRef.current.remove(); chartRef.current = null }
      const chart = createChart(ref.current, {
        width: ref.current.clientWidth,
        height: 260,
        layout: { background: { color: '#080c14' }, textColor: '#7a9bc0' },
        grid: { vertLines: { color: '#0d1520' }, horzLines: { color: '#0d1520' } },
        crosshair: { mode: CrosshairMode.Normal },
        rightPriceScale: { borderColor: '#1a2d45' },
        timeScale: { borderColor: '#1a2d45', timeVisible: false },
      })
      chartRef.current = chart

      // Strategy line
      const stratSeries = chart.addLineSeries({ color: '#00d4ff', lineWidth: 2, title: 'Estrategia' })
      stratSeries.setData(strategyCurve.map(p => ({ time: p.date, value: p.value })))

      // BH line
      const bhSeries = chart.addLineSeries({ color: '#ffd166', lineWidth: 2, title: 'Buy & Hold', lineStyle: LineStyle.Dashed })
      bhSeries.setData(bhCurve.map(p => ({ time: p.date, value: p.value })))

      // Capital inicial
      const initVal = capitalIni
      chart.addLineSeries({ color: '#3d5a7a', lineWidth: 1, lineStyle: LineStyle.Dotted, title: '' })
        .setData([
          { time: strategyCurve[0].date, value: initVal },
          { time: strategyCurve[strategyCurve.length-1].date, value: initVal }
        ])

      // Max DD markers
      const markers = []
      if (maxDDStrategyDate) markers.push({ time: maxDDStrategyDate, position: 'aboveBar', color: '#00d4ff', shape: 'arrowDown', text: 'Max DD Estrategia' })
      if (maxDDBHDate) markers.push({ time: maxDDBHDate, position: 'aboveBar', color: '#ffd166', shape: 'arrowDown', text: 'Max DD B&H' })
      if (markers.length) {
        markers.sort((a,b) => a.time.localeCompare(b.time))
        stratSeries.setMarkers(markers)
      }

      chart.timeScale().fitContent()
      const ro = new ResizeObserver(() => { if (ref.current) chart.applyOptions({ width: ref.current.clientWidth }) })
      ro.observe(ref.current)
      return () => ro.disconnect()
    })
    return () => { if (chartRef.current) { chartRef.current.remove(); chartRef.current = null } }
  }, [strategyCurve, bhCurve, maxDDStrategyDate, maxDDBHDate, capitalIni])

  return <div ref={ref} style={{ minHeight: 260 }} />
}

// ── Candle Chart ─────────────────────────────────────────────
function CandleChart({ data, projR, projL, emaRPeriod, emaLPeriod }) {
  const containerRef = useRef(null)
  const chartRef = useRef(null)

  useEffect(() => {
    if (typeof window === 'undefined' || !containerRef.current) return
    import('lightweight-charts').then(({ createChart, CrosshairMode, LineStyle }) => {
      if (chartRef.current) { chartRef.current.remove(); chartRef.current = null }
      const chart = createChart(containerRef.current, {
        width: containerRef.current.clientWidth, height: 460,
        layout: { background: { color: '#080c14' }, textColor: '#7a9bc0' },
        grid: { vertLines: { color: '#0d1520' }, horzLines: { color: '#0d1520' } },
        crosshair: { mode: CrosshairMode.Normal },
        rightPriceScale: { borderColor: '#1a2d45' },
        timeScale: { borderColor: '#1a2d45', timeVisible: true },
      })
      chartRef.current = chart
      const candles = chart.addCandlestickSeries({
        upColor:'#00e5a0', downColor:'#ff4d6d',
        borderUpColor:'#00e5a0', borderDownColor:'#ff4d6d',
        wickUpColor:'#00e5a0', wickDownColor:'#ff4d6d',
      })
      candles.setData(data.map(d => ({ time:d.date, open:d.open, high:d.high, low:d.low, close:d.close })))
      const erS = chart.addLineSeries({ color:'#ffd166', lineWidth:2, title:`EMA ${emaRPeriod}` })
      erS.setData(data.filter(d=>d.emaR!=null).map(d=>({ time:d.date, value:d.emaR })))
      const elS = chart.addLineSeries({ color:'#ff4d6d', lineWidth:2, title:`EMA ${emaLPeriod}` })
      elS.setData(data.filter(d=>d.emaL!=null).map(d=>({ time:d.date, value:d.emaL })))
      if (projR?.length) {
        const pRS = chart.addLineSeries({ color:'#ffd166', lineWidth:2, lineStyle:LineStyle.Dashed, title:'' })
        pRS.setData(projR.map(p=>({ time:p.date, value:p.value })))
      }
      if (projL?.length) {
        const pLS = chart.addLineSeries({ color:'#ff4d6d', lineWidth:2, lineStyle:LineStyle.Dashed, title:'' })
        pLS.setData(projL.map(p=>({ time:p.date, value:p.value })))
      }
      const bkData = data.filter(d=>d.breakoutLine!=null)
      if (bkData.length) {
        const bkS = chart.addLineSeries({ color:'#00d4ff', lineWidth:1, lineStyle:LineStyle.Dotted, title:'Breakout' })
        bkS.setData(bkData.map(d=>({ time:d.date, value:d.breakoutLine })))
      }
      const slData = data.filter(d=>d.stopLine!=null)
      if (slData.length) {
        const slS = chart.addLineSeries({ color:'#ff9a3c', lineWidth:1, lineStyle:LineStyle.Dotted, title:'Stop' })
        slS.setData(slData.map(d=>({ time:d.date, value:d.stopLine })))
      }
      const markers = []
      data.forEach(d => {
        if (d.signal==='entry') markers.push({ time:d.date, position:'belowBar', color:'#00e5a0', shape:'arrowUp', text:'Long' })
        if (d.signal==='exit')  markers.push({ time:d.date, position:'aboveBar', color:'#ff4d6d', shape:'arrowDown', text:'Exit' })
      })
      if (markers.length) candles.setMarkers(markers)
      chart.timeScale().fitContent()
      const ro = new ResizeObserver(() => { if (containerRef.current) chart.applyOptions({ width:containerRef.current.clientWidth }) })
      ro.observe(containerRef.current)
      return () => ro.disconnect()
    })
    return () => { if (chartRef.current) { chartRef.current.remove(); chartRef.current = null } }
  }, [data, projR, projL, emaRPeriod, emaLPeriod])

  return <div ref={containerRef} style={{ minHeight:460 }} />
}

// ── Main ─────────────────────────────────────────────────────
export default function Home() {
  const [simbolo,     setSimbolo]     = useState('^GSPC')
  const [emaR,        setEmaR]        = useState(10)
  const [emaL,        setEmaL]        = useState(11)
  const [years,       setYears]       = useState(5)
  const [capitalIni,  setCapitalIni]  = useState(10000)
  const [tipoStop,    setTipoStop]    = useState('tecnico')
  const [atrP,        setAtrP]        = useState(14)
  const [atrM,        setAtrM]        = useState(1.0)
  const [sinPerdidas, setSinPerdidas] = useState(true)
  const [reentry,     setReentry]     = useState(true)
  const [tipoFiltro,  setTipoFiltro]  = useState('none')
  const [sp500EmaR,   setSp500EmaR]   = useState(10)
  const [sp500EmaL,   setSp500EmaL]   = useState(11)
  const [result,      setResult]      = useState(null)
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState(null)

  const run = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/datos', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ simbolo, cfg: {
          emaR:Number(emaR), emaL:Number(emaL), years:Number(years),
          capitalIni:Number(capitalIni), tipoStop,
          atrPeriod:Number(atrP), atrMult:Number(atrM),
          sinPerdidas, reentry, tipoFiltro,
          sp500EmaR:Number(sp500EmaR), sp500EmaL:Number(sp500EmaL),
        }})
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Error')
      setResult(json)
    } catch(e) { setError(e.message) }
    finally { setLoading(false) }
  }, [simbolo, emaR, emaL, years, capitalIni, tipoStop, atrP, atrM, sinPerdidas, reentry, tipoFiltro, sp500EmaR, sp500EmaL])

  const metrics = result
    ? calcMetrics(result.trades, Number(capitalIni), result.capitalReinv, result.gananciaSimple,
                  result.ganBH || 0, result.startDate, result.meta?.ultimaFecha)
    : null

  const sp5 = result?.sp500Status
  let spStatus='neutral', spTxt='SIN FILTRO'
  if (sp5 && tipoFiltro !== 'none') {
    const bloquea = tipoFiltro==='precio_ema' ? sp5.precio < sp5.emaR : sp5.emaR < sp5.emaL
    spStatus = bloquea ? 'bad' : 'ok'
    spTxt    = bloquea ? '⚠ EVITAR ENTRADAS' : '✓ APTO PARA OPERAR'
  }

  const TICKERS = ['^GSPC','AAPL','^IBEX','^GDAXI','MSFT','BTC-USD','GC=F']

  const openTV = () => {
    const sym = tvSymbol(simbolo)
    window.open(`https://www.tradingview.com/chart/?symbol=${sym}`, '_blank')
  }

  return (
    <>
      <Head>
        <title>V50 — EMA Strategy</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <div className="app">
        <header className="header">
          <div className="header-logo">
            <span className="dot" />
            V50 · CRUCE EMAs
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            {result && (
              <button onClick={openTV} style={{
                background:'#131722', border:'1px solid #2d3748', color:'#00d4ff',
                fontFamily:'var(--mono)', fontSize:11, padding:'5px 12px',
                borderRadius:4, cursor:'pointer', display:'flex', alignItems:'center', gap:6,
                transition:'all 0.2s'
              }}
              onMouseOver={e=>e.currentTarget.style.borderColor='#00d4ff'}
              onMouseOut={e=>e.currentTarget.style.borderColor='#2d3748'}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="#00d4ff">
                  <path d="M3 3h7v2H5v14h14v-5h2v7H3V3zm11 0h7v7h-2V6.41l-9.29 9.3-1.42-1.42L17.59 5H14V3z"/>
                </svg>
                TradingView · {simbolo}
              </button>
            )}
            <div style={{ fontFamily:'var(--mono)', fontSize:11, color:'var(--text3)' }}>
              datos: Stooq · actualización diaria
            </div>
          </div>
        </header>

        <div className="main">
          <aside className="sidebar">
            <div className="sidebar-section">
              <div className="sidebar-title">Activo</div>
              <label>Símbolo
                <input type="text" value={simbolo} onChange={e=>setSimbolo(e.target.value.toUpperCase())} placeholder="^GSPC" />
              </label>
            </div>
            <div className="sidebar-section">
              <div className="sidebar-title">Estrategia</div>
              <div className="row2">
                <label>EMA Rápida<input type="number" value={emaR} min={1} max={500} onChange={e=>setEmaR(e.target.value)} /></label>
                <label>EMA Lenta<input  type="number" value={emaL} min={1} max={500} onChange={e=>setEmaL(e.target.value)} /></label>
              </div>
              <div className="row2">
                <label>Capital (€)<input type="number" value={capitalIni} min={100} onChange={e=>setCapitalIni(e.target.value)} /></label>
                <label>Años BT<input    type="number" value={years} min={1} max={20} onChange={e=>setYears(e.target.value)} /></label>
              </div>
            </div>
            <div className="sidebar-section">
              <div className="sidebar-title">Stop Loss</div>
              <label>Tipo
                <select value={tipoStop} onChange={e=>setTipoStop(e.target.value)}>
                  <option value="tecnico">Stop Técnico (EMA)</option>
                  <option value="atr">Stop ATR</option>
                  <option value="none">Ninguno</option>
                </select>
              </label>
              {tipoStop==='atr' && (
                <div className="row2">
                  <label>Periodo ATR<input type="number" value={atrP} min={1} onChange={e=>setAtrP(e.target.value)} /></label>
                  <label>Mult.<input       type="number" value={atrM} min={0.1} step={0.1} onChange={e=>setAtrM(e.target.value)} /></label>
                </div>
              )}
              <label className="checkbox-row">
                <input type="checkbox" checked={sinPerdidas} onChange={e=>setSinPerdidas(e.target.checked)} />
                Modo Sin Pérdidas
              </label>
              <label className="checkbox-row">
                <input type="checkbox" checked={reentry} onChange={e=>setReentry(e.target.checked)} />
                Modo Re-Entry
              </label>
            </div>
            <div className="sidebar-section">
              <div className="sidebar-title">Filtro SP500</div>
              <label>Filtro
                <select value={tipoFiltro} onChange={e=>setTipoFiltro(e.target.value)}>
                  <option value="none">Sin filtro</option>
                  <option value="precio_ema">Precio sobre EMA rápida</option>
                  <option value="ema_ema">EMA rápida sobre EMA lenta</option>
                </select>
              </label>
              {tipoFiltro !== 'none' && (
                <div className="row2">
                  <label>EMA R<input type="number" value={sp500EmaR} min={1} onChange={e=>setSp500EmaR(e.target.value)} /></label>
                  <label>EMA L<input type="number" value={sp500EmaL} min={1} onChange={e=>setSp500EmaL(e.target.value)} /></label>
                </div>
              )}
            </div>
            <button className="btn-run" onClick={run} disabled={loading}>
              {loading ? '· Cargando...' : '▶ Ejecutar'}
            </button>
          </aside>

          <div className="content">
            {sp5 && (
              <div className="sp500-bar">
                <span className="label">SP500</span>
                <span className={`val ${sp5.changePct>=0?'green':'red'}`}>{fmt(sp5.precio,2)}</span>
                <span className="label">EMA {sp500EmaR}</span>
                <span className="val yellow">{fmt(sp5.emaR,2)}</span>
                <span className="label">EMA {sp500EmaL}</span>
                <span className="val yellow">{fmt(sp5.emaL,2)}</span>
                <span className="label" style={{marginLeft:'auto',marginRight:8,fontSize:10}}>{fmtDate(sp5.date)}</span>
                <span className={`status-badge ${spStatus}`}>{spTxt}</span>
              </div>
            )}

            {error && <div className="error-msg">⚠ {error}</div>}

            {loading && (
              <div className="loading">
                <div className="spinner" />
                <div className="loading-text">CARGANDO DATOS · {simbolo}</div>
              </div>
            )}

            {!loading && !result && !error && (
              <div className="empty-state">
                <div className="empty-icon">📈</div>
                <div className="empty-title">V50 — Estrategia Cruce EMAs</div>
                <div className="empty-desc">Configura los parámetros y pulsa <strong>▶ Ejecutar</strong></div>
                <div style={{marginTop:16}}>
                  <div style={{fontFamily:'var(--mono)',fontSize:11,color:'var(--text3)',marginBottom:8}}>SÍMBOLOS DE EJEMPLO</div>
                  <div className="ticker-grid">
                    {TICKERS.map(t => <div key={t} className="ticker-pill" onClick={()=>setSimbolo(t)}>{t}</div>)}
                  </div>
                </div>
              </div>
            )}

            {!loading && result && (
              <>
                {/* Gráfico de velas */}
                <div className="chart-wrap">
                  <div className="chart-header">
                    <div className="chart-title">{simbolo}</div>
                    <div className="chart-price">{fmt(result.meta?.ultimoPrecio,2)}</div>
                    <div className="chart-date">{fmtDate(result.meta?.ultimaFecha)}</div>
                  </div>
                  <CandleChart data={result.chartData} projR={result.projR} projL={result.projL} emaRPeriod={emaR} emaLPeriod={emaL} />
                  <div style={{display:'flex',gap:20,marginTop:10,fontFamily:'var(--mono)',fontSize:11,color:'var(--text3)'}}>
                    <span><span style={{color:'#ffd166'}}>─</span> EMA {emaR}</span>
                    <span><span style={{color:'#ff4d6d'}}>─</span> EMA {emaL}</span>
                    <span><span style={{color:'#ffd166'}}>- -</span> Proy. {emaR}</span>
                    <span><span style={{color:'#ff4d6d'}}>- -</span> Proy. {emaL}</span>
                    <span><span style={{color:'#00d4ff'}}>···</span> Breakout</span>
                    <span><span style={{color:'#ff9a3c'}}>···</span> Stop</span>
                  </div>
                </div>

                {/* Métricas */}
                {metrics && (
                  <div className="metrics-section">
                    {[
                      { label:'Total Operaciones',                    val:metrics.n,                              color:'yellow' },
                      { label:`Tiempo Invertido (${fmt(metrics.anios,2)}a)`, val:fmt(metrics.tiempoInv,0,'%'),   color:'yellow' },
                      { label:'Ganadoras',                            val:metrics.wins,                           color:'green'  },
                      { label:'Perdedoras',                           val:metrics.losses,                         color:'red'    },
                      { label:'Win Rate',                             val:fmt(metrics.winRate,1,'%'),              color:metrics.winRate>=50?'green':'red' },
                      { label:'Ganancia Media (%)',                   val:fmt(metrics.avgWin,2,'%'),               color:'green'  },
                      { label:'Pérdida Media (%)',                    val:fmt(metrics.avgLoss,2,'%'),              color:'red'    },
                      { label:'Días Promedio',                        val:fmt(metrics.diasProm,1,' días'),         color:'cyan'   },
                      { label:'Total Días Invertido',                 val:metrics.totalDias,                      color:'cyan'   },
                      { label:'Ganancia Simple (€)',                  val:fmt(metrics.ganSimple,2,'€'),            color:metrics.ganSimple>=0?'green':'red' },
                      { label:'Ganancia Compuesta (€)',               val:fmt(metrics.ganComp,2,'€'),              color:metrics.ganComp>=0?'green':'red'  },
                      { label:'Ganancia Buy&Hold (€)',                val:fmt(metrics.ganBH,2,'€'),                color:metrics.ganBH>=0?'green':'red'    },
                      { label:'Ganancia Total (%)',                   val:fmt(metrics.ganTotalPct,2,'%'),          color:metrics.ganTotalPct>=0?'green':'red' },
                      { label:'Factor de Beneficio',                  val:fmt(metrics.factorBen,2),                color:metrics.factorBen>=1?'green':'red' },
                      { label:`CAGR Estrategia (${fmt(metrics.anios,1)}a)`, val:fmt(metrics.cagrS,2,'%'),         color:metrics.cagrS>=0?'green':'red'    },
                      { label:'Max Drawdown (%)',                     val:fmt(metrics.ddSimple,2,'%'),             color:'red'    },
                      { label:`CAGR Buy&Hold (${fmt(metrics.anios,1)}a)`,   val:fmt(metrics.cagrBH,2,'%'),        color:metrics.cagrBH>=0?'green':'red'   },
                      { label:'Max Drawdown Buy&Hold (%)',            val:fmt(result.maxDDBH,2,'%'),               color:'red'    },
                      { label:`CAGR Compuesto (${fmt(metrics.anios,1)}a)`,  val:fmt(metrics.cagrC,2,'%'),         color:metrics.cagrC>=0?'green':'red'    },
                      { label:'Max DD Compuesto (%)',                 val:fmt(metrics.ddComp,2,'%'),               color:'red'    },
                    ].map(m => (
                      <div key={m.label} className="metric-card">
                        <span className="metric-label">{m.label}</span>
                        <span className={`metric-val ${m.color}`}>{m.val}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Equity curve */}
                {result.strategyCurve?.length > 0 && (
                  <div className="equity-section">
                    <div className="section-title">
                      Curva de Equity — Estrategia vs Buy &amp; Hold
                      <span style={{marginLeft:20,fontWeight:400}}>
                        <span style={{color:'#00d4ff'}}>─ Estrategia</span>
                        <span style={{marginLeft:12,color:'#ffd166'}}>- - Buy &amp; Hold</span>
                        <span style={{marginLeft:12,color:'#7a9bc0',fontSize:10}}>▼ Máx. Drawdown</span>
                      </span>
                    </div>
                    <EquityChart
                      strategyCurve={result.strategyCurve}
                      bhCurve={result.bhCurve}
                      maxDDStrategyDate={result.maxDDStrategyDate}
                      maxDDBHDate={result.maxDDBHDate}
                      capitalIni={Number(capitalIni)}
                    />
                  </div>
                )}

                {/* Barras por operación */}
                {result.trades?.length > 0 && (
                  <div className="equity-section">
                    <div className="section-title">Resultados por Operación</div>
                    <div className="equity-bars">
                      {result.trades.map((t,i) => {
                        const maxPnl = Math.max(...result.trades.map(x=>Math.abs(x.pnlPct)))
                        const h = Math.max(4, Math.abs(t.pnlPct)/maxPnl*56)
                        return <div key={i} className="equity-bar"
                          style={{ height:h, background:t.pnlPct>=0?'var(--green)':'var(--red)' }}
                          title={`${fmtDate(t.exitDate)}: ${fmt(t.pnlPct,2)}%`} />
                      })}
                    </div>
                  </div>
                )}

                {/* Tabla de trades */}
                {result.trades?.length > 0 && (
                  <div className="trades-section">
                    <div className="section-title">Historial — {result.trades.length} operaciones</div>
                    <div style={{overflowX:'auto'}}>
                      <table className="trades-table">
                        <thead>
                          <tr>
                            <th>#</th><th>Entrada</th><th>Salida</th>
                            <th>Px Entrada</th><th>Px Salida</th>
                            <th>P&L %</th><th>P&L €</th><th>Días</th><th>Tipo</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[...result.trades].reverse().map((t,i) => (
                            <tr key={i}>
                              <td style={{color:'var(--text3)'}}>{result.trades.length-i}</td>
                              <td>{fmtDate(t.entryDate)}</td>
                              <td>{fmtDate(t.exitDate)}</td>
                              <td>{fmt(t.entryPx,2)}</td>
                              <td>{fmt(t.exitPx,2)}</td>
                              <td style={{color:t.pnlPct>=0?'var(--green)':'var(--red)',fontWeight:600}}>
                                {t.pnlPct>=0?'+':''}{fmt(t.pnlPct,2)}%
                              </td>
                              <td style={{color:t.pnlSimple>=0?'var(--green)':'var(--red)'}}>
                                {t.pnlSimple>=0?'+':''}{fmt(t.pnlSimple,2)}€
                              </td>
                              <td style={{color:'var(--text2)'}}>{t.dias}</td>
                              <td><span className={`tag ${t.pnlPct>=0?'win':'loss'}`}>{t.tipo}</span></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {!result.trades?.length && (
                  <div style={{padding:'24px',fontFamily:'var(--mono)',fontSize:12,color:'var(--text3)'}}>
                    No se generaron operaciones. Prueba a ampliar los años o ajustar los parámetros.
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
