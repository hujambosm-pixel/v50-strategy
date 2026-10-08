// lib/parametrosEstrategia.js — el contrato de los parámetros OPTIMIZABLES de una estrategia.
//
// QUÉ ES. Una estrategia declara qué parámetros puede variar el optimizador, de qué tipo son y entre qué
// valores, con una declaración ESTÁTICA en su code_js, junto a la función run() que los lee:
//
//   run.parametros = {
//     version: 1,
//     lista: [
//       { nombre: 'emaR', tipo: 'entero', defecto: 10, min: 2, max: 100, paso: 1, ventana: true,
//         sugerido: { min: 5, max: 20, paso: 1 }, descripcion: 'EMA rápida' },
//       { nombre: 'stopLoss', tipo: 'opcion', defecto: 'tecnico_ema', opciones: ['tecnico_ema', 'ninguno'] },
//       { nombre: 'sinPerdidas', tipo: 'sino', defecto: true },
//     ],
//     restricciones: [{ tipo: 'menor', a: 'emaR', b: 'emaL' }],
//     alias: { ema: ['emaPeriod'] },
//   }
//
// Los valores ACTUALES siguen en la columna params, como hasta ahora. La declaración dice qué es válido:
//   · tipo: 'entero', 'decimal', 'opcion' o 'sino' (sí/no).
//   · min, max, paso (numéricos): el dominio válido; un valor tiene que caer en la rejilla min + k·paso.
//   · sugerido { min, max, paso }: la rejilla que el optimizador propone por defecto, dentro del dominio.
//   · ventana: true en los parámetros que son el PERIODO de un indicador (EMA, RSI, ATR…). El calentamiento
//     usará solo esos cuando la estrategia declare: el detector por nombres de lib/periodo.js toma también
//     rsiNivel (55) como una ventana, y con el optimizador cambiar el nivel del RSI cambiaría el calentamiento.
//   · restricciones entre dos parámetros: 'menor', 'menorIgual' o 'distinto'. Declarativas, nada de código.
//   · alias: otros nombres que tienen que recibir el MISMO valor (en la 23, emaPeriod rotula la cabecera
//     del gráfico y tiene que coincidir siempre con ema).
// intervalo, capital_ini, years y allocation_pct no se pueden declarar: son condiciones de la simulación,
// no de la estrategia.
//
// normalizaParametros no lanza nunca: lo que no vale se descarta y queda anotado en `descartadas`, como en
// normalizaGrafico. Una declaración que no existe devuelve null.

import { compilaRun } from './validaCodeJs'

export const VERSION_PARAMETROS = 1
export const TIPOS_PARAMETRO = ['entero', 'decimal', 'opcion', 'sino']
export const CLAVES_VETADAS = ['intervalo', 'capital_ini', 'years', 'allocation_pct']
export const TIPOS_RESTRICCION = { menor: '<', menorIgual: '≤', distinto: '≠' }
const MAX_DESCARTES = 50
const RE_NOMBRE = /^[A-Za-z_][A-Za-z0-9_]*$/
const EPS = 1e-9

const esNumero = (v) => typeof v === 'number' && Number.isFinite(v)
const numerico = (p) => p.tipo === 'entero' || p.tipo === 'decimal'
const fmt = (v) => typeof v === 'string' ? `«${v}»` : String(v)
// ¿Cae v en la rejilla min + k·paso? Con tolerancia para los decimales (0,1 no es exacto en binario).
const enRejilla = (v, min, paso) => { const k = (v - min) / paso; return Math.abs(k - Math.round(k)) < 1e-7 }

/**
 * @param {object} declaracion  lo que la estrategia pone en run.parametros
 * @returns {object|null} { version, lista, restricciones, alias, descartadas?, descartesNoListados? }, o null
 */
