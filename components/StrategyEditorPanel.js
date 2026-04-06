import { useState, useRef, useEffect } from 'react'
import { MONO } from '../lib/utils'

// ── Data ─────────────────────────────────────────────────────────────
const ROLES = [
  { key:'filter',     label:'FILTER',     color:'#4a9eff', desc:'Condición global de mercado' },
  { key:'setup',      label:'SETUP',      color:'#00d4ff', desc:'Señal de alerta/espera' },
  { key:'trigger',    label:'TRIGGER',    color:'#00e5a0', desc:'Disparo de entrada' },
  { key:'abort',      label:'ABORT',      color:'#ff7a7a', desc:'Cancelar entrada pendiente' },
  { key:'stop_loss',  label:'STOP',       color:'#ff4d6d', desc:'Límite de pérdida' },
  { key:'exit',       label:'EXIT',       color:'#ffd166', desc:'Señal de salida' },
  { key:'management', label:'MANAGEMENT', color:'#9b72ff', desc:'Gestión de posición' },
]

const OPS = {
  ema:    [{v:'cross_up',l:'cruza al alza'},{v:'cross_down',l:'cruza a la baja'}],
  precio: [{v:'above',l:'sobre MA'},{v:'below',l:'bajo MA'}],
  cierre: [{v:'above',l:'sobre MA'},{v:'below',l:'bajo MA'}],
  rsi:    [{v:'above',l:'sobre nivel'},{v:'below',l:'bajo nivel'},{v:'cross_up',l:'cruza ↑ nivel'},{v:'cross_down',l:'cruza ↓ nivel'}],
  macd:   [{v:'cross_up',l:'cruza ↑ señal'},{v:'cross_down',l:'cruza ↓ señal'}],
}

const CMAP = {
  'ema.cross_up':'ema_cross_up','ema.cross_down':'ema_cross_down',
  'precio.above':'price_above_ma','precio.below':'price_below_ma',
  'cierre.above':'close_above_ma','cierre.below':'close_below_ma',
  'rsi.above':'rsi_above','rsi.below':'rsi_below',
  'rsi.cross_up':'rsi_cross_up','rsi.cross_down':'rsi_cross_down',
  'macd.cross_up':'macd_cross_up','macd.cross_down':'macd_cross_down',
}
const CREV = Object.fromEntries(Object.entries(CMAP).map(([k,v])=>[v,k.split('.')]))

const IND_DEFAULTS = {
  ema:    {ma_fast:10,ma_slow:20},
  precio: {ma_period:50,ma_type:'EMA'},
  cierre: {ma_period:50,ma_type:'EMA'},
  rsi:    {period:14,level:50},
  macd:   {fast:12,slow:26,signal:9},
}

const TEMPLATES = [
  {label:'📈 Cruce EMA 10/20', def:{
    setup:{type:'ema_cross_up',ma_fast:10,ma_slow:20},
    trigger:{type:'ema_cross_up',ma_fast:10,ma_slow:20},
    abort:{type:'ema_cross_down',ma_fast:10,ma_slow:20},
    stop_loss:{type:'tecnico',ma_period:10},
    exit:{type:'ema_cross_down',ma_fast:10,ma_slow:20},
    management:{sin_perdidas:true,reentry:true},
  }},
  {label:'📉 RSI Sobrevendido', def:{
    setup:{type:'rsi_below',period:14,level:30},
    trigger:{type:'rsi_cross_up',period:14,level:30},
    stop_loss:{type:'tecnico',ma_period:14},
    exit:{type:'rsi_above',period:14,level:70},
    management:{sin_perdidas:true,reentry:false},
  }},
  {label:'🚀 Cruce MACD', def:{
    setup:{type:'macd_cross_up',fast:12,slow:26,signal:9},
    trigger:{type:'macd_cross_up',fast:12,slow:26,signal:9},
    abort:{type:'macd_cross_down',fast:12,slow:26,signal:9},
    stop_loss:{type:'tecnico',ma_period:20},
    exit:{type:'macd_cross_down',fast:12,slow:26,signal:9},
    management:{sin_perdidas:false,reentry:true},
  }},
  {label:'🛡️ EMA 200 Filter', def:{
    filter:{type:'price_above_ma',ma_period:200,ma_type:'EMA'},
    setup:{type:'ema_cross_up',ma_fast:10,ma_slow:50},
    trigger:{type:'close_above_ma',ma_period:10,ma_type:'EMA'},
    stop_loss:{type:'tecnico',ma_period:50},
    exit:{type:'close_below_ma',ma_period:10,ma_type:'EMA'},
    management:{sin_perdidas:true,reentry:true},
  }},
]

