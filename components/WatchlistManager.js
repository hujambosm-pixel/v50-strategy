import { useState, useEffect, useCallback, useRef } from 'react'
import { MONO } from '../lib/utils'
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
  const url = `${getSupaUrl()}/rest/v1/ranking_results?select=symbol,strategy_id,score,win_rate,cagr_simple,max_drawdown,total_trades,rank_position&limit=10000`
  const res = await fetch(url, { headers: getSupaH() })
  if (!res.ok) return []
  return (await res.json()) || []
}

// ── Light-theme color helpers ────────────────────────────────
const cagrBg = v => {
  if (v == null) return 'transparent'
  if (v > 15) return '#dcfce7'
  if (v > 5)  return '#d1fae5'
  if (v > 0)  return '#f0fdf4'
  return '#fee2e2'
}
const cagrFg = v => {
  if (v == null) return '#94a3b8'
  if (v > 15) return '#166534'
  if (v > 5)  return '#065f46'
  if (v > 0)  return '#15803d'
  return '#991b1b'
}
const ddBg = v => {
  if (v == null) return 'transparent'
  const abs = Math.abs(v)
  if (abs > 30) return '#fecaca'
  if (abs > 15) return '#fed7d7'
  return 'transparent'
}
const ddFg = v => {
  if (v == null) return '#94a3b8'
  const abs = Math.abs(v)
  if (abs > 30) return '#991b1b'
  if (abs > 15) return '#b91c1c'
  return '#475569'
}
const wrFg = v => v == null ? '#94a3b8' : v >= 50 ? '#166534' : '#991b1b'

