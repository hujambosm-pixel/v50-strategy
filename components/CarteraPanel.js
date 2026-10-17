// components/CarteraPanel.js — la pantalla «Laboratorio de cartera» (CARTERA_1).
//
// Una regla de cartera es una máquina de ESTADOS sobre el QQQ y un ETF apalancado (lib/laboratorioCartera.js): el diagrama
// la enseña con la condición de cada flecha en palabras. Constructor (regla, caída, ventana y ETF) → etiqueta Oficial /
// Exploratoria (huella de un elemento de CARTERA_1, lib/lotesLab.js) → /api/laboratorio, un periodo por petición → curva
// frente a las referencias, tablas, ciclos, impuestos, calibración y registro en lab_pruebas (lib/registroLab.js).
import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { MONO, fmtDate, numeroEs } from '../lib/utils'
import BotonCopiar from './BotonCopiar'
import { CARTERA_1, reglaSergi, reglaSimple, configCarteraDe, configDeItem, validaConfig, veredictoOficial, textoCriterio, calibracionDe, esConfigCartera, VEREDICTOS_CARTERA } from '../lib/lotesLab'
import { clasificaConfig, guardarPrueba, cuentaPruebas, listarPruebas, leerPrueba, estadoLote, SELECT_HISTORIAL } from '../lib/registroLab'
import { fraseTransicion, reduceCurva, CONDICIONES, N_SIM_CARTERA } from '../lib/laboratorioCartera'
import { textoLaboratorio, reglaCarteraCorta, periodoCartera, CAB_CARTERA, filasCartera, CAB_CARTERA_REF, filasCarteraRef, CAB_CICLOS, filasCiclos,
         CAB_IMPUESTOS, filasImpuestos, resumenImpuestos, NOTA_IMPUESTOS, CAB_CAL_CARTERA, filaCalibracionCartera, num } from '../lib/exportaTexto'
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
const COLOR_VEREDICTO = { [VEREDICTOS_CARTERA.mejorYAzar]: VERDE, [VEREDICTOS_CARTERA.mejorNoAzar]: AMBAR, [VEREDICTOS_CARTERA.mejorSinAzar]: AMBAR, [VEREDICTOS_CARTERA.noMejora]: ROJO, pendiente: GRIS, 'sin veredicto': GRIS }
const SERIES = [['estrategia', 'Cartera', 'var(--accent)'], ['qqq', 'QQQ', GRIS], ['mitad', '50/50', AMBAR], ['spy', 'SPY', MORADO]]

// La configuración del constructor ↔ lo que se guarda en el navegador.
const uiDe = (config) => { const c = config.regla.transiciones.flatMap(t => t.si).find(s => s.c === 'caidaDesdeMaximo')
  return { regla: config.regla.id, pct: String(c?.pct ?? 10).replace('.', ','), ventana: String(c?.ventana ?? 252), etf: config.etf } }
const UI_DEFECTO = () => uiDe(configDeItem(CARTERA_1, 'V1'))
const leeGuardado = () => { try { const x = JSON.parse(localStorage.getItem(CLAVE_LS) || 'null'); return x && ['sergi', 'simple'].includes(x.regla) && ['QLD', 'TQQQ'].includes(x.etf) ? x : null } catch (_) { return null } }
const periodosDe = (etf) => CARTERA_1.items.find(i => i.etf === etf).periodos
// La regla con la caída y la ventana del constructor (si son las de CARTERA_1, sale idéntica a la del lote).
function reglaDe(ui) {
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
export function DiagramaEstados({ regla }) {
  const ids = Object.keys(regla.estados), W = 520, H = ids.length > 2 ? 230 : 120, bw = 130, bh = 46
  const pos = ids.length > 2 ? { [ids[0]]: [20, 20], [ids[1]]: [W - bw - 20, 20], [ids[2]]: [(W - bw) / 2, H - bh - 16] } : { [ids[0]]: [20, (H - bh) / 2], [ids[1]]: [W - bw - 20, (H - bh) / 2] }
  const centro = (id) => [pos[id][0] + bw / 2, pos[id][1] + bh / 2]
  // Recorta la línea al borde de la caja de destino.
  const borde = ([x0, y0], [x1, y1]) => { const dx = x1 - x0, dy = y1 - y0, tx = dx ? (bw / 2 + 6) / Math.abs(dx) : Infinity, ty = dy ? (bh / 2 + 6) / Math.abs(dy) : Infinity, t = Math.min(tx, ty); return [x1 - dx * t, y1 - dy * t] }
  return (
    <div data-prueba="diagrama">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: W, display: 'block' }} role="img" aria-label={`Diagrama de estados de ${regla.nombre}`}>
        <defs><marker id="flechaCartera" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="var(--text-legible)" /></marker></defs>
        {regla.transiciones.map((t, k) => {
          if (!pos[t.desde] || !pos[t.hacia]) return null
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
          <text x={pos[id][0] + bw / 2} y={pos[id][1] + 35} textAnchor="middle" fontSize="10" fontFamily={MONO} fill="var(--text-legible)">{regla.estados[id].composicion.split(' (')[0]}</text>
        </g>))}
      </svg>
      <ol style={{ margin: '6px 0 0', paddingLeft: 0, listStyle: 'none', fontSize: TAM, lineHeight: 1.5 }}>
        {regla.transiciones.map((t, k) => <li key={k}><span style={{ color: 'var(--accent)' }}>{NUMEROS[k] || k + 1}</span> {fraseTransicion(t)}</li>)}
      </ol>
    </div>
  )
}

