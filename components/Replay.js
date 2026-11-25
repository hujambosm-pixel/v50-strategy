// components/Replay.js — el modo REPLAY del gráfico grande de un valor (docs/builder.md §226; boceto bocetos/replay-simulacion.html v2).
// VentanaReplay: elegir la vela de inicio. BarraReplay: la barra de abajo (◀ ▶| ▶▶ ▶/⏸, velocidad, «hoy», Salir) con sus teclas.
// El estado lo lleva pages/index.js; esto solo pinta y avisa (onIr, onSalir, onEmpezar).
import { useState, useEffect, useRef } from 'react'
import { TIPOS_SALTO } from '../lib/replay/senales'
import { MONO } from '../lib/utils'
import Ayuda from './BuilderAyuda'
import { inicioHace, inicioAlAzar, velaDeInicio, posicion, anosCargados } from '../lib/replay/grafico'
import FilasAlerta from './FilasAlerta'
import EditorConPasos from './EditorConPasos'
import MiniGraficoPasos from './MiniGraficoPasos'
import { validaConPasos } from '../lib/condiciones/conPasos'
import { conPasosNueva } from '../lib/replay/conPasosPantalla'

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

// §229: 🎯 junto a «⏪ Replay»: marcar Entrada, Stop y Objetivo con tres clics en el gráfico (pulsado otra vez, cancela).
export function BotonDiana({ activo, onClick }) {
  return (
    <button onClick={onClick} data-diana-replay="" title={activo ? 'Cancelar el marcado (Esc)' : 'Marcar una orden en el gráfico: tres clics, Entrada, Stop y Objetivo (o doble clic en el gráfico)'}
      style={{ pointerEvents: 'all', background: activo ? 'rgba(88,166,255,0.25)' : 'rgba(0,212,255,0.08)', border: `1px solid ${activo ? '#58a6ff' : '#2f5b85'}`,
        color: '#e2eaf5', fontSize: 11, padding: '1px 6px', borderRadius: 3, cursor: 'pointer', lineHeight: 1, flexShrink: 0, height: 18 }}>
      🎯
    </button>)
}

