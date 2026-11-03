// scripts/comprobaciones/planes-pantalla.js — la pantalla del paso 3 (docs/builder.md, §53–§55). Las corre comunes.sh. Termina en 0 si todo va bien.
// 1 · Norma de cierre (§53), a mano con el motor: 10.000 € sin aportación en una acción que va de 100 a 114 en 10 años: ganancia 1.400 €, 19 % = 266 €, quedan 11.134 €.
//     El CAGR de la fila, (11.134 / 10.000)^(1/años) − 1; el último punto de la línea, 11.134 €. Y contra la versión anterior (VIEJO): solo cambian los CAGR y el último punto.
const path = require('path')
const C0 = require('./cargador'), R = C0.RAIZ
if (!process.env.VIEJO) { console.error('Falta VIEJO: la carpeta con la copia de la versión anterior (la hace comunes.sh).'); process.exit(2) }
const V = path.resolve(process.env.VIEJO)
let fallos = 0
const ok = (c, t) => { console.log(`${c ? 'OK  ' : 'MAL '} ${t}`); if (!c) fallos++ }
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
  ok(cerca(f(cV, 'ACTIVO').twr, Math.pow(1.14, 1 / anios) - 1, 1e-9) && f(cV, 'ACTIVO').twr > f(c, 'ACTIVO').twr, 'la versión anterior medía el Buy&Hold antes de la venta: (11.400 / 10.000)^(1/años) − 1')
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

  console.log(fallos ? `planes-pantalla: ${fallos} fallos` : 'planes-pantalla: todas bien')
  process.exit(fallos ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
