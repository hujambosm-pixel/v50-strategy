// lib/azarCartera.js — Prueba contra el azar de la MULTICARTERA, en el navegador. ¿La ventaja viene de la señal o de la
// selección de activos?
//   A · señal al azar, asignación real: por activo, el mismo número de candidatos con las mismas duraciones en velas,
//       colocados al azar sin solaparse (colocaAlAzar), entrando y saliendo en aperturas (pctAlAzar); su prioridad se
//       calcula en su fecha de entrada con la MISMA función que el servidor (creaPuntuador) y pasan por la misma puerta;
//       después, el mismo reparto (asignaCartera).
//   B · señal real, orden al azar: los candidatos reales; a igual fecha, el ORDEN lo decide un número al azar determinista
//       (semilla + simulación + símbolo + fecha) en vez de la prioridad. La puerta sigue con el valor real.
// Medidas (metricasCartera, sobre el eje diario completo): CAGR compuesto, caída máxima con flotante, capital invertido
// medio y CAGR / caída. Los datos los da /api/multibacktest con conCandidatos: true (candidatosAzar). Puro.
//
// UNIVERSO DINÁMICO (Fase 8a, lib/screener.js): con máscara de entradas, B usa los candidatos que ya filtró el servidor, y
// A coloca al azar POR TRAMO de la máscara (colocaPorTramos): los candidatos reales de cada activo se agrupan por el
// intervalo [desde, hasta) que contiene su entrada, y cada grupo se coloca al azar, sin solaparse, con todas sus entradas
// dentro de su intervalo; un bloque puede pasar del final del intervalo (las salidas no se limitan) pero nunca de la
// última vela del activo. Mismo número de operaciones y mismo tiempo en mercado por activo y por tramo. Sin máscara, todo
// como antes.
import { asignaCartera, metricasCartera } from './asignaCartera'
import { creaPuntuador } from './prioridadCartera'
import { normalizaFiltrosEntrada, hayFiltrosActivos } from './filtros'
import { AZAR, generador, semillaDe, semillaDeActivo, colocaAlAzar, pctAlAzar, duracionesEnVelas, resumenAzar, resumenCaida } from './azar'
import { mediana } from './optimizacion'
import { percentil as cuantil } from './robustez'

// ¿Se puede hacer la prueba con esta petición? null si sí; si no, el motivo.
export function motivoNoAdmitida(peticion, tipo = 'A') {
  if (!peticion) return 'Vuelve a ejecutar la multicartera para poder hacer la prueba.'
  if (peticion.portfolioMode) return 'La prueba se hace con cada estrategia por separado.'
  if (hayFiltrosActivos(normalizaFiltrosEntrada(peticion.filtros))) return 'Las pruebas se hacen sin filtros para no mezclar efectos: quita los filtros y vuelve a ejecutar.'
  const modo = peticion.modoAsig || 'slots'
  if (modo === 'positionsizing') return 'Position Sizing no está admitido: el tamaño de cada posición depende de su stop, y las entradas al azar no lo tienen.'
  if (tipo === 'B' && modo !== 'concentrado' && modo !== 'compartido') return 'En slots no se elige entre activos: la prueba B no aplica.'
  return null
}

// Semilla fija derivada de la configuración (estrategia, activos, periodo, temporalidad, reparto y, si lo hay, universo).
export function semillaCartera(p) {
  const c = p.cfg || {}
  const base = [p.strategyId, [...(p.symbols || [])].sort(), c.fromDate, c.toDate, c.years, c.capitalIni, p.intervalo, p.modoAsig,
    p.sizeRules || c.sizeRules || null, p.comisiones || null, p.params || null]
  if (p.universo) base.push({ universo: p.universo.regla || null, n: p.universo.n ?? null })
  return semillaDe(JSON.stringify(base))
}

