import { useState, useRef, useEffect } from 'react'
import { MONO, pctOf } from '../lib/utils'
import { getSupaUrl, getSupaKey } from '../lib/supabase'
import { loadSettings, saveSettingsRemote } from '../lib/settings'
import { fetchConditions, saveCondition, deleteCondition, groqParseCondition, lsGetConds, lsSaveConds } from '../lib/conditions'
import Tip from './Tip'

export default function SettingsModal({ onClose, strategies=[], initialTab='integraciones', wlData={} }) {
  const [tab, setTab] = useState(initialTab)
  const [settings, setSettings] = useState(loadSettings)
  const [groqStatus, setGroqStatus] = useState(null) // null | 'testing' | 'ok' | 'err'
  const [dirty, setDirty] = useState(false)
  // ── Visor de distribución (pestaña Ranking) — bajo demanda, no altera ningún cálculo ──
  const [distrib, setDistrib] = useState(null)   // null = colapsado
  // Percentiles reales de las cuatro métricas del score en las DOS poblaciones que ordenan el
  // watchlist: la estrategia ACTIVA de cada activo y su TOP estrategia (~160 filas cada una).
  // Filtrado: se descartan los null y, en cagr, el centinela -99 ("no calculable"),
  // que si no hundiría la mediana y el P10. Cálculo síncrono sobre ~320 valores.
  const calcularDistribucion = () => {
    const METRICAS = [
      ['Win rate',      'winRate',  false],
      ['CAGR',          'cagr',     true],   // true = filtrar el centinela -99
      ['Robustez',      'robustez', false],  // 0-100 por construcción: sin centinelas
      ['Max drawdown',  'maxDD',    false],
    ]
    const pobla = (cual) => METRICAS.map(([label,campo,esCagr])=>{
      const vals = Object.values(wlData||{})
        .map(d => d?.[cual]?.[campo])
        .filter(v => v!=null && !isNaN(v) && (!esCagr || v > -99))   // -99 = centinela
      return { label, n: vals.length,
        p10: vals.length?pctOf(vals,0.1):null,
        p50: vals.length?pctOf(vals,0.5):null,
        p90: vals.length?pctOf(vals,0.9):null }
    })
    const active = pobla('active'), top = pobla('top')
    const nAct = Math.max(...active.map(m=>m.n), 0)
    const nTop = Math.max(...top.map(m=>m.n), 0)
    setDistrib({ active, top, nAct, nTop })
  }
  // Conditions tab state
  const [localConds, setLocalConds]   = useState([])
  const [condTab, setCondTab]         = useState('list')   // 'list' | 'create'
  const [groqInput, setGroqInput]     = useState('')
  const [groqParsing, setGroqParsing] = useState(false)
  const [groqPreview, setGroqPreview] = useState(null)     // parsed condition preview
  const [groqErr, setGroqErr]         = useState(null)
  const [condSaving, setCondSaving]   = useState(false)
  const [condDeleting, setCondDeleting] = useState(null)   // id being deleted
  const [condSaveErr, setCondSaveErr]   = useState(null)   // error for manual save
  // Manual form
  const [manualForm, setManualForm] = useState({ name:'', description:'', type:'ema_cross_up', params:{ma_fast:10,ma_slow:11} })

  // Load conditions when tab is opened
  const openConditions = () => {
    fetchConditions().then(d=>{
      setLocalConds(d||[])
      // Auto-switch to create tab if library is empty
      if(!d||d.length===0) setCondTab('create')
    }).catch(()=>{ setCondTab('create') })
  }

  const handleGroqParse = async () => {
    if (!groqInput.trim()) return
    setGroqParsing(true); setGroqErr(null); setGroqPreview(null)
    try {
      const result = await groqParseCondition(groqInput)
      if (result.error) { setGroqErr(result.error); return }
      setGroqPreview(result)
    } catch(e) { setGroqErr(e.message) }
    finally { setGroqParsing(false) }
  }

  const handleSaveCond = async (cond) => {
    setCondSaving(true); setCondSaveErr(null); setGroqErr(null)
    const isGroq = !!groqPreview
    try {
      if (!cond.name?.trim()) throw new Error('El nombre es obligatorio')
      await saveCondition({...cond, source: isGroq ? 'groq' : 'manual'})
      // Refresh from merged source (localStorage + Supabase)
      const updated = await fetchConditions()
      setLocalConds(updated||lsGetConds())
      if (isGroq) { setGroqPreview(null); setGroqInput('') }
      else { setManualForm({name:'',description:'',type:'ema_cross_up',params:{ma_fast:10,ma_slow:11}}) }
      setCondTab('list')
    } catch(e) {
      if (isGroq) setGroqErr(e.message||'Error con Groq IA')
      else setCondSaveErr(e.message||'Error guardando condición')
    }
    finally { setCondSaving(false) }
  }

  const handleDeleteCond = async (id) => {
    if (!confirm('¿Eliminar esta condición?')) return
    setCondDeleting(id)
    try {
      await deleteCondition(id)
      setLocalConds(p=>p.filter(c=>c.id!==id))
    } catch(e) { alert(e.message) }
    finally { setCondDeleting(null) }
  }

  const upd = (path, val) => {
    setSettings(s => {
      const n = {...s}
      const parts = path.split('.')
      let cur = n
      for (let i=0; i<parts.length-1; i++) { cur[parts[i]] = cur[parts[i]]||{}; cur = cur[parts[i]] }
      cur[parts[parts.length-1]] = val
      return n
    })
    setDirty(true)
  }

  const handleSave = () => { saveSettingsRemote(settings); setDirty(false); onClose() }

  const testGroq = async () => {
    setGroqStatus('testing')
    try {
      const r = await fetch('/api/groq-help', {
        method:'POST',
        headers:{'Content-Type':'application/json','x-groq-key': settings.integrations?.groqKey||''},
        body: JSON.stringify({topic:'EMA Rápida'})
      })
      setGroqStatus(r.ok ? 'ok' : 'err')
    } catch(_) { setGroqStatus('err') }
  }

  const TABS = [
    { id:'integraciones', label:'🔌 Integraciones' },
    { id:'alarmas',       label:'🔔 Señales' },
    { id:'grafico',       label:'📈 Gráfico' },
    { id:'ranking',       label:'🏆 Ranking' },
    { id:'watchlist',     label:'📋 Watchlist' },
    { id:'tradelog_cfg',  label:'📒 TradeLog' },
  ]

  const inp = (val, onChange, opts={}) => (
    <input
      type={opts.type||'text'} value={val||''} onChange={e=>onChange(e.target.value)}
      placeholder={opts.placeholder||''}
      style={{
        background:'#080c14', border:'1px solid #1a2d45', borderRadius:4,
        color:'#e2eaf5', fontFamily:MONO, fontSize:13, padding:'8px 12px',
        width:'100%', boxSizing:'border-box',
        ...(opts.mono ? {letterSpacing:'0.04em'} : {})
      }}
    />
  )

  const row = (label, tip, children) => (
    <div style={{marginBottom:14}}>
      <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:5}}>
        <span style={{fontFamily:MONO,fontSize:11,color:'#7a9bc0',letterSpacing:'0.06em',textTransform:'uppercase'}}>{label}</span>
        {tip&&<span style={{fontFamily:MONO,fontSize:10,color:'#3d5a7a'}}>{tip}</span>}
      </div>
      {children}
    </div>
  )

  const sep = (title) => (
    <div style={{fontFamily:MONO,fontSize:10,color:'#4a6a85',letterSpacing:'0.10em',textTransform:'uppercase',
      borderBottom:'1px solid #1a2d45',paddingBottom:6,marginBottom:14,marginTop:6}}>{title}</div>
  )

  return (
    <div style={{position:'fixed',inset:0,zIndex:900,display:'flex',alignItems:'center',justifyContent:'center',
      background:'rgba(0,0,0,0.65)'}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{
        background:'#0a101a', border:'1px solid #1a2d45', borderRadius:10,
        width:'min(1280px,95vw)', maxHeight:'95vh', display:'flex', flexDirection:'column',
        boxShadow:'0 16px 60px rgba(0,0,0,0.7)', fontFamily:MONO
      }}>

        {/* Header */}
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',
          padding:'14px 20px 0', borderBottom:'1px solid #0d1520', paddingBottom:0}}>
          <div style={{fontSize:16,fontWeight:700,color:'#e2eaf5',letterSpacing:'0.04em'}}>⚙ Configuración</div>
          <button onClick={onClose} style={{background:'none',border:'none',color:'#5a7a95',fontSize:16,cursor:'pointer',padding:'0 4px',lineHeight:1}}>✕</button>
        </div>

        {/* Tabs */}
        <div style={{display:'flex',borderBottom:'1px solid #0d1520',padding:'0 20px',marginTop:0,flexShrink:0}}>
          {TABS.map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)} style={{
              background:'none', border:'none', borderBottom: tab===t.id ? '2px solid #00d4ff' : '2px solid transparent',
              color: tab===t.id ? '#00d4ff' : '#5a7a95', fontFamily:MONO, fontSize:11, padding:'12px 18px 10px',
              cursor:'pointer', letterSpacing:'0.06em', textTransform:'uppercase', transition:'color .15s'
            }}>{t.label}</button>
          ))}
        </div>

        {/* Body */}
        <div style={{overflowY:'auto',flex:1,minHeight:0,padding:'12px 16px'}}>

          {/* ── INTEGRACIONES ── */}
          {tab==='integraciones'&&(
            <div>
              {sep('Supabase — Base de datos en la nube')}
              {row('URL del proyecto','(ej: https://xxxx.supabase.co)',
                <input
                  type="text" value={settings.integrations?.supabaseUrl||''} placeholder="https://xxxx.supabase.co"
                  onChange={e=>upd('integrations.supabaseUrl',e.target.value)}
                  style={{width:'100%',background:'#080c14',border:'1px solid #1a2d45',borderRadius:4,
                    color:'#e2eaf5',fontFamily:MONO,fontSize:12,padding:'6px 10px',letterSpacing:'0.04em'}}
                />
              )}
              {row('Anon Key','(se guarda solo en tu navegador)',
                <input
                  type="password" value={settings.integrations?.supabaseKey||''} placeholder="sb_publishable_..."
                  onChange={e=>upd('integrations.supabaseKey',e.target.value)}
                  style={{width:'100%',background:'#080c14',border:'1px solid #1a2d45',borderRadius:4,
                    color:'#e2eaf5',fontFamily:MONO,fontSize:12,padding:'6px 10px',letterSpacing:'0.06em'}}
                />
              )}
              <div style={{fontSize:10,color:'#3d5a7a',lineHeight:1.6,marginTop:-6,marginBottom:16}}>
                Las credenciales se almacenan únicamente en localStorage de tu navegador. Sin configurar, el tradelog funciona en modo local.
              </div>

              {sep('Groq AI — Tooltips de ayuda')}
              {row('Groq API Key','(se guarda solo en tu navegador)',
                <div style={{display:'flex',gap:8}}>
                  <input
                    type="password" value={settings.integrations?.groqKey||''} placeholder="gsk_..."
                    onChange={e=>upd('integrations.groqKey',e.target.value)}
                    style={{flex:1,background:'#080c14',border:'1px solid #1a2d45',borderRadius:4,
                      color:'#e2eaf5',fontFamily:MONO,fontSize:12,padding:'6px 10px',letterSpacing:'0.06em'}}
                  />
                  <button onClick={testGroq} disabled={groqStatus==='testing'} style={{
                    padding:'6px 12px', borderRadius:4, border:'1px solid #1a2d45',
                    background: groqStatus==='ok'?'rgba(0,229,160,0.12)':groqStatus==='err'?'rgba(255,77,109,0.12)':'rgba(13,21,32,0.9)',
                    color: groqStatus==='ok'?'#00e5a0':groqStatus==='err'?'#ff4d6d':'#7a9bc0',
                    fontFamily:MONO, fontSize:11, cursor:'pointer', whiteSpace:'nowrap', flexShrink:0
                  }}>
                    {groqStatus==='testing'?'⟳ ...' : groqStatus==='ok'?'✓ OK' : groqStatus==='err'?'✗ Error' : 'Probar'}
                  </button>
                </div>
              )}
              <div style={{fontSize:10,color:'#3d5a7a',lineHeight:1.6,marginTop:-6}}>
                La clave se almacena únicamente en localStorage de tu navegador. Obtén una clave gratuita en <a href="https://console.groq.com" target="_blank" rel="noreferrer" style={{color:'#4a9fd4'}}>console.groq.com</a>
              </div>
            </div>
          )}

          {/* ── ALARMAS ── */}
          {tab==='alarmas'&&(
            <div>
              <div style={{fontFamily:MONO,fontSize:9,color:'#4a7a9b',background:'rgba(0,180,255,0.06)',
                border:'1px solid rgba(0,180,255,0.15)',borderRadius:4,padding:'7px 10px',marginBottom:12,lineHeight:1.6}}>
                ℹ️ Estas opciones aplican únicamente a las <b style={{color:'#7ec8e3'}}>alertas de estrategias</b>.<br/>
                El parpadeo y el método de envío de las <b style={{color:'#7ec8e3'}}>notificaciones del Watchlist</b> se configuran individualmente en cada notificación (panel Watchlist → ✎).
              </div>
              {sep('Actualización automática')}
              <div style={{marginBottom:16}}>
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
                  <span style={{fontFamily:MONO,fontSize:11,color:'#cce0f5',flex:1}}>Umbral auto-actualización de alertas</span>
                  <input type="number" min={10} max={200}
                    value={settings.alarmas?.autoRefreshThreshold??50}
                    onChange={e=>{
                      const v=Math.max(10,Math.min(200,Number(e.target.value)||50))
                      upd('alarmas.autoRefreshThreshold',v)
                    }}
                    style={{width:58,background:'var(--bg2,#0d1520)',border:'1px solid #1a2d45',color:'#cce0f5',
                      fontFamily:MONO,fontSize:11,padding:'3px 6px',borderRadius:3,textAlign:'right'}}/>
                  <span style={{fontFamily:MONO,fontSize:11,color:'#5a7a95'}}>activos</span>
                </div>
                <div style={{fontFamily:MONO,fontSize:9,color:'#4a6a80',lineHeight:1.6}}>
                  Si la lista activa del Watchlist tiene más de N activos, las alertas no se actualizarán
                  automáticamente — aparecerá un botón ↻ para hacerlo manualmente.
                  Con listas pequeñas (≤ N) la actualización es automática al cargar o cambiar el Watchlist.
                </div>
              </div>
              <div style={{marginBottom:16}}>
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
                  <span style={{fontFamily:MONO,fontSize:11,color:'#cce0f5',flex:1}}>Caché de datos de alertas (minutos)</span>
                  <input type="number" min={5} max={120}
                    value={settings.alarmas?.cacheTTLMinutes??20}
                    onChange={e=>{
                      const v=Math.max(5,Math.min(120,Number(e.target.value)||20))
                      upd('alarmas.cacheTTLMinutes',v)
                    }}
                    style={{width:58,background:'var(--bg2,#0d1520)',border:'1px solid #1a2d45',color:'#cce0f5',
                      fontFamily:MONO,fontSize:11,padding:'3px 6px',borderRadius:3,textAlign:'right'}}/>
                  <span style={{fontFamily:MONO,fontSize:11,color:'#5a7a95'}}>min</span>
                </div>
                <div style={{fontFamily:MONO,fontSize:9,color:'#4a6a80',lineHeight:1.6}}>
                  Tiempo en minutos que se conservan los datos descargados de cada activo antes de volver a consultarlos.
                  Con un valor mayor, las comprobaciones son más rápidas pero los datos pueden estar desactualizados.
                </div>
              </div>
              {sep('Opciones de estrategia')}
              <label style={{display:'flex',alignItems:'center',gap:8,marginBottom:8,cursor:'pointer'}}>
                <input type="checkbox"
                  checked={settings.alarmas?.popupOnTrigger!==false}
                  onChange={e=>upd('alarmas.popupOnTrigger',e.target.checked)}
                  style={{accentColor:'#ff4d6d',width:13,height:13}}/>
                <span style={{fontSize:11,color:'#cce0f5'}}>Mostrar popup cuando se activa una alarma</span>
              </label>
              {[
                ['alarms.onEntry',    'Notificar en señal de entrada'],
                ['alarms.onExit',     'Notificar en señal de salida'],
                ['alarms.onStop',     'Notificar al activar stop loss'],
                ['alarms.onPriceLvl', 'Notificar alarmas de precio en gráfico'],
              ].map(([key,label])=>(
                <label key={key} style={{display:'flex',alignItems:'center',gap:8,marginBottom:8,cursor:'pointer'}}>
                  <input type="checkbox" checked={!!settings[key.split('.')[0]]?.[key.split('.')[1]]}
                    onChange={e=>upd(key,e.target.checked)}
                    style={{accentColor:'#00d4ff',width:13,height:13}}/>
                  <span style={{fontSize:11,color:'#cce0f5'}}>{label}</span>
                </label>
              ))}
            </div>
          )}

          {/* ── CONDICIONES — moved to sidebar + center editor (V4.85) ── */}

          {/* ── GRÁFICO ── */}
          {tab==='condiciones_NEVER'&&(()=>{
            if(localConds.length===0 && condTab==='list') openConditions()
            const CTYPE_LABELS={
              ema_cross_up:'EMA rápida > EMA lenta ↑',ema_cross_down:'EMA rápida < EMA lenta ↓',
              price_above_ma:'Precio > Media',price_below_ma:'Precio < Media',
              price_above_ema:'Precio > EMA',price_below_ema:'Precio < EMA',
              rsi_above:'RSI sobre nivel',rsi_below:'RSI bajo nivel',
              rsi_cross_up:'RSI cruza ↑',rsi_cross_down:'RSI cruza ↓',
              macd_cross_up:'MACD cruza señal ↑',macd_cross_down:'MACD cruza señal ↓',
            }
            const paramSummary=(c)=>{
              const p=c.params||{}
              if(c.type.startsWith('ema_cross')||c.type.startsWith('price_above_ema')||c.type.startsWith('price_below_ema'))
                return `EMA ${p.ma_fast||'?'}/${p.ma_slow||'?'}`
              if(c.type.startsWith('price_above_ma')||c.type.startsWith('price_below_ma'))
                return `MA(${p.ma_period||'?'})`
              if(c.type.startsWith('rsi_'))
                return `RSI(${p.period||14}) nivel ${p.level||50}`
              if(c.type.startsWith('macd_'))
                return `MACD(${p.fast||12},${p.slow||26},${p.signal||9})`
              return ''
            }
            const manualParams=()=>{
              const t=manualForm.type
              if(t.startsWith('ema_cross')||t.startsWith('price_above_ema')||t.startsWith('price_below_ema')) return(
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                  {[['ma_fast','EMA Rápida',10],['ma_slow','EMA Lenta',11]].map(([k,l,d])=>(
                    <label key={k} style={{display:'flex',flexDirection:'column',gap:3,color:'#a8ccdf',fontSize:10}}>{l}
                      <input type="number" value={manualForm.params?.[k]||d} min={1}
                        onChange={e=>setManualForm(p=>({...p,params:{...p.params,[k]:Number(e.target.value)||d}}))}
                        style={{background:'#080c14',border:'1px solid #1a2d45',borderRadius:3,color:'#ffd166',fontFamily:MONO,fontSize:13,padding:'5px 8px',fontWeight:700,textAlign:'center'}}/>
                    </label>
                  ))}
                </div>
              )
              if(t.startsWith('price_above_ma')||t.startsWith('price_below_ma')) return(
                <label style={{display:'flex',flexDirection:'column',gap:3,color:'#a8ccdf',fontSize:10}}>Período MA
                  <input type="number" value={manualForm.params?.ma_period||50} min={1}
                    onChange={e=>setManualForm(p=>({...p,params:{...p.params,ma_period:Number(e.target.value)}}))}
                    style={{background:'#080c14',border:'1px solid #1a2d45',borderRadius:3,color:'#ffd166',fontFamily:MONO,fontSize:13,padding:'5px 8px',fontWeight:700}}/>
                </label>
              )
              if(t.startsWith('rsi_')) return(
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                  {[['period','Período',14],['level','Nivel',30]].map(([k,l,d])=>(
                    <label key={k} style={{display:'flex',flexDirection:'column',gap:3,color:'#a8ccdf',fontSize:10}}>{l}
                      <input type="number" value={manualForm.params?.[k]||d} min={1}
                        onChange={e=>setManualForm(p=>({...p,params:{...p.params,[k]:Number(e.target.value)||d}}))}
                        style={{background:'#080c14',border:'1px solid #1a2d45',borderRadius:3,color:'#ffd166',fontFamily:MONO,fontSize:13,padding:'5px 8px',fontWeight:700,textAlign:'center'}}/>
                    </label>
                  ))}
                </div>
              )
              if(t.startsWith('macd_')) return(
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8}}>
                  {[['fast','Rápida',12],['slow','Lenta',26],['signal','Señal',9]].map(([k,l,d])=>(
                    <label key={k} style={{display:'flex',flexDirection:'column',gap:3,color:'#a8ccdf',fontSize:10}}>{l}
                      <input type="number" value={manualForm.params?.[k]||d} min={1}
                        onChange={e=>setManualForm(p=>({...p,params:{...p.params,[k]:Number(e.target.value)}}))}
                        style={{background:'#080c14',border:'1px solid #1a2d45',borderRadius:3,color:'#ffd166',fontFamily:MONO,fontSize:13,padding:'5px 6px',fontWeight:700,textAlign:'center'}}/>
                    </label>
                  ))}
                </div>
              )
              return null
            }
            return(
              <div>
                {sep('Librería de condiciones')}
                <div style={{fontSize:12,color:'#7a9bc0',lineHeight:1.7,marginBottom:16}}>
                  Las condiciones son filtros reutilizables que puedes vincular a alarmas y watchlist.
                  Créalas con Groq IA (lenguaje natural) o manualmente.
                </div>
                {/* Sub-tabs */}
                <div style={{display:'flex',gap:0,marginBottom:18,borderBottom:'1px solid var(--border)'}}>
                  {[['list',`📋 Librería${localConds.length>0?' ('+localConds.length+')':''}`],['create','✨ Nueva condición']].map(([id,l])=>(
                    <button key={id} onClick={()=>setCondTab(id)} style={{padding:'10px 20px 9px',background:'none',border:'none',
                      borderBottom:condTab===id?'2px solid #00d4ff':'2px solid transparent',
                      color:condTab===id?'#00d4ff':'#7a9bc0',fontFamily:MONO,fontSize:12,cursor:'pointer',letterSpacing:'0.05em',fontWeight:condTab===id?700:400}}>
                      {l}
                    </button>
                  ))}
                </div>

                {/* Lista */}
                {condTab==='list'&&(
                  <div style={{display:'flex',flexDirection:'column',gap:6}}>
                    {localConds.length===0&&<div style={{fontFamily:MONO,fontSize:11,color:'#4a6a80',padding:'8px 0'}}>No hay condiciones. Crea una en "Nueva condición".</div>}
                    {localConds.map(c=>(
                      <div key={c.id} style={{background:'#0a1018',border:'1px solid #1a2d45',borderRadius:5,padding:'10px 12px',display:'flex',alignItems:'flex-start',gap:10}}>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:3}}>
                            <span style={{fontFamily:MONO,fontSize:13,fontWeight:700,color:'#e8f4ff'}}>{c.name}</span>
                            {c.source==='groq'&&<span style={{fontFamily:MONO,fontSize:8,color:'#9b72ff',background:'rgba(155,114,255,0.1)',padding:'1px 5px',borderRadius:8,border:'1px solid rgba(155,114,255,0.3)'}}>IA</span>}
                          </div>
                          <div style={{fontFamily:MONO,fontSize:10,color:'#7a9bc0',marginBottom:2}}>{CTYPE_LABELS[c.type]||c.type} · {paramSummary(c)}</div>
                          {c.description&&<div style={{fontFamily:MONO,fontSize:10,color:'#4a6a80',lineHeight:1.4}}>{c.description}</div>}
                        </div>
                        <button onClick={()=>handleDeleteCond(c.id)} disabled={condDeleting===c.id}
                          style={{background:'transparent',border:'none',color:'#ff4d6d',fontSize:13,cursor:'pointer',padding:'0 2px',flexShrink:0,opacity:condDeleting===c.id?0.4:1}}>
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Crear — Groq IA + Manual */}
                {condTab==='create'&&(
                  <div style={{display:'flex',flexDirection:'column',gap:14}}>
                    {/* Groq AI */}
                    <div style={{background:'rgba(155,114,255,0.07)',border:'1px solid rgba(155,114,255,0.25)',borderRadius:8,padding:18}}>
                      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
                        <span style={{fontFamily:MONO,fontSize:13,color:'#b89fff',fontWeight:700}}>✨ Crear con Groq IA</span>
                        {!settings.integrations?.groqKey&&(
                          <span style={{fontFamily:MONO,fontSize:10,color:'#ff8a50',background:'rgba(255,138,80,0.1)',border:'1px solid rgba(255,138,80,0.3)',borderRadius:3,padding:'3px 8px'}}>
                            ⚠ Configura la Groq API Key en Integraciones
                          </span>
                        )}
                      </div>
                      <textarea
                        value={groqInput} onChange={e=>setGroqInput(e.target.value)}
                        placeholder="Describe la condición en lenguaje natural. Ej: RSI de 14 períodos cruza hacia arriba el nivel 30"
                        rows={4}
                        style={{width:'100%',background:'#060c14',border:'1px solid rgba(155,114,255,0.3)',borderRadius:5,color:'#e2eaf5',fontFamily:MONO,fontSize:13,padding:'12px 14px',resize:'vertical',boxSizing:'border-box',lineHeight:1.5}}
                      />
                      <div style={{fontFamily:MONO,fontSize:10,color:'#5a6a80',lineHeight:1.5,marginTop:6}}>
                        Tipos soportados: cruce de EMAs · precio vs media · RSI (nivel y cruce) · MACD
                      </div>
                      {groqErr&&<div style={{fontFamily:MONO,fontSize:11,color:'#ff4d6d',marginTop:8,padding:'8px 10px',background:'rgba(255,77,109,0.08)',borderRadius:4}}>⚠ {groqErr}</div>}
                      <button onClick={handleGroqParse} disabled={groqParsing||!groqInput.trim()||!settings.integrations?.groqKey}
                        style={{marginTop:10,width:'100%',background:settings.integrations?.groqKey?'rgba(155,114,255,0.2)':'rgba(40,40,40,0.3)',
                          border:`1px solid ${settings.integrations?.groqKey?'rgba(155,114,255,0.5)':'#2a3a4a'}`,
                          color:settings.integrations?.groqKey?'#b89fff':'#4a6a80',fontFamily:MONO,fontSize:13,padding:'11px',borderRadius:5,
                          cursor:settings.integrations?.groqKey&&groqInput.trim()?'pointer':'not-allowed',fontWeight:700,
                          opacity:(groqParsing||!groqInput.trim()||!settings.integrations?.groqKey)?0.55:1}}>
                        {groqParsing?'⟳ Analizando…':'✨ Analizar con IA'}
                      </button>
                      {/* Preview */}
                      {groqPreview&&(
                        <div style={{marginTop:12,background:'rgba(0,229,160,0.07)',border:'1px solid rgba(0,229,160,0.3)',borderRadius:6,padding:16}}>
                          <div style={{fontFamily:MONO,fontSize:10,color:'#00e5a0',letterSpacing:'0.08em',marginBottom:10,fontWeight:700}}>✓ RESULTADO — REVISA Y GUARDA</div>
                          <div style={{fontFamily:MONO,fontSize:14,fontWeight:700,color:'#e8f4ff',marginBottom:5}}>{groqPreview.name}</div>
                          <div style={{fontFamily:MONO,fontSize:11,color:'#7a9bc0',marginBottom:4}}>{CTYPE_LABELS[groqPreview.type]||groqPreview.type} · <span style={{color:'#ffd166'}}>{JSON.stringify(groqPreview.params)}</span></div>
                          {groqPreview.description&&<div style={{fontFamily:MONO,fontSize:11,color:'#6a8a9a',marginBottom:12,lineHeight:1.5}}>{groqPreview.description}</div>}
                          <div style={{display:'flex',gap:8}}>
                            <button onClick={()=>handleSaveCond(groqPreview)} disabled={condSaving}
                              style={{flex:1,background:'rgba(0,229,160,0.18)',border:'1px solid #00e5a0',color:'#00e5a0',fontFamily:MONO,fontSize:13,padding:'10px',borderRadius:5,cursor:'pointer',fontWeight:700}}>
                              {condSaving?'Guardando…':'✓ Guardar condición'}
                            </button>
                            <button onClick={()=>setGroqPreview(null)}
                              style={{background:'transparent',border:'1px solid #2a3f55',color:'#5a7a95',fontFamily:MONO,fontSize:12,padding:'10px 14px',borderRadius:5,cursor:'pointer'}}>
                              Descartar
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Separador */}
                    <div style={{display:'flex',alignItems:'center',gap:10,marginTop:4}}>
                      <div style={{flex:1,height:1,background:'#1a2d45'}}/>
                      <span style={{fontFamily:MONO,fontSize:10,color:'#4a6a80',letterSpacing:'0.08em'}}>O MANUALMENTE</span>
                      <div style={{flex:1,height:1,background:'#1a2d45'}}/>
                    </div>

                    {/* Manual */}
                    <div style={{display:'flex',flexDirection:'column',gap:10}}>
                      <label style={{display:'flex',flexDirection:'column',gap:3,color:'#a8ccdf',fontSize:10}}>Nombre
                        <input type="text" value={manualForm.name} placeholder="Ej: Cruce alcista EMA 50/200"
                          onChange={e=>setManualForm(p=>({...p,name:e.target.value}))}
                          style={{background:'#080c14',border:'1px solid #1a2d45',borderRadius:4,color:'#e2eaf5',fontFamily:MONO,fontSize:13,padding:'9px 11px'}}/>
                      </label>
                      <label style={{display:'flex',flexDirection:'column',gap:3,color:'#a8ccdf',fontSize:10}}>
                        <span style={{display:'flex',alignItems:'center',gap:5}}>Tipo de condición <span style={{fontFamily:MONO,fontSize:9,color:'#3d5a7a'}}>— define qué señal evalúa la condición</span></span>
                        <select value={manualForm.type} onChange={e=>{
                          const t=e.target.value
                          // Pre-fill default params so save works without touching inputs
                          const defParams = t.startsWith('ema_cross')||t==='price_above_ema'||t==='price_below_ema'
                            ? {ma_fast:10,ma_slow:11}
                            : t==='price_above_ma'||t==='price_below_ma'
                            ? {ma_period:50}
                            : t.startsWith('rsi_')
                            ? {period:14,level:30}
                            : t.startsWith('macd_')
                            ? {fast:12,slow:26,signal:9}
                            : {}
                          setManualForm(p=>({...p,type:t,params:defParams}))
                        }}
                          style={{background:'#080c14',border:'1px solid #1a2d45',borderRadius:4,color:'#e2eaf5',fontFamily:MONO,fontSize:13,padding:'9px 11px'}}>
                          <optgroup label="EMA">
                            <option value="ema_cross_up">Cruce alcista de medias ↑</option>
                            <option value="ema_cross_down">Cruce bajista de medias ↓</option>
                            <option value="price_above_ema">Precio sobre EMA</option>
                            <option value="price_below_ema">Precio bajo EMA</option>
                          </optgroup>
                          <optgroup label="RSI">
                            <option value="rsi_cross_up">RSI cruza nivel hacia arriba</option>
                            <option value="rsi_cross_down">RSI cruza nivel hacia abajo</option>
                            <option value="rsi_above">RSI sobre nivel</option>
                            <option value="rsi_below">RSI bajo nivel</option>
                          </optgroup>
                          <optgroup label="MACD">
                            <option value="macd_cross_up">MACD cruza señal ↑</option>
                            <option value="macd_cross_down">MACD cruza señal ↓</option>
                          </optgroup>
                          <optgroup label="Media Móvil">
                            <option value="price_above_ma">Precio sobre media</option>
                            <option value="price_below_ma">Precio bajo media</option>
                          </optgroup>
                        </select>
                      </label>
                      {manualParams()}
                      <label style={{display:'flex',flexDirection:'column',gap:3,color:'#a8ccdf',fontSize:10}}>Descripción (opcional)
                        <input type="text" value={manualForm.description} placeholder="Explicación breve"
                          onChange={e=>setManualForm(p=>({...p,description:e.target.value}))}
                          style={{background:'#080c14',border:'1px solid #1a2d45',borderRadius:4,color:'#e2eaf5',fontFamily:MONO,fontSize:13,padding:'9px 11px'}}/>
                      </label>
                      <button onClick={()=>{if(!manualForm.name.trim())return;handleSaveCond(manualForm)}} disabled={condSaving||!manualForm.name.trim()}
                        style={{background:'rgba(0,212,255,0.15)',border:'1px solid var(--accent)',color:'var(--accent)',fontFamily:MONO,fontSize:13,padding:'11px',borderRadius:5,cursor:manualForm.name.trim()?'pointer':'not-allowed',fontWeight:700,opacity:(condSaving||!manualForm.name.trim())?0.5:1}}>
                        {condSaving?'Guardando…':'Guardar condición'}
                      </button>
                      {condSaveErr&&<div style={{fontFamily:MONO,fontSize:11,color:'#ff4d6d',marginTop:8,padding:'8px 10px',background:'rgba(255,77,109,0.08)',borderRadius:4}}>⚠ {condSaveErr}</div>}
                    </div>
                  </div>
                )}
              </div>
            )
          })()}

          {/* ── GRÁFICO ── */}
          {tab==='grafico'&&(
            <div>
              {sep('Colores de velas')}
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:16}}>
                {[
                  ['chart.upColor',   'Vela alcista',  '#00e5a0'],
                  ['chart.downColor', 'Vela bajista',  '#ff4d6d'],
                  ['chart.emaRColor', 'EMA Rápida',    '#ffd166'],
                  ['chart.emaLColor', 'EMA Lenta',     '#ff4d6d'],
                ].map(([key,label,def])=>(
                  <div key={key} style={{display:'flex',alignItems:'center',gap:8}}>
                    <input type="color" value={settings[key.split('.')[0]]?.[key.split('.')[1]]||def}
                      onChange={e=>upd(key,e.target.value)}
                      style={{width:28,height:28,borderRadius:4,border:'1px solid #1a2d45',
                        cursor:'pointer',background:'none',padding:1}}/>
                    <span style={{fontSize:11,color:'#cce0f5'}}>{label}</span>
                  </div>
                ))}
              </div>

              {sep('Capital por defecto')}
              <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:16}}>
                <span style={{fontFamily:MONO,fontSize:10,color:'#cce0f5',flex:1}}>Capital inicial por defecto para nuevas estrategias</span>
                <span style={{fontFamily:MONO,fontSize:12,fontWeight:700,color:'#00d4ff',minWidth:54,textAlign:'right'}}>€{(settings.defaultCapital??1000).toLocaleString('es-ES')}</span>
                <input type="number" min={100} step={100} value={settings.defaultCapital??1000}
                  onChange={e=>upd('defaultCapital',Number(e.target.value))}
                  style={{width:90,background:'#080c14',border:'1px solid #1a2d45',color:'#e2eaf5',
                    fontFamily:MONO,fontSize:11,padding:'4px 6px',borderRadius:4}}/>
              </div>
              {sep('Estrategia por defecto')}
              <div style={{marginBottom:16}}>                <div style={{fontSize:10,color:'#5a7a95',marginBottom:8,lineHeight:1.6}}>
                  La estrategia seleccionada se cargará automáticamente al abrir la app.
                </div>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <select value={settings.defaultStrategyId||''} onChange={e=>upd('defaultStrategyId',e.target.value||null)}
                    style={{flex:1,background:'#080c14',border:'1px solid #1a2d45',borderRadius:4,
                      color:'#e2eaf5',fontFamily:MONO,fontSize:11,padding:'6px 8px'}}>
                    <option value="">Sin estrategia por defecto</option>
                    {strategies.map(s=>(
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                  {settings.defaultStrategyId&&<span style={{fontFamily:MONO,fontSize:9,color:'#00e5a0'}}>✓</span>}
                </div>
              </div>

              {sep('Vista por defecto — Tabla resumen')}
              <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12}}>
                <span style={{fontFamily:MONO,fontSize:10,color:'#cce0f5',flex:1}}>Layout inicial tabla resumen</span>
                <select value={settings.ui?.defaultMetricsLayout??'multi'} onChange={e=>upd('ui.defaultMetricsLayout',e.target.value)}
                  style={{background:'#080c14',border:'1px solid #1a2d45',borderRadius:4,
                    color:'#e2eaf5',fontFamily:MONO,fontSize:11,padding:'4px 8px'}}>
                  <option value="grid">Grid</option>
                  <option value="panel">Panel simple</option>
                  <option value="multi">Panel vista multi-columna</option>
                </select>
              </div>
              <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:16}}>
                <span style={{fontFamily:MONO,fontSize:10,color:'#cce0f5',flex:1}}>Etiquetas trades por defecto</span>
                <select value={String(settings.ui?.defaultLabelMode??0)} onChange={e=>upd('ui.defaultLabelMode',Number(e.target.value))}
                  style={{background:'#080c14',border:'1px solid #1a2d45',borderRadius:4,
                    color:'#e2eaf5',fontFamily:MONO,fontSize:11,padding:'4px 8px'}}>
                  <option value="0">Sin etiquetas</option>
                  <option value="1">Solo porcentaje</option>
                  <option value="2">% + € + días</option>
                </select>
              </div>

              {sep('Vista reciente (botón ⊡ / ⊞)')}
              <div style={{marginBottom:16}}>
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
                  <span style={{fontFamily:MONO,fontSize:10,color:'#cce0f5',flex:1}}>Meses de historia (vista reciente)</span>
                  <span style={{fontFamily:MONO,fontSize:12,fontWeight:700,color:'#00d4ff',minWidth:28,textAlign:'right'}}>{settings.chart?.recentMonths??3}m</span>
                  <input type="range" min={1} max={24} value={settings.chart?.recentMonths??3}
                    onChange={e=>upd('chart.recentMonths',Number(e.target.value))}
                    style={{width:100,accentColor:'#00d4ff'}}/>
                </div>
                <div style={{fontFamily:MONO,fontSize:9,color:'#3d5a7a',lineHeight:1.5}}>
                  El botón ⊡ muestra los últimos N meses. ⊞ muestra todo el periodo del backtest.
                </div>
              </div>
              {sep('Visualización')}
              <label style={{display:'flex',alignItems:'center',gap:8,marginBottom:8,cursor:'pointer'}}>
                <input type="checkbox"
                  checked={settings.chart?.autoFitOnLoad??true}
                  onChange={e=>upd('chart.autoFitOnLoad',e.target.checked)}
                  style={{accentColor:'#00d4ff',width:13,height:13}}/>
                <span style={{fontSize:11,color:'#cce0f5'}}>Auto-ajustar al cargar</span>
              </label>

              {sep('Rendimiento')}
              {row('Calidad de curvas equity','(más puntos = más lento)',
                <select value={settings.chart?.equityQuality||'normal'}
                  onChange={e=>upd('chart.equityQuality',e.target.value)}
                  style={{background:'#080c14',border:'1px solid #1a2d45',borderRadius:4,
                    color:'#e2eaf5',fontFamily:MONO,fontSize:12,padding:'6px 10px',width:'100%'}}>
                  <option value="fast">Rápido (100 pts)</option>
                  <option value="normal">Normal (300 pts)</option>
                  <option value="hq">Alta calidad (600 pts)</option>
                </select>
              )}
            </div>
          )}
        </div>

          {/* ── WATCHLIST ── */}
          {tab==='watchlist'&&(
            <div>
              {sep('Filtros visibles en la Watchlist')}
              <div style={{fontSize:10,color:'#5a7a95',lineHeight:1.6,marginBottom:14}}>
                Elige qué filtros aparecen en la barra de la Watchlist. Los que desactives quedan ocultos
                pero siguen funcionando si los activas programáticamente.
              </div>
              {[
                ['watchlist.showFilterLista',    'Filtro por Lista',           true,  'Desplegable para filtrar por nombre de lista (General, Acciones, Índices…)'],
                ['watchlist.showFilterSearch',   'Buscador',                   true,  'Caja de búsqueda de símbolo o nombre de activo'],
                ['watchlist.showFilterFavorites','Solo Favoritos',             true,  'Toggle ★ para mostrar únicamente favoritos'],
                ['watchlist.showFilterAlarms',   'Filtro por Alarma activa',   true,  'Desplegable para filtrar activos que tienen una alarma específica activa'],
              ].map(([key,label,def,hint])=>(
                <div key={key} style={{marginBottom:12}}>
                  <label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer'}}>
                    <input type="checkbox"
                      checked={settings[key.split('.')[0]]?.[key.split('.')[1]]??def}
                      onChange={e=>upd(key,e.target.checked)}
                      style={{accentColor:'#00d4ff',width:13,height:13}}/>
                    <span style={{fontFamily:MONO,fontSize:11,color:'#cce0f5',fontWeight:600}}>{label}</span>
                  </label>
                  <div style={{fontFamily:MONO,fontSize:9,color:'#3d5a7a',lineHeight:1.5,marginLeft:21,marginTop:2}}>{hint}</div>
                </div>
              ))}
              {sep('Apariencia')}
              {[
                ['watchlist.showRankBadge',  'Mostrar badge de ranking (🥇#2…)', true],
                ['watchlist.showListBadge',  'Mostrar etiqueta de lista en cada activo', true],
              ].map(([key,label,def])=>(
                <label key={key} style={{display:'flex',alignItems:'center',gap:8,marginBottom:8,cursor:'pointer'}}>
                  <input type="checkbox"
                    checked={settings[key.split('.')[0]]?.[key.split('.')[1]]??def}
                    onChange={e=>upd(key,e.target.checked)}
                    style={{accentColor:'#00d4ff',width:13,height:13}}/>
                  <span style={{fontSize:11,color:'#cce0f5'}}>{label}</span>
                </label>
              ))}

            </div>
          )}

          {/* ── TEMA ── */}

          {/* ── RANKING ── */}
          {tab==='ranking'&&(
            <div>
              {/* ── Bloque informativo ── */}
              <div style={{background:'#0f1f2e',borderLeft:'3px solid #06b6d4',borderRadius:'0 4px 4px 0',
                padding:'8px 12px',fontSize:12,color:'#94a3b8',marginBottom:10,lineHeight:1.55}}>
                <div style={{fontWeight:700,color:'#22d3ee',marginBottom:6}}>ℹ️ Cómo se usan estos pesos</div>
                <div style={{marginBottom:4}}>
                  <span style={{color:'#e2e8f0',fontWeight:600}}>Score por métricas:</span>{' '}
                  usa solo el bloque <em>Métricas históricas</em>. Se guarda en Supabase y es uno de los criterios por los que puedes ordenar el Watchlist.
                  Ojo: la <em>Top estrategia</em> de cada activo NO la decide este score, sino el <b style={{color:'#cce0f5'}}>CAGR más alto</b> entre todas las estrategias habilitadas.
                </div>
                <div>
                  <span style={{color:'#e2e8f0',fontWeight:600}}>Score por métricas + señales:</span>{' '}
                  combina ambos bloques. Se calcula en la fase 3/3 del botón <b style={{color:'#cce0f5'}}>↻ Actualizar</b> de Mantenimiento Watchlist (o solo, cada 24 h — ver abajo),
                  sirve para ordenar el Watchlist y prioriza entradas en el modo <em>Capital Concentrado</em> del backtesting multiactivo.
                </div>
              </div>
              {/* ── Dos columnas ── */}
              {/* minmax(0,1fr) + minWidth:0 — sin esto los ítems del grid no encogen por debajo de su
                  contenido mínimo (sliders + etiquetas) y desbordan, cortando los títulos. */}
              <div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) minmax(0,1fr)',gap:12,marginTop:10}}>

                {/* Columna izquierda — Métricas de mercado */}
                <div style={{minWidth:0,background:'rgba(59,130,246,0.06)',border:'0.5px solid rgba(59,130,246,0.22)',borderRadius:8,padding:'10px 12px'}}>
                  <div title="Estas métricas usan datos de precios actuales. Alimentan el Score mét.+señales, que es una columna ordenable de la tabla y dos de los cuatro modos de ordenación del Watchlist, y prioriza slots en el modo Capital Concentrado del backtesting multiactivo. NO intervienen en la elección de la Top Estrategia de cada activo (esa se decide por CAGR)."
                    style={{fontFamily:MONO,fontSize:12,fontWeight:700,color:'#3b82f6',marginBottom:8,letterSpacing:'0.04em',cursor:'help',textDecoration:'underline dotted',textDecorationColor:'rgba(59,130,246,0.4)'}}>Métricas de mercado actuales<span style={{marginLeft:6,fontSize:11,color:'#5a7a95',textDecoration:'none'}}>ⓘ</span></div>
                  {/* Peso global del bloque */}
                  {(()=>{const wm=settings.ranking?.rankingWeightMercado??20; return(
                    <div style={{display:'flex',alignItems:'center',gap:8,paddingBottom:8,marginBottom:10,borderBottom:'1px solid rgba(59,130,246,0.2)'}}>
                      <span title="Porcentaje de peso del bloque de métricas de mercado en el score COMPLETO. Solo afecta a la priorización de slots en Capital Concentrado." style={{fontFamily:MONO,fontSize:11,color:'#88b4d8',flex:1,cursor:'help',textDecoration:'underline dotted',textDecorationColor:'rgba(59,130,246,0.4)'}}>Peso del bloque</span>
                      <span style={{fontFamily:MONO,fontSize:11,fontWeight:700,color:'#3b82f6',minWidth:30,textAlign:'right'}}>{wm}%</span>
                      <input type="range" min={0} max={100} step={5} value={wm}
                        onChange={e=>upd('ranking.rankingWeightMercado',Number(e.target.value))}
                        style={{width:70,accentColor:'#3b82f6'}}/>
                    </div>
                  )})()}

                  {/* Momentum */}
                  <div style={{marginBottom:8}}>
                    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:3}}>
                      <span style={{fontSize:13,fontWeight:500,color:'#d0e8fa',flex:1}}>Momentum</span>
                      <span style={{fontFamily:MONO,fontSize:11,fontWeight:700,color:'#3b82f6',minWidth:30,textAlign:'right'}}>{settings.ranking?.rankingMomentumPct??33}%</span>
                      <input type="range" min={0} max={100} step={5} value={settings.ranking?.rankingMomentumPct??33}
                        onChange={e=>upd('ranking.rankingMomentumPct',Number(e.target.value))}
                        style={{width:64,accentColor:'#3b82f6'}}/>
                    </div>
                    <div style={{fontSize:12,color:'#7a9bc0',lineHeight:1.5,marginBottom:7}}>% de subida del activo en las últimas N velas (en semanal, N semanas)</div>
                    <div style={{display:'flex',alignItems:'center',gap:8}}>
                      <span style={{fontFamily:MONO,fontSize:11,color:'#5a7a95'}}>N velas:</span>
                      <input type="number" min={5} max={120} value={settings.ranking?.rankingMomentumN??20}
                        onChange={e=>upd('ranking.rankingMomentumN',Math.max(5,Math.min(120,Number(e.target.value)||20)))}
                        style={{width:60,background:'#080c14',border:'1px solid #1a2d45',borderRadius:3,
                          color:'#cce0f5',fontFamily:MONO,fontSize:11,padding:'3px 6px',textAlign:'center'}}/>
                    </div>
                  </div>

                  {/* Fuerza relativa vs SP500 */}
                  <div style={{marginBottom:8}}>
                    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:3}}>
                      <span style={{fontSize:13,fontWeight:500,color:'#d0e8fa',flex:1}}>Fuerza relativa vs SP500</span>
                      <span style={{fontFamily:MONO,fontSize:11,fontWeight:700,color:'#3b82f6',minWidth:30,textAlign:'right'}}>{settings.ranking?.rankingFRPct??33}%</span>
                      <input type="range" min={0} max={100} step={5} value={settings.ranking?.rankingFRPct??33}
                        onChange={e=>upd('ranking.rankingFRPct',Number(e.target.value))}
                        style={{width:64,accentColor:'#3b82f6'}}/>
                    </div>
                    <div style={{fontSize:12,color:'#7a9bc0',lineHeight:1.5}}>Rendimiento del activo menos el del SP500.</div>
                    <div style={{fontSize:11,color:'#5a7a95',lineHeight:1.4,marginTop:5}}>Ventana fija, no configurable: <span style={{color:'#9fb8d0'}}>63 velas en diario</span> y <span style={{color:'#9fb8d0'}}>13 en semanal</span> (~3 meses en ambos). El score de <b>estrategia activa</b> la mide en el timeframe de esa estrategia; el de <b>top estrategia</b>, en el de la top de cada activo.</div>
                  </div>

                  {/* Proximidad máximo 52 semanas */}
                  <div style={{marginBottom:8}}>
                    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:3}}>
                      <span style={{fontSize:13,fontWeight:500,color:'#d0e8fa',flex:1}}>Proximidad máximo 52s</span>
                      <span style={{fontFamily:MONO,fontSize:11,fontWeight:700,color:'#3b82f6',minWidth:30,textAlign:'right'}}>{settings.ranking?.rankingMax52Pct??34}%</span>
                      <input type="range" min={0} max={100} step={5} value={settings.ranking?.rankingMax52Pct??34}
                        onChange={e=>upd('ranking.rankingMax52Pct',Number(e.target.value))}
                        style={{width:64,accentColor:'#3b82f6'}}/>
                    </div>
                    <div style={{fontSize:12,color:'#7a9bc0',lineHeight:1.5}}>Precio actual respecto al máximo de las últimas 252 velas</div>
                  </div>

                  {/* Total bloque mercado */}
                  {(()=>{
                    const total=(settings.ranking?.rankingMomentumPct??33)+(settings.ranking?.rankingFRPct??33)+(settings.ranking?.rankingMax52Pct??34)
                    const ok=total===100
                    return(
                      <div style={{display:'flex',alignItems:'center',gap:6,padding:'5px 10px',borderRadius:4,
                        background:ok?'rgba(59,130,246,0.08)':'rgba(255,209,102,0.08)',
                        border:`1px solid ${ok?'rgba(59,130,246,0.25)':'rgba(255,209,102,0.4)'}`}}>
                        <span style={{fontFamily:MONO,fontSize:10,fontWeight:700,color:ok?'#3b82f6':'#ffd166'}}>
                          {ok?`✓ Total: ${total}%`:`⚠ Total: ${total}%`}
                        </span>
                      </div>
                    )
                  })()}
                </div>

                {/* Columna derecha — Métricas históricas */}
                <div style={{minWidth:0,background:'rgba(34,211,238,0.05)',border:'0.5px solid rgba(34,211,238,0.18)',borderRadius:8,padding:'10px 12px'}}>
                  <div title="Estas métricas evalúan el rendimiento pasado de la estrategia con cada activo. Se aplican tanto al score de estrategia activa como al de top estrategia. Se usan para el ranking del Watchlist, para determinar la Top Estrategia de cada activo, y también (combinadas con las de mercado) para la priorización de slots en Capital Concentrado. CÓMO SE PUNTÚAN: con umbrales ABSOLUTOS que defines tú (suelo = 0 puntos, techo = 100 puntos, proporcional en medio). Antes se comparaba cada activo contra el resto de la watchlist, así que su score cambiaba al añadir o quitar activos; ahora un mismo valor da siempre los mismos puntos. Para calibrar los umbrales usa el visor 'Distribución real de tus métricas', más abajo: te da la mediana y el rango habitual de cada métrica en tu propia cartera."
                    style={{fontFamily:MONO,fontSize:12,fontWeight:700,color:'#22d3ee',marginBottom:8,letterSpacing:'0.04em',cursor:'help',textDecoration:'underline dotted',textDecorationColor:'rgba(34,211,238,0.4)'}}>Métricas históricas de estrategia<span style={{marginLeft:6,fontSize:11,color:'#5a7a95',textDecoration:'none'}}>ⓘ</span></div>
                  {/* Peso global del bloque */}
                  {(()=>{const wh=settings.ranking?.rankingWeightHistorico??80; return(
                    <div style={{display:'flex',alignItems:'center',gap:8,paddingBottom:8,marginBottom:10,borderBottom:'1px solid rgba(34,211,238,0.18)'}}>
                      <span title="Porcentaje de peso del bloque de métricas históricas en el score COMPLETO y en el score HISTÓRICO puro." style={{fontFamily:MONO,fontSize:11,color:'#88d4d4',flex:1,cursor:'help',textDecoration:'underline dotted',textDecorationColor:'rgba(34,211,238,0.4)'}}>Peso del bloque</span>
                      <span style={{fontFamily:MONO,fontSize:11,fontWeight:700,color:'#22d3ee',minWidth:30,textAlign:'right'}}>{wh}%</span>
                      <input type="range" min={0} max={100} step={5} value={wh}
                        onChange={e=>upd('ranking.rankingWeightHistorico',Number(e.target.value))}
                        style={{width:70,accentColor:'#22d3ee'}}/>
                    </div>
                  )})()}
                  {/* Nota común a las cuatro métricas */}
                  <div style={{fontSize:11,color:'#5a7a95',lineHeight:1.4,marginBottom:8}}>
                    Las cuatro se aplican tanto al score de <b>estrategia activa</b> como al de <b>top estrategia</b>.
                    Cada una se convierte a puntos con sus <b style={{color:'#7a9bc0'}}>umbrales fijos</b>: suelo → 0 pts,
                    techo → 100 pts, proporcional en medio. Esos puntos se multiplican por su peso.
                  </div>
                  {[
                    {key:'ranking.rankingWinRatePct', label:'Win rate', val:settings.ranking?.rankingWinRatePct??33,
                     hint:'% de trades ganadores. Mide la consistencia.',
                     flKey:'ranking.rankingWinRateFloor', flDef:25, ceKey:'ranking.rankingWinRateCeil', ceDef:65,
                     tip:'Porcentaje de operaciones cerradas en positivo sobre el total. Mide con qué frecuencia acierta la estrategia, no cuánto gana: un win rate alto con ganancias pequeñas puede rendir menos que uno bajo con ganancias grandes. PUNTOS: por debajo del suelo da 0, por encima del techo da 100, y en medio proporcionalmente; esos puntos se multiplican por el peso que le asignes y SUMAN al score.'},
                    {key:'ranking.rankingCAGRPct', label:'CAGR', val:settings.ranking?.rankingCAGRPct??33,
                     hint:'Tasa de crecimiento anual anualizada.',
                     flKey:'ranking.rankingCAGRFloor', flDef:0, ceKey:'ranking.rankingCAGRCeil', ceDef:40,
                     tip:'Rentabilidad anualizada del backtest: a qué ritmo habría crecido el capital al año. Se calcula sobre el resultado en modo Simple (sin reinvertir) y el periodo real de la prueba. Si el capital final quedara en cero o negativo se marca como no calculable y se descarta. PUNTOS: por debajo del suelo da 0, por encima del techo da 100, y en medio proporcionalmente; esos puntos se multiplican por el peso que le asignes y SUMAN al score.'},
                    {key:'ranking.rankingCAGRRobustoPct', label:'Robustez (independencia del mejor trade)', val:settings.ranking?.rankingCAGRRobustoPct??34,
                     hint:'Qué parte de las ganancias NO depende de una sola operación.',
                     flKey:'ranking.rankingRobustezFloor', flDef:30, ceKey:'ranking.rankingRobustezCeil', ceDef:85,
                     tip:'Mide qué porcentaje de las ganancias NO depende del mejor trade: 100 menos el peso del mejor trade sobre la suma de TODOS los trades ganadores. Un valor alto significa beneficio repartido entre varias operaciones (sólido); uno bajo, que casi todo viene de una sola (frágil). Si la estrategia pierde dinero en total, vale 0. PUNTOS: por debajo del suelo da 0, por encima del techo da 100, y en medio proporcionalmente; esos puntos se multiplican por el peso que le asignes y SUMAN al score.'},
                    {key:'ranking.rankingMaxDDPct', label:'Max drawdown', val:settings.ranking?.rankingMaxDDPct??0,
                     hint:'Penaliza el riesgo: cuanto menos drawdown, más puntos.',
                     flKey:'ranking.rankingMaxDDFloor', flDef:50, ceKey:'ranking.rankingMaxDDCeil', ceDef:10, invertido:true,
                     tip:'Máxima caída desde un máximo de la curva de capital hasta el mínimo posterior: cuánto habrías llegado a perder en el peor tramo. OJO, EL SENTIDO ESTÁ INVERTIDO respecto a las demás: menos drawdown = MÁS puntos. PUNTOS: con un drawdown igual o peor que el suelo da 0, igual o mejor que el techo da 100, y en medio proporcionalmente; así es como penaliza el riesgo, restando score a los activos con caídas grandes. Con peso 0 el riesgo no influye y el score solo premia rentabilidad, consistencia y robustez.'},
                  ].map(({key,label,val,hint,tip,flKey,flDef,ceKey,ceDef,invertido})=>{
                    const fl=settings.ranking?.[flKey.split('.')[1]]??flDef
                    const ce=settings.ranking?.[ceKey.split('.')[1]]??ceDef
                    const numIn=(v,k,def)=>(
                      <input type="number" value={v} step={1}
                        onChange={e=>upd(k, e.target.value===''?def:Number(e.target.value))}
                        style={{width:46,background:'#080c14',border:'1px solid #1a2d45',borderRadius:3,
                          color:'#cce0f5',fontFamily:MONO,fontSize:11,padding:'2px 4px',textAlign:'center'}}/>
                    )
                    return(
                    <div key={key} style={{marginBottom:8}}>
                      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:3}}>
                        <span style={{fontSize:13,fontWeight:500,color:'#d0e8fa',flex:1}}>
                          {label}
                          <span title={tip} style={{marginLeft:6,fontSize:11,color:'#5a7a95',textDecoration:'none',cursor:'help'}}>ⓘ</span>
                        </span>
                        <span style={{fontFamily:MONO,fontSize:11,fontWeight:700,color:'#22d3ee',minWidth:30,textAlign:'right'}}>{val}%</span>
                        <input type="range" min={0} max={100} step={5} value={val}
                          onChange={e=>upd(key,Number(e.target.value))}
                          style={{width:64,accentColor:'#22d3ee'}}/>
                      </div>
                      <div style={{fontSize:12,color:'#7a9bc0',lineHeight:1.5,marginBottom:4}}>{hint}</div>
                      {/* Umbrales absolutos de esta métrica */}
                      <div style={{display:'flex',alignItems:'center',gap:5,flexWrap:'wrap',fontFamily:MONO,fontSize:10,color:'#5a7a95'}}>
                        <span>0 pts si {invertido?'≥':'≤'}</span>{numIn(fl,flKey,flDef)}
                        <span style={{color:'#31506e'}}>·</span>
                        <span>100 pts si {invertido?'≤':'≥'}</span>{numIn(ce,ceKey,ceDef)}
                      </div>
                    </div>
                  )})}
                  {/* Total bloque histórico */}
                  {(()=>{
                    const total=(settings.ranking?.rankingWinRatePct??33)+(settings.ranking?.rankingCAGRPct??33)+(settings.ranking?.rankingCAGRRobustoPct??34)+(settings.ranking?.rankingMaxDDPct??0)
                    const ok=total===100
                    return(
                      <div style={{display:'flex',alignItems:'center',gap:6,padding:'5px 10px',borderRadius:4,
                        background:ok?'rgba(34,211,238,0.07)':'rgba(255,209,102,0.08)',
                        border:`1px solid ${ok?'rgba(34,211,238,0.2)':'rgba(255,209,102,0.4)'}`}}>
                        <span style={{fontFamily:MONO,fontSize:10,fontWeight:700,color:ok?'#22d3ee':'#ffd166'}}>
                          {ok?`✓ Total: ${total}%`:`⚠ Total: ${total}%`}
                        </span>
                        {!ok&&<button onClick={()=>upd('ranking',{...(settings.ranking||{}),rankingWinRatePct:33,rankingCAGRPct:33,rankingCAGRRobustoPct:34,rankingMaxDDPct:0})}
                          style={{marginLeft:'auto',fontFamily:MONO,fontSize:9,padding:'2px 7px',borderRadius:3,
                            border:'1px solid rgba(255,209,102,0.5)',background:'transparent',color:'#ffd166',cursor:'pointer'}}>
                          Restaurar
                        </button>}
                      </div>
                    )
                  })()}
                </div>
              </div>

              {/* ── Otras opciones ── */}
              {sep('Otras opciones')}
              <div style={{display:'flex',alignItems:'center',gap:10}}>
                <span style={{fontFamily:MONO,fontSize:12,color:'#cce0f5',flex:1}}>Mínimo de trades para incluir en ranking</span>
                <input type="number" value={settings.ranking?.minTrades??3} min={1} max={50}
                  onChange={e=>upd('ranking.minTrades',Number(e.target.value))}
                  style={{width:60,background:'#080c14',border:'1px solid #1a2d45',borderRadius:4,
                    color:'#e2eaf5',fontFamily:MONO,fontSize:12,padding:'4px 8px',textAlign:'center'}}/>
              </div>
              {/* ── Visor de distribución (colapsado: en reposo solo el botón) ── */}
              <div style={{marginTop:10}}>
                <div style={{display:'flex',alignItems:'center',gap:10}}>
                  <span style={{fontFamily:MONO,fontSize:12,color:'#cce0f5',flex:1}}>
                    Distribución real de tus métricas
                    <span title="Percentil 10, mediana y percentil 90 de las cuatro métricas del score, en las dos poblaciones que ordenan el watchlist: la estrategia activa de cada activo y su top estrategia. Sirve para calibrar umbrales; no cambia ningún cálculo."
                      style={{marginLeft:6,fontSize:11,color:'#5a7a95',textDecoration:'none',cursor:'help'}}>ⓘ</span>
                  </span>
                  <button onClick={()=>distrib?setDistrib(null):calcularDistribucion()} style={{
                    padding:'6px 12px', borderRadius:4, border:'1px solid #1a2d45',
                    background:distrib?'rgba(34,211,238,0.12)':'rgba(13,21,32,0.9)',
                    color:distrib?'#22d3ee':'#7a9bc0',
                    fontFamily:MONO, fontSize:11, cursor:'pointer', whiteSpace:'nowrap', flexShrink:0
                  }}>{distrib?'Ocultar':'Calcular distribución'}</button>
                </div>
                {distrib&&(()=>{
                  const f=v=>v==null?'—':`${v.toFixed(1)}%`
                  const G='104px repeat(3,1fr) 12px repeat(3,1fr)'
                  const pocaActiva=distrib.nAct < distrib.nTop/2
                  return(
                    <div style={{marginTop:8,padding:'8px 10px',background:'rgba(34,211,238,0.04)',
                      border:'0.5px solid rgba(34,211,238,0.12)',borderRadius:5}}>
                      {/* Cabecera de poblaciones */}
                      <div style={{display:'grid',gridTemplateColumns:G,gap:4,fontSize:10,marginBottom:3}}>
                        <span/>
                        <span style={{gridColumn:'2 / span 3',textAlign:'center',color:'#22d3ee',fontWeight:700}}>
                          Activa <span style={{color:'#3d5a7a',fontWeight:400}}>(n={distrib.nAct})</span>
                        </span>
                        <span/>
                        <span style={{gridColumn:'6 / span 3',textAlign:'center',color:'#ff9500',fontWeight:700}}>
                          Top <span style={{color:'#3d5a7a',fontWeight:400}}>(n={distrib.nTop})</span>
                        </span>
                      </div>
                      {/* Cabecera de percentiles */}
                      <div style={{display:'grid',gridTemplateColumns:G,gap:4,fontSize:9,color:'#3d5a7a',marginBottom:3}}>
                        <span/>
                        <span style={{textAlign:'right'}}>P10</span><span style={{textAlign:'right'}}>mediana</span><span style={{textAlign:'right'}}>P90</span>
                        <span/>
                        <span style={{textAlign:'right'}}>P10</span><span style={{textAlign:'right'}}>mediana</span><span style={{textAlign:'right'}}>P90</span>
                      </div>
                      {distrib.active.map((mA,i)=>{
                        const mT=distrib.top[i]
                        return(
                          <div key={mA.label} style={{display:'grid',gridTemplateColumns:G,gap:4,fontSize:11,marginBottom:2}}>
                            <span style={{color:'#7a9bc0'}}>{mA.label}</span>
                            <span style={{color:'#5a8aaa',textAlign:'right'}}>{f(mA.p10)}</span>
                            <span style={{color:'#e2eaf5',fontWeight:600,textAlign:'right'}}>{f(mA.p50)}</span>
                            <span style={{color:'#5a8aaa',textAlign:'right'}}>{f(mA.p90)}</span>
                            <span/>
                            <span style={{color:'#5a8aaa',textAlign:'right'}}>{f(mT.p10)}</span>
                            <span style={{color:'#e2eaf5',fontWeight:600,textAlign:'right'}}>{f(mT.p50)}</span>
                            <span style={{color:'#5a8aaa',textAlign:'right'}}>{f(mT.p90)}</span>
                          </div>
                        )
                      })}
                      {pocaActiva&&(
                        <div style={{fontSize:10,color:'#f59e0b',marginTop:6,lineHeight:1.45}}>
                          ⚠ La población &ldquo;Activa&rdquo; tiene muy pocos datos (n={distrib.nAct} frente a {distrib.nTop}):
                          probablemente no hay una estrategia activa cargada. No la uses para calibrar.
                        </div>
                      )}
                      <div style={{fontSize:10,color:'#5a7a95',marginTop:6,lineHeight:1.45}}>
                        Se excluyen los valores sin dato y los CAGR marcados como no calculables (centinela −99).
                      </div>
                    </div>
                  )
                })()}
              </div>
              {/* Actualización automática Score mét.+señales */}
              {(()=>{
                const hours = settings.ranking?.autoRefreshScoreMetSenHours ?? 24
                const enabled = hours > 0
                return(
                  <div style={{marginTop:10}}>
                    <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:enabled?8:0}}>
                      <input type="checkbox" checked={enabled}
                        onChange={e=>upd('ranking.autoRefreshScoreMetSenHours', e.target.checked ? 24 : 0)}
                        style={{accentColor:'#22d3ee',cursor:'pointer'}}/>
                      <span style={{fontFamily:MONO,fontSize:12,color:'#cce0f5',flex:1,cursor:'pointer'}}
                        onClick={()=>upd('ranking.autoRefreshScoreMetSenHours', enabled ? 0 : 24)}>
                        Actualización automática Score mét.+señales al cargar
                        <span title="Solo recompone los scores a partir de las métricas ya guardadas. No descarga precios ni ejecuta backtests, así que es instantáneo. No renueva las métricas."
                          onClick={e=>e.stopPropagation()}
                          style={{marginLeft:6,fontSize:11,color:'#5a7a95',textDecoration:'none',cursor:'help'}}>ⓘ</span>
                      </span>
                    </div>
                    {enabled&&(
                      <div style={{display:'flex',alignItems:'center',gap:8,paddingLeft:22}}>
                        <span style={{fontFamily:MONO,fontSize:11,color:'#7a9bc0'}}>Actualizar si han pasado más de</span>
                        <input type="number" value={hours} min={1} max={168}
                          onChange={e=>upd('ranking.autoRefreshScoreMetSenHours', Math.max(1,Number(e.target.value)))}
                          style={{width:52,background:'#080c14',border:'1px solid #1a2d45',borderRadius:4,
                            color:'#e2eaf5',fontFamily:MONO,fontSize:12,padding:'3px 6px',textAlign:'center'}}/>
                        <span style={{fontFamily:MONO,fontSize:11,color:'#7a9bc0'}}>horas sin actualizar</span>
                      </div>
                    )}
                  </div>
                )
              })()}
              {/* Recordatorio de métricas completas (backtest) — distinto del anterior */}
              {(()=>{
                const days  = settings.ranking?.metricsReminderDays  ?? 15
                const batch = settings.ranking?.metricsReminderBatch ?? 30
                const enabled = days > 0
                return(
                  <div style={{marginTop:10,paddingTop:10,borderTop:'1px solid #16233a'}}>
                    <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:enabled?8:0}}>
                      <input type="checkbox" checked={enabled}
                        onChange={e=>upd('ranking.metricsReminderDays', e.target.checked ? 15 : 0)}
                        style={{accentColor:'#f59e0b',cursor:'pointer'}}/>
                      <span style={{fontFamily:MONO,fontSize:12,color:'#cce0f5',flex:1,cursor:'pointer'}}
                        onClick={()=>upd('ranking.metricsReminderDays', enabled ? 0 : 15)}>
                        Recordar recalcular métricas completas (con backtest)
                        <span title="Recalcula las métricas de verdad: descarga precios actualizados y backtestea cada activo contra todas las estrategias habilitadas (y después recompone sus scores). Tarda varios minutos, por eso solo aparece un aviso al cargar la app con un botón para lanzarlo: nunca se ejecuta solo."
                          onClick={e=>e.stopPropagation()}
                          style={{marginLeft:6,fontSize:11,color:'#5a7a95',textDecoration:'none',cursor:'help'}}>ⓘ</span>
                      </span>
                    </div>
                    {enabled&&(
                      <div style={{display:'flex',alignItems:'center',gap:8,paddingLeft:22,flexWrap:'wrap'}}>
                        <span style={{fontFamily:MONO,fontSize:11,color:'#7a9bc0'}}>Avisar si hay activos con más de</span>
                        <input type="number" value={days} min={1} max={365}
                          onChange={e=>upd('ranking.metricsReminderDays', Math.max(1,Number(e.target.value)))}
                          style={{width:52,background:'#080c14',border:'1px solid #1a2d45',borderRadius:4,
                            color:'#e2eaf5',fontFamily:MONO,fontSize:12,padding:'3px 6px',textAlign:'center'}}/>
                        <span style={{fontFamily:MONO,fontSize:11,color:'#7a9bc0'}}>días sin recalcular</span>
                        <span style={{fontFamily:MONO,fontSize:11,color:'#3d5a7a',padding:'0 2px'}}>·</span>
                        <span style={{fontFamily:MONO,fontSize:11,color:'#7a9bc0'}}>actualizar por lote los</span>
                        <input type="number" value={batch} min={1} max={200}
                          onChange={e=>upd('ranking.metricsReminderBatch', Math.max(1,Number(e.target.value)))}
                          style={{width:52,background:'#080c14',border:'1px solid #1a2d45',borderRadius:4,
                            color:'#e2eaf5',fontFamily:MONO,fontSize:12,padding:'3px 6px',textAlign:'center'}}/>
                        <span style={{fontFamily:MONO,fontSize:11,color:'#7a9bc0'}}>más antiguos</span>
                      </div>
                    )}
                  </div>
                )
              })()}
            </div>
          )}

          {/* ── TRADELOG CONFIG ── */}
          {tab==='tradelog_cfg'&&(
            <div>


              {sep('Valores por defecto al registrar operación')}
              <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:14}}>
                {[
                  ['tradelog.defaultBroker','Broker por defecto','ibkr'],
                  ['tradelog.defaultCurrency','Divisa por defecto','USD'],
                  ['tradelog.defaultCommission','Comisión por defecto (€)','0'],
                ].map(([key,label,def])=>(
                  <div key={key} style={{display:'flex',alignItems:'center',gap:8}}>
                    <span style={{fontFamily:MONO,fontSize:10,color:'#7a9bc0',width:200,flexShrink:0}}>{label}</span>
                    {key==='tradelog.defaultBroker'
                      ? <select value={settings.tradelog?.defaultBroker||'ibkr'} onChange={e=>upd(key,e.target.value)}
                          style={{flex:1,background:'#080c14',border:'1px solid #1a2d45',borderRadius:4,color:'#e2eaf5',fontFamily:MONO,fontSize:11,padding:'5px 8px'}}>
                          <option value="ibkr">IBKR</option><option value="degiro">Degiro</option>
                          <option value="myinvestor">MyInvestor</option><option value="binance">Binance</option>
                          <option value="manual">Manual</option>
                        </select>
                      : key==='tradelog.defaultCurrency'
                      ? <select value={settings.tradelog?.defaultCurrency||'USD'} onChange={e=>upd(key,e.target.value)}
                          style={{flex:1,background:'#080c14',border:'1px solid #1a2d45',borderRadius:4,color:'#e2eaf5',fontFamily:MONO,fontSize:11,padding:'5px 8px'}}>
                          <option value="USD">USD</option><option value="EUR">EUR</option>
                          <option value="GBP">GBP</option><option value="CHF">CHF</option>
                        </select>
                      : <input type="number" min="0" step="0.01"
                          value={settings.tradelog?.defaultCommission??0}
                          onChange={e=>upd(key,parseFloat(e.target.value)||0)}
                          style={{flex:1,background:'#080c14',border:'1px solid #1a2d45',borderRadius:4,color:'#e2eaf5',fontFamily:MONO,fontSize:11,padding:'5px 8px'}}/>
                    }
                  </div>
                ))}
              </div>

              <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:14}}>
                <span style={{fontFamily:MONO,fontSize:10,color:'#7a9bc0',width:200,flexShrink:0}}>Formato fecha IBKR import</span>
                <select value={settings.tradelog?.ibkrDateFormat||'DD/MM'} onChange={e=>upd('tradelog.ibkrDateFormat',e.target.value)}
                  style={{flex:1,background:'#080c14',border:'1px solid #1a2d45',borderRadius:4,color:'#e2eaf5',fontFamily:MONO,fontSize:11,padding:'5px 8px'}}>
                  <option value="DD/MM">DD/MM/YYYY — Europa (IBKR España/UK)</option>
                  <option value="MM/DD">MM/DD/YYYY — USA</option>
                </select>
              </div>
            </div>
          )}
        {/* Footer */}
        <div style={{display:'flex',justifyContent:'flex-end',gap:8,padding:'12px 20px',
          borderTop:'1px solid #0d1520',flexShrink:0}}>
          <button onClick={onClose} style={{padding:'7px 16px',borderRadius:4,border:'1px solid #1a2d45',
            background:'transparent',color:'#7a9bc0',fontFamily:MONO,fontSize:11,cursor:'pointer'}}>
            Cancelar
          </button>
          <button onClick={handleSave} style={{padding:'7px 16px',borderRadius:4,border:'none',
            background: dirty ? '#00d4ff' : '#1a2d45',
            color: dirty ? '#080c14' : '#5a7a95',
            fontFamily:MONO,fontSize:11,fontWeight:700,cursor:'pointer',transition:'all .15s'}}>
            {dirty ? '✓ Guardar' : 'Guardado'}
          </button>
        </div>
      </div>
    </div>
  )
}
