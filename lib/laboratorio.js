// lib/laboratorio.js — motor del laboratorio de señales (entrega 2). Puro: recibe las velas y la pertenencia al índice, no
// toca la red. Lo usa /api/laboratorio (que lee los datos) y las pruebas.
//
// REGLAS (iguales para lo real y para el azar)
// · Universo: el valor tiene que ser miembro del Nasdaq-100 (tramos de universo_miembros sin excluir) en la FECHA DE LA
//   SEÑAL. Una posición abierta sigue aunque el valor salga del índice.
// · Señal al cierre de t; entrada a la APERTURA de t+1; salida al CIERRE de la vela nVelas contando la de entrada (índice
//   t + nVelas). Cuentan las señales con fecha dentro del periodo; la salida puede caer después del final.
// · Una operación por valor a la vez: la posición está abierta desde la entrada hasta el cierre de su vela de salida
//   (incluida); las señales de ese valor en esas velas se ignoran y se cuentan como «ignoradas».
// · Si las velas del valor terminan antes de la vela de salida: salida al último cierre disponible, marcada «cerrada por
//   fin de datos». Si no hay vela de entrada (la señal es la última vela) o su apertura no es válida, la señal no abre
//   operación y se cuenta como «sin entrada».
// · Rendimiento por operación = cierre de salida / apertura de entrada − 1, bruto.
// · Cada periodo se calcula por separado, empezando sin posiciones.
//
// PRUEBA CONTRA EL AZAR: por valor, el mismo número de operaciones que la real, colocadas en señales al azar SIN SOLAPARSE
// (la misma regla: ninguna empieza mientras otra está abierta), elegidas solo entre las velas del periodo en que el valor
// era miembro, tenía datos, la señal era CALCULABLE (no nula) y había vela de entrada válida; todas las colocaciones
// válidas son igual de probables (preparaAzarValor: sorteo exacto). Mismas reglas de salida y fin
// de datos. En cada simulación, la mediana de todas las operaciones juntas; percentil de la mediana real entre las nSim
// medianas (empates, la mitad). Semilla fija: la misma configuración da siempre el mismo resultado.
import { generador, semillaDe, semillaDeActivo, percentilDe } from './azar'
import { mediana } from './optimizacion'
import { percentil as cuantil } from './robustez'
import { atrPrevio, sumaExcursiones, acumuladorVacio, ratioDe } from './edge'

export const SALIDA_VELAS = 20
export const N_SIM_LAB = 1000
export const MIN_OPERACIONES = 100
export const PERCENTIL_PASA = 95
export const EDGE_N_LAB = [5, 10, 20]

const precioOk = (x) => typeof x === 'number' && Number.isFinite(x) && x > 0
const cubre = (tramo, fecha) => tramo.desde <= fecha && (tramo.hasta == null || fecha < tramo.hasta)
export const esMiembroEn = (tramos, fecha) => (tramos || []).some(t => !t.excluido_motivo && cubre(t, fecha))

// La operación que abriría una señal en t: { t, e, s, entrada, salida, rend, finDatos } o null si no hay entrada válida.
// La salida es el cierre de la vela t + nVelas; si no existe (o su cierre no es válido), el último cierre válido anterior,
// marcada finDatos.
export function operacionDesde(velas, t, nVelas) {
  const e = t + 1, n = velas.length
  if (e >= n || !precioOk(velas[e].open)) return null
  let s = t + nVelas, finDatos = false
  if (s >= n) { s = n - 1; finDatos = true }
  while (s > e && !precioOk(velas[s].close)) { s--; finDatos = true }
  if (!precioOk(velas[s].close)) return null
  const entrada = velas[e].open, salida = velas[s].close
  return { t, e, s, entrada, salida, rend: salida / entrada - 1, finDatos }
}

