// components/BuilderPlan.js — el paso 3 del Builder, «Convertirla en plan» (opción A del boceto, versión 2; docs/builder.md, §48). Se
// entra desde el paso 3 de la barra de pasos y desde «Paso 3 · Convertirla en plan» del resultado del paso 2 (siempre activo, también si
// la prueba no pasa). Una estrategia de tarjetas en UNA acción con el dinero de la persona: a la izquierda los bloques y «Tu dinero»; a
// la derecha, el resultado, que se recalcula solo ~600 ms después del último cambio (/api/plan, el motor de lib/planes/ sin tocar; si
// hay un cálculo en marcha, manda el último). Los números y los textos, en lib/builder/planPantalla.js. NORMA de esta pantalla: las
// explicaciones no ocupan sitio fijo; cada término lleva su «?» (components/BuilderAyuda.js) con un ejemplo con números, y los avisos
// van en una línea.
// Parte 2 (§48): arriba, una pestaña por plan guardado (planes_inversion, lib/builder/planesGuardados.js) y los nuevos sin guardar,
// con «+ Añadir plan» (copia los ajustes de ahora) y «Comparar planes» (desactivado). «Guardar este plan» pide el nombre; uno guardado,
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
import { useState, useEffect, useMemo, useRef } from 'react'
import { B, S } from '../lib/builder/estilo'
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
import PlanPorDentro, { peticionPorDentro, motivoSinPeticion } from './backtesting/PlanPorDentro'
import FiltrosPanel from './FiltrosPanel'
import { mergeFiltros } from '../lib/filtros'
import { numeroEs } from '../lib/utils'
import { AJUSTES_PLAN, AVISO_A_MANO, AVISO_NO_EXISTE, AVISO_PRUEBA, AYUDA_COMISION, AYUDA_PLAN, ETIQUETA_PRUEBA, OCIOSOS_FIJOS, PERIODOS_PLAN, SIN_OCIOSO, SUBIDA_DEFECTO, TIPOS_COMISION, ajustesDe,
  ayudaCaida, ayudaPrueba, avisoListaSimple, oroComparable, reglaDe, baseNueva, cifrasPlan, conCambios, conComa, nombreNueva, creaCalculador, estadoPrueba, estadosPrueba, esSemanal, euros, fechaCorta, fechasDe, finalesDe, fraseCaidas, pct, planDe, puntos, textoCampo, textoEuros, CLAVE_LINEAS, LINEAS_DEFECTO,
  textoCodigo, textoParaClaudePlan, TITULO_ALTERNATIVAS, avisoPruebaLista, ayudaPruebaLista } from '../lib/builder/planPantalla'

