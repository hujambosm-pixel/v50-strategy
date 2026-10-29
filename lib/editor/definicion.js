// lib/editor/definicion.js — la DEFINICIÓN de una estrategia del editor visual (docs/editor-visual.md, E1): formato,
// validación, valores de los parámetros, huella, frase en castellano y la declaración de parámetros (la de run.parametros).
// Puro. La ejecuta lib/editor/interprete.js.
//
// FORMATO 1 (una estrategia de un activo; lo que hoy hace un code_js):
// {
//   tipo: 'editor', formato: 1, motor: 1, nombre, descripcion?,
//   parametros: { version: 1, lista: [...], restricciones?: [...], alias?: {} }      // el mismo formato que run.parametros
//   entrada: {
//     senal: Cond,                      // al cierre de la vela anterior, sin orden viva ni posición (con 'ruptura' o 'swing', opcional)
//     orden: { tipo: 'apertura' | 'cierre' | 'stop' | 'limite' | 'ruptura' | 'swing',
//              nivel?: { campo: 'high' | 'low' | 'close', velas: N },   // stop: el máximo de las N últimas cerradas; límite: el mínimo
//              ajuste?: 'fijo' | 'soloBaja' | 'soloSube' },             // cómo se mueve el nivel mientras la orden sigue viva
//              'ruptura' (V9.1055): { nivel: { velas: N } }: en cada vela sin posición (y con la señal, si la hay, y el filtro al
//              cierre de la anterior), compra en cuanto el máximo de la vela SUPERA el máximo de las N velas anteriores (sin
//              contar la actual): a ese nivel, o a la apertura si abre ya por encima. El nivel se rehace en cada vela.
//              'swing' (V9.1059): { nivel: { izquierda: L, derecha: R } }: compra en cuanto el máximo de la vela SUPERA el último
//              máximo de swing confirmado hasta el cierre de la anterior (a ese nivel, o a la apertura si abre ya por encima).
//              Cada swing se usa una vez: si el precio ya lo superó (con o sin compra), hasta el swing siguiente no hay orden.
//              'supertrend' (V9.1067): { nivel: { periodo: N, k: M } }: con el SuperTrend (N, M) bajista al cierre de la vela anterior,
//              compra en cuanto el máximo de la vela TOCA su línea (la de arriba, la roja): a ese nivel, o a la apertura si abre ya
//              por encima. Con el SuperTrend alcista no hay orden. Se rehace en cada vela.
//              'lineaBajista' (V9.1076): { nivel: { izquierda: L, derecha: R, velas: N, siSube: 'unir' | 'invalidar' } }: compra en
//              cuanto el máximo de la vela SUPERA la línea de tendencia bajista vigente al cierre de la anterior (la de la condición
//              «rompeLineaBajista», lib/condiciones/indicadores.js lineaBajista), proyectada a la vela: a ese nivel, o a la apertura si
//              abre ya por encima. Cada línea se usa una vez (con o sin compra).
//     cancelar?: Cond,                  // con la orden viva, al cierre de la vela anterior
//     revisaSalidasEnLaVelaDeEntrada?: true,   // ¿se miran stops y salidas el mismo día de la entrada? (por defecto, sí)
//   },
//   stops: [Stop, ...],                 // en el orden en que se comprueban
//   stopsModo?: 'masAlto',              // V9.1055: con varios stops manda el más alto (el stop activo es el mayor de sus niveles)
//   salidas: [Salida, ...],             // después de los stops
//   filtroMercado?: { ticker, si: Cond },   // otro ticker (QQQ, SPY…) con una condición del catálogo que lo admite
//   diseno?: { ... },                   // el dibujo (posiciones, colores): NO entra en la huella
// }
// Cond = { c: <id del catálogo>, p: { ... } } | { c: 'Y' | 'O', de: [Cond, ...] } | { c: 'NO' | 'cruza', de: Cond }
//      | { c: 'histeresis', entra: Cond, sale: Cond }.     Un valor '$nombre' es el parámetro de la estrategia.
// Stop: { id, tipo, motivo, activa?, historialAlEntrar?, retiraSiSupera?, ... } según el tipo:
//   · 'nivel'      { de: [Expr, ...] }: el MÍNIMO de las expresiones en la vela que fija la orden (la de la señal y cada vela
//                  que la mueve). Expr = { campo: 'low' | 'high' | 'close' } | { media: { tipo, periodo } }.
//   · 'minimoVelas' { n }: el mínimo de las n velas que acaban en la de la señal.
//   · 'porcentaje' { pct }: el precio de entrada − pct %.
//   · 'atr'        { k, periodo }: el precio de entrada − k × ATR de la vela de la señal.
//   · 'atrCompra'  { k, periodo } (V9.1055): el precio de compra − k × ATR de la vela ANTERIOR a la compra; fijo.
//   · 'minimoMovil' { n } (V9.1055): el mínimo de las n velas anteriores (sin la actual), recalculado en cada vela; solo sube.
//   · 'swingMinimo' { izquierda, derecha } (V9.1059): el último mínimo de swing confirmado hasta el cierre de la vela anterior,
//                  recalculado en cada vela; solo sube.
//   · 'supertrend' { periodo, k } (V9.1064): la línea del SuperTrend (ATR de Wilder de `periodo` velas, multiplicador k) al cierre de
//                  la vela anterior, recalculada en cada vela; solo sube.
//   · 'emaMinimo'  { periodo } (V9.1076): con la operación abierta, cada vela que CIERRA bajo su EMA de `periodo` propone su mínimo;
//                  desde la vela siguiente el stop es el mayor entre el actual y ese mínimo (solo sube; empieza vacío). Como el
//                  'trailing' con la EMA y 1 vela, pero solo con las velas de la operación abierta (V9.1079: el 'trailing' ya también se
//                  mueve con «manda el más alto»).
//   · 'trailing'   { si: Cond, nivel: { campo: 'low', velas: N } | { atr: { k, periodo } }, soloSobreEntrada?, historial:
//                  'cadaVez' | 'siSube', fechaHistorial: 'vela' | 'anterior' }: cuando `si` se cumple al cierre de la vela
//                  anterior, el stop pasa a ese nivel (el mínimo de las N anteriores; o cierre − k × ATR), nunca hacia abajo.
// Salida: { tipo: 'condicion', si: Cond, precio: 'apertura', motivo, activa? }   // a la apertura de la vela siguiente
//       | { tipo: 'objetivo', multiploR, motivo }   // entrada + multiploR × (entrada − el stop inicial)
//       | { tipo: 'tope', velas, motivo }            // a la apertura de la vela N + 1 contando desde la de entrada
// activa: true | false | '$parametro' (sí / no) | { param, igual }.
import { CONDICIONES_NIVEL, CONDICIONES_UNIVERSO } from '../condiciones/catalogo'
import { normalizaParametros, validaCombinacion } from '../parametrosEstrategia'
import { jsonCanonico, sha256Hex } from '../lotesLab'

