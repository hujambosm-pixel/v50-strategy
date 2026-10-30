// components/BuilderPanel.js — la pestaña «Builder» (docs/builder.md): tanda 1 con el aspecto del boceto (tanda 1b). La barra de
// los tres pasos (indicativa), el bloque «¿Desde dónde empiezas?» (V9.1042: en blanco, desde una plantilla o desde una de mis
// estrategias) y «Mi trabajo» en dos pestañas, «Mis estrategias» y «Mis pruebas» (lib/builder/misListas.js), con el estilo de
// lib/builder/estilo.js (solo el Builder; el resto de la app no cambia). No crea nada por su cuenta: abre el editor por tarjetas
// (V9.1043, components/BuilderEditor.js, el paso 1) con una COPIA nueva (de la plantilla o de la estrategia elegida), que se guarda
// al pulsar «Guardar y pasar al paso 2»; una estrategia de código se abre en su apartado «Código de la estrategia» (V9.1048). El paso 2
// («Probarla contra el azar», tanda 2) es otra pantalla del propio Builder: components/BuilderPrueba.js. En las filas no hay
// «Editar» ni «Copiar»: se edita pulsando el nombre y se copia desde el inicio.
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { PLANTILLAS, VACIA } from '../lib/builder/plantillas'
import { construyeMisEstrategias, construyeMisPruebas, filtraEstrategias, FILTROS_ESTRATEGIAS, CHIP } from '../lib/builder/misListas'
import { esDefinicionEditor } from '../lib/editor/fuente'
import { listarPruebas } from '../lib/registroLab'
import { getSupaUrl, getSupaH, hayConfigSupabase } from '../lib/supabase'
import { B, S } from '../lib/builder/estilo'
import BuilderPrueba from './BuilderPrueba'
import BuilderAzar from './BuilderAzar'
import BuilderEditor, { ReglaPorBloques } from './BuilderEditor'
import BuilderCodigo from './BuilderCodigo'
import { esDeCodigo, filaCopiaCodigo } from '../lib/builder/codigo'
import BuilderGuia from './BuilderGuia'
import { coincide, conNombres } from '../lib/builder/buscar'
import Resaltado from './Resaltado'
import BuscadorEstrategia from './BuscadorEstrategia'
import ConLimpiar from './LimpiarBusqueda'
import ProteccionPanel from './ProteccionPanel'

export const PASOS = ['Crear la estrategia', 'Probarla contra el azar', 'Convertirla en plan']
export const SUBTITULOS_PASOS = ['Cuándo compro, cuándo vendo y cuánto arriesgo', '¿Gana por algo más que suerte?', 'Dinero real, aportaciones e impuestos']
// La firma de lo leído de la base (lotes y pruebas: id y huella / fecha): si no cambia, no se recalcula «Mi trabajo».
export const firmaDatos = (lotes, pruebas) => JSON.stringify([(lotes || []).map(l => [l.id, l.hash_lote]), (pruebas || []).map(p => [p.id, p.creado])])
export const QUE_ES = 'Una estrategia es una regla de compra y venta. Una prueba es la comprobación contra el azar de una o varias estrategias.'
const campoSel = { fontFamily: B.letra, fontSize: B.base, background: B.fondo, color: B.texto, border: `1px solid ${B.borde}`, borderRadius: B.radioBoton, padding: '7px 10px' }
const celda = { padding: '10px 12px', borderBottom: `1px solid ${B.borde}`, verticalAlign: 'top', textAlign: 'left' }
const cabecera = { ...celda, color: B.secundario, fontWeight: 600, fontSize: 12, position: 'sticky', top: 0, background: B.cabecera }
const params = (p) => { try { return typeof p === 'string' ? JSON.parse(p || '{}') : (p || {}) } catch (_) { return {} } }
const copia = (x) => JSON.parse(JSON.stringify(x))

// Una frase con las partes clave entre ** en negrita blanca.
function Frase({ texto }) {
  return <>{String(texto || '').split('**').map((t, k) => k % 2 ? <strong key={k} style={{ color: B.titulo }}>{t}</strong> : <span key={k}>{t}</span>)}</>
}
const Chip = ({ clave }) => { const [tipo, txt] = CHIP[clave] || CHIP.sinVeredicto; return <span style={S.chip(tipo)}>{txt}</span> }

