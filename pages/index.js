import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import Head from 'next/head'
import { calcMetrics, MONO, fmt, fmtDate, f2, tvSym } from '../lib/utils'
import { WATCHLIST_DEFAULT, DEFAULT_DEFINITION } from '../lib/constants'
import { getSupaUrl, getSupaKey, getSupaH } from '../lib/supabase'
import { loadSettings, saveSettings, saveSettingsRemote, loadSettingsRemote } from '../lib/settings'
import { fetchConditions, lsGetConds, lsSaveConds, COND_LS_KEY } from '../lib/conditions'
import CandleChart from '../components/CandleChart'
import EquityChart from '../components/EquityChart'
import Tip from '../components/Tip'
import SettingsModal from '../components/SettingsModal'
import StrategyAIPanel from '../components/StrategyAIPanel'
import StrategyBuilder from '../components/StrategyBuilder'
import { MultiCartChart, OccupancyBarChart, McOccupancyChart } from '../components/BacktestCharts'
import { TlEquityChart, TlInvestChart } from '../components/TlCharts'
import ContextThemeMenu, { applyTema } from '../components/ContextThemeMenu'
import MetricRow from '../components/MetricRow'
import PriceAlarmQuickForm from '../components/PriceAlarmQuickForm'
import StrategiesManager from '../components/StrategiesManager'
import StrategyEditorPanel from '../components/StrategyEditorPanel'
import ConditionEditorPanel from '../components/ConditionEditorPanel'


// ── Date helpers for TradeLog (dd/mm/yyyy ↔ yyyy-mm-dd) ──
function toDisplayDate(iso){ // '2024-03-15' → '15/03/2024'
  if(!iso) return ''
  const [y,m,d]=iso.split('-')
  return `${d}/${m}/${y}`
}
function toIsoDate(disp){ // '15/03/2024' → '2024-03-15'
  if(!disp) return ''
  if(disp.includes('-')) return disp // already ISO
  const parts=disp.split('/')
  if(parts.length===3) return `${parts[2]}-${parts[1]}-${parts[0]}`
  return ''
}
function todayDisplay(){ return toDisplayDate(new Date().toISOString().slice(0,10)) }



// ── Watchlist API ─────────────────────────────────────────────
async function fetchWatchlist() {
  const res=await fetch(`${getSupaUrl()}/rest/v1/watchlist?order=favorite.desc,name.asc`,{headers:getSupaH()})
  if(!res.ok) throw new Error('Error cargando watchlist')
  return await res.json() // devuelve filas completas con todos los campos
}
async function upsertWatchlistItem(item) {
  const method=item.id?'PATCH':'POST'
  const url=item.id?`${getSupaUrl()}/rest/v1/watchlist?id=eq.${item.id}`:`${getSupaUrl()}/rest/v1/watchlist`
  // Limpiar campos internos (prefijo _) y campos no existentes en la tabla
  const ALLOWED=['symbol','name','group_name','list_name','position','active','favorite','observations']
  const body={}; ALLOWED.forEach(k=>{if(item[k]!==undefined)body[k]=item[k]})
  const res=await fetch(url,{method,headers:{...getSupaH(),'Prefer':'return=representation'},body:JSON.stringify(body)})
  if(!res.ok){const t=await res.text();throw new Error('Error guardando: '+t)}
  return (await res.json())[0]
}
async function deleteWatchlistItem(id) {
  const res=await fetch(`${getSupaUrl()}/rest/v1/watchlist?id=eq.${id}`,{method:'DELETE',headers:getSupaH()})
  if(!res.ok) throw new Error('Error eliminando')
}

// ── Ranking results API ───────────────────────────────────────
async function saveRankingRemote(rankingData, stratId) {
  // Upsert one row per symbol in backtest_results, keyed by symbol+strategy_id
  const rows = Object.entries(rankingData).map(([symbol, rd]) => ({
    symbol,
    strategy_id: stratId || null,
    win_rate:    rd.metrics?.winRate    ?? null,
    cagr_simple: rd.metrics?.cagr       ?? null,
    max_drawdown:rd.metrics?.maxDD      ?? null,
    total_trades:rd.metrics?.trades     ?? null,
    score:       rd.score               ?? null,
    rank_position: rd.rank              ?? null,
    updated_at:  new Date().toISOString(),
  }))
  // Upsert in batches of 20
  for (let i=0; i<rows.length; i+=20) {
    const batch = rows.slice(i, i+20)
    await fetch(`${getSupaUrl()}/rest/v1/ranking_results`, {
      method: 'POST',
      headers: { ...getSupaH(), 'Prefer': 'resolution=merge-duplicates,return=minimal',
        'Content-Type': 'application/json' },
      body: JSON.stringify(batch)
    })
  }
}
async function loadRankingRemote(stratId) {
  const url = stratId
    ? `${getSupaUrl()}/rest/v1/ranking_results?strategy_id=eq.${stratId}&order=rank_position.asc`
    : `${getSupaUrl()}/rest/v1/ranking_results?order=rank_position.asc`
  const res = await fetch(url, { headers: getSupaH() })
  if (!res.ok) return null
  const rows = await res.json()
  if (!rows?.length) return null
  const out = {}
  rows.forEach(r => {
    out[r.symbol] = {
      score: r.score, rank: r.rank_position,
      metrics: { winRate: r.win_rate, cagr: r.cagr_simple, maxDD: r.max_drawdown, trades: r.total_trades }
    }
  })
  return out
}

// ── Strategies API ────────────────────────────────────────────
async function fetchStrategies() {
  const res=await fetch(`${getSupaUrl()}/rest/v1/strategies?active=eq.true&order=name.asc`,{headers:getSupaH()})
  if(!res.ok) throw new Error('Error cargando estrategias')
  return await res.json()
}
async function upsertStrategy(item) {
  const method=item.id?'PATCH':'POST'
  const url=item.id?`${getSupaUrl()}/rest/v1/strategies?id=eq.${item.id}`:`${getSupaUrl()}/rest/v1/strategies`
  // Only send known DB columns — strip any UI-only keys (prefixed with _)
  const ALLOWED=['name','years','capital_ini','allocation_pct','color','observations','active','definition',
    'condition_filter_id','condition_setup_id','condition_trigger_id','condition_abort_id',
    'condition_stop_loss_id','condition_exit_id','condition_management_id']
  const body={}; ALLOWED.forEach(k=>{if(item[k]!==undefined)body[k]=item[k]})
  const res=await fetch(url,{method,headers:{...getSupaH(),'Prefer':'return=representation'},body:JSON.stringify(body)})
  if(!res.ok){const t=await res.text();throw new Error(`Error guardando estrategia: ${t}`)}
  return (await res.json())[0]
}
async function deleteStrategy(id) {
  const res=await fetch(`${getSupaUrl()}/rest/v1/strategies?id=eq.${id}`,{method:'DELETE',headers:getSupaH()})
  if(!res.ok) throw new Error('Error eliminando estrategia')
}


// ── Alarms API ───────────────────────────────────────────────
async function fetchAlarms() {
  const res=await fetch(`${getSupaUrl()}/rest/v1/alarms?active=eq.true&order=symbol.asc`,{headers:getSupaH()})
  if(!res.ok) throw new Error('Error cargando alarmas')
  return await res.json()
}
async function upsertAlarm(item) {
  const method=item.id?'PATCH':'POST'
  const url=item.id?`${getSupaUrl()}/rest/v1/alarms?id=eq.${item.id}`:`${getSupaUrl()}/rest/v1/alarms`
  const ALLOWED=['name','symbol','condition','condition_detail','price_level','ema_r','ema_l','active']
  const body={}; ALLOWED.forEach(k=>{if(item[k]!==undefined)body[k]=item[k]})
  const res=await fetch(url,{method,headers:{...getSupaH(),'Prefer':'return=representation'},body:JSON.stringify(body)})
  if(!res.ok){const t=await res.text();throw new Error('Error guardando alarma: '+t)}
  return (await res.json())[0]
}
async function deleteAlarm(id) {
  const res=await fetch(`${getSupaUrl()}/rest/v1/alarms?id=eq.${id}`,{method:'DELETE',headers:getSupaH()})
  if(!res.ok) throw new Error('Error eliminando alarma')
}

// ── Búsqueda de nombre vía Yahoo Finance (proxy local) ───────
async function searchSymbolName(sym) {
  if(!sym||sym.length<1) return ''
  try{
    const res=await fetch(`/api/search?q=${encodeURIComponent(sym)}`)
    if(!res.ok) return ''
    const data=await res.json()
    // Buscar coincidencia exacta primero
    const exact=data.find(d=>d.symbol.toUpperCase()===sym.toUpperCase())
    return exact?exact.name:(data[0]?.name||'')
  }catch{return ''}
}

// Fallback local por si Supabase no responde

// ── Mapa de nombres conocidos ────────────────────────────────
const SYM_NAMES={
  '^GSPC':'S&P 500','^NDX':'Nasdaq 100','^IBEX':'IBEX 35','^GDAXI':'DAX 40',
  '^FTSE':'FTSE 100','^N225':'Nikkei 225','^DJI':'Dow Jones','^RUT':'Russell 2000',
  '^STOXX50E':'Euro Stoxx 50','^FCHI':'CAC 40','^AEX':'AEX Amsterdam',
  'AAPL':'Apple','MSFT':'Microsoft','NVDA':'Nvidia','AMZN':'Amazon','META':'Meta',
  'TSLA':'Tesla','GOOGL':'Alphabet','GOOG':'Alphabet','JPM':'JPMorgan',
  'V':'Visa','MA':'Mastercard','UNH':'UnitedHealth','JNJ':'Johnson & Johnson',
  'WMT':'Walmart','PG':'Procter & Gamble','XOM':'ExxonMobil','CVX':'Chevron',
  'HD':'Home Depot','ABBV':'AbbVie','LLY':'Eli Lilly','MRK':'Merck',
  'PFE':'Pfizer','KO':'Coca-Cola','PEP':'PepsiCo','COST':'Costco',
  'AVGO':'Broadcom','ORCL':'Oracle','CRM':'Salesforce','ADBE':'Adobe',
  'NFLX':'Netflix','DIS':'Disney','PYPL':'PayPal','SQ':'Block',
  'AMD':'AMD','INTC':'Intel','QCOM':'Qualcomm','TXN':'Texas Instruments',
  'BAC':'Bank of America','WFC':'Wells Fargo','GS':'Goldman Sachs','MS':'Morgan Stanley',
  'BTC-USD':'Bitcoin','ETH-USD':'Ethereum','SOL-USD':'Solana','BNB-USD':'BNB',
  'XRP-USD':'XRP','ADA-USD':'Cardano','DOGE-USD':'Dogecoin','AVAX-USD':'Avalanche',
  'GC=F':'Oro','CL=F':'Petróleo WTI','SI=F':'Plata','NG=F':'Gas Natural',
  'ZC=F':'Maíz','ZW=F':'Trigo','KC=F':'Café',
  'SPY':'SPDR S&P 500 ETF','QQQ':'Invesco QQQ ETF','IWM':'iShares Russell 2000',
  'GLD':'SPDR Gold ETF','TLT':'iShares 20Y Treasury',
}
function lookupName(sym) {
  if(!sym) return ''
  const up=sym.toUpperCase()
  if(SYM_NAMES[up]) return SYM_NAMES[up]
  // Fallback: limpiar el símbolo como nombre
  return up.replace(/[\^=\.\-]/g,' ').replace(/USD$/,'').trim()
}




// ── MultiCartChart ───────────────────────────────────────────





// ── StrategyAIPanel — asistente IA para configurar estrategias ─

// ── StrategyBuilder — constructor jerárquico de 8 pasos ───────
// Cada paso tiene número, título, descripción y controles específicos.






export default function Home() {
  const [simbolo,setSimbolo]=useState('^GSPC')
  const [symSearchOpen,setSymSearchOpen]=useState(false)
  const [symSearchQ,setSymSearchQ]=useState('')
  const symSearchInputRef=useRef(null)
  const [emaR,setEmaR]=useState(10),[emaL,setEmaL]=useState(11)
  const [years,setYears]=useState(5),[capitalIni,setCapitalIni]=useState(10000)
  const [tipoStop,setTipoStop]=useState('tecnico'),[atrP,setAtrP]=useState(14),[atrM,setAtrM]=useState(1.0)
  const [sinPerdidas,setSinPerdidas]=useState(true),[reentry,setReentry]=useState(true)
  const [tipoFiltro,setTipoFiltro]=useState('none'),[sp500EmaR,setSp500EmaR]=useState(10),[sp500EmaL,setSp500EmaL]=useState(11)
  const [result,setResult]=useState(null),[loading,setLoading]=useState(false),[error,setError]=useState(null)
  const [labelMode,setLabelMode]=useState(0),[rulerOn,setRulerOn]=useState(false)
  const [chartViewFull,setChartViewFull]=useState(false)
  const [settingsOpen,setSettingsOpen]=useState(false)
  const [settingsInitTab,setSettingsInitTab]=useState('integraciones')
  const [sidePanel,setSidePanel]=useState('config')
  const [navExpanded,setNavExpanded]=useState(false)
  const [metricsLayout,setMetricsLayout]=useState('panel')
  const [metricsView,setMetricsView]=useState('panel')   // 'multi'=3col | 'single'=one strat per block
  const [showStrategy,setShowStrategy]=useState(true),[showBH,setShowBH]=useState(true)
  const [showSP500,setShowSP500]=useState(true),[showCompound,setShowCompound]=useState(true)
  const [watchlist,setWatchlist]=useState(WATCHLIST_DEFAULT)
  const [wlLoading,setWlLoading]=useState(true)
  const [selectedLists,setSelectedLists]=useState(['General'])
  const [listDropOpen,setListDropOpen]=useState(false)
  const [editingItem,setEditingItem]=useState(null) // item watchlist en edición
  const [editForm,setEditForm]=useState({})
  const [editSaving,setEditSaving]=useState(false)
  const [strategies,setStrategies]=useState([])
  const [strLoading,setStrLoading]=useState(true)
  const [editingStr,setEditingStr]=useState(null)
  const [strForm,setStrForm]=useState({})
  const [strSaving,setStrSaving]=useState(false)
  // ── Strategy Builder (definition-based) ──
  const [definition, setDefinition]   = useState(DEFAULT_DEFINITION)
  const [stratName, setStratName]     = useState('Mi Estrategia')
  const [stratDesc, setStratDesc]     = useState('')
  const [stratColor, setStratColor]   = useState('#00d4ff')
  const [currentStratId, setCurrentStratId] = useState(null)
  const [stratSaving, setStratSaving] = useState(false)
  const [stratMsg, setStratMsg]       = useState(null)
  const [stratTab, setStratTab]       = useState('build')
  const [aiPanelOpen, setAiPanelOpen] = useState(false)
  // Alertas
  const [alarms,setAlarms]=useState([])
  const [alarmLoading,setAlarmLoading]=useState(true)
  const [conditions,setConditions]=useState([])
  const [condLoading,setCondLoading]=useState(false)
  const [selectedCondition,setSelectedCondition]=useState(null)
  const [editingCond,setEditingCond]=useState(null)
  const [condForm,setCondForm]=useState({})
  const [condSaving,setCondSaving]=useState(false)
  const [condSearch,setCondSearch]=useState('')
  const [selectedStrategy,setSelectedStrategy]=useState(null)
  const [editingAlarm,setEditingAlarm]=useState(null)
  const [alarmForm,setAlarmForm]=useState({})
  const [alarmSaving,setAlarmSaving]=useState(false)
  // Buscador global watchlist
  const [wlSearch,setWlSearch]=useState('')
  const [selectedAlarmIds,setSelectedAlarmIds]=useState([])  // IDs de alarmas activas en filtro
  const [onlyFavs,setOnlyFavs]=useState(false)  // filtro solo favoritos
  const [condFilterActive,setCondFilterActive]=useState(false) // filtro por condición activa
  const [alarmDropOpen,setAlarmDropOpen]=useState(false)  // desplegable alarmas
  const [alarmPopup,setAlarmPopup]=useState(null)  // kept for compat, not shown
  const [ackedAlarms,setAckedAlarms]=useState(new Set())  // populated from localStorage in useEffect
  const ackAlarm=(sym,aid)=>setAckedAlarms(prev=>{
    const n=new Set(prev); n.add(`${sym}::${aid}`)
    try{localStorage.setItem('v50_acked_alarms',JSON.stringify([...n]))}catch(_){}
    return n
  })
  const unackAlarm=(sym,aid)=>setAckedAlarms(prev=>{
    const n=new Set(prev); n.delete(`${sym}::${aid}`)
    try{localStorage.setItem('v50_acked_alarms',JSON.stringify([...n]))}catch(_){}
    return n
  })
  const [priceAlarmDlg,setPriceAlarmDlg]=useState(null) // {price, symbol} o null
  // ── Ranking ─────────────────────────────────────────────────
  const [rankingData,setRankingData]=useState({})      // { symbol: { score, rank, metrics } }
  const [rankingStratId,setRankingStratId]=useState(null)    // strategy id the ranking was calculated with
  const [rankingStratName,setRankingStratName]=useState('')  // display name
  const [rankingRunning,setRankingRunning]=useState(false)
  const [rankingProgress,setRankingProgress]=useState({done:0,total:0})
  const [rankingError,setRankingError]=useState(null)
  // Búsqueda async de nombre
  const symSearchRef=useRef(null)
  const [mcTradeFilter,setMcTradeFilter]=useState('')
  const [tradeHistMode,setTradeHistMode]=useState('compound')   // 'compound'|'simple' for trade history capital column
  const [mcTradeHistMode,setMcTradeHistMode]=useState('compound')
  const chartSyncRef=useRef({syncing:false,listeners:[]})  // cross-chart time sync

  // Reset sync listeners when symbol/result changes to prevent stale refs
  const prevSymboloRef=useRef(null)
  if(simbolo!==prevSymboloRef.current){
    chartSyncRef.current={syncing:false,listeners:[]}
    prevSymboloRef.current=simbolo
  }
  const [mcLayout,setMcLayout]=useState('panel')  // 'panel' | 'grid'
  // ── Resizable panels ────────────────────────────────────────
  const [sidebarW,setSidebarW]=useState(240)
  const [rightPanelW,setRightPanelW]=useState(275)
  const [candleH,setCandleH]=useState(480)     // resizable candle chart height
  const [equityH,setEquityH]=useState(260)     // resizable equity chart height
  const [mcEquityH,setMcEquityH]=useState(300) // resizable MC equity chart height
  const candleResizing=useRef(false),candleStartY=useRef(0),candleStartH=useRef(0)
  const equityResizing=useRef(false),equityStartY=useRef(0),equityStartH=useRef(0)
  const mcEquityResizing=useRef(false),mcEquityStartY=useRef(0),mcEquityStartH=useRef(0)
  const sidebarResizing=useRef(false), rightResizing=useRef(false)
  const sidebarStartX=useRef(0), sidebarStartW=useRef(0)
  const rightStartX=useRef(0), rightStartW=useRef(0)

  useEffect(()=>{
    const onMove=e=>{
      if(sidebarResizing.current){
        const delta=e.clientX-sidebarStartX.current
        setSidebarW(Math.max(180,Math.min(420,sidebarStartW.current+delta)))
      }
      if(rightResizing.current){
        const delta=rightStartX.current-e.clientX
        setRightPanelW(Math.max(200,Math.min(480,rightStartW.current+delta)))
      }
      if(candleResizing.current){
        const dy=e.clientY-candleStartY.current
        setCandleH(Math.max(200,Math.min(900,candleStartH.current+dy)))
      }
      if(equityResizing.current){
        const dy=e.clientY-equityStartY.current
        setEquityH(Math.max(120,Math.min(600,equityStartH.current+dy)))
      }
      if(mcEquityResizing.current){
        const dy=e.clientY-mcEquityStartY.current
        setMcEquityH(Math.max(120,Math.min(600,mcEquityStartH.current+dy)))
      }
    }
    const onUp=()=>{
    sidebarResizing.current=false;rightResizing.current=false
    candleResizing.current=false;equityResizing.current=false;mcEquityResizing.current=false
    document.body.style.cursor='';document.body.style.userSelect=''
  }
    window.addEventListener('mousemove',onMove)
    window.addEventListener('mouseup',onUp)
    return()=>{window.removeEventListener('mousemove',onMove);window.removeEventListener('mouseup',onUp)}
  },[])

  // ── Backtesting state ──────────────────────────────────────
  const [mcSelected,setMcSelected]=useState([])          // symbols seleccionados
  const [mcSearch,setMcSearch]=useState('')
  const [mcOnlyFavs,setMcOnlyFavs]=useState(false)
  const [mcListFilter,setMcListFilter]=useState('')
  const [mcMode,setMcMode]=useState('slots')             // 'slots' | 'rotativo' | 'custom'
  const [mcWeights,setMcWeights]=useState({})             // {symbol: pct} para modo custom
  const [mcCapital,setMcCapital]=useState('compound')    // 'simple' | 'compound'
  const [mcResult,setMcResult]=useState(null)
  const [mcLoading,setMcLoading]=useState(false)
  const [mcError,setMcError]=useState(null)
  const [mcShowSimple,setMcShowSimple]=useState(true)
  const [mcShowCompound,setMcShowCompound]=useState(true)
  const [mcShowBH,setMcShowBH]=useState(true)
  const [mcShowSP500,setMcShowSP500]=useState(true)
  const [mcShowOccupancy,setMcShowOccupancy]=useState(true)
  const [mcOccMode,setMcOccMode]=useState('compound')  // own filter for MC capital chart
  const mcChartRef=useRef(null)
  const savedRangeRef=useRef(null)   // preserve zoom when changing asset
  const [metricsStrats,setMetricsStrats]=useState(['simple','compound','bh'])  // which strat panels to show
  const [showIndivOccupancy,setShowIndivOccupancy]=useState(true)  // % capital invertido chart for individual
  const [indivOccMode,setIndivOccMode]=useState('compound')  // independent filter for indiv occupancy chart

  const debounceRef=useRef(null),chartApiRef=useRef(null),contentRef=useRef(null)

  const mcChartApiRef=useRef(null)

  // ── TradeLog state ───────────────────────────────────────────
  const [tlTrades,setTlTrades]=useState([])
  const [tlLoading,setTlLoading]=useState(false)
  const [tlError,setTlError]=useState(null)
  const [tlSelected,setTlSelected]=useState(null)      // trade seleccionado en detalle
  const [tlMultiSel,setTlMultiSel]=useState(new Set()) // ids seleccionados para borrado
  const [tlMultiMode,setTlMultiMode]=useState(false)   // modo multiselección activo
  const [tlTab,setTlTab]=useState('ops')               // 'ops'|'import'|'export'|'dashboard'
  const [tlFilterBroker,setTlFilterBroker]=useState('')
  const [tlFilterYear,setTlFilterYear]=useState('')
  const [tlFilterMonth,setTlFilterMonth]=useState('')  // '01'..'12'
  const [tlFilterType,setTlFilterType]=useState('')
  const [tlFilterStatus,setTlFilterStatus]=useState('') // ''|'open'|'closed'
  const [tlSearch,setTlSearch]=useState('')
  const tlSearchRef=useRef(null)
  const [tlFills,setTlFills]=useState([])
  const [tlExpandedGroups,setTlExpandedGroups]=useState(new Set())  // group_ids expanded
  const [tlFormOpen,setTlFormOpen]=useState(false)
  const [tlFilterStrat,setTlFilterStrat]=useState('')
  // ── tlFiltered: single source of truth for all filtered views ──
  // Respects: status, broker, year, month, strategy, search
  // All tabs (Ops table, Dashboard, Métricas panel) MUST use this, not tlTrades directly
  const tlFiltered = useMemo(()=>{
    return tlTrades.filter(t=>{
      if(tlFilterStatus && t.status!==tlFilterStatus) return false
      if(tlFilterBroker && t.broker!==tlFilterBroker) return false
      if(tlFilterStrat && (t.strategy||'')!==tlFilterStrat) return false
      if(tlSearch && !(t.symbol||'').toLowerCase().includes(tlSearch.toLowerCase())) return false
      if(tlFilterYear||tlFilterMonth){
        const d = (t.status==='closed' ? t.exit_date : null) || t.entry_date
        if(!d) return false
        if(tlFilterYear && !d.startsWith(tlFilterYear)) return false
        if(tlFilterMonth && d.slice(5,7)!==tlFilterMonth) return false
      }
      return true
    })
  },[tlTrades,tlFilterStatus,tlFilterBroker,tlFilterStrat,tlSearch,tlFilterYear,tlFilterMonth])
  const [tlFillsList,setTlFillsList]=useState([])  // fills entrada para modal
  const [tlExitFillsList,setTlExitFillsList]=useState([])  // fills salida para modal
  const [tlSideEdit,setTlSideEdit]=useState(false)   // edit panel in left sidebar
  const [tlCloseOpen,setTlCloseOpen]=useState(false)
  const [tlImportText,setTlImportText]=useState('')
  const [tlImportFormat,setTlImportFormat]=useState('ai')
  const [tlParsedRaw,setTlParsedRaw]=useState([])  // raw fills from parser
  const [tlParsed,setTlParsed]=useState([])          // displayed (grouped or not)
  const [tlGroupFills,setTlGroupFills]=useState(true)

  // ── Enriquece filas: detecta duplicados y cierres (totales/parciales) ──
  const enrichParsedRows = (rows) => {
    return rows.map(r => {
      let enriched = {...r}

      // Duplicate detection: same symbol + date + price + shares already in DB
      const isDup = tlTrades.some(t =>
        t.symbol === r.symbol &&
        t.entry_date === r.entry_date &&
        Math.abs(parseFloat(t.entry_price||0) - parseFloat(r.entry_price||0)) < 0.01 &&
        Math.abs(parseFloat(t.shares||0) - parseFloat(r.shares||0)) < 0.01
      )
      if (isDup) enriched._isDuplicate = true

      // Closure detection: any SELL fill (isolated or _orphanSell) → find open positions
      const isSellFill = r.fill_type === 'sell' || r._orphanSell
      if (isSellFill && !r._grouped) {
        const openPositions = [...tlTrades]
          .filter(t =>
            t.symbol === r.symbol &&
            (!t.status || t.status === 'open') &&
            !t.exit_date
          )
          .sort((a,b) => (a.entry_date||'') <= (b.entry_date||'') ? -1 : 1)  // oldest first

        if (openPositions.length === 1) {
          // Single open position → auto-assign
          const openPos    = openPositions[0]
          const openShares = parseFloat(openPos.shares||0)
          const sellShares = parseFloat(r.shares||0)
          enriched._closesTradeId  = openPos.id
          enriched._closesSymbol   = openPos.symbol
          enriched._openEntryDate  = openPos.entry_date
          enriched._openShares     = openShares
          enriched._sellShares     = sellShares
          enriched._isPartialClose = sellShares < openShares - 0.001
          enriched._isFullClose    = Math.abs(sellShares - openShares) < 0.001
          enriched._isExcessSell   = sellShares > openShares + 0.001
          if (enriched._isPartialClose) enriched._remainingShares = openShares - sellShares
        } else if (openPositions.length > 1) {
          // Multiple open positions → flag for user selection
          enriched._multipleOpen   = true
          enriched._openOptions    = openPositions.map(t=>({
            id: t.id,
            entry_date: t.entry_date,
            shares: parseFloat(t.shares||0),
            entry_price: t.entry_price,
          }))
          // Pre-select oldest (FIFO) but user can change
          const presel = openPositions[0]
          const openShares = parseFloat(presel.shares||0)
          const sellShares = parseFloat(r.shares||0)
          enriched._closesTradeId  = presel.id
          enriched._closesSymbol   = presel.symbol
          enriched._openEntryDate  = presel.entry_date
          enriched._openShares     = openShares
          enriched._sellShares     = sellShares
          enriched._isPartialClose = sellShares < openShares - 0.001
          enriched._isFullClose    = Math.abs(sellShares - openShares) < 0.001
          enriched._isExcessSell   = sellShares > openShares + 0.001
          if (enriched._isPartialClose) enriched._remainingShares = openShares - sellShares
        }
      }
      return enriched
    })
  }

  // ── Agrupa fills del parser en operaciones (FIFO cronológico) ──
  // Procesa todos los fills de cada símbolo en orden de fecha.
  // Las SELLs cierran las BUYs más antiguas disponibles (FIFO).
  // Las SELLs sin BUY previa = cierre huérfano (buscará en tlTrades).
  const groupParsedFills = (rows) => {
    if(!rows||rows.length===0) return rows
    // Agrupar por símbolo
    const bySymbol = {}
    rows.forEach(r=>{
      const k = r.symbol
      if(!bySymbol[k]) bySymbol[k]=[]
      bySymbol[k].push(r)
    })
    const result = []
    Object.entries(bySymbol).forEach(([sym, fills])=>{
      // Ordenar todos los fills cronológicamente
      const sorted = [...fills].sort((a,b)=>(a.entry_date||'') <= (b.entry_date||'') ? -1 : 1)
      // Cola FIFO de compras pendientes de cerrar
      // Cada elemento: { row, sharesLeft, buyFills:[] }
      const buyQueue = []

      sorted.forEach(fill=>{
        if(fill.fill_type==='buy'){
          buyQueue.push({ row:fill, sharesLeft:fill.shares, sellFills:[] })
        } else {
          // SELL: consumir BUYs de la cola en orden FIFO
          let sharesToAssign = fill.shares
          while(sharesToAssign > 0.001 && buyQueue.length > 0){
            const head = buyQueue[0]
            const take = Math.min(head.sharesLeft, sharesToAssign)
            head.sellFills.push({...fill, shares:take})
            head.sharesLeft -= take
            sharesToAssign  -= take
            if(head.sharesLeft < 0.001) buyQueue.shift()  // BUY fully consumed
          }
          // Shares restantes de la sell sin BUY previa = huérfana
          if(sharesToAssign > 0.001){
            result.push({
              ...fill, shares:sharesToAssign, _orphanSell:true,
              fill_type:'sell', status:'open'
            })
          }
        }
      })

      // Ahora convertir buyQueue entries a trades
      // Primero, detectar grupos contiguos de BUYs sin sells entre ellas
      // que se podrían agrupar (mismo día o sin venta intermedia)
      // Para simplicidad: cada BUY original = 1 fila resultado
      // Si tiene sellFills → trade cerrado (o parcial si sharesLeft > 0)
      // Si no tiene sellFills → abierto
      // BUYs consumidas parcialmente ya salieron de la cola

      // Reconstruir: iterar fills originales de buy en orden
      // (buyQueue ya tiene solo las NO totalmente consumidas)
      // Necesitamos rastrear qué fills tienen sellFills

      // Re-process: build output for each buy fill
      const allBuyFills = sorted.filter(f=>f.fill_type==='buy')
      // Map from fill object to accumulated sell fills (collected during FIFO above)
      // We need to redo this tracking properly
      // Simplest: re-run FIFO and build a map

      const buyMap = []  // {buyFill, sellFills, sharesUsed}
      allBuyFills.forEach(b=>buyMap.push({buyFill:b, sellFills:[], sharesUsed:0}))

      // Re-run FIFO with tracking
      let bIdx = 0
      const sellFillsSorted = sorted.filter(f=>f.fill_type==='sell')
      sellFillsSorted.forEach(sell=>{
        let remaining = sell.shares
        let si = bIdx
        while(remaining>0.001 && si<buyMap.length){
          const bm = buyMap[si]
          const available = bm.buyFill.shares - bm.sharesUsed
          if(available < 0.001){ si++; continue }
          const take = Math.min(available, remaining)
          bm.sellFills.push({...sell, shares:take})
          bm.sharesUsed += take
          remaining -= take
          if(bm.buyFill.shares - bm.sharesUsed < 0.001) si++
        }
        bIdx = si
      })

      // Build result rows from buyMap
      // Assign group_id: all open BUYs in this symbol batch share one group_id
      //   (scale-in / pyramid entries). Partially-closed BUY + remainder share another.
      const genId = ()=>([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g,c=>(c^(Math.random()*16>>c/4)).toString(16))

      // Group all open (no-sell) buys together if there are 2+
      const openBuys  = buyMap.filter(bm=>bm.sellFills.length===0)
      const closedBuys= buyMap.filter(bm=>bm.sellFills.length>0)
      const openGroupId  = openBuys.length>1 ? genId() : null

      buyMap.forEach(({buyFill, sellFills, sharesUsed})=>{
        if(sellFills.length===0){
          // Fully open buy — share group_id if multiple open buys
          result.push({...buyFill, status:'open',
            group_id: openGroupId || null
          })
        } else {
          // Has matching sells
          const totalSell = sellFills.reduce((s,f)=>s+f.shares,0)
          const avgSell   = sellFills.reduce((s,f)=>s+f.entry_price*f.shares,0)/totalSell
          const commSell  = sellFills.reduce((s,f)=>s+(f.commission_sell||0),0)
          const lastSell  = sellFills.reduce((a,b)=>a.entry_date>=b.entry_date?a:b)
          const isFull    = Math.abs(totalSell-buyFill.shares)<0.001
          const buyCount  = 1
          const sellCount = sellFills.length
          // If partial close → BUY closed + remainder share a group_id
          const partialGroupId = !isFull ? genId() : null
          result.push({
            ...buyFill,
            shares: Math.min(totalSell, buyFill.shares),
            exit_date:       lastSell.entry_date,
            exit_price:      parseFloat(avgSell.toFixed(4)),
            exit_currency:   lastSell.entry_currency||buyFill.entry_currency,
            commission_sell: commSell,
            fill_type: 'buy',
            status: isFull ? 'closed' : 'open',
            _grouped: sellFills.length>1,
            _buyCount: buyCount,
            _sellCount: sellCount,
            _fills: [buyFill, ...sellFills],
            group_id: partialGroupId,
          })
          if(!isFull){
            const remainder = buyFill.shares - totalSell
            result.push({
              ...buyFill, shares:remainder, status:'open',
              fill_type:'buy', _remainder:true,
              group_id: partialGroupId,
            })
          }
        }
      })

      // Orphan sells already pushed in first FIFO loop
    })
    return result
  }
  const [tlImportLoading,setTlImportLoading]=useState(false)
  const [tlForm,setTlForm]=useState({
    symbol:'',name:'',asset_type:'stock',broker:'ibkr',
    entry_date:'',entry_price:'',shares:'',entry_currency:'USD',
    commission_buy:0,fx_entry:'',fx_entry_manual:false,
    notes:'',strategy:'',import_source:'manual'
  })
  const [tlCloseForm,setTlCloseForm]=useState({
    exit_date:'',exit_price:'',exit_currency:'USD',commission_sell:0,fx_exit:'',fx_exit_manual:false
  })

  // FX helper: call directly from onChange (avoids useEffect TDZ issues in production)
  const tlFetchFx = useCallback((cur, rawDate) => {
    if(!cur || cur==='EUR') return
    const date = toIsoDate(rawDate) || new Date().toISOString().slice(0,10)
    if(!date || date.length < 8) return
    setTlForm(f=>({...f,_fxLoading:true,fx_entry_manual:false}))
    fetch(`/api/tradelog?action=fx&currency=${cur}&date=${date}`)
      .then(r=>r.json())
      .then(j=>{ if(j.fx) setTlForm(f=>({...f,fx_entry:parseFloat(j.fx).toFixed(4),_fxLoading:false})) })
      .catch(()=>setTlForm(f=>({...f,_fxLoading:false})))
  },[])

  // Abrir búsqueda de símbolo al escribir cualquier letra/número fuera de inputs
  useEffect(()=>{
    const onKey=(e)=>{
      if(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA'||e.target.tagName==='SELECT') return
      if(e.key==='Escape'){setSymSearchOpen(false);setSymSearchQ('');return}
      if(symSearchOpen) return
      if(e.key.length===1&&!e.ctrlKey&&!e.metaKey&&!e.altKey){
        setSymSearchQ(e.key.toUpperCase())
        setSymSearchOpen(true)
      }
    }
    window.addEventListener('keydown',onKey)
    return()=>window.removeEventListener('keydown',onKey)
  },[symSearchOpen])

  useEffect(()=>{
    if(symSearchOpen) setTimeout(()=>symSearchInputRef.current?.focus(),50)
  },[symSearchOpen])

  // alarmStatus[symbol][alarmId] = true|false|null
  const [alarmStatus,setAlarmStatus]=useState({})
  const [alarmStatusLoading,setAlarmStatusLoading]=useState(false)

  const reloadWatchlist=()=>{
    setWlLoading(true)
    fetchWatchlist()
      .then(data=>{ if(data.length>0) setWatchlist(data) })
      .catch(()=>{})
      .finally(()=>setWlLoading(false))
  }
  const stratLoadedRef=useRef(false)
  const reloadStrategies=(applyDefault=false)=>{
    setStrLoading(true)
    fetchStrategies()
      .then(data=>{
        setStrategies(data)
        // On first load only: apply default strategy from settings (if any)
        if(applyDefault&&!stratLoadedRef.current&&data.length>0){
          stratLoadedRef.current=true
          try{
            const sett=JSON.parse(localStorage.getItem('v50_settings')||'{}')
            const defId=sett.defaultStrategyId
            if(defId){
              const match=data.find(s=>s.id===defId)
              if(match) loadStrategyLegacy(match)
              // loadStrategyLegacy already calls loadRankingRemote internally
            }
          }catch(_){}
        }
      })
      .catch(()=>{})
      .finally(()=>setStrLoading(false))
  }
  const reloadConditions=()=>{
    setCondLoading(true)
    fetchConditions().then(d=>setConditions(d||[])).catch(()=>{}).finally(()=>setCondLoading(false))
  }

  const reloadAlarms=()=>{
    setAlarmLoading(true)
    fetchAlarms()
      .then(data=>{
        setAlarms(data)
        // Save condition name map to settings so Settings modal can show them
        const conditions=data.filter(a=>a.condition!=='price_level')
        if(conditions.length>0){
          try{
            const s=JSON.parse(localStorage.getItem('v50_settings')||'{}')
            if(!s.watchlist) s.watchlist={}
            const nameMap={}
            conditions.forEach(a=>{nameMap[a.id]=a.name})
            s.watchlist.alarmDotNames=nameMap
            // Legacy: migrate alarmDotIds → condDotIds (no-op if already done)
            // condDotIds is managed by Settings Watchlist tab
            localStorage.setItem('v50_settings',JSON.stringify(s))
          }catch(_){}
        }
      })
      .catch(()=>{})
      .finally(()=>setAlarmLoading(false))
  }

  // Cargar datos al montar
  useEffect(()=>{
    reloadWatchlist()
    reloadStrategies(true)  // true = apply default strategy from settings
    reloadAlarms()
    reloadConditions()
  },[])

  // Abrir editor watchlist
  const openEditItem=(item)=>{
    setEditingItem(item)
    setEditForm({
      symbol:item.symbol,name:item.name,group_name:item.group_name,
      list_name:item.list_name||'General',favorite:item.favorite||false,
      observations:item.observations||''
    })
  }
  const closeEditItem=()=>{setEditingItem(null);setEditForm({})}
  const saveEditItem=async()=>{
    setEditSaving(true)
    try{
      await upsertWatchlistItem({...editForm,id:editingItem?.id||undefined})
      reloadWatchlist(); closeEditItem()
    }catch(e){alert('Error: '+e.message)}
    finally{setEditSaving(false)}
  }
  const deleteItem=async(id)=>{
    if(!confirm('¿Eliminar este activo?')) return
    await deleteWatchlistItem(id); reloadWatchlist()
  }
  const newItem=()=>openEditItem({id:null,symbol:'',name:'',group_name:'Acciones',list_name:'General',favorite:false,observations:''})

  // Abrir editor estrategia
  const openEditStr=(s)=>{
    setEditingStr(s)
    setStrForm({
      name:s.name||'',
      years:s.years||5,
      capital_ini:s.capital_ini||(()=>{try{return JSON.parse(localStorage.getItem('v50_settings')||'{}')?.defaultCapital||1000}catch(_){return 1000}})(),
      allocation_pct:s.allocation_pct||100,
      color:s.color||'#00d4ff',
      observations:s.observations||''
    })
    // Use definition directly; seed condition_refs from FK columns if absent
    const def = (s.id && s.definition && Object.keys(s.definition).length>0)
      ? { ...s.definition }
      : (s.id ? { ...DEFAULT_DEFINITION } : {})
    if (!def.condition_refs) {
      def.condition_refs = {
        filter:     s.condition_filter_id     || null,
        setup:      s.condition_setup_id      || null,
        trigger:    s.condition_trigger_id    || null,
        abort:      s.condition_abort_id      || null,
        stop_loss:  s.condition_stop_loss_id  || null,
        exit:       s.condition_exit_id       || null,
        management: s.condition_management_id || null,
      }
    }
    // Backfill inline role params from condition library so the visual builder shows correct values
    // for strategies created before Phase 1 that used condition_refs
    const BUILDER_ROLES = ['filter','setup','trigger','abort','exit','stop_loss']
    BUILDER_ROLES.forEach(role => {
      if (!def[role] && def.condition_refs?.[role]) {
        const c = conditions.find(c => c.id === def.condition_refs[role])
        if (c) def[role] = { type: c.type, ...c.params }
      }
    })
    // Backfill from legacy definition.entry → definition.setup for old strategies
    if (!def.setup && def.entry?.type) def.setup = def.entry
    if (!def.stop_loss && def.stop?.type && ['tecnico','atr_based','none'].includes(def.stop.type)) def.stop_loss = def.stop
    setDefinition(def)
  }
  const closeEditStr=()=>{setEditingStr(null);setStrForm({})}
  const saveEditStr=async()=>{
    setStrSaving(true)
    try{
      const refs = definition?.condition_refs || {}
      const getCond = (id) => conditions.find(c => c.id === id)
      const condToParams = (c) => c ? { type: c.type, ...(c.params || {}) } : undefined

      // Prefer inline params from visual builder; fall back to linked condition from library
      const getParams = (role) => {
        const inline = definition?.[role]
        if (inline?.type) return inline
        const cond = getCond(refs[role])
        return cond ? condToParams(cond) : null
      }

      const entryParams  = getParams('setup') || getParams('trigger')
      const stopParams   = getParams('stop_loss')
      const exitParams   = getParams('exit')
      const filterParams = getParams('filter')
      const abortParams  = getParams('abort')
      const mgmtParams   = definition?.management || {}

      const builtDefinition = {
        ...definition,
        condition_refs: refs,
        ...(entryParams  ? { entry:  entryParams  } : {}),
        ...(stopParams   ? { stop:   stopParams   } : {}),
        ...(exitParams   ? { exit:   exitParams   } : {}),
        ...(filterParams ? { filter: { logic:'AND', conditions:[filterParams] } } : {}),
        ...(abortParams  ? { abort:  { conditions:[abortParams] }              } : {}),
        management: mgmtParams,
      }

      const payload={
        ...strForm,
        id:editingStr?.id||undefined,
        definition: builtDefinition,
        years:Number(strForm.years||5),
        capital_ini:Number(strForm.capital_ini||(()=>{try{return JSON.parse(localStorage.getItem('v50_settings')||'{}')?.defaultCapital||1000}catch(_){return 1000}})()),
        allocation_pct:Number(strForm.allocation_pct||100),
        // Only send real UUIDs — local_ IDs are localStorage-only and not valid for FK columns
        condition_filter_id:     refs.filter     && !refs.filter.startsWith('local_')     ? refs.filter     : null,
        condition_setup_id:      refs.setup      && !refs.setup.startsWith('local_')      ? refs.setup      : null,
        condition_trigger_id:    refs.trigger    && !refs.trigger.startsWith('local_')    ? refs.trigger    : null,
        condition_abort_id:      refs.abort      && !refs.abort.startsWith('local_')      ? refs.abort      : null,
        condition_stop_loss_id:  refs.stop_loss  && !refs.stop_loss.startsWith('local_')  ? refs.stop_loss  : null,
        condition_exit_id:       refs.exit       && !refs.exit.startsWith('local_')       ? refs.exit       : null,
        condition_management_id: refs.management && !refs.management.startsWith('local_') ? refs.management : null,
      }
      await upsertStrategy(payload)
      reloadStrategies(); closeEditStr()
    }catch(e){alert('Error: '+e.message)}
    finally{setStrSaving(false)}
  }
  const deleteStr=async(id)=>{
    if(!confirm('¿Eliminar esta estrategia?')) return
    await deleteStrategy(id); reloadStrategies()
  }
  const loadStrategyLegacy=(s)=>{
    // Load strategy params from definition into the cfg panel state
    const def  = s.definition || {}
    const entry = def.entry || {}
    const stop  = def.stop  || {}
    const mgmt  = def.management || {}
    const filt  = def.filters?.market?.[0] || {}
    setEmaR(entry.ma_fast || entry.ma_period || 10)
    setEmaL(entry.ma_slow || 11)
    setYears(s.years || 5)
    setCapitalIni(s.capital_ini || 10000)
    setTipoStop(stop.type === 'atr_based' ? 'atr' : stop.type === 'none' ? 'none' : 'tecnico')
    setAtrP(stop.atr_period || 14)
    setAtrM(stop.atr_mult || 1.0)
    setSinPerdidas(mgmt.sin_perdidas !== false)
    setReentry(mgmt.reentry !== false)
    setTipoFiltro(filt.condition || 'none')
    setSp500EmaR(filt.ma_fast || 10)
    setSp500EmaL(filt.ma_slow || 11)
    setStrForm(f=>({...f,_loadedName:s.name}))
    setStratName(s.name||'')
    setCurrentStratId(s.id||null)
    setSidePanel('config')
    setRankingData({});setRankingStratId(null);setRankingStratName('')
    if(s.id){
      loadRankingRemote(s.id).then(rd=>{
        if(rd){setRankingData(rd);setRankingStratId(s.id);setRankingStratName(s.name||'')}
      }).catch(()=>{})
    }
  }
  const newStrategy=()=>openEditStr({id:null})
  const duplicateStr=(s)=>openEditStr({...s,id:null,name:s.name+' (copia)'})

  // ── Condition editor ──
  const openEditCond=(c)=>{
    setEditingCond(c)
    setCondForm({
      name: c.name||'',
      description: c.description||'',
      type: c.type||'',
      params: c.params||{},
    })
    setSidePanel('conditions')
  }
  const closeEditCond=()=>{ setEditingCond(null); setCondForm({}) }
  const saveEditCond=async()=>{
    if(!condForm.name?.trim()) return
    setCondSaving(true)
    try {
      const payload={ name:condForm.name.trim(), description:condForm.description||'', type:condForm.type, params:condForm.params||{}, active:true }
      let saved
      if(editingCond?.id&&!editingCond.id.startsWith('local_')){
        const {updateCondition}=await import('../lib/conditions')
        await updateCondition(editingCond.id, payload)
        saved={...editingCond,...payload}
        setConditions(prev=>prev.map(c=>c.id===editingCond.id?saved:c))
      } else if(editingCond?.id?.startsWith('local_')){
        const {updateCondition}=await import('../lib/conditions')
        await updateCondition(editingCond.id, payload)
        saved={...editingCond,...payload}
        setConditions(prev=>prev.map(c=>c.id===editingCond.id?saved:c))
      } else {
        const {saveCondition}=await import('../lib/conditions')
        saved=await saveCondition(payload)
        setConditions(prev=>[...prev,saved])
      }
      closeEditCond()
    } catch(e){ console.error(e) }
    finally{ setCondSaving(false) }
  }
  const newCond=()=>openEditCond({id:null})
  const deleteCond=async(id)=>{
    if(!confirm('¿Eliminar esta condición?')) return
    const {deleteCondition}=await import('../lib/conditions')
    await deleteCondition(id)
    setConditions(prev=>prev.filter(c=>c.id!==id))
    if(editingCond?.id===id) closeEditCond()
  }

  // ── Alertas ──
  const openEditAlarm=(a)=>{
    setEditingAlarm(a)
    setAlarmForm({
      symbol: a.symbol||simbolo,           // always bound to active symbol
      condition:a.condition||'ema_cross_up',
      ema_r:a.ema_r||10,ema_l:a.ema_l||11,
      price_level:a.price_level||null,
      condition_detail:a.condition_detail||'price_above',
      condition_id:a.condition_id||null,
      params:a.params||{},
    })
  }
  const closeEditAlarm=()=>{setEditingAlarm(null);setAlarmForm({})}
  const saveAlarm=async()=>{
    setAlarmSaving(true)
    try{
      const sym = alarmForm.symbol||simbolo
      if(!sym) throw new Error('No hay símbolo activo')
      // Auto-generate name: "AAPL · Cruce alcista EMA" or "AAPL @ 150.00"
      const CTYPE_NAMES={ema_cross_up:'Cruce alcista EMA',ema_cross_down:'Cruce bajista EMA',
        price_above_ema:'Precio > EMA',price_below_ema:'Precio < EMA',
        price_above_ma:'Precio > MA',price_below_ma:'Precio < MA',
        rsi_above:'RSI sobre nivel',rsi_below:'RSI bajo nivel',
        rsi_cross_up:'RSI cruza ↑',rsi_cross_down:'RSI cruza ↓',
        macd_cross_up:'MACD ↑',macd_cross_down:'MACD ↓'}
      const isPriceAlarm = alarmForm.condition==='price_level'
      const autoName = isPriceAlarm
        ? `${sym} @ ${Number(alarmForm.price_level).toFixed(2)}`
        : `${sym} · ${CTYPE_NAMES[alarmForm.condition]||alarmForm.condition}`
      await upsertAlarm({...alarmForm, symbol:sym, name:autoName, id:editingAlarm?.id||undefined, active:true})
      reloadAlarms(); closeEditAlarm()
    }catch(e){alert('Error: '+e.message)}
    finally{setAlarmSaving(false)}
  }
  const removeAlarm=async(id)=>{
    if(!confirm('¿Eliminar esta alarma?')) return
    await deleteAlarm(id); reloadAlarms()
  }
  const newAlarm=()=>openEditAlarm({id:null})

  // Evalúa una condición sobre closes
  const evalCondition=(condition,closes,emaR,emaL)=>{
    if(!closes||closes.length<20) return null
    const ema=(vals,p)=>{const k=2/(p+1);let e=null;for(const v of vals){if(e===null)e=v;else e=v*k+e*(1-k)};return e}
    const last=closes.slice(-200)
    const er=ema(last,emaR), el=ema(last,emaL), price=last[last.length-1]
    if(er==null||el==null) return null
    if(condition==='ema_cross_up')    return er>el
    if(condition==='ema_cross_down')  return er<el
    if(condition==='price_above_ema') return price>er
    if(condition==='price_below_ema') return price<er
    return null
  }

  // Para cada símbolo de la watchlist, evalúa todas las alarmas globales
  // Count of triggered alarms across all watchlist symbols (for tab badge)
  const alarmActiveCount = Object.values(alarmStatus||{}).reduce((tot,sym)=>
    tot+Object.values(sym||{}).filter(v=>v?.active===true).length, 0)

  const refreshAlarmStatus=useCallback(async(wl,al)=>{
    const wlList=wl||watchlist
    const alarmList=al||alarms
    const symbols=wlList.map(w=>w.symbol)
    if(!symbols.length||!alarmList.length) return
    setAlarmStatusLoading(true)
    try{
      // Merge real alarms + library conditions for watchlist dots
      // If condDotIds empty/unset → evaluate ALL library conditions
      const condDotIds=(()=>{try{const s=JSON.parse(localStorage.getItem('v50_settings')||'{}');const ids=s?.watchlist?.condDotIds;return Array.isArray(ids)&&ids.length>0?ids:null}catch(_){return null}})()
      const allLibConds=lsGetConds()
      const libConds = condDotIds ? allLibConds.filter(c=>condDotIds.includes(c.id)) : allLibConds
      const pseudoAlarms = libConds.map(c=>({
        id: c.id,
        condition: c.type,
        ema_r: c.params?.ma_fast || c.params?.ma_period || 10,
        ema_l: c.params?.ma_slow || 11,
        params: c.params,
      }))
      // Avoid duplicates: real alarms take priority
      const realAlarmIds = new Set(alarmList.map(a=>a.id))
      const extraConds = pseudoAlarms.filter(p=>!realAlarmIds.has(p.id))
      const allEvalAlarms = [...alarmList.map(a=>({id:a.id,condition:a.condition,ema_r:a.ema_r,ema_l:a.ema_l,params:a.params})), ...extraConds]

      const res=await fetch('/api/status',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({symbols,alarms:allEvalAlarms})
      })
      const data=await res.json()
      const prev=alarmStatus||{}
    const newStatus=data||{}
    setAlarmStatus(newStatus)
    // Check if setting enabled: show popup on new active alarms
    try{
      const sett=JSON.parse(localStorage.getItem('v50_settings')||'{}')
      if(sett?.alarmas?.popupOnTrigger!==false){
        // Find newly triggered alarms (active in new but not in prev)
        const triggered=[]
        for(const sym of Object.keys(newStatus||{})){
          for(const aid of Object.keys(newStatus[sym]||{})){
            if(newStatus[sym]?.[aid]?.active===true && !prev[sym]?.[aid]?.active){
              const al=alarms.find(a=>a.id===aid)
              if(al) triggered.push({symbol:sym, name:al.name, condition:al.condition})
            }
          }
        }
        if(triggered.length>0) setAlarmPopup(triggered)
      }
    }catch(_){}
    }catch(e){console.error('refreshAlarmStatus error',e)}
    finally{setAlarmStatusLoading(false)}
  },[watchlist,alarms])

  // Recalcular cuando cargan alarmas O watchlist (ambos deben estar listos)
  useEffect(()=>{
    if(watchlist.length>0&&alarms.length>0) refreshAlarmStatus(watchlist,alarms)
  },[alarms,watchlist.length]) // eslint-disable-line

  // ── Ranking: ejecuta backtest en paralelo sobre toda la watchlist ──
  const calcRanking = useCallback(async (rankSymbols=null) => {
    const cfg = { emaR:Number(emaR), emaL:Number(emaL), years:Number(years),
      capitalIni:Number(capitalIni), tipoStop, atrPeriod:Number(atrP), atrMult:Number(atrM),
      sinPerdidas, reentry, tipoFiltro, sp500EmaR:Number(sp500EmaR), sp500EmaL:Number(sp500EmaL) }
    // Use the currently visible/filtered watchlist items
    // (passed as argument, falls back to full watchlist)
    const syms = (rankSymbols || watchlist).map(w=>w.symbol)
    setRankingRunning(true); setRankingError(null)
    setRankingProgress({done:0, total:syms.length})

    const sett = (()=>{try{return JSON.parse(localStorage.getItem('v50_settings')||'{}')}catch(_){return {}}})()
    const W = {
      winrate:   (sett.ranking?.w_winrate   ?? 25) / 100,
      factorben: (sett.ranking?.w_factorben ?? 25) / 100,
      cagr:      (sett.ranking?.w_cagr      ?? 25) / 100,
      robustez:  (sett.ranking?.w_robustez  ?? 20) / 100,
      dd:        (sett.ranking?.w_dd        ?? 5)  / 100,
    }
    const minTrades = sett.ranking?.minTrades ?? 3
    const BATCH = 4
    const results = {}
    for (let i=0; i<syms.length; i+=BATCH) {
      const batch = syms.slice(i, i+BATCH)
      await Promise.allSettled(batch.map(async sym => {
        try {
          const res = await fetch('/api/datos', {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ simbolo:sym, cfg })
          })
          const json = await res.json()
          if (!res.ok || !json.trades?.length) return
          const trades = json.trades
          if (trades.length < minTrades) return
          const wins=trades.filter(t=>t.pnlPct>=0), losses=trades.filter(t=>t.pnlPct<0)
          const winRate=(wins.length/trades.length)*100
          const gBrut=wins.reduce((s,t)=>s+t.pnlSimple,0), lBrut=losses.reduce((s,t)=>s+Math.abs(t.pnlSimple),0)
          const factorBen=lBrut>0?Math.min(gBrut/lBrut,9.99):9.99
          const totalDiasNat=json.startDate?(new Date(json.meta?.ultimaFecha)-new Date(json.startDate))/86400000:365*Number(years)
          const anios=Math.max(totalDiasNat/365.25,0.01)
          const capFinal=Number(capitalIni)+json.gananciaSimple
          const cagr=capFinal>0?(Math.pow(capFinal/Number(capitalIni),1/anios)-1)*100:-99
          const sorted3=[...trades].sort((a,b)=>b.pnlSimple-a.pnlSimple).slice(3)
          const ganRobust=sorted3.reduce((s,t)=>s+t.pnlSimple,0)
          const capRob=Number(capitalIni)+ganRobust
          const cagrRobust=capRob>0?(Math.pow(capRob/Number(capitalIni),1/anios)-1)*100:-99
          const maxDD=json.maxDDStrategy||0
          const norm=(v,min,max)=>Math.max(0,Math.min(100,(v-min)/(max-min)*100))
          const score=Math.max(0,Math.min(100,
            norm(winRate,20,80)*W.winrate +
            norm(factorBen,0.5,5)*W.factorben +
            norm(cagr,-20,60)*W.cagr +
            norm(cagrRobust,-20,50)*W.robustez -
            norm(maxDD,0,60)*W.dd
          ))
          results[sym]={score,metrics:{winRate,factorBen,cagr,cagrRobust,maxDD,trades:trades.length}}
        } catch(_){}
      }))
      setRankingProgress({done:Math.min(i+BATCH,syms.length),total:syms.length})
    }
    const sortedEntries=Object.entries(results).sort((a,b)=>b[1].score-a[1].score)
    sortedEntries.forEach(([sym],i)=>{results[sym].rank=i+1})
    setRankingData(results)
    setRankingRunning(false)
    setRankingProgress({done:0,total:0})
    // Save ranking linked to the currently loaded strategy
    setRankingStratId(currentStratId)
    setRankingStratName(stratName||'')
    saveRankingRemote(results, currentStratId||null).catch(()=>{})
  }, [watchlist,emaR,emaL,years,capitalIni,tipoStop,atrP,atrM,sinPerdidas,reentry,tipoFiltro,sp500EmaR,sp500EmaL,currentStratId,stratName])

  const run=useCallback(async(sym,payload)=>{
    setLoading(true);setError(null)
    try{
      const body = payload.definition
        ? { simbolo:sym, definition:payload.definition }
        : { simbolo:sym, cfg:payload.cfg||payload }
      const res=await fetch('/api/datos',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
      const json=await res.json()
      if(!res.ok)throw new Error(json.error||'Error')
      setResult(json)
    }catch(e){setError(e.message)}finally{setLoading(false)}
  },[])

  // ── Guardar estrategia en Supabase ──
  const saveStrategy=useCallback(async(overwriteId=null)=>{
    setStratSaving(true); setStratMsg(null)
    try{
      const body={ name:stratName, description:stratDesc,
        years:Number(years), capital_ini:Number(capitalIni),
        definition:{ ...definition }, color:stratColor }
      const method = overwriteId ? 'PUT' : 'POST'
      if(overwriteId) body.id = overwriteId
      const res=await fetch('/api/strategies',{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
      const json=await res.json()
      if(!res.ok) throw new Error(json.error||'Error')
      // Recargar lista
      const list=await fetch('/api/strategies').then(r=>r.json())
      if(Array.isArray(list)) setStrategies(list)
      setCurrentStratId(json?.id||overwriteId||null)
      setStratMsg({type:'ok',text:'Estrategia guardada ✓'})
    }catch(e){ setStratMsg({type:'err',text:e.message}) }
    finally{ setStratSaving(false) }
  },[stratName,stratDesc,simbolo,years,capitalIni,definition,stratColor])

  // ── Cargar estrategia guardada en el builder ──
  const loadStrategy=useCallback((strat)=>{
    setDefinition(strat.definition||DEFAULT_DEFINITION)
    setStratName(strat.name||'')
    setStratDesc(strat.description||'')
    setStratColor(strat.color||'#00d4ff')
    setCurrentStratId(strat.id)
    // symbol intentionally not stored in strategy (apply to any asset separately)
    setStratTab('build')
    setStratMsg({type:'ok',text:`Cargada: ${strat.name}`})
    // Load saved ranking for this strategy (clear if none)
    setRankingData({});setRankingStratId(null);setRankingStratName('')
    if(strat.id){
      loadRankingRemote(strat.id).then(rd=>{
        if(rd){setRankingData(rd);setRankingStratId(strat.id);setRankingStratName(strat.name||'')}
      }).catch(()=>{})
    }
  },[])

  // ── Eliminar estrategia ──
  const deleteStrategy=useCallback(async(id)=>{
    if(!confirm('¿Eliminar esta estrategia?')) return
    await fetch(`/api/strategies?id=${id}`,{method:'DELETE'})
    setStrategies(prev=>prev.filter(s=>s.id!==id))
    if(currentStratId===id){setCurrentStratId(null);setStratMsg({type:'ok',text:'Estrategia eliminada'})}
  },[currentStratId])

  // ── Debounce: lanza backtest automáticamente al cambiar parámetros ──
  useEffect(()=>{
    if(debounceRef.current)clearTimeout(debounceRef.current)
    const payload = sidePanel==='strats'
      ? { definition:{ ...definition, capitalIni:Number(capitalIni), years:Number(years) } }
      : { cfg:{emaR:Number(emaR),emaL:Number(emaL),years:Number(years),capitalIni:Number(capitalIni),
              tipoStop,atrPeriod:Number(atrP),atrMult:Number(atrM),sinPerdidas,reentry,
              tipoFiltro,sp500EmaR:Number(sp500EmaR),sp500EmaL:Number(sp500EmaL)} }
    debounceRef.current=setTimeout(()=>run(simbolo, payload),800)
    return()=>clearTimeout(debounceRef.current)
  },[simbolo,emaR,emaL,years,capitalIni,tipoStop,atrP,atrM,sinPerdidas,reentry,tipoFiltro,
     sp500EmaR,sp500EmaL,definition,sidePanel,run])

  // ── TradeLog helpers ────────────────────────────────────────
  // ── TradeLog: storage mode (local vs supabase) ──────────────
  const TL_LS_KEY = 'v50_tradelog'
  // Genera formulario con defaults desde settings + estrategia activa
  const tlDefaultForm = (overrides={}) => {
    const s = JSON.parse(localStorage.getItem('v50_settings')||'{}')
    const today = todayDisplay()
    // Estrategia activa: la cargada en el backtest (currentStratId) o la primera disponible
    const activeStrat = strategies.find(st=>st.id===currentStratId)
      || strategies.find(st=>st.id===s.defaultStrategyId)
      || (strategies.length>0 ? strategies[0] : null)
    const stratName = activeStrat ? (activeStrat.name||`V50 EMA ${activeStrat.ema_r}/${activeStrat.ema_l}`) : 'V50'
    // Precio actual del activo activo en el chart principal
    const currentPrice = result?.meta?.ultimoPrecio ? String(result.meta.ultimoPrecio.toFixed(2)) : ''
    return {
      symbol: '', name: '', asset_type: 'stock',
      broker: s.tradelog?.defaultBroker || 'ibkr',
      entry_date: today,
      entry_price: currentPrice, shares: '',
      entry_currency: s.tradelog?.defaultCurrency || 'USD',
      commission_buy: s.tradelog?.defaultCommission ?? 0,
      fx_entry: '', fx_entry_manual: false,
      strategy: stratName,
      notes: '', import_source: 'manual',
      ...overrides
    }
  }

  const tlNumericFields = ['entry_price','exit_price','shares','commission_buy','commission_sell','fx_entry','fx_exit','capital_eur','pnl_eur','pnl_pct','pnl_currency']
  const tlNorm = (t) => {
    if(!t) return t
    const out = {...t}
    tlNumericFields.forEach(k=>{ if(out[k]!=null && out[k]!=='') out[k]=parseFloat(out[k])||0 })
    return out
  }
  const tlGetLS = () => { try{ return (JSON.parse(localStorage.getItem(TL_LS_KEY)||'[]')).map(tlNorm) }catch{ return [] } }
  const tlSetLS = (arr) => localStorage.setItem(TL_LS_KEY, JSON.stringify(arr))
  const tlUseLocal = () => {
    try { return !(getSupaUrl().startsWith('https') && getSupaKey().length > 10) }
    catch { return true }
  }

  // ── Guardar screenshot del gráfico ─────────────────────────
  // ── File System Access API helpers ──
  const tlGetFsHandle = () => new Promise(res=>{
    try{
      const req = indexedDB.open('v50_fs',2)
      req.onupgradeneeded = e => {
        const db = e.target.result
        if(!db.objectStoreNames.contains('handles')) db.createObjectStore('handles')
      }
      req.onsuccess = e => {
        try{
          const tx = e.target.result.transaction('handles','readonly')
          const r2 = tx.objectStore('handles').get('tradingApp')
          r2.onsuccess = ()=>res(r2.result||null)
          r2.onerror = ()=>res(null)
        }catch(_){ res(null) }
      }
      req.onerror = ()=>res(null)
    }catch(_){ res(null) }
  })
  const tlSetFsHandle = (handle) => new Promise(res=>{
    try{
      const req = indexedDB.open('v50_fs',2)
      req.onupgradeneeded = e => {
        const db = e.target.result
        if(!db.objectStoreNames.contains('handles')) db.createObjectStore('handles')
      }
      req.onsuccess = e => {
        try{
          const tx = e.target.result.transaction('handles','readwrite')
          const r2 = tx.objectStore('handles').put(handle,'tradingApp')
          r2.onsuccess = ()=>res(true)
          r2.onerror = ()=>res(false)
        }catch(_){ res(false) }
      }
      req.onerror = ()=>res(false)
    }catch(_){ res(false) }
  })
  const tlPickFolder = async() => {
    try{
      if(!window.showDirectoryPicker) {
        alert('Tu navegador no soporta la API de acceso a archivos. Usa Chrome o Edge (no funciona en Firefox ni Safari).')
        return false
      }
      // User picks the root folder; subfolders "Trades charts" and "Backup operativa" 
      // are created automatically inside it
      const handle = await window.showDirectoryPicker({mode:'readwrite',startIn:'documents'})
      const ok = await tlSetFsHandle(handle)
      return ok ? handle.name : false
    }catch(e){
      if(e.name!=='AbortError') alert('Error: '+e.message)
      return false
    }
  }

  const tlSaveScreenshot = async(trade) => {
    try {
      const s = JSON.parse(localStorage.getItem('v50_settings')||'{}')
      const months = s?.chart?.recentMonths ?? 3
      // 1. Asegurarse de que el gráfico principal tiene el símbolo correcto
      const tradeSym = (trade.symbol||'').toUpperCase()
      if(tradeSym && tradeSym !== simbolo.toUpperCase()) {
        setSimbolo(tradeSym)
        // Esperar debounce (800ms) + API call + render ≈ 3s total
        await new Promise(r=>setTimeout(r,3200))
      }
      // 2. Navegar al rango de la operación (meses antes + 3 semanas después de la entrada)
      if(chartApiRef.current && trade.entry_date) {
        try {
          const entryD = new Date(trade.entry_date)
          const fromD  = new Date(entryD); fromD.setMonth(fromD.getMonth() - months)
          const toD    = new Date(entryD); toD.setDate(toD.getDate() + 21)
          chartApiRef.current.setRange(
            fromD.toISOString().slice(0,10),
            toD.toISOString().slice(0,10)
          )
        } catch(_){}
      }
      // 3. Esperar que el rango renderice
      await new Promise(r=>setTimeout(r,600))
      const dataUrl = chartApiRef.current?.captureJpg?.(null, trade.symbol, parseFloat(trade.entry_price)||null)
      if(!dataUrl) return
      const sym = (trade.symbol||'TICKER').replace(/[^a-zA-Z0-9^]/g,'_')
      const date = (trade.entry_date||new Date().toISOString().slice(0,10))
      const strat = (trade.strategy||'V50').replace(/[^a-zA-Z0-9]/g,'_')
      const filename = `${sym}_${date}_${strat}.jpg`
      // Siempre preguntar dónde guardar (showSaveFilePicker si disponible, sino descarga directa)
      try {
        if(window.showSaveFilePicker) {
          const fileHandle = await window.showSaveFilePicker({
            suggestedName: filename,
            types: [{ description:'Imagen JPEG', accept:{'image/jpeg':['.jpg','.jpeg']} }],
            startIn: 'documents'
          })
          const w = await fileHandle.createWritable()
          const b64 = dataUrl.split(',')[1]
          const bytes = Uint8Array.from(atob(b64), c=>c.charCodeAt(0))
          await w.write(new Blob([bytes],{type:'image/jpeg'}))
          await w.close()
        } else {
          // Fallback navegadores sin API (Firefox, Safari): descarga directa
          const a = document.createElement('a')
          a.href = dataUrl; a.download = filename; a.click()
        }
      } catch(e) {
        if(e.name!=='AbortError') {
          // Si el usuario cancela → fallback silencioso
          const a = document.createElement('a')
          a.href = dataUrl; a.download = filename; a.click()
        }
      }
    } catch(_) {}
  }

  // Recalcula P&L localmente (refleja la lógica del backend)
  const tlCalcPnL = (t) => {
    const fxEntry = parseFloat(t.fx_entry)||1
    const fxExit  = parseFloat(t.fx_exit)||fxEntry
    const capital = (parseFloat(t.shares)||0) * (parseFloat(t.entry_price)||0) / fxEntry
    const commBuyEur  = (parseFloat(t.commission_buy)||0) / fxEntry
    const commSellEur = (parseFloat(t.commission_sell)||0) / fxExit
    let pnlEur=null, pnlPct=null, pnlCur=null
    if(t.status==='closed' && t.exit_price) {
      pnlCur = (parseFloat(t.exit_price) - parseFloat(t.entry_price)) * parseFloat(t.shares)
      pnlEur = pnlCur/fxExit - commBuyEur - commSellEur
      pnlPct = capital>0 ? (pnlEur/capital)*100 : null
    }
    return { capital_eur:capital, pnl_currency:pnlCur, pnl_eur:pnlEur, pnl_pct:pnlPct }
  }

  const loadTrades = useCallback(async () => {
    setTlLoading(true); setTlError(null)
    try {
      // ── modo localStorage (sin Supabase configurado) ──
      const local = tlUseLocal()
      if(local) {
        let trades = tlGetLS()
        if(tlFilterBroker) trades = trades.filter(t=>t.broker===tlFilterBroker)
        if(tlFilterYear)   trades = trades.filter(t=>{
          const d=(t.status==='closed'?t.exit_date:null)||t.entry_date
          return d&&d.startsWith(tlFilterYear)
        })
        if(tlFilterMonth)  trades = trades.filter(t=>{
          const d=(t.status==='closed'?t.exit_date:null)||t.entry_date
          return d&&d.slice(5,7)===tlFilterMonth
        })
        if(tlFilterStatus) trades = trades.filter(t=>t.status===tlFilterStatus)
        trades = trades.sort((a,b)=>b.entry_date?.localeCompare(a.entry_date||'')||b.created_at?.localeCompare(a.created_at||'')||0)
        // Enrich open trades with live prices client-side
        const openTrades = trades.filter(t=>t.status==='open')
        if(openTrades.length) {
          const priceCache = {}
          await Promise.all(openTrades.map(async t=>{
            const sym = (t.symbol||'').trim().toUpperCase()
            if(!sym) return
            try{
              if(!priceCache[sym]){
                const r=await fetch('/api/datos',{method:'POST',headers:{'Content-Type':'application/json'},
                  body:JSON.stringify({simbolo:sym,cfg:{emaR:10,emaL:11,years:1,capitalIni:1000,tipoStop:'none',atrPeriod:14,atrMult:1,sinPerdidas:false,reentry:false,tipoFiltro:'none',sp500EmaR:10,sp500EmaL:11}})})
                const j=await r.json()
                if(j.meta?.ultimoPrecio) priceCache[sym]={price:j.meta.ultimoPrecio,date:j.meta.ultimaFecha}
              }
              const cur = priceCache[sym]
              if(cur){
                t._current_price = cur.price
                t._current_date  = cur.date
                // fx_entry es EURUSD (>1): cuántos USD vale 1 EUR
                // Si viene <1 (registros antiguos con USDEUR), invertir
                let fxEntry = parseFloat(t.fx_entry)||1
                if(fxEntry < 1) fxEntry = 1/fxEntry  // compatibilidad hacia atrás
                const capitalEur = (parseFloat(t.shares)||0)*(parseFloat(t.entry_price)||0)/fxEntry
                const pnlCur = (cur.price - parseFloat(t.entry_price||0))*(parseFloat(t.shares)||0)
                t._pnl_float_eur = pnlCur/fxEntry - (parseFloat(t.commission_buy)||0)/fxEntry
                t._pnl_float_pct = capitalEur>0?(t._pnl_float_eur/capitalEur)*100:0
              }
            }catch(_){}
          }))
        }
        setTlTrades([...trades])
        return
      }
      // ── modo Supabase ──
      let url = '/api/tradelog?action=list'
      if(tlFilterBroker) url += `&broker=${tlFilterBroker}`
      if(tlFilterYear)   url += `&year=${tlFilterYear}`
      if(tlFilterMonth)  url += `&month=${tlFilterMonth}`
      if(tlFilterStatus) url += `&status=${tlFilterStatus}`
      const res = await fetch(url)
      const json = await res.json()
      if(!res.ok) throw new Error(json.error||'Error')
      setTlTrades(json.trades||[])
    } catch(e){
      // Si el error es de Supabase no configurado → caer a localStorage silenciosamente
      if(e.message?.includes('SUPABASE_URL') || e.message?.includes('no configurada') || e.message?.includes('does not exist') || e.message?.includes('relation')) {
        let trades = tlGetLS()
        if(tlFilterBroker) trades = trades.filter(t=>t.broker===tlFilterBroker)
        if(tlFilterYear)   trades = trades.filter(t=>{
          const d=(t.status==='closed'?t.exit_date:null)||t.entry_date
          return d&&d.startsWith(tlFilterYear)
        })
        if(tlFilterMonth)  trades = trades.filter(t=>{
          const d=(t.status==='closed'?t.exit_date:null)||t.entry_date
          return d&&d.slice(5,7)===tlFilterMonth
        })
        if(tlFilterStatus) trades = trades.filter(t=>t.status===tlFilterStatus)
        setTlTrades(trades.sort((a,b)=>(b.entry_date||'').localeCompare(a.entry_date||'')||(b.created_at||b.id||'').localeCompare(a.created_at||a.id||'')))
      } else {
        setTlError(e.message)
      }
    }
    finally { setTlLoading(false) }
  },[tlFilterBroker,tlFilterYear,tlFilterMonth,tlFilterStatus])

  useEffect(()=>{ if(sidePanel==='tradelog') loadTrades() },[sidePanel,loadTrades])

  const loadFills = useCallback(async(id)=>{
    try{
      if(tlUseLocal()){ setTlFills([]); return }
      const res=await fetch(`/api/tradelog?action=fills&id=${id}`)
      const json=await res.json()
      setTlFills(json.fills||[])
    }catch(_){ setTlFills([]) }
  },[])

  const tlSaveTrade = async(trade)=>{
    if(tlUseLocal()) {
      const all = tlGetLS()
      // Normalizar campos numéricos (los inputs devuelven strings)
      const n = (v) => v===''||v==null ? null : parseFloat(v)||0
      const norm = {...trade,
        entry_price: n(trade.entry_price), exit_price: n(trade.exit_price),
        shares: n(trade.shares), commission_buy: n(trade.commission_buy)||0,
        commission_sell: n(trade.commission_sell)||0,
        fx_entry: n(trade.fx_entry)||null, fx_exit: n(trade.fx_exit)||null,
      }
      const pnl = tlCalcPnL(norm)
      if(norm.id) {
        const idx = all.findIndex(t=>t.id===norm.id)
        const updated = {...norm,...pnl,updated_at:new Date().toISOString()}
        if(idx>=0) all[idx]=updated; else all.push(updated)
        tlSetLS(all)
        await loadTrades()
        return updated
      } else {
        const newT = {...norm,...pnl,id:'ls_'+Date.now()+'_'+Math.random().toString(36).slice(2,7),
          created_at:new Date().toISOString(),updated_at:new Date().toISOString()}
        tlSetLS([...all,newT])
        await loadTrades()
        return newT
      }
    }
    // Sanitize numeric fields for Supabase
    const n  = (v) => v===''||v==null||isNaN(parseFloat(v)) ? null : parseFloat(v)
    const n0 = (v) => parseFloat(v)||0  // NOT NULL columns default to 0
    const clean = {...trade,
      entry_price:    n0(trade.entry_price),
      exit_price:     n(trade.exit_price),
      shares:         n0(trade.shares),
      commission_buy: n0(trade.commission_buy),
      commission_sell:n0(trade.commission_sell),
      fx_entry: n(trade.fx_entry), fx_exit: n(trade.fx_exit),
    }
    const res=await fetch('/api/tradelog?action=save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(clean)})
    const json=await res.json()
    if(!res.ok) throw new Error(json.error||'Error')
    await loadTrades()
    return json.trade
  }

  const tlDeleteTrade = async(id)=>{
    if(tlUseLocal()) {
      tlSetLS(tlGetLS().filter(t=>t.id!==id))
      setTlSelected(null); setTlFills([])
      await loadTrades()
      return
    }
    await fetch('/api/tradelog?action=delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})})
    setTlSelected(null); setTlFills([])
    await loadTrades()
  }

  const tlDeleteMulti = async(ids)=>{
    if(!ids||ids.size===0) return
    if(!window.confirm(`¿Eliminar ${ids.size} operaci${ids.size===1?'ón':'ones'}? Esta acción no se puede deshacer.`)) return
    if(tlUseLocal()){
      tlSetLS(tlGetLS().filter(t=>!ids.has(t.id)))
      setTlSelected(null); setTlMultiSel(new Set()); setTlMultiMode(false)
      await loadTrades(); return
    }
    // Delete each via API
    await Promise.all([...ids].map(id=>
      fetch('/api/tradelog?action=delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})})
    ))
    setTlSelected(null); setTlMultiSel(new Set()); setTlMultiMode(false)
    await loadTrades()
  }

  const tlCloseTrade = async()=>{
    if(!tlSelected) return
    if(tlUseLocal()) {
      const all = tlGetLS()
      const idx = all.findIndex(t=>t.id===tlSelected.id)
      if(idx<0) return
      const updated = {...all[idx],...tlCloseForm,
        exit_price:parseFloat(tlCloseForm.exit_price),
        commission_sell:parseFloat(tlCloseForm.commission_sell||0),
        status:'closed'}
      updated.fx_exit = tlCloseForm.fx_exit_manual && tlCloseForm.fx_exit
        ? parseFloat(tlCloseForm.fx_exit) : updated.fx_entry||1
      const pnl = tlCalcPnL(updated)
      Object.assign(updated, pnl)
      all[idx] = updated
      tlSetLS(all)
      setTlCloseOpen(false)
      await loadTrades()
      setTlSelected(updated)
      return
    }
    const res=await fetch('/api/tradelog?action=close',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({id:tlSelected.id,...tlCloseForm})})
    const json=await res.json()
    if(!res.ok) throw new Error(json.error||'Error')
    setTlCloseOpen(false)
    await loadTrades()
    setTlSelected(json.trade||null)
  }

  const tlImportParse = async()=>{
    if(!tlImportText.trim()) return
    setTlImportLoading(true); setTlParsed([])
    try{
      const s=JSON.parse(localStorage.getItem('v50_settings')||'{}')
      const apiKey=s?.integrations?.groqKey||''
      const res=await fetch('/api/tradelog?action=parse',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({text:tlImportText,format:tlImportFormat,apiKey,
          ibkrDateFormat:s?.tradelog?.ibkrDateFormat||'DD/MM'})})

      const json=await res.json()
      if(!res.ok) throw new Error(json.error||'Error')
      const raw = json.parsed||[]
      setTlParsedRaw(raw)
      const grouped = groupParsedFills(raw)
      setTlParsed(enrichParsedRows(grouped))
    }catch(e){
      const msg = e.message||''
      // Detect Groq rate limit and extract wait time
      const waitMatch = msg.match(/try again in ([\d.]+)s/i)
      if(waitMatch){
        const secs = Math.ceil(parseFloat(waitMatch[1]))
        alert(`⏱ Límite de Groq alcanzado (demasiados tokens por minuto).

Espera ${secs} segundos y vuelve a intentarlo.

Si ocurre frecuentemente, reduce el texto pegado o actualiza tu plan en console.groq.com`)
      } else {
        alert('Error al parsear: '+msg)
      }
    }
    finally{setTlImportLoading(false)}
  }

  const tlImportConfirm = async(rows)=>{
    setTlImportLoading(true)
    try{
      const s=JSON.parse(localStorage.getItem('v50_settings')||'{}')
      const defBroker=s?.tradelog?.defaultBroker||'ibkr'
      let errors=[]
      for(const row of rows){
        // Campos válidos para trades_log — descartar campos UI-only del parser
        const {_fxLoading,_symSearch,_current_price,_current_date,_pnl_float_eur,_pnl_float_pct,...cleanRow}=row
        // Skip duplicates if user didn't remove them
        if(cleanRow._isDuplicate) continue
        // Strip ALL internal UI fields before sending to Supabase
        const {_isDuplicate,_closesTradeId,_closesSymbol,_openEntryDate,_openShares,
               _grouped,_buyCount,_sellCount,_fills,_orphanSell,_remainder,
               _isPartialClose,_isFullClose,_isExcessSell,_remainingShares,_sellShares,
               _multipleOpen,_openOptions,
               ...saveRow}=cleanRow

        if(cleanRow._closesTradeId) {
          const sellShares  = parseFloat(saveRow.shares||0)
          const openShares  = parseFloat(cleanRow._openShares||0)
          const isPartial   = cleanRow._isPartialClose
          const remaining   = cleanRow._remainingShares||0

          // Patch the existing open trade with exit info
          const patch={
            exit_date:      saveRow.entry_date,
            exit_price:     saveRow.entry_price,
            exit_currency:  saveRow.entry_currency||'USD',
            commission_sell:saveRow.commission_sell||0,
            shares:         sellShares,    // close only the sold qty
            status:         isPartial ? 'partial' : 'closed'
          }

          if(tlUseLocal()){
            const all=tlGetLS()
            const idx=all.findIndex(t=>t.id===cleanRow._closesTradeId)
            if(idx>=0){
              all[idx]={...all[idx],...patch}
              // If partial close → also create a new open trade for the remainder
              if(isPartial && remaining>0){
                all.push({...all[idx], id:'local_'+Date.now()+'r_'+Math.random().toString(36).slice(2),
                  shares:remaining, exit_date:null, exit_price:null, commission_sell:0, status:'open'})
              }
            }
            tlSetLS(all)
          } else {
            // Update existing trade (close/partial)
            const res=await fetch('/api/tradelog?action=save',{method:'POST',
              headers:{'Content-Type':'application/json'},
              body:JSON.stringify({id:cleanRow._closesTradeId,...patch})})
            const json=await res.json()
            if(!res.ok) errors.push(json.error||'Error cerrando '+saveRow.symbol)
            // If partial → create remainder as new open trade
            if(isPartial && remaining>0 && res.ok){
              const origTrade=tlTrades.find(t=>t.id===cleanRow._closesTradeId)||{}
              const remTrade={
                symbol: origTrade.symbol,
                entry_date: origTrade.entry_date,
                entry_price: origTrade.entry_price,
                entry_currency: origTrade.entry_currency,
                shares: remaining,
                broker: origTrade.broker||defBroker,
                strategy: origTrade.strategy||'',
                notes: (origTrade.notes?origTrade.notes+' | ':'')+'[Resto cierre parcial]',
                commission_buy: 0,
                fx_entry: origTrade.fx_entry,
                status: 'open',
                import_source: 'partial_remainder',
                group_id: origTrade.group_id || null
              }
              const r2=await fetch('/api/tradelog?action=save',{method:'POST',
                headers:{'Content-Type':'application/json'},body:JSON.stringify(remTrade)})
              const j2=await r2.json()
              if(!r2.ok) errors.push(j2.error||'Error creando resto parcial '+saveRow.symbol)
            }
          }
        } else {
          // If it's a SELL fill (no matching open found), skip — it's an orphan
          // The user already decided by not deleting it from preview → save as-is
          // but correct the field names so it doesn't look like a buy entry
          let trade
          if(saveRow.fill_type==='sell' && !saveRow.exit_date) {
            // Orphan sell: save as closed trade with entry=unknown, exit=the sell data
            // We DON'T have entry info so save minimal record for reference
            trade = {
              ...saveRow,
              status: 'open',
              broker: saveRow.broker||defBroker,
              notes: (saveRow.notes?saveRow.notes+' | ':'')+'[Venta importada sin compra asociada]'
            }
          } else {
            trade = {...saveRow, status: saveRow.status||'open', broker:saveRow.broker||defBroker}
          }
          if(tlUseLocal()){
            const all=tlGetLS()
            all.push({...trade, id:'local_'+Date.now()+'_'+Math.random().toString(36).slice(2)})
            tlSetLS(all)
          } else {
            const res=await fetch('/api/tradelog?action=save',{method:'POST',
              headers:{'Content-Type':'application/json'},body:JSON.stringify(trade)})
            const json=await res.json()
            if(!res.ok) errors.push(json.error||'Error guardando '+trade.symbol)
          }
        }
      }
      if(errors.length) alert('Errores al guardar:\n'+errors.join('\n'))
      setTlParsed([]); setTlParsedRaw([]); setTlImportText('')
      await loadTrades()
      setTlTab('ops')
    }catch(e){alert('Error al importar: '+e.message)}
    finally{setTlImportLoading(false)}
  }

  const TL_BROKERS=['ibkr','degiro','myinvestor','binance','manual']
  const TL_COLORS={ibkr:'#ffd166',degiro:'#00d4ff',myinvestor:'#00e5a0',binance:'#f0b90b',manual:'#9b72ff'}
  const TL_LABEL={ibkr:'IBKR',degiro:'DEGIRO',myinvestor:'MYINV',binance:'BNCE',manual:'Manual'}
  const fmtMoney=(v,cur='€')=>v==null?'—':`${v>=0?'+':''}${cur}${Math.abs(v).toLocaleString('es-ES',{minimumFractionDigits:2,maximumFractionDigits:2})}`
  const fmtCur=(v,cur)=>v==null?'—':`${cur==='EUR'?'€':'$'}${Math.abs(v).toLocaleString('es-ES',{minimumFractionDigits:2,maximumFractionDigits:2})}`

  // ── Backtesting runner ─────────────────────────────────────
  const runBacktesting=useCallback(async()=>{
    if(mcSelected.length<2){setMcError('Selecciona al menos 2 activos');return}
    // Validar pesos si modo custom
    if(mcMode==='custom'){
      const total=mcSelected.reduce((s,sym)=>s+(Number(mcWeights[sym])||0),0)
      if(Math.abs(total-100)>0.5){setMcError(`Los pesos suman ${total.toFixed(1)}% — deben sumar 100%`);return}
    }
    setMcLoading(true);setMcError(null);setMcResult(null)
    try{
      // rankMap para prioridad en modo rotativo: {symbol: rank}
      const rankMap={}
      mcSelected.forEach((sym,i)=>{
        const rd=rankingData[sym]
        rankMap[sym]=rd?.rank??i+1
      })
      // Normalizar pesos antes de enviar
      const weightsNorm={}
      if(mcMode==='custom'){
        const total=mcSelected.reduce((s,sym)=>s+(Number(mcWeights[sym])||0),0)
        mcSelected.forEach(sym=>{ weightsNorm[sym]=total>0?(Number(mcWeights[sym])||0)/total*100:100/mcSelected.length })
      }
      const res=await fetch('/api/multibacktest',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          symbols:mcSelected,
          modoAsig:mcMode,
          weights:weightsNorm,
          rankMap,
          cfg:{emaR:Number(emaR),emaL:Number(emaL),years:Number(years),capitalIni:Number(capitalIni),
            tipoStop,atrPeriod:Number(atrP),atrMult:Number(atrM),sinPerdidas,reentry,
            tipoFiltro,sp500EmaR:Number(sp500EmaR),sp500EmaL:Number(sp500EmaL),tipoCapital:mcCapital}
        })
      })
      const json=await res.json()
      if(!res.ok) throw new Error(json.error||'Error')
      setMcResult(json)
    }catch(e){setMcError(e.message)}finally{setMcLoading(false)}
  },[mcSelected,mcMode,mcWeights,mcCapital,emaR,emaL,years,capitalIni,tipoStop,atrP,atrM,sinPerdidas,reentry,tipoFiltro,sp500EmaR,sp500EmaL,rankingData])

  // Auto-inicializar pesos iguales cuando cambian activos seleccionados (modo custom)
  useEffect(()=>{
    if(mcMode!=='custom'||mcSelected.length===0) return
    setMcWeights(prev=>{
      const next={...prev}
      // Añadir nuevos activos con peso igual
      const existingTotal=mcSelected.reduce((s,sym)=>s+(Number(prev[sym])||0),0)
      const newSyms=mcSelected.filter(sym=>!prev[sym]&&prev[sym]!==0)
      if(newSyms.length>0){
        const eq=parseFloat((100/mcSelected.length).toFixed(1))
        mcSelected.forEach(sym=>{ next[sym]=eq })
      }
      // Limpiar activos eliminados
      Object.keys(next).forEach(sym=>{ if(!mcSelected.includes(sym)) delete next[sym] })
      return next
    })
  },[mcSelected,mcMode])

  // Dibuja líneas de entrada permanentes para operaciones abiertas del símbolo activo
  useEffect(()=>{
    if(!chartApiRef.current?.setOpenTradeLines) return
    const openForSym = tlTrades.filter(t=>
      t.status==='open' &&
      (t.symbol||'').toUpperCase()===(simbolo||'').toUpperCase()
    )
    chartApiRef.current.setOpenTradeLines(openForSym)
  },[simbolo, tlTrades, result])

  const metrics=result?calcMetrics(result.trades,Number(capitalIni),result.capitalReinv,result.gananciaSimple,result.ganBH||0,result.startDate,result.meta?.ultimaFecha,Number(years)):null
  // Load settings from Supabase on mount (overrides localStorage if newer)
  // Also apply ui defaults from localStorage (safe: runs client-side only)
  useEffect(()=>{
    // Restore ui defaults from localStorage (client-only, avoids SSR mismatch)
    try{
      const s=JSON.parse(localStorage.getItem('v50_settings')||'{}')
      if(s.ui?.defaultLabelMode!=null) setLabelMode(s.ui.defaultLabelMode)
      if(s.ui?.defaultMetricsLayout){ setMetricsLayout(s.ui.defaultMetricsLayout) }
      if(s.defaultCapital!=null)       setCapitalIni(s.defaultCapital)
    }catch(_){}
    // Restore acknowledged alarms
    try{
      const acked=JSON.parse(localStorage.getItem('v50_acked_alarms')||'[]')
      if(acked.length) setAckedAlarms(new Set(acked))
    }catch(_){}
    loadSettingsRemote().then(remote=>{
      if(remote){
        saveSettings(remote) // update local cache
        setTemaKey(k=>k+1)  // re-apply tema
        // Re-apply ui defaults from remote settings
        try{
          if(remote.ui?.defaultLabelMode!=null) setLabelMode(remote.ui.defaultLabelMode)
          if(remote.ui?.defaultMetricsLayout){ setMetricsLayout(remote.ui.defaultMetricsLayout) }
        }catch(_){}
      }
    })
  },[])

  // Apply tema font settings per section via <style> injection
  const [temaKey, setTemaKey] = useState(0)
  const [ctxMenu, setCtxMenu] = useState(null) // {x,y,section}
  const openCtx = (e, section) => {
    e.preventDefault(); e.stopPropagation()
    setCtxMenu({x: e.clientX, y: e.clientY, section})
  }
  useEffect(()=>{
    const applyFromLS=()=>{
      try{ const t=JSON.parse(localStorage.getItem('v50_settings')||'{}')?.tema||{}; applyTema(t.fonts||{}) }catch(_){}
    }
    applyFromLS()
    // Also try Supabase for persisted tema (using hardcoded getSupaUrl()/getSupaH())
    fetch(getSupaUrl()+'/rest/v1/user_settings?key=eq.v50_tema_fonts&select=value',{
      headers:getSupaH()
    }).then(r=>r.json()).then(rows=>{
      if(rows?.[0]?.value){
        const nf=JSON.parse(rows[0].value)
        applyTema(nf)
        const s=JSON.parse(localStorage.getItem('v50_settings')||'{}')
        s.tema=s.tema||{}; s.tema.fonts=nf
        localStorage.setItem('v50_settings',JSON.stringify(s))
      }
    }).catch(()=>{})
  },[temaKey])

  const sp5=result?.sp500Status
  // Watchlist display settings (read from localStorage, live)
  const wlSettings = (() => {
    try { return JSON.parse(localStorage.getItem('v50_settings')||'{}')?.watchlist||{} } catch(_){ return {} }
  })()
  const wlShowSearch    = wlSettings.showFilterSearch    !== false
  const wlShowLista     = wlSettings.showFilterLista     !== false
  const wlShowFavs      = wlSettings.showFilterFavorites !== false
  const wlShowAlarmFlt  = wlSettings.showFilterAlarms    !== false
  const wlShowRankBadge = wlSettings.showRankBadge       !== false
  // alarm dots now always visible when alarmDotIds has items (managed per-condition)
  const wlShowListBadge = wlSettings.showListBadge       !== false
  let spStatus='neutral',spTxt='SIN FILTRO'
  if(sp5&&tipoFiltro!=='none'){const blq=tipoFiltro==='precio_ema'?sp5.precio<sp5.emaR:sp5.emaR<sp5.emaL;spStatus=blq?'bad':'ok';spTxt=blq?'⚠ EVITAR ENTRADAS':'✓ APTO PARA OPERAR'}

  // Navegar al trade: scroll arriba + zoom en el gráfico
  const chartWrapRef=useRef(null)
  const navigateToTrade=(trade)=>{
    // Scroll instantáneo al top del contenedor + zoom al trade
    const el=contentRef.current
    if(el){
      // scrollTop directo: más fiable que scrollTo en todos los browsers
      el.scrollTop=0
      // Flash visual en el chart-wrap para confirmar navegación
      if(chartWrapRef.current){
        chartWrapRef.current.style.outline='1px solid #ffd166'
        setTimeout(()=>{if(chartWrapRef.current)chartWrapRef.current.style.outline=''},600)
      }
    }
    // Zoom al trade tras un tick (el scroll es síncrono, no necesitamos 400ms)
    setTimeout(()=>chartApiRef.current?.navigateTo(trade.entryDate,trade.exitDate),50)
  }

  // ── Strategy metadata (column order matches image: compound | bh | simple) ──
  const STRAT_ORDER=['compound','bh','simple']
  const STRAT_META={
    simple:  {label:'Simple',   color:'#00d4ff', bg:'rgba(0,212,255,0.08)'},
    compound:{label:'Compuesta',color:'#00e5a0', bg:'rgba(0,229,160,0.08)'},
    bh:      {label:'Buy&Hold', color:'#ffd166', bg:'rgba(255,209,102,0.08)'},
  }

  // ── Unified metrics table definition ──
  // Each row: { label, strats: {compound:val, bh:val, simple:val} or 'all'/'trade'/'notbh' }
  // null = empty cell for that strategy
  const buildUnifiedRows=(m, maxDDBH)=>{
    if(!m) return []
    const v=(val,color)=>({val,color})
    const wr=m.winRate>=50?'#00e5a0':'#ff4d6d'
    const fb=m.factorBen>=1?'#00e5a0':'#ff4d6d'
    // Strategy-specific gains
    const cS=m.ganSimple>=0?'#00e5a0':'#ff4d6d', cC=m.ganComp>=0?'#00e5a0':'#ff4d6d', cBH=m.ganBH>=0?'#00e5a0':'#ff4d6d'
    // B&H = buy & hold, no individual trades → trade-specific stats = null (—)
    return [
      {label:'Total Operaciones',     compound:v(m.n,'#ffd166'),            bh:null,                   simple:v(m.n,'#ffd166')},
      {label:'Total Días Invertido',  compound:v(m.totalDias,'#00d4ff'),    bh:null,                   simple:v(m.totalDias,'#00d4ff')},
      {label:'Días Promedio',         compound:v(fmt(m.diasProm,1,' días'),'#00d4ff'), bh:null,        simple:v(fmt(m.diasProm,1,' días'),'#00d4ff')},
      {label:`Tiempo Invertido (${fmt(m.aniosInv,2)}a)`, compound:v(fmt(m.tiempoInvPct,0,'%'),'#ffd166'), bh:null, simple:v(fmt(m.tiempoInvPct,0,'%'),'#ffd166')},
      {label:'Capital inv. medio',    compound:v(fmt(m.tiempoInvPct,1,'%'),'#9b72ff'), bh:null,       simple:v(fmt(m.tiempoInvPct,1,'%'),'#9b72ff')},
      {label:'Ganadoras',             compound:v(m.wins,'#00e5a0'),         bh:null,                   simple:v(m.wins,'#00e5a0')},
      {label:'Perdedoras',            compound:v(m.losses,'#ff4d6d'),       bh:null,                   simple:v(m.losses,'#ff4d6d')},
      {label:'Win Rate',              compound:v(fmt(m.winRate,1,'%'),wr),  bh:null,                   simple:v(fmt(m.winRate,1,'%'),wr)},
      {label:'Factor de Beneficio',   compound:v(fmt(m.factorBen,2),fb),   bh:null,                   simple:v(fmt(m.factorBen,2),fb)},
      {label:'Ganancia Media (%)',    compound:v(fmt(m.avgWin,2,'%'),'#00e5a0'),  bh:null,            simple:v(fmt(m.avgWin,2,'%'),'#00e5a0')},
      {label:'Pérdida Media (%)',     compound:v(fmt(m.avgLoss,2,'%'),'#ff4d6d'), bh:null,            simple:v(fmt(m.avgLoss,2,'%'),'#ff4d6d')},
      {label:'Ganancia (€)',          compound:v(fmt(m.ganComp,2,'€'),cC),  bh:v(fmt(m.ganBH,2,'€'),cBH), simple:v(fmt(m.ganSimple,2,'€'),cS)},
      {label:'Ganancia (%)',          compound:v(fmt(m.ganComp/Number(capitalIni)*100,2,'%'),cC), bh:v(fmt(m.ganBH/Number(capitalIni)*100,2,'%'),cBH), simple:v(fmt(m.ganTotalPct,2,'%'),cS)},
      {label:`CAGR (${fmt(m.anios,2)}a)`, compound:v(fmt(m.cagrC,2,'%'),m.cagrC>=0?'#00e5a0':'#ff4d6d'), bh:v(fmt(m.cagrBH,2,'%'),m.cagrBH>=0?'#00e5a0':'#ff4d6d'), simple:v(fmt(m.cagrS,2,'%'),m.cagrS>=0?'#00e5a0':'#ff4d6d')},
      {label:'Max Drawdown (%)',      compound:v(fmt(m.ddComp,2,'%'),'#ff4d6d'), bh:v(fmt(maxDDBH,2,'%'),'#ff4d6d'), simple:v(fmt(m.ddSimple,2,'%'),'#ff4d6d')},
    ]
  }

  // ── StratSelector — only controls metrics table, independent of charts ──
  const StratSelector=({strats,setStrats})=>(
    <div style={{display:'flex',gap:3,padding:'5px 10px',borderBottom:'1px solid var(--border)',flexWrap:'wrap',alignItems:'center',background:'rgba(0,0,0,0.18)'}}>
      <span style={{fontFamily:MONO,fontSize:10,color:'#7a9bc0',marginRight:3}}>Estrategia:</span>
      {STRAT_ORDER.map(s=>(
        <button key={s} onClick={()=>{
          const next=strats.includes(s)?strats.length>1?strats.filter(x=>x!==s):strats:[...strats,s]
          setStrats(next)
        }}
          style={{fontFamily:MONO,fontSize:10,padding:'2px 8px',borderRadius:3,cursor:'pointer',
            border:`1px solid ${strats.includes(s)?STRAT_META[s].color:'#2a3f55'}`,
            background:strats.includes(s)?STRAT_META[s].bg:'transparent',
            color:strats.includes(s)?STRAT_META[s].color:'#4a6a88',fontWeight:strats.includes(s)?600:400}}>
          {STRAT_META[s].label}
        </button>
      ))}
    </div>
  )

  // ── Unified metrics table: one concept column + per-strategy value columns ──
  const UnifiedMetricsTable=({rows, strats})=>{
    const activeCols=STRAT_ORDER.filter(s=>strats.includes(s))
    if(!rows.length) return null
    const sepStyle=(si)=>si>0?{borderLeft:'1px solid rgba(26,55,85,0.9)'}:{}
    return(
      <table style={{width:'100%',borderCollapse:'collapse',fontFamily:MONO,fontSize:11.5}}>
        <thead>
          <tr style={{background:'rgba(0,0,0,0.3)'}}>
            <th style={{padding:'5px 10px',textAlign:'left',color:'#7aaac8',fontSize:10,fontWeight:400,letterSpacing:'0.07em',borderBottom:'1px solid var(--border)',whiteSpace:'nowrap'}}>MÉTRICA</th>
            {activeCols.map((s,si)=>(
              <th key={s} style={{padding:'5px 12px',textAlign:'right',color:STRAT_META[s].color,fontSize:10,fontWeight:700,letterSpacing:'0.07em',borderBottom:`2px solid ${STRAT_META[s].color}`,background:STRAT_META[s].bg,...sepStyle(si)}}>
                {STRAT_META[s].label.toUpperCase()}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row,ri)=>(
            <tr key={row.label} style={{borderBottom:'1px solid rgba(20,40,65,0.9)',background:ri%2===0?'transparent':'rgba(255,255,255,0.012)'}}>
              <td style={{padding:'5px 10px',color:'#9ac8e2',fontSize:11,whiteSpace:'nowrap'}}>{row.label}</td>
              {activeCols.map((s,si)=>{
                const cell=row[s]
                return(
                  <td key={s} style={{padding:'5px 12px',textAlign:'right',fontWeight:600,color:cell?cell.color:'#2a4a6a',fontSize:12,...sepStyle(si)}}>
                    {cell?cell.val:'—'}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    )
  }
  // ── Single-column view: each active strat as its own block ──
  const SingleColumnTable=({rows, strats})=>{
    const activeCols=STRAT_ORDER.filter(s=>strats.includes(s))
    if(!rows.length||!activeCols.length) return null
    return(
      <div>
        {activeCols.map(s=>(
          <div key={s} style={{borderBottom:`2px solid ${STRAT_META[s].color}`,marginBottom:0}}>
            <div style={{padding:'4px 12px',background:STRAT_META[s].bg,borderBottom:`1px solid ${STRAT_META[s].color}40`,display:'flex',alignItems:'center',gap:6}}>
              <span style={{fontFamily:MONO,fontSize:11,color:STRAT_META[s].color,fontWeight:700,letterSpacing:'0.08em'}}>{STRAT_META[s].label.toUpperCase()}</span>
            </div>
            <table style={{width:'100%',borderCollapse:'collapse',fontFamily:MONO,fontSize:11.5}}>
              <tbody>
                {rows.map((row,ri)=>{
                  const cell=row[s]
                  if(!cell) return null
                  return(
                    <tr key={row.label} style={{borderBottom:'1px solid rgba(20,40,65,0.9)',background:ri%2===0?'transparent':'rgba(255,255,255,0.012)'}}>
                      <td style={{padding:'5px 12px',color:'#9ac8e2',fontSize:11,whiteSpace:'nowrap'}}>{row.label}</td>
                      <td style={{padding:'5px 12px',textAlign:'right',fontWeight:600,color:cell.color,fontSize:12}}>{cell.val}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    )
  }

  // ── MetricsWrapper: respects metricsView ──
  const MetricsWrapper=({rows, strats})=>(
    metricsView==='single'
      ? <SingleColumnTable rows={rows} strats={strats}/>
      : <UnifiedMetricsTable rows={rows} strats={strats}/>
  )

  const metricRows=[] // legacy: no longer used
  const MetricsTable=()=>{ const rows=buildUnifiedRows(metrics, result?.maxDDBH||0); return <MetricsWrapper rows={rows} strats={metricsStrats}/> }

  // Altura de los tabs = 33px aprox. (padding 8px top+bottom + 17px línea)
  const TAB_H=33

  return (
    <>
      <Head>
        <title>Trading Simulator V4.92</title>
        <meta name="viewport" content="width=device-width, initial-scale=1"/>
        <link rel="preconnect" href="https://fonts.googleapis.com"/>
        <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet"/>
        <style>{`
          /* ══ GLOBAL LEGIBILITY v4 ══ */
          :root {
            --text:#eef5ff; --text2:#cce0f8; --text3:#9acce8;
            --bg:#080c14; --bg2:#0a101a; --bg3:#0d1520;
            --border:#1a2d45; --accent:#00d4ff; --green:#00e5a0; --red:#ff4d6d;
            --font-size:13px;
            --font-family:"JetBrains Mono","Fira Code","IBM Plex Mono",monospace;
          }
          body { font-size:14px; color:#e0eeff; }
          /* ── Sidebar ── */
          .sidebar { font-size:13px; }
          .sidebar .sidebar-title { color:#f5fbff !important; font-weight:700; font-size:12px !important; letter-spacing:0.08em; text-transform:uppercase; padding-bottom:4px; border-bottom:1px solid #1a3050; margin-bottom:6px; }
          .sidebar label { color:#ecf5ff !important; font-size:13px !important; display:flex; flex-direction:column; gap:4px; font-weight:500; }
          .sidebar select, .sidebar input[type=text], .sidebar input[type=number] { color:#f5fbff !important; font-size:13px !important; background:#0d1828; border:1px solid #274462; padding:5px 8px; border-radius:4px; width:100%; box-sizing:border-box; }
          .sidebar .checkbox-row { color:#ecf5ff !important; font-size:13px !important; flex-direction:row !important; align-items:center; gap:8px; }
          .sidebar .sidebar-section { gap:10px; }
          .sidebar-title { margin-bottom:5px; }
          /* ── Section titles ── */
          .section-title { font-size:13px !important; color:#dceeff !important; letter-spacing:0.04em; font-weight:600; }
          /* ── Metrics panel ── */
          .metric-label { font-size:12px !important; color:#cce0f5 !important; }
          .metric-val { font-size:14px !important; font-weight:700; }
          /* ── Trade tables ── */
          .trades-table th { font-size:12px !important; color:#c0dcf0 !important; font-weight:600; padding:7px 10px !important; background:#0a111c; }
          .trades-table td { font-size:12.5px !important; color:#e8f2ff !important; padding:6px 10px !important; }
          .trades-table .tag { font-size:10px !important; padding:2px 6px !important; }
          /* ── Watchlist — symbol name clearly readable ── */
          .sidebar .wl-sym { font-size:13px !important; color:#f5fbff !important; font-weight:600; }
          .sidebar .wl-name { font-size:12px !important; color:#a8d4ec !important; font-weight:400; }
          /* ── MC sidebar ── */
          .sidebar .mc-sym { font-size:13px !important; color:#f5fbff !important; font-weight:600; }
          .sidebar .mc-name { font-size:12px !important; color:#a8d4ec !important; }
          /* ── Header SP500 bar — numbers clearly visible ── */
          .header-logo { font-size:14px !important; color:#f5fbff !important; font-weight:600; }
          .header-sp500-label { font-size:12px !important; color:#a8d4ec !important; }
          .header-sp500-val   { font-size:13px !important; color:#f0f8ff !important; font-weight:600; }
          .header-sp500-ema   { font-size:12px !important; color:#ffd166 !important; font-weight:600; }

          .status-badge { font-size:11px !important; }
        @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.75;transform:scale(1.2)} }
        @keyframes alarmPulse {
          0%,100% { opacity:1; box-shadow:var(--bc) 0 0 7px; }
          50% { opacity:0.25; box-shadow:none; }
        }
          /* ── Alarm badge numbers ── */
          .alarm-badge { font-size:11px !important; color:#f5fbff !important; font-weight:700; }
          /* ── Equity section ── */
          .equity-section .section-title { margin-bottom:4px; }
          /* ── Sidebar group/tab labels ── */
          .sidebar-tab { font-size:11px !important; color:#a8c8e0; }
          .sidebar-group-header { font-size:11px !important; color:#b0d0e8 !important; }
        `}</style>
      </Head>
      <div className="app">
        {/* ── HEADER ── */}
        <header className="header" style={{display:'flex',alignItems:'stretch',padding:0,height:TAB_H}} onContextMenu={e=>openCtx(e,'header')}>
          {/* Logo */}
          <div className="header-logo" style={{display:'flex',alignItems:'center',padding:'0 16px',flexShrink:0}}>
            <span className="dot"/>Trading Simulator V4.92
          </div>

          {/* SP500 bar — misma altura que tabs, inline en header */}
          {sp5&&(
            <div style={{
              display:'flex',alignItems:'center',gap:6,
              padding:'0 12px',
              borderLeft:'1px solid var(--border)',borderRight:'1px solid var(--border)',
              fontFamily:MONO,fontSize:11,flexShrink:0
            }}>
              <span className="header-sp500-label">SP500</span>
              <span className="header-sp500-val">{fmt(sp5.precio,2)}</span>
              <span className="header-sp500-label">EMA{sp500EmaR}</span>
              <span className="header-sp500-ema">{fmt(sp5.emaR,2)}</span>
              <span className="header-sp500-label">EMA{sp500EmaL}</span>
              <span style={{color:'#ff4d6d',fontWeight:600,fontFamily:MONO,fontSize:12}}>{fmt(sp5.emaL,2)}</span>
              <span className={`status-badge ${spStatus}`} style={{fontSize:10,padding:'1px 6px'}}>{spTxt}</span>
            </div>
          )}

          {/* Botones derecha */}
          <div style={{display:'flex',alignItems:'center',gap:8,marginLeft:'auto',padding:'0 12px'}}>
            <button onClick={()=>setRulerOn(r=>!r)} style={{
              background:rulerOn?'rgba(255,209,102,0.15)':'rgba(13,21,32,0.9)',
              border:`1px solid ${rulerOn?'#ffd166':'#2d3748'}`,
              color:rulerOn?'#ffd166':'#7a9bc0',
              fontFamily:MONO,fontSize:11,padding:'3px 9px',borderRadius:4,cursor:'pointer',
              display:'flex',alignItems:'center',gap:4
            }}>
              📏 {rulerOn?'ON':'Regla'}
            </button>
            {(()=>{
              const modes=[
                {label:'🏷 OFF',bg:'rgba(13,21,32,0.9)',border:'#2d3748',color:'#7a9bc0'},
                {label:'🏷 %',bg:'rgba(0,229,160,0.08)',border:'#00e5a0',color:'#00e5a0'},
                {label:'🏷 Full',bg:'rgba(0,229,160,0.15)',border:'#00e5a0',color:'#00e5a0'},
              ]
              const m=modes[labelMode]
              return(
                <button onClick={()=>setLabelMode(l=>(l+1)%3)} title={['Sin etiquetas','Solo porcentaje','Porcentaje + euros + días'][labelMode]} style={{
                  background:m.bg, border:`1px solid ${m.border}`, color:m.color,
                  fontFamily:MONO,fontSize:11,padding:'3px 9px',borderRadius:4,cursor:'pointer',
                  display:'flex',alignItems:'center',gap:4
                }}>
                  {m.label}
                </button>
              )
            })()}
            {result&&<button onClick={()=>window.open(`https://www.tradingview.com/chart/?symbol=${tvSym(simbolo)}`,'_blank')} style={{background:'#131722',border:'1px solid #2d3748',color:'#00d4ff',fontFamily:MONO,fontSize:11,padding:'3px 9px',borderRadius:4,cursor:'pointer',display:'flex',alignItems:'center',gap:4}}
              onMouseOver={e=>e.currentTarget.style.borderColor='#00d4ff'}
              onMouseOut={e=>e.currentTarget.style.borderColor='#2d3748'}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="#00d4ff"><path d="M3 3h7v2H5v14h14v-5h2v7H3V3zm11 0h7v7h-2V6.41l-9.29 9.3-1.42-1.42L17.59 5H14V3z"/></svg>
              TradingView
            </button>}
            {result&&metrics&&sidePanel!=='multi'&&<button
              onClick={()=>setMetricsLayout(l=>l==='grid'?'panel':l==='panel'?'multi':'grid')}
              title={metricsLayout==='grid'?'Cambiar a Panel simple':metricsLayout==='panel'?'Cambiar a Panel multi-columna':'Cambiar a Grid'}
              style={{background:'rgba(13,21,32,0.9)',border:'1px solid #1a2d45',color:'#7a9bc0',fontFamily:MONO,fontSize:11,padding:'3px 9px',borderRadius:4,cursor:'pointer'}}>
              {metricsLayout==='grid'?'☰ Panel':metricsLayout==='panel'?'⊞ Multi':'⊟ Grid'}
            </button>}
            <button onClick={()=>setSettingsOpen(true)} title="Configuración" style={{background:'rgba(13,21,32,0.9)',border:'1px solid #1a2d45',color:'#7a9bc0',fontFamily:MONO,fontSize:14,padding:'2px 8px',borderRadius:4,cursor:'pointer',lineHeight:1}} onMouseOver={e=>e.currentTarget.style.borderColor='#4a7fa0'} onMouseOut={e=>e.currentTarget.style.borderColor='#1a2d45'}>
              ⚙
            </button>
            <div style={{fontFamily:MONO,fontSize:11,color:'#5a7a95'}}>Stooq · diario</div>
          </div>
        </header>

        <div className="main">
          {/* ── VERTICAL NAV ── */}
          <nav
            onMouseEnter={()=>setNavExpanded(true)}
            onMouseLeave={()=>setNavExpanded(false)}
            style={{width:navExpanded?158:42,transition:'width 0.18s ease',display:'flex',flexDirection:'column',
              background:'var(--bg2)',borderRight:'1px solid var(--border)',flexShrink:0,overflow:'hidden',
              zIndex:15,paddingTop:6,paddingBottom:6}}
          >
            {[
              {id:'config',     icon:'⚙', label:'Estrategias'},
              {id:'conditions', icon:'🔧',label:'Condiciones'},
              {id:'alarms',     icon:'🔔',label:'Alertas',   badge:alarmActiveCount},
              {id:'watchlist',  icon:'📋',label:'Watchlist'},
              {id:'multi',      icon:'📊',label:'Backtesting'},
              {id:'tradelog',   icon:'📒',label:'TradeLog',  accent:'#9b72ff'},
            ].map(item=>(
              <button key={item.id}
                onClick={()=>{setSidePanel(item.id);if(item.id==='conditions')reloadConditions()}}
                title={!navExpanded?item.label:undefined}
                style={{display:'flex',alignItems:'center',gap:10,padding:'9px 11px',width:'100%',
                  background:sidePanel===item.id?'var(--bg3)':'transparent',
                  border:'none',borderLeft:sidePanel===item.id?`2px solid ${item.accent||'var(--accent)'}`:'2px solid transparent',
                  color:sidePanel===item.id?(item.accent||'var(--accent)'):'var(--text3)',
                  fontFamily:MONO,fontSize:16,cursor:'pointer',whiteSpace:'nowrap',textAlign:'left',
                  transition:'background 0.12s,color 0.12s',position:'relative'}}
              >
                <span style={{fontSize:16,flexShrink:0,width:20,textAlign:'center'}}>{item.icon}</span>
                <span style={{fontSize:11,letterSpacing:'0.06em',textTransform:'uppercase',opacity:navExpanded?1:0,transition:'opacity 0.1s'}}>
                  {item.label}
                </span>
                {item.badge>0&&<span style={{position:'absolute',top:4,left:navExpanded?undefined:24,right:navExpanded?10:undefined,
                  minWidth:14,height:14,borderRadius:7,background:'#ff4d6d',color:'#fff',fontSize:8,fontWeight:700,
                  display:'flex',alignItems:'center',justifyContent:'center',padding:'0 3px',
                  animation:'pulse 1.4s ease-in-out infinite'}}>{item.badge}</span>}
              </button>
            ))}
          </nav>

          {/* ── SIDEBAR ── */}
          <aside className="sidebar" style={{padding:0,gap:0,position:'relative',width:sidebarW,flexShrink:0,flexGrow:0}} onContextMenu={e=>openCtx(e,'sidebar')}>
            {/* Resize handle — right edge */}
            <div onMouseDown={e=>{sidebarResizing.current=true;sidebarStartX.current=e.clientX;sidebarStartW.current=sidebarW;document.body.style.cursor='col-resize';document.body.style.userSelect='none'}}
              style={{position:'absolute',top:0,right:0,width:4,height:'100%',cursor:'col-resize',zIndex:20,
                background:'transparent',transition:'background 0.15s'}}
              onMouseOver={e=>e.currentTarget.style.background='rgba(0,212,255,0.25)'}
              onMouseOut={e=>e.currentTarget.style.background='transparent'}/>

            {sidePanel==='conditions'&&(
              <div style={{display:'flex',flexDirection:'column',flex:1,overflow:'hidden'}}>
                {/* ── Header ── */}
                <div style={{padding:'8px 10px',borderBottom:'1px solid var(--border)',flexShrink:0}}>
                  <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:6}}>
                    <span className="sidebar-title" style={{margin:0,flex:1}}>Condiciones</span>
                    <button onClick={newCond} title="Nueva condición"
                      style={{background:'rgba(0,212,255,0.1)',border:'1px solid var(--accent)',color:'var(--accent)',fontFamily:MONO,fontSize:12,padding:'2px 8px',borderRadius:3,cursor:'pointer',lineHeight:1.4}}>+</button>
                  </div>
                  <div style={{position:'relative'}}>
                    <input
                      type="text"
                      placeholder="🔍 Buscar…"
                      value={condSearch}
                      onChange={e=>setCondSearch(e.target.value)}
                      style={{width:'100%',background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:11,padding:'4px 22px 4px 7px',borderRadius:4,boxSizing:'border-box'}}
                    />
                    {condSearch&&<span onClick={()=>setCondSearch('')}
                      style={{position:'absolute',right:6,top:'50%',transform:'translateY(-50%)',cursor:'pointer',color:'#a8ccdf',fontSize:11}}>✕</span>}
                  </div>
                </div>
                {/* ── List ── */}
                <div style={{overflowY:'auto',flex:1}}>
                  {condLoading&&<div style={{padding:'10px 12px',fontFamily:MONO,fontSize:12,color:'#a8ccdf'}}>⟳ Cargando…</div>}
                  {!condLoading&&conditions.length===0&&(
                    <div style={{padding:'14px 12px',fontFamily:MONO,fontSize:11,color:'var(--text3)',lineHeight:1.8}}>
                      Sin condiciones guardadas.
                      <br/>
                      <button onClick={newCond}
                        style={{marginTop:8,background:'rgba(0,212,255,0.08)',border:'1px solid var(--accent)',color:'var(--accent)',fontFamily:MONO,fontSize:11,padding:'4px 10px',borderRadius:4,cursor:'pointer'}}>
                        + Crear condición
                      </button>
                    </div>
                  )}
                  {conditions
                    .filter(c=>!condSearch||c.name?.toLowerCase().includes(condSearch.toLowerCase())||c.description?.toLowerCase().includes(condSearch.toLowerCase()))
                    .map(c=>{
                      const isEditing=editingCond?.id===c.id
                      return (
                        <div key={c.id||c.name}
                          style={{
                            display:'flex',alignItems:'center',gap:6,
                            padding:'7px 10px',
                            background:isEditing?'rgba(0,212,255,0.06)':'transparent',
                            borderLeft:isEditing?'2px solid var(--accent)':'2px solid transparent',
                            borderBottom:'1px solid rgba(255,255,255,0.04)',
                            cursor:'default',
                          }}>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontFamily:MONO,fontSize:11,color:'var(--text1)',fontWeight:isEditing?700:400,
                              overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                              {c.name||'—'}
                            </div>
                            {c.type&&<div style={{fontFamily:MONO,fontSize:10,color:'#4a7a9b',marginTop:1}}>{c.type}</div>}
                          </div>
                          <button onClick={()=>openEditCond(c)} title="Editar condición"
                            style={{background:'transparent',border:'none',color:'var(--text3)',cursor:'pointer',
                              fontSize:13,padding:'2px 4px',flexShrink:0,opacity:0.7,transition:'opacity 0.1s'}}
                            onMouseOver={e=>e.currentTarget.style.opacity='1'}
                            onMouseOut={e=>e.currentTarget.style.opacity='0.7'}>✎</button>
                        </div>
                      )
                    })
                  }
                </div>
              </div>
            )}

            {sidePanel==='config'&&(
              <div style={{display:'flex',flexDirection:'column',flex:1,overflow:'hidden'}}>
                {/* ── Header: título + búsqueda + botón nueva ── */}
                <div style={{padding:'8px 10px',borderBottom:'1px solid var(--border)',flexShrink:0}}>
                  <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:6}}>
                    <span className="sidebar-title" style={{margin:0,flex:1}}>Estrategias</span>
                    <button onClick={newStrategy} title="Nueva estrategia"
                      style={{background:'rgba(0,212,255,0.1)',border:'1px solid var(--accent)',color:'var(--accent)',fontFamily:MONO,fontSize:12,padding:'2px 8px',borderRadius:3,cursor:'pointer',lineHeight:1.4}}>+</button>
                  </div>
                  <div style={{position:'relative'}}>
                    <input
                      type="text"
                      placeholder="🔍 Buscar…"
                      value={strForm._search||''}
                      onChange={e=>setStrForm(p=>({...p,_search:e.target.value}))}
                      style={{width:'100%',background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:11,padding:'4px 22px 4px 7px',borderRadius:4,boxSizing:'border-box'}}
                    />
                    {strForm._search&&<span onClick={()=>setStrForm(p=>({...p,_search:''}))}
                      style={{position:'absolute',right:6,top:'50%',transform:'translateY(-50%)',cursor:'pointer',color:'#a8ccdf',fontSize:11}}>✕</span>}
                  </div>
                </div>

                {/* ── Lista ── */}
                <div style={{overflowY:'auto',flex:1}}>
                  {strLoading&&<div style={{padding:'10px 12px',fontFamily:MONO,fontSize:12,color:'#a8ccdf'}}>⟳ Cargando…</div>}
                  {!strLoading&&strategies.length===0&&(
                    <div style={{padding:'14px 12px',fontFamily:MONO,fontSize:11,color:'var(--text3)',lineHeight:1.8}}>
                      Sin estrategias guardadas.
                      <br/>
                      <button onClick={newStrategy}
                        style={{marginTop:8,background:'rgba(0,212,255,0.08)',border:'1px solid var(--accent)',color:'var(--accent)',fontFamily:MONO,fontSize:11,padding:'4px 10px',borderRadius:4,cursor:'pointer'}}>
                        + Crear estrategia
                      </button>
                    </div>
                  )}
                  {!strLoading&&(()=>{
                    const q=(strForm._search||'').toLowerCase()
                    const list=q?strategies.filter(s=>(s.name||'').toLowerCase().includes(q)||(s.description||'').toLowerCase().includes(q)):strategies
                    if(!list.length&&q) return <div style={{padding:'10px 12px',fontFamily:MONO,fontSize:11,color:'var(--text3)'}}>Sin resultados.</div>
                    return list.map(s=>{
                      const isActive=currentStratId===s.id
                      const col=s.color||'#00d4ff'
                      return (
                        <div key={s.id}
                          style={{padding:'7px 10px',display:'flex',alignItems:'center',gap:6,
                            borderBottom:'1px solid var(--border)',
                            background:isActive?'rgba(0,212,255,0.07)':'transparent',
                            borderLeft:`2px solid ${isActive?col:'transparent'}`,
                            transition:'background 0.1s'}}
                          onMouseOver={e=>{if(!isActive)e.currentTarget.style.background='rgba(255,255,255,0.03)'}}
                          onMouseOut={e=>{if(!isActive)e.currentTarget.style.background='transparent'}}>
                          {/* Color dot */}
                          <span style={{width:8,height:8,borderRadius:'50%',background:col,
                            flexShrink:0,display:'inline-block',boxShadow:isActive?`0 0 5px ${col}88`:'none'}}/>
                          {/* Name + meta */}
                          <div style={{flex:1,minWidth:0,cursor:'default'}}>
                            <div style={{fontFamily:MONO,fontSize:11,color:isActive?'var(--accent)':'#d0e8fa',
                              fontWeight:isActive?700:500,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                              {s.name}
                            </div>
                            <div style={{fontFamily:MONO,fontSize:9,color:'#5a7a95',marginTop:1}}>
                              {s.years||'?'}a · {s.definition?.setup?.ma_fast||s.ema_r||'?'}/{s.definition?.setup?.ma_slow||s.ema_l||'?'}
                            </div>
                          </div>
                          {/* Edit button */}
                          <button onClick={e=>{e.stopPropagation();openEditStr(s)}}
                            title="Editar"
                            style={{background:'transparent',border:'1px solid var(--border)',color:'var(--text3)',
                              fontFamily:MONO,fontSize:11,padding:'2px 6px',borderRadius:3,cursor:'pointer',
                              flexShrink:0,transition:'color 0.1s,border-color 0.1s'}}
                            onMouseOver={e=>{e.currentTarget.style.color='#a8ccdf';e.currentTarget.style.borderColor='#a8ccdf'}}
                            onMouseOut={e=>{e.currentTarget.style.color='var(--text3)';e.currentTarget.style.borderColor='var(--border)'}}>
                            ✎
                          </button>
                          {/* Play button */}
                          <button onClick={e=>{e.stopPropagation();loadStrategyLegacy(s)}}
                            title={`Ejecutar: ${s.name}`}
                            style={{background:isActive?`${col}22`:'rgba(0,212,255,0.08)',
                              border:`1px solid ${isActive?col:'var(--accent)'}`,
                              color:isActive?col:'var(--accent)',
                              fontFamily:MONO,fontSize:12,padding:'2px 7px',borderRadius:3,cursor:'pointer',
                              flexShrink:0,transition:'all 0.1s'}}
                            onMouseOver={e=>{e.currentTarget.style.background=`${col}33`}}
                            onMouseOut={e=>{e.currentTarget.style.background=isActive?`${col}22`:'rgba(0,212,255,0.08)'}}>
                            ▶
                          </button>
                        </div>
                      )
                    })
                  })()}
                </div>

                {/* ── Footer: estado de carga ── */}
                {loading&&<div style={{padding:'4px 10px',fontFamily:MONO,fontSize:11,color:'var(--accent)',borderTop:'1px solid var(--border)',flexShrink:0}}>⟳ Actualizando…</div>}
                {error&&<div style={{padding:'4px 10px',fontFamily:MONO,fontSize:11,color:'#ff4d6d',borderTop:'1px solid var(--border)',flexShrink:0}}>⚠ {error}</div>}
              </div>
            )}

            {sidePanel==='watchlist'&&(
              <div style={{display:'flex',flexDirection:'column',flex:1,overflow:'visible',minHeight:0}}>
                {/* ══ Fila 1: búsqueda + lista + favoritos + acciones ══ */}
                <div style={{padding:'5px 8px 3px',borderBottom:'none',flexShrink:0,display:'flex',gap:4,alignItems:'center'}}>
                  {/* Buscador compacto */}
                  {wlShowSearch&&<div style={{position:'relative',flex:'0 0 90px'}}>
                    <input type="text" placeholder="🔍" value={wlSearch} onChange={e=>setWlSearch(e.target.value)}
                      style={{width:'100%',background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:12,padding:'4px 20px 4px 7px',borderRadius:4,boxSizing:'border-box'}}/>
                    {wlSearch&&<span onClick={()=>setWlSearch('')} style={{position:'absolute',right:5,top:'50%',transform:'translateY(-50%)',cursor:'pointer',color:'#a8ccdf',fontSize:11}}>✕</span>}
                  </div>}
                  {/* Selector de lista */}
                  {wlShowLista&&<div style={{position:'relative',flex:1,minWidth:0}}>
                    <button onClick={()=>{setListDropOpen(o=>!o);setAlarmDropOpen(false)}} style={{width:'100%',background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:11,padding:'4px 6px',borderRadius:3,cursor:'pointer',display:'flex',justifyContent:'space-between',alignItems:'center',overflow:'hidden'}}>
                      <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{selectedLists.length===0?'Lista: Todas':selectedLists[0]}</span>
                      <span style={{flexShrink:0,marginLeft:2}}>{listDropOpen?'▲':'▼'}</span>
                    </button>
                    {listDropOpen&&(()=>{
                      const allLists=[...new Set(watchlist.map(w=>w.list_name||'General').filter(Boolean))]
                      return(
                        <div style={{position:'absolute',top:'100%',left:0,right:0,background:'var(--bg3)',border:'1px solid var(--border)',borderRadius:3,zIndex:60,boxShadow:'0 4px 16px rgba(0,0,0,0.7)',minWidth:120}}>
                          <div onClick={()=>{setSelectedLists([]);setWlSearch('');setListDropOpen(false)}} style={{padding:'6px 10px',fontFamily:MONO,fontSize:12,cursor:'pointer',color:selectedLists.length===0?'var(--accent)':'var(--text)',borderBottom:'1px solid var(--border)'}}>
                            Todas las listas
                          </div>
                          {allLists.map(l=>(
                            <div key={l} onClick={()=>{setSelectedLists([l]);setWlSearch('');setListDropOpen(false)}}
                              style={{padding:'6px 10px',fontFamily:MONO,fontSize:12,cursor:'pointer',display:'flex',alignItems:'center',gap:6,color:'var(--text)'}}>
                              <span style={{color:selectedLists.includes(l)?'var(--accent)':'var(--text3)',fontSize:11}}>{selectedLists.includes(l)?'●':'○'}</span>{l}
                            </div>
                          ))}
                        </div>
                      )
                    })()}
                  </div>}
                  {/* Filtro favoritos */}
                  {wlShowFavs&&<button onClick={()=>setOnlyFavs(f=>!f)} title={onlyFavs?'Mostrando solo favoritos':'Filtrar solo favoritos'}
                    style={{background:onlyFavs?'rgba(255,209,102,0.15)':'transparent',border:`1px solid ${onlyFavs?'#ffd166':'var(--border)'}`,color:onlyFavs?'#ffd166':'var(--text3)',fontFamily:MONO,fontSize:12,padding:'3px 6px',borderRadius:4,cursor:'pointer',flexShrink:0}}>
                    ★
                  </button>}

                  {(wlShowSearch||wlShowLista||wlShowFavs)&&<button onClick={()=>{setWlSearch('');setSelectedLists([]);setOnlyFavs(false);setSelectedAlarmIds([])}} title="Limpiar todos los filtros" style={{background:'rgba(255,77,109,0.08)',border:'1px solid #ff4d6d',color:'#ff4d6d',fontFamily:MONO,fontSize:11,padding:'3px 7px',borderRadius:3,cursor:'pointer',flexShrink:0}}>✕</button>}
                </div>


                {/* ── Lista de activos ── */}
                <div style={{overflowY:'auto',flex:1}}>
                  {wlLoading&&<div style={{padding:'10px 12px',fontFamily:MONO,fontSize:12,color:'#a8ccdf'}}>⟳ Cargando…</div>}
                  {!wlLoading&&(()=>{
                    const searchLower=wlSearch.toLowerCase()
                    const fCondId=(()=>{try{return JSON.parse(localStorage.getItem('v50_settings')||'{}')?.watchlist?.filterConditionId||null}catch(_){return null}})()
                    const filtered=watchlist.filter(w=>{
                      const matchList=selectedLists.length===0||selectedLists.includes(w.list_name||'General')
                      const matchSearch=!wlSearch||(w.symbol||'').toLowerCase().includes(searchLower)||(w.name||'').toLowerCase().includes(searchLower)
                      const matchFav=!onlyFavs||w.favorite
                      const symAlarms=alarmStatus[w.symbol]||{}
                      const matchAlarm=selectedAlarmIds.length===0||selectedAlarmIds.every(id=>symAlarms[id]?.active===true)
                      // Condition filter: when active, only show symbols where condition is triggered
                      // condFilterActive removed
                      return matchList&&matchSearch&&matchFav&&matchAlarm
                    })
                    // Sort: 1st by ranking, 2nd by favorite, 3rd alphabetical
                    const all=filtered.slice().sort((a,b)=>{
                      const ra=rankingData[a.symbol]?.rank, rb=rankingData[b.symbol]?.rank
                      if(ra!=null&&rb!=null) return ra-rb
                      if(ra!=null) return -1
                      if(rb!=null) return 1
                      if(a.favorite&&!b.favorite) return -1
                      if(!a.favorite&&b.favorite) return 1
                      return a.name.localeCompare(b.name)
                    })
                    const totalWl=watchlist.length
                    if(!all.length) return <div style={{padding:'12px',fontFamily:MONO,fontSize:11,color:'#8aadcc'}}>Sin activos para los filtros activos</div>
                    // Count badge + ranking button above list
                    const hasRanking=Object.keys(rankingData).length>0
                    const countBadge=(
                      <div style={{padding:'3px 8px',fontFamily:MONO,fontSize:11,color:'#a8ccdf',background:'var(--bg2)',borderBottom:'1px solid var(--border)',display:'flex',gap:5,alignItems:'center',flexWrap:'wrap'}}>
                        <span style={{color:'#a8c8e8',fontWeight:600}}>{all.length}</span>
                        <span style={{color:'#8abcd4'}}>activos</span>
                        {rankingRunning&&<span style={{color:'#ffd166',fontSize:10}}>⟳ {rankingProgress.done}/{rankingProgress.total}</span>}
                        {hasRanking&&!rankingRunning&&<span style={{color:'#00e5a0',fontSize:9}} title={rankingStratName?`Calculado con: ${rankingStratName}`:''}>🏆 {rankingStratName||'Ranking'}</span>}
                        <button onClick={()=>calcRanking(filtered)} disabled={rankingRunning} title="Calcular ranking de activos con la estrategia activa"
                          style={{marginLeft:'auto',background:rankingRunning?'rgba(13,21,32,0.5)':'rgba(255,209,102,0.1)',border:`1px solid ${rankingRunning?'#1a2d45':'rgba(255,209,102,0.4)'}`,color:rankingRunning?'#3d5a7a':'#ffd166',fontFamily:MONO,fontSize:9,padding:'2px 6px',borderRadius:3,cursor:rankingRunning?'not-allowed':'pointer',letterSpacing:'0.05em'}}>
                          {rankingRunning?'calculando…':'🏆 Ranking'}
                        </button>
                        {hasRanking&&<button onClick={()=>setRankingData({})} title="Limpiar ranking"
                          style={{background:'transparent',border:'1px solid #1a2d45',color:'#5a7a95',fontFamily:MONO,fontSize:9,padding:'2px 5px',borderRadius:3,cursor:'pointer'}}>✕</button>}
                      </div>
                    )
                    return (<>{countBadge}{all.map(w=>(
                      <div key={w.id||w.symbol}
                        style={{padding:'6px 10px',display:'flex',alignItems:'center',gap:6,borderBottom:'1px solid var(--border)',
                          background:simbolo===w.symbol?'rgba(0,212,255,0.07)':'transparent',
                          borderLeft:`2px solid ${fCondId&&alarmStatus[w.symbol]?.[fCondId]?.active===true?'#00e5a0':'transparent'}`,
                          transition:'border-color 0.2s'}}
                        onMouseOver={e=>e.currentTarget.style.background='rgba(255,255,255,0.03)'}
                        onMouseOut={e=>e.currentTarget.style.background=simbolo===w.symbol?'rgba(0,212,255,0.07)':'transparent'}>
                        {/* Ranking badge */}
                        {wlShowRankBadge&&(()=>{
                          const rd=rankingData[w.symbol]
                          if(!rd) return <span style={{width:16,flexShrink:0}}/>
                          const r=rd.rank
                          const col=r===1?'#ffd700':r===2?'#c0c0c0':r===3?'#cd7f32':r<=10?'#00d4ff':'#3d5a7a'
                          return(
                            <span title={`Rank #${r} · Score: ${rd.score?.toFixed(0)??'—'} · WR:${rd.metrics?.winRate?.toFixed(0)??'—'}% · FB:${rd.metrics?.factorBen?.toFixed(1)??'—'} · CAGR:${rd.metrics?.cagr?.toFixed(1)??'—'}%`}
                              style={{fontFamily:MONO,fontSize:9,fontWeight:700,color:col,flexShrink:0,minWidth:20,textAlign:'center',lineHeight:1}}>
                              {r<=3?['🥇','🥈','🥉'][r-1]:`#${r}`}
                            </span>
                          )
                        })()} 
                        {/* Estrella favorito */}
                        <span onClick={async(e)=>{e.stopPropagation();await upsertWatchlistItem({...w,favorite:!w.favorite});reloadWatchlist()}}
                          style={{cursor:'pointer',fontSize:12,color:w.favorite?'#ffd166':'var(--text3)',flexShrink:0}} title="Favorito">
                          {w.favorite?'★':'☆'}
                        </span>
                        {/* Nombre — clic carga el activo */}
                        <div onClick={()=>setSimbolo(w.symbol)} style={{flex:1,cursor:'pointer',minWidth:0}}>
                          <div style={{fontFamily:MONO,fontSize:11,color:simbolo===w.symbol?'var(--accent)':'#d0e8fa',fontWeight:600}}>{w.symbol}</div>
                          <div style={{fontFamily:MONO,fontSize:11,color:'#8aadcc',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{w.name}</div>
                        </div>
                        {/* Badges condiciones librería — círculos de color con velas */}
                        {(()=>{
                          const allLibConds = lsGetConds()
                          if(!allLibConds.length) return null
                          // condDotIds seleccionados en Settings; si vacío → mostrar todos
                          const condDotIds=(()=>{try{const s=JSON.parse(localStorage.getItem('v50_settings')||'{}');const ids=s?.watchlist?.condDotIds;return Array.isArray(ids)&&ids.length>0?ids:null}catch(_){return null}})()
                          const visibleConds = condDotIds ? allLibConds.filter(c=>condDotIds.includes(c.id)) : allLibConds
                          if(!visibleConds.length) return null
                          const symSt=alarmStatus[w.symbol]
                          const COND_COLORS=['#00e5a0','#ffd166','#00d4ff','#ff7eb3','#9b72ff','#ff4d6d']
                          const blinkN=(()=>{try{return JSON.parse(localStorage.getItem('v50_settings')||'{}')?.alarmas?.blinkCandles??3}catch(_){return 3}})()
                          const CTYPE_LABELS={ema_cross_up:'Cruce alcista EMA',ema_cross_down:'Cruce bajista EMA',price_above_ema:'Precio > EMA',price_below_ema:'Precio < EMA',price_above_ma:'Precio > Media',price_below_ma:'Precio < Media',rsi_above:'RSI sobre nivel',rsi_below:'RSI bajo nivel',rsi_cross_up:'RSI cruza ↑',rsi_cross_down:'RSI cruza ↓',macd_cross_up:'MACD ↑',macd_cross_down:'MACD ↓'}
                          return visibleConds.map((c,ci)=>{
                            const st=symSt?.[c.id]
                            // Show dot even without status data (grey = not evaluated yet)
                            const active=st?.active===true
                            const bars=st?.bars
                            const col=COND_COLORS[ci%COND_COLORS.length]
                            const label=bars!=null?String(bars):'·'
                            const shouldBlink=active&&bars!=null&&bars<=blinkN
                            const paramStr=c.params?.ma_fast?`EMA ${c.params.ma_fast}/${c.params.ma_slow}`:c.params?.ma_period?`MA(${c.params.ma_period})`:c.params?.period?`RSI(${c.params.period}) niv.${c.params.level}`:''
                            const tooltip=`${c.name}${paramStr?' · '+paramStr:''}${active?' ✓ activa'+(bars!=null?' · '+bars+'v':''):' — inactiva'}`
                            return(
                              <span key={c.id} title={tooltip}
                                style={{
                                  display:'inline-flex',alignItems:'center',justifyContent:'center',
                                  width:15,height:15,borderRadius:'50%',flexShrink:0,
                                  background:active?col:'rgba(42,63,85,0.5)',
                                  border:`1.5px solid ${active?col:'#2a3f55'}`,
                                  color:active?'#080c14':'#3d5a7a',
                                  fontFamily:MONO,fontSize:6,fontWeight:800,lineHeight:1,letterSpacing:'-0.5px',
                                  boxShadow:active?`0 0 6px ${col}55`:undefined,
                                  cursor:'default',
                                  animation:shouldBlink?`alarmPulse 1s ease-in-out infinite`:undefined,
                                }}>
                                {active?label:''}
                              </span>
                            )
                          })
                        })()}
                        {/* Lista badge */}
                        {wlShowListBadge&&<span style={{fontFamily:MONO,fontSize:8,color:'#7fb8d8',background:'var(--bg2)',padding:'1px 4px',borderRadius:2,flexShrink:0}}>{w.list_name||'General'}</span>}
                        {/* Editar */}
                        <span onClick={e=>{e.stopPropagation();openEditItem(w)}} style={{cursor:'pointer',color:'#a8ccdf',fontSize:11,padding:'0 2px',flexShrink:0}} title="Editar">✎</span>
                      </div>
                    ))}
                  </>)
                  })()}
                </div>

                {/* ── Modal editor activo — fixed sobre gráfico ── */}
                {editingItem!==null&&(
                  <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.72)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center'}} onClick={e=>{if(e.target===e.currentTarget)closeEditItem()}}>
                    <div style={{background:'#0d1824',border:'1px solid #1e3a52',borderRadius:8,padding:24,width:440,maxHeight:'85vh',overflowY:'auto',display:'flex',flexDirection:'column',gap:12,fontFamily:MONO,fontSize:12,boxShadow:'0 8px 48px rgba(0,0,0,0.8)'}}>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
                        <span style={{fontWeight:700,color:'var(--text)',fontSize:14}}>{editingItem.id?'Editar activo':'Nuevo activo'}</span>
                        <button onClick={closeEditItem} style={{background:'transparent',border:'none',color:'#a8ccdf',fontSize:16,cursor:'pointer',lineHeight:1}}>✕</button>
                      </div>
                      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                        <label style={{display:'flex',flexDirection:'column',gap:4,color:'#a8ccdf'}}>Símbolo
                          <input type="text" value={editForm.symbol||''} onChange={e=>{
                            const sym=e.target.value.toUpperCase()
                            setEditForm(p=>({...p,symbol:sym}))
                            // Cancelar búsqueda anterior
                            if(symSearchRef.current) clearTimeout(symSearchRef.current)
                            // Nombre local inmediato como placeholder
                            const nameLocal=lookupName(sym)
                            if(nameLocal&&!(editForm._nameTouched)) setEditForm(p=>({...p,symbol:sym,name:nameLocal}))
                            // Búsqueda real con debounce 600ms
                            symSearchRef.current=setTimeout(async()=>{
                              if(sym.length<1) return
                              const realName=await searchSymbolName(sym)
                              if(realName) setEditForm(p=>p._nameTouched?p:{...p,name:realName})
                            },600)
                          }} style={{background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:12,padding:'6px 8px',borderRadius:4}}/>
                        </label>
                        <label style={{display:'flex',flexDirection:'column',gap:4,color:'#a8ccdf'}}>Nombre
                          <input type="text" value={editForm.name||''} onChange={e=>setEditForm(p=>({...p,name:e.target.value,_nameTouched:true}))} style={{background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:12,padding:'6px 8px',borderRadius:4}}/>
                        </label>
                        <label style={{display:'flex',flexDirection:'column',gap:4,color:'#a8ccdf'}}>Grupo
                          <select value={editForm.group_name||'Acciones'} onChange={e=>setEditForm(p=>({...p,group_name:e.target.value}))} style={{background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:12,padding:'6px 8px',borderRadius:4}}>
                            {['Índices','Acciones','Crypto','Materias Primas'].map(o=><option key={o} value={o}>{o}</option>)}
                          </select>
                        </label>
                        <label style={{display:'flex',flexDirection:'column',gap:4,color:'#a8ccdf'}}>Lista
                          {(()=>{
                            const allLists=[...new Set(watchlist.map(w=>w.list_name||'General').filter(Boolean))]
                            return(<>
                              <input type="text" list="wl-lists" value={editForm.list_name||'General'}
                                onChange={e=>setEditForm(p=>({...p,list_name:e.target.value}))}
                                style={{background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:12,padding:'6px 8px',borderRadius:4}}/>
                              <datalist id="wl-lists">
                                {allLists.map(l=><option key={l} value={l}/>)}
                              </datalist>
                            </>)
                          })()}
                        </label>
                      </div>
                      <label style={{display:'flex',alignItems:'center',gap:8,color:'#a8ccdf',cursor:'pointer',padding:'4px 0'}}>
                        <input type="checkbox" checked={editForm.favorite||false} onChange={e=>setEditForm(p=>({...p,favorite:e.target.checked}))} style={{width:14,height:14}}/>
                        <span style={{color:'#ffd166'}}>★</span> Marcar como favorito
                      </label>
                      <label style={{display:'flex',flexDirection:'column',gap:4,color:'#a8ccdf'}}>
                        Observaciones
                        <textarea value={editForm.observations||''} onChange={e=>setEditForm(p=>({...p,observations:e.target.value}))} rows={3} style={{background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:12,padding:'6px 8px',borderRadius:4,resize:'vertical'}}/>
                      </label>
                      <div style={{display:'flex',gap:8,marginTop:6,paddingTop:12,borderTop:'1px solid var(--border)'}}>
                        <button onClick={saveEditItem} disabled={editSaving} style={{flex:1,background:'rgba(0,212,255,0.15)',border:'1px solid var(--accent)',color:'var(--accent)',fontFamily:MONO,fontSize:12,padding:'8px',borderRadius:4,cursor:'pointer',fontWeight:600}}>
                          {editSaving?'Guardando…':'Guardar'}
                        </button>
                        {editingItem.id&&<button onClick={()=>deleteItem(editingItem.id)} style={{background:'rgba(255,77,109,0.12)',border:'1px solid #ff4d6d',color:'#ff4d6d',fontFamily:MONO,fontSize:12,padding:'8px 14px',borderRadius:4,cursor:'pointer',display:'flex',alignItems:'center',gap:5}}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3,6 5,6 21,6"/><path d="M19,6l-1,14a2,2,0,0,1-2,2H8a2,2,0,0,1-2-2L5,6"/><path d="M10,11v6"/><path d="M14,11v6"/><path d="M9,6V4a1,1,0,0,1,1-1h4a1,1,0,0,1,1,1v2"/></svg>
                          Eliminar
                        </button>}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {sidePanel==='alarms'&&(
              <div style={{display:'flex',flexDirection:'column',flex:1,overflow:'hidden'}}>
                {/* Header */}
                <div style={{padding:'6px 8px',borderBottom:'1px solid var(--border)',display:'flex',gap:4,alignItems:'center',flexShrink:0}}>
                  <span style={{fontFamily:MONO,fontSize:12,color:'#a8ccdf',flex:1}}>Alertas</span>
                  <button onClick={()=>refreshAlarmStatus()} title="Actualizar estado" style={{background:'transparent',border:'none',color:'#5a7a95',fontFamily:MONO,fontSize:13,padding:'2px 5px',cursor:'pointer'}} disabled={alarmStatusLoading}>{alarmStatusLoading?'⟳':'↻'}</button>
                  <button onClick={newAlarm} title="Nueva alarma" style={{background:'rgba(0,212,255,0.1)',border:'1px solid var(--accent)',color:'var(--accent)',fontFamily:MONO,fontSize:13,padding:'3px 8px',borderRadius:3,cursor:'pointer'}}>+</button>
                </div>
                <div style={{overflowY:'auto',flex:1}}>
                  {alarmLoading&&<div style={{padding:'10px 12px',fontFamily:MONO,fontSize:12,color:'#a8ccdf'}}>⟳ Cargando…</div>}
                  {!alarmLoading&&(()=>{
                    const COLORS=['#00e5a0','#ffd166','#00d4ff','#ff7eb3','#9b72ff','#ff4d6d']
                    const blinkN=(()=>{try{return JSON.parse(localStorage.getItem('v50_settings')||'{}')?.alarmas?.blinkCandles??3}catch(_){return 3}})()
                    const COND_LABELS={
                      ema_cross_up:'↑ Cruce alcista EMA',ema_cross_down:'↓ Cruce bajista EMA',
                      price_above_ema:'Precio > EMA',price_below_ema:'Precio < EMA',
                      price_above_ma:'Precio > Media',price_below_ma:'Precio < Media',
                      rsi_above:'RSI sobre nivel',rsi_below:'RSI bajo nivel',
                      rsi_cross_up:'RSI cruza ↑',rsi_cross_down:'RSI cruza ↓',
                      macd_cross_up:'MACD cruza señal ↑',macd_cross_down:'MACD cruza señal ↓',
                    }

                    // Separate price alerts vs condition alerts
                    const priceAlerts=alarms.filter(a=>a.condition==='price_level')
                    const condAlarms=alarms.filter(a=>a.condition!=='price_level')

                    // Build triggered rows: ONLY those where condition is currently ACTIVE
                    // (not pending — no mostramos ruido de condiciones no disparadas)
                    const triggeredRows=[]
                    const ackedRows=[]
                    condAlarms.forEach((a,ai)=>{
                      const col=COLORS[ai%COLORS.length]
                      watchlist.forEach(w=>{
                        const st=alarmStatus[w.symbol]?.[a.id]
                        if(!st||st.active!==true) return   // skip not-active
                        const ackKey=`${w.symbol}::${a.id}`
                        const isAcked=ackedAlarms.has(ackKey)
                        const bars=st.bars
                        const shouldBlink=bars!=null&&bars<=blinkN
                        const row={a,w,col,isAcked,shouldBlink,ackKey,bars}
                        if(isAcked) ackedRows.push(row)
                        else triggeredRows.push(row)
                      })
                    })

                    const SectionHeader=({color,label,count,right})=>(
                      <div style={{padding:'5px 10px',fontFamily:MONO,fontSize:9,color,letterSpacing:'0.08em',textTransform:'uppercase',
                        background:'rgba(0,0,0,0.25)',borderBottom:'1px solid var(--border)',borderTop:'1px solid var(--border)',
                        display:'flex',alignItems:'center',gap:6}}>
                        <span>{label}</span>
                        <span style={{color:'#3d5a7a'}}>({count})</span>
                        {right&&<div style={{marginLeft:'auto'}}>{right}</div>}
                      </div>
                    )

                    const renderTriggered=(r,i)=>(
                      <div key={r.ackKey+i} style={{padding:'8px 10px',borderBottom:'1px solid rgba(20,40,65,0.7)',display:'flex',alignItems:'center',gap:8}}>
                        <span style={{width:9,height:9,borderRadius:'50%',flexShrink:0,background:r.col,
                          animation:r.shouldBlink?'alarmPulse 1s ease-in-out infinite':undefined,
                          boxShadow:`0 0 7px ${r.col}`}}/>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{display:'flex',alignItems:'baseline',gap:5}}>
                            <span style={{fontFamily:MONO,fontSize:12,fontWeight:700,color:r.col}}>{r.w.symbol}</span>
                            <span style={{fontFamily:MONO,fontSize:10,color:'#5a7a95',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.a.name}</span>
                          </div>
                          <div style={{fontFamily:MONO,fontSize:10,color:'#4a6a80',marginTop:1}}>
                            {COND_LABELS[r.a.condition]||r.a.condition}
                            {r.bars!=null&&<span style={{color:'#3d5a7a'}}> · {r.bars}v</span>}
                          </div>
                        </div>
                        <button onClick={()=>ackAlarm(r.w.symbol,r.a.id)} title="Reconocer"
                          style={{background:'rgba(0,229,160,0.08)',border:'1px solid #00e5a045',color:'#00e5a0',fontFamily:MONO,fontSize:9,padding:'3px 6px',borderRadius:3,cursor:'pointer',flexShrink:0}}>
                          ACK
                        </button>
                      </div>
                    )

                    const noActivity = priceAlerts.length===0 && triggeredRows.length===0 && ackedRows.length===0

                    return(
                      <div>
                        {/* ── Alertas de precio ── */}
                        {priceAlerts.length>0&&(
                          <div>
                            <SectionHeader color="#ffd166" label="🎯 Alertas de precio" count={priceAlerts.length}/>
                            {priceAlerts.map(a=>{
                              const isAbove=a.condition_detail==='price_above'
                              return(
                                <div key={a.id} style={{padding:'8px 10px',borderBottom:'1px solid rgba(20,40,65,0.7)',display:'flex',alignItems:'center',gap:8}}>
                                  <span style={{fontSize:14,color:isAbove?'#00e5a0':'#ff4d6d',flexShrink:0,lineHeight:1}}>{isAbove?'▲':'▼'}</span>
                                  <div style={{flex:1,minWidth:0}}>
                                    <div style={{fontFamily:MONO,fontSize:12,color:'#e8f4ff',fontWeight:700}}>
                                      {a.symbol} <span style={{color:'#5a7a95',fontWeight:400}}>@</span> <span style={{color:isAbove?'#00e5a0':'#ff4d6d'}}>{a.price_level?.toFixed(2)??'—'}</span>
                                    </div>
                                    <div style={{fontFamily:MONO,fontSize:10,color:'#5a7a95'}}>{a.name}</div>
                                  </div>
                                  <button onClick={async()=>{await deleteAlarm(a.id);reloadAlarms()}}
                                    style={{background:'transparent',border:'none',color:'#4a2a2a',fontSize:14,cursor:'pointer',padding:'0 4px',flexShrink:0}}
                                    onMouseOver={e=>e.currentTarget.style.color='#ff4d6d'} onMouseOut={e=>e.currentTarget.style.color='#4a2a2a'}>✕</button>
                                </div>
                              )
                            })}
                          </div>
                        )}

                        {/* ── Alertas activas (disparadas) ── */}
                        {triggeredRows.length>0&&(
                          <div>
                            <SectionHeader color="#ff6b6b" label="⚡ Disparadas" count={triggeredRows.length}
                              right={<button onClick={()=>triggeredRows.forEach(r=>ackAlarm(r.w.symbol,r.a.id))}
                                style={{fontFamily:MONO,fontSize:9,padding:'1px 6px',border:'1px solid #3a1a20',background:'rgba(255,77,109,0.08)',color:'#ff6b6b',borderRadius:3,cursor:'pointer'}}>
                                ACK todas</button>}/>
                            {triggeredRows.map(renderTriggered)}
                          </div>
                        )}

                        {/* ── Reconocidas — click Limpiar para ELIMINAR ── */}
                        {ackedRows.length>0&&(
                          <div>
                            <SectionHeader color="#3d5a7a" label="✓ Reconocidas" count={ackedRows.length}
                              right={
                                <button onClick={async()=>{
                                  // Get unique alarm ids from acked rows and delete them
                                  const uniqueIds=[...new Set(ackedRows.map(r=>r.a.id))]
                                  for(const id of uniqueIds){ await deleteAlarm(id) }
                                  reloadAlarms()
                                  // Clear acked state for these
                                  setAckedAlarms(prev=>{
                                    const next=new Set(prev)
                                    ackedRows.forEach(r=>next.delete(r.ackKey))
                                    return next
                                  })
                                }}
                                style={{fontFamily:MONO,fontSize:9,padding:'1px 6px',border:'1px solid #3a1a20',background:'rgba(255,77,109,0.06)',color:'#ff6060',borderRadius:3,cursor:'pointer'}}>
                                🗑 Eliminar</button>
                              }/>
                            {/* Group by alarm to avoid N×symbols rows */}
                            {[...new Map(ackedRows.map(r=>[r.a.id,r])).values()].map((r,i)=>{
                              const syms=ackedRows.filter(x=>x.a.id===r.a.id).map(x=>x.w.symbol)
                              return(
                              <div key={r.a.id+i} style={{padding:'7px 10px',borderBottom:'1px solid rgba(20,40,65,0.5)',display:'flex',alignItems:'center',gap:8,opacity:0.35}}>
                                <span style={{width:8,height:8,borderRadius:'50%',flexShrink:0,background:'#2a3f55'}}/>
                                <div style={{flex:1,minWidth:0}}>
                                  <span style={{fontFamily:MONO,fontSize:11,color:'#4a6a80',fontWeight:600}}>{r.a.name}</span>
                                  {syms.length>1
                                    ? <span style={{fontFamily:MONO,fontSize:10,color:'#3d5a7a',marginLeft:5}}>{syms.length} símbolos</span>
                                    : <span style={{fontFamily:MONO,fontSize:10,color:'#3d5a7a',marginLeft:5}}>{syms[0]}</span>
                                  }
                                </div>
                                <button onClick={async()=>{
                                    await deleteAlarm(r.a.id); reloadAlarms()
                                    const keysToRemove=ackedRows.filter(x=>x.a.id===r.a.id).map(x=>x.ackKey)
                                    setAckedAlarms(prev=>{const next=new Set(prev);keysToRemove.forEach(k=>next.delete(k));return next})
                                  }}
                                  title="Eliminar esta alerta"
                                  style={{background:'transparent',border:'none',color:'#3a1a20',fontSize:13,cursor:'pointer',padding:'0 3px'}}
                                  onMouseOver={e=>e.currentTarget.style.color='#ff4d6d'}
                                  onMouseOut={e=>e.currentTarget.style.color='#3a1a20'}>✕</button>
                              </div>
                            )})}
                          </div>
                        )}

                        {/* ── Estado vacío ── */}
                        {noActivity&&(
                          <div style={{padding:'24px 12px',textAlign:'center'}}>
                            <div style={{fontSize:28,marginBottom:8}}>🔕</div>
                            <div style={{fontFamily:MONO,fontSize:11,color:'#4a6a80',lineHeight:1.7}}>
                              Sin alertas activas.<br/>
                              Pulsa <b style={{color:'#00d4ff'}}>+</b> para crear una nueva.
                            </div>
                          </div>
                        )}

                        {/* ── Gestión: lista de condiciones/alertas configuradas ── */}
                        {condAlarms.length>0&&(
                          <div style={{marginTop:4}}>
                            <SectionHeader color="#5a7a95" label="⚙ Configuradas" count={condAlarms.length}/>
                            {condAlarms.map((a,ai)=>{
                              const col=COLORS[ai%COLORS.length]
                              const activeCount=watchlist.filter(w=>alarmStatus[w.symbol]?.[a.id]?.active===true).length
                              return(
                                <div key={a.id} style={{padding:'7px 10px',borderBottom:'1px solid rgba(20,40,65,0.5)',display:'flex',alignItems:'center',gap:8}}>
                                  <span style={{width:8,height:8,borderRadius:'50%',flexShrink:0,
                                    background:activeCount>0?col:'#2a3f55',
                                    boxShadow:activeCount>0?`0 0 5px ${col}`:undefined}}/>
                                  <div style={{flex:1,minWidth:0}}>
                                    <div style={{fontFamily:MONO,fontSize:11,color:'#cce0f5',fontWeight:600}}>{a.name}</div>
                                    <div style={{fontFamily:MONO,fontSize:10,color:'#4a6a80'}}>
                                      {COND_LABELS[a.condition]||a.condition}
                                      {activeCount>0&&<span style={{color:col}}> · {activeCount} activos</span>}
                                    </div>
                                  </div>
                                  <button onClick={()=>openEditAlarm(a)}
                                    style={{background:'transparent',border:'1px solid #1a2d45',color:'#7a9bc0',fontFamily:MONO,fontSize:10,padding:'2px 6px',borderRadius:3,cursor:'pointer'}}>✎</button>
                                  <button onClick={async()=>{await removeAlarm(a.id)}}
                                    style={{background:'transparent',border:'none',color:'#3a1a20',fontSize:13,cursor:'pointer',padding:'0 2px'}}
                                    onMouseOver={e=>e.currentTarget.style.color='#ff4d6d'} onMouseOut={e=>e.currentTarget.style.color='#3a1a20'}>✕</button>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })()}
                </div>
              </div>
            )}


            {/* ══ PANEL BACKTESTING ══ */}
            {sidePanel==='multi'&&(
              <div style={{display:'flex',flexDirection:'column',flex:1,overflowY:'auto'}}>
                {/* Botón ejecutar — fijado arriba */}
                <div style={{padding:'8px 10px',borderBottom:'1px solid var(--border)',background:'var(--bg2)',flexShrink:0}}>
                  {mcSelected.length>=2?(
                    <button onClick={runBacktesting} disabled={mcLoading}
                      style={{width:'100%',fontFamily:MONO,fontSize:11,padding:'7px 10px',borderRadius:4,cursor:mcLoading?'wait':'pointer',
                        background:mcLoading?'rgba(0,212,255,0.05)':'rgba(0,212,255,0.15)',
                        border:'1px solid var(--accent)',color:'var(--accent)',fontWeight:700,letterSpacing:'0.05em'}}>
                      {mcLoading?'⟳ Calculando...':'▶ EJECUTAR BACKTESTING'}
                    </button>
                  ):(
                    <button disabled style={{width:'100%',fontFamily:MONO,fontSize:12,padding:'7px 10px',borderRadius:4,cursor:'not-allowed',
                      background:'transparent',border:'1px solid #2a3f55',color:'#7aabc8',letterSpacing:'0.05em'}}>
                      ▶ EJECUTAR — selecciona 2+ activos
                    </button>
                  )}
                  {mcError&&<div style={{fontFamily:MONO,fontSize:12,color:'#ff4d6d',marginTop:5}}>⚠ {mcError}</div>}
                </div>

                {/* Modo de asignación */}
                <div style={{padding:'10px 12px',borderBottom:'1px solid var(--border)'}}>
                  <div style={{fontFamily:MONO,fontSize:12,color:'#c8dff5',marginBottom:6,letterSpacing:'0.05em',fontWeight:600}}>MODO DE ASIGNACIÓN</div>
                  {(()=>{
                    // eslint-disable-next-line
                    return [
                      {id:'slots',label:'Slots iguales',ready:true,
                        desc:'El capital se divide en N partes iguales, una por activo. Cada slot opera de forma independiente con su fracción fija. Ejemplo: 4 activos con €10.000 → cada uno opera con €2.500 en paralelo, sin interferir entre sí.'},
                      {id:'rotativo',label:'Capital rotativo',ready:true,
                        desc:'Un único pool de capital se asigna a los activos según van generando señales. Al cerrar una posición, el capital liberado vuelve al pool para la siguiente señal. Si hay señales simultáneas, se prioriza por ranking.'},
                      {id:'custom',label:'Pesos personalizados',ready:true,
                        desc:'Define manualmente qué porcentaje del capital va a cada activo. La suma debe ser 100%. Ideal para sobreponderar activos de mayor convicción.'},
                    ].map(m=>(
                      <div key={m.id} style={{marginBottom:3}}>
                        <div onClick={()=>m.ready&&setMcMode(m.id)}
                          style={{display:'flex',alignItems:'center',gap:8,padding:'6px 8px',borderRadius:4,
                            background:mcMode===m.id?'rgba(0,212,255,0.08)':'transparent',
                            border:`1px solid ${mcMode===m.id?'var(--accent)':'var(--border)'}`,
                            cursor:m.ready?'pointer':'not-allowed',opacity:m.ready?1:0.45}}>
                          <div style={{width:14,height:14,borderRadius:'50%',border:`2px solid ${mcMode===m.id?'var(--accent)':'#3d5a7a'}`,
                            background:mcMode===m.id?'var(--accent)':'transparent',flexShrink:0}}/>
                          <span style={{fontFamily:MONO,fontSize:12,color:mcMode===m.id?'var(--accent)':'#c8dff5',fontWeight:600,flex:1}}>
                            {m.label}{!m.ready&&<span style={{fontSize:8,color:'#ffd166',marginLeft:5,verticalAlign:'middle'}}>⏳</span>}
                          </span>
                          <span
                            title={m.desc}
                            style={{width:16,height:16,borderRadius:'50%',border:'1px solid #3d5a7a',color:'#3d5a7a',fontSize:10,
                              display:'flex',alignItems:'center',justifyContent:'center',cursor:'help',flexShrink:0,fontWeight:700,lineHeight:1}}>
                            ?
                          </span>
                        </div>
                      </div>
                    ))
                  })()}
                </div>

                {/* Pesos personalizados — solo visible cuando modo=custom y hay activos seleccionados */}
                {mcMode==='custom'&&mcSelected.length>0&&(()=>{
                  const total=mcSelected.reduce((s,sym)=>s+(Number(mcWeights[sym])||0),0)
                  const ok=Math.abs(total-100)<0.5
                  const distribute=()=>{
                    const eq=(100/mcSelected.length)
                    const w={}; mcSelected.forEach(s=>{w[s]=parseFloat(eq.toFixed(1))})
                    setMcWeights(w)
                  }
                  const normalize=()=>{
                    if(total===0){distribute();return}
                    const w={}; mcSelected.forEach(s=>{w[s]=parseFloat(((Number(mcWeights[s])||0)/total*100).toFixed(1))})
                    setMcWeights(w)
                  }
                  return(
                    <div style={{padding:'10px 12px',borderBottom:'1px solid var(--border)',flexShrink:0}}>
                      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:7}}>
                        <div style={{fontFamily:MONO,fontSize:11,color:'#c8dff5',fontWeight:600,letterSpacing:'0.05em'}}>PESOS</div>
                        <div style={{display:'flex',gap:4}}>
                          <button onClick={distribute}
                            style={{fontFamily:MONO,fontSize:9,padding:'2px 6px',borderRadius:3,cursor:'pointer',
                              border:'1px solid #2a4060',background:'transparent',color:'#7aabc8'}}>
                            Repartir igual
                          </button>
                          <button onClick={normalize}
                            style={{fontFamily:MONO,fontSize:9,padding:'2px 6px',borderRadius:3,cursor:'pointer',
                              border:'1px solid #2a4060',background:'transparent',color:'#7aabc8'}}>
                            Normalizar
                          </button>
                        </div>
                      </div>
                      <div style={{display:'flex',flexDirection:'column',gap:4}}>
                        {mcSelected.map(sym=>{
                          const v=mcWeights[sym]??''
                          return(
                            <div key={sym} style={{display:'flex',alignItems:'center',gap:6}}>
                              <span style={{fontFamily:MONO,fontSize:11,color:'#a8ccdf',flex:1,minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{sym}</span>
                              <div style={{display:'flex',alignItems:'center',gap:3}}>
                                <input type="number" min="0" max="100" step="0.1" value={v}
                                  onChange={e=>setMcWeights(prev=>({...prev,[sym]:e.target.value}))}
                                  style={{width:52,background:'var(--bg3)',border:'1px solid var(--border)',
                                    color:'var(--text)',fontFamily:MONO,fontSize:11,padding:'2px 5px',
                                    borderRadius:3,textAlign:'right'}}/>
                                <span style={{fontFamily:MONO,fontSize:11,color:'#5a7a9a'}}>%</span>
                              </div>
                              {/* mini barra visual */}
                              <div style={{width:40,height:6,borderRadius:3,background:'rgba(61,90,122,0.3)',overflow:'hidden',flexShrink:0}}>
                                <div style={{height:'100%',borderRadius:3,width:`${Math.min(100,Number(v)||0)}%`,
                                  background:ok?'#00d4ff':'#ffd166',transition:'width 0.2s'}}/>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                      {/* Indicador de suma */}
                      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginTop:7,paddingTop:5,borderTop:'1px solid var(--border)'}}>
                        <span style={{fontFamily:MONO,fontSize:10,color:'#7aabc8'}}>Suma total</span>
                        <span style={{fontFamily:MONO,fontSize:12,fontWeight:700,color:ok?'#00e5a0':Math.abs(total-100)<5?'#ffd166':'#ff4d6d'}}>
                          {total.toFixed(1)}% {ok?'✓':'⚠'}
                        </span>
                      </div>
                    </div>
                  )
                })()}

                {/* Selector de activos */}
                <div style={{display:'flex',flexDirection:'column',flex:1,minHeight:0}}>
                  {/* Filtros */}
                  <div style={{padding:'5px 8px',borderBottom:'1px solid var(--border)',flexShrink:0,display:'flex',gap:4,alignItems:'center'}}>
                    <input type="text" placeholder="🔍 Buscar..." value={mcSearch||''} onChange={e=>setMcSearch(e.target.value)}
                      style={{flex:1,background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:11,padding:'3px 7px',borderRadius:4,minWidth:0}}/>
                    <button onClick={()=>setMcOnlyFavs(f=>!f)}
                      style={{background:mcOnlyFavs?'rgba(255,209,102,0.15)':'transparent',border:`1px solid ${mcOnlyFavs?'#ffd166':'var(--border)'}`,color:mcOnlyFavs?'#ffd166':'var(--text3)',fontFamily:MONO,fontSize:12,padding:'3px 6px',borderRadius:4,cursor:'pointer',flexShrink:0}}>
                      ★
                    </button>
                    {(()=>{
                      const allLists=[...new Set(watchlist.map(w=>w.list_name||'General').filter(Boolean))]
                      return(
                        <select value={mcListFilter||''} onChange={e=>setMcListFilter(e.target.value)}
                          style={{background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:10,padding:'3px 5px',borderRadius:4,maxWidth:80}}>
                          <option value="">Todas</option>
                          {allLists.map(l=><option key={l} value={l}>{l}</option>)}
                        </select>
                      )
                    })()}
                  </div>
                  <div style={{padding:'4px 8px',borderBottom:'1px solid var(--border)',flexShrink:0,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <div style={{fontFamily:MONO,fontSize:10,color:'#cde5ff',fontWeight:700}}>{mcSelected.length} seleccionados</div>
                    <div style={{display:'flex',gap:4}}>
                      <button onClick={()=>setMcSelected(watchlist.map(w=>w.symbol))}
                        style={{fontFamily:MONO,fontSize:8,padding:'2px 5px',borderRadius:3,border:'1px solid var(--border)',background:'transparent',color:'#a8ccdf',cursor:'pointer'}}>
                        Todos
                      </button>
                      <button onClick={()=>setMcSelected([])}
                        style={{fontFamily:MONO,fontSize:8,padding:'2px 5px',borderRadius:3,border:'1px solid var(--border)',background:'transparent',color:'#ff4d6d',cursor:'pointer'}}>
                        Ninguno
                      </button>
                    </div>
                  </div>
                  <div style={{overflowY:'auto',flex:1}}>
                  {[...watchlist].filter(w=>{
                    const matchSearch=!mcSearch||(w.symbol||'').toLowerCase().includes(mcSearch.toLowerCase())||(w.name||'').toLowerCase().includes(mcSearch.toLowerCase())
                    const matchFav=!mcOnlyFavs||w.favorite
                    const matchList=!mcListFilter||(w.list_name||'General')===mcListFilter
                    return matchSearch&&matchFav&&matchList
                  }).sort((a,b)=>{
                    const ra=rankingData[a.symbol]?.rank, rb=rankingData[b.symbol]?.rank
                    if(ra!=null&&rb!=null) return ra-rb
                    if(ra!=null) return -1
                    if(rb!=null) return 1
                    return a.name.localeCompare(b.name)
                  }).map(w=>{
                    const sel=mcSelected.includes(w.symbol)
                    const rd=rankingData[w.symbol]
                    return(
                      <div key={w.symbol} onClick={()=>setMcSelected(prev=>sel?prev.filter(s=>s!==w.symbol):[...prev,w.symbol])}
                        style={{display:'flex',alignItems:'center',gap:7,padding:'5px 6px',borderRadius:3,marginBottom:2,cursor:'pointer',
                          background:sel?'rgba(0,212,255,0.07)':'transparent',
                          border:`1px solid ${sel?'rgba(0,212,255,0.2)':'transparent'}`}}
                        onMouseOver={e=>e.currentTarget.style.background=sel?'rgba(0,212,255,0.1)':'rgba(255,255,255,0.03)'}
                        onMouseOut={e=>e.currentTarget.style.background=sel?'rgba(0,212,255,0.07)':'transparent'}>
                        <div style={{width:14,height:14,borderRadius:3,border:`1.5px solid ${sel?'var(--accent)':'#3d5a7a'}`,
                          background:sel?'var(--accent)':'transparent',flexShrink:0,
                          display:'flex',alignItems:'center',justifyContent:'center'}}>
                          {sel&&<span style={{color:'#000',fontSize:11,lineHeight:1,fontWeight:900}}>✓</span>}
                        </div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontFamily:MONO,fontSize:12,color:sel?'var(--accent)':'#d0e8fa',fontWeight:600}}>{w.symbol}</div>
                          <div style={{fontFamily:MONO,fontSize:11,color:'#b0d0e8',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{w.name}</div>
                        </div>
                        {rd&&<span style={{fontFamily:MONO,fontSize:9,fontWeight:700,
                          color:rd.rank===1?'#ffd700':rd.rank===2?'#c0c0c0':rd.rank===3?'#cd7f32':rd.rank<=10?'#00d4ff':'#4a7a95',
                          minWidth:22,textAlign:'right',flexShrink:0}}>
                          {rd.rank<=3?['🥇','🥈','🥉'][rd.rank-1]:`#${rd.rank}`}
                        </span>}
                        {w.favorite&&<span style={{color:'#ffd166',fontSize:12}}>★</span>}
                      </div>
                    )
                  })}
                  </div>
                </div>
              </div>
            )}

            {/* ══ PANEL TRADELOG ══ */}
            {sidePanel==='tradelog'&&(
              <div style={{display:'flex',flexDirection:'column',flex:1,overflow:'hidden'}}>
                {/* ── SIDE EDIT PANEL — se muestra al clicar una fila ── */}
                {tlSideEdit&&tlSelected&&(
                  <div style={{display:'flex',flexDirection:'column',flex:1,overflow:'hidden',background:'var(--bg2)'}}>
                    {/* Header con símbolo + botón volver */}
                    <div style={{padding:'8px 10px',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between',alignItems:'center',flexShrink:0}}>
                      <div style={{display:'flex',alignItems:'center',gap:8}}>
                        <span onClick={()=>setTlSideEdit(false)} style={{cursor:'pointer',color:'#4a7a95',fontSize:16,lineHeight:1,padding:'0 4px'}} title="Volver">←</span>
                        <span style={{fontFamily:MONO,fontSize:11,color:'#c8dff5',fontWeight:700}}>{tlSelected.symbol}</span>
                        <span style={{fontFamily:MONO,fontSize:9,padding:'1px 5px',borderRadius:3,
                          background:tlSelected.status==='open'?'rgba(0,229,160,0.1)':'rgba(90,90,90,0.1)',
                          border:tlSelected.status==='open'?'1px solid rgba(0,229,160,0.3)':'1px solid #2a3d52',
                          color:tlSelected.status==='open'?'#00e5a0':'#5a8aaa'}}>
                          {tlSelected.status==='open'?'Abierta':'Cerrada'}
                        </span>
                      </div>
                      <div style={{display:'flex',gap:4}}>
                        {tlSelected.status==='open'&&(
                          <button onClick={()=>{setTlSideEdit(false);setTlCloseOpen(true)}}
                            style={{fontFamily:MONO,fontSize:9,padding:'3px 8px',borderRadius:3,cursor:'pointer',
                              background:'rgba(255,77,109,0.1)',border:'1px solid rgba(255,77,109,0.4)',color:'#ff4d6d',fontWeight:700}}>
                            Cerrar op.
                          </button>
                        )}
                        <button onClick={()=>{setTlSideEdit(false);setTlFormOpen(true)}}
                          style={{fontFamily:MONO,fontSize:9,padding:'3px 8px',borderRadius:3,cursor:'pointer',
                            background:'rgba(155,114,255,0.1)',border:'1px solid rgba(155,114,255,0.4)',color:'#9b72ff',fontWeight:700}}>
                          Editar
                        </button>
                      </div>
                    </div>
                    {/* Datos del trade */}
                    <div style={{overflowY:'auto',flex:1,padding:'8px 0'}}>
                      {(()=>{
                        const t=tlSelected
                        const isOpen=t.status==='open'
                        const pnl=isOpen?t._pnl_float_eur:t.pnl_eur
                        const pnlPct=isOpen?t._pnl_float_pct:t.pnl_pct
                        const exitPx=isOpen?t._current_price:t.exit_price
                        const dias=t.entry_date&&(isOpen?new Date():new Date(t.exit_date))?
                          Math.round((isOpen?new Date():new Date(t.exit_date))-new Date(t.entry_date))/86400000:null
                        const fxE=t.fx_entry>0?(t.fx_entry<1?1/t.fx_entry:t.fx_entry):null
                        const capitalEur=fxE&&t.shares&&t.entry_price?(parseFloat(t.shares)*parseFloat(t.entry_price))/fxE:null
                        const comm=(parseFloat(t.commission_buy||0)+parseFloat(t.commission_sell||0))
                        const pnlC=pnl!=null?pnl:null
                        const colBroker=TL_COLORS[t.broker]||'#7a9bc0'
                        const rows=[
                          {l:'Símbolo',    v:t.symbol,                                        c:'#c8dff5'},
                          {l:'Nombre',     v:t.name||'—',                                     c:'#7a9bc0'},
                          {l:'Broker',     v:TL_LABEL[t.broker]||t.broker?.toUpperCase()||'—',c:colBroker},
                          {l:'Estrategia', v:t.strategy||'—',                                 c:'#7a9bc0'},
                          {l:'Fecha ent.', v:t.entry_date||'—',                               c:'#a8ccdf'},
                          {l:'Fecha sal.', v:isOpen?'(abierta)':t.exit_date||'—',             c:isOpen?'#00e5a0':'#a8ccdf'},
                          {l:'Acciones',   v:t.shares||'—',                                   c:'#c8dff5'},
                          {l:'Px entrada', v:t.entry_price!=null?(t.entry_currency==='EUR'?'€':'$')+parseFloat(t.entry_price).toFixed(2):'—', c:'#c8dff5'},
                          {l:'Px salida',  v:exitPx!=null?(t.entry_currency==='EUR'?'€':'$')+parseFloat(exitPx).toFixed(2):isOpen?'live':'—', c:isOpen?'#00e5a0':'#c8dff5'},
                          {l:'Capital inv.',v:capitalEur!=null?'€'+Math.round(capitalEur).toLocaleString('es-ES'):'—', c:'#9b72ff'},
                          {l:'Divisa',     v:t.entry_currency||'—',                           c:'#7a9bc0'},
                          {l:'FX',         v:fxE?fxE.toFixed(4):'—',                          c:'#7a9bc0'},
                          {l:'Comisión',   v:comm>0?'-€'+comm.toFixed(2):'—',                 c:'#ff4d6d'},
                          {l:'Días',       v:dias!=null?Math.round(dias):'—',                 c:'#00d4ff'},
                          {l:'P&L €',      v:pnlC!=null?((pnlC>=0?'+':'')+('€'+Math.round(Math.abs(pnlC))*(pnlC<0?-1:1))):'—', c:pnlC!=null&&pnlC>=0?'#00e5a0':'#ff4d6d'},
                          {l:'P&L %',      v:pnlPct!=null?((parseFloat(pnlPct)>=0?'+':'')+parseFloat(pnlPct).toFixed(2)+'%'):'—', c:pnlPct!=null&&parseFloat(pnlPct)>=0?'#00e5a0':'#ff4d6d'},
                        ]
                        return(
                          <table style={{width:'100%',borderCollapse:'collapse',fontFamily:MONO}}>
                            <tbody>
                              {rows.map(({l,v,c})=>(
                                <tr key={l} style={{borderBottom:'1px solid rgba(26,45,69,0.5)'}}>
                                  <td style={{padding:'5px 10px',fontSize:9,color:'#4a7a95',textTransform:'uppercase',letterSpacing:'0.05em',whiteSpace:'nowrap'}}>{l}</td>
                                  <td style={{padding:'5px 10px',fontSize:11,fontWeight:600,color:c,textAlign:'right',wordBreak:'break-word'}}>{v}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )
                      })()}
                      {/* Notas */}
                      {tlSelected.notes&&(
                        <div style={{margin:'10px 10px 0',padding:'8px',background:'rgba(13,21,32,0.6)',borderRadius:4,border:'1px solid var(--border)'}}>
                          <div style={{fontFamily:MONO,fontSize:9,color:'#3d5a7a',marginBottom:4,textTransform:'uppercase',letterSpacing:'0.08em'}}>Notas</div>
                          <div style={{fontFamily:MONO,fontSize:10,color:'#7a9bc0',lineHeight:1.5,whiteSpace:'pre-wrap'}}>{tlSelected.notes}</div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {/* ── PANEL NORMAL (subtabs + filtros) — oculto cuando side edit abierto ── */}
                {!tlSideEdit&&(
                <div style={{display:'flex',flexDirection:'column',flex:1,overflow:'hidden'}}>
                {/* Header + badge */}
                <div style={{padding:'8px 10px',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between',alignItems:'center',flexShrink:0}}>
                  <span style={{fontFamily:MONO,fontSize:9,color:'#9b72ff',letterSpacing:'0.1em',textTransform:'uppercase',fontWeight:700}}>📒 TradeLog</span>
                  {tlUseLocal()
                    ? <span style={{fontFamily:MONO,fontSize:9,padding:'2px 5px',borderRadius:3,
                        background:'rgba(255,209,102,0.1)',border:'1px solid rgba(255,209,102,0.3)',color:'#ffd166'}}>
                        💾 Local
                      </span>
                    : <a href={`https://supabase.com/dashboard/project/${(getSupaUrl().match(/https:\/\/([^.]+)\.supabase\.co/)||[])[1]||''}`} target="_blank" rel="noreferrer"
                        style={{fontFamily:MONO,fontSize:9,padding:'2px 5px',borderRadius:3,cursor:'pointer',textDecoration:'none',
                          background:'rgba(0,212,255,0.08)',border:'1px solid rgba(0,212,255,0.2)',color:'#00d4ff'}}>
                        ☁ Supabase ↗
                      </a>
                  }
                </div>

                {/* Filtros */}
                {(()=>{
                  const allYears=[...new Set(tlTrades.map(t=>t.entry_date?.slice(0,4)).filter(Boolean))].sort((a,b)=>b-a)
                  return(
                    <div style={{overflowY:'auto',flex:1}}>
                      <div style={{padding:'7px 8px',borderBottom:'1px solid var(--border)'}}>
                        <div style={{fontFamily:MONO,fontSize:8,color:'#3d5a7a',letterSpacing:'0.1em',textTransform:'uppercase',marginBottom:4}}>Estado</div>
                        <div style={{display:'flex',gap:3,flexWrap:'wrap'}}>
                          {[['','Todas'],['open','Abiertas'],['closed','Cerradas']].map(([v,l])=>(
                            <button key={v} onClick={()=>setTlFilterStatus(tlFilterStatus===v?'':v)}
                              style={{fontFamily:MONO,fontSize:10,padding:'2px 6px',borderRadius:3,cursor:'pointer',
                                border:'1px solid '+(tlFilterStatus===v?'#9b72ff':'#1a2d45'),
                                background:tlFilterStatus===v?'rgba(155,114,255,0.1)':'transparent',
                                color:tlFilterStatus===v?'#9b72ff':'#4a7a95'}}>{l}</button>
                          ))}
                        </div>
                      </div>
                      <div style={{padding:'7px 8px',borderBottom:'1px solid var(--border)'}}>
                        <div style={{fontFamily:MONO,fontSize:8,color:'#3d5a7a',letterSpacing:'0.1em',textTransform:'uppercase',marginBottom:4}}>Broker</div>
                        <div style={{display:'flex',gap:3,flexWrap:'wrap'}}>
                          {[['','Todos'],...TL_BROKERS.map(b=>[b,TL_LABEL[b]])].map(([v,l])=>(
                            <button key={v} onClick={()=>setTlFilterBroker(tlFilterBroker===v?'':v)}
                              style={{fontFamily:MONO,fontSize:10,padding:'2px 6px',borderRadius:3,cursor:'pointer',
                                border:'1px solid '+(tlFilterBroker===v?(TL_COLORS[v]||'#9b72ff'):'#1a2d45'),
                                background:tlFilterBroker===v?(TL_COLORS[v]||'#9b72ff')+'18':'transparent',
                                color:tlFilterBroker===v?(TL_COLORS[v]||'#9b72ff'):'#4a7a95'}}>{l}</button>
                          ))}
                        </div>
                      </div>
                      <div style={{padding:'7px 8px',borderBottom:'1px solid var(--border)'}}>
                        <div style={{fontFamily:MONO,fontSize:8,color:'#3d5a7a',letterSpacing:'0.1em',textTransform:'uppercase',marginBottom:4}}>Período</div>
                        <div style={{display:'flex',gap:3,flexWrap:'wrap',marginBottom:tlFilterYear?4:0}}>
                          {[['','Todo'],...allYears.map(y=>[y,y])].map(([v,l])=>(
                            <button key={v} onClick={()=>{const next=tlFilterYear===v?'':v;setTlFilterYear(next);if(!next)setTlFilterMonth('')}}
                              style={{fontFamily:MONO,fontSize:10,padding:'2px 6px',borderRadius:3,cursor:'pointer',
                                border:'1px solid '+(tlFilterYear===v?'#9b72ff':'#1a2d45'),
                                background:tlFilterYear===v?'rgba(155,114,255,0.1)':'transparent',
                                color:tlFilterYear===v?'#9b72ff':'#4a7a95'}}>{l}</button>
                          ))}
                        </div>
                        {tlFilterYear&&(()=>{
                          const monthsInYear=[...new Set(tlTrades
                            .filter(t=>{const d=t.exit_date||t.entry_date;return d&&d.startsWith(tlFilterYear)})
                            .map(t=>{const d=t.exit_date||t.entry_date;return d?d.slice(5,7):null}).filter(Boolean)
                          )].sort()
                          if(!monthsInYear.length) return null
                          const MESES=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
                          return(
                            <div style={{display:'flex',gap:3,flexWrap:'wrap',paddingTop:4,borderTop:'1px solid rgba(155,114,255,0.12)'}}>
                              <button onClick={()=>setTlFilterMonth('')}
                                style={{fontFamily:MONO,fontSize:9,padding:'2px 5px',borderRadius:3,cursor:'pointer',
                                  border:'1px solid '+(tlFilterMonth===''?'#9b72ff':'#1a2d45'),
                                  background:tlFilterMonth===''?'rgba(155,114,255,0.1)':'transparent',
                                  color:tlFilterMonth===''?'#9b72ff':'#4a7a95'}}>Todos</button>
                              {monthsInYear.map(m=>(
                                <button key={m} onClick={()=>setTlFilterMonth(tlFilterMonth===m?'':m)}
                                  style={{fontFamily:MONO,fontSize:9,padding:'2px 5px',borderRadius:3,cursor:'pointer',
                                    border:'1px solid '+(tlFilterMonth===m?'#00d4ff':'#1a2d45'),
                                    background:tlFilterMonth===m?'rgba(0,212,255,0.1)':'transparent',
                                    color:tlFilterMonth===m?'#00d4ff':'#4a7a95'}}>
                                  {MESES[parseInt(m)-1]}
                                </button>
                              ))}
                            </div>
                          )
                        })()}
                      </div>
                      {(()=>{
                        const strats=[...new Set(tlTrades.map(t=>t.strategy||'').filter(Boolean))].sort()
                        if(!strats.length) return null
                        return(
                          <div style={{padding:'7px 8px',borderBottom:'1px solid var(--border)'}}>
                            <div style={{fontFamily:MONO,fontSize:8,color:'#3d5a7a',letterSpacing:'0.1em',textTransform:'uppercase',marginBottom:4}}>Estrategia</div>
                            <div style={{display:'flex',gap:3,flexWrap:'wrap'}}>
                              <button onClick={()=>setTlFilterStrat('')}
                                style={{fontFamily:MONO,fontSize:9,padding:'2px 6px',borderRadius:3,cursor:'pointer',
                                  border:'1px solid '+(tlFilterStrat===''?'#9b72ff':'#1a2d45'),
                                  background:tlFilterStrat===''?'rgba(155,114,255,0.1)':'transparent',
                                  color:tlFilterStrat===''?'#9b72ff':'#4a7a95'}}>Todas</button>
                              {strats.map(v=>(
                                <button key={v} onClick={()=>setTlFilterStrat(tlFilterStrat===v?'':v)}
                                  style={{fontFamily:MONO,fontSize:9,padding:'2px 6px',borderRadius:3,cursor:'pointer',
                                    border:'1px solid '+(tlFilterStrat===v?'#00d4ff':'#1a2d45'),
                                    background:tlFilterStrat===v?'rgba(0,212,255,0.1)':'transparent',
                                    color:tlFilterStrat===v?'#00d4ff':'#4a7a95',
                                    maxWidth:90,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}
                                  title={v}>{v}</button>
                              ))}
                            </div>
                          </div>
                        )
                      })()}

                    </div>
                  )
                })()}

                {tlError&&<div style={{padding:'4px 8px',fontFamily:MONO,fontSize:10,color:'#ff4d6d'}}>⚠ {tlError}</div>}
              </div>
              )}
            </div>
            )}
          </aside>

          {/* ── CONTENT ── */}
          <div className="content">

            {/* ══ CONDITION EDITOR PANEL ══ */}
            {editingCond!==null&&sidePanel==='conditions'&&(
              <ConditionEditorPanel
                condForm={condForm}
                setCondForm={setCondForm}
                condition={editingCond}
                onSave={saveEditCond}
                onCancel={closeEditCond}
                onDelete={()=>deleteCond(editingCond.id)}
                saving={condSaving}
              />
            )}

            {/* ══ STRATEGY EDITOR PANEL ══ */}
            {editingStr!==null&&sidePanel==='config'&&(
              <StrategyEditorPanel
                strForm={strForm}
                setStrForm={setStrForm}
                definition={definition}
                setDefinition={setDefinition}
                conditions={conditions}
                strategy={editingStr}
                onSave={saveEditStr}
                onCancel={closeEditStr}
                onDelete={()=>deleteStr(editingStr.id)}
                saving={strSaving}
              />
            )}

            {/* Single-asset view — oculto cuando multicartera activa o editando */}
            {sidePanel!=='multi'&&sidePanel!=='tradelog'&&!(editingCond&&sidePanel==='conditions')&&!(editingStr&&sidePanel==='config')&&!result&&!error&&<div className="loading"><div className="spinner"/><div className="loading-text">CARGANDO DATOS...</div></div>}
            {sidePanel!=='multi'&&sidePanel!=='tradelog'&&!(editingCond&&sidePanel==='conditions')&&!(editingStr&&sidePanel==='config')&&error&&<div className="error-msg">⚠ {error}</div>}

            {sidePanel!=='multi'&&sidePanel!=='tradelog'&&!(editingCond&&sidePanel==='conditions')&&!(editingStr&&sidePanel==='config')&&result&&(
              <div style={{display:'flex',flex:1,minHeight:0,overflow:'hidden',height:'100%'}}>
                {/* Columna principal */}
                <div ref={contentRef} style={{flex:1,overflowY:'auto'}}>
                  {/* Gráfico de velas */}
                  <div className="chart-wrap" ref={chartWrapRef} onContextMenu={e=>openCtx(e,'chart')}>
                    <div className="chart-header" style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap',fontSize:14}}>
                      {/* Estrella favorito del activo activo */}
                      {(()=>{
                        const wItem=watchlist.find(w=>w.symbol===simbolo)
                        if(!wItem) return null
                        return(
                          <span onClick={async()=>{await upsertWatchlistItem({...wItem,favorite:!wItem.favorite});reloadWatchlist()}}
                            title={wItem.favorite?'Quitar favorito':'Marcar favorito'}
                            style={{cursor:'pointer',fontSize:16,color:wItem.favorite?'#ffd166':'#3d5a7a',flexShrink:0,lineHeight:1}}>
                            {wItem.favorite?'★':'☆'}
                          </span>
                        )
                      })()}
                      <div className="chart-title" style={{cursor:'pointer'}} onClick={()=>setSymSearchOpen(true)} title="Buscar símbolo">{simbolo}</div>
                      {/* Nombre del activo */}
                      <div style={{fontFamily:MONO,fontSize:12,color:'#7a9bc0',fontWeight:400}}>{lookupName(simbolo)}</div>
                      <div className="chart-price">{fmt(result.meta?.ultimoPrecio,2)}</div>
                      <div className="chart-date">{fmtDate(result.meta?.ultimaFecha)}</div>
                      <div style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:6}}>
                        {/* Estrategia activa */}
                        {stratName&&(
                          <div style={{
                            fontFamily:MONO,fontSize:10,color:'#7a9bc0',
                            background:'rgba(13,21,32,0.85)',border:'1px solid #1a2d45',
                            borderRadius:4,padding:'2px 8px',display:'flex',alignItems:'center',gap:5,
                            maxWidth:180,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'
                          }}>
                            <span style={{
                              width:7,height:7,borderRadius:'50%',flexShrink:0,
                              background:stratColor||'#00d4ff',
                              boxShadow:`0 0 5px ${stratColor||'#00d4ff'}88`
                            }}/>
                            <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',color:'#a8ccdf'}}>
                              {stratName}
                            </span>
                          </div>
                        )}
                        {rulerOn&&<span style={{fontFamily:MONO,fontSize:10,color:'#ffd166'}}>📏 Regla ON · Ctrl=imán · dbl-clic=borrar</span>}
                        {/* Botón Fit All */}
                        <button onClick={()=>{
                            const s=JSON.parse(localStorage.getItem('v50_settings')||'{}')
                            if(chartViewFull){
                              // Switch to recent view
                              const months=s?.chart?.recentMonths??3
                              chartApiRef.current?.showRecent(months,0)
                              setChartViewFull(false)
                            } else {
                              // Switch to full view
                              chartApiRef.current?.fitAll()
                              setChartViewFull(true)
                            }
                          }}
                          title={chartViewFull?'Ver últimos 3 meses':'Ver período completo'}
                          style={{background:chartViewFull?'rgba(0,212,255,0.08)':'rgba(0,229,160,0.08)',
                            border:`1px solid ${chartViewFull?'#1e3a52':'#0a5a42'}`,
                            color:chartViewFull?'#00d4ff':'#00e5a0',
                            fontFamily:MONO,fontSize:10,padding:'3px 8px',borderRadius:4,cursor:'pointer',whiteSpace:'nowrap'}}>
                          {chartViewFull?'⊞ Todo':'⊡ Reciente'}
                        </button>
                        {/* Botones scroll ◀ ▶ */}
                        <div style={{display:'flex',gap:2}}>
                          {[['◀',10],['▶',-10]].map(([lbl,bars])=>(
                            <button key={lbl} onClick={()=>chartApiRef.current?.scrollBy(bars)}
                              title={bars>0?'Desplazar izquierda':'Desplazar derecha'}
                              style={{background:'rgba(13,21,32,0.85)',border:'1px solid #1a2d45',color:'#5a8aaa',
                                fontFamily:MONO,fontSize:11,padding:'2px 7px',borderRadius:4,cursor:'pointer',lineHeight:1}}>
                              {lbl}
                            </button>
                          ))}
                        </div>
                        {/* Botón Añadir activo */}
                        <button onClick={newItem}
                          title="Añadir activo a la watchlist"
                          style={{background:'rgba(0,212,255,0.08)',border:'1px solid var(--accent)',color:'var(--accent)',fontFamily:MONO,fontSize:13,padding:'2px 8px',borderRadius:4,cursor:'pointer',lineHeight:1}}>
                          +
                        </button>
                      </div>
                    </div>
                    <CandleChart
                      data={result.chartData} emaRPeriod={emaR} emaLPeriod={emaL}
                      trades={result.trades||[]} maxDD={metrics?.ddSimple||0}
                      labelMode={labelMode} rulerActive={rulerOn}
                      onChartReady={api=>{chartApiRef.current=api}}
                      onPriceAlarm={sidePanel!=='watchlist'?price=>setPriceAlarmDlg({price,symbol:simbolo}):null}
                      savedRangeRef={savedRangeRef}
                      syncRef={chartSyncRef}
                      chartHeight={candleH}
                    />
                    {/* Drag handle — resize candle chart */}
                    <div onMouseDown={e=>{candleResizing.current=true;candleStartY.current=e.clientY;candleStartH.current=candleH;document.body.style.cursor='row-resize';document.body.style.userSelect='none'}}
                      style={{height:6,cursor:'row-resize',background:'transparent',transition:'background 0.15s',
                        borderTop:'2px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'center'}}
                      onMouseOver={e=>e.currentTarget.style.background='rgba(0,212,255,0.15)'}
                      onMouseOut={e=>e.currentTarget.style.background='transparent'}>
                      <div style={{width:32,height:2,borderRadius:1,background:'rgba(0,212,255,0.3)'}}/>
                    </div>
                  </div>

                  {/* Métricas en cuadrícula (si layout=grid) */}
                  {metricsLayout==='grid'&&metrics&&(
                    <div style={{border:'1px solid var(--border)',borderRadius:4,margin:'8px 0',overflow:'hidden'}}>
                      <div style={{display:'flex',alignItems:'center',gap:6,padding:'4px 10px 0'}}>
                        <button onClick={()=>setMetricsView(v=>v==='multi'?'single':'multi')}
                          style={{marginLeft:'auto',fontFamily:MONO,fontSize:10,padding:'2px 7px',borderRadius:3,cursor:'pointer',
                            border:'1px solid #2a4060',background:'rgba(0,0,0,0.3)',color:'#7aabc8'}}>
                          {metricsView==='multi'?'⊟ 1col':'⊞ 3col'}
                        </button>
                      </div>
                      <StratSelector strats={metricsStrats} setStrats={setMetricsStrats}/>
                      <MetricsWrapper rows={buildUnifiedRows(metrics,result?.maxDDBH||0)} strats={metricsStrats}/>
                    </div>
                  )}

                  {/* Equity con toggles */}
                  <div className="equity-section" onContextMenu={e=>openCtx(e,'equity')}>
                    <div className="section-title" style={{display:'flex',alignItems:'center',flexWrap:'wrap',gap:6,fontSize:14}}>
                      <span>Equity</span>
                      {[
                        {key:'st',label:'Simple',color:'#00d4ff',state:showStrategy,set:setShowStrategy},
                        {key:'co',label:'Compuesta',color:'#00e5a0',state:showCompound,set:setShowCompound},
                        {key:'bh',label:'B&H Activo',color:'#ffd166',state:showBH,set:setShowBH},
                        {key:'sp',label:'B&H SP500',color:'#9b72ff',state:showSP500,set:setShowSP500},
                      ].map(({key,label,color,state,set})=>(
                        <button key={key} onClick={()=>set(s=>!s)}
                          style={{fontFamily:MONO,fontSize:10,padding:'2px 7px',borderRadius:3,cursor:'pointer',border:`1px solid ${state?color:'#3d5a7a'}`,background:state?`${color}18`:'transparent',color:state?color:'#3d5a7a'}}>
                          {label}
                        </button>
                      ))}
                    </div>
                    <EquityChart
                      strategyCurve={result.strategyCurve}
                      bhCurve={result.bhCurve}
                      sp500BHCurve={result.sp500BHCurve||[]}
                      compoundCurve={result.compoundCurve||[]}
                      maxDDStrategy={result.maxDDStrategy}
                      maxDDBH={result.maxDDBH}
                      maxDDSP500={result.maxDDSP500||0}
                      maxDDCompound={result.maxDDCompound||0}
                      maxDDStrategyDate={result.maxDDStrategyDate}
                      maxDDBHDate={result.maxDDBHDate}
                      maxDDSP500Date={result.maxDDSP500Date||null}
                      maxDDCompoundDate={result.maxDDCompoundDate||null}
                      capitalIni={Number(capitalIni)}
                      showStrategy={showStrategy} showBH={showBH}
                      showSP500={showSP500} showCompound={showCompound}
                      syncRef={chartSyncRef}
                      chartHeight={equityH}
                    />
                    {/* Drag handle — resize equity chart height */}
                    <div onMouseDown={e=>{equityResizing.current=true;equityStartY.current=e.clientY;equityStartH.current=equityH;document.body.style.cursor='row-resize';document.body.style.userSelect='none'}}
                      style={{height:6,cursor:'row-resize',background:'transparent',transition:'background 0.15s',
                        borderTop:'2px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'center'}}
                      onMouseOver={e=>e.currentTarget.style.background='rgba(0,212,255,0.15)'}
                      onMouseOut={e=>e.currentTarget.style.background='transparent'}>
                      <div style={{width:32,height:2,borderRadius:1,background:'rgba(0,212,255,0.3)'}}/>
                    </div>
                    {/* Capital invertido — filtro propio independiente */}
                    {result.trades?.length>0&&(
                      <div style={{borderTop:'1px solid var(--border)'}}>
                        <div style={{padding:'3px 12px',display:'flex',alignItems:'center',gap:6,fontFamily:MONO,fontSize:11}}>
                          <span style={{color:indivOccMode==='compound'?'#00e5a0':'#00d4ff',fontWeight:600}}>
                            € Capital {indivOccMode==='compound'?'Compuesto':'Simple'} invertido
                          </span>
                          <div style={{display:'flex',gap:3,marginLeft:'auto'}}>
                            {[{id:'compound',label:'Compuesto',c:'#00e5a0'},{id:'simple',label:'Simple',c:'#00d4ff'}].map(m=>(
                              <button key={m.id} onClick={()=>setIndivOccMode(m.id)}
                                style={{fontFamily:MONO,fontSize:10,padding:'1px 6px',borderRadius:3,cursor:'pointer',
                                  border:`1px solid ${indivOccMode===m.id?m.c:'#2a3f55'}`,
                                  background:indivOccMode===m.id?`${m.c}18`:'transparent',
                                  color:indivOccMode===m.id?m.c:'#4a6a88'}}>
                                {m.label}
                              </button>
                            ))}
                          </div>
                        </div>
                        <OccupancyBarChart
                          trades={result.trades}
                          chartData={result.chartData}
                          capitalIni={Number(capitalIni)}
                          syncRef={chartSyncRef}
                          showMode={indivOccMode}
                        />
                      </div>
                    )}
                  </div>

                  {/* Barras de resultados — clic navega al trade */}
                  {result.trades?.length>0&&(
                    <div className="equity-section">
                      <div className="section-title" style={{fontSize:14}}>Resultados por Operación <span style={{fontWeight:400,fontSize:11,color:'#9acce0'}}>· clic = ir al trade</span></div>
                      <div className="equity-bars">
                        {result.trades.map((t,i)=>{
                          const mx=Math.max(...result.trades.map(x=>Math.abs(x.pnlPct)))
                          return <div key={i} className="equity-bar" onClick={()=>navigateToTrade(t)}
                            style={{height:Math.max(4,Math.abs(t.pnlPct)/mx*56),background:t.pnlPct>=0?'var(--green)':'var(--red)',cursor:'pointer'}}
                            onMouseOver={e=>e.currentTarget.style.opacity='0.7'}
                            onMouseOut={e=>e.currentTarget.style.opacity='1'}
                            title={`${fmtDate(t.exitDate)}: ${fmt(t.pnlPct,2)}%`}/>
                        })}
                      </div>
                    </div>
                  )}

                  {/* Historial — clic fila navega al trade */}
                  {result.trades?.length>0&&(
                    <div className="trades-section" onContextMenu={e=>openCtx(e,'trades')}>
                      <div className="section-title" style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',fontSize:14}}>
                        <span>Historial — {result.trades.length} operaciones <span style={{fontWeight:400,fontSize:11,color:'#9acce0'}}>· clic fila = ir al trade</span></span>
                        <div style={{display:'flex',gap:4,marginLeft:'auto'}}>
                          {[{id:'compound',label:'Compuesto'},{id:'simple',label:'Simple'}].map(m=>(
                            <button key={m.id} onClick={()=>setTradeHistMode(m.id)}
                              style={{fontFamily:MONO,fontSize:9,padding:'2px 6px',borderRadius:3,cursor:'pointer',
                                border:`1px solid ${tradeHistMode===m.id?'var(--accent)':'#2a3f55'}`,
                                background:tradeHistMode===m.id?'rgba(0,212,255,0.1)':'transparent',
                                color:tradeHistMode===m.id?'var(--accent)':'#4a6a88'}}>
                              {m.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div style={{overflowX:'auto'}}>
                        <table style={{width:'100%',borderCollapse:'collapse',fontFamily:MONO,fontSize:11}}>
                          <thead><tr style={{borderBottom:'1px solid var(--border)',position:'sticky',top:0,background:'var(--bg)'}}>
                            {['#','Entrada','Salida','Capital inv.','Capital final','Px Ent.','Px Sal.','P&L %','P&L €','Días','Tipo'].map((h,hi)=>(
                              <th key={h} style={{padding:'4px 8px',textAlign:'left',color:hi===3?'#9b72ff':hi===4?'#00d4ff':'#9acce0',fontWeight:400,fontSize:11,whiteSpace:'nowrap'}}>{h}</th>
                            ))}
                          </tr></thead>
                          <tbody>
                            {(()=>{
                              const capIni=Number(capitalIni)
                              // Precompute cumulative values (forward order) for peak tracking
                              const fwdSimple=result.trades.map((_,i)=>capIni+result.trades.slice(0,i+1).reduce((s,x)=>s+x.pnlSimple,0))
                              const fwdCompound=result.trades.map(t=>t.capitalTras)
                              let peakS=capIni, peakC=capIni
                              const peaksS=fwdSimple.map(v=>{peakS=Math.max(peakS,v);return peakS})
                              const peaksC=fwdCompound.map(v=>{peakC=Math.max(peakC,v);return peakC})
                              return [...result.trades].reverse().map((t,i)=>{
                                const idx=result.trades.length-1-i  // original index
                                // Capital at entry = prev trade final (or capIni)
                                const capInvS=capIni  // simple always uses fixed slot
                                const capInvC=idx>0?result.trades[idx-1].capitalTras:capIni
                                const capFinalS=fwdSimple[idx], capFinalC=fwdCompound[idx]
                                const isCompound=tradeHistMode==='compound'
                                const capInv=isCompound?capInvC:capInvS
                                const capFinal=isCompound?capFinalC:capFinalS
                                const peak=isCompound?peaksC[idx]:peaksS[idx]
                                const prevPeak=idx>0?(isCompound?peaksC[idx-1]:peaksS[idx-1]):capIni
                                // Capital final: blue=at-peak, orange=in-drawdown
                                const capFinalColor=capFinal>=peak?'#00d4ff':'#ff9a3c'
                                // P&L € in compound mode = actual money earned on compounded capital
                                const pnlEur=isCompound?(capInvC*(t.pnlPct/100)):t.pnlSimple
                                const pnlColor=pnlEur>=0?'var(--green)':'var(--red)'
                                return(
                                  <tr key={i}
                                    style={{borderBottom:'1px solid rgba(255,255,255,0.03)',cursor:'pointer'}}
                                    onClick={()=>navigateToTrade(t)}
                                    onMouseOver={e=>e.currentTarget.style.background='rgba(0,212,255,0.05)'}
                                    onMouseOut={e=>e.currentTarget.style.background='transparent'}>
                                    <td style={{padding:'4px 8px',color:'#7a9bc0',fontSize:11}}>{result.trades.length-i}</td>
                                    <td style={{padding:'4px 8px',color:'#d8ecff',whiteSpace:'nowrap'}}>{fmtDate(t.entryDate)}</td>
                                    <td style={{padding:'4px 8px',color:'#d8ecff',whiteSpace:'nowrap'}}>{fmtDate(t.exitDate)}</td>
                                    <td style={{padding:'4px 8px',color:'#e8f4ff',fontWeight:600,whiteSpace:'nowrap'}}>€{fmt(capInv,0)}</td>
                                    <td style={{padding:'4px 8px',color:capFinalColor,fontWeight:600,whiteSpace:'nowrap'}}>€{fmt(capFinal,0)}</td>
                                    <td style={{padding:'4px 8px'}}>{fmt(t.entryPx,2)}</td>
                                    <td style={{padding:'4px 8px'}}>{fmt(t.exitPx,2)}</td>
                                    <td style={{padding:'4px 8px',color:pnlColor,fontWeight:600}}>{t.pnlPct>=0?'+':''}{fmt(t.pnlPct,2)}%</td>
                                    <td style={{padding:'4px 8px',color:pnlColor}}>{pnlEur>=0?'+':''}{fmt(pnlEur,2)}€</td>
                                    <td style={{padding:'4px 8px',color:'#a8c4dc'}}>{t.dias}</td>
                                    <td style={{padding:'4px 8px'}}>
                                      <span style={{fontSize:9,padding:'1px 5px',borderRadius:2,
                                        background:t.pnlPct>=0?'rgba(0,229,160,0.1)':'rgba(255,77,109,0.1)',
                                        color:t.pnlPct>=0?'#00e5a0':'#ff4d6d',
                                        border:`1px solid ${t.pnlPct>=0?'rgba(0,229,160,0.3)':'rgba(255,77,109,0.3)'}`}}>
                                        {t.tipo}
                                      </span>
                                    </td>
                                  </tr>
                                )
                              })
                            })()}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>

                {/* Panel derecho de métricas */}
                {sidePanel!=='multi'&&(metricsLayout==='panel'||metricsLayout==='multi')&&metrics&&(
                  <div style={{width:rightPanelW,flexShrink:0,borderLeft:'1px solid var(--border)',background:'var(--bg2)',overflowY:'auto',position:'relative'}} onContextMenu={e=>openCtx(e,'metrics')}>
                    {/* Resize handle — left edge */}
                    <div onMouseDown={e=>{rightResizing.current=true;rightStartX.current=e.clientX;rightStartW.current=rightPanelW;document.body.style.cursor='col-resize';document.body.style.userSelect='none'}}
                      style={{position:'absolute',top:0,left:0,width:4,height:'100%',cursor:'col-resize',zIndex:20,
                        background:'transparent',transition:'background 0.15s'}}
                      onMouseOver={e=>e.currentTarget.style.background='rgba(0,212,255,0.25)'}
                      onMouseOut={e=>e.currentTarget.style.background='transparent'}/>
                    <div style={{padding:'6px 12px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',gap:6}}>
                      <span style={{fontFamily:MONO,fontSize:10,color:'#b8d8f0',letterSpacing:'0.08em',fontWeight:600,flex:1}}>RESUMEN · {simbolo}</span>
                      {metricsLayout==='multi'
                        ? <span style={{fontFamily:MONO,fontSize:9,color:'#3d5a7a',padding:'2px 7px'}}>multi-col</span>
                        : <span style={{fontFamily:MONO,fontSize:9,color:'#3d5a7a',padding:'2px 7px'}}>1 col</span>}
                    </div>
                    <StratSelector strats={metricsStrats} setStrats={setMetricsStrats}/>
                    {(()=>{
                      const rows = buildUnifiedRows(metrics, result?.maxDDBH||0)
                      // 'panel' → tabla horizontal (estrategias como columnas)
                      // 'multi' → bloques apilados verticalmente (una estrategia encima de otra)
                      return metricsLayout==='multi'
                        ? <SingleColumnTable rows={rows} strats={metricsStrats}/>
                        : <UnifiedMetricsTable rows={rows} strats={metricsStrats}/>
                    })()}
                  </div>
                )}
              </div>
            )}

            {/* ══ MULTICARTERA — loading / empty state ══ */}
            {sidePanel==='multi'&&mcLoading&&(
              <div className="loading"><div className="spinner"/><div className="loading-text">CALCULANDO MULTICARTERA...</div></div>
            )}
            {sidePanel==='multi'&&!mcLoading&&!mcResult&&(
              <div style={{display:'flex',flex:1,alignItems:'center',justifyContent:'center',flexDirection:'column',gap:12,color:'var(--text3)',fontFamily:MONO,fontSize:12}}>
                <span style={{fontSize:32}}>📊</span>
                <span>Selecciona activos y ejecuta la multicartera</span>
              </div>
            )}

            {/* ══ MULTICARTERA RESULTS ══ */}
            {mcResult&&sidePanel==='multi'&&(
              <div style={{display:'flex',flex:1,minHeight:0,overflow:'hidden',height:'100%'}}>
              {/* Left: scrollable content */}
              <div style={{flex:1,overflowY:'auto',padding:'0 0 20px 0'}}>
                {/* Header resumen */}
                <div style={{padding:'7px 16px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
                  <span style={{fontFamily:MONO,fontSize:13,color:'var(--accent)',fontWeight:700}}>📊 Multicartera</span>
                  <span style={{fontFamily:MONO,fontSize:11,color:'#8ab8d4'}}>{mcResult.n} activos · <span style={{color:mcResult.modoAsig==='rotativo'?'#ffd166':mcResult.modoAsig==='custom'?'#9b72ff':'#00d4ff'}}>{mcResult.modoAsig==='rotativo'?'Capital rotativo':mcResult.modoAsig==='custom'?'Pesos personalizados':'Slots iguales'}</span></span>
                  <span style={{fontFamily:MONO,fontSize:11,color:'#8ab8d4'}}>Desde {fmtDate(mcResult.startDate)}</span>
                  <div style={{marginLeft:'auto',display:'flex',gap:6,alignItems:'center'}}>
                    <button onClick={()=>mcChartApiRef.current?.fitAll()}
                      style={{fontFamily:MONO,fontSize:10,padding:'3px 8px',borderRadius:3,cursor:'pointer',border:'1px solid #1a2d45',background:'rgba(0,212,255,0.07)',color:'#7a9bc0'}}
                      title="Ver periodo completo">⊠ Periodo completo</button>
                    <button onClick={()=>setMcLayout(l=>l==='grid'?'panel':'grid')}
                      style={{fontFamily:MONO,fontSize:10,padding:'3px 8px',borderRadius:3,cursor:'pointer',border:'1px solid #1a2d45',background:'rgba(13,21,32,0.9)',color:'#7a9bc0'}}>
                      {mcLayout==='grid'?'⊞ Panel':'⊟ Grid'}
                    </button>
                  </div>
                </div>

                {/* ── Equity — misma estructura que activos individuales ── */}
                <div className="equity-section">
                  <div className="section-title" style={{display:'flex',alignItems:'center',flexWrap:'wrap',gap:6,fontSize:14}}>
                    <span>Equity</span>
                    {[
                      {key:'simple',  label:'Simple',           color:'#00d4ff',state:mcShowSimple,  set:setMcShowSimple},
                      {key:'compound',label:'Compuesto',        color:'#00e5a0',state:mcShowCompound,set:setMcShowCompound},
                      {key:'bh',      label:'B&H Diversificado',color:'#ffd166',state:mcShowBH,      set:setMcShowBH},
                      {key:'sp500',   label:'B&H SP500',        color:'#9b72ff',state:mcShowSP500,   set:setMcShowSP500},
                    ].map(({key,label,color,state,set})=>(
                      <button key={key} onClick={()=>set(s=>!s)}
                        style={{fontFamily:MONO,fontSize:10,padding:'2px 7px',borderRadius:3,cursor:'pointer',
                          border:`1px solid ${state?color:'#3d5a7a'}`,background:state?`${color}18`:'transparent',color:state?color:'#3d5a7a'}}>
                        {label}
                      </button>
                    ))}
                  </div>
                  <MultiCartChart
                    simpleCurve={mcResult.simpleCurve}
                    compoundCurve={mcResult.compoundCurve}
                    bhCurve={mcResult.bhCurve}
                    sp500BHCurve={mcResult.sp500BHCurve||[]}
                    capitalIni={Number(capitalIni)}
                    maxDDSimple={mcResult.maxDDSimple}   maxDDSimpleDate={mcResult.maxDDSimpleDate}
                    maxDDCompound={mcResult.maxDDCompound} maxDDCompoundDate={mcResult.maxDDCompoundDate}
                    maxDDBH={mcResult.maxDDBH}           maxDDBHDate={mcResult.maxDDBHDate}
                    maxDDSP500={mcResult.maxDDSP500||0}  maxDDSP500Date={mcResult.maxDDSP500Date||null}
                    showSimple={mcShowSimple} showCompound={mcShowCompound}
                    showBH={mcShowBH} showSP500={mcShowSP500}
                    onReady={api=>{mcChartApiRef.current=api}}
                    syncRef={chartSyncRef}
                    chartHeight={mcEquityH}
                  />
                  <div onMouseDown={e=>{mcEquityResizing.current=true;mcEquityStartY.current=e.clientY;mcEquityStartH.current=mcEquityH;document.body.style.cursor='row-resize';document.body.style.userSelect='none'}}
                    style={{height:6,cursor:'row-resize',background:'transparent',transition:'background 0.15s',
                      borderTop:'2px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'center'}}
                    onMouseOver={e=>e.currentTarget.style.background='rgba(0,212,255,0.15)'}
                    onMouseOut={e=>e.currentTarget.style.background='transparent'}>
                    <div style={{width:32,height:2,borderRadius:1,background:'rgba(0,212,255,0.3)'}}/>
                  </div>
                </div>

                {/* ── € Capital invertido MC — mismo estilo que activos individuales ── */}
                {mcResult.occupancyCurve?.length>0&&(
                  <div style={{borderTop:'1px solid var(--border)'}}>
                    <div style={{padding:'3px 12px 2px',display:'flex',alignItems:'center',gap:6,fontFamily:MONO,fontSize:11}}>
                      <span style={{color:mcOccMode==='compound'?'#00e5a0':'#00d4ff',fontWeight:600}}>
                        € Capital {mcOccMode==='compound'?'Compuesto':'Simple'} invertido
                      </span>
                      <div style={{display:'flex',gap:3,marginLeft:'auto'}}>
                        {[{id:'compound',label:'Compuesto',c:'#00e5a0'},{id:'simple',label:'Simple',c:'#00d4ff'}].map(m=>(
                          <button key={m.id} onClick={()=>setMcOccMode(m.id)}
                            style={{fontFamily:MONO,fontSize:10,padding:'1px 6px',borderRadius:3,cursor:'pointer',
                              border:`1px solid ${mcOccMode===m.id?m.c:'#2a3f55'}`,
                              background:mcOccMode===m.id?`${m.c}18`:'transparent',
                              color:mcOccMode===m.id?m.c:'#4a6a88'}}>
                            {m.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <McOccupancyChart
                      occupancyCurve={mcResult.occupancyCurve}
                      compoundCurve={mcResult.compoundCurve}
                      capitalIni={Number(capitalIni)}
                      occMode={mcOccMode}
                      syncRef={chartSyncRef}
                    />
                  </div>
                )}
                {/* Métricas en grid cuando mcLayout==='grid' */}
                {mcLayout==='grid'&&(()=>{
                  const lastS=mcResult.simpleCurve.slice(-1)[0]?.value||Number(capitalIni)
                  const lastC=mcResult.compoundCurve.slice(-1)[0]?.value||Number(capitalIni)
                  const lastBH=mcResult.bhCurve.slice(-1)[0]?.value||Number(capitalIni)
                  const capIni=Number(capitalIni)
                  const totalDiasNat=mcResult.startDate?(new Date(mcResult.simpleCurve.slice(-1)[0]?.date)-new Date(mcResult.startDate))/86400000:365
                  const anios=Math.max(totalDiasNat/365.25,0.01)
                  const cagrS=(Math.pow(Math.max(lastS,0.01)/capIni,1/anios)-1)*100
                  const cagrC=(Math.pow(Math.max(lastC,0.01)/capIni,1/anios)-1)*100
                  const cagrBH=(Math.pow(Math.max(lastBH,0.01)/capIni,1/anios)-1)*100
                  const allT=mcResult.allTrades||[]
                  const wins=allT.filter(t=>t.pnlPct>=0),losses=allT.filter(t=>t.pnlPct<0)
                  const winRate=allT.length?wins.length/allT.length*100:0
                  const cols=[
                    {label:'Total Operaciones',val:allT.length,color:'#ffd166'},
                    {label:'Ganadoras / Perdedoras',val:`${wins.length} / ${losses.length}`,color:'#00e5a0'},
                    {label:'Win Rate',val:fmt(winRate,1,'%'),color:winRate>=50?'#00e5a0':'#ff4d6d'},
                    {label:'Capital inv. medio',val:fmt(mcResult.avgOccupancy,1,'%'),color:'#9b72ff'},
                    {label:'Ganancia Simple',val:fmt(lastS-capIni,0,'€'),color:lastS>=capIni?'#00e5a0':'#ff4d6d'},
                    {label:'Ganancia Compuesta',val:fmt(lastC-capIni,0,'€'),color:lastC>=capIni?'#00e5a0':'#ff4d6d'},
                    {label:`CAGR Simple (${fmt(anios,2)}a)`,val:fmt(cagrS,2,'%'),color:cagrS>=0?'#00e5a0':'#ff4d6d'},
                    {label:`CAGR Compuesto (${fmt(anios,2)}a)`,val:fmt(cagrC,2,'%'),color:cagrC>=0?'#00e5a0':'#ff4d6d'},
                    {label:'Max DD Simple',val:fmt(mcResult.maxDDSimple,2,'%'),color:'#ff4d6d'},
                    {label:'Max DD Compuesto',val:fmt(mcResult.maxDDCompound,2,'%'),color:'#ff4d6d'},
                  ]
                  return(
                    <div className="metrics-section" style={{borderBottom:'1px solid var(--border)'}}>
                      {cols.map(c=>(
                        <div key={c.label} className="metric-card">
                          <span className="metric-label">{c.label}</span>
                          <span className="metric-val" style={{color:c.color}}>{c.val}</span>
                        </div>
                      ))}
                    </div>
                  )
                })()}

                {/* Tabla por activo */}
                <div style={{padding:'12px 16px',borderBottom:'1px solid var(--border)'}}>
                  <div style={{fontFamily:MONO,fontSize:10,color:'var(--text3)',marginBottom:8,letterSpacing:'0.05em'}}>RESUMEN POR ACTIVO</div>
                  <div style={{overflowX:'auto'}}>
                    <table style={{width:'100%',borderCollapse:'collapse',fontFamily:MONO,fontSize:11}}>
                      <thead>
                        <tr style={{borderBottom:'1px solid var(--border)'}}>
                          {['Activo','Trades','Win%','G.Simple','G.Comp','Días inv.'].map(h=>(
                            <th key={h} style={{padding:'4px 10px',textAlign:'left',color:'var(--text3)',fontWeight:400,fontSize:9}}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {mcResult.assetStats.map(a=>(
                          <tr key={a.symbol} style={{borderBottom:'1px solid rgba(255,255,255,0.03)',cursor:'pointer'}}
                            onClick={()=>{setSimbolo(a.symbol);setSidePanel('watchlist')}}
                            onMouseOver={e=>e.currentTarget.style.background='rgba(0,212,255,0.05)'}
                            onMouseOut={e=>e.currentTarget.style.background='transparent'}>
                            <td style={{padding:'5px 10px',color:'var(--accent)',fontWeight:700}}>{a.symbol}</td>
                            <td style={{padding:'5px 10px',color:'var(--text)'}}>{a.trades}</td>
                            <td style={{padding:'5px 10px',color:a.winRate>=50?'#00e5a0':'#ff4d6d'}}>{fmt(a.winRate,1,'%')}</td>
                            <td style={{padding:'5px 10px',color:a.ganSimple>=0?'#00e5a0':'#ff4d6d'}}>{a.ganSimple>=0?'+':''}{fmt(a.ganSimple,0,'€')}</td>
                            <td style={{padding:'5px 10px',color:a.ganComp>=0?'#00e5a0':'#ff4d6d'}}>{a.ganComp>=0?'+':''}{fmt(a.ganComp,0,'€')}</td>
                            <td style={{padding:'5px 10px',color:'#00d4ff'}}>{a.totalDias}d</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Barras de resultados multicartera — same style as individual */}
                {mcResult.allTrades?.length>0&&(
                  <div className="equity-section">
                    <div className="section-title" style={{fontSize:14}}>
                      Resultados por Operación <span style={{fontWeight:400,fontSize:11,color:'#9acce0'}}>· clic = ir al trade</span>
                    </div>
                    <div className="equity-bars">
                      {(()=>{
                        const allT=mcResult.allTrades||[]
                        const mx=Math.max(...allT.map(x=>Math.abs(x.pnlPct)),1)
                        return allT.map((t,i)=>(
                          <div key={i} className="equity-bar"
                            style={{height:Math.max(4,Math.abs(t.pnlPct)/mx*56),background:t.pnlPct>=0?'var(--green)':'var(--red)',cursor:'pointer'}}
                            onClick={()=>{
                              const mcDivRef=document.querySelector('.mc-scroll')
                              if(mcDivRef)mcDivRef.scrollTo({top:0,behavior:'smooth'})
                            }}
                            onMouseOver={e=>e.currentTarget.style.opacity='0.7'}
                            onMouseOut={e=>e.currentTarget.style.opacity='1'}
                            title={`${t.symbol||''} · ${fmtDate(t.exitDate)}: ${fmt(t.pnlPct,2)}%`}/>
                        ))
                      })()}
                    </div>
                  </div>
                )}

                {/* Historial combinado — same style as individual */}
                {mcResult.allTrades?.length>0&&(
                  <div className="trades-section">
                    <div className="section-title" style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',fontSize:14}}>
                      <span>Historial Multicartera — {mcResult.allTrades.length} operaciones
                        <span style={{fontWeight:400,fontSize:11,color:'#9acce0'}}> · clic activo → ver gráfico</span>
                      </span>
                      <div style={{display:'flex',gap:4,marginLeft:'auto',alignItems:'center'}}>
                        <input value={mcTradeFilter} onChange={e=>setMcTradeFilter(e.target.value)}
                          placeholder="Filtrar activo…"
                          style={{fontFamily:MONO,fontSize:11,padding:'2px 7px',borderRadius:3,
                            background:'#0d1828',border:'1px solid #274462',color:'#e8f4ff',width:110}}/>
                        {[{id:'compound',label:'Compuesto'},{id:'simple',label:'Simple'}].map(m=>(
                          <button key={m.id} onClick={()=>setMcTradeHistMode(m.id)}
                            style={{fontFamily:MONO,fontSize:10,padding:'2px 6px',borderRadius:3,cursor:'pointer',
                              border:`1px solid ${mcTradeHistMode===m.id?'var(--accent)':'#2a3f55'}`,
                              background:mcTradeHistMode===m.id?'rgba(0,212,255,0.1)':'transparent',
                              color:mcTradeHistMode===m.id?'var(--accent)':'#4a6a88'}}>
                            {m.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div style={{overflowX:'auto'}}>
                      <table style={{width:'100%',borderCollapse:'collapse',fontFamily:MONO,fontSize:11}}>
                        <thead><tr style={{borderBottom:'1px solid var(--border)',position:'sticky',top:0,background:'var(--bg)'}}>
                          {['#','Activo','Entrada','Salida','Capital inv.','Capital final','P&L %','P&L €','Días','Tipo'].map((h,hi)=>(
                            <th key={h} style={{padding:'4px 8px',textAlign:'left',
                              color:hi===4?'#9b72ff':hi===5?'#00d4ff':'#9acce0',
                              fontWeight:400,fontSize:11,whiteSpace:'nowrap'}}>{h}</th>
                          ))}
                        </tr></thead>
                        <tbody>
                          {(()=>{
                            const capIni2=Number(capitalIni)
                            const allT2=(mcTradeFilter
                              ?mcResult.allTrades.filter(t=>(t.symbol||'').toUpperCase().includes(mcTradeFilter.toUpperCase()))
                              :mcResult.allTrades)
                            const fwdS=mcResult.allTrades.map((_,i)=>capIni2+mcResult.allTrades.slice(0,i+1).reduce((s,x)=>s+x.pnlSimple,0))
                            const fwdC=mcResult.allTrades.map(t=>t.capitalTras)
                            let pkS=capIni2,pkC=capIni2
                            const peaksS2=fwdS.map(v=>{pkS=Math.max(pkS,v);return pkS})
                            const peaksC2=fwdC.map(v=>{pkC=Math.max(pkC,v);return pkC})
                            return [...allT2].reverse().map((t,i)=>{
                              const origIdx=mcResult.allTrades.indexOf(t)
                              const isC=mcTradeHistMode==='compound'
                              const capInv=isC?(origIdx>0?mcResult.allTrades[origIdx-1].capitalTras:capIni2):capIni2
                              const capFinalS=fwdS[origIdx],capFinalC=fwdC[origIdx]
                              const capFinal=isC?capFinalC:capFinalS
                              const peak=isC?peaksC2[origIdx]:peaksS2[origIdx]
                              const capFinalColor=capFinal>=peak?'#00d4ff':'#ff9a3c'
                              const pnlEur=isC?(capInv*(t.pnlPct/100)):t.pnlSimple
                              const pnlColor=pnlEur>=0?'var(--green)':'var(--red)'
                              return(
                                <tr key={i}
                                  style={{borderBottom:'1px solid rgba(255,255,255,0.03)',cursor:'pointer'}}
                                  onClick={()=>{setSimbolo(t.symbol);setSidePanel('watchlist')}}
                                  onMouseOver={e=>e.currentTarget.style.background='rgba(0,212,255,0.05)'}
                                  onMouseOut={e=>e.currentTarget.style.background='transparent'}>
                                  <td style={{padding:'4px 8px',color:'#7a9bc0',fontSize:11}}>{allT2.length-i}</td>
                                  <td style={{padding:'4px 8px',color:'var(--accent)',fontWeight:700}}>{t.symbol}</td>
                                  <td style={{padding:'4px 8px',color:'#d8ecff',whiteSpace:'nowrap'}}>{fmtDate(t.entryDate)}</td>
                                  <td style={{padding:'4px 8px',color:'#d8ecff',whiteSpace:'nowrap'}}>{fmtDate(t.exitDate)}</td>
                                  <td style={{padding:'4px 8px',color:'#e8f4ff',fontWeight:600,whiteSpace:'nowrap'}}>€{fmt(capInv,0)}</td>
                                  <td style={{padding:'4px 8px',color:capFinalColor,fontWeight:600,whiteSpace:'nowrap'}}>€{fmt(capFinal,0)}</td>
                                  <td style={{padding:'4px 8px',color:pnlColor,fontWeight:600}}>{t.pnlPct>=0?'+':''}{fmt(t.pnlPct,2)}%</td>
                                  <td style={{padding:'4px 8px',color:pnlColor}}>{pnlEur>=0?'+':''}{fmt(pnlEur,2)}€</td>
                                  <td style={{padding:'4px 8px',color:'#a8c4dc'}}>{t.dias}</td>
                                  <td style={{padding:'4px 8px'}}>
                                    <span style={{fontSize:9,padding:'1px 5px',borderRadius:2,
                                      background:t.pnlPct>=0?'rgba(0,229,160,0.1)':'rgba(255,77,109,0.1)',
                                      color:t.pnlPct>=0?'#00e5a0':'#ff4d6d',
                                      border:`1px solid ${t.pnlPct>=0?'rgba(0,229,160,0.3)':'rgba(255,77,109,0.3)'}`}}>
                                      {t.tipo}
                                    </span>
                                  </td>
                                </tr>
                              )
                            })
                          })()}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
              {/* Right: metrics summary panel — hidden when mcLayout==='grid' */}
              {mcLayout==='panel'&&<div style={{width:rightPanelW,flexShrink:0,borderLeft:'1px solid var(--border)',background:'var(--bg2)',overflowY:'auto',position:'relative'}}>
                {/* Resize handle */}
                <div onMouseDown={e=>{rightResizing.current=true;rightStartX.current=e.clientX;rightStartW.current=rightPanelW;document.body.style.cursor='col-resize';document.body.style.userSelect='none'}}
                  style={{position:'absolute',top:0,left:0,width:4,height:'100%',cursor:'col-resize',zIndex:20,background:'transparent'}}
                  onMouseOver={e=>e.currentTarget.style.background='rgba(0,212,255,0.25)'}
                  onMouseOut={e=>e.currentTarget.style.background='transparent'}/>
                <div style={{padding:'7px 12px',borderBottom:'1px solid var(--border)',fontFamily:MONO,fontSize:10,color:'#8ab8d4',letterSpacing:'0.1em',fontWeight:600}}>RESUMEN MULTICARTERA</div>
                {(()=>{
                  const lastS=mcResult.simpleCurve.slice(-1)[0]?.value||Number(capitalIni)
                  const lastC=mcResult.compoundCurve.slice(-1)[0]?.value||Number(capitalIni)
                  const lastBH=mcResult.bhCurve.slice(-1)[0]?.value||Number(capitalIni)
                  const capIni=Number(capitalIni)
                  const totalDiasNat=mcResult.startDate?(new Date(mcResult.simpleCurve.slice(-1)[0]?.date)-new Date(mcResult.startDate))/86400000:365
                  const anios=Math.max(totalDiasNat/365.25,0.01)
                  const cagrS=(Math.pow(Math.max(lastS,0.01)/capIni,1/anios)-1)*100
                  const cagrC=(Math.pow(Math.max(lastC,0.01)/capIni,1/anios)-1)*100
                  const cagrBH=(Math.pow(Math.max(lastBH,0.01)/capIni,1/anios)-1)*100
                  const allT=mcResult.allTrades||[]
                  const wins=allT.filter(t=>t.pnlPct>=0), losses=allT.filter(t=>t.pnlPct<0)
                  const winRate=allT.length?wins.length/allT.length*100:0
                  const avgWin=wins.length?wins.reduce((s,t)=>s+t.pnlPct,0)/wins.length:0
                  const avgLoss=losses.length?losses.reduce((s,t)=>s+Math.abs(t.pnlPct),0)/losses.length:0
                  const totalDias=allT.reduce((s,t)=>s+t.dias,0)
                  const tiempoInvPct=totalDiasNat>0?(totalDias/totalDiasNat)*100:0
                  const aniosInv=totalDias/365.25
                  const gBrute=wins.reduce((s,t)=>s+t.pnlSimple,0)
                  const lBrute=losses.reduce((s,t)=>s+Math.abs(t.pnlSimple),0)
                  const factorBen=lBrute>0?gBrute/lBrute:999
                  const diasProm=allT.length?totalDias/allT.length:0
                  const v2=(val,color)=>({val,color})
                  const wr2=winRate>=50?'#00e5a0':'#ff4d6d'
                  const fb2=factorBen>=1?'#00e5a0':'#ff4d6d'
                  const cS2=lastS>=capIni?'#00e5a0':'#ff4d6d'
                  const cC2=lastC>=capIni?'#00e5a0':'#ff4d6d'
                  const cBH2=lastBH>=capIni?'#00e5a0':'#ff4d6d'
                  const mcRows=[
                    {label:'Total Operaciones',     compound:v2(allT.length,'#ffd166'),  bh:null, simple:v2(allT.length,'#ffd166')},
                    {label:'Total Días Invertido',  compound:v2(totalDias,'#00d4ff'),    bh:null, simple:v2(totalDias,'#00d4ff')},
                    {label:'Días Promedio',         compound:v2(fmt(diasProm,1,' días'),'#00d4ff'), bh:null, simple:v2(fmt(diasProm,1,' días'),'#00d4ff')},
                    {label:`Tiempo Invertido (${fmt(aniosInv,2)}a)`, compound:v2(fmt(tiempoInvPct,0,'%'),'#ffd166'), bh:null, simple:v2(fmt(tiempoInvPct,0,'%'),'#ffd166')},
                    {label:'Capital inv. medio',    compound:v2(fmt(mcResult.avgOccupancy,1,'%'),'#9b72ff'), bh:null, simple:v2(fmt(mcResult.avgOccupancy,1,'%'),'#9b72ff')},
                    {label:'Ganadoras',             compound:v2(wins.length,'#00e5a0'), bh:null, simple:v2(wins.length,'#00e5a0')},
                    {label:'Perdedoras',            compound:v2(losses.length,'#ff4d6d'), bh:null, simple:v2(losses.length,'#ff4d6d')},
                    {label:'Win Rate',              compound:v2(fmt(winRate,1,'%'),wr2), bh:null, simple:v2(fmt(winRate,1,'%'),wr2)},
                    {label:'Factor de Beneficio',   compound:v2(fmt(factorBen,2),fb2), bh:null, simple:v2(fmt(factorBen,2),fb2)},
                    {label:'Ganancia Media (%)',    compound:v2(fmt(avgWin,2,'%'),'#00e5a0'), bh:null, simple:v2(fmt(avgWin,2,'%'),'#00e5a0')},
                    {label:'Pérdida Media (%)',     compound:v2(fmt(avgLoss,2,'%'),'#ff4d6d'), bh:null, simple:v2(fmt(avgLoss,2,'%'),'#ff4d6d')},
                    {label:'Ganancia (€)',          compound:v2(fmt(lastC-capIni,2,'€'),cC2), bh:v2(fmt(lastBH-capIni,2,'€'),cBH2), simple:v2(fmt(lastS-capIni,2,'€'),cS2)},
                    {label:'Ganancia (%)',          compound:v2(fmt((lastC-capIni)/capIni*100,2,'%'),cC2), bh:v2(fmt((lastBH-capIni)/capIni*100,2,'%'),cBH2), simple:v2(fmt((lastS-capIni)/capIni*100,2,'%'),cS2)},
                    {label:`CAGR (${fmt(anios,2)}a)`, compound:v2(fmt(cagrC,2,'%'),cagrC>=0?'#00e5a0':'#ff4d6d'), bh:v2(fmt(cagrBH,2,'%'),cagrBH>=0?'#00e5a0':'#ff4d6d'), simple:v2(fmt(cagrS,2,'%'),cagrS>=0?'#00e5a0':'#ff4d6d')},
                    {label:'Max Drawdown (%)',      compound:v2(fmt(mcResult.maxDDCompound,2,'%'),'#ff4d6d'), bh:v2(fmt(mcResult.maxDDBH,2,'%'),'#ff4d6d'), simple:v2(fmt(mcResult.maxDDSimple,2,'%'),'#ff4d6d')},
                  ]
                  return(
                    <div style={{display:'flex',flexDirection:'column',height:'100%'}}>
                      <div style={{display:'flex',alignItems:'center',padding:'4px 12px',borderBottom:'1px solid var(--border)'}}>
                        <span style={{fontFamily:MONO,fontSize:10,color:'#9acce0',flex:1}}>MULTICARTERA</span>
                        <button onClick={()=>setMetricsView(v=>v==='multi'?'single':'multi')}
                          style={{fontFamily:MONO,fontSize:10,padding:'2px 7px',borderRadius:3,cursor:'pointer',
                            border:'1px solid #2a4060',background:'rgba(0,0,0,0.3)',color:'#7aabc8'}}>
                          {metricsView==='multi'?'⊟ 1col':'⊞ 3col'}
                        </button>
                      </div>
                      <StratSelector strats={metricsStrats} setStrats={setMetricsStrats}/>
                      <div style={{overflowY:'auto',flex:1}}>
                        <MetricsWrapper rows={mcRows} strats={metricsStrats}/>
                      </div>
                    </div>
                  )
                })()}
              </div>}
              </div>
            )}

            {/* ══ TRADELOG MAIN PANEL ══ */}
            {sidePanel==='tradelog'&&(
              <div className="tl-content" style={{display:'flex',flex:1,height:'100%',overflow:'hidden',background:'var(--bg)',fontSize:13}} onContextMenu={e=>openCtx(e,'tradelog')}>

                {/* COLUMNA CENTRAL — siempre visible con tab bar fija arriba */}
                <div style={{flex:1,display:'flex',flexDirection:'column',minWidth:0,overflow:'hidden'}}>
                  {/* ── Modo indicator bar ── */}
                  {tlUseLocal()&&(
                    <div style={{padding:'3px 10px',background:'rgba(255,209,102,0.04)',borderBottom:'1px solid rgba(255,209,102,0.1)',
                      fontFamily:MONO,fontSize:9,color:'#7a6a30',display:'flex',alignItems:'center',gap:4,flexShrink:0}}>
                      💾 <span style={{color:'#ffd166',opacity:0.7}}>Modo local</span>
                      <span style={{opacity:0.5}}>— Configura Supabase en Settings → Integraciones</span>
                    </div>
                  )}
                  {/* ── TABS siempre visibles + búsqueda/nueva op ── */}
                  <div style={{display:'flex',borderBottom:'2px solid var(--border)',flexShrink:0,alignItems:'stretch',background:'#0a0f1a'}}>
                    {/* Search — izquierda, antes de los tabs */}
                    <div style={{display:'flex',gap:4,alignItems:'center',padding:'4px 8px',borderRight:'1px solid var(--border)',flexShrink:0}}>
                      <input ref={tlSearchRef} type="text" placeholder="🔍 símbolo" value={tlSearch} onChange={e=>setTlSearch(e.target.value)}
                        style={{width:110,background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:10,padding:'3px 7px',borderRadius:4}}/>
                      {tlSearch&&(
                        <button onClick={()=>{setTlSearch('');setTimeout(()=>tlSearchRef.current?.focus(),0)}} title="Limpiar filtro"
                          style={{background:'transparent',border:'none',color:'#ff4d6d',cursor:'pointer',
                            fontSize:12,padding:'0 3px',lineHeight:1,flexShrink:0}}
                          onMouseOver={e=>e.currentTarget.style.color='#ff8080'}
                          onMouseOut={e=>e.currentTarget.style.color='#ff4d6d'}>✕</button>
                      )}
                      <span style={{fontFamily:MONO,fontSize:9,color:'#3d5a7a',flexShrink:0}}>
                        {tlFiltered.length}
                      </span>
                      {tlLoading&&<span style={{fontFamily:MONO,fontSize:9,color:'#9b72ff',flexShrink:0}}>⟳</span>}
                    </div>
                    {[{id:'ops',label:'Ops'},{id:'import',label:'📥 Import'},{id:'export',label:'📤 Export'},{id:'dashboard',label:'📊 Dashboard'}].map(t=>(
                      <button key={t.id} onClick={()=>setTlTab(t.id)}
                        style={{padding:'9px 16px',fontFamily:MONO,fontSize:11,cursor:'pointer',
                          background:tlTab===t.id?'rgba(155,114,255,0.12)':'transparent',
                          border:'none',
                          borderBottom:tlTab===t.id?'2px solid #9b72ff':'2px solid transparent',
                          marginBottom:'-2px',
                          color:tlTab===t.id?'#d0aaff':'#4a7a95',letterSpacing:'0.04em',fontWeight:tlTab===t.id?700:400,
                          whiteSpace:'nowrap',flexShrink:0}}>
                        {t.label}
                      </button>
                    ))}
                    <div style={{flex:1}}/>
                    <div style={{display:'flex',gap:6,alignItems:'center',padding:'5px 10px'}}>
                      {tlMultiMode?(
                        <>
                          <span style={{fontFamily:MONO,fontSize:10,color:'#ffd166',flexShrink:0}}>
                            {tlMultiSel.size} seleccionadas
                          </span>
                          <button onClick={()=>tlDeleteMulti(tlMultiSel)}
                            disabled={tlMultiSel.size===0}
                            style={{flexShrink:0,fontFamily:MONO,fontSize:10,padding:'4px 12px',borderRadius:4,cursor:'pointer',
                              background:tlMultiSel.size>0?'rgba(255,77,109,0.2)':'rgba(60,30,30,0.3)',
                              border:'1px solid '+(tlMultiSel.size>0?'#ff4d6d':'#3a1a1a'),
                              color:tlMultiSel.size>0?'#ff4d6d':'#5a2a2a',fontWeight:700,whiteSpace:'nowrap'}}>
                            🗑 Eliminar
                          </button>
                          <button onClick={()=>{setTlMultiMode(false);setTlMultiSel(new Set())}}
                            style={{flexShrink:0,fontFamily:MONO,fontSize:10,padding:'4px 10px',borderRadius:4,cursor:'pointer',
                              background:'transparent',border:'1px solid #2a4060',color:'#7a9bc0',whiteSpace:'nowrap'}}>
                            Cancelar
                          </button>
                        </>
                      ):(
                        <>
                          <button onClick={()=>setTlMultiMode(true)}
                            title="Selección múltiple para borrar"
                            style={{flexShrink:0,fontFamily:MONO,fontSize:10,padding:'4px 8px',borderRadius:4,cursor:'pointer',
                              background:'transparent',border:'1px solid #2a3040',color:'#4a6a80',whiteSpace:'nowrap'}}>
                            🗑
                          </button>
                          <button onClick={()=>{const _df=tlDefaultForm();setTlForm(_df);setTlFormOpen(true);if(_df.entry_currency&&_df.entry_currency!=='EUR')tlFetchFx(_df.entry_currency,_df.entry_date)}}
                            style={{flexShrink:0,fontFamily:MONO,fontSize:10,padding:'4px 12px',borderRadius:4,cursor:'pointer',
                              background:'rgba(155,114,255,0.15)',border:'1px solid #9b72ff',color:'#9b72ff',fontWeight:700,whiteSpace:'nowrap'}}>
                            + Nueva op.
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  {/* ── Contenido por tab ── */}
                  {(tlTab==='ops'||tlTab==='open')&&(
                  <div style={{flex:1,display:'flex',flexDirection:'column',minWidth:0,overflow:'hidden'}}>

                    {/* Tabla */}
                    <div style={{flex:1,overflowY:'auto'}}>
                      <table className="tl-ops-table" onContextMenu={e=>{e.stopPropagation();openCtx(e,'tl_table')}} style={{width:'100%',borderCollapse:'collapse',fontFamily:MONO,fontSize:11}}>
                        <thead>
                          <tr style={{background:'var(--bg2)',position:'sticky',top:0,zIndex:5}}>
                            {tlMultiMode&&(
                              <th style={{padding:'6px 8px',borderBottom:'1px solid var(--border)',width:32}}>
                                <input type="checkbox"
                                  style={{cursor:'pointer',accentColor:'#ff4d6d'}}
                                  checked={tlFiltered.length>0&&tlFiltered.every(t=>tlMultiSel.has(t.id))}
                                  onChange={e=>{
                                    const visible=tlFiltered
                                    if(e.target.checked) setTlMultiSel(new Set(visible.map(t=>t.id)))
                                    else setTlMultiSel(new Set())
                                  }}
                                  title="Seleccionar todas"
                                />
                              </th>
                            )}
                            {['#','Símbolo','Estrategia','Broker','Entrada','Salida','Acciones','Px entrada','Capital inv.','Px salida/actual','Divisa','FX','Comisión','P&L €','P&L %','Días','Estado'].map(h=>(
                              <th key={h} style={{padding:'6px 8px',textAlign:'left',fontFamily:MONO,fontSize:9,color:'#3d5a7a',
                                letterSpacing:'0.08em',textTransform:'uppercase',borderBottom:'1px solid var(--border)',whiteSpace:'nowrap'}}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {(()=>{
                            // ── Build group-aware display list ──
                            // Group rows by group_id; ungrouped rows render normally
                            const groupMap = {}
                            tlFiltered.forEach(t=>{
                              if(t.group_id){
                                if(!groupMap[t.group_id]) groupMap[t.group_id]=[]
                                groupMap[t.group_id].push(t)
                              }
                            })
                            // Build ordered display items: {type:'row'|'group', ...}
                            const seen = new Set()
                            const items = []
                            tlFiltered.forEach((t,i)=>{
                              if(!t.group_id){
                                items.push({type:'row', t, i})
                              } else if(!seen.has(t.group_id)){
                                seen.add(t.group_id)
                                const members = groupMap[t.group_id]
                                items.push({type:'group', group_id:t.group_id, members, i})
                              }
                            })
                            // ── Row renderer (shared by single rows and sub-rows) ──
                            const renderRow = (t, i, arr, opts={})=>{
                              const {isSub=false, isLast=false} = opts
                              const isOpen=t.status==='open'
                              const pnl=isOpen?t._pnl_float_eur:t.pnl_eur
                              const pnlPct=isOpen?t._pnl_float_pct:t.pnl_pct
                              const exitPx=isOpen?t._current_price:t.exit_price
                              const dias=t.entry_date&&(isOpen?t._current_date:t.exit_date)?
                                Math.round((new Date(isOpen?t._current_date||new Date():t.exit_date)-new Date(t.entry_date))/86400000):null
                              const col=TL_COLORS[t.broker]||'#7a9bc0'
                              const isSel=tlSelected?.id===t.id
                              const isMultiChecked = tlMultiSel.has(t.id)
                              const baseBg = isSub
                                ? (isMultiChecked?'rgba(255,77,109,0.07)':isSel?'rgba(155,114,255,0.08)':'rgba(0,212,255,0.03)')
                                : (isMultiChecked?'rgba(255,77,109,0.07)':isSel?'rgba(155,114,255,0.06)':isOpen?'rgba(0,229,160,0.02)':'transparent')
                              return(
                              <tr key={t.id} onClick={()=>{
                                if(tlMultiMode){
                                  setTlMultiSel(prev=>{const n=new Set(prev);n.has(t.id)?n.delete(t.id):n.add(t.id);return n})
                                  return
                                }
                                setTlSelected(t)
                                if(t.has_fills)loadFills(t.id);else setTlFills([])
                                const df=tlDefaultForm()
                                setTlForm({...df,
                                  id:t.id,symbol:t.symbol||'',name:t.name||'',
                                  asset_type:t.asset_type||'stock',broker:t.broker||df.broker,
                                  entry_date:toDisplayDate(t.entry_date)||'',
                                  entry_price:t.entry_price||'',shares:t.shares||'',
                                  entry_currency:t.entry_currency||'USD',
                                  commission_buy:t.commission_buy||0,
                                  fx_entry:t.fx_entry?String(t.fx_entry):'',
                                  fx_entry_manual:!!t.fx_entry,
                                  notes:t.notes||'',strategy:t.strategy||df.strategy,
                                  import_source:t.import_source||'manual'
                                })
                                if(t.status==='open'){
                                  setTlCloseForm({exit_date:todayDisplay(),exit_price:'',exit_currency:t.entry_currency||'USD',commission_sell:0,fx_exit:'',fx_exit_manual:false})
                                }
                                setTlFillsList([]);setTlExitFillsList([]);setTlFormOpen(true)
                              }}
                                style={{borderBottom:'1px solid var(--border)',cursor:'pointer',
                                  background:baseBg,
                                  borderLeft: isSub?'2px solid rgba(0,212,255,0.2)':'none'}}
                                onMouseOver={e=>e.currentTarget.style.background=isMultiChecked?'rgba(255,77,109,0.12)':isSub?'rgba(0,212,255,0.06)':'rgba(255,255,255,0.03)'}
                                onMouseOut={e=>e.currentTarget.style.background=baseBg}>
                                {tlMultiMode&&(
                                  <td style={{padding:'6px 8px'}} onClick={e=>e.stopPropagation()}>
                                    <input type="checkbox" checked={isMultiChecked}
                                      style={{cursor:'pointer',accentColor:'#ff4d6d'}}
                                      onChange={()=>setTlMultiSel(prev=>{const n=new Set(prev);n.has(t.id)?n.delete(t.id):n.add(t.id);return n})}/>
                                  </td>
                                )}
                                <td style={{padding:'6px 8px',color:'#3d5a7a',fontSize:10}}>
                                  {isSub?<span style={{marginLeft:8,color:'#2a4060'}}>↳</span>:i+1}
                                </td>
                                <td style={{padding:'6px 4px 6px 8px',maxWidth:120}} onClick={e=>e.stopPropagation()}>
                                  <div style={{display:'flex',alignItems:'center',gap:4}}>
                                    <span
                                      onClick={e=>{e.stopPropagation();window.open('https://www.tradingview.com/chart/?symbol='+tvSym(t.symbol),'_blank')}}
                                      title={'Abrir '+t.symbol+' en TradingView'}
                                      style={{fontWeight:700,color:isOpen?'#9b72ff':'#00d4ff',cursor:'pointer',
                                        textDecoration:'underline',textDecorationColor:'rgba(0,212,255,0.3)',
                                        textUnderlineOffset:2}}>
                                      {t.symbol}
                                    </span>
                                    {t.has_fills&&<span style={{fontSize:8,color:'#5a8aaa',flexShrink:0}}>fills</span>}
                                    {(()=>{
                                      const sett=(()=>{try{return JSON.parse(localStorage.getItem('v50_settings')||'{}')}catch(_){return {}}})()
                                      const tlCondIds=sett?.tradelog?.condDotIds
                                      const allLibConds=lsGetConds()
                                      const visConds=Array.isArray(tlCondIds)&&tlCondIds.length>0?allLibConds.filter(c=>tlCondIds.includes(c.id)):[]
                                      if(!visConds.length) return null
                                      const COND_COLORS=['#00e5a0','#ffd166','#00d4ff','#ff7eb3','#9b72ff','#ff4d6d']
                                      const blinkN=sett?.alarmas?.blinkCandles??3
                                      return visConds.map((c,ci)=>{
                                        const st=alarmStatus[t.symbol]?.[c.id]
                                        const active=st?.active===true
                                        const bars=st?.bars
                                        const col2=COND_COLORS[ci%COND_COLORS.length]
                                        const shouldBlink=active&&bars!=null&&bars<=blinkN
                                        return(
                                          <span key={c.id} title={c.name+(active?' ✓ '+(bars!=null?bars+'v':''):' —')}
                                            style={{display:'inline-flex',alignItems:'center',justifyContent:'center',
                                              width:13,height:13,borderRadius:'50%',flexShrink:0,
                                              background:active?col2:'rgba(42,63,85,0.5)',
                                              border:'1px solid '+(active?col2:'#2a3f55'),
                                              color:active?'#080c14':'#3d5a7a',
                                              fontFamily:MONO,fontSize:5,fontWeight:800,lineHeight:1,letterSpacing:'-0.5px',
                                              boxShadow:active?'0 0 5px '+col2+'55':undefined,
                                              cursor:'default',
                                              animation:shouldBlink?'alarmPulse 1s ease-in-out infinite':undefined}}>
                                            {active&&bars!=null?String(bars):''}
                                          </span>
                                        )
                                      })
                                    })()}
                                  </div>
                                </td>
                                <td style={{padding:'6px 4px',maxWidth:90,overflow:'hidden'}}>
                                  <span style={{fontFamily:MONO,fontSize:9,color:'#5a8aaa',
                                    overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',display:'block'}}
                                    title={t.strategy||'—'}>
                                    {t.strategy||<span style={{color:'#2a4060'}}>—</span>}
                                  </span>
                                </td>
                                <td style={{padding:'6px 8px'}}>
                                  <span style={{fontSize:9,padding:'1px 5px',borderRadius:3,fontWeight:700,
                                    background:col+'18',border:'1px solid '+col+'44',color:col}}>
                                    {TL_LABEL[t.broker]||t.broker?.toUpperCase()}
                                  </span>
                                </td>
                                <td style={{padding:'6px 8px',color:'#a8ccdf',whiteSpace:'nowrap'}}>{fmtDate(t.entry_date)||'—'}</td>
                                <td style={{padding:'6px 8px',color:'#a8ccdf',whiteSpace:'nowrap'}}>{isOpen?<span style={{color:'#3d5a7a'}}>—</span>:fmtDate(t.exit_date)||'—'}</td>
                                <td style={{padding:'6px 8px',color:'#e2eaf5'}}>{t.shares}</td>
                                <td style={{padding:'6px 8px',color:'#e2eaf5'}}>{t.entry_price}</td>
                                <td style={{padding:'6px 8px',color:'#7a9bc0',whiteSpace:'nowrap'}}>
                                  {(()=>{
                                    let cap=parseFloat(t.entry_price||0)*parseFloat(t.shares||0)
                                    let fx=parseFloat(t.fx_entry||1);if(fx<1&&fx>0)fx=1/fx
                                    const capEur=(t.entry_currency&&t.entry_currency!=='EUR')?cap/fx:cap
                                    return capEur>0?'€'+Math.round(capEur).toLocaleString('es-ES'):'—'
                                  })()}
                                </td>
                                <td style={{padding:'6px 8px',color:isOpen?'#9b72ff':'#e2eaf5',whiteSpace:'nowrap'}}>
                                  {exitPx?parseFloat(exitPx).toFixed(2):<span style={{color:'#3d5a7a'}}>—</span>}
                                  {isOpen&&exitPx&&<span style={{fontSize:8,color:'#5a8aaa',marginLeft:2}}>live</span>}
                                </td>
                                <td style={{padding:'6px 8px',color:'#ffd166',fontSize:10}}>{t.entry_currency||'—'}</td>
                                <td style={{padding:'6px 8px',color:'#4a7a95',fontSize:10}}>{(()=>{let fx=parseFloat(t.fx_entry||0);if(!fx||isNaN(fx))return'—';if(fx<1)fx=1/fx;return fx.toFixed(4)})()}</td>
                                <td style={{padding:'6px 8px',color:'#4a7a95',fontSize:10}}>{(()=>{const c=parseFloat(t.commission_buy||0)+parseFloat(t.commission_sell||0);return c>0?'€'+c.toFixed(2):'—'})()}</td>
                                <td style={{padding:'6px 8px',whiteSpace:'nowrap'}}>
                                  {pnl!=null?<span style={{color:pnl>=0?'#00e5a0':'#ff4d6d',fontWeight:600}}>{pnl>=0?'+':''}{parseFloat(pnl).toFixed(2)}€</span>:<span style={{color:'#3d5a7a'}}>—</span>}
                                </td>
                                <td style={{padding:'6px 8px',whiteSpace:'nowrap'}}>
                                  {pnlPct!=null?<span style={{color:pnlPct>=0?'#00e5a0':'#ff4d6d',fontWeight:600}}>{pnlPct>=0?'+':''}{parseFloat(pnlPct).toFixed(2)}%</span>:<span style={{color:'#3d5a7a'}}>—</span>}
                                </td>
                                <td style={{padding:'6px 8px',color:'#7a9bc0'}}>{dias!=null?dias+'d':'—'}</td>
                                <td style={{padding:'6px 8px'}}>
                                  <span style={{fontSize:9,padding:'1px 5px',borderRadius:3,fontWeight:700,
                                    background:isOpen?'rgba(155,114,255,0.12)':'rgba(0,229,160,0.1)',
                                    border:'1px solid '+(isOpen?'rgba(155,114,255,0.3)':'rgba(0,229,160,0.3)'),
                                    color:isOpen?'#9b72ff':'#00e5a0'}}>
                                    {isOpen?'Abierta':'Cerrada'}
                                  </span>
                                </td>
                              </tr>
                              )
                            }
                            // ── Render display items ──
                            return items.flatMap((item, displayIdx)=>{
                              if(item.type==='row'){
                                return [renderRow(item.t, displayIdx, items)]
                              }
                              // GROUP
                              const {group_id, members} = item
                              const isExp = tlExpandedGroups.has(group_id)
                              const first = members[0]
                              const totalShares = members.reduce((s,m)=>s+parseFloat(m.shares||0),0)
                              const allOpen = members.every(m=>m.status==='open')
                              const allClosed = members.every(m=>m.status==='closed')
                              const groupPnl = members.reduce((s,m)=>{
                                const p=m.status==='open'?m._pnl_float_eur:m.pnl_eur
                                return s+(p!=null?parseFloat(p):0)
                              },0)
                              const groupPnlPct = members.reduce((s,m)=>{
                                const p=m.status==='open'?m._pnl_float_pct:m.pnl_pct
                                return s+(p!=null?parseFloat(p):0)
                              },0)/members.length
                              const col=TL_COLORS[first.broker]||'#7a9bc0'
                              const rows = [
                                // Parent summary row
                                <tr key={'grp-'+group_id}
                                  style={{borderBottom:'1px solid var(--border)',
                                    background:'rgba(0,212,255,0.04)',
                                    borderLeft:'2px solid rgba(0,212,255,0.35)',cursor:'pointer'}}
                                  onMouseOver={e=>e.currentTarget.style.background='rgba(0,212,255,0.08)'}
                                  onMouseOut={e=>e.currentTarget.style.background='rgba(0,212,255,0.04)'}>
                                  {tlMultiMode&&<td style={{padding:'6px 8px'}}/>}
                                  <td style={{padding:'6px 8px'}}>
                                    <button
                                      onClick={e=>{e.stopPropagation();setTlExpandedGroups(prev=>{const n=new Set(prev);n.has(group_id)?n.delete(group_id):n.add(group_id);return n})}}
                                      style={{background:'rgba(0,212,255,0.12)',border:'1px solid rgba(0,212,255,0.35)',
                                        color:'#00d4ff',borderRadius:3,cursor:'pointer',
                                        fontFamily:MONO,fontSize:10,padding:'1px 5px',lineHeight:1,fontWeight:700}}>
                                      {isExp?'▼':'▶'} {members.length}
                                    </button>
                                  </td>
                                  <td style={{padding:'6px 4px 6px 8px'}} onClick={e=>{e.stopPropagation();setTlExpandedGroups(prev=>{const n=new Set(prev);n.has(group_id)?n.delete(group_id):n.add(group_id);return n})}}>
                                    <span style={{fontWeight:700,color:'#00d4ff'}}>{first.symbol}</span>
                                    <span style={{fontFamily:MONO,fontSize:8,color:'#4a7a95',marginLeft:4}}>{members.length} ops</span>
                                  </td>
                                  <td style={{padding:'6px 4px',color:'#5a8aaa',fontSize:9}}>{first.strategy||'—'}</td>
                                  <td style={{padding:'6px 8px'}}>
                                    <span style={{fontSize:9,padding:'1px 5px',borderRadius:3,fontWeight:700,
                                      background:col+'18',border:'1px solid '+col+'44',color:col}}>
                                      {TL_LABEL[first.broker]||first.broker?.toUpperCase()}
                                    </span>
                                  </td>
                                  <td style={{padding:'6px 8px',color:'#a8ccdf',fontSize:9}}>{fmtDate(first.entry_date)||'—'}</td>
                                  <td style={{padding:'6px 8px',color:'#3d5a7a',fontSize:9}}>—</td>
                                  <td style={{padding:'6px 8px',color:'#e2eaf5'}}>{totalShares.toFixed(0)}</td>
                                  <td colSpan={3} style={{padding:'6px 8px',color:'#4a7a95',fontSize:9}}>precio medio ponderado</td>
                                  <td style={{padding:'6px 8px',color:'#ffd166',fontSize:10}}>{first.entry_currency||'—'}</td>
                                  <td colSpan={2} style={{padding:'6px 8px'}}/>
                                  <td style={{padding:'6px 8px',whiteSpace:'nowrap'}}>
                                    {groupPnl!==0?<span style={{color:groupPnl>=0?'#00e5a0':'#ff4d6d',fontWeight:600}}>{groupPnl>=0?'+':''}{groupPnl.toFixed(2)}€</span>:<span style={{color:'#3d5a7a'}}>—</span>}
                                  </td>
                                  <td style={{padding:'6px 8px',whiteSpace:'nowrap'}}>
                                    {groupPnlPct!==0?<span style={{color:groupPnlPct>=0?'#00e5a0':'#ff4d6d',fontWeight:600}}>{groupPnlPct>=0?'+':''}{groupPnlPct.toFixed(2)}%</span>:<span style={{color:'#3d5a7a'}}>—</span>}
                                  </td>
                                  <td style={{padding:'6px 8px',color:'#3d5a7a'}}>—</td>
                                  <td style={{padding:'6px 8px'}}>
                                    <span style={{fontSize:9,padding:'1px 5px',borderRadius:3,fontWeight:700,
                                      background:allOpen?'rgba(155,114,255,0.12)':allClosed?'rgba(0,229,160,0.1)':'rgba(255,209,102,0.1)',
                                      border:'1px solid '+(allOpen?'rgba(155,114,255,0.3)':allClosed?'rgba(0,229,160,0.3)':'rgba(255,209,102,0.3)'),
                                      color:allOpen?'#9b72ff':allClosed?'#00e5a0':'#ffd166'}}>
                                      {allOpen?'Abiertas':allClosed?'Cerradas':'Mixto'}
                                    </span>
                                  </td>
                                </tr>
                              ]
                              // Sub-rows when expanded
                              if(isExp){
                                members.forEach((m,mi)=>rows.push(renderRow(m, mi, members, {isSub:true, isLast:mi===members.length-1})))
                              }
                              return rows
                            })
                          })()}
                        </tbody>
                      </table>
                      {!tlLoading&&tlTrades.length===0&&(
                        <div style={{padding:'40px',textAlign:'center',fontFamily:MONO,fontSize:12,color:'#3d5a7a'}}>
                          Sin operaciones registradas.{' '}
                          <span style={{color:'#9b72ff',cursor:'pointer'}} onClick={()=>{const _df=tlDefaultForm();setTlForm(_df);setTlFormOpen(true);if(_df.entry_currency&&_df.entry_currency!=='EUR')tlFetchFx(_df.entry_currency,_df.entry_date)}}>
                            Añadir primera operación →
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* IMPORTAR */}
                {tlTab==='import'&&(
                  <div style={{flex:1,display:'flex',flexDirection:'column',padding:'16px',gap:12,overflowY:'auto'}}>
                    <div style={{fontFamily:MONO,fontSize:13,color:'#c8dff5',fontWeight:700}}>📥 Importar operaciones</div>
                    {/* Selector de formato */}
                    <div style={{display:'flex',gap:6}}>
                      {[['ibkr_csv','CSV IBKR'],['degiro_csv','CSV Degiro'],['ai','Texto / Pegar']].map(([v,l])=>(
                        <button key={v} onClick={()=>setTlImportFormat(v)}
                          style={{fontFamily:MONO,fontSize:11,padding:'5px 10px',borderRadius:4,cursor:'pointer',
                            border:`1px solid ${tlImportFormat===v?'#9b72ff':'#1a2d45'}`,
                            background:tlImportFormat===v?'rgba(155,114,255,0.12)':'transparent',
                            color:tlImportFormat===v?'#9b72ff':'#7a9bc0'}}>{l}</button>
                      ))}
                    </div>
                    <div style={{fontFamily:MONO,fontSize:11,color:'#5a8aaa'}}>
                      {tlImportFormat==='ibkr_csv'&&'Exporta desde IBKR: Informes → Extracto de cuenta → CSV. Pega el contenido aquí.'}
                      {tlImportFormat==='degiro_csv'&&'Exporta desde Degiro: Actividad → Exportar → CSV. Pega el contenido aquí.'}
                      {tlImportFormat==='ai'&&'Pega cualquier texto: historial de broker, tabla HTML o detalle de orden. Se interpretará automáticamente.'}
                    </div>
                    <textarea value={tlImportText} onChange={e=>setTlImportText(e.target.value)}
                      placeholder={tlImportFormat==='ai'?'Pega aquí el historial, tabla o describe la operación... Ej: Compré 50 NVDA el 12/02/2025 a $485.20, comisión $1.50':'Pega el contenido del CSV aquí...'}
                      style={{flex:'none',height:200,background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',
                        fontFamily:MONO,fontSize:11,padding:'10px',borderRadius:4,resize:'vertical',minHeight:120}}/>
                    <div style={{display:'flex',gap:8,alignItems:'center'}}>
                      <button onClick={()=>{setTlImportText('');setTlParsed([]);setTlParsedRaw([])}}
                        style={{fontFamily:MONO,fontSize:11,padding:'6px 12px',borderRadius:4,cursor:'pointer',
                          background:'transparent',border:'1px solid #2a4060',color:'#7a9bc0'}}>
                        ✕ Limpiar
                      </button>
                      <button onClick={tlImportParse} disabled={tlImportLoading||!tlImportText.trim()}
                        style={{fontFamily:MONO,fontSize:11,padding:'7px 14px',borderRadius:4,cursor:tlImportLoading?'wait':'pointer',
                          background:'rgba(155,114,255,0.15)',border:'1px solid #9b72ff',color:'#9b72ff',fontWeight:700,
                          opacity:!tlImportText.trim()?0.4:1}}>
                        {tlImportLoading?'⟳ Procesando...':'🔍 Analizar'}
                      </button>
                      {tlParsed.length>0&&<span style={{fontFamily:MONO,fontSize:11,color:'#00e5a0'}}>✓ {tlParsed.length} operaciones detectadas</span>}
                    </div>

                    {/* Preview de operaciones parseadas */}
                    {tlParsed.length>0&&(
                      <div style={{border:'1px solid var(--border)',borderRadius:6,overflow:'hidden'}}>
                        <div style={{padding:'8px 12px',background:'var(--bg2)',borderBottom:'1px solid var(--border)',
                          display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                          <div style={{display:'flex',alignItems:'center',gap:6}}>
                            <span style={{fontFamily:MONO,fontSize:11,color:'#c8dff5',fontWeight:700}}>Preview</span>
                            <button onClick={()=>{
                              const next=!tlGroupFills
                              setTlGroupFills(next)
                              setTlParsed(enrichParsedRows(next ? groupParsedFills(tlParsedRaw) : tlParsedRaw))
                            }}
                              title="Agrupar compras y ventas del mismo símbolo en una operación"
                              style={{fontFamily:MONO,fontSize:9,padding:'2px 7px',borderRadius:3,cursor:'pointer',
                                border:'1px solid '+(tlGroupFills?'#ffd166':'#2a4060'),
                                background:tlGroupFills?'rgba(255,209,102,0.1)':'transparent',
                                color:tlGroupFills?'#ffd166':'#5a7a95'}}>
                              {tlGroupFills?'⛓ Agrupado':'⛓ Agrupar fills'}
                            </button>
                          </div>
                          <div style={{display:'flex',gap:6}}>
                            <button onClick={()=>{setTlParsed([]);setTlParsedRaw([])}}
                              style={{fontFamily:MONO,fontSize:10,padding:'3px 8px',borderRadius:3,cursor:'pointer',
                                border:'1px solid #2a4060',background:'transparent',color:'#7a9bc0'}}>Cancelar</button>
                            <button onClick={()=>tlImportConfirm(tlParsed)}
                              disabled={tlParsed.some(r=>r._multipleOpen&&!r._closesTradeId)}
                              style={{fontFamily:MONO,fontSize:10,padding:'3px 8px',borderRadius:3,
                                cursor:tlParsed.some(r=>r._multipleOpen&&!r._closesTradeId)?'not-allowed':'pointer',
                                border:'1px solid '+(tlParsed.some(r=>r._multipleOpen&&!r._closesTradeId)?'#ffd166':'#00e5a0'),
                                background:tlParsed.some(r=>r._multipleOpen&&!r._closesTradeId)?'rgba(255,209,102,0.1)':'rgba(0,229,160,0.1)',
                                color:tlParsed.some(r=>r._multipleOpen&&!r._closesTradeId)?'#ffd166':'#00e5a0',
                                fontWeight:700}}>
                              {(()=>{
                const needsChoice=tlParsed.some(r=>r._multipleOpen&&!r._closesTradeId)
                const valid=tlParsed.filter(r=>!r._isDuplicate).length
                return needsChoice?'⚠ Elige posición a cerrar':`✓ Importar ${valid} op${valid!==1?'s':''}`
              })()}
                            </button>
                          </div>
                        </div>
                        <table style={{width:'100%',borderCollapse:'collapse',fontFamily:MONO,fontSize:11}}>
                          <thead><tr style={{background:'var(--bg2)'}}>
                            {['Tipo','Símbolo','Fecha','Acc.','Precio','Div.','FX','Broker','Estado','Cap. €',''].map(h=>(
                              <th key={h} style={{padding:'5px 8px',textAlign:'left',fontSize:9,color:'#3d5a7a',letterSpacing:'0.08em',textTransform:'uppercase',borderBottom:'1px solid var(--border)'}}>{h}</th>
                            ))}
                          </tr></thead>
                          <tbody>
                            {tlParsed.map((t,i)=>{
                              const isDup=t._isDuplicate
                              const isClose=!!t._closesTradeId
                              const isGrouped=t._grouped
                              const ed=(field,val)=>setTlParsed(prev=>{
                                const next=[...prev]; next[i]={...next[i],[field]:val}; return next
                              })
                              const cell=(field,val,cls)=>(
                                <td style={{padding:'3px 5px'}}>
                                  <input value={val||''} onChange={e=>ed(field,e.target.value)}
                                    style={{background:'transparent',border:'none',borderBottom:'1px solid transparent',
                                      color:cls||'var(--text)',fontFamily:MONO,fontSize:11,width:'100%',
                                      padding:'1px 3px',outline:'none'}}
                                    onFocus={e=>e.target.style.borderBottomColor='var(--accent)'}
                                    onBlur={e=>e.target.style.borderBottomColor='transparent'}/>
                                </td>
                              )
                              return (
                              <tr key={i} style={{borderBottom:'1px solid var(--border)',
                                background:isDup?'rgba(255,77,109,0.06)':'transparent',
                                opacity:isDup?0.7:1}}>
                                <td style={{padding:'3px 5px',whiteSpace:'nowrap'}}>
                                  {isClose?(
                                    <span style={{fontFamily:MONO,fontSize:9,padding:'2px 5px',borderRadius:3,
                                      background: t._multipleOpen?'rgba(255,209,102,0.25)':t._isPartialClose?'rgba(255,209,102,0.2)':'rgba(155,114,255,0.2)',
                                      color: t._multipleOpen?'#ffd166':t._isPartialClose?'#ffd166':'#9b72ff',fontWeight:700}}>
                                      {t._multipleOpen?'⚠ MÚLTIPLES':t._isPartialClose?'↩ PARCIAL':'↩ CIERRE'}
                                    </span>
                                  ):isGrouped?(
                                    <span style={{fontFamily:MONO,fontSize:9,padding:'2px 5px',borderRadius:3,
                                      background:'rgba(0,212,255,0.15)',color:'#00d4ff',fontWeight:700}}>
                                      ↕ {t._buyCount}C+{t._sellCount}V
                                    </span>
                                  ):(
                                    <span style={{fontFamily:MONO,fontSize:9,padding:'2px 5px',borderRadius:3,
                                      background:t.fill_type==='buy'?'rgba(0,229,160,0.15)':'rgba(255,77,109,0.15)',
                                      color:t.fill_type==='buy'?'#00e5a0':'#ff4d6d',fontWeight:700}}>
                                      {t.fill_type==='buy'?'▲ BUY':'▼ SELL'}
                                    </span>
                                  )}
                                  {isDup&&<span style={{fontSize:8,color:'#ff4d6d',marginLeft:4,display:'block'}}>⚠ dup</span>}
                                </td>
                                {cell('symbol',t.symbol,'#c8dff5')}
                                <td style={{padding:'3px 5px'}}>
                                  <input value={t.entry_date||''} onChange={e=>ed('entry_date',e.target.value)}
                                    style={{background:'transparent',border:'none',borderBottom:'1px solid transparent',
                                      color:'#a8ccdf',fontFamily:MONO,fontSize:11,width:88,
                                      padding:'1px 3px',outline:'none'}}
                                    onFocus={e=>e.target.style.borderBottomColor='var(--accent)'}
                                    onBlur={e=>e.target.style.borderBottomColor='transparent'}/>
                                </td>
                                {cell('shares',t.shares)}
                                <td style={{padding:'3px 5px',whiteSpace:'nowrap'}}>
                                  <input value={t.entry_price||''} onChange={e=>ed('entry_price',e.target.value)}
                                    style={{background:'transparent',border:'none',borderBottom:'1px solid transparent',
                                      color:'var(--text)',fontFamily:MONO,fontSize:11,width:70,
                                      padding:'1px 3px',outline:'none'}}
                                    onFocus={e=>e.target.style.borderBottomColor='var(--accent)'}
                                    onBlur={e=>e.target.style.borderBottomColor='transparent'}/>
                                  {t.exit_price&&<span style={{fontSize:9,color:'#9b72ff',marginLeft:3}}>→{t.exit_price}</span>}
                                  {isClose&&!t._multipleOpen&&<div style={{fontSize:8,color:t._isPartialClose?'#ffd166':'#9b72ff'}}>
                                    {t._isPartialClose
                                      ? `cierra ${t._sellShares} de ${t._openShares} acc · resto ${t._remainingShares}`
                                      : `cierra ${t._closesSymbol} (${t._openShares} acc)`}
                                  </div>}
                                  {t._multipleOpen&&(
                                    <div style={{marginTop:3}}>
                                      <div style={{fontSize:8,color:'#ffd166',marginBottom:2}}>
                                        ⚠ {t._openOptions?.length} posiciones abiertas — elige cuál cerrar:
                                      </div>
                                      <select
                                        value={t._closesTradeId||''}
                                        onChange={e=>{
                                          const chosen = t._openOptions?.find(o=>o.id===e.target.value)
                                          if(!chosen) return
                                          const openShares=parseFloat(chosen.shares||0)
                                          const sellShares=parseFloat(t.shares||0)
                                          setTlParsed(prev=>{
                                            const next=[...prev]
                                            next[i]={...next[i],
                                              _closesTradeId:chosen.id,
                                              _openEntryDate:chosen.entry_date,
                                              _openShares:openShares,
                                              _sellShares:sellShares,
                                              _isPartialClose:sellShares<openShares-0.001,
                                              _isFullClose:Math.abs(sellShares-openShares)<0.001,
                                              _remainingShares:Math.max(0,openShares-sellShares)
                                            }
                                            return next
                                          })
                                        }}
                                        style={{fontFamily:MONO,fontSize:9,background:'#0d1824',
                                          border:'1px solid #ffd166',color:'#ffd166',
                                          borderRadius:3,padding:'2px 4px',cursor:'pointer',width:'100%'}}>
                                        {t._openOptions?.map(o=>(
                                          <option key={o.id} value={o.id}>
                                            {o.entry_date} · {o.shares} acc · ${o.entry_price}
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                  )}
                                </td>
                                {cell('entry_currency',t.entry_currency,'#ffd166')}
                                <td style={{padding:'3px 5px',color:'#4a7a95',fontSize:10}}>{(()=>{let fx=parseFloat(t.fx_entry);if(!fx||isNaN(fx))return'—';if(fx<1)fx=1/fx;return fx.toFixed(4)})()}</td>
                                {cell('broker',t.broker)}
                                <td style={{padding:'3px 5px'}}>
                                  <span style={{fontSize:9,padding:'1px 5px',borderRadius:3,
                                    background: t._isFullClose||t.status==='closed'?'rgba(0,229,160,0.1)':t._isPartialClose?'rgba(255,209,102,0.15)':'rgba(255,209,102,0.1)',
                                    color: t._isFullClose||t.status==='closed'?'#00e5a0':t._isPartialClose?'#ffd166':'#ffd166'}}>
                                    {t._isFullClose||t.status==='closed'?'✓ Cerrada':t._isPartialClose?'◑ Parcial':'○ Abierta'}
                                  </span>
                                </td>
                                <td style={{padding:'3px 5px',color:'#00d4ff'}}>{t.capital_eur?`€${Math.round(t.capital_eur)}`:'—'}</td>
                                <td style={{padding:'3px 5px'}}>
                                  <button onClick={()=>setTlParsed(prev=>prev.filter((_,j)=>j!==i))}
                                    title="Eliminar esta fila"
                                    style={{background:'transparent',border:'none',color:'#3d5a7a',cursor:'pointer',
                                      fontSize:12,padding:'0 4px',lineHeight:1}}
                                    onMouseOver={e=>e.currentTarget.style.color='#ff4d6d'}
                                    onMouseOut={e=>e.currentTarget.style.color='#3d5a7a'}>✕</button>
                                </td>
                              </tr>
                            )})}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {/* EXPORT */}
                {tlTab==='export'&&(
                  <div style={{flex:1,display:'flex',flexDirection:'column',padding:'20px',gap:16,overflowY:'auto'}}>
                    <div style={{fontFamily:MONO,fontSize:13,color:'#c8dff5',fontWeight:700}}>📤 Exportar operaciones</div>
                    <div style={{fontFamily:MONO,fontSize:11,color:'#5a8aaa'}}>
                      Descarga el historial completo en formato Excel/CSV.
                    </div>
                    {(()=>{
                      const exportCSV = () => {
                        const SEP = ','
                        const NL  = '\r\n'
                        const esc = function(v) {
                          var s = v == null ? '' : String(v)
                          return '"' + s.replace(/"/g, '""') + '"'
                        }
                        var headers = ['#','Simbolo','Nombre','Broker','Estado','Entrada','Salida','Acciones','Px Entrada','Capital inv EUR','Px Salida','Divisa','FX entrada','Comision EUR','PnL EUR','PnL pct','Dias','Estrategia','Notas']
                        var rows = tlTrades.map(function(t,i) {
                          var fx = parseFloat(t.fx_entry||1); if(fx<1) fx=1/fx
                          var cap = (parseFloat(t.shares||0)*parseFloat(t.entry_price||0)/fx).toFixed(0)
                          var dias = t.entry_date&&t.exit_date ? Math.round((new Date(t.exit_date)-new Date(t.entry_date))/86400000) : ''
                          var comm = (parseFloat(t.commission_buy||0)+parseFloat(t.commission_sell||0)).toFixed(2)
                          var notes = (t.notes||'').split('\n').join(' ').split('\r').join('')
                          return [
                            i+1, t.symbol||'', t.name||'', t.broker||'', t.status||'',
                            t.entry_date||'', t.exit_date||'', t.shares||'',
                            t.entry_price!=null ? parseFloat(t.entry_price).toFixed(2) : '',
                            cap,
                            t.exit_price!=null ? parseFloat(t.exit_price).toFixed(2) : '',
                            t.entry_currency||'', fx.toFixed(4), comm,
                            t.pnl_eur!=null ? parseFloat(t.pnl_eur).toFixed(2) : '',
                            t.pnl_pct!=null ? parseFloat(t.pnl_pct).toFixed(2)+'%' : '',
                            dias, t.strategy||'', notes
                          ]
                        })
                        var allRows = [headers].concat(rows)
                        var csv = allRows.map(function(r){ return r.map(esc).join(SEP) }).join(NL)
                        var blob = new Blob(['\uFEFF'+csv], {type:'text/csv;charset=utf-8'})
                        var url = URL.createObjectURL(blob)
                        var a = document.createElement('a')
                        a.href = url
                        a.download = 'tradelog_'+new Date().toISOString().slice(0,10)+'.csv'
                        a.click()
                        URL.revokeObjectURL(url)
                      }
                                            const exportJSON = () => {
                        const blob = new Blob([JSON.stringify(tlTrades,null,2)],{type:'application/json'})
                        const url = URL.createObjectURL(blob)
                        const a = document.createElement('a')
                        a.href=url; a.download='tradelog_'+new Date().toISOString().slice(0,10)+'.json'
                        a.click(); URL.revokeObjectURL(url)
                      }
                      return (
                        <div style={{display:'flex',flexDirection:'column',gap:12,maxWidth:360}}>
                          <div style={{padding:'14px',background:'var(--bg2)',borderRadius:6,border:'1px solid var(--border)'}}>
                            <div style={{fontFamily:MONO,fontSize:11,color:'#c8dff5',fontWeight:700,marginBottom:4}}>📊 CSV / Excel</div>
                            <div style={{fontFamily:MONO,fontSize:10,color:'#5a8aaa',marginBottom:10}}>
                              Compatible con Excel, Google Sheets y Numbers. Incluye todas las columnas del historial.
                            </div>
                            <button onClick={exportCSV}
                              style={{fontFamily:MONO,fontSize:11,padding:'7px 16px',borderRadius:4,cursor:'pointer',
                                background:'rgba(0,229,160,0.12)',border:'1px solid #00e5a0',color:'#00e5a0',fontWeight:700}}>
                              ⬇ Descargar CSV ({tlTrades.length} ops)
                            </button>
                          </div>
                          <div style={{padding:'14px',background:'var(--bg2)',borderRadius:6,border:'1px solid var(--border)'}}>
                            <div style={{fontFamily:MONO,fontSize:11,color:'#c8dff5',fontWeight:700,marginBottom:4}}>🗂 JSON (backup)</div>
                            <div style={{fontFamily:MONO,fontSize:10,color:'#5a8aaa',marginBottom:10}}>
                              Exporta todos los campos incluyendo notas, fills e IDs. Útil como copia de seguridad manual.
                            </div>
                            <button onClick={exportJSON}
                              style={{fontFamily:MONO,fontSize:11,padding:'7px 16px',borderRadius:4,cursor:'pointer',
                                background:'rgba(0,212,255,0.08)',border:'1px solid #00d4ff',color:'#00d4ff',fontWeight:700}}>
                              ⬇ Descargar JSON ({tlTrades.length} ops)
                            </button>
                          </div>
                        </div>
                      )
                    })()}
                  </div>
                )}

                {/* DASHBOARD */}
                {tlTab==='dashboard'&&(
                  <div style={{flex:1,display:'flex',flexDirection:'column',gap:0,overflowY:'auto'}}>
                    {(()=>{
                      const filtered = tlFiltered
                      const closed = filtered.filter(t=>t.status==='closed'&&t.pnl_eur!=null&&t.entry_date)
                        .sort((a,b)=>(a.exit_date||a.entry_date).localeCompare(b.exit_date||b.entry_date))
                      const openTrades = filtered.filter(t=>t.status==='open'&&t.entry_date)
                      if(!closed.length&&!openTrades.length) return (
                        <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:MONO,fontSize:12,color:'#3d5a7a'}}>
                          Sin operaciones para mostrar el dashboard.
                        </div>
                      )
                      // commissions helper
                      const commOf=t=>parseFloat(t.commission_buy||0)+parseFloat(t.commission_sell||0)
                      const today = new Date().toISOString().split('T')[0]
                      // Build equity curve — closed P&L (net of commissions) + open floating
                      let cumPnl = 0
                      const equityCurve = closed.map(t=>{
                        // pnl_eur already net of commissions from backend; add comm safety if zero
                        cumPnl += parseFloat(t.pnl_eur||0)
                        return {date:t.exit_date||t.entry_date, value:cumPnl, trade:t}
                      })
                      // Float point = closed cum + live floating (net comm buy already deducted)
                      const floatPnl = openTrades.reduce((s,t)=>s+(t._pnl_float_eur||0),0)
                      if(floatPnl!==0 && equityCurve.length>0){
                        equityCurve.push({date:today,value:cumPnl+floatPnl,isFloat:true})
                      }
                      // Build invest chart data: timeline of capital invested vs cumulative profit
                      const events = []
                      closed.forEach(t=>{
                        const fxE = t.fx_entry>0?(t.fx_entry<1?1/t.fx_entry:t.fx_entry):1
                        const capitalEur = (parseFloat(t.shares||0)*parseFloat(t.entry_price||0))/fxE
                        const commIn = parseFloat(t.commission_buy||0)
                        events.push({date:t.entry_date, capDelta:+capitalEur+commIn, pnlDelta:-commIn})
                        events.push({date:t.exit_date||today, capDelta:-capitalEur, pnlDelta:parseFloat(t.pnl_eur||0)+commIn})
                      })
                      events.sort((a,b)=>a.date.localeCompare(b.date))
                      let runCap=0, runPnl=0
                      const investMap = {}
                      events.forEach(ev=>{
                        runCap += ev.capDelta; runPnl += ev.pnlDelta
                        investMap[ev.date]={capital:Math.max(0,runCap), profit:runPnl}
                      })
                      // Open trades: capital still deployed
                      openTrades.forEach(t=>{
                        const fxE = t.fx_entry>0?(t.fx_entry<1?1/t.fx_entry:t.fx_entry):1
                        const capitalEur = (parseFloat(t.shares||0)*parseFloat(t.entry_price||0))/fxE
                        const d = t.entry_date
                        if(!investMap[d]) investMap[d]={capital:0,profit:runPnl}
                        investMap[d].capital += capitalEur
                        investMap[d].profit += (t._pnl_float_eur||0)
                      })
                      const investData = Object.keys(investMap).sort().map(d=>({date:d,...investMap[d]}))
                      const wins = closed.filter(t=>(t.pnl_eur||0)>=0)
                      const losses = closed.filter(t=>(t.pnl_eur||0)<0)
                      const totalPnl = closed.reduce((s,t)=>s+(t.pnl_eur||0),0)+floatPnl
                      const avgWin = wins.length?wins.reduce((s,t)=>s+(t.pnl_eur||0),0)/wins.length:0
                      const avgLoss = losses.length?losses.reduce((s,t)=>s+Math.abs(t.pnl_eur||0),0)/losses.length:0
                      const factorBen = avgLoss>0?avgWin/avgLoss:0
                      const bestTrade = closed.length?closed.reduce((b,t)=>(t.pnl_eur||0)>(b.pnl_eur||0)?t:b, closed[0]):null
                      let peak=0, maxDD=0
                      equityCurve.forEach(p=>{if(p.value>peak)peak=p.value;const dd=peak-p.value;if(dd>maxDD)maxDD=dd})
                      return (
                        <div style={{display:'flex',flexDirection:'column',gap:0}}>
                          {/* Filtros activos badge */}
                          {(tlFilterStatus||tlFilterBroker||tlFilterYear||tlFilterMonth||tlFilterStrat||tlSearch)&&(
                            <div style={{padding:'4px 10px',background:'rgba(155,114,255,0.06)',borderBottom:'1px solid var(--border)',display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}}>
                              <span style={{fontFamily:MONO,fontSize:8,color:'#4a5a70',flexShrink:0}}>Filtros:</span>
                              {tlFilterStatus&&<span style={{fontFamily:MONO,fontSize:9,color:'#9b72ff',border:'1px solid rgba(155,114,255,0.3)',borderRadius:3,padding:'1px 5px'}}>Estado: {tlFilterStatus}</span>}
                              {tlFilterBroker&&<span style={{fontFamily:MONO,fontSize:9,color:'#9b72ff',border:'1px solid rgba(155,114,255,0.3)',borderRadius:3,padding:'1px 5px'}}>Broker: {tlFilterBroker}</span>}
                              {tlFilterYear&&<span style={{fontFamily:MONO,fontSize:9,color:'#9b72ff',border:'1px solid rgba(155,114,255,0.3)',borderRadius:3,padding:'1px 5px'}}>Año: {tlFilterYear}{tlFilterMonth?' · '+['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][parseInt(tlFilterMonth)-1]:''}</span>}
                              {tlFilterStrat&&<span style={{fontFamily:MONO,fontSize:9,color:'#00d4ff',border:'1px solid rgba(0,212,255,0.3)',borderRadius:3,padding:'1px 5px',maxWidth:100,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={tlFilterStrat}>{tlFilterStrat}</span>}
                              {tlSearch&&<span style={{fontFamily:MONO,fontSize:9,color:'#ffd166',border:'1px solid rgba(255,209,102,0.3)',borderRadius:3,padding:'1px 5px'}}>"{tlSearch}"</span>}
                              <button onClick={()=>{setTlFilterStatus('');setTlFilterBroker('');setTlFilterYear('');setTlFilterMonth('');setTlFilterStrat('');setTlSearch('')}}
                                style={{fontFamily:MONO,fontSize:8,padding:'1px 5px',borderRadius:3,cursor:'pointer',
                                  background:'rgba(255,77,109,0.08)',border:'1px solid rgba(255,77,109,0.3)',color:'#ff4d6d',marginLeft:'auto',flexShrink:0}}>
                                ✕ Limpiar todo
                              </button>
                            </div>
                          )}

                          {/* Equity curve — P&L acumulado */}
                          {equityCurve.length>1&&<TlEquityChart curve={equityCurve}/>}
                          {/* Capital Invertido vs Profit */}
                          {investData.length>1&&<TlInvestChart investData={investData}/>}
                          {/* Barras P&L por trade — cerradas + abiertas */}
                          {(closed.length>0||openTrades.length>0)&&(
                            <div style={{padding:'12px 16px 8px',borderTop:'1px solid var(--border)'}}>
                              <div style={{fontFamily:MONO,fontSize:9,color:'#3d5a7a',letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:8}}>P&L por operación</div>
                              <div style={{display:'flex',alignItems:'flex-end',gap:2,height:60}}>
                                {[...closed.map(t=>({...t,isOpen:false})),...openTrades.map(t=>({...t,pnl_eur:t._pnl_float_eur||0,isOpen:true}))].map((t,i)=>{
                                  const allPnls=[...closed.map(x=>Math.abs(x.pnl_eur||0)),...openTrades.map(x=>Math.abs(x._pnl_float_eur||0))]
                                  const mx=Math.max(...allPnls,1)
                                  const h=Math.max(3,Math.abs(t.pnl_eur||0)/mx*56)
                                  const isW=(t.pnl_eur||0)>=0
                                  const bar=t.isOpen?(isW?'rgba(0,229,160,0.5)':'rgba(255,77,109,0.45)'):(isW?'#00e5a0':'#ff4d6d')
                                  return <div key={i} title={t.symbol+' '+(isW?'+':'')+('€'+Math.round(t.pnl_eur||0))+(t.isOpen?' (abierta)':'')}
                                    style={{flex:1,height:h,background:bar,borderRadius:'2px 2px 0 0',minWidth:2,
                                      opacity:0.85,cursor:'default',border:t.isOpen?'1px solid '+(isW?'#00e5a0':'#ff4d6d'):'none'}}/>
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })()}
                  </div>
                )}


                </div>
                {/* COLUMNA DERECHA — métricas siempre + detalle trade */}
                <div style={{width:270,flexShrink:0,borderLeft:'1px solid var(--border)',background:'var(--bg2)',display:'flex',flexDirection:'column',overflow:'hidden'}}>
                  {/* ── MÉTRICAS SIEMPRE VISIBLES — incluye flotantes ── */}
                  {(()=>{
                    const all=tlFiltered
                    const closed=all.filter(t=>t.status==='closed')
                    const open=all.filter(t=>t.status==='open')
                    const today=new Date().toISOString().split('T')[0]
                    // P&L
                    const pnlReal=closed.reduce((s,t)=>s+(t.pnl_eur||0),0)
                    const pnlFloat=open.reduce((s,t)=>s+(t._pnl_float_eur||0),0)
                    const pnlTotal=pnlReal+pnlFloat
                    const commTotal=all.reduce((s,t)=>s+(parseFloat(t.commission_buy||0)+parseFloat(t.commission_sell||0)),0)
                    // Combinamos cerradas + abiertas con su P&L flotante para Win Rate, medias, días
                    const allWithPnl=[
                      ...closed.map(t=>({...t,_eff_pnl:t.pnl_eur||0,_eff_pct:parseFloat(t.pnl_pct||0),_eff_dias:t.entry_date&&t.exit_date?Math.round((new Date(t.exit_date)-new Date(t.entry_date))/86400000):0})),
                      ...open.map(t=>({...t,_eff_pnl:t._pnl_float_eur||0,_eff_pct:t._pnl_float_pct||0,_eff_dias:t.entry_date?Math.round((new Date(today)-new Date(t.entry_date))/86400000):0}))
                    ]
                    const wins=allWithPnl.filter(t=>t._eff_pnl>=0)
                    const losses=allWithPnl.filter(t=>t._eff_pnl<0)
                    const wr=allWithPnl.length?wins.length/allWithPnl.length*100:0
                    const avgWinPct=wins.length?wins.reduce((s,t)=>s+t._eff_pct,0)/wins.length:0
                    const avgLossPct=losses.length?losses.reduce((s,t)=>s+Math.abs(t._eff_pct),0)/losses.length:0
                    const avgWinEur=wins.length?wins.reduce((s,t)=>s+t._eff_pnl,0)/wins.length:0
                    const avgLossEur=losses.length?losses.reduce((s,t)=>s+Math.abs(t._eff_pnl),0)/losses.length:0
                    const factorBen=avgLossEur>0?(avgWinEur/avgLossEur):null
                    const bestT=allWithPnl.length?allWithPnl.reduce((b,t)=>t._eff_pnl>b._eff_pnl?t:b,allWithPnl[0]):null
                    const worstT=allWithPnl.length?allWithPnl.reduce((b,t)=>t._eff_pnl<b._eff_pnl?t:b,allWithPnl[0]):null
                    // Días: cerradas + abiertas en curso
                    const diasArr=allWithPnl.map(t=>t._eff_dias).filter(d=>d!=null&&d>=0)
                    const diasProm=diasArr.length?diasArr.reduce((s,d)=>s+d,0)/diasArr.length:null
                    const totalDias=diasArr.reduce((s,d)=>s+d,0)
                    // DD sobre P&L total (cerradas + flotante actual)
                    let peak=0,maxDD=0
                    closed.slice().sort((a,b)=>(a.exit_date||'').localeCompare(b.exit_date||'')).reduce((cum,t)=>{
                      const eq=cum+(t.pnl_eur||0); if(eq>peak)peak=eq; const dd=peak-eq; if(dd>maxDD)maxDD=dd; return eq
                    },0)
                    // CAGR — desde primera entrada (cualquier op.) hasta HOY, sobre P&L total
                    const firstDate=allWithPnl.length?allWithPnl.reduce((a,t)=>t.entry_date<a?t.entry_date:a,allWithPnl[0].entry_date):null
                    const aniosPeriodo=firstDate?Math.max((new Date(today)-new Date(firstDate))/86400000/365.25,0.01):null
                    const aniosInv=totalDias/365.25
                    const tiempoInvPct=aniosPeriodo?Math.round(totalDias/(aniosPeriodo*365.25)*100):null
                    // CAGR usa capital empleado actual como base
                    const capitalEmp=open.reduce((s,t)=>{
                      const fxE=t.fx_entry>0?(t.fx_entry<1?1/t.fx_entry:t.fx_entry):1
                      return s+(parseFloat(t.shares||0)*parseFloat(t.entry_price||0))/fxE
                    },0)
                    const capitalBase=capitalEmp>0?capitalEmp:10000
                    const cagrReal=aniosPeriodo&&pnlTotal!==0?
                      (Math.pow(Math.max((capitalBase+pnlTotal)/capitalBase,0.001),1/aniosPeriodo)-1)*100:null
                    const fmtEur=v=>v>=0?'+€'+Math.round(v):'-€'+Math.round(Math.abs(v))
                    // Max DD como % sobre capital base
                    const maxDDPct=maxDD>0&&capitalBase>0?(maxDD/capitalBase*100):0
                    // Mejor/Peor usa _eff_pnl (incluye flotante de abiertas)
                    const bestV=bestT?bestT._eff_pnl:null
                    const worstV=worstT?worstT._eff_pnl:null
                    const rows=[
                      {l:'Total Operaciones',
                       v:(open.length+' ab. / '+closed.length+' cerr.'),
                       c:'#ffd166',
                       tip:'Total posiciones registradas. Abiertas = en cartera ahora. Cerradas = ya liquidadas.'},
                      {l:'Capital Empleado',
                       v:capitalEmp>0?'€'+Math.round(capitalEmp).toLocaleString('es-ES'):'—',
                       c:'#00d4ff',
                       tip:'Suma del capital actual en posiciones abiertas (acciones × precio entrada ÷ FX). No incluye P&L flotante.'},
                      {l:'Tiempo Invertido ('+aniosInv.toFixed(2)+'a)',
                       v:tiempoInvPct!=null?tiempoInvPct+'%':'—',
                       c:'#ffd166',
                       tip:'Días totales con capital invertido ÷ días totales del periodo. Incluye días en curso de posiciones abiertas.'},
                      {l:'Ganadoras',
                       v:wins.length,
                       c:'#00e5a0',
                       tip:'Ops con P&L ≥ 0. Cerradas: P&L realizado. Abiertas: P&L flotante actual.'},
                      {l:'Perdedoras',
                       v:losses.length,
                       c:'#ff4d6d',
                       tip:'Ops con P&L < 0. Cerradas: P&L realizado. Abiertas: P&L flotante actual.'},
                      {l:'Win Rate',
                       v:allWithPnl.length?wr.toFixed(1)+'%':'—',
                       c:wr>=50?'#00e5a0':'#ff4d6d',
                       tip:'Ganadoras ÷ total ops × 100. Incluye cerradas (P&L real) y abiertas (flotante). Mejora al cerrar las abiertas en positivo.'},
                      {l:'Ganancia Media (%)',
                       v:avgWinPct>0?'+'+avgWinPct.toFixed(2)+'%':'—',
                       c:'#00e5a0',
                       tip:'Media del % de ganancia de todas las ops ganadoras. Cerradas: pnl_pct. Abiertas: % flotante actual sobre precio entrada.'},
                      {l:'Pérdida Media (%)',
                       v:avgLossPct>0?avgLossPct.toFixed(2)+'%':'—',
                       c:'#ff4d6d',
                       tip:'Media del % de pérdida (en valor absoluto) de todas las ops perdedoras. Incluye abiertas en negativo.'},
                      {l:'Días Promedio',
                       v:diasProm!=null?Math.round(diasProm)+' d':'—',
                       c:'#00d4ff',
                       tip:'Media de días por operación. Cerradas: días entre entrada y salida. Abiertas: días hasta hoy.'},
                      {l:'Total Días Invertido',
                       v:totalDias+' d',
                       c:'#00d4ff',
                       tip:'Suma de todos los días individuales invertidos. Si tienes 2 ops simultáneas de 5 días cada una, cuenta 10 días.'},
                      {l:'P&L realizado',
                       v:fmtEur(pnlReal),
                       c:pnlReal>=0?'#00e5a0':'#ff4d6d',
                       tip:'Suma del P&L neto de todas las operaciones cerradas (ya descontadas comisiones si están en pnl_eur).'},
                      {l:'P&L flotante',
                       v:fmtEur(pnlFloat),
                       c:pnlFloat>=0?'#00e5a0':'#ffd166',
                       tip:'P&L no realizado de las posiciones abiertas. Calculado como (precio actual − precio entrada) × acciones ÷ FX.'},
                      {l:'P&L total',
                       v:fmtEur(pnlTotal),
                       c:pnlTotal>=0?'#00e5a0':'#ff4d6d',
                       tip:'P&L realizado + P&L flotante. Representa el resultado global de toda la cartera en este momento.'},
                      {l:'Comisiones',
                       v:commTotal>0?'-€'+commTotal.toFixed(2):'—',
                       c:'#ff4d6d',
                       tip:'Suma de commission_buy + commission_sell de todas las operaciones. No están descontadas del P&L mostrado si usas pnl_eur bruto.'},
                      {l:'Factor Beneficio',
                       v:factorBen!=null?factorBen.toFixed(2):'—',
                       c:factorBen!=null&&factorBen>=1?'#00e5a0':'#ff4d6d',
                       tip:'Ganancia media € ganador ÷ pérdida media € perdedor. >1 = expectativa positiva. Incluye abiertas por su flotante actual.'},
                      {l:'CAGR ('+(aniosPeriodo?aniosPeriodo.toFixed(2):'—')+'a)',
                       v:cagrReal!=null?(cagrReal>=0?'+':'')+cagrReal.toFixed(2)+'%':'—',
                       c:cagrReal!=null&&cagrReal>=0?'#00e5a0':'#ff4d6d',
                       tip:'Tasa anual compuesta: ((Capital+P&LTotal)/Capital)^(1/años)−1. Periodo: primera entrada hasta hoy. Base: capital empleado actual (o 10.000€ si no hay abiertas).'},
                      {l:'Max Drawdown',
                       v:maxDD>0?('-€'+Math.round(maxDD)+' ('+maxDDPct.toFixed(1)+'%)'):'—',
                       c:'#ff4d6d',
                       tip:'Mayor caída desde un pico de P&L hasta el valle siguiente, calculado sobre las ops cerradas ordenadas por fecha de salida. El flotante no se incluye (es dinámico).'},
                      {l:'Mejor op.',
                       v:bestT?(bestT.symbol+' '+(bestV>=0?'+':'')+fmtEur(bestV)):'—',
                       c:'#00e5a0',
                       tip:'Operación con mayor P&L €. Incluye abiertas por su flotante actual. Si está abierta, el resultado puede cambiar.'},
                      {l:'Peor op.',
                       v:worstT?(worstT.symbol+' '+fmtEur(worstV)):'—',
                       c:'#ff4d6d',
                       tip:'Operación con peor P&L €. Incluye abiertas por su flotante actual. Si está abierta, el resultado puede cambiar.'},
                    ]
                    return(
                      <div className="tl-resumen" onContextMenu={e=>{e.stopPropagation();openCtx(e,'tl_resumen')}} style={{flex:tlSelected?'0 0 auto':1,overflowY:'auto',borderBottom:tlSelected?'1px solid var(--border)':'none'}}>
                        <div style={{padding:'6px 10px',borderBottom:'1px solid var(--border)',fontFamily:MONO,fontSize:8,color:'#3d5a7a',letterSpacing:'0.1em',textTransform:'uppercase',display:'flex',justifyContent:'space-between'}}>
                          <span>Resumen · {open.length}ab/{closed.length}cerr</span>
                          <span style={{color:'#1a3a5a'}}>{all.length} ops</span>
                        </div>
                        <table style={{width:'100%',borderCollapse:'collapse'}}>
                          <tbody>
                            {rows.map(({l,v,c,tip})=>(
                              <MetricRow key={l} label={l} value={v} color={c} tip={tip}/>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )
                  })()}
                  {/* ── DETALLE TRADE SELECCIONADO ── */}
                  {tlSelected&&(

                    <div style={{flex:1,overflowY:'auto'}}>

                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ══ MODAL BÚSQUEDA DE SÍMBOLO ══ */}
      {symSearchOpen&&(()=>{
        const q=symSearchQ.trim().toUpperCase()
        // 1. Watchlist exactos/parciales primero
        const wlMatches=watchlist.filter(w=>
          w.symbol.toUpperCase().includes(q)||(w.name||'').toUpperCase().includes(q)
        ).map(w=>({symbol:w.symbol,name:w.name||lookupName(w.symbol),src:'watchlist'}))
        // 2. SYM_NAMES que no estén ya
        const wlSyms=new Set(wlMatches.map(x=>x.symbol))
        const dictMatches=Object.entries(SYM_NAMES)
          .filter(([s,n])=>!wlSyms.has(s)&&(s.includes(q)||n.toUpperCase().includes(q)))
          .map(([s,n])=>({symbol:s,name:n,src:'dict'}))
        // 3. El propio texto como símbolo literal al final
        const allSyms=new Set([...wlMatches,...dictMatches].map(x=>x.symbol))
        const literal=q.length>=1&&!allSyms.has(q)?[{symbol:q,name:'Buscar símbolo directo',src:'literal'}]:[]
        const results=[...wlMatches,...dictMatches,...literal].slice(0,12)
        return(
          <div style={{position:'fixed',inset:0,zIndex:300,display:'flex',alignItems:'flex-start',justifyContent:'center',paddingTop:80}}
            onClick={()=>{setSymSearchOpen(false);setSymSearchQ('')}}>
            <div style={{background:'#0d1824',border:'1px solid #1e3a52',borderRadius:10,width:520,maxHeight:480,display:'flex',flexDirection:'column',boxShadow:'0 16px 60px rgba(0,0,0,0.85)',overflow:'hidden',fontFamily:MONO}}
              onClick={e=>e.stopPropagation()}>
              {/* Input */}
              <div style={{display:'flex',alignItems:'center',gap:8,padding:'12px 16px',borderBottom:'1px solid #1e3a52'}}>
                <span style={{fontSize:18,color:'#00d4ff'}}>🔍</span>
                <input ref={symSearchInputRef} type="text" value={symSearchQ}
                  onChange={e=>setSymSearchQ(e.target.value.toUpperCase())}
                  onKeyDown={e=>{
                    if(e.key==='Escape'){setSymSearchOpen(false);setSymSearchQ('')}
                    if(e.key==='Enter'&&results.length>0){
                      setSimbolo(results[0].symbol);setSymSearchOpen(false);setSymSearchQ('')
                    }
                  }}
                  placeholder="Escribe símbolo o nombre... ej: NVDA, Apple, BTC"
                  style={{flex:1,background:'transparent',border:'none',outline:'none',color:'#e2eaf5',fontFamily:MONO,fontSize:18,fontWeight:600,letterSpacing:'0.05em'}}
                />
                <button onClick={()=>{setSymSearchOpen(false);setSymSearchQ('')}}
                  style={{background:'transparent',border:'none',color:'#3d5a7a',fontSize:18,cursor:'pointer',lineHeight:1}}>✕</button>
              </div>
              {/* Resultados */}
              <div style={{overflowY:'auto',maxHeight:380}}>
                {results.length===0&&q.length>0&&(
                  <div style={{padding:'20px 16px',color:'#3d5a7a',fontSize:12,textAlign:'center'}}>Sin resultados para «{q}»</div>
                )}
                {results.map((r,i)=>(
                  <div key={r.symbol} onClick={()=>{setSimbolo(r.symbol);setSymSearchOpen(false);setSymSearchQ('')}}
                    style={{display:'flex',alignItems:'center',gap:12,padding:'10px 16px',cursor:'pointer',
                      background:i===0?'rgba(0,212,255,0.06)':'transparent',
                      borderBottom:'1px solid rgba(255,255,255,0.03)'}}
                    onMouseOver={e=>e.currentTarget.style.background='rgba(0,212,255,0.1)'}
                    onMouseOut={e=>e.currentTarget.style.background=i===0?'rgba(0,212,255,0.06)':'transparent'}>
                    <div style={{width:28,height:28,borderRadius:6,background:'rgba(0,212,255,0.1)',border:'1px solid rgba(0,212,255,0.25)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                      <span style={{fontSize:10,color:'#00d4ff',fontWeight:700}}>{r.symbol.replace('^','').slice(0,3)}</span>
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{color:'#e2eaf5',fontWeight:700,fontSize:14}}>{r.symbol}</div>
                      <div style={{color:'#7a9bc0',fontSize:11,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.name}</div>
                    </div>
                    {r.src==='watchlist'&&<span style={{fontSize:9,color:'#00d4ff',background:'rgba(0,212,255,0.1)',padding:'2px 6px',borderRadius:3}}>WL</span>}
                    {i===0&&<span style={{fontSize:9,color:'#3d5a7a'}}>↵</span>}
                  </div>
                ))}
                {q.length===0&&(
                  <div style={{padding:'12px 16px',color:'#3d5a7a',fontSize:11,textAlign:'center'}}>Escribe para buscar · Esc para cerrar</div>
                )}
              </div>
            </div>
          </div>
        )
      })()}

      {/* ══ MODAL ALARMA — fixed sobre gráfico ══ */}
      {editingAlarm!==null&&(()=>{
        // When a global condition is linked, auto-fill params display
        const linkedCond = conditions.find(c=>c.id===alarmForm.condition_id)
        const COND_LABELS = {
          ema_cross_up:'EMA rápida > EMA lenta ↑', ema_cross_down:'EMA rápida < EMA lenta ↓',
          price_above_ma:'Precio > Media móvil', price_below_ma:'Precio < Media móvil',
          price_above_ema:'Precio > EMA rápida', price_below_ema:'Precio < EMA rápida',
          rsi_above:'RSI por encima de nivel', rsi_below:'RSI por debajo de nivel',
          rsi_cross_up:'RSI cruza hacia arriba', rsi_cross_down:'RSI cruza hacia abajo',
          macd_cross_up:'MACD cruza señal ↑', macd_cross_down:'MACD cruza señal ↓',
        }
        // Render param inputs based on condition type
        const condType = linkedCond?.type || alarmForm.condition || 'ema_cross_up'
        const isEMAType = condType.startsWith('ema_cross') || condType.startsWith('price_above_ema') || condType.startsWith('price_below_ema')
        const isMAType  = condType.startsWith('price_above_ma') || condType.startsWith('price_below_ma')
        const isRSI     = condType.startsWith('rsi_')
        const isMACD    = condType.startsWith('macd_')

        return(
          <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.72)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center'}} onClick={e=>{if(e.target===e.currentTarget)closeEditAlarm()}}>
            <div style={{background:'#0d1824',border:'1px solid #1e3a52',borderRadius:8,padding:24,width:400,maxHeight:'88vh',overflowY:'auto',display:'flex',flexDirection:'column',gap:14,fontFamily:MONO,fontSize:13,boxShadow:'0 8px 48px rgba(0,0,0,0.8)'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <span style={{fontWeight:700,color:'var(--text)',fontSize:15}}>{editingAlarm.id?'Editar alarma':'Nueva alarma'}</span>
                <button onClick={closeEditAlarm} style={{background:'transparent',border:'none',color:'var(--text3)',fontSize:18,cursor:'pointer'}}>✕</button>
              </div>

              {/* Símbolo activo — solo lectura, muestra qué símbolo tendrá la alerta */}
              <div style={{display:'flex',alignItems:'center',gap:8,padding:'8px 12px',background:'rgba(0,212,255,0.06)',border:'1px solid rgba(0,212,255,0.2)',borderRadius:5}}>
                <span style={{fontFamily:MONO,fontSize:11,color:'#5a7a95'}}>Símbolo:</span>
                <span style={{fontFamily:MONO,fontSize:15,color:'var(--accent)',fontWeight:700}}>{alarmForm.symbol||simbolo}</span>
                <span style={{fontFamily:MONO,fontSize:9,color:'#3d5a7a',marginLeft:'auto'}}>activo en el gráfico</span>
              </div>

              {/* Tipo de alerta */}
              <div style={{display:'flex',gap:6}}>
                {[['condition','📡 Condición técnica'],['price_level','🎯 Precio']].map(([v,l])=>(
                  <button key={v} onClick={()=>setAlarmForm(p=>({...p,condition:v==='price_level'?'price_level':(p.condition==='price_level'?'ema_cross_up':p.condition)}))}
                    style={{flex:1,padding:'7px 6px',fontFamily:MONO,fontSize:10,borderRadius:4,cursor:'pointer',fontWeight:600,
                      background:(v==='price_level'?alarmForm.condition==='price_level':alarmForm.condition!=='price_level')?'rgba(0,212,255,0.12)':'transparent',
                      border:`1px solid ${(v==='price_level'?alarmForm.condition==='price_level':alarmForm.condition!=='price_level')?'var(--accent)':'var(--border)'}`,
                      color:(v==='price_level'?alarmForm.condition==='price_level':alarmForm.condition!=='price_level')?'var(--accent)':'var(--text3)'}}>
                    {l}
                  </button>
                ))}
              </div>

              {/* Si es condición técnica: enlazar con librería (opcional) */}
              {alarmForm.condition!=='price_level'&&conditions.length>0&&(
                <label style={{display:'flex',flexDirection:'column',gap:4,color:'var(--text3)'}}>
                  <span style={{fontSize:10}}>De la librería <span style={{color:'#4a6a80'}}>(opcional)</span></span>
                  <select value={alarmForm.condition_id||''} onChange={e=>{
                      const cid=e.target.value||null
                      const cond=conditions.find(c=>c.id===cid)
                      setAlarmForm(p=>({...p,
                        condition_id:cid,
                        condition: cond?.type || p.condition || 'ema_cross_up',
                        ema_r: cond?.params?.ma_fast || cond?.params?.ma_period || p.ema_r || 10,
                        ema_l: cond?.params?.ma_slow || p.ema_l || 11,
                        params: cond?.params || p.params || {},
                        name: p.name || cond?.name || '',
                      }))
                    }}
                    style={{background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:12,padding:'7px 10px',borderRadius:4}}>
                    <option value="">— Definir manualmente —</option>
                    {conditions.map(c=>(
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  {linkedCond&&<div style={{fontSize:10,color:'#00d4ff',marginTop:2}}>✓ {linkedCond.description||linkedCond.name}</div>}
                </label>
              )}



              {/* Alerta de precio: solo dirección + nivel (símbolo ya está arriba) */}
              {alarmForm.condition==='price_level'&&(
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                  <label style={{display:'flex',flexDirection:'column',gap:4,color:'var(--text3)'}}>
                    <span style={{fontSize:10}}>Dirección</span>
                    <select value={alarmForm.condition_detail||'price_above'} onChange={e=>setAlarmForm(p=>({...p,condition_detail:e.target.value}))}
                      style={{background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:11,padding:'7px 8px',borderRadius:4}}>
                      <option value="price_above">▲ Sube hasta</option>
                      <option value="price_below">▼ Baja hasta</option>
                    </select>
                  </label>
                  <label style={{display:'flex',flexDirection:'column',gap:4,color:'var(--text3)'}}>
                    <span style={{fontSize:10}}>Precio objetivo</span>
                    <input type="number" value={alarmForm.price_level||''} step="0.01" placeholder="0.00"
                      onChange={e=>setAlarmForm(p=>({...p,price_level:Number(e.target.value)}))}
                      style={{background:'var(--bg3)',border:'1px solid rgba(255,209,102,0.4)',color:'#ffd166',fontFamily:MONO,fontSize:14,padding:'7px 10px',borderRadius:4,fontWeight:700}}/>
                  </label>
                </div>
              )}

              {/* Tipo de condición técnica (cuando no es precio y no hay condición de librería vinculada) */}
              {alarmForm.condition!=='price_level'&&!linkedCond&&(
                <label style={{display:'flex',flexDirection:'column',gap:4,color:'var(--text3)'}}>
                  <span style={{fontSize:10}}>Tipo de condición</span>
                  <select value={alarmForm.condition||'ema_cross_up'} onChange={e=>setAlarmForm(p=>({...p,condition:e.target.value,params:{}}))}
                    style={{background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:12,padding:'7px 10px',borderRadius:4}}>
                    <optgroup label="EMA">
                      <option value="ema_cross_up">↑ Cruce alcista EMA</option>
                      <option value="ema_cross_down">↓ Cruce bajista EMA</option>
                      <option value="price_above_ema">Precio &gt; EMA</option>
                      <option value="price_below_ema">Precio &lt; EMA</option>
                    </optgroup>
                    <optgroup label="RSI">
                      <option value="rsi_cross_up">RSI cruza ↑ nivel</option>
                      <option value="rsi_cross_down">RSI cruza ↓ nivel</option>
                      <option value="rsi_above">RSI sobre nivel</option>
                      <option value="rsi_below">RSI bajo nivel</option>
                    </optgroup>
                    <optgroup label="MACD">
                      <option value="macd_cross_up">MACD cruza señal ↑</option>
                      <option value="macd_cross_down">MACD cruza señal ↓</option>
                    </optgroup>
                    <optgroup label="Media móvil">
                      <option value="price_above_ma">Precio &gt; Media móvil</option>
                      <option value="price_below_ma">Precio &lt; Media móvil</option>
                    </optgroup>
                  </select>
                </label>
              )}

              {/* Parámetros según tipo */}
              {(isEMAType)&&(
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                  <label style={{display:'flex',flexDirection:'column',gap:4,color:'var(--text3)'}}>EMA Rápida
                    <input type="number" value={alarmForm.ema_r||10} min={1} disabled={!!linkedCond}
                      onChange={e=>setAlarmForm(p=>({...p,ema_r:Number(e.target.value)}))}
                      style={{background:'var(--bg3)',border:'1px solid rgba(255,209,102,0.4)',color:'#ffd166',fontFamily:MONO,fontSize:15,padding:'7px 10px',borderRadius:4,fontWeight:700,textAlign:'center',opacity:linkedCond?0.5:1}}/>
                  </label>
                  <label style={{display:'flex',flexDirection:'column',gap:4,color:'var(--text3)'}}>EMA Lenta
                    <input type="number" value={alarmForm.ema_l||11} min={1} disabled={!!linkedCond}
                      onChange={e=>setAlarmForm(p=>({...p,ema_l:Number(e.target.value)}))}
                      style={{background:'var(--bg3)',border:'1px solid rgba(255,77,109,0.4)',color:'#ff4d6d',fontFamily:MONO,fontSize:15,padding:'7px 10px',borderRadius:4,fontWeight:700,textAlign:'center',opacity:linkedCond?0.5:1}}/>
                  </label>
                </div>
              )}
              {isMAType&&(
                <label style={{display:'flex',flexDirection:'column',gap:4,color:'var(--text3)'}}>Período de la media
                  <input type="number" value={alarmForm.params?.ma_period||alarmForm.ema_r||50} min={1} disabled={!!linkedCond}
                    onChange={e=>setAlarmForm(p=>({...p,params:{...p.params,ma_period:Number(e.target.value)}}))}
                    style={{background:'var(--bg3)',border:'1px solid var(--border)',color:'#ffd166',fontFamily:MONO,fontSize:15,padding:'7px 10px',borderRadius:4,fontWeight:700,opacity:linkedCond?0.5:1}}/>
                </label>
              )}
              {isRSI&&(
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                  <label style={{display:'flex',flexDirection:'column',gap:4,color:'var(--text3)'}}>Período RSI
                    <input type="number" value={alarmForm.params?.period||14} min={2} max={50} disabled={!!linkedCond}
                      onChange={e=>setAlarmForm(p=>({...p,params:{...p.params,period:Number(e.target.value)}}))}
                      style={{background:'var(--bg3)',border:'1px solid var(--border)',color:'#ffd166',fontFamily:MONO,fontSize:15,padding:'7px 10px',borderRadius:4,fontWeight:700,opacity:linkedCond?0.5:1}}/>
                  </label>
                  <label style={{display:'flex',flexDirection:'column',gap:4,color:'var(--text3)'}}>Nivel
                    <input type="number" value={alarmForm.params?.level||30} min={1} max={99} disabled={!!linkedCond}
                      onChange={e=>setAlarmForm(p=>({...p,params:{...p.params,level:Number(e.target.value)}}))}
                      style={{background:'var(--bg3)',border:'1px solid var(--border)',color:'#00d4ff',fontFamily:MONO,fontSize:15,padding:'7px 10px',borderRadius:4,fontWeight:700,opacity:linkedCond?0.5:1}}/>
                  </label>
                </div>
              )}
              {isMACD&&(
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8}}>
                  {[['fast','Rápida',12],['slow','Lenta',26],['signal','Señal',9]].map(([k,l,d])=>(
                    <label key={k} style={{display:'flex',flexDirection:'column',gap:4,color:'var(--text3)'}}>{l}
                      <input type="number" value={alarmForm.params?.[k]||d} min={1} disabled={!!linkedCond}
                        onChange={e=>setAlarmForm(p=>({...p,params:{...p.params,[k]:Number(e.target.value)}}))}
                        style={{background:'var(--bg3)',border:'1px solid var(--border)',color:'#ffd166',fontFamily:MONO,fontSize:14,padding:'7px 6px',borderRadius:4,fontWeight:700,opacity:linkedCond?0.5:1,textAlign:'center'}}/>
                    </label>
                  ))}
                </div>
              )}

              <div style={{display:'flex',gap:8,paddingTop:4,borderTop:'1px solid var(--border)'}}>
                <button onClick={saveAlarm} disabled={alarmSaving}
                  style={{flex:1,background:'rgba(0,212,255,0.15)',border:'1px solid var(--accent)',color:'var(--accent)',fontFamily:MONO,fontSize:13,padding:'10px',borderRadius:5,cursor:'pointer',fontWeight:600}}>
                  {alarmSaving?'Guardando…':'Guardar alarma'}
                </button>
                {editingAlarm.id&&(
                  <button onClick={()=>removeAlarm(editingAlarm.id)}
                    style={{background:'rgba(255,77,109,0.12)',border:'1px solid #ff4d6d',color:'#ff4d6d',fontFamily:MONO,fontSize:11,padding:'10px 14px',borderRadius:5,cursor:'pointer'}}>
                    🗑
                  </button>
                )}
              </div>
            </div>
          </div>
        )
      })()}

      {/* StrategyEditorPanel is rendered in the content area (see above) */}
    {/* ── Modal de configuración global ── */}
    {settingsOpen&&<SettingsModal onClose={()=>{setSettingsOpen(false);setTemaKey(k=>k+1)}} strategies={strategies} initialTab={settingsInitTab}/>}

    {/* ── Panel Asistente IA de estrategias ── */}
    {aiPanelOpen&&<StrategyAIPanel
      definition={definition}
      onApply={(defn, name)=>{setDefinition(defn);if(name)setStratName(name);setAiPanelOpen(false)}}
      onClose={()=>setAiPanelOpen(false)}
    />}

    {/* ── Modal de alarma de precio (doble-clic en gráfico) ── */}
    {priceAlarmDlg&&(
      <div style={{position:'fixed',inset:0,zIndex:999,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,0.6)'}}
        onClick={()=>setPriceAlarmDlg(null)}>
        <div onClick={e=>e.stopPropagation()} style={{background:'#0d1520',border:'1px solid var(--border)',borderRadius:8,padding:'20px 24px',fontFamily:MONO,color:'var(--text)',minWidth:280,boxShadow:'0 8px 40px rgba(0,0,0,0.6)'}}>
          <div style={{fontSize:13,fontWeight:700,marginBottom:14,color:'var(--accent)'}}>Nueva Alarma de Precio</div>
          <div style={{fontSize:11,color:'var(--text3)',marginBottom:6}}>{priceAlarmDlg.symbol}</div>
          <PriceAlarmQuickForm
            price={priceAlarmDlg.price} symbol={priceAlarmDlg.symbol}
            alarms={alarms}
            onSave={async(item)=>{
              try{
                await upsertAlarm(item)
                reloadAlarms()
              }catch(e){alert('Error al guardar alarma: '+e.message)}
              setPriceAlarmDlg(null)
            }}
            onCancel={()=>setPriceAlarmDlg(null)}
          />
        </div>
      </div>
    )}
      {/* Alarm popup removed — use alarms panel instead */}

      {/* ══ MODAL NUEVA OPERACIÓN ══ */}
      {tlFormOpen&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',zIndex:300,display:'flex',alignItems:'center',justifyContent:'center'}}
          onClick={e=>{if(e.target===e.currentTarget)setTlFormOpen(false)}}>
          <div className="tl-modal" onContextMenu={e=>openCtx(e,'modals')} style={{background:'#0d1824',border:'1px solid #1e3a52',borderRadius:8,padding:24,width:560,maxHeight:'90vh',overflowY:'auto',
            display:'flex',flexDirection:'column',gap:14,fontFamily:MONO,fontSize:13,boxShadow:'0 8px 48px rgba(0,0,0,0.8)'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <span style={{fontWeight:700,color:'#c8dff5',fontSize:14}}>{tlForm.id?'Editar operación':'Nueva operación'}</span>
              <span onClick={()=>setTlFormOpen(false)} style={{cursor:'pointer',color:'#4a7a95',fontSize:20,lineHeight:1}}>×</span>
            </div>
            {/* Fila 1: símbolo + nombre + tipo */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10}}>
              {/* Símbolo — con buscador autocomplete */}
              <label style={{display:'flex',flexDirection:'column',gap:4,position:'relative'}}>
                <span style={{fontSize:10,color:'#5a8aaa'}}>Símbolo *</span>
                <input type="text" placeholder="AAPL, MSFT, BTC..." value={tlForm.symbol}
                  autoComplete="off"
                  onChange={e=>{
                    const v=e.target.value.toUpperCase()
                    setTlForm(f=>({...f,symbol:v,_symSearch:v}))
                  }}
                  onBlur={()=>setTimeout(()=>setTlForm(f=>({...f,_symSearch:''})),180)}
                  style={{background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:11,padding:'5px 7px',borderRadius:4}}/>
                {/* Dropdown sugerencias */}
                {tlForm._symSearch&&tlForm._symSearch.length>=1&&(()=>{
                  const q=tlForm._symSearch
                  const wlHits=watchlist.filter(w=>w.symbol.includes(q)||(w.name||'').toUpperCase().includes(q)).slice(0,4)
                  const wlSyms=new Set(wlHits.map(w=>w.symbol))
                  const dictHits=Object.entries(SYM_NAMES).filter(([s,n])=>!wlSyms.has(s)&&(s.includes(q)||n.toUpperCase().includes(q))).slice(0,5)
                  const all=[...wlHits.map(w=>({symbol:w.symbol,name:w.name})),...dictHits.map(([s,n])=>({symbol:s,name:n}))]
                  if(!all.length) return null
                  const assetTypeFor=(sym)=>{
                    if(sym.includes('-USD')||sym.includes('BTC')||sym.includes('ETH')) return 'crypto'
                    if(sym.startsWith('^')) return 'etf'
                    if(sym.includes('=F')) return 'future'
                    return 'stock'
                  }
                  return(
                    <div style={{position:'absolute',top:'100%',left:0,right:0,zIndex:200,
                      background:'#0d1824',border:'1px solid #1e3a52',borderRadius:4,
                      boxShadow:'0 8px 24px rgba(0,0,0,0.7)',maxHeight:200,overflowY:'auto',marginTop:2}}>
                      {all.map(hit=>(
                        <div key={hit.symbol} onMouseDown={e=>{
                          e.preventDefault()
                          const sym=hit.symbol, name=hit.name||''
                          const currency=sym.includes('-USD')||sym.startsWith('^')||sym.includes('=F')?'USD':'USD'
                          const atype=assetTypeFor(sym)
                          setTlForm(f=>({...f,symbol:sym,name,asset_type:atype,entry_currency:currency,_symSearch:'',entry_price:'',_fxLoading:false}))
                          // Fetch live price for the selected symbol
                          fetch('/api/datos',{method:'POST',headers:{'Content-Type':'application/json'},
                            body:JSON.stringify({simbolo:sym,cfg:{emaR:10,emaL:11,years:1,capitalIni:1000,tipoStop:'none',atrPeriod:14,atrMult:1,sinPerdidas:false,reentry:false,tipoFiltro:'none',sp500EmaR:10,sp500EmaL:11}})})
                            .then(r=>r.json())
                            .then(j=>{ if(j.meta?.ultimoPrecio) setTlForm(f=>({...f,entry_price:String(j.meta.ultimoPrecio.toFixed(2))})) })
                            .catch(()=>{})
                          // Also fetch FX for the currency
                          if(currency!=='EUR') tlFetchFx(currency, tlForm.entry_date)
                        }}
                        style={{padding:'6px 10px',cursor:'pointer',display:'flex',justifyContent:'space-between',
                          alignItems:'center',borderBottom:'1px solid rgba(255,255,255,0.04)',
                          fontFamily:MONO,fontSize:11}}
                        onMouseOver={e=>e.currentTarget.style.background='rgba(0,212,255,0.08)'}
                        onMouseOut={e=>e.currentTarget.style.background='transparent'}>
                          <span style={{color:'#00d4ff',fontWeight:600}}>{hit.symbol}</span>
                          <span style={{color:'#7a9bc0',fontSize:10}}>{hit.name}</span>
                        </div>
                      ))}
                    </div>
                  )
                })()}
              </label>
              {/* Nombre */}
              <label style={{display:'flex',flexDirection:'column',gap:4}}>
                <span style={{fontSize:10,color:'#5a8aaa'}}>Nombre</span>
                <input type="text" placeholder="Apple Inc." value={tlForm.name||''}
                  onChange={e=>setTlForm(f=>({...f,name:e.target.value}))}
                  style={{background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:11,padding:'5px 7px',borderRadius:4}}/>
              </label>
              {/* Tipo */}
              <label style={{display:'flex',flexDirection:'column',gap:4}}>
                <span style={{fontSize:10,color:'#5a8aaa'}}>Tipo</span>
                <select value={tlForm.asset_type} onChange={e=>setTlForm(f=>({...f,asset_type:e.target.value}))}
                  style={{background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:11,padding:'5px 7px',borderRadius:4}}>
                  <option value="stock">Acción</option><option value="etf">ETF</option>
                  <option value="crypto">Crypto</option><option value="future">Futuro</option>
                </select>
              </label>
            </div>
            {/* Fila 2: broker */}
            <label style={{display:'flex',flexDirection:'column',gap:4}}>
              <span style={{fontSize:10,color:'#5a8aaa'}}>Broker</span>
              <div style={{display:'flex',gap:6}}>
                {TL_BROKERS.map(b=>(
                  <button key={b} onClick={()=>setTlForm(f=>({...f,broker:b}))}
                    style={{fontFamily:MONO,fontSize:11,padding:'4px 10px',borderRadius:4,cursor:'pointer',
                      border:`1px solid ${tlForm.broker===b?(TL_COLORS[b]||'#9b72ff'):'#1a2d45'}`,
                      background:tlForm.broker===b?`${TL_COLORS[b]||'#9b72ff'}18`:'transparent',
                      color:tlForm.broker===b?(TL_COLORS[b]||'#9b72ff'):'#7a9bc0'}}>
                    {TL_LABEL[b]}
                  </button>
                ))}
              </div>
            </label>
            {/* Fila 3: fecha, precio, acciones */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10}}>
              {/* Fecha — dd/mm/yyyy custom */}
              <label style={{display:'flex',flexDirection:'column',gap:4}}>
                <span style={{fontSize:10,color:'#5a8aaa'}}>Fecha entrada *</span>
                <input type="text" placeholder="dd/mm/yyyy"
                  value={tlForm.entry_date}
                  onChange={e=>{
                    let v=e.target.value.replace(/[^0-9/]/g,'')
                    if(v.length===2&&!v.includes('/')) v=v+'/'
                    if(v.length===5&&v.split('/').length===2) v=v+'/'
                    if(v.length>10) v=v.slice(0,10)
                    setTlForm(f=>({...f,entry_date:v}))
                    // Auto-fetch FX cuando la fecha está completa
                    if(v.length===10&&tlForm.entry_currency&&tlForm.entry_currency!=='EUR'&&!tlForm.fx_entry_manual)
                      tlFetchFx(tlForm.entry_currency, v)
                  }}
                  style={{background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:11,padding:'5px 7px',borderRadius:4}}/>
              </label>
              {/* Precio entrada */}
              <label style={{display:'flex',flexDirection:'column',gap:4}}>
                <span style={{fontSize:10,color:'#5a8aaa'}}>Precio entrada *</span>
                <input type="number" placeholder="0.00" value={tlForm.entry_price}
                  onChange={e=>setTlForm(f=>({...f,entry_price:e.target.value}))}
                  style={{background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:11,padding:'5px 7px',borderRadius:4}}/>
              </label>
              {/* Nº acciones */}
              <label style={{display:'flex',flexDirection:'column',gap:4}}>
                <span style={{fontSize:10,color:'#5a8aaa'}}>Nº acciones *</span>
                <input type="number" placeholder="0" value={tlForm.shares}
                  onChange={e=>setTlForm(f=>({...f,shares:e.target.value}))}
                  style={{background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:11,padding:'5px 7px',borderRadius:4}}/>
              </label>
            </div>
            {/* Fila 4: divisa, comisión, FX */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10}}>
              <label style={{display:'flex',flexDirection:'column',gap:4}}>
                <span style={{fontSize:10,color:'#5a8aaa'}}>Divisa</span>
                <select value={tlForm.entry_currency} onChange={e=>{
                    const cur=e.target.value
                    if(cur==='EUR'){setTlForm(f=>({...f,entry_currency:cur,fx_entry:'1',fx_entry_manual:false}));return}
                    setTlForm(f=>({...f,entry_currency:cur,fx_entry:'',fx_entry_manual:false}))
                    tlFetchFx(cur, tlForm.entry_date)
                  }}
                  style={{background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:11,padding:'5px 7px',borderRadius:4}}>
                  <option>USD</option><option>EUR</option><option>GBP</option><option>CHF</option><option>JPY</option>
                </select>
              </label>
              <label style={{display:'flex',flexDirection:'column',gap:4}}>
                <span style={{fontSize:10,color:'#5a8aaa'}}>Comisión compra (€)</span>
                <input type="number" min="0" step="0.01" value={tlForm.commission_buy} onChange={e=>setTlForm(f=>({...f,commission_buy:e.target.value}))}
                  style={{background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:11,padding:'5px 7px',borderRadius:4}}/>
              </label>
              <label style={{display:'flex',flexDirection:'column',gap:4}}>
                <span style={{fontSize:10,color:'#5a8aaa'}}>FX manual <span style={{color:'#3d5a7a'}}>(opt.)</span></span>
                <div style={{display:'flex',gap:4,alignItems:'center'}}>
                  <input type="number" step="0.0001" placeholder={tlForm._fxLoading?'Cargando…':'auto'} value={tlForm.fx_entry} onChange={e=>setTlForm(f=>({...f,fx_entry:e.target.value,fx_entry_manual:true}))}
                    style={{flex:1,background:'var(--bg3)',border:`1px solid ${tlForm.fx_entry_manual?'#ffd166':tlForm.fx_entry?'#00e5a0':'var(--border)'}`,color:tlForm._fxLoading?'#5a7a95':'var(--text)',fontFamily:MONO,fontSize:11,padding:'5px 7px',borderRadius:4}}/>
                  {tlForm.fx_entry_manual&&<span onClick={()=>setTlForm(f=>({...f,fx_entry:'',fx_entry_manual:false}))} title="Usar automático" style={{cursor:'pointer',color:'#ffd166',fontSize:14}}>↺</span>}
                </div>
              </label>
            </div>
            {/* Notas + estrategia */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
              <label style={{display:'flex',flexDirection:'column',gap:4}}>
                <span style={{fontSize:10,color:'#5a8aaa'}}>Estrategia</span>
                <select value={tlForm.strategy||''} onChange={e=>setTlForm(f=>({...f,strategy:e.target.value}))}
                  style={{background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:11,padding:'5px 7px',borderRadius:4}}>
                  {strategies.map(st=>{const n=st.name||`V50 EMA ${st.ema_r}/${st.ema_l}`;return <option key={st.id} value={n}>{n}</option>})}
                  {strategies.length===0&&<option value="V50">V50</option>}
                  <option value="">— Sin estrategia —</option>
                </select>
              </label>
              <label style={{display:'flex',flexDirection:'column',gap:4}}>
                <span style={{fontSize:10,color:'#5a8aaa'}}>Notas</span>
                <input type="text" placeholder="Soporte en $215..." value={tlForm.notes||''} onChange={e=>setTlForm(f=>({...f,notes:e.target.value}))}
                  style={{background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:11,padding:'5px 7px',borderRadius:4}}/>
              </label>
            </div>
            {/* ── FILLS PARCIALES ── */}
            <div style={{borderTop:'1px solid var(--border)',paddingTop:10}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
                <span style={{fontFamily:MONO,fontSize:10,color:'#5a8aaa',fontWeight:600}}>Fills de entrada</span>
                <button onClick={()=>setTlFillsList(f=>[...f,{date:todayDisplay(),price:'',shares:''}])}
                  style={{fontFamily:MONO,fontSize:10,padding:'3px 8px',borderRadius:3,cursor:'pointer',
                    border:'1px solid #2a4060',background:'rgba(0,212,255,0.06)',color:'#00d4ff'}}>
                  + Añadir fill entrada
                </button>
              </div>
              {tlFillsList.length>0&&(
                <div style={{display:'flex',flexDirection:'column',gap:4}}>
                  {tlFillsList.map((f,fi)=>{
                    const updF=(patch)=>{const nf=[...tlFillsList];nf[fi]={...nf[fi],...patch};setTlFillsList(nf)}
                    return(
                    <div key={fi} style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr auto',gap:6,alignItems:'center'}}>
                      <input type="text" placeholder="dd/mm/yyyy" value={f.date}
                        onChange={e=>updF({date:e.target.value})}
                        style={{background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:10,padding:'4px 6px',borderRadius:3}}/>
                      <input type="number" placeholder="Precio" value={f.price}
                        onChange={e=>updF({price:e.target.value})}
                        style={{background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:10,padding:'4px 6px',borderRadius:3}}/>
                      <input type="number" placeholder="Acciones" value={f.shares}
                        onChange={e=>updF({shares:e.target.value})}
                        style={{background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:10,padding:'4px 6px',borderRadius:3}}/>
                      <span onClick={()=>setTlFillsList(tlFillsList.filter((_,i)=>i!==fi))}
                        style={{cursor:'pointer',color:'#ff4d6d',fontSize:14,lineHeight:1,padding:'0 2px'}}>×</span>
                    </div>
                    )
                  })}
                  {(()=>{
                    const tot=tlFillsList.filter(x=>x.shares&&x.price).reduce((s,x)=>({sh:s.sh+parseFloat(x.shares||0),val:s.val+parseFloat(x.shares||0)*parseFloat(x.price||0)}),{sh:0,val:0})
                    if(!tot.sh) return null
                    return(
                      <div style={{fontFamily:MONO,fontSize:9,color:'#3d5a7a',paddingTop:2}}>
                        Precio medio entrada → <span style={{color:'#ffd166'}}>{(tot.val/tot.sh).toFixed(4)}</span>
                        &nbsp;· Acciones totales → <span style={{color:'#ffd166'}}>{tot.sh}</span>
                      </div>
                    )
                  })()}
                </div>
              )}
            </div>
            {tlForm.id&&(
              <div style={{borderTop:'1px solid var(--border)',paddingTop:10}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
                  <span style={{fontFamily:MONO,fontSize:10,color:'#ff9a6c',fontWeight:600}}>Fills de salida</span>
                  <button onClick={()=>setTlExitFillsList(f=>[...f,{date:todayDisplay(),price:'',shares:''}])}
                    style={{fontFamily:MONO,fontSize:10,padding:'3px 8px',borderRadius:3,cursor:'pointer',
                      border:'1px solid #2a4060',background:'rgba(255,77,109,0.06)',color:'#ff9a6c'}}>
                    + Añadir fill salida
                  </button>
                </div>
                {tlExitFillsList.length>0&&(
                  <div style={{display:'flex',flexDirection:'column',gap:4}}>
                    {tlExitFillsList.map((f,fi)=>{
                      const updEF=(patch)=>{const nf=[...tlExitFillsList];nf[fi]={...nf[fi],...patch};setTlExitFillsList(nf)}
                      return(
                      <div key={fi} style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr auto',gap:6,alignItems:'center'}}>
                        <input type="text" placeholder="dd/mm/yyyy" value={f.date}
                          onChange={e=>updEF({date:e.target.value})}
                          style={{background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:10,padding:'4px 6px',borderRadius:3}}/>
                        <input type="number" placeholder="Precio salida" value={f.price}
                          onChange={e=>updEF({price:e.target.value})}
                          style={{background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:10,padding:'4px 6px',borderRadius:3}}/>
                        <input type="number" placeholder="Acciones" value={f.shares}
                          onChange={e=>updEF({shares:e.target.value})}
                          style={{background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:10,padding:'4px 6px',borderRadius:3}}/>
                        <span onClick={()=>setTlExitFillsList(tlExitFillsList.filter((_,i)=>i!==fi))}
                          style={{cursor:'pointer',color:'#ff4d6d',fontSize:14,lineHeight:1,padding:'0 2px'}}>×</span>
                      </div>
                      )
                    })}
                    {(()=>{
                      const tot=tlExitFillsList.filter(x=>x.shares&&x.price).reduce((s,x)=>({sh:s.sh+parseFloat(x.shares||0),val:s.val+parseFloat(x.shares||0)*parseFloat(x.price||0)}),{sh:0,val:0})
                      if(!tot.sh) return null
                      return(
                        <div style={{fontFamily:MONO,fontSize:9,color:'#3d5a7a',paddingTop:2}}>
                          Precio medio salida → <span style={{color:'#ff9a6c'}}>{(tot.val/tot.sh).toFixed(4)}</span>
                          &nbsp;· Acciones totales → <span style={{color:'#ff9a6c'}}>{tot.sh}</span>
                        </div>
                      )
                    })()}
                  </div>
                )}
              </div>
            )}
            {/* ── CERRAR OPERACIÓN (inline, solo si abierta y editando) ── */}
            {tlForm.id&&tlSelected?.status==='open'&&(
              <div style={{borderTop:'1px solid var(--border)',paddingTop:10}}>
                <div style={{fontFamily:MONO,fontSize:10,color:'#ffd166',marginBottom:8,fontWeight:700}}>
                  ↘ Cerrar posición
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginBottom:8}}>
                  <label style={{display:'flex',flexDirection:'column',gap:4}}>
                    <span style={{fontSize:10,color:'#5a8aaa'}}>Fecha salida</span>
                    <input type="text" placeholder="dd/mm/yyyy" value={tlCloseForm.exit_date||''}
                      onChange={e=>setTlCloseForm(f=>({...f,exit_date:e.target.value}))}
                      style={{background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:11,padding:'5px 7px',borderRadius:4}}/>
                  </label>
                  <label style={{display:'flex',flexDirection:'column',gap:4}}>
                    <span style={{fontSize:10,color:'#5a8aaa'}}>Precio salida</span>
                    <input type="number" step="0.01" placeholder={tlSelected?._current_price?String(parseFloat(tlSelected._current_price).toFixed(2)):'0.00'}
                      value={tlCloseForm.exit_price||''}
                      onChange={e=>setTlCloseForm(f=>({...f,exit_price:e.target.value}))}
                      style={{background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:11,padding:'5px 7px',borderRadius:4}}/>
                  </label>
                  <label style={{display:'flex',flexDirection:'column',gap:4}}>
                    <span style={{fontSize:10,color:'#5a8aaa'}}>Comisión venta (€)</span>
                    <input type="number" step="0.01" value={tlCloseForm.commission_sell||0}
                      onChange={e=>setTlCloseForm(f=>({...f,commission_sell:e.target.value}))}
                      style={{background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:11,padding:'5px 7px',borderRadius:4}}/>
                  </label>
                </div>
                {tlCloseForm.exit_price&&tlSelected&&(()=>{
                  const pnlCur=(parseFloat(tlCloseForm.exit_price)-parseFloat(tlSelected.entry_price||0))*parseFloat(tlSelected.shares||0)
                  const fx=parseFloat(tlSelected.fx_entry||1)>1?parseFloat(tlSelected.fx_entry||1):(parseFloat(tlSelected.fx_entry||1)>0?1/parseFloat(tlSelected.fx_entry||1):1)
                  const commSell=parseFloat(tlCloseForm.commission_sell||0)
                  const pnlEur=pnlCur/fx-commSell
                  const pnlPct=(parseFloat(tlCloseForm.exit_price)/parseFloat(tlSelected.entry_price||1)-1)*100
                  const col=pnlEur>=0?'#00e5a0':'#ff4d6d'
                  return(<div style={{fontFamily:MONO,fontSize:10,color:'var(--text3)',marginBottom:6,display:'flex',gap:16}}>
                    <span>P&amp;L: <b style={{color:col}}>{pnlEur>=0?'+':''}{pnlEur.toFixed(2)}€</b></span>
                    <span>%: <b style={{color:col}}>{pnlPct>=0?'+':''}{pnlPct.toFixed(2)}%</b></span>
                  </div>)
                })()}
                <button onClick={async()=>{
                  if(!tlCloseForm.exit_price||!tlCloseForm.exit_date){alert('Introduce fecha y precio de salida');return}
                  try{
                    const exitDate=toIsoDate(tlCloseForm.exit_date)||tlCloseForm.exit_date
                    const exitPx=parseFloat(tlCloseForm.exit_price)
                    const entryPx=parseFloat(tlSelected.entry_price||0)
                    const shares=parseFloat(tlSelected.shares||0)
                    let fx=parseFloat(tlSelected.fx_entry||1); if(fx<1&&fx>0) fx=1/fx
                    const pnlCur=(exitPx-entryPx)*shares
                    const commSell=parseFloat(tlCloseForm.commission_sell||0)
                    const pnlEur=pnlCur/fx-commSell
                    const pnlPct=(exitPx/entryPx-1)*100
                    let fxExit=null
                    if(tlSelected.entry_currency&&tlSelected.entry_currency!=='EUR'){
                      try{const r=await fetch('/api/tradelog?action=fx&currency='+tlSelected.entry_currency+'&date='+exitDate);const j=await r.json();if(j.fx)fxExit=j.fx}catch(_){}
                    }
                    await tlSaveTrade({...tlSelected,
                      status:'closed',exit_date:exitDate,exit_price:exitPx,
                      commission_sell:commSell,fx_exit:fxExit,
                      pnl_eur:parseFloat(pnlEur.toFixed(4)),
                      pnl_pct:parseFloat(pnlPct.toFixed(4)),
                      pnl_currency:parseFloat(pnlCur.toFixed(4))
                    })
                    setTlFormOpen(false)
                  }catch(e){alert('Error al cerrar: '+e.message)}
                }}
                  style={{marginTop:8,fontFamily:MONO,fontSize:11,padding:'6px 14px',borderRadius:4,cursor:'pointer',
                    background:'rgba(255,209,102,0.12)',border:'1px solid #ffd166',color:'#ffd166',fontWeight:700}}>
                  ✓ Confirmar cierre
                </button>
              </div>
            )}
            {/* Botones */}
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',paddingTop:4,borderTop:'1px solid var(--border)'}}>
              {tlForm.id?(
                <button onClick={async()=>{
                  if(!window.confirm('¿Eliminar esta operación? Esta acción no se puede deshacer.')) return
                  try{
                    await tlDeleteTrade(tlForm.id)
                    setTlFormOpen(false)
                  }catch(e){alert('Error: '+e.message)}
                }}
                  style={{fontFamily:MONO,fontSize:11,padding:'6px 12px',borderRadius:4,cursor:'pointer',
                    background:'rgba(255,77,109,0.1)',border:'1px solid #ff4d6d',color:'#ff4d6d'}}>
                  🗑 Eliminar
                </button>
              ):<div/>}
              <button onClick={async()=>{
                try{
                  let formData = {...tlForm, entry_date: toIsoDate(tlForm.entry_date)||tlForm.entry_date, status:'open', import_source:tlForm.import_source||'manual'}
                  if(tlForm.exit_date||tlForm.exit_price) formData.status='closed'
                  const cleanForm={...formData}
                  delete cleanForm._current_price; delete cleanForm._multipleOpen; delete cleanForm._openOptions; delete cleanForm._closesTradeId
                  formData = cleanForm
                  if(formData.entry_currency && formData.entry_currency!=='EUR' && !formData.fx_entry) {
                    try{
                      const r=await fetch(`/api/tradelog?action=fx&currency=${formData.entry_currency}&date=${formData.entry_date||new Date().toISOString().slice(0,10)}`)
                      const j=await r.json()
                      if(j.fx) formData={...formData,fx_entry:j.fx.toFixed(4)}
                    }catch(_){}
                  } else if(formData.entry_currency==='EUR') {
                    formData={...formData,fx_entry:'1'}
                  }
                  const isNew = !tlForm.id
                  const saved = await tlSaveTrade(formData)
                  setTlFormOpen(false)
                  ;(async()=>{
                    const s2=await loadSettings()
                    if(!isNew||s2?.tradelog?.autoScreenshot!==true){ setSidePanel('tradelog'); return }
                    setSidePanel('tradelog')
                    await new Promise(r=>setTimeout(r,400))
                    await saveScreenshot(saved)
                  })()
                }catch(e){alert('Error al guardar: '+e.message)}
              }}
                style={{fontFamily:MONO,fontSize:11,padding:'6px 18px',borderRadius:4,cursor:'pointer',
                  background:'rgba(0,212,255,0.15)',border:'1px solid var(--accent)',color:'var(--accent)',fontWeight:700}}>
                {tlForm.id?'Guardar cambios':'Guardar operación'}
              </button>
            </div>
          </div>
        </div>
      )}
  </>
  )
}
