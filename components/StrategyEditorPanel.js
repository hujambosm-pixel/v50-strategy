import { useState } from 'react'
import { MONO } from '../lib/utils'

const S = {
  wrap:    { display:'flex', flexDirection:'column', gap:16, padding:'20px 24px', fontFamily:MONO, color:'#c8d8e8', maxWidth:720, margin:'0 auto' },
  label:   { fontSize:11, color:'#7a9bc0', marginBottom:4, display:'block' },
  input:   { width:'100%', background:'#0d1520', border:'1px solid #1a2d45', borderRadius:4, color:'#c8d8e8', fontFamily:MONO, fontSize:13, padding:'7px 10px', outline:'none', boxSizing:'border-box' },
  textarea:{ width:'100%', background:'#0d1520', border:'1px solid #1a2d45', borderRadius:4, color:'#c8d8e8', fontFamily:MONO, fontSize:12, padding:'8px 10px', outline:'none', resize:'vertical', boxSizing:'border-box', lineHeight:1.5 },
  row:     { display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 },
  row3:    { display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12 },
  field:   { display:'flex', flexDirection:'column' },
  btn:     (accent='#00d4ff', disabled=false) => ({
    padding:'9px 18px', borderRadius:4, fontFamily:MONO, fontSize:12, fontWeight:600, cursor:disabled?'not-allowed':'pointer',
    background:`rgba(${hexRgb(accent)},0.12)`, border:`1px solid ${disabled?'#2a3d55':accent}`,
    color:disabled?'#3a5070':accent, opacity:disabled?0.5:1, transition:'opacity 0.15s',
  }),
  separator: { borderTop:'1px solid #1a2d45', marginTop:4 },
  summaryBox:{ background:'#0a1424', border:'1px solid #1a2d45', borderRadius:4, padding:'10px 12px', fontSize:12, color:'#7a9bc0', lineHeight:1.6, minHeight:60 },
  title:   { fontSize:14, fontWeight:700, color:'#00d4ff', marginBottom:4 },
  errBox:  { background:'rgba(255,77,109,0.08)', border:'1px solid #ff4d6d', borderRadius:4, padding:'8px 12px', fontSize:11, color:'#ff4d6d' },
}

function hexRgb(hex) {
  const h = hex.replace('#','')
  return `${parseInt(h.slice(0,2),16)},${parseInt(h.slice(2,4),16)},${parseInt(h.slice(4,6),16)}`
}

export default function StrategyEditorPanel({ strForm, setStrForm, strategy, onSave, onCancel, onDelete, saving }) {
  const [generating, setGenerating] = useState(false)
  const [genError,   setGenError]   = useState(null)
  const [pineCopied, setPineCopied] = useState(false)

  const upd = (k, v) => setStrForm(f => ({ ...f, [k]: v }))

  const isNew = !strategy?.id

  const handleGenerate = async () => {
    const desc = (strForm.description || '').trim()
    if (!desc) { setGenError('Escribe una descripción antes de generar.'); return }
    setGenerating(true); setGenError(null)
    try {
      const r = await fetch('/api/generate-strategy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: desc }),
      })
      const json = await r.json()
      if (!r.ok) throw new Error(json.error || 'Error generando')
      setStrForm(f => ({ ...f, code_js: json.code_js, code_pine: json.code_pine, summary: json.summary }))
    } catch (e) {
      setGenError(e.message)
    } finally {
      setGenerating(false)
    }
  }

  const handleCopyPine = () => {
    const pine = strForm.code_pine || ''
    if (!pine) return
    navigator.clipboard.writeText(pine).then(() => {
      setPineCopied(true)
      setTimeout(() => setPineCopied(false), 2000)
    })
  }

  const hasCode = !!(strForm.code_js || '').trim()

  return (
    <div style={S.wrap}>
      <div style={S.title}>{isNew ? 'Nueva estrategia' : `Editar: ${strategy.name || '—'}`}</div>

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

      {/* ── Descripción en lenguaje natural ── */}
      <div style={S.field}>
        <label style={S.label}>Descripción en lenguaje natural</label>
        <textarea style={{...S.textarea, minHeight:80}}
          value={strForm.description||''}
          onChange={e=>upd('description',e.target.value)}
          placeholder="Ej: Compra cuando la EMA10 cruza por encima de la EMA20, vende cuando cruza por debajo. Filtro: precio por encima de la EMA200."
        />
      </div>

      {/* ── Generar con Claude ── */}
      <div style={{display:'flex',gap:8,alignItems:'center'}}>
        <button style={S.btn('#00d4ff', generating)} onClick={handleGenerate} disabled={generating}>
          {generating ? '⏳ Generando…' : '✦ Generar con Claude'}
        </button>
        {hasCode && (
          <button style={S.btn('#a78bfa', false)} onClick={handleCopyPine}>
            {pineCopied ? '✓ Copiado' : '📋 Ver Pine Script'}
          </button>
        )}
      </div>

      {genError && <div style={S.errBox}>⚠ {genError}</div>}

      {/* ── Resumen generado (solo lectura) ── */}
      {(strForm.summary || hasCode) && (
        <div style={S.field}>
          <label style={S.label}>Resumen de lógica {hasCode ? '✓' : ''}</label>
          <div style={S.summaryBox}>
            {strForm.summary || <span style={{color:'#3a5070',fontStyle:'italic'}}>Sin resumen aún — pulsa Generar.</span>}
          </div>
        </div>
      )}

      <div style={S.separator} />

      {/* ── Acciones ── */}
      <div style={{display:'flex',gap:8,justifyContent:'space-between'}}>
        <div style={{display:'flex',gap:8}}>
          <button style={S.btn('#00e5a0', saving)} onClick={onSave} disabled={saving}>
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
    </div>
  )
}
