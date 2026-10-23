// lib/builder/tarjetas.js — el EDITOR POR TARJETAS del Builder (V9.1043, V9.1044; docs/builder.md, §10 y §11). Puro.
// Es otra forma de ver y editar la MISMA definición del editor (lib/editor/definicion.js, formato 1, motor 1): no hay formato,
// motor ni cálculo nuevos. Leer no cambia nada (una estrategia abierta y guardada sin tocar queda idéntica, byte a byte); cada
// cambio de una tarjeta reescribe solo su parte de la definición:
//   · «Solo opero cuando…» = el filtro, lo primero que se mira. Las filas de un índice o ETF (QQQ, SPY…) son el filtro de mercado
//                         (filtroMercado: { ticker, si }: un solo ticker; varias filas = Y). Las de «Este valor» van DELANTE en
//                         entrada.senal: senal = Y(filtro 1, …, filtro n, compra), y diseno.filtrosValor = n dice cuántas son
//                         (diseno no entra en la huella ni en el motor). Así siguen siendo filtro con «al menos una» en la compra.
//   · «Compro cuando…»  = el resto de entrada.senal: una condición (fila) o Y / O de filas. Por defecto, «todas» (Y).
//   · «Vendo cuando…»   = las salidas «por condición» (a la apertura siguiente): una salida por fila («basta con una»: el motor
//                         sale con la primera que se cumpla) o una sola salida con Y de filas («todas»). Por defecto, basta con una.
//   · «Protección»      = los stops (todos los tipos del motor, en su orden), el objetivo en veces el riesgo (salida «objetivo») y
//                         la salida por tiempo en VELAS (salida «tope»: vende a la apertura de la vela N + 1 contando la de entrada).
// Una fila es una condición del catálogo (lib/condiciones/catalogo.js), sola o envuelta en «cruza» (empieza a cumplirse) o «NO»
// (dada la vuelta: se escribe en positivo). Lo que no cabe en las tarjetas (órdenes stop o límite, cancelaciones, piezas que se
// encienden con un parámetro, combinaciones anidadas…) se conserva siempre y se ve en el Editor clásico (la pestaña «Editor»).
import { CONDICIONES_EDITOR, resuelve, esquemaDe, fraseCond, fraseStop } from '../editor/definicion'
import { velasCalentamiento } from '../periodo'
import { ventanasDeclaradas } from '../parametrosEstrategia'
import { anadeStop, cambiaTipoStop } from '../editor/piezas'

const fmt = (x) => typeof x === 'number' ? String(x).replace('.', ',') : String(x ?? '')
export const aTexto = (v) => typeof v === 'number' ? String(v).replace('.', ',') : (v ?? '')
export const deTexto = (s) => { const t = String(s).trim().replace(',', '.'); return t !== '' && Number.isFinite(Number(t)) ? Number(t) : s }
const sinTildes = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const ref$ = (x) => typeof x === 'string' && x.startsWith('$') ? x.slice(1) : null
const val = (x, valores) => { const r = ref$(x); return r ? valores[r] : x }

// ── El catálogo, por grupos (el catálogo no tiene grupos ni descripciones cortas: se ponen aquí) ──
export const NOMBRES = Object.freeze({
  precioVsMedia: { nombre: 'Cierre frente a una media', buscar: 'precio cierre media sma ema tendencia' },
  mediaVsMedia: { nombre: 'Una media frente a otra', buscar: 'media medias cruce sma ema tendencia' },
  caidaDesdeMaximo: { nombre: 'Caída desde el máximo', buscar: 'caida retroceso maximo drawdown precio' },
  rsiNivel: { nombre: 'RSI frente a un nivel', buscar: 'rsi oscilador sobreventa sobrecompra' },
  volumenAlto: { nombre: 'Volumen alto', buscar: 'volumen' },
  nuevoMaximo: { nombre: 'Nuevo máximo de N velas', buscar: 'ruptura maximo breakout nuevo' },
  fuerzaRelativaPercentil: { nombre: 'Fuerza relativa en el Nasdaq-100', buscar: 'fuerza relativa rs mercado nasdaq percentil momentum' },
})
const GRUPOS_BASE = [
  ['precio', 'Precio y medias', ['precioVsMedia', 'mediaVsMedia', 'caidaDesdeMaximo']],
  ['osciladores', 'Osciladores', ['rsiNivel']],
  ['volumen', 'Volumen', ['volumenAlto']],
  ['rupturas', 'Rupturas', ['nuevoMaximo']],
  ['mercado', 'Mercado', ['fuerzaRelativaPercentil']],
]
// Los grupos con las condiciones que existen en el catálogo; una que no esté en ninguno va a «Otras» (no se pierde ninguna).
export const GRUPOS = (() => {
  const g = GRUPOS_BASE.map(([id, titulo, ids]) => ({ id, titulo, conds: ids.filter(c => CONDICIONES_EDITOR[c]) }))
  const resto = Object.keys(CONDICIONES_EDITOR).filter(c => !GRUPOS_BASE.some(([, , ids]) => ids.includes(c)))
  if (resto.length) g.push({ id: 'otras', titulo: 'Otras', conds: resto })
  return g.filter(x => x.conds.length)
})()
export const nombreCond = (id) => NOMBRES[id]?.nombre || CONDICIONES_EDITOR[id]?.nombre || id
// El buscador: los grupos con lo que coincide (por nombre o palabra clave, sin tildes).
export function buscaCatalogo(texto) {
  const q = sinTildes(texto).split(/[\s,]+/).filter(Boolean)
  if (!q.length) return GRUPOS
  const casa = (id) => { const h = sinTildes(`${nombreCond(id)} ${NOMBRES[id]?.buscar || ''} ${CONDICIONES_EDITOR[id]?.nombre || ''}`); return q.some(w => h.includes(w)) }
  return GRUPOS.map(g => ({ ...g, conds: g.conds.filter(casa) })).filter(g => g.conds.length)
}
// Una condición nueva con los defectos del catálogo (sin los opcionales), como la pone el editor de siempre.
export const condNueva = (id) => ({ c: id, p: Object.fromEntries(CONDICIONES_EDITOR[id].parametros.filter(p => !p.opcional).map(p => [p.clave, p.defecto])) })
// Las condiciones que no se pueden mirar en un índice (necesitan los datos del valor dentro del Nasdaq-100).
export const soloDelValor = (id) => !!CONDICIONES_EDITOR[id]?.campo

