// lib/planes/lista.js — «Una lista» en el bloque de un plan (fase 3 de «el plan con lista», docs/builder.md §80). Lo que se guarda
// en la pieza «estrategia» cuando se aplica a una lista de valores en lugar de a una acción:
//   { …, donde: 'lista', lista: { universo, simbolos, modo, maxPosiciones, prioridad, criterioUso, momentumN, rsWindow, calculoPrioridad,
//     rsGateThr, momGateThr, proxGateThr, riskPerTrade, maxPortfolioPct, maxAccumRisk, assumedStopPct, pesos, filtros } }
// Son los mismos ajustes que el panel izquierdo del Backtesting (components/backtesting/, elementos 3–10, 12–14 del inventario), con
// los mismos valores admitidos (lib/mcAsignacion.js y lib/filtros.js), pero GUARDADOS CON EL PLAN (no en el navegador). Un plan de
// «Una acción» no lleva ni `donde` ni `lista`: es exactamente el de antes.
// Los valores de partida son los de una instalación nueva del Backtesting (ASIG_MC_DEFAULT y los useState de pages/index.js), salvo
// los filtros, que empiezan SIN NINGUNO (decisión del 06/11: en el Backtesting vienen con «Benchmark > EMA 10» encendido).
import { ASIG_MC_DEFAULT, mergeAsignacionMc } from '../mcAsignacion'
import { mergeFiltros } from '../filtros'
import { nDeUniverso } from '../universoMc'

export const DONDE = ['accion', 'lista']
export const MODOS_LISTA = ['slots', 'compartido', 'concentrado', 'positionsizing']
export const UNIVERSOS = ['manual', ...[10, 20, 30].flatMap(n => [`ndx_vol_${n}`, `ndx_mom_${n}`])]

export const LISTA_DEFECTO = Object.freeze({
  universo: 'manual', simbolos: Object.freeze([]),
  modo: ASIG_MC_DEFAULT.modo, maxPosiciones: ASIG_MC_DEFAULT.maxPosiciones, prioridad: ASIG_MC_DEFAULT.prioridad, criterioUso: ASIG_MC_DEFAULT.criterioUso,
  momentumN: ASIG_MC_DEFAULT.momentumN, rsWindow: ASIG_MC_DEFAULT.rsWindow, calculoPrioridad: 2, rsGateThr: 0, momGateThr: 10, proxGateThr: 10,
  riskPerTrade: 5, maxPortfolioPct: 20, maxAccumRisk: 20, assumedStopPct: 20,
  pesos: Object.freeze({}), filtros: Object.freeze([]),
})

// Un número de verdad (también «12» o «12,5» tecleados) dentro de [min, max]; si no, el de partida.
const num = (v, min, max, def) => { const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(',', '.')); return String(v ?? '').trim() !== '' && Number.isFinite(n) && n >= min && n <= max ? n : def }
const simbolo = (s) => typeof s === 'string' && /^[A-Za-z0-9.^=_-]{1,20}$/.test(s)

// Siempre un objeto nuevo y completo, con cada campo válido (uno que no lo es vuelve a su valor de partida, sin tocar los demás).
export function mergeLista(raw) {
  const d = LISTA_DEFECTO, r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const asig = mergeAsignacionMc({ modo: r.modo, maxPosiciones: num(r.maxPosiciones, 1, 20, d.maxPosiciones), prioridad: r.prioridad, criterioUso: r.criterioUso, momentumN: num(r.momentumN, 5, 120, d.momentumN), rsWindow: num(r.rsWindow, 2, 500, d.rsWindow) })
  const simbolos = Array.isArray(r.simbolos) ? [...new Set(r.simbolos.filter(simbolo))] : []
  const pesos = {}
  if (r.pesos && typeof r.pesos === 'object' && !Array.isArray(r.pesos)) for (const s of simbolos) if (s in r.pesos) pesos[s] = num(r.pesos[s], 0, 100, 0)
  return {
    universo: UNIVERSOS.includes(r.universo) ? r.universo : d.universo, simbolos,
    modo: asig.modo, maxPosiciones: asig.maxPosiciones, prioridad: asig.prioridad, criterioUso: asig.criterioUso, momentumN: asig.momentumN, rsWindow: asig.rsWindow,
    calculoPrioridad: r.calculoPrioridad === 1 ? 1 : 2,
    rsGateThr: num(r.rsGateThr, -100, 1000, d.rsGateThr), momGateThr: num(r.momGateThr, -100, 1000, d.momGateThr), proxGateThr: num(r.proxGateThr, 0, 100, d.proxGateThr),
    riskPerTrade: num(r.riskPerTrade, 0.1, 100, d.riskPerTrade), maxPortfolioPct: num(r.maxPortfolioPct, 1, 100, d.maxPortfolioPct), maxAccumRisk: num(r.maxAccumRisk, 1, 1000, d.maxAccumRisk), assumedStopPct: num(r.assumedStopPct, 0.1, 100, d.assumedStopPct),
    pesos, filtros: Array.isArray(r.filtros) ? mergeFiltros(r.filtros) : [],
  }
}

// Los errores de una lista (para validaPiezaEstrategia). Una lista guardada siempre es la de mergeLista: aquí solo lo que el usuario
// tiene que arreglar.
export function validaLista(l) {
  const e = []
  if (!l || typeof l !== 'object') return ['la lista de valores falta.']
  if (!UNIVERSOS.includes(l.universo)) e.push('el universo: la lista manual o el Nasdaq-100.')
  if (l.universo === 'manual' && !(Array.isArray(l.simbolos) && l.simbolos.length)) e.push('elige al menos un valor de la lista.')
  if (!MODOS_LISTA.includes(l.modo)) e.push('el reparto dentro de la lista: slots iguales, capital compartido, capital concentrado o Position Sizing.')
  if (nDeUniverso(l.universo) && l.modo !== 'concentrado') e.push('con el Nasdaq-100, el reparto tiene que ser «Capital concentrado».')
  return e
}

export const esLista = (pieza) => pieza?.donde === 'lista'
