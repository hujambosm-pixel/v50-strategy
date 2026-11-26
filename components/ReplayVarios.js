// components/ReplayVarios.js — el Replay con VARIOS valores (docs/builder.md §254–255; boceto bocetos/replay-operar-multiactivo.html,
// pestaña 2, aceptado por Sergi el 24/11). Pantalla propia, encima de la app: TODOS los valores en una rejilla (4 o 6 por fila, como
// «Charts» del screener), en la misma fecha y con UNA cuenta. §255 (pedido por Sergi el 25/11: «una copia de lo que hay en un valor»):
// cada gráfico es el MISMO del Replay de un valor (CandleChart con sus líneas arrastrables, cajas, indicadores, 🎯 y doble clic) con el
// MISMO panel de operar (PanelGrafico entero, con ⚙ junto a Compra / Venta); abajo, la MISMA barra (BarraReplay); a la derecha, siempre,
// las cifras o la tarjeta ⚙ (PanelOperar). Ampliar (⤢ o doble clic en el nombre) solo agranda un gráfico dentro de la zona de la rejilla.
// Se guarda solo, como el de un valor (tabla simulaciones). §261: velas diarias o SEMANALES (se eligen al empezar y se guardan con él).
import { useEffect, useMemo, useRef, useState } from 'react'
import Ayuda from './BuilderAyuda'
import CandleChart from './CandleChart'
import { BarraReplay, VentanaSenal, VentanaCambioVelas, AYUDA_VISTA_REPLAY } from './Replay'
import { PanelOperar, PanelGrafico, ResultadosReplay, recuerdaAjustesReplay, textoAjuste } from './PanelReplay'
import { calcula, cifras, irA, VERSION } from '../lib/replay/motor'
import { nuevaAccion, configAuto, marcasDe, tradesDe } from '../lib/replay/orden'
import { FORM_INICIAL, conClic, dobleClic, empiezaMarca, deMercado, redondea, accionMover, anade, ordenDeMarca, quitaOperacion, mueveBorrador, lineasDe, cajasDe } from '../lib/replay/borrador'
import { ordenRejilla, conSenalHoy, siguienteSenalVarios, anteriorSenalVarios, aCadaValor, deCadaValor, simbolosSenalVarios, senalesVarios } from '../lib/replay/varios'
import { entradasYSalidasEstrategia, senalesCondicion, graficoSenal, marcasSenal, marcasSalida } from '../lib/replay/senales'
import { senalesConPasos } from '../lib/condiciones/conPasos'
import { textoCortoConPasos } from '../lib/replay/conPasosPantalla'
import { fraseFilasRegla } from '../lib/builder/reglasPesos'
import { recortaVelas, vecina } from '../lib/replay/grafico'
import { paraGuardar, hayQueGuardar, nombreDe, crearSimulacion, guardarSimulacion } from '../lib/replay/guardados'
import { atr as atrDe } from '../lib/condiciones/indicadores'
import { filtraSenalesVista, visiblesVista, textoVista } from '../lib/replay/vistaReplay'

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
export const REJILLA = Object.freeze({ g2: { porFila: 2, alto: 400 }, g4: { porFila: 4, alto: 330 }, g6: { porFila: 6, alto: 250 } })

export const AYUDA_VARIOS = 'REPLAY CON VARIOS VALORES: todos los gráficos van en la MISMA fecha y operas con UNA sola cuenta (el mismo dinero para todos). ' +
  'Cada gráfico funciona igual que el Replay de un valor: «🎯 Compra» / «🎯 Venta» y un clic en el gráfico ponen la orden con los valores de ⚙; sus líneas se arrastran; las casillas, 🎯 y ✕ como siempre. ' +
  '«Señal ⏭» salta a la próxima vela en que CUALQUIER valor da la señal elegida (los que la dan llevan el borde morado). Doble clic o ⤢ amplía un gráfico (Esc vuelve a la rejilla); ampliado, el doble clic pone la orden. ' +
  'En la rejilla, la rueda baja por la página; para acercar o alejar un gráfico con la rueda, haz antes clic en él (al salir del gráfico, la rueda vuelve a bajar la página). ' +
  'Con «Ejecutar solo» (en ⚙), las señales de todos los valores compran solas; si no llega el dinero para todas, entran por orden alfabético y las demás se cuentan en «Señales sin dinero».\n\n' +
  'Se compara con el Buy&Hold de la lista (el mismo dinero a partes iguales el primer día; un valor que aún no cotiza entra el día que empieza) y con el S&P 500.'

