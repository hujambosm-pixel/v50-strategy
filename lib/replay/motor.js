// lib/replay/motor.js — el MOTOR del Replay (docs/builder.md §225; boceto bocetos/replay-simulacion.html v2, aceptado por Sergi el 21/11).
// PURO: no lee la base ni Yahoo. Recibe el ESTADO de una simulación (el jsonb «estado» de public.simulaciones, sql/simulaciones.sql) y las
// velas de sus valores, y RECALCULA todo desde el principio hasta la vela de hoy: dinero, posiciones, operaciones, órdenes vivas, curva.
// Como se recalcula siempre, RETROCEDER es solo quitar las acciones posteriores (nada se «deshace» a mano).
//
// ESTADO: { version: 1, valores: ['AAPL', …], desde: 'AAAA-MM-DD' (la primera vela que ves), hoy: 'AAAA-MM-DD' (la última que ves),
//           capitalInicial, comision (€ por orden: cada compra y cada venta), ejecucion: 'apertura' (por defecto) | 'cierre',
//           acciones: [...], retrocesos, terminada }
// VELAS:  { AAPL: [{ date: 'AAAA-MM-DD', open, high, low, close }, …], … } (ordenadas; pueden traer velas de antes y de después: se recortan).
//
// ACCIONES (lo que hace Sergi; cada una con la «fecha» de la vela que estaba viendo, ya cerrada):
//   orden    { fecha, simbolo, tipo: 'orden', id, lado: 1 largo | -1 corto, entrada: null (a mercado) | precio, clase: 'limite' | 'stop',
//              stop?, objetivo?, tam: { modo: 'invertir' | 'arriesgar', pct } }
//   cerrar   { fecha, simbolo, tipo: 'cerrar' }                       vende (o recompra) todo lo de ese valor
//   cancelar { fecha, tipo: 'cancelar', id }                          quita una orden viva
//   mover    { fecha, tipo: 'mover', id? | simbolo?, entrada?, clase?, stop?, objetivo? }   id = orden viva; sin id = la posición abierta
//            (stop u objetivo null = quitarlo).
//
// CUÁNDO PASA CADA COSA (en cada vela, en este orden):
//   1. Lo pendiente de antes: «cerrar» y las órdenes a mercado, a la APERTURA. Las de entrada en un precio:
//      LÍMITE (largo por debajo del precio; corto por encima): largo si el mínimo llega a la entrada → a la entrada, o a la apertura si abrió
//      ya por debajo; corto al revés. STOP (largo por encima; corto por debajo): largo si el máximo llega → a la entrada, o a la apertura si
//      abrió ya por encima. Una orden viva sigue viva hasta que se cumple o se cancela.
//   2. Stop y objetivo de lo abierto: si abre ya al otro lado (hueco) → a la apertura; si no, si el mínimo / máximo llega → a ese precio.
//      Si en la misma vela se tocan los dos, cuenta el STOP (no se sabe cuál fue antes: lo prudente). La vela en que se entra a mitad
//      (no a la apertura): el stop sí se mira (sin hueco), el objetivo no.
//   3. Las acciones de esa vela (se decidieron viéndola cerrada): pasan a la vela SIGUIENTE de su valor. Con ejecucion 'cierre', las órdenes a
//      mercado y «cerrar» se hacen al cierre de esa misma vela.
//   4. Si la simulación está terminada, en la vela de hoy se cierra todo al cierre (norma de la app: cierre al final).
//   5. El dinero al cierre (curva del capital).
//
// TAMAÑO: con el dinero total (liquidez + lo invertido) a la APERTURA del día en que se ejecuta. «invertir X %» = acciones = dinero × X % ÷
// precio; «arriesgar X %» = dinero × X % ÷ |precio − stop| (sin stop no se puede: aviso). Siempre redondeado hacia abajo. Sin apalancamiento:
// un largo no puede costar más que la liquidez (menos la comisión); un corto no puede valer más que el dinero total.
// Orden del lado contrario a una posición abierta = la cierra (no da la vuelta). Del mismo lado = compra más (precio medio).
// §233: cada operación (y la posición abierta) lleva ids = las órdenes que la abrieron o la ampliaron (para poder quitarla).
// Stop u objetivo al otro lado del precio de entrada → no se pone (aviso). Sin coste de préstamo en los cortos. Sin impuestos.

const esFecha = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)
const positivo = (x) => typeof x === 'number' && Number.isFinite(x) && x > 0

export const VERSION = 1

