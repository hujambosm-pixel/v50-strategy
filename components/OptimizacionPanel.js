// components/OptimizacionPanel.js — la pantalla «Optimización».
//
// Configuración (estrategia que declara run.parametros, activos, condiciones y rejilla) → lanzamiento por tandas
// a /api/optimiza (un activo × hasta 300 combinaciones por petición, de 4 en 4, como el ranking) → resultados
// agregados sobre todos los activos (lib/optimizacion.js). NO escribe nada en la base de datos. La
// configuración se recuerda en el navegador; los resultados, no (todavía).
import { useState, useEffect, useMemo, useRef } from 'react'
import { MONO, fmt, fmtDate, numeroEs, textoEs } from '../lib/utils'
import CampoFecha from './CampoFecha'
import { esquemaDeCodigo } from '../lib/parametrosEstrategia'
import { generaRejilla, rejillaSugerida, valoresDeRango } from '../lib/rejillaParametros'
import { periodoPorDefecto, estimaOptimizacion, divideEnPeticiones, agregaOptimizacion, ordenaFilas, claveCombinacion, mapaColores, estabilidad,
         pruebaDeFila, activosCalculados, NOMBRES_CAGR, cagrDeMetricas, serieUnParametro, TEMPORALIDADES_COMPARAR, agregaPorTemporalidad,
         porActivoUnido, resumenTemporalidad, mediana, CONCURRENCIA, MIN_TOTAL, MIN_POR_ACTIVO } from '../lib/optimizacion'
import { COMISIONES_DEFECTO } from '../lib/comisiones'
import { temporalidadDeEstrategia } from '../lib/condicionesSimulacion'

const CLAVE_LS = 'v50_optimizacion'
const leeGuardado = () => { try { return JSON.parse(localStorage.getItem(CLAVE_LS) || '{}') || {} } catch (_) { return {} } }
const parseaParams = (p) => { try { return typeof p === 'string' ? JSON.parse(p || '{}') : (p || {}) } catch (_) { return {} } }
const pct = (v, dec = 2) => v == null ? '—' : fmt(v, dec, ' %')
const num = (v, dec = 2) => v == null ? '—' : fmt(v, dec)
// Texto secundario de esta pantalla: legible (--text-legible en styles/globals.css, ≥ 6,6:1 sobre sus fondos)
// y nunca por debajo de 12 px.
const GRIS = 'var(--text-legible)'
const TAM = 12

// La rejilla de la pantalla (textos editables) a partir de la declaración: la sugerida ya rellena, y con el
// valor GUARDADO de cada parámetro siempre dentro aunque no caiga en el paso (si no, nunca se probaría y no
// habría ★ con la que comparar). Se puede quitar a mano; entonces se avisa junto al parámetro.
function rejillaInicial(esquema, guardados) {
  const sug = rejillaSugerida(esquema), ui = {}
  for (const p of esquema.lista) {
    if (p.tipo === 'entero' || p.tipo === 'decimal') {
      const s = sug[p.nombre] || { min: guardados[p.nombre] ?? p.defecto, max: guardados[p.nombre] ?? p.defecto, paso: p.paso }
      ui[p.nombre] = { desde: textoEs(s.min, 6), hasta: textoEs(s.max, 6), paso: textoEs(s.paso, 6), conGuardado: true }
    } else {
      const g = guardados[p.nombre] ?? p.defecto, v = [...(sug[p.nombre] || [p.defecto])]
      ui[p.nombre] = { valores: v.includes(g) ? v : [...v, g] }
    }
  }
  return ui
}
const rangoDeUi = (u) => ({ min: numeroEs(u.desde), max: numeroEs(u.hasta), paso: numeroEs(u.paso) })
const enRango = (u, g) => (valoresDeRango(rangoDeUi(u)) || []).includes(g)
// De los textos de la pantalla a la rejilla de lib/rejillaParametros.js. En los numéricos, el valor guardado se
// añade a la lista del rango (salvo que se haya quitado: conGuardado === false).
function rejillaDeUi(esquema, ui, guardados = {}) {
  const r = {}
  for (const p of esquema.lista) {
    const u = ui?.[p.nombre]
    if (!u) continue
    if (p.tipo === 'entero' || p.tipo === 'decimal') {
      const rango = rangoDeUi(u), lista = valoresDeRango(rango), g = guardados[p.nombre] ?? p.defecto
      r[p.nombre] = lista && u.conGuardado !== false && typeof g === 'number' && !lista.includes(g) ? [...lista, g].sort((a, b) => a - b) : rango
    }
    else r[p.nombre] = u.valores || []
  }
  return r
}

