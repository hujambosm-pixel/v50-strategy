// lib/lotesLab.js — lotes OFICIALES del laboratorio de señales: configuraciones declaradas de antemano, congeladas, con su
// huella. Una prueba solo es «oficial» si su configuración coincide exactamente (misma huella) con un elemento de un lote
// declarado aquí; cualquier otra es «exploratoria» (lib/registroLab.js). Puro (la huella usa crypto.subtle, que existe
// igual en el navegador y en Node).
//
// HUELLA: sha256 del JSON CANÓNICO (claves de los objetos en orden, sin espacios; los arrays conservan su orden). La del
// lote entero está escrita abajo (LOTE_1_HASH) y la comprueba una prueba: si alguien toca el lote, deja de cuadrar.
import { validaCombinacion, validaSalidas } from './senales'
import { veredictoLab } from './laboratorio'
import CALIBRACION from './calibracionLab.json'

// JSON canónico: objetos con las claves ordenadas, recursivamente.
export function jsonCanonico(x) {
  if (x === null || typeof x !== 'object') return JSON.stringify(x)
  if (Array.isArray(x)) return '[' + x.map(jsonCanonico).join(',') + ']'
  return '{' + Object.keys(x).filter(k => x[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + jsonCanonico(x[k])).join(',') + '}'
}
export async function sha256Hex(texto) {
  const datos = new TextEncoder().encode(texto)
  const h = await globalThis.crypto.subtle.digest('SHA-256', datos)
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('')
}
export const huella = (x) => sha256Hex(jsonCanonico(x))
const congela = (x) => { if (x && typeof x === 'object') { Object.values(x).forEach(congela); Object.freeze(x) } return x }

// ── LOTE_1 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
const cruce = (tipo, rapida, lenta) => ({ id: 'cruceMedias', params: { tipoRapida: tipo, periodoRapida: rapida, tipoLenta: tipo, periodoLenta: lenta } })
const ruptura = (n) => ({ id: 'ruptura', params: { n } })
export const LOTE_1 = congela({
  id: 'LOTE_1',
  nombre: 'Lote 1 · señales clásicas',
  comun: {
    universo: { indice: 'NDX', regla: 'miembros del Nasdaq-100 en cada fecha', fuente: 'universo_miembros', sinExcluidos: true },
    intervalo: 'diario',
    entrada: 'apertura de la vela siguiente',
    salida: { tipo: 'velas', n: 20 },
    periodos: [{ desde: '2016-01-01', hasta: '2020-12-31' }, { desde: '2021-01-01', hasta: '2025-12-31' }],
    minimoOperaciones: 100,
    criterio: { medida: 'mediana del rendimiento por operación', percentilMinimo: 95, frente: 'azar', periodos: 'ambos' },
  },
  items: [
    { id: '1a', nombre: 'Cruce EMA 10 / EMA 11', disparador: cruce('EMA', 10, 11), filtros: [] },
    { id: '1b', nombre: 'Cruce EMA 20 / EMA 50', disparador: cruce('EMA', 20, 50), filtros: [] },
    { id: '1c', nombre: 'Cruce EMA 50 / EMA 200', disparador: cruce('EMA', 50, 200), filtros: [] },
    { id: '2', nombre: 'Ruptura de 20 velas', disparador: ruptura(20), filtros: [] },
    { id: '3', nombre: 'Ruptura de 55 velas', disparador: ruptura(55), filtros: [] },
    { id: '4', nombre: 'Nuevo máximo de 52 semanas', disparador: ruptura(252), filtros: [] },
    { id: '5', nombre: 'El precio cruza la SMA 50', disparador: { id: 'precioCruzaMedia', params: { tipo: 'SMA', periodo: 50 } }, filtros: [] },
    { id: '6', nombre: 'Retroceso: RSI 2 < 10 sobre la SMA 200', disparador: { id: 'retroceso', params: { periodoRsi: 2, umbral: 10, tipoMedia: 'SMA', periodoMedia: 200 } }, filtros: [] },
    { id: '7', nombre: 'Ruptura de 20 velas con volumen alto', disparador: ruptura(20), filtros: [{ id: 'volumenAlto', params: { k: 1.5, n: 20 } }] },
    { id: '8', nombre: 'Ruptura de 20 velas con mercado alcista', disparador: ruptura(20), filtros: [{ id: 'mercadoAlcista', params: { tipo: 'SMA', periodo: 200 } }] },
  ],
})
// sha256 del JSON canónico de LOTE_1 (comprobado en una prueba).
export const LOTE_1_HASH = '74510542b541a9f4073514b9125bf5a07c1fb466bb1041db69969c5307621a29'

// ── LOTE_2 · salidas ───────────────────────────────────────────────────────────────────────────────────────────────────
// Mide cada SALIDA por separado: las entradas son al azar y fijas (las mismas señales para todas las salidas), así la
// entrada no aporta nada. Días candidatos de cada valor: miembro del índice, con datos, con TODOS los indicadores del
// calentamiento calculados (el mismo para todas las salidas) y con vela de entrada; cada uno es señal con probabilidad
// 1/20 (semilla declarada). Una operación por valor a la vez: las señales con la posición abierta se ignoran y se
// cuentan. Medida principal: la MEDIA por operación frente al azar por permutación exacta (lib/laboratorioSalidas.js).
const tope = (n) => ({ id: 'tiempoMaximo', params: { n } })
const bajoMedia = (tipo, periodo) => ({ id: 'cierreBajoMedia', params: { tipo, periodo } })
export const LOTE_2 = congela({
  id: 'LOTE_2',
  tipo: 'salidas',
  nombre: 'Lote 2 · salidas',
  comun: {
    universo: { indice: 'NDX', regla: 'miembros del Nasdaq-100 en cada fecha', fuente: 'universo_miembros', sinExcluidos: true },
    intervalo: 'diario',
    entrada: 'apertura de la vela siguiente',
    entradas: {
      tipo: 'azar', probabilidad: 0.05, semilla: 20261016,
      calentamiento: [{ indicador: 'EMA', periodo: 10 }, { indicador: 'EMA', periodo: 20 }, { indicador: 'SMA', periodo: 50 }, { indicador: 'ATR', periodo: 14 }, { indicador: 'RSI', periodo: 14 }],
    },
    unaOperacionPorValor: true,
    periodos: [{ desde: '2016-01-01', hasta: '2020-12-31' }, { desde: '2021-01-01', hasta: '2025-12-31' }],
    minimoOperaciones: 100,
    criterio: { medida: 'media del rendimiento por operación', percentilMinimo: 95, frente: 'azar: mismas entradas, duraciones reales del valor', metodoAzar: 'permutación exacta de las duraciones reales de cada valor, sin solapes', periodos: 'ambos' },
  },
  items: [
    { id: 'S1', nombre: 'Cierre bajo la EMA 10 (tope 120)', salidas: [bajoMedia('EMA', 10), tope(120)] },
    { id: 'S2', nombre: 'Cierre bajo la EMA 20 (tope 120)', salidas: [bajoMedia('EMA', 20), tope(120)] },
    { id: 'S3', nombre: 'Cierre bajo la SMA 50 (tope 120)', salidas: [bajoMedia('SMA', 50), tope(120)] },
    { id: 'S4', nombre: 'Stop móvil 3 ATR 14 (tope 120)', salidas: [{ id: 'stopMovilATR', params: { k: 3, n: 14 } }, tope(120)] },
    { id: 'S5', nombre: 'Stop fijo 2 ATR 14 o 20 velas', salidas: [{ id: 'stopFijoATR', params: { k: 2, n: 14 } }, tope(20)] },
    { id: 'S6', nombre: 'RSI 14 > 70 o 60 velas', salidas: [{ id: 'rsiSobrecompra', params: { n: 14, umbral: 70 } }, tope(60)] },
  ],
})
// sha256 del JSON canónico de LOTE_2 (comprobado en una prueba).
export const LOTE_2_HASH = 'c9df02acc17d61b028d5582aab2034325edb0d85ceeb1f4f8912450b06d43fab'

// ── LOTE_3 · estrategias completas ─────────────────────────────────────────────────────────────────────────────────────
// Entrada (disparador del catálogo de señales) + salida (salidas del catálogo con su tope) contra la MISMA estrategia hecha
// al azar: por valor, las mismas duraciones reales en fechas de señal al azar entre los días válidos, sin solaparse
// (lib/laboratorioEstrategias.js). Criterio 4: solo da veredicto si la combinación está CALIBRADA (falsos aprobados en un
// periodo <= 10 % en la calibración con paseos aleatorios sin ventaja, lib/calibracionLab.json).
const ENTRADAS_L3 = {
  E1: { nombre: 'Cruce EMA 10 / EMA 11', disparador: cruce('EMA', 10, 11) },
  E2: { nombre: 'Cruce EMA 20 / EMA 50', disparador: cruce('EMA', 20, 50) },
  E3: { nombre: 'El precio cruza la SMA 50', disparador: { id: 'precioCruzaMedia', params: { tipo: 'SMA', periodo: 50 } } },
  E4: { nombre: 'El RSI 14 cruza por encima de 55', disparador: { id: 'rsiCruzaArriba', params: { periodoRsi: 14, umbral: 55 } } },
}
const SALIDAS_L3 = {
  X1: { nombre: 'cierre bajo la EMA 10 (tope 120)', salidas: [bajoMedia('EMA', 10), tope(120)] },
  X2: { nombre: 'cierre bajo la SMA 50 (tope 120)', salidas: [bajoMedia('SMA', 50), tope(120)] },
  X3: { nombre: 'RSI 14 > 70 o 60 velas', salidas: [{ id: 'rsiSobrecompra', params: { n: 14, umbral: 70 } }, tope(60)] },
}
export const LOTE_3 = congela({
  id: 'LOTE_3',
  tipo: 'estrategias',
  criterioVersion: 4,
  nombre: 'Lote 3 · estrategias completas',
  comun: {
    universo: { indice: 'NDX', regla: 'miembros del Nasdaq-100 en cada fecha', fuente: 'universo_miembros', sinExcluidos: true },
    intervalo: 'diario',
    entrada: 'apertura de la vela siguiente',
    unaOperacionPorValor: true,
    periodos: [{ desde: '2016-01-01', hasta: '2020-12-31' }, { desde: '2021-01-01', hasta: '2025-12-31' }],
    minimoOperaciones: 100,
    criterio: { medida: 'media del rendimiento por operación', percentilMinimo: 95, periodos: 'ambos',
      frente: 'la misma estrategia al azar: las duraciones reales de cada valor en fechas de señal al azar entre los días válidos, sin solaparse',
      calibracion: 'solo combinaciones calibradas: falsos aprobados en un periodo <= 10 % con paseos aleatorios sin ventaja' },
  },
  items: Object.entries(ENTRADAS_L3).flatMap(([e, E]) => Object.entries(SALIDAS_L3).map(([x, X]) => ({
    id: `${e}${x}`, nombre: `${E.nombre} · ${X.nombre}`, disparador: E.disparador, filtros: [], salidas: X.salidas }))),
})
// sha256 del JSON canónico de LOTE_3 (comprobado en una prueba).
export const LOTE_3_HASH = '21d20102aff447d48818779a9210a46f4bc470232bfd633531627380dbd46b0b'
export const LOTES = congela({ LOTE_1, LOTE_2, LOTE_3 })
export const HUELLAS_LOTES = Object.freeze({ LOTE_1: LOTE_1_HASH, LOTE_2: LOTE_2_HASH, LOTE_3: LOTE_3_HASH })

// ── Versiones del criterio de veredicto ────────────────────────────────────────────────────────────────────────────────
// Un lote lleva su versión en `criterioVersion`; sin ella (LOTE_1 y LOTE_2, cuyas huellas no se tocan) es la 1.
//   1 · el declarado en cada lote: >= minimoOperaciones y percentil >= 95 con SU azar en todos los periodos.
//   2 · V9.976, LOTE_3 en adelante: en las pruebas de SALIDAS hace falta además percentil >= 95 con el azar RE-SIMULADO
//       (la misma secuencia de señales con duraciones del valor) en todos los periodos. Con una salida que depende del
//       precio, la salida decide cuándo llega la siguiente entrada: el hueco de cada operación delata cómo le fue y la
//       permutación sale torcida (calibración V9.976 en paseos aleatorios sin ventaja: percentil 0 en S1–S5 y 100 en S6),
//       mientras que el re-simulado compara el proceso entero (tampoco es perfecto con los stops: S4 >= 95 en el 26 %).
//       Se queda definido para la trazabilidad; ningún lote lo usa (lo sustituye el 3).
//   3 · V9.977, el de los lotes nuevos (LOTE_3 en adelante): en las pruebas de SALIDAS decide SOLO el azar re-simulado
//       (>= minimoOperaciones y percentil de la media >= 95 en todos los periodos), y solo con salidas de tipos calibrados
//       (cierreBajoMedia, rsiSobrecompra, tiempoMaximo y sus combinaciones). Con un stop (stopMovilATR, stopFijoATR) no hay
//       veredicto: «sin veredicto: azar no calibrado para stops». La permutación se sigue calculando, solo informativa. Las
//       pruebas de ENTRADAS (salida fija) siguen como con el 1.
export const CRITERIOS = congela({
  1: { version: 1, desde: 'V9.969', salidas: 'propio', salidasConResimulado: false },
  2: { version: 2, desde: 'V9.976', salidas: 'ambos', salidasConResimulado: true },
  3: { version: 3, desde: 'V9.977', salidas: 'resimulado', salidasCalibradas: ['cierreBajoMedia', 'rsiSobrecompra', 'tiempoMaximo'] },
  4: { version: 4, desde: 'V9.978', estrategias: true, maxFalsosAprobados: 10 },
})
//   4 · V9.978, ESTRATEGIAS COMPLETAS (LOTE_3): pasa si la combinación está calibrada (en lib/calibracionLab.json, hecha
//       para la huella exacta del lote: falsos aprobados en un periodo <= maxFalsosAprobados %) y, en todos los periodos,
//       hay >= minimoOperaciones y percentil de la media >= 95 frente a la estrategia al azar. Sin calibrar: «sin
//       veredicto: azar no calibrado para esta combinación».
export const CRITERIO_ACTUAL = 3              // pruebas de entradas y de salidas en lotes nuevos
export const CRITERIO_ACTUAL_ESTRATEGIAS = 4  // pruebas de estrategias completas
export const SIN_VEREDICTO_NO_CALIBRADA = 'sin veredicto: azar no calibrado para esta combinación'
// La calibración de un elemento (o null): solo vale si se hizo para la huella del lote tal como está.
export const calibracionDe = (loteId, item) => { const c = CALIBRACION?.[loteId]; return c && c.huellaLote === HUELLAS_LOTES[loteId] ? c.items?.[item] || null : null }
export const calibracionLote = (loteId) => { const c = CALIBRACION?.[loteId]; return c && c.huellaLote === HUELLAS_LOTES[loteId] ? c : null }
const esLoteEstrategias = (loteId) => LOTES[loteId]?.tipo === 'estrategias'
export const SIN_VEREDICTO_STOPS = 'sin veredicto: azar no calibrado para stops'
export const NOTA_PERMUTACION = 'no calibrada con salidas que dependen del precio'
export const versionCriterio = (loteId) => LOTES[loteId]?.criterioVersion ?? 1
const esLoteSalidas = (loteId) => LOTES[loteId]?.tipo === 'salidas'
// Los periodos con el re-simulado en el lugar del azar principal (null si a alguno le falta).
function conResimulado(periodos) {
  if (!periodos?.length || periodos.some(p => p?.otrosAzares?.resimulado?.percentil == null)) return null
  return periodos.map(p => ({ ...p, azar: { ...p.azar, percentil: p.otrosAzares.resimulado.percentil } }))
}
// Salidas de una regla que el criterio no sabe juzgar (las que no están entre sus tipos calibrados).
export const salidasNoCalibradas = (reglas, version) => { const c = CRITERIOS[version]?.salidasCalibradas; return c ? (reglas || []).map(r => r.id).filter(id => !c.includes(id)) : [] }
// Veredicto de una prueba con la versión de criterio de su lote (o la que se pida). clas: { oficial, lote, salidas } (salidas:
// las reglas de salida de una prueba de salidas; el criterio 3 las necesita para saber si hay un stop).
export function veredictoOficial({ oficial, lote, item, salidas: reglas }, periodos, version = versionCriterio(lote)) {
  if (esLoteEstrategias(lote) || periodos?.[0]?.prueba === 'estrategias') {
    if (!oficial) return 'sin veredicto'
    if (CRITERIOS[version]?.estrategias && !calibracionDe(lote, item)?.calibrada) return SIN_VEREDICTO_NO_CALIBRADA
    return veredictoLab(oficial, periodos)
  }
  const v = veredictoLab(oficial, periodos), esSalidas = esLoteSalidas(lote) || periodos?.[0]?.prueba === 'salidas'
  if (!oficial || !esSalidas) return v
  if (CRITERIOS[version]?.salidas === 'resimulado') {
    if (salidasNoCalibradas(reglas, version).length) return SIN_VEREDICTO_STOPS
    if (v === 'datos insuficientes') return v
    const r = conResimulado(periodos)
    return r ? veredictoLab(oficial, r) : 'no pasa'
  }
  if (v !== 'pasa' || !CRITERIOS[version]?.salidasConResimulado) return v
  const r = conResimulado(periodos)
  return r ? veredictoLab(oficial, r) : 'no pasa'
}
// La versión de criterio con que se lee una prueba: la de su lote si es oficial; la vigente si es exploratoria.
export const criterioDePrueba = ({ oficial, lote }, tipo = null) => oficial ? versionCriterio(lote) : tipo === 'estrategias' ? CRITERIO_ACTUAL_ESTRATEGIAS : CRITERIO_ACTUAL
// El criterio de una prueba en palabras (corto: para el historial).
// tipo: 'entradas' | 'salidas' | 'estrategias' (o true / false: salidas / entradas).
export function textoCriterio({ oficial, lote, item, salidas: reglas }, tipo, { corto = false } = {}) {
  const t = tipo === true ? 'salidas' : tipo === false || tipo == null ? 'entradas' : tipo, esSalidas = t === 'salidas'
  const v = criterioDePrueba({ oficial, lote }, t), c = CRITERIOS[v]
  if (t === 'estrategias') {
    const pre = oficial ? `Criterio ${v}` : `Exploratoria, sin veredicto (criterio vigente: ${v})`, cal = oficial ? calibracionDe(lote, item) : null
    const base = `pasa si la combinación está calibrada (falsos aprobados en un periodo <= ${CRITERIOS[4].maxFalsosAprobados} % con paseos aleatorios sin ventaja) y, en todos los periodos, hay al menos 100 operaciones y percentil de la media >= 95 frente a la misma estrategia al azar`
    if (corto) return !oficial ? `${v}: media frente a la estrategia al azar ≥ 95` : cal?.calibrada ? `${v}: calibrada · media frente al azar ≥ 95` : `${v}: sin veredicto (no calibrada)`
    return `${pre}: ${base}.` + (oficial ? (cal ? ` Esta combinación ${cal.calibrada ? 'SÍ' : 'NO'} está calibrada (${cal.pctAprobados} % de falsos aprobados en ${cal.universos} universos).` : ` Esta combinación no tiene calibración: ${SIN_VEREDICTO_NO_CALIBRADA}.`) : ' Las exploratorias no tienen calibración propia.')
  }
  const pre = oficial ? `Criterio ${v}` : `Exploratoria, sin veredicto (criterio vigente: ${v})`
  const regla = (azar) => `pasa si en todos los periodos hay al menos 100 operaciones y percentil de la media >= 95 ${azar}`
  if (!esSalidas) return corto ? `${v}: mediana, percentil ≥ 95` : `${pre}: pasa si en todos los periodos hay al menos 100 operaciones y percentil de la mediana >= 95 frente al azar.`
  if (c.salidas === 'resimulado') {
    const malas = salidasNoCalibradas(reglas, v)
    if (malas.length) return corto ? `${v}: sin veredicto (stops)` : `${pre}: ${SIN_VEREDICTO_STOPS} (${malas.join(', ')}). Con stops el re-simulado no está calibrado, y la permutación no sirve con salidas que dependen del precio.`
    return corto ? `${v}: media, re-simulado ≥ 95` : `${pre}: ${regla('con el azar RE-SIMULADO')}. La permutación es solo informativa: ${NOTA_PERMUTACION}.`
  }
  if (c.salidas === 'ambos') return corto ? `${v}: media, permutación y re-simulado ≥ 95` : `${pre}: ${regla('con el azar de permutación Y con el re-simulado')}.`
  return corto ? `${v}: media, permutación ≥ 95` : `${pre} (el declarado en el lote): ${regla('con el azar de permutación')}; el re-simulado se enseña al lado.`
}
// Nota para las pruebas de un lote de salidas con criterio 1 cuyo «pasa» registrado no se sostiene con el re-simulado. Se
// calcula de los resultados guardados (el registro es de solo añadir: no se reescribe). null si no toca o no se puede
// saber (sin re-simulado guardado).
export const NOTA_RESIMULADO = 'Pasa con el criterio declarado; no se sostiene con el azar re-simulado (V9.976)'
export function notaResimulado({ oficial, lote, veredicto, periodos }) {
  if (!oficial || veredicto !== 'pasa' || !esLoteSalidas(lote) || versionCriterio(lote) >= 2) return null
  const r = conResimulado(periodos)
  return r && veredictoLab(true, r) !== 'pasa' ? NOTA_RESIMULADO : null
}

// La configuración de una prueba —señales y parámetros, universo, periodos, temporalidad, entrada y salida— con la forma
// que se guarda en lab_pruebas.config. La de un elemento de lote se arma igual, así que una prueba libre con exactamente
// la misma configuración tiene la misma huella (y cuenta como oficial).
export function configDe({ disparador, filtros = [] }, { universo, periodos, intervalo, entrada, salida }) {
  return { senales: { disparador, filtros }, universo, periodos, intervalo, entrada, salida }
}
// La de una prueba de SALIDAS: entradas (las al azar del lote, o { tipo: 'senal', disparador, filtros } en las
// exploratorias), la lista de salidas (con «O») y lo común.
export function configSalidasDe({ salidas, entradas }, { universo, periodos, intervalo, entrada }) {
  return { prueba: 'salidas', entradas, salidas, universo, periodos, intervalo, entrada }
}
export const esConfigSalidas = (config) => config?.prueba === 'salidas'
export const esConfigEstrategias = (config) => config?.prueba === 'estrategias'
// La de una prueba de ESTRATEGIA COMPLETA: entrada (disparador y filtros del catálogo), salidas (con «O») y lo común.
export function configEstrategiaDe({ disparador, filtros = [], salidas }, { universo, periodos, intervalo, entrada }) {
  return { prueba: 'estrategias', senales: { disparador, filtros }, salidas, universo, periodos, intervalo, entrada }
}
export function configDeItem(lote, itemId) {
  const it = lote.items.find(x => x.id === itemId)
  if (!it) throw new Error(`El lote ${lote.id} no tiene el elemento «${itemId}».`)
  if (lote.tipo === 'estrategias') return configEstrategiaDe(it, lote.comun)
  return lote.tipo === 'salidas' ? configSalidasDe({ salidas: it.salidas, entradas: lote.comun.entradas }, lote.comun) : configDe(it, lote.comun)
}
// Errores de las señales de una configuración, sea de entradas (LOTE_1) o de salidas (LOTE_2).
export function validaConfig(config) {
  if (esConfigEstrategias(config)) return [...validaCombinacion(config?.senales || {}), ...validaSalidas(config?.salidas)]
  if (!esConfigSalidas(config)) return validaCombinacion(config?.senales || {})
  const e = [...validaSalidas(config.salidas)], en = config.entradas
  if (en?.tipo === 'senal') e.push(...validaCombinacion(en))
  else if (en?.tipo === 'azar') {
    if (!(typeof en.probabilidad === 'number' && en.probabilidad > 0 && en.probabilidad <= 1)) e.push('La probabilidad de entrada tiene que estar entre 0 y 1.')
    if (!Number.isInteger(en.semilla)) e.push('Las entradas al azar necesitan una semilla entera.')
    if (!Array.isArray(en.calentamiento)) e.push('Las entradas al azar necesitan su calentamiento.')
  } else e.push('Faltan las entradas (al azar o un disparador).')
  return e
}
// Errores de un lote: elementos con señales no válidas o ids repetidos.
export function validaLote(lote) {
  const errores = [], vistos = new Set()
  for (const it of lote.items) {
    if (vistos.has(it.id)) errores.push(`Elemento repetido: ${it.id}.`)
    vistos.add(it.id)
    errores.push(...validaConfig(configDeItem(lote, it.id)).map(e => `${it.id}: ${e}`))
  }
  return errores
}
