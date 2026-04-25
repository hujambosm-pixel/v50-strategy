import { useState } from 'react'
import { MONO } from '../lib/utils'

const S = {
  wrap:     { display:'flex', flexDirection:'column', gap:16, padding:'20px 24px', fontFamily:MONO, color:'#c8d8e8', maxWidth:760, margin:'0 auto' },
  label:    { fontSize:11, color:'#7a9bc0', marginBottom:4, display:'block' },
  input:    { width:'100%', background:'#0d1520', border:'1px solid #1a2d45', borderRadius:4, color:'#c8d8e8', fontFamily:MONO, fontSize:13, padding:'7px 10px', outline:'none', boxSizing:'border-box' },
  textarea: { width:'100%', background:'#0d1520', border:'1px solid #1a2d45', borderRadius:4, color:'#c8d8e8', fontFamily:MONO, fontSize:12, padding:'8px 10px', outline:'none', resize:'vertical', boxSizing:'border-box', lineHeight:1.5 },
  row:      { display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 },
  row3:     { display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12 },
  field:    { display:'flex', flexDirection:'column' },
  btn:      (accent='#00d4ff', disabled=false) => ({
    padding:'9px 18px', borderRadius:4, fontFamily:MONO, fontSize:12, fontWeight:600, cursor:disabled?'not-allowed':'pointer',
    background:`rgba(${hexRgb(accent)},0.12)`, border:`1px solid ${disabled?'#2a3d55':accent}`,
    color:disabled?'#3a5070':accent, opacity:disabled?0.5:1, transition:'opacity 0.15s',
  }),
  separator:{ borderTop:'1px solid #1a2d45', marginTop:4 },
  title:    { fontSize:14, fontWeight:700, color:'#00d4ff', marginBottom:4 },
}

function hexRgb(hex) {
  const h = hex.replace('#','')
  return `${parseInt(h.slice(0,2),16)},${parseInt(h.slice(2,4),16)},${parseInt(h.slice(4,6),16)}`
}

