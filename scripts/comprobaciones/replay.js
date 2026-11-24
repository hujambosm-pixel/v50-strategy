// scripts/comprobaciones/replay.js — el MOTOR del Replay (lib/replay/motor.js, docs/builder.md §225). Las corre comunes.sh.
// Termina en 0 si todo da lo esperado. Todas las cifras, a mano (10.000 €, 1 € por orden).
//
// VELAS INVENTADAS DE «A» (apertura / máximo / mínimo / cierre):
//   d1 mar 02/01/2024  100 / 102 /  99 / 100   ← la primera que ves («desde»)
//   d2 mié 03/01       101 / 105 / 100 / 104
//   d3 jue 04/01       104 / 106 /  98 /  99
//   d4 vie 05/01        97 /  99 /  95 /  96   ← abre con hueco a la baja
//   d5 lun 08/01        96 / 110 /  96 / 108
//   d6 mar 09/01       109 / 112 / 107 / 111
// «B» no cotiza el d3: d1 50/50/50/50 · d2 50/52/50/52 · d4 53/55/53/55 · d5 55/56/54/56 · d6 56/57/55/57.
process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://arnes.invalid'; process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'clave-falsa-del-arnes'
const C0 = require('./cargador'), R = C0.RAIZ
let fallos = 0
const ok = (c, t) => { console.log(`${c ? 'OK  ' : 'MAL '} ${t}`); if (!c) fallos++ }
const cerca = (a, b, tol = 1e-9) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tol * Math.max(1, Math.abs(b))

const D = ['2024-01-02', '2024-01-03', '2024-01-04', '2024-01-05', '2024-01-08', '2024-01-09']
const v = (date, open, high, low, close) => ({ date, open, high, low, close })
const VELAS = {
  A: [v('2023-12-29', 90, 91, 89, 90), v(D[0], 100, 102, 99, 100), v(D[1], 101, 105, 100, 104), v(D[2], 104, 106, 98, 99), v(D[3], 97, 99, 95, 96), v(D[4], 96, 110, 96, 108), v(D[5], 109, 112, 107, 111), v('2024-01-10', 111, 113, 110, 112)],
  B: [v(D[0], 50, 50, 50, 50), v(D[1], 50, 52, 50, 52), v(D[3], 53, 55, 53, 55), v(D[4], 55, 56, 54, 56), v(D[5], 56, 57, 55, 57)],
}
const d = (i) => D[i - 1]

