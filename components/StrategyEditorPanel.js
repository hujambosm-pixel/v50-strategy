import { useState } from 'react'
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
// Reverse: conditionType → [ind, op]
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
    <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px', background:'var(--bg2)', borderLeft:`3px solid ${r.color}`, borderRadius:'0 4px 4px 0', minHeight:44, flexWrap:'wrap' }}>
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
    if (!t) { setBlock(null); return }
    if (t==='tecnico')   setBlock({ type:'tecnico',   ma_period:10 })
    if (t==='atr_based') setBlock({ type:'atr_based', atr_period:14, atr_mult:1.5 })
    if (t==='none')      setBlock({ type:'none' })
  }
  function onP(key,val) { setBlock({ ...block, [key]: val }) }

  return (
    <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px', background:'var(--bg2)', borderLeft:`3px solid ${r.color}`, borderRadius:'0 4px 4px 0', minHeight:44, flexWrap:'wrap' }}>
      <span style={{ fontFamily:MONO, fontSize:9, fontWeight:700, letterSpacing:'0.1em', color:r.color, background:`${r.color}14`, border:`1px solid ${r.color}33`, padding:'3px 8px', borderRadius:3, whiteSpace:'nowrap', flexShrink:0, minWidth:72, textAlign:'center' }}>STOP</span>
      <select value={stopType} onChange={e=>onTypeChange(e.target.value)} style={{ ...SEL, minWidth:140 }}>
        <option value="">— Sin stop —</option>
        <option value="tecnico">Técnico (MA)</option>
        <option value="atr_based">ATR dinámico</option>
        <option value="none">Ninguno</option>
      </select>
      {stopType==='tecnico'   && <Num label="Período MA"  value={block.ma_period??10}  onChange={v=>onP('ma_period',v)} />}
      {stopType==='atr_based' && <>
        <Num label="Período ATR" value={block.atr_period??14}  onChange={v=>onP('atr_period',v)} />
        <Num label="×Mult"       value={block.atr_mult??1.5}   onChange={v=>onP('atr_mult',v)} min={0.1} max={10} />
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
    <div style={{ display:'flex', alignItems:'center', gap:16, padding:'8px 12px', background:'var(--bg2)', borderLeft:`3px solid ${r.color}`, borderRadius:'0 4px 4px 0', minHeight:44 }}>
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

// ── Main export ───────────────────────────────────────────────────────
export default function StrategyEditorPanel({
  strForm, setStrForm, definition, setDefinition,
  conditions, strategy,
  onSave, onCancel, onDelete, saving,
}) {
  const [aiText, setAiText] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')

  async function runAI() {
    if (!aiText.trim()) return
    setAiLoading(true); setAiError('')
    try {
      const res = await fetch('/api/conditions?action=groq_strategy', {
        method:'POST', headers:getAuthH(), body:JSON.stringify({ text:aiText.trim() }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      // Merge AI result into definition, keep condition_refs and other keys
      setDefinition(prev => ({ ...prev, ...data }))
    } catch(e) { setAiError(e.message) }
    finally { setAiLoading(false) }
  }

  function loadTemplate(idx) {
    const t = TEMPLATES[parseInt(idx)]
    if (!t) return
    setDefinition(prev => ({ ...prev, ...t.def }))
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden', background:'var(--bg1)', fontFamily:MONO }}>

      {/* ── Header ── */}
      <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 16px', borderBottom:'1px solid var(--border)', background:'var(--bg2)', flexShrink:0 }}>
        <button onClick={onCancel} style={{ background:'transparent', border:'1px solid var(--border)', color:'var(--text3)', fontFamily:MONO, fontSize:11, padding:'3px 10px', borderRadius:4, cursor:'pointer' }}>← Volver</button>
        <span style={{ fontFamily:MONO, fontSize:12, color:'var(--text3)' }}>{strategy?.id ? 'Editando' : 'Nueva estrategia'}</span>
        <span style={{ fontFamily:MONO, fontSize:14, fontWeight:700, color:strForm.color||'var(--accent)' }}>{strForm.name||'—'}</span>
        <div style={{ marginLeft:'auto', display:'flex', gap:8 }}>
          {strategy?.id && <button onClick={onDelete} style={{ background:'rgba(255,77,109,0.1)', border:'1px solid #ff4d6d', color:'#ff4d6d', fontFamily:MONO, fontSize:11, padding:'4px 12px', borderRadius:4, cursor:'pointer' }}>🗑 Eliminar</button>}
          <button onClick={onCancel} style={{ background:'transparent', border:'1px solid var(--border)', color:'var(--text3)', fontFamily:MONO, fontSize:11, padding:'4px 12px', borderRadius:4, cursor:'pointer' }}>✕ Cancelar</button>
          <button onClick={onSave} disabled={saving} style={{ background:'rgba(0,212,255,0.15)', border:'1px solid var(--accent)', color:'var(--accent)', fontFamily:MONO, fontSize:11, fontWeight:700, padding:'4px 16px', borderRadius:4, cursor:saving?'not-allowed':'pointer' }}>{saving?'⟳ Guardando…':'💾 Guardar'}</button>
        </div>
      </div>

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
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <input type="text" value={aiText} onChange={e=>setAiText(e.target.value)} onKeyDown={e=>e.key==='Enter'&&runAI()}
              placeholder="ej: comprar cuando EMA10 cruce al alza EMA20, stop técnico bajo EMA20, salir cuando RSI>70…"
              style={{ ...INPUT, flex:1, minWidth:0 }} />
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

        {/* Role builders */}
        <div style={{ display:'flex', flexDirection:'column', gap:3, marginBottom:10 }}>
          {['filter','setup','trigger','abort','exit'].map(role=>(
            <RoleRow key={role} role={role} definition={definition} setDefinition={setDefinition} />
          ))}
          <StopRow definition={definition} setDefinition={setDefinition} />
          <MgmtRow definition={definition} setDefinition={setDefinition} />
        </div>

        {/* Observations */}
        <div style={{ padding:'12px', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:6, marginBottom:10 }}>
          <Cell label="Observaciones" wide style={{ flex:1 }}>
            <textarea value={strForm.observations||''} onChange={e=>setStrForm(p=>({...p,observations:e.target.value}))} rows={3} style={{ ...INPUT, resize:'vertical', width:'100%', minHeight:60 }} placeholder="Notas sobre la estrategia…" />
          </Cell>
        </div>

        {/* JSON preview */}
        <div style={{ padding:'12px', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:6 }}>
          <div style={{ fontFamily:MONO, fontSize:9, color:'var(--text3)', letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:6 }}>definition — columna guardada en Supabase</div>
          <textarea readOnly value={definition ? JSON.stringify(definition, null, 2) : '{}'} rows={8} style={{ ...INPUT, resize:'vertical', width:'100%', color:'#7ab8d8', fontSize:10 }} />
        </div>

      </div>
    </div>
  )
}