// §233: onValorAzar (opcional): «🎲 Valor al azar» cambia a otro valor de tu Watchlist; la ventana sigue abierta y se rehace con sus velas
// (cargando = aún no han llegado).
// §239: guardados (opcional) = tus replays guardados (null = cargando) y onAbrir(fila): arriba, «Seguir con uno guardado» con los de este
// valor (y «Ver todos» para los demás); debajo, «Empezar uno nuevo» como siempre.
function SeguirGuardado({ simbolo, guardados, onAbrir }) {
  const [todos, setTodos] = useState(false)
  if (!onAbrir) return null
  if (guardados == null) return <div style={{ color: '#7a9bc0', marginBottom: 12 }}>Buscando tus replays guardados…</div>
  const deEste = guardados.filter(g => (g.estado?.valores || [])[0] === simbolo), lista = todos ? guardados : deEste
  if (!guardados.length) return null
  const pc = (x) => (x == null ? '' : `${x >= 0 ? '+' : '−'}${Math.abs(x).toLocaleString('es-ES', { maximumFractionDigits: 1 })} %`)
  return (
    <div data-seguir-replay="" style={{ marginBottom: 14, paddingBottom: 12, borderBottom: '1px solid #2f5b85' }}>
      <div style={{ marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
        <b style={{ color: '#e2eaf5' }}>Seguir con uno guardado</b>
        {deEste.length < guardados.length && <span style={{ marginLeft: 'auto', color: '#58a6ff', cursor: 'pointer' }} onClick={() => setTodos(t => !t)} data-ver-todos-replay="">{todos ? `Solo ${simbolo}` : `Ver todos (${guardados.length})`}</span>}
      </div>
      {!lista.length && <div style={{ color: '#7a9bc0' }}>Ninguno de {simbolo}.</div>}
      <div style={{ maxHeight: 160, overflowY: 'auto' }}>
        {lista.map(g => <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0' }}>
          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={g.nombre}>{g.nombre}</span>
          <span style={{ color: '#7a9bc0', whiteSpace: 'nowrap' }}>hoy {fmt(g.estado?.hoy)}{g.estado?.resumen ? ` · ${pc(g.estado.resumen.pct)} · ${g.estado.resumen.operaciones} op.` : ''}</span>
          <button onClick={() => onAbrir(g)} data-abrir-guardado={g.id} style={boton()}>Seguir</button>
        </div>)}
      </div>
    </div>)
}

// §262 (pedido por Sergi el 25/11): UNA sola ventana para empezar, con un valor o con varios. «Valores»: «Solo X (el del gráfico)» → el
// Replay de siempre en el gráfico grande; una lista de la Watchlist o varios a mano → la rejilla (onEmpezarVarios). Las velas no se
// preguntan: las del gráfico que estás viendo (intervalo), como el valor.
export const MAX_VARIOS = 30
const haceAnosHoy = (n) => { const d = new Date(); d.setFullYear(d.getFullYear() - n); return d.toISOString().slice(0, 10) }
export function VentanaReplay({ simbolo, velas, onEmpezar, onCancelar, onValorAzar = null, cargando = false, guardados = undefined, onAbrir = null,
  listas = [], intervalo = 'diario', onEmpezarVarios = null, fuenteInicial = 'uno' }) {
  const [fuente, setFuente] = useState(() => { if (fuenteInicial !== 'lista') return 'uno'; const i = listas.findIndex(l => l.simbolos.length >= 2 && l.simbolos.length <= MAX_VARIOS); return i >= 0 ? `l:${i}` : 'mano' })
  const [mano, setMano] = useState('')
  const varios = fuente !== 'uno' && !!onEmpezarVarios
  const valoresVarios = fuente === 'mano' ? [...new Set(mano.toUpperCase().split(/[\s,;]+/).map(x => x.trim()).filter(x => /^[A-Z0-9.^=-]{1,20}$/.test(x)))] : (listas[Number(String(fuente).slice(2))]?.simbolos || [])
  const hoyISO = new Date().toISOString().slice(0, 10)
  const [fechaVarios, setFechaVarios] = useState(haceAnosHoy(1))
  const errorVarios = !varios ? '' : valoresVarios.length < 2 ? 'Elige al menos 2 valores.' : valoresVarios.length > MAX_VARIOS ? `Como mucho ${MAX_VARIOS} valores (tienes ${valoresVarios.length}).` : !fechaVarios || fechaVarios >= hoyISO ? 'Elige un día del pasado.' : ''
  const [fecha, setFecha] = useState(() => inicioHace(velas, 1))
  useEffect(() => { if (!fecha && Array.isArray(velas) && velas.length > 2) setFecha(inicioHace(velas, 1)) }, [velas])   // §233: las velas llegan después (valor al azar)
  // Dinero, comisión y cuándo van las órdenes a mercado (se recuerdan en el navegador para la próxima vez).
  const [aj, setAj] = useState(() => { try { return { capital: '10.000', comision: '0,185', ejecucion: 'apertura', ...JSON.parse(localStorage.getItem('replay.ajustes') || '{}') } } catch (_) { return { capital: '10.000', comision: '0,185', ejecucion: 'apertura' } } })
  const numero = (s) => Number(String(s).replace(/\./g, '').replace(',', '.'))
  const capital = numero(aj.capital), comision = Number(String(aj.comision).replace(',', '.'))
  const ajustesBien = capital > 0 && comision >= 0
  const empieza = () => { if (!puede) return; const a = { capitalInicial: capital, comision, ejecucion: aj.ejecucion }; try { localStorage.setItem('replay.ajustes', JSON.stringify({ capital: aj.capital, comision: aj.comision, ejecucion: aj.ejecucion })) } catch (_) {}
    if (varios) onEmpezarVarios({ valores: valoresVarios, fecha: fechaVarios, ...a, intervalo: intervalo === 'semanal' ? 'semanal' : 'diario' }); else onEmpezar(elegida, a) }
  const vs = Array.isArray(velas) ? velas : []
  const min = vs.length > 2 ? vs[1].date : '', max = vs.length > 2 ? vs[vs.length - 2].date : ''
  const elegida = fecha ? velaDeInicio(vs, fecha) : null
  const puede = ajustesBien && (varios ? !errorVarios : !!elegida)
  useEffect(() => { const t = (e) => { if (e.key === 'Escape') onCancelar() }; window.addEventListener('keydown', t); return () => window.removeEventListener('keydown', t) }, [onCancelar])
  const rapido = (txt, f, titulo = '', activo = true) => <button key={txt} onClick={() => { if (activo) setFecha(f()) }} disabled={!activo} title={titulo} style={{ ...boton(), opacity: activo ? 1 : 0.4, cursor: activo ? 'pointer' : 'default' }} data-hace={txt}>{txt}</button>
  // §241: «Hace 1 / 5 / 10 años». El Replay usa las velas que tiene cargadas el gráfico (su periodo): si no llegan, el botón se apaga y lo dice.
  const hay = anosCargados(vs)
  const campo = { fontFamily: MONO, fontSize: 12, padding: '3px 6px', background: '#08101a', color: '#e2eaf5', border: '1px solid #2f5b85', borderRadius: 3 }
  const ajustes = <>
    <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 10px', alignItems: 'center', marginBottom: 14 }}>
      <span>Dinero inicial</span><span><input data-capital-replay="" value={aj.capital} onChange={e => setAj(x => ({ ...x, capital: e.target.value }))} style={{ fontFamily: MONO, fontSize: 13, padding: '3px 6px', width: 110, background: '#08101a', color: '#e2eaf5', border: '1px solid #2f5b85', borderRadius: 3 }} /> €</span>
      <span>Comisión por orden</span><span><input data-comision-replay="" value={aj.comision} onChange={e => setAj(x => ({ ...x, comision: e.target.value }))} style={{ fontFamily: MONO, fontSize: 13, padding: '3px 6px', width: 70, background: '#08101a', color: '#e2eaf5', border: '1px solid #2f5b85', borderRadius: 3 }} /> € (cada compra y cada venta)</span>
      <span>A mercado</span><select value={aj.ejecucion} onChange={e => setAj(x => ({ ...x, ejecucion: e.target.value }))} data-ejecucion-replay="" style={{ fontFamily: MONO, fontSize: 12, padding: '3px 4px', width: 'auto', background: '#08101a', color: '#e2eaf5', border: '1px solid #2f5b85', borderRadius: 3 }}>
        <option value="apertura">a la apertura de la vela siguiente</option><option value="cierre">al cierre de la vela que ves</option></select>
    </div>
    {!ajustesBien && <div style={{ color: '#f85149', marginBottom: 10 }}>El dinero tiene que ser mayor que 0 y la comisión no puede ser negativa.</div>}
  </>
  const hace = (n) => rapido(`Hace ${n} ${n === 1 ? 'año' : 'años'}`, () => inicioHace(vs, n), hay >= n - 0.1 ? '' : `El gráfico solo tiene ${hay.toLocaleString('es-ES', { maximumFractionDigits: 1 })} años de velas cargados. Para empezar hace ${n} años, amplía el periodo del gráfico.`, hay >= n - 0.1)
  return (
    <div data-ventana-replay="" role="dialog" aria-modal="true" onMouseDown={e => { if (e.target === e.currentTarget) onCancelar() }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 10050, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#0d1520', border: '1px solid #2f5b85', borderRadius: 6, padding: 18, width: 420, maxWidth: '100%', fontFamily: MONO, fontSize: 12, color: '#c9d6e3' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <b style={{ color: '#e2eaf5', fontSize: 14 }}>⏪ Replay</b>
          <Ayuda texto={AYUDA_REPLAY} etiqueta="Qué es el Replay" zIndice={10100} />
          <span style={{ marginLeft: 'auto', cursor: 'pointer', color: '#7a9bc0' }} onClick={onCancelar} title="Cerrar">✕</span>
        </div>
        <SeguirGuardado simbolo={simbolo} guardados={guardados} onAbrir={onAbrir} />
        {onAbrir && guardados?.length > 0 && <div style={{ marginBottom: 6 }}><b style={{ color: '#e2eaf5' }}>Empezar uno nuevo</b></div>}
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 10px', alignItems: 'center', marginBottom: 10 }}>
          <span>Valores</span>
          <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <select data-fuente-replay="" value={fuente} onChange={e => setFuente(e.target.value)} style={{ ...campo, flex: 1, width: 'auto', minWidth: 0 }}>
              <option value="uno">Solo {simbolo} (el del gráfico)</option>
              {onEmpezarVarios && listas.map((l, i) => <option key={i} value={`l:${i}`}>Lista «{l.nombre}» ({l.simbolos.length})</option>)}
              {onEmpezarVarios && <option value="mano">Varios a mano…</option>}
            </select>
            {onValorAzar && !varios && <button onClick={onValorAzar} data-valor-azar="" title="Cambiar a un valor al azar de tu Watchlist" style={boton()}>🎲</button>}
          </span>
          {varios && fuente === 'mano' && <><span /><input data-mano-replay="" autoFocus placeholder="AAPL, MSFT, NVDA…" value={mano} onChange={e => setMano(e.target.value)} style={{ ...campo, width: '100%' }} /></>}
          {varios && <><span /><span style={{ color: '#7a9bc0' }} data-valores-replay="">{valoresVarios.length ? valoresVarios.slice(0, 14).join(', ') + (valoresVarios.length > 14 ? ` y ${valoresVarios.length - 14} más` : '') + '. Todos en la misma fecha y con una sola cuenta.' : 'Ninguno todavía.'}</span></>}
          <span>Velas</span><span data-velas-replay="" style={{ color: '#7a9bc0' }}><b style={{ color: '#e2eaf5' }}>{intervalo === 'semanal' ? 'Semanales' : 'Diarias'}</b> (las del gráfico; para otras, cámbialas en el gráfico antes de empezar)</span>
        </div>
        {varios ? <>
          <div style={{ marginBottom: 6 }}>Empiezas el día:</div>
          <input type="date" value={fechaVarios} max={hoyISO} onChange={e => setFechaVarios(e.target.value)} data-fecha-replay="" style={{ ...campo, fontSize: 13, padding: '4px 6px', colorScheme: 'dark' }} />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '10px 0' }}>
            {[1, 5, 10].map(n => <button key={n} onClick={() => setFechaVarios(haceAnosHoy(n))} style={boton()} data-hace={`Hace ${n}`}>Hace {n} {n === 1 ? 'año' : 'años'}</button>)}
          </div>
          <div style={{ color: '#7a9bc0', marginBottom: 14 }}>Un valor que aún no cotizaba ese día aparece el día que empieza.</div>
          {ajustes}
          {errorVarios && <div data-error-replay="" style={{ color: '#f85149', marginBottom: 10 }}>{errorVarios}</div>}
        </> : cargando ? <div style={{ color: '#7a9bc0', marginBottom: 14 }} data-cargando-replay="">Cargando las velas de {simbolo}…</div>
          : vs.length < 3 ? <div style={{ color: '#f85149' }}>Este gráfico tiene muy pocas velas para un Replay.</div> : <>
          <div style={{ marginBottom: 6 }}>Empiezas el día:</div>
          <input type="date" value={fecha || ''} min={min} max={max} onChange={e => setFecha(e.target.value)} data-fecha-replay=""
            style={{ fontFamily: MONO, fontSize: 13, padding: '4px 6px', background: '#08101a', color: '#e2eaf5', border: '1px solid #2f5b85', borderRadius: 3, colorScheme: 'dark' }} />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '10px 0' }}>
            {hace(1)}{hace(5)}{hace(10)}{rapido('Al azar', () => inicioAlAzar(vs))}
          </div>
          <div style={{ color: '#7a9bc0', marginBottom: 14 }}>
            {elegida ? <>Empiezas el <b style={{ color: '#e2eaf5' }}>{diaSemana(elegida)} {fmt(elegida)}</b>: verás las velas hasta ese día y quedan <b style={{ color: '#e2eaf5' }}>{posicion(vs, elegida, elegida).quedan.toLocaleString('es-ES')}</b> por descubrir{vs.length ? <> (hay datos desde el {fmt(vs[0].date)})</> : null}.</> : 'Elige un día.'}
          </div>
          {ajustes}
        </>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onCancelar} style={boton()}>Cancelar</button>
          <button onClick={empieza} disabled={!puede} data-empezar-replay=""
            style={{ ...boton(puede), background: puede ? 'rgba(255,209,102,0.18)' : 'transparent', borderColor: 'rgba(255,209,102,0.6)', color: puede ? '#ffd166' : '#4a6380' }}>Empezar</button>
        </div>
      </div>
    </div>)
}

