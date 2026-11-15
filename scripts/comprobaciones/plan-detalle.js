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
  console.log(fallos ? `plan-detalle: ${fallos} fallos` : 'plan-detalle: todas bien')
  process.exit(fallos ? 1 : 0)
})().catch(e => { console.error(e); process.exit(2) })
