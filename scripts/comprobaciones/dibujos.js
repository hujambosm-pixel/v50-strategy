// scripts/comprobaciones/dibujos.js — las CUENTAS de los dibujos sobre el gráfico (lib/dibujos/geometria.js, docs/builder.md §207).
// Las corre comunes.sh. Termina en 0 si todo da lo esperado. Todas las cifras, calculadas a mano (el 01/01/2024 fue lunes).
//
// VELAS DIARIAS: mar 02/01, mié 03/01, jue 04/01, vie 05/01, lun 08/01/2024 → índices 0 a 4.
//   El jueves 04/01 es la vela 2. El sábado 06/01 cae entre el viernes (3) y el lunes (4), que están a 3 días: 3 + 1/3.
//   Futuro: del lun 08/01 al mié 10/01 hay 2 sesiones (mar, mié) → 4 + 2 = 6; al lun 15/01, 5 sesiones (9, 10, 11, 12, 15) → 9.
//   Pasado: del vie 29/12/2023 al mar 02/01 hay 2 sesiones (lun 01, mar 02) → −2.
// VELAS SEMANALES: lunes 01/01, 08/01, 15/01 y 22/01/2024 → índices 0 a 3. El mié 10/01 está 2 días después del lun 08/01: 1 + 2/7.
//   El lun 05/02 está 14 días después del 22/01: 3 + 2 = 5. La vela −1 es el lun 25/12/2023.
process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://arnes.invalid'; process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'clave-falsa-del-arnes'
const C0 = require('./cargador'), R = C0.RAIZ
let fallos = 0
const ok = (c, t) => { console.log(`${c ? 'OK  ' : 'MAL '} ${t}`); if (!c) fallos++ }
const cerca = (a, b, tol = 1e-9) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tol * Math.max(1, Math.abs(b))
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b)

