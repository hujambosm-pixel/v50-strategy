// lib/laboratorioEstrategias.js — laboratorio de ESTRATEGIAS COMPLETAS (LOTE_3): entrada (disparador + filtros del
// catálogo de señales) y salida (salidas del catálogo con su tope) contra la misma estrategia hecha al azar. Puro.
//
// LO REAL es el motor de salidas (lib/laboratorioSalidas.js, operacionesSalidasValor) con las señales del disparador:
// señal al cierre de t, entrada a la apertura de t+1, salida por condición a la apertura siguiente, tope al cierre de la
// vela N, una operación por valor a la vez (señales con la posición abierta ignoradas y contadas), miembros del
// Nasdaq-100 en la fecha de la señal, fin de datos marcado. Aquí no se repite nada de eso.
//
// LA ESTRATEGIA AL AZAR. Por valor: el MISMO número de operaciones que la real, con las DURACIONES REALES de ese valor
// (cada una con su punto de salida: apertura o cierre de su vela) repartidas al azar, en fechas de señal al azar entre los
// días válidos (los candidatos de lo real: miembro, con datos, con todos los indicadores de la entrada y de la salida
// calculados, con vela de entrada), sin solaparse (la regla de lo real: la siguiente señal, después de la última vela con
// la posición abierta). Todas las colocaciones posibles —qué duración va en qué fecha— son igual de probables:
//   · Dentro del intervalo [a, b] que va del primer al último día válido, una colocación es un orden de las duraciones y
//     los huecos entre operaciones. Si la operación j ocupa occ_j velas (de su señal a su última vela abierta), los
//     huecos suman R = (b − a) − Σ occ de todas menos la última (la última solo necesita que su señal caiga en [a, b]),
//     y hay C(R + k, k) maneras de repartirlos. Así que se sortea cuál va la última con peso C(R + k, k), el resto del
//     orden al azar y los huecos al azar (k barras entre R + k): eso es uniforme entre TODAS las colocaciones del
//     intervalo.
//   · Las que ponen una señal en un día no válido (un tramo fuera del índice, un hueco en los datos) o una última
//     operación que no cabe en las velas que hay, se rechazan y se vuelve a sortear: lo que queda sigue siendo uniforme
//     entre las válidas (sorteo exacto por rechazo). Si en MAX_INTENTOS no sale ninguna, esa simulación usa un sorteo por
//     programación dinámica con el orden ya sorteado (uniforme entre las colocaciones de ese orden) y se cuenta como
//     «aproximada»; a partir de ahí ese valor usa directamente el respaldo (no gasta los intentos en cada simulación).
// Medida principal: la MEDIA por operación; percentil de la media real entre las nSim (empates, la mitad). Informativas:
// mediana, P5, % acierto, duración, media por día en mercado y, de referencia, el QQQ comprando y manteniendo.
import { generador, semillaDeActivo, percentilDe } from './azar'
import { mediana } from './optimizacion'
import { percentil as cuantil } from './robustez'
import { esMiembroEn, N_SIM_LAB } from './laboratorio'
import { operacionesSalidasValor, realDelPeriodo, esCandidatoSalida, puntoDe, diasDe, puntoValido } from './laboratorioSalidas'

export const MAX_INTENTOS = 5000
// Velas que ocupa una operación de duración k (puntos) desde su señal: de t a su última vela con la posición abierta.
export const ocupacion = (k) => (k >> 1) + 1 + (k & 1)
// log C(n, k)
const logC = (n, k) => { let s = 0; for (let i = 1; i <= k; i++) s += Math.log(n - k + i) - Math.log(i); return s }

// Días válidos de un valor en un periodo (los candidatos de lo real).
export function diasValidos({ velas, tramos, calculables, desde, hasta }) {
  const out = []
  for (let t = 0; t < velas.length; t++) {
    const f = velas[t].date
    if (f >= desde && f <= hasta && esMiembroEn(tramos, f) && esCandidatoSalida(velas, calculables, t)) out.push(t)
  }
  return out
}

