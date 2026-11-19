// components/BuilderPlan.js — el paso 3 del Builder, «Convertirla en plan» (opción A del boceto, versión 2; docs/builder.md, §48). Se
// entra desde el paso 3 de la barra de pasos y desde «Paso 3 · Convertirla en plan» del resultado del paso 2 (siempre activo, también si
// la prueba no pasa). Una estrategia de tarjetas en UNA acción con el dinero de la persona: a la izquierda los bloques y «Tu dinero»; a
// la derecha, el resultado, que se recalcula solo ~600 ms después del último cambio (/api/plan, el motor de lib/planes/ sin tocar; si
// hay un cálculo en marcha, manda el último). Los números y los textos, en lib/builder/planPantalla.js. NORMA de esta pantalla: las
// explicaciones no ocupan sitio fijo; cada término lleva su «?» (components/BuilderAyuda.js) con un ejemplo con números, y los avisos
// van en una línea.
// Parte 2 (§48): arriba, una pestaña por plan guardado (planes_inversion, lib/builder/planesGuardados.js) y los nuevos sin guardar,
// con «+ Añadir plan» (copia los ajustes de ahora) y «Comparar planes» (§128: components/ComparaPlanes.js). «Guardar este plan» pide el nombre; uno guardado,
// «Guardar cambios» (§50: solo si hay cambios), «Duplicar» y «Borrar» (con confirmación). Un plan guardado lleva la foto de su estrategia: si la
// estrategia ha cambiado desde entonces, una línea lo avisa y deja usar la versión guardada (por defecto) o la de ahora.
// §49: el desplegable con todas las estrategias de tarjetas y su prueba («pasa el azar / no pasa / sin prueba»); al entrar se abre el
// plan guardado más reciente de la estrategia (o, sin ninguno, un plan nuevo): otro plan nuevo solo con «+ Añadir plan», y los nuevos
// se cierran con su ×; una fila arriba (pestañas, guardar, comparar) y los avisos en otra; la columna de ajustes, fija al bajar en
// escritorio; la comisión en %, en € fijos o en % con mínimo; con el ocioso en liquidez no se compara el ocioso.
// §50: la base de datos con el token vigente (y renovado ante 401/403); los números con coma o punto; la columna de ajustes, fija de
// verdad (esta página es la que se desplaza en escritorio); «Guardar cambios» solo con cambios y «Duplicar»; el gráfico con líneas
// continuas y finas y el importe final de cada una; «Buy&Hold X»; la línea gris de las estrategias de código en el desplegable.
// §51: «CAGR del plan»; la tabla sin la fila de liquidez, con impuestos, comisiones y órdenes por separado; los puntos se ven como comas al teclear.
//   estrategias: las filas de `strategies`; estrategiaId: la abierta. cargaSimbolos: los símbolos de la caché de precios (BuilderPanel).
//   onVolver: a «Mi trabajo»; onPaso1(fila): la estrategia en el paso 1; onPaso2(id): el paso 2 con ella.
//   deps (opcional, para las pruebas): { ctx, calcula(plan) } en lugar de la sesión y de /api/plan. inicial (opcional, para las pruebas
//   de montaje): { ajustes, resultado ({ respuesta, plan }), error, calculando, pruebas, resultadoPrueba, simbolos, planes
//   (las filas guardadas), pestana (la abierta: «g<id>» o «n1»), cambio ({ cambiada, borrada }), pideNombre, borrando,
//   nuevas ([{ clave, nombre, base }]), cerrando (la clave de la pestaña que pide confirmación) }.
//   pruebas: las de todas las estrategias (con estrategia_id).
// §54: la cabecera B (CabeceraPasos) y las PESTAÑAS DE PLANES (components/BuilderPestanas.js, lib/builder/pestanasPlan.js): una por plan abierto, con su orden guardado en la base
// (builder_pestanas); con cambios sin guardar, cualquier salida pregunta (la misma ventana que en Tesis). Esto deja atrás lo de «una pestaña por plan guardado» de la parte 2 y la «×» de §49.
//   planId: el plan que se pide abrir (desde una tesis). salida: un ref; la página pregunta por él antes de salir del Builder. inicial, además: orden, pregunta ({ tipo }), ventana ('nuevo' | { duplica }), borrando (la clave), avisoPlan, anchoPestanas.
import { useState, useEffect, useMemo, useRef, useContext, useCallback } from 'react'
import { B, C, S } from '../lib/builder/estilo'
import { CabeceraPasos } from './BuilderPanel'
import BuilderPestanas from './BuilderPestanas'
import { Pregunta } from './VentanaPregunta'
import Ayuda from './BuilderAyuda'
import BuscadorValor from './BuscadorValor'
import BotonCopiar from './BotonCopiar'
import { marcasLog, separaEtiquetas } from '../lib/builder/escalaGrafico'
import { esDeTarjetas, leerResultado } from '../lib/pruebaAzar'
import { validaPlan, paraHuellaPlan, motivoListaNoCalculable, planListaCalculable } from '../lib/planes/plan'
import { jsonCanonico } from '../lib/lotesLab'
import { AVISO_BORRADA, ETIQUETA_BORRADA, AVISO_CAMBIADA, AYUDA_CAMBIADA, borrarPlan, cambiarPlan, comparaEstrategia, crearPlan, fotoDelPlan, guardarPestanas, leerPestanas, listarPlanes, listarPruebasUsuario, nombreLimpio } from '../lib/builder/planesGuardados'
import { cambiaClave, claveDe, conPestana, eligeEntrada, idDe, idsDe, ordenInicial, sinPestana, trasDe, vecina } from '../lib/builder/pestanasPlan'
import { respondeSalida } from '../lib/tesis'
import { esDeCodigo } from '../lib/builder/codigo'
import { ctxConSesion, hayConfigSupabase } from '../lib/supabase'
// §80 (fase 3 de «el plan con lista»): las piezas del panel izquierdo del Backtesting, tal cual, para el bloque «Una lista».
import PanelAsignacion from './backtesting/PanelAsignacion'
import PanelPesos from './backtesting/PanelPesos'
import PanelUniverso from './backtesting/PanelUniverso'
import SelectorValores from './backtesting/SelectorValores'
// §168: del Backtesting solo queda la petición de los candidatos (la de «Tu dinero» con varios valores); la pestaña «La cartera por dentro» ya no está.
import { peticionPorDentro, motivoSinPeticion } from './backtesting/PlanPorDentro'
// §156: la pestaña «Detalle» (un solo cálculo, parte 2): el mismo cálculo de «Tu dinero», por dentro.
import PlanDetalle, { Ampliable, AmpliadoCtx, COLORES_BLOQUE } from './PlanDetalle'
import { AYUDA_DETALLE, detallePlan } from '../lib/builder/detallePlan'
// §128: «Comparar planes» (opción A: cada plan tal como está guardado).
import ComparaPlanes from './ComparaPlanes'
import { CLAVE_COMPARAR, REFS_COMPARAR, TEXTO_SIN_PLANES, alterna, copiaDeAhora, copiasDe, eleccionCopias, elegidosIniciales, mismoId, nombreParaGuardar, paraRecordar, pieza as piezaDe, trasGuardarCopia } from '../lib/builder/comparaPlanes'
import MenuCompararEstrategias from './MenuCompararEstrategias'
import { SelectorEstrategia } from './ListaEstrategias'
import { cargaUniversoMc, nDeUniverso, nombreUniverso, reglaDeUniverso } from '../lib/universoMc'
import FiltrosDelPlan from './FiltrosDelPlan'
import { filtrosPropios, respetaPropios, usoDeLaEstrategia } from '../lib/builder/filtrosPlan'
import { hayFiltrosActivos } from '../lib/filtros'
import { sinTildes } from '../lib/builder/buscar'
// §144: lo que enseña el selector de valores con un plan de «una acción»: la lista manual con su único valor.
const listaDeAccion = (x) => ({ ...(x.lista || {}), universo: 'manual', simbolos: x.activo ? [x.activo] : [] })
import { numeroEs } from '../lib/utils'
import { AJUSTES_PLAN, AVISO_A_MANO, AVISO_NO_EXISTE, avisoPrueba as textoAvisoPrueba, AYUDA_COMISION, AYUDA_PLAN, ETIQUETA_PRUEBA, OCIOSOS_FIJOS, PERIODOS_PLAN, SIN_OCIOSO, SUBIDA_DEFECTO, TIPOS_COMISION, ajustesDe,
  ayudaCaida, ayudaPrueba, avisoListaSimple, reglaDe, baseNueva, cifrasPlan, conCambios, conComa, nombreNueva, creaCalculador, estadoPrueba, estadosPrueba, esSemanal, velasDeEstrategia, velasDelPlan, euros, fechaCorta, fechasDe, finalesDe, fraseCaidas, pct, planDe, puntos, textoCampo, textoEuros, CLAVE_LINEAS, LINEAS_DEFECTO,
  textoCodigo, textoParaClaudePlan, TITULO_ALTERNATIVAS, resumenDinero, bloquesDe, estrategiaBloque, anadeBloque, quitaBloque, repartirResto, sumaPesos, AYUDA_BLOQUES,
  esBloquePesos, sumaPesosBloque, resumenPesos, AYUDA_PESOS, VOLVER_OPCIONES, LLEGA_OPCIONES, PUNTOS_BANDA_DEFECTO } from '../lib/builder/planPantalla'
import { MAX_SIMBOLOS_PESOS } from '../lib/planes/pesos'
// §187: los colores de los bloques (el 1, azul, como siempre): COLORES_BLOQUE de PlanDetalle (§188: los mismos en «Detalle»).

const CLAVE_PANEL = 'builder_plan_panel_oculto'   // §165
// §189: cada bloque, con un marco de su color (más grueso a la izquierda) y la cabecera teñida de su color, para distinguirlos de un vistazo.
const marcoBloque = (color) => ({ borderTop: `1px solid color-mix(in srgb, ${color} 55%, ${B.borde})`, borderRight: `1px solid color-mix(in srgb, ${color} 55%, ${B.borde})`, borderBottom: `1px solid color-mix(in srgb, ${color} 55%, ${B.borde})`, borderLeft: `5px solid ${color}`, borderRadius: B.radioBoton, background: `color-mix(in srgb, ${color} 4%, ${B.tarjeta})` })
const fondoCabeceraBloque = (color) => `color-mix(in srgb, ${color} 16%, transparent)`
// §189: el ancho del panel de la izquierda, arrastrando su borde (se recuerda en este navegador; doble clic = el de siempre).
const CLAVE_ANCHO = 'builder_plan_ancho_panel', ANCHO_MIN = 300, ANCHO_MAX = 760
// §178: los colores con significado, como variables (cambian con el tono ☀/☾).
const AMARILLO = C.amarillo, ROJO = C.rojo, VERDE = C.verde, AZUL = C.azul, GRIS_FRANJA = C.ejeCero
const campo = { fontFamily: B.letra, fontSize: B.base, background: B.fondo, color: B.texto, border: `1px solid ${B.borde}`, borderRadius: B.radioBoton, padding: '7px 10px' }
const etiqueta = { fontWeight: 600, color: B.titulo, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 2 }
const celda = { padding: '8px 10px', borderBottom: `1px solid ${B.borde}`, textAlign: 'left', verticalAlign: 'top' }
const cab = { ...celda, color: B.secundario, fontWeight: 600, fontSize: 12, background: B.cabecera }
const seg = (on, desactivado) => ({ fontFamily: B.letra, fontSize: 14, padding: '6px 12px', cursor: desactivado ? 'not-allowed' : 'pointer', border: `1px solid ${on ? B.siguienteBorde : B.borde}`,
  background: on ? B.siguienteFondo : 'transparent', color: desactivado ? B.apagado : on ? B.titulo : B.secundario, fontWeight: on ? 700 : 400 })
const borde = (i, n) => ({ borderRadius: n === 1 ? 6 : i === 0 ? '6px 0 0 6px' : i === n - 1 ? '0 6px 6px 0' : 0, ...(i ? { borderLeft: 'none' } : {}) })

// Un grupo de botones (uno elegido). opciones: [[valor, texto, desactivado?]].
function Segmentos({ opciones, valor, onCambia, etiquetaGrupo }) {
  return (
    <div role="group" aria-label={etiquetaGrupo} style={{ display: 'flex', flexWrap: 'wrap' }}>
      {opciones.map(([v, t, des], i) => <button key={String(v)} type="button" aria-pressed={valor === v} disabled={!!des} title={des || undefined} onClick={() => onCambia(v)} style={{ ...seg(valor === v, !!des), ...borde(i, opciones.length) }}>{t}</button>)}
    </div>
  )
}
const Etiqueta = ({ texto, ayuda }) => <div style={etiqueta}>{texto}{ayuda && <Ayuda texto={ayuda} etiqueta={texto}/>}</div>
// §50: un campo de número que acepta coma y punto («0,1» y «0.1»), como components/CondicionesSimulacion.js: un campo de texto con
// inputMode="decimal" y el texto que se escribe como estado suyo («0,» todavía no es un número y no se borra). Cada texto que ya es un
// número se pasa al momento (a los ajustes va siempre un número; vacío, ''); al salir del campo se reescribe con coma (textoCampo).
// minimo: el menor que se admite (por defecto 0); lo demás no se pasa y, al salir, vuelve el valor de antes.
// §51: todo punto se ve como coma ya al teclear; se cambia en el propio campo y se deja el cursor donde estaba (React no lo reescribe si ya coincide).
// §56: enEuros: fuera del campo se ve con punto de miles (10.000); al entrar en él, sin puntos, y se teclea como siempre (un punto tecleado sigue siendo coma). El valor que va a los ajustes es el mismo número.
function CampoNumero({ valor, onCambia, etiqueta: nombre, ancho, minimo = 0, enEuros = false }) {
  const [txt, setTxt] = useState(() => enEuros ? textoEuros(valor) : textoCampo(valor))
  const dentro = useRef(false)
  useEffect(() => { setTxt(t => enEuros && !dentro.current ? textoEuros(valor) : numeroEs(t) === (valor === '' ? null : Number(valor)) ? t : textoCampo(valor)) }, [valor])
  return <input type="text" inputMode="decimal" aria-label={nombre} value={txt} style={{ ...campo, width: ancho }} onFocus={() => { dentro.current = true; if (enEuros) setTxt(textoCampo(valor)) }} onBlur={() => { dentro.current = false; setTxt(enEuros ? textoEuros(valor) : textoCampo(valor)) }}
    onChange={e => { const el = e.target, t = conComa(el.value), n = numeroEs(t); if (t !== el.value) { const cur = el.selectionStart; el.value = t; el.setSelectionRange(cur, cur) } setTxt(t); if (!t.trim()) onCambia(''); else if (n != null && n >= minimo) onCambia(n) }}/>
}

// El ancho real del gráfico: 1 unidad = 1 píxel, las letras miden siempre 12 px. Sin navegador, 760.
export function useAncho(defecto = 760) {
  const ref = useRef(null)
  const [w, setW] = useState(defecto)
  useEffect(() => {
    const el = ref.current; if (!el) return
    const mide = () => { const x = el.clientWidth; if (x > 0) setW(Math.round(x)) }
    mide()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(mide) : null
    ro?.observe(el)
    return () => ro?.disconnect()
  }, [])
  return [ref, w]
}

