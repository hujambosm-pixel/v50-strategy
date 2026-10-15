// lib/laboratorioSalidas.js — motor del laboratorio de SALIDAS (LOTE_2). Puro: recibe las velas, la pertenencia al índice
// y las salidas ya preparadas (lib/senales.js); no toca la red. Lo usa /api/laboratorio y las pruebas.
//
// REGLAS (iguales para lo real y para el azar)
// · Entradas: en cada valor, los días CANDIDATOS son los del periodo en que el valor es miembro del Nasdaq-100 (tramos sin
//   excluir), tiene cierre válido, tiene TODOS los indicadores del calentamiento calculados y hay vela de entrada válida
//   (apertura de t+1). Con entradas al azar, cada candidato es señal con probabilidad p (un sorteo por candidato, en orden,
//   con la semilla de las entradas: las mismas señales sea cual sea la salida). Con un disparador (exploratorias), la
//   señal es la del disparador; una señal en un día que no es candidato cuenta como «sin entrada».
// · Señal al cierre de t; entrada a la APERTURA de t+1 (= e). Una operación por valor a la vez: las señales con la posición
//   abierta se ignoran y se cuentan («ignoradas»).
// · Salida, vela a vela desde el cierre de la vela de entrada (b = e, e+1, …):
//     1. b = e + N − 1 (tope de tiempo, N velas contando la de entrada) → al CIERRE de b («tiempo»). Si en esa vela salta
//        también una condición, manda el tiempo (su cierre llega antes que la apertura siguiente).
//     2. b = última vela con datos → al cierre de b, marcada «fin de datos».
//     3. alguna condición true al cierre de b → a la APERTURA de b+1 («condición»).
// · Rendimiento = precio de salida / apertura de entrada − 1, bruto.
//
// PUNTOS. Cada precio de una operación es un «punto»: k = 0 la apertura de e, k = 1 su cierre, k = 2 la apertura de e+1…
// (vela e + ⌊k/2⌋; impar = cierre, par = apertura). La DURACIÓN de una operación es el k de su salida; los días en mercado,
// ⌈k/2⌉ (salir al cierre de la vela N: N días; a la apertura de la vela m: m − e días).
//
// PRUEBA CONTRA EL AZAR (la principal, la del veredicto): PERMUTACIÓN EXACTA (sorteaPermutacion). Mismas entradas que la
// salida real (las operaciones que de verdad se abrieron) y, entre las operaciones de cada valor, EXACTAMENTE sus
// duraciones reales repartidas al azar, uniforme entre todos los repartos que caben: ninguna pasa del hueco hasta la
// siguiente entrada real ni del fin de datos (sin solapes). Como cada operación admite todas las duraciones hasta su hueco
// (conjuntos encajados), sale sin rechazo: se recorren de menor a mayor hueco y cada una toma al azar una de las
// duraciones que quedan y caben (con la identidad siempre hay reparto). La media de todas las operaciones de cada
// simulación; percentil de la media real entre las nSim (empates, la mitad).
// INFORMATIVOS (no dan veredicto):
// · «hueco» (sortea, el del enunciado): a cada operación, una duración al azar de las del valor que caben en su hueco.
//   Recorta las largas (no caben) y el azar queda más corto que lo real: en la calibración con salidas sin ventaja dio
//   percentil >= 95 en el 84 % de los casos. Se enseña con su duración media para que se vea.
// · «re-simulado» (sorteaSecuencial): la misma secuencia de señales del valor, con duraciones sacadas de las reales;
//   cambian las entradas que se abren (por las ignoradas). Calibrado también.
import { generador, semillaDeActivo, percentilDe } from './azar'
import { mediana } from './optimizacion'
import { percentil as cuantil } from './robustez'
import { esMiembroEn, N_SIM_LAB } from './laboratorio'
import { SALIDAS, condicionesDe, topeDe, indicadoresSalidas, serieIndicador } from './senales'

