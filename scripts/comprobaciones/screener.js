// scripts/comprobaciones/screener.js — el screener (docs/screener.md) con datos INVENTADOS y cuentas hechas a mano:
// lector de EDGAR (lib/screener/edgar.js), universo y sectores, cifras de cada empresa (metricas.js), filtros y vistas
// (filtros.js, vista.js). No usa la red ni la base. Termina en 0 si todo va bien.
const { preparaEsm } = require('../guardian/cargaEsm')
const D = require('./domFalso')

let fallos = 0, n = 0
const ok = (c, msg) => { n++; if (!c) { fallos++; console.log('✗ ' + msg) } }
const cerca = (a, b, tol = 1e-9) => a != null && b != null && Math.abs(a - b) <= tol

;(async () => {
  D.pon()
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

  // ── Filtros y vistas (filtros.js, vista.js) ───────────────────────────────────────────────────────────────────────────
  const { evaluaVista, pasa, FILTRO, FILTROS } = require('../../lib/screener/filtros')
  const { vistaNueva, normalizaVista, textoVista, VISTAS_EJEMPLO } = require('../../lib/screener/vista')
  const emp = (simbolo, sector, m, extra = {}) => ({ simbolo, nombre: simbolo + ' Inc', sector, en_sp500: true, en_ndx: false, en_listas: false, precio: 10, piezas: {}, m: { ...m }, ...extra })
  const E = [
    emp('AAA', 'Tecnología', { roce: 30, cobInt: 12, sinIntereses: false }),
    emp('BBB', 'Salud', { roce: 20, cobInt: null, sinIntereses: true }, { en_sp500: false, en_listas: true }),
    emp('CCC', 'Financieras', { roce: 40 }),
    emp('DDD', 'Industria', { roce: null, cobInt: 2, sinIntereses: false }),
  ]
  const v1 = vistaNueva({ on: ['roce'] })
  const r1 = evaluaVista(E, v1)
  ok(r1.universo.length === 3 && r1.quitadosSector === 1, 'universo: 4 − 1 financiera = 3')
  ok(r1.f1.map(e => e.simbolo).join() === 'AAA' && r1.cuantos.roce === 2, 'ROCE ≥ 25: pasa AAA; quita 2 (BBB con 20 y DDD sin dato)')
  ok(r1.f2.length === 1 && r1.pasaTodo.has('AAA'), 'sin filtros técnicos, el piso 2 = el 1')
  const r2 = evaluaVista(E, { ...v1, universo: { sp500: true, ndx: true, listas: false } })
  ok(r2.universo.length === 2 && !r2.universo.some(e => e.simbolo === 'BBB'), 'sin «Tus listas», BBB (solo de listas) sale del universo')
  const r3 = evaluaVista(E, { ...v1, sectoresFuera: [] })
  ok(r3.universo.length === 4 && r3.f1.map(e => e.simbolo).join() === 'AAA,CCC', 'sin quitar sectores, CCC (40 %) también pasa')
  const v4 = vistaNueva({ on: ['cobInt'] })
  ok(evaluaVista(E, v4).f1.map(e => e.simbolo).join() === 'AAA,BBB', 'cobertura ≥ 3: pasa AAA (12) y BBB (no paga intereses); no DDD (2)')
  ok(pasa(E[0], FILTRO.roce, { on: true, op: '≤', valor: 30 }) && !pasa(E[0], FILTRO.roce, { on: true, op: '≤', valor: 29.9 }), 'operador ≤ (30 ≤ 30 sí, 30 ≤ 29,9 no)')
  ok(pasa(E[3], FILTRO.roce, { on: false }), 'un filtro apagado pasa siempre')
  const vieja = { tipo: 'vista_screener', version: 1, filtros: { roce: { on: true, op: '≥', valor: 28 } } }
  const nv = normalizaVista(vieja)
  ok(nv.filtros.roce.valor === 28 && nv.filtros.roe.on === false && nv.filtros.roe.valor === 15 && nv.pegRazonable === 2 && nv.sectoresFuera.length === 5, 'una vista vieja se completa sin cambiar lo que tenía')
  ok(textoVista({ ...vieja, pegRazonable: 2 }) === textoVista({ pegRazonable: 2, filtros: vieja.filtros, version: 1, tipo: 'vista_screener' }), 'texto canónico: el orden de las claves no cuenta')
  ok(VISTAS_EJEMPLO.map(v => v.nombre).join(' | ') === 'Rentabilidad y poca deuda | Crecer a buen precio | Alerta de precio caro', 'las tres vistas de ejemplo')
  ok(VISTAS_EJEMPLO[2].vista.filtros.per.op === '≥' && VISTAS_EJEMPLO[2].vista.filtros.pegEsp.valor === 3 && VISTAS_EJEMPLO[2].vista.sectoresFuera.length === 0, '«Alerta de precio caro»: PER ≥ 30, PEG esperado ≥ 3, sin quitar sectores')

  // ── La pantalla montada (components/ScreenerPanel.js) ─────────────────────────────────────────────────────────────────
  const React = require('react'), { renderToString } = require('react-dom/server')
  const P = require('../../components/ScreenerPanel').default
  const { pestanaDe, conCambiosDe } = require('../../components/ScreenerPanel')
  const guardada = (extra = {}) => pestanaDe({ id: 7, nombre: 'Prueba', vista: v1, ...extra })
  const monta = (inicial) => renderToString(React.createElement(P, { inicial: { empresas: E, vistas: [guardada()], ...inicial } })).split('<!-- -->').join('')
  let hp = monta({})
  ok(hp.includes('1 · pasan Fundamentales') && hp.includes('data-embudo-n="1"') && hp.slice(hp.indexOf('data-embudo-n="1"')).startsWith('data-embudo-n="1" style="font-size:20px;font-weight:700;color:#ffffff">1<'), 'embudo: pasan Fundamentales 1')
  ok(hp.includes('data-fila="AAA"') && !hp.includes('data-fila="BBB"'), 'tabla: AAA sí, BBB no')
  ok(hp.includes('data-cuenta="roce"') && hp.includes('−2'), 'el ROCE dice «−2»')
  ok(hp.includes('data-celda="roce"') && hp.includes('30,0 %'), 'celda del ROCE: 30,0 %')
  ok(!hp.includes('data-punto-cambios') && /data-guardar="true"[^>]*disabled=""|disabled=""[^>]*data-guardar/.test(hp), 'vista guardada sin cambios: sin «●» y «Guardar» desactivado')

  // ── Vistas guardadas (vistasBase.js y la pantalla) ────────────────────────────────────────────────────────────────────
  const g = guardada()
  ok(!conCambiosDe(g) && conCambiosDe({ ...g, nombre: 'Otra' }) && !conCambiosDe({ ...g, nombre: '  Prueba  ' }), 'cambios: otro nombre sí; espacios de más no')
  ok(conCambiosDe({ ...g, vista: { ...v1, pegRazonable: 3 } }) && conCambiosDe(pestanaDe({ nombre: 'Nueva', vista: v1 })), 'cambios: otra vista, o una nueva sin guardar')
  hp = monta({ vistas: [{ ...guardada(), nombre: 'Otra' }] })
  ok(hp.includes('data-punto-cambios') && !/data-guardar="true"[^>]*disabled=""/.test(hp), 'con cambios: «●» en la pestaña y «Guardar» activo')
  ok(hp.includes('+ Nueva vista ▾') && hp.includes('data-duplicar') && hp.includes('data-borrar-vista') && hp.includes('Descartar cambios'), 'nueva, duplicar, papelera y descartar')
  hp = monta({ pregunta: { tipo: 'salir', accion: () => {} } })
  ok(hp.includes('Tienes cambios sin guardar en la vista «Prueba».') && hp.includes('Salir sin guardar') && hp.includes('data-p="cancelar"'), 'ventana propia «Guardar / Salir sin guardar / Cancelar»')
  hp = monta({ pregunta: { tipo: 'borrar' } })
  ok(hp.includes('¿Borrar la vista «Prueba»?') && hp.includes('No se puede deshacer.'), 'ventana propia para borrar, con aviso')
  const VB = require('../../lib/screener/vistasBase')
  ok(VB.camposVista({ nombre: '  Mi   vista ', vista: { filtros: { roce: { on: true } } } }).nombre === 'Mi vista' && VB.camposVista({ nombre: ' ', vista: {} }).nombre === 'Vista sin nombre', 'nombre limpio, o «Vista sin nombre»')
  ok(VB.camposVista({ nombre: 'x', vista: { filtros: { roce: { on: true } } } }).vista.filtros.roe.on === false, 'se guarda la vista completa')
  const llamadas = []
  const ctxF = { url: 'https://base', headers: { apikey: 'k' }, fetch: async (u, o = {}) => { llamadas.push({ u, m: o.method || 'GET', b: o.body ? JSON.parse(o.body) : null }); return { ok: true, status: 201, json: async () => [{ id: llamadas.length, ...(o.body ? JSON.parse(o.body) : {}) }] } } }
  const hechas = await VB.creaEjemplos(ctxF)
  ok(hechas.length === 3 && llamadas.every(l => l.m === 'POST' && l.u.startsWith('https://base/rest/v1/screener_vistas')) && llamadas.map(l => l.b.posicion).join() === '0,1,2' && llamadas[2].b.nombre === 'Alerta de precio caro', 'la primera vez: las 3 de ejemplo, en su orden')
  llamadas.length = 0
  await VB.cambiarVista(ctxF, 5, { nombre: 'Y', vista: v1, posicion: 2 }); await VB.borrarVista(ctxF, 5)
  ok(llamadas[0].m === 'PATCH' && llamadas[0].u.includes('id=eq.5') && llamadas[1].m === 'DELETE' && llamadas[1].u.includes('id=eq.5'), 'cambiar y borrar por id')
  hp = monta({ verNo: true, orden: { col: 'roce', dir: -1 } })
  const pos = (s) => hp.indexOf('data-fila="' + s + '"')
  ok(pos('AAA') > 0 && pos('BBB') > pos('AAA') && pos('DDD') > pos('BBB') && pos('CCC') < 0, 'ver también los que no pasan, por ROCE de mayor a menor: AAA, BBB, DDD (sin dato al final); CCC quitada')
  hp = monta({ busca: 'zzz' })
  ok(hp.includes('Ningún valor coincide con la búsqueda.') && hp.includes('data-limpiar-busqueda'), 'buscar sin resultados, con la ✕ de limpiar')
  hp = monta({ busca: 'SALUD', verNo: true })
  ok(hp.includes('data-fila="BBB"') && !hp.includes('data-fila="AAA"'), 'buscar por sector sin distinguir mayúsculas')
  hp = monta({ piso: 'T' })
  ok(hp.includes('Estos filtros llegan en la parte 2 del screener.') && hp.includes('data-filtro="ema200"'), 'pestaña Técnico: filtros que llegan más adelante')
  hp = renderToString(React.createElement(P, {}))
  ok(hp.includes('Cargando las empresas…'), 'sin datos: «Cargando las empresas…»')

  // ── «Guardar como lista» (lista.js) y el cajón ─────────────────────────────────────────────────────────────────────────
  const L = require('../../lib/screener/lista')
  ok(L.nombrePropuesto('Mi vista', new Date(2026, 10, 7)) === 'Mi vista · 07/11/2026', 'nombre propuesto: «Mi vista · 07/11/2026»')
  const jwt = 'x.' + Buffer.from(JSON.stringify({ sub: 'u-1' })).toString('base64').replace(/=+$/, '') + '.y'
  ok(L.usuarioDe({ Authorization: 'Bearer ' + jwt }) === 'u-1' && L.usuarioDe({}) === null, 'el usuario sale del token')
  const pl = L.planDeLista([{ simbolo: 'AAA', nombre: 'Aaa' }, { simbolo: 'BBB', nombre: 'Bbb' }, { simbolo: 'AAA' }], [{ id: 'w1', symbol: 'aaa' }, { id: 'w2', symbol: 'ZZZ' }])
  ok(pl.existentes.join() === 'w1' && pl.nuevos.length === 1 && pl.nuevos[0].symbol === 'BBB' && pl.nuevos[0].group_name === 'Screener', 'AAA ya está (se reutiliza); BBB se añade en el grupo «Screener»; sin repetir')
  const pasos = []
  const fl = (opciones = {}) => ({ url: 'https://base', headers: { Authorization: 'Bearer ' + jwt }, fetch: async (u, o = {}) => {
    const m = o.method || 'GET', b = o.body ? JSON.parse(o.body) : null; pasos.push({ u, m, b })
    const r = (status, j) => ({ ok: status < 300, status, json: async () => j })
    if (u.includes('watchlist_lists?select')) return r(200, opciones.listas || [{ id: 'l0', name: 'Degiro' }])
    if (u.includes('watchlist?select')) return r(200, [{ id: 'w1', symbol: 'AAA' }])
    if (u.endsWith('/watchlist_lists') && m === 'POST') return r(201, [{ id: 'l9', name: b.name, user_id: b.user_id }])
    if (u.endsWith('/watchlist') && m === 'POST') return r(201, b.map((x, i) => ({ id: 'n' + i, ...x })))
    if (u.endsWith('/watchlist_list_members')) return opciones.fallaMiembros ? r(500, { message: 'caída' }) : r(201, null)
    if (m === 'DELETE') return r(204, null)
    return r(404, {})
  } })
  const res = await L.guardarComoLista(fl(), { nombre: '  Buenas  hoy ', empresas: [{ simbolo: 'AAA' }, { simbolo: 'BBB', nombre: 'Bbb' }] })
  const crea = pasos.find(p => p.u.endsWith('/watchlist_lists') && p.m === 'POST'), miembros = pasos.find(p => p.u.endsWith('/watchlist_list_members'))
  ok(res.total === 2 && res.nuevos === 1 && crea.b.name === 'Buenas hoy' && crea.b.user_id === 'u-1', 'crea la lista «Buenas hoy» con tu usuario: 2 valores, 1 nuevo')
  ok(miembros.b.map(x => x.watchlist_id).sort().join() === 'n0,w1' && miembros.b.every(x => x.list_id === 'l9'), 'mete en la lista el que ya estaba y el nuevo')
  let e5 = null; try { await L.guardarComoLista(fl(), { nombre: 'degiro', empresas: [{ simbolo: 'AAA' }] }) } catch (e) { e5 = e.message }
  ok(e5 === 'Ya tienes una lista que se llama «degiro». Ponle otro nombre.', 'nombre repetido (sin distinguir mayúsculas): no crea nada')
  pasos.length = 0; let e6 = null
  try { await L.guardarComoLista(fl({ fallaMiembros: true }), { nombre: 'Otra', empresas: [{ simbolo: 'AAA' }] }) } catch (e) { e6 = e.message }
  ok(e6 && e6.includes('caída') && pasos.some(p => p.m === 'DELETE' && p.u.includes('watchlist_lists?id=eq.l9')), 'si falla a mitad, la lista creada se borra')
  let e7 = null; try { await L.guardarComoLista({ ...fl(), headers: {} }, { nombre: 'X', empresas: [{ simbolo: 'AAA' }] }) } catch (e) { e7 = e.message }
  ok(e7 === 'Para guardar listas hay que haber iniciado sesión.', 'sin sesión no se guarda')
  hp = monta({ lista: { nombre: 'Prueba · 10/11/2026', error: null, guardando: false } })
  ok(hp.includes('Guardar los 1 valores que pasan como una lista de la Watchlist') && hp.includes('La lista es FIJA') && hp.includes('value="Prueba · 10/11/2026"'), 'ventana «Guardar como lista» con el nombre propuesto')
  ok(hp.includes('☰ Guardar como lista (1)'), 'botón con cuántos valores')
  const conCuentas = { ...E[0], m: { ...E[0].m, per: 40, crecEsperado: 12 }, piezas: { ebit: 300, activos: 1500, pasivoCorto: 300 }, cuentasHasta: '2025-12-31', precioFecha: '2026-11-06', moneda: 'USD' }
  hp = renderToString(React.createElement(P, { inicial: { empresas: [conCuentas, ...E.slice(1)], vistas: [guardada()], detalle: 'AAA' }, onIrAValor: () => {} })).split('<!-- -->').join('')
  ok(hp.includes('data-cajon="AAA"') && hp.includes('pasa la vista «Prueba»') && hp.includes('data-ir="fundamentals"'), 'cajón de AAA: pasa la vista, con enlaces')
  ok(hp.includes('PER 40,0 ÷ PEG 2,0 = ') && hp.includes('20,0 % al año') && hp.includes('el precio pide más de lo esperado'), 'crecimiento exigido: 40 ÷ 2 = 20 % frente a 12 % esperado → pide más')
  ok(hp.includes('300 M ÷ (1.500 M − 300 M)') && hp.includes('data-cajon-filtro="roce"'), 'cuenta del ROCE con sus cifras')

  // ── Con estado (DOM mínimo): cambiar el nombre, ir a otra pestaña con cambios, cancelar, salir sin guardar, nueva vista ────
  {
    const RDC = require('react-dom/client')
    const A = pestanaDe({ id: 1, nombre: 'Uno', vista: v1 }), Bv = pestanaDe({ id: 2, nombre: 'Dos', vista: vistaNueva() })
    const m = D.monta(React.createElement(P, { inicial: { empresas: E, vistas: [A, Bv] } }), RDC); await D.espera(30)
    const uno = (k, v) => m.raiz.conAtributo(k, v)[0]
    D.escribe(uno('data-nombre-vista'), 'Uno bis'); await D.espera(10)
    ok(m.raiz.conAtributo('data-punto-cambios').length === 1, 'al cambiar el nombre: «●» en la pestaña')
    D.pulsa(uno('data-pestana-vista', 1)); await D.espera(10)
    ok(!!uno('data-pregunta', 'salir'), 'ir a otra pestaña con cambios: pregunta')
    D.pulsa(uno('data-p', 'cancelar')); await D.espera(10)
    ok(!uno('data-pregunta', 'salir') && uno('data-nombre-vista').value === 'Uno bis', 'Cancelar: se queda, con su cambio')
    D.pulsa(uno('data-pestana-vista', 1)); await D.espera(10)
    D.pulsa(uno('data-p', 'salir')); await D.espera(10)
    ok(uno('data-nombre-vista').value === 'Dos' && !m.raiz.conAtributo('data-punto-cambios').length, '«Salir sin guardar»: pasa a «Dos» y «Uno» vuelve a lo guardado')
    D.pulsa(uno('data-nueva-vista')); await D.espera(10)
    D.pulsa(uno('data-nueva', 'cero')); await D.espera(10)
    ok(m.raiz.conAtributo('data-pestana-vista').length === 3 && uno('data-nombre-vista').value === 'Vista nueva' && m.raiz.conAtributo('data-punto-cambios').length === 1, '«+ Nueva vista › Desde cero»: tercera pestaña, sin guardar')
    D.pulsa(uno('data-descartar')); await D.espera(10)
    ok(m.raiz.conAtributo('data-pestana-vista').length === 2, 'descartar una nueva sin guardar la quita')
    const roce = () => uno('data-on', 'roce')
    D.pulsa(uno('data-pestana-vista', 0)); await D.espera(10)
    D.propsDe(roce()).onChange({ target: { checked: false } }); await D.espera(10)
    ok(m.raiz.conAtributo('data-punto-cambios').length === 1 && uno('data-embudo-n', 1).textContent === '3', 'apagar el ROCE: pasan los 3 del universo, con «●»')
    D.pulsa(uno('data-descartar')); await D.espera(10)
    ok(!m.raiz.conAtributo('data-punto-cambios').length && uno('data-embudo-n', 1).textContent === '1', '«Descartar cambios»: vuelve a pasar 1')
    D.pulsa(uno('data-fila', 'AAA')); await D.espera(10)
    ok(!!uno('data-cajon', 'AAA'), 'pulsar una fila abre su cajón')
    D.pulsa(uno('data-cierra-cajon')); await D.espera(10)
    ok(!uno('data-cajon', 'AAA'), '✕ cierra el cajón')
    m.quita()
  }

  // ── V9.1167: las tres columnas de sí o no, ahora números; recomendados; crecimiento exigido; panel ocultable ──────────────
  {
    const { textoCelda } = require('../../components/ScreenerPanel')
    // Cifras de la captura de Sergi (10/11): AAPL, FICO y AAOI.
    const aapl = emp('AAPL', 'Tecnología', { roeFy: 117.9, roe3: 156.1, roeFyAnio: 2026, roe3Anio: 2023, ps: 10.67, psSector: 6.23 }, { piezas: { caja: 56722, deudaCorto: 11903 } })
    const fico = emp('FICO', 'Tecnología', { roeFy: null, roe3: null, ps: 6.52, psSector: 6.23 }, { piezas: { caja: 218, deudaCorto: 338 } })
    const aaoi = emp('AAOI', 'Tecnología', { roeFy: -5.2, roe3: -36.0, ps: 5.91, psSector: 6.23 }, { piezas: { caja: 605, deudaCorto: 60 } })
    const sinDeuda = emp('SND', 'Tecnología', { roeFy: 20, roe3: 16 }, { piezas: { caja: 100, deudaCorto: 0 } })
    ok(cerca(FILTRO.roeMejora.v(aapl), 117.9 - 156.1) && textoCelda(aapl, FILTRO.roeMejora) === '-38,2 pt', `ROE: 117,9 − 156,1 = −38,2 puntos (sale «${textoCelda(aapl, FILTRO.roeMejora)}»)`)
    ok(textoCelda(sinDeuda, FILTRO.roeMejora) === '+4,0 pt', 'ROE: 20 − 16 = +4,0 puntos, con signo')
    ok(FILTRO.roeMejora.v(aaoi) === null && /no es positivo/.test(FILTRO.roeMejora.titulo(aaoi)), 'ROE de ahora negativo (AAOI): no cuenta, y el tooltip dice por qué')
    ok(!pasa(aaoi, FILTRO.roeMejora, { on: true, op: '≥', valor: 0 }) && pasa(sinDeuda, FILTRO.roeMejora, { on: true, op: '≥', valor: 0 }), 'AAOI no pasa «≥ 0 puntos»; +4 sí')
    ok(cerca(FILTRO.cajaCubre.v(aapl), 56722 / 11903) && textoCelda(aapl, FILTRO.cajaCubre) === '4,77', 'caja / deuda a corto: 56.722 ÷ 11.903 = 4,77')
    ok(textoCelda(fico, FILTRO.cajaCubre) === '0,64' && !pasa(fico, FILTRO.cajaCubre, { on: true, op: '≥', valor: 1 }), 'FICO: 218 ÷ 338 = 0,64 → no pasa ≥ 1')
    ok(textoCelda(sinDeuda, FILTRO.cajaCubre) === 'sin deuda a corto' && pasa(sinDeuda, FILTRO.cajaCubre, { on: true, op: '≥', valor: 1 }) && FILTRO.cajaCubre.orden(sinDeuda) === Infinity, 'sin deuda a corto: pasa y se ordena como la mejor')
    ok(textoCelda(aapl, FILTRO.psSector) === '+71,3 %' && textoCelda(fico, FILTRO.psSector) === '+4,7 %' && textoCelda(aaoi, FILTRO.psSector) === '-5,1 %', 'P/S frente al sector: +71,3 % · +4,7 % · −5,1 %')
    ok(FILTRO.cajaCubre.titulo(aapl) === 'Caja 56.722 M frente a deuda a corto 11.903 M' && FILTRO.roeMejora.titulo(aapl) === 'ROE 117,9 % (2026) frente a 156,1 % (2023)', 'el texto de antes pasa al tooltip')
    ok(FILTROS.filter(x => !x.proximamente && x.piso === 'F').every(x => x.ayuda.length === 4 && x.ayuda[3]), 'los 14 filtros llevan «Recomendado»')
    ok(FILTRO.roce.ayuda[3] === '≥ 25 % (30 % = muy exigente).' && FILTRO.cajaCubre.ayuda[3] === '≥ 1 vez (1,5 si quieres margen).', 'recomendados del ROCE y de caja / deuda')
    // Una vista guardada con los filtros viejos (op y valor vacíos) sigue con ellos encendidos, con su valor por defecto.
    const viejaSN = normalizaVista({ tipo: 'vista_screener', version: 1, filtros: { roeMejora: { on: true, op: null, valor: null }, cajaCubre: { on: true, op: '≥', valor: null }, roce: { on: true, op: '≥', valor: 30 } } })
    ok(viejaSN.filtros.roeMejora.on && viejaSN.filtros.roeMejora.op === '≥' && viejaSN.filtros.roeMejora.valor === 0 && viejaSN.filtros.cajaCubre.valor === 1 && viejaSN.filtros.roce.valor === 30 && viejaSN.verExigido === false, 'vista vieja: ROE ≥ 0 puntos y caja ≥ 1, encendidos; ROCE 30 se queda')
    // La pantalla: crecimiento exigido apagado por defecto; encendido, dos columnas y en rojo si el exigido supera al esperado.
    const caro = emp('CARO', 'Tecnología', { roce: 30, per: 40, crecEsperado: 12, pegEsp: 3.33 })
    const v6 = vistaNueva({ on: ['roce'] })
    let h6 = renderToString(React.createElement(P, { inicial: { empresas: [caro], vistas: [pestanaDe({ id: 1, nombre: 'X', vista: v6 })] } })).split('<!-- -->').join('')
    ok(!h6.includes('data-col="exigido"') && !h6.includes('data-peg') && h6.includes('data-ver-exigido'), 'crecimiento exigido apagado: sin columnas ni PEG razonable, con su casilla')
    h6 = renderToString(React.createElement(P, { inicial: { empresas: [caro], vistas: [pestanaDe({ id: 1, nombre: 'X', vista: { ...v6, verExigido: true } })] } })).split('<!-- -->').join('')
    ok(h6.includes('data-col="exigido"') && h6.includes('data-col="esperado"') && h6.includes('data-peg') && h6.includes('20,0 %') && h6.includes('12,0 %'), 'encendido: «Crec. exigido» 40 ÷ 2 = 20 % y «Crec. esperado» 12 %')
    ok(/data-celda="exigido"[^>]*color:#ff8b8b/.test(h6), 'exigido (20 %) mayor que esperado (12 %): en rojo')
    ok(!h6.includes('✓ ') && !h6.includes('✗ ') || h6.includes('data-cajon'), 'la tabla ya no lleva ✓ ni ✗')
    h6 = renderToString(React.createElement(P, { inicial: { empresas: [caro], vistas: [pestanaDe({ id: 1, nombre: 'X', vista: v6 })], panelOculto: true } })).split('<!-- -->').join('')
    ok(h6.includes('data-mostrar-panel') && !h6.includes('data-panel-filtros'), 'panel oculto: solo el botón «▶ Filtros»')
    h6 = renderToString(React.createElement(P, { inicial: { empresas: [caro], vistas: [pestanaDe({ id: 1, nombre: 'X', vista: v6 })] } })).split('<!-- -->').join('')
    ok(h6.includes('data-ocultar-panel') && h6.includes('data-panel-filtros') && h6.includes('width:440px'), 'panel visible, de 440 px, con su botón «◀»')
  }

  // La app deja el screener montado tras la primera visita (como el Builder): al volver de una ficha o un gráfico sigue igual.
  const fuenteIndex = require('fs').readFileSync(require('path').join(__dirname, '..', '..', 'pages', 'index.js'), 'utf8')
  ok(fuenteIndex.includes("{(screenerVisitado||sidePanel==='screener')&&(") && fuenteIndex.includes("<div style={{display:sidePanel==='screener'?'contents':'none'}}>") && fuenteIndex.includes("useEffect(()=>{ if(sidePanel==='screener') setScreenerVisitado(true) },[sidePanel])"), 'el screener sigue montado (oculto) al ir a otra pantalla')

  console.log(`screener: ${fallos ? fallos + ' fallos de ' + n : 'todas bien (' + n + ')'}`)
  process.exit(fallos ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
