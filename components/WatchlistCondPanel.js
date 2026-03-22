import { useState } from 'react'
import { MONO } from '../lib/utils'

const OPS = {
  ema:    [{v:'cross_up',l:'cruza al alza'},{v:'cross_down',l:'cruza a la baja'}],
  precio: [{v:'above',l:'sobre MA'},{v:'below',l:'bajo MA'}],
  rsi:    [{v:'above',l:'sobre nivel'},{v:'below',l:'bajo nivel'},{v:'cross_up',l:'cruza ↑'},{v:'cross_down',l:'cruza ↓'}],
  macd:   [{v:'cross_up',l:'cruza ↑ señal'},{v:'cross_down',l:'cruza ↓ señal'}],
}
const CMAP = {
  'ema.cross_up':'ema_cross_up','ema.cross_down':'ema_cross_down',
  'precio.above':'price_above_ma','precio.below':'price_below_ma',
  'rsi.above':'rsi_above','rsi.below':'rsi_below',
  'rsi.cross_up':'rsi_cross_up','rsi.cross_down':'rsi_cross_down',
  'macd.cross_up':'macd_cross_up','macd.cross_down':'macd_cross_down',
}
const CREV = Object.fromEntries(Object.entries(CMAP).map(([k,v])=>[v,k.split('.')]))
const IND_DEFAULTS = {
  ema:    {ma_fast:10,ma_slow:20},
  precio: {ma_period:50,ma_type:'EMA'},
  rsi:    {period:14,level:30},
  macd:   {fast:12,slow:26,signal:9},
}
export const COND_COLORS = ['#00e5a0','#ffd166','#00d4ff','#ff7eb3','#9b72ff','#ff4d6d']

const SEL = {
  background:'var(--bg3)',border:'1px solid var(--border)',
  color:'var(--text)',fontFamily:MONO,fontSize:10,
  padding:'3px 5px',borderRadius:3,cursor:'pointer',outline:'none',
}

function Num({ label, value, onChange, min=1, max=9999 }) {
  return (
    <label style={{display:'flex',flexDirection:'column',gap:1,alignItems:'center',flexShrink:0}}>
      {label&&<span style={{fontFamily:MONO,fontSize:7,color:'var(--text3)',textTransform:'uppercase'}}>{label}</span>}
      <input type="number" value={value??''} min={min} max={max}
        onChange={e=>{const n=parseFloat(e.target.value);if(!isNaN(n))onChange(n)}}
        style={{width:46,background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:10,padding:'2px 3px',borderRadius:3,textAlign:'center'}}
      />
    </label>
  )
}

const PICKER_COLORS = ['#00e5a0','#ffd166','#00d4ff','#ff7eb3','#9b72ff','#ff4d6d','#ff9a3c','#a78bfa','#7ec8e3','#f472b6']

