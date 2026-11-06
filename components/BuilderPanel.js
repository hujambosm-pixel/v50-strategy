// components/BuilderPanel.js — la pestaña «Builder» (docs/builder.md): tanda 1 con el aspecto del boceto (tanda 1b). La barra de
// los tres pasos (indicativa) y «Mi trabajo», la lista de mis estrategias (lib/builder/misListas.js), con el estilo de
// lib/builder/estilo.js (solo el Builder; el resto de la app no cambia). §58: «Mi trabajo» compacto: arriba a la derecha, «En blanco» y «Desde una plantilla»; duplicar, el icono de cada fila; una línea por estrategia y el buscador arriba de la lista. No crea nada por su cuenta: abre el editor por tarjetas
// (V9.1043, components/BuilderEditor.js, el paso 1) con una COPIA nueva (de la plantilla o de la estrategia elegida), que se guarda
// al pulsar «Guardar y pasar al paso 2»; una estrategia de código se abre en su apartado «Código de la estrategia» (V9.1048). El paso 2
// («Probarla contra el azar») es otra pantalla del propio Builder: components/BuilderAzar.js (§45–§46). §59: un solo sistema de pruebas; las antiguas de lotes se retiraron. Se edita pulsando el nombre.
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { PLANTILLAS, VACIA } from '../lib/builder/plantillas'
import { AYUDA_MI_TRABAJO, construyeMisEstrategias, CHIP_AZAR } from '../lib/builder/misListas'
import { ctxConSesion, getSupaUrl, getSupaH, hayConfigSupabase } from '../lib/supabase'
import { listarPlanes, listarPruebasUsuario } from '../lib/builder/planesGuardados'
import { B, S } from '../lib/builder/estilo'
import BuilderAzar from './BuilderAzar'
import BuilderPlan from './BuilderPlan'
import BuilderEditor from './BuilderEditor'
import BuilderCodigo from './BuilderCodigo'
import { esDeCodigo, filaCopiaCodigo } from '../lib/builder/codigo'
import BuilderGuia from './BuilderGuia'
import TesisEnlace from './TesisEnlace'
import { listarEnlacesTesis, tesisDe } from '../lib/tesis'
import { coincide, conNombres } from '../lib/builder/buscar'
import Resaltado from './Resaltado'
import ConLimpiar from './LimpiarBusqueda'
import ProteccionPanel from './ProteccionPanel'
import Ayuda from './BuilderAyuda'
import { IconoDuplicar } from './BuilderPestanas'
import { Papelera } from './VentanaPregunta'
import { VentanaBorrarEstrategia, VentanaBorrarPrueba } from './BorrarPrueba'
import { borrarPrueba, borrarPruebasDeEstrategia } from '../lib/pruebaAzar'