export const FORMATO = 1
export const MOTOR = 1
export const CONDICIONES_EDITOR = Object.freeze({ ...CONDICIONES_NIVEL, ...CONDICIONES_UNIVERSO })
const COMBINADORES = ['Y', 'O', 'NO', 'cruza', 'histeresis']
const TIPOS_ORDEN = ['apertura', 'cierre', 'stop', 'limite', 'ruptura', 'swing', 'supertrend', 'lineaBajista']
const TIPOS_STOP = ['nivel', 'minimoVelas', 'porcentaje', 'atr', 'trailing', 'atrCompra', 'minimoMovil', 'swingMinimo', 'supertrend', 'emaMinimo']
// V9.1059: con la orden en el nivel de ruptura o en el último máximo de swing, la señal es opcional (sin ella, la orden está puesta).
export const ordenSinSenal = (o) => o?.tipo === 'ruptura' || o?.tipo === 'swing' || o?.tipo === 'supertrend' || o?.tipo === 'lineaBajista'   // V9.1067: y en la línea del SuperTrend; V9.1076: y en la bajista
const TIPOS_SALIDA = ['condicion', 'objetivo', 'tope']
const CAMPOS = ['low', 'high', 'close']
const fmt = (x) => String(x).replace('.', ',')
const entero = (x, min = 1, max = 2000) => Number.isInteger(x) && x >= min && x <= max
const numero = (x, min = 0, max = 1e6) => typeof x === 'number' && Number.isFinite(x) && x >= min && x <= max

