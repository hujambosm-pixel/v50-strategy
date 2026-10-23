// lib/builder/tarjetas.js — el EDITOR POR TARJETAS del Builder (V9.1043; docs/builder.md, §10). Puro.
// Es otra forma de ver y editar la MISMA definición del editor (lib/editor/definicion.js, formato 1, motor 1): no hay formato,
// motor ni cálculo nuevos. Leer no cambia nada (una estrategia abierta y guardada sin tocar queda idéntica, byte a byte); cada
// cambio de una tarjeta reescribe solo su parte de la definición:
//   · «Compro cuando…»  = entrada.senal: una condición (fila) o Y / O de filas. Por defecto, «todas» (Y).
//   · «Vendo cuando…»   = las salidas «por condición» (a la apertura siguiente): una salida por fila («basta con una»: el motor
//                         sale con la primera que se cumpla) o una sola salida con Y de filas («todas»). Por defecto, basta con una.
//   · «Protección»      = un stop de pérdidas en % (stops), un objetivo en veces el riesgo (salida «objetivo») y la salida por
//                         tiempo en VELAS (salida «tope»: vende a la apertura de la vela N + 1 contando la de entrada).
// Una fila es una condición del catálogo (lib/condiciones/catalogo.js), sola o envuelta en «cruza» (empieza a cumplirse) o «NO».
// Lo que no cabe en las tarjetas (órdenes stop, cancelaciones, filtro de mercado, trailing, combinaciones anidadas…) se ve y se
// cambia en «Avanzado» (los formularios del editor de siempre, components/EditorPanel.js: FormularioDefinicion) y nunca se pierde.
import { CONDICIONES_EDITOR, resuelve, esquemaDe } from '../editor/definicion'
import { velasCalentamiento } from '../periodo'
import { ventanasDeclaradas } from '../parametrosEstrategia'

const fmt = (x) => typeof x === 'number' ? String(x).replace('.', ',') : String(x ?? '')
export const aTexto = (v) => typeof v === 'number' ? String(v).replace('.', ',') : (v ?? '')
export const deTexto = (s) => { const t = String(s).trim().replace(',', '.'); return t !== '' && Number.isFinite(Number(t)) ? Number(t) : s }
const sinTildes = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

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

// ── Filas ──
const esHoja = (c) => !!c && typeof c === 'object' && !!CONDICIONES_EDITOR[c.c]
// { cond, env } o null: env = null (se cumple), 'cruza' (empieza a cumplirse) o 'NO' (no se cumple).
export const filaDe = (c) => esHoja(c) ? { cond: c, env: null } : ((c?.c === 'cruza' || c?.c === 'NO') && esHoja(c.de)) ? { cond: c.de, env: c.c } : null
export const envuelve = (f) => f.env ? { c: f.env, de: f.cond } : f.cond
const combina = (filas, modo) => filas.length === 1 ? envuelve(filas[0]) : { c: modo === 'alguna' ? 'O' : 'Y', de: filas.map(envuelve) }

