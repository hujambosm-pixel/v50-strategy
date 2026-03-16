import { useState } from 'react'
import { MONO } from '../lib/utils'

const SETUP_LABELS = {
  ema_cross_up:        'EMA Cruce ↑',
  ema_cross_down:      'EMA Cruce ↓',
  price_above_ma:      'Precio > MA',
  price_below_ma:      'Precio < MA',
  rsi_above:           'RSI >',
  rsi_below:           'RSI <',
  rsi_cross_up:        'RSI Cruce ↑',
  rsi_cross_down:      'RSI Cruce ↓',
  macd_cross_up:       'MACD Cruce ↑',
  macd_cross_down:     'MACD Cruce ↓',
}

function fmtDate(iso) {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleDateString('es-ES',{day:'2-digit',month:'2-digit',year:'2-digit'}) } catch(_) { return '—' }
}

function fmtCapital(n) {
  if (n == null) return '—'
  return Number(n).toLocaleString('es-ES',{minimumFractionDigits:0,maximumFractionDigits:0}) + ' €'
}

function getSetupLabel(def) {
  const type = def?.setup?.type
  return SETUP_LABELS[type] || type || '—'
}

function getFilterLabel(def) {
  if (!def?.filter?.conditions?.length) return 'Sin filtro'
  return def.filter.conditions.length + (def.filter.conditions.length===1?' condición':' condiciones')
}

function getEmaPairs(def) {
  const s = def?.setup
  if (!s) return '—'
  if (s.ma_fast != null && s.ma_slow != null) return `${s.ma_fast}/${s.ma_slow}`
  return '—'
}