// ── Parámetros ──
// La declaración normalizada (la de lib/parametrosEstrategia.js) o null.
export const esquemaDe = (def) => def?.parametros ? normalizaParametros(def.parametros) : null
// Los valores: los defectos de la declaración con los guardados encima (solo los que declara).
export function valoresDe(def, guardados = {}) {
  const e = esquemaDe(def), v = {}
  for (const p of e?.lista || []) v[p.nombre] = Object.prototype.hasOwnProperty.call(guardados || {}, p.nombre) ? guardados[p.nombre] : p.defecto
  return v
}
// Un valor con '$nombre' sustituido (en profundidad).
export function resuelve(x, valores) {
  if (typeof x === 'string' && x.startsWith('$')) return valores[x.slice(1)]
  if (Array.isArray(x)) return x.map(y => resuelve(y, valores))
  if (x && typeof x === 'object') return Object.fromEntries(Object.entries(x).map(([k, y]) => [k, resuelve(y, valores)]))
  return x
}
// ¿Está activa una pieza (stop o salida)?
export function activa(a, valores) {
  if (a === undefined || a === true) return true
  if (a === false) return false
  if (typeof a === 'string' && a.startsWith('$')) return valores[a.slice(1)] === true
  if (a && typeof a === 'object' && a.param) return valores[a.param] === a.igual
  return false
}
// Los '$nombre' de un objeto (para comprobar que existen).
const referencias = (x, out = []) => { if (typeof x === 'string' && x.startsWith('$')) out.push(x.slice(1)); else if (Array.isArray(x)) x.forEach(y => referencias(y, out)); else if (x && typeof x === 'object') Object.values(x).forEach(y => referencias(y, out)); return out }

// ── Condiciones ──
export function validaCond(c, valores, donde = 'condición') {
  const e = []
  if (!c || typeof c !== 'object') return [`${donde}: falta.`]
  if (COMBINADORES.includes(c.c)) {
    if (c.c === 'Y' || c.c === 'O') { if (!Array.isArray(c.de) || c.de.length < 2) e.push(`${donde}: «${c.c}» necesita al menos dos condiciones.`); else c.de.forEach((x, k) => e.push(...validaCond(x, valores, `${donde} › ${k + 1}`))) }
    else if (c.c === 'histeresis') { e.push(...validaCond(c.entra, valores, `${donde} › entra`), ...validaCond(c.sale, valores, `${donde} › sale`)) }
    else e.push(...validaCond(c.de, valores, `${donde} › ${c.c}`))
    return e
  }
  const d = CONDICIONES_EDITOR[c.c]
  if (!d) return [`${donde}: «${c.c}» no es una condición del catálogo.`]
  e.push(...d.valida(resuelve(c.p || {}, valores)).map(x => `${donde} (${d.nombre}): ${x}`))
  return e
}
export function fraseCond(c, valores) {
  if (!c) return '…'
  if (c.c === 'Y') return c.de.map(x => fraseCond(x, valores)).join(' y ')
  if (c.c === 'O') return `(${c.de.map(x => fraseCond(x, valores)).join(' o ')})`
  if (c.c === 'NO') return `no se cumple que ${fraseCond(c.de, valores)}`
  if (c.c === 'cruza') return `pasa a cumplirse que ${fraseCond(c.de, valores)}`
  if (c.c === 'histeresis') return `se ha cumplido que ${fraseCond(c.entra, valores)} y aún no que ${fraseCond(c.sale, valores)}`
  const d = CONDICIONES_EDITOR[c.c]
  return d ? d.frase(resuelve(c.p || {}, valores)) : `«${c.c}»`
}