// Prepara lo que manda el servidor: velas e índices por activo, la función de prioridad, los precios para las métricas y
// el eje diario (las fechas de todos los activos desde el inicio, como _commonDates del servidor).
// opciones.mascara (universo dinámico): { símbolo: [[desde, hasta), …] }; sin ella, la prueba A de siempre.
export function preparaCartera(c, { mascara = null } = {}) {
  const o = c.opciones
  const activos = c.activos.map(a => {
    const data = a.fechas.map((date, i) => ({ date, close: a.cierra[i], ...(a.altos ? { high: a.altos[i] } : {}) }))   // máximos: solo con «max52»
    const idx = {}; a.fechas.forEach((f, i) => { idx[f] = i })
    return { ...a, data, idx }
  })
  const dataMap = Object.fromEntries(activos.map(a => [a.symbol, a.data]))
  const dateIdxMap = Object.fromEntries(activos.map(a => [a.symbol, a.idx]))
  const sp500 = c.sp500 ? c.sp500.fechas.map((date, i) => ({ date, close: c.sp500.cierres[i] })) : null
  const puntua = o.modo === 'concentrado' ? creaPuntuador({ ...o, sp500Data: sp500, dataMap, dateIdxMap }) : null
  const precios = Object.fromEntries(activos.map(a => [a.symbol, a.data.filter(d => d.date >= o.startDate)]))
  const fechasEje = [...new Set(activos.flatMap(a => a.fechas))].sort().filter(d => d >= o.startDate)
  return { o, activos, puntua, precios, fechasEje, ...(mascara ? { mascara } : {}) }
}

// capRatio (solo informativa): CAGR / capital invertido medio, la rentabilidad anual por unidad de capital realmente
// invertido (en %: CAGR ÷ (capital invertido medio / 100)); null sin capital invertido. La misma cuenta en la real y en
// cada simulación; no tiene veredicto ni entra en ninguna conclusión.
// V9.1051: las medidas salen de las métricas con aMedidas (la misma cuenta de siempre), para poder quedarse además con la curva.
const aMedidas = (m) => ({ cagr: m.cagr, maxDD: m.maxDD, capInv: m.capInvPct, ratio: m.maxDD > 0 && m.cagr != null ? m.cagr / m.maxDD : null,
  capRatio: m.capInvPct > 0 && m.cagr != null ? m.cagr / (m.capInvPct / 100) : null })
export function medidas(P, ejecutadas) {
  return aMedidas(metricasCartera(ejecutadas, P.precios, P.fechasEje, P.o.capitalIni))
}
const reparte = (P, candidatos, ps = null) => asignaCartera(candidatos, { ...P.o, ps }).ejecutadas
// Copias de los candidatos reales en el orden del servidor (activo a activo): asignaCartera los ordena en sitio.
const copiasReales = (P) => P.activos.flatMap(a => a.candidatos.map(c => ({ ...c })))

// La cartera real recompuesta a partir de los candidatos (tiene que dar lo mismo que el servidor).
export function realCartera(P) { return medidas(P, reparte(P, copiasReales(P))) }
// V9.1051: la curva diaria (el dinero cada día del eje) de esa misma cartera real: la que dibuja el paso 2.
export function curvaReal(P) { return metricasCartera(reparte(P, copiasReales(P)), P.precios, P.fechasEje, P.o.capitalIni).curva.map(x => x.value) }

// La misma comprobación que hace la pantalla: CAGR compuesto (como el cliente, de compoundCurve), caída máxima con flotante
// y capital invertido medio del servidor frente a la recomposición. Tolerancia 1e-6 puntos (en Slots el capital compone
// con netoDeOperacion y el servidor con acciones: la misma cuenta en otro orden de coma flotante).
// capitalIni (V9.1023): la base del CAGR del servidor, la MISMA que usa la recomposición (metricasCartera divide entre el
// capital inicial). Sin él, el primer punto de compoundCurve, como antes; pero si el primer día del periodo ya hay una
// operación con ganancia o pérdida, ese punto no es el capital inicial y la comprobación fallaba con las dos curvas iguales.
export function comparaConServidor(real, r, tolerancia = 1e-6, capitalIni = null) {
  const cc = r.compoundCurve || []
  const anios = cc.length ? (new Date(cc[cc.length - 1].date) - new Date(cc[0].date)) / (365.25 * 864e5) : 0
  const base = Number.isFinite(capitalIni) && capitalIni > 0 ? capitalIni : cc[0]?.value
  const cagr = cc.length ? (Math.pow(Math.max(cc[cc.length - 1].value, 0.01) / Math.max(base, 0.01), 1 / Math.max(anios, 0.01)) - 1) * 100 : null
  const dif = { cagr: Math.abs(real.cagr - cagr), maxDD: Math.abs(real.maxDD - r.maxDDFloatCompound), capInv: Math.abs(real.capInv - r.avgCapOccupancy) }
  return { ok: Object.values(dif).every(x => x <= tolerancia), dif, servidor: { cagr, maxDD: r.maxDDFloatCompound, capInv: r.avgCapOccupancy } }
}

