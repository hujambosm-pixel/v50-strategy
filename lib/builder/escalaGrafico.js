// lib/builder/escalaGrafico.js — piezas de los gráficos en escala logarítmica: las marcas del eje y las etiquetas al final de las líneas, sin pisarse (el paso 3 y el resultado del paso 2).
// Las etiquetas al final de las líneas, sin pisarse: de arriba abajo, cada una al menos SEP por debajo de la anterior; y si la
// última se sale por abajo, se suben las de encima lo justo.
const SEP = 16
export function separaEtiquetas(etq, arriba, abajo) {
  const xs = etq.map(e => ({ ...e })).sort((a, b) => a.y - b.y)
  for (let k = 0; k < xs.length; k++) xs[k].y = Math.max(xs[k].y, arriba, k ? xs[k - 1].y + SEP : -Infinity)
  for (let k = xs.length - 1, tope = abajo; k >= 0; k--) { xs[k].y = Math.min(xs[k].y, tope); tope = xs[k].y - SEP }
  return xs
}
// Las marcas del eje en escala logarítmica (en euros): 1, 2 y 5 por cada potencia de 10 que caiga dentro (solo las de 1 si salen
// demasiadas); si salen menos de tres, cuatro repartidas a la misma distancia.
export function marcasLog(lo, hi) {
  const out = []
  for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++) for (const m of [1, 2, 5]) { const v = m * 10 ** e; if (v >= lo && v <= hi) out.push(v) }
  const solo1 = out.filter(v => Math.abs(Math.log10(v) - Math.round(Math.log10(v))) < 1e-9)
  if (out.length > 6 && solo1.length >= 3) return solo1
  if (out.length >= 3) return out
  return [0, 1, 2, 3].map(k => lo * (hi / lo) ** (k / 3))
}
