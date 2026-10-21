// lib/planes/lotes.js — LOTES DE PLANES (docs/planes-inversion.md, decisión 10: en la tabla editor_lotes). Puro.
//
// Viven en editor_lotes (de solo añadir, RLS «dueño») con `tipo: 'planes'` dentro del formato 1 que exige la tabla. Los
// lotes de estrategias del editor (sin `tipo`) no cambian: ni su formato, ni su validación, ni su huella (lib/editor/lotes.js).
//
// FORMATO 1 (tipo 'planes'):
// {
//   formato: 1, tipo: 'planes', nombre, descripcion?,
//   comun: { referencia: 'MEZCLA' | 'QQQ' | 'SPY', rodantes: null | { duracion } },
//   variantes: [{ id, nombre?, plan }, …],   // de 1 a MAX_VARIANTES; cada plan, el formato de lib/planes/plan.js
// }
// Para que la comparación sea justa, todas las variantes tienen el MISMO dinero, periodo, impuestos y costes: solo cambian
// las piezas, el reparto y el ETF.
// HUELLA: sha256 del JSON canónico de { formato, tipo, comun, variantes: [{ id, huella del plan }] } (sin nombres).
//
// CRITERIO (versión 1, propuesta de §5): una variante MEJORA si su TWR NETO (decisión 6) supera al de la referencia con los
// mismos flujos (por defecto, la mezcla 50 % QQQ + 50 % ETF sin reglas, que dice cuánto aportan las reglas) en el periodo
// del plan y, si hay inicios rodantes, en más de la mitad de ellos. Batir al QQQ se enseña, pero prueba poco. Con K
// variantes, alguna puede mejorar por suerte: el resumen lo dice. Sin azar todavía (P10).
import { jsonCanonico, sha256Hex } from '../lotesLab'
import { validaPlan, huellaPlan, usaEtf } from './plan'
import { evaluaPlan, iniciosRodantes } from './evalua'

export const TIPO_LOTE_PLANES = 'planes'
export const FORMATO_LOTE_PLANES = 1
export const MAX_VARIANTES_PLANES = 10
export const VERSION_CRITERIO_PLANES = 1
export const REFERENCIAS_CRITERIO = ['MEZCLA', 'QQQ', 'SPY']
export const esLotePlanes = (lote) => lote?.tipo === TIPO_LOTE_PLANES
const comunDe = (plan) => ({ dinero: plan?.dinero, periodo: plan?.periodo, impuestos: plan?.impuestos, costes: plan?.costes ?? null })

export function validaLotePlanes(lote) {
  const e = []
  if (!lote || lote.formato !== FORMATO_LOTE_PLANES || !esLotePlanes(lote)) return [`El lote tiene que ser de formato ${FORMATO_LOTE_PLANES} y tipo «${TIPO_LOTE_PLANES}».`]
  if (!String(lote.nombre || '').trim()) e.push('El lote necesita un nombre.')
  const c = lote.comun || {}
  if (!REFERENCIAS_CRITERIO.includes(c.referencia)) e.push(`La referencia del criterio: ${REFERENCIAS_CRITERIO.join(', ')}.`)
  if (c.rodantes != null && !(Number.isInteger(c.rodantes.duracion) && c.rodantes.duracion >= 1 && c.rodantes.duracion <= 30)) e.push('Los inicios rodantes, de 1 a 30 años.')
  const vs = lote.variantes
  if (!Array.isArray(vs) || !vs.length || vs.length > MAX_VARIANTES_PLANES) { e.push(`De 1 a ${MAX_VARIANTES_PLANES} variantes.`); return e }
  const ids = new Set(), nombres = new Set()
  vs.forEach((v, k) => {
    const d = `Variante ${v?.nombre || v?.id || k + 1}`
    if (!/^[A-Za-z0-9_-]{1,12}$/.test(v?.id || '') || ids.has(v.id)) e.push(`${d}: necesita un id corto distinto de los demás.`)
    ids.add(v?.id)
    if (v?.nombre != null) { const n = String(v.nombre).trim(); if (!n || nombres.has(n)) e.push(`${d}: el nombre tiene que existir y no repetirse.`); nombres.add(n) }
    e.push(...validaPlan(v?.plan).map(x => `${d}: ${x}`))
    if (c.referencia === 'MEZCLA' && v?.plan && !v.plan.etf) e.push(`${d}: la referencia «MEZCLA» necesita el ETF del plan.`)
  })
  const base = jsonCanonico(comunDe(vs[0]?.plan))
  if (vs.some(v => jsonCanonico(comunDe(v?.plan)) !== base)) e.push('Todas las variantes tienen que tener el mismo dinero, periodo, impuestos y costes (solo cambian las piezas, el reparto y el ETF).')
  return e
}

export async function huellasLotePlanes(lote) {
  const variantes = []
  for (const v of lote.variantes) variantes.push({ id: v.id, huella: await huellaPlan(v.plan) })
  return { lote: await sha256Hex(jsonCanonico({ formato: lote.formato, tipo: lote.tipo, comun: lote.comun, variantes })), variantes }
}

// Una variante ejecutada: el plan, sus referencias, los inicios rodantes y su veredicto con el criterio del lote.
export function evaluaVariante(lote, v, datos) {
  const ref = lote.comun.referencia
  const e = evaluaPlan(v.plan, datos, { detalle: false })
  const comp = e.comparaciones.find(x => x.id === ref)
  const ro = lote.comun.rodantes ? iniciosRodantes(v.plan, datos, { desde: v.plan.periodo.desde, hasta: v.plan.periodo.hasta, duracion: lote.comun.rodantes.duracion }) : null
  const nRo = ro?.filas?.length || 0, ganaRo = ro ? ro.resumen.referencias[ref]?.gana ?? 0 : 0
  const mejora = !!comp?.mejoraTwr && (!ro || (nRo > 0 && ganaRo > nRo / 2))
  return { id: v.id, nombre: v.nombre || v.id, medidas: e.plan.medidas, referencias: e.referencias, comparaciones: e.comparaciones,
    rodantes: ro ? { duracion: ro.duracion, n: nRo, ganaA: ganaRo, resumen: ro.resumen } : null,
    veredicto: comp ? (mejora ? 'mejora' : 'no mejora') : 'sin referencia' }
}
export function resumenLotePlanes(resultados, referencia) {
  const k = resultados.length, m = resultados.filter(r => r.veredicto === 'mejora').length
  return { variantes: k, mejoran: m, referencia, version: VERSION_CRITERIO_PLANES,
    texto: `${m} de ${k} variante${k === 1 ? '' : 's'} mejora${m === 1 ? '' : 'n'} a la referencia (${referencia}) por TWR neto${resultados.some(r => r.rodantes) ? ' en el periodo y en más de la mitad de los inicios rodantes' : ''}. Sin prueba contra el azar todavía: con varias variantes, alguna puede mejorar por suerte.` }
}
export { usaEtf }
