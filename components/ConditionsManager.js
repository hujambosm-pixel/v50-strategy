import { useState } from 'react'
import { MONO } from '../lib/utils'

const TYPE_LABELS = {
  ema_cross_up:    'EMA Cruce ↑',
  ema_cross_down:  'EMA Cruce ↓',
  price_above_ma:  'Precio > MA',
  price_below_ma:  'Precio < MA',
  close_below_ma:  'Cierre < MA',
  close_above_ma:  'Cierre > MA',
  rsi_above:       'RSI >',
  rsi_below:       'RSI <',
  rsi_cross_up:    'RSI Cruce ↑',
  rsi_cross_down:  'RSI Cruce ↓',
  macd_cross_up:   'MACD Cruce ↑',
  macd_cross_down: 'MACD Cruce ↓',
}

const TYPE_COLOR = {
  ema_cross_up:   '#00d4ff', ema_cross_down:  '#ff4d6d',
  price_above_ma: '#00d4ff', price_below_ma:  '#ff4d6d',
  close_below_ma: '#ff4d6d', close_above_ma:  '#00d4ff',
  rsi_above:      '#ffd166', rsi_below:       '#ffd166',
  rsi_cross_up:   '#ffd166', rsi_cross_down:  '#ffd166',
  macd_cross_up:  '#7ae0a0', macd_cross_down: '#ff7a7a',
}

function formatParams(type, params) {
  if (!params) return '—'
  if (type === 'ema_cross_up' || type === 'ema_cross_down')
    return `fast:${params.ma_fast} slow:${params.ma_slow}`
  if (type === 'price_above_ma' || type === 'price_below_ma' || type === 'close_below_ma' || type === 'close_above_ma')
    return `${params.ma_type||'EMA'}(${params.ma_period})`
  if (type?.startsWith('rsi'))
    return `RSI(${params.period||14})${params.level!=null?' lvl:'+params.level:''}`
  if (type?.startsWith('macd'))
    return `${params.fast||12}/${params.slow||26}/${params.signal||9}`
  return Object.entries(params).map(([k,v])=>`${k}:${v}`).join(' ')
}

function fmtDate(iso) {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleDateString('es-ES',{day:'2-digit',month:'2-digit',year:'2-digit'}) } catch(_) { return '—' }
}

