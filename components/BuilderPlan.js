// components/BuilderPlan.js — el paso 3 del Builder, «Convertirla en plan» (opción A del boceto, versión 2; docs/builder.md, §48). Se
// entra desde el paso 3 de la barra de pasos y desde «Paso 3 · Convertirla en plan» del resultado del paso 2 (siempre activo, también si
// la prueba no pasa). Una estrategia de tarjetas en UNA acción con el dinero de la persona: a la izquierda los bloques y «Tu dinero»; a
// la derecha, el resultado, que se recalcula solo ~600 ms después del último cambio (/api/plan, el motor de lib/planes/ sin tocar; si
// hay un cálculo en marcha, manda el último). Los números y los textos, en lib/builder/planPantalla.js. NORMA de esta pantalla: las
// explicaciones no ocupan sitio fijo; cada término lleva su «?» (components/BuilderAyuda.js) con un ejemplo con números, y los avisos
// van en una línea.
// Parte 2 (§48): arriba, una pestaña por plan guardado (planes_inversion, lib/builder/planesGuardados.js) y los nuevos sin guardar,
// con «+ Añadir plan» (copia los ajustes de ahora) y «Comparar planes» (desactivado). «Guardar este plan» pide el nombre; uno guardado,
// «Guardar cambios», «Guardar como plan nuevo» y «Borrar» (con confirmación). Un plan guardado lleva la foto de su estrategia: si la
// estrategia ha cambiado desde entonces, una línea lo avisa y deja usar la versión guardada (por defecto) o la de ahora.
//   estrategias: las filas de `strategies`; estrategiaId: la abierta. cargaSimbolos: los símbolos de la caché de precios (BuilderPanel).
//   onVolver: a «Mi trabajo»; onPaso1(fila): la estrategia en el paso 1; onPaso2(id): el paso 2 con ella.
//   deps (opcional, para las pruebas): { ctx, calcula(plan) } en lugar de la sesión y de /api/plan. inicial (opcional, para las pruebas
//   de montaje): { ajustes, resultado ({ respuesta, plan }), error, calculando, pruebas, huella, resultadoPrueba, simbolos, planes
//   (las filas guardadas), pestana (la abierta: «g<id>» o «n1»), cambio ({ cambiada, borrada }), pideNombre, borrando }.
import { useState, useEffect, useMemo, useRef } from 'react'
import { B, S } from '../lib/builder/estilo'
import { BarraPasos } from './BuilderPanel'
import Ayuda from './BuilderAyuda'
import BuscadorValor from './BuscadorValor'
import BotonCopiar from './BotonCopiar'
import { marcasLog, separaEtiquetas } from './BuilderCurvas'
import { esDeTarjetas, huellaEstrategia, listarPruebas, leerResultado } from '../lib/pruebaAzar'
import { validaPlan, paraHuellaPlan } from '../lib/planes/plan'
import { jsonCanonico } from '../lib/lotesLab'
import { AVISO_BORRADA, AVISO_CAMBIADA, AYUDA_CAMBIADA, AYUDA_COMPARAR, borrarPlan, cambiarPlan, comparaEstrategia, crearPlan, fotoDelPlan, listarPlanes, nombreLimpio } from '../lib/builder/planesGuardados'
import { getSupaUrl, getSupaH, hayConfigSupabase } from '../lib/supabase'
import { AJUSTES_PLAN, AVISO_A_MANO, AVISO_PRUEBA, AYUDA_PLAN, OCIOSOS_FIJOS, PERIODOS_PLAN, SUBIDA_DEFECTO, ajustesDe, ayudaPrueba, cifrasPlan, creaCalculador, estadoPrueba,
  esSemanal, euros, fechaCorta, fechasDe, fraseCaidas, pct, planDe, puntos, textoParaClaudePlan } from '../lib/builder/planPantalla'

const AMARILLO = '#f2cc60', ROJO = '#ff8b8b', VERDE = '#7ee2a0', AZUL = '#58a6ff', CLARO = '#c9d4df', GRIS = '#8b9bad', GRIS_FRANJA = '#3a4656'
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

