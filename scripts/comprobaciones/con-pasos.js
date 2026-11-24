// scripts/comprobaciones/con-pasos.js — «Condición con pasos» (lib/condiciones/conPasos.js, docs/builder.md §243) con velas INVENTADAS
// y lo esperado calculado a mano. Las corre comunes.sh. Termina en 0 si todo da lo esperado.
// Delante de cada serie, 5 velas planas a 100 (k < 0). F(k) = la fecha de la vela k. Las velas son planas (abre = máx = mín = cierre).
const C0 = require('./cargador'), R = C0.RAIZ
let fallos = 0
const ok = (c, t) => { console.log(`${c ? 'OK  ' : 'MAL '} ${t}`); if (!c) fallos++ }
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const P = 5
const fecha = (i) => new Date(Date.UTC(2020, 0, 1) + i * 864e5).toISOString().slice(0, 10)
const serie = (cs) => [...Array(P).fill(100), ...cs].map((c, i) => ({ date: fecha(i), open: c, high: c, low: c, close: c, volume: 1000 }))
const F = (k) => fecha(P + k)
const Fs = (...ks) => ks.map(F)

// B: 100 hasta k0; sube 1 al día k1–k10 (101…110); baja 2 al día k11–k19 (108…92); k20–k25: 100, 101…105.
// «Cierre de B por ENCIMA de su SMA 3»: k0 no (100 = 100); k1 sí (101 > (100+100+101)/3 = 100,33) … k10 sí (110 > 109);
// k11 no (108 < (109+110+108)/3 = 109); k12–k19 no (bajando); k20 sí (100 > (94+92+100)/3 = 95,33); k21–k25 sí.
// «… por DEBAJO»: pasa a cumplirse en k11 (k10: 110 > 109).
const B = serie([100, ...Array.from({ length: 10 }, (_, j) => 101 + j), ...Array.from({ length: 9 }, (_, j) => 108 - 2 * j), 100, 101, 102, 103, 104, 105])
const sma3 = (lado) => ({ quien: 'B', velas: 'diarias', si: { c: 'precioVsMedia', p: { lado, tipo: 'SMA', periodo: 3 } } })
const mov = (m, pct, desde, extra = {}) => ({ mov: m, pct, desde, quien: 'A', ...extra })

