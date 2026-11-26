// scripts/comprobaciones/escala.js — la ESCALA de las acciones de la SEC (lib/screener/escala.js, docs/screener.md §26).
// Las corre comunes.sh. Termina en 0 si todo da lo esperado. Cifras a mano (las de MCD, NVMI y VPG son las reales de la SEC):
//   MCD 2025: beneficio 8.563 M$, BPA 11,95 $ → 8.563.000.000 ÷ 11,95 = 716.569.038 acciones esperadas; declara 716,4 → × 1.000.000.
//   MCD 2020: declara 750.100.000 (bien); beneficio 4.731 M$, BPA 6,31 → 749,8 M esperadas → sin cambio.
//   NVMI 2025: declara 32.800 (miles) frente a 32,8 millones → × 1.000.
//   NTRS 2008: declara 224.053.430.000.000 (un millón de veces de más); beneficio 794,8 M$, BPA 3,47 → 229 M → ÷ 1.000.000.
//   Un split no es un salto de escala: 600 M → 24.000 M (un 4:1 y un 10:1 = 40 veces): sin cambio.
process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://arnes.invalid'; process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'clave-falsa-del-arnes'
const C0 = require('./cargador'), R = C0.RAIZ
let fallos = 0
const ok = (c, t) => { console.log(`${c ? 'OK  ' : 'MAL '} ${t}`); if (!c) fallos++ }
const cerca = (a, b) => Math.abs(a - b) < 1e-9 * Math.max(1, Math.abs(b))

