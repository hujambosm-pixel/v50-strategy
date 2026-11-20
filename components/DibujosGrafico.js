// components/DibujosGrafico.js — DIBUJAR SOBRE EL GRÁFICO de un valor (docs/builder.md §208; boceto bocetos/dibujar-graficos.html, opción A).
// Lo monta CandleChart solo con la prop `dibujar` (sin ella, el gráfico queda exactamente como estaba). Dos piezas:
//   · la BARRA LATERAL (herramientas, imán, deshacer, borrar todo, «?»): va por un portal al hueco que CandleChart deja a la izquierda;
//   · la CAPA: un SVG encima de las velas, con los dibujos, sus asas y la barrita del dibujo elegido.
// Todo el estado vive aquí y no en CandleChart: mover el ratón o desplazar el gráfico redibuja SOLO esta capa (CandleChart rehace su
// gráfico entero al cambiar sus props: no se le puede tocar el estado a cada paso).
// Los puntos se guardan por FECHA y PRECIO (lib/dibujos/geometria.js): el mismo dibujo vale en diario y en semanal.
// PARTE 4 (§209): se GUARDAN en la base por valor (lib/dibujos/guardados.js, tabla dibujos_grafico): se leen al abrir el valor y se
// guardan un momento después de cada cambio (al soltar, no a cada paso de un arrastre). La MEMORIA de abajo hace de copia: el gráfico
// normal y el de pantalla completa son dos instancias y se avisan entre sí, así que lo dibujado en una sale en la otra.
//
// CÓMO SE COGE EL RATÓN SIN ROMPER EL GRÁFICO. Con una herramienta elegida, un oyente en fase de CAPTURA sobre el contenedor del gráfico
// se queda los clics (lightweight-charts no los ve: ni arrastra, ni pone la alarma del doble clic, ni la regla 📏), pero deja pasar el
// movimiento (su cruz sigue) y la rueda (se puede acercar mientras se dibuja). Con el cursor, los dibujos tienen una franja invisible de
// 10 px que recoge el clic para elegirlos y moverlos; fuera de ella, el gráfico funciona como siempre.
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { escala, fechaDeIndice, indiceDeFecha, iman, PUNTOS_DE } from '../lib/dibujos/geometria'
import { HERRAMIENTAS, ATAJOS, COLORES, TAMANOS_TEXTO, necesita, colocaPosicion, formasMedir, formas, provisional, creaDibujo, mueve, mueveAsa, duplica, colorDe, grosorDe, tamDe, pasoFlecha, estiloRecordado } from '../lib/dibujos/pantalla'
import Ayuda from './BuilderAyuda'
import { leerDibujos, guardarDibujos, simboloDe } from '../lib/dibujos/guardados'
import { hayConfigSupabase, ctxConSesion } from '../lib/supabase'

const MEMORIA = new Map()   // valor → sus dibujos (copia de lo de la base)
const LEIDOS = new Set()    // valores ya leídos de la base en esta visita
const OYENTES = new Set()   // instancias montadas: (clave, dibujos, quien) → se ponen al día
const avisa = (clave, dibujos, quien) => { for (const f of OYENTES) f(clave, dibujos, quien) }
const ESPERA_GUARDAR = 800
// Lo último elegido de cada tipo de dibujo (color, grosor, tamaño de letra), en el navegador (§210).
const CLAVE_ESTILO = 'dibujos.estilo'
const CLAVE_SEGUIR = 'dibujos.seguir'   // 🔒 «seguir dibujando»: la herramienta no vuelve al cursor tras cada dibujo
const leeSeguir = () => { try { return localStorage.getItem(CLAVE_SEGUIR) === '1' } catch (_) { return false } }
const leeEstilos = () => { try { const j = JSON.parse(localStorage.getItem(CLAVE_ESTILO) || '{}'); return j && typeof j === 'object' ? j : {} } catch (_) { return {} } }
const recuerdaEstilo = (tipo, cambios) => { try { const m = leeEstilos(); m[tipo] = { ...(m[tipo] || {}), ...cambios }; localStorage.setItem(CLAVE_ESTILO, JSON.stringify(m)) } catch (_) {} }
const estiloDe = (tipo) => estiloRecordado(leeEstilos(), tipo)
// La 🎯 (§210): no es un dibujo; un clic en el gráfico abre la ventana de alarma de precio con ese precio.
const HERR_ALERTA = { id: 'alerta', nombre: 'Alerta de precio', atajo: '', ayuda: 'un clic en el precio (con Ctrl, pegado a la apertura, máximo, mínimo o cierre de la vela) y se abre la ventana de la alarma' }
const MAX_HISTORIAL = 60
const MONO = "'JetBrains Mono', monospace"