// ── Validación de la definición ──
export function validaDefinicion(def, guardados = {}) {
  const e = []
  if (!def || def.tipo !== 'editor') return ['No es una definición del editor.']
  if (def.formato !== FORMATO) e.push(`Formato ${def.formato} desconocido (el actual es ${FORMATO}).`)
  if (!(Number.isInteger(def.motor) && def.motor >= 1 && def.motor <= MOTOR)) e.push(`Versión del motor ${def.motor} desconocida (la actual es ${MOTOR}).`)
  const esquema = esquemaDe(def)
  if (def.parametros && !esquema) e.push('La declaración de parámetros no es válida.')
  if (esquema?.descartadas?.length) e.push(...esquema.descartadas.map(d => `Parámetros: ${d.motivo || JSON.stringify(d)}`))
  const valores = valoresDe(def, guardados)
  if (esquema) { const v = validaCombinacion(esquema, valores); if (!v.ok) e.push(...v.errores) }
  const sinDeclarar = [...new Set(referencias({ entrada: def.entrada, stops: def.stops, salidas: def.salidas, filtroMercado: def.filtroMercado }))].filter(n => !(n in valores))
  if (sinDeclarar.length) e.push(`Parámetros usados y no declarados: ${sinDeclarar.join(', ')}.`)
  // Entrada
  const en = def.entrada
  if (!en) e.push('Falta la entrada.')
  else {
    if (en.senal !== undefined || !ordenSinSenal(en.orden)) e.push(...validaCond(en.senal, valores, 'Señal de entrada'))
    if (en.cancelar) e.push(...validaCond(en.cancelar, valores, 'Cancelar la orden'))
    const o = en.orden
    if (!o || !TIPOS_ORDEN.includes(o.tipo)) e.push(`La orden de entrada tiene que ser ${TIPOS_ORDEN.join(', ')}.`)
    else if (o.tipo === 'stop' || o.tipo === 'limite') {
      if (!o.nivel || !CAMPOS.includes(o.nivel.campo) || !entero(resuelve(o.nivel.velas, valores), 1, 250)) e.push('La orden stop o límite necesita un nivel: un campo (máximo, mínimo o cierre) y un número de velas (1 a 250).')
      if (o.ajuste !== undefined && !['fijo', 'soloBaja', 'soloSube'].includes(o.ajuste)) e.push('El ajuste de la orden tiene que ser fijo, soloBaja o soloSube.')
    }
    else if (o.tipo === 'ruptura') {
      if (!entero(resuelve(o.nivel?.velas, valores), 1, 250)) e.push('La orden en el nivel de ruptura necesita el número de velas anteriores (1 a 250).')
      if (en.cancelar) e.push('La orden en el nivel de ruptura no se cancela: se rehace en cada vela.')
    }
    else if (o.tipo === 'swing') {
      if (!entero(resuelve(o.nivel?.izquierda, valores), 1, 20) || !entero(resuelve(o.nivel?.derecha, valores), 1, 20)) e.push('La orden en el último máximo de swing necesita las velas a la izquierda y a la derecha (1 a 20).')
      if (en.cancelar) e.push('La orden en el último máximo de swing no se cancela: sigue al último swing confirmado.')
    }
    else if (o.tipo === 'supertrend') {   // V9.1067
      if (!entero(resuelve(o.nivel?.periodo, valores), 1, 200) || !numero(resuelve(o.nivel?.k, valores), 0.1, 20)) e.push('La orden en la línea del SuperTrend necesita las velas del ATR (1 a 200) y el multiplicador (0,1 a 20).')
      if (en.cancelar) e.push('La orden en la línea del SuperTrend no se cancela: se rehace en cada vela.')
    }
    else if (o.tipo === 'lineaBajista') {   // V9.1076
      const nv = resuelve(o.nivel || {}, valores)
      if (!entero(nv.izquierda, 1, 20) || !entero(nv.derecha, 1, 20) || !entero(nv.velas, 10, 1000) || !['unir', 'invalidar'].includes(nv.siSube)) e.push('La orden en la línea de tendencia bajista necesita las velas a la izquierda y a la derecha del swing (1 a 20), las velas donde buscar máximos (10 a 1000) y qué hacer si el último máximo sube (unir o invalidar).')
      if (en.cancelar) e.push('La orden en la línea de tendencia bajista no se cancela: sigue a la línea vigente.')
    }
  }
  // Stops
  const ids = new Set()
  for (const [k, s] of (def.stops || []).entries()) {
    const d = `Stop ${k + 1}`
    if (!TIPOS_STOP.includes(s?.tipo)) { e.push(`${d}: el tipo tiene que ser ${TIPOS_STOP.join(', ')}.`); continue }
    if (!s.id || ids.has(s.id)) e.push(`${d}: necesita un id distinto de los demás.`); ids.add(s.id)
    if (!s.motivo) e.push(`${d}: necesita un motivo (el nombre de la salida).`)
    const r = resuelve(s, valores)
    if (s.tipo === 'nivel' && !(Array.isArray(r.de) && r.de.length && r.de.every(x => CAMPOS.includes(x?.campo) || (['EMA', 'SMA'].includes(x?.media?.tipo) && entero(x.media.periodo))))) e.push(`${d}: el nivel es el mínimo de campos de la vela o medias (EMA / SMA con periodo).`)
    if (s.tipo === 'minimoVelas' && !entero(r.n, 1, 250)) e.push(`${d}: n tiene que ser un número entero de velas (1 a 250).`)
    if (s.tipo === 'porcentaje' && !numero(r.pct, 0.01, 99)) e.push(`${d}: el porcentaje, entre 0,01 y 99.`)
    if ((s.tipo === 'atr' || s.tipo === 'atrCompra') && !(numero(r.k, 0.01, 50) && entero(r.periodo, 1, 200))) e.push(`${d}: k (0,01 a 50) y el periodo del ATR (1 a 200).`)
    if (s.tipo === 'minimoMovil' && !entero(r.n, 1, 250)) e.push(`${d}: n tiene que ser un número entero de velas (1 a 250).`)
    if (s.tipo === 'swingMinimo' && !(entero(r.izquierda, 1, 20) && entero(r.derecha, 1, 20))) e.push(`${d}: las velas a la izquierda y a la derecha del swing, de 1 a 20.`)
    if (s.tipo === 'supertrend' && !(entero(r.periodo, 1, 200) && numero(r.k, 0.1, 20))) e.push(`${d}: las velas del ATR del SuperTrend (1 a 200) y el multiplicador (0,1 a 20).`)   // V9.1064
    if (s.tipo === 'emaMinimo' && !entero(r.periodo, 1, 1000)) e.push(`${d}: el periodo de la EMA, un número entero de 1 a 1000.`)   // V9.1076
    if (s.tipo === 'trailing') {
      e.push(...validaCond(s.si, valores, `${d} (cuándo sube)`))
      if (!((r.nivel?.campo && CAMPOS.includes(r.nivel.campo) && entero(r.nivel.velas, 1, 250)) || (numero(r.nivel?.atr?.k, 0.01, 50) && entero(r.nivel?.atr?.periodo, 1, 200)))) e.push(`${d}: el nivel del trailing es el mínimo de N velas o el cierre − k × ATR.`)
      if (!['cadaVez', 'siSube'].includes(s.historial ?? 'siSube') || !['vela', 'anterior'].includes(s.fechaHistorial ?? 'vela')) e.push(`${d}: historial (cadaVez / siSube) y fecha del historial (vela / anterior) no válidos.`)
    }
  }
  for (const s of def.stops || []) if (s?.retiraSiSupera && !ids.has(s.retiraSiSupera)) e.push(`Stop «${s.id}»: retiraSiSupera apunta a un stop que no existe.`)
  if (def.stopsModo !== undefined && def.stopsModo !== 'masAlto') e.push('Con varios stops, el modo tiene que ser «masAlto» (manda el más alto) o no estar.')
  if (def.stopsModo === 'masAlto' && (def.stops || []).some(s => s?.retiraSiSupera)) e.push('Con «manda el más alto» no hace falta retirar un stop cuando otro lo supera: quita «retiraSiSupera».')
  // Salidas
  for (const [k, s] of (def.salidas || []).entries()) {
    const d = `Salida ${k + 1}`
    if (!TIPOS_SALIDA.includes(s?.tipo)) { e.push(`${d}: el tipo tiene que ser ${TIPOS_SALIDA.join(', ')}.`); continue }
    if (!s.motivo) e.push(`${d}: necesita un motivo.`)
    // Solo a la apertura siguiente: salir al cierre de la misma vela que decide usaría un cierre que, al ejecutar, aún no existe.
    if (s.tipo === 'condicion') { e.push(...validaCond(s.si, valores, d)); if (s.precio !== 'apertura') e.push(`${d}: la salida por condición es a la apertura de la vela siguiente (precio: 'apertura').`) }
    if (s.tipo === 'objetivo') { if (!numero(resuelve(s.multiploR, valores), 0.1, 100)) e.push(`${d}: el múltiplo del riesgo, entre 0,1 y 100.`); if (!(def.stops || []).length) e.push(`${d}: el objetivo en múltiplos del riesgo necesita un stop (el riesgo inicial).`) }
    if (s.tipo === 'tope' && !entero(resuelve(s.velas, valores), 1, 5000)) e.push(`${d}: el tope, un número entero de velas.`)
  }
  if (def.filtroMercado) {
    if (!/^\^?[A-Z0-9][A-Z0-9.=-]{0,14}$/.test(def.filtroMercado.ticker || '')) e.push('Filtro de mercado: el ticker tiene que ser un símbolo de Yahoo en mayúsculas (QQQ, SPY, ^GSPC…).')
    e.push(...validaCond(def.filtroMercado.si, valores, 'Filtro de mercado'))
  }
  if (!(def.stops || []).length && !(def.salidas || []).length) e.push('La estrategia necesita al menos un stop o una salida: si no, una posición no se cerraría nunca.')
  return e
}

