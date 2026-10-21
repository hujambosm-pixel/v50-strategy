// components/BuilderPanel.js — la pestaña «Builder» (docs/builder.md): tanda 1. La barra de los tres pasos (indicativa), el
// recuadro «Siguiente paso», las plantillas de estrategia (lib/builder/plantillas.js) y «Mi trabajo» (lib/builder/miTrabajo.js).
// No crea nada por su cuenta: abre el editor visual de hoy (con una COPIA nueva de la plantilla, que se guarda al pulsar
// Guardar), el panel de código de siempre o el modo Lotes del editor, a través de los callbacks de la página.
import { useState, useEffect, useMemo, useCallback } from 'react'
import { MONO } from '../lib/utils'
import { PLANTILLAS, BLANCO } from '../lib/builder/plantillas'
import { construyeMiTrabajo, ESTADOS } from '../lib/builder/miTrabajo'
import { fraseDefinicion } from '../lib/editor/definicion'
import { listarPruebas } from '../lib/registroLab'
import { getSupaUrl, getSupaH, hayConfigSupabase } from '../lib/supabase'

const GRIS = 'var(--text-legible)'
const TAM = 12
const VERDE = '#00e5a0', ROJO = '#ff4d6d', AMBAR = '#ffb020', LILA = '#a78bfa'
const caja = { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 6, marginBottom: 12, overflow: 'hidden' }
const cabecera = { background: 'var(--bg3)', borderBottom: '1px solid var(--border)', padding: '7px 12px', fontFamily: MONO, fontSize: TAM, fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.04em' }
const cuerpo = { padding: '10px 12px' }
const nota = { fontFamily: MONO, fontSize: TAM, color: GRIS, lineHeight: 1.5 }
const boton = { fontFamily: MONO, fontSize: TAM, padding: '5px 12px', borderRadius: 4, cursor: 'pointer', border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text)' }
const botonPrincipal = { ...boton, border: '1px solid var(--accent)', background: 'rgba(0,212,255,0.14)', color: 'var(--accent)', fontWeight: 700 }
const enlace = { background: 'none', border: 'none', padding: 0, fontFamily: MONO, fontSize: TAM, color: 'var(--accent)', cursor: 'pointer', textDecoration: 'underline', textAlign: 'left' }
const celda = { padding: '6px 8px', borderBottom: '1px solid var(--border)', fontFamily: MONO, fontSize: TAM, verticalAlign: 'top' }
export const PASOS = ['Crear la estrategia', 'Probarla contra el azar', 'Convertirla en plan']
const COLOR_ESTADO = { [ESTADOS.supera]: VERDE, [ESTADOS.mejora]: VERDE, [ESTADOS.noSupera]: ROJO, [ESTADOS.noMejora]: ROJO, [ESTADOS.sinVeredicto]: AMBAR, [ESTADOS.borrador]: AMBAR, [ESTADOS.congelada]: LILA }

// La barra de los tres pasos; `actual` resaltado (en la tanda 1, solo indica).
export function BarraPasos({ actual = 1 }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }} aria-label="Pasos del Builder">
      {PASOS.map((p, k) => {
        const n = k + 1, on = n === actual
        return (
          <div key={p} aria-current={on ? 'step' : undefined} style={{ flex: '1 1 180px', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 6, fontFamily: MONO, fontSize: TAM,
            border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`, background: on ? 'rgba(0,212,255,0.12)' : 'var(--bg2)', color: on ? 'var(--accent)' : GRIS, fontWeight: on ? 700 : 400 }}>
            <span style={{ width: 22, height: 22, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`, flexShrink: 0 }}>{n}</span>
            {p}
          </div>
        )
      })}
    </div>
  )
}

