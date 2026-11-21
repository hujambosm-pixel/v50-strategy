// components/PanelReplay.js — OPERAR en el Replay (docs/builder.md §228; boceto bocetos/replay-simulacion.html v2).
// PanelOperar: el panel de la derecha (cifras, posición abierta, nueva orden, órdenes vivas, avisos, Terminar).
// ResultadosReplay: debajo del gráfico, pestañas «Operaciones · N» y «Curva del capital».
// Todo sale de lib/replay/motor.js (calcula y cifras); esto solo pinta y avisa (onAccion, onTerminar).
// §229: el formulario puede venir de fuera (form + onForm, lo lleva pages/index.js para que el gráfico lo rellene con 🎯 / doble clic y
// arrastrando las líneas); sin ellos, el panel guarda el suyo. §233: sin «Enviar orden» para las de un precio: lo marcado en el gráfico ES la orden.
import { useState } from 'react'
import Ayuda from './BuilderAyuda'
import { compruebaOrden, nuevaAccion, textoOrden } from '../lib/replay/orden'
import { FORM_INICIAL, estima, pctFrente, redondea } from '../lib/replay/borrador'
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

export const AYUDA_ORDEN = 'EN UN PRECIO (🎯 o doble clic): tres clics en el gráfico, Entrada, Stop y Objetivo, y la orden se pone sola al marcar el Objetivo (Enter: sin objetivo; tras la entrada, sin stop ni objetivo). Compra si el stop queda por debajo de la entrada; corto si queda por encima. Entrada por debajo del precio de ahora = orden LÍMITE (compra si baja hasta ahí); por encima = orden STOP (compra si sube hasta ahí, una ruptura); en corto, al revés. Sigue viva hasta que se cumple o la cancelas; sus líneas y sus casillas se pueden cambiar. Si la vela abre ya más allá, se ejecuta a la apertura.\n\n' +
  'A MERCADO: «Comprar a mercado» (o «Vender en corto a mercado») a la apertura de la vela siguiente (o al cierre de hoy, si lo elegiste al empezar), con stop y objetivo opcionales.\n\n' +
  'STOP y OBJETIVO: se vende al tocarlos; si la vela abre ya al otro lado (hueco), a la apertura. Si en la misma vela se tocan los dos, cuenta el stop (lo prudente).\n\n' +
  'TAMAÑO: «Invertir X %» del dinero total en el momento de ejecutarse; «Arriesgar X %» = lo que perderías si salta el stop. Siempre se redondea hacia abajo.\n' +
  'Ejemplo: tienes 10.000 € y compras a 96 con stop en 90 arriesgando un 1 %: 100 € ÷ (96 − 90) = 16,7 → 16 acciones (1.536 €).'

function Cifra({ titulo, valor, col, tip }) {
  return <div title={tip} style={{ background: BZ.caja, borderRadius: 6, padding: '5px 7px' }}><small style={{ display: 'block', color: BZ.gris, fontSize: 11 }}>{titulo}</small><b style={{ fontSize: 14, color: col || BZ.texto }}>{valor}</b></div>
}

