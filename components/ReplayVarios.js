// components/ReplayVarios.js — el Replay con VARIOS valores (docs/builder.md §254–255; boceto bocetos/replay-operar-multiactivo.html,
// pestaña 2, aceptado por Sergi el 24/11). Pantalla propia, encima de la app: TODOS los valores en una rejilla (4 o 6 por fila, como
// «Charts» del screener), en la misma fecha y con UNA cuenta. §255 (pedido por Sergi el 25/11: «una copia de lo que hay en un valor»):
// cada gráfico es el MISMO del Replay de un valor (CandleChart con sus líneas arrastrables, cajas, indicadores, 🎯 y doble clic) con el
// MISMO panel de operar (PanelGrafico entero, con ⚙ junto a Compra / Venta); abajo, la MISMA barra (BarraReplay); a la derecha, siempre,
// las cifras o la tarjeta ⚙ (PanelOperar). Ampliar (⤢ o doble clic en el nombre) solo agranda un gráfico dentro de la zona de la rejilla.
// Se guarda solo, como el de un valor (tabla simulaciones). Velas diarias.
import { useEffect, useMemo, useRef, useState } from 'react'
import Ayuda from './BuilderAyuda'
import CandleChart from './CandleChart'
import { BarraReplay } from './Replay'
import { PanelOperar, PanelGrafico, ResultadosReplay } from './PanelReplay'
import { calcula, cifras, irA, VERSION } from '../lib/replay/motor'
import { nuevaAccion, configAuto, marcasDe, tradesDe } from '../lib/replay/orden'
import { FORM_INICIAL, conClic, dobleClic, empiezaMarca, deMercado, redondea, accionMover, anade, ordenDeMarca, quitaOperacion, mueveBorrador, lineasDe, cajasDe } from '../lib/replay/borrador'
import { ordenRejilla, conSenalHoy, siguienteSenalVarios, anteriorSenalVarios } from '../lib/replay/varios'
import { entradasYSalidasEstrategia, graficoSenal, marcasSenal, marcasSalida } from '../lib/replay/senales'
import { recortaVelas, vecina } from '../lib/replay/grafico'
import { paraGuardar, hayQueGuardar, nombreDe, crearSimulacion, guardarSimulacion } from '../lib/replay/guardados'
import { atr as atrDe } from '../lib/condiciones/indicadores'