// ── Main component ───────────────────────────────────────────
export default function WatchlistManager({
  watchlist,
  bestStratBySymbol,
  strategies,
  wlLists,
  onReload,
  onClose,
}) {
  const [allRankings, setAllRankings]   = useState({}) // {stratId: {SYM: metrics}}
  const [loadingRank, setLoadingRank]   = useState(true)
  const [selected, setSelected]         = useState(new Set())
  const [sortState, setSortState]       = useState({ metric: 'cagr', dir: 'desc' })
  const [filterSearch, setFilterSearch] = useState('')
  const [filterLists, setFilterLists]   = useState([])
  const [bulkMoveList, setBulkMoveList] = useState('')
  const [bulkAddList, setBulkAddList]   = useState('')
  const [saving, setSaving]             = useState(new Set())
  const [addDropOpen, setAddDropOpen]   = useState(null)
  const addDropRef = useRef(null)

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
          cagr:    r.cagr_simple,
          winRate: r.win_rate,
          maxDD:   r.max_drawdown,
          trades:  r.total_trades,
          score:   r.score,
          rank:    r.rank_position,
        }
      })
      setAllRankings(map)
    }).catch(() => {}).finally(() => setLoadingRank(false))
  }, [])

  // ── Close + dropdown on outside click ────────────────────
  useEffect(() => {
    const handler = e => {
      if (addDropRef.current && !addDropRef.current.contains(e.target))
        setAddDropOpen(null)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // ── Favorita para un símbolo ──────────────────────────────
  // Devuelve la entrada de allRankings de la mejor estrategia para ese símbolo
  const bestForSymbol = useCallback(sym => {
    const symUp = sym.toUpperCase()
    // Recorrer todas las estrategias con datos y quedarse con la de mayor CAGR
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
    const bsb = bestStratBySymbol[symUp]
    return {
      sid:       best.sid,
      metrics:   best.metrics,
      stratName: strat?.name || '—',
      intervalo,
      stratCount: bsb?.stratCount ?? Object.values(allRankings).filter(d => d[symUp]).length,
    }
  }, [allRankings, strategies, bestStratBySymbol])

  // ── Filter ─────────────────────────────────────────────────
  const filtered = watchlist.filter(w => {
    const matchSearch = !filterSearch ||
      (w.symbol || '').toLowerCase().includes(filterSearch.toLowerCase()) ||
      (w.name   || '').toLowerCase().includes(filterSearch.toLowerCase())
    const matchList = filterLists.length === 0 ||
      filterLists.some(lid => (w.list_ids || []).includes(lid))
    return matchSearch && matchList
  })

  // ── Sort ───────────────────────────────────────────────────
  const sorted = [...filtered].sort((a, b) => {
    const { metric, dir } = sortState
    if (metric === 'symbol') {
      const r = (a.symbol || '').localeCompare(b.symbol || '')
      return dir === 'asc' ? r : -r
    }
    if (metric === 'name') {
      const r = (a.name || '').localeCompare(b.name || '')
      return dir === 'asc' ? r : -r
    }
    const ba = bestForSymbol(a.symbol || '')
    const bb = bestForSymbol(b.symbol || '')
    const va = ba?.metrics?.[metric] ?? (dir === 'asc' ? Infinity : -Infinity)
    const vb = bb?.metrics?.[metric] ?? (dir === 'asc' ? Infinity : -Infinity)
    return dir === 'asc' ? va - vb : vb - va
  })

  // ── Selection ─────────────────────────────────────────────
  const allSelected = sorted.length > 0 && sorted.every(w => selected.has(w.id))
  const toggleAll   = () => allSelected
    ? setSelected(new Set())
    : setSelected(new Set(sorted.map(w => w.id)))
  const toggleOne   = id => setSelected(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n
  })

  // ── Sort click ─────────────────────────────────────────────
  const handleSort = metric => setSortState(prev =>
    prev.metric === metric
      ? { metric, dir: prev.dir === 'desc' ? 'asc' : 'desc' }
      : { metric, dir: 'desc' }
  )
  const sortIcon = metric => {
    if (sortState.metric !== metric) return <span style={{ color: '#cbd5e1', marginLeft: 3 }}>↕</span>
    return <span style={{ color: '#3b82f6', marginLeft: 3 }}>{sortState.dir === 'desc' ? '↓' : '↑'}</span>
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
    } catch (e) { console.error(e) }
    finally { setSaving(new Set()) }
  }
  const bulkAdd = async () => {
    if (!bulkAddList || selected.size === 0) return
    const items = watchlist.filter(w => selected.has(w.id))
    setSaving(new Set(items.map(w => w.id)))
    try {
      await Promise.all(items.map(item =>
        _setItemLists(item.id, [...new Set([...(item.list_ids || []), bulkAddList])])
      ))
      onReload()
    } catch (e) { console.error(e) }
    finally { setSaving(new Set()) }
  }

  // ── Style helpers ──────────────────────────────────────────
  const TH_BASE = {
    padding: '8px 12px',
    background: '#f1f5f9',
    color: '#475569',
    fontFamily: MONO,
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    borderBottom: '2px solid #e2e8f0',
    borderRight: '1px solid #e2e8f0',
    position: 'sticky',
    top: 0,
    zIndex: 5,
    whiteSpace: 'nowrap',
    userSelect: 'none',
  }
  const TH = (extra = {}) => ({ ...TH_BASE, ...extra })
  const TD = (extra = {}) => ({
    padding: '8px 12px',
    borderBottom: '1px solid #e2e8f0',
    borderRight: '1px solid #e2e8f0',
    fontFamily: MONO,
    fontSize: 13,
    color: '#1e293b',
    verticalAlign: 'middle',
    height: 36,
    ...extra,
  })

  const rowBg = (w, isSelected, isOdd) => {
    if (isSelected) return '#eff6ff'
    const sym = (w.symbol || '').toUpperCase()
    const best = bestForSymbol(sym)
    const cagr = best?.metrics?.cagr
    if (cagr > 10) return isOdd ? '#f0fdf4' : '#f7fef9'
    if (cagr < 0)  return isOdd ? '#fff5f5' : '#fffafa'
    return isOdd ? '#f8fafc' : '#ffffff'
  }

  // ── Selector component de listas (filtro) ──────────────────
  const [listFilterOpen, setListFilterOpen] = useState(false)
  const listFilterRef = useRef(null)
  useEffect(() => {
    const h = e => { if (listFilterRef.current && !listFilterRef.current.contains(e.target)) setListFilterOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const selListNames = filterLists.map(lid => wlLists.find(l => l.id === lid)?.name).filter(Boolean)

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 20,
      background: '#f8fafc',
      display: 'flex', flexDirection: 'column',
      fontFamily: MONO,
    }}>
      {/* ── Cabecera única ── */}
      <div style={{
        flexShrink: 0,
        background: '#f8fafc',
        borderBottom: '1px solid #e2e8f0',
        padding: '8px 14px',
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
      }}>
        {/* Título */}
        <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: '#1e293b', flexShrink: 0 }}>
          ⊞ Gestionar Watchlist
        </span>

        {/* Buscador */}
        <div style={{ position: 'relative', width: 180 }}>
          <input type="text" placeholder="Buscar ticker o nombre…"
            value={filterSearch} onChange={e => setFilterSearch(e.target.value)}
            style={{ width: '100%', background: '#fff', border: '1px solid #e2e8f0', color: '#1e293b',
              fontFamily: MONO, fontSize: 12, padding: '5px 24px 5px 9px',
              borderRadius: 5, boxSizing: 'border-box', outline: 'none' }} />
          {filterSearch
            ? <span onClick={() => setFilterSearch('')}
                style={{ position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)',
                  cursor: 'pointer', color: '#94a3b8', fontSize: 12 }}>✕</span>
            : <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                color: '#cbd5e1', fontSize: 11, pointerEvents: 'none' }}>🔍</span>
          }
        </div>

        {/* Filtro por listas — dropdown personalizado */}
        <div style={{ position: 'relative' }} ref={listFilterRef}>
          <button onClick={() => setListFilterOpen(v => !v)}
            style={{ background: filterLists.length ? '#eff6ff' : '#fff',
              border: `1px solid ${filterLists.length ? '#93c5fd' : '#e2e8f0'}`,
              color: filterLists.length ? '#1d4ed8' : '#475569',
              fontFamily: MONO, fontSize: 12, padding: '5px 10px', borderRadius: 5,
              cursor: 'pointer', whiteSpace: 'nowrap' }}>
            {filterLists.length ? `${selListNames.slice(0,2).join(', ')}${selListNames.length > 2 ? ` +${selListNames.length-2}` : ''}` : 'Todas las listas'} ▾
          </button>
          {listFilterOpen && (
            <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 200, marginTop: 4,
              background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6,
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)', minWidth: 160, padding: '4px 0' }}>
              {filterLists.length > 0 && (
                <div onClick={() => setFilterLists([])}
                  style={{ padding: '6px 12px', fontSize: 11, color: '#3b82f6', cursor: 'pointer', fontWeight: 600 }}>
                  Mostrar todas
                </div>
              )}
              {wlLists.map(l => (
                <div key={l.id} onClick={() => setFilterLists(prev =>
                  prev.includes(l.id) ? prev.filter(x => x !== l.id) : [...prev, l.id]
                )} style={{ padding: '6px 12px', fontSize: 12, color: '#1e293b', cursor: 'pointer',
                  background: filterLists.includes(l.id) ? '#eff6ff' : 'transparent',
                  display: 'flex', alignItems: 'center', gap: 8 }}
                  onMouseOver={e => e.currentTarget.style.background = filterLists.includes(l.id) ? '#dbeafe' : '#f8fafc'}
                  onMouseOut={e  => e.currentTarget.style.background = filterLists.includes(l.id) ? '#eff6ff' : 'transparent'}>
                  <span style={{ fontSize: 11, color: filterLists.includes(l.id) ? '#3b82f6' : '#cbd5e1' }}>
                    {filterLists.includes(l.id) ? '☑' : '☐'}
                  </span>
                  {l.name}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Contador */}
        <span style={{ fontSize: 12, color: '#64748b' }}>
          {sorted.length} activo{sorted.length !== 1 ? 's' : ''}
          {loadingRank && <span style={{ color: '#f59e0b', marginLeft: 8 }}>⟳ cargando ranking…</span>}
        </span>

        {/* Acciones masivas — inline, solo cuando hay selección */}
        {selected.size > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
            background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, padding: '4px 10px' }}>
            <span style={{ fontSize: 12, color: '#1d4ed8', fontWeight: 600 }}>
              {selected.size} sel.
            </span>
            <span style={{ color: '#bfdbfe' }}>·</span>
            <span style={{ fontSize: 11, color: '#475569' }}>Mover a:</span>
            <select value={bulkMoveList} onChange={e => setBulkMoveList(e.target.value)}
              style={{ background: '#fff', border: '1px solid #e2e8f0', color: '#1e293b',
                fontFamily: MONO, fontSize: 11, borderRadius: 4, padding: '2px 6px' }}>
              <option value="">— lista —</option>
              {wlLists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <button onClick={bulkMove} disabled={!bulkMoveList}
              style={{ background: bulkMoveList ? '#3b82f6' : '#e2e8f0',
                border: 'none', color: bulkMoveList ? '#fff' : '#94a3b8',
                fontFamily: MONO, fontSize: 11, padding: '3px 9px', borderRadius: 4,
                cursor: bulkMoveList ? 'pointer' : 'not-allowed' }}>
              Aplicar
            </button>
            <span style={{ color: '#bfdbfe' }}>·</span>
            <span style={{ fontSize: 11, color: '#475569' }}>Añadir a:</span>
            <select value={bulkAddList} onChange={e => setBulkAddList(e.target.value)}
              style={{ background: '#fff', border: '1px solid #e2e8f0', color: '#1e293b',
                fontFamily: MONO, fontSize: 11, borderRadius: 4, padding: '2px 6px' }}>
              <option value="">— lista —</option>
              {wlLists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <button onClick={bulkAdd} disabled={!bulkAddList}
              style={{ background: bulkAddList ? '#10b981' : '#e2e8f0',
                border: 'none', color: bulkAddList ? '#fff' : '#94a3b8',
                fontFamily: MONO, fontSize: 11, padding: '3px 9px', borderRadius: 4,
                cursor: bulkAddList ? 'pointer' : 'not-allowed' }}>
              Aplicar
            </button>
            <span onClick={() => setSelected(new Set())}
              style={{ fontSize: 11, color: '#64748b', cursor: 'pointer', marginLeft: 2 }}>✕</span>
          </div>
        )}

        {/* Botón cerrar */}
        <button onClick={onClose}
          style={{ marginLeft: 'auto', background: '#fff', border: '1px solid #fca5a5',
            color: '#dc2626', fontFamily: MONO, fontSize: 12, padding: '5px 12px',
            borderRadius: 5, cursor: 'pointer', flexShrink: 0 }}>
          ✕ Cerrar
        </button>
      </div>

      {/* ── Tabla ── */}
      <div style={{ flex: 1, overflow: 'auto', background: '#fff' }}>
        <table style={{ borderCollapse: 'collapse', minWidth: '100%', tableLayout: 'auto' }}>
          <thead>
            {/* Fila de sub-headers para la sección de métricas favorita */}
            <tr>
              <th colSpan={4} style={{ ...TH(), background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }} />
              <th colSpan={4} style={{ ...TH(),
                background: '#f0f9ff',
                borderLeft: '2px solid #bae6fd',
                borderRight: '2px solid #bae6fd',
                color: '#0369a1', textAlign: 'center', fontSize: 11 }}>
                Estrategia favorita (mejor CAGR)
              </th>
              <th style={{ ...TH(), background: '#fafaf9', borderLeft: '2px solid #e2e8f0' }} />
            </tr>

            {/* Fila de columnas */}
            <tr>
              {/* Checkbox */}
              <th style={{ ...TH(), width: 36, textAlign: 'center', padding: '8px 6px' }}>
                <input type="checkbox" checked={allSelected} onChange={toggleAll}
                  style={{ cursor: 'pointer', accentColor: '#3b82f6', width: 15, height: 15 }} />
              </th>

              {/* Ticker */}
              <th style={{ ...TH(), cursor: 'pointer', minWidth: 80 }} onClick={() => handleSort('symbol')}>
                Ticker {sortIcon('symbol')}
              </th>

              {/* Nombre */}
              <th style={{ ...TH(), minWidth: 140, cursor: 'pointer' }} onClick={() => handleSort('name')}>
                Nombre {sortIcon('name')}
              </th>

              {/* Listas */}
              <th style={{ ...TH(), minWidth: 120, borderRight: '2px solid #e2e8f0' }}>Listas</th>

              {/* Métricas de favorita */}
              {[
                ['cagr',    'CAGR%',  '#0369a1'],
                ['winRate', 'Win%',   '#0369a1'],
                ['maxDD',   'MaxDD%', '#0369a1'],
                ['trades',  'Ops',    '#0369a1'],
              ].map(([metric, label, col]) => (
                <th key={metric}
                  onClick={() => handleSort(metric)}
                  style={{ ...TH(),
                    cursor: 'pointer', textAlign: 'right',
                    background: '#f0f9ff',
                    color: '#0369a1',
                    borderLeft: metric === 'cagr' ? '2px solid #bae6fd' : '1px solid #e0f2fe',
                    borderRight: metric === 'trades' ? '2px solid #bae6fd' : '1px solid #e0f2fe',
                    minWidth: 70,
                  }}>
                  {label} {sortIcon(metric)}
                </th>
              ))}

              {/* Favorita (nombre + badge) */}
              <th style={{ ...TH(), minWidth: 160, borderLeft: '2px solid #e2e8f0', background: '#fafaf9' }}>
                Estrategia
              </th>
            </tr>
          </thead>

          <tbody>
            {sorted.map((w, idx) => {
              const sym       = (w.symbol || '').toUpperCase()
              const isSaving  = saving.has(w.id)
              const isSelected= selected.has(w.id)
              const isOdd     = idx % 2 === 1
              const best      = bestForSymbol(sym)
              const m         = best?.metrics

              return (
                <tr key={w.id || w.symbol}
                  style={{
                    background: rowBg(w, isSelected, isOdd),
                    opacity: isSaving ? 0.5 : 1,
                    transition: 'background 0.1s',
                  }}
                  onMouseOver={e => { if (!isSelected) e.currentTarget.style.background = '#f1f5f9' }}
                  onMouseOut={e  => { e.currentTarget.style.background = rowBg(w, isSelected, isOdd) }}>

                  {/* Checkbox */}
                  <td style={{ ...TD(), textAlign: 'center', padding: '8px 6px', width: 36 }}>
                    <input type="checkbox" checked={isSelected} onChange={() => toggleOne(w.id)}
                      style={{ cursor: 'pointer', accentColor: '#3b82f6', width: 15, height: 15 }} />
                  </td>

                  {/* Ticker */}
                  <td style={{ ...TD(), fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap' }}>
                    {w.symbol}
                  </td>

                  {/* Nombre */}
                  <td style={{ ...TD(), color: '#475569', maxWidth: 200, overflow: 'hidden',
                    textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    title={w.name}>
                    {w.name}
                  </td>

                  {/* Listas — chips editables */}
                  <td style={{ ...TD(), borderRight: '2px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                      {(w.list_ids || []).map(lid => {
                        const lname = wlLists.find(l => l.id === lid)?.name
                        if (!lname) return null
                        return (
                          <span key={lid} style={{
                            background: '#eff6ff', border: '1px solid #bfdbfe',
                            color: '#1d4ed8', fontFamily: MONO, fontSize: 11,
                            padding: '2px 7px', borderRadius: 4,
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            whiteSpace: 'nowrap',
                          }}>
                            {lname}
                            <span onClick={() => removeFromList(w, lid)}
                              style={{ cursor: 'pointer', color: '#93c5fd', fontSize: 10, lineHeight: 1,
                                fontWeight: 700 }}
                              title={`Quitar de "${lname}"`}>×</span>
                          </span>
                        )
                      })}

                      {/* Botón + */}
                      <div style={{ position: 'relative' }} ref={addDropOpen === w.id ? addDropRef : null}>
                        <span onClick={() => setAddDropOpen(prev => prev === w.id ? null : w.id)}
                          style={{ cursor: 'pointer', color: '#94a3b8', fontSize: 18, lineHeight: 1,
                            padding: '0 3px', userSelect: 'none', fontWeight: 300 }}
                          title="Añadir a lista">+</span>
                        {addDropOpen === w.id && (
                          <div style={{
                            position: 'absolute', left: 0, top: '100%', zIndex: 200, marginTop: 2,
                            background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6,
                            boxShadow: '0 4px 12px rgba(0,0,0,0.08)', minWidth: 150, padding: '4px 0',
                          }}>
                            {wlLists.filter(l => !(w.list_ids || []).includes(l.id)).map(l => (
                              <div key={l.id} onClick={() => addToList(w, l.id)}
                                style={{ padding: '6px 12px', fontFamily: MONO, fontSize: 12,
                                  color: '#1e293b', cursor: 'pointer' }}
                                onMouseOver={e => e.currentTarget.style.background = '#f1f5f9'}
                                onMouseOut={e  => e.currentTarget.style.background = 'transparent'}>
                                {l.name}
                              </div>
                            ))}
                            {wlLists.filter(l => !(w.list_ids || []).includes(l.id)).length === 0 && (
                              <div style={{ padding: '6px 12px', fontFamily: MONO, fontSize: 11, color: '#94a3b8' }}>
                                Ya en todas las listas
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* CAGR */}
                  <td style={{ ...TD(),
                    background: cagrBg(m?.cagr), color: cagrFg(m?.cagr),
                    textAlign: 'right', fontWeight: 600,
                    borderLeft: '2px solid #bae6fd', borderRight: '1px solid #e0f2fe',
                  }}>
                    {m?.cagr != null ? `${m.cagr.toFixed(1)}%` : <span style={{ color: '#cbd5e1' }}>—</span>}
                  </td>

                  {/* WinRate */}
                  <td style={{ ...TD(),
                    color: wrFg(m?.winRate), textAlign: 'right', fontWeight: 600,
                    borderRight: '1px solid #e0f2fe',
                  }}>
                    {m?.winRate != null ? `${m.winRate.toFixed(0)}%` : <span style={{ color: '#cbd5e1' }}>—</span>}
                  </td>

                  {/* MaxDD */}
                  <td style={{ ...TD(),
                    background: ddBg(m?.maxDD), color: ddFg(m?.maxDD),
                    textAlign: 'right', fontWeight: 600,
                    borderRight: '1px solid #e0f2fe',
                  }}>
                    {m?.maxDD != null ? `-${Math.abs(m.maxDD).toFixed(1)}%` : <span style={{ color: '#cbd5e1' }}>—</span>}
                  </td>

                  {/* Ops */}
                  <td style={{ ...TD(), color: '#64748b', textAlign: 'right',
                    borderRight: '2px solid #bae6fd' }}>
                    {m?.trades != null ? Math.round(m.trades) : <span style={{ color: '#cbd5e1' }}>—</span>}
                  </td>

                  {/* Estrategia favorita */}
                  <td style={{ ...TD(), borderLeft: '2px solid #e2e8f0', background: isOdd ? '#fafaf9' : '#fffff9' }}>
                    {best ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <span style={{ color: '#1e293b', fontWeight: 600, fontSize: 12,
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 180 }}
                          title={best.stratName}>
                          {best.stratName}
                        </span>
                        <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                          <span style={{
                            background: best.intervalo === 'semanal' ? '#f3e8ff' : '#eff6ff',
                            border: `1px solid ${best.intervalo === 'semanal' ? '#d8b4fe' : '#bfdbfe'}`,
                            color: best.intervalo === 'semanal' ? '#7c3aed' : '#1d4ed8',
                            fontFamily: MONO, fontSize: 9, padding: '1px 5px', borderRadius: 3,
                          }}>
                            {best.intervalo === 'semanal' ? 'Semanal' : 'Diario'}
                          </span>
                          {best.stratCount > 0 && (
                            <span style={{ fontSize: 10, color: '#94a3b8' }}>
                              {best.stratCount} eval.
                            </span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <span style={{ color: '#cbd5e1', fontSize: 12 }}>—</span>
                    )}
                  </td>
                </tr>
              )
            })}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={9}
                  style={{ ...TD(), textAlign: 'center', color: '#94a3b8', padding: '32px', background: '#fff' }}>
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
