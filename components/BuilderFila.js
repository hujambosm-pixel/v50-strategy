// components/BuilderFila.js — la FILA DE CONDICIÓN del Builder en una línea («Cierre [> ▾] SMA ( [200] )»), con su número que se
// escribe con coma, su menú «…» y el botón 🔗 de los parámetros enlazados. Nació dentro de components/BuilderEditor.js (el creador de
// estrategias) y se sacó aquí TAL CUAL (docs/builder.md §151) para que la use también el bloque del plan (los filtros del plan).
import { useState, useEffect, useRef } from 'react'
import { B, S } from '../lib/builder/estilo'
import { CONDICIONES_EDITOR } from '../lib/editor/definicion'
import { soloDelValor, avisoSoloValor, ayudaFila, AYUDA_NO, AYUDA_CRUZA, nombreCond, nombreQuien, AYUDA_QUIEN, opcionesQuien, plantillaFila, opcionesOp, opDe, opDesactivada, conOp, conVuelta, conCruce, puedeVuelta, puedeCruce, conNumero, tieneLado, notaFila,
  aTexto, deTexto, GRUPOS_FUERZA, avisoFila } from '../lib/builder/tarjetas'
import Ayuda from './BuilderAyuda'
import { AYUDA_ENLACE } from '../lib/builder/enlaces'

const MORADO = '#a371f7', ROJO = '#ff8b8b', AMARILLO = '#f2cc60'
export const ASA = '⠿'   // seis puntos
export const entrada = { fontFamily: B.letra, fontSize: B.base, background: B.fondo, color: B.texto, border: `1px solid ${B.borde}`, borderRadius: B.radioBoton, padding: '5px 8px', width: 'auto' }
export const mini = { ...entrada, padding: '2px 4px', fontSize: 13, width: 'auto', display: 'inline-block' }
export const esParametro = (x) => typeof x === 'string' && x.startsWith('$')
export const val = (x, valores) => esParametro(x) ? valores[x.slice(1)] : x

// Un número que se escribe con coma: el texto vive aquí mientras se escribe; fuera llega el número (o el texto si no lo es).
export function Numero({ valor, onCambia, error, etiqueta }) {
  const [t, setT] = useState(aTexto(valor))
  useEffect(() => { if (deTexto(t) !== valor) setT(aTexto(valor)) }, [valor])
  return <input type="text" inputMode="decimal" value={t} aria-label={etiqueta} aria-invalid={!!error} onChange={e => { setT(e.target.value); onCambia(deTexto(e.target.value)) }}
    style={{ ...mini, width: `${Math.max(2, String(t).length) + 2}ch`, minWidth: 0, textAlign: 'right', ...(error ? { borderColor: ROJO } : {}) }}/>
}

// El menú «…» de una fila: darle (o quitarle) la vuelta y, en las condiciones sin símbolo, «solo la vela en que empieza».
// V9.1045: el menú va con posición FIJA (como el «?»), por encima de todo: la fila tiene desplazamiento horizontal y lo recortaba.
// Se abre hacia abajo y, si no cabe, hacia arriba; se cierra al tocar fuera o al desplazar la página.
export function Menu({ f, onCambia, abiertoInicial = false, onSubir = null, onBajar = null }) {
  const [abierto, setAbierto] = useState(abiertoInicial)
  const [pos, setPos] = useState(null)
  const boton = useRef(null), caja = useRef(null)
  const abre = () => {
    const r = boton.current?.getBoundingClientRect()
    if (r) setPos({ right: Math.max(8, window.innerWidth - r.right), ...(window.innerHeight - r.bottom < 120 ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }) })
    setAbierto(true)
  }
  useEffect(() => {
    if (!abierto) return
    const fuera = (e) => { if (!caja.current?.contains(e.target) && !boton.current?.contains(e.target)) setAbierto(false) }
    const cierra = () => setAbierto(false)
    document.addEventListener('mousedown', fuera); document.addEventListener('touchstart', fuera); window.addEventListener('scroll', cierra, true)
    return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('touchstart', fuera); window.removeEventListener('scroll', cierra, true) }
  }, [abierto])
  return (
    <span style={{ flexShrink: 0 }}>
      <button ref={boton} style={{ ...S.enlace, color: B.apagado, padding: '0 4px' }} aria-label="Más opciones de la fila" aria-expanded={abierto} onClick={() => abierto ? setAbierto(false) : abre()}>…</button>
      {abierto && (
        <span ref={caja} data-menu-fila style={{ position: 'fixed', zIndex: 1000, ...(pos || {}), background: B.cabecera, border: `1px solid ${B.borde}`, borderRadius: B.radioBoton, padding: 8, display: 'flex', flexDirection: 'column', gap: 6, whiteSpace: 'nowrap', boxShadow: '0 6px 20px rgba(0,0,0,0.5)' }}>
          <button style={{ ...S.enlace, ...(puedeVuelta(f) ? {} : { color: B.apagado, cursor: 'default' }) }} disabled={!puedeVuelta(f)} onClick={() => { onCambia(conVuelta(f)); setAbierto(false) }}>{f.env === 'NO' ? 'Quitarle la vuelta (NO)' : 'Darle la vuelta (NO)'}</button>
          {!puedeVuelta(f) && <span style={{ ...S.apagado, fontSize: 12, whiteSpace: 'normal', maxWidth: 260 }}>Una fila que se cumple solo la vela del cruce no se puede dar la vuelta: elige el cruce contrario en el símbolo.</span>}
          {!tieneLado(f.cond.c) && <button style={{ ...S.enlace, ...(puedeCruce(f) ? {} : { color: B.apagado, cursor: 'default' }) }} disabled={!puedeCruce(f)} onClick={() => { onCambia(conCruce(f)); setAbierto(false) }}>{f.env === 'cruza' ? 'Cada vela que se cumpla' : 'Solo la vela en que empieza a cumplirse (cruza)'}</button>}
          {!tieneLado(f.cond.c) && !puedeCruce(f) && <span style={{ ...S.apagado, fontSize: 12, whiteSpace: 'normal', maxWidth: 260 }}>Quítale primero la vuelta (NO) para elegir «solo la vela en que empieza».</span>}
          {(onSubir || onBajar) && <span style={{ borderTop: `1px solid ${B.borde}`, margin: '2px 0' }}/>}
          {(onSubir || onBajar) && <button style={{ ...S.enlace, ...(onSubir ? {} : { color: B.apagado, cursor: 'default' }) }} disabled={!onSubir} onClick={() => { onSubir?.(); setAbierto(false) }}>Subir</button>}
          {(onSubir || onBajar) && <button style={{ ...S.enlace, ...(onBajar ? {} : { color: B.apagado, cursor: 'default' }) }} disabled={!onBajar} onClick={() => { onBajar?.(); setAbierto(false) }}>Bajar</button>}
        </span>
      )}
    </span>
  )
}

