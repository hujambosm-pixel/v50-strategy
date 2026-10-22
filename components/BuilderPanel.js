// components/BuilderPanel.js — la pestaña «Builder» (docs/builder.md): tanda 1 con el aspecto del boceto (tanda 1b). La barra de
// los tres pasos (indicativa), el recuadro «Siguiente paso», las plantillas de estrategia (lib/builder/plantillas.js) y «Mi
// trabajo» (lib/builder/miTrabajo.js), con el estilo de lib/builder/estilo.js (solo el Builder; el resto de la app no cambia).
// No crea nada por su cuenta: abre el editor visual de hoy (con una COPIA nueva de la plantilla, que se guarda al pulsar
// Guardar), el panel de código de siempre o el modo Lotes del editor, a través de los callbacks de la página.
import { useState, useEffect, useMemo, useCallback } from 'react'
import { PLANTILLAS, BLANCO } from '../lib/builder/plantillas'
import { construyeMiTrabajo, ESTADOS } from '../lib/builder/miTrabajo'
import { fraseDefinicion } from '../lib/editor/definicion'
import { listarPruebas } from '../lib/registroLab'
import { getSupaUrl, getSupaH, hayConfigSupabase } from '../lib/supabase'
import { B, S } from '../lib/builder/estilo'

export const PASOS = ['Crear la estrategia', 'Probarla contra el azar', 'Convertirla en plan']
export const SUBTITULOS_PASOS = ['Cuándo compro, cuándo vendo y cuánto arriesgo', '¿Gana por algo más que suerte?', 'Dinero real, aportaciones e impuestos']
const TIPO_CHIP = { [ESTADOS.supera]: 'supera', [ESTADOS.mejora]: 'supera', [ESTADOS.noSupera]: 'noSupera', [ESTADOS.noMejora]: 'noSupera', [ESTADOS.borrador]: 'borrador' }
export const FILTROS_TRABAJO = [['editorLotes', 'Editor y lotes'], ['codigo', 'Código'], ['todo', 'Todo']]
export const filtraTrabajo = (filas, filtro) => (filas || []).filter(f => filtro === 'todo' ? true : filtro === 'codigo' ? f.origen === 'código' : f.origen !== 'código')
const celda = { padding: '10px 12px', borderBottom: `1px solid ${B.borde}`, verticalAlign: 'top', textAlign: 'left' }

// Una frase con las partes clave entre ** en negrita blanca.
function Frase({ texto }) {
  return <>{String(texto || '').split('**').map((t, k) => k % 2 ? <strong key={k} style={{ color: B.titulo }}>{t}</strong> : <span key={k}>{t}</span>)}</>
}

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

