// scripts/comprobaciones/plan-velas.js — las velas del plan: diarias o semanales (docs/builder.md §145). Las corre comunes.sh.
// Termina en 0 si todo da lo esperado.
//
// 1 · A mano, con UN valor. 300 semanas planas a 100 (calentamiento) y 6 semanas del periodo (lunes 02/03/2020 → viernes 10/04/2020),
//     de lunes a viernes. La estrategia: compra cuando el cierre cruza por encima de su EMA (2) a la apertura siguiente, vende cuando
//     cruza por debajo a la apertura siguiente, stop del 8 %. Con velas SEMANALES del plan:
//       semana 0: plana a 100 · semana 1: cierra a 104 (EMA 102,67): señal · semana 2: abre a 105 → COMPRA el lunes 16/03 a 105 ·
//       semana 3: sube a 115 · semana 4 (tres casos) · semana 5.
//     a) la semana 4 cierra a 110, bajo su EMA (110,84): vende a la apertura de la semana 5, el lunes 06/04 a 111 → 10.000 × 111 / 105.
//     b) el miércoles de la semana 4 el precio baja a 95: toca el stop (105 × 0,92 = 96,6) ese día → vende el miércoles 01/04 a 96,6.
//     c) el miércoles de la semana 4 ABRE a 94, por debajo del stop (el martes no bajó de 113): vende el miércoles a su apertura, 94.
//     Con velas DIARIAS (o sin el campo), el plan de siempre: idéntico con y sin `velas: 'diarias'`.
// 2 · diaDeLaSemana y la validación.
// 4 · §146: semanales con VARIOS valores, a mano: los candidatos semanales de dos valores, situados en su día (listaEnSuDia).
// 3 · La pantalla: los ajustes (velas: null = las de la estrategia), planDe / ajustesDe y «Velas en este plan».
process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://arnes.invalid'; process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'clave-falsa-del-arnes'
const path = require('path')
const C0 = require('./cargador'), R = C0.RAIZ, D = require('./domFalso')
let fallos = 0
const ok = (c, t) => { console.log(`${c ? 'OK  ' : 'MAL '} ${t}`); if (!c) fallos++ }
const cerca = (a, b, tol = 1e-12) => Number.isFinite(a) && Math.abs(a - b) <= tol * Math.max(1, Math.abs(b))
const dia = (f, n) => new Date(Date.parse(f + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10)
const EMA = { tipo: 'editor', motor: 1, formato: 1, nombre: 'EMA2', stops: [{ id: 'inicial', pct: 8, tipo: 'porcentaje', motivo: 'stop' }],
  entrada: { orden: { tipo: 'apertura' }, senal: { c: 'cruza', de: { c: 'precioVsMedia', p: { lado: 'encima', tipo: 'EMA', periodo: '$ema' } } } },
  salidas: [{ si: { c: 'cruza', de: { c: 'precioVsMedia', p: { lado: 'debajo', tipo: 'EMA', periodo: '$ema' } } }, tipo: 'condicion', motivo: 'cruce_bajista', precio: 'apertura' }],
  parametros: { lista: [{ max: 400, min: 2, paso: 1, tipo: 'entero', nombre: 'ema', defecto: 20, ventana: true, descripcion: 'Periodo de la EMA' }], version: 1, restricciones: [] } }

;(async () => {
  D.pon(); await C0.prepara(); C0.registra(R)
  const P = require(R + '/lib/planes/plan.js'), Es = require(R + '/lib/planes/estrategia.js'), Pa = require(R + '/lib/builder/planPantalla.js'), Lt = require(R + '/lib/lotesLab.js')

  // ── 1 · A mano ──
  const LUNES0 = '2020-03-02', semana = (k) => Array.from({ length: 5 }, (_, j) => dia(LUNES0, 7 * k + j))
  const plana = (p) => Array.from({ length: 5 }, () => [p, p, p, p])
  // [apertura, máximo, mínimo, cierre] de cada día.
  const S1 = [[100, 101, 100, 101], [101, 102, 101, 102], [102, 103, 102, 103], [103, 104, 103, 104], [104, 104, 104, 104]]
  const S2 = [[105, 106, 105, 106], [106, 107, 106, 107], [107, 108, 107, 108], [108, 109, 108, 109], [109, 110, 109, 110]]
  const S3 = [[110, 111, 110, 111], [111, 112, 111, 112], [112, 113, 112, 113], [113, 114, 113, 114], [114, 115, 114, 115]]
  const S4 = { a: [[115, 115, 114, 114], [114, 114, 113, 113], [113, 113, 112, 112], [112, 112, 111, 111], [111, 111, 110, 110]],
    b: [[115, 116, 114, 115], [115, 115, 113, 113], [113, 113, 95, 96], [96, 96, 96, 96], [96, 96, 96, 96]],
    c: [[115, 116, 114, 115], [115, 115, 113, 113], [94, 95, 93, 94], [94, 94, 94, 94], [94, 94, 94, 94]] }
  const S5 = { a: plana(111), b: plana(96), c: plana(94) }
  const datos = (caso) => {
    const cal = Array.from({ length: 300 }, (_, k) => semana(k - 300)).flat(), per = Array.from({ length: 6 }, (_, k) => semana(k)).flat(), fechas = [...cal, ...per]
    const ohlc = [...cal.map(() => [100, 100, 100, 100]), ...plana(100), ...S1, ...S2, ...S3, ...S4[caso], ...S5[caso]]
    const vela = (date, [open, high, low, close]) => ({ date, open, high, low, close, volume: 1000 })
    const TEST = fechas.map((f, i) => vela(f, ohlc[i])), OCI = fechas.map(f => vela(f, [50, 50, 50, 50])), plano = fechas.map(date => ({ date, open: 100, close: 100 }))
    return { fechas, qqq: plano, spy: plano, etf: fechas.map(() => null), qqqVelas: plano, velas: { TEST, OCI } }
  }
  const plan = (pieza = {}) => ({ tipo: 'plan', formato: 1, calculo: 1, dinero: { capitalInicial: 10000, aportaciones: { frecuencia: 'ninguna' }, extraordinarias: [] },
    piezas: [{ id: 'e', tipo: 'estrategia', estrategia: { id: 'x', name: 'EMA2', definition: EMA, params: { ema: 2 } }, activo: 'TEST', peso: 1, ocioso: 'OCI', aportacionDentro: 'espera', apalancamiento: 1, ...pieza }],
    reparto: { aportacionesA: 'pesos', rebalanceo: { calendario: 'nunca', banda: null } }, impuestos: { regimen: 'ninguno', reglaDosMeses: true }, costes: null,
    periodo: { desde: LUNES0, hasta: semana(5)[4] } })
  const pS = plan({ velas: 'semanales' })
  ok(P.validaPlan(pS).length === 0, `el plan con velas semanales y un valor es válido ${P.validaPlan(pS).join(' ')}`)
  const corre = (caso, p = pS) => { const r = P.ejecutaPlan(p, datos(caso)); return { r, ops: r.estrategias.e.operaciones } }
  const lista = (ops) => JSON.stringify(ops.map(o => [o.entryDate, o.entryPrice, o.exitDate, o.exitPrice]))
  {
    const { r, ops } = corre('a')
    ok(ops.length === 1 && ops[0].entryDate === '2020-03-16' && ops[0].entryPrice === 105 && ops[0].exitDate === '2020-04-06' && ops[0].exitPrice === 111, `a) compra el lunes 16/03 a 105 (apertura de la semana) y vende el lunes 06/04 a 111 (${lista(ops)})`)
    ok(cerca(r.patrimonio, 10000 * 111 / 105), `a) 10.000 × 111 / 105 = 10.571,428571 € (obtenido ${r.patrimonio})`)
    ok(cerca(r.serie[12].patrimonio, 10000 / 105 * 108), 'a) dentro se valora cada DÍA: el miércoles 18/03, 10.000 / 105 × 108')
  }
  {
    const { r, ops } = corre('b')
    ok(ops.length === 1 && ops[0].exitDate === '2020-04-01' && cerca(ops[0].exitPrice, 96.6), `b) el stop (96,6) se toca el miércoles 01/04: vende ese día a 96,6 (${lista(ops)})`)
    ok(cerca(r.patrimonio, 10000 * 96.6 / 105), `b) 10.000 × 96,6 / 105 = 9.200 € (obtenido ${r.patrimonio})`)
  }
  {
    const { r, ops } = corre('c')
    ok(ops.length === 1 && ops[0].exitDate === '2020-04-01' && ops[0].exitPrice === 94, `c) el miércoles abre a 94, bajo el stop: vende a su apertura, 94 (${lista(ops)})`)
    ok(cerca(r.patrimonio, 10000 * 94 / 105), `c) 10.000 × 94 / 105 = 8.952,380952 € (obtenido ${r.patrimonio})`)
  }
  {
    const d = datos('a'), sin = P.ejecutaPlan(plan(), d), con = P.ejecutaPlan(plan({ velas: 'diarias' }), datos('a'))
    ok(Lt.jsonCanonico(sin.serie) === Lt.jsonCanonico(con.serie) && sin.patrimonio === con.patrimonio, 'con velas diarias, el plan de siempre: idéntico con y sin el campo `velas`')
    ok(lista(sin.estrategias.e.operaciones) !== lista(corre('a').ops), 'y en diarias las operaciones son otras que en semanales (la EMA 2 cuenta días)')
  }

  // ── 2 · El día de la semana y la validación ──
  const dias = S4.b.map((x, j) => ({ date: semana(4)[j], open: x[0], high: x[1], low: x[2], close: x[3] }))
  ok(Es.diaDeLaSemana(dias, 115).date === semana(4)[0] && Es.diaDeLaSemana(dias, 115).precio === 115, 'al precio de apertura de la semana: el lunes, a su apertura')
  ok(Es.diaDeLaSemana(dias, 96, { alCierre: true }).date === semana(4)[4], 'compra «al cierre» de la vela: el viernes, a su cierre')
  ok(Es.diaDeLaSemana(dias, 113.5).date === semana(4)[1], 'a un nivel: el primer día cuyo rango lo contiene (113,5 → el martes)')
  ok(Es.diaDeLaSemana(dias, 115, { desde: 2 }).date === semana(4)[4], 'una salida no queda antes de su entrada (se busca desde el día de la entrada)')
  ok(Es.diaDeLaSemana([], 100) === null && Es.diaDeLaSemana(null, 100) === null, 'sin días, nada')
  ok(P.validaPlan(plan({ velas: 'mensuales' })).some(e => e.includes('diarias o semanales')), 'unas velas desconocidas no son válidas')
  const Li = require(R + '/lib/planes/lista.js')
  ok(P.validaPlan(plan({ velas: 'semanales', donde: 'lista', lista: Li.mergeLista({ simbolos: ['TEST', 'OTRO'] }) })).every(e => !e.includes('velas')), '§146: semanales con varios valores: ya se puede')
  ok(P.validaPlan(plan({ velas: 'diarias', donde: 'lista', lista: Li.mergeLista({ simbolos: ['TEST', 'OTRO'] }) })).every(e => !e.includes('velas')), 'diarias con varios valores: como siempre')

  // ── 3 · La pantalla ──
  const estD = { id: 'x', name: 'Cruce de medias 50/200', definition: EMA, params: { ema: 2 } }, estS = { id: 'y', name: 'Cruce semanal', definition: EMA, params: { ema: 2, intervalo: 'semanal' } }
  const a0 = { ...Pa.AJUSTES_PLAN, activo: 'AAPL' }
  ok(Pa.AJUSTES_PLAN.velas === null && Pa.velasDelPlan(a0, estD) === 'diarias' && Pa.velasDelPlan(a0, estS) === 'semanales', 'de entrada, las velas de la estrategia (diarias o semanales)')
  ok(Pa.planDe(a0, estD).piezas[0].velas === 'diarias' && Pa.planDe(a0, estS).piezas[0].velas === 'semanales', 'planDe guarda las velas con que se calcula')
  ok(Pa.planDe({ ...a0, velas: 'semanales' }, estD).piezas[0].velas === 'semanales' && Pa.planDe({ ...a0, velas: 'diarias' }, estS).piezas[0].velas === 'diarias', 'y las del plan mandan sobre las de la estrategia')
  for (const [a, e, esp, t] of [[a0, estD, null, 'diaria tal cual'], [a0, estS, null, 'semanal tal cual'], [{ ...a0, velas: 'semanales' }, estD, 'semanales', 'diaria en semanales'], [{ ...a0, velas: 'diarias' }, estS, 'diarias', 'semanal en diarias']]) {
    const p = Pa.planDe(a, e), a2 = Pa.ajustesDe(p)
    ok(a2.velas === esp && Lt.jsonCanonico(Pa.planDe(a2, e)) === Lt.jsonCanonico(p), `ida y vuelta (${t}): ajustesDe da velas ${esp} y planDe(ajustesDe(plan)) es idéntico`)
  }
  ok(Pa.textoParaClaudePlan({ ajustes: { ...a0, velas: 'semanales' }, estrategia: estD, plan: Pa.planDe({ ...a0, velas: 'semanales' }, estD), cifras: null, estado: null, resultadoPrueba: null, version: 'V' }).includes('velas semanales'), '«Copiar para Claude» dice las velas del plan')
  const React = require(path.join(R, 'node_modules', 'react')), { renderToString } = require(path.join(R, 'node_modules', 'react-dom', 'server')), RDC = require(path.join(R, 'node_modules', 'react-dom', 'client'))
  const BP = require(R + '/components/BuilderPlan.js').default
  let calculos = 0, ultimo = null
  const props = (ests, id, ini = {}) => ({ estrategias: ests, estrategiaId: id, datosLista: { watchlist: [{ symbol: 'AAPL', name: 'Apple', list_ids: [] }, { symbol: 'MSFT', name: 'Microsoft', list_ids: [] }], wlLists: [], rankingData: {} },
    deps: { ctx: null, calcula: async (x) => { calculos++; ultimo = x; throw new Error('sin motor en la prueba') } }, inicial: { planes: [], pestana: 'n1', simbolos: ['AAPL'], pruebas: [], resultadoPrueba: null, ajustes: { activo: 'AAPL' }, ...ini } })
  const hD = renderToString(React.createElement(BP, props([estD, estS], 'x'))).split('<!-- -->').join('')
  ok(hD.includes('data-velas-plan="diarias"') && hD.includes('Diarias · las de la estrategia') && hD.includes('>Semanales<') && !hD.includes('data-aviso="otras-velas"'), 'con una estrategia diaria: «Diarias · las de la estrategia» / «Semanales», sin aviso')
  ok(!hD.includes('llegará más adelante'), 'las estrategias semanales ya se pueden elegir')
  const hS = renderToString(React.createElement(BP, props([estD, estS], 'y'))).split('<!-- -->').join('')
  ok(hS.includes('data-velas-plan="semanales"') && hS.includes('Semanales · las de la estrategia') && hS.includes('>Diarias<'), 'con una estrategia semanal: «Diarias» / «Semanales · las de la estrategia»')
  const hasta = async (cond, max = 20000) => { const t0 = Date.now(); do { await D.espera(5); try { if (cond()) { await D.espera(5); return true } } catch (_) {} } while (Date.now() - t0 < max); return false }
  const m = D.monta(React.createElement(BP, props([estD, estS], 'x')), RDC); await D.espera(60)
  const boton = (t) => m.raiz.busca(n => n.nodeName === 'BUTTON' && n.textContent === t)
  D.pulsa(boton('Semanales')); await hasta(() => m.raiz.conAtributo('data-aviso', 'otras-velas').length === 1)
  ok(m.raiz.conAtributo('data-velas-plan', 'semanales').length === 1 && m.raiz.conAtributo('data-aviso', 'otras-velas')[0]?.textContent.includes('velas semanales, no con las diarias'), 'al pulsar «Semanales»: una línea dice que este plan la calcula con velas semanales')
  D.pulsa(boton('Diarias · las de la estrategia')); await hasta(() => !m.raiz.conAtributo('data-aviso', 'otras-velas').length)
  ok(m.raiz.conAtributo('data-velas-plan', 'diarias').length === 1 && !m.raiz.conAtributo('data-aviso', 'otras-velas').length, 'y al volver a las de la estrategia, se va')
  m.quita()

  // ── 4 · Semanales con VARIOS valores (§146), a mano ──
  // Dos valores, A y B, del lunes 02/03/2020 al miércoles 18/03/2020 (el plan acaba a mitad de la tercera semana). Los candidatos, como
  // los da el Backtesting semanal (fechados en el lunes):
  //   A: entra la semana del 02/03 a 10 (la apertura de la semana) y sale la del 09/03 por un stop a 9, que se toca el MIÉRCOLES 11/03
  //      (el martes no bajó de 10). Otra entrada de A la semana del 16/03 a 15 (una orden de compra): hasta el miércoles 18 no pasó de 12
  //      → no ha ocurrido dentro del plan: fuera.
  //   B: entra la semana del 09/03 a 20 (apertura) y sigue abierta: el Backtesting la cierra al cierre de su última semana (30, el
  //      viernes 20/03, después del final del plan) → en el plan, el miércoles 18/03 a su cierre, 25.
  // Capital compartido (n = 2), 1.000 €, sin comisiones: el lunes 02/03 A con 1.000 / 2 = 500 € → 50 acciones; el lunes 09/03 B con
  // (500 libres + 500 de A) / 2 = 500 € → 25 acciones; el miércoles 11/03 A sale a 9: 450 €; el 18/03 B a 25: 625 €. Final 1.075 €.
  // Capital concentrado, máx. 1: el lunes 09/03 A sigue abierta (su stop salta el miércoles): B NO entra. Final 100 × 9 = 900 €.
  // (En «La cartera por dentro», semanal, la venta de A y la compra de B son de la misma semana y B sí entraría: por eso con semanales
  // no hay línea «Comprobación».)
  {
    const diasDe = (k, n = 5) => Array.from({ length: n }, (_, j) => dia(LUNES0, 7 * k + j)), F = [...diasDe(0), ...diasDe(1), ...diasDe(2, 3)]
    const velasDe = (xs) => xs.map(([open, high, low, close], i) => ({ date: F[i], open, high, low, close, volume: 1 }))
    const dA = velasDe([[10, 10.5, 10, 10.5], [10.5, 11, 10.5, 11], [11, 11, 11, 11], [11, 11, 11, 11], [11, 11, 11, 11],
      [11, 11.5, 10.5, 11], [11, 11, 10, 10.5], [10.5, 10.5, 8.8, 9], [9, 9, 9, 9], [9, 9, 9, 9], [9, 10, 9, 10], [10, 11, 10, 11], [11, 12, 11, 12]])
    const dB = velasDe([[20, 20, 20, 20], [20, 20, 20, 20], [20, 20, 20, 20], [20, 20, 20, 20], [20, 20, 20, 20],
      [20, 21, 20, 21], [21, 21, 21, 21], [21, 22, 21, 22], [22, 22, 22, 22], [22, 22, 22, 22], [22, 23, 22, 23], [23, 24, 23, 24], [24, 25, 24, 25]])
    const L = [dia(LUNES0, 0), dia(LUNES0, 7), dia(LUNES0, 14)]
    const semanal = (modo) => ({ opciones: { modo, n: 2, maxPosiciones: 1, prioridad: 'alfabetico' }, activos: [
      { symbol: 'A', fechas: L, abre: [10, 11, 9], cierra: [11, 9, 13], candidatos: [
        { symbol: 'A', entryDate: L[0], entryPx: 10, exitDate: L[1], exitPx: 9, pasaPuerta: true, _virtualClose: false },
        { symbol: 'A', entryDate: L[2], entryPx: 15, exitDate: L[2], exitPx: 13, pasaPuerta: true, _virtualClose: true }] },
      { symbol: 'B', fechas: L, abre: [20, 20, 22], cierra: [20, 22, 30], candidatos: [
        { symbol: 'B', entryDate: L[1], entryPx: 20, exitDate: L[2], exitPx: 30, pasaPuerta: true, _virtualClose: true }] }] })
    const hasta = F[F.length - 1]
    const enDia = Es.listaEnSuDia(semanal('compartido'), { A: dA, B: dB }, { hasta })
    const cs = (k) => JSON.stringify(enDia.activos[k].candidatos.map(t => [t.entryDate, t.entryPx, t.exitDate, t.exitPx]))
    ok(cs(0) === JSON.stringify([['2020-03-02', 10, '2020-03-11', 9]]), 'lista semanal → A: entra el lunes 02/03 a 10 y su stop (9) salta el miércoles 11/03; la entrada a 15 de la última semana no ha ocurrido: fuera (' + cs(0) + ')')
    ok(cs(1) === JSON.stringify([['2020-03-09', 20, '2020-03-18', 25]]), 'lista semanal → B: entra el lunes 09/03 a 20 y lo abierto se cierra el último día del plan, miércoles 18/03, a su cierre (25), no a 30 (' + cs(1) + ')')
    ok(enDia.activos[0].fechas.length === 13 && enDia.activos[0].fechas[7] === '2020-03-11' && enDia.activos[0].cierra[7] === 9 && enDia.activos[0].abre[0] === 10 && enDia.opciones.modo === 'compartido', 'y las velas de cada valor pasan a ser las de cada día (13 sesiones)')
    const planL = (modo) => ({ ...plan({ velas: 'semanales', donde: 'lista', lista: Li.mergeLista({ simbolos: ['A', 'B'], modo, maxPosiciones: 1 }), activo: 'A', ocioso: 'LIQUIDEZ' }), dinero: { capitalInicial: 1000, aportaciones: { frecuencia: 'ninguna' }, extraordinarias: [] }, periodo: { desde: F[0], hasta } })
    const datosL = (modo) => ({ fechas: F, qqq: F.map(() => null), etf: F.map(() => null), spy: F.map(() => null), lista: Es.listaEnSuDia(semanal(modo), { A: dA, B: dB }, { hasta }) })
    ok(P.validaPlan(planL('compartido')).length === 0, 'semanales con varios valores: el plan ya es válido ' + P.validaPlan(planL('compartido')).join(' '))
    const rc = P.ejecutaPlan(planL('compartido'), datosL('compartido'))
    ok(cerca(rc.valorNeto, 1075) && rc.costes.ordenes === 4, 'compartido a mano: 50 × 9 + 25 × 25 = 1.075 € con 4 órdenes (' + rc.valorNeto + ', ' + rc.costes.ordenes + ')')
    ok(cerca(rc.serie[6].patrimonio, 50 * 10.5 + 25 * 21) && cerca(rc.serie[7].patrimonio, 450 + 25 * 22), 'se valora cada DÍA: martes 10/03, 50 × 10,5 + 25 × 21 = 1.050 €; miércoles 11/03 (A ya vendida), 450 + 25 × 22 = 1.000 €')
    const rk = P.ejecutaPlan(planL('concentrado'), datosL('concentrado'))
    ok(cerca(rk.valorNeto, 900) && rk.estrategias.e.operaciones.length === 1, 'concentrado máx. 1 a mano: el lunes 09/03 A sigue abierta y B no entra: 100 × 9 = 900 € (' + rk.valorNeto + ')')
    // Entrada «al cierre» de la vela: el viernes a su cierre. Y un lunes festivo: la apertura de la semana es la del martes.
    const alC = Es.listaEnSuDia(semanal('compartido'), { A: dA, B: dB }, { hasta, alCierre: true })
    ok(alC.activos[0].candidatos[0].entryDate === '2020-03-06' && alC.activos[0].candidatos[0].entryPx === 11, 'con compra «al cierre», A entra el viernes 06/03 a su cierre (11)')
    const sinLunes = Es.listaEnSuDia({ opciones: {}, activos: [{ symbol: 'B', fechas: L, abre: [20, 21, 22], cierra: [20, 22, 30], candidatos: [{ symbol: 'B', entryDate: L[1], entryPx: 21, exitDate: L[2], exitPx: 30, _virtualClose: true }] }] }, { B: dB.filter(b => b.date !== L[1]) }, { hasta })
    ok(sinLunes.activos[0].candidatos[0].entryDate === '2020-03-10' && sinLunes.activos[0].fechas.length === 12, 'si el lunes no hay sesión, la apertura de la semana es la del martes 10/03')
    let err = null; try { Es.listaEnSuDia(semanal('compartido'), { A: dA }, { hasta }) } catch (e) { err = e.message }
    ok(err === 'Faltan las velas diarias de B.', 'sin las diarias de un valor, lo dice')
    // La petición y la comprobación.
    const PD = require(R + '/components/backtesting/PlanPorDentro.js'), Api = require(R + '/pages/api/plan.js')
    const est = { id: 'x', name: 'Cruce de medias 50/200', definition: EMA, params: { ema: 2 } }
    const aL = (velas) => ({ ...Pa.AJUSTES_PLAN, activo: 'AAPL', donde: 'lista', lista: Li.mergeLista({ simbolos: ['AAPL', 'MSFT'] }), velas })
    const cS = PD.peticionPorDentro({ a: aL('semanales'), estrategia: est }), cD = PD.peticionPorDentro({ a: aL(null), estrategia: est })
    ok(cS?.intervalo === 'semanal' && cD?.intervalo === 'diario' && Lt.jsonCanonico({ ...cS, intervalo: 'diario' }) === Lt.jsonCanonico(cD), 'la petición de la lista: «semanal» con velas semanales y, en lo demás, idéntica a la diaria')
    const pS2 = Pa.planDe(aL('semanales'), est), pD2 = Pa.planDe(aL(null), est)
    ok(Api.errorCuerpoLista(pS2, pS2.piezas[0], cS) === null && Api.errorCuerpoLista(pD2, pD2.piezas[0], cD) === null && Api.errorCuerpoLista(pS2, pS2.piezas[0], cD) !== null && Api.errorCuerpoLista(pD2, pD2.piezas[0], cS) !== null, '/api/plan solo acepta la petición con las velas de su plan')
    const sinNada = (p) => ({ ...p, impuestos: { regimen: 'ninguno' }, dinero: { ...p.dinero, aportaciones: { frecuencia: 'ninguna' } }, piezas: [{ ...p.piezas[0], ocioso: 'LIQUIDEZ' }] })
    ok(Pa.oroComparable(sinNada(pD2)) === true && Pa.oroComparable(sinNada(pS2)) === false, 'la línea «Comprobación» solo con velas diarias')
    const txt = Pa.textoParaClaudePlan({ ajustes: aL('semanales'), estrategia: est, plan: pS2, cifras: null, estado: null, resultadoPrueba: null, version: 'V' })
    ok(txt.includes('una lista') && txt.includes('velas semanales'), '«Copiar para Claude» dice las velas del plan también con lista')
  }

  console.log(fallos ? `FALLOS: ${fallos}` : 'plan-velas: todo bien')
  process.exit(fallos ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
