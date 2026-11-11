// lib/screener/opciones.js — las CIFRAS del desplegable de cada filtro (docs/screener.md §15 y §17). Lógica PURA.
// §15 (11/11): cifras fijas como Finviz. §17 (11/11, pedido por Sergi): las cifras se pueden CAMBIAR (✎), QUITAR (🗑), AÑADIR y
// volver a «las de fábrica». Las tuyas se guardan en tus ajustes (settings.screenerCifras = { id del filtro: [[op, cifra], …] }; un
// filtro sin entrada usa las de fábrica) y valen en todas las vistas. La lista se ORDENA SOLA (ordenaCifras): primero las del
// sentido de siempre del filtro (su op por defecto) y luego las del contrario; dentro de cada grupo, de menor a mayor (en las EMA,
// de más cerca a más lejos de la media: «Por encima», «5 % o más por encima»…).
// «Da señal de compra…»: cuántas velas (no se editan). Una cifra de una vista que no está en tu lista se ve igual y sigue valiendo.
import { fmt } from './filtros'

// Las de fábrica: [cifras con el op por defecto, cifras con el contrario]. Las EMA, en EMA_FABRICA.
export const FIJAS = Object.freeze({
  roce: [[10, 15, 20, 25, 30, 40], [10, 20]],
  roa: [[5, 8, 10, 15, 20], [5]],
  roe: [[10, 15, 20, 25, 30], [10]],
  roeMejora: [[-5, 0, 2, 5, 10], [0]],
  cajaCubre: [[0.5, 1, 1.5, 2, 3], [1]],
  cobInt: [[1, 3, 5, 10, 20], [3]],
  deudaNeta: [[-1000, 0, 1000, 5000], [0]],
  de: [[0.25, 0.5, 1, 1.5, 2], [1]],
  ventas5: [[0, 25, 50, 100, 200], [0]],
  fcf: [[0, 100, 1000], [0]],
  per: [[10, 15, 20, 25, 30, 40, 50], [20, 30, 40, 50]],
  pegPas: [[0.5, 1, 1.5, 2, 3], [2, 3]],
  pegEsp: [[0.5, 1, 1.5, 2, 3], [2, 3]],
  psSector: [[-25, 0, 25, 50], [0, 50, 100]],
  dist52: [[1, 3, 5, 10, 20, 30], [20, 30, 50]],
  rvol: [[1, 1.5, 2, 3, 5], [1]],
  sector: [[-5, 0, 3, 5], [0]],
  senal: [[1, 2, 3, 5, 10, 20], []],
})
// Las EMA (precio frente a su media, en %): [op, cifra]; el texto se escribe con palabras (textoEma).
export const EMA_FABRICA = Object.freeze([['≥', 0], ['≥', 5], ['≥', 10], ['≥', 20], ['≤', 0], ['≤', -5], ['≤', -10]])
const esEma = (f) => f.id.startsWith('ema')
const UNIDAD = { '%': ' %', veces: ' veces', M: ' M', puntos: ' puntos' }
const contrario = (op) => (op === '≥' ? '≤' : '≥')
// Una cifra con los decimales justos: 25 → «25», 1,5 → «1,5», 0,25 → «0,25».
export const fmtFija = (x) => fmt(x, Number.isInteger(x) ? 0 : Math.round(x * 10) === x * 10 ? 1 : 2)
// Las EMA con palabras. ≥ 0 «Por encima» · ≥ 5 «5 % o más por encima» · ≤ −5 «5 % o más por debajo» · ≥ −5 «Por encima o hasta 5 %
// por debajo» · ≤ 5 «Por debajo o hasta 5 % por encima».
export function textoEma(op, v) {
  if (v === 0) return op === '≥' ? 'Por encima' : 'Por debajo'
  const a = fmtFija(Math.abs(v))
  if (op === '≥') return v > 0 ? `${a} % o más por encima` : `Por encima o hasta ${a} % por debajo`
  return v < 0 ? `${a} % o más por debajo` : `Por debajo o hasta ${a} % por encima`
}
export const textoCondicion = (f, op, valor) => f.conEstrategia ? `${valor} vela${valor === 1 ? '' : 's'}`
  : esEma(f) ? textoEma(op, valor) : `${op} ${fmtFija(valor)}${UNIDAD[f.unidad] || ''}`

// El orden de la lista: el sentido de siempre primero; dentro, de menor a mayor (las EMA, por lo lejos que está de la media).
export function ordenaCifras(f, lista) {
  const clave = (x) => [x[0] === f.op ? 0 : 1, esEma(f) ? Math.abs(x[1]) : x[1]]
  return [...lista].sort((a, b) => { const A = clave(a), B = clave(b); return A[0] - B[0] || A[1] - B[1] })
}
// Una lista de cifras válida (las de los ajustes pueden venir de otra versión): [[op, cifra finita]], sin repetir, ordenada.
export function limpiaCifras(f, lista) {
  if (!Array.isArray(lista)) return null
  const vistas = new Set(), r = []
  for (const x of lista) {
    if (!Array.isArray(x) || (x[0] !== '≥' && x[0] !== '≤')) continue
    const v = Number(x[1]); if (!Number.isFinite(v)) continue
    const k = x[0] + v; if (vistas.has(k)) continue
    vistas.add(k); r.push([x[0], v])
  }
  return ordenaCifras(f, r)
}
// Las de fábrica de un filtro, como [[op, cifra]].
export function cifrasFabrica(f) {
  if (esEma(f)) return ordenaCifras(f, EMA_FABRICA.map(x => [...x]))
  const [a, b] = FIJAS[f.id] || [[], []]
  return ordenaCifras(f, [...a.map(v => [f.op, v]), ...b.map(v => [contrario(f.op), v])])
}
// Las cifras de un filtro: las tuyas (propias = settings.screenerCifras) si las hay; si no, las de fábrica. Las velas de «Da señal
// de compra…» no se editan.
export const cifrasDe = (f, propias) => (!f.conEstrategia && limpiaCifras(f, propias?.[f.id])) || cifrasFabrica(f)

// Las opciones del desplegable: [{ texto, op, valor }].
export const opcionesDe = (f, propias) => cifrasDe(f, propias).map(([op, valor]) => ({ op, valor, texto: textoCondicion(f, op, valor) }))
// Cuál de las opciones es la de esta configuración c = { on, op, valor } (índice; −1 si no está en la lista o está apagado).
export const opcionElegida = (f, c, propias) => !c?.on ? -1 : opcionesDe(f, propias).findIndex(o => o.op === (f.conEstrategia ? f.op : c.op) && o.valor === c.valor)
// El texto de un filtro encendido (en la caja cerrada y en la línea de los encendidos con «Filtros ▲»).
export const textoEncendido = (f, c) => textoCondicion(f, f.conEstrategia ? f.op : c.op, c.valor)

// Cambios en la lista de un filtro (devuelven la lista nueva ya ordenada; la pantalla la guarda en tus ajustes).
export const conCifra = (f, lista, op, valor) => limpiaCifras(f, [...lista, [op, valor]])
export const sinCifra = (f, lista, k) => limpiaCifras(f, lista.filter((_, i) => i !== k))
export const cambiaCifra = (f, lista, k, op, valor) => limpiaCifras(f, lista.map((x, i) => i === k ? [op, valor] : x))
