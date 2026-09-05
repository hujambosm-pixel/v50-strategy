import { useState, useRef, useEffect } from 'react'
import { MONO } from '../lib/utils'
import { FILTROS_CATALOGO, nuevoFiltro, filtrosDe, cuentaActivos, tiposDisponibles } from '../lib/filtros'

// Cómo encaja la sección en su panel. Son las únicas diferencias reales entre los dos sitios donde
// se pinta: en el panel de estrategias el contenedor cierra la sección con su propio borde y la
// cabecera solo se separa del cuerpo al desplegarse; en el de multicartera va encajada entre otras
// secciones, así que los bordes los ponen la cabecera y el cuerpo.
const VARIANTES = {
  panel: { wrap: { borderBottom: '1px solid var(--border)', flexShrink: 0 }, padX: 10, bordeCabeceraSiempre: false, bordeCuerpo: false },
  mc:    { wrap: { flexShrink: 0 },                                          padX: 12, bordeCabeceraSiempre: true,  bordeCuerpo: true  },
}

const fInp = { background:'#0a1520', border:'1px solid #1a3d5a', borderRadius:3, color:'var(--text)',
  fontFamily:MONO, fontSize:10, padding:'1px 4px', boxSizing:'border-box', outline:'none', width:'100%' }
const plbl = { fontFamily:MONO, fontSize:9, color:'var(--text2)', whiteSpace:'nowrap' }
const toggleBtn = (active) => ({ display:'inline-flex', alignItems:'center', justifyContent:'center',
  width:28, height:14, borderRadius:7, flexShrink:0, cursor:'pointer', transition:'background 0.15s',
  background:active?'#00e5a0':'#1a2d45', position:'relative' })
const toggleKnob = (active) => ({ position:'absolute', width:10, height:10, borderRadius:'50%',
  background:active?'#fff':'#7a9bc0', left:active?16:2, transition:'left 0.15s' })
const lbl = (active) => ({ fontFamily:MONO, fontSize:11, color:active?'var(--text)':'var(--text2)', flex:1 })
const ivBtn = (on, semanal=false) => ({ fontFamily:MONO, fontSize:9, padding:'1px 5px', borderRadius:3, cursor:'pointer',
  border:`1px solid ${on?(semanal?'#a07820':'#2d6e4e'):'#1a3d5a'}`,
  background:on?(semanal?'rgba(240,192,64,0.12)':'rgba(76,175,130,0.12)'):'transparent',
  color:on?(semanal?'#f0c040':'#4caf82'):'var(--text2)' })

