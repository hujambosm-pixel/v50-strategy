// lib/editor/laboratorio.js — la prueba contra el azar del LABORATORIO para las estrategias del editor (decisión 5,
// segunda parte; docs/editor-visual.md). Puro.
//
// LO REAL. La definición, con sus valores, ejecutada por el intérprete (lib/editor/interprete.js) sobre las velas de cada
// miembro del Nasdaq-100 del periodo (con tres años de historia antes, para que los indicadores estén calculados, y la que
// haga falta después para cerrar las operaciones). Cuenta cada operación CERRADA cuya vela de entrada cae dentro del periodo
// mientras el valor es miembro del índice (como el universo del multibacktest: se ejecuta la estrategia y se descartan las
// entradas de fuera; una operación de fuera también ocupa la posición, como en la realidad de esa estrategia). Medida: la
// MEDIA por operación (rendimiento de su precio de entrada a su precio de salida, los del intérprete), como LOTE_3.
//
// EL AZAR. La «estrategia al azar» de LOTE_3 (lib/laboratorioEstrategias.js, preparaAzarEstrategia), sin cambios: por valor,
// el mismo número de operaciones con las mismas duraciones, en fechas al azar entre los días válidos (miembro, en el
// periodo, con los indicadores de la definición calculados y vela de entrada), sin solaparse, entrando a la apertura y
// saliendo en su punto (apertura o cierre). La duración de una operación real, en puntos desde la apertura de su vela de
// entrada e: salida a la apertura de la vela x → k = 2 (x − e); en otro precio de la vela x (un stop, un objetivo, el
// cierre) → k = 2 (x − e) + 1. Su «día de señal» es t = e − 1 (la última vela cerrada antes de la entrada).
//
// LA CALIBRACIÓN (criterio 8, la misma idea que el criterio 4 de LOTE_3). La comparación no es neutral para cualquier
// estrategia: una salida que depende del precio (un stop) corta las pérdidas y deja correr las ganancias, y entonces sus
// duraciones dicen algo de sus rendimientos que las fechas al azar no reproducen (LOTE_2: el azar no está calibrado para
// stops). Por eso cada definición, con sus valores, se calibra: se ejecuta tal cual sobre universos SINTÉTICOS sin ninguna
// ventaja posible (paseo aleatorio geométrico, 100 valores × 5 años, los mismos parámetros que scripts/calibracionLab.js) y
// se cuenta en qué % de universos sale con percentil ≥ 95. Si es más del 10 % (CRITERIOS[4].maxFalsosAprobados), la prueba
// no está calibrada para esa estrategia: «sin veredicto». La calibración es de la huella de la definición con sus valores.
import { interpreta, serieCond } from './interprete'
import { valoresDe, resuelve, activa } from './definicion'
import { conHistoria } from './historia'
import { preparaAzarEstrategia, diasValidos, rendimientoDe, referenciaQqq } from '../laboratorioEstrategias'
import { realDelPeriodo, diasDe } from '../laboratorioSalidas'
import { esMiembroEn, N_SIM_LAB } from '../laboratorio'
import { generador, semillaDeActivo, percentilDe } from '../azar'
import { mediana } from '../optimizacion'
import { percentil as cuantil } from '../robustez'

export const PERCENTIL_SUPERA_LAB = 95
export const MAX_FALSOS_APROBADOS = 10   // = CRITERIOS[4].maxFalsosAprobados (lib/lotesLab.js)
export const VERSION_CALIBRACION = 1
// Los parámetros de los universos sintéticos: los de scripts/calibracionLab.js (LOTE_3).
export const CALIBRACION = Object.freeze({ universos: 50, valores: 100, anios: 5, calentamiento: 260, tras: 200, derivaDiaria: 0.0006, volatilidadDiaria: 0.02, fraccionNoche: 0.3, nSim: N_SIM_LAB, semilla: 20261016 })

