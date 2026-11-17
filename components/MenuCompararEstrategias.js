// components/MenuCompararEstrategias.js — «Comparar con otras estrategias ▾» del plan (docs/builder.md §170; boceto
// bocetos/detalle-final.html, pestaña 3). Un desplegable con tus estrategias de tarjetas (menos la del plan), con casillas, hasta
// MAX_COPIAS. «Comparar (N)» llama a onComparar(ids) y el plan pasa a «Comparar planes» con una copia sin guardar por estrategia
// (lib/builder/comparaPlanes.js copiaConEstrategia). Se cierra al pulsar fuera o con Esc. Buscador con ✕, sin mayúsculas ni acentos.
// §175: la lista es la de components/ListaEstrategias.js (casilla a la izquierda, «N seleccionadas», las marcadas al abrir, arriba).
import { useState, useEffect, useRef } from 'react'
import { B, S } from '../lib/builder/estilo'
import { MAX_COPIAS, AYUDA_COPIAS } from '../lib/builder/comparaPlanes'
import { ListaEstrategias } from './ListaEstrategias'
import Ayuda from './BuilderAyuda'

const menu = { position: 'absolute', top: '100%', right: 0, zIndex: 40, marginTop: 4, padding: 8, width: 340, maxWidth: '86vw', background: B.tarjeta, border: `1px solid ${B.borde}`, borderRadius: B.radioBoton, boxShadow: '0 8px 24px rgba(0,0,0,0.45)', opacity: 1, textAlign: 'left' }

export default function MenuCompararEstrategias({ estrategias = [], actualId = null, inicial = null, onComparar }) {
  const [abierto, setAbierto] = useState(!!inicial?.abierto)
  const [marcadas, setMarcadas] = useState(inicial?.marcadas || [])
  const [primero, setPrimero] = useState(inicial?.marcadas || [])
  const ref = useRef(null)
  const cierra = () => setAbierto(false)
  useEffect(() => {
    if (!abierto) return
    const fuera = (e) => { if (ref.current && !ref.current.contains(e.target)) cierra() }
    const esc = (e) => { if (e.key === 'Escape') cierra() }
    document.addEventListener('mousedown', fuera); document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('keydown', esc) }
  }, [abierto])
  const otras = estrategias.filter(s => String(s.id) !== String(actualId))
  const marca = (id) => setMarcadas(m => m.includes(String(id)) ? m.filter(x => x !== String(id)) : m.length < MAX_COPIAS ? [...m, String(id)] : m)
  const vale = marcadas.filter(id => otras.some(s => String(s.id) === id))
  const hay = otras.length > 0
  return (
    <span ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      <button data-boton="comparar-estrategias" aria-expanded={abierto} disabled={!hay} title={hay ? 'Tu plan tal como está, con otras estrategias, uno al lado del otro (sin guardar nada)' : 'Necesitas otra estrategia de tarjetas para comparar'}
        onClick={() => { if (!abierto) setPrimero(marcadas); setAbierto(x => !x) }} style={{ ...S.boton, padding: '6px 12px', fontSize: 13, ...(hay ? {} : { color: B.apagado, cursor: 'not-allowed' }) }}>Comparar con otras estrategias ▾</button>
      {abierto && <div data-menu="comparar-estrategias" style={menu}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, fontWeight: 700, color: B.titulo, fontSize: 13, marginBottom: 6 }}>
          Elige hasta {MAX_COPIAS} estrategias<Ayuda texto={AYUDA_COPIAS} etiqueta="Comparar con otras estrategias"/></div>
        <ListaEstrategias estrategias={otras} marcadas={marcadas} onMarca={marca} max={MAX_COPIAS} primero={primero} atributo="data-estrategia-comparar"/>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, borderTop: `1px solid ${B.borde}`, marginTop: 6, paddingTop: 8 }}>
          <button data-boton="cancelar-comparar-estrategias" onClick={cierra} style={{ ...S.boton, padding: '5px 10px', fontSize: 13 }}>Cancelar</button>
          <button data-boton="comparar-marcadas" disabled={!vale.length} onClick={() => { cierra(); onComparar?.(vale) }}
            style={{ ...(vale.length ? S.botonVerde : S.botonDesactivado), padding: '5px 10px', fontSize: 13 }}>Comparar ({vale.length})</button>
        </div>
      </div>}
    </span>
  )
}
