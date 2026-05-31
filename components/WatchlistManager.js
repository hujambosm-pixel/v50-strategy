import { useState, useEffect, useCallback, useRef } from 'react'
import { MONO, fmt } from '../lib/utils'
import { getSupaUrl, getSupaH } from '../lib/supabase'

// ── Supabase helpers ─────────────────────────────────────────
async function _setItemLists(itemId, listIds) {
  await fetch(`${getSupaUrl()}/rest/v1/watchlist_list_members?watchlist_id=eq.${itemId}`, {
    method: 'DELETE', headers: getSupaH()
  })
  if (listIds.length > 0) {
    await fetch(`${getSupaUrl()}/rest/v1/watchlist_list_members`, {
      method: 'POST',
      headers: { ...getSupaH(), 'Prefer': 'return=minimal' },
      body: JSON.stringify(listIds.map(list_id => ({ watchlist_id: itemId, list_id })))
    })
  }
}

async function loadAllRankingsWithMetrics() {
  let url = `${getSupaUrl()}/rest/v1/ranking_results?select=symbol,strategy_id,score,score_historico,score_completo,updated_at,win_rate,cagr_simple,max_drawdown,total_trades,profit_simple,rank_position&limit=10000`
  let res = await fetch(url, { headers: getSupaH() })
  if (!res.ok) {
    // Fallback nivel 1: sin profit_simple (columna puede no existir)
    url = `${getSupaUrl()}/rest/v1/ranking_results?select=symbol,strategy_id,score,score_historico,score_completo,updated_at,win_rate,cagr_simple,max_drawdown,total_trades,rank_position&limit=10000`
    res = await fetch(url, { headers: getSupaH() })
  }
  if (!res.ok) {
    // Fallback nivel 2: sin score_completo y updated_at
    url = `${getSupaUrl()}/rest/v1/ranking_results?select=symbol,strategy_id,score,score_historico,win_rate,cagr_simple,max_drawdown,total_trades,rank_position&limit=10000`
    res = await fetch(url, { headers: getSupaH() })
  }
  if (!res.ok) {
    // Fallback nivel 3: sin score_historico
    url = `${getSupaUrl()}/rest/v1/ranking_results?select=symbol,strategy_id,score,win_rate,cagr_simple,max_drawdown,total_trades,rank_position&limit=10000`
    res = await fetch(url, { headers: getSupaH() })
  }
  if (!res.ok) return []
  return (await res.json()) || []
}

// ── Warm-notebook color helpers ──────────────────────────────
const cagrBg = v => {
  if (v == null) return 'transparent'
  if (v > 15) return '#d4edda'
  if (v > 5)  return '#dff0d8'
  if (v > 0)  return '#eaf6ec'
  return '#fde8e8'
}
const cagrFg = v => {
  if (v == null) return '#9a9590'
  if (v > 15) return '#1a5c30'
  if (v > 5)  return '#2d6a4f'
  if (v > 0)  return '#386641'
  return '#8b1a1a'
}
const ddBg = v => {
  if (v == null) return 'transparent'
  const abs = Math.abs(v)
  if (abs > 30) return '#f9cccc'
  if (abs > 15) return '#fad7d7'
  return 'transparent'
}
const ddFg = v => {
  if (v == null) return '#9a9590'
  const abs = Math.abs(v)
  if (abs > 30) return '#8b1a1a'
  if (abs > 15) return '#9b2c2c'
  return '#4a4540'
}
const wrFg = v => v == null ? '#9a9590' : v >= 50 ? '#1a5c30' : '#8b1a1a'
const scoreFg = v => v == null ? '#9a9590' : v > 70 ? '#1a5c30' : v > 40 ? '#7a5c10' : '#8b1a1a'
const scoreBar = v => v == null ? null : v > 70 ? '#4a9b6a' : v > 40 ? '#b87a20' : '#c04040'

// ── Asset type helpers ────────────────────────────────────────
const COMMODITIES = new Set(['GC=F','CL=F','SI=F','NG=F','HG=F','ZC=F','ZW=F','ZS=F','KC=F','CT=F','PA=F','PL=F'])
const ETFS = new Set(['SPY','QQQ','IWM','DIA','GLD','SLV','USO','VXX','ARKK','XLF','XLE','XLK','XLV','XLI','XLB','XLP','XLU','XLRE'])
function getAssetType(symbol) {
  if (!symbol) return 'Acción'
  const s = symbol.toUpperCase()
  if (s.startsWith('^')) return 'Índice'
  if (s.includes('-USD') || s.includes('-EUR') || s.includes('-BTC')) return 'Crypto'
  if (COMMODITIES.has(s)) return 'Mat. prima'
  if (ETFS.has(s)) return 'ETF'
  return 'Acción'
}
const TYPE_STYLE = {
  'Acción':     { bg: 'rgba(59,130,246,0.14)',  color: '#3b82f6', border: 'rgba(59,130,246,0.28)'  },
  'Crypto':     { bg: 'rgba(245,158,11,0.14)',  color: '#f59e0b', border: 'rgba(245,158,11,0.28)'  },
  'Índice':     { bg: 'rgba(139,92,246,0.14)',  color: '#8b5cf6', border: 'rgba(139,92,246,0.28)'  },
  'Mat. prima': { bg: 'rgba(16,185,129,0.14)',  color: '#10b981', border: 'rgba(16,185,129,0.28)'  },
  'ETF':        { bg: 'rgba(99,102,241,0.14)',  color: '#6366f1', border: 'rgba(99,102,241,0.28)'  },
}

// ── Palette ───────────────────────────────────────────────────
const P = {
  bg:           '#f5f0e8',
  bgAlt:        '#ede8df',
  bgHeader:     '#ede8df',
  bgPanel:      '#ede8df',
  border:       '#ccc8bf',
  borderStrong: '#b8b3ab',
  thBg:         '#ddd8cf',
  thFg:         '#4a4540',
  text:         '#2c2820',
  textSec:      '#6b6560',
  textMuted:    '#9a9590',
  selected:     '#e8e0d4',
  hover:        '#e8e3da',
  accentBg:     '#2c2820',
  accentFg:     '#f5f0e8',
  badgeDiario:  { bg: '#e8e0d0', border: '#c8c0b0', color: '#4a3c28' },
  badgeSemanal: { bg: '#e0d8ec', border: '#c0b4d8', color: '#3c2860' },
}

