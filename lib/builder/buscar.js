// lib/builder/buscar.js — los buscadores por texto del Builder (V9.1058; docs/builder.md, §24). Puro.
// Sin distinguir mayúsculas ni acentos: cada palabra de lo escrito tiene que estar en alguno de los textos («nvidia», «NVDA»,
// «retroceso rsi»…). Sin nada escrito, todo coincide.
export const sinTildes = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
export function coincide(consulta, ...textos) {
  const palabras = sinTildes(consulta).split(/\s+/).filter(Boolean)
  if (!palabras.length) return true
  const todo = textos.map(sinTildes).join(' ')
  return palabras.every(p => todo.includes(p))
}
// Los valores ([{ simbolo, nombre }]) que coinciden por ticker o por nombre. Primero el ticker igual a lo escrito, después los
// tickers que empiezan por ello y después el resto, cada grupo en su orden.
export function filtraValores(valores, consulta) {
  const q = sinTildes(consulta).trim()
  if (!q) return valores
  const puesto = (v) => { const s = sinTildes(v.simbolo); return s === q ? 0 : s.startsWith(q) ? 1 : 2 }
  return valores.map((v, k) => [v, k]).filter(([v]) => coincide(q, v.simbolo, v.nombre)).sort((a, b) => puesto(a[0]) - puesto(b[0]) || a[1] - b[1]).map(x => x[0])
}
// Los nombres de los valores: de la lista de seguimiento (watchlist: symbol, name) y, si no está ahí, del universo
// (universo_miembros: simbolo_yahoo, nombre). Devuelve [{ simbolo, nombre }] en el orden de simbolos.
export function conNombres(simbolos, watchlist = [], universo = []) {
  const nombres = new Map()
  for (const u of universo || []) if (u?.simbolo_yahoo && u.nombre && !nombres.has(u.simbolo_yahoo)) nombres.set(u.simbolo_yahoo, u.nombre)
  const deLista = new Map()
  for (const w of watchlist || []) if (w?.symbol && w.name && !deLista.has(w.symbol)) deLista.set(w.symbol, w.name)
  return simbolos.map(s => ({ simbolo: s, nombre: deLista.get(s) || nombres.get(s) || '' }))
}
// V9.1063: un texto en trozos, con las palabras de lo escrito marcadas allí donde aparecen (sin distinguir mayúsculas ni acentos,
// como coincide): [{ t, marca }] en orden, para resaltarlas en cada resultado. Sin nada escrito, el texto entero sin marca.
export function trozosResaltados(texto, consulta) {
  const s = String(texto ?? ''), plano = s.split('').map(ch => sinTildes(ch).charAt(0) || ch).join('')   // un carácter por carácter
  const marca = new Array(s.length).fill(false)
  for (const p of sinTildes(consulta).split(/\s+/).filter(Boolean)) for (let i = plano.indexOf(p); i >= 0; i = plano.indexOf(p, i + 1)) marca.fill(true, i, i + p.length)
  const out = []
  for (let i = 0; i < s.length; i++) { const u = out[out.length - 1]; if (u && u.marca === marca[i]) u.t += s[i]; else out.push({ t: s[i], marca: marca[i] }) }
  return out
}
