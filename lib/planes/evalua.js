// lib/planes/evalua.js — un plan y sus REFERENCIAS con los mismos flujos, y los inicios rodantes (docs/planes-inversion.md,
// §3–§4, decisiones 6–8). Puro.
//
// Referencias (decisión 7): el MISMO dinero, en las mismas fechas, con los mismos costes e impuestos y la misma liquidación
// final, metido en: QQQ (comprar y mantener), SPY, 50 % QQQ + 50 % del ETF del plan con rebalanceo anual (la pieza base sin
// reglas: dice cuánto aportan las reglas) y liquidez al 0 % (lo aportado). Se ejecutan con el mismo motor (lib/planes/plan.js),
// así que la comparación es exacta: solo cambian las piezas.
// Veredicto (decisión 6): por TWR NETO (tras costes e impuestos, liquidando al final) frente a cada referencia. La TIR se da
// siempre, solo informativa. El criterio oficial de un lote de planes queda para cuando se decida dónde viven (decisión 10).
import { ejecutaPlan, usaEtf } from './plan'
import { medidasPlan } from './medidas'
import { reglaMezcla } from '../lotesLab'

const base = (plan, piezas) => ({ ...plan, piezas, reparto: { aportacionesA: 'pesos', rebalanceo: { calendario: 'nunca', banda: null } } })
export function referenciasDe(plan, { conEtf = !!plan.etf } = {}) {
  const out = [
    { id: 'QQQ', nombre: 'Lo mismo a QQQ (comprar y mantener)', plan: base(plan, [{ id: 'ref', tipo: 'activo', activo: 'QQQ', peso: 1 }]) },
    { id: 'SPY', nombre: 'Lo mismo a SPY (comprar y mantener)', plan: base(plan, [{ id: 'ref', tipo: 'activo', activo: 'SPY', peso: 1 }]) },
  ]
  if (conEtf) out.push({ id: 'MEZCLA', nombre: `Lo mismo a 50 % QQQ + 50 % ${plan.etf} (rebalanceo anual)`, plan: base(plan, [{ id: 'ref', tipo: 'cartera', regla: reglaMezcla(50, 'anual'), peso: 1 }]) })
  out.push({ id: 'LIQUIDEZ', nombre: 'Lo mismo en liquidez (0 %)', plan: base(plan, [{ id: 'ref', tipo: 'activo', activo: 'LIQUIDEZ', peso: 1 }]) })
  return out
}

// Una ejecución con sus medidas (sin la serie diaria completa si resumen).
export function midePlan(plan, datos, { detalle = false } = {}) {
  const r = ejecutaPlan(plan, datos, { detalle })
  const m = medidasPlan({ serie: r.serie, flujos: r.flujos, valorNeto: r.valorNeto, impuestosPagados: r.impuestos?.pagados || 0, costesPagados: r.costes.pagados })
  return { medidas: m, ejecucion: r }
}

// El plan y sus referencias en el periodo del plan: medidas y la comparación por TWR neto.
export function evaluaPlan(plan, datos, { detalle = true } = {}) {
  const p = midePlan(plan, datos, { detalle })
  const refs = referenciasDe(plan, { conEtf: !!plan.etf && !!datos.etf?.[p.ejecucion.i0] }).map(x => ({ id: x.id, nombre: x.nombre, ...midePlan(x.plan, datos) }))
  const comparaciones = refs.map(x => ({ id: x.id, nombre: x.nombre, difTwrNeto: p.medidas.twrNeto - x.medidas.twrNeto, mejoraTwr: p.medidas.twrNeto > x.medidas.twrNeto,
    difTir: p.medidas.tir != null && x.medidas.tir != null ? p.medidas.tir - x.medidas.tir : null, difValorNeto: p.medidas.valorNeto - x.medidas.valorNeto }))
  return { plan: { medidas: p.medidas, ejecucion: detalle ? p.ejecucion : resumenEjecucion(p.ejecucion) }, referencias: refs.map(x => ({ id: x.id, nombre: x.nombre, medidas: x.medidas })), comparaciones }
}
const resumenEjecucion = (r) => ({ valorNeto: r.valorNeto, aportado: r.aportado, patrimonio: r.patrimonio, costes: r.costes, impuestos: r.impuestos ? { pagados: r.impuestos.pagados, final: r.impuestos.final, porAnio: r.impuestos.porAnio } : null, rebalanceosPiezas: r.rebalanceosPiezas })

// Inicios rodantes (decisión 8): el plan desde el 1 de enero de cada año, con `duracion` años (o hasta el final de los datos
// si se pide `hastaElFinal`), dentro del rango [desde, hasta]. Para cada inicio, el TWR neto y la TIR del plan y de cada
// referencia; y el resumen: mediana, peor y mejor, y en cuántos inicios el plan gana a cada referencia por TWR neto.
export function iniciosRodantes(plan, datos, { desde, hasta, duracion = 10, hastaElFinal = false } = {}) {
  const f0 = desde || datos.fechas[0], f1 = hasta || datos.fechas[datos.fechas.length - 1]
  const filas = []
  for (let y = Number(f0.slice(0, 4)); ; y++) {
    const d = `${y}-01-01`, h = hastaElFinal ? f1 : `${y + duracion - 1}-12-31`
    if (d < f0) continue
    if (h > f1 || d >= f1) break
    const p = { ...plan, periodo: { desde: d, hasta: h } }
    try {
      const e = evaluaPlan(p, datos, { detalle: false })
      filas.push({ desde: d, hasta: h, plan: corto(e.plan.medidas), referencias: Object.fromEntries(e.referencias.map(x => [x.id, corto(x.medidas)])) })
    } catch (_) { /* sin datos para ese inicio (p. ej., el ETF aún no existía): se salta */ }
  }
  const resumen = (vals) => { const v = vals.filter(Number.isFinite).sort((a, b) => a - b); return v.length ? { n: v.length, mediana: v[Math.floor((v.length - 1) / 2)] / 2 + v[Math.ceil((v.length - 1) / 2)] / 2, peor: v[0], mejor: v[v.length - 1] } : null }
  const ids = filas.length ? Object.keys(filas[0].referencias) : []
  return { duracion: hastaElFinal ? null : duracion, filas,
    resumen: { plan: { twrNeto: resumen(filas.map(f => f.plan.twrNeto)), tir: resumen(filas.map(f => f.plan.tir)) },
      referencias: Object.fromEntries(ids.map(id => [id, { twrNeto: resumen(filas.map(f => f.referencias[id]?.twrNeto)), gana: filas.filter(f => f.plan.twrNeto > f.referencias[id]?.twrNeto).length }])) } }
}
const corto = (m) => ({ twrNeto: m.twrNeto, twr: m.twr, tir: m.tir, caida: m.caida.caida, valorNeto: m.valorNeto, aportado: m.aportado, diasDebajoAportado: m.frenteAportado.diasDebajo })
export { usaEtf }
