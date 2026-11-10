// components/ScreenerPanel.js — la pantalla «Screener» (docs/screener.md; boceto bocetos/screener.html, diseño A «Panel +
// tabla»): pestañas de vistas arriba, el embudo, el panel de filtros a la izquierda (como el Backtesting) y la tabla a la
// derecha. Las cifras de cada empresa vienen ya calculadas de la base (lib/screener/datos.js); aquí solo se filtra y se
// ordena (lib/screener/filtros.js). No toca el motor ni ninguna cifra del resto de la app.
import { useEffect, useMemo, useRef, useState } from 'react'
import { B, S } from '../lib/builder/estilo'
import Ayuda from './BuilderAyuda'
import ConLimpiar from './LimpiarBusqueda'
import { ctxConSesion, hayConfigSupabase } from '../lib/supabase'
import { sinTildes } from '../lib/builder/buscar'
import { empresasDeFilas, fechaDatos, leerFilasEmpresas } from '../lib/screener/datos'
import { AYUDAS, FILTROS, FILTRO, evaluaVista, fmt, pasa } from '../lib/screener/filtros'
import { SECTORES_FUERA_POR_DEFECTO } from '../lib/screener/sectores'
import { VISTAS_EJEMPLO, normalizaVista, textoVista, vistaNueva } from '../lib/screener/vista'
import { borrarVista, cambiarVista, creaEjemplos, crearVista, listarVistas, nombreLimpio } from '../lib/screener/vistasBase'
import { Papelera, Pregunta } from './VentanaPregunta'
import { guardarComoLista, nombrePropuesto } from '../lib/screener/lista'

const AMARILLO = '#f2cc60', ROJO = '#ff8b8b', VERDE = '#56d364'
const copia = (x) => JSON.parse(JSON.stringify(x))
// Una pestaña de vista: { clave (local), id (de la base, null si aún no está guardada), nombre, vista, base: { nombre, vista } | null
// (lo guardado; null si es nueva) }. Con cambios = nueva, u otro nombre u otra vista que lo guardado.
let claves = 0
export const pestanaDe = (fila) => ({ clave: ++claves, id: fila.id ?? null, nombre: fila.nombre, vista: normalizaVista(fila.vista), base: fila.id != null ? { nombre: fila.nombre, vista: normalizaVista(fila.vista) } : null })
export const conCambiosDe = (p) => !p.base || nombreLimpio(p.nombre) !== p.base.nombre || textoVista(p.vista) !== textoVista(p.base.vista)
const fechaCorta = (iso) => iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '—'

// Un «?» con título, explicación y ejemplo (los textos del catálogo).
export const AyudaFiltro = ({ a, etiqueta }) => !a ? null : (
  <Ayuda etiqueta={etiqueta || a[0]} texto={<><b>{a[0]}</b><br/>{a[1]}{a[2] ? <><br/><span style={{ color: B.secundario }}>Ejemplo: {a[2]}</span></> : null}{a[3] ? <><br/><span data-recomendado style={{ color: '#56d364' }}>Recomendado: {a[3]}</span></> : null}</>}/>)

const Fuente = ({ f }) => (
  <span title={f.startsWith('Yahoo') ? 'Dato de Yahoo: solo existe el de hoy (no sirve para probar en el pasado).' : 'De dónde sale el dato'}
    style={{ fontSize: 10, padding: '0 5px', borderRadius: 4, marginLeft: 4, whiteSpace: 'nowrap',
      background: f.startsWith('Yahoo') ? '#3a3220' : '#1b2836', color: f.startsWith('Yahoo') ? AMARILLO : B.apagado }}>{f}</span>)

// El valor de una celda de la tabla para el filtro f.
export function textoCelda(e, f) {
  const x = f.v(e)
  if (x == null) return (f.sinDato && f.sinDato(e)) || '—'
  return (f.signo && x > 0 ? '+' : '') + fmt(x, f.dec ?? 1) + (f.unidad === '%' ? ' %' : f.unidad === 'M' ? ' M' : f.unidad === 'puntos' ? ' pt' : '')
}
// El valor por el que se ordena una columna (los null, siempre al final).
const valorOrden = (e, col) => {
  if (col === 'simbolo' || col === 'sector') return e[col] || ''
  if (col === 'precio') return e.precio
  if (col === 'exigido') return e.m.per
  if (col === 'esperado') return e.m.crecEsperado
  const f = FILTRO[col]; if (!f) return null
  const x = f.v(e); return x != null ? x : (f.orden ? f.orden(e) : null)
}

