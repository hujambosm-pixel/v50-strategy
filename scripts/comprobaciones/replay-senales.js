// scripts/comprobaciones/replay-senales.js — «Saltar a la señal» del Replay (lib/replay/senales.js, docs/builder.md §231) con velas
// INVENTADAS y lo esperado calculado a mano. Las corre comunes.sh. Termina en 0 si todo da lo esperado.
//
// Velas planas [abre 100, máx 101, mín 99, cierre 100] (260 delante para el calentamiento) y estas 40:
//   · vela 10 cierra a 105 (> 101, máximo de las 2 anteriores) → señal de «Nuevo máximo de 2 velas».
//   · vela 12 cierra a 110 (> 106): señal, pero con la operación abierta (compró a la apertura de la 11, vende por tiempo a la de la 14).
//   · vela 30 cierra a 105 → señal.
// Estrategia: nuevo máximo de 2 velas, compra a la apertura siguiente, stop 5 %, salida por tiempo 3 velas → señales en las velas 10 y 30.
// Condición del catálogo: la vela en que PASA a cumplirse (cuentas de la SMA 3 junto a su prueba).
const C0 = require('./cargador'), R = C0.RAIZ, D = require('./domFalso')
let fallos = 0
const ok = (c, t) => { console.log(`${c ? 'OK  ' : 'MAL '} ${t}`); if (!c) fallos++ }
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const PRE = 260
const fecha = (i) => new Date(Date.UTC(2020, 0, 1) + i * 864e5).toISOString().slice(0, 10)
const velasSin = (xs) => xs.map(([open, high, low, close], i) => ({ date: fecha(i), open, high, low, close, volume: 1000 }))
const PLANA = [100, 101, 99, 100]
const xs = Array.from({ length: 40 }, () => PLANA)
xs[10] = [100, 106, 99, 105]; xs[12] = [105, 111, 104, 110]; xs[30] = [100, 106, 99, 105]
const VELAS = velasSin([...Array.from({ length: PRE }, () => PLANA), ...xs])
const F = (k) => VELAS[PRE + k].date

