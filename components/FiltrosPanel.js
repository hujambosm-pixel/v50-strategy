import { useState, useRef, useEffect } from 'react'
import { MONO } from '../lib/utils'
import { FILTROS_CATALOGO, defDe, nuevoFiltro, filtrosDe, cuentaActivos, tiposDisponibles } from '../lib/filtros'

// Cómo encaja la sección en su panel. Son las únicas diferencias reales entre los dos sitios donde
// se pinta: en el panel de estrategias el contenedor cierra la sección con su propio borde y la
// cabecera solo se separa del cuerpo al desplegarse; en el de multicartera va encajada entre otras
// secciones, así que los bordes los ponen la cabecera y el cuerpo.
const VARIANTES = {
  panel: { wrap: { borderBottom: '1px solid var(--border)', flexShrink: 0 }, padX: 10, bordeCabeceraSiempre: false, bordeCuerpo: false },
  mc:    { wrap: { flexShrink: 0 },                                          padX: 12, bordeCabeceraSiempre: true,  bordeCuerpo: true  },
}

const fInp = { background:'#0a1520', border:'1px solid #1a3d5a', borderRadius:3, color:'var(--text)',
  fontFamily:MONO, fontSize:9, padding:'1px 3px', boxSizing:'border-box', outline:'none', width:'100%' }
const plbl = { fontFamily:MONO, fontSize:8, color:'var(--text2)', whiteSpace:'nowrap' }
// Etiqueta y campo, pegados. Antes el envoltorio era `display:'contents'`, que no genera caja: los
// dos quedaban como items de flex hermanos e independientes y el salto de línea podía caer JUSTO
// entre ellos —"Mín" al final de una línea y su casilla al principio de la siguiente—. Con una caja
// propia que no encoge, la pareja es indivisible y el salto solo puede caer entre parejas.
const par = { display:'inline-flex', alignItems:'center', gap:3, flexShrink:0 }
// Los ▲▼ de Chrome miden ~13px y se SUPERPONEN al texto: en un campo estrecho tapaban el último
// dígito. Se ocultan por dos motivos: para que el valor se lea entero con los anchos nuevos, y
// porque viven pegados al borde derecho, donde es fácil pinchar ▼ al ir a poner el cursor al final.
// No tiene nada que ver con la rueda —eso lo resuelve el onWheel de CampoNumero, y está medido que
// ocultar el botón por sí solo no la detenía—. Va en una etiqueta <style> y no en el estilo inline
// porque es un pseudo-elemento, y con clase propia para no tocar los type=number del resto de la app.
const CLASE_NUM = 'fltNum'
const CSS_NUM = `.${CLASE_NUM}::-webkit-outer-spin-button,.${CLASE_NUM}::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}.${CLASE_NUM}{-moz-appearance:textfield}`
const toggleBtn = (active) => ({ display:'inline-flex', alignItems:'center', justifyContent:'center',
  width:28, height:14, borderRadius:7, flexShrink:0, cursor:'pointer', transition:'background 0.15s',
  background:active?'#00e5a0':'#1a2d45', position:'relative' })
const toggleKnob = (active) => ({ position:'absolute', width:10, height:10, borderRadius:'50%',
  background:active?'#fff':'#7a9bc0', left:active?16:2, transition:'left 0.15s' })
const lbl = (active) => ({ fontFamily:MONO, fontSize:11, color:active?'var(--text)':'var(--text2)', flex:1 })
// Cómo se combinan los filtros de una sección. Estaba siempre a la vista bajo cada sección y
// ocupaba tres líneas; con dos secciones, seis líneas permanentes en una barra lateral estrecha.
// Ahora cuelga del título de la sección como tooltip.
const AYUDA_AND = 'AND — todos los filtros activos en verde para permitir entrada. Zonas bloqueadas en rojo en el gráfico.'

const ivBtn = (on, semanal=false) => ({ fontFamily:MONO, fontSize:9, padding:'1px 3px', borderRadius:3, cursor:'pointer',
  border:`1px solid ${on?(semanal?'#a07820':'#2d6e4e'):'#1a3d5a'}`,
  background:on?(semanal?'rgba(240,192,64,0.12)':'rgba(76,175,130,0.12)'):'transparent',
  color:on?(semanal?'#f0c040':'#4caf82'):'var(--text2)' })

