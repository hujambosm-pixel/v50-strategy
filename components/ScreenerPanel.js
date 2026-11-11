// components/ScreenerPanel.js — la pantalla «Screener» (docs/screener.md; boceto bocetos/screener.html, diseño A «Panel +
// tabla»): pestañas de vistas arriba, el embudo, el panel de filtros a la izquierda (como el Backtesting) y la tabla a la
// derecha. Las cifras de cada empresa vienen ya calculadas de la base (lib/screener/datos.js); aquí solo se filtra y se
// ordena (lib/screener/filtros.js). No toca el motor ni ninguna cifra del resto de la app.
import { useEffect, useMemo, useRef, useState } from 'react'
import { B as BA, S as SA } from '../lib/builder/estilo'   // las ventanas y los «?» (fuera del div de la pantalla) siguen con los de la app
import { B, S, ROJO, VERDE, AMARILLO, CSS_TABLA, varsTema } from '../lib/screener/colores'
import Ayuda from './BuilderAyuda'
import ConLimpiar from './LimpiarBusqueda'
import { ctxConSesion, fetchConSesion, hayConfigSupabase } from '../lib/supabase'
import { sinTildes } from '../lib/builder/buscar'
import { conTecnico, empresasDeFilas, fechaDatos, fechaTecnico, leerFilasEmpresas, leerReferencias } from '../lib/screener/datos'
import { MERCADO, REFERENCIAS_TECNICO, cifrasTecnicas } from '../lib/screener/tecnico'
import { AYUDAS, FILTROS, FILTRO, evaluaVista, fmt, pasa } from '../lib/screener/filtros'
import { SECTORES_FUERA_POR_DEFECTO } from '../lib/screener/sectores'
import { VISTAS_EJEMPLO, normalizaVista, textoVista, vistaNueva } from '../lib/screener/vista'
import { borrarVista, cambiarVista, creaEjemplos, crearVista, listarVistas, nombreLimpio } from '../lib/screener/vistasBase'
import { opcionElegida, opcionesDe, textoCondicion, textoEncendido } from '../lib/screener/opciones'
import { Papelera, Pregunta } from './VentanaPregunta'
import { guardarComoLista, nombrePropuesto } from '../lib/screener/lista'
import { esDeTarjetas, fotoDe } from '../lib/pruebaAzar'
import TesisEnlace from './TesisEnlace'
import { listarEnlacesTesis, tesisDe } from '../lib/tesis'

const copia = (x) => JSON.parse(JSON.stringify(x))
// §15: el «?» junto a las pestañas de los filtros.
export const AYUDA_FILTROS = ['Filtros', 'Pestañas: «Universo y sectores», «1 · Fundamentales», «2 · Técnico» y «Todos» (todo junto); el número azul dice cuántos hay encendidos en cada una. Pulsa el NOMBRE de un filtro para ver qué es, con un ejemplo. Cada filtro tiene cifras fijas; con «Otra cifra…» pones la tuya. El número rojo «−N» dice cuántos valores de los que llegan a ese piso no pasan ese filtro. «Filtros ▲» los oculta: queda una línea con los encendidos (✕ quita uno) y la tabla sube.', 'Llegan 300 valores a Fundamentales y 120 tienen ROCE menor que 25 % → «−120».']
const PESTANAS_FILTROS = [['U', 'Universo y sectores'], ['F', '1 · Fundamentales'], ['T', '2 · Técnico'], ['todos', 'Todos']]
// Una pestaña de vista: { clave (local), id (de la base, null si aún no está guardada), nombre, vista, base: { nombre, vista } | null
// (lo guardado; null si es nueva) }. Con cambios = nueva, u otro nombre u otra vista que lo guardado.
let claves = 0
export const pestanaDe = (fila) => ({ clave: ++claves, id: fila.id ?? null, nombre: fila.nombre, vista: normalizaVista(fila.vista), base: fila.id != null ? { nombre: fila.nombre, vista: normalizaVista(fila.vista) } : null })
export const conCambiosDe = (p) => !p.base || nombreLimpio(p.nombre) !== p.base.nombre || textoVista(p.vista) !== textoVista(p.base.vista)
const fechaCorta = (iso) => iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '—'
// «Actualizar precios»: una tanda de símbolos a /api/screener-tecnico (como mucho 10; pages/api/screener-tecnico.js), con el token
// vigente. Devuelve { resultados: [{ simbolo, tecnico, guardado, error }] }.
export const TANDA_PRECIOS = 10, TANDAS_A_LA_VEZ = 2
export async function pideTecnicoDeVerdad(simbolos) {
  const r = await fetchConSesion('/api/screener-tecnico', { method: 'POST', body: JSON.stringify({ simbolos }) },
    (jwt) => ({ 'Content-Type': 'application/json', ...(jwt ? { 'x-supa-jwt': jwt } : {}) }))
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
}

// «Da señal de compra con…» (§11): una tanda de símbolos a /api/screener-senales (como mucho 10) con la estrategia { definition,
// params }. Devuelve { resultados: [{ simbolo, senal, error }] }.
export const TANDA_SENALES = 10, TANDAS_SENALES_A_LA_VEZ = 2
export async function pideSenalesDeVerdad(estrategia, simbolos) {
  const r = await fetchConSesion('/api/screener-senales', { method: 'POST', body: JSON.stringify({ estrategia, simbolos }) },
    (jwt) => ({ 'Content-Type': 'application/json', ...(jwt ? { 'x-supa-jwt': jwt } : {}) }))
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
}
// Las estrategias que sirven: de tarjetas y de velas diarias (fotoDe: { id, name, definition, params }).
export const estrategiasSenal = (lista) => (lista || []).filter(esDeTarjetas).map(fotoDe).filter(x => x.params.intervalo !== 'semanal')
// La clave de los resultados: el id y la regla (si se cambia la estrategia, se calcula otra vez).
export const claveSenal = (x) => x ? `${x.id}|${JSON.stringify([x.definition, x.params])}` : null

