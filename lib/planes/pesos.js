// lib/planes/pesos.js — el bloque «CON PESOS» de un plan (docs/builder.md §193; boceto bocetos/bloque-con-pesos.html). Puro: la
// validación y las cuentas que no dependen del motor (cuánto va a cada símbolo); el dinero de verdad lo mueve lib/planes/plan.js.
//
// PIEZA:
//   { id, tipo: 'pesos', peso, pesos: [{ simbolo, peso }] (fracciones que suman 1; símbolos de Yahoo o 'LIQUIDEZ' = efectivo DEL BLOQUE,
//     que no rinde y no es el ocioso de la cuenta), volver: { cada: 'nunca' | 'mes' | 'trimestre' | 'anio' | 'banda', puntos? (con
//     'banda': cuántos puntos se puede separar un peso antes de volver, de 1 a 49) }, aportaciones: 'ahora' | 'partida' | 'atras' | 'liquidez' }
// Las reglas «si… entonces…» llegarán en el commit siguiente (§194). De momento un plan con un bloque «Con pesos» lleva solo ese bloque.
// QQQ y SPY usan las series del plan (las mismas de sus Buy&Hold, con los dividendos de lib/dividendosCartera.json); los demás símbolos,
// las velas de la caché tal cual (sin dividendos, como en el resto de la app).
export const VOLVER_PESOS = Object.freeze(['nunca', 'mes', 'trimestre', 'anio', 'banda'])
export const APORTACIONES_PESOS = Object.freeze(['ahora', 'partida', 'atras', 'liquidez'])
export const MAX_SIMBOLOS_PESOS = 10
// La frecuencia de cambiaPeriodo (lib/laboratorioCartera.js) de cada «volver a los pesos» de calendario.
export const FRECUENCIA_VOLVER = Object.freeze({ mes: 'mensual', trimestre: 'trimestral', anio: 'anual' })
// Regla del 1 % (la del ocioso, §91; decisión d del boceto, 18/11): no se hace una orden del bloque si su comisión pasa del 1 % de ella.
export const MAX_COSTE_ORDEN_PESOS = 0.01
const RE_SIMBOLO = /^\^?[A-Z0-9][A-Z0-9.=-]{0,14}$/

export function validaPiezaPesos(x) {
  const e = []
  const ps = x?.pesos
  if (!Array.isArray(ps) || !ps.length || ps.length > MAX_SIMBOLOS_PESOS) return [`Los pesos: de 1 a ${MAX_SIMBOLOS_PESOS} símbolos.`]
  const vistos = new Set()
  for (const p of ps) {
    const s = p?.simbolo
    if (s !== 'LIQUIDEZ' && (typeof s !== 'string' || !RE_SIMBOLO.test(s) || s === 'ETF')) e.push(`«${s ?? ''}» no es un símbolo válido (en mayúsculas, como SPY, TQQQ o ^GSPC).`)
    else if (vistos.has(s)) e.push(`${s === 'LIQUIDEZ' ? 'La liquidez' : s} sale dos veces en los pesos.`)
    vistos.add(s)
    if (!(Number.isFinite(p?.peso) && p.peso > 0 && p.peso <= 1)) e.push(`El peso de ${s === 'LIQUIDEZ' ? 'la liquidez' : s || 'un símbolo'} tiene que ser mayor que 0 y como mucho 100 %.`)
  }
  const suma = ps.reduce((t, p) => t + (Number(p?.peso) || 0), 0)
  if (Math.abs(suma - 1) > 1e-9) e.push(`Los pesos tienen que sumar 100 % (ahora suman ${Math.round(suma * 1000) / 10} %).`)
  const v = x?.volver || {}
  if (!VOLVER_PESOS.includes(v.cada)) e.push('«Volver a los pesos»: nunca, cada mes, cada trimestre, cada año o si alguno se separa N puntos.')
  else if (v.cada === 'banda' && !(Number.isFinite(v.puntos) && v.puntos >= 1 && v.puntos <= 49)) e.push('Los puntos que se puede separar un peso, de 1 a 49.')
  if (!APORTACIONES_PESOS.includes(x?.aportaciones)) e.push('El dinero que le llega: según los pesos de ahora, los de partida, al que más se ha quedado atrás o a la liquidez del bloque.')
  return e
}
// Los símbolos que hay que comprar (sin la liquidez).
export const simbolosPesos = (x) => (x?.pesos || []).map(p => p.simbolo).filter(s => s && s !== 'LIQUIDEZ')
// Los pesos de partida como objeto { símbolo: fracción } (con 'LIQUIDEZ' si la lleva).
export const objetivoDe = (x) => Object.fromEntries((x?.pesos || []).map(p => [p.simbolo, p.peso]))