export const PASOS = ['Crear la estrategia', 'Probarla contra el azar', 'Convertirla en plan']
export const PASOS_CORTOS = ['Crear', 'Probar contra el azar', 'Convertirla en plan']   // §56: el nombre al lado de cada círculo de la cabecera B
export const SUBTITULOS_PASOS = ['Cuándo compro, cuándo vendo y cuánto arriesgo', '¿Gana por algo más que suerte?', 'Dinero real, aportaciones e impuestos']
// La firma de lo leído de la base (id y fecha o resultado): si no cambia, no se recalcula «Mi trabajo».
export const firmaDatos = (planes, pruebasAzar, tesis) => JSON.stringify([(planes || []).map(p => [p.id, p.updated_at]), pruebasAzar && pruebasAzar.map(p => [p.id, p.resultado?.id ?? null]), (tesis || []).map(t => [t.id, t.updated_at])])
const campoSel = { fontFamily: B.letra, fontSize: B.base, background: B.fondo, color: B.texto, border: `1px solid ${B.borde}`, borderRadius: B.radioBoton, padding: '7px 10px' }
const celda = { padding: '10px 12px', borderBottom: `1px solid ${B.borde}`, verticalAlign: 'top', textAlign: 'left' }
const cabecera = { ...celda, color: B.secundario, fontWeight: 600, fontSize: 12, position: 'sticky', top: 0, background: B.cabecera }
const params = (p) => { try { return typeof p === 'string' ? JSON.parse(p || '{}') : (p || {}) } catch (_) { return {} } }
const copia = (x) => JSON.parse(JSON.stringify(x))
const fila = { ...celda, padding: '6px 12px', verticalAlign: 'middle', whiteSpace: 'nowrap', fontSize: 13 }
const botonPeque = { padding: '4px 12px', fontSize: 13 }
const iconoFila = { background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px 3px', display: 'inline-flex', alignItems: 'center', color: B.secundario }
export const menuFijo = { zIndex: 40, padding: 6, background: B.tarjeta, border: `1px solid ${B.borde}`, borderRadius: B.radioBoton, boxShadow: '0 8px 24px rgba(0,0,0,0.45)', opacity: 1 }
export const opcionMenu = { ...S.enlace, display: 'block', width: '100%', padding: '5px 6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }

// §58: un desplegable (fondo opaco) que se cierra al pulsar fuera o con Esc. boton(abierto, alterna, ref) lo pinta quien lo usa.
export function useDesplegable() {
  const [abierto, setAbierto] = useState(false)
  const caja = useRef(null)
  useEffect(() => {
    if (!abierto) return
    const fuera = (e) => { if (caja.current && !caja.current.contains(e.target)) setAbierto(false) }
    const esc = (e) => { if (e.key === 'Escape') setAbierto(false) }
    document.addEventListener('mousedown', fuera); document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('keydown', esc) }
  }, [abierto])
  return { abierto, setAbierto, caja }
}
// «Desde una plantilla»: su regla, en el tooltip de cada una.
function MenuPlantillas({ plantillas, onElige }) {
  const { abierto, setAbierto, caja } = useDesplegable()
  return (
    <span ref={caja} style={{ position: 'relative' }}>
      <button data-boton="desde-plantilla" aria-expanded={abierto} style={{ ...S.boton, ...botonPeque }} onClick={() => setAbierto(x => !x)}>Desde una plantilla ▾</button>
      {abierto && <div data-menu="plantillas" style={{ ...menuFijo, position: 'absolute', top: '100%', right: 0, marginTop: 4, width: 320, maxWidth: '86vw', maxHeight: 340, overflowY: 'auto' }}>
        {plantillas.map(p => <button key={p.id} data-plantilla={p.id} title={String(p.regla || '').replace(/\*\*/g, '')} style={opcionMenu} onClick={() => { setAbierto(false); onElige(p) }}>{p.titulo}</button>)}
      </div>}
    </span>
  )
}
// La columna «Prueba contra el azar»: el resultado corto, cuándo y en qué valor (solo en el tooltip si no cabe) y «Ver».
function CeldaAzar({ f, onVer, onBorrar }) {
  if (!f.azar) return <span style={{ color: B.apagado }}>{f.origen === 'código' ? 'No se prueba aquí' : '—'}</span>
  const [tipo, txt] = CHIP_AZAR[f.azar.clave]
  return <span data-azar={f.azar.clave} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={S.chip(tipo)}>{txt}</span>{f.azar.detalle && <span style={S.apagado}>{f.azar.detalle}</span>}{f.azar.hay && <button data-ver-prueba style={{ ...S.enlace, fontSize: 12 }} onClick={onVer}>Ver</button>}{f.azar.fila && <button data-borrar-prueba={f.azar.fila.id} aria-label="Borrar esta prueba" title="Borrar esta prueba" style={iconoFila} onClick={onBorrar}><Papelera tamano={14}/></button>}</span>
}
// La columna «Planes»: cuántos, los nombres en el tooltip y «Abrir» (si hay varios, un desplegable). En una tabla con barra de desplazamiento: el desplegable va fijo a la ventana, para que no se corte.
function CeldaPlanes({ planes, onAbrir }) {
  const { abierto, setAbierto, caja } = useDesplegable()
  const [donde, setDonde] = useState(null)
  if (!planes.length) return <span data-planes-n="0" style={{ color: B.apagado }}>0</span>
  const nombres = planes.map(p => p.nombre).join(' · ')
  return (
    <span ref={caja} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span data-planes-n={planes.length} title={nombres} style={{ cursor: 'default', textDecoration: 'underline dotted' }}>{planes.length}</span>
      {planes.length === 1 ? <button data-abrir-plan-fila={planes[0].id} title={`Abrir «${planes[0].nombre}» en el paso 3`} style={{ ...S.enlace, fontSize: 13 }} onClick={() => onAbrir(planes[0].id)}>Abrir</button>
        : <button data-abrir-planes aria-expanded={abierto} style={{ ...S.enlace, fontSize: 13 }} onClick={e => { const r = e.currentTarget.getBoundingClientRect(); setDonde({ top: r.bottom + 4, left: r.left }); setAbierto(x => !x) }}>Abrir ▾</button>}
      {abierto && <div data-menu="planes" style={{ ...menuFijo, position: 'fixed', ...(donde || {}), width: 260, maxWidth: '86vw' }}>
        {planes.map(p => <button key={p.id} data-abrir-plan-fila={p.id} title={p.nombre} style={opcionMenu} onClick={() => { setAbierto(false); onAbrir(p.id) }}>{p.nombre}</button>)}
      </div>}
    </span>
  )
}

// La barra de los tres pasos; `actual` resaltado. §45: con onPaso(n), los pasos que no son el actual se pulsan (§48: también el 3);
// desactivados (string: el motivo, en el título) no se pulsan.
export function BarraPasos({ actual = 1, onPaso = null, desactivados = {} }) {
  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }} aria-label="Pasos del Builder">
      {PASOS.map((p, k) => {
        const n = k + 1, on = n === actual, pulsable = !!onPaso && !on && !desactivados[n], Caja = pulsable ? 'button' : 'div'
        return (
          <Caja key={p} data-paso={n} aria-current={on ? 'step' : undefined} onClick={pulsable ? () => onPaso(n) : undefined} title={pulsable ? `Ir al paso ${n}` : desactivados[n] || undefined}
            style={{ flex: '1 1 200px', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: B.radioTarjeta, fontFamily: B.letra, fontSize: B.base, textAlign: 'left', cursor: pulsable ? 'pointer' : 'default',
            border: `1px solid ${on ? B.pasoBorde : pulsable ? B.siguienteBorde : B.borde}`, background: on ? B.pasoFondo : B.tarjeta }}>
            <span style={{ width: 28, height: 28, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontWeight: 700,
              background: on ? B.verde : 'transparent', color: on ? B.sobreVerde : B.secundario, border: on ? 'none' : `1px solid ${B.borde}` }}>{n}</span>
            <span style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontWeight: 700, color: on ? B.titulo : B.secundario }}>{p}</span>
              <span style={{ fontSize: 12, color: on ? B.secundario : B.apagado }}>{SUBTITULOS_PASOS[k]}</span>
            </span>
          </Caja>
        )
      })}
    </div>
  )
}

