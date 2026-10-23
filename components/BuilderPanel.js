// components/BuilderPanel.js — la pestaña «Builder» (docs/builder.md): tanda 1 con el aspecto del boceto (tanda 1b). La barra de
// los tres pasos (indicativa), el bloque «¿Desde dónde empiezas?» (V9.1042: en blanco, desde una plantilla o desde una de mis
// estrategias) y «Mi trabajo» en dos pestañas, «Mis estrategias» y «Mis pruebas» (lib/builder/misListas.js), con el estilo de
// lib/builder/estilo.js (solo el Builder; el resto de la app no cambia). No crea nada por su cuenta: abre el editor con una COPIA
// nueva (de la plantilla o de la estrategia elegida), que se guarda al pulsar Guardar, o el panel de código de siempre, a través de
// los callbacks de la página. El paso 2 («Probarla contra el azar», tanda 2) es una pantalla del propio Builder:
// components/BuilderPrueba.js. En las filas no hay «Editar» ni «Copiar»: se edita pulsando el nombre y se copia desde el inicio.
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { PLANTILLAS, BLANCO } from '../lib/builder/plantillas'
import { construyeMisEstrategias, construyeMisPruebas, filtraEstrategias, FILTROS_ESTRATEGIAS, CHIP } from '../lib/builder/misListas'
import { esDefinicionEditor } from '../lib/editor/fuente'
import { listarPruebas } from '../lib/registroLab'
import { getSupaUrl, getSupaH, hayConfigSupabase } from '../lib/supabase'
import { B, S } from '../lib/builder/estilo'
import BuilderPrueba from './BuilderPrueba'
import BuilderGuia from './BuilderGuia'

export const PASOS = ['Crear la estrategia', 'Probarla contra el azar', 'Convertirla en plan']
export const SUBTITULOS_PASOS = ['Cuándo compro, cuándo vendo y cuánto arriesgo', '¿Gana por algo más que suerte?', 'Dinero real, aportaciones e impuestos']
// La firma de lo leído de la base (lotes y pruebas: id y huella / fecha): si no cambia, no se recalcula «Mi trabajo».
export const firmaDatos = (lotes, pruebas) => JSON.stringify([(lotes || []).map(l => [l.id, l.hash_lote]), (pruebas || []).map(p => [p.id, p.creado])])
export const QUE_ES = 'Una estrategia es una regla de compra y venta. Una prueba es la comprobación contra el azar de una o varias estrategias.'
const celda = { padding: '10px 12px', borderBottom: `1px solid ${B.borde}`, verticalAlign: 'top', textAlign: 'left' }
const cabecera = { ...celda, color: B.secundario, fontWeight: 600, fontSize: 12, position: 'sticky', top: 0, background: B.cabecera }
const params = (p) => { try { return typeof p === 'string' ? JSON.parse(p || '{}') : (p || {}) } catch (_) { return {} } }
const copia = (x) => JSON.parse(JSON.stringify(x))

// Una frase con las partes clave entre ** en negrita blanca.
function Frase({ texto }) {
  return <>{String(texto || '').split('**').map((t, k) => k % 2 ? <strong key={k} style={{ color: B.titulo }}>{t}</strong> : <span key={k}>{t}</span>)}</>
}
const Chip = ({ clave }) => { const [tipo, txt] = CHIP[clave] || CHIP.sinVeredicto; return <span style={S.chip(tipo)}>{txt}</span> }

// La barra de los tres pasos; `actual` resaltado (en la tanda 1, solo indica).
export function BarraPasos({ actual = 1 }) {
  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }} aria-label="Pasos del Builder">
      {PASOS.map((p, k) => {
        const n = k + 1, on = n === actual
        return (
          <div key={p} aria-current={on ? 'step' : undefined} style={{ flex: '1 1 200px', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: B.radioTarjeta,
            border: `1px solid ${on ? B.pasoBorde : B.borde}`, background: on ? B.pasoFondo : B.tarjeta }}>
            <span style={{ width: 28, height: 28, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontWeight: 700,
              background: on ? B.verde : 'transparent', color: on ? B.sobreVerde : B.secundario, border: on ? 'none' : `1px solid ${B.borde}` }}>{n}</span>
            <span style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontWeight: 700, color: on ? B.titulo : B.secundario }}>{p}</span>
              <span style={{ fontSize: 12, color: on ? B.secundario : B.apagado }}>{SUBTITULOS_PASOS[k]}</span>
            </span>
          </div>
        )
      })}
    </div>
  )
}

