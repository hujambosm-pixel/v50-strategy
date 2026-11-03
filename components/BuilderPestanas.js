// components/BuilderPestanas.js — la fila de PESTAÑAS DE PLANES del paso 3 (docs/builder.md, §54): una pestaña por plan abierto, con el nombre (recortado, con tooltip), duplicar, la
// papelera roja (borra el plan de la base) y × (solo lo quita de la vista); ● amarillo si tiene cambios sin guardar. Si no caben, «+N ▾» con las que no caben. Al final, «+ Añadir plan ▾»:
// «Crear nuevo plan» y todos los planes guardados, con buscador si hay más de 6. Solo pinta: lo que pasa al pulsar, en components/BuilderPlan.js. Qué cabe, en lib/builder/pestanasPlan.js.
//   pestanas: [{ clave, nombre, guardado, sucia }]; actual: la clave abierta; planes: las filas guardadas; abiertas: las claves abiertas; finales: { id: € al final, si está calculado }.
//   Avisa con onAbrir(clave), onDuplicar(clave), onBorrar(clave), onCerrar(clave), onCrear(), onAnadir(id). ancho, menuInicial y buscaInicial: para las pruebas de montaje.
import { useState, useEffect, useRef } from 'react'
import { B, S } from '../lib/builder/estilo'
import { ANCHO_ANADIR, ANCHO_NOMBRE_MAX, anchoPestana, claveDe, repartePestanas } from '../lib/builder/pestanasPlan'
import { coincide } from '../lib/builder/buscar'
import { euros, fechaCorta } from '../lib/builder/planPantalla'
import ConLimpiar from './LimpiarBusqueda'
import { Papelera } from './VentanaPregunta'

const AMARILLO = '#f2cc60'
export const MIN_PARA_BUSCAR = 6
export const SIN_GUARDAR_PESTANA = 'sin guardar: se perderá al recargar'
const IconoDuplicar = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
  </svg>)
const icono = { background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px 3px', display: 'inline-flex', alignItems: 'center', color: B.secundario, fontFamily: B.letra, fontSize: 16, lineHeight: 1 }
const menu = { position: 'absolute', top: '100%', zIndex: 40, marginTop: 4, padding: 6, background: B.tarjeta, border: `1px solid ${B.borde}`, borderRadius: B.radioBoton, boxShadow: '0 8px 24px rgba(0,0,0,0.45)', opacity: 1 }

// El menú se cierra al pulsar fuera o con Esc.
function useCierra(abierto, cierra) {
  const ref = useRef(null)
  useEffect(() => {
    if (!abierto) return
    const fuera = (e) => { if (ref.current && !ref.current.contains(e.target)) cierra() }
    const esc = (e) => { if (e.key === 'Escape') cierra() }
    document.addEventListener('mousedown', fuera); document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('keydown', esc) }
  }, [abierto])
  return ref
}