// §263 (decidido por Sergi el 25/11): cada Replay tiene UNA temporalidad. Cambiar de velas (W / D) dentro del Replay empieza uno NUEVO;
// el de ahora se queda guardado en «Mis replays». onElige('inicio' | 'hoy'): desde el mismo día de inicio o desde hoy en el replay.
const NOMBRE_VELAS = { diario: 'diarias', semanal: 'semanales' }
export function VentanaCambioVelas({ a, desde, hoy, onElige, onCancelar }) {
  useEffect(() => { const t = (e) => { if (e.key === 'Escape') onCancelar() }; window.addEventListener('keydown', t); return () => window.removeEventListener('keydown', t) }, [onCancelar])
  const b = (modo, texto) => <button data-cambio-velas={modo} onClick={() => onElige(modo)} style={{ ...bz(), textAlign: 'left', borderColor: modo === 'inicio' ? BZ.azul : BZ.borde }}>{texto}</button>
  return (
    <div data-ventana-cambio-velas="" role="dialog" aria-modal="true" onMouseDown={e => { if (e.target === e.currentTarget) onCancelar() }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 10060, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: BZ.fondo, border: `1px solid ${BZ.borde}`, borderRadius: 8, padding: 16, width: 460, maxWidth: '100%', font: `13px/1.5 ${LETRA}`, color: BZ.texto }}>
        <b style={{ fontSize: 14 }}>Cambiar a velas {NOMBRE_VELAS[a] || a}</b>
        <div style={{ color: BZ.gris, margin: '8px 0 12px' }}>Cada Replay va con unas velas. Cambiarlas empieza un Replay <b style={{ color: BZ.texto }}>nuevo</b>, con el mismo dinero y la misma comisión; el de ahora se queda guardado en «Mis replays».</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {b('inicio', <>Desde el mismo día de inicio <span style={{ color: BZ.gris }}>({diaSemana(desde)} {fmt(desde)})</span></>)}
          {b('hoy', <>Desde hoy en el replay <span style={{ color: BZ.gris }}>({diaSemana(hoy)} {fmt(hoy)})</span></>)}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}><button data-cambio-velas="cancelar" onClick={onCancelar} style={bz()}>Cancelar · sigo con las velas de ahora</button></div>
      </div>
    </div>)
}