// La fila que se manda al editor para una copia nueva de una estrategia guardada: sin id, «<nombre> (copia)».
export const filaCopia = (s) => ({ id: null, name: `${s.name} (copia)`, description: s.description || '', definition: copia(s.definition), params: params(s.params), copiaDe: s.name })

// estrategias: las de la página (strategies). datosIniciales (opcional, para las pruebas): { lotes, pruebas } en lugar de leerlos;
// listasIniciales (opcional, para las pruebas de montaje): { estrategias, pruebas } ya calculadas; pestanaInicial y filtroInicial.
// visible: si la pestaña se ve. Cada vez que pasa a verse (al entrar o al volver del editor) se vuelve a leer la base, sin
// enseñar «Cargando» y sin recalcular si no ha cambiado nada (firmaDatos). Las estrategias llegan de la página.
// apiFetch y version: para la pantalla del paso 2. vistaInicial (opcional, para las pruebas): la de BuilderPrueba ({ estrategiaId } | { loteId }).
export default function BuilderPanel({ estrategias = [], onEmpezar, onPlantilla, onCopiar, onAbrirEstrategia, onEditorClasico, datosIniciales = null, listasIniciales = null, pestanaInicial = 'estrategias', filtroInicial = 'editor', visible, apiFetch, version, vistaInicial = null }) {
  const [datos, setDatos] = useState(() => datosIniciales || { lotes: [], pruebas: [], cargando: !datosIniciales, error: null })
  const [filasE, setFilasE] = useState(listasIniciales?.estrategias || null)
  const [filasP, setFilasP] = useState(listasIniciales?.pruebas || null)
  const [pestana, setPestana] = useState(pestanaInicial)
  const [filtro, setFiltro] = useState(filtroInicial)
  const [aCopiar, setACopiar] = useState('')
  const [prueba, setPrueba] = useState(vistaInicial && !vistaInicial.guia ? { ...vistaInicial, n: 0 } : null)   // la pantalla del paso 2, si está abierta
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
  useEffect(() => {
    if (listasIniciales) return
    let vivo = true
    construyeMisEstrategias({ estrategias, lotes: datos.lotes, pruebas: datos.pruebas }).then(f => { if (vivo) setFilasE(f) }).catch(() => { if (vivo) setFilasE([]) })
    try { setFilasP(construyeMisPruebas({ lotes: datos.lotes, pruebas: datos.pruebas })) } catch (_) { setFilasP([]) }
    return () => { vivo = false }
  }, [estrategias, datos.lotes, datos.pruebas, listasIniciales])
  const delEditor = useMemo(() => estrategias.filter(s => esDefinicionEditor(s.definition)).sort((a, b) => String(a.name).localeCompare(String(b.name), 'es')), [estrategias])
  const elegidaCopia = delEditor.find(s => String(s.id) === aCopiar) || delEditor[0] || null
  const visiblesE = filtraEstrategias(filasE, filtro)
  const cuantas = Object.fromEntries(FILTROS_ESTRATEGIAS.map(([k]) => [k, filtraEstrategias(filasE, k).length]))
  const accion = (f) => {
    const a = f.toca?.accion
    if (!a) return
    if (a.tipo === 'editor') onAbrirEstrategia?.(f.estrategia, 'editor')
    else if (a.tipo === 'prueba') setPrueba({ ...(a.loteId != null ? { loteId: a.loteId } : { estrategiaId: a.estrategiaId }), n: Date.now() })
  }
  const abrePrueba = (id) => setPrueba({ loteId: id, n: Date.now() })

  if (guia) return <BuilderGuia onVolver={() => setGuia(false)}/>
  if (prueba) return <BuilderPrueba key={prueba.n} estrategias={estrategias} lotes={datos.lotes} inicio={prueba} apiFetch={apiFetch} version={version}
    onVolver={() => { setPrueba(null); recarga() }} onNuevaPrueba={() => setPrueba({ n: Date.now() })} onCambio={recarga}/>
  const pestanaBtn = (k, t, n) => (
    <button key={k} role="tab" aria-selected={pestana === k} onClick={() => setPestana(k)}
      style={{ ...S.boton, borderRadius: `${B.radioBoton}px ${B.radioBoton}px 0 0`, borderBottom: 'none', fontWeight: pestana === k ? 700 : 400,
        ...(pestana === k ? { background: B.tarjeta, color: B.titulo } : { background: 'transparent', color: B.secundario }) }}>{t}{n != null ? ` (${n})` : ''}</button>
  )
  return (
    <div style={S.pagina}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 22, fontWeight: 700, color: B.titulo }}>Builder</span>
        <span style={S.secundario}>Crea una estrategia, pruébala contra el azar y conviértela en un plan.</span>
        <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 16, flexWrap: 'wrap' }}>
          <button style={S.boton} onClick={() => setGuia(true)} title="Qué es una prueba, qué hace cada laboratorio y cómo leer sus resultados">Guía: cómo se prueba una estrategia</button>
          <button style={{ ...S.enlace, color: B.apagado, fontSize: 13 }} onClick={() => onEditorClasico?.()} title="La pantalla de siempre para crear una estrategia escribiendo su código">Editor clásico</button>
        </span>
      </div>
      <BarraPasos actual={1}/>

      <div style={{ ...S.tituloSeccion, marginTop: 8 }}>¿Desde dónde empiezas?</div>
      <div style={S.subtituloSeccion}>Las tres opciones abren el editor con una estrategia nueva. Se guarda al pulsar Guardar.</div>
      <div data-bloque="empezar" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
        <div data-tarjeta="blanco" style={{ ...S.tarjeta, display: 'flex', flexDirection: 'column' }}>
          <div style={S.cabeceraTarjeta}>En blanco</div>
          <div style={{ ...S.cuerpo, flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={S.secundario}>Abre el editor vacío y escribe tu regla de compra y venta desde cero.</div>
            <div style={{ marginTop: 'auto' }}><button style={S.botonVerde} onClick={() => onEmpezar?.({ id: null, name: '', definition: BLANCO(), params: {} })}>Empezar en blanco</button></div>
          </div>
        </div>
        <div data-tarjeta="plantilla" style={{ ...S.tarjeta, display: 'flex', flexDirection: 'column' }}>
          <div style={S.cabeceraTarjeta}>Desde una plantilla</div>
          <div style={{ ...S.cuerpo, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {PLANTILLAS.map(p => (
              <div key={p.id} style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingBottom: 10, borderBottom: `1px solid ${B.borde}`, opacity: p.desactivada ? 0.8 : 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <strong style={{ color: p.desactivada ? B.secundario : B.titulo, flex: 1 }}>{p.titulo}</strong>
                  <button style={{ ...S.boton, padding: '4px 10px', fontSize: 13, opacity: p.desactivada ? 0.5 : 1, cursor: p.desactivada ? 'not-allowed' : 'pointer' }} disabled={!!p.desactivada}
                    onClick={() => !p.desactivada && onPlantilla?.({ id: null, name: p.definicion().nombre, definition: p.definicion(), params: { ...p.valores } })}>Usar esta plantilla</button>
                </div>
                <div style={{ fontSize: 13, color: B.texto }}><Frase texto={p.regla || p.frase}/></div>
                {p.como && <div style={S.apagado}>Como «{p.como}»</div>}
                {p.desactivada && <div style={{ color: '#f2cc60', fontSize: 12 }} title={p.desactivada}>{p.aviso}</div>}
              </div>
            ))}
          </div>
        </div>
        <div data-tarjeta="copia" style={{ ...S.tarjeta, display: 'flex', flexDirection: 'column' }}>
          <div style={S.cabeceraTarjeta}>Desde una de mis estrategias</div>
          <div style={{ ...S.cuerpo, flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {delEditor.length ? (<>
              <select aria-label="Estrategia que copiar" value={elegidaCopia ? String(elegidaCopia.id) : ''} onChange={e => setACopiar(e.target.value)}
                style={{ fontFamily: B.letra, fontSize: B.base, background: B.fondo, color: B.texto, border: `1px solid ${B.borde}`, borderRadius: B.radioBoton, padding: '7px 10px' }}>
                {delEditor.map(s => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
              </select>
              <div style={S.secundario}>Se abre una copia nueva. La original no cambia, ni sus pruebas.</div>
              <div style={{ marginTop: 'auto' }}><button style={S.boton} onClick={() => elegidaCopia && onCopiar?.(filaCopia(elegidaCopia))}>Copiar y editar</button></div>
            </>) : <div style={S.secundario}>Todavía no tienes estrategias del editor. Empieza en blanco o desde una plantilla.</div>}
          </div>
        </div>
      </div>

      <div style={S.tituloSeccion}>Mi trabajo</div>
      <div style={{ ...S.subtituloSeccion }} data-que-es>{QUE_ES}</div>
      <div role="tablist" aria-label="Mi trabajo" style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {pestanaBtn('estrategias', 'Mis estrategias', filasE ? filasE.length : null)}
        {pestanaBtn('pruebas', 'Mis pruebas', filasP ? filasP.length : null)}
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
              <thead><tr>{['Estrategia', 'Versión', 'Última prueba', 'Cómo le fue', 'Qué toca ahora'].map(h => <th key={h} style={cabecera}>{h}</th>)}</tr></thead>
              <tbody>
                {visiblesE.map(f => (
                  <tr key={f.clave}>
                    <td style={{ ...celda, maxWidth: 340 }}>
                      <button style={{ ...S.enlace, color: B.titulo, fontWeight: 600 }} onClick={() => onAbrirEstrategia?.(f.estrategia, f.origen === 'editor' ? 'editor' : 'codigo')}
                        title={f.origen === 'editor' ? 'Abrir en el editor' : 'Abrir el código'}>{f.nombre}</button>
                      {f.subtitulo && <div style={S.apagado} title={f.subtitulo}>{f.subtitulo}</div>}
                      {f.desactivada && <div style={S.apagado}>Desactivada</div>}
                    </td>
                    <td style={{ ...celda, whiteSpace: 'nowrap', color: B.secundario }}>{f.version}</td>
                    <td style={celda}>{f.ultimaPrueba ? <button style={S.enlace} onClick={() => abrePrueba(f.ultimaPrueba.id)} title="Abrir los resultados de esta prueba">{f.ultimaPrueba.nombre}</button> : <span style={{ color: B.secundario }}>ninguna</span>}</td>
                    <td style={{ ...celda, maxWidth: 360 }}><Chip clave={f.chip}/>{f.linea && <div style={{ ...S.apagado, marginTop: 4 }}>{f.linea}</div>}</td>
                    <td style={celda}>{f.toca?.accion ? <button style={{ ...S.enlace, fontWeight: 700 }} onClick={() => accion(f)}>{f.toca.texto}</button> : <span style={{ color: B.apagado }}>{f.toca?.texto || '—'}</span>}{f.toca?.nota && <div style={S.apagado}>{f.toca.nota}</div>}</td>
                  </tr>
                ))}
                {filasE && !visiblesE.length && <tr><td colSpan={5} style={{ ...celda, color: B.secundario }}>{filasE.length ? 'Nada con este filtro.' : 'Todavía no hay estrategias. Empieza en blanco o desde una plantilla.'}</td></tr>}
                {!filasE && <tr><td colSpan={5} style={{ ...celda, color: B.secundario }}>Cargando…</td></tr>}
              </tbody>
            </table>
          </div>
          <div style={{ ...S.apagado, padding: '10px 12px' }}>Las estrategias de código no entran en la prueba guiada: se prueban contra el azar en Backtesting.</div>
        </>) : (<>
          <div style={{ overflowX: 'auto', maxHeight: 560, overflowY: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%' }} data-tabla="pruebas">
              <thead><tr>{['Prueba', 'Estrategias que incluye', 'Valores y periodos', 'Verificación de sesgos', 'Veredicto'].map(h => <th key={h} style={cabecera}>{h}</th>)}</tr></thead>
              <tbody>
                {(filasP || []).map(f => (
                  <tr key={f.clave}>
                    <td style={celda}>{f.planes ? <span style={{ color: B.titulo, fontWeight: 600 }}>{f.nombre}</span>
                      : <button style={{ ...S.enlace, color: B.titulo, fontWeight: 600 }} onClick={() => abrePrueba(f.id)} title="Abrir los resultados de esta prueba">{f.nombre}</button>}</td>
                    <td style={{ ...celda, maxWidth: 260 }}>{f.planes ? <span style={S.apagado}>{f.nota}</span> : <>{f.estrategias.length}: {f.estrategias.join(' · ')}</>}</td>
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
