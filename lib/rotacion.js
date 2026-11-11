// lib/rotacion.js — el MOTOR DE ROTACIÓN (paso 1 del orden del 11/11: «rotación → Comparar planes → …»; docs/builder.md §125)
// y su PRUEBA CONTRA EL AZAR (§126). Puro: sin red, sin fechas del sistema. Nadie lo usa todavía en pantalla: ninguna cifra de
// la app cambia.
//
// QUÉ HACE. Cada cierto tiempo (al cierre de la ÚLTIMA vela de cada mes o de cada semana), entre los valores de una lista o de
// un índice que ese día:
//   · son miembros (miembro(simbolo, fecha); con una lista fija, todos siempre),
//   · cumplen el FILTRO (una serie de condiciones del catálogo, true | false | null por vela; «sin dato» = no pasa),
//   · y tienen PUNTUACIÓN (el criterio: momentum de L velas, con o sin saltar las últimas S; u otra función),
// se ordena por la puntuación (mayor primero; empate, por símbolo en orden alfabético) y se queda con los K primeros.
// OPCIÓN A (decisión de Sergi, 11/11): los que siguen entre los K NO se tocan; se venden los que salen, y lo vendido (y la
// liquidez que hubiera) se reparte A PARTES IGUALES entre los que entran. Si pasan menos de K, lo que sobra espera en liquidez.
//
// CUÁNDO SE COMPRA Y SE VENDE (decidido por mí, como las copias del paso 2): la decisión se toma con el CIERRE de la vela de
// decisión y las órdenes se ejecutan a la APERTURA de la vela siguiente. La primera decisión es al cierre de la vela anterior
// al inicio del periodo, así que el dinero entra en la apertura del primer día (como un Buy&Hold). Sin apertura ese día (el
// valor dejó de cotizar), se vende a su último cierre conocido.
// CIERRE AL FINAL (norma de la app): el último día del periodo se vende todo a su cierre, pagando comisión y deslizamiento.
//
// OPCIONES:
//   · Filtro de MERCADO (mercado[i] de las fechas, p. ej. QQQ por encima de su SMA 200): se mira en cada decisión; si no es
//     true, se vende todo y se espera en liquidez hasta la siguiente decisión en que lo sea.
//   · VENTA ANTICIPADA (salida[simbolo]: true en una vela = vender): se mira cada cierre; vende a la apertura siguiente y el
//     dinero espera en liquidez hasta la siguiente decisión. El valor puede volver a entrar en una decisión posterior.
// COSTES: cada orden paga la comisión del plan (el % con mínimo por orden: máx(pct × importe, mínimo), como costeOrden de
// lib/planes/plan.js) y el DESLIZAMIENTO: se compra a precio × (1 + d) y se vende a precio × (1 − d).
//
// ENTRADA:
//   fechas: el calendario (crecientes, 'YYYY-MM-DD'; p. ej. las del QQQ), con el calentamiento delante.
//   velas: { SIM: [{ date, open, close }] } (crecientes; pueden faltar días o empezar/acabar a mitad).
//   desde / hasta: el periodo ('YYYY-MM-DD', incluidos). Debe haber alguna vela del calendario antes de `desde`.
//   capital (€), K, rebalanceo: 'mensual' | 'semanal'.
//   criterio: { tipo: 'momentum', L, saltar = 0 } o una función puntua(simbolo, i, cierres) → número | null.
//   miembro(simbolo, fecha) → bool (por defecto, todos); filtro: { SIM: [true|false|null] alineado a velas[SIM] } (opcional);
//   mercado: [true|false|null] alineado a fechas (opcional); salida: { SIM: [bool] alineado a velas[SIM] } (opcional);
//   costes: { comisionPct (en %), comisionMinEur, deslizPct (en %) } (opcional: sin costes).
// SALIDA: { final, cagr, caida, curva: [{ date, valor }], operaciones, decisiones, ordenes, comisiones, deslizamiento,
//   tiempoDentro (fracción media del dinero en valores), decisionesCortas (cuántas decisiones tuvieron menos de K candidatos) }.
//
// POR DENTRO, dos partes: prepara (alinear los datos y sacar los candidatos de cada decisión, que no dependen de lo que se
// tenga) y simula (el dinero vela a vela, con una función `elige` que decide el objetivo). rotar = las dos con «los K
// primeros». El azar (azarRotacion) prepara una vez y simula 1.000 veces con otra `elige`.
import { anios, caidaMaxima } from './planes/medidas'
import { lunesDeSemana } from './velasSemanales'
import { generador, percentilDe } from './azar'