// inicial (para las comprobaciones, scripts/comprobaciones/screener.js): { empresas, vistas (pestañas), iv, piso, busca, verNo, orden,
// pregunta }; con inicial.empresas no se lee la base (ni las vistas). salida: la guardia de «cambios sin guardar» al salir de la
// pantalla (pages/index.js, como en Tesis): salida.current(seguir) → true si ha preguntado. onIrAValor(símbolo, pantalla): abre la ficha
// de Fundamentals ('fundamentals') o el gráfico ('watchlist') de un valor. onListaGuardada(): avisa a la app para releer la Watchlist.
// visible: la app la deja montada al ir a otra pantalla (pages/index.js) y la oculta; oculta, Esc no cierra el cajón.
export default function ScreenerPanel({ inicial = {}, salida = null, onIrAValor = null, onListaGuardada = null, visible = true }) {
  const [estado, setEstado] = useState(() => inicial.empresas ? { cargando: false, error: null, empresas: inicial.empresas } : { cargando: true, error: null, empresas: [] })
  const [vistas, setVistas] = useState(() => inicial.vistas || VISTAS_EJEMPLO.map(v => pestanaDe({ nombre: v.nombre, vista: copia(v.vista) })))
  const [vistasError, setVistasError] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [pregunta, setPregunta] = useState(inicial.pregunta || null)   // { tipo: 'salir', accion } | { tipo: 'borrar' }
  const [menuNueva, setMenuNueva] = useState(false)
  const [detalle, setDetalle] = useState(inicial.detalle || null)   // símbolo del cajón abierto
  const [lista, setLista] = useState(inicial.lista || null)   // ventana «Guardar como lista»: { nombre, error, guardando }
  const [hecho, setHecho] = useState(null)   // texto tras guardar una lista
  const [panelOculto, setPanelOculto] = useState(!!inicial.panelOculto)
  useEffect(() => { try { if (!inicial.empresas && localStorage.getItem('screener.panelOculto') === '1') setPanelOculto(true) } catch (_) {} }, [])
  const ponPanelOculto = (x) => { setPanelOculto(x); try { localStorage.setItem('screener.panelOculto', x ? '1' : '0') } catch (_) {} }
  const [iv, setIv] = useState(inicial.iv || 0)
  const [piso, setPiso] = useState(inicial.piso || 'F')
  const [busca, setBusca] = useState(inicial.busca || '')
  const [verNo, setVerNo] = useState(!!inicial.verNo)
  const [orden, setOrden] = useState(inicial.orden || { col: null, dir: 1 })

  useEffect(() => {
    let vivo = true
    if (inicial.empresas) return
    if (!hayConfigSupabase()) { setEstado({ cargando: false, error: 'La app no tiene conexión con la base de datos.', empresas: [] }); return }
    leerFilasEmpresas(ctxConSesion())
      .then(filas => { if (vivo) setEstado({ cargando: false, error: null, empresas: empresasDeFilas(filas) }) })
      .catch(e => { if (vivo) setEstado({ cargando: false, error: e.message, empresas: [] }) })
    // Las vistas guardadas; la primera vez (ninguna), se crean las 3 de ejemplo.
    const ctx = ctxConSesion()
    listarVistas(ctx)
      .then(l => l && l.length ? l : creaEjemplos(ctx))
      .then(l => { if (vivo) { setVistas(l.map(pestanaDe)); setIv(0) } })
      .catch(e => { if (vivo) setVistasError(`${e.message} Las vistas de ejemplo funcionan, pero no se pueden guardar.`) })
    return () => { vivo = false }
  }, [])

  const actual = vistas[Math.min(iv, vistas.length - 1)]
  const conCambios = conCambiosDe(actual)
  // Guardia al salir de la pantalla con cambios (como en Tesis).
  const conCambiosRef = useRef(conCambios); conCambiosRef.current = conCambios
  useEffect(() => { if (salida) salida.current = (seguir) => { if (!conCambiosRef.current) return false; setPregunta({ tipo: 'salir', accion: seguir }); return true } })
  useEffect(() => () => { if (salida) salida.current = null }, [])

  // Esc cierra el cajón.
  useEffect(() => {
    if (!detalle || !visible || typeof window === 'undefined') return
    const k = (e) => { if (e.key === 'Escape') setDetalle(null) }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [detalle, visible])
  const guardaLista = async () => {
    setLista(l => ({ ...l, guardando: true, error: null }))
    try {
      const r = await guardarComoLista(ctxConSesion(), { nombre: lista.nombre, empresas: ev.f2 })
      setLista(null)
      setHecho(`✓ Lista «${r.lista.name}» guardada con ${r.total} valores${r.nuevos ? ` (${r.nuevos} nuevos en la Watchlist, en el grupo «Screener»)` : ''}. Ya la puedes usar en «Una lista» del plan.`)
      onListaGuardada?.()
    } catch (e) { setLista(l => ({ ...l, guardando: false, error: e.message })) }
  }
  const ponPestana = (cambio) => setVistas(vs => vs.map((p, i) => i === iv ? { ...p, ...cambio } : p))
  const guarda = async () => {
    if (guardando) return false
    setGuardando(true); setVistasError(null)
    try {
      const ctx = ctxConSesion(), p = actual, posicion = iv
      const fila = p.id == null ? await crearVista(ctx, { nombre: p.nombre, vista: p.vista, posicion }) : await cambiarVista(ctx, p.id, { nombre: p.nombre, vista: p.vista, posicion })
      setVistas(vs => vs.map(x => x.clave === p.clave ? { ...pestanaDe(fila), clave: p.clave } : x))
      return true
    } catch (e) { setVistasError(e.message); return false } finally { setGuardando(false) }
  }
  // Descartar: vuelve a lo guardado; una nueva sin guardar se quita.
  const descarta = () => {
    if (!actual.base) {
      setVistas(vs => { const r = vs.filter(x => x.clave !== actual.clave); return r.length ? r : [pestanaDe({ nombre: 'Vista nueva', vista: vistaNueva() })] })
      setIv(i => Math.max(0, i - 1)); return
    }
    ponPestana({ nombre: actual.base.nombre, vista: copia(actual.base.vista) })
  }
  // Pasar a otra pestaña (o crear otra) con la pregunta si hay cambios.
  const conGuardia = (accion) => { if (conCambios) setPregunta({ tipo: 'salir', accion }); else accion() }
  const nueva = (desde) => {
    setMenuNueva(false)
    const p = desde === 'copia' ? pestanaDe({ nombre: `${nombreLimpio(actual.nombre)} (copia)`, vista: copia(actual.vista) }) : pestanaDe({ nombre: 'Vista nueva', vista: vistaNueva() })
    conGuardia(() => { setVistas(vs => [...vs, p]); setIv(n => vistas.length) })
  }
  const borra = async () => {
    setPregunta(null)
    try {
      if (actual.id != null) await borrarVista(ctxConSesion(), actual.id)
      setVistas(vs => { const r = vs.filter(x => x.clave !== actual.clave); return r.length ? r : [pestanaDe({ nombre: 'Vista nueva', vista: vistaNueva() })] })
      setIv(i => Math.max(0, i - 1))
    } catch (e) { setVistasError(e.message) }
  }

  const vista = normalizaVista(actual.vista)
  const cambia = (fn) => setVistas(vs => vs.map((v, i) => i === iv ? { ...v, vista: fn(normalizaVista(v.vista)) } : v))
  const cambiaFiltro = (id, cambio) => cambia(v => ({ ...v, filtros: { ...v.filtros, [id]: { ...v.filtros[id], ...cambio } } }))
  const ev = useMemo(() => evaluaVista(estado.empresas, vista), [estado.empresas, JSON.stringify(vista)])
  const encendidos = FILTROS.filter(f => !f.proximamente && vista.filtros[f.id]?.on)
  const fecha = fechaDatos(estado.empresas)

  const filas = useMemo(() => {
    const q = sinTildes(busca.trim().toLowerCase())
    let l = (verNo ? ev.universo : ev.f2).filter(e => !q || sinTildes(`${e.simbolo} ${e.nombre || ''} ${e.sector || ''}`.toLowerCase()).includes(q))
    if (orden.col) {
      l = [...l].sort((a, b) => {
        const x = valorOrden(a, orden.col), y = valorOrden(b, orden.col)
        if (x == null && y == null) return 0
        if (x == null) return 1
        if (y == null) return -1
        return (x > y ? 1 : x < y ? -1 : 0) * orden.dir
      })
    }
    return l
  }, [ev, busca, verNo, orden])

  const ordena = (col) => setOrden(o => o.col === col ? { col, dir: -o.dir } : { col, dir: col === 'simbolo' || col === 'sector' ? 1 : -1 })
  const exigido = (e) => e.m.per == null ? null : e.m.per / vista.pegRazonable

  const caja = { fontFamily: B.letra, fontSize: 13, background: '#0d1117', color: B.texto, border: `1px solid ${B.borde}`, borderRadius: 6, padding: '3px 6px' }
  const etiqueta = { fontFamily: B.letra, fontSize: 13, color: B.texto, textTransform: 'none', letterSpacing: 0, fontWeight: 400, flexDirection: 'row' }   // la app pone a todo «label» columna y letra mono
  const cel = { padding: '5px 8px', borderBottom: `1px solid ${B.borde}`, whiteSpace: 'nowrap', textAlign: 'right' }

  return (
    <div data-screener style={{ ...S.pagina, padding: 14, display: 'flex', flexDirection: 'column', gap: 10, height: '100%', boxSizing: 'border-box', overflow: 'hidden' }}>
      {/* Pestañas de vistas */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'flex-end', borderBottom: `1px solid ${B.borde}` }}>
        {vistas.map((v, i) => (
          <button key={v.clave} data-pestana-vista={i} onClick={() => { if (i !== iv) conGuardia(() => setIv(i)) }}
            style={{ ...S.boton, padding: '6px 12px', borderRadius: '8px 8px 0 0', borderBottom: 'none', fontWeight: i === iv ? 700 : 400,
              background: i === iv ? B.tarjeta : 'transparent', color: i === iv ? B.titulo : B.secundario }}>
            {nombreLimpio(v.nombre) || 'Vista sin nombre'}{conCambiosDe(v) && <span data-punto-cambios title="Cambios sin guardar" style={{ color: AMARILLO, marginLeft: 5 }}>●</span>}</button>
        ))}
        <span style={{ position: 'relative' }}>
          <button data-nueva-vista onClick={() => setMenuNueva(x => !x)} style={{ ...S.boton, padding: '6px 12px', borderRadius: '8px 8px 0 0', borderBottom: 'none', background: 'transparent', color: B.enlace }}>+ Nueva vista ▾</button>
          {menuNueva && <div data-menu-nueva style={{ position: 'absolute', top: '100%', left: 0, zIndex: 20, background: B.tarjeta, border: `1px solid ${B.borde}`, borderRadius: 8, padding: 4, minWidth: 200, boxShadow: '0 6px 20px rgba(0,0,0,0.45)' }}>
            {[['cero', 'Desde cero (sin filtros)'], ['copia', 'Copia de esta vista']].map(([k, tx]) => (
              <button key={k} data-nueva={k} onClick={() => nueva(k)} style={{ ...S.enlace, display: 'block', width: '100%', padding: '6px 10px', color: B.texto, fontSize: 13 }}>{tx}</button>))}
          </div>}
        </span>
      </div>

      {/* La vista: nombre, duplicar, borrar, descartar y guardar */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input data-nombre-vista value={actual.nombre} onChange={e => ponPestana({ nombre: e.target.value })} title="Nombre de la vista (puedes cambiarlo)" maxLength={200}
          style={{ ...caja, width: 260, fontSize: 14, fontWeight: 700, padding: '5px 8px' }}/>
        <button data-duplicar onClick={() => nueva('copia')} title="Duplicar esta vista" style={{ ...S.boton, padding: '4px 8px', fontSize: 15 }}>⧉</button>
        <button data-borrar-vista onClick={() => setPregunta({ tipo: 'borrar' })} title="Borrar esta vista" style={{ ...S.boton, padding: '3px 7px', background: 'transparent' }}><Papelera tamano={17}/></button>
        <span style={{ flex: 1 }}/>
        {vistasError && <span data-error-vistas style={{ color: ROJO, fontSize: 13 }}>⚠ {vistasError}</span>}
        <button data-descartar disabled={!conCambios || guardando} onClick={descarta} style={{ ...S.boton, padding: '5px 12px', opacity: conCambios ? 1 : 0.5, cursor: conCambios ? 'pointer' : 'default' }}>Descartar cambios</button>
        <button data-guardar disabled={!conCambios || guardando} onClick={guarda} style={{ ...(conCambios ? S.botonVerde : S.botonDesactivado), padding: '5px 14px' }}>{guardando ? 'Guardando…' : 'Guardar'}</button>
      </div>

      {/* Universo y fechas de los datos */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', fontSize: 13 }}>
        <span style={S.secundario}>Universo:</span>
        {[['sp500', 'S&P 500'], ['ndx', 'Nasdaq-100'], ['listas', 'Tus listas']].map(([k, t]) => (
          <label key={k} style={{ ...etiqueta, display: 'inline-flex', gap: 5, alignItems: 'center', cursor: 'pointer' }}>
            <input type="checkbox" data-universo={k} checked={!!vista.universo[k]} onChange={e => cambia(v => ({ ...v, universo: { ...v.universo, [k]: e.target.checked } }))}/>{t}
          </label>))}
        <span style={S.apagado}>Cuentas de la SEC (EDGAR) y precios del {fechaCorta(fecha)} · el PEG esperado es de Yahoo, solo de hoy</span>
      </div>

      {/* Embudo */}
      <div data-embudo style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        {[
          [`Universo${ev.quitadosSector ? ` (sin ${ev.quitadosSector} de sectores quitados)` : ''}`, ev.universo.length, false],
          ['1 · pasan Fundamentales', ev.f1.length, false],
          ['2 · pasan también Técnico', ev.f2.length, true],
        ].map(([t, n, fin], i) => (
          <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
            {i > 0 && <span style={{ color: B.apagado }}>→</span>}
            <span style={{ ...S.tarjeta, padding: '6px 14px', borderColor: fin ? B.pasoBorde : B.borde, background: fin ? B.pasoFondo : B.tarjeta }}>
              <div style={{ fontSize: 12, color: B.secundario }}>{t}</div>
              <div data-embudo-n={i} style={{ fontSize: 20, fontWeight: 700, color: B.titulo }}>{estado.cargando ? '…' : n}</div>
            </span>
          </span>))}
        <span style={S.apagado}>El piso técnico llega más adelante: hoy pasan los mismos que en el 1.</span>
        <span style={{ flex: 1 }}/>
        <button data-guardar-lista disabled={!ev.f2.length} onClick={() => { setHecho(null); setLista({ nombre: nombrePropuesto(nombreLimpio(actual.nombre)), error: null, guardando: false }) }}
          title="Crea una lista de la Watchlist con los valores que pasan (fija: no cambia sola)" style={{ ...S.boton, padding: '6px 12px', opacity: ev.f2.length ? 1 : 0.5 }}>☰ Guardar como lista ({ev.f2.length})</button>
        {hecho && <div data-lista-hecha style={{ flexBasis: '100%', color: VERDE, fontSize: 13 }}>{hecho}</div>}
      </div>

      {estado.error && <div style={{ color: ROJO }}>⚠ {estado.error}</div>}

      <div style={{ display: 'flex', gap: 12, flex: 1, minHeight: 0 }}>
        {/* Panel de filtros (se puede ocultar; se recuerda en el navegador) */}
        {panelOculto ? (
          <button data-mostrar-panel onClick={() => ponPanelOculto(false)} title="Mostrar los filtros"
            style={{ ...S.boton, padding: '8px 6px', writingMode: 'vertical-rl', fontSize: 13, flexShrink: 0 }}>▶ Filtros</button>
        ) : (
        <div data-panel-filtros style={{ ...S.tarjeta, width: 440, flexShrink: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ display: 'flex', borderBottom: `1px solid ${B.borde}` }}>
            <button data-ocultar-panel onClick={() => ponPanelOculto(true)} title="Ocultar los filtros (la tabla usa todo el ancho)"
              style={{ padding: '8px 10px', border: 'none', borderRight: `1px solid ${B.borde}`, cursor: 'pointer', background: 'transparent', color: B.secundario, fontFamily: B.letra, fontSize: 13 }}>◀</button>
            {[['F', '1 · Fundamentales'], ['T', '2 · Técnico']].map(([p, t]) => (
              <button key={p} data-piso={p} onClick={() => setPiso(p)}
                style={{ flex: 1, padding: '8px 0', border: 'none', cursor: 'pointer', fontFamily: B.letra, fontSize: 13, fontWeight: piso === p ? 700 : 400,
                  background: piso === p ? B.cabecera : 'transparent', color: piso === p ? B.titulo : B.secundario, borderBottom: piso === p ? `2px solid ${B.enlace}` : '2px solid transparent' }}>{t}</button>))}
          </div>
          <div style={{ overflowY: 'auto', padding: '6px 12px 12px', fontSize: 13 }}>
            {piso === 'F' && <>
              <div style={grupoEst}>Sectores que se quitan<AyudaFiltro a={AYUDAS.sectores}/></div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {SECTORES_FUERA_POR_DEFECTO.map(s => { const on = vista.sectoresFuera.includes(s)
                  return <label key={s} data-sector={s} style={{ ...etiqueta, ...S.chip(on ? 'noSupera' : 'neutro'), cursor: 'pointer', fontWeight: 400, opacity: on ? 1 : 0.7 }}>
                    <input type="checkbox" checked={on} style={{ margin: '0 4px 0 0', verticalAlign: 'middle' }}
                      onChange={e => cambia(v => ({ ...v, sectoresFuera: e.target.checked ? [...v.sectoresFuera, s] : v.sectoresFuera.filter(x => x !== s) }))}/>{s}</label> })}
              </div>
            </>}
            {piso === 'T' && <div style={{ ...S.apagado, margin: '8px 0' }}>Estos filtros llegan en la parte 2 del screener.</div>}
            {FILTROS.filter(f => f.piso === piso).map((f, i, l) => {
              const c = vista.filtros[f.id], on = !!c?.on, n = ev.cuantos[f.id]
              return (
                <div key={f.id}>
                  {(i === 0 || l[i - 1].grupo !== f.grupo) && <div style={grupoEst}>{f.grupo}</div>}
                  <div data-filtro={f.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0', opacity: f.proximamente ? 0.45 : on ? 1 : 0.7 }}>
                    <input type="checkbox" data-on={f.id} checked={on} disabled={!!f.proximamente} onChange={e => cambiaFiltro(f.id, { on: e.target.checked })}/>
                    <span style={{ flex: 1, minWidth: 0 }}>{f.nombre}{f.fuente && <Fuente f={f.fuente}/>}</span>
                    {!f.proximamente && <>
                      <select data-op={f.id} value={c.op} onChange={e => cambiaFiltro(f.id, { op: e.target.value })} style={{ ...caja, padding: '2px 2px', width: 42, flex: '0 0 auto' }}>
                        <option>≥</option><option>≤</option></select>
                      <input data-valor={f.id} type="number" step="any" value={c.valor ?? ''} style={{ ...caja, width: 62, flex: '0 0 auto' }}
                        onChange={e => cambiaFiltro(f.id, { valor: e.target.value === '' ? null : Number(e.target.value) })}/>
                      <span style={{ ...S.apagado, width: 44 }}>{f.unidad}</span>
                    </>}
                    {f.ayuda && <AyudaFiltro a={f.ayuda}/>}
                    <span data-cuenta={f.id} title="Valores que quita este filtro (de los que llegan a su piso)" style={{ width: 40, textAlign: 'right', color: ROJO, fontWeight: 700 }}>{on && n ? '−' + n : ''}</span>
                  </div>
                </div>)
            })}
            <div style={{ ...S.apagado, marginTop: 10, display: 'flex', alignItems: 'center' }}>«−N»: cuántos quita cada filtro<AyudaFiltro a={AYUDAS.cuenta}/></div>
          </div>
        </div>)}

        {/* Resultados */}
        <div style={{ ...S.tarjeta, flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', padding: '8px 12px', borderBottom: `1px solid ${B.borde}`, fontSize: 13 }}>
            <b data-n-filas style={{ color: B.titulo }}>{filas.length} valores</b>
            <ConLimpiar valor={busca} onLimpia={() => setBusca('')}>
              <input data-busca placeholder="Buscar valor o sector" value={busca} onChange={e => setBusca(e.target.value)} style={{ ...caja, width: 200 }}/>
            </ConLimpiar>
            <label style={{ ...etiqueta, display: 'inline-flex', gap: 5, alignItems: 'center', cursor: 'pointer', color: B.secundario }}>
              <input type="checkbox" data-ver-no checked={verNo} onChange={e => setVerNo(e.target.checked)}/>ver también los que no pasan (en gris)</label>
            <span style={{ flex: 1 }}/>
            <label style={{ ...etiqueta, display: 'inline-flex', gap: 5, alignItems: 'center', cursor: 'pointer', color: B.secundario }}>
              <input type="checkbox" data-ver-exigido checked={!!vista.verExigido} onChange={e => cambia(v => ({ ...v, verExigido: e.target.checked }))}/>ver crecimiento exigido</label>
            {vista.verExigido && <>
              <span style={{ color: B.secundario }}>con PEG razonable</span>
              <input data-peg type="number" step="0.1" min="0.1" value={vista.pegRazonable} style={{ ...caja, width: 56 }}
                onChange={e => cambia(v => ({ ...v, pegRazonable: Number(e.target.value) > 0 ? Number(e.target.value) : v.pegRazonable }))}/>
            </>}
            <AyudaFiltro a={AYUDAS.exigido}/>
          </div>
          <div style={{ overflow: 'auto', flex: 1 }}>
            {estado.cargando ? <div style={{ ...S.apagado, padding: 20 }}>Cargando las empresas…</div> : (
              <table data-tabla style={{ borderCollapse: 'collapse', fontSize: 13, width: '100%' }}>
                <thead><tr>
                  {[['simbolo', 'Valor'], ['sector', 'Sector'], ['precio', 'Precio $'], ...encendidos.map(f => [f.id, f.nombre]), ...(vista.verExigido ? [['exigido', 'Crec. exigido'], ['esperado', 'Crec. esperado']] : [])].map(([k, t], i) => (
                    <th key={k} data-col={k} onClick={() => ordena(k)} title="Pulsa para ordenar"
                      style={{ ...cel, position: 'sticky', top: 0, background: B.cabecera, color: B.titulo, cursor: 'pointer', textAlign: i < 2 ? 'left' : 'right', fontWeight: 600, zIndex: 1 }}>
                      {t}{orden.col === k ? (orden.dir > 0 ? ' ▲' : ' ▼') : ''}</th>))}
                </tr></thead>
                <tbody>
                  {filas.map(e => { const dentro = ev.pasaTodo.has(e.simbolo), x = exigido(e)
                    return (
                      <tr key={e.simbolo} data-fila={e.simbolo} onClick={() => setDetalle(e.simbolo)} title="Pulsa para ver el detalle" style={{ opacity: dentro ? 1 : 0.5, cursor: 'pointer', background: detalle === e.simbolo ? B.cabecera : undefined }}>
                        <td style={{ ...cel, textAlign: 'left' }} title={e.aviso || undefined}><b>{e.simbolo}</b> <span style={{ color: B.secundario }}>{e.nombre}</span></td>
                        <td style={{ ...cel, textAlign: 'left', color: B.secundario }} title={e.sectorFuente === 'SIC' ? 'Sector aproximado con el código de actividad que declara a la SEC (SIC)' : 'Sector oficial del S&P 500 (GICS)'}>{e.sector || '—'}{e.sectorFuente === 'SIC' ? '*' : ''}</td>
                        <td style={cel}>{fmt(e.precio, 2)}</td>
                        {encendidos.map(f => { const bien = pasa(e, f, vista.filtros[f.id])
                          return <td key={f.id} data-celda={f.id} title={f.titulo ? f.titulo(e) : undefined} style={{ ...cel, color: bien ? B.texto : ROJO }}>{textoCelda(e, f)}</td> })}
                        {vista.verExigido && <>
                          <td data-celda="exigido" title={x == null ? undefined : `PER ${fmt(e.m.per)} ÷ PEG ${fmt(vista.pegRazonable)}`} style={{ ...cel, color: x != null && e.m.crecEsperado != null && x > e.m.crecEsperado ? ROJO : B.texto }}>{x == null ? '—' : fmt(x) + ' %'}</td>
                          <td data-celda="esperado" title={e.m.crecEsperado == null ? 'Yahoo no da el PEG esperado (o no hay PER)' : `PER ${fmt(e.m.per)} ÷ PEG esperado ${fmt(e.m.pegEsp, 2)} (Yahoo)`} style={{ ...cel, color: B.secundario }}>{e.m.crecEsperado == null ? '—' : fmt(e.m.crecEsperado) + ' %'}</td>
                        </>}
                      </tr>) })}
                  {!filas.length && <tr><td colSpan={encendidos.length + 3 + (vista.verExigido ? 2 : 0)} style={{ ...cel, textAlign: 'center', color: B.secundario, padding: 20 }}>
                    {busca ? 'Ningún valor coincide con la búsqueda.' : 'Ningún valor pasa todos los filtros. Prueba a quitar alguno (el número rojo «−N» dice cuántos quita cada uno).'}</td></tr>}
                </tbody>
              </table>)}
          </div>
          <div style={{ ...S.apagado, padding: '4px 12px', borderTop: `1px solid ${B.borde}` }}>
            Importes en millones de la moneda de sus cuentas · * sector aproximado (código SIC) · en <span style={{ color: ROJO }}>rojo</span>, la cifra que no pasa ese filtro (o el crecimiento exigido mayor que el esperado) · pasa el ratón por una cifra para ver de dónde sale
          </div>
        </div>
      </div>
      {lista && (
        <Pregunta id="lista" texto={`Guardar los ${ev.f2.length} valores que pasan como una lista de la Watchlist`} aviso={lista.error}
          detalle="La lista es FIJA: guarda los valores de hoy y no cambia sola. Los que no estén en tu Watchlist se añaden en el grupo «Screener»."
          extra={<input data-nombre-lista autoFocus value={lista.nombre} maxLength={120} onChange={e => setLista(l => ({ ...l, nombre: e.target.value, error: null }))}
            onKeyDown={e => { if (e.key === 'Enter' && !lista.guardando) guardaLista() }} style={{ ...caja, width: '100%', boxSizing: 'border-box', marginBottom: 16, fontSize: 14, padding: '6px 8px' }}/>}>
          <button data-p="cancelar" style={S.boton} onClick={() => setLista(null)}>Cancelar</button>
          <button data-p="guardar-lista" disabled={lista.guardando || !lista.nombre.trim()} style={lista.guardando || !lista.nombre.trim() ? S.botonDesactivado : S.botonVerde} onClick={guardaLista}>{lista.guardando ? 'Guardando…' : 'Guardar lista'}</button>
        </Pregunta>)}
      {detalle && (() => { const e = estado.empresas.find(x => x.simbolo === detalle); return e ? <Cajon e={e} vista={vista} dentro={ev.pasaTodo.has(e.simbolo)} nombreVista={nombreLimpio(actual.nombre)} onCierra={() => setDetalle(null)} onIrAValor={onIrAValor}/> : null })()}
      {pregunta?.tipo === 'salir' && (
        <Pregunta id="salir" texto={`Tienes cambios sin guardar en la vista «${nombreLimpio(actual.nombre) || 'Vista sin nombre'}».`}>
          <button data-p="cancelar" style={S.boton} onClick={() => setPregunta(null)}>Cancelar</button>
          <button data-p="salir" style={S.boton} onClick={() => { const a = pregunta.accion; setPregunta(null); descarta(); a() }}>Salir sin guardar</button>
          <button data-p="guardar" style={S.botonVerde} onClick={async () => { const a = pregunta.accion; setPregunta(null); if (await guarda()) a() }}>Guardar</button>
        </Pregunta>)}
      {pregunta?.tipo === 'borrar' && (
        <Pregunta id="borrar" texto={`¿Borrar la vista «${nombreLimpio(actual.nombre) || 'Vista sin nombre'}»?`} aviso="No se puede deshacer.">
          <button data-p="cancelar" style={S.boton} onClick={() => setPregunta(null)}>Cancelar</button>
          <button data-p="borrar" style={{ ...S.boton, color: '#f85149', borderColor: '#f85149' }} onClick={borra}>Borrar</button>
        </Pregunta>)}
    </div>
  )
}
// El CAJÓN de un valor (a la derecha, por encima): ✓/✗ de cada filtro de la vista con su cuenta y su fuente, el crecimiento que
// exige el precio frente al esperado, y enlaces a su ficha de Fundamentals y a su gráfico.
export function Cajon({ e, vista, dentro, nombreVista, onCierra, onIrAValor }) {
  const ex = e.m.per == null ? null : e.m.per / vista.pegRazonable
  const fila = (f) => {
    const c = vista.filtros[f.id], on = !!c?.on, bien = pasa(e, f, c)
    return (
      <tr key={f.id} data-cajon-filtro={f.id}>
        <td style={{ padding: '5px 0', verticalAlign: 'top' }}>
          {on ? (bien ? <span style={{ color: VERDE }}>✓</span> : <span style={{ color: ROJO }}>✗</span>) : <span style={{ color: B.apagado }}>·</span>} {f.nombre}<Fuente f={f.fuente}/>
          {f.formula && <div style={{ color: B.apagado, fontSize: 12, marginLeft: 14 }}>{f.formula(e)}</div>}
        </td>
        <td style={{ padding: '5px 0 5px 10px', textAlign: 'right', verticalAlign: 'top', whiteSpace: 'nowrap', color: on && !bien ? ROJO : B.texto }}>{textoCelda(e, f)}</td>
      </tr>)
  }
  const enlace = { ...S.boton, padding: '5px 10px', fontSize: 13 }
  return (
    <div data-cajon={e.simbolo} style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 440, maxWidth: '100%', zIndex: 2500, background: B.tarjeta, borderLeft: `1px solid ${B.borde}`,
      boxShadow: '-8px 0 24px rgba(0,0,0,0.5)', padding: 16, overflowY: 'auto', boxSizing: 'border-box', fontFamily: B.letra, fontSize: 13, color: B.texto }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: B.titulo, flex: 1 }}>{e.simbolo} · {e.nombre}</div>
        <button data-cierra-cajon onClick={onCierra} title="Cerrar (Esc)" style={{ ...S.boton, padding: '2px 9px' }}>✕</button>
      </div>
      <div style={{ color: B.secundario, margin: '4px 0 10px' }}>
        {e.sector || 'sin sector'}{e.sectorFuente === 'SIC' ? ' (aprox.)' : ''} · {fmt(e.precio, 2)} $ · {dentro ? <span style={{ color: VERDE }}>pasa la vista «{nombreVista}»</span> : <span style={{ color: ROJO }}>no pasa la vista «{nombreVista}»</span>}
      </div>
      {onIrAValor && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <button data-ir="fundamentals" style={enlace} onClick={() => onIrAValor(e.simbolo, 'fundamentals')}>🏦 Ficha de Fundamentals ↗</button>
        <button data-ir="watchlist" style={enlace} onClick={() => onIrAValor(e.simbolo, 'watchlist')}>📈 Gráfico ↗</button>
      </div>}
      {e.aviso && <div style={{ color: AMARILLO, marginBottom: 10 }}>⚠ {e.aviso}</div>}
      <div data-exigido style={{ background: '#13283f', border: '1px solid #2d5b8c', borderRadius: 8, padding: '8px 10px', marginBottom: 12 }}>
        <b>Crecimiento que exige el precio:</b>{' '}
        {ex == null ? (e.moneda && e.moneda !== 'USD' ? `cuentas en ${e.moneda}: no se calcula.` : 'sin beneficio, no se calcula.')
          : <>PER {fmt(e.m.per)} ÷ PEG {fmt(vista.pegRazonable)} = <b>{fmt(ex)} % al año</b>.{' '}
            {e.m.crecEsperado != null ? <>Los analistas esperan {fmt(e.m.crecEsperado)} % (PER ÷ PEG esperado de Yahoo) → {ex > e.m.crecEsperado ? <b style={{ color: ROJO }}>el precio pide más de lo esperado</b> : <b style={{ color: VERDE }}>el precio pide menos de lo esperado</b>}.</> : 'Yahoo no da el crecimiento esperado.'}</>}
      </div>
      <div style={{ ...grupoEst, marginTop: 0 }}>1 · Fundamentales</div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}><tbody>{FILTROS.filter(f => f.piso === 'F').map(fila)}</tbody></table>
      <p style={{ color: B.apagado, fontSize: 12 }}>✓/✗ solo en los filtros encendidos de la vista; «·» = apagado (se ve el dato igualmente). Cuentas hasta el {fechaCorta(e.cuentasHasta)}{e.moneda && e.moneda !== 'USD' ? `, en ${e.moneda}` : ''}; precio del {fechaCorta(e.precioFecha)}{e.pegFecha ? `; PEG esperado del ${fechaCorta(e.pegFecha)}` : ''}.</p>
    </div>)
}
const grupoEst = { display: 'flex', alignItems: 'center', margin: '12px 0 4px', fontSize: 12, fontWeight: 700, color: B.secundario, textTransform: 'uppercase', letterSpacing: '0.04em' }
