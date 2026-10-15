// components/LaboratorioPanel.js — la pantalla «Laboratorio de señales».
//
// Constructor (un disparador, los filtros que se quieran, periodos y salida en velas) → la regla en castellano y si es
// OFICIAL (misma huella que un elemento de un lote declarado, lib/lotesLab.js) o EXPLORATORIA → /api/laboratorio, un
// periodo por petición (lib/laboratorio.js hace el cálculo) → resultado frente al azar y su registro en lab_pruebas
// (lib/registroLab.js; cada ejecución queda guardada, también las exploratorias, para saber cuántas cosas se probaron).
// Debajo, el estado del LOTE_1 según el registro y el historial. La configuración se recuerda en el navegador.
// «Probar: Salidas» (LOTE_2): entradas al azar y fijas (las del lote) o, en las exploratorias, un disparador; una salida
// del catálogo con su tope de tiempo; medida principal, la media por operación (lib/laboratorioSalidas.js).
import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { MONO, fmtDate, numeroEs } from '../lib/utils'
import CampoFecha from './CampoFecha'
import BotonCopiar from './BotonCopiar'
import { SENALES, CATALOGO, parametrosPorDefecto, validaCombinacion, SALIDAS, CATALOGO_SALIDAS, parametrosSalidaPorDefecto } from '../lib/senales'
import { LOTE_1, LOTE_2, configDe, configDeItem, configSalidasDe, validaConfig, esConfigSalidas } from '../lib/lotesLab'
import { clasificaConfig, guardarPrueba, cuentaPruebas, listarPruebas, leerPrueba, estadoLote, SELECT_HISTORIAL } from '../lib/registroLab'
import { veredictoLab, SALIDA_VELAS, N_SIM_LAB, MIN_OPERACIONES, PERCENTIL_PASA } from '../lib/laboratorio'
import { textoLaboratorio, CAB_LAB, filasLab, CAB_LAB_DETALLE, filasLabDetalle, CAB_LAB_EDGE, filasLabEdge, AVISO_POCAS_LAB, SIN_SECTOR_LAB, num, reglaLab,
         CAB_LAB_S, filasLabSalidas, CAB_LAB_S_INFO, filasLabSalidasInfo, CAB_LAB_S_OTROS, filasLabSalidasOtros, CAB_LAB_S_DETALLE, filasLabSalidasDetalle,
         CAB_LAB_ANIO, filasLabAnio, CAB_LAB_ACTIVO, filasLabActivo } from '../lib/exportaTexto'
import { getSupaUrl, getSupaH, hayConfigSupabase } from '../lib/supabase'

const CLAVE_LS = 'v50_laboratorio'
const GRIS = 'var(--text-legible)'
const TAM = 12
const ROJO = '#ff4d6d', VERDE = '#00e5a0', AMBAR = '#ffb020'
const caja = { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 6, padding: '10px 12px', marginBottom: 10 }
const etiqueta = { fontFamily: MONO, fontSize: TAM, color: GRIS, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }
const entrada = { background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontFamily: MONO, fontSize: TAM, padding: '4px 6px' }
const boton = { fontFamily: MONO, fontSize: TAM, padding: '4px 10px', borderRadius: 4, cursor: 'pointer', border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text)' }
const botonPrincipal = { ...boton, border: '1px solid var(--accent)', background: 'rgba(0,212,255,0.12)', color: 'var(--accent)', fontWeight: 700 }
const COLOR_ESTADO = { pasa: VERDE, 'no pasa': ROJO, 'datos insuficientes': AMBAR, pendiente: GRIS, 'sin veredicto': GRIS }

const DISPARADORES = CATALOGO.filter(s => s.clase === 'disparador')
const FILTROS = CATALOGO.filter(s => s.clase === 'filtro')
// Lo común del LOTE_1 que no se toca desde aquí: universo, temporalidad y entrada.
const { universo: UNIVERSO, intervalo: INTERVALO, entrada: ENTRADA } = LOTE_1.comun

// Parámetros ↔ textos de las cajas (coma decimal, sin separador de miles).
const aTexto = (v) => typeof v === 'number' ? String(v).replace('.', ',') : (v ?? '')
const textosDe = (params) => Object.fromEntries(Object.entries(params || {}).map(([k, v]) => [k, aTexto(v)]))
const paramsDe = (id, textos, cat = SENALES) => Object.fromEntries(cat[id].parametros.map(p => [p.clave, p.tipo === 'opcion' ? textos?.[p.clave] : numeroEs(textos?.[p.clave])]))
const senalUi = (id, params = null) => ({ id, textos: textosDe(params || parametrosPorDefecto(id)) })
// La configuración de una prueba guardada → lo que pinta el constructor.
const uiDe = (config) => ({ disparador: senalUi(config.senales.disparador.id, config.senales.disparador.params),
  filtros: (config.senales.filtros || []).map(f => senalUi(f.id, f.params)), periodos: config.periodos.map(p => ({ ...p })), salida: aTexto(config.salida?.n) })
