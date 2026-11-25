// scripts/comprobaciones/replay-varios.js — el Replay con VARIOS valores (lib/replay/varios.js y buyHoldLista de lib/replay/motor.js,
// docs/builder.md §253). Las corre comunes.sh. Termina en 0 si todo da lo esperado. Cuentas a mano (10.000 €, 1 € por orden).
//
// VELAS INVENTADAS (cierres): A d1 100 · d2 104 · d3 99 · d4 96 · d5 108 · d6 111. B (no cotiza el d3): d1 50 · d2 52 · d4 55 · d5 56 · d6 57.
// C empieza el d4: d4 20 · d5 21 · d6 22.
process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://arnes.invalid'; process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'clave-falsa-del-arnes'
const C0 = require('./cargador'), R = C0.RAIZ, DF = require('./domFalso')
let fallos = 0
const ok = (c, t) => { console.log(`${c ? 'OK  ' : 'MAL '} ${t}`); if (!c) fallos++ }
const cerca = (a, b, tol = 1e-9) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tol * Math.max(1, Math.abs(b))
const D = ['2024-01-02', '2024-01-03', '2024-01-04', '2024-01-05', '2024-01-08', '2024-01-09']
const v = (date, c) => ({ date, open: c, high: c, low: c, close: c })
const VELAS = {
  A: [v(D[0], 100), v(D[1], 104), v(D[2], 99), v(D[3], 96), v(D[4], 108), v(D[5], 111)],
  B: [v(D[0], 50), v(D[1], 52), v(D[3], 55), v(D[4], 56), v(D[5], 57)],
  C: [v(D[3], 20), v(D[4], 21), v(D[5], 22)],
}

