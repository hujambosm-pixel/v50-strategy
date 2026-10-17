// components/CarteraPanel.js — la pantalla «Laboratorio de cartera» (CARTERA_1).
//
// Una regla de cartera es una máquina de ESTADOS sobre el QQQ y un ETF apalancado (lib/laboratorioCartera.js): el diagrama
// la enseña con la condición de cada flecha en palabras. Constructor (regla, caída, ventana y ETF) → etiqueta Oficial /
// Exploratoria (huella de un elemento de CARTERA_1, lib/lotesLab.js) → /api/laboratorio, un periodo por petición → curva
// frente a las referencias, tablas, ciclos, impuestos, calibración y registro en lab_pruebas (lib/registroLab.js).
// V9.983: la «Mezcla fija» (un estado con pesos y rebalanceo por calendario), CARTERA_2 (comparativa frente a V3 / V4) y la
// pestaña «Explorar» con la curva de riesgo y el mapa de sensibilidad (lib/exploracionCartera.js).
// V9.985: la columna izquierda es la «Próxima prueba» (al abrir un resultado se rellena con su configuración) y en
// «Explorar», la prueba de estrés 1999–2025 con ETF sintéticos, con su validación frente a QLD y TQQQ siempre a la vista.
// V9.987: la regla «Mezcla con filtro de tendencia» (CARTERA_3: periodo de la SMA, evaluación diaria o semanal, alcance y ETF
// sintético), su tabla de lote, su resultado (medidas, referencias, azar por bloques FUERA y calibración) y, en «Explorar»,
// el «Mapa de la media». Liquidez al 0 % en todo.
import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { MONO, fmtDate, numeroEs } from '../lib/utils'
import BotonCopiar from './BotonCopiar'
import { CARTERA_1, CARTERA_2, CARTERA_3, NOMBRE_ALCANCE, calibracionLote, reglaSergi, reglaSimple, reglaMezcla, configCarteraDe, configDeItem, validaConfig, veredictoOficial, textoCriterio, calibracionDe, esConfigCartera,
         esConfigExploracion, EXPLORACIONES, VEREDICTOS_CARTERA } from '../lib/lotesLab'
import { redondeaParaGuardar } from '../lib/exploracionCartera'
import { clasificaConfig, guardarPrueba, cuentaPruebas, listarPruebas, leerPrueba, estadoLote, SELECT_HISTORIAL } from '../lib/registroLab'
import { fraseTransicion, reduceCurva, CONDICIONES, N_SIM_CARTERA, FRECUENCIAS, SIN_AZAR, reglaFiltro, COSTES_DEFECTO } from '../lib/laboratorioCartera'
import { textoLaboratorio, reglaCarteraCorta, periodoCartera, CAB_CARTERA, filasCartera, CAB_CARTERA_REF, filasCarteraRef, CAB_CICLOS, filasCiclos,
         CAB_IMPUESTOS, filasImpuestos, resumenImpuestos, NOTA_IMPUESTOS, cabImpuestos, notaImpuestos, textoCalculo, calculoDeConfig, textoCostesConfig, CAB_COSTES, filasCostes, CAB_CAL_CARTERA, filaCalibracionCartera, num,
         CAB_COMPARACION, filasComparacion, AVISO_EXPLORACION, CAB_CURVA, filasCurva, cabMapa, filasMapa, textoFueraDeMuestra,
         AVISO_SINTETICOS, CAB_VALIDACION, filasValidacion, avisoValidacion, CAB_VALIDACION_ANIOS, filasValidacionAnios, CAB_ESTRES, filasEstres, cabAnioEstres, filasAnioEstres,
         AVISO_LIQUIDEZ, nombreEtfCartera, esConfigFiltro, CAB_FILTRO, filasFiltro, CAB_FILTRO_REF, filasFiltroRef, CAB_AZAR_FILTRO, filasAzarFiltro, CAB_FUERA, filasFuera, CAB_ANIO_FILTRO, filasAnioFiltro,
         CAB_CAL_FILTRO, filaCalibracionFiltro, notaCalibracionFiltro, notaMediaDesde, textoMediaFiltro, nombreLineaMapa, cabMapaMedia, filasMapaMedia, textoFueraMapa, textoZonaMapa, CAB_REF_MAPA, filasRefMapa } from '../lib/exportaTexto'
import { getSupaUrl, getSupaH, hayConfigSupabase } from '../lib/supabase'

const CLAVE_LS = 'v50_laboratorio_cartera'
const GRIS = 'var(--text-legible)'
const TAM = 12
const ROJO = '#ff4d6d', VERDE = '#00e5a0', AMBAR = '#ffb020', MORADO = '#9b72ff'
const caja = { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 6, padding: '10px 12px', marginBottom: 10 }
const etiqueta = { fontFamily: MONO, fontSize: TAM, color: GRIS, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }
const entrada = { background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontFamily: MONO, fontSize: TAM, padding: '4px 6px' }
const boton = { fontFamily: MONO, fontSize: TAM, padding: '4px 10px', borderRadius: 4, cursor: 'pointer', border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text)' }
const botonPrincipal = { ...boton, border: '1px solid var(--accent)', background: 'rgba(0,212,255,0.12)', color: 'var(--accent)', fontWeight: 700 }
const COLOR_VEREDICTO = { [VEREDICTOS_CARTERA.comparativo]: GRIS, [VEREDICTOS_CARTERA.mejorYAzar]: VERDE, [VEREDICTOS_CARTERA.mejorNoAzar]: AMBAR, [VEREDICTOS_CARTERA.mejorSinAzar]: AMBAR, [VEREDICTOS_CARTERA.noMejora]: ROJO, pendiente: GRIS, 'sin veredicto': GRIS,
  [VEREDICTOS_CARTERA.filtroMejoraYAzar]: VERDE, [VEREDICTOS_CARTERA.filtroMejoraNoAzar]: AMBAR, [VEREDICTOS_CARTERA.filtroMejoraSinAzar]: AMBAR, [VEREDICTOS_CARTERA.filtroNoMejora]: ROJO }
const SERIES_BASE = [['estrategia', 'Cartera', 'var(--accent)'], ['qqq', 'QQQ', GRIS], ['mitad', '50/50', AMBAR], ['spy', 'SPY', MORADO], ['neta', 'Cartera después de impuestos (cálculo 2)', VERDE]]

// La configuración del constructor ↔ lo que se guarda en el navegador.
// (calculo: '1' o '2'; V9.988. Una configuración sin calculo es del cálculo 1, el de los lotes congelados.)
const aTexto = (x) => String(x).replace('.', ',')
const uiDe = (config) => ({ ...uiDeBase(config), calculo: String(config.calculo ?? 1), ...(config.costes ? { comisionPct: aTexto(config.costes.comisionPct), comisionMin: aTexto(config.costes.comisionMinEur), horquillaQqq: aTexto(config.costes.horquillaPct.QQQ), horquillaEtf: aTexto(config.costes.horquillaPct.ETF) } : {}) })
const uiDeBase = (config) => {
  if (config.regla.id === 'filtro') { const f = config.regla.filtro
    return { regla: 'filtro', periodoMedia: String(f.periodo), evaluacion: f.evaluacion, alcance: f.alcance, pct: '10', ventana: '252', pctEtf: '50', frecuencia: 'anual', etf: config.etf } }
  if (config.regla.id === 'mezcla') { const w = config.regla.estados.MEZCLA.pesos
    return { regla: 'mezcla', pctEtf: String(Math.round(w.ETF * 1000) / 10).replace('.', ','), frecuencia: config.regla.transiciones.find(t => t.calendario)?.calendario || 'anual', pct: '10', ventana: '252', etf: config.etf } }
  const c = config.regla.transiciones.flatMap(t => t.si || []).find(s => s.c === 'caidaDesdeMaximo')
  return { regla: config.regla.id, pct: String(c?.pct ?? 10).replace('.', ','), ventana: String(c?.ventana ?? 252), pctEtf: '50', frecuencia: 'anual', etf: config.etf } }
const UI_DEFECTO = () => ({ ...uiDe(configDeItem(CARTERA_1, 'V1')), calculo: '2' })   // las pruebas nuevas, con el cálculo 2
// La regla del constructor y su ETF casan: las de CARTERA_1 / 2 con QLD o TQQQ; el filtro con un sintético ×2 / ×3.
const uiValida = (x) => !!x && ((['sergi', 'simple', 'mezcla'].includes(x.regla) && ['QLD', 'TQQQ'].includes(x.etf)) || (x.regla === 'filtro' && ['x2', 'x3'].includes(x.etf)))
const leeGuardado = () => { try { const x = JSON.parse(localStorage.getItem(CLAVE_LS) || 'null'); return uiValida(x) ? x : null } catch (_) { return null } }
// Los costes por operación del constructor (cálculo 2): los de la interfaz o, si faltan, COSTES_DEFECTO.
const numUi = (x, d) => { const v = numeroEs(x ?? ''); return x == null || x === '' ? d : v == null ? NaN : v }
const costesDeUi = (ui) => ({ comisionPct: numUi(ui.comisionPct, COSTES_DEFECTO.comisionPct), comisionMinEur: numUi(ui.comisionMin, COSTES_DEFECTO.comisionMinEur), horquillaPct: { QQQ: numUi(ui.horquillaQqq, COSTES_DEFECTO.horquillaPct.QQQ), ETF: numUi(ui.horquillaEtf, COSTES_DEFECTO.horquillaPct.ETF) } })
const esSintetico = (etf) => etf === 'x2' || etf === 'x3'
const periodosDe = (etf) => esSintetico(etf) ? CARTERA_3.items[0].periodos : CARTERA_1.items.find(i => i.etf === etf).periodos
// La regla con la caída y la ventana del constructor (si son las de CARTERA_1, sale idéntica a la del lote).
function reglaDe(ui) {
  if (ui.regla === 'filtro') { const p = numeroEs(ui.periodoMedia ?? '200'); return reglaFiltro(p == null ? NaN : p, ui.evaluacion === 'semanal' ? 'semanal' : 'diario', ui.alcance === 'todo' ? 'todo' : 'apalancado') }
  if (ui.regla === 'mezcla') { const p = numeroEs(ui.pctEtf ?? '50'); return reglaMezcla(p == null ? NaN : 100 - p, FRECUENCIAS[ui.frecuencia] ? ui.frecuencia : 'anual') }
  const pct = numeroEs(ui.pct), ventana = numeroEs(ui.ventana), base = ui.regla === 'simple' ? reglaSimple(pct) : reglaSergi(pct)
  return { ...base, transiciones: base.transiciones.map(t => ({ ...t, si: t.si.map(s => s.c === 'caidaDesdeMaximo' ? { ...s, ventana } : s) })) }
}
const ctxRegistro = () => ({ url: getSupaUrl(), headers: getSupaH() })
const etiquetaTipo = (c) => !c ? '…' : c.oficial ? `Oficial · ${c.lote} · ${c.item}` : 'Exploratoria'

