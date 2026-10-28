// lib/builder/senales.js — «Señales en el gráfico» del paso 1 (V9.1050; docs/builder.md, §16). Puro: recibe la definición, sus
// valores y las velas (del valor y del índice del filtro), y devuelve lo que se dibuja. Sin dinero: ni ganancias, ni curva, ni % de
// aciertos.
// LAS SEÑALES SALEN DEL MISMO MOTOR QUE EL BACKTEST Y EL PASO 2: el mismo calentamiento (lib/periodo.js velasCalentamiento con
// las ventanas declaradas, más lib/editor/historia.js conHistoria, como lib/backtestActivo.js), el mismo recorte del periodo y el
// mismo intérprete (lib/editor/interprete.js). Compras: las operaciones con la entrada dentro del periodo (y la posición abierta al
// final); ventas: sus salidas (no la venta virtual del último día que hace el backtest para cerrar las cuentas).
import { interpreta, serieCond, swingsDe } from '../editor/interprete'
import { esquemaDe, valoresDe, CONDICIONES_EDITOR } from '../editor/definicion'
import { velasCalentamiento, recortaConCalentamiento } from '../periodo'
import { ventanasDeclaradas } from '../parametrosEstrategia'
import { conHistoria } from '../editor/historia'
import { media, rsi, atr, macd, precios, maximoPrevio, minimoPrevio, maximoHasta, bollinger, swings, ordenSwing, lineasSwing } from '../condiciones/indicadores'
import { enReferencia, CONDICIONES_SWING } from '../condiciones/catalogo'
import { Y } from '../condiciones/nucleo'
import { semanalesDesdeDiarias } from '../velasSemanales'
import { leeFiltro, leeCompra, leeVenta, leeOrden, envuelve, fraseFila, nombreCond } from './tarjetas'

// Las velas previas que pide el motor para esta definición (las mismas de lib/backtestActivo.js).
export function calentamientoDe(def, valores, intervalo = 'diario') {
  let esquema = null; try { esquema = esquemaDe(def) } catch (_) {}
  const base = velasCalentamiento(valores, [], intervalo, esquema ? ventanasDeclaradas(esquema, valores) : null)
  return conHistoria(base, def, valores)
}

