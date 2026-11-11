// scripts/comprobaciones/rotacion.js — el motor de rotación (lib/rotacion.js; docs/builder.md §125). Lo corre comunes.sh.
// Termina en 0 si todo da lo esperado. Todo con datos inventados, calculados a mano.
//
// Calendario: 30/12/2019 y 31/12/2019 (calentamiento) y seis velas de 2020 (2/1, 31/1, 3/2, 28/2, 2/3, 31/3). Periodo 2020.
// Decisiones (al cierre): 31/12/2019 (la de entrada), 31/1 y 28/2; el 31/3 se vende todo al cierre. Criterio: momentum de 1 vela.
//   A: cierres 100 110 112 115 117 130 132 140 · aperturas 99 101 110 113 116 118 131 133
//   B: cierres 100 105 106 120 122 125 127 128 · aperturas 99 101 106 107 121 123 126 127
//   C: cierres 100 108 109 110 111 112 113 114 · aperturas 99 101 108 109 110 111 112 113
// K = 1 con A y B: el 31/12 gana A (+10 % frente a +5 %): compra el 2/1 a 110. El 31/1 gana B (+13,2 % frente a +2,7 %): vende A
// el 3/2 a 116 y compra B a 121. El 28/2 gana A (+11,1 %): vende B el 2/3 a 126 y compra A a 131; el 31/3 vende A a 140.
// Final = 10.000 × 116/110 × 126/121 × 140/131.
const C0 = require('./cargador'), R = C0.RAIZ
let fallos = 0
const ok = (c, t) => { console.log(`${c ? 'OK  ' : 'MAL '} ${t}`); if (!c) fallos++ }
const cerca = (a, b, tol = 1e-9) => Number.isFinite(a) && Math.abs(a - b) <= tol * Math.max(1, Math.abs(b))