const BZ = { fondo: '#22262f', panel: '#2c303b', caja: '#353945', borde: '#4c5263', texto: '#f3f3f5', gris: '#a9adb8', verde: '#3fb950', rojo: '#f85149', ambar: '#d29922', azul: '#58a6ff', morado: '#bc8cff' }
const LETRA = 'system-ui, "Segoe UI", sans-serif'
const btn = (on = false, activo = true) => ({ background: on ? 'rgba(88,166,255,0.22)' : BZ.caja, color: BZ.texto, border: `1px solid ${on ? BZ.azul : BZ.borde}`, borderRadius: 5, padding: '4px 9px', font: `13px ${LETRA}`, cursor: activo ? 'pointer' : 'default', opacity: activo ? 1 : 0.4 })
const casilla = { background: BZ.caja, color: BZ.texto, border: `1px solid ${BZ.borde}`, borderRadius: 5, padding: '4px 6px', font: `13px ${LETRA}` }
const fmt = (f) => (f ? `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}` : '—')
const n2 = (x) => (x == null ? '' : x.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
const AJUSTES = ['modo', 'pct', 'stopPct', 'rr', 'tipo', 'stopModo', 'tpModo', 'stopAtr', 'sigueTipo', 'sigueN', 'sigueK', 'sale']
const INDICE = '^GSPC'
const VACIO = []
export const MAX_VALORES = 30
// Gráficos por fila (como «Charts» del screener) y su alto.
export const REJILLA = Object.freeze({ g4: { porFila: 4, alto: 330, escala: 0.85 }, g6: { porFila: 6, alto: 250, escala: 0.72 } })

export const AYUDA_VARIOS = 'REPLAY CON VARIOS VALORES: todos los gráficos van en la MISMA fecha y operas con UNA sola cuenta (el mismo dinero para todos). ' +
  'Cada gráfico funciona igual que el Replay de un valor: «🎯 Compra» / «🎯 Venta» y un clic (o doble clic) en el gráfico ponen la orden con los valores de ⚙; sus líneas se arrastran; las casillas, 🎯 y ✕ como siempre. ' +
  '«Señal ⏭» salta a la próxima vela en que CUALQUIER valor da la señal elegida (los que la dan llevan el borde morado). ⤢ amplía un gráfico (Esc vuelve a la rejilla). ' +
  'Con «Ejecutar solo» (en ⚙), las señales de todos los valores compran solas; si no llega el dinero para todas, entran por orden alfabético y las demás se cuentan en «Señales sin dinero».\n\n' +
  'Se compara con el Buy&Hold de la lista (el mismo dinero a partes iguales el primer día; un valor que aún no cotiza entra el día que empieza) y con el S&P 500.'

// El primer día con vela de cualquiera de los valores desde la fecha elegida.
export function primerDia(velas, valores, fecha) {
  let m = null
  for (const s of valores) for (const v of velas[s] || []) if (v.date >= fecha) { if (m == null || v.date < m) m = v.date; break }
  return m
}

// ── La ventana de empezar ──
export function VentanaVarios({ listas = [], onEmpezar, onCancelar }) {
  const [fuente, setFuente] = useState(() => { const i = listas.findIndex(l => l.simbolos.length >= 2 && l.simbolos.length <= MAX_VALORES); return i >= 0 ? `l:${i}` : 'mano' })   // la primera lista que cabe
  const [mano, setMano] = useState('')
  const hoyISO = new Date().toISOString().slice(0, 10)
  const haceAnos = (n) => { const d = new Date(); d.setFullYear(d.getFullYear() - n); return d.toISOString().slice(0, 10) }
  const [fecha, setFecha] = useState(haceAnos(1))
  const [aj, setAj] = useState(() => { try { return { capital: '10.000', comision: '0,185', ejecucion: 'apertura', ...JSON.parse(localStorage.getItem('replay.ajustes') || '{}') } } catch (_) { return { capital: '10.000', comision: '0,185', ejecucion: 'apertura' } } })
  const numero = (s) => Number(String(s).replace(/\./g, '').replace(',', '.'))
  const valores = fuente === 'mano' ? [...new Set(mano.toUpperCase().split(/[\s,;]+/).map(x => x.trim()).filter(x => /^[A-Z0-9.^=-]{1,20}$/.test(x)))] : (listas[Number(fuente.slice(2))]?.simbolos || [])
  const capital = numero(aj.capital), comision = Number(String(aj.comision).replace(',', '.'))
  const error = valores.length < 2 ? 'Elige al menos 2 valores.' : valores.length > MAX_VALORES ? `Como mucho ${MAX_VALORES} valores (tienes ${valores.length}).` : !(capital > 0 && comision >= 0) ? 'El dinero tiene que ser mayor que 0 y la comisión no puede ser negativa.' : !fecha || fecha >= hoyISO ? 'Elige un día del pasado.' : ''
  useEffect(() => { const t = (e) => { if (e.key === 'Escape') onCancelar() }; window.addEventListener('keydown', t); return () => window.removeEventListener('keydown', t) }, [onCancelar])
  const empieza = () => { if (error) return; try { localStorage.setItem('replay.ajustes', JSON.stringify({ capital: aj.capital, comision: aj.comision, ejecucion: aj.ejecucion })) } catch (_) {} onEmpezar({ valores, fecha, capitalInicial: capital, comision, ejecucion: aj.ejecucion }) }
  return (
    <div data-ventana-varios="" role="dialog" aria-modal="true" onMouseDown={e => { if (e.target === e.currentTarget) onCancelar() }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 10060, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: BZ.panel, border: `1px solid ${BZ.borde}`, borderRadius: 8, padding: 18, width: 460, maxWidth: '100%', font: `13px/1.45 ${LETRA}`, color: BZ.texto }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <b style={{ fontSize: 15 }}>⏪ Replay con varios valores</b><Ayuda texto={AYUDA_VARIOS} etiqueta="Replay con varios valores" zIndice={10100} />
          <span style={{ marginLeft: 'auto', cursor: 'pointer', color: BZ.gris }} onClick={onCancelar} title="Cerrar">✕</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: '8px 10px', alignItems: 'center' }}>
          <span>Valores</span>
          <select data-fuente-varios="" value={fuente} onChange={e => setFuente(e.target.value)} style={{ ...casilla, width: '100%' }}>
            {listas.map((l, i) => <option key={i} value={`l:${i}`}>Lista «{l.nombre}» ({l.simbolos.length})</option>)}
            <option value="mano">A mano…</option>
          </select>
          {fuente === 'mano' && <><span /><input data-mano-varios="" autoFocus placeholder="AAPL, MSFT, NVDA…" value={mano} onChange={e => setMano(e.target.value)} style={{ ...casilla, width: '100%' }} /></>}
          <span /><span style={{ color: BZ.gris, fontSize: 12 }} data-valores-varios="">{valores.length ? valores.slice(0, 14).join(', ') + (valores.length > 14 ? ` y ${valores.length - 14} más` : '') : 'Ninguno todavía.'}</span>
          <span>Empiezas el día</span>
          <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <input type="date" data-fecha-varios="" value={fecha} max={hoyISO} onChange={e => setFecha(e.target.value)} style={{ ...casilla, colorScheme: 'dark' }} />
            {[1, 5, 10].map(n => <button key={n} onClick={() => setFecha(haceAnos(n))} style={{ ...btn(), padding: '2px 7px' }}>Hace {n} {n === 1 ? 'año' : 'años'}</button>)}
          </span>
          <span>Dinero inicial</span><span><input value={aj.capital} onChange={e => setAj(x => ({ ...x, capital: e.target.value }))} style={{ ...casilla, width: 110 }} /> €</span>
          <span>Comisión</span><span><input value={aj.comision} onChange={e => setAj(x => ({ ...x, comision: e.target.value }))} style={{ ...casilla, width: 70 }} /> € por orden</span>
          <span>A mercado</span><select value={aj.ejecucion} onChange={e => setAj(x => ({ ...x, ejecucion: e.target.value }))} style={{ ...casilla, width: 'auto' }}>
            <option value="apertura">a la apertura de la vela siguiente</option><option value="cierre">al cierre de la vela que ves</option></select>
        </div>
        <div style={{ color: BZ.gris, fontSize: 12, marginTop: 10 }}>Velas diarias. Un valor que aún no cotizaba ese día aparece el día que empieza.</div>
        {error && <div data-error-varios="" style={{ color: BZ.ambar, marginTop: 8 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
          <button onClick={onCancelar} style={btn()}>Cancelar</button>
          <button data-empezar-varios="" onClick={empieza} disabled={!!error} style={{ ...btn(false, !error), background: error ? BZ.caja : 'rgba(255,209,102,0.18)', borderColor: 'rgba(255,209,102,0.6)', color: error ? BZ.gris : '#ffd166' }}>Empezar</button>
        </div>
      </div>
    </div>)
}


// ── Un gráfico: el mismo del Replay de un valor (CandleChart con las props del Replay) ──
const CAPTURA = { entrada: 'capture_entry', stop: 'capture_stop', objetivo: 'capture_tp' }
const TEXTO_MARCA = { entrada: '▶ Clic en el gráfico para marcar la ENTRADA · Esc cancela', stop: '▶ Clic para marcar el STOP · Enter: sin stop ni objetivo · Esc cancela', objetivo: '▶ Clic para marcar el OBJETIVO (la orden se pone sola) · Enter: sin objetivo · Esc cancela' }
const VACIA = { ...FORM_INICIAL }
export function GraficoValor({ Grafico = CandleChart, simbolo: s, velas, estado, r, form, captura = null, campoLinea = null, ahora, senalDef = null, referencias = {}, senalS = null, indicadores = VACIO, onIndicadores = null,
  alto = 330, ver = 120, elegida = null, onClicPrecio, onDobleClic, onLinea }) {
  const hoy = estado.hoy, terminada = !!estado.terminada
  const data = useMemo(() => recortaVelas(velas || [], hoy), [velas, hoy])
  const savedRangeRef = useRef(null), isNewResultRef = useRef(true), anchoRef = useRef(ver > 0 ? ver : 120), apiRef = useRef(null)
  useEffect(() => { if (ver > 0) { anchoRef.current = ver; apiRef.current?.verVelas?.(ver) } }, [ver])
  const firmaT = JSON.stringify(tradesDe(r, s))
  const trades = useMemo(() => (firmaT === '[]' ? VACIO : JSON.parse(firmaT)), [firmaT])
  const pos = r?.posiciones?.[s]
  const marcas = useMemo(() => {
    const m = [...marcasDe({ operaciones: (r?.operaciones || []).filter(o => o.simbolo === s), posiciones: pos ? { [s]: pos } : {} }), ...marcasSenal(senalS?.entradas, hoy), ...marcasSalida(senalS?.salidas, hoy)]
    return m.length ? m.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)) : VACIO }, [r, s, senalS, hoy])   // eslint-disable-line
  const grafico = useMemo(() => (senalDef ? graficoSenal(senalDef, data, s, referencias) : null), [senalDef, data, s, referencias])
  const f = captura ? form : VACIA
  const marcando = !!captura
  const lineas = useMemo(() => lineasDe(r, s, f, ahora, terminada, marcando).map(l => ({ ...l, grosor: l.id === elegida ? (l.grosor || 1) + 2 : 1, soloEje: true })), [r, s, f, ahora, terminada, marcando, elegida])
  const cajas = useMemo(() => cajasDe(r, s, f, ahora, hoy, terminada, marcando), [r, s, f, ahora, hoy, terminada, marcando])
  const modo = captura || campoLinea
  if (!data.length) return <div style={{ height: alto, color: BZ.gris, padding: 10 }}>{s}: aún no cotiza el {fmt(hoy)}.</div>
  return <Grafico data={data} emaRPeriod={null} emaLPeriod={null} definition={null} trades={trades} labelMode={1} visuals={null} slopeChanges={VACIO} grafico={grafico} razonamiento={false}
    customMarkers={marcas} pendingOrders={VACIO} simbolo={s} chartHeight={alto} fillHeight={false} indicadoresUsuario={indicadores} onIndicadores={onIndicadores}
    savedRangeRef={savedRangeRef} isNewResultRef={isNewResultRef} onChartReady={api => { apiRef.current = api }} syncRef={null} priceAlarms={VACIO} tlOpenTrades={VACIO} filterZones={VACIO}
    margenDerecha={10} anchoReplayRef={anchoRef} onAnchoReplay={null} onPriceAlarm={terminada ? null : onDobleClic} onAlertaPrecio={null}
    riskMode={modo ? CAPTURA[modo] || null : null} onRiskPrice={onClicPrecio} textoCaptura={captura ? TEXTO_MARCA[captura] : campoLinea ? '▶ Clic en el gráfico: precio nuevo · Esc cancela' : null}
    riskLevels={null} onRiskLevelChange={null} riskLineActive={null} lineasReplay={lineas} onLineaReplay={onLinea} cajasReplay={cajas} />
}

