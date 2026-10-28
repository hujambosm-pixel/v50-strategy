// components/BuscadorValor.js — el selector «Valor» de «Señales en el gráfico» con buscador (V9.1058; docs/builder.md, §24): se
// escribe y la lista se filtra por ticker o por nombre («NVDA», «nvidia»), sin distinguir mayúsculas ni acentos
// (lib/builder/buscar.js). Con teclado (flechas, Enter, Escape) y con ratón. Mientras no se escribe, enseña el valor elegido.
// V9.1063: en cada resultado, las letras que coinciden con lo escrito, resaltadas (components/Resaltado.js). V9.1065: la «×» que limpia.
//   valores: [{ simbolo, nombre }]; valor: el símbolo elegido; onCambia(simbolo). textoInicial (para las pruebas de montaje): lo
//   escrito, con la lista abierta.
import { useState, useMemo, useRef, useEffect } from 'react'
import { B } from '../lib/builder/estilo'
import { filtraValores } from '../lib/builder/buscar'
import Resaltado from './Resaltado'
import ConLimpiar from './LimpiarBusqueda'

const MAX_FILAS = 200
export default function BuscadorValor({ valores = [], valor, onCambia = () => {}, etiqueta = 'Valor', textoInicial = null }) {
  const [texto, setTexto] = useState(textoInicial)   // null: no se está escribiendo
  const [abierto, setAbierto] = useState(textoInicial != null)
  const [activo, setActivo] = useState(0)
  const filas = useRef([])
  const lista = useMemo(() => filtraValores(valores, texto || ''), [valores, texto])
  const visibles = lista.slice(0, MAX_FILAS)
  const nombre = valores.find(v => v.simbolo === valor)?.nombre || ''
  useEffect(() => { if (abierto) filas.current[activo]?.scrollIntoView?.({ block: 'nearest' }) }, [activo, abierto])
  const elige = (s) => { if (s) onCambia(s); setTexto(null); setAbierto(false) }
  const tecla = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (!abierto) { setAbierto(true); return } setActivo(k => Math.min(k + 1, visibles.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActivo(k => Math.max(k - 1, 0)) }
    else if (e.key === 'Enter') { if (abierto) { e.preventDefault(); elige(visibles[activo]?.simbolo) } }
    else if (e.key === 'Escape') { setTexto(null); setAbierto(false) }
  }
  return (
    <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <ConLimpiar valor={texto || ''} onLimpia={() => { setTexto(''); setActivo(0); setAbierto(true) }}><input type="text" role="combobox" aria-label={etiqueta} aria-expanded={abierto} aria-controls="buscador-valor-lista" aria-autocomplete="list"
        aria-activedescendant={abierto && visibles[activo] ? `buscador-valor-${activo}` : undefined} data-buscador-valor
        value={texto ?? valor ?? ''} placeholder="Ticker o nombre" autoComplete="off" spellCheck={false}
        onFocus={e => { e.target.select(); setAbierto(true); setActivo(Math.max(0, visibles.findIndex(v => v.simbolo === valor))) }}
        onChange={e => { setTexto(e.target.value); setActivo(0); setAbierto(true) }}
        onBlur={() => { setTexto(null); setAbierto(false) }} onKeyDown={tecla}
        style={{ fontFamily: B.letra, fontSize: B.base, background: B.fondo, color: B.texto, border: `1px solid ${B.borde}`, borderRadius: B.radioBoton, padding: '5px 8px', width: '12ch' }}/></ConLimpiar>
      {texto == null && nombre && <span data-nombre-valor style={{ fontWeight: 400, fontSize: 13, color: B.secundario, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nombre}</span>}
      {abierto && <ul id="buscador-valor-lista" role="listbox" aria-label={`${etiqueta}: ${lista.length} ${lista.length === 1 ? 'valor' : 'valores'}`} data-lista-valores={lista.length}
        style={{ position: 'absolute', top: '100%', left: 0, zIndex: 20, margin: '4px 0 0', padding: 4, listStyle: 'none', minWidth: 300, maxHeight: 320, overflowY: 'auto',
          background: B.tarjeta, border: `1px solid ${B.borde}`, borderRadius: B.radioBoton, boxShadow: '0 8px 24px rgba(0,0,0,0.45)', fontWeight: 400 }}>
        {visibles.map((v, k) => (
          <li key={v.simbolo} id={`buscador-valor-${k}`} ref={el => { filas.current[k] = el }} role="option" aria-selected={k === activo} data-opcion-valor={v.simbolo}
            onMouseDown={e => { e.preventDefault(); elige(v.simbolo) }} onMouseEnter={() => setActivo(k)}
            style={{ display: 'flex', gap: 10, alignItems: 'baseline', padding: '5px 8px', borderRadius: 4, cursor: 'pointer', background: k === activo ? '#1f3350' : 'transparent' }}>
            <span style={{ color: v.simbolo === valor ? '#7ee2a0' : B.titulo, fontWeight: 600, minWidth: '7ch' }}><Resaltado texto={v.simbolo} consulta={texto}/></span>
            <span style={{ color: B.secundario, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><Resaltado texto={v.nombre} consulta={texto}/></span>
          </li>
        ))}
        {!lista.length && <li style={{ padding: '5px 8px', color: B.apagado }}>Ningún valor con «{texto}».</li>}
        {lista.length > MAX_FILAS && <li style={{ padding: '5px 8px', color: B.apagado, fontSize: 12 }}>Y {lista.length - MAX_FILAS} más: escribe para afinar.</li>}
      </ul>}
    </span>
  )
}