// La explicación del «?» de cada condición (con un ejemplo).
export const AYUDA_COND = Object.freeze({
  precioVsMedia: 'Compara el cierre de cada vela con la media de los cierres de las últimas N velas. SMA es la media simple; EMA, la exponencial, da más peso a las velas recientes. Ejemplo: «Cierre > SMA (200)» se cumple cuando cierra por encima de la media de sus últimas 200 velas.',
  mediaVsMedia: 'Compara dos medias del cierre: una corta (rápida) y una larga (lenta). Ejemplo: «EMA (10) > EMA (50)» se cumple mientras la media de 10 velas va por encima de la de 50.',
  rsiNivel: 'El RSI mide de 0 a 100 cuánto ha subido frente a cuánto ha bajado en las últimas N velas. Bajo (30 o menos) = ha caído mucho; alto (70 o más) = ha subido mucho. Ejemplo: «RSI (2) < 15» = ha caído con fuerza en las 2 últimas velas.',
  nuevoMaximo: 'Se cumple cuando el cierre supera el precio más alto de las N velas anteriores (sin contar la de hoy). Ejemplo: con 100, rompe el máximo de las 100 velas anteriores.',
  volumenAlto: 'Se cumple cuando el volumen de la vela supera K veces la media del volumen de las N velas anteriores. Ejemplo: con 1,5 y 20, se negocia un 50 % más de lo normal. En índices y algunos ETF el volumen de Yahoo no es fiable.',
  caidaDesdeMaximo: 'Se cumple cuando el cierre está, o ha estado desde el máximo, al menos un X % por debajo del cierre más alto de las últimas N velas, sin haberlo vuelto a superar. Ejemplo: con 10 % y 252, ha caído un 10 % desde su máximo del último año (en velas diarias).',
  fuerzaRelativaPercentil: 'Ordena los valores del Nasdaq-100 por lo que han subido en 12 meses y dice en qué percentil está este: 80 = sube más que el 80 % de los demás. Solo se puede mirar en «Este valor».',
})
export const AYUDA_NO = 'NO da la vuelta a la condición: la fila se cumple justo cuando la condición NO se cumple. La frase y la nota la dicen ya en positivo. Ejemplo: «NO Cierre < EMA (20)» = el cierre está en o por encima de su media exponencial de 20 velas.'
export const AYUDA_CRUZA = '«cruza» se cumple solo en la vela en que la comparación pasa de no cumplirse a cumplirse (no en las siguientes). Ejemplo: «Cierre cruza ↑ EMA (20)» = la vela que cierra por encima de su EMA de 20 después de haber cerrado por debajo.'

// ── Filas ──
const esHoja = (c) => !!c && typeof c === 'object' && !!CONDICIONES_EDITOR[c.c]
// { cond, env } o null: env = null (se cumple), 'cruza' (empieza a cumplirse) o 'NO' (dada la vuelta).
export const filaDe = (c) => esHoja(c) ? { cond: c, env: null } : ((c?.c === 'cruza' || c?.c === 'NO') && esHoja(c.de)) ? { cond: c.de, env: c.c } : null
export const envuelve = (f) => f.env ? { c: f.env, de: f.cond } : f.cond
const combina = (filas, modo) => filas.length === 1 ? envuelve(filas[0]) : { c: modo === 'alguna' ? 'O' : 'Y', de: filas.map(envuelve) }
// Un nodo (una fila o Y / O de filas) como filas: { ok, modo, filas }.
function filasDeNodo(s) {
  if (!s) return { ok: true, modo: null, filas: [] }
  const f = filaDe(s)
  if (f) return { ok: true, modo: null, filas: [f] }
  if ((s.c === 'Y' || s.c === 'O') && Array.isArray(s.de)) { const fs = s.de.map(filaDe); if (fs.length && fs.every(Boolean)) return { ok: true, modo: s.c === 'Y' ? 'todas' : 'alguna', filas: fs } }
  return { ok: false, modo: null, filas: [] }
}

// ── La señal de compra: filtros de «Este valor» + compra ──
const nFiltrosValor = (def) => Number.isInteger(def?.diseno?.filtrosValor) && def.diseno.filtrosValor > 0 ? def.diseno.filtrosValor : 0
// { filtros: [nodos], compra: nodo | undefined, ok }
export function leeSenal(def) {
  const s = def?.entrada?.senal, n = nFiltrosValor(def)
  if (!n) return { filtros: [], compra: s, ok: true }
  if (s?.c === 'Y' && Array.isArray(s.de) && s.de.length === n + 1) return { filtros: s.de.slice(0, n), compra: s.de[n], ok: true }
  if (s?.c === 'Y' && Array.isArray(s.de) && s.de.length === n) return { filtros: s.de, compra: undefined, ok: true }
  if (n === 1 && s && s.c !== 'Y') return { filtros: [s], compra: undefined, ok: true }
  return { filtros: [], compra: s, ok: false }
}
function escribeSenal(def, filtros, compra) {
  const partes = [...filtros, ...(compra ? [compra] : [])]
  const entrada = { ...(def.entrada || { orden: { tipo: 'apertura' } }) }
  if (!partes.length) delete entrada.senal
  else entrada.senal = partes.length === 1 ? partes[0] : { c: 'Y', de: partes }
  const out = { ...def, entrada }, diseno = { ...(def.diseno || {}) }
  if (filtros.length) diseno.filtrosValor = filtros.length; else delete diseno.filtrosValor
  if (Object.keys(diseno).length) out.diseno = diseno; else delete out.diseno
  return out
}
// Compro: { ok, modo, filas } (ok = cabe en la tarjeta). El modo solo dice algo con dos filas o más.
export function leeCompra(def) {
  const s = leeSenal(def)
  return s.ok ? filasDeNodo(s.compra) : { ok: false, modo: null, filas: [] }
}
export function escribeCompra(def, filas, modo) {
  return escribeSenal(def, leeSenal(def).filtros, filas.length ? combina(filas, modo) : undefined)
}