// estrategias: las de la página (strategies). datosIniciales (opcional, para las pruebas): { lotes, pruebas } en lugar de leerlos;
// filasIniciales (opcional, para las pruebas de montaje): las filas de «Mi trabajo» ya calculadas; filtroInicial: el del filtro.
export default function BuilderPanel({ estrategias = [], onEmpezar, onPlantilla, onAbrirEstrategia, onAbrirLote, onModoLotes, onEditorClasico, datosIniciales = null, filasIniciales = null, filtroInicial = 'editorLotes' }) {
  const [datos, setDatos] = useState(() => datosIniciales || { lotes: [], pruebas: [], cargando: !datosIniciales, error: null })
  const [filas, setFilas] = useState(filasIniciales)
  const [filtro, setFiltro] = useState(filtroInicial)
  const [detalle, setDetalle] = useState({})
  const recarga = useCallback(async () => {
    if (datosIniciales) return
    if (!hayConfigSupabase()) { setDatos({ lotes: [], pruebas: [], cargando: false, error: 'Sin conexión con la base de datos: solo se ven las estrategias.' }); return }
    setDatos(d => ({ ...d, cargando: true }))
    try {
      const r = await fetch(`${getSupaUrl()}/rest/v1/editor_lotes?select=id,creado,nombre,lote,hash_lote,huellas&order=creado.desc,id.desc&limit=200`, { headers: getSupaH() })
      const lotes = r.ok ? await r.json() : []
      const pruebas = await listarPruebas({ url: getSupaUrl(), headers: getSupaH() }, { limite: 500, soloResumen: false, filtro: '&config->>prueba=in.(editorLote,editorLab,editorCalibracion,planLote)' })
      setDatos({ lotes, pruebas, cargando: false, error: r.ok ? null : `No se pudieron leer los lotes (HTTP ${r.status}).` })
    } catch (e) { setDatos(d => ({ ...d, cargando: false, error: e.message })) }
  }, [datosIniciales])
  useEffect(() => { recarga() }, [recarga])
  useEffect(() => { let vivo = true; construyeMiTrabajo({ estrategias, lotes: datos.lotes, pruebas: datos.pruebas }).then(f => { if (vivo) setFilas(f) }).catch(() => { if (vivo) setFilas([]) }); return () => { vivo = false } }, [estrategias, datos.lotes, datos.pruebas])
  const frases = useMemo(() => Object.fromEntries(PLANTILLAS.filter(p => p.definicion).map(p => { try { return [p.id, fraseDefinicion(p.definicion(), p.valores)] } catch (_) { return [p.id, ''] } })), [])
  const visibles = filtraTrabajo(filas, filtro)
  const accion = (f) => {
    const a = f.toca?.accion
    if (!a) return
    if (a.tipo === 'codigo') onAbrirEstrategia?.(f.estrategia, 'codigo')
    else if (a.tipo === 'editor') onAbrirEstrategia?.(f.estrategia, 'editor')
    else if (a.tipo === 'lotes') onModoLotes?.()
    else if (a.tipo === 'lote') onAbrirLote?.(a.id)
  }
  const abreFila = (f) => f.tipo === 'lote' ? (f.lote?.lote?.tipo === 'planes' ? null : onAbrirLote?.(f.lote.id)) : onAbrirEstrategia?.(f.estrategia, f.origen === 'editor' ? 'editor' : 'codigo')

  return (
    <div style={S.pagina}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 22, fontWeight: 700, color: B.titulo }}>Builder</span>
        <span style={S.secundario}>Crea una estrategia, pruébala contra el azar y conviértela en un plan.</span>
        <button style={{ ...S.enlace, marginLeft: 'auto', color: B.apagado, fontSize: 13 }} onClick={() => onEditorClasico?.()} title="La pantalla de siempre para crear una estrategia escribiendo su código">Editor clásico</button>
      </div>
      <BarraPasos actual={1}/>

      <div style={{ background: B.siguienteFondo, border: `1px solid ${B.siguienteBorde}`, borderRadius: B.radioTarjeta, padding: B.aire, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 320px' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: B.titulo, marginBottom: 4 }}>Siguiente paso: crea tu estrategia</div>
          <div style={S.secundario}>Empieza en blanco o desde una de las plantillas de abajo. Se abre el editor visual; cuando la guardes, aparecerá en «Mi trabajo».</div>
        </div>
        <button style={S.botonVerde} onClick={() => onEmpezar?.({ id: null, name: '', definition: BLANCO(), params: {} })}>Empezar en blanco</button>
      </div>

      <div style={S.tituloSeccion}>Empieza desde una plantilla de estrategia</div>
      <div style={S.subtituloSeccion}>Cada plantilla abre una copia nueva en el editor, ya rellenada. Cámbiala a tu gusto y guárdala.</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
        {PLANTILLAS.map(p => (
          <div key={p.id} style={{ ...S.tarjeta, display: 'flex', flexDirection: 'column', opacity: p.desactivada ? 0.8 : 1 }}>
            <div style={{ ...S.cabeceraTarjeta, borderLeft: `3px solid ${p.desactivada ? B.borde : B.verde}`, color: p.desactivada ? B.secundario : B.titulo }}>{p.titulo}</div>
            <div style={{ ...S.cuerpo, flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ background: B.fondo, borderRadius: B.radioBoton, padding: '10px 12px', color: B.texto }}><Frase texto={p.regla || p.frase}/></div>
              {p.como && <div style={S.apagado}>Como «{p.como}»</div>}
              {p.desactivada && <div style={{ color: '#f2cc60', fontSize: 13 }}>{p.aviso}</div>}
              {(p.desactivada || frases[p.id]) && (
                <div>
                  <button style={{ ...S.enlace, fontSize: 12 }} onClick={() => setDetalle(d => ({ ...d, [p.id]: !d[p.id] }))} aria-expanded={!!detalle[p.id]}>{detalle[p.id] ? 'Ocultar detalle' : 'Ver detalle'}</button>
                  {detalle[p.id] && <div style={{ ...S.apagado, marginTop: 6 }}>{p.desactivada ? p.desactivada : frases[p.id]}</div>}
                </div>
              )}
              <button style={{ ...S.boton, marginTop: 'auto', opacity: p.desactivada ? 0.5 : 1, cursor: p.desactivada ? 'not-allowed' : 'pointer' }} disabled={!!p.desactivada}
                onClick={() => !p.desactivada && onPlantilla?.({ id: null, name: p.definicion().nombre, definition: p.definicion(), params: { ...p.valores } })}>Usar esta plantilla</button>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
          <div style={S.tituloSeccion}>Mi trabajo</div>
          <div style={{ ...S.subtituloSeccion, marginBottom: 0 }}>Tus estrategias y tus lotes: en qué paso están, cómo les fue y qué toca ahora. Pulsa un nombre para abrirlo.</div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }} role="group" aria-label="Qué enseñar">
          {FILTROS_TRABAJO.map(([k, t]) => <button key={k} onClick={() => setFiltro(k)} aria-pressed={filtro === k}
            style={{ ...S.boton, padding: '6px 12px', fontSize: 13, ...(filtro === k ? { background: B.cabecera, borderColor: B.siguienteBorde, color: B.titulo, fontWeight: 700 } : { background: 'transparent', color: B.secundario }) }}>{t}</button>)}
          {!datosIniciales && <button style={{ ...S.enlace, fontSize: 13, marginLeft: 6 }} onClick={recarga}>Actualizar</button>}
        </div>
      </div>
      <div style={{ ...S.tarjeta, marginTop: 12 }}>
        {datos.error && <div style={{ color: '#f2cc60', padding: '10px 16px' }}>{datos.error}</div>}
        <div style={{ overflowX: 'auto', maxHeight: 560, overflowY: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead><tr>{['Nombre', 'Paso', 'Estado', 'Resultado', 'Qué toca ahora'].map(h => <th key={h} style={{ ...celda, color: B.secundario, fontWeight: 600, fontSize: 12, position: 'sticky', top: 0, background: B.cabecera }}>{h}</th>)}</tr></thead>
            <tbody>
              {visibles.map(f => (
                <tr key={f.clave}>
                  <td style={celda}>
                    <button style={{ ...S.enlace, color: B.titulo, fontWeight: 600 }} onClick={() => abreFila(f)} title={f.tipo === 'lote' ? 'Abrir el lote' : f.origen === 'editor' ? 'Abrir en el editor visual' : 'Abrir el código'}>{f.nombre}</button>
                    <div style={S.apagado}>{f.origen}{f.desactivada ? ' · desactivada' : ''}</div>
                  </td>
                  <td style={{ ...celda, whiteSpace: 'nowrap', color: B.secundario }}>{f.paso} · {f.paso === 1 ? 'Crear' : f.paso === 2 ? 'Prueba' : 'Plan'}</td>
                  <td style={celda}><span style={S.chip(TIPO_CHIP[f.estado] || 'neutro')}>{f.estado}</span></td>
                  <td style={{ ...celda, color: B.resultado, maxWidth: 380 }}>{f.resultado}</td>
                  <td style={celda}>{f.toca?.accion ? <button style={{ ...S.enlace, fontWeight: 700 }} onClick={() => accion(f)}>{f.toca.texto}</button> : <span style={{ color: B.apagado }}>{f.toca?.texto || '—'}</span>}</td>
                </tr>
              ))}
              {filas && !visibles.length && <tr><td colSpan={5} style={{ ...celda, color: B.secundario }}>{filas.length ? 'Nada con este filtro.' : 'Todavía no hay nada. Empieza en blanco o desde una plantilla.'}</td></tr>}
              {!filas && <tr><td colSpan={5} style={{ ...celda, color: B.secundario }}>Cargando…</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      <div style={{ ...S.apagado, marginTop: 10 }}>«Calibrando…» no aparece aquí: la calibración corre en el navegador y solo se guarda al terminar (mientras corre, se ve en el modo Lotes del editor). Las estrategias de código se prueban contra el azar en Backtesting.</div>
    </div>
  )
}