const AMARILLO = '#f2cc60', ROJO = '#ff8b8b', VERDE = '#7ee2a0', AZUL = '#58a6ff', GRIS_FRANJA = '#3a4656'
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
  { k: 'activo', t: 'Buy&Hold', color: '#d0d7de', ancho: 1.5 },
  { k: 'spy', t: 'Buy&Hold SPY', color: '#d2a8ff', ancho: 1.5 },
  { k: 'qqq', t: 'Buy&Hold QQQ', color: '#56d4dd', ancho: 1.5 },
  { k: 'ociosoLiquidez', t: 'Ocioso en liquidez', color: '#f0883e', ancho: 1.5 },
  { k: 'aportado', t: 'Lo aportado', color: '#6e7681', ancho: 1, escalon: true },
]
const nombreLinea = (l, activo) => l.k === 'activo' && activo ? `${l.t} ${activo}` : l.t
// finales: { plan, activo, spy, qqq, ociosoLiquidez, aportado } en euros (el texto al final de cada línea; sin él, solo el nombre). §57: visibles: { clave: sí o no } (Tu plan siempre se ve); más alto (375 px, antes 250).
// §93: proporcion (con una lista): la franja enseña cada día la parte del dinero en valores (altura azul) y en el ocioso (gris), y al pasar
// el ratón, la fecha y las dos partes.
function GraficoPlan({ curva, activo, finales = {}, visibles = LINEAS_DEFECTO, proporcion = false }) {
  const [ref, W] = useAncho()
  const [hov, setHov] = useState(null)
  const IZQ = 76, DER = 200, H1 = 375, ARR = 22, FR = proporcion ? 40 : 14, n = curva.fechas.length
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
        {marcasLog(lo, hi).map((t, k) => <g key={k}><line x1={IZQ} x2={W - DER} y1={y(t)} y2={y(t)} stroke="#1b2430"/><text x={IZQ - 6} y={y(t) + 4} textAnchor="end" fontSize={12} fill={B.apagado}>{euros(t, 0)}</text></g>)}
        {anios.filter((_, k) => k % paso === 0).map(([i, a]) => <text key={a} x={x(i)} y={H1 - 6} fontSize={12} fill={B.apagado}>{a}</text>)}
        {[...lineas].reverse().map(l => <polyline key={l.k} data-linea={l.k} points={ruta(l.v, l.escalon)} fill="none" stroke={l.color} strokeWidth={l.ancho} strokeLinejoin="round"/>)}
        {etq.map(e => <text key={e.t} data-etiqueta={e.t} x={W - DER + 8} y={e.y + 4} fontSize={12} fill={e.color} fontWeight={e.color === AZUL ? 700 : 400}>{e.t}</text>)}
        {proporcion ? <g data-franja-proporcion={n}>
          <rect x={IZQ} y={yF} width={Math.max(0, W - IZQ - DER)} height={FR} fill={GRIS_FRANJA}/>
          <polygon points={`${x(0).toFixed(1)},${yF + FR} ${curva.dentro.map((d, i) => `${x(i).toFixed(1)},${(yF + FR - Math.max(0, Math.min(1, d || 0)) * FR).toFixed(1)}`).join(' ')} ${x(n - 1).toFixed(1)},${yF + FR}`} fill={AZUL}/>
          <text x={IZQ - 6} y={yF + 10} textAnchor="end" fontSize={11} fill={B.apagado}>100 %</text>
          <text x={IZQ - 6} y={yF + FR} textAnchor="end" fontSize={11} fill={B.apagado}>0 %</text>
          {hov != null && <><line x1={x(hov)} x2={x(hov)} y1={yF} y2={yF + FR} stroke={B.titulo} strokeWidth={1}/>
            <text data-franja-dato x={Math.min(Math.max(x(hov), IZQ), W - DER)} y={yF + FR + 15} textAnchor={x(hov) > (W - DER) * 0.7 ? 'end' : 'start'} fontSize={12} fill={B.texto}>{`${fechaCorta(curva.fechas[hov])} · en valores ${pct(curva.dentro[hov], 0)} · en el ocioso ${pct(1 - curva.dentro[hov], 0)}`}</text></>}
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

export default function BuilderPlan({ estrategias = [], estrategiaId = null, planId = null, apiFetch, version = null, cargaSimbolos = null, onVolver, onPaso1, onPaso2, salida = null, enlaceTesis = null, deps = null, inicial = null, datosLista = null, onIrAValor = null }) {
  const tarjetas = useMemo(() => estrategias.filter(esDeTarjetas).sort((a, b) => String(a.name).localeCompare(String(b.name), 'es')), [estrategias])
  const diarias = useMemo(() => tarjetas.filter(s => !esSemanal(s)), [tarjetas])
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
  const fila = actual?.startsWith('g') ? (planes || []).find(p => `g${p.id}` === actual) || null : null
  const fotoG = fila ? fotoDelPlan(fila.plan) : null
  const estrategiaActual = diarias.find(s => String(s.id) === estId) || null
  const usaGuardada = !!fotoG && String(fotoG.id) === estId && (cualVersion === 'guardada' || !estrategiaActual)
  const estrategia = usaGuardada ? fotoG : estrategiaActual
  const estBorrada = !!fotoG && String(fotoG.id) === estId && !estrategias.some(s => String(s.id) === estId)   // §60: se borró; el plan sigue con su copia
  const cambia = (k, v) => setA(x => ({ ...x, [k]: v }))
  const [otroForzado, setOtroForzado] = useState(false)
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
  // §80: «Una lista». Lo que se guarda va en a.lista (lib/planes/lista.js); esto es solo de la vista (buscar, ★, la lista de la Watchlist, qué está desplegado).
  const [vistaLista, setVistaLista] = useState({ busca: '', favs: false, lista: '', seccion: { mode: true, strats: false }, mercado: false, activo: false, universoDatos: {} })
  const ponVista = (k) => (v) => setVistaLista(x => ({ ...x, [k]: typeof v === 'function' ? v(x[k]) : v }))
  const ponLista = (k) => (v) => setA(x => ({ ...x, lista: { ...x.lista, [k]: typeof v === 'function' ? v(x.lista[k]) : v } }))
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
  const plan = useMemo(() => estrategia ? planDe(a, estrategia) : null, [a, estrategia])
  const errores = useMemo(() => plan ? validaPlan(plan) : [], [plan])
  const enLista = a.donde === 'lista'
  // §84: el motor del Backtesting calcula con la estrategia de AHORA (por su id). Con la versión guardada de un plan, solo si su regla
  // sigue igual que la de ahora; si no, se dice por qué no se calcula.
  const estPorDentro = !estrategia ? null : !usaGuardada ? estrategia : (estrategiaActual && cambio && !cambio.cambiada && !cambio.borrada ? estrategiaActual : null)
  const motivoEstPorDentro = !estrategia || estPorDentro ? null : estBorrada ? 'La estrategia de este plan está borrada: «La cartera por dentro» solo sabe calcular con una estrategia que siga entre las tuyas.'
    : !cambio ? 'Comprobando la estrategia…' : 'La estrategia ha cambiado desde que guardaste este plan y «La cartera por dentro» solo sabe calcular con la de ahora: pulsa «Usar la versión actual» para verla.'
  // §89 (fase 6): con «Una lista», «Tu dinero» se calcula con el plan que ya se sabe calcular (sin aportaciones, sin impuestos, ocioso en
  // liquidez, sin apalancar: planListaCalculable) y con la MISMA petición de «La cartera por dentro» (cuerpoLista), que /api/plan pasa a
  // /api/multibacktest para sacar los candidatos de cada valor.
  const calcLista = useMemo(() => enLista && plan ? planListaCalculable(plan) : null, [enLista, plan])
  const cuerpoLista = useMemo(() => enLista && estPorDentro ? peticionPorDentro({ a, estrategia: estPorDentro, wlData: datosLista?.wlData || {} }) : null, [enLista, a, estPorDentro, datosLista?.wlData])
  const motivoLista = !enLista ? null : (motivoEstPorDentro || (calcLista && motivoListaNoCalculable(calcLista.plan)) || (!cuerpoLista ? motivoSinPeticion({ a, estrategia: estPorDentro }) : null))
  const clave = !actual || !plan || errores.length ? null : !enLista ? JSON.stringify(plan) : motivoLista || !cuerpoLista ? null : JSON.stringify({ plan: calcLista.plan, cuerpoLista })
  const api = useRef(apiFetch); api.current = apiFetch
  // Un plan ya calculado (p. ej., al volver a una pestaña) se enseña sin repetir el cálculo.
  const hechos = useRef(new Map())
  const calculador = useRef(null)
  if (!calculador.current) {
    const pide = deps?.calcula || (async (p, cuerpoLista = null) => {
      const r = await api.current('/api/plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan: p, curvas: true, ...(cuerpoLista ? { cuerpoLista } : {}) }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
      return j
    })
    // §89: con lista, lo que se pide es { plan, cuerpoLista }; el resultado guarda el plan calculado y su clave.
    calculador.current = creaCalculador({ calcula: async (p) => p?.cuerpoLista ? ({ respuesta: await pide(p.plan, p.cuerpoLista), plan: p.plan, clave: JSON.stringify(p) }) : ({ respuesta: await pide(p), plan: p }),
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
  const aplica = (e) => { setA(e.a); setEstId(e.estId); setCualVersion(e.version); setOtroForzado(false) }
  // Leídos los planes y las pestañas guardadas (null: esta persona no tiene fila todavía), qué se abre al entrar.
  const entra = (xs, guardadas) => {
    const o = ordenInicial(guardadas, xs)
    ultimasIds.current = guardadas == null ? null : JSON.stringify(guardadas.map(Number))
    const e = eligeEntrada({ planes: xs, orden: o, estrategiaId, planId, fotoDe: fotoDelPlan })
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
    aplica(e); setActual(clave); limpiaDialogos()
  }
  // Un plan nuevo, con los ajustes de ahora (o sin ninguno abierto, los de siempre): «Plan nuevo», «Plan nuevo 2»… (el primer número libre). junto: la pestaña a cuyo lado se abre.
  const creaNuevo = (desde = null, junto = null) => {
    const clave = `n${++cuentaNuevas.current}`, e = desde || (actual ? { a: { ...a }, estId: String(estrategiaActual?.id ?? estId), version: 'actual' } : borrador())
    if (actual?.startsWith('n')) edic.current[actual] = { a, estId, version: cualVersion }
    edic.current[clave] = e
    setNuevas(xs => [...xs, { clave, nombre: nombreNueva(xs), base: base(e) }])
    setOrden(o => junto ? trasDe(o || [], junto, clave) : [...(o || []), clave])
    aplica(e); setActual(clave); limpiaDialogos()
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
  const guardaVentana = async () => {
    if (!ventana || !nombreLimpio(nombreNuevo) || guardando) return
    if (ventana === 'nuevo') { if (await guardaAbierta()) limpiaDialogos(); return }
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
  // Lo que se enseña en «+ Añadir plan»: el final de los planes guardados ya calculados.
  useEffect(() => { if (fila && cifras && !hayCambios && clave === (calc.resultado?.clave || JSON.stringify(calc.resultado?.plan))) setFinales(x => ({ ...x, [fila.id]: cifras.seis.final })) }, [cifras, fila?.id, hayCambios])
  const texto = () => textoParaClaudePlan({ ajustes: a, estrategia, plan, cifras: enLista ? null : cifras, estado, resultadoPrueba: resPrueba, version, nombre: fila?.nombre || null })

  // ── Avisos (una línea; el detalle, tras «?») ──
  const avisoPrueba = estado && (
    <div data-aviso="prueba" data-estado={estado.clave} data-lista={enLista ? '1' : undefined} style={{ color: estado.clave === 'pasa' && !enLista ? VERDE : estado.clave === 'noPasa' ? ROJO : AMARILLO, fontWeight: estado.clave === 'noPasa' ? 700 : 400, display: 'flex', alignItems: 'center', gap: 2 }}>
      {enLista ? avisoPruebaLista(estado) : AVISO_PRUEBA[estado.clave]}{enLista && <Ayuda texto={ayudaPruebaLista(estado)} etiqueta="La lista aún no tiene prueba"/>}<span style={S.apagado}>&nbsp;·&nbsp;</span>{!estBorrada && <button data-boton="ver-prueba" style={{ ...S.enlace, fontSize: 13 }} onClick={() => pide({ tipo: 'paso2' })}>{estado.clave === 'sinPrueba' ? 'Probarla ahora' : 'Ver la prueba'}</button>}<Ayuda texto={ayudaPrueba(estado, resPrueba)} etiqueta="La prueba contra el azar"/>
    </div>
  )
  // §54: una línea bajo las pestañas: los avisos (en el móvil, uno debajo del otro: .bp-avisos), «Calculando…» y, a la derecha, guardar y «Comparar planes».
  const avisos = actual ? (
    <div data-avisos className="bp-avisos" style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 24px', alignItems: 'center', marginBottom: 12 }}>
      {estrategia && (avisoPrueba || <div data-aviso="prueba" data-estado="leyendo" style={S.secundario}>Leyendo la prueba…</div>)}
      {enlaceTesis?.('plan', fila?.id)}
      {!enLista && <div data-aviso="a-mano" style={{ color: AMARILLO, display: 'flex', alignItems: 'center', gap: 2 }}>⚠ {AVISO_A_MANO}<Ayuda texto={AYUDA_PLAN.aMano} etiqueta={AVISO_A_MANO}/></div>}
      {nuevaActual && <div data-aviso="sin-guardar" style={{ color: AMARILLO }}>Sin guardar: se perderá al recargar</div>}
      {calc.calculando && (!enLista || vistaDer === 'dinero') && <div data-calculando style={{ color: AMARILLO }}>Calculando…</div>}
      <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {sinGuardar && <button data-boton="descartar" style={{ ...S.boton, padding: '6px 12px' }} disabled={guardando} onClick={descartaCambios}>Descartar cambios</button>}
        {hayCambios && <button data-boton="guardar-cambios" style={{ ...(puedeGuardar ? S.botonVerde : S.botonDesactivado), padding: '6px 12px' }} disabled={!puedeGuardar} title={`Guardado por última vez el ${fechaCorta(fila.updated_at)}`} onClick={guardaAbierta}>{guardando ? 'Guardando…' : 'Guardar cambios'}</button>}
        {nuevaActual && <button data-boton="guardar" style={{ ...(puedeGuardar ? S.botonVerde : S.botonDesactivado), padding: '6px 12px' }} disabled={!puedeGuardar} title={!ctx ? 'Sin conexión con la base de datos: no se pueden guardar planes' : undefined} onClick={() => { limpiaDialogos(); setVentana('nuevo') }}>Guardar este plan</button>}
        <button data-boton="comparar" disabled title="Próximamente" style={{ ...S.boton, padding: '6px 12px', fontSize: 13, color: B.apagado, cursor: 'not-allowed' }}>Comparar planes</button>
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
      <BuilderPestanas pestanas={pestanas} actual={actual} planes={planes || []} abiertas={orden || []} finales={finales} ancho={inicial?.anchoPestanas ?? null} menuInicial={inicial?.menu ?? null} buscaInicial={inicial?.buscaMenu ?? ''}
        onAbrir={c => pide({ tipo: 'abrir', clave: c })} onDuplicar={pideDuplicar} onBorrar={c => { limpiaDialogos(); setBorrando(c) }} onCerrar={pulsaCerrar} onCrear={() => pide({ tipo: 'crear' })}
        onAnadir={id => { if (claveDe(id) !== actual) pide({ tipo: 'anadir', id }) }}/>
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
  const L = a.lista || {}
  const bloques = (
    <div data-tarjeta="bloques" style={{ ...S.tarjeta, overflow: 'visible' }}>
      <div style={{ ...S.cabeceraTarjeta, borderRadius: `${B.radioTarjeta}px ${B.radioTarjeta}px 0 0`, display: 'flex', alignItems: 'center', gap: 2 }}>Bloques<Ayuda texto={AYUDA_PLAN.bloque} etiqueta="Bloques"/></div>
      <div style={{ ...S.cuerpo, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div data-bloque="1" style={{ border: `1px solid ${B.borde}`, borderRadius: B.radioBoton, padding: 12, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontWeight: 700, color: B.titulo }}>Bloque 1</div>
          <div>
            <Etiqueta texto="Estrategia" ayuda={AYUDA_PLAN.estrategia}/>
            {tarjetas.length ? <select aria-label="Estrategia" value={estId} onChange={e => { setEstId(e.target.value); setCualVersion('actual') }} style={{ ...campo, maxWidth: '100%' }}>
              {fotoG && String(fotoG.id) === estId && !tarjetas.some(s => String(s.id) === estId) && <option value={estId}>{`${fotoG.name} ${ETIQUETA_BORRADA}`}</option>}
              {tarjetas.map(s => { const sem = esSemanal(s), ps = [ETIQUETA_PRUEBA[estadosLista[s.id]], sem ? 'semanal: llegará más adelante' : null].filter(Boolean)
                return <option key={s.id} value={String(s.id)} disabled={sem}>{`${s.name}${ps.length ? ` (${ps.join(' · ')})` : ''}`}</option> })}
              {/* §50: al final, en gris y sin poder elegirse, cuántas de código hay (no sirven aquí). */}
              {deCodigo > 0 && <option data-codigo={deCodigo} value="" disabled style={{ color: B.apagado }}>{textoCodigo(deCodigo)}</option>}
            </select> : <div style={S.secundario}>No tienes estrategias de tarjetas. Crea una en el paso 1.</div>}
            {tarjetas.length > 0 && !diarias.length && <div style={{ color: AMARILLO, marginTop: 6 }}>Todas tus estrategias de tarjetas son semanales: el paso 3, por ahora, solo con velas diarias.</div>}
          </div>
          <div>
            <Etiqueta texto="Dónde se aplica" ayuda={AYUDA_PLAN.dondeSeAplica}/>
            <Segmentos etiquetaGrupo="Dónde se aplica" valor={enLista ? 'lista' : 'accion'} onCambia={v => cambia('donde', v)} opciones={[['accion', 'Una acción'], ['lista', 'Una lista']]}/>
            {!enLista && <div style={{ marginTop: 10 }}><BuscadorValor valores={valoresLista} valor={a.activo} onCambia={s => cambia('activo', s)} etiqueta="Acción"/></div>}
            {/* §80: el universo y el selector de valores del Backtesting (elementos 13 y 14), tal cual. */}
            {enLista && <div data-lista="valores" className="bp-mc" style={{ marginTop: 10 }}>
              <PanelUniverso mcUniverso={L.universo} mcUniversoDatos={vistaLista.universoDatos} setMcUniverso={ponLista('universo')} setMcUniversoDatos={ponVista('universoDatos')}/>
              <div style={{ display: 'flex', flexDirection: 'column', maxHeight: 330 }}>
                <SelectorValores mcListFilter={vistaLista.lista} mcOnlyFavs={vistaLista.favs} mcSearch={vistaLista.busca} mcSelected={L.simbolos} mcUniverso={L.universo} rankingData={datosLista?.rankingData || {}}
                  setMcListFilter={ponVista('lista')} setMcOnlyFavs={ponVista('favs')} setMcSearch={ponVista('busca')} setMcSelected={ponLista('simbolos')} watchlist={datosLista?.watchlist || []} wlLists={datosLista?.wlLists || []}/>
              </div>
            </div>}
          </div>
          {/* §80: el reparto dentro de la lista (elementos 5–10 y 12) y los filtros (3 y 4), con lo de este bloque. */}
          {enLista && <div>
            <Etiqueta texto="Reparto dentro de la lista" ayuda={AYUDA_PLAN.reparto}/>
            <div data-lista="reparto" className="bp-mc">
              <PanelAsignacion unSoloModo mcStratSelected={[estId]} mcUniverso={L.universo} selectedModos={[L.modo]} setSelectedModos={() => {}} mcMode={L.modo} setMcMode={ponLista('modo')} mcSectionOpen={vistaLista.seccion} setMcSectionOpen={ponVista('seccion')}
                mcAssumedStopPct={L.assumedStopPct} setMcAssumedStopPct={ponLista('assumedStopPct')} mcCalculoPrioridad={L.calculoPrioridad} setMcCalculoPrioridad={ponLista('calculoPrioridad')} mcCriterioUso={L.criterioUso} setMcCriterioUso={ponLista('criterioUso')}
                mcMaxAccumRisk={L.maxAccumRisk} setMcMaxAccumRisk={ponLista('maxAccumRisk')} mcMaxPortfolioPct={L.maxPortfolioPct} setMcMaxPortfolioPct={ponLista('maxPortfolioPct')} mcMaxPosiciones={L.maxPosiciones} setMcMaxPosiciones={ponLista('maxPosiciones')}
                mcMomGateThr={L.momGateThr} setMcMomGateThr={ponLista('momGateThr')} mcMomentumN={L.momentumN} setMcMomentumN={ponLista('momentumN')} mcPrioridad={L.prioridad} setMcPrioridad={ponLista('prioridad')} mcProxGateThr={L.proxGateThr} setMcProxGateThr={ponLista('proxGateThr')}
                mcRiskPerTrade={L.riskPerTrade} setMcRiskPerTrade={ponLista('riskPerTrade')} mcRsGateThr={L.rsGateThr} setMcRsGateThr={ponLista('rsGateThr')} mcRsWindow={L.rsWindow} setMcRsWindow={ponLista('rsWindow')}/>
              <PanelPesos mcMode={L.modo} mcSelected={L.simbolos} mcWeights={L.pesos} setMcWeights={ponLista('pesos')}/>
            </div>
          </div>}
          {enLista && <div>
            <Etiqueta texto="Filtros" ayuda={AYUDA_PLAN.filtros}/>
            {/* §81: sin recortar: el desplegable de «Añadir filtro» sale por debajo de la caja. */}
            <div data-lista="filtros" className="bp-mc" style={{ overflow: 'visible' }}>
              <FiltrosPanel ambito="mercado" titulo="FILTROS DE MERCADO" filtros={mergeFiltros(L.filtros || [])} setFiltros={ponLista('filtros')} open={vistaLista.mercado} setOpen={ponVista('mercado')} variant="mc" botonGrande/>
              <FiltrosPanel ambito="activo" titulo="FILTROS DEL ACTIVO" filtros={mergeFiltros(L.filtros || [])} setFiltros={ponLista('filtros')} open={vistaLista.activo} setOpen={ponVista('activo')} variant="mc" botonGrande/>
            </div>
          </div>}
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <div><Etiqueta texto="Parte de tu dinero" ayuda={AYUDA_PLAN.parte}/><span data-parte style={S.chip('neutro')}>100 %</span></div>
            {!enLista && <div><Etiqueta texto="Modo de asignación" ayuda={AYUDA_PLAN.modo}/><select aria-label="Modo de asignación" disabled style={{ ...campo, color: B.apagado, cursor: 'not-allowed' }}><option>Solo con listas</option></select></div>}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}><button data-boton="anadir-bloque" type="button" disabled style={{ ...S.boton, color: B.apagado, cursor: 'not-allowed' }}>+ Añadir bloque</button><Ayuda texto={AYUDA_PLAN.anadirBloque} etiqueta="Añadir bloque"/></div>
      </div>
    </div>
  )
  const fs = fechasDe(a)
  const dinero = (
    <div data-tarjeta="tu-dinero" style={{ ...S.tarjeta, marginTop: 16, overflow: 'visible' }}>
      <div style={{ ...S.cabeceraTarjeta, borderRadius: `${B.radioTarjeta}px ${B.radioTarjeta}px 0 0` }}>Tu dinero</div>
      <div style={{ ...S.cuerpo, display: 'flex', flexDirection: 'column', gap: 14 }}>
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
        <div>
          <Etiqueta texto="Dinero ocioso" ayuda={AYUDA_PLAN.ocioso}/>
          <Segmentos etiquetaGrupo="Dinero ocioso" valor={otroOcioso ? 'OTRO' : a.ocioso} onCambia={v => { if (v === 'OTRO') setOtroOcioso(true); else { setOtroOcioso(false); cambia('ocioso', v) } }} opciones={[...OCIOSOS_FIJOS, ['OTRO', 'Otro símbolo']]}/>
          {otroOcioso && <div style={{ marginTop: 10 }}><BuscadorValor valores={valoresLista} valor={OCIOSOS_FIJOS.some(([k]) => k === a.ocioso) ? '' : a.ocioso} onCambia={s => cambia('ocioso', s)} etiqueta="Símbolo del ocioso"/></div>}
        </div>
        {/* §91: con una lista, la aportación siempre espera en el ocioso hasta la siguiente compra (no hay una sola operación abierta). */}
        {!enLista && <div>
          <Etiqueta texto="Si llega una aportación con la operación abierta" ayuda={AYUDA_PLAN.dentro}/>
          <Segmentos etiquetaGrupo="Si llega una aportación con la operación abierta" valor={a.aportacionDentro} onCambia={v => cambia('aportacionDentro', v)} opciones={[['espera', 'Espera en el ocioso hasta la siguiente compra'], ['compra', 'Compra más acción']]}/>
        </div>}
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <div><Etiqueta texto="Apalancamiento" ayuda={AYUDA_PLAN.apalancamiento}/><Segmentos etiquetaGrupo="Apalancamiento" valor={a.apalancamiento} onCambia={v => cambia('apalancamiento', v)} opciones={[[1, 'No'], [2, '×2'], [3, '×3']]}/></div>
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
      </div>
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
  const resLista = ajustesDelResultado?.donde === 'lista'
  const cifrasLista = enLista && resLista && !motivoLista ? cifras : null
  const resultado = enLista ? (<>
    <div data-pestanas-der role="group" aria-label="Qué ver del plan" style={{ display: 'flex', borderBottom: `1px solid ${B.borde}` }}>{pestanaDer('dinero', 'Tu dinero')}{pestanaDer('dentro', 'La cartera por dentro', AYUDA_PLAN.porDentro)}</div>
    {vistaDer === 'dinero' && (motivoLista ? <div data-sin-motor-lista style={{ ...S.tarjeta, ...S.cuerpo, color: B.texto }}>{motivoLista}</div>
      : !cifrasLista ? <div data-sin-resultado style={{ ...S.tarjeta, ...S.cuerpo, ...S.secundario }}>{calc.error ? '' : 'Calculando tu plan…'}</div>
      : <>
        {!!calcLista?.ignorado.length && <div data-aviso-lista-simple style={{ color: AMARILLO, display: 'flex', alignItems: 'center', gap: 2 }}>{avisoListaSimple(calcLista.ignorado, a.ocioso)}<Ayuda texto={AYUDA_PLAN.listaSimple} etiqueta="Lo que todavía no cuenta con una lista"/></div>}
        {Number.isFinite(calc.resultado?.respuesta?.finalPorDentro) && oroComparable(calc.resultado?.plan) && <div data-oro style={{ ...S.secundario, fontSize: 13 }}>Comprobación: «La cartera por dentro» acaba en {euros(calc.resultado.respuesta.finalPorDentro, 2)} y tu plan, en {euros(cifrasLista.seis.final, 2)}{Math.abs(calc.resultado.respuesta.finalPorDentro - cifrasLista.seis.final) < 0.005 ? ' ✓' : ' ✕ (deberían coincidir)'}</div>}
        {vistaDinero(cifrasLista, true)}
      </>)}
    <PlanPorDentro a={a} estrategia={estPorDentro} motivo={motivoEstPorDentro} estrategias={estrategias} apiFetch={apiFetch} version={version} visible={vistaDer === 'dentro'} onIrAValor={onIrAValor} wlData={datosLista?.wlData || null} calcula={deps?.calculaPorDentro || null}/>
  </>) : !cifras ? (
    <div data-sin-resultado style={{ ...S.tarjeta, ...S.cuerpo, ...S.secundario }}>{!estrategia ? 'Elige una estrategia de tarjetas de velas diarias.' : calc.calculando || clave ? 'Calculando tu plan…' : 'Sin resultado todavía.'}</div>
  ) : vistaDinero(cifras, false)
  function vistaDinero(cifras, conLista) {
  const s = cifras.seis
  // §90: sin aportaciones (solo el dinero inicial), la TIR es el mismo número que el CAGR: ni su cifra ni su columna.
  const dineroRes = calc.resultado?.plan?.dinero, conTir = !!dineroRes && ((dineroRes.aportaciones?.frecuencia || 'ninguna') !== 'ninguna' || (dineroRes.extraordinarias || []).length > 0)
  return (<>
    <div data-cifras style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
      <Cifra id="aportado" titulo="Has aportado" ayuda={AYUDA_PLAN.aportado} valor={euros(s.aportado, 0)}/>
      <Cifra id="final" color={colorSigno(s.ganancia)} titulo="Tienes al final" ayuda={AYUDA_PLAN.final} valor={euros(s.final, 0)} sub={`ganancia neta ${euros(s.ganancia, 0)}`}/>
      <Cifra id="twr" color={colorSigno(s.twr)} titulo="CAGR del plan" ayuda={AYUDA_PLAN.twr} valor={pct(s.twr)}/>
      {conTir && <Cifra id="tir" color={colorSigno(s.tir)} titulo="Rentabilidad de tu dinero (TIR)" ayuda={AYUDA_PLAN.tir} valor={pct(s.tir)}/>}
      <Cifra id="caida" color={colorSigno(s.caidaPct)} titulo="Peor caída" ayuda={ayudaCaida(s)} valor={pct(s.caidaPct)} sub={`${fechaCorta(s.caidaPctValle)} · ${euros(s.caidaEuros, 0)}`}/>
      {!conLista && <Cifra id="ocioso" titulo="En el ocioso" ayuda={AYUDA_PLAN.enOcioso} valor={<span style={{ whiteSpace: 'nowrap' }}>{pct(cifras.enOcioso, 1)}<span style={{ fontSize: 13, fontWeight: 400, color: B.secundario }}> del tiempo</span></span>}/>}
      {/* §93: con una lista, la parte del dinero en el ocioso, de media. */}
      {conLista && <Cifra id="ocioso" titulo="En el ocioso" ayuda={AYUDA_PLAN.enOciosoLista} valor={<span style={{ whiteSpace: 'nowrap' }}>{pct(cifras.enOcioso, 0)}<span style={{ fontSize: 13, fontWeight: 400, color: B.secundario }}> de tu dinero, de media</span></span>} sub={Number.isFinite(cifras.enOcioso) ? `en valores, el ${pct(1 - cifras.enOcioso, 0)}` : undefined}/>}
      {/* §57: en una línea; el detalle de las órdenes, en su tooltip y en su «?». */}
      <Cifra id="costes" titulo="Impuestos y comisiones" ayuda={`${AYUDA_PLAN.costes} En este plan: ${euros(s.impuestos, 0)} de impuestos y ${euros(s.costes, 0)} de comisiones en ${cifras.ordenes} órdenes.`} valor={<span title={`Impuestos ${euros(s.impuestos, 0)} · Comisiones ${euros(s.costes, 0)} (${cifras.ordenes} órdenes)`} style={{ fontSize: 16, whiteSpace: 'nowrap' }}>
        <span data-impuestos>{euros(s.impuestos, 0)}</span> · <span data-comisiones>{euros(s.costes, 0)}</span></span>}/>
    </div>
    <Tarjeta id="grafico" titulo="Cómo crece tu dinero" ayuda={conLista ? `${AYUDA_PLAN.grafico} ${AYUDA_PLAN.franjaLista}` : `${AYUDA_PLAN.grafico} ${AYUDA_PLAN.franja}`}>
      <GraficoPlan curva={conLista ? { ...cifras.curva, ociosoLiquidez: null, activo: null } : sinOcioso ? { ...cifras.curva, ociosoLiquidez: null } : cifras.curva} activo={conLista ? null : activoRes} finales={finalesDe(cifras)} visibles={lineasVisibles} proporcion={conLista}/>
      <Leyenda curva={conLista ? { ...cifras.curva, ociosoLiquidez: null, activo: null } : sinOcioso ? { ...cifras.curva, ociosoLiquidez: null } : cifras.curva} activo={conLista ? null : activoRes} visibles={lineasVisibles} onMarca={marcaLinea} proporcion={conLista}/>
    </Tarjeta>
    <Tarjeta id="anios" titulo="Año a año" ayuda={AYUDA_PLAN.anios}>
      <div style={{ overflowX: 'auto' }}><table data-tabla="anios" style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead><tr>{(conLista ? ['Año', 'Rentabilidad del plan', 'Peor caída del plan en el año'] : ['Año', 'Rentabilidad del plan', 'Buy&Hold del valor', 'Peor caída del plan en el año', 'Peor caída Buy&Hold', '% del año en el ocioso']).map(h => <th key={h} style={cab}>{h}</th>)}</tr></thead>
        <tbody>{cifras.anios.map(x => conLista ? <tr key={x.anio} data-anio={x.anio}><td style={celda}>{x.anio}</td><td style={{ ...celda, color: colorSigno(x.plan) || B.texto, fontWeight: 700 }}>{pct(x.plan)}</td><td style={{ ...celda, color: colorSigno(x.caidaPlan) || B.texto }}>{pct(x.caidaPlan)}</td></tr>
          : <tr key={x.anio} data-anio={x.anio}><td style={celda}>{x.anio}</td><td style={{ ...celda, color: colorSigno(x.plan) || B.texto, fontWeight: 700 }}>{pct(x.plan)}</td><td style={{ ...celda, color: colorSigno(x.activo) || B.texto }}>{pct(x.activo)}</td><td style={{ ...celda, color: colorSigno(x.caidaPlan) || B.texto }}>{pct(x.caidaPlan)}</td><td style={{ ...celda, color: colorSigno(x.caidaActivo) || B.texto }}>{pct(x.caidaActivo)}</td><td style={celda}>{pct(x.enOcioso, 1)}</td></tr>)}</tbody>
      </table></div>
    </Tarjeta>
    <Tarjeta id="alternativas" titulo={TITULO_ALTERNATIVAS} ayuda={AYUDA_PLAN.alternativas}>
      <div style={{ overflowX: 'auto' }}><table data-tabla="alternativas" style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead><tr>{['', 'Final', 'CAGR', ...(conTir ? ['TIR'] : []), 'Peor caída', 'Impuestos', 'Comisiones'].map(h => <th key={h} style={cab}>{h}</th>)}<th style={cab}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>Órdenes<Ayuda texto={AYUDA_PLAN.ordenes} etiqueta="Órdenes"/></span></th></tr></thead>
        <tbody>{cifras.alternativas.filter(x => !(sinOcioso && x.id === 'OCIOSO_LIQUIDEZ')).map(x => <tr key={x.id} data-fila={x.id} style={x.id === 'PLAN' ? { fontWeight: 700, color: B.titulo } : undefined}>
          <td style={celda}>{x.nombre}</td><td style={{ ...celda, whiteSpace: 'nowrap', color: colorSigno(x.final - s.aportado) }}>{euros(x.final, 0)}</td><td style={{ ...celda, color: colorSigno(x.twr) }}>{pct(x.twr)}</td>{conTir && <td style={{ ...celda, color: colorSigno(x.tir) }}>{pct(x.tir)}</td>}<td style={{ ...celda, color: colorSigno(x.caida) }}>{pct(x.caida)}</td><td style={{ ...celda, whiteSpace: 'nowrap' }}>{euros(x.impuestos, 0)}</td><td style={{ ...celda, whiteSpace: 'nowrap' }}>{euros(x.costes, 0)}</td><td style={celda}>{x.ordenes}</td>
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
  </>)
  }

  return (
    <div ref={pagina} className="bp-pagina" style={{ ...S.pagina, '--bp-arriba': arriba != null ? `${arriba}px` : undefined }} data-pantalla="plan">
      <CabeceraPasos actual={3} estrategia={estBorrada ? `${estrategia?.name} ${ETIQUETA_BORRADA}` : estrategia?.name || null} desactivados={estBorrada ? { 1: AVISO_BORRADA, 2: AVISO_BORRADA } : {}} onVolver={(donde) => pide({ tipo: 'volver', donde })} hechos={{ 1: !!estrategia, 2: !!estado && estado.clave !== 'sinPrueba' }}
        onPaso={(n) => { if (n === 1) pide({ tipo: 'paso1' }); else if (n === 2) pide({ tipo: 'paso2' }) }}/>
      {pestanasPlanes}
      {avisos}
      {errorCalculo}
      {/* §49 y §50: en escritorio (≥ 1000 px), esta página es la que se desplaza (el alto de la ventana menos lo de encima) y la columna
          de ajustes queda fija al bajar, con su propia barra si no cabe (como mucho, el alto visible de la página menos su relleno); en el
          móvil, nada fijo y se desplaza la ventana, como antes. */}
      {/* §90: las piezas del Backtesting en el bloque con lista, con letra más grande y más clara SOLO aquí (el Backtesting no cambia). */}
      {enLista && <style>{[[8, 12], [9, 12], [10, 12], [11, 13], [12, 13]].map(([de, a]) => `[data-lista] [style*="font-size:${de}px"], [data-lista] [style*="font-size: ${de}px"] { font-size: ${a}px !important }`).join(' ') + ' [data-lista] { --text3: #a9c3d6; --text2: #c6dbea }'}</style>}
      <style>{`.bp-avisos { flex-direction: row } @media (max-width: 700px) { .bp-avisos { flex-direction: column; align-items: flex-start !important } }
/* §80: las piezas del Backtesting, en su caja oscura de siempre. */
.bp-mc { background: var(--bg, #080c14); border: 1px solid var(--border, #1a2d45); border-radius: 6px; overflow: hidden; color: var(--text, #e2eaf5) }
@media (min-width: 1000px) { .bp-pagina { box-sizing: border-box; height: calc(100vh - var(--bp-arriba, 56px)); flex: none !important }
  .bp-izq { position: sticky; top: 0; max-height: calc(100vh - var(--bp-arriba, 56px) - 40px); overflow-y: auto; padding-right: 4px } }`}</style>
      {actual ? <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div data-columna="izquierda" className="bp-izq" style={{ flex: '1 1 340px', maxWidth: 520, minWidth: 0 }}>{bloques}{dinero}</div>
        <div data-columna="derecha" style={{ flex: '2 1 480px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {resultado}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginTop: 6 }}>
            <BotonCopiar obtenerTexto={texto} titulo="Copia en texto plano todos los ajustes, el plan y sus cifras"/>
            {!estBorrada && <button data-boton="paso2" style={S.boton} onClick={() => pide({ tipo: 'paso2' })}>Volver al paso 2</button>}
          </div>
        </div>
      </div> : orden && <div data-sin-pestanas style={{ ...S.tarjeta, ...S.cuerpo, ...S.secundario, marginTop: 6 }}>Ningún plan abierto. Pulsa «+ Añadir plan».</div>}
      {pregunta && (
        <Pregunta id="sin-guardar" texto={`Tienes cambios sin guardar en «${nombreDe(actual)}».`} aviso={pregunta.fallo ? falloGuardar : null}
          extra={!fila ? <input type="text" aria-label="Nombre del plan" placeholder="Nombre del plan" maxLength={200} value={nombreNuevo} onChange={e => setNombreNuevo(e.target.value)} style={{ ...campo, width: '100%', boxSizing: 'border-box', marginBottom: 16 }}/> : null}>
          <button data-salida="guardar" disabled={!puedeGuardar || (!fila && !nombreLimpio(nombreNuevo))} onClick={() => responde('guardar')} style={puedeGuardar && (fila || nombreLimpio(nombreNuevo)) ? S.botonVerde : S.botonDesactivado}>{guardando ? 'Guardando…' : 'Guardar'}</button>
          <button data-salida="salir" disabled={guardando} onClick={() => responde('salir')} style={S.boton}>Salir sin guardar</button>
          <button data-salida="cancelar" disabled={guardando} onClick={() => responde('cancelar')} style={S.boton}>Cancelar</button>
        </Pregunta>)}
      {ventana && (
        <Pregunta id="nombre-plan" texto={ventana === 'nuevo' ? 'Guardar este plan' : `Duplicar «${nombreDe(ventana.duplica)}»`} aviso={falloGuardar}
          extra={<input type="text" autoFocus aria-label="Nombre del plan" placeholder="Nombre del plan" maxLength={200} value={nombreNuevo} onChange={e => setNombreNuevo(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') guardaVentana(); if (e.key === 'Escape') limpiaDialogos() }} style={{ ...campo, width: '100%', boxSizing: 'border-box', marginBottom: 16 }}/>}>
          <button data-boton="confirmar-nombre" disabled={guardando || !nombreLimpio(nombreNuevo)} onClick={guardaVentana} style={!guardando && nombreLimpio(nombreNuevo) ? S.botonVerde : S.botonDesactivado}>{guardando ? 'Guardando…' : 'Guardar'}</button>
          <button onClick={limpiaDialogos} style={S.boton}>Cancelar</button>
        </Pregunta>)}
      {borrando && (
        <Pregunta id="borrar-plan" texto={`¿Borrar «${nombreDe(borrando)}»? Se borra de la base y no se puede deshacer.`} detalle="Para quitarlo solo de la vista, usa la ×." aviso={falloGuardar}>
          <button data-boton="si-borrar" disabled={guardando} onClick={borra} style={{ ...S.botonVerde, background: '#f85149', borderColor: '#f85149', color: '#fff' }}>{guardando ? 'Borrando…' : 'Sí, borrar'}</button>
          <button onClick={limpiaDialogos} style={S.boton}>Cancelar</button>
        </Pregunta>)}
    </div>
  )
}
