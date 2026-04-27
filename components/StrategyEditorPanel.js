import { useState } from 'react'
import { MONO } from '../lib/utils'

const SUMMARY_SYSTEM_PROMPT = `You are a professional quantitative trading analyst. Analyze the following JavaScript backtesting strategy code and its JSON parameters. Generate a concise summary in Spanish (max 300 words) with these sections. Use only bullet points and plain text — no markdown bold (**text**), no ### headers:

INDICADORES: Technical indicators used. Periods and parameters taken from the JSON (JSON values always override code defaults).

CONDICIONES DE ENTRADA: Each entry condition and trigger mechanism.

GESTIÓN Y SALIDA: Stop loss placement, trailing mechanisms, and all exit conditions combined in one section.

FILTROS: Any market filters or trade restrictions. Omit this section if none.

Use exact parameter values from the JSON. Be concise.`

function getGroqKey() {
  try { return JSON.parse(localStorage.getItem('v50_settings')||'{}')?.integrations?.groqKey||'' }
  catch(_) { return '' }
}

const S = {
  wrap:     { display:'flex', flexDirection:'column', gap:8, padding:'10px 16px', fontFamily:MONO, color:'#c8d8e8', height:'calc(100vh - 60px)', boxSizing:'border-box', overflow:'hidden' },
  label:    { fontSize:11, color:'#7a9bc0', marginBottom:3, display:'block', flexShrink:0 },
  input:    { background:'#0d1520', border:'1px solid #1a2d45', borderRadius:4, color:'#c8d8e8', fontFamily:MONO, fontSize:12, padding:'6px 8px', outline:'none', boxSizing:'border-box' },
  textarea: { background:'#0d1520', border:'1px solid #1a2d45', borderRadius:4, color:'#c8d8e8', fontFamily:MONO, fontSize:12, padding:'8px 10px', outline:'none', boxSizing:'border-box', lineHeight:1.5, width:'100%' },
  field:    { display:'flex', flexDirection:'column' },
  btn:      (accent='#00d4ff', disabled=false) => ({
    padding:'7px 14px', borderRadius:4, fontFamily:MONO, fontSize:12, fontWeight:600, cursor:disabled?'not-allowed':'pointer',
    background:`rgba(${hexRgb(accent)},0.12)`, border:`1px solid ${disabled?'#2a3d55':accent}`,
    color:disabled?'#3a5070':accent, opacity:disabled?0.5:1, transition:'opacity 0.15s', flexShrink:0,
  }),
}

function hexRgb(hex) {
  const h = hex.replace('#','')
  return `${parseInt(h.slice(0,2),16)},${parseInt(h.slice(2,4),16)},${parseInt(h.slice(4,6),16)}`
}

