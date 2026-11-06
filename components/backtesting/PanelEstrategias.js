// components/backtesting/PanelEstrategias.js — Backtesting, panel izquierdo. ESTRATEGIAS (colapsable): la lista con casillas, la marca «activa» y, con dos o más, la casilla «◈ Multicartera». Elemento 11 del inventario.
// Fase 1 de «el plan con lista» (docs/builder.md §76): el bloque se sacó de pages/index.js TAL CUAL; el estado sigue allí y llega
// por props con el mismo nombre que tenía.
import { MONO } from '../../lib/utils'
import { STRAT_COMPARE_COLORS } from '../../lib/coloresCifras'
import Tip from '../Tip'

export default function PanelEstrategias({ currentStratId, mcPortfolioTipOpen, mcSectionOpen, mcStratSelected, setMcPortfolioTipOpen, setMcSectionOpen, setMcStratSelected, strLoading, strategies }) {
  return (
    <div style={{flexShrink:0}}>
      <div onClick={()=>setMcSectionOpen(s=>({...s,strats:!s.strats}))}
        style={{padding:'8px 12px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',gap:6,cursor:'pointer',background:'var(--bg2)',userSelect:'none'}}
        onMouseOver={e=>e.currentTarget.style.background='rgba(0,212,255,0.04)'}
        onMouseOut={e=>e.currentTarget.style.background='var(--bg2)'}>
        <span style={{fontFamily:MONO,fontSize:9,color:'#4a7a9a',width:10}}>{mcSectionOpen.strats?'▼':'▶'}</span>
        <span style={{fontFamily:MONO,fontSize:12,color:'#c8dff5',fontWeight:600,letterSpacing:'0.05em'}}>ESTRATEGIAS</span>
        {mcStratSelected.length>1&&<span style={{marginLeft:'auto',fontFamily:MONO,fontSize:9,color:'#ffd166',background:'rgba(255,209,102,0.12)',border:'1px solid rgba(255,209,102,0.3)',borderRadius:3,padding:'1px 5px'}}>{mcStratSelected.length}</span>}
      </div>
      {mcSectionOpen.strats&&(
        <div style={{padding:'8px 10px',borderBottom:'1px solid var(--border)'}}>
          {strLoading?(
            <div style={{fontFamily:MONO,fontSize:11,color:'var(--text3)',padding:'4px 0'}}>Cargando...</div>
          ):strategies.length===0?(
            <div style={{fontFamily:MONO,fontSize:11,color:'var(--text3)',padding:'4px 0'}}>No hay estrategias guardadas</div>
          ):(
            <div style={{display:'flex',flexDirection:'column',gap:3}}>
              {mcStratSelected.length>=2&&(
                <div onClick={()=>setMcStratSelected(prev=>prev.includes('__portfolio__')?prev.filter(id=>id!=='__portfolio__'):[...prev,'__portfolio__'])}
                  onMouseEnter={()=>setMcPortfolioTipOpen(true)} onMouseLeave={()=>setMcPortfolioTipOpen(false)}
                  style={{display:'flex',alignItems:'center',gap:6,padding:'5px 8px',borderRadius:6,cursor:'pointer',marginBottom:4,
                    background:mcStratSelected.includes('__portfolio__')?'rgba(255,209,102,0.15)':'transparent',
                    border:'1px solid rgba(255,209,102,0.4)'}}>
                  <input type="checkbox" readOnly checked={mcStratSelected.includes('__portfolio__')}
                    onClick={e=>e.stopPropagation()} style={{accentColor:'#ffd166'}}/>
                  <span style={{fontFamily:MONO,color:'#ffd166',fontSize:11,fontWeight:600,display:'inline-flex',alignItems:'center'}}>◈ Multicartera ({mcStratSelected.filter(id=>id!=='__portfolio__').length})<Tip id="multicartera" open={mcPortfolioTipOpen} fontSize={12} hideIcon/></span>
                </div>
              )}
              {strategies.map((s,i)=>{
                const isActive=s.id===currentStratId
                const selIdx=mcStratSelected.indexOf(s.id)
                const isSel=selIdx!==-1
                const color=isSel?STRAT_COMPARE_COLORS[selIdx%STRAT_COMPARE_COLORS.length]:'#3d5a7a'
                return(
                  <div key={s.id}
                    onClick={()=>{
                      setMcStratSelected(prev=>prev.includes(s.id)?prev.filter(id=>id!==s.id):[...prev,s.id])
                    }}
                    style={{display:'flex',alignItems:'center',gap:7,padding:'5px 7px',borderRadius:4,
                      background:isSel?'rgba(0,212,255,0.06)':'transparent',
                      border:`1px solid ${isSel?'rgba(0,212,255,0.2)':'transparent'}`,
                      cursor:'pointer'}}
                    onMouseOver={e=>{if(!isActive)e.currentTarget.style.background=isSel?'rgba(0,212,255,0.09)':'rgba(255,255,255,0.03)'}}
                    onMouseOut={e=>e.currentTarget.style.background=isSel?'rgba(0,212,255,0.06)':'transparent'}>
                    <div style={{width:14,height:14,borderRadius:3,border:`1.5px solid ${isSel?'var(--accent)':'#3d5a7a'}`,
                      background:isSel?'var(--accent)':'transparent',flexShrink:0,
                      display:'flex',alignItems:'center',justifyContent:'center'}}>
                      {isSel&&<span style={{color:'#000',fontSize:11,lineHeight:1,fontWeight:900}}>✓</span>}
                    </div>
                    {isSel&&<div style={{width:9,height:9,borderRadius:'50%',background:STRAT_COMPARE_COLORS[selIdx%STRAT_COMPARE_COLORS.length],flexShrink:0}}/>}
                    <span style={{fontFamily:MONO,fontSize:11,color:isSel?'#d0e8fa':'#7a9bc0',flex:1,minWidth:0,
                      overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{s.name||`Estrategia ${i+1}`}</span>
                    {isActive&&<span style={{fontFamily:MONO,fontSize:8,color:'#00d4ff',background:'rgba(0,212,255,0.12)',
                      border:'1px solid rgba(0,212,255,0.3)',borderRadius:3,padding:'1px 4px',flexShrink:0}}>activa</span>}
                  </div>
                )
              })}
              {mcStratSelected.length>1&&(
                <div style={{marginTop:4,paddingTop:4,borderTop:'1px solid var(--border)',fontFamily:MONO,fontSize:10,color:'#7aabc8'}}>
                  {mcStratSelected.length} estrategias · comparación al ejecutar
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
