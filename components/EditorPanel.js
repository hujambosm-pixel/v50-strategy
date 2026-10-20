// components/EditorPanel.js — la pestaña «Editor»: estrategias de un activo sin escribir código (docs/editor-visual.md, E6).
//
// Formularios sobre la DEFINICIÓN (lib/editor/definicion.js): parámetros, entrada (señal, orden, cancelación), filtro de
// mercado, stops y salidas, con cada condición como un árbol Y / O / NO / cruza / histéresis cuyas hojas son del catálogo
// (lib/condiciones/catalogo.js) y se pintan con sus parámetros declarados. Al lado, en vivo: la regla en castellano, los
// errores de la validación, la huella y cómo leer lo que sale. Guardar manda la definición a /api/strategies (que la valida
// otra vez y guarda code_js a null); «Probar en backtest» guarda y la abre en Estrategias, con el gráfico de siempre.
// El diagrama (E7) y el dibujo con el ratón (E8) vendrán después: esto es solo la pantalla, el cálculo es el del motor.
import { useState, useEffect, useMemo } from 'react'
import { MONO } from '../lib/utils'
import { CONDICIONES_EDITOR, FORMATO, MOTOR, validaDefinicion, valoresDe, fraseDefinicion, fraseCond, huellaDefinicion, esquemaDe } from '../lib/editor/definicion'
import { DEF_V50, DEF_23 } from '../lib/editor/ejemplos'
import { esDefinicionEditor } from '../lib/editor/fuente'

const GRIS = 'var(--text-legible)'
const TAM = 12
const ROJO = '#ff4d6d', VERDE = '#00e5a0', AMBAR = '#ffb020', LILA = '#a78bfa'
const caja = { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 6, padding: '10px 12px', marginBottom: 10 }
const etiqueta = { fontFamily: MONO, fontSize: TAM, color: GRIS, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }
const entrada = { background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontFamily: MONO, fontSize: TAM, padding: '3px 6px' }
const boton = { fontFamily: MONO, fontSize: TAM, padding: '3px 9px', borderRadius: 4, cursor: 'pointer', border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text)' }
const botonPrincipal = { ...boton, border: '1px solid var(--accent)', background: 'rgba(0,212,255,0.12)', color: 'var(--accent)', fontWeight: 700 }
const botonMini = { ...boton, padding: '0 6px', fontSize: 11 }
const nota = { fontFamily: MONO, fontSize: 11, color: GRIS, lineHeight: 1.5 }
const fila = { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 }

const copia = (x) => JSON.parse(JSON.stringify(x))
const aTexto = (v) => typeof v === 'number' ? String(v).replace('.', ',') : (v ?? '')
const deTexto = (s) => { const t = String(s).trim().replace(',', '.'); return t !== '' && Number.isFinite(Number(t)) ? Number(t) : s }

// Plantillas: las dos de la prueba de aceptación (sus operaciones son byte a byte las de su code_js) y una en blanco.
const NUEVA = () => ({
  tipo: 'editor', formato: FORMATO, motor: MOTOR, nombre: '',
  parametros: { version: 1, lista: [{ nombre: 'ema', tipo: 'entero', defecto: 20, min: 2, max: 400, paso: 1, ventana: true, descripcion: 'Periodo de la EMA' }], restricciones: [] },
  entrada: { senal: { c: 'cruza', de: { c: 'precioVsMedia', p: { tipo: 'EMA', periodo: '$ema', lado: 'encima' } } }, orden: { tipo: 'apertura' } },
  stops: [{ id: 'inicial', tipo: 'porcentaje', pct: 8, motivo: 'stop' }],
  salidas: [{ tipo: 'condicion', si: { c: 'cruza', de: { c: 'precioVsMedia', p: { tipo: 'EMA', periodo: '$ema', lado: 'debajo' } } }, precio: 'apertura', motivo: 'cruce_bajista' }],
})
const PLANTILLAS = { nueva: { nombre: 'En blanco (cruce de una EMA)', def: NUEVA }, v50: { nombre: '1 V50 EMA10/11', def: () => copia(DEF_V50) }, e23: { nombre: '23 EMA20 breakouts', def: () => copia(DEF_23) } }

const COMBINADORES = { Y: 'Y (todas)', O: 'O (alguna)', NO: 'NO (no se cumple)', cruza: 'Cruza (pasa a cumplirse)', histeresis: 'Histéresis (entra / sale)' }
const condPorDefecto = (id) => {
  if (id === 'Y' || id === 'O') return { c: id, de: [condPorDefecto('precioVsMedia'), condPorDefecto('rsiNivel')] }
  if (id === 'NO' || id === 'cruza') return { c: id, de: condPorDefecto('precioVsMedia') }
  if (id === 'histeresis') return { c: id, entra: condPorDefecto('precioVsMedia'), sale: { c: 'precioVsMedia', p: { tipo: 'SMA', periodo: 200, lado: 'debajo' } } }
  const d = CONDICIONES_EDITOR[id]
  return { c: id, p: Object.fromEntries(d.parametros.filter(p => !p.opcional).map(p => [p.clave, p.defecto])) }
}
const TIPOS_ORDEN = { apertura: 'A la apertura siguiente', cierre: 'Al cierre de la vela de la señal', stop: 'Orden stop (compra si sube hasta un nivel)', limite: 'Orden límite (compra si baja hasta un nivel)' }
const CAMPOS = { high: 'máximo', low: 'mínimo', close: 'cierre' }
const TIPOS_STOP = { nivel: 'Nivel de la vela (mínimo, media…)', minimoVelas: 'Mínimo de N velas', porcentaje: '% fijo bajo la entrada', atr: 'k × ATR bajo la entrada', trailing: 'Trailing (sube, nunca baja)' }
const CAMPOS_STOP = {
  nivel: { de: [{ campo: 'low' }] }, minimoVelas: { n: 3 }, porcentaje: { pct: 8 }, atr: { k: 2, periodo: 14 },
  trailing: { si: { c: 'precioVsMedia', p: { tipo: 'EMA', periodo: 10, lado: 'debajo' } }, nivel: { campo: 'low', velas: 1 }, historial: 'siSube', fechaHistorial: 'vela' },
}
const stopPorDefecto = (tipo, n) => ({ id: `${tipo}${n}`, tipo, motivo: tipo === 'trailing' ? 'trailing_exit' : 'stop', ...copia(CAMPOS_STOP[tipo]) })
const TIPOS_SALIDA = { condicion: 'Por condición (a la apertura siguiente)', objetivo: 'Objetivo en múltiplos del riesgo inicial', tope: 'Tope de velas' }
const salidaPorDefecto = (tipo) => ({
  condicion: { tipo, si: condPorDefecto('precioVsMedia'), precio: 'apertura', motivo: 'salida' },
  objetivo: { tipo, multiploR: 2, motivo: 'objetivo' },
  tope: { tipo, velas: 20, motivo: 'tope' },
})[tipo]

