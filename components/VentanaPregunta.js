// components/VentanaPregunta.js — la ventana de pregunta encima de todo (sin guardar, borrar) y la papelera ROJA: las mismas en Tesis (components/TesisPanel.js) y en las pestañas de planes (components/BuilderPestanas.js).
import { B, S } from '../lib/builder/estilo'

export const ROJO_PAPELERA = '#f85149'
export const Papelera = ({ tamano = 18 }) => (
  <svg width={tamano} height={tamano} viewBox="0 0 24 24" fill="none" stroke={ROJO_PAPELERA} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>
  </svg>)
export const Pregunta = ({ id, texto, detalle, aviso, extra, children }) => (
  <div data-pregunta={id} role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
    <div style={{ ...S.tarjeta, padding: 20, maxWidth: 440, width: '100%' }}>
      <div style={{ color: B.titulo, marginBottom: 16 }}>{texto}</div>
      {detalle && <div data-detalle-pregunta style={{ color: B.secundario, marginTop: -8, marginBottom: 16 }}>{detalle}</div>}
      {extra}
      {aviso && <div data-aviso-pregunta style={{ color: '#ff8b8b', marginBottom: 16 }}>⚠ {aviso}</div>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>{children}</div>
    </div>
  </div>)
