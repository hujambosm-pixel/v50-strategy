// lib/screener/opciones.js — las CIFRAS FIJAS del desplegable de cada filtro (docs/screener.md §15; boceto bocetos/screener-arriba.html,
// opción A decidida por Sergi el 11/11: «desplegable con cifras fijas + Otra cifra…», como Finviz). Lógica PURA.
// Cada filtro numérico: primero las cifras con su sentido de siempre (el op por defecto del catálogo) y después unas pocas con el
// sentido contrario (p. ej. «PER ≥ 30» para la vista «Alerta de precio caro»). Las EMA, con palabras («Por encima», «5 % o más por
// debajo»…). «Da señal de compra…»: cuántas velas. Una cifra que no está en la lista se ve como «≥ 27 % (tuya)».
import { fmt } from './filtros'

// [cifras con el op por defecto, cifras con el contrario]
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
// Las EMA (precio frente a su media, en %): con palabras.
export const EMA_OPC = Object.freeze([
  ['Por encima', '≥', 0], ['Por debajo', '≤', 0],
  ['5 % o más por encima', '≥', 5], ['10 % o más por encima', '≥', 10], ['20 % o más por encima', '≥', 20],
  ['5 % o más por debajo', '≤', -5], ['10 % o más por debajo', '≤', -10],
])
const UNIDAD = { '%': ' %', veces: ' veces', M: ' M', puntos: ' puntos' }
const contrario = (op) => (op === '≥' ? '≤' : '≥')
// Una cifra fija con los decimales justos: 25 → «25», 1,5 → «1,5», 0,25 → «0,25».
export const fmtFija = (x) => fmt(x, Number.isInteger(x) ? 0 : Math.round(x * 10) === x * 10 ? 1 : 2)
export const textoCondicion = (f, op, valor) => f.conEstrategia ? `${valor} vela${valor === 1 ? '' : 's'}` : `${op} ${fmtFija(valor)}${UNIDAD[f.unidad] || ''}`

// Las opciones del desplegable: [{ texto, op, valor }].
export function opcionesDe(f) {
  if (f.id.startsWith('ema')) return EMA_OPC.map(([texto, op, valor]) => ({ texto, op, valor }))
  const [a, b] = FIJAS[f.id] || [[], []]
  return [...a.map(valor => ({ op: f.op, valor })), ...b.map(valor => ({ op: contrario(f.op), valor }))]
    .map(o => ({ ...o, texto: textoCondicion(f, o.op, o.valor) }))
}
// Cuál de las opciones es la de esta configuración c = { on, op, valor } (índice; −1 si es una cifra tuya o está apagado).
export const opcionElegida = (f, c) => !c?.on ? -1 : opcionesDe(f).findIndex(o => o.op === (f.conEstrategia ? f.op : c.op) && o.valor === c.valor)
// El texto corto de un filtro encendido (en la línea de los encendidos, con «Filtros ▲»).
export const textoEncendido = (f, c) => { const i = opcionElegida(f, c); return i >= 0 ? opcionesDe(f)[i].texto : textoCondicion(f, c.op, c.valor) }
