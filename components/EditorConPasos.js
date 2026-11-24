// components/EditorConPasos.js — la «Condición con pasos» en la ventana de la señal del Replay (docs/builder.md §244; boceto
// bocetos/condiciones-con-pasos.html, pestaña 1, aceptado por Sergi el 24/11). Solo pinta y cambia la condición (onCambia(def)); las
// cuentas, en lib/condiciones/conPasos.js. Cada paso lleva las filas de siempre (components/FilasAlerta.js, con «y además / o bien»)
// y, salvo «Mientras…», las filas «cae / sube un X % desde…».
import Ayuda from './BuilderAyuda'
import FilasAlerta from './FilasAlerta'
import { validaConPasos } from '../lib/condiciones/conPasos'
import { referenciasPara, opcionesEmpieza, ajustaConPasos, fraseConPasos, filaMovimientoNueva, EJEMPLOS_CON_PASOS, AYUDA_PASOS } from '../lib/replay/conPasosPantalla'

const K = { caja: '#353945', borde: '#4c5263', texto: '#f3f3f5', gris: '#a9adb8', azul: '#58a6ff', verde: '#3fb950', lila: '#bc8cff', rojo: '#f85149', ambar: '#d29922' }
const COLOR = { mientras: K.verde, paso1: K.azul, paso2: K.lila, anula: K.rojo }
const TITULO = { mientras: 'Mientras…', paso1: 'Paso 1 · Primero', paso2: 'Paso 2 · Después', anula: 'Se anula si… (antes del paso 2)' }
const enlace = { background: 'none', border: 'none', color: K.azul, cursor: 'pointer', padding: 0, font: 'inherit' }
const sel = { background: K.caja, color: K.texto, border: `1px solid ${K.borde}`, borderRadius: 5, padding: '2px 6px', font: 'inherit', width: 'auto' }

// La fila con la que nace cada sección al añadirla.
const filaNueva = (k, sim) => k === 'mientras' ? { quien: sim, velas: 'diarias', si: { c: 'precioVsMedia', p: { lado: 'encima', tipo: 'EMA', periodo: 200 } } }
  : k === 'paso2' ? filaMovimientoNueva(sim, 'paso1') : k === 'anula' ? { ...filaMovimientoNueva(sim, 'paso1'), mov: 'sube' } : filaMovimientoNueva(sim)

export default function EditorConPasos({ simbolo, def, onCambia }) {
  const sim = String(simbolo || '').toUpperCase()
  const pon = (c) => onCambia(ajustaConPasos({ ...def, ...c }))
  const errores = validaConPasos(def)
  const seccion = (k) => {
    const quitable = k !== 'paso1'
    return (
      <div key={k} data-seccion-pasos={k} style={{ borderLeft: `3px solid ${COLOR[k]}`, background: 'rgba(255,255,255,0.03)', borderRadius: 5, padding: '8px 10px', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          <b style={{ color: COLOR[k] }}>{TITULO[k]}</b>
          <Ayuda texto={AYUDA_PASOS[k]} etiqueta={TITULO[k]} zIndice={10100}/>
          {quitable && <button type="button" data-quita-seccion={k} title="Quitar" onClick={() => pon({ [k]: null })} style={{ ...enlace, marginLeft: 'auto', color: K.gris, fontSize: 15 }}>✕</button>}
        </div>
        <FilasAlerta simbolo={sim} filas={def[k].filas} para="señal" conO movimientos={referenciasPara(k, def)}
          onCambia={fs => pon({ [k]: { ...def[k], filas: fs } })}/>
        {k === 'paso1' && def.paso2 && (
          <label style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', gap: 6, fontFamily: 'inherit', marginTop: 6, color: K.gris, width: 'auto' }}>
            <input type="checkbox" data-da-senal="" style={{ width: 'auto', margin: 0 }} checked={!!def.paso1.daSenal} onChange={e => pon({ paso1: { ...def.paso1, daSenal: e.target.checked } })}/> este paso también da señal
          </label>)}
      </div>)
  }
  const anade = (k, texto) => (
    <div style={{ marginBottom: 8 }}><button type="button" data-pon-seccion={k} style={enlace} onClick={() => pon({ [k]: { filas: [filaNueva(k, sim)] } })}>{texto}</button></div>)
  const empieza = opcionesEmpieza(def)
  return (
    <div data-editor-pasos="">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, color: K.gris }}>
        <span>Se lee de arriba abajo.</span><Ayuda texto={AYUDA_PASOS.general} etiqueta="Condición con pasos" zIndice={10100}/>
        <select data-ejemplo-pasos="" value="" style={{ ...sel, marginLeft: 'auto' }} title="Pone uno de los ejemplos (cambia lo de ahora)"
          onChange={e => { const x = EJEMPLOS_CON_PASOS.find(y => y.id === e.target.value); if (x) onCambia(ajustaConPasos(x.def(sim))) }}>
          <option value="">Cargar un ejemplo…</option>
          {EJEMPLOS_CON_PASOS.map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}
        </select>
      </div>
      {def.mientras ? seccion('mientras') : anade('mientras', '+ Mientras… (un tramo)')}
      {seccion('paso1')}
      {def.paso2 ? seccion('paso2') : anade('paso2', '+ Paso 2 · Después…')}
      {def.paso2 && (def.anula ? seccion('anula') : anade('anula', '+ Se anula si… (antes del paso 2)'))}
      <div data-seccion-pasos="veces" style={{ borderLeft: `3px solid ${K.ambar}`, background: 'rgba(255,255,255,0.03)', borderRadius: 5, padding: '8px 10px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <b style={{ color: K.ambar }}>Cuántas veces</b><Ayuda texto={AYUDA_PASOS.veces} etiqueta="Cuántas veces" zIndice={10100}/>
        <select data-veces-pasos="" value={def.veces} style={sel} onChange={e => pon({ veces: e.target.value })}>
          <option value="cada">cada vez que se cumpla</option><option value="primera">solo la primera vez</option></select>
        {empieza.length > 0 && <>
          <span style={{ color: K.gris }}>· {def.veces === 'primera' ? 'vuelve a empezar' : 'el paso 1 vuelve a empezar'}</span>
          <select data-empieza-pasos="" value={def.empieza} style={sel} onChange={e => pon({ empieza: e.target.value })}>
            {empieza.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>
        </>}
      </div>
      <div data-asi-se-lee-pasos="" style={{ background: 'rgba(88,166,255,0.08)', border: `1px solid rgba(88,166,255,0.35)`, borderRadius: 5, padding: '8px 10px' }}>
        <b>Así se lee</b><div style={{ marginTop: 2 }}>{fraseConPasos(def)}</div>
      </div>
      {errores.length > 0 && <div data-errores-pasos={errores.length} style={{ color: K.rojo, marginTop: 8, fontSize: 12 }}>{errores.map((e, i) => <div key={i}>✕ {e}</div>)}</div>}
    </div>)
}
