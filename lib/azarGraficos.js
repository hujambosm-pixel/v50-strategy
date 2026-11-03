// lib/azarGraficos.js — los datos del gráfico «Cómo creció el dinero, frente al azar» del resultado del paso 2 (docs/builder.md, §61). NO son la prueba: no entran en el
// veredicto, ni en la foto, ni en ninguna huella; se guardan aparte (tabla pruebas_azar_graficos, sql/pruebas_azar_graficos.sql).
//
//   calculaGraficos(prueba, precios)   por cada pestaña (2016–2025 completo y los dos periodos de la regla), lo ÚNICO que se guarda: las 5 líneas del abanico y las operaciones de las
//                                      3 copias (la mejor, la típica y la peor). Cada periodo, con la MISMA semilla de la prueba: son las mismas 1.000 copias del veredicto. El completo no
//                                      existía: se simula con las mismas reglas (tasa de entradas, apertura siguiente, reglas y stops de la estrategia, sin filtro de mercado, cierre el último
//                                      día, sin comisiones ni impuestos) y una semilla derivada; también guarda su percentil, que no sale de ningún otro sitio.
//   vistaPestana(prueba, precios, g)   lo que pinta una pestaña: el valor de tu estrategia y de las 3 copias vela a vela (10.000 € al empezar) y sus cifras, recalculados con los precios y lo guardado.
//   estadisticas(velas, i0, i1, ops)   la serie y Final, Operaciones, Ganadoras, Peor caída y Tiempo dentro.
import { REGLA_AZAR_REGLAS, copiasConOperaciones, operacionesDelPeriodo } from './azarReglas'
import { preparaPeriodo, tickersDe, velasDe } from './pruebaAzar'
import { valoresDe } from './editor/definicion'
import { huella } from './lotesLab'

export const FORMATO_GRAFICOS = 1
export const DINERO_INICIAL = 10000
export const PERCENTILES_ABANICO = [5, 25, 50, 75, 95]
const PASO_ABANICO = 5   // un punto de cada 5 velas (y el último): el gráfico no necesita más y ocupa una quinta parte
const params = (p) => { try { return typeof p === 'string' ? JSON.parse(p || '{}') : (p || {}) } catch (_) { return {} } }
const ceder = () => new Promise(r => setTimeout(r, 0))

// El percentil de una lista ya ordenada: la copia número ⌈p/100 · n⌉ de menor a mayor (el mismo listón que el veredicto).
export const percentilOrdenado = (s, p) => s[Math.max(0, Math.ceil(p / 100 * s.length) - 1)]
// Las pestañas: la completa primero. prueba.periodos: los de la regla.
export const pestanasDe = (prueba) => {
  const ps = (prueba.periodos || []).map(([desde, hasta]) => ({ clave: desde, desde, hasta, nombre: `${desde.slice(0, 4)}–${hasta.slice(0, 4)}`, completo: false }))
  return [{ clave: 'completo', desde: ps[0].desde, hasta: ps[ps.length - 1].hasta, nombre: `${ps[0].desde.slice(0, 4)}–${ps[ps.length - 1].hasta.slice(0, 4)}`, completo: true }, ...ps]
}
function contexto(prueba, precios) {
  const foto = prueba.estrategia_foto, def = foto.definition, valores = valoresDe(def, params(foto.params)), intervalo = prueba.velas === 'semanales' ? 'semanal' : 'diario'
  const tickers = tickersDe(def)
  return { def, valores, intervalo, velasValor: velasDe(precios?.[prueba.valor], prueba.velas), referencias: Object.fromEntries(tickers.map(t => [t, velasDe(precios?.[t], prueba.velas)])) }
}
const periodoDe = (c, t) => preparaPeriodo({ def: c.def, valores: c.valores, velasValor: c.velasValor, referencias: c.referencias, desde: t.desde, hasta: t.hasta, intervalo: c.intervalo })

// El valor (por 1 al empezar) al cierre de cada vela de i0 a i1, con todo el dinero en cada operación. ops: [{ e, x, entrada, salida }], sin solaparse y en orden. La abierta, al cierre; el día de la venta, su precio.
export function serieValor(velas, i0, i1, ops) {
  const v = new Float64Array(i1 - i0 + 1)
  let f = 1, k = 0
  for (let j = i0; j <= i1; j++) {
    let actual = f
    while (k < ops.length && ops[k].e <= j) {
      const o = ops[k]
      if (j >= o.x) { f *= o.salida / o.entrada; actual = f; k++ } else { actual = f * velas[j].close / o.entrada; break }
    }
    v[j - i0] = actual
  }
  return v
}
// Las cifras de la tabla de velas: final (con DINERO_INICIAL), operaciones, % de ganadoras, peor caída vela a vela (en %) y % del tiempo dentro del valor.
export function estadisticas(velas, i0, i1, ops) {
  const v = serieValor(velas, i0, i1, ops), n = v.length
  let pico = 1, dd = 0
  for (let j = 0; j < n; j++) { if (v[j] > pico) pico = v[j]; else if (1 - v[j] / pico > dd) dd = 1 - v[j] / pico }
  let dentro = 0
  for (const o of ops) dentro += Math.min(o.x, i1) - Math.max(o.e, i0) + 1
  return { serie: Array.from(v, x => x * DINERO_INICIAL), final: v[n - 1] * DINERO_INICIAL, operaciones: ops.length, ganadoras: ops.length ? ops.filter(o => o.salida > o.entrada).length / ops.length * 100 : null, caida: dd * 100, dentro: dentro / n * 100 }
}

