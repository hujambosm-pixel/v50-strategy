// scripts/comprobaciones/screener-senales.js — «Da señal de compra con…» del screener (docs/screener.md §11) con velas
// INVENTADAS y el resultado calculado a mano (lib/screener/senales.js). No usa la red ni la base. Termina en 0 si todo va bien.
//
// Velas planas: 40 velas (más PRE = 260 planas delante, para el calentamiento) [apertura 100, máximo 101, mínimo 99, cierre 100]. Regla: «Nuevo máximo de 2 velas» (el cierre supera el
// máximo de las 2 anteriores) y compra a la apertura siguiente; stop del 5 %; vende a la apertura de la vela 4 contando desde la
// de compra (salida por tiempo de 3 velas). Las velas planas nunca dan señal (cierre 100 < máximo 101).
//   1. La última cierra a 105 (> 101) → señal en la última: «hace 0», tipo 'cierre', sin precio.
//   2. Señal en la n−3 (cierre 105, máximo 106); compra a la apertura de la n−2 (105); stop 99,75: no salta. La n−2 [105,106,104,105]
//      y la n−1 [105,106,104,105] no dan señal (105 < 106) → «hace 2».
//   3. Como el 2, pero la n−1 cierra a 110 (> 106): señal, pero con la operación ABIERTA → no cuenta; sigue «hace 2».
//   4. Señal solo en la vela 10 (fuera de las últimas 20) → sin señal (hace null).
//   5. Filtro de mercado «^REF: nuevo máximo de 2 velas»: el índice es plano salvo su última vela (cierre 105). El valor da señal en
//      la n−3 (el mercado no deja: no compra) y en la n−1 (cierre 110 > 106; el mercado deja) → «hace 0». Con el índice siempre plano
//      → sin señal.
//   6. Orden en la ruptura del máximo de 2 velas (sin señal): la última vela [100,103,99,102] supera 101 → compra a 101 (abre por
//      debajo) en la última → «hace 0», tipo 'nivel', precio 101. Plana del todo → sin señal.
//   7. Orden AL CIERRE: la señal de la n−3 compra al cierre de esa misma vela (105) → «hace 2»; la n−1 cierra a 110 con la operación
//      abierta (vende a la apertura de la n+1… aún no) → sigue «hace 2».
//   8. La regla de «operación abierta» frente al motor: en 400 velas al azar (semilla fija), cada vela k < última con señal y sin
//      operación abierta es justo una compra del motor (en k+1 con la orden a la apertura; en k con la orden al cierre), y al revés.
//   9. Pocas velas (menos que el calentamiento + 20) → error «pocas velas»; pasaSenal y textoHace.
//  10. La petición de /api/screener-senales: símbolos y estrategia (de tarjetas, diaria) validados.
const path = require('path')
const C0 = require('./cargador')
let fallos = 0, n = 0
const ok = (c, t) => { n++; if (!c) { fallos++; console.log(`✗ ${t}`) } }

const PRE = 260   // velas planas delante: el motor pide al menos 250 de calentamiento
const velasSin = (xs) => xs.map(([open, high, low, close], i) => ({ date: new Date(Date.UTC(2020, 0, 1) + i * 864e5).toISOString().slice(0, 10), open, high, low, close, volume: 1000 }))
const velas = (xs) => velasSin([...planas(PRE), ...xs])
const PLANA = [100, 101, 99, 100]
const planas = (k) => Array.from({ length: k }, () => PLANA)

