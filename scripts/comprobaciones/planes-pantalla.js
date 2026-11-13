// scripts/comprobaciones/planes-pantalla.js — la pantalla del paso 3 (docs/builder.md, §53–§55). Las corre comunes.sh. Termina en 0 si todo va bien.
// 1 · Norma de cierre (§53), a mano con el motor: 10.000 € sin aportación en una acción que va de 100 a 114 en 10 años: ganancia 1.400 €, 19 % = 266 €, quedan 11.134 €.
//     El CAGR de la fila, (11.134 / 10.000)^(1/años) − 1; el último punto de la línea, 11.134 €. Y contra la versión anterior (VIEJO), todo igual salvo, si cambiaran, los CAGR y el último punto.
const path = require('path')
const C0 = require('./cargador'), R = C0.RAIZ
if (!process.env.VIEJO) { console.error('Falta VIEJO: la carpeta con la copia de la versión anterior (la hace comunes.sh).'); process.exit(2) }
const V = path.resolve(process.env.VIEJO)
let fallos = 0
const ok = (c, t) => { console.log(`${c ? 'OK  ' : 'MAL '} ${t}`); if (!c) fallos++ }
const cuenta = (html, s) => html.split(s).length - 1
const cerca = (a, b, tol = 1e-9) => Number.isFinite(a) && Math.abs(a - b) <= tol * Math.max(1, Math.abs(b))
const dia = (f, n) => new Date(Date.parse(f + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10)
const EMA = { tipo: 'editor', motor: 1, formato: 1, nombre: 'EMA2', stops: [{ id: 'inicial', pct: 8, tipo: 'porcentaje', motivo: 'stop' }],
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
const planMano = (fs, extra = {}) => ({ tipo: 'plan', formato: 1, calculo: 1, dinero: { capitalInicial: 10000, aportaciones: { frecuencia: 'ninguna' }, extraordinarias: [] },
  piezas: [{ id: 'e', tipo: 'estrategia', estrategia: { id: 'x', name: 'EMA2', definition: EMA, params: { ema: 2 } }, activo: 'TEST', peso: 1, ocioso: 'OCI', aportacionDentro: 'espera', apalancamiento: 1 }],
  reparto: { aportacionesA: 'pesos', rebalanceo: { calendario: 'nunca', banda: null } }, impuestos: { regimen: 'ES-ahorro', reglaDosMeses: true }, costes: null, periodo: { desde: fs[0], hasta: fs[fs.length - 1] }, ...extra })

;(async () => {
  await C0.prepara(); C0.registra(R); C0.registra(V)
  const P = require(R + '/lib/planes/plan.js'), E = require(R + '/lib/planes/evalua.js'), Pa = require(R + '/lib/builder/planPantalla.js'), PaV = require(V + '/lib/builder/planPantalla.js')

  // ── 1 · La norma de cierre ──
  const fs = [...Array.from({ length: 11 }, (_, i) => dia('2020-03-02', i)), '2030-03-02'], anios = (Date.parse('2030-03-02') - Date.parse('2020-03-02')) / 864e5 / 365.25
  const d = datosMano(fs), p = planMano(fs)
  ok(P.validaPlan(p).length === 0, `el plan a mano es válido ${P.validaPlan(p).join(' ')}`)
  const ev = E.evaluaPlan(p, d, { detalle: true })
  const ej = Object.fromEntries(E.referenciasDe(p).filter(x => ['OCIOSO_LIQUIDEZ', 'ACTIVO', 'QQQ', 'SPY'].includes(x.id)).map(x => [x.id, P.ejecutaPlan(x.plan, d, { detalle: false })]))
  const resp = { evaluacion: ev, curvas: Object.fromEntries(['OCIOSO_LIQUIDEZ', 'ACTIVO'].map(id => [id, { patrimonio: ej[id].serie.map(x => x.patrimonio), vl: ej[id].serie.map(x => x.vl) }])), ordenesReferencias: Object.fromEntries(Object.entries(ej).map(([id, r]) => [id, r.costes.ordenes])) }
  const c = Pa.cifrasPlan(resp, p), cV = PaV.cifrasPlan(resp, p)
  const f = (cc, id) => cc.alternativas.find(x => x.id === id)
  const FIN_ACTIVO = 10000 * 1.14 - 1400 * 0.19   // 11.134 €: compra a 100, vende a 114, 19 % sobre 1.400 € de ganancia
  ok(cerca(f(c, 'ACTIVO').final, FIN_ACTIVO, 1e-9), `Buy&Hold: final 11.134 € tras el 19 % sobre 1.400 € (obtenido ${f(c, 'ACTIVO').final})`)
  ok(cerca(f(c, 'ACTIVO').twr, Math.pow(FIN_ACTIVO / 10000, 1 / anios) - 1, 1e-9), `Buy&Hold: CAGR = (final neto / 10.000)^(1/años) − 1 = ${((Math.pow(FIN_ACTIVO / 10000, 1 / anios) - 1) * 100).toFixed(4)} %`)
  ok(cerca(ev.referencias.find(x => x.id === 'ACTIVO').medidas.twr, Math.pow(1.14, 1 / anios) - 1, 1e-9) && ev.referencias.find(x => x.id === 'ACTIVO').medidas.twr > f(c, 'ACTIVO').twr, 'el TWR antes de la venta, (11.400 / 10.000)^(1/años) − 1, es mayor: la pantalla ya no lo enseña')
  ok(cerca(f(c, 'ACTIVO').tir, f(c, 'ACTIVO').twr, 1e-8), 'sin aportaciones, el CAGR del Buy&Hold = su TIR (la TIR ya era tras impuestos)')
  const FIN_PLAN = 10000 * 114 / 105 - (10000 / 105 * 9) * 0.19   // compra a 105, vende a 114: 857,14 € de ganancia, 162,86 € de impuestos
  ok(cerca(f(c, 'PLAN').final, FIN_PLAN, 1e-9), `el plan a mano: 10.694,29 € (obtenido ${f(c, 'PLAN').final})`)
  ok(cerca(c.seis.twr, Math.pow(FIN_PLAN / 10000, 1 / anios) - 1, 1e-9) && c.seis.twr === f(c, 'PLAN').twr, '«CAGR del plan» = (final neto / 10.000)^(1/años) − 1, y el mismo en su fila')
  const fin = (x) => x[x.length - 1]
  ok(cerca(fin(c.curva.activo), FIN_ACTIVO, 1e-9) && fin(c.curva.plan) === c.seis.final && fin(c.curva.activo) === f(c, 'ACTIVO').final && fin(c.curva.ociosoLiquidez) === f(c, 'OCIOSO_LIQUIDEZ').final, 'el último punto de cada línea = el final de su fila')
  const eti = Pa.finalesDe(c)
  ok(eti.plan === fin(c.curva.plan) && eti.activo === fin(c.curva.activo) && eti.ociosoLiquidez === fin(c.curva.ociosoLiquidez) && eti.aportado === fin(c.curva.aportado), 'línea y etiqueta coinciden en las cuatro')
  ok(fin(c.curva.activo) < 11400, 'el Buy&Hold ya no acaba la línea en 11.400 €, antes de la venta')
  const sinCagr = (x) => { const { twr, ...r } = x; return r }
  ok(JSON.stringify(c.alternativas.map(sinCagr)) === JSON.stringify(cV.alternativas.map(sinCagr)), 'final, TIR, caída, impuestos, comisiones y órdenes de TODAS las filas, idénticos a la versión anterior')
  const { twr: _a, ...s1 } = c.seis, { twr: _b, ...s2 } = cV.seis
  ok(JSON.stringify(s1) === JSON.stringify(s2), 'las seis cifras, idénticas salvo el CAGR')
  const sinFin = (x) => x && x.slice(0, -1)
  ok(['plan', 'activo', 'ociosoLiquidez'].every(k => JSON.stringify(sinFin(c.curva[k])) === JSON.stringify(sinFin(cV.curva[k]))) && JSON.stringify(c.curva.aportado) === JSON.stringify(cV.curva.aportado), 'de las líneas solo cambia el último punto')
  ok(JSON.stringify(c.tramos) === JSON.stringify(cV.tramos), 'los tramos, sin tocar (miden el camino: docs/builder.md, §53)')
  ok(Pa.conCierre(null, 5) === null && Pa.conCierre([1, 2], undefined).join() === '1,2' && Pa.conCierre([1, 2], 7).join() === '1,7', 'conCierre: sin línea o sin importe, se queda como está')

  // El montaje: la tabla, la cifra y el gráfico enseñan lo mismo.
  const React = require(path.join(R, 'node_modules', 'react')), { renderToString } = require(path.join(R, 'node_modules', 'react-dom', 'server'))
  const BP = require(R + '/components/BuilderPlan.js').default
  const est = { id: 'x', name: 'EMA2', definition: EMA, params: { ema: 2 } }
  const pinta = (o = {}) => renderToString(React.createElement(BP, { estrategias: [est], estrategiaId: 'x', deps: { ctx: null, calcula: async () => resp }, inicial: { planes: [], simbolos: ['TEST'], pruebas: [], huella: 'h', huellas: { x: 'h' }, ajustes: { activo: 'TEST', ocioso: 'OCI' }, resultado: { respuesta: resp, plan: p }, ...o } })).split('<!-- -->').join('')
  const h = pinta()
  ok(h.includes('data-etiqueta="Buy&amp;Hold TEST 11.134 €"') && h.includes('Buy&amp;Hold TEST termina en 11.134 €'), 'gráfico: la etiqueta y el resumen de Buy&Hold, 11.134 €')
  const fila = h.slice(h.indexOf('data-fila="ACTIVO"')), celdas = fila.slice(0, fila.indexOf('</tr>'))
  ok(celdas.includes(Pa.pct(Math.pow(FIN_ACTIVO / 10000, 1 / anios) - 1)), `tabla: el CAGR de Buy&Hold, ${Pa.pct(Math.pow(FIN_ACTIVO / 10000, 1 / anios) - 1)}`)
  const yDe = (html, k) => { const m = html.match(new RegExp('data-linea="' + k + '" points="([^"]+)"')); return Number(m[1].trim().split(' ').pop().split(',')[1]) }
  const yEt = Number((h.match(/data-etiqueta="Buy&amp;Hold TEST 11\.134 €" x="[^"]+" y="([0-9.]+)"/) || [])[1])
  ok(Math.abs(yDe(h, 'activo') + 4 - yEt) <= 32, 'gráfico: la línea de Buy&Hold acaba a la altura de su etiqueta (como mucho, lo que la separa de las otras)')
  ok(h.slice(h.indexOf('data-cifra="twr"')).includes(Pa.pct(c.seis.twr)), `la cifra «CAGR del plan», ${Pa.pct(c.seis.twr)}`)
  // §90: el orden de las cifras (la peor caída, tras la TIR), la TIR solo con aportaciones y los colores por signo.
  const ids = (html) => [...html.matchAll(/data-cifra="([a-z]+)"/g)].map(m => m[1]).join(',')
  const conAp = pinta({ resultado: { respuesta: resp, plan: { ...p, dinero: { ...p.dinero, aportaciones: { importe: 300, frecuencia: 'mensual', crecimientoAnual: 0 } } } } })
  ok(ids(h) === 'aportado,final,twr,caida,ocioso,costes' && !/<th[^>]*>TIR<\/th>/.test(h), `§90: sin aportaciones, sin TIR (ni cifra ni columna): ${ids(h)}`)
  ok(ids(conAp) === 'aportado,final,twr,tir,caida,ocioso,costes' && /<th[^>]*>TIR<\/th>/.test(conAp), `§90: con aportaciones, la TIR y la peor caída detrás: ${ids(conAp)}`)
  const colorCifra = (html, id) => (html.slice(html.indexOf(`data-cifra="${id}"`)).match(/data-valor="true" style="[^"]*color:(#[0-9a-f]{6})/) || [])[1] || null
  const esperado = (v) => v > 0 ? '#7ee2a0' : v < 0 ? '#ff8b8b' : null
  ok(colorCifra(h, 'final') === esperado(c.seis.ganancia) && colorCifra(h, 'twr') === esperado(c.seis.twr) && colorCifra(h, 'caida') === esperado(c.seis.caidaPct) && !['#7ee2a0', '#ff8b8b'].includes(colorCifra(h, 'aportado')),
    `§90: colores por signo (final ${colorCifra(h, 'final')}, CAGR ${colorCifra(h, 'twr')}, caída ${colorCifra(h, 'caida')}; «Has aportado», el de siempre)`)
  ok(!h.includes('[data-lista]'), '§90: con «Una acción», sin el estilo de la letra del bloque con lista')


  // ── 1b · «Año a año» y el tiempo en el ocioso, a mano (§57) ──
  // Dos años naturales. Buy&Hold: compra a 100; 2021 acaba en 114 (+14 %); 2022 sigue en 114, con la venta final: 11.400 € − 19 % de 1.400 € = 11.134 € (−2,3333 %). 1,14 × 0,976667 = 1,1134.
  // Tu plan: entra a 105 (fila 3), máximo de cierre 120, cierre 113 (−5,8333 %), sale a 114 en la fila 10: 2021 acaba en 114 / 105 (+8,5714 %); 2022: 10.857,14 € → 10.694,29 € tras 162,86 € de impuesto (−1,5 %).
  const fs2 = [...Array.from({ length: 11 }, (_, i) => dia('2021-01-01', i)), '2022-12-31'], anios2 = (Date.parse('2022-12-31') - Date.parse('2021-01-01')) / 864e5 / 365.25
  const conResp = (plan, datos) => { const e0 = E.evaluaPlan(plan, datos, { detalle: true }), ej0 = Object.fromEntries(E.referenciasDe(plan).filter(x => ['OCIOSO_LIQUIDEZ', 'ACTIVO', 'QQQ', 'SPY'].includes(x.id)).map(x => [x.id, P.ejecutaPlan(x.plan, datos, { detalle: false })]))
    return { evaluacion: e0, curvas: Object.fromEntries(Object.entries(ej0).map(([id, r]) => [id, { patrimonio: r.serie.map(x => x.patrimonio), vl: r.serie.map(x => x.vl) }])), ordenesReferencias: Object.fromEntries(Object.entries(ej0).map(([id, r]) => [id, r.costes.ordenes])) } }
  const p2 = planMano(fs2), c2 = Pa.cifrasPlan(conResp(p2, datosMano(fs2)), p2), A0 = c2.anios[0], A1 = c2.anios[1]
  ok(c2.anios.length === 2 && A0.anio === '2021' && A1.anio === '2022', 'una fila por año natural')
  ok(cerca(A0.activo, 0.14) && cerca(A1.activo, 11134 / 11400 - 1), `Buy&Hold: +14 % y, con la venta final, −2,3333 % (obtenido ${Pa.pct(A0.activo)} y ${Pa.pct(A1.activo)})`)
  ok(cerca(A0.plan, 114 / 105 - 1) && cerca(A1.plan, -0.015), `tu plan: +8,5714 % y, con la venta final, −1,5 % (obtenido ${Pa.pct(A0.plan, 4)} y ${Pa.pct(A1.plan, 4)})`)
  ok(cerca(A0.caidaActivo, 113 / 120 - 1) && cerca(A0.caidaPlan, 113 / 120 - 1) && A1.caidaPlan === 0 && A1.caidaActivo === 0, 'las caídas del año: 2021, de 120 a 113 (−5,8333 %) en los dos; 2022, ninguna: la venta final no cuenta como caída')
  ok(cerca(A0.enOcioso, 4 / 11) && A1.enOcioso === 1 && cerca(c2.enOcioso, 5 / 12), `en el ocioso: 4 de 11 velas en 2021, 1 de 1 en 2022, 5 de 12 en total (${Pa.pct(c2.enOcioso, 1)})`)
  const prod = (xs, k) => xs.reduce((m, x) => m * (1 + x[k]), 1)
  ok(cerca(prod(c2.anios, 'plan'), Math.pow(1 + c2.seis.twr, anios2), 1e-9) && cerca(prod(c2.anios, 'plan'), 10694.285714285714 / 10000, 1e-9), `el producto de (1 + cada año) = (1 + CAGR)^años, con ${anios2.toFixed(3)} años: ${prod(c2.anios, 'plan').toFixed(6)}`)
  ok(Math.abs(prod(c2.anios, 'plan') / Math.pow(1 + c2.seis.twr, 2) - 1) < 0.001, 'y a menos de un 0,1 % de (1 + CAGR)^2')
  ok(cerca(prod(c2.anios, 'activo'), Math.pow(1 + f(c2, 'ACTIVO').twr, anios2), 1e-9), 'lo mismo en Buy&Hold, con su CAGR')
  // Con aportaciones: no cuentan como ganancia. 500 € el día 1 de cada mes (entran solo en la última fila, sin moverse después): la rentabilidad de cada año es la misma que sin ellas.
  const p3 = planMano(fs2, { dinero: { capitalInicial: 10000, aportaciones: { importe: 500, frecuencia: 'mensual', crecimientoAnual: 0 }, extraordinarias: [] } }), c3 = Pa.cifrasPlan(conResp(p3, datosMano(fs2)), p3)
  ok(c3.seis.aportado > 10000 && cerca(c3.anios[0].activo, 0.14) && cerca(prod(c3.anios, 'plan'), Math.pow(1 + c3.seis.twr, anios2), 1e-9) && cerca(prod(c3.anios, 'activo'), Math.pow(1 + f(c3, 'ACTIVO').twr, anios2), 1e-9), `con aportaciones (${Pa.euros(c3.seis.aportado, 0)}): 2021 sigue siendo +14 % en Buy&Hold y el producto sigue dando el CAGR`)
  ok(Pa.parteOciosa([]) === null && Pa.parteOciosa([1, 1, 0, 0]) === 0.5, 'parteOciosa: sin franja, nada; 2 de 4, el 50 %')
  ok(fin(c2.curva.qqq) === f(c2, 'QQQ').final && fin(c2.curva.spy) === f(c2, 'SPY').final && Pa.finalesDe(c2).qqq === fin(c2.curva.qqq) && Pa.finalesDe(c2).spy === fin(c2.curva.spy), 'SPY y QQQ: el último punto de la línea = su fila de la tabla = su etiqueta')
  const pintaB = (o = {}) => renderToString(React.createElement(BP, { estrategias: [est], estrategiaId: 'x', deps: { ctx: null, calcula: async () => null }, inicial: { planes: [], simbolos: ['TEST'], pruebas: [], huella: 'h', huellas: { x: 'h' }, ajustes: { activo: 'TEST', ocioso: 'OCI' }, resultado: { respuesta: conResp(p2, datosMano(fs2)), plan: p2 }, ...o } })).split('<!-- -->').join('')
  let hB = pintaB()
  ok(hB.includes('data-tabla="anios"') && hB.includes('data-anio="2021"') && hB.includes('data-anio="2022"') && hB.indexOf('data-tarjeta="grafico"') < hB.indexOf('data-tarjeta="anios"') && hB.indexOf('data-tarjeta="anios"') < hB.indexOf('data-tarjeta="alternativas"'), 'la tabla «Año a año», justo bajo el gráfico')
  ok(hB.slice(hB.indexOf('data-cifra="ocioso"')).includes(`${Pa.pct(5 / 12, 1)}<span style="font-size:13px;font-weight:400;color:#9fb0c3"> del tiempo`), `la tarjeta «En el ocioso»: ${Pa.pct(5 / 12, 1)} del tiempo`)
  const tCostes = hB.slice(hB.indexOf('data-cifra="costes"'), hB.indexOf('</div></div>', hB.indexOf('data-cifra="costes"')))
  ok(tCostes.includes('white-space:nowrap') && tCostes.includes(' · <span data-comisiones') && !tCostes.includes('flex-direction:column'), '«Impuestos y comisiones», en una línea')
  ok(/height="39[0-9]|height="40[0-9]/.test(hB) , 'el gráfico, 1,5 veces más alto (375 px + la franja)')
  ok(hB.includes('data-casilla="activo"') && hB.includes('data-casilla="spy"') && hB.includes('data-casilla="qqq"') && hB.includes('data-casilla="ociosoLiquidez"') && hB.includes('data-casilla="aportado"') && !hB.includes('data-casilla="plan"'), 'las casillas de la leyenda, salvo Tu plan')
  ok(hB.includes('data-linea="plan"') && hB.includes('data-linea="activo"') && !hB.includes('data-linea="spy"') && !hB.includes('data-linea="qqq"') && hB.includes('data-linea="ociosoLiquidez"') && hB.includes('data-linea="aportado"'), 'por defecto: Buy&Hold del valor, ocioso en liquidez y lo aportado sí; SPY y QQQ no')
  hB = pintaB({ lineas: { activo: true, spy: true, qqq: true, ociosoLiquidez: true, aportado: true } })
  const yEts = [...hB.matchAll(/data-etiqueta="[^"]+" x="[^"]+" y="([0-9.]+)"/g)].map(x => Number(x[1])).sort((a, b) => a - b)
  ok(yEts.length === 6 && yEts.every((y, i) => !i || y - yEts[i - 1] >= 15.9), `las 6 líneas: ninguna etiqueta se monta sobre otra (y: ${yEts.map(y => y.toFixed(0)).join(', ')})`)
  hB = pintaB({ lineas: { activo: false, spy: false, qqq: false, ociosoLiquidez: false, aportado: false } })
  ok(hB.includes('data-linea="plan"') && !hB.includes('data-linea="activo"') && !hB.includes('data-linea="aportado"') && !hB.includes('data-etiqueta="Lo aportado'), 'todo desmarcado: queda Tu plan, sin casilla')
  const tx = Pa.textoParaClaudePlan({ ajustes: Pa.ajustesDe(p2), estrategia: est, plan: p2, cifras: c2, estado: null, resultadoPrueba: null, version: 'x' })
  ok(tx.includes('En el ocioso: 41,7 % del tiempo') && tx.includes('Año a año'), '«Copiar para Claude» lleva el ocioso y el año a año')

  // ── 2 · Las pestañas: las piezas puras (§54) ──
  const T = require(R + '/lib/builder/pestanasPlan.js'), G = require(R + '/lib/builder/planesGuardados.js')
  const filaPlan = (id, foto = 'x', dia = 10) => ({ id, nombre: id === 4 ? 'Un plan con un nombre larguísimo que no cabe de ninguna manera en la pestaña' : `Plan ${id}`, plan: { ...Pa.planDe(Pa.ajustesDe(p), { ...p.piezas[0].estrategia, id: foto }), nombre: `Plan ${id}` }, huella: 'h', created_at: `2026-10-${dia}T10:00:00Z`, updated_at: `2026-10-${dia}T10:00:00Z` })
  const tres = [filaPlan(1), filaPlan(2, 'y', 12), filaPlan(3, 'x', 11)]
  ok(T.ordenInicial(null, tres).join() === 'g1,g2,g3', 'sin fila en la base: todos los planes abiertos')
  ok(T.ordenInicial([3, 99, 1, 3], tres).join() === 'g3,g1', 'con fila: su orden; un plan que ya no existe se ignora; sin repetidos')
  ok(T.ordenInicial([], tres).length === 0, 'una fila vacía: ninguna pestaña')
  ok(T.idsDe(['g3', 'n2', 'g1']).join() === '3,1', 'a la base solo van los guardados (un plan nuevo no se recuerda)')
  ok(T.vecina(['g1', 'g2', 'g3'], 'g2') === 'g3' && T.vecina(['g1', 'g2', 'g3'], 'g3') === 'g2' && T.vecina(['g1'], 'g1') === null, 'al cerrar: la siguiente; si era la última, la anterior; si no queda, ninguna')
  ok(T.trasDe(['g1', 'g2'], 'g1', 'n2').join() === 'g1,n2,g2' && T.cambiaClave(['g1', 'n2'], 'n2', 'g9').join() === 'g1,g9' && T.conPestana(['g1'], 'g1').length === 1 && T.conPestana(['g1'], 'g2').join() === 'g1,g2', 'duplicar va al lado; guardar cambia la clave en su sitio; añadir no repite')
  const elige = (o) => T.eligeEntrada({ planes: tres, orden: ['g1', 'g3'], fotoDe: G.fotoDelPlan, ...o })
  ok(elige({ estrategiaId: 'y' }).clave === 'g2', 'con estrategia: su plan más reciente, aunque no estuviera abierto')
  ok(elige({ estrategiaId: 'zz' }).nuevo === true, 'con una estrategia sin planes: un plan nuevo')
  ok(elige({}).clave === 'g3', 'sin estrategia: el más reciente de los abiertos')
  ok(elige({ orden: [] }).clave === null && T.eligeEntrada({ planes: [], orden: [], fotoDe: G.fotoDelPlan }).nuevo === true, 'sin pestañas: ninguna; sin ningún plan: uno nuevo')
  ok(elige({ planId: 2 }).clave === 'g2' && !elige({ planId: 2 }).noExiste, 'desde una tesis: ese plan, aunque no estuviera abierto')
  ok(elige({ planId: 99 }).noExiste === true && elige({ planId: 99 }).clave === 'g3', 'desde una tesis, un plan que ya no existe: lo avisa y sigue')
  // A mano: anchos de 100; hueco 6: cada una ocupa 106. Con 400 px caben las 3 (318). Con 300 (hueco 238 tras «+N» de 62): 2.
  const an = { a: 100, b: 100, c: 100, d: 100 }
  ok(T.repartePestanas(['a', 'b', 'c'], an, 400, 'a').ocultas.length === 0, 'caben todas: sin «+N»')
  const r1 = T.repartePestanas(['a', 'b', 'c', 'd'], an, 300, 'a')
  ok(r1.visibles.join() === 'a,b' && r1.ocultas.join() === 'c,d', 'no caben: 2 a la vista y «+2» (300 px)')
  const r2 = T.repartePestanas(['a', 'b', 'c', 'd'], an, 300, 'd')
  ok(r2.visibles.join() === 'a,d' && r2.ocultas.join() === 'b,c', 'la abierta se ve siempre, aunque estuviera entre las que no caben')
  ok(T.repartePestanas(['a', 'b'], an, 50, 'b').visibles.join() === 'b', 'aunque solo quepa una: la abierta')
  ok(T.anchoPestana('x'.repeat(200)) === T.ANCHO_NOMBRE_MAX + T.ANCHO_ICONOS, 'un nombre larguísimo no ensancha la pestaña más del tope')

  // ── 3 · Leer y guardar las pestañas (con un fetch falso) ──
  const pide = []
  const ctxF = (respuesta) => ({ url: 'https://x', headers: { apikey: 'k' }, fetch: async (u, o = {}) => { pide.push({ u, o }); return respuesta } })
  ok(await G.leerPestanas(ctxF({ ok: true, status: 200, json: async () => [{ planes: [7, 4] }] })) + '' === '7,4' && pide.pop().u === 'https://x/rest/v1/builder_pestanas?select=planes', 'leer: los ids de su fila')
  ok(await G.leerPestanas(ctxF({ ok: true, status: 200, json: async () => [] })) === null, 'leer sin fila: null')
  await G.guardarPestanas(ctxF({ ok: true, status: 201, json: async () => null }), [7, '4'])
  let ll = pide.pop()
  ok(ll.o.method === 'POST' && ll.u === 'https://x/rest/v1/builder_pestanas?on_conflict=user_id' && ll.o.body === '{"planes":[7,4]}' && ll.o.headers.Prefer === 'resolution=merge-duplicates,return=minimal', 'guardar: upsert solo con planes (el dueño lo pone la base)')
  let fallo = null; try { await G.guardarPestanas(ctxF({ ok: false, status: 403, json: async () => ({ message: 'no' }) }), []) } catch (e) { fallo = e.message }
  ok(/No se pudo guardar tus pestañas \(HTTP 403/.test(fallo || ''), 'si la base dice que no, da el error')

  // ── 4 · La cabecera B y las pestañas, montadas ──
  const PanelB = require(R + '/components/BuilderPanel.js'), Pest = require(R + '/components/BuilderPestanas.js')
  const cab = renderToString(React.createElement(PanelB.CabeceraPasos, { actual: 2, estrategia: 'Mi <regla>', onVolver: () => {}, onPaso: () => {}, onUsar: () => {}, hechos: { 1: true } })).split('<!-- -->').join('')
  ok(!cab.includes('data-ruta="builder"') && />Estrategias<\/button>/.test(cab) && cab.includes('data-ruta="mi-trabajo"') && cab.includes('Mi &lt;regla&gt;'), '§139: la ruta «Estrategias › nombre», con el nombre escapado y sin «Builder»')
  ok(cab.includes('data-paso="1" data-hecho="1"') && !cab.includes('data-paso="2" data-hecho') && cab.includes('aria-current="step"') && cab.includes('✓'), 'cabecera: ✓ en el paso hecho; el actual marcado')
  ok(cab.includes('Crear</span>') && cab.includes('Validar</span>') && !cab.includes('Convertirla en plan') && !cab.includes('data-paso="3"') && cuenta(cab, 'data-nombre-paso') === 2 && cab.includes('.bp-nombre-paso { display: none }') && cab.includes('title="Paso 2: Validarla contra el azar"') && /<button[^>]*data-boton="usar-en-plan"[^>]*>Usar en un plan<\/button>/.test(cab) && !/<button[^>]*data-boton="usar-en-plan"[^>]*disabled/.test(cab), '§56: cada círculo con su nombre; en una ventana estrecha se oculta y queda en el tooltip')
  const trozoPaso = (n) => { const k = cab.indexOf(`data-paso="${n}"`); return cab.slice(k, cab.indexOf('</span></', k)) }
  ok(/font-weight:700;color:#ffffff/.test(trozoPaso(2).slice(trozoPaso(2).indexOf('data-nombre-paso'))) && trozoPaso(2).includes('background:#3fb950') && /font-weight:400;color:#8b9bad/.test(trozoPaso(1).slice(trozoPaso(1).indexOf('data-nombre-paso'))) && trozoPaso(1).includes('✓'), '§56: el actual, relleno de verde y en negrita blanca; el hecho, ✓ y texto apagado')
  const cabD = renderToString(React.createElement(PanelB.CabeceraPasos, { actual: 1, onPaso: () => {}, desactivados: { 2: 'Guárdala primero' }, onUsar: () => {}, usarMotivo: 'Guárdala antes' }))
  ok(cabD.includes('title="Guárdala primero"') && /<span[^>]*data-paso="2"/.test(cabD) && /<button[^>]*data-boton="usar-en-plan"[^>]*disabled/.test(cabD) && cabD.includes('title="Guárdala antes"'), 'lo desactivado no se pulsa y dice el motivo en el tooltip (también «Usar en un plan»)')
  const cabP = renderToString(React.createElement(PanelB.CabeceraPasos, { zona: 'plan', plan: 'Plan <uno>', estrategia: 'No sale', onVolver: () => {}, onPaso: () => {}, onUsar: () => {} })).split('<!-- -->').join('')
  ok(/>Planes<\/button>/.test(cabP) && cabP.includes('data-ruta="plan"') && cabP.includes('Plan &lt;uno&gt;') && !cabP.includes('No sale') && !cabP.includes('data-paso') && !cabP.includes('usar-en-plan'), '§139: en un plan, la ruta «Planes › nombre del plan», sin pasos ni «Usar en un plan»')
  const cabB = renderToString(React.createElement(PanelB.CabeceraPasos, { actual: 2, onPaso: () => {}, onVolver: () => {}, bloqueada: true }))
  ok(!/<button[^>]*data-paso/.test(cabB) && /<button[^>]*data-ruta="mi-trabajo"[^>]*disabled/.test(cabB), 'con una prueba en marcha, nada se pulsa')

  const est2 = { id: 'y', name: 'Otra', definition: EMA, params: { ema: 3 } }
  const plano = (o = {}) => renderToString(React.createElement(BP, { estrategias: [est, est2], deps: { ctx: { url: 'x', headers: {} }, calcula: async () => resp }, inicial: { simbolos: ['TEST'], pruebas: [], huella: 'h', huellas: { x: 'h', y: 'h' }, anchoPestanas: 1400, ...o } })).split('<!-- -->').join('')
  let v = plano({ planes: tres, orden: [] })
  ok(v.includes('data-sin-pestanas') && !v.includes('data-pestana=') && v.includes('data-boton="anadir-plan"') && !v.includes('data-columna="izquierda"'), '0 pestañas: «Ningún plan abierto» y «+ Añadir plan»')
  ok(!v.includes('Convierte') && !v.includes('Tu estrategia con tu dinero') && v.includes('data-cabecera-b'), 'sin el título grande y con la cabecera B')
  v = plano({ planes: [tres[0]], orden: ['g1'], pestana: 'g1' })
  ok(cuenta(v, 'data-pestana=') === 1 && v.includes('data-duplicar="g1"') && v.includes('data-papelera="g1"') && v.includes('data-cerrar="g1"') && v.includes('stroke="#f85149"'), '1 pestaña: duplicar, papelera roja y ×')
  ok(!v.includes('data-sucia') && !v.includes('data-boton="guardar-cambios"') && !v.includes('data-boton="descartar"'), 'sin cambios: ni ●, ni «Guardar cambios», ni «Descartar cambios»')
  ok(/data-boton="comparar"[^>]*disabled|disabled[^>]*data-boton="comparar"/.test(v) && v.includes('title="Guarda al menos dos planes para compararlos."'), '«Comparar planes», desactivado con un solo plan guardado (§128)')
  v = plano({ planes: tres, orden: ['g3', 'g1', 'g2'], pestana: 'g1' })
  ok(/<button data-boton="comparar"(?![^>]*disabled)[^>]*>/.test(v), '«Comparar planes», activo con tres planes guardados (§128)')
  ok(v.indexOf('data-pestana="g3"') < v.indexOf('data-pestana="g1"') && v.indexOf('data-pestana="g1"') < v.indexOf('data-pestana="g2"') && !v.includes('data-boton="mas-pestanas"'), '3 pestañas: en el orden guardado y sin «+N»')
  const muchas = Array.from({ length: 12 }, (_, i) => filaPlan(i + 1))
  v = plano({ planes: muchas, orden: muchas.map(x => `g${x.id}`), pestana: 'g12', anchoPestanas: 900 })
  const nVistas = cuenta(v, 'data-pestana=')
  ok(nVistas < 12 && nVistas >= 1 && v.includes('data-pestana="g12"') && v.includes(`+${12 - nVistas} ▾`), `muchas (12): ${nVistas} a la vista, la abierta entre ellas, y «+${12 - nVistas} ▾»`)
  v = plano({ planes: muchas, orden: ['g4', 'g1'], pestana: 'g4' })
  ok(v.includes('title="Un plan con un nombre larguísimo que no cabe de ninguna manera en la pestaña"') && v.includes('text-overflow:ellipsis'), 'un nombre largo: recortado y entero en el tooltip')
  v = renderToString(React.createElement(BP, { estrategias: [est, est2], deps: { ctx: { url: 'x', headers: {} }, calcula: async () => resp }, inicial: { simbolos: ['TEST'], pruebas: [], huella: 'h', huellas: { x: 'h', y: 'h' }, planes: [tres[0]], orden: ['g1', 'n2'], pestana: 'n2', nuevas: [{ clave: 'n2', nombre: 'Plan nuevo', base: 'otra' }] } })).split('<!-- -->').join('')
  ok(v.includes('sin guardar: se perderá al recargar') && v.includes('data-sin-guardar-pestana') && v.includes('data-aviso="sin-guardar"') && !v.includes('data-papelera="n2"') && v.includes('data-cerrar="n2"') && v.includes('data-boton="guardar"'), 'un plan nuevo: lo dice su pestaña, sin papelera y con «Guardar este plan»')
  ok(v.includes('data-sucia') && v.includes('data-boton="descartar"'), 'con cambios: ● amarillo y «Descartar cambios»')
  v = plano({ planes: tres, orden: ['g1'], pestana: 'g1', pregunta: { tipo: 'abrir', clave: 'g2' } })
  ok(v.includes('data-pregunta="sin-guardar"') && v.includes('data-salida="guardar"') && v.includes('Salir sin guardar') && v.includes('data-salida="cancelar"') && !v.includes('aria-label="Nombre del plan"'), 'la ventana: Guardar / Salir sin guardar / Cancelar')
  v = plano({ planes: tres, orden: ['g1'], pestana: 'g1', borrando: 'g1' })
  ok(v.includes('data-pregunta="borrar-plan"') && v.includes('¿Borrar «Plan 1»?') && v.includes('data-boton="si-borrar"'), 'la papelera avisa antes de borrar')
  v = plano({ planes: tres, orden: ['g1'], pestana: 'g1', ventana: { duplica: 'g1' } })
  ok(v.includes('data-pregunta="nombre-plan"') && v.includes('Duplicar «Plan 1»'), 'duplicar pide el nombre')
  v = plano({ planes: tres, orden: ['g1'], pestana: 'g1', avisoPlan: 'Ese plan ya no existe: se ha borrado.' })
  ok(v.includes('data-aviso="plan-no-existe"'), 'un plan que ya no existe: un aviso de una línea')

  // Los avisos de la línea de debajo
  const conEst = (estado) => plano({ planes: [tres[0]], orden: ['g1'], pestana: 'g1', pruebas: estado === 'sin' ? [] : [{ id: 1, estrategia_id: 'x', estrategia_foto: est, resultado: { veredicto: estado } }], resultadoPrueba: { veredicto: estado } })
  v = conEst('sin')
  ok(v.includes('Estrategia: sin prueba del paso 2') && v.includes('Probarla ahora') && v.includes('Acción elegida a mano'), 'sin prueba: «Estrategia: sin prueba del paso 2 · Probarla ahora»')
  v = conEst('noPasa')
  ok(v.includes('Estrategia: prueba del paso 2 ✕ No pasa') && v.includes('Ver la prueba'), 'no pasa: «Estrategia: prueba del paso 2 ✕ No pasa (…) · Ver la prueba»')

  // §97: un resultado de OTROS ajustes (aún no ha llegado el cálculo de los de ahora) se ve atenuado; el de los ajustes de ahora, no.
  const planAhora = Pa.planDe({ ...Pa.AJUSTES_PLAN, activo: 'TEST', ocioso: 'OCI' }, est)
  const hAhora = pinta({ resultado: { respuesta: resp, plan: planAhora } })
  ok(!hAhora.includes('data-cifras-viejas') && hAhora.includes('data-vista-dinero') && !hAhora.includes('opacity:0.4'), 'el resultado de los ajustes de ahora, sin atenuar')
  const viejo = pinta({ resultado: { respuesta: resp, plan: { ...planAhora, dinero: { ...planAhora.dinero, capitalInicial: 5000 } } } })
  ok(viejo.includes('data-cifras-viejas="si"') && viejo.includes('opacity:0.4') && viejo.includes('data-cifra="final"'), 'un resultado de otros ajustes (p. ej., tras «Descartar cambios»): se ve, pero atenuado, hasta que llega el nuevo')
  // El menú «+ Añadir plan»
  const menuP = (o) => renderToString(React.createElement(Pest.default, { pestanas: [], planes: tres, abiertas: ['g1'], finales: { 1: 114340.91 }, ancho: 1000, menuInicial: 'anadir', ...o })).split('<!-- -->').join('')
  v = menuP()
  ok(v.indexOf('Crear nuevo plan') < v.indexOf('data-plan-menu="1"') && v.includes('Tienes al final 114.341 €') && cuenta(v, 'data-ya-abierto') === 1 && !v.includes('data-buscar="planes"'), 'el menú: arriba crear; debajo todos, con su final si está calculado y ✓ en los abiertos; 3 planes, sin buscador')
  ok(!v.includes('background:transparent;border:1px solid') || v.includes(`background:${require(R + '/lib/builder/estilo.js').B.tarjeta}`), 'el desplegable, con fondo opaco')
  v = menuP({ planes: muchas })
  ok(v.includes('data-buscar="planes"'), 'con más de 6: buscador')
  const acentos = [filaPlan(1), { ...filaPlan(2), nombre: 'Niño Ñu' }]
  v = menuP({ planes: [...muchas, ...acentos.slice(1)], buscaInicial: 'NINO nu' })
  ok(v.includes('Niño Ñu') && !v.includes('data-plan-menu="1"') && v.includes('data-limpiar-busqueda'), 'el buscador, sin distinguir mayúsculas ni acentos, y con ✕')

  console.log(fallos ? `planes-pantalla: ${fallos} fallos` : 'planes-pantalla: todas bien')
  process.exit(fallos ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
