// lib/builder/marcas.js — dónde van las marcas de «Señales en el gráfico» (V9.1069; docs/builder.md, §35). Puro: el componente
// (components/BuilderSenales.js, Graficos) solo dibuja lo que sale de aquí.
// Las marcas de lightweight-charts 4.2 («aboveBar» / «belowBar») van pegadas a la vela y no dejan elegir el hueco, y los puntos de la
// señal iban en el cierre, encima del cuerpo. Ahora cada marca tiene su PRECIO, en carriles fuera de la vela:
//   · por encima del máximo, de abajo arriba: el punto de swing de máximos, el de los máximos de la línea bajista (V9.1077), el punto
//     de la señal de compra, el de la señal de venta y la flecha de venta;
//   · por debajo del mínimo, de arriba abajo: el punto de swing de mínimos y la flecha de compra.
// Solo ocupan carril las marcas que hay en esa vela. El primer carril queda a medio ATR (14) de la vela, y cada uno a 0,7 ATR del
// anterior: así no se tapan entre ellas cuando coinciden en la misma vela. Sin ATR (las primeras velas), el rango de la vela.
import { atr } from '../condiciones/indicadores'

export const HUECO_ATR = 0.5, PASO_ATR = 0.7
const ARRIBA = ['swingMax', 'lineaMax', 'senalCompra', 'senalVenta', 'venta'], ABAJO = ['swingMin', 'compra']
// velas: [{ date, high, low, … }]; r: { compras, ventas, puntosSenal, puntosSwing, puntosLinea } como lib/builder/senales.js.
// Devuelve { compra, venta, senalCompra, senalVenta, swingMax, swingMin, lineaMax }: cada una [{ time, value }] por fecha, sin repetidas y en
// orden.
export function colocaMarcas(velas, r) {
  const a = atr(velas, 14), idx = new Map(velas.map((v, k) => [v.date, k]))
  const fechas = {
    compra: (r.compras || []).map(c => c.date), venta: (r.ventas || []).map(c => c.date),
    senalCompra: (r.puntosSenal || []).filter(p => p.lado === 'compra').map(p => p.date), senalVenta: (r.puntosSenal || []).filter(p => p.lado === 'venta').map(p => p.date),
    swingMax: (r.puntosSwing || []).filter(p => p.lado === 'max').map(p => p.date), swingMin: (r.puntosSwing || []).filter(p => p.lado === 'min').map(p => p.date),
    lineaMax: (r.puntosLinea || []).map(p => p.date),   // V9.1077
  }
  const hay = Object.fromEntries(Object.entries(fechas).map(([t, fs]) => [t, new Set(fs)]))
  const out = {}
  for (const [tipo, fs] of Object.entries(fechas)) {
    const arriba = ARRIBA.includes(tipo), orden = arriba ? ARRIBA : ABAJO
    out[tipo] = [...new Set(fs)].filter(d => idx.has(d)).sort().map(d => {
      const k = idx.get(d), v = velas[k], u = a[k] ?? (v.high - v.low > 0 ? v.high - v.low : Math.abs(v.close || v.high) * 0.01)
      const carril = orden.slice(0, orden.indexOf(tipo)).filter(t => hay[t].has(d)).length
      const dist = (HUECO_ATR + PASO_ATR * carril) * u
      return { time: d, value: arriba ? v.high + dist : v.low - dist }
    })
  }
  return out
}
