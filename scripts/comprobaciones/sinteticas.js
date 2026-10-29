// scripts/comprobaciones/sinteticas.js — pruebas del motor con velas inventadas y el resultado calculado a mano (docs/builder.md, §41).
// Las corre comunes.sh. Termina en 0 si todas dan lo calculado.
//
// 1 · El stop «trailing» con «manda el más alto» (V9.1079). Regla: en cada vela manda el más alto de los stops activos, y el stop
//     nunca baja. Compra a 100 a la apertura de la vela 3 (la 2 cierra a 100,5, por encima del máximo de las 2 anteriores, 100); stop
//     fijo del 8 % = 92; trailing «cierre − 1 × ATR (1)» (el ATR de 1 vela es el rango verdadero de esa vela) que se mira en cada vela
//     (la condición «cierre ≤ su SMA de 1» siempre se cumple). Candidato de cada vela cerrada, en vigor desde la siguiente:
//       vela 2: 100,5 − 10 = 90,5 · vela 3: 101 − 7 = 94 · vela 4: 102 − 6 = 96 · vela 5: 101 − 6 = 95 · vela 6: 102 − 4 = 98
//     → el stop que manda en las velas 3, 4, 5, 6 y 7: 92, 94, 96, 96 (el 95 no lo baja), 98. La vela 7 abre a 101 y baja a 97 →
//     vende a 98. Con la vela 7 abriendo a 97,50 (por debajo del stop), vende a la apertura, 97,50.
const path = require('path')
const C0 = require('./cargador')
let fallos = 0
const ok = (c, t) => { console.log(`${c ? 'OK  ' : 'MAL '} ${t}`); if (!c) fallos++ }
const velas = (xs) => xs.map(([open, high, low, close], i) => ({ date: new Date(Date.UTC(2020, 0, 1) + i * 864e5).toISOString().slice(0, 10), open, high, low, close, volume: 1000 }))
;(async () => {
  await C0.prepara(); C0.registra(C0.RAIZ)
  const { interpreta } = require(path.join(C0.RAIZ, 'lib/editor/interprete.js'))
  const { validaDefinicion } = require(path.join(C0.RAIZ, 'lib/editor/definicion.js'))
  const def = { tipo: 'editor', formato: 1, motor: 1, nombre: 'trailing + manda el más alto', parametros: { version: 1, lista: [] },
    entrada: { senal: { c: 'nuevoMaximo', p: { n: 2 } }, orden: { tipo: 'apertura' } },
    stops: [{ id: 'porcentaje1', tipo: 'porcentaje', motivo: 'stop', pct: 8, historialAlEntrar: true },
      { id: 'trailing2', tipo: 'trailing', motivo: 'trailing_exit', si: { c: 'precioVsMedia', p: { tipo: 'SMA', periodo: 1, lado: 'debajo', comparacion: '≥' } }, nivel: { atr: { k: 1, periodo: 1 } }, historial: 'siSube', fechaHistorial: 'vela' }],
    stopsModo: 'masAlto', salidas: [] }
  ok(validaDefinicion(def).length === 0, `la definición es válida ${validaDefinicion(def).join(' ')}`)
  const base = [[99, 100, 98, 99], [99, 100, 98, 99.5], [99.5, 101, 91, 100.5], [100, 103, 96, 101], [101, 103, 97, 102], [102, 103, 97, 101], [101, 103, 99, 102]]
  for (const [nombre, v7, salida] of [['toca el stop dentro de la vela', [101, 101.5, 97, 99], 98], ['abre por debajo del stop', [97.5, 99, 96, 98], 97.5]]) {
    const v = velas([...base, v7]), r = interpreta(def, v), t = r.trades[0], k = (d) => v.findIndex(b => b.date === d)
    const hist = t ? t.stopHistory.map(h => [k(h.date), h.stopPx]) : null
    ok(r.trades.length === 1 && k(t.entryDate) === 3 && t.entryPrice === 100, `${nombre}: compra en la vela 3 a 100`)
    ok(JSON.stringify(hist) === '[[3,92],[4,94],[5,96],[7,98]]', `${nombre}: el stop que manda es 92, 94, 96, 96, 98 (historial ${JSON.stringify(hist)})`)
    ok(t && k(t.exitDate) === 7 && t.exitPrice === salida && t.stopPx === 98, `${nombre}: vende en la vela 7 a ${salida} (obtenido: ${t ? `${k(t.exitDate)} a ${t.exitPrice}, stop ${t.stopPx}` : 'nada'})`)
  }
  console.log(fallos ? `sintéticas: ${fallos} fallos` : 'sintéticas: todas bien')
  process.exit(fallos ? 1 : 0)
})().catch(e => { console.error(e); process.exit(2) })
