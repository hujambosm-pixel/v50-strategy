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

// ── Palette ───────────────────────────────────────────────────
const P = {
  bg:          '#f5f0e8',
  bgAlt:       '#ede8df',
  bgHeader:    '#ede8df',
  bgPanel:     '#ede8df',
  border:      '#ccc8bf',
  borderStrong:'#b8b3ab',
  thBg:        '#ddd8cf',
  thFg:        '#4a4540',
  text:        '#2c2820',
  textSec:     '#6b6560',
  textMuted:   '#9a9590',
  selected:    '#e8e0d4',
  hover:       '#e8e3da',
  accentBg:    '#2c2820',
  accentFg:    '#f5f0e8',
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
}) {
  const [allRankings, setAllRankings]   = useState({})
  const [loadingRank, setLoadingRank]   = useState(true)
  const [selected, setSelected]         = useState(new Set())
  const [sortState, setSortState]       = useState({ metric: 'cagr', dir: 'desc' })
  const [filterSearch, setFilterSearch] = useState('')
  const [filterLists, setFilterLists]   = useState([])
  const [bulkMoveList, setBulkMoveList] = useState('')
  const [bulkAddList, setBulkAddList]   = useState('')
  const [saving, setSaving]             = useState(new Set())
  const [addDropOpen, setAddDropOpen]   = useState(null)
  const [listFilterOpen, setListFilterOpen] = useState(false)
  const addDropRef   = useRef(null)
  const listFilterRef= useRef(null)

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
        }
      })
      setAllRankings(map)
    }).catch(() => {}).finally(() => setLoadingRank(false))
  }, [])

  // ── Outside-click handlers ─────────────────────────────────
  useEffect(() => {
    const h = e => {
      if (addDropRef.current && !addDropRef.current.contains(e.target)) setAddDropOpen(null)
      if (listFilterRef.current && !listFilterRef.current.contains(e.target)) setListFilterOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  // ── Best strategy for a symbol ────────────────────────────
  const bestForSymbol = useCallback(sym => {
    const symUp = sym.toUpperCase()
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
    const sl = filterSearch.toLowerCase()
    const matchSearch = !sl ||
      (w.symbol || '').toLowerCase().includes(sl) ||
      (w.name   || '').toLowerCase().includes(sl)
    const matchList = filterLists.length === 0 ||
      filterLists.some(lid => (w.list_ids || []).includes(lid))
    return matchSearch && matchList
  })

  // ── Sort ───────────────────────────────────────────────────
  const sorted = [...filtered].sort((a, b) => {
    const { metric, dir } = sortState
    const cmp = (va, vb) => dir === 'asc' ? va - vb : vb - va
    const cmpStr = (sa, sb) => dir === 'asc' ? sa.localeCompare(sb) : sb.localeCompare(sa)
    if (metric === 'symbol') return cmpStr(a.symbol || '', b.symbol || '')
    if (metric === 'name')   return cmpStr(a.name   || '', b.name   || '')
    const ba = bestForSymbol(a.symbol || '')
    const bb = bestForSymbol(b.symbol || '')
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
      : { metric, dir: 'desc' }
  )
  const sortIcon = metric => {
    if (sortState.metric !== metric) return <span style={{ color: P.textMuted, marginLeft: 2, fontSize: 10 }}>↕</span>
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
    try { await Promise.all(items.map(item => _setItemLists(item.id, [bulkMoveList]))); onReload(); setSelected(new Set()) }
    catch (e) { console.error(e) }
    finally { setSaving(new Set()) }
  }
  const bulkAdd = async () => {
    if (!bulkAddList || selected.size === 0) return
    const items = watchlist.filter(w => selected.has(w.id))
    setSaving(new Set(items.map(w => w.id)))
    try { await Promise.all(items.map(item => _setItemLists(item.id, [...new Set([...(item.list_ids || []), bulkAddList])]))); onReload() }
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
    padding: '7px 12px',
    borderBottom: `1px solid ${P.border}`,
    borderRight: `1px solid ${P.border}`,
    fontFamily: MONO,
    fontSize: 13,
    color: P.text,
    verticalAlign: 'middle',
    height: 36,
    ...extra,
  })

  const rowBg = (w, isSelected, isOdd) => {
    if (isSelected) return P.selected
    const m = bestForSymbol((w.symbol||'').toUpperCase())?.metrics
    const cagr = m?.cagr
    if (cagr > 10) return isOdd ? '#eaf5ec' : '#f0f8f2'
    if (cagr != null && cagr < 0) return isOdd ? '#f8eaea' : '#faf0f0'
    return isOdd ? P.bgAlt : P.bg
  }

  // ── List filter display ────────────────────────────────────
  const selListNames = filterLists.map(lid => wlLists.find(l => l.id === lid)?.name).filter(Boolean)

  // ── Compact select style for bulk actions ──────────────────
  const bulkSelStyle = {
    background: '#f5f0e8',
    border: `1px solid ${P.borderStrong}`,
    color: P.text,
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
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      }}>

        {/* Título */}
        <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: P.text, flexShrink: 0 }}>
          ⊞ Gestionar Watchlist
        </span>

        {/* Buscador */}
        <div style={{ position: 'relative', width: 180, flexShrink: 0 }}>
          <input type="text" placeholder="Buscar ticker o nombre…"
            value={filterSearch} onChange={e => setFilterSearch(e.target.value)}
            style={{ width: '100%', background: P.bg, border: `1px solid ${P.border}`,
              color: P.text, fontFamily: MONO, fontSize: 12,
              padding: '5px 24px 5px 9px', borderRadius: 5, boxSizing: 'border-box', outline: 'none' }} />
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
            style={{ background: filterLists.length ? P.accentBg : P.bg,
              border: `1px solid ${P.borderStrong}`,
              color: filterLists.length ? P.accentFg : P.textSec,
              fontFamily: MONO, fontSize: 11, padding: '5px 10px', borderRadius: 5,
              cursor: 'pointer', whiteSpace: 'nowrap' }}>
            {filterLists.length
              ? `${selListNames.slice(0,2).join(', ')}${selListNames.length > 2 ? ` +${selListNames.length-2}` : ''}`
              : 'Todas las listas'} ▾
          </button>
          {listFilterOpen && (
            <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 200, marginTop: 4,
              background: P.bg, border: `1px solid ${P.borderStrong}`, borderRadius: 6,
              boxShadow: '0 4px 12px rgba(0,0,0,0.12)', minWidth: 160, padding: '4px 0' }}>
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
                  style={{ padding: '6px 12px', fontSize: 12, color: P.text, cursor: 'pointer',
                    background: filterLists.includes(l.id) ? P.selected : 'transparent',
                    display: 'flex', alignItems: 'center', gap: 8 }}
                  onMouseOver={e => e.currentTarget.style.background = P.hover}
                  onMouseOut={e  => e.currentTarget.style.background = filterLists.includes(l.id) ? P.selected : 'transparent'}>
                  <span style={{ fontSize: 11, color: P.textSec }}>
                    {filterLists.includes(l.id) ? '☑' : '☐'}
                  </span>
                  {l.name}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Contador */}
        <span style={{ fontSize: 12, color: P.textSec }}>
          {sorted.length} activo{sorted.length !== 1 ? 's' : ''}
          {loadingRank && <span style={{ color: '#b87a20', marginLeft: 8 }}>⟳ cargando…</span>}
        </span>

        {/* Acciones masivas — inline compactas, solo cuando hay selección */}
        {selected.size > 0 && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8,
            background: P.accentBg, borderRadius: 6, padding: '4px 12px',
            color: P.accentFg, flexShrink: 0 }}>
            <span style={{ fontSize: 12, fontWeight: 600, marginRight: 2 }}>
              {selected.size} sel.
            </span>
            <span style={{ color: '#6b6560', fontSize: 11 }}>Mover a:</span>
            <select value={bulkMoveList} onChange={e => setBulkMoveList(e.target.value)}
              style={bulkSelStyle}>
              <option value="">— lista —</option>
              {wlLists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <button onClick={bulkMove} disabled={!bulkMoveList} style={bulkBtnStyle(!!bulkMoveList)}>
              Aplicar
            </button>
            <span style={{ color: '#6b6560', fontSize: 11 }}>Añadir a:</span>
            <select value={bulkAddList} onChange={e => setBulkAddList(e.target.value)}
              style={bulkSelStyle}>
              <option value="">— lista —</option>
              {wlLists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
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
          style={{ marginLeft: 'auto', background: P.bg, border: `1px solid ${P.borderStrong}`,
            color: '#8b3030', fontFamily: MONO, fontSize: 12, padding: '5px 12px',
            borderRadius: 5, cursor: 'pointer', flexShrink: 0 }}>
          ✕ Cerrar
        </button>
      </div>

      {/* ── Tabla ── */}
      <div style={{ flex: 1, overflow: 'auto', background: P.bg }}>
        <table style={{ borderCollapse: 'collapse', minWidth: '100%', tableLayout: 'auto' }}>
          <thead>
            {/* Sub-header agrupador para métricas */}
            <tr>
              <th colSpan={4} style={{ ...TH(), background: P.thBg, borderBottom: `1px solid ${P.border}` }} />
              <th colSpan={4} style={{ ...TH(),
                background: '#d8d2c8',
                borderLeft:  `2px solid ${P.borderStrong}`,
                borderRight: `2px solid ${P.borderStrong}`,
                textAlign: 'center', color: P.thFg, fontSize: 10 }}>
                Estrategia favorita · mejor CAGR
              </th>
              <th colSpan={2} style={{ ...TH(), background: P.thBg, borderLeft: `2px solid ${P.borderStrong}`, borderBottom: `1px solid ${P.border}` }} />
            </tr>

            {/* Headers de columna */}
            <tr>
              {/* Checkbox */}
              <th style={{ ...TH(), width: 36, textAlign: 'center', padding: '7px 6px' }}>
                <input type="checkbox" checked={allSelected} onChange={toggleAll}
                  style={{ cursor: 'pointer', width: 14, height: 14 }} />
              </th>
              {/* Ticker */}
              <th style={{ ...TH(), cursor: 'pointer', minWidth: 76 }} onClick={() => handleSort('symbol')}>
                Ticker{sortIcon('symbol')}
              </th>
              {/* Nombre */}
              <th style={{ ...TH(), minWidth: 130, cursor: 'pointer' }} onClick={() => handleSort('name')}>
                Nombre{sortIcon('name')}
              </th>
              {/* Listas */}
              <th style={{ ...TH(), minWidth: 110, borderRight: `2px solid ${P.borderStrong}` }}>Listas</th>

              {/* Métricas de favorita */}
              {[
                ['cagr',    'CAGR%'],
                ['winRate', 'Win%'],
                ['maxDD',   'MaxDD%'],
                ['trades',  'Ops'],
              ].map(([metric, label]) => (
                <th key={metric} onClick={() => handleSort(metric)}
                  style={{ ...TH(),
                    cursor: 'pointer', textAlign: 'right',
                    background: '#d4cfc5',
                    borderLeft:  metric === 'cagr'   ? `2px solid ${P.borderStrong}` : `1px solid ${P.border}`,
                    borderRight: metric === 'trades'  ? `2px solid ${P.borderStrong}` : `1px solid ${P.border}`,
                    minWidth: 68,
                  }}>
                  {label}{sortIcon(metric)}
                </th>
              ))}

              {/* Estrategia (nombre) */}
              <th style={{ ...TH(), minWidth: 130, borderLeft: `2px solid ${P.borderStrong}` }}>
                Estrategia
              </th>
              {/* Temporalidad */}
              <th style={{ ...TH(), minWidth: 80, textAlign: 'center' }}>
                Temporalidad
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

              return (
                <tr key={w.id || w.symbol}
                  style={{ background: bg, opacity: isSaving ? 0.5 : 1, transition: 'background 0.1s' }}
                  onMouseOver={e => { if (!isSelected) e.currentTarget.style.background = P.hover }}
                  onMouseOut={e  => { e.currentTarget.style.background = bg }}>

                  {/* Checkbox */}
                  <td style={{ ...TD(), textAlign: 'center', padding: '7px 6px', width: 36 }}>
                    <input type="checkbox" checked={isSelected} onChange={() => toggleOne(w.id)}
                      style={{ cursor: 'pointer', width: 14, height: 14 }} />
                  </td>

                  {/* Ticker */}
                  <td style={{ ...TD(), fontWeight: 700, color: P.text, whiteSpace: 'nowrap' }}>
                    {w.symbol}
                  </td>

                  {/* Nombre */}
                  <td style={{ ...TD(), color: P.textSec, maxWidth: 180,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    title={w.name}>
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
                      {/* Botón + */}
                      <div style={{ position: 'relative' }} ref={addDropOpen === w.id ? addDropRef : null}>
                        <span onClick={() => setAddDropOpen(prev => prev === w.id ? null : w.id)}
                          style={{ cursor: 'pointer', color: P.textMuted, fontSize: 18,
                            lineHeight: 1, padding: '0 3px', userSelect: 'none', fontWeight: 300 }}
                          title="Añadir a lista">+</span>
                        {addDropOpen === w.id && (
                          <div style={{
                            position: 'absolute', left: 0, top: '100%', zIndex: 200, marginTop: 2,
                            background: P.bg, border: `1px solid ${P.borderStrong}`, borderRadius: 6,
                            boxShadow: '0 4px 12px rgba(0,0,0,0.1)', minWidth: 150, padding: '4px 0',
                          }}>
                            {wlLists.filter(l => !(w.list_ids || []).includes(l.id)).map(l => (
                              <div key={l.id} onClick={() => addToList(w, l.id)}
                                style={{ padding: '6px 12px', fontFamily: MONO, fontSize: 12,
                                  color: P.text, cursor: 'pointer' }}
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

                  {/* CAGR */}
                  <td style={{ ...TD(), background: cagrBg(m?.cagr), color: cagrFg(m?.cagr),
                    textAlign: 'right', fontWeight: 600,
                    borderLeft: `2px solid ${P.borderStrong}`, borderRight: `1px solid ${P.border}` }}>
                    {m?.cagr != null ? `${m.cagr.toFixed(1)}%`
                      : <span style={{ color: P.textMuted }}>—</span>}
                  </td>

                  {/* WinRate */}
                  <td style={{ ...TD(), color: wrFg(m?.winRate),
                    textAlign: 'right', fontWeight: 600, borderRight: `1px solid ${P.border}` }}>
                    {m?.winRate != null ? `${m.winRate.toFixed(0)}%`
                      : <span style={{ color: P.textMuted }}>—</span>}
                  </td>

                  {/* MaxDD */}
                  <td style={{ ...TD(), background: ddBg(m?.maxDD), color: ddFg(m?.maxDD),
                    textAlign: 'right', fontWeight: 600, borderRight: `1px solid ${P.border}` }}>
                    {m?.maxDD != null ? `-${Math.abs(m.maxDD).toFixed(1)}%`
                      : <span style={{ color: P.textMuted }}>—</span>}
                  </td>

                  {/* Ops */}
                  <td style={{ ...TD(), color: P.textSec, textAlign: 'right',
                    borderRight: `2px solid ${P.borderStrong}` }}>
                    {m?.trades != null ? Math.round(m.trades)
                      : <span style={{ color: P.textMuted }}>—</span>}
                  </td>

                  {/* Estrategia — nombre truncado */}
                  <td style={{ ...TD(), borderLeft: `2px solid ${P.borderStrong}`,
                    maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    title={best?.stratName}>
                    {best?.stratName
                      ? <span style={{ color: P.text, fontWeight: 600 }}>{best.stratName}</span>
                      : <span style={{ color: P.textMuted }}>—</span>}
                  </td>

                  {/* Temporalidad — badge */}
                  <td style={{ ...TD(), textAlign: 'center' }}>
                    {best ? (
                      <span style={{
                        ...( best.intervalo === 'semanal'
                            ? P.badgeSemanal
                            : P.badgeDiario),
                        fontFamily: MONO, fontSize: 10,
                        padding: '2px 7px', borderRadius: 4,
                        display: 'inline-block',
                        border: `1px solid ${best.intervalo === 'semanal' ? P.badgeSemanal.border : P.badgeDiario.border}`,
                      }}>
                        {best.intervalo === 'semanal' ? 'Semanal' : 'Diario'}
                      </span>
                    ) : <span style={{ color: P.textMuted }}>—</span>}
                  </td>
                </tr>
              )
            })}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={10}
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