// Las condiciones del catálogo que aparecen en la definición (para las medias y los osciladores).
function hojas(x, out = []) {
  if (Array.isArray(x)) x.forEach(y => hojas(y, out))
  else if (x && typeof x === 'object') { if (CONDICIONES_EDITOR[x.c] && x.p) out.push(x); for (const [k, y] of Object.entries(x)) if (k !== 'p') hojas(y, out) }
  return out
}
const COLORES_MEDIA = ['#f2cc60', '#79c0ff', '#ff9bce', '#7ee787', '#d2a8ff', '#ffa657']
// Las medias que usa la regla (en el precio) y los osciladores (cada uno en su panel), con los valores ya resueltos.
// V9.1054: y los canales, también sobre el precio: el máximo y el mínimo de N velas (en escalera, con las mismas funciones que
// las condiciones) y las bandas de Bollinger.
export const COLOR_MAXIMO = '#3fb950', COLOR_MINIMO = '#f0883e', COLOR_BOLLINGER = '#d2a8ff'
export function indicadoresDe(def, v) {
  const medias = new Map(), osc = new Map(), canales = new Map()
  const conds = hojas({ senal: def.entrada?.senal, cancelar: def.entrada?.cancelar, salidas: def.salidas, stops: def.stops }).map(c => ({ c: c.c, p: Object.fromEntries(Object.entries(c.p).map(([k, x]) => [k, typeof x === 'string' && x.startsWith('$') ? v[x.slice(1)] : x])) }))
  const pon = (tipo, periodo) => { if (['EMA', 'SMA'].includes(tipo) && Number.isInteger(periodo) && periodo > 0) medias.set(`${tipo}|${periodo}`, { tipo, periodo }) }
  for (const { c, p } of conds) {
    if (c === 'precioVsMedia' || c === 'mediaPendiente' || c === 'distanciaMedia') pon(p.tipo, p.periodo)
    if (c === 'mediaVsMedia') { pon(p.tipoRapida, p.periodoRapida); pon(p.tipoLenta, p.periodoLenta) }
    if (c === 'rsiNivel') osc.set(`rsi|${p.periodo}|${p.umbral}`, { tipo: 'rsi', periodo: p.periodo, nivel: p.umbral, nombre: `RSI (${p.periodo})` })
    if (c === 'macdSenal' || c === 'macdCero') osc.set(`macd|${p.rapida}|${p.lenta}|${p.senal ?? 9}`, { tipo: 'macd', rapida: p.rapida, lenta: p.lenta, senal: p.senal ?? 9, nombre: `MACD (${p.rapida}, ${p.lenta}, ${p.senal ?? 9})` })
    if (c === 'rocNivel') osc.set(`roc|${p.n}|${p.umbral}`, { tipo: 'roc', n: p.n, nivel: p.umbral, nombre: `Cambio en ${p.n} velas (%)` })
    if (c === 'nuevoMaximo' && Number.isInteger(p.n)) canales.set(`max|${p.n}`, { tipo: 'maxPrevio', n: p.n, nombre: `máximo de ${p.n} velas`, color: COLOR_MAXIMO, escalera: true })
    if (c === 'nuevoMinimo' && Number.isInteger(p.n)) canales.set(`min|${p.n}`, { tipo: 'minPrevio', n: p.n, nombre: `mínimo de ${p.n} velas`, color: COLOR_MINIMO, escalera: true })
    if (c === 'cercaMaximo' && Number.isInteger(p.n)) canales.set(`maxH|${p.n}`, { tipo: 'maxHasta', n: p.n, nombre: `máximo de las ${p.n} últimas velas`, color: COLOR_MAXIMO, escalera: true, discontinua: true })
    if (c === 'bollingerBanda' && Number.isInteger(p.periodo) && typeof p.desviaciones === 'number') canales.set(`bb|${p.periodo}|${p.desviaciones}`, { tipo: 'bollinger', periodo: p.periodo, desviaciones: p.desviaciones, nombre: `Bollinger (${p.periodo}, ${String(p.desviaciones).replace('.', ',')})`, color: COLOR_BOLLINGER, discontinua: true })
    if (c === 'atrPct') osc.set(`atr|${p.periodo}|${p.umbral}`, { tipo: 'atr', periodo: p.periodo, nivel: p.umbral, nombre: `ATR (${p.periodo}) en % del precio` })
  }
  for (const s of def.stops || []) for (const e of s.de || []) if (e.media) pon(e.media.tipo, typeof e.media.periodo === 'string' ? v[e.media.periodo.slice(1)] : e.media.periodo)
  // V9.1055: el canal de compra de la orden en el nivel de ruptura (verde) y el mínimo de los stops que suben con él (naranja).
  const ord = def.entrada?.orden, nR = ord?.tipo === 'ruptura' ? (typeof ord.nivel?.velas === 'string' ? v[ord.nivel.velas.slice(1)] : ord.nivel?.velas) : null
  if (Number.isInteger(nR)) canales.set(`max|${nR}`, { tipo: 'maxPrevio', n: nR, nombre: `máximo de ${nR} velas`, color: COLOR_MAXIMO, escalera: true })
  // V9.1059: el nivel de cada swing que usa la regla. V9.1062: en tramos horizontales (lib/condiciones/indicadores.js lineasSwing):
  // punteado y tenue de la vela del swing a la confirmación, sólido desde la vela siguiente hasta la rotura o el swing siguiente.
  for (const { lado, L, R } of swingsDe(def, v)) canales.set(`swing|${lado}|${L}|${R}`, { tipo: 'swing', lado, L, R, nombre: `${lado === 'max' ? 'máximo' : 'mínimo'} de swing (${L}/${R})`, color: lado === 'max' ? COLOR_MAXIMO : COLOR_MINIMO })
  for (const s of def.stops || []) if (s.tipo === 'minimoMovil') { const n = typeof s.n === 'string' ? v[s.n.slice(1)] : s.n; if (Number.isInteger(n)) canales.set(`min|${n}`, { tipo: 'minPrevio', n, nombre: `mínimo de ${n} velas`, color: COLOR_MINIMO, escalera: true }) }
  return { medias: [...medias.values()].map((m, k) => ({ ...m, nombre: `${m.tipo} ${m.periodo}`, color: COLORES_MEDIA[k % COLORES_MEDIA.length], discontinua: m.tipo === 'SMA' })), osciladores: [...osc.values()], canales: [...canales.values()] }
}