export function normalizaParametros(declaracion) {
  if (declaracion == null) return null
  const descartadas = []
  let nDescartes = 0
  const anota = (donde, motivo) => {
    nDescartes++
    if (descartadas.length < MAX_DESCARTES) descartadas.push({ donde, motivo })
  }
  const salida = (lista, restricciones, alias) => ({
    version: VERSION_PARAMETROS, lista, restricciones, alias,
    ...(nDescartes ? { descartadas, ...(nDescartes > descartadas.length ? { descartesNoListados: nDescartes - descartadas.length } : {}) } : {}),
  })

  if (typeof declaracion !== 'object' || Array.isArray(declaracion)) {
    anota('parametros', `no es un objeto (${Array.isArray(declaracion) ? 'array' : typeof declaracion})`)
    return salida([], [], {})
  }
  if (declaracion.version !== VERSION_PARAMETROS) {
    anota('version', `versión ${fmt(declaracion.version)} desconocida (se espera ${VERSION_PARAMETROS}): no se interpreta nada`)
    return salida([], [], {})
  }

  // ── Lista ──
  const lista = []
  const nombres = new Set()
  const crudos = Array.isArray(declaracion.lista) ? declaracion.lista : []
  if (!Array.isArray(declaracion.lista)) anota('lista', 'falta la lista de parámetros')
  crudos.forEach((p, i) => {
    const donde = `lista[${i}]${p && typeof p.nombre === 'string' ? ' ' + p.nombre : ''}`
    const malo = (motivo) => anota(donde, motivo)
    if (!p || typeof p !== 'object' || Array.isArray(p)) return malo('no es un objeto')
    if (typeof p.nombre !== 'string' || !RE_NOMBRE.test(p.nombre)) return malo(`nombre no válido (${fmt(p.nombre)})`)
    if (CLAVES_VETADAS.includes(p.nombre)) return malo(`«${p.nombre}» es una condición de la simulación y no se puede optimizar`)
    if (nombres.has(p.nombre)) return malo('nombre repetido')
    if (!TIPOS_PARAMETRO.includes(p.tipo)) return malo(`tipo ${fmt(p.tipo)} desconocido (entero, decimal, opcion o sino)`)
    const q = { nombre: p.nombre, tipo: p.tipo }

    if (numerico(p)) {
      const entero = p.tipo === 'entero'
      for (const k of ['min', 'max', 'paso', 'defecto']) {
        if (!esNumero(p[k])) return malo(`${k} tiene que ser un número (${fmt(p[k])})`)
        if (entero && !Number.isInteger(p[k])) return malo(`${k} tiene que ser entero en un parámetro entero (${p[k]})`)
      }
      if (!(p.min < p.max)) return malo(`min (${p.min}) tiene que ser menor que max (${p.max})`)
      if (!(p.paso > 0)) return malo(`el paso tiene que ser positivo (${p.paso})`)
      if (p.defecto < p.min - EPS || p.defecto > p.max + EPS) return malo(`el valor por defecto (${p.defecto}) está fuera de [${p.min}, ${p.max}]`)
      if (!enRejilla(p.defecto, p.min, p.paso)) return malo(`el valor por defecto (${p.defecto}) no encaja en el paso ${p.paso} desde ${p.min}`)
      Object.assign(q, { defecto: p.defecto, min: p.min, max: p.max, paso: p.paso })
      // Sugerido: dentro del dominio, alineado con su rejilla y con un paso múltiplo del de la rejilla.
      if (p.sugerido != null) {
        const s = p.sugerido
        const problema = (typeof s !== 'object' || Array.isArray(s)) ? 'no es un objeto'
          : !['min', 'max', 'paso'].every(k => esNumero(s[k])) ? 'min, max y paso tienen que ser números'
          : !(s.min <= s.max) ? 'min tiene que ser menor o igual que max'
          : (s.min < p.min - EPS || s.max > p.max + EPS) ? `se sale de [${p.min}, ${p.max}]`
          : !(s.paso > 0) || !enRejilla(s.paso, 0, p.paso) ? `el paso ${s.paso} no es múltiplo del paso ${p.paso}`
          : !enRejilla(s.min, p.min, p.paso) ? `min (${s.min}) no encaja en el paso ${p.paso} desde ${p.min}`
          : null
        if (problema) anota(`${donde} sugerido`, problema + ': se descarta la rejilla sugerida')
        else q.sugerido = { min: s.min, max: s.max, paso: s.paso }
      }
    } else if (p.tipo === 'opcion') {
      const op = p.opciones
      if (!Array.isArray(op) || !op.length) return malo('una opción necesita la lista de opciones')
      if (!op.every(o => typeof o === 'string' || esNumero(o))) return malo('las opciones tienen que ser textos o números')
      if (new Set(op).size !== op.length) return malo('hay opciones repetidas')
      if (!op.includes(p.defecto)) return malo(`el valor por defecto ${fmt(p.defecto)} no está entre las opciones`)
      Object.assign(q, { defecto: p.defecto, opciones: [...op] })
    } else {
      if (typeof p.defecto !== 'boolean') return malo(`el valor por defecto de un sí/no tiene que ser true o false (${fmt(p.defecto)})`)
      q.defecto = p.defecto
    }
    if (!numerico(p)) for (const k of ['min', 'max', 'paso', 'sugerido'])
      if (p[k] != null) anota(`${donde} ${k}`, `no tiene sentido en un parámetro de tipo ${p.tipo}: se ignora`)

    if (p.ventana === true) {
      if (p.tipo === 'entero') q.ventana = true
      else anota(`${donde} ventana`, 'solo un parámetro entero puede ser el periodo de un indicador: se ignora')
    }
    if (typeof p.descripcion === 'string' && p.descripcion.trim()) q.descripcion = p.descripcion.trim().slice(0, 300)
    nombres.add(q.nombre)
    lista.push(q)
  })
  const porNombre = new Map(lista.map(p => [p.nombre, p]))

  // ── Restricciones ──
  const restricciones = []
  const crudasR = declaracion.restricciones == null ? [] : declaracion.restricciones
  if (!Array.isArray(crudasR)) anota('restricciones', 'no es una lista')
  ;(Array.isArray(crudasR) ? crudasR : []).forEach((r, i) => {
    const donde = `restricciones[${i}]`
    if (!r || typeof r !== 'object') return anota(donde, 'no es un objeto')
    if (!(r.tipo in TIPOS_RESTRICCION)) return anota(donde, `tipo ${fmt(r.tipo)} desconocido (menor, menorIgual o distinto)`)
    const A = porNombre.get(r.a), B = porNombre.get(r.b)
    if (!A || !B) return anota(donde, `habla de un parámetro que no está declarado (${fmt(r.a)}, ${fmt(r.b)})`)
    if (A === B) return anota(donde, 'compara un parámetro consigo mismo')
    if (r.tipo !== 'distinto' && (!numerico(A) || !numerico(B))) return anota(donde, `«${r.tipo}» solo vale entre parámetros numéricos`)
    const q = { tipo: r.tipo, a: r.a, b: r.b }
    if (!cumple(q, A.defecto, B.defecto)) anota(donde, `los valores por defecto no la cumplen (${A.nombre} = ${A.defecto}, ${B.nombre} = ${B.defecto})`)
    restricciones.push(q)
  })

  // ── Alias ──
  const alias = {}
  const vistos = new Set()
  const crudosA = declaracion.alias == null ? {} : declaracion.alias
  if (typeof crudosA !== 'object' || Array.isArray(crudosA)) anota('alias', 'no es un objeto')
  else for (const [nombre, otros] of Object.entries(crudosA)) {
    const donde = `alias.${nombre}`
    if (!porNombre.has(nombre)) { anota(donde, 'no es un parámetro declarado'); continue }
    const lista2 = (Array.isArray(otros) ? otros : [otros]).filter(o => {
      if (typeof o !== 'string' || !RE_NOMBRE.test(o)) { anota(donde, `alias no válido (${fmt(o)})`); return false }
      if (porNombre.has(o)) { anota(donde, `«${o}» ya es un parámetro declarado`); return false }
      if (CLAVES_VETADAS.includes(o)) { anota(donde, `«${o}» es una condición de la simulación`); return false }
      if (vistos.has(o)) { anota(donde, `«${o}» ya es alias de otro parámetro`); return false }
      vistos.add(o); return true
    })
    if (lista2.length) alias[nombre] = lista2
  }

  return salida(lista, restricciones, alias)
}

