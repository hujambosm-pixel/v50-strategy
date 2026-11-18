// scripts/comprobaciones/plan-pesos.js — el bloque «CON PESOS» del plan, sin reglas (docs/builder.md §193; lib/planes/pesos.js). Las
// corre comunes.sh. Termina en 0 si todo da lo esperado.
//
// PRUEBAS DE ORO (con el cálculo que el plan ya hace con piezas de un solo activo, las de sus Buy&Hold):
//   1 · 100 % en A, sin volver, «según los pesos de ahora», 300 €/mes, 0,185 € por orden, impuestos de España = la pieza «activo» A.
//   2 · 50 % A + 50 % B, «según los de partida», 300 €/mes, 0,1 %, impuestos = dos piezas «activo» al 50 % con las aportaciones por pesos.
//   3 · 50 % A + 50 % B, «cada año», sin aportaciones, 0,1 %, impuestos = las dos piezas con el rebalanceo anual entre piezas.
// A MANO (sin costes ni impuestos):
//   4 · 10.000 €, 50/50. A: 100 el 30/12/2020 y el 31/12, 120 el 04/01/2021 y el 05/01, 132 el 06/01; B siempre a 100.
//       Día 1: 50 A y 50 B. «Cada año»: el 04/01 a la apertura (A a 120) hay 6.000 + 5.000 = 11.000 → tocan 5.500 cada uno: vende 500 €
//       de A (4,1667) y compra 5 B. El 06/01: 45,8333 × 132 = 6.050 + 55 × 100 = 5.500 → 11.550 €. «Nunca»: 50 × 132 + 5.000 = 11.600 €.
//   5 · Lo mismo con «si se separa más de N puntos»: al cierre del 04/01 A pesa 6.000 / 11.000 = 54,5 % (4,5 puntos). Con 4 puntos vuelve a
//       la apertura del 05/01 (A a 120) → 11.550 €; con 5, nunca → 11.600 €.
//   6 · Las aportaciones. 10.000 € en 80 % A + 20 % B a 100 (80 A y 20 B); el 01/02/2021 A abre a 140: 11.200 + 2.000 = 13.200; llegan
//       1.000 €: «partida» 800 A / 200 B · «ahora» (84,85 / 15,15 %) 848,48 / 151,52 · «al más atrasado»: con 14.200 tocan 11.360 / 2.840 →
//       faltan 160 / 840 · «liquidez» → 1.000 € en la liquidez del bloque. Siempre acaba en 14.200 € (sin más cambios de precio).
//   7 · Regla del 1 %, 0,185 € por orden. 1.000 € en 95 % A + 5 % B (a 100) y 300 €/mes. Día 1: 950 A y 50 B (0,185 ≤ 0,50). En febrero,
//       285 A y 15 B: 0,185 € es más del 1 % de 15 € (0,15) → esos 15 € esperan PARA B. En marzo: 285 A y 15 + 15 = 30 € de B (0,185 ≤ 0,30).
//       B comprado: 49,815 + 29,815 = 79,63 €. Órdenes: 2 + 1 + 2 + 2 ventas finales = 7. Final: 1.600 − 5 × 0,185 − 2 × 0,185 = 1.598,705 €.
process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://arnes.invalid'; process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'clave-falsa-del-arnes'
const C0 = require('./cargador'), R = C0.RAIZ
let fallos = 0
const ok = (c, t) => { console.log(`${c ? 'OK  ' : 'MAL '} ${t}`); if (!c) fallos++ }
const cerca = (a, b, tol = 1e-9) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tol * Math.max(1, Math.abs(b))
const txt = (x) => JSON.stringify(x)