const esNum = (x) => typeof x === 'number' && Number.isFinite(x) && x > 0

// Momentum de L velas saltando las últimas S, con los cierres alineados al calendario: c[i−S] / c[i−S−L] − 1 (null si falta).
export function momentum(cierres, i, L, saltar = 0) {
  const a = i - saltar, b = a - L
  if (b < 0 || !esNum(cierres[a]) || !esNum(cierres[b])) return null
  return cierres[a] / cierres[b] - 1
}

// Índices de las velas de DECISIÓN del calendario: la última de cada mes (o de cada semana, por su lunes).
export function velasDeDecision(fechas, rebalanceo = 'mensual') {
  const clave = rebalanceo === 'semanal' ? (f) => lunesDeSemana(f) : (f) => f.slice(0, 7)
  const r = []
  for (let i = 0; i < fechas.length; i++) if (i === fechas.length - 1 || clave(fechas[i]) !== clave(fechas[i + 1])) r.push(i)
  return r
}

// Una serie alineada a las velas de un símbolo, pasada al calendario (null donde el símbolo no tiene vela).
function alinea(velasSim, serie, idxCal) {
  const out = new Array(idxCal.size).fill(null)
  if (!velasSim || !serie) return out
  for (let k = 0; k < velasSim.length; k++) { const i = idxCal.get(velasSim[k].date); if (i != null) out[i] = serie[k] }
  return out
}

// Los datos alineados y los CANDIDATOS de cada decisión (ordenados por puntuación), una sola vez.
export function prepara(o) {
  const { fechas, velas, desde, hasta, capital, K, rebalanceo = 'mensual', criterio, miembro = () => true, filtro = null, mercado = null, salida = null } = o
  if (!Array.isArray(fechas) || !fechas.length) throw new Error('Faltan las fechas del calendario.')
  if (!(capital > 0)) throw new Error('El capital tiene que ser mayor que 0.')
  if (!(Number.isInteger(K) && K >= 1)) throw new Error('K tiene que ser un entero de 1 o más.')
  const i0 = fechas.findIndex(f => f >= desde)
  let i1 = -1; for (let i = fechas.length - 1; i >= 0; i--) if (fechas[i] <= hasta) { i1 = i; break }
  if (i0 < 1 || i1 < i0) throw new Error('El periodo necesita al menos una vela del calendario antes de «desde» y alguna dentro.')

  const idxCal = new Map(fechas.map((f, i) => [f, i]))
  const simbolos = Object.keys(velas).sort()
  const ap = {}, ci = {}, cf = {}, sal = {}
  for (const s of simbolos) {
    ap[s] = alinea(velas[s], velas[s].map(v => v.open), idxCal)
    ci[s] = alinea(velas[s], velas[s].map(v => v.close), idxCal)
    // El último cierre conocido en cada vela (para valorar y para vender si deja de cotizar).
    let u = null; cf[s] = ci[s].map(c => (esNum(c) ? (u = c) : u))
    if (salida) sal[s] = alinea(velas[s], salida[s], idxCal)
  }
  const fil = {}
  if (filtro) for (const s of simbolos) fil[s] = alinea(velas[s], filtro[s], idxCal)
  const puntua = typeof criterio === 'function' ? criterio
    : criterio?.tipo === 'momentum' ? (s, i, c) => momentum(c, i, criterio.L, criterio.saltar || 0)
    : (() => { throw new Error('Criterio desconocido.') })()

  // Decisiones: la vela anterior al inicio y las de fin de mes/semana dentro del periodo (la última del periodo no: allí se cierra).
  const indices = [i0 - 1, ...velasDeDecision(fechas, rebalanceo).filter(i => i >= i0 && i < i1)]
  const candidatos = new Map()          // índice → null (mercado fuera) o [{ s, p }] ordenados
  for (const i of indices) {
    if (mercado && mercado[i] !== true) { candidatos.set(i, null); continue }
    const cand = []
    for (const s of simbolos) {
      if (!esNum(ci[s][i]) || !miembro(s, fechas[i])) continue
      if (filtro && fil[s][i] !== true) continue
      const p = puntua(s, i, ci[s])
      if (p == null || !Number.isFinite(p)) continue
      cand.push({ s, p })
    }
    cand.sort((a, b) => b.p - a.p || (a.s < b.s ? -1 : a.s > b.s ? 1 : 0))
    candidatos.set(i, cand)
  }
  return { fechas, i0, i1, simbolos, ap, ci, cf, sal: salida ? sal : null, candidatos, capital, K, costes: o.costes || null }
}