export default function ConditionsManager({ conditions, selectedCondition, onSelect, onNew, onDelete, onReload, loading }) {
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState('')
  const [sortCol, setSortCol] = useState('created_at')
  const [sortDir, setSortDir] = useState('desc')

  const filtered = conditions
    .filter(c => {
      if (search && !c.name?.toLowerCase().includes(search.toLowerCase()) &&
          !c.description?.toLowerCase().includes(search.toLowerCase())) return false
      if (filterType && c.type !== filterType) return false
      return true
    })
    .sort((a, b) => {
      let av = a[sortCol], bv = b[sortCol]
      if (sortCol === 'name') { av = av||''; bv = bv||'' }
      else if (sortCol === 'type') { av = TYPE_LABELS[av]||av||''; bv = TYPE_LABELS[bv]||bv||'' }
      else { av = av||''; bv = bv||'' }
      const cmp = av < bv ? -1 : av > bv ? 1 : 0
      return sortDir === 'asc' ? cmp : -cmp
    })

  const usedTypes = [...new Set(conditions.map(c=>c.type).filter(Boolean))]

  function toggleSort(col) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
  }

  const COL = {display:'flex',alignItems:'center',gap:3,cursor:'pointer',userSelect:'none'}
  const sortIcon = col => sortCol===col ? (sortDir==='asc'?'↑':'↓') : ''

  return (
    <div style={{display:'flex',flexDirection:'column',height:'100%',overflow:'hidden',background:'var(--bg1)'}}>
      {/* ── Toolbar ── */}
      <div style={{display:'flex',alignItems:'center',gap:8,padding:'10px 16px',
        borderBottom:'1px solid var(--border)',background:'var(--bg2)',flexShrink:0,flexWrap:'wrap'}}>
        <span style={{fontFamily:MONO,fontSize:13,fontWeight:700,color:'var(--text1)',letterSpacing:'0.08em'}}>
          CONDICIONES
        </span>
        <span style={{fontFamily:MONO,fontSize:10,color:'var(--text3)',marginLeft:2}}>
          {conditions.length} registradas
        </span>
        <div style={{marginLeft:'auto',display:'flex',gap:6,alignItems:'center',flexWrap:'wrap'}}>
          {/* Search */}
          <input
            value={search}
            onChange={e=>setSearch(e.target.value)}
            placeholder="Buscar…"
            style={{fontFamily:MONO,fontSize:11,padding:'3px 8px',background:'var(--bg3)',
              border:'1px solid var(--border)',borderRadius:4,color:'var(--text1)',width:140,outline:'none'}}
          />
          {/* Type filter */}
          <select value={filterType} onChange={e=>setFilterType(e.target.value)}
            style={{fontFamily:MONO,fontSize:11,padding:'3px 6px',background:'var(--bg3)',
              border:'1px solid var(--border)',borderRadius:4,color:'var(--text2)'}}>
            <option value="">Todos los tipos</option>
            {usedTypes.map(t=><option key={t} value={t}>{TYPE_LABELS[t]||t}</option>)}
          </select>
          {/* Reload */}
          <button onClick={onReload} title="Recargar" disabled={loading}
            style={{fontFamily:MONO,fontSize:12,padding:'3px 8px',background:'transparent',
              border:'1px solid var(--border)',borderRadius:4,color:'var(--text3)',cursor:'pointer'}}>
            {loading ? '⟳' : '↺'}
          </button>
          {/* New */}
          <button onClick={onNew}
            style={{fontFamily:MONO,fontSize:11,padding:'4px 12px',background:'rgba(0,212,255,0.12)',
              border:'1px solid var(--accent)',borderRadius:4,color:'var(--accent)',cursor:'pointer',fontWeight:600}}>
            + Nueva
          </button>
        </div>
      </div>

      {/* ── Table ── */}
      <div style={{flex:1,overflowY:'auto',overflowX:'auto'}}>
        {loading && conditions.length === 0 ? (
          <div style={{fontFamily:MONO,fontSize:12,color:'var(--text3)',padding:32,textAlign:'center'}}>⟳ Cargando…</div>
        ) : filtered.length === 0 ? (
          <div style={{fontFamily:MONO,fontSize:12,color:'var(--text3)',padding:32,textAlign:'center',lineHeight:2}}>
            {conditions.length === 0
              ? <>Sin condiciones guardadas.<br/><button onClick={onNew}
                  style={{marginTop:8,fontFamily:MONO,fontSize:11,padding:'4px 14px',background:'rgba(0,212,255,0.1)',
                    border:'1px solid var(--accent)',borderRadius:4,color:'var(--accent)',cursor:'pointer'}}>
                  Crear primera condición
                </button></>
              : 'Sin resultados para la búsqueda.'
            }
          </div>
        ) : (
          <table style={{width:'100%',borderCollapse:'collapse',fontFamily:MONO,fontSize:11}}>
            <thead>
              <tr style={{background:'var(--bg2)',position:'sticky',top:0,zIndex:1}}>
                {[
                  {key:'name',       label:'Nombre'},
                  {key:'type',       label:'Tipo'},
                  {key:'_params',    label:'Parámetros', noSort:true},
                  {key:'description',label:'Descripción'},
                  {key:'source',     label:'Fuente'},
                  {key:'created_at', label:'Creada'},
                  {key:'_actions',   label:'', noSort:true},
                ].map(col=>(
                  <th key={col.key}
                    onClick={col.noSort ? undefined : ()=>toggleSort(col.key)}
                    style={{padding:'7px 12px',textAlign:'left',color:'var(--text3)',fontWeight:600,
                      borderBottom:'1px solid var(--border)',whiteSpace:'nowrap',
                      cursor:col.noSort?'default':'pointer',letterSpacing:'0.06em',fontSize:10}}>
                    <span style={col.noSort?{}:COL}>{col.label} <span style={{color:'var(--accent)',fontSize:9}}>{!col.noSort&&sortIcon(col.key)}</span></span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((c,i)=>{
                const isSelected = selectedCondition?.id === c.id
                const typeColor = TYPE_COLOR[c.type] || '#7a9bc0'
                return (
                  <tr key={c.id||c.name||i}
                    onClick={()=>onSelect(isSelected ? null : c)}
                    style={{
                      background: isSelected ? 'rgba(0,212,255,0.06)' : i%2===0 ? 'transparent' : 'rgba(255,255,255,0.015)',
                      borderLeft: isSelected ? '2px solid var(--accent)' : '2px solid transparent',
                      cursor:'pointer',transition:'background 0.1s',
                    }}
                    onMouseOver={e=>{if(!isSelected)e.currentTarget.style.background='rgba(0,212,255,0.04)'}}
                    onMouseOut={e=>{if(!isSelected)e.currentTarget.style.background=i%2===0?'transparent':'rgba(255,255,255,0.015)'}}
                  >
                    {/* Name */}
                    <td style={{padding:'7px 12px',color:'var(--text1)',fontWeight:isSelected?700:500,
                      maxWidth:180,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                      {c.name||'—'}
                    </td>
                    {/* Type badge */}
                    <td style={{padding:'7px 12px',whiteSpace:'nowrap'}}>
                      <span style={{background:`${typeColor}18`,border:`1px solid ${typeColor}44`,
                        color:typeColor,borderRadius:3,padding:'1px 6px',fontSize:10}}>
                        {TYPE_LABELS[c.type]||c.type||'—'}
                      </span>
                    </td>
                    {/* Params */}
                    <td style={{padding:'7px 12px',color:'#7ab8d8',fontFamily:MONO,fontSize:10,whiteSpace:'nowrap'}}>
                      {formatParams(c.type, c.params)}
                    </td>
                    {/* Description */}
                    <td style={{padding:'7px 12px',color:'var(--text3)',maxWidth:260,
                      overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                      {c.description||'—'}
                    </td>
                    {/* Source */}
                    <td style={{padding:'7px 12px',whiteSpace:'nowrap'}}>
                      {c.source === 'groq'
                        ? <span style={{color:'#9b72ff',fontSize:10}}>🤖 IA</span>
                        : c.id?.startsWith('local_')
                          ? <span style={{color:'#ffd166',fontSize:10}}>💾 Local</span>
                          : <span style={{color:'var(--text3)',fontSize:10}}>✏ Manual</span>
                      }
                    </td>
                    {/* Date */}
                    <td style={{padding:'7px 12px',color:'var(--text3)',whiteSpace:'nowrap'}}>
                      {fmtDate(c.created_at)}
                    </td>
                    {/* Actions */}
                    <td style={{padding:'7px 10px',whiteSpace:'nowrap',textAlign:'right'}}>
                      <button
                        onClick={e=>{e.stopPropagation();if(confirm(`¿Eliminar condición "${c.name}"?`))onDelete(c.id)}}
                        title="Eliminar"
                        style={{background:'transparent',border:'none',color:'#ff4d6d',cursor:'pointer',
                          fontSize:13,padding:'0 4px',opacity:0.6,transition:'opacity 0.1s'}}
                        onMouseOver={e=>e.currentTarget.style.opacity='1'}
                        onMouseOut={e=>e.currentTarget.style.opacity='0.6'}
                      >✕</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
