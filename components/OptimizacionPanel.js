// components/OptimizacionPanel.js — la pantalla «Optimización».
//
// Configuración (estrategia que declara run.parametros, activos, condiciones y rejilla) → lanzamiento por tandas
// a /api/optimiza (un activo × hasta 300 combinaciones por petición, de 4 en 4, como el ranking) → resultados
// agregados sobre todos los activos (lib/optimizacion.js). NO escribe nada en la base de datos. La
// configuración se recuerda en el navegador; los resultados, no (todavía).
import { useState, useEffect, useMemo, useRef } from 'react'
import { MONO, fmt, numeroEs, textoEs } from '../lib/utils'
import { esquemaDeCodigo } from '../lib/parametrosEstrategia'
import { generaRejilla, rejillaSugerida } from '../lib/rejillaParametros'
import { periodoPorDefecto, estimaOptimizacion, divideEnPeticiones, agregaOptimizacion, ordenaFilas, claveCombinacion,
         CONCURRENCIA, MIN_TOTAL, MIN_POR_ACTIVO } from '../lib/optimizacion'
import { COMISIONES_DEFECTO } from '../lib/comisiones'
import { temporalidadDeEstrategia } from '../lib/condicionesSimulacion'

const CLAVE_LS = 'v50_optimizacion'
const leeGuardado = () => { try { return JSON.parse(localStorage.getItem(CLAVE_LS) || '{}') || {} } catch (_) { return {} } }
const parseaParams = (p) => { try { return typeof p === 'string' ? JSON.parse(p || '{}') : (p || {}) } catch (_) { return {} } }
const pct = (v, dec = 2) => v == null ? '—' : fmt(v, dec, ' %')
const num = (v, dec = 2) => v == null ? '—' : fmt(v, dec)

// La rejilla de la pantalla (textos editables) a partir de la declaración: la sugerida ya rellena.
function rejillaInicial(esquema, guardados) {
  const sug = rejillaSugerida(esquema), ui = {}
  for (const p of esquema.lista) {
    if (p.tipo === 'entero' || p.tipo === 'decimal') {
      const s = sug[p.nombre] || { min: guardados[p.nombre] ?? p.defecto, max: guardados[p.nombre] ?? p.defecto, paso: p.paso }
      ui[p.nombre] = { desde: textoEs(s.min, 6), hasta: textoEs(s.max, 6), paso: textoEs(s.paso, 6) }
    } else ui[p.nombre] = { valores: [...(sug[p.nombre] || [p.defecto])] }
  }
  return ui
}
// De los textos de la pantalla a la rejilla de lib/rejillaParametros.js.
function rejillaDeUi(esquema, ui) {
  const r = {}
  for (const p of esquema.lista) {
    const u = ui?.[p.nombre]
    if (!u) continue
    if (p.tipo === 'entero' || p.tipo === 'decimal') r[p.nombre] = { min: numeroEs(u.desde), max: numeroEs(u.hasta), paso: numeroEs(u.paso) }
    else r[p.nombre] = u.valores || []
  }
  return r
}

