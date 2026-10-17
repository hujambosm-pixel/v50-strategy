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
import { ejecutaPeriodoCartera, N_SIM_CARTERA, simula, medidas, impuestosDe, compraMantiene, bajoAgua, bajoAguaCorto, reglaFiltro, preparaRegla, calculoDe, impuestosEnCajaDe } from './laboratorioCartera'
export { bajoAgua }
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
      const r = ejecutaPeriodoCartera({ datos, regla: reglaPunto(f, p), periodo, nSim: 0, puntosCurva: 1e9, calculo: calculoDe(config) })
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
    const porPeriodo = periodos.map(periodo => { const r = ejecutaPeriodoCartera({ datos, regla, periodo, nSim, semilla: semillaLab(h, periodo.desde), puntosCurva: 1e9, calculo: calculoDe(config) })
      return { desde: periodo.desde, hasta: periodo.hasta, total: !!periodo.total, ...resumen(r), percentil: r.azar.percentil, cagrQqq: r.referencias.qqq.cagr } })
    const fuera = ejecutaPeriodoCartera({ datos, regla, periodo: fm.prueba, nSim: 0, puntosCurva: 1e9, calculo: calculoDe(config) })
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

// ── PRUEBA DE ESTRÉS 1999–2025 (V9.984) ──
// Mezcla fija con rebalanceo anual, % en el ETF de 0 a 100, con un ETF sintético ×2 o ×3 (lib/etfSintetico.js; datos.etf ya
// es el sintético). Por punto y periodo: CAGR, caída máxima con sus fechas de pico y valle, TIEMPO BAJO EL AGUA (días
// naturales del pico a recuperarlo, o «sin recuperar»), peor año, CAGR / caída y valor final neto de impuestos. Tabla año a
// año del punto anioAnio (50 %) frente a QQQ y SPY en el periodo total.
// (El tiempo bajo el agua, bajoAgua, vive en lib/laboratorioCartera.js desde V9.986; aquí, sin lo que se deduce —la caída,
// «recuperado»— ni los campos vacíos: el resumen de las dos partes tiene que caber en 50 KB.)
const medidaEstres = (fechas, curva, i0, extra = {}) => { const m = medidas(fechas, curva, i0), ba = bajoAguaCorto(fechas, curva, i0)
  return { cagr: m.cagr, caidaMaxima: m.caidaMaxima, bajoAgua: ba, peorAnio: m.peorAnio, cagrPorCaida: m.cagrPorCaida, ...extra, porAnio: m.porAnio } }
const euros = (x) => x == null ? null : Math.round(x * 100) / 100
export function estresParte({ datos, config, parte }) {
  const { fechas } = datos, sinPorAnio = ({ porAnio, ...x }) => x
  const periodos = config.periodos.map(periodo => {
    const i0 = fechas.findIndex(f => f >= periodo.desde), i1 = fechas.reduce((m, f, i) => f <= periodo.hasta ? i : m, -1)
    const refQqq = compraMantiene(datos.qqq, i0, i1), refSpy = compraMantiene(datos.spy, i0, i1)
    const puntos = config.puntos.map(p => { const rg = reglaMezcla(100 - p, config.familias[0].frecuencia), r = simula({ datos, regla: rg, i0, i1 }), imp = calculoDe(config) === 2 ? impuestosEnCajaDe({ datos, regla: rg, i0, i1 }) : impuestosDe(r, fechas, i0, null)
      return { pct: p, ...medidaEstres(fechas, r.curva, i0, { valorFinalNeto: euros(imp.valorFinalNeto) }) } })
    const impQ = impuestosDe({ curva: refQqq, ganancias: {} }, fechas, i0, refQqq)
    const qqq = medidaEstres(fechas, refQqq, i0, { valorFinalNeto: euros(impQ.qqqValorFinalNeto) }), spy = medidaEstres(fechas, refSpy, i0)
    return { desde: periodo.desde, hasta: periodo.hasta, total: !!periodo.total, fechaIni: fechas[i0], fechaFin: fechas[i1], puntos, referencias: { qqq, spy } }
  })
  const tot = periodos.find(p => p.total), elegido = tot.puntos.find(p => p.pct === config.anioAnio)
  const anioAnio = Object.keys(elegido.porAnio).map(a => ({ anio: a, cartera: elegido.porAnio[a], qqq: tot.referencias.qqq.porAnio[a], spy: tot.referencias.spy.porAnio[a] }))
  return { etf: parte, k: parte === 'x3' ? 3 : 2, anioAnio: { pct: config.anioAnio, filas: anioAnio },
    periodos: periodos.map(p => ({ ...p, puntos: p.puntos.map(sinPorAnio), referencias: { qqq: sinPorAnio(p.referencias.qqq), spy: sinPorAnio(p.referencias.spy) } })) }
}