// ── Styles ────────────────────────────────────────────────────────────
const INPUT = {
  width:'100%', background:'var(--bg3)', border:'1px solid var(--border)',
  color:'var(--text1)', fontFamily:MONO, fontSize:11,
  padding:'6px 8px', borderRadius:4, boxSizing:'border-box',
}
const SEL = {
  background:'var(--bg3)', border:'1px solid var(--border)',
  color:'var(--text1)', fontFamily:MONO, fontSize:11,
  padding:'4px 6px', borderRadius:3, cursor:'pointer', outline:'none',
}

// ── Path helpers ──────────────────────────────────────────────────────
function getByPath(obj, path) {
  return path.split('.').reduce((acc, k) => acc?.[k], obj)
}
function setByPath(obj, path, value) {
  const keys = path.split('.')
  if (keys.length === 1) return { ...obj, [keys[0]]: value }
  return { ...obj, [keys[0]]: setByPath(obj?.[keys[0]] || {}, keys.slice(1).join('.'), value) }
}

// ── Summary fields — qué parámetros mostrar en vista rápida ──────────
function getTemplateSummaryFields(definition) {
  const rows = []
  const setup = definition?.setup
  const exit  = definition?.exit
  const stop  = definition?.stop_loss

  if (setup) {
    const t = setup.type
    if (t === 'ema_cross_up' || t === 'ema_cross_down') {
      rows.push({ label:'ENTRADA', color:'#00d4ff', desc: t === 'ema_cross_up' ? 'EMA cruza ↑' : 'EMA cruza ↓',
        params:[
          { label:'EMA rápida', path:'setup.ma_fast', min:1,   max:500 },
          { label:'EMA lenta',  path:'setup.ma_slow', min:2,   max:500 },
        ]})
    } else if (t?.startsWith('rsi_')) {
      const desc = t==='rsi_cross_up'?'RSI cruza ↑ nivel':t==='rsi_cross_down'?'RSI cruza ↓ nivel':t==='rsi_above'?'RSI > nivel':'RSI < nivel'
      rows.push({ label:'ENTRADA', color:'#a78bfa', desc,
        params:[
          { label:'Período', path:'setup.period', min:2, max:50 },
          { label:'Nivel',   path:'setup.level',  min:1, max:99 },
        ]})
    } else if (t?.startsWith('macd_')) {
      rows.push({ label:'ENTRADA', color:'#fb923c', desc: t==='macd_cross_up' ? 'MACD cruza ↑ señal' : 'MACD cruza ↓ señal',
        params:[
          { label:'Rápida', path:'setup.fast',   min:2, max:100 },
          { label:'Lenta',  path:'setup.slow',   min:3, max:200 },
          { label:'Señal',  path:'setup.signal', min:2, max:50  },
        ]})
    } else if (t === 'price_above_ma' || t === 'price_below_ma' || t === 'close_above_ma' || t === 'close_below_ma') {
      const desc = t.includes('above') ? 'Precio/Cierre > MA' : 'Precio/Cierre < MA'
      rows.push({ label:'ENTRADA', color:'#00d4ff', desc,
        params:[
          { label:'Período MA', path:'setup.ma_period', min:2, max:500 },
        ]})
    }
  }

  if (exit) {
    const t = exit.type
    if (t === 'close_below_ma' || t === 'price_below_ma' || t === 'close_above_ma') {
      rows.push({ label:'SALIDA', color:'#ffd166', desc: t.includes('above') ? 'Cierre sobre MA' : 'Cierre bajo MA',
        params:[
          { label:'Período MA', path:'exit.ma_period', min:1, max:500 },
        ]})
    } else if (t === 'rsi_above' || t === 'rsi_below') {
      rows.push({ label:'SALIDA', color:'#ffd166', desc: t === 'rsi_above' ? 'RSI supera nivel' : 'RSI baja de nivel',
        params:[
          { label:'Período', path:'exit.period', min:2, max:50 },
          { label:'Nivel',   path:'exit.level',  min:1, max:99 },
        ]})
    } else if (t?.startsWith('macd_')) {
      rows.push({ label:'SALIDA', color:'#ffd166', desc:'MACD cruza señal',
        params:[
          { label:'Rápida', path:'exit.fast',   min:2, max:100 },
          { label:'Lenta',  path:'exit.slow',   min:3, max:200 },
          { label:'Señal',  path:'exit.signal', min:2, max:50  },
        ]})
    } else if (t === 'ema_cross_down') {
      rows.push({ label:'SALIDA', color:'#ffd166', desc:'EMA cruza ↓',
        params:[
          { label:'EMA rápida', path:'exit.ma_fast', min:1, max:500 },
          { label:'EMA lenta',  path:'exit.ma_slow', min:2, max:500 },
        ]})
    }
  }

  if (stop) {
    const t = stop.type
    if (t === 'tecnico') {
      rows.push({ label:'STOP', color:'#ff4d6d', desc:'Stop técnico (MA)',
        params:[
          { label:'Período MA', path:'stop_loss.ma_period', min:1, max:200 },
        ]})
    } else if (t === 'fixed_pct') {
      rows.push({ label:'STOP', color:'#ff4d6d', desc:'Stop fijo desde entrada',
        params:[
          { label:'%', path:'stop_loss.params.pct', min:0.5, max:50, step:0.5 },
        ]})
    } else if (t === 'atr_based') {
      rows.push({ label:'STOP', color:'#ff4d6d', desc:'Stop ATR dinámico',
        params:[
          { label:'Período ATR', path:'stop_loss.atr_period', min:5,   max:50 },
          { label:'×Mult',       path:'stop_loss.atr_mult',   min:0.5, max:5, step:0.5 },
        ]})
    } else if (t === 'trailing_atr') {
      rows.push({ label:'STOP', color:'#ff4d6d', desc:'Stop ATR trailing',
        params:[
          { label:'Período ATR', path:'stop_loss.params.atr_period', min:5,   max:50 },
          { label:'×Mult',       path:'stop_loss.params.atr_mult',   min:0.5, max:5, step:0.5 },
        ]})
    }
  }

  return rows
}