// Colores y letra del boceto (bocetos/replay-simulacion.html), elegidos por Sergi el 21/11 frente a los de la barra del gráfico.
const BZ = { fondo: '#2c303b', caja: '#353945', borde: '#4c5263', texto: '#f3f3f5', gris: '#a9adb8', ambar: '#d29922', azul: '#58a6ff' }
const LETRA = 'system-ui, "Segoe UI", sans-serif'
const bz = (activo = true) => ({ background: BZ.caja, color: BZ.texto, border: `1px solid ${BZ.borde}`, borderRadius: 5, padding: '4px 9px', font: `13px/1.3 ${LETRA}`,
  cursor: activo ? 'pointer' : 'default', opacity: activo ? 1 : 0.4, flexShrink: 0 })
export const VER = [60, 120, 250, 500, 0]   // velas a la vista (0 = libre: la anchura que dejes con la rueda)

// §231: «Saltar a la señal». senal = { opciones: [{ valor, texto }], elegida, onElige(valor), onSiguiente, onAnterior, estado: 'sin' | 'cargando' |
// 'lista' | 'error', n (cuántas señales hay en todos los datos), aviso }.
export const AYUDA_SENAL = 'SEÑAL ⏭ salta hasta la próxima vela con la señal elegida y se para: esa vela es la última que ves (la señal se conoce al cierre). ' +
  '⏮ SEÑAL vuelve a la anterior (cuenta como retroceso). Las velas con señal que ya ves llevan un ▲ morado.\n\n' +
  'Con una CONDICIÓN DEL CATÁLOGO, la señal es la vela en que pasa a cumplirse (la anterior no se cumplía): con «el cierre está por encima de la EMA 200», ' +
  'una señal cada vez que el precio cruza la media hacia arriba, no una en cada vela por encima.\n' +
  'Con una CONDICIÓN CON PASOS, la vela en que se cumple su último paso, recordando lo de antes (el tramo, el paso 1, el precio de la última señal…).\n' +
  'Con una ESTRATEGIA de tarjetas, ▲ en las velas en que da señal de compra (como «Da señal de compra con…» del screener) y ▼ en las que vende; ' +
  'al lado eliges a qué saltar: entradas y salidas, solo entradas o solo salidas.\n\n' +
  'Ejemplo: hoy en el Replay es el 03/02 y la EMA 10 cruza por encima de la EMA 30 el 17/02: «Señal ⏭» te deja en el cierre del 17/02, listo para decidir.'

