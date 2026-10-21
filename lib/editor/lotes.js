// lib/editor/lotes.js — LOTES del editor (docs/editor-visual.md, E10; decisiones 4 y 5). Puro.
//
// Un lote se declara desde la pantalla ANTES de ver resultados y queda congelado (tabla editor_lotes, de solo añadir:
// sql/editor_lotes.sql) con su huella. Los lotes antiguos (LOTE_1–3, CARTERA_1–3) siguen en lib/lotesLab.js sin cambios.
//
// FORMATO 1:
// {
//   formato: 1, nombre, descripcion?,
//   comun: { universo, periodos, intervalo: 'diario' | 'semanal', capitalIni, modoAsig: 'concentrado' | 'compartido',
//            sizeRules: { maxPosiciones, prioridad, criterioUso, rsWindow, … }, comisiones, nSim },
//   variantes: [{ id, nombre?, definicion (del editor, formato 1), valores: { parámetro: valor } }, …],   // 1 a MAX_VARIANTES
// }
//   universo (V9.1024): { tipo: 'lista', symbols: [...] } o { tipo: 'ndx', regla: 'momentum' | 'volatilidad', n: 10 | 20 | 30 }
//     (el universo dinámico del Nasdaq-100 del multibacktest: los N elegidos cada año por la regla, con la máscara de
//     entradas; solo con reparto concentrado y desde 2016). Entra en la huella la REGLA, no la lista de cada año (sale de la
//     base, universo_screener; cada ejecución guarda la huella de la selección de cada periodo para ver si cambió).
//   periodos (V9.1024): [{ desde, hasta }, …], de 1 a MAX_PERIODOS; el resultado y el veredicto van por periodo.
//   Los lotes congelados antes de V9.1024 llevan comun.symbols, comun.desde y comun.hasta: se siguen leyendo igual
//   (comunNormal), con su misma huella y sus mismas semillas.
//   nombre de la variante (V9.1024): legible, para la pantalla y los textos; NO entra en la huella (como el del lote).
// La HUELLA del lote: sha256 del JSON canónico de { formato, comun, variantes: [{ id, huella de su definición con sus
// valores }] } (sin nombres ni descripciones): dos lotes que prueban lo mismo tienen la misma.
//
// EJECUCIÓN (decisión 5: de momento, el A / B del multibacktest). Cada variante y periodo: /api/multibacktest con su
// definición en la petición (definicionEditor + paramsEditor) y conCandidatos: true (con universo dinámico, también su
// máscara); después, en el navegador, la prueba A (señal al azar, misma asignación) y la B (señal real, orden al azar) de
// lib/azarCartera.js, con una semilla que sale de la huella del lote, el id de la variante y el periodo. Sin filtros (la
// prueba los excluye) y sin Position Sizing.
//
// CRITERIO (fijo, declarado aquí): una variante «supera al azar» en un periodo si el percentil de su CAGR en la prueba A es
// ≥ 95 (la señal elige mejores momentos que el azar con la misma asignación), y el LOTE la da por buena solo si supera en
// TODOS sus periodos. La B se enseña, sin veredicto del lote. Con K variantes, por pura suerte se esperarían como mucho
// K × 5 % que superan (en un periodo; en todos, menos): el resultado del lote lo dice al lado.
import { jsonCanonico, sha256Hex } from '../lotesLab'
import { validaDefinicion, huellaDefinicion } from './definicion'
import { esDefinicionEditor } from './fuente'
import { semillaDe, AZAR } from '../azar'

export const FORMATO_LOTE = 1
export const MAX_VARIANTES = 20
export const MAX_PERIODOS = 6
export const PERCENTIL_SUPERA = AZAR.supera
export const INICIO_UNIVERSO_NDX = '2016-01-01'
export const N_UNIVERSO = [10, 20, 30]
export const REGLAS_UNIVERSO = { momentum: 'con más momentum de 12 meses', volatilidad: 'más volátiles del año anterior' }
export const PERIODOS_DEFECTO = Object.freeze([{ desde: '2016-01-01', hasta: '2020-12-31' }, { desde: '2021-01-01', hasta: '2025-12-31' }])
const MODOS = ['concentrado', 'compartido']
const fecha = (x) => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x)
const RE_SIMBOLO = /^\^?[A-Z0-9][A-Z0-9.=-]{0,14}$/

