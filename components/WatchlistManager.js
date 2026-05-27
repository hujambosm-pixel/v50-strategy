import { useState, useEffect, useCallback, useRef } from 'react'
import { MONO } from '../lib/utils'
import { getSupaUrl, getSupaH } from '../lib/supabase'

// ── Supabase helpers (mirrored from index.js) ────────────────
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
  const url = `${getSupaUrl()}/rest/v1/ranking_results?select=symbol,strategy_id,score,win_rate,cagr_simple,max_drawdown,total_trades,rank_position&limit=10000`
  const res = await fetch(url, { headers: getSupaH() })
  if (!res.ok) return []
  return (await res.json()) || []
}

// ── Color helpers ────────────────────────────────────────────
const cagrBg = v => {
  if (v == null) return 'transparent'
  if (v > 15)  return 'rgba(0,180,80,0.25)'
  if (v > 5)   return 'rgba(0,180,80,0.13)'
  if (v > 0)   return 'rgba(0,180,80,0.06)'
  return 'rgba(255,60,60,0.15)'
}
const cagrFg = v => v == null ? '#8aadcc' : v >= 0 ? '#00e5a0' : '#ff4d6d'
const ddBg   = v => {
  if (v == null) return 'transparent'
  const abs = Math.abs(v)
  if (abs > 30) return 'rgba(255,60,60,0.22)'
  if (abs > 15) return 'rgba(255,60,60,0.10)'
  return 'transparent'
}
const wrFg   = v => v == null ? '#8aadcc' : v >= 50 ? '#00e5a0' : '#ff4d6d'

const STRAT_COLORS = ['#00d4ff','#ffd166','#06d6a0','#ff6b6b','#a29bfe','#fd79a8','#74b9ff','#55efc4']

