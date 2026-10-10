// lib/robustez.js — Fase 2 (robustez): DENTRO / FUERA DE MUESTRA, como POSPROCESADO de lo que ya devuelve
// /api/optimiza (metricas.porAnio de cada combinación y activo). Ningún backtest nuevo. Funciones puras, sin React.
//
// Un AÑO DE CORTE parte los años del periodo en dos bloques: dentro (antes del corte) y fuera (desde el corte).
// La combinación se elige SOLO con el bloque de dentro; el de fuera dice si esa elección se sostiene.
//
// Por combinación y activo, en cada bloque (bloqueDeActivo):
//   beneficio    suma de beneficioSimple de sus años (lo ganado DENTRO de cada año, posiciones valoradas a fin de año);
//   cagr         CAGR simple con la fórmula de la app (cagrSimple, lib/metricasRanking.js) sobre la duración REAL del
//                bloque: del 1/1 de su primer año (o su primera vela si ese año es parcial) al 1/1 siguiente a su último
//                año (o al día siguiente a su última vela si es parcial);
//   operaciones  las cerradas en sus años + 1 si en la última vela del bloque queda una posición abierta (regla de la
//                app: la posición abierta al final de un periodo cuenta como cerrada). Esa operación, cuando se cierra
//                de verdad en el bloque siguiente, cuenta también allí: es lo acordado;
//   ganadoras    las ganadoras de sus años + 1 si esa posición abierta es ganadora con el criterio del % de acierto
//                (esGanadora). Su flotante (resultadoAbiertaFin) y su pnlPct son brutos los dos (precio de cierre
//                frente al de entrada, sin comisiones), así que tienen el mismo signo: se le pasa como pnlPct.
// El CAGR compuesto por bloque NO está disponible: el año a año es en simple.
import { esGanadora, cagrSimple } from './metricasRanking'
import { mediana, media, claveCombinacion, motivoValidez, MIN_TOTAL, MIN_POR_ACTIVO } from './optimizacion'

export const MIN_ANIOS_ROBUSTEZ = 4
export const PROPORCION_DENTRO = 0.7

// Los años del periodo con datos (los sinDatos no cuentan), de las filas agregadas de la tabla.
export function aniosConDatos(filas) {
  const s = new Map()
  for (const f of filas || []) for (const a of f.porAnio || []) if (!s.has(a.anio) || !a.sinDatos) s.set(a.anio, a)
  return [...s.values()].filter(a => !a.sinDatos).sort((a, b) => a.anio - b.anio)
}
// El corte por defecto: el 70 % de los años dentro (redondeado). Con 2016–2025: dentro 2016–2022, fuera 2023–2025.
export function corteSugerido(anios) {
  const n = anios.length
  if (n < 2) return null
  return anios[Math.min(n - 1, Math.max(1, Math.round(n * PROPORCION_DENTRO)))].anio
}
export const cortesPosibles = (anios) => anios.slice(1).map(a => a.anio)

