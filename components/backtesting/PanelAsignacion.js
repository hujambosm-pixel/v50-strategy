// components/backtesting/PanelAsignacion.js — Backtesting, panel izquierdo. MODO DE ASIGNACIÓN (colapsable): los cuatro modos (casillas con una estrategia, para comparar modos; botones con varias), y debajo, según el modo, «Máx. activos simultáneos», el criterio de entrada (Desempate / Filtro, su umbral, N días o velas y el cálculo 1 / 2) y el Risk management de Position Sizing. Elementos 5–10 del inventario.
// Fase 1 de «el plan con lista» (docs/builder.md §76): el bloque se sacó de pages/index.js TAL CUAL; el estado sigue allí y llega
// por props con el mismo nombre que tenía.
import { MONO } from '../../lib/utils'
import Tip from '../Tip'

export default function PanelAsignacion({ mcAssumedStopPct, mcCalculoPrioridad, mcCriterioUso, mcMaxAccumRisk, mcMaxPortfolioPct, mcMaxPosiciones, mcMode, mcMomGateThr, mcMomentumN, mcPrioridad, mcProxGateThr, mcRiskPerTrade, mcRsGateThr, mcRsWindow, mcSectionOpen, mcStratSelected, mcUniverso, selectedModos, setMcAssumedStopPct, setMcCalculoPrioridad, setMcCriterioUso, setMcMaxAccumRisk, setMcMaxPortfolioPct, setMcMaxPosiciones, setMcMode, setMcMomGateThr, setMcMomentumN, setMcPrioridad, setMcProxGateThr, setMcRiskPerTrade, setMcRsGateThr, setMcRsWindow, setMcSectionOpen, setSelectedModos }) {
  return (
    <div style={{flexShrink:0}}>
      <div onClick={()=>setMcSectionOpen(s=>({...s,mode:!s.mode}))}
        style={{padding:'8px 12px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',gap:6,cursor:'pointer',background:'var(--bg2)',userSelect:'none'}}
        onMouseOver={e=>e.currentTarget.style.background='rgba(0,212,255,0.04)'}
        onMouseOut={e=>e.currentTarget.style.background='var(--bg2)'}>
        <span style={{fontFamily:MONO,fontSize:9,color:'#4a7a9a',width:10}}>{mcSectionOpen.mode?'▼':'▶'}</span>
        <span style={{fontFamily:MONO,fontSize:12,color:'#c8dff5',fontWeight:600,letterSpacing:'0.05em'}}>MODO DE ASIGNACIÓN</span>
        <span style={{marginLeft:'auto',fontFamily:MONO,fontSize:10,color:'#4a6a88'}}>
          {mcStratSelected.length<=1
            ?(selectedModos.length===1
              ?(selectedModos[0]==='slots'?'Slots iguales':selectedModos[0]==='compartido'?'Capital compartido':selectedModos[0]==='concentrado'?'Capital concentrado':'Position Sizing')
              :selectedModos.map(m=>m==='slots'?'Slots':m==='compartido'?'Compartido':m==='concentrado'?'Concentrado':'Pos.Sizing').join(' + '))
            :(mcMode==='slots'?'Slots iguales':mcMode==='compartido'?'Capital compartido':mcMode==='concentrado'?'Capital concentrado':mcMode==='positionsizing'?'Position Sizing':'Slots iguales')}
        </span>
      </div>
      {mcSectionOpen.mode&&(
        <div style={{padding:'10px 12px',borderBottom:'1px solid var(--border)'}}>
          {mcStratSelected.length<=1&&(
            <div style={{fontFamily:MONO,fontSize:9,color:'#4a7a9a',marginBottom:6,letterSpacing:'0.05em'}}>
              SELECCIÓN MÚLTIPLE — compara modos en el mismo gráfico
            </div>
          )}
          {[
            {id:'slots',label:'Slots iguales',ready:true,
              desc:'El capital se divide en partes iguales y cada slot crece de forma independiente con interés compuesto. Ejemplo: 1000€ con 4 activos → 250€ por slot. Si NVDA gana +42%, su slot pasa a 355€ y el siguiente trade de NVDA parte de esos 355€. Los slots nunca se redistribuyen entre activos.'},
            {id:'compartido',label:'Capital compartido',ready:true,
              desc:'Pool de capital único compartido entre todos los activos, sin límite de posiciones simultáneas. Justo antes de cada entrada: capital_por_slot = pool_libre / slots_libres. Cuando un trade cierra, su capital (con ganancias o pérdidas) vuelve al pool. Aunque no hay tope de slots, el pool puede agotarse si muchas señales coinciden en el tiempo: las que no encuentran capital disponible se descartan. Las señales se procesan por fecha de entrada (más antigua primero) y, en empate de fecha, por orden alfabético del símbolo.'},
            {id:'concentrado',label:'Capital concentrado',ready:true,
              desc:'Pool de capital único con un máximo de N posiciones simultáneas (configurable). Capital por operación = equity_total / N_slots, donde equity_total = capital libre + capital comprometido en posiciones abiertas. Así, aunque el capital esté casi todo invertido, cada nueva operación recibe siempre su fracción justa del portafolio. Al cerrar, capital ± P&L vuelve al pool. Cuando hay más señales de entrada el mismo día que slots libres disponibles, el criterio de prioridad (configurable) decide cuáles entran: alfabético, ranking del watchlist, momentum, fuerza relativa vs SP500, o proximidad al máximo de 52 semanas. Las señales que no caben ese día se descartan: no hay cola — el activo solo entrará cuando genere una nueva señal en el futuro.'},
            {id:'positionsizing',label:'Position Sizing',ready:true,
              desc:'Pool de capital compartido con sizing por riesgo: el tamaño de cada posición sale de la distancia entrada→stop (capital × riesgo/trade ÷ distancia, limitado por el máximo de cartera por trade). Permite posiciones simultáneas con tamaños variables. Cuando una señal nueva supera el riesgo acumulado máximo o agota el pool disponible, se descarta. Las señales se procesan por fecha de entrada (más antigua primero) y, en empate de fecha, por orden alfabético del símbolo. IMPORTANTE: el stop debe existir en la vela de entrada. Se lee el primer nivel del historial de stops de la estrategia, y solo se acepta si su fecha no es posterior a la entrada. Las estrategias cuyo stop aparece más tarde (por ejemplo, cuando una vela cierra bajo la EMA20) entran sin stop conocido: esas operaciones se dimensionan con la "Distancia de stop asumida" configurable más abajo. Revisa en los resultados el aviso de operaciones dimensionadas sin stop inicial: si son muchas, el sizing depende de ese supuesto y conviene comparar con Concentrado o Compartido.'},
          ].map(m=>{
            const isCheckbox=mcStratSelected.length<=1
            const isActive=isCheckbox?selectedModos.includes(m.id):mcMode===m.id
            // Universo dinámico: solo capital concentrado (el resto se ve desactivado, con el aviso de abajo).
            const _soloConc=mcUniverso!=='manual'&&m.id!=='concentrado'
            const handleClick=()=>{
              if(!m.ready||_soloConc) return
              if(isCheckbox){
                setSelectedModos(prev=>
                  prev.includes(m.id)
                    ?(prev.length>1?prev.filter(x=>x!==m.id):prev) // don't deselect last
                    :[...prev,m.id]
                )
              } else {
                setMcMode(m.id)
              }
            }
            return(
              <div key={m.id} style={{marginBottom:3}}>
                <div onClick={handleClick} title={m.desc}
                  style={{display:'flex',alignItems:'center',gap:8,padding:'6px 8px',borderRadius:4,
                    background:isActive?'rgba(0,212,255,0.08)':'transparent',
                    border:`1px solid ${isActive?'var(--accent)':'var(--border)'}`,
                    cursor:(m.ready&&!_soloConc)?'pointer':'not-allowed',opacity:(m.ready&&!_soloConc)?1:0.45}}>
                  {isCheckbox
                    ?<div style={{width:14,height:14,borderRadius:3,border:`2px solid ${isActive?'var(--accent)':'#3d5a7a'}`,
                        background:isActive?'var(--accent)':'transparent',flexShrink:0,
                        display:'flex',alignItems:'center',justifyContent:'center'}}>
                        {isActive&&<span style={{color:'#000b18',fontSize:9,fontWeight:900,lineHeight:1}}>✓</span>}
                      </div>
                    :<div style={{width:14,height:14,borderRadius:'50%',border:`2px solid ${isActive?'var(--accent)':'#3d5a7a'}`,
                        background:isActive?'var(--accent)':'transparent',flexShrink:0}}/>
                  }
                  <span style={{fontFamily:MONO,fontSize:12,color:isActive?'var(--accent)':'#c8dff5',fontWeight:600,flex:1}}>{m.label}</span>
                </div>
              </div>
            )
          })}
          {mcUniverso!=='manual'&&(
            <div style={{fontFamily:MONO,fontSize:10,color:'#ffd166',lineHeight:1.5,marginTop:4}}>
              Con universo dinámico solo se admite Capital concentrado: los demás modos quedan desactivados y se ejecuta Concentrado.
            </div>
          )}
        </div>
      )}
      {(mcStratSelected.length<=1?selectedModos.includes('concentrado'):mcMode==='concentrado')&&(
        <div style={{padding:'8px 10px',borderTop:'1px solid #1a2a3a'}}>
          {/* Máx. activos simultáneos */}
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:6}}>
            <span title="Número máximo de activos abiertos simultáneamente. Cuantos menos configures, mayor será el capital asignado por operación."
              style={{fontSize:9,color:'#4a6a88',cursor:'help',textDecoration:'underline dotted'}}>
              Máx. activos simultáneos
            </span>
            <input type="number" min="1" max="20" step="1"
              value={mcMaxPosiciones}
              onChange={e=>setMcMaxPosiciones(Math.max(1,Math.min(20,Number(e.target.value))))}
              style={{width:65,padding:'2px 4px',borderRadius:3,
                background:'#0d1929',border:'1px solid #1a2a3a',
                color:'#e0e8f0',fontSize:11,fontFamily:MONO,textAlign:'right'}}
            />
          </div>
          {/* Prioridad de entrada */}
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:mcPrioridad==='momentum'?4:0}}>
            <span style={{display:'inline-flex',alignItems:'center',gap:3}}>
              <span title="Criterio para decidir qué activo entra primero cuando hay más señales simultáneas que slots disponibles. 'Score completo' combina rendimiento histórico + condiciones actuales del mercado (configurable en Ajustes → Ranking)"
                style={{fontSize:9,color:'#4a6a88',cursor:'help',textDecoration:'underline dotted'}}>
                Criterio de entrada
              </span>
              <Tip id="multicarteraDesempate"/>
            </span>
            <select value={mcPrioridad} onChange={e=>{const v=e.target.value;setMcPrioridad(v);if(v==='alfabetico'||v==='score_metricas'||v==='ranking')setMcCriterioUso('desempate')}}
              style={{padding:'2px 4px',borderRadius:3,background:'#0d1929',border:'1px solid #1a2a3a',
                color:'#e0e8f0',fontSize:10,fontFamily:MONO,cursor:'pointer',maxWidth:130}}>
              <option value="score_metricas" title="Usa el Score métricas actual para priorizar entradas históricas. ⚠️ Sesgo futuro: el ranking actual no refleja el que existía en cada fecha del pasado.">Ranking por métricas (sesgo futuro) ⚠️</option>
              <option value="alfabetico"    title="Orden A→Z por ticker. Sin criterio financiero">Alfabético</option>
              <option value="momentum"      title="Prioriza el activo con mayor retorno en los últimos N días">Momentum (N días)</option>
              <option value="fuerza_relativa" title="Rendimiento del activo menos el del SP500 en los últimos 63 días. Como Filtro: solo entra si es > 0 (el activo ha batido al índice en ese periodo).">Fuerza relativa vs SP500</option>
              <option value="max52"         title="Prioriza el activo más cercano a su máximo de 52 semanas (favorece breakouts)">Proximidad máximo 52s</option>
            </select>
          </div>
          {/* Uso del criterio: Desempate (defecto) | Filtro (gate) — fuerza_relativa / momentum / max52 */}
          {(()=>{
            const _filtroDisabled=mcPrioridad==='alfabetico'||mcPrioridad==='score_metricas'||mcPrioridad==='ranking'
            const _filtroDisabledMsg="Esta métrica no puede usarse como filtro: el orden alfabético no define un umbral, y el ranking por métricas usa datos futuros. Elige Fuerza relativa, Momentum o Proximidad 52s para filtrar."
            return (
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginTop:4}}>
                <span style={{fontSize:9,color:'#4a6a88'}}>Uso del criterio</span>
                <div style={{display:'flex',gap:3}}>
                  <button onClick={()=>setMcCriterioUso('desempate')}
                    title="El criterio elegido solo decide qué activo entra cuando varias señales coinciden el mismo día y no hay slots libres para todas. No filtra nada: cualquier señal con un slot libre entra."
                    style={{fontFamily:MONO,fontSize:9,padding:'2px 7px',borderRadius:3,cursor:'pointer',
                      border:`1px solid ${mcCriterioUso==='desempate'?'#00d4ff':'#1a2d45'}`,
                      background:mcCriterioUso==='desempate'?'rgba(0,212,255,0.1)':'transparent',
                      color:mcCriterioUso==='desempate'?'#00d4ff':'#3d5a7a'}}>Desempate</button>
                  <button onClick={()=>{if(!_filtroDisabled)setMcCriterioUso('filtro')}} disabled={_filtroDisabled}
                    title={_filtroDisabled
                      ?_filtroDisabledMsg
                      :"El criterio elegido actúa como condición de entrada: solo se abren posiciones en activos que lo superan (según el umbral configurable). Las señales que no lo cumplen se descartan aunque haya un slot libre. (Aplica a Fuerza relativa, Momentum y Proximidad 52s, en el modo Capital concentrado.)"}
                    style={{fontFamily:MONO,fontSize:9,padding:'2px 7px',borderRadius:3,cursor:_filtroDisabled?'not-allowed':'pointer',
                      border:`1px solid ${_filtroDisabled?'#16202c':(mcCriterioUso==='filtro'?'#00e5a0':'#1a2d45')}`,
                      background:mcCriterioUso==='filtro'&&!_filtroDisabled?'rgba(0,229,160,0.1)':'transparent',
                      color:_filtroDisabled?'#2a3a48':(mcCriterioUso==='filtro'?'#00e5a0':'#3d5a7a'),
                      opacity:_filtroDisabled?0.6:1}}>Filtro</button>
                </div>
              </div>
            )
          })()}
          {/* Umbral del gate — solo el de la métrica activa, cuando Filtro está activo */}
          {mcCriterioUso==='filtro'&&mcPrioridad==='fuerza_relativa'&&(
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginTop:4}}>
              <span title="Solo entra si la fuerza relativa vs SP500 (rendimiento del activo menos el del SP500 a 63 días) supera este %. Default 0 = basta con batir al índice."
                style={{fontSize:9,color:'#4a6a88',cursor:'help',textDecoration:'underline dotted'}}>RS mínima (%)</span>
              <input type="number" step="0.5" value={mcRsGateThr} onChange={e=>setMcRsGateThr(Number(e.target.value))}
                style={{width:65,padding:'2px 4px',borderRadius:3,background:'#0d1929',border:'1px solid #1a2a3a',color:'#e0e8f0',fontSize:11,fontFamily:MONO,textAlign:'right'}}/>
            </div>
          )}
          {mcCriterioUso==='filtro'&&mcPrioridad==='momentum'&&(
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginTop:4}}>
              <span title="Solo entra si el activo ha subido más de este % en la ventana de N días del momentum. Default 10%."
                style={{fontSize:9,color:'#4a6a88',cursor:'help',textDecoration:'underline dotted'}}>Subida mínima (%)</span>
              <input type="number" step="0.5" value={mcMomGateThr} onChange={e=>setMcMomGateThr(Number(e.target.value))}
                style={{width:65,padding:'2px 4px',borderRadius:3,background:'#0d1929',border:'1px solid #1a2a3a',color:'#e0e8f0',fontSize:11,fontFamily:MONO,textAlign:'right'}}/>
            </div>
          )}
          {mcCriterioUso==='filtro'&&mcPrioridad==='max52'&&(
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginTop:4}}>
              <span title="Solo entra si el precio está a menos de este % por debajo de su máximo de las últimas 52 semanas. Default 10% = dentro del 10% del máximo."
                style={{fontSize:9,color:'#4a6a88',cursor:'help',textDecoration:'underline dotted'}}>Máx. % bajo el máximo 52s</span>
              <input type="number" step="0.5" min="0" max="100" value={mcProxGateThr} onChange={e=>setMcProxGateThr(Math.max(0,Math.min(100,Number(e.target.value))))}
                style={{width:65,padding:'2px 4px',borderRadius:3,background:'#0d1929',border:'1px solid #1a2a3a',color:'#e0e8f0',fontSize:11,fontFamily:MONO,textAlign:'right'}}/>
            </div>
          )}
          {mcPrioridad==='score_metricas'&&(
            <div style={{fontSize:9,color:'#f59e0b',lineHeight:1.4,paddingLeft:2,marginBottom:4,marginTop:2}}>
              ⚠️ Usa el score de métricas actual para priorizar entradas históricas. Los resultados pueden ser optimistas porque el ranking actual no refleja el que existía en cada fecha del pasado.
            </div>
          )}
          {mcPrioridad==='momentum'&&(
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <span title="Número de días de lookback para calcular el retorno de momentum en el momento de la señal."
                style={{fontSize:9,color:'#4a6a88',cursor:'help',textDecoration:'underline dotted',paddingLeft:10}}>
                N días lookback
              </span>
              <input type="number" min="5" max="120" step="1"
                value={mcMomentumN}
                onChange={e=>setMcMomentumN(Math.max(5,Math.min(120,Number(e.target.value))))}
                style={{width:65,padding:'2px 4px',borderRadius:3,
                  background:'#0d1929',border:'1px solid #1a2a3a',
                  color:'#e0e8f0',fontSize:11,fontFamily:MONO,textAlign:'right'}}
              />
            </div>
          )}
          {mcPrioridad==='fuerza_relativa'&&(
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <span title="Número de VELAS de lookback para la fuerza relativa vs SP500 (retorno del activo menos el del SP500). Cuenta velas del timeframe activo: en semanal, 63 = 63 semanas. Independiente del RS de la cabecera y del ranking. Default 63."
                style={{fontSize:9,color:'#4a6a88',cursor:'help',textDecoration:'underline dotted',paddingLeft:10}}>
                N velas lookback
              </span>
              <input type="number" min="2" max="500" step="1"
                value={mcRsWindow}
                onChange={e=>setMcRsWindow(Math.max(2,Math.min(500,Number(e.target.value))))}
                style={{width:65,padding:'2px 4px',borderRadius:3,
                  background:'#0d1929',border:'1px solid #1a2a3a',
                  color:'#e0e8f0',fontSize:11,fontFamily:MONO,textAlign:'right'}}
              />
            </div>
          )}
          {(mcPrioridad==='momentum'||mcPrioridad==='fuerza_relativa'||mcPrioridad==='max52')&&(
            <div data-prueba="calculo-prioridad" style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginTop:4}}>
              <span title="Con qué vela se mide la prioridad. 2 (por defecto): con el último cierre conocido al comprar, la vela anterior a la de entrada (la propia si la estrategia entra al cierre). 1 (antiguo): con el cierre del día de entrada, que en una compra a la apertura o durante la vela todavía no se conoce; solo para reproducir resultados guardados antes de V9.997."
                style={{fontSize:9,color:'#4a6a88',cursor:'help',textDecoration:'underline dotted',paddingLeft:10}}>
                Cálculo
              </span>
              <select value={mcCalculoPrioridad} onChange={e=>setMcCalculoPrioridad(Number(e.target.value))}
                style={{padding:'2px 4px',borderRadius:3,background:'#0d1929',border:'1px solid #1a2a3a',color:mcCalculoPrioridad===1?'#f59e0b':'#e0e8f0',fontSize:10,fontFamily:MONO}}>
                <option value={2}>2 · cierre anterior</option>
                <option value={1}>1 · antiguo (mira al futuro)</option>
              </select>
            </div>
          )}
        </div>
      )}
      {(mcStratSelected.length<=1?selectedModos.includes('positionsizing'):mcMode==='positionsizing')&&(
        <div style={{padding:'8px 10px',borderTop:'1px solid #1a2a3a'}}>
          <div style={{fontFamily:MONO,fontSize:9,color:'#4a7a9a',letterSpacing:'0.07em',marginBottom:7,textTransform:'uppercase',fontWeight:600}}>Risk management</div>
          {[
            {label:'Riesgo por trade',value:mcRiskPerTrade,set:setMcRiskPerTrade,
              tooltip:'Porcentaje del capital total que arriesgas en cada operación. Fórmula: capital × riesgo% / distancia_al_stop. Si no hay stop definido, se usa el % máximo de cartera por trade como fallback.'},
            {label:'Máx. cartera/trade',value:mcMaxPortfolioPct,set:setMcMaxPortfolioPct,
              tooltip:'Límite máximo del capital total que puedes invertir en una sola operación, independientemente del stop. Actúa como techo de seguridad cuando el stop está muy ajustado o no está definido.'},
            {label:'Máx. riesgo acumulado',value:mcMaxAccumRisk,set:setMcMaxAccumRisk,
              tooltip:'Porcentaje máximo del capital total que puede estar en riesgo simultáneamente entre todas las posiciones abiertas. Cuando se alcanza este límite, no se permiten nuevas entradas hasta que alguna posición cierre y libere riesgo.\n\nRELACIÓN CLAVE: este parámetro fija de hecho cuántas posiciones puedes tener a la vez ≈ máx. riesgo acumulado ÷ riesgo por trade. Con 20% y 5% caben 4 posiciones simultáneas; si bajas el acumulado a 10% caben solo 2, por mucho pool libre que tengas. Si ves muchas señales descartadas por riesgo acumulado, es esta división la que manda.'},
            {label:'Distancia de stop asumida',value:mcAssumedStopPct,set:setMcAssumedStopPct,
              tooltip:'Solo se aplica a las operaciones que NO tienen stop conocido en la vela de entrada — por ejemplo, estrategias cuyo stop aparece más tarde, cuando el precio cierra bajo una media. En esos casos se asume esta distancia entrada→stop y la operación se dimensiona con la fórmula normal (capital × riesgo/trade ÷ distancia, con el techo de cartera por trade), imputando al riesgo acumulado solo esa fracción y no la posición entera.\n\nSubirla = posiciones más pequeñas y menos riesgo imputado por operación (caben más simultáneas). Bajarla = posiciones mayores, que normalmente acabarán topando con el techo de cartera por trade.\n\nEl resultado del backtest indica cuántas operaciones se dimensionaron así.'},
          ].map(p=>(
            <div key={p.label} style={{display:'flex',alignItems:'center',
              justifyContent:'space-between',marginBottom:6}}>
              <span title={p.tooltip} style={{fontSize:9,color:'#4a6a88',
                cursor:'help',textDecoration:'underline dotted'}}>
                {p.label}
              </span>
              <div style={{display:'flex',alignItems:'center',gap:3}}>
                <input type="number" min="0.1" max="100" step="0.1"
                  value={p.value}
                  onChange={e=>p.set(Number(e.target.value))}
                  style={{width:65,padding:'2px 4px',borderRadius:3,
                    background:'#0d1929',border:'1px solid #1a2a3a',
                    color:'#e0e8f0',fontSize:11,fontFamily:MONO,
                    textAlign:'right'}}
                />
                <span style={{color:'#4a6a88',fontSize:11}}>%</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
