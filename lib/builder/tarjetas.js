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
import { velasNecesarias, conHistoria } from '../editor/historia'
import { CATALOGO, GRUPOS_CATALOGO, AVISO_GRUPO, entradaCatalogo, fichaDe, aplicaA, avisoSoloValor, errorRango, QUE_ES_SWING, NOTA_LINEA_SWING, QUE_ES_SUPERTREND, QUE_ES_LINEA_BAJISTA } from './fichas'

const fmt = (x) => typeof x === 'number' ? String(x).replace('.', ',') : String(x ?? '')
export const aTexto = (v) => typeof v === 'number' ? String(v).replace('.', ',') : (v ?? '')
export const deTexto = (s) => { const t = String(s).trim().replace(',', '.'); return t !== '' && Number.isFinite(Number(t)) ? Number(t) : s }
const sinTildes = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const ref$ = (x) => typeof x === 'string' && x.startsWith('$') ? x.slice(1) : null
const val = (x, valores) => { const r = ref$(x); return r ? valores[r] : x }

// ── El catálogo, por grupos (V9.1047: las entradas y las fichas de cada condición, en lib/builder/fichas.js) ──
// Cada grupo: { id, titulo, aviso?, conds: [claves de las entradas] }. Una condición del catálogo sin entrada va a «Otras» (no
// se pierde ninguna).
export const GRUPOS = (() => {
  const g = GRUPOS_CATALOGO.map(([id, titulo]) => ({ id, titulo, ...(AVISO_GRUPO[id] ? { aviso: AVISO_GRUPO[id] } : {}), conds: CATALOGO.filter(e => e.grupo === id).map(e => e.clave) }))
  const resto = Object.keys(CONDICIONES_EDITOR).filter(c => !CATALOGO.some(e => e.c === c))
  if (resto.length) g.push({ id: 'otras', titulo: 'Otras', conds: resto })
  return g.filter(x => x.conds.length)
})()
// El nombre y la explicación de una entrada del catálogo (o de una condición, por su id).
export const nombreCond = (id) => entradaCatalogo(id)?.nombre || fichaDe(id)?.nombre || CONDICIONES_EDITOR[id]?.nombre || id
export const explicacionCond = (id) => entradaCatalogo(id)?.explicacion || fichaDe(id)?.explicacion || CONDICIONES_EDITOR[id]?.nombre || id
// El buscador (V9.1049), sin tener en cuenta acentos ni mayúsculas («caida» = «Caída»), con el texto entero como una sola búsqueda:
//   grupos: los grupos con las condiciones que lo tienen en el NOMBRE;
//   explicacion: debajo, las que solo lo tienen en su explicación, con el trozo de texto: [{ clave, antes, palabra, despues }]
//   (palabra, tal como está escrita en la explicación, para resaltarla).
// Sin texto: { grupos: GRUPOS, explicacion: [] }.
const plano = (s) => [...String(s || '')].map(ch => sinTildes(ch).charAt(0) || ch).join('')   // un carácter por carácter (las posiciones no cambian)
export function trozoCon(texto, q, ancho = 40) {
  const i = plano(texto).indexOf(q)
  if (i < 0) return null
  const ini = Math.max(0, i - ancho), fin = Math.min(texto.length, i + q.length + ancho)
  return { antes: (ini > 0 ? '…' : '') + texto.slice(ini, i), palabra: texto.slice(i, i + q.length), despues: texto.slice(i + q.length, fin) + (fin < texto.length ? '…' : '') }
}
export function buscaCatalogo(texto) {
  const q = plano(String(texto || '').trim())
  if (!q) return { grupos: GRUPOS, explicacion: [] }
  const enNombre = (id) => plano(nombreCond(id)).includes(q)
  const grupos = GRUPOS.map(g => ({ ...g, conds: g.conds.filter(enNombre) })).filter(g => g.conds.length)
  const explicacion = GRUPOS.flatMap(g => g.conds).filter(id => !enNombre(id)).map(id => ({ clave: id, ...trozoCon(explicacionCond(id), q) })).filter(x => x.palabra)
  return { grupos, explicacion }
}
// Una condición nueva con los defectos del catálogo (sin los opcionales), como la pone el editor de siempre.
export const condNueva = (id) => ({ c: id, p: Object.fromEntries(CONDICIONES_EDITOR[id].parametros.filter(p => !p.opcional).map(p => [p.clave, p.defecto])) })
// La fila nueva de una entrada del catálogo: su condición con los valores de partida de la entrada y, si la lleva, «cruza».
export function filaNueva(clave) {
  const e = entradaCatalogo(clave), c = condNueva(e?.c || clave)
  return { cond: e?.p ? { ...c, p: { ...c.p, ...e.p } } : c, env: e?.env || null }
}
// Las condiciones que no se pueden mirar en un índice (necesitan los datos del valor dentro del Nasdaq-100); vale la entrada o el id.
export const soloDelValor = (id) => aplicaA(entradaCatalogo(id)?.c || id) === 'valor'
export { avisoSoloValor }

