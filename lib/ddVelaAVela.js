// lib/ddVelaAVela.js — el dinero de la regla VELA A VELA, con la operación abierta marcada a mercado al cierre de cada vela
// (V9.1069; docs/builder.md, §35). Lo usan la fila «Max Drawdown (vela a vela)» y el minigráfico «Cómo habría crecido 100» del
// paso 1 (lib/builder/ensayo.js) y la fila «Max Drawdown (vela a vela)» de «Backtest de un valor» (pages/index.js). NO lo usan
// calcMetrics (su ddComp/ddSimple, solo con el dinero de las operaciones cerradas, sigue igual para el ranking, la optimización y
// las carteras), los laboratorios, la multicartera ni las pruebas congeladas.
//
// Las mismas cuentas que buildTrades (lib/nucleoBacktest.js): la operación i entra con el capital compuesto que dejó la i−1 (o el
// inicial), asignado = ese capital × asignación, menos la comisión de compra; sus acciones = lo invertido / precio de compra. Mientras
// está abierta vale (lo de antes − comisión de compra) + acciones × (cierre de la vela − precio de compra). El día de la venta, su
// capitalTras (precio de venta y comisión de venta). La simple, igual con el capital fijo. Una operación que sube de 100 a 120, cae a
// 90 y se vende a 110 da una caída máxima del 25 % (de 120 a 90), no 0.
import { comisionDe } from './comisiones'

export function curvasVelaAVela(trades, velas, capitalIni, { comisiones = null, allocationPct = 100 } = {}) {
  const fijo = capitalIni * allocationPct / 100, comS = comisionDe({ importeCompra: fijo }, comisiones).compra
  const ops = (trades || []).map((t, i) => {
    const antes = i ? trades[i - 1].capitalTras : capitalIni, asignado = antes * allocationPct / 100
    const comC = comisionDe({ importeCompra: asignado }, comisiones).compra
    return { t, accC: (asignado - comC) / t.entryPrice, comC, accS: (fijo - comS) / t.entryPrice }
  })
  const compuesta = [], simple = []
  let cerradaC = capitalIni, cerradaS = capitalIni, k = 0
  const porSalida = [...ops].sort((a, b) => a.t.exitDate < b.t.exitDate ? -1 : a.t.exitDate > b.t.exitDate ? 1 : 0)
  for (const v of velas || []) {
    const d = v.date
    while (k < porSalida.length && porSalida[k].t.exitDate <= d) { const t = porSalida[k].t; cerradaC = t.capitalTras; cerradaS += t.pnlSimple; k++ }
    let vC = cerradaC, vS = cerradaS
    for (const o of ops) {
      if (o.t.entryDate > d) break
      if (o.t.exitDate <= d || !(v.close > 0)) continue
      vC += o.accC * (v.close - o.t.entryPrice) - o.comC
      vS += o.accS * (v.close - o.t.entryPrice) - comS
    }
    compuesta.push({ date: d, value: vC }); simple.push({ date: d, value: vS })
  }
  return { compuesta, simple }
}

// La mayor caída desde un máximo de una curva [{ date, value }], en % (positiva), y su fecha. El máximo empieza en el capital inicial.
export function caidaMaxima(curva, capitalIni) {
  let pico = capitalIni, max = 0, fecha = null
  for (const p of curva || []) {
    if (p.value > pico) pico = p.value
    const dd = pico > 0 ? (pico - p.value) / pico * 100 : 0
    if (dd > max) { max = dd; fecha = p.date }
  }
  return { maxDD: max, fecha }
}