// Días en que la estrategia «puede» dar señal: con su señal de entrada y sus condiciones de salida y de trailing calculadas.
export function calculablesDefinicion(def, velas, params = {}, ctx = {}) {
  const v = valoresDe(def, params)
  // V9.1055: con la orden en el nivel de ruptura y sin señal, la señal es «siempre» (el interprete hace lo mismo).
  // V9.1059: lo mismo con la orden en el último máximo de swing.
  const series = [def.entrada.senal || !['ruptura', 'swing', 'supertrend'].includes(def.entrada.orden?.tipo) ? serieCond(def.entrada.senal, velas, v, ctx) : velas.map(() => true)]
  if (def.entrada.cancelar) series.push(serieCond(def.entrada.cancelar, velas, v, ctx))
  for (const s of def.stops || []) if (activa(s.activa, v) && s.tipo === 'trailing') series.push(serieCond(s.si, velas, v, ctx))
  for (const s of def.salidas || []) if (activa(s.activa, v) && s.tipo === 'condicion') series.push(serieCond(s.si, velas, v, ctx))
  // Stops con medias o ATR: su indicador también (con el valor del parámetro).
  const r = resuelve({ stops: (def.stops || []).filter(s => activa(s.activa, v)) }, v)
  const minimo = Math.max(0, ...r.stops.flatMap(s => [...(s.de || []).filter(x => x.media).map(x => x.media.periodo), s.tipo === 'atr' ? s.periodo + 1 : 0, s.nivel?.atr ? s.nivel.atr.periodo + 1 : 0, s.tipo === 'minimoVelas' ? s.n : 0,
    s.tipo === 'atrCompra' ? s.periodo + 1 : 0, s.tipo === 'minimoMovil' ? s.n : 0, s.tipo === 'swingMinimo' ? s.izquierda + s.derecha + 1 : 0, s.tipo === 'supertrend' ? 4 * s.periodo : 0]),   // V9.1055, V9.1059, V9.1064
    def.entrada.orden?.tipo === 'ruptura' ? resuelve(def.entrada.orden.nivel?.velas, v) || 0 : 0,
    def.entrada.orden?.tipo === 'swing' ? (resuelve(def.entrada.orden.nivel?.izquierda, v) || 0) + (resuelve(def.entrada.orden.nivel?.derecha, v) || 0) + 1 : 0,
    def.entrada.orden?.tipo === 'supertrend' ? 4 * (resuelve(def.entrada.orden.nivel?.periodo, v) || 0) : 0)   // V9.1067
  return velas.map((_, t) => t >= minimo && series.every(x => x[t] !== null))
}

// Las operaciones reales de un valor en el periodo (las que entran mientras es miembro), en el formato del laboratorio.
export function operacionesEditorValor({ velas, tramos, definicion, params, desde, hasta, ctx = {} }) {
  const r = interpreta(definicion, velas, params, ctx)
  const idx = new Map(velas.map((v, i) => [v.date, i]))
  const ops = []
  let fuera = 0
  for (const tr of r.trades) {
    const e = idx.get(tr.entryDate), x = idx.get(tr.exitDate)
    if (e == null || x == null || e < 1) continue   // sin vela anterior no hay «día de señal» (no pasa con la historia que se carga)
    if (tr.entryDate < desde || tr.entryDate > hasta || !esMiembroEn(tramos, tr.entryDate)) { fuera++; continue }
    const enApertura = tr.exitPrice === velas[x].open
    const k = 2 * (x - e) + (enApertura ? 0 : 1)
    ops.push({ t: e - 1, e, entrada: tr.entryPrice, salida: tr.exitPrice, b: x, cierre: !enApertura, k, dias: diasDe(k), rend: tr.exitPrice / tr.entryPrice - 1, motivo: tr.exitReason, finDatos: false })
  }
  return { ops, eventos: ops.length + fuera, ignoradas: 0, sinEntrada: 0, candidatos: 0, fuera, abiertaAlFinal: !!r.openPosition }
}