function Tabla({ cab, filas }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', fontSize: TAM }}>
        <thead><tr>{cab.map((c, i) => <th key={i} style={{ textAlign: i ? 'right' : 'left', padding: '3px 8px', color: GRIS, fontWeight: 400, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{c}</th>)}</tr></thead>
        <tbody>{filas.map((f, j) => <tr key={j}>{f.map((c, i) => <td key={i} style={{ textAlign: i ? 'right' : 'left', padding: '3px 8px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  )
}

// El diagrama de estados: cajas y flechas numeradas; debajo, cada flecha con su condición en palabras.
const NUMEROS = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧']
// Lo que tiene la cartera en un estado, corto para su caja (en el filtro, el texto de FUERA no cabe: forma parte de la huella
// del lote, así que se acorta solo al dibujarlo).
const composicionCorta = (regla, id) => regla.id === 'filtro' && id === 'FUERA' ? (regla.filtro?.alcance === 'todo' ? '100 % liquidez' : 'QQQ + liquidez (0 %)') : regla.estados[id].composicion.split(' (')[0]
export function DiagramaEstados({ regla }) {
  // Con dos estados y un bucle (el rebalanceo anual del filtro), las cajas bajan para que quepa el bucle encima.
  const bucle2 = Object.keys(regla.estados).length === 2 && regla.transiciones.some(t => t.desde === t.hacia)
  const ids = Object.keys(regla.estados), W = 520, H = ids.length > 2 ? 230 : bucle2 ? 150 : 120, bw = 130, bh = 46
  const pos = ids.length > 2 ? { [ids[0]]: [20, 20], [ids[1]]: [W - bw - 20, 20], [ids[2]]: [(W - bw) / 2, H - bh - 16] }
    : ids.length === 2 ? { [ids[0]]: [20, bucle2 ? H - bh - 16 : (H - bh) / 2], [ids[1]]: [W - bw - 20, bucle2 ? H - bh - 16 : (H - bh) / 2] } : { [ids[0]]: [(W - bw) / 2, H - bh - 14] }
  const centro = (id) => [pos[id][0] + bw / 2, pos[id][1] + bh / 2]
  // Recorta la línea al borde de la caja de destino.
  const borde = ([x0, y0], [x1, y1]) => { const dx = x1 - x0, dy = y1 - y0, tx = dx ? (bw / 2 + 6) / Math.abs(dx) : Infinity, ty = dy ? (bh / 2 + 6) / Math.abs(dy) : Infinity, t = Math.min(tx, ty); return [x1 - dx * t, y1 - dy * t] }
  return (
    <div data-prueba="diagrama">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: W, display: 'block' }} role="img" aria-label={`Diagrama de estados de ${regla.nombre}`}>
        <defs><marker id="flechaCartera" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="var(--text-legible)" /></marker></defs>
        {regla.transiciones.map((t, k) => {
          if (!pos[t.desde] || !pos[t.hacia]) return null
          if (t.desde === t.hacia) {   // un bucle sobre la propia caja (el rebalanceo de una mezcla)
            const [cx, y0] = [pos[t.desde][0] + bw / 2, pos[t.desde][1]]
            return (<g key={k}>
              <path d={`M ${cx - 30} ${y0} C ${cx - 40} ${y0 - 42}, ${cx + 40} ${y0 - 42}, ${cx + 30} ${y0 - 2}`} fill="none" stroke="var(--text-legible)" strokeWidth="1.4" markerEnd="url(#flechaCartera)" />
              <circle cx={cx} cy={y0 - 31} r="9" fill="var(--bg2)" stroke="var(--accent)" />
              <text x={cx} y={y0 - 27} textAnchor="middle" fontSize="11" fontFamily={MONO} fill="var(--accent)">{k + 1}</text>
            </g>)
          }
          const a = centro(t.desde), b = centro(t.hacia), dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1
          const o = 9, nx = -dy / len * o, ny = dx / len * o   // dos sentidos entre las mismas cajas: cada uno a un lado
          const p0 = borde(b, [a[0] + nx, a[1] + ny]), p1 = borde([a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny])
          const mx = (p0[0] + p1[0]) / 2 + nx * 1.4, my = (p0[1] + p1[1]) / 2 + ny * 1.4
          return (<g key={k}>
            <line x1={p0[0]} y1={p0[1]} x2={p1[0]} y2={p1[1]} stroke="var(--text-legible)" strokeWidth="1.4" markerEnd="url(#flechaCartera)" />
            <circle cx={mx} cy={my} r="9" fill="var(--bg2)" stroke="var(--accent)" />
            <text x={mx} y={my + 4} textAnchor="middle" fontSize="11" fontFamily={MONO} fill="var(--accent)">{k + 1}</text>
          </g>)
        })}
        {ids.map(id => (<g key={id}>
          <rect x={pos[id][0]} y={pos[id][1]} width={bw} height={bh} rx="6" fill="var(--bg3)" stroke={id === regla.inicial ? 'var(--accent)' : 'var(--border)'} />
          <text x={pos[id][0] + bw / 2} y={pos[id][1] + 19} textAnchor="middle" fontSize="12" fontWeight="700" fontFamily={MONO} fill="var(--text)">{id}</text>
          <text x={pos[id][0] + bw / 2} y={pos[id][1] + 35} textAnchor="middle" fontSize="10" fontFamily={MONO} fill="var(--text-legible)">{composicionCorta(regla, id)}</text>
        </g>))}
      </svg>
      <ol style={{ margin: '6px 0 0', paddingLeft: 0, listStyle: 'none', fontSize: TAM, lineHeight: 1.5 }}>
        {regla.transiciones.map((t, k) => <li key={k}><span style={{ color: 'var(--accent)' }}>{NUMEROS[k] || k + 1}</span> {fraseTransicion(t, regla)}</li>)}
      </ol>
    </div>
  )
}

// La curva (escala logarítmica) de la cartera frente a las referencias.
function Curva({ curva, nombres = {} }) {
  if (!curva?.fechas?.length) return null
  const SERIES = SERIES_BASE.filter(([k]) => curva[k]?.length).map(([k, n, c]) => [k, nombres[k] || n, c])
  const W = 700, H = 240, m = { l: 46, r: 8, t: 8, b: 22 }, n = curva.fechas.length
  const todos = SERIES.flatMap(([k]) => curva[k] || []).filter(v => v > 0), lmin = Math.log(Math.min(...todos)), lmax = Math.log(Math.max(...todos))
  const x = (j) => m.l + (W - m.l - m.r) * (n > 1 ? j / (n - 1) : 0), y = (v) => m.t + (H - m.t - m.b) * (1 - (Math.log(v) - lmin) / ((lmax - lmin) || 1))
  const marcas = []; for (let e = Math.floor(lmin / Math.log(2)); e <= Math.ceil(lmax / Math.log(2)); e++) { const v = Math.pow(2, e); if (Math.log(v) >= lmin - 1e-9 && Math.log(v) <= lmax + 1e-9) marcas.push(v) }
  const anios = []; for (let j = 0; j < n; j++) if (j === 0 || curva.fechas[j].slice(0, 4) !== curva.fechas[j - 1].slice(0, 4)) anios.push(j)
  const paso = Math.max(1, Math.ceil(anios.length / 9))
  return (
    <div data-prueba="curva">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }} role="img" aria-label="Curva de la cartera frente a QQQ, 50/50 y SPY (escala logarítmica)">
        {marcas.map(v => <g key={v}><line x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} stroke="var(--border)" strokeWidth="0.6" /><text x={m.l - 4} y={y(v) + 3} textAnchor="end" fontSize="9" fontFamily={MONO} fill="var(--text-legible)">{num(v, v < 1 ? 2 : 0)}×</text></g>)}
        {anios.filter((_, i) => i % paso === 0).map(j => <text key={j} x={x(j)} y={H - 6} textAnchor="middle" fontSize="9" fontFamily={MONO} fill="var(--text-legible)">{curva.fechas[j].slice(0, 4)}</text>)}
        {SERIES.slice().reverse().map(([k, , color]) => <polyline key={k} fill="none" stroke={color} strokeWidth={k === 'estrategia' ? 1.8 : 1.1} points={(curva[k] || []).map((v, j) => `${x(j).toFixed(1)},${y(v).toFixed(1)}`).join(' ')} />)}
      </svg>
      <div style={{ display: 'flex', gap: 14, fontSize: TAM, marginTop: 4, flexWrap: 'wrap' }}>{SERIES.map(([k, nombre, color]) => <span key={k}><span style={{ display: 'inline-block', width: 14, height: 3, background: color, verticalAlign: 'middle', marginRight: 5 }} />{nombre}</span>)}<span style={{ color: GRIS }}>Valor de 1 al empezar · escala logarítmica · rentabilidad total</span></div>
    </div>
  )
}

// La curva de riesgo: un punto por % (caída máxima en horizontal, CAGR en vertical), una serie por familia, y QQQ y SPY.
const COLOR_FAMILIA = { mezcla: AMBAR, simple: 'var(--accent)', x2: AMBAR, x3: ROJO }
const nombreEtfExpl = (x) => x === 'x2' ? '×2 sintético' : x === 'x3' ? '×3 sintético' : x
function CurvaRiesgo({ periodo, familias }) {
  const W = 700, H = 300, m = { l: 52, r: 16, t: 14, b: 34 }
  const pts = familias.flatMap(f => (periodo.familias[f.id] || []).map(p => ({ f: f.id, pct: p.pct, x: -p.caidaMaxima, y: p.cagr })))
  const refs = [['QQQ', periodo.referencias?.qqq, GRIS], ['SPY', periodo.referencias?.spy, MORADO]].filter(r => r[1]).map(([n, r, c]) => ({ n, x: -r.caidaMaxima, y: r.cagr, c }))
  const xs = [...pts, ...refs].map(p => p.x), ys = [...pts, ...refs].map(p => p.y)
  const x0 = 0, x1 = Math.max(...xs) * 1.08, y0 = Math.min(0, ...ys), y1 = Math.max(...ys) * 1.1 || 0.1
  const X = (v) => m.l + (W - m.l - m.r) * (v - x0) / ((x1 - x0) || 1), Y = (v) => m.t + (H - m.t - m.b) * (1 - (v - y0) / ((y1 - y0) || 1))
  const marcasX = [], marcasY = []
  for (let v = 0; v <= x1 + 1e-9; v += 0.1) marcasX.push(v)
  for (let v = Math.ceil(y0 * 20) / 20; v <= y1 + 1e-9; v += 0.05) marcasY.push(v)
  return (
    <div data-prueba="curva-riesgo">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }} role="img" aria-label="Curva de riesgo: caída máxima frente a CAGR por % en el ETF">
        {marcasY.map(v => <g key={`y${v}`}><line x1={m.l} x2={W - m.r} y1={Y(v)} y2={Y(v)} stroke="var(--border)" strokeWidth="0.6" /><text x={m.l - 4} y={Y(v) + 3} textAnchor="end" fontSize="9" fontFamily={MONO} fill="var(--text-legible)">{num(v * 100, 0)} %</text></g>)}
        {marcasX.map(v => <text key={`x${v}`} x={X(v)} y={H - m.b + 14} textAnchor="middle" fontSize="9" fontFamily={MONO} fill="var(--text-legible)">−{num(v * 100, 0)} %</text>)}
        <text x={(m.l + W - m.r) / 2} y={H - 4} textAnchor="middle" fontSize="10" fontFamily={MONO} fill="var(--text-legible)">caída máxima</text>
        <text x={12} y={(m.t + H - m.b) / 2} textAnchor="middle" fontSize="10" fontFamily={MONO} fill="var(--text-legible)" transform={`rotate(-90 12 ${(m.t + H - m.b) / 2})`}>CAGR</text>
        {familias.map(f => { const ps = pts.filter(p => p.f === f.id); return (<g key={f.id}>
          <polyline fill="none" stroke={COLOR_FAMILIA[f.id]} strokeWidth="1" strokeOpacity="0.6" points={ps.map(p => `${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join(' ')} />
          {ps.map(p => <g key={p.pct}><circle cx={X(p.x)} cy={Y(p.y)} r="3.5" fill={COLOR_FAMILIA[f.id]} /><text x={X(p.x) + 5} y={Y(p.y) - 5} fontSize="9" fontFamily={MONO} fill={COLOR_FAMILIA[f.id]}>{p.pct}</text></g>)}
        </g>) })}
        {refs.map(r => <g key={r.n}><rect x={X(r.x) - 4} y={Y(r.y) - 4} width="8" height="8" fill="none" stroke={r.c} strokeWidth="1.6" /><text x={X(r.x) + 7} y={Y(r.y) + 12} fontSize="10" fontWeight="700" fontFamily={MONO} fill={r.c}>{r.n}</text></g>)}
      </svg>
      <div style={{ display: 'flex', gap: 14, fontSize: TAM, marginTop: 4, flexWrap: 'wrap' }}>{familias.map(f => <span key={f.id}><span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 5, background: COLOR_FAMILIA[f.id], verticalAlign: 'middle', marginRight: 5 }} />{f.nombre}</span>)}<span style={{ color: GRIS }}>□ referencias · cada punto, el % de la cartera en el ETF</span></div>
    </div>
  )
}

// El mapa de la media: una línea por alcance y evaluación (el periodo de la semanal × 5, en días de mercado, para compartir
// el eje), el CAGR / caída del total en vertical; los puntos de la zona estable, rellenos; la mezcla sin filtro, a trazos.
const COLOR_ALCANCE = { apalancado: AMBAR, todo: 'var(--accent)' }
function GraficoMapaMedia({ parte }) {
  const W = 700, H = 300, m = { l: 52, r: 16, t: 14, b: 34 }, ref = parte.referencias?.find(r => r.papel === 'total')
  const lineas = parte.lineas.map(l => ({ l, ps: l.valores.map(v => ({ x: l.evaluacion === 'semanal' ? v.periodo * 5 : v.periodo, y: v.total.cagrPorCaida, z: v.zonaEstable, p: v.periodo })).filter(p => p.y != null) }))
  const ys = [...lineas.flatMap(x => x.ps.map(p => p.y)), ...(ref?.mezcla?.cagrPorCaida != null ? [ref.mezcla.cagrPorCaida] : [])]
  const x0 = 0, x1 = 260, y0 = Math.min(0, ...ys), y1 = (Math.max(...ys) * 1.1) || 1
  const X = (v) => m.l + (W - m.l - m.r) * (v - x0) / (x1 - x0), Y = (v) => m.t + (H - m.t - m.b) * (1 - (v - y0) / ((y1 - y0) || 1))
  const paso = y1 - y0 > 2 ? 0.5 : y1 - y0 > 0.8 ? 0.2 : 0.1, marcasY = []
  for (let v = Math.ceil(y0 / paso) * paso; v <= y1 + 1e-9; v += paso) marcasY.push(Math.round(v * 100) / 100)
  return (
    <div data-prueba="grafico-mapa">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }} role="img" aria-label="Mapa de la media: CAGR / caída máxima según el periodo de la media">
        {marcasY.map(v => <g key={`y${v}`}><line x1={m.l} x2={W - m.r} y1={Y(v)} y2={Y(v)} stroke="var(--border)" strokeWidth="0.6" /><text x={m.l - 4} y={Y(v) + 3} textAnchor="end" fontSize="9" fontFamily={MONO} fill="var(--text-legible)">{num(v, 2)}</text></g>)}
        {[20, 50, 100, 150, 200, 250].map(v => <text key={`x${v}`} x={X(v)} y={H - m.b + 14} textAnchor="middle" fontSize="9" fontFamily={MONO} fill="var(--text-legible)">{v} d · {v / 5} s</text>)}
        <text x={(m.l + W - m.r) / 2} y={H - 4} textAnchor="middle" fontSize="10" fontFamily={MONO} fill="var(--text-legible)">periodo de la SMA (días de mercado; semanas × 5)</text>
        <text x={12} y={(m.t + H - m.b) / 2} textAnchor="middle" fontSize="10" fontFamily={MONO} fill="var(--text-legible)" transform={`rotate(-90 12 ${(m.t + H - m.b) / 2})`}>CAGR / caída</text>
        {ref?.mezcla?.cagrPorCaida != null && <g><line x1={m.l} x2={W - m.r} y1={Y(ref.mezcla.cagrPorCaida)} y2={Y(ref.mezcla.cagrPorCaida)} stroke={GRIS} strokeWidth="1.2" strokeDasharray="5 4" /><text x={W - m.r - 4} y={Y(ref.mezcla.cagrPorCaida) - 4} textAnchor="end" fontSize="9" fontFamily={MONO} fill={GRIS}>mezcla sin filtro</text></g>}
        {lineas.map(({ l, ps }) => { const c = COLOR_ALCANCE[l.alcance], sem = l.evaluacion === 'semanal'
          return (<g key={`${l.alcance}|${l.evaluacion}`}>
            <polyline fill="none" stroke={c} strokeWidth="1.4" strokeDasharray={sem ? '4 3' : undefined} points={ps.map(p => `${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join(' ')} />
            {ps.map(p => <circle key={p.p} cx={X(p.x)} cy={Y(p.y)} r="3" fill={p.z ? c : 'var(--bg2)'} stroke={c} strokeWidth="1.2"><title>{`${nombreLineaMapa(l)} · SMA ${p.p}${sem ? ' semanas' : ''}: ${num(p.y, 2)}`}</title></circle>)}
          </g>) })}
      </svg>
      <div style={{ display: 'flex', gap: 14, fontSize: TAM, marginTop: 4, flexWrap: 'wrap' }}>{parte.lineas.map(l => <span key={`${l.alcance}|${l.evaluacion}`}><span style={{ display: 'inline-block', width: 16, height: 0, borderTop: `2px ${l.evaluacion === 'semanal' ? 'dashed' : 'solid'} ${COLOR_ALCANCE[l.alcance]}`, verticalAlign: 'middle', marginRight: 5 }} />{nombreLineaMapa(l)}</span>)}<span style={{ color: GRIS }}>● zona estable · ○ fuera de ella</span></div>
    </div>
  )
}
const ARTICULO_EXPL = { curvaRiesgo: ['la', 'de la'], sensibilidad: ['el', 'del'], estres: ['la', 'de la'], mapaMedia: ['el', 'del'] }

export default function CarteraPanel({ apiFetch, version = null }) {
  const [ui, setUi] = useState(() => leeGuardado() || UI_DEFECTO())
  useEffect(() => { try { localStorage.setItem(CLAVE_LS, JSON.stringify(ui)) } catch (_) {} }, [ui])
  const regla = useMemo(() => reglaDe(ui), [ui])
  // Una mezcla se compara siempre con la regla simple de CARTERA_1 del mismo ETF (V3 / V4), como en CARTERA_2.
  // El filtro de tendencia se arma con lo común de CARTERA_3 (ETF sintético, sus periodos desde 1999): con su misma regla
  // sale idéntico a un elemento del lote.
  const config = useMemo(() => configCarteraDe({ regla, etf: ui.etf, periodos: periodosDe(ui.etf), comparaCon: regla.id === 'mezcla' ? CARTERA_2.items.find(i => i.etf === ui.etf).comparaCon : undefined, calculo: ui.calculo === '1' ? undefined : 2, costes: ui.calculo === '1' ? undefined : costesDeUi(ui) }, regla.id === 'filtro' ? CARTERA_3.comun : CARTERA_1.comun), [regla, ui.etf, ui.calculo, ui.comisionPct, ui.comisionMin, ui.horquillaQqq, ui.horquillaEtf])
  const [pestana, setPestana] = useState('probar')
  const errores = useMemo(() => [...new Set(validaConfig(config))], [config])
  const [clas, setClas] = useState(null)
  useEffect(() => { let vivo = true; clasificaConfig(config).then(c => { if (vivo) setClas(c) }).catch(() => { if (vivo) setClas(null) }); return () => { vivo = false } }, [config])
  const pon = (k, v) => setUi(u => ({ ...u, [k]: v }))
  // Al cambiar de regla, el ETF pasa a uno que le sirva (el filtro trabaja con los sintéticos).
  const cambiaRegla = (v) => setUi(u => ({ ...u, regla: v, etf: v === 'filtro' ? (esSintetico(u.etf) ? u.etf : 'x3') : (esSintetico(u.etf) ? 'QLD' : u.etf) }))

  // ── Registro ──
  const [registro, setRegistro] = useState({ contador: null, lotes: null, historial: [], error: null, cargando: false })
  const recarga = useCallback(async () => {
    if (!hayConfigSupabase()) { setRegistro(r => ({ ...r, error: 'Sin conexión con la base de datos configurada: no se puede leer ni guardar el registro.' })); return }
    setRegistro(r => ({ ...r, cargando: true }))
    try {
      const ctx = ctxRegistro()
      const [contador, l1, l2, l3, hc, he] = await Promise.all([cuentaPruebas(ctx), estadoLote(ctx, CARTERA_1), estadoLote(ctx, CARTERA_2), estadoLote(ctx, CARTERA_3),
        listarPruebas(ctx, { limite: 100, select: SELECT_HISTORIAL, filtro: '&config->>prueba=eq.cartera' }), listarPruebas(ctx, { limite: 50, select: SELECT_HISTORIAL, filtro: '&config->>prueba=eq.exploracion' })])
      const historial = [...hc, ...he].sort((a, b) => a.creado < b.creado ? 1 : a.creado > b.creado ? -1 : b.id - a.id)
      setRegistro({ contador, lotes: { CARTERA_1: l1, CARTERA_2: l2, CARTERA_3: l3 }, historial, error: null, cargando: false })
    } catch (e) { setRegistro(r => ({ ...r, error: e?.message || 'No se pudo leer el registro.', cargando: false })) }
  }, [])
  useEffect(() => { recarga() }, [recarga])

  // ── Ejecución ──
  const [resultado, setResultado] = useState(null)
  const [verPeriodo, setVerPeriodo] = useState(0)
  const [progreso, setProgreso] = useState(null)
  const [errorEjec, setErrorEjec] = useState(null)
  const [ahora, setAhora] = useState(0)
  const parar = useRef(false)
  useEffect(() => { if (!progreso) return; const id = setInterval(() => setAhora(Date.now()), 1000); return () => clearInterval(id) }, [!!progreso])
  const ejecutaConfig = async (cfg, c, avance) => {
    const periodos = []
    for (let k = 0; k < cfg.periodos.length; k++) {
      if (parar.current) throw new Error('Parado a petición tuya: esta prueba no se ha guardado.')
      avance(k, `periodo ${k + 1} de ${cfg.periodos.length} (${periodoCartera(cfg.periodos[k])})`)
      const r = await apiFetch('/api/laboratorio', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ config: cfg, periodo: { desde: cfg.periodos[k].desde, hasta: cfg.periodos[k].hasta } }) })
      let j = null; try { j = await r.json() } catch (_) {}
      if (!r.ok) throw new Error(`El servidor no pudo calcular ${periodoCartera(cfg.periodos[k])}: ${j?.error || `HTTP ${r.status}`}`)
      periodos.push(j.resultado)
    }
    const veredicto = veredictoOficial(c, periodos)
    const res = { config: cfg, clas: c, periodos, veredicto, id: null, creado: null, errorGuardar: null }
    try {
      // La curva, con menos puntos: el resumen tiene que caber en 50 KB.
      // Con el filtro (cinco periodos desde 1999), además los números a 6 decimales y la curva con la mitad de puntos (con el
      // cálculo 2 lleva también la curva neta y la tabla de impuestos completa): si no, no cabe en 50 KB.
      // Lo mismo con cualquier prueba del cálculo 2 (curva neta y tabla de impuestos completa). El cálculo 1 se guarda como siempre.
      const compacto = esConfigFiltro(cfg) || calculoDeConfig(cfg) === 2
      const resumen = { periodos: periodos.map(p => ({ ...p, curva: reduceCurva(p.curva, compacto ? 16 : 8) })), veredicto, datos: [] }
      const fila = await guardarPrueba({ config: cfg, resultados: compacto ? redondeaParaGuardar(resumen) : resumen, versionApp: version }, ctxRegistro())
      res.id = fila?.id ?? null; res.creado = fila?.creado ?? null
    } catch (e) { res.errorGuardar = `No se pudo guardar en el registro: ${e?.message || e}` }
    return res
  }
  const lanza = async (trabajos) => {
    parar.current = false; setErrorEjec(null)
    const n = trabajos.length, porT = trabajos.map(t => t.config.periodos.length), total = porT.reduce((a, b) => a + b, 0), inicio = Date.now()
    setAhora(inicio)
    let hechos = 0
    try {
      for (let i = 0; i < n; i++) {
        const t = trabajos[i], res = await ejecutaConfig(t.config, t.clas, (k, txt) => setProgreso({ texto: `${n > 1 ? `Variante ${t.nombre} (${i + 1} de ${n}) · ` : ''}${txt}`, hechos: hechos + k, total, inicio }))
        hechos += porT[i]; setResultado(res); setVerPeriodo(res.periodos.length - 1)
        if (res.errorGuardar) { setErrorEjec(res.errorGuardar); break }
        recarga()
      }
    } catch (e) { setErrorEjec(e?.message || String(e)) }
    setProgreso(null); recarga()
  }
  const ejecutaActual = async () => { if (errores.length || progreso) return; const c = await clasificaConfig(config); lanza([{ config, clas: c, nombre: c.item || '' }]) }
  const pendientesDe = (lote) => lote.items.filter(it => registro.lotes?.[lote.id]?.[it.id]?.estado === 'pendiente')
  const ejecutaPendientes = async (lote) => {
    const pendientes = pendientesDe(lote)
    if (progreso || !pendientes.length) return
    if (typeof window !== 'undefined' && !window.confirm(`Se van a ejecutar ${pendientes.length} variante${pendientes.length > 1 ? 's' : ''} pendiente${pendientes.length > 1 ? 's' : ''} de ${lote.id} (${pendientes.map(p => p.id).join(', ')}). Cada una queda registrada como prueba oficial y no se puede borrar desde la aplicación. ¿Seguir?`)) return
    const trabajos = []
    for (const it of pendientes) { const cfg = configDeItem(lote, it.id), c = await clasificaConfig(cfg); if (!c.oficial || c.item !== it.id) { setErrorEjec(`La variante ${it.id} no sale como oficial: no se ejecuta nada.`); return } trabajos.push({ config: cfg, clas: c, nombre: it.id }) }
    lanza(trabajos)
  }
  // ── Exploraciones (pestaña «Explorar») ──
  const [expl, setExpl] = useState({})   // { curvaRiesgo: { config, partes, clas, id, creado }, sensibilidad: … }
  const [verExpl, setVerExpl] = useState('curvaRiesgo')
  const [etfExpl, setEtfExpl] = useState('QLD')
  const [perExpl, setPerExpl] = useState(3)
  const [perEstres, setPerEstres] = useState(0)
  const [lineaMapa, setLineaMapa] = useState(0)
  const lanzaExploracion = async (tipo) => {
    const cfg = EXPLORACIONES[tipo]
    if (progreso) return
    if (typeof window !== 'undefined' && !window.confirm(`Se va a ejecutar ${ARTICULO_EXPL[tipo]?.[0] || 'la'} ${cfg.nombre.toLowerCase()} (${cfg.etfs.map(nombreEtfExpl).join(' y ')}): queda registrada y cuenta como ${cfg.combinaciones} pruebas exploratorias. ¿Seguir?`)) return
    parar.current = false; setErrorEjec(null)
    const inicio = Date.now(), partes = {}
    setAhora(inicio)
    try {
      for (const [k, etf] of cfg.etfs.entries()) {
        if (parar.current) throw new Error('Parado a petición tuya: esta exploración no se ha guardado.')
        setProgreso({ texto: `${cfg.nombre} · ${nombreEtfExpl(etf)} (${k + 1} de ${cfg.etfs.length})`, hechos: k, total: cfg.etfs.length, inicio, unidad: 'ETF' })
        const r = await apiFetch('/api/laboratorio', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ config: cfg, periodo: { etf } }) })
        let j = null; try { j = await r.json() } catch (_) {}
        if (!r.ok) throw new Error(`El servidor no pudo calcular ${etf}: ${j?.error || `HTTP ${r.status}`}`)
        partes[etf] = j.resultado
      }
      const c = await clasificaConfig(cfg), res = { config: cfg, partes, clas: c, id: null, creado: null }
      try { const fila = await guardarPrueba({ config: cfg, resultados: redondeaParaGuardar({ partes, veredicto: 'sin veredicto', combinaciones: cfg.combinaciones }), versionApp: version }, ctxRegistro()); res.id = fila?.id ?? null; res.creado = fila?.creado ?? null }
      catch (e) { setErrorEjec(`No se pudo guardar en el registro: ${e?.message || e}`) }
      setExpl(x => ({ ...x, [tipo]: res })); setVerExpl(tipo)
    } catch (e) { setErrorEjec(e?.message || String(e)) }
    setProgreso(null); recarga()
  }
  const verExploracion = (f) => { const tipo = f.config.tipo; setExpl(x => ({ ...x, [tipo]: { config: f.config, partes: f.resultados?.partes || {}, clas: { hash: f.hash_config, oficial: false }, id: f.id, creado: f.creado, version: f.version_app } })); setVerExpl(tipo); setPestana('explorar') }
  const textoCopiaExpl = () => { const e = expl[verExpl]; return textoLaboratorio({ cabecera: { titulo: 'Laboratorio de cartera · exploración', version: e.version || version, fecha: fmtDate(e.creado || new Date().toISOString()) }, config: e.config, partes: e.partes, clas: e.clas, id: e.id }) }
  const verPrueba = async (id) => {
    setErrorEjec(null)
    try { const f = await leerPrueba(ctxRegistro(), id); if (esConfigExploracion(f.config)) { verExploracion(f); return } setPestana('probar'); const ps = f.resultados?.periodos || []
      // La «Próxima prueba» se rellena con la configuración del resultado abierto.
      try { const u = uiDe(f.config); if (uiValida(u)) setUi(u) } catch (_) {}
      setResultado({ config: f.config, clas: { hash: f.hash_config, oficial: f.oficial, lote: f.lote, item: f.item_lote }, periodos: ps, veredicto: f.resultados?.veredicto || '—', id: f.id, creado: f.creado, errorGuardar: null, version: f.version_app })
      setVerPeriodo(Math.max(0, ps.length - 1))
    } catch (e) { setErrorEjec(e?.message || String(e)) }
  }
  const comunDe = (cfg) => esConfigFiltro(cfg) ? CARTERA_3.comun : CARTERA_1.comun
  const textoCopia = () => textoLaboratorio({ cabecera: { titulo: 'Laboratorio de cartera', version: resultado.version || version, fecha: fmtDate(resultado.creado || new Date().toISOString()),
    datos: [['Precios', comunDe(resultado.config).precios], ['Ejecución', comunDe(resultado.config).ejecucion], ['Liquidez', comunDe(resultado.config).liquidez], ['Inicio de cada periodo', comunDe(resultado.config).inicio]] },
    regla: reglaCarteraCorta(resultado.config), clas: resultado.clas, config: resultado.config, veredicto: resultado.veredicto, periodos: resultado.periodos, id: resultado.id })
  const seg = progreso ? Math.max(0, Math.round((ahora - progreso.inicio) / 1000)) : 0
  // La pestaña «Explorar» (lado derecho): la curva de riesgo o el mapa de sensibilidad, con su aviso, «Cómo leer esto» y la copia.
  // La validación de los ETF sintéticos frente a QLD y TQQQ reales (siempre a la vista en la prueba de estrés).
  function validacionSinteticos() {
    const avisos = avisoValidacion()
    return (<div style={{ ...caja, borderColor: 'var(--accent)' }} data-prueba="validacion-sinteticos">
      <div style={etiqueta}>Validación de los ETF sintéticos (frente a los reales)</div>
      <div style={{ fontSize: TAM, color: AMBAR, marginBottom: 6, fontWeight: 700 }} data-prueba="aviso-sinteticos">{AVISO_SINTETICOS}</div>
      <Tabla cab={CAB_VALIDACION} filas={filasValidacion()} />
      {avisos.length ? avisos.map((a, i) => <div key={i} style={{ fontSize: TAM, color: ROJO, marginTop: 6 }}>{a}</div>) : <div style={{ fontSize: TAM, color: GRIS, marginTop: 6 }}>Diferencia media anual por debajo de 1 punto en los dos.</div>}
      <details style={{ marginTop: 6 }}><summary style={{ fontSize: TAM, cursor: 'pointer', color: GRIS }}>Año a año: real frente a sintético</summary><div style={{ marginTop: 6 }}><Tabla cab={CAB_VALIDACION_ANIOS} filas={filasValidacionAnios()} /></div></details>
    </div>)
  }
  function vistaEstres(e, cfgE, etfV) {
    const parte = e.partes?.[etfV], partes = cfgE.etfs.map(x => e.partes?.[x]).filter(Boolean), n = partes[0]?.periodos.length || 1, kP = Math.min(perEstres, n - 1)
    const per = partes[0]?.periodos[kP], periodoCurva = per && { familias: Object.fromEntries(partes.map(p => [p.etf, p.periodos[kP].puntos])), referencias: per.referencias }
    return (<>
      {per && (<div style={caja}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
          <span style={{ ...etiqueta, marginBottom: 0 }}>Periodo</span>
          {partes[0].periodos.map((p, k) => <button key={k} onClick={() => setPerEstres(k)} aria-pressed={k === kP} style={k === kP ? botonPrincipal : boton}>{periodoCartera(p)}</button>)}
        </div>
        <CurvaRiesgo periodo={periodoCurva} familias={partes.map(p => ({ id: p.etf, nombre: `Mezcla fija con el ${nombreEtfExpl(p.etf)} (rebalanceo anual)` }))} />
        <div style={{ fontSize: TAM, color: GRIS, marginTop: 4 }}>{periodoCartera(per)}: del {fmtDate(per.fechaIni)} al {fmtDate(per.fechaFin)}.</div>
      </div>)}
      {!parte ? <div style={{ ...caja, fontSize: TAM, color: GRIS }}>Sin datos del {nombreEtfExpl(etfV)} en esta exploración.</div> : (<>
        <div style={caja} data-prueba="tabla-estres">
          <div style={etiqueta}>{nombreEtfExpl(etfV)} · {periodoCartera(parte.periodos[kP])}</div>
          <Tabla cab={CAB_ESTRES} filas={filasEstres(parte.periodos[kP])} />
          <div style={{ fontSize: TAM, color: GRIS, marginTop: 6 }}>Tiempo bajo el agua: días naturales desde el pico de la caída máxima hasta volver a él. Valor final neto: estimación con 10.000 € al empezar.</div>
        </div>
        <div style={caja} data-prueba="anio-estres">
          <div style={etiqueta}>Año a año · {parte.anioAnio.pct} % en el {nombreEtfExpl(etfV)} · {periodoCartera(parte.periodos.find(p => p.total))}</div>
          <Tabla cab={cabAnioEstres(parte)} filas={filasAnioEstres(parte)} />
        </div>
      </>)}
    </>)
  }
  // El mapa de la media (pestaña «Explorar»): gráfico, una tabla por línea, zona estable, fuera de muestra y referencias.
  function vistaMapa(e, cfgE, etfV) {
    const parte = e.partes?.[etfV]
    if (!parte) return <div style={{ ...caja, fontSize: TAM, color: GRIS }}>Sin datos del {nombreEtfExpl(etfV)} en esta exploración.</div>
    const kL = Math.min(lineaMapa, parte.lineas.length - 1), l = parte.lineas[kL], tot = parte.referencias?.find(r => r.papel === 'total')
    return (<>
      <div style={caja}>
        <div style={etiqueta}>Mapa de la media · {nombreEtfExpl(etfV)}{tot ? ` · ${periodoCartera({ ...tot, total: true })}` : ''}</div>
        <GraficoMapaMedia parte={parte} />
      </div>
      <div style={caja} data-prueba="tabla-mapa">
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
          {parte.lineas.map((x, k) => <button key={k} onClick={() => setLineaMapa(k)} aria-pressed={k === kL} style={k === kL ? botonPrincipal : boton}>{nombreLineaMapa(x)}</button>)}
        </div>
        <Tabla cab={cabMapaMedia(l)} filas={filasMapaMedia(l)} />
        <div style={{ fontSize: TAM, marginTop: 6 }} data-prueba="zona-mapa">{textoZonaMapa(l, cfgE.zonaEstable)}</div>
        <div style={{ fontSize: TAM, color: GRIS, marginTop: 4 }}>Medidas del total salvo las dos últimas columnas. Cambios: salidas + entradas. Tiempo fuera: parte de los días fuera del mercado (liquidez al 0 %).</div>
      </div>
      <div style={{ ...caja, borderColor: 'var(--accent)' }} data-prueba="fuera-mapa">
        <div style={etiqueta}>Comprobación fuera de muestra · {nombreLineaMapa(l)}</div>
        <div style={{ fontSize: TAM, lineHeight: 1.5 }}>{textoFueraMapa(l)}</div>
      </div>
      <div style={caja}>
        <div style={etiqueta}>Referencias (sin filtro)</div>
        <Tabla cab={CAB_REF_MAPA} filas={filasRefMapa(parte)} />
      </div>
    </>)
  }
  // El resultado de una prueba con el filtro de tendencia (CARTERA_3 o una exploratoria con esa regla).
  function vistaResultadoFiltro() {
    const ps = resultado.periodos, tot = ps.find(p => p.total), cal = resultado.clas?.oficial ? calibracionDe(resultado.clas.lote, resultado.clas.item) : null
    return (<>
      <div style={caja} data-prueba="resultado-filtro">
        <div style={etiqueta}>Resultado por periodo</div>
        <Tabla cab={CAB_FILTRO} filas={filasFiltro(ps)} />
        <div data-prueba="criterio" style={{ fontSize: TAM, marginTop: 6 }}>{textoCriterio(resultado.clas || {}, resultado.clas?.oficial ? 'cartera' : 'filtro')}</div>
        {notaMediaDesde(ps) && <div style={{ fontSize: TAM, color: GRIS, marginTop: 4 }}>{notaMediaDesde(ps)}</div>}
        <div style={{ marginTop: 10 }} data-prueba="referencias-filtro"><Tabla cab={CAB_FILTRO_REF} filas={filasFiltroRef(ps)} /></div>
      </div>
      <div style={caja} data-prueba="azar-filtro">
        <div style={etiqueta}>Prueba contra el azar</div>
        <Tabla cab={CAB_AZAR_FILTRO} filas={filasAzarFiltro(ps)} />
        <div style={{ fontSize: TAM, color: GRIS, marginTop: 6 }}>Los periodos FUERA reales, con sus duraciones, colocados al azar en el periodo sin solaparse ({num(N_SIM_CARTERA, 0)} simulaciones, semilla fija). El percentil dice cuántas de cada 100 colocaciones al azar dieron un CAGR / caída peor: si el filtro sale de verdad en los malos momentos, debería quedar arriba.</div>
      </div>
      {tot?.anioAnio && (<div style={caja} data-prueba="anio-filtro">
        <div style={etiqueta}>Año a año · {periodoCartera(tot)}</div>
        <Tabla cab={CAB_ANIO_FILTRO} filas={filasAnioFiltro(tot)} />
      </div>)}
      {pVer && (<div style={caja} data-prueba="fuera-filtro">
        <div style={etiqueta}>Periodos FUERA más largos · {periodoCartera(pVer)} ({num(pVer.ciclos, 0)} en total)</div>
        {pVer.tablaCiclos?.length ? <Tabla cab={CAB_FUERA} filas={filasFuera(pVer)} /> : <div style={{ fontSize: TAM, color: GRIS }}>Ningún periodo FUERA en este periodo.</div>}
      </div>)}
      {pVer && (<details style={caja}>
        <summary style={{ ...etiqueta, cursor: 'pointer', marginBottom: 0 }}>Impuestos (estimación) · {periodoCartera(pVer)}</summary>
        <div style={{ marginTop: 8 }}>{pVer.impuestos?.plusvaliasPorAnio?.length ? <Tabla cab={cabImpuestos(pVer)} filas={filasImpuestos(pVer)} /> : <div style={{ fontSize: TAM, color: GRIS }}>Sin plusvalías realizadas.</div>}</div>
        <div style={{ fontSize: TAM, marginTop: 6 }}>{resumenImpuestos(pVer)}</div>
        <div style={{ fontSize: TAM, color: GRIS, marginTop: 6 }}>{notaImpuestos(pVer)}</div>
      </details>)}
      {resultado.periodos.some(p => p.costes) && (<div style={caja} data-prueba="costes-resultado"><div style={etiqueta}>Costes por operación</div><Tabla cab={CAB_COSTES} filas={filasCostes(resultado.periodos)} /><div style={{ fontSize: TAM, color: GRIS, marginTop: 6 }}>Cálculo 2: {textoCostesConfig(resultado.config?.costes)}. Cada compra y cada venta paga su coste (también las del azar); entra en el precio de compra o de venta para los impuestos.</div></div>)}
          <div style={caja} data-prueba="calibracion">
        <div style={etiqueta}>Calibración de esta variante</div>
        {!resultado.clas?.oficial ? <div style={{ fontSize: TAM, color: GRIS }}>Exploratoria: no tiene calibración propia.</div> : cal ? <Tabla cab={CAB_CAL_FILTRO} filas={[filaCalibracionFiltro(cal)]} /> : <div style={{ fontSize: TAM, color: AMBAR }}>Sin calibración: el azar no da veredicto.</div>}
        <div style={{ fontSize: TAM, color: GRIS, marginTop: 6 }}>{notaCalibracionFiltro(calibracionLote('CARTERA_3'))} Si el percentil del total sale 95 o más en más del 10 % de esos mercados sin ventaja, el azar no juzga bien la variante. «Mejora a la mezcla sin ventaja» es informativo: cuántas veces el filtro mejora el CAGR / caída solo por suerte.</div>
      </div>
    </>)
  }
  function vistaExplorar() {
    const etfsV = EXPLORACIONES[verExpl].etfs, etfV = etfsV.includes(etfExpl) ? etfExpl : etfsV[0]
    const e = expl[verExpl], parte = e?.partes?.[etfV], cfgE = e?.config
    return (<>
      <div style={{ ...caja, borderColor: AMBAR, fontSize: TAM, color: AMBAR }}>{AVISO_EXPLORACION}</div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
        {Object.values(EXPLORACIONES).map(x => <button key={x.tipo} onClick={() => setVerExpl(x.tipo)} aria-pressed={verExpl === x.tipo} style={verExpl === x.tipo ? botonPrincipal : boton}>{x.nombre}</button>)}
        <span style={{ width: 12 }} />
        {etfsV.map(x => <button key={x} onClick={() => setEtfExpl(x)} aria-pressed={etfV === x} style={etfV === x ? botonPrincipal : boton}>{nombreEtfExpl(x)}</button>)}
      </div>
      {verExpl === 'estres' && validacionSinteticos()}
      {verExpl === 'mapaMedia' && <div style={{ ...caja, borderColor: AMBAR, fontSize: TAM, color: AMBAR }} data-prueba="aviso-mapa">{AVISO_LIQUIDEZ} {AVISO_SINTETICOS}</div>}
      {!e ? <div style={{ ...caja, fontSize: TAM, color: GRIS }}>Todavía no hay resultado {ARTICULO_EXPL[verExpl]?.[1] || 'de la'} {EXPLORACIONES[verExpl].nombre.toLowerCase()}: ejecútala a la izquierda o ábrela del historial.</div> : (<div data-prueba="exploracion">
        <div style={caja}>
          <div style={{ fontSize: TAM, color: GRIS }}>{cfgE.nombre} · {textoCalculo(calculoDeConfig(cfgE))} · {cfgE.combinaciones} combinaciones (cuentan como pruebas exploratorias) · huella {String(e.clas?.hash || '').slice(0, 12)}… · {e.id != null ? `prueba ${e.id}${e.creado ? `, ${fmtDate(e.creado)}` : ''}` : 'no guardada'}</div>
          <div style={{ marginTop: 8 }}><BotonCopiar obtenerTexto={textoCopiaExpl} /></div>
        </div>
        {cfgE.tipo === 'mapaMedia' ? vistaMapa(e, cfgE, etfV) : cfgE.tipo === 'estres' ? vistaEstres(e, cfgE, etfV) : !parte ? <div style={{ ...caja, fontSize: TAM, color: GRIS }}>Sin datos de {etfV} en esta exploración.</div> : cfgE.tipo === 'curvaRiesgo' ? (<>
          <div style={caja}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
              <span style={{ ...etiqueta, marginBottom: 0 }}>Periodo</span>
              {parte.periodos.map((p, k) => <button key={k} onClick={() => setPerExpl(k)} aria-pressed={k === Math.min(perExpl, parte.periodos.length - 1)} style={k === Math.min(perExpl, parte.periodos.length - 1) ? botonPrincipal : boton}>{periodoCartera(p)}</button>)}
            </div>
            <CurvaRiesgo periodo={parte.periodos[Math.min(perExpl, parte.periodos.length - 1)]} familias={cfgE.familias} />
          </div>
          <div style={caja}><Tabla cab={CAB_CURVA} filas={filasCurva(parte.periodos[Math.min(perExpl, parte.periodos.length - 1)], cfgE.familias)} /></div>
        </>) : (<>
          <div style={caja} data-prueba="mapa">
            <div style={etiqueta}>Mapa de sensibilidad · {etfV}</div>
            <div style={{ overflowX: 'auto' }}><table style={{ borderCollapse: 'collapse', fontSize: TAM }}>
              <thead><tr>{cabMapa(parte).map((c, i) => <th key={i} style={{ textAlign: i ? 'right' : 'left', padding: '3px 8px', color: GRIS, fontWeight: 400, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{c}</th>)}</tr></thead>
              <tbody>{filasMapa(parte).map((f, j) => <tr key={j} style={{ background: parte.valores[j].zonaEstable ? 'rgba(0,229,160,0.10)' : undefined }}>{f.map((c, i) => <td key={i} style={{ textAlign: i ? 'right' : 'left', padding: '3px 8px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap', fontWeight: parte.valores[j].pct === cfgE.porDefecto ? 700 : 400 }}>{c}</td>)}</tr>)}</tbody>
            </table></div>
            <div style={{ fontSize: TAM, color: GRIS, marginTop: 6 }}>Zona estable (fondo verde): CAGR total a menos de {cfgE.zonaEstablePuntos} punto del mejor. En negrita, el {cfgE.porDefecto} % de CARTERA_1.</div>
          </div>
          <div style={{ ...caja, borderColor: 'var(--accent)' }} data-prueba="fuera-de-muestra">
            <div style={etiqueta}>Comprobación fuera de muestra</div>
            <div style={{ fontSize: TAM, lineHeight: 1.5 }}>{textoFueraDeMuestra(parte)}</div>
          </div>
        </>)}
      </div>)}
      <div style={{ ...caja, fontSize: TAM, lineHeight: 1.5 }} data-prueba="como-leer-explorar">
        <div style={etiqueta}>Cómo leer esto</div>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li>Esto <b>no da veredicto</b>: enseña la forma de los resultados. Cada exploración cuenta como tantas pruebas exploratorias como combinaciones tiene.</li>
          <li><b>Curva de riesgo</b>: cada punto es un % de la cartera en el ETF (de 0 a 100). Abajo-izquierda, poca caída y poco rendimiento; arriba-derecha, más de los dos. Sirve para elegir cuánta caída estás dispuesto a aguantar, no el punto más alto. En la Regla simple el % es lo que pasa al ETF en cada ciclo; con 0 % es comprar y mantener QQQ.</li>
          <li><b>Mapa de sensibilidad</b>: la misma regla con distintas caídas. Si el resultado cambia mucho de un valor al de al lado, es frágil. La <b>zona estable</b> son los valores parecidos al mejor.</li>
          <li><b>Fuera de muestra</b>: se elige el mejor valor mirando solo el primer tramo y se ve qué hizo después. Si después queda por debajo de la mediana o del valor por defecto, elegir «el mejor» era suerte.</li>
          <li><b>Prueba de estrés 1999–2025</b>: la Mezcla fija (rebalanceo anual) con un ETF ×2 o ×3 <b>sintético</b> desde 1999, para ver la burbuja de 2000–2002 y la crisis de 2008, que QLD y TQQQ no vivieron enteras. El sintético multiplica cada día el rendimiento del QQQ y resta su coste (comisión, el tipo a corto del dinero prestado y un ajuste calibrado). La <b>validación</b> de arriba dice cuánto se parece al real donde los dos existen: si la diferencia media anual es pequeña y la correlación diaria es casi 1, el sintético es creíble; antes de 2006 es una reconstrucción.</li>
          <li><b>Tiempo bajo el agua</b>: cuántos días pasan desde el pico de la peor caída hasta volver a él. «Sin recuperar» significa que al final del periodo todavía no había vuelto. Es lo que más cuesta aguantar: una caída muy profunda puede tardar muchos años en recuperarse.</li>
          <li><b>Año a año</b>: el rendimiento de cada año natural del {EXPLORACIONES.estres.anioAnio} % en el ETF frente a QQQ y SPY, para ver los años malos seguidos.</li>
          <li><b>Mapa de la media</b>: la mezcla con filtro de tendencia (×3 sintético) con distintas medias, en diario (días) y en semanal (semanas; en el gráfico, × 5 para compartir eje). Mide el CAGR / caída máxima: rendimiento por cada punto de caída. Si la línea sube y baja mucho de un valor al de al lado, el resultado es frágil; la <b>zona estable</b> son los valores a menos del 10 % del mejor. <b>Fuera de muestra</b>: se elige la mejor media mirando solo 1999–2010 y se ve qué hizo en 2011–2025, frente a la mediana y a las medias de 50 y 200 días (10 y 40 semanas). Liquidez al 0 %.</li>
          <li>El valor neto de impuestos es una estimación (10.000 € al empezar, ventas FIFO, tramos del ahorro).</li>
        </ul>
      </div>
    </>)
  }
  const pVer = resultado?.periodos?.[verPeriodo] || null, calR = resultado?.clas?.oficial ? calibracionDe(resultado.clas.lote, resultado.clas.item) : null

  return (
    <div style={{ display: 'flex', flex: 1, minHeight: 0, height: '100%', overflow: 'hidden', fontFamily: MONO, color: 'var(--text)' }}>
      {/* ── Constructor y lote ── */}
      <div style={{ width: 400, flexShrink: 0, overflowY: 'auto', padding: 12, borderRight: '1px solid var(--border)' }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>💼 Laboratorio de cartera</div>
        <div style={{ fontSize: TAM, color: GRIS, marginBottom: 10 }} data-prueba="contador">
          {registro.contador ? <>Pruebas registradas: <b style={{ color: 'var(--text)' }}>{registro.contador.total}</b> · oficiales {registro.contador.oficiales} · exploratorias {registro.contador.exploratorias}</> : registro.cargando ? 'Leyendo el registro…' : 'Pruebas registradas: —'}
        </div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }} data-prueba="pestanas">
          {[['probar', 'Probar'], ['explorar', 'Explorar']].map(([p, t]) => <button key={p} onClick={() => setPestana(p)} aria-pressed={pestana === p} style={pestana === p ? botonPrincipal : boton}>{t}</button>)}
        </div>
        {pestana === 'explorar' ? (<>
          <div style={{ ...caja, borderColor: AMBAR, fontSize: TAM, color: AMBAR }} data-prueba="aviso-exploracion">{AVISO_EXPLORACION}</div>
          {Object.values(EXPLORACIONES).map(e => (
            <div key={e.tipo} style={caja}>
              <div style={etiqueta}>{e.nombre}</div>
              <div style={{ fontSize: TAM, color: GRIS, marginBottom: 8 }}>{e.tipo === 'mapaMedia'
                ? `Mezcla con filtro de tendencia con el ×3 sintético, SMA de ${e.diario[0]} a ${e.diario[e.diario.length - 1]} días (de 10 en 10) en diario y de ${e.semanal[0]} a ${e.semanal[e.semanal.length - 1]} semanas (de 2 en 2) en semanal, para los dos alcances (${e.alcances.map(a => NOMBRE_ALCANCE[a]).join(' y ')}); por valor: CAGR, caída máxima, CAGR / caída, tiempo fuera y cambios; zona estable y fuera de muestra (elegir en 1999–2010, comprobar en 2011–2025). ${e.combinaciones} combinaciones. Liquidez al 0 %.`
                : e.tipo === 'estres'
                ? `Mezcla fija con rebalanceo anual, % en el ETF de 0 a 100 en saltos de 10, con un ETF ×2 y ×3 sintético sobre el QQQ desde 1999; periodos ${e.periodos.map(periodoCartera).join(', ')}; por periodo: CAGR, caída máxima, tiempo bajo el agua, peor año, CAGR / caída y valor final neto; año a año del ${e.anioAnio} %. ${e.combinaciones} combinaciones. ${AVISO_SINTETICOS}`
                : e.tipo === 'curvaRiesgo'
                ? `% de la cartera en el ETF de 0 a 100 en saltos de 10, para ${e.familias.map(f => f.nombre).join(' y ')}; ${e.etfs.join(' y ')}; por periodo: CAGR, caída máxima, peor año, CAGR / caída y valor final neto. ${e.combinaciones} combinaciones.`
                : `Regla simple con el ${e.fraccion * 100} % en el ETF y ventana ${e.ventana}, caída de ${e.caidas[0]} a ${e.caidas[e.caidas.length - 1]} % (${e.caidas.length} valores); ${e.etfs.join(' y ')}; zona estable y comprobación fuera de muestra. ${e.combinaciones} combinaciones.`}</div>
              <button onClick={() => lanzaExploracion(e.tipo)} disabled={!!progreso} style={{ ...botonPrincipal, opacity: progreso ? 0.5 : 1 }}>▶ Ejecutar</button>
              {expl[e.tipo] && <button onClick={() => setVerExpl(e.tipo)} style={{ ...boton, marginLeft: 8 }}>Ver el resultado</button>}
            </div>))}
        </>) : (<>
        <div style={{ fontSize: 14, fontWeight: 700, margin: '4px 0 2px' }} data-prueba="proxima-prueba">Próxima prueba</div>
        <div style={{ fontSize: TAM, color: GRIS, marginBottom: 8 }}>Lo que se ejecuta al pulsar «Ejecutar prueba». Al abrir un resultado (de un lote, «Ver» o el historial) se rellena con su configuración.</div>
        <div style={caja}>
          <div style={etiqueta}>La regla</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: TAM, color: GRIS }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>Regla
              <select value={ui.regla} onChange={e => cambiaRegla(e.target.value)} style={entrada}><option value="sergi">Regla de Sergi</option><option value="simple">Regla simple</option><option value="mezcla">Mezcla fija</option><option value="filtro">Mezcla con filtro de tendencia</option></select></label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>ETF
              <select value={ui.etf} onChange={e => pon('etf', e.target.value)} style={entrada}>{ui.regla === 'filtro' ? <><option value="x2">×2 sintético</option><option value="x3">×3 sintético</option></> : <><option value="QLD">QLD (×2)</option><option value="TQQQ">TQQQ (×3)</option></>}</select></label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>Cálculo
              <select value={ui.calculo === '1' ? '1' : '2'} onChange={e => pon('calculo', e.target.value)} style={entrada} data-prueba="calculo"><option value="2">2 · impuestos en caja</option><option value="1">1 · el de los lotes</option></select></label>
            {ui.regla === 'filtro' ? (<>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>SMA ({ui.evaluacion === 'semanal' ? 'semanas' : 'días'})
              <input type="text" inputMode="numeric" value={ui.periodoMedia ?? '200'} onChange={e => pon('periodoMedia', e.target.value)} style={{ ...entrada, width: 70 }} /></label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>Evaluación
              <select value={ui.evaluacion || 'diario'} onChange={e => pon('evaluacion', e.target.value)} style={entrada}><option value="diario">diaria</option><option value="semanal">semanal</option></select></label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>Al salir
              <select value={ui.alcance || 'apalancado'} onChange={e => pon('alcance', e.target.value)} style={entrada}><option value="apalancado">{NOMBRE_ALCANCE.apalancado}</option><option value="todo">{NOMBRE_ALCANCE.todo}</option></select></label>
            </>) : ui.regla === 'mezcla' ? (<>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>% en el ETF
              <input type="text" inputMode="decimal" value={ui.pctEtf ?? '50'} onChange={e => pon('pctEtf', e.target.value)} style={{ ...entrada, width: 70 }} /></label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>Rebalanceo
              <select value={ui.frecuencia || 'anual'} onChange={e => pon('frecuencia', e.target.value)} style={entrada}><option value="anual">anual</option><option value="trimestral">trimestral</option><option value="mensual">mensual</option></select></label>
            </>) : (<>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>Caída desde el máximo (%)
              <input type="text" inputMode="decimal" value={ui.pct} onChange={e => pon('pct', e.target.value)} style={{ ...entrada, width: 70 }} /></label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>Ventana del máximo (velas)
              <input type="text" inputMode="numeric" value={ui.ventana} onChange={e => pon('ventana', e.target.value)} style={{ ...entrada, width: 70 }} /></label>
            </>)}
          </div>
          <div style={{ fontSize: TAM, color: GRIS, marginTop: 6 }}>Periodos ({nombreEtfCartera(ui.etf)}): {periodosDe(ui.etf).map(periodoCartera).join(', ')} · {ui.regla === 'filtro' ? `${textoMediaFiltro(regla.filtro)} del QQQ al cierre, ejecución a la apertura siguiente · cada periodo empieza DENTRO o FUERA según la media · ETF sintético (antes de 2006, reconstrucción) · azar: los periodos FUERA al azar, medida CAGR / caída` : ui.regla === 'mezcla' ? `rebalanceo ${FRECUENCIAS[ui.frecuencia] || ''} a la apertura · sin azar (no elige momentos) · se compara con la regla simple de CARTERA_1 del mismo ETF` : 'cada periodo empieza en NORMAL'} · liquidez al 0 % · rentabilidad total</div>
        </div>
        <div style={caja}>
          <div style={etiqueta}>Diagrama de estados</div>
          <DiagramaEstados regla={regla} />
        </div>
        <div style={{ ...caja, borderColor: clas?.oficial ? 'var(--accent)' : 'var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={etiqueta}>Prueba</span>
            <span data-prueba="tipo" style={{ fontSize: TAM, fontWeight: 700, padding: '1px 8px', borderRadius: 10, border: `1px solid ${clas?.oficial ? 'var(--accent)' : 'var(--border)'}`, color: clas?.oficial ? 'var(--accent)' : GRIS }}>{etiquetaTipo(clas)}</span>
          </div>
          <div data-prueba="frase" style={{ fontSize: 13 }}>{reglaCarteraCorta(config)}</div>
          {ui.regla === 'filtro' && <div style={{ fontSize: TAM, color: AMBAR, marginTop: 6 }} data-prueba="aviso-liquidez">{AVISO_LIQUIDEZ}</div>}
          {ui.calculo !== '1' && (<div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: TAM, color: GRIS, marginTop: 6 }} data-prueba="costes">
            {[['comisionPct', 'Comisión (%)', '0'], ['comisionMin', 'Mínimo (€)', '0'], ['horquillaQqq', 'Media horquilla QQQ (%)', '0,05'], ['horquillaEtf', 'Media horquilla ETF (%)', '0,05']].map(([k, t, d]) => (
              <label key={k} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>{t}<input type="text" inputMode="decimal" value={ui[k] ?? d} onChange={e => pon(k, e.target.value)} style={{ ...entrada, width: 70 }} /></label>))}
          </div>)}
          <div style={{ fontSize: TAM, color: GRIS, marginTop: 6 }} data-prueba="texto-calculo">Cálculo: {textoCalculo(ui.calculo === '1' ? 1 : 2)}. {ui.calculo !== '1' ? `Costes por operación: ${textoCostesConfig(config.costes)}.` : 'Sin costes por operación.'} Las variantes de los lotes congelados solo cuentan como oficiales con el cálculo 1, el suyo.</div>
          {!clas?.oficial && <div style={{ fontSize: TAM, color: GRIS, marginTop: 6 }}>Exploratoria: no coincide con ninguna variante de CARTERA_1, CARTERA_2 ni CARTERA_3. Se registra y se cuenta, pero no tiene veredicto.</div>}
          {clas?.oficial && registro.lotes?.[clas.lote]?.[clas.item] && registro.lotes[clas.lote][clas.item].estado !== 'pendiente' && <div style={{ fontSize: TAM, color: AMBAR, marginTop: 6 }}>Esta variante ya se ejecutó. Repetirla da el mismo resultado y cuenta como otra prueba.</div>}
          {errores.length > 0 && <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: TAM, color: ROJO }}>{errores.map((e, i) => <li key={i}>{e}</li>)}</ul>}
          <div style={{ marginTop: 8 }}><button onClick={ejecutaActual} disabled={!!errores.length || !clas || !!progreso} style={{ ...botonPrincipal, opacity: errores.length || !clas || progreso ? 0.5 : 1 }}>▶ Ejecutar prueba</button></div>
        </div>
        {[[CARTERA_1, 'cartera1'], [CARTERA_2, 'cartera2'], [CARTERA_3, 'cartera3']].map(([lote, prueba]) => { const est = registro.lotes?.[lote.id], pend = pendientesDe(lote), sinAzar = CARTERA_2 === lote
          return (<div key={lote.id} style={caja}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={etiqueta}>{lote.nombre}</span>
            <button onClick={() => ejecutaPendientes(lote)} disabled={!!progreso || !pend.length || !est} style={{ ...boton, opacity: progreso || !pend.length || !est ? 0.5 : 1 }}>Ejecutar pendientes ({est ? pend.length : '—'})</button>
          </div>
          <table style={{ borderCollapse: 'collapse', fontSize: TAM, width: '100%' }} data-prueba={prueba}><tbody>{lote.items.map(it => {
            const e = est?.[it.id], estado = e?.estado || (est ? 'pendiente' : '—'), cal = calibracionDe(lote.id, it.id)
            return (<tr key={it.id} style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '3px 4px', color: GRIS }}>{it.id}</td><td style={{ padding: '3px 4px' }}>{it.nombre}</td>
              <td data-prueba="calibrada" title={sinAzar ? SIN_AZAR : cal ? `${cal.pctAprobados} % de falsos aprobados en ${cal.universos} universos sin ventaja` : 'sin calibración'} style={{ padding: '3px 4px', whiteSpace: 'nowrap', color: sinAzar ? GRIS : cal?.calibrada ? VERDE : AMBAR }}>{sinAzar ? 'sin azar' : cal ? (cal.calibrada ? 'calibrada' : 'no calibrada') : 'sin calibrar'}</td>
              <td style={{ padding: '3px 4px', textAlign: 'right', color: COLOR_VEREDICTO[estado] || 'var(--text)' }}>{e?.id ? <button onClick={() => verPrueba(e.id)} title="Ver el resultado registrado" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: MONO, fontSize: TAM, color: 'inherit', textDecoration: 'underline', textAlign: 'right' }}>{estado}</button> : estado}</td>
              <td style={{ padding: '3px 4px', textAlign: 'right' }}><button onClick={() => setUi(uiDe(configDeItem(lote, it.id)))} title="Poner esta variante en el constructor" style={{ ...boton, padding: '1px 6px' }}>↑</button></td>
            </tr>)
          })}</tbody></table>
          <div style={{ fontSize: TAM, color: GRIS, marginTop: 6 }}>Estado según el registro (la prueba oficial más reciente de cada variante). «↑» la carga en el constructor.</div>
        </div>) })}
        </>)}
        {registro.error && <div style={{ fontSize: TAM, color: ROJO }}>{registro.error}</div>}
      </div>

      {/* ── Resultado e historial ── */}
      <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: 12 }}>
        {progreso && (<div style={caja} data-prueba="progreso">
          <div style={{ fontSize: TAM, marginBottom: 6 }}>Calculando: {progreso.texto} · {seg} s</div>
          <div style={{ height: 8, background: 'var(--bg)', borderRadius: 4, overflow: 'hidden' }}><div style={{ width: `${Math.round(progreso.hechos / progreso.total * 100)}%`, height: '100%', background: 'var(--accent)', transition: 'width 0.3s' }} /></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, fontSize: TAM, color: GRIS }}><span>{progreso.unidad === 'ETF' ? `${progreso.hechos} de ${progreso.total} ETF` : `${progreso.hechos} de ${progreso.total} periodos · ${num(N_SIM_CARTERA, 0)} simulaciones del azar por periodo`}</span><button onClick={() => { parar.current = true }} style={boton}>Parar</button></div>
        </div>)}
        {errorEjec && <div style={{ ...caja, borderColor: ROJO, color: ROJO, fontSize: TAM }}>{errorEjec}</div>}
        {pestana === 'explorar' ? vistaExplorar() : (<>
        {!resultado && !progreso && <div style={{ ...caja, fontSize: TAM, color: GRIS }}>Elige la regla a la izquierda y pulsa «Ejecutar prueba», o abre una del historial.</div>}
        {resultado && (<div data-prueba="resultado">
          <div style={caja}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 260 }}>
                <div style={{ fontSize: 13 }}>{reglaCarteraCorta(resultado.config)}</div>
                <div style={{ fontSize: TAM, color: GRIS, marginTop: 4 }}>{etiquetaTipo(resultado.clas)} · <span data-prueba="calculo-resultado">{textoCalculo(calculoDeConfig(resultado.config))}</span> · huella {String(resultado.clas?.hash || '').slice(0, 12)}… · {resultado.id != null ? `prueba ${resultado.id}${resultado.creado ? `, ${fmtDate(resultado.creado)}` : ''}` : 'no guardada'} · {esConfigFiltro(resultado.config) ? 'periodos FUERA' : 'ciclos'}: {resultado.periodos.map(p => `${periodoCartera(p)} ${p.ciclos}`).join(' · ')}</div>
              </div>
              <div style={{ textAlign: 'right', maxWidth: 300 }}><div style={etiqueta}>Veredicto (orientativo)</div><div data-prueba="veredicto" style={{ fontSize: 14, fontWeight: 700, color: COLOR_VEREDICTO[resultado.veredicto] || 'var(--text)' }}>{resultado.veredicto}</div></div>
            </div>
            {resultado.errorGuardar && <div style={{ fontSize: TAM, color: ROJO, marginTop: 6 }}>{resultado.errorGuardar}</div>}
            <div style={{ marginTop: 8 }}><BotonCopiar obtenerTexto={textoCopia} /></div>
          </div>
          <div style={caja}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
              <span style={{ ...etiqueta, marginBottom: 0 }}>Curva</span>
              {resultado.periodos.map((p, k) => <button key={k} onClick={() => setVerPeriodo(k)} aria-pressed={k === verPeriodo} style={k === verPeriodo ? botonPrincipal : boton}>{periodoCartera(p)}</button>)}
            </div>
            <Curva curva={pVer?.curva} nombres={esConfigFiltro(resultado.config) ? { mitad: 'Mezcla sin filtro' } : {}} />
          </div>
          {esConfigFiltro(resultado.config) && <div style={{ ...caja, borderColor: AMBAR, fontSize: TAM, color: AMBAR }} data-prueba="aviso-liquidez-resultado">{AVISO_LIQUIDEZ} {AVISO_SINTETICOS}</div>}
          {esConfigFiltro(resultado.config) ? vistaResultadoFiltro() : (<>
          <div style={caja}>
            <div style={etiqueta}>Resultado por periodo</div>
            <Tabla cab={CAB_CARTERA} filas={filasCartera(resultado.periodos)} />
            <div data-prueba="criterio" style={{ fontSize: TAM, marginTop: 6 }}>{textoCriterio(resultado.clas || {}, 'cartera')}</div>
            <div style={{ marginTop: 10 }}><Tabla cab={CAB_CARTERA_REF} filas={filasCarteraRef(resultado.periodos)} /></div>
            {resultado.periodos.some(p => p.comparacion) && (<div style={{ marginTop: 10 }} data-prueba="comparacion">
              <div style={{ fontSize: TAM, marginBottom: 4 }}>Comparación con {resultado.periodos.find(p => p.comparacion).comparacion.nombre} (mismos datos y periodos, con impuestos):</div>
              <Tabla cab={CAB_COMPARACION} filas={filasComparacion(resultado.periodos)} /></div>)}
            {resultado.periodos.some(p => p.azar?.nota === SIN_AZAR) && <div style={{ fontSize: TAM, color: GRIS, marginTop: 6 }}>Azar: {SIN_AZAR}.</div>}
          </div>
          {pVer && (<div style={caja}>
            <div style={etiqueta}>Ciclos · {periodoCartera(pVer)}</div>
            {pVer.tablaCiclos?.length ? <Tabla cab={CAB_CICLOS} filas={filasCiclos(pVer)} /> : <div style={{ fontSize: TAM, color: GRIS }}>Ningún ciclo en este periodo.</div>}
          </div>)}
          {pVer && (<details style={caja}>
            <summary style={{ ...etiqueta, cursor: 'pointer', marginBottom: 0 }}>Impuestos (estimación) · {periodoCartera(pVer)}</summary>
            <div style={{ marginTop: 8 }}>{pVer.impuestos?.plusvaliasPorAnio?.length ? <Tabla cab={cabImpuestos(pVer)} filas={filasImpuestos(pVer)} /> : <div style={{ fontSize: TAM, color: GRIS }}>Sin plusvalías realizadas.</div>}</div>
            <div style={{ fontSize: TAM, marginTop: 6 }}>{resumenImpuestos(pVer)}</div>
            <div style={{ fontSize: TAM, color: GRIS, marginTop: 6 }}>{notaImpuestos(pVer)}</div>
          </details>)}
          {resultado.periodos.some(p => p.costes) && (<div style={caja} data-prueba="costes-resultado"><div style={etiqueta}>Costes por operación</div><Tabla cab={CAB_COSTES} filas={filasCostes(resultado.periodos)} /><div style={{ fontSize: TAM, color: GRIS, marginTop: 6 }}>Cálculo 2: {textoCostesConfig(resultado.config?.costes)}. Cada compra y cada venta paga su coste (también las del azar); entra en el precio de compra o de venta para los impuestos.</div></div>)}
          <div style={caja} data-prueba="calibracion">
            <div style={etiqueta}>Calibración de esta variante</div>
            {!resultado.clas?.oficial ? <div style={{ fontSize: TAM, color: GRIS }}>Exploratoria: no tiene calibración propia.</div> : calR ? <Tabla cab={CAB_CAL_CARTERA} filas={[filaCalibracionCartera(calR)]} /> : <div style={{ fontSize: TAM, color: AMBAR }}>Sin calibración: el azar no da veredicto.</div>}
            <div style={{ fontSize: TAM, color: GRIS, marginTop: 6 }}>La misma variante sobre QQQ sintéticos sin ninguna ventaja posible (paseos aleatorios con la deriva y la volatilidad del QQQ real; ETF construidos a diario con su coste). Si el percentil del total sale 95 o más en más del 10 % de ellos, el azar no la juzga bien. Fíjate también en «supera a QQQ sin ventaja»: el apalancamiento solo, con un mercado que sube, ya bate al QQQ muchas veces.</div>
          </div>
          </>)}
        </div>)}
        <div style={{ ...caja, fontSize: TAM, lineHeight: 1.5 }} data-prueba="como-leer">
          <div style={etiqueta}>Cómo leer esto</div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>La regla es una <b>máquina de estados</b>: el diagrama dice qué tiene la cartera en cada estado y qué hace pasar de uno a otro. Todo se mira en el QQQ al cierre y se ejecuta a la apertura del día siguiente; la liquidez no renta nada.</li>
            <li><b>CAGR</b>: el rendimiento anual compuesto, con los dividendos reinvertidos. Se compara con <b>comprar y mantener QQQ</b> (lo principal), con una cartera <b>50 % QQQ + 50 % ETF</b> rebalanceada cada año y con el <b>SPY</b>.</li>
            <li><b>Caída máxima</b>: la peor bajada desde un máximo, con su fecha. <b>CAGR / caída</b>: cuánto rinde por cada punto de caída. <b>Apalancado</b> y <b>liquidez</b>: qué parte del tiempo se pasa en cada estado.</li>
            <li><b>Azar</b> ({num(N_SIM_CARTERA, 0)} simulaciones): los mismos ciclos, con sus mismas entradas y salidas del ETF y sus duraciones, pero empezando en fechas al azar. El <b>percentil</b> dice cuántas de cada 100 salieron peor: responde a «¿importa CUÁNDO entra la regla, o daría lo mismo entrar cuando fuera?».</li>
            <li><b>Veredicto orientativo</b> (hay pocos ciclos, así que la estadística es débil): «mejor que comprar y mantener QQQ» si su CAGR es mayor en todos los subperiodos; «… y que el azar» si además el percentil del total es 95 o más y la variante está calibrada. Mira siempre cuántos ciclos hay.</li>
            <li>Los <b>impuestos</b> son una estimación (tramos del ahorro, ventas FIFO, 10.000 € al empezar); comprar y mantener solo paga al vender al final.</li>
            <li><b>Mezcla con filtro de tendencia</b> (CARTERA_3): DENTRO, 50 % QQQ + 50 % ETF (×2 o ×3 sintético) rebalanceada cada año; si el QQQ cierra por debajo de su media sale (solo el apalancado o todo) y vuelve a 50/50 cuando cierra por encima. <b>Liquidez al 0 %</b>: el dinero fuera no renta nada. Se compara sobre todo con la <b>misma mezcla sin filtro</b>, por el CAGR / caída máxima (criterio 7: mejor en el total y en al menos 3 de los 4 subperiodos), y con el QQQ con el mismo filtro sin apalancar, para separar lo que aporta el filtro de lo que aporta el apalancamiento. El <b>tiempo bajo el agua</b> son los días desde el pico de la peor caída hasta recuperarlo. El azar coloca los periodos FUERA reales en sitios al azar: ¿importa CUÁNDO sale el filtro?</li>
          </ul>
        </div>
        <div style={caja} data-prueba="historial">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}><span style={etiqueta}>Historial de carteras</span><button onClick={recarga} disabled={registro.cargando} style={boton}>↻ Actualizar</button></div>
          {!registro.historial.length ? <div style={{ fontSize: TAM, color: GRIS }}>{registro.cargando ? 'Leyendo…' : 'Todavía no hay pruebas de cartera registradas.'}</div> : (
            <div style={{ overflowX: 'auto' }}><table style={{ borderCollapse: 'collapse', fontSize: TAM }}>
              <thead><tr>{['Fecha', 'Regla', 'Tipo', 'Criterio', 'Veredicto', ''].map((c, i) => <th key={i} style={{ textAlign: 'left', padding: '3px 8px', color: GRIS, fontWeight: 400, borderBottom: '1px solid var(--border)' }}>{c}</th>)}</tr></thead>
              <tbody>{registro.historial.filter(h => esConfigCartera(h.config) || esConfigExploracion(h.config)).map(h => { const ex = esConfigExploracion(h.config)
                return (<tr key={h.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '3px 8px', whiteSpace: 'nowrap' }}>{fmtDate(h.creado)}</td>
                <td style={{ padding: '3px 8px' }}>{ex ? `${h.config.nombre} (${h.config.combinaciones} combinaciones)` : reglaCarteraCorta(h.config)}</td>
                <td style={{ padding: '3px 8px', whiteSpace: 'nowrap', color: h.oficial ? 'var(--accent)' : GRIS }}>{h.oficial ? `Oficial · ${h.lote} · ${h.item_lote}` : ex ? 'Exploración' : 'Exploratoria'}</td>
                <td data-prueba="criterio-historial" style={{ padding: '3px 8px', whiteSpace: 'nowrap', color: GRIS }} title={ex ? AVISO_EXPLORACION : textoCriterio({ oficial: h.oficial, lote: h.lote, item: h.item_lote }, esConfigFiltro(h.config) && !h.oficial ? 'filtro' : 'cartera')}>{ex ? 'sin veredicto' : textoCriterio({ oficial: h.oficial, lote: h.lote, item: h.item_lote }, esConfigFiltro(h.config) && !h.oficial ? 'filtro' : 'cartera', { corto: true })}</td>
                <td style={{ padding: '3px 8px', color: COLOR_VEREDICTO[h.veredicto] || 'var(--text)' }}>{h.veredicto || '—'}</td>
                <td style={{ padding: '3px 8px', whiteSpace: 'nowrap' }}><button onClick={() => verPrueba(h.id)} style={{ ...boton, padding: '1px 6px' }}>Ver</button>{!ex && <>{' '}<button onClick={() => setUi(uiDe(h.config))} title="Poner esta regla en el constructor" style={{ ...boton, padding: '1px 6px' }}>↑</button></>}</td>
              </tr>) })}</tbody>
            </table></div>)}
        </div>
        </>)}
      </div>
    </div>
  )
}
