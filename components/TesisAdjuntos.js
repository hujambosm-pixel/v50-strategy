// components/TesisAdjuntos.js — la zona «Adjuntos» de una tesis y su visor a pantalla completa (docs/tesis.md, «Imágenes y adjuntos»), según el boceto aprobado
// «Tesis · imágenes y adjuntos». Solo pinta: las llamadas y el estado, en components/TesisPanel.js; las piezas puras, en lib/tesisArchivos.js.
// Sin librerías nuevas: el PDF lo enseña el visor del propio navegador, en un iframe, con su URL firmada.
import { useEffect, useState } from 'react'
import { B, S } from '../lib/builder/estilo'
import Ayuda from './BuilderAyuda'
import { ACEPTA_ARCHIVOS, AVISO_SIN_GUARDAR, AYUDA_ADJUNTOS, AYUDA_GUARDAR_PDF, etiquetaTipo, nombreDocumento, tamanoLegible, visorDe } from '../lib/tesisArchivos'

const ROJO = '#f85149', VERDE = '#3fb950', AZUL = '#79c0ff', AMARILLO = '#f2cc60'
const Icono = ({ children, size = 16, color = 'currentColor' }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
export const IconoClip = ({ size = 13 }) => <Icono size={size}><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/></Icono>
const IconoDescargar = () => <Icono><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/></Icono>
const IconoPapelera = () => <Icono color={ROJO}><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></Icono>

// La etiqueta de color del tipo: PDF rojo, DOCX azul, XLSX verde; el resto, gris.
export const EtiquetaTipo = ({ nombre, grande = false }) => {
  const e = etiquetaTipo(nombre)
  return <span data-etiqueta-tipo={e.texto} style={{ display: 'inline-block', padding: grande ? '10px 16px' : '2px 7px', borderRadius: 4, background: e.color, color: '#fff', fontWeight: 700, fontSize: grande ? 22 : 11, letterSpacing: 0.3, whiteSpace: 'nowrap' }}>{e.texto}</span>
}
const Miniatura = ({ fila, url, alto = 96 }) => (
  <div style={{ height: alto, display: 'flex', alignItems: 'center', justifyContent: 'center', background: B.fondo, overflow: 'hidden' }}>
    {visorDe(fila.nombre) === 'imagen' && url ? <img src={url} alt="" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover' }}/> : <EtiquetaTipo nombre={fila.nombre}/>}
  </div>)

// ── La zona «Adjuntos» ──
// Props: filas (solo clase adjunto, la más reciente primero), bytes, nueva, urls ({ ruta: url }), subidas ([{ id, nombre, progreso }]), avisos (líneas), arrastrando,
// onArrastrando, onAnadir(archivos), onAbrir(fila), onDescargar(fila), onBorrar(fila), extraCabecera (botones de más en la cabecera).
export function ZonaAdjuntos({ filas = [], bytes = 0, nueva = false, urls = {}, subidas = [], avisos = [], arrastrando = false, onArrastrando, onAnadir, onAbrir, onDescargar, onBorrar, extraCabecera = null }) {
  const conArchivos = (e) => [...(e.dataTransfer?.types || [])].includes('Files')
  const sobre = nueva ? {} : {
    onDragOver: (e) => { if (conArchivos(e)) { e.preventDefault(); onArrastrando?.(true) } },
    onDragLeave: (e) => { if (!e.currentTarget.contains(e.relatedTarget)) onArrastrando?.(false) },
    onDrop: (e) => { if (conArchivos(e)) { e.preventDefault(); onArrastrando?.(false); onAnadir?.([...e.dataTransfer.files]) } },
  }
  return (
    <div data-adjuntos {...sobre} style={{ position: 'relative', border: `1px solid ${B.borde}`, borderRadius: B.radioBoton, background: B.fondo, padding: 12 }}>
      <style>{`.ts-rejilla { display: grid; gap: 12px; grid-template-columns: repeat(auto-fill, minmax(max(170px, calc(25% - 9px)), 1fr)) }
.ts-tarjeta-adjunto:hover { border-color: ${B.siguienteBorde} }`}</style>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 700, color: B.titulo }}>Adjuntos ({filas.length})</span>
        <Ayuda texto={AYUDA_ADJUNTOS} etiqueta="Adjuntos"/>
        {!!filas.length && <span data-ocupan style={S.apagado}>Ocupan {tamanoLegible(bytes)}</span>}
        {extraCabecera}
        <div style={{ flex: 1 }}/>
        {nueva
          ? <span data-adjuntos-sin-guardar style={{ color: AMARILLO, fontSize: 13 }}>{AVISO_SIN_GUARDAR}</span>
          : <>
            <span style={{ ...S.apagado, fontSize: 13 }}>Arrastra archivos aquí o</span>
            <label data-anadir-archivos style={{ ...S.boton, padding: '5px 12px', fontSize: 13, cursor: 'pointer' }}>+ Añadir archivos
              <input type="file" multiple hidden accept={ACEPTA_ARCHIVOS} onChange={e => { const xs = [...e.target.files]; e.target.value = ''; onAnadir?.(xs) }}/>
            </label>
          </>}
      </div>
      {avisos.map((a, k) => <div key={k} data-aviso-adjuntos role="status" style={{ color: AMARILLO, fontSize: 13, marginTop: 8 }}>{a}</div>)}
      {subidas.map(s => (
        <div key={s.id} data-subiendo style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
          <span style={{ flex: '0 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: B.texto }}>{s.nombre}</span>
          <span style={{ ...S.apagado, whiteSpace: 'nowrap' }}>Subiendo… {Math.round(s.progreso * 100)} %</span>
          <span style={{ flex: 1, minWidth: 60, height: 5, borderRadius: 3, background: B.borde, overflow: 'hidden' }}><span style={{ display: 'block', height: '100%', width: `${Math.round(s.progreso * 100)}%`, background: VERDE }}/></span>
        </div>))}
      {!!filas.length && (
        <div className="ts-rejilla" style={{ marginTop: 12 }}>
          {filas.map(f => (
            <div key={f.id} data-adjunto={f.id} className="ts-tarjeta-adjunto" role="button" tabIndex={0} onClick={() => onAbrir?.(f)} onKeyDown={e => { if (e.key === 'Enter') onAbrir?.(f) }}
              style={{ border: `1px solid ${B.borde}`, borderRadius: B.radioBoton, overflow: 'hidden', cursor: 'pointer', background: B.tarjeta, minWidth: 0 }}>
              <Miniatura fila={f} url={urls[f.ruta]}/>
              <div style={{ padding: '8px 10px' }}>
                <div title={f.nombre} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: B.texto, fontSize: 13 }}>{f.nombre}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                  <span style={{ ...S.apagado, fontSize: 12, flex: 1, minWidth: 0 }}>{tamanoLegible(f.bytes)}{visorDe(f.nombre) === 'descargar' ? ' · solo descargar' : ''}</span>
                  <button data-descargar-adjunto aria-label={`Descargar ${f.nombre}`} title="Descargar" onClick={e => { e.stopPropagation(); onDescargar?.(f) }} style={{ ...S.enlace, color: B.secundario, display: 'flex', padding: 3 }}><IconoDescargar/></button>
                  <button data-borrar-adjunto aria-label={`Borrar ${f.nombre}`} title="Borrar" onClick={e => { e.stopPropagation(); onBorrar?.(f) }} style={{ ...S.enlace, display: 'flex', padding: 3 }}><IconoPapelera/></button>
                </div>
              </div>
            </div>))}
        </div>)}
      {arrastrando && <div data-soltar style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(19, 40, 63, 0.92)', border: `2px dashed ${AZUL}`, borderRadius: B.radioBoton, color: AZUL, fontWeight: 600, pointerEvents: 'none', zIndex: 2 }}>Suelta aquí para añadirlos a esta tesis</div>}
    </div>)
}

// ── Lo que se ve de un archivo: imagen, PDF del navegador o el aviso de Word y Excel ──
export function VistaArchivo({ fila, url, onDescargar }) {
  const [real, setReal] = useState(false)   // la imagen, a tamaño real
  const visor = visorDe(fila.nombre)
  if (visor === 'descargar') return (
    <div data-vista="descargar" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24, textAlign: 'center', color: B.texto }}>
      <EtiquetaTipo nombre={fila.nombre} grande/>
      <div style={{ fontSize: 17, fontWeight: 600, color: B.titulo }}>Los archivos de {nombreDocumento(fila.nombre)} no se ven dentro de la app</div>
      <div style={{ color: B.secundario, maxWidth: 480 }}>Descárgalo para abrirlo en tu PC. Si quieres leerlo aquí, guárdalo como PDF y súbelo.</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><button data-descargar-grande onClick={() => onDescargar?.(fila)} style={S.botonVerde}>Descargar</button><Ayuda texto={AYUDA_GUARDAR_PDF} etiqueta="Guardar como PDF"/></div>
    </div>)
  if (!url) return <div data-vista="cargando" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: B.apagado }}>Preparando el archivo…</div>
  if (visor === 'pdf') return <iframe data-vista="pdf" src={url} title={fila.nombre} style={{ flex: 1, minHeight: 0, width: '100%', border: 'none', background: '#fff' }}/>
  return (
    <div data-vista="imagen" onClick={() => setReal(r => !r)} title={real ? 'Pulsa para ajustarla a la pantalla' : 'Pulsa para verla a tamaño real'}
      style={{ flex: 1, minHeight: 0, overflow: 'auto', display: 'flex', cursor: real ? 'zoom-out' : 'zoom-in' }}>
      <img src={url} alt={fila.nombre} style={real ? { margin: 'auto', maxWidth: 'none' } : { margin: 'auto', maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}/>
    </div>)
}

