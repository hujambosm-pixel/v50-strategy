// components/TesisPanel.js — la pantalla «Tesis» (V9.1092, docs/tesis.md): mis TESIS DE INVERSIÓN en texto libre, según el boceto
// aprobado «Tesis de inversión», con el estilo del Builder (lib/builder/estilo). Pantalla AISLADA: no toca el motor, el Builder ni
// ninguna cifra. Las llamadas a la base, en lib/tesis.js (tabla tesis_inversion, sql/tesis_inversion.sql).
// A la izquierda, el buscador, los filtros por estado y la lista (por revisada_en, la más reciente arriba); a la derecha, la tesis
// abierta: título, estado, fechas, el editor de texto (V9.1093, components/TesisEditor.js: TipTap, en un trozo aparte que solo se carga
// aquí) y «Relacionado» (estrategias de tarjetas y planes guardados).
// Props: estrategias (las filas de `strategies`), onAbrirEstrategia (abre una en el paso 1 del Builder), onAbrirPlan (abre un plan por su id en el paso 3), salida (un ref: la página
// pregunta por él antes de cambiar de pestaña; devuelve true si hay cambios y se ha abierto la pregunta). deps ({ ctx, Editor }) e inicial
// ({ tesis, planes, abierta, borrador, nueva, pregunta, falloPregunta, fallo, borrando, filtro, busca, enTexto, anadiendo, archivos, resumen, urls, subidas, avisosAdjuntos, arrastrando, visor, borrandoAdjunto, lado, ancho, listaElegida, ladoElegido }): para las pruebas de montaje.
// Los adjuntos (components/TesisAdjuntos.js) se guardan al subirlos: no pasan por «Guardar» ni por «cambios sin guardar».
import { useState, useEffect, useMemo, useRef } from 'react'
import dynamic from 'next/dynamic'
import { B, S } from '../lib/builder/estilo'
import Ayuda from './BuilderAyuda'
import { esDeTarjetas } from '../lib/pruebaAzar'
import { ctxConSesion, hayConfigSupabase } from '../lib/supabase'
import { trozosResaltados } from '../lib/builder/buscar'
import { AYUDA_RELACIONADO, AYUDA_TESIS, COLORES_RESALTE, ESTADOS_TESIS, HOJA, TITULO_NUEVA, borrarTesis, buscaTesis, cambiarTesis, crearTesis, cuentasTesis, estadoTesis, fechaCorta, fechaHora,
  fichaDe, guardaBuscarEnTexto, haceTexto, igualesTesis, imagenesSobrantes, leeBuscarEnTexto, lineaCoincidencia, listarNombresPlanes, listarTesis, marcarRevisada, ordenTesis, problemaDe, respondeSalida } from '../lib/tesis'
import { ANCHO_MIN_LADO, AVISO_SIN_GUARDAR, avisoBorrarTesis, avisoDe, borrar, borrarTodoDeTesis, colorEspacio, descargar, espacioUsado, filasDeTodas, listaPlegadaDe, listar, olvidaAlLadoViejo, porcentajeEspacio, resumenArchivos, subir, tamanoLegible, urlsFirmadas } from '../lib/tesisArchivos'
import { BotonLado, BotonLista, IconoClip, PanelLado, Visor, ZonaAdjuntos } from './TesisAdjuntos'
import { Papelera, Pregunta } from './VentanaPregunta'

const NUEVA = Object.freeze({ titulo: TITULO_NUEVA, texto: '', estado: 'idea', relacionados: [] })
const borradorDe = (t) => ({ titulo: t.titulo, texto: t.texto || '', estado: t.estado, relacionados: Array.isArray(t.relacionados) ? t.relacionados : [] })
const ROJO = '#f85149', AMARILLO = '#f2cc60'
// El editor, solo en el navegador y solo al abrir una tesis: el resto de la app no carga TipTap.
const EditorTesis = dynamic(() => import('./TesisEditor'), { ssr: false, loading: () => <div data-texto data-cargando className="ts-texto" style={{ ...S.apagado, height: 'calc(100vh - 380px)', minHeight: 400, padding: B.aire, boxSizing: 'border-box', background: HOJA.fondo, borderRadius: B.radioBoton }}>Cargando el editor…</div> })

