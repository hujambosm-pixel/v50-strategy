// components/Replay.js — el modo REPLAY del gráfico grande de un valor (docs/builder.md §226; boceto bocetos/replay-simulacion.html v2).
// VentanaReplay: elegir la vela de inicio. BarraReplay: la barra de abajo (◀ ▶| ▶▶ ▶/⏸, velocidad, «hoy», Salir) con sus teclas.
// El estado lo lleva pages/index.js; esto solo pinta y avisa (onIr, onSalir, onEmpezar).
import { useState, useEffect, useRef } from 'react'
import { MONO } from '../lib/utils'
import Ayuda from './BuilderAyuda'
import { inicioHace, inicioAlAzar, velaDeInicio, posicion } from '../lib/replay/grafico'

const fmt = (f) => (f ? `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}` : '—')
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
const diaSemana = (f) => DIAS[new Date(f + 'T12:00:00Z').getUTCDay()]
const boton = (activo = true) => ({ pointerEvents: 'all', background: 'rgba(0,212,255,0.08)', border: '1px solid #2f5b85', color: activo ? '#e2eaf5' : '#4a6380',
  fontFamily: MONO, fontSize: 12, padding: '3px 9px', borderRadius: 3, cursor: activo ? 'pointer' : 'default', lineHeight: 1.2, flexShrink: 0 })

export const AYUDA_REPLAY = 'El Replay te pone en un día del pasado: el gráfico llega solo hasta ese día y lo vas descubriendo vela a vela, como si fuera hoy. ' +
  'Las medias, el RSI y los demás indicadores se calculan solo con las velas que ves, y se ocultan las operaciones de la estrategia y tus órdenes reales (dirían el futuro).\n\n' +
  'Teclas: → una vela · Mayús + → las de la casilla de ▶▶ (5 si no la cambias) · ← una atrás (Mayús + ←, las de la casilla) · espacio reproduce o para. ' +
  '«Ver» dice cuántas velas se ven a la vez y la ventana sigue a la última; con «Libre», la anchura que dejes con la rueda.\n\n' +
  'Ejemplo: empiezas el 02/01/2020 con una media de 20 velas. El 02/01 la media es la de las 20 velas hasta el 02/01; al avanzar al 03/01 entra la vela del 03/01 y la media cambia con ella, nunca antes.\n\n' +
  'Volver atrás cuenta como «retroceso» (cuando puedas operar, deshará lo que hiciste en las velas que vuelven a ocultarse).'

export function BotonReplay({ activo, onClick }) {
  return (
    <button onClick={onClick} data-boton-replay="" title={activo ? 'Salir del Replay' : 'Replay: vuelve a un día del pasado y descubre el gráfico vela a vela'}
      style={{ pointerEvents: 'all', background: activo ? 'rgba(255,209,102,0.18)' : 'rgba(0,212,255,0.08)', border: `1px solid ${activo ? 'rgba(255,209,102,0.6)' : '#2f5b85'}`,
        color: activo ? '#ffd166' : '#e2eaf5', fontFamily: MONO, fontSize: 10, padding: '2px 7px', borderRadius: 3, cursor: 'pointer', lineHeight: 1, flexShrink: 0, height: 18 }}>
      ⏪ Replay
    </button>)
}

