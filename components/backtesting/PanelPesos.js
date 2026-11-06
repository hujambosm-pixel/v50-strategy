// components/backtesting/PanelPesos.js — Backtesting, panel izquierdo. PESOS personalizados por valor (solo con el modo «custom» y valores elegidos): barra, «Suma total», «Repartir igual» y «Normalizar». Elemento 12 del inventario.
// Fase 1 de «el plan con lista» (docs/builder.md §76): el bloque se sacó de pages/index.js TAL CUAL; el estado sigue allí y llega
// por props con el mismo nombre que tenía.
import { MONO } from '../../lib/utils'

export default function PanelPesos({ mcMode, mcSelected, mcWeights, setMcWeights }) {
  return (
    <>
      {mcMode==='custom'&&mcSelected.length>0&&(()=>{
        const total=mcSelected.reduce((s,sym)=>s+(Number(mcWeights[sym])||0),0)
        const ok=Math.abs(total-100)<0.5
        const distribute=()=>{
          const eq=(100/mcSelected.length)
          const w={}; mcSelected.forEach(s=>{w[s]=parseFloat(eq.toFixed(1))})
          setMcWeights(w)
        }
        const normalize=()=>{
          if(total===0){distribute();return}
          const w={}; mcSelected.forEach(s=>{w[s]=parseFloat(((Number(mcWeights[s])||0)/total*100).toFixed(1))})
          setMcWeights(w)
        }
        return(
          <div style={{padding:'10px 12px',borderBottom:'1px solid var(--border)',flexShrink:0}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:7}}>
              <div style={{fontFamily:MONO,fontSize:11,color:'#c8dff5',fontWeight:600,letterSpacing:'0.05em'}}>PESOS</div>
              <div style={{display:'flex',gap:4}}>
                <button onClick={distribute}
                  style={{fontFamily:MONO,fontSize:9,padding:'2px 6px',borderRadius:3,cursor:'pointer',
                    border:'1px solid #2a4060',background:'transparent',color:'#7aabc8'}}>
                  Repartir igual
                </button>
                <button onClick={normalize}
                  style={{fontFamily:MONO,fontSize:9,padding:'2px 6px',borderRadius:3,cursor:'pointer',
                    border:'1px solid #2a4060',background:'transparent',color:'#7aabc8'}}>
                  Normalizar
                </button>
              </div>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:4}}>
              {mcSelected.map(sym=>{
                const v=mcWeights[sym]??''
                return(
                  <div key={sym} style={{display:'flex',alignItems:'center',gap:6}}>
                    <span style={{fontFamily:MONO,fontSize:11,color:'#a8ccdf',flex:1,minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{sym}</span>
                    <div style={{display:'flex',alignItems:'center',gap:3}}>
                      <input type="number" min="0" max="100" step="0.1" value={v}
                        onChange={e=>setMcWeights(prev=>({...prev,[sym]:e.target.value}))}
                        style={{width:52,background:'var(--bg3)',border:'1px solid var(--border)',
                          color:'var(--text)',fontFamily:MONO,fontSize:11,padding:'2px 5px',
                          borderRadius:3,textAlign:'right'}}/>
                      <span style={{fontFamily:MONO,fontSize:11,color:'#5a7a9a'}}>%</span>
                    </div>
                    {/* mini barra visual */}
                    <div style={{width:40,height:6,borderRadius:3,background:'rgba(61,90,122,0.3)',overflow:'hidden',flexShrink:0}}>
                      <div style={{height:'100%',borderRadius:3,width:`${Math.min(100,Number(v)||0)}%`,
                        background:ok?'#00d4ff':'#ffd166',transition:'width 0.2s'}}/>
                    </div>
                  </div>
                )
              })}
            </div>
            {/* Indicador de suma */}
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginTop:7,paddingTop:5,borderTop:'1px solid var(--border)'}}>
              <span style={{fontFamily:MONO,fontSize:10,color:'#7aabc8'}}>Suma total</span>
              <span style={{fontFamily:MONO,fontSize:12,fontWeight:700,color:ok?'#00e5a0':Math.abs(total-100)<5?'#ffd166':'#ff4d6d'}}>
                {total.toFixed(1)}% {ok?'✓':'⚠'}
              </span>
            </div>
          </div>
        )
      })()}
    </>
  )
}
