import { useState, useRef, useEffect } from 'react'
import { MONO } from '../lib/utils'
import { useStrategyBlocks } from '../lib/useStrategyBlocks'

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
function stripNulls(obj) {
  if (!obj || typeof obj !== 'object') return obj
  return Object.fromEntries(
    Object.entries(obj)
      .filter(([, v]) => v !== null && v !== undefined)
      .map(([k, v]) => [k, typeof v === 'object' ? stripNulls(v) : v])
  )
}

const VALID_FIELDS = {
  ema_cross_up:    ['type','ma_fast','ma_slow'],
  ema_cross_down:  ['type','ma_fast','ma_slow'],
  price_above_ma:  ['type','ma_period'],
  price_below_ma:  ['type','ma_period'],
  rsi_cross_up:    ['type','rsi_period','level'],
  rsi_cross_down:  ['type','rsi_period','level'],
  rsi_above:       ['type','rsi_period','level'],
  rsi_below:       ['type','rsi_period','level'],
  macd_cross_up:   ['type','macd_fast','macd_slow','macd_signal'],
  macd_cross_down: ['type','macd_fast','macd_slow','macd_signal'],
}

const FIELD_ALIASES = {
  period:     'rsi_period',
  fast:       'macd_fast',
  slow:       'macd_slow',
  signal:     'macd_signal',
  ma_type:    null,
  level2:     null,
  level_exit: null,
}

function validateBlockDefinition(def) {
  if (!def?.type) return def
  // 1. Renombrar aliases
  const renamed = {}
  Object.entries(def).forEach(([k, v]) => {
    const alias = FIELD_ALIASES[k]
    if (alias === null) return       // eliminar
    if (alias) renamed[alias] = v
    else renamed[k] = v
  })
  // 2. Eliminar campos no válidos para este type
  const allowed = VALID_FIELDS[renamed.type] || []
  return Object.fromEntries(
    Object.entries(renamed).filter(([k]) => allowed.includes(k))
  )
}

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
  const [raw, setRaw]     = useState(() => JSON.stringify(value ?? null, null, 2))
  const [error, setError] = useState(false)
  const focusedRef        = useRef(false)
  const valueStr          = JSON.stringify(value ?? null)

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
    } catch { setError(true) }
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
        resize:'none', boxSizing:'border-box', outline:'none',
      }}
    />
  )
}