export default function StrategyEditorPanel({ strForm, setStrForm, strategy, onSave, onCancel, onDelete, onClone, saving }) {
  const [paramsError, setParamsError] = useState(null)
  const [summaryLoading, setSummaryLoading] = useState(false)

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

  const handleSummary = async () => {
    const code = (strForm.code_js || '').trim()
    if (!code) return
    const key = getGroqKey()
    if (!key) { alert('Configura tu Groq API key en Ajustes → Integraciones'); return }
    setSummaryLoading(true)
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: SUMMARY_SYSTEM_PROMPT },
            { role: 'user',   content: `CODE:\n${code}\n\nPARAMS:\n${strForm.params || '{}'}` },
          ],
          max_tokens: 600,
          temperature: 0.2,
        }),
      })
      const data = await res.json()
      const text = data?.choices?.[0]?.message?.content
      if (text) upd('description', text.trim())
      else alert('Groq no devolvió respuesta: ' + JSON.stringify(data).slice(0, 200))
    } catch(e) { alert('Error Groq: ' + e.message) }
    finally { setSummaryLoading(false) }
  }

  // Marcadores visuales — inline IIFE para mantener lógica compacta
  const renderVisuals = () => {
    const DEF = {
      lines:true,         linesColor:'#00e5a0',
      arrows:true,        arrowsColor:'#00d4ff',      arrowsShape:'arrowUp',
      entryLine:true,     entryLineColor:'#ffffff',
      labels:true,        labelsColor:'#00d4ff',
      emaCrossUp:false,   emaCrossUpColor:'#00e5a0',  emaCrossUpShape:'circle',
      emaCrossDown:false, emaCrossDownColor:'#ff4d6d', emaCrossDownShape:'circle',
      chartBg:'#080c14',
    }
    let vis; try { vis = {...DEF, ...JSON.parse(strForm.visuals||'{}')} } catch { vis = {...DEF} }
    const toggle  = (key) => upd('visuals', JSON.stringify({...vis, [key]:!vis[key]}))
    const setColor = (ck, val) => upd('visuals', JSON.stringify({...vis, [ck]:val}))
    const COLOR_KEY = { lines:'linesColor', arrows:'arrowsColor', entryLine:'entryLineColor',
      labels:'labelsColor', emaCrossUp:'emaCrossUpColor', emaCrossDown:'emaCrossDownColor' }
    const SHAPES = ['arrowUp','arrowDown','circle','square','oblicua']
    return (
      <div style={{display:'flex', flexWrap:'wrap', gap:6}}>
        {[
          {key:'lines',       label:'Líneas',    icon:'/',  hasShape:false},
          {key:'arrows',      label:'Flechas',   icon:'↑',  hasShape:true, shapeKey:'arrowsShape',      shapeDefault:'arrowUp'},
          {key:'entryLine',   label:'Entrada',   icon:'—',  hasShape:false},
          {key:'labels',      label:'Etiquetas', icon:'#',  hasShape:false},
          {key:'emaCrossUp',  label:'↗ Cruce',   icon:'↗',  hasShape:true, shapeKey:'emaCrossUpShape',  shapeDefault:'circle'},
          {key:'emaCrossDown',label:'↘ Cruce',   icon:'↘',  hasShape:true, shapeKey:'emaCrossDownShape',shapeDefault:'circle'},
        ].map(({key,label,icon,hasShape,shapeKey,shapeDefault}) => {
          const on = vis[key], ck = COLOR_KEY[key]
          return (
            <div key={key} style={{display:'flex', alignItems:'center', gap:3}}>
              <button onClick={()=>toggle(key)} style={{
                display:'flex', alignItems:'center', gap:4, padding:'4px 10px',
                borderRadius:4, cursor:'pointer', fontFamily:MONO, fontSize:11, fontWeight:600,
                background:on?'rgba(0,212,255,0.12)':'rgba(0,0,0,0.2)',
                border:`1px solid ${on?'#00d4ff':'#1a2d45'}`,
                color:on?'#00d4ff':'#3a5070', transition:'all 0.15s',
              }}>
                <span style={{fontSize:9, opacity:0.7}}>{icon}</span>{label}
                <span style={{width:6, height:6, borderRadius:'50%',
                  background:on?'#00d4ff':'#1a2d45', transition:'background 0.15s'}}/>
              </button>
              {on && (
                <input type="color" value={vis[ck]||DEF[ck]}
                  onChange={e=>setColor(ck,e.target.value)} onClick={e=>e.stopPropagation()}
                  style={{width:24,height:24,border:'1px solid #1a2d45',borderRadius:3,background:'transparent',cursor:'pointer',padding:1}}/>
              )}
              {on && hasShape && (
                <select value={vis[shapeKey]||shapeDefault}
                  onChange={e=>upd('visuals',JSON.stringify({...vis,[shapeKey]:e.target.value}))}
                  onClick={e=>e.stopPropagation()}
                  style={{...S.input,width:'auto',padding:'3px 6px',fontSize:10,cursor:'pointer'}}>
                  {SHAPES.map(sh=><option key={sh} value={sh}>{sh}</option>)}
                </select>
              )}
            </div>
          )
        })}
        {/* Fondo gráfico */}
        <div style={{display:'flex', alignItems:'center', gap:4}}>
          <span style={{fontSize:11, color:'#7a9bc0'}}>Fondo</span>
          <input type="color" value={vis.chartBg||'#080c14'}
            onChange={e=>upd('visuals',JSON.stringify({...vis,chartBg:e.target.value}))}
            style={{width:24,height:24,border:'1px solid #1a2d45',borderRadius:3,background:'transparent',cursor:'pointer',padding:1}}/>
          <input style={{...S.input, width:76, padding:'3px 6px', fontSize:10}}
            value={vis.chartBg||'#080c14'}
            onChange={e=>upd('visuals',JSON.stringify({...vis,chartBg:e.target.value}))}/>
        </div>
      </div>
    )
  }

  return (
    <div style={S.wrap}>

      {/* ── FILA 1: Botones de acción ── */}
      <div style={{display:'flex', gap:8, justifyContent:'space-between', alignItems:'center', flexShrink:0}}>
        <div style={{display:'flex', gap:8}}>
          <button style={S.btn('#00e5a0', saving)} onClick={handleSave} disabled={saving}>
            {saving ? 'Guardando…' : '💾 Guardar'}
          </button>
          {!isNew && onClone && (
            <button style={S.btn('#ffd166', saving)} onClick={onClone} disabled={saving} title="Duplicar esta estrategia">
              📋 Clonar
            </button>
          )}
          <button style={S.btn('#7a9bc0', false)} onClick={onCancel}>Cancelar</button>
        </div>
        {!isNew && onDelete && (
          <button style={S.btn('#ff4d6d', false)} onClick={onDelete}>🗑 Eliminar</button>
        )}
      </div>

      {/* ── FILA 2: Campos básicos en una línea ── */}
      <div style={{display:'flex', gap:8, alignItems:'center', flexShrink:0}}>
        {/* Nombre */}
        <input
          style={{...S.input, flex:1}}
          value={strForm.name||''} onChange={e=>upd('name',e.target.value)}
          placeholder="Nombre de la estrategia"
        />
        {/* Color */}
        <input type="color" value={strForm.color||'#00d4ff'} onChange={e=>upd('color',e.target.value)}
          style={{width:30, height:30, border:'1px solid #1a2d45', borderRadius:4, background:'#0d1520', cursor:'pointer', padding:2, flexShrink:0}} />
        <input style={{...S.input, width:80}} value={strForm.color||'#00d4ff'} onChange={e=>upd('color',e.target.value)} placeholder="#hex" />
        {/* Numéricos */}
        <input style={{...S.input, width:100}} type="number" value={strForm.capital_ini||''} onChange={e=>upd('capital_ini',e.target.value)} placeholder="Capital €" />
        <input style={{...S.input, width:76}}  type="number" value={strForm.allocation_pct||''} onChange={e=>upd('allocation_pct',e.target.value)} placeholder="Asig. %" />
        <input style={{...S.input, width:64}}  type="number" value={strForm.years||''} onChange={e=>upd('years',e.target.value)} placeholder="Años" />
      </div>

      {/* ── FILA 3: Dos columnas que llenan el resto ── */}
      <div style={{flex:1, display:'grid', gridTemplateColumns:'45% 55%', gap:12, minHeight:0}}>

        {/* ── COLUMNA IZQUIERDA ── */}
        <div style={{display:'flex', flexDirection:'column', gap:8, minHeight:0}}>

          {/* Descripción / Resumen — crece */}
          <div style={{display:'flex', flexDirection:'column', flex:1, minHeight:120}}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:3, flexShrink:0}}>
              <label style={{...S.label, marginBottom:0}}>Descripción / Resumen</label>
              <button
                onClick={handleSummary}
                disabled={summaryLoading || !strForm.code_js}
                style={{...S.btn('#a78bfa', summaryLoading || !strForm.code_js), padding:'4px 9px', fontSize:11}}
              >
                {summaryLoading ? '⟳ Generando…' : '🔄 Actualizar resumen'}
              </button>
            </div>
            <textarea
              style={{...S.textarea, flex:1, resize:'none', minHeight:0}}
              value={strForm.description||''}
              onChange={e=>upd('description',e.target.value)}
              placeholder="Descripción o resumen de la lógica de la estrategia"
            />
          </div>

          {/* Parámetros (JSON) — altura fija */}
          <div style={{display:'flex', flexDirection:'column', flexShrink:0}}>
            <label style={S.label}>Parámetros (JSON)</label>
            <textarea
              style={{...S.textarea, height:110, resize:'none'}}
              value={strForm.params||''}
              onChange={e=>{ upd('params',e.target.value); setParamsError(null) }}
              placeholder={'{\n  "emaR": 10,\n  "emaL": 11\n}'}
              spellCheck={false}
            />
            {paramsError && <span style={{fontSize:11, color:'#ff4d6d', marginTop:3}}>⚠ {paramsError}</span>}
          </div>

          {/* Marcadores Visuales — compacto */}
          <div style={{flexShrink:0}}>
            <label style={S.label}>Marcadores Visuales</label>
            {renderVisuals()}
          </div>

        </div>

        {/* ── COLUMNA DERECHA: Código JS llena todo ── */}
        <div style={{display:'flex', flexDirection:'column', minHeight:0}}>
          <label style={S.label}>Código JS</label>
          <textarea
            style={{...S.textarea, flex:1, resize:'none', minHeight:0, fontFamily:MONO}}
            value={strForm.code_js||''}
            onChange={e=>upd('code_js',e.target.value)}
            placeholder="function run(bars, params) { ... }"
            spellCheck={false}
          />
        </div>

      </div>
    </div>
  )
}