// ── Solo opero cuando… ──
// Las filas del filtro: { quien: ticker | 'valor', cond, env }. Primero las del índice (el filtro de mercado), luego las del valor.
export const INDICES = Object.freeze(['QQQ', 'SPY', '^NDX', '^GSPC', 'IWM', 'DIA'])
export const nombreQuien = (q) => q === 'valor' ? 'Este valor' : ({ '^GSPC': 'S&P 500 (^GSPC)', '^NDX': 'Nasdaq-100 (^NDX)' }[q] || q)
export function leeFiltro(def) {
  const out = [], fm = def?.filtroMercado, s = leeSenal(def)
  if (!s.ok) return { ok: false, filas: [] }
  if (fm) { const r = filasDeNodo(fm.si); if (!r.ok || r.modo === 'alguna') return { ok: false, filas: [] }; out.push(...r.filas.map(f => ({ ...f, quien: fm.ticker }))) }
  for (const n of s.filtros) { const f = filaDe(n); if (!f) return { ok: false, filas: [] }; out.push({ ...f, quien: 'valor' }) }
  return { ok: true, filas: out }
}
// Reescribe el filtro con estas filas (todas tienen que cumplirse). Las del índice usan todas el mismo ticker (el del filtro de
// mercado: el motor admite uno); la compra no se toca.
export function escribeFiltro(def, filas) {
  const ind = filas.filter(f => f.quien !== 'valor'), dv = filas.filter(f => f.quien === 'valor')
  let out = { ...def }
  if (ind.length) out.filtroMercado = { ticker: ind[0].quien, si: combina(ind, 'todas') }
  else delete out.filtroMercado
  return escribeSenal(out, dv.map(envuelve), leeSenal(def).compra)
}
export const cambiaIndice = (filas, ticker) => filas.map(f => f.quien === 'valor' ? f : { ...f, quien: ticker })

// ── Vendo ──
const salidaFila = (s) => s?.tipo === 'condicion' && s.precio === 'apertura' && (s.activa === undefined || s.activa === true)
export function leeVenta(def) {
  const conds = (def?.salidas || []).filter(s => s?.tipo === 'condicion')
  if (!conds.length) return { ok: true, modo: null, filas: [] }
  if (!conds.every(salidaFila)) return { ok: false, modo: null, filas: [] }
  if (conds.length === 1) {
    const s = conds[0], f = filaDe(s.si)
    if (f) return { ok: true, modo: null, filas: [{ ...f, motivo: s.motivo }] }
    if ((s.si?.c === 'Y' || s.si?.c === 'O') && Array.isArray(s.si.de)) { const fs = s.si.de.map(filaDe); if (fs.length && fs.every(Boolean)) return { ok: true, modo: s.si.c === 'Y' ? 'todas' : 'alguna', filas: fs.map((x, k) => k ? x : { ...x, motivo: s.motivo }) } }
    return { ok: false, modo: null, filas: [] }
  }
  const fs = conds.map(s => { const f = filaDe(s.si); return f && { ...f, motivo: s.motivo } })
  return fs.every(Boolean) ? { ok: true, modo: 'alguna', filas: fs } : { ok: false, modo: null, filas: [] }
}
// Las salidas por condición nuevas van donde estaba la primera (el orden de las salidas decide cuál manda en la misma vela).
export function escribeVenta(def, filas, modo) {
  const sal = def.salidas || [], primera = sal.findIndex(s => s?.tipo === 'condicion'), otras = sal.filter(s => s?.tipo !== 'condicion')
  const motivo = (f) => f.motivo || 'salida'
  const nuevas = !filas.length ? [] : filas.length === 1 || modo !== 'todas'
    ? filas.map(f => ({ tipo: 'condicion', si: envuelve(f), precio: 'apertura', motivo: motivo(f) }))
    : [{ tipo: 'condicion', si: combina(filas, 'todas'), precio: 'apertura', motivo: motivo(filas[0]) }]
  const en = primera < 0 ? 0 : sal.slice(0, primera).filter(s => s?.tipo !== 'condicion').length
  return { ...def, salidas: [...otras.slice(0, en), ...nuevas, ...otras.slice(en)] }
}

