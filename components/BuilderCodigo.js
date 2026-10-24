// components/BuilderCodigo.js — el paso 1 del Builder con una ESTRATEGIA DE CÓDIGO (V9.1048; docs/builder.md, §14). El mismo
// encabezado que el editor por tarjetas (nombre, velas, versión y en qué pruebas está) y, en lugar de las tarjetas, el apartado
// «Código de la estrategia»: los parámetros en filas (los números simples se cambian; lo demás se ve tal cual), la descripción con
// el resumen hecho con la IA y el código plegado, solo para leer. A la derecha, la comprobación y «Guardar» (la regla de
// versiones de las tarjetas). El paso 2 no admite estrategias de código: el botón lo dice. La lógica, en lib/builder/codigo.js.
//   fila: la estrategia ({ id?, name, description, code_js, params, definition, …, copiaDe? }). Para las pruebas de montaje:
//   estadoInicial, enPruebaInicial y codigoAbierto.
import { useState } from 'react'
import { B, S } from '../lib/builder/estilo'
import { AVISO_CODIGO, AVISO_LEER, PASO2_CODIGO, leeParametros, estadoCodigo, erroresParametros, planGuardadoCodigo, paramsNuevos, mensajesResumen } from '../lib/builder/codigo'
import { partesNombre, avisoVersion } from '../lib/builder/versiones'
import { aTexto, deTexto } from '../lib/builder/tarjetas'
import { llamaGroq, textoErrorGroq } from '../lib/groq'
import Ayuda from './BuilderAyuda'