// §54: la CABECERA B de los pasos 1, 2 y 3: a la izquierda, la ruta «Builder › Mi trabajo › <estrategia>» (onVolver(): «Builder»; onVolver('miTrabajo'): «Mi trabajo»); a la derecha, los pasos como
// círculos pequeños: ✓ en los hechos (hechos: { n: true/false }; por defecto, los anteriores al actual), el actual en verde. Se pulsan como la barra: desactivados (string: el motivo, en el tooltip) no.
// bloqueada: mientras corre algo, nada se pulsa. §56: cada círculo con su nombre al lado (hecho: ✓ de borde verde y texto apagado; actual: círculo verde relleno con su número y texto en negrita blanco;
// pendiente: número y texto apagados). En una ventana estrecha (< 900 px) el texto se oculta y queda el círculo con el nombre en el tooltip.
// enlace: lo que va a la derecha de la ruta («💡 …», components/TesisEnlace.js).
export function CabeceraPasos({ actual = 1, onPaso = null, desactivados = {}, hechos = {}, estrategia = null, onVolver = null, bloqueada = false, enlace = null }) {
  const miga = { ...S.enlace, color: B.secundario, fontSize: 13 }, sep = <span aria-hidden="true" style={{ color: B.apagado }}>›</span>
  return (
    <div data-cabecera-b style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
      <nav aria-label="Dónde estás" style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: '1 1 240px' }}>
        <button data-ruta="builder" style={miga} disabled={bloqueada || !onVolver} onClick={() => onVolver?.()}>Builder</button>{sep}
        <button data-ruta="mi-trabajo" style={miga} disabled={bloqueada || !onVolver} onClick={() => onVolver?.('miTrabajo')}>Mi trabajo</button>
        {estrategia && <>{sep}<span data-ruta="estrategia" title={estrategia} style={{ color: B.titulo, fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{estrategia}</span></>}
        {enlace && <span style={{ flex: 'none', marginLeft: 10 }}>{enlace}</span>}
      </nav>
      <style>{`@media (max-width: 900px) { .bp-nombre-paso { display: none } }`}</style>
      <div aria-label="Pasos del Builder" style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 'none' }}>
        {PASOS.map((p, k) => {
          const n = k + 1, on = n === actual, hecho = hechos[n] ?? n < actual, pulsable = !!onPaso && !on && !desactivados[n] && !bloqueada, Caja = pulsable ? 'button' : 'span'
          return (<span key={p} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {k > 0 && <span aria-hidden="true" style={{ width: 24, height: 1, background: B.borde }}/>}
            <Caja data-paso={n} data-hecho={hecho && !on ? '1' : undefined} aria-current={on ? 'step' : undefined} aria-label={`Paso ${n}: ${p}`} onClick={pulsable ? () => onPaso(n) : undefined} title={desactivados[n] || (pulsable ? `Ir al paso ${n}: ${p}` : `Paso ${n}: ${p}`)}
              style={{ padding: 0, background: 'transparent', border: 'none', display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: B.letra, cursor: pulsable ? 'pointer' : 'default' }}>
              <span data-circulo style={{ width: 24, height: 24, flex: 'none', borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700,
                background: on ? B.verde : 'transparent', color: on ? B.sobreVerde : hecho ? '#7ee2a0' : desactivados[n] ? B.apagado : B.secundario, border: on ? 'none' : `1px solid ${hecho ? B.pasoBorde : pulsable ? B.siguienteBorde : B.borde}` }}>{hecho && !on ? '✓' : n}</span>
              <span className="bp-nombre-paso" data-nombre-paso style={{ fontSize: 13, whiteSpace: 'nowrap', fontWeight: on ? 700 : 400, color: on ? B.titulo : B.apagado }}>{PASOS_CORTOS[k]}</span>
            </Caja>
          </span>)
        })}
      </div>
    </div>
  )
}