// §230: casilla de precio de una orden ya enviada o de la posición. Muestra el precio de ahora (o el de la línea mientras se arrastra);
// al escribir, se fija con Enter o al salir de la casilla (vacía = quitar). Esc deja el que había.
function CasillaPrecio({ valor, onFija, dato, titulo }) {
  const [txt, setTxt] = useState(null)
  const muestra = txt != null ? txt : (valor == null ? '' : String(redondea(valor)).replace('.', ','))
  const fija = () => { if (txt == null) return; const t = txt.trim(); setTxt(null); onFija(t === '' ? null : Number(t.replace(',', '.'))) }
  return <input data-casilla-viva={dato} title={titulo} style={{ ...casilla, width: 80 }} placeholder="—" value={muestra} onChange={e => setTxt(e.target.value)} onBlur={fija}
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

export function PanelOperar({ estado, simbolo, r, cif, ahora, onAccion, onTerminar, form, onForm, captura = null, onMarcar, onCancelaMarca, aviso = '', onMover, arrastre = null, nombre = null, onNombre, guardado = '', onMisReplays }) {
  const [propio, setPropio] = useState(FORM_INICIAL)
  const f = form || propio, setF = onForm || setPropio
  const [error, setError] = useState('')
  const pon = (k, v) => { setError(''); setF(x => ({ ...x, [k]: v })) }
  const pos = r.posiciones[simbolo]
  const terminada = !!estado.terminada
  const envia = () => {
    const c = compruebaOrden({ ...f, mercado: true }, ahora)
    if (c.error) { setError(c.error); return }
    onAccion(nuevaAccion(estado, simbolo, c.orden)); setF(x => ({ ...x, entrada: '', stop: '', objetivo: '' })); onCancelaMarca && onCancelaMarca()
  }
  const ref = captura && f.entrada !== '' ? Number(String(f.entrada).replace(',', '.')) : ahora
  const est = estima(captura ? { ...f, mercado: !f.entrada } : { ...f, mercado: true }, cif.final, ahora)
  const pcS = pctFrente(Number(String(f.stop).replace(',', '.')), ref), pcO = pctFrente(Number(String(f.objetivo).replace(',', '.')), ref)
  const QUE = { entrada: 'la Entrada', stop: 'el Stop', objetivo: 'el Objetivo' }
  // El precio que se ve en la casilla de una línea: el de la línea mientras se arrastra.
  const vivo = (id, v) => (arrastre && arrastre.id === id ? arrastre.precio : v)
  const editable = !!onMover && !terminada
  const filaPrecio = (etq, id, v, ref, col) => <>
    <span>{etq}</span>
    <span><CasillaPrecio valor={vivo(id, v)} dato={id} onFija={p => onMover(id, p)} titulo="Escribe el precio y pulsa Enter (vacía = quitarlo); o arrastra su línea en el gráfico" />
      {vivo(id, v) != null && ref != null && <span style={{ color: col, marginLeft: 6 }}>{pc(pctFrente(vivo(id, v), ref))}</span>}</span>
  </>
  const cuando = estado.ejecucion === 'cierre' ? 'al cierre de hoy' : 'a la apertura de la vela siguiente'
  return (
    <div data-panel-replay="" style={{ padding: '8px 10px', font: `13px/1.45 ${LETRA}`, color: BZ.texto }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <b style={{ color: '#ffd166' }}>⏪ REPLAY · {simbolo}</b>
        <span style={{ marginLeft: 'auto', color: BZ.gris, fontSize: 12 }}>{estado.comision ? `${com(estado.comision)} € por orden` : 'sin comisión'}</span>
      </div>
      {nombre != null && <NombreReplay nombre={nombre} onNombre={onNombre} guardado={guardado} onMisReplays={onMisReplays} />}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 8 }} data-cifras-replay="">
        <Cifra titulo="Tu dinero" valor={eur(cif.final)} tip={`Empezaste con ${eur(estado.capitalInicial)}`} />
        <Cifra titulo="Ganancia" valor={`${signo(cif.ganancia)}${eur(Math.abs(cif.ganancia))} · ${pc(cif.pct)}`} col={color(cif.ganancia)} />
        <Cifra titulo="Liquidez" valor={eur(r.caja)} />
        <Cifra titulo={`Buy&Hold ${simbolo}`} valor={eur(cif.buyHold?.final)} tip="Comprar al cierre del primer día que viste y vender hoy, con el mismo dinero y pagando las dos comisiones" />
        <Cifra titulo="Peor caída" valor={pc(cif.peorCaida)} col={cif.peorCaida < 0 ? BZ.rojo : BZ.texto} />
        <Cifra titulo="Operaciones" valor={`${cif.operaciones}${cif.ganadoras != null ? ` · ${pc(cif.ganadoras, 0)} ganan` : ''}`} />
      </div>
      {pos && <div style={cajaSt} data-posicion-replay="">
        <b>Abierta #{pos.num}</b> · {pos.lado > 0 ? 'Largo' : 'Corto'} {pos.acciones} a {pr(pos.precioMedio)} desde el {fmt(pos.fecha)}
        {editable
          ? <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 8px', alignItems: 'center', margin: '4px 0' }} data-precios-posicion="">
              {filaPrecio('Stop', `pos:${simbolo}:stop`, pos.stop, pos.precioMedio, BZ.rojo)}
              {filaPrecio('Objetivo', `pos:${simbolo}:objetivo`, pos.objetivo, pos.precioMedio, BZ.verde)}
            </div>
          : <div style={{ color: BZ.gris }}>Stop {pr(pos.stop)} · objetivo {pr(pos.objetivo)}</div>}
        <div>Ahora: <b style={{ color: color(pos.ganancia) }}>{signo(pos.ganancia)}{eur(Math.abs(pos.ganancia))}</b></div>
        {!terminada && <button style={{ ...btn(), marginTop: 6 }} data-cerrar-replay="" onClick={() => onAccion({ fecha: estado.hoy, simbolo, tipo: 'cerrar' })}
          title={`Vende (o recompra el corto) ${cuando}`}>Cerrar a mercado</button>}
      </div>}
      {!terminada && <div style={cajaSt} data-nueva-orden="">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          <b>Nueva orden</b><Ayuda texto={AYUDA_ORDEN} etiqueta="Cómo funcionan las órdenes" />
          {captura && <span data-marcando="" style={{ color: BZ.azul, fontWeight: 700, fontSize: 12 }}>MARCANDO</span>}
        </div>
        <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
          <button style={btn(true, f.lado > 0)} onClick={() => pon('lado', 1)} data-lado="1">Comprar</button>
          <button style={btn(true, f.lado < 0)} onClick={() => pon('lado', -1)} data-lado="-1">Vender en corto</button>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8 }}>
          <select value={f.modo} onChange={e => pon('modo', e.target.value)} style={{ ...casilla, width: 'auto' }} data-modo="">
            <option value="invertir">Invertir</option><option value="arriesgar">Arriesgar</option>
          </select>
          <span><input data-pct="" style={{ ...casilla, width: 60 }} value={f.pct} onChange={e => pon('pct', e.target.value)} /> % del dinero</span>
        </div>
        {/* §233: en un precio, se marca en el gráfico y la orden se pone sola (sin «Enviar orden»). */}
        {onMarcar && (captura
          ? <div data-guia-marca="" style={{ background: 'rgba(88,166,255,0.12)', border: `1px solid ${BZ.azul}`, borderRadius: 5, padding: '5px 8px', marginBottom: 6 }}>
              ▶ Clic en el gráfico para marcar <b>{QUE[captura]}</b>.
              {(f.entrada || f.stop) && <div style={{ color: BZ.gris, fontSize: 12 }}>{f.entrada ? `Entrada ${f.entrada}` : ''}{f.stop ? ` · Stop ${f.stop}${pcS != null ? ` (${pc(pcS)})` : ''}` : ''}</div>}
              <div style={{ color: BZ.gris, fontSize: 12 }}>{captura === 'entrada' ? 'Esc cancela.' : captura === 'stop' ? 'Enter: ponerla sin stop ni objetivo · Esc cancela.' : 'Enter: ponerla sin objetivo · Esc cancela.'}</div>
              {onCancelaMarca && <button onClick={onCancelaMarca} style={{ ...btn(), padding: '0 7px', marginTop: 4 }}>Cancelar</button>}
            </div>
          : <div style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button data-marcar-replay="" style={{ ...btn(), borderColor: BZ.azul }} onClick={onMarcar} title="Tres clics en el gráfico: Entrada, Stop y Objetivo. La orden se pone sola al marcar el Objetivo">🎯 Marcar en el gráfico</button>
                <span style={{ color: BZ.gris, fontSize: 12 }}>o doble clic en el gráfico</span>
              </div>
              <div style={{ color: BZ.gris, fontSize: 12, marginTop: 3 }}>Orden en un precio: Entrada, Stop y Objetivo; se pone sola al marcar el Objetivo.</div>
            </div>)}
        {!captura && <>
          <div style={{ borderTop: `1px solid ${BZ.borde}`, paddingTop: 8, marginTop: 4 }}><b style={{ fontSize: 12 }}>A mercado</b> <span style={{ color: BZ.gris, fontSize: 12 }}>· se ejecuta {cuando}</span></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 8px', alignItems: 'center', marginTop: 4 }}>
            <span>Stop</span><span><input data-stop="" style={casilla} placeholder="opcional" value={f.stop} onChange={e => pon('stop', e.target.value)} />{pcS != null && <span style={{ color: BZ.rojo, marginLeft: 6 }}>{pc(pcS)}</span>}</span>
            <span>Objetivo</span><span><input data-objetivo="" style={casilla} placeholder="opcional" value={f.objetivo} onChange={e => pon('objetivo', e.target.value)} />{pcO != null && <span style={{ color: BZ.verde, marginLeft: 6 }}>{pc(pcO)}</span>}</span>
          </div>
        </>}
        {est && <div data-estima-replay="" style={{ color: BZ.gris, fontSize: 12, marginTop: 6 }} title="Con tu dinero de ahora; al ejecutarse se calcula con el de ese momento">
          ≈ <b style={{ color: BZ.texto }}>{est.acciones} acciones</b> ({eur(est.coste)}){est.arriesgas != null ? ` · arriesgas ${eur(est.arriesgas)}` : ''}{est.rr != null ? ` · R:R 1 : ${loc(est.rr, 1)}` : ''}</div>}
        {error && <div data-error-orden="" style={{ color: BZ.rojo, marginTop: 6 }}>⚠ {error}</div>}
        {!captura && <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          <button data-enviar-orden="" style={{ ...btn(), background: f.lado > 0 ? 'rgba(63,185,80,0.25)' : 'rgba(248,81,73,0.25)', borderColor: f.lado > 0 ? BZ.verde : BZ.rojo }} onClick={envia}>{f.lado > 0 ? 'Comprar a mercado' : 'Vender en corto a mercado'}</button>
        </div>}
      </div>}
      {r.ordenesVivas.length > 0 && <div style={cajaSt} data-ordenes-vivas="">
        <b>Órdenes vivas</b>
        {r.ordenesVivas.map(o => <div key={o.id} style={{ marginTop: 4 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ flex: 1 }}>{textoOrden(o)}</span>
            {!terminada && <button title="Cancelar la orden" data-cancelar={o.id} onClick={() => onAccion({ fecha: estado.hoy, tipo: 'cancelar', id: o.id })} style={{ ...btn(), padding: '0 7px', color: BZ.rojo }}>✕</button>}
          </div>
          {editable && <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 8px', alignItems: 'center', margin: '4px 0 2px' }} data-precios-viva={o.id}>
            {o.entrada != null && filaPrecio('Entrada', `viva:${o.id}:entrada`, o.entrada, null, BZ.azul)}
            {filaPrecio('Stop', `viva:${o.id}:stop`, o.stop, o.entrada == null ? ahora : vivo(`viva:${o.id}:entrada`, o.entrada), BZ.rojo)}
            {filaPrecio('Objetivo', `viva:${o.id}:objetivo`, o.objetivo, o.entrada == null ? ahora : vivo(`viva:${o.id}:entrada`, o.entrada), BZ.verde)}
          </div>}
        </div>)}
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

// ── Debajo del gráfico ──
function Curva({ curva, buyHold, cif }) {
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
        <span><span style={{ color: BZ.azul }}>━</span> Tu dinero</span><span><span style={{ color: BZ.ambar }}>┅</span> Buy&Hold</span>
        <span data-caida-replay="">Peor caída <b style={{ color: BZ.rojo }}>{pc(cif.peorCaida)}</b> ({signo(cif.peorCaidaEur)}{eur(Math.abs(cif.peorCaidaEur))}) el {fmt(cif.fechaPeorCaida)}</span>
        <span>Caída más larga: {cif.caidaMasLarga} velas sin volver al máximo</span>
        <span>Factor de beneficio {cif.factorBeneficio == null ? '—' : cif.factorBeneficio === Infinity ? '∞' : pr(cif.factorBeneficio)}</span>
      </div>
    </div>)
}