// Lo real de un valor en un periodo: operaciones, eventos (señales con el valor miembro), ignoradas, sin entrada, y las
// velas candidatas para el azar.
export function operacionesDeValor({ velas, entradas, calculables, tramos, desde, hasta, nVelas = SALIDA_VELAS }) {
  const ops = [], candidatos = []
  let eventos = 0, ignoradas = 0, sinEntrada = 0, abiertaHasta = -1
  for (let t = 0; t < velas.length; t++) {
    const f = velas[t].date
    if (f < desde || f > hasta) continue
    const miembro = esMiembroEn(tramos, f)
    if (miembro && calculables[t] && precioOk(velas[t].close) && operacionDesde(velas, t, nVelas)) candidatos.push(t)
    if (!entradas[t] || !miembro) continue
    eventos++
    if (t <= abiertaHasta) { ignoradas++; continue }
    const op = operacionDesde(velas, t, nVelas)
    if (!op) { sinEntrada++; continue }
    ops.push(op); abiertaHasta = op.s
  }
  return { ops, eventos, ignoradas, sinEntrada, candidatos }
}

// Sorteo EXACTO y UNIFORME de k operaciones sin solaparse entre las velas candidatas: todas las colocaciones válidas (una
// operación en t ocupa de t a su salida s; la siguiente solo puede empezar después de s, la misma regla que lo real) son
// igual de probables. Programación dinámica: W[i][j] = de cuántas formas se colocan j operaciones en las velas i … n−1
// (W[i][j] = W[i+1][j] + (candidata(i) ? W[s(i)+1][j−1] : 0)); el sorteo recorre la serie tomando la vela i con
// probabilidad W[s(i)+1][j−1] / W[i][j]. Un orden aleatorio que acepta lo que no choca se atasca cuando las operaciones
// llenan buena parte del periodo; esto no. Se prepara una vez por valor y sortea en O(n) por simulación.
// Devuelve { sortea(rnd) → [operaciones], posible } (posible = false si no caben k, que con las reales no ocurre).
export function preparaAzarValor(velas, candidatos, k, nVelas = SALIDA_VELAS) {
  const n = velas.length, K = k + 1
  const op = new Array(n).fill(null)
  for (const t of candidatos) op[t] = operacionDesde(velas, t, nVelas)
  const W = new Float64Array((n + 2) * K)   // fila n y n+1: solo W[·][0] = 1
  const at = (i, j) => W[i * K + j]
  W[n * K] = 1; W[(n + 1) * K] = 1
  for (let i = n - 1; i >= 0; i--) {
    W[i * K] = 1
    for (let j = 1; j <= k; j++) W[i * K + j] = at(i + 1, j) + (op[i] ? at(Math.min(op[i].s + 1, n), j - 1) : 0)
  }
  const posible = k === 0 || (at(0, k) > 0 && Number.isFinite(at(0, k)))
  return {
    posible,
    sortea(rnd) {
      if (!posible) return []
      const out = []
      let i = 0, j = k
      while (j > 0 && i < n) {
        if (op[i]) {
          const toma = at(Math.min(op[i].s + 1, n), j - 1)
          if (rnd() * at(i, j) < toma) { out.push(op[i]); i = op[i].s + 1; j--; continue }
        }
        i++
      }
      return out
    },
  }
}

const resumenRend = (rs) => {
  const g = rs.filter(r => r > 0), p = rs.filter(r => r < 0)
  const suma = (a) => a.reduce((s, x) => s + x, 0)
  return { operaciones: rs.length, mediana: mediana(rs), media: rs.length ? suma(rs) / rs.length : null,
    acierto: rs.length ? g.length / rs.length * 100 : null,
    gananciaMedia: g.length ? suma(g) / g.length : null, perdidaMedia: p.length ? suma(p) / p.length : null }
}

