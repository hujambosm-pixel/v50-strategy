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

  // §280: el ejemplo «SPY de reserva que compra en caídas» de «Cargar un ejemplo»: tres reglas, 100 % SPY, y es un plan válido.
  {
    const Rp = require(R + '/lib/builder/reglasPesos.js')
    const ej = Rp.EJEMPLOS_PESOS.find(e => e.id === 'reserva')
    const b = ej && ej.bloque()
    const aE = { ...a, bloques: [{ ...a.bloques[0], ...b }] }
    const pE = Pa.planDe(aE, est)
    ok(!!ej && ej.nombre === 'SPY de reserva que compra en caídas' && b.reglas.length === 3 && b.reglas[2].filas[0].si.c === 'enMaximoHistorico' && b.reglas[0].accion.tipo === 'moverBloque' && b.reglas[0].filas.length === 2,
      'el ejemplo «SPY de reserva…»: −10 % y EMA 20 → 20 % a QQQ; −20 % → 20 % a TQQQ; en máximo histórico → 100 % SPY')
    ok(Pl.validaPlan(pE).length === 0, 'y con él el plan es válido (' + Pl.validaPlan(pE).join(' ') + ')')
  }

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
    const tipoBtn = (n, t) => (m.raiz.conAtributo('data-cabecera-parte', String(n))[0]?.conAtributo('aria-pressed') || []).find(z => z.textContent.includes(t === 'pesos' ? 'Buy&Hold' : 'Con una estrategia'))
    await hasta(() => !!boton('quitar-bloque-1'))
    ok(!!boton('quitar-bloque-1') && m.raiz.conAtributo('data-bloque', '1').length === 1, 'con dos bloques, el bloque 1 tiene «🗑 Quitar»')
    D.pulsa(boton('quitar-bloque-1')); await hasta(() => !m.raiz.conAtributo('data-bloque', '1').some(z => !z.hasAttribute('data-tipo-bloque')))
    const bq = m.raiz.conAtributo('data-tipo-bloque', 'pesos')[0]
    ok(!!bq && bq.getAttribute('data-bloque') === '1' && m.raiz.conAtributo('data-parte').map(z => z.getAttribute('data-parte')).join('|') === '100 %', `sin el bloque 1: «Con pesos» pasa a ser el bloque 1, al 100 % (${m.raiz.conAtributo('data-parte').map(z => z.getAttribute('data-parte')).join('|')})`)
    ok(!boton('quitar-bloque') && !m.raiz.conAtributo('data-reparto-bloques').length && !/Parte de tu dinero/.test(bq.textContent), 'con un solo bloque: sin «Quitar», sin «Parte de tu dinero» ni «Reparto entre bloques»')
    await hasta(() => pedidos.some(p => p?.piezas?.length === 1))
    const ult = pedidos[pedidos.length - 1]
    ok(ult && ult.piezas.length === 1 && ult.piezas[0].tipo === 'pesos' && ult.piezas[0].peso === 1, `y se calcula el plan de un solo bloque «Con pesos» (${JSON.stringify(ult && ult.piezas.map(p => [p.tipo, p.peso]))})`)
    await hasta(() => m.raiz.conAtributo('data-fila', 'PLAN').length > 0)
    ok(m.raiz.conAtributo('data-fila', 'PLAN').length === 1 && m.raiz.conAtributo('data-fila', 'SPY').length === 1 && !m.raiz.conAtributo('data-sin-resultado').length, 'y sus cifras se ven a la derecha (no se queda en «Calculando tu plan…»)')
    // §283: la parte 1 pasa a «Con una estrategia» (vuelve el bloque 1, al 100 %) y, de vuelta a «Buy&Hold», recupera SPY 100 %
    D.pulsa(tipoBtn(1, 'estrategia')); await hasta(() => !m.raiz.conAtributo('data-tipo-bloque', 'pesos').length)
    ok(!m.raiz.conAtributo('data-tipo-bloque', 'pesos').length && m.raiz.conAtributo('data-bloque', '1').length === 1 && m.raiz.conAtributo('data-parte').map(z => z.getAttribute('data-parte')).join('|') === '100 %' && tipoBtn(1, 'estrategia')?.getAttribute('aria-pressed') === 'true', '§283: «⚙ Con una estrategia» en la parte 1: vuelve el bloque 1 de estrategia, al 100 %')
    D.pulsa(tipoBtn(1, 'pesos')); await hasta(() => m.raiz.conAtributo('data-tipo-bloque', 'pesos').length === 1)
    ok(/100 % SPY/.test(m.raiz.conAtributo('data-tipo-bloque', 'pesos')[0]?.textContent || ''), '§283: y de vuelta a «📦 Buy&Hold» recupera lo que tenía (SPY 100 %)')
    D.pulsa(boton('anadir-bloque')); await hasta(() => m.raiz.conAtributo('data-tipo-bloque', 'pesos').length === 2)
    ok(m.raiz.conAtributo('data-parte').map(z => z.getAttribute('data-parte')).join('|') === '50 %|50 %' && m.raiz.conAtributo('data-tipo-bloque', 'pesos').length === 2 && /Suman 100 % ✓/.test(m.raiz.conAtributo('data-suma-partes')[0]?.textContent || ''), '§283: «+ Añadir otra parte» añade un Buy&Hold con la mitad (50 % y 50 %)')
    m.quita(); await D.espera(5)
  }

  // ── §283 · Cambiar el tipo de una parte (cambiaTipoParte, partesDe), a mano ──
  {
    const uno = { ...Pa.AJUSTES_PLAN, activo: 'AAPL', ocioso: 'LIQUIDEZ' }
    const a1 = Pa.cambiaTipoParte(uno, 'e', 'pesos')
    ok(a1.sinBloque1 === true && a1.bloques.length === 1 && Pa.esBloquePesos(a1.bloques[0]) && a1.bloques[0].peso === 100 && a1.activo === 'AAPL' && Pa.partesDe(a1).map(p => p.tipo).join() === 'pesos',
      'una parte con estrategia → Buy&Hold: un solo bloque «Con pesos» al 100 % (los ajustes de la estrategia se quedan)')
    const a2 = Pa.cambiaTipoParte(a1, a1.bloques[0].id, 'estrategia')
    ok(JSON.stringify(a2) === JSON.stringify(uno), 'y de vuelta a «Con una estrategia»: los ajustes de antes, idénticos')
    const dos = { ...uno, peso: 60, dineroLibre: 'prioridad', bloques: [Pa.bloqueNuevo('b2', 40, 'MSFT', 'x')] }
    const b1 = Pa.cambiaTipoParte(dos, 'e', 'pesos')
    ok(b1.sinBloque1 && b1.bloques.map(b => `${b.id}:${b.peso}:${Pa.esBloquePesos(b) ? 'p' : 'e'}`).join() === 'b3:60:p,b2:40:e' && b1.dineroLibre === 'prioridad', `60/40 con la parte 1 a Buy&Hold: «Con pesos» 60 % delante y la otra 40 % (${b1.bloques.map(b => b.id + ':' + b.peso).join()})`)
    const b2 = Pa.cambiaTipoParte(b1, 'b3', 'estrategia')
    ok(b2.peso === 60 && !b2.sinBloque1 && b2.bloques.length === 1 && b2.bloques[0].id === 'b2', 'y de vuelta: la parte 1 es otra vez el bloque 1 al 60 %')
    const c1 = Pa.cambiaTipoParte(dos, 'b2', 'pesos'), c2 = Pa.cambiaTipoParte(c1, 'b2', 'estrategia', 'y', dos.bloques[0])
    ok(Pa.esBloquePesos(c1.bloques[0]) && c1.bloques[0].id === 'b2' && c1.bloques[0].peso === 40 && c1.peso === 60, 'la parte 2 a Buy&Hold: mismo id y mismo 40 %')
    ok(c2.bloques[0].activo === 'MSFT' && c2.bloques[0].estId === 'x' && c2.bloques[0].peso === 40, 'y de vuelta con lo que tenía: recupera MSFT y su estrategia')
    ok(Pa.cambiaTipoParte(dos, 'e', 'estrategia') === dos && Pa.cambiaTipoParte(dos, 'zz', 'pesos') === dos, 'mismo tipo o parte que no existe: nada cambia')
    // con un solo bloque «Con pesos» al 100 %: la pieza pesa 1, como un plan de un bloque
    const p1 = Pa.planDe({ ...a1, bloques: [{ ...a1.bloques[0], pesos: [{ simbolo: 'SPY', peso: 100 }] }] }, est)
    ok(p1.piezas.length === 1 && p1.piezas[0].tipo === 'pesos' && p1.piezas[0].peso === 1, 'el plan de la parte Buy&Hold sola: una pieza «pesos» con peso 1')
  }

  // ── §284 · «Así se lee tu plan» (lineasPlan), a mano ──
  {
    const x = { ...Pa.AJUSTES_PLAN, capital: 10000, aportacion: 300, sube: false, impuestos: 'ES-ahorro', sinBloque1: true, bloques: [{ id: 'b2', peso: 100, tipo: 'pesos', pesos: [{ simbolo: 'SPY', peso: 78 }, { simbolo: 'TQQQ', peso: 22 }], volver: { cada: 'nunca' } }] }
    const l1 = Pa.lineasPlan(x)
    ok(l1.partes.length === 1 && l1.partes[0].texto === 'El 100 % (10.000 €) compra el primer día SPY (7.800 €) y TQQQ (2.200 €) y los mantiene hasta el final.', `el plan del vídeo: «${l1.partes[0].texto}»`)
    ok(l1.resto[0] === 'Cada mes llegan 300 €: se compran como dice «El dinero que llega».' && /impuestos pendientes/.test(l1.resto[1]) && !Pa.hayParteEstrategia(x), 'aportaciones de una parte Buy&Hold, la venta final y sin parte con estrategia (no hay ocioso)')
    const y = { ...Pa.AJUSTES_PLAN, capital: 10000, aportacion: 0, activo: 'AAPL', ocioso: 'GLD', peso: 60, bloques: [{ id: 'b2', peso: 40, tipo: 'pesos', pesos: [{ simbolo: 'SPY', peso: 80 }, { simbolo: 'TQQQ', peso: 20 }], volver: { cada: 'anio' }, reglas: [{}] }] }
    const l2 = Pa.lineasPlan(y, { nombreEst: 'Cruce de medias 50/200' })
    ok(l2.partes[0].texto === 'El 60 % (6.000 €) opera «Cruce de medias 50/200» en AAPL: compra y vende con sus señales; mientras no hay señal, el dinero espera en oro (GLD).' && l2.partes[1].texto === 'El 40 % (4.000 €) compra el primer día SPY (3.200 €) y TQQQ (800 €) y vuelve a los pesos cada año; además, 1 regla «si… entonces…».' && l2.resto.length === 1 && Pa.hayParteEstrategia(y), `mixto 60/40: «${l2.partes[0].texto}» · «${l2.partes[1].texto}»`)
  }
  // ── §284 · la pregunta del plan nuevo: «📦 Buy&Hold» deja una parte Buy&Hold al 100 % ──
  {
    const D = require('./domFalso'); D.pon()
    const path = require('path'), React = require(path.join(R, 'node_modules', 'react')), RDC = require(path.join(R, 'node_modules', 'react-dom', 'client'))
    const BP = require(R + '/components/BuilderPlan.js').default
    const props = { estrategias: [est], estrategiaId: 7, datosLista: { watchlist: [], wlLists: [], rankingData: {} }, deps: { ctx: null, calcula: async () => { throw new Error('sin motor en la prueba') } },
      inicial: { planes: [], pestana: 'n1', eligeTipo: 'n1', simbolos: ['AAPL', 'SPY'], pruebas: [], resultadoPrueba: null, ajustes: { ...Pa.AJUSTES_PLAN, activo: 'AAPL' } } }
    const m = D.monta(React.createElement(BP, props), RDC); await D.espera(60)
    ok(m.raiz.conAtributo('data-pregunta-parte').length === 1, 'plan nuevo: la pregunta')
    D.pulsa(m.raiz.conAtributo('data-empieza', 'pesos')[0]); await D.espera(30)
    ok(!m.raiz.conAtributo('data-pregunta-parte').length && m.raiz.conAtributo('data-tipo-bloque', 'pesos').length === 1 && !m.raiz.conAtributo('data-bloque', '1').some(z => !z.hasAttribute('data-tipo-bloque')) && !m.raiz.conAtributo('data-ocioso-de').length, '«📦 Buy&Hold»: una parte Buy&Hold al 100 % y sin dinero ocioso')
    m.quita(); await D.espera(5)
  }

  // ── §285 · «Usar en un plan ▾» → «Añadir como parte a «X»» (anadeParteEstrategia) y el menú del botón ──
  {
    const e1 = { a: { ...Pa.AJUSTES_PLAN, activo: 'AAPL' }, estId: '7', version: 'guardada' }
    const r1 = Pa.anadeParteEstrategia(e1, 9)
    ok(r1 && r1.estId === '7' && r1.a.peso === 50 && r1.a.bloques.length === 1 && r1.a.bloques[0].estId === '9' && r1.a.bloques[0].peso === 50 && !Pa.esBloquePesos(r1.a.bloques[0]), 'plan de una parte con otra estrategia: parte 2 «Con una estrategia» con la nueva, 50 % y 50 %')
    ok(Pa.anadeParteEstrategia(e1, 7) === null && Pa.anadeParteEstrategia(r1, 9) === null, 'si el plan ya la usa (en la parte 1 o en otra), no añade nada (solo se abre)')
    const bh = Pa.cambiaTipoParte(e1.a, 'e', 'pesos'), r2 = Pa.anadeParteEstrategia({ ...e1, a: bh }, 9)
    ok(r2 && r2.estId === '9' && !r2.a.sinBloque1 && r2.a.peso === 50 && r2.a.bloques.length === 1 && Pa.esBloquePesos(r2.a.bloques[0]) && r2.a.bloques[0].peso === 50, 'plan solo Buy&Hold: la estrategia entra como parte 1 (50 %) y el Buy&Hold queda al 50 %')
    // el botón: con planes guardados, «Usar en un plan ▾» con su menú; sin planes, va directo a «plan nuevo»
    const D = require('./domFalso'); D.pon()
    const path = require('path'), React = require(path.join(R, 'node_modules', 'react')), RDC = require(path.join(R, 'node_modules', 'react-dom', 'client'))
    const BPan = require(R + '/components/BuilderPanel.js'), h = React.createElement, destinos = []
    const cab = (planes) => h(BPan.PlanesUsarCtx.Provider, { value: planes }, h(BPan.CabeceraPasos, { actual: 1, estrategia: 'Cruce de medias 50/200', onUsar: (d) => destinos.push(d) }))
    let m = D.monta(cab([{ id: 4, nombre: 'Plan · Cruce de medias / oro' }, { id: 6, nombre: 'Otro plan' }]), RDC); await D.espera(20)
    const b = () => m.raiz.conAtributo('data-boton', 'usar-en-plan')[0]
    ok(/Usar en un plan ▾/.test(b()?.textContent || '') && !m.raiz.conAtributo('data-menu', 'usar-en-plan').length, 'con planes guardados: «Usar en un plan ▾», cerrado')
    D.pulsa(b()); await D.espera(10)
    ok(m.raiz.conAtributo('data-usar').length === 3 && /Plan nuevo con esta estrategia/.test(m.raiz.conAtributo('data-menu', 'usar-en-plan')[0]?.textContent || ''), 'al pulsarlo: «Plan nuevo con esta estrategia» y un plan por línea')
    D.pulsa(m.raiz.conAtributo('data-usar', '6')[0]); await D.espera(10)
    ok(destinos.length === 1 && destinos[0].planId === 6 && !m.raiz.conAtributo('data-menu', 'usar-en-plan').length, 'elegir un plan: onUsar({ planId }) y se cierra')
    D.pulsa(b()); await D.espera(10); D.pulsa(m.raiz.conAtributo('data-usar', 'nuevo')[0]); await D.espera(10)
    ok(destinos[1]?.nuevo === true, '«Plan nuevo con esta estrategia»: onUsar({ nuevo: true })')
    m.quita(); await D.espera(5)
    m = D.monta(cab([]), RDC); await D.espera(20)
    ok(!/▾/.test(b()?.textContent || ''), 'sin planes guardados: sin ▾')
    D.pulsa(b()); await D.espera(10)
    ok(destinos[2]?.nuevo === true && !m.raiz.conAtributo('data-menu', 'usar-en-plan').length, 'y pulsarlo va directo a un plan nuevo')
    m.quita(); await D.espera(5)
  }

  console.log(fallos ? `FALLOS: ${fallos}` : 'plan-solo-pesos: todo bien')
  process.exit(fallos ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