// ── El visor a pantalla completa ──
// Props: lista (filas), indice, tituloTesis, urls, onIr(indice), onCierra, onDescargar(fila), extraBarra (botones de más). Esc y × cierran; las flechas pasan de archivo.
export function Visor({ lista, indice, tituloTesis, urls = {}, onIr, onCierra, onDescargar, extraBarra = null }) {
  const n = lista.length, fila = lista[indice]
  const ir = (d) => { if (n > 1) onIr?.((indice + d + n) % n) }
  // Las teclas, solo mientras está abierto, y antes que nadie (la página abre el buscador de símbolos con las teclas sueltas).
  useEffect(() => {
    const tecla = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onCierra?.() }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); ir(-1) }
      else if (e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); ir(1) }
    }
    window.addEventListener('keydown', tecla, true)
    return () => window.removeEventListener('keydown', tecla, true)
  })
  if (!fila) return null
  const url = urls[fila.ruta]
  const botonBarra = { ...S.boton, padding: '5px 10px', fontSize: 13, textDecoration: 'none', whiteSpace: 'nowrap' }
  return (
    // zIndex: por encima de la cabecera y los menús de la app (hasta 300) y por debajo del «?» (1000), que sale desde dentro.
    <div data-visor role="dialog" aria-modal="true" aria-label={fila.nombre} style={{ position: 'fixed', inset: 0, zIndex: 900, background: 'rgba(5, 8, 12, 0.96)', display: 'flex', flexDirection: 'column', fontFamily: B.letra, fontSize: B.base, color: B.texto }}>
      <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', background: B.tarjeta, borderBottom: `1px solid ${B.borde}`, flexWrap: 'wrap' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
          <button data-visor-anterior aria-label="Anterior" disabled={n < 2} onClick={() => ir(-1)} style={{ ...S.enlace, fontSize: 20, padding: '0 6px', color: n < 2 ? B.apagado : B.texto }}>‹</button>
          <span data-visor-cuenta>{indice + 1} de {n}</span>
          <button data-visor-siguiente aria-label="Siguiente" disabled={n < 2} onClick={() => ir(1)} style={{ ...S.enlace, fontSize: 20, padding: '0 6px', color: n < 2 ? B.apagado : B.texto }}>›</button>
        </span>
        <EtiquetaTipo nombre={fila.nombre}/>
        <span title={fila.nombre} style={{ fontWeight: 600, color: B.titulo, minWidth: 0, maxWidth: '40%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fila.nombre}</span>
        <span style={{ ...S.apagado, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tamanoLegible(fila.bytes)} · de la tesis «{tituloTesis}»</span>
        <div style={{ flex: 1 }}/>
        {extraBarra}
        <button data-visor-descargar onClick={() => onDescargar?.(fila)} style={botonBarra}>Descargar</button>
        {url && <a data-visor-pestana href={url} target="_blank" rel="noopener noreferrer" style={botonBarra}>Abrir en pestaña nueva</a>}
        <button data-visor-cerrar aria-label="Cerrar" title="Cerrar" onClick={() => onCierra?.()} style={{ ...S.enlace, color: B.texto, fontSize: 22, padding: '0 8px' }}>×</button>
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: 12 }}>
        <VistaArchivo key={fila.id} fila={fila} url={url} onDescargar={onDescargar}/>
      </div>
      {n > 1 && (
        <div data-visor-tira style={{ flex: 'none', display: 'flex', gap: 8, padding: '8px 14px', overflowX: 'auto', background: B.tarjeta, borderTop: `1px solid ${B.borde}` }}>
          {lista.map((f, k) => (
            <button key={f.id} data-visor-miniatura={f.id} aria-current={k === indice ? 'true' : undefined} title={f.nombre} onClick={() => onIr?.(k)}
              style={{ flex: 'none', width: 84, padding: 0, cursor: 'pointer', overflow: 'hidden', borderRadius: 6, background: B.fondo, border: `2px solid ${k === indice ? AZUL : B.borde}` }}>
              <Miniatura fila={f} url={urls[f.ruta]} alto={52}/>
            </button>))}
        </div>)}
    </div>)
}