// El ancho real del gráfico (como components/BuilderCurvas.js): 1 unidad = 1 píxel, las letras miden siempre 12 px. Sin navegador, 760.
function useAncho(defecto = 760) {
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

// «Cómo crece tu dinero»: tu plan (continua), el mismo plan con el ocioso en liquidez (puntos), comprar y mantener la acción (rayas) y
// lo aportado (escalonado, raya y punto), en escala logarítmica; debajo, la franja dentro de la acción / en el ocioso.
export const LINEAS_PLAN = [
  { k: 'plan', t: 'Tu plan', color: AZUL, ancho: 2.6, rayas: null },
  { k: 'ociosoLiquidez', t: 'Con el ocioso en liquidez', color: AMARILLO, ancho: 2.2, rayas: '0.5 4.5', redondo: true },
  { k: 'activo', t: 'Comprar y mantener', color: CLARO, ancho: 1.6, rayas: '7 5' },
  { k: 'aportado', t: 'Lo aportado', color: GRIS, ancho: 1.4, rayas: '9 3 2 3', escalon: true },
]
function GraficoPlan({ curva, activo }) {
  const [ref, W] = useAncho()
  const IZQ = 76, DER = 150, H1 = 280, ARR = 22, FR = 14, n = curva.fechas.length
  const lineas = LINEAS_PLAN.filter(l => curva[l.k]?.length).map(l => ({ ...l, t: l.k === 'activo' ? `Comprar y mantener ${activo}` : l.t, v: curva[l.k] }))
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
  const resumen = `Cómo crece tu dinero, en escala logarítmica, del ${fechaCorta(curva.fechas[0])} al ${fechaCorta(curva.fechas[n - 1])}: ` + lineas.map(l => `${l.t} termina en ${euros(l.v[l.v.length - 1], 0)}`).join('; ') + '.'
  return (
    <div ref={ref} style={{ width: '100%', marginTop: 6 }}>
      <svg data-grafico="plan" width={W} height={yF + FR + 4} role="img" aria-label={resumen} style={{ display: 'block', fontFamily: B.letra }}>
        <text data-escala="log" x={4} y={12} fontSize={12} fill={B.apagado}>escala logarítmica</text>
        {marcasLog(lo, hi).map((t, k) => <g key={k}><line x1={IZQ} x2={W - DER} y1={y(t)} y2={y(t)} stroke="#1b2430"/><text x={IZQ - 6} y={y(t) + 4} textAnchor="end" fontSize={12} fill={B.apagado}>{euros(t, 0)}</text></g>)}
        {anios.filter((_, k) => k % paso === 0).map(([i, a]) => <text key={a} x={x(i)} y={H1 - 6} fontSize={12} fill={B.apagado}>{a}</text>)}
        {[...lineas].reverse().map(l => <polyline key={l.k} data-linea={l.k} points={ruta(l.v, l.escalon)} fill="none" stroke={l.color} strokeWidth={l.ancho} strokeDasharray={l.rayas || undefined} strokeLinecap={l.redondo ? 'round' : 'butt'}/>)}
        {etq.map(e => <text key={e.t} data-etiqueta={e.t} x={W - DER + 8} y={e.y + 4} fontSize={12} fill={e.color} fontWeight={e.color === AZUL ? 700 : 400}>{e.t}</text>)}
        <g data-franja={tramos.length}>{tramos.map((t, k) => <rect key={k} data-dentro={t.d} x={x(t.i) - (t.i ? ancho1 / 2 : 0)} width={Math.max(0.5, (t.h - t.i) * ancho1 + (t.i ? ancho1 / 2 : 0) + (t.h < n - 1 ? ancho1 / 2 : 0))} y={yF} height={FR} fill={t.d ? AZUL : GRIS_FRANJA}/>)}</g>
      </svg>
    </div>
  )
}
function Leyenda() {
  const muestra = (l) => <svg width="30" height="10" aria-hidden="true"><line x1="1" x2="29" y1="5" y2="5" stroke={l.color} strokeWidth={l.ancho} strokeDasharray={l.rayas || undefined} strokeLinecap={l.redondo ? 'round' : 'butt'}/></svg>
  return (
    <div data-leyenda style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', fontSize: 12, color: B.secundario, marginTop: 6, alignItems: 'center' }}>
      {LINEAS_PLAN.map(l => <span key={l.k} style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>{muestra(l)}{l.t}</span>)}
      <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><span style={{ width: 14, height: 10, background: AZUL, display: 'inline-block' }}/>dentro de la acción</span>
      <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><span style={{ width: 14, height: 10, background: GRIS_FRANJA, display: 'inline-block' }}/>en el ocioso</span>
    </div>
  )
}

function Cifra({ id, titulo, ayuda, valor, sub }) {
  return (
    <div data-cifra={id} style={{ border: `1px solid ${B.borde}`, borderRadius: B.radioBoton, padding: '10px 12px', background: B.fondo, minWidth: 0 }}>
      <div style={{ ...S.secundario, fontSize: 13, display: 'flex', alignItems: 'center', gap: 2 }}>{titulo}<Ayuda texto={ayuda} etiqueta={titulo}/></div>
      <div data-valor style={{ fontSize: 20, fontWeight: 700, color: B.titulo, marginTop: 2, overflowWrap: 'anywhere' }}>{valor}</div>
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

export default function BuilderPlan({ estrategias = [], estrategiaId = null, apiFetch, version = null, cargaSimbolos = null, onVolver, onPaso1, onPaso2, deps = null, inicial = null }) {
  const tarjetas = useMemo(() => estrategias.filter(esDeTarjetas).sort((a, b) => String(a.name).localeCompare(String(b.name), 'es')), [estrategias])
  const diarias = useMemo(() => tarjetas.filter(s => !esSemanal(s)), [tarjetas])
  // Las pestañas: los planes guardados («g<id>») y los nuevos sin guardar («n<k>»). La abierta se edita en a / estId / version; lo de
  // las demás espera en `edic` (si una guardada no tiene nada ahí, se abre como se guardó).
  const [planes, setPlanes] = useState(inicial?.planes || null)
  const [falloPlanes, setFalloPlanes] = useState(null)
  const [nuevas, setNuevas] = useState(() => [{ clave: 'n1', nombre: 'Plan nuevo' }])
  const deFila = (r) => ({ a: ajustesDe(r.plan), estId: String(fotoDelPlan(r.plan)?.id ?? ''), version: 'guardada' })
  const inicio = useMemo(() => {
    const r = inicial?.pestana && (inicial.planes || []).find(p => `g${p.id}` === inicial.pestana)
    if (r) return { clave: inicial.pestana, ...deFila(r) }
    return { clave: 'n1', a: { ...AJUSTES_PLAN, ...(inicial?.ajustes || {}) }, estId: String((diarias.find(s => String(s.id) === String(estrategiaId)) || diarias[0])?.id ?? ''), version: 'actual' }
  }, [])
  const [actual, setActual] = useState(inicio.clave)
  const [estId, setEstId] = useState(inicio.estId)
  const [a, setA] = useState(inicio.a)
  const [cualVersion, setCualVersion] = useState(inicio.version)   // en un plan guardado: 'guardada' (la foto del plan) o 'actual' (la estrategia de ahora)
  const edic = useRef({}), cuentaNuevas = useRef(1)
  const fila = actual.startsWith('g') ? (planes || []).find(p => `g${p.id}` === actual) || null : null
  const fotoG = fila ? fotoDelPlan(fila.plan) : null
  const estrategiaActual = diarias.find(s => String(s.id) === estId) || null
  const usaGuardada = !!fotoG && String(fotoG.id) === estId && (cualVersion === 'guardada' || !estrategiaActual)
  const estrategia = usaGuardada ? fotoG : estrategiaActual
  const cambia = (k, v) => setA(x => ({ ...x, [k]: v }))
  const [otroForzado, setOtroForzado] = useState(false)
  const otroOcioso = otroForzado || !OCIOSOS_FIJOS.some(([k]) => k === a.ocioso)
  const setOtroOcioso = setOtroForzado
  const [cambio, setCambio] = useState(inicial?.cambio || null)   // { cambiada, borrada } del plan guardado abierto
  const [pideNombre, setPideNombre] = useState(inicial?.pideNombre || null)   // null | 'nuevo' | 'comoNuevo'
  const [nombreNuevo, setNombreNuevo] = useState('')
  const [borrando, setBorrando] = useState(!!inicial?.borrando)
  const [guardando, setGuardando] = useState(false)
  const [falloGuardar, setFalloGuardar] = useState(null)
  const [simbolos, setSimbolos] = useState(inicial?.simbolos || ['AAPL', 'GLD', 'QQQ'])
  const [calc, setCalc] = useState({ calculando: !!inicial?.calculando, resultado: inicial?.resultado || null, error: inicial?.error || null })
  const [pruebas, setPruebas] = useState(inicial?.pruebas || null)
  const [huella, setHuella] = useState(inicial?.huella || null)
  const [resPrueba, setResPrueba] = useState(inicial?.resultadoPrueba || null)
  const vivo = useRef(true)
  useEffect(() => { vivo.current = true; return () => { vivo.current = false } }, [])
  const ctx = useMemo(() => deps?.ctx || (hayConfigSupabase() ? { url: getSupaUrl(), headers: getSupaH() } : null), [deps])
  const nombre = estrategia?.name || 'tu estrategia'

  // El plan de los ajustes de ahora; sus errores (los del motor) y, sin errores, la clave que dispara el cálculo.
  const plan = useMemo(() => estrategia ? planDe(a, estrategia) : null, [a, estrategia])
  const errores = useMemo(() => plan ? validaPlan(plan) : [], [plan])
  const clave = plan && !errores.length ? JSON.stringify(plan) : null
  const api = useRef(apiFetch); api.current = apiFetch
  // Un plan ya calculado (p. ej., al volver a una pestaña) se enseña sin repetir el cálculo.
  const hechos = useRef(new Map())
  const calculador = useRef(null)
  if (!calculador.current) {
    const pide = deps?.calcula || (async (p) => {
      const r = await api.current('/api/plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan: p, curvas: true }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
      return j
    })
    calculador.current = creaCalculador({ calcula: async (p) => ({ respuesta: await pide(p), plan: p }),
      alEstado: (e) => {
        if (e.resultado) { hechos.current.set(JSON.stringify(e.resultado.plan), e.resultado); if (hechos.current.size > 20) hechos.current.delete(hechos.current.keys().next().value) }
        if (vivo.current) setCalc(c => ({ calculando: e.calculando, resultado: e.resultado || c.resultado, error: e.resultado ? null : e.error ?? c.error }))
      } })
  }
  useEffect(() => {
    if (!clave) { calculador.current.cancela(); return }
    const ya = hechos.current.get(clave)
    if (ya) { calculador.current.cancela(); setCalc({ calculando: false, resultado: ya, error: null }) } else calculador.current.pide(JSON.parse(clave))
  }, [clave])
  useEffect(() => () => calculador.current?.cancela(), [])

  // Los símbolos de la caché (para la acción y el ocioso) y la prueba del paso 2 de la estrategia (con su huella de ahora).
  useEffect(() => { if (!inicial?.simbolos && cargaSimbolos) cargaSimbolos().then(xs => { if (vivo.current && xs?.length) setSimbolos(xs) }).catch(() => {}) }, [])
  useEffect(() => {
    if (inicial?.pruebas || !ctx || !estId) return
    let v = true
    setPruebas(null); setResPrueba(null)
    listarPruebas(ctx, estId).then(xs => { if (v) setPruebas(xs) }).catch(() => { if (v) setPruebas([]) })
    return () => { v = false }
  }, [estId, ctx])
  useEffect(() => { if (!estrategia || inicial?.huella) return; let v = true; setHuella(null); huellaEstrategia(estrategia).then(h => { if (v) setHuella(h) }); return () => { v = false } }, [estrategia])
  const estado = useMemo(() => estadoPrueba(pruebas, huella), [pruebas, huella])
  useEffect(() => {
    if (inicial?.resultadoPrueba || !ctx || !estado?.fila) return
    let v = true
    leerResultado(ctx, estado.fila.id).then(r => { if (v && r) setResPrueba(r.resultado) }).catch(() => {})
    return () => { v = false }
  }, [estado?.fila?.id])

  // ── Los planes guardados ──
  useEffect(() => {
    if (inicial?.planes || !ctx) return
    listarPlanes(ctx).then(xs => { if (vivo.current) setPlanes(xs) }).catch(e => { if (vivo.current) { setPlanes([]); setFalloPlanes(e.message) } })
  }, [ctx])
  // ¿Ha cambiado la estrategia del plan guardado abierto desde que se guardó?
  useEffect(() => {
    if (inicial?.cambio) return
    setCambio(null)
    if (!fila) return
    let v = true
    comparaEstrategia(fila.plan, estrategias).then(c => { if (v) setCambio(c) }).catch(() => {})
    return () => { v = false }
  }, [fila?.id, fila?.updated_at, estrategias])
  const pestanas = [...(planes || []).map(r => ({ clave: `g${r.id}`, id: r.id, nombre: r.nombre })), ...nuevas]
  const limpiaDialogos = () => { setPideNombre(null); setBorrando(false); setFalloGuardar(null); setNombreNuevo('') }
  // Abre otra pestaña: lo de la de ahora espera en edic; la otra, con lo suyo (o como se guardó).
  const abre = (clave, guardaAhora = true) => {
    if (guardaAhora) edic.current[actual] = { a, estId, version: cualVersion }
    const r = (planes || []).find(p => `g${p.id}` === clave)
    const e = edic.current[clave] || (r ? deFila(r) : clave.startsWith('n') ? { a: { ...AJUSTES_PLAN }, estId: String(diarias[0]?.id ?? ''), version: 'actual' } : null)
    if (!e) return
    setA(e.a); setEstId(e.estId); setCualVersion(e.version); setOtroForzado(false); setActual(clave); limpiaDialogos()
  }
  const anadePlan = () => {
    const k = ++cuentaNuevas.current, clave = `n${k}`
    edic.current[actual] = { a, estId, version: cualVersion }
    edic.current[clave] = { a: { ...a }, estId: String(estrategiaActual?.id ?? estId), version: 'actual' }
    setNuevas(xs => [...xs, { clave, nombre: `Plan nuevo ${k}` }])
    abre(clave, false)
  }
  const hayCambios = !!fila && !!plan && jsonCanonico(paraHuellaPlan(plan)) !== jsonCanonico(paraHuellaPlan(fila.plan))
  const puedeGuardar = !!ctx && !!plan && !errores.length && !guardando
  const guarda = async (como) => {
    if (!puedeGuardar) return
    setGuardando(true); setFalloGuardar(null)
    try {
      if (como === 'cambios') {
        const r = await cambiarPlan(ctx, fila.id, { nombre: fila.nombre, plan })
        setPlanes(xs => xs.map(x => x.id === r.id ? r : x)); setCualVersion('guardada')
        edic.current[`g${r.id}`] = { a, estId, version: 'guardada' }
      } else {
        const n = nombreLimpio(nombreNuevo)
        if (!n) { setFalloGuardar('Escribe un nombre para el plan.'); setGuardando(false); return }
        const r = await crearPlan(ctx, { nombre: n, plan }), g = `g${r.id}`
        edic.current[g] = { a, estId, version: 'guardada' }
        delete edic.current[actual]
        if (!fila) setNuevas(xs => { const ys = xs.filter(x => x.clave !== actual); return ys })
        setPlanes(xs => [...(xs || []), r]); setActual(g); setCualVersion('guardada')
      }
      limpiaDialogos()
    } catch (e) { setFalloGuardar(e.message) }
    setGuardando(false)
  }
  const borra = async () => {
    if (!fila || !ctx || guardando) return
    setGuardando(true); setFalloGuardar(null)
    try {
      await borrarPlan(ctx, fila.id)
      delete edic.current[actual]
      const quedan = (planes || []).filter(x => x.id !== fila.id)
      setPlanes(quedan); limpiaDialogos()
      const otra = quedan[0] ? `g${quedan[0].id}` : nuevas[0]?.clave
      if (otra) abre(otra, false)
      else { edic.current.n1 = { a, estId: String(estrategiaActual?.id ?? estId), version: 'actual' }; setNuevas([{ clave: 'n1', nombre: 'Plan nuevo' }]); abre('n1', false) }
    } catch (e) { setFalloGuardar(e.message) }
    setGuardando(false)
  }

  const valoresLista = useMemo(() => simbolos.map(s => typeof s === 'string' ? { simbolo: s, nombre: '' } : s), [simbolos])
  const cifras = useMemo(() => { try { return calc.resultado ? cifrasPlan(calc.resultado.respuesta, calc.resultado.plan) : null } catch (_) { return null } }, [calc.resultado])
  const ajustesDelResultado = calc.resultado?.plan?.piezas?.[0] || null
  const texto = () => textoParaClaudePlan({ ajustes: a, estrategia, plan, cifras, estado, resultadoPrueba: resPrueba, version, nombre: fila?.nombre || null })

  // ── Avisos (una línea; el detalle, tras «?») ──
  const avisoPrueba = estado && (
    <div data-aviso="prueba" data-estado={estado.clave} style={{ color: estado.clave === 'pasa' ? VERDE : ROJO, fontWeight: estado.clave === 'pasa' ? 400 : 700, display: 'flex', alignItems: 'center', gap: 2 }}>
      {estado.clave === 'pasa' ? '✓ ' : '✕ '}{AVISO_PRUEBA[estado.clave]}<Ayuda texto={ayudaPrueba(estado, resPrueba)} etiqueta="La prueba contra el azar"/>
    </div>
  )
  const avisos = (
    <div data-avisos style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14 }}>
      {estrategia && (avisoPrueba || <div data-aviso="prueba" data-estado="leyendo" style={S.secundario}>Leyendo las pruebas contra el azar de esta estrategia…</div>)}
      <div data-aviso="a-mano" style={{ color: AMARILLO, display: 'flex', alignItems: 'center', gap: 2 }}>⚠ {AVISO_A_MANO}<Ayuda texto={AYUDA_PLAN.aMano} etiqueta={AVISO_A_MANO}/></div>
    </div>
  )

  // ── Pestañas de los planes y guardar ──
  const campoNombre = pideNombre && (
    <span data-pide-nombre={pideNombre} style={{ display: 'inline-flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <input type="text" aria-label="Nombre del plan" placeholder="Nombre del plan" maxLength={200} value={nombreNuevo} autoFocus onChange={e => setNombreNuevo(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') guarda('nuevo'); if (e.key === 'Escape') limpiaDialogos() }} style={{ ...campo, width: 240 }}/>
      <button data-boton="confirmar-nombre" style={puedeGuardar && nombreLimpio(nombreNuevo) ? S.botonVerde : S.botonDesactivado} disabled={!puedeGuardar || !nombreLimpio(nombreNuevo)} onClick={() => guarda('nuevo')}>{guardando ? 'Guardando…' : 'Guardar'}</button>
      <button style={S.boton} onClick={limpiaDialogos}>Cancelar</button>
    </span>
  )
  const barraGuardar = borrando && fila ? (
    <span data-confirma-borrar style={{ display: 'inline-flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <span style={{ color: ROJO }}>{`¿Borrar «${fila.nombre}»? No se puede deshacer.`}</span>
      <button data-boton="si-borrar" style={{ ...S.boton, borderColor: '#8b3a42', background: '#3b1d22', color: ROJO }} disabled={guardando} onClick={borra}>{guardando ? 'Borrando…' : 'Sí, borrar'}</button>
      <button style={S.boton} onClick={limpiaDialogos}>Cancelar</button>
    </span>
  ) : campoNombre || (fila ? (
    <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <button data-boton="guardar-cambios" style={puedeGuardar && hayCambios ? S.botonVerde : S.botonDesactivado} disabled={!puedeGuardar || !hayCambios} title={hayCambios ? undefined : 'No hay cambios desde que lo guardaste'} onClick={() => guarda('cambios')}>{guardando ? 'Guardando…' : 'Guardar cambios'}</button>
      <button data-boton="guardar-como" style={S.boton} disabled={!puedeGuardar} onClick={() => { limpiaDialogos(); setNombreNuevo(`${fila.nombre} (copia)`); setPideNombre('comoNuevo') }}>Guardar como plan nuevo</button>
      <button data-boton="borrar" style={{ ...S.boton, color: ROJO }} disabled={!ctx || guardando} onClick={() => { limpiaDialogos(); setBorrando(true) }}>Borrar</button>
      {!hayCambios && <span data-sin-cambios style={S.apagado}>Guardado el {fechaCorta(fila.updated_at)}</span>}
    </span>
  ) : <button data-boton="guardar" style={puedeGuardar ? S.botonVerde : S.botonDesactivado} disabled={!puedeGuardar} onClick={() => { limpiaDialogos(); setPideNombre('nuevo') }}>Guardar este plan</button>)
  const pestanasPlanes = (
    <div data-planes style={{ marginBottom: 12 }}>
      <div role="tablist" aria-label="Tus planes" style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
        {pestanas.map(p => <button key={p.clave} role="tab" data-pestana={p.clave} aria-selected={p.clave === actual} onClick={() => p.clave !== actual && abre(p.clave)}
          style={{ ...S.boton, padding: '6px 12px', fontSize: 13, ...(p.clave === actual ? { background: B.cabecera, borderColor: B.siguienteBorde, color: B.titulo, fontWeight: 700 } : { background: 'transparent', color: B.secundario }) }}>{p.id == null ? `${p.nombre} · sin guardar` : p.nombre}</button>)}
        <button data-boton="anadir-plan" style={{ ...S.enlace, fontSize: 13, marginLeft: 6 }} onClick={anadePlan} title="Un plan nuevo, sin guardar, con los ajustes de ahora">+ Añadir plan</button>
        <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 2 }}><button data-boton="comparar" disabled style={{ ...S.boton, padding: '6px 12px', fontSize: 13, color: B.apagado, cursor: 'not-allowed' }}>Comparar planes</button><Ayuda texto={AYUDA_COMPARAR} etiqueta="Comparar planes"/></span>
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginTop: 10 }}>
        {barraGuardar}
        {!ctx && <span style={{ color: AMARILLO }}>Sin conexión con la base de datos: no se pueden guardar planes.</span>}
        {planes == null && ctx && <span style={S.apagado}>Leyendo tus planes…</span>}
      </div>
      {falloPlanes && <div data-fallo-planes style={{ color: ROJO, marginTop: 6 }}>✕ {falloPlanes}</div>}
      {falloGuardar && <div data-fallo-guardar style={{ color: ROJO, marginTop: 6 }}>✕ {falloGuardar}</div>}
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
  const bloques = (
    <div data-tarjeta="bloques" style={{ ...S.tarjeta, overflow: 'visible' }}>
      <div style={{ ...S.cabeceraTarjeta, borderRadius: `${B.radioTarjeta}px ${B.radioTarjeta}px 0 0`, display: 'flex', alignItems: 'center', gap: 2 }}>Bloques<Ayuda texto={AYUDA_PLAN.bloque} etiqueta="Bloques"/></div>
      <div style={{ ...S.cuerpo, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div data-bloque="1" style={{ border: `1px solid ${B.borde}`, borderRadius: B.radioBoton, padding: 12, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontWeight: 700, color: B.titulo }}>Bloque 1</div>
          <div>
            <Etiqueta texto="Estrategia" ayuda={AYUDA_PLAN.estrategia}/>
            {tarjetas.length ? <select aria-label="Estrategia" value={estId} onChange={e => { setEstId(e.target.value); setCualVersion('actual') }} style={{ ...campo, maxWidth: '100%' }}>
              {fotoG && String(fotoG.id) === estId && !tarjetas.some(s => String(s.id) === estId) && <option value={estId}>{`${fotoG.name} (versión guardada)`}</option>}
              {tarjetas.map(s => { const sem = esSemanal(s); return <option key={s.id} value={String(s.id)} disabled={sem}>{`${s.name}${sem ? ' (semanal: llegará más adelante)' : ''}`}</option> })}
            </select> : <div style={S.secundario}>No tienes estrategias de tarjetas. Crea una en el paso 1.</div>}
            {tarjetas.length > 0 && !diarias.length && <div style={{ color: AMARILLO, marginTop: 6 }}>Todas tus estrategias de tarjetas son semanales: el paso 3, por ahora, solo con velas diarias.</div>}
          </div>
          <div>
            <Etiqueta texto="Dónde se aplica" ayuda={AYUDA_PLAN.dondeSeAplica}/>
            <Segmentos etiquetaGrupo="Dónde se aplica" valor="accion" onCambia={() => {}} opciones={[['accion', 'Una acción'], ['lista', 'Una lista', 'Llegará cuando los pasos 1 y 2 admitan listas']]}/>
            <div style={{ marginTop: 10 }}><BuscadorValor valores={valoresLista} valor={a.activo} onCambia={s => cambia('activo', s)} etiqueta="Acción"/></div>
          </div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <div><Etiqueta texto="Parte de tu dinero" ayuda={AYUDA_PLAN.parte}/><span data-parte style={S.chip('neutro')}>100 %</span></div>
            <div><Etiqueta texto="Modo de asignación" ayuda={AYUDA_PLAN.modo}/><select aria-label="Modo de asignación" disabled style={{ ...campo, color: B.apagado, cursor: 'not-allowed' }}><option>Solo con listas</option></select></div>
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
          <div><Etiqueta texto="Dinero inicial" ayuda={AYUDA_PLAN.capital}/><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><input type="number" min="0" step="100" aria-label="Dinero inicial" value={a.capital} onChange={e => cambia('capital', e.target.value === '' ? '' : Number(e.target.value))} style={{ ...campo, width: 120 }}/> €</span></div>
          <div><Etiqueta texto="Aportación mensual" ayuda={AYUDA_PLAN.aportacion}/><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><input type="number" min="0" step="10" aria-label="Aportación mensual" value={a.aportacion} onChange={e => cambia('aportacion', e.target.value === '' ? '' : Number(e.target.value))} style={{ ...campo, width: 100 }}/> €</span></div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <Segmentos etiquetaGrupo="Cómo es la aportación" valor={a.sube ? 'sube' : 'fija'} onCambia={v => setA(x => ({ ...x, sube: v === 'sube', subePct: v === 'sube' && !(Number(x.subePct) > 0) ? SUBIDA_DEFECTO : x.subePct }))} opciones={[['fija', 'Fija'], ['sube', 'Sube cada año']]}/>
          {a.sube && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><input type="number" step="0.5" aria-label="Cuánto sube cada año" value={a.subePct} onChange={e => cambia('subePct', e.target.value === '' ? '' : Number(e.target.value))} style={{ ...campo, width: 70 }}/> % al año</span>}
        </div>
        <div>
          <Etiqueta texto="Dinero ocioso" ayuda={AYUDA_PLAN.ocioso}/>
          <Segmentos etiquetaGrupo="Dinero ocioso" valor={otroOcioso ? 'OTRO' : a.ocioso} onCambia={v => { if (v === 'OTRO') setOtroOcioso(true); else { setOtroOcioso(false); cambia('ocioso', v) } }} opciones={[...OCIOSOS_FIJOS, ['OTRO', 'Otro símbolo']]}/>
          {otroOcioso && <div style={{ marginTop: 10 }}><BuscadorValor valores={valoresLista} valor={OCIOSOS_FIJOS.some(([k]) => k === a.ocioso) ? '' : a.ocioso} onCambia={s => cambia('ocioso', s)} etiqueta="Símbolo del ocioso"/></div>}
        </div>
        <div>
          <Etiqueta texto="Si llega una aportación con la operación abierta" ayuda={AYUDA_PLAN.dentro}/>
          <Segmentos etiquetaGrupo="Si llega una aportación con la operación abierta" valor={a.aportacionDentro} onCambia={v => cambia('aportacionDentro', v)} opciones={[['espera', 'Espera en el ocioso hasta la siguiente compra'], ['compra', 'Compra más acción']]}/>
        </div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <div><Etiqueta texto="Apalancamiento" ayuda={AYUDA_PLAN.apalancamiento}/><Segmentos etiquetaGrupo="Apalancamiento" valor={a.apalancamiento} onCambia={v => cambia('apalancamiento', v)} opciones={[[1, 'No'], [2, '×2'], [3, '×3']]}/></div>
          <div><Etiqueta texto="Impuestos" ayuda={AYUDA_PLAN.impuestos}/><Segmentos etiquetaGrupo="Impuestos" valor={a.impuestos} onCambia={v => cambia('impuestos', v)} opciones={[['ES-ahorro', 'España · base del ahorro'], ['ninguno', 'Sin impuestos']]}/></div>
        </div>
        <div><Etiqueta texto="Comisión por operación" ayuda={AYUDA_PLAN.comision}/><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><input type="number" min="0" step="0.01" aria-label="Comisión por operación" value={a.comision} onChange={e => cambia('comision', e.target.value === '' ? '' : Number(e.target.value))} style={{ ...campo, width: 80 }}/> %</span></div>
      </div>
    </div>
  )

  // ── Columna derecha ──
  const s = cifras?.seis, activoRes = ajustesDelResultado?.activo || a.activo, ociosoRes = ajustesDelResultado?.ocioso || a.ocioso
  const estadoCalculo = (
    <div data-estado-calculo style={{ display: 'flex', flexDirection: 'column', gap: 4, minHeight: 20 }}>
      {calc.calculando && <div data-calculando style={{ color: AMARILLO }}>Calculando…</div>}
      {!!errores.length && <div data-errores-plan style={{ color: ROJO }}>✕ {errores.join(' ')}</div>}
      {calc.error && !errores.length && <div data-error-plan style={{ color: ROJO }}>✕ No se pudo calcular: {calc.error}</div>}
    </div>
  )
  const resultado = !cifras ? (
    <div data-sin-resultado style={{ ...S.tarjeta, ...S.cuerpo, ...S.secundario }}>{!estrategia ? 'Elige una estrategia de tarjetas de velas diarias.' : calc.calculando || clave ? 'Calculando tu plan…' : 'Sin resultado todavía.'}</div>
  ) : (<>
    <div data-cifras style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: 10 }}>
      <Cifra id="aportado" titulo="Has aportado" ayuda={AYUDA_PLAN.aportado} valor={euros(s.aportado)}/>
      <Cifra id="final" titulo="Tienes al final" ayuda={AYUDA_PLAN.final} valor={euros(s.final)} sub={`ganancia neta ${euros(s.ganancia)}`}/>
      <Cifra id="caida" titulo="Peor caída" ayuda={AYUDA_PLAN.caida} valor={pct(s.caidaPct)} sub={`valle el ${fechaCorta(s.caidaPctValle)} · en €: ${euros(s.caidaEuros)} (valle el ${fechaCorta(s.caidaEurosValle)})`}/>
      <Cifra id="twr" titulo="CAGR de la estrategia" ayuda={AYUDA_PLAN.twr} valor={pct(s.twr)}/>
      <Cifra id="tir" titulo="Rentabilidad de tu dinero (TIR)" ayuda={AYUDA_PLAN.tir} valor={pct(s.tir)}/>
      <Cifra id="costes" titulo="Impuestos y comisiones" ayuda={AYUDA_PLAN.costes} valor={`${euros(s.impuestos)} · ${euros(s.costes)}`} sub={`impuestos · comisiones (${cifras.ordenes ?? '—'} órdenes)`}/>
    </div>
    <Tarjeta id="grafico" titulo="Cómo crece tu dinero" ayuda={`${AYUDA_PLAN.grafico} ${AYUDA_PLAN.franja}`}>
      <GraficoPlan curva={cifras.curva} activo={activoRes}/>
      <Leyenda/>
    </Tarjeta>
    <Tarjeta id="alternativas" titulo="Tu plan frente a las alternativas" ayuda={AYUDA_PLAN.alternativas}>
      <div style={{ overflowX: 'auto' }}><table data-tabla="alternativas" style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead><tr>{['', 'Final', 'CAGR de la estrategia', 'TIR', 'Peor caída', 'Impuestos y comisiones'].map(h => <th key={h} style={cab}>{h}</th>)}</tr></thead>
        <tbody>{cifras.alternativas.map(x => <tr key={x.id} data-fila={x.id} style={x.id === 'PLAN' ? { fontWeight: 700, color: B.titulo } : undefined}>
          <td style={celda}>{x.nombre}</td><td style={{ ...celda, whiteSpace: 'nowrap' }}>{euros(x.final, 0)}</td><td style={celda}>{pct(x.twr)}</td><td style={celda}>{pct(x.tir)}</td><td style={celda}>{pct(x.caida)}</td><td style={{ ...celda, whiteSpace: 'nowrap' }}>{euros(x.impuestos, 0)} · {euros(x.costes, 0)}</td>
        </tr>)}</tbody>
      </table></div>
    </Tarjeta>
    <Tarjeta id="tramos" titulo="¿Es estable? Por tramos" ayuda={AYUDA_PLAN.tramos}>
      <div style={{ overflowX: 'auto' }}><table data-tabla="tramos" style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead><tr>{['Tramo', 'CAGR de tu plan', 'El ocioso añadió'].map(h => <th key={h} style={cab}>{h}</th>)}</tr></thead>
        <tbody>{cifras.tramos.map(t => <tr key={t.nombre} data-tramo={t.nombre}><td style={celda}>{t.nombre}</td><td style={celda}>{pct(t.cagr)}</td><td style={celda}>{t.ocioso == null ? '—' : puntos(t.ocioso)}</td></tr>)}</tbody>
      </table></div>
    </Tarjeta>
    <Tarjeta id="caidas" titulo="Cuando tu estrategia cae, ¿qué hace el ocioso?" ayuda={AYUDA_PLAN.caidas}>
      <div data-frase-caidas style={{ marginBottom: 8, color: B.texto }}>{fraseCaidas(cifras, ociosoRes)}</div>
      {cifras.caidas.length > 0 && <div style={{ overflowX: 'auto' }}><table data-tabla="caidas" style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead><tr>{['Desde (pico)', 'Hasta (valle)', 'Tu estrategia', `El ocioso (${ociosoRes === 'LIQUIDEZ' ? 'liquidez' : ociosoRes})`, 'Recupera el pico'].map(h => <th key={h} style={cab}>{h}</th>)}</tr></thead>
        <tbody>{cifras.caidas.map(c => <tr key={c.pico} data-caida={c.pico}><td style={celda}>{fechaCorta(c.pico)}</td><td style={celda}>{fechaCorta(c.valle)}</td><td style={{ ...celda, color: ROJO }}>{pct(c.caida)}</td>
          <td style={{ ...celda, color: c.ocioso > 0 ? VERDE : c.ocioso < 0 ? ROJO : B.texto }}>{c.ocioso > 0 ? '+' : ''}{pct(c.ocioso)}</td><td style={celda}>{c.recuperacion ? fechaCorta(c.recuperacion) : 'todavía no'}</td></tr>)}</tbody>
      </table></div>}
    </Tarjeta>
  </>)

  return (
    <div style={S.pagina} data-pantalla="plan">
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <button style={{ ...S.enlace, color: B.secundario }} onClick={() => onVolver?.()}>← Builder · Mi trabajo</button>
        <span style={{ fontSize: 22, fontWeight: 700, color: B.titulo }}>Builder</span>
      </div>
      <BarraPasos actual={3} onPaso={(n) => { if (n === 1) onPaso1?.(estrategiaActual); else if (n === 2) onPaso2?.(estrategia?.id ?? null) }}/>
      <div style={{ fontSize: 20, fontWeight: 700, color: B.titulo, marginTop: 8 }}>Convierte «{nombre}» en un plan</div>
      <div style={{ ...S.secundario, marginTop: 4, marginBottom: 10 }}>Tu estrategia con tu dinero: aportaciones, dinero ocioso, comisiones e impuestos.</div>
      {pestanasPlanes}
      {avisos}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div data-columna="izquierda" style={{ flex: '1 1 340px', minWidth: 0 }}>{bloques}{dinero}</div>
        <div data-columna="derecha" style={{ flex: '2 1 480px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {estadoCalculo}
          {resultado}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginTop: 6 }}>
            <BotonCopiar obtenerTexto={texto} titulo="Copia en texto plano todos los ajustes, el plan y sus cifras"/>
            <button data-boton="paso2" style={S.boton} onClick={() => onPaso2?.(estrategia?.id ?? null)}>Volver al paso 2</button>
          </div>
        </div>
      </div>
    </div>
  )
}