// ── BlockSelector — dropdown personalizado de biblioteca de bloques ───
function BlockSelector({ blocks, value, onSelect, onDelete, onRename, onCreateAI }) {
  const [open, setOpen]         = useState(false)
  const [hoverId, setHoverId]   = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')
  const containerRef            = useRef(null)
  const editInputRef            = useRef(null)

  // Cerrar al click fuera
  useEffect(() => {
    if (!open) return
    function onMouseDown(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false)
        setEditingId(null)
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [open])

  // Focus al editar
  useEffect(() => {
    if (editingId && editInputRef.current) editInputRef.current.focus()
  }, [editingId])

  function startEdit(e, blk) {
    e.stopPropagation()
    setEditingId(blk.id)
    setEditName(blk.name)
  }

  function confirmRename(id) {
    if (editName.trim()) onRename(id, editName.trim())
    setEditingId(null)
  }

  function handleDelete(e, blk) {
    e.stopPropagation()
    if (window.confirm(`¿Eliminar bloque "${blk.name}"?`)) onDelete(blk.id)
  }

  function selectBlock(blk) {
    onSelect(blk)
    setOpen(false)
    setEditingId(null)
  }

  return (
    <div ref={containerRef} style={{ position:'relative' }}>
      {/* Botón trigger */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display:'flex', alignItems:'center', justifyContent:'space-between',
          width:'100%', gap:6,
          background:'var(--bg3)', border:'1px solid var(--border)',
          color: value ? '#c8dff5' : '#3a5a75',
          fontFamily:MONO, fontSize:11,
          padding:'4px 8px', borderRadius:3, cursor:'pointer', textAlign:'left',
          boxSizing:'border-box',
        }}
      >
        <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1 }}>
          {value || '— Ninguno —'}
        </span>
        <span style={{ color:'#3a5a75', flexShrink:0, fontSize:9 }}>▼</span>
      </button>

      {/* Panel flotante */}
      {open && (
        <div style={{
          position:'absolute', top:'100%', left:0, right:0, zIndex:999, marginTop:2,
          background:'#0d1520', border:'1px solid #1a2d45', borderRadius:4,
          boxShadow:'0 4px 20px rgba(0,0,0,0.6)', overflow:'hidden', minWidth:180,
        }}>
          {/* Opción Ninguno — siempre visible */}
          <div
            onMouseEnter={e => e.currentTarget.style.background='#1a2d45'}
            onMouseLeave={e => e.currentTarget.style.background='transparent'}
            onClick={() => { onSelect(null); setOpen(false); setEditingId(null) }}
            style={{ padding:'5px 10px', fontFamily:MONO, fontSize:11, color:'#3a5a75', cursor:'pointer', background:'transparent' }}
          >— Ninguno —</div>
          {blocks.length > 0 && <div style={{ borderTop:'1px solid #1a2d45' }} />}
          {blocks.length === 0 && (
            <div style={{ padding:'5px 10px', fontFamily:MONO, fontSize:10, color:'#3a5a75' }}>
              Sin bloques guardados
            </div>
          )}
          {blocks.map(blk => (
            <div
              key={blk.id}
              onMouseEnter={() => setHoverId(blk.id)}
              onMouseLeave={() => setHoverId(null)}
              style={{
                display:'flex', alignItems:'center', gap:4,
                padding:'5px 8px',
                background: hoverId === blk.id ? '#1a2d45' : 'transparent',
                cursor:'pointer',
              }}
            >
              {editingId === blk.id ? (
                <input
                  ref={editInputRef}
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  onKeyDown={e => {
                    e.stopPropagation()
                    if (e.key === 'Enter') confirmRename(blk.id)
                    if (e.key === 'Escape') setEditingId(null)
                  }}
                  onBlur={() => confirmRename(blk.id)}
                  onClick={e => e.stopPropagation()}
                  style={{
                    flex:1, background:'#0a1520', border:'1px solid #2a4a6a',
                    color:'#c8dff5', fontFamily:MONO, fontSize:11,
                    padding:'2px 6px', borderRadius:3, outline:'none',
                  }}
                />
              ) : (
                <span
                  onClick={() => selectBlock(blk)}
                  style={{
                    flex:1, fontFamily:MONO, fontSize:11, color:'#7a9bc0',
                    overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
                  }}
                >
                  {blk.name}
                </span>
              )}
              <span
                title="Renombrar"
                onClick={e => startEdit(e, blk)}
                style={{
                  opacity: hoverId === blk.id ? 1 : 0, transition:'opacity 0.1s',
                  cursor:'pointer', fontSize:12, padding:'0 2px', lineHeight:1,
                  userSelect:'none',
                }}
              >✏️</span>
              <span
                title="Eliminar"
                onClick={e => handleDelete(e, blk)}
                style={{
                  opacity: hoverId === blk.id ? 1 : 0, transition:'opacity 0.1s',
                  cursor:'pointer', fontSize:12, padding:'0 2px', lineHeight:1,
                  userSelect:'none',
                }}
              >🗑️</span>
            </div>
          ))}

          {/* Separador + opción IA */}
          <div style={{ borderTop:'1px solid #1a2d45' }} />
          <div
            onMouseEnter={e => e.currentTarget.style.background='#1a2d45'}
            onMouseLeave={e => e.currentTarget.style.background='transparent'}
            onClick={() => { onCreateAI(); setOpen(false) }}
            style={{
              padding:'7px 10px', fontFamily:MONO, fontSize:11,
              color:'#a78bfa', cursor:'pointer', background:'transparent',
            }}
          >
            ✨ Crear con IA...
          </div>
        </div>
      )}
    </div>
  )
}

