import { useState, useEffect, useCallback } from 'react'
import { MONO, fmt } from '../lib/utils'
import { getSupaUrl, getSupaH } from '../lib/supabase'

// ── Carga métricas de ranking_results agrupadas por strategy_id ──
async function loadRankingMetrics() {
  let url = `${getSupaUrl()}/rest/v1/ranking_results?select=symbol,strategy_id,score,score_historico,win_rate,cagr_simple,max_drawdown,total_trades&limit=20000`
  let res = await fetch(url, { headers: getSupaH() })
  if (!res.ok) {
    url = `${getSupaUrl()}/rest/v1/ranking_results?select=symbol,strategy_id,score,win_rate,cagr_simple,max_drawdown,total_trades&limit=20000`
    res = await fetch(url, { headers: getSupaH() })
  }
  if (!res.ok) return {}
  const rows = (await res.json()) || []
  const map = {}
  rows.forEach(r => {
    const sid = r.strategy_id || '__null__'
    if (!map[sid]) map[sid] = []
    map[sid].push(r)
  })
  return map
}

// ── Tema tipo libreta (igual que WatchlistManager) ──
const P = {
  bg:           '#f5f0e8',
  bgAlt:        '#ede8df',
  bgRow:        '#faf7f2',
  bgRowAlt:     '#f0ebe3',
  text:         '#1a1510',
  textSec:      '#4a3c2e',
  textMuted:    '#9a8a78',
  border:       '#d4c9b8',
  borderStrong: '#b8a898',
  accent:       '#1a6b3a',
  accentFg:     '#fff',
}

const TH = (extra = {}) => ({
  padding: '4px 8px', fontFamily: MONO, fontSize: 10, fontWeight: 700,
  letterSpacing: '0.06em', textTransform: 'uppercase',
  background: '#d4c9b8', color: '#4a3c2e',
  borderBottom: `2px solid ${P.borderStrong}`,
  whiteSpace: 'nowrap', userSelect: 'none',
  ...extra,
})

const TD = (extra = {}) => ({
  padding: '3px 8px', fontFamily: MONO, fontSize: 11,
  borderBottom: `1px solid ${P.border}`,
  ...extra,
})

const cagrFg = v => v == null ? P.textMuted : v > 10 ? '#1a5c30' : v > 0 ? '#386641' : '#8b1a1a'
const winFg  = v => v == null ? P.textMuted : v >= 50 ? '#1a5c30' : '#8b1a1a'
const ddFg   = v => v == null ? P.textMuted : Math.abs(v) > 20 ? '#8b1a1a' : '#4a3c2e'

function readIntervalo(s) {
  try {
    const p = typeof s?.params === 'string' ? JSON.parse(s.params || '{}') : (s?.params || {})
    return p.intervalo || 'diario'
  } catch { return 'diario' }
}

