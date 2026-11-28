// lib/planes/pesos.js — el bloque «CON PESOS» de un plan (docs/builder.md §193; boceto bocetos/bloque-con-pesos.html). Puro: la
// validación y las cuentas que no dependen del motor (cuánto va a cada símbolo); el dinero de verdad lo mueve lib/planes/plan.js.
//
// PIEZA:
//   { id, tipo: 'pesos', peso, pesos: [{ simbolo, peso }] (fracciones que suman 1; símbolos de Yahoo o 'LIQUIDEZ' = efectivo DEL BLOQUE,
//     que no rinde y no es el ocioso de la cuenta), volver: { cada: 'nunca' | 'mes' | 'trimestre' | 'anio' | 'banda', puntos? (con
//     'banda': cuántos puntos se puede separar un peso antes de volver, de 1 a 49) }, aportaciones: 'ahora' | 'partida' | 'atras' | 'liquidez' }
// Y, opcional, reglas: [...] «si… entonces…» (§194, más abajo). De momento un plan con un bloque «Con pesos» lleva solo ese bloque.
import { validaCond } from '../editor/definicion'
import { serieCond } from '../editor/interprete'
import { semanalesDesdeDiarias, lunesDeSemana } from '../velasSemanales'
import { alineaReferencia } from '../condiciones/nucleo'
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
    if (s === '' || s == null) e.push('Falta elegir el activo en «1 · Pesos de partida».')   // §201: el bloque recién añadido, en blanco
    else if (s !== 'LIQUIDEZ' && (typeof s !== 'string' || !RE_SIMBOLO.test(s) || s === 'ETF')) e.push(`«${s ?? ''}» no es un símbolo válido (en mayúsculas, como SPY, TQQQ o ^GSPC).`)
    else if (vistos.has(s)) e.push(`${s === 'LIQUIDEZ' ? 'La liquidez' : s} sale dos veces en los pesos.`)
    vistos.add(s)
    if (!(Number.isFinite(p?.peso) && p.peso > 0 && p.peso <= 1)) e.push(`El peso de ${s === 'LIQUIDEZ' ? 'la liquidez' : s || 'un símbolo'} tiene que ser mayor que 0 y como mucho 100 %.`)
  }
  const suma = ps.reduce((t, p) => t + (Number(p?.peso) || 0), 0)
  if (Math.abs(suma - 1) > 1e-9) e.push(`Los pesos tienen que sumar 100 % (ahora suman ${Math.round(suma * 1000) / 10} %).`)
  const v = x?.volver || {}
  if (!VOLVER_PESOS.includes(v.cada)) e.push('«Volver a los pesos»: nunca, cada mes, cada trimestre, cada año o si alguno se separa N puntos.')
  else if (v.cada === 'banda' && !(Number.isFinite(v.puntos) && v.puntos >= 1 && v.puntos <= 49)) e.push('Los puntos que se puede separar un peso, de 1 a 49.')
  if (!APORTACIONES_PESOS.includes(x?.aportaciones)) e.push('El dinero que le llega: según los pesos de ahora, los de partida, al que más se ha quedado atrás o a la liquidez de la parte.')
  return [...e, ...validaReglasPesos(x)]
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