export default function BuilderPestanas({ pestanas = [], actual = null, planes = [], abiertas = [], finales = {}, onAbrir, onDuplicar, onBorrar, onCerrar, onCrear, onAnadir, ancho = null, menuInicial = null, buscaInicial = '' }) {
  const caja = useRef(null)
  const [medido, setMedido] = useState(1200)
  useEffect(() => {
    const el = caja.current; if (!el || ancho != null) return
    const mide = () => { const x = el.clientWidth; if (x > 0) setMedido(x) }
    mide()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(mide) : null
    ro?.observe(el)
    return () => ro?.disconnect()
  }, [])
  const [abierto, setAbierto] = useState(menuInicial)   // null | 'anadir' | 'mas'
  const [busca, setBusca] = useState(buscaInicial)
  const cierra = () => { setAbierto(null); setBusca('') }
  const refAnadir = useCierra(abierto === 'anadir', cierra), refMas = useCierra(abierto === 'mas', cierra)
  const casilla = useRef(null)
  useEffect(() => { if (abierto === 'anadir') casilla.current?.focus() }, [abierto])

  const claves = pestanas.map(p => p.clave), anchos = Object.fromEntries(pestanas.map(p => [p.clave, anchoPestana(p.nombre)]))
  const { visibles, ocultas } = repartePestanas(claves, anchos, (ancho ?? medido) - ANCHO_ANADIR, actual)
  const de = (c) => pestanas.find(p => p.clave === c)
  const vistas = planes.filter(p => coincide(busca, p.nombre))
  const conBuscador = planes.length > MIN_PARA_BUSCAR

  return (
    <div ref={caja} role="tablist" aria-label="Tus planes" data-fila-planes style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', minWidth: 0 }}>
      {visibles.map(c => { const p = de(c), on = c === actual, nombreLargo = p.guardado ? p.nombre : `${p.nombre} · ${SIN_GUARDAR_PESTANA}`; return (
        <span key={c} data-caja-pestana={c} style={{ display: 'inline-flex', alignItems: 'center', flex: 'none', gap: 1, borderRadius: B.radioBoton, padding: '0 4px 0 0', border: `1px solid ${on ? B.siguienteBorde : B.borde}`, background: on ? B.cabecera : 'transparent' }}>
          <button role="tab" data-pestana={c} aria-selected={on} title={nombreLargo} onClick={() => { if (!on) onAbrir?.(c) }}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: B.letra, fontSize: 13, padding: '6px 6px 6px 10px', display: 'inline-flex', alignItems: 'center', gap: 5, color: on ? B.titulo : B.secundario, fontWeight: on ? 700 : 400 }}>
            {p.sucia && <span data-sucia aria-label="Con cambios sin guardar" title="Con cambios sin guardar" style={{ color: AMARILLO, flex: 'none' }}>●</span>}
            <span style={{ display: 'inline-block', maxWidth: ANCHO_NOMBRE_MAX, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nombre}</span>
            {!p.guardado && <span data-sin-guardar-pestana style={{ color: AMARILLO, fontSize: 11, fontWeight: 400, flex: 'none' }}>sin guardar</span>}
          </button>
          <button data-duplicar={c} aria-label={`Duplicar ${p.nombre}`} title="Duplicar este plan" onClick={() => onDuplicar?.(c)} style={icono}><IconoDuplicar/></button>
          {p.guardado && <button data-papelera={c} aria-label={`Borrar ${p.nombre}`} title="Borrar este plan de la base" onClick={() => onBorrar?.(c)} style={icono}><Papelera tamano={15}/></button>}
          <button data-cerrar={c} aria-label={`Quitar ${p.nombre} de la vista`} title={p.guardado ? 'Quitar de la vista (el plan sigue guardado)' : 'Cerrar este plan sin guardar'} onClick={() => onCerrar?.(c)} style={icono}>×</button>
        </span>) })}
      {!!ocultas.length && (
        <span ref={refMas} style={{ position: 'relative', flex: 'none' }}>
          <button data-boton="mas-pestanas" aria-expanded={abierto === 'mas'} title="Las pestañas que no caben" onClick={() => setAbierto(x => x === 'mas' ? null : 'mas')} style={{ ...S.boton, padding: '6px 8px', fontSize: 13 }}>+{ocultas.length} ▾</button>
          {abierto === 'mas' && <div data-menu="mas" style={{ ...menu, left: 0, minWidth: 220, maxHeight: 320, overflowY: 'auto' }}>
            {ocultas.map(c => { const p = de(c); return <button key={c} data-oculta={c} title={p.nombre} onClick={() => { cierra(); onAbrir?.(c) }} style={{ ...S.enlace, display: 'block', width: '100%', textAlign: 'left', padding: '5px 6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.sucia ? '● ' : ''}{p.nombre}</button> })}
          </div>}
        </span>)}
      <span ref={refAnadir} style={{ position: 'relative', flex: 'none' }}>
        <button data-boton="anadir-plan" aria-expanded={abierto === 'anadir'} title="Crear un plan nuevo o abrir uno guardado" onClick={() => setAbierto(x => x === 'anadir' ? null : 'anadir')} style={{ ...S.enlace, fontSize: 13, margin: '0 6px', whiteSpace: 'nowrap' }}>+ Añadir plan ▾</button>
        {abierto === 'anadir' && <div data-menu="anadir" style={{ ...menu, ...((ancho ?? medido) < 500 ? { left: 0 } : { right: 0 }), width: 340, maxWidth: '86vw' }}>
          <button data-crear-plan onClick={() => { cierra(); onCrear?.() }} style={{ ...S.enlace, display: 'block', width: '100%', textAlign: 'left', fontWeight: 700, padding: '6px' }}>Crear nuevo plan</button>
          <div style={{ borderTop: `1px solid ${B.borde}`, margin: '4px 0' }}/>
          {conBuscador && <div style={{ padding: '2px 2px 6px' }}><ConLimpiar valor={busca} onLimpia={() => { setBusca(''); casilla.current?.focus() }} bloque>
            <input ref={casilla} data-buscar="planes" type="text" role="searchbox" aria-label="Buscar entre tus planes" placeholder="Buscar plan…" value={busca} onChange={e => setBusca(e.target.value)}
              style={{ fontFamily: B.letra, fontSize: 13, background: B.fondo, color: B.texto, border: `1px solid ${B.borde}`, borderRadius: B.radioBoton, padding: '5px 8px' }}/></ConLimpiar></div>}
          <div style={{ maxHeight: 300, overflowY: 'auto' }}>
            {!planes.length && <div style={{ ...S.apagado, padding: 6 }}>Aún no tienes planes guardados.</div>}
            {!!planes.length && !vistas.length && <div style={{ ...S.apagado, padding: 6 }}>Ningún plan con «{busca.trim()}».</div>}
            {vistas.map(p => { const yaAbierto = abiertas.includes(claveDe(p.id)), final = finales[p.id]; return (
              <button key={p.id} data-plan-menu={p.id} title={p.nombre} onClick={() => { cierra(); onAnadir?.(p.id) }}
                style={{ display: 'flex', gap: 8, alignItems: 'flex-start', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: B.letra, fontSize: 13, color: B.texto, padding: '5px 6px', borderRadius: 4 }}>
                <span style={{ flex: 'none', width: 14, color: '#7ee2a0' }}>{yaAbierto ? <span data-ya-abierto>✓</span> : ''}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', color: B.titulo, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nombre}</span>
                  <span style={{ display: 'block', color: B.apagado, fontSize: 12 }}>{Number.isFinite(final) ? <span data-final-plan>{`Tienes al final ${euros(final, 0)} · `}</span> : null}{fechaCorta(p.updated_at)}</span>
                </span>
              </button>) })}
          </div>
        </div>}
      </span>
    </div>
  )
}