async function calculaPestana(prueba, c, t) {
  const base = `pruebaAzar|${prueba.semilla}`, semilla = t.completo ? `${base}|completo|copias` : `${base}|${t.desde}|copias`   // los periodos, la semilla del veredicto
  const x = periodoDe(c, t)
  if (!x.bars.length) throw new Error(`No hay velas de ${prueba.valor} en ${t.nombre}.`)
  const r = copiasConOperaciones(x.bars, { definicion: c.def, params: c.valores, ctx: { referencias: x.refs } }, x.reales, { n: REGLA_AZAR_REGLAS.copias, semilla, desde: t.desde, hasta: t.hasta })
  const { i0, i1, precio } = r, velas = x.bars, N = i1 - i0 + 1
  const puntos = []; for (let j = 0; j < N; j += PASO_ABANICO) puntos.push(j); if (puntos[puntos.length - 1] !== N - 1) puntos.push(N - 1)
  const nC = r.copias.length, m = new Float32Array(puntos.length * nC)
  r.copias.forEach((cp, s) => {
    const v = serieValor(velas, i0, i1, cp.ops.map(o => ({ e: o.e, x: o.x, entrada: velas[o.e].open, salida: precio[o.e] })))
    puntos.forEach((j, k) => { m[k * nC + s] = v[j] })
  })
  const abanico = Object.fromEntries(PERCENTILES_ABANICO.map(p => [`p${p}`, []]))
  puntos.forEach((_, k) => { const s = Float32Array.from(m.subarray(k * nC, (k + 1) * nC)).sort(); for (const p of PERCENTILES_ABANICO) abanico[`p${p}`].push(Math.round(percentilOrdenado(s, p) * DINERO_INICIAL)) })
  const orden = r.copias.map((cp, i) => [cp.cagr, i]).sort((a, b) => a[0] - b[0] || a[1] - b[1])   // como la copia típica del resultado
  const opsDe = (i) => r.copias[i].ops.map(o => [velas[o.e].date, velas[o.x].date, precio[o.e]])
  return { fechas: puntos.map(j => velas[i0 + j].date), abanico, copias: { mejor: opsDe(orden[nC - 1][1]), tipica: opsDe(orden[(nC - 1) >> 1][1]), peor: opsDe(orden[0][1]) }, ...(t.completo ? { percentil: r.percentil } : {}) }
}
export async function calculaGraficos(prueba, precios, { cede = ceder } = {}) {
  const c = contexto(prueba, precios), pestanas = {}
  for (const t of pestanasDe(prueba)) { pestanas[t.clave] = await calculaPestana(prueba, c, t); await cede() }
  return { formato: FORMATO_GRAFICOS, pestanas }
}

export function vistaPestana(prueba, precios, g, clave) {
  const c = contexto(prueba, precios), t = pestanasDe(prueba).find(x => x.clave === clave), x = periodoDe(c, t), velas = x.bars
  const { i0, i1, ops } = operacionesDelPeriodo(velas, x.reales, { desde: t.desde, hasta: t.hasta })
  const idx = new Map(velas.map((b, i) => [b.date, i]))
  const deCopia = (lista) => lista.map(([fe, fx, salida]) => { const e = idx.get(fe); return { e, x: idx.get(fx), entrada: velas[e].open, salida } })
  const copias = Object.fromEntries(Object.entries(g.copias).map(([k, lista]) => { const o = deCopia(lista); return [k, { ops: o, ...estadisticas(velas, i0, i1, o) }] }))
  return { pestana: t, velas, i0, i1, fechas: velas.slice(i0, i1 + 1).map(b => b.date), abanico: g.abanico, fechasAbanico: g.fechas, percentil: g.percentil ?? null, estrategia: { ops, ...estadisticas(velas, i0, i1, ops) }, copias }
}
// ¿Son los mismos precios con los que se congeló la prueba? (la huella del resultado). Si no, lo que se dibuja ya no es exactamente lo que se midió.
export async function mismosPrecios(prueba, resultado, precios) {
  const vs = velasDe(precios?.[prueba.valor], prueba.velas), u = resultado.precios
  if (!u) return true
  return (await huella(vs.filter(b => b.date >= u.primera && b.date <= u.ultima).map(b => [b.date, b.open, b.high, b.low, b.close]))) === u.huella
}

// ── La base ──
const jsonDe = async (r, que) => { if (!r.ok) throw new Error(`No se pudo ${que} (HTTP ${r.status}).`); return r.json() }
export async function leerGraficos({ url, headers, fetch: f = fetch }, pruebaId) {
  const r = await f(`${url}/rest/v1/pruebas_azar_graficos?select=datos&prueba_id=eq.${Number(pruebaId)}&limit=1`, { headers })
  return (await jsonDe(r, 'leer el gráfico'))[0]?.datos || null
}
// Si ya los tiene, se queda con los que había.
export async function guardarGraficos(ctx, pruebaId, datos, version = null) {
  const { url, headers, fetch: f = fetch } = ctx
  const r = await f(`${url}/rest/v1/pruebas_azar_graficos?on_conflict=prueba_id`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'resolution=ignore-duplicates,return=representation' }, body: JSON.stringify({ prueba_id: pruebaId, datos, version_app: version }) })
  if (r.status !== 409) { const j = await jsonDe(r, 'guardar el gráfico'); if (j?.[0]) return j[0].datos }
  return (await leerGraficos(ctx, pruebaId)) || datos
}