// ── Protección ──
// Los tipos de stop del motor, con su frase y un ejemplo en euros (los del editor de siempre: lib/editor/piezas.js).
export const TIPOS_STOP = Object.freeze([
  { tipo: 'porcentaje', nombre: '% fijo bajo la compra', ejemplo: 'Compras a 100 € con 8 % → vende si baja a 92 €.' },
  { tipo: 'minimoVelas', nombre: 'Mínimo de las últimas N velas', ejemplo: 'Con 3: el precio más bajo de las 3 velas hasta la de la señal; si fue 95 €, vende si baja a 95 €.' },
  { tipo: 'atr', nombre: 'Según la volatilidad (ATR)', ejemplo: 'Si suele moverse 3 € por vela (ATR), con 2 veces → vende 6 € por debajo de la compra.' },
  { tipo: 'nivel', nombre: 'Mínimo de la vela de la señal', ejemplo: 'Si la vela de la señal tocó 97 € como mínimo, vende si baja a 97 €.' },
  { tipo: 'trailing', nombre: 'Que sube y nunca baja (trailing)', ejemplo: 'Compras a 100 €; sube a 120 € y una vela cierra bajo su media con mínimo en 112 € → el stop pasa a 112 € y ya no baja.' },
])
// Un stop se edita en la casilla si tiene la forma que la casilla sabe enseñar; si no, se ve su frase y se cambia en el Editor clásico.
export function stopEditable(s) {
  if (!s || s.activa !== undefined || s.retiraSiSupera) return false
  if (['porcentaje', 'minimoVelas', 'atr'].includes(s.tipo)) return true
  if (s.tipo === 'nivel') return Array.isArray(s.de) && s.de.length === 1 && s.de[0]?.campo === 'low'
  if (s.tipo === 'trailing') return s.si?.c === 'precioVsMedia' && s.si.p?.lado === 'debajo' && !s.si.p.comparacion && s.nivel?.campo === 'low' && !s.nivel.atr && !s.soloSobreEntrada
  return false
}
// { stops: [{ s, editable }], objetivo: { estado: 'ninguno' | 'veces' | 'otro', valor }, tiempo: { estado: 'ninguno' | 'velas' | 'otro', valor } }
export function leeProteccion(def) {
  const sal = def?.salidas || []
  const una = (tipo, campo, estado) => { const xs = sal.filter(s => s?.tipo === tipo); return !xs.length ? { estado: 'ninguno' } : xs.length === 1 && xs[0].activa === undefined ? { estado, valor: xs[0][campo] } : { estado: 'otro' } }
  return { stops: (def?.stops || []).map(s => ({ s, editable: stopEditable(s) })), objetivo: una('objetivo', 'multiploR', 'veces'), tiempo: una('tope', 'velas', 'velas') }
}
export const ponStops = (def, stops) => ({ ...def, stops })
export const anadeStopDef = (def, tipo) => ponStops(def, anadeStop(def.stops || [], tipo))
export const cambiaTipoStopDef = (def, k, tipo) => ponStops(def, (def.stops || []).map((s, j) => j === k ? cambiaTipoStop(s, tipo, k) : s))
export const quitaStopDef = (def, k) => ponStops(def, (def.stops || []).filter((_, j) => j !== k))
// Un número de un stop: ruta dentro del stop (['pct'], ['si', 'p', 'periodo']…). Un '$parámetro' pasa a ser ese número fijo.
export function ponNumeroStop(def, k, ruta, v) {
  const pon = (o, [c, ...r]) => r.length ? { ...o, [c]: pon(o[c] || {}, r) } : { ...o, [c]: v }
  return ponStops(def, (def.stops || []).map((s, j) => j === k ? pon(s, ruta) : s))
}
export function ponSalida(def, tipo, campo, valor) {
  const sal = def.salidas || [], k = sal.findIndex(s => s?.tipo === tipo)
  if (valor == null) return { ...def, salidas: sal.filter((_, j) => j !== k) }
  if (k >= 0) return { ...def, salidas: sal.map((s, j) => j === k ? { ...s, [campo]: valor } : s) }
  return { ...def, salidas: [...sal, { tipo, [campo]: valor, motivo: tipo }] }
}
export const DEFECTO_PROTECCION = Object.freeze({ objetivo: 2, tiempo: 10 })
// Los números de cada tipo de stop en la casilla: [ruta, qué es, declaración, ejemplo].
export const CAMPOS_STOP_TARJETA = Object.freeze({
  porcentaje: [[['pct'], 'El stop', { min: 0.01, max: 99 }, 8]],
  minimoVelas: [[['n'], 'El número de velas', { tipo: 'entero', min: 1, max: 250 }, 3]],
  atr: [[['k'], 'Las veces el ATR', { min: 0.01, max: 50 }, 2], [['periodo'], 'Las velas del ATR', { tipo: 'entero', min: 1, max: 200 }, 14]],
  nivel: [],
  trailing: [[['si', 'p', 'periodo'], 'El periodo de la media', { tipo: 'entero', min: 1, max: 1000 }, 10], [['nivel', 'velas'], 'El número de velas', { tipo: 'entero', min: 1, max: 250 }, 1]],
})
const enRuta = (o, ruta) => ruta.reduce((x, c) => x?.[c], o)
export const numeroStop = (s, ruta, valores) => val(enRuta(s, ruta), valores)

// ── Lo que solo se ve en el Editor clásico (opciones de ejecución y piezas raras), en palabras sencillas ──
export function opcionesClasico(def, valores = {}) {
  const out = [], en = def?.entrada || {}, o = en.orden || {}
  const fc = (c) => { try { return fraseCond(c, valores) } catch (_) { return 'una condición' } }
  if (o.tipo === 'cierre') out.push('compra al cierre de la vela de la señal, no a la apertura de la siguiente')
  if (o.tipo === 'stop' || o.tipo === 'limite') out.push(`compra con una orden ${o.tipo === 'stop' ? 'stop' : 'límite'} en ${o.nivel?.campo === 'high' ? 'el máximo' : o.nivel?.campo === 'low' ? 'el mínimo' : 'el cierre'} de ${o.nivel?.velas > 1 ? `las ${o.nivel.velas} últimas velas` : 'la vela de la señal'}${o.ajuste === 'soloBaja' ? ', que cada vela baja si puede (nunca sube)' : o.ajuste === 'soloSube' ? ', que solo sube' : ''}, no a la apertura siguiente`)
  if (en.cancelar) out.push(`esa orden se cancela si ${fc(en.cancelar)}`)
  if (en.revisaSalidasEnLaVelaDeEntrada === false) out.push('la vela de la compra no se miran stops ni salidas')
  if (!leeSenal(def).ok || !leeCompra(def).ok) out.push('la condición de compra combina condiciones de una forma que las tarjetas no pueden enseñar')
  if (!leeFiltro(def).ok && leeSenal(def).ok) out.push('el filtro combina condiciones de una forma que las tarjetas no pueden enseñar')
  if (!leeVenta(def).ok) out.push('alguna condición de venta se enciende o se apaga con un parámetro, o combina condiciones de otra forma')
  for (const s of def?.stops || []) if (!stopEditable(s)) { let t = ''; try { t = fraseStop(s, valores) } catch (_) {} out.push(`un stop que solo se ve allí${t ? `: ${t}` : ''}${s.activa !== undefined ? ' (se enciende o se apaga con un parámetro)' : ''}`) }
  const p = leeProteccion(def)
  if (p.objetivo.estado === 'otro') out.push('un objetivo de ganancia que se enciende con un parámetro')
  if (p.tiempo.estado === 'otro') out.push('una salida por tiempo que se enciende con un parámetro')
  return out
}