export default function StrategyManager({
  strategies = [],
  onClose,
  onEdit,
  onDelete,
  onToggleEnabled,
  onNew,
}) {
  const [metricsMap, setMetricsMap] = useState({})
  const [loadingMetrics, setLoadingMetrics] = useState(true)
  const [sortKey, setSortKey]   = useState('name')
  const [sortDir, setSortDir]   = useState('asc')
  const [search, setSearch]     = useState('')
  const [onlyEnabled, setOnlyEnabled] = useState(false)
  const [selected, setSelected] = useState(new Set())

  useEffect(() => {
    setLoadingMetrics(true)
    loadRankingMetrics()
      .then(map => setMetricsMap(map))
      .catch(() => {})
      .finally(() => setLoadingMetrics(false))
  }, [])

  const getMetrics = useCallback((stratId) => {
    const rows = metricsMap[stratId || '__null__'] || []
    if (!rows.length) return null
    const valid = rows.filter(r => r.cagr_simple != null || r.win_rate != null)
    if (!valid.length) return null
    const n = valid.length
    const cagrMean = valid.reduce((s, r) => s + (r.cagr_simple ?? 0), 0) / n
    const winMean  = valid.reduce((s, r) => s + (r.win_rate   ?? 0), 0) / n
    const ddMean   = valid.reduce((s, r) => s + (r.max_drawdown ?? 0), 0) / n
    const totalOps = rows.reduce((s, r) => s + (r.total_trades ?? 0), 0)
    const symbols  = rows.length
    return { cagrMean, winMean, ddMean, totalOps, symbols }
  }, [metricsMap])

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const sortIcon = (key) => (
    <span style={{ marginLeft: 3, fontSize: 9, opacity: sortKey === key ? 1 : 0.35 }}>
      {sortKey === key ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
    </span>
  )

  const q = search.toLowerCase()
  let list = strategies.filter(s => {
    if (onlyEnabled && s.enabled === false) return false
    return !q || (s.name || '').toLowerCase().includes(q)
  })

  list = list.slice().sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1
    if (sortKey === 'name')      return dir * (a.name || '').localeCompare(b.name || '')
    if (sortKey === 'intervalo') return dir * readIntervalo(a).localeCompare(readIntervalo(b))
    if (sortKey === 'capital')   return dir * ((a.capital_ini ?? 0) - (b.capital_ini ?? 0))
    if (sortKey === 'years')     return dir * ((a.years ?? 0) - (b.years ?? 0))
    if (sortKey === 'enabled')   return dir * ((a.enabled === false ? 0 : 1) - (b.enabled === false ? 0 : 1))
    if (sortKey === 'cagr')      return dir * ((getMetrics(a.id)?.cagrMean ?? -999) - (getMetrics(b.id)?.cagrMean ?? -999))
    if (sortKey === 'win')       return dir * ((getMetrics(a.id)?.winMean  ?? -999) - (getMetrics(b.id)?.winMean  ?? -999))
    if (sortKey === 'dd')        return dir * ((getMetrics(a.id)?.ddMean   ?? -999) - (getMetrics(b.id)?.ddMean   ?? -999))
    if (sortKey === 'ops')       return dir * ((getMetrics(a.id)?.totalOps ?? 0)    - (getMetrics(b.id)?.totalOps ?? 0))
    return 0
  })

  const allSelected = list.length > 0 && list.every(s => selected.has(s.id))
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(list.map(s => s.id)))

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 50,
      background: P.bg,
      display: 'flex', flexDirection: 'column',
    }}>
      {/* ── Header ── */}
      <div style={{
        background: P.bgAlt,
        borderBottom: `2px solid ${P.borderStrong}`,
        padding: '8px 14px',
        display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, flexWrap: 'wrap',
      }}>
        <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: P.text, flex: 1, minWidth: 120 }}>
          ⊞ Gestionar estrategias
        </span>

        {/* Búsqueda */}
        <div style={{ position: 'relative' }}>
          <input
            type="text"
            placeholder="🔍 Buscar..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: 160, background: P.bg, border: `1px solid ${P.border}`, borderRadius: 4,
              color: P.text, fontFamily: MONO, fontSize: 11, padding: '4px 22px 4px 8px', outline: 'none' }}
          />
          {search && (
            <span onClick={() => setSearch('')}
              style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
                cursor: 'pointer', color: P.textMuted, fontSize: 11 }}>✕</span>
          )}
        </div>

        {/* Toggle habilitadas/todas */}
        <button
          onClick={() => setOnlyEnabled(v => !v)}
          style={{ fontFamily: MONO, fontSize: 11, padding: '4px 10px', borderRadius: 4,
            background: onlyEnabled ? P.accent : P.bg,
            border: `1px solid ${onlyEnabled ? P.accent : P.border}`,
            color: onlyEnabled ? P.accentFg : P.textSec, cursor: 'pointer', whiteSpace: 'nowrap' }}>
          {onlyEnabled ? '✓ Solo habilitadas' : 'Todas'}
        </button>

        <button
          onClick={() => onNew && onNew()}
          style={{ fontFamily: MONO, fontSize: 11, padding: '4px 10px', borderRadius: 4,
            background: P.accent, border: `1px solid ${P.accent}`, color: P.accentFg, cursor: 'pointer' }}>
          + Nueva
        </button>

        <button
          onClick={onClose}
          style={{ background: 'transparent', border: `1px solid ${P.border}`, color: P.textMuted,
            fontFamily: MONO, fontSize: 11, padding: '4px 9px', borderRadius: 4, cursor: 'pointer' }}>
          ✕ Cerrar
        </button>
      </div>

      {/* ── Tabla ── */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860 }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
            <tr>
              <th style={TH({ width: 28, textAlign: 'center' })}>
                <input type="checkbox" checked={allSelected} onChange={toggleAll}
                  style={{ cursor: 'pointer', width: 12, height: 12, accentColor: P.accent }} />
              </th>
              <th style={TH({ width: 20 })} title="Color" />
              <th style={TH({ cursor: 'pointer', textAlign: 'left', minWidth: 140 })} onClick={() => handleSort('name')}>
                Nombre{sortIcon('name')}
              </th>
              <th style={TH({ cursor: 'pointer', textAlign: 'center', width: 60 })} onClick={() => handleSort('intervalo')}>
                Interv.{sortIcon('intervalo')}
              </th>
              <th style={TH({ cursor: 'pointer', textAlign: 'right', width: 90 })} onClick={() => handleSort('capital')}>
                Capital{sortIcon('capital')}
              </th>
              <th style={TH({ cursor: 'pointer', textAlign: 'right', width: 52 })} onClick={() => handleSort('years')}>
                Años{sortIcon('years')}
              </th>
              <th style={TH({ cursor: 'pointer', textAlign: 'right', background: '#c8d4b0', width: 88 })} onClick={() => handleSort('cagr')}>
                CAGR med.{sortIcon('cagr')}
              </th>
              <th style={TH({ cursor: 'pointer', textAlign: 'right', background: '#c8d4b0', width: 78 })} onClick={() => handleSort('win')}>
                Win% med.{sortIcon('win')}
              </th>
              <th style={TH({ cursor: 'pointer', textAlign: 'right', background: '#c8d4b0', width: 84 })} onClick={() => handleSort('dd')}>
                MaxDD med.{sortIcon('dd')}
              </th>
              <th style={TH({ cursor: 'pointer', textAlign: 'right', background: '#c8d4b0', width: 76 })} onClick={() => handleSort('ops')}>
                Ops tot.{sortIcon('ops')}
              </th>
              <th style={TH({ cursor: 'pointer', textAlign: 'center', width: 82 })} onClick={() => handleSort('enabled')}>
                Habilitada{sortIcon('enabled')}
              </th>
              <th style={TH({ textAlign: 'center', width: 72 })}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {list.map((s, i) => {
              const isOdd  = i % 2 === 1
              const bg     = isOdd ? P.bgRowAlt : P.bgRow
              const m      = getMetrics(s.id)
              const isEna  = s.enabled !== false
              const intv   = readIntervalo(s)
              const isSem  = intv === 'semanal'
              const col    = s.color || '#00d4ff'
              const isSel  = selected.has(s.id)
              const metBg  = isOdd ? '#edf2e6' : '#f3f8ed'

              return (
                <tr key={s.id}
                  style={{ background: isSel ? 'rgba(26,107,58,0.07)' : bg, opacity: isEna ? 1 : 0.55 }}
                  onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = isOdd ? '#e8e3da' : '#ede8df' }}
                  onMouseLeave={e => { e.currentTarget.style.background = isSel ? 'rgba(26,107,58,0.07)' : bg }}>

                  {/* Checkbox */}
                  <td style={TD({ textAlign: 'center' })}>
                    <input type="checkbox" checked={isSel}
                      onChange={() => setSelected(prev => {
                        const next = new Set(prev)
                        next.has(s.id) ? next.delete(s.id) : next.add(s.id)
                        return next
                      })}
                      style={{ cursor: 'pointer', width: 12, height: 12, accentColor: P.accent }} />
                  </td>

                  {/* Color */}
                  <td style={TD({ textAlign: 'center' })}>
                    <span style={{
                      display: 'inline-block', width: 13, height: 13, borderRadius: 3,
                      background: col, border: '1px solid rgba(0,0,0,0.18)', verticalAlign: 'middle',
                    }} />
                  </td>

                  {/* Nombre */}
                  <td style={TD({ color: P.text, fontWeight: 600, maxWidth: 200 })}>
                    <span
                      onClick={() => onEdit && onEdit(s)}
                      title="Abrir editor de estrategia"
                      style={{ cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dotted',
                        textDecorationColor: P.textMuted, overflow: 'hidden', textOverflow: 'ellipsis',
                        display: 'inline-block', maxWidth: '100%', verticalAlign: 'middle' }}>
                      {s.name || '—'}
                    </span>
                    {!isEna && (
                      <span style={{ marginLeft: 5, fontSize: 9, color: '#8b1a1a',
                        background: 'rgba(139,26,26,0.1)', border: '1px solid rgba(139,26,26,0.25)',
                        padding: '1px 4px', borderRadius: 3, verticalAlign: 'middle' }}>
                        deshabilitada
                      </span>
                    )}
                  </td>

                  {/* Intervalo */}
                  <td style={TD({ textAlign: 'center' })}>
                    <span style={{
                      fontSize: 9, padding: '1px 5px', borderRadius: 3,
                      border: `1px solid ${isSem ? '#a07820' : '#2d6e4e'}`,
                      background: isSem ? 'rgba(240,192,64,0.14)' : 'rgba(76,175,130,0.14)',
                      color: isSem ? '#8a5c00' : '#1a5c30',
                    }}>
                      {isSem ? 'Semanal' : 'Diario'}
                    </span>
                  </td>

                  {/* Capital */}
                  <td style={TD({ textAlign: 'right', color: P.textSec })}>
                    {s.capital_ini != null ? fmt(s.capital_ini, 0) : <span style={{ color: P.textMuted }}>—</span>}
                  </td>

                  {/* Años */}
                  <td style={TD({ textAlign: 'right', color: P.textSec })}>
                    {s.years ?? <span style={{ color: P.textMuted }}>—</span>}
                  </td>

                  {/* CAGR medio */}
                  <td style={TD({ textAlign: 'right', fontWeight: 600, background: metBg, color: m ? cagrFg(m.cagrMean) : P.textMuted })}>
                    {m ? `${fmt(m.cagrMean, 1)}%` : <span style={{ color: P.textMuted }}>—</span>}
                  </td>

                  {/* Win% medio */}
                  <td style={TD({ textAlign: 'right', fontWeight: 600, background: metBg, color: m ? winFg(m.winMean) : P.textMuted })}>
                    {m ? `${fmt(m.winMean, 0)}%` : <span style={{ color: P.textMuted }}>—</span>}
                  </td>

                  {/* MaxDD medio */}
                  <td style={TD({ textAlign: 'right', fontWeight: 600, background: metBg, color: m ? ddFg(m.ddMean) : P.textMuted })}>
                    {m ? `-${fmt(Math.abs(m.ddMean), 1)}%` : <span style={{ color: P.textMuted }}>—</span>}
                  </td>

                  {/* Ops totales */}
                  <td style={TD({ textAlign: 'right', background: metBg, color: P.textSec })}>
                    {m ? fmt(m.totalOps, 0) : <span style={{ color: P.textMuted }}>—</span>}
                  </td>

                  {/* Toggle habilitada */}
                  <td style={TD({ textAlign: 'center' })}>
                    <div
                      onClick={() => onToggleEnabled && onToggleEnabled(s.id, !isEna)}
                      title={isEna ? 'Deshabilitar — se excluye del Ranking automático y del selector de estrategia activa' : 'Habilitar estrategia'}
                      style={{
                        display: 'inline-flex', alignItems: 'center',
                        width: 30, height: 15, borderRadius: 8, position: 'relative',
                        cursor: 'pointer', transition: 'background 0.2s',
                        background: isEna ? P.accent : '#c4b8a8',
                      }}>
                      <div style={{
                        position: 'absolute', width: 11, height: 11, borderRadius: '50%',
                        background: '#fff', transition: 'left 0.2s',
                        left: isEna ? 17 : 2, boxShadow: '0 1px 2px rgba(0,0,0,0.25)',
                      }} />
                    </div>
                  </td>

                  {/* Acciones */}
                  <td style={TD({ textAlign: 'center' })}>
                    <div style={{ display: 'inline-flex', gap: 3 }}>
                      <button
                        onClick={() => onEdit && onEdit(s)}
                        title="Editar estrategia"
                        style={{ background: 'transparent', border: `1px solid ${P.border}`, color: P.textSec,
                          fontFamily: MONO, fontSize: 11, padding: '2px 6px', borderRadius: 3, cursor: 'pointer' }}>
                        ✏
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`¿Eliminar "${s.name}"?\nEsta acción no se puede deshacer.`))
                            onDelete && onDelete(s.id)
                        }}
                        title="Eliminar estrategia"
                        style={{ background: 'transparent', border: `1px solid ${P.border}`, color: P.textSec,
                          fontFamily: MONO, fontSize: 11, padding: '2px 6px', borderRadius: 3, cursor: 'pointer' }}
                        onMouseEnter={e => { e.currentTarget.style.color = '#8b1a1a'; e.currentTarget.style.borderColor = '#c44' }}
                        onMouseLeave={e => { e.currentTarget.style.color = P.textSec;  e.currentTarget.style.borderColor = P.border }}>
                        🗑
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
            {!loadingMetrics && list.length === 0 && (
              <tr>
                <td colSpan={12} style={{ padding: '28px 14px', textAlign: 'center',
                  fontFamily: MONO, fontSize: 12, color: P.textMuted }}>
                  {search ? `Sin resultados para "${search}".` : 'Sin estrategias.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {loadingMetrics && (
          <div style={{ padding: '18px', textAlign: 'center',
            fontFamily: MONO, fontSize: 12, color: P.textMuted }}>
            ⟳ Cargando métricas de ranking…
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <div style={{ background: P.bgAlt, borderTop: `1px solid ${P.border}`,
        padding: '5px 14px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <span style={{ fontFamily: MONO, fontSize: 10, color: P.textMuted }}>
          {list.length} estrategia{list.length !== 1 ? 's' : ''}
          {' · '}{strategies.filter(s => s.enabled !== false).length} habilitadas
        </span>
        {selected.size > 0 && (
          <span style={{ fontFamily: MONO, fontSize: 10, color: P.textSec }}>
            {selected.size} seleccionada{selected.size !== 1 ? 's' : ''}
          </span>
        )}
        <div style={{ flex: 1 }} />
        <span style={{ fontFamily: MONO, fontSize: 9, color: P.textMuted, fontStyle: 'italic' }}>
          Columnas de métricas: promedio sobre todos los activos con datos de ranking en Supabase
        </span>
      </div>
    </div>
  )
}