// El primer día con vela de cualquiera de los valores desde la fecha elegida.
export function primerDia(velas, valores, fecha) {
  let m = null
  for (const s of valores) for (const v of velas[s] || []) if (v.date >= fecha) { if (m == null || v.date < m) m = v.date; break }
  return m
}

// §262: la ventana de empezar es la única del Replay (VentanaReplay de components/Replay.js).

// ── Un gráfico: el mismo del Replay de un valor (CandleChart con las props del Replay) ──
const CAPTURA = { entrada: 'capture_entry', stop: 'capture_stop', objetivo: 'capture_tp' }
const TEXTO_MARCA = { entrada: '▶ Clic en el gráfico para marcar la ENTRADA · Esc cancela', stop: '▶ Clic para marcar el STOP · Enter: sin stop ni objetivo · Esc cancela', objetivo: '▶ Clic para marcar el OBJETIVO (la orden se pone sola) · Enter: sin objetivo · Esc cancela' }
const VACIA = { ...FORM_INICIAL }
export function GraficoValor({ Grafico = CandleChart, simbolo: s, velas, estado, r, form, captura = null, campoLinea = null, ahora, senalDef = null, referencias = {}, senalS = null, indicadores = VACIO, onIndicadores = null,
  alto = 330, ver = 120, elegida = null, onClicPrecio, onDobleClic, onLinea, mini = false }) {
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
    margenDerecha={10} anchoReplayRef={anchoRef} onAnchoReplay={null} onPriceAlarm={terminada && !mini ? null : onDobleClic} onAlertaPrecio={null}
    riskMode={modo ? CAPTURA[modo] || null : null} onRiskPrice={onClicPrecio} textoCaptura={captura ? TEXTO_MARCA[captura] : campoLinea ? '▶ Clic en el gráfico: precio nuevo · Esc cancela' : null}
    riskLevels={null} onRiskLevelChange={null} riskLineActive={null} lineasReplay={lineas} onLineaReplay={onLinea} cajasReplay={cajas} mini={mini} />
}

