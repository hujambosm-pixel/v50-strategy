// lib/editor/lotes.js — LOTES del editor (docs/editor-visual.md, E10; decisiones 4 y 5). Puro.
//
// Un lote se declara desde la pantalla ANTES de ver resultados y queda congelado (tabla editor_lotes, de solo añadir:
// sql/editor_lotes.sql) con su huella. Los lotes antiguos (LOTE_1–3, CARTERA_1–3) siguen en lib/lotesLab.js sin cambios.
//
// FORMATO 1:
// {
//   formato: 1, nombre, descripcion?,
//   comun: { symbols: [...], intervalo: 'diario' | 'semanal', desde, hasta, capitalIni, modoAsig: 'concentrado' |
//            'compartido', sizeRules: { maxPosiciones, prioridad, criterioUso, rsWindow, … }, comisiones, nSim },
//   variantes: [{ id, definicion (del editor, formato 1), valores: { parámetro: valor } }, …],   // de 1 a MAX_VARIANTES
// }
// La HUELLA del lote: sha256 del JSON canónico de { formato, comun, variantes: [{ id, huella de su definición con sus
// valores }] } (sin nombres ni descripciones): dos lotes que prueban lo mismo tienen la misma.
//
// EJECUCIÓN (decisión 5: de momento, el A / B del multibacktest). Cada variante: /api/multibacktest con su definición en la
// petición (definicionEditor + paramsEditor) y conCandidatos: true; después, en el navegador, la prueba A (señal al azar,
// misma asignación) y la B (señal real, orden al azar) de lib/azarCartera.js, con una semilla que sale de la huella del lote
// y del id de la variante. Sin filtros (la prueba los excluye) y sin Position Sizing.
//
// CRITERIO (fijo, declarado aquí): una variante «supera al azar» si el percentil de su CAGR en la prueba A es ≥ 95 (la
// señal elige mejores momentos que el azar con la misma asignación). La B se enseña, sin veredicto del lote. Con K
// variantes, por pura suerte se esperan K × 5 % aprobadas: el resultado del lote lo dice al lado.
import { jsonCanonico, sha256Hex } from '../lotesLab'
import { validaDefinicion, huellaDefinicion } from './definicion'
import { esDefinicionEditor } from './fuente'
import { semillaDe, AZAR } from '../azar'

export const FORMATO_LOTE = 1
export const MAX_VARIANTES = 20
export const PERCENTIL_SUPERA = AZAR.supera
const MODOS = ['concentrado', 'compartido']
const fecha = (x) => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x)
const RE_SIMBOLO = /^\^?[A-Z0-9][A-Z0-9.=-]{0,14}$/

export function validaLote(lote) {
  const e = []
  if (!lote || lote.formato !== FORMATO_LOTE) return [`El lote tiene que ser del formato ${FORMATO_LOTE}.`]
  if (!String(lote.nombre || '').trim()) e.push('El lote necesita un nombre.')
  const c = lote.comun || {}
  if (!Array.isArray(c.symbols) || c.symbols.length < 2 || c.symbols.length > 150 || !c.symbols.every(s => RE_SIMBOLO.test(s)) || new Set(c.symbols).size !== c.symbols.length) e.push('Los activos: de 2 a 150 símbolos de Yahoo, sin repetir.')
  if (!['diario', 'semanal'].includes(c.intervalo)) e.push('La temporalidad tiene que ser diaria o semanal.')
  if (!fecha(c.desde) || !fecha(c.hasta) || !(c.desde < c.hasta)) e.push('El periodo necesita dos fechas (desde < hasta).')
  if (!(Number.isFinite(c.capitalIni) && c.capitalIni >= 100)) e.push('El capital inicial, al menos 100.')
  if (!MODOS.includes(c.modoAsig)) e.push('El reparto tiene que ser concentrado o compartido (la prueba contra el azar no admite slots ni Position Sizing).')
  if (!(Number.isInteger(c.sizeRules?.maxPosiciones) && c.sizeRules.maxPosiciones >= 1 && c.sizeRules.maxPosiciones <= 50)) e.push('El número máximo de posiciones, de 1 a 50.')
  if (!(Number.isInteger(c.nSim) && c.nSim >= AZAR.minSimulaciones && c.nSim <= AZAR.maxSimulaciones)) e.push(`Las simulaciones, de ${AZAR.minSimulaciones} a ${AZAR.maxSimulaciones}.`)
  const vs = lote.variantes
  if (!Array.isArray(vs) || !vs.length || vs.length > MAX_VARIANTES) e.push(`De 1 a ${MAX_VARIANTES} variantes.`)
  else {
    const ids = new Set()
    vs.forEach((v, k) => {
      const d = `Variante ${v?.id || k + 1}`
      if (!/^[A-Za-z0-9_-]{1,12}$/.test(v?.id || '') || ids.has(v.id)) e.push(`${d}: necesita un id corto (letras, números, - o _) distinto de los demás.`)
      ids.add(v?.id)
      if (!esDefinicionEditor(v?.definicion)) { e.push(`${d}: no es una definición del editor.`); return }
      e.push(...validaDefinicion(v.definicion, v.valores || {}).map(x => `${d}: ${x}`))
    })
  }
  return e
}

// La huella de cada variante (la de su definición con sus valores) y la del lote.
export async function huellasLote(lote) {
  const variantes = []
  for (const v of lote.variantes) variantes.push({ id: v.id, huella: await huellaDefinicion(v.definicion, v.valores || {}) })
  const lote_ = await sha256Hex(jsonCanonico({ formato: lote.formato, comun: lote.comun, variantes }))
  return { lote: lote_, variantes }
}

// La petición a /api/multibacktest de una variante (conCandidatos: la prueba contra el azar la necesita).
export function peticionVariante(lote, v) {
  const c = lote.comun
  const sizeRules = { ...c.sizeRules }
  return {
    symbols: c.symbols, modoAsig: c.modoAsig, sizeRules, intervalo: c.intervalo, filtros: [], comisiones: c.comisiones || null,
    cfg: { capitalIni: c.capitalIni, fromDate: c.desde, toDate: c.hasta, sizeRules },
    definicionEditor: v.definicion, paramsEditor: v.valores || {}, conCandidatos: true,
  }
}
// La semilla de la prueba contra el azar de una variante: de la huella del lote y su id (se repite siempre igual).
export const semillaVariante = (huellaLote, id) => semillaDe(`editor-lote|${huellaLote}|${id}`)

// El veredicto de una variante con el criterio declarado y el resumen del lote.
export const superaAzar = (resA) => resA?.cagr?.percentil != null && resA.cagr.percentil >= PERCENTIL_SUPERA
export function resumenLote(resultados) {
  const k = resultados.length, pasan = resultados.filter(r => superaAzar(r.A)).length
  return { variantes: k, superan: pasan, esperadasPorSuerte: k * (100 - PERCENTIL_SUPERA) / 100,
    texto: `${pasan} de ${k} variante${k === 1 ? '' : 's'} supera${pasan === 1 ? '' : 'n'} al azar (percentil del CAGR en la prueba A ≥ ${PERCENTIL_SUPERA}). Por pura suerte se esperarían ${String(Math.round(k * (100 - PERCENTIL_SUPERA)) / 100).replace('.', ',')}${pasan <= k * (100 - PERCENTIL_SUPERA) / 100 ? ': el resultado no se distingue de la suerte.' : '.'}` }
}