// ── Huella ──
// sha256 del JSON canónico de la definición SIN lo que no cambia lo que hace (el dibujo, el nombre, la descripción) y con los
// VALORES de los parámetros (los guardados sobre los defectos): dos definiciones que hacen lo mismo dibujadas de otra forma
// tienen la misma huella; cambiar una regla o un valor, otra. Incluye el formato y la versión del motor.
export const paraHuella = (def, guardados = {}) => {
  const { diseno, nombre, descripcion, ...resto } = def
  return { ...resto, valores: valoresDe(def, guardados) }
}
export const huellaDefinicion = (def, guardados = {}) => sha256Hex(jsonCanonico(paraHuella(def, guardados)))

// ── La declaración de parámetros (la que el motor lee como run.parametros: optimizador y calentamiento) ──
export const declaracionParametros = (def) => def?.parametros || { version: 1, lista: [] }

// ── La regla en castellano ──
const fraseNivel = (n) => n.campo === 'high' ? (n.velas === 1 ? 'el máximo de la vela de la señal' : `el máximo de las ${n.velas} últimas velas`)
  : n.campo === 'low' ? (n.velas === 1 ? 'el mínimo de la vela de la señal' : `el mínimo de las ${n.velas} últimas velas`) : (n.velas === 1 ? 'el cierre de la vela de la señal' : `el cierre de hace ${n.velas} velas`)