const masUnDia = (iso) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10) }
const dias = (a, b) => (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000

// El bloque [desdeAnio, hastaAnio] de UN activo (sus metricas de /api/optimiza).
export function bloqueDeActivo(m, desdeAnio, hastaAnio, capitalIni) {
  const anios = (m?.porAnio || []).filter(a => a.anio >= desdeAnio && a.anio <= hastaAnio && !a.sinDatos)
  if (!anios.length) return null
  const primero = anios[0], ultimo = anios[anios.length - 1]
  const inicio = primero.primeraVela || `${primero.anio}-01-01`
  const fin = ultimo.ultimaVela ? masUnDia(ultimo.ultimaVela) : `${ultimo.anio + 1}-01-01`
  const beneficio = anios.reduce((s, a) => s + a.beneficioSimple, 0)
  const abierta = !!ultimo.abiertaFin
  const operaciones = anios.reduce((s, a) => s + a.operaciones, 0) + (abierta ? 1 : 0)
  const ganadoras = anios.reduce((s, a) => s + (a.ganadoras || 0), 0) + (abierta && esGanadora({ pnlPct: ultimo.resultadoAbiertaFin }) ? 1 : 0)
  return { beneficio, cagr: cagrSimple(capitalIni, beneficio, dias(inicio, fin)), operaciones, ganadoras, inicio, fin,
    abiertaAlFinal: abierta, parcialInicio: !!primero.parcial && !!primero.primeraVela, parcialFin: !!ultimo.parcial && !!ultimo.ultimaVela }
}

// El CAGR de -99 es el centinela de «capital final ≤ 0»: para agregar cuenta como -100 % (como en la tabla).
const agregable = (c) => c == null ? null : (c <= -99 ? -100 : c)

// Un bloque de una combinación (fila de la tabla: fila.porActivo = { símbolo: metricas }), agregado sobre activos.
export function bloqueDeCombinacion(fila, desdeAnio, hastaAnio, capitalIni, { minTotal = MIN_TOTAL, minPorActivo = MIN_POR_ACTIVO } = {}) {
  const porActivo = []
  for (const [sym, m] of Object.entries(fila.porActivo || {})) { const b = bloqueDeActivo(m, desdeAnio, hastaAnio, capitalIni); if (b) porActivo.push({ sym, ...b }) }
  const motivo = motivoValidez(porActivo.map(x => ({ sym: x.sym, operaciones: x.operaciones })), { minTotal, minPorActivo })
  const cagrs = porActivo.map(x => agregable(x.cagr))
  return { cuenta: motivo == null, motivo, activos: porActivo.length,
    cagrMediana: mediana(cagrs), cagrMedia: media(cagrs),
    operaciones: porActivo.reduce((s, x) => s + x.operaciones, 0), ganadoras: porActivo.reduce((s, x) => s + x.ganadoras, 0),
    winRateMediana: mediana(porActivo.filter(x => x.operaciones > 0).map(x => x.ganadoras / x.operaciones * 100)),
    porActivo }
}

// Todas las combinaciones, partidas por el corte.
export function partePorCorte(filas, anios, corte, capitalIni, opciones) {
  const a0 = anios[0].anio, a1 = anios[anios.length - 1].anio
  return filas.map(fila => ({ fila, params: fila.params, indice: fila.indice,
    dentro: bloqueDeCombinacion(fila, a0, corte - 1, capitalIni, opciones),
    fuera: bloqueDeCombinacion(fila, corte, a1, capitalIni, opciones) }))
}

// ── Elección, SOLO con datos de dentro ──
// «maximo»: la mejor mediana del CAGR simple de dentro.
// «meseta»: la mejor media de su vecindario COMPLETO. Solo es candidata una celda cuyas vecinas a ±1 paso en los ejes
// (8 en el mapa de dos parámetros; 2 con uno; el resto de parámetros, los suyos) existen TODAS y son válidas dentro;
// una celda imposible por construcción (p. ej. emaR ≥ emaL en la 1 V50: no está en la rejilla) cuenta como vecina
// inexistente. Puntuación = media de la celda y sus vecinas (9 o 3 valores). Así un borde no gana por promediar con
// menos celdas. Si ninguna celda es candidata, no se elige ninguna (rejillaPequena).
// Empates: la de mejor mediana propia y, después, la primera.
const pasosVecindario = (n) => n >= 2 ? [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]] : [[-1], [1]]
// La combinación desplazada d pasos en los ejes (null si sale de la rejilla).
const desplazada = (params, d, valores, ejes) => {
  const p = { ...params }
  for (let j = 0; j < d.length; j++) { const k = ejes[j], l = valores[k], i = l.indexOf(params[k]) + d[j]; if (i < 0 || i >= l.length) return null; p[k] = l[i] }
  return p
}
export function eligeCombinacion(items, criterio, valores, ejes) {
  const validas = items.filter(it => it.dentro.cuenta && it.dentro.cagrMediana != null)
  if (!validas.length) return null
  const e = ejes.slice(0, 2)
  const porClave = new Map(items.map(it => [claveCombinacion(it.params), it]))
  const puntuacion = (it) => {
    if (criterio !== 'meseta' || !e.length) return it.dentro.cagrMediana
    const vals = [it.dentro.cagrMediana]
    for (const d of pasosVecindario(e.length)) {
      const p = desplazada(it.params, d, valores, e)
      const v = p && porClave.get(claveCombinacion(p))
      if (!v || !v.dentro.cuenta || v.dentro.cagrMediana == null) return null   // vecindario incompleto: no es candidata
      vals.push(v.dentro.cagrMediana)
    }
    return media(vals)
  }
  let mejor = null
  for (const it of validas) {
    const s = puntuacion(it)
    if (s == null) continue
    if (!mejor || s > mejor.s || (s === mejor.s && it.dentro.cagrMediana > mejor.it.dentro.cagrMediana)) mejor = { it, s }
  }
  return mejor ? { ...mejor.it, puntuacion: mejor.s } : null
}