const precioOk = (x) => typeof x === 'number' && Number.isFinite(x) && x > 0
export const puntoDe = (e, k) => ({ b: e + (k >> 1), cierre: (k & 1) === 1 })
export const kDe = (e, b, cierre) => 2 * (b - e) + (cierre ? 1 : 0)
export const diasDe = (k) => Math.ceil(k / 2)
// Última vela con la posición abierta al cierre: saliendo al cierre de b, b; a la apertura de b, b − 1.
export const abiertaHastaDe = (b, cierre) => cierre ? b : b - 1
const precioEn = (velas, b, cierre) => cierre ? velas[b]?.close : velas[b]?.open

// Velas en que TODOS los indicadores (lista de { indicador, periodo }) están calculados.
export function calculablesIndicadores(velas, indicadores) {
  const ss = indicadores.map(i => serieIndicador(velas, i))
  return velas.map((_, t) => ss.every(s => s[t] != null))
}
// Las funciones de decisión de una lista de salidas (las condiciones; el tope va aparte).
export const decisionesDe = (velas, reglas) => condicionesDe(reglas).map(r => SALIDAS[r.id].evalua(velas, r.params))
// Calentamiento de una prueba: el declarado en las entradas más lo que usen sus salidas.
export const indicadoresPrueba = (config) => [...(config.entradas?.calentamiento || []), ...indicadoresSalidas(config.salidas)]

// Precio válido en el punto k o, si no lo hay, en el anterior que lo tenga (k >= 1). Devuelve { k, precio }.
function puntoValido(velas, e, k) {
  for (let j = k; j >= 1; j--) { const { b, cierre } = puntoDe(e, j); const p = precioEn(velas, b, cierre); if (precioOk(p)) return { k: j, precio: p } }
  return null
}
function cierra(velas, op, b, cierre, motivo) {
  const pv = puntoValido(velas, op.e, kDe(op.e, b, cierre))
  if (!pv) return null
  const { b: bb, cierre: cc } = puntoDe(op.e, pv.k)
  return { t: op.e - 1, e: op.e, entrada: op.entrada, b: bb, cierre: cc, k: pv.k, dias: diasDe(pv.k), salida: pv.precio, rend: pv.precio / op.entrada - 1,
    motivo, finDatos: motivo === 'fin' }
}
// La operación que abre una entrada en la vela e, con sus decisiones ((op, t) → true|false|null) y el tope N. null si
// no hay apertura válida en e.
export function operacionSalida(velas, e, decisiones, tope) {
  const n = velas.length
  if (e >= n || !precioOk(velas[e]?.open)) return null
  const op = { e, entrada: velas[e].open, maxAlto: null }
  for (let b = e; b < n; b++) {
    const h = velas[b].high
    if (precioOk(h) && (op.maxAlto == null || h > op.maxAlto)) op.maxAlto = h
    if (b === e + tope - 1) return cierra(velas, op, b, true, 'tiempo')
    if (b === n - 1) return cierra(velas, op, b, true, 'fin')
    for (const d of decisiones) if (d(op, b) === true) return cierra(velas, op, b + 1, false, 'condicion')
  }
  return null
}

// Lo real de un valor en un periodo. senales: bool[] del disparador, o null para entradas al azar (rnd, probabilidad).
export function operacionesSalidasValor({ velas, tramos, calculables, desde, hasta, senales = null, rnd = null, probabilidad = 0, decisiones, tope }) {
  const ops = [], n = velas.length, senalesT = []
  let eventos = 0, ignoradas = 0, sinEntrada = 0, candidatos = 0, abiertaHasta = -1
  for (let t = 0; t < n; t++) {
    const f = velas[t].date
    if (f < desde || f > hasta || !esMiembroEn(tramos, f)) continue
    const cand = calculables[t] && precioOk(velas[t].close) && t + 1 < n && precioOk(velas[t + 1].open)
    let senal
    if (senales) { senal = !!senales[t]; if (senal && !cand) { sinEntrada++; continue } }
    else { if (!cand) continue; senal = rnd() < probabilidad }
    candidatos++
    if (!senal) continue
    eventos++; senalesT.push(t)
    if (t <= abiertaHasta) { ignoradas++; continue }
    const op = operacionSalida(velas, t + 1, decisiones, tope)
    if (!op) { sinEntrada++; continue }
    ops.push(op); abiertaHasta = abiertaHastaDe(op.b, op.cierre)
  }
  return { ops, eventos, ignoradas, sinEntrada, candidatos, senalesT }
}