const caja = { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 6, padding: '10px 12px', marginBottom: 10 }
const etiqueta = { fontFamily: MONO, fontSize: 10, color: 'var(--text3)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }
const entrada = { background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontFamily: MONO, fontSize: 11, padding: '4px 6px' }

export default function OptimizacionPanel({ strategies = [], watchlist = [], wlLists = [], apiFetch, capitalInicial = 10000,
                                             comisionesIniciales = null, onProbar = null }) {
  const [cfg, setCfg] = useState(() => ({ estrategiaId: '', modoActivos: 'lista', listaId: '', seleccion: [], ...periodoPorDefecto(),
    capital: capitalInicial, comisiones: comisionesIniciales || { ...COMISIONES_DEFECTO }, temporalidad: '', rejillas: {}, ...leeGuardado() }))
  useEffect(() => { try { localStorage.setItem(CLAVE_LS, JSON.stringify(cfg)) } catch (_) {} }, [cfg])
  const pon = (k, v) => setCfg(c => ({ ...c, [k]: v }))

  // Estrategias: solo las que declaran run.parametros; las demás, en gris con el motivo.
  const estrategias = useMemo(() => (strategies || []).filter(s => s.code_js).map(s => {
    const esquema = esquemaDeCodigo(s.code_js)
    return { s, esquema: esquema?.lista?.length ? esquema : null, motivo: esquema?.lista?.length ? null : 'no declara sus parámetros (run.parametros)' }
  }).sort((a, b) => (a.esquema ? 0 : 1) - (b.esquema ? 0 : 1) || String(a.s.name).localeCompare(String(b.s.name))), [strategies])
  const est = estrategias.find(e => e.s.id === cfg.estrategiaId && e.esquema) || null
  const guardados = useMemo(() => est ? parseaParams(est.s.params) : {}, [est])
  const rejillaUi = est ? (cfg.rejillas[est.s.id] || rejillaInicial(est.esquema, guardados)) : null
  const ponRejilla = (nombre, valor) => setCfg(c => ({ ...c, rejillas: { ...c.rejillas, [est.s.id]: { ...rejillaUi, [nombre]: valor } } }))
  const gen = useMemo(() => est ? generaRejilla(est.esquema, rejillaDeUi(est.esquema, rejillaUi), { base: guardados, max: 100000 }) : null, [est, rejillaUi, guardados])

  // Activos.
  const activosWl = (watchlist || []).filter(w => w.active !== false)
  const activos = cfg.modoActivos === 'todos' ? activosWl.map(w => w.symbol)
    : cfg.modoActivos === 'lista' ? activosWl.filter(w => (w.list_ids || []).includes(cfg.listaId)).map(w => w.symbol)
    : (cfg.seleccion || []).filter(s => activosWl.some(w => w.symbol === s))
  const estimacion = gen?.combinaciones.length && activos.length ? estimaOptimizacion(gen.combinaciones.length, activos.length) : null
  const temporalidad = cfg.temporalidad || (est ? temporalidadDeEstrategia(est.s) : 'diario')
  const [filtroSel, setFiltroSel] = useState('')

  // ── Lanzamiento por tandas ──
  const [ejec, setEjec] = useState(null)        // { hechas, total, parando }
  const [res, setRes] = useState(null)          // { combos, valores, porActivo, … } — solo en memoria
  const pararRef = useRef(false)
  const lanzar = async () => {
    if (!est || !gen?.combinaciones.length || !activos.length || ejec) return
    const combos = gen.combinaciones
    const tareas = activos.flatMap(sym => divideEnPeticiones(combos).map(t => ({ sym, ...t })))
    const porActivo = Object.fromEntries(activos.map(s => [s, new Array(combos.length).fill(null)]))
    const condiciones = { estrategia: est.s.id, intervalo: temporalidad, desde: cfg.desde, hasta: cfg.hasta, capitalIni: Number(cfg.capital) || 10000, comisiones: cfg.comisiones, filtros: [] }
    pararRef.current = false
    setEjec({ hechas: 0, total: tareas.length, parando: false })
    setRes({ combos, valores: gen.valores, porActivo, nombre: est.s.name, estrategiaId: est.s.id, guardados, condiciones, activos: [...activos], terminado: false, interrumpida: false })
    let hechas = 0, interrumpida = false
    for (let i = 0; i < tareas.length; i += CONCURRENCIA) {
      await Promise.all(tareas.slice(i, i + CONCURRENCIA).map(async t => {
        try {
          const r = await apiFetch('/api/optimiza', { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...condiciones, simbolo: t.sym, combinaciones: t.combinaciones }) })
          const j = await r.json().catch(() => null)
          if (r.ok && Array.isArray(j?.resultados)) j.resultados.forEach((x, k) => { porActivo[t.sym][t.desde + k] = x })
          else t.combinaciones.forEach((_, k) => { porActivo[t.sym][t.desde + k] = { status: r.status, error: j?.errores?.join(' ') || j?.error || `HTTP ${r.status}` } })
        } catch (e) { t.combinaciones.forEach((_, k) => { porActivo[t.sym][t.desde + k] = { status: 0, error: e?.message || 'error de red' } }) }
        hechas++
      }))
      setEjec(e => e && ({ ...e, hechas }))
      setRes(r => r && ({ ...r, porActivo: { ...porActivo } }))
      if (pararRef.current) { interrumpida = i + CONCURRENCIA < tareas.length; break }
    }
    setRes(r => r && ({ ...r, porActivo: { ...porActivo }, terminado: true, interrumpida }))
    setEjec(null)
  }

  return (
    <div style={{ display: 'flex', flex: 1, minHeight: 0, height: '100%', overflow: 'hidden', fontFamily: MONO, color: 'var(--text)' }}>
      {/* ── Configuración ── */}
      <div style={{ width: 360, flexShrink: 0, overflowY: 'auto', padding: 12, borderRight: '1px solid var(--border)' }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>🎯 Optimización</div>

        <div style={caja}>
          <div style={etiqueta}>Estrategia</div>
          <select value={cfg.estrategiaId} onChange={e => pon('estrategiaId', e.target.value)} style={{ ...entrada, width: '100%' }}>
            <option value="">Elige una estrategia…</option>
            {estrategias.map(e => (
              <option key={e.s.id} value={e.s.id} disabled={!e.esquema} style={{ color: e.esquema ? undefined : '#5a7a95' }}>
                {e.s.name}{e.esquema ? '' : ' — ' + e.motivo}
              </option>))}
          </select>
          {est && <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 6 }}>{est.esquema.lista.length} parámetros declarados · temporalidad de la estrategia: {temporalidadDeEstrategia(est.s)}</div>}
        </div>

        <div style={caja}>
          <div style={etiqueta}>Activos</div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
            {[['lista', 'Una lista'], ['todos', 'Toda la watchlist'], ['seleccion', 'Selección']].map(([v, t]) => (
              <button key={v} onClick={() => pon('modoActivos', v)} style={{ ...entrada, cursor: 'pointer', background: cfg.modoActivos === v ? 'var(--bg3)' : 'var(--bg)', color: cfg.modoActivos === v ? 'var(--accent)' : 'var(--text3)' }}>{t}</button>))}
          </div>
          {cfg.modoActivos === 'lista' && (
            <select value={cfg.listaId} onChange={e => pon('listaId', e.target.value)} style={{ ...entrada, width: '100%' }}>
              <option value="">Elige una lista…</option>
              {(wlLists || []).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>)}
          {cfg.modoActivos === 'seleccion' && (<>
            <input placeholder="Buscar…" value={filtroSel} onChange={e => setFiltroSel(e.target.value)} style={{ ...entrada, width: '100%', marginBottom: 4 }} />
            <div style={{ maxHeight: 160, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 4, padding: 4 }}>
              {activosWl.filter(w => !filtroSel || w.symbol.toLowerCase().includes(filtroSel.toLowerCase())).map(w => (
                <label key={w.symbol} style={{ display: 'flex', gap: 6, fontSize: 11, cursor: 'pointer' }}>
                  <input type="checkbox" checked={(cfg.seleccion || []).includes(w.symbol)}
                    onChange={e => pon('seleccion', e.target.checked ? [...(cfg.seleccion || []), w.symbol] : (cfg.seleccion || []).filter(s => s !== w.symbol))} />
                  {w.symbol}
                </label>))}
            </div></>)}
          <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 6 }}>{activos.length} activos</div>
        </div>

        <div style={caja}>
          <div style={etiqueta}>Condiciones</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 10 }}>
            <label>Desde<input type="date" value={cfg.desde} onChange={e => pon('desde', e.target.value)} style={{ ...entrada, width: '100%' }} /></label>
            <label>Hasta<input type="date" value={cfg.hasta} onChange={e => pon('hasta', e.target.value)} style={{ ...entrada, width: '100%' }} /></label>
            <label>Capital (€)<input type="text" inputMode="decimal" defaultValue={textoEs(cfg.capital, 2)} key={'cap' + cfg.capital}
              onBlur={e => { const n = numeroEs(e.target.value); if (n > 0) pon('capital', n) }} style={{ ...entrada, width: '100%' }} /></label>
            <label>Temporalidad<select value={cfg.temporalidad} onChange={e => pon('temporalidad', e.target.value)} style={{ ...entrada, width: '100%' }}>
              <option value="">La de la estrategia{est ? ` (${temporalidadDeEstrategia(est.s)})` : ''}</option>
              <option value="diario">Diario</option><option value="semanal">Semanal</option></select></label>
            {[['compra', 'Comisión compra (€)'], ['venta', 'Comisión venta (€)'], ['porcentaje', 'Comisión (%)']].map(([k, t]) => (
              <label key={k}>{t}<input type="text" inputMode="decimal" defaultValue={textoEs(cfg.comisiones?.[k] ?? 0, 4)} key={k + (cfg.comisiones?.[k] ?? 0)}
                onBlur={e => { const n = numeroEs(e.target.value); if (n != null && n >= 0) pon('comisiones', { ...cfg.comisiones, [k]: n }) }} style={{ ...entrada, width: '100%' }} /></label>))}
          </div>
          <button onClick={() => setCfg(c => ({ ...c, ...periodoPorDefecto() }))} style={{ ...entrada, marginTop: 6, cursor: 'pointer', fontSize: 10 }}>Últimos 5 años completos</button>
        </div>

        {est && (
          <div style={caja}>
            <div style={etiqueta}>Rejilla</div>
            {est.esquema.lista.map(p => {
              const u = rejillaUi[p.nombre]
              return (
                <div key={p.nombre} style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 11, color: 'var(--text)' }} title={p.descripcion || ''}>{p.nombre}
                    <span style={{ color: 'var(--text3)', fontSize: 10 }}> · guardado: {String(guardados[p.nombre] ?? p.defecto)}</span></div>
                  {(p.tipo === 'entero' || p.tipo === 'decimal') ? (
                    <div style={{ display: 'flex', gap: 4, fontSize: 10, alignItems: 'center' }}>
                      {['desde', 'hasta', 'paso'].map(k => (
                        <label key={k} style={{ flex: 1 }}>{k}<input type="text" inputMode="decimal" value={u[k]} onChange={e => ponRejilla(p.nombre, { ...u, [k]: e.target.value })}
                          style={{ ...entrada, width: '100%' }} /></label>))}
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: 10, fontSize: 11, flexWrap: 'wrap' }}>
                      {(p.tipo === 'sino' ? [true, false] : p.opciones).map(v => (
                        <label key={String(v)} style={{ cursor: 'pointer' }}>
                          <input type="checkbox" checked={(u.valores || []).includes(v)}
                            onChange={e => ponRejilla(p.nombre, { valores: e.target.checked ? [...(u.valores || []), v] : (u.valores || []).filter(x => x !== v) })} />
                          {' '}{p.tipo === 'sino' ? (v ? 'sí' : 'no') : v}
                        </label>))}
                    </div>)}
                </div>)
            })}
            <button onClick={() => setCfg(c => { const r = { ...c.rejillas }; delete r[est.s.id]; return { ...c, rejillas: r } })} style={{ ...entrada, cursor: 'pointer', fontSize: 10 }}>Volver a la rejilla sugerida</button>
            <div style={{ fontSize: 11, marginTop: 8 }}>
              {gen.errores.length
                ? <span style={{ color: '#ff4d6d' }}>{gen.errores.join(' ')}</span>
                : <>{gen.combinaciones.length.toLocaleString('es-ES')} combinaciones
                    {gen.porRestriccion ? <span style={{ color: 'var(--text3)' }}> ({gen.total.toLocaleString('es-ES')} − {gen.porRestriccion.toLocaleString('es-ES')} que no cumplen las restricciones)</span> : null}</>}
            </div>
          </div>)}

        {estimacion && (
          <div style={caja}>
            <div style={etiqueta}>Antes de lanzar</div>
            <div style={{ fontSize: 11, lineHeight: 1.6 }}>
              {gen.combinaciones.length.toLocaleString('es-ES')} combinaciones × {activos.length} activos = <b>{estimacion.backtests.toLocaleString('es-ES')}</b> backtests<br />
              {estimacion.peticiones.toLocaleString('es-ES')} peticiones de hasta 300, de {CONCURRENCIA} en {CONCURRENCIA}<br />
              Tiempo estimado: ~{estimacion.segundos < 90 ? `${Math.round(estimacion.segundos)} s` : `${Math.round(estimacion.segundos / 60)} min`}
            </div>
            {estimacion.avisos.length > 0 && <div style={{ fontSize: 10, color: '#ffd166', marginTop: 6 }}>⚠ Es grande: {estimacion.avisos.join('; ')}. Considera menos activos o una rejilla más gruesa.</div>}
          </div>)}

        <button onClick={lanzar} disabled={!est || !gen?.combinaciones.length || !activos.length || !!ejec || !(cfg.desde < cfg.hasta)}
          style={{ width: '100%', padding: '9px 0', borderRadius: 6, border: 'none', fontFamily: MONO, fontWeight: 700, cursor: 'pointer',
            background: !est || !gen?.combinaciones.length || !activos.length || ejec ? 'var(--bg3)' : 'var(--accent)', color: !est || !gen?.combinaciones.length || !activos.length || ejec ? 'var(--text3)' : '#080c14' }}>
          {ejec ? 'Optimizando…' : '▶ Lanzar optimización'}
        </button>
        {ejec && (
          <div style={{ marginTop: 8 }}>
            <div style={{ height: 6, background: 'var(--bg3)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ width: `${Math.round(ejec.hechas / ejec.total * 100)}%`, height: '100%', background: 'var(--accent)', transition: 'width 0.2s' }} />
            </div>
            <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>{ejec.hechas} de {ejec.total} peticiones</div>
            <button onClick={() => { pararRef.current = true; setEjec(e => e && ({ ...e, parando: true })) }} disabled={ejec.parando}
              style={{ ...entrada, marginTop: 6, cursor: 'pointer', width: '100%' }}>{ejec.parando ? 'Se detendrá al terminar la tanda…' : '■ Detener al terminar la tanda'}</button>
          </div>)}
        <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 8, lineHeight: 1.5 }}>No se guarda nada en la base de datos. La configuración se recuerda en este navegador.</div>
      </div>

      {/* ── Resultados ── */}
      <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: 12 }}>
        {!res && <div style={{ color: 'var(--text3)', fontSize: 12, marginTop: 40, textAlign: 'center' }}>Elige estrategia, activos y rejilla, y lanza la optimización.</div>}
        {res && <ResultadosOptimizacion res={res} onProbar={onProbar} />}
      </div>
    </div>
  )
}

