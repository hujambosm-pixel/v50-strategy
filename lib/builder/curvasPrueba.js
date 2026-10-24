// lib/builder/curvasPrueba.js — la CURVA Y LAS COPIAS AL AZAR que guarda una prueba nueva del paso 2 (V9.1051; docs/builder.md,
// §17). Puro. Ninguna cifra sale de aquí: el veredicto, el CAGR, la caída y los percentiles son los de siempre (guardados aparte);
// esto solo guarda lo necesario para DIBUJARLOS.
//   Laboratorio de cartera, por periodo: { fechas, capitalIni, estrategia, copias: [40 curvas], qqq } con cada curva en puntos
//   (el dinero ÷ el dinero inicial × 10 000, redondeado: 10 000 = lo de partida). Las 40 copias son de la prueba A (señal al
//   azar) y van repartidas de peor a mejor por su dinero final, no al azar, para que se vea todo el rango.
//   Laboratorio de operaciones, por periodo: copias.medias, la ganancia media por operación de cada copia (la de lib/editor/
//   laboratorio.js).
export const N_COPIAS_DIBUJO = 40
export const PUNTOS = 10000
const aPuntos = (vals, base) => Array.from(vals, v => Number.isFinite(v) && base > 0 ? Math.round(v / base * PUNTOS) : null)

// Los índices de n copias repartidas de peor a mejor por su dinero final (sin repetir).
export function eligeCopias(curvas, n = N_COPIAS_DIBUJO) {
  const finales = curvas.map((c, i) => ({ i, f: c && c.length ? c[c.length - 1] : NaN })).filter(x => Number.isFinite(x.f)).sort((a, b) => a.f - b.f || a.i - b.i)
  if (finales.length <= n) return finales.map(x => x.i)
  const out = []
  for (let k = 0; k < n; k++) { const x = finales[Math.round(k * (finales.length - 1) / (n - 1))].i; if (!out.includes(x)) out.push(x) }
  return out
}
// El QQQ comprar y mantener llevado a las fechas del eje (el último valor con fecha <= la del eje), en puntos desde la primera.
export function qqqEnEje(curva, fechas) {
  if (!curva?.length || !fechas?.length) return null
  const vals = []
  let j = -1
  for (const f of fechas) { while (j + 1 < curva.length && curva[j + 1].date <= f) j++; vals.push(j >= 0 ? curva[j].value : null) }
  const base = vals.find(v => Number.isFinite(v) && v > 0)
  return base ? aPuntos(vals.map(v => v ?? NaN), base) : null
}
// Lo que se guarda de un periodo del laboratorio de cartera.
export function curvasDelPeriodo({ fechas, capitalIni, real, sims, qqq = null }) {
  return { fechas: [...fechas], capitalIni, estrategia: aPuntos(real, capitalIni), copias: eligeCopias(sims).map(i => aPuntos(sims[i], capitalIni)), qqq: qqqEnEje(qqq, fechas) }
}

// ── Para dibujar ──
// La caída desde el máximo (en %, negativa) de una curva en puntos, y la caída máxima con su posición.
export function caidas(curva) {
  let pico = -Infinity, peor = 0, iPeor = -1
  const out = curva.map((v, i) => { if (v == null) return null; if (v > pico) pico = v; const dd = pico > 0 ? (v - pico) / pico * 100 : 0; if (dd < peor) { peor = dd; iPeor = i } return dd })
  return { serie: out, maxima: -peor, i: iPeor }
}
// El histograma de las medias de las copias: barras iguales que cubren de la menor a la mayor (y la de la estrategia, si queda fuera).
export function histograma(medias, nBarras = 30, incluir = []) {
  const xs = medias.filter(Number.isFinite)
  if (!xs.length) return { barras: [], min: 0, max: 0, n: 0 }
  let min = Math.min(...xs, ...incluir.filter(Number.isFinite)), max = Math.max(...xs, ...incluir.filter(Number.isFinite))
  if (max === min) { min -= 0.001; max += 0.001 }
  const ancho = (max - min) / nBarras, barras = Array.from({ length: nBarras }, (_, k) => ({ desde: min + k * ancho, hasta: min + (k + 1) * ancho, n: 0 }))
  for (const x of xs) barras[Math.min(nBarras - 1, Math.floor((x - min) / ancho))].n++
  return { barras, min, max, n: xs.length }
}
// Cuántas copias quedan por debajo de x (de peor a mejor), como el percentil de lib/azar.js, en «de cada 1.000».
export const deCada = (percentil, total) => percentil == null ? null : Math.round(percentil / 100 * total)

