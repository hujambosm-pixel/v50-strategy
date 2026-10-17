// lib/exploracionCartera.js — EXPLORACIONES del laboratorio de cartera (lib/lotesLab.js, EXPLORACIONES): la curva de riesgo y
// el mapa de sensibilidad. Puro (el motor es lib/laboratorioCartera.js). No dan veredicto: sirven para ver la FORMA de los
// resultados y elegir el nivel de riesgo, no para escoger el máximo (con pocos ciclos, el mejor valor suele ser suerte).
//
// CURVA DE RIESGO. Para un ETF y dos familias —Mezcla fija con rebalanceo anual y Regla simple (caída 10 %, ventana 252)—,
// el % de la cartera en el ETF de 0 a 100: en la mezcla, el peso del ETF; en la regla simple, la parte del valor que pasa al
// ETF en cada ciclo (0 % = no hace nada: comprar y mantener QQQ). Por punto y periodo: CAGR, caída máxima, peor año,
// CAGR / caída y valor final neto de impuestos (estimación con 10.000 €). Sin azar (no hace falta para la forma).
//
// MAPA DE SENSIBILIDAD. Regla simple con el 50 % en el ETF y ventana 252, con la caída de 5 a 25 % en saltos de 2,5: por
// valor, CAGR por subperiodo y total, caída máxima, ciclos y percentil del azar (1000 simulaciones con la MISMA semilla que
// tendría esa regla probada sola: con el 10 % reproduce exactamente V3 / V4 de CARTERA_1). Además, la «zona estable»
// (CAGR total a menos de zonaEstablePuntos del mejor) y la comprobación FUERA DE MUESTRA: se elige el valor con mejor CAGR
// solo en el primer subperiodo y se mira su CAGR en 2016–2025, frente a la mediana de los 9 valores y al 10 % por defecto.
import { ejecutaPeriodoCartera, N_SIM_CARTERA } from './laboratorioCartera'
import { reglaMezcla, reglaSimpleCon, configCarteraDe, CARTERA_1, huella } from './lotesLab'
import { semillaLab } from './laboratorio'
import { mediana } from './optimizacion'

const resumen = (r) => ({ cagr: r.cagr, caidaMaxima: r.caidaMaxima, fechaCaida: r.fechaCaida, peorAnio: r.peorAnio, cagrPorCaida: r.cagrPorCaida, valorFinalNeto: r.impuestos.valorFinalNeto, ciclos: r.ciclos })
// La regla de un punto de la curva.
export function reglaPunto(familia, pctEtf) {
  if (familia.id === 'mezcla') return reglaMezcla(100 - pctEtf, familia.frecuencia)
  return pctEtf === 0 ? reglaMezcla(100, 'anual') : reglaSimpleCon(familia.pct, familia.ventana, pctEtf / 100)
}

// La curva de riesgo de un ETF. datos: los alineados (lib/laboratorioCartera.js, alineaDatos).
export function curvaRiesgoEtf({ datos, config, etf }) {
  const periodos = config.periodos[etf]
  return { etf, periodos: periodos.map(periodo => {
    let ref = null
    const familias = Object.fromEntries(config.familias.map(f => [f.id, config.puntos.map(p => {
      const r = ejecutaPeriodoCartera({ datos, regla: reglaPunto(f, p), periodo, nSim: 0, puntosCurva: 1e9 })
      if (!ref) ref = { qqq: { cagr: r.referencias.qqq.cagr, caidaMaxima: r.referencias.qqq.caidaMaxima, cagrPorCaida: r.referencias.qqq.cagrPorCaida, peorAnio: r.referencias.qqq.peorAnio, valorFinalNeto: r.impuestos.qqqValorFinalNeto },
        spy: { cagr: r.referencias.spy.cagr, caidaMaxima: r.referencias.spy.caidaMaxima, cagrPorCaida: r.referencias.spy.cagrPorCaida, peorAnio: r.referencias.spy.peorAnio } }
      return { pct: p, ...resumen(r) }
    })]))
    return { desde: periodo.desde, hasta: periodo.hasta, total: !!periodo.total, familias, referencias: ref }
  }) }
}

// El mapa de sensibilidad de un ETF (asíncrono: la semilla de cada valor sale de la huella de su configuración).
export async function sensibilidadEtf({ datos, config, etf, nSim = N_SIM_CARTERA }) {
  const periodos = config.periodos[etf], fm = config.fueraDeMuestra[etf]
  const valores = []
  for (const pct of config.caidas) {
    const regla = reglaSimpleCon(pct, config.ventana, config.fraccion), sola = configCarteraDe({ regla, etf, periodos }, CARTERA_1.comun), h = await huella(sola)
    const porPeriodo = periodos.map(periodo => { const r = ejecutaPeriodoCartera({ datos, regla, periodo, nSim, semilla: semillaLab(h, periodo.desde), puntosCurva: 1e9 })
      return { desde: periodo.desde, hasta: periodo.hasta, total: !!periodo.total, ...resumen(r), percentil: r.azar.percentil, cagrQqq: r.referencias.qqq.cagr } })
    const fuera = ejecutaPeriodoCartera({ datos, regla, periodo: fm.prueba, nSim: 0, puntosCurva: 1e9 })
    valores.push({ pct, porPeriodo, fueraDeMuestra: { cagr: fuera.cagr, caidaMaxima: fuera.caidaMaxima, cagrQqq: fuera.referencias.qqq.cagr } })
  }
  const total = (v) => v.porPeriodo.find(p => p.total).cagr
  const mejor = Math.max(...valores.map(total))
  for (const v of valores) v.zonaEstable = mejor - total(v) < config.zonaEstablePuntos / 100
  const primero = (v) => v.porPeriodo.find(p => p.desde === fm.elige.desde && p.hasta === fm.elige.hasta).cagr
  const elegido = valores.reduce((a, b) => primero(b) > primero(a) ? b : a)
  const porDefecto = valores.find(v => v.pct === config.porDefecto)
  return { etf, valores, mejorTotal: mejor,
    fueraDeMuestra: { eligeEn: fm.elige, pruebaEn: fm.prueba, elegido: elegido.pct, cagrElegidoEnPrimero: primero(elegido), cagrElegido: elegido.fueraDeMuestra.cagr,
      medianaNueve: mediana(valores.map(v => v.fueraDeMuestra.cagr)), porDefecto: config.porDefecto, cagrPorDefecto: porDefecto?.fueraDeMuestra.cagr ?? null, cagrQqq: elegido.fueraDeMuestra.cagrQqq } }
}

// Para guardar el resumen en lab_pruebas (máximo 50 KB): los números redondeados a 6 decimales (las medidas son fracciones
// o euros; 6 decimales sobran). La pantalla usa el resultado tal cual llega del servidor.
export const redondeaParaGuardar = (x) => typeof x === 'number' ? (Number.isFinite(x) ? Math.round(x * 1e6) / 1e6 : x)
  : Array.isArray(x) ? x.map(redondeaParaGuardar) : x && typeof x === 'object' ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, redondeaParaGuardar(v)])) : x