const caja = { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 6, padding: '10px 12px', marginBottom: 10 }
const etiqueta = { fontFamily: MONO, fontSize: TAM, color: GRIS, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }
const entrada = { background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontFamily: MONO, fontSize: TAM, padding: '4px 6px' }

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
  const gen = useMemo(() => est ? generaRejilla(est.esquema, rejillaDeUi(est.esquema, rejillaUi, guardados), { base: guardados, max: 100000 }) : null, [est, rejillaUi, guardados])

  // Activos.
  const activosWl = (watchlist || []).filter(w => w.active !== false)
  const activos = cfg.modoActivos === 'todos' ? activosWl.map(w => w.symbol)
    : cfg.modoActivos === 'lista' ? activosWl.filter(w => (w.list_ids || []).includes(cfg.listaId)).map(w => w.symbol)
    : (cfg.seleccion || []).filter(s => activosWl.some(w => w.symbol === s))
  // «Comparar diario y semanal»: la misma rejilla en las dos temporalidades.
  const comparar = cfg.temporalidad === 'comparar'
  const temporalidad = comparar ? TEMPORALIDADES_COMPARAR.join(' y ') : (cfg.temporalidad || (est ? temporalidadDeEstrategia(est.s) : 'diario'))
  const temporalidades = comparar ? TEMPORALIDADES_COMPARAR : [temporalidad]
  const estimacion = gen?.combinaciones.length && activos.length ? estimaOptimizacion(gen.combinaciones.length, activos.length, temporalidades.length) : null
  const [filtroSel, setFiltroSel] = useState('')
  // Lo escrito en Desde / Hasta es una fecha posible (CampoFecha); si no, no se deja lanzar.
  const [fechaOk, setFechaOk] = useState({ desde: true, hasta: true })
  const fechasOk = fechaOk.desde && fechaOk.hasta

  // ── Lanzamiento por tandas ──
  const [ejec, setEjec] = useState(null)        // { hechas, total, parando }
  const [res, setRes] = useState(null)          // { combos, valores, porActivo, … } — solo en memoria
  const [fin, setFin] = useState(null)          // el aviso final: se queda hasta el siguiente lanzamiento
  const [ahora, setAhora] = useState(0)         // reloj del tiempo transcurrido, cada segundo mientras corre
  useEffect(() => { if (!ejec) return; const id = setInterval(() => setAhora(Date.now()), 1000); return () => clearInterval(id) }, [!!ejec])
  const pararRef = useRef(false)
  const lanzar = async () => {
    if (!est || !gen?.combinaciones.length || !activos.length || ejec) return
    const combos = gen.combinaciones
    // Con «Comparar», la misma rejilla en cada temporalidad: cada tarea lleva la suya.
    const tareas = temporalidades.flatMap(tp => activos.flatMap(sym => divideEnPeticiones(combos).map(t => ({ tp, sym, ...t }))))
    const porTemporalidad = Object.fromEntries(temporalidades.map(tp => [tp, {
      porActivo: Object.fromEntries(activos.map(s => [s, new Array(combos.length).fill(null)])),
      calentamientos: new Array(combos.length).fill(null) }]))   // el común de cada petición, para «Probar en backtest»
    const { porActivo, calentamientos } = porTemporalidad[temporalidades[0]]
    const condiciones = { estrategia: est.s.id, intervalo: temporalidad, desde: cfg.desde, hasta: cfg.hasta, capitalIni: Number(cfg.capital) || 10000, comisiones: cfg.comisiones, filtros: [] }
    pararRef.current = false
    const inicio = Date.now()
    setFin(null); setAhora(inicio)
    setEjec({ hechas: 0, total: tareas.length, parando: false, inicio, enCurso: [] })
    setRes({ combos, valores: gen.valores, porActivo, calentamientos, nombre: est.s.name, estrategiaId: est.s.id, guardados, condiciones, activos: [...activos], terminado: false, interrumpida: false,
      ...(comparar ? { comparar: true, temporalidades: [...temporalidades], porTemporalidad } : {}) })
    let hechas = 0, interrumpida = false
    for (let i = 0; i < tareas.length; i += CONCURRENCIA) {
      const tanda = tareas.slice(i, i + CONCURRENCIA)
      setEjec(e => e && ({ ...e, enCurso: [...new Set(tanda.map(t => comparar ? `${t.sym} (${t.tp})` : t.sym))] }))
      await Promise.all(tanda.map(async t => {
        try {
          const r = await apiFetch('/api/optimiza', { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...condiciones, ...(comparar ? { intervalo: t.tp } : {}), simbolo: t.sym, combinaciones: t.combinaciones }) })
          const j = await r.json().catch(() => null)
          const dest = porTemporalidad[t.tp]
          if (r.ok && Array.isArray(j?.resultados)) j.resultados.forEach((x, k) => { dest.porActivo[t.sym][t.desde + k] = x; dest.calentamientos[t.desde + k] = j.calentamiento ?? null })
          else t.combinaciones.forEach((_, k) => { dest.porActivo[t.sym][t.desde + k] = { status: r.status, error: j?.errores?.join(' ') || j?.error || `HTTP ${r.status}` } })
        } catch (e) { t.combinaciones.forEach((_, k) => { porTemporalidad[t.tp].porActivo[t.sym][t.desde + k] = { status: 0, error: e?.message || 'error de red' } }) }
        hechas++
      }))
      setEjec(e => e && ({ ...e, hechas }))
      setRes(r => r && ({ ...r, porActivo: { ...porActivo } }))
      if (pararRef.current) { interrumpida = i + CONCURRENCIA < tareas.length; break }
    }
    setRes(r => r && ({ ...r, porActivo: { ...porActivo }, terminado: true, interrumpida }))
    setFin({ ms: Date.now() - inicio, combinaciones: combos.length, activos: activos.length, interrumpida, hechas, total: tareas.length,
      calculados: activosCalculados(activos, comparar ? porActivoUnido({ comparar, temporalidades, porTemporalidad, activos }) : porActivo) })
    setEjec(null)
  }

  const puedeLanzar = !!(est && gen?.combinaciones.length && activos.length && !ejec && fechasOk && cfg.desde < cfg.hasta)

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
              <option key={e.s.id} value={e.s.id} disabled={!e.esquema} style={{ color: e.esquema ? undefined : GRIS }}>
                {e.s.name}{e.esquema ? '' : ' — ' + e.motivo}
              </option>))}
          </select>
          {est && <div style={{ fontSize: TAM, color: GRIS, marginTop: 6 }}>{est.esquema.lista.length} parámetros declarados · temporalidad de la estrategia: {temporalidadDeEstrategia(est.s)}</div>}
        </div>

        <div style={caja}>
          <div style={etiqueta}>Activos</div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
            {[['lista', 'Una lista'], ['todos', 'Toda la watchlist'], ['seleccion', 'Selección']].map(([v, t]) => (
              <button key={v} onClick={() => pon('modoActivos', v)} style={{ ...entrada, cursor: 'pointer', background: cfg.modoActivos === v ? 'var(--bg3)' : 'var(--bg)', color: cfg.modoActivos === v ? 'var(--accent)' : GRIS }}>{t}</button>))}
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
                <label key={w.symbol} style={{ display: 'flex', gap: 6, fontSize: TAM, cursor: 'pointer' }}>
                  <input type="checkbox" checked={(cfg.seleccion || []).includes(w.symbol)}
                    onChange={e => pon('seleccion', e.target.checked ? [...(cfg.seleccion || []), w.symbol] : (cfg.seleccion || []).filter(s => s !== w.symbol))} />
                  {w.symbol}
                </label>))}
            </div></>)}
          <div style={{ fontSize: TAM, color: GRIS, marginTop: 6 }}>{activos.length} activos</div>
        </div>

        <div style={caja}>
          <div style={etiqueta}>Condiciones</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: TAM }}>
            <label>Desde<CampoFecha valor={cfg.desde} onCambio={v => pon('desde', v)} onValidez={v => setFechaOk(o => ({ ...o, desde: v }))}
              style={{ ...entrada, width: '100%' }} avisoStyle={{ fontSize: TAM }} /></label>
            <label>Hasta<CampoFecha valor={cfg.hasta} onCambio={v => pon('hasta', v)} onValidez={v => setFechaOk(o => ({ ...o, hasta: v }))}
              style={{ ...entrada, width: '100%' }} avisoStyle={{ fontSize: TAM }} /></label>
            {fechasOk && !(cfg.desde < cfg.hasta) && <div style={{ gridColumn: '1 / -1', color: '#ff4d6d' }}>«Desde» tiene que ser anterior a «Hasta».</div>}
            <label>Capital (€)<input type="text" inputMode="decimal" defaultValue={textoEs(cfg.capital, 2)} key={'cap' + cfg.capital}
              onBlur={e => { const n = numeroEs(e.target.value); if (n > 0) pon('capital', n) }} style={{ ...entrada, width: '100%' }} /></label>
            <label>Temporalidad<select value={cfg.temporalidad} onChange={e => pon('temporalidad', e.target.value)} style={{ ...entrada, width: '100%' }}>
              <option value="">La de la estrategia{est ? ` (${temporalidadDeEstrategia(est.s)})` : ''}</option>
              <option value="diario">Diario</option><option value="semanal">Semanal</option>
              <option value="comparar">Comparar diario y semanal</option></select></label>
            {[['compra', 'Comisión compra (€)'], ['venta', 'Comisión venta (€)'], ['porcentaje', 'Comisión (%)']].map(([k, t]) => (
              <label key={k}>{t}<input type="text" inputMode="decimal" defaultValue={textoEs(cfg.comisiones?.[k] ?? 0, 4)} key={k + (cfg.comisiones?.[k] ?? 0)}
                onBlur={e => { const n = numeroEs(e.target.value); if (n != null && n >= 0) pon('comisiones', { ...cfg.comisiones, [k]: n }) }} style={{ ...entrada, width: '100%' }} /></label>))}
          </div>
          <button onClick={() => setCfg(c => ({ ...c, ...periodoPorDefecto() }))} style={{ ...entrada, marginTop: 6, cursor: 'pointer', fontSize: TAM }}>Últimos 5 años completos</button>
        </div>

        {est && (
          <div style={caja}>
            <div style={etiqueta}>Rejilla</div>
            {est.esquema.lista.map(p => {
              const u = rejillaUi[p.nombre], g = guardados[p.nombre] ?? p.defecto
              return (
                <div key={p.nombre} style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: TAM, color: 'var(--text)' }} title={p.descripcion || ''}>{p.nombre}
                    <span style={{ color: GRIS, fontSize: TAM }}> · guardado: {String(guardados[p.nombre] ?? p.defecto)}</span></div>
                  {(p.tipo === 'entero' || p.tipo === 'decimal') ? (
                    <div style={{ display: 'flex', gap: 4, fontSize: TAM, alignItems: 'center' }}>
                      {['desde', 'hasta', 'paso'].map(k => (
                        <label key={k} style={{ flex: 1 }}>{k}<input type="text" inputMode="decimal" value={u[k]} onChange={e => ponRejilla(p.nombre, { ...u, [k]: e.target.value })}
                          style={{ ...entrada, width: '100%' }} /></label>))}
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: 10, fontSize: TAM, flexWrap: 'wrap' }}>
                      {(p.tipo === 'sino' ? [true, false] : p.opciones).map(v => (
                        <label key={String(v)} style={{ cursor: 'pointer' }}>
                          <input type="checkbox" checked={(u.valores || []).includes(v)}
                            onChange={e => ponRejilla(p.nombre, { valores: e.target.checked ? [...(u.valores || []), v] : (u.valores || []).filter(x => x !== v) })} />
                          {' '}{p.tipo === 'sino' ? (v ? 'sí' : 'no') : v}
                        </label>))}
                    </div>)}
                  {(p.tipo === 'entero' || p.tipo === 'decimal') && u.desde != null && !enRango(u, g) && (
                    <label style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 6, fontSize: TAM, color: GRIS, marginTop: 4, cursor: 'pointer' }}>
                      <input type="checkbox" checked={u.conGuardado !== false} onChange={e => ponRejilla(p.nombre, { ...u, conGuardado: e.target.checked })} />
                      añadir el guardado ({textoValor(g)}), que no cae en el paso</label>)}
                  {!gen.errores.length && gen.valores[p.nombre] && !gen.valores[p.nombre].includes(g) && (
                    <div style={{ fontSize: TAM, color: '#ffd166', marginTop: 4 }}>⚠ El valor guardado ({textoValor(g)}) no se prueba: no habrá ★ con la que comparar.</div>)}
                </div>)
            })}
            <button onClick={() => setCfg(c => { const r = { ...c.rejillas }; delete r[est.s.id]; return { ...c, rejillas: r } })} style={{ ...entrada, cursor: 'pointer', fontSize: TAM }}>Volver a la rejilla sugerida</button>
            <div style={{ fontSize: TAM, marginTop: 8 }}>
              {gen.errores.length
                ? <span style={{ color: '#ff4d6d' }}>{gen.errores.join(' ')}</span>
                : <>{gen.combinaciones.length.toLocaleString('es-ES')} combinaciones
                    {gen.porRestriccion ? <span style={{ color: GRIS }}> ({gen.total.toLocaleString('es-ES')} − {gen.porRestriccion.toLocaleString('es-ES')} que no cumplen las restricciones)</span> : null}</>}
            </div>
          </div>)}

        {estimacion && (
          <div style={caja}>
            <div style={etiqueta}>Antes de lanzar</div>
            <div style={{ fontSize: TAM, lineHeight: 1.6 }}>
              {gen.combinaciones.length.toLocaleString('es-ES')} combinaciones × {activos.length}{comparar ? ' activos × 2 temporalidades = ' : ' activos = '}<b>{estimacion.backtests.toLocaleString('es-ES')}</b> backtests<br />
              {estimacion.peticiones.toLocaleString('es-ES')} peticiones de hasta 300, de {CONCURRENCIA} en {CONCURRENCIA}<br />
              Tiempo estimado: ~{estimacion.segundos < 90 ? `${Math.round(estimacion.segundos)} s` : `${Math.round(estimacion.segundos / 60)} min`}
            </div>
            {estimacion.avisos.length > 0 && <div style={{ fontSize: TAM, color: '#ffd166', marginTop: 6 }}>⚠ Es grande: {estimacion.avisos.join('; ')}. Considera menos activos o una rejilla más gruesa.</div>}
          </div>)}

        <button onClick={lanzar} disabled={!puedeLanzar}
          style={{ width: '100%', padding: '9px 0', borderRadius: 6, border: 'none', fontFamily: MONO, fontWeight: 700, cursor: puedeLanzar ? 'pointer' : 'not-allowed',
            background: puedeLanzar ? 'var(--accent)' : 'var(--bg3)', color: puedeLanzar ? '#080c14' : GRIS }}>
          {ejec ? 'Optimizando…' : '▶ Lanzar optimización'}
        </button>
        <div style={{ fontSize: TAM, color: GRIS, marginTop: 8, lineHeight: 1.5 }}>No se guarda nada en la base de datos. La configuración se recuerda en este navegador.</div>
      </div>

      {/* ── Resultados ── */}
      <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: 12 }}>
        {!res && <div style={{ color: GRIS, fontSize: 12, marginTop: 40, textAlign: 'center' }}>Elige estrategia, activos y rejilla, y lanza la optimización.</div>}
        {res && <ResultadosOptimizacion res={res} onProbar={onProbar}
          estado={<EstadoEjecucion ejec={ejec} fin={fin} ahora={ahora} onDetener={() => { pararRef.current = true; setEjec(e => e && ({ ...e, parando: true })) }} />} />}
      </div>
    </div>
  )
}

