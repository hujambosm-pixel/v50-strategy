// components/MisReplays.js — «Mis replays»: la lista de los Replays guardados (docs/builder.md §232). Se abre desde el panel del Replay
// y desde el menú Seguir › Simulaciones. Solo pinta y avisa: filas (de leerSimulaciones), onAbrir(fila), onBorrar(id), onCerrar.
// La papelera roja pregunta en la misma fila («¿Borrarlo? Sí / No»): un Replay guardado no se puede recuperar.
import { useState, useEffect } from 'react'
import Ayuda from './BuilderAyuda'
import { filtraSimulaciones } from '../lib/replay/guardados'
import { Papelera } from './VentanaPregunta'

const BZ = { fondo: '#2c303b', caja: '#353945', borde: '#4c5263', texto: '#f3f3f5', gris: '#a9adb8', verde: '#3fb950', rojo: '#f85149', ambar: '#d29922', azul: '#58a6ff' }
const LETRA = 'system-ui, "Segoe UI", sans-serif'
const btn = { background: BZ.caja, color: BZ.texto, border: `1px solid ${BZ.borde}`, borderRadius: 5, padding: '3px 9px', font: `13px ${LETRA}`, cursor: 'pointer' }
const fmt = (f) => (f ? `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}` : '—')
const pc = (x) => (x == null || !Number.isFinite(x) ? '—' : `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x).toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`)

export const AYUDA_MIS_REPLAYS = 'Cada Replay se guarda solo en cuanto avanzas alguna vela u operas, con todo lo que hiciste: órdenes, operaciones, retrocesos y la vela en la que ibas. ' +
  'El nombre se cambia con el ✎ del panel del Replay.\n\n' +
  '«Abrir» lleva al gráfico de su valor y sigue donde lo dejaste. La papelera lo borra para siempre (pregunta antes).\n\n' +
  'Ejemplo: empiezas un Replay de un valor el 02/01/2020, avanzas hasta el 15/03/2020 y haces 3 operaciones; sales. En «Mis replays» sale ' +
  '«desde 02/01/2020 · vas por el 15/03/2020 · 3 operaciones» con lo que ganaste o perdiste en %; al abrirlo vuelves al 15/03/2020 con las 3 operaciones.'

export default function MisReplays({ filas, cargando = false, error = '', abiertoId = null, onAbrir, onBorrar, onCerrar, onVarios = null }) {
  const [q, setQ] = useState('')
  const [borrando, setBorrando] = useState(null)
  useEffect(() => { const t = (e) => { if (e.key === 'Escape') onCerrar() }; window.addEventListener('keydown', t); return () => window.removeEventListener('keydown', t) }, [onCerrar])
  const lista = filtraSimulaciones(filas, q)
  return (
    <div data-mis-replays="" role="dialog" aria-modal="true" onMouseDown={e => { if (e.target === e.currentTarget) onCerrar() }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 10050, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: BZ.fondo, border: `1px solid ${BZ.borde}`, borderRadius: 8, padding: 16, width: 720, maxWidth: '100%', maxHeight: '86vh', display: 'flex', flexDirection: 'column', font: `13px/1.45 ${LETRA}`, color: BZ.texto }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <b style={{ fontSize: 15 }}>📂 Mis replays</b>
          <Ayuda texto={AYUDA_MIS_REPLAYS} etiqueta="Mis replays" zIndice={10100} />
          <span style={{ position: 'relative', marginLeft: 12 }}>
            <input data-buscar-replays="" value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por nombre o valor"
              style={{ background: BZ.caja, color: BZ.texto, border: `1px solid ${BZ.borde}`, borderRadius: 5, padding: '4px 24px 4px 8px', font: `13px ${LETRA}`, width: 220 }} />
            {q && <span onClick={() => setQ('')} title="Limpiar" style={{ position: 'absolute', right: 7, top: 4, cursor: 'pointer', color: BZ.gris }}>✕</span>}
          </span>
          {onVarios && <button data-nuevo-varios="" onClick={onVarios} title="Empezar un Replay con varios valores a la vez, con una sola cuenta" style={{ marginLeft: 'auto', background: BZ.caja, color: BZ.texto, border: `1px solid ${BZ.borde}`, borderRadius: 5, padding: '3px 9px', font: `13px ${LETRA}`, cursor: 'pointer' }}>＋ Con varios valores</button>}
          <span style={{ marginLeft: onVarios ? 8 : 'auto', cursor: 'pointer', color: BZ.gris }} onClick={onCerrar} title="Cerrar (Esc)">✕</span>
        </div>
        {error && <div style={{ color: BZ.rojo, marginBottom: 8 }}>⚠ {error}</div>}
        <div style={{ overflow: 'auto', flex: 1 }}>
          {cargando ? <div style={{ color: BZ.gris }}>Cargando…</div>
            : !(filas || []).length ? <div data-sin-replays="" style={{ color: BZ.gris }}>Aún no tienes replays guardados. Empieza uno con «⏪ Replay» en el gráfico de un valor: se guarda solo en cuanto avanzas.</div>
            : !lista.length ? <div style={{ color: BZ.gris }}>Ninguno con «{q}».</div>
            : lista.map(x => {
              const e = x.estado || {}, r = e.resumen || {}, abierto = x.id === abiertoId
              return (
                <div key={x.id} data-fila-replay={x.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 4px', borderBottom: `1px solid ${BZ.caja}` }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={x.nombre}>{x.nombre}{abierto && <span style={{ color: BZ.ambar, fontWeight: 400 }}> · abierto ahora</span>}</div>
                    <div style={{ color: BZ.gris, fontSize: 12 }}>
                      {(e.valores || []).join(', ')} · desde {fmt(e.desde)} · vas por el {fmt(e.hoy)}{e.terminada ? ' · terminado' : ''} · {r.operaciones ?? 0} {r.operaciones === 1 ? 'operación' : 'operaciones'}
                    </div>
                  </div>
                  <b style={{ color: r.pct > 0 ? BZ.verde : r.pct < 0 ? BZ.rojo : BZ.texto, minWidth: 70, textAlign: 'right' }} title="Lo que ganaste o perdiste sobre el dinero inicial">{pc(r.pct)}</b>
                  <span style={{ color: BZ.gris, fontSize: 12, minWidth: 80 }} title="Última vez que se guardó">{fmt(String(x.actualizada || '').slice(0, 10))}</span>
                  {borrando === x.id
                    ? <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}><span style={{ color: BZ.rojo }}>¿Borrarlo?</span>
                        <button data-si-borrar={x.id} style={{ ...btn, borderColor: BZ.rojo, color: BZ.rojo }} onClick={() => { setBorrando(null); onBorrar(x.id) }}>Sí</button>
                        <button style={btn} onClick={() => setBorrando(null)}>No</button></span>
                    : <>
                      <button data-abrir-replay={x.id} style={{ ...btn, borderColor: BZ.azul }} onClick={() => onAbrir(x)}>Abrir</button>
                      <button data-borrar-replay={x.id} disabled={abierto} title={abierto ? 'Está abierto: sal del Replay para borrarlo' : 'Borrar este replay'}
                        onClick={() => setBorrando(x.id)} style={{ ...btn, display: 'flex', padding: '3px 6px', opacity: abierto ? 0.35 : 1, cursor: abierto ? 'default' : 'pointer' }}><Papelera tamano={16} /></button>
                    </>}
                </div>)
            })}
        </div>
      </div>
    </div>)
}