// ── Role row (FILTER, SETUP, TRIGGER, ABORT, EXIT) ────────────────────
function RoleRow({ role, definition, setDefinition, hideTypeSelect = false, librarySlot = null }) {
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
  // Escribe siempre con nombre canónico y limpia aliases/campos inválidos
  function onP(key, val) { setBlock(validateBlockDefinition({ ...block, [key]: val })) }

  return (
    <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px', background:'var(--bg2)', borderLeft:`3px solid ${r.color}`, borderRadius:'0 4px 4px 0', minHeight:44, flexWrap:'wrap', flex:1 }}>
      <span style={{ fontFamily:MONO, fontSize:9, fontWeight:700, letterSpacing:'0.1em', color:r.color, background:`${r.color}14`, border:`1px solid ${r.color}33`, padding:'3px 8px', borderRadius:3, whiteSpace:'nowrap', flexShrink:0, minWidth:72, textAlign:'center' }}>{r.label}</span>

      {librarySlot}

      {!hideTypeSelect && (
        <select value={ind} onChange={e=>onIndChange(e.target.value)} style={{ ...SEL, minWidth:82 }}>
          <option value="">— Ninguno —</option>
          <option value="ema">EMA</option>
          <option value="precio">Precio</option>
          <option value="cierre">Cierre</option>
          <option value="rsi">RSI</option>
          <option value="macd">MACD</option>
        </select>
      )}

      {ind && <span style={{ fontFamily:MONO, fontSize:9, color:'var(--text3)', flexShrink:0 }}>SI</span>}

      {!hideTypeSelect && ind && (
        <select value={op} onChange={e=>onOpChange(e.target.value)} style={{ ...SEL, minWidth:148 }}>
          {(OPS[ind]||[]).map(o=><option key={o.v} value={o.v}>{o.l}</option>)}
        </select>
      )}
      {hideTypeSelect && ind && (
        <span style={{ fontFamily:MONO, fontSize:10, color:'#7a9bc0', flexShrink:0 }}>
          {(OPS[ind]||[]).find(o=>o.v===op)?.l || op}
        </span>
      )}

      {ind==='ema' && block && <>
        <Num label="Rápida" value={block.ma_fast??10}  onChange={v=>onP('ma_fast',v)} />
        <Num label="Lenta"  value={block.ma_slow??20}  onChange={v=>onP('ma_slow',v)} />
      </>}
      {(ind==='precio'||ind==='cierre') && block && <>
        <Num label="Período" value={block.ma_period??50} onChange={v=>onP('ma_period',v)} />
      </>}
      {ind==='rsi' && block && <>
        <Num label="Período" value={block.rsi_period ?? block.period ?? 14} onChange={v=>onP('rsi_period',v)} />
        <Num label="Nivel"   value={block.level ?? 50}                      onChange={v=>onP('level',v)} />
      </>}
      {ind==='macd' && block && <>
        <Num label="Rápida" value={block.macd_fast   ?? block.fast   ?? 12} onChange={v=>onP('macd_fast',v)} />
        <Num label="Lenta"  value={block.macd_slow   ?? block.slow   ?? 26} onChange={v=>onP('macd_slow',v)} />
        <Num label="Señal"  value={block.macd_signal ?? block.signal ?? 9}  onChange={v=>onP('macd_signal',v)} />
      </>}
    </div>
  )
}