;(async () => {
  await C0.prepara(); C0.registra(R)
  const S = require(R + '/lib/replay/senales.js')
  const { validaDefinicion } = require(R + '/lib/editor/definicion.js')
  const def = { tipo: 'editor', formato: 1, motor: 1, nombre: 'prueba', parametros: { version: 1, lista: [] },
    entrada: { senal: { c: 'nuevoMaximo', p: { n: 2 } }, orden: { tipo: 'apertura' } },
    stops: [{ id: 'porcentaje1', tipo: 'porcentaje', motivo: 'stop', pct: 5 }], salidas: [{ tipo: 'tope', velas: 3, motivo: 'tiempo' }] }
  ok(validaDefinicion(def).length === 0, 'la estrategia de prueba es válida')

  // ── Estrategia ──
  const e = S.senalesEstrategia({ def, velas: VELAS })
  ok(igual(e, [F(10), F(30)]), `estrategia: señales en las velas 10 y 30; la 12 no cuenta (operación abierta) (${JSON.stringify(e)})`)
  ok(igual(S.senalesEstrategia({ def, velas: [...VELAS.slice(0, PRE + 31), { ...VELAS[PRE + 31], enCurso: true }] }), [F(10), F(30)]), 'la vela en curso no se usa')
  // Sin mirar el futuro: con las velas solo hasta la 20, las señales hasta la 20 son las mismas.
  ok(igual(S.senalesEstrategia({ def, velas: VELAS.slice(0, PRE + 21) }), [F(10)]), 'cortando las velas en la 20, la señal de la 10 sale igual (no depende de lo que viene)')

  // ── Condición del catálogo: el cierre cruza por encima de nada… «nuevo máximo de 2 velas» como condición de un momento ──
  const fila = (si) => [{ quien: 'A', velas: 'diarias', si }]
  const velasDe = (q) => (q === 'A' ? VELAS : [])
  const fechas = VELAS.map(v => v.date)
  const c1 = S.senalesCondicion(fila({ c: 'nuevoMaximo', p: { n: 2 } }), velasDe, fechas)
  ok(igual(c1, [F(10), F(12), F(30)]), `condición «nuevo máximo de 2 velas»: 10, 12 y 30 (aquí no hay operación que la tape) (${JSON.stringify(c1)})`)
  // De estado: cierre por encima de la SMA 3. Vela 10: (100+100+105)/3 = 101,67 < 105 → sí (la 9 no). Vela 11: (100+105+100)/3 = 101,67 > 100 → no.
  // Vela 12: (105+100+110)/3 = 105 < 110 → sí. Vela 13: (100+110+100)/3 = 103,3 > 100 → no. Vela 30: sí. → 10, 12, 30.
  const c2 = S.senalesCondicion(fila({ c: 'precioVsMedia', p: { lado: 'encima', tipo: 'SMA', periodo: 3 } }), velasDe, fechas)
  ok(igual(c2, [F(10), F(12), F(30)]), `condición de estado «cierre sobre la SMA 3»: la vela en que PASA a cumplirse: 10, 12 y 30 (${JSON.stringify(c2)})`)
  // Con una SMA 1 el cierre nunca está por encima de sí mismo → ninguna.
  ok(S.senalesCondicion(fila({ c: 'precioVsMedia', p: { lado: 'encima', tipo: 'SMA', periodo: 1 } }), velasDe, fechas).length === 0, 'una condición que nunca se cumple: sin señales')

  // ── §240: «y además» / «o bien» ──
  // A = cierre SOBRE la SMA 3 (10, 12, 30, como arriba). B = cierre BAJO la SMA 3: vela 11: 100 < 101,67 sí (la 10 no); 12: 110 > 105 no;
  // 13: 100 < 103,33 sí; 14: 100 < (110+100+100)/3 = 103,33 sí; 15: 100 = 100 no; 31: 100 < (100+105+100)/3 = 101,67 sí (la 30 no);
  // 32: 100 < 101,67 sí; 33: 100 no. → B: 11, 13, 31.
  const sma = (lado) => ({ quien: 'A', velas: 'diarias', si: { c: 'precioVsMedia', p: { lado, tipo: 'SMA', periodo: 3 } } })
  const A = sma('encima'), Bf = sma('debajo')
  ok(igual(S.senalesCondicion([Bf], velasDe, fechas), [F(11), F(13), F(31)]), `B «cierre bajo la SMA 3» sola: 11, 13 y 31`)
  const o = S.senalesCondicion([A, { ...Bf, union: 'O' }], velasDe, fechas)
  ok(igual(o, [F(10), F(11), F(12), F(13), F(30), F(31)]), `A o bien B: cada parte por separado → 10, 11, 12, 13, 30 y 31 (un cruce cada vez) (${JSON.stringify(o)})`)
  // Si se mirara la unión entera (A ó B), se cumple del 10 al 14 y del 30 al 32 seguidos → solo 10 y 30: lo que NO queremos.
  ok(o.length === 6, 'con «o bien» no se pierden los cruces que caen seguidos (la unión entera daría solo 10 y 30)')
  ok(S.senalesCondicion([A, { ...Bf, union: 'Y' }], velasDe, fechas).length === 0, 'A y además B (nunca a la vez): ninguna')
  ok(igual(S.senalesCondicion([A, { ...Bf, union: 'Y' }, { ...A, union: 'O' }], velasDe, fechas), [F(10), F(12), F(30)]), '(A y B) o bien A: «y además» une antes → lo de A: 10, 12 y 30')
  ok(igual(S.gruposFilas([A, { ...Bf, union: 'Y' }, { ...A, union: 'O' }]).map(g => g.length), [2, 1]) && S.gruposFilas([A, { ...Bf, union: 'O' }])[1][0].union === undefined, 'grupos: (A y B) | (A); la primera fila de cada grupo, sin unión')
  ok(igual(S.senalesCondicion([A, { ...A, union: 'Y' }], velasDe, fechas), [F(10), F(12), F(30)]), 'todo con «y además»: un solo grupo, como antes')

  // ── §240: la ventana. En la señal del Replay (conO) entre filas sale el selector; en las alertas, el texto «y además» de siempre ──
  D.pon()
  const React = require(R + '/node_modules/react'), RDC = require(R + '/node_modules/react-dom/client')
  const FA = require(R + '/components/FilasAlerta.js').default
  let cambio = null
  const m = D.monta(React.createElement(FA, { simbolo: 'A', filas: [A, { ...Bf, union: 'Y' }], onCambia: f => { cambio = f }, para: 'señal', conO: true }), RDC); await D.espera(20)
  const sel = m.raiz.busca(n => n.hasAttribute && n.hasAttribute('data-union-alerta'))
  ok(sel && D.propsDe(sel).value === 'Y', 'Replay: entre la fila 1 y la 2, un selector «y además / o bien» (empieza en «y además»)')
  D.escribe(sel, 'O'); await D.espera(10)
  ok(cambio && cambio.length === 2 && cambio[1].union === 'O' && cambio[0].union === undefined, `elegir «o bien» guarda union 'O' en la fila 2 (${JSON.stringify(cambio && cambio.map(f => f.union))})`)
  m.quita()
  cambio = null
  const m2 = D.monta(React.createElement(FA, { simbolo: 'A', filas: [A, { ...Bf, union: 'O' }], onCambia: f => { cambio = f } }), RDC); await D.espera(20)
  ok(!m2.raiz.busca(n => n.hasAttribute && n.hasAttribute('data-union-alerta')) && /y además/.test(m2.raiz.textContent), 'alertas (sin conO): sin selector, el texto «y además» de siempre')
  m2.quita()

  // ── §234: los indicadores de la señal, para el gráfico ──
  // Condición «cierre sobre la SMA 3» de A: una serie SMA 3 con un valor por vela. Vela 10: (100 + 100 + 105) / 3 = 101,67.
  const g1 = S.graficoSenal({ tipo: 'condicion', filas: fila({ c: 'precioVsMedia', p: { lado: 'encima', tipo: 'SMA', periodo: 3 } }) }, VELAS, 'A')
  ok(g1 && g1.series.length === 1 && g1.series[0].nombre === 'SMA 3' && g1.series[0].valores.length === VELAS.length && Math.abs(g1.series[0].valores[PRE + 10] - 305 / 3) < 1e-9 && igual(g1.eventos, []) && igual(g1.ordenes, []),
    `condición: la SMA 3 de A, una por vela (vela 10 = 101,67), sin eventos ni órdenes (${g1 && g1.series.map(s => s.nombre)})`)
  const g2 = S.graficoSenal({ tipo: 'condicion', filas: [{ quien: 'A', velas: 'diarias', si: { c: 'mediaVsMedia', p: { tipoRapida: 'EMA', periodoRapida: 10, tipoLenta: 'EMA', periodoLenta: 20, relacion: 'cruzaArriba' } } }, { quien: 'QQQ', velas: 'diarias', si: { c: 'precioVsMedia', p: { lado: 'encima', tipo: 'SMA', periodo: 200 } } }] }, VELAS, 'A')
  ok(g2 && igual(g2.series.map(s => s.nombre), ['EMA 10', 'EMA 20']), `cruce de medias: las dos EMA (10 y 20); la fila de QQQ no se dibuja en A (${g2 && g2.series.map(s => s.nombre)})`)
  const g3 = S.graficoSenal({ tipo: 'estrategia', def: { ...def, entrada: { ...def.entrada, senal: { c: 'precioVsMedia', p: { lado: 'encima', tipo: 'EMA', periodo: 5 } } } } }, VELAS.slice(0, PRE + 21), 'A')
  ok(g3 && g3.series.some(s => s.nombre === 'EMA5' && s.valores.length === PRE + 21), `estrategia: sus series sobre el precio (la EMA 5), solo con las velas que se ven (${g3 && g3.series.map(s => s.nombre)})`)
  ok(S.graficoSenal({ tipo: 'condicion', filas: fila({ c: 'nuevoMaximo', p: { n: 2 } }) }, VELAS, 'A') === null && S.graficoSenal(null, VELAS, 'A') === null, 'sin medias que dibujar (o sin señal): nada')

  // ── Siguiente / anterior / marcas ──
  const L = [F(10), F(12), F(30)]
  ok(S.siguienteSenal(L, F(10)) === F(12) && S.siguienteSenal(L, F(5)) === F(10) && S.siguienteSenal(L, F(30)) === null, 'la siguiente: estrictamente después de hoy; después de la última, ninguna')
  ok(S.anteriorSenal(L, F(30), F(0)) === F(12) && S.anteriorSenal(L, F(12), F(11)) === null, 'la anterior: antes de hoy y no antes del inicio del Replay')
  ok(igual(S.marcasSenal(L, F(12)).map(m => [m.date, m.shape, m.color]), [[F(10), 'arrowUp', '#bc8cff'], [F(12), 'arrowUp', '#bc8cff']]), '▲ morado solo en las señales que ya se ven (hasta hoy)')
  ok(igual(S.simbolosSenal({ tipo: 'condicion', filas: [{ quien: 'A' }, { quien: 'QQQ' }] }, 'A', () => []), ['QQQ']) &&
     igual(S.simbolosSenal({ tipo: 'estrategia', def: {} }, 'A', () => ['^GSPC', 'A']), ['^GSPC']), 'las velas que hay que pedir aparte: las de otros símbolos')

  console.log(fallos ? `\n${fallos} FALLOS` : '\nTodo en verde')
  process.exit(fallos ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
