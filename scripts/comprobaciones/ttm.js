// scripts/comprobaciones/ttm.js — los ÚLTIMOS 12 MESES de CADA trimestre (lib/screener/edgar.js, docs/screener.md §27).
// Las corre comunes.sh. Termina en 0 si todo da lo esperado. Empresa inventada, cuentas a mano (millones):
//   Ventas anuales: 2024 = 100 · 2025 = 120.
//   «Lo que va de año» de los 10-Q: 2025 T1 = 28, T2 = 57, T3 = 85 · 2026 T1 = 33, T2 = 68, T3 = 100.
//   TTM 2025-03-31 = 100 + 28 − (T1 2024 = 25) = 103 · TTM 2025-06-30 = 100 + 57 − (S1 2024 = 52) = 105
//   TTM 2025-09-30 = 100 + 85 − (9 meses 2024 = 78) = 107
//   TTM 2026-03-31 = 120 + 33 − 28 = 125 · TTM 2026-06-30 = 120 + 68 − 57 = 131 · TTM 2026-09-30 = 120 + 100 − 85 = 135
//   Activos (saldo): 10-K 2024 = 500, 10-K 2025 = 600; 10-Q 2025-06-30 = 540, 2026-09-30 = 650.
//   Deuda a corto (saldo): solo un 10-K de 2019 y un 10-Q de 2026-06-30 = 30 → TTM 2026-06-30 = 30 (un saldo no necesita ejercicio
//   reciente).
//   Un trimestre de 2023 sin ejercicio anual de 2022 delante: sin TTM de ventas.
process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://arnes.invalid'; process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'clave-falsa-del-arnes'
const C0 = require('./cargador'), R = C0.RAIZ
let fallos = 0
const ok = (c, t) => { console.log(`${c ? 'OK  ' : 'MAL '} ${t}`); if (!c) fallos++ }

;(async () => {
  await C0.prepara(); C0.registra(R)
  const { filasDeEmpresa } = require(R + '/lib/screener/edgar.js')
  const { metricasDe } = require(R + '/lib/screener/metricas.js')
  const h = (form, start, end, val, filed) => ({ form, start, end, val, filed, accn: form + filed + end + (start || '') })
  const ventas = [
    h('10-K', '2024-01-01', '2024-12-31', 100, '2025-02-15'), h('10-K', '2025-01-01', '2025-12-31', 120, '2026-02-15'),
    h('10-Q', '2023-01-01', '2023-03-31', 20, '2023-05-01'),
    h('10-Q', '2024-01-01', '2024-03-31', 25, '2024-05-01'), h('10-Q', '2024-01-01', '2024-06-30', 52, '2024-08-01'), h('10-Q', '2024-01-01', '2024-09-30', 78, '2024-11-01'),
    h('10-Q', '2025-01-01', '2025-03-31', 28, '2025-05-01'), h('10-Q', '2025-01-01', '2025-06-30', 57, '2025-08-01'), h('10-Q', '2025-01-01', '2025-09-30', 85, '2025-11-01'),
    h('10-Q', '2026-01-01', '2026-03-31', 33, '2026-05-01'), h('10-Q', '2026-01-01', '2026-06-30', 68, '2026-08-01'), h('10-Q', '2026-01-01', '2026-09-30', 100, '2026-11-01'),
  ]
  const activos = [h('10-K', null, '2024-12-31', 500, '2025-02-15'), h('10-K', null, '2025-12-31', 600, '2026-02-15'), h('10-Q', null, '2025-06-30', 540, '2025-08-01'), h('10-Q', null, '2026-09-30', 650, '2026-11-01')]
  const deuda = [h('10-K', null, '2019-12-31', 10, '2020-02-15'), h('10-Q', null, '2026-06-30', 30, '2026-08-01')]
  // El 10-K de 2019 marca el fin de ejercicio 2019-12-31 (para que el saldo anual de deuda cuente), con unas ventas de ese año.
  ventas.push(h('10-K', '2019-01-01', '2019-12-31', 70, '2020-02-15'))
  const cf = { cik: 999, facts: { 'us-gaap': {
    Revenues: { units: { USD: ventas.map(x => ({ ...x, val: x.val * 1e6 })) } },
    Assets: { units: { USD: activos.map(x => ({ ...x, val: x.val * 1e6 })) } },
    DebtCurrent: { units: { USD: deuda.map(x => ({ ...x, val: x.val * 1e6 })) } },
  } } }
  const filas = filasDeEmpresa(cf)
  const ttm = (c) => filas.filter(f => f.concepto === c && f.periodo === 'TTM').map(f => [f.fin, f.valor / 1e6])
  const v = Object.fromEntries(ttm('ventas'))
  ok(v['2025-03-31'] === 103 && v['2025-06-30'] === 105 && v['2025-09-30'] === 107, `2025: 103, 105 y 107 (salen ${v['2025-03-31']}, ${v['2025-06-30']}, ${v['2025-09-30']})`)
  ok(v['2026-03-31'] === 125 && v['2026-06-30'] === 131 && v['2026-09-30'] === 135, `2026: 125, 131 y 135 (salen ${v['2026-03-31']}, ${v['2026-06-30']}, ${v['2026-09-30']})`)
  ok(!('2024-03-31' in v) && !('2023-03-31' in v), 'sin ejercicio anual delante (o a más de 380 días): sin TTM de ese trimestre')
  ok(ttm('ventas').map(x => x[0]).join() === [...ttm('ventas').map(x => x[0])].sort().join(), 'en orden de fecha')
  const t26 = filas.find(f => f.concepto === 'ventas' && f.periodo === 'TTM' && f.fin === '2026-09-30')
  ok(t26.conocido_desde === '2026-11-01' && t26.presentado === '2026-11-01', 'TTM 2026-09-30: se conoce con el 10-Q del 01/11/2026')
  const a = Object.fromEntries(ttm('activos'))
  ok(a['2025-06-30'] === 540 && a['2026-09-30'] === 650 && Object.keys(a).length === 2, 'activos de cada trimestre: 540 y 650')
  ok(JSON.stringify(ttm('deuda_corto')) === JSON.stringify([['2026-06-30', 30]]), 'deuda a corto de 2026-06-30 = 30 aunque el último anual sea de 2019')
  ok(filas.filter(f => f.concepto === 'ventas' && f.periodo === 'FY').length === 3, 'los tres ejercicios, igual que antes')

  // La pantalla de HOY usa el más reciente: ventas 135 y activos 650.
  const m = metricasDe({ simbolo: 'X', precio: 10 }, filas.map(f => ({ ...f, valor: String(f.valor) })))
  ok(m.piezas.ventas === 135 && m.piezas.activos === 650, `cifras de hoy: ventas 135 y activos 650 (salen ${m.piezas.ventas} y ${m.piezas.activos})`)

  console.log(`ttm: ${fallos ? fallos + ' fallos' : 'todo bien'}`); process.exit(fallos ? 1 : 0)
})()