// ── La pantalla ──
// inicial: { nuevo: { valores, fecha, capitalInicial, comision, ejecucion } } o uno guardado: { id, nombre, estado }.
// cargaVelas(simbolo, intervalo = 'diario') → Promise<velas diarias o semanales>; estrategias: las de tarjetas [{ id, name, definition, params }]; ctx: para guardar.
// indicadores / onIndicadores: los indicadores del gráfico de siempre (los mismos en todos los gráficos). Grafico: para las pruebas.
// §263: onReiniciar(nuevo) = cambiar de velas (D / S) empieza un Replay nuevo con los mismos valores, dinero y comisión.
export default function ReplayVarios({ inicial, cargaVelas, estrategias = [], tickersDe = () => [], ctx = null, onSalir, onReiniciar = null, indicadores = VACIO, onIndicadores = null, Grafico = CandleChart }) {
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
  const [vista, setVista] = useState('graficos')          // §259: pestañas arriba: los gráficos o «Operaciones», «Por valor», «Curva del capital»
  const [ver, setVer] = useState(120)
  const [ampliado, setAmpliado] = useState(null)
  const [editando, setEditando] = useState({})            // §258: los minigráficos con Entrada / Stop / Objetivo desplegados (✎)
  // §260: la señal: null | { tipo: 'estrategia', id } | { tipo: 'condicion', filas } | { tipo: 'pasos', def } (en las dos últimas,
  // las filas de «quien: 'valor'» se miran en CADA valor, lib/replay/varios.js).
  const [senal, setSenal] = useState(null)
  const [ventanaSenal, setVentanaSenal] = useState(false)
  const [cambioVelas, setCambioVelas] = useState(null)      // §263: 'diario' | 'semanal' mientras se pregunta
  const [guardado, setGuardado] = useState({ id: inicial?.id || null, nombre: inicial?.nombre || '', estado: inicial?.id ? 'guardado' : '' })

  // Las velas de todos (y del S&P 500), de 4 en 4, en el intervalo del Replay (§261). Las de las referencias de la señal y del minigráfico de
  // su ventana, diarias (como en el Replay de un valor: cada fila de la condición dice con qué velas se mira).
  const intervalo = (inicial?.estado || inicial?.nuevo)?.intervalo === 'semanal' ? 'semanal' : 'diario'
  const cargaDiarias = useMemo(() => (t) => cargaVelas(t, 'diario'), [cargaVelas])
  useEffect(() => { let vivo = true
    const vals = inicial?.estado?.valores || inicial?.nuevo?.valores || []
    ;(async () => {
      const out = {}, cola = [...vals, INDICE]
      const una = async () => { while (cola.length) { const s = cola.shift(); try { out[s] = (await cargaVelas(s, intervalo) || []).filter(v => v && !v.enCurso) } catch (_) { out[s] = [] } } }
      await Promise.all([una(), una(), una(), una()])
      if (!vivo) return
      const sin = vals.filter(s => !(out[s] || []).length)
      if (sin.length) setAviso(`Sin precios guardados de ${sin.join(', ')}: no salen.`)
      setVelas(out)
      if (!inicial?.estado) {
        const n = inicial.nuevo, ok = n.valores.filter(s => (out[s] || []).length)
        const desde = primerDia(out, ok, n.fecha)
        if (!desde) { setAviso('No hay velas desde ese día.'); return }
        setEstado({ version: VERSION, valores: ok, desde, hoy: desde, capitalInicial: n.capitalInicial, comision: n.comision, ejecucion: n.ejecucion, acciones: [], retrocesos: 0, terminada: false, intervalo, ...(n.fuente ? { fuente: n.fuente } : {}) })
        setGuardado(g => ({ ...g, nombre: nombreDe({ valores: ok, desde }) }))
      }
    })()
    return () => { vivo = false } }, [])   // eslint-disable-line

  const motorVelas = useMemo(() => velas && estado ? Object.fromEntries(estado.valores.map(s => [s, velas[s] || []])) : null, [velas, estado?.valores])   // eslint-disable-line
  // El calendario común (todas las velas de todos), para la barra: «vela N de M» y avanzar / retroceder.
  const calendario = useMemo(() => motorVelas ? [...new Set(Object.values(motorVelas).flatMap(v => v.map(x => x.date)))].sort().map(date => ({ date })) : VACIO, [motorVelas])
  // Las señales de la señal elegida, valor a valor (con las velas de sus referencias: índices, «Otro símbolo…»).
  const est = senal?.tipo === 'estrategia' ? estrategias.find(x => String(x.id) === String(senal.id)) : null
  const senalDef = useMemo(() => (senal?.tipo === 'estrategia' ? (est ? { tipo: 'estrategia', id: est.id, def: est.definition, params: est.params || {} } : null) : senal), [senal, est])
  const [refs, setRefs] = useState({})
  const faltanRefs = useMemo(() => (senalDef && velas && estado ? simbolosSenalVarios(senalDef, estado.valores, tickersDe).filter(t => !refs[t] && !velas[t]) : VACIO), [senalDef, velas, refs, estado?.valores])   // eslint-disable-line
  useEffect(() => { if (!faltanRefs.length) return
    Promise.all(faltanRefs.map(t => cargaDiarias(t).then(v => [t, (v || []).filter(x => x && !x.enCurso)]).catch(() => [t, []]))).then(l => setRefs(x => ({ ...x, ...Object.fromEntries(l) }))) }, [faltanRefs.join(',')])   // eslint-disable-line
  const velasDe = useMemo(() => (q) => (motorVelas?.[q] || refs[q] || (velas || {})[q] || VACIO), [motorVelas, refs, velas])
  const referencias = useMemo(() => (est ? Object.fromEntries(tickersDe(est.definition).map(t => [t, velasDe(t)])) : {}), [est, velasDe])   // eslint-disable-line
  const motores = { tickersDe, deCondicion: senalesCondicion, deEstrategia: entradasYSalidasEstrategia, dePasos: senalesConPasos }
  // Para el motor (y «Ejecutar solo»), la condición con pasos va sin «tu última compra», como en el de un valor.
  // §270: con una vista del screener, solo las señales de un valor en los días en que está en la lista de esa semana.
  const senalesMotor = useMemo(() => (!senalDef || !motorVelas || faltanRefs.length ? null : filtraSenalesVista(senalesVarios(senalDef, estado.valores, velasDe, motores), estado.fuente)), [senalDef, motorVelas, velasDe, faltanRefs.length])   // eslint-disable-line
  const r = useMemo(() => estado && motorVelas ? calcula(estado, motorVelas, senalesMotor ? { senales: senalesMotor } : {}) : null, [estado, motorVelas, senalesMotor])
  // Las que se ven (▲, «Señal ⏭»): con pasos, con tus compras de cada valor (por si la condición mira «tu última compra»).
  const firmaCompras = senalDef?.tipo === 'pasos' && r ? JSON.stringify((r.marcas || []).filter(m => m.tipo === 'compra').map(m => [m.simbolo, m.fecha, m.precio])) : ''
  const senales = useMemo(() => { if (!senalesMotor || senalDef?.tipo !== 'pasos' || firmaCompras === '[]') return senalesMotor
    const compras = {}; for (const [s, fecha, precio] of JSON.parse(firmaCompras)) (compras[s] ||= []).push({ fecha, precio })
    return filtraSenalesVista(senalesVarios(senalDef, estado.valores, velasDe, { ...motores, compras }), estado.fuente) }, [senalesMotor, firmaCompras])   // eslint-disable-line
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
  useEffect(() => { if (autoActivo && !senalDef) ponAuto(false) }, [senalDef])   // eslint-disable-line

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
  // §260: como en el de un valor: «Una condición (del catálogo o con pasos)…» abre la ventana; luego sale su frase y «Cambiar la condición…».
  const cond = senal?.tipo === 'condicion' || senal?.tipo === 'pasos'
  const primero = estado?.valores?.[0] || ''
  const eligeSenal = (v) => { setAviso('')
    if (!v) { setSenal(null); return }
    if (v === 'cond-nueva' || (v === 'cond' && !cond)) { setVentanaSenal(true); return }
    if (v.startsWith('e:')) setSenal({ tipo: 'estrategia', id: v.slice(2) }) }
  const textoSenal = !senal ? '' : senal.tipo === 'estrategia' ? `estrategia «${est?.name || ''}» en cualquier valor` : senal.tipo === 'pasos' ? 'tu condición con pasos en cualquier valor' : `la condición «${fraseFilasRegla(senal.filas || [])}» en cualquier valor`
  const barraSenal = { elegida: senal ? (cond ? 'cond' : `e:${senal.id}`) : '', onElige: eligeSenal, onSiguiente: () => saltaSenal(1), onAnterior: () => saltaSenal(-1),
    opciones: [...(cond ? [{ valor: 'cond', texto: senal.tipo === 'pasos' ? `Con pasos: ${textoCortoConPasos(senal.def)}` : `Condición: ${fraseFilasRegla(senal.filas || [])}` }, { valor: 'cond-nueva', texto: 'Cambiar la condición…' }]
      : [{ valor: 'cond', texto: 'Una condición (del catálogo o con pasos)…' }]), ...estrategias.map(x => ({ valor: `e:${x.id}`, texto: `Estrategia «${x.name}»` }))],
    estado: !senal ? 'sin' : senales ? 'lista' : 'cargando', n: nSen, textoN: `${nSen} entradas en ${estado?.valores?.length || 0} valores`, aviso: '' }

  if (!estado || !velas) return (
    <div data-replay-varios="" style={{ position: 'fixed', inset: 0, zIndex: 9000, background: BZ.fondo, color: BZ.texto, font: `14px ${LETRA}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10 }}>
      <div>{aviso || 'Cargando las velas de los valores…'}</div><button onClick={onSalir} style={btn()}>Salir</button>
    </div>)
  const hoySen = conSenalHoy(senales, estado.hoy)
  const esVista = estado.fuente?.tipo === 'vista'
  const lista = ordenRejilla(visiblesVista(estado.fuente, estado.hoy, r, estado.valores), r, hoySen, orden)
  const R = REJILLA[tam]
  const indiceBH = (velas[INDICE] || []).length ? (() => { const vs = velas[INDICE].filter(v => v.date >= estado.desde && v.date <= estado.hoy); if (!vs.length) return null; const q = Math.floor((estado.capitalInicial - (estado.comision || 0)) / vs[0].close); return q > 0 ? estado.capitalInicial - q * vs[0].close - 2 * (estado.comision || 0) + q * vs[vs.length - 1].close : null })() : null
  // El panel de operar de un valor (§258: en la rejilla, en la cabecera; ampliado, encima del gráfico como en el de un valor).
  const panel = (s, extra) => <PanelGrafico estado={estado} simbolo={s} r={r} ahora={ahoraDe(s)} total={cif?.final} form={form} captura={captura && captura.s === s ? captura.campo : null} capturaLinea={capturaLinea}
    onMarcar={lado => marca(s, lado)} onMarcarLinea={id => { limpia(); setCapturaLinea(id) }} onCancelaMarca={limpia} onAccion={accion} formMercado={lado => deMercado({ ...form, atrHoy: atrHoyDe(s) }, lado, ahoraDe(s))}
    onMover={mover} arrastre={arrastre} onCfg={v => setCfg(v)} cfgAbierta={cfg} autoActivo={autoActivo} {...extra} />
  const celda = (s, grande) => {
    return <div key={s} data-celda-varios={s} style={{ position: 'relative', background: '#1b1e25', border: `${hoySen.has(s) ? 2 : 1}px solid ${hoySen.has(s) ? BZ.morado : BZ.borde}`, borderRadius: 6, minWidth: 0 }}>
      <div data-cabecera-varios={s} onDoubleClick={() => setAmpliado(a => (a === s ? null : s))} title="Doble clic: ampliar / volver a la rejilla" style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '2px 5px', fontSize: 12, borderBottom: `1px solid ${BZ.borde}`, cursor: 'default', minHeight: 24, whiteSpace: 'nowrap', overflow: 'hidden' }}>
        <b>{s}</b><span style={{ color: BZ.gris, fontSize: 11 }}>{n2(ahoraDe(s))}</span>{hoySen.has(s) && <span title="Señal hoy" style={{ color: BZ.morado, fontWeight: 700 }}>{grande ? '▲ señal hoy' : '▲'}</span>}
        {!grande && panel(s, { cabecera: true, onEditar: v => setEditando(x => ({ ...x, [s]: v })), editando: !!editando[s], style: { marginLeft: 'auto' } })}
        <button data-ampliar-varios={s} onClick={() => setAmpliado(a => (a === s ? null : s))} title={grande ? 'Volver a la rejilla (Esc)' : 'Ampliar este gráfico'} style={{ ...btn(), padding: grande ? '0 6px' : '0 5px', marginLeft: grande ? 'auto' : 0, fontSize: grande ? 12 : 11, lineHeight: grande ? undefined : '18px' }}>{grande ? '← Rejilla' : '⤢'}</button>
      </div>
      {!grande && editando[s] && (r?.posiciones?.[s] || (r?.ordenesVivas || []).some(o => o.simbolo === s)) && panel(s, { sinBotones: true, style: { maxWidth: 'none', borderRadius: 0, border: 'none', borderBottom: `1px solid ${BZ.borde}`, boxShadow: 'none', background: '#232730' } })}
      <div style={{ position: 'relative' }}>
        <GraficoValor Grafico={Grafico} simbolo={s} velas={motorVelas[s]} estado={estado} r={r} form={form} captura={captura && captura.s === s ? captura.campo : null} campoLinea={capturaLinea ? String(capturaLinea).split(':')[2] : null}
          ahora={ahoraDe(s)} senalDef={senalDef} referencias={referencias} senalS={senales?.[s]} indicadores={indicadores} onIndicadores={onIndicadores} alto={grande ? 600 : R.alto} ver={ver} elegida={elegida}
          onClicPrecio={p => clic(s, p)} onDobleClic={grande ? (p => doble(s, p)) : (() => setAmpliado(s))} onLinea={linea(s)} mini={!grande} />
        {grande && panel(s, { style: { position: 'absolute', top: 6, right: 72, zIndex: 12 } })}
      </div>
    </div>
  }
  return (
    <div data-replay-varios="" style={{ position: 'fixed', inset: 0, zIndex: 9000, background: BZ.fondo, color: BZ.texto, font: `13px/1.45 ${LETRA}`, display: 'flex' }}>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderBottom: `1px solid ${BZ.borde}`, flexWrap: 'wrap' }}>
          <b style={{ color: '#ffd166' }}>⏪ REPLAY · {esVista ? `${lista.length} de ${estado.valores.length} valores` : `${estado.valores.length} valores`}</b><Ayuda texto={AYUDA_VARIOS} etiqueta="Replay con varios valores" />
          {esVista && <span data-vista-varios-texto="" style={{ color: BZ.azul, fontSize: 12 }}>{textoVista(estado.fuente, estado.hoy)}{(estado.fuente.noSeAplican || []).length ? <span style={{ color: BZ.ambar }}> · ⚠ PEG esperado sin aplicar</span> : null} <Ayuda texto={AYUDA_VISTA_REPLAY} etiqueta="Vista del screener" /></span>}
          {onReiniciar && <span data-velas-varios="" title="Velas del Replay. Cambiarlas empieza un Replay nuevo (el de ahora se queda guardado)." style={{ display: 'inline-flex', gap: 2 }}>
            {[['diario', 'D'], ['semanal', 'S']].map(([k, t]) => <button key={k} data-velas={k} onClick={() => { if (k !== intervalo) setCambioVelas(k) }} style={{ ...btn(intervalo === k), padding: '1px 7px' }}>{t}</button>)}</span>}
          {intervalo === 'semanal' && <span style={{ color: BZ.gris, fontSize: 12 }}>velas semanales</span>}
          {senales && <span style={{ color: BZ.morado, fontSize: 12 }}>{hoySen.size ? `▲ señal hoy en ${hoySen.size}` : 'hoy, ninguna señal'}</span>}
          <span style={{ marginLeft: 12 }} />
          {[['graficos', 'Gráficos'], ['ops', `Operaciones · ${r?.operaciones?.length || 0}`], ['valor', 'Por valor'], ['curva', 'Curva del capital']].map(([k, t]) =>
            <button key={k} data-vista-varios={k} onClick={() => setVista(k)} style={btn(vista === k)}>{t}</button>)}
          {vista === 'graficos' && <>
            <span style={{ marginLeft: 12, color: BZ.gris }}>Por fila:</span>
            {['g2', 'g4', 'g6'].map(k => <button key={k} data-tam-varios={k} onClick={() => setTam(k)} title={`${REJILLA[k].porFila} gráficos por fila`} style={btn(tam === k)}>{REJILLA[k].porFila}</button>)}
            <select data-orden-varios="" value={orden} onChange={e => setOrden(e.target.value)} style={{ ...casilla, width: 'auto' }}><option value="importante">Primero con señal, posición u orden</option><option value="alfa">Alfabético</option></select>
          </>}
        </div>
        {aviso && <div data-aviso-varios="" style={{ color: BZ.ambar, padding: '4px 10px' }}>⚠ {aviso}</div>}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 6 }}>
          {vista !== 'graficos'
            ? <ResultadosReplay estado={estado} r={r} cif={cif} velas={null} simbolo={null} varios onQuitar={op => { const n = quitaOperacion(estado, op); if (n) setEstado(n) }} indice={indiceBH} vista={vista} onVista={setVista} sinPestanas />
            : ampliado ? celda(ampliado, true)
            : <div data-rejilla-varios={tam} style={{ display: 'grid', gridTemplateColumns: `repeat(${R.porFila}, minmax(0, 1fr))`, gap: 6 }}>{lista.map(s => celda(s, false))}</div>}
        </div>
        <BarraReplay velas={calendario} estado={estado} onIr={ir} onSalir={onSalir} onIndicadores={onIndicadores} ver={ver} onVer={setVer} senal={barraSenal} />
      </div>
      <div data-panel-derecho-varios="" style={{ width: 330, flexShrink: 0, borderLeft: `1px solid ${BZ.borde}`, background: BZ.panel, overflowY: 'auto' }}>
        <PanelOperar onAjustes={c => { recuerdaAjustesReplay({ ...estado, ...c }); if ((estado.acciones || []).length) setAviso(`Recalculado desde el principio con ${textoAjuste(c)}.`); setEstado(e => ({ ...e, ...c })) }} estado={estado} simbolo={`${estado.valores.length} valores`} r={r} cif={cif} onTerminar={v => { limpia(); setEstado(e => ({ ...e, terminada: v })) }}
          nombre={guardado.nombre || nombreDe(estado)} onNombre={nombra} guardado={guardado.estado} form={form} onForm={setForm} cfg={cfg} onCfg={setCfg} indice={indiceBH} aviso={aviso}
          auto={{ activo: autoActivo, puede: !!senalesMotor, esEstrategia: senalDef?.tipo === 'estrategia', onCambia: ponAuto, senal: textoSenal }} />
      </div>
      {cambioVelas && <VentanaCambioVelas a={cambioVelas} desde={estado.desde} hoy={estado.hoy} onCancelar={() => setCambioVelas(null)}
        onElige={m => { setCambioVelas(null); onReiniciar({ valores: estado.valores, fecha: m === 'inicio' ? estado.desde : estado.hoy, capitalInicial: estado.capitalInicial, comision: estado.comision, ejecucion: estado.ejecucion, intervalo: cambioVelas, ...(estado.fuente ? { fuente: estado.fuente } : {}) }) }} />}
      {ventanaSenal && <VentanaSenal simbolo={primero} senal={cond ? deCadaValor(senal, primero) : null} velas={motorVelas?.[primero] || VACIO} cargaVelas={cargaDiarias} simbolosAzar={estado.valores} hoy={estado.hoy}
        nota={`Con varios valores, lo que pongas en «${primero}» se mira en CADA valor de la lista (${estado.valores.length}), cada uno con sus velas. Un índice u «Otro símbolo…» es el mismo para todos.`}
        onAceptar={x => { setSenal(aCadaValor(x, primero)); setVentanaSenal(false); setAviso('') }} onCancelar={() => setVentanaSenal(false)} />}
    </div>)
}