const UI_DEFECTO = () => uiDe(configDeItem(LOTE_1, '2'))
const leeGuardado = () => { try { const x = JSON.parse(localStorage.getItem(CLAVE_LS) || 'null'); return x?.disparador?.id && SENALES[x.disparador.id] ? x : null } catch (_) { return null } }
// Modo Salidas: su constructor aparte (entradas al azar o con disparador, una condición de salida y el tope).
const CLAVE_LS_S = 'v50_laboratorio_salidas', CLAVE_LS_MODO = 'v50_laboratorio_modo'
const CONDICIONES_SALIDA = CATALOGO_SALIDAS.filter(s => !s.tiempo)
const salidaUi = (id, params = null) => ({ id, textos: textosDe(params || parametrosSalidaPorDefecto(id)) })
const uiSDe = (config) => {
  const cond = config.salidas.find(r => r.id !== 'tiempoMaximo'), tope = config.salidas.find(r => r.id === 'tiempoMaximo'), en = config.entradas, conSenal = en?.tipo === 'senal'
  return { tipoEntrada: conSenal ? 'senal' : 'azar', disparador: conSenal ? senalUi(en.disparador.id, en.disparador.params) : senalUi('ruptura'),
    filtros: conSenal ? (en.filtros || []).map(f => senalUi(f.id, f.params)) : [], condicion: cond && SALIDAS[cond.id] ? salidaUi(cond.id, cond.params) : null,
    tope: aTexto(tope?.params?.n), periodos: config.periodos.map(p => ({ ...p })) }
}
const UI_S_DEFECTO = () => uiSDe(configDeItem(LOTE_2, 'S1'))
const leeGuardadoS = () => { try { const x = JSON.parse(localStorage.getItem(CLAVE_LS_S) || 'null'); return x?.periodos && x?.disparador?.id && SENALES[x.disparador.id] && (!x.condicion || SALIDAS[x.condicion.id]) ? x : null } catch (_) { return null } }
const leeModo = () => { try { return localStorage.getItem(CLAVE_LS_MODO) === 'salidas' ? 'salidas' : 'entradas' } catch (_) { return 'entradas' } }
// Errores de los periodos del constructor (fechaOk: validez de cada caja de fecha, por modo).
function erroresPeriodos(periodos, fechaOk, modo) {
  const e = []
  if (!periodos.length) e.push('Hace falta al menos un periodo.')
  periodos.forEach((p, k) => {
    if (fechaOk[`${modo}|${k}d`] === false || fechaOk[`${modo}|${k}h`] === false) e.push(`Periodo ${k + 1}: hay una fecha mal escrita.`)
    else if (!(p.desde < p.hasta)) e.push(`Periodo ${k + 1}: «desde» tiene que ser anterior a «hasta».`)
  })
  return e
}

const etiquetaTipo = (c) => !c ? '…' : c.oficial ? `Oficial · ${c.lote} · ${c.item}` : 'Exploratoria'
const periodoCorto = (p) => `${String(p.desde).slice(0, 4)}–${String(p.hasta).slice(0, 4)}`
const reglaDe = (config) => reglaLab(config)
const ctxRegistro = () => ({ url: getSupaUrl(), headers: getSupaH() })

