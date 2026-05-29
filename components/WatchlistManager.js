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
  let url = `${getSupaUrl()}/rest/v1/ranking_results?select=symbol,strategy_id,score,score_historico,score_completo,updated_at,win_rate,cagr_simple,max_drawdown,total_trades,rank_position&limit=10000`
  let res = await fetch(url, { headers: getSupaH() })
  if (!res.ok) {
    // Fallback nivel 1: sin score_completo y updated_at
    url = `${getSupaUrl()}/rest/v1/ranking_results?select=symbol,strategy_id,score,score_historico,win_rate,cagr_simple,max_drawdown,total_trades,rank_position&limit=10000`
    res = await fetch(url, { headers: getSupaH() })
  }
  if (!res.ok) {
    // Fallback nivel 2: sin score_historico
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
  const [metricsView, setMetricsView]   = useState('top') // 'active' | 'top'
  const addDropRef    = useRef(null)
  const listFilterRef = useRef(null)

  // ── Load all ranking data on mount ────────────────────────
  useEffect(() => {
    setLoadingRank(true)
    loadAllRankingsWithMetrics().then(rows => {
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
          score:          r.score,
          scoreHistorico: r.score_historico ?? null,
          scoreCompleto:  r.score_completo  ?? null,
          updatedAt:      r.updated_at      ?? null,
        }
      })
      setAllRankings(map)
    }).catch(() => {}).finally(() => setLoadingRank(false))
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
  const STR_METRICS = ['symbol', 'name', 'stratName', 'intervalo']
  const SCORE_METRICS = ['scoreHistorico', 'scoreCompleto']
  const sorted = [...filtered].sort((a, b) => {
    const { metric, dir } = sortState
    const cmp    = (va, vb) => dir === 'asc' ? va - vb : vb - va
    const cmpStr = (sa, sb) => dir === 'asc' ? sa.localeCompare(sb) : sb.localeCompare(sa)
    if (metric === 'symbol') return cmpStr(a.symbol || '', b.symbol || '')
    if (metric === 'name')   return cmpStr(a.name   || '', b.name   || '')
    if (SCORE_METRICS.includes(metric)) {
      const symA = (a.symbol || '').toUpperCase(), symB = (b.symbol || '').toUpperCase()
      const va = rankingData?.[symA]?.[metric] ?? (dir === 'asc' ? Infinity : -Infinity)
      const vb = rankingData?.[symB]?.[metric] ?? (dir === 'asc' ? Infinity : -Infinity)
      return cmp(va, vb)
    }
    const ba = bestForSymbol(a.symbol || '')
    const bb = bestForSymbol(b.symbol || '')
    if (metric === 'stratName') return cmpStr(ba?.stratName || '', bb?.stratName || '')
    if (metric === 'intervalo') return cmpStr(ba?.intervalo || '', bb?.intervalo || '')
    const va = ba?.metrics?.[metric] ?? (dir === 'asc' ? Infinity : -Infinity)
    const vb = bb?.metrics?.[metric] ?? (dir === 'asc' ? Infinity : -Infinity)
    return cmp(va, vb)
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
    zIndex: 5,
    whiteSpace: 'nowrap',
    userSelect: 'none',
    ...extra,
  })
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
      position: 'absolute', inset: 0, zIndex: 20,
      background: P.bg,
      display: 'flex', flexDirection: 'column',
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
          ⊞ Gestionar
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

        {/* GROUP 1: Ranking */}
        <div style={{ display: 'inline-flex', gap: 2, flexShrink: 0 }}>
          <button
            onClick={() => onCalcRanking && onCalcRanking()}
            disabled={rankingRunning}
            title="Calcula el score de cada activo con la estrategia activa y reordena la lista según los criterios configurados en Ajustes → Ranking"
            style={{
              background: rankingRunning ? P.bgAlt : P.accentBg,
              border: `1px solid ${rankingRunning ? P.borderStrong : P.accentBg}`,
              color: rankingRunning ? P.textSec : P.accentFg,
              fontFamily: MONO, fontSize: 11,
              padding: '5px 10px', borderRadius: 5,
              cursor: rankingRunning ? 'not-allowed' : 'pointer',
              whiteSpace: 'nowrap',
            }}>
            {rankingRunning
              ? `⟳ ${rankingProgress?.done ?? 0}/${rankingProgress?.total ?? 0}`
              : '🏆 Ranking'}
          </button>
          {hasRanking && !rankingRunning && (
            <button
              onClick={() => onClearRanking && onClearRanking()}
              title="Borrar ranking calculado y volver al orden alfabético"
              style={{
                background: 'transparent',
                border: `1px solid ${P.borderStrong}`,
                color: P.textMuted,
                fontFamily: MONO, fontSize: 11,
                padding: '5px 7px', borderRadius: 5,
                cursor: 'pointer',
              }}
              onMouseOver={e => { e.currentTarget.style.color = '#8b3030'; e.currentTarget.style.borderColor = '#8b3030' }}
              onMouseOut={e  => { e.currentTarget.style.color = P.textMuted;  e.currentTarget.style.borderColor = P.borderStrong }}>
              🗑
            </button>
          )}
        </div>

        {/* GROUP 2: Top estrategia */}
        <div style={{ display: 'inline-flex', gap: 2, flexShrink: 0 }}>
          <button
            onClick={() => !topStratRunning && onCalcRankingAll && onCalcRankingAll()}
            disabled={topStratRunning}
            title={topStratRunning ? `Calculando ranking para todas las estrategias… ${topStratProgress?.current||0}/${topStratProgress?.total||0}` : 'Calcula el Ranking con TODAS las estrategias disponibles y determina cuál obtiene mejor score histórico para cada activo'}
            style={{
              background: topStratRunning ? P.bg : P.accentBg,
              border: `1px solid ${topStratRunning ? P.borderStrong : P.accentBg}`,
              color: topStratRunning ? P.textMuted : P.accentFg,
              fontFamily: MONO, fontSize: 11,
              padding: '5px 10px', borderRadius: 5,
              cursor: topStratRunning ? 'default' : 'pointer',
              whiteSpace: 'nowrap',
              opacity: topStratRunning ? 0.7 : 1,
            }}>
            {topStratRunning
              ? `⟳ Calculando ${topStratProgress?.current||0}/${topStratProgress?.total||0} estrategias…`
              : '🎯 Top estrategia'}
          </button>
          {hasBestStrat && (
            <button
              onClick={() => onClearBestStrat && onClearBestStrat()}
              title="Borrar los datos de Top estrategia calculados"
              style={{
                background: 'transparent',
                border: `1px solid ${P.borderStrong}`,
                color: P.textMuted,
                fontFamily: MONO, fontSize: 11,
                padding: '5px 7px', borderRadius: 5,
                cursor: 'pointer',
              }}
              onMouseOver={e => { e.currentTarget.style.color = '#8b3030'; e.currentTarget.style.borderColor = '#8b3030' }}
              onMouseOut={e  => { e.currentTarget.style.color = P.textMuted;  e.currentTarget.style.borderColor = P.borderStrong }}>
              🗑
            </button>
          )}
        </div>

        {/* Separador visual */}
        <div style={{ width: 1, height: 20, background: P.border, flexShrink: 0 }} />

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

      {/* ── Tabla ── */}
      <div style={{ flex: 1, overflow: 'auto', background: P.bg }}>
        <table style={{ borderCollapse: 'collapse', minWidth: '100%', tableLayout: 'auto' }}>
          <thead>
            {/* Sub-header agrupador de métricas */}
            <tr>
              <th colSpan={4} style={{ ...TH(), background: P.thBg, borderBottom: `1px solid ${P.border}` }} />
              <th colSpan={2} style={{
                ...TH(),
                background: '#d4d0c8',
                borderLeft:  `2px solid ${P.borderStrong}`,
                borderRight: `1px solid ${P.border}`,
                textAlign: 'center', color: P.thFg, fontSize: 10,
                borderBottom: `1px solid ${P.border}`,
              }}>
                Scores
              </th>
              <th colSpan={4} style={{
                ...TH(),
                background: '#d8d2c8',
                borderLeft:  `2px solid ${P.borderStrong}`,
                borderRight: `2px solid ${P.borderStrong}`,
                textAlign: 'center', color: P.thFg, fontSize: 10,
                cursor: 'default',
              }}
                title={metricsView === 'active' ? 'Métricas de la estrategia actualmente activa para cada activo. Ejecuta Ranking para calcularlas o actualizarlas' : 'Métricas de la estrategia con mejor score histórico para cada activo entre todas las evaluadas. Puede ser diferente a la estrategia activa'}>
                {metricsView === 'active' ? (rankingStratName ? `Métricas · ${rankingStratName}` : 'Métricas estrategia activa') : 'Métricas top estrategia'}
              </th>
              <th colSpan={2} style={{
                ...TH(),
                background: P.thBg,
                borderLeft: `2px solid ${P.borderStrong}`,
                borderBottom: `1px solid ${P.border}`,
              }} />
            </tr>

            {/* Headers de columna */}
            <tr>
              {/* Checkbox */}
              <th style={{ ...TH(), width: 36, textAlign: 'center', padding: '7px 6px' }}>
                <input type="checkbox" checked={allSelected} onChange={toggleAll}
                  style={{ cursor: 'pointer', width: 14, height: 14 }} />
              </th>
              {/* Ticker */}
              <th style={{ ...TH(), cursor: 'pointer', minWidth: 76 }}
                onClick={() => handleSort('symbol')}>
                Ticker{sortIcon('symbol')}
              </th>
              {/* Nombre */}
              <th style={{ ...TH(), minWidth: 130, cursor: 'pointer' }}
                onClick={() => handleSort('name')}>
                Nombre{sortIcon('name')}
              </th>
              {/* Listas */}
              <th style={{ ...TH(), minWidth: 110, borderRight: `2px solid ${P.borderStrong}` }}>
                Listas
              </th>

              {/* SCORE MÉTRICAS */}
              <th style={{ ...TH(), minWidth: 80, cursor: 'pointer', textAlign: 'right',
                background: '#d4d0c8', borderLeft: `2px solid ${P.borderStrong}`, borderRight: `1px solid ${P.border}` }}
                onClick={() => handleSort('scoreHistorico')}
                title="Score 0-100 basado en métricas históricas (Win Rate, CAGR, CAGR robusto, MaxDD). Se guarda en Supabase y está disponible al cargar la app sin necesidad de ejecutar Ranking">
                SCORE MÉTRICAS{sortIcon('scoreHistorico')}
              </th>

              {/* SCORE MÉT.+SEÑ. */}
              <th style={{ ...TH(), minWidth: 88, cursor: 'pointer', textAlign: 'right',
                background: '#d4d0c8', borderLeft: `1px solid ${P.border}`, borderRight: `2px solid ${P.borderStrong}` }}
                onClick={() => handleSort('scoreCompleto')}
                title="Score 0-100 que combina métricas históricas + condiciones actuales del mercado (momentum, fuerza relativa vs SP500, proximidad a máximo 52 semanas). Solo disponible tras ejecutar Ranking — usa Score métricas como fallback">
                SCORE MÉT.+SEÑ.{sortIcon('scoreCompleto')}
              </th>

              {/* Métricas de favorita */}
              {[
                ['cagr',    'CAGR%'],
                ['winRate', 'Win%'],
                ['maxDD',   'MaxDD%'],
                ['trades',  'Ops'],
              ].map(([metric, label]) => (
                <th key={metric} onClick={() => handleSort(metric)}
                  style={{
                    ...TH(),
                    cursor: 'pointer', textAlign: 'right',
                    background: '#d4cfc5',
                    borderLeft:  metric === 'cagr'   ? `2px solid ${P.borderStrong}` : `1px solid ${P.border}`,
                    borderRight: metric === 'trades' ? `2px solid ${P.borderStrong}` : `1px solid ${P.border}`,
                    minWidth: 68,
                  }}>
                  {label}{sortIcon(metric)}
                </th>
              ))}

              {/* Estrategia (nombre) — sortable */}
              <th style={{ ...TH(), minWidth: 130, borderLeft: `2px solid ${P.borderStrong}`, cursor: 'pointer' }}
                onClick={() => handleSort('stratName')}>
                Estrategia{sortIcon('stratName')}
              </th>
              {/* Temporalidad — sortable */}
              <th style={{ ...TH(), minWidth: 80, textAlign: 'center', cursor: 'pointer' }}
                onClick={() => handleSort('intervalo')}>
                Temporalidad{sortIcon('intervalo')}
              </th>
            </tr>
          </thead>

          <tbody>
            {sorted.map((w, idx) => {
              const sym        = (w.symbol || '').toUpperCase()
              const isSaving   = saving.has(w.id)
              const isSelected = selected.has(w.id)
              const isOdd      = idx % 2 === 1
              const best       = bestForSymbol(sym)
              const m          = best?.metrics
              const bg         = rowBg(w, isSelected, isOdd)
              const activeM    = rankingData?.[sym]?.metrics
              const displayM   = metricsView === 'active' ? activeM : m
              const displayStratName = metricsView === 'active' ? (rankingStratName || null) : (best?.stratName || null)
              const displayIntervalo = metricsView === 'active' ? rankingIntervalo : (best?.intervalo || 'diario')

              return (
                <tr key={w.id || w.symbol}
                  style={{ background: bg, opacity: isSaving ? 0.5 : 1, transition: 'background 0.1s' }}
                  onMouseOver={e => { if (!isSelected) e.currentTarget.style.background = P.hover }}
                  onMouseOut={e  => { e.currentTarget.style.background = bg }}>

                  {/* Checkbox */}
                  <td style={{ ...TD(), textAlign: 'center', padding: '5px 6px', width: 36 }}>
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

                  {/* Listas — chips editables */}
                  <td style={{ ...TD(), borderRight: `2px solid ${P.borderStrong}` }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
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

                  {/* Score histórico */}
                  {(()=>{
                    const sh = metricsView === 'active'
                      ? rankingData?.[sym]?.scoreHistorico
                      : (best?.scoreHistorico ?? null)
                    return (
                      <td style={{
                        ...TD(), textAlign: 'right', fontWeight: 600,
                        borderLeft: `2px solid ${P.borderStrong}`, borderRight: `1px solid ${P.border}`,
                        color: scoreFg(sh),
                      }}>
                        {sh != null ? fmt(sh, 1) + '%' : <span style={{ color: P.textMuted }}>—</span>}
                      </td>
                    )
                  })()}

                  {/* Score completo — guardado en DB, con indicador de antigüedad */}
                  {(()=>{
                    const sc = metricsView === 'active'
                      ? rankingData?.[sym]?.scoreCompleto
                      : (best?.scoreCompleto ?? null)
                    const scTs = metricsView === 'active'
                      ? rankingData?.[sym]?.updatedAt
                      : (best?.updatedAt ?? null)
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
                </tr>
              )
            })}

            {sorted.length === 0 && (
              <tr>
                <td colSpan={12}
                  style={{ ...TD(), textAlign: 'center', color: P.textMuted, padding: '32px' }}>
                  Sin activos para los filtros aplicados
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
