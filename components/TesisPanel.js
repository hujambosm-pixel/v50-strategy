// components/TesisPanel.js — la pantalla «Tesis» (V9.1092, docs/tesis.md): mis TESIS DE INVERSIÓN en texto libre, según el boceto
// aprobado «Tesis de inversión», con el estilo del Builder (lib/builder/estilo). Pantalla AISLADA: no toca el motor, el Builder ni
// ninguna cifra. Las llamadas a la base, en lib/tesis.js (tabla tesis_inversion, sql/tesis_inversion.sql).
// A la izquierda, el buscador, los filtros por estado y la lista (por revisada_en, la más reciente arriba); a la derecha, la tesis
// abierta: título, estado, fechas, el cuadro de texto libre y «Relacionado» (estrategias de tarjetas y planes guardados).
// Props: estrategias (las filas de `strategies`), onAbrirEstrategia (abre una en el paso 1 del Builder), salida (un ref: la página
// pregunta por él antes de cambiar de pestaña; devuelve true si hay cambios y se ha abierto la pregunta). deps ({ ctx }) e inicial
// ({ tesis, planes, abierta, borrador, nueva, pregunta, borrando, filtro, busca, anadiendo }): para las pruebas de montaje.
import { useState, useEffect, useMemo, useRef } from 'react'
import { B, S } from '../lib/builder/estilo'
import Ayuda from './BuilderAyuda'
import { esDeTarjetas } from '../lib/pruebaAzar'
import { ctxConSesion, hayConfigSupabase } from '../lib/supabase'
import { AYUDA_RELACIONADO, AYUDA_TESIS, ESTADOS_TESIS, TITULO_NUEVA, borrarTesis, buscaTesis, cambiarTesis, crearTesis, cuentasTesis, estadoTesis, fechaCorta,
  fichaDe, haceTexto, igualesTesis, listarNombresPlanes, listarTesis, marcarRevisada, ordenTesis, problemaDe } from '../lib/tesis'

const NUEVA = Object.freeze({ titulo: TITULO_NUEVA, texto: '', estado: 'idea', relacionados: [] })
const borradorDe = (t) => ({ titulo: t.titulo, texto: t.texto || '', estado: t.estado, relacionados: Array.isArray(t.relacionados) ? t.relacionados : [] })
const ROJO = '#f85149', AMARILLO = '#f2cc60'