// Un periodo. valores: [{ sym, velas, tramos }]; definicion y params; ctx: { referencias } (filtro de mercado).
export function ejecutaPeriodoEditor({ valores, definicion, params = {}, desde, hasta, nSim = N_SIM_LAB, semilla = 0, qqq = null, ctx = {} }) {
  const porValor = valores.map(v => {
    const o = operacionesEditorValor({ ...v, definicion, params, desde, hasta, ctx })
    return { ...v, ...o, calculables: calculablesDefinicion(definicion, v.velas, params, ctx) }
  })
  const { base, comunes } = realDelPeriodo(porValor)
  const conOps = porValor.filter(v => v.ops.length)
  const sorteos = conOps.map(v => preparaAzarEstrategia(v.velas, diasValidos({ ...v, desde, hasta }), v.ops.map(o => o.k)))
  const rnds = conOps.map(v => generador(semillaDeActivo(semilla, `${v.sym}|labEditor`)))
  const medias = new Float64Array(nSim), duraciones = new Float64Array(nSim)
  let aproximadas = 0, imposibles = 0
  for (let s = 0; s < nSim; s++) {
    let suma = 0, dias = 0, cuenta = 0
    sorteos.forEach((x, j) => {
      const r = x.sortea(rnds[j])
      if (!r) { imposibles++; return }
      if (r.aproximada) aproximadas++
      for (const o of r.ops) { const y = rendimientoDe(conOps[j].velas, o.t, o.k); if (y) { suma += y.rend; dias += y.dias; cuenta++ } }
    })
    medias[s] = cuenta ? suma / cuenta : NaN; duraciones[s] = cuenta ? dias / cuenta : NaN
  }
  const ms = Array.from(medias).filter(Number.isFinite), ds = Array.from(duraciones).filter(Number.isFinite)
  const azar = { nSim, semilla, metodo: 'estrategia al azar (mismas duraciones, fechas al azar)', media: mediana(ms), p5: cuantil(ms, 0.05), p95: cuantil(ms, 0.95),
    percentil: base.media == null ? null : percentilDe(ms, base.media), duracionMedia: ds.length ? ds.reduce((a, b) => a + b, 0) / ds.length : null, aproximadas, imposibles }
  // copias (V9.1051): la ganancia media por operación de cada una de las nSim copias al azar (6 cifras; null si no operó), para
  // el histograma del paso 2. No cambia ninguna cifra de azar.
  return { prueba: 'editorLab', desde, hasta, ...base, ...comunes, fueraDelIndice: porValor.reduce((a, v) => a + v.fuera, 0), azar, qqq: referenciaQqq(qqq, desde, hasta),
    copias: { medias: Array.from(medias, x => Number.isFinite(x) ? Number(x.toPrecision(6)) : null) } }
}

