// components/BuilderAyuda.js — el «?» de ayuda del Builder (los textos, en lib/builder/ayuda.js). Se abre al pasar el ratón
// y al tocarlo (en el móvil), y se cierra al tocar fuera, con Escape o si la página se desplaza.
// V9.1065: la ventana SIEMPRE cabe entera en la pantalla. Va en un portal (fuera de su tarjeta: nada la recorta) y con posición fija.
// Se mide con el texto puesto: debajo del «?» si cabe, si no encima; si no cabe en ninguno de los dos lados, se ensancha (300, 420 y
// hasta 560 px, o lo que deje la pantalla) y, si aun así no cabe, se queda en el lado con más sitio con desplazamiento vertical dentro.
import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { B } from '../lib/builder/estilo'

const ANCHOS = [300, 420, 560], MARGEN = 12, HUECO = 6
const useLayout = typeof window === 'undefined' ? useEffect : useLayoutEffect

export default function Ayuda({ texto, etiqueta = 'Ayuda', abiertoInicial = false }) {
  const [encima, setEncima] = useState(false)   // el ratón está encima
  const [fijo, setFijo] = useState(abiertoInicial)   // se tocó (o se hizo clic): sigue abierto hasta tocar fuera
  // abiertoInicial (para las pruebas de montaje): abierto desde el principio, en una posición provisional hasta medir el botón.
  const [pos, setPos] = useState(abiertoInicial ? { left: 16, top: 0, width: ANCHOS[0], maxHeight: null } : null)
  const [enPagina, setEnPagina] = useState(false)   // ya en el navegador: el portal se puede usar
  const ref = useRef(null), boton = useRef(null), burbuja = useRef(null), salida = useRef(null)
  const abierto = encima || fijo
  useEffect(() => { setEnPagina(true) }, [])
  const cierra = () => { setFijo(false); setEncima(false) }
  // Al salir el ratón, un momento de margen: se puede pasar del «?» a la ventana (para desplazar su texto) sin que se cierre.
  const entra = () => { clearTimeout(salida.current); setEncima(true) }
  const sale = () => { clearTimeout(salida.current); salida.current = setTimeout(() => setEncima(false), 180) }
  useEffect(() => () => clearTimeout(salida.current), [])
  const coloca = () => {
    const r = boton.current?.getBoundingClientRect(), el = burbuja.current
    if (!r) return
    const W = window.innerWidth, H = window.innerHeight
    const abajo = H - r.bottom - HUECO - MARGEN, arriba = r.top - HUECO - MARGEN
    const anchos = [...new Set(ANCHOS.map(a => Math.max(160, Math.min(a, W - 2 * MARGEN))))]
    // Se mide en una copia invisible (tocar la ventana misma dejaría su estilo distinto del que React cree que tiene).
    const copia = el ? el.cloneNode(true) : null
    if (copia) { Object.assign(copia.style, { visibility: 'hidden', left: '-10000px', top: '0px', maxHeight: 'none', overflowY: 'visible' }); document.body.appendChild(copia) }
    const alto = (w) => { if (!copia) return 0; copia.style.width = `${w}px`; return copia.scrollHeight }
    let ancho = anchos[anchos.length - 1], h = alto(ancho), lado = abajo >= arriba ? 'abajo' : 'arriba', maxHeight = null
    const cabe = anchos.map(w => [w, alto(w)]).find(([, x]) => x <= abajo || x <= arriba)
    copia?.remove()
    if (cabe) { [ancho, h] = cabe; lado = h <= abajo ? 'abajo' : 'arriba' }
    else maxHeight = Math.max(80, lado === 'abajo' ? abajo : arriba)
    const altoReal = maxHeight ? Math.min(h, maxHeight) : h
    const top = lado === 'abajo' ? r.bottom + HUECO : Math.max(MARGEN, r.top - HUECO - altoReal)
    const left = Math.max(MARGEN, Math.min(r.left - 8, W - ancho - MARGEN))
    setPos({ left, top, width: ancho, maxHeight })
  }
  // Primero se pinta fuera de la pantalla y sin verse (provisional), para medirla con su texto; luego, en su sitio.
  useLayout(() => {
    if (!abierto) return
    if (!burbuja.current) { setPos({ left: -10000, top: 0, width: ANCHOS[0], maxHeight: null, provisional: true }); return }
    coloca()
  }, [abierto, texto, enPagina, !!pos?.provisional])
  useEffect(() => {
    if (!abierto) return
    const fuera = (e) => { if (!ref.current?.contains(e.target) && !burbuja.current?.contains(e.target)) cierra() }
    const desplaza = (e) => { if (!burbuja.current?.contains(e.target)) cierra() }   // desplazar el texto de la ventana no la cierra
    const tecla = (e) => { if (e.key === 'Escape') cierra() }
    document.addEventListener('pointerdown', fuera)
    document.addEventListener('keydown', tecla)
    window.addEventListener('scroll', desplaza, true)
    window.addEventListener('resize', cierra)
    return () => { document.removeEventListener('pointerdown', fuera); document.removeEventListener('keydown', tecla); window.removeEventListener('scroll', desplaza, true); window.removeEventListener('resize', cierra) }
  }, [abierto])
  const raton = { onPointerEnter: e => { if (e.pointerType === 'mouse') entra() }, onPointerLeave: e => { if (e.pointerType === 'mouse') sale() } }
  const ventana = abierto && pos && (
    <span ref={burbuja} role="tooltip" data-ayuda-ventana {...raton}
      style={{ position: 'fixed', left: pos.left, top: pos.top, width: pos.width, maxHeight: pos.maxHeight ?? undefined, overflowY: pos.maxHeight ? 'auto' : 'visible', visibility: pos.provisional ? 'hidden' : 'visible', boxSizing: 'border-box', zIndex: 1000, background: B.cabecera, border: `1px solid ${B.siguienteBorde}`, borderRadius: B.radioBoton,
        padding: '10px 12px', color: B.texto, fontFamily: B.letra, fontSize: 13, fontWeight: 400, lineHeight: 1.45, textAlign: 'left', whiteSpace: 'normal', boxShadow: '0 6px 20px rgba(0,0,0,0.45)', display: 'block' }}>{texto}</span>
  )
  return (
    <span ref={ref} style={{ display: 'inline-block', verticalAlign: 'middle', marginLeft: 4 }} {...raton}>
      <button ref={boton} type="button" aria-label={`Ayuda: ${etiqueta}`} aria-expanded={abierto} onClick={() => setFijo(x => !x)}
        style={{ width: 18, height: 18, padding: 0, borderRadius: '50%', border: `1px solid ${B.borde}`, background: B.fondo, color: B.secundario, fontFamily: B.letra, fontSize: 11, fontWeight: 700, lineHeight: '16px', cursor: 'pointer' }}>?</button>
      {ventana && (enPagina ? createPortal(ventana, document.body) : ventana)}
    </span>
  )
}