// Los resultados de una optimización (res: combos, valores, porActivo, condiciones…). Aparte de la pantalla para
// poder montarlos con resultados ya hechos (y comprobarlos).
export function ResultadosOptimizacion({ res, onProbar = null, seleccionInicial = null }) {
  // ── Resultados ──
  const [orden, setOrden] = useState({ col: 'cagrMediana', desc: true })
  const [seleccionada, setSeleccionada] = useState(seleccionInicial)
  const [verTodas, setVerTodas] = useState(false)
  const filas = useMemo(() => res ? agregaOptimizacion(res.combos, res.porActivo) : [], [res])
  const ordenadas = useMemo(() => ordenaFilas(filas, orden.col, orden.desc), [filas, orden])
  const cuentan = ordenadas.filter(f => f.cuenta), apartadas = ordenadas.filter(f => !f.cuenta)
  const variados = res ? Object.keys(res.valores).filter(k => res.valores[k].length > 1) : []
  const claveActual = res ? claveCombinacion(Object.fromEntries(Object.keys(res.valores).map(k => [k, res.guardados[k] ?? res.combos[0]?.[k]]))) : null
  const filaSel = filas.find(f => f.indice === seleccionada) || null
  const COLS = [['cagrMediana', 'CAGR mediana', (v) => pct(v)], ['cagrMedia', 'CAGR media', (v) => pct(v)], ['ddMediana', 'DD mediana', (v) => pct(v)], ['ddPeor', 'DD peor', (v) => pct(v)],
    ['operaciones', 'Ops.', (v) => num(v, 0)], ['activosPositivos', 'Activos +', (v, f) => `${v}/${f.activos}`], ['factorBeneficio', 'F. benef.', (v) => num(v)],
    ['tiempoInvertido', 'T. invert.', (v) => pct(v, 0)]]
  const textoParams = (p) => (variados.length ? variados : Object.keys(p)).map(k => `${k} ${typeof p[k] === 'number' ? textoEs(p[k], 6) : p[k] === true ? 'sí' : p[k] === false ? 'no' : p[k]}`).join(' · ')

  return (<>
          <div style={{ ...caja, borderColor: 'rgba(255,209,102,0.5)', background: 'rgba(255,209,102,0.08)', fontSize: 11, lineHeight: 1.6, position: 'sticky', top: 0, zIndex: 2 }}>
            ⚠ <b>Resultados dentro de muestra.</b> La mejor combinación se ha elegido mirando estos mismos datos, así que tenderá a parecer
            mejor de lo que será. La validación fuera de muestra es la siguiente fase.
          </div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 8 }}>
            {res.nombre} · {res.condiciones.intervalo} · {res.condiciones.desde} → {res.condiciones.hasta} · {res.activos.length} activos · {res.combos.length.toLocaleString('es-ES')} combinaciones
            {res.interrumpida ? ' · DETENIDA: resultados parciales' : res.terminado ? '' : ' · en curso…'}
            {' · '}cuenta una combinación con al menos {MIN_TOTAL} operaciones en total y {MIN_POR_ACTIVO} en cada activo · ★ = la configuración guardada
          </div>
          <TablaFilas filas={verTodas ? cuentan : cuentan.slice(0, 100)} COLS={COLS} orden={orden} setOrden={setOrden} textoParams={textoParams}
            claveActual={claveActual} seleccionada={seleccionada} setSeleccionada={setSeleccionada} />
          {cuentan.length > 100 && <button onClick={() => setVerTodas(v => !v)} style={{ ...entrada, cursor: 'pointer', margin: '6px 0' }}>{verTodas ? 'Ver solo las 100 primeras' : `Ver las ${cuentan.length}`}</button>}
          {apartadas.length > 0 && (<>
            <div style={{ ...etiqueta, marginTop: 14 }}>Apartadas ({apartadas.length}): no llegan al mínimo de operaciones o no tienen resultado</div>
            <div style={{ opacity: 0.55 }}>
              <TablaFilas filas={apartadas.slice(0, 50)} COLS={COLS} orden={orden} setOrden={setOrden} textoParams={textoParams}
                claveActual={claveActual} seleccionada={seleccionada} setSeleccionada={setSeleccionada} conMotivo />
            </div></>)}
          {filaSel && <DetalleSeleccion fila={filaSel} filas={filas} res={res} textoParams={textoParams} onProbar={onProbar} />}
  </>)
}