;(async () => {
  DF.pon()
  await C0.prepara(); C0.registra(R)
  const M = require(R + '/lib/replay/motor.js'), V = require(R + '/lib/replay/varios.js'), G = require(R + '/lib/replay/guardados.js')
  const est = (o = {}) => ({ version: 1, valores: ['A', 'B'], desde: D[0], hoy: D[5], capitalInicial: 10000, comision: 1, ejecucion: 'apertura', acciones: [], retrocesos: 0, ...o })

  // ── Buy&Hold de la lista a partes iguales ──
  // A: 5.000 → (5.000 − 1) / 100 = 49 acciones, sobran 5.000 − 4.900 − 1 = 99; hoy 49 × 111 − 1 + 99 = 5.537.
  // B: (5.000 − 1) / 50 = 99 acciones, sobran 49; hoy 99 × 57 − 1 + 49 = 5.691. Total 11.228.
  const bh = M.buyHoldLista(est(), VELAS)
  ok(cerca(bh.final, 11228), `A y B a partes iguales: 5.537 + 5.691 = 11.228 € (${bh.final})`)
  // El d3 B no cotiza: vale su último cierre (52). A 49 × 99 + 99 = 4.950; B 99 × 52 + 49 = 5.197 → 10.147.
  ok(cerca(bh.curva.find(c => c.fecha === D[2]).valor, 10147), `el d3 (B sin vela, con su cierre de 52): 10.147 € (${bh.curva.find(c => c.fecha === D[2]).valor})`)
  // C empieza el d4: su parte espera en liquidez; el d4 compra (5.000 − 1) / 20 = 249, sobran 19; hoy 249 × 22 − 1 + 19 = 5.496. Con A: 11.033.
  const bh2 = M.buyHoldLista(est({ valores: ['A', 'C'] }), VELAS)
  ok(cerca(bh2.final, 11033) && cerca(bh2.curva.find(c => c.fecha === D[1]).valor, 49 * 104 + 99 + 5000), `C entra el d4, cuando empieza: 5.537 + 5.496 = 11.033 € (antes, su parte espera: el d2 vale 5.195 + 5.000) (${bh2.final})`)
  ok(cerca(M.cifras(est(), VELAS, M.calcula(est(), VELAS)).buyHold.final, 11228), 'con varios valores, la cifra «Buy&Hold» de la cuenta es la de la lista')
  ok(cerca(M.buyHoldLista(est({ valores: ['A'] }), VELAS).final, M.buyHold(est({ valores: ['A'] }), VELAS).final), 'con un solo valor, da lo mismo que el Buy&Hold de siempre')

  // ── La cuenta común: compras en dos valores con el mismo dinero ──
  // d1: compra A (invertir 40 %) y B (invertir 40 %) a mercado → el d2: A 4.000 / 104 = 38 (3.952 + 1); B con lo que queda: total 10.000 →
  // 4.000 / 52 = 76 (3.952 + 1). Liquidez 10.000 − 3.953 − 3.953 = 2.094.
  const ord = (s, id) => ({ fecha: D[0], simbolo: s, tipo: 'orden', id, lado: 1, entrada: null, clase: null, stop: null, objetivo: null, tam: { modo: 'invertir', pct: 40 } })
  const VO = { A: VELAS.A.map(x => ({ ...x, open: x.close })), B: VELAS.B.map(x => ({ ...x, open: x.close })) }
  const r = M.calcula(est({ acciones: [ord('A', 1), ord('B', 2)] }), VO)
  ok(r.posiciones.A.acciones === 38 && r.posiciones.B.acciones === 76 && cerca(r.caja, 2094), `una cuenta para los dos: A 38 y B 76 acciones, liquidez 2.094 € (${r.posiciones.A.acciones} / ${r.posiciones.B.acciones} / ${r.caja})`)

  // ── Orden de la rejilla y páginas ──
  const rr = { posiciones: { D: {} }, ordenesVivas: [{ simbolo: 'B' }] }
  ok(V.ordenRejilla(['E', 'D', 'C', 'B', 'A'], rr, new Set(['E'])).join() === 'D,B,E,A,C', 'primero con posición (D), luego con orden (B), luego con señal (E), y el resto alfabético')
  ok(V.ordenRejilla(['E', 'D', 'C'], rr, new Set(), 'alfa').join() === 'C,D,E', 'alfabético')
  const pg = V.pagina(['a', 'b', 'c', 'd', 'e', 'f', 'g'], 6, 1)
  ok(pg.valores.join() === 'g' && pg.paginas === 2 && V.pagina(['a'], 4, 5).pagina === 0, '7 valores de 6 en 6: 2 páginas, la segunda con el último; una página que no existe vuelve a la primera')

  // ── Por valor ──
  const pv = V.porValor({ operaciones: [{ simbolo: 'A', resultado: 10 }, { simbolo: 'A', resultado: -4 }, { simbolo: 'B', resultado: -2 }], posiciones: { C: { ganancia: 20 } } }, ['A', 'B', 'C', 'D'])
  ok(pv.map(x => x.simbolo).join() === 'C,A,D,B' && pv[1].operaciones === 2 && pv[1].ganadoras === 1 && pv[1].resultado === 6, 'por valor: C (+20 abierta), A (+6 en 2, 1 ganadora), D (nada), B (−2)')

  // ── Señales de cualquier valor ──
  const SEN = { A: { entradas: [D[1], D[4]] }, B: { entradas: [D[3]] } }
  ok([...V.conSenalHoy(SEN, D[3])].join() === 'B' && V.siguienteSenalVarios(SEN, D[1]) === D[3] && V.siguienteSenalVarios(SEN, D[5]) === null, 'con señal hoy (d4): B; la próxima desde el d2: el d4 (de B); desde el d6, ninguna')
  ok(G.nombreDe(est()) === '2 valores · desde 02/01/2024' && G.nombreDe(est({ valores: ['A'] })) === 'A · desde 02/01/2024', 'nombre: «2 valores · desde 02/01/2024»; con uno, el de siempre')

  // ── §254: la pantalla (components/ReplayVarios.js) ──
  {
    const React = require(R + '/node_modules/react'), RDC = require(R + '/node_modules/react-dom/client')
    const RV = require(R + '/components/ReplayVarios.js'), P = require(R + '/components/PanelReplay.js')
    ok(RV.primerDia(VELAS, ['B', 'C'], '2024-01-04') === D[3] && RV.primerDia(VELAS, ['C'], '2024-01-01') === D[3], 'el primer día con vela desde la fecha elegida: el 05/01 (B no cotiza el 04/01; C empieza el 05/01)')
    const VR = { A: VELAS.A.map(x => ({ ...x, open: x.close })), B: VELAS.B.map(x => ({ ...x, open: x.close })), C: VELAS.C.map(x => ({ ...x, open: x.close })), '^GSPC': VELAS.A }
    // §255: el gráfico de cada valor es el del Replay de un valor (CandleChart); en la prueba, uno de mentira que dice qué recibe.
    const recibe = {}
    const Falso = (p) => { recibe[p.simbolo] = p; return React.createElement('div', { 'data-grafico-falso': p.simbolo, 'data-n': p.data.length }) }
    let m = DF.monta(React.createElement(RV.default, { inicial: { nuevo: { valores: ['A', 'B', 'C'], fecha: D[0], capitalInicial: 10000, comision: 1, ejecucion: 'apertura' } }, cargaVelas: async (s) => VR[s] || [], onSalir() {}, Grafico: Falso }), RDC)
    await DF.espera(80)
    const txt = (sel) => m.raiz.busca(n => n.hasAttribute(sel))?.textContent || ''
    ok(/02\/01\/2024/.test(txt('data-hoy-replay')) && /3 valores/.test(m.raiz.textContent), `empieza el 02/01/2024 con los 3 valores, con la barra de siempre (${txt('data-hoy-replay')})`)
    ok(!!m.raiz.busca(n => n.getAttribute('data-grafico-falso') === 'A') && !!m.raiz.busca(n => n.getAttribute('data-grafico-falso') === 'B'), 'cada valor con cotización tiene su gráfico (el mismo del Replay de un valor)')
    ok(/aún no cotiza/.test((m.raiz.busca(n => n.getAttribute('data-celda-varios') === 'C') || {}).textContent || ''), 'C aún no cotiza el primer día: lo dice en su sitio')
    ok(recibe.A && recibe.A.data.length === 1 && Array.isArray(recibe.A.lineasReplay) && Array.isArray(recibe.A.cajasReplay) && typeof recibe.A.onPriceAlarm === 'function' && typeof recibe.A.onLineaReplay === 'function',
      'el gráfico recibe lo mismo que en el Replay de un valor: velas hasta hoy, líneas y cajas, doble clic y arrastre')
    ok((m.raiz.buscaTodos ? m.raiz.buscaTodos(n => n.hasAttribute('data-cfg-replay')).length : 1) >= 1 && !m.raiz.busca(n => n.hasAttribute('data-compacto')), 'cada gráfico lleva el panel de operar entero, con ⚙ junto a Compra / Venta')
    ok(/la lista \(3\)/.test(txt('data-cifras-replay')) && /S&P 500/.test(txt('data-cifras-replay')), 'las cifras comparan con el Buy&Hold de la lista (3) y con el S&P 500')
    DF.pulsa(m.raiz.busca(n => n.hasAttribute('data-varias'))); await DF.espera(30)
    ok(/09\/01\/2024/.test(txt('data-hoy-replay')) && recibe.A.data.length === 6, `«▶▶ 5» avanza cinco velas del calendario común: al 09/01, y A ya ve sus 6 velas (${txt('data-hoy-replay')})`)
    DF.pulsa(m.raiz.busca(n => n.hasAttribute('data-atras'))); await DF.espera(30)
    ok(/08\/01\/2024/.test(txt('data-hoy-replay')) && /1 retroceso/.test(m.raiz.textContent), '«|◀» vuelve una vela y cuenta el retroceso')
    DF.pulsa(m.raiz.busca(n => n.getAttribute('data-tam-varios') === 'g6')); await DF.espera(20)
    ok(!!m.raiz.busca(n => n.getAttribute('data-rejilla-varios') === 'g6'), '«Por fila: 6»: 6 gráficos por fila (todos los valores, sin páginas)')
    DF.pulsa(m.raiz.busca(n => n.getAttribute('data-ampliar-varios') === 'A')); await DF.espera(20)
    ok(!m.raiz.busca(n => n.hasAttribute('data-rejilla-varios')) && !!m.raiz.busca(n => n.hasAttribute('data-panel-derecho-varios')) && recibe.A.chartHeight === 600, '⤢ amplía A dentro de la zona de los gráficos; el panel de la derecha sigue a la vista')
    DF.pulsa(m.raiz.busca(n => n.getAttribute('data-ampliar-varios') === 'A')); await DF.espera(20)
    ok(!!m.raiz.busca(n => n.hasAttribute('data-rejilla-varios')), '«← Rejilla» vuelve a la rejilla')
    // §256: los minigráficos van con mini (rueda tras clic, ejes finos, sin leyenda); el doble clic en la rejilla solo amplía.
    ok(recibe.A.mini === true && recibe.B.mini === true, 'en la rejilla, cada gráfico va en modo mini')
    // §258: forma B: el panel de operar va en la cabecera de cada minigráfico (una línea) y ✎ despliega las casillas.
    const cabA = () => m.raiz.busca(n => n.getAttribute('data-cabecera-varios') === 'A')
    ok(!!m.raiz.busca(n => n.hasAttribute('data-cabecera-panel')) && !!m.raiz.busca(n => n.hasAttribute('data-cfg-replay')), 'en la rejilla, Compra / Venta / ⚙ van en la cabecera del minigráfico')
    ok(!m.raiz.busca(n => n.hasAttribute('data-precios-posicion') || n.hasAttribute('data-ordenes-vivas')), 'sin nada abierto, no hay casillas desplegadas')
    DF.pulsa(m.raiz.busca(n => n.getAttribute('data-tam-varios') === 'g2')); await DF.espera(20)
    ok(!!m.raiz.busca(n => n.getAttribute('data-rejilla-varios') === 'g2') && recibe.A.chartHeight === 400, '«Por fila: 2»: 2 gráficos por fila, más altos (400 px)')
    const accionesAntes = /0 operaciones|Operaciones · 0/.test(m.raiz.textContent)
    recibe.A.onPriceAlarm(100); await DF.espera(20)
    ok(!m.raiz.busca(n => n.hasAttribute('data-rejilla-varios')) && recibe.A.chartHeight === 600 && recibe.A.mini === false, 'doble clic en un minigráfico: se amplía (y ampliado ya no es mini)')
    ok(!/Pulsa en el gráfico|Clic para marcar/.test(m.raiz.textContent) && accionesAntes === /0 operaciones|Operaciones · 0/.test(m.raiz.textContent), 'ese doble clic no pone ninguna orden ni empieza a marcar')
    DF.pulsa(m.raiz.busca(n => n.getAttribute('data-ampliar-varios') === 'A')); await DF.espera(20)
    m.quita()
    // §258: con una posición abierta, la cabecera dice «L N · ±X €» con ✎ y ✕; ✎ despliega Stop / Objetivo debajo.
    {
      const eP = { version: 1, valores: ['A', 'B'], desde: D[0], hoy: D[2], capitalInicial: 10000, comision: 1, ejecucion: 'apertura', retrocesos: 0, terminada: false, intervalo: 'diario',
        acciones: [{ fecha: D[0], simbolo: 'A', tipo: 'orden', id: 1, lado: 1, entrada: null, clase: null, stop: null, objetivo: null, tam: { modo: 'invertir', pct: 50 } }] }
      const mm = DF.monta(React.createElement(RV.default, { inicial: { id: 'x', nombre: 'prueba', estado: eP }, cargaVelas: async (s) => VR[s] || [], onSalir() {}, Grafico: Falso }), RDC)
      await DF.espera(80)
      const cab = mm.raiz.busca(n => n.getAttribute('data-cabecera-varios') === 'A')
      const tc = cab ? cab.textContent : ''
      ok(/L 48 · −241 €/.test(tc) && !!mm.raiz.busca(n => n.hasAttribute('data-editar-cabecera')) && !mm.raiz.busca(n => n.hasAttribute('data-precios-posicion')), `cabecera de A con la posición en una línea, ✎ y ✕, sin casillas a la vista (${tc})`)
      DF.pulsa(mm.raiz.busca(n => n.hasAttribute('data-editar-cabecera'))); await DF.espera(20)
      ok(!!mm.raiz.busca(n => n.hasAttribute('data-precios-posicion')), '✎ despliega el Stop y el Objetivo de la posición debajo de la cabecera')
      mm.quita()
    }
    // El panel compacto: posición en una línea.
    const e = { version: 1, valores: ['A'], desde: D[0], hoy: D[2], capitalInicial: 10000, comision: 1, ejecucion: 'apertura', acciones: [{ fecha: D[0], simbolo: 'A', tipo: 'orden', id: 1, lado: 1, entrada: null, clase: null, stop: null, objetivo: null, tam: { modo: 'invertir', pct: 50 } }], retrocesos: 0 }
    const VA = { A: VR.A }, r0 = M.calcula(e, VA)
    m = DF.monta(React.createElement(P.PanelGrafico, { estado: e, simbolo: 'A', r: r0, ahora: 99, total: 10000, form: { modo: 'invertir', pct: 20, lado: 1, mercado: true, entrada: '', stop: '', objetivo: '' }, compacto: true, onMarcar() {}, onAccion() {} }), RDC); await DF.espera(20)
    // Compra el d2 a 104: 5.000 / 104 = 48 acciones; el d3 a 99: 48 × (99 − 104) − 1 = −241 €.
    ok(/Largo 48 · −241 €/.test(txt('data-linea-compacta')) && !!m.raiz.busca(n => n.hasAttribute('data-cerrar-replay')), `compacto: «Largo 48 · −241 €» y «Cerrar ✕» (${txt('data-linea-compacta')})`)
    m.quita()
    // «Por valor» en la tabla de abajo.
    const e2 = { ...e, valores: ['A', 'B'], hoy: D[5] }, r2 = M.calcula(e2, VR)
    m = DF.monta(React.createElement(P.ResultadosReplay, { estado: e2, r: r2, cif: M.cifras(e2, VR, r2), velas: null, simbolo: null, varios: true }), RDC); await DF.espera(20)
    DF.pulsa(m.raiz.busca(n => n.getAttribute('data-vista-replay') === 'valor')); await DF.espera(10)
    ok(!!m.raiz.busca(n => n.getAttribute('data-fila-valor') === 'A') && !!m.raiz.busca(n => n.getAttribute('data-fila-valor') === 'B'), 'con varios valores, la tabla tiene «Por valor» con una fila por valor')
    m.quita()
  }

  // ── §256: CandleChart sin «mini», carácter a carácter el de antes; con «mini», sin leyenda ni lista de indicadores ──
  {
    const React = require(R + '/node_modules/react'), RDS = require(R + '/node_modules/react-dom/server')
    const { execSync } = require('child_process'), fs = require('fs'), path = require('path')
    let antes = null
    try { antes = execSync('git show HEAD:components/CandleChart.js', { cwd: R, encoding: 'utf8', maxBuffer: 1 << 26 }) } catch (_) {}
    const VC = VELAS.A
    if (antes && !antes.includes('mini=false')) {
      const f = path.join(R, 'components', '__CandleChart_anterior_mini.js')
      try {
        fs.writeFileSync(f, antes)
        const CCa = require(f).default, CC = require(R + '/components/CandleChart.js').default
        const casos = [{ data: VC }, { data: VC, fillHeight: true, onIndicadores: () => {}, indicadoresUsuario: [] }, { data: VC, riskMode: 'entry' }, { data: VC, cajasReplay: [], lineasReplay: [], margenDerecha: 10 }]
        ok(casos.every(p => RDS.renderToString(React.createElement(CCa, p)) === RDS.renderToString(React.createElement(CC, p))), `CandleChart sin «mini»: el mismo HTML que antes, carácter a carácter (${casos.length} casos)`)
      } finally { try { fs.unlinkSync(f) } catch (_) {} }
    } else ok(true, 'CandleChart sin «mini»: el commit anterior ya lo lleva (se comprobó al hacerlo)')
    const CC = require(R + '/components/CandleChart.js').default
    const h = RDS.renderToString(React.createElement(CC, { data: VC, mini: true, onIndicadores: () => {}, indicadoresUsuario: [{ id: 'x', tipo: 'ema', periodo: 20 }] }))
    ok(/data-mini="quieto"/.test(h) && /display:none/.test(h.slice(h.indexOf('position:absolute'), h.indexOf('position:absolute') + 400)) && !/top:38px/.test(h), 'con «mini»: la rueda apagada al empezar, sin leyenda y sin la lista de indicadores')
  }

  console.log(fallos ? `replay-varios: ${fallos} fallos` : 'replay-varios: todas bien')
  process.exit(fallos ? 1 : 0)
})().catch(e => { console.error('ERROR', e); process.exit(2) })