const IC = {
  cursor: <><path d="M5 3 L5 16 L8.3 12.8 L10.6 17.3 L12.6 16.3 L10.3 11.9 L14.8 11.9 Z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/></>,
  tendencia: <><line x1="4" y1="16" x2="16" y2="4" stroke="currentColor" strokeWidth="1.6"/><circle cx="4" cy="16" r="2" fill="currentColor"/><circle cx="16" cy="4" r="2" fill="currentColor"/></>,
  rayo: <><line x1="4" y1="15" x2="18" y2="5" stroke="currentColor" strokeWidth="1.6"/><circle cx="4" cy="15" r="2" fill="currentColor"/><path d="M14 4.2 L18 5 L16.2 8.6" fill="none" stroke="currentColor" strokeWidth="1.4"/></>,
  horizontal: <><line x1="2" y1="10" x2="18" y2="10" stroke="currentColor" strokeWidth="1.6"/><circle cx="10" cy="10" r="2.2" fill="currentColor"/></>,
  vertical: <><line x1="10" y1="2" x2="10" y2="18" stroke="currentColor" strokeWidth="1.6"/><circle cx="10" cy="10" r="2.2" fill="currentColor"/></>,
  canal: <><line x1="3" y1="12" x2="15" y2="3" stroke="currentColor" strokeWidth="1.5"/><line x1="5" y1="17" x2="17" y2="8" stroke="currentColor" strokeWidth="1.5"/><line x1="4" y1="14.5" x2="16" y2="5.5" stroke="currentColor" strokeWidth="1" strokeDasharray="2 2"/></>,
  fibonacci: <><g stroke="currentColor" strokeWidth="1.3"><line x1="3" y1="4" x2="17" y2="4"/><line x1="3" y1="8" x2="17" y2="8"/><line x1="3" y1="11" x2="17" y2="11"/><line x1="3" y1="16" x2="17" y2="16"/><line x1="4" y1="16" x2="16" y2="4" strokeDasharray="2 2"/></g></>,
  rectangulo: <><rect x="3" y="5" width="14" height="10" fill="currentColor" fillOpacity=".18" stroke="currentColor" strokeWidth="1.5"/></>,
  texto: <><path d="M4 5 H16 M10 5 V16 M7.5 16 H12.5" stroke="currentColor" strokeWidth="1.7" fill="none"/></>,
  iman: <><g fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M5 3 V10 A5 5 0 0 0 15 10 V3"/><path d="M5 6 H8 M12 6 H15" strokeWidth="2.4"/><path d="M8 3 V10 A2 2 0 0 0 12 10 V3"/></g></>,
  deshacer: <><g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M6 4 L3 7.5 L6 11"/><path d="M3 7.5 H12 A4.5 4.5 0 0 1 12 16.5 H8"/></g></>,
  papelera: <><path d="M3.5 5.5 H16.5 M8 5.5 V3.5 H12 V5.5 M5 5.5 L6 17 H14 L15 5.5 M8.5 8.5 V14 M11.5 8.5 V14" fill="none" stroke="currentColor" strokeWidth="1.5"/></>,
  larga: <><rect x="3" y="3" width="14" height="7" fill="#26a69a" fillOpacity=".55"/><rect x="3" y="10" width="14" height="5" fill="#ef5350" fillOpacity=".55"/><line x1="3" y1="10" x2="17" y2="10" stroke="currentColor" strokeWidth="1.3"/></>,
  corta: <><rect x="3" y="5" width="14" height="5" fill="#ef5350" fillOpacity=".55"/><rect x="3" y="10" width="14" height="7" fill="#26a69a" fillOpacity=".55"/><line x1="3" y1="10" x2="17" y2="10" stroke="currentColor" strokeWidth="1.3"/></>,
  medir: <><g fill="none" stroke="currentColor" strokeWidth="1.3"><path d="M2.5 13.5 L13.5 2.5 L17.5 6.5 L6.5 17.5 Z"/><path d="M6 10 L8 12 M8.5 7.5 L10 9 M11 5 L13 7"/></g></>,
  candado: <><g fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="4.5" y="9" width="11" height="8" rx="1.5"/><path d="M7 9 V6.5 A3 3 0 0 1 13 6.5 V9"/></g></>,
  alerta: <><g fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="10" cy="10" r="7.5"/><circle cx="10" cy="10" r="4.2"/></g><circle cx="10" cy="10" r="1.6" fill="currentColor"/></>,
  duplicar: <><g fill="none" stroke="currentColor" strokeWidth="1.4"><rect x="7" y="7" width="9" height="10" rx="1"/><path d="M4 13 V4 A1 1 0 0 1 5 3 H12"/></g></>,
}
const Icono = ({ n }) => <svg viewBox="0 0 20 20" width="18" height="18" style={{ display: 'block' }}>{IC[n]}</svg>

const AYUDA = 'Herramientas para dibujar encima de las velas, como en TradingView.\n\n'
  + '• Elige una herramienta en esta barra (o con su atajo: Alt+T línea, Alt+A línea que se alarga, Alt+H horizontal, Alt+V vertical, Alt+C canal, Alt+F Fibonacci, Alt+R rectángulo, Alt+X texto) y haz clic en el gráfico. Las de dos puntos también se ponen arrastrando.\n'
  + '• Con el cursor: pulsa un dibujo para elegirlo, arrástralo para moverlo o tira de sus puntos. Arriba sale su barrita: color, grosor, duplicar y papelera. Supr lo borra.\n'
  + '• Imán: mientras mantienes pulsado Ctrl (o con el botón encendido), cada punto se pega a la apertura, máximo, mínimo o cierre más cercano de su vela.\n'
  + '• Con un dibujo elegido, las flechas del teclado lo mueven: ← → una vela, ↑ ↓ un poco de precio (con Mayús, 10 veces más).\n'
  + '• Cada tipo de dibujo recuerda el último color, grosor y tamaño de letra que elegiste.\n'
  + '• 🎯 Alerta de precio: un clic en el gráfico abre la ventana de la alarma con ese precio (con Ctrl, pegado a la vela).\n'
  + '• Posición larga / corta: clic en la entrada y clic en el stop; el objetivo sale a 2 R (el doble de lo que arriesgas por acción) y se arrastra. Con «Arriesgo» en € te dice cuántas acciones: entrada 182,40 y stop 178,00 → 4,40 por acción; arriesgando 100 €, 100 ÷ 4,40 = 22,7 → 22 acciones (4.012,80 €, arriesgas 96,80 €). Dice también si después tocó antes el stop o el objetivo.\n'
  + '• Medir: clic en dos puntos (o Mayús + arrastrar con el cursor): cuánto sube o baja, en % y en velas. No se guarda.\n'
  + '• 🔒 Seguir dibujando: la herramienta sigue elegida después de cada dibujo, para poner varias seguidas.\n'
  + '• Ctrl+Z deshace; Esc cancela lo que estés dibujando.\n'
  + '• Ejemplo de Fibonacci: de un mínimo en 100 a un máximo en 150, el nivel 0,618 queda en 150 − 50 × 0,618 = 119,10.\n\n'
  + 'Los dibujos se guardan solos con cada valor (un momento después de cada cambio) y valen igual en velas diarias y semanales: cada punto va por su fecha y su precio.'