// Una fila de condición en UNA línea: «Cierre [> ▾] SMA ( [200] )», con la nota gris, el «?», el menú «…» y la ×; el error,
// debajo. quien / onQuien: el selector «de quién» de «Solo opero cuando…».
// asa (V9.1049): las props de arrastre de la fila (onDragStart…) o null; onSubir / onBajar: los del menú «…»; avisoExtra: una nota
// debajo (la de las filas de índice).
// onValor(nombre, v) (V9.1053): cuando el número de la casilla es un parámetro con nombre («$ema»), se cambia su valor y la fila
// sigue diciendo «$ema»; así, si se vuelve a dejar como estaba, la estrategia es la guardada, byte a byte.
// §152 (para los filtros del plan; el creador no los pasa): opcionesDeQuien ([{ v, t }]: otras opciones del selector «de quién»), ayudaQuien
// (su «?») extra (algo más en la línea, tras los números: con qué velas se mira) y enVarias (la línea puede partirse: la columna del plan es estrecha).
// V9.1067: el botón 🔗 de un uso enlazable (lib/builder/enlaces.js): enlazado (pulsar lo suelta) o suelto (pulsar lo enlaza); con su «?».
export function BotonEnlace({ estado, onClick }) {
  if (!estado) return null
  const enl = estado === 'enlazado'
  return (
    <span data-enlace={estado} style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>
      <button type="button" onClick={onClick} aria-pressed={enl} aria-label={enl ? 'Enlazada: pulsa para soltarla y darle números propios' : 'Suelta: pulsa para enlazarla (toma los números del grupo)'}
        title={enl ? 'Enlazada con las demás filas del mismo indicador: pulsa para soltarla' : 'Suelta (números propios): pulsa para enlazarla'}
        style={{ ...S.enlace, padding: '0 3px', fontSize: 14, lineHeight: 1, opacity: enl ? 1 : 0.4, textDecoration: enl ? 'none' : 'line-through' }}>🔗</button>
      <Ayuda texto={AYUDA_ENLACE} etiqueta="Parámetros enlazados"/>
    </span>
  )
}
export function Fila({ f, errores, valores, tarjeta, color, onCambia, onValor, onQuita, quien, onQuien, menuAbierto = false, ayudaAbierta = false, intervalo = 'diario', asa = null, onSubir = null, onBajar = null, avisoExtra = null, enlace = null, avisoCombinacion = null, opcionesDeQuien = null, ayudaQuien = AYUDA_QUIEN, extra = null, enVarias = false }) {
  const p = f.cond.p || {}, decl = Object.fromEntries((CONDICIONES_EDITOR[f.cond.c]?.parametros || []).map(d => [d.clave, d]))
  const hay = Object.keys(errores).length > 0
  const campo = (c, j) => {
    if (typeof c === 'string') return <span key={j}>{c}</span>
    if (c.tipo === 'grupoFuerza') return <select key={j} style={mini} aria-label="Comparado con" value={GRUPOS_FUERZA[0].id} onChange={() => {}} title="El grupo de valores con el que se compara (hoy, solo el Nasdaq-100)">{GRUPOS_FUERZA.map(g => <option key={g.id} value={g.id}>{g.nombre}</option>)}</select>
    if (c.tipo === 'op') return <select key={j} style={mini} aria-label="Símbolo" value={opDe(f)} onChange={e => onCambia(conOp(f, e.target.value))} title={AYUDA_CRUZA}>{opcionesOp(f.cond.c).map(o => <option key={o} value={o} disabled={opDesactivada(f, o)}>{o}</option>)}</select>
    if (c.tipo === 'media' || c.tipo === 'opcion') return <select key={j} style={mini} aria-label={decl[c.k]?.etiqueta} value={p[c.k] ?? decl[c.k]?.defecto} onChange={e => onCambia(conNumero(f, c.k, e.target.value))}>{(decl[c.k]?.opciones || []).map(o => <option key={o} value={o}>{decl[c.k]?.nombres?.[o] ?? o}</option>)}</select>
    return <Numero key={j} valor={val(p[c.k], valores)} error={errores[c.k]} etiqueta={decl[c.k]?.etiqueta} onCambia={v => esParametro(p[c.k]) && onValor ? onValor(p[c.k].slice(1), v) : onCambia(conNumero(f, c.k, v))}/>
  }
  return (
    <div data-fila={f.cond.c} data-error={hay ? 'si' : undefined} style={{ border: `1px solid ${hay ? ROJO : B.borde}`, borderLeft: `3px solid ${hay ? ROJO : color}`, borderRadius: B.radioBoton, padding: '6px 8px', marginTop: 8, background: B.fondo }}>
      <div data-linea style={enVarias ? { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', rowGap: 4 } : { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'nowrap', overflowX: 'auto', whiteSpace: 'nowrap' }}>
        {asa && <span data-asa draggable {...asa} title="Arrastra para mover la fila" aria-label="Mover la fila" style={{ cursor: 'grab', color: B.apagado, fontSize: 16, lineHeight: 1, padding: '0 2px', flexShrink: 0, userSelect: 'none' }}>{ASA}</span>}
        {onQuien && (
          <span style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>
            <select style={{ ...mini, color: MORADO }} aria-label="De quién" value={quien} onChange={e => onQuien(e.target.value)}>
              {(opcionesDeQuien || opcionesQuien(quien).map(t => ({ v: t, t: nombreQuien(t) }))).map(o => <option key={o.v} value={o.v} disabled={o.v !== 'valor' && soloDelValor(f.cond.c)}>{o.t}</option>)}
            </select>
            <Ayuda texto={ayudaQuien} etiqueta="De quién"/>
          </span>
        )}
        {f.env === 'NO' && <span data-no style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}><span style={{ fontSize: 11, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: '#3b1d22', color: ROJO }}>NO</span><Ayuda texto={AYUDA_NO} etiqueta="NO"/></span>}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: B.titulo, fontWeight: 600, flexShrink: 0 }}>{plantillaFila(f.cond.c).map(campo)}</span>
        {enlace}
        {extra}
        {f.env === 'cruza' && !tieneLado(f.cond.c) && <span style={{ fontSize: 12, color: B.secundario, flexShrink: 0 }}>(solo la vela en que empieza)</span>}
        <span style={{ marginLeft: 'auto', paddingLeft: 8, color: B.apagado, fontSize: 12 }}>{notaFila(f, valores, tarjeta, intervalo)}</span>
        <span style={{ flexShrink: 0 }}><Ayuda texto={ayudaFila(f)} etiqueta={nombreCond(f.cond.c)} abiertoInicial={ayudaAbierta}/></span>
        <Menu f={f} onCambia={onCambia} abiertoInicial={menuAbierto} onSubir={onSubir} onBajar={onBajar}/>
        <button style={{ ...S.enlace, color: B.apagado, fontSize: 18, lineHeight: 1, padding: '0 4px', flexShrink: 0 }} aria-label="Quitar esta condición" title="Quitar esta condición" onClick={onQuita}>×</button>
      </div>
      {onQuien && soloDelValor(f.cond.c) && <div data-solo-valor style={{ color: B.secundario, fontSize: 13, marginTop: 6 }}>{avisoSoloValor(f.cond.c)}</div>}
      {avisoFila(f.cond.c) && <div data-aviso-fila style={{ color: B.secundario, fontSize: 13, marginTop: 6 }}>{avisoFila(f.cond.c)}</div>}
      {avisoExtra && <div data-aviso-indices style={{ color: AMARILLO, fontSize: 13, marginTop: 6 }}>{avisoExtra}</div>}
      {avisoCombinacion && <div data-aviso-combinacion={avisoCombinacion.nivel} style={{ color: AMARILLO, fontSize: 13, marginTop: 6 }}>⚠ {avisoCombinacion.texto}</div>}
      {hay && <div data-error-fila style={{ color: ROJO, fontSize: 13, marginTop: 6 }}>{Object.values(errores).map((e, k) => <div key={k}>{e}</div>)}</div>}
    </div>
  )
}
