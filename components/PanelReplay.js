// components/PanelReplay.js — OPERAR en el Replay (docs/builder.md §228; boceto bocetos/replay-simulacion.html v2).
// PanelOperar: el panel de la derecha (nombre, cifras o la tarjeta ⚙ «Valores por defecto», avisos, Terminar).
// §250: PanelGrafico: el panel de operar DENTRO del gráfico (botones, órdenes vivas y posición con sus casillas).
// ResultadosReplay: debajo del gráfico, pestañas «Operaciones · N» y «Curva del capital».
// Todo sale de lib/replay/motor.js (calcula y cifras); esto solo pinta y avisa (onAccion, onTerminar).
// §229: el formulario puede venir de fuera (form + onForm, lo lleva pages/index.js para que el gráfico lo rellene con 🎯 / doble clic y
// arrastrando las líneas); sin ellos, el panel guarda el suyo. §233: sin «Enviar orden» para las de un precio: lo marcado en el gráfico ES la orden.
import { useState } from 'react'
import Ayuda from './BuilderAyuda'
import { compruebaOrden, nuevaAccion, textoOrden } from '../lib/replay/orden'
import { TIPOS_SIGUE } from '../lib/replay/motor'
import { porValor } from '../lib/replay/varios'
import { estima, pctFrente, redondea, deMercado, modoStop, modoObjetivo } from '../lib/replay/borrador'
import { Papelera } from './VentanaPregunta'

const BZ = { fondo: '#22262f', panel: '#2c303b', caja: '#353945', borde: '#4c5263', texto: '#f3f3f5', gris: '#a9adb8', verde: '#3fb950', rojo: '#f85149', ambar: '#d29922', azul: '#58a6ff' }
const LETRA = 'system-ui, "Segoe UI", sans-serif'
const loc = (x, d) => x.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: 'always' })   // 'always': también 5.050 (es-ES no agrupa los de 4 cifras)
const eur = (x, d = 0) => (x == null || !Number.isFinite(x) ? '—' : `${x < 0 ? '−' : ''}${loc(Math.abs(x), d)} €`)
const pr = (x) => (x == null ? '—' : loc(x, 2))
const com = (x) => x.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 3 })   // 0,185 € (no 0,19)
const pc = (x, d = 1) => (x == null || !Number.isFinite(x) ? '—' : `${x < 0 ? '−' : ''}${loc(Math.abs(x), d)} %`)
const signo = (x) => (x > 0 ? '+' : x < 0 ? '−' : '')
const color = (x) => (x > 0 ? BZ.verde : x < 0 ? BZ.rojo : BZ.texto)
const fmt = (f) => (f ? `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}` : '—')
const btn = (activo = true, on = false) => ({ background: on ? 'rgba(88,166,255,0.22)' : BZ.caja, color: on ? '#fff' : BZ.texto, border: `1px solid ${on ? BZ.azul : BZ.borde}`, borderRadius: 5,
  padding: '4px 9px', font: `13px ${LETRA}`, cursor: activo ? 'pointer' : 'default', opacity: activo ? 1 : 0.4 })
const casilla = { background: BZ.caja, color: BZ.texto, border: `1px solid ${BZ.borde}`, borderRadius: 5, padding: '4px 6px', font: `13px ${LETRA}`, width: 90 }
const cajaSt = { background: BZ.panel, border: `1px solid ${BZ.borde}`, borderRadius: 8, padding: '8px 10px', margin: '8px 0' }

export const AYUDA_ORDEN = 'OPERAR DESDE EL GRÁFICO. Con «En un precio» (en ⚙): pulsa «🎯 Compra» (verde) o «🎯 Venta» (roja, en corto) y haz clic en el gráfico en la Entrada; el stop y el objetivo salen solos con los valores de ⚙ (o los marcas tú si elegiste «Lo marco yo»). La orden se pone sola en cuanto está completa (Enter: ponerla con lo marcado; Esc cancela). También con doble clic en el gráfico.\n' +
  'Entrada por debajo del precio de ahora = orden LÍMITE (compra si baja hasta ahí); por encima = orden STOP (compra si sube hasta ahí, una ruptura); en corto, al revés. Sigue viva hasta que se cumple o la cancelas. Si la vela abre ya más allá, se ejecuta a la apertura.\n\n' +
  'Con «A mercado» (en ⚙): los botones dicen «Compra» / «Venta» y la orden va a la apertura de la vela siguiente (o al cierre de hoy, si lo elegiste al empezar), con el stop y el objetivo de ⚙.\n\n' +
  'CASILLAS: cada orden viva y la posición abierta tienen Entrada, Stop y Objetivo. Escribe un precio y pulsa Enter, pulsa 🎯 y haz clic en el gráfico, o arrastra su línea. ✕ quita el stop o el objetivo; en la entrada, cancela la orden.\n\n' +
  'STOP y OBJETIVO: se vende al tocarlos; si la vela abre ya al otro lado (hueco), a la apertura. Si en la misma vela se tocan los dos, cuenta el stop (lo prudente).\n' +
  'Ejemplo con stop a 10 % y R:R 1 : 2: compra con entrada en 100 → stop 90 y objetivo 100 + 2 × 10 = 120. En corto, al revés (entrada 100 → stop 110, objetivo 80).\n\n' +
  'TAMAÑO: «Invertir X %» del dinero total en el momento de ejecutarse; «Arriesgar X %» = lo que perderías si salta el stop. Siempre se redondea hacia abajo.\n' +
  'Ejemplo: tienes 10.000 € y compras a 96 con stop en 90 arriesgando un 1 %: 100 € ÷ (96 − 90) = 16,7 → 16 acciones (1.536 €).'

function Cifra({ titulo, valor, col, tip }) {
  return <div title={tip} style={{ background: BZ.caja, borderRadius: 6, padding: '5px 7px' }}><small style={{ display: 'block', color: BZ.gris, fontSize: 11 }}>{titulo}</small><b style={{ fontSize: 14, color: col || BZ.texto }}>{valor}</b></div>
}

// §230: casilla de precio de una orden ya enviada o de la posición. Muestra el precio de ahora (o el de la línea mientras se arrastra);
// al escribir, se fija con Enter o al salir de la casilla (vacía = quitar). Esc deja el que había.
function CasillaPrecio({ valor, onFija, dato, titulo, ancho = 80 }) {
  const [txt, setTxt] = useState(null)
  const muestra = txt != null ? txt : (valor == null ? '' : String(redondea(valor)).replace('.', ','))
  const fija = () => { if (txt == null) return; const t = txt.trim(); setTxt(null); onFija(t === '' ? null : Number(t.replace(',', '.'))) }
  return <input data-casilla-viva={dato} title={titulo} style={{ ...casilla, width: ancho, padding: '2px 5px', textAlign: 'right' }} placeholder="—" value={muestra} onChange={e => setTxt(e.target.value)} onBlur={fija}
    onKeyDown={e => { if (e.key === 'Enter') fija(); else if (e.key === 'Escape') setTxt(null) }} />
}