// ── Calibración ──
// Un universo sintético sin ventaja (paseo aleatorio geométrico; apertura = cierre anterior × e^noche, cierre = apertura ×
// e^día; máximo y mínimo alrededor), como scripts/calibracionLab.js.
export function fechasSinteticas(c = CALIBRACION) {
  const fechas = []
  for (let d = Date.UTC(2014, 11, 1); fechas.length < c.calentamiento + c.anios * 252 + c.tras; d += 864e5) { const w = new Date(d).getUTCDay(); if (w && w < 6) fechas.push(new Date(d).toISOString().slice(0, 10)) }
  return { fechas, desde: fechas[c.calentamiento], hasta: fechas[c.calentamiento + c.anios * 252 - 1] }
}
export function serieSintetica(fechas, rnd, c = CALIBRACION) {
  const normal = () => { let u = 0; while (!u) u = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd()) }
  const v = [], sn = c.volatilidadDiaria * Math.sqrt(c.fraccionNoche), sd = c.volatilidadDiaria * Math.sqrt(1 - c.fraccionNoche)
  let cierre = 100
  for (const date of fechas) {
    const o = cierre * Math.exp(c.derivaDiaria * c.fraccionNoche + sn * normal()), cl = o * Math.exp(c.derivaDiaria * (1 - c.fraccionNoche) + sd * normal())
    v.push({ date, open: o, high: Math.max(o, cl) * Math.exp(Math.abs(normal()) * c.volatilidadDiaria * 0.4), low: Math.min(o, cl) * Math.exp(-Math.abs(normal()) * c.volatilidadDiaria * 0.4), close: cl, volume: 1e6 })
    cierre = cl
  }
  return v
}
// Calibra una definición con sus valores. Asíncrona: cede el hilo entre universos (alProgreso(hechos, total)); parar() →
// true la interrumpe (lanza). semilla: la de la huella de la definición, para que se repita igual.
// Índice ficticio (V9.1045): si la estrategia tiene filtro de un índice (QQQ, SPY…), en cada mercado ficticio ese filtro mira
// un índice inventado = la media de sus valores: la media de las rentabilidades diarias de cierre a cierre, acumulada desde 100
// (un índice de pesos iguales; apertura, máximo y mínimo = el cierre, sin volumen). Sin filtro de índice no se calcula y todo
// queda como antes. Más historia (lib/editor/historia.js): si la regla necesita más de las 260 velas previas, se inventan las
// que necesita (solo para ella).
export function indiceFicticio(valores) {
  const vs = valores.map(v => v.velas), n = vs[0]?.length || 0, out = []
  let nivel = 100
  for (let d = 0; d < n; d++) {
    if (d) { let s = 0, k = 0; for (const x of vs) { const a = x[d - 1]?.close, b = x[d]?.close; if (a > 0 && b > 0) { s += b / a - 1; k++ } } if (k) nivel *= 1 + s / k }
    out.push({ date: vs[0][d].date, open: nivel, high: nivel, low: nivel, close: nivel, volume: null })
  }
  return out
}
export async function calibraDefinicion(definicion, params = {}, { semilla = CALIBRACION.semilla, universos = CALIBRACION.universos, nSim = CALIBRACION.nSim, alProgreso = null, parar = null, cede = null } = {}) {
  const c = { ...CALIBRACION, universos, nSim, calentamiento: conHistoria(CALIBRACION.calentamiento, definicion, params) }
  const tickerIndice = definicion?.filtroMercado?.ticker || null
  const { fechas, desde, hasta } = fechasSinteticas(c)
  const tramos = [{ desde: '2000-01-01', hasta: null, excluido_motivo: null }]
  const res = []
  for (let u = 0; u < universos; u++) {
    if (parar && parar()) throw new Error('Calibración parada a petición tuya.')
    const valores = [...Array(c.valores)].map((_, j) => ({ sym: `V${j}`, velas: serieSintetica(fechas, generador(semillaDeActivo(semilla, `u${u}|v${j}`)), c), tramos }))
    const ctx = tickerIndice ? { ctx: { referencias: { [tickerIndice]: indiceFicticio(valores) } } } : {}
    const r = ejecutaPeriodoEditor({ valores, definicion, params, desde, hasta, nSim, semilla: semillaDeActivo(semilla, `editor|u${u}`), ...ctx })
    res.push({ percentil: r.azar.percentil, operaciones: r.operaciones, duracion: r.duracionMedia })
    if (alProgreso) alProgreso(u + 1, universos)
    if (cede) await cede()
  }
  const validos = res.filter(x => x.percentil != null)
  const aprob = validos.filter(x => x.percentil >= PERCENTIL_SUPERA_LAB).length, d = new Array(10).fill(0)
  for (const x of validos) d[Math.min(9, Math.floor(x.percentil / 10))]++
  const md = (f) => validos.length ? validos.reduce((a, x) => a + f(x), 0) / validos.length : null
  const pct = validos.length ? Math.round(aprob / validos.length * 1000) / 10 : null
  return { version: VERSION_CALIBRACION, parametros: c, universos: res.length, conOperaciones: validos.length, aprobados: aprob, pctAprobados: pct,
    percentilMedio: md(x => x.percentil) == null ? null : Math.round(md(x => x.percentil) * 10) / 10, deciles: d,
    operacionesMedias: md(x => x.operaciones) == null ? null : Math.round(md(x => x.operaciones)), duracionMedia: md(x => x.duracion ?? 0),
    calibrada: pct != null && validos.length >= Math.ceil(universos * 0.8) && pct <= MAX_FALSOS_APROBADOS }
}
// El veredicto de una variante: calibrada y percentil ≥ 95 en TODOS los periodos.
export function veredictoEditorLab(calibracion, periodos) {
  if (!calibracion) return 'sin calibrar'
  if (!calibracion.calibrada) return 'sin veredicto: el azar no está calibrado para esta estrategia'
  if (!periodos?.length || periodos.some(p => p?.azar?.percentil == null)) return 'pendiente'
  return periodos.every(p => p.azar.percentil >= PERCENTIL_SUPERA_LAB) ? 'pasa' : 'no pasa'
}
