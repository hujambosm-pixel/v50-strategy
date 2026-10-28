// components/BuscadorEstrategia.js — el buscador de «Desde una de mis estrategias» (V9.1060; docs/builder.md, §26), como el del
// catálogo de condiciones: se escribe y debajo salen las que coinciden por nombre, sin distinguir mayúsculas ni acentos
// (lib/builder/buscar.js), agrupadas «De tarjetas» / «De código». Con teclado (flechas, Enter, Escape) y con ratón. Con la casilla
// vacía, o con el nombre de la elegida, al pulsar en ella se ven todas. Al elegir una, su nombre queda escrito en la casilla.
// V9.1063: en cada resultado, las letras que coinciden con lo escrito, resaltadas (components/Resaltado.js).
//   grupos: [{ titulo, estrategias: [{ id, name }] }]; texto / onTexto: lo escrito; elegida: el id elegido (o null); onElige(s).
//   abiertoInicial (para las pruebas de montaje): con la lista abierta.
import { useState, useRef, useEffect } from 'react'
import { B } from '../lib/builder/estilo'
import { coincide } from '../lib/builder/buscar'
import Resaltado from './Resaltado'

export default function BuscadorEstrategia({ grupos = [], texto = '', onTexto = () => {}, elegida = null, onElige = () => {}, abiertoInicial = false, style = {} }) {
  const [abierto, setAbierto] = useState(abiertoInicial)
  const [activo, setActivo] = useState(0)
  const filas = useRef([])
  const todas = grupos.flatMap(g => g.estrategias)
  const laElegida = todas.find(s => String(s.id) === String(elegida)) || null
  // Con el nombre de la elegida en la casilla, la lista enseña todas (como con la casilla vacía).
  const consulta = laElegida && texto === laElegida.name ? '' : texto
  const visibles = grupos.map(g => ({ ...g, estrategias: g.estrategias.filter(s => coincide(consulta, s.name)) })).filter(g => g.estrategias.length)
  const plana = visibles.flatMap(g => g.estrategias)
  useEffect(() => { if (abierto) filas.current[activo]?.scrollIntoView?.({ block: 'nearest' }) }, [activo, abierto])
  const elige = (s) => { if (s) { onElige(s); onTexto(s.name) } setAbierto(false) }
  const tecla = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (!abierto) { setAbierto(true); return } setActivo(k => Math.min(k + 1, plana.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActivo(k => Math.max(k - 1, 0)) }
    else if (e.key === 'Enter') { if (abierto) { e.preventDefault(); elige(plana[activo]) } }
    else if (e.key === 'Escape') { if (laElegida) onTexto(laElegida.name); setAbierto(false) }
  }
  let k = -1
  return (
    <div style={{ position: 'relative', ...style }}>
      <input type="text" role="combobox" aria-label="Estrategia que copiar" aria-expanded={abierto && plana.length > 0} aria-controls="buscador-estrategia-lista" aria-autocomplete="list"
        aria-activedescendant={abierto && plana[activo] ? `buscador-estrategia-${activo}` : undefined} data-buscar="copia"
        value={texto} placeholder="Escribe el nombre de una estrategia…" autoComplete="off" spellCheck={false}
        onFocus={e => { e.target.select(); setAbierto(true); setActivo(Math.max(0, plana.findIndex(s => String(s.id) === String(elegida)))) }}
        onClick={() => setAbierto(true)}
        onChange={e => { onTexto(e.target.value); setActivo(0); setAbierto(true) }}
        onBlur={() => setAbierto(false)} onKeyDown={tecla}
        style={{ fontFamily: B.letra, fontSize: B.base, background: B.fondo, color: B.texto, border: `1px solid ${B.borde}`, borderRadius: B.radioBoton, padding: '7px 10px', width: '100%', boxSizing: 'border-box' }}/>
      {abierto && plana.length > 0 && <ul id="buscador-estrategia-lista" role="listbox" aria-label={`Mis estrategias: ${plana.length}`} data-lista-copia={plana.length}
        style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, margin: '4px 0 0', padding: 4, listStyle: 'none', maxHeight: 320, overflowY: 'auto',
          background: B.tarjeta, border: `1px solid ${B.borde}`, borderRadius: B.radioBoton, boxShadow: '0 8px 24px rgba(0,0,0,0.45)' }}>
        {visibles.map(g => [
          <li key={`g-${g.titulo}`} role="presentation" data-grupo-copia={g.titulo} style={{ padding: '6px 8px 2px', fontSize: 12, fontWeight: 600, color: B.apagado }}>{g.titulo}</li>,
          ...g.estrategias.map(s => {
            const i = ++k
            return (
              <li key={s.id} id={`buscador-estrategia-${i}`} ref={el => { filas.current[i] = el }} role="option" aria-selected={i === activo} data-opcion-copia={s.name}
                onMouseDown={e => { e.preventDefault(); elige(s) }} onMouseEnter={() => setActivo(i)}
                style={{ padding: '5px 8px 5px 14px', borderRadius: 4, cursor: 'pointer', background: i === activo ? '#1f3350' : 'transparent', color: String(s.id) === String(elegida) ? '#7ee2a0' : B.titulo,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><Resaltado texto={s.name} consulta={consulta}/></li>
            )
          }),
        ])}
      </ul>}
    </div>
  )
}
