import { useState } from 'react'
import { MONO } from '../lib/utils'
import { DEFAULT_DEFINITION } from '../lib/constants'
import Tip from './Tip'

export default function StrategyBuilder({ definition, setDefinition }) {
  const def = definition || DEFAULT_DEFINITION
  const [openStep, setOpenStep] = useState(null)  // null = todos colapsados, o índice del abierto

  const upd = (path, val) => {
    const d = JSON.parse(JSON.stringify(def))
    const keys = path.split('.'); let o = d
    for (let i=0; i<keys.length-1; i++) {
      if (o[keys[i]] === undefined) o[keys[i]] = {}
      o = o[keys[i]]
    }
    o[keys[keys.length-1]] = val
    setDefinition(d)
  }

  const sel = (path, val, opts, w) => (
    <select value={val||''} onChange={e=>upd(path,e.target.value)}
      style={{background:'var(--bg)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,
        fontSize:11,padding:'4px 6px',borderRadius:3,width:w||'100%',boxSizing:'border-box'}}>
      {opts.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}
    </select>
  )
  const num = (path, val, min=1, max=500, step=1) => (
    <input type="number" value={val??''} min={min} max={max} step={step}
      onChange={e=>upd(path,Number(e.target.value))}
      style={{background:'var(--bg)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,
        fontSize:11,padding:'4px 6px',borderRadius:3,width:'100%',boxSizing:'border-box'}}/>
  )
  const chk = (path, val, label) => (
    <label style={{display:'flex',alignItems:'center',gap:6,cursor:'pointer',fontSize:11,color:'var(--text2)'}}>
      <input type="checkbox" checked={!!val} onChange={e=>upd(path,e.target.checked)}
        style={{accentColor:'var(--accent)',width:12,height:12}}/>
      {label}
    </label>
  )
  const row2 = (...children) => (
    <div style={{display:'grid',gridTemplateColumns:`repeat(${children.length},1fr)`,gap:6}}>{children}</div>
  )
  const fld = (label, children) => (
    <div style={{marginBottom:6}}>
      <div style={{fontSize:9,color:'var(--text3)',letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:3}}>{label}</div>
      {children}
    </div>
  )

  const MA_TYPES = [{v:'EMA',l:'EMA'},{v:'SMA',l:'SMA'}]

  // ── Filtros de mercado: lista editable ──
  const filt = def.filter || { conditions:[], logic:'AND' }
  const addFilter = () => {
    const d = JSON.parse(JSON.stringify(def))
    d.filter = d.filter || {conditions:[],logic:'AND'}
    d.filter.conditions.push({type:'external_ma',symbol:'SP500',condition:'precio_ema',ma_type:'EMA',ma_period:10})
    setDefinition(d)
  }
  const removeFilter = (idx) => {
    const d = JSON.parse(JSON.stringify(def))
    d.filter.conditions.splice(idx,1)
    setDefinition(d)
  }
  const updFilter = (idx, key, val) => {
    const d = JSON.parse(JSON.stringify(def))
    d.filter.conditions[idx][key] = val
    setDefinition(d)
  }

  // ── Condiciones de abort: lista ──
  const abort = def.abort || { conditions:[] }
  const toggleAbort = (type) => {
    const d = JSON.parse(JSON.stringify(def))
    d.abort = d.abort || {conditions:[]}
    const idx = d.abort.conditions.findIndex(c=>c.type===type)
    if (idx>=0) d.abort.conditions.splice(idx,1)
    else d.abort.conditions.push(type==='close_below_ma'
      ? {type,ma_type:'EMA',ma_period:def.setup?.ma_fast||10}
      : {type})
    setDefinition(d)
  }
  const abortHas = (type) => abort.conditions?.some(c=>c.type===type)
  const abortCBMA = abort.conditions?.find(c=>c.type==='close_below_ma')

  const setup = def.setup || {}
  const trigger = def.trigger || {}
  const stop = def.stop || {}
  const exit = def.exit || {}
  const mgmt = def.management || {}
  const sizing = def.sizing || {}

  // ── Pasos definición ──
  const STEPS = [
    {
      num:1, key:'filter', color:'#9b72ff', label:'FILTER',
      desc:'¿Está el mercado en condición de operar?',
      summary: filt.conditions?.length
        ? filt.conditions.map(c=>`SP500 ${c.condition==='precio_ema'?'precio>EMA':'EMAr>EMAl'}`).join(' + ')
        : 'Sin filtro',
      body: (
        <div>
          {filt.conditions?.length > 1 && fld('Lógica entre condiciones',
            row2(sel('filter.logic', filt.logic||'AND', [{v:'AND',l:'Todas deben cumplirse (AND)'},{v:'OR',l:'Al menos una (OR)'}]))
          )}
          {(filt.conditions||[]).map((c,i)=>(
            <div key={i} style={{background:'rgba(155,114,255,0.06)',border:'1px solid rgba(155,114,255,0.25)',borderRadius:5,padding:'8px 10px',marginBottom:8}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
                <span style={{fontSize:10,color:'#9b72ff',fontWeight:700}}>Condición {i+1}</span>
                <button onClick={()=>removeFilter(i)} style={{background:'none',border:'none',color:'#ff4d6d',cursor:'pointer',fontSize:12,padding:0}}>✕</button>
              </div>
              {fld('Símbolo', <select value={c.symbol||'SP500'} onChange={e=>updFilter(i,'symbol',e.target.value)}
                style={{background:'var(--bg)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:11,padding:'4px 6px',borderRadius:3,width:'100%'}}>
                <option value="SP500">SP500</option>
                <option value="OWN">Mismo activo</option>
              </select>)}
              {fld('Condición', <select value={c.condition||'precio_ema'} onChange={e=>updFilter(i,'condition',e.target.value)}
                style={{background:'var(--bg)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:11,padding:'4px 6px',borderRadius:3,width:'100%'}}>
                <option value="precio_ema">Precio sobre EMA rápida</option>
                <option value="ema_ema">EMA rápida sobre EMA lenta</option>
              </select>)}
              {row2(
                fld('Tipo MA', <select value={c.ma_type||'EMA'} onChange={e=>updFilter(i,'ma_type',e.target.value)}
                  style={{background:'var(--bg)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:11,padding:'4px 6px',borderRadius:3,width:'100%'}}>
                  <option value="EMA">EMA</option><option value="SMA">SMA</option>
                </select>),
                fld('Período', <input type="number" value={c.ma_period||10} min={1} max={500}
                  onChange={e=>updFilter(i,'ma_period',Number(e.target.value))}
                  style={{background:'var(--bg)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:11,padding:'4px 6px',borderRadius:3,width:'100%'}}/>)
              )}
            </div>
          ))}
          <button onClick={addFilter} style={{width:'100%',background:'rgba(155,114,255,0.08)',border:'1px dashed rgba(155,114,255,0.4)',color:'#9b72ff',fontFamily:MONO,fontSize:10,padding:'6px',borderRadius:4,cursor:'pointer'}}>
            + Añadir condición
          </button>
        </div>
      )
    },
    {
      num:2, key:'setup', color:'#ffd166', label:'SETUP',
      desc:'¿Se ha dado la señal de alerta?',
      summary: setup.type==='ema_cross_up'
        ? `Cruce alcista ${setup.ma_type||'EMA'}(${setup.ma_fast||10}) > ${setup.ma_type||'EMA'}(${setup.ma_slow||11})`
        : setup.type||'—',
      body: (
        <div>
          {fld('Tipo de señal', sel('setup.type', setup.type||'ema_cross_up', [
            {v:'ema_cross_up',l:'Cruce alcista de medias (EMA rápida > lenta)'},
            {v:'close_above_ma',l:'Cierre sobre MA'},
            {v:'rsi_cross_level',l:'RSI cruza nivel (sobrevendido)'},
          ]))}
          {setup.type==='ema_cross_up' && row2(
            fld('MA Rápida', row2(sel('setup.ma_type',setup.ma_type||'EMA',MA_TYPES,'70px'), num('setup.ma_fast',setup.ma_fast||10))),
            fld('MA Lenta',  row2(sel('setup.ma_type_slow',setup.ma_type_slow||setup.ma_type||'EMA',MA_TYPES,'70px'), num('setup.ma_slow',setup.ma_slow||11)))
          )}
          {setup.type==='close_above_ma' && row2(
            fld('Tipo MA', sel('setup.ma_type',setup.ma_type||'EMA',MA_TYPES)),
            fld('Período', num('setup.ma_period',setup.ma_period||10))
          )}
          {setup.type==='rsi_cross_level' && row2(
            fld('Período RSI', num('setup.rsi_period',setup.rsi_period||14)),
            fld('Nivel (subir sobre)', num('setup.rsi_level',setup.rsi_level||30,1,99))
          )}
        </div>
      )
    },
    {
      num:3, key:'trigger', color:'#00d4ff', label:'TRIGGER',
      desc:'¿Cómo ejecuto la entrada?',
      summary: trigger.type==='breakout_high'
        ? `Breakout HIGH${trigger.rolling?' · rolling (actualiza nivel)':' · fijo'}`
        : trigger.type||'—',
      body: (
        <div>
          {fld('Tipo de entrada', sel('trigger.type', trigger.type||'breakout_high', [
            {v:'breakout_high',l:'Breakout del máximo de la vela de setup'},
            {v:'next_open',l:'Apertura de la siguiente vela'},
          ]))}
          {trigger.type==='breakout_high' && <>
            {chk('trigger.rolling', trigger.rolling!==false, 'Rolling: si no hay breakout, actualizar nivel al nuevo mínimo de máximos')}
            {trigger.rolling!==false && fld('Máx. velas en espera (vacío=ilimitado)',
              <input type="number" value={trigger.max_candles||''} min={1} max={100} placeholder="Ilimitado"
                onChange={e=>upd('trigger.max_candles',e.target.value?Number(e.target.value):null)}
                style={{background:'var(--bg)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:11,padding:'4px 6px',borderRadius:3,width:'100%'}}/>
            )}
          </>}
        </div>
      )
    },
    {
      num:4, key:'abort', color:'#ff9a3c', label:'ABORT',
      desc:'¿Qué cancela la entrada pendiente?',
      summary: abort.conditions?.length
        ? abort.conditions.map(c=>c.type==='ema_cross_down'?'Cruce bajista':c.type==='close_below_ma'?`Cierre<${c.ma_type||'EMA'}(${c.ma_period||10})`:'?').join(' | ')
        : 'Sin abort',
      body: (
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          {chk('_abort_cross_down', abortHas('ema_cross_down'), 'Cruce bajista de EMAs (setup→abort)')}
          {abortHas('ema_cross_down') && <div style={{fontSize:10,color:'var(--text3)',marginLeft:18,marginTop:-4}}>
            Usa las mismas EMAs definidas en el Setup
          </div>}
          {chk('_abort_close_below', abortHas('close_below_ma'), 'Cierre bajo MA rápida')}
          {abortHas('close_below_ma') && row2(
            fld('Tipo MA', <select value={abortCBMA?.ma_type||'EMA'}
              onChange={e=>{const d=JSON.parse(JSON.stringify(def));const c=d.abort.conditions.find(c=>c.type==='close_below_ma');if(c)c.ma_type=e.target.value;setDefinition(d)}}
              style={{background:'var(--bg)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:11,padding:'4px 6px',borderRadius:3,width:'100%'}}>
              <option value="EMA">EMA</option><option value="SMA">SMA</option>
            </select>),
            fld('Período', <input type="number" value={abortCBMA?.ma_period||10} min={1}
              onChange={e=>{const d=JSON.parse(JSON.stringify(def));const c=d.abort.conditions.find(c=>c.type==='close_below_ma');if(c)c.ma_period=Number(e.target.value);setDefinition(d)}}
              style={{background:'var(--bg)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:11,padding:'4px 6px',borderRadius:3,width:'100%'}}/>)
          )}
          {/* Handlers especiales para los checkboxes de abort */}
          <div style={{display:'none'}}
            ref={el=>{
              if(!el) return
              // patch checkbox handlers after render
            }}
          />
        </div>
      )
    },
    {
      num:5, key:'stop', color:'#ff4d6d', label:'STOP LOSS',
      desc:'¿Dónde está mi límite de pérdida?',
      summary: stop.type==='min_ma_low_signal'
        ? `min(${stop.ma_type||'EMA'}(${stop.ma_period||10}), LOW setup)`
        : stop.type==='atr_based'
        ? `Entrada − ATR(${stop.atr_period||14}) × ${stop.atr_mult||1.0}`
        : stop.type==='none' ? 'Sin stop' : stop.type||'—',
      body: (
        <div>
          {fld('Tipo de stop', sel('stop.type', stop.type||'min_ma_low_signal', [
            {v:'min_ma_low_signal', l:'min(MA, LOW de la vela de setup)'},
            {v:'low_of_signal_candle', l:'Mínimo de la vela de setup'},
            {v:'low_of_entry_candle', l:'Mínimo de la vela de entrada'},
            {v:'atr_based', l:'Entrada − ATR × multiplicador'},
            {v:'none', l:'Sin stop loss'},
          ]))}
          {['min_ma_low_signal','low_of_signal_candle'].includes(stop.type||'min_ma_low_signal') && stop.type!=='low_of_signal_candle' && row2(
            fld('Tipo MA', sel('stop.ma_type',stop.ma_type||'EMA',MA_TYPES)),
            fld('Período', num('stop.ma_period',stop.ma_period||10))
          )}
          {stop.type==='atr_based' && row2(
            fld('Período ATR', num('stop.atr_period',stop.atr_period||14)),
            fld('Multiplicador', num('stop.atr_mult',stop.atr_mult||1.0,0.1,10,0.1))
          )}
        </div>
      )
    },
    {
      num:6, key:'exit', color:'#00e5a0', label:'EXIT',
      desc:'¿Cómo salgo en profit?',
      summary: exit.type==='breakout_low_after_close_below_ma'
        ? `1ª vela cierre<${exit.ma_type||'EMA'}(${exit.ma_period||10}) → breakout LOW`
        : exit.type||'—',
      body: (
        <div>
          {fld('Tipo de salida', sel('exit.type', exit.type||'breakout_low_after_close_below_ma', [
            {v:'breakout_low_after_close_below_ma', l:'Breakout LOW tras 1ª vela de cierre bajo MA'},
            {v:'next_open_after_close_below_ma', l:'Apertura siguiente tras cierre bajo MA'},
            {v:'ema_cross_down', l:'Cruce bajista de EMAs (apertura siguiente)'},
            {v:'rsi_overbought', l:'RSI cruza nivel sobrecomprado'},
          ]))}
          {['breakout_low_after_close_below_ma','next_open_after_close_below_ma'].includes(exit.type||'breakout_low_after_close_below_ma') && row2(
            fld('Tipo MA', sel('exit.ma_type',exit.ma_type||'EMA',MA_TYPES)),
            fld('Período', num('exit.ma_period',exit.ma_period||10))
          )}
          {exit.type==='rsi_overbought' && row2(
            fld('Período RSI', num('exit.rsi_period',exit.rsi_period||14)),
            fld('Nivel (bajar de)', num('exit.rsi_level',exit.rsi_level||70,1,99))
          )}
        </div>
      )
    },
    {
      num:7, key:'management', color:'#4a9fd4', label:'MANAGEMENT',
      desc:'Sin pérdidas · Re-entry',
      summary: [mgmt.sin_perdidas&&'Sin Pérdidas', mgmt.reentry&&'Re-Entry'].filter(Boolean).join(' + ') || 'Ninguno',
      body: (
        <div style={{display:'flex',flexDirection:'column',gap:10}}>
          <div>
            {chk('management.sin_perdidas', mgmt.sin_perdidas, 'Sin Pérdidas')}
            <div style={{fontSize:10,color:'var(--text3)',marginLeft:18,lineHeight:1.5,marginTop:2}}>
              Mueve el stop al precio de entrada cuando el trade está en beneficio (low &gt; entrada).
            </div>
          </div>
          <div>
            {chk('management.reentry', mgmt.reentry, 'Re-Entry')}
            <div style={{fontSize:10,color:'var(--text3)',marginLeft:18,lineHeight:1.5,marginTop:2}}>
              Tras una salida, si las EMAs siguen alcistas, busca nueva entrada en el breakout del HIGH
              de la 1ª vela que cierre sobre la EMA rápida.
            </div>
          </div>
        </div>
      )
    },
  ]

  return (
    <div style={{display:'flex',flexDirection:'column',gap:2}}>
      {STEPS.map((step,idx)=>{
        const isOpen = openStep===idx
        const stepColor = step.color
        return (
          <div key={step.key} style={{border:`1px solid ${isOpen?stepColor:'rgba(26,45,69,0.8)'}`,borderRadius:6,overflow:'hidden',transition:'border-color .15s'}}>
            {/* Header del paso */}
            <button onClick={()=>setOpenStep(isOpen?null:idx)} style={{
              width:'100%',display:'flex',alignItems:'center',gap:8,padding:'7px 10px',
              background:isOpen?`${stepColor}12`:'transparent',border:'none',cursor:'pointer',textAlign:'left'
            }}>
              <span style={{
                minWidth:20,height:20,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',
                background:isOpen?stepColor:'rgba(26,45,69,0.9)',
                color:isOpen?'#080c14':stepColor,fontFamily:MONO,fontSize:9,fontWeight:700,flexShrink:0
              }}>{step.num}</span>
              <span style={{fontFamily:MONO,fontSize:10,fontWeight:700,color:stepColor,letterSpacing:'0.08em',flexShrink:0}}>{step.label}</span>
              <Tip id={step.key==='stop'?'stopLoss':step.key} style={{flexShrink:0}}/>
              <span style={{fontFamily:MONO,fontSize:9,color:'var(--text3)',flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{step.summary}</span>
              <span style={{color:'var(--text3)',fontSize:10,flexShrink:0}}>{isOpen?'▲':'▼'}</span>
            </button>

            {/* Cuerpo del paso */}
            {isOpen && (
              <div style={{padding:'10px 12px 12px',borderTop:`1px solid ${stepColor}30`}}>
                <div style={{fontFamily:MONO,fontSize:9,color:'var(--text3)',marginBottom:10,fontStyle:'italic'}}>
                  {step.desc}
                </div>
                {step.key==='abort'
                  ? (() => {
                      // Abort needs special handler - can't use upd for toggle array
                      return (
                        <div style={{display:'flex',flexDirection:'column',gap:8}}>
                          <label style={{display:'flex',alignItems:'center',gap:6,cursor:'pointer',fontSize:11,color:'var(--text2)'}}>
                            <input type="checkbox" checked={abortHas('ema_cross_down')} onChange={()=>toggleAbort('ema_cross_down')}
                              style={{accentColor:'#ff9a3c',width:12,height:12}}/>
                            Cruce bajista de EMAs
                          </label>
                          <label style={{display:'flex',alignItems:'center',gap:6,cursor:'pointer',fontSize:11,color:'var(--text2)'}}>
                            <input type="checkbox" checked={abortHas('close_below_ma')} onChange={()=>toggleAbort('close_below_ma')}
                              style={{accentColor:'#ff9a3c',width:12,height:12}}/>
                            Cierre bajo MA
                          </label>
                          {abortHas('close_below_ma') && (
                            <div style={{marginLeft:18,display:'grid',gridTemplateColumns:'1fr 1fr',gap:6}}>
                              {fld('Tipo MA',<select value={abortCBMA?.ma_type||'EMA'}
                                onChange={e=>{const d=JSON.parse(JSON.stringify(def));const c=d.abort.conditions.find(c=>c.type==='close_below_ma');if(c)c.ma_type=e.target.value;setDefinition(d)}}
                                style={{background:'var(--bg)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:11,padding:'4px 6px',borderRadius:3,width:'100%'}}>
                                <option value="EMA">EMA</option><option value="SMA">SMA</option>
                              </select>)}
                              {fld('Período',<input type="number" value={abortCBMA?.ma_period||10} min={1}
                                onChange={e=>{const d=JSON.parse(JSON.stringify(def));const c=d.abort.conditions.find(c=>c.type==='close_below_ma');if(c)c.ma_period=Number(e.target.value);setDefinition(d)}}
                                style={{background:'var(--bg)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:MONO,fontSize:11,padding:'4px 6px',borderRadius:3,width:'100%'}}/>)}
                            </div>
                          )}
                        </div>
                      )
                    })()
                  : step.body
                }
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