// ¿Toca la zona elegida el borde? Su vecindario llega a ±1; si a ±2 en algún eje (y en las esquinas de ese anillo, con
// dos parámetros) la rejilla se acaba o la combinación es imposible, la meseta podría seguir más allá: no se ve.
// Devuelve [{ parametro, lado: 'bajo' | 'alto', valor }] por el borde de la rejilla y diagonal: true si toca la zona
// imposible (combinaciones que no cumplen las restricciones).
export function bordesDeLaZona(elegida, items, valores, ejes) {
  const e = ejes.slice(0, 2)
  if (!elegida || !e.length) return { bordes: [], diagonal: false }
  const porClave = new Map(items.map(it => [claveCombinacion(it.params), it]))
  const bordes = []
  e.forEach((k, j) => {
    const l = valores[k], i = l.indexOf(elegida.params[k])
    if (i - 2 < 0) bordes.push({ parametro: k, lado: 'bajo', valor: l[0] })
    if (i + 2 >= l.length) bordes.push({ parametro: k, lado: 'alto', valor: l[l.length - 1] })
  })
  let diagonal = false
  const r = [-2, -1, 0, 1, 2]
  const anillo = e.length >= 2 ? r.flatMap(a => r.map(b => [a, b])).filter(([a, b]) => Math.max(Math.abs(a), Math.abs(b)) === 2) : [[-2], [2]]
  for (const d of anillo) { const p = desplazada(elegida.params, d, valores, e); if (p && !porClave.has(claveCombinacion(p))) diagonal = true }
  return { bordes, diagonal }
}

// Percentil q (0–1) con interpolación lineal entre los valores ordenados (el método habitual: posición (n−1)·q).
export function percentil(v, q) {
  const o = v.filter(x => typeof x === 'number' && Number.isFinite(x)).sort((a, b) => a - b)
  if (!o.length) return null
  const pos = (o.length - 1) * q, i = Math.floor(pos), f = pos - i
  return i + 1 < o.length ? o[i] + (o[i + 1] - o[i]) * f : o[i]
}

// ── Métricas ──
// Correlación de Spearman: la de Pearson entre los rangos (empates, rango medio). Con menos de 3 pares, null.
const rangos = (v) => {
  const o = v.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]), r = new Array(v.length)
  for (let i = 0; i < o.length;) { let j = i; while (j + 1 < o.length && o[j + 1][0] === o[i][0]) j++; for (let k = i; k <= j; k++) r[o[k][1]] = (i + j) / 2 + 1; i = j + 1 }
  return r
}
export function spearman(xs, ys) {
  if (xs.length < 3 || xs.length !== ys.length) return null
  const rx = rangos(xs), ry = rangos(ys), mx = media(rx), my = media(ry)
  let c = 0, vx = 0, vy = 0
  for (let i = 0; i < rx.length; i++) { c += (rx[i] - mx) * (ry[i] - my); vx += (rx[i] - mx) ** 2; vy += (ry[i] - my) ** 2 }
  return vx && vy ? c / Math.sqrt(vx * vy) : null
}