// Primera vela con fecha >= f (n si no hay ninguna).
const primeraDesde = (fechas, f) => { let lo = 0, hi = fechas.length; while (lo < hi) { const m = (lo + hi) >> 1; if (fechas[m] < f) lo = m + 1; else hi = m } return lo }
const INTENTOS_TRAMO = 200, INTENTOS_ACTIVO = 50

// Colocación al azar de las operaciones de un activo respetando la máscara (ver la cabecera). Los grupos van en orden de
// tiempo; el de cada tramo se coloca con colocaAlAzar en [inicio, min(fin del tramo + su duración más larga, n)), donde
// inicio es el comienzo del tramo o el final del bloque anterior si lo pisa, y se repite el sorteo mientras alguna entrada
// caiga después del tramo. Si no se consigue, se repite el activo entero; si tampoco, null (el activo no opera en esa
// simulación, como cuando las operaciones no caben). Devuelve { bloques: [{ inicio, d }], fuera } (fuera: candidatos
// reales que no caen en ningún tramo; el servidor ya los quitó, así que debería ser 0).
export function colocaPorTramos(fechas, candidatos, tramos, rnd) {
  const n = fechas.length, grupos = []
  let enGrupo = 0
  for (const [desde, hasta] of [...(tramos || [])].sort((x, y) => x[0] < y[0] ? -1 : 1)) {
    const cs = candidatos.filter(c => c.entryDate >= desde && c.entryDate < hasta)
    if (!cs.length) continue
    enGrupo += cs.length
    const durs = duracionesEnVelas(cs, fechas), e0 = primeraDesde(fechas, hasta)
    grupos.push({ s0: primeraDesde(fechas, desde), e0, durs, R: Math.min(n, e0 + Math.max(...durs)) })
  }
  const fuera = candidatos.length - enGrupo
  for (let intento = 0; intento < INTENTOS_ACTIVO; intento++) {
    const bloques = []
    let fin = 0, ok = true
    for (const g of grupos) {
      const lo = Math.max(g.s0, fin)
      if (lo >= g.e0) { ok = false; break }
      let col = null
      for (let k = 0; k < INTENTOS_TRAMO && !col; k++) {
        const c = colocaAlAzar(g.R - lo, g.durs, rnd)
        if (!c) break
        if (lo + c[c.length - 1].inicio < g.e0) col = c
      }
      if (!col) { ok = false; break }
      for (const b of col) bloques.push({ inicio: lo + b.inicio, d: b.d })
      const ult = col[col.length - 1]; fin = lo + ult.inicio + ult.d
    }
    if (ok) return { bloques, fuera }
  }
  return { bloques: null, fuera }
}

// A: candidatos al azar de una simulación. Prioridad memorizada por (símbolo, fecha): no cambia entre simulaciones.
// stats (opcional) cuenta los activos que no se pudieron colocar y los candidatos fuera de la máscara.
export function candidatosAlAzar(P, rnds, memo = new Map(), stats = null) {
  const out = []
  P.activos.forEach((a, j) => {
    const n = a.fechas.length
    if (!a.candidatos.length || !n) return
    let col
    if (P.mascara) {
      const r = colocaPorTramos(a.fechas, a.candidatos, P.mascara[a.symbol], rnds[j])
      if (stats) { stats.fuera += r.fuera; if (!r.bloques) stats.sinColocar++ }
      col = r.bloques
    } else {
      const durs = duracionesEnVelas(a.candidatos, a.fechas)
      col = colocaAlAzar(n, durs, rnds[j])
    }
    if (!col) return
    for (const { inicio, d } of col) {
      const sale = inicio + d
      const c = { symbol: a.symbol, entryDate: a.fechas[inicio], exitDate: sale < n ? a.fechas[sale] : a.fechas[n - 1],
        pnlPct: pctAlAzar(a.abre, a.cierra, inicio, d), entryPx: a.abre[inicio], exitPx: sale < n ? a.abre[sale] : a.cierra[n - 1],
        stopPx: null, dias: null, _virtualClose: sale >= n }
      if (P.puntua) {
        const k = `${a.symbol}|${c.entryDate}`
        let p = memo.get(k)
        if (!p) { const t = { symbol: a.symbol, entryDate: c.entryDate }; const ps = P.puntua(t); p = { ...t, _ps: ps }; memo.set(k, p) }
        if (p._psValid !== undefined) c._psValid = p._psValid
        if (p._rsRaw !== undefined) c._rsRaw = p._rsRaw
        if (p._momRaw !== undefined) c._momRaw = p._momRaw
        if (p._proxRaw !== undefined) c._proxRaw = p._proxRaw
        c._ps = p._ps
      }
      out.push(c)
    }
  })
  return out
}

