// scripts/comprobaciones/con-pasos-grafico.js — el minigráfico de la «Condición con pasos» (lib/replay/conPasosGrafico.js y
// components/MiniGraficoPasos.js, docs/builder.md §245) con velas INVENTADAS y lo esperado calculado a mano. Las corre comunes.sh.
const C0 = require('./cargador'), R = C0.RAIZ, D = require('./domFalso')
let fallos = 0
const ok = (c, t) => { console.log(`${c ? 'OK  ' : 'MAL '} ${t}`); if (!c) fallos++ }
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const fecha = (i) => new Date(Date.UTC(2020, 0, 1) + i * 864e5).toISOString().slice(0, 10)
const velasDe = (cierres) => cierres.map((c, i) => ({ date: fecha(i), open: c, high: c, low: c, close: c, volume: 1 }))

;(async () => {
  await C0.prepara(); C0.registra(R)
  const G = require(R + '/lib/replay/conPasosGrafico.js')
  const P = require(R + '/lib/replay/conPasosPantalla.js')
  const { senalesConPasos } = require(R + '/lib/condiciones/conPasos.js')

  // ── Velas inventadas ──
  const v1 = G.velasInventadas(5), v1b = G.velasInventadas(5), v2 = G.velasInventadas(6)
  ok(v1.length === G.N_INVENTADAS && igual(v1, v1b) && !igual(v1, v2), 'misma semilla, mismas velas; otra semilla, otras (760 velas)')
  ok(v1.every(v => v.high >= Math.max(v.open, v.close) && v.low <= Math.min(v.open, v.close) && ![0, 6].includes(new Date(v.date + 'T12:00:00Z').getUTCDay())), 'cada vela con máximo ≥ apertura y cierre ≥ mínimo, solo de lunes a viernes')
  ok(v1.every((v, i) => !i || v.date > v1[i - 1].date), 'fechas en orden')

  // ── 🎲 buscar unas donde el escenario ocurra ──
  const ej1 = P.EJEMPLOS_CON_PASOS[0].def('A')
  const b = G.buscaInventadas(ej1, 'A', 1)
  ok(b && b.r.senales.length > 0 && igual(b.r.senales, senalesConPasos(ej1, () => G.velasInventadas(b.semilla), G.velasInventadas(b.semilla).map(v => v.date), { simbolo: 'A' }).senales),
    `ejemplo 1: encuentra velas con señales (semilla ${b && b.semilla}, ${b && b.r.senales.length} señales), las mismas que el motor`)
  const b2 = G.buscaInventadas(ej1, 'A', b.semilla + 1)
  ok(b2 && b2.semilla > b.semilla, '«🎲 Otras velas» empieza a buscar en la semilla siguiente')
  ok(G.buscaInventadas({ ...P.conPasosNueva('A'), paso1: { filas: [{ mov: 'cae', pct: 5, desde: 'compra', quien: 'A' }] } }, 'A', 1, 5) === null, 'con «tu última compra» en velas inventadas no salta nunca → null')
  ok(G.buscaInventadas({ paso1: null }, 'A') === null, 'una condición que no vale → null')

  // ── La ventana de velas ──
  ok(igual(G.ventanaDe(100, 50), [0, 99]) && igual(G.ventanaDe(1000, 500), [314, 563]) && igual(G.ventanaDe(1000, null), [750, 999]) && igual(G.ventanaDe(1000, 990), [750, 999]) && igual(G.ventanaDe(1000, 10), [0, 73]),
    'ventana de 250 velas: la señal a un cuarto del final (500 → 314–563; 990 → 750–999; 10 → 0–73); sin señales, las últimas')

  // ── Lo que se dibuja, a mano (ejemplo 1; cierres 100, 95, 90, 92, 99, 89,1, 120, 108; señales 2, 4, 5 y 7) ──
  const V = velasDe([100, 95, 90, 92, 99, 89.1, 120, 108])
  const e = G.escenario(ej1, () => V, 'A')
  const d = G.dibujoEscenario(e, 0, 7)
  ok(igual(d.marcas.filter(m => m.tipo === 'armado').map(m => m.i), [2, 7]), `● paso 1 armado en las velas 2 y 7 (tras el máximo histórico nuevo de la 6) (${JSON.stringify(d.marcas.filter(m => m.tipo === 'armado').map(m => m.i))})`)
  ok(igual(d.marcas.filter(m => m.tipo === 'senal').map(m => m.i), [2, 4, 5, 7]), '▲ en las velas 2, 4, 5 y 7')
  ok(igual(d.lineas.map(l => [l.i0, l.p0, l.i1, l.p1, l.texto]), [[0, 100, 2, 90, '−10,0 %'], [2, 90, 4, 99, '+10,0 %'], [4, 99, 5, 89.1, '−10,0 %'], [6, 120, 7, 108, '−10,0 %']]),
    `líneas de referencia: 100 → 90 (−10 %), 90 → 99 (+10 %), 99 → 89,1 (−10 %), 120 → 108 (−10 %) (${JSON.stringify(d.lineas.map(l => l.texto))})`)
  ok(/Señal \(paso 1\) · 03\/01\/2020 · cierre 90,00\nA: de 100,00 \(01\/01\/2020\) a 90,00, −10,0 %/.test(d.marcas.find(m => m.tipo === 'senal').texto), 'el porqué de la primera señal al pasar el ratón')
  const d3 = G.dibujoEscenario(e, 3, 7)
  ok(igual(d3.lineas[0], { i0: 3, fuera: true, p0: 90, i1: 4, p1: 99, texto: '+10,0 %' }) && !d3.marcas.some(m => m.i < 3), 'con la ventana desde la vela 3: la referencia de la vela 2 empieza en el borde (fuera) y no hay marcas antes')
  // Tramos: «Mientras el cierre está sobre su SMA 2». Cierres 10, 11, 12, 11, 10, 11, 12: SMA 2 = —, 10,5, 11,5, 11,5, 10,5, 10,5, 11,5 → dentro 1–2 y 5–6.
  const VT = velasDe([10, 11, 12, 11, 10, 11, 12])
  const dt = { ...P.conPasosNueva('A'), mientras: { filas: [{ quien: 'A', velas: 'diarias', si: { c: 'precioVsMedia', p: { lado: 'encima', tipo: 'SMA', periodo: 2 } } }] }, paso1: { filas: [{ mov: 'cae', pct: 50, desde: 'maxHist', quien: 'A' }] } }
  ok(igual(G.dibujoEscenario(G.escenario(dt, () => VT, 'A'), 0, 6).tramos, [[1, 2], [5, 6]]), 'tramos sombreados: velas 1–2 y 5–6 (el último sin acabar llega al final)')
  ok(igual(G.dibujoEscenario(G.escenario(dt, () => VT, 'A'), 2, 5).tramos, [[2, 2], [5, 5]]), 'los tramos se recortan a la ventana')
  ok(igual(G.otrosSimbolos({ ...dt, mientras: { filas: [{ ...dt.mientras.filas[0], quien: 'QQQ' }] } }, 'A'), ['QQQ']), 'velas que pedir aparte: QQQ del «Mientras…»')

  // ── Montado ──
  D.pon()
  const React = require(R + '/node_modules/react'), RDC = require(R + '/node_modules/react-dom/client')
  const Mini = require(R + '/components/MiniGraficoPasos.js').default
  const attr = (raiz, k, v) => raiz.busca(n => n.getAttribute && n.getAttribute(k) != null && (v == null || n.getAttribute(k) === String(v)))
  const todos = (raiz, k, v) => raiz.todos(n => n.getAttribute && n.getAttribute(k) != null && (v == null || n.getAttribute(k) === String(v)))
  const pedidas = []
  const carga = (q) => { pedidas.push(q); return Promise.resolve(velasDe([100, 100, 100, 100, 100, 100, 100, 100])) }
  const m = D.monta(React.createElement(Mini, { def: ej1, simbolo: 'a', velas: V, cargaVelas: carga, simbolosAzar: ['A', 'ZZZ'], hoy: fecha(3) }), RDC); await D.espera(30)
  ok(attr(m.raiz, 'data-mini-pasos', 'inventadas') && attr(m.raiz, 'data-mini-grafico') && Number(attr(m.raiz, 'data-mini-n').getAttribute('data-mini-n')) === b.r.senales.length,
    `empieza en «Velas inventadas», con las de la semilla ${b.semilla} (${b.r.senales.length} señales)`)
  ok(todos(m.raiz, 'data-mini-marca', 'senal').length >= 1 && /señal 1 de/.test(attr(m.raiz, 'data-mini-k').textContent), 'se ve al menos un ▲ y «señal 1 de N»')
  D.pulsa(attr(m.raiz, 'data-mini-otras')); await D.espera(30)
  ok(Number(attr(m.raiz, 'data-mini-n').getAttribute('data-mini-n')) === b2.r.senales.length, `«🎲 Otras velas»: las de la semilla ${b2.semilla}`)
  D.pulsa(attr(m.raiz, 'data-mini-modo', 'reales')); await D.espera(30)
  ok(attr(m.raiz, 'data-mini-pasos', 'reales') && attr(m.raiz, 'data-mini-n').getAttribute('data-mini-n') === '4' && /toda la historia de A/.test(m.raiz.textContent) && /después de hoy/.test(m.raiz.textContent),
    '«Velas reales»: las del valor (4 señales en toda su historia) y el aviso de que se ve lo de después de hoy')
  ok(attr(m.raiz, 'data-mini-hoy') && igual(todos(m.raiz, 'data-mini-linea').map(n => n.getAttribute('data-mini-linea')), ['−10,0 %', '+10,0 %', '−10,0 %', '−10,0 %']), 'la raya de «hoy en el Replay» y las 4 líneas con su %')
  D.pulsa(attr(m.raiz, 'data-mini-siguiente')); await D.espera(10)
  ok(/señal 2 de 4 · 05\/01\/2020/.test(attr(m.raiz, 'data-mini-k').textContent), '▶: la señal 2 de 4 (05/01/2020)')
  ok(pedidas.length === 0, 'sin otros símbolos en la condición, no pide velas')
  D.pulsa(attr(m.raiz, 'data-mini-azar')); await D.espera(30)
  ok(igual(pedidas, ['ZZZ']) && /toda la historia de ZZZ \(en lugar de A\)/.test(m.raiz.textContent) && attr(m.raiz, 'data-mini-n').getAttribute('data-mini-n') === '0' && !attr(m.raiz, 'data-mini-hoy'),
    '«🎲 Valor al azar»: pide las velas de ZZZ (de la Watchlist, no el mismo), lo mira ahí (planas: 0 señales) y sin raya de «hoy»')
  D.pulsa(attr(m.raiz, 'data-mini-volver')); await D.espera(20)
  ok(attr(m.raiz, 'data-mini-n').getAttribute('data-mini-n') === '4', '«Volver a A»')
  m.quita()
  const m2 = D.monta(React.createElement(Mini, { def: { paso1: null }, simbolo: 'A', velas: V }), RDC); await D.espera(20)
  ok(!attr(m2.raiz, 'data-mini-grafico') && /Arregla lo que sale en rojo/.test(m2.raiz.textContent), 'con la condición sin terminar: sin gráfico y lo dice')
  m2.quita()

  console.log(fallos ? `\n${fallos} FALLOS` : '\nTodo en verde')
  process.exit(fallos ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
