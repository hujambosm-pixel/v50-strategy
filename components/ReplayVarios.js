// components/ReplayVarios.js — el Replay con VARIOS valores (docs/builder.md §254; boceto bocetos/replay-operar-multiactivo.html, pestaña 2,
// aceptado por Sergi el 24/11). Pantalla propia, encima de la app: una rejilla de gráficos (Grandes · 4 / Pequeños · 6) en la misma fecha
// y UNA cuenta. Reutiliza el motor (lib/replay/motor.js), el panel de operar de cada gráfico (PanelGrafico, compacto en la rejilla y
// entero al ampliar con doble clic), las cifras y la tarjeta ⚙ (PanelOperar) y la tabla (ResultadosReplay). Se guarda solo, como el de
// un valor (tabla simulaciones). Velas diarias.
import { useEffect, useMemo, useRef, useState } from 'react'
import Ayuda from './BuilderAyuda'
import { PanelOperar, PanelGrafico, ResultadosReplay } from './PanelReplay'
import { calcula, cifras, irA, siguiente, VERSION } from '../lib/replay/motor'
import { compruebaOrden, nuevaAccion, configAuto } from '../lib/replay/orden'
import { FORM_INICIAL, conClic, empiezaMarca, deMercado, redondea, accionMover, anade, ordenDeMarca, quitaOperacion } from '../lib/replay/borrador'
import { POR_PAGINA, ordenRejilla, pagina, conSenalHoy, siguienteSenalVarios } from '../lib/replay/varios'
import { entradasYSalidasEstrategia } from '../lib/replay/senales'
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
export const MAX_VALORES = 30

export const AYUDA_VARIOS = 'REPLAY CON VARIOS VALORES: todos los gráficos van en la MISMA fecha y operas con UNA sola cuenta (el mismo dinero para todos). ' +
  '«Señal ⏭» salta a la próxima vela en que CUALQUIER valor da la señal elegida (los que la dan llevan el borde morado). ' +
  'En cada gráfico, «🎯 Compra» / «🎯 Venta» y un clic en el gráfico ponen la orden (con los valores de ⚙); con doble clic el gráfico se amplía con su panel entero (Esc vuelve). ' +
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

