// scripts/comprobaciones/screener.js — el screener (docs/screener.md) con datos INVENTADOS y cuentas hechas a mano:
// lector de EDGAR (lib/screener/edgar.js), universo y sectores, cifras de cada empresa (metricas.js), filtros y vistas
// (filtros.js, vista.js). No usa la red ni la base. Termina en 0 si todo va bien.
const { preparaEsm } = require('../guardian/cargaEsm')

let fallos = 0, n = 0
const ok = (c, msg) => { n++; if (!c) { fallos++; console.log('✗ ' + msg) } }
const cerca = (a, b, tol = 1e-9) => a != null && b != null && Math.abs(a - b) <= tol

;(async () => {
  await preparaEsm()
  const { filasDeEmpresa } = require('../../lib/screener/edgar')
  const { universoDe, sp500DeWikipedia, aYahoo } = require('../../lib/screener/universo')
  const { sectorDe, sectorDeSic } = require('../../lib/screener/sectores')

  // ── EDGAR ────────────────────────────────────────────────────────────────────────────────────────────────────────────
  // Ventas: 2023 con SalesRevenueNet (90); 2024 y 2025 con Revenues. 2024 salió con 100 en el 10-K de 2025 y se corrigió a
  // 102 en el de 2026 → vale 102, conocido desde el 01/02/2025. Del 10-Q de septiembre de 2026: lo que va de año 100 y el
  // mismo tramo de 2025, 85 → últimos 12 meses = 120 + 100 − 85 = 135.
  const h = (start, end, val, form, filed, accn = filed) => ({ ...(start ? { start } : {}), end, val, form, filed, accn })
  const cf = { cik: 123, facts: { 'us-gaap': {
    SalesRevenueNet: { units: { USD: [h('2023-01-01', '2023-12-31', 90, '10-K', '2024-02-01')] } },
    Revenues: { units: { USD: [
      h('2024-01-01', '2024-12-31', 100, '10-K', '2025-02-01'),
      h('2024-01-01', '2024-12-31', 102, '10-K', '2026-02-01'),
      h('2025-01-01', '2025-12-31', 120, '10-K', '2026-02-01'),
      h('2025-07-01', '2025-09-30', 30, '10-Q', '2025-10-30'),
      h('2026-01-01', '2026-09-30', 100, '10-Q', '2026-10-30'),
      h('2025-01-01', '2025-09-30', 85, '10-Q', '2026-10-30'),
      h('2026-07-01', '2026-09-30', 36, '10-Q', '2026-10-30'),
    ] } },
    // Activos: el 10-Q de septiembre repite el cierre de 2025 (600): el anual debe salir del 10-K.
    Assets: { units: { USD: [
      h(null, '2024-12-31', 500, '10-K', '2025-02-01'), h(null, '2025-12-31', 600, '10-K', '2026-02-01'),
      h(null, '2026-09-30', 650, '10-Q', '2026-10-30'), h(null, '2025-12-31', 600, '10-Q', '2026-10-30'),
    ] } },
  } } }
  const filas = filasDeEmpresa(cf)
  const de = (c, p, fin) => filas.find(f => f.concepto === c && f.periodo === p && f.fin === fin)
  const v23 = de('ventas', 'FY', '2023-12-31'), v24 = de('ventas', 'FY', '2024-12-31'), v25 = de('ventas', 'FY', '2025-12-31')
  ok(v23 && v23.valor === 90 && v23.etiqueta === 'us-gaap:SalesRevenueNet', 'ventas 2023 con la partida antigua (90)')
  ok(v24 && v24.valor === 102 && v24.presentado === '2026-02-01' && v24.conocido_desde === '2025-02-01', 'ventas 2024 corregidas (102, conocido desde 01/02/2025)')
  ok(v25 && v25.valor === 120, 'ventas 2025 (120)')
  const vt = de('ventas', 'TTM', '2026-09-30')
  ok(vt && vt.valor === 135, `ventas de los últimos 12 meses = 120 + 100 − 85 = 135 (sale ${vt && vt.valor})`)
  const a25 = de('activos', 'FY', '2025-12-31')
  ok(a25 && a25.valor === 600 && a25.presentado === '2026-02-01', 'activos 2025 del 10-K, no del 10-Q que los repite')
  ok(de('activos', 'TTM', '2026-09-30')?.valor === 650, 'activos del último trimestre (650)')
  ok(filas.filter(f => f.concepto === 'ventas' && f.periodo === 'FY').length === 3, 'tres ejercicios de ventas, sin repetir')
  ok(filasDeEmpresa({ cik: 1, facts: {} }).length === 0, 'una empresa sin cuentas no da filas')

  // ── Universo y sectores ──────────────────────────────────────────────────────────────────────────────────────────────
  ok(aYahoo('BRK.B') === 'BRK-B', 'BRK.B → BRK-B')
  const tickersSec = { 0: { cik_str: 1, ticker: 'AAA', title: 'Aaa Inc' }, 1: { cik_str: 2, ticker: 'BBB', title: 'Bbb Corp' }, 2: { cik_str: 3, ticker: 'BRK-B', title: 'Brk' } }
  const { empresas, sinCik } = universoDe({
    sp500: [{ simbolo: 'BRK.B', nombre: 'Brk', gics: 'Financials', cik: 3 }, { simbolo: 'AAA', nombre: 'Aaa', gics: 'Information Technology', cik: 1 }],
    ndx: [{ simbolo_yahoo: 'AAA' }, { simbolo_yahoo: 'ZZZ' }],
    listas: ['BBB', 'GC=F', '^GSPC'], tickersSec })
  ok(empresas.map(e => e.simbolo).join() === 'AAA,BBB,BRK-B', `universo AAA, BBB, BRK-B (sale ${empresas.map(e => e.simbolo).join()})`)
  ok(empresas[0].en_sp500 && empresas[0].en_ndx && !empresas[0].en_listas, 'AAA en S&P 500 y Nasdaq-100')
  ok(empresas[1].en_listas && empresas[1].cik === 2 && empresas[1].nombre === 'Bbb Corp', 'BBB solo de las listas, con CIK y nombre de la SEC')
  ok(sinCik.join() === 'ZZZ', 'ZZZ sin CIK queda fuera')
  ok(sectorDe({ gics: 'Real Estate', sic: 3571 }).sector === 'Inmobiliario', 'GICS manda sobre SIC')
  ok(sectorDe({ sic: 3571 }).sector === 'Tecnología' && sectorDe({ sic: 3571 }).sector_fuente === 'SIC', 'SIC 3571 → Tecnología (SIC)')
  ok(sectorDeSic(6798) === 'Inmobiliario' && sectorDeSic(6022) === 'Financieras' && sectorDeSic(2834) === 'Salud' && sectorDeSic(2821) === 'Materiales' && sectorDeSic(1311) === 'Energía' && sectorDeSic(4911) === 'Utilities', 'tramos SIC')
  const html = '<table id="constituents"><tr><th>x</th></tr><tr><td><a>MMM</a></td><td>3M</td><td>Industrials</td><td>x</td><td>x</td><td>x</td><td>0000066740</td><td>1902</td></tr></table>'
  const w = sp500DeWikipedia(html)
  ok(w.length === 1 && w[0].simbolo === 'MMM' && w[0].gics === 'Industrials' && w[0].cik === 66740, 'tabla de Wikipedia')
  ok(sp500DeWikipedia('<html>otra cosa</html>').length === 0, 'Wikipedia sin la tabla → lista vacía')

  // ── Cifras de una empresa (metricas.js), cuentas inventadas, cuentas a mano ──────────────────────────────────────────────
  const { metricasDe, medianasPorSector } = require('../../lib/screener/metricas')
  const Mm = 1e6, fila = (concepto, fin, valor, periodo = 'FY') => ({ concepto, periodo, fin, valor: valor * Mm, unidad: 'USD' })
  const cuentas = [
    fila('beneficio_operativo', '2025-12-31', 300), fila('activos', '2025-12-31', 1500), fila('pasivo_corriente', '2025-12-31', 300),
    fila('beneficio_neto', '2025-12-31', 150), fila('patrimonio', '2025-12-31', 600), fila('caja', '2025-12-31', 400),
    fila('inversiones_corto', '2025-12-31', 100), fila('deuda_corto', '2025-12-31', 200), fila('papel_comercial', '2025-12-31', 50),
    fila('deuda_largo', '2025-12-31', 250), fila('gasto_intereses', '2025-12-31', 25), fila('flujo_operativo', '2025-12-31', 350),
    fila('inversion_capex', '2025-12-31', 120), fila('ventas', '2025-12-31', 1400), fila('ventas', '2020-12-31', 800),
    fila('beneficio_neto', '2022-12-31', 100), fila('patrimonio', '2022-12-31', 500), fila('beneficio_neto', '2020-12-31', 75),
    { concepto: 'acciones_diluidas', periodo: 'FY', fin: '2025-12-31', valor: 100 * Mm, unidad: 'shares' },
    // Inversiones a corto de 2019: ya no las presenta (más de 400 días) → no cuentan (se usan las de 2025).
    fila('inversiones_corto', '2019-12-31', 999),
  ]
  const r = metricasDe({ simbolo: 'XYZ', precio: 50, peg_esperado: 2 }, cuentas)
  const m = r.m
  ok(cerca(m.roce, 25), `ROCE = 300 ÷ (1.500 − 300) = 25 % (sale ${m.roce})`)
  ok(cerca(m.roa, 10), 'ROA = 150 ÷ 1.500 = 10 %')
  ok(cerca(m.roe, 25), 'ROE = 150 ÷ 600 = 25 %')
  ok(cerca(m.roe3, 20) && m.roeMejora === true && m.roe3Anio === 2022, 'ROE hace 3 años = 100 ÷ 500 = 20 % → mejora')
  ok(cerca(r.piezas.caja, 500) && cerca(r.piezas.deudaCorto, 250) && m.cajaCubre === true, 'caja 400 + 100 = 500 ≥ deuda a corto 200 + 50 = 250')
  ok(cerca(m.cobInt, 12) && m.sinIntereses === false, 'cobertura = 300 ÷ 25 = 12 veces')
  ok(cerca(r.piezas.deudaTotal, 500) && cerca(m.deudaNeta, 0), 'deuda total 250 + 250 = 500; neta 500 − 500 = 0')
  ok(cerca(m.de, 500 / 600), 'D/E = 500 ÷ 600 = 0,83')
  ok(cerca(m.ventas5, 75), 'ventas en 5 años: 1.400 ÷ 800 − 1 = 75 %')
  ok(cerca(m.fcf, 230), 'flujo de caja libre = 350 − 120 = 230')
  ok(cerca(m.capitalizacion, 5000) && cerca(m.per, 5000 / 150), 'capitalización 50 × 100 M = 5.000; PER = 5.000 ÷ 150 = 33,33')
  ok(cerca(m.ps, 5000 / 1400), 'P/S = 5.000 ÷ 1.400 = 3,57')
  ok(cerca(m.crecPasado, (Math.pow(2, 0.2) - 1) * 100), 'crecimiento pasado = (150 ÷ 75)^(1/5) − 1 = 14,87 % al año')
  ok(cerca(m.pegPas, (5000 / 150) / ((Math.pow(2, 0.2) - 1) * 100)), 'PEG pasado = 33,33 ÷ 14,87 = 2,24')
  ok(m.pegEsp === 2 && cerca(m.crecEsperado, 5000 / 150 / 2), 'PEG esperado 2 → crecimiento esperado 33,33 ÷ 2 = 16,67 %')
  const sinInt = metricasDe({ simbolo: 'S', precio: 50 }, cuentas.filter(c => c.concepto !== 'gasto_intereses'))
  ok(sinInt.m.sinIntereses === true && sinInt.m.cobInt === null, 'sin gasto de intereses declarado → «no paga intereses»')
  const enEur = metricasDe({ simbolo: 'E', precio: 50 }, cuentas.map(c => c.unidad === 'USD' ? { ...c, unidad: 'EUR' } : c))
  ok(enEur.m.per === null && enEur.m.ps === null && cerca(enEur.m.roce, 25), 'cuentas en euros: sin PER ni P/S, ROCE sí')
  const negativo = metricasDe({ simbolo: 'N', precio: 50 }, cuentas.map(c => c.concepto === 'patrimonio' ? { ...c, valor: -c.valor } : c))
  ok(negativo.m.roe === null && negativo.m.de === null, 'patrimonio negativo: sin ROE ni D/E')
  const aprox = metricasDe({ simbolo: 'A', precio: 50 }, [...cuentas.filter(c => c.concepto !== 'beneficio_operativo'), fila('beneficio_antes_impuestos', '2025-12-31', 275)])
  ok(aprox.piezas.ebitAprox === true && cerca(aprox.m.roce, 25), 'sin beneficio operativo: 275 antes de impuestos + 25 de intereses = 300 → ROCE 25 %')
  const tres = [{ sector: 'A', m: { ps: 1 } }, { sector: 'A', m: { ps: 3 } }, { sector: 'A', m: { ps: 10 } }, { sector: 'B', m: { ps: 2 } }, { sector: 'B', m: { ps: 4 } }, { sector: 'A', m: { ps: null } }]
  const med = medianasPorSector(tres)
  ok(med.A === 3 && med.B === 3 && tres[5].m.psSector === 3, 'mediana del P/S por sector: A (1, 3, 10) = 3 · B (2, 4) = 3')

  console.log(`screener: ${fallos ? fallos + ' fallos de ' + n : 'todas bien (' + n + ')'}`)
  process.exit(fallos ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