// ── Lo que se guarda (V9.1051): compacto, para que quepa en el registro (lab_pruebas: como mucho 50 KB por fila) ──
// Una serie de enteros se guarda como texto con sus DIFERENCIAS («10000,12,-3,…»: el primero y luego lo que cambia cada día).
// Las fechas, como la primera y los días que pasan entre una y la siguiente. Las copias, cada `paso` días (y el último), en
// milésimas del dinero inicial; la estrategia y el QQQ, todos los días, en diezmilésimas (los puntos). Si no cabe, el paso crece.
export const LIMITE_FILA = 46 * 1024
const aDif = (xs) => xs.map((v, i) => v == null ? '' : i && xs[i - 1] != null ? String(v - xs[i - 1]) : `=${v}`).join(',')
const deDif = (s) => { let ant = null; return String(s || '').split(',').map(t => { if (t === '') { ant = null; return null } ant = t[0] === '=' ? Number(t.slice(1)) : (ant ?? 0) + Number(t); return ant }) }
const diasEntre = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5)
export function codificaCurvas(c) {
  const n = c.fechas.length
  for (const paso of [5, 10, 15, 20, 30, 45, 60]) {
    const idx = []; for (let i = 0; i < n; i += paso) idx.push(i); if (idx[idx.length - 1] !== n - 1) idx.push(n - 1)
    const res = { v: 1, capitalIni: c.capitalIni, desde: c.fechas[0], dias: c.fechas.slice(1).map((f, i) => diasEntre(c.fechas[i], f)).join(','), estrategia: aDif(c.estrategia), qqq: c.qqq ? aDif(c.qqq) : null,
      paso, copias: c.copias.map(s => aDif(idx.map(i => s[i] == null ? null : Math.round(s[i] / 10)))) }
    if (JSON.stringify(res).length <= LIMITE_FILA) return res
  }
  return { v: 1, capitalIni: c.capitalIni, desde: c.fechas[0], dias: c.fechas.slice(1).map((f, i) => diasEntre(c.fechas[i], f)).join(','), estrategia: aDif(c.estrategia), qqq: null, paso: 0, copias: [] }
}
// Lo guardado, para dibujar: { fechas, capitalIni, estrategia, qqq, copias, iCopias } (copias en puntos, en los días iCopias).
export function decodificaCurvas(r) {
  if (!r || r.v !== 1) return null
  const fechas = [r.desde]
  for (const d of String(r.dias || '').split(',').filter(Boolean)) fechas.push(new Date(Date.parse(fechas[fechas.length - 1] + 'T00:00:00Z') + Number(d) * 864e5).toISOString().slice(0, 10))
  const n = fechas.length, iCopias = []
  if (r.paso > 0) { for (let i = 0; i < n; i += r.paso) iCopias.push(i); if (iCopias[iCopias.length - 1] !== n - 1) iCopias.push(n - 1) }
  return { fechas, capitalIni: r.capitalIni, estrategia: deDif(r.estrategia), qqq: r.qqq ? deDif(r.qqq) : null, copias: (r.copias || []).map(s => deDif(s).map(v => v == null ? null : v * 10)), iCopias }
}
// Las medias de las copias del laboratorio de operaciones, en millonésimas (0,0001 %), como texto con diferencias.
// Ordenadas de menor a mayor (para el histograma el orden no importa y así las diferencias son pequeñas); sinDato: las copias
// que no operaron.
export const codificaMedias = (ms) => { const xs = ms.filter(Number.isFinite).map(x => Math.round(x / 1e-6)).sort((a, b) => a - b); return { v: 1, unidad: 1e-6, n: ms.length, sinDato: ms.length - xs.length, medias: aDif(xs) } }
export const decodificaMedias = (c) => c?.v === 1 ? deDif(c.medias).map(x => x == null ? null : x * c.unidad) : (Array.isArray(c?.medias) ? c.medias : null)