// La fila que se manda al editor para una copia nueva de una estrategia guardada: sin id, «<nombre> (copia)». Una de código
// (V9.1048) se copia entera, con su código: se abre en el apartado «Código de la estrategia».
export const filaCopia = (s) => esDeCodigo(s) ? filaCopiaCodigo(s) : ({ id: null, name: `${s.name} (copia)`, description: s.description || '', definition: copia(s.definition), params: params(s.params), copiaDe: s.name })

// estrategias: las de la página (strategies). datosIniciales (opcional, para las pruebas): { planes, pruebasAzar, tesis } en lugar de leerlos;
// listasIniciales (opcional, para las pruebas de montaje): { estrategias } ya calculadas.
// visible: si la pestaña se ve. Cada vez que pasa a verse (al entrar o al volver del editor) se vuelve a leer la base, sin
// enseñar «Cargando» y sin recalcular si no ha cambiado nada (firmaDatos). Las estrategias llegan de la página.
// apiFetch y version: para el paso 1 (guardar) y el paso 2. onGuardada: la página recarga sus estrategias. vistaInicial (opcional,
// para las pruebas): la guía ({ guia: true }), el editor ({ editor: fila }) o la
// prueba contra el azar de §45 ({ azar: { estrategiaId } }, components/BuilderAzar.js: se abre desde la barra de pasos) o el paso 3
// de §48 ({ plan: { estrategiaId } }, components/BuilderPlan.js: desde la barra de pasos y desde el resultado del paso 2).
// Las estrategias se abren aquí, en el paso 1: las de tarjetas en el editor por tarjetas y las de código (V9.1048) en el apartado
// «Código de la estrategia». onAbrirEstrategia(s, 'editor') las abre en el Editor clásico (la pestaña «Editor»). onBacktestValor:
// el enlace «Backtest de un valor» (la pestaña donde se ejecutan y se ven en el gráfico). abrir ({ fila, n }): la página pide
// abrir una estrategia (al pulsar su nombre en «Backtest de un valor»); cada n nuevo la abre. §55: { planId, n }, un plan en el paso 3. V9.1058: buscarInicial (para las pruebas de montaje): lo escrito en el buscador de «Mi trabajo».
export default function BuilderPanel({ estrategias = [], salida = null, onAbrirEstrategia, onAbrirTesis = null, onBacktestValor, onGuardada, datosIniciales = null, listasIniciales = null, visible, apiFetch, version, vistaInicial = null, abrir = null, comisiones = null, buscarInicial = '', datosLista = null }) {
  // §58: planes y pruebasAzar (null: no se han podido leer; entonces la fila dice «—»).
  const [datos, setDatos] = useState(() => datosIniciales || { planes: [], pruebasAzar: null, tesis: [], cargando: !datosIniciales, error: null })
  const [filasE, setFilasE] = useState(listasIniciales?.estrategias || null)
  const [buscar, setBuscar] = useState(buscarInicial)   // V9.1058: el buscador de «Mi trabajo» (por nombre y por la frase de la regla; V9.1063: resaltado)
  const [borrando, setBorrando] = useState(null)   // §58: la fila de la estrategia que pide «¿Eliminar?»
  const [borrandoP, setBorrandoP] = useState(null)   // §60: la prueba que pide «¿Borrar esta prueba?»
  const [borrandoYa, setBorrandoYa] = useState(false)
  const [falloBorrar, setFalloBorrar] = useState(null)
  const [borradas, setBorradas] = useState([])   // lo recién borrado, hasta que la página recargue sus estrategias
  const [azar, setAzar] = useState(vistaInicial?.azar ? { ...vistaInicial.azar, n: 0 } : null)   // §45: «Probarla contra el azar» (azar re-simulado), si está abierta
  const [plan, setPlan] = useState(vistaInicial?.plan ? { ...vistaInicial.plan, n: 0 } : null)   // §48: «Convertirla en plan» (paso 3), si está abierta
  const [editor, setEditor] = useState(vistaInicial?.editor ? { fila: vistaInicial.editor, n: 0 } : null)   // el paso 1 (editor por tarjetas), si está abierto
  const [guardadas, setGuardadas] = useState([])   // lo recién guardado, hasta que la página recargue sus estrategias
  const [guia, setGuia] = useState(!!vistaInicial?.guia)   // la «Guía de las pruebas» (vistaInicial { guia: true }, para las pruebas)
  const firma = useRef(null)
  const recarga = useCallback(async () => {
    if (datosIniciales) return
    if (!hayConfigSupabase()) { setDatos({ planes: [], pruebasAzar: null, tesis: [], cargando: false, error: 'Sin conexión con la base de datos: solo se ven las estrategias.' }); return }
    try {
      const ctx = ctxConSesion(), [planes, pruebasAzar, tesis] = await Promise.all([listarPlanes(ctx).catch(() => []), listarPruebasUsuario(ctx).catch(() => null), listarEnlacesTesis(ctx).catch(() => [])])
      const f = firmaDatos(planes, pruebasAzar, tesis)
      if (f === firma.current) return   // nada nuevo: no se toca
      firma.current = f
      setDatos({ planes, pruebasAzar, tesis, cargando: false, error: null })
    } catch (e) { setDatos(d => ({ ...d, cargando: false, error: e.message })) }
  }, [datosIniciales])
  useEffect(() => { if (visible !== false) recarga() }, [visible, recarga])
  // V9.1065: cada vez que se entra en el Builder, todas las búsquedas vacías (no se recuerda lo escrito; `entrada` lo dice al editor
  // y a «Señales en el gráfico») y el cursor en la casilla de búsqueda de «Mi trabajo» (Mis estrategias), listo para escribir.
  const casillaMiTrabajo = useRef(null), yaVisto = useRef(false)
  const [entrada, setEntrada] = useState(0)
  useEffect(() => {
    if (visible === false) return
    if (yaVisto.current) { setBuscar(''); setEntrada(n => n + 1) }
    yaVisto.current = true
    if (!editor && !guia) { const h = setTimeout(() => casillaMiTrabajo.current?.focus({ preventScroll: true }), 0); return () => clearTimeout(h) }
  }, [visible])
  useEffect(() => {
    if (listasIniciales) return
    let vivo = true
    construyeMisEstrategias({ estrategias, planes: datos.planes, pruebasAzar: datos.pruebasAzar }).then(f => { if (vivo) setFilasE(f) }).catch(() => { if (vivo) setFilasE([]) })
    return () => { vivo = false }
  }, [estrategias, datos.planes, datos.pruebasAzar, listasIniciales])
  const estrategiasEf = useMemo(() => [...estrategias.map(s => guardadas.find(g => String(g.id) === String(s.id)) || s), ...guardadas.filter(g => !estrategias.some(s => String(s.id) === String(g.id)))], [estrategias, guardadas])
  // Las plantillas disponibles (la desactivada no sale).
  const disponibles = PLANTILLAS.filter(p => !p.desactivada && p.definicion)
  // V9.1058: lo escrito en el buscador filtra por nombre y por la frase de la regla.
  const buscadasE = filasE && filasE.filter(f => !borradas.includes(String(f.estrategia.id)) && coincide(buscar, f.nombre, f.subtitulo))
  const visiblesE = buscadasE || [], hayDeCodigo = (filasE || []).some(f => f.origen === 'código')   // V9.1130: una sola lista: primero las de tarjetas, debajo las de código
  const cuenta = (b, t) => !t ? null : b.length === t.length ? t.length : `${b.length} de ${t.length}`
  const accion = (f) => {
    const a = f.toca?.accion
    if (!a) return
    if (a.tipo === 'editor') abreEditor(f.estrategia)
    else if (a.tipo === 'plan') abrePlan(a.estrategiaId)
    else if (a.tipo === 'azar') abreAzar(a.estrategiaId)
  }
  const abreEditor = (fila) => setEditor({ fila, n: Date.now() })
  // «Señales en el gráfico» (V9.1050): los valores con precios guardados y sus velas diarias (la caché de la app, solo lectura).
  // V9.1058: con su nombre (de la lista de seguimiento o del universo), para buscarlos también por nombre; sin nombres, solo el ticker.
  const leeSimbolos = useCallback(async (soloCache) => {
    const lee = async (q) => { try { const r = await fetch(`${getSupaUrl()}/rest/v1/${q}`, { headers: getSupaH() }); return r.ok ? await r.json() : [] } catch (_) { return [] } }
    const [ss, wl, un] = await Promise.all([lee('precios_simbolos?select=simbolo&order=simbolo.asc'), lee('watchlist?select=symbol,name'), lee('universo_miembros?select=simbolo_yahoo,nombre')])
    // V9.1071: también los de la lista de seguimiento y del universo aunque no estén en la caché: /api/velas los descarga. §48: el
    // paso 3 (/api/plan) lee solo la caché, así que allí solo salen los de la caché (con su nombre, si lo hay).
    return conNombres([...new Set([...ss.map(x => x.simbolo), ...(soloCache ? [] : [...wl.map(w => w?.symbol), ...un.map(u => u?.simbolo_yahoo)])].filter(Boolean))].sort(), wl, un)
  }, [])
  const cargaSimbolos = useCallback(() => leeSimbolos(false), [leeSimbolos])
  const cargaSimbolosCache = useCallback(() => leeSimbolos(true), [leeSimbolos])
  // V9.1071: las velas, por el mismo camino que «Backtest de un valor» (pages/api/velas.js: la caché más lo último de Yahoo).
  // Devuelve { velas, semanaAbierta, origen }.
  const cargaVelas = useCallback(async (sym) => { const r = await apiFetch(`/api/velas?simbolo=${encodeURIComponent(sym)}`); if (!r.ok) throw new Error(`HTTP ${r.status}`); return await r.json() }, [apiFetch])
  useEffect(() => {
    if (abrir?.fila) { setAzar(null); setPlan(null); setGuia(false); setEditor({ fila: abrir.fila, n: abrir.n }) }
    else if (abrir?.planId != null) { setAzar(null); setEditor(null); setGuia(false); setPlan({ planId: abrir.planId, n: abrir.n }) }   // §55: desde una tesis
  }, [abrir?.n])
  // §54: «Mi trabajo» de la cabecera B: a «Mi trabajo», ya en su sitio de la página.
  const [irMiTrabajo, setIrMiTrabajo] = useState(0)
  const seccionMiTrabajo = useRef(null)
  useEffect(() => { if (irMiTrabajo) seccionMiTrabajo.current?.scrollIntoView?.({ block: 'start' }) }, [irMiTrabajo])
  const alVolver = (cierra) => (donde) => { cierra(); recarga(); if (donde === 'miTrabajo') setIrMiTrabajo(Date.now()) }
  const abreAzar = (estrategiaId) => setAzar({ estrategiaId, n: Date.now() })
  const abrePlan = (estrategiaId) => setPlan({ estrategiaId, n: Date.now() })
  // «💡 …» de una estrategia o un plan (docs/tesis.md): solo enlaces directos, leídos de las tesis del usuario.
  // guardia (opcional): quien lo pinta pregunta antes si tiene cambios sin guardar; guardia(seguir).
  const enlaceTesis = (tipo, id, guardia = null) => <TesisEnlace lista={tesisDe(datos.tesis, tipo, id)} onAbrir={t => guardia ? guardia(() => onAbrirTesis?.(t)) : onAbrirTesis?.(t)}/>
  // §60: la papelera de la prueba de cada fila.
  const borraPrueba = async () => {
    setBorrandoYa(true); setFalloBorrar(null)
    try { await borrarPrueba(ctxConSesion(), borrandoP.id); setBorrandoP(null); await recarga() } catch (e) { setFalloBorrar(e.message) }
    setBorrandoYa(false)
  }
  // §58 y §60: la papelera de cada fila. Primero la estrategia y, si sale bien, sus pruebas; los planes se quedan con su copia guardada. Si la base no la borra, lo dice y no se quita.
  const borraEstrategia = async () => {
    const id = borrando.estrategia.id
    setBorrandoYa(true); setFalloBorrar(null)
    try {
      const r = await fetch(`${getSupaUrl()}/rest/v1/strategies?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE', headers: { ...getSupaH(), Prefer: 'return=representation' } })
      const j = r.ok ? await r.json() : null
      if (!r.ok || !j?.length) throw new Error(r.ok ? 'No se pudo borrar: ya no existe.' : `No se pudo borrar (HTTP ${r.status}).`)
      setBorradas(b => [...b, String(id)]); setGuardadas(g => g.filter(x => String(x.id) !== String(id))); onGuardada?.(null)
      try { await borrarPruebasDeEstrategia(ctxConSesion(), id); setBorrando(null); await recarga() } catch (e) { setFalloBorrar(`La estrategia se ha borrado, pero sus pruebas no: ${e.message}`) }
    } catch (e) { setFalloBorrar(e.message) }
    setBorrandoYa(false)
  }
  // Guardada en el paso 1: la página recarga sus estrategias y se pasa al paso 2 con ella (la versión nueva, si se creó). §46: a la
  // pantalla del paso 2 (BuilderAzar).
  // V9.1054: «Guardar estos valores en la estrategia» (info.quedarse) sigue en el paso 1 con la estrategia guardada (la versión nueva,
  // si se creó); así las casillas vuelven a enseñar los valores guardados. V9.1073: «Guardar en la estrategia», en la barra de arriba,
  // sigue en la pestaña donde se estaba (info.pestana).
  const alGuardar = (fila, info = {}) => {
    if (!info.sinCambios) { setGuardadas(g => [...g.filter(x => String(x.id) !== String(fila.id)), fila]); onGuardada?.(fila) }
    if (info.quedarse) { setEditor({ fila, n: Date.now(), pestana: info.pestana || 'senales' }); return }
    setEditor(null); abreAzar(fila.id)
  }

  // V9.1066: cada pantalla del Builder, con su protección (si algo falla, un aviso dentro con «Volver a intentar»).
  if (guia) return <ProteccionPanel nombre="Guía de las pruebas"><BuilderGuia onVolver={() => setGuia(false)}/></ProteccionPanel>
  // Una de código, guardada: vuelve a «Mi trabajo» (el paso 2 no la admite).
  const alGuardarCodigo = (fila) => {
    setGuardadas(g => [...g.filter(x => String(x.id) !== String(fila.id)), fila]); onGuardada?.(fila)
    setEditor(null); recarga()
  }
  if (editor && esDeCodigo(editor.fila)) return <ProteccionPanel nombre="Estrategia de código"><BuilderCodigo key={editor.n} fila={editor.fila} estrategias={estrategiasEf} apiFetch={apiFetch}
    onVolver={() => { setEditor(null); recarga() }} onGuardada={alGuardarCodigo}/></ProteccionPanel>
  if (editor) return <ProteccionPanel nombre="Editor por tarjetas"><BuilderEditor key={editor.n} fila={editor.fila} estrategias={estrategiasEf} apiFetch={apiFetch}
    salida={salida} onVolver={alVolver(() => setEditor(null))} onGuardada={alGuardar} onEditorClasico={f => onAbrirEstrategia?.(f, 'editor')} onPaso2={f => { setEditor(null); abreAzar(f.id) }} onPaso3={f => { setEditor(null); abrePlan(f.id) }} cargaSimbolos={cargaSimbolos} cargaVelas={cargaVelas} comisiones={comisiones} pestanaInicial={editor.pestana || 'tarjetas'} entradaBuilder={entrada} enlaceTesis={enlaceTesis}/></ProteccionPanel>
  if (azar) return <ProteccionPanel nombre="Probarla contra el azar"><BuilderAzar key={azar.n} estrategias={estrategiasEf} estrategiaId={azar.estrategiaId} version={version}
    cargaSimbolos={cargaSimbolos} cargaVelas={cargaVelas} onVolver={alVolver(() => setAzar(null))} onPaso1={f => { setAzar(null); if (f) abreEditor(f); else recarga() }} onPaso3={id => { setAzar(null); abrePlan(id) }} enlaceTesis={enlaceTesis}/></ProteccionPanel>
  if (plan) return <ProteccionPanel nombre="Convertirla en plan"><BuilderPlan key={plan.n} estrategias={estrategiasEf} estrategiaId={plan.estrategiaId} planId={plan.planId ?? null} salida={salida} apiFetch={apiFetch} version={version}
    cargaSimbolos={cargaSimbolosCache} datosLista={datosLista} onVolver={alVolver(() => setPlan(null))} onPaso1={f => { setPlan(null); if (f) abreEditor(f); else recarga() }} onPaso2={id => { setPlan(null); abreAzar(id) }} enlaceTesis={enlaceTesis}/></ProteccionPanel>
  return (
    <div style={S.pagina}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 22, fontWeight: 700, color: B.titulo }}>Builder</span>
        <span style={S.secundario}>Crea una estrategia, pruébala contra el azar y conviértela en un plan.</span>
        <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 16, flexWrap: 'wrap' }}>
          <button style={S.boton} onClick={() => setGuia(true)} title="Qué es una prueba, cómo se compara con el azar y cómo leer su resultado">Guía: cómo se prueba una estrategia</button>
          <button style={{ ...S.enlace, color: B.apagado, fontSize: 13 }} onClick={() => onBacktestValor?.()} title="Donde las estrategias se ejecutan sobre un valor y se ven en el gráfico">Backtest de un valor</button>
        </span>
      </div>
      <BarraPasos actual={1} onPaso={n => n === 2 ? abreAzar(null) : n === 3 && abrePlan(null)}/>

      <div ref={seccionMiTrabajo} data-cabecera-mi-trabajo style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', margin: '16px 0 10px' }}>
        <span style={{ ...S.tituloSeccion, margin: 0, display: 'inline-flex', alignItems: 'center', gap: 2 }}>Mi trabajo<Ayuda texto={AYUDA_MI_TRABAJO.queEs} etiqueta="Mi trabajo"/></span>
        <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ ...S.secundario, fontSize: 13 }}>Nueva estrategia:</span>
          <button data-boton="en-blanco" style={{ ...S.botonVerde, ...botonPeque }} onClick={() => abreEditor({ id: null, name: '', definition: VACIA(), params: {} })}>En blanco</button>
          <MenuPlantillas plantillas={disponibles} onElige={p => abreEditor({ id: null, name: p.definicion().nombre, definition: p.definicion(), params: { ...p.valores } })}/>
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
        <span data-titulo-lista style={{ ...S.secundario, fontWeight: 700, color: B.titulo, marginBottom: 6 }}>Mis estrategias{cuenta(buscadasE, filasE) != null ? ` (${cuenta(buscadasE, filasE)})` : ''}</span>
      </div>
      <div style={{ ...S.tarjeta, borderTopLeftRadius: 0 }}>
        {datos.error && <div style={{ color: '#f2cc60', padding: '10px 16px' }}>{datos.error}</div>}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '12px 12px 4px', flexWrap: 'wrap' }}>
            <ConLimpiar valor={buscar} onLimpia={() => setBuscar('')} bloque estilo={{ flex: '0 1 360px', minWidth: 160 }}><input ref={casillaMiTrabajo} type="text" role="searchbox" aria-label="Buscar en Mi trabajo" placeholder="Buscar por nombre o por la regla…" value={buscar} onChange={e => setBuscar(e.target.value)} data-buscar="mi-trabajo" style={{ ...campoSel, fontSize: 13, fontWeight: 400, padding: '5px 8px', minWidth: 0 }}/></ConLimpiar>
            <Ayuda texto={AYUDA_MI_TRABAJO.fila} etiqueta="Cada fila"/>
          </div>
          <div style={{ overflowX: 'auto', maxHeight: 560, overflowY: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%' }} data-tabla="estrategias">
              <thead><tr>{[['Estrategia'], ['Versión'], ['Prueba contra el azar', AYUDA_MI_TRABAJO.azar], ['Planes', AYUDA_MI_TRABAJO.planes], ['Tesis', AYUDA_MI_TRABAJO.tesis], ['Qué toca ahora'], ['']].map(([h, a]) => <th key={h} style={{ ...cabecera, verticalAlign: 'middle', padding: '7px 12px', whiteSpace: 'nowrap' }}>{a ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>{h}<Ayuda texto={a} etiqueta={h}/></span> : h}</th>)}</tr></thead>
              <tbody>
                {visiblesE.map(f => (
                  <tr key={f.clave} data-fila-estrategia={f.estrategia.id}>
                    <td style={{ ...fila, maxWidth: 340 }}>
                      <button data-nombre style={{ ...S.enlace, color: B.titulo, fontWeight: 600, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }} onClick={() => abreEditor(f.estrategia)}
                        title={f.subtitulo || (f.origen === 'editor' ? 'Abrir en el editor por tarjetas' : 'Abrir: sus parámetros y su código')}>{f.origen === 'código' && <span data-icono-codigo title="Estrategia de código: no entra en los pasos 2 y 3" aria-label="De código" style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 400, color: B.apagado, marginRight: 6 }}>{'</>'}</span>}<Resaltado texto={f.nombre} consulta={buscar}/>{f.desactivada && <span style={{ ...S.apagado, fontWeight: 400 }}> · desactivada</span>}</button>
                    </td>
                    <td style={{ ...fila, color: B.secundario }}>{f.version}</td>
                    <td style={fila}><CeldaAzar f={f} onVer={() => abreAzar(f.estrategia.id)} onBorrar={() => { setFalloBorrar(null); setBorrandoP(f.azar.fila) }}/></td>
                    <td style={fila}><CeldaPlanes planes={f.planes || []} onAbrir={id => setPlan({ planId: id, n: Date.now() })}/></td>
                    <td data-celda-tesis style={{ ...fila, maxWidth: 200 }}><TesisEnlace lista={tesisDe(datos.tesis, 'estrategia', f.estrategia.id)} onAbrir={onAbrirTesis} corto/></td>
                    <td style={fila}>{f.toca?.accion ? <button data-toca style={{ ...S.enlace, fontSize: 13, fontWeight: 700 }} title={f.toca.nota} onClick={() => accion(f)}>{f.toca.texto}</button> : <span title={f.toca?.nota} style={{ color: B.apagado }}>{f.toca?.texto || '—'}</span>}</td>
                    <td style={{ ...fila, width: 56 }}>
                      <button data-duplicar-estrategia={f.estrategia.id} aria-label={`Duplicar ${f.nombre}`} title="Duplicar: se abre una copia nueva, la original no cambia" style={iconoFila} onClick={() => abreEditor(filaCopia(f.estrategia))}><IconoDuplicar/></button>
                      <button data-borrar-estrategia={f.estrategia.id} aria-label={`Borrar ${f.nombre}`} title="Borrar esta estrategia" style={iconoFila} onClick={() => { setFalloBorrar(null); setBorrando(f) }}><Papelera tamano={15}/></button>
                    </td>
                  </tr>
                ))}
                {filasE && !visiblesE.length && <tr><td colSpan={7} style={{ ...celda, color: B.secundario }}>{!filasE.length ? 'Todavía no hay estrategias. Empieza en blanco o desde una plantilla.' : `Nada con «${buscar.trim()}».`}</td></tr>}
                {!filasE && <tr><td colSpan={7} style={{ ...celda, color: B.secundario }}>Cargando…</td></tr>}
              </tbody>
            </table>
          </div>
          {hayDeCodigo && <div data-nota-codigo style={{ ...S.apagado, padding: '10px 12px' }}>Las estrategias de código no entran en el paso 2: no se pueden probar contra el azar aquí, en el Builder. Para probarla aquí, rehazla en tarjetas.</div>}
      </div>
      {borrando && <VentanaBorrarEstrategia nombre={borrando.estrategia.name} pruebas={datos.pruebasAzar && datos.pruebasAzar.filter(p => String(p.estrategia_id) === String(borrando.estrategia.id))} planes={borrando.planes || []} deTarjetas={borrando.origen !== 'código'} ocupado={borrandoYa} fallo={falloBorrar}
        onCancelar={() => setBorrando(null)} onBorrar={borraEstrategia} onAbrirPlan={id => { setBorrando(null); setPlan({ planId: id, n: Date.now() }) }}/>}
      {borrandoP && <VentanaBorrarPrueba prueba={borrandoP} ocupado={borrandoYa} fallo={falloBorrar} onCancelar={() => setBorrandoP(null)} onBorrar={borraPrueba}/>}
    </div>
  )
}
