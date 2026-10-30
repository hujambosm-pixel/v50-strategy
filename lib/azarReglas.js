// lib/azarReglas.js — paso 2 del Builder: el azar RE-SIMULADO con las reglas de salida de la estrategia (docs/builder.md, §42–§43).
// Puro, sin pantalla todavía. No cambia lib/azar.js (la «Prueba contra el azar» de hoy sigue igual).
//
// Por qué: con stops, copiar las duraciones de las operaciones reales a fechas al azar no es neutral (§42). Aquí cada copia entra al
// azar y sale con la MISMA regla de salida de la estrategia aplicada desde esa entrada, así que una estrategia sin ventaja es una
// copia más.
//
//   tablaSalidas(velas, estrategia)   para cada vela de entrada posible e, la operación que abriría comprando a la apertura de e,
//                                     con el propio intérprete (ctx.entradasForzadas): vela de salida, precio de venta y velas.
//   copiasReSimuladas(velas, estrategia, operacionesReales, { n, semilla })
//                                     tasa de entradas = operaciones de la estrategia / velas sin posición, en el periodo; cada
//                                     copia entra al azar con esa tasa en las velas sin posición (una operación a la vez), compra
//                                     SIEMPRE a la apertura (decisión 1), sin el filtro de mercado (decisión 2: se prueba la
//                                     estrategia completa) y sale como diga la tabla. CAGR compuesto, caída máxima vela a vela y
//                                     operaciones de cada copia; percentil de la estrategia (empates, la mitad) y mediana.
//   fiabilidad(velas, estrategia, { mercados, bloque, semilla })
//                                     mercados ficticios con los días del PROPIO activo barajados por bloques; en cada uno, una
//                                     «estrategia» con entradas al azar a la misma tasa contra sus copias. % de aprobados falsos y
//                                     su intervalo del 95 % (Wilson).
//   veredicto({ aprobadosFalsos, periodos })   con REGLA_AZAR_REGLAS (la regla, solo aquí).
//
// estrategia: { definicion, params, ctx } (la fuente del editor) o la definición sola. velas: las cerradas, con calentamiento; las
// fechas desde / hasta (opcionales, incluidas) marcan el periodo medido. Una operación que sigue abierta al final del periodo se valora
// al cierre de su última vela. Nada depende de que las velas sean diarias o semanales: los años salen de las fechas.
import { interpreta } from './editor/interprete'
import { generador, semillaDe, percentilDe } from './azar'

// ── La regla del veredicto (la única copia) ──
export const REGLA_AZAR_REGLAS = {
  copias: 1000, mercados: 200, bloque: 20,
  gana: 95,                 // la estrategia «gana» si su CAGR supera al de ≥ 95 % de las copias (percentilDe)
  sinVeredicto: 9,          // aprobados falsos ≥ 9 % → «Sin veredicto» (con 200 mercados, el intervalo queda por encima del 5 %)
  periodos: [['2016-01-01', '2020-12-31'], ['2021-01-01', '2025-12-31']],   // «Pasa» si gana en los dos
  pocasOperaciones: 30,     // aviso si un periodo tiene menos
}
export const TEXTO_VEREDICTO_REGLAS = { pasa: 'Pasa', noPasa: 'No pasa', sinVeredicto: 'Sin veredicto' }

const rndDe = (s) => generador(typeof s === 'number' ? s : semillaDe(String(s)))
const deEstrategia = (x) => x?.tipo === 'editor' ? { definicion: x, params: {}, ctx: {} } : { params: {}, ctx: {}, ...x }
const anios = (velas, i0, i1) => Math.max(1, (Date.parse(velas[i1].date) - Date.parse(velas[i0].date)) / 864e5) / 365.25
const cagrDe = (f, a) => (Math.pow(f, 1 / a) - 1) * 100
// Las velas del periodo: la primera con fecha ≥ desde (al menos la 1: la entrada necesita una vela anterior) y la última ≤ hasta.
function rango(velas, desde, hasta) {
  let i0 = 1, i1 = velas.length - 1
  if (desde) while (i0 <= i1 && velas[i0].date < desde) i0++
  if (hasta) while (i1 >= i0 && velas[i1].date > hasta) i1--
  if (i0 > i1) throw new Error('azarReglas: el periodo no tiene velas')
  return { i0, i1 }
}

