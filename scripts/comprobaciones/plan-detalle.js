// scripts/comprobaciones/plan-detalle.js — EL LIBRO del motor de los planes (docs/builder.md §155; parte 1 de «un solo cálculo»).
// Las corre comunes.sh. Termina en 0 si todo va bien.
// 1 · Cuentas a mano con una lista (los valores inventados A y B de plan-tu-dinero-lista.js): movimientos, lo ganado por símbolo,
//     operaciones con su resultado, dónde está el dinero cada día y LA SUMA: aportado + ganado − costes − impuestos = lo que tienes al final.
// 2 · A mano con un solo valor (el valor inventado de planes-estrategia.js): una operación, una aportación con la operación abierta
//     («Compra más acción»: una operación con dos compras) y el impuesto de julio.
// 3 · Con precios reales (foto, sin red), un valor con oro de ocioso, aportaciones, costes e impuestos; los planes sin estrategia; y la
//     lista Degiro en sus dos repartos: sin pedir el libro la salida es EXACTAMENTE la de siempre; la suma cuadra al céntimo; el reparto
//     de cada día suma el patrimonio; las operaciones suman lo ganado en los valores; los costes de los movimientos, los del plan; y hay
//     tantas órdenes en el libro como cuenta el plan.
// 4 · /api/plan: con libro: true lo devuelve; sin pedirlo, no.
// 5 · §156 (parte 2, la pestaña «Detalle»): lo ganado día a día con cada valor (libro.curvas), a mano y en todos los casos del apartado 3
//     (cada día: lo aportado + lo ganado hasta hoy − las comisiones y los impuestos pagados hasta hoy = el patrimonio); lo que prepara
//     lib/builder/detallePlan.js, a mano; y la pantalla montada con /api/plan de verdad detrás: la línea que suma, la tabla por valor con
//     la fila del ocioso, «El plan» / «Valor a valor» y la vuelta a «Tu dinero».
//     §157 (parte 3a): ganancias mensuales (a mano; con precios reales, cada año = «Año a año» y todos suman la ganancia neta), dónde está
//     el dinero cada día y resultados por operación, a mano y en la pantalla.
//     §158 (parte 3b): el historial (orden, buscador, «Ver más», Gantt, Excel), las operaciones con la forma del Backtesting y «Copiar para
//     Claude», a mano y en la pantalla.
//     §159 (parte 4a): «Todos los movimientos» (qué pasa en palabras, signo, dinero al cierre), a mano y en la pantalla.
//     §160 (parte 4b): las velas de un valor con sus operaciones (recorte a las fechas, índices de compra y venta, no más de 4 lecturas a
//     la vez) y la «Vista de gráficos», a mano y en la pantalla.
//     §161 (parte 4c): «Detalle» con un solo valor (sin tabla por valor ni «Valor a valor» ni «Vista de gráficos»; sus velas a la vista).
//     §162 (parte 5a): la fila de cifras, las columnas por valor como el Backtesting (aportó %, CAGR de su aportación, peor caída, dinero
//     en él) y el buscador en toda la fila, a mano y en la pantalla.
//     §163 (parte 5b): las señales que cuenta el motor del plan (generadas, ejecutadas, motivos, cómo les habría ido), a mano, con la lista
//     Degiro real (generadas = candidatos; ejecutadas = operaciones) y su «%» con el tooltip en la pantalla.
//     §165 (parte 5d): ocultar el panel de la izquierda y volverlo a ver. §166 (parte 5e): «⤢ Ampliar» a pantalla completa.
//     §167: los valores plegados al entrar; la peor caída del total; la rueda del gráfico de velas solo tras un clic; pulsar cualquier
//     parte de una fila del historial (también el valor) lleva a su operación.
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://arnes.invalid'; process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'clave-falsa-del-arnes'
const path = require('path')
const C0 = require('./cargador'), R = C0.RAIZ
const E = require('./entorno')
let fallos = 0
const ok = (c, t) => { console.log(`${c ? 'OK  ' : 'MAL '} ${t}`); if (!c) fallos++ }
const cerca = (x, y, tol = 1e-9) => Number.isFinite(x) && Math.abs(x - y) < tol
const dia = (f, n) => new Date(Date.parse(f + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10)
const sum = (xs, f) => xs.reduce((s, x) => s + f(x), 0)

;(async () => {
  await C0.prepara(); C0.registra(R)
  const Pl = require(R + '/lib/planes/plan.js'), Ev = require(R + '/lib/planes/evalua.js'), Pa = require(R + '/lib/builder/planPantalla.js'), Li = require(R + '/lib/planes/lista.js')
  const PD = require(R + '/components/backtesting/PlanPorDentro.js')

  // Lo que tiene que cumplir cualquier libro (apartado 3) y la salida sin libro, idéntica.
  const coherente = (nombre, plan, datos, { minOps = 0 } = {}) => {
    const sin = Pl.ejecutaPlan(plan, datos), con = Pl.ejecutaPlan(plan, datos, { libro: true }), L = con.libro
    const { libro: _l, ...resto } = con
    const igual = JSON.stringify(sin) === JSON.stringify(resto) && !('libro' in sin)
    const pu = L.puente, ordenes = L.movimientos.filter(m => ['compra', 'venta', 'ventaFinal'].includes(m.tipo))
    const repartoOk = L.reparto.length === con.serie.length && L.reparto.every((d, k) => cerca(d.valores + d.ocioso + d.liquidez + d.otros, con.serie[k].patrimonio, 1e-6))
    const opsOk = cerca(sum(L.operaciones, o => o.resultado), pu.ganadoValores, 1e-6) && L.operaciones.every(o => o.exitDate && o.exitDate >= o.entryDate && o.compras > 0)
    const simOk = cerca(sum(Object.values(L.porSimbolo), s => s.ganado), pu.ganadoValores + pu.ganadoOcioso + pu.ganadoOtros, 1e-6)
    const costesOk = cerca(sum(ordenes, m => m.coste), con.costes.pagados, 1e-6) && cerca(pu.costes, con.costes.pagados, 1e-9) && ordenes.length === con.costes.ordenes
    const impOk = cerca(pu.impuestos, con.impuestos?.pagados || 0, 1e-9) && cerca(sum(L.movimientos.filter(m => m.tipo === 'impuesto' || m.tipo === 'impuestoFinal'), m => m.importe), pu.impuestos, 1e-6)
    const apOk = cerca(sum(L.movimientos.filter(m => m.tipo === 'aportacion'), m => m.importe), con.aportado, 1e-6) && pu.aportado === con.aportado
    const fechasOk = L.movimientos.every((m, k) => k === 0 || m.fecha >= L.movimientos[k - 1].fecha)
    // §156: las curvas. El último día de cada una es lo ganado con ese símbolo; y, sin símbolos «otros», cada día cuadra con el patrimonio.
    const simC = Object.entries(L.porSimbolo).filter(([, s]) => s.rol !== 'otro'), hayOtros = Object.values(L.porSimbolo).some(s => s.rol === 'otro')
    let curvasOk = Object.keys(L.curvas).length === simC.length && simC.every(([a, s]) => L.curvas[a]?.length === con.serie.length && cerca(L.curvas[a][con.serie.length - 1], s.ganado, 1e-6))
    if (curvasOk && !hayOtros) { let c = 0, t = 0, k = 0; const ms = L.movimientos.filter(m => m.tipo !== 'ventaFinal' && m.tipo !== 'impuestoFinal')
      con.serie.forEach((p, d) => { for (; k < ms.length && ms[k].fecha <= p.date; k++) { c += ms[k].coste || 0; if (ms[k].tipo === 'impuesto') t += ms[k].importe }
        if (!cerca(p.aportado + sum(simC, ([a]) => L.curvas[a][d]) - c - t, p.patrimonio, 1e-5)) curvasOk = false }) }
    ok(curvasOk, `${nombre}: lo ganado día a día con cada símbolo (${simC.length}) acaba en lo ganado con él${hayOtros ? '' : ' y cada día cuadra con el patrimonio'}`)
    ok(igual, `${nombre}: sin pedir el libro, la salida es exactamente la de siempre`)
    ok(Math.abs(pu.descuadre) < 0.005 && pu.valorNeto === con.valorNeto, `${nombre}: LA SUMA cuadra: ${pu.aportado.toFixed(2)} + ${pu.ganadoValores.toFixed(2)} (valores) + ${pu.ganadoOcioso.toFixed(2)} (ocioso) + ${pu.ganadoOtros.toFixed(2)} (otros) − ${pu.costes.toFixed(2)} − ${pu.impuestos.toFixed(2)} = ${con.valorNeto.toFixed(2)} € (descuadre ${pu.descuadre.toExponential(1)})`)
    ok(repartoOk && opsOk && simOk && costesOk && impOk && apOk && fechasOk && L.operaciones.length >= minOps,
      `${nombre}: reparto diario = patrimonio (${repartoOk}), operaciones = ganado en valores (${opsOk}, ${L.operaciones.length}), por símbolo (${simOk}), costes y ${ordenes.length} órdenes (${costesOk}), impuestos (${impOk}), aportaciones (${apOk}), en orden (${fechasOk})`)
    return con
  }

  // ── 1 · A mano, con lista ──
  const F = ['2020-01-02', '2020-01-03', '2020-01-06', '2020-01-07']
  const activo = (symbol, abre, cierra, candidatos) => ({ symbol, fechas: F, abre, cierra, candidatos })
  const A = activo('A', [10, 10, 11, 12], [10, 11, 11.5, 12], [{ symbol: 'A', entryDate: F[1], entryPx: 10, exitDate: F[3], exitPx: 12, pasaPuerta: true }])
  const B = activo('B', [20, 20, 18, 18], [20, 19, 18, 18], [{ symbol: 'B', entryDate: F[1], entryPx: 20, exitDate: F[2], exitPx: 18, pasaPuerta: true }])
  const planA = (modo) => ({ tipo: 'plan', formato: 1, calculo: 1, dinero: { capitalInicial: 1000, aportaciones: { frecuencia: 'ninguna' }, extraordinarias: [] },
    piezas: [{ id: 'e', tipo: 'estrategia', donde: 'lista', lista: Li.mergeLista({ simbolos: ['A', 'B'], modo, maxPosiciones: 1 }), activo: 'A', ocioso: 'LIQUIDEZ', peso: 1, apalancamiento: 1, estrategia: { id: 'x', name: 'Inventada' } }],
    reparto: { aportacionesA: 'pesos', rebalanceo: { calendario: 'nunca', banda: null } }, impuestos: { regimen: 'ninguno', reglaDosMeses: true },
    costes: { comisionPct: 0, comisionMinEur: 1, horquillaPct: { QQQ: 0, ETF: 0, SPY: 0 } }, periodo: { desde: F[0], hasta: F[3] } })
  const datosA = (modo) => ({ fechas: F, qqq: F.map(() => null), etf: F.map(() => null), spy: F.map(() => null), lista: { opciones: { modo, n: 2, maxPosiciones: 1, prioridad: 'alfabetico' }, activos: [A, B] } })
  {
    // Compartido, 1.000 €, 1 € por orden. Día 2: A con 500 € (499 € en acciones: 49,9 a 10) y B con 500 € (499 €: 24,95 a 20). Día 3: sale
    // B a 18: 24,95 × 18 = 449,10 €. Día 4: sale A a 12: 49,9 × 12 = 598,80 €. A gana 598,80 − 499 = 99,80 €; B, 449,10 − 499 = −49,90 €.
    // LA SUMA: 1.000 + (99,80 − 49,90) − 4 € de comisiones − 0 de impuestos = 1.045,90 €.
    const r = coherente('lista a mano, compartido', planA('compartido'), datosA('compartido')), L = r.libro, pu = L.puente
    ok(cerca(pu.ganadoValores, 49.9) && pu.ganadoOcioso === 0 && cerca(pu.costes, 4) && pu.impuestos === 0 && cerca(pu.valorNeto, 1045.9), `a mano: 1.000 + 49,90 − 4 = 1.045,90 € (${pu.aportado} + ${pu.ganadoValores} − ${pu.costes} = ${pu.valorNeto})`)
    const oA = L.operaciones.find(o => o.simbolo === 'A'), oB = L.operaciones.find(o => o.simbolo === 'B')
    ok(L.operaciones.length === 2 && cerca(oA.resultado, 99.8) && cerca(oA.compras, 499) && cerca(oA.ventas, 598.8) && cerca(oA.unidades, 49.9) && oA.entryDate === F[1] && oA.exitDate === F[3] && oA.entryPrice === 10 && oA.exitPrice === 12 && cerca(oA.costes, 2) && !oA.abierta
      && cerca(oB.resultado, -49.9) && oB.exitDate === F[2], `a mano: A gana 99,80 € (499 → 598,80) y B pierde 49,90 € (${oA.resultado}, ${oB.resultado})`)
    ok(L.movimientos.map(m => `${m.tipo}${m.simbolo ? ' ' + m.simbolo : ''}`).join(' · ') === 'aportacion · compra A · compra B · venta B · venta A' && L.movimientos[1].rol === 'valor' && cerca(L.movimientos[1].importe, 499) && L.movimientos[1].coste === 1 && L.movimientos[0].importe === 1000,
      `a mano: los movimientos, en orden (${L.movimientos.map(m => `${m.tipo}${m.simbolo ? ' ' + m.simbolo : ''}`).join(' · ')})`)
    ok(cerca(L.reparto[1].valores, 49.9 * 11 + 24.95 * 19) && L.reparto[1].liquidez === 0 && L.reparto[0].valores === 0 && cerca(L.reparto[0].liquidez, 1000) && cerca(L.reparto[2].liquidez, 448.1),
      `a mano: el día 2 hay 1.022,95 € en valores; el día 3, 448,10 € en liquidez (${L.reparto[1].valores}, ${L.reparto[2].liquidez})`)
    ok(cerca(L.porSimbolo.A.ganado, 99.8) && cerca(L.porSimbolo.B.ganado, -49.9) && L.porSimbolo.A.rol === 'valor', 'a mano: lo ganado por símbolo')
    // §156: día a día. A: 0 · 49,9 × 11 − 499 = 49,90 · 49,9 × 11,5 − 499 = 74,85 · 598,80 − 499 = 99,80. B: 0 · 24,95 × 19 − 499 = −24,95 · −49,90 · −49,90.
    const cA = L.curvas.A, cB = L.curvas.B
    ok([0, 49.9, 74.85, 99.8].every((v, k) => cerca(cA[k], v)) && [0, -24.95, -49.9, -49.9].every((v, k) => cerca(cB[k], v)), `a mano, día a día: A 0 · 49,90 · 74,85 · 99,80 y B 0 · −24,95 · −49,90 · −49,90 (${cA.map(v => v.toFixed(2)).join(' · ')} y ${cB.map(v => v.toFixed(2)).join(' · ')})`)
    // §156: lo que prepara detallePlan. A: 1 operación que gana, 2 de 4 días en cartera (50 %); B: 1 que pierde, 1 de 4 días (25 %). Total: 2 operaciones,
    // 1 gana (50 %), Profit Factor 99,80 / 49,90 = 2. En valores: 0 · 1.022,95 / 1.022,95 · 573,85 / 1.021,95 · 0 → media (0 + 1 + 0,56153 + 0) / 4 = 39,04 %.
    const De = require(R + '/lib/builder/detallePlan.js'), d = De.detallePlan({ evaluacion: { plan: { medidas: { valorNeto: r.valorNeto }, ejecucion: r } } }, planA('compartido'))
    const fA = d.filas[0], fB = d.filas[1], mv = (0 + 1 + 573.85 / 1021.95 + 0) / 4
    ok(d.filas.length === 2 && fA.simbolo === 'A' && cerca(fA.aporto, 99.8) && fA.operaciones === 1 && fA.ganadoras === 1 && fA.pf === null && fA.dentro === 0.5 && fB.simbolo === 'B' && cerca(fB.aporto, -49.9) && fB.ganadoras === 0 && fB.pf === 0 && fB.dentro === 0.25,
      `detalle a mano: A +99,80 € (1 operación, gana, 50 % del tiempo) y B −49,90 € (pierde, 25 %) (${fA.aporto}, ${fA.dentro}; ${fB.aporto}, ${fB.dentro})`)
    ok(d.total.operaciones === 2 && d.total.ganadoras === 0.5 && cerca(d.total.pf, 2) && cerca(d.total.aporto, 49.9) && cerca(d.total.enValores, mv) && cerca(d.ocioso.liquidez, 1 - mv) && d.ocioso.simbolo === 'LIQUIDEZ' && d.ocioso.ordenes === 0 && d.ocioso.aporto === 0,
      `detalle a mano: 2 operaciones, 50 % ganan, Profit Factor 99,80 / 49,90 = 2; de media, el ${(mv * 100).toFixed(2)} % del dinero en valores (${(d.total.enValores * 100).toFixed(2)} %)`)
    ok(d.cabecera.valores === 2 && d.cabecera.conOperaciones === 2 && d.cabecera.operaciones === 2 && d.cabecera.ordenes === 4 && d.cabecera.ordenesValores === 4 && d.cabecera.ordenesOcioso === 0 && d.cabecera.ordenesOtras === 0 && d.cabecera.desde === F[0] && d.cabecera.hasta === F[3] && d.cabecera.velas === 'diarias'
      && d.suma.cuadra && d.suma.aportado === 1000 && cerca(d.suma.valores, 49.9) && cerca(d.suma.costes, 4) && cerca(d.suma.final, 1045.9) && d.curvas.series.length === 2 && d.curvas.series[0].v === L.curvas.A,
      'detalle a mano: la línea de arriba (2 valores, 2 operaciones, 4 órdenes) y la suma 1.000 + 49,90 − 4 = 1.045,90 €')
    // §162. Sobre 1.000 € puestos: A aportó 99,80 € (+9,98 %) y B −49,90 € (−4,99 %). La peor caída de B: de 0 a −49,90 € → −49,90 / 1.000 = −4,99 %;
    // A no cae. Dinero en A: 0 · 548,90 · 573,85 · 0 € (49,9 × 11 y 49,9 × 11,5) → media 280,69 € y, en % de cada día, (548,90 / 1.022,95 + 573,85 / 1.021,95) / 4.
    // Las cifras: ganancia 45,90 € (+4,59 %), 1 de 2 ganan, tiempo con algo invertido 2 de 4 días (50 %).
    const anios = (Date.parse(F[3]) - Date.parse(F[0])) / (365.25 * 864e5)
    ok(cerca(fA.aportoPct, 0.0998) && cerca(fB.aportoPct, -0.0499) && cerca(fA.cagr, Math.pow(1.0998, 1 / anios) - 1, 1e-9) && cerca(d.total.aportoPct, 0.0499) && fA.caidaEur === 0 && cerca(fB.caidaEur, -49.9) && cerca(fB.caidaPct, -0.0499)
      && cerca(fA.enElEur, (548.9 + 573.85) / 4) && cerca(fA.enEl, (548.9 / 1022.95 + 573.85 / 1021.95) / 4) && cerca(fB.enEl, (474.05 / 1022.95) / 4) && cerca(fA.enEl + fB.enEl, d.total.enValores),
      `columnas por valor a mano: A +9,98 %, B −4,99 % y su caída −49,90 € (−4,99 %); dinero en A de media ${fA.enElEur.toFixed(2)} € (${(fA.enEl * 100).toFixed(2)} %), y A + B = el total`)
    const ci = d.cifras
    ok(cerca(ci.ganancia, 45.9) && cerca(ci.gananciaPct, 0.0459) && ci.ganan === 1 && ci.operaciones === 2 && ci.tiempoInvertido === 0.5 && ci.dias === 4 && cerca(ci.enValores, mv) && cerca(ci.enValoresEur, (1022.95 + 573.85) / 4),
      `la fila de cifras a mano: ganancia 45,90 € (+4,59 %), 1 de 2 ganan, 2 de 4 días con algo invertido, de media ${ci.enValoresEur.toFixed(2)} € en valores`)
    // El buscador en toda la fila: «12,00» (precio de venta de A), «10,00» (su precio de compra; «49,9» encuentra las dos: A tiene 49,90 acciones y B −49,90 €), «07/01» (su fecha de venta); en los movimientos, «18» y «1.000».
    ok(De.historial(d.porOperacion.ops, '12,00').map(o => o.simbolo).join() === 'A' && De.historial(d.porOperacion.ops, '10,00').map(o => o.simbolo).join() === 'A' && De.historial(d.porOperacion.ops, '49,9').length === 2 && De.historial(d.porOperacion.ops, '07/01').map(o => o.simbolo).join() === 'A' && De.historial(d.porOperacion.ops, 'b 18').map(o => o.simbolo).join() === 'B'
      && De.filtraMovimientos(d.movimientos, '18').map(m => m.que).join() === 'Vende B · 24,95 × 18,00 €' && De.filtraMovimientos(d.movimientos, '1.000').map(m => m.que).join() === 'Dinero inicial' && De.filtraMovimientos(d.movimientos, '1000').length === 1,
      'el buscador mira toda la fila: precios, acciones, fechas e importes (con o sin el punto de los miles), varias palabras a la vez')
    // §163. Compartido con dos puestos: entran las dos señales (A y B): 2 de 2, 100 %, «Entraron todas».
    ok(L.senales.generadas === 2 && L.senales.ejecutadas === 2 && d.senales.pct === 1 && d.senales.descartadas === 0 && De.textoSenales(d.senales).includes('Entraron: 2 (100 %)') && De.textoSenales(d.senales).endsWith('Entraron todas.'),
      'señales a mano, compartido: 2 de 2 entran (100 %)')
    // Concentrado con 1 puesto: entra A (alfabético) y B se queda fuera por no haber hueco; B habría perdido 18 / 20 − 1 = −10 %.
    { const rc = Pl.ejecutaPlan(planA('concentrado'), datosA('concentrado'), { libro: true }), sc = De.resumenSenales(rc.libro.senales)
      ok(sc.generadas === 2 && sc.ejecutadas === 1 && sc.motivos.slots === 1 && sc.pct === 0.5 && rc.libro.senales.descartadas[0].simbolo === 'B' && cerca(rc.libro.senales.descartadas[0].ret, -0.1) && sc.ganadorasDesc === 0 && sc.porSimbolo.A.ejecutadas === 1 && sc.porSimbolo.B.ejecutadas === 0
        && De.textoSenales(sc).includes('sin hueco libre (ya estaban ocupados todos los puestos): 1') && De.textoSenales(sc).includes('ganadoras: 0,0 %'),
        `señales a mano, concentrado máx. 1: entra A y B no (sin hueco), 1 de 2 (50 %); B habría perdido un 10 %`)
      // Con A fuera por el filtro de la prioridad (pasaPuerta false), entra B: 1 de 2, motivo «filtro».
      const dp = datosA('concentrado'); dp.lista.activos = [{ ...A, candidatos: [{ ...A.candidatos[0], pasaPuerta: false }] }, B]
      const sp = De.resumenSenales(Pl.ejecutaPlan(planA('concentrado'), dp, { libro: true }).libro.senales)
      ok(sp.motivos.filtro === 1 && sp.ejecutadas === 1 && sp.porSimbolo.B.ejecutadas === 1, 'señales a mano: A fuera por el filtro de la prioridad, entra B') }
    ok(De.detallePlan({ evaluacion: { plan: { medidas: {}, ejecucion: Pl.ejecutaPlan(planA('compartido'), datosA('compartido')) } } }, planA('compartido')) === null, 'detalle: sin libro en la respuesta, nada (null)')
    // §157. Todo en enero de 2020: 1.000 € → 1.045,90 € → +4,59 % y +45,90 €; el año, lo mismo.
    const me = d.mensuales
    ok(me.length === 1 && me[0].anio === '2020' && cerca(me[0].meses[0].pct, 0.0459) && cerca(me[0].meses[0].euros, 45.9) && me[0].meses.slice(1).every(x => x === null) && cerca(me[0].pct, 0.0459) && cerca(me[0].euros, 45.9),
      `mensuales a mano: enero de 2020 +4,59 % y +45,90 € (${(me[0].meses[0].pct * 100).toFixed(4)} %, ${me[0].meses[0].euros.toFixed(2)} €)`)
    // Dónde está: día 1 todo en liquidez; día 2 todo en valores; día 3, 573,85 / 1.021,95 en valores y 448,10 / 1.021,95 en liquidez; día 4 todo en liquidez.
    const de = d.donde.dias
    ok(de.length === 4 && de[0].liquidez === 1 && cerca(de[1].valores, 1) && cerca(de[2].valores, 573.85 / 1021.95) && cerca(de[2].liquidez, 448.1 / 1021.95) && cerca(de[3].liquidez, 1) && cerca(d.donde.media.valores, mv) && de.every(z => cerca(z.valores + z.ocioso + z.liquidez, 1)),
      `dónde está a mano: 0 · 100 · ${(573.85 / 1021.95 * 100).toFixed(2)} · 0 % en valores (media ${(d.donde.media.valores * 100).toFixed(2)} %)`)
    // Por operación: por fecha de venta, B (−49,90 €, −49,90 / 499 = −10 %) y luego A (+99,80 €, +20 %).
    const po = d.porOperacion
    ok(po.ops.map(o => o.simbolo).join() === 'B,A' && cerca(po.ops[0].pct, -0.1) && cerca(po.ops[1].pct, 0.2) && po.ganan === 1 && po.pierden === 1 && po.mejor.simbolo === 'A' && po.peor.simbolo === 'B',
      `por operación a mano: B −10 % y A +20 %, 1 gana y 1 pierde (${po.ops.map(o => `${o.simbolo} ${(o.pct * 100).toFixed(1)} %`).join(', ')})`)
    // §158. El historial, la más reciente arriba: A (sale el día 4) y B (el día 3); buscando «b», solo B. Con la forma del Backtesting:
    // A entró con 499 € y ganó 99,80 € (+20 %) en 4 días (03/01 → 07/01); B, 499 € y −49,90 € (−10 %) en 3 días.
    const hi = De.historial(po.ops), tb = De.tradesBacktesting(po.ops)
    ok(hi.map(o => o.simbolo).join() === 'A,B' && De.historial(po.ops, 'b').map(o => o.simbolo).join() === 'B' && De.historial(po.ops, 'zz').length === 0 && hi[0].unidades === 49.9 && hi[0].entryPrice === 10 && hi[0].exitPrice === 12,
      `historial a mano: A y luego B; buscando «b», solo B; A 49,9 acciones de 10 a 12 €`)
    ok(tb.length === 2 && tb[1].symbol === 'A' && tb[1]._capitalAtEntry === 499 && cerca(tb[1].pnlSimple, 99.8) && cerca(tb[1].pnlPct, 20) && tb[1].dias === 4 && tb[0].dias === 3 && cerca(tb[0].pnlPct, -10) && !tb[0]._virtualClose,
      `operaciones para el Gantt y el Excel a mano: A 499 € → +99,80 € (+20 %) en 4 días, B −10 % en 3 días`)
    const tx = De.textoDetalle(d, { nombre: 'Inventado', version: 'V0' })
    ok(tx.startsWith('DETALLE DEL PLAN «Inventado» (V0)') && tx.includes('LA SUMA: 1000.00 € aportado + 49.90 € ganado en los valores') && tx.includes('= 1045.90 € (cuadra con «Tu dinero»)') && tx.includes('A\t99.80 €\t1\t100.0 %') && tx.includes('2020\t4.59 %\t45.90 €') && tx.includes('OPERACIONES: 2 · 1 ganan · 1 pierden'),
      '«Copiar para Claude» a mano: la suma, la tabla por valor, los años y las operaciones')
    // §159. Los 5 movimientos: el dinero inicial (+1.000 €), compra A (49,90 × 10,00 €, −499 €; al cierre 1.022,95 € en valores), compra B,
    // vende B (+449,10 €; al cierre 573,85 € en valores y 448,10 € en liquidez, que es el «ocioso») y vende A.
    const mvs = d.movimientos
    ok(mvs.length === 5 && mvs[0].que === 'Dinero inicial' && mvs[0].signo === 1 && mvs[0].importe === 1000 && mvs[1].que === 'Compra A · 49,90 × 10,00 €' && mvs[1].signo === -1 && cerca(mvs[1].importe, 499) && mvs[1].coste === 1 && cerca(mvs[1].enValores, 1022.95)
      && mvs[3].que === 'Vende B · 24,95 × 18,00 €' && mvs[3].signo === 1 && cerca(mvs[3].importe, 449.1) && cerca(mvs[3].enValores, 573.85) && cerca(mvs[3].enOcioso, 448.1) && mvs[0].nombreOcioso === 'liquidez',
      `movimientos a mano: ${mvs.map(m => m.que).join(' · ')}`)
    ok(De.filtraMovimientos(mvs).map(m => m.k).join() === '4,3,2,1,0' && De.filtraMovimientos(mvs, 'b').map(m => m.que).join(' | ') === 'Vende B · 24,95 × 18,00 € | Compra B · 24,95 × 20,00 €' && De.filtraMovimientos(mvs, 'dinero').length === 1,
      'movimientos a mano: el más reciente arriba; buscando «b», los dos de B; buscando «dinero», el inicial')
    // §160. Las velas de A recortadas a F[1]..F[3] (3 de 4) y su operación: compra en la vela 0 (03/01), venta en la 2 (07/01). B no sale con A.
    const velasA = F.map((date, k) => ({ date, open: A.abre[k], high: A.cierra[k], low: A.abre[k], close: A.cierra[k] }))
    const vA = De.velasDe({ velas: velasA }, F[1], F[3]), oA2 = De.opsEnVelas(vA, po.ops, 'A')
    ok(vA.length === 3 && vA[0].date === F[1] && De.velasDe(velasA, F[0], F[0]).length === 1 && oA2.length === 1 && oA2[0].e === 0 && oA2[0].x === 2 && oA2[0].entryPrice === 10 && oA2[0].exitPrice === 12 && De.opsEnVelas(vA, po.ops, 'B')[0].x === 1 && De.opsEnVelas(vA.slice(1), po.ops, 'A')[0].e === null,
      'velas a mano: recortadas a las fechas del plan; la operación de A, de la vela 0 (a 10) a la 2 (a 12); fuera de las velas, null')
    // §164. Para el gráfico del Backtesting: A compra el 03/01 a 10 y vende el 07/01 a 12 (+20 %, 499 € → 598,80 €); su foco va del 04/12/2019 al 06/02/2020.
    { const sg = De.senalesGrafico(po.ops, 'A')[0], fo = De.focoDeOperacion(po.ops, po.ops.find(o => o.simbolo === 'A'))
      ok(sg.entries.length === 1 && sg.entries[0].date === F[1] && sg.entries[0].price === 10 && sg.exits[0].price === 12 && sg.trades[0].n === 1 && cerca(sg.trades[0].pnlPct, 20) && cerca(sg.trades[0].inversion, 499) && cerca(sg.trades[0].resultado, 598.8)
        && fo.n === 1 && fo.sim === 'A' && fo.from === '2019-12-04' && fo.to === '2020-02-06' && De.focoDeOperacion(po.ops, { simbolo: 'A', entryDate: 'x', exitDate: 'y' }) === null,
        'el gráfico del Backtesting a mano: A con su compra, su venta, +20 % (499 € → 598,80 €), y su foco del 04/12/2019 al 06/02/2020') }
  }
  {
    // Con ocioso y aportaciones (el caso de §91): concentrado máx. 1, 1.000 € + 300 €/mes, ocioso O, 1 € por orden. Día 1, al cierre: 999 €
    // de O (19,98 a 50). Día 3: se vende todo O (19,98 × 55 = 1.098,90 €) y se compra A con 1.097,90 € (1.096,90 € en acciones: 109,69 a
    // 10); llegan 300 € y al cierre van a O (299 €: 5,436… a 55). Día 4: sale A a 12: 109,69 × 12 = 1.316,28 €; venta final de O:
    // 299 / 55 × 60 = 326,18 €. A gana 1.316,28 − 1.096,90 = 219,38 €; O gana 1.098,90 + 326,18 − 999 − 299 = 127,08 €.
    // LA SUMA: 1.300 + 219,38 + 127,08 − 6 = 1.640,46 €.
    const G = ['2020-01-30', '2020-01-31', '2020-02-03', '2020-02-04']
    const O = [50, 50, 55, 60], velasO = G.map((date, k) => ({ date, open: O[k], high: O[k], low: O[k], close: O[k], volume: 0 }))
    const A1 = { symbol: 'A', fechas: G, abre: [10, 10, 10, 12], cierra: [10, 10, 11, 12], candidatos: [{ symbol: 'A', entryDate: G[2], entryPx: 10, exitDate: G[3], exitPx: 12, pasaPuerta: true }] }
    const p = { ...planA('concentrado'), dinero: { capitalInicial: 1000, aportaciones: { frecuencia: 'mensual', importe: 300 }, extraordinarias: [] }, piezas: [{ ...planA('concentrado').piezas[0], ocioso: 'O' }], periodo: { desde: G[0], hasta: G[3] } }
    const d = { fechas: G, qqq: G.map(() => null), etf: G.map(() => null), spy: G.map(() => null), velas: { O: velasO }, lista: { opciones: { modo: 'concentrado', n: 2, maxPosiciones: 1, prioridad: 'alfabetico' }, activos: [A1] } }
    const r = coherente('lista a mano, con ocioso y aportaciones', p, d), L = r.libro, pu = L.puente, gO = 1098.9 + 299 / 55 * 60 - 999 - 299
    ok(pu.aportado === 1300 && cerca(pu.ganadoValores, 219.38) && cerca(pu.ganadoOcioso, gO) && cerca(pu.costes, 6) && cerca(pu.valorNeto, 1300 + 219.38 + gO - 6),
      `a mano: 1.300 + 219,38 (A) + 127,08 (ocioso) − 6 = 1.640,46 € (${pu.ganadoValores.toFixed(2)}, ${pu.ganadoOcioso.toFixed(2)}, ${pu.valorNeto.toFixed(2)})`)
    const txt = L.movimientos.map(m => `${m.tipo}${m.simbolo ? ' ' + m.simbolo : ''}`).join(' · ')
    // §156: el ocioso O día a día: 0 · 0 · 1.098,90 − 999 − 299 + 299 = 99,90 · 127,08; 3 órdenes del ocioso + su venta final = 4 de las 6.
    { const De = require(R + '/lib/builder/detallePlan.js'), dd = De.detallePlan({ evaluacion: { plan: { medidas: { valorNeto: r.valorNeto }, ejecucion: r } } }, p)
      ok([0, 0, 99.9, gO].every((v, k) => cerca(L.curvas.O[k], v)) && dd.ocioso.simbolo === 'O' && dd.ocioso.ordenes === 4 && cerca(dd.ocioso.aporto, gO) && dd.cabecera.ordenesValores === 2 && dd.cabecera.ordenes === 6 && dd.filas.length === 1 && dd.curvas.series.length === 2 && dd.curvas.series[1].rol === 'ocioso' && dd.suma.cuadra,
        `a mano, el ocioso día a día: 0 · 0 · 99,90 · 127,08 € y 4 de las 6 órdenes son suyas (${L.curvas.O.map(v => v.toFixed(2)).join(' · ')}; ${dd.ocioso.ordenes} de ${dd.cabecera.ordenes})`)
      // §191: el CAGR de su aportación = (1.300 + 127,08) / 1.300 elevado a 1 / años (la misma cuenta que un valor); su curva solo sube (0 · 0 ·
      // 99,90 · 127,08): sin caída; y el día 0 ya hay dinero en el ocioso.
      { const an = (Date.parse(G[3] + 'T00:00:00Z') - Date.parse(G[0] + 'T00:00:00Z')) / (365.25 * 864e5)
        ok(cerca(dd.ocioso.cagr, Math.pow((1300 + gO) / 1300, 1 / an) - 1) && !(dd.ocioso.caidaEur < 0) && dd.ocioso.dentro > 0 && dd.ocioso.dentro <= 1, `§191: el ocioso con su CAGR, sin caída y su tiempo dentro (${dd.ocioso.cagr}, ${dd.ocioso.caidaEur}, ${dd.ocioso.dentro})`) }
      // §157. Enero: entran 1.000 € y acaba con 999 € (el oro, tras 1 € de comisión): −1 €, −0,1 %. Febrero: 1.640,46 − 999 − 300 aportados = +341,46 €.
      // El año: −1 + 341,46 = 340,46 € = 1.640,46 − 1.300 aportados. Día 1: 999 € en el oro → 100 % en el ocioso.
      const mm = dd.mensuales[0]
      ok(dd.mensuales.length === 1 && cerca(mm.meses[0].euros, -1) && cerca(mm.meses[0].pct, -0.001) && cerca(mm.meses[1].euros, r.valorNeto - 999 - 300) && cerca(mm.euros, r.valorNeto - 1300) && cerca(mm.pct, (1 + mm.meses[0].pct) * (1 + mm.meses[1].pct) - 1) && cerca(dd.donde.dias[0].ocioso, 1),
        `mensuales a mano con aportación: enero −1,00 € (−0,10 %), febrero ${mm.meses[1].euros.toFixed(2)} €, el año ${mm.euros.toFixed(2)} € = final − aportado`)
      // §159: el ocioso O en palabras; el día 1 hay 999 € en el ocioso al cierre; la venta final de O, el último día.
      const mo = dd.movimientos
      ok(mo[1].que === 'Ocioso: compra O · 19,98 × 50,00 €' && mo[1].clase === 'ocioso' && cerca(mo[1].enOcioso, 999) && mo[4].que === 'Aportación' && mo[7].que.startsWith('Ocioso: vende O · ') && mo[7].que.endsWith('(venta final del último día)') && mo[0].nombreOcioso === 'O',
        `movimientos a mano con ocioso: ${mo.map(m => m.que).join(' · ')}`) }
    ok(txt === 'aportacion · compra O · venta O · compra A · aportacion · compra O · venta A · ventaFinal O' && L.movimientos[1].rol === 'ocioso' && L.porSimbolo.O.rol === 'ocioso' && cerca(L.porSimbolo.O.valorFinal, 299 / 55 * 60), `a mano: los movimientos, en orden (${txt})`)
    ok(cerca(L.reparto[0].ocioso, 999) && L.reparto[0].valores === 0 && cerca(L.reparto[2].valores, 109.69 * 11) && cerca(L.reparto[2].ocioso, 299) && cerca(L.reparto[2].liquidez, 0),
      `a mano: el día 1 hay 999 € en el ocioso; el día 3, 1.206,59 € en valores y 299 € en el ocioso (${L.reparto[2].valores.toFixed(2)}, ${L.reparto[2].ocioso.toFixed(2)})`)
  }

  // ── 2 · A mano, con un valor ──
  const EMA20 = { tipo: 'editor', motor: 1, formato: 1, nombre: 'Prueba editor EMA20', stops: [{ id: 'inicial', pct: 8, tipo: 'porcentaje', motivo: 'stop' }],
    entrada: { orden: { tipo: 'apertura' }, senal: { c: 'cruza', de: { c: 'precioVsMedia', p: { lado: 'encima', tipo: 'EMA', periodo: '$ema' } } } },
    salidas: [{ si: { c: 'cruza', de: { c: 'precioVsMedia', p: { lado: 'debajo', tipo: 'EMA', periodo: '$ema' } } }, tipo: 'condicion', motivo: 'cruce_bajista', precio: 'apertura' }],
    parametros: { lista: [{ max: 400, min: 2, paso: 1, tipo: 'entero', nombre: 'ema', defecto: 20, ventana: true, descripcion: 'Periodo de la EMA' }], version: 1, restricciones: [] } }
  const PERIODO = [[100, 100, 100, 100], [100, 105, 100, 104], [105, 108, 104, 107], [107, 111, 106, 110], [110, 113, 109, 112], [112, 116, 111, 115],
    [115, 119, 114, 118], [118, 121, 117, 120], [120, 120, 112, 113], [114, 115, 113, 114], [114, 115, 113, 114], [114, 115, 113, 114]]
  const datosMano = (fechasPeriodo) => {
    const cal = Array.from({ length: 300 }, (_, i) => dia('2019-01-01', i)), fechas = [...cal, ...fechasPeriodo]
    const vela = (date, [open, high, low, close]) => ({ date, open, high, low, close, volume: 1000 })
    const TEST = fechas.map((f, i) => vela(f, i < 300 ? [100, 100, 100, 100] : PERIODO[i - 300])), OCI = fechas.map(f => vela(f, [50, 50, 50, 50]))
    const plano = fechas.map(date => ({ date, open: 100, close: 100 }))
    return { fechas, qqq: plano, spy: plano, etf: fechas.map(() => null), qqqVelas: plano, velas: { TEST, OCI } }
  }
  const seguidas = Array.from({ length: 12 }, (_, i) => dia('2020-03-02', i))
  const conAbril = [...Array.from({ length: 5 }, (_, i) => dia('2020-03-02', i)), ...Array.from({ length: 7 }, (_, i) => dia('2020-04-01', i))]
  const conJulio = [...Array.from({ length: 10 }, (_, i) => dia('2020-03-02', i)), '2021-06-30', '2021-07-01']
  const planUno = (fechasPeriodo, extra = {}, pieza = {}) => ({ tipo: 'plan', formato: 1, calculo: 1,
    dinero: { capitalInicial: 10000, aportaciones: { frecuencia: 'ninguna' }, extraordinarias: [] },
    piezas: [{ id: 'e', tipo: 'estrategia', estrategia: { id: 'x', name: 'EMA2', definition: EMA20, params: { ema: 2 } }, activo: 'TEST', peso: 1, ocioso: 'OCI', aportacionDentro: 'espera', apalancamiento: 1, ...pieza }],
    reparto: { aportacionesA: 'pesos', rebalanceo: { calendario: 'nunca', banda: null } }, impuestos: { regimen: 'ninguno', reglaDosMeses: true }, costes: null,
    periodo: { desde: fechasPeriodo[0], hasta: fechasPeriodo[fechasPeriodo.length - 1] }, ...extra })
  {
    // Sin costes ni impuestos: 10.000 € entran a 105 y salen a 114: 10.000 × 114 / 105 = 10.857,14 €. El ocioso (precio fijo, 50) no gana nada.
    const r = coherente('un valor a mano', planUno(seguidas), datosMano(seguidas)), L = r.libro, o = L.operaciones[0]
    ok(L.operaciones.length === 1 && cerca(o.compras, 10000) && cerca(o.ventas, 10000 * 114 / 105) && cerca(o.resultado, 10000 * 9 / 105) && o.entryPrice === 105 && o.exitPrice === 114 && cerca(L.puente.ganadoValores, 10000 * 9 / 105) && cerca(L.puente.ganadoOcioso, 0) && L.puente.costes === 0,
      `un valor a mano: una operación, 10.000 € a 105 → 10.857,14 € a 114: gana 857,14 € (${o.resultado.toFixed(2)})`)
    ok(r.estrategias.e.operaciones.length === L.operaciones.length && o.entryDate === r.estrategias.e.operaciones[0].entryDate && o.exitDate === r.estrategias.e.operaciones[0].exitDate, 'un valor a mano: la operación del libro es la de la estrategia (mismas fechas)')
    // §161: con un valor, detallePlan dice unValor y su símbolo; 1 valor, 1 operación, la suma 10.000 + 857,14 = 10.857,14 €.
    { const du = require(R + '/lib/builder/detallePlan.js').detallePlan({ evaluacion: { plan: { medidas: { valorNeto: r.valorNeto }, ejecucion: r } } }, planUno(seguidas))
      ok(du.unValor === true && du.simbolo === 'TEST' && du.cabecera.valores === 1 && du.filas.length === 1 && du.total.operaciones === 1 && cerca(du.suma.final, 10000 + 10000 * 9 / 105) && du.suma.cuadra,
        `detalle con un valor: unValor, TEST, 1 operación y la suma ${du.suma.final.toFixed(2)} €`) }
    // Con 0,1 % de comisión (mínimo 1 €) en cada orden: la suma sigue cuadrando y los costes van aparte de lo ganado.
    const rc = coherente('un valor a mano, con comisión', planUno(seguidas, { costes: { comisionPct: 0.1, comisionMinEur: 1, horquillaPct: { QQQ: 0, ETF: 0, SPY: 0 } } }), datosMano(seguidas))
    ok(rc.libro.puente.costes > 0 && cerca(rc.libro.puente.aportado + rc.libro.puente.ganadoValores + rc.libro.puente.ganadoOcioso - rc.libro.puente.costes, rc.valorNeto, 1e-6), `con comisión: ${rc.libro.puente.costes.toFixed(2)} € de costes, aparte de lo ganado`)
  }
  {
    // Aportación mensual con la operación abierta y «Compra más acción»: la operación tiene DOS compras y una venta.
    const ap = { dinero: { capitalInicial: 10000, aportaciones: { importe: 1000, frecuencia: 'mensual', crecimientoAnual: 0 }, extraordinarias: [] } }
    const r = coherente('un valor a mano, compra más acción', planUno(conAbril, ap, { aportacionDentro: 'compra' }), datosMano(conAbril)), L = r.libro
    const compras = L.movimientos.filter(m => m.tipo === 'compra' && m.simbolo === 'TEST')
    ok(L.operaciones.length === 1 && compras.length === 2 && cerca(L.operaciones[0].compras, 11000) && cerca(L.operaciones[0].unidades, sum(compras, m => m.unidades)), `compra más acción: una operación con dos compras (10.000 + 1.000 €) y ${L.operaciones[0].unidades.toFixed(4)} acciones`)
  }
  {
    // El impuesto del año, el primer día de julio del siguiente: sale como movimiento y en la suma.
    const r = coherente('un valor a mano, con impuestos', planUno(conJulio, { impuestos: { regimen: 'ES-ahorro', reglaDosMeses: true } }), datosMano(conJulio)), L = r.libro
    const imp = L.movimientos.filter(m => m.tipo === 'impuesto')
    ok(imp.length === 1 && imp[0].fecha === '2021-07-01' && cerca(imp[0].importe, r.impuestos.pagados, 1e-9) && cerca(L.puente.impuestos, 10000 * 9 / 105 * 0.19, 1e-9), `impuestos: 857,14 € × 19 % = 162,86 €, pagados el 01/07/2021 (${imp[0]?.importe.toFixed(2)})`)
    { const mj = require(R + '/lib/builder/detallePlan.js').movimientos(L, r.serie, 'OCI').find(m => m.tipo === 'impuesto')
      ok(mj?.que === 'Impuestos de 2020 (se pagan en julio)' && mj.signo === -1 && mj.clase === 'impuesto', `movimientos: «${mj?.que}»`) }
  }

  // ── 3 · Con precios reales ──
  {
    const DATOS = E.DATOS, fotoM = require(path.join(DATOS, 'foto_mom.json'))
    const velasDe = (sym) => { const r = fotoM[sym]; if (!r?.quote) return null; const q = r.quote; return r.timestamp.map((ts, i) => ({ date: new Date((ts + (r.meta.gmtoffset || 0)) * 1000).toISOString().slice(0, 10), open: q.open[i], high: q.high[i], low: q.low[i], close: q.close[i], volume: q.volume[i] })).filter(v => v.open > 0 && v.close > 0) }
    const qqq = velasDe('QQQ'), aapl = velasDe('AAPL'), msft = velasDe('MSFT')
    const C = require(R + '/lib/laboratorioCartera.js'), S = require(R + '/lib/etfSintetico.js'), SIN = require(R + '/lib/etfSinteticos.json')
    const datos = { ...C.alineaDatos({ qqq, etf: { simbolo: 'QQQ', velas: qqq }, spy: qqq }, { QQQ: [], SPY: [] }), velas: { AAPL: aapl, ...(msft ? { ORO: msft } : {}) } }
    datos.etf = datos.etf.map(() => null)
    const ocioso = msft ? 'ORO' : 'QQQ'
    const p = { tipo: 'plan', formato: 1, calculo: 1, dinero: { capitalInicial: 10000, aportaciones: { importe: 300, frecuencia: 'mensual', crecimientoAnual: 0 }, extraordinarias: [] },
      piezas: [{ id: 'e', tipo: 'estrategia', estrategia: { id: 'c4b2949f', name: 'Prueba editor EMA20', definition: EMA20, params: { ema: 20, intervalo: 'diario' } }, activo: 'AAPL', peso: 1, ocioso, aportacionDentro: 'espera', apalancamiento: 1 }],
      reparto: { aportacionesA: 'pesos', rebalanceo: { calendario: 'nunca', banda: null } }, impuestos: { regimen: 'ES-ahorro', reglaDosMeses: true },
      costes: { comisionPct: 0, comisionMinEur: 0.185, horquillaPct: { QQQ: 0, ETF: 0, SPY: 0 } }, periodo: { desde: '2016-01-01', hasta: '2025-12-31' } }
    const r = coherente(`AAPL real con ocioso ${ocioso}, 300 €/mes, impuestos y 0,185 €`, p, datos, { minOps: 100 })
    ok(r.libro.operaciones.length === r.estrategias.e.operaciones.length, `AAPL real: tantas operaciones en el libro como en la estrategia (${r.libro.operaciones.length} y ${r.estrategias.e.operaciones.length})`)
    coherente('AAPL real, compra más acción y ×2', { ...p, piezas: [{ ...p.piezas[0], aportacionDentro: 'compra', apalancamiento: 2 }] }, datos, { minOps: 100 })
    coherente('AAPL real, sin impuestos y ocioso en liquidez', { ...p, impuestos: { regimen: 'ninguno', reglaDosMeses: true }, piezas: [{ ...p.piezas[0], ocioso: 'LIQUIDEZ' }] }, datos, { minOps: 100 })
    // Las comparaciones (comprar y mantener) y los planes sin estrategia: todo 'otro', y también cuadran.
    for (const x of Ev.referenciasDe(p)) { const rr = coherente(`comparación ${x.id}`, x.plan, datos); if (x.id === 'QQQ') ok(rr.libro.puente.ganadoValores === 0 && rr.libro.puente.ganadoOtros > 0 && rr.libro.operaciones.length === 0, 'comprar y mantener QQQ: todo lo ganado es «otros» y no hay operaciones') }
    const dE = C.alineaDatos({ qqq, etf: { simbolo: 'SINTETICO', velas: S.construyeSintetico(C.preciosTotales(qqq, []), { k: 2, comision: SIN.comision[2], ajuste: SIN.ajuste[2] }) }, spy: qqq }, { QQQ: [], SPY: [], SINTETICO: [] })
    const regla = C.reglaFiltro(50, 'diario', 'apalancado')
    coherente('cartera + QQQ + liquidez (sin estrategia)', { tipo: 'plan', formato: 1, calculo: 1, etf: 'x2', dinero: { capitalInicial: 10000, aportaciones: { importe: 300, frecuencia: 'mensual', crecimientoAnual: 2 }, extraordinarias: [{ fecha: '2018-05-10', importe: 5000 }] },
      reparto: { aportacionesA: 'infraponderada', rebalanceo: { calendario: 'anual', banda: 0.1 } }, impuestos: { regimen: 'ES-ahorro', reglaDosMeses: true },
      costes: { comisionPct: 0.1, comisionMinEur: 2, horquillaPct: { QQQ: 0.02, ETF: 0.05, SPY: 0.02 } }, periodo: { desde: '2012-01-01', hasta: '2024-12-31' },
      piezas: [{ id: 'c', tipo: 'cartera', regla, peso: 0.5 }, { id: 'q', tipo: 'activo', activo: 'QQQ', peso: 0.3 }, { id: 'l', tipo: 'activo', activo: 'LIQUIDEZ', peso: 0.2 }] }, dE)
  }
  // La lista Degiro (foto), con oro de ocioso (las velas de MA con su nombre), aportaciones, impuestos y 0,185 € por orden.
  const foto = require(path.join(E.DATOS, 'foto_degiro.json'))
  foto.QQQ = foto.AAPL; foto.SPY = foto.MSFT; foto.GLD = foto.MA
  E.estado.foto = foto; E.estado.enCurso = false
  for (const s of Object.keys(foto)) E.llenaCache(s, { desde: '2006-01-01' })
  const H = require(R + '/pages/api/multibacktest.js').default
  { const orig = globalThis.fetch; globalThis.fetch = async (url, o) => { const m = String(url).match(/\/rest\/v1\/strategies\?id=eq\.([^&]+)/); if (m) { const s = E.ESTRATEGIAS.get(m[1]); const filas = s ? [{ code_js: s.code_js, params: s.params, name: s.name, definition: s.definition ?? null }] : []; return { ok: true, status: 200, json: async () => filas, text: async () => JSON.stringify(filas) } } return orig(url, o) } }
  const est = E.FILAS.find(s => s.name === 'Prueba editor EMA20'); if (!est) throw new Error('falta «Prueba editor EMA20»')
  const SIMB = ['AAPL', 'AMZN', 'ASML', 'GOOGL', 'META', 'MSFT', 'NFLX', 'NVDA', 'TSLA', 'UNH', 'V']   // sin MA: sus velas hacen de oro
  const ajustes = (modo, extra = {}) => ({ ...Pa.AJUSTES_PLAN, comisionTipo: 'fija', comisionFija: 0.185, donde: 'lista', periodo: 'todo', capital: 10000, aportacion: 300, impuestos: 'ES-ahorro', ocioso: 'GLD',
    lista: Li.mergeLista({ simbolos: SIMB, modo, maxPosiciones: 4 }), ...extra })
  for (const modo of ['compartido', 'concentrado']) {
    const a = ajustes(modo), cuerpo = PD.peticionPorDentro({ a, estrategia: est })
    const rm = await E.llama(H, { ...cuerpo, conCandidatos: true })
    if (rm.status !== 200) { ok(false, `lista real ${modo}: /api/multibacktest ${rm.status} ${String(rm.cuerpo).slice(0, 200)}`); continue }
    const j = JSON.parse(rm.cuerpo), plan = Pl.planListaCalculable(Pa.planDe(a, est)).plan
    const fechas = [...new Set(j.candidatosAzar.activos.flatMap(x => x.fechas))].sort()
    const velasGLD = E.velasFoto('GLD')
    const r = coherente(`lista Degiro real, ${modo}, con oro, 300 €/mes, impuestos y 0,185 €`, plan, { fechas, qqq: fechas.map(() => null), etf: fechas.map(() => null), spy: fechas.map(() => null), lista: j.candidatosAzar, velas: { GLD: velasGLD } }, { minOps: 100 })
    const porValor = {}; for (const o of r.libro.operaciones) porValor[o.simbolo] = (porValor[o.simbolo] || 0) + o.resultado
    // §163: con precios reales, las señales generadas son todos los candidatos del Backtesting; las ejecutadas, las operaciones del plan.
    { const S = r.libro.senales, nC = j.candidatosAzar.activos.reduce((s, a) => s + (a.candidatos || []).length, 0), M = S.motivos
      ok(S.generadas === nC && S.ejecutadas === r.libro.operaciones.length && S.generadas === S.ejecutadas + M.slots + M.filtro + M.dinero + M.yaDentro && S.descartadas.length === S.generadas - S.ejecutadas && Object.values(S.porSimbolo).reduce((s, x) => s + x.ejecutadas, 0) === S.ejecutadas,
        `señales con precios reales (${modo}): ${S.generadas} candidatos = ${S.ejecutadas} ejecutadas + ${M.slots} sin hueco + ${M.filtro} filtro + ${M.dinero} sin dinero + ${M.yaDentro} ya dentro`) }
    ok(Object.keys(porValor).every(s => SIMB.includes(s) && cerca(porValor[s], r.libro.porSimbolo[s].ganado, 1e-6)) && r.libro.porSimbolo.GLD?.rol === 'ocioso' && r.libro.puente.impuestos > 0,
      `lista real ${modo}: lo ganado por cada valor = la suma de sus operaciones (${Object.keys(porValor).length} valores, ${r.libro.operaciones.length} operaciones; ocioso ${r.libro.puente.ganadoOcioso.toFixed(2)} €; impuestos ${r.libro.puente.impuestos.toFixed(2)} €)`)
  }

  // ── 4 · /api/plan ──
  {
    const HP = require(R + '/pages/api/plan.js').default
    const a = ajustes('concentrado', { aportacion: 0, impuestos: 'ninguno', ocioso: 'LIQUIDEZ' }), cuerpo = PD.peticionPorDentro({ a, estrategia: est }), plan = Pl.planListaCalculable(Pa.planDe(a, est)).plan
    const con = await E.llama(HP, { plan, curvas: true, cuerpoLista: cuerpo, libro: true }), sin = await E.llama(HP, { plan, curvas: true, cuerpoLista: cuerpo })
    const jc = con.status === 200 ? JSON.parse(con.cuerpo) : null, js = sin.status === 200 ? JSON.parse(sin.cuerpo) : null
    const L = jc?.evaluacion.plan.ejecucion.libro
    ok(!!L && !!js && !('libro' in js.evaluacion.plan.ejecucion) && Math.abs(L.puente.descuadre) < 0.005 && Math.abs(L.puente.valorNeto - jc.finalPorDentro) < 0.005 && jc.evaluacion.plan.medidas.valorNeto === js.evaluacion.plan.medidas.valorNeto,
      `/api/plan: con libro: true devuelve el libro (${L ? L.operaciones.length + ' operaciones, ' + L.movimientos.length + ' movimientos, ' + (con.cuerpo.length / 1024).toFixed(0) + ' KB frente a ' + (sin.cuerpo.length / 1024).toFixed(0) + ' KB' : con.status + ' ' + String(con.cuerpo).slice(0, 200)}); sin pedirlo, no; y su suma es el final de «por dentro» (${jc?.finalPorDentro?.toFixed(2)} €)`)
  }
  // ── 5 · La pantalla (§156) ──
  {
    const HP = require(R + '/pages/api/plan.js').default
    const D = require('./domFalso'); D.pon()
    { const Mod = require('module'), orig = Mod._load; const vacio = new Proxy({}, { get: (_, k) => k === '__esModule' ? true : () => null }); const nada = new Proxy(function () {}, { get: (_, k) => k === '__esModule' ? true : k === Symbol.toPrimitive ? () => 0 : k === 'then' ? undefined : nada, apply: () => nada, construct: () => nada })
      Mod._load = function (req, ...r) { return req === 'recharts' ? vacio : req === 'lightweight-charts' ? nada : orig.call(this, req, ...r) } }
    { const proto = Object.getPrototypeOf(globalThis.document.createElement('div')); if (!proto.querySelectorAll) { proto.querySelectorAll = () => []; proto.querySelector = () => null } }
    if (!globalThis.ResizeObserver) globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
    if (!globalThis.requestAnimationFrame) { globalThis.requestAnimationFrame = (f) => setTimeout(f, 0); globalThis.cancelAnimationFrame = (t) => clearTimeout(t) }
    const React = require(path.join(R, 'node_modules', 'react')), RDC = require(path.join(R, 'node_modules', 'react-dom', 'client'))
    const BP = require(R + '/components/BuilderPlan.js').default
    const datosLista = { watchlist: SIMB.map(s => ({ symbol: s, name: s, list_ids: [1] })), wlLists: [{ id: 1, name: 'Degiro' }], rankingData: {} }
    const aPant = ajustes('concentrado')   // 300 €/mes, impuestos, oro (GLD), 0,185 € por orden
    let ultima = null, conLibro = true, ido = null
    // §164: el gráfico de velas del Backtesting espera a verse (IntersectionObserver) para pedir sus velas; aquí nunca se ve.
    if (!globalThis.IntersectionObserver) globalThis.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} }
    const calcula = async (p, c) => { const r = await E.llama(HP, { plan: p, curvas: true, cuerpoLista: c, ...(conLibro ? { libro: true } : {}) }); const j = JSON.parse(r.cuerpo); if (r.status !== 200) throw new Error(j.error); ultima = j; return j }
    const monta = (inicial) => D.monta(React.createElement(BP, { estrategias: [est], estrategiaId: est.id, datosLista, onIrAValor: (s) => { ido = s }, deps: { ctx: null, calcula, calculaPorDentro: async () => { throw new Error('no') } },
      inicial: { planes: [], pestana: 'n1', simbolos: ['AAPL'], pruebas: [], resultadoPrueba: { periodos: [] }, ajustes: aPant, ...inicial } }), RDC)
    const b = monta({ vistaDer: 'detalle' })
    for (let k = 0; k < 120 && !b.raiz.conAtributo('data-vista-detalle').length; k++) await D.espera(250)
    const pest = (id) => b.raiz.busca(n => n.nodeName === 'BUTTON' && n.getAttribute?.('data-vista-der') === id)
    const De = require(R + '/lib/builder/detallePlan.js'), ej = ultima?.evaluacion.plan.ejecucion, L = ej?.libro, m = ultima?.evaluacion.plan.medidas
    ok(!!pest('dinero') && !!pest('detalle') && !pest('dentro') && pest('detalle').getAttribute('aria-pressed') === 'true' && b.raiz.conAtributo('data-vista-detalle').length === 1 && !b.raiz.conAtributo('data-cifras').length,
      'pantalla: dos pestañas («Tu dinero» y «Detalle»; §168: sin «La cartera por dentro») y, con «Detalle» abierta, su contenido y no el de «Tu dinero»')
    const suma = b.raiz.conAtributo('data-detalle-suma')[0], trozo = (id) => suma?.todos(n => n.getAttribute('data-suma') === id)[0]?.textContent || ''
    ok(!!L && suma?.getAttribute('data-cuadra') === 'si' && trozo('final') === Pa.euros(m.valorNeto, 0) && trozo('aportado').startsWith(Pa.euros(ej.aportado, 0)) && trozo('valores').includes(Pa.euros(Math.abs(L.puente.ganadoValores), 0)) && trozo('ocioso').includes(Pa.euros(Math.abs(L.puente.ganadoOcioso), 0))
      && trozo('costes').includes(Pa.euros(L.puente.costes, 0)) && trozo('impuestos').includes(Pa.euros(L.puente.impuestos, 0)) && suma.textContent.includes('= «Tienes al final» de «Tu dinero» ✓'),
      `pantalla, la línea que suma: «${['aportado', 'valores', 'ocioso', 'costes', 'impuestos'].map(trozo).join(' ')} = ${trozo('final')}»`)
    // §167: al entrar, los valores plegados (solo el total y el ocioso); se despliegan con «▸ Los N valores».
    ok(!b.raiz.conAtributo('data-valor').length && b.raiz.conAtributo('data-pliega-valores')[0]?.getAttribute('aria-expanded') === 'false' && b.raiz.conAtributo('data-fila-ocioso').length === 1, 'al entrar, los valores plegados (el total y el ocioso a la vista)')
    D.pulsa(b.raiz.conAtributo('data-pliega-valores')[0]); await D.espera(30)
    const filasV = b.raiz.conAtributo('data-valor'), conOps = Object.values(L.porSimbolo).filter(s => s.rol === 'valor').length
    const d0 = De.detallePlan(ultima, Pl.planListaCalculable(Pa.planDe(aPant, est)).plan)
    ok(filasV.length === conOps && conOps > 5 && filasV[0].getAttribute('data-valor') === d0.filas[0].simbolo && filasV[0].textContent.includes(Pa.euros(Math.abs(d0.filas[0].aporto), 0)) && b.raiz.conAtributo('data-fila-total')[0].textContent.includes(`Los ${conOps} valores`)
      && cerca(sum(d0.filas, f => f.aporto), L.puente.ganadoValores, 1e-6) && sum(d0.filas, f => f.operaciones) === L.operaciones.length && d0.filas.every(f => f.dentro > 0 && f.dentro < 1),
      `pantalla, «Qué aportó cada valor»: ${filasV.length} valores, de más a menos (el primero, ${d0.filas[0].simbolo} ${d0.filas[0].aporto.toFixed(2)} €); sus «Aportó» suman lo ganado en los valores y sus operaciones, las ${L.operaciones.length} del plan`)
    const oc = b.raiz.conAtributo('data-fila-ocioso')[0]?.textContent || ''
    ok(oc.includes('Dinero ocioso · oro (GLD)') && oc.includes(Pa.euros(Math.abs(L.puente.ganadoOcioso), 0)) && oc.includes(`${Pa.numero(d0.ocioso.ordenes, 0)} órdenes`) && oc.includes(Pa.pct(d0.ocioso.media, 0)) && d0.cabecera.ordenesValores + d0.cabecera.ordenesOcioso === ej.costes.ordenes && cerca(d0.total.enValores + d0.ocioso.media + d0.ocioso.liquidez, 1, 1e-9),
      `pantalla, la fila del ocioso: «${oc}» (órdenes de la estrategia ${d0.cabecera.ordenesValores} + del ocioso ${d0.cabecera.ordenesOcioso} = ${ej.costes.ordenes})`)
    const cabT = b.raiz.conAtributo('data-detalle-cabecera')[0]?.todos(n => n.nodeName === 'SPAN')[0]?.textContent || ''
    ok(cabT.includes(`${SIMB.length} valores`) && cabT.includes('velas diarias') && cabT.includes(`${Pa.numero(L.operaciones.length, 0)} operaciones`) && cabT.includes(`${Pa.numero(ej.costes.ordenes, 0)} órdenes`) && cabT.includes(Pa.fechaCorta(ej.serie[0].date)), `pantalla, la línea de arriba: «${cabT}»`)
    // «Cómo crece»: «El plan» (el gráfico de «Tu dinero» y los «comprar y mantener» del plan, sin la fila del ocioso en liquidez) y «Valor a valor».
    const bh = b.raiz.conAtributo('data-fila-bh').map(n => n.getAttribute('data-fila-bh'))
    ok(b.raiz.conAtributo('data-grafico', 'plan').length === 1 && bh.join() === 'PLAN,ACTIVO,QQQ,SPY' && b.raiz.conAtributo('data-fila-bh', 'PLAN')[0].textContent.includes(Pa.euros(m.valorNeto, 0)) && !b.raiz.conAtributo('data-grafico', 'valores').length,
      `pantalla, «El plan»: el gráfico del plan y las filas ${bh.join(', ')}`)
    const modoB = (id) => b.raiz.busca(n => n.nodeName === 'BUTTON' && n.getAttribute?.('data-modo-crece') === id)
    D.pulsa(modoB('valores')); await D.espera(30)
    const gv = b.raiz.conAtributo('data-grafico', 'valores')[0]
    ok(!!gv && Number(gv.getAttribute('data-series')) === conOps + 1 && b.raiz.conAtributo('data-linea-valor').length === conOps + 1 && b.raiz.conAtributo('data-chip-valor').length === conOps + 1 && !b.raiz.conAtributo('data-grafico', 'plan').length,
      `pantalla, «Valor a valor»: ${gv?.getAttribute('data-series')} líneas (los ${conOps} valores y el ocioso)`)
    D.pulsa(b.raiz.conAtributo('data-chip-valor', d0.filas[1].simbolo)[0]); await D.espera(30)
    ok(b.raiz.conAtributo('data-elegida')[0]?.getAttribute('data-linea-valor') === d0.filas[1].simbolo && b.raiz.conAtributo('data-valor', d0.filas[1].simbolo)[0].getAttribute('aria-selected') === 'true', `al pulsar ${d0.filas[1].simbolo} en la leyenda, su línea queda resaltada y su fila marcada`)
    D.pulsa(modoB('plan')); await D.espera(30)
    D.pulsa(b.raiz.conAtributo('data-elige-valor', d0.filas[0].simbolo)[0]); await D.espera(30)
    // §160/§164: pulsar un valor de la tabla enseña sus velas (el gráfico del Backtesting) con sus operaciones, en lugar de «Cómo crece».
    const vv = () => b.raiz.conAtributo('data-velas-valor'), nOpsSym = d0.porOperacion.ops.filter(o => o.simbolo === d0.filas[0].simbolo).length
    ok(vv().length === 1 && vv()[0].getAttribute('data-velas-valor') === d0.filas[0].simbolo && Number(vv()[0].getAttribute('data-operaciones')) === nOpsSym && !vv()[0].hasAttribute('data-foco') && !b.raiz.conAtributo('data-tarjeta', 'detalle-crece').length,
      `al pulsar ${d0.filas[0].simbolo} en la tabla: su gráfico de velas del Backtesting con sus ${nOpsSym} operaciones, en lugar de «Cómo crece»`)
    D.pulsa(b.raiz.conAtributo('data-volver-velas')[0]); await D.espera(30)
    ok(b.raiz.conAtributo('data-tarjeta', 'detalle-crece').length === 1 && !vv().length, '«← Volver al gráfico del plan»')
    // «Vista de gráficos»: cerrada, ningún gráfico; abierta, uno por valor (los del Backtesting); «Ver en grande» lo abre arriba.
    ok(!b.raiz.conAtributo('data-vista-graficos').length && !vv().length, '«Vista de gráficos» cerrada: ningún gráfico')
    D.pulsa(b.raiz.conAtributo('data-abre-vista-graficos')[0]); await D.espera(30)
    ok(b.raiz.conAtributo('data-grafico-pequeno').length === conOps && vv().length === conOps, `«Vista de gráficos»: ${conOps} gráficos de velas, uno por valor`)
    D.pulsa(b.raiz.conAtributo('data-ver-grande', d0.filas[2].simbolo)[0]); await D.espera(30)
    ok(b.raiz.conAtributo('data-tarjeta', 'detalle-velas')[0]?.textContent.startsWith(`${d0.filas[2].simbolo} · sus velas`), `«Ver en grande» de ${d0.filas[2].simbolo} lo abre arriba`)
    D.pulsa(b.raiz.conAtributo('data-volver-velas')[0]); D.pulsa(b.raiz.conAtributo('data-abre-vista-graficos')[0]); await D.espera(30)
    // §166: «⤢ Ampliar»: el gráfico se abre a pantalla completa, más alto; «✕ Cerrar» lo devuelve. Con «Dónde está tu dinero».
    { const gd0 = b.raiz.conAtributo('data-grafico', 'donde-esta')[0], h0 = Number(gd0?.getAttribute('height'))
      D.pulsa(b.raiz.conAtributo('data-amplia', 'Dónde está tu dinero cada día')[0]); await D.espera(30)
      const amp = b.raiz.conAtributo('data-ampliado', 'Dónde está tu dinero cada día')[0], h1 = Number(amp?.todos(n => n.getAttribute('data-grafico') === 'donde-esta')[0]?.getAttribute('height'))
      ok(!!amp && h1 > h0 + 100 && b.raiz.conAtributo('data-grafico', 'donde-esta').length === 1, `«⤢ Ampliar» abre «Dónde está tu dinero» a pantalla completa, más alto (${h0} → ${h1} px)`)
      D.pulsa(b.raiz.conAtributo('data-cierra-ampliado')[0]); await D.espera(30)
      ok(!b.raiz.conAtributo('data-ampliado').length && Number(b.raiz.conAtributo('data-grafico', 'donde-esta')[0]?.getAttribute('height')) === h0, '«✕ Cerrar» lo devuelve a su sitio')
      ok(['Cómo crece · el plan', 'Ganancias mensuales', 'Dónde está tu dinero cada día', 'Resultados por operación'].every(x => b.raiz.conAtributo('data-amplia', x).length === 1), 'cada gráfico de «Detalle» tiene su «⤢ Ampliar»') }
    // §165: ocultar el panel de la izquierda: queda una franja «▶ Cartera · Tu dinero» (el panel sigue montado, oculto); pulsándola vuelve.
    { const izq = () => b.raiz.conAtributo('data-columna', 'izquierda')[0]
      D.pulsa(b.raiz.conAtributo('data-oculta-panel')[0]); await D.espera(30)
      ok(izq()?.style.display === 'none' && b.raiz.conAtributo('data-abre-panel').length === 1 && izq().textContent.includes('Tu dinero'), 'ocultar el panel: franja «▶ Cartera · Tu dinero» y el panel oculto (sigue montado)')
      D.pulsa(b.raiz.conAtributo('data-abre-panel')[0]); await D.espera(30)
      ok(izq()?.style.display !== 'none' && !b.raiz.conAtributo('data-abre-panel').length, 'pulsando la franja vuelve el panel') }
    // §167: pulsar el VALOR de una fila del historial (no solo el resto de la fila) también lleva a su operación; y en el gráfico de velas, la
    // rueda está apagada hasta hacer clic en él y se apaga al salir.
    { const fila = b.raiz.conAtributo('data-operacion')[1], sim = fila.getAttribute('data-operacion')
      D.pulsa(fila); await D.espera(30)
      const v = b.raiz.conAtributo('data-velas-valor')[0], ru = () => v?.todos(n => n.hasAttribute('data-rueda'))[0]
      ok(v?.getAttribute('data-velas-valor') === sim && v.hasAttribute('data-foco') && !fila.todos(n => n.nodeName === 'BUTTON').length && !(b.raiz.conAtributo('data-historial-filtro')[0]), `pulsar la fila de ${sim} lleva a su operación (sin filtrar el historial)`)
      ok(ru()?.getAttribute('data-rueda') === 'apagada', 'la rueda del gráfico de velas, apagada al entrar')
      const caja = v.todos(n => n.hasAttribute('data-mcsym'))[0]; D.pulsa(caja); await D.espera(30)
      ok(ru()?.getAttribute('data-rueda') === 'activa', 'tras un clic en el gráfico, la rueda acerca y aleja')
      D.propsDe(caja).onMouseLeave?.({}); await D.espera(30)
      ok(ru()?.getAttribute('data-rueda') === 'apagada', 'al salir del gráfico, la rueda se apaga otra vez')
      D.pulsa(b.raiz.conAtributo('data-volver-velas')[0]); await D.espera(30) }
    // §164: del historial a su gráfico. Pulsar una fila abre las velas de su valor centradas en esa operación (30 días antes y después) y la
    // resalta (n = su número entre las de ese valor, por fecha de compra); «Ver todo el periodo» quita el foco.
    { const o = d0.porOperacion.ops[d0.porOperacion.ops.length - 1], fo = De.focoDeOperacion(d0.porOperacion.ops, o)
      D.pulsa(b.raiz.conAtributo('data-operacion')[0]); await D.espera(30)
      const v = vv()[0]
      ok(!!fo && v?.getAttribute('data-velas-valor') === o.simbolo && Number(v.getAttribute('data-foco')) === fo.n && fo.n === d0.porOperacion.ops.filter(x => x.simbolo === o.simbolo).length && (b.raiz.conAtributo('data-foco-linea')[0]?.textContent || '').includes(Pa.fechaCorta(o.entryDate)),
        `pulsar la primera fila del historial (${o.simbolo}, ${o.entryDate} → ${o.exitDate}) abre su gráfico centrado en ella (operación ${fo?.n} de ${o.simbolo}, ${fo?.from} → ${fo?.to})`)
      D.pulsa(b.raiz.conAtributo('data-todo-periodo')[0]); await D.espera(30)
      ok(!vv()[0]?.hasAttribute('data-foco') && !b.raiz.conAtributo('data-foco-linea').length, '«Ver todo el periodo» quita el foco')
      D.pulsa(b.raiz.conAtributo('data-volver-velas')[0]); await D.espera(30) }
    D.pulsa(b.raiz.conAtributo('data-ir-valor', d0.filas[0].simbolo)[0]); ok(ido === d0.filas[0].simbolo, 'el «↗» de un valor pide ir a ese valor')
    // §157: con precios reales, cada año de «Ganancias mensuales» es el de «Año a año» y todos los años suman la ganancia neta.
    const anios = Pa.cifrasPlan(ultima, Pl.planListaCalculable(Pa.planDe(aPant, est)).plan).anios
    ok(d0.mensuales.length === anios.length && d0.mensuales.every((f, k) => f.anio === anios[k].anio && cerca(f.pct, anios[k].plan, 1e-9)) && cerca(sum(d0.mensuales, f => f.euros), m.valorNeto - ej.aportado, 1e-6),
      `mensuales con precios reales: ${anios.length} años iguales a «Año a año» (2016: ${(d0.mensuales[0].pct * 100).toFixed(2)} %) y suman ${sum(d0.mensuales, f => f.euros).toFixed(2)} € = ganancia neta`)
    const celdas = b.raiz.conAtributo('data-mes').filter(n => n.textContent !== '').length, meses = sum(d0.mensuales, f => f.meses.filter(Boolean).length)
    ok(b.raiz.conAtributo('data-mes-anio').length === anios.length && celdas === meses && b.raiz.conAtributo('data-mes-total', '2016')[0]?.textContent === Pa.pct(d0.mensuales[0].pct, 1),
      `pantalla, «Ganancias mensuales»: ${anios.length} años y ${celdas} meses; 2016 = ${b.raiz.conAtributo('data-mes-total', '2016')[0]?.textContent}`)
    const gd = b.raiz.conAtributo('data-grafico', 'donde-esta')[0], ley = b.raiz.conAtributo('data-leyenda-donde')[0]?.textContent || ''
    ok(Number(gd?.getAttribute('data-dias')) === ej.serie.length && gd.todos(n => n.hasAttribute('data-banda')).length === 3 && ley.includes(`en valores · ${Pa.pct(d0.donde.media.valores, 0)} de media`) && ley.includes(`en el ocioso (oro (GLD)) · ${Pa.pct(d0.donde.media.ocioso, 0)}`) && cerca(d0.donde.media.valores, d0.total.enValores, 1e-9),
      `pantalla, «Dónde está tu dinero cada día»: ${gd?.getAttribute('data-dias')} días; «${ley}»`)
    const gb = b.raiz.conAtributo('data-grafico', 'por-operacion')[0], ro = b.raiz.conAtributo('data-resumen-operaciones')[0]?.textContent || ''
    ok(Number(gb?.getAttribute('data-barras')) === L.operaciones.length && d0.porOperacion.ganan + d0.porOperacion.pierden <= L.operaciones.length && ro.includes(`${Pa.numero(d0.porOperacion.ganan, 0)} ganan`) && ro.includes(`${Pa.numero(d0.porOperacion.pierden, 0)} pierden`) && d0.porOperacion.ops.every((o, k, a) => !k || o.exitDate >= a[k - 1].exitDate),
      `pantalla, «Resultados por operación»: ${gb?.getAttribute('data-barras')} barras por fecha de venta; «${ro}»`)
    // §158: el historial. 50 filas, la primera la última venta; «Ver 50 más»; buscar el primer valor de la tabla; Gantt; Excel; copiar.
    const filasH = () => b.raiz.conAtributo('data-operacion'), ultimaOp = d0.porOperacion.ops[d0.porOperacion.ops.length - 1]
    ok(filasH().length === 50 && filasH()[0].getAttribute('data-operacion') === ultimaOp.simbolo && filasH()[0].textContent.includes(Pa.fechaCorta(ultimaOp.exitDate)) && !!b.raiz.conAtributo('data-mas-historial')[0] && !!b.raiz.conAtributo('data-excel-historial')[0],
      `pantalla, el historial: 50 filas, la primera la última venta (${ultimaOp.simbolo} ${ultimaOp.exitDate}), con «Ver más» y «Excel»`)
    D.pulsa(b.raiz.conAtributo('data-mas-historial')[0]); await D.espera(30)
    ok(filasH().length === 100, `«Ver 50 más»: ${filasH().length} filas`)
    const symH = d0.filas[0].simbolo, nH = d0.porOperacion.ops.filter(o => o.simbolo === symH).length
    D.escribe(b.raiz.conAtributo('data-busca-historial')[0], symH.toLowerCase()); await D.espera(30)
    const filtroH = b.raiz.conAtributo('data-historial-filtro')[0]?.textContent || ''
    ok(filasH().length === Math.min(50, nH) && filasH().every(n => n.getAttribute('data-operacion') === symH) && filtroH.startsWith(`${Pa.numero(nH, 0)} de ${Pa.numero(L.operaciones.length, 0)}`) && filtroH.includes(Pa.euros(Math.abs(d0.filas[0].aporto), 0)) && !!b.raiz.conAtributo('data-limpiar-busqueda')[0],
      `buscando «${symH.toLowerCase()}»: solo sus ${nH} operaciones y su resultado («${filtroH}»), con la ✕ para limpiar`)
    D.pulsa(b.raiz.conAtributo('data-limpiar-busqueda')[0]); await D.espera(30)
    ok(filasH().length === 50 && !b.raiz.conAtributo('data-historial-filtro').length, 'con la ✕, vuelven todas')
    D.pulsa(b.raiz.conAtributo('data-vista-historial', 'gantt')[0]); await D.espera(60)
    ok(b.raiz.conAtributo('data-gantt-detalle').length === 1 && !filasH().length && !b.raiz.textContent.includes('Mostrar descartados'), 'pantalla, «Gantt»: el del Backtesting, sin la casilla «Mostrar descartados»')
    D.pulsa(b.raiz.conAtributo('data-vista-historial', 'tabla')[0]); await D.espera(30)
    ok(b.raiz.busca(n => n.nodeName === 'BUTTON' && /Copiar para Claude/.test(n.textContent)) != null && !b.raiz.conAtributo('data-detalle-falta').length, 'pantalla: «Copiar para Claude» y ya sin la línea de lo que falta')
    // §162: la fila de cifras y las columnas nuevas.
    const fc = b.raiz.conAtributo('data-fila-cifras')[0], cols = b.raiz.conAtributo('data-tabla', 'detalle-valores')[0].todos(n => n.hasAttribute('data-columna')).map(n => n.getAttribute('data-columna'))
    ok(!!fc && fc.todos(n => n.hasAttribute('data-cifra-detalle')).length === 7 && fc.textContent.includes(Pa.pct(m.twrNeto)) && cols.join() === 'Aportó,Aportó %,CAGR de su aportación,Operaciones,Ganadoras,Profit Factor,Peor caída,Dinero en él,Tiempo dentro'
      && b.raiz.conAtributo('data-en-el', d0.filas[0].simbolo)[0]?.getAttribute('title') === `De media, ${Pa.euros(d0.filas[0].enElEur, 0)} en ${d0.filas[0].simbolo}` && cerca(sum(d0.filas, f => f.enEl), d0.total.enValores, 1e-9) && cerca(sum(d0.filas, f => f.aportoPct), d0.total.aportoPct, 1e-9),
      `pantalla, la fila de cifras (7) y las columnas por valor (${cols.length}); los «Dinero en él» y los «Aportó %» suman el total`)
    // §167: la peor caída de la fila del total = la de la suma de las curvas de todos los valores.
    { const cs = d0.filas.map(fl => L.curvas[fl.simbolo]), sumaC = cs[0].map((_, i) => cs.reduce((x, c) => x + c[i], 0)), cd = De.caidaDeCurva(sumaC, ej.serie)
      const celda = b.raiz.conAtributo('data-fila-total')[0].todos(n => n.nodeName === 'TD')[7]
      ok(cd.eur < 0 && cerca(d0.total.caidaEur, cd.eur, 1e-6) && cerca(d0.total.caidaPct, cd.pct, 1e-12) && celda?.textContent === Pa.pct(cd.pct, 1), `la peor caída del total: ${cd.eur.toFixed(2)} € (${celda?.textContent}), la de todos los valores juntos`) }
    // §163: el «%» de señales en la fila del total, con su tooltip.
    const bs = b.raiz.conAtributo('data-senales')[0]
    ok(!!bs && bs.textContent === `${Math.round(d0.senales.pct * 100)} %` && bs.getAttribute('title') === De.textoSenales(d0.senales) && bs.getAttribute('title').startsWith(`Señales de compra de la estrategia: ${d0.senales.generadas.toLocaleString('es-ES')}`),
      `pantalla, el «%» de señales: «${bs?.textContent}» con su tooltip («${(bs?.getAttribute('title') || '').split('\n').slice(0, 3).join(' · ')}»)`)
    // §159: «Todos los movimientos». El primero es el último del plan (los impuestos al vender todo); 50 por página; buscando «gld», solo el oro.
    D.pulsa(b.raiz.conAtributo('data-vista-historial', 'movimientos')[0]); await D.espera(30)
    const filasM = () => b.raiz.conAtributo('data-movimiento'), nMov = L.movimientos.length, nGld = L.movimientos.filter(m => m.simbolo === 'GLD').length
    ok(filasM().length === 50 && filasM()[0].getAttribute('data-movimiento') === L.movimientos[nMov - 1].tipo && !b.raiz.conAtributo('data-excel-historial').length && !filasH().length && b.raiz.conAtributo('data-tabla', 'detalle-movimientos')[0].textContent.includes('En el ocioso (oro (GLD))'),
      `pantalla, «Todos los movimientos»: 50 de ${nMov}, el primero «${filasM()[0]?.textContent.slice(0, 80)}», sin Excel`)
    D.escribe(b.raiz.conAtributo('data-busca-historial')[0], 'gld'); await D.espera(30)
    ok(filasM().length === Math.min(50, nGld) && filasM().every(n => /oro \(GLD\)/.test(n.textContent)) && (b.raiz.conAtributo('data-historial-filtro')[0]?.textContent || '').startsWith(`${Pa.numero(nGld, 0)} de ${Pa.numero(nMov, 0)} movimientos`),
      `buscando «gld» en los movimientos: ${nGld} del oro`)
    // §162: el caso de Sergi: «39» encuentra los movimientos con 39 en cualquier parte de la fila (p. ej. un precio de 397,00 €).
    D.escribe(b.raiz.conAtributo('data-busca-historial')[0], '39'); await D.espera(30)
    const n39 = d0.movimientos.filter(mm => De.textoDeMovimiento(mm).includes('39')).length
    ok(n39 > 0 && filasM().length === Math.min(50, n39) && filasM().every(n => n.textContent.replace(/\./g, '').includes('39')), `buscando «39» en los movimientos: ${n39} (antes, 0)`)
    D.pulsa(b.raiz.conAtributo('data-limpiar-busqueda')[0]); D.pulsa(b.raiz.conAtributo('data-vista-historial', 'tabla')[0]); await D.espera(30)
    ok(filasH().length === 50 && !filasM().length, 'de vuelta a «Operaciones»')
    D.pulsa(b.raiz.conAtributo('data-pliega-valores')[0]); await D.espera(30)
    ok(!b.raiz.conAtributo('data-valor').length && b.raiz.conAtributo('data-fila-total').length === 1 && b.raiz.conAtributo('data-fila-ocioso').length === 1, 'al plegar, quedan el total y el ocioso')
    // De vuelta a «Tu dinero»: el mismo cálculo (no se pide otra vez) y la misma cifra.
    const antes = ultima
    D.pulsa(pest('dinero')); await D.espera(60)
    const fin = b.raiz.conAtributo('data-cifra', 'final')[0]?.todos(n => n.hasAttribute('data-valor'))[0]?.textContent
    ok(ultima === antes && b.raiz.conAtributo('data-cifras').length === 1 && !b.raiz.conAtributo('data-vista-detalle').length && fin === Pa.euros(m.valorNeto, 0), `de vuelta a «Tu dinero»: sin calcular otra vez y con el mismo «Tienes al final» (${fin})`)
    b.quita()
    // Sin libro en la respuesta: lo dice (no se rompe). Y sin ocioso (liquidez), la suma no lleva su trozo.
    conLibro = false
    const b2 = monta({ vistaDer: 'detalle' })
    for (let k = 0; k < 120 && !b2.raiz.conAtributo('data-sin-detalle').length; k++) await D.espera(250)
    ok(b2.raiz.conAtributo('data-sin-detalle').length === 1 && !b2.raiz.conAtributo('data-vista-detalle').length, 'sin el libro en la respuesta, «Detalle» lo dice')
    b2.quita(); conLibro = true
    const b3 = monta({ vistaDer: 'detalle', ajustes: { ...aPant, ocioso: 'LIQUIDEZ', aportacion: 0, impuestos: 'ninguno' } })
    for (let k = 0; k < 120 && !b3.raiz.conAtributo('data-vista-detalle').length; k++) await D.espera(250)
    const s3 = b3.raiz.conAtributo('data-detalle-suma')[0], oc3 = b3.raiz.conAtributo('data-fila-ocioso')[0]?.textContent || ''
    ok(s3?.getAttribute('data-cuadra') === 'si' && !s3.todos(n => n.getAttribute('data-suma') === 'ocioso').length && oc3.includes('Dinero ocioso · liquidez') && oc3.includes('sin órdenes') && Math.abs(ultima.evaluacion.plan.medidas.valorNeto - ultima.finalPorDentro) < 0.005 && !b3.raiz.conAtributo('data-oro').length,
      `con el ocioso en liquidez, sin aportaciones ni impuestos: la suma sin el trozo del ocioso, y el final (${ultima.evaluacion.plan.medidas.valorNeto.toFixed(2)} €) es el de «La cartera por dentro» (${ultima.finalPorDentro.toFixed(2)} €)`)
    b3.quita()
    // §161: con UN valor (AAPL, oro, 300 €/mes, impuestos): pestañas «Tu dinero» y «Detalle» (sin «La cartera por dentro»); en «Detalle»,
    // la suma = «Tienes al final», sus velas a la vista (sin «Volver»), «Cómo crece» solo con «El plan» y sin tabla por valor ni «Vista de gráficos».
    const aUno = { ...Pa.AJUSTES_PLAN, comisionTipo: 'fija', comisionFija: 0.185, periodo: 'todo', capital: 10000, aportacion: 300, impuestos: 'ES-ahorro', ocioso: 'GLD', activo: 'AAPL' }
    const b4 = monta({ vistaDer: 'detalle', ajustes: aUno })
    for (let k = 0; k < 120 && !(b4.raiz.conAtributo('data-vista-detalle').length && b4.raiz.conAtributo('data-velas-valor').length); k++) await D.espera(250)
    const p4 = (id) => b4.raiz.busca(n => n.nodeName === 'BUTTON' && n.getAttribute?.('data-vista-der') === id), L4 = ultima?.evaluacion.plan.ejecucion.libro, m4 = ultima?.evaluacion.plan.medidas
    const s4 = b4.raiz.conAtributo('data-detalle-suma')[0], fin4 = s4?.todos(n => n.getAttribute('data-suma') === 'final')[0]?.textContent, g4 = b4.raiz.conAtributo('data-velas-valor')[0]
    ok(!!p4('dinero') && !!p4('detalle') && !p4('dentro') && !ultima.finalPorDentro && !!L4 && s4?.getAttribute('data-cuadra') === 'si' && fin4 === Pa.euros(m4.valorNeto, 0)
      && (b4.raiz.conAtributo('data-detalle-cabecera')[0]?.textContent || '').startsWith('1 valor (AAPL)') && Number(g4?.getAttribute('data-operaciones')) === L4.operaciones.length && g4.getAttribute('data-velas-valor') === 'AAPL'
      && !b4.raiz.conAtributo('data-volver-velas').length && !b4.raiz.conAtributo('data-tarjeta', 'detalle-valores').length && !b4.raiz.conAtributo('data-modo-crece').length && b4.raiz.conAtributo('data-grafico', 'plan').length === 1 && !b4.raiz.conAtributo('data-tarjeta', 'detalle-vista-graficos').length
      && b4.raiz.conAtributo('data-tabla', 'detalle-mensual').length === 1 && b4.raiz.conAtributo('data-operacion').length === Math.min(50, L4.operaciones.length),
      `con UN valor: «Tu dinero» y «Detalle»; la suma ${fin4} = «Tienes al final»; AAPL con sus ${L4?.operaciones.length} operaciones a la vista; «El plan» sin «Valor a valor»; mensuales e historial`)
    D.pulsa(p4('dinero')); await D.espera(60)
    ok(b4.raiz.conAtributo('data-cifras').length === 1 && b4.raiz.conAtributo('data-cifra', 'final')[0]?.todos(n => n.hasAttribute('data-valor'))[0]?.textContent === fin4, `y «Tu dinero» con el mismo «Tienes al final» (${fin4})`)
    b4.quita()
  }
  console.log(fallos ? `plan-detalle: ${fallos} fallos` : 'plan-detalle: todas bien')
  process.exit(fallos ? 1 : 0)
})().catch(e => { console.error(e); process.exit(2) })
