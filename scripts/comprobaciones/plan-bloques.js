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
    // §187: y con un ocioso que cambia entre la apertura y el cierre: el dinero que hay a la apertura va al ocioso a la apertura (como con
    // un bloque); con dos bloques iguales, el mismo resultado al céntimo.
    const dO = () => { const x = d(); x.velas.OCI = F.map((date, k) => { const o = 50 + 5 * Math.sin(k / 7), c = o * (1 + 0.01 * Math.cos(k / 2)); return { date, open: o, high: Math.max(o, c), low: Math.min(o, c), close: c, volume: 1 } }); return x }
    const unoO = P.ejecutaPlan({ ...base, piezas: [{ ...pieza('e', 'TEST', 1), ocioso: 'OCI' }] }, dO()), dosO = P.ejecutaPlan({ ...base, piezas: [{ ...pieza('a', 'TEST', 0.5), ocioso: 'OCI' }, { ...pieza('b', 'TEST2', 0.5), ocioso: 'OCI' }] }, dO())
    ok(cerca(dosO.valorNeto, unoO.valorNeto) && dosO.serie.every((x, k) => cerca(x.patrimonio, unoO.serie[k].patrimonio)), `con un ocioso que se mueve: dos bloques iguales = un bloque, cada día (${dosO.valorNeto} frente a ${unoO.valorNeto})`)
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

  // ── 7 · Los ajustes de la pantalla (§187): planDe / ajustesDe con varios bloques, añadir, quitar y repartir ──
  const Pa = require(R + '/lib/builder/planPantalla.js'), Lt = require(R + '/lib/lotesLab.js')
  const estS = { id: 'y', name: 'Sigue la tendencia', definition: EMA, params: { ema: 3 } }, deId = (id) => ({ x: FOTO, y: estS })[id] || null
  {
    const a0 = { ...Pa.AJUSTES_PLAN, activo: 'AAPL', ocioso: 'GLD', impuestos: 'ninguno' }
    const a1 = Pa.anadeBloque(a0, 'x')
    ok(a1.peso === 50 && a1.bloques.length === 1 && a1.bloques[0].peso === 50 && a1.bloques[0].estId === 'x' && a1.bloques[0].activo === 'AAPL' && a1.dineroLibre === 'tope', '«+ Añadir bloque» con uno: 50 % y 50 %, con la estrategia y el valor del bloque 1')
    const a2 = { ...a1, peso: 60, bloques: [{ ...a1.bloques[0], peso: 40, estId: 'y', activo: 'MSFT' }] }
    const p = Pa.planDe(a2, FOTO, null, deId)
    ok(p.piezas.length === 2 && p.piezas[0].peso === 0.6 && p.piezas[1].peso === 0.4 && p.piezas.every(x => x.ocioso === 'GLD' && x.apalancamiento === 1 && x.aportacionDentro === 'espera') && p.piezas[1].estrategia.name === 'Sigue la tendencia' && p.piezas[1].activo === 'MSFT' && p.reparto.dineroLibre === 'tope', 'planDe: dos piezas (60 % y 40 %), el ocioso de la cuenta en las dos, la estrategia y el valor de cada bloque')
    ok(P.validaPlan(p).length === 0, `y es un plan válido ${P.validaPlan(p).join(' ')}`)
    const b = Pa.ajustesDe(p)
    ok(b.peso === 60 && b.bloques.length === 1 && b.bloques[0].peso === 40 && b.bloques[0].estId === 'y' && Lt.jsonCanonico(Pa.planDe(b, FOTO, null, deId)) === Lt.jsonCanonico(p), 'ida y vuelta: planDe(ajustesDe(plan)) es el mismo plan')
    ok(Lt.jsonCanonico(Pa.planDe(Pa.ajustesDe(p), FOTO, null, () => null)) === Lt.jsonCanonico(p), 'un plan guardado conserva la estrategia de cada bloque aunque ya no esté entre las tuyas (su foto)')
    ok(Pa.planDe({ ...a2, dineroLibre: 'prioridad' }, FOTO, null, deId).reparto.dineroLibre === 'prioridad', '«Solo prioridad» se guarda en el plan')
    const sin = Pa.quitaBloque(a2, 'b2')
    ok(!('bloques' in sin) && !('peso' in sin) && Lt.jsonCanonico(Pa.planDe(sin, FOTO)) === Lt.jsonCanonico(Pa.planDe(a0, FOTO)), 'quitar el único bloque extra: el plan de un bloque de siempre, idéntico')
    const a3 = Pa.anadeBloque(a2, 'x')
    ok(a3.peso === 30 && a3.bloques[0].peso === 40 && a3.bloques[1].peso === 30 && a3.bloques[1].id === 'b3' && Pa.sumaPesos(a3) === 100, 'un tercer bloque se lleva la mitad del más grande: 30 / 40 / 30')
    ok(Pa.quitaBloque(a3, 'b2').peso === 70 && Pa.quitaBloque(a3, 'b2').bloques.length === 1, 'quitar un bloque: su % pasa al bloque 1 (30 + 40 = 70)')
    const r = Pa.repartirResto({ ...a2, peso: 30, bloques: [{ ...a2.bloques[0], peso: 30 }] })
    ok(r.peso === 50 && r.bloques[0].peso === 50, '«Repartir el resto»: 30 y 30 pasan a 50 y 50')
    const r3 = Pa.repartirResto({ ...a3, peso: 10, bloques: [{ ...a3.bloques[0], peso: 10 }, { ...a3.bloques[1], peso: 10 }] })
    ok(Pa.sumaPesos(r3) === 100 && r3.peso === 33.34, `con tres iguales: 33,34 / 33,33 / 33,33 (${r3.peso}, ${r3.bloques.map(x => x.peso)})`)
    ok(P.validaPlan(Pa.planDe(r3, FOTO, null, deId)).length === 0, 'y suman 100 % para el motor')
  }

  // ── 8 · La pantalla (§187): bloques en filas, «+ Añadir bloque», «Reparto entre bloques» y el ocioso en «Tu dinero» ──
  {
    const path = require('path'), React = require(path.join(R, 'node_modules', 'react')), RDC = require(path.join(R, 'node_modules', 'react-dom', 'client'))
    const BP = require(R + '/components/BuilderPlan.js').default
    let pedidos = []
    const a2 = { activo: 'AAPL', ocioso: 'GLD', peso: 60, dineroLibre: 'tope', bloques: [Pa.bloqueNuevo('b2', 40, 'MSFT', 'y')] }
    const props = (ini) => ({ estrategias: [FOTO, estS], estrategiaId: 'x', datosLista: { watchlist: [{ symbol: 'AAPL', name: 'Apple', list_ids: [] }, { symbol: 'MSFT', name: 'Microsoft', list_ids: [] }], wlLists: [], rankingData: {} },
      deps: { ctx: null, calcula: async (...xs) => { pedidos.push(xs); throw new Error('sin motor en la prueba') } }, inicial: { planes: [], pestana: 'n1', simbolos: ['AAPL', 'MSFT', 'GLD'], pruebas: [], resultadoPrueba: null, ...ini } })
    const hasta = async (cond, max = 20000) => { const t0 = Date.now(); do { await D.espera(5); try { if (cond()) { await D.espera(5); return true } } catch (_) {} } while (Date.now() - t0 < max); return false }
    const m = D.monta(React.createElement(BP, props({ ajustes: a2 })), RDC); await D.espera(60)
    const tarjeta = (id) => m.raiz.conAtributo('data-tarjeta', id)[0], boton = (id) => m.raiz.conAtributo('data-boton', id)[0]
    ok(m.raiz.conAtributo('data-bloque', '1').length === 1 && m.raiz.conAtributo('data-bloque', '2').length === 1 && m.raiz.conAtributo('data-barra-cartera', 'bloques').length === 1, 'dos bloques en filas y la barra con los dos')
    ok(m.raiz.conAtributo('data-parte').map(x => x.textContent).join('|') === '60 %|40 %', `cada fila con su % (${m.raiz.conAtributo('data-parte').map(x => x.textContent).join('|')})`)
    ok(/Sigue la tendencia/.test(m.raiz.conAtributo('data-bloque', '2')[0].textContent) && /en MSFT/.test(m.raiz.conAtributo('data-bloque', '2')[0].textContent), 'el bloque 2 con su estrategia y su valor')
    ok(m.raiz.conAtributo('data-reparto-bloques').length === 1 && /Con tope/.test(m.raiz.conAtributo('data-reparto-bloques')[0].textContent), '«Reparto entre bloques», con «Con tope»')
    ok(tarjeta('tu-dinero').conAtributo('data-ocioso-de', 'cuenta').length === 1 && !m.raiz.conAtributo('data-bloque', '1')[0].conAtributo('data-ocioso-de').length, 'el dinero ocioso, de la cuenta: en «Tu dinero» y no en el bloque')
    ok(!/Apalancamiento/.test(m.raiz.conAtributo('data-bloque', '1')[0].textContent) && m.raiz.conAtributo('data-aviso', 'todavia-bloques').length === 1, 'sin apalancamiento ni «Compra más acción» con varios bloques (y lo dice)')
    await hasta(() => pedidos.length > 0)
    const pp = pedidos[pedidos.length - 1]?.[0]
    ok(pp?.piezas?.length === 2 && pp.piezas[1].activo === 'MSFT' && pp.piezas[1].peso === 0.4 && !pedidos[pedidos.length - 1][2], `lo que se calcula: el plan de dos bloques (sin listas, sin peticiones de candidatos)`)
    D.pulsa(m.raiz.conAtributo('data-bloque', '2')[0].conAtributo('data-boton', 'quitar-bloque')[0]); await hasta(() => !m.raiz.conAtributo('data-bloque', '2').length)
    ok(!m.raiz.conAtributo('data-bloque', '2').length && m.raiz.conAtributo('data-parte')[0]?.textContent === '100 %' && !m.raiz.conAtributo('data-reparto-bloques').length && m.raiz.conAtributo('data-bloque', '1')[0].conAtributo('data-ocioso-de', 'bloque').length === 1, '«Quitar»: vuelve a un bloque al 100 %, con el ocioso en el bloque')
    D.pulsa(boton('anadir-bloque')); await hasta(() => m.raiz.conAtributo('data-bloque', '2').length === 1)
    ok(m.raiz.conAtributo('data-parte').map(x => x.textContent).join('|') === '50 %|50 %', '«+ Añadir bloque»: 50 % y 50 %')
    m.quita(); await D.espera(5)
    // Con lista en el bloque 2: se pide una petición de candidatos para él (cuerposLista), con su parte del dinero inicial.
    pedidos = []
    const conLista = { ...a2, capital: 10000, bloques: [{ ...a2.bloques[0], donde: 'lista', lista: Li.mergeLista({ simbolos: ['AAPL', 'MSFT'], modo: 'concentrado' }) }] }
    const m2 = D.monta(React.createElement(BP, props({ ajustes: conLista })), RDC)
    await hasta(() => pedidos.length > 0)
    const pl = pedidos[pedidos.length - 1]
    ok(pl?.[2] && pl[2].b2 && pl[2].b2.cfg.capitalIni === 10000 * 0.4 && JSON.stringify(pl[2].b2.symbols) === '["AAPL","MSFT"]' && !pl[2].e, `con lista en el bloque 2: su petición de candidatos (4.000 €, AAPL y MSFT) en cuerposLista (${pl?.[2] ? Object.keys(pl[2]) : 'nada'})`)
    m2.quita(); await D.espera(5)
  }

  // ── 9 · «Detalle» con varios bloques (§188): un piso por bloque, con las cuentas del caso 1 y del caso 3 ──
  //   Caso 1: bloque 1 (X) +1.200 € (A: 600 × (12 − 10)); bloque 2 (Y) +956 € (B: 100 × 5 = 500; C: 456 × 1 = 456). Sin costes ni impuestos:
  //   10.000 + 1.200 + 956 = 12.156 €. «Aportó %»: 1.200 / 10.000 = 12 % y 956 / 10.000 = 9,56 %. X tiene A los días 0, 1 y 2 (lo vende a la
  //   apertura del 3): tiempo dentro 3 / 6 = 50 %; el día 0, X es 6.000 / 10.000 = 60 % del dinero.
  //   Caso 3: A en los dos bloques → su «Dinero en él» y su «Peor caída» no se pueden separar («—»); X +700 €, Y +66,67 €.
  {
    const path = require('path'), React = require(path.join(R, 'node_modules', 'react')), RDC = require(path.join(R, 'node_modules', 'react-dom', 'client'))
    const De = require(R + '/lib/builder/detallePlan.js'), PD = require(R + '/components/PlanDetalle.js').default
    const F = Array.from({ length: 6 }, (_, k) => dia('2020-01-06', k))
    const d1 = datosDe(F, { x: lista(1, 1, [activo('A', F, [10, 10, 10, 12, 12, 12], [[0, 10, 3, 12]])]),
      y: lista(2, 2, [activo('B', F, [20, 20, 21, 22, 23, 25], [[0, 20, 4, 25]]), activo('C', F, [5, 5, 5, 5, 5.5, 6], [[3, 5, 5, 6]])]) })
    const p1 = planListas([{ id: 'x', peso: 0.6, simbolos: ['A'], max: 1 }, { id: 'y', peso: 0.4, simbolos: ['B', 'C'], max: 2 }], { capital: 10000, desde: F[0], hasta: F[5] })
    p1.piezas[1] = { ...p1.piezas[1], estrategia: { ...FOTO, id: 'y', name: 'Sigue la tendencia' } }
    const r1 = P.ejecutaPlan(p1, d1, { libro: true })
    const dt = De.detallePlan({ evaluacion: { plan: { medidas: { valorNeto: r1.valorNeto }, ejecucion: r1 } } }, p1)
    const [b1, b2] = dt.bloques || []
    ok(dt.bloques?.length === 2 && b1.n === 1 && b2.n === 2 && b1.nombre === 'Cruce de medias 50/200' && b2.nombre === 'Sigue la tendencia' && b1.peso === 0.6 && b2.donde === '2 valores', 'dos bloques, en su orden, con su nombre, su parte y dónde')
    ok(cerca(b1.aporto, 1200) && cerca(b2.aporto, 956) && cerca(b1.aportoPct, 0.12) && cerca(b2.aportoPct, 0.0956), `lo ganado por bloque: +1.200 € (12 %) y +956 € (9,56 %) (${b1.aporto}, ${b2.aporto})`)
    ok(b1.valores.map(v => v.simbolo).join() === 'A' && b2.valores.map(v => v.simbolo).join() === 'B,C' && cerca(b2.valores[0].aporto, 500) && cerca(b2.valores[1].aporto, 456), 'dentro de cada bloque, sus valores: A; B +500 y C +456')
    ok(dt.bloques.every(b => cerca(b.valores.reduce((s, v) => s + v.aporto, 0), b.aporto)), 'los valores de cada bloque suman lo del bloque')
    ok(cerca(dt.suma.aportado + b1.aporto + b2.aporto + dt.suma.ocioso - dt.suma.costes - dt.suma.impuestos, 12156) && dt.suma.cuadra, 'la línea que suma por bloques: 10.000 + 1.200 + 956 = 12.156 €')
    ok(b1.operaciones === 1 && b2.operaciones === 2 && b1.ganadoras === 1 && cerca(b1.dentro, 0.5) && cerca(b1.cagr, Math.pow(1.12, 1 / ((Date.parse(F[5]) - Date.parse(F[0])) / (365.25 * 864e5))) - 1), `operaciones 1 y 2; tiempo dentro del bloque 1: 3 de 6 días (${b1.dentro})`)
    ok(cerca(r1.estrategias.x.dentro[0], 0.6) && Number.isFinite(b1.enEl) && b1.valores[0].enEl != null && !b1.valores[0].compartido, `dinero en el bloque 1 el día 0: 60 %; un valor que solo está en un bloque lleva su «Dinero en él»`)
    ok(dt.curvasBloques.series.length === 2 && dt.curvasBloques.series.map(s => s.bloque).join() === '1,2' && cerca(dt.curvasBloques.series[0].v[5], 1200) && cerca(dt.curvasBloques.series[1].v[5], 956), '«Bloque a bloque»: una curva por bloque que acaba en lo que ganó')
    ok(dt.porOperacion.ops.every(o => o.bloque === (o.simbolo === 'A' ? 1 : 2)) && dt.movimientos.filter(m => m.tipo === 'compra').every(m => m.bloque === (m.simbolo === 'A' ? 1 : 2)) && dt.movimientos[0].bloque === null, 'cada operación y cada compra con el número de su bloque; lo de la cuenta, sin bloque')
    ok(De.historial(dt.porOperacion.ops, 'bloque 2').length === 2 && De.filtraMovimientos(dt.movimientos, 'bloque 1').length === 2, 'buscar «bloque 2» en el historial deja solo las suyas')
    ok(dt.donde.dias.every(z => cerca(z.bq[0] + z.bq[1], z.valores)) && cerca(dt.donde.dias[0].bq[0], 0.6) && dt.donde.bloques.length === 2, '«Dónde está tu dinero»: los bloques suman «en valores» cada día (el día 0, el bloque 1 es el 60 %)')
    ok(!dt.unValor && dt.cabecera.bloques === 2 && dt.cabecera.valores === 3, 'con varios bloques no es «un valor»: 2 bloques, 3 valores')
    ok(/QUÉ APORTÓ CADA BLOQUE/.test(De.textoDetalle(dt)) && /Bloque 2 · Sigue la tendencia/.test(De.textoDetalle(dt)), '«Copiar para Claude» con los bloques')
    // Caso 3: un valor en los dos bloques
    const F3 = ['2020-06-01', '2020-06-02', '2020-12-01', '2021-03-01', '2021-07-01', '2021-07-02'], pA = [100, 150, 160, 170, 170, 170]
    const p3 = planListas([{ id: 'x', peso: 0.5, simbolos: ['A'], max: 1 }, { id: 'y', peso: 0.5, simbolos: ['A'], max: 1 }], { capital: 2000, impuestos: 'ES-ahorro', desde: F3[0], hasta: F3[5] })
    const r3 = P.ejecutaPlan(p3, datosDe(F3, { x: lista(1, 1, [activo('A', F3, pA, [[0, 100, 3, 170]])]), y: lista(1, 1, [activo('A', F3, pA, [[1, 150, 2, 160]])]) }), { libro: true })
    const d3 = De.detallePlan({ evaluacion: { plan: { medidas: { valorNeto: r3.valorNeto }, ejecucion: r3 } } }, p3)
    ok(cerca(d3.bloques[0].aporto, 700) && cerca(d3.bloques[1].aporto, 200 / 3) && d3.bloques.every(b => b.valores[0].compartido && b.valores[0].enEl == null && b.valores[0].caidaPct == null), 'A en dos bloques: +700 € y +66,67 €; su «Dinero en él» y su caída, «—»')
    ok(cerca(d3.suma.aportado + d3.bloques[0].aporto + d3.bloques[1].aporto - d3.suma.costes - d3.suma.impuestos, 2621) && d3.suma.cuadra, 'y la suma: 2.000 + 700 + 66,67 − 145,67 de impuestos = 2.621 €')
    // La pantalla
    const m = D.monta(React.createElement(PD, { detalle: dt, cifras: null }), RDC); await D.espera(30)
    const t = (k, v) => m.raiz.conAtributo(k, v)
    ok(t('data-tabla', 'detalle-bloques').length === 1 && !t('data-tabla', 'detalle-valores').length && t('data-fila-bloque').length === 2, '«Qué aportó cada bloque» en lugar de «Qué aportó cada valor»')
    ok(/\+ ?1\.200 € ganados con el bloque 1/.test(t('data-suma', 'bloque-1')[0]?.textContent || '') && /956 € ganados con el bloque 2/.test(t('data-suma', 'bloque-2')[0]?.textContent || ''), `la línea que suma, bloque a bloque (${t('data-suma', 'bloque-1')[0]?.textContent})`)
    ok(/2 bloques · 3 valores/.test(t('data-detalle-cabecera')[0].textContent) && !/velas diarias/.test(t('data-detalle-cabecera')[0].textContent), 'la cabecera dice «2 bloques · 3 valores» (las velas, en cada bloque)')
    ok(!t('data-valor-bloque').length, 'los bloques, plegados al entrar')
    D.pulsa(t('data-expande-bloques')[0]); await D.espera(10)
    ok(t('data-valor-bloque').length === 3 && /Plegar todo/.test(t('data-expande-bloques')[0].textContent), '«Expandir todo» abre los tres valores')
    D.pulsa(t('data-pliega-bloque', '1')[0]); await D.espera(10)
    ok(t('data-valor-bloque').length === 2, 'pulsar el bloque 1 lo pliega (quedan los 2 del bloque 2)')
    ok(t('data-modo-crece', 'bloques').length === 1, 'en «Cómo crece», el botón «Bloque a bloque»')
    D.pulsa(t('data-modo-crece', 'bloques')[0]); await D.espera(10)
    ok(t('data-grafico', 'bloques').length === 1 && t('data-chip-valor', 'Bloque 1').length === 1, '«Bloque a bloque» dibuja una línea por bloque')
    ok(t('data-banda', 'bloque-1').length === 1 && t('data-banda', 'bloque-2').length === 1 && !t('data-banda', 'valores').length, '«Dónde está tu dinero», con una franja por bloque')
    ok(t('data-bloque-fila', '2').length === 2 && /Bloque/.test(t('data-tabla', 'detalle-historial')[0].textContent), 'el historial con la columna «Bloque»')
    m.quita(); await D.espera(5)
  }

  console.log(fallos ? `\n${fallos} FALLOS` : '\nplan-bloques: todo bien')
  process.exit(fallos ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