// ── Main component ───────────────────────────────────────────
export default function WatchlistManager({
  watchlist,
  rankingData,
  bestStratBySymbol,
  strategies,
  wlLists,
  onReload,
  onClose,
}) {
  const [allRankings, setAllRankings]   = useState({}) // {stratId: {SYM: metrics}}
  const [loadingRank, setLoadingRank]   = useState(true)
  const [selected, setSelected]         = useState(new Set())
  const [sortState, setSortState]       = useState({ stratId: null, metric: 'cagr', dir: 'desc' })
  const [filterSearch, setFilterSearch] = useState('')
  const [filterLists, setFilterLists]   = useState([])
  const [bulkMoveList, setBulkMoveList] = useState('')
  const [bulkAddList, setBulkAddList]   = useState('')
  const [saving, setSaving]             = useState(new Set()) // itemIds being saved
  const [addDropOpen, setAddDropOpen]   = useState(null)      // itemId whose + dropdown is open
  const addDropRef = useRef(null)

  // ── Load all ranking metrics on mount ──────────────────────
  useEffect(() => {
    setLoadingRank(true)
    loadAllRankingsWithMetrics().then(rows => {
      const map = {}
      rows.forEach(r => {
        const sid = r.strategy_id || '__null__'
        const sym = (r.symbol || '').toUpperCase()
        if (!map[sid]) map[sid] = {}
        map[sid][sym] = {
          cagr:    r.cagr_simple,
          winRate: r.win_rate,
          maxDD:   r.max_drawdown,
          trades:  r.total_trades,
          score:   r.score,
          rank:    r.rank_position,
        }
      })
      setAllRankings(map)
      // default sort by active strat if available
      const activeId = Object.keys(map)[0] || null
      if (activeId) setSortState(s => s.stratId ? s : { ...s, stratId: activeId })
    }).catch(() => {}).finally(() => setLoadingRank(false))
  }, [])

  // ── Close + dropdown on outside click ─────────────────────
  useEffect(() => {
    const handler = e => {
      if (addDropRef.current && !addDropRef.current.contains(e.target)) {
        setAddDropOpen(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // ── Strategy columns (only those with ranking data) ────────
  const stratCols = strategies.filter(s => allRankings[s.id])
  const stratColsWithNull = allRankings['__null__']
    ? [...stratCols, { id: '__null__', name: 'Sin estrategia' }]
    : stratCols

  // ── Filter + sort watchlist ────────────────────────────────
  const filtered = watchlist.filter(w => {
    const matchSearch = !filterSearch ||
      (w.symbol || '').toLowerCase().includes(filterSearch.toLowerCase()) ||
      (w.name   || '').toLowerCase().includes(filterSearch.toLowerCase())
    const matchList = filterLists.length === 0 ||
      filterLists.some(lid => (w.list_ids || []).includes(lid))
    return matchSearch && matchList
  })

  const sorted = [...filtered].sort((a, b) => {
    const { stratId, metric, dir } = sortState
    if (!stratId) {
      return (a.symbol || '').localeCompare(b.symbol || '')
    }
    const ra = allRankings[stratId]?.[(a.symbol || '').toUpperCase()]
    const rb = allRankings[stratId]?.[(b.symbol || '').toUpperCase()]
    const va = ra?.[metric] ?? (dir === 'asc' ? Infinity : -Infinity)
    const vb = rb?.[metric] ?? (dir === 'asc' ? Infinity : -Infinity)
    return dir === 'asc' ? va - vb : vb - va
  })

  // ── Selection helpers ──────────────────────────────────────
  const allSelected = sorted.length > 0 && sorted.every(w => selected.has(w.id))
  const toggleAll   = () => {
    if (allSelected) setSelected(new Set())
    else setSelected(new Set(sorted.map(w => w.id)))
  }
  const toggleOne   = id => setSelected(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  // ── Sort click ─────────────────────────────────────────────
  const handleSort = (stratId, metric) => {
    setSortState(prev =>
      prev.stratId === stratId && prev.metric === metric
        ? { stratId, metric, dir: prev.dir === 'desc' ? 'asc' : 'desc' }
        : { stratId, metric, dir: 'desc' }
    )
  }
  const sortIcon = (stratId, metric) => {
    if (sortState.stratId !== stratId || sortState.metric !== metric) return ' ↕'
    return sortState.dir === 'desc' ? ' ↓' : ' ↑'
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
    const newIds = [...(item.list_ids || []), listId]
    setSaving(prev => new Set([...prev, item.id]))
    try { await _setItemLists(item.id, newIds); onReload() }
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
      onReload()
      setSelected(new Set())
    } catch (e) { console.error(e) }
    finally { setSaving(new Set()) }
  }
  const bulkAdd = async () => {
    if (!bulkAddList || selected.size === 0) return
    const items = watchlist.filter(w => selected.has(w.id))
    setSaving(new Set(items.map(w => w.id)))
    try {
      await Promise.all(items.map(item => {
        const newIds = [...new Set([...(item.list_ids || []), bulkAddList])]
        return _setItemLists(item.id, newIds)
      }))
      onReload()
    } catch (e) { console.error(e) }
    finally { setSaving(new Set()) }
  }

  // ── Styles ─────────────────────────────────────────────────
  const th = (extra={}) => ({
    padding: '5px 8px',
    background: '#0a1520',
    color: '#4a7a95',
    fontFamily: MONO,
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.05em',
    borderBottom: '1px solid #1e3048',
    borderRight: '1px solid #1a2d40',
    position: 'sticky',
    top: 0,
    zIndex: 5,
    whiteSpace: 'nowrap',
    userSelect: 'none',
    ...extra,
  })
  const td = (extra={}) => ({
    padding: '4px 8px',
    borderBottom: '1px solid #0f1e2e',
    borderRight: '1px solid #0f1e2e',
    fontFamily: MONO,
    fontSize: 11,
    color: '#c8dff5',
    verticalAlign: 'middle',
    ...extra,
  })

  // ── Row background ─────────────────────────────────────────
  const rowBg = w => {
    const sym = (w.symbol || '').toUpperCase()
    const activeStratId = sortState.stratId
    if (!activeStratId) return 'transparent'
    const m = allRankings[activeStratId]?.[sym]
    if (!m?.cagr) return 'transparent'
    if (m.cagr > 10)  return 'rgba(0,180,80,0.04)'
    if (m.cagr < 0)   return 'rgba(255,60,60,0.04)'
    return 'transparent'
  }

  // ── Favorita column value ──────────────────────────────────
  const bestForSymbol = sym => {
    const best = bestStratBySymbol[sym.toUpperCase()]
    if (!best) return null
    // Try to find if there's daily vs weekly
    const allForSym = Object.entries(allRankings)
      .flatMap(([sid, data]) => {
        const m = data[sym.toUpperCase()]
        if (!m) return []
        const strat = strategies.find(s => s.id === sid)
        let intervalo = 'diario'
        try { const p = typeof strat?.params === 'string' ? JSON.parse(strat.params || '{}') : (strat?.params || {}); intervalo = p.intervalo || 'diario' } catch (_) {}
        return [{ sid, cagr: m.cagr, intervalo, stratName: strat?.name || '—' }]
      })
    const dailyBest  = allForSym.filter(x => x.intervalo === 'diario').sort((a,b)=>(b.cagr??-99)-(a.cagr??-99))[0]
    const weeklyBest = allForSym.filter(x => x.intervalo === 'semanal').sort((a,b)=>(b.cagr??-99)-(a.cagr??-99))[0]
    const pick = (!dailyBest && weeklyBest) ? weeklyBest
               : (!weeklyBest && dailyBest) ? dailyBest
               : (dailyBest && weeklyBest)
                 ? ((dailyBest.cagr ?? -99) >= (weeklyBest.cagr ?? -99) ? dailyBest : weeklyBest)
               : null
    if (!pick) return null
    return { ...pick, stratCount: best.stratCount }
  }

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 20,
      background: '#070e17',
      display: 'flex', flexDirection: 'column',
      fontFamily: MONO,
    }}>
      {/* ── Cabecera ── */}
      <div style={{
        flexShrink: 0,
        background: '#0a1520',
        borderBottom: '1px solid #1e3048',
        padding: '8px 12px',
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      }}>
        <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: '#c8dff5', marginRight: 4 }}>
          ⊞ Gestionar Watchlist
        </span>

        {/* Buscador */}
        <div style={{ position: 'relative', width: 160 }}>
          <input
            type="text" placeholder="Buscar ticker / nombre…"
            value={filterSearch} onChange={e => setFilterSearch(e.target.value)}
            style={{ width: '100%', background: '#0f1e2e', border: '1px solid #1e3048', color: '#c8dff5',
              fontFamily: MONO, fontSize: 11, padding: '4px 22px 4px 8px', borderRadius: 4, boxSizing: 'border-box' }}
          />
          {filterSearch && (
            <span onClick={() => setFilterSearch('')}
              style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
                cursor: 'pointer', color: '#4a7a95', fontSize: 11 }}>✕</span>
          )}
        </div>

        {/* Filtro por listas */}
        <select multiple
          value={filterLists}
          onChange={e => setFilterLists(Array.from(e.target.selectedOptions).map(o => o.value))}
          style={{ background: '#0f1e2e', border: '1px solid #1e3048', color: '#c8dff5',
            fontFamily: MONO, fontSize: 10, borderRadius: 4, padding: '2px 4px', maxHeight: 44,
            minWidth: 100, maxWidth: 150 }}
          title="Filtrar por lista (Ctrl+click para múltiple)">
          {wlLists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        {filterLists.length > 0 && (
          <button onClick={() => setFilterLists([])}
            style={{ background: 'transparent', border: 'none', color: '#4a7a95', fontFamily: MONO, fontSize: 10, cursor: 'pointer' }}>
            ✕ filtro
          </button>
        )}

        {/* Contador */}
        <span style={{ fontSize: 11, color: '#4a7a95', marginLeft: 4 }}>
          {sorted.length} activos
          {loadingRank && <span style={{ color: '#ffd166', marginLeft: 6 }}>⟳ cargando ranking…</span>}
        </span>

        {/* Botón cerrar */}
        <button onClick={onClose}
          style={{ marginLeft: 'auto', background: 'rgba(255,60,60,0.1)', border: '1px solid rgba(255,60,60,0.35)',
            color: '#ff4d6d', fontFamily: MONO, fontSize: 11, padding: '3px 10px', borderRadius: 4, cursor: 'pointer' }}>
          ✕ Cerrar
        </button>
      </div>

      {/* ── Barra de acciones en masa ── */}
      {selected.size > 0 && (
        <div style={{
          flexShrink: 0, background: '#0c1927', borderBottom: '1px solid #1e3048',
          padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 11, color: '#ffd166', fontWeight: 600 }}>
            {selected.size} seleccionado{selected.size !== 1 ? 's' : ''}
          </span>
          <span style={{ color: '#1e3048' }}>·</span>

          {/* Mover a lista */}
          <span style={{ fontSize: 11, color: '#8aadcc' }}>Mover a:</span>
          <select value={bulkMoveList} onChange={e => setBulkMoveList(e.target.value)}
            style={{ background: '#0f1e2e', border: '1px solid #1e3048', color: '#c8dff5',
              fontFamily: MONO, fontSize: 10, borderRadius: 3, padding: '2px 6px' }}>
            <option value="">— elige lista —</option>
            {wlLists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <button onClick={bulkMove} disabled={!bulkMoveList}
            style={{ background: bulkMoveList ? 'rgba(0,212,255,0.15)' : 'transparent',
              border: `1px solid ${bulkMoveList ? 'rgba(0,212,255,0.4)' : '#1e3048'}`,
              color: bulkMoveList ? '#00d4ff' : '#2d4a60', fontFamily: MONO, fontSize: 10,
              padding: '2px 8px', borderRadius: 3, cursor: bulkMoveList ? 'pointer' : 'not-allowed' }}>
            Aplicar
          </button>

          <span style={{ color: '#1e3048' }}>·</span>

          {/* Añadir a lista */}
          <span style={{ fontSize: 11, color: '#8aadcc' }}>Añadir a:</span>
          <select value={bulkAddList} onChange={e => setBulkAddList(e.target.value)}
            style={{ background: '#0f1e2e', border: '1px solid #1e3048', color: '#c8dff5',
              fontFamily: MONO, fontSize: 10, borderRadius: 3, padding: '2px 6px' }}>
            <option value="">— elige lista —</option>
            {wlLists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <button onClick={bulkAdd} disabled={!bulkAddList}
            style={{ background: bulkAddList ? 'rgba(0,230,150,0.12)' : 'transparent',
              border: `1px solid ${bulkAddList ? 'rgba(0,230,150,0.4)' : '#1e3048'}`,
              color: bulkAddList ? '#00e5a0' : '#2d4a60', fontFamily: MONO, fontSize: 10,
              padding: '2px 8px', borderRadius: 3, cursor: bulkAddList ? 'pointer' : 'not-allowed' }}>
            Aplicar
          </button>

          <button onClick={() => setSelected(new Set())}
            style={{ marginLeft: 'auto', background: 'transparent', border: 'none',
              color: '#4a7a95', fontFamily: MONO, fontSize: 10, cursor: 'pointer' }}>
            ✕ deseleccionar
          </button>
        </div>
      )}

      {/* ── Tabla ── */}
      <div style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
        <table style={{ borderCollapse: 'collapse', minWidth: '100%', tableLayout: 'auto' }}>
          <thead>
            {/* Row 1: group headers */}
            <tr>
              {/* Fixed left group */}
              <th colSpan={4} style={{ ...th(), background: '#071018', borderRight: '2px solid #1e3048' }} />

              {/* Strategy group headers */}
              {stratColsWithNull.map((s, si) => (
                <th key={s.id} colSpan={4}
                  style={{ ...th(),
                    background: `${STRAT_COLORS[si % STRAT_COLORS.length]}18`,
                    borderLeft: `2px solid ${STRAT_COLORS[si % STRAT_COLORS.length]}44`,
                    borderRight: `2px solid ${STRAT_COLORS[si % STRAT_COLORS.length]}44`,
                    color: STRAT_COLORS[si % STRAT_COLORS.length],
                    textAlign: 'center',
                    fontSize: 10,
                    maxWidth: 180,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}>
                  {s.name}
                </th>
              ))}

              {/* Favorita header */}
              <th style={{ ...th(), background: '#071018', borderLeft: '2px solid #1e3048', whiteSpace: 'nowrap' }}>
                Favorita
              </th>
            </tr>

            {/* Row 2: column headers */}
            <tr>
              {/* Checkbox */}
              <th style={{ ...th(), width: 28, textAlign: 'center' }}>
                <input type="checkbox" checked={allSelected} onChange={toggleAll}
                  style={{ cursor: 'pointer', accentColor: '#00d4ff' }} />
              </th>
              {/* Ticker */}
              <th style={{ ...th(), cursor: 'pointer', borderRight: 'none' }}
                onClick={() => setSortState({ stratId: null, metric: 'symbol', dir: sortState.metric === 'symbol' && sortState.dir === 'asc' ? 'desc' : 'asc' })}>
                Ticker
              </th>
              {/* Nombre */}
              <th style={{ ...th(), minWidth: 120 }}>Nombre</th>
              {/* Listas */}
              <th style={{ ...th(), minWidth: 100, borderRight: '2px solid #1e3048' }}>Listas</th>

              {/* Per-strategy sub-headers */}
              {stratColsWithNull.map((s, si) => {
                const col = STRAT_COLORS[si % STRAT_COLORS.length]
                const subTh = (metric, label) => (
                  <th key={metric}
                    onClick={() => handleSort(s.id, metric)}
                    style={{ ...th(),
                      cursor: 'pointer',
                      background: `${col}10`,
                      color: `${col}cc`,
                      borderLeft: metric === 'cagr' ? `2px solid ${col}44` : undefined,
                      borderRight: metric === 'trades' ? `2px solid ${col}44` : `1px solid ${col}22`,
                    }}>
                    {label}{sortIcon(s.id, metric)}
                  </th>
                )
                return [
                  subTh('cagr',    'CAGR%'),
                  subTh('winRate', 'Win%'),
                  subTh('maxDD',   'DD%'),
                  subTh('trades',  'Ops'),
                ]
              })}

              {/* Favorita */}
              <th style={{ ...th(), borderLeft: '2px solid #1e3048', minWidth: 140 }}>
                Mejor estrategia
              </th>
            </tr>
          </thead>

          <tbody>
            {sorted.map(w => {
              const sym = (w.symbol || '').toUpperCase()
              const isSaving = saving.has(w.id)
              const isSelected = selected.has(w.id)
              const best = bestForSymbol(sym)

              return (
                <tr key={w.id || w.symbol}
                  style={{
                    background: isSelected
                      ? 'rgba(0,212,255,0.06)'
                      : rowBg(w),
                    opacity: isSaving ? 0.5 : 1,
                    transition: 'background 0.15s',
                  }}
                  onMouseOver={e => { if (!isSelected) e.currentTarget.style.background = 'rgba(255,255,255,0.02)' }}
                  onMouseOut={e  => { if (!isSelected) e.currentTarget.style.background = rowBg(w) }}>

                  {/* Checkbox */}
                  <td style={{ ...td(), textAlign: 'center', width: 28 }}>
                    <input type="checkbox" checked={isSelected} onChange={() => toggleOne(w.id)}
                      style={{ cursor: 'pointer', accentColor: '#00d4ff' }} />
                  </td>

                  {/* Ticker */}
                  <td style={{ ...td(), fontWeight: 700, color: '#e8f4ff', whiteSpace: 'nowrap' }}>
                    {w.symbol}
                  </td>

                  {/* Nombre */}
                  <td style={{ ...td(), color: '#8aadcc', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {w.name}
                  </td>

                  {/* Listas — chips editables */}
                  <td style={{ ...td(), borderRight: '2px solid #1a2d40' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, alignItems: 'center' }}>
                      {(w.list_ids || []).map(lid => {
                        const lname = wlLists.find(l => l.id === lid)?.name
                        if (!lname) return null
                        return (
                          <span key={lid} style={{
                            background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.25)',
                            color: '#7ad4f0', fontFamily: MONO, fontSize: 9, padding: '1px 5px',
                            borderRadius: 3, display: 'flex', alignItems: 'center', gap: 3, whiteSpace: 'nowrap'
                          }}>
                            {lname}
                            <span
                              onClick={() => removeFromList(w, lid)}
                              style={{ cursor: 'pointer', color: '#4a7a95', fontSize: 9, lineHeight: 1 }}
                              title={`Quitar de "${lname}"`}>✕</span>
                          </span>
                        )
                      })}

                      {/* Botón + para añadir a lista */}
                      <div style={{ position: 'relative' }} ref={addDropOpen === w.id ? addDropRef : null}>
                        <span
                          onClick={() => setAddDropOpen(prev => prev === w.id ? null : w.id)}
                          style={{ cursor: 'pointer', color: '#2a6080', fontSize: 13, lineHeight: 1,
                            fontWeight: 400, padding: '0 2px', userSelect: 'none' }}
                          title="Añadir a lista">+</span>
                        {addDropOpen === w.id && (
                          <div style={{
                            position: 'absolute', left: 0, top: '100%', zIndex: 100,
                            background: '#0a1928', border: '1px solid #1e3048', borderRadius: 5,
                            boxShadow: '0 4px 16px rgba(0,0,0,0.6)', minWidth: 130, padding: '4px 0',
                          }}>
                            {wlLists.filter(l => !(w.list_ids || []).includes(l.id)).map(l => (
                              <div key={l.id}
                                onClick={() => addToList(w, l.id)}
                                style={{ padding: '5px 10px', fontFamily: MONO, fontSize: 11,
                                  color: '#a8ccdf', cursor: 'pointer' }}
                                onMouseOver={e => e.currentTarget.style.background = 'rgba(0,212,255,0.08)'}
                                onMouseOut={e  => e.currentTarget.style.background = 'transparent'}>
                                {l.name}
                              </div>
                            ))}
                            {wlLists.filter(l => !(w.list_ids || []).includes(l.id)).length === 0 && (
                              <div style={{ padding: '5px 10px', fontFamily: MONO, fontSize: 10, color: '#4a7a95' }}>
                                Ya en todas las listas
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Strategy metric cells */}
                  {stratColsWithNull.map((s, si) => {
                    const m = allRankings[s.id]?.[sym]
                    const col = STRAT_COLORS[si % STRAT_COLORS.length]
                    const noData = !m

                    const metricCell = (val, bg, fg, format) => (
                      <td style={{ ...td(), background: bg, color: fg, textAlign: 'right',
                        borderLeft: `1px solid ${col}18`, fontSize: 10 }}>
                        {noData ? <span style={{ color: '#1e3048' }}>—</span> : format(val)}
                      </td>
                    )

                    return [
                      metricCell(m?.cagr,    cagrBg(m?.cagr),     cagrFg(m?.cagr),     v => v != null ? `${v.toFixed(1)}%`     : '—'),
                      metricCell(m?.winRate, 'transparent',        wrFg(m?.winRate),    v => v != null ? `${v.toFixed(0)}%`     : '—'),
                      metricCell(m?.maxDD,   ddBg(m?.maxDD),      '#ff8fa0',           v => v != null ? `-${Math.abs(v).toFixed(1)}%` : '—'),
                      metricCell(m?.trades,  'transparent',        '#8aadcc',           v => v != null ? String(Math.round(v))   : '—'),
                    ]
                  })}

                  {/* Favorita */}
                  <td style={{ ...td(), borderLeft: '2px solid #1a2d40', minWidth: 140 }}>
                    {best ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span style={{ color: '#ffd166', fontWeight: 600, fontSize: 10, whiteSpace: 'nowrap',
                          overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 140 }}>
                          {best.stratName}
                        </span>
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                          <span style={{
                            background: best.intervalo === 'semanal' ? 'rgba(162,155,254,0.15)' : 'rgba(0,212,255,0.1)',
                            border: `1px solid ${best.intervalo === 'semanal' ? 'rgba(162,155,254,0.35)' : 'rgba(0,212,255,0.3)'}`,
                            color: best.intervalo === 'semanal' ? '#a29bfe' : '#00d4ff',
                            fontFamily: MONO, fontSize: 8, padding: '1px 4px', borderRadius: 2,
                          }}>
                            {best.intervalo === 'semanal' ? 'Semanal' : 'Diario'}
                          </span>
                          {best.stratCount > 0 && (
                            <span style={{ fontSize: 9, color: '#2d4a60' }}>
                              /{best.stratCount} eval.
                            </span>
                          )}
                          {best.cagr != null && (
                            <span style={{ fontSize: 9, color: cagrFg(best.cagr), marginLeft: 2 }}>
                              {best.cagr.toFixed(1)}%
                            </span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <span style={{ color: '#1e3048', fontSize: 10 }}>—</span>
                    )}
                  </td>
                </tr>
              )
            })}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={4 + stratColsWithNull.length * 4 + 1}
                  style={{ ...td(), textAlign: 'center', color: '#4a7a95', padding: '20px' }}>
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
