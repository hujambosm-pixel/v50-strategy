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
  ok(hp.includes('→ 1 · Fundamentales') && hp.includes('data-embudo-n="1"') && hp.slice(hp.indexOf('data-embudo-n="1"')).startsWith('data-embudo-n="1" style="font-size:15px;font-weight:700;color:var(--sc-titulo)">1<'), 'embudo: pasan Fundamentales 1')
  ok(hp.includes('data-fila="AAA"') && !hp.includes('data-fila="BBB"'), 'tabla: AAA sí, BBB no')
  ok(hp.includes('data-cuenta="roce"') && hp.includes('−2'), 'el ROCE dice «−2»')
  ok(/data-cuenta="roce" title="El número rojo dice cuántos valores[^"]*Ejemplo: Llegan 300 valores/.test(hp) && !hp.includes('cuántos quita cada filtro'), 'la explicación del «−N» va en su tooltip (sin la línea de abajo)')
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
  ok(hp.includes('Con velas diarias, cierre del') && hp.includes('data-opcion="ema200"') && !/data-opcion="ema200"[^>]*disabled/.test(hp) && hp.includes('data-filtro="senal"') && /data-opcion="nivel"[^>]*disabled/.test(hp), 'pestaña Técnico: EMA 200 y «Da señal de compra…» se pueden encender; los niveles aún no')
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
    const roce = () => uno('data-opcion', 'roce')
    D.pulsa(uno('data-pestana-vista', 0)); await D.espera(10)
    D.pulsa(roce()); await D.espera(10); D.pulsa(uno('data-cifra', 'no')); await D.espera(10)
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
    ok(/data-celda="exigido"[^>]*color:var\(--sc-rojo\)/.test(h6), 'exigido (20 %) mayor que esperado (12 %): en rojo')
    ok(!h6.includes('✓ ') && !h6.includes('✗ ') || h6.includes('data-cajon'), 'la tabla ya no lleva ✓ ni ✗')
    h6 = renderToString(React.createElement(P, { inicial: { empresas: [caro], vistas: [pestanaDe({ id: 1, nombre: 'X', vista: v6 })], panelOculto: true } })).split('<!-- -->').join('')
    ok(h6.includes('data-mostrar-panel') && !h6.includes('data-panel-filtros') && h6.includes('data-resumen-filtros') && h6.includes('data-encendido="roce"') && h6.includes('Filtros ▼'), 'filtros ocultos: una línea con los encendidos y «Filtros ▼»')
    h6 = renderToString(React.createElement(P, { inicial: { empresas: [caro], vistas: [pestanaDe({ id: 1, nombre: 'X', vista: v6 })] } })).split('<!-- -->').join('')
    ok(h6.includes('data-ocultar-panel') && h6.includes('data-panel-filtros') && h6.includes('data-rejilla') && h6.includes('Filtros ▲') && !h6.includes('width:440px'), 'filtros arriba, en rejilla, con «Filtros ▲» (sin el panel de 440 px)')
  }

  // ── Parte 2 · Técnico (lib/screener/tecnico.js, datos.js, filtros.js y la pantalla) ─────────────────────────────────────
  {
    const T = require('../../lib/screener/tecnico')
    const { conTecnico, fechaTecnico } = require('../../lib/screener/datos')
    // 300 velas: cierre 100 (alto 101, volumen 1.000) salvo la vela 100 con alto 130 y la última con cierre 110 y volumen 3.000.
    const dia = (i) => new Date(Date.UTC(2025, 0, 1) + i * 86400000).toISOString().slice(0, 10)
    const velas = Array.from({ length: 300 }, (_, i) => ({ date: dia(i), open: 100, high: i === 100 ? 130 : 101, low: 99, close: i === 299 ? 110 : 100, volume: i === 299 ? 3000 : 1000 }))
    const t = T.tecnicoDe(velas)
    ok(t.fecha === dia(299) && t.cierre === 110 && t.velas === 300, 'técnico: la última vela (cierre 110), 300 velas')
    ok(cerca(t.ema200, 100 + 10 * 2 / 201), `EMA 200 de 299 cierres de 100 y uno de 110 = 100 + 10 × 2 ÷ 201 = 100,0995 (sale ${t.ema200})`)
    ok(t.max52 === 130, 'máximo de 52 semanas: la vela 100 (130) está dentro de las últimas 252 (48–299)')
    ok(cerca(t.ema50, 100 + 10 * 2 / 51) && cerca(t.ema20, 100 + 10 * 2 / 21), `§16: EMA 50 = 100 + 10 × 2 ÷ 51 = 100,3922; EMA 20 = 100 + 10 × 2 ÷ 21 = 100,9524 (salen ${t.ema50}, ${t.ema20})`)
    ok(t.volMedio50 === 1000 && t.volUlt === 3000 && t.cierre3m === 100, 'volumen medio de las 50 anteriores 1.000; último 3.000; cierre de hace 63 velas 100')
    const c = T.cifrasTecnicas(t)
    ok(cerca(c.emaDist, (110 / (100 + 20 / 201) - 1) * 100) && cerca(c.emaDist, 9.8907, 1e-4), `precio frente a la EMA 200: 110 ÷ 100,0995 − 1 = +9,89 % (sale ${c.emaDist})`)
    ok(cerca(c.dist52, 20 / 130 * 100), 'distancia al máximo: (130 − 110) ÷ 130 = 15,38 %')
    ok(cerca(c.ema20Dist, 8.9623, 1e-4) && cerca(c.ema50Dist, (110 / (100 + 20 / 51) - 1) * 100), `§16: precio frente a la EMA 20: 110 ÷ 100,9524 − 1 = +8,96 % (sale ${c.ema20Dist}); frente a la EMA 50, +9,57 %`)
    ok(T.tecnicoDe(velas.slice(260)).ema20 != null && T.tecnicoDe(velas.slice(260)).ema50 === null && T.tecnicoDe(velas.slice(285)).ema20 === null, '§16: con 40 velas hay EMA 20 pero no EMA 50; con 15, ninguna')
    ok(T.cifrasTecnicas({ fecha: 'F', cierre: 100, ema200: 90 }).ema50Dist === null, '§16: un técnico guardado antes (sin EMA 50 ni 20): sin dato, no pasa')
    ok(FILTROS.filter(f => f.piso === 'T').map(f => f.id).slice(0, 3).join() === 'ema200,ema50,ema20' && FILTRO.ema20.ayuda[3] && FILTRO.ema50.fuente === 'precios', '§16: orden EMA 200, 50, 20 en el piso Técnico, con su «Recomendado»')
    ok(require('../../lib/screener/opciones').opcionesDe(FILTRO.ema50)[0].texto === 'Por encima' && vistaNueva().filtros.ema20.on === false && normalizaVista({ filtros: { roce: { on: true, op: '≥', valor: 25 } } }).filtros.ema50.on === false, '§16: desplegable con palabras; en las vistas viejas aparecen apagados')
    ok(c.rvol === 3 && cerca(c.var3m, 10), 'volumen relativo 3.000 ÷ 1.000 = 3; variación en 3 meses 110 ÷ 100 − 1 = 10 %')
    const corto = T.tecnicoDe(velas.slice(150))
    ok(corto.ema200 === null && corto.max52 === null && corto.cierre3m === 100 && corto.velas === 150, 'con 150 velas: sin EMA 200 ni máximo de 52 semanas; sí 3 meses')
    ok(T.tecnicoDe([]) === null && T.tecnicoDe([{ date: dia(0), close: null }]) === null, 'sin velas válidas: null')
    ok(T.REFERENCIAS_TECNICO.length === 12 && T.REFERENCIAS_TECNICO[0] === 'SPY' && T.ETF_SECTOR['Tecnología'] === 'XLK', 'SPY y los 11 ETF de sectores')
    const ref = { SPY: { fecha: 'F', cierre: 105, cierre3m: 100 }, XLK: { fecha: 'F', cierre: 108, cierre3m: 100 }, XLV: { fecha: 'G', cierre: 120, cierre3m: 100 } }
    ok(cerca(T.fuerzaSector('Tecnología', ref), 3), 'sector: XLK +8 % − SPY +5 % = +3 puntos')
    ok(T.fuerzaSector('Salud', ref) === null && T.fuerzaSector('Otros', ref) === null && T.fuerzaSector('Industria', ref) === null, 'sector: fechas distintas, «Otros» o sin su ETF → sin dato')
    // La pantalla: AAA por encima de su EMA 200 (105 frente a 100), BBB por debajo (95).
    const tec = (cierre) => ({ fecha: '2026-11-09', cierre, ema200: 100, max52: 110, volUlt: 1500, volMedio50: 1000, cierre3m: 100, velas: 1260 })
    const E2 = [{ ...E[0], tecnico: tec(105) }, { ...E[1], tecnico: tec(95) }, E[2], E[3]]
    ok(fechaTecnico(E2) === '2026-11-09' && cerca(conTecnico(E2, ref)[0].t.sector, 3) && conTecnico(E2, ref)[3].t.emaDist === null, 'conTecnico: cifras y sector; sin técnico, null')
    const v7 = vistaNueva({ on: ['ema200'], sectoresFuera: [] })
    const r7 = evaluaVista(conTecnico(E2, ref), v7)
    ok(r7.f1.length === 4 && r7.f2.map(e => e.simbolo).join() === 'AAA' && r7.cuantos.ema200 === 3, 'EMA 200 ≥ 0 %: pasa AAA; quita 3 (BBB por debajo; CCC y DDD sin precios)')
    const refSpy = { SPY: { fecha: '2026-11-09', cierre: 105, ema200: 100, cierre3m: 100 } }
    const h7 = renderToString(React.createElement(P, { inicial: { empresas: E2, refs: refSpy, vistas: [pestanaDe({ id: 1, nombre: 'T', vista: v7 })], verNo: true } })).split('<!-- -->').join('')
    ok(h7.includes('por encima de su EMA 200 ✓ (+5,0 %)') && h7.includes('Precios: cierre del 09/11/2026 · 2 sin precios'), 'línea del mercado (+5,0 %) y de los precios')
    ok(h7.includes('+5,0 %') && h7.includes('-5,0 %') && h7.includes('data-actualizar'), 'celdas de la EMA 200 (+5,0 y −5,0) y botón «Actualizar precios»')
    ok(VISTAS_EJEMPLO[0].vista.filtros.ema200.on === true && VISTAS_EJEMPLO[0].vista.filtros.ema200.valor === 0, '«Rentabilidad y poca deuda» lleva la EMA 200 (≥ 0 %)')
    const h8 = renderToString(React.createElement(P, { inicial: { empresas: E2, refs: refSpy, vistas: [pestanaDe({ id: 1, nombre: 'T', vista: v7 })], detalle: 'AAA' } })).split('<!-- -->').join('')
    ok(h8.includes('data-cajon-tecnico') && h8.includes('105,00 ÷ 100,00 − 1') && h8.includes('técnico con el cierre del 09/11/2026'), 'cajón: piso técnico con su cuenta y su fecha')
    // «Actualizar precios» con una descarga falsa: DDD sin precios; AAA baja a 90 (por debajo); el SPY pasa a estar por debajo.
    const RDC = require('react-dom/client')
    const pedidas = []
    const falsa = async (simbolos) => { pedidas.push(simbolos); return { resultados: simbolos.map(s => s === 'DDD' ? { simbolo: s, tecnico: null, error: 'sin velas' } : { simbolo: s, tecnico: s === 'SPY' ? { ...tec(95), fecha: '2026-11-10' } : { ...tec(s === 'AAA' ? 90 : 101), fecha: '2026-11-10' } }) } }
    const m = D.monta(React.createElement(P, { inicial: { empresas: E2, refs: refSpy, vistas: [pestanaDe({ id: 1, nombre: 'T', vista: v7 })] }, pideTecnico: falsa }), RDC); await D.espera(30)
    const uno = (k, v) => m.raiz.conAtributo(k, v)[0]
    D.pulsa(uno('data-actualizar')); await D.espera(60)
    ok(pedidas.length === 2 && pedidas.flat().length === 16 && pedidas[0].slice(0, 2).join() === 'SPY,XLK', `se pide en tandas de 10: primero SPY y los ETF, luego las 4 empresas (16; sale ${pedidas.flat().length})`)
    ok(uno('data-act-fin') && uno('data-act-fin').textContent.includes('✓ Hecho · 1 sin precios'), '«✓ Hecho · 1 sin precios» (DDD)')
    ok(uno('data-mercado').textContent.includes('por debajo de su EMA 200 ✗ (-5,0 %)') && uno('data-embudo-n', 2).textContent === '2', 'tras actualizar: SPY por debajo; AAA (90) ya no pasa y sí BBB y CCC (101)')
    m.quita()
  }

  // ── Parte 2 · «Da señal de compra con…» (fase 2b, §11; el cálculo, en screener-senales.js) ─────────────────────────────────
  {
    const { estrategiasSenal, claveSenal } = require('../../components/ScreenerPanel')
    const DEF = { tipo: 'editor', formato: 1, motor: 1, nombre: 'x', parametros: { version: 1, lista: [] },
      entrada: { senal: { c: 'nuevoMaximo', p: { n: 2 } }, orden: { tipo: 'apertura' } }, stops: [], salidas: [{ tipo: 'tope', velas: 3, motivo: 'tiempo' }] }
    const ESTR = [{ id: 5, name: 'Cruce de medias 50/200', definition: DEF, params: '{}' }, { id: 6, name: 'Semanal', definition: DEF, params: { intervalo: 'semanal' } },
      { id: 7, name: 'De código', definition: null, code_js: 'x', params: {} }]
    const es = estrategiasSenal(ESTR)
    ok(es.length === 1 && es[0].id === 5 && es[0].name === 'Cruce de medias 50/200' && claveSenal(es[0]).startsWith('5|') && claveSenal(null) === null, 'solo las de tarjetas y de velas diarias (1 de 3)')
    // Vistas: el id de la estrategia se guarda; una vista vieja (sin «senal») lo completa con null.
    const v9 = vistaNueva({ on: ['senal'], valores: { senal: 3 }, sectoresFuera: [] }); v9.filtros.senal.estrategia = '5'
    ok(normalizaVista(v9).filtros.senal.estrategia === '5' && normalizaVista({ filtros: { roce: { on: true } } }).filtros.senal.estrategia === null, 'la vista guarda la estrategia (las viejas, null)')
    ok(textoVista(v9) === textoVista(JSON.parse(JSON.stringify(v9))) && textoVista(v9) !== textoVista({ ...v9, filtros: { ...v9.filtros, senal: { ...v9.filtros.senal, estrategia: '6' } } }), 'cambiar la estrategia cuenta como cambio sin guardar')
    // Filtro: AAA señal en la última, BBB hace 2 (compró a 12,5 en el nivel), CCC hace 5, DDD sin calcular.
    const sen = (hace, extra = {}) => ({ hace, fecha: '2026-11-0' + (9 - (hace || 0)), tipo: 'cierre', precio: null, ultima: '2026-11-09', velas: 1260, ...extra })
    const E9 = [{ ...E[0], senal: sen(0) }, { ...E[1], senal: sen(2, { tipo: 'nivel', precio: 12.5 }) }, { ...E[2], senal: sen(5) }, { ...E[3], senal: null, senalError: 'sin velas' }]
    let r9 = evaluaVista(E9, v9)
    ok(r9.f2.map(e => e.simbolo).join() === 'AAA,BBB' && r9.cuantos.senal === 2, 'en las últimas 3 velas: pasan AAA (la última) y BBB (hace 2); quita 2 (CCC hace 5; DDD sin calcular)')
    r9 = evaluaVista(E9, { ...v9, filtros: { ...v9.filtros, senal: { ...v9.filtros.senal, valor: 1 } } })
    ok(r9.f2.map(e => e.simbolo).join() === 'AAA', 'en la última vela (N = 1): solo AAA')
    r9 = evaluaVista(E9, { ...v9, filtros: { ...v9.filtros, senal: { ...v9.filtros.senal, estrategia: null } } })
    ok(r9.f2.length === 4 && !r9.cuantos.senal, 'sin estrategia elegida, el filtro no quita nada')
    ok(FILTRO.senal.titulo(E9[1]).includes('Compró el 07/11/2026 a 12,50') && FILTRO.senal.titulo(E9[3]).includes('No se ha podido calcular: sin velas') && FILTRO.senal.formula(E9[1]) === 'hace 2 velas · compró a 12,50', 'tooltip y cuenta del cajón')
    ok(FILTRO.senal.ayuda[3] && FILTRO.senal.ayuda[2].includes('Cruce de medias 50/200'), '«?» con ejemplo inventado y recomendado')
    // La pantalla con estado: la estrategia elegida y una petición falsa. Se pide solo para los 4 que pasan los fundamentales.
    const RDC = require('react-dom/client')
    const pedidas = []
    const falsa = async (est, simbolos) => { pedidas.push({ est, simbolos }); return { resultados: simbolos.map(s => {
      const x = E9.find(e => e.simbolo === s); return x.senal ? { simbolo: s, senal: x.senal } : { simbolo: s, senal: null, error: 'sin velas' } }) } }
    const m = D.monta(React.createElement(P, { inicial: { empresas: E, vistas: [pestanaDe({ id: 1, nombre: 'S', vista: v9 })], piso: 'T' }, estrategias: ESTR, pideSenales: falsa }), RDC)
    await D.espera(700)
    const uno = (k, v) => m.raiz.conAtributo(k, v)[0]
    ok(pedidas.length === 1 && pedidas[0].simbolos.join() === 'AAA,BBB,CCC,DDD' && JSON.stringify(pedidas[0].est.definition) === JSON.stringify(DEF) && Object.keys(pedidas[0].est).join() === 'definition,params', `se piden los 4 que pasan los fundamentales, con la regla (${pedidas.length} peticiones)`)
    ok(uno('data-senal-estado')?.textContent === 'Calculado para 4 · última vela del 09/11/2026 · 1 sin calcular', `estado: «${uno('data-senal-estado')?.textContent}»`)
    ok(uno('data-embudo-n', 2)?.textContent === '2' && uno('data-cuenta', 'senal')?.textContent === '−2', 'pasan 2; el filtro quita 2')
    const celdas = m.raiz.conAtributo('data-celda', 'senal').map(n => n.textContent).join('|')
    ok(celdas === 'la última|hace 2 velas', `celdas: ${celdas}`)
    ok(m.raiz.conAtributo('data-estrategia-senal')[0] && m.raiz.conAtributo('data-col', 'senal')[0]?.textContent.startsWith('Señal de compra'), 'selector de estrategia y columna «Señal de compra»')
    await D.espera(700)
    ok(pedidas.length === 1, 'no se vuelve a pedir lo ya calculado')
    m.quita()
  }

  // ── §13 · Vista ↔ tesis: «💡 …» junto al nombre y abrir una vista por su id ──────────────────────────────────────────────
  {
    const tesisE = [{ id: 31, titulo: 'Empresas con poca deuda', relacionados: [{ tipo: 'vista', id: '7' }], revisada_en: '2026-11-01' },
      { id: 32, titulo: 'Otra', relacionados: [{ tipo: 'plan', id: '7' }], revisada_en: '2026-11-02' }]
    let h = renderToString(React.createElement(P, { inicial: { empresas: E, vistas: [guardada()], tesis: tesisE }, onAbrirTesis: () => {} })).split('<!-- -->').join('')
    ok(h.includes('data-enlace-tesis="31"') && h.includes('💡 Empresas con poca deuda ›') && !h.includes('data-enlace-tesis="32"'), 'la vista 7 enseña su tesis (y no la del plan 7)')
    h = renderToString(React.createElement(P, { inicial: { empresas: E, vistas: [pestanaDe({ nombre: 'Sin guardar', vista: v1 })], tesis: tesisE } })).split('<!-- -->').join('')
    ok(!h.includes('data-enlace-tesis'), 'una vista sin guardar no tiene tesis')
    const RDC = require('react-dom/client')
    const dos = [pestanaDe({ id: 7, nombre: 'Siete', vista: v1 }), pestanaDe({ id: 8, nombre: 'Ocho', vista: v1 })]
    let abiertas = 0
    const m = D.monta(React.createElement(P, { inicial: { empresas: E, vistas: dos, tesis: [] }, abrirVista: { id: 8, n: 1 }, onVistaAbierta: () => { abiertas++ } }), RDC)
    await D.espera(40)
    ok(m.raiz.conAtributo('data-nombre-vista')[0]?.value === 'Ocho' && abiertas === 1, `abrir la vista 8 desde una tesis: se ve «Ocho» (${m.raiz.conAtributo('data-nombre-vista')[0]?.value})`)
    m.quita()
    const m2 = D.monta(React.createElement(P, { inicial: { empresas: E, vistas: dos, tesis: [] }, abrirVista: { id: 99, n: 2 }, onVistaAbierta: () => {} }), RDC)
    await D.espera(40)
    ok(m2.raiz.conAtributo('data-aviso-vista')[0]?.textContent.includes('ya no existe') && m2.raiz.conAtributo('data-nombre-vista')[0]?.value === 'Siete', 'una vista borrada: lo dice y se queda en la que estaba')
    m2.quita()
    // Con cambios sin guardar en la vista de ahora, la ventana de siempre antes de cambiar.
    const m3 = D.monta(React.createElement(P, { inicial: { empresas: E, vistas: [{ ...dos[0], nombre: 'Siete cambiada' }, dos[1]], tesis: [] }, abrirVista: { id: 8, n: 3 }, onVistaAbierta: () => {} }), RDC)
    await D.espera(40)
    ok(m3.raiz.conAtributo('data-p', 'salir')[0] && m3.raiz.conAtributo('data-nombre-vista')[0]?.value === 'Siete cambiada', 'con cambios sin guardar, pregunta antes de abrir la otra')
    m3.quita()
  }

  // La app deja el screener montado tras la primera visita (como el Builder): al volver de una ficha o un gráfico sigue igual.
  const fuenteIndex = require('fs').readFileSync(require('path').join(__dirname, '..', '..', 'pages', 'index.js'), 'utf8')
  ok(fuenteIndex.includes("{(screenerVisitado||sidePanel==='screener')&&(") && fuenteIndex.includes("<div style={{display:sidePanel==='screener'?'contents':'none'}}>") && fuenteIndex.includes("useEffect(()=>{ if(sidePanel==='screener') setScreenerVisitado(true) },[sidePanel])"), 'el screener sigue montado (oculto) al ir a otra pantalla')

  // §14: los dos tonos (lib/screener/colores.js) y el botón de la barra de arriba.
  {
    const { varsTema, TEMAS, CSS_TABLA } = require('../../lib/screener/colores')
    const o = monta({}), c = renderToString(React.createElement(P, { tema: 'claro', inicial: { empresas: E, vistas: [guardada()] } })).split('<!-- -->').join('')
    ok(o.includes('data-tema="oscuro"') && o.includes('--sc-fondo:#22262f') && o.includes('--sc-rayado:#2c303b'), 'tono oscuro por defecto: el estilo Finviz (fondo 34,38,47; filas 44,48,59)')
    ok(c.includes('data-tema="claro"') && c.includes('--sc-fondo:#d6d2c8') && c.includes('--sc-texto:#33302b'), 'tono claro: papel gris')
    ok(Object.keys(TEMAS.oscuro).join() === Object.keys(TEMAS.claro).join() && varsTema('raro')['--sc-fondo'] === '#22262f', 'los dos tonos tienen las mismas cifras; uno desconocido = oscuro')
    ok(o.includes(CSS_TABLA.split('&').join('&amp;').split('>').join('&gt;')) || o.includes(CSS_TABLA), 'filas alternas y la fila entera resaltada al pasar el ratón')
    ok(!/#0d1117|#13283f|#1b2836|#3a3220/.test(o), 'la pantalla ya no lleva los colores fijos de antes')
    const fi = require('fs').readFileSync(require('path').join(__dirname, '..', '..', 'pages', 'index.js'), 'utf8')
    ok(fi.includes('<button data-tema-app onClick={alternaTema}') && fi.includes("{temaApp==='claro'?'☾ Oscuro':'☀ Claro'}") && fi.includes('<ScreenerPanel tema={temaApp}') && fi.includes("localStorage.setItem('app.tema',n)"), 'botón «☀ Claro / ☾ Oscuro» en la barra de arriba, recordado, y el screener lo recibe')
  }

  // §15: los filtros ARRIBA, como Finviz (cifras fijas, rejilla de 5 columnas, vistas en una línea).
  {
    const O = require('../../lib/screener/opciones')
    const { VISTAS_EJEMPLO: VE } = require('../../lib/screener/vista')
    ok(O.opcionesDe(FILTRO.roce).map(o => o.texto).join(' | ') === '≥ 10 % | ≥ 15 % | ≥ 20 % | ≥ 25 % | ≥ 30 % | ≥ 40 % | ≤ 10 % | ≤ 20 %', 'ROCE: cifras fijas (las de siempre y dos al revés)')
    ok(O.opcionesDe(FILTRO.ema200).map(o => o.texto).join(' | ') === 'Por encima | 5 % o más por encima | 10 % o más por encima | 20 % o más por encima | Por debajo | 5 % o más por debajo | 10 % o más por debajo' && O.opcionesDe(FILTRO.ema200)[5].op === '≤' && O.opcionesDe(FILTRO.ema200)[5].valor === -5, 'EMA 200 con palabras y ordenadas: primero por encima (0, 5, 10, 20) y luego por debajo')
    ok(O.textoEma('≥', -5) === 'Por encima o hasta 5 % por debajo' && O.textoEma('≤', 2.5) === 'Por debajo o hasta 2,5 % por encima', '§17: EMA con cifras al revés: «Por encima o hasta 5 % por debajo»…')
    ok(O.fmtFija(0.25) === '0,25' && O.fmtFija(1.5) === '1,5' && O.fmtFija(-1000) === '-1.000' && O.textoCondicion(FILTRO.cajaCubre, '≥', 1.5) === '≥ 1,5 veces' && O.textoCondicion(FILTRO.senal, '≤', 1) === '1 vela', 'textos: 0,25 · 1,5 · −1.000 · «≥ 1,5 veces» · «1 vela»')
    ok(O.opcionElegida(FILTRO.roce, { on: true, op: '≥', valor: 25 }) === 3 && O.opcionElegida(FILTRO.roce, { on: true, op: '≥', valor: 27 }) === -1 && O.opcionElegida(FILTRO.roce, { on: false, op: '≥', valor: 25 }) === -1, 'ROCE ≥ 25 es la 4.ª; ≥ 27 es «tuya»; apagado, ninguna')
    ok(O.textoEncendido(FILTRO.roce, { on: true, op: '≥', valor: 27 }) === '≥ 27 %' && O.textoEncendido(FILTRO.ema200, { on: true, op: '≥', valor: 0 }) === 'Por encima', 'texto de un encendido: «≥ 27 %», «Por encima»')
    ok(FILTROS.filter(f => !f.proximamente && !f.conEstrategia).every(f => O.opcionElegida(f, { on: true, op: f.op, valor: f.valor }) >= 0), 'la cifra por defecto de cada filtro está en su desplegable')
    ok(VE.every(v => Object.entries(v.vista.filtros).filter(([, c]) => c.on).every(([id, c]) => O.opcionElegida(FILTRO[id], c) >= 0)), 'las vistas de ejemplo usan solo cifras fijas (PER ≥ 30, PEG esperado ≥ 3…)')
    const v15 = vistaNueva({ on: ['roce', 'ema200'], valores: { roce: 27 } })
    const monta15 = (extra) => renderToString(React.createElement(P, { inicial: { empresas: E, vistas: [pestanaDe({ id: 3, nombre: 'Q', vista: v15 })], ...extra } })).split('<!-- -->').join('')
    let h = monta15({})
    ok(/data-opcion="roce"[^>]*><span[^>]*>≥ 27 %<\/span>/.test(h) && !h.includes('Otra cifra'), '§17: ROCE ≥ 27: la caja dice «≥ 27 %», sin «Otra cifra…»')
    const ha = monta15({ abierto: 'roce' })
    ok(ha.includes('data-lista-cifras="roce"') && ha.includes('≥ 27 % · no está en tu lista') && ha.includes('data-anadir-elegida') && (ha.match(/data-editar="/g) || []).length === 8 && (ha.match(/data-quitar-cifra="/g) || []).length === 8 && ha.includes('data-nueva-cifra') && ha.includes('data-fabrica'), '§17: abierto: «Cualquiera», «≥ 27 % · no está en tu lista» con ＋, 8 cifras con ✎ y papelera, «+ Añadir cifra» y «↺ Las de fábrica»')
    ok(monta15({ abierto: 'roce', cifras: { roce: [['≥', 30], ['≥', 27], ['x', 1], ['≥', 'n']] } }).match(/data-cifra="\d+"/g).length === 2 && !monta15({ abierto: 'roce', cifras: { roce: [['≥', 27]] } }).includes('no está en tu lista'), '§17: con tus cifras (las raras se ignoran), ≥ 27 ya está en tu lista')
    // Lógica pura: ordenar, añadir sin repetir, quitar, cambiar.
    const lr = O.cifrasDe(FILTRO.roce, {})
    ok(O.conCifra(FILTRO.roce, lr, '≥', 12).map(x => x.join('')).slice(0, 3).join() === '≥10,≥12,≥15' && O.conCifra(FILTRO.roce, lr, '≥', 25).length === 8, '§17: añadir ≥ 12 se coloca entre 10 y 15; añadir una que ya está no la repite')
    ok(O.cambiaCifra(FILTRO.roce, lr, 0, '≥', 45).map(x => x.join('')).join() === '≥15,≥20,≥25,≥30,≥40,≥45,≤10,≤20' && O.sinCifra(FILTRO.roce, lr, 6).length === 7, '§17: cambiar 10 → 45 se reordena sola (detrás de 40); quitar una deja 7')
    ok(O.cambiaCifra(FILTRO.ema50, O.cifrasDe(FILTRO.ema50, {}), 1, '≤', -2).map(x => x.join('')).join() === '≥0,≥10,≥20,≤0,≤-2,≤-5,≤-10', '§17: en las EMA, ≤ −2 va entre «Por debajo» y «5 % o más por debajo»')
    ok(h.includes('data-cuantos-pestana="F"') && /data-cuantos-pestana="F"[^>]*>1</.test(h) && /data-cuantos-pestana="T"[^>]*>1</.test(h) && /data-cuantos-pestana="todos"[^>]*>7</.test(h) && /data-cuantos-pestana="U"[^>]*>5</.test(h), 'pestañas con cuántos encendidos: F 1, T 1, sectores 5, todos 7')
    const nF = FILTROS.filter(f => f.piso === 'F').length
    ok(h.includes(`grid-template-rows:repeat(${Math.ceil(nF / 5)}, auto)`) && h.includes('grid-auto-flow:column') && !h.includes('data-filtro="ema200"') && !h.includes('data-universo-sectores'), `rejilla de 5 columnas (${nF} filtros → ${Math.ceil(nF / 5)} filas), solo los de Fundamentales`)
    h = monta15({ piso: 'todos' })
    ok(h.includes('data-universo-sectores') && h.includes('data-filtro="roce"') && h.includes('data-filtro="ema200"') && h.includes('data-sector="Energía"') && h.includes('data-universo="sp500"'), '«Todos»: universo, sectores y todos los filtros')
    {
      const hs = monta15({ piso: 'U' })
      const casillas = hs.match(/data-sector="[^"]+"/g) || []
      ok(casillas.length === 11 && /data-sector="Tecnología" data-dentro="1"[^>]*>.*?checked=""[^>]*\/>Tecnología <span[^>]*>1<\/span>/.test(hs) && /data-sector="Financieras" data-dentro="0" title="Recomendado: quitarlo\. Bancos y aseguradoras/.test(hs) && /data-sector="Financieras"[^>]*opacity:0.45/.test(hs) && !/data-sector="Financieras"[^>]*text-decoration/.test(hs), '§19: los 11 sectores; Tecnología marcada (1 empresa), Financieras desmarcada, en gris sin tachar y con su motivo')
      ok(!/data-sector="Financieras"[^>]*>[^]*?<input type="checkbox" checked=""/.test(hs.slice(hs.indexOf('data-sector="Financieras"'), hs.indexOf('data-sector="Financieras"') + 600)), '§19: la casilla de Financieras, sin marcar')
      ok(/\[data-screener\] select option\{background:var\(--sc-tarjeta\)/.test(require('../../lib/screener/colores').CSS_TABLA), '§19: las listas de los desplegables del navegador, con el tono del screener')
    }
    h = monta15({ piso: 'U' })
    ok(h.includes('data-universo-sectores') && !h.includes('data-rejilla'), '«Universo y sectores»: sin la rejilla')
    ok(/data-mercado[^>]*title="Informativo: no es un filtro\./.test(h) && h.includes('data-embudo') && h.includes('data-actualizar') && h.includes('Cuentas de la SEC (EDGAR) del'), 'en la línea de los filtros: el mercado (informativo), los precios y el embudo; la fecha de las cuentas, al pie')
    ok(/data-nombre-vista[^>]*readonly=""/.test(h) && h.includes('data-editar-nombre') && /data-vistas[\s\S]*data-guardar-lista[\s\S]*data-descartar[\s\S]*data-guardar=/.test(h) && h.indexOf('data-bloque-filtros') > h.indexOf('data-guardar='), 'vistas en una línea: nombre (con ✎), y a la derecha lista, descartar y guardar')
    {
      const hx = monta15({})
      ok(/data-explica-embudo="1" title="Llegan 3 y pasan 1: 2 no pasan algún filtro de Fundamentales\. Lo que quita cada uno \(mirándolo solo a él; uno puede fallar varios\): ROCE −2\."/.test(hx), '§18: tooltip del embudo: llegan 3, pasan 1 (ROCE ≥ 27: AAA 30), el ROCE quita 2')
      ok(/data-explica-embudo="0" title="Universo elegido \(S&amp;P 500 \+ Nasdaq-100 \+ tus listas\): 4 empresas; se quitan 1 de los sectores quitados → quedan 3\./.test(hx) && /data-explica-embudo="2" title="Llegan 1 y pasan [01]: /.test(hx), '§18: tooltip del universo (4, sin 1 de sectores → 3) y del técnico')
      ok(hx.includes('color-scheme:dark') && monta15({}).length > 0 && renderToString(React.createElement(P, { tema: 'claro', inicial: { empresas: E, vistas: [guardada()] } })).includes('color-scheme:light'), '§18: los desplegables del navegador siguen el tono (oscuro / claro)')
    }
    ok(monta15({}).includes('data-recomendado-filtro="roce" title="Recomendado: ≥ 25 % (30 % = muy exigente). Pulsa para ver qué es."'), 'al pasar el ratón por el nombre: la cifra recomendada')
    // El «?» de siempre no cambia; con contenido, el nombre hace de botón.
    const Ay = require('../../components/BuilderAyuda').default
    ok(renderToString(React.createElement(Ay, { texto: 'x', etiqueta: 'E' })).includes('>?</button>') && renderToString(React.createElement(Ay, { texto: 'x', contenido: 'ROCE', soloClic: true })).includes('>ROCE</button>'), 'el «?»: igual que antes; con «contenido», el nombre del filtro')
    // Con estado: cambiar, elegir, quitar, añadir y «Las de fábrica»; ocultar y quitar; el nombre.
    const RDC = require('react-dom/client')
    const guardadas = []
    const m = D.monta(React.createElement(P, { guardaCifras: (n) => guardadas.push(JSON.parse(JSON.stringify(n))), inicial: { empresas: E, vistas: [pestanaDe({ id: 3, nombre: 'Q', vista: vistaNueva({ on: ['roce'] }) })] } }), RDC); await D.espera(30)
    const uno = (k, v) => m.raiz.conAtributo(k, v)[0]
    const textos = () => m.raiz.conAtributo('data-cifra').filter(x => x.getAttribute('data-cifra') !== 'no').map(x => x.textContent.replace(/[✎]/g, '').trim())
    D.pulsa(uno('data-opcion', 'roce')); await D.espera(10)
    ok(!!uno('data-lista-cifras', 'roce') && textos().length === 8, '§17: pulsar la caja abre la lista (8 cifras)')
    D.pulsa(uno('data-editar', '3')); await D.espera(10)
    ok(uno('data-edita-valor')?.value === '25', '✎ sobre «≥ 25 %»: la caja de editar con 25')
    D.escribe(uno('data-edita-valor'), '45'); await D.espera(10); D.pulsa(uno('data-edita-ok')); await D.espera(10)
    ok(textos().join(' | ') === '≥ 10 % | ≥ 15 % | ≥ 20 % | ≥ 30 % | ≥ 40 % | ≥ 45 % | ≤ 10 % | ≤ 20 %' && uno('data-embudo-n', 1).textContent === '0' && uno('data-opcion', 'roce').textContent.includes('≥ 45 %'), '§17: 25 → 45: se ordena sola (detrás de 40) y, como era la elegida, el filtro pasa a ≥ 45 (no pasa ninguno)')
    ok(guardadas.length === 1 && guardadas[0].roce.map(x => x.join('')).join() === '≥10,≥15,≥20,≥30,≥40,≥45,≤10,≤20', '§17: se guarda en tus ajustes (screenerCifras.roce)')
    D.pulsa(uno('data-cifra', '1')); await D.espera(10)
    ok(!uno('data-lista-cifras', 'roce') && uno('data-embudo-n', 1).textContent === '2' && m.raiz.conAtributo('data-punto-cambios').length === 1, 'elegir «≥ 15 %»: se cierra y pasan 2 (AAA 30, BBB 20), con «●»')
    D.pulsa(uno('data-opcion', 'roce')); await D.espera(10); D.pulsa(uno('data-quitar-cifra', '1')); await D.espera(10)
    ok(!textos().includes('≥ 15 %') && !!uno('data-fuera-lista') && uno('data-embudo-n', 1).textContent === '2', '§17: quitar «≥ 15 %» (la elegida): sale «no está en tu lista» y el filtro sigue igual')
    D.pulsa(uno('data-nueva-cifra')); await D.espera(10); D.escribe(uno('data-edita-valor'), '12'); await D.espera(10); D.pulsa(uno('data-edita-ok')); await D.espera(10)
    ok(textos().slice(0, 3).join(' | ') === '≥ 10 % | ≥ 12 % | ≥ 20 %', '§17: «+ Añadir cifra» 12: se coloca entre 10 y 20')
    D.pulsa(uno('data-fabrica')); await D.espera(10)
    ok(textos().length === 8 && textos()[3] === '≥ 25 %' && JSON.stringify(guardadas[guardadas.length - 1]) === '{}', '§17: «↺ Las de fábrica»: vuelven las 8 y en tus ajustes ya no hay cifras propias')
    D.pulsa(uno('data-opcion', 'roce')); await D.espera(10)
    ok(!uno('data-lista-cifras', 'roce'), 'pulsar otra vez la caja la cierra')
    D.pulsa(uno('data-ocultar-panel')); await D.espera(10)
    ok(!uno('data-panel-filtros') && uno('data-encendido', 'roce')?.textContent.includes('≥ 15 %'), '«Filtros ▲»: queda la línea con «ROCE ≥ 15 %»')
    D.pulsa(uno('data-quitar', 'roce')); await D.espera(10)
    ok(!uno('data-encendido', 'roce') && uno('data-embudo-n', 1).textContent === '3', '✕ quita el ROCE: pasan los 3')
    D.pulsa(uno('data-mostrar-panel')); await D.espera(10)
    ok(!!uno('data-panel-filtros') && uno('data-opcion', 'roce').textContent.includes('Cualquiera'), '«Filtros ▼»: vuelve la rejilla, ROCE en «Cualquiera»')
    ok(D.propsDe(uno('data-nombre-vista')).readOnly === true, 'el nombre no se cambia sin ✎')
    D.pulsa(uno('data-editar-nombre')); await D.espera(10)
    ok(D.propsDe(uno('data-nombre-vista')).readOnly === false, '✎: el nombre se puede cambiar')
    m.quita()
  }

  console.log(`screener: ${fallos ? fallos + ' fallos de ' + n : 'todas bien (' + n + ')'}`)
  process.exit(fallos ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
