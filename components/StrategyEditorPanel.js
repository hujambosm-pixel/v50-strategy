import { useState, useRef, useEffect } from 'react'
import { MONO } from '../lib/utils'
import { useStrategyBlocks } from '../lib/useStrategyBlocks'

// ── Data ─────────────────────────────────────────────────────────────
const ROLES = [
  { key:'filter',      label:'FILTER',      color:'#4a9eff', desc:'Condición global de mercado' },
  { key:'setup',       label:'SETUP IN',    color:'#00d4ff', desc:'Señal de alerta/espera' },
  { key:'trigger',     label:'TRIGGER IN',  color:'#00e5a0', desc:'Disparo de entrada' },
  { key:'abort',       label:'ABORT',       color:'#ff7a7a', desc:'Cancelar entrada pendiente' },
  { key:'exit',        label:'SETUP OUT',   color:'#ffd166', desc:'Señal de salida' },
  { key:'trigger_out', label:'TRIGGER OUT', color:'#f97316', desc:'Disparo de salida' },
  { key:'stop_loss',   label:'STOP LOSS',   color:'#ff4d6d', desc:'Límite de pérdida' },
  { key:'management',  label:'MANAGEMENT',  color:'#9b72ff', desc:'Gestión de posición' },
]

const OPS = {
  ema:       [{v:'cross_up',l:'cruza al alza'},{v:'cross_down',l:'cruza a la baja'}],
  precio:    [{v:'above',l:'sobre MA'},{v:'below',l:'bajo MA'}],
  cierre:    [{v:'above',l:'sobre MA'},{v:'below',l:'bajo MA'}],
  rsi:       [{v:'above',l:'sobre nivel'},{v:'below',l:'bajo nivel'},{v:'cross_up',l:'cruza ↑ nivel'},{v:'cross_down',l:'cruza ↓ nivel'}],
  macd:      [{v:'cross_up',l:'cruza ↑ señal'},{v:'cross_down',l:'cruza ↓ señal'}],
  '52w':     [{v:'below',l:'caído ≥X% desde máx. 52s'}],
  resultado: [{v:'profit',l:'profit ≥X%'}],
}

const CMAP = {
  'ema.cross_up':'ema_cross_up','ema.cross_down':'ema_cross_down',
  'precio.above':'price_above_ma','precio.below':'price_below_ma',
  'cierre.above':'close_above_ma','cierre.below':'close_below_ma',
  'rsi.above':'rsi_above','rsi.below':'rsi_below',
  'rsi.cross_up':'rsi_cross_up','rsi.cross_down':'rsi_cross_down',
  'macd.cross_up':'macd_cross_up','macd.cross_down':'macd_cross_down',
  'precio.below_52w_high':'price_below_52w_high_pct',
  '52w.below':'price_below_52w_high_pct',
  'resultado.profit':'profit_pct',
}
const CREV = Object.fromEntries(Object.entries(CMAP).map(([k,v])=>[v,k.split('.')]))

// ── Opciones por bloque (tipos reconocidos por el backtester) ─────────
const FILTER_OPTIONS = [
  { value:'sp500_above_ema',           label:'SP500 sobre EMA',               params:{ period:10 } },
  { value:'sp500_ema_fast_above_slow', label:'SP500 EMA rápida > lenta',      params:{ ma_fast:10, ma_slow:20 } },
  { value:'price_above_ema',           label:'Precio sobre EMA',              params:{ period:10 } },
  { value:'price_below_52w_high_pct',  label:'Caída desde máx. 52 semanas',  params:{ pct:20 } },
]
const TRIGGER_IN_OPTIONS = [
  { value:'breakout_high',             label:'Supera máximo vela Setup',      params:{} },
  { value:'breakout_close',            label:'Supera cierre vela Setup',      params:{} },
  { value:'open_after_n_bars',         label:'Apertura tras N velas',         params:{ n:1 } },
  { value:'ma_direction_up',           label:'MA cambia a alcista',           params:{ period:10, ma_type:'EMA' } },
  { value:'rsi_cross_up',              label:'RSI cruza nivel ↑',             params:{ rsi_period:9, level:30 } },
  { value:'rsi_direction_up',          label:'RSI cambia a alcista',          params:{ rsi_period:9 } },
  { value:'price_below_52w_high_pct',  label:'Caída desde máx. 52 semanas',  params:{ pct:20 } },
]
const ABORT_OPTIONS = [
  { value:'ema_cross_down',            label:'Cruce bajista EMA',             params:{ ma_fast:10, ma_slow:11 } },
  { value:'price_below_ema',           label:'Precio bajo EMA',               params:{ period:10, ma_type:'EMA' } },
]
const TRIGGER_OUT_OPTIONS = [
  { value:'breakdown_low',             label:'Rompe mínimo vela Setup Out',   params:{} },
  { value:'open_after_n_bars',         label:'Apertura tras N velas',         params:{ n:1 } },
  { value:'ma_direction_down',         label:'MA cambia a bajista',           params:{ period:10, ma_type:'EMA' } },
  { value:'rsi_cross_down',            label:'RSI cruza nivel ↓',             params:{ rsi_period:9, level:70 } },
  { value:'rsi_direction_down',        label:'RSI cambia a bajista',          params:{ rsi_period:9 } },
  { value:'profit_pct',                label:'Profit objetivo %',             params:{ pct:10 } },
]
const STOP_OPTIONS = [
  { value:'low_setup_in',              label:'Bajo vela Setup In',            params:{ margin:0 } },
  { value:'below_ema',                 label:'Bajo EMA',                      params:{ period:10, ma_type:'EMA' } },
  { value:'fixed_pct',                 label:'Pérdida fija %',                params:{ pct:5 } },
  { value:'atr_multiple',              label:'ATR múltiplo (fijo)',           params:{ n:2, atr_period:14 } },
  { value:'atr_trailing',              label:'ATR trailing (dinámico)',        params:{ n:2, atr_period:14 } },
]
const SECTION_OPTIONS_MAP = {
  filter:      FILTER_OPTIONS,
  trigger:     TRIGGER_IN_OPTIONS,
  abort:       ABORT_OPTIONS,
  trigger_out: TRIGGER_OUT_OPTIONS,
  stop_loss:   STOP_OPTIONS,
}