// ── §194: LAS REGLAS «SI… ENTONCES…» ──
// regla: { filas: [{ quien: símbolo, si: condición del catálogo (un nodo, como los filtros del plan), velas: 'diarias' | 'semanales',
//          union?: 'Y' | 'O' (de la 2.ª fila en adelante; «Y» se agrupa antes que «O»: A Y B O C = (A y B) o C) }],
//          accion: { tipo: 'pesos', pesos: [{ simbolo, peso }] } | { tipo: 'moverBloque' | 'moverActivo', pct, de, a } | { tipo: 'vender', de },
//          mantenerMeses (0 a 120), despues: { tipo: 'partida' | 'quedarse' | 'cuando', filas? }, repetir: 'porCaida' | 'siempre' | 'unaVez' }
// Cada día, al cierre, se miran en orden y como mucho actúa UNA (la primera que se cumple), a la apertura siguiente. Mientras una
// regla está «en curso» (desde que actúa hasta que se vuelve a los pesos de partida o, con «quedarse», hasta que acaba «mantener»), las
// demás esperan; durante «mantener» tampoco se vuelve a los pesos, y el dinero que llega va según los pesos de ese momento.
// «Una vez por caída»: no se repite hasta que el símbolo de su primera fila cierre por encima del máximo de cierre que tenía el día en que
// se cumplió. Una fila semanal vale lo de la última semana CERRADA: se conoce al cierre de la última sesión de la semana (la orden, a la
// apertura del lunes siguiente).
export const ACCIONES_REGLA = Object.freeze(['pesos', 'moverBloque', 'moverActivo', 'vender'])
export const DESPUES_REGLA = Object.freeze(['partida', 'quedarse', 'cuando'])
export const REPETIR_REGLA = Object.freeze(['porCaida', 'siempre', 'unaVez'])
export const MAX_REGLAS = 5, MAX_FILAS_REGLA = 6, MAX_MANTENER = 120
const esSimbolo = (s) => s === 'LIQUIDEZ' || (typeof s === 'string' && RE_SIMBOLO.test(s) && s !== 'ETF')

function validaListaPesos(ps, donde) {
  const e = []
  if (!Array.isArray(ps) || !ps.length || ps.length > MAX_SIMBOLOS_PESOS) return [`${donde}: de 1 a ${MAX_SIMBOLOS_PESOS} símbolos.`]
  const vistos = new Set()
  for (const p of ps) {
    if (!esSimbolo(p?.simbolo)) e.push(`${donde}: «${p?.simbolo ?? ''}» no es un símbolo válido.`)
    else if (vistos.has(p.simbolo)) e.push(`${donde}: ${p.simbolo} sale dos veces.`)
    vistos.add(p?.simbolo)
    if (!(Number.isFinite(p?.peso) && p.peso > 0 && p.peso <= 1)) e.push(`${donde}: cada peso, mayor que 0 y como mucho 100 %.`)
  }
  const suma = ps.reduce((t, p) => t + (Number(p?.peso) || 0), 0)
  if (Math.abs(suma - 1) > 1e-9) e.push(`${donde}: los pesos tienen que sumar 100 % (ahora suman ${Math.round(suma * 1000) / 10} %).`)
  return e
}
export function validaFilas(filas, donde) {   // §203: también la usa la regla del ocioso
  const e = []
  if (!Array.isArray(filas) || !filas.length || filas.length > MAX_FILAS_REGLA) return [`${donde}: de 1 a ${MAX_FILAS_REGLA} condiciones.`]
  filas.forEach((f, k) => {
    const d = `${donde}, condición ${k + 1}`
    if (!f || typeof f !== 'object') { e.push(`${d}: falta.`); return }
    if (!esSimbolo(f.quien) || f.quien === 'LIQUIDEZ') e.push(`${d}: de quién tiene que ser un símbolo (SPY, TQQQ, ^GSPC…).`)
    if (f.velas !== undefined && !['diarias', 'semanales'].includes(f.velas)) e.push(`${d}: las velas, diarias o semanales.`)
    if (k > 0 && !['Y', 'O'].includes(f.union)) e.push(`${d}: tiene que decir «Y» u «O».`)
    e.push(...validaCond(f.si, {}, d))
  })
  return e
}
export function validaReglasPesos(x) {
  const rs = x?.reglas
  if (rs === undefined) return []
  if (!Array.isArray(rs) || rs.length > MAX_REGLAS) return [`Las reglas: como mucho ${MAX_REGLAS}.`]
  const e = []
  rs.forEach((r, k) => {
    const d = `Regla ${k + 1}`
    e.push(...validaFilas(r?.filas, `${d} (SI)`))
    const a = r?.accion || {}
    if (!ACCIONES_REGLA.includes(a.tipo)) e.push(`${d}: ENTONCES tiene que ser pasar a unos pesos, mover un %, o vender un activo.`)
    else if (a.tipo === 'pesos') e.push(...validaListaPesos(a.pesos, `${d} (pesos nuevos)`))
    else {
      if (!esSimbolo(a.de)) e.push(`${d}: falta de dónde sale el dinero.`)
      if (a.tipo !== 'vender') {
        if (!esSimbolo(a.a) || a.a === a.de) e.push(`${d}: falta a dónde va el dinero (distinto de dónde sale).`)
        if (!(Number.isFinite(a.pct) && a.pct > 0 && a.pct <= 100)) e.push(`${d}: el % que se mueve, mayor que 0 y como mucho 100.`)
      } else if (a.de === 'LIQUIDEZ') e.push(`${d}: la liquidez no se vende.`)
    }
    if (!(Number.isInteger(r?.mantenerMeses) && r.mantenerMeses >= 0 && r.mantenerMeses <= MAX_MANTENER)) e.push(`${d}: MANTENER, de 0 a ${MAX_MANTENER} meses.`)
    if (!DESPUES_REGLA.includes(r?.despues?.tipo)) e.push(`${d}: DESPUÉS tiene que ser volver a los pesos de partida, quedarse así o volver cuando…`)
    else if (r.despues.tipo === 'cuando') e.push(...validaFilas(r.despues.filas, `${d} (volver cuando)`))
    if (!REPETIR_REGLA.includes(r?.repetir)) e.push(`${d}: REPETIR tiene que ser una vez por caída, cada vez o solo una vez.`)
  })
  return e
}
// Los símbolos que el bloque puede llegar a tener (los de las acciones) y los que miran sus condiciones.
export const simbolosAcciones = (x) => (x?.reglas || []).flatMap(r => { const a = r?.accion || {}; return a.tipo === 'pesos' ? (a.pesos || []).map(p => p.simbolo) : [a.de, a.a] }).filter(s => s && s !== 'LIQUIDEZ')
export const simbolosFilas = (x) => (x?.reglas || []).flatMap(r => [...(r?.filas || []), ...(r?.despues?.tipo === 'cuando' ? r.despues.filas || [] : [])]).map(f => f?.quien).filter(Boolean)