const Etiqueta = ({ estado }) => { const e = estadoTesis(estado); return <span data-estado={e.id} style={{ display: 'inline-block', padding: '1px 9px', borderRadius: 999, background: e.fondo, color: e.color, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>{e.nombre}</span> }
const Papelera = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={ROJO} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>
  </svg>)
// Una ventana de pregunta (sin guardar, borrar), encima de todo.
const Pregunta = ({ id, texto, children }) => (
  <div data-pregunta={id} role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
    <div style={{ ...S.tarjeta, padding: 20, maxWidth: 440, width: '100%' }}>
      <div style={{ color: B.titulo, marginBottom: 16 }}>{texto}</div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>{children}</div>
    </div>
  </div>)

export default function TesisPanel({ estrategias = [], onAbrirEstrategia, salida = null, deps = null, inicial = null }) {
  // El ctx en cada llamada: ctxConSesion() pone el token vigente y renueva la sesión ante 401 (nada congelado al montar).
  const ctx = () => deps?.ctx || (hayConfigSupabase() ? ctxConSesion() : null)
  const [tesis, setTesis] = useState(inicial?.tesis || null)
  const [planes, setPlanes] = useState(inicial?.planes || [])
  const [fallo, setFallo] = useState(null)
  const [abierta, setAbierta] = useState(inicial?.abierta ?? null)   // id de la tesis abierta (null: ninguna o la nueva)
  const [nueva, setNueva] = useState(!!inicial?.nueva)   // la abierta es una nueva sin guardar
  const [borr, setBorr] = useState(inicial?.borrador || null)   // lo que se está escribiendo
  const [filtro, setFiltro] = useState(inicial?.filtro || 'todas')
  const [busca, setBusca] = useState(inicial?.busca || '')
  const [pregunta, setPregunta] = useState(inicial?.pregunta ? { accion: () => {} } : null)   // «Tienes cambios sin guardar…»
  const [borrando, setBorrando] = useState(!!inicial?.borrando)
  const [anadiendo, setAnadiendo] = useState(!!inicial?.anadiendo)
  const [ocupado, setOcupado] = useState(false)
  const [foco, setFoco] = useState(0)
  const titulo = useRef(null)

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

  const fila = nueva ? null : ordenadas.find(t => t.id === abierta) || null
  const original = nueva ? NUEVA : fila ? borradorDe(fila) : null
  const conCambios = !!borr && !!original && !igualesTesis(borr, original)
  const sinGuardar = !!borr && (nueva || conCambios)
  const problema = borr ? problemaDe(borr) : null
  const puedeGuardar = sinGuardar && !problema && !ocupado
  // La página pregunta antes de cambiar de pestaña; y el navegador, antes de cerrar o recargar.
  useEffect(() => { if (salida) salida.current = (seguir) => { if (!conCambios) return false; setPregunta({ accion: seguir }); return true } })
  useEffect(() => () => { if (salida) salida.current = null }, [])
  useEffect(() => {
    if (!conCambios) return
    const avisa = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', avisa)
    return () => window.removeEventListener('beforeunload', avisa)
  }, [conCambios])

  const vistas = useMemo(() => buscaTesis(ordenadas, busca), [ordenadas, busca])
  const cuentas = useMemo(() => cuentasTesis(vistas), [vistas])
  const lista = filtro === 'todas' ? vistas : vistas.filter(t => t.estado === filtro)
  const nombreEn = (x) => `«${(x?.titulo || '').trim() || TITULO_NUEVA}»`

  // Con cambios sin guardar, pregunta antes de seguir (una nueva sin tocar se deja sin preguntar).
  const conGuardia = (accion) => { if (conCambios) setPregunta({ accion }); else accion() }
  const abre = (t) => { setNueva(false); setAbierta(t.id); setBorr(borradorDe(t)); setBorrando(false); setAnadiendo(false); setFallo(null) }
  const creaNueva = () => { setNueva(true); setAbierta(null); setBorr({ ...NUEVA }); setBorrando(false); setAnadiendo(false); setFallo(null); setFoco(n => n + 1) }
  const cambia = (k, v) => setBorr(b => ({ ...b, [k]: v }))
  const pon = (r) => setTesis(xs => [r, ...(xs || []).filter(x => x.id !== r.id)])
  const guarda = async () => {
    if (!puedeGuardar) return false
    setOcupado(true); setFallo(null)
    try {
      const r = nueva ? await crearTesis(ctx(), borr) : await cambiarTesis(ctx(), fila.id, borr)
      pon(r); setNueva(false); setAbierta(r.id); setBorr(borradorDe(r))
      return true
    } catch (e) { setFallo(e.message); return false } finally { setOcupado(false) }
  }
  const revisada = async () => {
    if (!fila || ocupado) return
    setOcupado(true); setFallo(null)
    try { pon(await marcarRevisada(ctx(), fila.id)) } catch (e) { setFallo(e.message) } finally { setOcupado(false) }
  }
  const borra = async () => {
    setBorrando(false)
    const siguiente = (resto) => { const o = ordenTesis(resto)[0]; if (o) abre(o); else { setNueva(false); setAbierta(null); setBorr(null) } }
    if (nueva) { siguiente(tesis || []); return }
    setOcupado(true); setFallo(null)
    try { await borrarTesis(ctx(), fila.id); const resto = (tesis || []).filter(x => x.id !== fila.id); setTesis(resto); siguiente(resto) } catch (e) { setFallo(e.message) } finally { setOcupado(false) }
  }
  const responde = async (que) => {
    const p = pregunta
    if (que === 'cancelar') { setPregunta(null); return }
    if (que === 'guardar' && !(await guarda())) { setPregunta(null); return }
    setPregunta(null); p?.accion?.()
  }

  const tarjetas = useMemo(() => estrategias.filter(esDeTarjetas).sort((a, b) => String(a.name).localeCompare(String(b.name), 'es')), [estrategias])
  const fichas = (borr?.relacionados || []).map(r => fichaDe(r, estrategias, planes))
  const yaEsta = (tipo, id) => (borr?.relacionados || []).some(r => r.tipo === tipo && String(r.id) === String(id))
  const enlaza = (tipo, id) => { cambia('relacionados', [...(borr.relacionados || []), { tipo, id: String(id) }]); setAnadiendo(false) }
  const quita = (k) => cambia('relacionados', borr.relacionados.filter((_, i) => i !== k))

  const boton = (activo) => activo ? S.botonVerde : S.botonDesactivado
  const campo = { fontFamily: B.letra, fontSize: B.base, background: B.fondo, color: B.texto, border: `1px solid ${B.borde}`, borderRadius: B.radioBoton, padding: '8px 10px', boxSizing: 'border-box' }
  const filtros = [{ id: 'todas', nombre: 'Todas' }, ...ESTADOS_TESIS]

  return (
    <div data-tesis className="ts-pagina" style={{ ...S.pagina, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <style>{`.ts-cuerpo { display: grid; grid-template-columns: 360px minmax(0, 1fr); gap: 16px; align-items: start }
@media (max-width: 999px) { .ts-cuerpo { grid-template-columns: minmax(0, 1fr) } .ts-texto { height: auto !important } }
.ts-pagina { box-sizing: border-box; height: calc(100vh - 56px) }`}</style>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: B.titulo }}>Mis tesis de inversión</div>
        <Ayuda texto={AYUDA_TESIS} etiqueta="Mis tesis de inversión"/>
        <div style={{ flex: 1 }}/>
        <button data-nueva onClick={() => conGuardia(creaNueva)} style={S.botonVerde}>+ Nueva tesis</button>
      </div>
      {fallo && <div data-fallo style={{ color: '#ff8b8b' }}>⚠ {fallo}</div>}

      <div className="ts-cuerpo">
        {/* ── Izquierda: buscador, filtros y lista ── */}
        <div data-lista style={{ ...S.tarjeta, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input aria-label="Buscar" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar en títulos y textos…" style={{ ...campo, width: '100%' }}/>
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {nueva && (
              <div data-item="nueva" aria-current="true" style={{ padding: '8px 10px', borderRadius: B.radioBoton, background: B.siguienteFondo, border: `1px solid ${B.siguienteBorde}` }}>
                <div style={{ fontWeight: 600, color: B.titulo }}>{(borr?.titulo || '').trim() || TITULO_NUEVA}</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}><Etiqueta estado={borr?.estado}/><span style={{ ...S.apagado, color: AMARILLO }}>sin guardar</span></div>
              </div>)}
            {lista.map(t => { const on = !nueva && t.id === abierta; return (
              <button key={t.id} data-item={t.id} aria-current={on ? 'true' : undefined} onClick={() => { if (!on) conGuardia(() => abre(t)) }}
                style={{ textAlign: 'left', cursor: 'pointer', fontFamily: B.letra, fontSize: B.base, color: B.texto, padding: '8px 10px', borderRadius: B.radioBoton,
                  background: on ? B.siguienteFondo : 'transparent', border: `1px solid ${on ? B.siguienteBorde : 'transparent'}` }}>
                <div style={{ fontWeight: 600, color: B.titulo, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.titulo}</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}><Etiqueta estado={t.estado}/><span style={S.apagado}>{haceTexto(t)}</span></div>
              </button>) })}
          </div>
        </div>

        {/* ── Derecha: la tesis abierta ── */}
        {borr ? (
          <div data-abierta style={{ ...S.tarjeta, padding: B.aire, display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <input ref={titulo} aria-label="Título" value={borr.titulo} maxLength={200} onChange={e => cambia('titulo', e.target.value)}
                style={{ ...campo, flex: '1 1 260px', minWidth: 0, fontSize: 20, fontWeight: 700, color: B.titulo, background: 'transparent', borderColor: 'transparent' }}/>
              {sinGuardar && <span data-sin-guardar style={{ color: AMARILLO, fontSize: 13, whiteSpace: 'nowrap' }}>● sin guardar</span>}
              <button data-guardar disabled={!puedeGuardar} onClick={guarda} style={boton(puedeGuardar)}>{ocupado ? 'Guardando…' : 'Guardar'}</button>
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
              <span data-fechas style={S.apagado}>{fila ? `Creada ${fechaCorta(fila.created_at)} · Revisada ${fechaCorta(fila.revisada_en)}` : 'Sin guardar todavía'}</span>
              <button data-revisada disabled={!fila || ocupado} onClick={revisada} style={{ ...S.boton, padding: '5px 12px', fontSize: 13, opacity: fila ? 1 : 0.5, cursor: fila ? 'pointer' : 'not-allowed' }}>✓ Marcar como revisada hoy</button>
            </div>
            <textarea data-texto className="ts-texto" aria-label="Texto de la tesis" value={borr.texto} onChange={e => cambia('texto', e.target.value)}
              placeholder="Qué crees que va a pasar, qué tendría que ocurrir para entrar y qué te haría descartarla…"
              style={{ ...campo, width: '100%', height: 'calc(100vh - 380px)', minHeight: 400, resize: 'vertical', overflowY: 'auto', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}/>

            <div data-relacionado>
              <div style={{ display: 'flex', alignItems: 'center', gap: 2, fontWeight: 700, color: B.titulo, marginBottom: 8 }}>Relacionado<Ayuda texto={AYUDA_RELACIONADO} etiqueta="Relacionado"/></div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                {fichas.map((f, k) => (
                  <span key={`${f.tipo}${f.id}`} data-ficha={`${f.tipo}-${f.id}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '4px 6px 4px 12px', borderRadius: 999, border: `1px solid ${B.borde}`, background: B.cabecera }}>
                    {f.borrado
                      ? <span data-borrado style={{ color: B.apagado }}>{f.etiqueta} · (borrado)</span>
                      : <span>{f.etiqueta} · {f.nombre}</span>}
                    {!f.borrado && f.tipo === 'estrategia' && onAbrirEstrategia && <button data-abrir onClick={() => conGuardia(() => onAbrirEstrategia(f.fila))} style={{ ...S.enlace, fontSize: 13 }}>Abrir</button>}
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
      </div>

      {pregunta && (
        <Pregunta id="sin-guardar" texto={`Tienes cambios sin guardar en ${nombreEn(borr)}. ¿Guardarlos?`}>
          <button onClick={() => responde('guardar')} disabled={!!problema} style={boton(!problema)}>Guardar</button>
          <button onClick={() => responde('descartar')} style={S.boton}>Descartar</button>
          <button onClick={() => responde('cancelar')} style={S.boton}>Cancelar</button>
        </Pregunta>)}
      {borrando && (
        <Pregunta id="borrar" texto={`¿Borrar la tesis ${nombreEn(fila || borr)}? Desaparece del todo.`}>
          <button onClick={borra} style={{ ...S.botonVerde, background: ROJO, borderColor: ROJO, color: '#fff' }}>Sí, borrar</button>
          <button onClick={() => setBorrando(false)} style={S.boton}>Cancelar</button>
        </Pregunta>)}
    </div>
  )
}