// Un periodo completo. valores: [{ sym, velas, entradas, calculables, tramos }]. Devuelve el resumen (sin las operaciones).
export function ejecutaPeriodo({ valores, desde, hasta, nVelas = SALIDA_VELAS, nSim = N_SIM_LAB, semilla = 0 }) {
  const porValor = valores.map(v => ({ ...v, ...operacionesDeValor({ ...v, desde, hasta, nVelas }) }))
  const todas = porValor.flatMap(v => v.ops.map(o => ({ ...o, sym: v.sym, fecha: v.velas[o.t].date })))
  const rend = todas.map(o => o.rend)
  const base = resumenRend(rend)
  // Edge Ratio (informativo): excursiones en ATR desde la entrada, a 5, 10 y 20 velas (lib/edge.js).
  const acum = acumuladorVacio(EDGE_N_LAB)
  for (const v of porValor) {
    if (!v.ops.length) continue
    const altos = v.velas.map(x => x.high), bajos = v.velas.map(x => x.low), cierra = v.velas.map(x => x.close)
    const atr = atrPrevio(altos, bajos, cierra)
    for (const o of v.ops) sumaExcursiones(acum, altos, bajos, atr, o.e, o.entrada, EDGE_N_LAB)
  }
  const edge = Object.fromEntries(EDGE_N_LAB.map((n, k) => [n, ratioDe(acum, k)]))
  // Desgloses.
  const porAnio = {}
  for (const o of todas) (porAnio[o.fecha.slice(0, 4)] ||= []).push(o.rend)
  const porActivo = porValor.filter(v => v.ops.length).map(v => ({ sym: v.sym, ...resumenRend(v.ops.map(o => o.rend)) }))
    .map(({ sym, operaciones, mediana: md, media, acierto }) => ({ sym, operaciones, mediana: md, media, acierto }))
    .sort((a, b) => b.operaciones - a.operaciones || (a.sym < b.sym ? -1 : 1))
  // Azar.
  const conOps = porValor.filter(v => v.ops.length)
  const rnds = conOps.map(v => generador(semillaDeActivo(semilla, `${v.sym}|lab`)))
  const sorteos = conOps.map(v => preparaAzarValor(v.velas, v.candidatos, v.ops.length, nVelas))
  const incompletas = sorteos.filter(x => !x.posible).length   // valores en que no caben (no debería pasar)
  const medianas = new Float64Array(nSim)
  for (let s = 0; s < nSim; s++) {
    const rs = []
    sorteos.forEach((x, j) => { for (const o of x.sortea(rnds[j])) rs.push(o.rend) })
    medianas[s] = rs.length ? mediana(rs) : NaN
  }
  const ms = Array.from(medianas).filter(Number.isFinite)
  return {
    desde, hasta, ...base,
    eventos: porValor.reduce((a, v) => a + v.eventos, 0), ignoradas: porValor.reduce((a, v) => a + v.ignoradas, 0),
    sinEntrada: porValor.reduce((a, v) => a + v.sinEntrada, 0), finDatos: todas.filter(o => o.finDatos).length,
    edge,
    porAnio: Object.entries(porAnio).sort().map(([anio, r]) => ({ anio, operaciones: r.length, mediana: mediana(r) })),
    porActivo,
    azar: { nSim, semilla, mediana: mediana(ms), p5: cuantil(ms, 0.05), p95: cuantil(ms, 0.95), percentil: percentilDe(ms, base.mediana), incompletas },
  }
}

// Semilla de una configuración y periodo (a partir de su huella): reproducible.
export const semillaLab = (hashConfig, desde) => semillaDe(`${hashConfig}|${desde}|laboratorio`)

// Veredicto: solo para pruebas oficiales. 'pasa' si en TODOS los periodos hay >= MIN_OPERACIONES y percentil >= 95;
// 'datos insuficientes' si alguno no llega al mínimo de operaciones; si no, 'no pasa'. Exploratoria: 'sin veredicto'.
export function veredictoLab(oficial, periodos, { minOperaciones = MIN_OPERACIONES, percentilPasa = PERCENTIL_PASA } = {}) {
  if (!oficial) return 'sin veredicto'
  if (!periodos?.length || periodos.some(p => !p || p.operaciones < minOperaciones)) return 'datos insuficientes'
  return periodos.every(p => p.azar?.percentil != null && p.azar.percentil >= percentilPasa) ? 'pasa' : 'no pasa'
}