;(async () => {
  await C0.prepara(); C0.registra(C0.RAIZ)
  const { senalDe, pasaSenal, textoHace, VELAS_SENAL } = require(path.join(C0.RAIZ, 'lib/screener/senales.js'))
  const { interpreta } = require(path.join(C0.RAIZ, 'lib/editor/interprete.js'))
  const { validaDefinicion } = require(path.join(C0.RAIZ, 'lib/editor/definicion.js'))
  const { erroresPeticion } = require(path.join(C0.RAIZ, 'pages/api/screener-senales.js'))
  const def = (extra = {}) => ({ tipo: 'editor', formato: 1, motor: 1, nombre: 'prueba', parametros: { version: 1, lista: [] },
    entrada: { senal: { c: 'nuevoMaximo', p: { n: 2 } }, orden: { tipo: 'apertura' } },
    stops: [{ id: 'porcentaje1', tipo: 'porcentaje', motivo: 'stop', pct: 5 }],
    salidas: [{ tipo: 'tope', velas: 3, motivo: 'tiempo' }], ...extra })
  const D = def()
  ok(validaDefinicion(D).length === 0, `la definición es válida ${validaDefinicion(D).join(' ')}`)
  const fechaDe = (xs, k) => velas(xs)[PRE + k].date

  // 1
  let xs = [...planas(39), [100, 106, 99, 105]]
  let r = senalDe({ def: D, velas: velas(xs) })
  ok(r.hace === 0 && r.tipo === 'cierre' && r.precio === null && r.fecha === fechaDe(xs, 39) && r.ultima === fechaDe(xs, 39) && r.velas === PRE + 40, `1 · señal en la última (${JSON.stringify(r)})`)
  // 2
  xs = [...planas(37), [100, 106, 99, 105], [105, 106, 104, 105], [105, 106, 104, 105]]
  r = senalDe({ def: D, velas: velas(xs) })
  ok(r.hace === 2 && r.fecha === fechaDe(xs, 37), `2 · señal hace 2 velas (${JSON.stringify(r)})`)
  // 3
  xs = [...planas(37), [100, 106, 99, 105], [105, 106, 104, 105], [105, 111, 104, 110]]
  r = senalDe({ def: D, velas: velas(xs) })
  ok(r.hace === 2, `3 · con la operación abierta, la señal de la última no cuenta (${JSON.stringify(r)})`)
  // 4
  xs = [...planas(10), [100, 106, 99, 105], ...planas(29)]
  r = senalDe({ def: D, velas: velas(xs) })
  ok(r.hace === null && r.ultima === fechaDe(xs, 39), `4 · sin señal en las últimas ${VELAS_SENAL} (${JSON.stringify(r)})`)
  // 5
  const conMercado = def({ filtroMercado: { ticker: '^REF', si: { c: 'nuevoMaximo', p: { n: 2 } } } })
  ok(validaDefinicion(conMercado).length === 0, `5 · la definición con filtro de mercado es válida ${validaDefinicion(conMercado).join(' ')}`)
  xs = [...planas(37), [100, 106, 99, 105], [105, 106, 104, 105], [105, 111, 104, 110]]
  r = senalDe({ def: conMercado, velas: velas(xs), referencias: { '^REF': velas([...planas(39), [100, 106, 99, 105]]) } })
  ok(r.hace === 0, `5 · el mercado no deja en la n−3 y sí en la última → hace 0 (${JSON.stringify(r)})`)
  r = senalDe({ def: conMercado, velas: velas(xs), referencias: { '^REF': velas(planas(40)) } })
  ok(r.hace === null, `5 · con el índice siempre plano, sin señal (${JSON.stringify(r)})`)
  // 6
  const ruptura = def({ entrada: { orden: { tipo: 'ruptura', nivel: { velas: 2 } } } })
  ok(validaDefinicion(ruptura).length === 0, `6 · la definición con ruptura es válida ${validaDefinicion(ruptura).join(' ')}`)
  xs = [...planas(39), [100, 103, 99, 102]]
  r = senalDe({ def: ruptura, velas: velas(xs) })
  ok(r.hace === 0 && r.tipo === 'nivel' && r.precio === 101, `6 · ruptura: compra en la última a 101 (${JSON.stringify(r)})`)
  r = senalDe({ def: ruptura, velas: velas(planas(40)) })
  ok(r.hace === null, `6 · plana: sin señal (${JSON.stringify(r)})`)
  // 7
  const alCierre = def({ entrada: { senal: { c: 'nuevoMaximo', p: { n: 2 } }, orden: { tipo: 'cierre' } } })
  xs = [...planas(37), [100, 106, 99, 105], [105, 106, 104, 105], [105, 111, 104, 110]]
  r = senalDe({ def: alCierre, velas: velas(xs) })
  ok(r.hace === 2 && r.tipo === 'cierre', `7 · orden al cierre: hace 2 (${JSON.stringify(r)})`)
  xs = [...planas(39), [100, 106, 99, 105]]
  r = senalDe({ def: alCierre, velas: velas(xs) })
  ok(r.hace === 0, `7 · orden al cierre, señal en la última → hace 0 (${JSON.stringify(r)})`)

  // 8 · la regla de «operación abierta» frente a las compras del motor
  let semilla = 12345
  const azar = () => { semilla = (semilla * 1103515245 + 12345) % 2147483648; return semilla / 2147483648 }
  const paseo = []; let p = 100
  for (let i = 0; i < 400; i++) { const o = p * (1 + (azar() - 0.5) * 0.04), c = o * (1 + (azar() - 0.5) * 0.05); paseo.push([o, Math.max(o, c) * (1 + azar() * 0.01), Math.min(o, c) * (1 - azar() * 0.01), c]); p = c }
  for (const [nombre, d, desfase] of [['apertura', D, 1], ['cierre', alCierre, 0]]) {
    const bars = velasSin(paseo), rr = interpreta(d, bars, {}, { senalCompra: true }), idx = new Map(bars.map((b, k) => [b.date, k]))
    const ops = [...rr.trades, ...(rr.openPosition ? [rr.openPosition] : [])]
    const tramos = ops.map(t => [idx.get(t.entryDate), t.exitDate ? idx.get(t.exitDate) : Infinity])
    const dentro = (k) => tramos.some(([e, x]) => (desfase === 0 ? e < k : e <= k) && x > k)
    const previstas = [], reales = new Set(tramos.map(([e]) => e))
    for (let k = 0; k < bars.length - 1; k++) if (rr.senalCompra[k] && !dentro(k)) previstas.push(k + desfase)
    const igual = previstas.length === reales.size && previstas.every(k => reales.has(k))
    ok(igual && previstas.length >= 10, `8 · orden ${nombre}: las señales sin operación abierta son las compras del motor (${previstas.length} y ${reales.size})`)
    // Sin pedir senalCompra, el resultado del motor es el de siempre (sin la clave nueva).
    ok(!('senalCompra' in interpreta(d, bars, {})), `8 · orden ${nombre}: sin pedirlo, el motor no devuelve senalCompra`)
  }

  // 9
  r = senalDe({ def: D, velas: velasSin(planas(PRE)) })
  ok(r.hace === null && /pocas velas/.test(r.error || ''), `9 · pocas velas (${JSON.stringify(r)})`)
  ok(pasaSenal(0, 1) && !pasaSenal(1, 1) && pasaSenal(2, 3) && !pasaSenal(3, 3) && !pasaSenal(null, 5), '9 · pasaSenal: «en las últimas N velas» = hace < N')
  ok(textoHace(0) === 'la última' && textoHace(1) === 'hace 1 vela' && textoHace(4) === 'hace 4 velas' && textoHace(null) === '—', '9 · textoHace')

  // 10
  const est = { definition: D, params: {} }
  ok(erroresPeticion({ estrategia: est, simbolos: ['AAPL', 'BRK-B'] }).length === 0, '10 · petición válida')
  ok(erroresPeticion({ estrategia: est, simbolos: [] }).length === 1, '10 · sin símbolos')
  ok(erroresPeticion({ estrategia: est, simbolos: Array.from({ length: 11 }, (_, i) => 'A' + i) }).length === 1, '10 · más de 10 símbolos')
  ok(erroresPeticion({ estrategia: est, simbolos: ['aapl;drop'] }).length === 1, '10 · símbolo raro')
  ok(erroresPeticion({ estrategia: { definition: 'function(){}', params: {} }, simbolos: ['AAPL'] }).length === 1, '10 · estrategia de código')
  ok(erroresPeticion({ estrategia: { definition: D, params: { intervalo: 'semanal' } }, simbolos: ['AAPL'] }).length === 1, '10 · estrategia semanal')
  ok(erroresPeticion({ estrategia: { definition: { ...D, entrada: { orden: { tipo: 'apertura' } } }, params: {} }, simbolos: ['AAPL'] }).length === 1, '10 · estrategia no válida (sin señal)')

  console.log(fallos ? `screener-senales: ${fallos} de ${n} FALLAN` : `screener-senales: ${n} de ${n} bien`)
  process.exit(fallos ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