;(async () => {
  await C0.prepara(); C0.registra(R)
  const G = require(R + '/lib/dibujos/geometria.js')

  // ── Fechas ↔ velas ──
  const D = ['2024-01-02', '2024-01-03', '2024-01-04', '2024-01-05', '2024-01-08']
  const S = ['2024-01-01', '2024-01-08', '2024-01-15', '2024-01-22']
  ok(G.intervaloDe(D) === 'diario', 'las velas de lunes a viernes son diarias')
  ok(G.intervaloDe(S) === 'semanal', 'las de lunes a lunes son semanales')
  const ed = G.escala(D), es = G.escala(S)
  ok(G.indiceDeFecha(ed, '2024-01-04') === 2, 'diario: el jueves 04/01 es la vela 2')
  ok(cerca(G.indiceDeFecha(ed, '2024-01-06'), 3 + 1 / 3), 'diario: el sábado 06/01 queda a 1/3 entre el viernes y el lunes (3,333)')
  ok(G.indiceDeFecha(ed, '2024-01-10') === 6, 'diario, futuro: el miércoles 10/01 es la vela 6 (2 sesiones tras la última)')
  ok(G.indiceDeFecha(ed, '2024-01-15') === 9, 'diario, futuro: el lunes 15/01 es la vela 9 (5 sesiones tras la última)')
  ok(G.indiceDeFecha(ed, '2023-12-29') === -2, 'diario, pasado: el viernes 29/12/2023 es la vela −2')
  ok(G.fechaDeIndice(ed, 2) === '2024-01-04', 'diario: la vela 2 es el 04/01')
  ok(G.fechaDeIndice(ed, 6) === '2024-01-10' && G.fechaDeIndice(ed, 9) === '2024-01-15', 'diario, futuro: las velas 6 y 9 vuelven al 10/01 y al 15/01')
  ok(G.fechaDeIndice(ed, 5.4) === '2024-01-09', 'diario: 5,4 se redondea a la vela 5, el martes 09/01')
  ok(G.fechaDeIndice(ed, -2) === '2023-12-29', 'diario, pasado: la vela −2 vuelve al 29/12/2023')
  let ida = true
  for (let k = -12; k <= 30; k++) if (G.indiceDeFecha(ed, G.fechaDeIndice(ed, k)) !== k) ida = false
  ok(ida, 'diario: de la vela −12 a la 30, vela → fecha → vela da la misma vela')
  ok(cerca(G.indiceDeFecha(es, '2024-01-10'), 1 + 2 / 7), 'semanal: el miércoles 10/01 cae a 2/7 de vela tras el lunes 08/01 (1,286)')
  ok(G.indiceDeFecha(es, '2024-02-05') === 5 && G.fechaDeIndice(es, 5) === '2024-02-05', 'semanal, futuro: el lunes 05/02 es la vela 5 y vuelve')
  ok(G.fechaDeIndice(es, -1) === '2023-12-25', 'semanal, pasado: la vela −1 es el lunes 25/12/2023')
  ok(G.indiceDeFecha(G.escala([]), '2024-01-01') === null && G.fechaDeIndice(G.escala([]), 0) === null, 'sin velas no hay sitio (null)')

  // ── Rectas, canal, imán ──
  const a = { i: 0, p: 100 }, b = { i: 4, p: 120 }
  ok(cerca(G.precioEnRecta(a, b, 10), 150), 'la recta de (0; 100) a (4; 120) en la vela 10 vale 100 + 20 × 10 / 4 = 150 (la línea hacia la derecha)')
  ok(G.precioEnRecta(a, { i: 0, p: 130 }, 5) === 100, 'dos puntos en la misma vela: el precio del primero')
  ok(igual(G.paralela(a, b, { i: 2, p: 105 }), [{ i: 0, p: 95 }, { i: 4, p: 115 }]), 'canal: por (2; 105), donde la recta vale 110 → paralela 5 más abajo: 95 y 115')
  const v = { open: 10, high: 12, low: 9, close: 11 }
  ok(G.iman(v, 11.6) === 12 && G.iman(v, 9.4) === 9 && G.iman(v, 10.4) === 10, 'imán: 11,6 → 12 (máximo); 9,4 → 9 (mínimo); 10,4 → 10 (apertura)')
  ok(G.iman(null, 7) === 7, 'imán sin vela: el precio tal cual')

  // ── Fibonacci y medir ──
  const f = G.nivelesFibonacci(100, 150)
  ok(igual(f.map(x => x.nivel), [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1]), 'Fibonacci: los 7 niveles de siempre')
  const esperados = [150, 138.2, 130.9, 125, 119.1, 110.7, 100]
  ok(f.every((x, k) => cerca(x.precio, esperados[k])), 'Fibonacci de 100 a 150: 150 · 138,20 · 130,90 · 125 · 119,10 · 110,70 · 100')
  const m = G.medir({ i: 2, p: 50 }, { i: 7, p: 60 })
  ok(cerca(m.diferencia, 10) && cerca(m.porcentaje, 20) && m.velas === 5, 'medir de (2; 50) a (7; 60): +10, +20 %, 5 velas')
  const m2 = G.medir({ i: 7, p: 60 }, { i: 2, p: 45 })
  ok(cerca(m2.diferencia, -15) && cerca(m2.porcentaje, -25) && m2.velas === 5, 'medir hacia atrás y bajando: −15, −25 %, 5 velas')

  // ── Posición larga y corta ──
  const p1 = G.accionesPorRiesgo(182.4, 178, 100)
  ok(p1.acciones === 22 && cerca(p1.invertido, 4012.8) && cerca(p1.riesgo, 96.8), 'arriesgo 100 €, entrada 182,40, stop 178,00: 100 ÷ 4,40 = 22,7 → 22 acciones, 4.012,80 €, arriesgas 96,80 €')
  const p2 = G.accionesPorRiesgo(50, 48, 100)
  ok(p2.acciones === 50 && cerca(p2.invertido, 2500) && cerca(p2.riesgo, 100), 'justo: 100 ÷ 2 = 50 acciones (no 49), 2.500 €')
  const p3 = G.accionesPorRiesgo(100, 105, 100)
  ok(p3.acciones === 20, 'corta (stop por encima): 100 ÷ 5 = 20 acciones')
  ok(G.accionesPorRiesgo(100, 100, 100).acciones === 0 && G.accionesPorRiesgo(100, 95, 0).acciones === 0, 'stop igual a la entrada, o arriesgar 0 €: 0 acciones')
  ok(G.objetivoPorDefecto(100, 95) === 110 && G.objetivoPorDefecto(100, 105) === 90, 'objetivo a 2 R: larga 100/95 → 110; corta 100/105 → 90')
  const c = G.cifrasPosicion(100, 95, 110)
  ok(cerca(c.pierdePct, 5) && cerca(c.ganaPct, 10) && cerca(c.rr, 2), 'larga 100 / stop 95 / objetivo 110: pierde 5 %, gana 10 %, R:R 2')
  ok(G.posicionValida('larga', 100, 95, 110) && !G.posicionValida('larga', 100, 105, 110) && G.posicionValida('corta', 100, 105, 90) && !G.posicionValida('corta', 100, 95, 90), 'stop y objetivo al lado que toca (larga y corta)')
  const V = [
    { date: '2024-01-02', high: 101, low: 99 },   // 0: la vela de entrada
    { date: '2024-01-03', high: 104, low: 97 },   // 1
    { date: '2024-01-04', high: 111, low: 99 },   // 2
    { date: '2024-01-05', high: 112, low: 90 },   // 3
    { date: '2024-01-08', high: 108, low: 95 },   // 4
    { date: '2024-01-09', high: 107, low: 96 },   // 5
  ]
  ok(igual(G.resultadoPosicion('larga', 95, 110, V, 0), { que: 'objetivo', fecha: '2024-01-04' }), 'larga stop 95 / objetivo 110: la vela 1 no toca; la 2 llega a 111 → objetivo el 04/01')
  ok(igual(G.resultadoPosicion('larga', 98, 110, V, 0), { que: 'stop', fecha: '2024-01-03' }), 'larga stop 98: la vela 1 baja a 97 → stop el 03/01')
  ok(igual(G.resultadoPosicion('larga', 99.5, 110, V, 1), { que: 'stop', fecha: '2024-01-04' }), 'en la vela 2 toca los dos (99 y 111): cuenta el STOP, por prudencia')
  ok(igual(G.resultadoPosicion('corta', 105, 92, V, 0), { que: 'stop', fecha: '2024-01-04' }), 'corta stop 105 / objetivo 92: la vela 2 sube a 111 → stop el 04/01')
  ok(igual(G.resultadoPosicion('corta', 113, 92, V, 0), { que: 'objetivo', fecha: '2024-01-05' }), 'corta stop 113: la vela 3 baja a 90 → objetivo el 05/01')
  ok(igual(G.resultadoPosicion('larga', 50, 200, V, 0), { que: 'abierta' }), 'sin tocar ni stop ni objetivo: abierta')
  ok(G.resultadoPosicion('larga', 95, 110, V, 5).que === 'abierta' && G.resultadoPosicion('larga', 95, 110, V, 7).que === 'futuro', 'entrada en la última vela: abierta; a la derecha de la última: futuro')

  // ── Lo que se guarda ──
  const bueno = { id: 'd1', tipo: 'tendencia', puntos: [{ fecha: '2024-01-02', precio: 185.5 }, { fecha: '2024-03-01', precio: 179.2 }], color: '#4c9aff', grosor: 2, sobra: 1 }
  ok(igual(G.limpiaDibujo(bueno), { id: 'd1', tipo: 'tendencia', puntos: bueno.puntos, color: '#4c9aff', grosor: 2 }), 'un dibujo bueno se guarda tal cual, sin lo que sobra')
  ok(G.limpiaDibujo({ ...bueno, tipo: 'circulo' }) === null, 'un tipo que no existe: fuera')
  ok(G.limpiaDibujo({ ...bueno, puntos: bueno.puntos.slice(0, 1) }) === null, 'una línea con un solo punto: fuera')
  ok(G.limpiaDibujo({ ...bueno, puntos: [{ fecha: '02/01/2024', precio: 1 }, bueno.puntos[1]] }) === null, 'una fecha mal escrita: fuera')
  ok(G.limpiaDibujo({ ...bueno, puntos: [{ fecha: '2024-01-02', precio: -1 }, bueno.puntos[1]] }) === null, 'un precio negativo: fuera')
  const raro = G.limpiaDibujo({ ...bueno, color: 'rojo', grosor: 9 })
  ok(raro && raro.color === undefined && raro.grosor === undefined, 'un color o un grosor raros se quitan (se pintará con los de siempre)')
  const tx = G.limpiaDibujo({ id: 't', tipo: 'texto', puntos: [{ fecha: '2024-01-02', precio: 10 }], texto: 'x'.repeat(250) })
  ok(tx && tx.texto.length === 200, 'texto: como mucho 200 letras')
  const po = G.limpiaDibujo({ id: 'p', tipo: 'larga', puntos: [{ fecha: '2024-01-02', precio: 100 }, { fecha: '2024-01-20', precio: 95 }, { fecha: '2024-01-02', precio: 110 }], arriesgo: 100 })
  ok(po && po.arriesgo === 100 && po.puntos.length === 3, 'posición larga: 3 puntos y lo que arriesgas')
  const lista = G.limpiaDibujos([bueno, { ...bueno }, { id: 'd2', tipo: 'horizontal', puntos: [{ fecha: '2024-02-01', precio: 190 }] }, null, 'x'])
  ok(lista.length === 2 && lista[0].id === 'd1' && lista[1].id === 'd2', 'la lista: fuera los repetidos y lo que no es un dibujo')
  ok(G.limpiaDibujos('no').length === 0, 'algo que no es una lista: lista vacía')
  const muchos = Array.from({ length: 320 }, (_, k) => ({ id: 'h' + k, tipo: 'horizontal', puntos: [{ fecha: '2024-02-01', precio: 1 + k }] }))
  ok(G.limpiaDibujos(muchos).length === G.MAX_DIBUJOS, 'como mucho 300 dibujos por valor')
  ok(Buffer.byteLength(JSON.stringify(G.limpiaDibujos(muchos.map(x => ({ ...x, color: '#4c9aff', grosor: 2 }))))) < 204800, '300 dibujos caben en los 200 KB de la tabla')

  console.log(fallos ? `dibujos: ${fallos} fallos` : 'dibujos: todas bien')
  process.exit(fallos ? 1 : 0)
})().catch(e => { console.error('ERROR', e); process.exit(2) })