function cumple(r, a, b) {
  if (r.tipo === 'menor') return a < b
  if (r.tipo === 'menorIgual') return a <= b
  return a !== b
}

/**
 * Comprueba un juego de valores contra el esquema normalizado. Para las restricciones, los parámetros que
 * no lleguen en `valores` cuentan con su valor en `base` (los params guardados) o, si tampoco está, con
 * el de por defecto.
 * @returns {{ ok: boolean, errores: string[] }} errores en castellano llano
 */
export function validaCombinacion(esquema, valores, base = null) {
  const errores = []
  if (!esquema || !Array.isArray(esquema.lista)) return { ok: false, errores: ['La estrategia no declara parámetros optimizables.'] }
  const v = valores && typeof valores === 'object' ? valores : {}
  const porNombre = new Map(esquema.lista.map(p => [p.nombre, p]))
  const aliasDe = new Map(Object.entries(esquema.alias || {}).flatMap(([n, otros]) => otros.map(o => [o, n])))
  for (const k of Object.keys(v)) {
    if (porNombre.has(k)) continue
    if (CLAVES_VETADAS.includes(k)) errores.push(`«${k}» es una condición de la simulación y no se puede optimizar.`)
    else if (aliasDe.has(k)) errores.push(`«${k}» es otro nombre de «${aliasDe.get(k)}»: usa «${aliasDe.get(k)}».`)
    else errores.push(`«${k}» no es un parámetro de esta estrategia.`)
  }
  const efectivos = {}
  for (const p of esquema.lista) {
    const tiene = Object.prototype.hasOwnProperty.call(v, p.nombre)
    const enBase = base && typeof base === 'object' && Object.prototype.hasOwnProperty.call(base, p.nombre)
    const x = tiene ? v[p.nombre] : enBase ? base[p.nombre] : p.defecto
    efectivos[p.nombre] = x
    if (!tiene) continue
    if (numerico(p)) {
      if (!esNumero(x)) { errores.push(`«${p.nombre}» tiene que ser un número (llegó ${fmt(x)}).`); continue }
      if (p.tipo === 'entero' && !Number.isInteger(x)) { errores.push(`«${p.nombre}» tiene que ser un número entero (llegó ${x}).`); continue }
      if (x < p.min - EPS || x > p.max + EPS) { errores.push(`«${p.nombre}» tiene que estar entre ${p.min} y ${p.max} (llegó ${x}).`); continue }
      if (!enRejilla(x, p.min, p.paso)) errores.push(`«${p.nombre}» va de ${p.paso} en ${p.paso} desde ${p.min}: ${x} no encaja.`)
    } else if (p.tipo === 'opcion') {
      if (!p.opciones.includes(x)) errores.push(`«${p.nombre}» solo admite ${p.opciones.map(fmt).join(', ')} (llegó ${fmt(x)}).`)
    } else if (typeof x !== 'boolean') errores.push(`«${p.nombre}» tiene que ser sí o no (true o false; llegó ${fmt(x)}).`)
  }
  for (const r of esquema.restricciones || []) {
    const a = efectivos[r.a], b = efectivos[r.b]
    if (a === undefined || b === undefined) continue
    if (!cumple(r, a, b)) errores.push(`«${r.a}» tiene que ser ${r.tipo === 'menor' ? 'menor que' : r.tipo === 'menorIgual' ? 'menor o igual que' : 'distinto de'} «${r.b}» (${r.a} = ${a}, ${r.b} = ${b}).`)
  }
  return { ok: errores.length === 0, errores }
}

