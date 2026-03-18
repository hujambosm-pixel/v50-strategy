import { useState, useRef, useEffect } from 'react'
import { MONO } from '../lib/utils'
import { getSupaUrl, getSupaKey } from '../lib/supabase'
import { loadSettings, saveSettingsRemote } from '../lib/settings'
import { fetchConditions, saveCondition, deleteCondition, groqParseCondition, lsGetConds, lsSaveConds } from '../lib/conditions'
import Tip from './Tip'

export default function SettingsModal({ onClose, strategies=[], initialTab='integraciones' }) {
  const [tab, setTab] = useState(initialTab)
  const [settings, setSettings] = useState(loadSettings)
  const [groqStatus, setGroqStatus] = useState(null) // null | 'testing' | 'ok' | 'err'
  const [dirty, setDirty] = useState(false)
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
    { id:'alarmas',       label:'🔔 Alertas' },
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
        width:'min(860px,96vw)', maxHeight:'92vh', display:'flex', flexDirection:'column',
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
        <div style={{overflowY:'auto',flex:1,minHeight:0,padding:'22px 28px'}}>

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
              {sep('Canal de notificaciones')}
              {row('Método de envío','',
                <select value={settings.alarms?.method||'none'} onChange={e=>upd('alarms.method',e.target.value)}
                  style={{background:'#080c14',border:'1px solid #1a2d45',borderRadius:4,
                    color:'#e2eaf5',fontFamily:MONO,fontSize:12,padding:'6px 10px',width:'100%'}}>
                  <option value="none">Sin notificaciones</option>
                  <option value="email">Email</option>
                  <option value="webhook">Webhook (Slack, Discord, etc.)</option>
                  <option value="telegram">Telegram</option>
                </select>
              )}

              {settings.alarms?.method==='email'&&(
                <>{sep('Email')}{row('Dirección de correo','',inp(settings.alarms?.email, v=>upd('alarms.email',v), {placeholder:'tu@email.com',type:'email'}))}</>
              )}

              {settings.alarms?.method==='webhook'&&(
                <>{sep('Webhook')}{row('URL del webhook','',inp(settings.alarms?.webhookUrl, v=>upd('alarms.webhookUrl',v), {placeholder:'https://hooks.slack.com/...'}))}</>
              )}

              {settings.alarms?.method==='telegram'&&(
                <>
                  {sep('Telegram')}
                  {row('Bot Token','',inp(settings.alarms?.telegramToken, v=>upd('alarms.telegramToken',v), {placeholder:'123456:ABC-...', mono:true}))}
                  {row('Chat ID','',inp(settings.alarms?.telegramChatId, v=>upd('alarms.telegramChatId',v), {placeholder:'-100123456789', mono:true}))}
                  <div style={{fontSize:10,color:'#3d5a7a',lineHeight:1.6,marginTop:-6}}>
                    Crea un bot con @BotFather y añade el bot a tu canal/grupo para obtener el Chat ID.
                  </div>
                </>
              )}

              {sep('Parpadeo de alarmas')}
              <div style={{marginBottom:12}}>
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
                  <span style={{fontFamily:MONO,fontSize:10,color:'#cce0f5',flex:1}}>Parpadear cuando la alarma lleva ≤ N velas activa</span>
                  <span style={{fontFamily:MONO,fontSize:12,fontWeight:700,color:'#ffd166',minWidth:24,textAlign:'right'}}>{settings.alarmas?.blinkCandles??3}</span>
                  <input type="range" min={1} max={20} value={settings.alarmas?.blinkCandles??3}
                    onChange={e=>upd('alarmas.blinkCandles',Number(e.target.value))}
                    style={{width:100,accentColor:'#ffd166'}}/>
                </div>
                <div style={{fontFamily:MONO,fontSize:9,color:'#3d5a7a',lineHeight:1.5}}>
                  El círculo de alarma parpadeará si la condición se activó hace N velas o menos (día actual = 1).
                </div>
              </div>
              {sep('Opciones')}
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
              {sep('Pesos de la fórmula de scoring (total = 100%)')}
              <div style={{fontSize:10,color:'#5a7a95',lineHeight:1.6,marginBottom:14}}>
                El score 0–100 de cada activo se calcula combinando estas 5 métricas.
                Ajusta los pesos según lo que más valoras en una estrategia.
                La penalización del Max DD reduce el score (resta).
              </div>
              {[
                ['ranking.w_winrate',    'Win Rate',                    settings.ranking?.w_winrate    ?? 25, 'Porcentaje de trades ganadores. Mide la consistencia de la estrategia.'],
                ['ranking.w_factorben',  'Factor de Beneficio',         settings.ranking?.w_factorben  ?? 25, 'Ratio ganancia bruta / pérdida bruta. >1 = estrategia rentable.'],
                ['ranking.w_cagr',       'CAGR',                        settings.ranking?.w_cagr       ?? 25, 'Tasa de crecimiento anual compuesto. Mide la rentabilidad real anualizada.'],
                ['ranking.w_robustez',   'CAGR sin top 3 trades',       settings.ranking?.w_robustez   ?? 20, 'CAGR excluyendo las 3 mejores operaciones. Mide la robustez real de la estrategia.'],
                ['ranking.w_dd',         'Max Drawdown (penalización)', settings.ranking?.w_dd         ?? 5,  'Penaliza el riesgo. Reduce el score según el máximo drawdown histórico.'],
              ].map(([key, label, val, hint])=>(
                <div key={key} style={{marginBottom:12}}>
                  <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
                    <span style={{fontFamily:MONO,fontSize:10,color:'#cce0f5',flex:1}}>{label}</span>
                    <span style={{fontFamily:MONO,fontSize:12,fontWeight:700,color:'#00d4ff',minWidth:32,textAlign:'right'}}>{val}%</span>
                    <input type="range" min={0} max={50} value={val}
                      onChange={e=>upd(key,Number(e.target.value))}
                      style={{width:100,accentColor:'#00d4ff'}}/>
                  </div>
                  <div style={{fontFamily:MONO,fontSize:9,color:'#3d5a7a',lineHeight:1.5,marginLeft:0}}>{hint}</div>
                </div>
              ))}
              {(()=>{
                const total=(settings.ranking?.w_winrate??25)+(settings.ranking?.w_factorben??25)+(settings.ranking?.w_cagr??25)+(settings.ranking?.w_robustez??20)+(settings.ranking?.w_dd??5)
                const ok=total===100
                return(
                  <div style={{display:'flex',alignItems:'center',gap:8,padding:'8px 12px',borderRadius:5,
                    background:ok?'rgba(0,229,160,0.08)':'rgba(255,209,102,0.08)',
                    border:`1px solid ${ok?'rgba(0,229,160,0.3)':'rgba(255,209,102,0.4)'}`,marginTop:4}}>
                    <span style={{fontFamily:MONO,fontSize:11,fontWeight:700,color:ok?'#00e5a0':'#ffd166'}}>
                      {ok?'✓ Total: 100%':`⚠ Total: ${total}% (debe ser 100%)`}
                    </span>
                    {!ok&&<button onClick={()=>{
                      // auto-normalize
                      const base={w_winrate:25,w_factorben:25,w_cagr:25,w_robustez:20,w_dd:5}
                      upd('ranking',{...settings.ranking,...base})
                    }} style={{marginLeft:'auto',fontFamily:MONO,fontSize:9,padding:'3px 8px',borderRadius:3,
                      border:'1px solid #ffd166',background:'transparent',color:'#ffd166',cursor:'pointer'}}>
                      Restaurar por defecto
                    </button>}
                  </div>
                )
              })()}
              {sep('Otras opciones de ranking')}
              {[
                ['ranking.minTrades', 'Mínimo de trades para incluir en ranking', settings.ranking?.minTrades ?? 3],
              ].map(([key,label,val])=>(
                <div key={key} style={{display:'flex',alignItems:'center',gap:10,marginBottom:8}}>
                  <span style={{fontFamily:MONO,fontSize:10,color:'#cce0f5',flex:1}}>{label}</span>
                  <input type="number" value={val} min={1} max={50}
                    onChange={e=>upd(key,Number(e.target.value))}
                    style={{width:60,background:'#080c14',border:'1px solid #1a2d45',borderRadius:4,
                      color:'#e2eaf5',fontFamily:MONO,fontSize:12,padding:'4px 8px',textAlign:'center'}}/>
                </div>
              ))}
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

              {sep('Condiciones visibles como puntos en el TradeLog')}
              <div style={{fontSize:10,color:'#5a7a95',lineHeight:1.6,marginBottom:10}}>                Selecciona qué condiciones de la librería aparecen como círculos de color en la columna Símbolo del registro de operaciones.
              </div>
              {(()=>{
                const libConds=lsGetConds()
                const tlCondIds=settings?.tradelog?.condDotIds||[]
                const COND_COLORS=['#00e5a0','#ffd166','#00d4ff','#ff7eb3','#9b72ff','#ff4d6d']
                if(libConds.length===0) return(
                  <div style={{fontFamily:MONO,fontSize:11,color:'#4a6a80',padding:'8px 10px',
                    background:'rgba(0,0,0,0.15)',borderRadius:4,border:'1px dashed #1e3a52',lineHeight:1.6,marginBottom:14}}>
                    No hay condiciones en la librería.<br/>
                    Créalas en <b style={{color:'#00d4ff'}}>⚡ Condiciones</b>.
                  </div>
                )
                return(
                  <div style={{marginBottom:14}}>
                    <div style={{display:'flex',flexWrap:'wrap',gap:6,marginBottom:8}}>
                      {libConds.map((c,i)=>{
                        const sel=tlCondIds.includes(c.id)
                        const col=COND_COLORS[i%COND_COLORS.length]
                        return(
                          <div key={c.id} onClick={()=>{const next=sel?tlCondIds.filter(x=>x!==c.id):[...tlCondIds,c.id];upd('tradelog.condDotIds',next)}}
                            style={{display:'flex',alignItems:'center',gap:5,cursor:'pointer',
                              padding:'4px 9px',borderRadius:12,
                              border:'1px solid '+(sel?col:'#1e3a52'),
                              background:sel?col+'18':'rgba(255,255,255,0.02)',userSelect:'none'}}>
                            <span style={{width:8,height:8,borderRadius:'50%',flexShrink:0,display:'inline-block',
                              background:sel?col:'#2a3f55',boxShadow:sel?'0 0 4px '+col:undefined}}/>
                            <span style={{fontFamily:MONO,fontSize:10,color:sel?col:'#7a9bc0'}}>{c.name}</span>
                          </div>
                        )
                      })}
                    </div>
                    <div style={{display:'flex',gap:6}}>
                      <button onClick={()=>upd('tradelog.condDotIds',libConds.map(c=>c.id))}
                        style={{flex:1,fontFamily:MONO,fontSize:10,padding:'4px 8px',borderRadius:3,
                          border:'1px solid #2a4060',background:'rgba(0,212,255,0.06)',color:'#00d4ff',cursor:'pointer'}}>
                        ✓ Todas
                      </button>
                      <button onClick={()=>upd('tradelog.condDotIds',[])}
                        style={{flex:1,fontFamily:MONO,fontSize:10,padding:'4px 8px',borderRadius:3,
                          border:'1px solid #3a1a20',background:'rgba(255,77,109,0.06)',color:'#ff4d6d',cursor:'pointer'}}>
                        ✕ Ninguna
                      </button>
                    </div>
                  </div>
                )
              })()}



              {sep('Copia de seguridad de operaciones')}
              <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                <button onClick={()=>{
                  try {
                    const trades = JSON.parse(localStorage.getItem('v50_tradelog')||'[]')
                    const d = new Date().toISOString().slice(0,10)
                    const blob = new Blob([JSON.stringify({version:'v50',date:d,trades},null,2)],{type:'application/json'})
                    const a = document.createElement('a'); a.href=URL.createObjectURL(blob)
                    a.download=`backup_${d}.json`; a.click(); URL.revokeObjectURL(a.href)
                  } catch(e){ alert('Error: '+e.message) }
                }} style={{padding:'7px 12px',borderRadius:4,border:'1px solid #9b72ff',
                  background:'rgba(155,114,255,0.1)',color:'#9b72ff',fontFamily:MONO,fontSize:11,cursor:'pointer'}}>
                  ⬇ Descargar backup (JSON)
                </button>
                <button onClick={()=>{
                  const input = document.createElement('input'); input.type='file'; input.accept='.json'
                  input.onchange = async e => {
                    try {
                      const text = await e.target.files[0].text()
                      const data = JSON.parse(text)
                      const trades = data.trades||data
                      if(!Array.isArray(trades)) throw new Error('Formato incorrecto')
                      if(!confirm(`¿Restaurar ${trades.length} operaciones? Se reemplazarán las actuales.`)) return
                      localStorage.setItem('v50_tradelog', JSON.stringify(trades))
                      alert(`✓ ${trades.length} operaciones restauradas`)
                    } catch(e){ alert('Error al restaurar: '+e.message) }
                  }
                  input.click()
                }} style={{padding:'7px 12px',borderRadius:4,border:'1px solid #1a2d45',
                  background:'transparent',color:'#7a9bc0',fontFamily:MONO,fontSize:11,cursor:'pointer'}}>
                  ⬆ Restaurar desde backup
                </button>
              </div>
              <div style={{fontSize:10,color:'#3d5a7a',lineHeight:1.6,marginTop:8}}>
                El backup descargado es un fichero JSON con todas tus operaciones.
                Guárdalo en <span style={{color:'#ffd166'}}>[Carpeta elegida] / Backup operativa</span>.
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