// Cuánto de C va a cada símbolo, según el modo. objetivo: { s: fracción }; valores: { s: euros que vale lo que se tiene ahora } (con
// 'LIQUIDEZ' = el efectivo del bloque). Devuelve { s: euros } (suma C). Ejemplos con C = 1.000, pesos 80/20 y valores 7.000 / 3.000:
//   'partida' → 800 / 200 · 'ahora' (70/30) → 700 / 300 · 'atras': con 11.000 tocan 8.800 / 2.200 → faltan 1.800 / 0 → 1.000 / 0
//   · 'liquidez' → todo a la liquidez del bloque. Sin nada aún (valores a 0: el dinero del primer día), TODOS los modos van como
//     'partida' (el primer día siempre se compran los pesos de partida).
export function repartoAportacion(modo, C, objetivo, valores) {
  if (!(C > 0)) return {}
  const claves = [...new Set([...Object.keys(objetivo), ...Object.keys(valores)])]
  const V = claves.reduce((t, s) => t + Math.max(0, valores[s] || 0), 0)
  const porPesos = (w) => { const T = claves.reduce((t, s) => t + (w[s] || 0), 0); return Object.fromEntries(claves.filter(s => w[s] > 0).map(s => [s, C * w[s] / T])) }
  if (modo === 'partida' || !(V > 0)) return porPesos(objetivo)
  if (modo === 'liquidez') return { LIQUIDEZ: C }
  if (modo === 'ahora') return porPesos(Object.fromEntries(claves.map(s => [s, Math.max(0, valores[s] || 0)])))
  // 'atras': rellena los huecos hasta los pesos de partida con lo que habrá después de la aportación (la suma de huecos es ≥ C).
  const T = V + C, hueco = Object.fromEntries(claves.map(s => [s, Math.max(0, (objetivo[s] || 0) * T - Math.max(0, valores[s] || 0))]))
  const H = claves.reduce((t, s) => t + hueco[s], 0)
  return H > 0 ? Object.fromEntries(claves.filter(s => hueco[s] > 0).map(s => [s, C * hueco[s] / H])) : porPesos(objetivo)
}
// Volver a los pesos: lo que sobra de cada símbolo (vender) y lo que falta (comprar), sobre el total. Ej.: 80/20, valores 8.400 / 3.600
// (12.000): tocan 9.600 / 2.400 → vender 1.200 del segundo, comprar 1.200 del primero.
export function ordenesVolver(objetivo, valores) {
  const claves = [...new Set([...Object.keys(objetivo), ...Object.keys(valores)])]
  const T = claves.reduce((t, s) => t + Math.max(0, valores[s] || 0), 0), sobra = {}, falta = {}
  for (const s of claves) { const d = Math.max(0, valores[s] || 0) - (objetivo[s] || 0) * T; if (d > 1e-12 * T) sobra[s] = d; else if (d < -1e-12 * T) falta[s] = -d }
  return { total: T, sobra, falta }
}
// ¿Algún peso se ha separado más de `puntos` del de partida? (con 80/20 y 10 puntos, a partir de 90/10 o 70/30)
export function fueraDeBanda(objetivo, valores, puntos) {
  const claves = [...new Set([...Object.keys(objetivo), ...Object.keys(valores)])]
  const T = claves.reduce((t, s) => t + Math.max(0, valores[s] || 0), 0)
  return T > 0 && claves.some(s => Math.abs(Math.max(0, valores[s] || 0) / T - (objetivo[s] || 0)) > puntos / 100 + 1e-12)
}