// Hueco de cada operación: el k más largo que no la solapa con la siguiente entrada real (la siguiente señal en t' exige
// la posición cerrada al cierre de t' → como mucho, salir a la apertura de t') ni pasa del último cierre con datos.
export function huecos(velas, ops) {
  const n = velas.length
  return ops.map((o, i) => i + 1 < ops.length ? 2 * (ops[i + 1].t - o.e) : kDe(o.e, n - 1, true))
}
const cuantasHasta = (orden, m) => { let lo = 0, hi = orden.length; while (lo < hi) { const md = (lo + hi) >> 1; if (orden[md] <= m) lo = md + 1; else hi = md } return lo }
// Preparación del azar de un valor (sus operaciones reales). sortea: el método del lote; sorteaPermutacion: el exacto.
export function preparaAzarSalidas(velas, ops, senalesT = []) {
  const D = ops.map(o => o.k).sort((a, b) => a - b), H = huecos(velas, ops)
  const caben = H.map(m => cuantasHasta(D, m))
  const porHueco = ops.map((_, i) => i).sort((a, b) => H[a] - H[b] || a - b)
  const opDe = (i, k) => { const pv = puntoValido(velas, ops[i].e, k); return pv ? { rend: pv.precio / ops[i].entrada - 1, dias: diasDe(pv.k) } : { rend: 0, dias: 0 } }
  return {
    huecos: H,
    sortea(rnd, acc) {
      for (let i = 0; i < ops.length; i++) {
        const c = caben[i]
        if (!c) acc.sinHueco++
        const x = opDe(i, c ? D[Math.floor(rnd() * c)] : H[i])
        acc.suma += x.rend; acc.dias += x.dias; acc.n++
      }
    },
    // Re-simulación: la MISMA secuencia de señales del valor; en cada una con la posición cerrada se abre, con una
    // duración sacada de las reales del valor (sin pasar del último cierre), y las señales con la posición abierta se
    // ignoran, como en lo real.
    sorteaSecuencial(rnd, acc) {
      const n = velas.length
      let abiertaHasta = -1
      for (const t of senalesT) {
        if (t <= abiertaHasta || !D.length) continue
        const e = t + 1, k = Math.min(D[Math.floor(rnd() * D.length)], kDe(e, n - 1, true)), pv = puntoValido(velas, e, k)
        if (!pv) continue
        const { b, cierre } = puntoDe(e, pv.k)
        acc.suma += pv.precio / velas[e].open - 1; acc.dias += diasDe(pv.k); acc.n++
        abiertaHasta = abiertaHastaDe(b, cierre)
      }
    },
    sorteaPermutacion(rnd, acc) {
      const quedan = D.slice()
      for (const i of porHueco) {
        const c = cuantasHasta(quedan, H[i]), j = Math.floor(rnd() * c)
        const x = opDe(i, quedan[j]); quedan.splice(j, 1)
        acc.suma += x.rend; acc.dias += x.dias; acc.n++
      }
    },
  }
}

const resumen = (ops) => {
  const rs = ops.map(o => o.rend), g = rs.filter(r => r > 0), p = rs.filter(r => r < 0)
  const suma = (a) => a.reduce((s, x) => s + x, 0), dias = suma(ops.map(o => o.dias))
  return { operaciones: rs.length, media: rs.length ? suma(rs) / rs.length : null, mediana: mediana(rs), p5: cuantil(rs, 0.05),
    acierto: rs.length ? g.length / rs.length * 100 : null, gananciaMedia: g.length ? suma(g) / g.length : null, perdidaMedia: p.length ? suma(p) / p.length : null,
    duracionMedia: rs.length ? dias / rs.length : null, mediaPorDia: dias ? suma(rs) / dias : null }
}
function simula(sorteos, rnds, nSim, metodo) {
  const medias = new Float64Array(nSim), duraciones = new Float64Array(nSim)
  let sinHueco = 0
  for (let s = 0; s < nSim; s++) {
    const acc = { suma: 0, dias: 0, n: 0, sinHueco: 0 }
    sorteos.forEach((x, j) => x[metodo](rnds[j], acc))
    medias[s] = acc.n ? acc.suma / acc.n : NaN; duraciones[s] = acc.n ? acc.dias / acc.n : NaN; sinHueco += acc.sinHueco
  }
  const ms = Array.from(medias).filter(Number.isFinite), ds = Array.from(duraciones).filter(Number.isFinite)
  return { ms, media: mediana(ms), p5: cuantil(ms, 0.05), p95: cuantil(ms, 0.95), duracionMedia: ds.length ? ds.reduce((a, b) => a + b, 0) / ds.length : null, sinHueco }
}