// ── Helpers ───────────────────────────────────────────────────────────
function getAuthH() {
  let s = {}
  try { s = JSON.parse(localStorage.getItem('v50_settings')||'{}') } catch(_) {}
  return {
    'Content-Type':'application/json',
    'x-supa-url':  s?.supabase?.url      || '',
    'x-supa-key':  s?.supabase?.anon_key || '',
    'x-groq-key':  s?.integrations?.groqKey || '',
  }
}

// ── Sub-components ────────────────────────────────────────────────────
function Cell({ label, color, children, wide, style }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:4, flex:wide?2:1, minWidth:wide?160:100, ...style }}>
      <div style={{
        fontFamily:MONO, fontSize:9, fontWeight:700, letterSpacing:'0.1em',
        color:color||'var(--text3)', textTransform:'uppercase',
        padding:'4px 8px', background:color?`${color}12`:'var(--bg2)',
        border:`1px solid ${color?color+'30':'var(--border)'}`, borderRadius:'3px 3px 0 0',
      }}>{label}</div>
      <div style={{ padding:'0 1px' }}>{children}</div>
    </div>
  )
}

function Num({ label, value, onChange, min=1, max=9999, step='any' }) {
  return (
    <label style={{ display:'flex', flexDirection:'column', gap:2, alignItems:'center', flexShrink:0 }}>
      <span style={{ fontFamily:MONO, fontSize:8, color:'var(--text3)', letterSpacing:'0.07em', textTransform:'uppercase' }}>{label}</span>
      <input type="number" value={value??''} min={min} max={max} step={step}
        onChange={e => { const n=parseFloat(e.target.value); if(!isNaN(n)) onChange(n) }}
        style={{ width:56, background:'var(--bg3)', border:'1px solid var(--border)', color:'var(--text1)', fontFamily:MONO, fontSize:11, padding:'3px 4px', borderRadius:3, textAlign:'center' }}
      />
    </label>
  )
}

