// lib/lotesLab.js — lotes OFICIALES del laboratorio de señales: configuraciones declaradas de antemano, congeladas, con su
// huella. Una prueba solo es «oficial» si su configuración coincide exactamente (misma huella) con un elemento de un lote
// declarado aquí; cualquier otra es «exploratoria» (lib/registroLab.js). Puro (la huella usa crypto.subtle, que existe
// igual en el navegador y en Node).
//
// HUELLA: sha256 del JSON CANÓNICO (claves de los objetos en orden, sin espacios; los arrays conservan su orden). La del
// lote entero está escrita abajo (LOTE_1_HASH) y la comprueba una prueba: si alguien toca el lote, deja de cuadrar.
import { validaCombinacion } from './senales'

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
export const LOTES = congela({ LOTE_1 })

// La configuración de una prueba —señales y parámetros, universo, periodos, temporalidad, entrada y salida— con la forma
// que se guarda en lab_pruebas.config. La de un elemento de lote se arma igual, así que una prueba libre con exactamente
// la misma configuración tiene la misma huella (y cuenta como oficial).
export function configDe({ disparador, filtros = [] }, { universo, periodos, intervalo, entrada, salida }) {
  return { senales: { disparador, filtros }, universo, periodos, intervalo, entrada, salida }
}
export function configDeItem(lote, itemId) {
  const it = lote.items.find(x => x.id === itemId)
  if (!it) throw new Error(`El lote ${lote.id} no tiene el elemento «${itemId}».`)
  return configDe(it, lote.comun)
}
// Errores de un lote: elementos con señales no válidas o ids repetidos.
export function validaLote(lote) {
  const errores = [], vistos = new Set()
  for (const it of lote.items) {
    if (vistos.has(it.id)) errores.push(`Elemento repetido: ${it.id}.`)
    vistos.add(it.id)
    errores.push(...validaCombinacion(it).map(e => `${it.id}: ${e}`))
  }
  return errores
}