// estrategias: las de la página (strategies). datosIniciales (opcional, para las pruebas): { lotes, pruebas } en lugar de leerlos;
// filasIniciales (opcional, para las pruebas de montaje): las filas de «Mi trabajo» ya calculadas.
export default function BuilderPanel({ estrategias = [], onEmpezar, onPlantilla, onAbrirEstrategia, onAbrirLote, onModoLotes, onEditorClasico, datosIniciales = null, filasIniciales = null }) {
  const [datos, setDatos] = useState(() => datosIniciales || { lotes: [], pruebas: [], cargando: !datosIniciales, error: null })
  const [filas, setFilas] = useState(filasIniciales)
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
    <div style={{ flex: 1, overflowY: 'auto', padding: 16, fontFamily: MONO, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>Builder</span>
        <span style={nota}>Crea una estrategia, pruébala contra el azar y conviértela en un plan.</span>
        <button style={{ ...enlace, marginLeft: 'auto', color: GRIS }} onClick={() => onEditorClasico?.()} title="La pantalla de siempre para crear una estrategia escribiendo su código">Editor clásico</button>
      </div>
      <BarraPasos actual={1}/>

      <div style={{ ...caja, borderColor: 'var(--accent)' }}>
        <div style={cabecera}>Siguiente paso</div>
        <div style={{ ...cuerpo, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ ...nota, color: 'var(--text)', flex: '1 1 300px' }}>Crea tu estrategia: empieza en blanco o desde una de las plantillas de abajo. Se abre el editor visual; cuando la guardes, aparecerá en «Mi trabajo».</span>
          <button style={botonPrincipal} onClick={() => onEmpezar?.({ id: null, name: '', definition: BLANCO(), params: {} })}>Empezar en blanco</button>
        </div>
      </div>

      <div style={caja}>
        <div style={cabecera}>Empieza desde una plantilla de estrategia</div>
        <div style={{ ...cuerpo, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
          {PLANTILLAS.map(p => (
            <div key={p.id} style={{ border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg)', display: 'flex', flexDirection: 'column', opacity: p.desactivada ? 0.75 : 1 }}>
              <div style={{ ...cabecera, color: p.desactivada ? GRIS : 'var(--accent)' }}>{p.titulo}</div>
              <div style={{ ...cuerpo, flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span style={{ ...nota, color: 'var(--text)' }}>{p.frase}</span>
                {p.nota && <span style={nota}>{p.nota}</span>}
                {p.desactivada && <span style={{ ...nota, color: AMBAR }}>No disponible todavía: {p.desactivada}</span>}
                {!p.desactivada && frases[p.id] && <span style={{ ...nota, fontSize: 11 }} title="La regla tal como la ejecuta el motor">{frases[p.id]}</span>}
                <button style={{ ...boton, marginTop: 'auto', opacity: p.desactivada ? 0.5 : 1, cursor: p.desactivada ? 'not-allowed' : 'pointer' }} disabled={!!p.desactivada}
                  onClick={() => !p.desactivada && onPlantilla?.({ id: null, name: p.definicion().nombre, definition: p.definicion(), params: { ...p.valores } })}>Usar esta plantilla</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={caja}>
        <div style={{ ...cabecera, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>Mi trabajo</span>
          <span style={{ fontWeight: 400, color: GRIS }}>{filas ? `${filas.length} elementos` : '…'}</span>
          {!datosIniciales && <button style={{ ...enlace, marginLeft: 'auto', fontWeight: 400 }} onClick={recarga}>Actualizar</button>}
        </div>
        <div style={cuerpo}>
          {datos.error && <div style={{ ...nota, color: AMBAR, marginBottom: 6 }}>{datos.error}</div>}
          <div style={nota}>Todas tus estrategias (del editor y de código) y tus lotes. Paso: 1 Crear, 2 Prueba, 3 Plan. Pulsa un nombre para abrirlo.</div>
          <div style={{ overflowX: 'auto', maxHeight: 520, overflowY: 'auto', marginTop: 8 }}>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead><tr>{['Nombre', 'Paso', 'Estado', 'Resultado', 'Qué toca ahora'].map(h => <th key={h} style={{ ...celda, textAlign: 'left', color: GRIS, fontWeight: 400, position: 'sticky', top: 0, background: 'var(--bg2)' }}>{h}</th>)}</tr></thead>
              <tbody>
                {(filas || []).map(f => (
                  <tr key={f.clave}>
                    <td style={celda}>
                      <button style={{ ...enlace, color: 'var(--text)', textDecoration: 'none' }} onClick={() => abreFila(f)} title={f.tipo === 'lote' ? 'Abrir el lote' : f.origen === 'editor' ? 'Abrir en el editor visual' : 'Abrir el código'}>{f.nombre}</button>
                      <div style={{ fontSize: 10, color: GRIS }}>{f.origen}{f.desactivada ? ' · desactivada' : ''}</div>
                    </td>
                    <td style={{ ...celda, whiteSpace: 'nowrap' }}>{f.paso} {f.paso === 1 ? 'Crear' : f.paso === 2 ? 'Prueba' : 'Plan'}</td>
                    <td style={{ ...celda, color: COLOR_ESTADO[f.estado] || 'var(--text)', whiteSpace: 'nowrap' }}>{f.estado}</td>
                    <td style={{ ...celda, color: GRIS, maxWidth: 360 }}>{f.resultado}</td>
                    <td style={celda}>{f.toca?.accion ? <button style={enlace} onClick={() => accion(f)}>{f.toca.texto}</button> : <span style={{ color: GRIS }}>{f.toca?.texto || '—'}</span>}</td>
                  </tr>
                ))}
                {filas && !filas.length && <tr><td colSpan={5} style={{ ...celda, color: GRIS }}>Todavía no hay nada. Empieza en blanco o desde una plantilla.</td></tr>}
              </tbody>
            </table>
          </div>
          <div style={{ ...nota, marginTop: 8, fontSize: 11 }}>«Calibrando…» no aparece aquí: la calibración corre en el navegador y solo se guarda al terminar (mientras corre, se ve en el modo Lotes del editor). Las estrategias de código se prueban contra el azar en Backtesting.</div>
        </div>
      </div>
    </div>
  )
}
