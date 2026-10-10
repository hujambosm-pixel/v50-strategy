// lib/optimizacion.js — la parte de CÁLCULO de la pantalla «Optimización» (funciones puras, sin red ni React).
//
// La pantalla pide a /api/optimiza las métricas de cada combinación de parámetros en cada activo; aquí se
// agregan sobre todos los activos, se prepara el mapa de colores y se mide la estabilidad de una combinación
// frente a sus vecinas. Todo lo que se enseña sale de aquí, para poder comprobarlo a mano.

// ── Condiciones por defecto, peticiones y tiempo estimado ─────────────────────────────────────────────────
// Los últimos 5 AÑOS NATURALES COMPLETOS: en octubre de 2026, del 2021-01-01 al 2025-12-31.
export function periodoPorDefecto(hoy = new Date()) {
  const y = hoy.getFullYear()
  return { desde: `${y - 5}-01-01`, hasta: `${y - 1}-12-31` }
}

export const COMBINACIONES_POR_PETICION = 300   // el tope de /api/optimiza
export const CONCURRENCIA = 4                   // peticiones a la vez, como el ranking
// Coste medido (commit 5): ~4,7 ms por combinación en diario con 5 años en este equipo; ×2 por la CPU más
// lenta de las funciones de Vercel, y ~0,6 s fijos por petición (viaje, autenticación, velas).
export const COSTE = { msPorCombinacion: 4.7, factorServidor: 2, msPorPeticion: 600 }
// Por encima de esto, la pantalla avisa antes de lanzar (no lo impide).
export const UMBRAL_AVISO = { segundos: 300, backtests: 100000 }

export function divideEnPeticiones(combinaciones, tope = COMBINACIONES_POR_PETICION) {
  const trozos = []
  for (let i = 0; i < combinaciones.length; i += tope) trozos.push({ desde: i, combinaciones: combinaciones.slice(i, i + tope) })
  return trozos
}

// nTemporalidades: 2 con «Comparar diario y semanal» (la misma rejilla en las dos).
export function estimaOptimizacion(nCombinaciones, nActivos, nTemporalidades = 1) {
  const porActivo = Math.ceil(nCombinaciones / COMBINACIONES_POR_PETICION)
  const peticiones = porActivo * nActivos * nTemporalidades
  const backtests = nCombinaciones * nActivos * nTemporalidades
  const msPeticionMedia = Math.min(nCombinaciones, COMBINACIONES_POR_PETICION) * COSTE.msPorCombinacion * COSTE.factorServidor + COSTE.msPorPeticion
  const segundos = Math.ceil(peticiones / CONCURRENCIA) * msPeticionMedia / 1000
  const avisos = []
  if (segundos > UMBRAL_AVISO.segundos) avisos.push(`tardará unos ${Math.round(segundos / 60)} minutos`)
  if (backtests > UMBRAL_AVISO.backtests) avisos.push(`son ${backtests.toLocaleString('es-ES')} backtests`)
  return { backtests, peticiones, segundos, avisos }
}

// Cuántos activos están CALCULADOS (todas sus combinaciones con respuesta), a medias o sin empezar. Mientras la
// optimización corre, o si se detiene, los resultados son parciales: esto es lo que lo dice.
export function activosCalculados(activos, porActivo) {
  let completos = 0, aMedias = 0
  for (const s of activos || []) {
    const l = porActivo?.[s] || []
    const hechas = l.filter(x => x != null).length
    if (l.length && hechas === l.length) completos++
    else if (hechas) aMedias++
  }
  const total = (activos || []).length
  return { completos, aMedias, sinCalcular: total - completos, total }
}

// ── Agregación ────────────────────────────────────────────────────────────────────────────────────────────
// Una combinación CUENTA si suma al menos MIN_TOTAL operaciones y tiene al menos MIN_POR_ACTIVO en cada
// activo con resultado; si no, se aparta con el motivo.
export const MIN_TOTAL = 10, MIN_POR_ACTIVO = 3