export default function StrategiesManager({ strategies, selectedStrategy, onSelect, onNew, onDelete, onReload, loading }) {
  const [search, setSearch] = useState('')
  const [sortCol, setSortCol] = useState('created_at')
  const [sortDir, setSortDir] = useState('desc')

  const filtered = strategies
    .filter(s => {
      if (!search) return true
      const q = search.toLowerCase()
      return (s.name||'').toLowerCase().includes(q) ||
             (s.symbol||'').toLowerCase().includes(q) ||
             (s.description||'').toLowerCase().includes(q)
    })
    .sort((a, b) => {
      let av = a[sortCol], bv = b[sortCol]
      if (typeof av === 'string') { av = av.toLowerCase(); bv = (bv||'').toLowerCase() }
      else { av = av??0; bv = bv??0 }
      const cmp = av < bv ? -1 : av > bv ? 1 : 0
      return sortDir === 'asc' ? cmp : -cmp
    })

  function toggleSort(col) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
  }

  const sortIcon = col => sortCol===col ? (sortDir==='asc'?'↑':'↓') : ''
  const TH = {padding:'7px 12px',textAlign:'left',color:'var(--text3)',fontWeight:600,
    borderBottom:'1px solid var(--border)',whiteSpace:'nowrap',
    cursor:'pointer',letterSpacing:'0.06em',fontSize:10}

  return (
    <div style={{display:'flex',flexDirection:'column',height:'100%',overflow:'hidden',background:'var(--bg1)'}}>
      {/* ── Toolbar ── */}
      <div style={{display:'flex',alignItems:'center',gap:8,padding:'10px 16px',
        borderBottom:'1px solid var(--border)',background:'var(--bg2)',flexShrink:0,flexWrap:'wrap'}}>
        <span style={{fontFamily:MONO,fontSize:13,fontWeight:700,color:'var(--text1)',letterSpacing:'0.08em'}}>
          ESTRATEGIAS
        </span>
        <span style={{fontFamily:MONO,fontSize:10,color:'var(--text3)',marginLeft:2}}>
          {strategies.length} guardadas
        </span>
        <div style={{marginLeft:'auto',display:'flex',gap:6,alignItems:'center',flexWrap:'wrap'}}>
          <input
            value={search}
            onChange={e=>setSearch(e.target.value)}
            placeholder="Buscar…"
            style={{fontFamily:MONO,fontSize:11,padding:'3px 8px',background:'var(--bg3)',
              border:'1px solid var(--border)',borderRadius:4,color:'var(--text1)',width:140,outline:'none'}}
          />
          <button onClick={onReload} title="Recargar" disabled={loading}
            style={{fontFamily:MONO,fontSize:12,padding:'3px 8px',background:'transparent',
              border:'1px solid var(--border)',borderRadius:4,color:'var(--text3)',cursor:'pointer'}}>
            {loading ? '⟳' : '↺'}
          </button>
          <button onClick={onNew}
            style={{fontFamily:MONO,fontSize:11,padding:'4px 12px',background:'rgba(0,212,255,0.12)',
              border:'1px solid var(--accent)',borderRadius:4,color:'var(--accent)',cursor:'pointer',fontWeight:600}}>
            + Nueva
          </button>
        </div>
      </div>

      {/* ── Table ── */}
      <div style={{flex:1,overflowY:'auto',overflowX:'auto'}}>
        {loading && strategies.length === 0 ? (
          <div style={{fontFamily:MONO,fontSize:12,color:'var(--text3)',padding:32,textAlign:'center'}}>⟳ Cargando…</div>
        ) : filtered.length === 0 ? (
          <div style={{fontFamily:MONO,fontSize:12,color:'var(--text3)',padding:32,textAlign:'center',lineHeight:2}}>
            {strategies.length === 0
              ? <>Sin estrategias guardadas.<br/><button onClick={onNew}
                  style={{marginTop:8,fontFamily:MONO,fontSize:11,padding:'4px 14px',background:'rgba(0,212,255,0.1)',
                    border:'1px solid var(--accent)',borderRadius:4,color:'var(--accent)',cursor:'pointer'}}>
                  Crear primera estrategia
                </button></>
              : 'Sin resultados para la búsqueda.'
            }
          </div>
        ) : (
          <table style={{width:'100%',borderCollapse:'collapse',fontFamily:MONO,fontSize:11}}>
            <thead>
              <tr style={{background:'var(--bg2)',position:'sticky',top:0,zIndex:1}}>
                {[
                  {key:'_color',      label:'',          noSort:true},
                  {key:'name',        label:'Nombre'},
                  {key:'symbol',      label:'Símbolo'},
                  {key:'_setup',      label:'Setup',     noSort:true},
                  {key:'_emas',       label:'EMAs',      noSort:true},
                  {key:'years',       label:'Años'},
                  {key:'capital_ini', label:'Capital'},
                  {key:'_filter',     label:'Filtro',    noSort:true},
                  {key:'created_at',  label:'Creada'},
                  {key:'_actions',    label:'',          noSort:true},
                ].map(col=>(
                  <th key={col.key}
                    onClick={col.noSort ? undefined : ()=>toggleSort(col.key)}
                    style={{...TH,cursor:col.noSort?'default':'pointer'}}>
                    {col.label} <span style={{color:'var(--accent)',fontSize:9}}>{!col.noSort&&sortIcon(col.key)}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((s,i)=>{
                const isSelected = selectedStrategy?.id === s.id
                const color = s.color || '#00d4ff'
                const def = s.definition || {}
                return (
                  <tr key={s.id||i}
                    onClick={()=>onSelect(isSelected ? null : s)}
                    style={{
                      background: isSelected ? 'rgba(0,212,255,0.06)' : i%2===0 ? 'transparent' : 'rgba(255,255,255,0.015)',
                      borderLeft: isSelected ? `2px solid ${color}` : '2px solid transparent',
                      cursor:'pointer',transition:'background 0.1s',
                    }}
                    onMouseOver={e=>{if(!isSelected)e.currentTarget.style.background='rgba(0,212,255,0.04)'}}
                    onMouseOut={e=>{if(!isSelected)e.currentTarget.style.background=i%2===0?'transparent':'rgba(255,255,255,0.015)'}}
                  >
                    {/* Color dot */}
                    <td style={{padding:'7px 8px 7px 14px',width:16}}>
                      <span style={{display:'inline-block',width:8,height:8,borderRadius:'50%',
                        background:color,boxShadow:`0 0 5px ${color}88`,flexShrink:0}}/>
                    </td>
                    {/* Name */}
                    <td style={{padding:'7px 12px',color:'var(--text1)',fontWeight:isSelected?700:500,
                      maxWidth:160,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                      {s.name||'—'}
                    </td>
                    {/* Symbol */}
                    <td style={{padding:'7px 12px',color:'#7ab8d8',whiteSpace:'nowrap'}}>
                      {s.symbol||'—'}
                    </td>
                    {/* Setup */}
                    <td style={{padding:'7px 12px',whiteSpace:'nowrap'}}>
                      <span style={{background:'rgba(0,212,255,0.1)',border:'1px solid rgba(0,212,255,0.3)',
                        color:'#7ab8d8',borderRadius:3,padding:'1px 6px',fontSize:10}}>
                        {getSetupLabel(def)}
                      </span>
                    </td>
                    {/* EMAs */}
                    <td style={{padding:'7px 12px',color:'var(--text3)',whiteSpace:'nowrap'}}>
                      {getEmaPairs(def)}
                    </td>
                    {/* Years */}
                    <td style={{padding:'7px 12px',color:'var(--text3)',whiteSpace:'nowrap'}}>
                      {s.years||def?.sizing?.years||'—'}
                    </td>
                    {/* Capital */}
                    <td style={{padding:'7px 12px',color:'var(--text3)',whiteSpace:'nowrap'}}>
                      {fmtCapital(s.capital_ini||def?.sizing?.amount)}
                    </td>
                    {/* Filter */}
                    <td style={{padding:'7px 12px',color:'var(--text3)',whiteSpace:'nowrap',fontSize:10}}>
                      {getFilterLabel(def)}
                    </td>
                    {/* Date */}
                    <td style={{padding:'7px 12px',color:'var(--text3)',whiteSpace:'nowrap'}}>
                      {fmtDate(s.created_at)}
                    </td>
                    {/* Actions */}
                    <td style={{padding:'7px 10px',whiteSpace:'nowrap',textAlign:'right'}}>
                      <button
                        onClick={e=>{e.stopPropagation();if(confirm(`¿Eliminar estrategia "${s.name}"?`))onDelete(s.id)}}
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