// Sobre las combinaciones válidas en los DOS bloques: Spearman entre la mediana de dentro y la de fuera, y la mediana
// de fuera del 10 % mejor de dentro frente a la mediana de fuera de todas.
export function metricasRobustez(items) {
  const ambos = items.filter(it => it.dentro.cuenta && it.fuera.cuenta && it.dentro.cagrMediana != null && it.fuera.cagrMediana != null)
  const rho = spearman(ambos.map(it => it.dentro.cagrMediana), ambos.map(it => it.fuera.cagrMediana))
  const orden = [...ambos].sort((a, b) => b.dentro.cagrMediana - a.dentro.cagrMediana || a.indice - b.indice)
  const k = Math.max(1, Math.ceil(ambos.length * 0.1))
  const fueraAmbos = ambos.map(it => it.fuera.cagrMediana)
  return { n: ambos.length, rho, nTop: Math.min(k, ambos.length), p10Fuera: percentil(fueraAmbos, 0.1), p90Fuera: percentil(fueraAmbos, 0.9),
    medianaFueraTop: mediana(orden.slice(0, k).map(it => it.fuera.cagrMediana)), medianaFueraTodas: mediana(ambos.map(it => it.fuera.cagrMediana)),
    excluidasDentro: items.filter(it => !it.dentro.cuenta).length, excluidasFuera: items.filter(it => !it.fuera.cuenta).length }
}

// La ficha de la elegida: CAGR dentro y fuera, degradación (fuera / dentro, en %; sin sentido si dentro ≤ 0), puesto
// dentro y fuera (entre las válidas de cada bloque, por la mediana), operaciones y % de acierto de cada bloque.
export function fichaElegida(elegida, items) {
  if (!elegida) return null
  const puesto = (b) => {
    const v = items.filter(it => it[b].cuenta && it[b].cagrMediana != null).sort((x, y) => y[b].cagrMediana - x[b].cagrMediana || x.indice - y.indice)
    const i = v.findIndex(it => it.indice === elegida.indice)
    return { puesto: i < 0 ? null : i + 1, de: v.length }
  }
  const d = elegida.dentro, f = elegida.fuera
  return { params: elegida.params, indice: elegida.indice, dentro: d, fuera: f,
    degradacion: d.cagrMediana != null && d.cagrMediana > 0 && f.cagrMediana != null ? f.cagrMediana / d.cagrMediana * 100 : null,
    puestoDentro: puesto('dentro'), puestoFuera: puesto('fuera') }
}

// Todo junto, para la pantalla: los años, el corte efectivo (el guardado si sigue siendo posible; si no, el sugerido),
// las combinaciones partidas, la elegida, su ficha y las métricas.
export function robustez(filas, { corte = null, criterio = 'meseta', capitalIni, valores, ejes = [] } = {}) {
  const anios = aniosConDatos(filas)
  if (anios.length < MIN_ANIOS_ROBUSTEZ) return { anios, insuficiente: true }
  const posibles = cortesPosibles(anios)
  const c = posibles.includes(corte) ? corte : corteSugerido(anios)
  const items = partePorCorte(filas, anios, c, capitalIni)
  const elegida = eligeCombinacion(items, criterio, valores, ejes)
  // Meseta sin ninguna celda con el vecindario completo (habiendo válidas): la rejilla es demasiado pequeña.
  const rejillaPequena = !elegida && criterio === 'meseta' && items.some(it => it.dentro.cuenta && it.dentro.cagrMediana != null)
  return { anios, posibles, corte: c, sugerido: corteSugerido(anios), criterio, items, elegida, rejillaPequena,
    zona: criterio === 'meseta' ? bordesDeLaZona(elegida, items, valores, ejes) : { bordes: [], diagonal: false },
    ficha: fichaElegida(elegida, items), metricas: metricasRobustez(items) }
}
