// components/PanelAlertas.js — las ALERTAS NUEVAS en la app (docs/builder.md §218; boceto bocetos/alertas-desde-cero.html):
//   useAlertas()      el estado: todas las alertas y los últimos saltos del usuario, recargados cada minuto y al volver a la pestaña
//                     (el comprobador de Windows, scripts/alertas/, escribe los saltos en la base).
//   PanelAlertas      la pestaña «Alertas» junto a «Resumen»: las alertas de ESTE valor, cuánto les falta, y «Saltaron».
//   VentanaAlerta     la ventana «Nueva alerta» / «Cambiar alerta» con la frase «Así se lee».
// La 🔔 de siempre (tabla alarms) sigue igual hasta que lo nuevo lo tenga todo (norma del mapa).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MONO } from '../lib/utils'
import { hayConfigSupabase, ctxConSesion } from '../lib/supabase'
import { leerAlertas, leerSaltos, guardarAlerta, cambiarAlerta, borrarAlerta, marcarVistos } from '../lib/alertas/guardadas'
import { validaAlerta, sentidoToca, fmt } from '../lib/alertas/motor'
import { resumenAlerta, asiSeLee, distancia, textoDistancia, TEXTO_DESPUES, CUANDO_SE_MIRA, fechaEs } from '../lib/alertas/pantalla'
import Ayuda from './BuilderAyuda'
import FilasAlerta from './FilasAlerta'

const RECARGA_MS = 60 * 1000
// §219: cómo se dibujan las líneas de alerta en el gráfico (una sola forma para todas; se recuerda en el navegador, como los dibujos).
// trazo: el estilo de línea de lightweight-charts (0 continua, 2 discontinua, 1 puntos). Por defecto amarillas y discontinuas, para no
// confundirlas con las operaciones (verdes y rojas); ▲ / ▼ junto al precio dice si avisa al subir o al bajar.
export const ESTILO_LINEAS_DEFECTO = Object.freeze({ color: '#ffd166', grosor: 1, trazo: 2 })
export const COLORES_LINEAS = Object.freeze(['#ffd166', '#ff9f43', '#e6edf3', '#00d4ff', '#b388ff', '#ff6ec7'])
export const TRAZOS_LINEAS = Object.freeze([[2, 'discontinua', '- - -'], [0, 'continua', '———'], [1, 'de puntos', '· · ·']])
export function useEstiloLineas() {
  const [e, setE] = useState(ESTILO_LINEAS_DEFECTO)
  useEffect(() => { try { const v = JSON.parse(localStorage.getItem('alertas.estiloLineas') || 'null'); if (v && typeof v.color === 'string') setE({ ...ESTILO_LINEAS_DEFECTO, ...v }) } catch (_) {} }, [])
  const pon = useCallback((c) => setE(x => { const n = { ...x, ...c }; try { localStorage.setItem('alertas.estiloLineas', JSON.stringify(n)) } catch (_) {} return n }), [])
  return [e, pon]
}
const VERDE = '#00e5a0', ROJO = '#ff4d6d', AMARILLO = '#ffd166', GRIS = 'var(--text3)'