// La tabla: salida[e] (vela de venta), precio[e] y abierta[e] (sigue abierta al final del periodo: se valora al cierre de hasta, y
// salida = hasta). Por pasadas: en cada una se fuerzan todas las velas que faltan; el intérprete entra en la primera, sale, entra
// en la siguiente libre… y cada operación depende solo de su vela de entrada, así que vale para la tabla.
export function tablaSalidas(velas, estrategia, { desde, hasta } = {}) {
  const { definicion, params, ctx } = deEstrategia(estrategia)
  const { i0, i1 } = rango(velas, desde, hasta)
  const bars = velas.length === i1 + 1 ? velas : velas.slice(0, i1 + 1)   // sin mirar más allá del periodo
  const idx = new Map(bars.map((b, i) => [b.date, i]))
  const salida = new Int32Array(i1 + 1).fill(-1), precio = new Float64Array(i1 + 1).fill(NaN), abierta = new Uint8Array(i1 + 1), motivo = new Array(i1 + 1).fill(null)
  let faltan = i1 - i0 + 1, pasadas = 0
  while (faltan > 0) {
    const forz = new Set()
    for (let e = i0; e <= i1; e++) if (salida[e] < 0) forz.add(e)
    const r = interpreta(definicion, bars, params, { ...ctx, entradasForzadas: forz })
    pasadas++
    let nuevas = 0
    for (const tr of r.trades) { const e = idx.get(tr.entryDate); if (salida[e] < 0) { salida[e] = idx.get(tr.exitDate); precio[e] = tr.exitPrice; motivo[e] = tr.exitReason; nuevas++ } }
    if (r.openPosition) { const e = idx.get(r.openPosition.entryDate); if (salida[e] < 0) { salida[e] = i1; precio[e] = bars[i1].close; abierta[e] = 1; nuevas++ } }
    if (!nuevas) throw new Error('azarReglas: la tabla no avanza')
    faltan -= nuevas
  }
  const velasDe = (e) => salida[e] - e
  return { desde: i0, hasta: i1, salida, precio, abierta, motivo, pasadas, velasDe }
}

// Caída máxima vela a vela de una operación sobre el capital f (todo el capital, sin comisiones): la abierta, marcada al cierre de
// cada vela de e a x − 1; el día de la venta, su precio. Mueve est = { f, pico, dd } (dd en tanto por uno).
function marca(est, velas, e, x, entrada, salida) {
  for (let j = e; j < x; j++) {
    const v = est.f * velas[j].close / entrada
    if (v > est.pico) est.pico = v; else if (1 - v / est.pico > est.dd) est.dd = 1 - v / est.pico
  }
  est.f *= salida / entrada
  if (est.f > est.pico) est.pico = est.f; else if (1 - est.f / est.pico > est.dd) est.dd = 1 - est.f / est.pico
}
// Entradas al azar con probabilidad p en cada vela sin posición (saltos geométricos: lo mismo que sortear vela a vela), compra a la
// apertura y salida de la tabla. Devuelve { f, k, dd } (dd solo si conCaida) y, si se pide, las operaciones.
function sortea(tab, velas, p, rnd, { conCaida = false, ops = null } = {}) {
  const { desde: i0, hasta: i1, salida, precio } = tab
  const est = { f: 1, pico: 1, dd: 0 }
  let k = 0
  if (p > 0) {
    const lp = Math.log(1 - p)
    let c = i0 - 1
    while (true) {
      c += Math.floor(Math.log(1 - rnd()) / lp)
      const e = c + 1
      if (e > i1) break
      const x = salida[e], o = velas[e].open
      if (conCaida) marca(est, velas, e, x, o, precio[e]); else est.f *= precio[e] / o
      if (ops) ops.push({ e, x })
      k++
      c = x
    }
  }
  return { f: est.f, k, dd: est.dd }
}