// Compro: { ok, modo, filas } (ok = cabe en la tarjeta). El modo solo dice algo con dos filas o más.
export function leeCompra(def) {
  const s = def?.entrada?.senal
  if (!s) return { ok: true, modo: null, filas: [] }
  const f = filaDe(s)
  if (f) return { ok: true, modo: null, filas: [f] }
  if ((s.c === 'Y' || s.c === 'O') && Array.isArray(s.de)) { const fs = s.de.map(filaDe); if (fs.length && fs.every(Boolean)) return { ok: true, modo: s.c === 'Y' ? 'todas' : 'alguna', filas: fs } }
  return { ok: false, modo: null, filas: [] }
}
export function escribeCompra(def, filas, modo) {
  const entrada = { ...(def.entrada || { orden: { tipo: 'apertura' } }) }
  if (filas.length) entrada.senal = combina(filas, modo); else delete entrada.senal
  return { ...def, entrada }
}
// Vendo: las salidas por condición. Una fila por salida («basta con una») o una salida con Y / O de filas.
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
// { stop: { estado: 'ninguno' | 'pct' | 'otro', valor }, objetivo: { estado: 'ninguno' | 'veces' | 'otro', valor }, tiempo: { estado: 'ninguno' | 'velas' | 'otro', valor } }
export function leeProteccion(def) {
  const stops = def?.stops || [], sal = def?.salidas || []
  const s0 = stops[0]
  const stop = !stops.length ? { estado: 'ninguno' } : stops.length === 1 && s0?.tipo === 'porcentaje' && s0.activa === undefined && !s0.retiraSiSupera ? { estado: 'pct', valor: s0.pct } : { estado: 'otro' }
  const una = (tipo, campo, estado) => { const xs = sal.filter(s => s?.tipo === tipo); return !xs.length ? { estado: 'ninguno' } : xs.length === 1 && xs[0].activa === undefined ? { estado, valor: xs[0][campo] } : { estado: 'otro' } }
  return { stop, objetivo: una('objetivo', 'multiploR', 'veces'), tiempo: una('tope', 'velas', 'velas') }
}
// valor null = «Ninguno» (quita la pieza). Solo se llaman con la pieza en «ninguno» o en su forma de tarjeta.
export function ponStop(def, valor) {
  if (valor == null) return { ...def, stops: [] }
  const s = (def.stops || [])[0]
  return { ...def, stops: [s?.tipo === 'porcentaje' ? { ...s, pct: valor } : { id: 'inicial', tipo: 'porcentaje', pct: valor, motivo: 'stop', historialAlEntrar: true }] }
}
export function ponSalida(def, tipo, campo, valor) {
  const sal = def.salidas || [], k = sal.findIndex(s => s?.tipo === tipo)
  if (valor == null) return { ...def, salidas: sal.filter((_, j) => j !== k) }
  if (k >= 0) return { ...def, salidas: sal.map((s, j) => j === k ? { ...s, [campo]: valor } : s) }
  return { ...def, salidas: [...sal, { tipo, [campo]: valor, motivo: tipo }] }
}
export const DEFECTO_PROTECCION = Object.freeze({ stop: 8, objetivo: 2, tiempo: 10 })

// ── Lo que solo se ve en Avanzado ──
export function partesAvanzado(def) {
  const out = [], en = def?.entrada || {}, o = en.orden || {}
  if (!leeCompra(def).ok) out.push('La condición de compra combina condiciones de una forma que las tarjetas no pueden enseñar.')
  if (o.tipo && o.tipo !== 'apertura') out.push(o.tipo === 'cierre' ? 'La compra es al cierre de la vela de la señal, no a la apertura siguiente.' : `La compra es con una orden ${o.tipo === 'stop' ? 'stop' : 'límite'} (en un nivel de precio), no a la apertura siguiente.`)
  if (en.cancelar) out.push('La orden de compra se cancela si se cumple una condición.')
  if (en.revisaSalidasEnLaVelaDeEntrada === false) out.push('El día de la entrada no se miran stops ni salidas.')
  if (def?.filtroMercado) out.push(`Filtro de mercado: solo compra si en ${def.filtroMercado.ticker} se cumple una condición.`)
  if (!leeVenta(def).ok) out.push('Las condiciones de venta tienen partes que las tarjetas no pueden enseñar (por ejemplo, una que depende de un parámetro).')
  const p = leeProteccion(def)
  if (p.stop.estado === 'otro') out.push(`Stops: ${(def.stops || []).length} de un tipo que las tarjetas no enseñan (${[...new Set((def.stops || []).map(s => s.tipo))].join(', ')}).`)
  if (p.objetivo.estado === 'otro') out.push('Objetivo de ganancia de un tipo que las tarjetas no enseñan.')
  if (p.tiempo.estado === 'otro') out.push('Salida por tiempo de un tipo que las tarjetas no enseñan.')
  return out
}