const IND_DEFAULTS = {
  ema:       {ma_fast:10,ma_slow:20},
  precio:    {ma_period:50,ma_type:'EMA'},
  cierre:    {ma_period:50,ma_type:'EMA'},
  rsi:       {period:14,level:50},
  macd:      {fast:12,slow:26,signal:9},
  '52w':     {pct:20},
  resultado: {pct:10},
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
function summarizeCondition(block) {
  if (!block?.type) return '— Sin configurar —'
  const b  = block
  const rp = b.rsi_period || b.period || 14
  const typeMap = {
    // ── indicator types (setup / exit) ──
    'ema_cross_up':   `EMA(${b.ma_fast||10}) cruza ↑ EMA(${b.ma_slow||11})`,
    'ema_cross_down': `EMA(${b.ma_fast||10}) cruza ↓ EMA(${b.ma_slow||11})`,
    'price_above_ma': `Precio cierra sobre EMA(${b.ma_period||50})`,
    'price_below_ma': `Precio cierra bajo EMA(${b.ma_period||50})`,
    'close_above_ma': `Cierre sobre EMA(${b.ma_period||50})`,
    'close_below_ma': `Cierre bajo EMA(${b.ma_period||50})`,
    'rsi_above':      `RSI(${rp}) sobre ${b.level||70}`,
    'rsi_below':      `RSI(${rp}) bajo ${b.level||30}`,
    'rsi_cross_up':   `RSI(${rp}) cruza ↑ nivel ${b.level||30}`,
    'rsi_cross_down': `RSI(${rp}) cruza ↓ nivel ${b.level||70}`,
    'macd_cross_up':  `MACD(${b.macd_fast||12},${b.macd_slow||26},${b.macd_signal||9}) cruza ↑ señal`,
    'macd_cross_down':`MACD(${b.macd_fast||12},${b.macd_slow||26},${b.macd_signal||9}) cruza ↓ señal`,
    // ── new setup-in / setup-out types ──
    'price_below_52w_high_pct': `Caída ≥${b.pct||20}% desde máx. 52s`,
    'profit_pct':               `Profit ≥${b.pct||10}%`,
    // ── universal fallbacks (trigger / abort / trigger_out / stop_loss) ──
    'sp500_above_ema':           `SP500 sobre EMA(${b.period||10})`,
    'sp500_ema_fast_above_slow': `SP500 EMA(${b.ma_fast||10}) > EMA(${b.ma_slow||20})`,
    'price_above_ema':           `Precio sobre EMA(${b.period||10})`,
    'breakout_high':             'Supera máximo vela Setup',
    'breakout_close':            'Supera cierre vela Setup',
    'open_after_n_bars':         `Apertura tras ${b.n||1} vela(s)`,
    'ma_direction_up':           `MA(${b.period||10}) cambia a alcista`,
    'ma_direction_down':         `MA(${b.period||10}) cambia a bajista`,
    'rsi_direction_up':          `RSI(${b.rsi_period||9}) cambia a alcista`,
    'rsi_direction_down':        `RSI(${b.rsi_period||9}) cambia a bajista`,
    'rsi_cross_up':              `RSI(${b.rsi_period||9}) cruza ↑ nivel ${b.level||30}`,
    'rsi_cross_down':            `RSI(${b.rsi_period||9}) cruza ↓ nivel ${b.level||70}`,
    'breakdown_low':             'Rompe mínimo vela Setup Out',
    'price_below_ema':           `Precio bajo EMA(${b.period||10})`,
    'ema_cross_down':            `EMA(${b.ma_fast||10}) cruza ↓ EMA(${b.ma_slow||11})`,
    'low_setup_in':              `Bajo vela Setup In (+${b.margin||0}% margen)`,
    'below_ema':                 `Bajo EMA(${b.period||10})`,
    'fixed_pct':                 `Stop fijo ${b.pct||5}%`,
    'atr_multiple':              `ATR(${b.atr_period||14}) × ${b.n||2}`,
    'atr_trailing':              `ATR trailing(${b.atr_period||14}) × ${b.n||2}`,
  }
  return typeMap[block.type] ?? `Tipo desconocido: ${block.type}`
}

function summarizeBlock(role, block) {
  if (!block) return '— Sin configurar —'
  const t = block.type
  switch(role) {
    case 'filter': {
      const typeMap = {
        'sp500_above_ema':           `SP500 sobre EMA(${block.period||10})`,
        'sp500_ema_fast_above_slow': `SP500 EMA(${block.ma_fast||10}) > EMA(${block.ma_slow||20})`,
        'price_above_ema':           `Precio sobre EMA(${block.period||10})`,
        'price_below_52w_high_pct':  `Caída ≥${block.pct||20}% desde máx. 52s`,
        // legacy
        'precio_ema': `SP500 cierra por encima de su EMA(${block.sp500EmaR||50})`,
        'ema_ema':    `EMA(${block.sp500EmaR||50}) de SP500 sobre EMA(${block.sp500EmaL||200})`,
      }
      if (t && typeMap[t]) return typeMap[t]
      // legacy: { logic, conditions[] } — extraer primer condition
      if (!t && block.conditions?.length) return summarizeBlock('filter', block.conditions[0])
      return t ? `Filtro: ${t}` : '— Sin configurar —'
    }
    case 'setup': case 'exit':
      return summarizeCondition(block)
    case 'trigger': {
      const typeMap = {
        'breakout_high':            'Supera máximo vela Setup',
        'breakout_close':           'Supera cierre vela Setup',
        'open_after_n_bars':        `Apertura tras ${block.n||1} vela(s)`,
        'ma_direction_up':          `MA(${block.period||10}) cambia a alcista`,
        'rsi_cross_up':             `RSI(${block.rsi_period||9}) cruza ↑ nivel ${block.level||30}`,
        'rsi_direction_up':         `RSI(${block.rsi_period||9}) cambia a alcista`,
        'price_below_52w_high_pct': `Caída ≥${block.pct||20}% desde máx. 52s`,
      }
      return typeMap[t] ?? summarizeCondition(block)
    }
    case 'abort': {
      const typeMap = {
        'ema_cross_down':  `Cruce bajista EMA(${block.ma_fast||10})/EMA(${block.ma_slow||11})`,
        'price_below_ema': `Precio bajo EMA(${block.period||10})`,
      }
      return typeMap[t] ?? summarizeCondition(block)
    }
    case 'trigger_out': {
      const typeMap = {
        'breakdown_low':     'Rompe mínimo vela Setup Out',
        'open_after_n_bars': `Apertura tras ${block.n||1} vela(s)`,
        'ma_direction_down': `MA(${block.period||10}) cambia a bajista`,
        'rsi_cross_down':    `RSI(${block.rsi_period||9}) cruza ↓ nivel ${block.level||70}`,
        'rsi_direction_down':`RSI(${block.rsi_period||9}) cambia a bajista`,
        'profit_pct':        `Profit ≥${block.pct||10}%`,
        // legacy
        'breakout_low':    'Breakout del low de la vela de setup out',
        'next_open':       'Apertura siguiente vela',
        'close_of_setup':  'Salida al cierre de la vela de setup out',
      }
      return typeMap[t] ?? summarizeCondition(block)
    }
    case 'stop_loss': {
      const typeMap = {
        'low_setup_in': `Bajo vela Setup In (+${block.margin||0}% margen)`,
        'below_ema':    `Bajo EMA(${block.period||10})`,
        'fixed_pct':    `Stop fijo ${block.pct || block.params?.pct || 5}%`,
        'atr_multiple': `ATR(${block.atr_period||14}) × ${block.n||2}`,
        'atr_trailing': `ATR trailing(${block.atr_period||14}) × ${block.n||2}`,
        // legacy
        'tecnico':      `Stop técnico: mínimo entre EMA(${block.ma_period||10}) y low de vela de entrada`,
        'atr_based':    `Stop ATR fijo: entrada − ATR(${block.atr_period||14}) × ${block.atr_mult||2}`,
        'trailing_atr': `Trailing ATR: stop sube con el precio, ATR(${block.atr_period||14}) × ${block.atr_mult||2}`,
        'none':         '— Sin stop —',
      }
      return typeMap[t] ?? `Stop: ${t}`
    }
    case 'management': {
      const parts = []
      if (block.sin_perdidas) parts.push('Trailing de breakeven activo')
      if (block.reentry)      parts.push('Reentrada permitida')
      return parts.length ? parts.join(' · ') : 'Sin opciones de gestión'
    }
    default:
      return JSON.stringify(block, null, 2)
  }
}

function getIndicatorLabel(block) {
  if (!block?.type) return ''
  const t = block.type
  if (t.startsWith('ema_')) return 'EMA'
  if (t.startsWith('rsi_') || t === 'rsi_above' || t === 'rsi_below') return 'RSI'
  if (t.startsWith('macd_')) return 'MACD'
  if (t.includes('ma')) return 'Precio / MA'
  if (t === 'tecnico') return 'Stop técnico'
  if (t === 'atr_based' || t === 'trailing_atr') return 'ATR'
  if (t === 'fixed_pct') return 'Fijo %'
  return ''
}

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
        color:color||'#e2e8f0', textTransform:'uppercase',
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
        width:'100%', height:'100%', minHeight:80,
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

// ── SimpleBlockSelector — selector con opciones propias + params ──────
// selectOnly=true → solo renderiza el <select> (para Col 1)
// paramsOnly=true → solo renderiza los params (para Col 2)
function SimpleBlockSelector({ options, value, onChange, params, onParamChange, selectOnly=false, paramsOnly=false }) {
  const paramControls = value && (
    <div style={{ display:'flex', gap:6, flexWrap:'wrap', paddingLeft:2 }}>
      {'ma_fast' in (params||{}) && (
        <Num label="Rápida" value={params.ma_fast??10} onChange={v=>onParamChange('ma_fast',v)} />
      )}
      {'ma_slow' in (params||{}) && (
        <Num label="Lenta" value={params.ma_slow??20} onChange={v=>onParamChange('ma_slow',v)} />
      )}
      {'period' in (params||{}) && (
        <Num label="Período" value={params.period??10} onChange={v=>onParamChange('period',v)} />
      )}
      {'ma_type' in (params||{}) && (
        <label style={{ display:'flex', flexDirection:'column', gap:2, alignItems:'center', flexShrink:0 }}>
          <span style={{ fontFamily:MONO, fontSize:8, color:'var(--text3)', letterSpacing:'0.07em', textTransform:'uppercase' }}>Tipo</span>
          <select value={params.ma_type||'EMA'} onChange={e=>onParamChange('ma_type',e.target.value)}
            style={{ background:'#0d1420', border:'1px solid #1a2d45', color:'#e2e8f0', fontFamily:MONO, fontSize:9, padding:'3px 4px', borderRadius:3, outline:'none' }}>
            <option value="EMA">EMA</option>
            <option value="SMA">SMA</option>
          </select>
        </label>
      )}
      {'rsi_period' in (params||{}) && (
        <Num label="RSI Per." value={params.rsi_period??9} onChange={v=>onParamChange('rsi_period',v)} />
      )}
      {'level' in (params||{}) && (
        <Num label="Nivel" value={params.level??30} onChange={v=>onParamChange('level',v)} />
      )}
      {'n' in (params||{}) && (
        <Num label="N velas" value={params.n??1} min={1} onChange={v=>onParamChange('n',v)} />
      )}
      {'pct' in (params||{}) && (
        <Num label="%" value={params.pct??10} step={0.5} onChange={v=>onParamChange('pct',v)} />
      )}
      {'margin' in (params||{}) && (
        <Num label="Margen %" value={params.margin??0} step={0.1} onChange={v=>onParamChange('margin',v)} />
      )}
      {'atr_period' in (params||{}) && (
        <Num label="ATR Per." value={params.atr_period??14} onChange={v=>onParamChange('atr_period',v)} />
      )}
    </div>
  )
  if (paramsOnly) return paramControls || null
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
      {!paramsOnly && (
        <select
          value={value || ''}
          onChange={e => {
            const opt = options.find(o => o.value === e.target.value)
            onChange(e.target.value, opt?.params || {})
          }}
          style={{
            background:'#0d1420', border:'1px solid #1a2d45',
            color:'#e2e8f0', fontFamily:MONO, fontSize:10,
            padding:'4px 6px', borderRadius:3, width:'100%', outline:'none',
          }}
        >
          <option value=''>— Ninguno —</option>
          {options.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      )}
      {!selectOnly && paramControls}
    </div>
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
          {role==='setup' && <option value="52w">52 Semanas</option>}
          {role==='exit'  && <option value="resultado">Resultado</option>}
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
      {ind==='52w' && block && <>
        <Num label="%" value={block.pct??20} step={0.5} min={1} max={100} onChange={v=>onP('pct',v)} />
      </>}
      {ind==='resultado' && block && <>
        <Num label="%" value={block.pct??10} step={0.5} min={0.1} max={100} onChange={v=>onP('pct',v)} />
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
      <span style={{ fontFamily:MONO, fontSize:9, fontWeight:700, letterSpacing:'0.1em', color:r.color, background:`${r.color}14`, border:`1px solid ${r.color}33`, padding:'3px 8px', borderRadius:3, whiteSpace:'nowrap', flexShrink:0, minWidth:72, textAlign:'center' }}>STOP LOSS</span>

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

// ── SectionRow — 4 columnas: Label+Selector | Params | Resumen | JSON ─
function SectionRow({ sectionKey, definition, setDefinition, blocks = {}, saveBlock, deleteBlock, updateBlockName }) {
  const isStop        = sectionKey === 'stop_loss'
  const isTriggerOut  = sectionKey === 'trigger_out'
  const role          = isStop ? 'stop' : sectionKey
  const sectionBlocks = blocks[role] || []
  const r             = ROLES.find(x => x.key === sectionKey)

  const [activeName, setActiveName] = useState('')
  const [aiMode, setAiMode]         = useState(false)
  const [aiText, setAiText]         = useState('')
  const [aiLoading, setAiLoading]   = useState(false)
  const [aiError, setAiError]       = useState('')
  const [aiResult, setAiResult]     = useState(null)
  const [saveName, setSaveName]     = useState('')

  const block    = definition?.[sectionKey] || null
  // FIX 3: normalize legacy filter structure { logic, conditions[] } → flat { type, ...params }
  // (display only — JSON editor still shows raw; onChange always saves flat)
  const displayBlock = (sectionKey === 'filter' && block?.conditions?.length)
    ? block.conditions[0]
    : block
  // For regular role rows
  const rev      = !isStop ? (CREV[displayBlock?.type] || []) : []
  const ind      = rev[0] || ''
  const op       = rev[1] || ''
  // For stop rows
  const stopType = isStop ? (displayBlock?.type || '') : ''

  function onSectionChange(val) {
    setDefinition(prev => { const n={...prev}; if(val==null) delete n[sectionKey]; else n[sectionKey]=val; return n })
  }
  function setBlock(b) {
    setDefinition(prev => { const n={...prev}; if(b) n[sectionKey]=b; else delete n[sectionKey]; return n })
  }
  // Regular role helpers
  function onP(key, val) { setBlock(validateBlockDefinition({ ...block, [key]: val })) }
  function onIndChange(newInd) {
    if (!newInd) { setBlock(null); return }
    const firstOp = OPS[newInd]?.[0]?.v || ''
    setBlock({ type: CMAP[`${newInd}.${firstOp}`], ...IND_DEFAULTS[newInd] })
  }
  // Stop helpers
  function onStopTypeChange(t) {
    if (!t)                     setBlock(null)
    else if (t==='tecnico')     setBlock({ type:'tecnico',      ma_period:10 })
    else if (t==='atr_based')   setBlock({ type:'atr_based',    atr_period:14, atr_mult:1.5 })
    else if (t==='none')        setBlock({ type:'none' })
    else if (t==='fixed_pct')   setBlock({ type:'fixed_pct',    params:{ pct:5 } })
    else if (t==='trailing_atr')setBlock({ type:'trailing_atr', params:{ atr_period:14, atr_mult:2 } })
  }
  function onStopP(key,val)     { setBlock({ ...block, [key]: val }) }
  function onStopParam(key,val) { setBlock({ ...block, params:{ ...(block?.params||{}), [key]:val } }) }

  function handleSelect(blk) {
    if (!blk) { onSectionChange(null); setActiveName(''); setAiMode(false); setAiResult(null); return }
    onSectionChange(validateBlockDefinition(blk.definition))
    setActiveName(blk.name); setAiMode(false); setAiResult(null)
  }
  function openAI() { setAiMode(true); setAiText(''); setAiError(''); setAiResult(null); setSaveName('') }

  async function generateAI() {
    if (!aiText.trim()) return
    setAiLoading(true); setAiError(''); setAiResult(null)
    try {
      const res = await fetch('/api/conditions?action=groq_block', {
        method:'POST', headers:getAuthH(),
        body:JSON.stringify({ text:aiText.trim(), role }),
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
    setActiveName(saveName.trim()); setAiMode(false); setAiResult(null); setSaveName('')
  }

  const btnGhost = { background:'transparent', border:'1px solid var(--border)', color:'var(--text3)', fontFamily:MONO, fontSize:10, padding:'3px 8px', borderRadius:3, cursor:'pointer' }
  const btnAI    = { background:'rgba(155,114,255,0.12)', border:'1px solid rgba(155,114,255,0.4)', color:'#9b72ff', fontFamily:MONO, fontSize:10, padding:'3px 10px', borderRadius:3, whiteSpace:'nowrap' }
  const btnSave  = { background:'rgba(0,212,255,0.12)', border:'1px solid rgba(0,212,255,0.4)', color:'var(--accent)', fontFamily:MONO, fontSize:10, padding:'3px 10px', borderRadius:3, cursor:'pointer', whiteSpace:'nowrap' }

  const colBase = { padding:'8px 10px', background:'var(--bg2)', minHeight:80, boxSizing:'border-box' }

  // Col 2: param controls
  const TRIGGER_OUT_NATIVE = ['breakout_low','next_open','close_of_setup']
  const isTriggerOutNative = !block?.type || TRIGGER_OUT_NATIVE.includes(block?.type)
  const paramControls = isTriggerOut ? (
    <>
      {/* Select nativo — solo cuando no hay tipo de indicador cargado y hay bloque */}
      {isTriggerOutNative && block && (
        <select
          value={block?.type || ''}
          onChange={e => {
            const t = e.target.value
            if (!t) setBlock(null)
            else setBlock({ type: t })
          }}
          style={{ ...SEL, width:'100%' }}
        >
          <option value="">— Sin trigger out —</option>
          <option value="breakout_low">Breakout del low</option>
          <option value="next_open">Apertura siguiente vela</option>
          <option value="close_of_setup">Cierre vela de setup out</option>
        </select>
      )}
      {/* Params de indicador — cuando se carga un bloque de biblioteca */}
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
      {ind==='52w' && block && <>
        <Num label="%" value={block.pct??20} step={0.5} min={1} max={100} onChange={v=>onP('pct',v)} />
      </>}
      {ind==='resultado' && block && <>
        <Num label="%" value={block.pct??10} step={0.5} min={0.1} max={100} onChange={v=>onP('pct',v)} />
      </>}
    </>
  ) : isStop ? (
    <>
      {stopType==='tecnico' && <Num label="Período MA"  value={block.ma_period??10}          onChange={v=>onStopP('ma_period',v)} />}
      {stopType==='atr_based' && <>
        <Num label="Período ATR" value={block.atr_period??14}         onChange={v=>onStopP('atr_period',v)} />
        <Num label="×Mult"       value={block.atr_mult??1.5}          onChange={v=>onStopP('atr_mult',v)} min={0.1} max={10} />
      </>}
      {stopType==='fixed_pct' && <Num label="% entrada" value={block.params?.pct??5}         onChange={v=>onStopParam('pct',v)} min={0.5} max={50} />}
      {stopType==='trailing_atr' && <>
        <Num label="Período ATR" value={block.params?.atr_period??14} onChange={v=>onStopParam('atr_period',v)} min={5} max={50} />
        <Num label="×Mult"       value={block.params?.atr_mult??2}    onChange={v=>onStopParam('atr_mult',v)} min={0.5} max={5} />
      </>}
    </>
  ) : (
    <>
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
      {ind==='52w' && block && <>
        <Num label="%" value={block.pct??20} step={0.5} min={1} max={100} onChange={v=>onP('pct',v)} />
      </>}
      {ind==='resultado' && block && <>
        <Num label="%" value={block.pct??10} step={0.5} min={0.1} max={100} onChange={v=>onP('pct',v)} />
      </>}
    </>
  )

  const indLabel = getIndicatorLabel(block)

  // Panel IA — debajo de la fila, ancho completo
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

  return (
    <div style={{ marginBottom:3 }}>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:6, alignItems:'start' }}>

        {/* Col 1 — Label + BlockSelector (biblioteca) + selector de tipo */}
        <div style={{ ...colBase, borderLeft:`3px solid ${r.color}`, borderRadius:'0 4px 4px 0', display:'flex', flexDirection:'column', gap:8 }}>
          <span style={{ fontFamily:MONO, fontSize:9, fontWeight:700, letterSpacing:'0.1em', color:r.color, background:`${r.color}14`, border:`1px solid ${r.color}33`, padding:'3px 8px', borderRadius:3, textAlign:'center', alignSelf:'flex-start' }}>
            {r.label}
          </span>
          {/* Biblioteca — solo para bloques genéricos (setup, exit) */}
          {!SECTION_OPTIONS_MAP[sectionKey] && (
            <BlockSelector
              blocks={sectionBlocks}
              value={activeName}
              onSelect={handleSelect}
              onDelete={id => { deleteBlock && deleteBlock(id); setActiveName(p => p ? '' : p) }}
              onRename={(id, name) => {
                updateBlockName && updateBlockName(id, name)
                setActiveName(prev => { const blk=sectionBlocks.find(b=>b.id===id); return (blk&&blk.name===prev)?name:prev })
              }}
              onCreateAI={openAI}
            />
          )}
          {/* Selector de tipo propio (filter, trigger, abort, trigger_out, stop_loss) */}
          {SECTION_OPTIONS_MAP[sectionKey] && (
            <SimpleBlockSelector
              options={SECTION_OPTIONS_MAP[sectionKey]}
              value={displayBlock?.type || ''}
              onChange={(type, defaultParams) => {
                setBlock(type ? { type, ...defaultParams } : null)
              }}
              params={displayBlock || {}}
              onParamChange={(key, val) => {
                setBlock(displayBlock ? { ...displayBlock, [key]: val } : { [key]: val })
              }}
              selectOnly
            />
          )}
        </div>

        {/* Col 2 — Parámetros del bloque */}
        <div style={{ ...colBase, borderRadius:4, display:'flex', flexDirection:'column', gap:8 }}>
          {SECTION_OPTIONS_MAP[sectionKey] ? (
            <SimpleBlockSelector
              options={SECTION_OPTIONS_MAP[sectionKey]}
              value={displayBlock?.type || ''}
              onChange={(type, defaultParams) => {
                setBlock(type ? { type, ...defaultParams } : null)
              }}
              params={displayBlock || {}}
              onParamChange={(key, val) => {
                setBlock(displayBlock ? { ...displayBlock, [key]: val } : { [key]: val })
              }}
              paramsOnly
            />
          ) : (
            <>
              {indLabel && (
                <span style={{ fontFamily:MONO, fontSize:9, color:'#7a9bc0', letterSpacing:'0.06em', textTransform:'uppercase' }}>{indLabel}</span>
              )}
              <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                {paramControls}
              </div>
            </>
          )}
        </div>

        {/* Col 3 — Resumen legible */}
        <div style={{ ...colBase, background:'#050810', border:'1px solid #1a2d45', borderRadius:4, fontFamily:MONO, fontSize:11, lineHeight:1.6, color: displayBlock ? '#e2e8f0' : '#3a5a75' }}>
          {summarizeBlock(sectionKey, displayBlock)}
        </div>

        {/* Col 4 — JSON directo */}
        <div style={{ minHeight:80 }}>
          <SectionJsonEditor value={definition?.[sectionKey] ?? null} onChange={onSectionChange} />
        </div>

      </div>
      {aiPanel}
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
  const [visDraft, setVisDraft]   = useState(null)
  const [visOpen, setVisOpen]     = useState(false)
  const [addingInd, setAddingInd] = useState(false)
  const aiInputRef                = useRef(null)
  const { blocks, saveBlock, deleteBlock, updateBlockName } = useStrategyBlocks()

  useEffect(() => {
    if (focusAI) {
      const t = setTimeout(() => aiInputRef.current?.focus(), 120)
      return () => clearTimeout(t)
    }
  }, [focusAI])

  function deriveIndicators(def) {
    const result = []
    const seen = new Set()
    const blockList = [
      { key:'filter',      label:'Filter' },
      { key:'setup',       label:'Setup In' },
      { key:'trigger',     label:'Trigger In' },
      { key:'abort',       label:'Abort' },
      { key:'exit',        label:'Setup Out' },
      { key:'trigger_out', label:'Trigger Out' },
      { key:'stop_loss',   label:'Stop Loss' },
    ]
    blockList.forEach(({ key, label }) => {
      const b = def[key]
      if (!b) return
      const t = b.type || ''
      if (t.includes('ema') || t.includes('ma_cross') || t.includes('precio_ema')) {
        const fast = b.ma_fast || b.ema_r || null
        const slow = b.ma_slow || b.ema_l || null
        if (fast) {
          const id = `ema_${fast}_${key}`
          if (!seen.has(id)) { seen.add(id); result.push({ id, type:'ema', period:fast, source:label, color:'#00d4ff', lineWidth:1, visible:true }) }
        }
        if (slow) {
          const id = `ema_${slow}_${key}`
          if (!seen.has(id)) { seen.add(id); result.push({ id, type:'ema', period:slow, source:label, color:'#f59e0b', lineWidth:1, visible:true }) }
        }
      }
      if (t.includes('rsi')) {
        const period = b.rsi_period || b.period || 14
        const id = `rsi_${period}_${key}`
        if (!seen.has(id)) { seen.add(id); result.push({ id, type:'rsi', period, level: b.level ?? null, source:label, color:'#a78bfa', lineWidth:1, visible:true }) }
      }
      if (t.includes('ma_direction')) {
        const period = b.period || 10
        const id = `ema_${period}_${key}`
        if (!seen.has(id)) { seen.add(id); result.push({ id, type:'ema', period, source:label, color:'#00d4ff', lineWidth:1, visible:true }) }
      }
      if (t.includes('rsi_direction') || (t.includes('rsi_cross') && !t.includes('rsi_cross_up') && !t.includes('rsi_cross_down'))) {
        const period = b.rsi_period || b.period || 9
        const id = `rsi_${period}_${key}`
        if (!seen.has(id)) { seen.add(id); result.push({ id, type:'rsi', period, level: b.level ?? null, source:label, color:'#a78bfa', lineWidth:1, visible:true }) }
      }
      if (t.includes('macd')) {
        const id = `macd_${key}`
        if (!seen.has(id)) { seen.add(id); result.push({ id, type:'macd', period:null, source:label, color:'#34d399', lineWidth:1, visible:true }) }
      }
      if (t.includes('vol')) {
        const id = `vol_${key}`
        if (!seen.has(id)) { seen.add(id); result.push({ id, type:'vol', period:null, source:label, color:'#64748b', lineWidth:1, visible:true }) }
      }
    })
    return result
  }

  useEffect(() => {
    const derived = deriveIndicators(definition)
    const existing = definition.visuals?.indicators || []
    const merged = derived.map(d => {
      const saved = existing.find(e => e.id === d.id)
      return saved ? { ...d, ...saved } : d
    })
    const extras = existing.filter(e => e.source === 'manual')
    setVisDraft({
      indicators: [...merged, ...extras],
      blocks: definition.visuals?.blocks || {}
    })
  }, [definition.filter, definition.setup, definition.trigger,
      definition.abort, definition.exit, definition.trigger_out,
      definition.stop_loss]) // eslint-disable-line

  useEffect(() => {
    if (!visDraft) return
    setDefinition(prev => ({ ...prev, visuals: visDraft }))
  }, [visDraft]) // eslint-disable-line

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
        <button onClick={onCancel} style={{ background:'transparent', border:'1px solid var(--border)', color:'#e2e8f0', fontFamily:MONO, fontSize:11, padding:'3px 10px', borderRadius:4, cursor:'pointer' }}>← Volver</button>
        <span style={{ fontFamily:MONO, fontSize:12, color:'#e2e8f0' }}>{strategy?.id ? 'Editando' : 'Nueva estrategia'}</span>
        <span style={{ fontFamily:MONO, fontSize:14, fontWeight:700, color:strForm.color||'var(--accent)' }}>{strForm.name||'—'}</span>
        <div style={{ marginLeft:'auto', display:'flex', gap:8 }}>
          {strategy?.id && <button onClick={onDelete} style={{ background:'rgba(255,77,109,0.1)', border:'1px solid #ff4d6d', color:'#ff4d6d', fontFamily:MONO, fontSize:11, padding:'4px 12px', borderRadius:4, cursor:'pointer' }}>🗑 Eliminar</button>}
          <button onClick={onCancel} style={{ background:'transparent', border:'1px solid var(--border)', color:'#e2e8f0', fontFamily:MONO, fontSize:11, padding:'4px 12px', borderRadius:4, cursor:'pointer' }}>✕ Cancelar</button>
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

        {/* ── RESUMEN DE ESTRATEGIA ── */}
        <div style={{ marginBottom:10, background:'#080c14', border:'1px solid #1a2d45', borderRadius:6, overflow:'hidden' }}>
          <div style={{ padding:'6px 12px', borderBottom:'1px solid #1a2d45', fontFamily:MONO, fontSize:9, letterSpacing:'0.1em', color:'#e2e8f0', textTransform:'uppercase' }}>
            Resumen de estrategia
          </div>
          <div style={{ padding:'8px 12px', display:'flex', flexDirection:'column', gap:4 }}>
            {[
              { label:'FILTRO',      role:'filter',     block: definition?.filter     },
              { label:'SETUP IN',    role:'setup',      block: definition?.setup      },
              { label:'TRIGGER IN',  role:'trigger',    block: definition?.trigger    },
              { label:'ABORT',       role:'abort',      block: definition?.abort      },
              { label:'SETUP OUT',   role:'exit',       block: definition?.exit       },
              { label:'TRIGGER OUT', role:'trigger',    block: definition?.trigger_out},
              { label:'STOP LOSS',   role:'stop_loss',  block: definition?.stop_loss  },
              { label:'GESTIÓN',     role:'management', block: definition?.management },
            ].map(({ label, role, block }) => (
              <div key={label} style={{ display:'flex', gap:10, alignItems:'baseline' }}>
                <span style={{ fontFamily:MONO, fontSize:9, color:'#e2e8f0', minWidth:88, flexShrink:0, letterSpacing:'0.05em' }}>{label}</span>
                <span style={{ fontFamily:MONO, fontSize:11, color: block ? '#e2e8f0' : '#3a5a75' }}>
                  {summarizeBlock(role, block)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* ── INDICADORES VISUALES ── */}
        <div style={{ background:'#080c14', border:'1px solid #1a2d45', borderRadius:6, padding:'10px 14px', marginBottom:8 }}>
          <div onClick={() => setVisOpen(v => !v)} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', cursor:'pointer', marginBottom: visOpen ? 10 : 0 }}>
            <span style={{ fontFamily:MONO, fontSize:9, color:'#e2e8f0', letterSpacing:'0.08em', textTransform:'uppercase' }}>Indicadores visuales</span>
            <span style={{ color:'#3d5a7a', fontSize:10 }}>{visOpen ? '▲' : '▼'}</span>
          </div>

          {visOpen && (
          <div>
          {/* PARTE 1 — Tabla de indicadores */}
          <div style={{marginBottom:12}}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 70px 60px 70px 50px 40px 24px', gap:4, marginBottom:4, fontFamily:MONO, fontSize:8, color:'#e2e8f0', textTransform:'uppercase' }}>
              <span>Indicador</span><span>Período</span><span>Nivel</span><span>Color</span><span>Grosor</span><span>Vis.</span><span/>
            </div>
            {(visDraft?.indicators || []).map((ind, i) => (
              <div key={ind.id} style={{ display:'grid', gridTemplateColumns:'1fr 70px 60px 70px 50px 40px 24px', gap:4, marginBottom:3, alignItems:'center' }}>
                <span style={{ fontFamily:MONO, fontSize:9, color:'#e2e8f0' }}>
                  {ind.type.toUpperCase()}{ind.period ? `(${ind.period})` : ''}{' '}
                  <span style={{ color:'#334155', fontSize:8 }}>{ind.source}</span>
                </span>
                {(ind.type === 'macd' || ind.type === 'vol') ? (
                  <div style={{ height:22, display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <span style={{ color:'#3d5a7a', fontFamily:MONO, fontSize:9, display:'block', textAlign:'center', lineHeight:'22px' }}>—</span>
                  </div>
                ) : (
                  <input type="number" value={ind.period || 20}
                    onChange={e => { const v=Number(e.target.value); setVisDraft(prev => ({ ...prev, indicators: prev.indicators.map((x,j) => j===i ? {...x,period:v} : x) })) }}
                    style={{ background:'#0d1420', border:'1px solid #1a2d45', color:'#e2e8f0', fontFamily:MONO, fontSize:9, padding:'2px 4px', borderRadius:3, width:'100%' }}
                  />
                )}
                {ind.type === 'rsi' ? (
                  <input type="number" value={ind.level ?? 30}
                    onChange={e => { const v=Number(e.target.value); setVisDraft(prev => ({ ...prev, indicators: prev.indicators.map((x,j) => j===i ? {...x,level:v} : x) })) }}
                    style={{ background:'#0d1420', border:'1px solid #1a2d45', color:'#e2e8f0', fontFamily:MONO, fontSize:9, padding:'2px 4px', borderRadius:3, width:'100%' }}
                  />
                ) : (
                  <span style={{ color:'#334155', fontFamily:MONO, fontSize:8, display:'block', textAlign:'center' }}>—</span>
                )}
                <input type="color" value={ind.color}
                  onChange={e => { const v=e.target.value; setVisDraft(prev => ({ ...prev, indicators: prev.indicators.map((x,j) => j===i ? {...x,color:v} : x) })) }}
                  style={{ width:'100%', height:22, padding:0, background:'none', border:'1px solid #1a2d45', borderRadius:3, cursor:'pointer' }}
                />
                <select value={ind.lineWidth}
                  onChange={e => { const v=Number(e.target.value); setVisDraft(prev => ({ ...prev, indicators: prev.indicators.map((x,j) => j===i ? {...x,lineWidth:v} : x) })) }}
                  style={{ background:'#0d1420', border:'1px solid #1a2d45', color:'#e2e8f0', fontFamily:MONO, fontSize:9, padding:'2px 2px', borderRadius:3, width:'100%' }}
                >
                  {[1,2,3].map(v => <option key={v} value={v}>{v}px</option>)}
                </select>
                <button
                  onClick={() => setVisDraft(prev => ({ ...prev, indicators: prev.indicators.map((x,j) => j===i ? {...x,visible:!x.visible} : x) }))}
                  style={{ background:ind.visible?'rgba(0,212,255,0.1)':'transparent', border:'1px solid', borderColor:ind.visible?'#00d4ff':'#1a2d45', color:ind.visible?'#00d4ff':'#334155', borderRadius:3, fontSize:9, padding:'2px 4px', cursor:'pointer', fontFamily:MONO, width:'100%' }}
                >
                  {ind.visible ? 'ON' : 'OFF'}
                </button>
                <button
                  onClick={() => setVisDraft(prev => ({ ...prev, indicators: prev.indicators.filter((_,j) => j !== i) }))}
                  style={{ background:'transparent', border:'1px solid #1a2d45', color:'#ef4444', fontFamily:MONO, fontSize:9, padding:'2px 4px', borderRadius:3, cursor:'pointer', lineHeight:1 }}
                >✕</button>
              </div>
            ))}
            {!addingInd ? (
              <button onClick={() => setAddingInd(true)} style={{ marginTop:4, background:'transparent', border:'1px dashed #1a2d45', color:'#3d5a7a', fontFamily:MONO, fontSize:8, padding:'3px 8px', borderRadius:3, cursor:'pointer' }}>
                + Añadir indicador
              </button>
            ) : (
              <div style={{ display:'flex', gap:4, alignItems:'center', marginTop:4 }}>
                <select id="newIndType" defaultValue="ema" style={{ background:'#0d1420', border:'1px solid #1a2d45', color:'#e2e8f0', fontFamily:MONO, fontSize:9, padding:'2px 4px', borderRadius:3 }}>
                  <option value="ema">EMA</option>
                  <option value="rsi">RSI</option>
                  <option value="macd">MACD</option>
                  <option value="vol">Volumen</option>
                </select>
                <input id="newIndPeriod" type="number" defaultValue={20} placeholder="período" style={{ width:60, background:'#0d1420', border:'1px solid #1a2d45', color:'#e2e8f0', fontFamily:MONO, fontSize:9, padding:'2px 4px', borderRadius:3 }}/>
                <button
                  onClick={() => {
                    const type = document.getElementById('newIndType').value
                    const period = Number(document.getElementById('newIndPeriod').value) || null
                    const noPeriod = ['macd','vol'].includes(type)
                    setVisDraft(prev => ({ ...prev, indicators: [...(prev?.indicators||[]), { id:'manual_'+Date.now(), type, period:noPeriod?null:(period||20), source:'manual', color:'#94a3b8', lineWidth:1, visible:true }] }))
                    setAddingInd(false)
                  }}
                  style={{ background:'rgba(0,212,255,0.1)', border:'1px solid #00d4ff', color:'#00d4ff', fontFamily:MONO, fontSize:9, padding:'2px 8px', borderRadius:3, cursor:'pointer' }}
                >Añadir</button>
                <button onClick={() => setAddingInd(false)} style={{ background:'transparent', border:'1px solid #1a2d45', color:'#3d5a7a', fontFamily:MONO, fontSize:9, padding:'2px 6px', borderRadius:3, cursor:'pointer' }}>Cancelar</button>
              </div>
            )}
          </div>

          {/* PARTE 2 — Config visual por bloque */}
          <div>
            <div style={{ fontFamily:MONO, fontSize:8, color:'#e2e8f0', textTransform:'uppercase', marginBottom:6 }}>Visualización por bloque</div>
            {[
              { key:'filter',      label:'FILTER',      types:['none','background','marker'] },
              { key:'setup_in',    label:'SETUP IN',    types:['none','background','marker'] },
              { key:'trigger_in',  label:'TRIGGER IN',  types:['none','background','marker'] },
              { key:'abort',       label:'ABORT',       types:['none','background','marker'] },
              { key:'setup_out',   label:'SETUP OUT',   types:['none','background','marker'] },
              { key:'trigger_out', label:'TRIGGER OUT', types:['none','background','marker'] },
              { key:'stop_loss',   label:'STOP LOSS',   types:['none','background','marker'] },
            ].map(({ key, label, types }) => {
              const blk = visDraft?.blocks?.[key] || { type:'none', color:'#22c55e', opacity:15, shape:'arrow', size:'M' }
              const update = (patch) => setVisDraft(prev => ({ ...prev, blocks: { ...prev.blocks, [key]: { ...blk, ...patch } } }))
              const isActive = blk.type !== 'none'
              const hasBlock = !!definition[key === 'setup_out' ? 'exit' : key === 'setup_in' ? 'setup' : key === 'trigger_in' ? 'trigger' : key]
              return (
                <div key={key} style={{ display:'grid', gridTemplateColumns:'90px 90px 1fr', gap:4, marginBottom:3, alignItems:'center', opacity: hasBlock ? 1 : 0.35 }}>
                  <span style={{ fontFamily:MONO, fontSize:8, color: isActive ? '#e2e8f0' : '#3d5a7a' }}>{label}</span>
                  <select disabled={!hasBlock} value={blk.type} onChange={e => update({ type:e.target.value })}
                    style={{ background:'#0d1420', border:'1px solid #1a2d45', color:'#e2e8f0', fontFamily:MONO, fontSize:8, padding:'2px 3px', borderRadius:3 }}
                  >
                    <option value="none">— ninguno —</option>
                    {types.includes('background') && <option value="background">Fondo color</option>}
                    {types.includes('marker') && <option value="marker">Marca / flecha</option>}
                  </select>
                  {blk.type === 'none' ? <span/> : blk.type === 'background' ? (
                    <div style={{ display:'flex', gap:4, alignItems:'center' }}>
                      <input type="color" value={blk.color} onChange={e => update({ color:e.target.value })} style={{ width:28, height:20, padding:0, background:'none', border:'1px solid #1a2d45', borderRadius:3, cursor:'pointer' }}/>
                      <span style={{ fontFamily:MONO, fontSize:8, color:'#3d5a7a' }}>Opac.</span>
                      <input type="range" min={5} max={40} value={blk.opacity||15} onChange={e => update({ opacity:Number(e.target.value) })} style={{ width:60 }}/>
                      <span style={{ fontFamily:MONO, fontSize:8, color:'#7a9bc0' }}>{blk.opacity||15}%</span>
                    </div>
                  ) : (
                    <div style={{ display:'flex', gap:4, alignItems:'center' }}>
                      <input type="color" value={blk.color} onChange={e => update({ color:e.target.value })} style={{ width:28, height:20, padding:0, background:'none', border:'1px solid #1a2d45', borderRadius:3, cursor:'pointer' }}/>
                      <select value={blk.shape||'arrow'} onChange={e => update({ shape:e.target.value })} style={{ background:'#0d1420', border:'1px solid #1a2d45', color:'#e2e8f0', fontFamily:MONO, fontSize:8, padding:'2px 3px', borderRadius:3 }}>
                        <option value="arrow_up">Flecha ↑</option>
                        <option value="arrow_down">Flecha ↓</option>
                        <option value="arrow_ne">Flecha ↗</option>
                        <option value="arrow_sw">Flecha ↘</option>
                        <option value="circle">Círculo</option>
                        <option value="square">Cuadrado</option>
                        <option value="cross">Cruz ✕</option>
                      </select>
                      <select value={blk.size||'M'} onChange={e => update({ size:e.target.value })} style={{ background:'#0d1420', border:'1px solid #1a2d45', color:'#e2e8f0', fontFamily:MONO, fontSize:8, padding:'2px 3px', borderRadius:3, width:44 }}>
                        {['S','M','L'].map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          </div>)} {/* fin visOpen */}
        </div>
        {/* ── FIN INDICADORES VISUALES ── */}

        {/* Cabecera columnas */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:6, marginBottom:4 }}>
          <div style={{ fontFamily:MONO, fontSize:8, color:'#e2e8f0', letterSpacing:'0.08em', textTransform:'uppercase', paddingLeft:4 }}>Bloque</div>
          <div style={{ fontFamily:MONO, fontSize:8, color:'#e2e8f0', letterSpacing:'0.08em', textTransform:'uppercase', paddingLeft:4 }}>Parámetros</div>
          <div style={{ fontFamily:MONO, fontSize:8, color:'#e2e8f0', letterSpacing:'0.08em', textTransform:'uppercase', paddingLeft:4 }}>Resumen</div>
          <div style={{ fontFamily:MONO, fontSize:8, color:'#e2e8f0', letterSpacing:'0.08em', textTransform:'uppercase', paddingLeft:4 }}>JSON directo</div>
        </div>

        {/* Role builders */}
        <div style={{ display:'flex', flexDirection:'column', gap:0, marginBottom:10 }}>
          {['filter','setup','trigger','abort','exit','trigger_out'].map(role => (
            <SectionRow key={role} sectionKey={role} definition={definition} setDefinition={setDefinition}
              blocks={blocks} saveBlock={saveBlock} deleteBlock={deleteBlock} updateBlockName={updateBlockName}
            />
          ))}
          <SectionRow sectionKey="stop_loss" definition={definition} setDefinition={setDefinition}
            blocks={blocks} saveBlock={saveBlock} deleteBlock={deleteBlock} updateBlockName={updateBlockName}
          />
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:6, alignItems:'stretch', marginBottom:3 }}>
            <div style={{ gridColumn:'1 / 3' }}>
              <MgmtRow definition={definition} setDefinition={setDefinition} />
            </div>
            <div style={{ fontFamily:MONO, fontSize:11, color: definition?.management ? '#e2e8f0' : '#3a5a75', padding:'6px 8px', background:'#080c14', border:'1px solid #1a2d45', borderRadius:4, alignSelf:'start' }}>
              {summarizeBlock('management', definition?.management)}
            </div>
            <div>
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