export default function StrategyEditorPanel({ strForm, setStrForm, strategy, onSave, onCancel, onDelete, saving }) {
  const [pineCopied,  setPineCopied]  = useState(false)
  const [paramsError, setParamsError] = useState(null)

  const upd = (k, v) => setStrForm(f => ({ ...f, [k]: v }))
  const isNew = !strategy?.id

  const handleSave = () => {
    const raw = (strForm.params || '').trim()
    if (raw) {
      try { JSON.parse(raw) } catch (_) { setParamsError('JSON inválido'); return }
    }
    setParamsError(null)
    onSave()
  }

  const handleCopyPine = () => {
    const pine = (strForm.code_pine || '').trim()
    if (!pine) return
    navigator.clipboard.writeText(pine).then(() => {
      setPineCopied(true)
      setTimeout(() => setPineCopied(false), 2000)
    })
  }

  return (
    <div style={S.wrap}>
      <div style={S.title}>{isNew ? 'Nueva estrategia' : `Editar: ${strategy.name || '—'}`}</div>

      {/* ── Acciones ── */}
      <div style={{display:'flex',gap:8,justifyContent:'space-between'}}>
        <div style={{display:'flex',gap:8}}>
          <button style={S.btn('#00e5a0', saving)} onClick={handleSave} disabled={saving}>
            {saving ? 'Guardando…' : '💾 Guardar'}
          </button>
          <button style={S.btn('#7a9bc0', false)} onClick={onCancel}>
            Cancelar
          </button>
        </div>
        {!isNew && onDelete && (
          <button style={S.btn('#ff4d6d', false)} onClick={onDelete}>
            🗑 Eliminar
          </button>
        )}
      </div>

      {/* ── Nombre + Color ── */}
      <div style={S.row}>
        <div style={S.field}>
          <label style={S.label}>Nombre</label>
          <input style={S.input} value={strForm.name||''} onChange={e=>upd('name',e.target.value)} placeholder="Ej: EMA Crossover 10/20" />
        </div>
        <div style={S.field}>
          <label style={S.label}>Color</label>
          <div style={{display:'flex',gap:8,alignItems:'center'}}>
            <input type="color" value={strForm.color||'#00d4ff'} onChange={e=>upd('color',e.target.value)}
              style={{width:36,height:32,border:'1px solid #1a2d45',borderRadius:4,background:'#0d1520',cursor:'pointer',padding:2}} />
            <input style={{...S.input,flex:1}} value={strForm.color||'#00d4ff'} onChange={e=>upd('color',e.target.value)} />
          </div>
        </div>
      </div>

      {/* ── Capital / Asignación / Años ── */}
      <div style={S.row3}>
        <div style={S.field}>
          <label style={S.label}>Capital (€)</label>
          <input style={S.input} type="number" value={strForm.capital_ini||''} onChange={e=>upd('capital_ini',e.target.value)} placeholder="10000" />
        </div>
        <div style={S.field}>
          <label style={S.label}>Asignación (%)</label>
          <input style={S.input} type="number" value={strForm.allocation_pct||''} onChange={e=>upd('allocation_pct',e.target.value)} placeholder="100" />
        </div>
        <div style={S.field}>
          <label style={S.label}>Años backtest</label>
          <input style={S.input} type="number" value={strForm.years||''} onChange={e=>upd('years',e.target.value)} placeholder="5" />
        </div>
      </div>

      <div style={S.separator} />

      {/* ── Descripción / Resumen ── */}
      <div style={S.field}>
        <label style={S.label}>Descripción / Resumen</label>
        <textarea style={{...S.textarea, minHeight:100}}
          value={strForm.description||''}
          onChange={e=>upd('description',e.target.value)}
          placeholder="Descripción o resumen de la lógica de la estrategia"
        />
      </div>

      {/* ── Parámetros (JSON) ── */}
      <div style={S.field}>
        <label style={S.label}>Parámetros (JSON)</label>
        <textarea style={{...S.textarea, minHeight:120}}
          value={strForm.params||''}
          onChange={e=>{ upd('params',e.target.value); setParamsError(null) }}
          placeholder={'{\n  "emaR": 10,\n  "emaL": 11\n}'}
          spellCheck={false}
        />
        {paramsError && <span style={{fontSize:11,color:'#ff4d6d',marginTop:3}}>⚠ {paramsError}</span>}
      </div>

      {/* ── Marcadores Visuales ── */}
      <div style={S.field}>
        <label style={S.label}>Marcadores Visuales</label>
        {(()=>{
          const DEF={
            lines:true,         linesColor:'#00e5a0',
            arrows:true,        arrowsColor:'#00d4ff',      arrowsShape:'arrowUp',
            entryLine:true,     entryLineColor:'#ffffff',
            labels:true,        labelsColor:'#00d4ff',
            emaCrosses:false,   emaCrossesColor:'#00e5a0',  emaCrossesShape:'circle',
          }
          let vis; try{vis={...DEF,...JSON.parse(strForm.visuals||'{}')}}catch{vis={...DEF}}
          const toggle=(key)=>upd('visuals',JSON.stringify({...vis,[key]:!vis[key]}))
          const setColor=(ck,val)=>upd('visuals',JSON.stringify({...vis,[ck]:val}))
          const COLOR_KEY={lines:'linesColor',arrows:'arrowsColor',
            entryLine:'entryLineColor',labels:'labelsColor',emaCrosses:'emaCrossesColor'}
          const SHAPES=['arrowUp','arrowDown','circle','square']
          return(
            <div style={{display:'flex',flexWrap:'wrap',gap:8,marginTop:4}}>
              {[
                {key:'lines',     label:'Líneas P&L',   icon:'/', hasShape:false},
                {key:'arrows',    label:'Flechas ↑↓',   icon:'↑', hasShape:true,  shapeKey:'arrowsShape',     shapeDefault:'arrowUp'},
                {key:'entryLine', label:'Línea entrada', icon:'—', hasShape:false},
                {key:'labels',    label:'Etiquetas #N',  icon:'#', hasShape:false},
                {key:'emaCrosses',label:'Cruces EMA',    icon:'◎', hasShape:true,  shapeKey:'emaCrossesShape', shapeDefault:'circle'},
              ].map(({key,label,icon,hasShape,shapeKey,shapeDefault})=>{
                const on=vis[key]
                const ck=COLOR_KEY[key]
                return(
                  <div key={key} style={{display:'flex',alignItems:'center',gap:4}}>
                    <button onClick={()=>toggle(key)} style={{
                      display:'flex',alignItems:'center',gap:6,padding:'6px 14px',
                      borderRadius:4,cursor:'pointer',fontFamily:MONO,fontSize:12,fontWeight:600,
                      background:on?'rgba(0,212,255,0.12)':'rgba(0,0,0,0.2)',
                      border:`1px solid ${on?'#00d4ff':'#1a2d45'}`,
                      color:on?'#00d4ff':'#3a5070',transition:'all 0.15s',
                    }}>
                      <span style={{fontSize:10,opacity:0.7}}>{icon}</span>
                      {label}
                      <span style={{width:8,height:8,borderRadius:'50%',
                        background:on?'#00d4ff':'#1a2d45',transition:'background 0.15s'}}/>
                    </button>
                    {on&&(
                      <input type="color" value={vis[ck]||DEF[ck]}
                        onChange={e=>setColor(ck,e.target.value)}
                        onClick={e=>e.stopPropagation()}
                        title={ck}
                        style={{width:28,height:28,border:'1px solid #1a2d45',
                          borderRadius:4,background:'transparent',cursor:'pointer',padding:2}}
                      />
                    )}
                    {on&&hasShape&&(
                      <select value={vis[shapeKey]||shapeDefault}
                        onChange={e=>upd('visuals',JSON.stringify({...vis,[shapeKey]:e.target.value}))}
                        onClick={e=>e.stopPropagation()}
                        style={{...S.input,width:'auto',padding:'4px 8px',fontSize:11,cursor:'pointer'}}>
                        {SHAPES.map(sh=><option key={sh} value={sh}>{sh}</option>)}
                      </select>
                    )}
                  </div>
                )
              })}
            </div>
          )
        })()}
      </div>

      {/* ── Código JS ── */}
      <div style={S.field}>
        <label style={S.label}>Código JS</label>
        <textarea style={{...S.textarea, minHeight:200}}
          value={strForm.code_js||''}
          onChange={e=>upd('code_js',e.target.value)}
          placeholder="function run(bars, params) { ... }"
          spellCheck={false}
        />
      </div>

      {/* ── Código Pine Script ── */}
      <div style={S.field}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
          <label style={{...S.label,marginBottom:0}}>Código Pine Script</label>
          <button style={S.btn('#a78bfa', false)} onClick={handleCopyPine}>
            {pineCopied ? '✓ Copiado' : '📋 Ver Pine Script'}
          </button>
        </div>
        <textarea style={{...S.textarea, minHeight:200}}
          value={strForm.code_pine||''}
          onChange={e=>upd('code_pine',e.target.value)}
          placeholder="//@version=5&#10;strategy(...)"
          spellCheck={false}
        />
      </div>

    </div>
  )
}
