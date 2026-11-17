// scripts/comprobaciones/plan-bloques.js — un plan con VARIOS BLOQUES (docs/builder.md §185): una sola cuenta (dinero libre y ocioso
// comunes), el tope de cada bloque, el orden «el más atrasado primero» y los impuestos de la cuenta. Las corre comunes.sh. Termina en 0
// si todo da lo esperado. Las cuentas, a mano (en los comentarios), sin comisiones salvo que se diga.
//
// 1 · TOPE. 10.000 €: bloque X 60 % (lista [A], concentrado máx. 1) y bloque Y 40 % (lista [B, C], concentrado máx. 2). Ocioso en liquidez.
//     Día 0: X compra 6.000 € de A a 10 (600); Y: su presupuesto (4.000) entre sus 2 huecos = 2.000 € → compra 100 B a 20. (Liquidez 2.000.)
//     Día 3: A sale a 12 → +7.200 (liquidez 9.200). A la apertura, B vale 22: patrimonio 9.200 + 100 × 22 = 11.400. C da señal (a 5): en Y
//     cabe hasta 0,4 × 11.400 = 4.560 − 2.200 (lo que ya vale) = 2.360; su reparto: 4.560 / 2 huecos = 2.280 por valor → compra 2.280 €
//     de C (456). Liquidez 6.920.
//     Día 4: B sale a 25 → +2.500 (9.420). Día 5: C sale a 6 → +2.736. Final 12.156 €.
//     Con «solo prioridad» (sin tope, el reparto de cada bloque cuenta con todo el dinero libre): el día 0 va primero X (el más atrasado)
//     y, con máx. 1, se lo queda todo: 1.000 A; Y se queda sin dinero (B no entra). Día 3: A sale a 12 → 12.000; C: 12.000 / 2 huecos =
//     6.000 → 1.200 C. Día 5: C a 6 → 7.200; final 6.000 + 7.200 = 13.200 €.
// 2 · EL MÁS ATRASADO PRIMERO, OCIOSO COMÚN. 11.000 €: X 60 % (lista [A, D], concentrado máx. 1), Y 40 % (lista [B, C], concentrado
//     máx. 2). Ocioso OCI, siempre a 50.
//     Día 0: X compra 6.600 € de A a 10 (660); Y 4.400 / 2 = 2.200 € de B a 20 (110); quedan 2.200 € → al cierre, 44 OCI.
//     Día 2: A sale a 15 → 9.900 €. Patrimonio a la apertura 9.900 + 2.200 (OCI) + 2.200 (B) = 14.300. Atrasos: X 0,6 − 0 = 0,6;
//     Y 0,4 − 2.200 / 14.300 = 0,246 → primero X: cabe 0,6 × 14.300 = 8.580 → compra 858 D a 10 (liquidez 1.320). Luego Y: cabe
//     5.720 − 2.200 = 3.520; su reparto: 5.720 / 2 = 2.860 → necesita 2.860: 1.320 de liquidez + 1.540 del ocioso (30,8 OCI) → 572 C a 5.
//     Al cierre del día 2: X 8.580, Y 2.200 + 2.860 = 5.060, cuenta 13,2 × 50 = 660. Día 3, todo sale plano: 14.300 €.
//     Con «solo prioridad»: el día 0 X se lo queda todo (1.100 A) e Y no compra B; el día 2, 1.100 × 15 = 16.500 → 1.650 D, e Y tampoco
//     compra C (dos señales «sin dinero»).
// 3 · UN VALOR EN DOS BLOQUES: IMPUESTOS FIFO DE LA CUENTA. 2.000 €, X 50 % y Y 50 %, las dos listas con A, impuestos de España.
//     01/06/2020 X compra 1.000 € de A a 100 (10). 02/06/2020 (A a 150) Y cabe 1.250 y hay 1.000 libres → 6,6667 A a 150.
//     01/12/2020 Y vende sus 6,6667 a 160 → Hacienda: FIFO, salen las de X (a 100): 6,6667 × 60 = 400 € (por bloque serían 66,67).
//     01/03/2021 X vende 10 a 170 → quedan 3,3333 a 100 y 6,6667 a 150: 233,33 + 133,33 = 366,67 €. Julio 2021: 19 % de 400 = 76 €.
//     Al final (02/07/2021): 19 % de 366,67 = 69,67 €. 1.000 + 1.066,67 + 1.700 = 2.766,67 − 76 − 69,67 = 2.621 €. Por bloque: X +700,
//     Y +66,67 (antes de impuestos).
// 4 · DOS BLOQUES IGUALES AL 50 % (la misma estrategia de un valor sobre dos valores con las mismas velas) = el plan de UN bloque con
//     todo el dinero (ocioso en liquidez, sin costes): cada bloque compra siempre la mitad.
// 5 · Validación.
// 6 · SOLO LO QUE SE PODRÍA HACER EN LA REALIDAD: el dinero de una venta a mitad de sesión no paga una compra a la apertura de ese día.
//     1.000 €, X 70 % (lista [A]) e Y 30 % (lista [B]), con tope, ocioso en liquidez. Día 0: Y compra 300 € de B a 20 (15); X no tiene
//     señal (700 € libres). Día 1: B abre a 40 y salta su stop a 39 → 585 € que llegan A MITAD DE SESIÓN. Patrimonio 700 + 585 = 1.285: en
//     X cabrían 0,7 × 1.285 = 899,50 €, pero a la apertura solo hay 700 → compra 70 A a 10. Día 2: A sale a 11 → 770; final 1.355 €.
process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://arnes.invalid'; process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'clave-falsa-del-arnes'
const C0 = require('./cargador'), R = C0.RAIZ, D = require('./domFalso')
let fallos = 0
const ok = (c, t) => { console.log(`${c ? 'OK  ' : 'MAL '} ${t}`); if (!c) fallos++ }
const cerca = (a, b, tol = 1e-9) => Number.isFinite(a) && Math.abs(a - b) <= tol * Math.max(1, Math.abs(b))
const dia = (f, n) => new Date(Date.parse(f + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10)
const EMA = { tipo: 'editor', motor: 1, formato: 1, nombre: 'EMA2', stops: [{ id: 'inicial', pct: 8, tipo: 'porcentaje', motivo: 'stop' }],
  entrada: { orden: { tipo: 'apertura' }, senal: { c: 'cruza', de: { c: 'precioVsMedia', p: { lado: 'encima', tipo: 'EMA', periodo: '$ema' } } } },
  salidas: [{ si: { c: 'cruza', de: { c: 'precioVsMedia', p: { lado: 'debajo', tipo: 'EMA', periodo: '$ema' } } }, tipo: 'condicion', motivo: 'cruce_bajista', precio: 'apertura' }],
  parametros: { lista: [{ max: 400, min: 2, paso: 1, tipo: 'entero', nombre: 'ema', defecto: 20, ventana: true, descripcion: 'Periodo de la EMA' }], version: 1, restricciones: [] } }
const FOTO = { id: 'x', name: 'Cruce de medias 50/200', definition: EMA, params: { ema: 2 } }

;(async () => {
  D.pon(); await C0.prepara(); C0.registra(R)
  const P = require(R + '/lib/planes/plan.js'), Li = require(R + '/lib/planes/lista.js'), Ev = require(R + '/lib/planes/evalua.js')

  // Un plan de bloques con lista: bloques = [{ id, peso, simbolos, max }].
  const planListas = (bloques, { capital, ocioso = 'LIQUIDEZ', dineroLibre, impuestos = 'ninguno', desde, hasta }) => ({ tipo: 'plan', formato: 1, calculo: 1,
    dinero: { capitalInicial: capital, aportaciones: { frecuencia: 'ninguna' }, extraordinarias: [] },
    piezas: bloques.map(b => ({ id: b.id, tipo: 'estrategia', estrategia: FOTO, activo: b.simbolos[0], peso: b.peso, ocioso, aportacionDentro: 'espera', apalancamiento: 1, velas: 'diarias',
      donde: 'lista', lista: Li.mergeLista({ simbolos: b.simbolos, modo: 'concentrado', maxPosiciones: b.max }) })),
    reparto: { aportacionesA: 'pesos', rebalanceo: { calendario: 'nunca', banda: null }, ...(dineroLibre ? { dineroLibre } : {}) },
    impuestos: { regimen: impuestos, reglaDosMeses: true }, costes: null, periodo: { desde, hasta } })
  const activo = (symbol, F, precios, candidatos) => ({ symbol, fechas: F, abre: precios, cierra: precios, candidatos: candidatos.map(([e, pe, s, ps]) => ({ symbol, entryDate: F[e], entryPx: pe, exitDate: F[s], exitPx: ps })) })
  const datosDe = (F, listas, velas = {}) => { const plano = F.map(date => ({ date, open: 100, close: 100 })); return { fechas: F, qqq: plano, spy: plano, etf: F.map(() => null), qqqVelas: plano, velas, listas } }
  const lista = (n, max, activos) => ({ opciones: { modo: 'concentrado', n, maxPosiciones: max, prioridad: 'alfabetico' }, activos })
  const uds = (r, id, sym) => r.libro.movimientos.filter(m => m.pieza === id && m.simbolo === sym && m.tipo === 'compra').reduce((s, m) => s + m.unidades, 0)

  // ── 1 · Tope ──
  {
    const F = Array.from({ length: 6 }, (_, k) => dia('2020-01-06', k))
    const d = () => datosDe(F, {
      x: lista(1, 1, [activo('A', F, [10, 10, 10, 12, 12, 12], [[0, 10, 3, 12]])]),
      y: lista(2, 2, [activo('B', F, [20, 20, 21, 22, 23, 25], [[0, 20, 4, 25]]), activo('C', F, [5, 5, 5, 5, 5.5, 6], [[3, 5, 5, 6]])]) })
    const bl = [{ id: 'x', peso: 0.6, simbolos: ['A'], max: 1 }, { id: 'y', peso: 0.4, simbolos: ['B', 'C'], max: 2 }]
    const pT = planListas(bl, { capital: 10000, desde: F[0], hasta: F[5] })
    ok(P.validaPlan(pT).length === 0, `el plan de dos bloques es válido ${P.validaPlan(pT).join(' ')}`)
    const r = P.ejecutaPlan(pT, d(), { libro: true })
    ok(cerca(uds(r, 'x', 'A'), 600) && cerca(uds(r, 'y', 'B'), 100), `día 0: X compra 600 A (6.000 €) e Y 100 B (2.000 €: su presupuesto 4.000 / 2 huecos) (${uds(r, 'x', 'A')}, ${uds(r, 'y', 'B')})`)
    ok(cerca(uds(r, 'y', 'C'), 456), `día 3, con tope: Y compra 2.280 € de C → 456 (obtenido ${uds(r, 'y', 'C')})`)
    ok(cerca(r.valorNeto, 12156), `con tope: final 12.156 € (obtenido ${r.valorNeto})`)
    ok(cerca(r.libro.porBloque.x.ganado, 1200) && cerca(r.libro.porBloque.y.ganado, 500 + 456), `por bloque: X +1.200 €, Y +956 € (${r.libro.porBloque.x.ganado}, ${r.libro.porBloque.y.ganado})`)
    ok(cerca(r.libro.puente.valorNeto - r.libro.puente.descuadre, 12156) && Math.abs(r.libro.puente.descuadre) < 1e-6, 'la línea que suma cuadra')
    ok(r.libro.curvasBloque.x.length === r.serie.length && cerca(r.libro.curvasBloque.x[r.serie.length - 1], 1200), 'la curva de cada bloque acaba en lo que ganó')
    const rP = P.ejecutaPlan({ ...pT, reparto: { ...pT.reparto, dineroLibre: 'prioridad' } }, d(), { libro: true })
    ok(cerca(uds(rP, 'x', 'A'), 1000) && uds(rP, 'y', 'B') === 0 && cerca(uds(rP, 'y', 'C'), 1200) && cerca(rP.valorNeto, 13200), `con «solo prioridad»: X 1.000 A, Y sin B, luego 1.200 C y 13.200 € (obtenido ${uds(rP, 'x', 'A')}, ${uds(rP, 'y', 'B')}, ${uds(rP, 'y', 'C')}, ${rP.valorNeto})`)
  }

  // ── 2 · El más atrasado primero y el ocioso común ──
  {
    const F = Array.from({ length: 4 }, (_, k) => dia('2020-01-06', k))
    const OCI = F.map(date => ({ date, open: 50, high: 50, low: 50, close: 50, volume: 1 }))
    const d = () => datosDe(F, {
      x: lista(2, 1, [activo('A', F, [10, 15, 15, 15], [[0, 10, 2, 15]]), activo('D', F, [10, 10, 10, 10], [[2, 10, 3, 10]])]),
      y: lista(2, 2, [activo('B', F, [20, 20, 20, 20], [[0, 20, 3, 20]]), activo('C', F, [5, 5, 5, 5], [[2, 5, 3, 5]])]) }, { OCI })
    const bl = [{ id: 'x', peso: 0.6, simbolos: ['A', 'D'], max: 1 }, { id: 'y', peso: 0.4, simbolos: ['B', 'C'], max: 2 }]
    const p = planListas(bl, { capital: 11000, ocioso: 'OCI', desde: F[0], hasta: F[3] })
    const r = P.ejecutaPlan(p, d(), { libro: true })
    ok(cerca(uds(r, 'x', 'A'), 660) && cerca(uds(r, 'y', 'B'), 110) && cerca(uds(r, 'cuenta', 'OCI'), 44), `día 0: 660 A, 110 B y lo que sobra (2.200 €) al ocioso de la cuenta: 44 OCI`)
    ok(cerca(uds(r, 'x', 'D'), 858) && cerca(uds(r, 'y', 'C'), 572), `día 2: primero X (el más atrasado) 858 D, luego Y 572 C (obtenido ${uds(r, 'x', 'D')}, ${uds(r, 'y', 'C')})`)
    const vende = r.libro.movimientos.filter(m => m.pieza === 'cuenta' && m.tipo === 'venta' && m.fecha === F[2])
    ok(vende.length === 1 && cerca(vende[0].unidades, 30.8), `para Y se vende del ocioso solo lo que falta: 30,8 OCI (${vende.map(m => m.unidades)})`)
    ok(cerca(r.serie[2].piezas.x, 8580) && cerca(r.serie[2].piezas.y, 5060) && cerca(r.serie[2].piezas.cuenta, 660), 'al cierre del día 2: X 8.580, Y 5.060, cuenta 660')
    ok(cerca(r.valorNeto, 14300), `final 14.300 € (obtenido ${r.valorNeto})`)
    const rP = P.ejecutaPlan({ ...p, reparto: { ...p.reparto, dineroLibre: 'prioridad' } }, d(), { libro: true })
    ok(cerca(uds(rP, 'x', 'A'), 1100) && cerca(uds(rP, 'x', 'D'), 1650) && uds(rP, 'y', 'B') === 0 && uds(rP, 'y', 'C') === 0 && rP.libro.senales.motivos.dinero === 2, `con «solo prioridad»: X se lo queda todo (1.100 A y 1.650 D) e Y nada (dos señales sin dinero) (${uds(rP, 'x', 'D')}, ${rP.libro.senales.motivos.dinero})`)
  }

  // ── 3 · Un valor en dos bloques: FIFO de la cuenta ──
  {
    const F = ['2020-06-01', '2020-06-02', '2020-12-01', '2021-03-01', '2021-07-01', '2021-07-02'], pA = [100, 150, 160, 170, 170, 170]
    const d = () => datosDe(F, { x: lista(1, 1, [activo('A', F, pA, [[0, 100, 3, 170]])]), y: lista(1, 1, [activo('A', F, pA, [[1, 150, 2, 160]])]) })
    const p = planListas([{ id: 'x', peso: 0.5, simbolos: ['A'], max: 1 }, { id: 'y', peso: 0.5, simbolos: ['A'], max: 1 }], { capital: 2000, impuestos: 'ES-ahorro', desde: F[0], hasta: F[5] })
    ok(P.validaPlan(p).length === 0, 'un valor en dos bloques: válido')
    const r = P.ejecutaPlan(p, d(), { libro: true })
    const a2020 = r.impuestos.porAnio.find(x => x.anio === '2020')
    ok(cerca(a2020?.plusvalia, 400) && cerca(a2020?.impuesto, 76), `2020: Hacienda cuenta 400 € (FIFO: salen las de X, a 100), 76 € de impuesto (${a2020?.plusvalia}, ${a2020?.impuesto})`)
    ok(cerca(r.impuestos.final, 0.19 * 1100 / 3), `al final, 19 % de 366,67 = 69,67 € (${r.impuestos.final})`)
    ok(cerca(r.valorNeto, 2621), `final 2.621 € (obtenido ${r.valorNeto})`)
    ok(cerca(r.libro.porBloque.x.ganado, 700) && cerca(r.libro.porBloque.y.ganado, 200 / 3), `por bloque, antes de impuestos: X +700, Y +66,67 (${r.libro.porBloque.x.ganado}, ${r.libro.porBloque.y.ganado})`)
  }

  // ── 4 · Dos bloques iguales al 50 % = un bloque con todo ──
  {
    const LUNES0 = '2020-03-02', F = Array.from({ length: 330 }, (_, k) => dia(LUNES0, k - 300)).filter(f => ![0, 6].includes(new Date(f + 'T00:00:00Z').getUTCDay()))
    let px = 100
    const TEST = F.map((date, k) => { const o = px; px = Math.max(5, px * (1 + 0.03 * Math.sin(k / 3) + 0.004 * Math.cos(k * 1.7))); return { date, open: o, high: Math.max(o, px) * 1.01, low: Math.min(o, px) * 0.99, close: px, volume: 1 } })
    const d = () => { const plano = F.map(date => ({ date, open: 100, close: 100 })); return { fechas: F, qqq: plano, spy: plano, etf: F.map(() => null), qqqVelas: plano, velas: { TEST, TEST2: TEST.map(x => ({ ...x })) } } }
    const pieza = (id, activo, peso) => ({ id, tipo: 'estrategia', estrategia: FOTO, activo, peso, ocioso: 'LIQUIDEZ', aportacionDentro: 'espera', apalancamiento: 1, velas: 'diarias' })
    const base = { tipo: 'plan', formato: 1, calculo: 1, dinero: { capitalInicial: 10000, aportaciones: { frecuencia: 'ninguna' }, extraordinarias: [] }, reparto: { aportacionesA: 'pesos', rebalanceo: { calendario: 'nunca', banda: null } },
      impuestos: { regimen: 'ninguno', reglaDosMeses: true }, costes: null, periodo: { desde: F[F.length - 150], hasta: F[F.length - 1] } }
    const uno = P.ejecutaPlan({ ...base, piezas: [pieza('e', 'TEST', 1)] }, d()), dos = P.ejecutaPlan({ ...base, piezas: [pieza('a', 'TEST', 0.5), pieza('b', 'TEST2', 0.5)] }, d())
    const n = uno.estrategias.e.operaciones.length
    ok(n >= 3 && dos.estrategias.a.operaciones.length === n && dos.estrategias.b.operaciones.length === n, `las mismas operaciones en los dos bloques (${n})`)
    ok(cerca(dos.valorNeto, uno.valorNeto), `dos bloques iguales al 50 % = un bloque con todo: ${dos.valorNeto} frente a ${uno.valorNeto}`)
    ok(dos.serie.every((x, k) => cerca(x.patrimonio, uno.serie[k].patrimonio)), 'y el mismo patrimonio cada día')
    ok(dos.serie.every(x => cerca(x.piezas.a, x.piezas.b)), 'cada bloque, la mitad')
    const refs = Ev.referenciasDe({ ...base, piezas: [pieza('a', 'TEST', 0.5), pieza('b', 'TEST2', 0.5)] }).map(x => x.id)
    ok(refs.includes('OCIOSO_LIQUIDEZ') && !refs.includes('ACTIVO'), `referencias con varios bloques: el ocioso en liquidez sí, comprar y mantener «el valor» no (${refs})`)
  }

  // ── 5 · Validación ──
  {
    const pz = (id, extra = {}) => ({ id, tipo: 'estrategia', estrategia: FOTO, activo: 'AAPL', peso: 0.5, ocioso: 'GLD', aportacionDentro: 'espera', apalancamiento: 1, ...extra })
    const pl = (piezas, reparto = {}) => ({ tipo: 'plan', formato: 1, calculo: 1, dinero: { capitalInicial: 1000, aportaciones: { frecuencia: 'ninguna' }, extraordinarias: [] }, piezas,
      reparto: { aportacionesA: 'pesos', rebalanceo: { calendario: 'nunca', banda: null }, ...reparto }, impuestos: { regimen: 'ninguno' }, costes: null, periodo: { desde: '2020-01-01', hasta: '2021-01-01' } })
    const tiene = (p, t) => P.validaPlan(p).some(e => e.includes(t))
    ok(P.validaPlan(pl([pz('a'), pz('b', { activo: 'MSFT' })])).length === 0, 'dos bloques con el mismo ocioso: válido')
    ok(tiene(pl([pz('a'), pz('b', { ocioso: 'QQQ' })]), 'el mismo en todos'), 'ocioso distinto en cada bloque: no')
    ok(tiene(pl([pz('a'), pz('b', { apalancamiento: 2 })]), 'sin apalancar'), 'apalancado: todavía no')
    ok(tiene(pl([pz('a'), pz('b', { aportacionDentro: 'compra' })]), 'compra más acción'), '«compra más acción»: todavía no')
    ok(tiene(pl([pz('a'), pz('b')], { rebalanceo: { calendario: 'anual', banda: null } }), '«nunca»'), 'vender para volver al reparto: todavía no')
    ok(tiene(pl([pz('a'), pz('b')], { dineroLibre: 'otro' }), '«tope» o «prioridad»'), 'dinero libre desconocido: no')
    ok(P.esBloques(pl([pz('a'), pz('b')])) && !P.esBloques(pl([pz('a', { peso: 1 })])) && !P.esBloques(pl([pz('a'), { id: 'q', tipo: 'activo', activo: 'QQQ', peso: 0.5 }])), 'esBloques: dos o más bloques de estrategia')
    ok(tiene(pl([pz('a'), pz('b', { activo: 'GLD' })]), 'el valor de un bloque'), 'el ocioso no puede ser el valor de un bloque')
  }

  // ── 6 · El dinero de una venta a mitad de sesión ──
  {
    const F = Array.from({ length: 3 }, (_, k) => dia('2020-01-06', k))
    const d = () => datosDe(F, { x: lista(1, 1, [activo('A', F, [10, 10, 11], [[1, 10, 2, 11]])]), y: lista(1, 1, [activo('B', F, [20, 40, 40], [[0, 20, 1, 39]])]) })
    const p = planListas([{ id: 'x', peso: 0.7, simbolos: ['A'], max: 1 }, { id: 'y', peso: 0.3, simbolos: ['B'], max: 1 }], { capital: 1000, desde: F[0], hasta: F[2] })
    const r = P.ejecutaPlan(p, d(), { libro: true })
    ok(cerca(uds(r, 'y', 'B'), 15) && cerca(uds(r, 'x', 'A'), 70), `X compra a la apertura solo con lo que hay a esa hora: 70 A, no 89,95 (obtenido ${uds(r, 'x', 'A')})`)
    ok(cerca(r.valorNeto, 1355) && cerca(r.serie[1].piezas.cuenta, 585) && cerca(r.serie[1].piezas.y, 0), `los 585 € del stop pasan a la cuenta al acabar el día; final 1.355 € (obtenido ${r.valorNeto})`)
  }

  console.log(fallos ? `\n${fallos} FALLOS` : '\nplan-bloques: todo bien')
  process.exitCode = fallos ? 1 : 0
})().catch(e => { console.error(e); process.exitCode = 1 })