// ── La pantalla ──
// inicial: { nuevo: { valores, fecha, capitalInicial, comision, ejecucion } } o uno guardado: { id, nombre, estado }.
// cargaVelas(simbolo) → Promise<velas diarias>; estrategias: las de tarjetas [{ id, name, definition, params }]; ctx: para guardar.
// indicadores / onIndicadores: los indicadores del gráfico de siempre (los mismos en todos los gráficos). Grafico: para las pruebas.
export default function ReplayVarios({ inicial, cargaVelas, estrategias = [], tickersDe = () => [], ctx = null, onSalir, indicadores = VACIO, onIndicadores = null, Grafico = CandleChart }) {
  const [velas, setVelas] = useState(null)
  const [estado, setEstado] = useState(inicial?.estado || null)
  const [aviso, setAviso] = useState('')
  const [form, setForm] = useState(() => { try { const g = JSON.parse(localStorage.getItem('replay.orden') || '{}'); return { ...FORM_INICIAL, ...(g.stopPct === undefined ? { stopPct: '5' } : {}), ...(g.rr === undefined ? { rr: '2' } : {}), ...AJUSTES.reduce((o, k) => g[k] != null ? { ...o, [k]: g[k] } : o, {}) } } catch (_) { return FORM_INICIAL } })
  useEffect(() => { try { localStorage.setItem('replay.orden', JSON.stringify(AJUSTES.reduce((o, k) => form[k] !== undefined ? { ...o, [k]: form[k] } : o, {}))) } catch (_) {} }, AJUSTES.map(k => form[k]))   // eslint-disable-line
  const [captura, setCaptura] = useState(null)             // { s, campo } mientras se marca una orden nueva
  const [capturaLinea, setCapturaLinea] = useState(null)   // id de la línea que mueve el próximo clic
  const [elegida, setElegida] = useState(null)             // línea elegida (↑ ↓ la mueven)
  const [arrastre, setArrastre] = useState(null)
  const [cfg, setCfg] = useState(false)
  const [tam, setTam] = useState('g4'), [orden, setOrden] = useState('importante')
  const [ver, setVer] = useState(120)
  const [ampliado, setAmpliado] = useState(null)
  const [senal, setSenal] = useState(null)                 // id de la estrategia elegida
  const [guardado, setGuardado] = useState({ id: inicial?.id || null, nombre: inicial?.nombre || '', estado: inicial?.id ? 'guardado' : '' })

  // Las velas de todos (y del S&P 500), de 4 en 4.
  useEffect(() => { let vivo = true
    const vals = inicial?.estado?.valores || inicial?.nuevo?.valores || []
    ;(async () => {
      const out = {}, cola = [...vals, INDICE]
      const una = async () => { while (cola.length) { const s = cola.shift(); try { out[s] = (await cargaVelas(s) || []).filter(v => v && !v.enCurso) } catch (_) { out[s] = [] } } }
      await Promise.all([una(), una(), una(), una()])
      if (!vivo) return
      const sin = vals.filter(s => !(out[s] || []).length)
      if (sin.length) setAviso(`Sin precios guardados de ${sin.join(', ')}: no salen.`)
      setVelas(out)
      if (!inicial?.estado) {
        const n = inicial.nuevo, ok = n.valores.filter(s => (out[s] || []).length)
        const desde = primerDia(out, ok, n.fecha)
        if (!desde) { setAviso('No hay velas desde ese día.'); return }
        setEstado({ version: VERSION, valores: ok, desde, hoy: desde, capitalInicial: n.capitalInicial, comision: n.comision, ejecucion: n.ejecucion, acciones: [], retrocesos: 0, terminada: false, intervalo: 'diario' })
        setGuardado(g => ({ ...g, nombre: nombreDe({ valores: ok, desde }) }))
      }
    })()
    return () => { vivo = false } }, [])   // eslint-disable-line

  const motorVelas = useMemo(() => velas && estado ? Object.fromEntries(estado.valores.map(s => [s, velas[s] || []])) : null, [velas, estado?.valores])   // eslint-disable-line
  // El calendario común (todas las velas de todos), para la barra: «vela N de M» y avanzar / retroceder.
  const calendario = useMemo(() => motorVelas ? [...new Set(Object.values(motorVelas).flatMap(v => v.map(x => x.date)))].sort().map(date => ({ date })) : VACIO, [motorVelas])
  // Las señales de la estrategia elegida, valor a valor (con las velas de sus referencias).
  const est = estrategias.find(x => String(x.id) === String(senal))
  const senalDef = useMemo(() => (est ? { tipo: 'estrategia', id: est.id, def: est.definition, params: est.params || {} } : null), [est])
  const [refs, setRefs] = useState({})
  useEffect(() => { if (!est) return; const faltan = tickersDe(est.definition).filter(t => !refs[t] && !(velas || {})[t]); if (!faltan.length) return
    Promise.all(faltan.map(t => cargaVelas(t).then(v => [t, v || []]).catch(() => [t, []]))).then(l => setRefs(x => ({ ...x, ...Object.fromEntries(l) }))) }, [senal, velas])   // eslint-disable-line
  const referencias = useMemo(() => (est ? Object.fromEntries(tickersDe(est.definition).map(t => [t, refs[t] || (velas || {})[t] || []])) : {}), [est, refs, velas])   // eslint-disable-line
  const senales = useMemo(() => { if (!est || !motorVelas) return null; const out = {}
    for (const s of estado.valores) { try { out[s] = entradasYSalidasEstrategia({ def: est.definition, params: est.params || {}, velas: motorVelas[s], referencias }) } catch (_) { out[s] = { entradas: [], salidas: [] } } }
    return out }, [est, motorVelas, referencias])   // eslint-disable-line
  const r = useMemo(() => estado && motorVelas ? calcula(estado, motorVelas, senales ? { senales } : {}) : null, [estado, motorVelas, senales])
  const cif = useMemo(() => r ? cifras(estado, motorVelas, r) : null, [r])   // eslint-disable-line
  const ahoraDe = (s) => { const v = (motorVelas?.[s] || []).filter(x => x.date <= estado.hoy); return v.length ? v[v.length - 1].close : null }
  const atrHoyDe = (s) => { const v = (motorVelas?.[s] || []).filter(x => x.date <= estado.hoy); if (v.length < 15) return null; const a = atrDe(v, 14); return a[a.length - 1] ?? null }

  // Guardar solo (1,2 s después de cada cambio).
  const creando = useRef(null), ultimo = useRef('')
  useEffect(() => { if (!estado || !r || !ctx || !hayQueGuardar(estado)) return
    const t = setTimeout(async () => { const datos = paraGuardar(estado, motorVelas, r), json = JSON.stringify(datos); if (json === ultimo.current) return; ultimo.current = json
      setGuardado(g => ({ ...g, estado: 'guardando' }))
      try { if (creando.current) await creando.current
        if (!guardado.id) { const p = crearSimulacion(ctx, guardado.nombre || nombreDe(estado), datos); creando.current = p; const id = await p; creando.current = null; setGuardado(g => ({ ...g, id, estado: 'guardado' })) }
        else { await guardarSimulacion(ctx, guardado.id, { estado: datos }); setGuardado(g => ({ ...g, estado: 'guardado' })) }
      } catch (e) { creando.current = null; ultimo.current = ''; setGuardado(g => ({ ...g, estado: String(e?.message || 'no se pudo guardar') })) } }, 1200)
    return () => clearTimeout(t) }, [estado, r])   // eslint-disable-line
  const nombra = async (nombre) => { setGuardado(g => ({ ...g, nombre })); if (guardado.id && ctx) { try { await guardarSimulacion(ctx, guardado.id, { nombre }) } catch (_) {} } }

  // «Ejecutar solo»: tramos { desde, hasta, sale, orden } (como en el de un valor).
  const autoActivo = !!(estado?.auto || []).some(x => x.hasta == null)
  const tramo = (e, f) => ({ desde: e.hoy, hasta: null, sale: f.sale === 'estrategia' ? 'estrategia' : 'panel', orden: configAuto(f) })
  const cierraTramos = (e) => (e.auto || []).filter(x => !(x.hasta == null && x.desde === e.hoy)).map(x => (x.hasta == null ? { ...x, hasta: e.hoy } : x))
  const ponAuto = (on) => setEstado(e => ({ ...e, auto: on ? [...cierraTramos(e), tramo(e, form)] : cierraTramos(e) }))
  const firmaCfg = JSON.stringify([configAuto(form), form.sale])
  useEffect(() => { if (!autoActivo) return; setEstado(e => { const ab = (e.auto || []).find(x => x.hasta == null), nu = tramo(e, form); if (ab && JSON.stringify([ab.orden, ab.sale]) === JSON.stringify([nu.orden, nu.sale])) return e; return { ...e, auto: [...cierraTramos(e), nu] } }) }, [firmaCfg])   // eslint-disable-line
  useEffect(() => { if (autoActivo && !est) ponAuto(false) }, [senal])   // eslint-disable-line

  // Operar (como en el de un valor): marcar con 🎯 o doble clic, lo marcado ES la orden; mover líneas y casillas.
  const limpia = () => { setCaptura(null); setCapturaLinea(null); setForm(f => ({ ...f, mercado: true, entrada: '', stop: '', objetivo: '' })) }
  const accion = (a) => setEstado(e => ({ ...e, acciones: anade(e.acciones, a) }))
  const pone = (s, f) => { const o = ordenDeMarca(f, ahoraDe(s)); limpia(); if (o.error) { setAviso(o.error); return } setAviso(o.aviso || ''); accion(nuevaAccion(estado, s, o.orden)) }
  const marca = (s, lado) => { if (estado.terminada) return; setCapturaLinea(null); const c = empiezaMarca({ ...form, atrHoy: atrHoyDe(s) }, lado); setForm(c.f); setCaptura({ s, campo: c.captura }) }
  const clic = (s, p) => {
    if (capturaLinea) { const id = capturaLinea; setCapturaLinea(null); mover(id, redondea(p)); return }
    if (!captura || captura.s !== s) return
    const c = conClic(form, captura.campo, p, ahoraDe(s))
    if (c.listo) { pone(s, c.f); return }
    setForm(c.f); setCaptura({ s, campo: c.captura })
  }
  const doble = (s, p) => { if (estado.terminada) return; setCapturaLinea(null); const c = dobleClic({ ...form, atrHoy: atrHoyDe(s) }, p, ahoraDe(s)); if (c.listo) { pone(s, c.f); return } setForm(c.f); setCaptura({ s, campo: c.captura }) }
  const mover = (id, p) => { const [que, a] = String(id).split(':'); const s = que === 'pos' ? a : (r.ordenesVivas.find(o => String(o.id) === a) || {}).simbolo
    const c = accionMover(estado, r, id, p, ahoraDe(s)); if (c.error) { setAviso(c.error); return } setAviso(''); accion(c.accion) }
  const linea = (s) => (id, p, fin) => { if (id == null) { setElegida(null); return } const k = String(id)
    if (fin) setElegida(k)
    if (k.startsWith('bor:')) { if (captura && captura.s === s) setForm(f => mueveBorrador(f, k.slice(4), p, ahoraDe(s))); return }
    if (!fin) { setArrastre({ id: k, precio: p }); return }
    setArrastre(null); mover(k, p) }
  // Teclas: Esc deja de marcar (o cierra el gráfico ampliado); Enter pone lo marcado; ↑ ↓ mueven la línea elegida (0,1 %; Mayús 1 %).
  const teclas = useRef({}); teclas.current = { captura, capturaLinea, ampliado, form, elegida, r, estado, pone, limpia, mover }
  useEffect(() => { const t = (e) => { const k = teclas.current, tag = e.target?.tagName; if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.key === 'Escape') { if (k.captura || k.capturaLinea) { e.preventDefault(); k.limpia(); return } if (k.elegida) { setElegida(null); return } if (k.ampliado) setAmpliado(null); return }
      if (e.key === 'Enter' && k.captura && k.form.entrada) { e.preventDefault(); k.pone(k.captura.s, k.form); return }
      if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && k.elegida && !k.elegida.startsWith('bor:')) { e.preventDefault(); e.stopPropagation()
        const [que, a, campo] = k.elegida.split(':'); const x = que === 'pos' ? k.r.posiciones[a] : k.r.ordenesVivas.find(o => String(o.id) === a); const v = x && x[campo === 'medio' ? 'precioMedio' : campo]
        if (v > 0) k.mover(k.elegida, redondea(v * (1 + (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 0.01 : 0.001)))) } }
    window.addEventListener('keydown', t, true); return () => window.removeEventListener('keydown', t, true) }, [])   // eslint-disable-line

  // La barra de abajo (la misma del de un valor): avanzar / retroceder por el calendario común y saltar a la señal de cualquier valor.
  const ir = (n) => { if (!estado || estado.terminada) return false; const d = vecina(calendario, estado.desde, estado.hoy, n); if (!d) return false; limpia(); setEstado(e => irA(e, d)); return true }
  const saltaSenal = (dir) => { const d = dir > 0 ? siguienteSenalVarios(senales, estado.hoy) : anteriorSenalVarios(senales, estado.hoy, estado.desde)
    if (!d) { setAviso(dir > 0 ? 'No hay más señales desde aquí hasta el final de los datos.' : 'Desde que empezó el Replay no se dio esa señal.'); return } setAviso(''); limpia(); setEstado(e => irA(e, d)) }
  const nSen = senales ? Object.values(senales).reduce((a, x) => a + (x.entradas || []).length, 0) : 0
  const barraSenal = { elegida: senal ? `e:${senal}` : '', onElige: (v) => setSenal(v && v.startsWith('e:') ? v.slice(2) : null), onSiguiente: () => saltaSenal(1), onAnterior: () => saltaSenal(-1),
    opciones: estrategias.map(x => ({ valor: `e:${x.id}`, texto: `Estrategia «${x.name}»` })), estado: !senal ? 'sin' : senales ? 'lista' : 'cargando', n: nSen, textoN: `${nSen} entradas en ${estado?.valores?.length || 0} valores`, aviso: '' }

  if (!estado || !velas) return (
    <div data-replay-varios="" style={{ position: 'fixed', inset: 0, zIndex: 9000, background: BZ.fondo, color: BZ.texto, font: `14px ${LETRA}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10 }}>
      <div>{aviso || 'Cargando las velas de los valores…'}</div><button onClick={onSalir} style={btn()}>Salir</button>
    </div>)
  const hoySen = conSenalHoy(senales, estado.hoy)
  const lista = ordenRejilla(estado.valores, r, hoySen, orden)
  const R = REJILLA[tam]
  const indiceBH = (velas[INDICE] || []).length ? (() => { const vs = velas[INDICE].filter(v => v.date >= estado.desde && v.date <= estado.hoy); if (!vs.length) return null; const q = Math.floor((estado.capitalInicial - (estado.comision || 0)) / vs[0].close); return q > 0 ? estado.capitalInicial - q * vs[0].close - 2 * (estado.comision || 0) + q * vs[vs.length - 1].close : null })() : null
  const celda = (s, grande) => {
    const sp = grande ? 1 : R.escala
    return <div key={s} data-celda-varios={s} style={{ position: 'relative', background: '#1b1e25', border: `${hoySen.has(s) ? 2 : 1}px solid ${hoySen.has(s) ? BZ.morado : BZ.borde}`, borderRadius: 6, minWidth: 0 }}>
      <div onDoubleClick={() => setAmpliado(a => (a === s ? null : s))} title="Doble clic: ampliar / volver a la rejilla" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 6px', fontSize: 12, borderBottom: `1px solid ${BZ.borde}`, cursor: 'default' }}>
        <b>{s}</b><span style={{ color: BZ.gris }}>{n2(ahoraDe(s))}</span>{hoySen.has(s) && <span style={{ color: BZ.morado, fontWeight: 700 }}>▲ señal hoy</span>}
        <button data-ampliar-varios={s} onClick={() => setAmpliado(a => (a === s ? null : s))} title={grande ? 'Volver a la rejilla (Esc)' : 'Ampliar este gráfico'} style={{ ...btn(), padding: '0 6px', marginLeft: 'auto', fontSize: 12 }}>{grande ? '← Rejilla' : '⤢'}</button>
      </div>
      <div style={{ position: 'relative' }}>
        <GraficoValor Grafico={Grafico} simbolo={s} velas={motorVelas[s]} estado={estado} r={r} form={form} captura={captura && captura.s === s ? captura.campo : null} campoLinea={capturaLinea ? String(capturaLinea).split(':')[2] : null}
          ahora={ahoraDe(s)} senalDef={senalDef} referencias={referencias} senalS={senales?.[s]} indicadores={indicadores} onIndicadores={onIndicadores} alto={grande ? 600 : R.alto} ver={ver} elegida={elegida}
          onClicPrecio={p => clic(s, p)} onDobleClic={p => doble(s, p)} onLinea={linea(s)} />
        <PanelGrafico estado={estado} simbolo={s} r={r} ahora={ahoraDe(s)} total={cif?.final} form={form} captura={captura && captura.s === s ? captura.campo : null} capturaLinea={capturaLinea}
          onMarcar={lado => marca(s, lado)} onMarcarLinea={id => { limpia(); setCapturaLinea(id) }} onCancelaMarca={limpia} onAccion={accion} formMercado={lado => deMercado({ ...form, atrHoy: atrHoyDe(s) }, lado, ahoraDe(s))}
          onMover={mover} arrastre={arrastre} onCfg={v => setCfg(v)} cfgAbierta={cfg} autoActivo={autoActivo}
          style={{ position: 'absolute', top: 6, right: grande ? 72 : 62, zIndex: 12, transform: `scale(${sp})`, transformOrigin: 'top right' }} />
      </div>
    </div>
  }
  return (
    <div data-replay-varios="" style={{ position: 'fixed', inset: 0, zIndex: 9000, background: BZ.fondo, color: BZ.texto, font: `13px/1.45 ${LETRA}`, display: 'flex' }}>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderBottom: `1px solid ${BZ.borde}`, flexWrap: 'wrap' }}>
          <b style={{ color: '#ffd166' }}>⏪ REPLAY · {estado.valores.length} valores</b><Ayuda texto={AYUDA_VARIOS} etiqueta="Replay con varios valores" />
          {senales && <span style={{ color: BZ.morado, fontSize: 12 }}>{hoySen.size ? `▲ señal hoy en ${hoySen.size}` : 'hoy, ninguna señal'}</span>}
          <span style={{ marginLeft: 12 }} />
          <button data-tam-varios="g4" onClick={() => setTam('g4')} style={btn(tam === 'g4')}>Grandes · 4</button>
          <button data-tam-varios="g6" onClick={() => setTam('g6')} style={btn(tam === 'g6')}>Pequeños · 6</button>
          <select value={orden} onChange={e => setOrden(e.target.value)} style={casilla}><option value="importante">Primero con señal, posición u orden</option><option value="alfa">Alfabético</option></select>
        </div>
        {aviso && <div data-aviso-varios="" style={{ color: BZ.ambar, padding: '4px 10px' }}>⚠ {aviso}</div>}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 6 }}>
          {ampliado ? celda(ampliado, true)
            : <div data-rejilla-varios={tam} style={{ display: 'grid', gridTemplateColumns: `repeat(${R.porFila}, minmax(0, 1fr))`, gap: 6 }}>{lista.map(s => celda(s, false))}</div>}
          <ResultadosReplay estado={estado} r={r} cif={cif} velas={null} simbolo={null} varios onQuitar={op => { const n = quitaOperacion(estado, op); if (n) setEstado(n) }} indice={indiceBH} />
        </div>
        <BarraReplay velas={calendario} estado={estado} onIr={ir} onSalir={onSalir} onIndicadores={onIndicadores} ver={ver} onVer={setVer} senal={barraSenal} />
      </div>
      <div data-panel-derecho-varios="" style={{ width: 330, flexShrink: 0, borderLeft: `1px solid ${BZ.borde}`, background: BZ.panel, overflowY: 'auto' }}>
        <PanelOperar estado={estado} simbolo={`${estado.valores.length} valores`} r={r} cif={cif} onTerminar={v => { limpia(); setEstado(e => ({ ...e, terminada: v })) }}
          nombre={guardado.nombre || nombreDe(estado)} onNombre={nombra} guardado={guardado.estado} form={form} onForm={setForm} cfg={cfg} onCfg={setCfg} indice={indiceBH} aviso={aviso}
          auto={{ activo: autoActivo, puede: !!est, esEstrategia: !!est, onCambia: ponAuto, senal: est ? `estrategia «${est.name}» en cualquier valor` : '' }} />
      </div>
    </div>)
}