// ── Las filas en pantalla: trozos de texto y campos ──
// Campo: { k: clave del parámetro, tipo: 'num' | 'op' | 'media' }. 'op' es el lado (encima / debajo) y, si la condición la tiene,
// la comparación (> o ≥).
export const PLANTILLA_FILA = Object.freeze({
  precioVsMedia: ['Cierre', { k: 'lado', tipo: 'op' }, { k: 'tipo', tipo: 'media' }, '(', { k: 'periodo', tipo: 'num' }, ')'],
  mediaVsMedia: [{ k: 'tipoRapida', tipo: 'media' }, '(', { k: 'periodoRapida', tipo: 'num' }, ')', { k: 'lado', tipo: 'op' }, { k: 'tipoLenta', tipo: 'media' }, '(', { k: 'periodoLenta', tipo: 'num' }, ')'],
  rsiNivel: ['RSI (', { k: 'periodo', tipo: 'num' }, ')', { k: 'lado', tipo: 'op' }, { k: 'umbral', tipo: 'num' }],
  nuevoMaximo: ['Cierre > máximo de las', { k: 'n', tipo: 'num' }, 'velas anteriores'],
  volumenAlto: ['Volumen >', { k: 'k', tipo: 'num' }, '× su media de', { k: 'n', tipo: 'num' }, 'velas'],
  caidaDesdeMaximo: ['Caída ≥', { k: 'pct', tipo: 'num' }, '% desde el máximo de', { k: 'ventana', tipo: 'num' }, 'velas'],
  fuerzaRelativaPercentil: ['Fuerza relativa', { k: 'lado', tipo: 'op' }, 'percentil', { k: 'umbral', tipo: 'num' }],
})
// La plantilla de una condición sin plantilla propia: sus parámetros con su etiqueta.
export const plantillaFila = (id) => PLANTILLA_FILA[id] || [nombreCond(id), ...(CONDICIONES_EDITOR[id]?.parametros || []).filter(p => p.tipo !== 'opcion' || p.clave !== 'comparacion').flatMap(p => [p.etiqueta, { k: p.clave, tipo: p.tipo === 'opcion' ? 'opcion' : 'num' }])]
const tieneComparacion = (id) => (CONDICIONES_EDITOR[id]?.parametros || []).some(p => p.clave === 'comparacion')
// Las opciones del operador: '>' / '<' y, si la condición admite el empate, '≥' / '≤'.
export const opcionesOp = (id) => tieneComparacion(id) ? ['>', '<', '≥', '≤'] : ['>', '<']
export const opDe = (p) => { const ge = p?.comparacion === '≥'; return p?.lado === 'debajo' ? (ge ? '≤' : '<') : (ge ? '≥' : '>') }
// Los parámetros nuevos de una condición al elegir un operador. Sin «≥», se quita la comparación (por defecto, «>»).
export function conOp(id, p, op) {
  const out = { ...p, lado: op === '<' || op === '≤' ? 'debajo' : 'encima' }
  if (op === '≥' || op === '≤') out.comparacion = '≥'
  else if (tieneComparacion(id)) delete out.comparacion
  return out
}

// ── Errores junto a la fila ──
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
// El error de un número: null si vale. decl: { tipo: 'entero' | 'numero', min, max }; ej: el ejemplo válido.
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
// Los errores de una fila: { [clave]: frase } (y '_fila' para lo que no es de un solo campo). valores: los de los parámetros
// de la estrategia (un campo '$nombre' es ese parámetro: se comprueba también su rango declarado).
export function erroresFila(f, valores, esquema) {
  const id = f.cond.c, d = CONDICIONES_EDITOR[id], p = f.cond.p || {}, out = {}
  for (const decl of d.parametros) {
    if (decl.tipo === 'opcion') continue
    const crudo = p[decl.clave], ref = typeof crudo === 'string' && crudo.startsWith('$') ? crudo.slice(1) : null
    const v = ref ? valores[ref] : crudo
    const que = QUE[id]?.[decl.clave] || `«${decl.etiqueta}»`, ej = EJEMPLO[id]?.[decl.clave] ?? decl.defecto
    const e = errorNumero(que, v, { tipo: decl.tipo, min: decl.min, max: decl.max }, ej)
    if (e) { out[decl.clave] = e; continue }
    const pd = ref && (esquema?.lista || []).find(x => x.nombre === ref)
    if (pd && ((pd.min != null && v < pd.min) || (pd.max != null && v > pd.max))) out[decl.clave] = `${que} es el parámetro «${ref}», que admite de ${fmt(pd.min)} a ${fmt(pd.max)} (por ejemplo, ${fmt(pd.defecto)}). Cámbialo aquí o cambia su rango en «Avanzado».`
  }
  if (id === 'mediaVsMedia' && !out.periodoRapida && !out.periodoLenta) {
    const r = resuelve(p, valores)
    if (!(r.periodoRapida < r.periodoLenta)) out._fila = 'La media rápida tiene que ser más corta que la lenta (por ejemplo, 10 y 50).'
  }
  return out
}
export function erroresProteccion(prot, def, valores) {
  const out = {}, v = (x) => typeof x === 'string' && x.startsWith('$') ? valores[x.slice(1)] : x
  if (prot.stop.estado === 'pct') { const e = errorNumero('El stop de pérdidas', v(prot.stop.valor), { min: 0.01, max: 99 }, 8); if (e) out.stop = e.replace('tiene que ser como mucho 99', 'tiene que ser como mucho 99 %') }
  if (prot.objetivo.estado === 'veces') {
    const e = errorNumero('El objetivo', v(prot.objetivo.valor), { min: 0.1, max: 100 }, 2)
    if (e) out.objetivo = e
    else if (!(def.stops || []).length) out.objetivo = 'El objetivo se mide en veces lo que arriesgas hasta el stop: pon también un stop de pérdidas (por ejemplo, 8 %).'
  }
  if (prot.tiempo.estado === 'velas') { const e = errorNumero('El número de velas', v(prot.tiempo.valor), { tipo: 'entero', min: 1, max: 5000 }, 10); if (e) out.tiempo = e }
  return out
}

