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

// El inicio y el fin (exclusivo) reales de un tramo de años: del 1/1 del primero (o su primera vela si es parcial) al 1/1
// siguiente al último (o al día siguiente a su última vela si es parcial).
export const limitesDeTramo = (primero, ultimo) => ({ inicio: primero.primeraVela || `${primero.anio}-01-01`,
  fin: ultimo.ultimaVela ? masUnDia(ultimo.ultimaVela) : `${ultimo.anio + 1}-01-01` })
export const diasDeTramo = (primero, ultimo) => { const { inicio, fin } = limitesDeTramo(primero, ultimo); return dias(inicio, fin) }

// El bloque [desdeAnio, hastaAnio] de UN activo (sus metricas de /api/optimiza).
export function bloqueDeActivo(m, desdeAnio, hastaAnio, capitalIni) {
  const anios = (m?.porAnio || []).filter(a => a.anio >= desdeAnio && a.anio <= hastaAnio && !a.sinDatos)
  if (!anios.length) return null
  const primero = anios[0], ultimo = anios[anios.length - 1]
  const { inicio, fin } = limitesDeTramo(primero, ultimo)
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
    rentabilidadMediana: mediana(porActivo.map(x => x.beneficio / capitalIni * 100)),
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
  let mejor = null, candidatas = 0
  for (const it of validas) {
    const s = puntuacion(it)
    if (s == null) continue
    candidatas++
    if (!mejor || s > mejor.s || (s === mejor.s && it.dentro.cagrMediana > mejor.it.dentro.cagrMediana)) mejor = { it, s }
  }
  // candidatas: con «meseta», cuántas celdas tenían el vecindario completo (con «maximo», todas las válidas).
  return mejor ? { ...mejor.it, puntuacion: mejor.s, candidatas } : null
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

// El rango P10–P90 de fuera frente al nivel: (P90 − P10) / |mediana de fuera|. Con la mediana casi 0 (menos de
// CASI_CERO puntos de CAGR) la división no dice nada: null.
export const CASI_CERO = 0.01
export function rangoRelativo(p10, p90, med) {
  if (p10 == null || p90 == null || med == null || Math.abs(med) < CASI_CERO) return null
  return (p90 - p10) / Math.abs(med)
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
    rangoRelativo: rangoRelativo(percentil(fueraAmbos, 0.1), percentil(fueraAmbos, 0.9), mediana(fueraAmbos)),
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

// ── Fase 2, pieza 2: WALK-FORWARD ────────────────────────────────────────────────────────────────────────────────
// Imita usar el optimizador en la vida real: cada año de prueba Y se elige la combinación SOLO con los años anteriores
// (entrenamiento: los N anteriores, «rodante», o todos desde el primero, «anclado») y se mira qué dio en Y. También
// posprocesado del año a año: ningún backtest nuevo.
// Resultado de un año = mediana entre activos de lo ganado ese año en % del capital (un año parcial, por sus fechas, sin
// anualizar). En el año de prueba cuenta toda combinación CON RESULTADO (sin mínimo de operaciones: es evaluar, no
// elegir; elegir al azar podría caer en cualquiera); la regla de validez se aplica al ENTRENAMIENTO, al elegir.
// Al cambiar de combinación el 1 de enero se supone que la nueva ya venía operando (sus posiciones abiertas siguen):
// es una aproximación; en la realidad cerrarías y reabrirías.
export const WF_VENTANAS = [3, 4, 5, 6, 7, 8], WF_VENTANA_DEFECTO = 5

// Caché de bloques por tramo de años: `cache` (un Map que la pantalla crea de nuevo cuando cambian los resultados) guarda,
// por «desde-hasta», el bloque de cada combinación (en el orden de `filas`). Cambiar el criterio no recalcula ningún bloque
// y volver a un N o modo ya visto tampoco; el resultado es el mismo (los mismos objetos).
const bloquesDeTramo = (filas, desde, hasta, capitalIni, cache) => {
  const k = `${desde}-${hasta}`
  if (cache?.has(k)) return cache.get(k)
  const v = filas.map(fila => bloqueDeCombinacion(fila, desde, hasta, capitalIni))
  if (cache) cache.set(k, v)
  return v
}

// Lo que dio cada combinación en cada año (no depende de N, del modo ni del criterio: se calcula una vez).
export function resultadosAnuales(filas, anios, capitalIni, cache = null) {
  const r = new Map()
  for (const a of anios) { const bs = bloquesDeTramo(filas, a.anio, a.anio, capitalIni, cache); r.set(a.anio, filas.map((fila, j) => {
    const b = bs[j]
    return { indice: fila.indice, params: fila.params, conResultado: b.activos > 0 && b.rentabilidadMediana != null,
      resultado: b.rentabilidadMediana, operaciones: b.operaciones, winRateMediana: b.winRateMediana }
  })) }
  return r
}

export function walkForward(filas, { anios, anuales, ventana = WF_VENTANA_DEFECTO, modo = 'rodante', criterio = 'meseta', capitalIni, valores, ejes = [], referencia = null, cache = null } = {}) {
  if (anios.length < ventana + 1) return { insuficiente: true, necesarios: ventana + 1, hay: anios.length }
  const claveRef = referencia ? claveCombinacion(referencia) : null
  const filasAnio = []
  for (let i = ventana; i < anios.length; i++) {
    const Y = anios[i], ent = modo === 'anclado' ? anios.slice(0, i) : anios.slice(i - ventana, i)
    const bs = bloquesDeTramo(filas, ent[0].anio, ent[ent.length - 1].anio, capitalIni, cache)
    const items = filas.map((fila, j) => ({ fila, params: fila.params, indice: fila.indice, dentro: bs[j] }))
    const elegida = eligeCombinacion(items, criterio, valores, ejes)
    const hayValidas = items.some(it => it.dentro.cuenta && it.dentro.cagrMediana != null)
    const res = anuales.get(Y.anio) || []
    const conRes = res.filter(r => r.conResultado)
    const orden = [...conRes].sort((a, b) => b.resultado - a.resultado || a.indice - b.indice)
    const puesto = (indice) => { const k = orden.findIndex(r => r.indice === indice); return { puesto: k < 0 ? null : k + 1, de: orden.length } }
    const rEl = elegida ? res.find(r => r.indice === elegida.indice) : null
    const rRef = claveRef ? res.find(r => claveCombinacion(r.params) === claveRef) : null
    filasAnio.push({ anio: Y, entrenamiento: ent, elegida, criterio,
      sinEleccion: elegida ? null : (!hayValidas ? 'ninguna combinación es válida en el entrenamiento' : 'la rejilla es demasiado pequeña para medir meseta'),
      zona: elegida && criterio === 'meseta' ? bordesDeLaZona(elegida, items, valores, ejes) : { bordes: [], diagonal: false },
      wf: rEl?.conResultado ? rEl.resultado : null, referencia: rRef?.conResultado ? rRef.resultado : null,
      mediana: mediana(conRes.map(r => r.resultado)), oraculo: orden[0]?.resultado ?? null, oraculoParams: orden[0]?.params ?? null,
      puestoElegida: elegida ? puesto(elegida.indice) : null, puestoReferencia: rRef ? puesto(rRef.indice) : null,
      operaciones: rEl ? rEl.operaciones : null, acierto: rEl ? rEl.winRateMediana : null })
  }
  // Resumen del periodo de prueba: CAGR simple encadenado (suma de los resultados anuales sobre la duración real; un año
  // sin elección cuenta como 0 %: ese año no se opera), % de años que WF supera a la referencia y a la mediana, y
  // eficiencia = CAGR de WF / media de los CAGR de entrenamiento de las elegidas.
  const prueba = filasAnio.map(f => f.anio), d = diasDeTramo(prueba[0], prueba[prueba.length - 1])
  const encadenado = (k) => { const v = filasAnio.map(f => f[k]); if (k !== 'wf' && v.some(x => x == null)) return null
    return cagrSimple(capitalIni, capitalIni * v.reduce((s, x) => s + (x ?? 0), 0) / 100, d) }
  const supera = (k) => { const v = filasAnio.filter(f => f.wf != null && f[k] != null); return { gana: v.filter(f => f.wf > f[k]).length, de: v.length } }
  const cagrWF = encadenado('wf'), mEnt = media(filasAnio.filter(f => f.elegida).map(f => f.elegida.dentro.cagrMediana))
  return { anios: filasAnio, prueba, sinEleccion: filasAnio.filter(f => !f.elegida).length,
    resumen: { wf: cagrWF, referencia: encadenado('referencia'), mediana: encadenado('mediana'), oraculo: encadenado('oraculo'),
      superaReferencia: supera('referencia'), superaMediana: supera('mediana'),
      mediaEntrenamiento: mEnt, eficiencia: cagrWF != null && mEnt != null && mEnt > 0 ? cagrWF / mEnt : null } }
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
