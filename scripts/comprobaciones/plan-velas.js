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
// 2 · diaDeLaSemana y la validación (semanales solo con un valor).
// 3 · La pantalla: los ajustes (velas: null = las de la estrategia), planDe / ajustesDe y «Velas en este plan».
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
  ok(P.validaPlan(plan({ velas: 'semanales', donde: 'lista', lista: Li.mergeLista({ simbolos: ['TEST', 'OTRO'] }) })).some(e => e.includes('solo velas diarias')), 'semanales con varios valores: todavía no, y lo dice')
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

  console.log(fallos ? `FALLOS: ${fallos}` : 'plan-velas: todo bien')
  process.exit(fallos ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