/**
 * Los valores de los parámetros declarados como periodo de un indicador (ventana: true), con el valor que
 * llegue en `valores` o, si no llega, el de por defecto. Para el calentamiento. null si no hay esquema.
 * @returns {object|null} { nombre: valor }
 */
export function ventanasDeclaradas(esquema, valores) {
  if (!esquema || !Array.isArray(esquema.lista)) return null
  const v = valores && typeof valores === 'object' ? valores : {}
  const salida = {}
  for (const p of esquema.lista) if (p.ventana) salida[p.nombre] = Object.prototype.hasOwnProperty.call(v, p.nombre) ? v[p.nombre] : p.defecto
  return salida
}

/**
 * Los parámetros con los que corre un backtest cuando la petición trae cambios (el campo `params`): valida
 * los cambios contra el esquema (validaCombinacion, con los guardados como base de las restricciones),
 * copia cada valor a sus alias y devuelve { ...guardados, ...cambios }. Una estrategia que no declara
 * run.parametros no admite cambios: no se puede optimizar lo que no dice qué se puede variar.
 * Sin cambios (null o undefined) devuelve los guardados tal cual.
 * @returns {{ ok: boolean, params: object|null, errores: string[] }}
 */
export function paramsEfectivos(guardados, cambios, esquema) {
  const base = guardados && typeof guardados === 'object' && !Array.isArray(guardados) ? guardados : {}
  if (cambios == null) return { ok: true, params: { ...base }, errores: [] }
  if (typeof cambios !== 'object' || Array.isArray(cambios))
    return { ok: false, params: null, errores: ['«params» tiene que ser un objeto con los valores de los parámetros.'] }
  if (!esquema || !Array.isArray(esquema.lista))
    return { ok: false, params: null, errores: ['Esta estrategia no declara sus parámetros (run.parametros): no se pueden cambiar.'] }
  const v = validaCombinacion(esquema, cambios, base)
  if (!v.ok) return { ok: false, params: null, errores: v.errores }
  const params = { ...base, ...cambios }
  for (const [nombre, otros] of Object.entries(esquema.alias || {}))
    if (Object.prototype.hasOwnProperty.call(cambios, nombre)) for (const o of otros) params[o] = cambios[nombre]
  return { ok: true, params, errores: [] }
}