// ── Un gráfico de la rejilla (SVG): velas hasta hoy, ▲ de las señales, operaciones, posición y órdenes con sus líneas ──
export function GraficoVarios({ simbolo, velas, hoy, r, entradas = [], nVelas = 90, alto = 240, marcando = false, onPrecio, conSenal = false }) {
  const ref = useRef(null)
  const [ancho, setAncho] = useState(600)
  useEffect(() => { const el = ref.current; if (!el || typeof ResizeObserver === 'undefined') return; const o = new ResizeObserver(e => setAncho(Math.max(200, e[0].contentRect.width))); o.observe(el); return () => o.disconnect() }, [])
  const hasta = (velas || []).filter(v => v.date <= hoy)
  const vs = hasta.slice(-nVelas)
  const W = ancho, H = alto, der = 56, arr = 22, abj = 16, hueco = 6
  const pos = r?.posiciones?.[simbolo], vivas = (r?.ordenesVivas || []).filter(o => o.simbolo === simbolo)
  let lo = Infinity, hi = -Infinity
  for (const v of vs) { lo = Math.min(lo, v.low); hi = Math.max(hi, v.high) }
  for (const x of [pos?.stop, pos?.objetivo, ...vivas.flatMap(o => [o.entrada, o.stop, o.objetivo])]) if (x != null && Number.isFinite(x)) { lo = Math.min(lo, x); hi = Math.max(hi, x) }
  if (!vs.length || !Number.isFinite(lo)) return <div ref={ref} style={{ height: H, color: BZ.gris, padding: 10 }}>{simbolo}: aún no cotiza el {fmt(hoy)}.</div>
  const m = (hi - lo) * 0.06 || 1; lo -= m; hi += m
  const bw = (W - der - 4) / (vs.length + hueco)
  const X = (i) => 4 + (i + 0.5) * bw, Y = (p) => arr + (hi - p) / (hi - lo) * (H - arr - abj)
  const iDe = new Map(vs.map((v, i) => [v.date, i]))
  const xFecha = (d) => { if (iDe.has(d)) return X(iDe.get(d)); return d < vs[0].date ? X(0) : X(vs.length - 1) }
  const precioDe = (e) => { const b = e.currentTarget.getBoundingClientRect(); const y = (e.clientY - b.top) * (H / b.height); return redondea(hi - (y - arr) / (H - arr - abj) * (hi - lo)) }
  const linea = (p, col, disc, desde, txt) => p == null ? null : <g key={`${col}${p}${txt}`}><line x1={desde ?? 0} x2={W - der} y1={Y(p)} y2={Y(p)} stroke={col} strokeWidth="1.2" strokeDasharray={disc ? '5 4' : ''} />
    <rect x={W - der} y={Y(p) - 7} width={der} height={14} fill={col} /><text x={W - der + 3} y={Y(p) + 4} fontSize="10" fill="#111">{n2(p)}</text>
    {txt && <text x={W - der - 4} y={Y(p) - 3} fontSize="10" fill={col} textAnchor="end">{txt}</text>}</g>
  const marcas = (entradas || []).filter(d => iDe.has(d))
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <svg data-grafico-varios={simbolo} viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: H, display: 'block', cursor: marcando ? 'crosshair' : 'default' }}
        onClick={e => { if (marcando && onPrecio) onPrecio(precioDe(e)) }}>
        {[0, 1, 2, 3].map(k => { const p = lo + (hi - lo) * (k + 0.5) / 4; return <g key={k}><line x1={0} x2={W - der} y1={Y(p)} y2={Y(p)} stroke="#2f3440" /><text x={W - der + 3} y={Y(p) + 4} fontSize="10" fill={BZ.gris}>{n2(p)}</text></g> })}
        {pos && <rect x={xFecha(pos.fecha) - bw / 2} y={0} width={W - der - xFecha(pos.fecha) + bw / 2} height={H} fill="rgba(88,166,255,0.06)" />}
        {vs.map((v, i) => { const up = v.close >= v.open, c = up ? BZ.verde : BZ.rojo, w = Math.max(1, bw * 0.7)
          return <g key={v.date}><line x1={X(i)} x2={X(i)} y1={Y(v.high)} y2={Y(v.low)} stroke={c} /><rect x={X(i) - w / 2} y={Math.min(Y(v.open), Y(v.close))} width={w} height={Math.max(1, Math.abs(Y(v.open) - Y(v.close)))} fill={c} /></g> })}
        {marcas.map(d => { const i = iDe.get(d), x = X(i), y = Y(vs[i].low) + 10; return <path key={d} d={`M${x},${y - 6} L${x - 4},${y + 1} L${x + 4},${y + 1} Z`} fill={BZ.morado} /> })}
        {(r?.operaciones || []).filter(o => o.simbolo === simbolo && o.fechaSalida >= vs[0].date).map(o => { const xa = xFecha(o.fechaEntrada), xb = xFecha(o.fechaSalida), c = o.resultado > 0 ? BZ.verde : BZ.rojo
          return <g key={o.num}><line x1={xa} x2={xb} y1={Y(o.precioEntrada)} y2={Y(o.precioSalida)} stroke={c} strokeWidth="2" /><text x={xb} y={Y(Math.max(o.precioEntrada, o.precioSalida)) - 6} fontSize="10" fill={c} textAnchor="middle">#{o.num} {o.pct >= 0 ? '+' : '−'}{Math.abs(o.pct).toFixed(1).replace('.', ',')} %</text></g> })}
        {pos && <>{linea(pos.precioMedio, BZ.azul, false, xFecha(pos.fecha), `#${pos.num} ${pos.lado > 0 ? 'Largo' : 'Corto'} ${pos.acciones}`)}{linea(pos.stop, BZ.rojo, false, xFecha(pos.fecha), 'Stop')}{linea(pos.objetivo, BZ.verde, false, xFecha(pos.fecha), 'Objetivo')}</>}
        {vivas.map(o => <g key={o.id}>{linea(o.entrada, BZ.azul, true, xFecha(o.cambiada || o.fecha), `${o.lado > 0 ? 'Compra' : 'Venta'} ${o.clase === 'limite' ? 'límite' : 'stop'}`)}{linea(o.stop, BZ.rojo, true, xFecha(o.cambiada || o.fecha))}{linea(o.objetivo, BZ.verde, true, xFecha(o.cambiada || o.fecha))}</g>)}
        {linea(vs[vs.length - 1].close, BZ.gris, true, X(vs.length - 1))}
      </svg>
      {conSenal && <span title="Hoy da la señal elegida" style={{ position: 'absolute', left: 8, bottom: 2, color: BZ.morado, fontSize: 11, fontWeight: 700 }}>▲ señal hoy</span>}
    </div>)
}

// ── La pantalla ──
// inicial: { estado } (uno guardado: { id, nombre, estado }) o { nuevo: { valores, fecha, capitalInicial, comision, ejecucion } }.
// cargaVelas(simbolo) → Promise<velas diarias>; estrategias: las de tarjetas [{ id, name, definition, params }]; ctx: para guardar.
export default function ReplayVarios({ inicial, cargaVelas, estrategias = [], tickersDe = () => [], ctx = null, onSalir }) {
  const [velas, setVelas] = useState(null)        // { SIM: [velas] } (más el índice)
  const [estado, setEstado] = useState(inicial?.estado || null)
  const [aviso, setAviso] = useState('')
  const [form, setForm] = useState(() => { try { const g = JSON.parse(localStorage.getItem('replay.orden') || '{}'); return { ...FORM_INICIAL, ...(g.stopPct === undefined ? { stopPct: '5' } : {}), ...(g.rr === undefined ? { rr: '2' } : {}), ...AJUSTES.reduce((o, k) => g[k] != null ? { ...o, [k]: g[k] } : o, {}) } } catch (_) { return FORM_INICIAL } })
  useEffect(() => { try { localStorage.setItem('replay.orden', JSON.stringify(AJUSTES.reduce((o, k) => form[k] !== undefined ? { ...o, [k]: form[k] } : o, {}))) } catch (_) {} }, AJUSTES.map(k => form[k]))   // eslint-disable-line
  const [captura, setCaptura] = useState(null)       // { s, campo } mientras se marca una orden nueva
  const [capturaLinea, setCapturaLinea] = useState(null)   // id de la línea que mueve el próximo clic
  const [cfg, setCfg] = useState(false)
  const [tam, setTam] = useState('g4'), [pag, setPag] = useState(0), [orden, setOrden] = useState('importante')
  const [ampliado, setAmpliado] = useState(null)
  const [senal, setSenal] = useState(null)           // id de la estrategia elegida
  const [juega, setJuega] = useState(false)
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
  // Las señales de la estrategia elegida, valor a valor (con las velas de sus referencias, si lleva filtros de otros símbolos).
  const est = estrategias.find(x => String(x.id) === String(senal))
  const [refs, setRefs] = useState({})
  useEffect(() => { if (!est) return; const faltan = tickersDe(est.definition).filter(t => !refs[t] && !(velas || {})[t]); if (!faltan.length) return
    Promise.all(faltan.map(t => cargaVelas(t).then(v => [t, v || []]).catch(() => [t, []]))).then(l => setRefs(x => ({ ...x, ...Object.fromEntries(l) }))) }, [senal, velas])   // eslint-disable-line
  const senales = useMemo(() => { if (!est || !motorVelas) return null; const out = {}
    const R = Object.fromEntries(tickersDe(est.definition).map(t => [t, refs[t] || (velas || {})[t] || []]))
    for (const s of estado.valores) { try { out[s] = entradasYSalidasEstrategia({ def: est.definition, params: est.params || {}, velas: motorVelas[s], referencias: R }) } catch (_) { out[s] = { entradas: [], salidas: [] } } }
    return out }, [est, motorVelas, refs])   // eslint-disable-line
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

  // Avanzar y saltar (se deja de marcar).
  const limpia = () => { setCaptura(null); setCapturaLinea(null); setForm(f => ({ ...f, mercado: true, entrada: '', stop: '', objetivo: '' })) }
  const avanza = (n) => { if (!estado || estado.terminada) return false; const d = siguiente(estado, motorVelas, n); if (!d) { setJuega(false); return false } limpia(); setEstado(e => irA(e, d)); return true }
  const saltaSenal = () => { const d = siguienteSenalVarios(senales, estado.hoy); if (!d) { setAviso('No hay más señales desde aquí.'); return } setAviso(''); limpia(); setEstado(e => irA(e, d)) }
  useEffect(() => { if (!juega) return; const t = setInterval(() => { if (!avanza(1)) setJuega(false) }, 500); return () => clearInterval(t) }, [juega, estado?.hoy])   // eslint-disable-line
  useEffect(() => { const t = (e) => { if (e.key !== 'Escape') return; if (captura || capturaLinea) { limpia(); return } if (ampliado) setAmpliado(null) }; window.addEventListener('keydown', t); return () => window.removeEventListener('keydown', t) }, [captura, capturaLinea, ampliado])   // eslint-disable-line

  // Operar en un gráfico.
  const accion = (a) => setEstado(e => ({ ...e, acciones: anade(e.acciones, a) }))
  const marca = (s, lado) => { setCapturaLinea(null); const c = empiezaMarca({ ...form, atrHoy: atrHoyDe(s) }, lado); setForm(c.f); setCaptura({ s, campo: c.captura }) }
  const clic = (s, p) => {
    if (capturaLinea) { const id = capturaLinea; setCapturaLinea(null); mover(id, p); return }
    if (!captura || captura.s !== s) return
    const c = conClic(form, captura.campo, p, ahoraDe(s))
    if (!c.listo) { setForm(c.f); setCaptura({ s, campo: c.captura }); return }
    const o = ordenDeMarca(c.f, ahoraDe(s)); limpia()
    if (o.error) { setAviso(o.error); return } setAviso(o.aviso || '')
    accion(nuevaAccion(estado, s, o.orden))
  }
  const mover = (id, p) => { const [que, a] = String(id).split(':'); const s = que === 'pos' ? a : (r.ordenesVivas.find(o => String(o.id) === a) || {}).simbolo
    const c = accionMover(estado, r, id, p, ahoraDe(s)); if (c.error) { setAviso(c.error); return } setAviso(''); accion(c.accion) }
  const panel = (s, compacto, style) => <PanelGrafico estado={estado} simbolo={s} r={r} ahora={ahoraDe(s)} total={cif?.final} form={form} compacto={compacto}
    captura={captura && captura.s === s ? captura.campo : null} capturaLinea={capturaLinea} onMarcar={lado => marca(s, lado)} onMarcarLinea={id => { limpia(); setCapturaLinea(id) }}
    onCancelaMarca={limpia} onAccion={accion} formMercado={lado => deMercado({ ...form, atrHoy: atrHoyDe(s) }, lado, ahoraDe(s))} onMover={mover}
    onCfg={compacto ? null : v => setCfg(v)} cfgAbierta={cfg} autoActivo={autoActivo} style={style} />

  if (!estado || !velas) return (
    <div data-replay-varios="" style={{ position: 'fixed', inset: 0, zIndex: 9000, background: BZ.fondo, color: BZ.texto, font: `14px ${LETRA}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10 }}>
      <div>{aviso || 'Cargando las velas de los valores…'}</div><button onClick={onSalir} style={btn()}>Salir</button>
    </div>)
  const hoySen = conSenalHoy(senales, estado.hoy)
  const lista = ordenRejilla(estado.valores, r, hoySen, orden)
  const pg = pagina(lista, POR_PAGINA[tam], pag)
  const indiceBH = (velas[INDICE] || []).length ? (() => { const vs = velas[INDICE].filter(v => v.date >= estado.desde && v.date <= estado.hoy); if (!vs.length) return null; const q = Math.floor((estado.capitalInicial - (estado.comision || 0)) / vs[0].close); return q > 0 ? estado.capitalInicial - q * vs[0].close - 2 * (estado.comision || 0) + q * vs[vs.length - 1].close : null })() : null
  const quedan = (() => { const s = new Set(); for (const v of estado.valores) for (const x of motorVelas[v] || []) if (x.date > estado.hoy) s.add(x.date); return s.size })()
  return (
    <div data-replay-varios="" style={{ position: 'fixed', inset: 0, zIndex: 9000, background: BZ.fondo, color: BZ.texto, font: `13px/1.45 ${LETRA}`, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderBottom: `1px solid ${BZ.borde}`, flexWrap: 'wrap' }}>
        <b style={{ color: '#ffd166' }}>⏪ REPLAY · {estado.valores.length} valores</b><Ayuda texto={AYUDA_VARIOS} etiqueta="Replay con varios valores" />
        <span style={{ color: BZ.gris }}>Señal:</span>
        <select data-senal-varios="" value={senal || ''} onChange={e => setSenal(e.target.value || null)} style={{ ...casilla, maxWidth: 260 }}>
          <option value="">— ninguna —</option>{estrategias.map(x => <option key={x.id} value={x.id}>Estrategia «{x.name}»</option>)}</select>
        {senales && <span style={{ color: BZ.morado, fontSize: 12 }}>{hoySen.size ? `▲ hoy en ${hoySen.size}` : 'hoy, ninguna señal'}</span>}
        <span style={{ marginLeft: 12 }} />
        <button data-tam-varios="g4" onClick={() => { setTam('g4'); setPag(0) }} style={btn(tam === 'g4')}>Grandes · 4</button>
        <button data-tam-varios="g6" onClick={() => { setTam('g6'); setPag(0) }} style={btn(tam === 'g6')}>Pequeños · 6</button>
        <select value={orden} onChange={e => setOrden(e.target.value)} style={casilla}><option value="importante">Primero con señal, posición u orden</option><option value="alfa">Alfabético</option></select>
        <button onClick={() => setPag(p => p - 1)} disabled={pg.pagina === 0} style={btn(false, pg.pagina > 0)}>◀</button><span>{pg.pagina + 1} / {pg.paginas}</span>
        <button onClick={() => setPag(p => p + 1)} disabled={pg.pagina >= pg.paginas - 1} style={btn(false, pg.pagina < pg.paginas - 1)}>▶</button>
        <button data-salir-varios="" onClick={onSalir} style={{ ...btn(), marginLeft: 'auto' }}>✕ Salir</button>
      </div>
      {aviso && <div data-aviso-varios="" style={{ color: BZ.ambar, padding: '4px 10px' }}>⚠ {aviso}</div>}
      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: 8 }}>
          <div data-rejilla-varios="" style={{ display: 'grid', gridTemplateColumns: tam === 'g4' ? '1fr 1fr' : '1fr 1fr 1fr', gap: 6 }}>
            {pg.valores.map(s => <div key={s} data-celda-varios={s} onDoubleClick={() => { if (!captura && !capturaLinea) setAmpliado(s) }}
              style={{ position: 'relative', background: '#1b1e25', border: `${hoySen.has(s) ? 2 : 1}px solid ${hoySen.has(s) ? BZ.morado : BZ.borde}`, borderRadius: 6 }}>
              <div style={{ position: 'absolute', left: 8, top: 4, fontWeight: 600, fontSize: 12, pointerEvents: 'none' }}>{s} <span style={{ color: BZ.gris, fontWeight: 400 }}>{n2(ahoraDe(s))}</span></div>
              <GraficoVarios simbolo={s} velas={motorVelas[s]} hoy={estado.hoy} r={r} entradas={senales?.[s]?.entradas} nVelas={tam === 'g4' ? 90 : 60} alto={tam === 'g4' ? 250 : 180}
                marcando={(captura && captura.s === s) || !!capturaLinea} onPrecio={p => clic(s, p)} conSenal={hoySen.has(s)} />
              {panel(s, true, { position: 'absolute', top: 22, right: 60, zIndex: 2 })}
            </div>)}
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', background: BZ.panel, border: `1px solid ${BZ.borde}`, borderRadius: 6, padding: '6px 8px', marginTop: 6, flexWrap: 'wrap' }}>
            <button data-uno-varios="" onClick={() => avanza(1)} style={btn()} title="Una vela">▶|</button>
            <button onClick={() => setJuega(j => !j)} style={btn(juega)}>{juega ? '⏸' : '▶ 2/s'}</button>
            <button data-cinco-varios="" onClick={() => avanza(5)} style={btn()}>▶▶ 5</button>
            <button data-senal-sig-varios="" onClick={saltaSenal} disabled={!senales} style={btn(false, !!senales)} title="A la próxima vela en que CUALQUIER valor da la señal">Señal ⏭</button>
            <button data-cfg-varios="" onClick={() => setCfg(c => !c)} style={btn(cfg)} title="Valores por defecto: tipo de orden, stop, objetivo, tamaño y «Ejecutar solo»">⚙ Valores por defecto</button>
            <span>Hoy en el Replay: <b data-hoy-varios="">{fmt(estado.hoy)}</b></span><span style={{ color: BZ.gris }}>· quedan {quedan.toLocaleString('es-ES')} velas</span>
          </div>
          <ResultadosReplay estado={estado} r={r} cif={cif} velas={null} simbolo={null} varios onQuitar={op => { const n = quitaOperacion(estado, op); if (n) setEstado(n) }} indice={indiceBH} />
        </div>
        <div style={{ width: 330, flexShrink: 0, borderLeft: `1px solid ${BZ.borde}`, background: BZ.panel, overflowY: 'auto' }}>
          <PanelOperar estado={estado} simbolo={`${estado.valores.length} valores`} r={r} cif={cif} onTerminar={v => { limpia(); setEstado(e => ({ ...e, terminada: v })) }}
            nombre={guardado.nombre || nombreDe(estado)} onNombre={nombra} guardado={guardado.estado} form={form} onForm={setForm} cfg={cfg} onCfg={setCfg} indice={indiceBH}
            auto={{ activo: autoActivo, puede: !!est, esEstrategia: !!est, onCambia: ponAuto, senal: est ? `estrategia «${est.name}» en cualquier valor` : '' }} />
        </div>
      </div>
      {ampliado && <div data-ampliado-varios={ampliado} style={{ position: 'fixed', inset: 0, zIndex: 9100, background: 'rgba(10,12,16,0.94)', padding: 14, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}><b>{ampliado} · {fmt(estado.hoy)}</b><span style={{ color: BZ.gris }}>Esc o</span><button onClick={() => setAmpliado(null)} style={btn()}>✕ Cerrar</button></div>
        <div style={{ position: 'relative', background: '#1b1e25', border: `1px solid ${BZ.borde}`, borderRadius: 6 }}>
          <GraficoVarios simbolo={ampliado} velas={motorVelas[ampliado]} hoy={estado.hoy} r={r} entradas={senales?.[ampliado]?.entradas} nVelas={160} alto={560}
            marcando={(captura && captura.s === ampliado) || !!capturaLinea} onPrecio={p => clic(ampliado, p)} conSenal={hoySen.has(ampliado)} />
          {panel(ampliado, false, { position: 'absolute', top: 8, right: 64, zIndex: 2 })}
        </div>
      </div>}
    </div>)
}