// Un periodo. valores: [{ sym, velas, tramos, calculables, senales? }]. entradas: { probabilidad, semilla } (al azar) o
// null (cada valor trae sus senales). decisionesDe(velas) → [funciones]; tope: N. exacto: añade el azar por permutación.
export function ejecutaPeriodoSalidas({ valores, desde, hasta, entradas = null, decisionesDe: dd, tope, nSim = N_SIM_LAB, semilla = 0 }) {
  const porValor = valores.map(v => ({ ...v, ...operacionesSalidasValor({ ...v, desde, hasta, decisiones: dd(v.velas), tope,
    ...(entradas ? { senales: null, rnd: generador(semillaDeActivo(entradas.semilla, `${v.sym}|entradas|${desde}`)), probabilidad: entradas.probabilidad } : {}) }) }))
  const todas = porValor.flatMap(v => v.ops.map(o => ({ ...o, sym: v.sym, fecha: v.velas[o.t].date })))
  const base = resumen(todas)
  const porAnio = {}
  for (const o of todas) (porAnio[o.fecha.slice(0, 4)] ||= []).push(o)
  const porActivo = porValor.filter(v => v.ops.length).map(v => { const r = resumen(v.ops); return { sym: v.sym, operaciones: r.operaciones, media: r.media, mediana: r.mediana, acierto: r.acierto, duracionMedia: r.duracionMedia } })
    .sort((a, b) => b.operaciones - a.operaciones || (a.sym < b.sym ? -1 : 1))
  const conOps = porValor.filter(v => v.ops.length)
  const sorteos = conOps.map(v => preparaAzarSalidas(v.velas, v.ops, v.senalesT))
  const rndsDe = (etq) => conOps.map(v => generador(semillaDeActivo(semilla, `${v.sym}|${etq}`)))
  const resumenAzar = (x) => ({ media: x.media, p5: x.p5, p95: x.p95, percentil: percentilDe(x.ms, base.media), duracionMedia: x.duracionMedia })
  const azar = { nSim, semilla, metodo: 'permutación exacta', ...resumenAzar(simula(sorteos, rndsDe('labSalidasPermuta'), nSim, 'sorteaPermutacion')) }
  const h = simula(sorteos, rndsDe('labSalidas'), nSim, 'sortea')
  const otrosAzares = { hueco: { ...resumenAzar(h), sinHueco: h.sinHueco }, resimulado: resumenAzar(simula(sorteos, rndsDe('labSalidasSecuencial'), nSim, 'sorteaSecuencial')) }
  return {
    prueba: 'salidas', desde, hasta, ...base,
    eventos: porValor.reduce((a, v) => a + v.eventos, 0), ignoradas: porValor.reduce((a, v) => a + v.ignoradas, 0),
    sinEntrada: porValor.reduce((a, v) => a + v.sinEntrada, 0), candidatos: porValor.reduce((a, v) => a + v.candidatos, 0),
    finDatos: todas.filter(o => o.finDatos).length,
    porMotivo: { condicion: todas.filter(o => o.motivo === 'condicion').length, tiempo: todas.filter(o => o.motivo === 'tiempo').length, fin: todas.filter(o => o.motivo === 'fin').length },
    porAnio: Object.entries(porAnio).sort().map(([anio, os]) => { const r = resumen(os); return { anio, operaciones: r.operaciones, media: r.media, mediana: r.mediana } }),
    porActivo, azar, otrosAzares,
  }
}
// Días de datos que hacen falta después del periodo para que el tope de N velas quepa (≈ 7/5 días naturales por vela).
export const diasTrasPeriodo = (tope) => Math.ceil(tope * 7 / 5) + 30