// §232: el nombre del Replay (✎ para cambiarlo) y si está guardado. guardado: '' (aún nada que guardar) | 'guardando' | 'guardado' | 'error…'.
function NombreReplay({ nombre, onNombre, guardado, onMisReplays }) {
  const [txt, setTxt] = useState(null)
  const fija = () => { if (txt == null) return; const t = txt.trim(); setTxt(null); if (t && t !== nombre) onNombre(t) }
  const est = !guardado ? { t: 'se guarda solo en cuanto avances u operes', c: BZ.gris } : guardado === 'guardando' ? { t: 'guardando…', c: BZ.gris }
    : guardado === 'guardado' ? { t: '✓ guardado', c: BZ.verde } : { t: `⚠ ${guardado}`, c: BZ.rojo }
  return (
    <div data-nombre-replay="" style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
      {txt != null
        ? <input autoFocus data-casilla-nombre="" value={txt} maxLength={120} onChange={e => setTxt(e.target.value)} onBlur={fija}
            onKeyDown={e => { if (e.key === 'Enter') fija(); else if (e.key === 'Escape') setTxt(null) }} style={{ ...casilla, width: 220 }} />
        : <span style={{ fontWeight: 600, maxWidth: 230, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={nombre}>{nombre}</span>}
      {txt == null && onNombre && <button data-cambiar-nombre="" title="Cambiar el nombre" onClick={() => setTxt(nombre)} style={{ ...btn(), padding: '0 6px' }}>✎</button>}
      <span data-guardado-replay="" style={{ color: est.c, fontSize: 12 }}>{est.t}</span>
      {onMisReplays && <button data-mis-replays-boton="" onClick={onMisReplays} title="Tus replays guardados: abrir o borrar" style={{ ...btn(), marginLeft: 'auto' }}>📂 Mis replays</button>}
    </div>)
}

export const AYUDA_SIGUE = 'STOP QUE SIGUE AL PRECIO: son los mismos stops que suben de las tarjetas de las estrategias. Al cierre de cada vela se mira dónde quedaría y, desde la vela siguiente, el stop pasa ahí SOLO si es a favor (en una compra solo sube; en un corto solo baja). Se aplica a las órdenes nuevas.\n\n' +
  '· A un % del máximo: compras a 100 con 10 %; el precio llega a 130 → el stop pasa a 117 (130 − 10 %). Si luego baja a 117, sales con +17 %.\n' +
  '· Mínimo de las N últimas velas: con 3, si los mínimos de las 3 últimas son 98, 101 y 99, el stop pasa a 98 (si estaba más abajo).\n' +
  '· Mínimo de la vela que cierra bajo la EMA: cada vela que cierra por debajo de su EMA propone su mínimo (solo en compras).\n' +
  '· Línea del SuperTrend y último mínimo de swing: como en las tarjetas (si el SuperTrend se da la vuelta, su línea queda al otro lado y sales a la apertura siguiente).'
export const AYUDA_SOLO = 'EJECUTAR SOLO: cada vela, al cierre, mira la señal elegida en la barra del Replay (una condición o una estrategia). Si sale y no tienes nada en ese valor, compra a mercado (a la apertura de la vela siguiente, o al cierre si lo elegiste al empezar) con el tamaño, el stop, el objetivo y el stop que sigue de aquí. Puedes seguir operando a mano a la vez.\n\n' +
  'Sale con el stop y el objetivo de aquí o, si la señal es una estrategia y lo eliges, con las salidas de la estrategia (además del stop de aquí, si pusiste uno).\n\n' +
  'Si no llega el dinero, la señal se salta y se cuenta en «Señales sin dinero». Ejemplo: 10.000 € e invertir 50 % → caben dos compras; con el dinero ya invertido, la siguiente señal se salta.\n\n' +
  'Si cambias los valores con «Ejecutar solo» encendido, los nuevos valen desde hoy. Al retroceder velas, vuelve a como estaba entonces.'

// §250: la tarjeta ⚙ «Valores por defecto» (en lugar de las cifras). Cambia el formulario (form / onForm), que la página recuerda en el
// navegador (replay.orden) para cualquier Replay. Lo que ya está puesto (órdenes vivas, la posición) no cambia.
// §252: auto = { activo, puede, senal (texto), esEstrategia, onCambia(bool) } para «Ejecutar solo».
export function TarjetaDefecto({ form, onForm, estado, onCerrar, auto = null }) {
  const f = form
  // Al elegir «A un %», «A X veces el ATR» o «Por R:R» con la casilla vacía, se rellena con 5 %, 2 veces y 1 : 2 (los de fábrica).
  const pon = (k, v) => onForm(x => ({ ...x, [k]: v, ...(k === 'stopModo' && v === 'pct' && (x.stopPct === '' || x.stopPct == null) ? { stopPct: '5' } : {}), ...(k === 'stopModo' && v === 'atr' && (x.stopAtr === '' || x.stopAtr == null) ? { stopAtr: '2' } : {}), ...(k === 'tpModo' && v === 'rr' && (x.rr === '' || x.rr == null) ? { rr: '2' } : {}) }))
  const sel = (k, valor, ops, dato) => <select data-def={dato || k} value={valor} onChange={e => pon(k, e.target.value)} style={{ ...casilla, width: '100%' }}>{ops.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>
  const numero = (k, dato, suf) => <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><input data-def={dato} value={f[k] ?? ''} onChange={e => pon(k, e.target.value)} style={{ ...casilla, width: 62, textAlign: 'right' }} />{suf}</span>
  const fila = (titulo, cosa) => <><span style={{ color: BZ.gris }}>{titulo}</span><span>{cosa}</span></>
  const grupo = (t) => <div style={{ gridColumn: '1 / -1', borderTop: `1px solid ${BZ.borde}`, marginTop: 6, paddingTop: 4, color: BZ.azul, fontSize: 12 }}>{t}</div>
  const ms = modoStop(f), mo = modoObjetivo(f)
  const tsig = TIPOS_SIGUE.find(x => x.tipo === (f.sigueTipo || 'no')) || TIPOS_SIGUE[0]
  const ponSigue = (tipo) => { const ts = TIPOS_SIGUE.find(x => x.tipo === tipo) || TIPOS_SIGUE[0]; onForm(x => ({ ...x, sigueTipo: tipo, sigueN: String(ts.campos[0]?.[2] ?? ''), sigueK: String(ts.campos[1]?.[2] ?? '') })) }
  return (
    <div data-tarjeta-defecto="" style={{ ...cajaSt, marginTop: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <b>⚙ Valores por defecto</b><Ayuda texto={AYUDA_ORDEN} etiqueta="Cómo funcionan las órdenes" />
        <button data-cerrar-defecto="" onClick={onCerrar} style={{ ...btn(), marginLeft: 'auto', padding: '1px 8px' }} title="Volver a las cifras">← Cifras</button>
      </div>
      <div style={{ color: BZ.gris, fontSize: 11, marginTop: 2 }}>Valen para las órdenes nuevas de cualquier Replay; lo que ya está puesto no cambia.</div>
      <div style={{ display: 'grid', gridTemplateColumns: '96px 1fr', gap: '5px 8px', alignItems: 'center', marginTop: 4, fontSize: 12 }}>
        {grupo('Orden')}
        {fila('Tipo', sel('tipo', f.tipo || 'precio', [['precio', 'En un precio (🎯)'], ['mercado', 'A mercado']]))}
        {grupo('Stop inicial')}
        {fila('Stop', sel('stopModo', ms, [['pct', 'A un %'], ['atr', 'A X veces el ATR'], ['marco', 'Lo marco yo'], ['no', 'Sin stop']]))}
        {ms === 'pct' && fila('a', numero('stopPct', 'stopPct', '% de la entrada'))}
        {ms === 'atr' && fila('a', numero('stopAtr', 'stopAtr', <span title={f.atrHoy ? `ATR (14) de hoy: ${pr(f.atrHoy)}` : ''}>veces el ATR (14){f.atrHoy ? ` · hoy ${pr(f.atrHoy)}` : ''}</span>))}
        {grupo(<span>Stop que sigue al precio <Ayuda texto={AYUDA_SIGUE} etiqueta="Stop que sigue al precio" /></span>)}
        {fila('Sigue', <select data-def="sigueTipo" value={tsig.tipo} onChange={e => ponSigue(e.target.value)} style={{ ...casilla, width: '100%' }}>{TIPOS_SIGUE.map(x => <option key={x.tipo} value={x.tipo}>{x.nombre}</option>)}</select>)}
        {tsig.campos.map(([k, txt], i) => <span key={k} style={{ display: 'contents' }}>{fila(i ? 'y' : 'con', numero(k === 'n' ? 'sigueN' : 'sigueK', k === 'n' ? 'sigueN' : 'sigueK', txt))}</span>)}
        {grupo('Objetivo')}
        {fila('Objetivo', sel('tpModo', mo, [['rr', 'Por R:R'], ['marco', 'Lo marco yo'], ['no', 'Sin objetivo']]))}
        {mo === 'rr' && fila('R:R 1 :', numero('rr', 'rr', ms === 'no' ? <span style={{ color: BZ.ambar }}>sin stop no hay R:R</span> : ''))}
        {grupo('Tamaño')}
        {fila('Tamaño', sel('modo', f.modo, [['invertir', 'Invertir un %'], ['arriesgar', 'Arriesgar un %']]))}
        {fila(f.modo === 'arriesgar' ? 'arriesgar' : 'invertir', numero('pct', 'pct', '% de tu dinero'))}
        {f.modo === 'arriesgar' && ms === 'no' && <div style={{ gridColumn: '1 / -1', color: BZ.ambar }}>Para arriesgar un % hace falta un stop.</div>}
        {auto && grupo(<span>Ejecutar solo <Ayuda texto={AYUDA_SOLO} etiqueta="Ejecutar solo" /></span>)}
        {auto && <label data-auto-replay="" title={auto.puede ? '' : 'Elige antes una señal en la barra del Replay (una condición o una estrategia)'} style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 6, opacity: auto.puede ? 1 : 0.5, cursor: auto.puede ? 'pointer' : 'default' }}>
          <input type="checkbox" data-def="solo" checked={!!auto.activo} disabled={!auto.puede} onChange={e => auto.onCambia(e.target.checked)} />
          <span>Compra solo al salir la señal{auto.senal ? <>: <b>{auto.senal}</b></> : ' (elige una en la barra)'}</span></label>}
        {auto && auto.esEstrategia && fila('Sale con', sel('sale', f.sale || 'panel', [['panel', 'El stop y el objetivo de aquí'], ['estrategia', 'Las salidas de la estrategia']]))}
        {grupo('De este Replay (al empezar)')}
        <div style={{ gridColumn: '1 / -1', color: BZ.gris }}>{estado.comision ? `${com(estado.comision)} € por orden` : 'Sin comisión'} · a mercado {estado.ejecucion === 'cierre' ? 'al cierre de hoy' : 'a la apertura siguiente'}</div>
      </div>
    </div>)
}

// §250: el panel de la DERECHA: el nombre, las cifras de tu cuenta (o, con ⚙, los valores por defecto), avisos y Terminar.
// Operar (botones, órdenes vivas, la posición) va en el panel de dentro del gráfico (PanelGrafico).
export function PanelOperar({ estado, simbolo, r, cif, onTerminar, aviso = '', nombre = null, onNombre, guardado = '', onMisReplays, cfg = false, form = null, onForm, onCfg, auto = null, indice = null }) {
  const terminada = !!estado.terminada
  const g = (x) => (x == null ? '—' : pc(x))
  const pf = cif.factorBeneficio == null ? '—' : cif.factorBeneficio === Infinity ? '∞' : loc(cif.factorBeneficio, 2)
  return (
    <div data-panel-replay="" style={{ padding: '8px 10px', font: `13px/1.45 ${LETRA}`, color: BZ.texto }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <b style={{ color: '#ffd166' }}>⏪ REPLAY · {simbolo}</b>
        <span style={{ marginLeft: 'auto', color: BZ.gris, fontSize: 12 }}>{estado.comision ? `${com(estado.comision)} € por orden` : 'sin comisión'}</span>
      </div>
      {nombre != null && <NombreReplay nombre={nombre} onNombre={onNombre} guardado={guardado} onMisReplays={onMisReplays} />}
      {cfg && form && onForm
        ? <TarjetaDefecto form={form} onForm={onForm} estado={estado} auto={auto} onCerrar={() => onCfg && onCfg(false)} />
        : <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 8 }} data-cifras-replay="">
          <Cifra titulo="Tu dinero" valor={eur(cif.final)} tip={`Empezaste con ${eur(estado.capitalInicial)}`} />
          <Cifra titulo="Ganancia" valor={`${signo(cif.ganancia)}${eur(Math.abs(cif.ganancia))} · ${pc(cif.pct)}`} col={color(cif.ganancia)} />
          <Cifra titulo="CAGR" valor={g(cif.cagr)} col={cif.cagr == null ? BZ.texto : color(cif.cagr)} tip={cif.cagr == null ? 'Con menos de 90 días no se da: un mes bueno daría un CAGR absurdo' : `Rentabilidad al año: del ${fmt(estado.desde)} al ${fmt(estado.hoy)}`} />
          <Cifra titulo="Peor caída" valor={pc(cif.peorCaida)} col={cif.peorCaida < 0 ? BZ.rojo : BZ.texto} />
          <Cifra titulo="Operaciones" valor={cif.operaciones} />
          <Cifra titulo="Ganadoras" valor={cif.ganadoras == null ? '—' : pc(cif.ganadoras, 0)} />
          <Cifra titulo="Profit factor" valor={pf} tip="Lo ganado en las ganadoras ÷ lo perdido en las perdedoras" />
          <Cifra titulo="Invertido de media" valor={g(cif.invertidoMedia)} tip="La media, vela a vela, de lo que tenías invertido frente a tu dinero" />
          <Cifra titulo="Tiempo con algo dentro" valor={g(cif.tiempoDentro)} tip="De las velas que llevas, en cuántas acabaste con algo abierto" />
          <Cifra titulo="Liquidez" valor={eur(r.caja)} />
          <Cifra titulo={`Buy&Hold ${cif.buyHold?.simbolo || simbolo}`} valor={eur(cif.buyHold?.final)} tip={estado.valores.length > 1 ? 'El mismo dinero a partes iguales entre los valores, comprados al cierre del primer día (un valor que aún no cotizaba, el día que empieza) y vendidos hoy, con las comisiones' : 'Comprar al cierre del primer día que viste y vender hoy, con el mismo dinero y pagando las dos comisiones'} />
          {indice != null && <Cifra titulo="Buy&Hold S&P 500" valor={eur(indice)} tip="El mismo dinero en el S&P 500 (^GSPC), comprado al cierre del primer día y vendido hoy, con las comisiones" />}
          {(auto?.activo || (cif.sinDinero || 0) > 0) && <Cifra titulo="Señales sin dinero" valor={cif.sinDinero || 0} col={cif.sinDinero ? BZ.ambar : BZ.texto} tip="Señales de «Ejecutar solo» que se saltaron porque no llegaba el dinero" />}
          <Cifra titulo="Tú, frente a él" valor={cif.buyHold ? `${signo(Math.round(cif.final - cif.buyHold.final))}${eur(Math.abs(cif.final - cif.buyHold.final))}` : '—'} col={cif.buyHold ? color(Math.round(cif.final - cif.buyHold.final)) : BZ.texto} />
        </div>}
      {aviso && <div data-aviso-linea="" style={{ color: BZ.ambar, fontSize: 12, margin: '6px 0' }}>⚠ {aviso}</div>}
      {r.avisos.length > 0 && <div style={{ ...cajaSt, borderColor: BZ.ambar }} data-avisos-replay="">
        {r.avisos.slice(-4).map((a, i) => <div key={i} style={{ color: BZ.ambar, fontSize: 12 }}>{fmt(a.fecha)}: {a.texto}</div>)}
      </div>}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 8 }}>
        <button data-terminar="" style={btn()} onClick={() => onTerminar(!terminada)}
          title={terminada ? 'Volver a operar (deshace el cierre final)' : 'Cerrar todo al cierre de hoy y ver el resultado final (norma de la app: cierre al final)'}>{terminada ? 'Reabrir' : 'Terminar'}</button>
        {terminada && <span style={{ color: BZ.ambar }}>Terminada: todo vendido al cierre de hoy.</span>}
      </div>
    </div>)
}