// ── Un valor: fijo o enlazado a un parámetro de la estrategia ('$nombre') ──
function Valor({ valor, onChange, params, tipo = 'numero', opciones = null, ancho = 64, titulo }) {
  const enlazado = typeof valor === 'string' && valor.startsWith('$')
  const candidatos = params.filter(p => tipo === 'opcion' ? p.tipo === 'opcion' : tipo === 'sino' ? p.tipo === 'sino' : p.tipo === 'entero' || p.tipo === 'decimal')
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }} title={titulo}>
      {enlazado
        ? <select style={{ ...entrada, color: LILA }} value={valor} onChange={e => onChange(e.target.value)}>
            {!candidatos.some(p => '$' + p.nombre === valor) && <option value={valor}>{valor} (no declarado)</option>}
            {candidatos.map(p => <option key={p.nombre} value={'$' + p.nombre}>${p.nombre}</option>)}
          </select>
        : tipo === 'opcion'
          ? <select style={entrada} value={valor ?? ''} onChange={e => onChange(e.target.value)}>{(opciones || []).map(o => <option key={o} value={o}>{o}</option>)}</select>
          : tipo === 'sino'
            ? <input type="checkbox" checked={valor === true} onChange={e => onChange(e.target.checked)}/>
            : <input style={{ ...entrada, width: ancho }} value={aTexto(valor)} onChange={e => onChange(deTexto(e.target.value))}/>}
      {candidatos.length > 0 && (
        <button style={{ ...botonMini, color: enlazado ? LILA : GRIS }} title={enlazado ? 'Usar un valor fijo' : 'Enlazar a un parámetro de la estrategia (el optimizador podrá variarlo)'}
          onClick={() => onChange(enlazado ? (tipo === 'sino' ? true : tipo === 'opcion' ? (opciones || [])[0] : 1) : '$' + candidatos[0].nombre)}>{enlazado ? '×' : '$'}</button>
      )}
    </span>
  )
}

// ── Una condición (árbol) ──
function Condicion({ cond, onChange, params, nivel = 0, onQuitar }) {
  const c = cond || condPorDefecto('precioVsMedia')
  const esComb = !!COMBINADORES[c.c]
  const def = CONDICIONES_EDITOR[c.c]
  const cambiaTipo = (id) => onChange(id === c.c ? c : (COMBINADORES[id] && (c.p || c.de) && (id === 'NO' || id === 'cruza') ? { c: id, de: c } : condPorDefecto(id)))
  return (
    <div style={{ borderLeft: nivel ? `2px solid ${esComb ? LILA : 'var(--border)'}` : 'none', paddingLeft: nivel ? 8 : 0, marginTop: 4 }}>
      <div style={fila}>
        <select style={{ ...entrada, color: esComb ? LILA : 'var(--text)' }} value={c.c} onChange={e => cambiaTipo(e.target.value)}>
          <optgroup label="Combinar">{Object.entries(COMBINADORES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</optgroup>
          <optgroup label="Condiciones del catálogo">{Object.values(CONDICIONES_EDITOR).map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}</optgroup>
        </select>
        {!esComb && def && def.parametros.map(p => (
          <span key={p.clave} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontFamily: MONO, fontSize: 11, color: GRIS }} title={p.ayuda || undefined}>
            {p.etiqueta}{p.unidad ? ` (${p.unidad})` : ''}:
            <Valor valor={c.p?.[p.clave] ?? (p.opcional ? p.defecto : undefined)} params={params} tipo={p.tipo === 'opcion' ? 'opcion' : p.tipo === 'ticker' ? 'texto' : 'numero'} opciones={p.opciones}
              ancho={p.tipo === 'ticker' ? 70 : 56} onChange={v => onChange({ ...c, p: { ...(c.p || {}), [p.clave]: v } })}/>
          </span>
        ))}
        {onQuitar && <button style={{ ...botonMini, color: ROJO }} title="Quitar esta condición" onClick={onQuitar}>quitar</button>}
      </div>
      {!esComb && def?.aviso && <div style={{ ...nota, color: AMBAR }}>⚠ {def.aviso}</div>}
      {(c.c === 'Y' || c.c === 'O') && <>
        {(c.de || []).map((x, k) => <Condicion key={k} cond={x} params={params} nivel={nivel + 1}
          onChange={v => onChange({ ...c, de: c.de.map((y, j) => j === k ? v : y) })}
          onQuitar={c.de.length > 2 ? () => onChange({ ...c, de: c.de.filter((_, j) => j !== k) }) : null}/>)}
        <button style={{ ...botonMini, marginTop: 4, marginLeft: 10 }} onClick={() => onChange({ ...c, de: [...(c.de || []), condPorDefecto('precioVsMedia')] })}>+ condición</button>
      </>}
      {(c.c === 'NO' || c.c === 'cruza') && <Condicion cond={c.de} params={params} nivel={nivel + 1} onChange={v => onChange({ ...c, de: v })}/>}
      {c.c === 'histeresis' && <>
        <div style={{ ...nota, marginLeft: 10, marginTop: 4 }}>Entra cuando:</div>
        <Condicion cond={c.entra} params={params} nivel={nivel + 1} onChange={v => onChange({ ...c, entra: v })}/>
        <div style={{ ...nota, marginLeft: 10, marginTop: 4 }}>Sale cuando:</div>
        <Condicion cond={c.sale} params={params} nivel={nivel + 1} onChange={v => onChange({ ...c, sale: v })}/>
      </>}
    </div>
  )
}