// ── SectionJsonEditor — edición bidireccional del bloque JSON ─────────
function SectionJsonEditor({ value, onChange }) {
  const [raw, setRaw]       = useState(() => JSON.stringify(value ?? null, null, 2))
  const [error, setError]   = useState(false)
  const focusedRef          = useRef(false)
  const valueStr            = JSON.stringify(value ?? null)

  useEffect(() => {
    if (!focusedRef.current) {
      setRaw(JSON.stringify(value ?? null, null, 2))
      setError(false)
    }
  }, [valueStr]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleChange(text) {
    setRaw(text)
    try {
      const parsed = JSON.parse(text)
      setError(false)
      onChange(parsed)
    } catch {
      setError(true)
    }
  }

  return (
    <textarea
      value={raw}
      spellCheck={false}
      onFocus={() => { focusedRef.current = true }}
      onBlur={() => {
        focusedRef.current = false
        if (error) { setRaw(JSON.stringify(value ?? null, null, 2)); setError(false) }
      }}
      onChange={e => handleChange(e.target.value)}
      style={{
        width:'100%', height:'100%', minHeight:72,
        fontFamily:'monospace', fontSize:10,
        background:'#050810',
        color: error ? '#ff7a7a' : '#5a8aaa',
        border: `1px solid ${error ? '#ff4d6d' : '#12253a'}`,
        borderRadius:4, padding:'6px 8px',
        resize:'none', boxSizing:'border-box',
        outline:'none',
      }}
    />
  )
}

// ── Role row (FILTER, SETUP, TRIGGER, ABORT, EXIT) ────────────────────
function RoleRow({ role, definition, setDefinition }) {
  const r = ROLES.find(x => x.key === role)
  const block = definition?.[role] || null
  const rev = CREV[block?.type]
  const ind = rev?.[0] || ''
  const op  = rev?.[1] || ''

  function setBlock(b) {
    setDefinition(prev => { const n={...prev}; if(b) n[role]=b; else delete n[role]; return n })
  }
  function onIndChange(newInd) {
    if (!newInd) { setBlock(null); return }
    const firstOp = OPS[newInd]?.[0]?.v || ''
    setBlock({ type: CMAP[`${newInd}.${firstOp}`], ...IND_DEFAULTS[newInd] })
  }
  function onOpChange(newOp) {
    const type = CMAP[`${ind}.${newOp}`]
    if (type) setBlock({ ...block, type })
  }
  function onP(key, val) { setBlock({ ...block, [key]: val }) }

  return (
    <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px', background:'var(--bg2)', borderLeft:`3px solid ${r.color}`, borderRadius:'0 4px 4px 0', minHeight:44, flexWrap:'wrap', flex:1 }}>
      <span style={{ fontFamily:MONO, fontSize:9, fontWeight:700, letterSpacing:'0.1em', color:r.color, background:`${r.color}14`, border:`1px solid ${r.color}33`, padding:'3px 8px', borderRadius:3, whiteSpace:'nowrap', flexShrink:0, minWidth:72, textAlign:'center' }}>{r.label}</span>

      <select value={ind} onChange={e=>onIndChange(e.target.value)} style={{ ...SEL, minWidth:82 }}>
        <option value="">— Ninguno —</option>
        <option value="ema">EMA</option>
        <option value="precio">Precio</option>
        <option value="cierre">Cierre</option>
        <option value="rsi">RSI</option>
        <option value="macd">MACD</option>
      </select>

      {ind && <span style={{ fontFamily:MONO, fontSize:9, color:'var(--text3)', flexShrink:0 }}>SI</span>}

      {ind && (
        <select value={op} onChange={e=>onOpChange(e.target.value)} style={{ ...SEL, minWidth:148 }}>
          {(OPS[ind]||[]).map(o=><option key={o.v} value={o.v}>{o.l}</option>)}
        </select>
      )}

      {ind==='ema' && block && <>
        <Num label="Rápida" value={block.ma_fast??10} onChange={v=>onP('ma_fast',v)} />
        <Num label="Lenta"  value={block.ma_slow??20} onChange={v=>onP('ma_slow',v)} />
      </>}
      {(ind==='precio'||ind==='cierre') && block && <>
        <Num label="Período" value={block.ma_period??50} onChange={v=>onP('ma_period',v)} />
        <label style={{ display:'flex', flexDirection:'column', gap:2, alignItems:'center', flexShrink:0 }}>
          <span style={{ fontFamily:MONO, fontSize:8, color:'var(--text3)', textTransform:'uppercase' }}>Tipo</span>
          <select value={block.ma_type||'EMA'} onChange={e=>onP('ma_type',e.target.value)} style={{ ...SEL, width:56 }}>
            <option>EMA</option><option>SMA</option>
          </select>
        </label>
      </>}
      {ind==='rsi' && block && <>
        <Num label="Período" value={block.period??14} onChange={v=>onP('period',v)} />
        <Num label="Nivel"   value={block.level??50}  onChange={v=>onP('level',v)} />
      </>}
      {ind==='macd' && block && <>
        <Num label="Rápida" value={block.fast??12}   onChange={v=>onP('fast',v)} />
        <Num label="Lenta"  value={block.slow??26}   onChange={v=>onP('slow',v)} />
        <Num label="Señal"  value={block.signal??9}  onChange={v=>onP('signal',v)} />
      </>}
    </div>
  )
}

// ── Stop row ──────────────────────────────────────────────────────────
function StopRow({ definition, setDefinition }) {
  const r = ROLES.find(x => x.key === 'stop_loss')
  const block = definition?.stop_loss || null
  const stopType = block?.type || ''
  function setBlock(b) { setDefinition(prev => { const n={...prev}; if(b) n.stop_loss=b; else delete n.stop_loss; return n }) }
  function onTypeChange(t) {
    if (!t)                setBlock(null)
    else if (t==='tecnico')      setBlock({ type:'tecnico',      ma_period:10 })
    else if (t==='atr_based')    setBlock({ type:'atr_based',    atr_period:14, atr_mult:1.5 })
    else if (t==='none')         setBlock({ type:'none' })
    else if (t==='fixed_pct')    setBlock({ type:'fixed_pct',    params:{ pct:5 } })
    else if (t==='trailing_atr') setBlock({ type:'trailing_atr', params:{ atr_period:14, atr_mult:2 } })
  }
  function onP(key,val) { setBlock({ ...block, [key]: val }) }
  function onParam(key,val) { setBlock({ ...block, params:{ ...(block.params||{}), [key]:val } }) }

  return (
    <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px', background:'var(--bg2)', borderLeft:`3px solid ${r.color}`, borderRadius:'0 4px 4px 0', minHeight:44, flexWrap:'wrap', flex:1 }}>
      <span style={{ fontFamily:MONO, fontSize:9, fontWeight:700, letterSpacing:'0.1em', color:r.color, background:`${r.color}14`, border:`1px solid ${r.color}33`, padding:'3px 8px', borderRadius:3, whiteSpace:'nowrap', flexShrink:0, minWidth:72, textAlign:'center' }}>STOP</span>
      <select value={stopType} onChange={e=>onTypeChange(e.target.value)} style={{ ...SEL, minWidth:148 }}>
        <option value="">— Sin stop —</option>
        <option value="tecnico">Técnico (MA)</option>
        <option value="atr_based">ATR dinámico</option>
        <option value="fixed_pct">Stop fijo %</option>
        <option value="trailing_atr">Trailing ATR</option>
        <option value="none">Ninguno</option>
      </select>
      {stopType==='tecnico' && (
        <Num label="Período MA"    value={block.ma_period??10}      onChange={v=>onP('ma_period',v)} />
      )}
      {stopType==='atr_based' && <>
        <Num label="Período ATR"   value={block.atr_period??14}     onChange={v=>onP('atr_period',v)} />
        <Num label="×Mult"         value={block.atr_mult??1.5}      onChange={v=>onP('atr_mult',v)} min={0.1} max={10} />
      </>}
      {stopType==='fixed_pct' && (
        <Num label="% entrada"     value={block.params?.pct??5}     onChange={v=>onParam('pct',v)} min={0.5} max={50} />
      )}
      {stopType==='trailing_atr' && <>
        <Num label="Período ATR"   value={block.params?.atr_period??14}  onChange={v=>onParam('atr_period',v)} min={5} max={50} />
        <Num label="×Mult"         value={block.params?.atr_mult??2}     onChange={v=>onParam('atr_mult',v)} min={0.5} max={5} />
      </>}
    </div>
  )
}

// ── Management row ────────────────────────────────────────────────────
function MgmtRow({ definition, setDefinition }) {
  const r = ROLES.find(x => x.key === 'management')
  const mgmt = definition?.management || {}
  function setMgmt(key,val) { setDefinition(prev => ({ ...prev, management: { ...(prev?.management||{}), [key]: val } })) }
  return (
    <div style={{ display:'flex', alignItems:'center', gap:16, padding:'8px 12px', background:'var(--bg2)', borderLeft:`3px solid ${r.color}`, borderRadius:'0 4px 4px 0', minHeight:44, flex:1 }}>
      <span style={{ fontFamily:MONO, fontSize:9, fontWeight:700, letterSpacing:'0.1em', color:r.color, background:`${r.color}14`, border:`1px solid ${r.color}33`, padding:'3px 8px', borderRadius:3, whiteSpace:'nowrap', flexShrink:0, minWidth:72, textAlign:'center' }}>MGMT</span>
      <label style={{ display:'flex', alignItems:'center', gap:6, cursor:'pointer' }}>
        <input type="checkbox" checked={!!mgmt.sin_perdidas} onChange={e=>setMgmt('sin_perdidas',e.target.checked)} style={{ accentColor:r.color }} />
        <span style={{ fontFamily:MONO, fontSize:11, color:'var(--text2)' }}>Sin pérdidas (trailing)</span>
      </label>
      <label style={{ display:'flex', alignItems:'center', gap:6, cursor:'pointer' }}>
        <input type="checkbox" checked={!!mgmt.reentry} onChange={e=>setMgmt('reentry',e.target.checked)} style={{ accentColor:r.color }} />
        <span style={{ fontFamily:MONO, fontSize:11, color:'var(--text2)' }}>Reentrada permitida</span>
      </label>
    </div>
  )
}

// ── SectionRow — wrapper 60/40 con JSON editor lateral ───────────────
function SectionRow({ left, sectionKey, definition, setDefinition }) {
  function onChange(val) {
    setDefinition(prev => {
      const n = { ...prev }
      if (val == null) delete n[sectionKey]
      else n[sectionKey] = val
      return n
    })
  }
  return (
    <div style={{ display:'flex', gap:6, alignItems:'stretch', marginBottom:3 }}>
      <div style={{ flex:'6 0 0', minWidth:0 }}>{left}</div>
      <div style={{ flex:'4 0 0', minWidth:120, maxWidth:260 }}>
        <SectionJsonEditor value={definition?.[sectionKey] ?? null} onChange={onChange} />
      </div>
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────
export default function StrategyEditorPanel({
  strForm, setStrForm, definition, setDefinition,
  conditions, strategy,
  onSave, onCancel, onDelete, saving,
  focusAI = false,
  templateName = '',
}) {
  const [aiText, setAiText]       = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError]     = useState('')
  const [showSummary, setShowSummary] = useState(() => !!templateName && !focusAI)
  const aiInputRef = useRef(null)

  useEffect(() => {
    if (focusAI) {
      const t = setTimeout(() => aiInputRef.current?.focus(), 120)
      return () => clearTimeout(t)
    }
  }, [focusAI])

  async function runAI() {
    if (!aiText.trim()) return
    setAiLoading(true); setAiError('')
    try {
      const res = await fetch('/api/conditions?action=groq_strategy', {
        method:'POST', headers:getAuthH(), body:JSON.stringify({ text:aiText.trim() }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setDefinition(prev => ({ ...prev, ...data }))
    } catch(e) { setAiError(e.message) }
    finally { setAiLoading(false) }
  }

  function loadTemplate(idx) {
    const t = TEMPLATES[parseInt(idx)]
    if (!t) return
    setDefinition(prev => ({ ...prev, ...t.def }))
  }

  // ── Shared header ─────────────────────────────────────────────────
  const Header = ({ extra }) => (
    <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 16px', borderBottom:'1px solid var(--border)', background:'var(--bg2)', flexShrink:0 }}>
      <button onClick={onCancel} style={{ background:'transparent', border:'1px solid var(--border)', color:'var(--text3)', fontFamily:MONO, fontSize:11, padding:'3px 10px', borderRadius:4, cursor:'pointer' }}>← Volver</button>
      <span style={{ fontFamily:MONO, fontSize:12, color:'var(--text3)' }}>{strategy?.id ? 'Editando' : templateName || 'Nueva estrategia'}</span>
      <span style={{ fontFamily:MONO, fontSize:14, fontWeight:700, color:strForm.color||'var(--accent)' }}>{strForm.name||'—'}</span>
      <div style={{ marginLeft:'auto', display:'flex', gap:8 }}>
        {extra}
        {strategy?.id && <button onClick={onDelete} style={{ background:'rgba(255,77,109,0.1)', border:'1px solid #ff4d6d', color:'#ff4d6d', fontFamily:MONO, fontSize:11, padding:'4px 12px', borderRadius:4, cursor:'pointer' }}>🗑 Eliminar</button>}
        <button onClick={onCancel} style={{ background:'transparent', border:'1px solid var(--border)', color:'var(--text3)', fontFamily:MONO, fontSize:11, padding:'4px 12px', borderRadius:4, cursor:'pointer' }}>✕ Cancelar</button>
        <button onClick={onSave} disabled={saving} style={{ background:'rgba(0,212,255,0.15)', border:'1px solid var(--accent)', color:'var(--accent)', fontFamily:MONO, fontSize:11, fontWeight:700, padding:'4px 16px', borderRadius:4, cursor:saving?'not-allowed':'pointer' }}>{saving?'⟳ Guardando…':'💾 Guardar'}</button>
      </div>
    </div>
  )

  // ════════════════════════════════════════════════════════════════════
  // VISTA RESUMEN — solo para templates (no blank, no AI)
  // ════════════════════════════════════════════════════════════════════
  if (showSummary) {
    const summaryFields = getTemplateSummaryFields(definition)
    return (
      <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden', background:'var(--bg1)', fontFamily:MONO }}>
        <Header extra={
          <button onClick={() => setShowSummary(false)} style={{ background:'rgba(0,212,255,0.07)', border:'1px solid #1a3d5a', color:'#7aabc8', fontFamily:MONO, fontSize:11, padding:'4px 12px', borderRadius:4, cursor:'pointer' }}>
            ⚙ Ajuste avanzado
          </button>
        }/>

        <div style={{ flex:1, overflowY:'auto', padding:'24px 24px 40px' }}>
          {/* Template title */}
          <div style={{ fontFamily:MONO, fontSize:20, fontWeight:700, color:'#eef5ff', marginBottom:6 }}>{templateName}</div>
          <div style={{ fontFamily:MONO, fontSize:10, color:'#3a5a75', marginBottom:28, letterSpacing:'0.05em' }}>
            Ajusta los parámetros clave y guarda, o usa ⚙ Ajuste avanzado para control total.
          </div>

          {/* Nombre */}
          <div style={{ marginBottom:20 }}>
            <div style={{ fontFamily:MONO, fontSize:9, color:'#7aabc8', letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:6 }}>Nombre de la estrategia</div>
            <input
              type="text"
              value={strForm.name||''}
              onChange={e => setStrForm(p => ({ ...p, name:e.target.value }))}
              placeholder="Nombre…"
              autoFocus
              style={{ ...INPUT, fontSize:14, padding:'8px 12px' }}
            />
          </div>

          {/* Param rows */}
          {summaryFields.map((row, ri) => (
            <div key={ri} style={{
              display:'flex', alignItems:'center', gap:14, flexWrap:'wrap',
              padding:'14px 18px', marginBottom:8,
              background:'var(--bg2)', border:'1px solid var(--border)',
              borderLeft:`4px solid ${row.color}`, borderRadius:'0 6px 6px 0',
            }}>
              <span style={{
                fontFamily:MONO, fontSize:9, fontWeight:700, letterSpacing:'0.1em',
                color:row.color, background:`${row.color}14`, border:`1px solid ${row.color}33`,
                padding:'3px 8px', borderRadius:3, textTransform:'uppercase',
                whiteSpace:'nowrap', minWidth:70, textAlign:'center', flexShrink:0,
              }}>{row.label}</span>
              <span style={{ fontFamily:MONO, fontSize:12, color:'#c8dff5', flex:1, minWidth:120 }}>{row.desc}</span>
              {row.params.map(p => (
                <label key={p.path} style={{ display:'flex', flexDirection:'column', gap:3, alignItems:'center', flexShrink:0 }}>
                  <span style={{ fontFamily:MONO, fontSize:8, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.07em' }}>{p.label}</span>
                  <input
                    type="number"
                    value={getByPath(definition, p.path) ?? ''}
                    min={p.min} max={p.max} step={p.step || 1}
                    onChange={e => {
                      const n = parseFloat(e.target.value)
                      if (!isNaN(n)) setDefinition(d => setByPath(d, p.path, n))
                    }}
                    style={{ width:64, background:'var(--bg3)', border:'1px solid var(--border)', color:'var(--text1)', fontFamily:MONO, fontSize:13, fontWeight:600, padding:'4px 6px', borderRadius:3, textAlign:'center' }}
                  />
                </label>
              ))}
            </div>
          ))}

          {/* Capital rápido */}
          <div style={{ display:'flex', gap:12, flexWrap:'wrap', marginTop:20 }}>
            <label style={{ display:'flex', flexDirection:'column', gap:4 }}>
              <span style={{ fontFamily:MONO, fontSize:9, color:'#7aabc8', letterSpacing:'0.1em', textTransform:'uppercase' }}>Capital (€)</span>
              <input type="number" min={100} value={strForm.capital_ini||''} onChange={e=>setStrForm(p=>({...p,capital_ini:Number(e.target.value)}))}
                style={{ ...INPUT, width:120, fontSize:13, padding:'6px 10px' }} />
            </label>
            <label style={{ display:'flex', flexDirection:'column', gap:4 }}>
              <span style={{ fontFamily:MONO, fontSize:9, color:'#7aabc8', letterSpacing:'0.1em', textTransform:'uppercase' }}>Años BT</span>
              <input type="number" min={1} max={20} value={strForm.years||5} onChange={e=>setStrForm(p=>({...p,years:Number(e.target.value)}))}
                style={{ ...INPUT, width:80, fontSize:13, padding:'6px 10px' }} />
            </label>
          </div>
        </div>
      </div>
    )
  }

  // ════════════════════════════════════════════════════════════════════
  // FORMULARIO COMPLETO
  // ════════════════════════════════════════════════════════════════════
  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden', background:'var(--bg1)', fontFamily:MONO }}>

      <Header extra={showSummary === false && templateName ? (
        <button onClick={() => setShowSummary(true)} style={{ background:'rgba(0,212,255,0.07)', border:'1px solid #1a3d5a', color:'#7aabc8', fontFamily:MONO, fontSize:11, padding:'4px 12px', borderRadius:4, cursor:'pointer' }}>
          ← Vista rápida
        </button>
      ) : null}/>

      {/* ── Body ── */}
      <div style={{ flex:1, overflowY:'auto', padding:'16px 16px 32px' }}>

        {/* Metadata */}
        <div style={{ display:'flex', gap:10, flexWrap:'wrap', padding:'12px', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:6, marginBottom:10 }}>
          <Cell label="Nombre" wide>
            <input type="text" value={strForm.name||''} onChange={e=>setStrForm(p=>({...p,name:e.target.value}))} style={{ ...INPUT, minWidth:180 }} placeholder="Nombre de la estrategia" />
          </Cell>
          <Cell label="Capital (€)">
            <input type="number" min={100} value={strForm.capital_ini||''} onChange={e=>setStrForm(p=>({...p,capital_ini:Number(e.target.value)}))} style={INPUT} />
          </Cell>
          <Cell label="Asignación (%)">
            <input type="number" min={1} max={100} value={strForm.allocation_pct||100} onChange={e=>setStrForm(p=>({...p,allocation_pct:Number(e.target.value)}))} style={INPUT} />
          </Cell>
          <Cell label="Años BT">
            <input type="number" min={1} max={20} value={strForm.years||5} onChange={e=>setStrForm(p=>({...p,years:Number(e.target.value)}))} style={INPUT} />
          </Cell>
          <Cell label="Color">
            <input type="color" value={strForm.color||'#00d4ff'} onChange={e=>setStrForm(p=>({...p,color:e.target.value}))} style={{ ...INPUT, padding:2, height:32, cursor:'pointer' }} />
          </Cell>
        </div>

        {/* AI + Templates */}
        <div style={{ padding:'10px 12px', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:6, marginBottom:10 }}>
          <div style={{ fontFamily:MONO, fontSize:9, color:'var(--text3)', letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:8 }}>🤖 Asistente IA — describe tu estrategia en español</div>
          <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
            <input ref={aiInputRef} type="text" value={aiText} onChange={e=>setAiText(e.target.value)} onKeyDown={e=>e.key==='Enter'&&runAI()}
              placeholder="ej: comprar cuando EMA10 cruce al alza EMA20, stop técnico bajo EMA20, salir cuando RSI>70…"
              style={{ ...INPUT, flex:'1 1 200px', width:'auto' }} />
            <button onClick={runAI} disabled={aiLoading||!aiText.trim()} style={{ background:'rgba(155,114,255,0.15)', border:'1px solid #9b72ff', color:'#9b72ff', fontFamily:MONO, fontSize:11, fontWeight:700, padding:'6px 14px', borderRadius:4, cursor:(aiLoading||!aiText.trim())?'not-allowed':'pointer', flexShrink:0, whiteSpace:'nowrap' }}>
              {aiLoading?'⟳ Generando…':'🤖 Generar'}
            </button>
            <select value="" onChange={e=>{ if(e.target.value!=='') loadTemplate(e.target.value) }} style={{ ...SEL, flexShrink:0 }}>
              <option value="">📋 Cargar plantilla…</option>
              {TEMPLATES.map((t,i)=><option key={i} value={i}>{t.label}</option>)}
            </select>
          </div>
          {aiError && <div style={{ marginTop:6, fontFamily:MONO, fontSize:10, color:'#ff7a7a' }}>⚠ {aiError}</div>}
        </div>

        {/* Cabecera columnas */}
        <div style={{ display:'flex', gap:6, marginBottom:4 }}>
          <div style={{ flex:'6 0 0', fontFamily:MONO, fontSize:8, color:'#2a4a6a', letterSpacing:'0.08em', textTransform:'uppercase', paddingLeft:4 }}>Controles</div>
          <div style={{ flex:'4 0 0', maxWidth:260, fontFamily:MONO, fontSize:8, color:'#2a4a6a', letterSpacing:'0.08em', textTransform:'uppercase', paddingLeft:4 }}>JSON directo</div>
        </div>

        {/* Role builders con JSON lateral */}
        <div style={{ display:'flex', flexDirection:'column', gap:0, marginBottom:10 }}>
          {['filter','setup','trigger','abort','exit'].map(role => (
            <SectionRow key={role} sectionKey={role} definition={definition} setDefinition={setDefinition}
              left={<RoleRow role={role} definition={definition} setDefinition={setDefinition} />}
            />
          ))}
          <SectionRow sectionKey="stop_loss" definition={definition} setDefinition={setDefinition}
            left={<StopRow definition={definition} setDefinition={setDefinition} />}
          />
          <div style={{ display:'flex', gap:6, alignItems:'stretch', marginBottom:3 }}>
            <div style={{ flex:'6 0 0', minWidth:0 }}>
              <MgmtRow definition={definition} setDefinition={setDefinition} />
            </div>
            <div style={{ flex:'4 0 0', minWidth:120, maxWidth:260 }}>
              <SectionJsonEditor
                value={definition?.management ?? null}
                onChange={val => setDefinition(prev => {
                  const n = { ...prev }
                  if (val == null) delete n.management; else n.management = val
                  return n
                })}
              />
            </div>
          </div>
        </div>

        {/* Observations */}
        <div style={{ padding:'12px', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:6 }}>
          <Cell label="Observaciones" wide style={{ flex:1 }}>
            <textarea value={strForm.observations||''} onChange={e=>setStrForm(p=>({...p,observations:e.target.value}))} rows={3} style={{ ...INPUT, resize:'vertical', width:'100%', minHeight:60 }} placeholder="Notas sobre la estrategia…" />
          </Cell>
        </div>

      </div>
    </div>
  )
}
