// scripts/comprobaciones/planes-estrategia.js — la pieza «estrategia» de los planes (P8, versión «una acción»; docs/builder.md §47).
// Las corre comunes.sh. Termina en 0 si todo da lo esperado.
//
// 1 · A mano. 300 velas planas a 100 (calentamiento) y 12 velas del periodo; la estrategia: compra cuando el cierre cruza por encima de
//     su EMA (2) a la apertura siguiente, vende cuando cruza por debajo a la apertura siguiente, stop del 8 %. La vela 1 cierra a 104
//     (EMA 102,67): compra a la apertura de la 2, a 105; la 8 cierra a 113, por debajo de su EMA: vende a la apertura de la 9, a 114.
//     El ocioso, plano a 50. Con 10.000 € y sin costes ni impuestos: 10.000 × 114 / 105 = 10.857,142857… €.
//     · Con 0,1 % de comisión (mínimo 1 €): compra del ocioso (10 €), su venta (9,99 €), compra del valor, su venta, compra del ocioso y
//       su venta final, cada una el 0,1 % de lo que mueve.
//     · Con impuestos (venta con ganancia en 2020): 10.000 / 105 × 9 = 857,14 € de plusvalía, el 19 % (162,86 €) se paga el primer día
//       de bolsa de julio de 2021 vendiendo ocioso; al final, nada más.
//     · Aportación de 1.000 € el primer día de abril, con la operación abierta: «espera» → al ocioso (final + 1.000); «compra» → compra
//       el valor a la apertura de ese día (112) y lo vende con la operación a 114 (final + 1.000 × 114 / 112).
// 2 · Los planes de siempre, sin pieza estrategia: evaluaPlan (con sus referencias) y huellaPlan, idénticos a la versión anterior
//     (VIEJO), con el QQQ real de datos/foto_mom.json (SPY = QQQ, ETF sintético ×2).
// 3 · Coherencia con el paso 1, en la foto: «Prueba editor EMA20» en AAPL, diarias, 2016–2025, 10.000 € sin aportaciones, ocioso
//     LIQUIDEZ, sin costes ni impuestos, sin apalancamiento: el TWR del plan = el CAGR del paso 1 (lib/builder/ensayo.js cifrasRegla)
//     con esas fechas; y las operaciones, las mismas.
const path = require('path')
const C0 = require('./cargador'), R = C0.RAIZ
if (!process.env.VIEJO) { console.error('Falta VIEJO: la carpeta con la copia de la versión anterior (la hace comunes.sh).'); process.exit(2) }
const V = path.resolve(process.env.VIEJO)
const DATOS = process.env.COMPROBACIONES_DATOS || path.join(__dirname, 'datos')
let fallos = 0
const ok = (c, t) => { console.log(`${c ? 'OK  ' : 'MAL '} ${t}`); if (!c) fallos++ }
const cerca = (a, b, tol = 1e-9) => Number.isFinite(a) && Math.abs(a - b) <= tol * Math.max(1, Math.abs(b))
const dia = (f, n) => new Date(Date.parse(f + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10)
const EMA20 = { tipo: 'editor', motor: 1, formato: 1, nombre: 'Prueba editor EMA20', stops: [{ id: 'inicial', pct: 8, tipo: 'porcentaje', motivo: 'stop' }],
  entrada: { orden: { tipo: 'apertura' }, senal: { c: 'cruza', de: { c: 'precioVsMedia', p: { lado: 'encima', tipo: 'EMA', periodo: '$ema' } } } },
  salidas: [{ si: { c: 'cruza', de: { c: 'precioVsMedia', p: { lado: 'debajo', tipo: 'EMA', periodo: '$ema' } } }, tipo: 'condicion', motivo: 'cruce_bajista', precio: 'apertura' }],
  parametros: { lista: [{ max: 400, min: 2, paso: 1, tipo: 'entero', nombre: 'ema', defecto: 20, ventana: true, descripcion: 'Periodo de la EMA' }], version: 1, restricciones: [] } }
;(async () => {
  await C0.prepara(); C0.registra(R); C0.registra(V)
  const P = require(R + '/lib/planes/plan.js'), E = require(R + '/lib/planes/evalua.js'), D = require(R + '/lib/planes/descorrelacion.js')

  // ── 1 · A mano ──
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
  // Del 2 al 6 de marzo, y del 1 al 7 de abril (el 1 de abril, con la operación abierta, es la aportación mensual).
  const conAbril = [...Array.from({ length: 5 }, (_, i) => dia('2020-03-02', i)), ...Array.from({ length: 7 }, (_, i) => dia('2020-04-01', i))]
  // Del 2 de marzo de 2020 en adelante y las dos últimas, el 30 de junio y el 1 de julio de 2021 (el impuesto de 2020).
  const conJulio = [...Array.from({ length: 10 }, (_, i) => dia('2020-03-02', i)), '2021-06-30', '2021-07-01']
  const plan = (fechasPeriodo, extra = {}, pieza = {}) => ({ tipo: 'plan', formato: 1, calculo: 1,
    dinero: { capitalInicial: 10000, aportaciones: { frecuencia: 'ninguna' }, extraordinarias: [] },
    piezas: [{ id: 'e', tipo: 'estrategia', estrategia: { id: 'x', name: 'EMA2', definition: EMA20, params: { ema: 2 } }, activo: 'TEST', peso: 1, ocioso: 'OCI', aportacionDentro: 'espera', apalancamiento: 1, ...pieza }],
    reparto: { aportacionesA: 'pesos', rebalanceo: { calendario: 'nunca', banda: null } }, impuestos: { regimen: 'ninguno', reglaDosMeses: true }, costes: null,
    periodo: { desde: fechasPeriodo[0], hasta: fechasPeriodo[fechasPeriodo.length - 1] }, ...extra })
  {
    const d = datosMano(seguidas), p = plan(seguidas)
    ok(P.validaPlan(p).length === 0, `el plan a mano es válido ${P.validaPlan(p).join(' ')}`)
    const r = P.ejecutaPlan(p, d), es = r.estrategias.e, ops = es.operaciones
    ok(ops.length === 1 && ops[0].entryDate === seguidas[2] && ops[0].entryPrice === 105 && ops[0].exitDate === seguidas[9] && ops[0].exitPrice === 114, `una operación: compra el día 2 a 105 y vende el 9 a 114 (${JSON.stringify(ops.map(o => [o.entryDate, o.entryPrice, o.exitDate, o.exitPrice]))})`)
    ok(cerca(r.patrimonio, 10000 * 114 / 105, 1e-12) && cerca(r.valorNeto, 10000 * 114 / 105, 1e-12), `sin costes ni impuestos: 10.857,142857 € (obtenido ${r.patrimonio})`)
    ok(es.dentro.join('') === '001111111000', `la franja dentro / en el ocioso: 001111111000 (obtenido ${es.dentro.join('')})`)
    ok(cerca(r.serie[5].patrimonio, 10000 / 105 * 115, 1e-12), 'el día 5, el valor al cierre (10.000 / 105 × 115)')
    const m = E.midePlan(p, d).medidas
    ok(cerca(m.twr, Math.pow(114 / 105, 1 / ((Date.parse(seguidas[11]) - Date.parse(seguidas[0])) / 864e5 / 365.25)) - 1, 1e-12), 'TWR = (114/105)^(1/años) − 1')
    // Costes: 0,1 % con mínimo de 1 €.
    const pc = plan(seguidas, { costes: { comisionPct: 0.1, comisionMinEur: 1, horquillaPct: { QQQ: 0, ETF: 0, SPY: 0 } } }), rc = P.ejecutaPlan(pc, d)
    const uOci1 = (10000 - 10) / 50, cob1 = uOci1 * 50 * 0.999, uT = (cob1 - cob1 * 0.001) / 105, cob2 = uT * 114 * 0.999, uOci2 = (cob2 - cob2 * 0.001) / 50
    const pat = uOci2 * 50, neto = pat - pat * 0.001
    ok(cerca(rc.patrimonio, pat, 1e-12) && cerca(rc.valorNeto, neto, 1e-12), `con 0,1 % de comisión: patrimonio ${pat.toFixed(6)} y neto ${neto.toFixed(6)} (obtenido ${rc.patrimonio.toFixed(6)} y ${rc.valorNeto.toFixed(6)})`)
    ok(rc.costes.ordenes === 5, `5 órdenes durante el plan (obtenido ${rc.costes.ordenes})`)
    // Aportación a mitad de operación.
    const da = datosMano(conAbril), ap = { dinero: { capitalInicial: 10000, aportaciones: { importe: 1000, frecuencia: 'mensual' }, extraordinarias: [] } }
    const re = P.ejecutaPlan(plan(conAbril, ap), da), rp = P.ejecutaPlan(plan(conAbril, ap, { aportacionDentro: 'compra' }), da)
    ok(re.estrategias.e.operaciones.length === 1 && re.estrategias.e.operaciones[0].entryDate === conAbril[2] && re.estrategias.e.operaciones[0].exitDate === conAbril[9], 'con abril: la misma operación (días 2 → 9)')
    ok(cerca(re.patrimonio, 10000 * 114 / 105 + 1000, 1e-12), `«espera»: 10.000 × 114/105 + 1.000 = ${(10000 * 114 / 105 + 1000).toFixed(6)} (obtenido ${re.patrimonio.toFixed(6)})`)
    ok(cerca(rp.patrimonio, 10000 * 114 / 105 + 1000 * 114 / 112, 1e-12), `«compra»: 10.000 × 114/105 + 1.000 × 114/112 = ${(10000 * 114 / 105 + 1000 * 114 / 112).toFixed(6)} (obtenido ${rp.patrimonio.toFixed(6)})`)
    ok(re.aportado === 11000 && rp.aportado === 11000, 'aportado: 11.000 € en los dos')
    // Impuestos: la venta con ganancia en 2020 paga en julio de 2021.
    const dj = datosMano(conJulio), pj = plan(conJulio, { impuestos: { regimen: 'ES-ahorro', reglaDosMeses: true } }), rj = P.ejecutaPlan(pj, dj)
    const G = 10000 / 105 * 114 - 10000, T = G * 0.19
    const f2020 = rj.impuestos.porAnio.find(x => x.anio === '2020')
    ok(f2020 && cerca(f2020.plusvalia, G, 1e-12) && cerca(f2020.impuesto, T, 1e-12) && f2020.pagadoEl === '2021-07-01', `2020: plusvalía ${G.toFixed(6)}, impuesto ${T.toFixed(6)}, pagado el 2021-07-01 (obtenido ${JSON.stringify(f2020)})`)
    ok(cerca(rj.patrimonio, 10000 * 114 / 105 - T, 1e-12) && cerca(rj.valorNeto, 10000 * 114 / 105 - T, 1e-12) && cerca(rj.impuestos.pagados, T, 1e-12), `tras el impuesto: ${(10000 * 114 / 105 - T).toFixed(6)} € (obtenido ${rj.valorNeto.toFixed(6)})`)
    // Apalancamiento 2: el sintético diario del valor (con su coste) durante la operación; fuera, el ocioso sin apalancar.
    const p2 = plan(seguidas, {}, { apalancamiento: 2 }), r2 = P.ejecutaPlan(p2, d)
    ok(r2.estrategias.e.simbolo === 'TEST×2' && r2.estrategias.e.dentro.join('') === '001111111000' && r2.patrimonio > r.patrimonio, `×2: dentro del sintético TEST×2, la misma franja y más ganancia (${r2.patrimonio.toFixed(2)} > ${r.patrimonio.toFixed(2)})`)
    // Referencias nuevas: el ocioso en liquidez y comprar y mantener el valor.
    const ev = E.evaluaPlan(p, d), ids = ev.referencias.map(x => x.id)
    ok(ids.includes('OCIOSO_LIQUIDEZ') && ids.includes('ACTIVO') && cerca(ev.referencias.find(x => x.id === 'ACTIVO').medidas.patrimonio, 10000 * 114 / 100, 1e-12), `referencias ${ids.join(', ')}; comprar y mantener TEST: 10.000 × 114 / 100`)
    // Descorrelación: a mano, una curva con dos caídas.
    const dc = D.descorrelacion({ fechas: ['a', 'b', 'c', 'd', 'e', 'f', 'g'], curva: [1, 0.9, 1.1, 0.88, 0.99, 1.2, 1.1], ocioso: [10, 11, 12, 15, 14, 13, 12] })
    ok(JSON.stringify(dc.map(x => [x.pico, x.valle, x.recuperacion, +x.caida.toFixed(6), +x.ocioso.toFixed(6)])) === JSON.stringify([['c', 'd', 'f', -0.2, 0.25], ['a', 'b', 'c', -0.1, 0.1], ['f', 'g', null, -0.083333, -0.076923]]), `descorrelación a mano ${JSON.stringify(dc)}`)
    ok(ev.descorrelacion?.e?.length >= 1, 'evaluaPlan trae la descorrelación de la pieza')
  }

  // ── 2 · Los planes de siempre, idénticos ──
  const foto = require(path.join(DATOS, 'foto_mom.json'))
  const velasDe = (sym) => { const r = foto[sym]; if (!r?.quote) return null; const q = r.quote; return r.timestamp.map((ts, i) => ({ date: new Date((ts + (r.meta.gmtoffset || 0)) * 1000).toISOString().slice(0, 10), open: q.open[i], high: q.high[i], low: q.low[i], close: q.close[i], volume: q.volume[i] })).filter(v => v.open > 0 && v.close > 0) }
  const qqq = velasDe('QQQ'), aapl = velasDe('AAPL')
  const datosDe = (raiz) => {
    const C = require(raiz + '/lib/laboratorioCartera.js'), S = require(raiz + '/lib/etfSintetico.js'), SIN = require(raiz + '/lib/etfSinteticos.json')
    return C.alineaDatos({ qqq, etf: { simbolo: 'SINTETICO', velas: S.construyeSintetico(C.preciosTotales(qqq, []), { k: 2, comision: SIN.comision[2], ajuste: SIN.ajuste[2] }) }, spy: qqq }, { QQQ: [], SPY: [], SINTETICO: [] })
  }
  {
    const L = require(R + '/lib/lotesLab.js')
    const regla = L.CARTERA_3.items[0].regla
    const base = { tipo: 'plan', formato: 1, calculo: 1, etf: 'x2', dinero: { capitalInicial: 10000, aportaciones: { importe: 300, frecuencia: 'mensual', crecimientoAnual: 2 }, extraordinarias: [{ fecha: '2018-05-10', importe: 5000 }] },
      reparto: { aportacionesA: 'infraponderada', rebalanceo: { calendario: 'anual', banda: 0.1 } }, impuestos: { regimen: 'ES-ahorro', reglaDosMeses: true },
      costes: { comisionPct: 0.1, comisionMinEur: 2, horquillaPct: { QQQ: 0.02, ETF: 0.05, SPY: 0.02 } }, periodo: { desde: '2012-01-01', hasta: '2024-12-31' } }
    const planes = {
      'cartera + QQQ + liquidez': { ...base, piezas: [{ id: 'c', tipo: 'cartera', regla, peso: 0.5 }, { id: 'q', tipo: 'activo', activo: 'QQQ', peso: 0.3 }, { id: 'l', tipo: 'activo', activo: 'LIQUIDEZ', peso: 0.2 }] },
      'solo ETF, sin impuestos ni costes': { ...base, impuestos: { regimen: 'ninguno', reglaDosMeses: true }, costes: null, piezas: [{ id: 'x', tipo: 'activo', activo: 'ETF', peso: 1 }] },
      'SPY + cartera, con los pesos': { ...base, reparto: { aportacionesA: 'pesos', rebalanceo: { calendario: 'trimestral', banda: null } }, piezas: [{ id: 's', tipo: 'activo', activo: 'SPY', peso: 0.4 }, { id: 'c', tipo: 'cartera', regla, peso: 0.6 }] },
    }
    const corre = (raiz) => { const PP = require(raiz + '/lib/planes/plan.js'), EE = require(raiz + '/lib/planes/evalua.js'), d = datosDe(raiz); return Promise.all(Object.entries(planes).map(async ([k, p]) => [k, JSON.stringify(EE.evaluaPlan(p, d, { detalle: true })), await PP.huellaPlan(p), JSON.stringify(EE.iniciosRodantes(p, d, { desde: '2010-01-01', hasta: '2024-12-31', duracion: 8 }))])) }
    const a = await corre(V), b = await corre(R)
    a.forEach(([k, ja, ha, ra], i) => { const [, jb, hb, rb] = b[i]; ok(ja === jb && ha === hb && ra === rb, `${k}: evaluación, huella e inicios rodantes idénticos a la versión anterior (${(jb.length / 1024).toFixed(0)} KB, huella ${hb.slice(0, 8)})`) })
  }

  // ── 3 · Coherencia con el paso 1 (foto: AAPL) ──
  {
    const C = require(R + '/lib/laboratorioCartera.js'), EN = require(R + '/lib/builder/ensayo.js')
    const datos = { ...C.alineaDatos({ qqq, etf: { simbolo: 'QQQ', velas: qqq }, spy: qqq }, { QQQ: [], SPY: [] }), velas: { AAPL: aapl } }
    datos.etf = datos.etf.map(() => null)
    const p = { tipo: 'plan', formato: 1, calculo: 1, dinero: { capitalInicial: 10000, aportaciones: { frecuencia: 'ninguna' }, extraordinarias: [] },
      piezas: [{ id: 'e', tipo: 'estrategia', estrategia: { id: 'c4b2949f', name: 'Prueba editor EMA20', definition: EMA20, params: { ema: 20, intervalo: 'diario' } }, activo: 'AAPL', peso: 1, ocioso: 'LIQUIDEZ', aportacionDentro: 'espera', apalancamiento: 1 }],
      reparto: { aportacionesA: 'pesos', rebalanceo: { calendario: 'nunca', banda: null } }, impuestos: { regimen: 'ninguno', reglaDosMeses: true }, costes: null, periodo: { desde: '2016-01-01', hasta: '2025-12-31' } }
    const e = E.evaluaPlan(p, datos), m = e.plan.medidas
    const c = await EN.cifrasRegla({ def: EMA20, valores: { ema: 20, intervalo: 'diario' }, simbolo: 'AAPL', velas: { AAPL: aapl }, desde: '2016-01-01', hasta: '2025-12-31' })
    const ops = e.plan.ejecucion.estrategias.e.operaciones
    const mismas = ops.length === c.trades.length && ops.every((o, k) => o.entryDate === c.trades[k].entryDate && o.entryPrice === c.trades[k].entryPrice && (o.exitDate ?? c.trades[k].exitDate) === c.trades[k].exitDate && (o.exitPrice ?? c.trades[k].exitPrice) === c.trades[k].exitPrice)
    ok(mismas, `las mismas ${c.trades.length} operaciones que el paso 1 (plan: ${ops.length})`)
    ok(m.desde === c.desde && m.hasta === c.hasta, `las mismas fechas: ${m.desde} → ${m.hasta} (paso 1: ${c.desde} → ${c.hasta})`)
    ok(cerca(m.twr * 100, c.regla.cagr, 1e-10), `TWR del plan ${(m.twr * 100).toFixed(10)} % = CAGR del paso 1 ${c.regla.cagr.toFixed(10)} % (diferencia ${(m.twr * 100 - c.regla.cagr).toExponential(2)})`)
  }
  console.log(fallos ? `planes-estrategia: ${fallos} fallos` : 'planes-estrategia: todas bien')
  process.exit(fallos ? 1 : 0)
})().catch(e => { console.error(e); process.exit(2) })