;(async () => {
  await C0.prepara(); C0.registra(R)
  const P = require(R + '/lib/planes/plan.js'), W = require(R + '/lib/planes/pesos.js')
  const habiles = (desde, n) => { const out = []; for (let d = new Date(desde + 'T00:00:00Z'); out.length < n; d = new Date(d.getTime() + 864e5)) { const w = d.getUTCDay(); if (w >= 1 && w <= 5) out.push(d.toISOString().slice(0, 10)) } return out }
  const vela = (date, px) => ({ date, open: px, high: px, low: px, close: px, volume: 1000 })
  const datosDe = (F, precios) => { const plano = F.map(date => ({ date, open: 100, close: 100 })); return { fechas: F, qqq: plano, spy: plano, etf: F.map(() => null), qqqVelas: plano,
    velas: Object.fromEntries(Object.entries(precios).map(([s, ps]) => [s, F.map((f, i) => vela(f, ps[i]))])) } }
  const plan = (piezas, { capital = 10000, aport = null, costes = null, impuestos = 'ninguno', desde, hasta, reparto = null }) => ({ tipo: 'plan', formato: 1, calculo: 1,
    dinero: { capitalInicial: capital, aportaciones: aport ? { importe: aport, frecuencia: 'mensual' } : { frecuencia: 'ninguna' }, extraordinarias: [] }, piezas,
    reparto: reparto || { aportacionesA: 'pesos', rebalanceo: { calendario: 'nunca', banda: null } }, impuestos: { regimen: impuestos, reglaDosMeses: true }, costes, periodo: { desde, hasta } })
  const bloque = (pesos, volver = { cada: 'nunca' }, aportaciones = 'ahora') => ({ id: 'p', tipo: 'pesos', peso: 1, pesos: pesos.map(([simbolo, peso]) => ({ simbolo, peso })), volver, aportaciones })
  const activo = (id, a, peso) => ({ id, tipo: 'activo', activo: a, peso })
  const igual = (r1, r2) => cerca(r1.valorNeto, r2.valorNeto) && cerca(r1.impuestos?.pagados || 0, r2.impuestos?.pagados || 0) && cerca(r1.costes.pagados, r2.costes.pagados) && r1.costes.ordenes === r2.costes.ordenes
    && r1.serie.length === r2.serie.length && r1.serie.every((x, k) => cerca(x.vl, r2.serie[k].vl) && cerca(x.patrimonio, r2.serie[k].patrimonio))
  const resumen = (r) => `${r.valorNeto.toFixed(4)} € · ${r.costes.ordenes} órdenes · impuestos ${(r.impuestos?.pagados || 0).toFixed(4)}`

  // ── 0 · Las cuentas puras ──
  const o82 = { A: 0.8, B: 0.2 }, v73 = { A: 7000, B: 3000 }
  ok(txt(W.repartoAportacion('partida', 1000, o82, v73)) === txt({ A: 800, B: 200 }), 'aportación «partida»: 800 / 200')
  ok(cerca(W.repartoAportacion('ahora', 1000, o82, v73).A, 700) && cerca(W.repartoAportacion('ahora', 1000, o82, v73).B, 300), 'aportación «ahora» (70/30): 700 / 300')
  ok(txt(W.repartoAportacion('atras', 1000, o82, v73)) === txt({ A: 1000 }), 'aportación «al más atrasado»: con 11.000 tocan 8.800 / 2.200 → todo a A')
  ok(txt(W.repartoAportacion('liquidez', 1000, o82, v73)) === txt({ LIQUIDEZ: 1000 }), 'aportación «liquidez»')
  ok(['ahora', 'atras', 'liquidez'].every(m => txt(W.repartoAportacion(m, 1000, o82, { A: 0, B: 0 })) === txt({ A: 800, B: 200 })), 'sin nada aún (el primer día), todos los modos compran los pesos de partida')
  const ov = W.ordenesVolver(o82, { A: 8400, B: 3600 })
  ok(cerca(ov.falta.A, 1200) && cerca(ov.sobra.B, 1200) && ov.total === 12000, 'volver a los pesos: 8.400 / 3.600 → vender 1.200 de B y comprar 1.200 de A')
  ok(W.fueraDeBanda(o82, { A: 9100, B: 900 }, 10) && !W.fueraDeBanda(o82, { A: 8900, B: 1100 }, 10), 'banda de 10 puntos: 91/9 se sale, 89/11 no')
  ok(W.validaPiezaPesos(bloque([['A', 0.8], ['B', 0.2]])).length === 0, 'un bloque válido')
  ok(W.validaPiezaPesos(bloque([['A', 0.8], ['B', 0.1]])).some(x => x.includes('suman 90 %')), 'los pesos tienen que sumar 100 % (lo dice con la suma)')
  ok(W.validaPiezaPesos(bloque([['a', 1]])).length === 1 && W.validaPiezaPesos(bloque([['A', 0.5], ['A', 0.5]])).some(x => x.includes('dos veces')), 'símbolos en mayúsculas y sin repetir')
  ok(W.validaPiezaPesos(bloque([['A', 1]], { cada: 'banda' })).length === 1 && W.validaPiezaPesos(bloque([['A', 1]], { cada: 'banda', puntos: 10 })).length === 0, 'la banda necesita sus puntos')
  ok(W.validaPiezaPesos(bloque([['A', 0.7], ['LIQUIDEZ', 0.3]])).length === 0 && txt(W.simbolosPesos(bloque([['A', 0.7], ['LIQUIDEZ', 0.3]]))) === txt(['A']), 'la liquidez del bloque vale como peso (no se compra)')
  const pv = plan([bloque([['A', 1]])], { desde: '2020-01-01', hasta: '2020-12-31' })
  ok(P.validaPlan(pv).length === 0, `un plan con un bloque «Con pesos» es válido (${txt(P.validaPlan(pv))})`)
  ok(P.validaPlan({ ...pv, piezas: [{ ...pv.piezas[0], peso: 0.5 }, activo('q', 'QQQ', 0.5)] }).some(x => x.includes('va solo en el plan')), 'de momento va solo en el plan')

  // ── 1–3 · Pruebas de oro ──
  const F = habiles('2018-01-02', 620)
  const A = F.map((_, i) => 100 * (1 + 0.3 * Math.sin(i / 40)) + i * 0.05), B = F.map((_, i) => 50 + 10 * Math.cos(i / 25) + i * 0.02)
  const D = datosDe(F, { A, B }), per = { desde: F[0], hasta: F[F.length - 1] }
  const c185 = { comisionPct: 0, comisionMinEur: 0.185, horquillaPct: {} }, c01 = { comisionPct: 0.1, comisionMinEur: 0, horquillaPct: {} }
  {
    const r1 = P.ejecutaPlan(plan([bloque([['A', 1]])], { ...per, aport: 300, costes: c185, impuestos: 'ES-ahorro' }), D)
    const r2 = P.ejecutaPlan(plan([activo('r', 'A', 1)], { ...per, aport: 300, costes: c185, impuestos: 'ES-ahorro' }), D)
    ok(igual(r1, r2), `ORO 1 · 100 % A = comprar y mantener A al céntimo (${resumen(r1)} / ${resumen(r2)})`)
  }
  {
    const r1 = P.ejecutaPlan(plan([bloque([['A', 0.5], ['B', 0.5]], { cada: 'nunca' }, 'partida')], { ...per, aport: 300, costes: c01, impuestos: 'ES-ahorro' }), D)
    const r2 = P.ejecutaPlan(plan([activo('a', 'A', 0.5), activo('b', 'B', 0.5)], { ...per, aport: 300, costes: c01, impuestos: 'ES-ahorro' }), D)
    ok(igual(r1, r2), `ORO 2 · 50/50 «según los de partida» = dos piezas al 50 % (${resumen(r1)} / ${resumen(r2)})`)
  }
  {
    const r1 = P.ejecutaPlan(plan([bloque([['A', 0.5], ['B', 0.5]], { cada: 'anio' })], { ...per, costes: c01, impuestos: 'ES-ahorro' }), D)
    const r2 = P.ejecutaPlan(plan([activo('a', 'A', 0.5), activo('b', 'B', 0.5)], { ...per, costes: c01, impuestos: 'ES-ahorro', reparto: { aportacionesA: 'pesos', rebalanceo: { calendario: 'anual', banda: null } } }), D)
    ok(igual(r1, r2) && r2.rebalanceosPiezas === 2, `ORO 3 · 50/50 «cada año» = dos piezas con el rebalanceo anual (${resumen(r1)} / ${resumen(r2)}; ${r2.rebalanceosPiezas} vueltas)`)
  }

  // ── 4–5 · Volver a los pesos, a mano ──
  {
    const F4 = ['2020-12-30', '2020-12-31', '2021-01-04', '2021-01-05', '2021-01-06'], D4 = datosDe(F4, { A: [100, 100, 120, 120, 132], B: [100, 100, 100, 100, 100] })
    const p4 = { desde: F4[0], hasta: F4[4] }
    const va = (volver) => P.ejecutaPlan(plan([bloque([['A', 0.5], ['B', 0.5]], volver)], p4), D4, { libro: true })
    const anio = va({ cada: 'anio' }), nunca = va({ cada: 'nunca' })
    ok(cerca(anio.valorNeto, 11550) && cerca(nunca.valorNeto, 11600), `«cada año» 11.550 € y «nunca» 11.600 € (${anio.valorNeto.toFixed(4)} / ${nunca.valorNeto.toFixed(4)})`)
    const vA = anio.libro.movimientos.find(m => m.tipo === 'venta' && m.simbolo === 'A'), cB = anio.libro.movimientos.filter(m => m.tipo === 'compra' && m.simbolo === 'B')
    ok(vA && vA.fecha === '2021-01-04' && cerca(vA.importe, 500) && cB.length === 2 && cerca(cB[1].importe, 500) && cB[1].fecha === '2021-01-04', 'el 04/01, a la apertura: vende 500 € de A y compra 500 € de B')
    ok(anio.operaciones.some(o => o.volverPesos && o.fecha === '2021-01-04'), 'la vuelta a los pesos queda apuntada')
    const b4 = va({ cada: 'banda', puntos: 4 }), b5 = va({ cada: 'banda', puntos: 5 })
    const vB = b4.libro.movimientos.find(m => m.tipo === 'venta' && m.simbolo === 'A')
    ok(cerca(b4.valorNeto, 11550) && vB?.fecha === '2021-01-05' && cerca(b5.valorNeto, 11600) && !b5.libro.movimientos.some(m => m.tipo === 'venta'), `banda de 4 puntos: vuelve el 05/01 (11.550 €); de 5, nunca (11.600 €)`)
  }

  // ── 6 · Las aportaciones, a mano ──
  {
    const F6 = ['2021-01-28', '2021-01-29', '2021-02-01', '2021-02-02'], D6 = datosDe(F6, { A: [100, 100, 140, 140], B: [100, 100, 100, 100] })
    const va = (modo) => P.ejecutaPlan(plan([bloque([['A', 0.8], ['B', 0.2]], { cada: 'nunca' }, modo)], { desde: F6[0], hasta: F6[3], aport: 1000 }), D6, { libro: true })
    const esp = { partida: [8800, 2200], ahora: [8000 + 1000 * 11200 / 13200, 2000 + 1000 * 2000 / 13200], atras: [8160, 2840], liquidez: [8000, 2000] }
    for (const [modo, [a, b]] of Object.entries(esp)) {
      const r = va(modo), S = r.libro.porSimbolo
      ok(cerca(S.A.compras, a) && cerca(S.B.compras, b) && cerca(r.valorNeto, 14200), `«${modo}»: A ${a.toFixed(2)} € y B ${b.toFixed(2)} € comprados; final 14.200 € (${S.A.compras.toFixed(2)} / ${S.B.compras.toFixed(2)} / ${r.valorNeto.toFixed(2)})`)
    }
  }

  // ── 7 · La regla del 1 % ──
  {
    const F7 = ['2021-01-28', '2021-01-29', '2021-02-01', '2021-02-02', '2021-03-01', '2021-03-02'], D7 = datosDe(F7, { A: F7.map(() => 100), B: F7.map(() => 100) })
    const r = P.ejecutaPlan(plan([bloque([['A', 0.95], ['B', 0.05]], { cada: 'nunca' }, 'partida')], { capital: 1000, aport: 300, costes: c185, desde: F7[0], hasta: F7[5] }), D7, { libro: true })
    const cB = r.libro.movimientos.filter(m => m.tipo === 'compra' && m.simbolo === 'B')
    ok(cB.length === 2 && cB[0].fecha === '2021-01-28' && cB[1].fecha === '2021-03-01' && cerca(r.libro.porSimbolo.B.compras, 79.63), `los 15 € de B de febrero esperan y entran en marzo con los siguientes (${cB.map(m => `${m.fecha} ${m.importe.toFixed(3)}`).join(', ')})`)
    ok(r.costes.ordenes === 7 && cerca(r.valorNeto, 1598.705), `7 órdenes y 1.598,705 € al final (${r.costes.ordenes} / ${r.valorNeto.toFixed(4)})`)
    const feb = r.serie.find(x => x.date === '2021-02-01')
    ok(cerca(feb.patrimonio, 1300 - 3 * 0.185), `mientras espera, ese dinero sigue en el bloque: el 01/02, 1.300 − 3 × 0,185 = 1.299,445 € (${feb.patrimonio.toFixed(3)})`)
  }

  // ── 8 · La liquidez del bloque y un símbolo sin precio al empezar ──
  {
    const F8 = ['2021-01-28', '2021-01-29', '2021-02-01'], D8 = datosDe(F8, { A: [100, 110, 121] })
    const r = P.ejecutaPlan(plan([bloque([['A', 0.7], ['LIQUIDEZ', 0.3]])], { desde: F8[0], hasta: F8[2] }), D8)
    ok(cerca(r.valorNeto, 70 * 121 + 3000), `70 % A + 30 % liquidez: 70 A a 121 + 3.000 € que no rinden = 11.470 € (${r.valorNeto.toFixed(2)})`)
    let msg = ''; try { P.ejecutaPlan(plan([bloque([['A', 0.5], ['C', 0.5]])], { desde: F8[0], hasta: F8[2] }), { ...D8, velas: { ...D8.velas, C: [vela('2021-02-01', 50)] } }) } catch (e) { msg = e.message }
    ok(/C no tiene precios al empezar el plan \(2021-01-28\)/.test(msg), `un símbolo que aún no cotiza el primer día lo dice (${msg})`)
  }

  console.log(`plan-pesos: ${fallos ? `${fallos} fallos` : 'todo bien'}`)
  process.exit(fallos ? 1 : 0)
})().catch(e => { console.error(e); process.exit(2) })
