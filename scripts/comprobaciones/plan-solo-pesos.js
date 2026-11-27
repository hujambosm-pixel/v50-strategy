// scripts/comprobaciones/plan-solo-pesos.js — un plan SOLO «Con pesos», sin el bloque 1 de estrategia (docs/builder.md §279).
// Las corre comunes.sh. Termina en 0 si todo da lo esperado.
//
// A mano.
//   1 · Ajustes ↔ plan: «+ Añadir bloque» Con pesos (50/50) y «Quitar» el bloque 1 → un solo bloque «Con pesos» al 100 % (peso 1 en el
//       motor), sin «dinero libre»; al guardarlo y abrirlo, vuelve igual (sinBloque1). «Con una estrategia» vuelve a poner el bloque 1 con la
//       mitad; «Con pesos» añade otro detrás (los dos, 50/50).
//   2 · El motor con un solo bloque «Con pesos» (10.000 €, sin costes): A a 10 y B a 20 todo el periodo, pesos 50/50 → 500 de A y 250 de B;
//       el último día A a 12 y B a 18 → 500 × 12 + 250 × 18 = 10.500 €.
//   3 · Referencias: el mismo plan sin sus reglas (si las tiene), QQQ, SPY y liquidez; ni «Solo el bloque…» ni el ocioso.
//   4 · La pantalla: «🗑 Quitar» en el bloque 1 lo quita (el «Con pesos» pasa a ser el bloque 1, al 100 %, sin «Parte de tu dinero») y
//       «+ Añadir bloque ▾» → «Con una estrategia» lo vuelve a poner (50 % y 50 %).
process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://arnes.invalid'; process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'clave-falsa-del-arnes'
const C0 = require('./cargador'), R = C0.RAIZ
let fallos = 0
const ok = (c, t) => { console.log(`${c ? 'OK  ' : 'MAL '} ${t}`); if (!c) fallos++ }