// La serie de una fila en las fechas del plan (true / false / null), con las velas DIARIAS de su símbolo (velasDe(símbolo) → velas).
// Diarias: el valor de la última sesión del símbolo hasta esa fecha. Semanales: el de la última semana cuya última sesión es esa
// fecha o anterior (se conoce al cierre de esa sesión).
export function serieFila(f, velasDe, fechas) {
  const d = velasDe(f.quien)
  if (!d?.length) return fechas.map(() => null)
  if (f.velas !== 'semanales') return alineaReferencia(fechas, d.map(v => v.date), serieCond(f.si, d, {}, {}))
  const sem = semanalesDesdeDiarias(d), s = serieCond(f.si, sem, {}, {}), ultima = new Map()
  for (const v of d) ultima.set(lunesDeSemana(v.date), v.date)
  return alineaReferencia(fechas, sem.map(w => ultima.get(w.date) ?? w.date), s)
}
// Las filas juntas: «Y» se agrupa antes que «O». true solo si algún grupo tiene todas sus filas en true.
export function serieFilas(filas, velasDe, fechas) {
  const ss = filas.map(f => serieFila(f, velasDe, fechas)), grupos = [[0]]
  for (let k = 1; k < filas.length; k++) { if (filas[k].union === 'O') grupos.push([k]); else grupos[grupos.length - 1].push(k) }
  return fechas.map((_, i) => grupos.some(g => g.every(k => ss[k][i] === true)))
}
// El máximo de cierre del símbolo hasta cada fecha del plan (con toda su historia cargada; el de «una vez por caída») y su cierre.
export function maximoHasta(simbolo, velasDe, fechas) {
  const d = velasDe(simbolo)
  if (!d?.length) return fechas.map(() => null)
  let m = null
  const mx = d.map(v => { if (v.close != null && (m == null || v.close > m)) m = v.close; return m })
  return alineaReferencia(fechas, d.map(v => v.date), mx)
}
export const cierreEn = (simbolo, velasDe, fechas) => { const d = velasDe(simbolo); return d?.length ? alineaReferencia(fechas, d.map(v => v.date), d.map(v => v.close)) : fechas.map(() => null) }