// Lo común con el universo y los periodos explícitos (un lote de antes de V9.1024: su lista y su único periodo).
export function comunNormal(c = {}) {
  return { ...c, universo: c.universo || { tipo: 'lista', symbols: c.symbols || [] }, periodos: c.periodos || [{ desde: c.desde, hasta: c.hasta }] }
}
export const esUniversoDinamico = (u) => u?.tipo === 'ndx'
export const nombreUniversoLote = (u) => esUniversoDinamico(u) ? `Nasdaq-100 · ${u.n} ${REGLAS_UNIVERSO[u.regla] || u.regla}` : `lista fija de ${(u?.symbols || []).length} activos`
// El nombre legible de una variante (los lotes de antes de V9.1024 solo tienen id).
export const nombreVariante = (v) => (v?.nombre || '').trim() || v?.id || '—'

export function validaLote(lote) {
  const e = []
  if (!lote || lote.formato !== FORMATO_LOTE) return [`El lote tiene que ser del formato ${FORMATO_LOTE}.`]
  if (!String(lote.nombre || '').trim()) e.push('El lote necesita un nombre.')
  const c = comunNormal(lote.comun)
  const u = c.universo
  if (esUniversoDinamico(u)) {
    if (!REGLAS_UNIVERSO[u.regla] || !N_UNIVERSO.includes(u.n)) e.push(`El universo dinámico: regla momentum o volatilidad y N de ${N_UNIVERSO.join(', ')}.`)
    if (c.modoAsig !== 'concentrado') e.push('Con universo dinámico, el reparto tiene que ser concentrado (como en el multibacktest).')
  } else if (u?.tipo === 'lista') {
    const s = u.symbols
    if (!Array.isArray(s) || s.length < 2 || s.length > 150 || !s.every(x => RE_SIMBOLO.test(x)) || new Set(s).size !== s.length) e.push('Los activos: de 2 a 150 símbolos de Yahoo, sin repetir.')
  } else e.push('El universo tiene que ser una lista fija o el Nasdaq-100 dinámico.')
  const ps = c.periodos
  if (!Array.isArray(ps) || !ps.length || ps.length > MAX_PERIODOS) e.push(`De 1 a ${MAX_PERIODOS} periodos.`)
  else ps.forEach((p, k) => {
    if (!fecha(p?.desde) || !fecha(p?.hasta) || !(p.desde < p.hasta)) e.push(`Periodo ${k + 1}: necesita dos fechas (desde < hasta).`)
    else if (esUniversoDinamico(u) && p.desde < INICIO_UNIVERSO_NDX) e.push(`Periodo ${k + 1}: el universo dinámico empieza el 01/01/2016.`)
  })
  if (Array.isArray(ps) && new Set(ps.map(p => `${p?.desde}|${p?.hasta}`)).size !== ps.length) e.push('Hay periodos repetidos.')
  if (!['diario', 'semanal'].includes(c.intervalo)) e.push('La temporalidad tiene que ser diaria o semanal.')
  if (!(Number.isFinite(c.capitalIni) && c.capitalIni >= 100)) e.push('El capital inicial, al menos 100.')
  if (!MODOS.includes(c.modoAsig)) e.push('El reparto tiene que ser concentrado o compartido (la prueba contra el azar no admite slots ni Position Sizing).')
  if (!(Number.isInteger(c.sizeRules?.maxPosiciones) && c.sizeRules.maxPosiciones >= 1 && c.sizeRules.maxPosiciones <= 50)) e.push('El número máximo de posiciones, de 1 a 50.')
  if (!(Number.isInteger(c.nSim) && c.nSim >= AZAR.minSimulaciones && c.nSim <= AZAR.maxSimulaciones)) e.push(`Las simulaciones, de ${AZAR.minSimulaciones} a ${AZAR.maxSimulaciones}.`)
  const vs = lote.variantes
  if (!Array.isArray(vs) || !vs.length || vs.length > MAX_VARIANTES) e.push(`De 1 a ${MAX_VARIANTES} variantes.`)
  else {
    const ids = new Set(), nombres = new Set()
    vs.forEach((v, k) => {
      const d = `Variante ${nombreVariante(v) || k + 1}`
      if (!/^[A-Za-z0-9_-]{1,12}$/.test(v?.id || '') || ids.has(v.id)) e.push(`${d}: necesita un id corto (letras, números, - o _) distinto de los demás.`)
      ids.add(v?.id)
      if (v?.nombre !== undefined) { const nm = String(v.nombre).trim(); if (!nm || nm.length > 80) e.push(`Variante ${k + 1}: el nombre, de 1 a 80 caracteres.`); else if (nombres.has(nm)) e.push(`Variante ${k + 1}: el nombre «${nm}» está repetido.`); nombres.add(nm) }
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

// La petición a /api/multibacktest de una variante en un periodo (conCandidatos: la prueba contra el azar la necesita).
//   uPeriodo: con universo dinámico, el de lib/screener.js (universoDePeriodo) para ese periodo: { simbolos, mascara, elegidos }.
export function peticionVariante(lote, v, periodo = null, uPeriodo = null) {
  const c = comunNormal(lote.comun), p = periodo || c.periodos[0]
  const sizeRules = { ...c.sizeRules }
  const din = esUniversoDinamico(c.universo)
  return {
    symbols: din ? uPeriodo.simbolos : c.universo.symbols, modoAsig: c.modoAsig, sizeRules, intervalo: c.intervalo, filtros: [], comisiones: c.comisiones || null,
    cfg: { capitalIni: c.capitalIni, fromDate: p.desde, toDate: p.hasta, sizeRules },
    definicionEditor: v.definicion, paramsEditor: v.valores || {}, conCandidatos: true,
    ...(din ? { universo: { regla: c.universo.regla, n: c.universo.n, mascara: uPeriodo.mascara, elegidos: uPeriodo.elegidos } } : {}),
  }
}
// La semilla de la prueba contra el azar de una variante: de la huella del lote, su id, el periodo y la prueba (A o B); se
// repite siempre igual. Un lote de antes de V9.1024 (un solo periodo, sin `periodos`) conserva la suya: id y prueba.
export function semillaVariante(huellaLote, id, periodo = null, tipo = null, comun = null) {
  if (!periodo) return semillaDe(`editor-lote|${huellaLote}|${id}`)
  return comun && !comun.periodos ? semillaDe(`editor-lote|${huellaLote}|${id}|${tipo}`) : semillaDe(`editor-lote|${huellaLote}|${id}|${periodo.desde}|${periodo.hasta}|${tipo}`)
}

// El veredicto con el criterio declarado: por periodo, y la variante en el lote (en TODOS sus periodos).
export const superaAzar = (resA) => resA?.cagr?.percentil != null && resA.cagr.percentil >= PERCENTIL_SUPERA
export const superaEnTodos = (r) => Array.isArray(r?.periodos) ? r.periodos.length > 0 && r.periodos.every(p => superaAzar(p.A)) : superaAzar(r?.A)
const fmt2 = (x) => String(Math.round(x * 100) / 100).replace('.', ',')
export function resumenLote(resultados, nPeriodos = 1) {
  const k = resultados.length, pasan = resultados.filter(superaEnTodos).length, esperadas = k * (100 - PERCENTIL_SUPERA) / 100
  const criterio = nPeriodos > 1 ? `percentil del CAGR en la prueba A ≥ ${PERCENTIL_SUPERA} en los ${nPeriodos} periodos` : `percentil del CAGR en la prueba A ≥ ${PERCENTIL_SUPERA}`
  return { variantes: k, superan: pasan, esperadasPorSuerte: esperadas, nPeriodos,
    texto: `${pasan} de ${k} variante${k === 1 ? '' : 's'} supera${pasan === 1 ? '' : 'n'} al azar (${criterio}). Por pura suerte se esperarían ${nPeriodos > 1 ? 'como mucho ' : ''}${fmt2(esperadas)}${pasan <= esperadas ? ': el resultado no se distingue de la suerte.' : '.'}` }
}
// La huella de la selección del universo dinámico en un periodo (para ver si universo_screener cambió entre ejecuciones).
export const huellaSeleccion = (elegidos) => sha256Hex(jsonCanonico(elegidos || {}))