export function VentanaReplay({ simbolo, velas, onEmpezar, onCancelar }) {
  const [fecha, setFecha] = useState(() => inicioHace(velas, 1))
  // Dinero, comisión y cuándo van las órdenes a mercado (se recuerdan en el navegador para la próxima vez).
  const [aj, setAj] = useState(() => { try { return { capital: '10.000', comision: '0,185', ejecucion: 'apertura', ...JSON.parse(localStorage.getItem('replay.ajustes') || '{}') } } catch (_) { return { capital: '10.000', comision: '0,185', ejecucion: 'apertura' } } })
  const numero = (s) => Number(String(s).replace(/\./g, '').replace(',', '.'))
  const capital = numero(aj.capital), comision = Number(String(aj.comision).replace(',', '.'))
  const ajustesBien = capital > 0 && comision >= 0
  const empieza = () => { if (!elegida || !ajustesBien) return; const a = { capitalInicial: capital, comision, ejecucion: aj.ejecucion }; try { localStorage.setItem('replay.ajustes', JSON.stringify({ capital: aj.capital, comision: aj.comision, ejecucion: aj.ejecucion })) } catch (_) {} onEmpezar(elegida, a) }
  const vs = Array.isArray(velas) ? velas : []
  const min = vs.length > 2 ? vs[1].date : '', max = vs.length > 2 ? vs[vs.length - 2].date : ''
  const elegida = fecha ? velaDeInicio(vs, fecha) : null
  useEffect(() => { const t = (e) => { if (e.key === 'Escape') onCancelar() }; window.addEventListener('keydown', t); return () => window.removeEventListener('keydown', t) }, [onCancelar])
  const rapido = (txt, f) => <button key={txt} onClick={() => setFecha(f())} style={boton()}>{txt}</button>
  return (
    <div data-ventana-replay="" role="dialog" aria-modal="true" onMouseDown={e => { if (e.target === e.currentTarget) onCancelar() }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 10050, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#0d1520', border: '1px solid #2f5b85', borderRadius: 6, padding: 18, width: 420, maxWidth: '100%', fontFamily: MONO, fontSize: 12, color: '#c9d6e3' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <b style={{ color: '#e2eaf5', fontSize: 14 }}>⏪ Replay de {simbolo}</b>
          <Ayuda texto={AYUDA_REPLAY} etiqueta="Qué es el Replay" zIndice={10100} />
          <span style={{ marginLeft: 'auto', cursor: 'pointer', color: '#7a9bc0' }} onClick={onCancelar} title="Cerrar">✕</span>
        </div>
        {vs.length < 3 ? <div style={{ color: '#f85149' }}>Este gráfico tiene muy pocas velas para un Replay.</div> : <>
          <div style={{ marginBottom: 6 }}>Empiezas el día:</div>
          <input type="date" value={fecha || ''} min={min} max={max} onChange={e => setFecha(e.target.value)} data-fecha-replay=""
            style={{ fontFamily: MONO, fontSize: 13, padding: '4px 6px', background: '#08101a', color: '#e2eaf5', border: '1px solid #2f5b85', borderRadius: 3, colorScheme: 'dark' }} />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '10px 0' }}>
            {rapido('Hace 1 año', () => inicioHace(vs, 1))}{rapido('Hace 2 años', () => inicioHace(vs, 2))}{rapido('Hace 5 años', () => inicioHace(vs, 5))}{rapido('Al azar', () => inicioAlAzar(vs))}
          </div>
          <div style={{ color: '#7a9bc0', marginBottom: 14 }}>
            {elegida ? <>Verás hasta el <b style={{ color: '#e2eaf5' }}>{diaSemana(elegida)} {fmt(elegida)}</b>; quedan {posicion(vs, elegida, elegida).quedan} velas por descubrir.</> : 'Elige un día.'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 10px', alignItems: 'center', marginBottom: 14 }}>
            <span>Dinero inicial</span><span><input data-capital-replay="" value={aj.capital} onChange={e => setAj(x => ({ ...x, capital: e.target.value }))} style={{ fontFamily: MONO, fontSize: 13, padding: '3px 6px', width: 110, background: '#08101a', color: '#e2eaf5', border: '1px solid #2f5b85', borderRadius: 3 }} /> €</span>
            <span>Comisión por orden</span><span><input data-comision-replay="" value={aj.comision} onChange={e => setAj(x => ({ ...x, comision: e.target.value }))} style={{ fontFamily: MONO, fontSize: 13, padding: '3px 6px', width: 70, background: '#08101a', color: '#e2eaf5', border: '1px solid #2f5b85', borderRadius: 3 }} /> € (cada compra y cada venta)</span>
            <span>A mercado</span><select value={aj.ejecucion} onChange={e => setAj(x => ({ ...x, ejecucion: e.target.value }))} data-ejecucion-replay="" style={{ fontFamily: MONO, fontSize: 12, padding: '3px 4px', width: 'auto', background: '#08101a', color: '#e2eaf5', border: '1px solid #2f5b85', borderRadius: 3 }}>
              <option value="apertura">a la apertura de la vela siguiente</option><option value="cierre">al cierre de la vela que ves</option></select>
          </div>
          {!ajustesBien && <div style={{ color: '#f85149', marginBottom: 10 }}>El dinero tiene que ser mayor que 0 y la comisión no puede ser negativa.</div>}
        </>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onCancelar} style={boton()}>Cancelar</button>
          <button onClick={empieza} disabled={!elegida || !ajustesBien} data-empezar-replay=""
            style={{ ...boton(!!elegida), background: elegida ? 'rgba(255,209,102,0.18)' : 'transparent', borderColor: 'rgba(255,209,102,0.6)', color: elegida ? '#ffd166' : '#4a6380' }}>Empezar</button>
        </div>
      </div>
    </div>)
}

// Colores y letra del boceto (bocetos/replay-simulacion.html), elegidos por Sergi el 21/11 frente a los de la barra del gráfico.
const BZ = { fondo: '#2c303b', caja: '#353945', borde: '#4c5263', texto: '#f3f3f5', gris: '#a9adb8', ambar: '#d29922', azul: '#58a6ff' }
const LETRA = 'system-ui, "Segoe UI", sans-serif'
const bz = (activo = true) => ({ background: BZ.caja, color: BZ.texto, border: `1px solid ${BZ.borde}`, borderRadius: 5, padding: '4px 9px', font: `13px/1.3 ${LETRA}`,
  cursor: activo ? 'pointer' : 'default', opacity: activo ? 1 : 0.4, flexShrink: 0 })
export const VER = [60, 120, 250, 500, 0]   // velas a la vista (0 = libre: la anchura que dejes con la rueda)