export const mediana = (v) => {
  const o = v.filter(x => typeof x === 'number' && Number.isFinite(x)).sort((a, b) => a - b)
  if (!o.length) return null
  const m = o.length >> 1
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2
}
export const media = (v) => {
  const o = v.filter(x => typeof x === 'number' && Number.isFinite(x))
  return o.length ? o.reduce((s, x) => s + x, 0) / o.length : null
}
// El CAGR de -99 es el centinela de «capital final ≤ 0»: para agregar cuenta como lo que es, -100 %.
const cagrAgregable = (c) => c == null ? null : (c <= -99 ? -100 : c)

// Clave estable de una combinación (las claves ordenadas).
export const claveCombinacion = (params) => JSON.stringify(Object.keys(params || {}).sort().map(k => [k, params[k]]))

/**
 * combinaciones: [{ …params }] — las que se pidieron, en orden.
 * porActivo: { [símbolo]: [resultado de /api/optimiza para la combinación i] } (alineado con combinaciones).
 * Devuelve una fila por combinación: { indice, params, activos, errores, cagrMediana, cagrMedia, ddMediana, ddPeor,
 *   operaciones, activosPositivos, factorBeneficio, tiempoInvertido, porAnio, cuenta, motivo, porActivo }.
 */
// El CAGR que manda: `cagr: 'simple'` (por defecto: sin reinvertir, el del ranking; cada respuesta lo trae en
// metricas.cagr) o `'compuesto'` (reinvirtiendo, el del resumen del backtest y el multibacktest: metricas.cagrCompuesto).
// Ninguno se recalcula aquí: solo se elige cuál se agrega en cagrMediana / cagrMedia.
export const NOMBRES_CAGR = { simple: 'CAGR simple', compuesto: 'CAGR compuesto' }
export const cagrDeMetricas = (m, cagr = 'simple') => cagr === 'compuesto' ? m.cagrCompuesto : m.cagr
export function agregaOptimizacion(combinaciones, porActivo, { minTotal = MIN_TOTAL, minPorActivo = MIN_POR_ACTIVO, cagr = 'simple' } = {}) {
  const simbolos = Object.keys(porActivo || {})
  return combinaciones.map((params, indice) => {
    const conResultado = [], errores = []
    for (const sym of simbolos) {
      const r = porActivo[sym]?.[indice]
      if (r?.status === 200 && r.metricas) conResultado.push({ sym, m: r.metricas })
      else if (r) errores.push({ sym, error: r.errores?.join(' ') || r.error || `HTTP ${r.status}` })
    }
    const ms = conResultado.map(x => x.m)
    const cagrs = ms.map(m => cagrAgregable(cagrDeMetricas(m, cagr)))
    const operaciones = ms.reduce((s, m) => s + m.operaciones, 0)
    // Año a año: por año, la mediana y la media de la rentabilidad de cada activo y las operaciones cerradas.
    const anios = new Map()
    for (const m of ms) for (const a of m.porAnio || []) {
      if (!anios.has(a.anio)) anios.set(a.anio, { anio: a.anio, rentabilidades: [], operaciones: 0 })
      const x = anios.get(a.anio); x.rentabilidades.push(a.rentabilidadPct); x.operaciones += a.operaciones
    }
    const porAnio = [...anios.values()].sort((a, b) => a.anio - b.anio)
      .map(a => ({ anio: a.anio, mediana: mediana(a.rentabilidades), media: media(a.rentabilidades), operaciones: a.operaciones }))
    let motivo = null
    if (!conResultado.length) motivo = 'sin resultados en ningún activo'
    else if (operaciones < minTotal) motivo = `${operaciones} operaciones en total (mínimo ${minTotal})`
    else {
      const pocas = conResultado.filter(x => x.m.operaciones < minPorActivo)
      if (pocas.length) motivo = `menos de ${minPorActivo} operaciones en ${pocas.map(x => `${x.sym} (${x.m.operaciones})`).join(', ')}`
    }
    return {
      indice, params, activos: conResultado.length, errores,
      cagrMediana: mediana(cagrs), cagrMedia: media(cagrs),
      ddMediana: mediana(ms.map(m => m.maxDD)), ddPeor: ms.length ? Math.max(...ms.map(m => m.maxDD)) : null,
      operaciones, activosPositivos: ms.filter(m => m.beneficioSimple > 0).length,
      factorBeneficio: mediana(ms.map(m => m.factorBeneficio)), winRateMediana: mediana(ms.map(m => m.winRate)), tiempoInvertido: media(ms.map(m => m.tiempoInvertidoPct)),
      porAnio, cuenta: motivo == null, motivo,
      porActivo: Object.fromEntries(conResultado.map(x => [x.sym, x.m])),
    }
  })
}