const duracion = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return s < 90 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s` }
// Mientras corre: barra, peticiones hechas / total, activo(s) en curso y tiempo transcurrido. Al terminar: un aviso
// que se queda hasta el siguiente lanzamiento («terminada» o «detenida»). Aparte para poder montarlo.
export function EstadoEjecucion({ ejec, fin, ahora, onDetener }) {
  if (ejec) {
    const hecho = ejec.total ? Math.round(ejec.hechas / ejec.total * 100) : 0
    return (
      <div role="status" style={{ ...caja, marginTop: 8, borderColor: 'rgba(0,212,255,0.45)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: TAM, marginBottom: 6 }}>
          <b>Optimizando… {hecho} %</b><span style={{ color: GRIS }}>{duracion(ahora - ejec.inicio)}</span></div>
        <div style={{ height: 8, background: 'var(--bg3)', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ width: `${hecho}%`, height: '100%', background: 'var(--accent)', transition: 'width 0.2s' }} /></div>
        <div style={{ fontSize: TAM, color: GRIS, marginTop: 6, lineHeight: 1.6 }}>
          {ejec.hechas.toLocaleString('es-ES')} de {ejec.total.toLocaleString('es-ES')} peticiones<br />
          En curso: {ejec.enCurso?.length ? ejec.enCurso.join(', ') : '—'}<br />
          Tiempo transcurrido: {duracion(ahora - ejec.inicio)}
        </div>
        <button onClick={onDetener} disabled={ejec.parando}
          style={{ ...entrada, marginTop: 8, cursor: ejec.parando ? 'not-allowed' : 'pointer', width: '100%' }}>{ejec.parando ? 'Se detendrá al terminar la tanda…' : '■ Detener al terminar la tanda'}</button>
      </div>)
  }
  if (!fin) return null
  const color = fin.interrumpida ? '255,209,102' : '0,229,160'
  return (
    <div role="status" style={{ ...caja, marginTop: 8, fontSize: TAM, lineHeight: 1.6, borderColor: `rgba(${color},0.6)`, background: `rgba(${color},0.08)` }}>
      {fin.interrumpida
        ? <>■ <b>Detenida tras {duracion(fin.ms)}</b> · {fin.hechas.toLocaleString('es-ES')} de {fin.total.toLocaleString('es-ES')} peticiones · resultados parciales de {fin.combinaciones.toLocaleString('es-ES')} combinaciones × {fin.activos} activos
          {fin.calculados ? <> · <b>{fin.calculados.sinCalcular} {fin.calculados.sinCalcular === 1 ? 'activo' : 'activos'} sin calcular</b>{fin.calculados.aMedias ? ` (${fin.calculados.aMedias} a medias)` : ''}</> : null}</>
        : <>✓ <b>Optimización terminada en {duracion(fin.ms)}</b> · {fin.combinaciones.toLocaleString('es-ES')} combinaciones × {fin.activos} activos</>}
    </div>)
}

// Los resultados de una optimización (res: combos, valores, porActivo, condiciones…). Aparte de la pantalla para
// poder montarlos con resultados ya hechos (y comprobarlos).
// `estado`: el progreso de la ejecución o el aviso de terminada/detenida, arriba, junto a los avisos.
export function ResultadosOptimizacion({ res, onProbar = null, seleccionInicial = null, estado = null }) {
  // ── Resultados ──
  const [orden, setOrden] = useState({ col: 'cagrMediana', desc: true })
  const [seleccionada, setSeleccionada] = useState(seleccionInicial)
  const [verTodas, setVerTodas] = useState(false)
  // El CAGR que manda en la tabla, el mapa, la estabilidad y el desglose (ver lib/optimizacion.js).
  const [tipoCagr, setTipoCagr] = useState('simple')
  const nombreCagr = NOMBRES_CAGR[tipoCagr], metricas = metricasDe(tipoCagr)
  const filas = useMemo(() => agregaPorTemporalidad(res, { cagr: tipoCagr }), [res, tipoCagr])
  // Comparando temporalidades: la tabla se puede filtrar por una, y el mapa (o el gráfico) enseña una.
  const [filtroTp, setFiltroTp] = useState('')
  const [tpMapa, setTpMapa] = useState(res?.temporalidades?.[0] || null)
  const tpVista = res?.comparar ? (res.temporalidades.includes(tpMapa) ? tpMapa : res.temporalidades[0]) : null
  const filasMapa = res?.comparar ? filas.filter(f => f.temporalidad === tpVista) : filas
  const ordenadas = useMemo(() => ordenaFilas(filtroTp ? filas.filter(f => f.temporalidad === filtroTp) : filas, orden.col, orden.desc), [filas, orden, filtroTp])
  const cuentan = ordenadas.filter(f => f.cuenta), apartadas = ordenadas.filter(f => !f.cuenta)
  const variados = res ? Object.keys(res.valores).filter(k => res.valores[k].length > 1) : []
  const claveActual = res ? claveCombinacion(Object.fromEntries(Object.keys(res.valores).map(k => [k, res.guardados[k] ?? res.combos[0]?.[k]]))) : null
  const filaSel = filas.find(f => f.indice === seleccionada) || null
  const calc = activosCalculados(res.activos, porActivoUnido(res))
  // Pulsar una fila de la tabla (que está al final) lleva al bloque de la combinación seleccionada, bajo el
  // mapa; pulsar una celda del mapa no desplaza: el bloque ya está justo debajo.
  // Y el mapa fija los parámetros que no están en los ejes con los de esa fila, para que su celda se vea marcada.
  const detalleRef = useRef(null), desplazar = useRef(false)
  const [fijarMapa, setFijarMapa] = useState(null)
  const seleccionaDesdeTabla = (i) => {
    desplazar.current = true; setSeleccionada(i)
    const f = filas.find(x => x.indice === i)
    if (f) setFijarMapa({ params: f.params, n: (fijarMapa?.n || 0) + 1 })
    if (f?.temporalidad) setTpMapa(f.temporalidad)
  }
  useEffect(() => {
    if (!desplazar.current) return
    desplazar.current = false
    detalleRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
  }, [seleccionada])
  // Al terminar, si no hay ninguna seleccionada, la configuración guardada (★): su estabilidad y su desglose
  // salen directamente bajo el mapa.
  useEffect(() => {
    if (!res.terminado || seleccionada != null) return
    const guardada = filasMapa.find(f => claveCombinacion(f.params) === claveActual)
    if (guardada) setSeleccionada(guardada.indice)
  }, [res.terminado, filas])
  const COLS = [['cagrMediana', `${nombreCagr} · mediana`, (v) => pct(v)], ['cagrMedia', `${nombreCagr} · media`, (v) => pct(v)], ['ddMediana', 'DD mediana', (v) => pct(v)], ['ddPeor', 'DD peor', (v) => pct(v)],
    ['operaciones', 'Ops.', (v) => num(v, 0)], ['activosPositivos', 'Activos +', (v, f) => `${v}/${f.activos}`], ['factorBeneficio', 'F. benef.', (v) => num(v)],
    ['tiempoInvertido', 'T. invert.', (v) => pct(v, 0)]]
  const textoParams = (p) => (variados.length ? variados : Object.keys(p)).map(k => `${k} ${typeof p[k] === 'number' ? textoEs(p[k], 6) : p[k] === true ? 'sí' : p[k] === false ? 'no' : p[k]}`).join(' · ')

  return (<>
          <div style={{ ...caja, borderColor: 'rgba(255,209,102,0.5)', background: 'rgba(255,209,102,0.08)', fontSize: TAM, lineHeight: 1.6, position: 'sticky', top: 0, zIndex: 2 }}>
            ⚠ <b>Resultados dentro de muestra.</b> La mejor combinación se ha elegido mirando estos mismos datos, así que tenderá a parecer
            mejor de lo que será. La validación fuera de muestra es la siguiente fase.
          </div>
          {estado}
          {!res.terminado && (
            <div role="status" style={{ ...caja, borderColor: GRIS, borderStyle: 'dashed', color: GRIS, fontSize: TAM, lineHeight: 1.6 }}>
              ⏳ <b>Resultados parciales: {calc.completos} de {calc.total} activos calculados — pueden cambiar.</b> La tabla, el mapa, la estabilidad y el
              desglose por activo se rehacen con cada tanda; las cifras definitivas, al terminar.
            </div>)}
          <div style={{ fontSize: TAM, color: GRIS, marginBottom: 8 }}>
            {res.nombre} · {res.condiciones.intervalo} · {fmtDate(res.condiciones.desde)} → {fmtDate(res.condiciones.hasta)} · {res.activos.length} activos · {res.combos.length.toLocaleString('es-ES')} combinaciones
            {res.interrumpida ? ` · DETENIDA: resultados parciales, ${calc.completos} de ${calc.total} activos calculados y ${calc.sinCalcular} sin calcular${calc.aMedias ? ` (${calc.aMedias} a medias)` : ''}`
              : res.terminado ? '' : ' · en curso…'}
            {' · '}cuenta una combinación con al menos {MIN_TOTAL} operaciones en total y {MIN_POR_ACTIVO} en cada activo · ★ = la configuración guardada
          </div>
          <div style={{ ...caja, display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <label style={{ flexDirection: 'row', alignItems: 'center', gap: 6, fontSize: TAM, color: GRIS, whiteSpace: 'nowrap' }}>Métrica principal
              <select value={tipoCagr} onChange={e => setTipoCagr(e.target.value)} style={entrada}>
                <option value="simple">CAGR simple (sin reinvertir)</option>
                <option value="compuesto">CAGR compuesto (reinvirtiendo)</option></select></label>
            <div style={{ flex: 1, minWidth: 260, fontSize: TAM, color: GRIS, lineHeight: 1.5 }}>
              <b>Simple</b>: cada operación con el capital inicial, sin reinvertir lo ganado (como el ranking). <b>Compuesto</b>: reinvirtiendo
              todo (como el resumen del backtest y el multibacktest); sale mucho más alto en activos que suben fuerte. Para comparar parámetros
              entre sí es mejor el simple: mide la ventaja de cada operación sin que el interés compuesto amplifique la suerte de la secuencia.
            </div>
          </div>
          {res.comparar && <ResumenTemporalidades res={res} filas={filas} claveActual={claveActual} metricas={metricas} textoParams={textoParams}
            onSelecciona={(f) => seleccionaDesdeTabla(f.indice)} />}
          {res.comparar && (
            <label style={{ flexDirection: 'row', alignItems: 'center', gap: 6, fontSize: TAM, color: GRIS, marginTop: 4 }}>Temporalidad del {variados.length === 1 ? 'gráfico' : 'mapa'}
              <select value={tpVista || ''} onChange={e => setTpMapa(e.target.value)} style={entrada}>
                {res.temporalidades.map(tp => <option key={tp} value={tp}>{tp}</option>)}</select></label>)}
          {/* Orden: mapa → la combinación seleccionada (estabilidad, año a año, desglose, probar) → tabla. */}
          <MapaDeColores filas={filasMapa} res={res} variados={variados} claveActual={claveActual} seleccionada={seleccionada} setSeleccionada={setSeleccionada} filaSel={filaSel}
            textoParams={textoParams} fijarCon={fijarMapa} metricas={metricas} />
          <div ref={detalleRef} style={{ scrollMarginTop: 96 }}>
            {filaSel && <DetalleSeleccion fila={filaSel} filas={filaSel.temporalidad ? filas.filter(f => f.temporalidad === filaSel.temporalidad) : filas} res={res} textoParams={textoParams} onProbar={onProbar} metricas={metricas} tipoCagr={tipoCagr} />}
          </div>
          {res.comparar && (
            <label style={{ flexDirection: 'row', alignItems: 'center', gap: 6, fontSize: TAM, color: GRIS, margin: '10px 0 4px' }}>Filtrar la tabla por temporalidad
              <select value={filtroTp} onChange={e => setFiltroTp(e.target.value)} style={entrada}>
                <option value="">Todas</option>{res.temporalidades.map(tp => <option key={tp} value={tp}>{tp}</option>)}</select></label>)}
          <TablaFilas filas={verTodas ? cuentan : cuentan.slice(0, 100)} COLS={COLS} orden={orden} setOrden={setOrden} textoParams={textoParams} conTemporalidad={!!res.comparar}
            claveActual={claveActual} seleccionada={seleccionada} setSeleccionada={seleccionaDesdeTabla} />
          {cuentan.length > 100 && <button onClick={() => setVerTodas(v => !v)} style={{ ...entrada, cursor: 'pointer', margin: '6px 0' }}>{verTodas ? 'Ver solo las 100 primeras' : `Ver las ${cuentan.length}`}</button>}
          {apartadas.length > 0 && (<>
            <div style={{ ...etiqueta, marginTop: 14 }}>Apartadas ({apartadas.length}): no llegan al mínimo de operaciones o no tienen resultado</div>
            <div style={{ opacity: 0.55 }}>
              <TablaFilas filas={apartadas.slice(0, 50)} COLS={COLS} orden={orden} setOrden={setOrden} textoParams={textoParams} conTemporalidad={!!res.comparar}
                claveActual={claveActual} seleccionada={seleccionada} setSeleccionada={seleccionaDesdeTabla} conMotivo />
            </div></>)}
  </>)
}

// Métricas del mapa de colores y de la estabilidad: [clave, título, formato, ¿mejor cuanto más alta?].
const METRICAS = [['cagrMediana', 'CAGR mediana', (v) => pct(v), true], ['cagrMedia', 'CAGR media', (v) => pct(v), true],
  ['ddMediana', 'DD mediana', (v) => pct(v), false], ['ddPeor', 'DD peor', (v) => pct(v), false],
  ['factorBeneficio', 'F. benef.', (v) => num(v), true], ['operaciones', 'Ops.', (v) => num(v, 0), true]]
// Las mismas, con el rótulo del CAGR elegido («CAGR simple · mediana»).
const metricasDe = (tipo) => METRICAS.map(([k, t, f, b]) => [k, k === 'cagrMediana' ? `${NOMBRES_CAGR[tipo]} · mediana` : k === 'cagrMedia' ? `${NOMBRES_CAGR[tipo]} · media` : t, f, b])
const textoValor = (v) => typeof v === 'number' ? textoEs(v, 6) : v === true ? 'sí' : v === false ? 'no' : String(v)
// Rojo (peor) → amarillo → verde (mejor), con t de 0 a 1.
const colorEscala = (t) => `hsl(${Math.round(120 * Math.min(1, Math.max(0, t)))}, 55%, 30%)`

// (b) Mapa de colores: dos parámetros en los ejes, el resto fijados (por defecto en la configuración guardada).
// Cada celda ES la fila de la tabla de esa combinación (mismas cifras); pulsarla la selecciona.
function MapaDeColores({ filas, res, variados, claveActual, seleccionada, setSeleccionada, filaSel, textoParams, fijarCon = null, metricas = METRICAS }) {
  const [ejes, setEjes] = useState({ x: variados[0], y: variados[1] })
  const [metrica, setMetrica] = useState('cagrMediana')
  const [fijosElegidos, setFijosElegidos] = useState({})
  // Una fila pulsada en la tabla: los parámetros fuera de los ejes, con sus valores (como «Fijar como…»).
  useEffect(() => { if (fijarCon) setFijosElegidos({ ...fijarCon.params }) }, [fijarCon?.n])
  // Un solo parámetro variado: un gráfico de línea en lugar del mapa.
  if (variados.length === 1) return (
    <GraficoUnParametro filas={filas} res={res} param={variados[0]} claveActual={claveActual} seleccionada={seleccionada}
      setSeleccionada={setSeleccionada} textoParams={textoParams} metricas={metricas} />)
  if (variados.length < 1) return (
    <div style={{ ...caja, marginTop: 14, fontSize: TAM, color: GRIS }}>Mapa de colores: hace falta variar al menos un parámetro en la rejilla.</div>)
  const ejeX = variados.includes(ejes.x) ? ejes.x : variados[0]
  const ejeY = variados.includes(ejes.y) && ejes.y !== ejeX ? ejes.y : variados.find(k => k !== ejeX)
  // Los demás parámetros, fijados: lo elegido, o el valor guardado si está en la rejilla, o el primero.
  const fijos = {}
  for (const k of Object.keys(res.valores)) {
    if (k === ejeX || k === ejeY) continue
    const lista = res.valores[k]
    fijos[k] = fijosElegidos[k] !== undefined && lista.includes(fijosElegidos[k]) ? fijosElegidos[k]
      : lista.includes(res.guardados[k]) ? res.guardados[k] : lista[0]
  }
  const mapa = mapaColores(filas, res.valores, { ejeX, ejeY, fijos })
  const [, tituloM, formatoM, masEsMejor] = metricas.find(m => m[0] === metrica)
  const enEscala = mapa.celdas.flat().filter(c => c && c.cuenta && c[metrica] != null).map(c => c[metrica])
  const lo = Math.min(...enEscala), hi = Math.max(...enEscala)
  const t = (v) => hi > lo ? (masEsMejor ? (v - lo) / (hi - lo) : (hi - v) / (hi - lo)) : 0.5
  const guardadaEnRejilla = filas.some(f => claveCombinacion(f.params) === claveActual)
  const celda = { padding: '4px 6px', textAlign: 'center', whiteSpace: 'nowrap', fontSize: TAM, minWidth: 54 }
  return (
    <div style={{ ...caja, marginTop: 14 }}>
      <div style={etiqueta}>Mapa de colores</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: TAM, marginBottom: 8, alignItems: 'center' }}>
        <label>Eje X <select value={ejeX} onChange={e => setEjes({ x: e.target.value, y: e.target.value === ejeY ? ejeX : ejeY })} style={entrada}>
          {variados.map(k => <option key={k} value={k}>{k}</option>)}</select></label>
        <label>Eje Y <select value={ejeY} onChange={e => setEjes({ y: e.target.value, x: e.target.value === ejeX ? ejeY : ejeX })} style={entrada}>
          {variados.map(k => <option key={k} value={k}>{k}</option>)}</select></label>
        <label>Color <select value={metrica} onChange={e => setMetrica(e.target.value)} style={entrada}>
          {metricas.map(([k, tt]) => <option key={k} value={k}>{tt}</option>)}</select></label>
        {Object.keys(fijos).filter(k => res.valores[k].length > 1).map(k => (
          <label key={k}>{k} <select value={String(fijos[k])} style={entrada}
            onChange={e => setFijosElegidos(f => ({ ...f, [k]: res.valores[k].find(v => String(v) === e.target.value) }))}>
            {res.valores[k].map(v => <option key={String(v)} value={String(v)}>{textoValor(v)}{v === res.guardados[k] ? ' ★' : ''}</option>)}</select></label>))}
        {/* «Volver a la seleccionada»: solo si su celda no se ve (los desplegables no tienen sus valores). */}
        {filaSel && Object.keys(fijos).some(k => fijos[k] !== filaSel.params[k]) && (
          <button title="Pone los parámetros que no están en los ejes con los valores de la combinación seleccionada, para verla en el mapa"
            onClick={() => setFijosElegidos(Object.fromEntries(Object.keys(fijos).map(k => [k, filaSel.params[k]])))}
            style={{ ...entrada, cursor: 'pointer', color: GRIS, fontSize: TAM }}>↺ Volver a la seleccionada</button>)}
        <button title="Selecciona la configuración guardada de la estrategia y muestra su zona en el mapa"
          onClick={() => {
            const guardada = filas.find(f => claveCombinacion(f.params) === claveActual)
            if (guardada) setSeleccionada(guardada.indice)
            setFijosElegidos(Object.fromEntries(Object.keys(fijos).map(k => [k, res.guardados[k] ?? fijos[k]])))
          }}
          style={{ ...entrada, cursor: 'pointer', color: GRIS, fontSize: TAM }}>★ Ver mi configuración guardada</button>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'separate', borderSpacing: 2 }}>
          <thead><tr>
            <th style={{ ...celda, color: GRIS, fontWeight: 400 }}>{ejeY} ↓ · {ejeX} →</th>
            {mapa.xs.map(x => <th key={String(x)} style={{ ...celda, color: GRIS, fontWeight: 400 }}>{textoValor(x)}</th>)}
          </tr></thead>
          <tbody>{mapa.ys.map((y, j) => (
            <tr key={String(y)}>
              <th style={{ ...celda, color: GRIS, fontWeight: 400, textAlign: 'right' }}>{textoValor(y)}</th>
              {mapa.xs.map((x, i) => {
                const c = mapa.celdas[j][i]
                if (!c) return <td key={String(x)} style={{ ...celda, color: GRIS }} title="Combinación no probada (no está en la rejilla o no cumple las restricciones)">·</td>
                const actual = claveCombinacion(c.params) === claveActual
                return (
                  <td key={String(x)} onClick={() => setSeleccionada(c.indice)}
                    title={`${textoParams(c.params)} — ${tituloM} ${formatoM(c[metrica])}${c.cuenta ? '' : ` — apartada: ${c.motivo}`}`}
                    style={{ ...celda, cursor: 'pointer', color: '#e8eef5', borderRadius: 3,
                      background: c.cuenta && c[metrica] != null ? colorEscala(t(c[metrica])) : 'var(--bg3)', opacity: c.cuenta ? 1 : 0.5,
                      outline: seleccionada === c.indice ? '2px solid var(--accent)' : actual ? '2px solid #ffd166' : 'none' }}>
                    {actual ? '★ ' : ''}{formatoM(c[metrica])}
                  </td>)
              })}
            </tr>))}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: TAM, color: GRIS, marginTop: 6 }}>
        Verde = mejor {tituloM} entre las celdas que cuentan; en gris, las apartadas. ★ (borde amarillo) = la configuración guardada
        {guardadaEnRejilla ? '' : ' — no está en esta rejilla'}. Pulsa una celda para seleccionarla.
      </div>
    </div>
  )
}

// Gráfico de un parámetro: el parámetro en el eje X y la métrica principal (mediana, línea continua; media, línea
// discontinua) en el eje Y. Cada punto ES la fila de la tabla; las apartadas, atenuadas; la guardada, con ★.
// Pulsar un punto la selecciona (estabilidad, año a año y desglose debajo, como con el mapa).
function GraficoUnParametro({ filas, res, param, claveActual, seleccionada, setSeleccionada, textoParams, metricas }) {
  const serie = serieUnParametro(filas, res.valores, param).filter(p => p.fila)
  const [, tMed] = metricas.find(m => m[0] === 'cagrMediana'), [, tMedia] = metricas.find(m => m[0] === 'cagrMedia')
  const W = 640, H = 250, L = 64, Rm = 16, T = 22, B = 36
  const numerico = serie.every(p => typeof p.x === 'number')
  const xs = serie.map(p => p.x), x0 = numerico ? Math.min(...xs) : 0, x1 = numerico ? Math.max(...xs) : Math.max(serie.length - 1, 1)
  const px = (p, i) => L + ((numerico ? p.x : i) - x0) / ((x1 - x0) || 1) * (W - L - Rm)
  const ys = serie.flatMap(p => [p.fila.cagrMediana, p.fila.cagrMedia]).filter(v => v != null)
  let y0 = Math.min(0, ...ys), y1 = Math.max(0, ...ys)
  if (y1 === y0) { y0 -= 1; y1 += 1 }
  const pad = (y1 - y0) * 0.06; y0 -= pad; y1 += pad
  const py = (v) => T + (y1 - v) / (y1 - y0) * (H - T - B)
  const linea = (k) => serie.filter(p => p.fila[k] != null).map((p) => `${px(p, serie.indexOf(p)).toFixed(1)},${py(p.fila[k]).toFixed(1)}`).join(' ')
  const ticksY = Array.from({ length: 5 }, (_, i) => y0 + (y1 - y0) * i / 4)
  const cadaX = Math.max(1, Math.ceil(serie.length / 16))
  const texto = { fill: GRIS, fontSize: TAM, fontFamily: MONO }
  const guardada = filas.find(f => claveCombinacion(f.params) === claveActual)
  return (
    <div style={{ ...caja, marginTop: 14 }}>
      <div style={etiqueta}>Gráfico por {param} (solo varía este parámetro)</div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', fontSize: TAM, color: GRIS, marginBottom: 6 }}>
        <span><span style={{ color: 'var(--accent)' }}>━</span> {tMed}</span>
        <span><span style={{ color: '#ffd166' }}>╌</span> {tMedia}</span>
        <span>● atenuado = apartada</span><span style={{ color: '#ffd166' }}>★</span><span style={{ marginLeft: -10 }}>= configuración guardada</span>
        <button title="Selecciona la configuración guardada de la estrategia" disabled={!guardada} onClick={() => guardada && setSeleccionada(guardada.indice)}
          style={{ ...entrada, cursor: guardada ? 'pointer' : 'not-allowed', color: GRIS, fontSize: TAM }}>★ Ver mi configuración guardada</button>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: 900, display: 'block' }} role="img" aria-label={`${tMed} y ${tMedia} según ${param}`}>
        {ticksY.map((v, i) => (
          <g key={i}><line x1={L} x2={W - Rm} y1={py(v)} y2={py(v)} stroke="var(--border)" strokeWidth="1" />
            <text x={L - 6} y={py(v) + 4} textAnchor="end" style={texto}>{pct(v, 1)}</text></g>))}
        {y0 < 0 && y1 > 0 && <line x1={L} x2={W - Rm} y1={py(0)} y2={py(0)} stroke={GRIS} strokeWidth="1" strokeDasharray="2 3" />}
        {serie.map((p, i) => i % cadaX === 0 || i === serie.length - 1
          ? <text key={'x' + i} x={px(p, i)} y={H - B + 18} textAnchor="middle" style={texto}>{textoValor(p.x)}</text> : null)}
        <text x={(L + W - Rm) / 2} y={H - 4} textAnchor="middle" style={texto}>{param}</text>
        <polyline points={linea('cagrMedia')} fill="none" stroke="#ffd166" strokeWidth="1.5" strokeDasharray="5 4" />
        <polyline points={linea('cagrMediana')} fill="none" stroke="var(--accent)" strokeWidth="2" />
        {serie.map((p, i) => {
          const f = p.fila, cx = px(p, i), sel = seleccionada === f.indice, actual = claveCombinacion(f.params) === claveActual
          return (
            <g key={'p' + i} onClick={() => setSeleccionada(f.indice)} style={{ cursor: 'pointer' }} opacity={f.cuenta ? 1 : 0.35}>
              <title>{`${textoParams(f.params)} — ${tMed} ${pct(f.cagrMediana)} · ${tMedia} ${pct(f.cagrMedia)}${f.cuenta ? '' : ` — apartada: ${f.motivo}`}`}</title>
              <circle cx={cx} cy={py(f.cagrMediana ?? 0)} r="11" fill="transparent" />
              {f.cagrMedia != null && <circle cx={cx} cy={py(f.cagrMedia)} r="2.5" fill="#ffd166" />}
              {f.cagrMediana != null && <circle cx={cx} cy={py(f.cagrMediana)} r={sel ? 6 : 4} fill={f.cuenta ? 'var(--accent)' : GRIS}
                stroke={sel ? '#ffffff' : 'none'} strokeWidth="2" />}
              {actual && <text x={cx} y={py(f.cagrMediana ?? 0) - 9} textAnchor="middle" style={{ fill: '#ffd166', fontSize: 14 }}>★</text>}
            </g>)
        })}
      </svg>
      <div style={{ fontSize: TAM, color: GRIS, marginTop: 4 }}>Pulsa un punto para ver esa combinación debajo.</div>
    </div>
  )
}

// Comparando temporalidades, arriba de los resultados: por temporalidad, la mejor combinación válida (métrica
// principal), su estabilidad frente a sus vecinas, la configuración guardada (★) y la mediana de las válidas.
function ResumenTemporalidades({ res, filas, claveActual, metricas, textoParams, onSelecciona }) {
  const [, tMed, fM] = metricas.find(m => m[0] === 'cagrMediana')
  const dif = (d) => d == null ? '' : ` (${d >= 0 ? '+' : '−'}${num(Math.abs(d))} puntos)`
  return (
    <div style={{ ...caja }}>
      <div style={etiqueta}>Comparación de temporalidades · {tMed}</div>
      <div style={{ fontSize: TAM, color: GRIS, lineHeight: 1.5, marginBottom: 8 }}>
        ⚠ Un mismo número de velas no abarca el mismo tiempo en cada temporalidad (20 velas semanales son unas 20 semanas; 20 diarias,
        unas 4), así que lo que se compara son las mejores zonas de cada temporalidad, no los mismos valores.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${res.temporalidades.length}, minmax(0, 1fr))`, gap: 10 }}>
        {res.temporalidades.map(tp => {
          const r = resumenTemporalidad(filas.filter(f => f.temporalidad === tp), res.valores, claveActual)
          return (
            <div key={tp} style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px', fontSize: TAM, lineHeight: 1.7 }}>
              <div style={{ fontWeight: 700, textTransform: 'capitalize', marginBottom: 2 }}>{tp}</div>
              <div><span style={{ color: GRIS }}>Mejor válida: </span>{r.mejor
                ? <button onClick={() => onSelecciona(r.mejor)} title="Seleccionarla" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--accent)', fontFamily: MONO, fontSize: TAM, textAlign: 'left' }}>
                    {textoParams(r.mejor.params)} · <b>{fM(r.mejor.cagrMediana)}</b></button> : '—'}</div>
              <div><span style={{ color: GRIS }}>Sus vecinas, de media: </span>{r.estabilidad?.vecinas.length ? <>{fM(r.estabilidad.mediaVecinas)}<span style={{ color: GRIS }}>{dif(r.estabilidad.diferencia)}</span></> : '—'}</div>
              <div><span style={{ color: GRIS }}>★ Guardada: </span>{r.guardada
                ? <button onClick={() => onSelecciona(r.guardada)} title="Seleccionarla" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--text)', fontFamily: MONO, fontSize: TAM }}>
                    {fM(r.guardada.cagrMediana)}{r.guardada.cuenta ? '' : ' (apartada)'}</button> : 'no está en la rejilla'}</div>
              <div><span style={{ color: GRIS }}>Mediana de las {r.validas} válidas: </span>{fM(r.medianaValidas)}</div>
            </div>)
        })}
      </div>
    </div>
  )
}