export function BarraReplay({ velas, estado, onIr, onSalir, onIndicadores, ver = 120, onVer }) {
  const [jugando, setJugando] = useState(false)
  const [vel, setVel] = useState(2)   // velas por segundo
  const [n, setN] = useState(5)       // cuántas avanza ▶▶ (y retrocede Mayús + ←)
  const p = posicion(velas, estado.desde, estado.hoy)
  const fin = p.quedan <= 0
  const cb = useRef({}); cb.current = { onIr, fin, n }
  useEffect(() => { if (fin) setJugando(false) }, [fin])
  useEffect(() => {
    if (!jugando) return
    const t = setInterval(() => { if (cb.current.fin) setJugando(false); else cb.current.onIr(1) }, 1000 / vel)
    return () => clearInterval(t)
  }, [jugando, vel])
  useEffect(() => {
    const tecla = (e) => {
      const t = e.target, tag = t?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t?.isContentEditable || e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); setJugando(false); if (!cb.current.fin) cb.current.onIr(e.shiftKey ? cb.current.n : 1) }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); setJugando(false); cb.current.onIr(e.shiftKey ? -cb.current.n : -1) }
      else if (e.key === ' ') { e.preventDefault(); e.stopPropagation(); if (!cb.current.fin) setJugando(j => !j) }
    }
    window.addEventListener('keydown', tecla, true)
    return () => window.removeEventListener('keydown', tecla, true)
  }, [])
  const b = (txt, titulo, f, activo = true, extra = {}, dato = {}) => (
    <button onClick={() => { if (activo) f() }} title={titulo} disabled={!activo} style={{ ...bz(activo), ...extra }} {...dato}>{txt}</button>)
  const sep = <div style={{ width: 1, height: 20, background: BZ.borde, margin: '0 3px' }} />
  const caja = { background: BZ.caja, color: BZ.texto, border: `1px solid ${BZ.borde}`, borderRadius: 5, padding: '4px 6px', font: `13px ${LETRA}`, width: 'auto' }
  return (
    <div data-barra-replay="" style={{ flexShrink: 0, display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center', background: BZ.fondo, border: `1px solid ${BZ.borde}`,
      borderRadius: 6, padding: '6px 8px', margin: '4px 6px', font: `13px/1.45 ${LETRA}`, color: BZ.texto }}>
      {b('◀', `Una vela atrás (←; Mayús + ←: ${n})`, () => { setJugando(false); onIr(-1) }, p.vela > 1)}
      {b(jugando ? '⏸' : '▶', jugando ? 'Pausa (espacio)' : 'Reproducir (espacio)', () => setJugando(j => !j), !fin, { minWidth: 40 })}
      <select value={vel} onChange={e => setVel(Number(e.target.value))} title="Velocidad al reproducir" style={caja}>
        {[1, 2, 5, 10].map(v => <option key={v} value={v}>{v === 1 ? '1 vela/s' : `${v}/s`}</option>)}
      </select>
      {b('▶|', 'Una vela (→)', () => { setJugando(false); onIr(1) }, !fin)}
      {b(<>▶▶ {n}</>, `${n} velas (Mayús + →)`, () => { setJugando(false); onIr(n) }, !fin, {}, { 'data-varias': '' })}
      <input type="number" value={n} min={2} max={200} title="Cuántas velas avanza ▶▶" data-n-velas=""
        onChange={e => { const v = Math.round(Number(e.target.value)); if (Number.isFinite(v)) setN(Math.min(200, Math.max(2, v))) }} style={{ ...caja, width: 56 }} />
      {sep}
      {onIndicadores && b('📈 Indicadores', 'Añadir indicadores: se calculan solo con las velas que ves', onIndicadores)}
      <span style={{ color: BZ.gris }}>Ver</span>
      <select value={ver} onChange={e => onVer && onVer(Number(e.target.value))} title="Cuántas velas se ven a la vez (al avanzar, la ventana sigue a la última)" data-ver-replay="" style={caja}>
        {VER.map(v => <option key={v} value={v}>{v || 'Libre'}</option>)}
      </select>
      <Ayuda texto={AYUDA_REPLAY} etiqueta="Qué es el Replay" />
      <span data-hoy-replay="" style={{ marginLeft: 'auto', color: BZ.ambar }}>Hoy en el replay: {diaSemana(estado.hoy)} {fmt(estado.hoy)}</span>
      <span style={{ color: BZ.gris }} title={`Empezaste el ${fmt(estado.desde)}`}>· vela {p.vela} de {p.total}{fin ? ' · última vela' : ''}</span>
      {estado.retrocesos > 0 && <span style={{ color: BZ.ambar }} title="Veces que has vuelto atrás">· {estado.retrocesos} {estado.retrocesos === 1 ? 'retroceso' : 'retrocesos'}</span>}
      {b('✕ Salir', 'Salir del Replay (vuelve el gráfico de siempre)', onSalir, true, {}, { 'data-salir-replay': '' })}
    </div>)
}
