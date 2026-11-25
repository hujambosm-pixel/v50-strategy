// scripts/comprobaciones/splits.js — los SPLITS y el ajuste de las acciones de la SEC (lib/screener/splits.js, docs/screener.md §25).
// Las corre comunes.sh. Termina en 0 si todo da lo esperado. Cifras a mano, con los splits reales de Yahoo:
//   AAPL: 2:1 21/06/2000 · 2:1 28/02/2005 · 7:1 09/06/2014 · 4:1 31/08/2020.
//   NVDA: … 4:1 20/07/2021 · 10:1 10/06/2024.
//   Acciones de la SEC guardadas (millones, «presentado»): AAPL 2017 5.252 (31/10/2019) → × 4 = 21.008; AAPL 2018 20.000
//   (30/10/2020, ya tras el split) → × 1 = 20.000. NVDA 2019 625 (26/02/2021) → × 4 × 10 = 25.000; NVDA 2020 2.472 (18/03/2022)
//   → × 10 = 24.720; NVDA 2023 25.070 (26/02/2025) → × 1.
//   Split inverso inventado 1 por 10 el 01/06/2023: 50 millones presentados el 01/03/2023 → 5 millones.
process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://arnes.invalid'; process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'clave-falsa-del-arnes'
const C0 = require('./cargador'), R = C0.RAIZ
let fallos = 0
const ok = (c, t) => { console.log(`${c ? 'OK  ' : 'MAL '} ${t}`); if (!c) fallos++ }
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const cerca = (a, b) => Math.abs(a - b) < 1e-9 * Math.max(1, Math.abs(b))
const ep = (f) => Date.parse(f + 'T13:30:00Z') / 1000