// Todo lo que se dibuja, del periodo [desde, hasta]:
//   velas, medias [{ nombre, color, discontinua, valores }], osciladores [{ nombre, lineas: [{ nombre, valores }], nivel }],
//   franjas [{ tarjeta: 'filtro' | 'compra' | 'venta' | 'pieza', nombre, color?, cumple: [true | false | null] }], puntosSwing [{ date, lado,
//   precio, confirmado }] (V9.1059), bloqueado [bool] (el filtro no deja comprar),
//   compras [{ date, precio }], ventas [{ date, precio, motivo }], avisos [texto], calentamiento (velas previas pedidas y recibidas).
// velas y referencias: DIARIAS (las de los precios guardados). Con velas semanales (V9.1053) se construyen aquí las semanas, como
// hace el backtest (pages/api/datos.js, lib/velasSemanales.js), para el valor y para el índice del filtro.
export function calculaSenales({ def, valores = {}, velas: diarias, referencias: refDiarias = {}, desde, hasta = null, intervalo = 'diario' }) {
  const semanal = intervalo === 'semanal'
  const velas = semanal ? semanalesDesdeDiarias(diarias) : diarias
  const referencias = semanal ? Object.fromEntries(Object.entries(refDiarias).map(([k, xs]) => [k, semanalesDesdeDiarias(xs || [])])) : refDiarias
  const v = valoresDe(def, valores)
  const nCal = calentamientoDe(def, v, intervalo)
  const corte = recortaConCalentamiento(velas, desde, hasta, nCal)
  const avisos = []
  if (!corte.periodo.length) return { velas: [], medias: [], canales: [], osciladores: [], franjas: [], bloqueado: [], compras: [], ventas: [], avisos: ['No hay velas de este valor en esas fechas.'], calentamiento: { pedidas: nCal, recibidas: 0 } }
  const bars = corte.conCalentamiento, i0 = corte.iDesde, d0 = corte.periodo[0].date, d1 = corte.periodo[corte.periodo.length - 1].date
  if (corte.calentamientoReal < nCal) avisos.push(`Solo hay ${corte.calentamientoReal} de las ${nCal} velas previas que necesita la regla: al principio del periodo puede no decidir.`)
  const r = interpreta(def, bars, v, { referencias })
  const enPeriodo = (d) => d >= d0 && d <= d1
  const compras = r.trades.filter(t => enPeriodo(t.entryDate)).map(t => ({ date: t.entryDate, precio: t.entryPrice }))
  if (r.openPosition && enPeriodo(r.openPosition.entryDate)) compras.push({ date: r.openPosition.entryDate, precio: r.openPosition.entryPrice, abierta: true })
  const ventas = r.trades.filter(t => enPeriodo(t.entryDate) && enPeriodo(t.exitDate)).map(t => ({ date: t.exitDate, precio: t.exitPrice, motivo: t.exitReason }))
  const recorta = (s) => s.slice(i0)
  const { medias, osciladores, canales } = indicadoresDe(def, v)
  const mediasS = medias.map(m => ({ ...m, valores: recorta(media(bars, m.tipo, m.periodo)) }))
  // Los canales: cada uno, una o dos líneas ({ nombre, color, discontinua, escalera, valores }).
  const canalesS = canales.flatMap(k => {
    if (k.tipo === 'bollinger') { const b = bollinger(bars, k.periodo, k.desviaciones); return [{ ...k, nombre: `${k.nombre} · superior`, valores: recorta(b.superior) }, { ...k, nombre: `${k.nombre} · inferior`, valores: recorta(b.inferior) }] }
    if (k.tipo === 'swing') { const l = lineasSwing(bars, k.lado, k.L, k.R); return [{ ...k, nombre: `${k.nombre}, sin confirmar`, color: k.lado === 'max' ? 'rgba(63,185,80,0.55)' : 'rgba(240,136,62,0.55)', punteada: true, segmentos: true, valores: recorta(l.punteada) }, { ...k, nombre: `${k.nombre}, en vigor`, segmentos: true, valores: recorta(l.solida) }] }
    return [{ ...k, valores: recorta(k.tipo === 'maxPrevio' ? maximoPrevio(bars, k.n) : k.tipo === 'minPrevio' ? minimoPrevio(bars, k.n) : maximoHasta(bars, k.n)) }]
  })
  // V9.1059: un punto en la vela de cada swing confirmado del periodo (los máximos arriba, los mínimos abajo).
  const puntosSwing = canales.filter(k => k.tipo === 'swing').flatMap(k => swings(bars, k.lado, k.L, k.R).lista.filter(s => s.v >= i0).map(s => ({ date: bars[s.v].date, lado: k.lado, precio: s.precio, confirmado: bars[s.conf].date })))
  // V9.1055: el stop activo (rojo), solo mientras hay operación abierta: el de su historial (stopHistory), en escalera.
  // V9.1057: y un tramo por operación ([[índice, nivel], …]): el gráfico dibuja cada uno con su propia línea, porque
  // lightweight-charts une los puntos de una serie por encima de los huecos (y dos operaciones seguidas no deben unirse). Solo las
  // operaciones que empiezan en el periodo, como las flechas (una que viene del calentamiento no está en la lista).
  if ((def.stops || []).length) {
    const fechas = corte.periodo.map(x => x.date), st = fechas.map(() => null), tramos = []
    const pinta = (desde, hasta, hist, fijo) => { const h = (hist || []).filter(x => x.stopPx != null).sort((a, b) => a.date.localeCompare(b.date)), tramo = []; fechas.forEach((d, k) => { if (d < desde || d > hasta) return; let x = h.length ? h[0].stopPx : fijo; for (const y of h) if (y.date <= d) x = y.stopPx; st[k] = x ?? null; if (x != null) tramo.push([k, x]) }); if (tramo.length) tramos.push(tramo) }
    for (const t of r.trades) if (enPeriodo(t.entryDate)) pinta(t.entryDate, t.exitDate, t.stopHistory, t.stopPx)
    if (r.openPosition && enPeriodo(r.openPosition.entryDate)) pinta(r.openPosition.entryDate, fechas[fechas.length - 1], null, r.openPosition.stopPx)
    if (st.some(x => x != null)) canalesS.push({ tipo: 'stop', nombre: 'stop activo', color: '#ff7b72', escalera: true, valores: st, tramos })
    // V9.1062: donde el stop activo coincide con el mínimo de swing en vigor, solo el rojo (no dos líneas una encima de otra).
    for (const k of canalesS) if (k.tipo === 'swing' && k.lado === 'min' && !k.punteada) k.valores = k.valores.map((x, j) => x != null && st[j] === x ? null : x)
  }
  const c = precios(bars, 'close')
  const oscS = osciladores.map(o => {
    if (o.tipo === 'rsi') return { ...o, lineas: [{ nombre: o.nombre, valores: recorta(rsi(bars, o.periodo)) }] }
    if (o.tipo === 'macd') { const m = macd(bars, o.rapida, o.lenta, o.senal); return { ...o, nivel: 0, lineas: [{ nombre: 'MACD', valores: recorta(m.linea) }, { nombre: 'Señal', valores: recorta(m.senal) }] } }
    if (o.tipo === 'roc') return { ...o, lineas: [{ nombre: o.nombre, valores: recorta(c.map((x, t) => t >= o.n && x != null && c[t - o.n] != null ? (x / c[t - o.n] - 1) * 100 : null)) }] }
    const a = atr(bars, o.periodo)
    return { ...o, lineas: [{ nombre: o.nombre, valores: recorta(a.map((x, t) => x != null && c[t] != null ? x / c[t] * 100 : null)) }] }
  })
  // Las franjas: cada fila del filtro (las del índice, en sus velas) y de la compra, con lo que hace la fila (con NO o «cruza»).
  const franjas = [], filtro = leeFiltro(def), compra = leeCompra(def)
  const serieFila = (f, quien) => quien && quien !== 'valor'
    ? enReferencia({ id: `senales|${JSON.stringify(envuelve(f))}`, serie: (vs) => serieCond(envuelve(f), vs, v) }, bars, referencias[quien] || [], {})
    : serieCond(envuelve(f), bars, v, {})
  const etiqueta = (f, quien) => `${quien && quien !== 'valor' ? `${quien}: ` : ''}${nombreCond(f.cond.c)}`
  const filtroS = []
  if (filtro.ok) for (const f of filtro.filas) { const s = serieFila(f, f.quien); filtroS.push(s); franjas.push({ tarjeta: 'filtro', nombre: etiqueta(f, f.quien), frase: fraseFila(f, v, {}, f.quien), cumple: recorta(s) }) }
  if (compra.ok) for (const f of compra.filas) franjas.push({ tarjeta: 'compra', nombre: etiqueta(f), frase: fraseFila(f, v), cumple: recorta(serieFila(f)) })
  // V9.1057: y las piezas (docs/builder.md, §23). «Supera el máximo de N velas»: el máximo de la vela supera el de las N anteriores,
  // como la orden en el nivel de ruptura del motor. «Toca el stop»: la vela en que el motor vende por un stop (las salidas por stop
  // son las que traen su nivel, stopPx). «Con operación abierta»: de la compra a la venta, las dos incluidas, como la línea roja.
  // Como las flechas, solo las operaciones que empiezan en el periodo.
  const ord = def.entrada?.orden, conStops = (def.stops || []).length > 0
  if (ord?.tipo === 'ruptura') {
    const n = typeof ord.nivel?.velas === 'string' ? v[ord.nivel.velas.slice(1)] : ord.nivel?.velas
    if (Number.isInteger(n) && n > 0) { const mp = maximoPrevio(bars, n); franjas.push({ tarjeta: 'pieza', nombre: `Supera el máximo de ${n} velas`, frase: `El máximo de la vela supera el máximo de las ${n} velas anteriores (sin contar la actual): ahí compra la orden en el nivel de ruptura si no hay operación abierta.`, cumple: recorta(bars.map((b, k) => mp[k] == null || b.high == null ? null : b.high > mp[k])) }) }
  }
  // V9.1059: la orden en el último máximo de swing («Supera el último máximo de swing»: el máximo de la vela supera el nivel de la
  // orden, el último swing confirmado aún sin superar) y las filas de «Vendo cuando…» con una condición de swing.
  if (ord?.tipo === 'swing') {
    const L = typeof ord.nivel?.izquierda === 'string' ? v[ord.nivel.izquierda.slice(1)] : ord.nivel?.izquierda, R = typeof ord.nivel?.derecha === 'string' ? v[ord.nivel.derecha.slice(1)] : ord.nivel?.derecha
    if (Number.isInteger(L) && Number.isInteger(R)) { const lv = ordenSwing(bars, L, R); franjas.push({ tarjeta: 'pieza', nombre: `Supera el último máximo de swing (${L}/${R})`, frase: 'El máximo de la vela supera el último máximo de swing confirmado que aún no se había superado: ahí compra la orden si no hay operación abierta. Cada swing, una sola vez.', cumple: recorta(bars.map((b, k) => lv[k] != null && b.high != null && b.high > lv[k])) }) }
  }
  const venta = leeVenta(def)
  if (venta.ok) for (const f of venta.filas) if (CONDICIONES_SWING.includes(f.cond.c)) franjas.push({ tarjeta: 'venta', color: '#f0883e', nombre: etiqueta(f), frase: fraseFila(f, v), cumple: recorta(serieFila(f)) })
  if (ord?.tipo === 'ruptura' || ord?.tipo === 'swing' || conStops) {
    const fechasP = corte.periodo.map(x => x.date)
    const ops = r.trades.filter(t => enPeriodo(t.entryDate))
    if (conStops) { const toques = new Set(ops.filter(t => t.stopPx != null).map(t => t.exitDate)); franjas.push({ tarjeta: 'pieza', color: '#ff7b72', nombre: 'Toca el stop', frase: 'La vela en que el precio toca el stop activo y el motor vende.', cumple: fechasP.map(d => toques.has(d)) }) }
    const abiertas = [...ops.map(t => [t.entryDate, t.exitDate]), ...(r.openPosition && enPeriodo(r.openPosition.entryDate) ? [[r.openPosition.entryDate, fechasP[fechasP.length - 1]]] : [])]
    franjas.push({ tarjeta: 'pieza', color: '#3fb950', nombre: 'Con operación abierta', frase: 'De la vela de la compra a la de la venta, las dos incluidas.', cumple: fechasP.map(d => abiertas.some(([a, b]) => d >= a && d <= b)) })
  }
  const bloqueado = filtroS.length ? recorta(Y(...filtroS)).map(x => x !== true) : corte.periodo.map(() => false)
  if (filtro.ok && filtro.filas.some(f => f.quien !== 'valor' && !(referencias[f.quien] || []).length)) avisos.push(`No hay velas de ${filtro.filas.find(f => f.quien !== 'valor').quien}: el filtro no deja comprar nunca.`)
  if (hojas(def).some(x => x.c === 'fuerzaRelativaPercentil')) avisos.push('La fuerza relativa no se puede calcular aquí (necesita todo el Nasdaq-100, que solo tiene el servidor): sus filas salen sin dato y no compra con ellas. En «Backtest de un valor» sí se calcula.')
  return { velas: corte.periodo, medias: mediasS, canales: canalesS, puntosSwing, osciladores: oscS, franjas, bloqueado, compras, ventas, avisos, calentamiento: { pedidas: nCal, recibidas: corte.calentamientoReal },
    ordenEnMaximo: leeOrden(def).modo === 'maximo', ventasCondicion: leeVenta(def).filas.length }
}