// ── Stop row ──────────────────────────────────────────────────────────
function StopRow({ definition, setDefinition, hideTypeSelect = false, librarySlot = null }) {
  const r = ROLES.find(x => x.key === 'stop_loss')
  const block = definition?.stop_loss || null
  const stopType = block?.type || ''
  function setBlock(b) { setDefinition(prev => { const n={...prev}; if(b) n.stop_loss=b; else delete n.stop_loss; return n }) }
  function onTypeChange(t) {
    if (!t)                     setBlock(null)
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

      {librarySlot}

      {!hideTypeSelect && (
        <select value={stopType} onChange={e=>onTypeChange(e.target.value)} style={{ ...SEL, minWidth:148 }}>
          <option value="">— Sin stop —</option>
          <option value="tecnico">Técnico (MA)</option>
          <option value="atr_based">ATR dinámico</option>
          <option value="fixed_pct">Stop fijo %</option>
          <option value="trailing_atr">Trailing ATR</option>
          <option value="none">Ninguno</option>
        </select>
      )}
      {hideTypeSelect && stopType && (
        <span style={{ fontFamily:MONO, fontSize:10, color:'#7a9bc0', flexShrink:0 }}>
          {{'tecnico':'Técnico (MA)','atr_based':'ATR dinámico','fixed_pct':'Stop fijo %','trailing_atr':'Trailing ATR','none':'Ninguno'}[stopType] || stopType}
        </span>
      )}
      {stopType==='tecnico' && (
        <Num label="Período MA"  value={block.ma_period??10}         onChange={v=>onP('ma_period',v)} />
      )}
      {stopType==='atr_based' && <>
        <Num label="Período ATR" value={block.atr_period??14}        onChange={v=>onP('atr_period',v)} />
        <Num label="×Mult"       value={block.atr_mult??1.5}         onChange={v=>onP('atr_mult',v)} min={0.1} max={10} />
      </>}
      {stopType==='fixed_pct' && (
        <Num label="% entrada"   value={block.params?.pct??5}        onChange={v=>onParam('pct',v)} min={0.5} max={50} />
      )}
      {stopType==='trailing_atr' && <>
        <Num label="Período ATR" value={block.params?.atr_period??14} onChange={v=>onParam('atr_period',v)} min={5} max={50} />
        <Num label="×Mult"       value={block.params?.atr_mult??2}    onChange={v=>onParam('atr_mult',v)} min={0.5} max={5} />
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

// ── SectionRow — 60/40: controles (con BlockSelector integrado) | JSON editor ─
function SectionRow({ sectionKey, definition, setDefinition, blocks = {}, saveBlock, deleteBlock, updateBlockName }) {
  const role          = sectionKey === 'stop_loss' ? 'stop' : sectionKey
  const sectionBlocks = blocks[role] || []
  const [activeName, setActiveName] = useState('')
  const [aiMode, setAiMode]         = useState(false)
  const [aiText, setAiText]         = useState('')
  const [aiLoading, setAiLoading]   = useState(false)
  const [aiError, setAiError]       = useState('')
  const [aiResult, setAiResult]     = useState(null)
  const [saveName, setSaveName]     = useState('')

  function onSectionChange(val) {
    setDefinition(prev => {
      const n = { ...prev }
      if (val == null) delete n[sectionKey]
      else n[sectionKey] = val
      return n
    })
  }

  function handleSelect(blk) {
    if (!blk) { onSectionChange(null); setActiveName(''); setAiMode(false); setAiResult(null); return }
    onSectionChange(blk.definition)
    setActiveName(blk.name)
    setAiMode(false)
    setAiResult(null)
  }

  function openAI() {
    setAiMode(true); setAiText(''); setAiError(''); setAiResult(null); setSaveName('')
  }

  async function generateAI() {
    if (!aiText.trim()) return
    setAiLoading(true); setAiError(''); setAiResult(null)
    try {
      const res = await fetch('/api/conditions?action=groq_block', {
        method: 'POST', headers: getAuthH(),
        body: JSON.stringify({ text: aiText.trim(), role }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      const clean = validateBlockDefinition(stripNulls(data))
      onSectionChange(clean); setAiResult(clean); setActiveName('')
    } catch(e) { setAiError(e.message) }
    finally { setAiLoading(false) }
  }

  async function saveToLibrary() {
    if (!saveName.trim() || !saveBlock || !aiResult) return
    await saveBlock(role, saveName.trim(), validateBlockDefinition(stripNulls(aiResult)))
    setActiveName(saveName.trim())
    setAiMode(false); setAiResult(null); setSaveName('')
  }

  const btnGhost = { background:'transparent', border:'1px solid var(--border)', color:'var(--text3)', fontFamily:MONO, fontSize:10, padding:'3px 8px', borderRadius:3, cursor:'pointer' }
  const btnAI    = { background:'rgba(155,114,255,0.12)', border:'1px solid rgba(155,114,255,0.4)', color:'#9b72ff', fontFamily:MONO, fontSize:10, padding:'3px 10px', borderRadius:3, whiteSpace:'nowrap' }
  const btnSave  = { background:'rgba(0,212,255,0.12)', border:'1px solid rgba(0,212,255,0.4)', color:'var(--accent)', fontFamily:MONO, fontSize:10, padding:'3px 10px', borderRadius:3, cursor:'pointer', whiteSpace:'nowrap' }

  // Slot que se inyecta dentro de RoleRow/StopRow justo después del label
  const librarySlot = (
    <div style={{ display:'flex', alignItems:'center', minWidth:160, flexShrink:0 }}>
      <BlockSelector
        blocks={sectionBlocks}
        value={activeName}
        onSelect={handleSelect}
        onDelete={id => { deleteBlock && deleteBlock(id); setActiveName(p => p ? '' : p) }}
        onRename={(id, name) => {
          updateBlockName && updateBlockName(id, name)
          setActiveName(prev => {
            const blk = sectionBlocks.find(b => b.id === id)
            return (blk && blk.name === prev) ? name : prev
          })
        }}
        onCreateAI={openAI}
      />
    </div>
  )

  // Panel IA expandido — aparece DEBAJO de la sección cuando está activo
  const aiPanel = aiMode && (
    <div style={{ display:'flex', flexDirection:'column', gap:4, padding:'8px 10px', background:'#080f1a', border:'1px solid #1a2d45', borderRadius:4, marginTop:2 }}>
      <div style={{ display:'flex', gap:4, alignItems:'flex-start' }}>
        <textarea autoFocus rows={2} value={aiText}
          onChange={e => setAiText(e.target.value)}
          onKeyDown={e => { if (e.key==='Escape') setAiMode(false) }}
          placeholder="describe el bloque (ej: RSI cruza nivel 30 al alza)"
          style={{ flex:1, background:'#040810', border:'1px solid #1a2d45', color:'#7a9bc0', fontFamily:MONO, fontSize:10, padding:'4px 6px', borderRadius:3, resize:'none', outline:'none' }}
        />
        <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
          <button onClick={generateAI} disabled={aiLoading||!aiText.trim()}
            style={{ ...btnAI, opacity:(aiLoading||!aiText.trim())?0.5:1, cursor:(aiLoading||!aiText.trim())?'not-allowed':'pointer' }}>
            {aiLoading ? '⟳' : '✨ Generar'}
          </button>
          <button onClick={() => { setAiMode(false); setAiResult(null) }} style={btnGhost}>✕ Cerrar</button>
        </div>
      </div>
      {aiError && <div style={{ fontFamily:MONO, fontSize:9, color:'#ff7a7a' }}>⚠ {aiError}</div>}
      {aiResult && (
        <div style={{ display:'flex', gap:4, alignItems:'center', paddingTop:2 }}>
          <input autoFocus type="text" value={saveName}
            onChange={e => setSaveName(e.target.value)}
            onKeyDown={e => { if (e.key==='Enter') saveToLibrary() }}
            placeholder="Nombre para la biblioteca…"
            style={{ flex:1, background:'#040810', border:'1px solid #1a2d45', color:'#c8dff5', fontFamily:MONO, fontSize:10, padding:'3px 6px', borderRadius:3, outline:'none' }}
          />
          <button onClick={saveToLibrary} disabled={!saveName.trim()}
            style={{ ...btnSave, opacity:saveName.trim()?1:0.45 }}>
            Guardar en biblioteca
          </button>
        </div>
      )}
    </div>
  )

  const isStop = sectionKey === 'stop_loss'

  return (
    <div style={{ display:'flex', gap:6, alignItems:'stretch', marginBottom:3 }}>
      <div style={{ flex:'6 0 0', minWidth:0, display:'flex', flexDirection:'column', gap:0 }}>
        {isStop
          ? <StopRow definition={definition} setDefinition={setDefinition} hideTypeSelect={true} librarySlot={librarySlot} />
          : <RoleRow role={sectionKey} definition={definition} setDefinition={setDefinition} hideTypeSelect={true} librarySlot={librarySlot} />
        }
        {aiPanel}
      </div>
      <div style={{ flex:'4 0 0', minWidth:120, maxWidth:260 }}>
        <SectionJsonEditor value={definition?.[sectionKey] ?? null} onChange={onSectionChange} />
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
}) {
  const [aiText, setAiText]       = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError]     = useState('')
  const aiInputRef                = useRef(null)
  const { blocks, saveBlock, deleteBlock, updateBlockName } = useStrategyBlocks()

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

        {/* AI global */}
        <div style={{ padding:'10px 12px', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:6, marginBottom:10 }}>
          <div style={{ fontFamily:MONO, fontSize:9, color:'var(--text3)', letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:8 }}>🤖 Asistente IA — describe tu estrategia completa en español</div>
          <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
            <input ref={aiInputRef} type="text" value={aiText} onChange={e=>setAiText(e.target.value)} onKeyDown={e=>e.key==='Enter'&&runAI()}
              placeholder="ej: comprar cuando EMA10 cruce al alza EMA20, stop técnico bajo EMA20, salir cuando RSI>70…"
              style={{ ...INPUT, flex:'1 1 200px', width:'auto' }} />
            <button onClick={runAI} disabled={aiLoading||!aiText.trim()} style={{ background:'rgba(155,114,255,0.15)', border:'1px solid #9b72ff', color:'#9b72ff', fontFamily:MONO, fontSize:11, fontWeight:700, padding:'6px 14px', borderRadius:4, cursor:(aiLoading||!aiText.trim())?'not-allowed':'pointer', flexShrink:0, whiteSpace:'nowrap' }}>
              {aiLoading?'⟳ Generando…':'🤖 Generar'}
            </button>
          </div>
          {aiError && <div style={{ marginTop:6, fontFamily:MONO, fontSize:10, color:'#ff7a7a' }}>⚠ {aiError}</div>}
        </div>

        {/* Cabecera columnas */}
        <div style={{ display:'flex', gap:6, marginBottom:4 }}>
          <div style={{ flex:'6 0 0', fontFamily:MONO, fontSize:8, color:'#2a4a6a', letterSpacing:'0.08em', textTransform:'uppercase', paddingLeft:4 }}>Controles</div>
          <div style={{ flex:'4 0 0', maxWidth:260, fontFamily:MONO, fontSize:8, color:'#2a4a6a', letterSpacing:'0.08em', textTransform:'uppercase', paddingLeft:4 }}>JSON directo</div>
        </div>

        {/* Role builders */}
        <div style={{ display:'flex', flexDirection:'column', gap:0, marginBottom:10 }}>
          {['filter','setup','trigger','abort','exit'].map(role => (
            <SectionRow key={role} sectionKey={role} definition={definition} setDefinition={setDefinition}
              blocks={blocks} saveBlock={saveBlock} deleteBlock={deleteBlock} updateBlockName={updateBlockName}
            />
          ))}
          <SectionRow sectionKey="stop_loss" definition={definition} setDefinition={setDefinition}
            blocks={blocks} saveBlock={saveBlock} deleteBlock={deleteBlock} updateBlockName={updateBlockName}
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