// ── La nota gris de cada fila ──
export function notaFila(f, valores) {
  const r = resuelve(f.cond.p || {}, valores), arriba = r.lado !== 'debajo'
  const base = {
    precioVsMedia: () => arriba ? 'va por encima de su media: tendencia al alza' : 'va por debajo de su media: tendencia a la baja',
    mediaVsMedia: () => arriba ? 'la media corta va por encima de la larga' : 'la media corta va por debajo de la larga',
    rsiNivel: () => !arriba && r.umbral <= 30 ? `ha caído mucho en ${r.periodo} velas` : arriba && r.umbral >= 70 ? `ha subido mucho en ${r.periodo} velas` : `la fuerza de las últimas ${r.periodo} velas`,
    nuevoMaximo: () => 'rompe su máximo reciente',
    volumenAlto: () => 'se negocia más de lo normal',
    caidaDesdeMaximo: () => 'ha bajado desde su máximo reciente',
    fuerzaRelativaPercentil: () => arriba ? 'está entre los que más suben del Nasdaq-100' : 'está entre los que menos suben del Nasdaq-100',
  }[f.cond.c]
  const t = base ? base() : (CONDICIONES_EDITOR[f.cond.c]?.nombre || '')
  return f.env === 'cruza' ? `justo ese día: ${t}` : f.env === 'NO' ? `al revés: no ${t}` : t
}