const Etiqueta = ({ estado }) => { const e = estadoTesis(estado); return <span data-estado={e.id} style={{ display: 'inline-block', padding: '1px 9px', borderRadius: 999, background: e.fondo, color: e.color, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>{e.nombre}</span> }
const HojaLineas = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8"/><path d="M8 17h8"/>
  </svg>)
// Un texto en trozos ([{ t, marca }]), con lo buscado resaltado. React lo escapa: nada se interpreta como HTML.
const Resaltado = ({ trozos }) => trozos.map((x, k) => x.marca ? <mark key={k} data-marca style={{ background: COLORES_RESALTE[0].color, color: B.titulo, borderRadius: 2 }}>{x.t}</mark> : <span key={k}>{x.t}</span>)

export default function TesisPanel({ estrategias = [], onAbrirEstrategia, onAbrirPlan, salida = null, deps = null, inicial = null }) {
  // El ctx en cada llamada: ctxConSesion() pone el token vigente y renueva la sesión ante 401 (nada congelado al montar).
  const ctx = () => deps?.ctx || (hayConfigSupabase() ? ctxConSesion() : null)
  const [tesis, setTesis] = useState(inicial?.tesis || null)
  const [planes, setPlanes] = useState(inicial?.planes || [])
  const [fallo, setFallo] = useState(inicial?.fallo || null)
  const [abierta, setAbierta] = useState(inicial?.abierta ?? null)   // id de la tesis abierta (null: ninguna o la nueva)
  const [nueva, setNueva] = useState(!!inicial?.nueva)   // la abierta es una nueva sin guardar
  const [borr, setBorr] = useState(inicial?.borrador || null)   // lo que se está escribiendo
  const [filtro, setFiltro] = useState(inicial?.filtro || 'todas')
  const [busca, setBusca] = useState(inicial?.busca || '')
  const [enTexto, setEnTexto] = useState(!!inicial?.enTexto)   // «Buscar también en el texto»
  const [pregunta, setPregunta] = useState(inicial?.pregunta ? { accion: () => {}, fallo: !!inicial?.falloPregunta } : null)   // «Tienes cambios sin guardar…»
  const [borrando, setBorrando] = useState(!!inicial?.borrando)
  const [anadiendo, setAnadiendo] = useState(!!inicial?.anadiendo)
  const [ocupado, setOcupado] = useState(false)
  const [foco, setFoco] = useState(0)
  const [hoja, setHoja] = useState(0)   // sube al abrir otra tesis: editor nuevo, sin el «deshacer» de la anterior
  const [subiendo, setSubiendo] = useState(0)   // imágenes subiendo: hasta que acaben no se guarda (aún no están en el texto)
  const [archivos, setArchivos] = useState(inicial?.archivos || [])   // los de la tesis abierta (imágenes y adjuntos), el más reciente primero
  const [resumen, setResumen] = useState(inicial?.resumen || resumenArchivos([]))   // de todas las tesis: el clip de la lista y el espacio usado
  const [urls, setUrls] = useState(inicial?.urls || {})   // { ruta: url firmada }, solo en pantalla
  const [subidas, setSubidas] = useState(inicial?.subidas || [])   // [{ id, nombre, progreso }]
  const [avisosA, setAvisosA] = useState(inicial?.avisosAdjuntos || [])
  const [arrastrando, setArrastrando] = useState(!!inicial?.arrastrando)
  const [visor, setVisor] = useState(inicial?.visor || null)   // { clase, id }: la lista que recorre y el archivo abierto
  const [borrandoA, setBorrandoA] = useState(inicial?.borrandoAdjunto || null)   // la fila que se va a borrar
  const [ladoQuiere, setLadoQuiere] = useState(!!inicial?.lado)   // «Ver al lado del texto»: cerrado al entrar y al cambiar de tesis
  const [ancho, setAncho] = useState(inicial?.ancho ?? 0)   // el de la ventana: con menos de ANCHO_MIN_LADO, sin botón y a pantalla completa
  const [listaElegida, setListaElegida] = useState(inicial?.listaElegida ?? null)   // lo pulsado con ≡ ('abierta' o 'plegada'); null: lo de por defecto. No se recuerda al recargar
  const [ladoElegido, setLadoElegido] = useState(inicial?.ladoElegido ?? null)
  const firmadasEn = useRef(0)   // cuándo se firmaron las URL: cambiarlas recarga el PDF que se está leyendo, así que solo se renuevan si llevan casi una hora
  const Editor = deps?.Editor || EditorTesis
  const titulo = useRef(null)
  const cajaBusca = useRef(null)

  useEffect(() => { if (inicial?.enTexto == null) setEnTexto(leeBuscarEnTexto()) }, [])
  useEffect(() => {
    if (inicial?.tesis) return
    const c = ctx()
    if (!c) { setTesis([]); setFallo('Falta la configuración de Supabase.'); return }
    let v = true
    listarTesis(c).then(xs => { if (v) setTesis(xs) }).catch(e => { if (v) { setTesis([]); setFallo(e.message) } })
    listarNombresPlanes(c).then(xs => { if (v) setPlanes(xs) }).catch(() => {})
    return () => { v = false }
  }, [])
  const ordenadas = useMemo(() => ordenTesis(tesis || []), [tesis])
  // Leídas las tesis, se abre la más reciente.
  useEffect(() => { if (tesis && abierta == null && !nueva && !borr && ordenadas[0]) { setAbierta(ordenadas[0].id); setBorr(borradorDe(ordenadas[0])) } }, [tesis])
  useEffect(() => { if (foco && titulo.current) { titulo.current.focus(); titulo.current.select() } }, [foco])
  // Los archivos de la tesis abierta, con sus URL para las miniaturas, y el resumen de todas.
  const idAbierta = useRef(null)
  idAbierta.current = nueva ? null : abierta
  const urlsAhora = useRef(urls)
  urlsAhora.current = urls
  useEffect(() => {
    olvidaAlLadoViejo()
    if (inicial?.ancho != null) return
    const mide = () => setAncho(window.innerWidth)
    mide()
    window.addEventListener('resize', mide)
    return () => window.removeEventListener('resize', mide)
  }, [])
  const leeResumen = async () => { try { const c = ctx(); if (c) setResumen(resumenArchivos(await filasDeTodas(c))) } catch (_) {} }
  const leeArchivos = async (alAbrir = false) => {
    const id = idAbierta.current, c = ctx()
    if (id == null || !c) { setArchivos([]); return [] }
    try {
      const xs = await listar(c, id)
      if (idAbierta.current !== id) return []
      setArchivos(xs)
      const viejas = alAbrir && Date.now() - firmadasEn.current >= 50 * 60000   // al abrir otra tesis no hay nada a medio leer: se renuevan si hace falta
      if (viejas) { firmadasEn.current = Date.now(); urlsAhora.current = {} }
      const faltan = xs.map(f => f.ruta).filter(r => !urlsAhora.current[r])
      if (faltan.length) { const firmadas = await urlsFirmadas(c, faltan); setUrls(u => ({ ...u, ...firmadas })) }
      return xs
    } catch (e) { setAvisosA([`⚠ ${e.message}`]); return [] }
  }
  useEffect(() => { if (!inicial?.resumen) leeResumen() }, [])
  useEffect(() => { if (inicial?.archivos) return; setVisor(null); setAvisosA([]); setLadoElegido(null); leeArchivos(true) }, [abierta, nueva])

  const fila = nueva ? null : ordenadas.find(t => t.id === abierta) || null
  const original = nueva ? NUEVA : fila ? borradorDe(fila) : null
  const conCambios = !!borr && !!original && !igualesTesis(borr, original)
  const sinGuardar = !!borr && (nueva || conCambios)
  const problema = borr ? problemaDe(borr) : null
  const puedeGuardar = sinGuardar && !problema && !ocupado && !subiendo
  const textoAhora = useRef('')   // lo que hay escrito en este momento (para no borrar una imagen recién puesta mientras se guardaba)
  textoAhora.current = borr?.texto || ''
  // La página pregunta antes de cambiar de pestaña; y el navegador, antes de cerrar o recargar.
  useEffect(() => { if (salida) salida.current = (seguir) => { if (!conCambios) return false; setPregunta({ accion: seguir }); return true } })
  useEffect(() => () => { if (salida) salida.current = null }, [])
  useEffect(() => {
    if (!conCambios) return
    const avisa = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', avisa)
    return () => window.removeEventListener('beforeunload', avisa)
  }, [conCambios])

  const vistas = useMemo(() => buscaTesis(ordenadas, busca, enTexto), [ordenadas, busca, enTexto])
  const lineas = useMemo(() => new Map(enTexto ? vistas.map(t => [t.id, lineaCoincidencia(t, busca)]) : []), [vistas, busca, enTexto])
  const cuentas = useMemo(() => cuentasTesis(vistas), [vistas])
  const lista = filtro === 'todas' ? vistas : vistas.filter(t => t.estado === filtro)
  const nombreEn = (x) => `«${(x?.titulo || '').trim() || TITULO_NUEVA}»`

  // Con cambios sin guardar, pregunta antes de seguir (una nueva sin tocar se deja sin preguntar).
  const conGuardia = (accion) => { if (conCambios) setPregunta({ accion }); else accion() }
  const abre = (t) => { if (t.id !== abierta) ponLado(false); setHoja(n => n + 1); setNueva(false); setAbierta(t.id); setBorr(borradorDe(t)); setBorrando(false); setAnadiendo(false); setFallo(null) }
  const creaNueva = () => { ponLado(false); setHoja(n => n + 1); setNueva(true); setAbierta(null); setBorr({ ...NUEVA }); setBorrando(false); setAnadiendo(false); setFallo(null); setFoco(n => n + 1) }
  const cambia = (k, v) => setBorr(b => ({ ...b, [k]: v }))
  const pon = (r) => setTesis(xs => [r, ...(xs || []).filter(x => x.id !== r.id)])
  // Borra (archivo y fila) las imágenes de esa tesis que no están en estos textos. Si no se puede leer la lista, sin aviso; si no se puede borrar, avisa. Quedan para la siguiente vez que se guarde o se descarte.
  const limpiaImagenes = async (id, ...textos) => {
    let sobran = []
    try { sobran = imagenesSobrantes(await listar(ctx(), id), ...textos.map(t => t())) } catch (_) {}
    try { await borrar(ctx(), sobran) } catch (e) { setAvisosA([`⚠ ${e.message}`]) }
    leeArchivos(); leeResumen()
  }
  // ── Adjuntos ──
  // Uno a uno, con su barra. Un archivo que no cabe o no se admite da su aviso y los demás siguen. Se guardan al subirlos: no cuentan como «cambios sin guardar».
  const anadeArchivos = async (lista) => {
    const id = idAbierta.current, c0 = ctx()
    if (id == null || !c0) { setAvisosA([AVISO_SIN_GUARDAR]); return }
    setAvisosA([])
    let usados = 0
    try { usados = await espacioUsado(c0) } catch (e) { setAvisosA([`⚠ ${e.message}`]); return }
    const cola = []
    for (const archivo of lista) {
      const no = avisoDe(archivo, usados)
      if (no) { setAvisosA(a => [...a, no]); continue }
      usados += archivo.size
      cola.push({ id: `${archivo.name}-${cola.length}-${Date.now()}`, archivo })
    }
    setSubidas(s => [...s, ...cola.map(x => ({ id: x.id, nombre: x.archivo.name, progreso: 0 }))])
    for (const { id: sid, archivo } of cola) {
      try { await subir(ctx(), { tesisId: id, clase: 'adjunto', archivo, alProgreso: (p) => setSubidas(s => s.map(x => x.id === sid ? { ...x, progreso: p } : x)) }) }
      catch (e) { setAvisosA(a => [...a, `⚠ ${e.message}`]) }
      setSubidas(s => s.filter(x => x.id !== sid))
      if (idAbierta.current === id) await leeArchivos()
      leeResumen()
    }
  }
  const bajaArchivo = async (f) => { try { await descargar(ctx(), f) } catch (e) { setAvisosA([`⚠ ${e.message}`]) } }
  const borraAdjunto = async () => {
    const f = borrandoA
    setBorrandoA(null)
    try { await borrar(ctx(), [f]); setArchivos(xs => xs.filter(x => x.id !== f.id)); leeResumen() } catch (e) { setAvisosA([`⚠ ${e.message}`]) }
  }
  // Al abrir un archivo, si las URL llevan casi una hora (caducan a la hora), se firman de nuevo. Solo entonces: cambiarlas recargaría el PDF que se está leyendo.
  const renuevaUrls = () => {
    const c = ctx()
    if (!c || Date.now() - firmadasEn.current < 50 * 60000) return
    firmadasEn.current = Date.now()
    urlsFirmadas(c, archivos.map(x => x.ruta)).then(u => setUrls(v => ({ ...v, ...u }))).catch(() => {})
  }
  const abreVisor = (f) => { setVisor({ clase: f.clase, id: f.id }); renuevaUrls() }
  const elige = (f) => { setLadoElegido(f.id); renuevaUrls() }
  // Abrir o cerrar el panel vuelve a lo de por defecto de la lista; cambiar de tesis sin panel no la toca (si estaba plegada, sigue plegada).
  const ponLado = (v) => { if (v !== ladoQuiere) setListaElegida(null); setLadoQuiere(v); if (v) renuevaUrls() }
  // Pulsar dos veces una imagen del texto: el visor, recorriendo las imágenes de la tesis.
  const abreImagen = async (ruta) => {
    const f = archivos.find(x => x.ruta === ruta) || (await leeArchivos()).find(x => x.ruta === ruta)
    if (f) abreVisor(f)
  }
  const guarda = async () => {
    if (!puedeGuardar) return false
    setOcupado(true); setFallo(null)
    try {
      const r = nueva ? await crearTesis(ctx(), borr) : await cambiarTesis(ctx(), fila.id, borr)
      pon(r); setNueva(false); setAbierta(r.id); setBorr(b => ({ ...borradorDe(r), texto: b.texto }))   // lo escrito mientras se guardaba no se pierde
      limpiaImagenes(r.id, () => r.texto, () => textoAhora.current)
      return true
    } catch (e) { setFallo(e.message); return false } finally { setOcupado(false) }
  }
  const revisada = async () => {
    if (!fila || ocupado) return
    setOcupado(true); setFallo(null)
    try { pon(await marcarRevisada(ctx(), fila.id)) } catch (e) { setFallo(e.message) } finally { setOcupado(false) }
  }
  const siguiente = (resto) => { const o = ordenTesis(resto)[0]; if (o) abre(o); else { setNueva(false); setAbierta(null); setBorr(null) } }
  // Vuelve a lo último guardado (con el editor nuevo); una nueva que nunca se guardó, desaparece.
  const descarta = () => { setFallo(null); if (fila) limpiaImagenes(fila.id, () => fila.texto); if (nueva) siguiente(tesis || []); else if (fila) abre(fila) }
  const borra = async () => {
    setBorrando(false)
    if (nueva) { siguiente(tesis || []); return }
    setOcupado(true); setFallo(null)
    // Primero los archivos del bucket y solo si eso sale bien, la tesis (la base se lleva las filas con ella, no los archivos).
    try { await borrarTodoDeTesis(ctx(), fila.id); await borrarTesis(ctx(), fila.id); const resto = (tesis || []).filter(x => x.id !== fila.id); setTesis(resto); siguiente(resto); leeResumen() } catch (e) { setFallo(e.message); leeArchivos(); leeResumen() } finally { setOcupado(false) }
  }
  const responde = async (que) => {
    const p = pregunta
    const r = await respondeSalida(que, { guardar: guarda, descartar: descarta, seguir: () => p?.accion?.() })
    setPregunta(r === 'fallo' ? { ...p, fallo: true } : null)   // si guardar falla, se queda abierta y dice por qué
  }
  const cambiaEnTexto = () => { const v = !enTexto; setEnTexto(v); guardaBuscarEnTexto(v) }

  const tarjetas = useMemo(() => estrategias.filter(esDeTarjetas).sort((a, b) => String(a.name).localeCompare(String(b.name), 'es')), [estrategias])
  const fichas = (borr?.relacionados || []).map(r => fichaDe(r, estrategias, planes))
  const yaEsta = (tipo, id) => (borr?.relacionados || []).some(r => r.tipo === tipo && String(r.id) === String(id))
  const enlaza = (tipo, id) => { cambia('relacionados', [...(borr.relacionados || []), { tipo, id: String(id) }]); setAnadiendo(false) }
  const quita = (k) => cambia('relacionados', borr.relacionados.filter((_, i) => i !== k))

  const boton = (activo) => activo ? S.botonVerde : S.botonDesactivado
  const campo = { fontFamily: B.letra, fontSize: B.base, background: B.fondo, color: B.texto, border: `1px solid ${B.borde}`, borderRadius: B.radioBoton, padding: '8px 10px', boxSizing: 'border-box' }
  const filtros = [{ id: 'todas', nombre: 'Todas' }, ...ESTADOS_TESIS]
  const adjuntos = archivos.filter(f => f.clase === 'adjunto')
  const listaVisor = visor ? archivos.filter(f => f.clase === visor.clase) : []
  const indiceVisor = visor ? listaVisor.findIndex(f => f.id === visor.id) : -1
  const avisoBorrar = fila ? avisoBorrarTesis(resumen.porTesis[fila.id]) : null
  const bytesAdjuntos = adjuntos.reduce((s, f) => s + Number(f.bytes), 0)
  const cabeLado = ancho >= ANCHO_MIN_LADO
  const lado = ladoQuiere && cabeLado && !!borr   // el panel de al lado, abierto
  const elegida = adjuntos.find(f => f.id === ladoElegido) || adjuntos[0] || null
  const plegada = lado ? listaPlegadaDe(ancho, listaElegida) : listaElegida === 'plegada'         // la lista de tesis, en una columna estrecha: sin el panel, solo si se pulsa ≡

  return (
    <div data-tesis className="ts-pagina" style={{ ...S.pagina, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <style>{`.ts-cuerpo { display: grid; grid-template-columns: 360px minmax(0, 1fr); gap: 16px; align-items: start }
@media (max-width: 999px) { .ts-cuerpo { grid-template-columns: minmax(0, 1fr) } }
.ts-pagina { box-sizing: border-box; height: calc(100vh - 56px) }
.ts-lista { position: sticky; top: 0; max-height: calc(100vh - 150px) }
.ts-lista-filas { flex: 1; min-height: 0; overflow-y: auto }
@media (max-width: 999px) { .ts-lista { position: static; max-height: none } }`}</style>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: B.titulo }}>Mis tesis de inversión</div>
        <Ayuda texto={AYUDA_TESIS} etiqueta="Mis tesis de inversión"/>
        <div style={{ flex: 1 }}/>
        <button data-nueva onClick={() => conGuardia(creaNueva)} style={S.botonVerde}>+ Nueva tesis</button>
      </div>
      {fallo && <div data-fallo style={{ color: '#ff8b8b' }}>⚠ {fallo}</div>}

      <div className="ts-cuerpo" style={lado ? { gridTemplateColumns: `${plegada ? '44px' : '360px'} minmax(0, 1fr) 560px` } : plegada ? { gridTemplateColumns: '44px minmax(0, 1fr)' } : undefined}>
        {/* ── Izquierda: buscador, filtros y lista ── */}
        {plegada ? (
          <div data-lista-plegada style={{ ...S.tarjeta, position: 'sticky', top: 0, width: 44, boxSizing: 'border-box', padding: '6px 0', display: 'flex', justifyContent: 'center' }}>
            <BotonLista pista="Mostrar la lista de tesis" onClick={() => setListaElegida('abierta')}/>
          </div>
        ) : (
        <div data-lista className="ts-lista" style={{ ...S.tarjeta, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <BotonLista pista="Plegar la lista de tesis" onClick={() => setListaElegida('plegada')}/>
            <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
              <input ref={cajaBusca} aria-label="Buscar" value={busca} onChange={e => setBusca(e.target.value)} placeholder={enTexto ? 'Buscar en títulos y textos…' : 'Buscar en los títulos…'} style={{ ...campo, width: '100%', paddingRight: 30 }}/>
              {!!busca && <button data-borrar-busca aria-label="Borrar la búsqueda" title="Borrar la búsqueda" onClick={() => { setBusca(''); cajaBusca.current?.focus() }}
                style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: B.apagado, cursor: 'pointer', fontSize: 13, padding: '2px 6px' }}>✕</button>}
            </div>
            <button data-buscar-texto aria-pressed={enTexto} aria-label="Buscar también en el texto" title={enTexto ? 'Buscar también en el texto' : 'Buscar solo en títulos'} onClick={cambiaEnTexto}
              style={{ ...S.boton, padding: '7px 8px', display: 'flex', alignItems: 'center', background: enTexto ? B.siguienteFondo : 'transparent', borderColor: enTexto ? B.siguienteBorde : B.borde, color: enTexto ? B.titulo : B.apagado }}><HojaLineas/></button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {filtros.map(f => (
              <button key={f.id} data-filtro={f.id} aria-pressed={filtro === f.id} onClick={() => setFiltro(f.id)}
                style={{ ...S.boton, padding: '4px 10px', fontSize: 12, background: filtro === f.id ? B.siguienteFondo : 'transparent', borderColor: filtro === f.id ? B.siguienteBorde : B.borde }}>
                {f.nombre} ({cuentas[f.id] ?? 0})
              </button>))}
          </div>
          {tesis == null && <div style={S.apagado}>Leyendo tus tesis…</div>}
          {tesis != null && !tesis.length && !nueva && <div data-vacia style={{ ...S.secundario, padding: '8px 2px' }}>Aún no tienes tesis. Pulsa «+ Nueva tesis» para escribir la primera.</div>}
          {tesis != null && !!tesis.length && !lista.length && <div style={S.apagado}>Ninguna tesis con esa búsqueda o ese estado.</div>}
          <div className="ts-lista-filas" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {nueva && (
              <div data-item="nueva" aria-current="true" style={{ padding: '8px 10px', borderRadius: B.radioBoton, background: B.siguienteFondo, border: `1px solid ${B.siguienteBorde}` }}>
                <div style={{ fontWeight: 600, color: B.titulo }}>{(borr?.titulo || '').trim() || TITULO_NUEVA}</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}><Etiqueta estado={borr?.estado}/><span style={{ ...S.apagado, color: AMARILLO }}>sin guardar</span></div>
              </div>)}
            {lista.map(t => { const on = !nueva && t.id === abierta, linea = lineas.get(t.id), nAdjuntos = resumen.porTesis[t.id]?.adjuntos || 0; return (
              <button key={t.id} data-item={t.id} aria-current={on ? 'true' : undefined} onClick={() => { if (!on) conGuardia(() => abre(t)) }}
                style={{ flex: 'none', textAlign: 'left', cursor: 'pointer', fontFamily: B.letra, fontSize: B.base, color: B.texto, padding: '8px 10px', borderRadius: B.radioBoton,
                  background: on ? B.siguienteFondo : 'transparent', border: `1px solid ${on ? B.siguienteBorde : 'transparent'}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ flex: 1, minWidth: 0, fontWeight: 600, color: B.titulo, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><Resaltado trozos={trozosResaltados(t.titulo, busca)}/></div>
                  {!!nAdjuntos && <span data-clip={nAdjuntos} title={`${nAdjuntos} ${nAdjuntos === 1 ? 'adjunto' : 'adjuntos'}`} style={{ flex: 'none', display: 'inline-flex', alignItems: 'center', gap: 2, color: B.secundario, fontSize: 12 }}><IconoClip/>{nAdjuntos}</span>}
                </div>
                {linea && <div data-linea-texto style={{ ...S.apagado, fontSize: 12, lineHeight: 1.35, marginTop: 3, overflowWrap: 'anywhere' }}><Resaltado trozos={linea}/></div>}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}><Etiqueta estado={t.estado}/><span style={S.apagado}>{haceTexto(t)}</span></div>
              </button>) })}
          </div>
          <div data-espacio style={{ flex: 'none', borderTop: `1px solid ${B.borde}`, paddingTop: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, color: B.secundario }}><span>Espacio usado (todas las tesis)</span><span style={{ whiteSpace: 'nowrap' }}>{tamanoLegible(resumen.bytes)} de 1 GB</span></div>
            <div style={{ height: 4, marginTop: 4, borderRadius: 2, background: B.borde, overflow: 'hidden' }}><div data-espacio-barra style={{ height: '100%', width: `${porcentajeEspacio(resumen.bytes)}%`, background: colorEspacio(resumen.bytes) }}/></div>
          </div>
        </div>
        )}

        {/* ── Derecha: la tesis abierta ── */}
        {borr ? (
          <div data-abierta style={{ ...S.tarjeta, padding: B.aire, display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <input ref={titulo} aria-label="Título" value={borr.titulo} maxLength={200} onChange={e => cambia('titulo', e.target.value)}
                style={{ ...campo, flex: '1 1 260px', minWidth: 0, fontSize: 20, fontWeight: 700, color: B.titulo, background: 'transparent', borderColor: 'transparent' }}/>
              {sinGuardar && <span data-sin-guardar style={{ color: AMARILLO, fontSize: 13, whiteSpace: 'nowrap' }}>● sin guardar</span>}
              <button data-guardar disabled={!puedeGuardar} onClick={guarda} style={boton(puedeGuardar)}>{ocupado ? 'Guardando…' : subiendo ? 'Subiendo imagen…' : 'Guardar'}</button>
              {sinGuardar && <button data-descartar disabled={ocupado} onClick={descarta} style={S.boton}>Descartar cambios</button>}
              <button data-borrar aria-label="Borrar la tesis" title="Borrar la tesis" onClick={() => setBorrando(true)}
                style={{ ...S.boton, background: 'transparent', borderColor: '#5a2a2f', padding: '7px 9px', display: 'flex', alignItems: 'center' }}><Papelera/></button>
            </div>
            {problema && sinGuardar && <div style={{ color: '#ff8b8b', fontSize: 13 }}>{problema}</div>}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div role="group" aria-label="Estado" style={{ display: 'inline-flex', border: `1px solid ${B.borde}`, borderRadius: B.radioBoton, overflow: 'hidden' }}>
                {ESTADOS_TESIS.map((e, k) => { const on = borr.estado === e.id; return (
                  <button key={e.id} data-estado-boton={e.id} aria-pressed={on} onClick={() => cambia('estado', e.id)}
                    style={{ fontFamily: B.letra, fontSize: 13, padding: '6px 12px', cursor: 'pointer', border: 'none', borderLeft: k ? `1px solid ${B.borde}` : 'none',
                      background: on ? e.fondo : 'transparent', color: on ? e.color : B.secundario, fontWeight: on ? 700 : 400 }}>{e.nombre}</button>) })}
              </div>
              <span data-fechas style={S.apagado}>
                {fila ? <span data-fecha="creada" title={`Creada el ${fechaHora(fila.created_at)}`}>Creada {fechaCorta(fila.created_at)}</span> : 'Sin guardar todavía'}
                {' · '}
                {fila?.revisada_en
                  ? <span data-fecha="revisada" title={`Revisada el ${fechaHora(fila.revisada_en)}`}>Revisada {fechaCorta(fila.revisada_en)}</span>
                  : <span data-fecha="revisada" title="Todavía sin revisar">Revisada: —</span>}
              </span>
              <button data-revisada disabled={!fila || ocupado} onClick={revisada} style={{ ...S.boton, padding: '5px 12px', fontSize: 13, opacity: fila ? 1 : 0.5, cursor: fila ? 'pointer' : 'not-allowed' }}>✓ Marcar como revisada hoy</button>
            </div>
            <Editor key={hoja} valor={borr.texto} onCambio={(v) => cambia('texto', v)} tesisId={nueva ? null : abierta} ctx={ctx} onSubiendo={(n) => { setSubiendo(x => x + n); if (n < 0) { leeArchivos(); leeResumen() } }} onAbrirImagen={abreImagen}/>

            <ZonaAdjuntos filas={adjuntos} bytes={bytesAdjuntos} nueva={nueva} urls={urls} subidas={lado ? [] : subidas} avisos={lado ? [] : avisosA} arrastrando={arrastrando && !lado} onArrastrando={setArrastrando}
              onAnadir={anadeArchivos} onAbrir={abreVisor} onDescargar={bajaArchivo} onBorrar={setBorrandoA} extraCabecera={cabeLado ? <BotonLado activo={lado} onClick={() => ponLado(!lado)}/> : null}/>

            <div data-relacionado>
              <div style={{ display: 'flex', alignItems: 'center', gap: 2, fontWeight: 700, color: B.titulo, marginBottom: 8 }}>Relacionado<Ayuda texto={AYUDA_RELACIONADO} etiqueta="Relacionado"/></div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                {fichas.map((f, k) => (
                  <span key={`${f.tipo}${f.id}`} data-ficha={`${f.tipo}-${f.id}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '4px 6px 4px 12px', borderRadius: 999, border: `1px solid ${B.borde}`, background: B.cabecera }}>
                    {f.borrado
                      ? <span data-borrado style={{ color: B.apagado }}>{f.etiqueta} · (borrado)</span>
                      : <span>{f.etiqueta} · {f.nombre}</span>}
                    {!f.borrado && f.tipo === 'estrategia' && onAbrirEstrategia && <button data-abrir onClick={() => conGuardia(() => onAbrirEstrategia(f.fila))} style={{ ...S.enlace, fontSize: 13 }}>Abrir</button>}
                    {!f.borrado && f.tipo === 'plan' && onAbrirPlan && <button data-abrir data-abrir-plan={f.id} onClick={() => conGuardia(() => onAbrirPlan(f.id))} style={{ ...S.enlace, fontSize: 13 }}>Abrir</button>}
                    <button aria-label={`Quitar ${f.etiqueta.toLowerCase()}`} onClick={() => quita(k)} style={{ ...S.enlace, color: B.apagado, fontSize: 16, padding: '0 4px' }}>×</button>
                  </span>))}
                <button data-anadir onClick={() => setAnadiendo(a => !a)} style={{ ...S.boton, padding: '5px 12px', fontSize: 13 }}>+ Añadir estrategia o plan</button>
              </div>
              {anadiendo && (
                <div data-elegir style={{ marginTop: 8, border: `1px solid ${B.borde}`, borderRadius: B.radioBoton, maxHeight: 260, overflowY: 'auto', padding: 8, background: B.fondo }}>
                  <div style={{ ...S.apagado, margin: '2px 4px 4px' }}>Estrategias de tarjetas</div>
                  {!tarjetas.length && <div style={{ ...S.apagado, margin: '0 4px 6px' }}>No tienes estrategias de tarjetas.</div>}
                  {tarjetas.map(s => <button key={`e${s.id}`} disabled={yaEsta('estrategia', s.id)} onClick={() => enlaza('estrategia', s.id)} style={{ ...S.enlace, display: 'block', padding: '4px', opacity: yaEsta('estrategia', s.id) ? 0.45 : 1 }}>{s.name}</button>)}
                  <div style={{ ...S.apagado, margin: '8px 4px 4px' }}>Planes guardados</div>
                  {!planes.length && <div style={{ ...S.apagado, margin: '0 4px 6px' }}>No tienes planes guardados.</div>}
                  {planes.map(p => <button key={`p${p.id}`} disabled={yaEsta('plan', p.id)} onClick={() => enlaza('plan', p.id)} style={{ ...S.enlace, display: 'block', padding: '4px', opacity: yaEsta('plan', p.id) ? 0.45 : 1 }}>{p.nombre}</button>)}
                </div>)}
            </div>
          </div>
        ) : (
          <div style={{ ...S.tarjeta, padding: B.aire, ...S.secundario }}>{tesis == null ? 'Leyendo tus tesis…' : 'Elige una tesis de la lista o pulsa «+ Nueva tesis».'}</div>
        )}
        {lado && <PanelLado filas={adjuntos} bytes={bytesAdjuntos} nueva={nueva} urls={urls} elegida={elegida} subidas={subidas} avisos={avisosA} arrastrando={arrastrando} onArrastrando={setArrastrando}
          onAnadir={anadeArchivos} onElegir={elige} onAmpliar={abreVisor} onCierra={() => ponLado(false)} onDescargar={bajaArchivo}/>}
      </div>

      {pregunta && (
        <Pregunta id="sin-guardar" texto={`Tienes cambios sin guardar en ${nombreEn(borr)}.`} aviso={pregunta.fallo ? fallo : problema}>
          <button data-salida="guardar" onClick={() => responde('guardar')} disabled={!puedeGuardar} style={boton(puedeGuardar)}>{ocupado ? 'Guardando…' : 'Guardar'}</button>
          <button data-salida="salir" onClick={() => responde('salir')} disabled={ocupado} style={S.boton}>Salir sin guardar</button>
          <button data-salida="cancelar" onClick={() => responde('cancelar')} disabled={ocupado} style={S.boton}>Cancelar</button>
        </Pregunta>)}
      {borrando && (
        <Pregunta id="borrar" texto={`¿Borrar la tesis ${nombreEn(fila || borr)}? Desaparece del todo.`} detalle={avisoBorrar}>
          <button onClick={borra} style={{ ...S.botonVerde, background: ROJO, borderColor: ROJO, color: '#fff' }}>Sí, borrar</button>
          <button onClick={() => setBorrando(false)} style={S.boton}>Cancelar</button>
        </Pregunta>)}
      {borrandoA && (
        <Pregunta id="borrar-adjunto" texto={`¿Borrar «${borrandoA.nombre}»?`} detalle="Se borra de la nube de la app y no se puede recuperar. El archivo de tu PC no se toca.">
          <button data-cancelar-adjunto onClick={() => setBorrandoA(null)} style={S.boton}>Cancelar</button>
          <button data-confirmar-adjunto onClick={borraAdjunto} style={{ ...S.botonVerde, background: ROJO, borderColor: ROJO, color: '#fff' }}>Sí, borrar</button>
        </Pregunta>)}
      {visor && indiceVisor >= 0 && (
        <Visor lista={listaVisor} indice={indiceVisor} tituloTesis={(borr?.titulo || '').trim() || TITULO_NUEVA} urls={urls} onIr={(k) => setVisor({ clase: visor.clase, id: listaVisor[k].id })} onCierra={() => setVisor(null)} onDescargar={bajaArchivo}
          extraBarra={cabeLado && visor.clase === 'adjunto' ? <BotonLado activo={lado} onClick={() => { const f = listaVisor[indiceVisor]; setVisor(null); setLadoElegido(f.id); if (!lado) ponLado(true) }}/> : null}/>)}
    </div>
  )
}