export function validaEstado(e) {
  const m = []
  if (!e || typeof e !== 'object') return ['No hay simulación.']
  if (!Array.isArray(e.valores) || !e.valores.length) m.push('Falta elegir al menos un valor.')
  if (!esFecha(e.desde)) m.push('Falta la fecha de inicio.')
  if (!esFecha(e.hoy)) m.push('Falta la fecha de hoy.')
  if (esFecha(e.desde) && esFecha(e.hoy) && e.hoy < e.desde) m.push('Hoy no puede ser antes del inicio.')
  if (!positivo(e.capitalInicial)) m.push('El capital inicial tiene que ser mayor que 0.')
  if (!(typeof e.comision === 'number' && e.comision >= 0)) m.push('La comisión por orden no puede ser negativa.')
  if (e.ejecucion != null && !['apertura', 'cierre'].includes(e.ejecucion)) m.push('Las órdenes a mercado van a la apertura o al cierre.')
  if (!Array.isArray(e.acciones)) m.push('Faltan las acciones.')
  return m
}

// El calendario: todas las fechas con vela de cualquiera de los valores, de «desde» a «hoy».
export function calendario(estado, velas) {
  const s = new Set()
  for (const v of estado.valores) for (const x of velas[v] || []) if (x.date >= estado.desde && x.date <= estado.hoy) s.add(x.date)
  return [...s].sort()
}

// La vela de un valor en cada fecha y su último cierre conocido (para valorar cuando ese valor no cotiza ese día).
function indexa(estado, velas) {
  const por = {}
  for (const v of estado.valores) { const m = new Map(); for (const x of velas[v] || []) m.set(x.date, x); por[v] = m }
  return por
}