function TablaFilas({ filas, COLS, orden, setOrden, textoParams, claveActual, seleccionada, setSeleccionada, conMotivo = false }) {
  const th = { position: 'sticky', top: 0, background: 'var(--bg2)', padding: '5px 6px', textAlign: 'right', cursor: 'pointer', whiteSpace: 'nowrap', fontWeight: 400, color: 'var(--text3)' }
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
      <thead><tr>
        <th style={{ ...th, textAlign: 'left', cursor: 'default' }}>Combinación</th>
        {COLS.map(([k, t]) => (
          <th key={k} style={{ ...th, color: orden.col === k ? 'var(--accent)' : th.color }}
            onClick={() => setOrden(o => ({ col: k, desc: o.col === k ? !o.desc : true }))}>{t}{orden.col === k ? (orden.desc ? ' ▼' : ' ▲') : ''}</th>))}
        {conMotivo && <th style={{ ...th, textAlign: 'left', cursor: 'default' }}>Motivo</th>}
      </tr></thead>
      <tbody>
        {filas.map(f => (
          <tr key={f.indice} onClick={() => setSeleccionada(f.indice)}
            style={{ cursor: 'pointer', background: seleccionada === f.indice ? 'var(--bg3)' : 'transparent', borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '4px 6px', whiteSpace: 'nowrap' }}>{claveCombinacion(f.params) === claveActual ? '★ ' : ''}{textoParams(f.params)}</td>
            {COLS.map(([k, , formato]) => <td key={k} style={{ padding: '4px 6px', textAlign: 'right', whiteSpace: 'nowrap' }}>{formato(f[k], f)}</td>)}
            {conMotivo && <td style={{ padding: '4px 6px', color: 'var(--text3)' }}>{f.motivo}</td>}
          </tr>))}
      </tbody>
    </table>
  )
}