// «Los K primeros»: la elección de la estrategia.
export const losPrimeros = ({ candidatos, K }) => candidatos.slice(0, K).map(c => c.s)

// El dinero vela a vela. elige({ j: nº de decisión, i, candidatos, enCartera: Set, K }) → [símbolos objetivo].
export function simula(P, elige = losPrimeros) {
  const { fechas, i0, i1, ap, ci, cf, sal, candidatos, capital, K, costes } = P
  const pct = (costes?.comisionPct || 0) / 100, minimo = costes?.comisionMinEur || 0, d = (costes?.deslizPct || 0) / 100
  let liquidez = capital, ordenes = 0, comisiones = 0, deslizamiento = 0
  const cartera = new Map()            // símbolo → { u: acciones, entrada, pxE, coste }
  const operaciones = []
  const comision = (X) => (pct > 0 || minimo > 0) ? Math.max(pct * X, minimo) : 0

  const vende = (s, i, alCierre, motivo) => {
    const p = cartera.get(s)
    const px = alCierre ? ci[s][i] : ap[s][i]
    const base = esNum(px) ? px : cf[s][i]
    const pxV = base * (1 - d), X = p.u * pxV, c = comision(X)
    deslizamiento += p.u * base * d; comisiones += c; ordenes++
    liquidez += X - c
    operaciones.push({ simbolo: s, entrada: p.entrada, salida: fechas[i], pxE: p.pxE, pxS: pxV, invertido: p.coste, recibido: X - c, motivo })
    cartera.delete(s)
  }
  const compra = (s, i, X) => {
    const px = ap[s][i]
    if (!esNum(px)) return false
    const c = comision(X)
    if (!(X > c)) return false
    const pxC = px * (1 + d), u = (X - c) / pxC
    deslizamiento += u * px * d; comisiones += c; ordenes++
    liquidez -= X
    cartera.set(s, { u, entrada: fechas[i], pxE: pxC, coste: X })
    return true
  }

  const curva = [], decisiones = []
  let decisionesCortas = 0, sumaDentro = 0, j = 0
  const decide = (i) => {
    const cand = candidatos.get(i)
    if (cand == null) { decisiones.push({ fecha: fechas[i], fuera: true, elegidos: [], rotados: 0 }); j++; return { todoFuera: true } }
    if (cand.length < K) decisionesCortas++
    const enCartera = new Set(cartera.keys())
    const objetivo = elige({ j, i, candidatos: cand, enCartera, K })
    const quedan = new Set(objetivo), esCand = new Set(cand.map(c => c.s))
    // rotados: los que se tenían, seguían siendo candidatos y salen (los cambios «voluntarios»; el azar copia cuántos).
    let rotados = 0; for (const s of enCartera) if (esCand.has(s) && !quedan.has(s)) rotados++
    decisiones.push({ fecha: fechas[i], candidatos: cand.length, elegidos: objetivo, rotados })
    j++
    return { objetivo }
  }

  let pendiente = decide(i0 - 1)
  const ventasPendientes = new Set()    // ventas anticipadas para la apertura de hoy
  for (let i = i0; i <= i1; i++) {
    // 1 · A la apertura: las órdenes de la decisión de ayer y las ventas anticipadas.
    if (pendiente) {
      const objetivo = new Set(pendiente.todoFuera ? [] : pendiente.objetivo)
      for (const s of [...cartera.keys()]) if (!objetivo.has(s)) vende(s, i, false, pendiente.todoFuera ? 'mercado' : 'sale')
      const entran = [...objetivo].filter(s => !cartera.has(s) && esNum(ap[s][i]))
      if (entran.length && liquidez > 0) { const X = liquidez / entran.length; for (const s of entran) compra(s, i, X) }
      pendiente = null
    }
    for (const s of ventasPendientes) if (cartera.has(s)) vende(s, i, false, 'salida')
    ventasPendientes.clear()
    // 2 · Al cierre: valorar; el último día, vender todo; si no, mirar salidas y, si toca, decidir.
    if (i === i1) { for (const s of [...cartera.keys()]) vende(s, i, true, 'final'); curva.push({ date: fechas[i], valor: liquidez }); break }
    let enValores = 0
    for (const [s, p] of cartera) enValores += p.u * cf[s][i]
    const valor = liquidez + enValores
    curva.push({ date: fechas[i], valor })
    sumaDentro += valor > 0 ? enValores / valor : 0
    if (sal) for (const s of cartera.keys()) if (sal[s][i] === true) ventasPendientes.add(s)
    if (candidatos.has(i)) pendiente = decide(i)
  }

  const final = liquidez, t = anios(fechas[i0], fechas[i1])
  const valores = [capital, ...curva.map(c => c.valor)], fechasCurva = [fechas[i0], ...curva.map(c => c.date)]
  return {
    final, cagr: t > 0 ? Math.pow(final / capital, 1 / t) - 1 : null,
    caida: caidaMaxima(fechasCurva, valores).caida,
    curva, operaciones, decisiones, ordenes, comisiones, deslizamiento,
    tiempoDentro: curva.length > 1 ? sumaDentro / (curva.length - 1) : 0, decisionesCortas,
  }
}

