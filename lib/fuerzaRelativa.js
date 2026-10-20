// lib/fuerzaRelativa.js — FUERZA RELATIVA POR PERCENTIL (docs/catalogo-condiciones.md, §3.1). Puro: recibe los miembros
// del índice y las velas diarias; no habla con la red.
//
// RENTABILIDAD PONDERADA de 12 meses de un valor en la vela t de SU serie diaria, con cierres hasta t:
//   FR(t) = 0,4·r(t, t−63) + 0,2·r(t−63, t−126) + 0,2·r(t−126, t−189) + 0,2·r(t−189, t−252),   r(a, b) = c[a] / c[b] − 1
// (trimestres de 63 sesiones). Sin 252 sesiones anteriores, o con algún cierre no válido en esos cinco puntos: sin dato.
//
// DISTRIBUCIÓN DE REFERENCIA (decisión de Sergi, 21/10/2026): SIEMPRE los miembros del índice (hoy el Nasdaq-100, indice
// 'NDX' de universo_miembros) en esa fecha que tengan vela ese día y FR calculable, sea cual sea el universo o la lista
// de la ejecución. Se calcula por cada día de bolsa del índice (los días con vela de algún miembro).
//
// PERCENTIL de un valor en su fecha d: la posición de su FR entre las de la distribución, 100 · (por debajo + ½ · iguales)
// / N, de 0 a 100 (0: peor que todos; 100: mejor que todos). El valor NO tiene que ser miembro: si lo es, su propia FR
// está en la distribución y cuenta como «igual». Se usa la distribución del último día de bolsa del índice con fecha <= d
// (la de ese mismo día solo si ya está cerrada: un valor de una bolsa que cierra ANTES que Nueva York —ticker con sufijo
// de mercado, como SAN.MC o SAP.DE— usa la del día anterior, para no mirar al futuro). Sin FR o sin distribución: null.
// Semanal: el percentil de la vela semanal es el de su última sesión diaria (la que la cierra).

export const INDICE_FUERZA_RELATIVA = 'NDX'
export const TRIMESTRE = 63
export const PESOS = Object.freeze([0.4, 0.2, 0.2, 0.2])
export const SESIONES_NECESARIAS = 4 * TRIMESTRE   // 252 sesiones antes de t

const valido = (x) => typeof x === 'number' && Number.isFinite(x) && x > 0

// FR de cada vela de una serie diaria (array de la misma longitud; null sin dato).
export function rentabilidadesPonderadas(velas) {
  const c = velas.map(v => v?.close)
  return c.map((_, t) => {
    if (t < SESIONES_NECESARIAS) return null
    const p = [t, t - TRIMESTRE, t - 2 * TRIMESTRE, t - 3 * TRIMESTRE, t - 4 * TRIMESTRE].map(i => c[i])
    if (!p.every(valido)) return null
    return PESOS[0] * (p[0] / p[1] - 1) + PESOS[1] * (p[1] / p[2] - 1) + PESOS[2] * (p[2] / p[3] - 1) + PESOS[3] * (p[3] / p[4] - 1)
  })
}

// La distribución por día de bolsa: { fechas (en orden), fr: { fecha: [FR de los miembros, ordenadas] } }.
//   miembros: filas de universo_miembros { simbolo_yahoo, desde, hasta, excluido_motivo } (un símbolo puede tener varios
//   tramos); velasPorSimbolo: { simbolo_yahoo: velas diarias en orden }.
export function distribucion(miembros, velasPorSimbolo) {
  const tramos = {}
  for (const m of miembros || []) if (m?.simbolo_yahoo && !m.excluido_motivo) (tramos[m.simbolo_yahoo] ||= []).push(m)
  const fr = {}
  for (const [sym, ts] of Object.entries(tramos)) {
    const v = velasPorSimbolo?.[sym]
    if (!v?.length) continue
    const r = rentabilidadesPonderadas(v)
    v.forEach((vela, t) => {
      const d = vela.date
      if (!ts.some(m => m.desde <= d && (m.hasta == null || d < m.hasta))) return
      ;(fr[d] ||= [])
      if (r[t] != null) fr[d].push(r[t])
    })
  }
  for (const d of Object.keys(fr)) fr[d].sort((a, b) => a - b)
  return { fechas: Object.keys(fr).sort(), fr }
}

// Percentil de x en una lista ORDENADA: 100 · (por debajo + ½ · iguales) / N; null sin lista o sin x.
export function percentilEn(ordenadas, x) {
  if (x == null || !ordenadas?.length) return null
  let lo = 0, hi = ordenadas.length
  while (lo < hi) { const m = (lo + hi) >> 1; if (ordenadas[m] < x) lo = m + 1; else hi = m }
  const debajo = lo
  let j = lo; while (j < ordenadas.length && ordenadas[j] === x) j++
  return 100 * (debajo + (j - lo) / 2) / ordenadas.length
}

// ¿Cierra su bolsa ANTES que Nueva York? Ticker con sufijo de mercado de Yahoo (SAN.MC, SAP.DE, VOD.L…). Las clases de
// acciones de EE. UU. van con guion en Yahoo (BRK-B), así que no se confunden.
export const cierraAntesQueNuevaYork = (ticker) => /\.[A-Z]{1,3}$/.test(String(ticker || ''))

// Percentil por FECHA de un valor: { fecha: percentil | null } para cada vela de su serie diaria.
export function percentilesDe(velasDiarias, dist, { ticker = null } = {}) {
  const r = rentabilidadesPonderadas(velasDiarias), estricto = cierraAntesQueNuevaYork(ticker)
  const out = {}
  let j = -1
  velasDiarias.forEach((v, t) => {
    while (j + 1 < dist.fechas.length && (estricto ? dist.fechas[j + 1] < v.date : dist.fechas[j + 1] <= v.date)) j++
    out[v.date] = j >= 0 ? percentilEn(dist.fr[dist.fechas[j]], r[t]) : null
  })
  return out
}

// Lunes (UTC) de la semana de una fecha, como lib/velasSemanales.js.
const lunesDe = (f) => { const d = new Date(f + 'T00:00:00Z'), w = d.getUTCDay(); d.setUTCDate(d.getUTCDate() - (w === 0 ? 6 : w - 1)); return d.toISOString().slice(0, 10) }

// El valor de cada vela de las barras del motor (diarias o semanales) a partir de los percentiles por fecha diaria: la
// diaria, el de su fecha; la semanal (fechada en su lunes), el de su última sesión diaria de esa semana.
export function percentilesParaBarras(barras, porFecha, semanal = false) {
  if (!semanal) return barras.map(b => porFecha[b.date] ?? null)
  const ultimoDeSemana = {}
  for (const f of Object.keys(porFecha).sort()) ultimoDeSemana[lunesDe(f)] = porFecha[f]
  return barras.map(b => ultimoDeSemana[b.date] ?? ultimoDeSemana[lunesDe(b.date)] ?? null)
}

// ¿Lee la estrategia el campo? Solo entonces se calcula y se inyecta (así ninguna respuesta de las demás cambia).
export const usaFuerzaRelativa = (codeJs) => /\brsPercentil\b/.test(String(codeJs || ''))