// Ordena las filas por una columna (las que cuentan primero; los null al final).
export function ordenaFilas(filas, columna = 'cagrMediana', descendente = true) {
  const v = (f) => f[columna]
  return [...filas].sort((a, b) => {
    if (a.cuenta !== b.cuenta) return a.cuenta ? -1 : 1
    const x = v(a), y = v(b)
    if (x == null && y == null) return a.indice - b.indice
    if (x == null) return 1
    if (y == null) return -1
    return descendente ? y - x || a.indice - b.indice : x - y || a.indice - b.indice
  })
}

// ── Mapa de colores ───────────────────────────────────────────────────────────────────────────────────────
// Dos parámetros en los ejes y el resto fijados en `fijos`. Devuelve los valores de cada eje (los de la
// rejilla, en orden) y la fila de cada celda (o null si esa combinación no se probó).
export function mapaColores(filas, valores, { ejeX, ejeY, fijos = {} }) {
  const xs = valores[ejeX] || [], ys = valores[ejeY] || []
  const porClave = new Map(filas.map(f => [claveCombinacion(f.params), f]))
  const otros = Object.keys(valores).filter(k => k !== ejeX && k !== ejeY)
  const celdas = ys.map(y => xs.map(x => {
    const params = {}
    for (const k of Object.keys(valores)) params[k] = k === ejeX ? x : k === ejeY ? y : fijos[k]
    if (otros.some(k => fijos[k] === undefined)) return null
    return porClave.get(claveCombinacion(params)) || null
  }))
  return { xs, ys, celdas }
}

// ── Comparar temporalidades ─────────────────────────────────────────────────────────────────────────────────
// Con «Comparar diario y semanal» la misma rejilla se lanza en las dos temporalidades. res lleva entonces
// { comparar: true, temporalidades, porTemporalidad: { [tp]: { porActivo, calentamientos } } }. Cada temporalidad
// se agrega POR SEPARADO (sus métricas son exactamente las de lanzarla sola) y cada fila lleva su temporalidad,
// su índice en ella (indiceBase) y un índice único en la unión (indice).
export const TEMPORALIDADES_COMPARAR = ['diario', 'semanal']
export function agregaPorTemporalidad(res, opciones = {}) {
  if (!res?.comparar) return res ? agregaOptimizacion(res.combos, res.porActivo, opciones) : []
  const n = res.combos.length
  return res.temporalidades.flatMap((tp, k) => agregaOptimizacion(res.combos, res.porTemporalidad[tp].porActivo, opciones)
    .map(f => ({ ...f, temporalidad: tp, indiceBase: f.indice, indice: k * n + f.indice })))
}
// Las respuestas de un activo en todas las temporalidades (para saber si ya está calculado en todas).
export function porActivoUnido(res) {
  if (!res?.comparar) return res?.porActivo
  return Object.fromEntries(res.activos.map(s => [s, res.temporalidades.flatMap(tp => res.porTemporalidad[tp].porActivo[s] || [])]))
}
// El resumen de una temporalidad: su mejor combinación válida (la métrica), su estabilidad frente a sus
// vecinas, la configuración guardada y la mediana de la métrica en todas las válidas.
export function resumenTemporalidad(filas, valores, claveGuardada, metrica = 'cagrMediana') {
  const validas = ordenaFilas(filas.filter(f => f.cuenta), metrica, true)
  const mejor = validas[0] || null
  return { mejor, estabilidad: mejor ? estabilidad(mejor, filas, valores, metrica) : null,
    guardada: filas.find(f => claveCombinacion(f.params) === claveGuardada) || null,
    medianaValidas: mediana(validas.map(f => f[metrica])), validas: validas.length, total: filas.length }
}