// §250: el panel de OPERAR DENTRO DEL GRÁFICO (arriba a la derecha; boceto bocetos/replay-operar-multiactivo.html). Una pieza que sirve
// para cualquier gráfico: botones 🎯 Compra / 🎯 Venta (o Compra / Venta a mercado), ⚙, «Cerrar ✕» con posición, y las casillas
// Entrada · Stop · Objetivo (con 🎯 para marcar en el gráfico y ✕ para quitar) de la posición y de cada orden viva.
//   onMarcar(lado): empieza a marcar una orden nueva. onMarcarLinea(id): el próximo clic en el gráfico mueve esa línea (pos:… / viva:…).
//   onMover(id, precio | null): cambia o quita un precio. onAccion: «cerrar», «cancelar» y las órdenes a mercado.
// §254: compacto (gráficos pequeños de la rejilla con varios valores): solo los botones y una línea con lo que hay; las casillas, al ampliar.
// §258 (forma B, elegida por Sergi el 25/11): cabecera = lo mismo, en línea, sin caja, para la cabecera de cada minigráfico, con ✎
// (onEditar / editando) que despliega debajo el panel entero sin su fila de botones (sinBotones).
export function PanelGrafico({ estado, simbolo, r, ahora, total, form, captura = null, capturaLinea = null, onMarcar, onMarcarLinea, onCancelaMarca, onAccion, formMercado, onMover, arrastre = null, onCfg, cfgAbierta = false, aviso = '', style = null, autoActivo = false, compacto = false, cabecera = false, onEditar = null, editando = false, sinBotones = false }) {
  const [error, setError] = useState('')
  const f = form
  const pos = r.posiciones[simbolo]
  const vivas = (r.ordenesVivas || []).filter(o => o.simbolo === simbolo)
  const terminada = !!estado.terminada
  const mercado = (f.tipo || 'precio') === 'mercado'
  const cuando = estado.ejecucion === 'cierre' ? 'al cierre de hoy' : 'a la apertura de la vela siguiente'
  const envia = (lado) => {
    const c = compruebaOrden(formMercado ? formMercado(lado) : deMercado(f, lado, ahora), ahora)
    if (c.error) { setError(c.error); return }
    setError(''); onAccion(nuevaAccion(estado, simbolo, c.orden))
  }
  const vivo = (id, v) => (arrastre && arrastre.id === id ? arrastre.precio : v)
  const QUE = { entrada: 'la Entrada', stop: 'el Stop', objetivo: 'el Objetivo' }
  const ref = captura && f.entrada !== '' ? Number(String(f.entrada).replace(',', '.')) : ahora
  const pcS = pctFrente(Number(String(f.stop).replace(',', '.')), ref)
  const est = captura ? estima({ ...f, mercado: !f.entrada }, total, ahora) : null
  const ic = { cursor: 'pointer', borderRadius: 4, padding: '0 3px', userSelect: 'none', textAlign: 'center' }
  // Una fila de precio: «Stop  [98,00]  −3,0 %  🎯  ✕».
  const filaPrecio = (etq, id, v, refP, col, quitar) => <div key={id} style={{ display: 'grid', gridTemplateColumns: '54px 74px 50px 20px 16px', gap: 3, alignItems: 'center', marginTop: 3 }}>
    <span style={{ color: BZ.gris }}>{etq}</span>
    <CasillaPrecio valor={vivo(id, v)} dato={id} ancho={74} onFija={p => onMover(id, p)} titulo="Escribe el precio y pulsa Enter (vacía = quitarlo); o pulsa 🎯 y haz clic en el gráfico; o arrastra su línea" />
    <span style={{ color: col, fontSize: 11, textAlign: 'right' }}>{vivo(id, v) != null && refP != null ? pc(pctFrente(vivo(id, v), refP)) : ''}</span>
    <span data-marcar-linea={id} title="Marcar en el gráfico" onClick={() => onMarcarLinea && onMarcarLinea(capturaLinea === id ? null : id)} style={{ ...ic, background: capturaLinea === id ? BZ.azul : 'transparent' }}>🎯</span>
    <span data-quitar-linea={id} title={quitar} onClick={quitar ? () => onMover(id, null) : undefined} style={{ ...ic, color: BZ.rojo, visibility: quitar ? 'visible' : 'hidden' }}>✕</span>
  </div>
  if (cabecera) {
    const linea = captura ? `▶ marca ${QUE[captura]} · Esc` : pos ? `${pos.lado > 0 ? 'L' : 'C'} ${pos.acciones} · ${signo(pos.ganancia)}${eur(Math.abs(pos.ganancia))}` : vivas.length ? (vivas.length === 1 ? textoOrden(vivas[0]) : `${vivas.length} órdenes`) : ''
    const titulo = pos ? `${pos.lado > 0 ? 'Largo' : 'Corto'} ${pos.acciones} acciones a ${pr(pos.precioMedio)} · ${signo(pos.ganancia)}${eur(Math.abs(pos.ganancia))}` : vivas.map(textoOrden).join(' · ')
    const b = { ...btn(), padding: '0 6px', font: `11px/18px ${LETRA}`, fontWeight: 600 }
    return (
      <div data-panel-grafico="" data-cabecera-panel="" style={{ display: 'flex', gap: 3, alignItems: 'center', minWidth: 0, font: `11px/1.3 ${LETRA}`, color: BZ.texto, ...(style || {}) }}
        onMouseDown={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()}>
        {(linea || error) && <span data-linea-compacta="" title={error || titulo} style={{ color: error ? BZ.rojo : captura ? BZ.azul : BZ.gris, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{error ? `⚠ ${error}` : linea}{pos?.auto && !captura ? <span style={{ color: '#bc8cff' }}> · 🤖</span> : null}</span>}
        {!terminada && !captura && !pos && !vivas.length && (mercado
          ? <><button data-enviar-orden="1" style={{ ...b, background: 'rgba(63,185,80,0.25)', borderColor: BZ.verde }} onClick={() => envia(1)}>Compra</button><button data-enviar-orden="-1" style={{ ...b, background: 'rgba(248,81,73,0.25)', borderColor: BZ.rojo }} onClick={() => envia(-1)}>Venta</button></>
          : <><button data-marcar-replay="1" style={{ ...b, background: 'rgba(63,185,80,0.25)', borderColor: BZ.verde }} onClick={() => onMarcar(1)}>🎯 Compra</button><button data-marcar-replay="-1" style={{ ...b, background: 'rgba(248,81,73,0.25)', borderColor: BZ.rojo }} onClick={() => onMarcar(-1)}>🎯 Venta</button></>)}
        {(pos || vivas.length > 0) && !captura && onEditar && <button data-editar-cabecera="" title={editando ? 'Ocultar Entrada / Stop / Objetivo' : 'Ver y cambiar Entrada / Stop / Objetivo'} style={{ ...b, ...(editando ? { background: 'rgba(88,166,255,0.22)', borderColor: BZ.azul } : {}) }} onClick={() => onEditar(!editando)}>✎</button>}
        {pos && !terminada && !captura && <button data-cerrar-replay="" title={`Cerrar ${cuando}`} style={b} onClick={() => onAccion({ fecha: estado.hoy, simbolo, tipo: 'cerrar' })}>✕</button>}
        {captura && onCancelaMarca && <button onClick={onCancelaMarca} style={b}>Cancelar</button>}
        {onCfg && <button data-cfg-replay="" title="Valores por defecto: tipo de orden, stop, objetivo y tamaño" style={{ ...b, ...(cfgAbierta ? { background: 'rgba(88,166,255,0.22)', borderColor: BZ.azul } : {}) }} onClick={() => onCfg(!cfgAbierta)}>⚙</button>}
      </div>)
  }
  if (compacto) {
    const linea = captura ? `▶ marca ${QUE[captura]} · Esc cancela` : pos ? `${pos.lado > 0 ? 'Largo' : 'Corto'} ${pos.acciones} · ${signo(pos.ganancia)}${eur(Math.abs(pos.ganancia))}${pos.auto ? ' · 🤖' : ''}` : vivas.length ? `${vivas.length} orden${vivas.length === 1 ? '' : 'es'} sin ejecutar` : ''
    const b = { ...btn(), padding: '1px 6px', font: `11px ${LETRA}`, fontWeight: 600 }
    return (
      <div data-panel-grafico="" data-compacto="" style={{ background: 'rgba(44,48,59,0.92)', border: `1px solid ${BZ.borde}`, borderRadius: 6, padding: '2px 4px', font: `11px/1.3 ${LETRA}`, color: BZ.texto, maxWidth: 220, ...(style || {}) }}
        onMouseDown={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', gap: 3, alignItems: 'center', flexWrap: 'wrap' }}>
          {!terminada && !captura && (mercado
            ? <><button data-enviar-orden="1" style={{ ...b, background: 'rgba(63,185,80,0.25)', borderColor: BZ.verde }} onClick={() => envia(1)}>Compra</button><button data-enviar-orden="-1" style={{ ...b, background: 'rgba(248,81,73,0.25)', borderColor: BZ.rojo }} onClick={() => envia(-1)}>Venta</button></>
            : <><button data-marcar-replay="1" style={{ ...b, background: 'rgba(63,185,80,0.25)', borderColor: BZ.verde }} onClick={() => onMarcar(1)}>🎯 Compra</button><button data-marcar-replay="-1" style={{ ...b, background: 'rgba(248,81,73,0.25)', borderColor: BZ.rojo }} onClick={() => onMarcar(-1)}>🎯 Venta</button></>)}
          {pos && !terminada && !captura && <button data-cerrar-replay="" title={`Cerrar ${cuando}`} style={b} onClick={() => onAccion({ fecha: estado.hoy, simbolo, tipo: 'cerrar' })}>Cerrar ✕</button>}
          {captura && onCancelaMarca && <button onClick={onCancelaMarca} style={b}>Cancelar</button>}
        </div>
        {(linea || error) && <div data-linea-compacta="" style={{ color: error ? BZ.rojo : captura ? BZ.azul : BZ.gris, marginTop: 2 }}>{error ? `⚠ ${error}` : linea}</div>}
      </div>)
  }
  return (
    <div data-panel-grafico="" style={{ background: 'rgba(44,48,59,0.95)', border: `1px solid ${BZ.borde}`, borderRadius: 7, padding: '5px 6px', font: `12px/1.4 ${LETRA}`, color: BZ.texto, maxWidth: 300, boxShadow: '0 4px 14px rgba(0,0,0,0.45)', ...(style || {}) }}
      onMouseDown={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()} onWheel={e => e.stopPropagation()}>
      {!sinBotones && <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
        {!terminada && !captura && (mercado
          ? <>
            <button data-enviar-orden="1" title={`Compra a mercado ${cuando}, con el stop y el objetivo de ⚙`} style={{ ...btn(), padding: '2px 8px', background: 'rgba(63,185,80,0.25)', borderColor: BZ.verde, fontWeight: 600 }} onClick={() => envia(1)}>Compra</button>
            <button data-enviar-orden="-1" title={`Venta en corto a mercado ${cuando}, con el stop y el objetivo de ⚙`} style={{ ...btn(), padding: '2px 8px', background: 'rgba(248,81,73,0.25)', borderColor: BZ.rojo, fontWeight: 600 }} onClick={() => envia(-1)}>Venta</button>
          </>
          : <>
            <button data-marcar-replay="1" title="Compra en un precio: haz clic en el gráfico en la entrada (o doble clic en el gráfico)" style={{ ...btn(), padding: '2px 8px', background: 'rgba(63,185,80,0.25)', borderColor: BZ.verde, fontWeight: 600 }} onClick={() => onMarcar(1)}>🎯 Compra</button>
            <button data-marcar-replay="-1" title="Venta en corto en un precio: haz clic en el gráfico en la entrada" style={{ ...btn(), padding: '2px 8px', background: 'rgba(248,81,73,0.25)', borderColor: BZ.rojo, fontWeight: 600 }} onClick={() => onMarcar(-1)}>🎯 Venta</button>
          </>)}
        {pos && !terminada && !captura && <button data-cerrar-replay="" title={`Vende (o recompra el corto) ${cuando}`} style={{ ...btn(), padding: '2px 8px' }} onClick={() => onAccion({ fecha: estado.hoy, simbolo, tipo: 'cerrar' })}>Cerrar ✕</button>}
        {autoActivo && <span data-solo-activo="" title="«Ejecutar solo» está encendido: compra al salir la señal (se apaga en ⚙)" style={{ color: '#bc8cff', fontWeight: 700, fontSize: 11 }}>🤖 Solo</span>}
        {onCfg && <button data-cfg-replay="" title="Valores por defecto: tipo de orden, stop, objetivo y tamaño" style={{ ...btn(true, cfgAbierta), padding: '2px 7px', marginLeft: 'auto' }} onClick={() => onCfg(!cfgAbierta)}>⚙</button>}
      </div>}
      {captura && <div data-guia-marca="" style={{ background: 'rgba(88,166,255,0.12)', border: `1px solid ${BZ.azul}`, borderRadius: 5, padding: '4px 7px', marginTop: 5 }}>
        <span data-marcando="" style={{ color: BZ.azul, fontWeight: 700 }}>MARCANDO </span>
        {f.ladoFijo && <b style={{ color: f.lado > 0 ? BZ.verde : BZ.rojo }}>{f.lado > 0 ? 'Compra' : 'Venta'} </b>}▶ marca <b>{QUE[captura]}</b>
        {(f.entrada || f.stop) && <div style={{ color: BZ.gris }}>{f.entrada ? `Entrada ${f.entrada}` : ''}{f.stop ? ` · Stop ${f.stop}${pcS != null ? ` (${pc(pcS)})` : ''}` : ''}</div>}
        <div style={{ color: BZ.gris, fontSize: 11 }}>{captura === 'entrada' ? 'Esc cancela' : captura === 'stop' ? 'Enter: ponerla sin stop ni objetivo · Esc cancela' : 'Enter: ponerla sin objetivo · Esc cancela'}</div>
        {onCancelaMarca && <button onClick={onCancelaMarca} style={{ ...btn(), padding: '0 7px', marginTop: 3 }}>Cancelar</button>}
      </div>}
      {est && <div data-estima-replay="" style={{ color: BZ.gris, marginTop: 4 }} title="Con tu dinero de ahora; al ejecutarse se calcula con el de ese momento">
        ≈ <b style={{ color: BZ.texto }}>{est.acciones} acciones</b> ({eur(est.coste)}){est.arriesgas != null ? ` · arriesgas ${eur(est.arriesgas)}` : ''}{est.rr != null ? ` · R:R 1 : ${loc(est.rr, 1)}` : ''}</div>}
      {capturaLinea && <div data-guia-linea="" style={{ color: BZ.azul, marginTop: 4 }}>▶ Haz clic en el gráfico en el precio nuevo · Esc cancela</div>}
      {pos && <div data-posicion-replay="" style={{ marginTop: 5, borderTop: `1px solid ${BZ.borde}`, paddingTop: 4 }}>
        <div><b>Abierta #{pos.num}</b> · {pos.lado > 0 ? 'Largo' : 'Corto'} {pos.acciones} a {pr(pos.precioMedio)} · <b style={{ color: color(pos.ganancia) }}>{signo(pos.ganancia)}{eur(Math.abs(pos.ganancia))}</b>{pos.auto ? <span style={{ color: '#bc8cff' }}> · 🤖</span> : null}</div>
        {pos.sigue && <div data-sigue-pos="" style={{ color: BZ.gris, fontSize: 11 }}>El stop sigue al precio: {(TIPOS_SIGUE.find(x => x.tipo === pos.sigue.tipo) || {}).nombre}</div>}
        {onMover && !terminada
          ? <div data-precios-posicion="">{filaPrecio('Stop', `pos:${simbolo}:stop`, pos.stop, pos.precioMedio, BZ.rojo, 'Quitar el stop')}{filaPrecio('Objetivo', `pos:${simbolo}:objetivo`, pos.objetivo, pos.precioMedio, BZ.verde, 'Quitar el objetivo')}</div>
          : <div style={{ color: BZ.gris }}>Stop {pr(pos.stop)} · objetivo {pr(pos.objetivo)}</div>}
      </div>}
      {vivas.length > 0 && <div data-ordenes-vivas="" style={{ marginTop: 5 }}>
        {vivas.map(o => { const refO = o.entrada == null ? ahora : vivo(`viva:${o.id}:entrada`, o.entrada)
          return <div key={o.id} style={{ borderTop: `1px solid ${BZ.borde}`, paddingTop: 4, marginTop: 4 }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ flex: 1 }}>{textoOrden(o)}</span>
              {!terminada && <span data-cancelar={o.id} title="Cancelar la orden" onClick={() => onAccion({ fecha: estado.hoy, tipo: 'cancelar', id: o.id })} style={{ ...ic, color: BZ.rojo }}>✕</span>}
            </div>
            {onMover && !terminada && <div data-precios-viva={o.id}>
              {o.entrada != null && filaPrecio('Entrada', `viva:${o.id}:entrada`, o.entrada, null, BZ.azul, null)}
              {filaPrecio('Stop', `viva:${o.id}:stop`, o.stop, refO, BZ.rojo, 'Quitar el stop')}
              {filaPrecio('Objetivo', `viva:${o.id}:objetivo`, o.objetivo, refO, BZ.verde, 'Quitar el objetivo')}
            </div>}
          </div> })}
      </div>}
      {(error || aviso) && <div data-error-orden="" style={{ color: error ? BZ.rojo : BZ.ambar, marginTop: 4 }}>⚠ {error || aviso}</div>}
    </div>)
}

// ── Debajo del gráfico ──
function Curva({ curva, buyHold, cif, nombreBH = 'Buy&Hold', indice = null }) {
  const W = 900, H = 200, P = 34
  if (curva.length < 2) return <div style={{ color: BZ.gris, padding: 10 }}>Avanza alguna vela para ver la curva.</div>
  const todos = [...curva.map(c => c.valor), ...buyHold.map(b => b.valor)]
  const lo = Math.min(...todos), hi = Math.max(...todos), y = v => H - P / 2 - (v - lo) / (hi - lo || 1) * (H - P), x = i => P + i * (W - P - 8) / (curva.length - 1)
  const linea = (s) => s.map((c, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(c.valor).toFixed(1)}`).join('')
  return (
    <div data-curva-replay="">
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 200, display: 'block' }}>
        <text x={4} y={12} fill={BZ.gris} fontSize="11">{eur(hi)}</text><text x={4} y={H - 4} fill={BZ.gris} fontSize="11">{eur(lo)}</text>
        {buyHold.length > 1 && <path d={linea(buyHold)} fill="none" stroke={BZ.ambar} strokeWidth="1.2" strokeDasharray="4 3" />}
        <path d={linea(curva)} fill="none" stroke={BZ.azul} strokeWidth="1.8" />
      </svg>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', color: BZ.gris, fontSize: 12 }}>
        <span><span style={{ color: BZ.azul }}>━</span> Tu dinero</span><span><span style={{ color: BZ.ambar }}>┅</span> {nombreBH}</span>{indice != null && <span>S&P 500 hoy: {eur(indice)}</span>}
        <span data-caida-replay="">Peor caída <b style={{ color: BZ.rojo }}>{pc(cif.peorCaida)}</b> ({signo(cif.peorCaidaEur)}{eur(Math.abs(cif.peorCaidaEur))}) el {fmt(cif.fechaPeorCaida)}</span>
        <span>Caída más larga: {cif.caidaMasLarga} velas sin volver al máximo</span>
        <span>Factor de beneficio {cif.factorBeneficio == null ? '—' : cif.factorBeneficio === Infinity ? '∞' : pr(cif.factorBeneficio)}</span>
      </div>
    </div>)
}

// §233: onQuitar(op) quita una operación (cerrada o la abierta) del historial: la papelera pregunta en la fila («¿Quitarla? Sí / No»).
// §251: la tabla sale con la ÚLTIMA operación arriba y cada columna se ordena pulsando su título (otra vez, al revés); la abierta, siempre
// arriba. Columna «Capital invertido» (acciones × precio de entrada) y las cifras centradas.
export const COLUMNAS_OPS = [
  { id: 'num', t: '#', v: o => o.num }, { id: 'simbolo', t: 'Valor', v: o => o.simbolo }, { id: 'lado', t: 'Lado', v: o => o.lado },
  { id: 'fechaEntrada', t: 'Entra', v: o => o.fechaEntrada }, { id: 'precioEntrada', t: 'Precio', v: o => o.precioEntrada },
  { id: 'fechaSalida', t: 'Sale', v: o => o.fechaSalida }, { id: 'precioSalida', t: 'Precio', v: o => o.precioSalida },
  { id: 'acciones', t: 'Acciones', v: o => o.acciones }, { id: 'capital', t: 'Capital invertido', v: o => o.acciones * o.precioEntrada },
  { id: 'resultado', t: 'Resultado', v: o => o.resultado }, { id: 'pct', t: '%', v: o => o.pct }, { id: 'motivo', t: 'Cómo salió', v: o => o.motivo },
]
export function ordenaOps(ops, orden) {
  const c = COLUMNAS_OPS.find(x => x.id === orden.col) || COLUMNAS_OPS[0], s = orden.dir === 'asc' ? 1 : -1
  return [...ops].sort((a, b) => { const x = c.v(a), y = c.v(b); const d = x == null ? (y == null ? 0 : 1) : y == null ? -1 : typeof x === 'string' ? x.localeCompare(y, 'es') : x - y; return d * s || (b.num - a.num) })
}
// §254: varios = Replay con varios valores: todas las posiciones abiertas, pestaña «Por valor» y la curva del Buy&Hold de la lista (cif.buyHold.curva).
export function ResultadosReplay({ estado, r, cif, velas, simbolo, onQuitar = null, varios = false, indice = null }) {
  const [vista, setVista] = useState('ops')
  const [orden, setOrden] = useState({ col: 'num', dir: 'desc' })
  const pulsaCol = (id) => setOrden(o => o.col === id ? { col: id, dir: o.dir === 'desc' ? 'asc' : 'desc' } : { col: id, dir: ['simbolo', 'motivo', 'lado'].includes(id) ? 'asc' : 'desc' })
  const [quitando, setQuitando] = useState(null)
  // §252: las de «Ejecutar solo» no se quitan una a una (las pone la señal): sin papelera, con 🤖.
  const papelera = (num, op) => op?.auto ? <td style={{ ...td, textAlign: 'center' }} title="La abrió «Ejecutar solo»">🤖</td> : !onQuitar || estado.terminada ? <td style={td} /> : <td style={{ ...td, whiteSpace: 'nowrap' }}>
    {quitando === num
      ? <span><span style={{ color: BZ.rojo }}>¿Quitarla? </span><button data-si-quitar={num} style={{ ...btn(), padding: '0 7px', color: BZ.rojo, borderColor: BZ.rojo }} onClick={() => { setQuitando(null); onQuitar(op) }}>Sí</button> <button style={{ ...btn(), padding: '0 7px' }} onClick={() => setQuitando(null)}>No</button></span>
      : <button data-quitar-op={num} title="Quitar esta operación del historial (como si no la hubieras hecho): desaparece del gráfico y de la curva" onClick={() => setQuitando(num)} style={{ ...btn(), display: 'flex', padding: '1px 5px' }}><Papelera tamano={14} /></button>}
  </td>
  const cm = estado.comision || 0, vs = (velas || []).filter(v => v.date >= estado.desde && v.date <= estado.hoy)
  const q = vs.length ? Math.floor((estado.capitalInicial - cm) / vs[0].close) : 0
  const bh = varios ? (cif.buyHold?.curva || []) : q > 0 ? vs.map(v => ({ fecha: v.date, valor: estado.capitalInicial - cm - q * vs[0].close + q * v.close })) : []
  const th = { textAlign: 'left', color: BZ.gris, fontWeight: 500, padding: '4px 8px', borderBottom: `1px solid ${BZ.borde}` }
  const td = { padding: '4px 8px', borderBottom: `1px solid ${BZ.caja}` }, tdc = { ...td, textAlign: 'center' }
  const tab = (id, txt) => <button onClick={() => setVista(id)} data-vista-replay={id} style={{ ...btn(true, vista === id), borderRadius: 6 }}>{txt}</button>
  const abiertas = varios ? Object.entries(r.posiciones || {}).sort((a, b) => b[1].num - a[1].num) : (r.posiciones[simbolo] ? [[simbolo, r.posiciones[simbolo]]] : [])
  const resumen = varios ? porValor(r, estado.valores) : []
  return (
    <div data-resultados-replay="" style={{ background: BZ.fondo, padding: '8px 10px', font: `13px/1.45 ${LETRA}`, color: BZ.texto }}>
      <div style={{ display: 'flex', gap: 4 }}>{tab('ops', `Operaciones · ${r.operaciones.length}`)}{varios && tab('valor', 'Por valor')}{tab('curva', 'Curva del capital')}</div>
      <div style={{ ...cajaSt }}>
        {vista === 'ops' ? <>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{COLUMNAS_OPS.map(c => <th key={c.id} data-col-ops={c.id} onClick={() => pulsaCol(c.id)} title="Pulsa para ordenar por esta columna (otra vez, al revés)" style={{ ...th, textAlign: 'center', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', color: orden.col === c.id ? BZ.azul : BZ.gris }}>{c.t}{orden.col === c.id ? (orden.dir === 'desc' ? ' ▼' : ' ▲') : ''}</th>)}<th style={th} /></tr></thead>
            <tbody>
              {abiertas.map(([sim, pos]) => <tr key={`a${pos.num}`} data-fila-abierta={sim} style={{ color: BZ.gris }}><td style={tdc}>{pos.num}</td><td style={tdc}>{sim}</td><td style={tdc}>{pos.lado > 0 ? 'Largo' : 'Corto'}</td><td style={tdc}>{fmt(pos.fecha)}</td>
                <td style={tdc}>{pr(pos.precioMedio)}</td><td style={tdc} colSpan={2}>abierta</td><td style={tdc}>{pos.acciones}</td><td style={tdc}>{eur(pos.acciones * pos.precioMedio)}</td>
                <td style={{ ...tdc, color: color(pos.ganancia) }}>{signo(pos.ganancia)}{eur(Math.abs(pos.ganancia), 2)}</td><td style={tdc} colSpan={2}>sin vender</td>{papelera(pos.num, { ids: pos.ids, simbolo: sim, fechaSalida: null, auto: pos.auto })}</tr>)}
              {ordenaOps(r.operaciones, orden).map(o => <tr key={o.num} data-fila-op={o.num}>
                <td style={tdc}>{o.num}</td><td style={tdc}>{o.simbolo}</td><td style={tdc}>{o.lado > 0 ? 'Largo' : 'Corto'}</td><td style={tdc}>{fmt(o.fechaEntrada)}</td>
                <td style={tdc}>{pr(o.precioEntrada)}</td><td style={tdc}>{fmt(o.fechaSalida)}</td><td style={tdc}>{pr(o.precioSalida)}</td>
                <td style={tdc}>{o.acciones}</td><td style={tdc}>{eur(o.acciones * o.precioEntrada)}</td><td style={{ ...tdc, color: color(o.resultado) }}>{signo(o.resultado)}{eur(Math.abs(o.resultado), 2)}</td>
                <td style={{ ...tdc, color: color(o.resultado) }}>{signo(o.pct)}{pc(Math.abs(o.pct))}</td><td style={tdc}>{o.motivo}</td>{papelera(o.num, o)}</tr>)}
              {!r.operaciones.length && !abiertas.length && <tr><td colSpan={13} style={{ ...td, color: BZ.gris }}>Aún no has operado.</td></tr>}
            </tbody>
          </table>
          <div style={{ color: BZ.gris, fontSize: 12, marginTop: 6 }}>Con comisiones ({cm ? `${com(cm)} € por orden` : 'ninguna'}), sin impuestos. {r.ordenes} órdenes, {eur(r.comisiones, 2)} de comisiones.</div>
        </> : vista === 'valor' ? <table data-por-valor="" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>{['Valor', 'Operaciones', 'Ganadoras', 'Resultado (con comisiones)', 'Abierta, ahora'].map(h => <th key={h} style={{ ...th, textAlign: 'center' }}>{h}</th>)}</tr></thead>
          <tbody>{resumen.map(x => <tr key={x.simbolo} data-fila-valor={x.simbolo}><td style={tdc}><b>{x.simbolo}</b></td><td style={tdc}>{x.operaciones}</td><td style={tdc}>{x.operaciones ? pc(x.ganadoras / x.operaciones * 100, 0) : '—'}</td>
            <td style={{ ...tdc, color: color(x.resultado) }}>{x.operaciones ? `${signo(x.resultado)}${eur(Math.abs(x.resultado), 2)}` : '—'}</td><td style={{ ...tdc, color: x.abierta == null ? BZ.gris : color(x.abierta) }}>{x.abierta == null ? '—' : `${signo(x.abierta)}${eur(Math.abs(x.abierta), 2)}`}</td></tr>)}</tbody></table>
          : <Curva curva={r.curva} buyHold={bh} cif={cif} nombreBH={varios ? 'Buy&Hold de la lista' : 'Buy&Hold'} indice={indice} />}
      </div>
    </div>)
}