;(async () => {
  await C0.prepara(); C0.registra(R)
  const K = require(R + '/lib/condiciones/conPasos.js')
  const S = require(R + '/lib/replay/senales.js')
  const corre = (A, def, op = {}) => { const v = { A, B }; return K.senalesConPasos(def, (q) => v[q] || [], A.map(x => x.date), { simbolo: 'A', ...op }) }

  // ── Ejemplo 1: cae un 10 % desde el máximo histórico (señal); después, cada ±10 % desde la última señal; vuelve a empezar con un máximo
  // histórico nuevo. A (k0…k17): 100 105 110 100 98,9 97 90 95 99 100 89 85 80 79 112 120 107,5 107.
  //   k4: 98,9 ≤ 110 × 0,90 = 99 → SEÑAL (paso 1). Desde 98,9: ±10 % = 89,01 / 108,79. k6: 90 no. k10: 89 ≤ 89,01 → SEÑAL (paso 2).
  //   Desde 89: 80,10 / 97,90. k12: 80 → SEÑAL. Desde 80: 72 / 88. k14: 112 ≥ 88, pero es un máximo histórico nuevo (112 > 110):
  //   antes de mirar los pasos, vuelve a esperar el paso 1 → NO hay señal. k15: 120 (máximo). k16: 107,5 ≤ 108 → SEÑAL (paso 1).
  //   k17: 107, desde 107,5: 96,75 / 118,25 → no.
  const A1 = serie([100, 105, 110, 100, 98.9, 97, 90, 95, 99, 100, 89, 85, 80, 79, 112, 120, 107.5, 107])
  const ej1 = { version: 1, mientras: null, paso1: { filas: [mov('cae', 10, 'maxHist')], daSenal: true }, paso2: { filas: [mov('mueve', 10, 'senal')] }, anula: null, veces: 'cada', empieza: 'maxHist' }
  ok(K.validaConPasos(ej1).length === 0, 'ejemplo 1: la definición es válida')
  const r1 = corre(A1, ej1)
  ok(igual(r1.senales, Fs(4, 10, 12, 16)), `ejemplo 1: señales en k4, k10, k12 y k16 (k14 no: máximo histórico nuevo) (${JSON.stringify(r1.senales)})`)
  const d4 = r1.detalle[0].movimientos[0]
  ok(r1.detalle[0].paso === 1 && d4.desde === 'maxHist' && d4.precioRef === 110 && d4.fechaRef === F(2) && d4.precio === 98.9 && Math.abs(d4.cambio - (98.9 / 110 - 1)) < 1e-12,
    `«por qué» de k4: paso 1, máximo histórico 110 del ${F(2)}, cierre 98,9, ${(d4.cambio * 100).toFixed(2)} % (para la línea del gráfico)`)
  const d10 = r1.detalle[1].movimientos[0]
  ok(r1.detalle[1].paso === 2 && d10.precioRef === 98.9 && d10.fechaRef === F(4) && d10.precio === 89, 'k10: paso 2, desde la señal de k4 (98,9)')
  ok(r1.eventos.some(e => e.tipo === 'reinicio' && e.fecha === F(14)), 'k14: «vuelve a empezar» (máximo histórico nuevo)')
  // Solo la primera vez, sin paso 2: k4 y, tras el máximo nuevo de k14, k16.
  ok(igual(corre(A1, { ...ej1, paso2: null, veces: 'primera' }).senales, Fs(4, 16)), 'solo el paso 1, «solo la primera vez» y vuelve a empezar con un máximo nuevo: k4 y k16')
  ok(igual(corre(A1, { ...ej1, paso2: null, veces: 'primera', empieza: 'nunca' }).senales, Fs(4)), '… y con «nunca»: solo k4')

  // ── Ejemplo 2: mientras el cierre de B esté sobre su SMA 3 (tramos k1–k10 y desde k20), cada vez que A cae un 5 %…
  // A (k0…k25): 100 100 104 98,5 99 98 93 93 93 93 93, k11–k20 80, k21–k25 75.
  //   «… desde el máximo del tramo»: tramo 1 desde k1 (100); k2 104 → máximo 104, umbral 98,8. k3: 98,5 → SEÑAL. k4: 99 no. k5: 98 → SEÑAL
  //   (vuelve a cruzar). k6: 93, seguía cumpliéndose → no. Tramo 2 desde k20: máximo 80, umbral 76; k21: 75 → SEÑAL. → k3, k5, k21.
  //   «… desde el máximo desde la última señal»: k3 SEÑAL (98,5). k4 99 → máximo 99, umbral 94,05. k5 98 no. k6 93 → SEÑAL. k21 → SEÑAL.
  const A2 = serie([100, 100, 104, 98.5, 99, 98, 93, 93, 93, 93, 93, ...Array(10).fill(80), 75, 75, 75, 75, 75])
  const ej2 = (desde) => ({ version: 1, mientras: { filas: [sma3('encima')] }, paso1: { filas: [mov('cae', 5, desde)] }, paso2: null, anula: null, veces: 'cada', empieza: 'tramo' })
  const r2a = corre(A2, ej2('maxTramo')), r2b = corre(A2, ej2('maxSenal'))
  ok(igual(r2a.senales, Fs(3, 5, 21)), `ejemplo 2 «desde el máximo del tramo»: k3, k5 y k21 (salta otra vez al volver a cruzar el −5 %) (${JSON.stringify(r2a.senales)})`)
  ok(igual(r2b.senales, Fs(3, 6, 21)), `ejemplo 2 «desde el máximo desde la última señal»: k3, k6 y k21 (una por caída) (${JSON.stringify(r2b.senales)})`)
  ok(igual(r2a.tramos, [{ desde: F(1), hasta: F(10) }, { desde: F(20), hasta: null }]), `tramos: k1–k10 y desde k20 (${JSON.stringify(r2a.tramos)})`)
  ok(r2a.detalle[0].movimientos[0].precioRef === 104 && r2a.detalle[0].movimientos[0].fechaRef === F(2) && r2a.detalle[2].movimientos[0].precioRef === 80 && r2a.detalle[2].movimientos[0].fechaRef === F(20),
    'el máximo del tramo: 104 (k2) en el 1.º; en el 2.º empieza de cero: 80 (k20)')

  // ── Ejemplo 3: primero B cruza por encima de su SMA 3 (k1 y k20); después, la PRIMERA vez que A cae un 5 % desde el precio del paso 1;
  // se anula si B pasa por debajo de su SMA 3 (k11); vuelve a empezar con el siguiente paso 1.
  // A (k0…k25): 100 100 98 95 90 96 94 94 94 94 94, k11–k20 80, k21–k25 75.
  //   k1: armado (A = 100, umbral 95). k3: 95 → SEÑAL; «solo la primera» → hecho. k6 (94) no cuenta. k20: armado otra vez (80, umbral 76).
  //   k21: 75 → SEÑAL. → k3, k21. Con «cada vez»: k3; k4 90 seguía; k5 96 deja de cumplirse; k6 94 → SEÑAL; k11 se anula; k20 arma; k21. → k3, k6, k21.
  const A3 = serie([100, 100, 98, 95, 90, 96, 94, 94, 94, 94, 94, ...Array(10).fill(80), 75, 75, 75, 75, 75])
  const ej3 = { version: 1, mientras: null, paso1: { filas: [sma3('encima')], daSenal: false }, paso2: { filas: [mov('cae', 5, 'paso1')] }, anula: { filas: [sma3('debajo')] }, veces: 'primera', empieza: 'paso1' }
  ok(K.validaConPasos(ej3).length === 0, 'ejemplo 3: válido')
  const r3 = corre(A3, ej3)
  ok(igual(r3.senales, Fs(3, 21)), `ejemplo 3 «solo la primera»: k3 y k21 (${JSON.stringify(r3.senales)})`)
  ok(igual(r3.eventos.filter(e => e.tipo === 'armado').map(e => e.fecha), Fs(1, 20)), 'armado en k1 y k20')
  ok(igual(corre(A3, { ...ej3, veces: 'cada' }).senales, Fs(3, 6, 21)), 'ejemplo 3 «cada vez»: k3, k6 y k21')
  ok(igual(corre(A3, { ...ej3, paso1: { ...ej3.paso1, daSenal: true } }).senales, Fs(1, 3, 20, 21)), 'con «el paso 1 también da señal»: k1, k3, k20 y k21')
  // Se anula: A no cae hasta k12 (94), pero en k11 B pasa por debajo de su SMA 3 → se olvida el paso 1; k20 arma; k21 → SEÑAL.
  const A3b = serie([...Array(12).fill(100), ...Array(8).fill(94), 80, 75, 75, 75, 75, 75])
  const r3b = corre(A3b, ej3)
  ok(igual(r3b.senales, Fs(21)) && r3b.eventos.some(e => e.tipo === 'anulado' && e.fecha === F(11)), `se anula en k11: la caída de k12 no da señal; solo k21 (${JSON.stringify(r3b.senales)})`)
  ok(igual(corre(A3b, { ...ej3, anula: null }).senales, Fs(12, 21)), 'sin «se anula si»: k12 (94 ≤ 95) y k21')

  // ── «Desde tu última compra» (Replay): compra a 85 el día k2 → umbral del −10 %: 76,5. A: 100 100 100 90 80 76 → k5. Sin compra: nada.
  const A4 = serie([100, 100, 100, 90, 80, 76])
  const ej4 = { version: 1, mientras: null, paso1: { filas: [mov('cae', 10, 'compra')] }, paso2: null, anula: null, veces: 'cada', empieza: 'nunca' }
  ok(igual(corre(A4, ej4, { compras: [{ fecha: F(2), precio: 85 }] }).senales, Fs(5)), 'desde tu última compra (85 el k2): k5 (76 ≤ 76,5)')
  ok(corre(A4, ej4).senales.length === 0, 'sin compras, «desde tu última compra» no se cumple nunca')
  ok(corre(A4, { ...ej4, paso1: { filas: [mov('cae', 10, 'senal')] } }).senales.length === 0, '«desde la última señal» sin ninguna señal todavía: nada')
  // «sube» desde el mínimo desde la última señal: A 100 95 90 99 → desde 90, +10 % = 99 → k3.
  ok(igual(corre(serie([100, 95, 90, 99]), { ...ej4, paso1: { filas: [mov('sube', 10, 'minSenal')] } }).senales, Fs(3)), 'sube un 10 % desde el mínimo (90): k3 (99)')

  // ── Varias filas: «cae 10 % desde el máximo histórico» o bien «cierre de B sobre su SMA 3» → k1 (B) y k4 (A1: 98,9) … como grupos sueltos.
  const r5 = corre(A1, { ...ej4, paso1: { filas: [mov('cae', 10, 'maxHist'), { ...sma3('encima'), union: 'O' }] } })
  ok(igual(r5.senales.slice(0, 2), Fs(1, 4)), `«o bien»: cada parte por separado: k1 (B cruza) y k4 (A cae) (${JSON.stringify(r5.senales.slice(0, 3))})`)

  // ── Solo con filas del catálogo, «cada vez»: lo mismo que la señal del Replay de hoy (senalesCondicion).
  const fech = A1.map(x => x.date), vd = (q) => ({ A: A1, B }[q] || [])
  ok(igual(K.senalesConPasos({ ...ej4, paso1: { filas: [sma3('encima')] } }, vd, fech, { simbolo: 'A' }).senales, S.senalesCondicion([sma3('encima')], vd, fech)), 'solo catálogo y «cada vez» = senalesCondicion (k1 y k20)')

  // ── Validar ──
  const errores = (d) => K.validaConPasos(d).join(' | ')
  ok(/Falta el paso 1/.test(errores({ ...ej4, paso1: null })), 'sin paso 1: lo dice')
  ok(/solo tiene sentido con un paso 2/.test(errores({ ...ej4, anula: { filas: [sma3('debajo')] } })), '«se anula si» sin paso 2: lo dice')
  ok(/necesita un «Mientras…»/.test(errores({ ...ej4, paso1: { filas: [mov('cae', 5, 'maxTramo')] } })), '«el máximo del tramo» sin «Mientras»: lo dice')
  ok(/solo vale en el paso 2/.test(errores({ ...ej4, paso1: { filas: [mov('cae', 5, 'paso1')] } })), '«el precio del paso 1» en el paso 1: lo dice')
  ok(/necesita un paso 2/.test(errores({ ...ej4, empieza: 'paso1' })) && /necesita un «Mientras…»/.test(errores({ ...ej4, empieza: 'tramo' })), '«vuelve a empezar» con lo que falta: lo dice')
  ok(/mayor que 0/.test(errores({ ...ej4, paso1: { filas: [mov('cae', 0, 'maxHist')] } })) && /«y además» u «o bien»/.test(errores({ ...ej4, paso1: { filas: [mov('cae', 5, 'maxHist'), mov('sube', 5, 'maxHist')] } })), 'el % y la unión entre filas, comprobados')
  ok(/solo condiciones del catálogo/.test(errores({ ...ej2('maxTramo'), mientras: { filas: [mov('cae', 5, 'maxHist')] } })), '«Mientras» con un «cae un %»: lo dice')
  ok(corre(A1, { ...ej4, paso1: null }).senales.length === 0, 'una definición con errores no da señales')
  ok(igual(K.simbolosConPasos(ej3), ['B', 'A']), 'símbolos que hacen falta: B y A')

  console.log(fallos ? `\n${fallos} FALLOS` : '\nTodo en verde')
  process.exit(fallos ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
