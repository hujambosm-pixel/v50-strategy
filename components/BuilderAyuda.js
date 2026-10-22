// components/BuilderAyuda.js — el «?» de ayuda del Builder (los textos, en lib/builder/ayuda.js). Se abre al pasar el ratón
// y al tocarlo (en el móvil), y se cierra al tocar fuera. La burbuja va con posición fija, para que no la corte una tabla
// con desplazamiento ni una tarjeta; si la página se desplaza, se cierra.
import { useState, useEffect, useRef } from 'react'
import { B } from '../lib/builder/estilo'

const ANCHO = 300

export default function Ayuda({ texto, etiqueta = 'Ayuda' }) {
  const [encima, setEncima] = useState(false)   // el ratón está encima
  const [fijo, setFijo] = useState(false)       // se tocó (o se hizo clic): sigue abierto hasta tocar fuera
  const [pos, setPos] = useState(null)
  const ref = useRef(null), boton = useRef(null)
  const abierto = encima || fijo
  const coloca = () => {
    const r = boton.current?.getBoundingClientRect(); if (!r) return
    const ancho = Math.min(ANCHO, window.innerWidth - 32)
    setPos({ left: Math.max(16, Math.min(r.left - 8, window.innerWidth - ancho - 16)), top: r.bottom + 6, width: ancho })
  }
  useEffect(() => {
    if (!abierto) return
    coloca()
    const fuera = (e) => { if (ref.current && !ref.current.contains(e.target)) { setFijo(false); setEncima(false) } }
    const cierra = () => { setFijo(false); setEncima(false) }
    document.addEventListener('pointerdown', fuera)
    window.addEventListener('scroll', cierra, true)
    window.addEventListener('resize', cierra)
    return () => { document.removeEventListener('pointerdown', fuera); window.removeEventListener('scroll', cierra, true); window.removeEventListener('resize', cierra) }
  }, [abierto])
  return (
    <span ref={ref} style={{ display: 'inline-block', verticalAlign: 'middle', marginLeft: 4 }}
      onPointerEnter={e => { if (e.pointerType === 'mouse') setEncima(true) }} onPointerLeave={e => { if (e.pointerType === 'mouse') setEncima(false) }}>
      <button ref={boton} type="button" aria-label={`Ayuda: ${etiqueta}`} aria-expanded={abierto} onClick={() => setFijo(x => !x)}
        style={{ width: 18, height: 18, padding: 0, borderRadius: '50%', border: `1px solid ${B.borde}`, background: B.fondo, color: B.secundario, fontFamily: B.letra, fontSize: 11, fontWeight: 700, lineHeight: '16px', cursor: 'pointer' }}>?</button>
      {abierto && pos && (
        <span role="tooltip" style={{ position: 'fixed', left: pos.left, top: pos.top, width: pos.width, boxSizing: 'border-box', zIndex: 1000, background: B.cabecera, border: `1px solid ${B.siguienteBorde}`, borderRadius: B.radioBoton,
          padding: '10px 12px', color: B.texto, fontFamily: B.letra, fontSize: 13, fontWeight: 400, lineHeight: 1.45, textAlign: 'left', whiteSpace: 'normal', boxShadow: '0 6px 20px rgba(0,0,0,0.45)' }}>{texto}</span>
      )}
    </span>
  )
}
