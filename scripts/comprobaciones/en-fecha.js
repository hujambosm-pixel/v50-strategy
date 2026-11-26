// scripts/comprobaciones/en-fecha.js — las cifras del screener EN UNA FECHA del pasado (lib/screener/enFecha.js, docs/screener.md §28).
// Las corre comunes.sh. Termina en 0 si todo da lo esperado. Empresa inventada «AAA», cifras a mano (millones):
//   Ejercicio 2024: ventas 100, beneficio 10, activos 200, pasivo corriente 40, beneficio operativo 20, patrimonio 80,
//   acciones 10 millones; todo presentado (y conocido) el 15/02/2025. Velas: cierre 50 $ todos los días laborables desde 2022.
//   Antes del 15/02/2025: sin cuentas → sin PER. Desde ese día: capitalización 50 × 10 = 500 → PER 500 ÷ 10 = 50; ROCE 20 ÷ (200 − 40)
//   = 12,5 %; P/S 500 ÷ 100 = 5.
//   Con un split 2:1 el 01/06/2025 (y los precios ajustados, cierre 25 $): acciones 10 × 2 = 20 millones → 25 × 20 = 500 → PER 50 igual.
//   Ejercicio 2025 conocido el 15/02/2026 con beneficio 20: PER del 20/02/2026 = 500 ÷ 20 = 25; el del 10/02/2026, aún 50.
//   PEG esperado (§30): puntos del 10/06/2024 (2), 19/09/2024 (3) y 02/10/2025 (1). El 07/06/2024, ninguno; el 10/06/2024, 2 (el mismo
//   día cuenta); el 06/06/2025, 3 (el del 19/09/2024, de hace 260 días); sin el de 2025: el 24/10/2025 aún 3 (400 días justos), el
//   25/10/2025 ninguno (401). Crecimiento esperado del 06/06/2025 = PER 50 ÷ 3 = 16,67 % al año.
process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://arnes.invalid'; process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'clave-falsa-del-arnes'
const C0 = require('./cargador'), R = C0.RAIZ
let fallos = 0
const ok = (c, t) => { console.log(`${c ? 'OK  ' : 'MAL '} ${t}`); if (!c) fallos++ }
const cerca = (a, b) => a != null && b != null && Math.abs(a - b) < 1e-9 * Math.max(1, Math.abs(b))