// ── Las filas en pantalla: trozos de texto y campos ──
// Campo: { k: clave del parámetro, tipo: 'num' | 'op' | 'media' }. 'op' es el símbolo: >, <, ≥, ≤ y «cruza ↑ / ↓».
export const PLANTILLA_FILA = Object.freeze({
  precioVsMedia: ['Cierre', { k: 'lado', tipo: 'op' }, { k: 'tipo', tipo: 'media' }, '(', { k: 'periodo', tipo: 'num' }, ')'],
  mediaVsMedia: [{ k: 'tipoRapida', tipo: 'media' }, '(', { k: 'periodoRapida', tipo: 'num' }, ')', { k: 'lado', tipo: 'op' }, { k: 'tipoLenta', tipo: 'media' }, '(', { k: 'periodoLenta', tipo: 'num' }, ')'],
  rsiNivel: ['RSI (', { k: 'periodo', tipo: 'num' }, ')', { k: 'lado', tipo: 'op' }, { k: 'umbral', tipo: 'num' }],
  nuevoMaximo: ['Cierre > máximo de las', { k: 'n', tipo: 'num' }, 'velas anteriores'],
  volumenAlto: ['Volumen >', { k: 'k', tipo: 'num' }, '× su media de', { k: 'n', tipo: 'num' }, 'velas'],
  caidaDesdeMaximo: ['Caída ≥', { k: 'pct', tipo: 'num' }, '% desde el máximo de', { k: 'ventana', tipo: 'num' }, 'velas'],
  fuerzaRelativaPercentil: ['Fuerza relativa', { k: 'lado', tipo: 'op' }, 'percentil', { k: 'umbral', tipo: 'num' }],
})
export const plantillaFila = (id) => PLANTILLA_FILA[id] || [nombreCond(id), ...(CONDICIONES_EDITOR[id]?.parametros || []).filter(p => p.clave !== 'comparacion').flatMap(p => [p.etiqueta, { k: p.clave, tipo: p.tipo === 'opcion' ? 'opcion' : 'num' }])]
const tieneComparacion = (id) => (CONDICIONES_EDITOR[id]?.parametros || []).some(p => p.clave === 'comparacion')
export const tieneLado = (id) => (CONDICIONES_EDITOR[id]?.parametros || []).some(p => p.clave === 'lado')
// Las opciones del símbolo: >, < (≥ y ≤ si la condición admite el empate) y cruza ↑ / ↓ (empieza a cumplirse).
export const opcionesOp = (id) => [...(tieneComparacion(id) ? ['>', '<', '≥', '≤'] : ['>', '<']), 'cruza ↑', 'cruza ↓']
export const opDe = (f) => { const p = f.cond.p || {}; if (f.env === 'cruza' && !p.comparacion) return p.lado === 'debajo' ? 'cruza ↓' : 'cruza ↑'; const ge = p.comparacion === '≥'; return p.lado === 'debajo' ? (ge ? '≤' : '<') : (ge ? '≥' : '>') }
// La fila con otro símbolo. Sin «≥», se quita la comparación (por defecto, «>»). «cruza» pone la envoltura; los demás la quitan
// (salvo NO, que se conserva).
export function conOp(f, op) {
  const id = f.cond.c, p = { ...(f.cond.p || {}) }
  p.lado = op === '<' || op === '≤' || op === 'cruza ↓' ? 'debajo' : 'encima'
  if (op === '≥' || op === '≤') p.comparacion = '≥'
  else if (tieneComparacion(id)) delete p.comparacion
  const env = op.startsWith('cruza') ? 'cruza' : f.env === 'cruza' ? null : f.env
  return { ...f, env, cond: { ...f.cond, p } }
}
// Dar o quitar la vuelta (NO), y «solo el día que empieza a cumplirse» para las condiciones sin símbolo.
export const conVuelta = (f) => ({ ...f, env: f.env === 'NO' ? null : 'NO' })
export const conCruce = (f) => ({ ...f, env: f.env === 'cruza' ? null : 'cruza' })
// Un número de la fila: si era un '$parámetro', pasa a ser este número fijo (el parámetro no se borra).
export const conNumero = (f, k, v) => ({ ...f, cond: { ...f.cond, p: { ...(f.cond.p || {}), [k]: v } } })

