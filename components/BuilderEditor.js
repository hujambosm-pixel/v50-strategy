// components/BuilderEditor.js — el paso 1 del Builder, «Crear la estrategia»: el EDITOR POR TARJETAS (V9.1043, V9.1044;
// docs/builder.md, §10 y §11), con el estilo de lib/builder/estilo.js. Es otra forma de ver y editar la MISMA definición del
// editor visual (formato 1, motor 1): leer no cambia nada y cada tarjeta reescribe solo su parte (lib/builder/tarjetas.js). Tres
// columnas (en móvil, una debajo de otra): el catálogo de condiciones; las tarjetas «Solo opero cuando…», «Compro cuando…»,
// «Vendo cuando…», «Cómo compro» (V9.1045), «Protección» y la línea de ejecución; y «La regla, en una frase», la comprobación y «Guardar y pasar al paso 2».
// Cada fila va en UNA línea: solo se editan los números, el símbolo y el tipo de media (los desplegables llevan width: auto,
// porque la hoja de estilos de la app les pone width: 100%). Lo poco habitual (orden límite, compra al cierre, el optimizador y
// sus rangos, piezas que se encienden con un parámetro) no está aquí: se conserva siempre y se ve en el Editor clásico (la pestaña
// «Editor»). Guardar es lo mismo que en el editor de siempre (/api/strategies, que valida otra vez); si la estrategia ya está en
// una prueba congelada y cambia su regla, se crea una versión nueva (lib/builder/versiones.js).
// V9.1054: todo eso es la pestaña «Tarjetas»; al lado, «Señales en el gráfico» (components/BuilderSenales.js, con las cifras de
// «Backtest de un valor» y las casillas para probar números sin tocar la estrategia) y «Dibujo de la regla» (components/BuilderDibujo.js).
//   fila: la estrategia de partida ({ id?, name, description, definition, params, copiaDe? }). lotes: las filas de editor_lotes.
//   onEditorClasico(fila): abre lo que se está editando en el Editor clásico.
//   Para las pruebas de montaje: estadoInicial (lo editado: { def, valores, nombre, descripcion }), enPruebaInicial (los nombres
//   de las pruebas donde está; si no, se buscan por la huella) y buscarInicial.
import { useState, useEffect, useMemo, useRef } from 'react'
import { B, S } from '../lib/builder/estilo'
import { CONDICIONES_EDITOR, validaDefinicion, valoresDe, esquemaDe, huellaDefinicion, paraHuella } from '../lib/editor/definicion'
import { jsonCanonico } from '../lib/lotesLab'
import { GRUPOS, buscaCatalogo, nombreCond, explicacionCond, filaNueva, soloDelValor, avisoSoloValor, ayudaFila, AYUDA_NO, AYUDA_CRUZA, leeCompra, escribeCompra, leeFiltro, escribeFiltro, cambiaIndice, INDICES, nombreQuien,
  leeVenta, escribeVenta, leeProteccion, AYUDA_QUIEN, opcionesQuien, leeOrden, ponModoOrden, ponAjuste, ponVelasOrden, CANCELAR_DEFECTO, ponCancelar, vigilaDesdeLaCompra, ponVigilancia, AJUSTES, fraseCompra, TIPOS_STOP, CAMPOS_STOP_TARJETA, numeroStop, anadeStopDef, cambiaTipoStopDef, quitaStopDef, ponNumeroStop, ponSalida, DEFECTO_PROTECCION,
  opcionesClasico, frasesClasico, fraseStopTarjeta, plantillaFila, opcionesOp, opDe, opDesactivada, conOp, conVuelta, conCruce, puedeVuelta, puedeCruce, conNumero, tieneLado, erroresFila, erroresProteccion, cuentaErroresProteccion, notaFila, fraseRegla,
  datosSuficientes, aTexto, deTexto, mueve, ORDEN_IGUAL, ORDEN_VENTA, ORDEN_STOPS, ORDEN_STOPS_MAS_ALTO, AYUDA_MODO_STOPS, leeModoStops, ponModoStops, PIEZAS, aplicaPieza, ponNivelOrden, avisoIndices, COMO_FILTRAR_INDICE, GRUPOS_FUERZA, avisoFila } from '../lib/builder/tarjetas'
import { partesNombre, planGuardado, avisoVersion } from '../lib/builder/versiones'
import { PERIODOS_DEFECTO } from '../lib/editor/lotes'
import Ayuda from './BuilderAyuda'
import BuilderGuia from './BuilderGuia'
import BuilderDibujo from './BuilderDibujo'
import BuilderSenales from './BuilderSenales'
import { aplicaPrueba } from '../lib/builder/ensayo'