// ── Gráfico de un parámetro ──────────────────────────────────────────────────────────────────────────────────
// Cuando la rejilla varía UN solo parámetro (los demás tienen un único valor), cada valor suyo es una fila de
// la tabla. Devuelve los puntos en el orden de la rejilla: { x, fila } (fila null si ese valor no se probó).
export function serieUnParametro(filas, valores, param) {
  const porClave = new Map(filas.map(f => [claveCombinacion(f.params), f]))
  const fijos = Object.fromEntries(Object.keys(valores).filter(k => k !== param).map(k => [k, valores[k][0]]))
  return (valores[param] || []).map(x => ({ x, fila: porClave.get(claveCombinacion({ ...fijos, [param]: x })) || null }))
}

// ── Estabilidad ───────────────────────────────────────────────────────────────────────────────────────────
// Las vecinas de una combinación: un paso arriba y uno abajo en cada parámetro de la rejilla (en su lista de
// valores), con los demás iguales. Devuelve su resultado (por defecto la mediana del CAGR) frente al de la
// combinación: si las vecinas caen mucho, el óptimo es un pico aislado y no una zona estable.
export function estabilidad(fila, filas, valores, metrica = 'cagrMediana') {
  const porClave = new Map(filas.map(f => [claveCombinacion(f.params), f]))
  const vecinas = []
  for (const k of Object.keys(valores)) {
    const lista = valores[k], i = lista.findIndex(v => v === fila.params[k])
    if (i < 0) continue
    for (const j of [i - 1, i + 1]) {
      if (j < 0 || j >= lista.length) continue
      const f = porClave.get(claveCombinacion({ ...fila.params, [k]: lista[j] }))
      if (f) vecinas.push({ parametro: k, valor: lista[j], fila: f, valorMetrica: f[metrica] })
    }
  }
  const propia = fila[metrica]
  const mediaVecinas = media(vecinas.map(v => v.valorMetrica))
  return { propia, vecinas, mediaVecinas, diferencia: propia != null && mediaVecinas != null ? mediaVecinas - propia : null }
}

// ── «Probar en backtest» ──────────────────────────────────────────────────────────────────────────────────
// Lo necesario para repetir en el backtest individual o en el multibacktest el backtest de una combinación tal
// como lo hizo la optimización: sus params (cambios sobre los guardados), las mismas condiciones y el
// calentamiento común de su petición (ver pages/api/optimiza.js). La estrategia guardada no cambia.
export function pruebaDeFila(res, fila) {
  const c = res.condiciones
  // Comparando temporalidades, la fila dice cuál es la suya y su calentamiento sale de esa temporalidad.
  const calentamiento = fila.temporalidad ? res.porTemporalidad?.[fila.temporalidad]?.calentamientos?.[fila.indiceBase] : res.calentamientos?.[fila.indice]
  return { estrategiaId: res.estrategiaId, nombre: res.nombre, params: fila.params, calentamiento: calentamiento ?? null,
    intervalo: fila.temporalidad || c.intervalo, desde: c.desde, hasta: c.hasta, capitalIni: c.capitalIni, comisiones: c.comisiones, activos: [...res.activos] }
}
// El payload del backtest individual (pages/index.js: run → /api/datos) con las condiciones de la optimización:
// los mismos campos que manda /api/optimiza a lib/backtestActivo.js, sin filtros.
export function payloadPrueba(p) {
  return { strategyId: p.estrategiaId, capital_ini: p.capitalIni, years: 5, allocation_pct: 100, filtros: [], intervalo: p.intervalo,
    fromDate: p.desde, toDate: p.hasta, comisiones: p.comisiones, params: p.params, ...(p.calentamiento != null ? { calentamiento: p.calentamiento } : {}) }
}