// ── Errores ──
const QUE = Object.freeze({
  precioVsMedia: { periodo: 'El periodo de la media' },
  mediaVsMedia: { periodoRapida: 'El periodo de la media rápida', periodoLenta: 'El periodo de la media lenta' },
  rsiNivel: { periodo: 'El periodo del RSI', umbral: 'El nivel del RSI' },
  nuevoMaximo: { n: 'El número de velas' },
  volumenAlto: { k: 'Las veces la media', n: 'El número de velas de la media' },
  caidaDesdeMaximo: { pct: 'La caída', ventana: 'El número de velas del máximo' },
  fuerzaRelativaPercentil: { umbral: 'El percentil' },
})
const EJEMPLO = Object.freeze({ precioVsMedia: { periodo: 5 }, rsiNivel: { periodo: 2, umbral: 15 } })
export function errorNumero(que, v, decl, ej) {
  const ejemplo = ` (por ejemplo, ${fmt(ej)})`
  if (typeof v !== 'number' || !Number.isFinite(v)) return `${que} tiene que ser un número${ejemplo}.`
  if (decl.tipo === 'entero' && !Number.isInteger(v)) return `${que} tiene que ser un número entero${ejemplo}.`
  const hayMax = decl.max != null && decl.max < 1e6
  if ((decl.min != null && v < decl.min) || (hayMax && v > decl.max)) {
    if (decl.min === 0 && hayMax) return `${que} tiene que estar entre 0 y ${fmt(decl.max)}${ejemplo}.`
    if (decl.min != null && v < decl.min) return `${que} tiene que ser ${fmt(decl.min)} o más${ejemplo}.`
    return `${que} tiene que ser como mucho ${fmt(decl.max)}${ejemplo}.`
  }
  return null
}
// Los errores de una fila: { [clave]: frase } (y '_fila' para lo que no es de un solo campo). Un '$parámetro' se comprueba
// también con su rango declarado.
export function erroresFila(f, valores, esquema, quien = 'valor') {
  const id = f.cond.c, d = CONDICIONES_EDITOR[id], p = f.cond.p || {}, out = {}
  for (const decl of d.parametros) {
    if (decl.tipo === 'opcion') continue
    const ref = ref$(p[decl.clave]), v = val(p[decl.clave], valores)
    const que = QUE[id]?.[decl.clave] || `«${decl.etiqueta}»`, ej = EJEMPLO[id]?.[decl.clave] ?? decl.defecto
    const e = errorNumero(que, v, { tipo: decl.tipo, min: decl.min, max: decl.max }, ej)
    if (e) { out[decl.clave] = e; continue }
    const pd = ref && (esquema?.lista || []).find(x => x.nombre === ref)
    if (pd && ((pd.min != null && v < pd.min) || (pd.max != null && v > pd.max))) out[decl.clave] = `${que} tiene que estar entre ${fmt(pd.min)} y ${fmt(pd.max)} (por ejemplo, ${fmt(pd.defecto)}).`
  }
  if (id === 'mediaVsMedia' && !out.periodoRapida && !out.periodoLenta) {
    const r = resuelve(p, valores)
    if (!(r.periodoRapida < r.periodoLenta)) out._fila = 'La media rápida tiene que ser más corta que la lenta (por ejemplo, 10 y 50).'
  }
  if (quien !== 'valor' && soloDelValor(id)) out._fila = `«${nombreCond(id)}» solo se puede mirar en «Este valor», no en un índice.`
  return out
}
export function erroresProteccion(prot, def, valores) {
  const out = { stops: prot.stops.map(() => ({})) }
  prot.stops.forEach(({ s, editable }, k) => {
    if (!editable) return
    for (const [ruta, que, decl, ej] of CAMPOS_STOP_TARJETA[s.tipo] || []) { const e = errorNumero(que, numeroStop(s, ruta, valores), decl, ej); if (e) out.stops[k][ruta.join('.')] = e }
  })
  if (prot.objetivo.estado === 'veces') {
    const e = errorNumero('El objetivo', val(prot.objetivo.valor, valores), { min: 0.1, max: 100 }, 2)
    if (e) out.objetivo = e
    else if (!(def.stops || []).length) out.objetivo = 'El objetivo necesita un stop: se calcula a partir de lo que arriesgas hasta el stop. Pon un stop de pérdidas o quita el objetivo.'
  }
  if (prot.tiempo.estado === 'velas') { const e = errorNumero('El número de velas', val(prot.tiempo.valor, valores), { tipo: 'entero', min: 1, max: 5000 }, 10); if (e) out.tiempo = e }
  return out
}
export const cuentaErroresProteccion = (e) => e.stops.reduce((a, x) => a + Object.keys(x).length, 0) + (e.objetivo ? 1 : 0) + (e.tiempo ? 1 : 0)

// ── Dada la vuelta, en positivo ──
// La condición efectiva de una fila con NO: el lado contrario y el empate al revés (NO (a < b) = a ≥ b). incl = el empate cuenta.
export function efectiva(f, valores) {
  const r = resuelve(f.cond.p || {}, valores)
  const incl = r.comparacion === '≥'
  if (f.env === 'NO' && 'lado' in r) return { r: { ...r, lado: r.lado === 'debajo' ? 'encima' : 'debajo' }, incl: !incl, negada: false }
  return { r, incl, negada: f.env === 'NO' }
}