const AZUL = '#58a6ff', NARANJA = '#f0883e', MORADO = '#a371f7', ROJO = '#ff8b8b', AMARILLO = '#f2cc60'
// V9.1049: Protección con su color, un verde azulado (ni el rojo de los errores ni el amarillo de los avisos; contraste alto sobre el
// fondo oscuro), y Cómo compro en gris. Los colores de cada bloque de «La regla, en una frase».
export const VERDE_AZULADO = '#3dd6c3', GRIS = '#9fb0c3'
export const COLOR_BLOQUE = Object.freeze({ filtro: MORADO, compra: AZUL, orden: GRIS, venta: NARANJA, proteccion: VERDE_AZULADO })
const TITULO_BLOQUE = Object.freeze({ filtro: 'Solo opero cuando…', compra: 'Compro cuando…', orden: 'Cómo compro', venta: 'Vendo cuando…', proteccion: 'Protección' })
// La regla por bloques: un párrafo por bloque con la marca de su color (la usan el editor y «Mis estrategias»).
export function ReglaPorBloques({ partes, tamano = 14 }) {
  return (
    <div data-regla="true" style={{ display: 'flex', flexDirection: 'column', gap: 6, lineHeight: 1.5, fontSize: tamano }}>
      {partes.map((p, k) => (
        <div key={k} data-parte={p.tipo} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <span aria-label={TITULO_BLOQUE[p.tipo] || ''} title={TITULO_BLOQUE[p.tipo] || ''} style={{ width: 10, height: 10, borderRadius: 3, marginTop: tamano * 0.42, flexShrink: 0, background: COLOR_BLOQUE[p.tipo] || B.borde }}/>
          <span style={{ color: B.texto }}>{p.texto}</span>
        </div>
      ))}
    </div>
  )
}
const ASA = '⠿'   // seis puntos
const entrada = { fontFamily: B.letra, fontSize: B.base, background: B.fondo, color: B.texto, border: `1px solid ${B.borde}`, borderRadius: B.radioBoton, padding: '5px 8px', width: 'auto' }
const mini = { ...entrada, padding: '2px 4px', fontSize: 13, width: 'auto', display: 'inline-block' }
const copia = (x) => JSON.parse(JSON.stringify(x))
const params = (p) => { try { return typeof p === 'string' ? JSON.parse(p || '{}') : (p || {}) } catch (_) { return {} } }
const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`
// Las etiquetas de los campos con la letra del Builder (la hoja de estilos de la app pone a los label letra monoespaciada y pequeña).
const etiquetaCampo = { display: 'inline-flex', flexDirection: 'row', alignItems: 'center', fontFamily: B.letra, fontSize: B.base, fontWeight: 600, color: B.titulo }
const fechaCorta = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
const esParametro = (x) => typeof x === 'string' && x.startsWith('$')
const val = (x, valores) => esParametro(x) ? valores[x.slice(1)] : x
const AYUDA_FILTRO = 'Cada fila dice de quién es: un índice (QQQ, SPY…) o «Este valor». Se tienen que cumplir todas. Si no se cumplen, no compro nada, aunque se cumpla «Compro cuando…». No obligan a vender lo que ya tengo.'
// La línea de ejecución dice lo que esté elegido en «Cómo compro» y en la vigilancia de los stops.
export const lineaEjecucion = (def) => `La señal se mira al cierre de cada vela. ${leeOrden(def).modo === 'maximo' ? 'Se compra con la orden en el máximo de «Cómo compro»' : leeOrden(def).modo === 'ruptura' ? 'Se compra en cuanto el precio supera el nivel de ruptura de «Cómo compro» (sin esperar al cierre)' : leeOrden(def).modo === 'swing' ? 'Se compra en cuanto el precio supera el último máximo de swing confirmado de «Cómo compro» (sin esperar al cierre)' : 'Se compra a la apertura de la vela siguiente'} y se vende a la apertura de la vela siguiente a la señal de venta (los stops y el objetivo, en cuanto el precio llega). Los stops y las salidas se vigilan ${vigilaDesdeLaCompra(def) ? 'ya en la vela de la compra' : 'desde la vela siguiente a la compra'}. Opciones poco habituales (orden límite, compra al cierre, optimizador): `
const AYUDA_VIGILANCIA = '«Ya en la vela de la compra»: si el mismo día de la compra el precio toca el stop o se cumple una salida, se vende ese día. «Desde la vela siguiente a la compra»: el día de la compra no se mira nada; los stops y las salidas cuentan a partir del día siguiente.'
const AYUDA_ORDEN = 'Ejemplo: la vela de la señal tiene máximo en 52 €. Con la orden en el máximo, compro si en las velas siguientes el precio llega a 52 € (si una vela abre ya por encima, compro a la apertura). Si no llega, según lo elegido la orden se queda en 52 €, o baja cada vela al nuevo máximo si es más bajo (por ejemplo, a 51 €). Si se cumple la condición de cancelar (por ejemplo, el cierre queda por debajo de su EMA (20)), la orden se quita sin comprar.'

// Lo que se edita: la definición (copia), los valores, el nombre y la descripción.
export const estadoDe = (fila) => ({ def: copia(fila.definition), valores: params(fila.params), nombre: fila.name || '', descripcion: fila.description || '' })

// Un número que se escribe con coma: el texto vive aquí mientras se escribe; fuera llega el número (o el texto si no lo es).
function Numero({ valor, onCambia, error, etiqueta }) {
  const [t, setT] = useState(aTexto(valor))
  useEffect(() => { if (deTexto(t) !== valor) setT(aTexto(valor)) }, [valor])
  return <input type="text" inputMode="decimal" value={t} aria-label={etiqueta} aria-invalid={!!error} onChange={e => { setT(e.target.value); onCambia(deTexto(e.target.value)) }}
    style={{ ...mini, width: `${Math.max(2, String(t).length) + 2}ch`, minWidth: 0, textAlign: 'right', ...(error ? { borderColor: ROJO } : {}) }}/>
}

// El menú «…» de una fila: darle (o quitarle) la vuelta y, en las condiciones sin símbolo, «solo la vela en que empieza».
// V9.1045: el menú va con posición FIJA (como el «?»), por encima de todo: la fila tiene desplazamiento horizontal y lo recortaba.
// Se abre hacia abajo y, si no cabe, hacia arriba; se cierra al tocar fuera o al desplazar la página.
function Menu({ f, onCambia, abiertoInicial = false, onSubir = null, onBajar = null }) {
  const [abierto, setAbierto] = useState(abiertoInicial)
  const [pos, setPos] = useState(null)
  const boton = useRef(null), caja = useRef(null)
  const abre = () => {
    const r = boton.current?.getBoundingClientRect()
    if (r) setPos({ right: Math.max(8, window.innerWidth - r.right), ...(window.innerHeight - r.bottom < 120 ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }) })
    setAbierto(true)
  }
  useEffect(() => {
    if (!abierto) return
    const fuera = (e) => { if (!caja.current?.contains(e.target) && !boton.current?.contains(e.target)) setAbierto(false) }
    const cierra = () => setAbierto(false)
    document.addEventListener('mousedown', fuera); document.addEventListener('touchstart', fuera); window.addEventListener('scroll', cierra, true)
    return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('touchstart', fuera); window.removeEventListener('scroll', cierra, true) }
  }, [abierto])
  return (
    <span style={{ flexShrink: 0 }}>
      <button ref={boton} style={{ ...S.enlace, color: B.apagado, padding: '0 4px' }} aria-label="Más opciones de la fila" aria-expanded={abierto} onClick={() => abierto ? setAbierto(false) : abre()}>…</button>
      {abierto && (
        <span ref={caja} data-menu-fila style={{ position: 'fixed', zIndex: 1000, ...(pos || {}), background: B.cabecera, border: `1px solid ${B.borde}`, borderRadius: B.radioBoton, padding: 8, display: 'flex', flexDirection: 'column', gap: 6, whiteSpace: 'nowrap', boxShadow: '0 6px 20px rgba(0,0,0,0.5)' }}>
          <button style={{ ...S.enlace, ...(puedeVuelta(f) ? {} : { color: B.apagado, cursor: 'default' }) }} disabled={!puedeVuelta(f)} onClick={() => { onCambia(conVuelta(f)); setAbierto(false) }}>{f.env === 'NO' ? 'Quitarle la vuelta (NO)' : 'Darle la vuelta (NO)'}</button>
          {!puedeVuelta(f) && <span style={{ ...S.apagado, fontSize: 12, whiteSpace: 'normal', maxWidth: 260 }}>Una fila que se cumple solo la vela del cruce no se puede dar la vuelta: elige el cruce contrario en el símbolo.</span>}
          {!tieneLado(f.cond.c) && <button style={{ ...S.enlace, ...(puedeCruce(f) ? {} : { color: B.apagado, cursor: 'default' }) }} disabled={!puedeCruce(f)} onClick={() => { onCambia(conCruce(f)); setAbierto(false) }}>{f.env === 'cruza' ? 'Cada vela que se cumpla' : 'Solo la vela en que empieza a cumplirse (cruza)'}</button>}
          {!tieneLado(f.cond.c) && !puedeCruce(f) && <span style={{ ...S.apagado, fontSize: 12, whiteSpace: 'normal', maxWidth: 260 }}>Quítale primero la vuelta (NO) para elegir «solo la vela en que empieza».</span>}
          {(onSubir || onBajar) && <span style={{ borderTop: `1px solid ${B.borde}`, margin: '2px 0' }}/>}
          {(onSubir || onBajar) && <button style={{ ...S.enlace, ...(onSubir ? {} : { color: B.apagado, cursor: 'default' }) }} disabled={!onSubir} onClick={() => { onSubir?.(); setAbierto(false) }}>Subir</button>}
          {(onSubir || onBajar) && <button style={{ ...S.enlace, ...(onBajar ? {} : { color: B.apagado, cursor: 'default' }) }} disabled={!onBajar} onClick={() => { onBajar?.(); setAbierto(false) }}>Bajar</button>}
        </span>
      )}
    </span>
  )
}

// Una fila de condición en UNA línea: «Cierre [> ▾] SMA ( [200] )», con la nota gris, el «?», el menú «…» y la ×; el error,
// debajo. quien / onQuien: el selector «de quién» de «Solo opero cuando…».
// asa (V9.1049): las props de arrastre de la fila (onDragStart…) o null; onSubir / onBajar: los del menú «…»; avisoExtra: una nota
// debajo (la de las filas de índice).
// onValor(nombre, v) (V9.1053): cuando el número de la casilla es un parámetro con nombre («$ema»), se cambia su valor y la fila
// sigue diciendo «$ema»; así, si se vuelve a dejar como estaba, la estrategia es la guardada, byte a byte.
function Fila({ f, errores, valores, tarjeta, color, onCambia, onValor, onQuita, quien, onQuien, menuAbierto = false, ayudaAbierta = false, intervalo = 'diario', asa = null, onSubir = null, onBajar = null, avisoExtra = null }) {
  const p = f.cond.p || {}, decl = Object.fromEntries((CONDICIONES_EDITOR[f.cond.c]?.parametros || []).map(d => [d.clave, d]))
  const hay = Object.keys(errores).length > 0
  const campo = (c, j) => {
    if (typeof c === 'string') return <span key={j}>{c}</span>
    if (c.tipo === 'grupoFuerza') return <select key={j} style={mini} aria-label="Comparado con" value={GRUPOS_FUERZA[0].id} onChange={() => {}} title="El grupo de valores con el que se compara (hoy, solo el Nasdaq-100)">{GRUPOS_FUERZA.map(g => <option key={g.id} value={g.id}>{g.nombre}</option>)}</select>
    if (c.tipo === 'op') return <select key={j} style={mini} aria-label="Símbolo" value={opDe(f)} onChange={e => onCambia(conOp(f, e.target.value))} title={AYUDA_CRUZA}>{opcionesOp(f.cond.c).map(o => <option key={o} value={o} disabled={opDesactivada(f, o)}>{o}</option>)}</select>
    if (c.tipo === 'media' || c.tipo === 'opcion') return <select key={j} style={mini} aria-label={decl[c.k]?.etiqueta} value={p[c.k] ?? decl[c.k]?.defecto} onChange={e => onCambia(conNumero(f, c.k, e.target.value))}>{(decl[c.k]?.opciones || []).map(o => <option key={o} value={o}>{o}</option>)}</select>
    return <Numero key={j} valor={val(p[c.k], valores)} error={errores[c.k]} etiqueta={decl[c.k]?.etiqueta} onCambia={v => esParametro(p[c.k]) && onValor ? onValor(p[c.k].slice(1), v) : onCambia(conNumero(f, c.k, v))}/>
  }
  return (
    <div data-fila={f.cond.c} data-error={hay ? 'si' : undefined} style={{ border: `1px solid ${hay ? ROJO : B.borde}`, borderLeft: `3px solid ${hay ? ROJO : color}`, borderRadius: B.radioBoton, padding: '6px 8px', marginTop: 8, background: B.fondo }}>
      <div data-linea style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'nowrap', overflowX: 'auto', whiteSpace: 'nowrap' }}>
        {asa && <span data-asa draggable {...asa} title="Arrastra para mover la fila" aria-label="Mover la fila" style={{ cursor: 'grab', color: B.apagado, fontSize: 16, lineHeight: 1, padding: '0 2px', flexShrink: 0, userSelect: 'none' }}>{ASA}</span>}
        {onQuien && (
          <span style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>
            <select style={{ ...mini, color: MORADO }} aria-label="De quién" value={quien} onChange={e => onQuien(e.target.value)}>
              {opcionesQuien(quien).map(t => <option key={t} value={t} disabled={t !== 'valor' && soloDelValor(f.cond.c)}>{nombreQuien(t)}</option>)}
            </select>
            <Ayuda texto={AYUDA_QUIEN} etiqueta="De quién"/>
          </span>
        )}
        {f.env === 'NO' && <span data-no style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}><span style={{ fontSize: 11, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: '#3b1d22', color: ROJO }}>NO</span><Ayuda texto={AYUDA_NO} etiqueta="NO"/></span>}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: B.titulo, fontWeight: 600, flexShrink: 0 }}>{plantillaFila(f.cond.c).map(campo)}</span>
        {f.env === 'cruza' && !tieneLado(f.cond.c) && <span style={{ fontSize: 12, color: B.secundario, flexShrink: 0 }}>(solo la vela en que empieza)</span>}
        <span style={{ marginLeft: 'auto', paddingLeft: 8, color: B.apagado, fontSize: 12 }}>{notaFila(f, valores, tarjeta, intervalo)}</span>
        <span style={{ flexShrink: 0 }}><Ayuda texto={ayudaFila(f)} etiqueta={nombreCond(f.cond.c)} abiertoInicial={ayudaAbierta}/></span>
        <Menu f={f} onCambia={onCambia} abiertoInicial={menuAbierto} onSubir={onSubir} onBajar={onBajar}/>
        <button style={{ ...S.enlace, color: B.apagado, fontSize: 18, lineHeight: 1, padding: '0 4px', flexShrink: 0 }} aria-label="Quitar esta condición" title="Quitar esta condición" onClick={onQuita}>×</button>
      </div>
      {onQuien && soloDelValor(f.cond.c) && <div data-solo-valor style={{ color: B.secundario, fontSize: 13, marginTop: 6 }}>{avisoSoloValor(f.cond.c)}</div>}
      {avisoFila(f.cond.c) && <div data-aviso-fila style={{ color: B.secundario, fontSize: 13, marginTop: 6 }}>{avisoFila(f.cond.c)}</div>}
      {avisoExtra && <div data-aviso-indices style={{ color: AMARILLO, fontSize: 13, marginTop: 6 }}>{avisoExtra}</div>}
      {hay && <div data-error-fila style={{ color: ROJO, fontSize: 13, marginTop: 6 }}>{Object.values(errores).map((e, k) => <div key={k}>{e}</div>)}</div>}
    </div>
  )
}

// soltar (V9.1049): mientras se arrastra, { puede, onDragOver, onDrop, onDragLeave }: si puede, se ilumina; si no, sale en gris.
function Tarjeta({ titulo, color, derecha, children, datos, soltar = null }) {
  const estiloSoltar = !soltar ? {} : soltar.puede ? { boxShadow: `0 0 0 2px ${color || B.siguienteBorde}`, background: B.siguienteFondo } : { opacity: 0.45, filter: 'grayscale(1)' }
  return (
    <div {...datos} data-soltar={soltar ? (soltar.puede ? 'si' : 'no') : undefined} onDragOver={soltar?.onDragOver} onDrop={soltar?.onDrop} onDragLeave={soltar?.onDragLeave}
      style={{ ...S.tarjeta, marginBottom: 14, borderTop: color ? `3px solid ${color}` : undefined, transition: 'box-shadow 0.1s', ...estiloSoltar }}>
      <div style={{ ...S.cabeceraTarjeta, display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', color: color || B.titulo }}>
        <span>{titulo}</span>{derecha && <span style={{ marginLeft: 'auto', fontWeight: 400, fontSize: 13, color: B.secundario }}>{derecha}</span>}
      </div>
      <div style={S.cuerpo}>{children}</div>
    </div>
  )
}

export default function BuilderEditor({ fila, estrategias = [], lotes = [], apiFetch, onVolver, onGuardada, onEditorClasico, estadoInicial = null, enPruebaInicial = null, buscarInicial = '', menuInicial = null, abiertosInicial = null, ayudaInicial = null, anadiendoInicial = null, arrastreInicial = null, cargaSimbolos = null, cargaVelas = null, comisiones = null, pestanaInicial = 'tarjetas', panelInicial = null, senalesInicial = null, dibujoInicial = null, cambiosInicial = null }) {
  const [est, setEst] = useState(() => estadoInicial || estadoDe(fila))
  const orig = useRef(null); if (!orig.current) orig.current = estadoDe(fila)
  const { def, valores } = est
  const setDef = (d) => setEst(e => ({ ...e, def: typeof d === 'function' ? d(e.def) : d }))
  // Un parámetro con nombre (V9.1053): se cambia su valor. Si vuelve al de la estrategia guardada y allí no estaba escrito (salía
  // de su valor por defecto), se quita otra vez, para que los valores queden como los guardados.
  const ponValor = (nombre, v) => setEst(e => {
    const vs = { ...e.valores, [nombre]: v }
    let porDefecto; try { porDefecto = valoresDe(orig.current.def, orig.current.valores)[nombre] } catch (_) {}
    if (!(nombre in orig.current.valores) && v === porDefecto) delete vs[nombre]
    return { ...e, valores: vs }
  })
  // Una casilla de número fuera de las filas (stops, orden, objetivo, tiempo): si lo guardado es un parámetro, su valor; si no, el número.
  const numeroEn = (actual, v, escribe) => esParametro(actual) ? ponValor(actual.slice(1), v) : setDef(escribe)
  const intervalo = valores.intervalo === 'semanal' ? 'semanal' : 'diario'
  const [modoCompraUI, setModoCompraUI] = useState(() => leeCompra(def).modo || 'todas')
  const [modoVentaUI, setModoVentaUI] = useState(() => leeVenta(def).modo || 'alguna')
  const [buscar, setBuscar] = useState(buscarInicial)
  const [abiertos, setAbiertos] = useState(() => abiertosInicial === 'todos' ? Object.fromEntries(GRUPOS.map(g => [g.id, true])) : {})
  const [anadiendo, setAnadiendo] = useState(anadiendoInicial)
  // V9.1054: tres pestañas: «Tarjetas», «Señales en el gráfico» y «Dibujo de la regla» (panelInicial: el nombre de V9.1050).
  const [pestana, setPestana] = useState(panelInicial || pestanaInicial)
  // Las casillas de prueba de «Señales en el gráfico» ({ clave: valor }): viven aquí mientras el editor está abierto (así no se
  // pierden al cambiar de pestaña) y nunca se guardan solas; al salir y volver a entrar, se empieza sin ninguna.
  const [cambiosPrueba, setCambiosPrueba] = useState(cambiosInicial || {})
  const [msgValores, setMsgValores] = useState(null)
  const cajaAnadir = useRef(null)
  // Arrastrar (V9.1049): lo que se arrastra ({ tipo: 'cond', clave } del catálogo, { tipo: 'fila', tarjeta, k } o { tipo: 'stop', k })
  // y dónde quedaría ({ tarjeta, pos }: la línea que lo marca).
  const [arrastre, setArrastre] = useState(arrastreInicial)
  const [destino, setDestino] = useState(null)
  // El cuadro «¿Añadir a…?» se cierra con «Cancelar», al pulsar fuera o con Esc.
  useEffect(() => {
    if (!anadiendo) return
    const fuera = (e) => { if (cajaAnadir.current && !cajaAnadir.current.contains(e.target)) setAnadiendo(null) }
    const tecla = (e) => { if (e.key === 'Escape') setAnadiendo(null) }
    document.addEventListener('mousedown', fuera); document.addEventListener('touchstart', fuera); document.addEventListener('keydown', tecla)
    return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('touchstart', fuera); document.removeEventListener('keydown', tecla) }
  }, [anadiendo])
  const [guia, setGuia] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [msg, setMsg] = useState(null)
  const [enPrueba, setEnPrueba] = useState(enPruebaInicial || [])   // las pruebas congeladas donde está la estrategia de partida

  // ¿En qué pruebas está la estrategia de partida? (por la huella de su definición con sus valores, como «Mi trabajo»)
  useEffect(() => {
    let vivo = true
    if (enPruebaInicial) return
    if (!fila?.id) { setEnPrueba([]); return }
    huellaDefinicion(orig.current.def, orig.current.valores).then(h => {
      if (vivo) setEnPrueba(lotes.filter(l => l?.lote?.tipo !== 'planes' && (l.huellas?.variantes || []).some(v => v.huella === h)).map(l => l.nombre))
    }).catch(() => {})
    return () => { vivo = false }
  }, [fila?.id, lotes])

  const filtro = leeFiltro(def), compra = leeCompra(def), venta = leeVenta(def), prot = leeProteccion(def)
  const modoC = compra.modo || modoCompraUI, modoV = venta.modo || modoVentaUI
  const esquema = useMemo(() => { try { return esquemaDe(def) } catch (_) { return null } }, [def])
  const valoresEf = useMemo(() => { try { return valoresDe(def, valores) } catch (_) { return {} } }, [def, valores])
  const clasico = opcionesClasico(def, valoresEf)
  const errFiltro = filtro.filas.map(f => erroresFila(f, valoresEf, esquema, f.quien))
  const errCompra = compra.filas.map(f => erroresFila(f, valoresEf, esquema)), errVenta = venta.filas.map(f => erroresFila(f, valoresEf, esquema))
  const errProt = erroresProteccion(prot, def, valoresEf)
  const orden = leeOrden(def), errCancelar = orden.cancelar ? erroresFila(orden.cancelar, valoresEf, esquema) : {}
  const errVelasOrden = orden.modo === 'maximo' || orden.modo === 'ruptura' ? (v => typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 250 ? null : 'El número de velas tiene que ser un número entero de 1 a 250 (por ejemplo, 1).')(typeof orden.velas === 'string' && orden.velas.startsWith('$') ? valoresEf[orden.velas.slice(1)] : orden.velas) : null
  const validacion = useMemo(() => { try { return validaDefinicion(def, valores) } catch (e) { return [`La definición no se puede leer: ${e.message}`] } }, [def, valores])
  // V9.1059: los números de la orden en el último máximo de swing (velas a la izquierda y a la derecha, de 1 a 20).
  const numOrden = (x) => typeof x === 'string' && x.startsWith('$') ? valoresEf[x.slice(1)] : x
  const errSwing = (x) => (v => typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 20 ? null : 'Las velas del swing tienen que ser un número entero de 1 a 20 (por ejemplo, 2).')(numOrden(x))
  const errSwingOrden = orden.modo === 'swing' ? { izquierda: errSwing(orden.izquierda), derecha: errSwing(orden.derecha) } : {}
  // V9.1055: con la orden en el nivel de ruptura (V9.1059: o en el último máximo de swing), las filas de compra son opcionales.
  const sinCompra = orden.modo === 'ruptura' || orden.modo === 'swing' ? false : !def.entrada?.senal || (compra.ok && !compra.filas.length), sinSalida = !(def.stops || []).length && !(def.salidas || []).length
  const errNombre = !est.nombre.trim() ? 'Ponle un nombre a la estrategia (por ejemplo, «Retrocesos con RSI»).' : null
  const n = (xs) => xs.reduce((a, e) => a + Object.keys(e).length, 0)
  const nFiltro = n(errFiltro), nCompra = n(errCompra) + (sinCompra ? 1 : 0), nVenta = n(errVenta), nProt = cuentaErroresProteccion(errProt) + (sinSalida ? 1 : 0), nOrden = n([errCancelar]) + (errVelasOrden ? 1 : 0) + Object.values(errSwingOrden).filter(Boolean).length
  // Lo que la validación de siempre ve y las tarjetas no explican (una opción del Editor clásico): cuenta como error de allí.
  const errClasico = nFiltro + nCompra + nVenta + nProt + nOrden ? [] : validacion
  const zonas = [['«Solo opero cuando…»', nFiltro], ['«Compro cuando…»', nCompra], ['«Vendo cuando…»', nVenta], ['«Cómo compro»', nOrden], ['«Protección»', nProt], ['el Editor clásico', errClasico.length], ['el nombre', errNombre ? 1 : 0]].filter(([, k]) => k)
  const nErrores = zonas.reduce((a, [, k]) => a + k, 0)
  const hayErrores = nErrores > 0 || validacion.length > 0
  const malos = (es) => es.map(e => Object.fromEntries(Object.keys(e).map(k => [k, true])))
  const regla = fraseRegla({ def, filtro, compra: { ...compra, modo: modoC }, venta: { ...venta, modo: modoV }, prot, valores: valoresEf, malosFiltro: malos(errFiltro), malosCompra: malos(errCompra), malosVenta: malos(errVenta),
    malosProt: { ...errProt, stops: malos(errProt.stops) }, malosCancelar: malos([errCancelar])[0], ...frasesClasico(def, valoresEf, compra, filtro) })
  const datos = useMemo(() => { try { return datosSuficientes(def, valoresEf, intervalo, PERIODOS_DEFECTO[0].desde) } catch (_) { return null } }, [def, valoresEf, intervalo])
  const cambiaRegla = jsonCanonico(paraHuella(def, valores)) !== jsonCanonico(paraHuella(orig.current.def, orig.current.valores))
  const plan = planGuardado({ fila, est, orig: orig.current, enPrueba, estrategias, cambiaRegla })
  const version = partesNombre(fila?.name).version
  const estado = fila?.copiaDe ? `Copia de «${fila.copiaDe}». La original y sus pruebas no cambian.`
    : !fila?.id ? 'Estrategia nueva · todavía sin guardar'
    : `Versión ${version} · ${enPrueba.length ? `probada en ${enPrueba.length > 1 ? 'las pruebas' : 'la prueba'} ${enPrueba.map(x => `«${x}»`).join(', ')}` : 'sin probar todavía'}`
  const indiceActual = filtro.filas.find(f => f.quien !== 'valor')?.quien

  // ── Cambios desde las tarjetas ──
  const cambiaFiltro = (filas) => setDef(d => escribeFiltro(d, filas))
  const cambiaCompra = (filas, modo = modoC) => setDef(d => escribeCompra(d, filas, modo))
  const cambiaVenta = (filas, modo = modoV) => setDef(d => escribeVenta(d, filas, modo))
  // Con «+», al final de la tarjeta; arrastrando, en la posición pos.
  const anade = (id, donde, pos = null) => {
    const f = filaNueva(id), mete = (xs, x) => pos == null ? [...xs, x] : [...xs.slice(0, pos), x, ...xs.slice(pos)]
    if (donde === 'filtro') cambiaFiltro(mete(filtro.filas, { ...f, quien: soloDelValor(id) ? 'valor' : (indiceActual || 'QQQ') }))
    else if (donde === 'compra') cambiaCompra(mete(compra.filas, f)); else cambiaVenta(mete(venta.filas, f))
    setAnadiendo(null)
  }
  // Ordenar: mover la fila k a la posición j de su tarjeta (o el stop k).
  const reordena = (t, k, j) => t === 'filtro' ? cambiaFiltro(mueve(filtro.filas, k, j)) : t === 'compra' ? cambiaCompra(mueve(compra.filas, k, j)) : t === 'venta' ? cambiaVenta(mueve(venta.filas, k, j)) : setDef(d => ({ ...d, stops: mueve(d.stops || [], k, j) }))
  const filasDe = (t) => t === 'filtro' ? filtro.filas : t === 'compra' ? compra.filas : t === 'venta' ? venta.filas : prot.stops
  const okTarjeta = { filtro: filtro.ok, compra: compra.ok, venta: venta.ok }
  const puedeSoltar = (t, a = arrastre) => !a ? false : a.tipo === 'cond' ? !!okTarjeta[t] : a.tipo === 'fila' ? a.tarjeta === t : t === 'proteccion'
  const acaba = () => { setArrastre(null); setDestino(null) }
  const suelta = (t, pos) => {
    const a = arrastre; acaba()
    if (!puedeSoltar(t, a)) return
    if (a.tipo === 'cond') anade(a.clave, t, pos)
    else reordena(t, a.k, pos > a.k ? pos - 1 : pos)
  }
  const soltarEn = (t) => !arrastre ? null : { puede: puedeSoltar(t),
    onDragOver: (e) => { if (!puedeSoltar(t)) return; e.preventDefault(); if (destino?.tarjeta !== t) setDestino({ tarjeta: t, pos: filasDe(t).length }) },
    onDrop: (e) => { e.preventDefault(); suelta(t, destino?.tarjeta === t ? destino.pos : filasDe(t).length) } }
  const sobre = (t, k) => ({ onDragOver: (e) => { if (!puedeSoltar(t)) return; e.preventDefault(); e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(), pos = e.clientY < r.top + r.height / 2 ? k : k + 1; if (destino?.tarjeta !== t || destino.pos !== pos) setDestino({ tarjeta: t, pos }) },
    onDrop: (e) => { e.preventDefault(); e.stopPropagation(); suelta(t, destino?.tarjeta === t ? destino.pos : k) } })
  const marca = (t, pos, color) => arrastre && puedeSoltar(t) && destino?.tarjeta === t && destino.pos === pos ? <div data-marca-soltar style={{ height: 3, background: color, borderRadius: 2, margin: '6px 0 -4px' }}/> : null
  const asaDe = (t, k) => ({ onDragStart: (e) => { e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', `${t}:${k}`) } catch (_) {} setArrastre(t === 'proteccion' ? { tipo: 'stop', k } : { tipo: 'fila', tarjeta: t, k }) }, onDragEnd: acaba })
  const subeBaja = (t, k) => ({ onSubir: k > 0 ? () => reordena(t, k, k - 1) : null, onBajar: k < filasDe(t).length - 1 ? () => reordena(t, k, k + 1) : null })
  const avisoInd = avisoIndices(filtro.filas)
  // «De quién»: un índice cambia el de todas las filas del índice (el motor admite uno); «Este valor» la pasa a la señal.
  const cambiaQuien = (k, q) => cambiaFiltro(q === 'valor' ? filtro.filas.map((x, j) => j === k ? { ...x, quien: 'valor' } : x) : cambiaIndice(filtro.filas.map((x, j) => j === k ? { ...x, quien: q } : x), q))
  const otroModo = (m) => m === 'todas' ? 'alguna' : 'todas'
  const cambiaModoCompra = () => { const m = otroModo(modoC); setModoCompraUI(m); if (compra.filas.length > 1) cambiaCompra(compra.filas, m) }
  const cambiaModoVenta = () => { const m = otroModo(modoV); setModoVentaUI(m); if (venta.filas.length > 1) cambiaVenta(venta.filas, m) }

  // Guardar un plan (el de la pantalla o el de «Guardar estos valores en la estrategia»): lo mismo que el editor de siempre.
  const guardaPlan = async (pl, info = {}, alFallar = setMsg) => {
    setGuardando(true)
    try {
      const res = await apiFetch('/api/strategies', { method: pl.metodo, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pl.cuerpo) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.errores ? j.errores.join(' ') : (j.error || `HTTP ${res.status}`))
      onGuardada?.({ ...pl.cuerpo, ...j, id: j?.id || pl.cuerpo.id }, { version: pl.version, ...info })
    } catch (e) { alFallar(`No se pudo guardar: ${e.message}`) }
    setGuardando(false)
  }
  const guarda = async () => {
    if (hayErrores || guardando) return
    setMsg(null)
    if (plan.metodo === 'ninguno') { onGuardada?.({ ...fila }, { sinCambios: true }); return }
    await guardaPlan(plan)
  }
  // «Guardar estos valores en la estrategia» (V9.1054): las casillas de prueba pasan a la estrategia con la regla de versiones de
  // siempre (si está en una prueba, «· versión 2») y se sigue en «Señales en el gráfico» con la estrategia guardada.
  const guardaValores = async () => {
    if (guardando) return
    setMsgValores(null)
    const est2 = { ...est, ...aplicaPrueba({ def: est.def, valores: est.valores }, cambiosPrueba) }
    let errs = []; try { errs = validaDefinicion(est2.def, est2.valores) } catch (e) { errs = [e.message] }
    if (errs.length || errNombre) { setMsgValores(`No se puede guardar: ${errNombre || errs[0]}`); return }
    const cambia2 = jsonCanonico(paraHuella(est2.def, est2.valores)) !== jsonCanonico(paraHuella(orig.current.def, orig.current.valores))
    const plan2 = planGuardado({ fila, est: est2, orig: orig.current, enPrueba, estrategias, cambiaRegla: cambia2 })
    if (plan2.metodo === 'ninguno') { setCambiosPrueba({}); return }
    await guardaPlan(plan2, { quedarse: true }, setMsgValores)
  }
  const abreClasico = () => onEditorClasico?.({ id: fila?.id ?? null, name: est.nombre, description: est.descripcion, definition: def, params: { ...valores } })

  if (guia) return <BuilderGuia onVolver={() => setGuia(false)} volverTexto="← Volver a la estrategia"/>

  const busqueda = buscaCatalogo(buscar), grupos = busqueda.grupos
  const enlaceModo = (modo, onClick) => <>{modo === 'todas' ? 'se cumplen todas' : 'basta con una'} · <button style={{ ...S.enlace, fontSize: 13 }} onClick={onClick}>cambiar a «{modo === 'todas' ? 'al menos una' : 'todas'}»</button></>
  const vacia = (t) => <div style={{ ...S.apagado, marginTop: 4 }}>{t}</div>
  const errorTarjeta = (t) => <div data-error-tarjeta style={{ color: ROJO, fontSize: 13, marginTop: 8 }}>{t}</div>
  const linea = { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 6 }
  const caja = (clave, titulo, cuerpo, error) => (
    <div data-proteccion={clave} style={{ flex: '1 1 220px', border: `1px solid ${error ? ROJO : B.borde}`, borderRadius: B.radioBoton, padding: 10, background: B.fondo }}>
      <div style={{ fontWeight: 600, color: B.titulo, marginBottom: 4 }}>{titulo}</div>
      {cuerpo}
      {error && <div data-error-proteccion style={{ color: ROJO, fontSize: 13, marginTop: 6 }}>{error}</div>}
    </div>
  )
  const numStop = (k, s, ruta) => { const [, que, , ] = (CAMPOS_STOP_TARJETA[s.tipo] || []).find(([r]) => r.join('.') === ruta.join('.')) || []; return <Numero valor={numeroStop(s, ruta, valoresEf)} error={errProt.stops[k]?.[ruta.join('.')]} etiqueta={que} onCambia={v => numeroEn(ruta.reduce((x, c) => x?.[c], s), v, d => ponNumeroStop(d, k, ruta, v))}/> }
  const cuerpoStop = (s, k) => {
    if (s.tipo === 'porcentaje') return <>Vender si baja un {numStop(k, s, ['pct'])} % bajo la compra</>
    if (s.tipo === 'minimoVelas') return <>En el mínimo de las últimas {numStop(k, s, ['n'])} velas</>
    if (s.tipo === 'atr') return <>{numStop(k, s, ['k'])} veces el ATR de {numStop(k, s, ['periodo'])} velas bajo la compra</>
    if (s.tipo === 'atrCompra') return <>Stop a {numStop(k, s, ['k'])} × ATR ({numStop(k, s, ['periodo'])}) por debajo del precio de compra, con el ATR de la vela anterior a la compra; no se mueve</>
    if (s.tipo === 'minimoMovil') return <>Stop en el mínimo de las {numStop(k, s, ['n'])} velas anteriores; se recalcula en cada vela y solo sube</>
    if (s.tipo === 'swingMinimo') return <>Stop bajo el último mínimo de swing confirmado ({numStop(k, s, ['izquierda'])} velas a la izquierda, {numStop(k, s, ['derecha'])} a la derecha); se recalcula en cada vela y solo sube</>
    if (s.tipo === 'supertrend') return <>Stop en la línea del SuperTrend ({numStop(k, s, ['periodo'])} velas del ATR, multiplicador {numStop(k, s, ['k'])}); se recalcula en cada vela y solo sube<Ayuda texto={PIEZAS.find(p => p.id === 'supertrend').explicacion} etiqueta="Stop en la línea del SuperTrend"/></>   // V9.1064
    if (s.tipo === 'nivel') return <>En el mínimo de la vela de la señal</>
    return <>Cuando una vela cierra bajo su <select style={mini} aria-label="Tipo de la media del stop" value={s.si.p.tipo} onChange={e => setDef(d => ponNumeroStop(d, k, ['si', 'p', 'tipo'], e.target.value))}><option value="SMA">SMA</option><option value="EMA">EMA</option></select> ({numStop(k, s, ['si', 'p', 'periodo'])}), sube al mínimo de las últimas {numStop(k, s, ['nivel', 'velas'])} velas</>
  }
  const primerStop = prot.stops[0]?.s, objetivoValor = val(prot.objetivo.valor, valoresEf)
  const calculoObjetivo = primerStop?.tipo === 'porcentaje' && typeof val(primerStop.pct, valoresEf) === 'number' && typeof objetivoValor === 'number'
    ? `Con el stop al ${aTexto(val(primerStop.pct, valoresEf))} %, vende al subir un ${aTexto(Math.round(val(primerStop.pct, valoresEf) * objetivoValor * 100) / 100)} %.`
    : 'Vende al subir esas veces la distancia entre el precio de compra y el primer stop.'
  const tiempoN = val(prot.tiempo.valor, valoresEf)

  return (
    <div style={S.pagina}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <button style={{ ...S.enlace, color: B.secundario }} onClick={() => onVolver?.()}>← Builder · Mi trabajo</button>
        <span style={{ fontSize: 22, fontWeight: 700, color: B.titulo }}>Paso 1 · Crear la estrategia</span>
        <span data-cabecera-nombre style={{ color: B.secundario }}>{est.nombre.trim() || 'Sin nombre'} · velas {intervalo === 'semanal' ? 'semanales' : 'diarias'}</span>
        <span style={{ marginLeft: 'auto' }}><button style={S.boton} onClick={() => setGuia(true)}>Guía: cómo se prueba una estrategia</button></span>
      </div>
      {/* V9.1054: tres pestañas. «Tarjetas» es el editor; las otras dos dibujan la regla de la pantalla (con sus cambios sin guardar) y,
          si tiene errores, lo dicen y no dibujan. */}
      <div role="tablist" aria-label="Paso 1" data-pestanas style={{ display: 'flex', gap: 4, marginBottom: 14, borderBottom: `1px solid ${B.borde}`, flexWrap: 'wrap' }}>
        {[['tarjetas', 'Tarjetas'], ['senales', 'Señales en el gráfico'], ['dibujo', 'Dibujo de la regla']].map(([k, t]) => (
          <button key={k} role="tab" data-pestana={k} aria-selected={pestana === k} onClick={() => setPestana(k)} style={{ fontFamily: B.letra, fontSize: 15, minHeight: 44, padding: '0 18px', cursor: 'pointer', background: 'transparent', border: 'none',
            borderBottom: `3px solid ${pestana === k ? AZUL : 'transparent'}`, color: pestana === k ? B.titulo : B.secundario, fontWeight: pestana === k ? 700 : 400 }}>{t}{k !== 'tarjetas' && hayErrores ? ' ⚠' : ''}</button>
        ))}
      </div>
      {pestana === 'senales' && <BuilderSenales def={def} valores={valoresEf} guardado={orig.current} intervalo={intervalo} error={hayErrores ? 'La regla tiene errores: corrígelos en «Tarjetas» (lo que está en rojo) para ver las señales y las cifras.' : null}
        cambios={cambiosPrueba} onCambios={setCambiosPrueba} onGuardarValores={guardaValores} guardando={guardando} msgGuardar={msgValores} cargaSimbolos={cargaSimbolos} cargaVelas={cargaVelas} comisiones={comisiones} {...(senalesInicial || {})}/>}
      {pestana === 'dibujo' && <div data-pestana-dibujo style={{ ...S.tarjeta }}><div style={S.cuerpo}>
        <BuilderDibujo def={def} valores={valoresEf} error={hayErrores ? 'La regla tiene errores: corrígelos en «Tarjetas» (lo que está en rojo) para ver el dibujo.' : null} {...(dibujoInicial || {})}/>
      </div></div>}
      {pestana === 'tarjetas' && <>
      {clasico.length > 0 && (
        <div data-aviso="clasico" style={{ border: `1px solid ${AMARILLO}`, borderRadius: B.radioBoton, padding: 12, marginBottom: 14 }}>
          <div style={{ color: AMARILLO, fontWeight: 600 }}>Esta estrategia usa opciones que solo se pueden ver y cambiar en el Editor clásico:</div>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18, color: B.texto }}>{clasico.map(t => <li key={t}>{t}</li>)}</ul>
          <div style={{ ...S.secundario, marginTop: 6 }}>Al guardar aquí se conservan tal cual. <button style={S.enlace} onClick={abreClasico}>Abrir en el Editor clásico</button></div>
        </div>
      )}
      <div style={{ ...S.tarjeta, marginBottom: 16 }} data-tarjeta="nombre">
        <div style={{ ...S.cuerpo, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <label style={etiquetaCampo} htmlFor="nombre-estrategia">Nombre de la estrategia</label>
          <input id="nombre-estrategia" value={est.nombre} onChange={e => setEst(x => ({ ...x, nombre: e.target.value }))} style={{ ...entrada, flex: '1 1 240px', maxWidth: 420, ...(errNombre ? { borderColor: ROJO } : {}) }}/>
          <label style={{ ...etiquetaCampo, gap: 6 }}>
            <span>Velas:</span>
            <select style={entrada} aria-label="Velas" value={intervalo} onChange={e => setEst(x => ({ ...x, valores: { ...x.valores, intervalo: e.target.value } }))}>
              <option value="diario">Diarias (1 vela = 1 día de mercado)</option><option value="semanal">Semanales (1 vela = 1 semana)</option>
            </select>
          </label>
          <div style={{ flexBasis: '100%', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <span data-estado style={S.secundario}>{estado}</span>
            <span style={S.apagado}>La prueba del paso 2 solo admite velas diarias.</span>
          </div>
          {errNombre && <div style={{ color: ROJO, fontSize: 13, flexBasis: '100%' }}>{errNombre}</div>}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {/* ── Izquierda: el catálogo ── */}
        <div data-columna="catalogo" style={{ flex: '1 1 230px', maxWidth: 320, minWidth: 0 }}>
          <div style={{ ...S.tarjeta }}>
            <div style={S.cabeceraTarjeta}>Catálogo de condiciones</div>
            <div style={{ padding: 12 }}>
              <input aria-label="Buscar condiciones" placeholder="Buscar: caída, media, volumen…" value={buscar} onChange={e => setBuscar(e.target.value)} style={{ ...entrada, width: '100%', boxSizing: 'border-box' }}/>
              {!grupos.length && !busqueda.explicacion.length && <div style={{ ...S.apagado, marginTop: 8 }}>Nada coincide con «{buscar}».</div>}
              {buscar.trim() && !grupos.length && busqueda.explicacion.length > 0 && <div style={{ ...S.apagado, marginTop: 8 }}>Ninguna lo tiene en el nombre.</div>}
              {grupos.map(g => {
                const abierto = buscar.trim() ? true : !!abiertos[g.id], total = GRUPOS.find(x => x.id === g.id)?.conds.length ?? g.conds.length
                return (
                  <div key={g.id} data-grupo={g.id} data-abierto={abierto ? 'si' : 'no'} style={{ marginTop: 10 }}>
                    <button aria-expanded={abierto} onClick={() => setAbiertos(a => ({ ...a, [g.id]: !abierto }))} style={{ ...S.enlace, color: B.titulo, fontWeight: 600, width: '100%', display: 'flex' }}>
                      <span style={{ width: 16 }}>{abierto ? '▾' : '▸'}</span><span style={{ flex: 1 }}>{g.titulo}</span><span style={S.apagado}>{total + (buscar.trim() ? 0 : PIEZAS.filter(p => p.grupo === g.id).length)}</span>
                    </button>
                    {abierto && g.conds.map(id => (
                      <div key={id} data-cond={id} draggable onDragStart={e => { e.dataTransfer.effectAllowed = 'copy'; try { e.dataTransfer.setData('text/plain', id) } catch (_) {} setAnadiendo(null); setArrastre({ tipo: 'cond', clave: id }) }} onDragEnd={acaba}
                        title="Arrastra a una tarjeta, o pulsa «+»" style={{ padding: '6px 0 6px 16px', borderBottom: `1px solid ${B.borde}`, cursor: 'grab' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ flex: 1 }}>{nombreCond(id)}<Ayuda texto={explicacionCond(id)} etiqueta={nombreCond(id)}/></span>
                          <button style={{ ...S.boton, padding: '0 9px', fontWeight: 700 }} aria-label={`Añadir «${nombreCond(id)}»`} onClick={() => setAnadiendo(anadiendo === id ? null : id)}>+</button>
                        </div>
                        {anadiendo === id && (
                          <div data-pregunta ref={cajaAnadir} style={{ marginTop: 6 }}>
                            <div style={S.secundario}>¿Añadir a Solo opero cuando, a Compro o a Vendo?</div>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                              <button style={{ ...S.boton, padding: '3px 8px', fontSize: 13, color: MORADO, opacity: filtro.ok ? 1 : 0.5 }} disabled={!filtro.ok} onClick={() => anade(id, 'filtro')}>Solo opero cuando</button>
                              <button style={{ ...S.boton, padding: '3px 8px', fontSize: 13, color: AZUL, opacity: compra.ok ? 1 : 0.5 }} disabled={!compra.ok} onClick={() => anade(id, 'compra')}>Compro</button>
                              <button style={{ ...S.boton, padding: '3px 8px', fontSize: 13, color: NARANJA, opacity: venta.ok ? 1 : 0.5 }} disabled={!venta.ok} onClick={() => anade(id, 'venta')}>Vendo</button>
                              <button style={{ ...S.enlace, fontSize: 13, color: B.secundario, marginLeft: 4 }} onClick={() => setAnadiendo(null)}>Cancelar</button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                    {/* V9.1059: las piezas del grupo (la orden y el stop de los swings), debajo de sus condiciones */}
                    {abierto && !buscar.trim() && PIEZAS.filter(p => p.grupo === g.id).map(p => (
                      <div key={p.id} data-pieza={p.id} style={{ padding: '6px 0 6px 16px', borderBottom: `1px solid ${B.borde}`, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ flex: 1 }}>{p.nombre}<Ayuda texto={`${p.explicacion} Va en «${p.donde}».`} etiqueta={p.nombre}/></span>
                        <button style={{ ...S.boton, padding: '0 9px', fontWeight: 700 }} aria-label={`Añadir «${p.nombre}» a «${p.donde}»`} title={`Añadir a «${p.donde}»`} onClick={() => setDef(d => aplicaPieza(d, p.id))}>+</button>
                      </div>
                    ))}
                  </div>
                )
              })}
              {/* V9.1055: las piezas de las Tortugas (no son condiciones: «+» las pone en «Cómo compro» o en «Protección») */}
              {!buscar.trim() && <div data-grupo="piezas" style={{ marginTop: 14 }}>
                <div style={{ fontWeight: 600, color: B.titulo }}>Piezas de compra y de stop</div>
                {PIEZAS.filter(p => !p.grupo).map(p => (
                  <div key={p.id} data-pieza={p.id} style={{ padding: '6px 0 6px 16px', borderBottom: `1px solid ${B.borde}`, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ flex: 1 }}>{p.nombre}<Ayuda texto={`${p.explicacion} Va en «${p.donde}».`} etiqueta={p.nombre}/></span>
                    <button style={{ ...S.boton, padding: '0 9px', fontWeight: 700 }} aria-label={`Añadir «${p.nombre}» a «${p.donde}»`} title={`Añadir a «${p.donde}»`} onClick={() => setDef(d => aplicaPieza(d, p.id))}>+</button>
                  </div>
                ))}
              </div>}
              {buscar.trim() && busqueda.explicacion.length > 0 && (
                <div data-busqueda="explicacion" style={{ marginTop: 14 }}>
                  <div style={{ fontWeight: 600, color: B.titulo }}>Lo mencionan en su explicación</div>
                  {busqueda.explicacion.map(x => (
                    <div key={x.clave} data-cond-explicacion={x.clave} draggable onDragStart={e => { e.dataTransfer.effectAllowed = 'copy'; try { e.dataTransfer.setData('text/plain', x.clave) } catch (_) {} setArrastre({ tipo: 'cond', clave: x.clave }) }} onDragEnd={acaba}
                      style={{ padding: '6px 0 6px 16px', borderBottom: `1px solid ${B.borde}`, cursor: 'grab' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ flex: 1 }}>{nombreCond(x.clave)}</span>
                        <button style={{ ...S.boton, padding: '0 9px', fontWeight: 700 }} aria-label={`Añadir «${nombreCond(x.clave)}»`} onClick={() => setAnadiendo(anadiendo === x.clave ? null : x.clave)}>+</button>
                      </div>
                      <div style={{ ...S.apagado, marginTop: 2 }}>{x.antes}<mark style={{ background: '#5a4a12', color: B.titulo, borderRadius: 3, padding: '0 2px' }}>{x.palabra}</mark>{x.despues}</div>
                      {anadiendo === x.clave && (
                        <div data-pregunta ref={cajaAnadir} style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <button style={{ ...S.boton, padding: '3px 8px', fontSize: 13, color: MORADO, opacity: filtro.ok ? 1 : 0.5 }} disabled={!filtro.ok} onClick={() => anade(x.clave, 'filtro')}>Solo opero cuando</button>
                          <button style={{ ...S.boton, padding: '3px 8px', fontSize: 13, color: AZUL, opacity: compra.ok ? 1 : 0.5 }} disabled={!compra.ok} onClick={() => anade(x.clave, 'compra')}>Compro</button>
                          <button style={{ ...S.boton, padding: '3px 8px', fontSize: 13, color: NARANJA, opacity: venta.ok ? 1 : 0.5 }} disabled={!venta.ok} onClick={() => anade(x.clave, 'venta')}>Vendo</button>
                          <button style={{ ...S.enlace, fontSize: 13, color: B.secundario, marginLeft: 4 }} onClick={() => setAnadiendo(null)}>Cancelar</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Centro: las tarjetas ── */}
        <div data-columna="tarjetas" style={{ flex: '3 1 440px', minWidth: 0 }}>
          <Tarjeta titulo="Solo opero cuando…" color={MORADO} datos={{ 'data-tarjeta': 'filtro' }} soltar={soltarEn('filtro')} derecha={filtro.filas.length ? 'se cumplen todas' : 'opcional'}>
            {filtro.ok ? <>
              {filtro.filas.map((f, k) => <div key={k} {...(arrastre ? sobre('filtro', k) : {})}>{marca('filtro', k, MORADO)}<Fila f={f} errores={errFiltro[k]} valores={valoresEf} tarjeta="filtro" color={MORADO} quien={f.quien} onQuien={q => cambiaQuien(k, q)} menuAbierto={menuInicial?.tarjeta === 'filtro' && menuInicial.k === k} ayudaAbierta={ayudaInicial?.tarjeta === 'filtro' && ayudaInicial.k === k} intervalo={intervalo}
                asa={asaDe('filtro', k)} {...subeBaja('filtro', k)} avisoExtra={f.quien !== 'valor' ? avisoInd : null}
                onValor={ponValor} onCambia={g => cambiaFiltro(filtro.filas.map((x, j) => j === k ? { ...g, quien: x.quien } : x))} onQuita={() => cambiaFiltro(filtro.filas.filter((_, j) => j !== k))}/></div>)}
              {marca('filtro', filtro.filas.length, MORADO)}
              {!filtro.filas.length && vacia('Sin filtro: opera siempre que se cumpla «Compro cuando…». Añádelo desde el catálogo con «+» o arrastrándolo aquí.')}
              {filtro.filas.length > 1 && <div data-orden style={{ ...S.apagado, marginTop: 8 }}>{ORDEN_IGUAL}</div>}
            </> : <div style={{ color: AMARILLO }}>Este filtro se ve y se cambia en el Editor clásico.</div>}
            <div style={{ ...S.apagado, marginTop: 8 }}>{AYUDA_FILTRO}</div>
            <div data-como-filtrar-indice style={{ ...S.apagado, marginTop: 4 }}>{COMO_FILTRAR_INDICE}</div>
          </Tarjeta>

          <Tarjeta titulo="Compro cuando…" color={AZUL} datos={{ 'data-tarjeta': 'compra' }} soltar={soltarEn('compra')} derecha={compra.ok ? enlaceModo(modoC, cambiaModoCompra) : null}>
            {compra.ok ? <>
              {compra.filas.map((f, k) => <div key={k} {...(arrastre ? sobre('compra', k) : {})}>{marca('compra', k, AZUL)}<Fila f={f} errores={errCompra[k]} valores={valoresEf} tarjeta="compra" color={AZUL} menuAbierto={menuInicial?.tarjeta === 'compra' && menuInicial.k === k} ayudaAbierta={ayudaInicial?.tarjeta === 'compra' && ayudaInicial.k === k} intervalo={intervalo}
                asa={asaDe('compra', k)} {...subeBaja('compra', k)}
                onValor={ponValor} onCambia={g => cambiaCompra(compra.filas.map((x, j) => j === k ? g : x))} onQuita={() => cambiaCompra(compra.filas.filter((_, j) => j !== k))}/></div>)}
              {marca('compra', compra.filas.length, AZUL)}
              {!compra.filas.length && vacia(orden.modo === 'swing' ? 'Con la orden en el último máximo de swing («Cómo compro»), las condiciones de aquí son opcionales: sin ninguna, la orden está puesta en cada swing nuevo.' : orden.modo === 'ruptura' ? 'Con la orden en el nivel de ruptura («Cómo compro»), las condiciones de aquí son opcionales: sin ninguna, la orden está puesta en cada vela.' : 'Añade condiciones desde el catálogo con «+» o arrastrándolas aquí.')}
              {compra.filas.length > 1 && <div data-orden style={{ ...S.apagado, marginTop: 8 }}>{ORDEN_IGUAL}</div>}
            </> : <div style={S.secundario}>{regla.partes.find(p => p.tipo === 'compra')?.texto} <span style={{ color: AMARILLO }}>Se cambia en el Editor clásico.</span></div>}
            {sinCompra && errorTarjeta('Falta la condición de compra: añade al menos una con «+» (por ejemplo, «Cierre frente a su media»).')}
          </Tarjeta>

          <Tarjeta titulo="Vendo cuando…" color={NARANJA} datos={{ 'data-tarjeta': 'venta' }} soltar={soltarEn('venta')} derecha={venta.ok ? enlaceModo(modoV, cambiaModoVenta) : null}>
            {venta.ok ? <>
              {venta.filas.map((f, k) => <div key={k} {...(arrastre ? sobre('venta', k) : {})}>{marca('venta', k, NARANJA)}<Fila f={f} errores={errVenta[k]} valores={valoresEf} tarjeta="venta" color={NARANJA} menuAbierto={menuInicial?.tarjeta === 'venta' && menuInicial.k === k} ayudaAbierta={ayudaInicial?.tarjeta === 'venta' && ayudaInicial.k === k} intervalo={intervalo}
                asa={asaDe('venta', k)} {...subeBaja('venta', k)}
                onValor={ponValor} onCambia={g => cambiaVenta(venta.filas.map((x, j) => j === k ? g : x))} onQuita={() => cambiaVenta(venta.filas.filter((_, j) => j !== k))}/></div>)}
              {marca('venta', venta.filas.length, NARANJA)}
              {!venta.filas.length && vacia('Sin condiciones de venta: sale solo por la protección de abajo. Añádelas desde el catálogo con «+» o arrastrándolas aquí.')}
              {venta.filas.length > 1 && <div data-orden style={{ ...S.apagado, marginTop: 8 }}>{ORDEN_VENTA}</div>}
            </> : <div style={{ color: AMARILLO }}>Las condiciones de venta se ven y se cambian en el Editor clásico.</div>}
          </Tarjeta>

          <Tarjeta titulo="Cómo compro" datos={{ 'data-tarjeta': 'orden' }}>
            {orden.ok ? <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <select style={mini} aria-label="Cómo compro" value={orden.modo} onChange={e => setDef(d => ponModoOrden(d, e.target.value))}>
                  <option value="apertura">A la apertura de la vela siguiente a la señal (lo normal)</option>
                  <option value="maximo">Con una orden en el máximo de la vela de la señal</option>
                  <option value="ruptura">Orden en el nivel de ruptura: en cuanto supera el máximo de las N velas anteriores</option>
                  <option value="swing">Orden en el último máximo de swing: en cuanto supera el último máximo de swing confirmado</option>
                </select>
                <Ayuda texto={AYUDA_ORDEN} etiqueta="Cómo compro"/>
              </div>
              {orden.modo === 'ruptura' && <div data-orden-ruptura style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={linea}>Compro en cuanto el máximo de una vela supera el máximo de las <Numero valor={typeof orden.velas === 'string' && orden.velas.startsWith('$') ? valoresEf[orden.velas.slice(1)] : orden.velas} error={errVelasOrden} etiqueta="Velas anteriores de la ruptura" onCambia={v => numeroEn(orden.velas, v, d => ponVelasOrden(d, v))}/> velas anteriores (sin contar esa vela).</div>
                {errVelasOrden && <div style={{ color: ROJO, fontSize: 13 }}>{errVelasOrden}</div>}
                <div style={S.apagado}>Precio: ese nivel; si la vela abre ya por encima, a la apertura. Ejemplo: con 20, si el máximo de las 20 velas anteriores es 50 € y hoy llega a 50,40 €, compro a 50 €; si abre a 51 €, compro a 51 €.</div>
              </div>}
              {orden.modo === 'swing' && <div data-orden-swing style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={linea}>Compro en cuanto el máximo de una vela supera el último máximo de swing confirmado, con <Numero valor={numOrden(orden.izquierda)} error={errSwingOrden.izquierda} etiqueta="Velas a la izquierda del swing de la orden" onCambia={v => numeroEn(orden.izquierda, v, d => ponNivelOrden(d, 'izquierda', v))}/> velas a la izquierda y <Numero valor={numOrden(orden.derecha)} error={errSwingOrden.derecha} etiqueta="Velas a la derecha del swing de la orden" onCambia={v => numeroEn(orden.derecha, v, d => ponNivelOrden(d, 'derecha', v))}/> a la derecha.<Ayuda texto={PIEZAS.find(p => p.id === 'swing').explicacion} etiqueta="Orden en el último máximo de swing"/></div>
                {(errSwingOrden.izquierda || errSwingOrden.derecha) && <div style={{ color: ROJO, fontSize: 13 }}>{errSwingOrden.izquierda || errSwingOrden.derecha}</div>}
                <div style={S.apagado}>Precio: ese nivel; si la vela abre ya por encima, a la apertura. Cada máximo de swing se usa una vez: si el precio ya lo superó (con compra o sin ella), espera al siguiente.</div>
              </div>}
              {orden.modo === 'maximo' && <div data-orden-maximo style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={linea}>Compro solo si el precio sube hasta el máximo de las últimas <Numero valor={typeof orden.velas === 'string' && orden.velas.startsWith('$') ? valoresEf[orden.velas.slice(1)] : orden.velas} error={errVelasOrden} etiqueta="Velas de la orden" onCambia={v => numeroEn(orden.velas, v, d => ponVelasOrden(d, v))}/> velas (1 = la vela de la señal).</div>
                {errVelasOrden && <div style={{ color: ROJO, fontSize: 13 }}>{errVelasOrden}</div>}
                <div style={linea}>Si no llega, la orden <select style={mini} aria-label="Si no llega" value={orden.ajuste} onChange={e => setDef(d => ponAjuste(d, e.target.value))}>{AJUSTES.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></div>
                <div>
                  <label style={{ ...etiquetaCampo, fontWeight: 400, gap: 6 }}><input type="checkbox" style={{ width: 'auto' }} checked={!!orden.cancelar} onChange={e => setDef(d => ponCancelar(d, e.target.checked ? { cond: copia(CANCELAR_DEFECTO), env: null } : null))}/> Cancelar la orden si…</label>
                  {orden.cancelar && <Fila f={orden.cancelar} errores={errCancelar} valores={valoresEf} tarjeta="cancelar" color={AZUL} intervalo={intervalo} onValor={ponValor} onCambia={g => setDef(d => ponCancelar(d, g))} onQuita={() => setDef(d => ponCancelar(d, null))}/>}
                </div>
                <div style={S.apagado}>Ejemplo: la vela de la señal tiene máximo en 52 €: compro si en las velas siguientes llega a 52 €.</div>
              </div>}
            </> : <div style={{ color: AMARILLO }}>{fraseCompra(def, valoresEf)} Se cambia en el Editor clásico.</div>}
          </Tarjeta>

          <Tarjeta titulo="Protección" color={VERDE_AZULADO} datos={{ 'data-tarjeta': 'proteccion' }} soltar={arrastre?.tipo === 'stop' ? soltarEn('proteccion') : null}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {caja('stop', 'Stop de pérdidas', <>
                {!prot.stops.length && <select style={mini} aria-label="Stop de pérdidas" value="" onChange={e => e.target.value && setDef(d => anadeStopDef(d, e.target.value))}>
                  <option value="">Ninguno</option>{TIPOS_STOP.map(t => <option key={t.tipo} value={t.tipo}>{t.nombre}</option>)}
                </select>}
                {prot.stops.map(({ s, editable }, k) => (
                  <div key={k} data-stop={s.tipo} {...(arrastre?.tipo === 'stop' ? sobre('proteccion', k) : {})} style={{ marginTop: k ? 10 : 0, paddingTop: k ? 8 : 0, borderTop: k ? `1px solid ${B.borde}` : 'none' }}>
                    {marca('proteccion', k, VERDE_AZULADO)}
                    {editable ? <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {prot.stops.length > 1 && <span data-asa draggable {...asaDe('proteccion', k)} title="Arrastra para cambiar el orden de los stops" aria-label="Mover el stop" style={{ cursor: 'grab', color: B.apagado, fontSize: 16, userSelect: 'none' }}>{ASA}</span>}
                        {prot.stops.length > 1 && <span style={S.apagado}>{k + 1}.</span>}
                        <select style={mini} aria-label="Tipo de stop" value={s.tipo} onChange={e => setDef(d => cambiaTipoStopDef(d, k, e.target.value))}>{TIPOS_STOP.map(t => <option key={t.tipo} value={t.tipo}>{t.nombre}</option>)}</select>
                        <button style={{ ...S.enlace, color: B.apagado, marginLeft: 'auto' }} aria-label="Quitar este stop" onClick={() => setDef(d => quitaStopDef(d, k))}>×</button>
                      </div>
                      <div style={linea}>{cuerpoStop(s, k)}</div>
                      <div style={{ ...S.apagado, marginTop: 4 }}>{TIPOS_STOP.find(t => t.tipo === s.tipo)?.ejemplo}</div>
                      {Object.values(errProt.stops[k] || {}).map((e, j) => <div key={j} style={{ color: ROJO, fontSize: 13, marginTop: 4 }}>{e}</div>)}
                    </> : <div style={S.secundario}>{k + 1}. {(t => t.charAt(0).toUpperCase() + t.slice(1))(fraseStopTarjeta(s, valoresEf))}. <span style={{ color: AMARILLO }}>(se cambia en el Editor clásico)</span></div>}
                  </div>
                ))}
                {marca('proteccion', prot.stops.length, VERDE_AZULADO)}
                {prot.stops.length > 1 && <div data-modo-stops style={{ ...linea, marginTop: 8 }}>Con varios stops:
                  <select style={mini} aria-label="Con varios stops" value={leeModoStops(def)} onChange={e => setDef(d => ponModoStops(d, e.target.value))}>
                    <option value="enOrden">en su orden (el primero que se toca)</option><option value="masAlto">manda el más alto</option>
                  </select>
                  <Ayuda texto={AYUDA_MODO_STOPS} etiqueta="Con varios stops"/>
                </div>}
                {prot.stops.length > 1 && <div data-orden style={{ ...S.apagado, marginTop: 4 }}>{leeModoStops(def) === 'masAlto' ? ORDEN_STOPS_MAS_ALTO : ORDEN_STOPS}</div>}
                {prot.stops.length > 0 && <select style={{ ...mini, marginTop: 8 }} aria-label="Añadir otro stop" value="" onChange={e => e.target.value && setDef(d => anadeStopDef(d, e.target.value))}>
                  <option value="">+ Añadir otro stop</option>{TIPOS_STOP.map(t => <option key={t.tipo} value={t.tipo}>{t.nombre}</option>)}
                </select>}
              </>)}
              {caja('objetivo', 'Objetivo de ganancia (según el stop)', prot.objetivo.estado === 'otro' ? <div style={S.apagado}>Se cambia en el Editor clásico.</div> : <>
                <select style={mini} aria-label="Objetivo de ganancia" disabled={!prot.stops.length && prot.objetivo.estado === 'ninguno'} value={prot.objetivo.estado === 'ninguno' ? 'no' : 'si'}
                  onChange={e => setDef(d => ponSalida(d, 'objetivo', 'multiploR', e.target.value === 'si' ? DEFECTO_PROTECCION.objetivo : null))}>
                  <option value="no">Ninguno</option><option value="si">Vender al ganar…</option>
                </select>
                {!prot.stops.length && prot.objetivo.estado === 'ninguno' && <div style={{ ...S.apagado, marginTop: 6 }}>Necesita un stop: se calcula a partir de lo que arriesgas hasta el stop.</div>}
                {prot.objetivo.estado === 'veces' && <>
                  <div style={linea}>Vender al ganar <Numero valor={objetivoValor} error={errProt.objetivo} etiqueta="Veces lo que arriesgo" onCambia={v => numeroEn(prot.objetivo.valor, v, d => ponSalida(d, 'objetivo', 'multiploR', v))}/> veces lo que arriesgo</div>
                  {prot.stops.length > 0 && !errProt.objetivo && <div data-calculo style={{ ...S.apagado, marginTop: 4 }}>{calculoObjetivo}</div>}
                </>}
              </>, errProt.objetivo)}
              {caja('tiempo', 'Salida por tiempo', prot.tiempo.estado === 'otro' ? <div style={S.apagado}>Se cambia en el Editor clásico.</div> : <>
                <select style={mini} aria-label="Salida por tiempo" value={prot.tiempo.estado === 'ninguno' ? 'no' : 'si'} onChange={e => setDef(d => ponSalida(d, 'tope', 'velas', e.target.value === 'si' ? DEFECTO_PROTECCION.tiempo : null))}>
                  <option value="no">Ninguno</option><option value="si">Vender a las…</option>
                </select>
                {prot.tiempo.estado === 'velas' && <>
                  <div style={linea}>Vender a las <Numero valor={tiempoN} error={errProt.tiempo} etiqueta="Velas" onCambia={v => numeroEn(prot.tiempo.valor, v, d => ponSalida(d, 'tope', 'velas', v))}/> velas</div>
                  <div data-equivalencia style={{ ...S.apagado, marginTop: 4 }}>= {errProt.tiempo ? '[?]' : aTexto(tiempoN)} {intervalo === 'semanal' ? 'semanas, porque las velas son semanales' : 'días de mercado, porque las velas son diarias'}</div>
                </>}
              </>, errProt.tiempo)}
            </div>
            <div data-vigilancia style={{ ...linea, marginTop: 12 }}>
              Los stops y las salidas empiezan a vigilarse:
              <select style={mini} aria-label="Cuándo empiezan a vigilarse" value={vigilaDesdeLaCompra(def) ? 'compra' : 'siguiente'} onChange={e => setDef(d => ponVigilancia(d, e.target.value === 'compra'))}>
                <option value="siguiente">desde la vela siguiente a la compra</option><option value="compra">ya en la vela de la compra</option>
              </select>
              <Ayuda texto={AYUDA_VIGILANCIA} etiqueta="Cuándo empiezan a vigilarse"/>
            </div>
            {sinSalida && errorTarjeta('La estrategia necesita una forma de salir: una condición de venta, un stop o una salida por tiempo.')}
          </Tarjeta>

          <div data-ejecucion style={{ ...S.secundario, padding: '4px 4px 0' }}>{lineaEjecucion(def)}<button style={S.enlace} onClick={abreClasico}>Editor clásico</button>.</div>
        </div>

        {/* ── Derecha: la regla, la comprobación y guardar ── */}
        <div data-columna="regla" style={{ flex: '1 1 260px', maxWidth: 380, minWidth: 0 }}>
          <Tarjeta titulo="La regla, en una frase" datos={{ 'data-tarjeta': 'regla' }}>
            <ReglaPorBloques partes={regla.partes}/>
          </Tarjeta>
          <Tarjeta titulo="Comprobación" datos={{ 'data-tarjeta': 'comprobacion' }}>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <li data-comprueba="compra" style={{ color: sinCompra ? ROJO : B.texto }}>{sinCompra ? '✕ Falta la condición de compra' : '✓ Hay condición de compra'}</li>
              <li data-comprueba="salir" style={{ color: sinSalida ? ROJO : B.texto }}>{sinSalida ? '✕ Falta una forma de salir' : '✓ Hay forma de salir'}</li>
              {datos && datos.necesita > 0 && <li data-comprueba="datos" style={{ color: B.texto }}>{datos.ok
                ? `✓ Hay datos suficientes: la condición más larga necesita ${datos.necesita} velas previas.`
                : `✓ Necesita ${datos.necesita} velas previas: se cargarán automáticamente.`}</li>}
              {datos?.falta && <li data-comprueba="faltan" style={{ color: ROJO }}>{datos.falta.sinDatos
                ? `✕ ${nombreQuien(datos.falta.ticker)} todavía no está en los precios guardados de la app: el backtest lo descarga, pero los laboratorios de la prueba (paso 2) no lo pueden usar y el filtro no dejaría comprar nunca.`
                : `✕ Para empezar el ${fechaCorta(datos.desdePeriodo)} hacen falta datos desde el ${fechaCorta(datos.falta.hace)}, y ${nombreQuien(datos.falta.ticker)} solo tiene desde el ${fechaCorta(datos.falta.tiene)}.`}</li>}
              {nErrores > 0 && <li data-comprueba="errores" style={{ color: ROJO }}>✕ {plural(nErrores, 'error', 'errores')} en {zonas.map(([z]) => z).join(', ').replace(/, ([^,]*)$/, ' y $1')}</li>}
              {errClasico.map((e, k) => <li key={k} data-error-clasico style={{ color: ROJO, fontSize: 13 }}>{e}</li>)}
            </ul>
          </Tarjeta>
          {plan.version && <div data-aviso="version" style={{ background: '#3a3220', border: `1px solid ${AMARILLO}`, borderRadius: B.radioBoton, padding: 12, marginBottom: 12, color: B.texto }}>{avisoVersion(plan.version)}</div>}
          <button style={hayErrores || guardando ? S.botonDesactivado : S.botonVerde} disabled={hayErrores || guardando} onClick={guarda}>{guardando ? 'Guardando…' : 'Guardar y pasar al paso 2'}</button>
          {hayErrores && <div data-aviso="corrige" style={{ ...S.secundario, marginTop: 6 }}>Corrige lo que está en rojo para continuar.</div>}
          {msg && <div style={{ color: ROJO, marginTop: 6 }}>{msg}</div>}
        </div>
      </div>
      </>}

    </div>
  )
}