// La explicación del «?» de cada condición (con un ejemplo): la de su ficha.
export const AYUDA_COND = Object.freeze(Object.fromEntries(Object.keys(CONDICIONES_EDITOR).map(id => [id, explicacionCond(id)])))
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
// Los índices del selector (V9.1045), en este orden, con su nombre claro, su explicación y desde cuándo hay velas en los precios
// guardados de la app (precios_diarios, la caché que leen los laboratorios; null = no están: el backtest sí los descarga).
// IWM y DIA se añadieron a la caché el 24/10/2026 (scripts/llenaCachePrecios.js --simbolo X --anios 30).
// ^NDX y ^GSPC ya no se ofrecen (son casi iguales que QQQ y SPY); una estrategia que los use los sigue viendo con su nombre.
export const INDICES = Object.freeze([
  { t: 'QQQ', nombre: 'Nasdaq-100 (QQQ)', ayuda: 'QQQ: el fondo que sigue al Nasdaq-100, las 100 mayores empresas no financieras del Nasdaq (mucha tecnología).', desde: '1999-03-10' },
  { t: 'SPY', nombre: 'S&P 500 (SPY)', ayuda: 'SPY: el fondo que sigue al S&P 500, las 500 mayores empresas de EE. UU. Es «el mercado» en general.', desde: '1998-10-19' },
  { t: 'IWM', nombre: 'Pequeñas empresas de EE. UU. (IWM)', ayuda: 'IWM: el fondo que sigue al Russell 2000, unas 2.000 empresas pequeñas de EE. UU.', desde: '2000-05-26' },
  { t: 'DIA', nombre: 'Dow Jones (DIA)', ayuda: 'DIA: el fondo que sigue al Dow Jones, 30 grandes empresas clásicas de EE. UU.', desde: '1998-01-20' },
])
export const INDICES_ANTIGUOS = Object.freeze({
  '^NDX': { nombre: 'Nasdaq-100 (índice ^NDX, sin dividendos)', desde: '1991-10-21' },
  '^GSPC': { nombre: 'S&P 500 (índice ^GSPC, sin dividendos)', desde: '1991-10-21' },
})
export const AYUDA_QUIEN = '«Este valor»: la condición se mira en el valor que se va a comprar. ' + INDICES.map(i => i.ayuda).join(' ') + ' Un filtro de índice solo decide si se puede comprar; no obliga a vender.'
export const nombreQuien = (q) => q === 'valor' ? 'Este valor' : INDICES.find(i => i.t === q)?.nombre || INDICES_ANTIGUOS[q]?.nombre || q
export const inicioDatos = (q) => INDICES.find(i => i.t === q)?.desde ?? INDICES_ANTIGUOS[q]?.desde ?? null
// Las opciones del selector «de quién»: «Este valor», los cuatro índices y, si la estrategia ya usa otro, ese.
export const opcionesQuien = (actual) => ['valor', ...INDICES.map(i => i.t), ...(actual && actual !== 'valor' && !INDICES.some(i => i.t === actual) ? [actual] : [])]
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
  if (ind.length) out.filtroMercado = { ...(def.filtroMercado || {}), ticker: ind[0].quien, si: combina(ind, 'todas') }   // el que había, con sus claves en su orden
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
// V9.1047: la salida k reutiliza la que ya había en ese puesto (solo cambian su condición y su motivo), así se conserva el orden
// de sus claves y darle la vuelta a una fila dos veces deja la definición exactamente como estaba.
export function escribeVenta(def, filas, modo) {
  const sal = def.salidas || [], primera = sal.findIndex(s => s?.tipo === 'condicion'), otras = sal.filter(s => s?.tipo !== 'condicion')
  const viejas = sal.filter(s => s?.tipo === 'condicion')
  const motivo = (f) => f.motivo || 'salida'
  const salida = (k, si, m) => viejas[k] ? { ...viejas[k], si, motivo: m } : { tipo: 'condicion', si, precio: 'apertura', motivo: m }
  const nuevas = !filas.length ? [] : filas.length === 1 || modo !== 'todas'
    ? filas.map((f, k) => salida(k, envuelve(f), motivo(f)))
    : [salida(0, combina(filas, 'todas'), motivo(filas[0]))]
  const en = primera < 0 ? 0 : sal.slice(0, primera).filter(s => s?.tipo !== 'condicion').length
  return { ...def, salidas: [...otras.slice(0, en), ...nuevas, ...otras.slice(en)] }
}

// ── Protección ──
// Los tipos de stop del motor, con su frase y un ejemplo en euros (los del editor de siempre: lib/editor/piezas.js).
export const TIPOS_STOP = Object.freeze([
  { tipo: 'porcentaje', nombre: '% fijo bajo la compra', ejemplo: 'Compras a 100 € con 8 % → vende si baja a 92 €.' },
  { tipo: 'minimoVelas', nombre: 'Mínimo de las últimas N velas', ejemplo: 'Con 3: el precio más bajo de las 3 velas hasta la de la señal; si fue 95 €, vende si baja a 95 €.' },
  { tipo: 'atr', nombre: 'Según la volatilidad (ATR de la vela de la señal)', ejemplo: 'Si suele moverse 3 € por vela (ATR), con 2 veces → vende 6 € por debajo de la compra.' },
  { tipo: 'nivel', nombre: 'Mínimo de la vela de la señal', ejemplo: 'Si la vela de la señal tocó 97 € como mínimo, vende si baja a 97 €.' },
  { tipo: 'trailing', nombre: 'Que sube y nunca baja (trailing)', ejemplo: 'Compras a 100 €; sube a 120 € y una vela cierra bajo su media con mínimo en 112 € → el stop pasa a 112 € y ya no baja.' },
  // V9.1055: las piezas de las Tortugas.
  { tipo: 'atrCompra', nombre: 'Fijo según el ATR de la vela anterior a la compra', ejemplo: 'Compras a 100 €; la vela anterior a la compra tenía un ATR (14) de 3 € → con 2 veces, vende si baja a 94 €. Se calcula una vez y no se mueve.' },
  { tipo: 'minimoMovil', nombre: 'Que sube con el mínimo de las N velas anteriores', ejemplo: 'Con 10: el stop es el precio más bajo de las 10 velas anteriores. Cada vela se vuelve a mirar; si ese mínimo es más alto, el stop sube (nunca baja). Si fue 95 € y luego 98 €, pasa a 98 €.' },
  // V9.1059: el de los swings.
  // V9.1064: el del SuperTrend.
  { tipo: 'supertrend', nombre: 'En la línea del SuperTrend', ejemplo: 'Con SuperTrend (10, 3): compras a 100 € y la línea (verde, por debajo) está en 94 € → stop en 94 €. Cada vela se vuelve a mirar: si la línea sube a 96 €, el stop sube a 96 € (nunca baja).' },
  // V9.1076: el de la vela que cierra bajo la EMA (como el trailing con la EMA y 1 vela, pero solo con las velas de la operación abierta).
  { tipo: 'emaMinimo', nombre: 'En el mínimo de la vela que cierra bajo la EMA (solo sube)', ejemplo: 'Con EMA 10: compras a 100 €; una vela cierra a 104 € con la EMA en 105 € y mínimo 101 € → desde la vela siguiente el stop está en 101 €. Otra cierra bajo la EMA con mínimo 99 € → se queda en 101 € (nunca baja).' },
  { tipo: 'swingMinimo', nombre: 'Bajo el último mínimo de swing confirmado', ejemplo: 'Con swing 2/2: compras a 100 € y el último mínimo de swing confirmado es 96 € → stop en 96 €. Cuando se confirma un mínimo de swing en 99 €, el stop sube a 99 € (nunca baja).' },
])
// Un stop se edita en la casilla si tiene la forma que la casilla sabe enseñar; si no, se ve su frase y se cambia en el Editor clásico.
export function stopEditable(s) {
  if (!s || s.activa !== undefined || s.retiraSiSupera) return false
  if (['porcentaje', 'minimoVelas', 'atr', 'atrCompra', 'minimoMovil', 'swingMinimo', 'supertrend', 'emaMinimo'].includes(s.tipo)) return true
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
  atrCompra: [[['k'], 'Las veces el ATR', { min: 0.01, max: 50 }, 2], [['periodo'], 'Las velas del ATR', { tipo: 'entero', min: 1, max: 200 }, 14]],
  minimoMovil: [[['n'], 'El número de velas', { tipo: 'entero', min: 1, max: 250 }, 10]],
  swingMinimo: [[['izquierda'], 'Las velas a la izquierda del swing', { tipo: 'entero', min: 1, max: 20 }, 2], [['derecha'], 'Las velas a la derecha del swing', { tipo: 'entero', min: 1, max: 20 }, 2]],   // V9.1059
  supertrend: [[['periodo'], 'Las velas del ATR del SuperTrend', { tipo: 'entero', min: 1, max: 200 }, 10], [['k'], 'El multiplicador del SuperTrend', { min: 0.1, max: 20 }, 3]],   // V9.1064
  emaMinimo: [[['periodo'], 'El periodo de la EMA', { tipo: 'entero', min: 1, max: 1000 }, 10]],   // V9.1076
})
const enRuta = (o, ruta) => ruta.reduce((x, c) => x?.[c], o)
export const numeroStop = (s, ruta, valores) => val(enRuta(s, ruta), valores)