// ── Cuándo está activa una pieza (siempre / según un parámetro) ──
function Activa({ valor, onChange, params }) {
  const sino = params.filter(p => p.tipo === 'sino'), opc = params.filter(p => p.tipo === 'opcion')
  const modo = valor === undefined || valor === true ? 'siempre' : typeof valor === 'string' ? 'sino' : valor?.param ? 'opcion' : 'siempre'
  return (
    <span style={{ ...nota, display: 'inline-flex', gap: 4, alignItems: 'center' }} title="Una pieza puede depender de un parámetro sí/no u opción: así el optimizador la enciende y la apaga">
      activa:
      <select style={entrada} value={modo} onChange={e => onChange(e.target.value === 'siempre' ? undefined : e.target.value === 'sino' ? '$' + sino[0].nombre : { param: opc[0].nombre, igual: opc[0].opciones?.[0] })}>
        <option value="siempre">siempre</option>
        {sino.length > 0 && <option value="sino">si un parámetro sí/no</option>}
        {opc.length > 0 && <option value="opcion">si una opción vale…</option>}
      </select>
      {modo === 'sino' && <select style={entrada} value={valor} onChange={e => onChange(e.target.value)}>{sino.map(p => <option key={p.nombre} value={'$' + p.nombre}>${p.nombre}</option>)}</select>}
      {modo === 'opcion' && <>
        <select style={entrada} value={valor.param} onChange={e => { const p = opc.find(x => x.nombre === e.target.value); onChange({ param: p.nombre, igual: p.opciones?.[0] }) }}>{opc.map(p => <option key={p.nombre} value={p.nombre}>${p.nombre}</option>)}</select>
        =<select style={entrada} value={valor.igual} onChange={e => onChange({ ...valor, igual: e.target.value })}>{(opc.find(p => p.nombre === valor.param)?.opciones || []).map(o => <option key={o} value={o}>{o}</option>)}</select>
      </>}
    </span>
  )
}