// ── Main component ───────────────────────────────────────────
export default function WatchlistManager({
  watchlist,
  bestStratBySymbol,
  strategies,
  wlLists,
  onReload,
  onClose,
  // Cálculo completo (fase 1 + fase 2)
  onCalcFull,
  calcPhase,    // 0=idle, 1=fase1 ranking activo, 2=fase2 top estrategia
  // Cálculos específicos por columna
  onCalcScoreMetricas,   // solo score_historico (activa + top)
  onCalcScoreMetSen,     // solo score_completo  (activa + top)
  onCalcMetricas,        // solo métricas: CAGR, Profit, Win%, MaxDD, Ops
  // Ranking
  onCalcRanking,
  onClearRanking,
  hasRanking,
  rankingRunning,
  rankingProgress,
  rankingStratName,
  // Notificaciones panel (JSX node)
  notifPanel,
  // Analizar candidatos props
  candidatesText,
  setCandidatesText,
  candidatesLoading,
  candidatesProgress,
  candidatesResults,
  onAnalyzeCandidates,
  onClearCandidates,
  onCandidateClick,
  onCandidateAdd,
  // List management
  onCreateList,
  onRenameList,
  onDeleteList,
  // Top estrategia
  onRefreshBestStrat,
  onCalcRankingAll,
  topStratRunning,
  topStratProgress,
  hasBestStrat,
  onClearBestStrat,
  // Ranking data from parent (for score columns)
  rankingData,
  rankingStratId,
  // Item edit/delete
  onEditItem,
  onDeleteItem,
  // Borrar scores / métricas de ranking_results
  onDeleteScores,
  onDeleteMetrics,
  // Unified data state from parent
  wlData,
}) {
  const [allRankings, setAllRankings]       = useState({})
  const [loadingRank, setLoadingRank]       = useState(true)
  const [selected, setSelected]             = useState(new Set())
  const [sortState, setSortState]           = useState({ metric: 'cagr', dir: 'desc' })
  const [filterSearch, setFilterSearch]     = useState('')
  const [filterLists, setFilterLists]       = useState([])
  const [bulkMoveList, setBulkMoveList]     = useState('')
  const [bulkAddList, setBulkAddList]       = useState('')
  const [saving, setSaving]                 = useState(new Set())
  const [addDropOpen, setAddDropOpen]       = useState(null)
  const [listFilterOpen, setListFilterOpen] = useState(false)
  const [activeSubPanel, setActiveSubPanel] = useState(null) // 'notif' | 'candidates' | null
  // List management inside dropdown
  const [dropdownMode, setDropdownMode]   = useState(null)  // null | 'create' | 'rename' | 'delete'
  const [newListName, setNewListName]     = useState('')
  const [renameValue, setRenameValue]     = useState('')
  const [listOpLoading, setListOpLoading] = useState(false)
  const [blockingPopup, setBlockingPopup]          = useState(null)  // {message, symbols}
  const [metricsView, setMetricsView]             = useState('top') // 'active' | 'top'
  const [rankingDoneFlash, setRankingDoneFlash]   = useState(false)
  const [topStratDoneFlash, setTopStratDoneFlash] = useState(false)
  const [confirmScoresDelete, setConfirmScoresDelete]   = useState(false)
  const [confirmMetricsDelete, setConfirmMetricsDelete] = useState(false)
  const prevRankingRunning  = useRef(false)
  const prevTopStratRunning = useRef(false)
  const addDropRef      = useRef(null)
  const listFilterRef   = useRef(null)
  const headerScrollRef = useRef(null)
  const bodyScrollRef   = useRef(null)

  // ── Helper: convierte filas de Supabase al mapa allRankings ──
  function buildAllRankingsMap(rows) {
    const map = {}
    rows.forEach(r => {
      const sid = r.strategy_id || '__null__'
      const sym = (r.symbol || '').toUpperCase()
      if (!map[sid]) map[sid] = {}
      map[sid][sym] = {
        cagr:           r.cagr_simple,
        winRate:        r.win_rate,
        maxDD:          r.max_drawdown,
        trades:         r.total_trades,
        profit:         r.profit_simple  ?? null,
        score:          r.score,
        scoreHistorico: r.score_historico ?? null,
        scoreCompleto:  r.score_completo  ?? null,
        updatedAt:      r.updated_at      ?? null,
      }
    })
    return map
  }

  // ── Load all ranking data on mount ────────────────────────
  useEffect(() => {
    setLoadingRank(true)
    loadAllRankingsWithMetrics()
      .then(rows => setAllRankings(buildAllRankingsMap(rows)))
      .catch(() => {})
      .finally(() => setLoadingRank(false))
  }, [])

  // ── Outside-click handlers ─────────────────────────────────
  useEffect(() => {
    const h = e => {
      if (addDropRef.current && !addDropRef.current.contains(e.target)) setAddDropOpen(null)
      if (listFilterRef.current && !listFilterRef.current.contains(e.target)) {
        setListFilterOpen(false)
        setDropdownMode(null)
        setNewListName('')
      }
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  // ── Flash "✓ Listo" 2s al terminar + reload datos desde Supabase ────────────
  useEffect(() => {
    if (prevRankingRunning.current && !rankingRunning) {
      // Recargar allRankings para reflejar datos recién guardados (solo si no viene otra fase)
      loadAllRankingsWithMetrics()
        .then(rows => setAllRankings(buildAllRankingsMap(rows)))
        .catch(() => {})
      setRankingDoneFlash(true)
      const t = setTimeout(() => setRankingDoneFlash(false), 2000)
      return () => clearTimeout(t)
    }
    prevRankingRunning.current = rankingRunning
  }, [rankingRunning])  // eslint-disable-line

  useEffect(() => {
    if (prevTopStratRunning.current && !topStratRunning) {
      // Recargar allRankings para reflejar datos de todas las estrategias recién guardados
      loadAllRankingsWithMetrics()
        .then(rows => setAllRankings(buildAllRankingsMap(rows)))
        .catch(() => {})
      setTopStratDoneFlash(true)
      const t = setTimeout(() => setTopStratDoneFlash(false), 2000)
      return () => clearTimeout(t)
    }
    prevTopStratRunning.current = topStratRunning
  }, [topStratRunning])  // eslint-disable-line

  // ── Best strategy for a symbol ────────────────────────────
  // Priority: bestStratBySymbol (score-based, same source as sidebar tooltip)
  // Fallback: allRankings scan by CAGR (when bestStratBySymbol not populated)
  const bestForSymbol = useCallback(sym => {
    const symUp = sym.toUpperCase()

    // ── Primary: use bestStratBySymbol (keeps sidebar & Gestionar in sync) ──
    const bsb = bestStratBySymbol[symUp]
    if (bsb?.stratId) {
      const metrics = allRankings[bsb.stratId]?.[symUp] ?? null
      return {
        sid:            bsb.stratId,
        metrics,
        stratName:      bsb.stratName || '—',
        intervalo:      bsb.intervalo || 'diario',
        stratCount:     bsb.stratCount ?? Object.values(allRankings).filter(d => d[symUp]).length,
        scoreHistorico: bsb.scoreHistorico ?? metrics?.scoreHistorico ?? null,
        scoreCompleto:  bsb.scoreCompleto  ?? metrics?.scoreCompleto  ?? null,
        updatedAt:      bsb.updatedAt      ?? metrics?.updatedAt      ?? null,
      }
    }

    // ── Fallback: best CAGR scan from allRankings ──
    let best = null
    Object.entries(allRankings).forEach(([sid, data]) => {
      const m = data[symUp]
      if (!m) return
      if (best == null || (m.cagr ?? -999) > (best.metrics.cagr ?? -999))
        best = { sid, metrics: m }
    })
    if (!best) return null
    const strat = strategies.find(s => s.id === best.sid)
    let intervalo = 'diario'
    try {
      const p = typeof strat?.params === 'string' ? JSON.parse(strat.params || '{}') : (strat?.params || {})
      intervalo = p.intervalo || 'diario'
    } catch (_) {}
    return {
      sid:            best.sid,
      metrics:        best.metrics,
      stratName:      strat?.name || '—',
      intervalo,
      stratCount:     Object.values(allRankings).filter(d => d[symUp]).length,
      scoreHistorico: best.metrics?.scoreHistorico ?? null,
      scoreCompleto:  best.metrics?.scoreCompleto  ?? null,
      updatedAt:      best.metrics?.updatedAt      ?? null,
    }
  }, [allRankings, strategies, bestStratBySymbol])

  // ── Filter ─────────────────────────────────────────────────
  const filtered = watchlist.filter(w => {
    const sl = filterSearch.toLowerCase()
    const matchSearch = !sl || (() => {
      if ((w.symbol || '').toLowerCase().includes(sl)) return true
      if ((w.name   || '').toLowerCase().includes(sl)) return true
      // Listas asignadas
      const listNames = (w.list_ids || [])
        .map(lid => wlLists.find(l => l.id === lid)?.name || '')
        .join(' ').toLowerCase()
      if (listNames.includes(sl)) return true
      // Estrategia favorita + métricas
      const best = bestForSymbol(w.symbol || '')
      if (best) {
        if ((best.stratName || '').toLowerCase().includes(sl)) return true
        if ((best.intervalo || '').toLowerCase().includes(sl)) return true
        const m = best.metrics
        if (m) {
          if (m.cagr    != null && m.cagr.toFixed(1).includes(sl))              return true
          if (m.winRate != null && m.winRate.toFixed(0).includes(sl))            return true
          if (m.maxDD   != null && Math.abs(m.maxDD).toFixed(1).includes(sl))   return true
          if (m.trades  != null && String(Math.round(m.trades)).includes(sl))    return true
        }
      }
      return false
    })()
    const matchList = (() => {
      if (filterLists.length === 0) return true
      const namedIds     = filterLists.filter(x => x !== '__unassigned__')
      const hasUnassigned = filterLists.includes('__unassigned__')
      const itemIds       = w.list_ids || []
      if (hasUnassigned && itemIds.length === 0) return true
      if (namedIds.length > 0 && namedIds.some(lid => itemIds.includes(lid))) return true
      return false
    })()
    return matchSearch && matchList
  })

  // ── Sort ───────────────────────────────────────────────────
  const STR_METRICS = ['symbol', 'name', 'tipo', 'stratName', 'intervalo']
  const SCORE_METRICS = ['scoreHistorico', 'scoreCompleto']
  const sorted = [...filtered].sort((a, b) => {
    const { metric, dir } = sortState
    const cmp    = (va, vb) => dir === 'asc' ? va - vb : vb - va
    const cmpStr = (sa, sb) => dir === 'asc' ? sa.localeCompare(sb) : sb.localeCompare(sa)
    if (metric === 'symbol') return cmpStr(a.symbol || '', b.symbol || '')
    if (metric === 'name')   return cmpStr(a.name   || '', b.name   || '')
    if (metric === 'tipo')   return cmpStr(getAssetType(a.symbol || ''), getAssetType(b.symbol || ''))
    const symA = (a.symbol || '').toUpperCase()
    const symB = (b.symbol || '').toUpperCase()
    const da = wlData?.[symA]?.[metricsView] || {}
    const db = wlData?.[symB]?.[metricsView] || {}
    if (metric === 'scoreHistorico') return cmp(da.scoreMetricas ?? (dir==='asc'?Infinity:-Infinity), db.scoreMetricas ?? (dir==='asc'?Infinity:-Infinity))
    if (metric === 'scoreCompleto')  return cmp(da.scoreMetSeñ   ?? (dir==='asc'?Infinity:-Infinity), db.scoreMetSeñ   ?? (dir==='asc'?Infinity:-Infinity))
    if (metric === 'stratName') return cmpStr(da.stratName || '', db.stratName || '')
    if (metric === 'intervalo') return cmpStr(da.intervalo || 'diario', db.intervalo || 'diario')
    const fieldMap = { cagr:'cagr', profit:'profit', winRate:'winRate', maxDD:'maxDD', trades:'ops' }
    const field = fieldMap[metric] || metric
    return cmp(da[field] ?? (dir==='asc'?Infinity:-Infinity), db[field] ?? (dir==='asc'?Infinity:-Infinity))
  })

  // ── Selection ─────────────────────────────────────────────
  const allSelected = sorted.length > 0 && sorted.every(w => selected.has(w.id))
  const toggleAll   = () => allSelected
    ? setSelected(new Set())
    : setSelected(new Set(sorted.map(w => w.id)))
  const toggleOne   = id => setSelected(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n
  })

  // ── Sort helpers ──────────────────────────────────────────
  const handleSort = metric => setSortState(prev =>
    prev.metric === metric
      ? { metric, dir: prev.dir === 'desc' ? 'asc' : 'desc' }
      : { metric, dir: STR_METRICS.includes(metric) ? 'asc' : 'desc' }
  )
  const sortIcon = metric => {
    if (sortState.metric !== metric)
      return <span style={{ color: P.textMuted, marginLeft: 2, fontSize: 10 }}>↕</span>
    return <span style={{ color: P.text, marginLeft: 2, fontSize: 10 }}>{sortState.dir === 'desc' ? '↓' : '↑'}</span>
  }

  // ── List mutations ─────────────────────────────────────────
  const removeFromList = useCallback(async (item, listId) => {
    const newIds = (item.list_ids || []).filter(id => id !== listId)
    setSaving(prev => new Set([...prev, item.id]))
    try { await _setItemLists(item.id, newIds); onReload() }
    catch (e) { console.error(e) }
    finally { setSaving(prev => { const n = new Set(prev); n.delete(item.id); return n }) }
  }, [onReload])

  const addToList = useCallback(async (item, listId) => {
    if ((item.list_ids || []).includes(listId)) return
    setSaving(prev => new Set([...prev, item.id]))
    try { await _setItemLists(item.id, [...(item.list_ids || []), listId]); onReload() }
    catch (e) { console.error(e) }
    finally { setSaving(prev => { const n = new Set(prev); n.delete(item.id); return n }) }
    setAddDropOpen(null)
  }, [onReload])

  // ── Bulk actions ───────────────────────────────────────────
  const bulkMove = async () => {
    if (!bulkMoveList || selected.size === 0) return
    const items = watchlist.filter(w => selected.has(w.id))
    setSaving(new Set(items.map(w => w.id)))
    try {
      await Promise.all(items.map(item => _setItemLists(item.id, [bulkMoveList])))
      onReload(); setSelected(new Set())
    }
    catch (e) { console.error(e) }
    finally { setSaving(new Set()) }
  }
  const bulkAdd = async () => {
    if (!bulkAddList || selected.size === 0) return
    const items = watchlist.filter(w => selected.has(w.id))
    setSaving(new Set(items.map(w => w.id)))
    try {
      await Promise.all(items.map(item =>
        _setItemLists(item.id, [...new Set([...(item.list_ids || []), bulkAddList])])))
      onReload()
    }
    catch (e) { console.error(e) }
    finally { setSaving(new Set()) }
  }

  // ── Style helpers ──────────────────────────────────────────
  const TH = (extra = {}) => ({
    padding: '7px 12px',
    background: P.thBg,
    color: P.thFg,
    fontFamily: MONO,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    borderBottom: `2px solid ${P.borderStrong}`,
    borderRight: `1px solid ${P.border}`,
    position: 'sticky',
    top: 0,
    zIndex: 10,
    whiteSpace: 'nowrap',
    userSelect: 'none',
    ...extra,
  })
  // TH para la segunda fila de headers (columnas individuales) — top=32 para quedar bajo la fila de grupos
  const TH2 = (extra = {}) => TH({ top: 32, zIndex: 9, ...extra })
  const TD = (extra = {}) => ({
    padding: '3px 8px',
    borderBottom: `1px solid ${P.border}`,
    borderRight: `1px solid ${P.border}`,
    fontFamily: MONO,
    fontSize: 13,
    color: P.text,
    verticalAlign: 'middle',
    ...extra,
  })

  const rowBg = (w, isSelected, isOdd) => {
    if (isSelected) return P.selected
    const m    = bestForSymbol((w.symbol || '').toUpperCase())?.metrics
    const cagr = m?.cagr
    if (cagr > 10) return isOdd ? '#eaf5ec' : '#f0f8f2'
    if (cagr != null && cagr < 0) return isOdd ? '#f8eaea' : '#faf0f0'
    return isOdd ? P.bgAlt : P.bg
  }

  // ── List filter display ────────────────────────────────────
  const selListNames = filterLists
    .map(lid => lid === '__unassigned__' ? 'Sin lista' : wlLists.find(l => l.id === lid)?.name)
    .filter(Boolean)

  // ── Bulk-action select style (white bg for OS dropdown) ───
  const bulkSelStyle = {
    background: '#ffffff',
    border: `1px solid ${P.borderStrong}`,
    color: '#1e293b',
    fontFamily: MONO,
    fontSize: 11,
    borderRadius: 4,
    padding: '0 6px',
    height: 28,
    width: 150,
    cursor: 'pointer',
  }
  const bulkBtnStyle = ok => ({
    background: ok ? P.text : P.border,
    border: 'none',
    color: ok ? P.accentFg : P.textMuted,
    fontFamily: MONO,
    fontSize: 11,
    padding: '0 10px',
    height: 28,
    borderRadius: 4,
    cursor: ok ? 'pointer' : 'not-allowed',
    flexShrink: 0,
  })

  // ── Sub-panel toggle-button style ──────────────────────────
  const subBtnStyle = panel => ({
    background: activeSubPanel === panel ? P.accentBg : P.bg,
    border: `1px solid ${activeSubPanel === panel ? P.accentBg : P.borderStrong}`,
    color: activeSubPanel === panel ? P.accentFg : P.textSec,
    fontFamily: MONO,
    fontSize: 11,
    padding: '5px 10px',
    borderRadius: 5,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  })

  // ── Derived: single named list (for rename/delete actions) ─
  const singleNamedList = (
    filterLists.length === 1 && filterLists[0] !== '__unassigned__'
      ? wlLists.find(l => l.id === filterLists[0]) ?? null
      : null
  )

  // ── List management handlers ───────────────────────────────
  const handleCreateList = async () => {
    const name = newListName.trim()
    if (!name || !onCreateList) return
    setListOpLoading(true)
    try {
      const created = await onCreateList(name)
      setNewListName('')
      setDropdownMode(null)
      onReload()
      // auto-select the new list
      if (created?.id) setFilterLists(prev => [...prev, created.id])
    } catch (e) { console.error(e) }
    finally { setListOpLoading(false) }
  }

  const handleRenameList = async () => {
    const name = renameValue.trim()
    if (!name || !singleNamedList || !onRenameList) return
    setListOpLoading(true)
    try {
      await onRenameList(singleNamedList.id, name)
      setDropdownMode(null)
      onReload()
    } catch (e) { console.error(e) }
    finally { setListOpLoading(false) }
  }

  const handleDeleteList = async () => {
    if (!singleNamedList || !onDeleteList) return
    setListOpLoading(true)
    try {
      await onDeleteList(singleNamedList.id)
      setFilterLists(prev => prev.filter(x => x !== singleNamedList.id))
      setDropdownMode(null)
      onReload()
    } catch (e) { console.error(e) }
    finally { setListOpLoading(false) }
  }

  // ── Derived: intervalo of the ranking strategy (for active view) ──
  const rankingIntervalo = (() => {
    if (!rankingStratId) return 'diario'
    const strat = strategies.find(s => s.id === rankingStratId)
    try {
      const p = typeof strat?.params === 'string' ? JSON.parse(strat?.params || '{}') : (strat?.params || {})
      return p.intervalo || 'diario'
    } catch (_) { return 'diario' }
  })()

  // ── Derived: watchlist symbol set (for candidates WL badge)
  const wlSymSet = new Set(watchlist.map(w => (w.symbol || '').toUpperCase()))

  // ─────────────────────────────────────────────────────────
  return (
    <div style={{
      width: '100%', height: '100%',
      background: P.bg,
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
      fontFamily: MONO,
    }}>

      {/* ── Cabecera ── */}
      <div style={{
        flexShrink: 0,
        background: P.bgPanel,
        borderBottom: `1px solid ${P.borderStrong}`,
        padding: '8px 14px',
        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
      }}>

        {/* Título */}
        <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: P.text, flexShrink: 0 }}>
          ⊞ Mantenimiento Watchlist
        </span>

        {/* ── Botones de herramientas ── */}
        <button onClick={() => setActiveSubPanel(p => p === 'notif' ? null : 'notif')}
          title="Ver y gestionar alertas técnicas y de precio para los activos del Watchlist"
          style={subBtnStyle('notif')}>
          🔔 Notificaciones
        </button>
        <button onClick={() => setActiveSubPanel(p => p === 'candidates' ? null : 'candidates')}
          title="Analizar tickers candidatos externos con la estrategia activa para decidir si añadirlos al Watchlist"
          style={subBtnStyle('candidates')}>
          🔍 Analizar
        </button>


        {/* Buscador */}
        <div style={{ position: 'relative', width: 180, flexShrink: 0 }}>
          <input type="text" placeholder="Buscar en todas las columnas…"
            value={filterSearch} onChange={e => setFilterSearch(e.target.value)}
            style={{
              width: '100%', background: P.bg, border: `1px solid ${P.border}`,
              color: P.text, fontFamily: MONO, fontSize: 12,
              padding: '5px 24px 5px 9px', borderRadius: 5,
              boxSizing: 'border-box', outline: 'none',
            }} />
          {filterSearch
            ? <span onClick={() => setFilterSearch('')}
                style={{ position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)',
                  cursor: 'pointer', color: P.textMuted, fontSize: 12 }}>✕</span>
            : <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                color: P.textMuted, fontSize: 11, pointerEvents: 'none' }}>⌕</span>}
        </div>

        {/* Filtro por listas */}
        <div style={{ position: 'relative', flexShrink: 0 }} ref={listFilterRef}>
          <button onClick={() => setListFilterOpen(v => !v)}
            style={{
              background: filterLists.length ? P.accentBg : P.bg,
              border: `1px solid ${P.borderStrong}`,
              color: filterLists.length ? P.accentFg : P.textSec,
              fontFamily: MONO, fontSize: 11, padding: '5px 10px', borderRadius: 5,
              cursor: 'pointer', whiteSpace: 'nowrap',
            }}>
            {filterLists.length
              ? `${selListNames.slice(0,2).join(', ')}${selListNames.length > 2 ? ` +${selListNames.length-2}` : ''}`
              : 'Todas las listas'} ▾
          </button>
          {listFilterOpen && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, zIndex: 200, marginTop: 4,
              background: P.bg, border: `1px solid ${P.borderStrong}`, borderRadius: 6,
              boxShadow: '0 4px 12px rgba(0,0,0,0.12)', minWidth: 160, padding: '4px 0',
            }}>
              {filterLists.length > 0 && (
                <div onClick={() => setFilterLists([])}
                  style={{ padding: '6px 12px', fontSize: 11, color: P.text, cursor: 'pointer', fontWeight: 600 }}>
                  Mostrar todas
                </div>
              )}
              {wlLists.map(l => (
                <div key={l.id}
                  onClick={() => setFilterLists(prev =>
                    prev.includes(l.id) ? prev.filter(x => x !== l.id) : [...prev, l.id])}
                  style={{
                    padding: '6px 12px', fontSize: 12, color: P.text, cursor: 'pointer',
                    background: filterLists.includes(l.id) ? P.selected : 'transparent',
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}
                  onMouseOver={e => e.currentTarget.style.background = P.hover}
                  onMouseOut={e  => e.currentTarget.style.background = filterLists.includes(l.id) ? P.selected : 'transparent'}>
                  <span style={{ fontSize: 11, color: P.textSec }}>
                    {filterLists.includes(l.id) ? '☑' : '☐'}
                  </span>
                  {l.name}
                </div>
              ))}
              {/* Divisor + opción Sin lista asignada */}
              <div style={{ borderTop: `1px solid ${P.border}`, margin: '4px 0' }} />
              <div
                onClick={() => setFilterLists(prev =>
                  prev.includes('__unassigned__')
                    ? prev.filter(x => x !== '__unassigned__')
                    : [...prev, '__unassigned__'])}
                style={{
                  padding: '6px 12px', fontSize: 12, color: P.text, cursor: 'pointer',
                  background: filterLists.includes('__unassigned__') ? P.selected : 'transparent',
                  display: 'flex', alignItems: 'center', gap: 8,
                }}
                onMouseOver={e => e.currentTarget.style.background = P.hover}
                onMouseOut={e  => e.currentTarget.style.background = filterLists.includes('__unassigned__') ? P.selected : 'transparent'}>
                <span style={{ fontSize: 11, color: P.textSec }}>
                  {filterLists.includes('__unassigned__') ? '☑' : '☐'}
                </span>
                <span style={{ color: P.textMuted, fontStyle: 'italic' }}>Sin lista asignada</span>
              </div>

              {/* ── Gestión de listas ── */}
              <div style={{ borderTop: `1px solid ${P.border}`, margin: '4px 0' }} />

              {/* ＋ Nueva lista */}
              <div
                onClick={() => { setDropdownMode(m => m === 'create' ? null : 'create'); setNewListName('') }}
                style={{
                  padding: '6px 12px', fontSize: 12, cursor: 'pointer',
                  color: dropdownMode === 'create' ? P.text : P.textSec,
                  background: dropdownMode === 'create' ? P.hover : 'transparent',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
                onMouseOver={e => e.currentTarget.style.background = P.hover}
                onMouseOut={e  => e.currentTarget.style.background = dropdownMode === 'create' ? P.hover : 'transparent'}>
                <span style={{ fontSize: 13, fontWeight: 500 }}>＋</span> Nueva lista
              </div>
              {dropdownMode === 'create' && (
                <div style={{ padding: '4px 12px 8px', display: 'flex', gap: 5, alignItems: 'center' }}>
                  <input
                    autoFocus
                    value={newListName}
                    onChange={e => setNewListName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleCreateList(); if (e.key === 'Escape') { setDropdownMode(null); setNewListName('') } }}
                    placeholder="Nombre…"
                    style={{
                      flex: 1, background: P.bg, border: `1px solid ${P.borderStrong}`,
                      color: P.text, fontFamily: MONO, fontSize: 11,
                      padding: '4px 7px', borderRadius: 4, outline: 'none',
                    }}
                  />
                  <button
                    onClick={handleCreateList}
                    disabled={!newListName.trim() || listOpLoading}
                    style={{
                      background: newListName.trim() && !listOpLoading ? P.accentBg : P.border,
                      border: 'none', color: newListName.trim() && !listOpLoading ? P.accentFg : P.textMuted,
                      fontFamily: MONO, fontSize: 11, padding: '4px 9px', borderRadius: 4,
                      cursor: newListName.trim() && !listOpLoading ? 'pointer' : 'not-allowed', flexShrink: 0,
                    }}>
                    {listOpLoading ? '…' : 'Crear'}
                  </button>
                  <button
                    onClick={() => { setDropdownMode(null); setNewListName('') }}
                    style={{ background: 'transparent', border: 'none', color: P.textMuted, cursor: 'pointer', fontSize: 13, padding: '0 2px' }}>
                    ✕
                  </button>
                </div>
              )}

              {/* ✏ Renombrar — solo si hay exactamente 1 lista nombrada seleccionada */}
              {singleNamedList && (
                <>
                  <div
                    onClick={() => { setDropdownMode(m => m === 'rename' ? null : 'rename'); setRenameValue(singleNamedList.name) }}
                    style={{
                      padding: '6px 12px', fontSize: 12, cursor: 'pointer',
                      color: dropdownMode === 'rename' ? P.text : P.textSec,
                      background: dropdownMode === 'rename' ? P.hover : 'transparent',
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}
                    onMouseOver={e => e.currentTarget.style.background = P.hover}
                    onMouseOut={e  => e.currentTarget.style.background = dropdownMode === 'rename' ? P.hover : 'transparent'}>
                    <span>✏</span> Renombrar lista
                  </div>
                  {dropdownMode === 'rename' && (
                    <div style={{ padding: '4px 12px 8px', display: 'flex', gap: 5, alignItems: 'center' }}>
                      <input
                        autoFocus
                        value={renameValue}
                        onChange={e => setRenameValue(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleRenameList(); if (e.key === 'Escape') setDropdownMode(null) }}
                        style={{
                          flex: 1, background: P.bg, border: `1px solid ${P.borderStrong}`,
                          color: P.text, fontFamily: MONO, fontSize: 11,
                          padding: '4px 7px', borderRadius: 4, outline: 'none',
                        }}
                      />
                      <button
                        onClick={handleRenameList}
                        disabled={!renameValue.trim() || listOpLoading}
                        style={{
                          background: renameValue.trim() && !listOpLoading ? P.accentBg : P.border,
                          border: 'none', color: renameValue.trim() && !listOpLoading ? P.accentFg : P.textMuted,
                          fontFamily: MONO, fontSize: 11, padding: '4px 9px', borderRadius: 4,
                          cursor: renameValue.trim() && !listOpLoading ? 'pointer' : 'not-allowed', flexShrink: 0,
                        }}>
                        {listOpLoading ? '…' : 'Guardar'}
                      </button>
                      <button
                        onClick={() => setDropdownMode(null)}
                        style={{ background: 'transparent', border: 'none', color: P.textMuted, cursor: 'pointer', fontSize: 13, padding: '0 2px' }}>
                        ✕
                      </button>
                    </div>
                  )}
                </>
              )}

              {/* 🗑 Eliminar — solo si hay exactamente 1 lista nombrada seleccionada */}
              {singleNamedList && (
                <>
                  <div
                    onClick={() => setDropdownMode(m => m === 'delete' ? null : 'delete')}
                    style={{
                      padding: '6px 12px', fontSize: 12, cursor: 'pointer',
                      color: dropdownMode === 'delete' ? '#8b3030' : P.textSec,
                      background: dropdownMode === 'delete' ? '#fde8e8' : 'transparent',
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}
                    onMouseOver={e => { e.currentTarget.style.background = '#fde8e8'; e.currentTarget.style.color = '#8b3030' }}
                    onMouseOut={e  => { e.currentTarget.style.background = dropdownMode === 'delete' ? '#fde8e8' : 'transparent'; e.currentTarget.style.color = dropdownMode === 'delete' ? '#8b3030' : P.textSec }}>
                    <span>🗑</span> Eliminar lista
                  </div>
                  {dropdownMode === 'delete' && (
                    <div style={{ padding: '6px 12px 8px', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 11, color: '#8b3030', flex: '1 1 100%', marginBottom: 4 }}>
                        ¿Eliminar &ldquo;{singleNamedList.name}&rdquo;?
                      </span>
                      <button
                        onClick={handleDeleteList}
                        disabled={listOpLoading}
                        style={{
                          background: '#8b3030', border: 'none', color: '#fff',
                          fontFamily: MONO, fontSize: 11, padding: '4px 12px', borderRadius: 4,
                          cursor: listOpLoading ? 'not-allowed' : 'pointer', flexShrink: 0,
                        }}>
                        {listOpLoading ? '…' : 'Sí, eliminar'}
                      </button>
                      <button
                        onClick={() => setDropdownMode(null)}
                        style={{
                          background: 'transparent', border: `1px solid ${P.borderStrong}`,
                          color: P.textSec, fontFamily: MONO, fontSize: 11,
                          padding: '4px 10px', borderRadius: 4, cursor: 'pointer', flexShrink: 0,
                        }}>
                        Cancelar
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Toggle Estrategia activa / Top estrategia */}
        <div style={{ display: 'inline-flex', borderRadius: 4, overflow: 'hidden', border: `1px solid ${P.borderStrong}`, flexShrink: 0 }}>
          {[
            ['active', 'Estrategia activa', 'Muestra los scores y métricas calculados con la estrategia actualmente activa (resultado del último Ranking ejecutado)'],
            ['top',    'Top estrategia',    'Muestra la estrategia con mejor score histórico para cada activo (puede ser diferente de la activa)'],
          ].map(([mode, label, tip]) => (
            <button key={mode} onClick={() => setMetricsView(mode)} title={tip}
              style={{
                background: metricsView === mode ? P.accentBg : P.bg,
                color: metricsView === mode ? P.accentFg : P.textSec,
                border: 'none', fontFamily: MONO, fontSize: 10,
                padding: '4px 10px', cursor: 'pointer', whiteSpace: 'nowrap',
              }}>
              {label}
            </button>
          ))}
        </div>

        {/* Contador */}
        <span style={{ fontSize: 12, color: P.textSec }}>
          {sorted.length} activo{sorted.length !== 1 ? 's' : ''}
          {loadingRank && <span style={{ color: '#b87a20', marginLeft: 8 }}>⟳ cargando…</span>}
        </span>

        {/* ── Acciones masivas — inline compactas ── */}
        {selected.size > 0 && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            background: P.accentBg, borderRadius: 6, padding: '4px 12px',
            color: P.accentFg, flexShrink: 0,
          }}>
            <span style={{ fontSize: 12, fontWeight: 600, marginRight: 2 }}>
              {selected.size} sel.
            </span>
            <span style={{ color: '#9a9590', fontSize: 11 }}>Mover a:</span>
            <select value={bulkMoveList} onChange={e => setBulkMoveList(e.target.value)}
              style={bulkSelStyle}>
              <option value="" style={{ background: '#ffffff', color: '#1e293b' }}>— lista —</option>
              {wlLists.map(l => (
                <option key={l.id} value={l.id} style={{ background: '#ffffff', color: '#1e293b' }}>
                  {l.name}
                </option>
              ))}
            </select>
            <button onClick={bulkMove} disabled={!bulkMoveList} style={bulkBtnStyle(!!bulkMoveList)}>
              Aplicar
            </button>
            <span style={{ color: '#9a9590', fontSize: 11 }}>Añadir a:</span>
            <select value={bulkAddList} onChange={e => setBulkAddList(e.target.value)}
              style={bulkSelStyle}>
              <option value="" style={{ background: '#ffffff', color: '#1e293b' }}>— lista —</option>
              {wlLists.map(l => (
                <option key={l.id} value={l.id} style={{ background: '#ffffff', color: '#1e293b' }}>
                  {l.name}
                </option>
              ))}
            </select>
            <button onClick={bulkAdd} disabled={!bulkAddList} style={bulkBtnStyle(!!bulkAddList)}>
              Aplicar
            </button>
            <span onClick={() => setSelected(new Set())}
              style={{ fontSize: 13, color: P.textMuted, cursor: 'pointer', marginLeft: 2 }}>✕</span>
          </div>
        )}

        {/* Botón cerrar */}
        <button onClick={onClose}
          title="Cerrar el panel de gestión y volver a la vista del gráfico"
          style={{
            marginLeft: 'auto', background: P.bg,
            border: `1px solid ${P.borderStrong}`,
            color: '#8b3030', fontFamily: MONO, fontSize: 12,
            padding: '5px 12px', borderRadius: 5,
            cursor: 'pointer', flexShrink: 0,
          }}>
          ✕ Cerrar
        </button>
      </div>

      {/* ── Sub-panel expandible (Notificaciones / Analizar candidatos) ── */}
      {activeSubPanel && (
        <div style={{
          flexShrink: 0,
          borderBottom: `2px solid ${P.borderStrong}`,
          background: '#0b1623',
          maxHeight: 400,
          overflow: 'auto',
        }}>
          {activeSubPanel === 'notif' && (
            <div style={{ padding: '8px 0' }}>
              {notifPanel}
            </div>
          )}
          {activeSubPanel === 'candidates' && (
            <div style={{ padding: '8px 12px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {/* Textarea */}
              <textarea
                value={candidatesText || ''}
                onChange={e => setCandidatesText && setCandidatesText(e.target.value)}
                placeholder={'Pega aquí tickers o cualquier texto\n(AMD, NVDA, TSLA...)'}
                style={{
                  background: '#0d1a28', border: '1px solid #1a3050',
                  color: '#c8def2', fontFamily: MONO, fontSize: 11,
                  padding: '6px 8px', borderRadius: 4, resize: 'vertical',
                  width: '100%', boxSizing: 'border-box', minHeight: 72, lineHeight: 1.5,
                }}
              />
              {/* Botones analizar / limpiar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button
                  onClick={() => onAnalyzeCandidates && onAnalyzeCandidates()}
                  disabled={candidatesLoading || !(candidatesText || '').trim()}
                  style={{
                    flex: 1,
                    background: candidatesLoading ? 'rgba(0,212,255,0.04)' : 'rgba(0,212,255,0.12)',
                    border: '1px solid #00d4ff',
                    color: candidatesLoading ? '#4a7a98' : '#00d4ff',
                    fontFamily: MONO, fontSize: 11, padding: '5px 10px', borderRadius: 3,
                    cursor: (candidatesLoading || !(candidatesText || '').trim()) ? 'not-allowed' : 'pointer',
                    fontWeight: 600,
                  }}>
                  {candidatesLoading
                    ? `⟳ Analizando ${candidatesProgress?.done || 0}/${candidatesProgress?.total || 0}…`
                    : '⚡ Analizar'}
                </button>
                {(candidatesResults || []).length > 0 && !candidatesLoading && (
                  <button onClick={() => onClearCandidates && onClearCandidates()}
                    title="Limpiar resultados"
                    style={{
                      background: 'transparent', border: '1px solid #1a2d45',
                      color: '#5a7a95', fontFamily: MONO, fontSize: 11,
                      padding: '4px 8px', borderRadius: 3, cursor: 'pointer',
                    }}
                    onMouseOver={e => e.currentTarget.style.color = '#ff4d6d'}
                    onMouseOut={e  => e.currentTarget.style.color = '#5a7a95'}>✕</button>
                )}
              </div>
              {/* Tabla de resultados */}
              {(candidatesResults || []).length > 0 && (
                <div style={{ overflowX: 'auto', marginTop: 2 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: MONO, fontSize: 10 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #1a2d45' }}>
                        {[['Ticker', null], ['CAGR', null], ['WR%', null],
                          ['PF', null], ['MaxDD', null], ['Ops', null], ['', null]]
                          .map(([h, tip]) => (
                            <th key={h} title={tip || undefined}
                              style={{
                                padding: '3px 5px', color: '#5a7a95', fontWeight: 600,
                                textAlign: h === '' ? 'center' : 'left', whiteSpace: 'nowrap',
                              }}>
                              {h}
                            </th>
                          ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(candidatesResults || []).map(r => {
                        const inWl = wlSymSet.has((r.symbol || '').toUpperCase())
                        return (
                          <tr key={r.symbol}
                            onClick={() => onCandidateClick && onCandidateClick(r.symbol)}
                            style={{ borderBottom: '1px solid rgba(20,40,65,0.5)', cursor: 'pointer' }}
                            onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                            onMouseOut={e  => e.currentTarget.style.background = 'transparent'}>
                            <td style={{ padding: '4px 5px', whiteSpace: 'nowrap' }}>
                              <span style={{ color: '#d0e8fa', fontWeight: 600 }}>{r.symbol}</span>
                              {inWl && (
                                <span style={{
                                  marginLeft: 4, fontSize: 8, color: '#00e5a0',
                                  background: 'rgba(0,229,160,0.1)',
                                  border: '1px solid rgba(0,229,160,0.25)',
                                  borderRadius: 3, padding: '1px 3px',
                                }}>WL</span>
                              )}
                            </td>
                            {r.error ? (
                              <td colSpan={5} style={{ padding: '4px 5px', color: '#ff4d6d', fontSize: 10 }}>
                                ⚠ Sin datos
                              </td>
                            ) : (
                              <>
                                <td style={{ padding: '4px 5px', color: r.cagr >= 0 ? '#00e5a0' : '#ff4d6d', fontWeight: 500 }}>
                                  {isFinite(r.cagr) ? (r.cagr >= 0 ? '+' : '') + fmt(r.cagr, 1) + '%' : '—'}
                                </td>
                                <td style={{ padding: '4px 5px', color: '#c8def2' }}>
                                  {r.ops > 0 ? fmt(r.winRate, 0) + '%' : '—'}
                                </td>
                                <td style={{ padding: '4px 5px', color: r.pf >= 1 ? '#00e5a0' : '#ff7eb3' }}>
                                  {r.ops > 0 ? (isFinite(r.pf) ? fmt(r.pf, 2) : '∞') : '—'}
                                </td>
                                <td style={{ padding: '4px 5px', color: '#ff7eb3' }}>
                                  {r.ops > 0 ? '-' + fmt(r.maxDD, 1) + '%' : '—'}
                                </td>
                                <td style={{ padding: '4px 5px', color: '#a8ccdf' }}>{r.ops || '—'}</td>
                              </>
                            )}
                            <td style={{ padding: '4px 5px', textAlign: 'center' }}>
                              {inWl ? (
                                <span style={{ fontSize: 10, color: '#2a5a3a' }}>✓</span>
                              ) : r.error ? (
                                <span style={{ fontSize: 9, color: '#4a2a2a' }}>—</span>
                              ) : (
                                <button
                                  onClick={e => {
                                    e.stopPropagation()
                                    onCandidateAdd && onCandidateAdd(r.symbol)
                                  }}
                                  style={{
                                    background: 'rgba(0,212,255,0.1)',
                                    border: '1px solid rgba(0,212,255,0.35)',
                                    color: '#00d4ff', fontFamily: MONO, fontSize: 10,
                                    padding: '2px 6px', borderRadius: 3, cursor: 'pointer', lineHeight: 1,
                                  }}
                                  onMouseOver={e => e.currentTarget.style.background = 'rgba(0,212,255,0.2)'}
                                  onMouseOut={e  => e.currentTarget.style.background = 'rgba(0,212,255,0.1)'}>
                                  ＋
                                </button>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Popup bloqueante de dependencia ── */}
      {blockingPopup && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.65)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: '#1a1614',
            border: '2px solid #d97706',
            borderRadius: 8,
            padding: '24px 28px',
            maxWidth: 440,
            width: '90%',
            fontFamily: MONO,
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#fbbf24', marginBottom: 12 }}>
              ⚠ Dependencia no satisfecha
            </div>
            <div style={{ fontSize: 12, color: '#e5e0d8', marginBottom: 10, lineHeight: 1.6 }}>
              {blockingPopup.message}
            </div>
            {blockingPopup.symbols?.length > 0 && (
              <div style={{
                fontSize: 11, color: '#9a9590', marginBottom: 18,
                background: 'rgba(255,255,255,0.04)', borderRadius: 4,
                padding: '6px 10px', lineHeight: 1.7,
              }}>
                {blockingPopup.symbols.join(', ')}
              </div>
            )}
            <button
              onClick={() => setBlockingPopup(null)}
              style={{
                background: '#d97706', border: 'none', color: '#fff',
                fontFamily: MONO, fontSize: 12, fontWeight: 600,
                padding: '7px 22px', borderRadius: 5, cursor: 'pointer',
              }}>
              Entendido
            </button>
          </div>
        </div>
      )}

      {/* ── Tabla (dos tablas sincronizadas: header fijo + body con scroll) ── */}
      {(()=>{
        // Anchos fijos — idénticos en ambas tablas
        // chk=36 + tick,nom,tipo,listas,smet,smetseg,cagr,profit,wr,dd,ops,strat,temp[,elim]
        // suma datos = 70+180+70+180+110+110+70+90+60+70+50+160+90 = 1310, +50 elim = 1360
        const COL_WIDTHS = onDeleteItem
          ? [36, 70, 180, 70, 180, 110, 110, 70, 90, 60, 70, 50, 160, 90, 50]
          : [36, 70, 180, 70, 180, 110, 110, 70, 90, 60, 70, 50, 160, 90]
        const totalWidth = COL_WIDTHS.reduce((a, b) => a + b, 0)
        const colGroup = (
          <colgroup>
            {COL_WIDTHS.map((w, i) => <col key={i} style={{ width: w + 'px', minWidth: w + 'px' }} />)}
          </colgroup>
        )
        const tblStyle = { borderCollapse: 'separate', borderSpacing: 0, tableLayout: 'fixed', width: totalWidth + 'px' }
        return (<>
        {/* TABLA 1 — Headers fijos (sin scroll vertical, scroll-X sincronizado) */}
        <div ref={headerScrollRef} style={{ flexShrink: 0, overflowX: 'hidden', background: P.thBg }}>
          <table style={tblStyle}>
            {colGroup}
            <thead>
            {/* Sub-header agrupador de métricas */}
            <tr>
              <th colSpan={5} style={{ ...TH(), background: P.thBg, borderBottom: `1px solid ${P.border}` }} />
              <th colSpan={2} style={{
                ...TH(),
                background: '#d4d0c8',
                borderLeft:  `2px solid ${P.borderStrong}`,
                borderRight: `1px solid ${P.border}`,
                textAlign: 'center', color: P.thFg, fontSize: 10,
                borderBottom: `1px solid ${P.border}`,
              }}>
                {confirmScoresDelete ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, fontSize: 10 }}>
                    <span>¿Borrar scores de {selected.size}?</span>
                    <button
                      onClick={async () => {
                        const syms = watchlist.filter(w => selected.has(w.id)).map(w => w.symbol)
                        await onDeleteScores?.(syms)
                        loadAllRankingsWithMetrics().then(rows => setAllRankings(buildAllRankingsMap(rows))).catch(() => {})
                        setConfirmScoresDelete(false)
                      }}
                      style={{ fontFamily: MONO, fontSize: 10, padding: '1px 6px', borderRadius: 3, cursor: 'pointer',
                        background: '#8b1a1a', border: '1px solid #c02020', color: '#ffc8c8' }}>
                      Sí
                    </button>
                    <button
                      onClick={() => setConfirmScoresDelete(false)}
                      style={{ fontFamily: MONO, fontSize: 10, padding: '1px 6px', borderRadius: 3, cursor: 'pointer',
                        background: P.bg, border: `1px solid ${P.borderStrong}`, color: P.textSec }}>
                      No
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                    <span>Scores</span>
                    {selected.size > 0 && onDeleteScores && (
                      <span
                        onClick={() => setConfirmScoresDelete(true)}
                        title={`Borrar score_historico y score_completo de los ${selected.size} activos seleccionados en Supabase (todas las estrategias)`}
                        style={{ cursor: 'pointer', fontSize: 11, lineHeight: 1, color: P.textMuted,
                          transition: 'color 0.15s' }}
                        onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                        onMouseLeave={e => e.currentTarget.style.color = P.textMuted}>
                        🗑
                      </span>
                    )}
                  </div>
                )}
              </th>
              <th colSpan={5} style={{
                ...TH(),
                background: '#d8d2c8',
                borderLeft:  `2px solid ${P.borderStrong}`,
                borderRight: `2px solid ${P.borderStrong}`,
                textAlign: 'center', color: P.thFg, fontSize: 10,
                cursor: 'pointer',
              }}
                onClick={() => { if (!confirmMetricsDelete) setMetricsView(v => v === 'active' ? 'top' : 'active') }}
                title={confirmMetricsDelete ? undefined : (metricsView === 'active' ? 'Métricas de la estrategia actualmente activa para cada activo. Clic para cambiar a Top estrategia' : 'Métricas de la estrategia con mejor score histórico para cada activo entre todas las evaluadas. Clic para cambiar a estrategia activa')}>
                {confirmMetricsDelete ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, fontSize: 10 }} onClick={e => e.stopPropagation()}>
                    <span>¿Borrar métricas de {selected.size}?</span>
                    <button
                      onClick={async () => {
                        const syms = watchlist.filter(w => selected.has(w.id)).map(w => w.symbol)
                        await onDeleteMetrics?.(syms)
                        loadAllRankingsWithMetrics().then(rows => setAllRankings(buildAllRankingsMap(rows))).catch(() => {})
                        setConfirmMetricsDelete(false)
                      }}
                      style={{ fontFamily: MONO, fontSize: 10, padding: '1px 6px', borderRadius: 3, cursor: 'pointer',
                        background: '#8b1a1a', border: '1px solid #c02020', color: '#ffc8c8' }}>
                      Sí
                    </button>
                    <button
                      onClick={() => setConfirmMetricsDelete(false)}
                      style={{ fontFamily: MONO, fontSize: 10, padding: '1px 6px', borderRadius: 3, cursor: 'pointer',
                        background: P.bg, border: `1px solid ${P.borderStrong}`, color: P.textSec }}>
                      No
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                    {topStratDoneFlash
                      ? <span style={{ color: '#1a6b3a' }}>✓ Listo</span>
                      : topStratRunning
                        ? <span style={{ fontSize: 9 }}>Estrategia {topStratProgress?.current||0}/{topStratProgress?.total||0}…</span>
                        : (metricsView === 'active' ? (rankingStratName ? `MÉTRICAS · ${rankingStratName.toUpperCase()}` : 'MÉTRICAS ESTRATEGIA ACTIVA') : 'MÉTRICAS TOP ESTRATEGIA')}
                    {!topStratRunning && !topStratDoneFlash && selected.size > 0 && (
                      <span
                        onClick={e => {
                          e.stopPropagation()
                          setMetricsView('top')
                          const sel = watchlist.filter(w => selected.has(w.id))
                          onCalcMetricas ? onCalcMetricas(sel) : onCalcRankingAll && onCalcRankingAll(sel)
                        }}
                        title="Paso 1/3 · Calcula CAGR, Profit€, Win%, MaxDD, Ops para los activos seleccionados con la estrategia activa (fase 1) y con todas las estrategias habilitadas para determinar la Top estrategia (fase 2). Debe ejecutarse ANTES que ↻ Score métricas."
                        style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          width: 14, height: 14, borderRadius: 3,
                          background: 'rgba(26,107,58,0.18)', border: `1px solid #1a6b3a`,
                          color: '#1a6b3a', fontSize: 9, cursor: 'pointer', flexShrink: 0,
                        }}>↻</span>
                    )}
                    {calcPhase === 0 && !rankingRunning && !topStratRunning && selected.size > 0 && onDeleteMetrics && (
                      <span
                        onClick={e => { e.stopPropagation(); setConfirmMetricsDelete(true) }}
                        title={`Borrar TODAS las filas de ranking_results de los ${selected.size} activos seleccionados (todas las estrategias). Afecta a CAGR, Profit €, Win%, MaxDD y Ops.`}
                        style={{ cursor: 'pointer', fontSize: 11, lineHeight: 1, color: P.textMuted,
                          transition: 'color 0.15s', flexShrink: 0 }}
                        onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                        onMouseLeave={e => e.currentTarget.style.color = P.textMuted}>
                        🗑
                      </span>
                    )}
                  </div>
                )}
              </th>
              <th colSpan={onDeleteItem ? 3 : 2} style={{
                ...TH(),
                background: P.thBg,
                borderLeft: `2px solid ${P.borderStrong}`,
                borderBottom: `1px solid ${P.border}`,
              }} />
            </tr>

            {/* Headers de columna — cada th tiene position:sticky,top:32 via TH2() */}
            <tr>
              {/* Checkbox */}
              <th style={{ ...TH2(), width: 36, textAlign: 'center', padding: '7px 6px' }}>
                <input type="checkbox" checked={allSelected} onChange={toggleAll}
                  style={{ cursor: 'pointer', width: 14, height: 14 }} />
              </th>
              {/* Ticker */}
              <th style={{ ...TH2(), cursor: 'pointer', minWidth: 76 }}
                onClick={() => handleSort('symbol')}>
                Ticker{sortIcon('symbol')}
              </th>
              {/* Nombre */}
              <th style={{ ...TH2(), minWidth: 130, cursor: 'pointer' }}
                onClick={() => handleSort('name')}>
                Nombre{sortIcon('name')}
              </th>
              {/* Tipo */}
              <th style={{ ...TH2(), width: 80, textAlign: 'center', cursor: 'pointer' }}
                onClick={() => handleSort('tipo')}>
                Tipo{sortIcon('tipo')}
              </th>
              {/* Listas */}
              <th style={{ ...TH2(), minWidth: 110, borderRight: `2px solid ${P.borderStrong}` }}>
                Listas
              </th>

              {/* SCORE MÉTRICAS */}
              <th style={{ ...TH2(), minWidth: 80, textAlign: 'right',
                background: '#d4d0c8', borderLeft: `2px solid ${P.borderStrong}`, borderRight: `1px solid ${P.border}`,
                cursor: 'pointer' }}
                onClick={() => handleSort('scoreHistorico')}
                title="Score 0-100 basado en métricas históricas. Clic para ordenar.">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                  {rankingDoneFlash
                    ? <span style={{ color: '#1a6b3a', fontWeight: 700 }}>✓ Listo</span>
                    : rankingRunning
                      ? <span style={{ fontSize: 9 }}>Calculando {rankingProgress?.done ?? 0}/{rankingProgress?.total ?? 0}…</span>
                      : <>SCORE MÉTRICAS{sortIcon('scoreHistorico')}</>}
                  {!rankingRunning && !rankingDoneFlash && selected.size > 0 && (
                    <span
                      onClick={async e => {
                        e.stopPropagation()
                        setMetricsView('active')
                        const sel = watchlist.filter(w => selected.has(w.id))
                        if (onCalcScoreMetricas) {
                          const result = await onCalcScoreMetricas(sel)
                          if (result?.ok === false && result?.symbols?.length) {
                            setBlockingPopup({ message: 'Los siguientes activos no tienen métricas calculadas. Ejecuta primero ↻ Métricas.', symbols: result.symbols })
                          }
                        } else if (onCalcRanking) {
                          onCalcRanking(sel)
                        }
                      }}
                      title="Paso 2/3 · Calcula el Score métricas (0-100%) usando las métricas ya calculadas. NO ejecuta backtesting. Requiere ↻ Métricas previo."
                      style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: 16, height: 16, borderRadius: 3,
                        background: 'rgba(26,107,58,0.18)', border: `1px solid #1a6b3a`,
                        color: '#1a6b3a', fontSize: 10, cursor: 'pointer', flexShrink: 0,
                      }}>↻</span>
                  )}
                </div>
              </th>

              {/* SCORE MÉT.+SEÑ. */}
              <th style={{ ...TH2(), minWidth: 88, textAlign: 'right',
                background: '#d4d0c8', borderLeft: `1px solid ${P.border}`, borderRight: `2px solid ${P.borderStrong}`,
                cursor: 'pointer' }}
                onClick={() => handleSort('scoreCompleto')}
                title="Score 0-100 que combina métricas históricas + señales de mercado. Clic para ordenar.">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                  {rankingDoneFlash
                    ? <span style={{ color: '#1a6b3a', fontWeight: 700 }}>✓ Listo</span>
                    : rankingRunning
                      ? <span style={{ fontSize: 9 }}>Calculando {rankingProgress?.done ?? 0}/{rankingProgress?.total ?? 0}…</span>
                      : <>SCORE MÉT.+SEÑ.{sortIcon('scoreCompleto')}</>}
                  {!rankingRunning && !rankingDoneFlash && selected.size > 0 && (
                    <span
                      onClick={async e => {
                        e.stopPropagation()
                        setMetricsView('active')
                        const sel = watchlist.filter(w => selected.has(w.id))
                        if (onCalcScoreMetSen) {
                          const result = await onCalcScoreMetSen(sel)
                          if (result?.ok === false && result?.symbols?.length) {
                            setBlockingPopup({ message: 'Los siguientes activos no tienen Score métricas. Ejecuta primero ↻ Score métricas.', symbols: result.symbols })
                          }
                        } else if (onCalcRanking) {
                          onCalcRanking(sel)
                        }
                      }}
                      title="Paso 3/3 · Añade señales de mercado actuales (momentum, fuerza relativa SP500, proximidad máx. 52s) al Score métricas. Requiere ↻ Score métricas previo."
                      style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: 16, height: 16, borderRadius: 3,
                        background: 'rgba(26,107,58,0.18)', border: `1px solid #1a6b3a`,
                        color: '#1a6b3a', fontSize: 10, cursor: 'pointer', flexShrink: 0,
                      }}>↻</span>
                  )}
                </div>
              </th>

              {/* Métricas de favorita */}
              {[
                ['cagr',    'CAGR%',  false],
                ['profit',  'PROFIT €', false],
                ['winRate', 'Win%',   false],
                ['maxDD',   'MaxDD%', false],
                ['trades',  'Ops',    true],
              ].map(([metric, label, isLast]) => (
                <th key={metric} onClick={() => handleSort(metric)}
                  title={metric === 'profit' ? 'Ganancia/pérdida simple total acumulada en € con esta estrategia sobre este activo.\nCalculado con capital inicial de 10.000€ en modo Simple (sin reinversión).\nUn CAGR alto con Profit bajo puede indicar pocas operaciones o período corto.' : undefined}
                  style={{
                    ...TH2(),
                    cursor: 'pointer', textAlign: 'right',
                    background: '#d4cfc5',
                    borderLeft:  metric === 'cagr'   ? `2px solid ${P.borderStrong}` : `1px solid ${P.border}`,
                    borderRight: isLast ? `2px solid ${P.borderStrong}` : `1px solid ${P.border}`,
                    minWidth: metric === 'profit' ? 82 : 68,
                  }}>
                  {label}{sortIcon(metric)}
                </th>
              ))}

              {/* Estrategia (nombre) — sortable, título dinámico según toggle */}
              <th style={{ ...TH2(), minWidth: 130, borderLeft: `2px solid ${P.borderStrong}`, cursor: 'pointer' }}
                onClick={() => handleSort('stratName')}>
                {metricsView === 'active' ? 'ESTRATEGIA ACTIVA' : 'TOP ESTRATEGIA'}{sortIcon('stratName')}
              </th>
              {/* Temporalidad — sortable */}
              <th style={{ ...TH2(), minWidth: 80, textAlign: 'center', cursor: 'pointer' }}
                onClick={() => handleSort('intervalo')}
                title="Temporalidad con la que se abrieron los gráficos al calcular el ranking para este activo con la estrategia seleccionada. Corresponde a la temporalidad definida en cada estrategia.">
                Temporalidad{sortIcon('intervalo')}
              </th>
              {/* Eliminar */}
              {onDeleteItem && (
                <th style={{ ...TH2(), width: 42, textAlign: 'center' }}>Elim.</th>
              )}
            </tr>
          </thead>
          </table>
        </div>

        {/* TABLA 2 — Body con scroll vertical y horizontal */}
        <div ref={bodyScrollRef}
          style={{ flex: 1, minHeight: 0, height: 0, overflowY: 'auto', overflowX: 'auto', background: P.bg }}
          onScroll={e => { if (headerScrollRef.current) headerScrollRef.current.scrollLeft = e.currentTarget.scrollLeft }}>
          <table style={tblStyle}>
            {colGroup}
          <tbody>
            {sorted.map((w, idx) => {
              const sym        = (w.symbol || '').toUpperCase()
              const isSaving   = saving.has(w.id)
              const isSelected = selected.has(w.id)
              const isOdd      = idx % 2 === 1
              const bg         = rowBg(w, isSelected, isOdd)
              const datos      = wlData?.[sym]?.[metricsView] || {}
              const displayM   = { cagr: datos.cagr, profit: datos.profit, winRate: datos.winRate, maxDD: datos.maxDD, trades: datos.ops }
              const displayStratName = datos.stratName || null
              const displayIntervalo = datos.intervalo || 'diario'

              return (
                <tr key={w.id || w.symbol}
                  style={{ background: bg, opacity: isSaving ? 0.5 : 1, transition: 'background 0.1s', cursor: onEditItem ? 'pointer' : 'default' }}
                  onClick={() => onEditItem && onEditItem(w)}
                  onMouseOver={e => { if (!isSelected) e.currentTarget.style.background = P.hover }}
                  onMouseOut={e  => { e.currentTarget.style.background = bg }}>

                  {/* Checkbox */}
                  <td style={{ ...TD(), textAlign: 'center', padding: '5px 6px', width: 36 }} onClick={e => e.stopPropagation()}>
                    <input type="checkbox" checked={isSelected} onChange={() => toggleOne(w.id)}
                      style={{ cursor: 'pointer', width: 14, height: 14 }} />
                  </td>

                  {/* Ticker */}
                  <td style={{ ...TD(), fontWeight: 700, color: P.text, whiteSpace: 'nowrap' }}>
                    {w.symbol}
                  </td>

                  {/* Nombre */}
                  <td style={{
                    ...TD(), color: P.textSec, maxWidth: 180,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }} title={w.name}>
                    {w.name}
                  </td>

                  {/* Tipo */}
                  {(()=>{
                    const tipo = getAssetType(w.symbol)
                    const ts   = TYPE_STYLE[tipo] || TYPE_STYLE['Acción']
                    return (
                      <td style={{ ...TD(), textAlign: 'center', width: 80 }}>
                        <span style={{
                          fontSize: 10, padding: '2px 6px', borderRadius: 4,
                          background: ts.bg, color: ts.color,
                          border: `1px solid ${ts.border}`,
                          whiteSpace: 'nowrap', display: 'inline-block',
                        }}>
                          {tipo}
                        </span>
                      </td>
                    )
                  })()}

                  {/* Listas — chips editables */}
                  <td style={{ ...TD(), borderRight: `2px solid ${P.borderStrong}`, overflow: 'hidden', whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>
                    <div style={{ display: 'flex', flexWrap: 'nowrap', gap: 4, alignItems: 'center', overflow: 'hidden' }}>
                      {(w.list_ids || []).map(lid => {
                        const lname = wlLists.find(l => l.id === lid)?.name
                        if (!lname) return null
                        return (
                          <span key={lid} style={{
                            background: '#e8e0d0', border: `1px solid ${P.border}`,
                            color: P.text, fontFamily: MONO, fontSize: 11,
                            padding: '2px 7px', borderRadius: 4,
                            display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap',
                          }}>
                            {lname}
                            <span onClick={() => removeFromList(w, lid)}
                              style={{ cursor: 'pointer', color: P.textMuted, fontSize: 10, fontWeight: 700 }}
                              title={`Quitar de "${lname}"`}>×</span>
                          </span>
                        )
                      })}
                      {/* Botón + añadir a lista */}
                      <div style={{ position: 'relative' }} ref={addDropOpen === w.id ? addDropRef : null}>
                        <span onClick={() => setAddDropOpen(prev => prev === w.id ? null : w.id)}
                          style={{
                            cursor: 'pointer', color: P.textMuted, fontSize: 18,
                            lineHeight: 1, padding: '0 3px', userSelect: 'none', fontWeight: 300,
                          }}
                          title="Añadir a lista">+</span>
                        {addDropOpen === w.id && (
                          <div style={{
                            position: 'absolute', left: 0, top: '100%', zIndex: 200, marginTop: 2,
                            background: P.bg, border: `1px solid ${P.borderStrong}`, borderRadius: 6,
                            boxShadow: '0 4px 12px rgba(0,0,0,0.1)', minWidth: 150, padding: '4px 0',
                          }}>
                            {wlLists.filter(l => !(w.list_ids || []).includes(l.id)).map(l => (
                              <div key={l.id} onClick={() => addToList(w, l.id)}
                                style={{ padding: '6px 12px', fontFamily: MONO, fontSize: 12, color: P.text, cursor: 'pointer' }}
                                onMouseOver={e => e.currentTarget.style.background = P.hover}
                                onMouseOut={e  => e.currentTarget.style.background = 'transparent'}>
                                {l.name}
                              </div>
                            ))}
                            {wlLists.filter(l => !(w.list_ids || []).includes(l.id)).length === 0 && (
                              <div style={{ padding: '6px 12px', fontFamily: MONO, fontSize: 11, color: P.textMuted }}>
                                Ya en todas las listas
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Score histórico + indicador cobertura de estrategias */}
                  {(()=>{
                    const sh = datos.scoreMetricas ?? null
                    // Cobertura: cuántas estrategias habilitadas tienen métricas completas para este activo
                    const enabledStrats = strategies.filter(s => s.enabled !== false)
                    const stratsWithData = enabledStrats.filter(s => {
                      const d = allRankings[s.id]?.[sym]
                      return d != null && d.cagr != null && d.winRate != null && d.maxDD != null
                    })
                    const coverageCount = stratsWithData.length
                    const coverageTotal = enabledStrats.length
                    const isPartial = metricsView === 'top' && coverageTotal > 0 && coverageCount > 0 && coverageCount < coverageTotal
                    const missingNames = isPartial
                      ? enabledStrats.filter(s => !allRankings[s.id]?.[sym] || allRankings[s.id][sym].cagr == null).map(s => s.name).join(', ')
                      : ''
                    const coverageTip = isPartial
                      ? `Score calculado con ${coverageCount} de ${coverageTotal} estrategias habilitadas.\nFaltan: ${missingNames}\nEjecuta el header ↻ para calcular las que faltan`
                      : undefined
                    const shColor = isPartial ? '#b87a20' : scoreFg(sh)
                    return (
                      <td title={coverageTip} style={{
                        ...TD(), textAlign: 'right', fontWeight: 600,
                        borderLeft: `2px solid ${P.borderStrong}`, borderRight: `1px solid ${P.border}`,
                        color: shColor,
                      }}>
                        {sh != null
                          ? <>{fmt(sh, 1)}%{isPartial && <span style={{ marginLeft: 2, fontSize: 9 }}>⚠</span>}</>
                          : <span style={{ color: P.textMuted }}>—</span>}
                      </td>
                    )
                  })()}

                  {/* Score completo — guardado en DB, con indicador de antigüedad */}
                  {(()=>{
                    const sc = datos.scoreMetSeñ ?? null
                    const scTs = datos.updatedAt ?? null
                    const daysSince = scTs ? Math.floor((Date.now() - new Date(scTs)) / 86400000) : null
                    const isStale = sc != null && daysSince != null && daysSince >= 1
                    const staleTooltip = isStale
                      ? `Dato de hace ${daysSince} día${daysSince > 1 ? 's' : ''} · Ejecuta Ranking para actualizar`
                      : undefined
                    return (
                      <td title={staleTooltip} style={{
                        ...TD(), textAlign: 'right', fontWeight: 600,
                        borderLeft: `1px solid ${P.border}`, borderRight: `2px solid ${P.borderStrong}`,
                        color: isStale ? '#f59e0b' : scoreFg(sc),
                      }}>
                        {sc != null
                          ? <>{fmt(sc, 1)}%{isStale && <span style={{ marginLeft: 2, fontSize: 10 }}>⚠</span>}</>
                          : <span style={{ color: P.textMuted }}>—</span>}
                      </td>
                    )
                  })()}

                  {/* CAGR */}
                  <td style={{
                    ...TD(), background: cagrBg(displayM?.cagr), color: cagrFg(displayM?.cagr),
                    textAlign: 'right', fontWeight: 600,
                    borderLeft: `2px solid ${P.borderStrong}`, borderRight: `1px solid ${P.border}`,
                  }}>
                    {displayM?.cagr != null ? `${fmt(displayM.cagr, 1)}%`
                      : <span style={{ color: P.textMuted }}>—</span>}
                  </td>

                  {/* PROFIT € */}
                  {(()=>{
                    const pv = displayM?.profit ?? null
                    const pColor = pv == null ? P.textMuted : pv >= 0 ? '#1a5c30' : '#8b1a1a'
                    const pFmt = pv == null ? null : (pv >= 0 ? '+' : '') + fmt(pv, 0) + ' €'
                    return (
                      <td title="Ganancia/pérdida simple total acumulada en € con esta estrategia sobre este activo · modo Simple (sin reinversión)"
                        style={{ ...TD(), textAlign: 'right', fontWeight: 600, borderRight: `1px solid ${P.border}`, color: pColor }}>
                        {pFmt ? pFmt : <span style={{ color: P.textMuted }}>—</span>}
                      </td>
                    )
                  })()}

                  {/* WinRate */}
                  <td style={{
                    ...TD(), color: wrFg(displayM?.winRate),
                    textAlign: 'right', fontWeight: 600, borderRight: `1px solid ${P.border}`,
                  }}>
                    {displayM?.winRate != null ? `${fmt(displayM.winRate, 0)}%`
                      : <span style={{ color: P.textMuted }}>—</span>}
                  </td>

                  {/* MaxDD */}
                  <td style={{
                    ...TD(), background: ddBg(displayM?.maxDD), color: ddFg(displayM?.maxDD),
                    textAlign: 'right', fontWeight: 600, borderRight: `1px solid ${P.border}`,
                  }}>
                    {displayM?.maxDD != null ? `-${fmt(Math.abs(displayM.maxDD), 1)}%`
                      : <span style={{ color: P.textMuted }}>—</span>}
                  </td>

                  {/* Ops */}
                  <td style={{
                    ...TD(), color: P.textSec, textAlign: 'right',
                    borderRight: `2px solid ${P.borderStrong}`,
                  }}>
                    {displayM?.trades != null ? Math.round(displayM.trades)
                      : <span style={{ color: P.textMuted }}>—</span>}
                  </td>

                  {/* Estrategia — nombre truncado con tooltip */}
                  <td style={{
                    ...TD(), borderLeft: `2px solid ${P.borderStrong}`,
                    maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }} title={displayStratName || undefined}>
                    {displayStratName
                      ? <span style={{ color: P.text, fontWeight: 600 }}>{displayStratName}</span>
                      : <span style={{ color: P.textMuted }}>—</span>}
                  </td>

                  {/* Temporalidad — badge coloreado */}
                  <td style={{ ...TD(), textAlign: 'center' }}>
                    {(displayStratName || displayM) ? (
                      <span style={{
                        ...(displayIntervalo === 'semanal' ? P.badgeSemanal : P.badgeDiario),
                        fontFamily: MONO, fontSize: 10,
                        padding: '2px 7px', borderRadius: 4,
                        display: 'inline-block',
                        border: `1px solid ${displayIntervalo === 'semanal' ? P.badgeSemanal.border : P.badgeDiario.border}`,
                      }}>
                        {displayIntervalo === 'semanal' ? 'Semanal' : 'Diario'}
                      </span>
                    ) : <span style={{ color: P.textMuted }}>—</span>}
                  </td>

                  {/* Eliminar — stop propagation para no abrir editor */}
                  {onDeleteItem && (
                    <td style={{ ...TD(), textAlign: 'center', width: 42 }} onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => {
                          if (confirm(`¿Eliminar "${w.symbol}"?\nEsta acción no se puede deshacer.`))
                            onDeleteItem(w.id)
                        }}
                        title="Eliminar activo (requiere confirmación)"
                        style={{ background: 'transparent', border: '1px solid #ef4444', color: '#ef4444',
                          fontFamily: MONO, fontSize: 13, padding: '2px 6px', borderRadius: 3, cursor: 'pointer',
                          lineHeight: 1, transition: 'background 0.15s, color 0.15s' }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#dc2626'; e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = '#dc2626' }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.borderColor = '#ef4444' }}>
                        🗑
                      </button>
                    </td>
                  )}
                </tr>
              )
            })}

            {sorted.length === 0 && (
              <tr>
                <td colSpan={onDeleteItem ? 15 : 14}
                  style={{ ...TD(), textAlign: 'center', color: P.textMuted, padding: '32px' }}>
                  Sin activos para los filtros aplicados
                </td>
              </tr>
            )}
          </tbody>
          </table>
        </div>
        </>)
      })()}
    </div>
  )
}