// «Cómo crece tu dinero»: tu plan, comprar y mantener la acción (Buy&Hold), el mismo plan con el ocioso en liquidez y lo aportado
// (escalonado), en escala logarítmica; debajo, la franja dentro de la acción / en el ocioso. §50: todas continuas y finas, de colores
// bien distintos, y al final de cada una su nombre y su importe final (el de la tabla: tras vender todo y pagar impuestos y comisiones). §53: el último
// punto de cada línea es ese mismo importe (cifrasPlan), así que línea y etiqueta coinciden.
export const LINEAS_PLAN = [
  { k: 'plan', t: 'Tu plan', color: AZUL, ancho: 2 },
  { k: 'activo', t: 'Buy&Hold', color: C.grisClaro, ancho: 1.5 },
  { k: 'spy', t: 'Buy&Hold SPY', color: C.morado, ancho: 1.5 },
  { k: 'qqq', t: 'Buy&Hold QQQ', color: C.cian, ancho: 1.5 },
  { k: 'ociosoLiquidez', t: 'Ocioso en liquidez', color: C.naranja, ancho: 1.5 },
  { k: 'aportado', t: 'Lo aportado', color: C.grisLinea, ancho: 1, escalon: true },
]
const nombreLinea = (l, activo) => l.k === 'activo' && activo ? `${l.t} ${activo}` : l.t
// finales: { plan, activo, spy, qqq, ociosoLiquidez, aportado } en euros (el texto al final de cada línea; sin él, solo el nombre). §57: visibles: { clave: sí o no } (Tu plan siempre se ve); más alto (375 px, antes 250).
// §93: proporcion (con una lista): la franja enseña cada día la parte del dinero en valores (altura azul) y en el ocioso (gris), y al pasar
// el ratón, la fecha y las dos partes.
function GraficoPlan({ curva, activo, finales = {}, visibles = LINEAS_DEFECTO, proporcion = false }) {
  const [ref, W] = useAncho()
  const [hov, setHov] = useState(null)
  const amp = useContext(AmpliadoCtx)   // §166: a pantalla completa, más alto
  const IZQ = 76, DER = 200, H1 = amp?.alto ? Math.max(375, amp.alto - 120) : 375, ARR = 22, FR = proporcion ? 40 : 14, n = curva.fechas.length
  const lineas = LINEAS_PLAN.filter(l => curva[l.k]?.length && (l.k === 'plan' || visibles[l.k])).map(l => ({ ...l, t: `${nombreLinea(l, activo)}${Number.isFinite(finales[l.k]) ? ` ${euros(finales[l.k], 0)}` : ''}`, v: curva[l.k] }))
  const vals = lineas.flatMap(l => l.v).filter(v => Number.isFinite(v) && v > 0)
  if (!vals.length || n < 2) return null
  const lo = Math.min(...vals), hi = Math.max(...vals), L = Math.log
  const x = (i) => IZQ + i / (n - 1) * (W - IZQ - DER)
  const y = (v) => ARR + (1 - (L(Math.max(v, lo)) - L(lo)) / ((L(hi) - L(lo)) || 1)) * (H1 - ARR - 24)
  const ruta = (s, escalon) => {
    const out = []
    s.forEach((v, i) => { if (!Number.isFinite(v)) return; if (escalon && i > 0 && Number.isFinite(s[i - 1]) && s[i - 1] !== v) out.push(`${x(i).toFixed(1)},${y(s[i - 1]).toFixed(1)}`); out.push(`${x(i).toFixed(1)},${y(v).toFixed(1)}`) })
    return out.join(' ')
  }
  const etq = separaEtiquetas(lineas.map(l => ({ t: l.t, color: l.color, y: y(l.v[l.v.length - 1]) })), ARR, H1 - 30)
  const anios = []; curva.fechas.forEach((f, i) => { if (i === 0 || f.slice(0, 4) !== curva.fechas[i - 1].slice(0, 4)) anios.push([i, f.slice(0, 4)]) })
  const paso = Math.max(1, Math.ceil(anios.length / Math.max(1, Math.floor((W - IZQ - DER) / 44))))
  // La franja: tramos seguidos dentro (1) / en el ocioso (0).
  const tramos = []
  curva.dentro.forEach((d, i) => { const u = tramos[tramos.length - 1]; if (u && u.d === d) u.h = i; else tramos.push({ d, i, h: i }) })
  const yF = H1 + 8, ancho1 = n > 1 ? (W - IZQ - DER) / (n - 1) : 0
  const resumen = `Cómo crece tu dinero, en escala logarítmica, del ${fechaCorta(curva.fechas[0])} al ${fechaCorta(curva.fechas[n - 1])}: ` + lineas.map(l => `${nombreLinea(LINEAS_PLAN.find(x => x.k === l.k), activo)} termina en ${euros(Number.isFinite(finales[l.k]) ? finales[l.k] : l.v[l.v.length - 1], 0)}`).join('; ') + '.'
  return (
    <div ref={ref} style={{ width: '100%', marginTop: 6 }}>
      <svg data-grafico="plan" width={W} height={yF + FR + (proporcion ? 22 : 4)} role="img" aria-label={resumen} style={{ display: 'block', fontFamily: B.letra }}>
        <text data-escala="log" x={4} y={12} fontSize={12} fill={B.apagado}>escala logarítmica</text>
        {marcasLog(lo, hi).map((t, k) => <g key={k}><line x1={IZQ} x2={W - DER} y1={y(t)} y2={y(t)} stroke={C.rejilla}/><text x={IZQ - 6} y={y(t) + 4} textAnchor="end" fontSize={12} fill={B.apagado}>{euros(t, 0)}</text></g>)}
        {anios.filter((_, k) => k % paso === 0).map(([i, a]) => <text key={a} x={x(i)} y={H1 - 6} fontSize={12} fill={B.apagado}>{a}</text>)}
        {[...lineas].reverse().map(l => <polyline key={l.k} data-linea={l.k} points={ruta(l.v, l.escalon)} fill="none" stroke={l.color} strokeWidth={l.ancho} strokeLinejoin="round"/>)}
        {etq.map(e => <text key={e.t} data-etiqueta={e.t} x={W - DER + 8} y={e.y + 4} fontSize={12} fill={e.color} fontWeight={e.color === AZUL ? 700 : 400}>{e.t}</text>)}
        {proporcion ? <g data-franja-proporcion={n}>
          <rect x={IZQ} y={yF} width={Math.max(0, W - IZQ - DER)} height={FR} fill={GRIS_FRANJA}/>
          <polygon points={`${x(0).toFixed(1)},${yF + FR} ${curva.dentro.map((d, i) => `${x(i).toFixed(1)},${(yF + FR - Math.max(0, Math.min(1, d || 0)) * FR).toFixed(1)}`).join(' ')} ${x(n - 1).toFixed(1)},${yF + FR}`} fill={AZUL}/>
          <text x={IZQ - 6} y={yF + 10} textAnchor="end" fontSize={11} fill={B.apagado}>100 %</text>
          <text x={IZQ - 6} y={yF + FR} textAnchor="end" fontSize={11} fill={B.apagado}>0 %</text>
          {hov != null && <><line x1={x(hov)} x2={x(hov)} y1={yF} y2={yF + FR} stroke={B.titulo} strokeWidth={1}/>
            <text data-franja-dato x={IZQ} y={yF + FR + 15} textAnchor="start" fontSize={12} fill={B.texto}>{`${fechaCorta(curva.fechas[hov])} · en valores ${pct(curva.dentro[hov], 0)} · en el ocioso ${pct(1 - curva.dentro[hov], 0)}`}</text></>}
          <rect x={IZQ} y={yF} width={Math.max(0, W - IZQ - DER)} height={FR} fill="transparent" onMouseLeave={() => setHov(null)} onMouseMove={e => { const r = e.currentTarget.getBoundingClientRect(); const i = Math.round((e.clientX - r.left) / Math.max(1, r.width) * (n - 1)); setHov(Math.max(0, Math.min(n - 1, i))) }}/>
        </g>
        : <g data-franja={tramos.length}>{tramos.map((t, k) => <rect key={k} data-dentro={t.d} x={x(t.i) - (t.i ? ancho1 / 2 : 0)} width={Math.max(0.5, (t.h - t.i) * ancho1 + (t.i ? ancho1 / 2 : 0) + (t.h < n - 1 ? ancho1 / 2 : 0))} y={yF} height={FR} fill={t.d ? AZUL : GRIS_FRANJA}/>)}</g>}
      </svg>
    </div>
  )
}
// §57: cada línea que se puede ocultar lleva su casilla; Tu plan, no.
function Leyenda({ curva, activo = null, visibles = LINEAS_DEFECTO, onMarca = null, proporcion = false }) {
  const muestra = (l) => <svg width="30" height="10" aria-hidden="true"><line x1="1" x2="29" y1="5" y2="5" stroke={l.color} strokeWidth={l.ancho}/></svg>
  return (
    <div data-leyenda style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', fontSize: 12, color: B.secundario, marginTop: 6, alignItems: 'center' }}>
      {LINEAS_PLAN.filter(l => curva[l.k]?.length).map(l => l.k === 'plan' ? <span key={l.k} data-muestra={l.k} style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>{muestra(l)}{nombreLinea(l, activo)}</span>
        : <label key={l.k} data-muestra={l.k} style={{ display: 'inline-flex', flexDirection: 'row', gap: 6, alignItems: 'center', cursor: 'pointer', margin: 0, padding: 0, fontFamily: B.letra, fontSize: 12, fontWeight: 400, color: B.secundario, letterSpacing: 'normal', textTransform: 'none' }}><input type="checkbox" data-casilla={l.k} checked={!!visibles[l.k]} onChange={e => onMarca?.(l.k, e.target.checked)} style={{ margin: 0, width: 'auto', padding: 0 }}/>{muestra(l)}{nombreLinea(l, activo)}</label>)}
      {curva.dentro?.length > 0 && <><span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><span style={{ width: 14, height: 10, background: AZUL, display: 'inline-block' }}/>{proporcion ? 'parte en valores' : 'dentro de la acción'}</span>
      <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><span style={{ width: 14, height: 10, background: GRIS_FRANJA, display: 'inline-block' }}/>{proporcion ? 'parte en el ocioso' : 'en el ocioso'}</span></>}
    </div>
  )
}

// §90: el color de una cifra según su signo (verde si suma, rojo si resta; 0 o sin número, el de siempre).
// §178: los colores de texto escritos tal cual en las piezas del Backtesting (components/backtesting/), y el del tono que los sustituye
// dentro del plan. El navegador guarda el color del style como «color: rgb(r, g, b)»: se busca así (al principio o tras «; », para no
// confundirlo con «background-color»).
const MAPA_PIEZAS = [['#cde5ff', 'texto'], ['#d0e8fa', 'texto'], ['#e0e8f0', 'texto'], ['#c8dff5', 'texto'], ['#b0d0e8', 'secundario'], ['#a8ccdf', 'secundario'], ['#7aabc8', 'secundario'], ['#ffd166', 'cAmarillo'], ['#ff4d6d', 'cRojo']]
const rgbDe = (h) => `rgb(${parseInt(h.slice(1, 3), 16)}, ${parseInt(h.slice(3, 5), 16)}, ${parseInt(h.slice(5, 7), 16)})`
export const COLORES_PIEZAS = MAPA_PIEZAS.map(([h, k]) => `.bp-mc [style^="color: ${rgbDe(h)}"], .bp-mc [style*="; color: ${rgbDe(h)}"] { color: var(--bd-${k}) !important }`).join('\n')
// §174: alto de la franja de arriba de cada columna («◀ Ocultar el panel» y «Tu dinero / Detalle»), igual en las dos.
const ALTO_BARRA_COL = 40
const colorSigno = (v) => Number.isFinite(v) && v > 0 ? VERDE : Number.isFinite(v) && v < 0 ? ROJO : undefined
function Cifra({ id, titulo, ayuda, valor, sub, color }) {
  return (
    <div data-cifra={id} style={{ flex: '1 1 165px', border: `1px solid ${B.borde}`, borderRadius: B.radioBoton, padding: '10px 12px', background: B.fondo, minWidth: 0 }}>
      <div style={{ ...S.secundario, fontSize: 13, display: 'flex', alignItems: 'center', gap: 2 }}>{titulo}<Ayuda texto={ayuda} etiqueta={titulo}/></div>
      <div data-valor style={{ fontSize: 20, fontWeight: 700, color: color || B.titulo, marginTop: 2, overflowWrap: 'anywhere' }}>{valor}</div>
      {sub && <div data-sub style={{ ...S.apagado, marginTop: 2 }}>{sub}</div>}
    </div>
  )
}
const Tarjeta = ({ id, titulo, ayuda, children }) => (
  <div data-tarjeta={id} style={{ ...S.tarjeta, marginTop: 16 }}>
    <div style={{ ...S.cabeceraTarjeta, display: 'flex', alignItems: 'center', gap: 2 }}>{titulo}{ayuda && <Ayuda texto={ayuda} etiqueta={titulo}/>}</div>
    <div style={S.cuerpo}>{children}</div>
  </div>
)