// ── Cómo compro (V9.1045) ──
// «apertura»: a la apertura de la vela siguiente a la señal (lo normal). «maximo»: una orden stop de compra en el máximo de la
// vela de la señal (o de las N últimas), que se llena si el precio sube hasta ahí (a la apertura si abre por encima), con su
// ajuste (fijo, baja cada vela al nuevo máximo si es más bajo, o sube) y, si se quiere, una condición que la cancela. Lo demás
// (orden límite, compra al cierre, orden en el mínimo o el cierre) solo en el Editor clásico.
export const AJUSTES = Object.freeze([
  ['fijo', 'se queda en ese precio'],
  ['soloBaja', 'baja cada vela al nuevo máximo, si es más bajo'],
  ['soloSube', 'sube cada vela al nuevo máximo, si es más alto'],
])
export function leeOrden(def) {
  const en = def?.entrada || {}, o = en.orden || {}
  if (!o.tipo || o.tipo === 'apertura') return { ok: !en.cancelar, modo: 'apertura' }
  if (o.tipo === 'ruptura') return { ok: !en.cancelar, modo: 'ruptura', velas: o.nivel?.velas }   // V9.1055
  if (o.tipo === 'supertrend') return { ok: !en.cancelar, modo: 'supertrend', periodo: o.nivel?.periodo, k: o.nivel?.k }   // V9.1067
  if (o.tipo === 'swing') return { ok: !en.cancelar, modo: 'swing', izquierda: o.nivel?.izquierda, derecha: o.nivel?.derecha }   // V9.1059
  if (o.tipo === 'lineaBajista') return { ok: !en.cancelar, modo: 'lineaBajista', izquierda: o.nivel?.izquierda, derecha: o.nivel?.derecha, velas: o.nivel?.velas, siSube: o.nivel?.siSube }   // V9.1076
  if (o.tipo === 'stop' && o.nivel?.campo === 'high') {
    const cancelar = en.cancelar ? filaDe(en.cancelar) : null
    return { ok: !en.cancelar || !!cancelar, modo: 'maximo', velas: o.nivel.velas, ajuste: o.ajuste || 'fijo', cancelar }
  }
  return { ok: false, modo: 'otro' }
}
// Lo mismo que hace el Editor clásico al elegir la orden (components/EditorPanel.js): stop → nivel en el máximo de 1 vela, fijo.
// Volver a «apertura» quita también la cancelación (con la compra a la apertura no hace nada).
export function ponModoOrden(def, modo) {
  const en = { ...(def.entrada || {}) }
  if (modo === 'maximo') en.orden = { tipo: 'stop', nivel: { campo: 'high', velas: 1 }, ajuste: 'fijo' }
  else if (modo === 'ruptura') { en.orden = { tipo: 'ruptura', nivel: { velas: 20 } }; delete en.cancelar }   // V9.1055
  else if (modo === 'swing') { en.orden = { tipo: 'swing', nivel: { izquierda: 2, derecha: 2 } }; delete en.cancelar }
  // V9.1067: en la línea del SuperTrend: con los números del SuperTrend que ya use la estrategia (enlazada), si no 10 y 3.
  else if (modo === 'supertrend') { en.orden = { tipo: 'supertrend', nivel: superTrendDe(def) }; delete en.cancelar }   // V9.1059
  // V9.1076: en la línea de tendencia bajista: con los números de la fila «Rompe la línea de tendencia bajista» si la hay, si no 2/2, 120, unir.
  else if (modo === 'lineaBajista') { en.orden = { tipo: 'lineaBajista', nivel: lineaBajistaDe(def) }; delete en.cancelar }
  else { en.orden = { tipo: 'apertura' }; delete en.cancelar }
  return { ...def, entrada: en }
}
// V9.1067: los números del primer SuperTrend que usa la estrategia (sus filas o el stop), o 10 y 3.
function superTrendDe(def) {
  const s = (def.stops || []).find(x => x?.tipo === 'supertrend'); if (s) return { periodo: s.periodo, k: s.k }
  const busca = (x) => { if (Array.isArray(x)) { for (const y of x) { const r = busca(y); if (r) return r } } else if (x && typeof x === 'object') { if (/^supertrend/.test(x.c || '') && x.p) return { periodo: x.p.periodo, k: x.p.k }; for (const y of Object.values(x)) { const r = busca(y); if (r) return r } } return null }
  return busca([def.entrada?.senal, def.salidas]) || { periodo: 10, k: 3 }
}
// V9.1076: los números de la primera fila «Rompe la línea de tendencia bajista» de la estrategia, o 2/2, 120 y unir.
function lineaBajistaDe(def) {
  const busca = (x) => { if (Array.isArray(x)) { for (const y of x) { const r = busca(y); if (r) return r } } else if (x && typeof x === 'object') { if (x.c === 'rompeLineaBajista' && x.p) return { izquierda: x.p.izquierda ?? 2, derecha: x.p.derecha ?? 2, velas: x.p.velas ?? 120, siSube: x.p.siSube ?? 'unir' }; for (const y of Object.values(x)) { const r = busca(y); if (r) return r } } return null }
  return busca([def.entrada?.senal]) || { izquierda: 2, derecha: 2, velas: 120, siSube: 'unir' }
}
export const ponAjuste = (def, ajuste) => ({ ...def, entrada: { ...def.entrada, orden: { ...def.entrada.orden, ajuste } } })
export const ponVelasOrden = (def, velas) => ({ ...def, entrada: { ...def.entrada, orden: { ...def.entrada.orden, nivel: { ...def.entrada.orden.nivel, velas } } } })
// V9.1059: un número del nivel de la orden (izquierda / derecha de la orden en el último máximo de swing).
export const ponNivelOrden = (def, clave, v) => ({ ...def, entrada: { ...def.entrada, orden: { ...def.entrada.orden, nivel: { ...def.entrada.orden.nivel, [clave]: v } } } })
export const CANCELAR_DEFECTO = Object.freeze({ c: 'precioVsMedia', p: { tipo: 'EMA', periodo: 20, lado: 'debajo' } })
export function ponCancelar(def, fila) {
  const en = { ...def.entrada }
  if (fila) en.cancelar = envuelve(fila); else delete en.cancelar
  return { ...def, entrada: en }
}
// «Los stops y las salidas empiezan a vigilarse»: ya en la vela de la compra (lo de siempre) o desde la siguiente.
export const vigilaDesdeLaCompra = (def) => def?.entrada?.revisaSalidasEnLaVelaDeEntrada !== false
export const ponVigilancia = (def, enLaCompra) => ({ ...def, entrada: { ...def.entrada, revisaSalidasEnLaVelaDeEntrada: enLaCompra ? true : false } })
// La frase de cómo compro (para la regla y la línea de ejecución).
export function fraseCompra(def, valores, malosCancelar = {}) {
  const r = leeOrden(def), o = def?.entrada?.orden || {}
  if (r.modo === 'apertura') return 'Compro y vendo a la apertura de la vela siguiente a la señal.'
  if (r.modo === 'swing') return `Compro en cuanto el precio supera el último máximo de swing (${fmt(val(r.izquierda, valores))}/${fmt(val(r.derecha, valores))}) confirmado (a ese nivel; si la vela abre ya por encima, a la apertura; cada swing, una sola vez). Vendo a la apertura de la vela siguiente a la señal.`
  if (r.modo === 'lineaBajista') return `Compro en cuanto el precio supera la línea de tendencia bajista (swing ${fmt(val(r.izquierda, valores))}/${fmt(val(r.derecha, valores))}, máximos de las ${fmt(val(r.velas, valores))} últimas velas${val(r.siSube, valores) === 'invalidar' ? ', sin línea si el último máximo sube' : ''}): a ese nivel; si la vela abre ya por encima, a la apertura; cada línea, una sola vez. Vendo a la apertura de la vela siguiente a la señal.`   // V9.1076
  if (r.modo === 'supertrend') return `Compro en cuanto el precio toca la línea del SuperTrend (${fmt(val(r.periodo, valores))}, ${fmt(val(r.k, valores))}) mientras está bajista (la roja, por encima del precio): a ese nivel; si la vela abre ya por encima, a la apertura. Vendo a la apertura de la vela siguiente a la señal.`
  if (r.modo === 'ruptura') return `Compro en cuanto el precio supera el máximo de las ${fmt(val(r.velas, valores))} velas anteriores (a ese nivel; si la vela abre ya por encima, a la apertura). Vendo a la apertura de la vela siguiente a la señal.`
  if (r.modo === 'maximo') {
    const n = val(r.velas, valores), donde = n > 1 ? `el máximo de las ${fmt(n)} últimas velas` : 'el máximo de la vela de la señal'
    const aj = AJUSTES.find(([k]) => k === r.ajuste)?.[1] || AJUSTES[0][1]
    const can = r.cancelar ? `; se cancela si ${fraseFila(r.cancelar, valores, malosCancelar)}` : ''
    return `Compro con una orden en ${donde}: compro si el precio llega ahí (si abre por encima, a la apertura); si no llega, la orden ${aj}${can}. Vendo a la apertura de la vela siguiente a la señal.`
  }
  return `Compro ${o.tipo === 'cierre' ? 'al cierre de la vela de la señal' : `con una orden ${o.tipo === 'limite' ? 'límite' : 'stop'} (se ve en el Editor clásico)`} y vendo a la apertura de la vela siguiente a la señal.`
}

