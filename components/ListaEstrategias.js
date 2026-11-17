// components/ListaEstrategias.js — lista de estrategias como el selector de valores del Backtesting (docs/builder.md §175):
// buscador con ✕ (sin mayúsculas ni acentos), casilla dibujada a la IZQUIERDA del nombre (no la del navegador: un estilo global
// de input/label la ponía encima y centrada), filas compactas y las marcadas al abrir, arriba.
//   ListaEstrategias: varias (casillas, hasta `max`) o una (`unica`, círculo). Avisa con onMarca(id).
//   SelectorEstrategia: un botón con la elegida que abre la lista de una (el «Estrategia» del bloque del plan).
import { useState, useEffect, useRef } from 'react'
import { B, S } from '../lib/builder/estilo'
import { coincide } from '../lib/builder/buscar'
import ConLimpiar from './LimpiarBusqueda'

const AZUL = '#58a6ff'
const marcaEstilo = (on, unica, apagada) => ({ width: 14, height: 14, flex: 'none', boxSizing: 'border-box', borderRadius: unica ? '50%' : 3,
  border: `1.5px solid ${on ? AZUL : apagada ? B.borde : '#3d5a7a'}`, background: on && !unica ? AZUL : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' })

// estrategias: [{ id, name, etiqueta? }]. marcadas: ids (texto). primero: ids que van arriba (los marcados al abrir: así no saltan al pulsar).
export function ListaEstrategias({ estrategias = [], marcadas = [], onMarca, unica = false, max = Infinity, primero = [], atributo = 'data-estrategia', alto = 280, pie = null, autoFoco = false }) {
  const [busca, setBusca] = useState('')
  const casilla = useRef(null)
  useEffect(() => { if (autoFoco) casilla.current?.focus?.() }, [autoFoco])
  const arriba = primero.map(String)
  const vistas = estrategias.filter(s => coincide(busca, s.name))
    .map((s, i) => ({ s, i, p: arriba.indexOf(String(s.id)) }))
    .sort((a, b) => (a.p < 0 ? Infinity : a.p) - (b.p < 0 ? Infinity : b.p) || a.i - b.i).map(x => x.s)
  const n = marcadas.length
  return (
    <div data-lista-estrategias style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <ConLimpiar valor={busca} onLimpia={() => { setBusca(''); casilla.current?.focus?.() }} bloque>
        <input ref={casilla} data-buscar="estrategias" type="text" role="searchbox" aria-label="Buscar entre tus estrategias" placeholder="Buscar estrategia…" value={busca} onChange={e => setBusca(e.target.value)}
          style={{ fontFamily: B.letra, fontSize: 13, background: B.fondo, color: B.texto, border: `1px solid ${B.borde}`, borderRadius: B.radioBoton, padding: '5px 8px' }}/></ConLimpiar>
      {!unica && <div data-cuantas-marcadas style={{ fontSize: 12, fontWeight: 700, color: B.titulo }}>{n} {n === 1 ? 'seleccionada' : 'seleccionadas'}</div>}
      <div role={unica ? 'radiogroup' : 'group'} aria-label="Tus estrategias" style={{ maxHeight: alto, overflowY: 'auto' }}>
        {!vistas.length && <div style={{ ...S.apagado, padding: 6, fontSize: 13 }}>{busca.trim() ? `Ninguna estrategia con «${busca.trim()}».` : 'No hay estrategias.'}</div>}
        {vistas.map(s => { const id = String(s.id), on = marcadas.map(String).includes(id), lleno = !unica && !on && n >= max
          return <button key={id} type="button" {...{ [atributo]: id }} role={unica ? 'radio' : 'checkbox'} aria-checked={on} disabled={lleno} onClick={() => onMarca?.(id)}
            title={lleno ? `Como mucho ${max}: desmarca una antes` : s.name}
            style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '5px 6px', marginBottom: 2, borderRadius: 4, fontFamily: B.letra, fontSize: 13,
              cursor: lleno ? 'not-allowed' : 'pointer', color: lleno ? B.apagado : on ? B.titulo : B.texto, fontWeight: on ? 600 : 400,
              background: on ? 'rgba(90,169,255,0.10)' : 'transparent', border: `1px solid ${on ? 'rgba(90,169,255,0.35)' : 'transparent'}` }}>
            <span aria-hidden="true" style={marcaEstilo(on, unica, lleno)}>{on && (unica ? <span style={{ width: 6, height: 6, borderRadius: '50%', background: AZUL }}/> : <span style={{ color: '#000', fontSize: 11, lineHeight: 1, fontWeight: 900 }}>✓</span>)}</span>
            <span style={{ flex: '1 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
            {s.etiqueta && <span data-etiqueta-estrategia style={{ flex: 'none', fontSize: 11, fontWeight: 400, color: s.colorEtiqueta || B.secundario }}>{s.etiqueta}</span>}
          </button> })}
      </div>
      {pie}
    </div>
  )
}

// El selector de UNA estrategia: un botón con la elegida («nombre · etiqueta ▾») que abre la lista debajo. Se cierra al elegir,
// al pulsar fuera o con Esc. extra: una fila que no está en `estrategias` y es la elegida (p. ej. la estrategia borrada del plan).
export function SelectorEstrategia({ estrategias = [], valor = '', onElige, extra = null, pie = null, estiloBoton = {}, inicialAbierto = false }) {
  const [abierto, setAbierto] = useState(inicialAbierto)
  const [primero, setPrimero] = useState(valor ? [String(valor)] : [])
  const ref = useRef(null)
  useEffect(() => {
    if (!abierto) return
    const fuera = (e) => { if (ref.current && !ref.current.contains(e.target)) setAbierto(false) }
    const esc = (e) => { if (e.key === 'Escape') setAbierto(false) }
    document.addEventListener('mousedown', fuera); document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('keydown', esc) }
  }, [abierto])
  const todas = extra ? [extra, ...estrategias.filter(s => String(s.id) !== String(extra.id))] : estrategias
  const elegida = todas.find(s => String(s.id) === String(valor))
  return (
    <span ref={ref} style={{ position: 'relative', display: 'block', maxWidth: '100%' }}>
      <button type="button" data-boton="elige-estrategia" aria-label="Estrategia" aria-expanded={abierto} title={elegida ? `${elegida.name}${elegida.etiqueta ? ` · ${elegida.etiqueta}` : ''}` : 'Elige una estrategia'}
        onClick={() => { if (!abierto) setPrimero(valor ? [String(valor)] : []); setAbierto(x => !x) }}
        style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', boxSizing: 'border-box', textAlign: 'left', cursor: 'pointer', ...estiloBoton }}>
        <span style={{ flex: '1 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{elegida ? elegida.name : 'Elige una estrategia'}</span>
        {elegida?.etiqueta && <span data-etiqueta-elegida style={{ flex: 'none', fontSize: 12, color: elegida.colorEtiqueta || B.secundario }}>{elegida.etiqueta}</span>}
        <span aria-hidden="true" style={{ flex: 'none', color: B.secundario }}>▾</span>
      </button>
      {abierto && <div data-menu="elige-estrategia" style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 40, marginTop: 4, padding: 8, background: B.tarjeta, border: `1px solid ${B.borde}`, borderRadius: B.radioBoton, boxShadow: '0 8px 24px rgba(0,0,0,0.45)', opacity: 1 }}>
        <ListaEstrategias unica autoFoco estrategias={todas} marcadas={valor ? [String(valor)] : []} primero={primero} atributo="data-elige-estrategia" pie={pie}
          onMarca={id => { setAbierto(false); if (String(id) !== String(valor)) onElige?.(id) }}/>
      </div>}
    </span>
  )
}

export default ListaEstrategias