// ── La nota gris (depende de la tarjeta: filtro, compra o venta) ──
export function notaFila(f, valores, tarjeta = 'compra') {
  const { r, negada } = efectiva(f, valores), arriba = r.lado !== 'debajo', corta = (n) => n < 50
  const t = {
    precioVsMedia: () => arriba
      ? (tarjeta === 'venta' ? (corta(r.periodo) ? 'ya ha rebotado por encima de su media corta' : 'ha recuperado su media larga') : corta(r.periodo) ? 'va por encima de su media corta' : 'tendencia de fondo al alza')
      : (tarjeta === 'venta' ? 'ha perdido su media: la subida se ha girado' : tarjeta === 'filtro' ? 'tendencia a la baja' : corta(r.periodo) ? 'ha caído bajo su media corta' : 'va por debajo de su media larga'),
    mediaVsMedia: () => arriba ? (tarjeta === 'venta' ? 'la media corta vuelve sobre la larga' : 'la media corta va sobre la larga: tendencia al alza') : (tarjeta === 'venta' ? 'la media corta cae bajo la larga: la tendencia se gira' : 'la media corta va bajo la larga: tendencia a la baja'),
    rsiNivel: () => !arriba && r.umbral <= 30 ? (tarjeta === 'venta' ? 'se ha desplomado' : `ha caído mucho en ${r.periodo} velas`)
      : arriba && r.umbral >= 70 ? (tarjeta === 'venta' ? 'ya ha rebotado con fuerza' : `ha subido mucho en ${r.periodo} velas`)
      : arriba ? 'tiene fuerza' : 'le falta fuerza',
    nuevoMaximo: () => negada ? 'no rompe su máximo reciente' : tarjeta === 'venta' ? 'ha llegado a máximos' : 'rompe su máximo reciente',
    volumenAlto: () => negada ? 'se negocia lo normal o menos' : 'se negocia más de lo normal',
    caidaDesdeMaximo: () => negada ? 'sigue cerca de su máximo' : tarjeta === 'venta' ? 'ha caído desde su máximo' : 'ha retrocedido desde su máximo',
    fuerzaRelativaPercentil: () => arriba ? 'está entre los que más suben del Nasdaq-100' : 'está entre los que menos suben del Nasdaq-100',
  }[f.cond.c]
  const s = t ? t() : (CONDICIONES_EDITOR[f.cond.c]?.nombre || '')
  return f.env === 'cruza' ? `justo la vela en que pasa: ${s}` : s
}

// ── La regla en una frase (siempre en velas y sin dobles negaciones) ──
// quien: 'valor' o un ticker (el sujeto de la frase). malos: { clave: true } con los campos que tienen error (salen como «[?]»).
export function fraseFila(f, valores, malos = {}, quien = 'valor') {
  const { r, incl, negada } = efectiva(f, valores), x = (k) => malos[k] ? '[?]' : fmt(r[k])
  const media = (tipo) => tipo === 'EMA' ? 'media exponencial' : 'media'
  const bajo = r.lado === 'debajo', V = quien === 'valor', S = V ? 'el valor' : quien
  const el = (nombre, fem = false) => V ? `su ${nombre}` : `${fem ? 'la' : 'el'} ${nombre} de ${quien}`
  const cierre = V ? 'el cierre' : `el cierre de ${quien}`
  const t = {
    precioVsMedia: () => incl ? `${cierre} está en o por ${bajo ? 'debajo' : 'encima'} de su ${media(r.tipo)} de ${x('periodo')} velas` : `${S} cierra ${bajo ? 'bajo' : 'sobre'} su ${media(r.tipo)} de ${x('periodo')} velas`,
    mediaVsMedia: () => `${el(`${media(r.tipoRapida)} de ${x('periodoRapida')} velas`, true)} está ${incl ? 'en o ' : ''}por ${bajo ? 'debajo' : 'encima'} de la ${media(r.tipoLenta)} de ${x('periodoLenta')} velas`,
    rsiNivel: () => incl ? `${el(`RSI de ${x('periodo')} velas`)} está en ${x('umbral')} o por ${bajo ? 'debajo' : 'encima'}` : `${el(`RSI de ${x('periodo')} velas`)} ${bajo ? 'baja' : 'sube'} de ${x('umbral')}`,
    nuevoMaximo: () => negada ? `${S} cierra en o por debajo del máximo de las ${x('n')} velas anteriores` : `${S} cierra por encima del máximo de las ${x('n')} velas anteriores`,
    volumenAlto: () => negada ? `${el('volumen')} es como mucho ${x('k')} veces su media de las ${x('n')} velas anteriores` : `${el('volumen')} supera ${x('k')} veces su media de las ${x('n')} velas anteriores`,
    caidaDesdeMaximo: () => negada ? `${S} está a menos de un ${x('pct')} % de su máximo de las últimas ${x('ventana')} velas` : `${S} ha caído al menos un ${x('pct')} % desde su máximo de las últimas ${x('ventana')} velas`,
    fuerzaRelativaPercentil: () => `${el('fuerza relativa en el Nasdaq-100', true)} está ${incl ? 'en o ' : ''}por ${bajo ? 'debajo' : 'encima'} del percentil ${x('umbral')}`,
  }[f.cond.c]
  const s = t ? t() : (CONDICIONES_EDITOR[f.cond.c]?.frase(r) || f.cond.c)
  return f.env === 'cruza' ? `pasa a cumplirse que ${s}` : s
}
const une = (xs, y) => xs.length <= 1 ? (xs[0] || '') : `${xs.slice(0, -1).join(', ')} ${y} ${xs[xs.length - 1]}`
// La frase de un stop (con su nombre de la casilla).
export function fraseStopTarjeta(s, valores, malos = {}) {
  const n = (ruta) => malos[ruta.join('.')] ? '[?]' : fmt(numeroStop(s, ruta, valores))
  if (!stopEditable(s)) { try { return fraseStop(s, valores) } catch (_) { return 'un stop' } }
  if (s.tipo === 'porcentaje') return `un stop de pérdidas del ${n(['pct'])} %`
  if (s.tipo === 'minimoVelas') return `un stop en el mínimo de las ${n(['n'])} últimas velas`
  if (s.tipo === 'atr') return `un stop a ${n(['k'])} veces el ATR de ${n(['periodo'])} velas por debajo de la compra`
  if (s.tipo === 'nivel') return 'un stop en el mínimo de la vela de la señal'
  return `un stop que sube y nunca baja: cada vez que una vela cierra bajo su ${s.si.p.tipo === 'EMA' ? 'media exponencial' : 'media'} de ${n(['si', 'p', 'periodo'])} velas, pasa al mínimo de ${String(numeroStop(s, ['nivel', 'velas'], valores)) === '1' ? 'esa vela' : `las ${n(['nivel', 'velas'])} últimas velas`}`
}
// Devuelve { texto, partes: [{ tipo: 'filtro' | 'compra' | 'venta' | 'otro', texto }] } (las partes, para pintarlas de su color).
//   filtro, compra, venta: { filas, modo } (el filtro, con quien en cada fila); malos*: por fila; malosProt: erroresProteccion.
export function fraseRegla({ def, filtro = { filas: [] }, compra, venta, prot, valores, malosFiltro = [], malosCompra = [], malosVenta = [], malosProt = { stops: [] }, fraseCompraClasico = null, fraseFiltroClasico = null }) {
  const partes = [], v = (x) => val(x, valores)
  const ff = filtro.filas.map((f, k) => fraseFila(f, valores, malosFiltro[k] || {}, f.quien))
  if (ff.length) partes.push(['filtro', `Solo opero cuando ${une(ff, 'y')}.`])
  else if (fraseFiltroClasico) partes.push(['filtro', `Solo opero cuando ${fraseFiltroClasico}.`])
  const fc = compra.filas.map((f, k) => fraseFila(f, valores, malosCompra[k] || {}))
  if (fc.length) partes.push(['compra', `Compro cuando ${une(fc, compra.modo === 'alguna' ? 'o' : 'y')}.`])
  else if (fraseCompraClasico) partes.push(['compra', `Compro cuando ${fraseCompraClasico}.`])
  else partes.push(['otro', 'Todavía no hay condición de compra.'])
  const fv = venta.filas.map((f, k) => fraseFila(f, valores, malosVenta[k] || {}))
  const n = prot.tiempo.estado === 'velas' ? (malosProt.tiempo ? '[?]' : fmt(v(prot.tiempo.valor))) : null
  const tope = n != null ? `a las ${n} velas` : null
  if (fv.length) partes.push(['venta', `Vendo ${venta.modo === 'todas' && fv.length > 1 ? `cuando ${une(fv, 'y')}` : `en cuanto ${une(fv, 'o')}`}${tope ? `, y como muy tarde ${tope}` : ''}.`])
  else if (tope) partes.push(['venta', `Vendo ${tope}.`])
  const o = def?.entrada?.orden || {}
  partes.push(['otro', !o.tipo || o.tipo === 'apertura' ? 'Compro y vendo a la apertura de la vela siguiente a la señal.'
    : `Compro ${o.tipo === 'cierre' ? 'al cierre de la vela de la señal' : `con una orden ${o.tipo === 'stop' ? 'stop' : 'límite'} (se ve en el Editor clásico)`} y vendo a la apertura de la vela siguiente a la señal.`])
  const st = prot.stops.map(({ s }, k) => fraseStopTarjeta(s, valores, malosProt.stops[k] || {}))
  const ob = prot.objetivo.estado === 'veces' ? `un objetivo de ${malosProt.objetivo ? '[?]' : fmt(v(prot.objetivo.valor))} veces lo que arriesgo` : null
  partes.push(['otro', st.length && ob ? `Con ${une(st, 'y')} y ${ob}.` : st.length ? `Con ${une(st, 'y')} y sin objetivo.` : ob ? `Con ${ob}, sin stop.` : 'Sin stop ni objetivo.'])
  return { texto: partes.map(p => p[1]).join(' '), partes: partes.map(([tipo, texto]) => ({ tipo, texto })) }
}
// Las frases de la compra y del filtro cuando no caben en filas (con la frase del editor de siempre).
export function frasesClasico(def, valores, compra = leeCompra(def), filtro = leeFiltro(def)) {
  const f = (c) => { try { return fraseCond(c, valores) } catch (_) { return null } }
  return { fraseCompraClasico: !compra.ok && def?.entrada?.senal ? f(def.entrada.senal) : null,
    fraseFiltroClasico: !filtro.ok && def?.filtroMercado ? `en ${def.filtroMercado.ticker} ${f(def.filtroMercado.si)}` : null }
}
// La regla completa de una definición guardada (la de «Mis estrategias»): lo mismo que «La regla, en una frase» del editor.
export function reglaDe(def, valores) {
  const compra = leeCompra(def), filtro = leeFiltro(def)
  const r = fraseRegla({ def, filtro: filtro.ok ? filtro : { filas: [] }, compra: compra.ok ? compra : { filas: [] }, venta: leeVenta(def).ok ? leeVenta(def) : { filas: [] }, prot: leeProteccion(def), valores,
    ...frasesClasico(def, valores, compra, filtro) })
  return r.texto + (opcionesClasico(def, valores).length ? ' Además usa opciones que se ven en el Editor clásico.' : '')
}