function TablaFilas({ filas, COLS, orden, setOrden, textoParams, claveActual, seleccionada, setSeleccionada, conMotivo = false, conTemporalidad = false }) {
  const th = { position: 'sticky', top: 0, background: 'var(--bg2)', padding: '5px 6px', textAlign: 'right', cursor: 'pointer', whiteSpace: 'nowrap', fontWeight: 400, color: GRIS }
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: TAM }}>
      <thead><tr>
        <th style={{ ...th, textAlign: 'left', cursor: 'default' }}>Combinación</th>
        {conTemporalidad && <th style={{ ...th, textAlign: 'left', cursor: 'default' }}>Temporalidad</th>}
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
            {conTemporalidad && <td style={{ padding: '4px 6px', whiteSpace: 'nowrap' }}>{f.temporalidad}</td>}
            {COLS.map(([k, , formato]) => <td key={k} style={{ padding: '4px 6px', textAlign: 'right', whiteSpace: 'nowrap' }}>{formato(f[k], f)}</td>)}
            {conMotivo && <td style={{ padding: '4px 6px', color: GRIS }}>{f.motivo}</td>}
          </tr>))}
      </tbody>
    </table>
  )
}

// La combinación seleccionada: su resultado por activo, (c) su estabilidad frente a las vecinas (un paso arriba
// y abajo en cada parámetro de la rejilla), año a año y (d) «Probar en backtest».
function DetalleSeleccion({ fila, filas, res, textoParams, onProbar, metricas = METRICAS, tipoCagr = 'simple' }) {
  const [metrica, setMetrica] = useState('cagrMediana')
  const est = estabilidad(fila, filas, res.valores, metrica)
  const [, tituloM, formatoM, masEsMejor] = metricas.find(m => m[0] === metrica)
  const dif = est.diferencia, peor = dif != null && (masEsMejor ? dif < 0 : dif > 0)
  const th = { padding: '3px 8px', color: GRIS, fontWeight: 400, textAlign: 'right' }, td = { padding: '3px 8px', textAlign: 'right' }
  return (<>
    <div style={{ ...caja, marginTop: 14 }}>
      <div style={etiqueta}>Estabilidad de la combinación seleccionada</div>
      <div style={{ fontSize: TAM, marginBottom: 6 }}>{textoParams(fila.params)}{fila.temporalidad ? ` · ${fila.temporalidad}` : ''}
        <label style={{ fontSize: TAM, marginLeft: 10 }}>Métrica <select value={metrica} onChange={e => setMetrica(e.target.value)} style={entrada}>
          {metricas.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></label></div>
      {est.vecinas.length ? (<>
        <div style={{ fontSize: TAM, lineHeight: 1.6, marginBottom: 6 }}>
          {tituloM}: la combinación <b>{formatoM(est.propia)}</b> · media de sus {est.vecinas.length} vecinas <b>{formatoM(est.mediaVecinas)}</b>
          {dif != null && <span style={{ color: peor ? '#ff4d6d' : '#06d6a0' }}> ({dif >= 0 ? '+' : '−'}{num(Math.abs(dif))}{metrica === 'factorBeneficio' || metrica === 'operaciones' ? '' : ' puntos'})</span>}
          <div style={{ fontSize: TAM, color: GRIS }}>Si las vecinas caen mucho, el resultado es un pico aislado y no una zona estable.</div>
        </div>
        <table style={{ borderCollapse: 'collapse', fontSize: TAM }}>
          <thead><tr><th style={{ ...th, textAlign: 'left' }}>Vecina</th><th style={th}>{tituloM}</th><th style={{ ...th, textAlign: 'left' }}>Cuenta</th></tr></thead>
          <tbody>{est.vecinas.map(v => (
            <tr key={v.parametro + String(v.valor)} style={{ opacity: v.fila.cuenta ? 1 : 0.55 }}>
              <td style={{ ...td, textAlign: 'left' }}>{v.parametro} {textoValor(fila.params[v.parametro])} → {textoValor(v.valor)}</td>
              <td style={td}>{formatoM(v.valorMetrica)}</td>
              <td style={{ ...td, textAlign: 'left', color: GRIS }}>{v.fila.cuenta ? 'sí' : `no: ${v.fila.motivo}`}</td></tr>))}
          </tbody>
        </table></>)
        : <div style={{ fontSize: TAM, color: GRIS }}>Sin vecinas en la rejilla (ningún parámetro tiene un valor contiguo probado).</div>}
      <div style={{ ...etiqueta, marginTop: 12 }}>Año a año (lo ganado dentro de cada año sobre el capital inicial, en cada activo)</div>
      <div style={{ fontSize: TAM, color: GRIS, marginBottom: 4, lineHeight: 1.5 }}>Las posiciones abiertas se valoran al cierre de la última vela
        de cada año (como la curva con flotante); «Ops. cerradas» son las que se cerraron ese año.</div>
      <table style={{ borderCollapse: 'collapse', fontSize: TAM }}>
        <thead><tr>{['Año', 'Mediana', 'Media', 'Ops. cerradas'].map(t => <th key={t} style={th}>{t}</th>)}</tr></thead>
        <tbody>{fila.porAnio.map(a => (
          <tr key={a.anio}><td style={td}>{a.anio}</td>
            <td style={{ ...td, color: a.mediana == null ? undefined : a.mediana >= 0 ? '#06d6a0' : '#ff4d6d' }}>{pct(a.mediana)}</td>
            <td style={td}>{pct(a.media)}</td><td style={td}>{a.operaciones}</td></tr>))}
        </tbody>
      </table>
    </div>
    <DetalleActivos fila={fila} textoParams={textoParams} tipoCagr={tipoCagr} />
    {onProbar && <ProbarEnBacktest fila={fila} res={res} textoParams={textoParams} onProbar={onProbar} />}
  </>)
}

// Desglose por activo de la combinación seleccionada, de PEOR a MEJOR según el CAGR elegido: qué activos arrastran
// la media. Enseña los dos CAGR, el simple y el compuesto.
function DetalleActivos({ fila, textoParams, tipoCagr = 'simple' }) {
  const c = (m) => { const v = cagrDeMetricas(m, tipoCagr); return v == null ? -Infinity : v <= -99 ? -100 : v }
  const orden = Object.entries(fila.porActivo).sort(([a, x], [b, y]) => c(x) - c(y) || a.localeCompare(b))
  return (
    <div style={{ ...caja, marginTop: 14 }}>
      <div style={etiqueta}>Desglose por activo (de peor a mejor {NOMBRES_CAGR[tipoCagr]})</div>
      <div style={{ fontSize: TAM, marginBottom: 6 }}>{textoParams(fila.params)}</div>
      <table style={{ borderCollapse: 'collapse', fontSize: TAM }}>
        <thead><tr>{['Activo', 'CAGR simple', 'CAGR compuesto', 'DD máx.', 'Ops.', 'F. benef.', 'Benef. simple'].map(t => <th key={t} style={{ padding: '3px 8px', color: GRIS, fontWeight: 400, textAlign: 'right' }}>{t}</th>)}</tr></thead>
        <tbody>{orden.map(([sym, m]) => (
          <tr key={sym}><td style={{ padding: '3px 8px' }}>{sym}</td><td style={{ padding: '3px 8px', textAlign: 'right' }}>{pct(m.cagr)}</td>
            <td style={{ padding: '3px 8px', textAlign: 'right' }}>{pct(m.cagrCompuesto)}</td>
            <td style={{ padding: '3px 8px', textAlign: 'right' }}>{pct(m.maxDD)}</td><td style={{ padding: '3px 8px', textAlign: 'right' }}>{m.operaciones}</td>
            <td style={{ padding: '3px 8px', textAlign: 'right' }}>{num(m.factorBeneficio)}</td><td style={{ padding: '3px 8px', textAlign: 'right' }}>{num(m.beneficioSimple)} €</td></tr>))}
        </tbody>
      </table>
      {fila.errores.length > 0 && <div style={{ fontSize: TAM, color: '#ff4d6d', marginTop: 6 }}>Sin resultado: {fila.errores.map(e => `${e.sym} (${e.error})`).join(' · ')}</div>}
    </div>
  )
}

// (d) «Probar en backtest»: abre la combinación en el backtest individual (un activo) o en el multibacktest (los
// activos de la optimización) con sus params, las mismas condiciones y el mismo calentamiento. NO guarda nada
// en la estrategia: los params viajan solo en esa petición.
function ProbarEnBacktest({ fila, res, textoParams, onProbar }) {
  const conResultado = Object.keys(fila.porActivo)
  const [elegido, setSym] = useState(conResultado[0] || '')
  const sym = conResultado.includes(elegido) ? elegido : (conResultado[0] || '')
  const prueba = { ...pruebaDeFila(res, fila), etiqueta: textoParams(fila.params) }
  const boton = { ...entrada, cursor: 'pointer', padding: '5px 10px', color: 'var(--accent)' }
  return (
    <div style={{ ...caja, marginTop: 14 }}>
      <div style={etiqueta}>Probar en backtest</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', fontSize: TAM }}>
        <select value={sym} onChange={e => setSym(e.target.value)} style={entrada}>
          {conResultado.map(s => <option key={s} value={s}>{s}</option>)}</select>
        <button disabled={!sym} onClick={() => onProbar({ ...prueba, modo: 'individual', simbolo: sym })} style={boton}>▶ Backtest individual</button>
        <button onClick={() => onProbar({ ...prueba, modo: 'multi' })} style={boton}>▶ Multibacktest ({res.activos.length} activos)</button>
      </div>
      <div style={{ fontSize: TAM, color: GRIS, marginTop: 6, lineHeight: 1.5 }}>
        Con estos params ({textoParams(fila.params)}), {fmtDate(res.condiciones.desde)} → {fmtDate(res.condiciones.hasta)}, {prueba.intervalo}, capital {textoEs(res.condiciones.capitalIni, 2)} €,
        sus comisiones, sin filtros y el calentamiento de la optimización{prueba.calentamiento != null ? ` (${prueba.calentamiento} velas)` : ''}. La estrategia guardada no cambia.
        El individual da las mismas cifras que la fila en ese activo; el multibacktest reparte el capital entre los activos, así que solo coinciden las operaciones.
      </div>
    </div>
  )
}