const ROJO = '#ff8b8b', AMARILLO = '#f2cc60'
const entrada = { fontFamily: B.letra, fontSize: B.base, background: B.fondo, color: B.texto, border: `1px solid ${B.borde}`, borderRadius: B.radioBoton, padding: '5px 8px', width: 'auto' }
const etiquetaCampo = { display: 'inline-flex', flexDirection: 'row', alignItems: 'center', fontFamily: B.letra, fontSize: B.base, fontWeight: 600, color: B.titulo }
const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`
const claveGroq = () => { try { return JSON.parse(localStorage.getItem('v50_settings') || '{}')?.integrations?.groqKey || '' } catch (_) { return '' } }

function Numero({ valor, onCambia, error, etiqueta }) {
  const [t, setT] = useState(aTexto(valor))
  return <input type="text" inputMode="decimal" value={deTexto(t) === valor ? t : aTexto(valor)} aria-label={etiqueta} aria-invalid={!!error} onChange={e => { setT(e.target.value); onCambia(deTexto(e.target.value)) }}
    style={{ ...entrada, padding: '3px 6px', width: `${Math.max(3, String(t).length) + 3}ch`, textAlign: 'right', ...(error ? { borderColor: ROJO } : {}) }}/>
}

function Tarjeta({ titulo, children, datos }) {
  return (
    <div {...datos} style={{ ...S.tarjeta, marginBottom: 14 }}>
      <div style={S.cabeceraTarjeta}>{titulo}</div>
      <div style={S.cuerpo}>{children}</div>
    </div>
  )
}

export default function BuilderCodigo({ fila, estrategias = [], apiFetch, onVolver, onGuardada, estadoInicial = null, enPruebaInicial = null, codigoAbierto = false }) {
  const [est, setEst] = useState(() => estadoInicial || estadoCodigo(fila))
  const [verCodigo, setVerCodigo] = useState(codigoAbierto)
  const [guardando, setGuardando] = useState(false)
  const [resumiendo, setResumiendo] = useState(false)
  const [msg, setMsg] = useState(null)
  // Las pruebas congeladas solo guardan estrategias de tarjetas: una de código no está en ninguna (salvo en las pruebas de montaje).
  const enPrueba = enPruebaInicial || []
  const lectura = leeParametros(fila)
  const errores = erroresParametros(lectura, est.valores)
  const errNombre = !String(est.nombre).trim() ? 'Ponle un nombre a la estrategia (por ejemplo, «V50 EMA10/11»).' : null
  const nErrores = Object.keys(errores).length + (errNombre ? 1 : 0)
  const plan = planGuardadoCodigo({ fila, est, enPrueba, estrategias })
  const version = partesNombre(fila?.name).version
  const estado = fila?.copiaDe ? `Copia de «${fila.copiaDe}». La original no cambia.`
    : `Versión ${version} · ${enPrueba.length ? `probada en ${enPrueba.length > 1 ? 'las pruebas' : 'la prueba'} ${enPrueba.map(x => `«${x}»`).join(', ')}` : 'no está en ninguna prueba'}`
  const pon = (k, v) => setEst(e => ({ ...e, valores: { ...e.valores, [k]: v } }))

  const guarda = async () => {
    if (nErrores || guardando) return
    setMsg(null)
    if (plan.metodo === 'ninguno') { onVolver?.(); return }
    setGuardando(true)
    try {
      const res = await apiFetch('/api/strategies', { method: plan.metodo, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(plan.cuerpo) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.errores ? j.errores.join(' ') : (j.error || `HTTP ${res.status}`))
      onGuardada?.({ ...fila, ...plan.cuerpo, ...j, id: j?.id || plan.cuerpo.id || fila.id }, { version: plan.version })
    } catch (e) { setMsg(`No se pudo guardar: ${e.message}`) }
    setGuardando(false)
  }
  const resume = async () => {
    const key = claveGroq()
    if (!key) { setMsg('Para el resumen hecho con la IA hace falta la clave de Groq: Ajustes → Integraciones.'); return }
    setResumiendo(true); setMsg(null)
    try {
      const r = await llamaGroq(key, { messages: mensajesResumen(fila.code_js || '', paramsNuevos(fila, est).texto), max_tokens: 600, temperature: 0.2 })
      if (!r.ok) setMsg(`La IA no ha podido hacer el resumen: ${textoErrorGroq(r.error)}`)
      else if (r.texto.trim()) setEst(e => ({ ...e, descripcion: r.texto.trim() }))
      else setMsg('La IA no ha devuelto ningún resumen.')
    } finally { setResumiendo(false) }
  }

  return (
    <div style={S.pagina}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <button style={{ ...S.enlace, color: B.secundario }} onClick={() => onVolver?.()}>← Builder · Mi trabajo</button>
        <span style={{ fontSize: 22, fontWeight: 700, color: B.titulo }}>Paso 1 · La estrategia</span>
        <span style={S.secundario}>de código</span>
      </div>
      <div style={{ ...S.tarjeta, marginBottom: 16 }} data-tarjeta="nombre">
        <div style={{ ...S.cuerpo, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <label style={etiquetaCampo} htmlFor="nombre-estrategia-codigo">Nombre de la estrategia</label>
          <input id="nombre-estrategia-codigo" value={est.nombre} onChange={e => setEst(x => ({ ...x, nombre: e.target.value }))} style={{ ...entrada, flex: '1 1 240px', maxWidth: 420, ...(errNombre ? { borderColor: ROJO } : {}) }}/>
          <label style={{ ...etiquetaCampo, gap: 6 }}>
            <span>Velas:</span>
            <select style={entrada} aria-label="Velas" value={est.intervalo} disabled={!lectura.ok} onChange={e => setEst(x => ({ ...x, intervalo: e.target.value }))}>
              <option value="diario">Diarias (1 vela = 1 día de mercado)</option><option value="semanal">Semanales (1 vela = 1 semana)</option>
            </select>
          </label>
          <div style={{ flexBasis: '100%' }}><span data-estado style={S.secundario}>{estado}</span></div>
          {errNombre && <div style={{ color: ROJO, fontSize: 13, flexBasis: '100%' }}>{errNombre}</div>}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div data-columna="codigo" style={{ flex: '3 1 480px', minWidth: 0 }}>
          <Tarjeta titulo="Código de la estrategia" datos={{ 'data-tarjeta': 'codigo' }}>
            <div data-aviso="codigo" style={{ border: `1px solid ${B.siguienteBorde}`, background: B.siguienteFondo, borderRadius: B.radioBoton, padding: '10px 12px', color: B.texto }}>{AVISO_CODIGO}</div>

            <div style={{ fontWeight: 700, color: B.titulo, margin: '16px 0 4px' }}>Parámetros</div>
            {!lectura.ok && <div style={{ color: AMARILLO }}>Los parámetros guardados no son un JSON que se pueda leer: se ven tal cual y no se pueden cambiar aquí.<pre style={{ whiteSpace: 'pre-wrap', color: B.texto }}>{lectura.texto}</pre></div>}
            {lectura.ok && !lectura.editables.length && !lectura.otros.length && <div style={S.apagado}>Esta estrategia no tiene parámetros guardados: usa los valores que lleva su código.</div>}
            {lectura.editables.map(p => (
              <div key={p.nombre} data-parametro={p.nombre} data-error={errores[p.nombre] ? 'si' : undefined} style={{ border: `1px solid ${errores[p.nombre] ? ROJO : B.borde}`, borderRadius: B.radioBoton, padding: '6px 10px', marginTop: 8, background: B.fondo }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 600, color: B.titulo, minWidth: 120 }}>{p.nombre}</span>
                  <Numero valor={est.valores[p.nombre]} error={errores[p.nombre]} etiqueta={p.nombre} onCambia={v => pon(p.nombre, v)}/>
                  {p.decl?.descripcion && <span style={{ color: B.secundario }}>{p.decl.descripcion}</span>}
                  {p.decl && (p.decl.min != null || p.decl.max != null) && <span style={{ ...S.apagado, marginLeft: 'auto' }}>de {aTexto(p.decl.min ?? '…')} a {aTexto(p.decl.max ?? '…')}{p.decl.tipo === 'entero' ? ', entero' : ''}</span>}
                </div>
                {errores[p.nombre] && <div data-error-parametro style={{ color: ROJO, fontSize: 13, marginTop: 4 }}>{errores[p.nombre]}</div>}
              </div>
            ))}
            {lectura.otros.map(p => (
              <div key={p.nombre} data-parametro-fijo={p.nombre} style={{ border: `1px solid ${B.borde}`, borderRadius: B.radioBoton, padding: '6px 10px', marginTop: 8 }}>
                <span style={{ fontWeight: 600, color: B.titulo, marginRight: 10 }}>{p.nombre}</span>
                <code style={{ fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 13, color: B.texto, wordBreak: 'break-all' }}>{p.texto}</code>
                <span style={{ ...S.apagado, marginLeft: 10 }}>(solo para leer: no es un número)</span>
              </div>
            ))}

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '18px 0 4px', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 700, color: B.titulo }}>Descripción</span>
              <button style={{ ...S.boton, padding: '4px 10px', fontSize: 13 }} disabled={resumiendo || !fila?.code_js} onClick={resume}>{resumiendo ? 'Haciendo el resumen…' : 'Hacer el resumen con la IA'}</button>
              <Ayuda texto="La IA (Groq) lee el código y los parámetros y escribe un resumen en la descripción. Revísalo antes de guardar: la IA puede equivocarse." etiqueta="Resumen con la IA"/>
            </div>
            <textarea aria-label="Descripción" value={est.descripcion} onChange={e => setEst(x => ({ ...x, descripcion: e.target.value }))} rows={6}
              style={{ ...entrada, width: '100%', boxSizing: 'border-box', resize: 'vertical', lineHeight: 1.45 }} placeholder="Qué hace la estrategia, en palabras."/>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '18px 0 4px', flexWrap: 'wrap' }}>
              <button style={{ ...S.enlace, fontWeight: 700, color: B.titulo }} aria-expanded={verCodigo} onClick={() => setVerCodigo(v => !v)}>{verCodigo ? '▾' : '▸'} Código JS</button>
              <span style={S.apagado}>{AVISO_LEER}</span>
            </div>
            {verCodigo && <pre data-codigo style={{ margin: 0, maxHeight: 460, overflow: 'auto', background: B.fondo, border: `1px solid ${B.borde}`, borderRadius: B.radioBoton, padding: 12,
              fontFamily: 'ui-monospace, Consolas, "Courier New", monospace', fontSize: 12.5, lineHeight: 1.5, color: B.texto, whiteSpace: 'pre' }}>{fila?.code_js || '(sin código)'}</pre>}
          </Tarjeta>
        </div>

        <div data-columna="regla" style={{ flex: '1 1 260px', maxWidth: 380, minWidth: 0 }}>
          <Tarjeta titulo="Comprobación" datos={{ 'data-tarjeta': 'comprobacion' }}>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <li style={{ color: B.texto }}>✓ Tiene código (se ejecuta tal cual)</li>
              <li data-comprueba="parametros" style={{ color: nErrores ? ROJO : B.texto }}>{nErrores ? `✕ ${plural(nErrores, 'error', 'errores')}: corrige lo que está en rojo` : '✓ Los parámetros son válidos'}</li>
              <li data-comprueba="paso2" style={{ color: AMARILLO }}>✕ {PASO2_CODIGO}</li>
            </ul>
          </Tarjeta>
          {plan.version && <div data-aviso="version" style={{ background: '#3a3220', border: `1px solid ${AMARILLO}`, borderRadius: B.radioBoton, padding: 12, marginBottom: 12, color: B.texto }}>{avisoVersion(plan.version)}</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button style={nErrores || guardando ? S.botonDesactivado : S.botonVerde} disabled={!!nErrores || guardando} onClick={guarda}>{guardando ? 'Guardando…' : plan.metodo === 'ninguno' ? 'Guardar (no hay cambios)' : 'Guardar'}</button>
            <button data-boton="paso2" style={S.botonDesactivado} disabled title={PASO2_CODIGO}>Pasar al paso 2</button>
            <div data-aviso="paso2" style={{ ...S.secundario, fontSize: 13 }}>{PASO2_CODIGO}</div>
          </div>
          {msg && <div style={{ color: ROJO, marginTop: 8 }}>{msg}</div>}
        </div>
      </div>
    </div>
  )
}