;(async () => {
  await C0.prepara(); C0.registra(R)
  const M = require(R + '/lib/replay/motor.js')
  let id = 0
  const orden = (dia, o = {}) => ({ fecha: d(dia), simbolo: 'A', tipo: 'orden', id: ++id, lado: 1, entrada: null, clase: null, stop: null, objetivo: null, tam: { modo: 'invertir', pct: 50 }, ...o })
  const sim = (acciones, o = {}) => ({ version: 1, valores: ['A'], desde: d(1), hoy: d(6), capitalInicial: 10000, comision: 1, ejecucion: 'apertura', acciones, retrocesos: 0, terminada: false, ...o })
  const corre = (acciones, o) => M.calcula(sim(acciones, o), VELAS)
  const op1 = (r) => r.operaciones[0] || {}

  // ── 0 · Validar y calendario ──
  ok(M.validaEstado(sim([])).length === 0, 'una simulación bien hecha no da avisos')
  ok(M.validaEstado(sim([], { valores: [], capitalInicial: 0, hoy: '2023-01-01' })).length === 3, 'sin valores, sin capital y «hoy» antes del inicio: tres avisos')
  ok(JSON.stringify(M.calendario(sim([], { valores: ['A', 'B'] }), VELAS)) === JSON.stringify(D), 'el calendario va del 02/01 al 09/01 (ni la vela de antes ni la de después)')
  ok(M.siguiente(sim([], { hoy: d(2) }), VELAS) === d(3) && M.siguiente(sim([], { hoy: d(2) }), VELAS, 3) === d(5) && M.siguiente(sim([], { hoy: d(6) }), VELAS) === '2024-01-10', 'la vela siguiente: d3; tres más allá: d5; tras d6, la del 10/01')

  // ── 1 · A mercado y stop ──
  // Orden el d1 (invertir 50 %, stop 98) → apertura del d2 a 101: 5.000 / 101 = 49,5 → 49 acciones (4.949 €); liquidez 10.000 − 4.949 − 1 = 5.050.
  // El d3 el mínimo llega a 98 → vende a 98: 5.050 + 49 × 98 − 1 = 9.851. Resultado (98 − 101) × 49 − 2 = −149.
  let r = corre([orden(1, { stop: 98 })])
  ok(op1(r).acciones === 49 && op1(r).precioEntrada === 101 && op1(r).fechaEntrada === d(2), `a mercado: 49 acciones a la apertura del día siguiente, 101 (${op1(r).acciones} a ${op1(r).precioEntrada})`)
  ok(cerca(r.curva[1].valor, 10146), `al cierre del d2: 5.050 + 49 × 104 = 10.146 € (${r.curva[1].valor})`)
  ok(op1(r).precioSalida === 98 && op1(r).motivo === 'stop' && cerca(op1(r).resultado, -149) && cerca(r.caja, 9851), `stop a 98 el d3: −149 €, quedan 9.851 € (${op1(r).resultado}, ${r.caja})`)
  ok(r.ordenes === 2 && r.comisiones === 2, 'dos órdenes, 2 € de comisiones')

  // ── 2 · Stop con hueco ──
  // Orden el d2 (invertir 100 %, stop 97,50) → d3 a 104: 10.000 / 104 = 96,1 → 96 (cabe: 9.999 / 104 = 96,1); liquidez 10.000 − 9.984 − 1 = 15.
  // d3 mínimo 98: no. d4 ABRE a 97, ya por debajo de 97,50 → vende a la apertura, 97: 15 + 9.312 − 1 = 9.326. Resultado (97 − 104) × 96 − 2 = −674.
  r = corre([orden(2, { stop: 97.5, tam: { modo: 'invertir', pct: 100 } })])
  ok(op1(r).motivo === 'stop (hueco)' && op1(r).precioSalida === 97 && op1(r).fechaSalida === d(4) && cerca(r.caja, 9326), `hueco: vende a la apertura del d4, 97 (no a 97,50): 9.326 € (${op1(r).motivo} ${op1(r).precioSalida}, ${r.caja})`)
  const c2 = M.cifras(sim([orden(2, { stop: 97.5, tam: { modo: 'invertir', pct: 100 } })]), VELAS)
  // Curva: 10.000 · 10.000 · 15 + 96 × 99 = 9.519 · 9.326 · 9.326 · 9.326. Máximo 10.000 el d2; peor caída 9.326 / 10.000 − 1 = −6,74 % (−674 €) el d4.
  ok(cerca(c2.peorCaida, -6.74) && cerca(c2.peorCaidaEur, -674) && c2.fechaPeorCaida === d(4), `peor caída −6,74 %, −674 €, el 05/01 (${c2.peorCaida}, ${c2.peorCaidaEur}, ${c2.fechaPeorCaida})`)
  ok(c2.caidaMasLarga === 4 && c2.ganadoras === 0 && c2.factorBeneficio === 0 && cerca(c2.final, 9326) && cerca(c2.ganancia, -674), `sin volver al máximo en 4 velas; 0 % ganadoras; factor de beneficio 0 (${c2.caidaMasLarga}, ${c2.ganadoras}, ${c2.factorBeneficio})`)
  // Buy&Hold de A: compra al cierre del d1, 100: (10.000 − 1) / 100 = 99 acciones; final 10.000 − 9.900 − 1 + 99 × 111 − 1 = 11.087.
  ok(c2.buyHold.acciones === 99 && cerca(c2.buyHold.final, 11087), `Buy&Hold A: 99 acciones, 11.087 € pagando compra y venta (${c2.buyHold.acciones}, ${c2.buyHold.final})`)

  // ── 3 · Orden LÍMITE y objetivo ──
  // El d1 (cierre 100) compra límite a 99,50 → clase «límite». d2 mínimo 100: no. d3 mínimo 98 → compra a 99,50 (abrió a 104, por encima).
  // Invertir 20 %: 2.000 / 99,50 = 20,1 → 20; liquidez 10.000 − 1.990 − 1 = 8.009. Objetivo 108: el d3 no se mira (entró a mitad de vela);
  // d4 máximo 99, no; d5 máximo 110 → vende a 108: 8.009 + 2.160 − 1 = 10.168. Resultado (108 − 99,50) × 20 − 2 = 168.
  ok(M.claseDe(1, 99.5, 100) === 'limite' && M.claseDe(1, 103, 100) === 'stop' && M.claseDe(-1, 103, 100) === 'limite' && M.claseDe(-1, 97, 100) === 'stop', 'clase: largo por debajo = límite, por encima = stop; corto al revés')
  r = corre([orden(1, { entrada: 99.5, clase: 'limite', objetivo: 108, tam: { modo: 'invertir', pct: 20 } })])
  ok(op1(r).fechaEntrada === d(3) && op1(r).precioEntrada === 99.5 && op1(r).acciones === 20, `límite: compra el d3 a 99,50, 20 acciones (${op1(r).fechaEntrada} ${op1(r).precioEntrada} ${op1(r).acciones})`)
  ok(op1(r).motivo === 'objetivo' && op1(r).fechaSalida === d(5) && cerca(op1(r).resultado, 168) && cerca(r.caja, 10168), `objetivo a 108 el d5: +168 €, 10.168 € (${op1(r).motivo} ${op1(r).resultado} ${r.caja})`)
  // Con stop 98: entra a 99,50 a mitad del d3 y ese mismo día el mínimo llega a 98 → stop (el stop sí se mira): (98 − 99,50) × 20 − 2 = −32.
  r = corre([orden(1, { entrada: 99.5, clase: 'limite', stop: 98, tam: { modo: 'invertir', pct: 20 } })])
  ok(op1(r).fechaSalida === d(3) && op1(r).motivo === 'stop' && cerca(op1(r).resultado, -32), `entra y salta el stop en la misma vela: −32 € (${op1(r).fechaSalida} ${op1(r).resultado})`)
  // Límite que no llega: a 90. Sigue viva hasta el final; cancelada el d2, desaparece.
  r = corre([orden(1, { id: 500, entrada: 90, clase: 'limite' })])
  ok(r.operaciones.length === 0 && r.ordenesVivas.length === 1 && r.ordenesVivas[0].id === 500, 'una límite a 90 no llega: sigue viva el d6')
  r = corre([orden(1, { id: 500, entrada: 90, clase: 'limite' }), { fecha: d(2), tipo: 'cancelar', id: 500 }])
  ok(r.ordenesVivas.length === 0 && r.operaciones.length === 0, 'cancelada el d2: ya no está')

  // ── 4 · Orden STOP de entrada (ruptura) ──
  // El d1 compra stop a 103 → d2 abre a 101 (por debajo) y su máximo 105 llega: compra a 103. A 100,50 → el d2 abre ya a 101, por encima: compra a 101.
  r = corre([orden(1, { entrada: 103, clase: 'stop', tam: { modo: 'invertir', pct: 10 } })])
  ok(op1(r).precioEntrada === undefined && r.posiciones.A.precioMedio === 103 && r.posiciones.A.fecha === d(2), `stop de entrada a 103: compra el d2 a 103 (${r.posiciones.A?.precioMedio})`)
  r = corre([orden(1, { entrada: 100.5, clase: 'stop', tam: { modo: 'invertir', pct: 10 } })])
  ok(r.posiciones.A.precioMedio === 101, `stop de entrada a 100,50 con hueco: compra a la apertura, 101 (${r.posiciones.A?.precioMedio})`)

  // ── 5 · Arriesgar un % y cierre al final ──
  // El d4 (cierre 96) compra a mercado arriesgando 1 % con stop 90 → d5 a 96: 100 / (96 − 90) = 16,7 → 16 acciones; liquidez 10.000 − 1.536 − 1 = 8.463.
  // Terminada con hoy = d6: vende al cierre, 111: 8.463 + 1.776 − 1 = 10.238. Resultado (111 − 96) × 16 − 2 = 238.
  r = corre([orden(4, { stop: 90, tam: { modo: 'arriesgar', pct: 1 } })], { terminada: true })
  ok(op1(r).acciones === 16 && op1(r).motivo === 'cierre al final' && op1(r).precioSalida === 111 && cerca(op1(r).resultado, 238) && cerca(r.caja, 10238), `arriesgar 1 % con stop 90: 16 acciones; cierre al final a 111: +238 €, 10.238 € (${op1(r).acciones} ${op1(r).resultado} ${r.caja})`)
  ok(Object.keys(r.posiciones).length === 0, 'terminada: no queda nada abierto')
  r = corre([orden(4, { tam: { modo: 'arriesgar', pct: 1 } })])
  ok(r.operaciones.length === 0 && !r.posiciones.A && r.avisos.length === 1 && /stop/.test(r.avisos[0].texto), 'arriesgar sin stop: no compra y lo avisa')

  // ── 6 · Corto ──
  // El d2 vende corto a mercado (invertir 50 %, stop 107, objetivo 96) → d3 a 104: 5.000 / 104 = 48,1 → 48; liquidez 10.000 + 4.992 − 1 = 14.991.
  // d3 máximo 106 < 107, mínimo 98 > 96: nada. d4 abre a 97 (no llega a 96), mínimo 95 → recompra a 96: 14.991 − 4.608 − 1 = 10.382.
  // Resultado (96 − 104) × (−48) − 2 = 382; % = (96 / 104 − 1) × 100 × (−1) = 7,69 %.
  r = corre([orden(2, { lado: -1, stop: 107, objetivo: 96 })])
  ok(op1(r).lado === -1 && op1(r).acciones === 48 && op1(r).motivo === 'objetivo' && op1(r).precioSalida === 96 && cerca(op1(r).resultado, 382) && cerca(r.caja, 10382), `corto: 48 a 104, objetivo 96 el d4: +382 €, 10.382 € (${op1(r).resultado} ${r.caja})`)
  ok(cerca(op1(r).pct, (1 - 96 / 104) * 100) && M.etiqueta(op1(r)) === '#1 +7,7 %', `etiqueta «${M.etiqueta(op1(r))}»`)
  // Al cierre del d3, el corto vale 14.991 − 48 × 99 = 10.239 €.
  ok(cerca(r.curva[2].valor, 10239), `el corto valorado al cierre del d3: 10.239 € (${r.curva[2].valor})`)

  // ── 7 · Stop y objetivo en la misma vela: cuenta el stop ──
  // El d1 compra a mercado (invertir 10 %, stop 100, objetivo 105) → d2 a 101: 1.000 / 101 = 9,9 → 9. El d2 el mínimo llega a 100 y el máximo a 105:
  // no se sabe cuál fue antes → STOP a 100: (100 − 101) × 9 − 2 = −11.
  r = corre([orden(1, { stop: 100, objetivo: 105, tam: { modo: 'invertir', pct: 10 } })])
  ok(op1(r).motivo === 'stop' && op1(r).precioSalida === 100 && cerca(op1(r).resultado, -11), `los dos en la misma vela: cuenta el stop, −11 € (${op1(r).motivo} ${op1(r).resultado})`)

  // ── 8 · Stop u objetivo al otro lado: no se ponen ──
  r = corre([orden(1, { stop: 102 })])
  ok(r.posiciones.A && r.posiciones.A.stop === null && r.avisos.some(a => /stop quedó al otro lado/.test(a.texto)), 'stop 102 en una compra a 101: no se pone y lo avisa')

  // ── 9 · Mover el stop de lo abierto y la orden contraria ──
  // Como en 1, pero el d2 quita el stop → el d3 no vende; al cierre del d3: 5.050 + 49 × 99 = 9.901.
  r = corre([orden(1, { stop: 98 }), { fecha: d(2), tipo: 'mover', simbolo: 'A', stop: null }], { hoy: d(3) })
  ok(r.operaciones.length === 0 && cerca(r.curva[2].valor, 9901), `stop quitado el d2: sigue dentro, 9.901 € el d3 (${r.curva[2].valor})`)
  // Bajar el stop a 97,50 el d2 → el d3 no salta; el d4 abre a 97: hueco.
  r = corre([orden(1, { stop: 98 }), { fecha: d(2), tipo: 'mover', simbolo: 'A', stop: 97.5 }])
  ok(op1(r).motivo === 'stop (hueco)' && op1(r).fechaSalida === d(4), 'stop movido a 97,50: salta el d4 con hueco')
  // Orden de venta corta con un largo abierto = lo cierra (no da la vuelta): el d3 → apertura del d4, 97: (97 − 101) × 49 − 2 = −198.
  r = corre([orden(1), orden(3, { lado: -1 })])
  ok(r.operaciones.length === 1 && op1(r).motivo === 'a mano' && cerca(op1(r).resultado, -198) && !r.posiciones.A, `orden contraria: cierra el largo a 97, −198 €, sin abrir un corto (${op1(r).resultado})`)
  r = corre([orden(1), { fecha: d(3), simbolo: 'A', tipo: 'cerrar' }])
  ok(op1(r).precioSalida === 97 && cerca(op1(r).resultado, -198), '«Cerrar» el d3: vende a la apertura del d4, 97')

  // ── 10 · A mercado al CIERRE ──
  // Orden el d1 con ejecución al cierre → compra a 100, el cierre del d1: 5.000 / 100 = 50; liquidez 10.000 − 5.000 − 1 = 4.999; vale 9.999 €.
  r = corre([orden(1)], { ejecucion: 'cierre' })
  ok(r.posiciones.A.fecha === d(1) && r.posiciones.A.precioMedio === 100 && r.posiciones.A.acciones === 50 && cerca(r.curva[0].valor, 9999), `al cierre: 50 a 100 el mismo d1, 9.999 € (${r.posiciones.A.acciones} ${r.curva[0].valor})`)

  // ── 11 · Comprar más (precio medio) ──
  // d1 invertir 10 % → d2 a 101: 9 acciones (909 €; liquidez 9.090). d2 otra vez 10 % → d3 a 104: dinero a la apertura 9.090 + 9 × 104 = 10.026
  // → 1.002,6 / 104 = 9,6 → 9 más. Precio medio (9 × 101 + 9 × 104) / 18 = 102,50.
  r = corre([orden(1, { tam: { modo: 'invertir', pct: 10 } }), orden(2, { tam: { modo: 'invertir', pct: 10 } })], { hoy: d(3) })
  ok(r.posiciones.A.acciones === 18 && cerca(r.posiciones.A.precioMedio, 102.5), `compra más: 18 acciones a 102,50 de media (${r.posiciones.A.acciones} ${r.posiciones.A.precioMedio})`)

  // ── 12 · Retroceder ──
  const e = sim([orden(1, { stop: 98 }), orden(3, { simbolo: 'A' })], { hoy: d(5) })
  const e2 = M.irA(e, d(2))
  ok(e2.hoy === d(2) && e2.acciones.length === 1 && e2.retrocesos === 1, 'volver al d2 quita la orden del d3 (la del d1 se queda) y suma un retroceso')
  const e3 = M.irA(e2, d(4))
  ok(e3.hoy === d(4) && e3.retrocesos === 1 && e3.acciones.length === 1, 'avanzar no cuenta como retroceso')
  ok(M.irA(e, d(5)) === e, 'ir al mismo día no cambia nada')
  ok(M.irA(e, '2023-01-01').hoy === d(1), 'no se puede volver antes del inicio')
  // Con «hoy» en el d2, el stop del d3 todavía no ha pasado: la posición sigue abierta.
  r = M.calcula(e2, VELAS)
  ok(r.posiciones.A && r.operaciones.length === 0 && r.curva.length === 2, 'en el d2 solo se calcula hasta el d2 (el futuro no se ve)')

  // ── 13 · Dos valores, uno sin vela un día ──
  // El d2 compra B a mercado (invertir 10 %) → B no cotiza el d3: espera al d4, a 53. Dinero el d4 a la apertura: 10.000 → 1.000 / 53 = 18,9 → 18.
  r = M.calcula(sim([orden(2, { simbolo: 'B', tam: { modo: 'invertir', pct: 10 } })], { valores: ['A', 'B'] }), VELAS)
  ok(r.posiciones.B.fecha === d(4) && r.posiciones.B.precioMedio === 53 && r.posiciones.B.acciones === 18, `B no cotiza el d3: compra el d4 a 53, 18 acciones (${r.posiciones.B.fecha} ${r.posiciones.B.acciones})`)
  // El d5 vale 10.000 − 954 − 1 + 18 × 56 = 10.053.
  ok(cerca(r.curva[4].valor, 10053), `valorado el d5: 10.053 € (${r.curva[4].valor})`)

  // ── 14 · Sin dinero: no compra ──
  r = corre([orden(1, { tam: { modo: 'invertir', pct: 100 } }), orden(2, { tam: { modo: 'invertir', pct: 50 } })], { hoy: d(4) })
  ok(r.posiciones.A.acciones === 99 && r.avisos.some(a => /no llega el dinero/.test(a.texto)), 'todo invertido: la segunda compra no cabe y lo avisa')

  // ── 15 · §249: CAGR, invertido de media y tiempo con algo dentro ──
  // Compra a mercado el d1 (invertir 50 %) → el d2 a 101: 5.000 / 101 = 49,5 → 49 acciones; liquidez 10.000 − 4.949 − 1 = 5.050.
  // Al cierre: d1 nada dentro · d2 49 × 104 = 5.096 (tu dinero 10.146) · d3 4.851 (9.901) · d4 4.704 (9.754) · d5 5.292 (10.342) · d6 5.439 (10.489).
  r = corre([orden(1)])
  const cf15 = M.cifras(sim([orden(1)]), VELAS, r)
  ok(r.curva[0].invertido === 0 && r.curva[1].invertido === 5096 && r.curva[5].invertido === 5439, `invertido al cierre: d1 0, d2 5.096, d6 5.439 (${r.curva.map(c => c.invertido).join(', ')})`)
  const media15 = (0 + 5096 / 10146 + 4851 / 9901 + 4704 / 9754 + 5292 / 10342 + 5439 / 10489) / 6 * 100
  ok(cerca(cf15.invertidoMedia, media15) && Math.abs(cf15.invertidoMedia - 41.75) < 0.01, `invertido de media ≈ 41,75 % (${cf15.invertidoMedia})`)
  ok(cerca(cf15.tiempoDentro, 5 / 6 * 100), `tiempo con algo dentro: 5 de 6 velas = 83,3 % (${cf15.tiempoDentro})`)
  ok(cf15.cagr === null && cf15.dias === 7, 'del 02/01 al 09/01 son 7 días: con menos de 90 no hay CAGR')
  // CAGR: 10.000 → 12.100 en dos años (730 días) = 1,21^(365,25 / 730) − 1 ≈ 10,0 %.
  const cagr15 = M.cifras(sim([], { desde: '2022-01-01', hoy: '2024-01-01' }), VELAS, { curva: [{ fecha: '2022-01-01', valor: 10000, invertido: 0 }, { fecha: '2024-01-01', valor: 12100, invertido: 0 }], operaciones: [], comisiones: 0, ordenes: 0 })
  ok(Math.abs(cagr15.cagr - 10.007) < 0.001, `10.000 → 12.100 en 2 años: CAGR ≈ 10,0 % (${cagr15.cagr})`)

  console.log(fallos ? `replay: ${fallos} fallos` : 'replay: todas bien')
  process.exit(fallos ? 1 : 0)
})().catch(e => { console.error('ERROR', e); process.exit(2) })
