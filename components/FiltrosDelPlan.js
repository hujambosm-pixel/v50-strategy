// components/FiltrosDelPlan.js — la caja «Filtros · cuándo se puede comprar» del bloque del plan (docs/builder.md §152; boceto
// bocetos/plan-valores-velas-filtros.html, aprobado el 14/11). Dos cajas:
//   · morada, «De la estrategia»: su «Solo opero cuando…», solo para leer, con «Se respetan / No se aplican» en este plan;
//   · azul, «Añadidos en este plan»: filas del catálogo de condiciones, las MISMAS del creador de estrategias (components/BuilderFila.js),
//     con de quién (este valor, un índice u otro símbolo) y con qué velas se mira.
// Al añadir el primer filtro, si la estrategia ya lleva los suyos, pregunta qué hacer con ellos. No calcula nada: solo cambia el ajuste
// `filtros` del plan (lib/builder/planPantalla.js §150), que el motor ya sabe aplicar (lib/planes/estrategia.js, definicionEfectiva).
//   estrategia: la del bloque ({ name, definition, params }); filtros: el ajuste (null o { propios?, filas }); onCambia(filtros nuevos);
//   velasPlan: 'diarias' | 'semanales'; valores: [{ simbolo, nombre }] con precios guardados (para «Otro símbolo…»).
//   inicial (para las pruebas de montaje): { ventana: 'catalogo' | 'pregunta', buscar, otro: k }.
import { useState, useEffect } from 'react'
import { B, S } from '../lib/builder/estilo'
import Ayuda from './BuilderAyuda'
import ConLimpiar from './LimpiarBusqueda'
import BuscadorValor from './BuscadorValor'
import { Pregunta } from './VentanaPregunta'
import { Fila, entrada, mini } from './BuilderFila'
import { buscaCatalogo, nombreCond, explicacionCond, INDICES } from '../lib/builder/tarjetas'
import { OTRO, filasDePantalla, respetaPropios, guardaFiltros, filaNuevaPlan, opcionesQuienPlan, soloDiaria, intervaloFila, filtrosPropios, fraseFilaPlan, erroresFilasPlan, filasRepetidas,
  AYUDA_FILTROS_PLAN, AYUDA_PROPIOS, AYUDA_QUIEN_PLAN, AYUDA_VELAS_FILA, TEXTO_SOLO_DIARIA } from '../lib/builder/filtrosPlan'

const MORADO = '#a371f7', AZUL = '#58a6ff'
const caja = (color) => ({ border: `1px solid ${B.borde}`, borderLeft: `3px solid ${color}`, borderRadius: B.radioBoton, background: B.fondo, padding: '10px 12px' })
const chip = (apagado) => ({ display: 'inline-block', border: `1px solid ${B.borde}`, borderRadius: 12, padding: '2px 10px', background: B.cabecera, color: B.texto, fontSize: 13, ...(apagado ? { opacity: 0.45, textDecoration: 'line-through' } : {}) })
const boton2 = (on) => ({ fontFamily: B.letra, fontSize: 13, padding: '4px 10px', cursor: 'pointer', border: `1px solid ${on ? B.siguienteBorde : B.borde}`, background: on ? B.siguienteFondo : 'transparent', color: on ? B.titulo : B.secundario, fontWeight: on ? 700 : 400 })