// Las operaciones reales del periodo (las que entran en él; formato del motor: entryDate, exitDate, entryPrice, exitPrice; sin
// exitDate = abierta) como { e, x, entrada, salida }, y las velas sin posición del periodo (las de entrada cuentan como libres).
function opsDelPeriodo(velas, operaciones, i0, i1) {
  const idx = new Map(velas.map((b, i) => [b.date, i])), ocupada = new Uint8Array(i1 + 1), ops = []
  for (const tr of operaciones || []) {
    const e = idx.get(tr.entryDate)
    if (e == null) continue
    const x0 = tr.exitDate ? idx.get(tr.exitDate) : Infinity, x = Math.min(x0 ?? Infinity, i1)
    for (let j = Math.max(e + 1, i0); j <= x; j++) ocupada[j] = 1
    if (e < i0 || e > i1) continue
    ops.push({ e, x, entrada: tr.entryPrice, salida: x0 > i1 ? velas[i1].close : tr.exitPrice })
  }
  for (const o of ops) ocupada[o.e] = 0
  let libres = 0
  for (let j = i0; j <= i1; j++) if (!ocupada[j]) libres++
  return { ops, libres }
}
export function tasaDeEntradas(velas, operacionesReales, { desde, hasta } = {}) {
  const { i0, i1 } = rango(velas, desde, hasta), { ops, libres } = opsDelPeriodo(velas, operacionesReales, i0, i1)
  return { operaciones: ops.length, libres, tasa: libres ? ops.length / libres : 0 }
}
const mediana = (xs) => { const v = Float64Array.from(xs).sort(); return v.length ? (v.length % 2 ? v[v.length >> 1] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2) : null }

export function copiasReSimuladas(velas, estrategia, operacionesReales, { n = REGLA_AZAR_REGLAS.copias, semilla = 'azarReglas', desde, hasta, tabla = null } = {}) {
  const tab = tabla || tablaSalidas(velas, estrategia, { desde, hasta })
  const { desde: i0, hasta: i1 } = tab, a = anios(velas, i0, i1)
  const { ops, libres } = opsDelPeriodo(velas, operacionesReales, i0, i1), tasa = libres ? ops.length / libres : 0
  const est = { f: 1, pico: 1, dd: 0 }
  for (const o of ops) marca(est, velas, o.e, o.x, o.entrada, o.salida)
  const real = { cagr: cagrDe(est.f, a), caida: est.dd * 100, operaciones: ops.length }
  const rnd = rndDe(semilla), copias = []
  for (let s = 0; s < n; s++) { const r = sortea(tab, velas, tasa, rnd, { conCaida: true }); copias.push({ cagr: cagrDe(r.f, a), caida: r.dd * 100, operaciones: r.k }) }
  const cagrs = copias.map(c => c.cagr)
  return { real, tasa, libres, copias, percentil: ops.length ? percentilDe(cagrs, real.cagr) : null, mediana: mediana(cagrs), desde: velas[i0].date, hasta: velas[i1].date }
}