;(async () => {
  await C0.prepara(); C0.registra(R)
  const F = require(R + '/lib/screener/enFecha.js')

  // Velas: todos los días laborables del 03/01/2022 al 31/03/2026 a 50 $ (o a 25 $ si se ajustan por el split 2:1).
  const velasA = (cierre) => { const v = []; for (let t = Date.parse('2022-01-03T00:00:00Z'); t <= Date.parse('2026-03-31T00:00:00Z'); t += 86400000) { const d = new Date(t); if (d.getUTCDay() % 6 === 0) continue; v.push({ date: d.toISOString().slice(0, 10), open: cierre, high: cierre, low: cierre, close: cierre, volume: 1000 }) } return v }
  const v50 = velasA(50), v25 = velasA(25)
  const fy = (concepto, valor, fin = '2024-12-31', conocido = '2025-02-15', unidad = 'USD') => ({ concepto, periodo: 'FY', fin, inicio: null, valor: String(valor), unidad, presentado: conocido, conocido_desde: conocido })
  const c24 = [fy('ventas', 100e6), fy('beneficio_neto', 10e6), fy('activos', 200e6), fy('pasivo_corriente', 40e6), fy('beneficio_operativo', 20e6), fy('patrimonio', 80e6), fy('acciones_diluidas', 10e6, undefined, undefined, 'shares')]
  const emp = { simbolo: 'AAA', nombre: 'Aaa', sector: 'Tecnología', en_sp500: true, en_ndx: false, en_listas: false }

  // ── 1 · Piezas ──
  ok(F.cuentasEnFecha(c24, '2025-02-14').length === 0 && F.cuentasEnFecha(c24, '2025-02-15').length === 7, 'cuentas: el 14/02/2025 ninguna, el 15/02/2025 las 7 (el mismo día cuenta)')
  ok(F.inicioTecnico('2025-06-06') === '2020-06-06', 'ventana del técnico: 5 años antes')
  const vh = F.velasHasta(v50, '2025-06-06')
  ok(vh[vh.length - 1].date === '2025-06-06' && vh[0].date === '2022-01-03', 'velasHasta: hasta ese día incluido')
  ok(F.velasHasta(v50, '2025-06-07').slice(-1)[0].date === '2025-06-06', 'un sábado: la del viernes')

  // ── 2 · Una empresa en una fecha ──
  const antes = F.empresaEnFecha(emp, c24, [], v50, '2025-02-14')
  ok(antes.m.per == null && antes.precio === 50, 'el 14/02/2025: con precio pero sin cuentas, sin PER')
  const e = F.empresaEnFecha(emp, c24, [], v50, '2025-06-06')
  ok(cerca(e.m.capitalizacion, 500) && cerca(e.m.per, 50) && cerca(e.m.roce, 12.5) && cerca(e.m.ps, 5), `el 06/06/2025: capitalización 500, PER 50, ROCE 12,5 %, P/S 5 (salen ${e.m.capitalizacion}, ${e.m.per}, ${e.m.roce}, ${e.m.ps})`)
  ok(e.m.pegEsp == null && e.pegFecha == null, 'en el pasado no hay PEG esperado')
  const conSplit = F.empresaEnFecha(emp, c24, [['2025-06-01', 2, 1]], v25, '2025-06-06')
  ok(cerca(conSplit.m.capitalizacion, 500) && cerca(conSplit.m.per, 50) && conSplit.piezas.accionesFactor === 2, 'con split 2:1 y precios ajustados (25 $): acciones × 2, PER 50 igual')
  const c25 = [...c24, fy('ventas', 100e6, '2025-12-31', '2026-02-15'), fy('beneficio_neto', 20e6, '2025-12-31', '2026-02-15')]
  ok(cerca(F.empresaEnFecha(emp, c25, [], v50, '2026-02-10').m.per, 50) && cerca(F.empresaEnFecha(emp, c25, [], v50, '2026-02-20').m.per, 25), 'el ejercicio 2025 cuenta desde el 15/02/2026: PER 50 el 10/02 y 25 el 20/02')
  const viejas = v50.filter(v => v.date <= '2025-05-01')
  ok(F.empresaEnFecha(emp, c24, [], viejas, '2025-06-06').precio == null, 'sin vela en la última semana (dejó de cotizar): sin precio')
  ok(e.tecnico && e.tecnico.cierre === 50 && e.tecnico.fecha === '2025-06-06', 'el técnico con las velas hasta ese día')

  // ── 3 · Varias empresas del día y la foto ──
  const bbb = { ...emp, simbolo: 'BBB' }, ccc = { ...emp, simbolo: 'CCC', sector: 'Energía' }
  const cB = c24.map(f => f.concepto === 'ventas' ? { ...f, valor: String(50e6) } : f)   // P/S 10
  const lista = F.empresasEnFecha([{ empresa: emp, cuentas: c24, splits: [], velas: v50 }, { empresa: bbb, cuentas: cB, splits: [], velas: v50 }, { empresa: ccc, cuentas: c24, splits: [], velas: v50 }], { SPY: v50 }, '2025-06-06')
  const de = (s) => lista.find(x => x.simbolo === s)
  ok(cerca(de('AAA').m.psSector, 7.5) && cerca(de('CCC').m.psSector, 5), 'mediana del P/S del sector: Tecnología (5 y 10) = 7,5; Energía = 5')
  const foto = F.fotoDe(lista)
  const iPs = foto.campos.indexOf('psSector'), iPer = foto.campos.indexOf('per'), iCaja = foto.campos.indexOf('cajaCubre')
  ok(!foto.campos.includes('pegEsp') && !foto.campos.includes('senal'), 'sin ningún PEG ese día, la foto no lleva su columna (no se aplica); la señal de una estrategia nunca')
  ok(foto.datos.AAA[iPer] === 50 && foto.datos.AAA[iPs] === -33.3333 && foto.datos.BBB[iPs] === 33.3333, 'PER 50; P/S frente al sector: 5 ÷ 7,5 − 1 = −33,3333 % y 10 ÷ 7,5 − 1 = +33,3333 %')
  ok(foto.datos.AAA[iCaja] === null, 'caja ÷ deuda a corto sin caja declarada: sin dato')
  ok(F.redondea(1 / 3) === 0.333333 && F.redondea(null) === null, 'redondeo a 6 cifras')

  // ── 4 · Evaluar una vista sobre la foto ──
  const fichas = { AAA: emp, BBB: bbb, CCC: ccc }
  const vista = (filtros, extra = {}) => ({ filtros, sectoresFuera: [], universo: { sp500: true, ndx: true, listas: true }, ...extra })
  ok(JSON.stringify(F.evaluaFoto(foto, fichas, vista({ per: { on: true, op: '≤', valor: 60 } })).pasan) === '["AAA","BBB","CCC"]', 'PER ≤ 60: pasan las tres')
  ok(JSON.stringify(F.evaluaFoto(foto, fichas, vista({ psSector: { on: true, op: '≤', valor: 0 } })).pasan) === '["AAA","CCC"]', 'P/S frente al sector ≤ 0: AAA (−33 %) y CCC (0 %)')
  ok(JSON.stringify(F.evaluaFoto(foto, fichas, vista({}, { sectoresFuera: ['Energía'] })).pasan) === '["AAA","BBB"]', 'sector Energía fuera: CCC no')
  ok(F.evaluaFoto(foto, fichas, vista({}, { universo: { sp500: false, ndx: true, listas: false } })).pasan.length === 0, 'solo Nasdaq-100: ninguna')
  const pg = F.evaluaFoto(foto, fichas, vista({ pegEsp: { on: true, op: '≤', valor: 1.5 }, per: { on: true, op: '≤', valor: 60 } }))
  ok(pg.pasan.length === 3 && JSON.stringify(pg.noSeAplican) === '["pegEsp"]', 'PEG esperado encendido: no se aplica en el pasado y lo dice')
  ok(F.evaluaFoto(foto, fichas, vista({ cajaCubre: { on: true, op: '≥', valor: 1 } })).pasan.length === 0, 'un dato que falta no pasa')
  const sd = { campos: ['cajaCubre'], datos: { AAA: ['sd'] } }
  ok(F.evaluaFoto(sd, fichas, vista({ cajaCubre: { on: true, op: '≥', valor: 1 } })).pasan[0] === 'AAA', '«sd» (sin deuda a corto) pasa')

  // ── 5 · PEG esperado en el pasado (§30) ──
  const pegs = [{ fecha: '2024-06-10', peg: 2 }, { fecha: '2025-10-02', peg: 1 }, { fecha: '2024-09-19', peg: 3 }]   // desordenados a propósito
  ok(F.pegEnFecha(pegs, '2024-06-07') == null && F.pegEnFecha(pegs, '2024-06-10').peg === 2, 'PEG: el 07/06/2024 ninguno; el 10/06/2024, 2 (el mismo día cuenta)')
  ok(F.pegEnFecha(pegs, '2025-06-06').peg === 3 && F.pegEnFecha(pegs, '2025-06-06').fecha === '2024-09-19' && F.pegEnFecha(pegs, '2025-10-06').peg === 1, 'PEG: el 06/06/2025, el del 19/09/2024 (3); el 06/10/2025, el del 02/10/2025 (1)')
  const viejos = pegs.slice(0, 1).concat(pegs.slice(2))
  ok(F.pegEnFecha(viejos, '2025-10-24')?.peg === 3 && F.pegEnFecha(viejos, '2025-10-25') == null, 'PEG: 400 días justos vale; 401, no')
  const ep = F.empresaEnFecha(emp, c24, [], v50, '2025-06-06', pegs)
  ok(ep.m.pegEsp === 3 && ep.pegFecha === '2024-09-19' && cerca(ep.m.crecEsperado, 50 / 3), `empresa con PEG: 3 (del 19/09/2024) y crecimiento esperado 50 ÷ 3 = 16,67 % (sale ${ep.m.crecEsperado})`)
  const lp = F.empresasEnFecha([{ empresa: emp, cuentas: c24, splits: [], velas: v50, pegs }, { empresa: bbb, cuentas: cB, splits: [], velas: v50 }], { SPY: v50 }, '2025-06-06')
  const fp = F.fotoDe(lp), iPeg = fp.campos.indexOf('pegEsp')
  ok(iPeg >= 0 && fp.datos.AAA[iPeg] === 3 && fp.datos.BBB[iPeg] === null, 'foto con PEG de 1 de 2 (la mitad): lleva la columna; AAA 3, BBB sin dato')
  const lp3 = F.empresasEnFecha([{ empresa: emp, cuentas: c24, splits: [], velas: v50, pegs }, { empresa: bbb, cuentas: cB, splits: [], velas: v50 }, { empresa: ccc, cuentas: c24, splits: [], velas: v50 }], { SPY: v50 }, '2025-06-06')
  ok(!F.fotoDe(lp3).campos.includes('pegEsp'), 'foto con PEG de 1 de 3 (menos de la mitad): sin la columna, el filtro no se aplica')
  const ep2 = F.evaluaFoto(fp, fichas, vista({ pegEsp: { on: true, op: '≤', valor: 3.5 } }))
  ok(JSON.stringify(ep2.pasan) === '["AAA"]' && ep2.noSeAplican.length === 0, 'PEG esperado ≤ 3,5: pasa AAA, BBB (sin PEG) no; ese día sí se aplica')
  ok(F.quitaCamposVacios({ campos: ['per', 'pegEsp'], datos: { A: [1, null] } }).campos.join() === 'per' && F.quitaCamposVacios({ campos: ['per', 'pegEsp'], datos: { A: [null, null] } }).campos.join() === 'per', 'quitaCamposVacios: solo quita el PEG esperado vacío, nunca un campo de las cuentas')

  console.log(`en-fecha: ${fallos ? fallos + ' fallos' : 'todo bien'}`); process.exit(fallos ? 1 : 0)
})()