export const rotar = (o) => simula(prepara(o))

// ── PRUEBA CONTRA EL AZAR (§126) ──
// Cada COPIA decide en las MISMAS fechas, entre los MISMOS candidatos (miembros que pasan el filtro y tienen puntuación) y con
// el mismo filtro de mercado, costes, venta anticipada y cierre al final; solo cambia QUÉ valores elige: al azar, y CAMBIANDO
// LOS MISMOS que la estrategia. En cada decisión la copia: 1) suelta los suyos que ya no son candidatos (como la estrategia);
// 2) suelta al azar tantos como la estrategia soltó «voluntariamente» ese día (rotados; si tiene menos, todos los que pueda);
// 3) rellena al azar hasta K (o hasta los candidatos que haya). Así la copia rota igual de a menudo y paga costes parecidos:
// lo único que se prueba es si el CRITERIO elige mejor que el azar. Es la misma idea que las copias del paso 2 («misma
// frecuencia de compra»). Semilla fija: mismas copias cada vez.
export function eligeAlAzar(rotadosDe, rnd) {
  const saca = (arr) => arr.splice(Math.floor(rnd() * arr.length), 1)[0]
  return ({ j, candidatos, enCartera, K }) => {
    const esCand = new Set(candidatos.map(c => c.s))
    const quedan = [...enCartera].filter(s => esCand.has(s)).sort()
    for (let n = Math.min(rotadosDe[j] || 0, quedan.length); n > 0; n--) saca(quedan)
    const libres = candidatos.map(c => c.s).filter(s => !enCartera.has(s)).sort()
    const objetivo = [...quedan]
    while (objetivo.length < Math.min(K, candidatos.length) && libres.length) objetivo.push(saca(libres))
    return objetivo
  }
}

// { real, sims: { cagr: [], caida: [], final: [] }, percentilCagr, percentilCaida, mediana: { cagr, caida } }.
export function azarRotacion(o, { nSim = 1000, semilla = 1 } = {}) {
  const P = prepara(o)
  const real = simula(P)
  const rotadosDe = real.decisiones.map(d => d.rotados)
  const rnd = generador(semilla)
  const cagr = [], caida = [], final = []
  for (let k = 0; k < nSim; k++) {
    const r = simula(P, eligeAlAzar(rotadosDe, rnd))
    cagr.push(r.cagr); caida.push(r.caida); final.push(r.final)
  }
  const med = (xs) => { const a = [...xs].sort((x, y) => x - y), n = a.length; return n ? (n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2) : null }
  return { real, sims: { cagr, caida, final }, percentilCagr: percentilDe(cagr, real.cagr), // La caída aquí es negativa (−0,30 = −30 %): % de copias que caen MÁS que la real = las de caída menor (más negativa).
    percentilCaida: percentilDe(caida, real.caida),
    mediana: { cagr: med(cagr), caida: med(caida) } }
}