export default function DibujosGrafico({ chartRef, seriesRef, containerRef, wrapRef, barraRef, data, simbolo, ctx: ctxProp = undefined, arriba = 0, onAlerta = null, arriesgoDefecto = null }) {
  // arriesgoDefecto: € que se arriesgan por operación según el perfil de riesgo (lo pone pages/index.js); la posición nueva sale con él
  // (o con el último que se escribió en una posición).
  // arriba: px que tapa una barra de la página puesta encima del gráfico (la de Watchlist mide 30): la barra lateral y la barrita bajan eso.
  // onAlerta(precio, ultimoCierre): con él sale la 🎯 en la barra lateral.
  const clave = simboloDe(simbolo)
  const ctx = useMemo(() => ctxProp !== undefined ? ctxProp : (hayConfigSupabase() ? ctxConSesion() : null), [ctxProp])
  const [aviso, setAviso] = useState(null)   // error al leer o guardar
  const [dibujos, setDibujosSt] = useState(() => MEMORIA.get(clave) || [])
  const [herr, setHerr] = useState('cursor')
  const [imanFijo, setImanFijo] = useState(false)
  const [pend, setPend] = useState([])
  const [cursor, setCursor] = useState(null)
  const [elegido, setElegido] = useState(null)
  const [texto, setTexto] = useState(null)   // { id (null = nuevo), fecha, precio, valor }
  const [slot, setSlot] = useState(null)
  const [medida, setMedida] = useState(null)   // { a, b } de «Medir»: se ve hasta el siguiente clic o Esc
  const [seguir, setSeguir] = useState(false)
  useEffect(() => { setSeguir(leeSeguir()) }, [])
  const [, setTick] = useState(0)
  const hist = useRef([])
  const claveRef = useRef(clave)
  const S = useRef({})
  const yo = useRef({}).current
  const guardado = useRef({ timer: null, clave: null, lista: null })
  const clip = useMemo(() => 'dib' + Math.random().toString(36).slice(2, 9), [])
  const esc = useMemo(() => escala((data || []).map(d => d.date)), [data])

  useEffect(() => { setSlot(barraRef?.current || null) }, [barraRef])
  // ── Guardar en la base: un momento después del último cambio (o ya, al cambiar de valor o cerrar el gráfico) ──
  const guardaYa = () => {
    const g = guardado.current
    clearTimeout(g.timer); g.timer = null
    if (!g.clave || !ctx) { g.clave = null; return }
    const c = g.clave, l = g.lista; g.clave = null; g.lista = null
    guardarDibujos(ctx, c, l).then(() => { if (claveRef.current === c) setAviso(null) })
      .catch(e => { if (claveRef.current === c) setAviso('No se pudieron guardar los dibujos: ' + (e?.message || e)) })
  }
  const programaGuardar = (c, lista) => {
    const g = guardado.current
    if (g.clave && g.clave !== c) guardaYa()
    g.clave = c; g.lista = lista
    clearTimeout(g.timer); g.timer = setTimeout(guardaYa, ESPERA_GUARDAR)
  }
  // Los de otra instancia (pantalla completa ↔ normal) del mismo valor.
  useEffect(() => {
    const f = (c, lista, quien) => { if (quien !== yo && c === claveRef.current) { S.current.dibujos = lista; setDibujosSt(lista) } }
    OYENTES.add(f)
    return () => { OYENTES.delete(f); guardaYa() }
  }, [])
  // Al abrir un valor: sus dibujos de la base (la primera vez en esta visita; después, de la memoria).
  useEffect(() => {
    if (claveRef.current !== clave) {
      guardaYa()
      claveRef.current = clave
      setDibujosSt(MEMORIA.get(clave) || []); hist.current = []; setElegido(null); setPend([]); setHerr('cursor'); setTexto(null); setAviso(null)
    }
    if (!clave || !ctx || LEIDOS.has(clave)) return
    let vivo = true
    leerDibujos(ctx, clave).then(lista => {
      LEIDOS.add(clave)
      // Si se dibujó algo mientras se leía, se juntan (lo leído primero) y se guarda la suma: no se pierde nada.
      const ahora = MEMORIA.get(clave) || [], ids = new Set(lista.map(d => d.id))
      const nuevos = ahora.filter(d => !ids.has(d.id))
      const suma = nuevos.length ? [...lista, ...nuevos] : lista
      MEMORIA.set(clave, suma); avisa(clave, suma, null)
      if (nuevos.length) programaGuardar(clave, suma)
    }).catch(e => { if (vivo) setAviso('No se pudieron leer tus dibujos: ' + (e?.message || e)) })
    return () => { vivo = false }
  }, [clave, ctx])

  const pon = (nuevos, { sinGuardar = false } = {}) => {
    const c = claveRef.current
    MEMORIA.set(c, nuevos); S.current.dibujos = nuevos; setDibujosSt(nuevos)
    avisa(c, nuevos, yo)
    if (!sinGuardar && c) programaGuardar(c, nuevos)
  }
  const historia = () => { hist.current.push(S.current.dibujos || []); if (hist.current.length > MAX_HISTORIAL) hist.current.shift() }
  const cambia = (nuevos) => { historia(); pon(nuevos) }

  // ── Píxeles ↔ velas y precios ──
  // La vela i está en x0 + i × sp (sp = separación entre velas): lineal, también a la derecha de la última y con decimales.
  const conversor = () => {
    const ch = chartRef.current, s = seriesRef.current, cont = containerRef.current, w = wrapRef.current
    if (!ch || !s || !cont || !w || !esc.dd.length) return null
    try {
      const ts = ch.timeScale()
      const x0 = ts.logicalToCoordinate(0), x1 = ts.logicalToCoordinate(1)
      if (x0 == null || x1 == null || !(x1 - x0)) return null
      let izq = 0; try { izq = ch.priceScale('left').width() || 0 } catch (_) {}
      const rc = cont.getBoundingClientRect(), rw = w.getBoundingClientRect()
      const sp = x1 - x0
      return {
        esc, ancho: ts.width(), alto: Math.max(0, cont.clientHeight - ts.height()),
        offX: rc.left - rw.left + izq, offY: rc.top - rw.top, left: rc.left + izq, top: rc.top,
        x: i => x0 + i * sp, i: x => (x - x0) / sp, y: p => s.priceToCoordinate(p), p: y => s.coordinateToPrice(y), velas: data,
      }
    } catch (_) { return null }
  }
  // Del ratón a un punto { fecha, precio }; con imán, pegado a la apertura, máximo, mínimo o cierre de su vela.
  const punto = (e, conIman) => {
    const c = conversor(); if (!c) return null
    let i = c.i(e.clientX - c.left), p = c.p(e.clientY - c.top)
    if (p == null || !Number.isFinite(i)) return null
    const iLibre = i, pLibre = p
    if (conIman && data?.length) { const k = Math.max(0, Math.min(data.length - 1, Math.round(i))); p = iman(data[k], p); i = k }
    return { fecha: fechaDeIndice(esc, i), precio: Math.max(1e-6, p), iLibre, pLibre }
  }

  // Redibujar cuando el gráfico se desplaza, se acerca o cambia de escala (lightweight-charts no avisa de todo: se mira cada fotograma).
  useEffect(() => {
    let vivo = true, firma = '', id = 0
    const ref = data?.length ? data[data.length - 1].close : 1
    const mira = () => {
      if (!vivo) return
      const c = conversor()
      const f = c ? [c.x(0), c.x(1), c.y(ref), c.y(ref * 1.1), c.ancho, c.alto, c.offX, c.offY].map(v => Math.round((v || 0) * 10)).join(',') : ''
      if (f !== firma) { firma = f; setTick(t => t + 1) }
      id = requestAnimationFrame(mira)
    }
    id = requestAnimationFrame(mira)
    return () => { vivo = false; cancelAnimationFrame(id) }
  }, [data])

  // ── Acciones ──
  const termina = (pts) => {
    const st = S.current, h = st.herr
    st.fin = Date.now(); st.pend = []
    setPend([]); setCursor(null)
    // Con el 🔒 encendido la herramienta sigue elegida; «Medir» (que no es un dibujo) vuelve siempre al cursor.
    const sigue = st.seguir && h !== 'medir'
    if (!sigue) { st.herr = 'cursor'; setHerr('cursor') }
    if (h === 'medir') { setMedida({ a: pts[0], b: pts[1] }); return }
    const estilo = estiloDe(h)
    if ((h === 'larga' || h === 'corta') && estilo.arriesgo == null && st.arriesgoDefecto > 0) estilo.arriesgo = Math.round(st.arriesgoDefecto * 100) / 100
    const d = creaDibujo(h, h === 'larga' || h === 'corta' ? colocaPosicion(h, pts[0], pts[1], st.esc) : pts, estilo)
    if (d) { cambia([...(st.dibujos || []), d]); if (!sigue) setElegido(d.id) }
  }
  const cancela = () => { S.current.pend = []; S.current.herr = 'cursor'; setPend([]); setCursor(null); setHerr('cursor') }
  const elige = (h) => { S.current.pend = []; S.current.herr = h; setPend([]); setCursor(null); setTexto(null); setHerr(h); if (h !== 'cursor') setElegido(null) }
  const borra = (id) => { cambia((S.current.dibujos || []).filter(d => d.id !== id)); setElegido(null) }
  const deshaz = () => { if (!hist.current.length) return; pon(hist.current.pop()); setElegido(null); setPend([]) }
  const editaDibujo = (id, f) => cambia((S.current.dibujos || []).map(d => d.id === id ? f(d) : d))
  // Cambiar el estilo de un dibujo lo recuerda para los siguientes de su tipo.
  const estilo = (d, cambios) => {
    // «Arriesgo» vale igual para la larga y la corta.
    if ((d.tipo === 'larga' || d.tipo === 'corta') && cambios.arriesgo != null) { recuerdaEstilo('larga', cambios); recuerdaEstilo('corta', cambios) } else recuerdaEstilo(d.tipo, cambios)
    editaDibujo(d.id, x => ({ ...x, ...cambios }))
  }
  // Flechas: mueve el dibujo elegido (una serie de pulsaciones seguidas cuenta como un solo paso para deshacer).
  const mueveConFlecha = (paso) => {
    const st = S.current, d = (st.dibujos || []).find(x => x.id === st.elegido), c = conversor()
    if (!d || !c) return
    let dp = 0
    if (paso.dpx) { const y0 = c.y(d.puntos[0].precio), p1 = y0 == null ? null : c.p(y0 - paso.dpx); if (p1 == null) return; dp = p1 - d.puntos[0].precio }
    const n = mueve(d, esc, paso.dv, dp)
    if (Date.now() - (st.ultFlecha || 0) > 800) historia()
    st.ultFlecha = Date.now()
    pon((st.dibujos || []).map(x => x.id === d.id ? n : x))
  }
  const ultimoCierre = data?.length ? data[data.length - 1].close : null
  const guardaTexto = (t) => {
    const v = (t?.valor || '').trim()
    setTexto(null)
    if (!t) return
    if (t.id) { if (v) editaDibujo(t.id, d => ({ ...d, texto: v.slice(0, 200) })); else borra(t.id); return }
    if (!v) return
    const d = creaDibujo('texto', [{ fecha: t.fecha, precio: t.precio }], { ...estiloDe('texto'), texto: v.slice(0, 200) })
    if (d) { cambia([...(S.current.dibujos || []), d]); setElegido(d.id) }
  }

  S.current = { ...S.current, dibujos, herr, pend, elegido, imanFijo, termina, cancela, elige, borra, deshaz, punto, esc, setElegido, setCursor, setPend, setTexto, setHerr, pon, cambia, historia, mueveConFlecha, onAlerta, ultimoCierre, seguir, arriesgoDefecto, medida, setMedida }

  // ── El ratón sobre el gráfico (fase de captura) y el teclado ──
  useEffect(() => {
    const w = wrapRef.current; if (!w) return
    const dentro = e => !!containerRef.current?.contains(e.target)
    const conIman = e => S.current.imanFijo || e.ctrlKey
    const down = e => {
      const st = S.current
      if (e.button !== 0 || !dentro(e)) return
      if (st.medida) st.setMedida(null)
      // Mayús + arrastrar con el cursor = medir (como TradingView).
      if (st.herr === 'cursor' && e.shiftKey) { st.herr = 'medir'; st.setHerr('medir') }
      if (st.herr === 'cursor') { if (st.elegido) st.setElegido(null); return }
      e.stopPropagation(); e.preventDefault()
      const q = st.punto(e, conIman(e)); if (!q) return
      if (st.herr === 'texto') { st.setTexto({ id: null, fecha: q.fecha, precio: q.precio, valor: '' }); st.setHerr('cursor'); st.fin = Date.now(); return }
      if (st.herr === 'alerta') { st.fin = Date.now(); st.elige('cursor'); st.onAlerta?.(Math.round(q.precio * 100) / 100, st.ultimoCierre); return }
      const nuevos = [...st.pend, { fecha: q.fecha, precio: q.precio }]
      st.abajo = { x: e.clientX, y: e.clientY, n: nuevos.length }
      if (nuevos.length >= necesita(st.herr)) st.termina(nuevos)
      else { st.pend = nuevos; st.setPend(nuevos); st.setCursor({ fecha: q.fecha, precio: q.precio }) }
    }
    const up = e => {
      const st = S.current
      if (st.herr === 'cursor' || !dentro(e)) return
      e.stopPropagation()
      // Arrastrar: soltar lejos del primer punto pone el segundo.
      const a = st.abajo; st.abajo = null
      if (a && a.n === 1 && st.pend.length === 1 && Math.hypot(e.clientX - a.x, e.clientY - a.y) > 5) {
        const q = st.punto(e, conIman(e)); if (!q) return
        const nuevos = [...st.pend, { fecha: q.fecha, precio: q.precio }]
        if (nuevos.length >= necesita(st.herr)) st.termina(nuevos)
        else { st.pend = nuevos; st.setPend(nuevos); st.setCursor({ fecha: q.fecha, precio: q.precio }) }
      }
    }
    const para = e => {
      const st = S.current
      if (!dentro(e)) return
      if (st.herr !== 'cursor' || Date.now() - (st.fin || 0) < 500) { e.stopPropagation(); e.preventDefault() }
    }
    // El gráfico también mira los «pointer» y los toques: con una herramienta, tampoco le llegan.
    const tapa = e => { if (S.current.herr !== 'cursor' && dentro(e)) e.stopPropagation() }
    const move = e => {
      const st = S.current
      if (st.arrastre) return
      if (st.herr !== 'cursor' && st.pend.length) { const q = st.punto(e, conIman(e)); if (q) st.setCursor({ fecha: q.fecha, precio: q.precio }) }
    }
    const entra = () => { S.current.encima = true }, sale = () => { S.current.encima = false }
    w.addEventListener('mousedown', down, true); w.addEventListener('mouseup', up, true)
    w.addEventListener('click', para, true); w.addEventListener('dblclick', para, true)
    w.addEventListener('mousemove', move); w.addEventListener('mouseenter', entra); w.addEventListener('mouseleave', sale)
    for (const t of ['pointerdown', 'pointerup', 'touchstart', 'touchend']) w.addEventListener(t, tapa, true)
    // Arrastrar un dibujo o una de sus asas.
    const mueveVentana = e => {
      const st = S.current, ar = st.arrastre; if (!ar) return
      const q = st.punto(e, ar.k >= 0 && conIman(e)); if (!q) return
      let d
      if (ar.k >= 0) d = mueveAsa(ar.orig, ar.k, q)
      else d = mueve(ar.orig, st.esc, Math.round(q.iLibre - ar.i0), q.pLibre - ar.p0)
      if (!ar.movido) { ar.movido = true; st.historia() }   // el historial guarda cómo estaba antes de mover
      st.pon((S.current.dibujos || []).map(x => x.id === d.id ? d : x), { sinGuardar: true })
    }
    const sueltaVentana = () => {
      const ar = S.current.arrastre; if (!ar) return
      S.current.arrastre = null; S.current.fin = Date.now()
      if (ar.movido) S.current.pon(S.current.dibujos || [])
    }
    window.addEventListener('mousemove', mueveVentana); window.addEventListener('mouseup', sueltaVentana)
    const tecla = e => {
      const st = S.current
      const t = e.target
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return
      const enJuego = st.encima || st.herr !== 'cursor' || st.pend.length || st.elegido || st.medida
      if (!enJuego) return
      if (e.key === 'Escape') {
        if (st.herr !== 'cursor' || st.pend.length) st.cancela(); else if (st.elegido) st.setElegido(null); else if (st.medida) st.setMedida(null); else return
        e.preventDefault(); e.stopPropagation(); return
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && st.elegido) { st.borra(st.elegido); e.preventDefault(); return }
      const paso = st.elegido && st.herr === 'cursor' && !e.ctrlKey && !e.altKey && !e.metaKey ? pasoFlecha(e.key, e.shiftKey) : null
      if (paso) { st.mueveConFlecha(paso); e.preventDefault(); e.stopPropagation(); return }
      if (!st.encima) return
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'z') { st.deshaz(); e.preventDefault(); return }
      if (e.altKey && !e.ctrlKey && ATAJOS[e.key.toLowerCase()]) { st.elige(ATAJOS[e.key.toLowerCase()]); e.preventDefault() }
    }
    window.addEventListener('keydown', tecla, true)
    return () => {
      w.removeEventListener('mousedown', down, true); w.removeEventListener('mouseup', up, true)
      w.removeEventListener('click', para, true); w.removeEventListener('dblclick', para, true)
      w.removeEventListener('mousemove', move); w.removeEventListener('mouseenter', entra); w.removeEventListener('mouseleave', sale)
      for (const t of ['pointerdown', 'pointerup', 'touchstart', 'touchend']) w.removeEventListener(t, tapa, true)
      window.removeEventListener('mousemove', mueveVentana); window.removeEventListener('mouseup', sueltaVentana)
      window.removeEventListener('keydown', tecla, true)
    }
  }, [])

  const empiezaArrastre = (e, d, k) => {
    if (e.button !== 0 || S.current.herr !== 'cursor') return
    e.stopPropagation(); e.preventDefault()
    const q = punto(e, false); if (!q) return
    setElegido(d.id)
    S.current.arrastre = { id: d.id, k, orig: d, i0: q.iLibre, p0: q.pLibre, movido: false }
  }

  // ── Pintar ──
  const c = conversor()
  const cursorHerr = herr !== 'cursor'
  const pinta = (el, key, extra = {}) => {
    const { el: tag, a, txt } = el
    if (tag === 'rotulo') {
      // El de la entrada (con «izq»): a la derecha de la caja si cabe; si no, a su izquierda; si tampoco, dentro, bajo la línea de entrada.
      const w = txt.length * 6.4 + 10
      let x = a.x, y = a.y
      if (a.izq != null && c && x + w > c.ancho) { if (a.izq - w - 4 >= 0) x = a.izq - w - 4; else { x = Math.max(0, Math.min(a.izq + 2, c.ancho - w)); y = a.y + 18 } }
      return <g key={key}><rect x={x} y={y - 13} width={w} height={18} rx={3} fill={a.fondo} /><text x={x + 5} y={y} fill="#fff" fontSize={11.5} fontFamily={MONO}>{txt}</text></g>
    }
    if (tag === 'etiqueta') {
      const w = Math.max(40, txt.length * 6.6 + 10)
      const x = a.ancla === 'eje' ? a.x + 1 : a.x - w / 2, y = a.ancla === 'eje' ? a.y - 9 : a.y + 2
      return <g key={key}><rect x={x} y={y} width={w} height={18} rx={2} fill={a.fondo} /><text x={x + w / 2} y={y + 13} fill="#0b0f16" fontSize={11} fontWeight={600} textAnchor="middle" fontFamily={MONO}>{txt}</text></g>
    }
    const props = { ...extra }
    for (const [k, v] of Object.entries(a)) props[k.replace(/-([a-z])/g, (_, l) => l.toUpperCase())] = v
    if (tag === 'text') return <text key={key} {...props} fontFamily={MONO}>{txt}</text>
    const Tag = tag
    return <Tag key={key} {...props} />
  }
  let capa = null
  if (c && c.ancho > 0 && c.alto > 0) {
    const lista = []
    for (const d of dibujos) {
      if (texto?.id === d.id) continue
      lista.push({ d, f: formas(d, c, { elegido: d.id === elegido }) })
    }
    let prev = null
    if (cursorHerr && pend.length && cursor) {
      if (herr === 'medir') prev = { ...formasMedir(pend[0], cursor, c), eje: [] }
      else { const pd = provisional(herr, pend, cursor, esc); if (pd) prev = formas(pd, c, { elegido: true }) }
    }
    if (!prev && medida) prev = { ...formasMedir(medida.a, medida.b, c), eje: [] }
    capa = (
      <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 6, overflow: 'visible' }} data-dibujos={dibujos.length}>
        <defs><clipPath id={clip}><rect x={0} y={0} width={c.ancho} height={c.alto} /></clipPath></defs>
        <g transform={`translate(${c.offX},${c.offY})`}>
          <g clipPath={`url(#${clip})`}>
            {lista.map(({ d, f }) => <g key={d.id} data-dibujo={d.tipo}>{f.trazos.map((el, k) => pinta(el, k))}</g>)}
            {prev && <g opacity={0.8}>{prev.trazos.map((el, k) => pinta(el, k))}</g>}
          </g>
          {lista.map(({ d, f }) => <g key={'e' + d.id}>{f.eje.map((el, k) => pinta(el, k))}</g>)}
          {prev && prev.eje.map((el, k) => pinta(el, 'pe' + k))}
          {/* Lo que coge el ratón, también recortado al panel: un dibujo fuera de la vista no puede atrapar clics fuera del gráfico. */}
          <g clipPath={`url(#${clip})`}>
          {!cursorHerr && lista.map(({ d, f }) => (
            <g key={'g' + d.id} style={{ cursor: 'move' }}
              onMouseDown={e => empiezaArrastre(e, d, -1)}
              onDoubleClick={e => { if (d.tipo === 'texto') { e.stopPropagation(); setTexto({ id: d.id, fecha: d.puntos[0].fecha, precio: d.puntos[0].precio, valor: d.texto || '' }) } }}>
              {f.golpe.map((el, k) => pinta(el, k))}
            </g>
          ))}
          {!cursorHerr && lista.map(({ d, f }) => f.asas.map(h => (
            <circle key={'a' + d.id + h.k} cx={h.x} cy={h.y} r={4.5} fill="#0d1824" stroke={colorDe(d)} strokeWidth={1.6}
              style={{ pointerEvents: 'all', cursor: 'pointer' }} onMouseDown={e => empiezaArrastre(e, d, h.k)} />
          )))}
          </g>
        </g>
      </svg>
    )
  }

  // Cuadro para escribir el texto.
  let cuadroTexto = null
  if (texto && c) {
    const x = c.offX + c.x(indiceDeFecha(esc, texto.fecha)), y = c.offY + c.y(texto.precio)
    cuadroTexto = (
      <input autoFocus value={texto.valor} placeholder="Escribe y pulsa Intro" maxLength={200}
        onChange={e => setTexto({ ...texto, valor: e.target.value })}
        onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') guardaTexto(texto); if (e.key === 'Escape') setTexto(null) }}
        onBlur={() => guardaTexto(texto)}
        style={{ position: 'absolute', left: x - 4, top: y - 17, zIndex: 25, width: 220, fontFamily: MONO, fontSize: 13,
          background: '#0d1824', color: '#f3f3f5', border: '1px solid #4c9aff', borderRadius: 3, padding: '2px 5px', outline: 'none' }} />
    )
  }

  // Barrita del dibujo elegido: color, grosor, duplicar, papelera.
  const del = dibujos.find(d => d.id === elegido)
  const barrita = del && !cursorHerr ? (
    <div onMouseDown={e => e.stopPropagation()} data-barrita=""
      style={{ position: 'absolute', top: 6 + arriba, left: '50%', transform: 'translateX(-50%)', zIndex: 20, display: 'flex', alignItems: 'center', gap: 4,
        background: '#0d1824', border: '1px solid #1e3a52', borderRadius: 5, padding: '3px 6px', boxShadow: '0 4px 16px rgba(0,0,0,0.6)', fontFamily: MONO, fontSize: 10, color: '#9fb6cf' }}>
      {COLORES.map(col => (
        <span key={col} title="Color" onClick={() => estilo(del, { color: col })}
          style={{ width: 14, height: 14, borderRadius: 3, background: col, cursor: 'pointer', outline: colorDe(del) === col ? '2px solid #e2eaf5' : 'none', outlineOffset: 1 }} />
      ))}
      <span style={{ width: 1, height: 16, background: '#1e3a52', margin: '0 3px' }} />
      {[1, 2, 3, 4].map(g => (
        <span key={g} title={`Grosor ${g}`} onClick={() => estilo(del, { grosor: g })}
          style={{ width: 18, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', borderRadius: 3,
            background: grosorDe(del) === g ? 'rgba(76,154,255,0.22)' : 'transparent' }}>
          <span style={{ width: 12, height: g, background: '#c8dff5', borderRadius: 1 }} />
        </span>
      ))}
      <span style={{ width: 1, height: 16, background: '#1e3a52', margin: '0 3px' }} />
      {del.tipo === 'texto' && (() => {
        const k = TAMANOS_TEXTO.indexOf(tamDe(del)), cambiaTam = (s) => { const n = TAMANOS_TEXTO[Math.max(0, Math.min(TAMANOS_TEXTO.length - 1, (k < 0 ? 2 : k) + s))]; estilo(del, { tam: n }) }
        return <span data-tam-texto="" style={{ display: 'flex', alignItems: 'center', gap: 3, marginRight: 3 }}>
          <span title="Letra más pequeña" data-tam="menos" onClick={() => cambiaTam(-1)} style={{ cursor: 'pointer', padding: '0 4px', border: '1px solid #1e3a52', borderRadius: 3 }}>A−</span>
          <span title="Tamaño de la letra" style={{ minWidth: 16, textAlign: 'center', color: '#e2eaf5' }}>{tamDe(del)}</span>
          <span title="Letra más grande" data-tam="mas" onClick={() => cambiaTam(1)} style={{ cursor: 'pointer', padding: '0 4px', border: '1px solid #1e3a52', borderRadius: 3 }}>A+</span>
        </span>
      })()}
      {(del.tipo === 'larga' || del.tipo === 'corta') && (
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, marginRight: 4 }} title="Lo que pierdes si salta el stop: con él se calcula cuántas acciones comprar (redondeando hacia abajo)">
          Arriesgo
          <input key={del.id + ':' + (del.arriesgo ?? '')} data-arriesgo="" defaultValue={del.arriesgo != null ? String(del.arriesgo).replace('.', ',') : ''} placeholder="€"
            onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') e.currentTarget.blur() }}
            onBlur={e => { const v = Number(String(e.currentTarget.value).replace(/\./g, '').replace(',', '.')); if (Number.isFinite(v) && v >= 0 && v !== del.arriesgo) estilo(del, { arriesgo: v }) }}
            style={{ width: 62, fontFamily: MONO, fontSize: 11, background: '#0a1320', color: '#e2eaf5', border: '1px solid #1e3a52', borderRadius: 3, padding: '1px 4px' }} /> €
        </span>
      )}
      {del.tipo === 'texto' && <span title="Cambiar el texto" onClick={() => setTexto({ id: del.id, fecha: del.puntos[0].fecha, precio: del.puntos[0].precio, valor: del.texto || '' })} style={{ cursor: 'pointer', padding: '0 3px' }}>✎</span>}
      <span title="Duplicar" onClick={() => { const n = duplica(del, esc); cambia([...dibujos, n]); setElegido(n.id) }} style={{ cursor: 'pointer', color: '#9fb6cf' }}><Icono n="duplicar" /></span>
      <span title="Borrar este dibujo (Supr)" onClick={() => borra(del.id)} style={{ cursor: 'pointer', color: '#ff4d6d' }}><Icono n="papelera" /></span>
    </div>
  ) : null

  // Línea de ayuda mientras se dibuja.
  const h = herr === 'alerta' ? HERR_ALERTA : HERRAMIENTAS.find(x => x.id === herr)
  const pista = cursorHerr && h ? (
    <div style={{ position: 'absolute', left: (c?.offX || 0) + 8, top: (c ? c.offY + c.alto : 300) - 28, zIndex: 20, pointerEvents: 'none', fontFamily: MONO, fontSize: 11,
      color: '#c8dff5', background: 'rgba(8,12,20,0.9)', border: '1px solid #1e3a52', borderRadius: 4, padding: '2px 8px', whiteSpace: 'nowrap' }}>
      <b>{h.nombre}:</b> {h.ayuda}{pend.length ? ` · punto ${pend.length + 1} de ${necesita(herr)}` : ''}. Esc cancela.
    </div>
  ) : null

  // Barra lateral.
  const boton = (id, titulo, activoB, onClick, color, desactivado) => (
    <button key={id} type="button" title={titulo} disabled={desactivado} data-herr={id}
      onClick={onClick}
      style={{ width: 28, height: 28, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 4, cursor: desactivado ? 'default' : 'pointer',
        border: '1px solid ' + (activoB ? '#2f5b85' : 'transparent'), background: activoB ? 'rgba(76,154,255,0.22)' : 'transparent',
        color: desactivado ? '#2e4258' : color || (activoB ? '#4c9aff' : '#9fb6cf') }}>
      <Icono n={id} />
    </button>
  )
  const sep = k => <span key={k} style={{ width: 20, height: 1, background: '#1e3a52', margin: '3px 0' }} />
  const barra = (
    <div data-barra-dibujos="" style={{ width: 36, height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: `${6 + arriba}px 0 6px`,
      background: '#0b1420', borderRight: '1px solid #1a2d45' }}>
      {HERRAMIENTAS.map(x => boton(x.id, `${x.nombre} · ${x.atajo}`, herr === x.id, () => elige(herr === x.id && x.id !== 'cursor' ? 'cursor' : x.id)))}
      {onAlerta && sep('s0')}
      {onAlerta && boton('alerta', 'Alerta de precio: un clic en el gráfico abre la ventana de la alarma con ese precio (con Ctrl, pegado a la vela)', herr === 'alerta', () => elige(herr === 'alerta' ? 'cursor' : 'alerta'), herr === 'alerta' ? null : '#ffd166')}
      {sep('s1')}
      {boton('candado', `Seguir dibujando: la herramienta sigue elegida después de cada dibujo, hasta pulsar el cursor o Esc · ${seguir ? 'encendido' : 'apagado'}`, seguir, () => { const v = !seguir; setSeguir(v); try { localStorage.setItem(CLAVE_SEGUIR, v ? '1' : '0') } catch (_) {} })}
      {boton('iman', `Imán: pega cada punto a la apertura, máximo, mínimo o cierre de su vela · ${imanFijo ? 'encendido' : 'apagado'} (o mantén pulsado Ctrl)`, imanFijo, () => setImanFijo(v => !v))}
      {boton('deshacer', 'Deshacer · Ctrl+Z', false, deshaz, null, !hist.current.length)}
      {boton('papelera', 'Borrar todos los dibujos de este valor (se puede deshacer con Ctrl+Z)', false, () => { cambia([]); setElegido(null) }, '#ff4d6d', !dibujos.length)}
      {sep('s2')}
      <Ayuda texto={AYUDA} etiqueta="Dibujar" />
    </div>
  )

  return (
    <>
      {slot && createPortal(barra, slot)}
      {capa}
      {cuadroTexto}
      {barrita}
      {pista}
      {aviso && (
        <div data-aviso-dibujos="" title={aviso} style={{ position: 'absolute', left: (c?.offX || 0) + 8, top: (c ? c.offY + c.alto : 300) - (pista ? 54 : 28), zIndex: 20, fontFamily: MONO, fontSize: 11,
          color: '#ff4d6d', background: 'rgba(8,12,20,0.92)', border: '1px solid rgba(255,77,109,0.5)', borderRadius: 4, padding: '2px 8px', maxWidth: 520, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          ⚠ {aviso}
        </div>
      )}
    </>
  )
}

// Para las pruebas: la memoria (valor → dibujos) y los valores ya leídos.
export { MEMORIA as _memoriaDibujos, LEIDOS as _leidosDibujos }