// ── MAPA DE LA MEDIA (V9.986) ──
// La mezcla con filtro de tendencia (CARTERA_3) con el ETF sintético de la parte (datos.etf ya es el sintético), para cada
// alcance y cada evaluación (diaria: SMA de config.diario días; semanal: de config.semanal semanas). Por valor y periodo
// (el total 1999–2025, el de elegir 1999–2010 y el de comprobar 2011–2025): CAGR, caída máxima, CAGR / caída, % del tiempo
// FUERA y número de cambios (salidas + entradas). Sin azar. Por línea (alcance × evaluación): la ZONA ESTABLE (CAGR / caída
// del total a menos de config.zonaEstable —10 %— del mejor) y la comprobación FUERA DE MUESTRA: el valor con mejor
// CAGR / caída en el periodo de elegir y su resultado en el de comprobar, frente a la mediana de la línea y a los valores de
// config.comparaCon (50 y 200 días; 10 y 40 semanas). Referencias por periodo: la mezcla 50/50 sin filtro y comprar y
// mantener QQQ.
const conCaida = (x) => x ?? -Infinity
export function mapaMediaParte({ datos, config, parte }) {
  const { fechas } = datos
  const rango = (p) => [fechas.findIndex(f => f >= p.desde), fechas.reduce((m, f, i) => f <= p.hasta ? i : m, -1)]
  const P = { total: config.periodos.find(p => p.total), elige: config.periodos.find(p => p.elige), prueba: config.periodos.find(p => p.prueba) }, R = Object.fromEntries(Object.entries(P).map(([k, p]) => [k, rango(p)]))
  const mide = (regla, prep, [i0, i1]) => { const r = simula({ datos, regla, preparadas: prep, i0, i1 }), m = medidas(fechas, r.curva, i0), n = i1 - i0 + 1
    return { cagr: m.cagr, caidaMaxima: m.caidaMaxima, cagrPorCaida: m.cagrPorCaida, tiempoFuera: (r.diasEstado.FUERA || 0) / n, cambios: r.operaciones.filter(o => !o.rebalanceo).length } }
  const lineas = []
  for (const alcance of config.alcances) for (const evaluacion of ['diario', 'semanal']) {
    if (!config[evaluacion]?.length) continue
    const valores = config[evaluacion].map(periodo => {
      const regla = reglaFiltro(periodo, evaluacion, alcance), prep = preparaRegla(regla, datos.qqqVelas)
      const t = mide(regla, prep, R.total), e = mide(regla, prep, R.elige), p = mide(regla, prep, R.prueba)
      return { periodo, total: t, elige: { cagr: e.cagr, cagrPorCaida: e.cagrPorCaida }, prueba: { cagr: p.cagr, caidaMaxima: p.caidaMaxima, cagrPorCaida: p.cagrPorCaida } }
    })
    const mejor = Math.max(...valores.map(v => conCaida(v.total.cagrPorCaida))), umbral = mejor - Math.abs(mejor) * config.zonaEstable
    for (const v of valores) v.zonaEstable = conCaida(v.total.cagrPorCaida) >= umbral
    const elegido = valores.reduce((a, b) => conCaida(b.elige.cagrPorCaida) > conCaida(a.elige.cagrPorCaida) ? b : a)
    lineas.push({ alcance, evaluacion, valores, mejorTotal: mejor, mejorPeriodo: valores.find(v => conCaida(v.total.cagrPorCaida) === mejor)?.periodo ?? null,
      fueraDeMuestra: { eligeEn: P.elige, pruebaEn: P.prueba, elegido: elegido.periodo, enElige: elegido.elige.cagrPorCaida, enPrueba: elegido.prueba.cagrPorCaida,
        mediana: mediana(valores.map(v => v.prueba.cagrPorCaida).filter(x => x != null)),
        comparados: (config.comparaCon?.[evaluacion] || []).map(x => ({ periodo: x, enPrueba: valores.find(v => v.periodo === x)?.prueba.cagrPorCaida ?? null })) } })
  }
  const referencias = Object.entries(P).map(([k, p]) => { const [i0, i1] = R[k], rm = simula({ datos, regla: reglaMezcla(50, 'anual'), i0, i1 }), mm = medidas(fechas, rm.curva, i0), mq = medidas(fechas, compraMantiene(datos.qqq, i0, i1), i0)
    return { desde: p.desde, hasta: p.hasta, papel: k, fechaIni: fechas[i0], fechaFin: fechas[i1], mezcla: { cagr: mm.cagr, caidaMaxima: mm.caidaMaxima, cagrPorCaida: mm.cagrPorCaida }, qqq: { cagr: mq.cagr, caidaMaxima: mq.caidaMaxima, cagrPorCaida: mq.cagrPorCaida } } })
  return { etf: parte, k: parte === 'x3' ? 3 : 2, lineas, referencias }
}

// Para guardar el resumen en lab_pruebas (máximo 50 KB): los números redondeados a 6 decimales (las medidas son fracciones
// o euros; 6 decimales sobran). La pantalla usa el resultado tal cual llega del servidor.
export const redondeaParaGuardar = (x) => typeof x === 'number' ? (Number.isFinite(x) ? Math.round(x * 1e6) / 1e6 : x)
  : Array.isArray(x) ? x.map(redondeaParaGuardar) : x && typeof x === 'object' ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, redondeaParaGuardar(v)])) : x
