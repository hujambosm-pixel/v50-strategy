import { useState, useRef, useEffect } from 'react'
import { MONO } from '../lib/utils'

export default function StrategyAIPanel({ definition, onApply, onClose }) {
  const [messages, setMessages] = useState([
    { role:'assistant', content:'Hola. Descríbeme la estrategia que quieres implementar en lenguaje natural. Por ejemplo: "Quiero comprar cuando el precio cruza al alza una media móvil de 20 periodos y vender cuando cierra por debajo de ella, con un stop en el mínimo de la vela de entrada." \n\nTe ayudaré a configurar cada uno de los 8 pasos del constructor.' }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [pendingConfig, setPendingConfig] = useState(null)
  const [pendingMissing, setPendingMissing] = useState(null)
  const [pendingName, setPendingName] = useState('')
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(()=>{ messagesEndRef.current?.scrollIntoView({behavior:'smooth'}) }, [messages])

  const getGroqKey = () => {
    try { return JSON.parse(localStorage.getItem('v50_settings')||'{}')?.integrations?.groqKey||'' } catch(_){ return '' }
  }

  const send = async () => {
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    const newMessages = [...messages, { role:'user', content:text }]
    setMessages(newMessages)
    setLoading(true)
    setPendingConfig(null)
    setPendingMissing(null)
    try {
      const key = getGroqKey()
      const r = await fetch('/api/strategy-ai', {
        method:'POST',
        headers:{'Content-Type':'application/json','x-groq-key':key},
        body: JSON.stringify({ messages: newMessages.filter(m=>m.role!=='system').map(({role,content})=>({role,content})) })
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error||'Error')
      const aiText = d.text

      // Parse strategy_config block
      const cfgMatch = aiText.match(/```strategy_config\n([\s\S]*?)```/)
      if (cfgMatch) {
        try {
          const cfg = JSON.parse(cfgMatch[1].trim())
          setPendingConfig(cfg)
          setPendingName(cfg.name||'Estrategia IA')
        } catch(_) {}
      }

      // Parse missing_feature block
      const missMatch = aiText.match(/```missing_feature\n([\s\S]*?)```/)
      if (missMatch) {
        try { setPendingMissing(JSON.parse(missMatch[1].trim())) } catch(_) {}
      }

      // Clean display text (remove code blocks for cleaner display)
      const displayText = aiText
        .replace(/```strategy_config[\s\S]*?```/g, '')
        .replace(/```missing_feature[\s\S]*?```/g, '')
        .trim()

      setMessages(prev=>[...prev, { role:'assistant', content:displayText, hasCfg:!!cfgMatch, hasMissing:!!missMatch }])
    } catch(e) {
      setMessages(prev=>[...prev, { role:'assistant', content:`Error: ${e.message}`, isError:true }])
    }
    setLoading(false)
    setTimeout(()=>inputRef.current?.focus(),100)
  }

  const applyConfig = () => {
    if (!pendingConfig) return
    const { name, ...defn } = pendingConfig
    onApply(defn, name)
    setMessages(prev=>[...prev, {
      role:'assistant',
      content:`✓ Configuración aplicada al constructor de estrategias. Puedes revisar y ajustar cada paso manualmente. ${name ? `Nombre: "${name}"` : ''}`
    }])
    setPendingConfig(null)
  }

  const copyMissingCode = () => {
    if (!pendingMissing) return
    const code = JSON.stringify(pendingMissing, null, 2)
    navigator.clipboard?.writeText(code)
    setMessages(prev=>[...prev,{role:'assistant',content:'📋 Código copiado al portapapeles. Pásalo al desarrollador para implementar la funcionalidad.'}])
  }

  const MSG_BG = { user:'rgba(0,212,255,0.08)', assistant:'rgba(13,21,32,0.6)' }
  const MSG_BORDER = { user:'rgba(0,212,255,0.25)', assistant:'rgba(26,45,69,0.6)' }

  return (
    <div style={{
      position:'fixed', inset:0, zIndex:800,
      display:'flex', alignItems:'stretch', justifyContent:'flex-end',
      pointerEvents:'none'
    }}>
      {/* Backdrop */}
      <div style={{position:'absolute',inset:0,background:'rgba(0,0,0,0.4)',pointerEvents:'all'}}
        onClick={onClose}/>

      {/* Panel */}
      <div style={{
        position:'relative', width:420, maxWidth:'90vw',
        display:'flex', flexDirection:'column',
        background:'#0a101a', borderLeft:'1px solid #1a2d45',
        boxShadow:'-8px 0 40px rgba(0,0,0,0.6)',
        pointerEvents:'all', zIndex:1
      }}>
        {/* Header */}
        <div style={{
          padding:'12px 16px', borderBottom:'1px solid #1a2d45',
          display:'flex', alignItems:'center', gap:10, flexShrink:0
        }}>
          <div style={{
            width:28,height:28,borderRadius:'50%',
            background:'linear-gradient(135deg,#9b72ff,#00d4ff)',
            display:'flex',alignItems:'center',justifyContent:'center',
            fontSize:14,flexShrink:0
          }}>✦</div>
          <div style={{flex:1}}>
            <div style={{fontFamily:MONO,fontSize:12,fontWeight:700,color:'#e2eaf5'}}>Asistente de Estrategias</div>
            <div style={{fontFamily:MONO,fontSize:9,color:'#4a7fa0'}}>Powered by Groq · llama-3.3-70b</div>
          </div>
          <button onClick={onClose} style={{background:'none',border:'none',color:'#5a7a95',fontSize:16,cursor:'pointer',padding:'2px 6px'}}>✕</button>
        </div>

        {/* Messages */}
        <div style={{flex:1,overflowY:'auto',padding:'12px 14px',display:'flex',flexDirection:'column',gap:10}}>
          {messages.map((m,i)=>(
            <div key={i} style={{
              background:MSG_BG[m.role]||MSG_BG.assistant,
              border:`1px solid ${MSG_BORDER[m.role]||MSG_BORDER.assistant}`,
              borderRadius:m.role==='user'?'8px 8px 2px 8px':'8px 8px 8px 2px',
              padding:'8px 12px', alignSelf:m.role==='user'?'flex-end':'flex-start',
              maxWidth:'90%'
            }}>
              <div style={{fontFamily:MONO,fontSize:11,color:m.isError?'#ff4d6d':'#cce0f5',lineHeight:1.65,whiteSpace:'pre-wrap'}}>
                {m.content}
              </div>
              {m.hasCfg&&pendingConfig&&(
                <div style={{marginTop:8,display:'flex',gap:6,alignItems:'center'}}>
                  <div style={{fontFamily:MONO,fontSize:9,color:'#00e5a0',flex:1}}>
                    ✓ Configuración lista: "{pendingName}"
                  </div>
                  <button onClick={applyConfig} style={{
                    background:'rgba(0,229,160,0.15)',border:'1px solid #00e5a0',
                    color:'#00e5a0',fontFamily:MONO,fontSize:10,fontWeight:700,
                    padding:'4px 10px',borderRadius:4,cursor:'pointer',whiteSpace:'nowrap'
                  }}>⚡ Aplicar al Builder</button>
                </div>
              )}
              {m.hasMissing&&pendingMissing&&(
                <div style={{marginTop:8}}>
                  <div style={{fontFamily:MONO,fontSize:9,color:'#ffd166',marginBottom:4}}>
                    ⚠ Funcionalidad no disponible: {pendingMissing.description}
                  </div>
                  <button onClick={copyMissingCode} style={{
                    background:'rgba(255,209,102,0.1)',border:'1px solid #ffd166',
                    color:'#ffd166',fontFamily:MONO,fontSize:10,
                    padding:'4px 10px',borderRadius:4,cursor:'pointer'
                  }}>📋 Copiar código para el desarrollador</button>
                </div>
              )}
            </div>
          ))}
          {loading&&(
            <div style={{alignSelf:'flex-start',background:'rgba(13,21,32,0.6)',border:'1px solid #1a2d45',
              borderRadius:'8px 8px 8px 2px',padding:'8px 14px',fontFamily:MONO,fontSize:11,color:'#4a7fa0'}}>
              <span style={{animation:'pulse 1.2s infinite'}}>⟳ Pensando...</span>
            </div>
          )}
          <div ref={messagesEndRef}/>
        </div>

        {/* Input */}
        <div style={{padding:'10px 14px',borderTop:'1px solid #1a2d45',flexShrink:0}}>
          <div style={{display:'flex',gap:8,alignItems:'flex-end'}}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e=>setInput(e.target.value)}
              onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}}}
              placeholder="Describe tu estrategia... (Enter=enviar, Shift+Enter=nueva línea)"
              rows={2}
              style={{
                flex:1,background:'#080c14',border:'1px solid #1a2d45',borderRadius:5,
                color:'#e2eaf5',fontFamily:MONO,fontSize:11,padding:'8px 10px',
                resize:'none',lineHeight:1.5,
                outline:'none',transition:'border-color .15s',
              }}
              onFocus={e=>e.target.style.borderColor='#2a4a66'}
              onBlur={e=>e.target.style.borderColor='#1a2d45'}
            />
            <button onClick={send} disabled={loading||!input.trim()} style={{
              background:loading||!input.trim()?'rgba(26,45,69,0.5)':'linear-gradient(135deg,#9b72ff,#00d4ff)',
              border:'none',borderRadius:5,color:loading||!input.trim()?'#3d5a7a':'#080c14',
              fontFamily:MONO,fontSize:16,fontWeight:700,
              padding:'8px 14px',cursor:loading||!input.trim()?'not-allowed':'pointer',
              transition:'all .15s',flexShrink:0,alignSelf:'stretch'
            }}>➤</button>
          </div>
          <div style={{fontFamily:MONO,fontSize:9,color:'#3d5a7a',marginTop:5}}>
            {getGroqKey()?'✓ API Key configurada':'⚠ Sin API Key — configúrala en ⚙ Configuración → Integraciones'}
          </div>

        </div>
      </div>
    </div>
  )
}