// §244: arriba se elige «Una condición» (filas del catálogo, §231/§240) o «Condición con pasos» (components/EditorConPasos.js).
// onAceptar recibe la señal entera: { tipo: 'condicion', filas } o { tipo: 'pasos', def }.
// §245: velas (las del valor del Replay, toda su historia), cargaVelas(símbolo), simbolosAzar, compras y hoy: para el minigráfico.
// §260: nota = una línea arriba (con varios valores: que lo puesto en el primero se mira en cada valor).
const SIN = Object.freeze([])
export function VentanaSenal({ simbolo, senal = null, onAceptar, onCancelar, velas = SIN, cargaVelas = null, simbolosAzar = SIN, compras = SIN, hoy = null, nota = '' }) {
  const [modo, setModo] = useState(senal?.tipo === 'pasos' ? 'pasos' : 'condicion')
  const [filas, setFilas] = useState(senal?.tipo === 'condicion' ? senal.filas || [] : [])
  const [def, setDef] = useState(senal?.tipo === 'pasos' && senal.def ? senal.def : conPasosNueva(String(simbolo || '').toUpperCase()))
  const vale = modo === 'pasos' ? validaConPasos(def).length === 0 : filas.length > 0
  const acepta = () => { if (vale) onAceptar(modo === 'pasos' ? { tipo: 'pasos', def } : { tipo: 'condicion', filas }) }
  const pestana = (m, t) => (
    <button type="button" data-modo-senal={m} onClick={() => setModo(m)}
      style={{ ...bz(), background: modo === m ? 'rgba(88,166,255,0.18)' : BZ.caja, borderColor: modo === m ? BZ.azul : BZ.borde }}>{t}</button>)
  useEffect(() => { const t = (e) => { if (e.key === 'Escape') onCancelar() }; window.addEventListener('keydown', t); return () => window.removeEventListener('keydown', t) }, [onCancelar])
  return (
    <div data-ventana-senal="" role="dialog" aria-modal="true" onMouseDown={e => { if (e.target === e.currentTarget) onCancelar() }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 10050, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: BZ.fondo, border: `1px solid ${BZ.borde}`, borderRadius: 8, padding: 16, width: 720, maxWidth: '100%', maxHeight: '90vh', overflow: 'auto', font: `13px/1.5 ${LETRA}`, color: BZ.texto }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <b style={{ fontSize: 14 }}>Señal</b>
          {pestana('condicion', 'Una condición')}{pestana('pasos', 'Condición con pasos')}
          <Ayuda texto={AYUDA_SENAL} etiqueta="Saltar a la señal" zIndice={10100} />
          <span style={{ marginLeft: 'auto', cursor: 'pointer', color: BZ.gris }} onClick={onCancelar} title="Cerrar">✕</span>
        </div>
        {nota && <div data-nota-senal="" style={{ color: BZ.gris, fontSize: 12, marginBottom: 8 }}>{nota}</div>}
        {modo === 'pasos' ? <><EditorConPasos simbolo={simbolo} def={def} onCambia={setDef}/>
          <MiniGraficoPasos def={def} simbolo={simbolo} velas={velas} cargaVelas={cargaVelas} simbolosAzar={simbolosAzar} compras={compras} hoy={hoy}/></> : <><FilasAlerta simbolo={simbolo} filas={filas} onCambia={setFilas} para="señal" conO />
          <MiniGraficoPasos senal={{ tipo: 'condicion', filas }} simbolo={simbolo} velas={velas} cargaVelas={cargaVelas} simbolosAzar={simbolosAzar} hoy={hoy}/></>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
          <button onClick={onCancelar} style={bz()}>Cancelar</button>
          <button data-aceptar-senal="" onClick={acepta} disabled={!vale} style={{ ...bz(vale), borderColor: BZ.azul }}>Usar esta señal</button>
        </div>
      </div>
    </div>)
}

export function BarraReplay({ velas, estado, onIr, onSalir, onIndicadores, ver = 120, onVer, senal = null }) {
  const [jugando, setJugando] = useState(false)
  const [vel, setVel] = useState(2)   // velas por segundo
  const [n, setN] = useState(5)       // cuántas avanza ▶▶ (y retrocede Mayús + ←)
  const p = posicion(velas, estado.desde, estado.hoy)
  const fin = p.quedan <= 0
  const cb = useRef({}); cb.current = { onIr, fin, n }
  useEffect(() => { if (fin) setJugando(false) }, [fin])
  useEffect(() => {
    if (!jugando) return
    const t = setInterval(() => { if (cb.current.fin || cb.current.onIr(1) === false) setJugando(false) }, 1000 / vel)
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
  // §239: un botón con su cifra dentro (▶ 2/s, ▶▶ 5): el marco es uno; la cifra, a la derecha tras una rayita, se cambia tocándola.
  const doble = (activo) => ({ display: 'inline-flex', alignItems: 'stretch', background: BZ.caja, border: `1px solid ${BZ.borde}`, borderRadius: 5, opacity: activo ? 1 : 0.4, flexShrink: 0 })
  const interior = { border: 'none', background: 'transparent', opacity: 1, borderRadius: '5px 0 0 5px' }
  const parte = { background: 'transparent', color: BZ.texto, border: 'none', borderLeft: `1px solid ${BZ.borde}`, font: `13px ${LETRA}`, padding: '0 4px', width: 'auto', outline: 'none', cursor: 'pointer' }
  const caja = { background: BZ.caja, color: BZ.texto, border: `1px solid ${BZ.borde}`, borderRadius: 5, padding: '4px 6px', font: `13px ${LETRA}`, width: 'auto' }
  return (
    <div data-barra-replay="" style={{ flexShrink: 0, display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center', background: BZ.fondo, border: `1px solid ${BZ.borde}`,
      borderRadius: 6, padding: '6px 8px', margin: '4px 6px', font: `13px/1.45 ${LETRA}`, color: BZ.texto }}>
      <style>{'[data-n-velas]::-webkit-inner-spin-button,[data-n-velas]::-webkit-outer-spin-button{-webkit-appearance:none;margin:0}'}</style>
      {/* §239: ▶ primero, con las velas por segundo dentro del mismo botón; |◀ y ▶| juntos; ▶▶ con su número dentro (se cambia tocándolo). */}
      <span style={doble(!fin)}>
        {b(jugando ? '⏸' : '▶', jugando ? 'Pausa (espacio)' : 'Reproducir (espacio)', () => setJugando(j => !j), !fin, { ...interior, minWidth: 30 }, { 'data-reproducir': '' })}
        <select value={vel} onChange={e => setVel(Number(e.target.value))} title="Velocidad al reproducir: velas por segundo" data-velocidad="" style={parte}>
          {[1, 2, 5, 10].map(v => <option key={v} value={v}>{v}/s</option>)}
        </select>
      </span>
      {b('|◀', `Una vela atrás (←; Mayús + ←: ${n})`, () => { setJugando(false); onIr(-1) }, p.vela > 1, {}, { 'data-atras': '' })}
      {b('▶|', 'Una vela adelante (→)', () => { setJugando(false); onIr(1) }, !fin, {}, { 'data-adelante': '' })}
      <span style={doble(!fin)}>
        {b('▶▶', `Avanzar ${n} velas (Mayús + →)`, () => { setJugando(false); onIr(n) }, !fin, interior, { 'data-varias': '' })}
        <input type="number" value={n} min={2} max={200} title="Cuántas velas avanza ▶▶ (escríbelo aquí)" data-n-velas=""
          onChange={e => { const v = Math.round(Number(e.target.value)); if (Number.isFinite(v)) setN(Math.min(200, Math.max(2, v))) }} style={{ ...parte, width: 34, MozAppearance: 'textfield' }} />
      </span>
      {senal && <>
        {sep}
        {b('⏮ Señal', 'Volver a la señal anterior (cuenta como retroceso)', () => { setJugando(false); senal.onAnterior() }, senal.estado === 'lista', {}, { 'data-senal-anterior': '' })}
        {b('Señal ⏭', 'Avanzar hasta la próxima vela con la señal elegida', () => { setJugando(false); senal.onSiguiente() }, senal.estado === 'lista' && !fin, {}, { 'data-senal-siguiente': '' })}
        <select value={senal.elegida || ''} onChange={e => senal.onElige(e.target.value)} data-elige-senal="" title={(senal.opciones.find(o => o.valor === senal.elegida)?.texto || 'Qué señal buscan «Señal ⏭» y «⏮ Señal»')} style={{ ...caja, maxWidth: 300 }}>
          <option value="">Señal: elige…</option>
          {senal.opciones.map(o => <option key={o.valor} value={o.valor}>{o.texto}</option>)}
        </select>
        {senal.estado === 'cargando' && <span style={{ color: BZ.gris }}>buscando señales…</span>}
        {senal.tipos && <select value={senal.tipos.valor} onChange={e => senal.tipos.onCambia(e.target.value)} data-tipo-salto="" title="A qué saltan «Señal ⏭» y «⏮ Señal»" style={caja}>
          {TIPOS_SALTO.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>}
        {senal.estado === 'lista' && <span style={{ color: BZ.gris }} data-n-senales="">{senal.textoN || `${senal.n} ${senal.n === 1 ? 'señal' : 'señales'} en total`}</span>}
        {senal.aviso && <span style={{ color: BZ.ambar }} data-aviso-senal="">{senal.aviso}</span>}
        <Ayuda texto={AYUDA_SENAL} etiqueta="Saltar a la señal" />
      </>}
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
      {estado.borradas > 0 && <span style={{ color: BZ.ambar }} title="Operaciones que has quitado del historial" data-borradas-replay="">· {estado.borradas} {estado.borradas === 1 ? 'operación quitada' : 'operaciones quitadas'}</span>}
      {b('✕ Salir', 'Salir del Replay (vuelve el gráfico de siempre)', onSalir, true, {}, { 'data-salir-replay': '' })}
    </div>)
}