;(async () => {
  await C0.prepara(); C0.registra(R)
  const { rotar, momentum, velasDeDecision } = require(R + '/lib/rotacion.js')

  const FECHAS = ['2019-12-30', '2019-12-31', '2020-01-02', '2020-01-31', '2020-02-03', '2020-02-28', '2020-03-02', '2020-03-31']
  const serie = (cierres, aperturas) => FECHAS.map((date, i) => ({ date, open: aperturas[i], close: cierres[i] }))
  const A = serie([100, 110, 112, 115, 117, 130, 132, 140], [99, 101, 110, 113, 116, 118, 131, 133])
  const B = serie([100, 105, 106, 120, 122, 125, 127, 128], [99, 101, 106, 107, 121, 123, 126, 127])
  const Cs = serie([100, 108, 109, 110, 111, 112, 113, 114], [99, 101, 108, 109, 110, 111, 112, 113])
  const base = { fechas: FECHAS, velas: { A, B }, desde: '2020-01-01', hasta: '2020-12-31', capital: 10000, K: 1, criterio: { tipo: 'momentum', L: 1 } }

  // ── Piezas ──
  ok(momentum([1, 2, 3, 4, 5], 4, 2, 1) === 1, 'momentum de 2 velas saltando 1: 4 / 2 − 1 = 1')
  ok(momentum([1, 2, 3], 1, 2) === null, 'momentum sin historia suficiente: sin dato')
  ok(JSON.stringify(velasDeDecision(FECHAS)) === '[1,3,5,7]', 'mensual: la última vela de cada mes')
  ok(JSON.stringify(velasDeDecision(['2020-01-02', '2020-01-03', '2020-01-06', '2020-01-07'], 'semanal')) === '[1,3]', 'semanal: la última vela de cada semana')

  // ── 1 · K = 1, sin costes ──
  let r = rotar(base)
  ok(cerca(r.final, 10000 * 116 / 110 * 126 / 121 * 140 / 131), `rota A → B → A: ${r.final.toFixed(4)} € = 10.000 × 116/110 × 126/121 × 140/131`)
  ok(r.ordenes === 6 && r.operaciones.length === 3, `6 órdenes y 3 operaciones (${r.ordenes}, ${r.operaciones.length})`)
  ok(r.operaciones.map(o => `${o.simbolo}${o.entrada.slice(5)}>${o.salida.slice(5)}`).join(' ') === 'A01-02>02-03 B02-03>03-02 A03-02>03-31', 'fechas de entrada y salida')
  ok(r.decisiones.map(d => d.elegidos.join('')).join(' ') === 'A B A', 'elegidos en cada decisión: A, B, A')
  ok(r.curva.length === 6 && cerca(r.curva[0].valor, 10000 / 110 * 112), 'curva diaria: el 2/1 vale 10.000 / 110 × 112')
  const t = (Date.parse('2020-03-31') - Date.parse('2020-01-02')) / 864e5 / 365.25
  ok(cerca(r.cagr, Math.pow(r.final / 10000, 1 / t) - 1), 'CAGR con los años del 2/1 al 31/3')

  // ── 2 · Con costes: 0,1 % (mínimo 1 €, no llega) y 0,05 % de deslizamiento en cada una de las 6 órdenes ──
  r = rotar({ ...base, costes: { comisionPct: 0.1, comisionMinEur: 1, deslizPct: 0.05 } })
  const conCostes = 10000 * Math.pow(0.999, 6) * Math.pow(0.9995 / 1.0005, 3) * 116 / 110 * 126 / 121 * 140 / 131
  ok(cerca(r.final, conCostes), `con costes: ${r.final.toFixed(4)} € = 10.000 × 0,999⁶ × (0,9995 / 1,0005)³ × …`)
  r = rotar({ ...base, capital: 500, costes: { comisionPct: 0.1, comisionMinEur: 1, deslizPct: 0 } })
  const u1 = 499 / 110, x2 = u1 * 116, u2 = (x2 - 1 - 1) / 121, x3 = u2 * 126, u3 = (x3 - 1 - 1) / 131, fin = u3 * 140 - 1
  ok(cerca(r.final, fin), `con 500 € manda el mínimo de 1 € por orden: ${r.final.toFixed(4)} €`)

  // ── 3 · Filtro de mercado: fuera el 31/1 → vende A el 3/2 a 116 y espera; el 28/2 vuelve: compra A el 2/3 a 131 ──
  const mercado = FECHAS.map((f) => f !== '2020-01-31')
  r = rotar({ ...base, mercado })
  ok(cerca(r.final, 10000 * 116 / 110 * 140 / 131), `mercado fuera un mes: ${r.final.toFixed(4)} € = 10.000 × 116/110 × 140/131`)
  ok(r.operaciones[0].motivo === 'mercado', 'la venta dice «mercado»')
  ok(rotar({ ...base, mercado: FECHAS.map(() => null) }).final === 10000, 'mercado sin dato: no entra (se queda en liquidez)')

  // ── 4 · Filtro de condiciones: B no pasa el 31/1 → se queda A todo el periodo ──
  const filtro = { A: A.map(() => true), B: B.map(v => v.date !== '2020-01-31') }
  r = rotar({ ...base, filtro })
  ok(cerca(r.final, 10000 * 140 / 110) && r.ordenes === 2, `filtro: A todo el periodo = 10.000 × 140/110 (${r.final.toFixed(4)} €)`)
  ok(cerca(rotar({ ...base, filtro: { A: A.map(() => true), B: B.map(v => v.date === '2020-01-31' ? null : true) } }).final, 10000 * 140 / 110), 'filtro «sin dato» = no pasa')

  // ── 5 · Miembros: B no es miembro el 31/1 → igual que el filtro ──
  r = rotar({ ...base, miembro: (s, f) => !(s === 'B' && f === '2020-01-31') })
  ok(cerca(r.final, 10000 * 140 / 110), 'miembro: fuera del índice ese día = no es candidato')

  // ── 6 · Venta anticipada: A cierra con señal de salida el 2/1 → vende el 31/1 a 113; el 31/1 gana B → la compra el 3/2 a 121 ──
  r = rotar({ ...base, salida: { A: A.map(v => v.date === '2020-01-02'), B: B.map(() => false) } })
  ok(cerca(r.final, 10000 * 113 / 110 * 126 / 121 * 140 / 131), `venta anticipada: ${r.final.toFixed(4)} € = 10.000 × 113/110 × 126/121 × 140/131`)
  ok(r.operaciones[0].motivo === 'salida', 'la venta dice «salida»')

  // ── 7 · Opción A con K = 2 de 3: los que siguen no se tocan ──
  // 31/12: A (+10 %) y C (+8 %): 5.000 € cada uno. 31/1: B (+13,2 %) y A (+2,7 %); sale C (+0,9 %): se vende el 3/2 a 110 y todo
  // eso compra B a 121; A no se toca. 28/2: A y B siguen. Final = 5.000/110 × 140 + 5.000/108 × 110 / 121 × 128.
  r = rotar({ ...base, velas: { A, B, C: Cs }, K: 2 })
  ok(cerca(r.final, 5000 / 110 * 140 + 5000 / 108 * 110 / 121 * 128), `K = 2 de 3, opción A: ${r.final.toFixed(4)} €`)
  ok(r.ordenes === 6, `6 órdenes: 2 compras, C sale y entra B, y 2 ventas finales (${r.ordenes})`)

  // ── 8 · Deja de cotizar: B sin velas desde el 28/2 → se vende el 2/3 a su último cierre (122) ──
  r = rotar({ ...base, velas: { A, B: B.slice(0, 5) } })
  ok(cerca(r.final, 10000 * 116 / 110 * 122 / 121 * 140 / 131), `deja de cotizar: se vende a su último cierre (${r.final.toFixed(4)} €)`)

  // ── 9 · Menos candidatos que K: lo que sobra espera en liquidez ──
  r = rotar({ ...base, K: 3 })
  ok(cerca(r.final, 5000 / 110 * 140 + 5000 / 106 * 128) && r.decisionesCortas === 3, 'K = 3 con 2 valores: los dos a partes iguales; 3 decisiones cortas')

  // ── 10 · PRUEBA DE ORO: K = todos = Buy&Hold a partes iguales sin rebalanceo, con costes, en 600 velas al azar ──
  let semilla = 12345
  const azar = () => (semilla = (semilla * 1103515245 + 12345) % 2147483648) / 2147483648
  const fechas = [], d0 = Date.parse('2018-01-01')
  for (let k = 0; fechas.length < 600; k++) { const f = new Date(d0 + k * 864e5); if (f.getUTCDay() % 6) fechas.push(f.toISOString().slice(0, 10)) }
  const velas = {}
  for (const s of ['V1', 'V2', 'V3', 'V4', 'V5']) {
    let p = 50 + azar() * 100
    velas[s] = fechas.map(date => { const open = p * (1 + (azar() - 0.5) * 0.02); p = open * (1 + (azar() - 0.5) * 0.04); return { date, open, close: p } })
  }
  const costes = { comisionPct: 0.1, comisionMinEur: 1, deslizPct: 0.05 }
  const desde = fechas[300], hasta = fechas[599]
  for (const rb of ['mensual', 'semanal']) {
    r = rotar({ fechas, velas, desde, hasta, capital: 10000, K: 5, rebalanceo: rb, criterio: { tipo: 'momentum', L: 63, saltar: 21 }, costes })
    let bh = 0
    for (const s of Object.keys(velas)) {
      const X = 2000, c = Math.max(X * 0.001, 1), u = (X - c) / (velas[s][300].open * 1.0005)
      const V = u * velas[s][599].close * 0.9995; bh += V - Math.max(V * 0.001, 1)
    }
    ok(cerca(r.final, bh) && r.ordenes === 10, `prueba de oro (${rb}): K = todos = Buy&Hold a partes iguales: ${r.final.toFixed(6)} € = ${bh.toFixed(6)} €`)
  }

  // ── 11 · Sin mirar al futuro: cambiar los precios desde una vela no cambia ninguna decisión anterior ──
  const corte = 450
  const velas2 = Object.fromEntries(Object.entries(velas).map(([s, v]) => [s, v.map((x, k) => k >= corte ? { ...x, open: x.open * (k % 2 ? 3 : 0.3), close: x.close * (k % 3 ? 0.2 : 4) } : x)]))
  const o1 = { fechas, desde, hasta, capital: 10000, K: 2, criterio: { tipo: 'momentum', L: 20 }, costes }
  const d1 = rotar({ ...o1, velas }).decisiones.filter(d => d.fecha < fechas[corte]), d2 = rotar({ ...o1, velas: velas2 }).decisiones.filter(d => d.fecha < fechas[corte])
  ok(d1.length > 5 && JSON.stringify(d1) === JSON.stringify(d2), `las ${d1.length} decisiones anteriores a la vela ${corte} no cambian`)

  // ── 12 · El azar (§126) ──
  const { azarRotacion, eligeAlAzar, prepara, simula } = require(R + '/lib/rotacion.js')
  r = rotar(base)
  ok(r.decisiones.map(d => d.rotados).join(',') === '0,1,1', 'rotados de la estrategia K = 1: 0 el 31/12, 1 el 31/1 (A), 1 el 28/2 (B)')
  // Con rnd = 0 siempre se saca el primero (en orden alfabético): tiene A y C, suelta 1 → suelta A; rellena con B.
  const e = eligeAlAzar([1], () => 0)({ j: 0, candidatos: [{ s: 'A' }, { s: 'B' }, { s: 'C' }], enCartera: new Set(['A', 'C']), K: 2 })
  ok(e.join(',') === 'C,B', 'eligeAlAzar a mano: con A y C, suelta 1 (A) y entra B')
  const e2 = eligeAlAzar([0], () => 0)({ j: 0, candidatos: [{ s: 'B' }], enCartera: new Set(['A']), K: 1 })
  ok(e2.join(',') === 'B', 'eligeAlAzar: el que ya no es candidato sale siempre (A) y entra B')
  // K = 1 con A y B: cada copia rota igual que la estrategia (3 operaciones): A → B → A (la real) o B → A → B.
  const az = azarRotacion(base, { nSim: 200, semilla: 7 })
  const otra = 10000 * 121 / 106 * 131 / 116 * 128 / 126
  const nReal = az.sims.final.filter(x => cerca(x, az.real.final)).length, nOtra = az.sims.final.filter(x => cerca(x, otra)).length
  ok(nReal + nOtra === 200 && nReal > 50 && nOtra > 50, `copias K = 1: ${nReal} como la real (A → B → A) y ${nOtra} B → A → B = 10.000 × 121/106 × 131/116 × 128/126`)
  const pEsp = (az.sims.cagr.filter(x => x < az.real.cagr).length + nReal / 2) / 200 * 100
  ok(cerca(az.percentilCagr, pEsp), `percentil del CAGR a mano: ${az.percentilCagr.toFixed(1)} (las que ganan menos + la mitad de los empates)`)
  // K = todos: no hay nada que elegir; todas las copias = la estrategia → percentil 50.
  const az2 = azarRotacion({ ...base, K: 2 }, { nSim: 50, semilla: 3 })
  ok(az2.sims.final.every(x => x === az2.real.final) && az2.percentilCagr === 50, 'K = todos: las copias son la estrategia (percentil 50)')
  // Misma semilla, mismas copias; otra semilla, otras.
  const o10 = { fechas, velas, desde, hasta, capital: 10000, K: 2, criterio: { tipo: 'momentum', L: 20 }, costes }
  const s1 = azarRotacion(o10, { nSim: 30, semilla: 11 }), s2 = azarRotacion(o10, { nSim: 30, semilla: 11 }), s3 = azarRotacion(o10, { nSim: 30, semilla: 12 })
  ok(JSON.stringify(s1.sims) === JSON.stringify(s2.sims) && JSON.stringify(s1.sims) !== JSON.stringify(s3.sims), 'semilla fija: mismas copias; otra semilla, otras')
  // Las copias cambian lo mismo que la estrategia: en cada decisión sueltan tantos «voluntarios» como ella (si pueden).
  const P10 = prepara(o10), real10 = simula(P10), rot = real10.decisiones.map(d => d.rotados)
  const copia = simula(P10, eligeAlAzar(rot, () => 0.37))
  ok(copia.decisiones.every((d, k) => d.rotados <= rot[k]) && copia.decisiones.reduce((a, d) => a + d.rotados, 0) === rot.reduce((a, x) => a + x, 0),
    `la copia rota igual: ${rot.reduce((a, x) => a + x, 0)} cambios voluntarios en las dos`)
  ok(cerca(az.real.final, rotar(base).final), 'la real del azar = rotar')

  console.log(fallos ? `rotacion: ${fallos} fallos` : 'rotacion: todo bien')
  process.exit(fallos ? 1 : 0)
})()