// activo: false mientras no hay sesión iniciada (no se pide nada: un 401 haría saltar «Tu sesión ha caducado»).
export function useAlertas({ ctx: ctxProp, activo = true } = {}) {
  const ctx = useMemo(() => (ctxProp !== undefined ? ctxProp : hayConfigSupabase() ? ctxConSesion() : null), [ctxProp])
  const [alertas, setAlertas] = useState([])
  const [saltos, setSaltos] = useState([])
  const [error, setError] = useState(null)
  const vivo = useRef(true)
  const recarga = useCallback(async () => {
    if (!ctx || !activo) return
    try {
      const [a, s] = await Promise.all([leerAlertas(ctx), leerSaltos(ctx, null, 200)])
      if (!vivo.current) return
      setAlertas(Array.isArray(a) ? a : []); setSaltos(Array.isArray(s) ? s : []); setError(null)
    } catch (e) { if (vivo.current) setError(e.message) }
  }, [ctx, activo])
  useEffect(() => {
    vivo.current = true
    recarga()
    const t = setInterval(recarga, RECARGA_MS)
    const alVolver = () => { if (document.visibilityState === 'visible') recarga() }
    document.addEventListener('visibilitychange', alVolver)
    return () => { vivo.current = false; clearInterval(t); document.removeEventListener('visibilitychange', alVolver) }
  }, [recarga])
  // Cambios con la lista al día al momento (y luego se lee de la base).
  const guardar = useCallback(async (a) => { const fila = await guardarAlerta(ctx, a); setAlertas(xs => [fila, ...xs.filter(x => x.id !== fila.id)]); recarga(); return fila }, [ctx, recarga])
  const cambiar = useCallback(async (id, cambios) => { setAlertas(xs => xs.map(x => (x.id === id ? { ...x, ...cambios } : x))); try { await cambiarAlerta(ctx, id, cambios) } finally { recarga() } }, [ctx, recarga])
  const borrar = useCallback(async (id) => { setAlertas(xs => xs.filter(x => x.id !== id)); try { await borrarAlerta(ctx, id) } finally { recarga() } }, [ctx, recarga])
  const vistos = useCallback(async (q) => { setSaltos(xs => xs.map(x => ((q.ids ? q.ids.includes(x.id) : x.simbolo === q.simbolo) ? { ...x, visto: true } : x))); try { await marcarVistos(ctx, q) } finally { recarga() } }, [ctx, recarga])
  const sinVer = saltos.filter(s => !s.visto).length
  useEffect(() => { if (!activo) { setAlertas([]); setSaltos([]); setError(null) } }, [activo])
  return { alertas, saltos, error, sinVer, recarga, guardar, cambiar, borrar, vistos, disponible: !!ctx && activo }
}