;(async () => {
  await C0.prepara(); C0.registra(R)
  const S = require(R + '/lib/screener/splits.js')

  // ── 1 · Lo que da Yahoo ──
  const yAapl = { splits: {
    [ep('2020-08-31')]: { date: ep('2020-08-31'), numerator: 4, denominator: 1, splitRatio: '4:1' },
    [ep('2000-06-21')]: { date: ep('2000-06-21'), numerator: 2, denominator: 1, splitRatio: '2:1' },
    [ep('2014-06-09')]: { date: ep('2014-06-09'), numerator: 7, denominator: 1, splitRatio: '7:1' },
    [ep('2005-02-28')]: { date: ep('2005-02-28'), numerator: 2, denominator: 1, splitRatio: '2:1' },
  } }
  const aapl = S.splitsDeYahoo(yAapl)
  ok(igual(aapl, [['2000-06-21', 2, 1], ['2005-02-28', 2, 1], ['2014-06-09', 7, 1], ['2020-08-31', 4, 1]]), 'AAPL: los 4 splits, ordenados por fecha')
  ok(igual(S.splitsDeYahoo({ splits: { 1: { date: ep('2023-06-01'), splitRatio: '1:10' } } }), [['2023-06-01', 1, 10]]), 'sin numerador/denominador, se lee de «1:10» (split inverso)')
  ok(igual(S.splitsDeYahoo({ splits: { 1: { date: ep('2023-06-01'), numerator: 1, denominator: 1 }, 2: { date: ep('2023-07-01'), numerator: 0, denominator: 1 } } }), []), 'un 1:1 o un 0 no son splits')
  ok(igual(S.splitsDeYahoo(null), []) && igual(S.splitsDeYahoo({}), []), 'sin eventos: lista vacía')

  // ── 2 · El ajuste ──
  const nvda = [['2000-06-27', 2, 1], ['2001-09-12', 2, 1], ['2006-04-07', 2, 1], ['2007-09-11', 3, 2], ['2021-07-20', 4, 1], ['2024-06-10', 10, 1]]
  ok(cerca(S.accionesAjustadas(5252, '2019-10-31', aapl), 21008), 'AAPL 2017: 5.252 × 4 = 21.008')
  ok(cerca(S.accionesAjustadas(20000, '2020-10-30', aapl), 20000), 'AAPL 2018: presentado tras el split, × 1 = 20.000')
  ok(cerca(S.accionesAjustadas(625, '2021-02-26', nvda), 25000), 'NVDA 2019: 625 × 4 × 10 = 25.000')
  ok(cerca(S.accionesAjustadas(2472, '2022-03-18', nvda), 24720), 'NVDA 2020: 2.472 × 10 = 24.720')
  ok(cerca(S.accionesAjustadas(25070, '2025-02-26', nvda), 25070), 'NVDA 2023: ya en la escala de hoy')
  ok(cerca(S.factorDesde(nvda, '2007-01-01'), 1.5 * 40), 'NVDA desde 2007: 3/2 × 4 × 10 = 60')
  ok(cerca(S.accionesAjustadas(50, '2023-03-01', [['2023-06-01', 1, 10]]), 5), 'split inverso 1 por 10: 50 → 5')
  ok(S.factorDesde(aapl, '2020-08-31') === 1, 'un split del mismo día en que se presentó no cuenta')
  ok(S.factorDesde(aapl, null) === 1 && S.factorDesde(aapl, '31/10/2019') === 1, 'sin fecha válida: sin ajuste')
  ok(S.accionesAjustadas(null, '2019-10-31', aapl) === null, 'sin acciones: null')

  // ── 3 · Con un precio de un día concreto (el del screener, sin ajustar) ──
  // SNDK: split 8:1 el 20/11/2026; acciones 154 millones presentadas el 30/10/2026.
  const sndk = [['2026-11-20', 8, 1]]
  ok(S.factorEntre(sndk, '2026-10-30', '2026-11-10') === 1, 'SNDK con el precio del 10/11 (antes del split): × 1')
  ok(S.factorEntre(sndk, '2026-10-30', '2026-11-20') === 8, 'SNDK con el precio del 20/11 (día del split): × 8')
  ok(S.factorEntre(sndk, '2026-10-30', null) === 8, 'sin día del precio: todos los posteriores')
  ok(S.factorEntre(aapl, '2019-10-31', '2020-08-30') === 1 && S.factorEntre(aapl, '2019-10-31', '2026-11-25') === 4, 'AAPL 2019: × 1 antes del 31/08/2020, × 4 después')

  // ── 4 · En las cifras del screener (lib/screener/metricas.js) ──
  const { metricasDe } = require(R + '/lib/screener/metricas.js')
  const fila = (concepto, valor, unidad = 'USD') => ({ concepto, periodo: 'FY', fin: '2026-07-03', valor: String(valor), unidad, presentado: '2026-10-30' })
  const cuentas = [fila('ventas', 8e9), fila('activos', 2e10), fila('beneficio_neto', 2e9), fila('acciones_diluidas', 154e6, 'shares')]
  const antes = metricasDe({ simbolo: 'SNDK', precio: 868, precio_fecha: '2026-11-10' }, cuentas, sndk)
  const despues = metricasDe({ simbolo: 'SNDK', precio: 108.5, precio_fecha: '2026-11-24' }, cuentas, sndk)
  const sin = metricasDe({ simbolo: 'SNDK', precio: 868, precio_fecha: '2026-11-10' }, cuentas)
  // 868 × 154 = 133.672 M$; tras el split 108,5 × (154 × 8 = 1.232) = 133.672 M$: la misma empresa, la misma capitalización.
  ok(Math.abs(antes.m.capitalizacion - 133672) < 1e-6 && !('accionesFactor' in antes.piezas), 'precio antes del split: 868 × 154 = 133.672 M$, sin factor')
  ok(Math.abs(despues.m.capitalizacion - 133672) < 1e-6 && despues.piezas.accionesFactor === 8, 'precio después del split: 108,5 × 1.232 = 133.672 M$, factor 8')
  ok(Math.abs(despues.m.per - 133672 / 2000) < 1e-9, 'PER tras el split: 133.672 ÷ 2.000 = 66,8')
  ok(JSON.stringify(sin) === JSON.stringify(antes), 'sin splits, las cifras salen igual que antes')

  console.log(`splits: ${fallos ? fallos + ' fallos' : 'todo bien'}`); process.exit(fallos ? 1 : 0)
})()