// ── Comprobación: datos suficientes ──
// Las velas previas que necesita la condición más larga (el calentamiento del catálogo) frente a las que carga el backtest
// (lib/periodo.js: velasCalentamiento con las ventanas declaradas, como lib/backtestActivo.js).
function condiciones(x, out = []) {
  if (Array.isArray(x)) x.forEach(y => condiciones(y, out))
  else if (x && typeof x === 'object') { if (CONDICIONES_EDITOR[x.c] && x.p) out.push(x); for (const [k, y] of Object.entries(x)) if (k !== 'p') condiciones(y, out) }
  return out
}
export function datosSuficientes(def, valores, intervalo = 'diario') {
  let necesita = 0, cual = null
  for (const c of condiciones({ entrada: def.entrada, stops: def.stops, salidas: def.salidas, filtroMercado: def.filtroMercado })) {
    let n = null; try { n = CONDICIONES_EDITOR[c.c].calentamiento(resuelve(c.p, valores)) } catch (_) {}
    if (Number.isFinite(n) && n > necesita) { necesita = n; cual = c }
  }
  const esquema = (() => { try { return esquemaDe(def) } catch (_) { return null } })()
  const carga = velasCalentamiento(valores, [], intervalo, esquema ? ventanasDeclaradas(esquema, valores) : null)
  return { necesita, carga, ok: necesita <= carga, cual }
}