// Un «?» con título, explicación y ejemplo (los textos del catálogo).
export const AyudaFiltro = ({ a, etiqueta, contenido, estiloBoton, soloClic }) => !a ? null : (
  <Ayuda etiqueta={etiqueta || a[0]} contenido={contenido} estiloBoton={estiloBoton} soloClic={soloClic} texto={<><b>{a[0]}</b><br/>{a[1]}{a[2] ? <><br/><span style={{ color: BA.secundario }}>Ejemplo: {a[2]}</span></> : null}{a[3] ? <><br/><span data-recomendado style={{ color: '#56d364' }}>Recomendado: {a[3]}</span></> : null}</>}/>)

const Fuente = ({ f }) => (
  <span title={f.startsWith('Yahoo') ? 'Dato de Yahoo: solo existe el de hoy (no sirve para probar en el pasado).' : 'De dónde sale el dato'}
    style={{ fontSize: 10, padding: '0 5px', borderRadius: 4, marginLeft: 4, whiteSpace: 'nowrap',
      background: f.startsWith('Yahoo') ? B.fuenteYahoo : B.fuente, color: f.startsWith('Yahoo') ? AMARILLO : B.apagado }}>{f}</span>)

// El valor de una celda de la tabla para el filtro f.
export function textoCelda(e, f) {
  const x = f.v(e)
  if (f.texto) return f.texto(x)
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
// refs (inicial.refs): el técnico de SPY y de los ETF de sectores. pideTecnico(símbolos): una tanda de «Actualizar precios» (en las
// comprobaciones, una falsa).
export default function ScreenerPanel({ tema = 'oscuro', inicial = {}, salida = null, onIrAValor = null, onListaGuardada = null, visible = true, pideTecnico = pideTecnicoDeVerdad, estrategias = [], pideSenales = pideSenalesDeVerdad, onAbrirTesis = null, abrirVista = null, onVistaAbierta = null }) {
  const [estado, setEstado] = useState(() => inicial.empresas ? { cargando: false, error: null, empresas: inicial.empresas } : { cargando: true, error: null, empresas: [] })
  const [refs, setRefs] = useState(inicial.refs || {})
  const [act, setAct] = useState(inicial.act || null)   // «Actualizar precios»: { hechos, total, fallos: [símbolo], fin, parado }
  const paraRef = useRef(false)
  // «Da señal de compra con…»: senales = { clave de la estrategia: { símbolo: { senal, error } } } (en memoria; se vacía al actualizar
  // los precios). calcSenal: { clave, hechos, total } mientras se calcula.
  const [senales, setSenales] = useState(inicial.senales || {})
  const [calcSenal, setCalcSenal] = useState(null)
  const enCursoSenal = useRef(new Set())
  const [vistasLeidas, setVistasLeidas] = useState(!!inicial.vistas || !!inicial.empresas)
  const [enlacesTesis, setEnlacesTesis] = useState(inicial.tesis || [])
  const [avisoVista, setAvisoVista] = useState(null)
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
  const [piso, setPiso] = useState(inicial.piso || 'F')   // pestaña de los filtros: 'U' (universo y sectores), 'F', 'T' o 'todos'
  const [otra, setOtra] = useState({})   // { id: true } = la caja de «Otra cifra…» abierta (es de la pantalla: no se guarda)
  const [editaNombre, setEditaNombre] = useState(false)   // cambiando el nombre de la vista (✎ o doble clic en su pestaña)
  const nombreRef = useRef(null)
  useEffect(() => { if (editaNombre) { nombreRef.current?.focus?.(); nombreRef.current?.select?.() } }, [editaNombre])
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
    leerReferencias(ctxConSesion()).then(r => { if (vivo) setRefs(r) }).catch(() => {})
    // Las vistas guardadas; la primera vez (ninguna), se crean las 3 de ejemplo.
    const ctx = ctxConSesion()
    listarVistas(ctx)
      .then(l => l && l.length ? l : creaEjemplos(ctx))
      .then(l => { if (vivo) { setVistas(l.map(pestanaDe)); setIv(0); setVistasLeidas(true) } })
      .catch(e => { if (vivo) { setVistasError(`${e.message} Las vistas de ejemplo funcionan, pero no se pueden guardar.`); setVistasLeidas(true) } })
    return () => { vivo = false }
  }, [])
  // §13: las tesis que enlazan cada vista («💡 …» junto al nombre). Se leen cada vez que se entra en la pantalla (una tesis puede
  // haber cambiado mientras tanto). Solo se lee.
  useEffect(() => {
    if (inicial.empresas || !visible || !hayConfigSupabase()) return
    let vivo = true
    listarEnlacesTesis(ctxConSesion()).then(xs => { if (vivo) setEnlacesTesis(xs || []) }).catch(() => {})
    return () => { vivo = false }
  }, [visible])
  // §13: abrir una vista por su id (desde «Relacionado» de una tesis), cuando ya están leídas. Con cambios sin guardar en otra
  // vista, la ventana de siempre. Si ya no existe, lo dice.
  useEffect(() => {
    if (!abrirVista || !vistasLeidas) return
    onVistaAbierta?.()
    const i = vistas.findIndex(v => v.id != null && String(v.id) === String(abrirVista.id))
    if (i < 0) { setAvisoVista('Esa vista del screener ya no existe (se ha borrado).'); return }
    setAvisoVista(null)
    if (i !== iv) conGuardia(() => setIv(i))
  }, [abrirVista?.n, vistasLeidas])

  const actual = vistas[Math.min(iv, vistas.length - 1)]
  useEffect(() => { setOtra({}); setEditaNombre(false) }, [iv, vistas.length])
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
  const conSenal = vista.filtros.senal
  const estSenales = useMemo(() => estrategiasSenal(estrategias), [estrategias])
  const estSenal = conSenal?.estrategia != null ? estSenales.find(x => String(x.id) === String(conSenal.estrategia)) || null : null
  const clave = claveSenal(estSenal)
  const mapa = clave ? senales[clave] : null
  const tecnicas = useMemo(() => conTecnico(estado.empresas, refs), [estado.empresas, refs])
  const empresas = useMemo(() => tecnicas.map(e => { const x = mapa?.[e.simbolo]; return x ? { ...e, senal: x.senal || null, senalError: x.error || null } : e }), [tecnicas, mapa])
  const ev = useMemo(() => evaluaVista(empresas, vista), [empresas, JSON.stringify(vista)])
  // Se calcula sola, solo para los que pasan los fundamentales y aún no tienen resultado con esta estrategia, con el filtro
  // encendido y la pantalla visible (medio segundo después del último cambio). Al cambiar de estrategia, las tandas pendientes
  // de la anterior no se piden.
  const faltanSenal = conSenal?.on && clave && visible ? ev.f1.map(e => e.simbolo).filter(sy => !(mapa && sy in mapa)) : []
  const claveFaltan = faltanSenal.join(',')
  const claveRef = useRef(clave); claveRef.current = clave
  useEffect(() => {
    if (!faltanSenal.length || !estSenal) return
    const t = setTimeout(async () => {
      const k = clave, est = { definition: estSenal.definition, params: estSenal.params }
      const lista = faltanSenal.filter(sy => !enCursoSenal.current.has(k + '|' + sy))
      if (!lista.length) return
      lista.forEach(sy => enCursoSenal.current.add(k + '|' + sy))
      const tandas = []; for (let i = 0; i < lista.length; i += TANDA_SENALES) tandas.push(lista.slice(i, i + TANDA_SENALES))
      let hechos = 0
      setCalcSenal({ clave: k, hechos: 0, total: lista.length })
      const una = async (tanda) => {
        let res
        try { res = (await pideSenales(est, tanda)).resultados || [] } catch (e) { res = tanda.map(simbolo => ({ simbolo, senal: null, error: e?.message || 'fallo' })) }
        const nuevos = Object.fromEntries(res.map(x => [x.simbolo, { senal: x.senal || null, error: x.error || null }]))
        setSenales(sn => ({ ...sn, [k]: { ...(sn[k] || {}), ...nuevos } }))
        hechos += tanda.length
        setCalcSenal(c => c && c.clave === k ? { ...c, hechos } : c)
      }
      let i = 0
      const hilo = async () => { while (i < tandas.length && claveRef.current === k) await una(tandas[i++]) }
      await Promise.all(Array.from({ length: TANDAS_SENALES_A_LA_VEZ }, hilo))
      lista.forEach(sy => enCursoSenal.current.delete(k + '|' + sy))
      setCalcSenal(c => c && c.clave === k ? null : c)
    }, 500)
    return () => clearTimeout(t)
  }, [clave, claveFaltan])
  const mapaVals = mapa ? Object.values(mapa) : []
  const ultimaSenal = mapaVals.reduce((m, x) => x.senal?.ultima && (!m || x.senal.ultima > m) ? x.senal.ultima : m, null)
  const sinCalcularSenal = mapaVals.filter(x => x.error).length
  const encendidos = FILTROS.filter(f => !f.proximamente && vista.filtros[f.id]?.on)
  const fecha = fechaDatos(estado.empresas)
  const fechaPrecios = fechaTecnico(estado.empresas)
  const sinPrecios = estado.empresas.filter(e => !e.tecnico).length
  const mercado = refs[MERCADO] ? cifrasTecnicas(refs[MERCADO]).emaDist : null

  // «Actualizar precios»: primero el SPY y los ETF de sectores, luego todas las empresas, por tandas (TANDAS_A_LA_VEZ a la vez).
  // Cada tanda que llega se aplica ya (la tabla cambia mientras tanto). «Parar» deja de pedir tandas nuevas.
  const actualizaPrecios = async () => {
    if (act && !act.fin) return
    paraRef.current = false
    const todos = [...new Set([...REFERENCIAS_TECNICO, ...estado.empresas.map(e => e.simbolo)])]
    const tandas = []; for (let i = 0; i < todos.length; i += TANDA_PRECIOS) tandas.push(todos.slice(i, i + TANDA_PRECIOS))
    let hechos = 0; const fallos = []
    setAct({ hechos: 0, total: todos.length, fallos: [], fin: false, parado: false })
    const una = async (tanda) => {
      let res
      try { res = (await pideTecnico(tanda)).resultados || [] } catch (_) { res = tanda.map(simbolo => ({ simbolo, tecnico: null, error: 'fallo' })) }
      const nuevos = {}
      for (const x of res) { if (x.tecnico) nuevos[x.simbolo] = x.tecnico; else fallos.push(x.simbolo) }
      const deRef = Object.fromEntries(Object.entries(nuevos).filter(([k]) => REFERENCIAS_TECNICO.includes(k)))
      if (Object.keys(deRef).length) setRefs(r => ({ ...r, ...deRef }))
      setEstado(st => ({ ...st, empresas: st.empresas.map(e => nuevos[e.simbolo] ? { ...e, tecnico: nuevos[e.simbolo] } : e) }))
      hechos += tanda.length
      setAct(a => ({ ...a, hechos, fallos: [...fallos] }))
    }
    let i = 0
    const hilo = async () => { while (i < tandas.length && !paraRef.current) { const t = tandas[i++]; await una(t) } }
    await Promise.all(Array.from({ length: TANDAS_A_LA_VEZ }, hilo))
    setAct(a => ({ ...a, fin: true, parado: paraRef.current }))
    setSenales({})   // con precios nuevos, las señales se calculan otra vez
  }

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

  const caja = { fontFamily: B.letra, fontSize: 13, background: B.caja, color: B.texto, border: `1px solid ${B.borde}`, borderRadius: 6, padding: '3px 6px' }
  const etiqueta = { fontFamily: B.letra, fontSize: 13, color: B.texto, textTransform: 'none', letterSpacing: 0, fontWeight: 400, flexDirection: 'row' }   // la app pone a todo «label» columna y letra mono
  const cel = { padding: '5px 8px', borderBottom: `1px solid ${B.borde}`, whiteSpace: 'nowrap', textAlign: 'right' }
  const celdaRejilla = { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 148px 30px', alignItems: 'center', gap: 6, minHeight: 28 }
  const encendido = { borderColor: B.selBorde, background: B.sel, color: B.titulo, fontWeight: 600 }
  // §15: lo de los filtros arriba (la rejilla como Finviz, decidida por Sergi el 11/11 con el boceto bocetos/screener-arriba.html).
  const pestana = { fontFamily: B.letra, fontSize: 13, padding: '5px 12px', borderRadius: '7px 7px 0 0', border: `1px solid ${B.borde}`, borderBottom: 'none', background: B.tarjeta, cursor: 'pointer', whiteSpace: 'nowrap' }
  const embudoN = { fontSize: 15, fontWeight: 700, color: B.titulo }
  const chipResumen = { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 9px', border: `1px solid ${B.borde}`, borderRadius: 999, background: B.cabecera, color: B.texto }
  const equis = { cursor: 'pointer', color: B.secundario, marginLeft: 2 }
  const cuentaPestana = (k) => k === 'U' ? vista.sectoresFuera.length
    : k === 'todos' ? vista.sectoresFuera.length + encendidos.length : encendidos.filter(f => f.piso === k).length
  // Elegir en el desplegable de un filtro: «Cualquiera» lo apaga; una cifra fija lo enciende con ella; «Otra cifra…» abre la caja.
  const eligeOpcion = (f, x) => {
    const c = vista.filtros[f.id]
    if (x === 'no') { setOtra(o => ({ ...o, [f.id]: false })); cambiaFiltro(f.id, { on: false }); return }
    if (x === 'otra') { setOtra(o => ({ ...o, [f.id]: true })); cambiaFiltro(f.id, { on: true, op: c.op, valor: c.valor }); return }
    if (x === 'tuya') return
    const o = opcionesDe(f)[Number(x)]; if (!o) return
    setOtra(oo => ({ ...oo, [f.id]: false })); cambiaFiltro(f.id, { on: true, op: o.op, valor: o.valor })
  }
  const desplegable = { ...caja, width: 148, padding: '2px 4px', fontSize: 13 }
  // El nombre de un filtro: pulsarlo abre su «?» (no se abre al pasar el ratón).
  const nombreFiltro = (f, on, texto) => f.ayuda
    ? <AyudaFiltro a={f.ayuda} contenido={texto} soloClic estiloBoton={{ background: 'none', border: 'none', borderBottom: `1px dotted ${B.apagado}`, padding: 0, fontFamily: B.letra, fontSize: 13, lineHeight: 1.15,
        color: on ? B.titulo : B.secundario, fontWeight: on ? 600 : 400, cursor: 'help', textAlign: 'right' }}/>
    : <span style={{ color: B.secundario }}>{texto}</span>
  const celdaFiltro = (f) => {
    const c = vista.filtros[f.id], on = !!c?.on, n = ev.cuantos[f.id]
    if (f.proximamente) return (
      <div key={f.id} data-filtro={f.id} title="Por decidir" style={{ ...celdaRejilla, opacity: 0.4 }}>
        <span style={{ textAlign: 'right', color: B.secundario, lineHeight: 1.15 }}>{f.nombre}</span>
        <select data-opcion={f.id} disabled style={desplegable}><option>Cualquiera</option></select><span/></div>)
    const cuenta = <span data-cuenta={f.id} title={on && n ? `${AYUDAS.cuenta[1]} Ejemplo: ${AYUDAS.cuenta[2]}` : undefined} style={{ textAlign: 'right', color: ROJO, fontSize: 12, fontWeight: 700 }}>{on && n ? '−' + n : ''}</span>
    if (f.conEstrategia) return [
      <div key={f.id} data-filtro={f.id} style={celdaRejilla}>
        <span style={{ textAlign: 'right' }}>{nombreFiltro(f, on, 'Da señal de compra con')}</span>
        {estSenales.length
          ? <select data-estrategia-senal value={on && c.estrategia != null ? String(c.estrategia) : ''} title={estSenal ? estSenal.name : undefined}
              onChange={e => cambiaFiltro(f.id, e.target.value === '' ? { on: false } : { on: true, estrategia: e.target.value })} style={{ ...desplegable, ...(on ? encendido : {}) }}>
              <option value="">Cualquiera</option>
              {estSenales.map(x => <option key={x.id} value={String(x.id)}>{x.name}</option>)}
            </select>
          : <span style={S.apagado} title="No tienes estrategias de tarjetas de velas diarias">(sin estrategias)</span>}
        {cuenta}
      </div>,
      <div key={f.id + '-velas'} data-filtro={f.id + '-velas'} style={{ ...celdaRejilla, opacity: on ? 1 : 0.6 }}>
        <span style={{ textAlign: 'right', color: on ? B.titulo : B.secundario }}>… en las últimas</span>
        <select data-velas-senal value={opcionElegida(f, { ...c, on: true }) >= 0 ? String(opcionElegida(f, { ...c, on: true })) : 'tuya'} disabled={!on}
          onChange={e => { const o = opcionesDe(f)[Number(e.target.value)]; if (o) cambiaFiltro(f.id, { valor: o.valor }) }} style={desplegable}>
          {opcionesDe(f).map((o, k) => <option key={k} value={String(k)}>{o.texto}</option>)}
          {opcionElegida(f, { ...c, on: true }) < 0 && <option value="tuya">{textoCondicion(f, f.op, c.valor)}</option>}
        </select>
        <span/>
      </div>]
    const i = opcionElegida(f, c), abierta = on && !!otra[f.id]
    const valor = !on ? 'no' : abierta ? 'otra' : i >= 0 ? String(i) : 'tuya'
    return (
      <div key={f.id} data-filtro={f.id} style={celdaRejilla}>
        <span style={{ textAlign: 'right', lineHeight: 1.15 }}>{nombreFiltro(f, on, f.nombre)}{f.fuente?.startsWith('Yahoo') && <Fuente f={f.fuente}/>}</span>
        <select data-opcion={f.id} value={valor} onChange={e => eligeOpcion(f, e.target.value)} style={{ ...desplegable, ...(on ? encendido : {}) }}>
          <option value="no">Cualquiera</option>
          {opcionesDe(f).map((o, k) => <option key={k} value={String(k)}>{o.texto}</option>)}
          {on && i < 0 && <option value="tuya">{textoCondicion(f, c.op, c.valor)} (tuya)</option>}
          <option value="otra">Otra cifra…</option>
        </select>
        {cuenta}
        {abierta && <span style={{ gridColumn: '2 / 4', display: 'flex', gap: 4, alignItems: 'center' }}>
          <select data-op={f.id} value={c.op} onChange={e => cambiaFiltro(f.id, { op: e.target.value })} style={{ ...caja, padding: '1px 2px', width: 42 }}><option>≥</option><option>≤</option></select>
          <input data-valor={f.id} type="number" step="any" value={c.valor ?? ''} onChange={e => cambiaFiltro(f.id, { valor: e.target.value === '' ? null : Number(e.target.value) })} style={{ ...caja, width: 70, padding: '1px 5px' }}/>
          <span style={S.apagado}>{f.unidad}</span>
        </span>}
      </div>)
  }
  // La rejilla: 5 columnas, todas las casillas iguales, que se rellenan columna a columna en el orden del catálogo (así los de un
  // mismo grupo quedan juntos).
  const rejilla = (pisos) => {
    const celdas = FILTROS.filter(f => pisos.includes(f.piso)).flatMap(f => [].concat(celdaFiltro(f)))
    const filas = Math.max(1, Math.ceil(celdas.length / 5))
    return <div data-rejilla style={{ display: 'grid', gridAutoFlow: 'column', gridTemplateRows: `repeat(${filas}, auto)`, gridAutoColumns: 'minmax(0, 1fr)', columnGap: 16, rowGap: 4, padding: '4px 0' }}>{celdas}</div>
  }
  const universoYSectores = (
    <div data-universo-sectores style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', padding: '4px 0 8px' }}>
      <span style={{ display: 'inline-flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <b style={{ color: B.secundario, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Universo</b>
        {[['sp500', 'S&P 500'], ['ndx', 'Nasdaq-100'], ['listas', 'Tus listas']].map(([k, t]) => (
          <label key={k} style={{ ...etiqueta, display: 'inline-flex', gap: 5, alignItems: 'center', cursor: 'pointer' }}>
            <input type="checkbox" data-universo={k} checked={!!vista.universo[k]} onChange={e => cambia(v => ({ ...v, universo: { ...v.universo, [k]: e.target.checked } }))}/>{t}
          </label>))}
      </span>
      <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <b style={{ color: B.secundario, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Sectores que se quitan</b><AyudaFiltro a={AYUDAS.sectores}/>
        {SECTORES_FUERA_POR_DEFECTO.map(s => { const on = vista.sectoresFuera.includes(s)
          return <label key={s} data-sector={s} style={{ ...etiqueta, ...S.chip(on ? 'noSupera' : 'neutro'), cursor: 'pointer', fontWeight: 400, opacity: on ? 1 : 0.7 }}>
            <input type="checkbox" checked={on} style={{ margin: '0 4px 0 0', verticalAlign: 'middle' }}
              onChange={e => cambia(v => ({ ...v, sectoresFuera: e.target.checked ? [...v.sectoresFuera, s] : v.sectoresFuera.filter(x => x !== s) }))}/>{s}</label> })}
      </span>
    </div>)

  return (
    <div data-screener data-tema={tema} style={{ ...varsTema(tema), ...S.pagina, padding: 14, display: 'flex', flexDirection: 'column', gap: 10, height: '100%', boxSizing: 'border-box', overflow: 'hidden' }}>
      <style>{CSS_TABLA}</style>
      {/* §15: las vistas en UNA línea: pestañas a la izquierda (la activa con su nombre editable: ✎ o doble clic) y sus botones a la derecha */}
      <div data-vistas style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'flex-end', borderBottom: `1px solid ${B.borde}` }}>
        {vistas.map((v, i) => i === iv ? (
          <span key={v.clave} data-pestana-vista={i} data-activa="" title="Doble clic o ✎ para cambiar el nombre" onDoubleClick={() => setEditaNombre(true)}
            style={{ ...pestana, display: 'inline-flex', alignItems: 'center', gap: 4, background: B.cabecera, borderColor: B.selBorde, padding: '3px 8px' }}>
            <input ref={nombreRef} data-nombre-vista value={actual.nombre} readOnly={!editaNombre} maxLength={200} size={Math.max(6, Math.min(40, (actual.nombre || '').length + 1))}
              title={editaNombre ? 'Nombre de la vista (Enter para terminar)' : 'Doble clic o ✎ para cambiar el nombre'}
              onChange={e => ponPestana({ nombre: e.target.value })} onBlur={() => setEditaNombre(false)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') { setEditaNombre(false); e.currentTarget.blur() } }}
              style={{ fontFamily: B.letra, fontSize: 13, fontWeight: 700, color: B.titulo, background: editaNombre ? B.caja : 'transparent', border: `1px solid ${editaNombre ? B.selBorde : 'transparent'}`,
                borderRadius: 4, padding: '1px 3px', cursor: editaNombre ? 'text' : 'default', outline: 'none' }}/>
            {conCambios && <span data-punto-cambios title="Cambios sin guardar" style={{ color: AMARILLO }}>●</span>}
            <span data-editar-nombre role="button" title="Cambiar el nombre" onClick={() => setEditaNombre(true)} style={{ color: B.secundario, cursor: 'pointer', fontSize: 12, padding: '0 2px' }}>✎</span>
          </span>
        ) : (
          <button key={v.clave} data-pestana-vista={i} onClick={() => conGuardia(() => setIv(i))} style={{ ...pestana, color: B.secundario }}>
            {nombreLimpio(v.nombre) || 'Vista sin nombre'}{conCambiosDe(v) && <span data-punto-cambios title="Cambios sin guardar" style={{ color: AMARILLO, marginLeft: 5 }}>●</span>}</button>
        ))}
        <span style={{ position: 'relative' }}>
          <button data-nueva-vista onClick={() => setMenuNueva(x => !x)} style={{ ...pestana, background: 'transparent', color: B.enlace }}>+ Nueva vista ▾</button>
          {menuNueva && <div data-menu-nueva style={{ position: 'absolute', top: '100%', left: 0, zIndex: 20, background: B.tarjeta, border: `1px solid ${B.borde}`, borderRadius: 8, padding: 4, minWidth: 200, boxShadow: `0 6px 20px ${B.sombra}` }}>
            {[['cero', 'Desde cero (sin filtros)'], ['copia', 'Copia de esta vista']].map(([k, tx]) => (
              <button key={k} data-nueva={k} onClick={() => nueva(k)} style={{ ...S.enlace, display: 'block', width: '100%', padding: '6px 10px', color: B.texto, fontSize: 13 }}>{tx}</button>))}
          </div>}
        </span>
        <span style={{ flex: 1 }}/>
        <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', paddingBottom: 4 }}>
          {avisoVista && <span data-aviso-vista style={{ color: AMARILLO, fontSize: 13 }}>⚠ {avisoVista}</span>}
          {vistasError && <span data-error-vistas style={{ color: ROJO, fontSize: 13 }}>⚠ {vistasError}</span>}
          <button data-duplicar onClick={() => nueva('copia')} title="Duplicar esta vista" style={{ ...S.boton, padding: '2px 8px', fontSize: 15 }}>⧉</button>
          <button data-borrar-vista onClick={() => setPregunta({ tipo: 'borrar' })} title="Borrar esta vista" style={{ ...S.boton, padding: '2px 7px', background: 'transparent' }}><Papelera tamano={16}/></button>
          {actual.id != null && <TesisEnlace lista={tesisDe(enlacesTesis, 'vista', actual.id)} onAbrir={onAbrirTesis}/>}
          <button data-guardar-lista disabled={!ev.f2.length} onClick={() => { setHecho(null); setLista({ nombre: nombrePropuesto(nombreLimpio(actual.nombre)), error: null, guardando: false }) }}
            title="Crea una lista de la Watchlist con los valores que pasan (fija: no cambia sola)" style={{ ...S.boton, padding: '4px 10px', fontSize: 13, opacity: ev.f2.length ? 1 : 0.5 }}>☰ Guardar como lista ({ev.f2.length})</button>
          <button data-descartar disabled={!conCambios || guardando} onClick={descarta} style={{ ...S.boton, padding: '4px 10px', fontSize: 13, opacity: conCambios ? 1 : 0.5, cursor: conCambios ? 'pointer' : 'default' }}>Descartar cambios</button>
          <button data-guardar disabled={!conCambios || guardando} onClick={guarda} style={{ ...(conCambios ? S.botonVerde : S.botonDesactivado), padding: '4px 12px', fontSize: 13 }}>{guardando ? 'Guardando…' : 'Guardar'}</button>
        </span>
      </div>
      {hecho && <div data-lista-hecha style={{ color: VERDE, fontSize: 13 }}>{hecho}</div>}

      {/* §15: los FILTROS ARRIBA, como Finviz: pestañas, el mercado, los precios, el embudo y «Filtros ▲»; debajo, la rejilla */}
      <div data-bloque-filtros style={{ ...S.tarjeta, borderRadius: 8, flexShrink: 0, overflow: 'visible' }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', padding: '6px 10px', fontSize: 13, borderBottom: panelOculto ? 'none' : `1px solid ${B.borde}` }}>
          <span style={{ display: 'inline-flex', border: `1px solid ${B.borde}`, borderRadius: 6, overflow: 'hidden' }}>
            {PESTANAS_FILTROS.map(([k, t], i) => { const on = piso === k && !panelOculto, n = cuentaPestana(k)
              return <button key={k} data-piso={k} onClick={() => { setPiso(k); ponPanelOculto(false) }}
                style={{ fontFamily: B.letra, fontSize: 13, padding: '4px 12px', border: 'none', borderLeft: i ? `1px solid ${B.borde}` : 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                  background: on ? B.sel : 'transparent', color: on ? B.titulo : B.secundario, fontWeight: on ? 700 : 400 }}>
                {t}{n ? <span data-cuantos-pestana={k} style={{ display: 'inline-block', minWidth: 16, padding: '0 4px', marginLeft: 5, borderRadius: 999, background: B.selBorde, color: '#fff', fontSize: 10, textAlign: 'center' }}>{n}</span> : null}</button> })}
          </span>
          <AyudaFiltro a={AYUDA_FILTROS}/>
          <span style={{ flex: 1 }}/>
          <span data-mercado style={{ display: 'inline-flex', alignItems: 'center' }} title={refs[MERCADO] ? `Informativo: no es un filtro. SPY ${fmt(refs[MERCADO].cierre, 2)} frente a EMA 200 ${fmt(refs[MERCADO].ema200, 2)} (cierre del ${fechaCorta(refs[MERCADO].fecha)})` : 'Informativo: no es un filtro.'}>
            <span style={S.secundario}>Mercado (SPY):&nbsp;</span>
            {mercado == null ? <span style={S.apagado}>sin precios</span>
              : mercado >= 0 ? <span style={{ color: VERDE }}>por encima de su EMA 200 ✓ ({mercado > 0 ? '+' : ''}{fmt(mercado)} %)</span>
              : <span style={{ color: ROJO }}>por debajo de su EMA 200 ✗ ({fmt(mercado)} %)</span>}
            <AyudaFiltro a={AYUDAS.mercado}/>
          </span>
          <span data-precios style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={S.apagado}>Precios: {fechaPrecios ? `cierre del ${fechaCorta(fechaPrecios)}` : 'sin cargar'}{sinPrecios && fechaPrecios ? ` · ${sinPrecios} sin precios` : ''}</span>
            {act && !act.fin
              ? <><span data-progreso style={{ color: B.secundario }}>Actualizando {act.hechos} de {act.total}…</span>
                  <button data-parar onClick={() => { paraRef.current = true }} style={{ ...S.boton, padding: '2px 10px', fontSize: 13 }}>Parar</button></>
              : <button data-actualizar onClick={actualizaPrecios} disabled={estado.cargando || !!estado.error} title="Descarga el último cierre de todos los valores (unos 2–3 minutos)" style={{ ...S.boton, padding: '2px 10px', fontSize: 13 }}>⟳ Actualizar precios</button>}
            {act?.fin && <span data-act-fin style={{ color: act.fallos.length ? AMARILLO : VERDE }} title={act.fallos.length ? 'Sin precios: ' + act.fallos.join(', ') : undefined}>
              {act.parado ? `Parado: ${act.hechos} de ${act.total}` : '✓ Hecho'}{act.fallos.length ? ` · ${act.fallos.length} sin precios` : ''}</span>}
            <AyudaFiltro a={AYUDAS.precios}/>
          </span>
          <span data-embudo style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6, whiteSpace: 'nowrap', color: B.secundario }}>
            <span title={`El universo elegido${ev.quitadosSector ? `, sin ${ev.quitadosSector} de los sectores quitados` : ''}`}>Universo</span>
            <b data-embudo-n="0" style={embudoN}>{estado.cargando ? '…' : ev.universo.length}</b>
            <span>→ 1 · Fundamentales</span><b data-embudo-n="1" style={embudoN}>{estado.cargando ? '…' : ev.f1.length}</b>
            <span>→ 2 · Técnico</span><b data-embudo-n="2" style={{ ...embudoN, color: VERDE }}>{estado.cargando ? '…' : ev.f2.length}</b>
          </span>
          {panelOculto
            ? <button data-mostrar-panel onClick={() => ponPanelOculto(false)} title="Enseñar los filtros" style={{ ...S.boton, padding: '2px 10px', fontSize: 13 }}>Filtros ▼</button>
            : <button data-ocultar-panel onClick={() => ponPanelOculto(true)} title="Ocultar los filtros (queda una línea con los encendidos y la tabla sube)" style={{ ...S.boton, padding: '2px 10px', fontSize: 13 }}>Filtros ▲</button>}
        </div>
        {panelOculto ? (
          <div data-resumen-filtros style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', padding: '0 10px 8px', fontSize: 13 }}>
            {vista.sectoresFuera.length > 0 && <span style={chipResumen}>Sin {vista.sectoresFuera.length} sector{vista.sectoresFuera.length === 1 ? '' : 'es'}
              <span data-quitar="sectores" title="Volver a poner todos los sectores" onClick={() => cambia(v => ({ ...v, sectoresFuera: [] }))} style={equis}>✕</span></span>}
            {encendidos.map(f => { const c = vista.filtros[f.id], n = ev.cuantos[f.id]
              return <span key={f.id} data-encendido={f.id} style={chipResumen}>{f.columna || f.nombre} {f.conEstrategia ? `(${estSenal ? estSenal.name : 'sin estrategia'}) en ${textoEncendido(f, c)}` : textoEncendido(f, c)}
                {n ? <b style={{ color: ROJO, fontWeight: 400 }}> −{n}</b> : null}
                <span data-quitar={f.id} title="Quitar este filtro" onClick={() => cambiaFiltro(f.id, { on: false })} style={equis}>✕</span></span> })}
            {!encendidos.length && !vista.sectoresFuera.length && <span style={S.apagado}>Ningún filtro encendido</span>}
          </div>
        ) : (
          <div data-panel-filtros style={{ padding: '6px 10px 10px', fontSize: 13 }}>
            {(piso === 'U' || piso === 'todos') && universoYSectores}
            {piso !== 'U' && rejilla(piso === 'todos' ? ['F', 'T'] : [piso])}
            {(piso === 'T' || piso === 'todos') && <div style={{ ...S.apagado, marginTop: 6 }}>Con velas diarias, cierre del {fechaCorta(fechaPrecios)} (piso Técnico). Un valor sin precios no pasa un filtro encendido.</div>}
            {(piso === 'T' || piso === 'todos') && conSenal?.on && <div style={{ ...S.apagado, marginTop: 4 }}>
              {conSenal.estrategia != null && !estSenal && estSenales.length > 0 && <span data-senal-sin style={{ color: AMARILLO }}>⚠ La estrategia de «Da señal de compra» ya no está (o es de velas semanales): elige otra. </span>}
              {conSenal.estrategia == null && estSenales.length > 0 && <span data-senal-elige>«Da señal de compra»: sin estrategia elegida, el filtro no quita nada. </span>}
              {estSenal && <span data-senal-estado>
                {calcSenal && calcSenal.clave === clave ? `Calculando ${calcSenal.hechos} de ${calcSenal.total}…`
                  : mapaVals.length ? `Calculado para ${mapaVals.length}${ultimaSenal ? ` · última vela del ${fechaCorta(ultimaSenal)}` : ''}${sinCalcularSenal ? ` · ${sinCalcularSenal} sin calcular` : ''}` : ''}</span>}
            </div>}
          </div>
        )}
      </div>

      {estado.error && <div style={{ color: ROJO }}>⚠ {estado.error}</div>}

      {/* Resultados, a todo el ancho */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
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
                  {[['simbolo', 'Valor'], ['sector', 'Sector'], ['precio', 'Precio $'], ...encendidos.map(f => [f.id, f.columna || f.nombre]), ...(vista.verExigido ? [['exigido', 'Crec. exigido'], ['esperado', 'Crec. esperado']] : [])].map(([k, t], i) => (
                    <th key={k} data-col={k} onClick={() => ordena(k)} title="Pulsa para ordenar"
                      style={{ ...cel, position: 'sticky', top: 0, background: B.cabecera, color: B.titulo, cursor: 'pointer', textAlign: i < 2 ? 'left' : 'right', fontWeight: 600, zIndex: 1 }}>
                      {t}{orden.col === k ? (orden.dir > 0 ? ' ▲' : ' ▼') : ''}</th>))}
                </tr></thead>
                <tbody>
                  {filas.map(e => { const dentro = ev.pasaTodo.has(e.simbolo), x = exigido(e)
                    return (
                      <tr key={e.simbolo} data-fila={e.simbolo} onClick={() => setDetalle(e.simbolo)} title="Pulsa para ver el detalle" style={{ opacity: dentro ? 1 : 0.5, cursor: 'pointer', background: detalle === e.simbolo ? B.sel : undefined }}>
                        <td style={{ ...cel, textAlign: 'left' }} title={e.aviso || undefined}><b style={{ color: B.enlace }}>{e.simbolo}</b> <span style={{ color: B.secundario }}>{e.nombre}</span></td>
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
            Cuentas de la SEC (EDGAR) del {fechaCorta(fecha)} · el PEG esperado es de Yahoo, solo de hoy · importes en millones de la moneda de sus cuentas · * sector aproximado (código SIC) · en <span style={{ color: ROJO }}>rojo</span>, la cifra que no pasa ese filtro (o el crecimiento exigido mayor que el esperado) · pasa el ratón por una cifra para ver de dónde sale
          </div>
        </div>
      </div>
      {lista && (
        <Pregunta id="lista" texto={`Guardar los ${ev.f2.length} valores que pasan como una lista de la Watchlist`} aviso={lista.error}
          detalle="La lista es FIJA: guarda los valores de hoy y no cambia sola. Los que no estén en tu Watchlist se añaden en el grupo «Screener»."
          extra={<input data-nombre-lista autoFocus value={lista.nombre} maxLength={120} onChange={e => setLista(l => ({ ...l, nombre: e.target.value, error: null }))}
            onKeyDown={e => { if (e.key === 'Enter' && !lista.guardando) guardaLista() }} style={{ ...caja, width: '100%', boxSizing: 'border-box', marginBottom: 16, fontSize: 14, padding: '6px 8px' }}/>}>
          <button data-p="cancelar" style={SA.boton} onClick={() => setLista(null)}>Cancelar</button>
          <button data-p="guardar-lista" disabled={lista.guardando || !lista.nombre.trim()} style={lista.guardando || !lista.nombre.trim() ? SA.botonDesactivado : SA.botonVerde} onClick={guardaLista}>{lista.guardando ? 'Guardando…' : 'Guardar lista'}</button>
        </Pregunta>)}
      {detalle && (() => { const e = empresas.find(x => x.simbolo === detalle); return e ? <Cajon e={e} vista={vista} dentro={ev.pasaTodo.has(e.simbolo)} nombreVista={nombreLimpio(actual.nombre)} onCierra={() => setDetalle(null)} onIrAValor={onIrAValor}/> : null })()}
      {pregunta?.tipo === 'salir' && (
        <Pregunta id="salir" texto={`Tienes cambios sin guardar en la vista «${nombreLimpio(actual.nombre) || 'Vista sin nombre'}».`}>
          <button data-p="cancelar" style={SA.boton} onClick={() => setPregunta(null)}>Cancelar</button>
          <button data-p="salir" style={SA.boton} onClick={() => { const a = pregunta.accion; setPregunta(null); descarta(); a() }}>Salir sin guardar</button>
          <button data-p="guardar" style={SA.botonVerde} onClick={async () => { const a = pregunta.accion; setPregunta(null); if (await guarda()) a() }}>Guardar</button>
        </Pregunta>)}
      {pregunta?.tipo === 'borrar' && (
        <Pregunta id="borrar" texto={`¿Borrar la vista «${nombreLimpio(actual.nombre) || 'Vista sin nombre'}»?`} aviso="No se puede deshacer.">
          <button data-p="cancelar" style={SA.boton} onClick={() => setPregunta(null)}>Cancelar</button>
          <button data-p="borrar" style={{ ...SA.boton, color: '#f85149', borderColor: '#f85149' }} onClick={borra}>Borrar</button>
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
      boxShadow: `-8px 0 24px ${B.sombra}`, padding: 16, overflowY: 'auto', boxSizing: 'border-box', fontFamily: B.letra, fontSize: 13, color: B.texto }}>
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
      <div data-exigido style={{ background: B.sel, border: `1px solid ${B.selBorde}`, borderRadius: 8, padding: '8px 10px', marginBottom: 12 }}>
        <b>Crecimiento que exige el precio:</b>{' '}
        {ex == null ? (e.moneda && e.moneda !== 'USD' ? `cuentas en ${e.moneda}: no se calcula.` : 'sin beneficio, no se calcula.')
          : <>PER {fmt(e.m.per)} ÷ PEG {fmt(vista.pegRazonable)} = <b>{fmt(ex)} % al año</b>.{' '}
            {e.m.crecEsperado != null ? <>Los analistas esperan {fmt(e.m.crecEsperado)} % (PER ÷ PEG esperado de Yahoo) → {ex > e.m.crecEsperado ? <b style={{ color: ROJO }}>el precio pide más de lo esperado</b> : <b style={{ color: VERDE }}>el precio pide menos de lo esperado</b>}.</> : 'Yahoo no da el crecimiento esperado.'}</>}
      </div>
      <div style={{ ...grupoEst, marginTop: 0 }}>1 · Fundamentales</div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}><tbody>{FILTROS.filter(f => f.piso === 'F').map(fila)}</tbody></table>
      <div style={grupoEst}>2 · Técnico</div>
      <table data-cajon-tecnico style={{ width: '100%', borderCollapse: 'collapse' }}><tbody>{FILTROS.filter(f => f.piso === 'T' && !f.proximamente).map(fila)}</tbody></table>
      <p style={{ color: B.apagado, fontSize: 12 }}>✓/✗ solo en los filtros encendidos de la vista; «·» = apagado (se ve el dato igualmente). Cuentas hasta el {fechaCorta(e.cuentasHasta)}{e.moneda && e.moneda !== 'USD' ? `, en ${e.moneda}` : ''}; precio del {fechaCorta(e.precioFecha)}{e.tecnico ? `; técnico con el cierre del ${fechaCorta(e.tecnico.fecha)}` : '; sin precios para el técnico'}{e.pegFecha ? `; PEG esperado del ${fechaCorta(e.pegFecha)}` : ''}.</p>
    </div>)
}
const grupoEst = { display: 'flex', alignItems: 'center', margin: '12px 0 4px', fontSize: 12, fontWeight: 700, color: B.secundario, textTransform: 'uppercase', letterSpacing: '0.04em' }