/** El esquema normalizado de un code_js, o null si no declara run.parametros (o no compila). No lanza. */
export function esquemaDeCodigo(codeJs) {
  if (!codeJs) return null
  const l = leeDeclaracion(codeJs)
  return l.error ? null : normalizaParametros(l.declaracion)
}

// Las condiciones de la simulación que lleva el cfg del multiactivo y del panel del activo. Los params de
// la estrategia (y sus cambios) se mezclan ENCIMA del cfg —ganan a emaR, tipoStop… del formulario—, pero
// nunca pisan estas: capital y periodo son de la simulación, no de la estrategia.
export const CONDICIONES_CFG = ['capitalIni', 'years', 'fromDate', 'toDate']
export function cfgConParams(cfg, params) {
  const salida = { ...(cfg || {}), ...(params || {}) }
  for (const k of CONDICIONES_CFG) if (cfg && Object.prototype.hasOwnProperty.call(cfg, k)) salida[k] = cfg[k]
  return salida
}

/**
 * Lee run.parametros de un code_js compilándolo con el MISMO mecanismo que lib/validaCodeJs.js (y que el
 * sandbox de las rutas), sin llamar a run(). No lanza.
 * @returns {{ declaracion: object|null, error: string|null }} declaracion null si la estrategia no declara
 */
export function leeDeclaracion(codeJs) {
  const c = compilaRun(codeJs)
  if (c.error) return { declaracion: null, error: c.error }
  const d = c.run.parametros
  return { declaracion: d === undefined ? null : d, error: null }
}