function Tabla({ cab, filas, colorFila = null }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', fontSize: TAM }}>
        <thead><tr>{cab.map((c, i) => <th key={i} style={{ textAlign: i ? 'right' : 'left', padding: '3px 8px', color: GRIS, fontWeight: 400, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{c}</th>)}</tr></thead>
        <tbody>{filas.map((f, j) => (
          <tr key={j} style={{ color: colorFila ? colorFila(j) : undefined }}>{f.map((c, i) => (
            <td key={i} style={{ textAlign: i ? 'right' : 'left', padding: '3px 8px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap', color: COLOR_ESTADO[c] && i === f.length - 1 ? COLOR_ESTADO[c] : undefined }}>{c}</td>))}
          </tr>))}</tbody>
      </table>
    </div>
  )
}

// Disparador y filtros de una entrada (modo Entradas, y las exploratorias con disparador del modo Salidas). valor tiene
// { disparador, filtros }; setValor recibe una función que devuelve el valor nuevo.
function ConstructorEntrada({ valor, setValor }) {
  const ponSenal = (cual, k, clave, v) => setValor(u => cual === 'disparador' ? { ...u, disparador: { ...u.disparador, textos: { ...u.disparador.textos, [clave]: v } } }
    : { ...u, filtros: u.filtros.map((f, j) => j === k ? { ...f, textos: { ...f.textos, [clave]: v } } : f) })
  return (<>
        <div style={caja}>
          <div style={etiqueta}>Disparador</div>
          <select value={valor.disparador.id} onChange={e => setValor(u => ({ ...u, disparador: senalUi(e.target.value) }))} style={{ ...entrada, width: '100%' }}>
            {DISPARADORES.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
          <Parametros senal={SENALES[valor.disparador.id]} textos={valor.disparador.textos} onCambio={(k, v) => ponSenal('disparador', 0, k, v)} />
        </div>

        <div style={caja}>
          <div style={etiqueta}>Filtros</div>
          {!valor.filtros.length && <div style={{ fontSize: TAM, color: GRIS }}>Sin filtros: entra con cada señal del disparador.</div>}
          {valor.filtros.map((f, k) => (
            <div key={k} style={{ borderTop: k ? '1px solid var(--border)' : 'none', paddingTop: k ? 6 : 0, marginTop: k ? 6 : 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <select value={f.id} onChange={e => setValor(u => ({ ...u, filtros: u.filtros.map((x, j) => j === k ? senalUi(e.target.value) : x) }))} style={{ ...entrada, flex: 1 }}>
                  {FILTROS.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                </select>
                <button onClick={() => setValor(u => ({ ...u, filtros: u.filtros.filter((_, j) => j !== k) }))} title="Quitar este filtro" style={boton}>✕</button>
              </div>
              <Parametros senal={SENALES[f.id]} textos={f.textos} onCambio={(c, v) => ponSenal('filtro', k, c, v)} />
            </div>))}
          <button onClick={() => setValor(u => ({ ...u, filtros: [...u.filtros, senalUi(FILTROS[0].id)] }))} style={{ ...boton, marginTop: 8 }}>+ Añadir filtro</button>
        </div>
  </>)
}

// Las cajas de los parámetros de una señal.
function Parametros({ senal, textos, onCambio }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
      {senal.parametros.map(p => (
        <label key={p.clave} style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: TAM, color: GRIS }}>
          {p.etiqueta}
          {p.tipo === 'opcion'
            ? <select value={textos[p.clave] ?? ''} onChange={e => onCambio(p.clave, e.target.value)} style={entrada}>{p.opciones.map(o => <option key={o} value={o}>{o}</option>)}</select>
            : <input type="text" inputMode="decimal" value={textos[p.clave] ?? ''} onChange={e => onCambio(p.clave, e.target.value)} style={{ ...entrada, width: 70 }} />}
        </label>))}
    </div>
  )
}

export default function LaboratorioPanel({ apiFetch, version = null }) {
  const [ui, setUi] = useState(() => leeGuardado() || UI_DEFECTO())
  useEffect(() => { try { localStorage.setItem(CLAVE_LS, JSON.stringify(ui)) } catch (_) {} }, [ui])
  const [fechaOk, setFechaOk] = useState({})
  const [modo, setModo] = useState(leeModo)
  useEffect(() => { try { localStorage.setItem(CLAVE_LS_MODO, modo) } catch (_) {} }, [modo])
  const [uiS, setUiS] = useState(() => leeGuardadoS() || UI_S_DEFECTO())
  useEffect(() => { try { localStorage.setItem(CLAVE_LS_S, JSON.stringify(uiS)) } catch (_) {} }, [uiS])

  // ── La configuración que sale del constructor, sus errores, su frase y si es oficial ──
  const combinacion = useMemo(() => ({ disparador: { id: ui.disparador.id, params: paramsDe(ui.disparador.id, ui.disparador.textos) },
    filtros: ui.filtros.map(f => ({ id: f.id, params: paramsDe(f.id, f.textos) })) }), [ui])
  const salida = numeroEs(ui.salida)
  const config = useMemo(() => configDe(combinacion, { universo: UNIVERSO, periodos: ui.periodos.map(p => ({ desde: p.desde, hasta: p.hasta })), intervalo: INTERVALO, entrada: ENTRADA,
    salida: { tipo: 'velas', n: salida } }), [combinacion, ui.periodos, salida])
  const errores = useMemo(() => {
    const e = [...validaCombinacion(combinacion)]
    if (!Number.isInteger(salida) || salida < 1 || salida > 250) e.push('La salida tiene que ser un número entero de velas entre 1 y 250.')
    return [...e, ...erroresPeriodos(ui.periodos, fechaOk, 'entradas')]
  }, [combinacion, salida, ui.periodos, fechaOk])
  // La frase, también con parámetros a medio escribir («…» donde falta un número).
  const frase = useMemo(() => {
    const conHuecos = (s) => ({ id: s.id, params: Object.fromEntries(Object.entries(s.params).map(([k, v]) => [k, v ?? '…'])) })
    return reglaLab({ senales: { disparador: conHuecos(combinacion.disparador), filtros: combinacion.filtros.map(conHuecos) }, salida: { n: salida ?? '…' } })
  }, [combinacion, salida])

  // ── Lo mismo en el modo Salidas ──
  const topeS = numeroEs(uiS.tope)
  const configS = useMemo(() => configSalidasDe({
    salidas: [...(uiS.condicion ? [{ id: uiS.condicion.id, params: paramsDe(uiS.condicion.id, uiS.condicion.textos, SALIDAS) }] : []), { id: 'tiempoMaximo', params: { n: topeS } }],
    entradas: uiS.tipoEntrada === 'azar' ? LOTE_2.comun.entradas
      : { tipo: 'senal', disparador: { id: uiS.disparador.id, params: paramsDe(uiS.disparador.id, uiS.disparador.textos) }, filtros: uiS.filtros.map(f => ({ id: f.id, params: paramsDe(f.id, f.textos) })) },
  }, { universo: LOTE_2.comun.universo, periodos: uiS.periodos.map(p => ({ desde: p.desde, hasta: p.hasta })), intervalo: LOTE_2.comun.intervalo, entrada: LOTE_2.comun.entrada }), [uiS, topeS])
  const erroresS = useMemo(() => [...validaConfig(configS), ...erroresPeriodos(uiS.periodos, fechaOk, 'salidas')], [configS, uiS.periodos, fechaOk])
  const fraseS = useMemo(() => {
    const huecos = (p) => Object.fromEntries(Object.entries(p || {}).map(([k, v]) => [k, v ?? '…']))
    const en = configS.entradas.tipo === 'senal' ? { ...configS.entradas, disparador: { ...configS.entradas.disparador, params: huecos(configS.entradas.disparador.params) },
      filtros: configS.entradas.filtros.map(f => ({ ...f, params: huecos(f.params) })) } : configS.entradas
    return reglaLab({ ...configS, entradas: en, salidas: configS.salidas.map(r => ({ ...r, params: huecos(r.params) })) })
  }, [configS])
  const configActiva = modo === 'salidas' ? configS : config
  const erroresActivos = modo === 'salidas' ? erroresS : errores
  const fraseActiva = modo === 'salidas' ? fraseS : frase
  const periodosActivos = modo === 'salidas' ? uiS.periodos : ui.periodos
  const ponPeriodos = (f) => (modo === 'salidas' ? setUiS : setUi)(u => ({ ...u, periodos: f(u.periodos) }))

  const [clas, setClas] = useState(null)
  useEffect(() => {
    let vivo = true
    clasificaConfig(configActiva).then(c => { if (vivo) setClas(c) }).catch(() => { if (vivo) setClas(null) })
    return () => { vivo = false }
  }, [configActiva])

  const ponPeriodo = (k, campo, v) => ponPeriodos(ps => ps.map((p, j) => j === k ? { ...p, [campo]: v } : p))
  // Poner en el constructor una configuración (de un lote o del historial), en su modo.
  const cargaConfig = (cfg) => {
    setFechaOk({})
    if (esConfigSalidas(cfg)) { setModo('salidas'); setUiS(uiSDe(cfg)) } else { setModo('entradas'); setUi(uiDe(cfg)) }
  }

  // ── Registro: contador, estado del lote, historial ──
  const [registro, setRegistro] = useState({ contador: null, lotes: null, historial: [], error: null, cargando: false })
  const recarga = useCallback(async () => {
    if (!hayConfigSupabase()) { setRegistro(r => ({ ...r, error: 'Sin conexión con la base de datos configurada: no se puede leer ni guardar el registro.' })); return }
    setRegistro(r => ({ ...r, cargando: true }))
    try {
      const ctx = ctxRegistro()
      const [contador, lote1, lote2, historial] = await Promise.all([cuentaPruebas(ctx), estadoLote(ctx, LOTE_1), estadoLote(ctx, LOTE_2), listarPruebas(ctx, { limite: 100, select: SELECT_HISTORIAL })])
      setRegistro({ contador, lotes: { LOTE_1: lote1, LOTE_2: lote2 }, historial, error: null, cargando: false })
    } catch (e) { setRegistro(r => ({ ...r, error: e?.message || 'No se pudo leer el registro.', cargando: false })) }
  }, [])
  useEffect(() => { recarga() }, [recarga])

  // ── Ejecución ──
  const [resultado, setResultado] = useState(null)
  const [progreso, setProgreso] = useState(null)   // { texto, hechos, total, inicio }
  const [errorEjec, setErrorEjec] = useState(null)
  const [ahora, setAhora] = useState(0)
  const parar = useRef(false)
  useEffect(() => { if (!progreso) return; const id = setInterval(() => setAhora(Date.now()), 1000); return () => clearInterval(id) }, [!!progreso])

  // Una configuración entera: un periodo por petición; después, el veredicto y el registro.
  const ejecutaConfig = async (cfg, c, avance) => {
    const periodos = [], datos = []
    for (let k = 0; k < cfg.periodos.length; k++) {
      if (parar.current) throw new Error('Parado a petición tuya: esta prueba no se ha guardado.')
      avance(k, `periodo ${k + 1} de ${cfg.periodos.length} (${periodoCorto(cfg.periodos[k])})`)
      const r = await apiFetch('/api/laboratorio', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ config: cfg, periodo: cfg.periodos[k] }) })
      let j = null
      try { j = await r.json() } catch (_) {}
      if (!r.ok) throw new Error(`El servidor no pudo calcular el periodo ${periodoCorto(cfg.periodos[k])}: ${j?.error || `HTTP ${r.status}`}`)
      periodos.push(j.resultado); datos.push({ simbolos: j.simbolos, sinDatos: j.sinDatos || [], aviso: j.aviso || null, tiempos: j.tiempos || null })
    }
    const veredicto = veredictoLab(c.oficial, periodos)
    const res = { config: cfg, clas: c, periodos, datos, veredicto, id: null, creado: null, regla: reglaDe(cfg), errorGuardar: null }
    try {
      const fila = await guardarPrueba({ config: cfg, resultados: { periodos, veredicto, datos: datos.map(({ simbolos, sinDatos, aviso }) => ({ simbolos, sinDatos, aviso })) }, versionApp: version }, ctxRegistro())
      res.id = fila?.id ?? null; res.creado = fila?.creado ?? null
    } catch (e) { res.errorGuardar = `No se pudo guardar en el registro: ${e?.message || e}` }
    return res
  }
  const lanza = async (trabajos) => {   // trabajos: [{ config, clas, nombre }]
    parar.current = false; setErrorEjec(null)
    const n = trabajos.length, porTrabajo = trabajos.map(t => t.config.periodos.length), total = porTrabajo.reduce((a, b) => a + b, 0)
    const inicio = Date.now()
    setAhora(inicio)
    let hechos = 0
    try {
      for (let i = 0; i < n; i++) {
        const t = trabajos[i]
        const res = await ejecutaConfig(t.config, t.clas, (k, txt) => setProgreso({ texto: `${n > 1 ? `Elemento ${t.nombre} (${i + 1} de ${n}) · ` : ''}${txt}`, hechos: hechos + k, total, inicio }))
        hechos += porTrabajo[i]
        setResultado(res)
        if (res.errorGuardar) { setErrorEjec(res.errorGuardar); break }
        recarga()
      }
    } catch (e) { setErrorEjec(e?.message || String(e)) }
    setProgreso(null)
    recarga()
  }
  // Se vuelve a clasificar aquí, con la configuración de este momento (la etiqueta de pantalla llega con un instante de retraso).
  const ejecutaActual = async () => {
    if (erroresActivos.length || progreso) return
    const cfg = configActiva, c = await clasificaConfig(cfg)
    lanza([{ config: cfg, clas: c, nombre: c.item || '' }])
  }
  const pendientesDe = (lote) => lote.items.filter(it => registro.lotes?.[lote.id]?.[it.id]?.estado === 'pendiente')
  const ejecutaPendientes = async (lote) => {
    const pendientes = pendientesDe(lote)
    if (progreso || !pendientes.length) return
    if (typeof window !== 'undefined' && !window.confirm(`Se van a ejecutar ${pendientes.length} elemento${pendientes.length > 1 ? 's' : ''} pendiente${pendientes.length > 1 ? 's' : ''} del ${lote.id} (${pendientes.map(p => p.id).join(', ')}). `
      + 'Cada uno queda registrado como prueba oficial y no se puede borrar desde la aplicación. ¿Seguir?')) return
    const trabajos = []
    for (const it of pendientes) {
      const cfg = configDeItem(lote, it.id), c = await clasificaConfig(cfg)
      if (!c.oficial || c.item !== it.id) { setErrorEjec(`El elemento ${it.id} no sale como oficial: no se ejecuta nada.`); return }
      trabajos.push({ config: cfg, clas: c, nombre: it.id })
    }
    lanza(trabajos)
  }
  const verPrueba = async (id) => {
    setErrorEjec(null)
    try {
      const f = await leerPrueba(ctxRegistro(), id)
      setResultado({ config: f.config, clas: { hash: f.hash_config, oficial: f.oficial, lote: f.lote, item: f.item_lote }, periodos: f.resultados?.periodos || [],
        datos: f.resultados?.datos || [], veredicto: f.resultados?.veredicto || '—', id: f.id, creado: f.creado, regla: reglaDe(f.config), errorGuardar: null, version: f.version_app })
    } catch (e) { setErrorEjec(e?.message || String(e)) }
  }
  const yaEjecutada = clas?.oficial ? registro.lotes?.[clas.lote]?.[clas.item] : null
  const resSalidas = esConfigSalidas(resultado?.config)

  const textoCopia = () => textoLaboratorio({ cabecera: { titulo: 'Laboratorio de señales', version: resultado.version || version, fecha: fmtDate(resultado.creado || new Date().toISOString()),
    datos: [['Universo', `${UNIVERSO.indice}: ${UNIVERSO.regla} (sin excluidos)`], ['Temporalidad', INTERVALO], ['Entrada', ENTRADA],
      ...(resSalidas ? [['Una operación por valor a la vez', 'sí']] : [['Salida', `${resultado.config?.salida?.n} velas contando la de entrada, al cierre`]]),
      ['Periodos', (resultado.config?.periodos || []).map(periodoCorto).join(', ')]] },
    regla: resultado.regla, clas: resultado.clas, config: resultado.config, veredicto: resultado.veredicto, periodos: resultado.periodos, datos: resultado.datos, id: resultado.id })

  const seg = progreso ? Math.max(0, Math.round((ahora - progreso.inicio) / 1000)) : 0
  // La tabla de un lote con su estado según el registro y «Ejecutar pendientes».
  const tablaLote = (lote, prueba) => {
    const est = registro.lotes?.[lote.id], pendientes = pendientesDe(lote)
    return (
        <div style={caja}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={etiqueta}>{lote.nombre}</span>
            <button onClick={() => ejecutaPendientes(lote)} disabled={!!progreso || !pendientes.length || !est} style={{ ...boton, opacity: progreso || !pendientes.length || !est ? 0.5 : 1 }}>Ejecutar pendientes ({est ? pendientes.length : '—'})</button>
          </div>
          <table style={{ borderCollapse: 'collapse', fontSize: TAM, width: '100%' }} data-prueba={prueba}>
            <tbody>{lote.items.map(it => {
              const e = est?.[it.id], estado = e?.estado || (est ? 'pendiente' : '—')
              return (
                <tr key={it.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '3px 4px', color: GRIS }}>{it.id}</td>
                  <td style={{ padding: '3px 4px' }}>{it.nombre}</td>
                  <td style={{ padding: '3px 4px', textAlign: 'right', color: COLOR_ESTADO[estado] || 'var(--text)', whiteSpace: 'nowrap' }}>
                    {e?.id ? <button onClick={() => verPrueba(e.id)} title="Ver el resultado registrado" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: MONO, fontSize: TAM, color: 'inherit', textDecoration: 'underline' }}>{estado}</button> : estado}
                  </td>
                  <td style={{ padding: '3px 4px', textAlign: 'right' }}>
                    <button onClick={() => cargaConfig(configDeItem(lote, it.id))} title="Poner este elemento en el constructor" style={{ ...boton, padding: '1px 6px' }}>↑</button>
                  </td>
                </tr>)
            })}</tbody>
          </table>
          <div style={{ fontSize: TAM, color: GRIS, marginTop: 6 }}>Estado según el registro (la prueba oficial más reciente de cada elemento). «↑» lo carga en el constructor.</div>
        </div>)
  }
  return (
    <div style={{ display: 'flex', flex: 1, minHeight: 0, height: '100%', overflow: 'hidden', fontFamily: MONO, color: 'var(--text)' }}>
      {/* ── Constructor y lote ── */}
      <div style={{ width: 400, flexShrink: 0, overflowY: 'auto', padding: 12, borderRight: '1px solid var(--border)' }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>🧪 Laboratorio de señales</div>
        <div style={{ fontSize: TAM, color: GRIS, marginBottom: 10 }} data-prueba="contador">
          {registro.contador ? <>Pruebas registradas: <b style={{ color: 'var(--text)' }}>{registro.contador.total}</b> · oficiales {registro.contador.oficiales} · exploratorias {registro.contador.exploratorias}</>
            : registro.cargando ? 'Leyendo el registro…' : 'Pruebas registradas: —'}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }} data-prueba="modo">
          <span style={{ ...etiqueta, marginBottom: 0 }}>Probar:</span>
          {[['entradas', 'Entradas'], ['salidas', 'Salidas']].map(([m, t]) => (
            <button key={m} onClick={() => { setFechaOk({}); setModo(m) }} aria-pressed={modo === m} style={modo === m ? botonPrincipal : boton}>{t}</button>))}
        </div>

        {modo === 'entradas' ? <ConstructorEntrada valor={ui} setValor={setUi} /> : (<>
          <div style={caja} data-prueba="entradas-salidas">
            <div style={etiqueta}>Entradas</div>
            {[['azar', `Al azar (fija, la del lote: 1 de cada ${num(1 / LOTE_2.comun.entradas.probabilidad, 0)} días candidatos)`], ['senal', 'Con un disparador (solo exploratorias)']].map(([t, txt]) => (
              <label key={t} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: TAM, marginBottom: 4, cursor: 'pointer' }}>
                <input type="radio" name="tipoEntradaLab" checked={uiS.tipoEntrada === t} onChange={() => setUiS(u => ({ ...u, tipoEntrada: t }))} />{txt}
              </label>))}
            {uiS.tipoEntrada === 'azar' && <div style={{ fontSize: TAM, color: GRIS, marginTop: 4 }}>Cada día en que el valor está en el índice, tiene datos y tiene calculados todos los indicadores del lote es entrada con probabilidad 1/{num(1 / LOTE_2.comun.entradas.probabilidad, 0)} (semilla {LOTE_2.comun.entradas.semilla}): las mismas señales para todas las salidas, así la entrada no aporta nada.</div>}
          </div>
          {uiS.tipoEntrada === 'senal' && <ConstructorEntrada valor={uiS} setValor={setUiS} />}
          <div style={caja} data-prueba="salida">
            <div style={etiqueta}>Salida</div>
            <select value={uiS.condicion?.id || ''} onChange={e => setUiS(u => ({ ...u, condicion: e.target.value ? salidaUi(e.target.value) : null }))} style={{ ...entrada, width: '100%' }}>
              <option value="">Ninguna: solo el tiempo máximo</option>
              {CONDICIONES_SALIDA.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
            {uiS.condicion && <Parametros senal={SALIDAS[uiS.condicion.id]} textos={uiS.condicion.textos} onCambio={(k, v) => setUiS(u => ({ ...u, condicion: { ...u.condicion, textos: { ...u.condicion.textos, [k]: v } } }))} />}
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: TAM, color: GRIS, marginTop: 8 }}>
              Como mucho
              <input type="text" inputMode="numeric" value={uiS.tope} onChange={e => setUiS(u => ({ ...u, tope: e.target.value }))} style={{ ...entrada, width: 50 }} />
              velas (contando la de entrada, al cierre)
            </label>
            <div style={{ fontSize: TAM, color: GRIS, marginTop: 6 }}>La condición se mira al cierre de cada vela desde la de entrada y se sale a la apertura siguiente; el tope sale al cierre de su vela; si coinciden en la misma vela, manda el tope. Sale con lo primero que salte.</div>
          </div>
        </>)}

        <div style={caja}>
          <div style={etiqueta}>{modo === 'salidas' ? 'Periodos' : 'Periodos y salida'}</div>
          {periodosActivos.map((p, k) => (
            <div key={`${modo}${k}`} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, fontSize: TAM, marginBottom: 6 }}>
              <span style={{ color: GRIS }}>{k + 1}.</span>
              <CampoFecha valor={p.desde} onCambio={v => ponPeriodo(k, 'desde', v)} onValidez={v => setFechaOk(o => ({ ...o, [`${modo}|${k}d`]: v }))} style={{ ...entrada, width: 96 }} avisoStyle={{ fontSize: TAM }} />
              <span style={{ color: GRIS }}>→</span>
              <CampoFecha valor={p.hasta} onCambio={v => ponPeriodo(k, 'hasta', v)} onValidez={v => setFechaOk(o => ({ ...o, [`${modo}|${k}h`]: v }))} style={{ ...entrada, width: 96 }} avisoStyle={{ fontSize: TAM }} />
              {periodosActivos.length > 1 && <button onClick={() => { setFechaOk({}); ponPeriodos(ps => ps.filter((_, j) => j !== k)) }} title="Quitar este periodo" style={boton}>✕</button>}
            </div>))}
          {periodosActivos.length < 3 && <button onClick={() => ponPeriodos(ps => [...ps, { desde: '2021-01-01', hasta: '2025-12-31' }])} style={{ ...boton, marginBottom: 8 }}>+ Añadir periodo</button>}
          {modo === 'entradas' && <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: TAM, color: GRIS }}>
            Salir a las
            <input type="text" inputMode="numeric" value={ui.salida} onChange={e => setUi(u => ({ ...u, salida: e.target.value }))} style={{ ...entrada, width: 50 }} />
            velas (contando la de entrada, al cierre)
          </label>}
          <div style={{ fontSize: TAM, color: GRIS, marginTop: 6 }}>Universo: miembros del Nasdaq-100 en cada fecha · diario · entrada a la apertura de la vela siguiente{modo === 'salidas' ? ' · una operación por valor a la vez' : ''}</div>
        </div>

        <div style={{ ...caja, borderColor: clas?.oficial ? 'var(--accent)' : 'var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={etiqueta}>La regla</span>
            <span data-prueba="tipo" style={{ fontSize: TAM, fontWeight: 700, padding: '1px 8px', borderRadius: 10, border: `1px solid ${clas?.oficial ? 'var(--accent)' : 'var(--border)'}`, color: clas?.oficial ? 'var(--accent)' : GRIS }}>{etiquetaTipo(clas)}</span>
          </div>
          <div data-prueba="frase" style={{ fontSize: 13, lineHeight: 1.45 }}>{fraseActiva}</div>
          {!clas?.oficial && <div style={{ fontSize: TAM, color: GRIS, marginTop: 6 }}>Exploratoria: no coincide exactamente con ningún elemento de un lote declarado. Se registra y se cuenta, pero no tiene veredicto.</div>}
          {yaEjecutada && yaEjecutada.estado !== 'pendiente' && <div style={{ fontSize: TAM, color: AMBAR, marginTop: 6 }}>Este elemento ya se ejecutó ({yaEjecutada.estado}). Repetirlo da el mismo resultado y cuenta como otra prueba.</div>}
          {erroresActivos.length > 0 && <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: TAM, color: ROJO }}>{erroresActivos.map((e, i) => <li key={i}>{e}</li>)}</ul>}
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button onClick={ejecutaActual} disabled={!!erroresActivos.length || !clas || !!progreso} style={{ ...botonPrincipal, opacity: erroresActivos.length || !clas || progreso ? 0.5 : 1 }}>▶ Ejecutar prueba</button>
          </div>
        </div>

        {tablaLote(LOTE_1, 'lote')}
        {tablaLote(LOTE_2, 'lote2')}
        {registro.error && <div style={{ fontSize: TAM, color: ROJO }}>{registro.error}</div>}
      </div>

      {/* ── Resultado e historial ── */}
      <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: 12 }}>
        {progreso && (
          <div style={caja} data-prueba="progreso">
            <div style={{ fontSize: TAM, marginBottom: 6 }}>Calculando: {progreso.texto} · {seg} s</div>
            <div style={{ height: 8, background: 'var(--bg)', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ width: `${Math.round(progreso.hechos / progreso.total * 100)}%`, height: '100%', background: 'var(--accent)', transition: 'width 0.3s' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, fontSize: TAM, color: GRIS }}>
              <span>{progreso.hechos} de {progreso.total} periodos · cada periodo tarda unos segundos (datos de ~150 valores y {num(N_SIM_LAB, 0)} simulaciones)</span>
              <button onClick={() => { parar.current = true }} style={boton}>Parar</button>
            </div>
          </div>)}
        {errorEjec && <div style={{ ...caja, borderColor: ROJO, color: ROJO, fontSize: TAM }}>{errorEjec}</div>}

        {!resultado && !progreso && (
          <div style={{ ...caja, fontSize: TAM, color: GRIS }}>Construye una regla a la izquierda y pulsa «Ejecutar prueba», o abre una del historial.</div>)}

        {resultado && (
          <div data-prueba="resultado">
            <div style={caja}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 260 }}>
                  <div style={{ fontSize: 13, lineHeight: 1.45 }}>{resultado.regla}</div>
                  <div style={{ fontSize: TAM, color: GRIS, marginTop: 4 }}>
                    {etiquetaTipo(resultado.clas)} · huella {String(resultado.clas?.hash || '').slice(0, 12)}… · {resultado.id != null ? `prueba ${resultado.id}${resultado.creado ? `, ${fmtDate(resultado.creado)}` : ''}` : 'no guardada'}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={etiqueta}>Veredicto</div>
                  <div data-prueba="veredicto" style={{ fontSize: 16, fontWeight: 700, color: COLOR_ESTADO[resultado.veredicto] || 'var(--text)' }}>{resultado.veredicto}</div>
                </div>
              </div>
              {resultado.errorGuardar && <div style={{ fontSize: TAM, color: ROJO, marginTop: 6 }}>{resultado.errorGuardar}</div>}
              <div style={{ marginTop: 8 }}><BotonCopiar obtenerTexto={textoCopia} /></div>
            </div>

            {resSalidas ? (<>
            <div style={caja}>
              <div style={etiqueta}>Resultado por periodo · medida principal: media por operación</div>
              <Tabla cab={CAB_LAB_S} filas={filasLabSalidas(resultado.periodos, resultado.clas?.oficial)} />
              <div style={{ fontSize: TAM, color: GRIS, marginTop: 6 }}>Rendimiento por operación bruto (sin comisiones). Azar: las mismas entradas, con las duraciones reales de cada valor repartidas al azar entre sus operaciones sin solaparse ({num(resultado.periodos[0]?.azar?.nSim ?? N_SIM_LAB, 0)} simulaciones con semilla fija).</div>
              <div style={{ marginTop: 10 }}><Tabla cab={CAB_LAB_S_DETALLE} filas={filasLabSalidasDetalle(resultado.periodos, resultado.datos)} /></div>
              {(resultado.datos || []).some(d => d?.aviso) && <div style={{ fontSize: TAM, color: AMBAR, marginTop: 6 }}>{resultado.datos.map(d => d?.aviso).filter(Boolean).join(' ')}</div>}
            </div>
            <div style={caja}>
              <div style={etiqueta}>Medidas informativas</div>
              <Tabla cab={CAB_LAB_S_INFO} filas={filasLabSalidasInfo(resultado.periodos)} />
              <div style={{ fontSize: TAM, color: GRIS, marginTop: 6 }}>P5: el peor 5 % de las operaciones. Duración: días en mercado (la del azar es la misma por construcción). Media por día: rendimiento por día invertido, para comparar salidas cortas y largas.</div>
            </div>
            <div style={caja}>
              <div style={etiqueta}>Otros azares · solo informativos</div>
              <Tabla cab={CAB_LAB_S_OTROS} filas={filasLabSalidasOtros(resultado.periodos)} />
              <div style={{ fontSize: TAM, color: GRIS, marginTop: 6 }}>«Del enunciado»: a cada operación, una duración del valor que quepa hasta la siguiente entrada; recorta las largas (fíjate en su duración) y en la calibración aprobaba el 84 % de las salidas sin ventaja, así que no da veredicto. «Re-simulado»: la misma secuencia de señales con duraciones del valor.</div>
            </div>
            </>) : (<>
            <div style={caja}>
              <div style={etiqueta}>Resultado por periodo</div>
              <Tabla cab={CAB_LAB} filas={filasLab(resultado.periodos, resultado.clas?.oficial)} />
              <div style={{ fontSize: TAM, color: GRIS, marginTop: 6 }}>Rendimiento por operación bruto (sin comisiones). Mediana del azar y P5–P95: de {num(resultado.periodos[0]?.azar?.nSim ?? N_SIM_LAB, 0)} simulaciones con semilla fija.</div>
              <div style={{ marginTop: 10 }}><Tabla cab={CAB_LAB_DETALLE} filas={filasLabDetalle(resultado.periodos, resultado.datos)} /></div>
              {(resultado.datos || []).some(d => d?.aviso) && <div style={{ fontSize: TAM, color: AMBAR, marginTop: 6 }}>{resultado.datos.map(d => d?.aviso).filter(Boolean).join(' ')}</div>}
            </div>

            <div style={caja}>
              <div style={etiqueta}>Edge Ratio · solo informativo</div>
              <Tabla cab={CAB_LAB_EDGE} filas={filasLabEdge(resultado.periodos)} />
              <div style={{ fontSize: TAM, color: GRIS, marginTop: 6 }}>Cuánto sube a favor frente a cuánto baja en contra tras la entrada, en ATR, a 5, 10 y 20 velas. No entra en el veredicto.</div>
            </div>
            </>)}

            <details style={caja}>
              <summary style={{ ...etiqueta, cursor: 'pointer', marginBottom: 0 }}>Desglose por año</summary>
              <div style={{ marginTop: 8 }}>
                <Tabla cab={CAB_LAB_ANIO(resSalidas)} filas={filasLabAnio(resultado.periodos, resSalidas)} />
              </div>
            </details>
            <details style={caja}>
              <summary style={{ ...etiqueta, cursor: 'pointer', marginBottom: 0 }}>Desglose por activo</summary>
              <div style={{ fontSize: TAM, color: AMBAR, margin: '8px 0' }}>{AVISO_POCAS_LAB}</div>
              {resultado.periodos.map((p, k) => (
                <div key={k} style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: TAM, fontWeight: 700, marginBottom: 4 }}>{periodoCorto(p)} · {num(p.porActivo?.length, 0)} valores con operaciones</div>
                  <Tabla cab={CAB_LAB_ACTIVO(resSalidas)} colorFila={j => (p.porActivo[j]?.operaciones ?? 0) < 30 ? GRIS : undefined} filas={filasLabActivo(p, resSalidas)} />
                </div>))}
            </details>
            <details style={caja}>
              <summary style={{ ...etiqueta, cursor: 'pointer', marginBottom: 0 }}>Desglose por sector</summary>
              <div style={{ fontSize: TAM, color: GRIS, marginTop: 8 }}>{SIN_SECTOR_LAB}</div>
            </details>
          </div>)}

        <div style={{ ...caja, fontSize: TAM, lineHeight: 1.5 }} data-prueba="como-leer">
          <div style={etiqueta}>Cómo leer esto</div>
          {modo === 'salidas' ? (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>Aquí se prueba solo la <b>salida</b>: las entradas son al azar y las mismas para todas las salidas (1 de cada {num(1 / LOTE_2.comun.entradas.probabilidad, 0)} días candidatos, semilla fija), así que la entrada no aporta nada. Una operación por valor a la vez.</li>
            <li><b>Media</b>: el rendimiento medio por operación. Es la medida principal: una salida vale por cuánto deja correr lo bueno y corta lo malo, y eso lo recoge la media (la mediana no ve el tamaño de las grandes).</li>
            <li><b>Azar</b>: las mismas operaciones (mismas entradas), pero las duraciones reales de cada valor repartidas al azar entre ellas, sin solaparse, {num(N_SIM_LAB, 0)} veces. Si la salida no sabe cuándo salir, su media se parece a la del azar (percentil cerca de 50); {PERCENTIL_PASA} o más, mejor que {PERCENTIL_PASA} de cada 100 repartos.</li>
            <li><b>Pasa</b> solo una prueba oficial con al menos {MIN_OPERACIONES} operaciones y percentil de la media {PERCENTIL_PASA} o más en <b>todos</b> los periodos. Si le faltan operaciones: «datos insuficientes». Las exploratorias no tienen veredicto.</li>
            <li>Informativas: la <b>mediana</b>, el <b>P5</b> (cuánto duelen las peores), el <b>% de acierto</b>, la <b>duración</b> (días en mercado; la del azar es la misma) y la <b>media por día</b> en mercado (para comparar una salida corta con una larga).</li>
            <li>Cuantas más reglas se prueban, más fácil es que alguna salga bien por casualidad: por eso se cuentan todas (arriba a la izquierda). Todo es bruto: sin comisiones ni impuestos.</li>
          </ul>) : (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><b>Mediana</b>: el rendimiento de la operación típica (la mitad gana más y la mitad menos). Es la medida principal; la media se deja arrastrar por unas pocas operaciones enormes.</li>
            <li><b>Azar</b>: en cada valor se colocan el mismo número de operaciones, de las mismas velas, en fechas al azar del periodo (sin solaparse y solo cuando el valor estaba en el índice), {num(N_SIM_LAB, 0)} veces. El <b>percentil</b> dice en cuántas de cada 100 el azar salió peor que la regla: 50 es «igual que el azar»; {PERCENTIL_PASA} o más, mejor que {PERCENTIL_PASA} de cada 100.</li>
            <li><b>Pasa</b> solo una prueba oficial con al menos {MIN_OPERACIONES} operaciones y percentil {PERCENTIL_PASA} o más en <b>todos</b> los periodos. Si le faltan operaciones: «datos insuficientes». Las exploratorias no tienen veredicto: sirven para mirar, no para decidir.</li>
            <li>Cuantas más reglas se prueban, más fácil es que alguna salga bien por casualidad: por eso se cuentan todas (arriba a la izquierda).</li>
            <li>El Edge Ratio y los desgloses son para entender el resultado, no lo cambian. Todo es bruto: sin comisiones ni impuestos.</li>
          </ul>)}
        </div>

        <div style={caja} data-prueba="historial">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={etiqueta}>Historial</span>
            <button onClick={recarga} disabled={registro.cargando} style={boton}>↻ Actualizar</button>
          </div>
          {!registro.historial.length ? <div style={{ fontSize: TAM, color: GRIS }}>{registro.cargando ? 'Leyendo…' : 'Todavía no hay pruebas registradas.'}</div> : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', fontSize: TAM }}>
                <thead><tr>{['Fecha', 'Regla', 'Tipo', 'Percentiles', 'Veredicto', ''].map((c, i) => <th key={i} style={{ textAlign: 'left', padding: '3px 8px', color: GRIS, fontWeight: 400, borderBottom: '1px solid var(--border)' }}>{c}</th>)}</tr></thead>
                <tbody>{registro.historial.map(h => (
                  <tr key={h.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '3px 8px', whiteSpace: 'nowrap' }}>{fmtDate(h.creado)}</td>
                    <td style={{ padding: '3px 8px', minWidth: 240 }}>{h.config ? reglaDe(h.config) : '—'}</td>
                    <td style={{ padding: '3px 8px', whiteSpace: 'nowrap', color: h.oficial ? 'var(--accent)' : GRIS }}>{h.oficial ? `Oficial · ${h.lote} · ${h.item_lote}` : 'Exploratoria'}</td>
                    <td style={{ padding: '3px 8px', whiteSpace: 'nowrap' }}>{[h.p0, h.p1, h.p2].map((p, k) => p == null ? null : `${h.config?.periodos?.[k] ? periodoCorto(h.config.periodos[k]) + ': ' : ''}${num(Number(p), 1)}`).filter(Boolean).join(' · ') || '—'}</td>
                    <td style={{ padding: '3px 8px', whiteSpace: 'nowrap', color: COLOR_ESTADO[h.veredicto] || 'var(--text)' }}>{h.veredicto || '—'}</td>
                    <td style={{ padding: '3px 8px', whiteSpace: 'nowrap' }}>
                      <button onClick={() => verPrueba(h.id)} style={{ ...boton, padding: '1px 6px' }}>Ver</button>{' '}
                      {(h.config?.senales || esConfigSalidas(h.config)) && <button onClick={() => cargaConfig(h.config)} title="Poner esta regla en el constructor" style={{ ...boton, padding: '1px 6px' }}>↑</button>}
                    </td>
                  </tr>))}</tbody>
              </table>
            </div>)}
        </div>
      </div>
    </div>
  )
}