// Una prueba (A o B) que se calcula por tandas: avanza(k) hace k simulaciones más. El resultado no depende del tamaño de
// las tandas: A usa un generador por activo que avanza de simulación en simulación; B, un número por (simulación, candidato).
// curvas (V9.1051, opcional): además, la curva diaria de cada simulación (curvas[s]: el dinero cada día del eje). No cambia
// ninguna cifra: las medidas salen de las mismas métricas.
export function creaPrueba(P, { tipo, nSim = AZAR.simulaciones, semilla = 0, curvas = false }) {
  const curvasSims = curvas ? new Array(nSim).fill(null) : null
  const sims = { cagr: new Float64Array(nSim), maxDD: new Float64Array(nSim), capInv: new Float64Array(nSim), ratio: new Float64Array(nSim), capRatio: new Float64Array(nSim) }
  const rnds = P.activos.map(a => generador(semillaDeActivo(semilla, `${a.symbol}|cartera-A`)))
  const memo = new Map()
  const stats = { sinColocar: 0, fuera: 0 }   // solo con máscara (colocaPorTramos)
  let s = 0
  const una = () => {
    let ej
    if (tipo === 'A') ej = reparte(P, candidatosAlAzar(P, rnds, memo, stats))
    else {
      const cs = copiasReales(P)
      for (const c of cs) c._azar = semillaDe(`${semilla}|cartera-B|${s}|${c.symbol}|${c.entryDate}`) / 4294967296
      ej = reparte(P, cs, (c) => c._azar)
    }
    let m
    if (curvasSims) { const met = metricasCartera(ej, P.precios, P.fechasEje, P.o.capitalIni); m = aMedidas(met); curvasSims[s] = Float64Array.from(met.curva, x => x.value) }
    else m = medidas(P, ej)
    sims.cagr[s] = m.cagr; sims.maxDD[s] = m.maxDD; sims.capInv[s] = m.capInv; sims.ratio[s] = m.ratio ?? NaN; sims.capRatio[s] = m.capRatio ?? NaN
  }
  return {
    sims, nSim, stats, curvas: curvasSims,
    avanza(k) { const fin = Math.min(nSim, s + k); while (s < fin) { una(); s++ } return s },
    hechas: () => s, hecho: () => s >= nSim,
  }
}

// Resumen de una prueba frente a la real: CAGR y CAGR/caída (mayor es mejor), caída (menor es mejor) y capital invertido
// (solo se muestra, sin veredicto).
export function resumenPrueba(real, sims) {
  const v = (x) => Array.from(x).filter(Number.isFinite)
  const ci = v(sims.capInv)
  return { cagr: resumenAzar(v(sims.cagr), real.cagr), maxDD: resumenCaida(v(sims.maxDD), real.maxDD), ratio: resumenAzar(v(sims.ratio), real.ratio),
    // Solo informativa (la tabla A la enseña sin veredicto): mediana, P5–P95 y percentil del real.
    ...(sims.capRatio ? { capRatio: resumenAzar(v(sims.capRatio), real.capRatio) } : {}),
    capInv: { real: real.capInv, mediana: mediana(ci), p5: cuantil(ci, 0.05), p95: cuantil(ci, 0.95) } }
}

// El B&H Diversificado de la misma ejecución: CAGR (con la misma cuenta que la cartera en el cliente) y caída máxima.
export function bhDe(r) {
  const b = r?.bhCurve || []
  if (b.length < 2) return null
  const anios = (new Date(b[b.length - 1].date) - new Date(b[0].date)) / (365.25 * 864e5)
  return { cagr: (Math.pow(Math.max(b[b.length - 1].value, 0.01) / Math.max(b[0].value, 0.01), 1 / Math.max(anios, 0.01)) - 1) * 100, maxDD: r.maxDDBH ?? null }
}
