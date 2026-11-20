// components/VentanaIndicadores.js — la ventana «Indicadores» del gráfico de un valor (docs/builder.md §212; boceto
// bocetos/grafico-indicadores-alertas.html, pestaña 2), como la de TradingView: grupos a la izquierda, buscador con ✕ y la lista.
// Un clic añade el indicador con sus valores por defecto (se configura después como siempre: doble clic en su nombre, en la leyenda).
// La ventana sigue abierta para poder añadir varios; abajo, lo que ya hay en el gráfico. ☆ marca favoritos (en el navegador).
import { useEffect, useState } from 'react'
import { CATALOGO_INDICADORES, rotuloIndicador } from '../lib/indicadores'
import { GRUPOS, listaIndicadores, textoDonde } from '../lib/indicadoresVentana'

import { MONO } from '../lib/utils'
const CLAVE_FAV = 'indicadores.favoritos'
const leeFav = () => { try { const j = JSON.parse(localStorage.getItem(CLAVE_FAV) || '[]'); return Array.isArray(j) ? j : [] } catch (_) { return [] } }

export default function VentanaIndicadores({ enGrafico = [], onAnadir, onCerrar }) {
  const [grupo, setGrupo] = useState('todos')
  const [busca, setBusca] = useState('')
  const [fav, setFav] = useState([])
  useEffect(() => { setFav(leeFav()) }, [])
  useEffect(() => {
    const k = e => { if (e.key === 'Escape') { e.stopPropagation(); onCerrar?.() } }
    window.addEventListener('keydown', k, true)
    return () => window.removeEventListener('keydown', k, true)
  }, [onCerrar])
  const alternaFav = (t) => { const n = fav.includes(t) ? fav.filter(x => x !== t) : [...fav, t]; setFav(n); try { localStorage.setItem(CLAVE_FAV, JSON.stringify(n)) } catch (_) {} }
  const lista = listaIndicadores(grupo, busca, fav)
  const puestos = enGrafico.filter(i => i && CATALOGO_INDICADORES[i.tipo])
  return (
    <div data-ventana-indicadores="" onClick={e => { if (e.target === e.currentTarget) onCerrar?.() }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 640, maxWidth: '94vw', height: 420, maxHeight: '86vh', background: '#0d1824', border: '1px solid #1e3a52', borderRadius: 8,
        boxShadow: '0 10px 40px rgba(0,0,0,0.7)', display: 'flex', flexDirection: 'column', fontFamily: MONO, fontSize: 12, color: '#c8dff5' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', borderBottom: '1px solid #1e3a52' }}>
          <b style={{ fontSize: 14, color: '#e2eaf5' }}>Indicadores</b>
          <span onClick={onCerrar} title="Cerrar (Esc)" style={{ cursor: 'pointer', color: '#7a9bc0', fontSize: 15 }}>✕</span>
        </div>
        <div style={{ padding: '10px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, border: '1px solid #1e3a52', borderRadius: 4, padding: '5px 8px', background: '#0a1320' }}>
            <span>🔍</span>
            <input autoFocus value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar (p. ej. «media», «rsi», «bandas»)"
              style={{ flex: 1, background: 'none', border: 0, color: '#e2eaf5', font: 'inherit', outline: 'none' }} />
            {busca && <span data-limpia="" onClick={() => setBusca('')} title="Limpiar" style={{ cursor: 'pointer', color: '#7a9bc0' }}>✕</span>}
          </div>
        </div>
        <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
          <div style={{ width: 180, borderRight: '1px solid #1e3a52', padding: 6 }}>
            {GRUPOS.map(g => (
              <div key={g.id} data-grupo={g.id} onClick={() => setGrupo(g.id)}
                style={{ padding: '6px 10px', borderRadius: 4, cursor: 'pointer', background: grupo === g.id ? 'rgba(0,212,255,0.12)' : 'transparent', color: grupo === g.id ? '#00d4ff' : '#c8dff5' }}>
                {g.nombre}
              </div>
            ))}
          </div>
          <div style={{ flex: 1, padding: 6, overflowY: 'auto' }}>
            {lista.map(t => (
              <div key={t} data-indicador={t} onClick={() => onAnadir?.(t)} title="Añadir al gráfico (con sus valores por defecto; doble clic en su nombre, en la leyenda, para configurarlo)"
                onMouseOver={e => { e.currentTarget.style.background = 'rgba(0,212,255,0.08)' }} onMouseOut={e => { e.currentTarget.style.background = 'transparent' }}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 10px', borderRadius: 4, cursor: 'pointer' }}>
                <span>{CATALOGO_INDICADORES[t].nombre}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: '#5a7a95', fontSize: 10.5 }}>{textoDonde(t)}</span>
                  <span data-fav={t} title={fav.includes(t) ? 'Quitar de favoritos' : 'Marcar como favorito'} onClick={e => { e.stopPropagation(); alternaFav(t) }}
                    style={{ color: '#ffd166', fontSize: 14, cursor: 'pointer' }}>{fav.includes(t) ? '★' : '☆'}</span>
                </span>
              </div>
            ))}
            {!lista.length && <div style={{ padding: 10, color: '#5a7a95' }}>{grupo === 'favoritos' && !busca ? 'Aún no tienes favoritos: márcalos con ☆.' : 'Ninguno con esa búsqueda.'}</div>}
          </div>
        </div>
        <div data-en-grafico="" style={{ padding: '8px 14px', borderTop: '1px solid #1e3a52', fontSize: 11, color: '#7a9bc0' }}>
          En el gráfico: {puestos.length ? puestos.map(i => rotuloIndicador(i)).join(' · ') : 'ninguno'}
        </div>
      </div>
    </div>
  )
}
