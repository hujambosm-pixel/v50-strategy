import { useState } from 'react'
import { MONO } from '../lib/utils'
import { getSupaUrl, getSupaH } from '../lib/supabase'

const TEMA_SECTIONS = {
  global:   { label:'🌐 Global (todo)', selector:'body *' },
  header:   { label:'📌 Header',        selector:'.header,.header *' },
  sidebar:  { label:'📋 Sidebar',       selector:'.sidebar,aside,.sidebar *' },
  chart:    { label:'📈 Gráfico',        selector:'.chart-wrap,.chart-wrap .chart-header *' },
  equity:   { label:'💹 Equity / barras',selector:'.equity-section,.equity-section *' },
  trades:   { label:'📑 Tabla trades',   selector:'.trades-section,.trades-section *' },
  metrics:  { label:'📊 Métricas',       selector:'.metrics-section *,div[style*="275px"] *' },
  tradelog: { label:'📒 TradeLog (global)',selector:'.tl-content,.tl-content *' },
  tl_table: { label:'📋 TradeLog tabla', selector:'.tl-ops-table,.tl-ops-table *' },
  tl_resumen:{ label:'📊 TradeLog resumen',selector:'.tl-resumen,.tl-resumen *' },
  modals:   { label:'🪟 Modales',        selector:'.tl-modal,.tl-modal *' },
}
const FONT_OPTIONS = [
  {id:'jetbrains', label:'JetBrains Mono'},
  {id:'ibmplex',   label:'IBM Plex Mono'},
  {id:'firacode',  label:'Fira Code'},
  {id:'system',    label:'System UI'},
]
export function applyTema(temaFonts){
  try{
    const fontMap={jetbrains:'"JetBrains Mono","Fira Code",monospace',ibmplex:'"IBM Plex Mono",monospace',firacode:'"Fira Code","JetBrains Mono",monospace',system:'system-ui,sans-serif'}
    let css=''
    for(const [sec,cfg] of Object.entries(TEMA_SECTIONS)){
      const fc=temaFonts[sec]; if(!fc) continue
      const parts=[]
      if(fc.family) parts.push(`font-family:${fontMap[fc.family]||fontMap.jetbrains} !important`)
      if(fc.size)   parts.push(`font-size:${fc.size}px !important`)
      if(fc.color)  parts.push(`color:${fc.color} !important`)
      if(fc.bg)     parts.push(`background:${fc.bg} !important`)
      if(parts.length) css+=`${cfg.selector}{${parts.join(';')}}\n`
    }
    let el=document.getElementById('v50-tema-style')
    if(!el){el=document.createElement('style');el.id='v50-tema-style';document.head.appendChild(el)}
    el.textContent=css
  }catch(_){}
}
export default function ContextThemeMenu({ x, y, section, onClose, onSave }) {
  const [fonts, setFonts] = useState(()=>{
    try{ return JSON.parse(localStorage.getItem('v50_settings')||'{}')?.tema?.fonts||{} }catch(_){ return {} }
  })
  const fc = fonts[section]||{}
  const saveTemaLS = (nf) => {
    try{
      const s = JSON.parse(localStorage.getItem('v50_settings')||'{}')
      s.tema = s.tema||{}; s.tema.fonts = nf
      localStorage.setItem('v50_settings', JSON.stringify(s))
    }catch(_){}
  }
  const saveTemaSupabase = async (nf) => {
    try{
      await fetch(getSupaUrl()+'/rest/v1/user_settings?on_conflict=key',{
        method:'POST',
        headers:{...getSupaH(),'Prefer':'return=minimal,resolution=merge-duplicates'},
        body:JSON.stringify({key:'v50_tema_fonts',value:JSON.stringify(nf),updated_at:new Date().toISOString()})
      })
    }catch(_){}
  }
  const upd = (k,v) => {
    const nf = {...fonts, [section]:{...fc, [k]:v||undefined}}
    setFonts(nf)
    applyTema(nf)
    saveTemaLS(nf)
    saveTemaSupabase(nf)
    onSave && onSave(nf)
  }
  const reset = () => {
    const nf = {...fonts}; delete nf[section]
    setFonts(nf); applyTema(nf)
    saveTemaLS(nf)
    saveTemaSupabase(nf)
    onSave && onSave(nf)
  }
  const secInfo = TEMA_SECTIONS[section]||{}
  // Position: keep inside viewport
  const menuW=260, menuH=310
  const vw=typeof window!=='undefined'?window.innerWidth:1200
  const vh=typeof window!=='undefined'?window.innerHeight:800
  const left=Math.min(x, vw-menuW-12)
  const top=Math.min(y, vh-menuH-12)
  return (
    <>
      {/* Overlay para cerrar — solo si click FUERA del panel */}
      <div onClick={onClose} style={{position:'fixed',inset:0,zIndex:9998}}/>
      <div onClick={e=>e.stopPropagation()} style={{position:'fixed',left,top,zIndex:9999,width:menuW,
        background:'#0d1825',border:'1px solid #1e3a55',borderRadius:8,
        boxShadow:'0 8px 32px rgba(0,0,0,0.7)',fontFamily:MONO,fontSize:11,
        padding:'12px 14px',display:'flex',flexDirection:'column',gap:10}}>
        {/* Header */}
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',
          borderBottom:'1px solid #1a3040',paddingBottom:8,marginBottom:2}}>
          <span style={{color:'#00d4ff',fontWeight:700,fontSize:12}}>{secInfo.label}</span>
          <div style={{display:'flex',gap:6,alignItems:'center'}}>
            <button onClick={reset} title="Restablecer sección"
              style={{background:'transparent',border:'1px solid #2d4a60',color:'#ff6b6b',
                fontSize:9,padding:'2px 6px',borderRadius:3,cursor:'pointer',fontFamily:MONO}}>
              ↺ Reset
            </button>
            <button onClick={onClose} style={{background:'transparent',border:'none',
              color:'#5a7a95',fontSize:16,cursor:'pointer',lineHeight:1,padding:'0 2px'}}>×</button>
          </div>
        </div>
        {/* Sección selector */}
        <label style={{display:'flex',flexDirection:'column',gap:3}}>
          <span style={{color:'#5a8aaa',fontSize:9,letterSpacing:'0.08em'}}>SECCIÓN</span>
          <select value={section} onChange={e=>{ onClose(); setTimeout(()=>onClose(),0) }}
            disabled style={{background:'#080c14',border:'1px solid #1a2d45',borderRadius:4,
              color:'#7a9bc0',fontFamily:MONO,fontSize:10,padding:'4px 6px'}}>
            {Object.entries(TEMA_SECTIONS).map(([k,v])=>
              <option key={k} value={k}>{v.label}</option>)}
          </select>
        </label>
        {/* Fuente */}
        <label style={{display:'flex',flexDirection:'column',gap:3}}>
          <span style={{color:'#5a8aaa',fontSize:9,letterSpacing:'0.08em'}}>FUENTE</span>
          <select value={fc.family||''} onChange={e=>upd('family',e.target.value)}
            style={{background:'#080c14',border:'1px solid #1a2d45',borderRadius:4,
              color:'#e2eaf5',fontFamily:MONO,fontSize:10,padding:'4px 6px'}}>
            <option value="">— Heredar —</option>
            {FONT_OPTIONS.map(f=><option key={f.id} value={f.id}>{f.label}</option>)}
          </select>
        </label>
        {/* Tamaño + color texto */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
          <label style={{display:'flex',flexDirection:'column',gap:3}}>
            <span style={{color:'#5a8aaa',fontSize:9,letterSpacing:'0.08em'}}>TAMAÑO</span>
            <input type="number" min="8" max="24" placeholder="px"
              value={fc.size||''} onChange={e=>upd('size',e.target.value?Number(e.target.value):undefined)}
              style={{background:'#080c14',border:'1px solid #1a2d45',borderRadius:4,
                color:'#e2eaf5',fontFamily:MONO,fontSize:10,padding:'4px 6px'}}/>
          </label>
          <label style={{display:'flex',flexDirection:'column',gap:3}}>
            <span style={{color:'#5a8aaa',fontSize:9,letterSpacing:'0.08em'}}>COLOR TEXTO</span>
            <div style={{display:'flex',gap:4,alignItems:'center'}}>
              <input type="color" value={fc.color||'#e2eaf5'}
                onChange={e=>upd('color',e.target.value)}
                style={{width:28,height:28,border:'none',background:'none',cursor:'pointer',padding:0}}/>
              <input type="text" value={fc.color||''} placeholder="#e2eaf5"
                onChange={e=>upd('color',e.target.value)}
                style={{flex:1,background:'#080c14',border:'1px solid #1a2d45',borderRadius:4,
                  color:'#e2eaf5',fontFamily:MONO,fontSize:10,padding:'4px 6px'}}/>
            </div>
          </label>
        </div>
        {/* Fondo */}
        <label style={{display:'flex',flexDirection:'column',gap:3}}>
          <span style={{color:'#5a8aaa',fontSize:9,letterSpacing:'0.08em'}}>COLOR FONDO</span>
          <div style={{display:'flex',gap:4,alignItems:'center'}}>
            <input type="color" value={fc.bg||'#080c14'}
              onChange={e=>upd('bg',e.target.value)}
              style={{width:28,height:28,border:'none',background:'none',cursor:'pointer',padding:0}}/>
            <input type="text" value={fc.bg||''} placeholder="transparent"
              onChange={e=>upd('bg',e.target.value)}
              style={{flex:1,background:'#080c14',border:'1px solid #1a2d45',borderRadius:4,
                color:'#e2eaf5',fontFamily:MONO,fontSize:10,padding:'4px 6px'}}/>
            {fc.bg&&<button onClick={()=>upd('bg',undefined)}
              style={{background:'transparent',border:'none',color:'#5a7a95',cursor:'pointer',fontSize:12}}>×</button>}
          </div>
        </label>
        <div style={{display:'flex',gap:6,borderTop:'1px solid #1a2d45',paddingTop:8,marginTop:2}}>
          <button onClick={onClose}
            style={{flex:1,background:'rgba(0,212,255,0.1)',border:'1px solid #00d4ff',color:'#00d4ff',
              fontFamily:MONO,fontSize:10,padding:'6px',borderRadius:4,cursor:'pointer',fontWeight:600}}>
            ✓ Guardar y cerrar
          </button>
        </div>
        <div style={{fontSize:9,color:'#3d5a7a',textAlign:'center'}}>
          Los cambios se aplican al instante · Clic fuera para cerrar
        </div>
      </div>
    </>
  )
}