;(async () => {
  await C0.prepara(); C0.registra(R)
  const Pa = require(R + '/lib/builder/planPantalla.js'), Pl = require(R + '/lib/planes/plan.js'), Ev = require(R + '/lib/planes/evalua.js')
  const est = { id: 7, name: 'Cruce de medias 50/200', definition: { tipo: 'editor', motor: 1, formato: 1, nombre: 'X', entrada: { orden: { tipo: 'apertura' }, senal: { c: 'precioVsMedia', p: {} } }, stops: [], salidas: [] } }

  // ── 1 · Ajustes ↔ plan ──
  let a = { ...Pa.AJUSTES_PLAN }
  a = Pa.anadeBloque(a, '7', 'pesos')
  ok(Pa.cuantosBloques(a) === 2 && a.peso === 50 && a.bloques[0].peso === 50, 'con un bloque «Con pesos»: 50 % y 50 %')
  ok(JSON.stringify(Pa.quitaBloque(Pa.quitaBloque1(a), a.bloques[0].id)) === JSON.stringify(Pa.quitaBloque1(a)), 'sin el bloque 1, el último bloque no se puede quitar')
  a = Pa.quitaBloque1(a)
  ok(a.sinBloque1 === true && a.bloques.length === 1 && a.bloques[0].peso === 100 && Pa.cuantosBloques(a) === 1 && Pa.sumaPesos(a) === 100, 'quitar el bloque 1: su % pasa al otro (100 %)')
  a = { ...a, bloques: [{ ...a.bloques[0], pesos: [{ simbolo: 'SPY', peso: 100 }] }] }
  const plan = Pa.planDe(a, est)
  ok(plan.piezas.length === 1 && plan.piezas[0].tipo === 'pesos' && plan.piezas[0].peso === 1 && !plan.reparto.dineroLibre, `el plan: una pieza «Con pesos» al 100 % sin dinero libre (${JSON.stringify(plan.piezas.map(p => [p.tipo, p.peso]))})`)
  ok(Pl.validaPlan(plan).length === 0, `el plan es válido (${Pl.validaPlan(plan).join(' ')})`)
  const a2 = Pa.ajustesDe(plan)
  ok(a2.sinBloque1 === true && a2.bloques.length === 1 && a2.bloques[0].pesos[0].simbolo === 'SPY' && JSON.stringify(Pa.planDe(a2, null)) === JSON.stringify(Pa.planDe(a, null)), 'guardado y abierto: vuelve igual (y sin estrategia)')
  const a3 = Pa.anadeBloque(a, '7', 'estrategia')
  ok(!a3.sinBloque1 && a3.peso === 50 && a3.bloques[0].peso === 50 && Pa.planDe(a3, est).piezas.map(p => p.tipo).join() === 'estrategia,pesos', '«Con una estrategia» vuelve a poner el bloque 1 con la mitad')
  const a4 = Pa.anadeBloque(a, '7', 'pesos')
  ok(a4.sinBloque1 && a4.bloques.length === 2 && a4.bloques.map(b => b.peso).join() === '50,50' && Pa.planDe(a4, null).piezas.map(p => p.tipo).join() === 'pesos,pesos' && Pa.planDe(a4, null).reparto.dineroLibre === 'tope', '«Con pesos» añade otro detrás: 50/50, con dinero libre')
  const a5 = Pa.repartirResto({ ...a4, bloques: [{ ...a4.bloques[0], peso: 30 }, { ...a4.bloques[1], peso: 30 }] })
  ok(a5.bloques.map(b => b.peso).join() === '50,50' && a5.peso === a4.peso, '«Repartir el resto» sin el bloque 1: solo entre los que hay')

  // ── 2 · El motor ──
  const F = ['2020-01-02', '2020-01-03', '2020-01-06']
  const v = (px) => F.map((_, k) => ({ open: px[k], close: px[k] }))
  const p2 = { tipo: 'plan', formato: 1, calculo: 1, dinero: { capitalInicial: 10000, aportaciones: { frecuencia: 'ninguna' }, extraordinarias: [] },
    piezas: [{ id: 'b2', tipo: 'pesos', peso: 1, pesos: [{ simbolo: 'A', peso: 0.5 }, { simbolo: 'B', peso: 0.5 }], volver: { cada: 'nunca' }, aportaciones: 'ahora' }],
    reparto: { aportacionesA: 'pesos', rebalanceo: { calendario: 'nunca', banda: null } }, impuestos: { regimen: 'ninguno', reglaDosMeses: true }, costes: null, periodo: { desde: F[0], hasta: F[2] } }
  ok(Pl.validaPlan(p2).length === 0, 'un solo bloque «Con pesos»: válido')
  const datos = { fechas: F, qqq: v([100, 100, 100]), etf: F.map(() => null), spy: v([100, 100, 100]), velas: { A: [10, 10, 12].map((c, k) => ({ date: F[k], open: c, high: c, low: c, close: c })), B: [20, 20, 18].map((c, k) => ({ date: F[k], open: c, high: c, low: c, close: c })) } }
  let r = null, err = null
  try { r = Pl.ejecutaPlan(p2, datos) } catch (e) { err = e.message }
  ok(r && Math.abs(r.valorNeto - 10500) < 1e-6, `500 × 12 + 250 × 18 = 10.500 € (${r ? r.valorNeto : err})`)

  // §279: una regla que se cumple pero no cambiaría nada no actúa. 100 % A y «si A está en su máximo histórico → 100 % A» (cada vez):
  //   A a 10, 10, 12 (cada día en máximos): no actúa nunca; 1.000 de A × 12 = 12.000 €.
  {
    const enMax = { c: 'NO', de: { c: 'caidaDesdeMaximoHistorico', p: { pct: 0.01 } } }
    const p3 = { ...p2, piezas: [{ ...p2.piezas[0], pesos: [{ simbolo: 'A', peso: 1 }], reglas: [{ filas: [{ quien: 'A', si: enMax, velas: 'diarias' }], accion: { tipo: 'pesos', pesos: [{ simbolo: 'A', peso: 1 }] }, mantenerMeses: 0, despues: { tipo: 'quedarse' }, repetir: 'siempre' }] }] }
    let r3 = null, e3 = null
    try { r3 = Pl.ejecutaPlan(p3, datos) } catch (e) { e3 = e.message }
    ok(r3 && Math.abs(r3.valorNeto - 12000) < 1e-6 && r3.pesos.b2.historial.length === 0, 'ya en esos pesos: la regla no actúa (12.000 €, ' + (r3 ? r3.pesos.b2.historial.length + ' veces' : e3) + ')')
  }

  // ── 3 · Referencias ──
  const ids = (p) => Ev.referenciasDe(p).map(x => x.id).join()
  ok(ids(p2) === 'QQQ,SPY,LIQUIDEZ', `sin reglas: QQQ, SPY y liquidez (${ids(p2)})`)
  const conReglas = { ...p2, piezas: [{ ...p2.piezas[0], reglas: [{ filas: [{ quien: 'A', si: { c: 'caidaDesdeMaximoHistorico', p: { pct: 10 } }, velas: 'diarias' }], accion: { tipo: 'vender', de: 'A' }, mantenerMeses: 0, despues: { tipo: 'quedarse' }, repetir: 'siempre' }] }] }
  const rs = Ev.referenciasDe(conReglas)
  ok(rs.map(x => x.id).join() === 'QQQ,SPY,LIQUIDEZ,SINREGLAS_b2' && !rs.find(x => x.id === 'SINREGLAS_b2').plan.piezas[0].reglas, `con reglas: también «Sin sus reglas» (${rs.map(x => x.id).join()})`)

  // ── 4 · La pantalla: «🗑 Quitar» en el bloque 1 → plan solo «Con pesos» (renumerado) y vuelta con «Con una estrategia» ──
  {
    const D = require('./domFalso'); D.pon()
    const path = require('path'), React = require(path.join(R, 'node_modules', 'react')), RDC = require(path.join(R, 'node_modules', 'react-dom', 'client'))
    const BP = require(R + '/components/BuilderPlan.js').default
    const pedidos = []
    const ini = { ...Pa.AJUSTES_PLAN, activo: 'AAPL', ocioso: 'LIQUIDEZ', peso: 50, dineroLibre: 'tope', bloques: [{ ...Pa.bloquePesosNuevo('b2', 50), pesos: [{ simbolo: 'SPY', peso: 100 }] }] }
    const props = { estrategias: [est], estrategiaId: 7, datosLista: { watchlist: [], wlLists: [], rankingData: {} },
      deps: { ctx: null, calcula: async (p) => { pedidos.push(p); if (p.piezas.length !== 1) throw new Error('sin motor en la prueba')
        const F2 = ['2016-01-04', '2020-01-02', '2025-12-31'], pl = (x) => F2.map(() => ({ open: x, close: x }))
        return { evaluacion: Ev.evaluaPlan(p, { fechas: F2, qqq: pl(100), etf: F2.map(() => null), spy: pl(100) }, { detalle: true }) } } }, inicial: { planes: [], pestana: 'n1', simbolos: ['AAPL', 'SPY'], pruebas: [], resultadoPrueba: null, ajustes: ini } }
    const hasta = async (cond, max = 20000) => { const t0 = Date.now(); do { await D.espera(5); try { if (cond()) { await D.espera(5); return true } } catch (_) {} } while (Date.now() - t0 < max); return false }
    const m = D.monta(React.createElement(BP, props), RDC); await D.espera(60)
    const boton = (id) => m.raiz.conAtributo('data-boton', id)[0]
    await hasta(() => !!boton('quitar-bloque-1'))
    ok(!!boton('quitar-bloque-1') && m.raiz.conAtributo('data-bloque', '1').length === 1, 'con dos bloques, el bloque 1 tiene «🗑 Quitar»')
    D.pulsa(boton('quitar-bloque-1')); await hasta(() => !m.raiz.conAtributo('data-bloque', '1').some(z => !z.hasAttribute('data-tipo-bloque')))
    const bq = m.raiz.conAtributo('data-tipo-bloque', 'pesos')[0]
    ok(!!bq && bq.getAttribute('data-bloque') === '1' && m.raiz.conAtributo('data-parte').map(z => z.textContent).join('|') === '100 %', `sin el bloque 1: «Con pesos» pasa a ser el bloque 1, al 100 % (${m.raiz.conAtributo('data-parte').map(z => z.textContent).join('|')})`)
    ok(!boton('quitar-bloque') && !m.raiz.conAtributo('data-reparto-bloques').length && !/Parte de tu dinero/.test(bq.textContent), 'con un solo bloque: sin «Quitar», sin «Parte de tu dinero» ni «Reparto entre bloques»')
    await hasta(() => pedidos.some(p => p?.piezas?.length === 1))
    const ult = pedidos[pedidos.length - 1]
    ok(ult && ult.piezas.length === 1 && ult.piezas[0].tipo === 'pesos' && ult.piezas[0].peso === 1, `y se calcula el plan de un solo bloque «Con pesos» (${JSON.stringify(ult && ult.piezas.map(p => [p.tipo, p.peso]))})`)
    await hasta(() => m.raiz.conAtributo('data-fila', 'PLAN').length > 0)
    ok(m.raiz.conAtributo('data-fila', 'PLAN').length === 1 && m.raiz.conAtributo('data-fila', 'SPY').length === 1 && !m.raiz.conAtributo('data-sin-resultado').length, 'y sus cifras se ven a la derecha (no se queda en «Calculando tu plan…»)')
    D.pulsa(boton('anadir-bloque')); await hasta(() => !!boton('anadir-bloque-estrategia'))
    D.pulsa(boton('anadir-bloque-estrategia')); await hasta(() => m.raiz.conAtributo('data-bloque', '1').some(z => !z.hasAttribute('data-tipo-bloque')))
    ok(m.raiz.conAtributo('data-parte').map(z => z.textContent).join('|') === '50 %|50 %' && m.raiz.conAtributo('data-tipo-bloque', 'pesos')[0]?.getAttribute('data-bloque') === '2', '«+ Añadir bloque ▾» → «Con una estrategia»: vuelve el bloque 1 (50 % y 50 %)')
    m.quita(); await D.espera(5)
  }

  console.log(fallos ? `FALLOS: ${fallos}` : 'plan-solo-pesos: todo bien')
  process.exit(fallos ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