// La curva (escala logarítmica) de la cartera frente a las referencias.
function Curva({ curva }) {
  if (!curva?.fechas?.length) return null
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

export default function CarteraPanel({ apiFetch, version = null }) {
  const [ui, setUi] = useState(() => leeGuardado() || UI_DEFECTO())
  useEffect(() => { try { localStorage.setItem(CLAVE_LS, JSON.stringify(ui)) } catch (_) {} }, [ui])
  const regla = useMemo(() => reglaDe(ui), [ui])
  const config = useMemo(() => configCarteraDe({ regla, etf: ui.etf, periodos: periodosDe(ui.etf) }, CARTERA_1.comun), [regla, ui.etf])
  const errores = useMemo(() => validaConfig(config), [config])
  const [clas, setClas] = useState(null)
  useEffect(() => { let vivo = true; clasificaConfig(config).then(c => { if (vivo) setClas(c) }).catch(() => { if (vivo) setClas(null) }); return () => { vivo = false } }, [config])
  const pon = (k, v) => setUi(u => ({ ...u, [k]: v }))

  // ── Registro ──
  const [registro, setRegistro] = useState({ contador: null, lote: null, historial: [], error: null, cargando: false })
  const recarga = useCallback(async () => {
    if (!hayConfigSupabase()) { setRegistro(r => ({ ...r, error: 'Sin conexión con la base de datos configurada: no se puede leer ni guardar el registro.' })); return }
    setRegistro(r => ({ ...r, cargando: true }))
    try {
      const ctx = ctxRegistro()
      const [contador, lote, historial] = await Promise.all([cuentaPruebas(ctx), estadoLote(ctx, CARTERA_1), listarPruebas(ctx, { limite: 100, select: SELECT_HISTORIAL, filtro: '&config->>prueba=eq.cartera' })])
      setRegistro({ contador, lote, historial, error: null, cargando: false })
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
      const fila = await guardarPrueba({ config: cfg, resultados: { periodos: periodos.map(p => ({ ...p, curva: reduceCurva(p.curva, 8) })), veredicto, datos: [] }, versionApp: version }, ctxRegistro())
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
  const pendientes = CARTERA_1.items.filter(it => registro.lote?.[it.id]?.estado === 'pendiente')
  const ejecutaPendientes = async () => {
    if (progreso || !pendientes.length) return
    if (typeof window !== 'undefined' && !window.confirm(`Se van a ejecutar ${pendientes.length} variante${pendientes.length > 1 ? 's' : ''} pendiente${pendientes.length > 1 ? 's' : ''} de ${CARTERA_1.id} (${pendientes.map(p => p.id).join(', ')}). Cada una queda registrada como prueba oficial y no se puede borrar desde la aplicación. ¿Seguir?`)) return
    const trabajos = []
    for (const it of pendientes) { const cfg = configDeItem(CARTERA_1, it.id), c = await clasificaConfig(cfg); if (!c.oficial || c.item !== it.id) { setErrorEjec(`La variante ${it.id} no sale como oficial: no se ejecuta nada.`); return } trabajos.push({ config: cfg, clas: c, nombre: it.id }) }
    lanza(trabajos)
  }
  const verPrueba = async (id) => {
    setErrorEjec(null)
    try { const f = await leerPrueba(ctxRegistro(), id); const ps = f.resultados?.periodos || []
      setResultado({ config: f.config, clas: { hash: f.hash_config, oficial: f.oficial, lote: f.lote, item: f.item_lote }, periodos: ps, veredicto: f.resultados?.veredicto || '—', id: f.id, creado: f.creado, errorGuardar: null, version: f.version_app })
      setVerPeriodo(Math.max(0, ps.length - 1))
    } catch (e) { setErrorEjec(e?.message || String(e)) }
  }
  const textoCopia = () => textoLaboratorio({ cabecera: { titulo: 'Laboratorio de cartera', version: resultado.version || version, fecha: fmtDate(resultado.creado || new Date().toISOString()),
    datos: [['Precios', CARTERA_1.comun.precios], ['Ejecución', CARTERA_1.comun.ejecucion], ['Liquidez', CARTERA_1.comun.liquidez], ['Inicio de cada periodo', CARTERA_1.comun.inicio]] },
    regla: reglaCarteraCorta(resultado.config), clas: resultado.clas, config: resultado.config, veredicto: resultado.veredicto, periodos: resultado.periodos, id: resultado.id })
  const seg = progreso ? Math.max(0, Math.round((ahora - progreso.inicio) / 1000)) : 0
  const pVer = resultado?.periodos?.[verPeriodo] || null, calR = resultado?.clas?.oficial ? calibracionDe(resultado.clas.lote, resultado.clas.item) : null

  return (
    <div style={{ display: 'flex', flex: 1, minHeight: 0, height: '100%', overflow: 'hidden', fontFamily: MONO, color: 'var(--text)' }}>
      {/* ── Constructor y lote ── */}
      <div style={{ width: 400, flexShrink: 0, overflowY: 'auto', padding: 12, borderRight: '1px solid var(--border)' }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>💼 Laboratorio de cartera</div>
        <div style={{ fontSize: TAM, color: GRIS, marginBottom: 10 }} data-prueba="contador">
          {registro.contador ? <>Pruebas registradas: <b style={{ color: 'var(--text)' }}>{registro.contador.total}</b> · oficiales {registro.contador.oficiales} · exploratorias {registro.contador.exploratorias}</> : registro.cargando ? 'Leyendo el registro…' : 'Pruebas registradas: —'}
        </div>
        <div style={caja}>
          <div style={etiqueta}>La regla</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: TAM, color: GRIS }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>Regla
              <select value={ui.regla} onChange={e => pon('regla', e.target.value)} style={entrada}><option value="sergi">Regla de Sergi</option><option value="simple">Regla simple</option></select></label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>ETF
              <select value={ui.etf} onChange={e => pon('etf', e.target.value)} style={entrada}><option value="QLD">QLD (×2)</option><option value="TQQQ">TQQQ (×3)</option></select></label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>Caída desde el máximo (%)
              <input type="text" inputMode="decimal" value={ui.pct} onChange={e => pon('pct', e.target.value)} style={{ ...entrada, width: 70 }} /></label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>Ventana del máximo (velas)
              <input type="text" inputMode="numeric" value={ui.ventana} onChange={e => pon('ventana', e.target.value)} style={{ ...entrada, width: 70 }} /></label>
          </div>
          <div style={{ fontSize: TAM, color: GRIS, marginTop: 6 }}>Periodos ({ui.etf}): {periodosDe(ui.etf).map(periodoCartera).join(', ')} · cada periodo empieza en NORMAL · liquidez al 0 % · rentabilidad total</div>
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
          {!clas?.oficial && <div style={{ fontSize: TAM, color: GRIS, marginTop: 6 }}>Exploratoria: no coincide con ninguna variante de CARTERA_1. Se registra y se cuenta, pero no tiene veredicto.</div>}
          {clas?.oficial && registro.lote?.[clas.item] && registro.lote[clas.item].estado !== 'pendiente' && <div style={{ fontSize: TAM, color: AMBAR, marginTop: 6 }}>Esta variante ya se ejecutó. Repetirla da el mismo resultado y cuenta como otra prueba.</div>}
          {errores.length > 0 && <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: TAM, color: ROJO }}>{errores.map((e, i) => <li key={i}>{e}</li>)}</ul>}
          <div style={{ marginTop: 8 }}><button onClick={ejecutaActual} disabled={!!errores.length || !clas || !!progreso} style={{ ...botonPrincipal, opacity: errores.length || !clas || progreso ? 0.5 : 1 }}>▶ Ejecutar prueba</button></div>
        </div>
        <div style={caja}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={etiqueta}>{CARTERA_1.nombre}</span>
            <button onClick={ejecutaPendientes} disabled={!!progreso || !pendientes.length || !registro.lote} style={{ ...boton, opacity: progreso || !pendientes.length || !registro.lote ? 0.5 : 1 }}>Ejecutar pendientes ({registro.lote ? pendientes.length : '—'})</button>
          </div>
          <table style={{ borderCollapse: 'collapse', fontSize: TAM, width: '100%' }} data-prueba="cartera1"><tbody>{CARTERA_1.items.map(it => {
            const e = registro.lote?.[it.id], estado = e?.estado || (registro.lote ? 'pendiente' : '—'), cal = calibracionDe('CARTERA_1', it.id)
            return (<tr key={it.id} style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '3px 4px', color: GRIS }}>{it.id}</td><td style={{ padding: '3px 4px' }}>{it.nombre}</td>
              <td data-prueba="calibrada" title={cal ? `${cal.pctAprobados} % de falsos aprobados en ${cal.universos} universos sin ventaja` : 'sin calibración'} style={{ padding: '3px 4px', whiteSpace: 'nowrap', color: cal?.calibrada ? VERDE : AMBAR }}>{cal ? (cal.calibrada ? 'calibrada' : 'no calibrada') : 'sin calibrar'}</td>
              <td style={{ padding: '3px 4px', textAlign: 'right', color: COLOR_VEREDICTO[estado] || 'var(--text)' }}>{e?.id ? <button onClick={() => verPrueba(e.id)} title="Ver el resultado registrado" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: MONO, fontSize: TAM, color: 'inherit', textDecoration: 'underline', textAlign: 'right' }}>{estado}</button> : estado}</td>
              <td style={{ padding: '3px 4px', textAlign: 'right' }}><button onClick={() => setUi(uiDe(configDeItem(CARTERA_1, it.id)))} title="Poner esta variante en el constructor" style={{ ...boton, padding: '1px 6px' }}>↑</button></td>
            </tr>)
          })}</tbody></table>
          <div style={{ fontSize: TAM, color: GRIS, marginTop: 6 }}>Estado según el registro (la prueba oficial más reciente de cada variante). «↑» la carga en el constructor.</div>
        </div>
        {registro.error && <div style={{ fontSize: TAM, color: ROJO }}>{registro.error}</div>}
      </div>

      {/* ── Resultado e historial ── */}
      <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: 12 }}>
        {progreso && (<div style={caja} data-prueba="progreso">
          <div style={{ fontSize: TAM, marginBottom: 6 }}>Calculando: {progreso.texto} · {seg} s</div>
          <div style={{ height: 8, background: 'var(--bg)', borderRadius: 4, overflow: 'hidden' }}><div style={{ width: `${Math.round(progreso.hechos / progreso.total * 100)}%`, height: '100%', background: 'var(--accent)', transition: 'width 0.3s' }} /></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, fontSize: TAM, color: GRIS }}><span>{progreso.hechos} de {progreso.total} periodos · {num(N_SIM_CARTERA, 0)} simulaciones del azar por periodo</span><button onClick={() => { parar.current = true }} style={boton}>Parar</button></div>
        </div>)}
        {errorEjec && <div style={{ ...caja, borderColor: ROJO, color: ROJO, fontSize: TAM }}>{errorEjec}</div>}
        {!resultado && !progreso && <div style={{ ...caja, fontSize: TAM, color: GRIS }}>Elige la regla a la izquierda y pulsa «Ejecutar prueba», o abre una del historial.</div>}
        {resultado && (<div data-prueba="resultado">
          <div style={caja}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 260 }}>
                <div style={{ fontSize: 13 }}>{reglaCarteraCorta(resultado.config)}</div>
                <div style={{ fontSize: TAM, color: GRIS, marginTop: 4 }}>{etiquetaTipo(resultado.clas)} · huella {String(resultado.clas?.hash || '').slice(0, 12)}… · {resultado.id != null ? `prueba ${resultado.id}${resultado.creado ? `, ${fmtDate(resultado.creado)}` : ''}` : 'no guardada'} · ciclos: {resultado.periodos.map(p => `${periodoCartera(p)} ${p.ciclos}`).join(' · ')}</div>
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
            <Curva curva={pVer?.curva} />
          </div>
          <div style={caja}>
            <div style={etiqueta}>Resultado por periodo</div>
            <Tabla cab={CAB_CARTERA} filas={filasCartera(resultado.periodos)} />
            <div data-prueba="criterio" style={{ fontSize: TAM, marginTop: 6 }}>{textoCriterio(resultado.clas || {}, 'cartera')}</div>
            <div style={{ marginTop: 10 }}><Tabla cab={CAB_CARTERA_REF} filas={filasCarteraRef(resultado.periodos)} /></div>
          </div>
          {pVer && (<div style={caja}>
            <div style={etiqueta}>Ciclos · {periodoCartera(pVer)}</div>
            {pVer.tablaCiclos?.length ? <Tabla cab={CAB_CICLOS} filas={filasCiclos(pVer)} /> : <div style={{ fontSize: TAM, color: GRIS }}>Ningún ciclo en este periodo.</div>}
          </div>)}
          {pVer && (<details style={caja}>
            <summary style={{ ...etiqueta, cursor: 'pointer', marginBottom: 0 }}>Impuestos (estimación) · {periodoCartera(pVer)}</summary>
            <div style={{ marginTop: 8 }}>{pVer.impuestos?.plusvaliasPorAnio?.length ? <Tabla cab={CAB_IMPUESTOS} filas={filasImpuestos(pVer)} /> : <div style={{ fontSize: TAM, color: GRIS }}>Sin plusvalías realizadas.</div>}</div>
            <div style={{ fontSize: TAM, marginTop: 6 }}>{resumenImpuestos(pVer)}</div>
            <div style={{ fontSize: TAM, color: GRIS, marginTop: 6 }}>{NOTA_IMPUESTOS}</div>
          </details>)}
          <div style={caja} data-prueba="calibracion">
            <div style={etiqueta}>Calibración de esta variante</div>
            {!resultado.clas?.oficial ? <div style={{ fontSize: TAM, color: GRIS }}>Exploratoria: no tiene calibración propia.</div> : calR ? <Tabla cab={CAB_CAL_CARTERA} filas={[filaCalibracionCartera(calR)]} /> : <div style={{ fontSize: TAM, color: AMBAR }}>Sin calibración: el azar no da veredicto.</div>}
            <div style={{ fontSize: TAM, color: GRIS, marginTop: 6 }}>La misma variante sobre QQQ sintéticos sin ninguna ventaja posible (paseos aleatorios con la deriva y la volatilidad del QQQ real; ETF construidos a diario con su coste). Si el percentil del total sale 95 o más en más del 10 % de ellos, el azar no la juzga bien. Fíjate también en «supera a QQQ sin ventaja»: el apalancamiento solo, con un mercado que sube, ya bate al QQQ muchas veces.</div>
          </div>
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
          </ul>
        </div>
        <div style={caja} data-prueba="historial">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}><span style={etiqueta}>Historial de carteras</span><button onClick={recarga} disabled={registro.cargando} style={boton}>↻ Actualizar</button></div>
          {!registro.historial.length ? <div style={{ fontSize: TAM, color: GRIS }}>{registro.cargando ? 'Leyendo…' : 'Todavía no hay pruebas de cartera registradas.'}</div> : (
            <div style={{ overflowX: 'auto' }}><table style={{ borderCollapse: 'collapse', fontSize: TAM }}>
              <thead><tr>{['Fecha', 'Regla', 'Tipo', 'Criterio', 'Veredicto', ''].map((c, i) => <th key={i} style={{ textAlign: 'left', padding: '3px 8px', color: GRIS, fontWeight: 400, borderBottom: '1px solid var(--border)' }}>{c}</th>)}</tr></thead>
              <tbody>{registro.historial.filter(h => esConfigCartera(h.config)).map(h => (<tr key={h.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '3px 8px', whiteSpace: 'nowrap' }}>{fmtDate(h.creado)}</td>
                <td style={{ padding: '3px 8px' }}>{reglaCarteraCorta(h.config)}</td>
                <td style={{ padding: '3px 8px', whiteSpace: 'nowrap', color: h.oficial ? 'var(--accent)' : GRIS }}>{h.oficial ? `Oficial · ${h.lote} · ${h.item_lote}` : 'Exploratoria'}</td>
                <td data-prueba="criterio-historial" style={{ padding: '3px 8px', whiteSpace: 'nowrap', color: GRIS }} title={textoCriterio({ oficial: h.oficial, lote: h.lote, item: h.item_lote }, 'cartera')}>{textoCriterio({ oficial: h.oficial, lote: h.lote, item: h.item_lote }, 'cartera', { corto: true })}</td>
                <td style={{ padding: '3px 8px', color: COLOR_VEREDICTO[h.veredicto] || 'var(--text)' }}>{h.veredicto || '—'}</td>
                <td style={{ padding: '3px 8px', whiteSpace: 'nowrap' }}><button onClick={() => verPrueba(h.id)} style={{ ...boton, padding: '1px 6px' }}>Ver</button>{' '}<button onClick={() => setUi(uiDe(h.config))} title="Poner esta regla en el constructor" style={{ ...boton, padding: '1px 6px' }}>↑</button></td>
              </tr>))}</tbody>
            </table></div>)}
        </div>
      </div>
    </div>
  )
}