// ── La regla en una frase ──
// malos: { fila: { clave: true } } con los campos que tienen error (salen como «[?]»).
export const unidadDe = (intervalo) => intervalo === 'semanal' ? { una: 'semana', varias: 'semanas', mercado: 'semanas', texto: 'velas semanales' } : { una: 'día', varias: 'días', mercado: 'días de mercado', texto: 'velas diarias' }
export function fraseFila(f, valores, intervalo = 'diario', malos = {}) {
  const r = resuelve(f.cond.p || {}, valores), u = unidadDe(intervalo), x = (k) => malos[k] ? '[?]' : fmt(r[k])
  const media = (tipo) => tipo === 'EMA' ? 'media exponencial' : 'media'
  const bajo = r.lado === 'debajo', ge = r.comparacion === '≥'
  const t = {
    precioVsMedia: () => `el valor cierra ${bajo ? 'bajo' : 'sobre'} su ${media(r.tipo)} de ${x('periodo')} ${u.varias}${ge ? ' (o en ella)' : ''}`,
    mediaVsMedia: () => `su ${media(r.tipoRapida)} de ${x('periodoRapida')} ${u.varias} está por ${bajo ? 'debajo' : 'encima'} de su ${media(r.tipoLenta)} de ${x('periodoLenta')} ${u.varias}${ge ? ' (o igual)' : ''}`,
    rsiNivel: () => `su RSI de ${x('periodo')} ${u.varias} ${bajo ? 'baja' : 'sube'} de ${x('umbral')}`,
    nuevoMaximo: () => `el valor cierra por encima del máximo de ${u.varias === 'días' ? 'los' : 'las'} ${x('n')} ${u.varias} anteriores`,
    volumenAlto: () => `su volumen supera ${x('k')} veces su media de ${u.varias === 'días' ? 'los' : 'las'} ${x('n')} ${u.varias} anteriores`,
    caidaDesdeMaximo: () => `el valor ha caído al menos un ${x('pct')} % desde su máximo de ${u.varias === 'días' ? 'los últimos' : 'las últimas'} ${x('ventana')} ${u.varias}`,
    fuerzaRelativaPercentil: () => `su fuerza relativa en el Nasdaq-100 está por ${bajo ? 'debajo' : 'encima'} del percentil ${x('umbral')}`,
  }[f.cond.c]
  const s = t ? t() : (CONDICIONES_EDITOR[f.cond.c]?.frase(r) || f.cond.c)
  return f.env === 'cruza' ? `pasa a cumplirse que ${s}` : f.env === 'NO' ? `no se cumple que ${s}` : s
}
const une = (xs, y) => xs.length <= 1 ? (xs[0] || '') : `${xs.slice(0, -1).join(', ')} ${y} ${xs[xs.length - 1]}`
// compra / venta: { filas, modo }; malosCompra / malosVenta: por fila; prot: leeProteccion; malosProt: { stop, objetivo, tiempo }.
// Devuelve { texto, partes: [{ tipo: 'compra' | 'venta' | 'otro', texto }] } (las partes, para pintar la compra y la venta de su color).
export function fraseRegla({ compra, venta, prot, valores, intervalo = 'diario', malosCompra = [], malosVenta = [], malosProt = {}, avanzado = [], fraseCompraAvanzada = null }) {
  const u = unidadDe(intervalo), v = (x) => typeof x === 'string' && x.startsWith('$') ? valores[x.slice(1)] : x
  const partes = []
  const fc = compra.filas.map((f, k) => fraseFila(f, valores, intervalo, malosCompra[k] || {}))
  if (fc.length) partes.push(['compra', `Compro cuando ${une(fc, compra.modo === 'alguna' ? 'o' : 'y')}.`])
  else if (fraseCompraAvanzada) partes.push(['compra', `Compro cuando ${fraseCompraAvanzada}.`])
  else partes.push(['otro', 'Todavía no hay condición de compra.'])
  const fv = venta.filas.map((f, k) => fraseFila(f, valores, intervalo, malosVenta[k] || {}))
  const n = prot.tiempo.estado === 'velas' ? (malosProt.tiempo ? '[?]' : fmt(v(prot.tiempo.valor))) : null
  const tope = n != null ? `a las ${n} velas (${n} ${u.mercado})` : null
  if (fv.length) partes.push(['venta', `Vendo ${venta.modo === 'todas' && fv.length > 1 ? `cuando ${une(fv, 'y')}` : `en cuanto ${une(fv, 'o')}`}${tope ? `, y como muy tarde ${tope}` : ''}.`])
  else if (tope) partes.push(['venta', `Vendo ${tope}.`])
  const st = prot.stop.estado === 'pct' ? `un stop de pérdidas del ${malosProt.stop ? '[?]' : fmt(v(prot.stop.valor))} %` : null
  const ob = prot.objetivo.estado === 'veces' ? `un objetivo de ${malosProt.objetivo ? '[?]' : fmt(v(prot.objetivo.valor))} veces lo que arriesgas` : null
  partes.push(['otro', prot.stop.estado === 'otro' ? 'Con los stops que se ven en «Avanzado».' : st && ob ? `Con ${st} y ${ob}.` : st ? `Con ${st} y sin objetivo.` : ob ? `Con ${ob}, sin stop.` : 'Sin stop ni objetivo.'])
  if (avanzado.length) partes.push(['otro', 'Además tiene reglas que solo se ven en «Avanzado».'])
  return { texto: partes.map(p => p[1]).join(' '), partes: partes.map(([tipo, texto]) => ({ tipo, texto })) }
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
  for (const c of condiciones({ entrada: def.entrada, stops: def.stops, salidas: def.salidas })) {
    let n = null; try { n = CONDICIONES_EDITOR[c.c].calentamiento(resuelve(c.p, valores)) } catch (_) {}
    if (Number.isFinite(n) && n > necesita) { necesita = n; cual = c }
  }
  const esquema = (() => { try { return esquemaDe(def) } catch (_) { return null } })()
  const carga = velasCalentamiento(valores, [], intervalo, esquema ? ventanasDeclaradas(esquema, valores) : null)
  return { necesita, carga, ok: necesita <= carga, cual }
}