// La barra de los tres pasos; `actual` resaltado. §45: con onPaso(n), los pasos 1 y 2 que no son el actual se pulsan (el 3, todavía
// no); desactivados (string: el motivo, en el título) no se pulsan.
export function BarraPasos({ actual = 1, onPaso = null, desactivados = {} }) {
  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }} aria-label="Pasos del Builder">
      {PASOS.map((p, k) => {
        const n = k + 1, on = n === actual, pulsable = !!onPaso && !on && n <= 2 && !desactivados[n], Caja = pulsable ? 'button' : 'div'
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

// La fila que se manda al editor para una copia nueva de una estrategia guardada: sin id, «<nombre> (copia)». Una de código
// (V9.1048) se copia entera, con su código: se abre en el apartado «Código de la estrategia».
export const filaCopia = (s) => esDeCodigo(s) ? filaCopiaCodigo(s) : ({ id: null, name: `${s.name} (copia)`, description: s.description || '', definition: copia(s.definition), params: params(s.params), copiaDe: s.name })

// estrategias: las de la página (strategies). datosIniciales (opcional, para las pruebas): { lotes, pruebas } en lugar de leerlos;
// listasIniciales (opcional, para las pruebas de montaje): { estrategias, pruebas } ya calculadas; pestanaInicial y filtroInicial.
// visible: si la pestaña se ve. Cada vez que pasa a verse (al entrar o al volver del editor) se vuelve a leer la base, sin
// enseñar «Cargando» y sin recalcular si no ha cambiado nada (firmaDatos). Las estrategias llegan de la página.
// apiFetch y version: para el paso 1 (guardar) y el paso 2. onGuardada: la página recarga sus estrategias. vistaInicial (opcional,
// para las pruebas): la de BuilderPrueba ({ estrategiaId } | { loteId }), la guía ({ guia: true }), el editor ({ editor: fila }) o la
// prueba contra el azar de §45 ({ azar: { estrategiaId } }, components/BuilderAzar.js: se abre desde la barra de pasos).
// Las estrategias se abren aquí, en el paso 1: las de tarjetas en el editor por tarjetas y las de código (V9.1048) en el apartado
// «Código de la estrategia». onAbrirEstrategia(s, 'editor') las abre en el Editor clásico (la pestaña «Editor»). onBacktestValor:
// el enlace «Backtest de un valor» (la pestaña donde se ejecutan y se ven en el gráfico). abrir ({ fila, n }): la página pide
// abrir una estrategia (al pulsar su nombre en «Backtest de un valor»); cada n nuevo la abre. V9.1058: buscarInicial y
// buscarCopiaInicial (para las pruebas de montaje): lo escrito en los buscadores de «Mi trabajo» y de «Desde una de mis estrategias».
// V9.1060: copiaInicial (el id elegido para copiar) y copiaAbiertaInicial (la lista del buscador abierta), también para el montaje.
export default function BuilderPanel({ estrategias = [], onAbrirEstrategia, onBacktestValor, onGuardada, datosIniciales = null, listasIniciales = null, pestanaInicial = 'estrategias', filtroInicial = 'editor', visible, apiFetch, version, vistaInicial = null, abrir = null, comisiones = null, buscarInicial = '', buscarCopiaInicial = '', copiaInicial = '', copiaAbiertaInicial = false }) {
  const [datos, setDatos] = useState(() => datosIniciales || { lotes: [], pruebas: [], cargando: !datosIniciales, error: null })
  const [filasE, setFilasE] = useState(listasIniciales?.estrategias || null)
  const [filasP, setFilasP] = useState(listasIniciales?.pruebas || null)
  const [pestana, setPestana] = useState(pestanaInicial)
  const [filtro, setFiltro] = useState(filtroInicial)
  const [aCopiar, setACopiar] = useState(copiaInicial)
  const [buscar, setBuscar] = useState(buscarInicial)   // V9.1058: el buscador de «Mi trabajo» (por nombre y por la frase de la regla; V9.1063: resaltado)
  const [buscarCopia, setBuscarCopia] = useState(buscarCopiaInicial)   // y el de «Desde una de mis estrategias» (por nombre)
  const [plantillaId, setPlantillaId] = useState(null)
  const [prueba, setPrueba] = useState(vistaInicial && !vistaInicial.guia && !vistaInicial.editor && !vistaInicial.azar ? { ...vistaInicial, n: 0 } : null)   // la pantalla del paso 2, si está abierta
  const [azar, setAzar] = useState(vistaInicial?.azar ? { ...vistaInicial.azar, n: 0 } : null)   // §45: «Probarla contra el azar» (azar re-simulado), si está abierta
  const [editor, setEditor] = useState(vistaInicial?.editor ? { fila: vistaInicial.editor, n: 0 } : null)   // el paso 1 (editor por tarjetas), si está abierto
  const [guardadas, setGuardadas] = useState([])   // lo recién guardado, hasta que la página recargue sus estrategias
  const [guia, setGuia] = useState(!!vistaInicial?.guia)   // la «Guía de las pruebas» (vistaInicial { guia: true }, para las pruebas)
  const firma = useRef(null)
  const recarga = useCallback(async () => {
    if (datosIniciales) return
    if (!hayConfigSupabase()) { setDatos({ lotes: [], pruebas: [], cargando: false, error: 'Sin conexión con la base de datos: solo se ven las estrategias.' }); return }
    try {
      const r = await fetch(`${getSupaUrl()}/rest/v1/editor_lotes?select=id,creado,version_app,nombre,lote,hash_lote,huellas&order=creado.desc,id.desc&limit=200`, { headers: getSupaH() })
      const lotes = r.ok ? await r.json() : []
      const pruebas = await listarPruebas({ url: getSupaUrl(), headers: getSupaH() }, { limite: 500, soloResumen: false, filtro: '&config->>prueba=in.(editorLote,editorLab,editorCalibracion,planLote)' })
      const error = r.ok ? null : `No se pudieron leer las pruebas (HTTP ${r.status}).`, f = firmaDatos(lotes, pruebas)
      if (f === firma.current && !error) return   // nada nuevo: no se toca
      firma.current = f
      setDatos({ lotes, pruebas, cargando: false, error })
    } catch (e) { setDatos(d => ({ ...d, cargando: false, error: e.message })) }
  }, [datosIniciales])
  useEffect(() => { if (visible !== false) recarga() }, [visible, recarga])
  // V9.1065: cada vez que se entra en el Builder, todas las búsquedas vacías (no se recuerda lo escrito; `entrada` lo dice al editor
  // y a «Señales en el gráfico») y el cursor en la casilla de búsqueda de «Mi trabajo» (Mis estrategias), listo para escribir.
  const casillaMiTrabajo = useRef(null), yaVisto = useRef(false)
  const [entrada, setEntrada] = useState(0)
  useEffect(() => {
    if (visible === false) return
    if (yaVisto.current) { setBuscar(''); setBuscarCopia(''); setACopiar(''); setEntrada(n => n + 1) }
    yaVisto.current = true
    if (!editor && !prueba && !guia) { setPestana('estrategias'); const h = setTimeout(() => casillaMiTrabajo.current?.focus({ preventScroll: true }), 0); return () => clearTimeout(h) }
  }, [visible])
  useEffect(() => {
    if (listasIniciales) return
    let vivo = true
    construyeMisEstrategias({ estrategias, lotes: datos.lotes, pruebas: datos.pruebas }).then(f => { if (vivo) setFilasE(f) }).catch(() => { if (vivo) setFilasE([]) })
    try { setFilasP(construyeMisPruebas({ lotes: datos.lotes, pruebas: datos.pruebas })) } catch (_) { setFilasP([]) }
    return () => { vivo = false }
  }, [estrategias, datos.lotes, datos.pruebas, listasIniciales])
  const estrategiasEf = useMemo(() => [...estrategias.map(s => guardadas.find(g => String(g.id) === String(s.id)) || s), ...guardadas.filter(g => !estrategias.some(s => String(s.id) === String(g.id)))], [estrategias, guardadas])
  const delEditor = useMemo(() => estrategias.filter(s => esDefinicionEditor(s.definition)).sort((a, b) => String(a.name).localeCompare(String(b.name), 'es')), [estrategias])
  const deCodigo = useMemo(() => estrategias.filter(s => !esDefinicionEditor(s.definition) && s.code_js), [estrategias])   // en su orden, como en «Mis estrategias»
  // V9.1060: un solo buscador. La elegida es la que se pulsó en la lista mientras su nombre siga escrito en la casilla; hasta
  // entonces (o si se escribe otra cosa), «Copiar y editar» está desactivado.
  const gruposCopia = [['De tarjetas', delEditor], ['De código', deCodigo]].filter(([, xs]) => xs.length).map(([titulo, estrategias]) => ({ titulo, estrategias }))
  const elegidaCopia = [...delEditor, ...deCodigo].find(s => String(s.id) === String(aCopiar) && s.name === buscarCopia) || null
  const sinCopia = !elegidaCopia && buscarCopia.trim() && ![...delEditor, ...deCodigo].some(s => coincide(buscarCopia, s.name))
  // Las plantillas disponibles (la desactivada no sale) y la elegida en el desplegable.
  const disponibles = PLANTILLAS.filter(p => !p.desactivada && p.definicion), plantilla = disponibles.find(p => p.id === plantillaId) || disponibles[0] || null
  // V9.1058: lo escrito en el buscador filtra las dos pestañas: las estrategias por nombre y por la frase de la regla; las pruebas por
  // nombre y por las estrategias que incluyen.
  const buscadasE = filasE && filasE.filter(f => coincide(buscar, f.nombre, f.subtitulo)), buscadasP = filasP && filasP.filter(f => coincide(buscar, f.nombre, ...(f.estrategias || [])))
  const visiblesE = filtraEstrategias(buscadasE, filtro)
  const cuantas = Object.fromEntries(FILTROS_ESTRATEGIAS.map(([k]) => [k, filtraEstrategias(buscadasE, k).length]))
  const cuenta = (b, t) => !t ? null : b.length === t.length ? t.length : `${b.length} de ${t.length}`
  const accion = (f) => {
    const a = f.toca?.accion
    if (!a) return
    if (a.tipo === 'editor') abreEditor(f.estrategia)
    else if (a.tipo === 'prueba') setPrueba({ ...(a.loteId != null ? { loteId: a.loteId } : { estrategiaId: a.estrategiaId }), n: Date.now() })
  }
  const abrePrueba = (id) => setPrueba({ loteId: id, n: Date.now() })
  const abreEditor = (fila) => setEditor({ fila, n: Date.now() })
  // «Señales en el gráfico» (V9.1050): los valores con precios guardados y sus velas diarias (la caché de la app, solo lectura).
  // V9.1058: con su nombre (de la lista de seguimiento o del universo), para buscarlos también por nombre; sin nombres, solo el ticker.
  const cargaSimbolos = useCallback(async () => {
    const lee = async (q) => { try { const r = await fetch(`${getSupaUrl()}/rest/v1/${q}`, { headers: getSupaH() }); return r.ok ? await r.json() : [] } catch (_) { return [] } }
    const [ss, wl, un] = await Promise.all([lee('precios_simbolos?select=simbolo&order=simbolo.asc'), lee('watchlist?select=symbol,name'), lee('universo_miembros?select=simbolo_yahoo,nombre')])
    // V9.1071: también los de la lista de seguimiento y del universo aunque no estén en la caché: /api/velas los descarga.
    return conNombres([...new Set([...ss.map(x => x.simbolo), ...wl.map(w => w?.symbol), ...un.map(u => u?.simbolo_yahoo)].filter(Boolean))].sort(), wl, un)
  }, [])
  // V9.1071: las velas, por el mismo camino que «Backtest de un valor» (pages/api/velas.js: la caché más lo último de Yahoo).
  // Devuelve { velas, semanaAbierta, origen }.
  const cargaVelas = useCallback(async (sym) => { const r = await apiFetch(`/api/velas?simbolo=${encodeURIComponent(sym)}`); if (!r.ok) throw new Error(`HTTP ${r.status}`); return await r.json() }, [apiFetch])
  useEffect(() => { if (abrir?.fila) { setPrueba(null); setAzar(null); setGuia(false); setEditor({ fila: abrir.fila, n: abrir.n }) } }, [abrir?.n])
  const abreAzar = (estrategiaId) => setAzar({ estrategiaId, n: Date.now() })
  // Guardada en el paso 1: la página recarga sus estrategias y se pasa al paso 2 con ella (la versión nueva, si se creó).
  // V9.1054: «Guardar estos valores en la estrategia» (info.quedarse) sigue en el paso 1 con la estrategia guardada (la versión nueva,
  // si se creó); así las casillas vuelven a enseñar los valores guardados. V9.1073: «Guardar en la estrategia», en la barra de arriba,
  // sigue en la pestaña donde se estaba (info.pestana).
  const alGuardar = (fila, info = {}) => {
    if (!info.sinCambios) { setGuardadas(g => [...g.filter(x => String(x.id) !== String(fila.id)), fila]); onGuardada?.(fila) }
    if (info.quedarse) { setEditor({ fila, n: Date.now(), pestana: info.pestana || 'senales' }); return }
    setEditor(null); setPrueba({ estrategiaId: fila.id, n: Date.now() })
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
  if (editor) return <ProteccionPanel nombre="Editor por tarjetas"><BuilderEditor key={editor.n} fila={editor.fila} estrategias={estrategiasEf} lotes={datos.lotes} apiFetch={apiFetch}
    onVolver={() => { setEditor(null); recarga() }} onGuardada={alGuardar} onEditorClasico={f => onAbrirEstrategia?.(f, 'editor')} onPaso2={f => { setEditor(null); abreAzar(f.id) }} cargaSimbolos={cargaSimbolos} cargaVelas={cargaVelas} comisiones={comisiones} pestanaInicial={editor.pestana || 'tarjetas'} entradaBuilder={entrada}/></ProteccionPanel>
  if (azar) return <ProteccionPanel nombre="Probarla contra el azar"><BuilderAzar key={azar.n} estrategias={estrategiasEf} estrategiaId={azar.estrategiaId} version={version}
    cargaSimbolos={cargaSimbolos} cargaVelas={cargaVelas} onVolver={() => { setAzar(null); recarga() }} onPaso1={f => { setAzar(null); if (f) abreEditor(f); else recarga() }}/></ProteccionPanel>
  if (prueba) return <ProteccionPanel nombre="Probarla contra el azar"><BuilderPrueba key={prueba.n} estrategias={estrategiasEf} lotes={datos.lotes} inicio={prueba} apiFetch={apiFetch} version={version}
    onVolver={() => { setPrueba(null); recarga() }} onNuevaPrueba={() => setPrueba({ n: Date.now() })} onCambio={recarga}/></ProteccionPanel>
  const pestanaBtn = (k, t, n) => (
    <button key={k} role="tab" aria-selected={pestana === k} onClick={() => setPestana(k)}
      style={{ ...S.boton, borderRadius: `${B.radioBoton}px ${B.radioBoton}px 0 0`, borderBottom: 'none', fontWeight: pestana === k ? 700 : 400,
        ...(pestana === k ? { background: B.tarjeta, color: B.titulo } : { background: 'transparent', color: B.secundario }) }}>{t}{n != null ? ` (${n})` : ''}</button>
  )
  // V9.1060: el buscador de «Mi trabajo», en la cabecera de la primera columna de cada tabla (a la derecha de su título).
  const conBuscador = (h) => (
    <span style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <span>{h}</span>
      <ConLimpiar valor={buscar} onLimpia={() => setBuscar('')} bloque estilo={{ flex: '1 1 200px', maxWidth: 300, minWidth: 0 }}>
        <input ref={casillaMiTrabajo} type="text" role="searchbox" aria-label="Buscar en Mi trabajo" placeholder="Buscar por nombre o por la regla…" value={buscar} onChange={e => setBuscar(e.target.value)} data-buscar="mi-trabajo"
          style={{ ...campoSel, fontSize: 13, fontWeight: 400, padding: '4px 8px', minWidth: 0 }}/></ConLimpiar>
    </span>
  )
  return (
    <div style={S.pagina}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 22, fontWeight: 700, color: B.titulo }}>Builder</span>
        <span style={S.secundario}>Crea una estrategia, pruébala contra el azar y conviértela en un plan.</span>
        <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 16, flexWrap: 'wrap' }}>
          <button style={S.boton} onClick={() => setGuia(true)} title="Qué es una prueba, qué hace cada laboratorio y cómo leer sus resultados">Guía: cómo se prueba una estrategia</button>
          <button style={{ ...S.enlace, color: B.apagado, fontSize: 13 }} onClick={() => onBacktestValor?.()} title="Donde las estrategias se ejecutan sobre un valor y se ven en el gráfico">Backtest de un valor</button>
        </span>
      </div>
      <BarraPasos actual={1} onPaso={n => n === 2 && abreAzar(null)}/>

      <div style={{ ...S.tituloSeccion, marginTop: 8 }}>¿Desde dónde empiezas?</div>
      <div style={S.subtituloSeccion}>Las tres opciones abren el paso 1 con una estrategia nueva. Se guarda al pulsar «Guardar y pasar al paso 2».</div>
      <div data-bloque="empezar" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14, alignItems: 'stretch' }}>
        <div data-tarjeta="blanco" style={{ ...S.tarjeta, display: 'flex', flexDirection: 'column' }}>
          <div style={S.cabeceraTarjeta}>En blanco</div>
          <div style={{ ...S.cuerpo, flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={S.secundario}>Abre el editor vacío y escribe tu regla de compra y venta desde cero.</div>
            <div style={{ marginTop: 'auto' }}><button style={S.botonVerde} onClick={() => abreEditor({ id: null, name: '', definition: VACIA(), params: {} })}>Empezar en blanco</button></div>
          </div>
        </div>
        <div data-tarjeta="plantilla" style={{ ...S.tarjeta, display: 'flex', flexDirection: 'column' }}>
          <div style={S.cabeceraTarjeta}>Desde una plantilla</div>
          <div style={{ ...S.cuerpo, flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <select aria-label="Elige la plantilla" value={plantilla?.id || ''} onChange={e => setPlantillaId(e.target.value)} style={campoSel}>
              {disponibles.map(p => <option key={p.id} value={p.id}>{p.titulo}</option>)}
            </select>
            {plantilla && <div data-regla-plantilla style={{ fontSize: 13, color: B.texto }}><Frase texto={plantilla.regla}/></div>}
            <div style={{ marginTop: 'auto' }}><button style={S.boton} onClick={() => plantilla && abreEditor({ id: null, name: plantilla.definicion().nombre, definition: plantilla.definicion(), params: { ...plantilla.valores } })}>Usar esta plantilla</button></div>
          </div>
        </div>
        {/* V9.1060: sin «overflow: hidden», para que la lista del buscador no se corte en el borde de la tarjeta. */}
        <div data-tarjeta="copia" style={{ ...S.tarjeta, overflow: 'visible', display: 'flex', flexDirection: 'column' }}>
          <div style={{ ...S.cabeceraTarjeta, borderRadius: `${B.radioTarjeta}px ${B.radioTarjeta}px 0 0` }}>Desde una de mis estrategias</div>
          <div style={{ ...S.cuerpo, flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {delEditor.length || deCodigo.length ? (<>
              <BuscadorEstrategia grupos={gruposCopia} texto={buscarCopia} onTexto={setBuscarCopia} elegida={aCopiar || null} onElige={s => setACopiar(String(s.id))} abiertoInicial={copiaAbiertaInicial}/>
              {sinCopia && <div data-sin-copia style={S.secundario}>Ninguna estrategia con «{buscarCopia.trim()}».</div>}
              <div style={S.secundario}>Se abre una copia nueva. La original no cambia, ni sus pruebas.{elegidaCopia && !esDefinicionEditor(elegidaCopia.definition) ? ' Es de código: en la copia se cambian sus parámetros; el código se copia tal cual.' : ''}</div>
              <div style={{ marginTop: 'auto' }}><button style={elegidaCopia ? S.boton : S.botonDesactivado} disabled={!elegidaCopia} onClick={() => elegidaCopia && abreEditor(filaCopia(elegidaCopia))}>Copiar y editar</button></div>
            </>) : <div style={S.secundario}>Todavía no tienes estrategias. Empieza en blanco o desde una plantilla.</div>}
          </div>
        </div>
      </div>

      <div style={S.tituloSeccion}>Mi trabajo</div>
      <div style={{ ...S.subtituloSeccion }} data-que-es>{QUE_ES}</div>
      <div role="tablist" aria-label="Mi trabajo" style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {pestanaBtn('estrategias', 'Mis estrategias', cuenta(buscadasE, filasE))}
        {pestanaBtn('pruebas', 'Mis pruebas', cuenta(buscadasP, filasP))}
      </div>
      <div style={{ ...S.tarjeta, borderTopLeftRadius: 0 }}>
        {datos.error && <div style={{ color: '#f2cc60', padding: '10px 16px' }}>{datos.error}</div>}
        {pestana === 'estrategias' ? (<>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '12px 12px 4px', flexWrap: 'wrap' }} role="group" aria-label="Qué estrategias enseñar">
            {FILTROS_ESTRATEGIAS.map(([k, t]) => <button key={k} onClick={() => setFiltro(k)} aria-pressed={filtro === k}
              style={{ ...S.boton, padding: '6px 12px', fontSize: 13, ...(filtro === k ? { background: B.cabecera, borderColor: B.siguienteBorde, color: B.titulo, fontWeight: 700 } : { background: 'transparent', color: B.secundario }) }}>{filasE ? `${t} (${cuantas[k]})` : t}</button>)}
            <span style={{ ...S.apagado, marginLeft: 8 }}>Pulsa el nombre de una estrategia para abrirla.</span>
          </div>
          <div style={{ overflowX: 'auto', maxHeight: 560, overflowY: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%' }} data-tabla="estrategias">
              <thead><tr>{['Estrategia', 'Versión', 'Última prueba', 'Cómo le fue', 'Qué toca ahora'].map((h, k) => <th key={h} style={{ ...cabecera, verticalAlign: 'middle' }}>{k ? h : conBuscador(h)}</th>)}</tr></thead>
              <tbody>
                {visiblesE.map(f => (
                  <tr key={f.clave}>
                    <td style={{ ...celda, maxWidth: 520, minWidth: 260 }}>
                      <button style={{ ...S.enlace, color: B.titulo, fontWeight: 600 }} onClick={() => abreEditor(f.estrategia)}
                        title={f.origen === 'editor' ? 'Abrir en el editor por tarjetas' : 'Abrir: sus parámetros y su código'}><Resaltado texto={f.nombre} consulta={buscar}/></button>
                      {f.partes ? <div data-regla-fila style={{ marginTop: 4 }}><ReglaPorBloques partes={f.partes} tamano={12}/></div>
                        : f.subtitulo && <div data-regla-fila style={{ ...S.apagado, whiteSpace: 'normal', marginTop: 2 }}><Resaltado texto={f.subtitulo} consulta={buscar}/></div>}
                      {f.desactivada && <div style={S.apagado}>Desactivada</div>}
                    </td>
                    <td style={{ ...celda, whiteSpace: 'nowrap', color: B.secundario }}>{f.version}</td>
                    <td style={celda}>{f.ultimaPrueba ? <button style={S.enlace} onClick={() => abrePrueba(f.ultimaPrueba.id)} title="Abrir los resultados de esta prueba">{f.ultimaPrueba.nombre}</button> : <span style={{ color: B.secundario }}>ninguna</span>}</td>
                    <td style={{ ...celda, maxWidth: 360 }}><Chip clave={f.chip}/>{f.linea && <div style={{ ...S.apagado, marginTop: 4 }}>{f.linea}</div>}</td>
                    <td style={celda}>{f.toca?.accion ? <button style={{ ...S.enlace, fontWeight: 700 }} onClick={() => accion(f)}>{f.toca.texto}</button> : <span style={{ color: B.apagado }}>{f.toca?.texto || '—'}</span>}{f.toca?.nota && <div style={S.apagado}>{f.toca.nota}</div>}</td>
                  </tr>
                ))}
                {filasE && !visiblesE.length && <tr><td colSpan={5} style={{ ...celda, color: B.secundario }}>{!filasE.length ? 'Todavía no hay estrategias. Empieza en blanco o desde una plantilla.' : buscar.trim() ? `Nada con «${buscar.trim()}»${filtraEstrategias(filasE, filtro).length ? ' con este filtro' : ''}.` : 'Nada con este filtro.'}</td></tr>}
                {!filasE && <tr><td colSpan={5} style={{ ...celda, color: B.secundario }}>Cargando…</td></tr>}
              </tbody>
            </table>
          </div>
          <div style={{ ...S.apagado, padding: '10px 12px' }}>Las estrategias de código no entran en el paso 2: no se pueden probar contra el azar aquí, en el Builder. Para probarla aquí, rehazla en tarjetas.</div>
        </>) : (<>
          <div style={{ overflowX: 'auto', maxHeight: 560, overflowY: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%' }} data-tabla="pruebas">
              <thead><tr>{['Prueba', 'Estrategias que incluye', 'Valores y periodos', 'Verificación de sesgos', 'Veredicto'].map((h, k) => <th key={h} style={{ ...cabecera, verticalAlign: 'middle' }}>{k ? h : conBuscador(h)}</th>)}</tr></thead>
              <tbody>
                {(buscadasP || []).map(f => (
                  <tr key={f.clave}>
                    <td style={celda}>{f.planes ? <span style={{ color: B.titulo, fontWeight: 600 }}><Resaltado texto={f.nombre} consulta={buscar}/></span>
                      : <button style={{ ...S.enlace, color: B.titulo, fontWeight: 600 }} onClick={() => abrePrueba(f.id)} title="Abrir los resultados de esta prueba"><Resaltado texto={f.nombre} consulta={buscar}/></button>}</td>
                    <td style={{ ...celda, maxWidth: 260 }}>{f.planes ? <span style={S.apagado}>{f.nota}</span> : <>{f.estrategias.length}: <Resaltado texto={f.estrategias.join(' · ')} consulta={buscar}/></>}</td>
                    <td style={celda}>{f.valores}<div style={S.apagado}>{f.periodos}</div></td>
                    <td style={celda}>{f.sesgos.texto}</td>
                    <td style={{ ...celda, maxWidth: 380 }}>{f.veredictos.map(v => (
                      <div key={v.id} data-veredicto-prueba={v.id} style={{ marginBottom: 6 }}>
                        {f.veredictos.length > 1 && <strong style={{ color: B.titulo, marginRight: 6 }}>{v.nombre}:</strong>}<Chip clave={v.chip}/>
                        <div style={{ ...S.apagado, marginTop: 3 }}>{v.linea}</div>
                      </div>
                    ))}</td>
                  </tr>
                ))}
                {filasP && !filasP.length && <tr><td colSpan={5} style={{ ...celda, color: B.secundario }}>Todavía no hay pruebas. Abre una estrategia y pulsa «Probarla contra el azar».</td></tr>}
                {filasP && filasP.length > 0 && !buscadasP.length && <tr><td colSpan={5} style={{ ...celda, color: B.secundario }}>Ninguna prueba con «{buscar.trim()}».</td></tr>}
                {!filasP && <tr><td colSpan={5} style={{ ...celda, color: B.secundario }}>Cargando…</td></tr>}
              </tbody>
            </table>
          </div>
          <div style={{ ...S.apagado, padding: '10px 12px' }}>La verificación de sesgos en marcha no aparece aquí: corre en el navegador y solo se guarda al terminar (mientras corre, se ve en la pantalla de su prueba).</div>
        </>)}
      </div>
    </div>
  )
}