// ── Lo que solo se ve en el Editor clásico (opciones de ejecución y piezas raras), en palabras sencillas ──
export function opcionesClasico(def, valores = {}) {
  const out = [], en = def?.entrada || {}, o = en.orden || {}
  const fc = (c) => { try { return fraseCond(c, valores) } catch (_) { return 'una condición' } }
  const lo = leeOrden(def)
  if (o.tipo === 'cierre') out.push('compra al cierre de la vela de la señal, no a la apertura de la siguiente')
  else if (lo.modo === 'otro') out.push(`compra con una orden ${o.tipo === 'stop' ? 'stop' : 'límite'} en ${o.nivel?.campo === 'high' ? 'el máximo' : o.nivel?.campo === 'low' ? 'el mínimo' : 'el cierre'} de ${o.nivel?.velas > 1 ? `las ${o.nivel.velas} últimas velas` : 'la vela de la señal'}, no a la apertura siguiente`)
  if (en.cancelar && !lo.ok) out.push(`la orden de compra se cancela si ${fc(en.cancelar)}`)
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
// Campo: { k: clave del parámetro, tipo: 'num' | 'op' | 'media' | 'opcion' }. 'op' es el símbolo: >, <, ≥, ≤ y «cruza ↑ / ↓».
// La plantilla de cada condición está en su ficha (lib/builder/fichas.js).
export const PLANTILLA_FILA = Object.freeze(Object.fromEntries(Object.keys(CONDICIONES_EDITOR).filter(id => fichaDe(id)?.fila).map(id => [id, fichaDe(id).fila])))
export const plantillaFila = (id) => PLANTILLA_FILA[id] || [nombreCond(id), ...(CONDICIONES_EDITOR[id]?.parametros || []).filter(p => p.clave !== 'comparacion').flatMap(p => [p.etiqueta, { k: p.clave, tipo: p.tipo === 'opcion' ? 'opcion' : 'num' }])]
const tieneComparacion = (id) => (CONDICIONES_EDITOR[id]?.parametros || []).some(p => p.clave === 'comparacion')
export const tieneLado = (id) => (CONDICIONES_EDITOR[id]?.parametros || []).some(p => p.clave === 'lado')
// Las opciones del símbolo: >, < (≥ y ≤ si la condición admite el empate) y cruza ↑ / ↓ (empieza a cumplirse).
export const opcionesOp = (id) => [...(tieneComparacion(id) ? ['>', '<', '≥', '≤'] : ['>', '<']), 'cruza ↑', 'cruza ↓']
// V9.1047: una fila dada la vuelta (NO) no puede ser a la vez «cruza» (la fila solo tiene una envoltura): con NO, los cruces
// del símbolo salen desactivados, y con «cruza», «Darle la vuelta». Antes, elegir «cruza» en una fila con NO le quitaba el NO
// sin decirlo, y al volver a «<» la fila quedaba al revés de como estaba.
export const opDesactivada = (f, op) => f.env === 'NO' && op.startsWith('cruza')
export const opDe = (f) => { const p = f.cond.p || {}; if (f.env === 'cruza' && !p.comparacion) return p.lado === 'debajo' ? 'cruza ↓' : 'cruza ↑'; const ge = p.comparacion === '≥'; return p.lado === 'debajo' ? (ge ? '≤' : '<') : (ge ? '≥' : '>') }
// La fila con otro símbolo. Sin «≥», se quita la comparación (por defecto, «>»). «cruza» pone la envoltura; los demás la quitan
// (salvo NO, que se conserva). En una fila con NO, «cruza» no se puede elegir: la fila no cambia.
export function conOp(f, op) {
  if (opDesactivada(f, op)) return f
  const id = f.cond.c, p = { ...(f.cond.p || {}) }
  p.lado = op === '<' || op === '≤' || op === 'cruza ↓' ? 'debajo' : 'encima'
  if (op === '≥' || op === '≤') p.comparacion = '≥'
  else if (tieneComparacion(id)) delete p.comparacion
  const env = op.startsWith('cruza') ? 'cruza' : f.env === 'cruza' ? null : f.env
  return { ...f, env, cond: { ...f.cond, p } }
}
// Dar o quitar la vuelta (NO), y «solo el día que empieza a cumplirse» para las condiciones sin símbolo. Solo cambian la
// envoltura: la condición es el mismo objeto, así que dos veces seguidas dejan la definición exactamente como estaba. Con la
// otra envoltura puesta no se pueden usar (la fila no cambia; el menú las enseña desactivadas y dice por qué).
export const puedeVuelta = (f) => f.env !== 'cruza'
export const puedeCruce = (f) => f.env !== 'NO'
export const conVuelta = (f) => !puedeVuelta(f) ? f : ({ ...f, env: f.env === 'NO' ? null : 'NO' })
export const conCruce = (f) => !puedeCruce(f) ? f : ({ ...f, env: f.env === 'cruza' ? null : 'cruza' })
// Un número de la fila: si era un '$parámetro', pasa a ser este número fijo (el parámetro no se borra).
export const conNumero = (f, k, v) => ({ ...f, cond: { ...f.cond, p: { ...(f.cond.p || {}), [k]: v } } })

// ── Errores ──
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
// Los errores de una fila: { [clave]: frase } (y '_fila' para lo que no es de un solo campo). El rango es el del catálogo (el
// mismo que comprueba la validación al guardar); qué es cada número y el ejemplo, de la ficha. Un '$parámetro' se comprueba
// también con su rango declarado.
export function erroresFila(f, valores, esquema, quien = 'valor') {
  const id = f.cond.c, d = CONDICIONES_EDITOR[id], p = f.cond.p || {}, out = {}, ficha = fichaDe(id)
  for (const decl of d.parametros) {
    if (decl.tipo === 'opcion') continue
    const ref = ref$(p[decl.clave]), v = val(p[decl.clave], valores)
    const que = ficha?.que?.[decl.clave] || `«${decl.etiqueta}»`, ej = ficha?.ejemplo?.[decl.clave] ?? decl.defecto
    const e = errorRango(que, v, { tipo: decl.tipo, min: decl.min, max: decl.max }, ej)
    if (e) { out[decl.clave] = e; continue }
    const pd = ref && (esquema?.lista || []).find(x => x.nombre === ref)
    if (pd && ((pd.min != null && v < pd.min) || (pd.max != null && v > pd.max))) out[decl.clave] = `${que} tiene que estar entre ${fmt(pd.min)} y ${fmt(pd.max)} (por ejemplo, ${fmt(pd.defecto)}).`
  }
  if (id === 'mediaVsMedia' && !out.periodoRapida && !out.periodoLenta) {
    const r = resuelve(p, valores)
    if (!(r.periodoRapida < r.periodoLenta)) out._fila = 'La media rápida tiene que ser más corta que la lenta (por ejemplo, 10 y 50).'
  }
  if ((id === 'macdSenal' || id === 'macdCero') && !out.rapida && !out.lenta) {
    const r = resuelve(p, valores)
    if (!(r.rapida < r.lenta)) out._fila = 'La media rápida del MACD tiene que ser más corta que la lenta (por ejemplo, 12 y 26).'
  }
  if (quien !== 'valor' && soloDelValor(id)) out._fila = `«${nombreCond(id)}» solo se puede aplicar a este valor: elige «Este valor» en la fila.`
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
// Vale para todas las condiciones con «lado»: en todas, el lado es solo el sentido de la comparación (en la de Bollinger, la
// banda es otro número aparte).
export function efectiva(f, valores) {
  const r = resuelve(f.cond.p || {}, valores)
  const incl = r.comparacion === '≥'
  if (f.env === 'NO' && 'lado' in r) return { r: { ...r, lado: r.lado === 'debajo' ? 'encima' : 'debajo' }, incl: !incl, negada: false }
  return { r, incl, negada: f.env === 'NO' }
}

// ── La nota gris (depende de la tarjeta: filtro, compra, venta o cancelar la orden, y de los números) ──
// intervalo: 'diario' o 'semanal' (el plazo de una media: 20 velas diarias son un mes; 20 semanales, unos 5 meses).
export function notaFila(f, valores, tarjeta = 'compra', intervalo = 'diario') {
  const { r, incl, negada } = efectiva(f, valores), ficha = fichaDe(f.cond.c)
  let s = ''
  try { s = ficha ? ficha.nota(r, { tarjeta, intervalo, negada, incl, bajo: r.lado === 'debajo' }) : (CONDICIONES_EDITOR[f.cond.c]?.nombre || '') } catch (_) { s = '' }
  return f.env === 'cruza' ? `justo la vela en que pasa: ${s}` : s
}
// La explicación del «?» de una fila: la de su condición y, si la lleva, lo que hace «cruza» o NO.
export const ayudaFila = (f) => [explicacionCond(f.cond.c), f.env === 'cruza' ? AYUDA_CRUZA : f.env === 'NO' ? AYUDA_NO : ''].filter(Boolean).join(' ')

// ── La regla en una frase (siempre en velas y sin dobles negaciones) ──
// quien: 'valor' o un ticker (el sujeto de la frase). malos: { clave: true } con los campos que tienen error (salen como «[?]»).
export function fraseFila(f, valores, malos = {}, quien = 'valor') {
  const { r, incl, negada } = efectiva(f, valores), V = quien === 'valor', ficha = fichaDe(f.cond.c)
  const x = { incl, negada, bajo: r.lado === 'debajo', V, S: V ? 'el valor' : quien, n: (k) => malos[k] ? '[?]' : fmt(r[k]),
    el: (nombre, fem = false) => V ? `su ${nombre}` : `${fem ? 'la' : 'el'} ${nombre} de ${quien}`, cierre: V ? 'el cierre' : `el cierre de ${quien}` }
  const s = ficha ? ficha.frase(r, x) : (CONDICIONES_EDITOR[f.cond.c]?.frase(r) || f.cond.c)
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
  if (s.tipo === 'atrCompra') return `un stop fijo a ${n(['k'])} × ATR (${n(['periodo'])}) por debajo de la compra, con el ATR de la vela anterior a la compra`
  if (s.tipo === 'minimoMovil') return `un stop en el mínimo de las ${n(['n'])} velas anteriores, que sube con él y nunca baja`
  if (s.tipo === 'swingMinimo') return `un stop bajo el último mínimo de swing (${n(['izquierda'])}/${n(['derecha'])}) confirmado, que sube con él y nunca baja`
  if (s.tipo === 'supertrend') return `un stop en la línea del SuperTrend (${n(['periodo'])}, ${n(['k'])}), que sube con ella y nunca baja`
  if (s.tipo === 'emaMinimo') return `un stop en el mínimo de cada vela que cierra bajo su EMA de ${n(['periodo'])}, que sube y nunca baja`   // V9.1076
  if (s.tipo === 'nivel') return 'un stop en el mínimo de la vela de la señal'
  return `un stop que sube y nunca baja: cada vez que una vela cierra bajo su ${s.si.p.tipo === 'EMA' ? 'media exponencial' : 'media'} de ${n(['si', 'p', 'periodo'])} velas, pasa al mínimo de ${String(numeroStop(s, ['nivel', 'velas'], valores)) === '1' ? 'esa vela' : `las ${n(['nivel', 'velas'])} últimas velas`}`
}
// Devuelve { texto, partes: [{ tipo, texto }] }: un bloque por tarjeta, en este orden (V9.1049), para pintarlo con la marca de su
// color: 'filtro' (Solo opero cuando…), 'compra' (Compro cuando…), 'orden' (Cómo compro), 'venta' (Vendo cuando…) y 'proteccion'.
// Los bloques vacíos no salen (salvo Protección, que dice «Sin stop ni objetivo.»).
//   filtro, compra, venta: { filas, modo } (el filtro, con quien en cada fila); malos*: por fila; malosProt: erroresProteccion.
export function fraseRegla({ def, filtro = { filas: [] }, compra, venta, prot, valores, malosFiltro = [], malosCompra = [], malosVenta = [], malosProt = { stops: [] }, malosCancelar = {}, fraseCompraClasico = null, fraseFiltroClasico = null }) {
  const partes = [], v = (x) => val(x, valores)
  const ff = filtro.filas.map((f, k) => fraseFila(f, valores, malosFiltro[k] || {}, f.quien))
  if (ff.length) partes.push(['filtro', `Solo opero cuando ${une(ff, 'y')}.`])
  else if (fraseFiltroClasico) partes.push(['filtro', `Solo opero cuando ${fraseFiltroClasico}.`])
  const fc = compra.filas.map((f, k) => fraseFila(f, valores, malosCompra[k] || {}))
  if (fc.length) partes.push(['compra', `Compro cuando ${une(fc, compra.modo === 'alguna' ? 'o' : 'y')}.`])
  else if (fraseCompraClasico) partes.push(['compra', `Compro cuando ${fraseCompraClasico}.`])
  partes.push(['orden', fraseCompra(def, valores, malosCancelar) + (vigilaDesdeLaCompra(def) ? '' : ' Los stops y las salidas se vigilan desde la vela siguiente a la compra.')])
  const fv = venta.filas.map((f, k) => fraseFila(f, valores, malosVenta[k] || {}))
  const n = prot.tiempo.estado === 'velas' ? (malosProt.tiempo ? '[?]' : fmt(v(prot.tiempo.valor))) : null
  const tope = n != null ? `a las ${n} velas` : null
  if (fv.length) partes.push(['venta', `Vendo ${venta.modo === 'todas' && fv.length > 1 ? `cuando ${une(fv, 'y')}` : `en cuanto ${une(fv, 'o')}`}${tope ? `, y como muy tarde ${tope}` : ''}.`])
  else if (tope) partes.push(['venta', `Vendo ${tope}.`])
  const st = prot.stops.map(({ s }, k) => fraseStopTarjeta(s, valores, malosProt.stops[k] || {}))
  if (st.length > 1 && leeModoStops(def) === 'masAlto') st[st.length - 1] += ' (manda el más alto)'
  const ob = prot.objetivo.estado === 'veces' ? `un objetivo de ${malosProt.objetivo ? '[?]' : fmt(v(prot.objetivo.valor))} veces lo que arriesgo` : null
  partes.push(['proteccion', st.length && ob ? `Con ${une(st, 'y')} y ${ob}.` : st.length ? `Con ${une(st, 'y')} y sin objetivo.` : ob ? `Con ${ob}, sin stop.` : 'Sin stop ni objetivo.'])
  return { texto: partes.map(p => p[1]).join(' '), partes: partes.map(([tipo, texto]) => ({ tipo, texto })) }
}
// Las frases de la compra y del filtro cuando no caben en filas (con la frase del editor de siempre).
export function frasesClasico(def, valores, compra = leeCompra(def), filtro = leeFiltro(def)) {
  const f = (c) => { try { return fraseCond(c, valores) } catch (_) { return null } }
  return { fraseCompraClasico: !compra.ok && def?.entrada?.senal ? f(def.entrada.senal) : null,
    fraseFiltroClasico: !filtro.ok && def?.filtroMercado ? `en ${def.filtroMercado.ticker} ${f(def.filtroMercado.si)}` : null }
}
// La regla completa de una definición guardada (la de «Mis estrategias»): lo mismo que «La regla, en una frase» del editor.
// reglaPartes: lo mismo, por bloques (V9.1049), para «Mis estrategias»; si usa opciones del Editor clásico, un bloque 'otro' al final.
export function reglaPartes(def, valores) {
  const compra = leeCompra(def), filtro = leeFiltro(def)
  const r = fraseRegla({ def, filtro: filtro.ok ? filtro : { filas: [] }, compra: compra.ok ? compra : { filas: [] }, venta: leeVenta(def).ok ? leeVenta(def) : { filas: [] }, prot: leeProteccion(def), valores,
    ...frasesClasico(def, valores, compra, filtro) })
  return opcionesClasico(def, valores).length ? [...r.partes, { tipo: 'otro', texto: 'Además usa opciones que se ven en el Editor clásico.' }] : r.partes
}
export const reglaDe = (def, valores) => reglaPartes(def, valores).map(p => p.texto).join(' ')

// ── Comprobación: datos suficientes ──
// Las velas previas que necesita la regla (lib/editor/historia.js: la condición más larga y las ventanas de los stops) frente a
// las que se cargan siempre (lib/periodo.js: velasCalentamiento con las ventanas declaradas, como lib/backtestActivo.js). Si
// necesita más, se cargan solas (conHistoria). Solo falta de verdad si el índice del filtro no tiene velas desde tan atrás en los
// precios guardados de la app (o no está en ellos). desdePeriodo: el inicio del primer periodo de la prueba del paso 2.
const restaDias = (iso, d) => new Date(Date.parse(iso + 'T00:00:00Z') - d * 864e5).toISOString().slice(0, 10)
export function datosSuficientes(def, valores, intervalo = 'diario', desdePeriodo = '2016-01-01') {
  const necesita = velasNecesarias(def, valores)
  const esquema = (() => { try { return esquemaDe(def) } catch (_) { return null } })()
  const base = velasCalentamiento(valores, [], intervalo, esquema ? ventanasDeclaradas(esquema, valores) : null)
  const t = def?.filtroMercado?.ticker || null, conocido = !!t && (INDICES.some(i => i.t === t) || !!INDICES_ANTIGUOS[t])
  const hace = restaDias(desdePeriodo, intervalo === 'semanal' ? necesita * 7 : Math.ceil(necesita * 365.25 / 252) + 7)
  const inicio = t ? inicioDatos(t) : null
  const falta = !conocido ? null : inicio == null ? { ticker: t, sinDatos: true } : inicio > hace ? { ticker: t, hace, tiene: inicio } : null
  return { necesita, base, carga: conHistoria(base, def, valores), ok: necesita <= base, falta, desdePeriodo }
}

// ── Ordenar filas y stops (V9.1049) ──
// Mover el elemento k a la posición destino (0…n−1) de una lista (las filas de una tarjeta o los stops). No cambia nada más.
export function mueve(lista, k, destino) {
  if (k === destino || k < 0 || k >= lista.length) return lista
  const out = [...lista], [x] = out.splice(k, 1)
  out.splice(Math.max(0, Math.min(destino, out.length)), 0, x)
  return out
}
// Lo que cambia el orden, según el motor (docs/builder.md, §15): en el filtro y en la compra, nada (Y / O de tres valores: el
// orden no cuenta); en la venta, «basta con una» son salidas separadas que se miran en orden, todas a la apertura siguiente: el
// mismo día y al mismo precio, solo cambia el motivo anotado si se cumplen dos a la vez; los stops, en su orden (el primero que
// salta cierra la operación, a su precio).
export const ORDEN_IGUAL = 'El orden no cambia el resultado: se miran todas a la vez, al cierre de cada vela.'
export const ORDEN_VENTA = 'El orden no cambia cuándo ni a qué precio se vende: se miran todas al cierre de cada vela. Si se cumplen dos a la vez, se anota el motivo de la primera.'
export const ORDEN_STOPS = 'Se comprueban en este orden; el primero que salta cierra la operación.'
// V9.1055: con varios stops, «manda el más alto» (def.stopsModo = 'masAlto'): en cada vela cuenta solo el mayor.
export const ORDEN_STOPS_MAS_ALTO = 'Manda el más alto: en cada vela cuenta solo el stop más alto; el orden de la lista no importa.'
export const AYUDA_MODO_STOPS = 'Con varios stops: «En su orden» mira cada uno a su nivel, en el orden de la lista, y el primero que se toca cierra la operación. «Manda el más alto» usa en cada vela solo el más alto. Ejemplo: compras a 100 €; el stop por ATR está en 94 € y el mínimo de 10 velas sube a 97 €: con «manda el más alto» el stop activo es 97 €; si una vela baja a 96 €, vende a 97 € (o a la apertura, si abre ya por debajo).'
export const leeModoStops = (def) => def?.stopsModo === 'masAlto' ? 'masAlto' : 'enOrden'
export function ponModoStops(def, modo) { const d = { ...def }; if (modo === 'masAlto') d.stopsModo = 'masAlto'; else delete d.stopsModo; return d }
// Las piezas de las Tortugas en el catálogo (V9.1055): no son condiciones, así que «+» las pone donde van (Cómo compro, Protección).
export const PIEZAS = Object.freeze([
  { id: 'ruptura', nombre: 'Orden en el nivel de ruptura', donde: 'Cómo compro', explicacion: 'Compra en cuanto el precio supera el máximo de las N velas anteriores (sin contar la vela de hoy), sin esperar al cierre. Precio: ese nivel; si la vela abre ya por encima, a la apertura. Las filas de «Compro cuando…» pasan a ser opcionales: sin ninguna, la orden está puesta en cada vela. Ejemplo: con 20, si el máximo de las 20 velas anteriores es 50 € y hoy el precio llega a 50,40 €, compro a 50 €; si hoy abre a 51 €, compro a 51 €.' },
  { id: 'atrCompra', nombre: 'Stop fijo por ATR', donde: 'Protección', explicacion: 'Stop a k veces el ATR (N) por debajo del precio de compra, con el ATR de la vela anterior a la compra (sin mirar el futuro). Se calcula una vez y no se mueve. Ejemplo: compras a 100 €, ATR (14) de la vela anterior 3 €, k = 2 → stop en 94 €.' },
  // V9.1059: las piezas de los swings (grupo «Swings» del catálogo, debajo de sus condiciones).
  { id: 'swing', grupo: 'swings', nombre: 'Orden en el último máximo de swing', donde: 'Cómo compro', explicacion: `Compra en cuanto el máximo de una vela supera el último máximo de swing ya confirmado (sin esperar al cierre). Precio: ese nivel; si la vela abre ya por encima, a la apertura. CADA MÁXIMO DE SWING SE USA UNA SOLA VEZ: si el precio ya lo superó, con compra o sin ella (por ejemplo, porque había una operación abierta o el filtro no dejaba), hay que esperar a un swing nuevo. Ejemplo: con swing 2/2, el último máximo de swing confirmado es 52 €; mañana el precio llega a 52,30 € → compro a 52 €; si abre a 53 €, compro a 53 €. Si vendo días después y el precio vuelve a pasar de 52 €, no compro: espero al siguiente máximo de swing. Las filas de «Compro cuando…» pasan a ser opcionales. ${QUE_ES_SWING} ${NOTA_LINEA_SWING}` },
  { id: 'swingMinimo', grupo: 'swings', nombre: 'Stop bajo el último mínimo de swing confirmado', donde: 'Protección', explicacion: `Stop en el último mínimo de swing ya confirmado. Se recalcula en cada vela con los swings confirmados hasta la anterior y solo puede subir; salta dentro de la vela a su precio, o a la apertura si abre por debajo. Funciona con «Con varios stops: manda el más alto». Ejemplo: con swing 2/2, compras a 100 € y el último mínimo de swing confirmado es 96 € → stop en 96 €; se confirma un mínimo de swing en 99 € → el stop sube a 99 €; si después se confirma uno en 97 €, se queda en 99 €. ${QUE_ES_SWING} ${NOTA_LINEA_SWING}` },
  // V9.1064: la del SuperTrend (grupo «SuperTrend» del catálogo, debajo de sus condiciones).
  { id: 'supertrend', grupo: 'supertrend', nombre: 'Stop en la línea del SuperTrend', donde: 'Protección', explicacion: `Stop en la línea del SuperTrend al cierre de la vela anterior. Se recalcula en cada vela y solo puede subir; salta dentro de la vela a su precio, o a la apertura si abre por debajo. Funciona con «Con varios stops: manda el más alto». Pensado para comprar con el SuperTrend alcista (la línea verde, por debajo del precio): si al comprar está bajista, la línea va por ENCIMA del precio y vende en la apertura siguiente. Ejemplo: con SuperTrend (10, 3), compras a 100 € y la línea está en 94 € → stop en 94 €; al día siguiente la línea sube a 95,50 € → el stop sube a 95,50 €; si la vela siguiente abre a 95 €, vende a 95 € (la apertura). ${QUE_ES_SUPERTREND}` },
  // V9.1076: la orden en la línea de tendencia bajista (grupo «Swings») y el stop de la vela que cierra bajo la EMA.
  { id: 'lineaBajista', grupo: 'swings', nombre: 'Orden en la línea de tendencia bajista', donde: 'Cómo compro', explicacion: `Compra en cuanto el máximo de una vela supera la línea de tendencia bajista vigente al cierre de la vela anterior, prolongada hasta esta vela (sin esperar al cierre). Precio: ese nivel; si la vela abre ya por encima, a la apertura. CADA LÍNEA SE USA UNA SOLA VEZ: si el precio ya la superó, con compra o sin ella, hay que esperar a una línea nueva. Ejemplo: la línea vale 68,33 € hoy y mañana 66,67 €; mañana el precio llega a 67,20 € → compro a 66,67 €; si abre a 68 €, compro a 68 €. Las filas de «Compro cuando…» pasan a ser opcionales (sin ninguna, la orden está puesta en cada línea nueva); no le pongas «Rompe la línea de tendencia bajista» con los mismos números: cuando su cierre la rompe, la orden ya la ha usado. ${QUE_ES_LINEA_BAJISTA} ${QUE_ES_SWING}` },
  { id: 'emaMinimo', nombre: 'Stop en el mínimo de la vela que cierra bajo la EMA', donde: 'Protección', explicacion: 'Con la operación abierta, cada vela que CIERRA por debajo de su EMA de N (10 por defecto) propone su mínimo como stop; desde la vela siguiente el stop es el más alto entre el que había y ese mínimo: nunca baja. Empieza sin stop (ponle también, por ejemplo, el stop en el mínimo de la vela de la señal). Salta dentro de la vela a su precio, o a la apertura si abre por debajo. Funciona con «Con varios stops: manda el más alto». Es la salida de la 1 V50. Ejemplo: Con EMA 10: compras a 100 €; una vela cierra a 104 € con la EMA en 105 € y mínimo 101 € → desde la vela siguiente el stop está en 101 €. Otra cierra bajo la EMA con mínimo 99 € → se queda en 101 € (nunca baja).' },
  { id: 'minimoMovil', nombre: 'Stop en el mínimo de N velas, que sube', explicacion: 'Stop en el mínimo de las N velas anteriores (sin contar la de hoy). Se recalcula en cada vela y solo puede subir. Ejemplo: con 10, si el mínimo de las 10 velas anteriores es 95 € y días después es 98 €, el stop pasa a 98 €; si vuelve a 96 €, se queda en 98 €.', donde: 'Protección' },
])
export const aplicaPieza = (def, id) => id === 'ruptura' || id === 'swing' || id === 'lineaBajista' ? ponModoOrden(def, id) : anadeStopDef(def, id)
// Varias filas de índice: el motor admite un solo índice en el filtro (filtroMercado.ticker); al cambiar el de una fila cambian
// todas. Con dos o más filas de índice, la nota que lo dice junto a cada una (o null).
export function avisoIndices(filas) {
  const ind = (filas || []).filter(f => f.quien !== 'valor')
  return ind.length > 1 ? `Todas las filas de índice tienen que ser del mismo índice (ahora: ${nombreQuien(ind[0].quien)}).` : null
}
export { COMO_FILTRAR_INDICE, GRUPOS_FUERZA } from './fichas'
export const avisoFila = (id) => fichaDe(id)?.aviso || null

// ── V9.1069: combinaciones que nunca compran ──
// Filas de «Compro cuando…» (o de «Solo opero cuando…» del valor, que siempre se suman a la compra) que piden en la vela de la señal
// lo contrario de lo que pide la forma de comprar (lib/editor/interprete.js mira las dos con la vela anterior a la compra):
//   · orden en la línea del SuperTrend (N, M): solo con el SuperTrend (N, M) BAJISTA → «El SuperTrend cambia a alcista» o «está
//     alcista» con los mismos N y M no pueden cumplirse a la vez (con otros números, sí).
//   · orden en el último máximo de swing (L / R): un cierre que supera el último máximo de swing (L / R) ya lo ha superado, y cada swing
//     se usa una vez → «El cierre supera el último máximo de swing» con los mismos L / R nunca compra (0 de 30 años en AAPL, NVDA,
//     SAN.MC y ^GSPC con 6 pares L / R).
//   · «casi nunca»: orden en el último máximo de swing con «El SuperTrend cambia a alcista» (el giro suele llegar con un cierre que ya
//     ha superado el último swing: con 10/3 y swing 2/2, 8 compras posibles en 30 años de AAPL).
// Una fila con «NO» no cuenta. Con «basta con una» en la compra, solo si TODAS sus filas son imposibles. Devuelve
// [{ tarjeta: 'compra' | 'filtro', k, nivel: 'nunca' | 'casi', texto }] (k: el índice de la fila en su tarjeta, como leeFiltro y
// leeCompra); [] si no hay nada que avisar.
const TARJETA_TEXTO = { compra: 'Compro cuando…', filtro: 'Solo opero cuando…' }
export function combinacionesImposibles(def, valores = {}) {
  const o = leeOrden(def)
  if (!o.ok || (o.modo !== 'supertrend' && o.modo !== 'swing' && o.modo !== 'lineaBajista')) return []
  const num = (x) => { const y = typeof x === 'string' && x.startsWith('$') ? valores?.[x.slice(1)] : x; return y == null || y === '' ? null : Number(y) }
  const choca = (f) => {
    if (f.env === 'NO') return null
    const p = f.cond.p || {}, c = f.cond.c
    if (o.modo === 'supertrend' && (c === 'supertrendCambiaAlcista' || c === 'supertrendAlcista') && num(p.periodo) === num(o.periodo) && num(p.k) === num(o.k)) return 'nunca'
    if (o.modo === 'swing' && c === 'cierreSobreSwing' && num(p.izquierda) === num(o.izquierda) && num(p.derecha) === num(o.derecha)) return 'nunca'
    if (o.modo === 'swing' && c === 'supertrendCambiaAlcista') return 'casi'
    // V9.1076: el cierre que rompe la línea ya la ha superado con su máximo (la orden la gasta en esa vela): solo compra si la línea
    // aparece justo en esa vela con el precio ya por encima.
    if (o.modo === 'lineaBajista' && c === 'rompeLineaBajista' && num(p.izquierda) === num(o.izquierda) && num(p.derecha) === num(o.derecha) && num(p.velas) === num(o.velas)) return 'casi'
    return null
  }
  const forma = o.modo === 'supertrend' ? 'la orden en la línea del SuperTrend' : o.modo === 'lineaBajista' ? 'la orden en la línea de tendencia bajista' : 'la orden en el último máximo de swing'
  const texto = (tarjeta, f, nivel) => nivel === 'nunca'
    ? `Esta combinación nunca compra: con esta forma de comprar (${forma}), quita la fila «${nombreCond(f.cond.c)}» de «${TARJETA_TEXTO[tarjeta]}».`
    : o.modo === 'lineaBajista' ? `Esta combinación casi nunca compra: con ${forma}, la vela cuyo cierre rompe la línea ya la ha superado con su máximo, y cada línea se usa una vez. Quita la fila «${nombreCond(f.cond.c)}» de «${TARJETA_TEXTO[tarjeta]}» (la orden ya compra al romperla) o compra a la apertura de la vela siguiente.`
    : `Esta combinación casi nunca compra: con ${forma}, la fila «${nombreCond(f.cond.c)}» casi nunca coincide (el SuperTrend suele girar con un cierre que ya ha superado el último máximo de swing, y cada swing se usa una vez). Quítala de «${TARJETA_TEXTO[tarjeta]}» o usa otra forma de comprar.`
  const out = [], fi = leeFiltro(def), co = leeCompra(def)
  if (fi.ok) fi.filas.forEach((f, k) => { const n = f.quien === 'valor' ? choca(f) : null; if (n) out.push({ tarjeta: 'filtro', k, nivel: n, texto: texto('filtro', f, n) }) })
  if (co.ok && co.filas.length) {
    const ns = co.filas.map(choca)
    if (co.modo !== 'alguna' || ns.every(Boolean)) co.filas.forEach((f, k) => { if (ns[k]) out.push({ tarjeta: 'compra', k, nivel: ns[k], texto: texto('compra', f, ns[k]) }) })
  }
  return out
}
