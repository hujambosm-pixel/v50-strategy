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

// Semilla fija derivada de la configuración (estrategia, activos, periodo, temporalidad, reparto).
export function semillaCartera(p) {
  const c = p.cfg || {}
  return semillaDe(JSON.stringify([p.strategyId, [...(p.symbols || [])].sort(), c.fromDate, c.toDate, c.years, c.capitalIni, p.intervalo, p.modoAsig,
    p.sizeRules || c.sizeRules || null, p.comisiones || null, p.params || null]))
}

// Prepara lo que manda el servidor: velas e índices por activo, la función de prioridad, los precios para las métricas y
// el eje diario (las fechas de todos los activos desde el inicio, como _commonDates del servidor).
export function preparaCartera(c) {
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
  return { o, activos, puntua, precios, fechasEje }
}

export function medidas(P, ejecutadas) {
  const m = metricasCartera(ejecutadas, P.precios, P.fechasEje, P.o.capitalIni)
  return { cagr: m.cagr, maxDD: m.maxDD, capInv: m.capInvPct, ratio: m.maxDD > 0 && m.cagr != null ? m.cagr / m.maxDD : null }
}
const reparte = (P, candidatos, ps = null) => asignaCartera(candidatos, { ...P.o, ps }).ejecutadas
// Copias de los candidatos reales en el orden del servidor (activo a activo): asignaCartera los ordena en sitio.
const copiasReales = (P) => P.activos.flatMap(a => a.candidatos.map(c => ({ ...c })))

// La cartera real recompuesta a partir de los candidatos (tiene que dar lo mismo que el servidor).
export function realCartera(P) { return medidas(P, reparte(P, copiasReales(P))) }

// La misma comprobación que hace la pantalla: CAGR compuesto (como el cliente, de compoundCurve), caída máxima con flotante
// y capital invertido medio del servidor frente a la recomposición. Tolerancia 1e-6 puntos (en Slots el capital compone
// con netoDeOperacion y el servidor con acciones: la misma cuenta en otro orden de coma flotante).
export function comparaConServidor(real, r, tolerancia = 1e-6) {
  const cc = r.compoundCurve || []
  const anios = cc.length ? (new Date(cc[cc.length - 1].date) - new Date(cc[0].date)) / (365.25 * 864e5) : 0
  const cagr = cc.length ? (Math.pow(Math.max(cc[cc.length - 1].value, 0.01) / Math.max(cc[0].value, 0.01), 1 / Math.max(anios, 0.01)) - 1) * 100 : null
  const dif = { cagr: Math.abs(real.cagr - cagr), maxDD: Math.abs(real.maxDD - r.maxDDFloatCompound), capInv: Math.abs(real.capInv - r.avgCapOccupancy) }
  return { ok: Object.values(dif).every(x => x <= tolerancia), dif, servidor: { cagr, maxDD: r.maxDDFloatCompound, capInv: r.avgCapOccupancy } }
}

// A: candidatos al azar de una simulación. Prioridad memorizada por (símbolo, fecha): no cambia entre simulaciones.
export function candidatosAlAzar(P, rnds, memo = new Map()) {
  const out = []
  P.activos.forEach((a, j) => {
    const n = a.fechas.length
    if (!a.candidatos.length || !n) return
    const durs = duracionesEnVelas(a.candidatos, a.fechas)
    const col = colocaAlAzar(n, durs, rnds[j])
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
export function creaPrueba(P, { tipo, nSim = AZAR.simulaciones, semilla = 0 }) {
  const sims = { cagr: new Float64Array(nSim), maxDD: new Float64Array(nSim), capInv: new Float64Array(nSim), ratio: new Float64Array(nSim) }
  const rnds = P.activos.map(a => generador(semillaDeActivo(semilla, `${a.symbol}|cartera-A`)))
  const memo = new Map()
  let s = 0
  const una = () => {
    let ej
    if (tipo === 'A') ej = reparte(P, candidatosAlAzar(P, rnds, memo))
    else {
      const cs = copiasReales(P)
      for (const c of cs) c._azar = semillaDe(`${semilla}|cartera-B|${s}|${c.symbol}|${c.entryDate}`) / 4294967296
      ej = reparte(P, cs, (c) => c._azar)
    }
    const m = medidas(P, ej)
    sims.cagr[s] = m.cagr; sims.maxDD[s] = m.maxDD; sims.capInv[s] = m.capInv; sims.ratio[s] = m.ratio ?? NaN
  }
  return {
    sims, nSim,
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
    capInv: { real: real.capInv, mediana: mediana(ci), p5: cuantil(ci, 0.05), p95: cuantil(ci, 0.95) } }
}

// El B&H Diversificado de la misma ejecución: CAGR (con la misma cuenta que la cartera en el cliente) y caída máxima.
export function bhDe(r) {
  const b = r?.bhCurve || []
  if (b.length < 2) return null
  const anios = (new Date(b[b.length - 1].date) - new Date(b[0].date)) / (365.25 * 864e5)
  return { cagr: (Math.pow(Math.max(b[b.length - 1].value, 0.01) / Math.max(b[0].value, 0.01), 1 / Math.max(anios, 0.01)) - 1) * 100, maxDD: r.maxDDBH ?? null }
}