// ── Parámetros de la estrategia (la declaración de run.parametros) y sus valores ──
function Parametros({ decl, onDecl, valores, onValores }) {
  const lista = decl?.lista || []
  const cambia = (k, cambio) => onDecl({ ...decl, lista: lista.map((p, j) => j === k ? { ...p, ...cambio } : p) })
  const restricciones = decl?.restricciones || []
  return (
    <div style={caja}>
      <div style={etiqueta}>Parámetros</div>
      <div style={nota}>Lo que el optimizador puede variar. Una condición o un stop los usa con el botón «$». El valor es el que se prueba y se guarda; el defecto, el de una estrategia nueva.</div>
      {lista.map((p, k) => (
        <div key={k} style={{ ...fila, marginTop: 6 }}>
          <input style={{ ...entrada, width: 90, color: LILA }} value={p.nombre} title="Nombre (letras, números y _)" onChange={e => cambia(k, { nombre: e.target.value.trim() })}/>
          <select style={entrada} value={p.tipo} onChange={e => { const t = e.target.value; cambia(k, t === 'sino' ? { tipo: t, defecto: true, min: undefined, max: undefined, opciones: undefined } : t === 'opcion' ? { tipo: t, defecto: 'a', opciones: ['a', 'b'], min: undefined, max: undefined } : { tipo: t, defecto: 1, min: 1, max: 100, opciones: undefined }) }}>
            <option value="entero">entero</option><option value="decimal">decimal</option><option value="opcion">opción</option><option value="sino">sí / no</option>
          </select>
          {(p.tipo === 'entero' || p.tipo === 'decimal') && <>
            <span style={nota}>de</span><input style={{ ...entrada, width: 48 }} value={aTexto(p.min)} onChange={e => cambia(k, { min: deTexto(e.target.value) })}/>
            <span style={nota}>a</span><input style={{ ...entrada, width: 48 }} value={aTexto(p.max)} onChange={e => cambia(k, { max: deTexto(e.target.value) })}/>
            <label style={nota} title="Es el PERIODO de un indicador: cuenta para el calentamiento"><input type="checkbox" checked={!!p.ventana} onChange={e => cambia(k, { ventana: e.target.checked || undefined })}/> periodo</label>
          </>}
          {p.tipo === 'opcion' && <input style={{ ...entrada, width: 150 }} value={(p.opciones || []).join(', ')} title="Opciones, separadas por comas" onChange={e => cambia(k, { opciones: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}/>}
          <span style={nota}>defecto</span>
          <Valor valor={p.defecto} params={[]} tipo={p.tipo === 'opcion' ? 'opcion' : p.tipo === 'sino' ? 'sino' : 'numero'} opciones={p.opciones} ancho={48} onChange={v => cambia(k, { defecto: v })}/>
          <span style={{ ...nota, color: 'var(--accent)' }}>valor</span>
          <Valor valor={valores[p.nombre] ?? p.defecto} params={[]} tipo={p.tipo === 'opcion' ? 'opcion' : p.tipo === 'sino' ? 'sino' : 'numero'} opciones={p.opciones} ancho={48} onChange={v => onValores({ ...valores, [p.nombre]: v })}/>
          <input style={{ ...entrada, flex: 1, minWidth: 120 }} value={p.descripcion || ''} placeholder="descripción" onChange={e => cambia(k, { descripcion: e.target.value || undefined })}/>
          <button style={{ ...botonMini, color: ROJO }} onClick={() => onDecl({ ...decl, lista: lista.filter((_, j) => j !== k) })}>quitar</button>
        </div>
      ))}
      <button style={{ ...botonMini, marginTop: 4 }} onClick={() => { let n = 1; while (lista.some(p => p.nombre === `p${n}`)) n++; onDecl({ ...decl, version: 1, lista: [...lista, { nombre: `p${n}`, tipo: 'entero', defecto: 10, min: 1, max: 200, paso: 1 }] }) }}>+ parámetro</button>
      {(restricciones.length > 0 || lista.length > 1) && (
        <div style={{ marginTop: 8 }}>
          <div style={nota}>Restricciones (combinaciones que no se prueban):</div>
          {restricciones.map((r, k) => (
            <div key={k} style={fila}>
              <select style={entrada} value={r.a} onChange={e => onDecl({ ...decl, restricciones: restricciones.map((x, j) => j === k ? { ...x, a: e.target.value } : x) })}>{lista.map(p => <option key={p.nombre} value={p.nombre}>{p.nombre}</option>)}</select>
              <select style={entrada} value={r.tipo} onChange={e => onDecl({ ...decl, restricciones: restricciones.map((x, j) => j === k ? { ...x, tipo: e.target.value } : x) })}><option value="menor">&lt;</option><option value="menorIgual">≤</option><option value="distinto">≠</option></select>
              <select style={entrada} value={r.b} onChange={e => onDecl({ ...decl, restricciones: restricciones.map((x, j) => j === k ? { ...x, b: e.target.value } : x) })}>{lista.map(p => <option key={p.nombre} value={p.nombre}>{p.nombre}</option>)}</select>
              <button style={{ ...botonMini, color: ROJO }} onClick={() => onDecl({ ...decl, restricciones: restricciones.filter((_, j) => j !== k) })}>quitar</button>
            </div>
          ))}
          {lista.length > 1 && <button style={botonMini} onClick={() => onDecl({ ...decl, restricciones: [...restricciones, { tipo: 'menor', a: lista[0].nombre, b: lista[1].nombre }] })}>+ restricción</button>}
        </div>
      )}
    </div>
  )
}

function Stop({ s, k, n, onChange, onQuitar, onMueve, params, ids }) {
  const set = (cambio) => onChange({ ...s, ...cambio })
  return (
    <div style={{ borderTop: k ? '1px solid var(--border)' : 'none', paddingTop: k ? 8 : 0, marginTop: k ? 8 : 0 }}>
      <div style={fila}>
        <span style={{ ...nota, color: 'var(--text)' }}>{k + 1}.</span>
        <select style={entrada} value={s.tipo} onChange={e => onChange({ ...stopPorDefecto(e.target.value, k + 1), id: s.id, motivo: s.motivo, activa: s.activa })}>{Object.entries(TIPOS_STOP).map(([t, v]) => <option key={t} value={t}>{v}</option>)}</select>
        <span style={nota}>id</span><input style={{ ...entrada, width: 80 }} value={s.id || ''} onChange={e => set({ id: e.target.value.trim() })}/>
        <span style={nota} title="El nombre de la salida en las operaciones (exitReason)">motivo</span><input style={{ ...entrada, width: 100 }} value={s.motivo || ''} onChange={e => set({ motivo: e.target.value.trim() })}/>
        <Activa valor={s.activa} params={params} onChange={v => { const x = { ...s }; if (v === undefined) delete x.activa; else x.activa = v; onChange(x) }}/>
        {k > 0 && <button style={botonMini} title="Comprobar antes" onClick={() => onMueve(-1)}>↑</button>}
        {k < n - 1 && <button style={botonMini} title="Comprobar después" onClick={() => onMueve(1)}>↓</button>}
        <button style={{ ...botonMini, color: ROJO }} onClick={onQuitar}>quitar</button>
      </div>
      {s.tipo === 'nivel' && (
        <div style={fila}>
          <span style={nota}>el menor entre</span>
          {(s.de || []).map((x, j) => (
            <span key={j} style={{ display: 'inline-flex', gap: 3, alignItems: 'center' }}>
              <select style={entrada} value={x.campo || x.media?.tipo} onChange={e => { const v = e.target.value; set({ de: s.de.map((y, i) => i === j ? (CAMPOS[v] ? { campo: v } : { media: { tipo: v, periodo: y.media?.periodo ?? 10 } }) : y) }) }}>
                {Object.entries(CAMPOS).map(([c, v]) => <option key={c} value={c}>{v} de la vela</option>)}<option value="EMA">EMA</option><option value="SMA">SMA</option>
              </select>
              {x.media && <Valor valor={x.media.periodo} params={params} ancho={44} onChange={v => set({ de: s.de.map((y, i) => i === j ? { media: { ...y.media, periodo: v } } : y) })}/>}
              {s.de.length > 1 && <button style={{ ...botonMini, color: ROJO }} onClick={() => set({ de: s.de.filter((_, i) => i !== j) })}>×</button>}
            </span>
          ))}
          <button style={botonMini} onClick={() => set({ de: [...(s.de || []), { campo: 'low' }] })}>+</button>
          <span style={nota}>de la vela que fija la orden</span>
          <label style={nota} title="Si el nivel de la orden cambia antes de entrar, el stop se recalcula con cada vela que la mueve"><input type="checkbox" checked={!!s.historialAlEntrar} onChange={e => set({ historialAlEntrar: e.target.checked || undefined })}/> anotar en el historial al entrar</label>
        </div>
      )}
      {s.tipo === 'minimoVelas' && <div style={fila}><span style={nota}>el mínimo de las</span><Valor valor={s.n} params={params} ancho={44} onChange={v => set({ n: v })}/><span style={nota}>velas hasta la de la señal</span></div>}
      {s.tipo === 'porcentaje' && <div style={fila}><Valor valor={s.pct} params={params} ancho={44} onChange={v => set({ pct: v })}/><span style={nota}>% por debajo del precio de entrada</span></div>}
      {s.tipo === 'atr' && <div style={fila}><Valor valor={s.k} params={params} ancho={44} onChange={v => set({ k: v })}/><span style={nota}>× ATR de</span><Valor valor={s.periodo} params={params} ancho={44} onChange={v => set({ periodo: v })}/><span style={nota}>velas por debajo de la entrada</span></div>}
      {s.tipo === 'trailing' && <>
        <div style={nota}>Sube cuando, al cierre de la vela anterior:</div>
        <Condicion cond={s.si} params={params} nivel={1} onChange={v => set({ si: v })}/>
        <div style={fila}>
          <span style={nota}>hasta</span>
          <select style={entrada} value={s.nivel?.atr ? 'atr' : 'low'} onChange={e => set({ nivel: e.target.value === 'atr' ? { atr: { k: 2, periodo: 14 } } : { campo: 'low', velas: 1 } })}><option value="low">el mínimo de N velas</option><option value="atr">el cierre − k × ATR</option></select>
          {s.nivel?.atr
            ? <><span style={nota}>k</span><Valor valor={s.nivel.atr.k} params={params} ancho={40} onChange={v => set({ nivel: { atr: { ...s.nivel.atr, k: v } } })}/><span style={nota}>periodo</span><Valor valor={s.nivel.atr.periodo} params={params} ancho={40} onChange={v => set({ nivel: { atr: { ...s.nivel.atr, periodo: v } } })}/></>
            : <><span style={nota}>N</span><Valor valor={s.nivel?.velas} params={params} ancho={40} onChange={v => set({ nivel: { campo: 'low', velas: v } })}/></>}
          <span style={nota} title="Solo si el nuevo nivel queda por encima del precio de entrada">solo sobre la entrada</span>
          <Valor valor={s.soloSobreEntrada ?? false} params={params} tipo="sino" onChange={v => set({ soloSobreEntrada: v === false ? undefined : v })}/>
        </div>
        <div style={fila}>
          <span style={nota} title="cadaVez: anota el nivel cada vez que se cumple la condición; siSube: solo cuando el stop sube (como la 23)">historial</span>
          <select style={entrada} value={s.historial || 'siSube'} onChange={e => set({ historial: e.target.value })}><option value="siSube">solo si sube</option><option value="cadaVez">cada vez</option></select>
          <span style={nota}>fecha</span>
          <select style={entrada} value={s.fechaHistorial || 'vela'} onChange={e => set({ fechaHistorial: e.target.value })}><option value="vela">la de la vela</option><option value="anterior">la de la vela anterior</option></select>
        </div>
      </>}
      {s.tipo !== 'trailing' && ids.filter(i => i !== s.id).length > 0 && (
        <div style={fila}>
          <span style={nota} title="Un stop fijo deja de contar cuando otro (un trailing) queda por encima">se retira cuando lo supera</span>
          <select style={entrada} value={s.retiraSiSupera || ''} onChange={e => set({ retiraSiSupera: e.target.value || undefined })}><option value="">(nunca)</option>{ids.filter(i => i !== s.id).map(i => <option key={i} value={i}>{i}</option>)}</select>
        </div>
      )}
    </div>
  )
}

function Salida({ s, k, onChange, onQuitar, params }) {
  const set = (cambio) => onChange({ ...s, ...cambio })
  return (
    <div style={{ borderTop: k ? '1px solid var(--border)' : 'none', paddingTop: k ? 8 : 0, marginTop: k ? 8 : 0 }}>
      <div style={fila}>
        <span style={{ ...nota, color: 'var(--text)' }}>{k + 1}.</span>
        <select style={entrada} value={s.tipo} onChange={e => onChange({ ...salidaPorDefecto(e.target.value), motivo: s.motivo, ...(s.activa !== undefined ? { activa: s.activa } : {}) })}>{Object.entries(TIPOS_SALIDA).map(([t, v]) => <option key={t} value={t}>{v}</option>)}</select>
        <span style={nota}>motivo</span><input style={{ ...entrada, width: 110 }} value={s.motivo || ''} onChange={e => set({ motivo: e.target.value.trim() })}/>
        <Activa valor={s.activa} params={params} onChange={v => { const x = { ...s }; if (v === undefined) delete x.activa; else x.activa = v; onChange(x) }}/>
        <button style={{ ...botonMini, color: ROJO }} onClick={onQuitar}>quitar</button>
      </div>
      {s.tipo === 'condicion' && <Condicion cond={s.si} params={params} nivel={1} onChange={v => set({ si: v })}/>}
      {s.tipo === 'objetivo' && <div style={fila}><span style={nota}>vende a la entrada +</span><Valor valor={s.multiploR} params={params} ancho={44} onChange={v => set({ multiploR: v })}/><span style={nota}>× el riesgo inicial (entrada − el primer stop)</span></div>}
      {s.tipo === 'tope' && <div style={fila}><span style={nota}>como mucho</span><Valor valor={s.velas} params={params} ancho={52} onChange={v => set({ velas: v })}/><span style={nota}>velas: sale a la apertura de la siguiente</span></div>}
    </div>
  )
}

// Lo que la pantalla recibe para editar: una fila de strategies con definición del editor, o nada (una nueva).
const estadoDe = (filaInicial) => esDefinicionEditor(filaInicial?.definition)
  ? { def: copia(filaInicial.definition), valores: (() => { try { return typeof filaInicial.params === 'string' ? JSON.parse(filaInicial.params) : (filaInicial.params || {}) } catch (_) { return {} } })(), id: filaInicial.id, nombre: filaInicial.name || filaInicial.definition.nombre || '', descripcion: filaInicial.description || '' }
  : { def: NUEVA(), valores: {}, id: null, nombre: '', descripcion: '' }

export default function EditorPanel({ apiFetch, filaInicial = null, onGuardada, onProbar }) {
  const [est, setEst] = useState(() => estadoDe(filaInicial))
  const [msg, setMsg] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [huella, setHuella] = useState(null)
  useEffect(() => { if (filaInicial) { setEst(estadoDe(filaInicial)); setMsg(null) } }, [filaInicial])
  const { def, valores } = est
  const setDef = (cambio) => setEst(e => ({ ...e, def: { ...e.def, ...cambio } }))
  const intervalo = valores.intervalo === 'semanal' ? 'semanal' : 'diario'
  const esquema = useMemo(() => { try { return esquemaDe(def) } catch (_) { return null } }, [def])
  const params = esquema?.lista || []
  const errores = useMemo(() => { try { return validaDefinicion(def, valores) } catch (e) { return [`La definición no se puede leer: ${e.message}`] } }, [def, valores])
  const frase = useMemo(() => { try { return fraseDefinicion(def, valores) } catch (_) { return null } }, [def, valores])
  const valoresEf = useMemo(() => { try { return valoresDe(def, valores) } catch (_) { return {} } }, [def, valores])
  const sinNombre = !est.nombre.trim()
  useEffect(() => {
    let vivo = true; setHuella(null)
    if (errores.length) return
    huellaDefinicion(def, valores).then(h => { if (vivo) setHuella(h) }).catch(() => {})
    return () => { vivo = false }
  }, [def, valores, errores.length])
  const nCambiables = params.length

  const guarda = async (comoNueva = false) => {
    if (errores.length || sinNombre) return null
    setGuardando(true); setMsg(null)
    try {
      const definition = { ...def, nombre: est.nombre.trim(), ...(est.descripcion.trim() ? { descripcion: est.descripcion.trim() } : {}) }
      const cuerpo = { name: est.nombre.trim(), description: est.descripcion.trim() || null, definition, params: { ...valoresEf, intervalo } }
      const nuevo = comoNueva || !est.id
      if (nuevo) Object.assign(cuerpo, { years: 5, capital_ini: 10000, color: LILA })
      else cuerpo.id = est.id
      const res = await apiFetch('/api/strategies', { method: nuevo ? 'POST' : 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.errores ? j.errores.join(' ') : (j.error || `HTTP ${res.status}`))
      const filaGuardada = { ...cuerpo, ...j, id: j?.id || est.id }
      setEst(e => ({ ...e, id: filaGuardada.id }))
      setMsg({ tipo: 'ok', texto: nuevo ? `Guardada como estrategia nueva: «${cuerpo.name}».` : `Guardada: «${cuerpo.name}».` })
      onGuardada?.(filaGuardada)
      return filaGuardada
    } catch (e) { setMsg({ tipo: 'err', texto: e.message }); return null }
    finally { setGuardando(false) }
  }

  const en = def.entrada || {}, o = en.orden || {}
  const setEntrada = (cambio) => setDef({ entrada: { ...en, ...cambio } })
  const stops = def.stops || [], salidas = def.salidas || []
  const ids = stops.map(s => s.id).filter(Boolean)

  return (
    <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden', fontFamily: MONO }}>
      {/* ── Formularios ── */}
      <div style={{ flex: 3, overflowY: 'auto', padding: 12, minWidth: 0 }}>
        <div style={caja}>
          <div style={etiqueta}>Editor de estrategias {est.id ? <span style={{ color: LILA }}>· editando una guardada</span> : <span>· nueva</span>}</div>
          <div style={fila}>
            <span style={nota}>Empezar desde</span>
            <select style={entrada} value="" onChange={e => { const p = PLANTILLAS[e.target.value]; if (p && confirm('¿Empezar desde la plantilla? Se pierde lo que no esté guardado.')) { const d = p.def(); setEst({ def: d, valores: {}, id: null, nombre: e.target.value === 'nueva' ? '' : `${p.nombre} (editor)`, descripcion: '' }); setMsg(null) } }}>
              <option value="">elige una plantilla…</option>
              {Object.entries(PLANTILLAS).map(([k, p]) => <option key={k} value={k}>{p.nombre}</option>)}
            </select>
            <span style={nota}>Las de la 1 V50 y la 23 dan exactamente sus mismas operaciones: son un buen punto de partida.</span>
          </div>
          <div style={fila}>
            <span style={nota}>Nombre</span><input style={{ ...entrada, width: 260, borderColor: sinNombre ? AMBAR : 'var(--border)' }} value={est.nombre} onChange={e => setEst(x => ({ ...x, nombre: e.target.value }))}/>
            <span style={nota}>Velas</span>
            <select style={entrada} value={intervalo} onChange={e => setEst(x => ({ ...x, valores: { ...x.valores, intervalo: e.target.value } }))}><option value="diario">diarias</option><option value="semanal">semanales</option></select>
          </div>
          <input style={{ ...entrada, width: '100%', boxSizing: 'border-box' }} value={est.descripcion} placeholder="descripción (opcional)" onChange={e => setEst(x => ({ ...x, descripcion: e.target.value }))}/>
        </div>

        <Parametros decl={def.parametros || { version: 1, lista: [] }} onDecl={d => setDef({ parametros: d })} valores={valoresEf}
          onValores={v => setEst(x => ({ ...x, valores: { ...v, ...(x.valores.intervalo ? { intervalo: x.valores.intervalo } : {}) } }))}/>

        <div style={caja}>
          <div style={etiqueta}>Entrada</div>
          <div style={nota}>Se decide con la vela CERRADA: la señal se mira al cierre de una vela y la orden actúa en la siguiente. Sin posición ni orden viva.</div>
          <div style={{ ...nota, marginTop: 6, color: 'var(--text)' }}>Señal:</div>
          <Condicion cond={en.senal} params={params} onChange={v => setEntrada({ senal: v })}/>
          <div style={{ ...fila, marginTop: 8 }}>
            <span style={{ ...nota, color: 'var(--text)' }}>Orden:</span>
            <select style={entrada} value={o.tipo || 'apertura'} onChange={e => { const t = e.target.value; setEntrada({ orden: t === 'stop' ? { tipo: t, nivel: { campo: 'high', velas: 1 }, ajuste: 'fijo' } : t === 'limite' ? { tipo: t, nivel: { campo: 'low', velas: 1 }, ajuste: 'fijo' } : { tipo: t } }) }}>
              {Object.entries(TIPOS_ORDEN).map(([t, v]) => <option key={t} value={t}>{v}</option>)}
            </select>
            {(o.tipo === 'stop' || o.tipo === 'limite') && <>
              <span style={nota}>en el</span>
              <select style={entrada} value={o.nivel?.campo || 'high'} onChange={e => setEntrada({ orden: { ...o, nivel: { ...o.nivel, campo: e.target.value } } })}>{Object.entries(CAMPOS).map(([c, v]) => <option key={c} value={c}>{v}</option>)}</select>
              <span style={nota}>de las</span><Valor valor={o.nivel?.velas} params={params} ancho={40} onChange={v => setEntrada({ orden: { ...o, nivel: { ...o.nivel, velas: v } } })}/><span style={nota}>últimas velas;</span>
              <select style={entrada} value={o.ajuste || 'fijo'} onChange={e => setEntrada({ orden: { ...o, ajuste: e.target.value } })}><option value="fijo">el nivel no se mueve</option><option value="soloBaja">solo baja (al de cada vela si es más bajo)</option><option value="soloSube">solo sube</option></select>
            </>}
          </div>
          {o.tipo === 'cierre' && <div style={{ ...nota, color: AMBAR }}>Al cierre: compra al precio de cierre de la misma vela que da la señal. Es lo que haría alguien mirando el mercado justo antes del cierre; la estrategia se guarda con «entradaAlCierre» para que los filtros lo sepan.</div>}
          {(o.tipo === 'stop' || o.tipo === 'limite') && (
            <div style={{ marginTop: 6 }}>
              <label style={nota}><input type="checkbox" checked={!!en.cancelar} onChange={e => setEntrada({ cancelar: e.target.checked ? condPorDefecto('precioVsMedia') : undefined })}/> cancelar la orden si, al cierre:</label>
              {en.cancelar && <Condicion cond={en.cancelar} params={params} nivel={1} onChange={v => setEntrada({ cancelar: v })}/>}
            </div>
          )}
          <label style={{ ...nota, display: 'block', marginTop: 6 }} title="Si no, el día de la entrada no se miran stops ni salidas (como la 23)">
            <input type="checkbox" checked={en.revisaSalidasEnLaVelaDeEntrada !== false} onChange={e => setEntrada({ revisaSalidasEnLaVelaDeEntrada: e.target.checked ? true : false })}/> mirar stops y salidas ya en la vela de entrada
          </label>
        </div>

        <div style={caja}>
          <div style={etiqueta}>Filtro de mercado</div>
          <label style={nota}><input type="checkbox" checked={!!def.filtroMercado} onChange={e => setDef({ filtroMercado: e.target.checked ? { ticker: '^GSPC', si: { c: 'precioVsMedia', p: { tipo: 'SMA', periodo: 200, lado: 'encima' } } } : undefined })}/> solo entrar si otro ticker (un índice o un ETF) cumple una condición</label>
          {def.filtroMercado && <>
            <div style={fila}><span style={nota}>Ticker</span><input style={{ ...entrada, width: 80 }} value={def.filtroMercado.ticker} onChange={e => setDef({ filtroMercado: { ...def.filtroMercado, ticker: e.target.value.trim().toUpperCase() } })}/>
              <span style={nota}>se descargan sus velas en la misma temporalidad que el activo</span></div>
            <Condicion cond={def.filtroMercado.si} params={params} nivel={1} onChange={v => setDef({ filtroMercado: { ...def.filtroMercado, si: v } })}/>
          </>}
        </div>

        <div style={caja}>
          <div style={etiqueta}>Stops</div>
          <div style={nota}>Se comprueban en este orden en cada vela con posición. El primero que se cumple cierra la operación a su precio (o a la apertura, si la vela abre por debajo).</div>
          {stops.map((s, k) => <Stop key={k} s={s} k={k} n={stops.length} params={params} ids={ids}
            onChange={v => setDef({ stops: stops.map((x, j) => j === k ? v : x) })}
            onQuitar={() => setDef({ stops: stops.filter((_, j) => j !== k) })}
            onMueve={d => { const a = [...stops]; [a[k], a[k + d]] = [a[k + d], a[k]]; setDef({ stops: a }) }}/>)}
          <div style={{ ...fila, marginTop: 6 }}>
            <span style={nota}>Añadir:</span>
            {Object.entries(TIPOS_STOP).map(([t, v]) => <button key={t} style={botonMini} onClick={() => { let n = stops.length + 1; while (ids.includes(`${t}${n}`)) n++; setDef({ stops: [...stops, stopPorDefecto(t, n)] }) }}>{v}</button>)}
          </div>
        </div>

        <div style={caja}>
          <div style={etiqueta}>Salidas</div>
          <div style={nota}>Después de los stops. La salida por condición se decide al cierre y vende a la apertura siguiente (vender al cierre de la misma vela usaría un precio que al decidir aún no existe).</div>
          {salidas.map((s, k) => <Salida key={k} s={s} k={k} params={params}
            onChange={v => setDef({ salidas: salidas.map((x, j) => j === k ? v : x) })}
            onQuitar={() => setDef({ salidas: salidas.filter((_, j) => j !== k) })}/>)}
          <div style={{ ...fila, marginTop: 6 }}>
            <span style={nota}>Añadir:</span>
            {Object.entries(TIPOS_SALIDA).map(([t, v]) => <button key={t} style={botonMini} onClick={() => setDef({ salidas: [...salidas, salidaPorDefecto(t)] })}>{v}</button>)}
          </div>
        </div>
      </div>

      {/* ── La regla, la validación y los consejos ── */}
      <div style={{ flex: 2, overflowY: 'auto', padding: 12, borderLeft: '1px solid var(--border)', minWidth: 260 }}>
        <div style={caja}>
          <div style={etiqueta}>La regla</div>
          <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text)' }}>{frase || '…'}</div>
          <div style={{ ...nota, marginTop: 6 }}>Así la ejecuta el motor, con los valores actuales de los parámetros ({nCambiables ? params.map(p => `${p.nombre} = ${aTexto(valoresEf[p.nombre])}`).join(', ') : 'sin parámetros'}); velas {intervalo === 'semanal' ? 'semanales' : 'diarias'}.</div>
        </div>

        <div style={{ ...caja, borderColor: errores.length ? ROJO : sinNombre ? AMBAR : VERDE }}>
          <div style={{ ...etiqueta, color: errores.length ? ROJO : sinNombre ? AMBAR : VERDE }}>{errores.length ? `${errores.length} error${errores.length > 1 ? 'es' : ''}: no se puede guardar` : sinNombre ? 'Falta el nombre' : 'Válida'}</div>
          {errores.map((e, k) => <div key={k} style={{ ...nota, color: 'var(--text)' }}>· {e}</div>)}
          {!errores.length && <div style={nota}>Huella: <span style={{ color: 'var(--text)' }}>{huella ? huella.slice(0, 16) + '…' : '…'}</span> — identifica lo que hace la estrategia (reglas y valores, no el nombre): dos con la misma huella dan las mismas operaciones.</div>}
          <div style={{ ...fila, marginTop: 8 }}>
            <button style={{ ...botonPrincipal, opacity: errores.length || sinNombre || guardando ? 0.5 : 1 }} disabled={!!errores.length || sinNombre || guardando} onClick={() => guarda(false)}>{est.id ? 'Guardar' : 'Guardar como estrategia'}</button>
            {est.id && <button style={{ ...boton, opacity: errores.length || sinNombre || guardando ? 0.5 : 1 }} disabled={!!errores.length || sinNombre || guardando} onClick={() => guarda(true)}>Guardar como nueva</button>}
            <button style={{ ...boton, opacity: errores.length || sinNombre || guardando ? 0.5 : 1 }} disabled={!!errores.length || sinNombre || guardando}
              title="Guarda y la abre en Estrategias con el activo de siempre: el gráfico enseña sus órdenes, entradas y salidas"
              onClick={async () => { const f = await guarda(false); if (f) onProbar?.(f) }}>Probar en backtest ▸</button>
          </div>
          {msg && <div style={{ ...nota, marginTop: 6, color: msg.tipo === 'ok' ? VERDE : ROJO }}>{msg.texto}</div>}
        </div>

        <div style={caja}>
          <div style={etiqueta}>Cómo leer el resultado</div>
          <div style={nota}>
            · El backtest usa el motor de siempre: la misma simulación, comisiones y métricas que una estrategia con código.<br/>
            · Todo se decide con velas cerradas: ninguna regla puede ver el precio de una vela que aún no ha terminado.<br/>
            · En el gráfico, las órdenes stop o límite aparecen como líneas mientras siguen vivas; los motivos de salida son los «motivo» de cada stop y salida.<br/>
            · Para comparar con otras estrategias, usa Backtesting (varios activos) y la Optimización con los parámetros declarados.
          </div>
        </div>

        <div style={{ ...caja, borderColor: nCambiables > 3 ? AMBAR : 'var(--border)' }}>
          <div style={{ ...etiqueta, color: nCambiables > 3 ? AMBAR : GRIS }}>Riesgo de sobreajuste</div>
          <div style={nota}>
            {nCambiables > 3 ? `Esta estrategia tiene ${nCambiables} parámetros. ` : ''}Cada parámetro que cambias buscando el mejor resultado es una prueba más: con muchas,
            alguna sale bien por casualidad y no se repetirá. Cambia pocos a la vez, mira que el resultado aguante en valores vecinos (no solo en el mejor)
            y en otro periodo, y desconfía de las mejoras pequeñas con pocas operaciones.
          </div>
        </div>
      </div>
    </div>
  )
}