export default function FiltrosDelPlan({ estrategia, filtros, onCambia, velasPlan = 'diarias', valores = [], inicial = null }) {
  const [ventana, setVentana] = useState(inicial?.ventana || null)   // null | 'pregunta' | 'catalogo'
  const [soloPlan, setSoloPlan] = useState(false)   // respuesta «Solo los del plan»: se aplica al añadir la fila
  const [buscar, setBuscar] = useState(inicial?.buscar || '')
  const [otro, setOtro] = useState(inicial?.otro ?? null)   // la fila que está eligiendo «Otro símbolo…»
  const filas = filasDePantalla(filtros), respeta = respetaPropios(filtros), propios = filtrosPropios(estrategia)
  const errores = erroresFilasPlan(filas), repes = filasRepetidas(filas, propios, respeta)
  const pon = (fs, r = respeta) => onCambia(guardaFiltros(fs, r))
  const cambiaFila = (k, g) => pon(filas.map((x, j) => j === k ? g : x))
  const cierra = () => { setVentana(null); setSoloPlan(false); setBuscar('') }
  useEffect(() => {
    if (!ventana) return
    const tecla = (e) => { if (e.key === 'Escape') cierra() }
    document.addEventListener('keydown', tecla)
    return () => document.removeEventListener('keydown', tecla)
  }, [ventana])
  const pulsaMas = () => setVentana(!filas.length && propios.hay && propios.separables && respeta ? 'pregunta' : 'catalogo')
  const elige = (clave) => { pon([...filas, filaNuevaPlan(clave)], soloPlan ? false : respeta); cierra() }
  const nombre = estrategia?.name || 'La estrategia'
  const busqueda = buscaCatalogo(buscar)
  const condicion = (id) => (
    <div key={id} data-cond-plan={id} style={{ display: 'flex', alignItems: 'center', gap: 2, minWidth: 0 }}>
      <button type="button" onClick={() => elige(id)} title="Añadir este filtro al plan" style={{ ...S.enlace, color: B.texto, padding: '5px 8px', borderRadius: 5, flex: '1 1 auto', minWidth: 0 }}>{nombreCond(id)}</button>
      <Ayuda texto={explicacionCond(id)} etiqueta={nombreCond(id)} zIndice={3100}/>
    </div>
  )
  return (
    <div data-filtros-plan data-respeta={respeta ? 'si' : 'no'}>
      <div style={{ fontWeight: 600, color: B.titulo, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 2 }}>Filtros · cuándo se puede comprar<Ayuda texto={AYUDA_FILTROS_PLAN} etiqueta="Filtros · cuándo se puede comprar"/></div>
      {propios.hay ? (
        <div data-caja="estrategia" style={caja(MORADO)}>
          <div><strong style={{ color: B.titulo }}>De la estrategia</strong> <span style={S.secundario}>· su «Solo opero cuando…»</span></div>
          <div data-propios style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginTop: 6 }}>
            {propios.frases.length ? propios.frases.map((t, k) => <span key={k} data-propio style={chip(!respeta)}>{t}</span>) : <span style={S.secundario}>Lleva filtros propios (se ven en su pantalla).</span>}
            <span style={S.apagado}>· en velas {velasPlan}</span>
          </div>
          {propios.separables ? (
            <div data-modo-propios style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              <span style={S.secundario}>En este plan:</span>
              <span role="group" aria-label="Los filtros de la estrategia, en este plan" style={{ display: 'inline-flex' }}>
                <button type="button" aria-pressed={respeta} onClick={() => pon(filas, true)} style={{ ...boton2(respeta), borderRadius: '6px 0 0 6px' }}>Se respetan</button>
                <button type="button" aria-pressed={!respeta} onClick={() => pon(filas, false)} style={{ ...boton2(!respeta), borderRadius: '0 6px 6px 0', borderLeft: 'none' }}>No se aplican</button>
              </span>
              <Ayuda texto={AYUDA_PROPIOS} etiqueta="Los filtros de la estrategia, en este plan"/>
            </div>
          ) : <div data-no-separables style={{ ...S.apagado, marginTop: 8 }}>Forman parte de su regla y aquí no se pueden apagar: se respetan siempre.</div>}
        </div>
      ) : <div data-caja="sin-propios" style={{ ...caja(B.borde), color: B.secundario }}>Esta estrategia no lleva filtros propios.</div>}

      <div data-caja="plan" style={{ ...caja(AZUL), marginTop: 8 }}>
        <div><strong style={{ color: B.titulo }}>Añadidos en este plan</strong> <span style={S.secundario}>· cualquier condición del catálogo</span></div>
        {filas.map((f, k) => f.rara ? (
          <div key={k} data-fila-rara style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, color: B.secundario }}>
            <span style={{ flex: 1 }}>Un filtro que aquí no se puede editar.</span>
            <button type="button" style={{ ...S.enlace, color: B.apagado, fontSize: 18, lineHeight: 1 }} aria-label="Quitar este filtro" title="Quitar este filtro" onClick={() => pon(filas.filter((_, j) => j !== k))}>×</button>
          </div>
        ) : (
          <div key={k} data-fila-plan={k}>
            <Fila f={f} errores={errores[k]} valores={{}} tarjeta="filtro" color={AZUL} enVarias intervalo={intervaloFila(f, velasPlan)}
              quien={f.quien} opcionesDeQuien={opcionesQuienPlan(f.quien)} ayudaQuien={AYUDA_QUIEN_PLAN} onQuien={q => { if (q === OTRO) setOtro(k); else { setOtro(null); cambiaFila(k, { ...f, quien: q }) } }}
              extra={velasPlan === 'diarias' ? (
                <span data-velas-fila style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>
                  <select style={mini} aria-label="Con qué velas se mira" title={soloDiaria(f) ? TEXTO_SOLO_DIARIA : 'Con qué velas se mira este filtro'} value={f.velas === 'semanal' ? 'semanal' : 'diaria'} onChange={e => cambiaFila(k, { ...f, velas: e.target.value === 'semanal' ? 'semanal' : null })}>
                    <option value="diaria">velas diarias</option><option value="semanal" disabled={soloDiaria(f)}>velas semanales</option>
                  </select>
                  <Ayuda texto={AYUDA_VELAS_FILA} etiqueta="Con qué velas se mira"/>
                </span>
              ) : <span data-velas-fila style={{ ...S.apagado, flexShrink: 0 }}>velas semanales</span>}
              avisoCombinacion={repes.includes(k) ? { nivel: 'repetida', texto: 'Es igual que un filtro que ya lleva la estrategia: no cambia nada.' } : null}
              onCambia={g => cambiaFila(k, { ...g, quien: f.quien, velas: f.velas })} onQuita={() => { setOtro(null); pon(filas.filter((_, j) => j !== k)) }}/>
            {otro === k && (
              <div data-otro-simbolo style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
                <span style={S.secundario}>Símbolo:</span>
                <BuscadorValor valores={valores} valor={f.quien !== 'valor' && !INDICES.some(i => i.t === f.quien) ? f.quien : ''} onCambia={s => { cambiaFila(k, { ...f, quien: s }); setOtro(null) }} etiqueta="Símbolo del filtro"/>
                <button type="button" style={{ ...S.enlace, fontSize: 13, color: B.secundario }} onClick={() => setOtro(null)}>Cancelar</button>
              </div>
            )}
          </div>
        ))}
        {!filas.length && <div data-sin-filtros style={{ ...S.secundario, marginTop: 6 }}>Ninguno.</div>}
        <div style={{ marginTop: 10 }}><button type="button" data-boton="anadir-filtro" style={{ ...S.boton, padding: '6px 11px', fontSize: 13 }} onClick={pulsaMas}>+ Añadir filtro</button></div>
      </div>

      {ventana === 'pregunta' && (
        <Pregunta id="filtros-propios" texto={`«${nombre}» ya lleva filtros propios`}
          detalle="Vas a añadir un filtro en el plan. ¿Qué hago con los de la estrategia? Podrás cambiarlo después en la caja «De la estrategia»."
          extra={<div data-propios-pregunta style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>{propios.frases.map((t, k) => <span key={k} style={chip(false)}>{t}</span>)}</div>}>
          <button type="button" data-respuesta="cancelar" style={S.boton} onClick={cierra}>Cancelar</button>
          <button type="button" data-respuesta="solo" style={S.boton} onClick={() => { setSoloPlan(true); setVentana('catalogo') }}>Solo los del plan</button>
          <button type="button" data-respuesta="ambos" style={S.botonVerde} onClick={() => { setSoloPlan(false); setVentana('catalogo') }}>Respetar los dos</button>
        </Pregunta>
      )}
      {ventana === 'catalogo' && (
        <div data-catalogo-plan role="dialog" aria-modal="true" aria-label="Añadir filtro" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onMouseDown={e => { if (e.target === e.currentTarget) cierra() }}>
          <div style={{ ...S.tarjeta, padding: 20, maxWidth: 680, width: '100%', maxHeight: '86vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ color: B.titulo, fontWeight: 700, fontSize: 16 }}>Añadir filtro · elige una condición</div>
            <div style={{ ...S.secundario, fontSize: 13, margin: '4px 0 10px' }}>El mismo catálogo que al crear una estrategia. Después eliges de quién es y sus números.</div>
            <ConLimpiar valor={buscar} onLimpia={() => setBuscar('')} bloque><input aria-label="Buscar condiciones" placeholder="Buscar: caída, media, volumen…" value={buscar} onChange={e => setBuscar(e.target.value)} data-buscar="catalogo-plan" style={{ ...entrada, width: '100%', boxSizing: 'border-box' }}/></ConLimpiar>
            <div data-lista-catalogo style={{ overflowY: 'auto', marginTop: 10, minHeight: 0 }}>
              {!busqueda.grupos.length && !busqueda.explicacion.length && <div style={S.apagado}>Nada coincide con «{buscar}».</div>}
              {busqueda.grupos.map(g => (
                <div key={g.id} data-grupo-plan={g.id} style={{ marginBottom: 10 }}>
                  <div style={{ color: B.secundario, fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase', padding: '2px 8px' }}>{g.titulo}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0 14px' }}>{g.conds.map(condicion)}</div>
                </div>
              ))}
              {buscar.trim() && busqueda.explicacion.length > 0 && (
                <div data-busqueda-plan="explicacion" style={{ marginBottom: 10 }}>
                  <div style={{ color: B.secundario, fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase', padding: '2px 8px' }}>Lo mencionan en su explicación</div>
                  {busqueda.explicacion.map(x => (
                    <div key={x.clave}>{condicion(x.clave)}<div style={{ ...S.apagado, padding: '0 8px 4px' }}>{x.antes}<mark style={{ background: '#5a4a12', color: B.titulo, borderRadius: 3, padding: '0 2px' }}>{x.palabra}</mark>{x.despues}</div></div>
                  ))}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}><button type="button" data-respuesta="cancelar-catalogo" style={S.boton} onClick={cierra}>Cancelar</button></div>
          </div>
        </div>
      )}
    </div>
  )
}