export default function BuilderPlan({ estrategias = [], estrategiaId = null, planId = null, apiFetch, version = null, cargaSimbolos = null, onVolver, onPaso1, onPaso2, salida = null, enlaceTesis = null, deps = null, inicial = null, datosLista = null, onIrAValor = null, tema = 'oscuro', nuevo = false, comparar = false }) {
  const tarjetas = useMemo(() => estrategias.filter(esDeTarjetas).sort((a, b) => String(a.name).localeCompare(String(b.name), 'es')), [estrategias])
  // §145: el plan admite estrategias de velas diarias y semanales (antes, solo las diarias: de ahí el nombre).
  const diarias = tarjetas
  const deCodigo = useMemo(() => estrategias.filter(esDeCodigo).length, [estrategias])
  // Las pestañas (§54): en `orden`, las claves abiertas: los planes guardados («g<id>») y los nuevos sin guardar («n<k>»); null: se están leyendo. La abierta se edita en a / estId / version;
  // un plan nuevo al que se deja de mirar espera en `edic` (un guardado no: con cambios, antes de irse se pregunta).
  const [planes, setPlanes] = useState(inicial?.planes || null)
  const [falloPlanes, setFalloPlanes] = useState(null)
  const deFila = (r) => ({ a: ajustesDe(r.plan), estId: String(fotoDelPlan(r.plan)?.id ?? ''), version: 'guardada' })
  const borrador = () => ({ a: { ...AJUSTES_PLAN, ...(inicial?.ajustes || {}) }, estId: String((diarias.find(s => String(s.id) === String(estrategiaId)) || diarias[0])?.id ?? ''), version: 'actual' })
  const base = baseNueva   // lo que tenía un plan nuevo al crearlo (para saber si tiene cambios)
  const inicio = useMemo(() => {
    const r = inicial?.pestana && (inicial.planes || []).find(p => claveDe(p.id) === inicial.pestana)
    if (r) return { clave: inicial.pestana, ...deFila(r) }
    if (inicial?.pestana?.startsWith('n')) return { clave: inicial.pestana, ...borrador() }
    if (inicial?.planes) {
      const e = eligeEntrada({ planes: inicial.planes, orden: inicial.orden || ordenInicial(null, inicial.planes), estrategiaId, planId, fotoDe: fotoDelPlan })
      const x = e.clave && inicial.planes.find(p => claveDe(p.id) === e.clave)
      if (x) return { clave: e.clave, ...deFila(x) }
      return { clave: e.nuevo ? 'n1' : null, ...borrador() }
    }
    return { clave: null, ...borrador() }
  }, [])
  const [nuevas, setNuevas] = useState(() => inicial?.nuevas || (inicio.clave?.startsWith('n') ? [{ clave: inicio.clave, nombre: 'Plan nuevo', base: base(inicio) }] : []))
  const [orden, setOrden] = useState(() => inicial?.orden || (inicial?.planes ? [...new Set([...ordenInicial(null, inicial.planes), ...nuevas.map(x => x.clave), ...(inicio.clave ? [inicio.clave] : [])])] : null))
  const [actual, setActual] = useState(inicio.clave)
  const [estId, setEstId] = useState(inicio.estId)
  const [a, setA] = useState(inicio.a)
  const [cualVersion, setCualVersion] = useState(inicio.version)   // en un plan guardado: 'guardada' (la foto del plan) o 'actual' (la estrategia de ahora)
  const edic = useRef({}), cuentaNuevas = useRef(1), ultimasIds = useRef(null)
  const fila = actual?.startsWith('g') ?(planes || []).find(p => `g${p.id}` === actual) || null : null
  const fotoG = fila ? fotoDelPlan(fila.plan) : null
  const estrategiaActual = diarias.find(s => String(s.id) === estId) || null
  const usaGuardada = !!fotoG && String(fotoG.id) === estId && (cualVersion === 'guardada' || !estrategiaActual)
  const estrategia = usaGuardada ? fotoG : estrategiaActual
  const estBorrada = !!fotoG && String(fotoG.id) === estId && !estrategias.some(s => String(s.id) === estId)   // §60: se borró; el plan sigue con su copia
  const cambia = (k, v) => setA(x => ({ ...x, [k]: v }))
  const [otroForzado, setOtroForzado] = useState(false)
  // §187: los bloques extra: { id: plegado (false) / abierto } (de entrada, abierto) y { id: su lista de valores abierta }.
  const [extraAbiertos, setExtraAbiertos] = useState({})
  const [valoresExtra, setValoresExtra] = useState({})
  const [menuBloque, setMenuBloque] = useState(false)   // §197: el desplegable de «+ Añadir bloque ▾»
  // §189: «Tu dinero», plegado en una línea en los planes guardados y abierto en los nuevos (por plan; solo en pantalla).
  const [dineroAb, setDineroAb] = useState({})
  const [bloqueAbierto, setBloqueAbierto] = useState(true)   // §142: la fila del bloque de «Cartera», abierta o plegada (solo en pantalla)
  // §189: el ancho del panel de la izquierda (null = el de siempre: hasta 520 px).
  const [anchoIzq, setAnchoIzq] = useState(() => { try { const v = Number(localStorage.getItem(CLAVE_ANCHO)); return v >= ANCHO_MIN && v <= ANCHO_MAX ? v : null } catch (_) { return null } })
  const izqRef = useRef(null)
  const arrastraBorde = (e) => {
    e.preventDefault()
    const x0 = izqRef.current?.getBoundingClientRect?.().left ?? 0
    const mueve = (ev) => setAnchoIzq(Math.round(Math.max(ANCHO_MIN, Math.min(ANCHO_MAX, ev.clientX - x0))))
    const suelta = () => { window.removeEventListener('mousemove', mueve); window.removeEventListener('mouseup', suelta); document.body.style.userSelect = ''
      setAnchoIzq(v => { try { if (v != null) localStorage.setItem(CLAVE_ANCHO, String(v)) } catch (_) {} return v }) }
    document.body.style.userSelect = 'none'
    window.addEventListener('mousemove', mueve); window.addEventListener('mouseup', suelta)
  }
  const anchoNormal = () => { setAnchoIzq(null); try { localStorage.removeItem(CLAVE_ANCHO) } catch (_) {} }
  const dineroAbierto = dineroAb[actual] ?? inicial?.dineroAbierto ?? !String(actual || '').startsWith('g')   // §189
  const otroOcioso = otroForzado || !OCIOSOS_FIJOS.some(([k]) => k === a.ocioso)
  const setOtroOcioso = setOtroForzado
  const [cambio, setCambio] = useState(inicial?.cambio || null)   // { cambiada, borrada } del plan guardado abierto
  const [pregunta, setPregunta] = useState(inicial?.pregunta || null)   // la ventana «Tienes cambios sin guardar…»: { tipo, … }, lo que se hará después (ejecuta)
  const [tras, setTras] = useState(null)   // lo que toca hacer tras guardar o descartar, ya con el estado al día
  const [ventana, setVentana] = useState(inicial?.ventana || null)   // la ventana del nombre: 'nuevo' (guardar un plan nuevo) o { duplica: clave }
  const [nombreNuevo, setNombreNuevo] = useState('')
  const [borrando, setBorrando] = useState(inicial?.borrando || null)   // la clave del plan que pide «¿Borrar?»
  const [avisoPlan, setAvisoPlan] = useState(inicial?.avisoPlan || null)   // el plan pedido desde una tesis ya no existe
  const [falloPestanas, setFalloPestanas] = useState(false)
  const [finales, setFinales] = useState(inicial?.finales || {})   // { id: € al final }, de los planes ya calculados: para «+ Añadir plan»
  const [guardando, setGuardando] = useState(false)
  const [falloGuardar, setFalloGuardar] = useState(null)
  const [simbolos, setSimbolos] = useState(inicial?.simbolos || ['AAPL', 'GLD', 'QQQ'])
  const [calc, setCalc] = useState({ calculando: !!inicial?.calculando, resultado: inicial?.resultado || null, error: inicial?.error || null })
  const [todasPruebas, setTodasPruebas] = useState(inicial?.pruebas || null)
  // §57: las líneas marcadas del gráfico, recordadas en este navegador (si no se puede leer o escribir, las de por defecto).
  const [lineasVisibles, setLineasVisibles] = useState(inicial?.lineas || LINEAS_DEFECTO)
  useEffect(() => { if (inicial?.lineas) return; try { const g = JSON.parse(window.localStorage.getItem(CLAVE_LINEAS)); if (g && typeof g === 'object') setLineasVisibles({ ...LINEAS_DEFECTO, ...g }) } catch (_) {} }, [])
  const marcaLinea = (k, si) => { const x = { ...lineasVisibles, [k]: si }; setLineasVisibles(x); try { window.localStorage.setItem(CLAVE_LINEAS, JSON.stringify(x)) } catch (_) {} }
  const [resPrueba, setResPrueba] = useState(inicial?.resultadoPrueba || null)
  // §84: con «Una lista», la columna derecha tiene dos pestañas: «Tu dinero» y «La cartera por dentro» (boceto C). Solo de la vista.
  const [vistaDer, setVistaDer] = useState(inicial?.vistaDer || 'dinero')
  // §165: el panel de la izquierda plegado o no, recordado en este navegador.
  const [panelOculto, setPanelOculto] = useState(!!inicial?.panelOculto)
  useEffect(() => { if (inicial?.panelOculto != null) return; try { if (window.localStorage.getItem(CLAVE_PANEL) === '1') setPanelOculto(true) } catch (_) {} }, [])
  const ponPanelOculto = (x) => { setPanelOculto(x); try { window.localStorage.setItem(CLAVE_PANEL, x ? '1' : '0') } catch (_) {} }
  // §128: «Comparar planes». comparando: se ve la comparación en lugar del plan abierto (que sigue con sus cambios). Lo elegido, recordado
  // en este navegador (CLAVE_COMPARAR); el modo del gráfico (null = el de por defecto), solo en esta visita. resComp: { id: estado de su cálculo }.
  const [comparando, setComparando] = useState(!!inicial?.comparando || !!comparar)   // §140: comparar: se entra comparando (desde la portada de Planes)
  // §169: copias: ids de las estrategias con las que se compara el plan abierto (copias sin guardar; ver copiasComp).
  const [comp, setComp] = useState(() => ({ elegidos: inicial?.compararElegidos || null, refs: REFS_COMPARAR.map(r => r.id), log: true, modo: null, plegado: !!inicial?.compararPlegado, copias: inicial?.compararCopias || [], conAhora: !!inicial?.compararAhora, vista: inicial?.compararVista || null }))
  const [resComp, setResComp] = useState(inicial?.resComp || {})
  // §80: «Una lista». Lo que se guarda va en a.lista (lib/planes/lista.js); esto es solo de la vista (buscar, ★, la lista de la Watchlist, qué está desplegado).
  const [vistaLista, setVistaLista] = useState({ busca: '', favs: false, lista: '', seccion: { mode: true, strats: false }, universoDatos: {} })
  // §154: el selector de valores, plegado en una línea («AAPL», «12 valores · …») con «Cambiar ▾»; null = lo de por defecto (abierto solo
  // si aún no hay ningún valor marcado). primeros: los marcados al abrirlo, que salen arriba de la lista (no saltan al marcar o desmarcar).
  const [valoresAbiertos, setValoresAbiertos] = useState(inicial?.valoresAbiertos ?? null)
  const [primeros, setPrimeros] = useState(null)
  const ponVista = (k) => (v) => setVistaLista(x => ({ ...x, [k]: typeof v === 'function' ? v(x[k]) : v }))
  const ponLista = (k) => (v) => setA(x => ({ ...x, lista: { ...x.lista, [k]: typeof v === 'function' ? v(x.lista[k]) : v } }))
  // §144: un solo selector de valores (sin «Una acción / Una lista»). Lo que se guarda no cambia: con UN valor de la lista manual y
  // el plan es el de «una acción» de siempre (donde: 'accion', activo); con varios o con el Nasdaq-100, el de «una lista». Solo se decide
  // al tocar los valores o el universo: un plan guardado se abre como está. §153: los filtros del plan (a.filtros, del catálogo) NO lo
  // convierten en lista: con un valor conservan el apalancamiento y «Compra más acción» (solo un filtro del panel antiguo, ya retirado, lo haría).
  const ponValores = (k) => (v) => setA(x => {
    const l0 = x.donde === 'lista' ? x.lista : listaDeAccion(x), l = { ...l0, [k]: typeof v === 'function' ? v(l0[k]) : v }
    const uno = (l.universo || 'manual') === 'manual' && (l.simbolos || []).length === 1 && !hayFiltrosActivos(l.filtros || [])
    return uno ? { ...x, lista: l, donde: 'accion', activo: l.simbolos[0] } : { ...x, lista: l, donde: 'lista' }
  })
  const vivo = useRef(true)
  useEffect(() => { vivo.current = true; return () => { vivo.current = false } }, [])
  // §50: la columna de ajustes fija al bajar. En la app se desplaza la VENTANA, pero entre la columna y la ventana hay contenedores con
  // overflow que no se desplazan nunca (esta página, .content y .main de pages/index.js), y un sticky se pega al más cercano: no se movía
  // nada. Así que en escritorio (≥ 1000 px) esta página es la que se desplaza, con el alto de la ventana menos lo que tiene encima (la
  // cabecera de la app y, si sale, el aviso de configuración: se mide aquí, `arriba`), y la columna se pega a ella. Sin tocar index.js.
  const pagina = useRef(null)
  const [arriba, setArriba] = useState(null)
  useEffect(() => {
    const el = pagina.current; if (!el || typeof window === 'undefined') return
    const mide = () => { const t = Math.round(el.getBoundingClientRect().top + window.scrollY); if (t >= 0) setArriba(t) }
    mide()
    window.addEventListener('resize', mide)
    return () => window.removeEventListener('resize', mide)
  }, [])
  // §50: el token, el vigente en cada llamada (y renovado ante 401/403), no el del momento de montar: ctxConSesion (lib/supabase.js).
  const ctx = useMemo(() => deps?.ctx || (hayConfigSupabase() ? ctxConSesion() : null), [deps])
  const nombre = estrategia?.name || 'tu estrategia'

  // El plan de los ajustes de ahora; sus errores (los del motor) y, sin errores, la clave que dispara el cálculo.
  // §187: varios bloques. extra: los bloques 2, 3… (a.bloques); multi: hay más de uno. estrategiaDe: la estrategia de ahora de un bloque extra.
  const extra = bloquesDe(a), multi = extra.length > 0
  const estrategiaDe = useCallback((id) => diarias.find(s => String(s.id) === String(id)) || null, [diarias])
  const plan = useMemo(() => estrategia ? planDe(a, estrategia, null, estrategiaDe) : null, [a, estrategia, estrategiaDe])
  const errores = useMemo(() => plan ? validaPlan(plan) : [], [plan])
  const enLista = a.donde === 'lista'
  // §84: el motor del Backtesting calcula con la estrategia de AHORA (por su id). Con la versión guardada de un plan, solo si su regla
  // sigue igual que la de ahora; si no, se dice por qué no se calcula.
  const estPorDentro = !estrategia ? null : !usaGuardada ? estrategia : (estrategiaActual && cambio && !cambio.cambiada && !cambio.borrada ? estrategiaActual : null)
  const motivoEstPorDentro = !estrategia || estPorDentro ? null : estBorrada ? 'La estrategia de este plan está borrada: con varios valores, el plan solo sabe calcular con una estrategia que siga entre las tuyas.'
    : !cambio ? 'Comprobando la estrategia…' : 'La estrategia ha cambiado desde que guardaste este plan y, con varios valores, el plan solo sabe calcular con la de ahora: pulsa «Usar la versión actual» para verlo.'
  // §89 (fase 6): con «Una lista», «Tu dinero» se calcula con el plan que ya se sabe calcular (sin aportaciones, sin impuestos, ocioso en
  // liquidez, sin apalancar: planListaCalculable) y con la MISMA petición de «La cartera por dentro» (cuerpoLista), que /api/plan pasa a
  // /api/multibacktest para sacar los candidatos de cada valor.
  const calcLista = useMemo(() => enLista && plan ? planListaCalculable(plan) : null, [enLista, plan])
  // §111: con el Nasdaq-100, lo que hay en la base (universo_screener y universo_miembros), leído al elegirlo, como en el Backtesting (una
  // vez por universo; si falló, o tras «Regenerar universo», que lo vacía, se vuelve a leer).
  const universoLista = enLista ? (a.lista?.universo || 'manual') : 'manual'
  const universoDatos = vistaLista.universoDatos
  // §187: también los universos de los bloques extra (uno a uno, el primero que falte).
  const universoPendiente = [universoLista, ...extra.filter(b => b.donde === 'lista').map(b => b.lista?.universo || 'manual')].find(u => nDeUniverso(u) && (u === universoLista ? !(universoDatos[u] && !universoDatos[u].error) : !universoDatos[u])) || null
  useEffect(() => {
    const u = universoPendiente, n = u ? nDeUniverso(u) : null
    if (!n || !ctx) return
    let v = true
    cargaUniversoMc(n, { url: ctx.url, headers: ctx.headers, fetch: ctx.fetch, regla: reglaDeUniverso(u) })
      .then(d => { if (v) setVistaLista(x => ({ ...x, universoDatos: { ...x.universoDatos, [u]: d } })) })
      .catch(e => { if (v) setVistaLista(x => ({ ...x, universoDatos: { ...x.universoDatos, [u]: { error: e.message || 'No se pudo leer el universo.' } } })) })
    return () => { v = false }
  }, [universoPendiente, ctx])
  const cuerpoLista = useMemo(() => enLista && estPorDentro ? peticionPorDentro({ a, estrategia: estPorDentro, wlData: datosLista?.wlData || {}, universoDatos }) : null, [enLista, a, estPorDentro, datosLista?.wlData, universoDatos])
  const motivoLista = !enLista ? null : (motivoEstPorDentro || (calcLista && motivoListaNoCalculable(calcLista.plan, cuerpoLista?.symbols || null)) || (!cuerpoLista ? motivoSinPeticion({ a, estrategia: estPorDentro, universoDatos }) : null))
  // §187: con varios bloques, una petición de candidatos por cada bloque con lista (la de ese bloque solo: su parte del dinero inicial), en
  // cuerposLista; si alguno no se puede pedir, el motivo (motivoMulti).
  const bloquesConLista = useMemo(() => !multi || !plan ? [] : [{ id: 'e', b: a, est: estPorDentro }, ...extra.map(b => ({ id: b.id, b, est: estrategiaBloque(b, estrategiaDe) }))]
    .filter(x => x.b.donde === 'lista').map(x => ({ ...x, ab: { ...a, activo: x.b.activo, donde: 'lista', lista: x.b.lista, velas: x.b.velas, filtros: x.b.filtros, capital: plan.dinero.capitalInicial * (plan.piezas.find(p => p.id === x.id)?.peso || 0) } })), [multi, plan, a, extra, estPorDentro, estrategiaDe])
  const cuerposLista = useMemo(() => !multi ? null : Object.fromEntries(bloquesConLista.map(x => [x.id, x.est ? peticionPorDentro({ a: x.ab, estrategia: x.est, wlData: datosLista?.wlData || {}, universoDatos }) : null])), [multi, bloquesConLista, datosLista?.wlData, universoDatos])
  const motivoMulti = !multi ? null : (() => {
    for (const x of bloquesConLista) {
      const nombreB = x.id === 'e' ? 'el bloque 1' : `el bloque ${extra.findIndex(b => b.id === x.id) + 2}`
      if (!x.est) return x.id === 'e' && motivoEstPorDentro ? motivoEstPorDentro : `Elige la estrategia de ${nombreB}.`
      if (!cuerposLista[x.id]) return `En ${nombreB}: ${motivoSinPeticion({ a: x.ab, estrategia: x.est, universoDatos }) || 'falta algo para pedir sus valores.'}`
      const m = motivoListaNoCalculable(plan, cuerposLista[x.id].symbols || null, plan.piezas.find(p => p.id === x.id)); if (m) return `En ${nombreB}: ${m}`
    }
    return null
  })()
  const clave = !actual || !plan || errores.length ? null : multi ? (motivoMulti ? null : bloquesConLista.length ? JSON.stringify({ plan, cuerposLista }) : JSON.stringify(plan))
    : !enLista ? JSON.stringify(plan) : motivoLista || !cuerpoLista ? null : JSON.stringify({ plan: calcLista.plan, cuerpoLista })
  const api = useRef(apiFetch); api.current = apiFetch
  // Un plan ya calculado (p. ej., al volver a una pestaña) se enseña sin repetir el cálculo.
  const hechos = useRef(new Map())
  const calculador = useRef(null)
  // §128: la llamada a /api/plan, en un ref para que «Comparar planes» pida con la misma (varios planes a la vez, sin el calculador).
  const pideApi = useRef(null)
  if (!pideApi.current) pideApi.current = deps?.calcula || (async (p, cuerpoLista = null, cuerposLista = null) => {
    const r = await api.current('/api/plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan: p, curvas: true, libro: true, ...(cuerpoLista ? { cuerpoLista } : {}), ...(cuerposLista ? { cuerposLista } : {}) }) })   // §156/§161: siempre con el libro (la pestaña «Detalle», con lista o con un valor)
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
    return j
  })
  if (!calculador.current) {
    const pide = pideApi.current
    // §89: con lista, lo que se pide es { plan, cuerpoLista }; el resultado guarda el plan calculado y su clave.
    calculador.current = creaCalculador({ calcula: async (p) => p?.cuerposLista ? ({ respuesta: await pide(p.plan, null, p.cuerposLista), plan: p.plan, clave: JSON.stringify(p) })   // §187
      : p?.cuerpoLista ? ({ respuesta: await pide(p.plan, p.cuerpoLista), plan: p.plan, clave: JSON.stringify(p) }) : ({ respuesta: await pide(p), plan: p }),
      alEstado: (e) => {
        if (e.resultado) { hechos.current.set(e.resultado.clave || JSON.stringify(e.resultado.plan), e.resultado); if (hechos.current.size > 20) hechos.current.delete(hechos.current.keys().next().value) }
        if (vivo.current) setCalc(c => ({ calculando: e.calculando, resultado: e.resultado || c.resultado, error: e.resultado ? null : e.error ?? c.error }))
      } })
  }
  useEffect(() => {
    // §89: al quedarse sin nada que calcular (p. ej., al pasar a un reparto que con lista aún no se calcula), fuera «Calculando…».
    if (!clave) { calculador.current.cancela(); setCalc(c => c.calculando ? { ...c, calculando: false } : c); return }
    const ya = hechos.current.get(clave)
    if (ya) { calculador.current.cancela(); setCalc({ calculando: false, resultado: ya, error: null }) } else calculador.current.pide(JSON.parse(clave))
  }, [clave])
  useEffect(() => () => calculador.current?.cancela(), [])

  // Los símbolos de la caché (para la acción y el ocioso) y la prueba del paso 2 de la estrategia (con su regla de ahora).
  useEffect(() => { if (!inicial?.simbolos && cargaSimbolos) cargaSimbolos().then(xs => { if (vivo.current && xs?.length) setSimbolos(xs) }).catch(() => {}) }, [])
  // §49: las pruebas de TODAS las estrategias (una lectura) y la regla de ahora de cada una: la etiqueta del desplegable y el aviso.
  useEffect(() => {
    if (inicial?.pruebas || !ctx) return
    listarPruebasUsuario(ctx).then(xs => { if (vivo.current) setTodasPruebas(xs) }).catch(() => { if (vivo.current) setTodasPruebas([]) })
  }, [ctx])
  const estadosLista = useMemo(() => estadosPrueba(tarjetas, todasPruebas), [tarjetas, todasPruebas])
  const pruebas = useMemo(() => todasPruebas && todasPruebas.filter(p => String(p.estrategia_id) === String(estrategia?.id ?? estId)), [todasPruebas, estrategia, estId])
  useEffect(() => { setResPrueba(inicial?.resultadoPrueba || null) }, [estId])
  const estado = useMemo(() => estadoPrueba(pruebas, estrategia ? reglaDe(estrategia) : null), [pruebas, estrategia])
  useEffect(() => {
    if (inicial?.resultadoPrueba || !ctx || !estado?.fila) return
    let v = true
    leerResultado(ctx, estado.fila.id).then(r => { if (v && r) setResPrueba(r.resultado) }).catch(() => {})
    return () => { v = false }
  }, [estado?.fila?.id])

  // ── Los planes guardados y las pestañas ──
  const aplica = (e) => { setA(e.a); setEstId(e.estId); setCualVersion(e.version); setOtroForzado(false); setValoresAbiertos(inicial?.valoresAbiertos ?? null); setPrimeros(null) }
  // Leídos los planes y las pestañas guardadas (null: esta persona no tiene fila todavía), qué se abre al entrar.
  const entra = (xs, guardadas) => {
    const o = ordenInicial(guardadas, xs)
    ultimasIds.current = guardadas == null ? null : JSON.stringify(guardadas.map(Number))
    const e = nuevo ? { nuevo: true } : eligeEntrada({ planes: xs, orden: o, estrategiaId, planId, fotoDe: fotoDelPlan })   // §140: nuevo: «+ Nuevo plan» de la portada
    setPlanes(xs)
    if (e.noExiste) setAvisoPlan(AVISO_NO_EXISTE)
    if (e.nuevo) { const b = borrador(); setNuevas([{ clave: 'n1', nombre: 'Plan nuevo', base: base(b) }]); setOrden([...o, 'n1']); aplica(b); setActual('n1'); return }
    const r = e.clave && xs.find(p => claveDe(p.id) === e.clave)
    setOrden(r ? conPestana(o, e.clave) : o)
    if (r) { aplica(deFila(r)); setActual(e.clave) }
  }
  useEffect(() => {
    if (inicial?.planes) return
    if (!ctx) { entra([], null); return }
    Promise.all([listarPlanes(ctx), leerPestanas(ctx).catch(() => null)])
      .then(([xs, g]) => { if (vivo.current) entra(xs, g) })
      .catch(e => { if (vivo.current) { setFalloPlanes(e.message); entra([], null) } })
  }, [ctx])
  // Las pestañas abiertas y su orden se guardan en la base en cuanto cambian (solo las de planes guardados).
  const idsAbiertos = orden && !inicial?.planes ? JSON.stringify(idsDe(orden)) : null
  useEffect(() => {
    if (idsAbiertos == null || !ctx || idsAbiertos === ultimasIds.current) return
    ultimasIds.current = idsAbiertos
    guardarPestanas(ctx, JSON.parse(idsAbiertos)).then(() => { if (vivo.current) setFalloPestanas(false) }).catch(() => { if (vivo.current) setFalloPestanas(true) })
  }, [idsAbiertos])
  // ¿Ha cambiado la estrategia del plan guardado abierto desde que se guardó?
  useEffect(() => {
    if (inicial?.cambio) return
    setCambio(null)
    if (!fila) return
    let v = true
    comparaEstrategia(fila.plan, estrategias).then(c => { if (v) setCambio(c) }).catch(() => {})
    return () => { v = false }
  }, [fila?.id, fila?.updated_at, estrategias])
  const limpiaDialogos = () => { setVentana(null); setBorrando(null); setFalloGuardar(null); setNombreNuevo('') }
  const nuevaActual = nuevas.find(x => x.clave === actual) || null
  const hayCambios = !!fila && !!plan && jsonCanonico(paraHuellaPlan(plan)) !== jsonCanonico(paraHuellaPlan(fila.plan))
  const sinGuardar = hayCambios || conCambios(nuevaActual, { a, estId })
  const pestanas = (orden || []).map(c => {
    const id = idDe(c)
    if (id != null) { const r = (planes || []).find(p => Number(p.id) === id); return r ? { clave: c, nombre: r.nombre, guardado: true, sucia: c === actual && sinGuardar } : null }
    const n = nuevas.find(x => x.clave === c)
    return n ? { clave: c, nombre: n.nombre, guardado: false, sucia: c === actual ? sinGuardar : conCambios(n, edic.current[c]) } : null
  }).filter(Boolean)
  const nombreDe = (c) => pestanas.find(p => p.clave === c)?.nombre || ''
  // Abre otra pestaña. lista: los planes, si acaban de cambiar. Un plan nuevo espera en edic con lo que tiene.
  const abre = (clave, lista = planes) => {
    if (actual?.startsWith('n') && actual !== clave) edic.current[actual] = { a, estId, version: cualVersion }
    const r = (lista || []).find(p => claveDe(p.id) === clave), e = r ? deFila(r) : edic.current[clave]
    if (!e) return
    aplica(e); setActual(clave); limpiaDialogos(); setComparando(false)
  }
  // Un plan nuevo, con los ajustes de ahora (o sin ninguno abierto, los de siempre): «Plan nuevo», «Plan nuevo 2»… (el primer número libre). junto: la pestaña a cuyo lado se abre.
  const creaNuevo = (desde = null, junto = null) => {
    const clave = `n${++cuentaNuevas.current}`, e = desde || (actual ? { a: { ...a }, estId: String(estrategiaActual?.id ?? estId), version: 'actual' } : borrador())
    if (actual?.startsWith('n')) edic.current[actual] = { a, estId, version: cualVersion }
    edic.current[clave] = e
    setNuevas(xs => [...xs, { clave, nombre: nombreNueva(xs), base: base(e) }])
    setOrden(o => junto ? trasDe(o || [], junto, clave) : [...(o || []), clave])
    aplica(e); setActual(clave); limpiaDialogos(); setComparando(false)
  }
  // × : solo la quita de la vista (un plan nuevo se pierde). Sin pestañas, «Ningún plan abierto».
  const cierra = (clave) => {
    const o = orden || []
    if (!o.includes(clave)) return
    const v = clave === actual ? vecina(o, clave) : null
    if (clave === actual) { if (v) abre(v); else { setActual(null); limpiaDialogos() } }
    delete edic.current[clave]
    setOrden(sinPestana(o, clave))
    if (idDe(clave) == null) setNuevas(xs => xs.filter(x => x.clave !== clave))
  }
  // Lo que se hace cuando ya no hay cambios por medio.
  const ejecuta = (d) => {
    if (d.tipo === 'abrir') abre(d.clave)
    else if (d.tipo === 'anadir') { const c = claveDe(d.id); setOrden(o => conPestana(o || [], c)); abre(c) }
    else if (d.tipo === 'crear') creaNuevo()
    else if (d.tipo === 'cerrar') cierra(d.clave)
    else if (d.tipo === 'duplicar') duplica(d.clave)
    else if (d.tipo === 'paso1') onPaso1?.(estrategiaActual)
    else if (d.tipo === 'paso2') onPaso2?.(estrategia?.id ?? null)
    else if (d.tipo === 'volver') onVolver?.(d.donde)
    else if (d.tipo === 'fuera') d.seguir?.()
  }
  useEffect(() => { if (tras) { setTras(null); ejecuta(tras) } }, [tras])
  // Con cambios sin guardar, antes pregunta.
  const pide = (d) => { if (sinGuardar) { limpiaDialogos(); setPregunta(d) } else ejecuta(d) }
  const puedeGuardar = !!ctx && !!plan && !errores.length && !guardando
  // Guarda la abierta. Devuelve true si ha ido bien. Un plan nuevo con el nombre de la ventana.
  const guardaAbierta = async () => {
    if (!puedeGuardar) return false
    setGuardando(true); setFalloGuardar(null)
    try {
      if (fila) {
        const r = await cambiarPlan(ctx, fila.id, { nombre: fila.nombre, plan })
        setPlanes(xs => xs.map(x => x.id === r.id ? r : x)); setCualVersion('guardada')
      } else {
        const r = await crearPlan(ctx, { nombre: nombreLimpio(nombreNuevo), plan }), g = claveDe(r.id)
        delete edic.current[actual]
        setNuevas(xs => xs.filter(x => x.clave !== actual)); setPlanes(xs => [...(xs || []), r]); setOrden(o => cambiaClave(o || [], actual, g)); setActual(g); setCualVersion('guardada')
      }
      setGuardando(false)
      return true
    } catch (e) { setFalloGuardar(e.message); setGuardando(false); return false }
  }
  // Vuelve a lo guardado (un plan nuevo, a como se creó).
  const descartaCambios = () => {
    setFalloGuardar(null)
    if (fila) aplica(deFila(fila))
    else if (nuevaActual) { const [x, y] = JSON.parse(nuevaActual.base); aplica({ a: x, estId: y, version: 'actual' }) }
  }
  // La ventana de los cambios sin guardar. «Salir sin guardar» de un plan nuevo lo cierra: no tiene adónde volver.
  const responde = async (que) => {
    const d = pregunta
    if (que === 'cancelar') { setPregunta(null); setFalloGuardar(null); return }
    const r = await respondeSalida(que, { guardar: guardaAbierta, descartar: () => { if (fila) descartaCambios(); else cierra(actual) }, seguir: () => setTras({ ...d }) })
    if (r === 'fallo') setPregunta({ ...d, fallo: true }); else { setPregunta(null); setNombreNuevo('') }
  }
  // La página pregunta antes de salir del Builder; y el navegador, antes de cerrar o recargar.
  useEffect(() => { if (salida) salida.current = (seguir) => { if (!sinGuardar) return false; limpiaDialogos(); setPregunta({ tipo: 'fuera', seguir }); return true } })
  useEffect(() => () => { if (salida) salida.current = null }, [])
  useEffect(() => {
    if (!sinGuardar) return
    const avisa = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', avisa)
    return () => window.removeEventListener('beforeunload', avisa)
  }, [sinGuardar])
  // Duplicar: un plan nuevo, otro nuevo a su lado; uno guardado, pide el nombre y lo guarda como plan nuevo (el abierto, con sus cambios).
  const duplica = (clave) => {
    if (idDe(clave) == null) { const e = clave === actual ? { a, estId } : edic.current[clave]; if (e) creaNuevo({ a: { ...e.a }, estId: e.estId, version: 'actual' }, clave); return }
    limpiaDialogos(); setNombreNuevo(`${nombreDe(clave)} (copia)`); setVentana({ duplica: clave })
  }
  const pideDuplicar = (clave) => { if (clave === actual) duplica(clave); else pide({ tipo: 'duplicar', clave }) }
  // §173: «Guardar como plan» de una copia de la comparación: pide el nombre y la guarda como plan nuevo (su pestaña, detrás de la abierta).
  // Se sigue comparando: en su sitio queda el plan guardado. El plan abierto no cambia (ni sus cambios sin guardar).
  const pideGuardarCopia = (id) => { const c = copiasComp.find(x => mismoId(x.id, id)); if (!c) return; limpiaDialogos(); setNombreNuevo(nombreParaGuardar(c, nombreDe(actual))); setVentana({ copia: c.id }) }
  const guardaVentana = async () => {
    if (!ventana || !nombreLimpio(nombreNuevo) || guardando) return
    if (ventana === 'nuevo') { if (await guardaAbierta()) limpiaDialogos(); return }
    if (ventana.copia) {
      const c = copiasComp.find(x => mismoId(x.id, ventana.copia))
      if (!ctx || !c) return
      setGuardando(true); setFalloGuardar(null)
      try {
        const r = await crearPlan(ctx, { nombre: nombreLimpio(nombreNuevo), plan: c.plan }), g = claveDe(r.id)
        setPlanes(ps => [...(ps || []), r]); setOrden(o => trasDe(o || [], actual, g)); setComp(x => trasGuardarCopia(x, c.id, r.id)); limpiaDialogos()
      } catch (e) { setFalloGuardar(e.message) }
      setGuardando(false); return
    }
    const src = ventana.duplica, r0 = (planes || []).find(p => claveDe(p.id) === src)
    if (!ctx || !r0 || (src === actual && (!plan || errores.length))) return
    setGuardando(true); setFalloGuardar(null)
    try {
      const r = await crearPlan(ctx, { nombre: nombreLimpio(nombreNuevo), plan: src === actual ? plan : r0.plan }), g = claveDe(r.id), lista = [...planes, r]
      setPlanes(lista); setOrden(o => trasDe(o || [], src, g)); abre(g, lista)
    } catch (e) { setFalloGuardar(e.message) }
    setGuardando(false)
  }
  const borra = async () => {
    const clave = borrando, o = orden || []
    if (!clave || !ctx || guardando) return
    setGuardando(true); setFalloGuardar(null)
    try {
      await borrarPlan(ctx, idDe(clave))
      const quedan = (planes || []).filter(x => claveDe(x.id) !== clave), v = vecina(o, clave)
      setPlanes(quedan); setOrden(sinPestana(o, clave))
      if (clave === actual) { if (v) abre(v, quedan); else setActual(null) }
      limpiaDialogos()
    } catch (e) { setFalloGuardar(e.message) }
    setGuardando(false)
  }
  const pulsaCerrar = (clave) => { if (clave === actual && sinGuardar) pide({ tipo: 'cerrar', clave }); else cierra(clave) }

  const valoresLista = useMemo(() => simbolos.map(s => typeof s === 'string' ? { simbolo: s, nombre: '' } : s), [simbolos])
  const cifras = useMemo(() => { try { return calc.resultado ? cifrasPlan(calc.resultado.respuesta, calc.resultado.plan) : null } catch (_) { return null } }, [calc.resultado])
  const ajustesDelResultado = calc.resultado?.plan?.piezas?.[0] || null
  // §156: lo de la pestaña «Detalle», del mismo resultado (null si la respuesta no trae el libro).
  const detalle = useMemo(() => { try { return calc.resultado ? detallePlan(calc.resultado.respuesta, calc.resultado.plan) : null } catch (_) { return null } }, [calc.resultado])
  // §97: el resultado que se enseña es de OTROS ajustes (aún no ha llegado el cálculo de los de ahora; p. ej., tras «Descartar cambios»):
  // sus cifras se ven atenuadas hasta que llega el nuevo, para no confundirlas con las buenas.
  const claveDelResultado = useMemo(() => calc.resultado ? (calc.resultado.clave || JSON.stringify(calc.resultado.plan)) : null, [calc.resultado])
  const cifrasViejas = !!clave && !!claveDelResultado && clave !== claveDelResultado
  // Lo que se enseña en «+ Añadir plan»: el final de los planes guardados ya calculados.
  useEffect(() => { if (fila && cifras && !hayCambios && clave === (calc.resultado?.clave || JSON.stringify(calc.resultado?.plan))) setFinales(x => ({ ...x, [fila.id]: cifras.seis.final })) }, [cifras, fila?.id, hayCambios])
  const texto = () => textoParaClaudePlan({ ajustes: a, estrategia, plan, cifras: enLista || multi ? null : cifras, estado, resultadoPrueba: resPrueba, version, nombre: fila?.nombre || null })

  // ── §128: «Comparar planes» (los planes GUARDADOS, tal como están guardados; mismo motor y misma respuesta que su pestaña) ──
  const compLeido = useRef(false), enCurso = useRef(new Set())
  // §169: las copias sin guardar del plan abierto (sus ajustes de AHORA con otra estrategia) van detrás de los planes guardados.
  //   §170: conAhora: delante, el plan tal como está (si tiene cambios sin guardar o es nuevo), la base de «Comparar con otras estrategias».
  const copiasComp = useMemo(() => comparando && actual ? [...(comp.conAhora ? [copiaDeAhora(plan, nombreDe(actual))].filter(Boolean) : []), ...copiasDe(a, comp.copias, tarjetas, nombreDe(actual))] : [], [comparando, actual, a, plan, comp.copias, comp.conAhora, tarjetas, pestanas])
  // §170: al salir de la comparación, las copias se olvidan (la próxima vez, «Comparar planes» enseña solo los guardados).
  useEffect(() => { if (!comparando) setComp(c => c.copias.length || c.conAhora ? { ...c, copias: [], conAhora: false, vista: null, elegidos: c.elegidos && paraRecordar(c.elegidos) } : c) }, [comparando])
  const comparaEstrategias = (ids) => { setComp(c => ({ ...c, ...eleccionCopias({ idGuardado: fila?.id ?? null, hayCambios, ids }) })); setComparando(true) }
  const todosComp = useMemo(() => [...(planes || []), ...copiasComp], [planes, copiasComp])
  const idsTodosComp = todosComp.map(p => String(p.id)).join()
  // Al entrar: lo recordado en este navegador (una vez) y, de los elegidos, los que siguen existiendo.
  useEffect(() => {
    if (!comparando || !planes) return
    let g = null
    if (!compLeido.current) { compLeido.current = true; if (!inicial?.compararElegidos) try { g = JSON.parse(window.localStorage.getItem(CLAVE_COMPARAR)) } catch (_) {} }
    setComp(c => ({ ...c, ...(g && Array.isArray(g.refs) ? { refs: g.refs.filter(id => REFS_COMPARAR.some(r => r.id === id)) } : {}), ...(g && typeof g.log === 'boolean' ? { log: g.log } : {}), ...(g && typeof g.plegado === 'boolean' ? { plegado: g.plegado } : {}),
      elegidos: elegidosIniciales(todosComp, c.elegidos || g?.elegidos, idsDe(orden || [])) }))
  }, [comparando, planes, idsTodosComp])
  useEffect(() => { if (!comp.elegidos || inicial?.compararElegidos) return; try { window.localStorage.setItem(CLAVE_COMPARAR, JSON.stringify({ elegidos: paraRecordar(comp.elegidos), refs: comp.refs, log: comp.log, plegado: comp.plegado })) } catch (_) {} }, [comp.elegidos, comp.refs, comp.log, comp.plegado])
  // Lo que se pide de cada plan: el plan guardado; con una lista, como su pestaña (planListaCalculable y la petición de «La cartera por
  // dentro», que solo sabe calcular con la estrategia de AHORA: si su regla ha cambiado, se dice por qué no se calcula).
  const peticionComparar = (f) => {
    const p0 = f.plan
    // §187: un plan de varios bloques: sin listas, tal cual. §190: con listas, una petición de candidatos por bloque con lista (cuerposLista),
    // la misma que arma su pantalla (con su parte del dinero inicial y la estrategia de ahora, que tiene que tener la misma regla que la guardada).
    // §197: un bloque «Con pesos» también cuenta como bloque (no pide candidatos: no tiene lista).
    const todosB = (p0.piezas || []).filter(x => x.tipo === 'estrategia' || x.tipo === 'pesos'), ests = todosB.filter(x => x.tipo === 'estrategia')
    if (todosB.length > 1) {
      if (!ests.some(x => x.donde === 'lista')) return { clave: JSON.stringify(p0), plan: p0 }
      const a2 = ajustesDe(p0), cuerpos = {}
      for (const [k, x] of ests.entries()) {
        if (x.donde !== 'lista') continue
        const nombreB = `el bloque ${todosB.indexOf(x) + 1}`, actualB = estrategias.find(s => String(s.id) === String(x.estrategia?.id)) || null
        if (!actualB) return { motivo: `La estrategia de ${nombreB} ya no está entre las tuyas: con una lista, solo se calcula con una estrategia que siga entre las tuyas.` }
        const rgB = reglaDe(x.estrategia), raB = reglaDe(actualB)
        if (rgB == null || raB == null || rgB !== raB) return { motivo: `La estrategia de ${nombreB} ha cambiado desde que guardaste este plan: con una lista, solo se calcula con la de ahora. Ábrelo para verlo.` }
        const b = k === 0 ? a2 : (a2.bloques || []).find(y => y.id === x.id) || {}
        const ab = { ...a2, activo: b.activo, donde: 'lista', lista: b.lista, velas: b.velas, filtros: b.filtros, capital: (p0.dinero?.capitalInicial || 0) * (Number(x.peso) || 0) }
        const cuerpo = peticionPorDentro({ a: ab, estrategia: actualB, wlData: datosLista?.wlData || {}, universoDatos })
        if (!cuerpo) return { motivo: `En ${nombreB}: ${motivoSinPeticion({ a: ab, estrategia: actualB, universoDatos }) || 'no se puede calcular.'}` }
        const m = motivoListaNoCalculable(p0, cuerpo.symbols || null, x); if (m) return { motivo: `En ${nombreB}: ${m}` }
        cuerpos[x.id] = cuerpo
      }
      return { clave: JSON.stringify({ plan: p0, cuerposLista: cuerpos }), plan: p0, cuerposLista: cuerpos }
    }
    if (piezaDe(p0)?.donde !== 'lista') return { clave: JSON.stringify(p0), plan: p0 }
    const foto = fotoDelPlan(p0), actualE = estrategias.find(s => String(s.id) === String(foto?.id)) || null
    if (!actualE) return { motivo: 'La estrategia de este plan ya no está entre las tuyas: con una lista, solo se calcula con una estrategia que siga entre las tuyas.' }
    const rg = foto ? reglaDe(foto) : null, ra = reglaDe(actualE)
    if (rg == null || ra == null || rg !== ra) return { motivo: 'La estrategia ha cambiado desde que guardaste este plan: con una lista, solo se calcula con la de ahora. Ábrelo y pulsa «Usar la versión actual».' }
    const a2 = ajustesDe(p0), cuerpo = peticionPorDentro({ a: a2, estrategia: actualE, wlData: datosLista?.wlData || {}, universoDatos })
    if (!cuerpo) return { motivo: motivoSinPeticion({ a: a2, estrategia: actualE, universoDatos }) || 'Este plan no se puede calcular.' }
    const cl = planListaCalculable(p0), m = motivoListaNoCalculable(cl.plan, cuerpo.symbols)
    return m ? { motivo: m } : { clave: JSON.stringify({ plan: cl.plan, cuerpoLista: cuerpo }), plan: cl.plan, cuerpoLista: cuerpo }
  }
  const filasComp = useMemo(() => comparando && comp.elegidos && planes ? comp.elegidos.map(id => todosComp.find(p => mismoId(p.id, id))).filter(Boolean) : [], [comparando, comp.elegidos, planes, todosComp])
  // Con el Nasdaq-100, su universo se lee de la base, como en la pestaña (una vez por universo).
  const universosComp = [...new Set(filasComp.map(f => piezaDe(f.plan)).filter(x => x?.donde === 'lista' && nDeUniverso(x.lista?.universo || 'manual')).map(x => x.lista.universo))].filter(u => !universoDatos[u]).join()
  useEffect(() => {
    if (!universosComp || !ctx) return
    universosComp.split(',').forEach(u => cargaUniversoMc(nDeUniverso(u), { url: ctx.url, headers: ctx.headers, fetch: ctx.fetch, regla: reglaDeUniverso(u) })
      .then(d => { if (vivo.current) setVistaLista(x => ({ ...x, universoDatos: { ...x.universoDatos, [u]: d } })) })
      .catch(e => { if (vivo.current) setVistaLista(x => ({ ...x, universoDatos: { ...x.universoDatos, [u]: { error: e.message || 'No se pudo leer el universo.' } } })) }))
  }, [universosComp, ctx])
  const peticionesComp = useMemo(() => filasComp.map(f => ({ id: f.id, ...peticionComparar(f) })), [filasComp, estrategias, universoDatos, datosLista?.wlData])
  const clavesComp = JSON.stringify(peticionesComp.map(p => [p.id, p.clave || p.motivo]))
  // Cada plan, a la vez; lo ya calculado (aquí o en su pestaña con la misma petición) no se repite.
  useEffect(() => {
    peticionesComp.forEach(p => {
      if (p.motivo) { setResComp(r => ({ ...r, [p.id]: { estado: 'motivo', texto: p.motivo } })); return }
      const ya = hechos.current.get(p.clave)
      if (ya) { setResComp(r => r[p.id]?.estado === 'ok' && r[p.id].clave === p.clave ? r : { ...r, [p.id]: { estado: 'ok', clave: p.clave, respuesta: ya.respuesta, plan: ya.plan } }); return }
      if (enCurso.current.has(p.clave)) return
      enCurso.current.add(p.clave)
      setResComp(r => ({ ...r, [p.id]: { estado: 'calculando', clave: p.clave } }))
      Promise.resolve(p.cuerposLista ? pideApi.current(p.plan, null, p.cuerposLista) : p.cuerpoLista ? pideApi.current(p.plan, p.cuerpoLista) : pideApi.current(p.plan)).then(respuesta => {   // §190: varios bloques con listas
        hechos.current.set(p.clave, p.cuerpoLista || p.cuerposLista ? { respuesta, plan: p.plan, clave: p.clave } : { respuesta, plan: p.plan }); if (hechos.current.size > 20) hechos.current.delete(hechos.current.keys().next().value)
        if (vivo.current) setResComp(r => ({ ...r, [p.id]: { estado: 'ok', clave: p.clave, respuesta, plan: p.plan } }))
      }).catch(e => { if (vivo.current) setResComp(r => ({ ...r, [p.id]: { estado: 'error', clave: p.clave, texto: e.message || 'error' } })) })
        .finally(() => enCurso.current.delete(p.clave))
    })
  }, [clavesComp])
  // La línea de la prueba del paso 2 de la estrategia de cada plan (la de su foto), como arriba en su pestaña.
  const pruebaComp = (id) => {
    const f = todosComp.find(p => mismoId(p.id, id)), foto = f && fotoDelPlan(f.plan)
    if (!foto || !todasPruebas) return null
    const e = estadoPrueba(todasPruebas.filter(p => String(p.estrategia_id) === String(foto.id)), reglaDe(foto))
    return e ? { texto: textoAvisoPrueba(e), clave: e.clave } : null
  }
  const hayComparar = (planes || []).length >= 2

  // ── Avisos (una línea; el detalle, tras «?») ──
  const avisoPrueba = estado && (
    <div data-aviso="prueba" data-estado={estado.clave} data-lista={enLista ? '1' : undefined} style={{ color: estado.clave === 'pasa' ? VERDE : estado.clave === 'noPasa' ? ROJO : AMARILLO, fontWeight: estado.clave === 'noPasa' ? 700 : 400, display: 'flex', alignItems: 'center', gap: 2 }}>
      {textoAvisoPrueba(estado)}<span style={S.apagado}>&nbsp;·&nbsp;</span>{!estBorrada && <button data-boton="ver-prueba" style={{ ...S.enlace, fontSize: 13 }} onClick={() => pide({ tipo: 'paso2' })}>{estado.clave === 'sinPrueba' ? 'Probarla ahora' : 'Ver la prueba'}</button>}<Ayuda texto={ayudaPrueba(estado, resPrueba)} etiqueta="La prueba contra el azar"/>
    </div>
  )
  // §128: «Comparar planes», activo con al menos dos planes guardados.
  const botonComparar = <button data-boton="comparar" disabled={!hayComparar} title={hayComparar ? 'Ver tus planes guardados uno al lado del otro' : TEXTO_SIN_PLANES} onClick={() => setComparando(true)}
    style={{ ...S.boton, padding: '6px 12px', fontSize: 13, ...(hayComparar ? {} : { color: B.apagado, cursor: 'not-allowed' }) }}>Comparar planes</button>
  // §54: una línea bajo las pestañas: los avisos (en el móvil, uno debajo del otro: .bp-avisos), «Calculando…» y, a la derecha, guardar.
  // §174: en la misma línea, «La estrategia, tal como la usa este plan» (uso); «Comparar…» sube a la fila de las pestañas de planes.
  const avisosDe = (uso) => actual ? (
    <div data-avisos className="bp-avisos" style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 24px', alignItems: 'center', marginBottom: 10 }}>
      {estrategia && !multi && (avisoPrueba || <div data-aviso="prueba" data-estado="leyendo" style={S.secundario}>Leyendo la prueba…</div>)}
      {enlaceTesis?.('plan', fila?.id)}
      {!enLista && !multi && <div data-aviso="a-mano" style={{ color: AMARILLO, display: 'flex', alignItems: 'center', gap: 2 }}>⚠ {AVISO_A_MANO}<Ayuda texto={AYUDA_PLAN.aMano} etiqueta={AVISO_A_MANO}/></div>}
      {nuevaActual && <div data-aviso="sin-guardar" style={{ color: AMARILLO }}>Sin guardar: se perderá al recargar</div>}
      {calc.calculando && <div data-calculando style={{ color: AMARILLO }}>Calculando…</div>}
      {uso}
      <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {sinGuardar && <button data-boton="descartar" style={{ ...S.boton, padding: '6px 12px' }} disabled={guardando} onClick={descartaCambios}>Descartar cambios</button>}
        {hayCambios && <button data-boton="guardar-cambios" style={{ ...(puedeGuardar ? S.botonVerde : S.botonDesactivado), padding: '6px 12px' }} disabled={!puedeGuardar} title={`Guardado por última vez el ${fechaCorta(fila.updated_at)}`} onClick={guardaAbierta}>{guardando ? 'Guardando…' : 'Guardar cambios'}</button>}
        {nuevaActual && <button data-boton="guardar" style={{ ...(puedeGuardar ? S.botonVerde : S.botonDesactivado), padding: '6px 12px' }} disabled={!puedeGuardar} title={!ctx ? 'Sin conexión con la base de datos: no se pueden guardar planes' : undefined} onClick={() => { limpiaDialogos(); setVentana('nuevo') }}>Guardar este plan</button>}
      </span>
    </div>
  ) : null
  const errorCalculo = (!!errores.length || calc.error) && (
    <div data-estado-calculo style={{ marginBottom: 10 }}>
      {!!errores.length && <div data-errores-plan style={{ color: ROJO }}>✕ {errores.join(' ')}</div>}
      {calc.error && !errores.length && <div data-error-plan style={{ color: ROJO }}>✕ No se pudo calcular: {calc.error}</div>}
    </div>
  )

  // ── La fila de pestañas (components/BuilderPestanas.js) ──
  const pestanasPlanes = (
    <div data-planes style={{ marginBottom: 10 }}>
      {/* §174: «Comparar con otras estrategias ▾» y «Comparar planes», a la derecha de las pestañas (antes, en la línea de los avisos). */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px 10px', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 300px', minWidth: 0 }}>
          <BuilderPestanas pestanas={pestanas} actual={actual} planes={planes || []} abiertas={orden || []} finales={finales} ancho={inicial?.anchoPestanas ?? null} menuInicial={inicial?.menu ?? null} buscaInicial={inicial?.buscaMenu ?? ''}
            onAbrir={c => pide({ tipo: 'abrir', clave: c })} onDuplicar={pideDuplicar} onBorrar={c => { limpiaDialogos(); setBorrando(c) }} onCerrar={pulsaCerrar} onCrear={() => pide({ tipo: 'crear' })}
            onAnadir={id => { if (claveDe(id) !== actual) pide({ tipo: 'anadir', id }) }}/>
        </div>
        {actual && <span data-comparar-arriba style={{ display: 'inline-flex', gap: 8, alignItems: 'center', flex: 'none', marginLeft: 'auto' }}>
          {estrategia && <MenuCompararEstrategias estrategias={tarjetas} actualId={estrategia.id} inicial={inicial?.menuCopias || null} onComparar={comparaEstrategias}/>}
          {botonComparar}
        </span>}
      </div>
      {orden == null && <div style={{ ...S.apagado, marginTop: 6 }}>Leyendo tus planes…</div>}
      {avisoPlan && <div data-aviso="plan-no-existe" style={{ color: AMARILLO, marginTop: 6 }}>⚠ {avisoPlan}</div>}
      {falloPestanas && <div data-fallo-pestanas style={{ color: AMARILLO, marginTop: 6 }}>⚠ No se han podido guardar tus pestañas: al recargar puede salir otro orden.</div>}
      {falloPlanes && <div data-fallo-planes style={{ color: ROJO, marginTop: 6 }}>✕ {falloPlanes}</div>}
      {falloGuardar && !pregunta && !ventana && !borrando && <div data-fallo-guardar style={{ color: ROJO, marginTop: 6 }}>✕ {falloGuardar}</div>}
      {fila && cambio?.cambiada && fotoG && String(fotoG.id) === estId && (
        <div data-aviso="cambiada" style={{ color: AMARILLO, marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>⚠ {AVISO_CAMBIADA}<Ayuda texto={AYUDA_CAMBIADA} etiqueta={AVISO_CAMBIADA}/></span>
          <Segmentos etiquetaGrupo="Qué versión de la estrategia" valor={cualVersion} onCambia={setCualVersion} opciones={[['guardada', 'Usar la versión guardada'], ['actual', 'Usar la versión actual']]}/>
        </div>
      )}
      {fila && cambio?.borrada && <div data-aviso="borrada" style={{ color: AMARILLO, marginTop: 8 }}>⚠ {AVISO_BORRADA}</div>}
    </div>
  )

  // ── Columna izquierda ──
  const L = enLista ? (a.lista || {}) : listaDeAccion(a)
  const velasEst = velasDeEstrategia(estrategia), velasPlan = velasDelPlan(a, estrategia)
  const variosValores = enLista && ((L.universo && L.universo !== 'manual') || (L.simbolos || []).length >= 2)
  // §152: «La estrategia, tal como la usa este plan», siempre a la vista: en azul, lo que el plan cambia respecto a la estrategia guardada.
  const dondeUso = enLista ? (L.universo && L.universo !== 'manual' ? 'en el Nasdaq-100' : (L.simbolos || []).length === 1 ? `en ${L.simbolos[0]}` : `en ${(L.simbolos || []).length} valores`) : `en ${a.activo}`
  const uso = estrategia && actual && !multi ? (
    <div data-uso-estrategia title="En azul, lo que este plan cambia respecto a la estrategia guardada (la estrategia no se toca)" style={{ ...S.secundario, fontSize: 13 }}>
      La estrategia, tal como la usa este plan:{' '}
      {usoDeLaEstrategia({ nombre: estrategia.name, velasEst, velasPlan, donde: dondeUso, propios: filtrosPropios(estrategia), respeta: respetaPropios(a.filtros), nPlan: (a.filtros?.filas || []).length })
        .map((p, k) => <span key={k}>{k ? ' · ' : ''}<span data-cambia={p.azul ? 'si' : undefined} style={{ color: p.azul ? AZUL : B.texto, fontWeight: k ? 400 : 600 }}>{p.t}</span></span>)}
    </div>
  ) : null
  // §144: el selector es el del Backtesting (los valores de la Watchlist); además, los marcados que no estén en ella y, al buscar, los
  // de los precios guardados (lo que antes ofrecía el buscador de «Acción»).
  const watchlistDe = (Lx) => {
    const wl = datosLista?.watchlist || [], hay = new Set(wl.map(w => w.symbol)), mas = [], q = sinTildes(vistaLista.busca || '')
    const pon = (simbolo, nombre) => { if (simbolo && !hay.has(simbolo)) { hay.add(simbolo); mas.push({ symbol: simbolo, name: nombre || simbolo, list_ids: [] }) } }
    for (const sb of Lx.simbolos || []) pon(sb, valoresLista.find(v => v.simbolo === sb)?.nombre)
    if (q) for (const v of valoresLista) if (sinTildes(v.simbolo).includes(q) || sinTildes(v.nombre || '').includes(q)) pon(v.simbolo, v.nombre)
    return mas.length ? [...wl, ...mas] : wl
  }
  const watchlistPlan = watchlistDe(L)
  const resumenDe = (Lx) => { const u = !!Lx.universo && Lx.universo !== 'manual', m = Lx.simbolos || []
    return u ? nombreUniverso(nDeUniverso(Lx.universo), reglaDeUniverso(Lx.universo)) : !m.length ? 'Ningún valor marcado' : m.length === 1 ? m[0] : `${m.length} valores · ${m.slice(0, 4).join(', ')}${m.length > 4 ? '…' : ''}` }
  const esUniverso = !!L.universo && L.universo !== 'manual', marcados = L.simbolos || []
  const abiertoValores = valoresAbiertos ?? (!esUniverso && marcados.length === 0)
  const resumenValores = resumenDe(L)
  // §187: los bloques 2, 3… Cada uno, en una fila plegable con lo mismo que el bloque 1 (estrategia, velas, valores, reparto entre sus
  // valores y filtros) más su % y «Quitar»; sin ocioso propio (es de la cuenta), sin «Compra más acción» ni apalancamiento.
  const ponBloque = (id, f) => setA(x => ({ ...x, bloques: bloquesDe(x).map(b => b.id === id ? f(b) : b) }))
  const ponValoresB = (id, k) => (v) => ponBloque(id, b => {
    const l0 = b.donde === 'lista' ? b.lista : listaDeAccion(b), l = { ...l0, [k]: typeof v === 'function' ? v(l0[k]) : v }
    const uno = (l.universo || 'manual') === 'manual' && (l.simbolos || []).length === 1
    return uno ? { ...b, lista: l, donde: 'accion', activo: l.simbolos[0] } : { ...b, lista: l, donde: 'lista' }
  })
  const ponListaB = (id, k) => (v) => ponBloque(id, b => ({ ...b, lista: { ...b.lista, [k]: typeof v === 'function' ? v(b.lista[k]) : v } }))
  const campoPct = (valor, onCambia, etiqueta) => <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><CampoNumero etiqueta={etiqueta} valor={valor} onCambia={onCambia} ancho={70}/> % de tu dinero</span>
  const sumaPct = multi ? sumaPesos(a) : 100
  // §197: un bloque «Con pesos» (boceto bocetos/bloque-con-pesos.html, pestaña 1): su %, los pesos de partida (símbolos con precios guardados
  // y «Liquidez»), volver a los pesos y el dinero que le llega. Las reglas «si… entonces…» se guardan tal cual (su pantalla, más adelante).
  const valoresPesos = useMemo(() => [{ simbolo: 'LIQUIDEZ', nombre: 'Liquidez del bloque · efectivo que no rinde' }, ...valoresLista], [valoresLista])
  const bloquePesos = (b, k) => {
    const n = k + 2, color = COLORES_BLOQUE[(k + 1) % COLORES_BLOQUE.length], abierto = extraAbiertos[b.id] !== false
    const ps = b.pesos || [], suma = sumaPesosBloque(b), cada = b.volver?.cada || 'nunca'
    const ponPesos = (f) => ponBloque(b.id, x => ({ ...x, pesos: f(x.pesos || []) }))
    const textoVolver = VOLVER_OPCIONES.find(([v]) => v === cada)?.[1] || 'Nunca', textoLlega = LLEGA_OPCIONES.find(([v]) => v === b.aportaciones)?.[1] || ''
    const seccion = (num, titulo, ayuda, hijos) => <div data-seccion-pesos={num} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}><Etiqueta texto={`${num} · ${titulo}`} ayuda={ayuda}/>{hijos}</div>
    return (
      <div key={b.id} data-bloque={n} data-tipo-bloque="pesos" style={marcoBloque(color)}>
        <button type="button" data-fila-bloque aria-expanded={abierto} onClick={() => setExtraAbiertos(x => ({ ...x, [b.id]: !abierto }))} title={abierto ? 'Plegar el bloque' : 'Abrir el bloque'} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 12px', background: fondoCabeceraBloque(color), border: 'none', cursor: 'pointer', fontFamily: B.letra, fontSize: B.base, color: B.texto, textAlign: 'left' }}>
          <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: '50%', background: color, flex: 'none' }}/>
          <span data-parte style={{ fontWeight: 700, color: B.titulo, flex: 'none' }}>{textoCampo(b.peso)} %</span>
          <span style={{ minWidth: 0, flex: '1 1 auto' }}>
            <span data-resumen-bloque title={resumenPesos(b)} style={{ display: 'block', color: B.titulo, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Con pesos · {resumenPesos(b)}</span>
            <span data-resumen-donde style={{ display: 'block', ...S.apagado, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>volver a los pesos: {cada === 'banda' ? `si alguno se separa más de ${textoCampo(b.volver?.puntos)} puntos` : textoVolver.toLowerCase()} · el dinero que llega: {textoLlega.toLowerCase()}</span>
          </span>
          <span aria-hidden="true" style={{ color: B.secundario, flex: 'none' }}>{abierto ? '▾' : '▸'}</span>
        </button>
        {abierto && <div data-cuerpo-bloque style={{ borderTop: `1px solid ${B.borde}`, padding: 12, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
            <div><Etiqueta texto="Parte de tu dinero" ayuda={AYUDA_BLOQUES.parte}/>{campoPct(b.peso, v => ponBloque(b.id, x => ({ ...x, peso: v })), `Parte del bloque ${n}`)}</div>
            <span style={{ display: 'inline-flex', alignItems: 'center', marginLeft: 'auto' }}><span style={{ ...S.apagado, marginRight: 10, display: 'inline-flex', alignItems: 'center' }}>Bloque con pesos<Ayuda texto={AYUDA_PESOS.bloque} etiqueta="Bloque con pesos"/></span><button type="button" data-boton="quitar-bloque" title="Quitar este bloque (su % pasa al bloque 1)" onClick={() => setA(x => quitaBloque(x, b.id))} style={{ ...S.boton, padding: '4px 10px', fontSize: 13, color: ROJO, borderColor: ROJO }}>🗑 Quitar</button><Ayuda texto={AYUDA_BLOQUES.quitar} etiqueta="Quitar el bloque"/></span>
          </div>
          {seccion(1, 'Pesos de partida', AYUDA_PESOS.partida, <>
            {ps.map((p, j) => (
              <div key={j} data-fila-peso={j} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 220px', minWidth: 220 }}><BuscadorValor valores={valoresPesos} valor={p.simbolo || ''} onCambia={s => ponPesos(xs => xs.map((y, q) => q === j ? { ...y, simbolo: s } : y))} etiqueta={`Activo ${j + 1} del bloque ${n}`} anchoNombre={90}/></div>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><CampoNumero etiqueta={`Peso del activo ${j + 1} del bloque ${n}`} valor={p.peso} onCambia={v => ponPesos(xs => xs.map((y, q) => q === j ? { ...y, peso: v } : y))} ancho={62}/> %</span>
                <div aria-hidden="true" style={{ width: 70, height: 6, borderRadius: 3, background: B.borde, overflow: 'hidden', flex: 'none' }}><div style={{ width: `${Math.min(100, Math.max(0, Number(p.peso) || 0))}%`, height: '100%', background: COLORES_BLOQUE[j % COLORES_BLOQUE.length] }}/></div>
                <button type="button" data-boton="quitar-activo" disabled={ps.length <= 1} title={ps.length <= 1 ? 'El bloque necesita al menos un activo' : 'Quitar este activo del bloque'} onClick={() => ponPesos(xs => xs.filter((_, q) => q !== j))} style={{ ...S.boton, padding: '3px 8px', fontSize: 13, color: ps.length <= 1 ? B.apagado : ROJO, borderColor: ps.length <= 1 ? B.borde : ROJO }}>🗑</button>
              </div>))}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <button type="button" data-boton="anadir-activo" disabled={ps.length >= MAX_SIMBOLOS_PESOS} title={ps.length >= MAX_SIMBOLOS_PESOS ? `Como mucho ${MAX_SIMBOLOS_PESOS} activos por bloque` : 'Otro símbolo en este bloque (con lo que falte para el 100 %)'} onClick={() => ponPesos(xs => [...xs, { simbolo: '', peso: Math.max(0, Math.round((100 - sumaPesosBloque({ pesos: xs })) * 100) / 100) }])} style={{ ...S.boton, padding: '4px 10px', fontSize: 13 }}>+ Añadir activo</button>
              <span data-suma-pesos={suma} style={{ color: Math.abs(suma - 100) < 1e-6 ? VERDE : ROJO }}>{Math.abs(suma - 100) < 1e-6 ? 'Suman 100 % ✓' : `✕ Suman ${textoCampo(suma)} %: tienen que sumar 100 %`}</span>
            </div>
          </>)}
          {seccion(2, 'Volver a los pesos del bloque', AYUDA_PESOS.volver, <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <Segmentos etiquetaGrupo={`Volver a los pesos del bloque ${n}`} valor={cada} onCambia={v => ponBloque(b.id, x => ({ ...x, volver: { ...(x.volver || {}), cada: v, puntos: x.volver?.puntos ?? PUNTOS_BANDA_DEFECTO } }))} opciones={VOLVER_OPCIONES}/>
            {cada === 'banda' && <span data-banda style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>más de <CampoNumero etiqueta={`Puntos del bloque ${n}`} valor={b.volver?.puntos} onCambia={v => ponBloque(b.id, x => ({ ...x, volver: { ...x.volver, puntos: v } }))} ancho={50} minimo={1}/> puntos</span>}
          </div>)}
          {seccion(3, 'El dinero que le llega', AYUDA_PESOS.llega, <Segmentos etiquetaGrupo={`El dinero que le llega al bloque ${n}`} valor={b.aportaciones || 'ahora'} onCambia={v => ponBloque(b.id, x => ({ ...x, aportaciones: v }))} opciones={LLEGA_OPCIONES}/>)}
          {Array.isArray(b.reglas) && b.reglas.length > 0 && <div data-aviso="reglas-guardadas" style={S.apagado}>Este bloque lleva {b.reglas.length === 1 ? '1 regla «si… entonces…»' : `${b.reglas.length} reglas «si… entonces…»`}: se aplican; su pantalla llegará en el siguiente paso.</div>}
        </div>}
      </div>
    )
  }
  const bloqueExtra = (b, k) => {
    const n = k + 2, color = COLORES_BLOQUE[(k + 1) % COLORES_BLOQUE.length], est = estrategiaBloque(b, estrategiaDe), abierto = extraAbiertos[b.id] !== false
    const Lb = b.donde === 'lista' ? (b.lista || {}) : listaDeAccion(b), uni = !!Lb.universo && Lb.universo !== 'manual', marc = Lb.simbolos || [], varios = b.donde === 'lista' && (uni || marc.length >= 2)
    const abiertoV = valoresExtra[b.id] ?? (!uni && marc.length === 0)
    const vEst = velasDeEstrategia(est), vPlan = velasDelPlan(b, est)
    return (
      <div key={b.id} data-bloque={n} style={marcoBloque(color)}>
        <button type="button" data-fila-bloque aria-expanded={abierto} onClick={() => setExtraAbiertos(x => ({ ...x, [b.id]: !abierto }))} title={abierto ? 'Plegar el bloque' : 'Abrir el bloque'} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 12px', background: fondoCabeceraBloque(color), border: 'none', cursor: 'pointer', fontFamily: B.letra, fontSize: B.base, color: B.texto, textAlign: 'left' }}>
          <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: '50%', background: color, flex: 'none' }}/>
          <span data-parte style={{ fontWeight: 700, color: B.titulo, flex: 'none' }}>{textoCampo(b.peso)} %</span>
          <span style={{ minWidth: 0, flex: '1 1 auto' }}>
            <span data-resumen-bloque style={{ display: 'block', color: B.titulo, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Estrategia · {est?.name || 'sin elegir'}</span>
            <span data-resumen-donde style={{ display: 'block', ...S.apagado, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>en {uni ? 'el Nasdaq-100' : marc.length === 1 ? marc[0] : `${marc.length} valores`} · velas {vPlan}</span>
          </span>
          <span aria-hidden="true" style={{ color: B.secundario, flex: 'none' }}>{abierto ? '▾' : '▸'}</span>
        </button>
        {abierto && <div data-cuerpo-bloque style={{ borderTop: `1px solid ${B.borde}`, padding: 12, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
            <div><Etiqueta texto="Parte de tu dinero" ayuda={AYUDA_BLOQUES.parte}/>{campoPct(b.peso, v => ponBloque(b.id, x => ({ ...x, peso: v })), `Parte del bloque ${n}`)}</div>
            <span style={{ display: 'inline-flex', alignItems: 'center', marginLeft: 'auto' }}><button type="button" data-boton="quitar-bloque" title="Quitar este bloque (su % pasa al bloque 1)" onClick={() => setA(x => quitaBloque(x, b.id))} style={{ ...S.boton, padding: '4px 10px', fontSize: 13, color: ROJO, borderColor: ROJO }}>🗑 Quitar</button><Ayuda texto={AYUDA_BLOQUES.quitar} etiqueta="Quitar el bloque"/></span>
          </div>
          <div>
            <Etiqueta texto="Estrategia" ayuda={AYUDA_PLAN.estrategia}/>
            <SelectorEstrategia valor={b.estId} onElige={id => ponBloque(b.id, x => ({ ...x, estId: String(id), foto: null }))} estiloBoton={{ ...campo, maxWidth: '100%' }}
              extra={b.foto && String(b.foto.id) === String(b.estId) && !tarjetas.some(s => String(s.id) === String(b.estId)) ? { id: b.estId, name: b.foto.name, etiqueta: ETIQUETA_BORRADA, colorEtiqueta: AMARILLO } : null}
              estrategias={tarjetas.map(s => { const ep = estadosLista[s.id], ps = [ETIQUETA_PRUEBA[ep], esSemanal(s) ? 'semanal' : null].filter(Boolean)
                return { id: s.id, name: s.name, etiqueta: ps.join(' · ') || null, colorEtiqueta: ep === 'pasa' ? VERDE : ep === 'noPasa' ? ROJO : undefined } })}/>
          </div>
          <div data-velas-plan={vPlan}>
            <Etiqueta texto="Velas en este bloque" ayuda={AYUDA_PLAN.velas}/>
            <Segmentos etiquetaGrupo={`Velas del bloque ${n}`} valor={vPlan} onCambia={v => ponBloque(b.id, x => ({ ...x, velas: v === vEst ? null : v }))} opciones={[['diarias', vEst === 'diarias' ? 'Diarias · las de la estrategia' : 'Diarias'], ['semanales', vEst === 'semanales' ? 'Semanales · las de la estrategia' : 'Semanales']]}/>
          </div>
          <div>
            <Etiqueta texto="Valores · dónde se aplica" ayuda={AYUDA_PLAN.dondeSeAplica}/>
            <div data-resumen-valores data-abierto={abiertoV ? 'si' : 'no'} style={{ display: 'flex', alignItems: 'center', gap: 10, border: `1px solid ${B.borde}`, borderRadius: B.radioBoton, padding: '6px 10px', background: B.fondo }}>
              <span data-marcados style={{ flex: '1 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600, color: uni || marc.length ? B.titulo : AMARILLO }}>{resumenDe(Lb)}</span>
              <button type="button" data-boton="cambiar-valores" aria-expanded={abiertoV} style={{ ...S.boton, padding: '4px 10px', fontSize: 13, flex: 'none' }} onClick={() => setValoresExtra(x => ({ ...x, [b.id]: !abiertoV }))}>{abiertoV ? 'Hecho ▴' : 'Cambiar ▾'}</button>
            </div>
            {abiertoV && <div data-lista="valores" className="bp-mc" style={{ marginTop: 6 }}>
              <PanelUniverso mcUniverso={Lb.universo} mcUniversoDatos={vistaLista.universoDatos} setMcUniverso={ponValoresB(b.id, 'universo')} setMcUniversoDatos={ponVista('universoDatos')}/>
              <div style={{ display: 'flex', flexDirection: 'column', maxHeight: 330 }}>
                <SelectorValores mcListFilter={vistaLista.lista} mcOnlyFavs={vistaLista.favs} mcSearch={vistaLista.busca} mcSelected={Lb.simbolos} mcUniverso={Lb.universo} rankingData={datosLista?.rankingData || {}}
                  setMcListFilter={ponVista('lista')} setMcOnlyFavs={ponVista('favs')} setMcSearch={ponVista('busca')} setMcSelected={ponValoresB(b.id, 'simbolos')} watchlist={watchlistDe(Lb)} wlLists={datosLista?.wlLists || []} primero={marc}/>
              </div>
            </div>}
          </div>
          {varios && <div>
            <Etiqueta texto="Reparto entre los valores del bloque" ayuda={AYUDA_PLAN.reparto}/>
            <div data-lista="reparto" className="bp-mc">
              <PanelAsignacion unSoloModo mcStratSelected={[b.estId]} mcUniverso={Lb.universo} selectedModos={[Lb.modo]} setSelectedModos={() => {}} mcMode={Lb.modo} setMcMode={ponListaB(b.id, 'modo')} mcSectionOpen={vistaLista.seccion} setMcSectionOpen={ponVista('seccion')}
                mcAssumedStopPct={Lb.assumedStopPct} setMcAssumedStopPct={ponListaB(b.id, 'assumedStopPct')} mcCalculoPrioridad={Lb.calculoPrioridad} setMcCalculoPrioridad={ponListaB(b.id, 'calculoPrioridad')} mcCriterioUso={Lb.criterioUso} setMcCriterioUso={ponListaB(b.id, 'criterioUso')}
                mcMaxAccumRisk={Lb.maxAccumRisk} setMcMaxAccumRisk={ponListaB(b.id, 'maxAccumRisk')} mcMaxPortfolioPct={Lb.maxPortfolioPct} setMcMaxPortfolioPct={ponListaB(b.id, 'maxPortfolioPct')} mcMaxPosiciones={Lb.maxPosiciones} setMcMaxPosiciones={ponListaB(b.id, 'maxPosiciones')}
                mcMomGateThr={Lb.momGateThr} setMcMomGateThr={ponListaB(b.id, 'momGateThr')} mcMomentumN={Lb.momentumN} setMcMomentumN={ponListaB(b.id, 'momentumN')} mcPrioridad={Lb.prioridad} setMcPrioridad={ponListaB(b.id, 'prioridad')} mcProxGateThr={Lb.proxGateThr} setMcProxGateThr={ponListaB(b.id, 'proxGateThr')}
                mcRiskPerTrade={Lb.riskPerTrade} setMcRiskPerTrade={ponListaB(b.id, 'riskPerTrade')} mcRsGateThr={Lb.rsGateThr} setMcRsGateThr={ponListaB(b.id, 'rsGateThr')} mcRsWindow={Lb.rsWindow} setMcRsWindow={ponListaB(b.id, 'rsWindow')}/>
              <PanelPesos mcMode={Lb.modo} mcSelected={Lb.simbolos} mcWeights={Lb.pesos} setMcWeights={ponListaB(b.id, 'pesos')}/>
            </div>
          </div>}
          {est && <FiltrosDelPlan estrategia={est} filtros={b.filtros} onCambia={v => ponBloque(b.id, x => ({ ...x, filtros: v }))} velasPlan={vPlan} valores={valoresLista} inicial={null}/>}
        </div>}
      </div>
    )
  }
  // §187: el dinero ocioso: en el bloque con uno solo (como siempre); con varios, de la cuenta, en «Tu dinero».
  const ociosoCampo = (
    <div data-ocioso-de={multi ? 'cuenta' : 'bloque'}>
      <Etiqueta texto={multi ? 'Dinero ocioso de la cuenta · mientras ningún bloque lo usa, espera en' : 'Dinero ocioso · mientras no hay señal, espera en'} ayuda={multi ? AYUDA_BLOQUES.ocioso : AYUDA_PLAN.ocioso}/>
      <Segmentos etiquetaGrupo="Dinero ocioso" valor={otroOcioso ? 'OTRO' : a.ocioso} onCambia={v => { if (v === 'OTRO') setOtroOcioso(true); else { setOtroOcioso(false); cambia('ocioso', v) } }} opciones={[...OCIOSOS_FIJOS, ['OTRO', 'Otro símbolo']]}/>
      {otroOcioso && <div style={{ marginTop: 10 }}><BuscadorValor valores={valoresLista} valor={OCIOSOS_FIJOS.some(([k]) => k === a.ocioso) ? '' : a.ocioso} onCambia={s => cambia('ocioso', s)} etiqueta="Símbolo del ocioso"/></div>}
    </div>
  )
  const bloques = (
    <div data-tarjeta="bloques" style={{ ...S.tarjeta, marginTop: 16, overflow: 'visible' }}>
      <div style={{ ...S.cabeceraTarjeta, borderRadius: `${B.radioTarjeta}px ${B.radioTarjeta}px 0 0`, display: 'flex', alignItems: 'center', gap: 2 }}>Cartera<Ayuda texto={AYUDA_PLAN.cartera} etiqueta="Cartera"/><span data-subtitulo style={{ ...S.apagado, fontWeight: 400, marginLeft: 8 }}>en qué se invierte</span></div>
      <div style={{ ...S.cuerpo, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {!multi ? <div data-barra-cartera aria-hidden="true" title="Todo el dinero del plan está en este bloque" style={{ height: 8, borderRadius: 4, background: AZUL }}/>
          : <div data-barra-cartera="bloques" title={`Cómo se reparte tu dinero entre los bloques${sumaPct !== 100 ? ` (suman ${textoCampo(sumaPct)} %, no 100 %)` : ''}`} style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', background: B.borde }}>
            {[Number(a.peso) || 0, ...extra.map(b => Number(b.peso) || 0)].map((p, k) => <div key={k} style={{ width: `${Math.max(0, p) / Math.max(100, sumaPct) * 100}%`, background: COLORES_BLOQUE[k % COLORES_BLOQUE.length] }}/>)}
          </div>}
        {multi && sumaPct !== 100 && <div data-aviso="suma-bloques" style={{ color: ROJO, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>✕ Los bloques suman {textoCampo(sumaPct)} %: tienen que sumar 100 %.<button type="button" data-boton="repartir-resto" title="Ajusta los % en proporción para que sumen 100 %" onClick={() => setA(repartirResto)} style={{ ...S.boton, padding: '4px 10px', fontSize: 13 }}>Repartir el resto</button></div>}
        <div data-bloque="1" style={marcoBloque(AZUL)}>
          <button type="button" data-fila-bloque aria-expanded={bloqueAbierto} onClick={() => setBloqueAbierto(x => !x)} title={bloqueAbierto ? 'Plegar el bloque' : 'Abrir el bloque'} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 12px', background: fondoCabeceraBloque(AZUL), border: 'none', cursor: 'pointer', fontFamily: B.letra, fontSize: B.base, color: B.texto, textAlign: 'left' }}>
            <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: '50%', background: AZUL, flex: 'none' }}/>
            <span data-parte title={multi ? 'Qué parte del dinero del plan va a este bloque.' : 'Qué parte del dinero del plan va a este bloque. Con un solo bloque, todo: de 10.000 €, los 10.000 €.'} style={{ fontWeight: 700, color: B.titulo, flex: 'none' }}>{multi ? textoCampo(a.peso) : 100} %</span>
            <span style={{ minWidth: 0, flex: '1 1 auto' }}>
              <span data-resumen-bloque style={{ display: 'block', color: B.titulo, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Estrategia · {estrategia?.name || 'sin elegir'}</span>
              <span data-resumen-donde style={{ display: 'block', ...S.apagado, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>en {enLista ? (L.universo && L.universo !== 'manual' ? 'el Nasdaq-100' : (L.simbolos || []).length === 1 ? L.simbolos[0] : `${(L.simbolos || []).length} valores`) : a.activo}{multi ? ` · velas ${velasPlan}` : <> · ocioso en {(OCIOSOS_FIJOS.find(([k]) => k === a.ocioso)?.[1] || a.ocioso || '—')}</>}</span>
            </span>
            <span aria-hidden="true" style={{ color: B.secundario, flex: 'none' }}>{bloqueAbierto ? '▾' : '▸'}</span>
          </button>
          {bloqueAbierto && <div data-cuerpo-bloque style={{ borderTop: `1px solid ${B.borde}`, padding: 12, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {multi && <div><Etiqueta texto="Parte de tu dinero" ayuda={AYUDA_BLOQUES.parte}/>{campoPct(a.peso, v => cambia('peso', v), 'Parte del bloque 1')}</div>}
          <div>
            <Etiqueta texto="Estrategia" ayuda={AYUDA_PLAN.estrategia}/>
            {/* §175: como el selector de valores: botón con la elegida y lista con buscador (antes, un <select>). Las semanales ya se
                pueden elegir (desde §145 el plan las admite; el <select> las dejaba apagadas). Al final, en gris, cuántas de código hay. */}
            {tarjetas.length ? <SelectorEstrategia valor={estId} onElige={id => { setEstId(id); setCualVersion('actual') }} estiloBoton={{ ...campo, maxWidth: '100%' }}
              extra={fotoG && String(fotoG.id) === estId && !tarjetas.some(s => String(s.id) === estId) ? { id: estId, name: fotoG.name, etiqueta: ETIQUETA_BORRADA, colorEtiqueta: AMARILLO } : null}
              estrategias={tarjetas.map(s => { const ep = estadosLista[s.id], ps = [ETIQUETA_PRUEBA[ep], esSemanal(s) ? 'semanal' : null].filter(Boolean)
                return { id: s.id, name: s.name, etiqueta: ps.join(' · ') || null, colorEtiqueta: ep === 'pasa' ? VERDE : ep === 'noPasa' ? ROJO : undefined } })}
              pie={deCodigo > 0 ? <div data-codigo={deCodigo} style={{ ...S.apagado, fontSize: 12, borderTop: `1px solid ${B.borde}`, paddingTop: 6 }}>{textoCodigo(deCodigo)}</div> : null}/>
              : <div style={S.secundario}>No tienes estrategias de tarjetas. Crea una en «Estrategias».</div>}
            {estrategia && !estBorrada && <div style={{ marginTop: 6 }}><button data-boton="abrir-estrategia" type="button" style={{ ...S.enlace, fontSize: 13 }} onClick={() => pide({ tipo: 'paso1' })} title="Abre esta estrategia para verla o cambiarla; si el plan tiene cambios sin guardar, pregunta antes">Abrir la estrategia ›</button></div>}
            {/* §148: fuera el aviso de que los planes eran solo de velas diarias: desde §145 las semanales también entran. */}
          </div>
          {/* §145: con qué velas calcula este plan la estrategia: las suyas o las que mande el plan. */}
          <div data-velas-plan={velasPlan}>
            <Etiqueta texto="Velas en este plan" ayuda={AYUDA_PLAN.velas}/>
            <Segmentos etiquetaGrupo="Velas en este plan" valor={velasPlan} onCambia={v => cambia('velas', v === velasEst ? null : v)} opciones={[['diarias', velasEst === 'diarias' ? 'Diarias · las de la estrategia' : 'Diarias'], ['semanales', velasEst === 'semanales' ? 'Semanales · las de la estrategia' : 'Semanales']]}/>
            {velasPlan !== velasEst && <div data-aviso="otras-velas" style={{ color: B.enlace, marginTop: 6 }}>En este plan la estrategia se calcula con velas {velasPlan}, no con las {velasEst} en que se creó: sus medias e indicadores cuentan {velasPlan === 'semanales' ? 'semanas' : 'días'}.</div>}
          </div>
          <div>
            <Etiqueta texto="Valores · dónde se aplica" ayuda={AYUDA_PLAN.dondeSeAplica}/>
            {/* §80: el universo y el selector de valores del Backtesting (elementos 13 y 14), tal cual. */}
            {/* §154: plegado, una línea con lo marcado; «Cambiar ▾» abre el selector de siempre ahí mismo y «Hecho ▴» lo cierra. */}
            <div data-resumen-valores data-abierto={abiertoValores ? 'si' : 'no'} data-donde={enLista ? 'lista' : 'accion'} style={{ display: 'flex', alignItems: 'center', gap: 10, border: `1px solid ${B.borde}`, borderRadius: B.radioBoton, padding: '6px 10px', background: B.fondo }}>
              <span data-marcados title={esUniverso ? resumenValores : marcados.join(', ') || undefined} style={{ flex: '1 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600, color: esUniverso || marcados.length ? B.titulo : AMARILLO }}>{resumenValores}</span>
              <button type="button" data-boton="cambiar-valores" aria-expanded={abiertoValores} title={abiertoValores ? 'Plegar la lista de valores' : 'Abrir la lista para marcar o desmarcar valores'} style={{ ...S.boton, padding: '4px 10px', fontSize: 13, flex: 'none' }} onClick={() => { if (!abiertoValores) setPrimeros([...marcados]); setValoresAbiertos(!abiertoValores) }}>{abiertoValores ? 'Hecho ▴' : 'Cambiar ▾'}</button>
            </div>
            {abiertoValores && <div data-lista="valores" data-donde={enLista ? 'lista' : 'accion'} className="bp-mc" style={{ marginTop: 6 }}>
              <PanelUniverso mcUniverso={L.universo} mcUniversoDatos={vistaLista.universoDatos} setMcUniverso={ponValores('universo')} setMcUniversoDatos={ponVista('universoDatos')}/>
              <div style={{ display: 'flex', flexDirection: 'column', maxHeight: 330 }}>
                <SelectorValores mcListFilter={vistaLista.lista} mcOnlyFavs={vistaLista.favs} mcSearch={vistaLista.busca} mcSelected={L.simbolos} mcUniverso={L.universo} rankingData={datosLista?.rankingData || {}}
                  setMcListFilter={ponVista('lista')} setMcOnlyFavs={ponVista('favs')} setMcSearch={ponVista('busca')} setMcSelected={ponValores('simbolos')} watchlist={watchlistPlan} wlLists={datosLista?.wlLists || []} primero={primeros}/>
              </div>
            </div>}
          </div>
          {/* §80: el reparto dentro de la lista (elementos 5–10 y 12), con lo de este bloque. */}
          {variosValores && <div>
            <Etiqueta texto="Reparto entre los valores" ayuda={AYUDA_PLAN.reparto}/>
            <div data-lista="reparto" className="bp-mc">
              <PanelAsignacion unSoloModo mcStratSelected={[estId]} mcUniverso={L.universo} selectedModos={[L.modo]} setSelectedModos={() => {}} mcMode={L.modo} setMcMode={ponLista('modo')} mcSectionOpen={vistaLista.seccion} setMcSectionOpen={ponVista('seccion')}
                mcAssumedStopPct={L.assumedStopPct} setMcAssumedStopPct={ponLista('assumedStopPct')} mcCalculoPrioridad={L.calculoPrioridad} setMcCalculoPrioridad={ponLista('calculoPrioridad')} mcCriterioUso={L.criterioUso} setMcCriterioUso={ponLista('criterioUso')}
                mcMaxAccumRisk={L.maxAccumRisk} setMcMaxAccumRisk={ponLista('maxAccumRisk')} mcMaxPortfolioPct={L.maxPortfolioPct} setMcMaxPortfolioPct={ponLista('maxPortfolioPct')} mcMaxPosiciones={L.maxPosiciones} setMcMaxPosiciones={ponLista('maxPosiciones')}
                mcMomGateThr={L.momGateThr} setMcMomGateThr={ponLista('momGateThr')} mcMomentumN={L.momentumN} setMcMomentumN={ponLista('momentumN')} mcPrioridad={L.prioridad} setMcPrioridad={ponLista('prioridad')} mcProxGateThr={L.proxGateThr} setMcProxGateThr={ponLista('proxGateThr')}
                mcRiskPerTrade={L.riskPerTrade} setMcRiskPerTrade={ponLista('riskPerTrade')} mcRsGateThr={L.rsGateThr} setMcRsGateThr={ponLista('rsGateThr')} mcRsWindow={L.rsWindow} setMcRsWindow={ponLista('rsWindow')}/>
              <PanelPesos mcMode={L.modo} mcSelected={L.simbolos} mcWeights={L.pesos} setMcWeights={ponLista('pesos')}/>
            </div>
          </div>}
          {/* §152: los filtros del plan, con el catálogo de condiciones (los de la estrategia, respetados o no, y los añadidos aquí). */}
          {estrategia && <FiltrosDelPlan estrategia={estrategia} filtros={a.filtros} onCambia={v => cambia('filtros', v)} velasPlan={velasPlan} valores={valoresLista} inicial={inicial?.filtrosPlan || null}/>}
          {/* §153: fuera el panel de filtros del Backtesting: los filtros del plan son los de arriba (catálogo). Un plan que aún llevara encendido alguno de los antiguos lo dice y deja quitarlos. */}
          {hayFiltrosActivos(L.filtros || []) && <div data-aviso="filtros-antiguos" style={{ color: AMARILLO, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>⚠ Este plan lleva {(L.filtros || []).filter(f => f.activo).length === 1 ? 'un filtro' : 'filtros'} del panel antiguo, que ya no se edita aquí: se sigue aplicando.<button type="button" data-boton="quitar-filtros-antiguos" style={{ ...S.boton, padding: '4px 10px', fontSize: 13 }} onClick={() => ponValores('filtros')([])}>Quitarlo</button></div>}
          {/* §142: el dinero ocioso, «Si llega una aportación…» y el apalancamiento son de CÓMO se invierte este bloque (en el plan guardado ya eran de su pieza): van aquí, no en «Tu dinero». */}
          {!multi && ociosoCampo}
          {/* §91: con una lista, la aportación siempre espera en el ocioso hasta la siguiente compra (no hay una sola operación abierta). */}
          {!enLista && !multi && <div>
            <Etiqueta texto="Si llega una aportación con la operación abierta" ayuda={AYUDA_PLAN.dentro}/>
            <Segmentos etiquetaGrupo="Si llega una aportación con la operación abierta" valor={a.aportacionDentro} onCambia={v => cambia('aportacionDentro', v)} opciones={[['espera', 'Espera en el ocioso hasta la siguiente compra'], ['compra', 'Compra más acción']]}/>
          </div>}
            {!multi && <div><Etiqueta texto="Apalancamiento" ayuda={AYUDA_PLAN.apalancamiento}/><Segmentos etiquetaGrupo="Apalancamiento" valor={a.apalancamiento} onCambia={v => cambia('apalancamiento', v)} opciones={[[1, 'No'], [2, '×2'], [3, '×3']]}/></div>}
            {multi && <div data-aviso="todavia-bloques" style={{ ...S.apagado, display: 'flex', alignItems: 'center', gap: 2 }}>Con varios bloques, de momento sin «Compra más acción» ni apalancamiento.<Ayuda texto={AYUDA_BLOQUES.todavia} etiqueta="Lo que aún no hay con varios bloques"/></div>}
          </div>}
        </div>
        {extra.map((b, k) => esBloquePesos(b) ? bloquePesos(b, k) : bloqueExtra(b, k))}
        {/* §187: «+ Añadir bloque» y, con varios, cómo se reparte el dinero entre ellos. §197: un desplegable, «Con una estrategia» o «Con pesos». */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, position: 'relative' }}>
          <button type="button" data-boton="anadir-bloque" aria-expanded={menuBloque} disabled={!estrategia} title="Otra parte de tu dinero, que funciona a la vez que las demás" onClick={() => setMenuBloque(x => !x)} style={{ ...S.boton, padding: '6px 12px', fontSize: 13 }}>+ Añadir bloque ▾</button>
          <Ayuda texto={`${AYUDA_BLOQUES.anadir} ${AYUDA_PESOS.menu}`} etiqueta="Añadir bloque"/>
          {menuBloque && <>
            <div aria-hidden="true" onClick={() => setMenuBloque(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }}/>
            <div data-menu="anadir-bloque" role="menu" style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 41, minWidth: 300, background: B.tarjeta, border: `1px solid ${B.borde}`, borderRadius: B.radioBoton, boxShadow: '0 6px 18px rgba(0,0,0,.35)', padding: 4 }}>
              {[['estrategia', 'Con una estrategia', 'Una estrategia de tarjetas en un valor o en varios.'], ['pesos', 'Con pesos', 'Un reparto fijo entre símbolos (con o sin reglas que lo cambian).']].map(([t, titulo, sub]) =>
                <button key={t} type="button" role="menuitem" data-boton={`anadir-bloque-${t}`} onClick={() => { setMenuBloque(false); setA(x => anadeBloque(x, estId, t)) }}
                  style={{ display: 'block', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', borderRadius: 4, padding: '7px 10px', cursor: 'pointer', fontFamily: B.letra, color: B.texto }}
                  onMouseEnter={e => { e.currentTarget.style.background = B.fondo }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                  <div style={{ fontWeight: 700, color: B.titulo }}>{titulo}</div><div style={{ ...S.apagado, fontSize: 12 }}>{sub}</div></button>)}
            </div>
          </>}
        </div>
        {multi && <div data-reparto-bloques style={{ borderTop: `1px solid ${B.borde}`, paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontWeight: 700, color: B.titulo }}>Reparto entre bloques</div>
          <div><Etiqueta texto="El dinero libre y las aportaciones van…" ayuda={AYUDA_BLOQUES.dineroLibre}/>
            <Segmentos etiquetaGrupo="El dinero libre entre bloques" valor={a.dineroLibre === 'prioridad' ? 'prioridad' : 'tope'} onCambia={v => cambia('dineroLibre', v)} opciones={[['tope', 'Con tope'], ['prioridad', 'Solo prioridad']]}/></div>
          <div><Etiqueta texto="Vender para volver al reparto" ayuda={AYUDA_BLOQUES.vender}/>
            <Segmentos etiquetaGrupo="Vender para volver al reparto" valor="nunca" onCambia={() => {}} opciones={[['nunca', 'Nunca'], ['anual', 'Cada año', 'Llegará más adelante'], ['desvio', 'Si se desvía', 'Llegará más adelante']]}/></div>
        </div>}
      </div>
    </div>
  )
  const fs = fechasDe(a)
  const dinero = (
    <div data-tarjeta="tu-dinero" data-abierta={dineroAbierto ? 'si' : 'no'} style={{ ...S.tarjeta, overflow: 'visible' }}>
      <button type="button" data-pliega-dinero aria-expanded={dineroAbierto} onClick={() => setDineroAb(x => ({ ...x, [actual]: !dineroAbierto }))} title={dineroAbierto ? 'Plegar «Tu dinero» en una línea' : 'Abrir «Tu dinero» para cambiarlo'}
        style={{ ...S.cabeceraTarjeta, borderRadius: dineroAbierto ? `${B.radioTarjeta}px ${B.radioTarjeta}px 0 0` : B.radioTarjeta, display: 'flex', alignItems: 'baseline', gap: 8, width: '100%', boxSizing: 'border-box', cursor: 'pointer', textAlign: 'left', fontFamily: B.letra, ...(dineroAbierto ? {} : { borderBottom: 'none' }) }}>
        Tu dinero<span data-subtitulo style={{ ...S.apagado, fontWeight: 400 }}>cuánto, cuándo y costes</span><span aria-hidden="true" style={{ marginLeft: 'auto', color: B.secundario, fontWeight: 400 }}>{dineroAbierto ? '▾' : '▸'}</span></button>
      {!dineroAbierto && <button type="button" data-resumen-dinero onClick={() => setDineroAb(x => ({ ...x, [actual]: true }))} title="Pulsa para cambiarlo" style={{ display: 'block', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer', padding: '8px 14px 11px', fontFamily: B.letra, fontSize: 13, color: B.texto, lineHeight: 1.5 }}>{resumenDinero(a, multi)}</button>}
      {dineroAbierto && <div style={{ ...S.cuerpo, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <Etiqueta texto="Periodo" ayuda={AYUDA_PLAN.periodo}/>
          <Segmentos etiquetaGrupo="Periodo" valor={a.periodo} onCambia={v => setA(x => ({ ...x, ...(v === 'otras' ? fechasDe(x) : {}), periodo: v }))} opciones={PERIODOS_PLAN.map(p => [p.id, p.nombre])}/>
          {a.periodo === 'otras' && <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <input type="date" aria-label="Desde" value={fs.desde} onChange={e => cambia('desde', e.target.value)} style={campo}/> <span style={S.secundario}>a</span>
            <input type="date" aria-label="Hasta" value={fs.hasta} onChange={e => cambia('hasta', e.target.value)} style={campo}/>
          </div>}
        </div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <div><Etiqueta texto="Dinero inicial" ayuda={AYUDA_PLAN.capital}/><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><CampoNumero enEuros etiqueta="Dinero inicial" valor={a.capital} onCambia={v => cambia('capital', v)} ancho={120}/> €</span></div>
          <div><Etiqueta texto="Aportación mensual" ayuda={AYUDA_PLAN.aportacion}/><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><CampoNumero enEuros etiqueta="Aportación mensual" valor={a.aportacion} onCambia={v => cambia('aportacion', v)} ancho={100}/> €</span></div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <Segmentos etiquetaGrupo="Cómo es la aportación" valor={a.sube ? 'sube' : 'fija'} onCambia={v => setA(x => ({ ...x, sube: v === 'sube', subePct: v === 'sube' && !(Number(x.subePct) > 0) ? SUBIDA_DEFECTO : x.subePct }))} opciones={[['fija', 'Fija'], ['sube', 'Sube cada año']]}/>
          {a.sube && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><CampoNumero etiqueta="Cuánto sube cada año" valor={a.subePct} onCambia={v => cambia('subePct', v)} ancho={70} minimo={-Infinity}/> % al año</span>}
        </div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <div><Etiqueta texto="Impuestos" ayuda={AYUDA_PLAN.impuestos}/><Segmentos etiquetaGrupo="Impuestos" valor={a.impuestos} onCambia={v => cambia('impuestos', v)} opciones={[['ES-ahorro', 'España · base del ahorro'], ['ninguno', 'Sin impuestos']]}/></div>
        </div>
        <div>
          <Etiqueta texto="Comisión por operación" ayuda={AYUDA_PLAN.comision}/>
          <div role="group" aria-label="Cómo es la comisión" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 10px', alignItems: 'center' }}>
            {TIPOS_COMISION.map(([k, t]) => <span key={k} style={{ display: 'inline-flex', alignItems: 'center' }}><button type="button" data-comision={k} aria-pressed={(a.comisionTipo || 'pct') === k} onClick={() => cambia('comisionTipo', k)} style={{ ...seg((a.comisionTipo || 'pct') === k), borderRadius: 6 }}>{t}</button><Ayuda texto={AYUDA_COMISION[k]} etiqueta={`Comisión: ${t}`}/></span>)}
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
            {(a.comisionTipo || 'pct') !== 'fija' && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><CampoNumero etiqueta="Comisión en %" valor={a.comision} onCambia={v => cambia('comision', v)} ancho={80}/> %</span>}
            {a.comisionTipo === 'pctMin' && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>con mínimo de <CampoNumero enEuros etiqueta="Mínimo en euros" valor={a.comisionMin} onCambia={v => cambia('comisionMin', v)} ancho={70}/> €</span>}
            {a.comisionTipo === 'fija' && <span title="Se cobra al comprar y otra vez al vender. Si tu bróker cobra 0,37 € solo al comprar, pon 0,185 € (0,185 + 0,185 = 0,37 €)." style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><CampoNumero enEuros etiqueta="Euros por operación" valor={a.comisionFija} onCambia={v => cambia('comisionFija', v)} ancho={70}/> € por operación</span>}
          </div>
        </div>
        {multi && ociosoCampo}
      </div>}
    </div>
  )

  // ── Columna derecha ──
  const s = cifras?.seis, activoRes = ajustesDelResultado?.activo || a.activo, ociosoRes = ajustesDelResultado?.ocioso || a.ocioso
  // §49: con el ocioso en liquidez, el plan con el ocioso en liquidez es el mismo plan: ni su fila, ni su línea, ni «El ocioso añadió», ni caídas.
  const sinOcioso = ociosoRes === 'LIQUIDEZ'
  const pestanaDer = (id, texto, ayuda) => <span style={{ display: 'inline-flex', alignItems: 'center', borderBottom: `2px solid ${vistaDer === id ? B.enlace : 'transparent'}`, paddingRight: ayuda ? 8 : 0 }}>
    <button type="button" data-vista-der={id} aria-pressed={vistaDer === id} onClick={() => setVistaDer(id)} style={{ background: 'none', border: 'none', padding: '8px 4px 8px 16px', fontSize: 14, cursor: 'pointer',
      color: vistaDer === id ? B.titulo : B.secundario, fontWeight: vistaDer === id ? 700 : 400, paddingRight: ayuda ? 4 : 16 }}>{texto}</button>{ayuda && <Ayuda texto={ayuda} etiqueta={texto}/>}</span>
  // §89: el resultado de «Tu dinero» es de una lista solo si el plan calculado la tiene (al cambiar de «Una acción» a «Una lista», hasta
  // que llega el cálculo nuevo, no se enseña el de antes).
  // §187: con varios bloques, como con una lista (la parte del dinero en valores cada día, sin «Buy&Hold» de un valor).
  const resMulti = (calc.resultado?.plan?.piezas || []).filter(p => p.tipo === 'estrategia' || p.tipo === 'pesos').length > 1   // §197: también los «Con pesos»
  const resLista = multi ? resMulti : ajustesDelResultado?.donde === 'lista' && !resMulti
  const motivoDer = multi ? motivoMulti : motivoLista
  const cifrasLista = (enLista || multi) && resLista && !motivoDer ? cifras : null
  const resultado = enLista || multi ? (<>
    <div data-pestanas-der className="bp-fijo" role="group" aria-label="Qué ver del plan" style={{ display: 'flex', alignItems: 'flex-end', height: ALTO_BARRA_COL, boxSizing: 'border-box', borderBottom: `1px solid ${B.borde}`, background: B.fondo }}>{pestanaDer('dinero', 'Tu dinero')}{pestanaDer('detalle', 'Detalle', AYUDA_DETALLE.pestana)}</div>
    {(motivoDer ? <div data-sin-motor-lista style={{ ...S.tarjeta, ...S.cuerpo, color: B.texto }}>{motivoDer}</div>
      : !cifrasLista ? <div data-sin-resultado style={{ ...S.tarjeta, ...S.cuerpo, ...S.secundario }}>{calc.error ? '' : 'Calculando tu plan…'}</div>
      : <>
        {!!calcLista?.ignorado.length && <div data-aviso-lista-simple style={{ color: AMARILLO, display: 'flex', alignItems: 'center', gap: 2 }}>{avisoListaSimple(calcLista.ignorado, a.ocioso)}<Ayuda texto={AYUDA_PLAN.listaSimple} etiqueta="Lo que todavía no cuenta con una lista"/></div>}
        {vistaDer === 'detalle' ? <PlanDetalle detalle={detalle} cifras={cifrasLista} viejas={cifrasViejas} onIrAValor={onIrAValor} inicial={inicial?.detalle || null} nombre={nombreDe(actual) || null} version={version}
          graficoPlan={<><GraficoPlan curva={sinOcioso ? { ...cifrasLista.curva, ociosoLiquidez: null } : cifrasLista.curva} activo="de la lista" finales={finalesDe(cifrasLista)} visibles={lineasVisibles} proporcion/>
            <Leyenda curva={sinOcioso ? { ...cifrasLista.curva, ociosoLiquidez: null } : cifrasLista.curva} activo="de la lista" visibles={lineasVisibles} onMarca={marcaLinea} proporcion/></>}/>
          : vistaDinero(cifrasLista, true)}
      </>)}
  </>) : !cifras ? (
    <div data-sin-resultado style={{ ...S.tarjeta, ...S.cuerpo, ...S.secundario }}>{!estrategia ? 'Elige una estrategia de tarjetas.' : calc.calculando || clave ? 'Calculando tu plan…' : 'Sin resultado todavía.'}</div>
  ) : (<>   {/* §161: con un solo valor, «Tu dinero» y «Detalle» (sin «La cartera por dentro», que es del Backtesting con lista) */}
    <div data-pestanas-der className="bp-fijo" role="group" aria-label="Qué ver del plan" style={{ display: 'flex', alignItems: 'flex-end', height: ALTO_BARRA_COL, boxSizing: 'border-box', borderBottom: `1px solid ${B.borde}`, background: B.fondo }}>{pestanaDer('dinero', 'Tu dinero')}{pestanaDer('detalle', 'Detalle', AYUDA_DETALLE.pestana)}</div>
    {vistaDer === 'detalle' ? <PlanDetalle detalle={detalle} cifras={cifras} viejas={cifrasViejas} onIrAValor={onIrAValor} inicial={inicial?.detalle || null} nombre={nombreDe(actual) || null} version={version}
        graficoPlan={<><GraficoPlan curva={sinOcioso ? { ...cifras.curva, ociosoLiquidez: null } : cifras.curva} activo={activoRes} finales={finalesDe(cifras)} visibles={lineasVisibles}/>
          <Leyenda curva={sinOcioso ? { ...cifras.curva, ociosoLiquidez: null } : cifras.curva} activo={activoRes} visibles={lineasVisibles} onMarca={marcaLinea}/></>}/>
      : vistaDinero(cifras, false)}
  </>)
  function vistaDinero(cifras, conLista) {
  const s = cifras.seis
  // §90: sin aportaciones (solo el dinero inicial), la TIR es el mismo número que el CAGR: ni su cifra ni su columna.
  const dineroRes = calc.resultado?.plan?.dinero, conTir = !!dineroRes && ((dineroRes.aportaciones?.frecuencia || 'ninguna') !== 'ninguna' || (dineroRes.extraordinarias || []).length > 0)
  return (<div data-vista-dinero data-cifras-viejas={cifrasViejas ? 'si' : undefined} title={cifrasViejas ? 'Calculando con tus ajustes de ahora: estas cifras son del cálculo anterior.' : undefined} style={{ display: 'flex', flexDirection: 'column', gap: 10, opacity: cifrasViejas ? 0.4 : 1, transition: 'opacity 0.15s' }}>
    <div data-cifras style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
      <Cifra id="aportado" titulo="Has aportado" ayuda={AYUDA_PLAN.aportado} valor={euros(s.aportado, 0)}/>
      <Cifra id="final" color={colorSigno(s.ganancia)} titulo="Tienes al final" ayuda={AYUDA_PLAN.final} valor={euros(s.final, 0)} sub={`ganancia neta ${euros(s.ganancia, 0)}`}/>
      <Cifra id="twr" color={colorSigno(s.twr)} titulo="CAGR del plan" ayuda={AYUDA_PLAN.twr} valor={pct(s.twr)}/>
      {conTir && <Cifra id="tir" color={colorSigno(s.tir)} titulo="Rentabilidad de tu dinero (TIR)" ayuda={AYUDA_PLAN.tir} valor={pct(s.tir)}/>}
      <Cifra id="caida" color={colorSigno(s.caidaPct)} titulo="Peor caída" ayuda={ayudaCaida(s)} valor={pct(s.caidaPct)} sub={`${fechaCorta(s.caidaPctValle)} · ${euros(s.caidaEuros, 0)}`}/>
      {!conLista && <Cifra id="ocioso" titulo="En el ocioso" ayuda={AYUDA_PLAN.enOcioso} valor={<span style={{ whiteSpace: 'nowrap' }}>{pct(cifras.enOcioso, 1)}<span style={{ fontSize: 13, fontWeight: 400, color: B.secundario }}> del tiempo</span></span>}/>}
      {/* §93: con una lista, la parte del dinero en el ocioso, de media. */}
      {conLista && <Cifra id="ocioso" titulo="En el ocioso" ayuda={AYUDA_PLAN.enOciosoLista} valor={<span style={{ whiteSpace: 'nowrap' }}>{pct(cifras.enOcioso, 0)}<span style={{ fontSize: 13, fontWeight: 400, color: B.secundario }}> de media</span></span>} sub={Number.isFinite(cifras.enOcioso) ? `de tu dinero · en valores, el ${pct(1 - cifras.enOcioso, 0)}` : undefined}/>}
      {/* §57: en una línea; el detalle de las órdenes, en su tooltip y en su «?». */}
      <Cifra id="costes" titulo="Impuestos y comisiones" ayuda={`${AYUDA_PLAN.costes} En este plan: ${euros(s.impuestos, 0)} de impuestos y ${euros(s.costes, 0)} de comisiones en ${cifras.ordenes} órdenes.`} valor={<span title={`Impuestos ${euros(s.impuestos, 0)} · Comisiones ${euros(s.costes, 0)} (${cifras.ordenes} órdenes)`} style={{ fontSize: 16, whiteSpace: 'nowrap' }}>
        <span data-impuestos>{euros(s.impuestos, 0)}</span> · <span data-comisiones>{euros(s.costes, 0)}</span></span>}/>
    </div>
    <Tarjeta id="grafico" titulo="Cómo crece tu dinero" ayuda={conLista ? `${AYUDA_PLAN.graficoLista} ${AYUDA_PLAN.franjaLista}` : `${AYUDA_PLAN.grafico} ${AYUDA_PLAN.franja}`}>
      <Ampliable titulo="Cómo crece tu dinero"><GraficoPlan curva={conLista ? { ...cifras.curva, ...(sinOcioso ? { ociosoLiquidez: null } : {}) } : sinOcioso ? { ...cifras.curva, ociosoLiquidez: null } : cifras.curva} activo={conLista ? 'de la lista' : activoRes} finales={finalesDe(cifras)} visibles={lineasVisibles} proporcion={conLista}/></Ampliable>
      <Leyenda curva={conLista ? { ...cifras.curva, ...(sinOcioso ? { ociosoLiquidez: null } : {}) } : sinOcioso ? { ...cifras.curva, ociosoLiquidez: null } : cifras.curva} activo={conLista ? 'de la lista' : activoRes} visibles={lineasVisibles} onMarca={marcaLinea} proporcion={conLista}/>
    </Tarjeta>
    <Tarjeta id="anios" titulo="Año a año" ayuda={AYUDA_PLAN.anios}>
      <div style={{ overflowX: 'auto' }}><table data-tabla="anios" style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead><tr>{(conLista ? ['Año', 'Rentabilidad del plan', 'Peor caída del plan en el año'] : ['Año', 'Rentabilidad del plan', 'Buy&Hold del valor', 'Peor caída del plan en el año', 'Peor caída Buy&Hold', '% del año en el ocioso']).map(h => <th key={h} style={cab}>{h}</th>)}</tr></thead>
        <tbody>{cifras.anios.map(x => conLista ? <tr key={x.anio} data-anio={x.anio}><td style={celda}>{x.anio}</td><td style={{ ...celda, color: colorSigno(x.plan) || B.texto, fontWeight: 700 }}>{pct(x.plan)}</td><td style={{ ...celda, color: colorSigno(x.caidaPlan) || B.texto }}>{pct(x.caidaPlan)}</td></tr>
          : <tr key={x.anio} data-anio={x.anio}><td style={celda}>{x.anio}</td><td style={{ ...celda, color: colorSigno(x.plan) || B.texto, fontWeight: 700 }}>{pct(x.plan)}</td><td style={{ ...celda, color: colorSigno(x.activo) || B.texto }}>{pct(x.activo)}</td><td style={{ ...celda, color: colorSigno(x.caidaPlan) || B.texto }}>{pct(x.caidaPlan)}</td><td style={{ ...celda, color: colorSigno(x.caidaActivo) || B.texto }}>{pct(x.caidaActivo)}</td><td style={celda}>{pct(x.enOcioso, 1)}</td></tr>)}</tbody>
      </table></div>
    </Tarjeta>
    <Tarjeta id="alternativas" titulo={cifras.bloques ? 'Frente a cada bloque solo y a no tener estrategia' : TITULO_ALTERNATIVAS} ayuda={`${conLista ? `${AYUDA_PLAN.alternativas} ${AYUDA_PLAN.bhLista}` : AYUDA_PLAN.alternativas}${cifras.bloques ? ` ${AYUDA_BLOQUES.soloBloque}` : ''}`}>
      <div style={{ overflowX: 'auto' }}><table data-tabla="alternativas" style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead><tr>{['', 'Final', 'CAGR', ...(conTir ? ['TIR'] : []), 'Peor caída', 'Impuestos', 'Comisiones'].map(h => <th key={h} style={cab}>{h}</th>)}<th style={cab}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>Órdenes<Ayuda texto={AYUDA_PLAN.ordenes} etiqueta="Órdenes"/></span></th></tr></thead>
        <tbody>{cifras.alternativas.filter(x => !(sinOcioso && x.id === 'OCIOSO_LIQUIDEZ')).map(x => <tr key={x.id} data-fila={x.id} style={x.id === 'PLAN' ? { fontWeight: 700, color: B.titulo } : undefined}>
          <td style={celda}>{x.bloque ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: '50%', background: COLORES_BLOQUE[(x.bloque - 1) % COLORES_BLOQUE.length], flex: 'none' }}/>{x.nombre}</span> : x.nombre}</td><td style={{ ...celda, whiteSpace: 'nowrap', color: colorSigno(x.final - s.aportado) }}>{euros(x.final, 0)}</td><td style={{ ...celda, color: colorSigno(x.twr) }}>{pct(x.twr)}</td>{conTir && <td style={{ ...celda, color: colorSigno(x.tir) }}>{pct(x.tir)}</td>}<td style={{ ...celda, color: colorSigno(x.caida) }}>{pct(x.caida)}</td><td style={{ ...celda, whiteSpace: 'nowrap' }}>{euros(x.impuestos, 0)}</td><td style={{ ...celda, whiteSpace: 'nowrap' }}>{euros(x.costes, 0)}</td><td style={celda}>{x.ordenes}</td>
        </tr>)}</tbody>
      </table></div>
    </Tarjeta>
    <Tarjeta id="tramos" titulo="¿Es estable? Por tramos" ayuda={AYUDA_PLAN.tramos}>
      <div style={{ overflowX: 'auto' }}><table data-tabla="tramos" style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead><tr>{['Tramo', 'CAGR de tu plan', ...(sinOcioso ? [] : ['El ocioso añadió'])].map(h => <th key={h} style={cab}>{h}</th>)}</tr></thead>
        <tbody>{cifras.tramos.map(t => <tr key={t.nombre} data-tramo={t.nombre}><td style={celda}>{t.nombre}</td><td style={{ ...celda, color: colorSigno(t.cagr) || B.texto }}>{pct(t.cagr)}</td>{!sinOcioso && <td style={{ ...celda, color: colorSigno(t.ocioso) || B.texto }}>{t.ocioso == null ? '—' : puntos(t.ocioso)}</td>}</tr>)}</tbody>
      </table></div>
    </Tarjeta>
    {!conLista && <Tarjeta id="caidas" titulo="Cuando tu estrategia cae, ¿qué hace el ocioso?" ayuda={AYUDA_PLAN.caidas}>
      {sinOcioso ? <div data-sin-ocioso style={{ color: B.texto }}>{SIN_OCIOSO}</div> : <div data-frase-caidas style={{ marginBottom: 8, color: B.texto }}>{fraseCaidas(cifras, ociosoRes)}</div>}
      {!sinOcioso && cifras.caidas.length > 0 && <div style={{ overflowX: 'auto' }}><table data-tabla="caidas" style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead><tr>{['Desde (pico)', 'Hasta (valle)', 'Tu estrategia', `El ocioso (${ociosoRes === 'LIQUIDEZ' ? 'liquidez' : ociosoRes})`, 'Recupera el pico'].map(h => <th key={h} style={cab}>{h}</th>)}</tr></thead>
        <tbody>{cifras.caidas.map(c => <tr key={c.pico} data-caida={c.pico}><td style={celda}>{fechaCorta(c.pico)}</td><td style={celda}>{fechaCorta(c.valle)}</td><td style={{ ...celda, color: ROJO }}>{pct(c.caida)}</td>
          <td style={{ ...celda, color: c.ocioso > 0 ? VERDE : c.ocioso < 0 ? ROJO : B.texto }}>{c.ocioso > 0 ? '+' : ''}{pct(c.ocioso)}</td><td style={celda}>{c.recuperacion ? fechaCorta(c.recuperacion) : 'todavía no'}</td></tr>)}</tbody>
      </table></div>}
    </Tarjeta>}
  </div>)
  }

  return (
    <div ref={pagina} className="bp-pagina" style={{ ...S.pagina, '--bp-arriba': arriba != null ? `${arriba}px` : undefined }} data-pantalla="plan">
      {/* §135: al comparar, sin la cabecera de pasos (es de la estrategia) ni las pestañas de planes (se eligen con los círculos). */}
      {!comparando && <CabeceraPasos zona="plan" plan={nombreDe(actual) || null} onVolver={(donde) => pide({ tipo: 'volver', donde })}/>}
      {comparando ? falloPlanes && <div data-fallo-planes style={{ color: ROJO, marginBottom: 10 }}>✕ {falloPlanes}</div> : pestanasPlanes}
      {comparando ? <ComparaPlanes planes={todosComp} elegidos={comp.elegidos || []} refs={comp.refs} resultados={resComp} prueba={pruebaComp} log={comp.log} modo={comp.modo} plegado={comp.plegado} tema={tema} vista={comp.vista || 'tarjetas'}
        onVista={x => setComp(c => ({ ...c, vista: x }))} onGuardarCopia={ctx ? pideGuardarCopia : null} onPlegar={x => setComp(c => ({ ...c, plegado: x }))}
        onElegir={id => setComp(c => ({ ...c, elegidos: alterna(c.elegidos || [], id) }))} onRef={id => setComp(c => ({ ...c, refs: c.refs.includes(id) ? c.refs.filter(x => x !== id) : [...c.refs, id] }))}
        onLog={x => setComp(c => ({ ...c, log: x }))} onModo={x => setComp(c => ({ ...c, modo: x }))} onVolver={() => setComparando(false)}
        onAbrir={id => { const c = claveDe(id); if (c === actual) setComparando(false); else pide({ tipo: 'anadir', id }) }} onDuplicar={id => pideDuplicar(claveDe(id))}/> : <>
      {avisosDe(uso)}
      {errorCalculo}
      </>}
      {/* §49, §50 y §143: en escritorio (≥ 1000 px), esta página tiene el alto de la ventana menos lo de encima; con el plan abierto no se
          desplaza y cada columna (ajustes y resultados) lleva su propia barra; al comparar o sin plan abierto, se desplaza la página; en el
          móvil, nada fijo y se desplaza la ventana, como antes. */}
      {/* §90: las piezas del Backtesting en el bloque con lista, con letra más grande y más clara SOLO aquí (el Backtesting no cambia). */}
      {<style>{[[8, 12], [9, 12], [10, 12], [11, 13], [12, 13]].map(([de, a]) => `[data-lista] [style*="font-size:${de}px"], [data-lista] [style*="font-size: ${de}px"] { font-size: ${a}px !important }`).join(' ') + ' [data-lista] { --text3: var(--bd-secundario, #a9c3d6); --text2: var(--bd-texto, #c6dbea) }'}</style>}
      {/* §178: las piezas del Backtesting llevan algunos colores de texto escritos tal cual (pensados para su fondo azul oscuro); dentro
          del plan se cambian por los del tono (☀/☾). El Backtesting suelto no cambia. */}
      <style>{COLORES_PIEZAS}</style>
      <style>{`.bp-avisos { flex-direction: row } @media (max-width: 700px) { .bp-avisos { flex-direction: column; align-items: flex-start !important } }
/* §80: las piezas del Backtesting, en su caja oscura de siempre. */
.bp-mc { --bg: var(--bd-caja, #080c14); --bg2: var(--bd-tarjeta, #0d1520); --bg3: var(--bd-cabecera, #111d2e); --border: var(--bd-borde, #1a2d45); --border2: var(--bd-borde, #243d5c);
  --text: var(--bd-texto, #e2eaf5); --text2: var(--bd-secundario, #7a9bc0); --text3: var(--bd-apagado, #6a8aa8); --accent: var(--bd-enlace, #00d4ff);
  background: var(--bg); border: 1px solid var(--border); border-radius: 6px; overflow: hidden; color: var(--text) }
/* §189: sus casillas y desplegables llevan un fondo oscuro escrito tal cual: dentro del plan, el del tono (en claro no se leían). */
.bp-mc input:not([type="checkbox"]):not([type="radio"]), .bp-mc select { background: ${B.fondo} !important; border-color: var(--border) !important; color: var(--text) !important }
@media (min-width: 1000px) { .bp-pagina { box-sizing: border-box; height: calc(100vh - var(--bp-arriba, 56px)); flex: none !important }
  /* §143: con el plan abierto, la página NO se desplaza: lo de arriba queda fijo y cada columna tiene su barra, sin pasarse la rueda. */
  .bp-pagina:has(> .bp-cols) { display: flex; flex-direction: column; overflow: hidden !important }
  .bp-pagina:has(> .bp-cols) > * { flex-shrink: 0 }
  .bp-pagina > .bp-cols { flex: 1 1 0; min-height: 0; flex-wrap: nowrap !important; align-items: stretch !important }
  .bp-izq, .bp-der { overflow-y: auto; overscroll-behavior: contain; padding-right: 4px }
  .bp-der > * { flex-shrink: 0 }
  /* §174: «Ocultar el panel» y «Tu dinero / Detalle», siempre visibles arriba de su columna. */
  .bp-fijo { position: sticky; top: 0; z-index: 6 } }
/* §189: el borde arrastrable del panel: una raya que se ve al pasar el ratón; en pantallas estrechas no hay. */
.bp-borde { background: linear-gradient(to right, transparent 3px, ${B.borde} 3px, ${B.borde} 5px, transparent 5px); opacity: 0.35; transition: opacity 0.15s }
.bp-borde:hover { opacity: 1; background: linear-gradient(to right, transparent 2px, ${B.enlace} 2px, ${B.enlace} 6px, transparent 6px) }
@media (max-width: 999px) { .bp-borde { display: none } }`}</style>
      {comparando ? null : actual ? <div className="bp-cols" style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {/* §165: el panel de la izquierda se puede plegar a una franja estrecha (se recuerda en este navegador). Plegado sigue montado (oculto), así no pierde nada. */}
        {panelOculto && <button type="button" data-abre-panel onClick={() => ponPanelOculto(false)} title="Ver otra vez «Cartera» y «Tu dinero»" aria-label="Ver el panel de la izquierda"
          style={{ flex: '0 0 34px', alignSelf: 'stretch', minHeight: 240, background: B.tarjeta, border: `1px solid ${B.borde}`, borderRadius: B.radioBoton, color: B.secundario, cursor: 'pointer', fontFamily: B.letra, fontSize: 13, writingMode: 'vertical-rl', transform: 'rotate(180deg)', padding: '10px 0' }}>▶ Cartera · Tu dinero</button>}
        <div data-columna="izquierda" ref={izqRef} data-ancho={anchoIzq ?? ''} className="bp-izq" style={{ ...(anchoIzq ? { flex: `0 0 ${anchoIzq}px`, maxWidth: ANCHO_MAX } : { flex: '1 1 340px', maxWidth: 520 }), minWidth: 0, ...(panelOculto ? { display: 'none' } : {}) }}>
          {/* §174: a la misma altura que «Tu dinero / Detalle» y, como ellas, fija arriba al bajar por la columna. */}
          <div className="bp-fijo" data-barra-izq style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', height: ALTO_BARRA_COL, boxSizing: 'border-box', marginBottom: 10, background: B.fondo }}><button type="button" data-oculta-panel onClick={() => ponPanelOculto(true)} title="Pliega «Cartera» y «Tu dinero» para que los gráficos y las tablas usen todo el ancho" style={{ fontFamily: B.letra, fontSize: 12, padding: '3px 9px', borderRadius: 6, cursor: 'pointer', border: `1px solid ${B.borde}`, background: B.fondo, color: B.secundario }}>◀ Ocultar el panel</button></div>
          {dinero}{bloques}</div>
        {!panelOculto && <div data-borde-panel className="bp-borde" role="separator" aria-orientation="vertical" aria-label="Arrastra para cambiar el ancho del panel" onMouseDown={arrastraBorde} onDoubleClick={anchoNormal}
          title="Arrastra para estrechar o ensanchar el panel de la izquierda. Doble clic: el ancho de siempre." style={{ flex: '0 0 8px', alignSelf: 'stretch', cursor: 'col-resize', margin: '0 -12px 0 -8px', position: 'relative', zIndex: 5 }}/>}
        <div data-columna="derecha" className="bp-der" style={{ flex: '2 1 480px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {resultado}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginTop: 6 }}>
            <BotonCopiar obtenerTexto={texto} titulo="Copia en texto plano todos los ajustes, el plan y sus cifras"/>
            {!estBorrada && <button data-boton="paso2" style={S.boton} onClick={() => pide({ tipo: 'paso2' })}>Volver al paso 2</button>}
          </div>
        </div>
      </div> : orden && <div data-sin-pestanas style={{ ...S.tarjeta, ...S.cuerpo, ...S.secundario, marginTop: 6, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>Ningún plan abierto. Pulsa «+ Añadir plan».{hayComparar && botonComparar}</div>}
      {pregunta && (
        <Pregunta id="sin-guardar" texto={`Tienes cambios sin guardar en «${nombreDe(actual)}».`} aviso={pregunta.fallo ? falloGuardar : null}
          extra={!fila ? <input type="text" aria-label="Nombre del plan" placeholder="Nombre del plan" maxLength={200} value={nombreNuevo} onChange={e => setNombreNuevo(e.target.value)} style={{ ...campo, width: '100%', boxSizing: 'border-box', marginBottom: 16 }}/> : null}>
          <button data-salida="guardar" disabled={!puedeGuardar || (!fila && !nombreLimpio(nombreNuevo))} onClick={() => responde('guardar')} style={puedeGuardar && (fila || nombreLimpio(nombreNuevo)) ? S.botonVerde : S.botonDesactivado}>{guardando ? 'Guardando…' : 'Guardar'}</button>
          <button data-salida="salir" disabled={guardando} onClick={() => responde('salir')} style={S.boton}>Salir sin guardar</button>
          <button data-salida="cancelar" disabled={guardando} onClick={() => responde('cancelar')} style={S.boton}>Cancelar</button>
        </Pregunta>)}
      {ventana && (
        <Pregunta id="nombre-plan" texto={ventana === 'nuevo' ? 'Guardar este plan' : ventana.copia ? `Guardar «${copiasComp.find(x => mismoId(x.id, ventana.copia))?.nombre || 'la copia'}» como plan nuevo` : `Duplicar «${nombreDe(ventana.duplica)}»`} aviso={falloGuardar}
          extra={<input type="text" autoFocus aria-label="Nombre del plan" placeholder="Nombre del plan" maxLength={200} value={nombreNuevo} onChange={e => setNombreNuevo(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') guardaVentana(); if (e.key === 'Escape') limpiaDialogos() }} style={{ ...campo, width: '100%', boxSizing: 'border-box', marginBottom: 16 }}/>}>
          <button data-boton="confirmar-nombre" disabled={guardando || !nombreLimpio(nombreNuevo)} onClick={guardaVentana} style={!guardando && nombreLimpio(nombreNuevo) ? S.botonVerde : S.botonDesactivado}>{guardando ? 'Guardando…' : 'Guardar'}</button>
          <button onClick={limpiaDialogos} style={S.boton}>Cancelar</button>
        </Pregunta>)}
      {borrando && (
        <Pregunta id="borrar-plan" texto={`¿Borrar «${nombreDe(borrando)}»? Se borra de la base y no se puede deshacer.`} detalle="Para quitarlo solo de la vista, usa la ×." aviso={falloGuardar}>
          <button data-boton="si-borrar" disabled={guardando} onClick={borra} style={{ ...S.botonVerde, background: C.rojoFuerte, borderColor: C.rojoFuerte, color: '#fff' }}>{guardando ? 'Borrando…' : 'Sí, borrar'}</button>
          <button onClick={limpiaDialogos} style={S.boton}>Cancelar</button>
        </Pregunta>)}
    </div>
  )
}