export function calcula(estado, velas) {
  const cm = estado.comision || 0
  const fechas = calendario(estado, velas)
  const vela = indexa(estado, velas)
  const ultimo = {}            // último cierre conocido de cada valor
  let caja = estado.capitalInicial, num = 0, nOrdenes = 0, comisiones = 0
  const pos = {}, operaciones = [], marcas = [], curva = [], avisos = []
  let pend = []
  const acciones = [...(estado.acciones || [])].filter(a => a.fecha <= estado.hoy)
  const fin = fechas[fechas.length - 1]

  const valorEn = (f, campo) => { let t = caja; for (const s in pos) { const x = vela[s].get(f); t += pos[s].q * (x ? x[campo] : ultimo[s]) } return t }
  const cobra = () => { caja -= cm; comisiones += cm; nOrdenes++ }
  const cierra = (s, p, f, motivo) => {
    const x = pos[s]
    caja += x.q * p; cobra()
    const resultado = (p - x.medio) * x.q - x.comision - cm
    operaciones.push({ num: x.num, simbolo: s, lado: x.q > 0 ? 1 : -1, fechaEntrada: x.fecha, precioEntrada: x.medio, fechaSalida: f, precioSalida: p,
      acciones: Math.abs(x.q), comisiones: x.comision + cm, resultado, pct: (p / x.medio - 1) * 100 * Math.sign(x.q), motivo, ids: x.ids || [], stop: x.stop, objetivo: x.objetivo })   // §236: stop y objetivo al salir (su caja en el gráfico)
    marcas.push({ simbolo: s, fecha: f, precio: p, tipo: 'salida', num: x.num })
    delete pos[s]
  }
  const abre = (o, p, f, campo = 'open') => {
    const x = pos[o.simbolo]
    if (x && Math.sign(x.q) !== o.lado) { cierra(o.simbolo, p, f, 'a mano'); return }
    const total = valorEn(f, campo)
    const pct = o.tam?.pct ?? 0
    let q
    if (o.tam?.modo === 'arriesgar') {
      if (o.stop == null || Math.abs(p - o.stop) < 1e-9) { avisos.push({ fecha: f, simbolo: o.simbolo, texto: 'para arriesgar un % hace falta un stop' }); return }
      q = Math.floor(total * pct / 100 / Math.abs(p - o.stop) + 1e-9)
    } else q = Math.floor(total * pct / 100 / p + 1e-9)
    if (o.lado > 0) q = Math.min(q, Math.floor((caja - cm) / p + 1e-9))
    else q = Math.min(q, Math.floor((total - cm) / p + 1e-9) - (x ? Math.abs(x.q) : 0))
    if (!(q > 0)) { avisos.push({ fecha: f, simbolo: o.simbolo, texto: `no llega el dinero para una acción de ${o.simbolo} a ${p.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' })} (sube el %)` }); return }
    caja -= o.lado * q * p; cobra()
    if (x) { const nq = x.q + o.lado * q; x.medio = (x.medio * Math.abs(x.q) + p * q) / Math.abs(nq); x.q = nq; x.comision += cm; if (o.id != null) x.ids.push(o.id) }
    else pos[o.simbolo] = { q: o.lado * q, medio: p, fecha: f, comision: cm, num: ++num, stop: null, objetivo: null, ids: o.id != null ? [o.id] : [] }
    const y = pos[o.simbolo], largo = o.lado > 0
    if (o.stop != null) { if (largo ? o.stop < p : o.stop > p) y.stop = o.stop; else avisos.push({ fecha: f, simbolo: o.simbolo, texto: 'el stop quedó al otro lado de la entrada y no se puso' }) }
    if (o.objetivo != null) { if (largo ? o.objetivo > p : o.objetivo < p) y.objetivo = o.objetivo; else avisos.push({ fecha: f, simbolo: o.simbolo, texto: 'el objetivo quedó al otro lado de la entrada y no se puso' }) }
    y.aMitad = p !== vela[o.simbolo].get(f).open ? f : null
    marcas.push({ simbolo: o.simbolo, fecha: f, precio: p, tipo: o.lado > 0 ? 'compra' : 'venta', num: y.num })
  }

  for (const f of fechas) {
    // 1 · lo pendiente
    const vivas = pend; pend = []
    for (const o of vivas) {
      const v = vela[o.simbolo].get(f)
      if (!v) { pend.push(o); continue }                       // ese valor no cotiza hoy: espera
      if (o.cerrar) { if (pos[o.simbolo]) cierra(o.simbolo, v.open, f, 'a mano'); continue }
      if (o.entrada == null) { abre(o, v.open, f); continue }
      const largo = o.lado > 0; let p = null
      if (o.clase === 'limite') { if (largo && v.low <= o.entrada) p = Math.min(v.open, o.entrada); if (!largo && v.high >= o.entrada) p = Math.max(v.open, o.entrada) }
      else { if (largo && v.high >= o.entrada) p = Math.max(v.open, o.entrada); if (!largo && v.low <= o.entrada) p = Math.min(v.open, o.entrada) }
      if (p == null) pend.push(o); else abre(o, p, f)
    }
    // 2 · stop y objetivo
    for (const s of Object.keys(pos)) {
      const x = pos[s], v = vela[s].get(f); if (!v) continue
      const largo = x.q > 0, mitad = x.aMitad === f
      if (x.stop != null) {
        if (!mitad && (largo ? v.open <= x.stop : v.open >= x.stop)) { cierra(s, v.open, f, 'stop (hueco)'); continue }
        if (largo ? v.low <= x.stop : v.high >= x.stop) { cierra(s, x.stop, f, 'stop'); continue }
      }
      if (x.objetivo != null && !mitad) {
        if (largo ? v.open >= x.objetivo : v.open <= x.objetivo) { cierra(s, v.open, f, 'objetivo (hueco)'); continue }
        if (largo ? v.high >= x.objetivo : v.low <= x.objetivo) { cierra(s, x.objetivo, f, 'objetivo'); continue }
      }
    }
    for (const s of estado.valores) { const v = vela[s].get(f); if (v) ultimo[s] = v.close }
    // 3 · lo que se decidió viendo esta vela
    for (const a of acciones) {
      if (a.fecha !== f) continue
      const v = vela[a.simbolo]?.get(f)
      if (a.tipo === 'orden') {
        const o = { ...a }
        if (o.entrada == null && estado.ejecucion === 'cierre' && v) abre(o, v.close, f, 'close'); else pend.push(o)
      } else if (a.tipo === 'cerrar') {
        if (estado.ejecucion === 'cierre' && v) { if (pos[a.simbolo]) cierra(a.simbolo, v.close, f, 'a mano') } else pend.push({ simbolo: a.simbolo, cerrar: true })
      } else if (a.tipo === 'cancelar') pend = pend.filter(o => o.id !== a.id)
      else if (a.tipo === 'mover') {
        const d = a.id != null ? pend.find(o => o.id === a.id) : pos[a.simbolo]
        if (d) for (const c of ['entrada', 'clase', 'stop', 'objetivo']) if (a[c] !== undefined) d[c] = a[c]
      }
    }
    // 4 · cierre al final
    if (estado.terminada && f === fin) { for (const s of Object.keys(pos)) cierra(s, ultimo[s], f, 'cierre al final'); pend = [] }
    // 5 · el dinero al cierre
    curva.push({ fecha: f, valor: valorEn(f, 'close') })
  }
  const posiciones = {}
  for (const s in pos) { const x = pos[s]; posiciones[s] = { num: x.num, lado: x.q > 0 ? 1 : -1, acciones: Math.abs(x.q), precioMedio: x.medio, fecha: x.fecha, stop: x.stop, objetivo: x.objetivo, ganancia: (ultimo[s] - x.medio) * x.q - x.comision, ids: x.ids } }
  return { fechas, caja, posiciones, operaciones, marcas, ordenesVivas: pend.filter(o => !o.cerrar), curva, avisos, comisiones, ordenes: nOrdenes }
}