const fraseExpr = (x) => x.campo ? { low: 'el mínimo', high: 'el máximo', close: 'el cierre' }[x.campo] : `la ${x.media.tipo} de ${x.media.periodo}`
export function fraseStop(s, valores) {
  const r = resuelve(s, valores)
  const base = r.tipo === 'nivel' ? `stop en ${r.de.length > 1 ? 'el menor entre ' + r.de.map(fraseExpr).join(' y ') : fraseExpr(r.de[0])} de la vela que fija la orden`
    : r.tipo === 'minimoVelas' ? `stop en el mínimo de las ${r.n} velas hasta la de la señal`
    : r.tipo === 'porcentaje' ? `stop a un ${fmt(r.pct)} % por debajo de la entrada`
    : r.tipo === 'atr' ? `stop a ${fmt(r.k)} ATR de ${r.periodo} por debajo de la entrada`
    : r.tipo === 'atrCompra' ? `stop fijo a ${fmt(r.k)} × ATR (${r.periodo}) por debajo del precio de compra, con el ATR de la vela anterior a la compra`
    : r.tipo === 'minimoMovil' ? `stop en el mínimo de las ${r.n} velas anteriores, que sube con él (nunca baja)`
    : r.tipo === 'swingMinimo' ? `stop bajo el último mínimo de swing (${r.izquierda}/${r.derecha}) confirmado, que sube con él (nunca baja)`
    : r.tipo === 'supertrend' ? `stop en la línea del SuperTrend (${r.periodo}, ${fmt(r.k)}), que sube con ella (nunca baja)`
    : r.tipo === 'emaMinimo' ? `stop en el mínimo de cada vela que cierra bajo su EMA de ${r.periodo} con la operación abierta, desde la vela siguiente (nunca baja)`
    : `stop móvil: cuando ${fraseCond(s.si, valores)}, sube ${r.nivel.atr ? `al cierre − ${fmt(r.nivel.atr.k)} ATR de ${r.nivel.atr.periodo}` : r.nivel.velas === 1 ? 'al mínimo de esa vela' : `al mínimo de las ${r.nivel.velas} últimas velas`}${r.soloSobreEntrada ? ' si queda por encima de la entrada' : ''} (nunca baja)`
  return base + (s.retiraSiSupera ? `; se retira cuando el stop «${s.retiraSiSupera}» queda por encima` : '')
}
export function fraseDefinicion(def, guardados = {}) {
  const v = valoresDe(def, guardados), en = def.entrada || {}, o = en.orden || {}
  const orden = o.tipo === 'apertura' ? 'se compra a la apertura de la vela siguiente' : o.tipo === 'cierre' ? 'se compra al cierre de esa vela'
    : o.tipo === 'ruptura' ? `se compra en cuanto el precio supera el máximo de las ${resuelve(o.nivel?.velas, v)} velas anteriores (a ese nivel, o a la apertura si abre por encima)`
    : o.tipo === 'swing' ? `se compra en cuanto el precio supera el último máximo de swing (${resuelve(o.nivel?.izquierda, v)}/${resuelve(o.nivel?.derecha, v)}) confirmado (a ese nivel, o a la apertura si abre por encima; cada swing, una vez)`
    : o.tipo === 'supertrend' ? `se compra en cuanto el precio toca la línea del SuperTrend (${resuelve(o.nivel?.periodo, v)}, ${fmt(resuelve(o.nivel?.k, v))}) mientras está bajista (a ese nivel, o a la apertura si abre por encima)`
    : o.tipo === 'lineaBajista' ? `se compra en cuanto el precio supera la línea de tendencia bajista (swing ${resuelve(o.nivel?.izquierda, v)}/${resuelve(o.nivel?.derecha, v)}, máximos de las ${resuelve(o.nivel?.velas, v)} últimas velas${resuelve(o.nivel?.siSube, v) === 'invalidar' ? ', sin línea si el último máximo sube' : ''}) (a ese nivel, o a la apertura si abre por encima; cada línea, una vez)`
    : `se pone una orden de compra ${o.tipo === 'stop' ? 'stop' : 'límite'} en ${fraseNivel(resuelve(o.nivel || {}, v))}${o.ajuste === 'soloBaja' ? ', que solo baja (al máximo de cada vela cerrada si es más bajo)' : o.ajuste === 'soloSube' ? ', que solo sube' : ''}; si la vela abre más allá del nivel, se llena a la apertura`
  const partes = [ordenSinSenal(o) && !en.senal ? `Entrar: ${orden}.` : `Entrar: cuando ${fraseCond(en.senal, v)} (al cierre), ${orden}${en.cancelar ? `. La orden se cancela si ${fraseCond(en.cancelar, v)}` : ''}.`]
  if (def.filtroMercado) partes.push(`Solo se entra si en ${def.filtroMercado.ticker} ${fraseCond(def.filtroMercado.si, v)}.`)
  const stops = (def.stops || []).filter(s => activa(s.activa, v))
  if (stops.length) partes.push(`Stops: ${stops.map(s => fraseStop(s, v)).join('; ')}${def.stopsModo === 'masAlto' && stops.length > 1 ? '; manda el más alto' : ''}.`)
  const sal = (def.salidas || []).filter(s => activa(s.activa, v))
  if (sal.length) partes.push(`Salidas: ${sal.map(s => s.tipo === 'condicion' ? `a la apertura siguiente cuando ${fraseCond(s.si, v)}`
    : s.tipo === 'objetivo' ? `objetivo a ${fmt(resuelve(s.multiploR, v))} veces el riesgo inicial` : `a la apertura de la vela ${resuelve(s.velas, v) + 1} contando desde la de entrada, como mucho`).join('; ')}.`)
  if (en.revisaSalidasEnLaVelaDeEntrada === false) partes.push('El día de la entrada no se miran stops ni salidas.')
  return partes.join(' ')
}