// Campo numérico de un filtro. Tiene componente propio porque necesita estado propio: el BORRADOR
// de lo que se está tecleando, que no puede vivir en `filtros` sin contaminar el backend.
// Antes el valor iba al estado en cada pulsación con `Number(x) || fallback`, y eso confundía el
// campo VACÍO con el CERO: borrarlo entero para reescribirlo lo devolvía al fallback en mitad de la
// edición, y el 0 de «Mín» era inalcanzable porque 0 es falsy —bastaba bajar de 1 a 0 con la rueda
// para que el campo saltara a 55—.
// Las reglas, y el porqué de cada una:
//  · Mientras se teclea NO se acota. Acotar por pulsación haría imposible escribir cifras de varios
//    dígitos: en un campo de mínimo 2, el «1» de «100» saltaría a 2 antes del siguiente dígito.
//  · Se acota al CONFIRMAR: al salir del campo o al pulsar Enter. Un clic en cualquier botón provoca
//    antes el blur, así que no hay forma de lanzar un backtest con un valor sin acotar.
//  · Al estado solo viajan NÚMEROS. El borrador vacío se queda dentro del componente, así que ni
//    localStorage ni el backend ven jamás un '' — que además de no ser un número rompería la
//    evaluación en silencio: `?? ` no lo captura, y `v <= ''` se compara contra 0.
//  · Salir dejándolo vacío no cambia nada: se recupera el último valor válido, que es el que sigue
//    en `params` porque el vacío nunca llegó a escribirse. Cancelar es lo menos sorprendente aquí:
//    no hay valor «neutro» que un filtro pueda usar, y el fallback del catálogo tampoco lo es
//    —el de indiceEma.periodo es 200 cuando su default es 10—.
//  · La RUEDA quita el foco. Un input type=number enfocado hace stepDown con la rueda Y se come el
//    evento: el panel no bajaba y el número sí, sin que se notara. Sin foco el input la ignora y el
//    gesto sigue su camino hasta el panel, que es lo que se pretendía. preventDefault también lo
//    pararía, pero se tragaría además el scroll, que es justo lo que el usuario quería hacer.
//  · Las FLECHAS del teclado se DEJAN: exigen enfocar el campo a propósito —son un gesto deliberado,
//    no un efecto colateral de otro—, son la forma estándar y accesible de ajustar un number, y el
//    navegador ya las acota solo al min/max del input.
function CampoNumero({ campo: c, valor, onCommit, style }) {
  const [borrador, setBorrador] = useState(null)   // null = no se está editando; se muestra el estado
  const n0 = Number(valor)
  const actual = Number.isFinite(n0) ? n0 : c.fallback   // el fallback solo cubre un param corrupto
  const acota = (n) => Math.min(c.max ?? Infinity, Math.max(c.min ?? -Infinity, n))
  const valido = (s) => { const n = Number(s); return s.trim() !== '' && Number.isFinite(n) ? n : null }

  const confirmar = () => {
    if (borrador != null) { const n = valido(borrador); if (n != null) onCommit(acota(n)) }
    setBorrador(null)
  }
  return (
    <input type="number" className={CLASE_NUM} min={c.min} max={c.max} step={1}
      value={borrador ?? String(actual)}
      onChange={e => {
        const v = e.target.value
        setBorrador(v)
        const n = valido(v)
        if (n != null) onCommit(n)   // sin acotar: eso es cosa de confirmar
      }}
      onWheel={e => e.currentTarget.blur()}
      onBlur={confirmar}
      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}   // el blur ya confirma
      style={style}/>
  )
}

// Una sección de filtros: un ámbito, en un sitio. Se instancia cuatro veces (mercado y activo, en
// el panel de estrategias y en el de multicartera), y las cuatro comparten el mismo estado `filtros`.
export default function FiltrosPanel({ ambito, titulo, filtros, setFiltros, open, setOpen, variant='panel', aviso=null }) {
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
  const conDefaults = (f) => ({ ...defDe(f.tipo, f.ambito).params, ...(f.params || {}) })
  const toggle = (id) => setFiltros(p => (p || []).map(f => f.id === id ? { ...f, activo: !f.activo } : f))
  const setParam = (id, campo, val) => setFiltros(p => (p || []).map(f =>
    f.id === id ? { ...f, params: { ...conDefaults(f), [campo]: val } } : f))

  return (
    <div style={V.wrap}>
      <style>{CSS_NUM}</style>
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
            el botón se abrevian a su número y a "+ ▾", con el texto en sus tooltips.
            La ayuda cuelga del propio título en vez de un (?) aparte: en esta cabecera no sobra un
            solo píxel —el caso con badge y aviso deja 5px— y los otros tres elementos ya explican
            lo suyo con `title` sin marca visual. `title` es pasivo, así que el clic sigue
            burbujeando al contenedor y la sección pliega igual. */}
        <span title={AYUDA_AND} style={{fontFamily:MONO,fontSize:12,color:anyOn?'#00e5a0':'#c8dff5',fontWeight:600,letterSpacing:'0.05em',whiteSpace:'nowrap',flexShrink:0}}>{titulo}</span>
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
                  {defDe(t, ambito).label}
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
            const def=defDe(f.tipo, f.ambito)
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
                  <div style={{display:'flex',alignItems:'center',flexWrap:'wrap',gap:4,rowGap:4,paddingLeft:34}}>
                    {def.campos.map(c=>(
                      <span key={c.k} style={par}>
                        <span style={plbl}>{c.etiqueta}</span>
                        {c.tipo==='texto'
                          ?<input type="text" value={p[c.k]}
                             onChange={e=>setParam(f.id,c.k,e.target.value.toUpperCase())}
                             style={{...fInp,width:c.ancho}}/>
                          :<CampoNumero campo={c} valor={p[c.k]}
                             onCommit={v=>setParam(f.id,c.k,v)}
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

        </div>
      )}
    </div>
  )
}