// Una sección de filtros: un ámbito, en un sitio. Se instancia cuatro veces (mercado y activo, en
// el panel de estrategias y en el de multicartera), y las cuatro comparten el mismo estado `filtros`.
export default function FiltrosPanel({ ambito, titulo, filtros, setFiltros, open, setOpen, variant='panel', ayuda=true, aviso=null }) {
  const V = VARIANTES[variant] || VARIANTES.panel
  const items = filtrosDe(filtros, ambito)
  const onCnt = cuentaActivos(filtros, ambito)
  const anyOn = onCnt > 0
  const puedeAnadir = tiposDisponibles(filtros, ambito)
  // Símbolos que operaron SIN los filtros de este ámbito porque no se pudo descargar su serie
  // semanal. Es un fail-open: el backtest salió, pero para ellos el filtro no existió. Se avisa
  // también en la CABECERA porque la sección puede estar plegada, que es justo cuando pasaría
  // desapercibido.
  const avisoSims = Array.isArray(aviso) ? aviso : []
  const avisoTexto = avisoSims.length
    ? `${avisoSims.slice(0, 3).join(', ')}${avisoSims.length > 3 ? ` y ${avisoSims.length - 3} más` : ''}`
    : ''
  const avisoTitle = `No se pudo descargar la serie semanal de ${avisoSims.length === 1 ? 'este símbolo' : 'estos símbolos'}, así que operaron SIN los filtros de este ámbito:\n\n${avisoSims.join(', ')}\n\nEl resto de activos sí los aplicó. Vuelve a ejecutar para reintentar la descarga.`

  // Desplegable de añadir — mismo patrón que el "+ Añadir a lista" de WatchlistManager
  const [addOpen, setAddOpen] = useState(false)
  const addRef = useRef(null)
  useEffect(() => {
    if (!addOpen) return
    const h = e => { if (addRef.current && !addRef.current.contains(e.target)) setAddOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [addOpen])

  const anadir = (tipo) => {
    setFiltros(p => [...(p || []), nuevoFiltro(tipo, ambito, true)])
    setAddOpen(false)
    setOpen(true)   // sin esto el filtro recién añadido quedaría oculto bajo una cabecera plegada
  }
  const quitar = (id) => setFiltros(p => (p || []).filter(f => f.id !== id))
  // Parten del default del catálogo: si el elemento llegara con params incompletos, se completa en
  // vez de quedar con un único campo suelto.
  const conDefaults = (f) => ({ ...FILTROS_CATALOGO[f.tipo].params, ...(f.params || {}) })
  const toggle = (id) => setFiltros(p => (p || []).map(f => f.id === id ? { ...f, activo: !f.activo } : f))
  const setParam = (id, campo, val) => setFiltros(p => (p || []).map(f =>
    f.id === id ? { ...f, params: { ...conDefaults(f), [campo]: val } } : f))

  return (
    <div style={V.wrap}>
      {/* Cabecera: chevron, título, contador y el desplegable de añadir. Con la lista vacía esta
          fila es toda la sección. */}
      <div onClick={()=>setOpen(v=>!v)}
        style={{padding:`8px ${V.padX}px`,borderBottom:(V.bordeCabeceraSiempre||open)?'1px solid var(--border)':'none',display:'flex',alignItems:'center',gap:6,cursor:'pointer',background:'var(--bg2)',userSelect:'none'}}
        onMouseOver={e=>e.currentTarget.style.background='rgba(0,212,255,0.04)'}
        onMouseOut={e=>e.currentTarget.style.background='var(--bg2)'}>
        <span style={{fontFamily:MONO,fontSize:9,color:'#4a7a9a',width:10,flexShrink:0}}>{open?'▼':'▶'}</span>
        {/* El título es el ÚNICO hijo que podía envolver —los demás llevan flexShrink:0—, así que
            absorbía el sobrante partiéndose por sus espacios: "FILTROS DE MERCADO" caía a tres
            líneas en la barra lateral de 240px. Con nowrap ya no puede, y para que quepa el badge y
            el botón se abrevian a su número y a "+ ▾", con el texto en sus tooltips. */}
        <span style={{fontFamily:MONO,fontSize:12,color:anyOn?'#00e5a0':'#c8dff5',fontWeight:600,letterSpacing:'0.05em',whiteSpace:'nowrap',flexShrink:0}}>{titulo}</span>
        {anyOn&&<span title={`${onCnt} de ${items.length} filtro${items.length>1?'s':''} de esta sección ${onCnt>1?'están encendidos':'está encendido'}. Cuenta solo los ACTIVOS: los añadidos pero apagados no se aplican y no suman aquí.`}
          style={{fontFamily:MONO,fontSize:9,background:'rgba(0,229,160,0.18)',color:'#00e5a0',
          borderRadius:3,padding:'0 4px',lineHeight:'14px',flexShrink:0,cursor:'help'}}>
          {onCnt}
        </span>}
        {avisoSims.length>0&&<span title={avisoTitle}
          style={{fontFamily:MONO,fontSize:9,background:'rgba(255,209,102,0.12)',color:'#ffd166',
            borderRadius:2,padding:'1px 4px',lineHeight:'14px',flexShrink:0,cursor:'help'}}>
          ⚠{avisoSims.length}
        </span>}
        <div style={{position:'relative',marginLeft:'auto',flexShrink:0}} ref={addRef}
          onClick={e=>e.stopPropagation()}>
          <span onClick={()=>setAddOpen(v=>!v)} title="Añadir filtro"
            style={{fontFamily:MONO,fontSize:9,padding:'1px 6px',borderRadius:3,cursor:'pointer',
              border:'1px solid #3d5a7a',color:'#7aabcc',userSelect:'none',whiteSpace:'nowrap'}}>+ ▾</span>
          {addOpen&&(
            <div style={{position:'absolute',right:0,top:'100%',zIndex:200,marginTop:3,
              background:'var(--bg2)',border:'1px solid #3d5a7a',borderRadius:4,
              boxShadow:'0 4px 12px rgba(0,0,0,0.35)',minWidth:150,padding:'3px 0'}}>
              {puedeAnadir.map(t=>(
                <div key={t} onClick={()=>anadir(t)}
                  style={{padding:'5px 10px',fontFamily:MONO,fontSize:11,color:'#c8dff5',cursor:'pointer',whiteSpace:'nowrap'}}
                  onMouseOver={e=>e.currentTarget.style.background='rgba(0,212,255,0.08)'}
                  onMouseOut={e=>e.currentTarget.style.background='transparent'}>
                  {FILTROS_CATALOGO[t].label}
                </div>
              ))}
              {puedeAnadir.length===0&&(
                <div style={{padding:'5px 10px',fontFamily:MONO,fontSize:10,color:'var(--text2)',whiteSpace:'nowrap'}}>
                  {Object.keys(FILTROS_CATALOGO).some(t=>FILTROS_CATALOGO[t].ambitos.includes(ambito))
                    ? 'Ya están todos añadidos'
                    : 'Sin filtros para este ámbito'}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {open&&(
        <div style={{padding:`2px ${V.padX}px 8px`,display:'flex',flexDirection:'column',gap:7,...(V.bordeCuerpo?{borderBottom:'1px solid var(--border)'}:{})}}>

          {items.length===0&&(
            <div style={{fontFamily:MONO,fontSize:9,color:'var(--text2)',lineHeight:1.4,paddingTop:5}}>
              Sin filtros. Añade uno con «+ Añadir filtro».
            </div>
          )}

          {items.map(f=>{
            const def=FILTROS_CATALOGO[f.tipo]
            const p=conDefaults(f)
            return(
              <div key={f.id}>
                <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:f.activo?4:0}}>
                  <div style={toggleBtn(f.activo)} onClick={()=>toggle(f.id)}>
                    <div style={toggleKnob(f.activo)}/>
                  </div>
                  <span style={lbl(f.activo)}>{def.label}</span>
                  <span onClick={()=>quitar(f.id)} title={`Quitar ${def.label}`}
                    style={{fontFamily:MONO,fontSize:11,color:'#4a6a88',cursor:'pointer',padding:'0 3px',flexShrink:0,userSelect:'none'}}
                    onMouseOver={e=>e.currentTarget.style.color='#ff6b9d'}
                    onMouseOut={e=>e.currentTarget.style.color='#4a6a88'}>✕</span>
                </div>
                {f.activo&&(
                  <div style={{display:'flex',alignItems:'center',flexWrap:'wrap',gap:5,rowGap:4,paddingLeft:34}}>
                    {def.campos.map(c=>(
                      <span key={c.k} style={{display:'contents'}}>
                        <span style={plbl}>{c.etiqueta}</span>
                        {c.tipo==='texto'
                          ?<input type="text" value={p[c.k]}
                             onChange={e=>setParam(f.id,c.k,e.target.value.toUpperCase())}
                             style={{...fInp,width:c.ancho}}/>
                          :<input type="number" min={c.min} max={c.max} step={1} value={p[c.k]}
                             onChange={e=>setParam(f.id,c.k,Number(e.target.value)||c.fallback)}
                             style={{...fInp,width:c.ancho}}/>}
                      </span>
                    ))}
                    {def.intervaloConfigurable&&(
                      <span style={{display:'inline-flex',alignItems:'center',gap:3,flexShrink:0}}>
                        <button style={ivBtn(p.intervalo!=='semanal',false)} onClick={()=>setParam(f.id,'intervalo','diario')}>D</button>
                        <button style={ivBtn(p.intervalo==='semanal',true)} onClick={()=>setParam(f.id,'intervalo','semanal')}>S</button>
                      </span>
                    )}
                  </div>
                )}
              </div>
            )
          })}

          {avisoSims.length>0&&<div title={avisoTitle}
            style={{fontFamily:MONO,fontSize:9,color:'#ffd166',lineHeight:1.4,marginTop:1,cursor:'help'}}>
            ⚠ {avisoTexto} {avisoSims.length===1?'operó':'operaron'} sin este filtro: no se pudo descargar su serie semanal.
          </div>}

          {ayuda&&anyOn&&<div style={{fontFamily:MONO,fontSize:9,color:'var(--text2)',lineHeight:1.4,marginTop:1}}>
            AND — todos los filtros activos en verde para permitir entrada. Zonas bloqueadas en rojo en el gráfico.
          </div>}
        </div>
      )}
    </div>
  )
}