export default function WatchlistCondPanel({ conditions, condDotIds, onCondDotIdsChange, onReload, condColors={}, onColorChange }) {
  const [editing, setEditing] = useState(null)
  const [form, setForm]       = useState({})
  const [saving, setSaving]   = useState(false)
  const [open, setOpen]       = useState(false)

  function openEdit(c, e) {
    e?.stopPropagation()
    const rev = CREV[c.type]||[]
    const existingColor = condColors[c.id] || c.params?.color || ''
    setForm({ name:c.name||'', ind:rev[0]||'', op:rev[1]||'', params:{...c.params||{}}, type:c.type||'', color:existingColor })
    setEditing(c)
    setOpen(true)
  }
  function openNew(e) {
    e?.stopPropagation()
    setForm({ name:'', ind:'', op:'', params:{}, type:'', color:'' })
    setEditing({id:null})
    setOpen(true)
  }
  function cancel() { setEditing(null); setForm({}) }

  function onIndChange(newInd) {
    if (!newInd) { setForm(f=>({...f,ind:'',op:'',type:'',params:{}})); return }
    const firstOp = OPS[newInd]?.[0]?.v||''
    setForm(f=>({...f,ind:newInd,op:firstOp,type:CMAP[`${newInd}.${firstOp}`]||'',params:{...IND_DEFAULTS[newInd]||{}}}))
  }
  function onOpChange(newOp) {
    setForm(f=>({...f,op:newOp,type:CMAP[`${f.ind}.${newOp}`]||''}))
  }
  function onP(key,val) { setForm(f=>({...f,params:{...f.params,[key]:val}})) }

  async function save() {
    if (!form.name.trim()||!form.type) return
    setSaving(true)
    try {
      // Include color inside params so it persists in Supabase
      const params = {...(form.params||{})}
      if (form.color) params.color = form.color
      else delete params.color
      const payload = { name:form.name.trim(), type:form.type, params, active:true }
      let savedId = editing?.id
      if (editing?.id) {
        const { updateCondition } = await import('../lib/conditions')
        await updateCondition(editing.id, payload)
      } else {
        const { saveCondition } = await import('../lib/conditions')
        const saved = await saveCondition(payload)
        savedId = saved.id
        // Auto-activate new condition in the watchlist dots
        onCondDotIdsChange([...condDotIds, saved.id])
      }
      // Propagate color choice to parent immediately
      if (onColorChange && savedId) onColorChange(savedId, form.color||null)
      // onReload now returns a Promise — await it so conditions are loaded before closing
      await onReload()
      cancel()
    } catch(e) {
      console.error('WatchlistCondPanel save error:', e)
      alert(`Error guardando: ${e?.message||e}`)
    }
    finally { setSaving(false) }
  }

  async function del() {
    if (!editing?.id) return
    if (!confirm('¿Eliminar esta condición del watchlist?')) return
    setSaving(true)
    try {
      const { deleteCondition } = await import('../lib/conditions')
      await deleteCondition(editing.id)
      if (condDotIds.includes(editing.id)) onCondDotIdsChange(condDotIds.filter(x=>x!==editing.id))
      await onReload()
      cancel()
    } catch(e) { console.error(e) }
    finally { setSaving(false) }
  }

  function toggleDot(c, i) {
    const sel = condDotIds.includes(c.id)
    onCondDotIdsChange(sel ? condDotIds.filter(x=>x!==c.id) : [...condDotIds, c.id])
  }

  return (
    <div style={{borderBottom:'1px solid var(--border)',flexShrink:0,background:'rgba(0,0,0,0.12)'}}>

      {/* ── Header ── */}
      <div style={{display:'flex',alignItems:'center',gap:6,padding:'5px 8px 4px',cursor:'pointer'}}
        onClick={()=>{setOpen(o=>!o);setEditing(null)}}>
        <span style={{fontFamily:MONO,fontSize:8,color:'var(--text3)',letterSpacing:'0.09em',textTransform:'uppercase',flex:1}}>
          ● Notificaciones
        </span>
        <button onClick={openNew} title="Nueva condición"
          style={{background:'rgba(0,212,255,0.1)',border:'1px solid var(--accent)',color:'var(--accent)',
            fontFamily:MONO,fontSize:11,padding:'1px 7px',borderRadius:3,cursor:'pointer',lineHeight:1.5}}>+</button>
        <span style={{fontFamily:MONO,fontSize:8,color:'var(--text3)'}}>{open?'▲':'▼'}</span>
      </div>

      {/* ── Pills (visibles solo cuando expandido) ── */}
      {open&&conditions.length>0&&!editing&&(
        <div style={{display:'flex',flexWrap:'wrap',gap:4,padding:'0 8px 6px',alignItems:'center'}}>
          {conditions.map((c,i)=>{
            const sel = condDotIds.includes(c.id)
            const col = condColors[c.id] || COND_COLORS[i%COND_COLORS.length]
            return (
              <div key={c.id} style={{display:'flex',alignItems:'center',gap:2}}>
                <span onClick={()=>toggleDot(c,i)} title={`${sel?'Ocultar':'Mostrar'}: ${c.name}`}
                  style={{display:'inline-flex',alignItems:'center',gap:4,cursor:'pointer',
                    padding:'2px 7px',borderRadius:10,
                    border:`1px solid ${sel?col:'#1e3a52'}`,
                    background:sel?`${col}18`:'rgba(255,255,255,0.02)',
                    userSelect:'none',transition:'all 0.12s'}}>
                  <span style={{width:6,height:6,borderRadius:'50%',flexShrink:0,
                    background:sel?col:'#2a3f55',
                    boxShadow:sel?`0 0 3px ${col}`:undefined,transition:'all 0.12s'}}/>
                  <span style={{fontFamily:MONO,fontSize:9,color:sel?col:'#7a9bc0',
                    maxWidth:80,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{c.name}</span>
                </span>
                <span onClick={e=>openEdit(c,e)} title="Editar"
                  style={{cursor:'pointer',color:'#3a5a70',fontSize:11,lineHeight:1,padding:'0 2px',
                    transition:'color 0.1s'}}
                  onMouseOver={e=>e.currentTarget.style.color='#00d4ff'}
                  onMouseOut={e=>e.currentTarget.style.color='#3a5a70'}>✎</span>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Editor inline ── */}
      {editing!==null&&(
        <div style={{padding:'8px 8px 10px',background:'rgba(0,0,0,0.25)',borderTop:'1px solid var(--border)'}}>
          <div style={{fontFamily:MONO,fontSize:8,color:'var(--text3)',marginBottom:6,textTransform:'uppercase',letterSpacing:'0.09em'}}>
            {editing.id?'Editar notificación':'Nueva notificación'}
          </div>

          {/* Nombre */}
          <input type="text" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}
            placeholder="Nombre de la notificación…"
            style={{width:'100%',background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',
              fontFamily:MONO,fontSize:10,padding:'4px 7px',borderRadius:3,boxSizing:'border-box',marginBottom:6}}/>

          {/* Color del círculo */}
          <div style={{display:'flex',alignItems:'center',gap:5,marginBottom:7,flexWrap:'wrap'}}>
            <span style={{fontFamily:MONO,fontSize:8,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'0.08em',flexShrink:0}}>Color</span>
            {PICKER_COLORS.map(c=>(
              <span key={c} onClick={()=>setForm(f=>({...f,color:f.color===c?'':c}))}
                title={c} style={{width:12,height:12,borderRadius:'50%',background:c,cursor:'pointer',flexShrink:0,
                  boxShadow:form.color===c?`0 0 0 2px #0d1824,0 0 0 3.5px ${c}`:'none',transition:'box-shadow 0.1s'}}/>
            ))}
            {form.color&&<span onClick={()=>setForm(f=>({...f,color:''}))}
              style={{fontFamily:MONO,fontSize:9,color:'#5a8aaa',cursor:'pointer',lineHeight:1}}
              title="Restablecer color por defecto">✕</span>}
          </div>

          {/* Constructor SI [...] */}
          <div style={{display:'flex',alignItems:'center',gap:4,flexWrap:'wrap',marginBottom:8}}>
            <span style={{fontFamily:MONO,fontSize:9,color:'var(--text3)',flexShrink:0}}>SI</span>
            <select value={form.ind||''} onChange={e=>onIndChange(e.target.value)} style={SEL}>
              <option value="">— Indicador —</option>
              <option value="ema">EMA</option>
              <option value="precio">Precio</option>
              <option value="rsi">RSI</option>
              <option value="macd">MACD</option>
            </select>
            {form.ind&&(
              <select value={form.op||''} onChange={e=>onOpChange(e.target.value)} style={SEL}>
                {(OPS[form.ind]||[]).map(o=><option key={o.v} value={o.v}>{o.l}</option>)}
              </select>
            )}
            {form.ind==='ema'&&<>
              <Num label="Rápida" value={form.params?.ma_fast??10} onChange={v=>onP('ma_fast',v)} />
              <Num label="Lenta"  value={form.params?.ma_slow??20} onChange={v=>onP('ma_slow',v)} />
            </>}
            {form.ind==='precio'&&<>
              <Num label="Período" value={form.params?.ma_period??50} onChange={v=>onP('ma_period',v)} />
              <select value={form.params?.ma_type||'EMA'} onChange={e=>onP('ma_type',e.target.value)} style={SEL}>
                <option>EMA</option><option>SMA</option>
              </select>
            </>}
            {form.ind==='rsi'&&<>
              <Num label="Período" value={form.params?.period??14} onChange={v=>onP('period',v)} />
              <Num label="Nivel"   value={form.params?.level??30}  onChange={v=>onP('level',v)} />
            </>}
            {form.ind==='macd'&&<>
              <Num label="Rápida" value={form.params?.fast??12}   onChange={v=>onP('fast',v)} />
              <Num label="Lenta"  value={form.params?.slow??26}   onChange={v=>onP('slow',v)} />
              <Num label="Señal"  value={form.params?.signal??9}  onChange={v=>onP('signal',v)} />
            </>}
          </div>

          {/* Acciones */}
          <div style={{display:'flex',gap:4}}>
            <button onClick={save} disabled={saving||!form.name.trim()||!form.type}
              style={{flex:1,fontFamily:MONO,fontSize:10,padding:'4px',borderRadius:3,
                border:'1px solid var(--accent)',background:'rgba(0,212,255,0.1)',color:'var(--accent)',
                cursor:saving||!form.name.trim()||!form.type?'not-allowed':'pointer',
                opacity:saving||!form.name.trim()||!form.type?0.4:1,transition:'opacity 0.15s'}}>
              {saving?'⟳…':'💾 Guardar'}
            </button>
            {editing?.id&&(
              <button onClick={del} disabled={saving}
                style={{fontFamily:MONO,fontSize:10,padding:'4px 8px',borderRadius:3,
                  border:'1px solid #ff4d6d',background:'rgba(255,77,109,0.1)',color:'#ff4d6d',cursor:'pointer'}}>
                🗑
              </button>
            )}
            <button onClick={cancel}
              style={{fontFamily:MONO,fontSize:10,padding:'4px 8px',borderRadius:3,
                border:'1px solid var(--border)',background:'transparent',color:'var(--text3)',cursor:'pointer'}}>
              ✕
            </button>
          </div>
        </div>
      )}

      {/* ── Sin condiciones ── */}
      {open&&conditions.length===0&&!editing&&(
        <div style={{padding:'6px 10px 8px',fontFamily:MONO,fontSize:10,color:'#4a6a80',lineHeight:1.6}}>
          Sin condiciones. Pulsa <b style={{color:'var(--accent)'}}>+</b> para crear la primera.
        </div>
      )}
    </div>
  )
}