// §233: onQuitar(op) quita una operación (cerrada o la abierta) del historial: la papelera pregunta en la fila («¿Quitarla? Sí / No»).
export function ResultadosReplay({ estado, r, cif, velas, simbolo, onQuitar = null }) {
  const [vista, setVista] = useState('ops')
  const [quitando, setQuitando] = useState(null)
  const papelera = (num, op) => !onQuitar || estado.terminada ? <td style={td} /> : <td style={{ ...td, whiteSpace: 'nowrap' }}>
    {quitando === num
      ? <span><span style={{ color: BZ.rojo }}>¿Quitarla? </span><button data-si-quitar={num} style={{ ...btn(), padding: '0 7px', color: BZ.rojo, borderColor: BZ.rojo }} onClick={() => { setQuitando(null); onQuitar(op) }}>Sí</button> <button style={{ ...btn(), padding: '0 7px' }} onClick={() => setQuitando(null)}>No</button></span>
      : <button data-quitar-op={num} title="Quitar esta operación del historial (como si no la hubieras hecho): desaparece del gráfico y de la curva" onClick={() => setQuitando(num)} style={{ ...btn(), display: 'flex', padding: '1px 5px' }}><Papelera tamano={14} /></button>}
  </td>
  const cm = estado.comision || 0, vs = (velas || []).filter(v => v.date >= estado.desde && v.date <= estado.hoy)
  const q = vs.length ? Math.floor((estado.capitalInicial - cm) / vs[0].close) : 0
  const bh = q > 0 ? vs.map(v => ({ fecha: v.date, valor: estado.capitalInicial - cm - q * vs[0].close + q * v.close })) : []
  const th = { textAlign: 'left', color: BZ.gris, fontWeight: 500, padding: '4px 8px', borderBottom: `1px solid ${BZ.borde}` }
  const td = { padding: '4px 8px', borderBottom: `1px solid ${BZ.caja}` }
  const tab = (id, txt) => <button onClick={() => setVista(id)} data-vista-replay={id} style={{ ...btn(true, vista === id), borderRadius: 6 }}>{txt}</button>
  const pos = r.posiciones[simbolo]
  return (
    <div data-resultados-replay="" style={{ background: BZ.fondo, padding: '8px 10px', font: `13px/1.45 ${LETRA}`, color: BZ.texto }}>
      <div style={{ display: 'flex', gap: 4 }}>{tab('ops', `Operaciones · ${r.operaciones.length}`)}{tab('curva', 'Curva del capital')}</div>
      <div style={{ ...cajaSt }}>
        {vista === 'ops' ? <>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{['#', 'Valor', 'Lado', 'Entra', 'Precio', 'Sale', 'Precio', 'Acciones', 'Resultado', '%', 'Cómo salió', ''].map((h, i) => <th key={i} style={{ ...th, textAlign: i >= 4 && i !== 5 && i !== 10 ? 'right' : 'left' }}>{h}</th>)}</tr></thead>
            <tbody>
              {r.operaciones.map(o => <tr key={o.num}>
                <td style={td}>{o.num}</td><td style={td}>{o.simbolo}</td><td style={td}>{o.lado > 0 ? 'Largo' : 'Corto'}</td><td style={td}>{fmt(o.fechaEntrada)}</td>
                <td style={{ ...td, textAlign: 'right' }}>{pr(o.precioEntrada)}</td><td style={td}>{fmt(o.fechaSalida)}</td><td style={{ ...td, textAlign: 'right' }}>{pr(o.precioSalida)}</td>
                <td style={{ ...td, textAlign: 'right' }}>{o.acciones}</td><td style={{ ...td, textAlign: 'right', color: color(o.resultado) }}>{signo(o.resultado)}{eur(Math.abs(o.resultado), 2)}</td>
                <td style={{ ...td, textAlign: 'right', color: color(o.resultado) }}>{signo(o.pct)}{pc(Math.abs(o.pct))}</td><td style={td}>{o.motivo}</td>{papelera(o.num, o)}</tr>)}
              {pos && <tr style={{ color: BZ.gris }}><td style={td}>{pos.num}</td><td style={td}>{simbolo}</td><td style={td}>{pos.lado > 0 ? 'Largo' : 'Corto'}</td><td style={td}>{fmt(pos.fecha)}</td>
                <td style={{ ...td, textAlign: 'right' }}>{pr(pos.precioMedio)}</td><td style={td} colSpan={2}>abierta</td><td style={{ ...td, textAlign: 'right' }}>{pos.acciones}</td>
                <td style={{ ...td, textAlign: 'right', color: color(pos.ganancia) }}>{signo(pos.ganancia)}{eur(Math.abs(pos.ganancia), 2)}</td><td style={td} colSpan={2}>sin vender</td>{papelera(pos.num, { ids: pos.ids, simbolo, fechaSalida: null })}</tr>}
              {!r.operaciones.length && !pos && <tr><td colSpan={12} style={{ ...td, color: BZ.gris }}>Aún no has operado.</td></tr>}
            </tbody>
          </table>
          <div style={{ color: BZ.gris, fontSize: 12, marginTop: 6 }}>Con comisiones ({cm ? `${com(cm)} € por orden` : 'ninguna'}), sin impuestos. {r.ordenes} órdenes, {eur(r.comisiones, 2)} de comisiones.</div>
        </> : <Curva curva={r.curva} buyHold={bh} cif={cif} />}
      </div>
    </div>)
}
