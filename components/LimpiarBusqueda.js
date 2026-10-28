// components/LimpiarBusqueda.js — la «×» que limpia una casilla de búsqueda (V9.1065; docs/builder.md, §31). La misma en todos los
// buscadores de la app: dentro de la casilla, a la derecha, visible solo cuando hay texto; al pulsarla se vacía (y el foco se queda
// en la casilla, para seguir escribiendo).
//   <BotonLimpiar visible onLimpia/>: solo el botón, para una casilla que ya está dentro de un contenedor con position: relative.
//   <ConLimpiar valor onLimpia bloque? estilo?>{<input …/>}</ConLimpiar>: envuelve la casilla (y le deja sitio a la derecha).
import { cloneElement } from 'react'

export const SITIO_LIMPIAR = 26   // el hueco a la derecha de la casilla, en px
export function BotonLimpiar({ visible, onLimpia, etiqueta = 'Limpiar la búsqueda' }) {
  if (!visible) return null
  return (
    <button type="button" data-limpiar-busqueda aria-label={etiqueta} title={etiqueta}
      onMouseDown={e => e.preventDefault()} onClick={e => { e.stopPropagation(); onLimpia() }}
      style={{ position: 'absolute', right: 5, top: '50%', transform: 'translateY(-50%)', width: 18, height: 18, padding: 0, margin: 0, border: 'none', borderRadius: '50%',
        background: 'rgba(139,155,173,0.28)', color: '#e6edf3', fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif', fontSize: 14, fontWeight: 400, lineHeight: '18px',
        textAlign: 'center', cursor: 'pointer', zIndex: 2 }}>×</button>
  )
}
export default function ConLimpiar({ valor, onLimpia, bloque = false, estilo = {}, children }) {
  const casilla = cloneElement(children, { style: { ...(children.props.style || {}), paddingRight: SITIO_LIMPIAR, ...(bloque ? { width: '100%', boxSizing: 'border-box' } : {}) } })
  return (
    <span style={{ position: 'relative', display: bloque ? 'block' : 'inline-block', ...estilo }}>
      {casilla}
      <BotonLimpiar visible={!!String(valor ?? '')} onLimpia={onLimpia}/>
    </span>
  )
}