// Las cifras del resumen y de la pestaña «Curva del capital».
export function cifras(estado, velas, r = calcula(estado, velas)) {
  const ops = r.operaciones, gan = ops.filter(o => o.resultado > 0), per = ops.filter(o => o.resultado <= 0)
  const sg = gan.reduce((a, o) => a + o.resultado, 0), sp = -per.reduce((a, o) => a + o.resultado, 0)
  let maximo = -Infinity, fechaMax = null, caida = 0, caidaEur = 0, fechaCaida = null, larga = 0, desdeMax = 0
  r.curva.forEach(({ fecha, valor }, i) => {
    if (valor >= maximo) { maximo = valor; fechaMax = fecha; desdeMax = i }
    const d = valor / maximo - 1
    if (d < caida) { caida = d; caidaEur = valor - maximo; fechaCaida = fecha }
    larga = Math.max(larga, i - desdeMax)
  })
  const final = r.curva.length ? r.curva[r.curva.length - 1].valor : estado.capitalInicial
  return {
    final, ganancia: final - estado.capitalInicial, pct: (final / estado.capitalInicial - 1) * 100,
    operaciones: ops.length, ganadoras: ops.length ? gan.length / ops.length * 100 : null,
    factorBeneficio: sp ? sg / sp : (sg ? Infinity : null),
    peorCaida: caida * 100, peorCaidaEur: caidaEur, fechaPeorCaida: fechaCaida, caidaMasLarga: larga,
    mediaGanadora: gan.length ? sg / gan.length : null, mediaPerdedora: per.length ? -sp / per.length : null,
    comisiones: r.comisiones, ordenes: r.ordenes, buyHold: buyHold(estado, velas),
  }
}

// Buy&Hold del primer valor con el mismo dinero: compra al cierre de la primera vela que ves (antes no puedes actuar) y vende al cierre de
// hoy, pagando la comisión de las dos órdenes (norma de la app: cierre al final).
export function buyHold(estado, velas, simbolo = estado.valores[0]) {
  const vs = (velas[simbolo] || []).filter(x => x.date >= estado.desde && x.date <= estado.hoy)
  if (!vs.length) return null
  const cm = estado.comision || 0, p0 = vs[0].close, p1 = vs[vs.length - 1].close
  const q = Math.floor((estado.capitalInicial - cm) / p0 + 1e-9)
  if (!(q > 0)) return null
  return { simbolo, acciones: q, final: estado.capitalInicial - q * p0 - cm + q * p1 - cm }
}

// Avanzar y retroceder. Retroceder quita las acciones de las velas que vuelven a ocultarse (las de la vela a la que vuelves se quedan:
// se decidieron viéndola) y suma un retroceso.
export function irA(estado, fecha) {
  if (!esFecha(fecha) || fecha === estado.hoy) return estado
  if (fecha < estado.desde) fecha = estado.desde
  if (fecha > estado.hoy) return { ...estado, hoy: fecha }
  return { ...estado, hoy: fecha, acciones: (estado.acciones || []).filter(a => a.fecha <= fecha), retrocesos: (estado.retrocesos || 0) + 1 }
}

// La vela siguiente (o la N-ésima) del calendario de la simulación, mirando todas las velas que hay (no solo hasta hoy).
export function siguiente(estado, velas, n = 1) {
  const todas = calendario({ ...estado, hoy: '9999-12-31' }, velas)
  const i = todas.findIndex(f => f > estado.hoy)
  if (i < 0) return null
  return todas[Math.min(todas.length - 1, i + n - 1)]
}

// Clase de una orden con entrada: largo por debajo del precio de ahora = límite, por encima = stop; corto al revés.
export const claseDe = (lado, entrada, ahora) => (lado > 0 ? (entrada < ahora ? 'limite' : 'stop') : (entrada > ahora ? 'limite' : 'stop'))

// Etiqueta de una operación, como las de las estrategias: «#3 +4,2 %».
export const etiqueta = (o) => `#${o.num} ${o.pct >= 0 ? '+' : '−'}${Math.abs(o.pct).toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`