;(async () => {
  await C0.prepara(); C0.registra(R)
  const E = require(R + '/lib/screener/escala.js')
  const f = (concepto, fin, valor, periodo = 'FY') => ({ concepto, periodo, fin, valor })

  // ── 1 · factorEscala ──
  ok(E.factorEscala(716.4, 716569038) === 1e6, 'MCD 2025: 716,4 frente a 716,6 millones → × 1.000.000')
  ok(E.factorEscala(32800, 32.8e6) === 1e3, 'NVMI 2025: 32.800 frente a 32,8 millones → × 1.000')
  ok(E.factorEscala(750.1e6, 749.8e6) === 1, 'casi igual → × 1')
  ok(E.factorEscala(600e6, 24000e6) === 1, 'un 40:1 (dos splits) no es un salto de escala')
  ok(E.factorEscala(1e6, 20e6) === 1 && E.factorEscala(1e6, 1e8) === 1, 'ni 20 ni 100 veces: × 1')
  ok(E.factorEscala(224053430000000, 229e6) === 1e-6, 'NTRS 2008: un millón de veces de más → ÷ 1.000.000')
  ok(E.factorEscala(0, 5e6) === 1 && E.factorEscala(5e6, 0) === 1 && E.factorEscala(null, 5e6) === 1, 'cero o sin dato: × 1')

  // ── 2 · Una empresa entera ──
  const mcd = [
    f('beneficio_neto', '2020-12-31', 4731e6), f('bpa_diluido', '2020-12-31', 6.31), f('acciones_diluidas', '2020-12-31', 750.1e6),
    f('beneficio_neto', '2025-12-31', 8563e6), f('bpa_diluido', '2025-12-31', 11.95), f('acciones_diluidas', '2025-12-31', 716.4),
    f('acciones_diluidas', '2026-09-30', 708.3, 'TTM'), f('ventas', '2025-12-31', 26e9),
  ]
  const r = E.corrigeEscalaAcciones(mcd)
  const a = (fin, p = 'FY') => r.find(x => x.concepto === 'acciones_diluidas' && x.fin === fin && x.periodo === p)
  ok(cerca(a('2025-12-31').valor, 716.4e6) && a('2025-12-31').escala === 1e6, 'MCD 2025 (con el BPA): 716,4 → 716.400.000')
  ok(cerca(a('2026-09-30', 'TTM').valor, 708.3e6) && a('2026-09-30', 'TTM').escala === 1e6, 'MCD TTM (sin BPA, con la mediana): 708,3 → 708.300.000')
  ok(a('2020-12-31') === mcd[2] && !('escala' in a('2020-12-31')), 'MCD 2020, bien declarado: la misma fila, sin tocar')
  ok(r.length === mcd.length && r[7] === mcd[7], 'las demás filas, tal cual y en el mismo orden')
  // La mediana se calcula con lo ya corregido por el BPA: con 2 años en millones y 1 bien, la serie cruda daría la mediana mala.
  const mayoria = [
    f('beneficio_neto', '2023-12-31', 100e6), f('bpa_diluido', '2023-12-31', 2), f('acciones_diluidas', '2023-12-31', 50),
    f('beneficio_neto', '2024-12-31', 100e6), f('bpa_diluido', '2024-12-31', 2), f('acciones_diluidas', '2024-12-31', 50),
    f('acciones_diluidas', '2022-12-31', 50e6), f('acciones_diluidas', '2025-06-30', 51, 'TTM'),
  ]
  const m = E.corrigeEscalaAcciones(mayoria).filter(x => x.concepto === 'acciones_diluidas')
  ok(m.every(x => cerca(x.valor, x.fin === '2025-06-30' ? 51e6 : 50e6)), 'casi todo en millones: el BPA arregla 2023 y 2024, y la mediana ya corregida, el TTM')
  // Si el propio BPA viene mal (un año), manda la serie.
  const bpaMal = [
    f('acciones_diluidas', '2014-12-31', 30e6), f('acciones_diluidas', '2016-12-31', 31e6), f('acciones_diluidas', '2017-12-31', 32e6),
    f('beneficio_neto', '2015-12-31', 60e6), f('bpa_diluido', '2015-12-31', 2000), f('acciones_diluidas', '2015-12-31', 30523),
  ]
  ok(cerca(E.corrigeEscalaAcciones(bpaMal).find(x => x.fin === '2015-12-31' && x.concepto === 'acciones_diluidas').valor, 30523e3), 'BPA mal escalado: manda la serie (30.523 → 30.523.000)')
  ok(E.corrigeEscalaAcciones([]).length === 0 && E.corrigeEscalaAcciones(null).length === 0, 'sin filas: lista vacía')
  const cero = [f('acciones_diluidas', '2021-12-31', 0), f('acciones_diluidas', '2022-12-31', 300e6)]
  ok(E.corrigeEscalaAcciones(cero)[0] === cero[0], 'acciones 0: se dejan (la capitalización no se calcula)')

  // ── 3 · En el lector de la SEC (lib/screener/edgar.js) ──
  const { filasDeEmpresa } = require(R + '/lib/screener/edgar.js')
  const hecho = (start, end, val, filed) => ({ start, end, val, form: '10-K', filed, accn: 'a' + filed })
  const cf = { cik: 63908, facts: { 'us-gaap': {
    NetIncomeLoss: { units: { USD: [hecho('2025-01-01', '2025-12-31', 8563e6, '2026-02-24')] } },
    EarningsPerShareDiluted: { units: { 'USD/shares': [hecho('2025-01-01', '2025-12-31', 11.95, '2026-02-24')] } },
    WeightedAverageNumberOfDilutedSharesOutstanding: { units: { shares: [hecho('2025-01-01', '2025-12-31', 716.4, '2026-02-24')] } },
  } } }
  const acc = filasDeEmpresa(cf).find(x => x.concepto === 'acciones_diluidas')
  ok(acc && cerca(acc.valor, 716.4e6) && acc.conocido_desde === '2026-02-24', 'filasDeEmpresa: las acciones de MCD ya salen en acciones sueltas')

  console.log(`escala: ${fallos ? fallos + ' fallos' : 'todo bien'}`); process.exit(fallos ? 1 : 0)
})()