// La combinación seleccionada: por ahora, su resultado por activo. (El mapa de colores, la estabilidad y
// «Probar en backtest» llegan en los commits siguientes.)
function DetalleSeleccion({ fila, textoParams }) {
  return (
    <div style={{ ...caja, marginTop: 14 }}>
      <div style={etiqueta}>Combinación seleccionada</div>
      <div style={{ fontSize: 11, marginBottom: 6 }}>{textoParams(fila.params)}</div>
      <table style={{ borderCollapse: 'collapse', fontSize: 11 }}>
        <thead><tr>{['Activo', 'CAGR', 'DD', 'Ops.', 'F. benef.', 'Beneficio'].map(t => <th key={t} style={{ padding: '3px 8px', color: 'var(--text3)', fontWeight: 400, textAlign: 'right' }}>{t}</th>)}</tr></thead>
        <tbody>{Object.entries(fila.porActivo).map(([sym, m]) => (
          <tr key={sym}><td style={{ padding: '3px 8px' }}>{sym}</td><td style={{ padding: '3px 8px', textAlign: 'right' }}>{pct(m.cagr)}</td>
            <td style={{ padding: '3px 8px', textAlign: 'right' }}>{pct(m.maxDD)}</td><td style={{ padding: '3px 8px', textAlign: 'right' }}>{m.operaciones}</td>
            <td style={{ padding: '3px 8px', textAlign: 'right' }}>{num(m.factorBeneficio)}</td><td style={{ padding: '3px 8px', textAlign: 'right' }}>{num(m.beneficioSimple)} €</td></tr>))}
        </tbody>
      </table>
      {fila.errores.length > 0 && <div style={{ fontSize: 10, color: '#ff4d6d', marginTop: 6 }}>Sin resultado: {fila.errores.map(e => `${e.sym} (${e.error})`).join(' · ')}</div>}
    </div>
  )
}