const boton = (extra = {}) => ({ background: 'transparent', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text2)', fontFamily: MONO, fontSize: 10, padding: '2px 6px', cursor: 'pointer', ...extra })
const hora = (ts) => { const d = new Date(ts); if (Number.isNaN(d.getTime())) return ''; const p = (n) => String(n).padStart(2, '0'); return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}` }

const AYUDA = 'Cómo funcionan las alertas\n\n' +
  '• Se miran SOLAS, aunque la app esté cerrada: una tarea de Windows cada 15 minutos, de lunes a viernes de 09:00 a 23:00 (hace falta el PC encendido y la base en marcha).\n' +
  '• Cuando una salta, te llega una notificación de Windows y queda aquí, en «Saltaron», en rojo hasta que pulses «✓ Vista».\n' +
  '• «Toca el precio» mira el máximo y el mínimo del día, no solo el cierre: salta aunque solo toque el precio un momento entre dos pasadas.\n' +
  'Ejemplo: «Toca 100» con el precio a 95; a las 16:40 sube a 100,30 y a las 16:45 ya está en 99,80. La pasada de las 16:45 ve que el máximo del día es 100,30 y avisa.\n' +
  '• «Cierra por encima / por debajo» y «Condición» se miran al cierre (pasadas de después de las 22:00).\n' +
  '• Aquí salen TODAS tus alertas: arriba las del valor del gráfico (con lo que le falta al precio), debajo las de los demás (pulsa el valor para abrir su gráfico).\n' +
  '• Las líneas discontinuas del gráfico son tus alertas de precio (en la lista, ▲ avisa al subir y ▼ al bajar; su color y grosor, en «Líneas»). Pulsa una (en el gráfico o en esta lista) para elegirla: la puedes mover arrastrándola o con las flechas ↑ ↓ del teclado (cada pulsación, un 0,1 % del precio; con Mayúsculas, un 1 %), Supr la borra y Esc la suelta. Al crear una alerta queda elegida. Pulsar en cualquier otro punto del gráfico vuelve a «Resumen». Doble clic en el gráfico o 🎯 crea una nueva en ese precio.'

// ── La pestaña «Alertas»: TODAS las alertas de la app (§220); las del valor del gráfico, arriba y con lo que les falta ──
export function PanelAlertas({ simbolo, ahora, estado, onNueva, onEditar, onIrAValor = null, onElegir = null, elegida = null, estiloLineas = null, onEstiloLineas = null }) {
  const sim = String(simbolo || '').toUpperCase()
  const [fallo, setFallo] = useState(null)
  const [verLineas, setVerLineas] = useState(false)
  const [verApagadas, setVerApagadas] = useState(false)
  useEffect(() => { if (elegida) document.querySelector(`[data-alerta="${elegida}"]`)?.scrollIntoView({ block: 'nearest' }) }, [elegida])
  const todas = estado.alertas || []
  const deEste = todas.filter(a => a.simbolo === sim && a.activa)
  const otras = todas.filter(a => a.simbolo !== sim && a.activa).sort((x, y) => x.simbolo.localeCompare(y.simbolo))
  const apagadas = todas.filter(a => !a.activa)
  const saltos = estado.saltos || []
  const sinVer = saltos.filter(s => !s.visto)
  const prueba = (pr) => pr.catch(e => setFallo(e.message))
  const nombreValor = (s) => (onIrAValor && s !== sim
    ? <button onClick={() => onIrAValor(s)} title={`Abrir el gráfico de ${s}`} style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--accent)', fontFamily: MONO, fontSize: 11, fontWeight: 700 }}>{s}</button>
    : <span style={{ color: 'var(--text2)', fontSize: 11, fontWeight: 700 }}>{s}</span>)
  const fila = (a, { conValor }) => {
    const d = a.simbolo === sim ? distancia(a, ahora) : null, desarmada = a.despues === 'cada_vez' && a.armada === false
    const baja = a.regla?.sentido === 'baja' || a.regla?.lado === 'debajo'
    return (
      <div key={a.id} data-alerta={a.id} data-elegida={elegida === a.id ? '1' : undefined} onClick={onElegir ? (e) => { if (!e.target.closest('button')) onElegir(a) } : undefined} title={onElegir ? (a.simbolo === sim ? 'Elegir su línea en el gráfico (↑ ↓ la mueven, Supr la borra)' : `Abrir el gráfico de ${a.simbolo} con esta alerta`) : undefined} style={{ cursor: onElegir ? 'pointer' : 'default', padding: '5px 10px', borderBottom: '1px solid var(--border)', opacity: a.activa ? 1 : 0.55, background: elegida === a.id ? 'rgba(255,209,102,0.12)' : 'transparent', borderLeft: elegida === a.id ? '2px solid #ffd166' : '2px solid transparent' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span title={a.tipo === 'condicion' || a.tipo === 'movimiento' ? '' : baja ? 'Avisa al bajar' : 'Avisa al subir'} style={{ width: 12, flexShrink: 0, fontSize: 10, color: estiloLineas?.color || AMARILLO }}>{a.tipo === 'condicion' ? '◆' : a.tipo === 'movimiento' ? '%' : baja ? '▼' : '▲'}</span>
          {conValor && nombreValor(a.simbolo)}
          <span style={{ flex: 1, fontSize: 12, color: 'var(--text)', fontWeight: 600, minWidth: 0 }} title={asiSeLee(a)}>{resumenAlerta(a)}</span>
          <button onClick={() => prueba(estado.cambiar(a.id, a.activa ? { activa: false } : { activa: true, armada: true }))} title={a.activa ? 'Apagar (no avisa hasta que la enciendas)' : 'Volver a encender'} style={boton()}>{a.activa ? '⏸' : '↻'}</button>
          <button onClick={() => onEditar(a)} title="Cambiar" style={boton()} disabled={a.tipo === 'estrategia'}>✎</button>
          <button data-borrar-alerta={a.id} onClick={() => prueba(estado.borrar(a.id))} title="Borrar la alerta (sin preguntar)" style={boton({ color: ROJO })}>🗑</button>
        </div>
        <div style={{ fontSize: 10, color: GRIS, marginTop: 2, paddingLeft: 18 }}>
          {[d != null ? `${textoDistancia(d)} del precio` : null, CUANDO_SE_MIRA[a.tipo], TEXTO_DESPUES[a.despues], a.caduca ? `hasta el ${fechaEs(a.caduca)}` : null].filter(Boolean).join(' · ')}
          {desarmada && <span style={{ color: AMARILLO }}> · esperando a que deje de cumplirse</span>}
          {!a.activa && a.ultimo_salto ? <span> · saltó el {hora(a.ultimo_salto)}</span> : null}
        </div>
        {a.nota && <div style={{ fontSize: 10, color: 'var(--text2)', marginTop: 2, paddingLeft: 18, fontStyle: 'italic' }}>{a.nota}</div>}
      </div>
    )
  }
  const titulo = (t, extra = null) => <div style={{ display: 'flex', alignItems: 'center', padding: '8px 10px 3px', fontSize: 10, color: GRIS, letterSpacing: '0.06em' }}><span style={{ flex: 1 }}>{t}</span>{extra}</div>
  return (
    <div data-panel-alertas style={{ fontFamily: MONO }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderBottom: '1px solid var(--border)' }}>
        <span style={{ fontSize: 11, color: 'var(--text2)', flex: 1 }}>{sim}{typeof ahora === 'number' ? <> · ahora <b style={{ color: 'var(--text)' }}>{fmt(ahora)}</b></> : null}</span>
        <Ayuda texto={AYUDA}/>
        {onEstiloLineas && <button data-ver-lineas onClick={() => setVerLineas(v => !v)} title="Color, grosor y trazo de las líneas de alerta del gráfico" style={boton()}>Líneas {verLineas ? '▴' : '▾'}</button>}
        <button data-nueva-alerta onClick={onNueva} title={`Nueva alerta en ${sim}`} style={boton({ color: 'var(--accent)', borderColor: 'var(--accent)' })} disabled={!estado.disponible}>+ Nueva</button>
      </div>
      {verLineas && onEstiloLineas && estiloLineas && (
        <div data-estilo-lineas style={{ padding: '6px 10px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 6, fontSize: 10, color: GRIS }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>Color
            {COLORES_LINEAS.map(c => <button key={c} onClick={() => onEstiloLineas({ color: c })} title={c} style={{ width: 16, height: 16, borderRadius: 3, background: c, cursor: 'pointer', border: estiloLineas.color === c ? '2px solid var(--text)' : '1px solid var(--border)', padding: 0 }}/>)}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>Grosor
            {[1, 2, 3].map(g => <button key={g} onClick={() => onEstiloLineas({ grosor: g })} style={boton({ color: estiloLineas.grosor === g ? 'var(--accent)' : 'var(--text2)', borderColor: estiloLineas.grosor === g ? 'var(--accent)' : 'var(--border)' })}>{g}</button>)}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>Trazo
            {TRAZOS_LINEAS.map(([v, n, d]) => <button key={v} onClick={() => onEstiloLineas({ trazo: v })} title={n} style={boton({ color: estiloLineas.trazo === v ? 'var(--accent)' : 'var(--text2)', borderColor: estiloLineas.trazo === v ? 'var(--accent)' : 'var(--border)' })}>{d}</button>)}
          </div>
        </div>)}
      {(estado.error || fallo) && <div style={{ padding: '4px 10px', fontSize: 10, color: ROJO }}>⚠ {fallo || estado.error}</div>}
      {titulo(`EN ${sim} (${deEste.length})`)}
      {!deEste.length && <div style={{ padding: '2px 10px 8px', fontSize: 11, color: GRIS }}>Ninguna encendida. Pulsa «+ Nueva», 🎯 o haz doble clic en el gráfico en el precio que quieras.</div>}
      {deEste.map(a => fila(a, { conValor: false }))}
      {titulo(`EN OTROS VALORES (${otras.length})`)}
      {!otras.length && <div style={{ padding: '2px 10px 8px', fontSize: 11, color: GRIS }}>Ninguna.</div>}
      {otras.map(a => fila(a, { conValor: true }))}
      {apagadas.length > 0 && titulo(`APAGADAS (${apagadas.length})`, <button data-ver-apagadas onClick={() => setVerApagadas(v => !v)} style={boton()}>{verApagadas ? 'Ocultar ▴' : 'Ver ▾'}</button>)}
      {verApagadas && apagadas.map(a => fila(a, { conValor: true }))}
      {titulo(<>SALTARON{sinVer.length ? <span style={{ color: ROJO }}> · {sinVer.length} sin ver</span> : ''}</>, sinVer.length > 1 ? <button onClick={() => prueba(estado.vistos({ ids: sinVer.map(s => s.id) }))} style={boton()}>✓ Todas vistas</button> : null)}
      {!saltos.length && <div style={{ padding: '2px 10px 10px', fontSize: 10, color: GRIS }}>Todavía ninguna.</div>}
      {saltos.slice(0, 50).map(s => (
        <div key={s.id} data-salto={s.id} style={{ padding: '4px 10px', borderBottom: '1px solid var(--border)', background: s.visto ? 'transparent' : 'rgba(255,77,109,0.08)' }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span onClick={onIrAValor ? () => onIrAValor(s.simbolo) : undefined} title={onIrAValor ? `Abrir el gráfico de ${s.simbolo}` : ''} style={{ flex: 1, fontSize: 11, color: s.visto ? 'var(--text2)' : ROJO, fontWeight: s.visto ? 400 : 700, cursor: onIrAValor ? 'pointer' : 'default' }}>{s.detalle?.titulo || s.simbolo}</span>
            {!s.visto && <button onClick={() => prueba(estado.vistos({ ids: [s.id] }))} style={boton()}>✓ Vista</button>}
          </div>
          <div style={{ fontSize: 10, color: GRIS }}>{hora(s.cuando)}{s.detalle?.texto ? ` · ${s.detalle.texto}` : ''}</div>
        </div>
      ))}
    </div>
  )
}

// ── La ventana «Nueva alerta» ──
const TIPOS_VENTANA = [['toca', 'Toca el precio'], ['cierra', 'Cierra por encima / por debajo'], ['movimiento', 'Se mueve un %'], ['condicion', 'Condición del catálogo']]
const campo = { background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: MONO, fontSize: 12, padding: '5px 8px', borderRadius: 4 }
const etiqueta = { fontSize: 10, color: '#7a9bc0', marginBottom: 3, display: 'block' }
const aNumero = (t) => { const s = String(t ?? '').trim(); if (!s) return NaN; const n = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s); return Number.isFinite(n) ? n : NaN }

export function VentanaAlerta({ inicial, ahora, onGuardar, onCerrar }) {
  const [a, setA] = useState(inicial)
  const [nivelTxt, setNivelTxt] = useState(inicial?.regla?.nivel != null ? String(inicial.regla.nivel).replace('.', ',') : '')
  const [pctTxt, setPctTxt] = useState(inicial?.regla?.pct != null ? String(inicial.regla.pct).replace('.', ',') : '5')
  const [guardando, setGuardando] = useState(false)
  const [fallo, setFallo] = useState(null)
  useEffect(() => { const k = (e) => { if (e.key === 'Escape' && !document.querySelector('[data-catalogo-alerta]')) { e.stopPropagation(); onCerrar() } }; window.addEventListener('keydown', k, true); return () => window.removeEventListener('keydown', k, true) }, [onCerrar])
  const editando = !!inicial?.id
  // La alerta tal como quedaría con lo escrito.
  const final = useMemo(() => {
    const r = a.regla || {}, nivel = aNumero(nivelTxt), pct = aNumero(pctTxt)
    if (a.tipo === 'toca') return { ...a, regla: { nivel, sentido: sentidoToca(nivel, ahora) || r.sentido || 'sube' } }
    if (a.tipo === 'cierra') return { ...a, regla: { nivel, lado: r.lado || (Number.isFinite(nivel) && typeof ahora === 'number' && nivel < ahora ? 'debajo' : 'encima') } }
    if (a.tipo === 'movimiento') return { ...a, regla: { pct, sentido: r.sentido || 'baja' } }
    return a
  }, [a, nivelTxt, pctTxt, ahora])
  const errores = validaAlerta(final)
  const sinFilas = a.tipo === 'condicion' && !(a.regla?.filas || []).length
  const pon = (cambios) => setA(x => ({ ...x, ...cambios }))
  const ponRegla = (cambios) => setA(x => ({ ...x, regla: { ...(x.regla || {}), ...cambios } }))
  const guarda = async () => {
    if (errores.length) return
    setGuardando(true); setFallo(null)
    try { await onGuardar(final); onCerrar() } catch (e) { setFallo(e.message); setGuardando(false) }
  }
  const radio = (valor, actual, texto, onSel) => (
    <label key={valor} style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text)', cursor: 'pointer', marginBottom: 3 }}>
      <input type="radio" checked={actual === valor} onChange={() => onSel(valor)} style={{ margin: 0, width: 'auto' }}/>{texto}
    </label>)
  return (
    <div onMouseDown={(e) => { if (e.target === e.currentTarget) onCerrar() }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 990, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div data-ventana-alerta style={{ width: a.tipo === 'condicion' ? 620 : 430, maxWidth: '94vw', maxHeight: '92vh', overflowY: 'auto', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: 16, fontFamily: MONO, boxShadow: '0 10px 40px rgba(0,0,0,0.5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{editando ? 'Cambiar alerta' : 'Nueva alerta'} · {a.simbolo}</span>
          <button onClick={onCerrar} style={boton({ fontSize: 13, border: 'none' })}>✕</button>
        </div>
        {typeof ahora === 'number' && <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 10 }}>Valor ahora: <b style={{ color: 'var(--text)' }}>{fmt(ahora)}</b></div>}
        <label style={etiqueta}>Cuándo</label>
        <select value={a.tipo} onChange={e => { const t = e.target.value; pon({ tipo: t, regla: t === 'condicion' ? { filas: [] } : {} }) }} style={{ ...campo, width: '100%', marginBottom: 10 }}>
          {TIPOS_VENTANA.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
        </select>
        {(a.tipo === 'toca' || a.tipo === 'cierra') && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 10 }}>
            {a.tipo === 'cierra' && (
              <div><label style={etiqueta}>Cierra por</label>
                <select value={final.regla.lado} onChange={e => ponRegla({ lado: e.target.value })} style={campo}>
                  <option value="encima">encima de</option><option value="debajo">debajo de</option>
                </select></div>)}
            <div style={{ flex: 1 }}><label style={etiqueta}>Precio</label>
              <input data-campo="nivel" value={nivelTxt} onChange={e => setNivelTxt(e.target.value)} inputMode="decimal" style={{ ...campo, width: '100%', fontWeight: 700, border: '1px solid var(--accent)' }}/></div>
          </div>)}
        {a.tipo === 'toca' && Number.isFinite(final.regla.nivel) && typeof ahora === 'number' && (
          <div style={{ fontSize: 10, color: GRIS, marginTop: -6, marginBottom: 10 }}>
            {final.regla.sentido === 'sube' ? 'Está por encima del precio de ahora: avisará al SUBIR hasta él.' : 'Está por debajo del precio de ahora: avisará al BAJAR hasta él.'} {textoDistancia(distancia(final, ahora))} del precio.
          </div>)}
        {a.tipo === 'movimiento' && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 10 }}>
            <div><label style={etiqueta}>Si</label>
              <select value={final.regla.sentido} onChange={e => ponRegla({ sentido: e.target.value })} style={campo}>
                <option value="baja">cae</option><option value="sube">sube</option><option value="ambos">sube o cae</option>
              </select></div>
            <div style={{ width: 90 }}><label style={etiqueta}>un %</label>
              <input data-campo="pct" value={pctTxt} onChange={e => setPctTxt(e.target.value)} inputMode="decimal" style={{ ...campo, width: '100%', fontWeight: 700 }}/></div>
            <span style={{ fontSize: 11, color: 'var(--text2)', paddingBottom: 6 }}>desde el cierre de ayer</span>
          </div>)}
        {a.tipo === 'condicion' && (
          <div style={{ marginBottom: 10 }}>
            <label style={etiqueta}>Avisa al cierre del día en que se cumpla todo esto</label>
            <FilasAlerta simbolo={a.simbolo} filas={a.regla?.filas || []} onCambia={filas => ponRegla({ filas })}/>
          </div>)}
        <label style={etiqueta}>Después de saltar</label>
        <div style={{ marginBottom: 10 }}>
          {radio('una_vez', a.despues, 'Una vez (se apaga)', v => pon({ despues: v }))}
          {radio('una_al_dia', a.despues, 'Una vez al día', v => pon({ despues: v }))}
          {radio('cada_vez', a.despues, 'Cada vez que vuelva a pasar', v => pon({ despues: v }))}
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
          <span style={{ ...etiqueta, marginBottom: 0 }}>Caduca</span>
          {radio('nunca', a.caduca ? 'dia' : 'nunca', 'Nunca', () => pon({ caduca: null }))}
          {radio('dia', a.caduca ? 'dia' : 'nunca', 'El día…', () => pon({ caduca: a.caduca || new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10) }))}
          {a.caduca && <input type="date" value={a.caduca} onChange={e => pon({ caduca: e.target.value || null })} style={campo}/>}
        </div>
        <label style={etiqueta}>Nota (¿por qué la pones?)</label>
        <textarea value={a.nota || ''} onChange={e => pon({ nota: e.target.value.slice(0, 2000) || null })} rows={2} style={{ ...campo, width: '100%', resize: 'vertical', marginBottom: 10 }}/>
        <div data-asi-se-lee style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px', fontSize: 11, color: 'var(--text)', lineHeight: 1.5, marginBottom: 10 }}>
          <div style={{ fontSize: 10, color: '#7a9bc0', marginBottom: 3 }}>Así se lee</div>
          {errores.length ? <span style={{ color: GRIS }}>…</span> : asiSeLee(final)}
        </div>
        {errores.length > 0 && !sinFilas && !((a.tipo === 'toca' || a.tipo === 'cierra') && !nivelTxt.trim()) && <div style={{ fontSize: 11, color: ROJO, marginBottom: 8 }}>{errores.join(' ')}</div>}
        {fallo && <div style={{ fontSize: 11, color: ROJO, marginBottom: 8 }}>⚠ {fallo}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onCerrar} style={boton({ fontSize: 12, padding: '5px 12px' })}>Cancelar</button>
          <button onClick={guarda} disabled={!!errores.length || guardando} style={boton({ fontSize: 12, padding: '5px 12px', color: '#000', background: errores.length ? 'var(--border)' : 'var(--accent)', borderColor: 'var(--accent)', fontWeight: 700 })}>
            {guardando ? 'Guardando…' : editando ? 'Guardar' : 'Crear alerta'}
          </button>
        </div>
      </div>
    </div>
  )
}