// Un mercado ficticio: el primer día, el real; después los días del activo (cocientes: salto de la apertura sobre el cierre anterior,
// máximo, mínimo y cierre sobre la apertura) barajados por bloques de `bloque` días seguidos y encadenados. OHLC coherente por
// construcción. Las mismas fechas (y volúmenes) que las velas reales.
function diasDe(velas) {
  const dias = []
  for (let i = 1; i < velas.length; i++) {
    const { open: o, high: h, low: l, close: c } = velas[i], c0 = velas[i - 1].close
    if (![o, h, l, c, c0].every(x => x > 0)) continue
    dias.push({ g: o / c0, h: Math.max(h, o, c) / o, l: Math.min(l, o, c) / o, c: c / o })
  }
  return dias
}
function mercadoFicticio(velas, dias, bloque, rnd) {
  const bloques = []
  for (let i = 0; i < dias.length; i += bloque) bloques.push(dias.slice(i, i + bloque))
  const orden = []
  while (orden.length < velas.length - 1) {
    const b = bloques.slice()
    for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [b[i], b[j]] = [b[j], b[i]] }
    for (const x of b) orden.push(...x)
  }
  const out = [{ ...velas[0] }]
  let prev = velas[0].close
  for (let i = 1; i < velas.length; i++) {
    const x = orden[i - 1], open = prev * x.g
    out.push({ date: velas[i].date, open, high: open * x.h, low: open * x.l, close: open * x.c, volume: velas[i].volume })
    prev = open * x.c
  }
  return out
}
// Intervalo de Wilson del 95 % para x de n, en %.
export function intervaloWilson(x, n) {
  const z = 1.96, p = x / n, den = 1 + z * z / n, c = (p + z * z / (2 * n)) / den, h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / den
  return [Math.max(0, c - h) * 100, Math.min(1, c + h) * 100]
}

export function fiabilidad(velas, estrategia, { mercados = REGLA_AZAR_REGLAS.mercados, bloque = REGLA_AZAR_REGLAS.bloque, copias = REGLA_AZAR_REGLAS.copias, semilla = 'azarReglas', desde, hasta, tasa = null } = {}) {
  const e = deEstrategia(estrategia)
  if (tasa == null) { const r = interpreta(e.definicion, velas, e.params, e.ctx); tasa = tasaDeEntradas(velas, r.openPosition ? [...r.trades, r.openPosition] : r.trades, { desde, hasta }).tasa }
  const dias = diasDe(velas)
  let aprobados = 0, sinOperaciones = 0
  for (let m = 0; m < mercados; m++) {
    const mv = mercadoFicticio(velas, dias, bloque, rndDe(`${semilla}|mercado|${m}`))
    const tab = tablaSalidas(mv, e, { desde, hasta }), a = anios(mv, tab.desde, tab.hasta)
    // La «estrategia» sin ventaja: entradas al azar a la tasa de la real; sus copias, a la tasa medida en ella (como con una real).
    const ops = [], r = sortea(tab, mv, tasa, rndDe(`${semilla}|estrategia|${m}`), { ops })
    if (!r.k) { sinOperaciones++; continue }
    const ocupadas = ops.reduce((s, o) => s + o.x - o.e, 0), p = r.k / (tab.hasta - tab.desde + 1 - ocupadas)
    const rnd = rndDe(`${semilla}|copias|${m}`), sims = new Float64Array(copias)
    for (let s = 0; s < copias; s++) sims[s] = cagrDe(sortea(tab, mv, p, rnd).f, a)
    if (percentilDe(sims, cagrDe(r.f, a)) >= REGLA_AZAR_REGLAS.gana) aprobados++
  }
  return { mercados, aprobados, sinOperaciones, pct: aprobados / mercados * 100, intervalo: intervaloWilson(aprobados, mercados), tasa }
}

// periodos: [{ percentil, operaciones }] (uno por periodo de la regla). aprobadosFalsos: el % de fiabilidad() (o una lista: manda el
// peor).
export function veredicto({ aprobadosFalsos, periodos }) {
  const R = REGLA_AZAR_REGLAS, af = Math.max(...[].concat(aprobadosFalsos))
  const pocasOperaciones = periodos.some(p => (p.operaciones || 0) < R.pocasOperaciones)
  const v = af >= R.sinVeredicto ? 'sinVeredicto' : periodos.length === R.periodos.length && periodos.every(p => p.percentil != null && p.percentil >= R.gana) ? 'pasa' : 'noPasa'
  return { veredicto: v, texto: TEXTO_VEREDICTO_REGLAS[v], pocasOperaciones }
}