// Preparación del azar de un valor: sus días válidos y las duraciones de sus operaciones reales.
// sortea(rnd) → [{ t, k }] (en orden de fecha) o null si no hay ninguna colocación posible; marca .aproximada.
export function preparaAzarEstrategia(velas, validos, ks) {
  const n = velas.length, k = ks.length
  if (!k) return { posible: true, sortea: () => ({ ops: [], aproximada: false }) }
  if (!validos.length) return { posible: false, sortea: () => null }
  const valido = new Uint8Array(n); for (const t of validos) valido[t] = 1
  const a = validos[0], b = validos[validos.length - 1]
  const occ = ks.map(ocupacion), T = occ.reduce((s, x) => s + x, 0)
  const R = occ.map(o => (b - a) - (T - o))
  const lw = R.map(r => r < 0 ? -Infinity : logC(r + k, k)), mx = Math.max(...lw)
  const posible = Number.isFinite(mx)
  const w = lw.map(x => Number.isFinite(x) ? Math.exp(x - mx) : 0), W = w.reduce((s, x) => s + x, 0)
  const cabeUltima = (t, kk) => t + 1 + (kk >> 1) <= n - 1   // la salida de la última, dentro de las velas
  // Uniforme entre las colocaciones con un orden fijo (programación dinámica sobre las velas del intervalo).
  function porOrden(orden, rnd) {
    const K = k + 1, M = b - a + 2, C = new Float64Array(M * K)   // C[i*K + j]: maneras de colocar orden[j..] con señal >= a+i
    for (let i = 0; i < M; i++) C[i * K + k] = 1
    for (let i = M - 2; i >= 0; i--) for (let j = k - 1; j >= 0; j--) {
      const t = a + i, kk = ks[orden[j]], sig = i + occ[orden[j]]
      const toma = valido[t] && (j < k - 1 ? (sig < M ? C[sig * K + j + 1] : 0) : (cabeUltima(t, kk) ? 1 : 0))
      C[i * K + j] = C[(i + 1) * K + j] + toma
    }
    if (!(C[0] > 0) || !Number.isFinite(C[0])) return null   // ninguna colocación (o demasiadas para contarlas en coma flotante)
    const out = []
    let i = 0
    for (let j = 0; j < k; j++) {
      for (;; i++) {
        const t = a + i, kk = ks[orden[j]], sig = i + occ[orden[j]]
        const toma = valido[t] && (j < k - 1 ? (sig < M ? C[sig * K + j + 1] : 0) : (cabeUltima(t, kk) ? 1 : 0))
        if (toma && rnd() * C[i * K + j] < toma) { out.push({ t, k: kk }); i = sig; break }
      }
    }
    return out
  }
  let soloRespaldo = false
  return {
    posible, a, b,
    sortea(rnd) {
      if (!posible) return null
      let orden = null
      for (let intento = 0; intento < (soloRespaldo ? 1 : MAX_INTENTOS); intento++) {
        // 1) cuál va la última, con peso C(R + k, k); 2) el resto del orden, al azar.
        let u = rnd() * W, l = 0
        while (l < k - 1 && u >= w[l]) { u -= w[l]; l++ }
        while (w[l] === 0) l = (l + 1) % k
        orden = []; for (let j = 0; j < k; j++) if (j !== l) orden.push(j)
        for (let j = orden.length - 1; j > 0; j--) { const m = Math.floor(rnd() * (j + 1)); [orden[j], orden[m]] = [orden[m], orden[j]] }
        orden.push(l)
        // 3) los huecos: k barras distintas entre R + k (Floyd), en orden.
        const N = R[l] + k, barras = new Set()
        for (let j = N - k; j < N; j++) { const x = Math.floor(rnd() * (j + 1)); barras.add(barras.has(x) ? j : x) }
        const bs = [...barras].sort((x, y) => x - y)
        const ops = []
        let t = a + bs[0], ok = true
        for (let j = 0; j < k; j++) {
          if (!valido[t]) { ok = false; break }
          ops.push({ t, k: ks[orden[j]] })
          if (j < k - 1) t += occ[orden[j]] + (bs[j + 1] - bs[j] - 1)
        }
        if (ok && cabeUltima(ops[k - 1].t, ops[k - 1].k)) return { ops, aproximada: false }
      }
      soloRespaldo = true
      const ops = porOrden(orden, rnd)
      return ops ? { ops, aproximada: true } : null
    },
  }
}

// Rendimiento de una operación al azar: entrada a la apertura de t+1, salida en su punto k (el anterior válido si falta).
// (Exportada en V9.1026 para el laboratorio de las estrategias del editor, lib/editor/laboratorio.js; sin cambios.)
export function rendimientoDe(velas, t, k) {
  const e = t + 1, pv = puntoValido(velas, e, k)
  return pv ? { rend: pv.precio / velas[e].open - 1, dias: diasDe(pv.k) } : null
}

// QQQ comprando y manteniendo en el periodo (referencia): de la apertura de su primera vela al cierre de la última.
export function referenciaQqq(qqq, desde, hasta) {
  const vs = (qqq || []).filter(x => x.date >= desde && x.date <= hasta && x.open > 0 && x.close > 0)
  if (vs.length < 2) return null
  const total = vs[vs.length - 1].close / vs[0].open - 1
  return { total, dias: vs.length, porDia: total / vs.length, desde: vs[0].date, hasta: vs[vs.length - 1].date }
}

// Un periodo. valores: [{ sym, velas, tramos, calculables, senales }]; decisionesDe(velas) → [funciones]; tope: N.
export function ejecutaPeriodoEstrategias({ valores, desde, hasta, decisionesDe: dd, tope, nSim = N_SIM_LAB, semilla = 0, qqq = null }) {
  const porValor = valores.map(v => ({ ...v, ...operacionesSalidasValor({ ...v, desde, hasta, decisiones: dd(v.velas), tope }) }))
  const { base, comunes } = realDelPeriodo(porValor)
  const conOps = porValor.filter(v => v.ops.length)
  const sorteos = conOps.map(v => preparaAzarEstrategia(v.velas, diasValidos({ ...v, desde, hasta }), v.ops.map(o => o.k)))
  const rnds = conOps.map(v => generador(semillaDeActivo(semilla, `${v.sym}|labEstrategia`)))
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
    percentil: percentilDe(ms, base.media), duracionMedia: ds.length ? ds.reduce((a, b) => a + b, 0) / ds.length : null, aproximadas, imposibles }
  return { prueba: 'estrategias', desde, hasta, ...base, ...comunes, azar, qqq: referenciaQqq(qqq, desde, hasta) }
}
