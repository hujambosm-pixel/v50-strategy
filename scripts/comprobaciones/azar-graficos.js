// scripts/comprobaciones/azar-graficos.js — el resultado del paso 2 frente al azar (docs/builder.md, §61). Cuentas a mano de lib/azarGraficos.js; la REGLA DE ORO con la prueba real de EMA20,
// congelada en prueba-ema20/ con sus precios (sigue valiendo aunque Sergi la borre de la app): ejecutarPrueba da lo guardado (99,2 % y 11,3 %), y el gráfico sale de las mismas copias sin tocar nada; y la pantalla montada. La corre comunes.sh.
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://falso.invalid'; process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'clave-falsa-de-la-prueba'
const path = require('path')
const C0 = require('./cargador'), R = C0.RAIZ, D = require('./domFalso')
let fallos = 0
const ok = (c, t) => { console.log(`${c ? 'OK  ' : 'MAL '} ${t}`); if (!c) fallos++ }
const cerca = (a, b, e = 1e-9) => Math.abs(a - b) <= e

;(async () => {
  D.pon(); await C0.prepara(); C0.registra(R)
  const React = require(path.join(R, 'node_modules', 'react')), RDC = require(path.join(R, 'node_modules', 'react-dom', 'client')), { renderToString } = require(path.join(R, 'node_modules', 'react-dom', 'server'))
  const h = React.createElement
  const G = require(R + '/lib/azarGraficos.js'), PA = require(R + '/lib/pruebaAzar.js'), AR = require(R + '/lib/azarReglas.js'), Lt = require(R + '/lib/lotesLab.js'), RA = require(R + '/lib/resultadoAzar.js')
  const Res = require(R + '/components/BuilderAzarResultado.js').default

  // ── 1 · A mano ──
  const v = (open, close) => ({ open, close, high: Math.max(open, close), low: Math.min(open, close), date: '' })
  const velas = [v(100, 100), v(100, 110), v(110, 121), v(121, 110), v(110, 99), v(99, 99)]
  // Compra a 100 en la vela 1, cierre 110 (+10 %), vela 2 cierre 121 (+21 %), vende en la 3 a 110 (+10 %). Fuera en la 4. Compra a 99 en la 5, sigue abierta: sale a 99 (0 %).
  const ops = [{ e: 1, x: 3, entrada: 100, salida: 110 }, { e: 5, x: 5, entrada: 99, salida: 99 }]
  const s = G.serieValor(velas, 1, 5, ops)
  ok(cerca(s[0], 1.1) && cerca(s[1], 1.21) && cerca(s[2], 1.1) && cerca(s[3], 1.1) && cerca(s[4], 1.1), `la serie: ${Array.from(s).map(x => x.toFixed(2)).join(' ')} (1,10 1,21 1,10 1,10 1,10)`)
  const e = G.estadisticas(velas, 1, 5, ops)
  ok(cerca(e.final, 11000, 1e-6), `final: 10.000 € × 1,10 = ${e.final}`)
  ok(e.operaciones === 2 && e.ganadoras === 50, `2 operaciones, 1 ganadora: ${e.ganadoras} %`)
  ok(cerca(e.caida, (1 - 1.1 / 1.21) * 100, 1e-9), `peor caída: de 1,21 a 1,10 = 9,09 %: ${e.caida.toFixed(2)}`)
  ok(cerca(e.dentro, 80), `dentro 4 velas de 5 (la 1, 2, 3 y 5): ${e.dentro} %`)
  // Salir y volver a entrar el mismo día: no se pierde ninguna.
  const s2 = G.serieValor(velas, 1, 2, [{ e: 1, x: 1, entrada: 100, salida: 105 }, { e: 2, x: 2, entrada: 100, salida: 110 }])
  ok(cerca(s2[0], 1.05) && cerca(s2[1], 1.155), `dos operaciones seguidas: ${Array.from(s2).map(x => x.toFixed(3)).join(' ')} (1,050 1,155)`)
  ok(G.serieValor(velas, 1, 3, []).every(x => x === 1), 'sin operaciones: todo en 1')
  const orden = Array.from({ length: 1000 }, (_, i) => i + 1)
  ok(G.percentilOrdenado(orden, 95) === 950 && G.percentilOrdenado(orden, 5) === 50 && G.percentilOrdenado(orden, 50) === 500, 'percentil 95 de 1.000 = la copia 950 (el listón del veredicto)')
  ok(RA.euros(15965.4) === '15.965 €' && RA.euros(5292) === '5.292 €' && RA.euros(120000) === '120.000 €' && RA.euros(null) === '—', 'los euros, con punto de miles')

  // ── 2 · La regla de oro: la prueba real de EMA20 ──
  const leeJ = (a) => require('fs').readFileSync(path.join(__dirname, 'prueba-ema20', a), 'utf8')
  const prueba = JSON.parse(leeJ('prueba.json')), guardado = JSON.parse(leeJ('resultado.json')), precios = { AAPL: JSON.parse(leeJ('velas.json')) }
  ok(prueba.semilla === 867154936 && prueba.estrategia_nombre === 'Prueba editor EMA20' && prueba.valor === 'AAPL', 'es «Prueba editor EMA20 · AAPL · diarias · semilla 867154936»')
  const t0 = Date.now(), res = await PA.ejecutarPrueba(prueba, precios, () => {}, { cede: async () => {} })
  ok(Lt.jsonCanonico(res) === Lt.jsonCanonico(guardado), `ejecutarPrueba da byte a byte lo guardado (${((Date.now() - t0) / 1000).toFixed(1)} s)`)
  ok(res.periodos[0].percentil === 99.2 && res.periodos[1].percentil === 11.3 && res.veredicto === 'noPasa', `99,2 % y 11,3 %: ${res.periodos.map(p => p.percentil).join(' y ')}, «${res.texto}»`)
  ok(await Lt.huella(PA.fotoDe({ id: prueba.estrategia_foto.id, name: prueba.estrategia_foto.name, definition: prueba.estrategia_foto.definition, params: prueba.estrategia_foto.params })) === prueba.estrategia_huella, 'la huella congelada de la foto, igual')
  const antes = JSON.stringify(prueba) + JSON.stringify(guardado)
  const g = await G.calculaGraficos(prueba, precios, { cede: async () => {} })
  ok(JSON.stringify(prueba) + JSON.stringify(guardado) === antes, 'calcular el gráfico no toca la prueba ni el resultado')
  ok(JSON.stringify(await G.calculaGraficos(prueba, precios, { cede: async () => {} })) === JSON.stringify(g), 'dos veces con la misma semilla: el mismo gráfico')
  const claves = Object.keys(g.pestanas); ok(claves.join() === 'completo,2016-01-01,2021-01-01', `las 3 pestañas: ${claves.join(', ')}`)
  ok(!('completo' in guardado) && !JSON.stringify(res).includes('completo'), 'la pestaña completa no entra en el resultado')
  for (const [clave, x] of Object.entries(g.pestanas)) {
    ok(Object.keys(x.abanico).join() === 'p5,p25,p50,p75,p95' && Object.keys(x.copias).join() === 'mejor,tipica,peor', `${clave}: guarda las 5 líneas y las 3 copias`)
    let ordenado = true; for (let k = 0; k < x.fechas.length; k++) if (!(x.abanico.p5[k] <= x.abanico.p25[k] && x.abanico.p25[k] <= x.abanico.p50[k] && x.abanico.p50[k] <= x.abanico.p75[k] && x.abanico.p75[k] <= x.abanico.p95[k])) ordenado = false
    ok(ordenado, `${clave}: en cada punto, p5 ≤ p25 ≤ p50 ≤ p75 ≤ p95`)
    const w = G.vistaPestana(prueba, precios, x, clave)
    ok(w.copias.peor.final <= w.copias.tipica.final && w.copias.tipica.final <= w.copias.mejor.final, `${clave}: peor ${Math.round(w.copias.peor.final)} ≤ típica ${Math.round(w.copias.tipica.final)} ≤ mejor ${Math.round(w.copias.mejor.final)}`)
    ok(x.abanico.p5[x.fechas.length - 1] >= w.copias.peor.final * 0.999 && x.abanico.p95[x.fechas.length - 1] <= w.copias.mejor.final * 1.001, `${clave}: el abanico cae entre la peor y la mejor`)
    const per = guardado.periodos.find(p => p.desde === clave)
    if (per) {
      const a = (Date.parse(w.fechas[w.fechas.length - 1]) - Date.parse(w.fechas[0])) / 864e5 / 365.25, cagr = (f) => (Math.pow(f / G.DINERO_INICIAL, 1 / a) - 1) * 100
      ok(cerca(cagr(w.estrategia.final), per.cagr, 1e-9), `${clave}: el final de tu estrategia da su CAGR guardado (${per.cagr.toFixed(2)} %)`)
      ok(cerca(w.estrategia.caida, per.caida, 1e-9) && w.estrategia.operaciones === per.operaciones, `${clave}: su caída (${per.caida.toFixed(2)} %) y sus operaciones (${per.operaciones}), las guardadas`)
      ok(cerca(cagr(w.copias.tipica.final), per.copiaTipica.cagr, 1e-9) && cerca(w.copias.tipica.caida, per.copiaTipica.caida, 1e-9) && w.copias.tipica.operaciones === per.copiaTipica.operaciones, `${clave}: la típica es la copia típica del resultado (${per.copiaTipica.cagr.toFixed(2)} %)`)
      ok(cerca(cagr(w.copias.mejor.final), Math.max(...per.cagrCopias), 1e-9) && cerca(cagr(w.copias.peor.final), Math.min(...per.cagrCopias), 1e-9), `${clave}: la mejor y la peor son las de sus 1.000 copias guardadas`)
    } else ok(x.percentil > 0 && x.percentil <= 100, `completo: su percentil, ${x.percentil} %`)
  }
  const bytes = Buffer.byteLength(JSON.stringify(g))
  ok(bytes < 200 * 1024, `ocupa ${(bytes / 1024).toFixed(0)} KB por prueba (${Object.entries(g.pestanas).map(([k, x]) => `${k}: ${(Buffer.byteLength(JSON.stringify(x)) / 1024).toFixed(0)} KB`).join(', ')})`)
  ok(await G.mismosPrecios(prueba, guardado, precios) === true, 'con sus precios: mismos precios')
  ok(await G.mismosPrecios(prueba, guardado, { AAPL: precios.AAPL.map((b, i) => i === 500 ? { ...b, close: b.close + 1 } : b) }) === false, 'si cambia una vela: lo detecta')

  // ── 3 · La pantalla ──
  const monta = async (extra = {}) => { const m = D.monta(h(Res, { prueba, resultado: guardado, graficosInicial: g, preciosInicial: precios, onBorrar: () => {}, ...extra }), RDC); await D.espera(30); return m }
  const q = (m, k, val) => m.raiz.busca(n => n.getAttribute(k) != null && (val == null || n.getAttribute(k) === String(val)))
  let m = await monta()
  ok(q(m, 'data-titulo-prueba').textContent === 'Prueba contra el azar · AAPL · velas diarias', 'el título')
  ok(q(m, 'data-veredicto', 'noPasa').textContent === '✕ No pasa' && q(m, 'data-congelada').textContent === 'Congelada el 30/10/2026 · semilla 867154936', '✕ No pasa · Congelada el 30/10/2026 · semilla 867154936')
  ok(!!q(m, 'data-borrar-prueba', prueba.id), 'la papelera')
  const tabs = m.raiz.conAtributo('data-pestana-azar').map(n => n.textContent)
  ok(tabs[0] === '2016–2025 · completo' && tabs[1] === '2016–2020 ✓ 99,2 %' && tabs[2] === '2021–2025 ✕ 11,3 %', `las pestañas: ${tabs.join(' | ')}`)
  ok(q(m, 'data-pestana-azar', 'completo').getAttribute('aria-selected') === 'true', 'por defecto, la completa')
  ok(q(m, 'data-regla-pasar').textContent === 'Para pasar hay que ganar al 95 % de las copias en los DOS periodos', 'la línea a la derecha de las pestañas')
  const lineas = (x) => x.raiz.conAtributo('data-abanico').length + '+' + x.raiz.conAtributo('data-linea').map(n => n.getAttribute('data-linea')).sort().join()
  ok(lineas(m) === '5+estrategia,mejor,peor,tipica', `5 líneas del abanico y las 4: ${lineas(m)}`)
  ok(m.raiz.conAtributo('data-zona').length === 2, 'las dos zonas sombreadas')
  ok(q(m, 'data-linea', 'estrategia').getAttribute('stroke-width') == '3' || D.propsDe(q(m, 'data-linea', 'estrategia')).strokeWidth === 3, 'tu estrategia, la gruesa')
  const etq = () => m.raiz.conAtributo('data-etiqueta').map(n => Number(n.getAttribute('y') ?? D.propsDe(n).y)).sort((a, b) => a - b)
  const sinMontar = () => etq().every((y, k, xs) => !k || y - xs[k - 1] >= 15.99)
  ok(sinMontar() && etq().length === 6, `las etiquetas, sin montarse (${etq().length})`)
  const unaTipica = () => { const w = m.raiz.conAtributo('data-etiqueta').map(n => n.textContent); return w.filter(x => x.startsWith('La típica (mediana) ')).length === 1 && !w.some(x => x.startsWith('Mediana ')) }
  ok(unaTipica() && q(m, 'data-etiqueta', 'tipica').textContent === 'La típica (mediana) 44.332 €', `típica y mediana, en una sola etiqueta: ${q(m, 'data-etiqueta', 'tipica').textContent}`)
  const celda = (k) => q(m, 'data-cifra', k).textContent
  ok(celda('periodo-2016-01-01').includes('✓ ganó al 99,2 %') && celda('periodo-2021-01-01').includes('✕ ganó al 11,3 %'), 'el veredicto: las dos filas')
  ok(q(m, 'data-nota-gana').textContent.includes('solo informativo, no cuenta para el veredicto') && q(m, 'data-gana-a').textContent === `${RA.pctTexto(g.pestanas.completo.percentil)} %`, `completa: ganó al ${q(m, 'data-gana-a').textContent}, solo informativo`)
  ok(/\d\.\d{3} €/.test(celda('final-estrategia')) && /\d\.\d{3} €/.test(celda('final-mejor')) && /\d\.\d{3} €/.test(celda('final-tipica')) && /\d\.\d{3} €/.test(celda('final-peor')), 'los finales de tu estrategia y de las 3 copias')
  ok(celda('fiabilidad').includes('Fiable ✓'), 'fiabilidad')
  for (const [k, pct] of [['2016-01-01', '99,2 %'], ['2021-01-01', '11,3 %']]) {
    D.pulsa(q(m, 'data-pestana-azar', k)); await D.espera(10)
    ok(q(m, 'data-gana-a').textContent === pct && !q(m, 'data-nota-gana').textContent.includes('solo informativo'), `${k}: ganó al ${pct}, sin «solo informativo»`)
    ok(celda('periodo-2016-01-01').includes('99,2 %') && celda('periodo-2021-01-01').includes('11,3 %'), `${k}: las dos filas siguen a la vista`)
    ok(lineas(m) === '5+estrategia,mejor,peor,tipica' && sinMontar() && unaTipica(), `${k}: sus líneas, con las etiquetas sin montarse y una sola de la típica`)
    ok(celda('operaciones').includes(String(guardado.periodos.find(p => p.desde === k).operaciones)), `${k}: sus operaciones`)
  }
  m.quita(); await D.espera(5)
  // Sin precios todavía, o si fallan: el veredicto se ve igual.
  m = D.monta(h(Res, { prueba, resultado: guardado, obtenerPrecios: () => new Promise(() => {}) }), RDC); await D.espera(10)
  ok(q(m, 'data-sin-grafico').textContent === 'Preparando el gráfico…' && celda('periodo-2016-01-01').includes('99,2 %') && q(m, 'data-gana-a').textContent === '—', 'mientras tanto: «Preparando» y el veredicto a la vista'); m.quita(); await D.espera(5)
  m = D.monta(h(Res, { prueba, resultado: guardado, obtenerPrecios: async () => { throw new Error('sin red') } }), RDC); await D.espera(10)
  ok(q(m, 'data-sin-grafico').textContent.includes('No se pudo preparar el gráfico: sin red') && celda('periodo-2021-01-01').includes('11,3 %'), 'si fallan los precios: lo dice y el veredicto sigue'); m.quita(); await D.espera(5)
  // Sin gráfico guardado: se calcula una vez, se guarda aparte y no se pide lo demás; con él, no se calcula.
  const llamadas = []
  const ctx = (guardados) => ({ url: 'https://f', headers: {}, fetch: async (u, o = {}) => { llamadas.push(`${o.method || 'GET'} ${String(u).split('/rest/v1/')[1].split('?')[0]}`); if ((o.method || 'GET') === 'POST') { const c = JSON.parse(o.body); return { ok: true, status: 201, json: async () => [{ datos: c.datos }] } } return { ok: true, status: 200, json: async () => guardados } } })
  m = D.monta(h(Res, { prueba, resultado: guardado, ctx: ctx([]), preciosInicial: precios }), RDC); await D.espera(1500)
  ok(llamadas.join() === 'GET pruebas_azar_graficos,POST pruebas_azar_graficos' && !!q(m, 'data-grafico', 'azar'), `sin guardar: lo calcula, lo guarda aparte y lo dibuja (${llamadas.join(', ')})`); m.quita(); await D.espera(5)
  llamadas.length = 0
  m = D.monta(h(Res, { prueba, resultado: guardado, ctx: ctx([{ datos: g }]), preciosInicial: precios }), RDC); await D.espera(100)
  ok(llamadas.join() === 'GET pruebas_azar_graficos' && !!q(m, 'data-grafico', 'azar'), 'guardado: solo lo lee'); m.quita(); await D.espera(5)
  // Otros precios: una línea.
  m = D.monta(h(Res, { prueba, resultado: guardado, graficosInicial: g, preciosInicial: { AAPL: precios.AAPL.map((b, i) => i === 500 ? { ...b, close: b.close + 1 } : b) } }), RDC); await D.espera(100)
  ok(!!q(m, 'data-otros-precios'), 'si los precios han cambiado: lo avisa en una línea'); m.quita(); await D.espera(5)
  // Pasa y sin veredicto.
  const con = (o) => ({ ...guardado, ...o })
  m = await monta({ resultado: con({ veredicto: 'pasa', texto: 'Pasa', periodos: guardado.periodos.map(p => ({ ...p, percentil: 98, gana: true })) }) })
  ok(q(m, 'data-veredicto', 'pasa').textContent === '✓ Pasa', '✓ Pasa'); m.quita(); await D.espera(5)
  m = await monta({ resultado: con({ veredicto: 'sinVeredicto', texto: 'Sin veredicto', aprobadosFalsos: [12, 3], periodos: guardado.periodos.map((p, k) => ({ ...p, aprobadosFalsos: k ? 3 : 12 })) }) })
  ok(q(m, 'data-veredicto', 'sinVeredicto').textContent === 'Sin veredicto' && !!q(m, 'data-informativo') && celda('fiabilidad').includes('No fiable'), 'Sin veredicto: lo dice y «No fiable»'); m.quita(); await D.espera(5)
  // ── 4 · «Ver en velas» ──
  const Ve = require(R + '/components/BuilderAzarVelas.js')
  const vs = [v(100, 100), v(100, 110), v(110, 121), v(121, 110), v(110, 99), v(99, 99)].map((b, i) => ({ ...b, date: `2020-01-0${i + 1}` }))
  const zona = Ve.zonaDentro(vs, 1, 5, ops)
  ok(zona.length === 5 && zona.map(z => z.color === 'rgba(0,0,0,0)' ? 0 : 1).join('') === '11101', `la zona de dentro: ${zona.map(z => z.color === 'rgba(0,0,0,0)' ? 0 : 1).join('')} (las velas 1, 2, 3 y 5)`)
  const mE = Ve.marcasEstrategia(vs, ops)
  ok(mE.length === 4 && mE.filter(x => x.shape === 'arrowUp').map(x => x.time).join() === '2020-01-02,2020-01-06' && mE.filter(x => x.shape === 'arrowDown').map(x => x.time).join() === '2020-01-04,2020-01-06' && mE.every(x => x.color === '#58a6ff') && mE.every((x, k) => !k || mE[k - 1].time <= x.time), 'tus ▲ y ▼ azules, en orden de fecha')
  const pC = Ve.puntosCopia(vs, ops)
  ok(pC.length === 4 && pC[0].compra && pC[0].precio === 100 && !pC[1].compra && pC[1].precio === 110, 'los ● y ○ de la copia, a su precio')
  ok(Ve.marcasEstrategia(vs, ops, { tuCompra: false, tuVenta: true }).every(x => x.shape === 'arrowDown') && Ve.marcasEstrategia(vs, ops, { tuCompra: true, tuVenta: false }).every(x => x.shape === 'arrowUp') && !Ve.marcasEstrategia(vs, ops, {}).length, 'las capas apagan tus ▲ y tus ▼ por separado')
  const rN = Ve.rangoNormal({ priceRange: { minValue: 5, maxValue: 300 }, margins: { above: 20, below: 20 } })
  ok(rN.priceRange.minValue === 0 && rN.priceRange.maxValue > 300 && rN.margins.below === 0 && Ve.rangoNormal({ priceRange: { minValue: 100, maxValue: 200 } }).priceRange.minValue === 92 && Ve.rangoNormal(null) === null, 'la escala normal no baja de 0')
  // Un lightweight-charts de mentira, que apunta lo que le piden: el de verdad necesita un navegador.
  const Mod = require('module'), cargaReal = Mod._load, LW = { series: {}, mode: null, margenes: null, proveedor: null }
  Mod._load = function (pet, ...r) {
    if (pet !== 'lightweight-charts') return cargaReal.call(this, pet, ...r)
    const serie = (o) => ({ opciones: { ...o }, setData() {}, setMarkers(x) { this.marcas = x }, applyOptions(x) { Object.assign(this.opciones, x) }, priceToCoordinate: () => 50 })
    return { CrosshairMode: { Normal: 0 }, PriceScaleMode: { Normal: 0, Logarithmic: 1 }, createChart: (_, o) => (LW.opciones = o, {
      addHistogramSeries: (o) => (LW.series.zona = serie(o)), addCandlestickSeries: (o) => { LW.proveedor = o.autoscaleInfoProvider; return (LW.series.velas = serie(o)) }, subscribeCrosshairMove() {}, remove() {},
      priceScale: (id) => ({ applyOptions(x) { if (id === 'right') { LW.mode = x.mode; LW.margenes = x.scaleMargins } } }),
      timeScale: () => ({ fitContent() {}, subscribeVisibleLogicalRangeChange() {}, timeToCoordinate: () => 100, width: () => 1000 }) }) }
  }
  m = await monta()
  // Regla de oro: la tabla de las velas, con la pestaña completa.
  D.pulsa(q(m, 'data-ver-velas', 'tipica')); await D.espera(20)
  for (const [k, x] of [['final', ['55.706 €', '44.332 €']], ['operaciones', ['123', '103']], ['ganadoras', ['42,3 %', '52,4 %']], ['caida', ['29,1 %', '27,6 %']], ['dentro', ['68,7 %', '73,1 %']]]) ok(q(m, 'data-fila-velas', k).textContent.endsWith(x.join('')), `regla de oro, ${k}: tú ${x[0]}, típica ${x[1]}`)
  D.pulsa(q(m, 'data-cerrar-velas')); await D.espera(10); m.quita(); await D.espera(5)
  m = await monta({ pestanaInicial: '2021-01-01' })
  ok(m.raiz.conAtributo('data-ver-velas').map(n => n.getAttribute('data-ver-velas')).join() === 'estrategia,mejor,tipica,peor', 'el icono de velas en tu estrategia y en cada copia, en el panel')
  ok(m.raiz.conAtributo('data-ver-velas').every(n => D.propsDe(n).title === 'Ver en velas'), 'cada icono, con su «Ver en velas» al pasar por encima')
  ok(q(m, 'data-ver-velas-arriba').textContent === 'Ver en velas', 'el botón «Ver en velas» arriba del gráfico')
  ok(!q(m, 'data-leyenda-azar').textContent.includes('Ver en velas'), 'la leyenda de abajo, solo con los nombres')
  ok(q(m, 'data-cifra', 'final-tipica').textContent.startsWith('La típica') && /\d €$/.test(q(m, 'data-cifra', 'final-tipica').textContent), 'el icono no cambia el texto de la fila')
  D.pulsa(q(m, 'data-ver-velas-arriba')); await D.espera(20)
  ok(q(m, 'data-titulo-velas').textContent === 'Tu estrategia' && q(m, 'data-copia-velas', 'estrategia').getAttribute('aria-pressed') === 'true', 'el botón de arriba abre «Tu estrategia»')
  ok(m.raiz.conAtributo('data-copia-velas').map(n => n.textContent).join(' · ') === 'Tu estrategia · La mejor copia · La típica · La peor copia', 'el selector, con las cuatro vistas')
  const capasVe = () => m.raiz.conAtributo('data-capa-velas').map(n => n.getAttribute('data-capa-velas')).join()
  const circulos = () => q(m, 'data-capa-copia').todos(n => n.nodeName.toLowerCase() === 'circle').length
  const nTH = () => q(m, 'data-tabla-velas').todos(n => n.nodeName === 'TH').length
  const wE = G.vistaPestana(prueba, precios, g.pestanas['2021-01-01'], '2021-01-01'), todasMarcas = wE.estrategia.ops.length * 2, deCopia = (k) => wE.copias[k].ops.length * 2
  ok(capasVe() === 'tuCompra,tuVenta,tuDentro' && circulos() === 0 && nTH() === 2 && LW.series.velas.marcas.length === todasMarcas, `vista «Tu estrategia»: 3 capas, sin círculos, una columna, ${todasMarcas} marcas`)
  ok(LW.mode === 1 && LW.margenes.top > 0 && q(m, 'data-escala-velas', 'log').getAttribute('aria-pressed') === 'true', 'por defecto, escala logarítmica')
  ok(LW.opciones.timeScale.minBarSpacing * G.vistaPestana(prueba, precios, g.pestanas.completo, 'completo').fechas.length < 400, 'el periodo completo cabe en una ventana estrecha (menos de 400 píxeles)')
  for (const [k, t] of [['mejor', 'Tu estrategia frente a la mejor copia'], ['tipica', 'Tu estrategia frente a la copia típica'], ['peor', 'Tu estrategia frente a la peor copia']]) {
    D.pulsa(q(m, 'data-copia-velas', k)); await D.espera(10)
    ok(q(m, 'data-titulo-velas').textContent === t && capasVe() === 'tuCompra,tuVenta,tuDentro,copiaCompra,copiaVenta' && nTH() === 3 && circulos() === deCopia(k) && LW.series.velas.marcas.length === todasMarcas, `vista ${k}: «${t}», 5 capas, dos columnas, sus ${deCopia(k)} círculos y tus marcas`)
  }
  // Cada filtro, apagado y encendido.
  const cuenta = () => [LW.series.velas.marcas.filter(x => x.shape === 'arrowUp').length, LW.series.velas.marcas.filter(x => x.shape === 'arrowDown').length, LW.series.zona.opciones.visible, q(m, 'data-capa-copia').todos(n => n.nodeName.toLowerCase() === 'circle' && n.getAttribute('fill') === '#f0883e').length, q(m, 'data-capa-copia').todos(n => n.nodeName.toLowerCase() === 'circle' && n.getAttribute('fill') !== '#f0883e').length]
  const N = wE.estrategia.ops.length, Nc = wE.copias.peor.ops.length
  ok(cuenta().join() === [N, N, true, Nc, Nc].join(), `todo encendido: ${cuenta().join()}`)
  for (const [k, apagado] of [['tuCompra', [0, N, true, Nc, Nc]], ['tuVenta', [N, 0, true, Nc, Nc]], ['tuDentro', [N, N, false, Nc, Nc]], ['copiaCompra', [N, N, true, 0, Nc]], ['copiaVenta', [N, N, true, Nc, 0]]]) {
    D.pulsa(q(m, 'data-capa-velas', k)); await D.espera(10)
    const p = D.propsDe(q(m, 'data-capa-velas', k)).style
    ok(cuenta().join() === apagado.join() && q(m, 'data-capa-velas', k).getAttribute('aria-pressed') === 'false' && p.textDecoration === 'line-through' && p.opacity < 1, `${k} apagada: ${cuenta().join()}, atenuada y tachada`)
    ok(JSON.parse(window.localStorage.getItem('builder_azar_velas_capas'))[k] === false, `${k}: recordada en el navegador`)
    D.pulsa(q(m, 'data-capa-velas', k)); await D.espera(10)
    ok(cuenta().join() === [N, N, true, Nc, Nc].join() && D.propsDe(q(m, 'data-capa-velas', k)).style.textDecoration === 'none', `${k} encendida otra vez`)
  }
  // Se mantiene al cambiar de vista y al volver a abrir; en «Tu estrategia» no salen las de la copia.
  D.pulsa(q(m, 'data-capa-velas', 'tuVenta')); D.pulsa(q(m, 'data-capa-velas', 'tuVenta')); await D.espera(5)
  D.pulsa(q(m, 'data-capa-velas', 'copiaVenta')); await D.espera(5); D.pulsa(q(m, 'data-copia-velas', 'mejor')); await D.espera(10)
  ok(q(m, 'data-capa-velas', 'copiaVenta').getAttribute('aria-pressed') === 'false' && circulos() === wE.copias.mejor.ops.length, 'lo apagado sigue apagado al cambiar de copia')
  D.pulsa(q(m, 'data-cerrar-velas')); await D.espera(10); D.pulsa(q(m, 'data-ver-velas', 'peor')); await D.espera(20)
  ok(q(m, 'data-capa-velas', 'copiaVenta').getAttribute('aria-pressed') === 'false', 'y al volver a abrir')
  D.pulsa(q(m, 'data-capa-velas', 'copiaVenta')); await D.espera(5)
  // Log / Normal.
  D.pulsa(q(m, 'data-escala-velas', 'normal')); await D.espera(10)
  const base = () => ({ priceRange: { minValue: 20, maxValue: 280 }, margins: { above: 30, below: 30 } })
  ok(LW.mode === 0 && LW.margenes.top === 0 && LW.margenes.bottom === 0 && LW.proveedor(base).priceRange.minValue === 0 && LW.proveedor(base).margins.below === 0 && circulos() === deCopia('peor'), 'Normal: escala normal y el eje no baja de 0')
  D.pulsa(q(m, 'data-escala-velas', 'log')); await D.espera(10)
  ok(LW.mode === 1 && LW.proveedor(base).margins.below === 30 && circulos() === deCopia('peor'), 'Log: otra vez logarítmica, con sus círculos')
  D.pulsa(q(m, 'data-cerrar-velas')); await D.espera(10); m.quita(); await D.espera(5)
  // Lo guardado roto, o un navegador que no deja guardar: no molesta.
  window.localStorage.setItem('builder_azar_velas_capas', 'esto no es json'); m = await monta({ velasInicial: 'tipica' })
  ok(q(m, 'data-capa-velas', 'copiaVenta').getAttribute('aria-pressed') === 'true', 'si lo guardado está roto: todo encendido')
  const set = window.localStorage.setItem; window.localStorage.setItem = () => { throw new Error('lleno') }
  D.pulsa(q(m, 'data-capa-velas', 'tuDentro')); await D.espera(10)
  ok(q(m, 'data-capa-velas', 'tuDentro').getAttribute('aria-pressed') === 'false', 'si no se puede guardar: el filtro funciona igual')
  window.localStorage.setItem = set; window.localStorage.removeItem('builder_azar_velas_capas'); m.quita(); await D.espera(5)
  Mod._load = cargaReal
  m = await monta({ pestanaInicial: '2021-01-01' })
  D.pulsa(q(m, 'data-ver-velas', 'tipica')); await D.espera(20)
  const fila5 = (k) => q(m, 'data-fila-velas', k).textContent
  ok(q(m, 'data-titulo-velas').textContent === 'Tu estrategia frente a la copia típica' && q(m, 'data-periodo-velas').textContent === 'AAPL · 2021–2025 · velas diarias', 'el título, el símbolo y el periodo')
  ok(q(m, 'data-copia-velas', 'tipica').getAttribute('aria-pressed') === 'true' && m.raiz.textContent.includes('Rueda: zoom · arrastrar: moverse'), 'la elegida marcada, y cómo moverse')
  const wT = G.vistaPestana(prueba, precios, g.pestanas['2021-01-01'], '2021-01-01')
  ok(fila5('final').includes(RA.euros(wT.estrategia.final)) && fila5('final').includes(RA.euros(wT.copias.tipica.final)) && fila5('final').startsWith('Final (10.000 € al empezar)'), `Final: ${fila5('final')}`)
  ok(fila5('operaciones').includes(String(wT.estrategia.operaciones)) && fila5('ganadoras').startsWith('Ganadoras') && fila5('caida').startsWith('Peor caída') && fila5('dentro').startsWith('Tiempo dentro de AAPL'), `las filas de la tabla: ${fila5('dentro')}`)
  ok(q(m, 'data-fila-velas', 'caida').textContent.includes(RA.numero(guardado.periodos[1].caida, 1, true)), 'su peor caída, la del resultado')
  D.pulsa(q(m, 'data-copia-velas', 'mejor')); await D.espera(10)
  ok(q(m, 'data-titulo-velas').textContent === 'Tu estrategia frente a la mejor copia' && fila5('final').includes(RA.euros(wT.copias.mejor.final)), 'cambiar a la mejor: título y tabla')
  D.pulsa(q(m, 'data-copia-velas', 'peor')); await D.espera(10)
  ok(q(m, 'data-titulo-velas').textContent === 'Tu estrategia frente a la peor copia', 'y a la peor')
  D.pulsa(q(m, 'data-cerrar-velas')); await D.espera(10)
  ok(!q(m, 'data-velas-azar') && !!q(m, 'data-grafico', 'azar'), '× la cierra y vuelve al gráfico')
  D.pulsa(q(m, 'data-ver-velas', 'estrategia')); await D.espera(20)
  ok(q(m, 'data-titulo-velas').textContent === 'Tu estrategia' && !m.raiz.textContent.includes('La copia compra') && q(m, 'data-tabla-velas').todos(n => n.nodeName === 'TH').length === 2, 'desde tu estrategia: solo tus operaciones')
  m.quita(); await D.espera(5)
  // ── 5 · El «?» de las velas: cómo nacen las copias (§67) ──
  const wC = G.vistaPestana(prueba, precios, g.pestanas.completo, 'completo'), eT = Ve.cifrasEjemplo(wC, 'tipica')
  ok(eT.C === 103 && eT.A === 123 && eT.N1 === 909 && eT.N2 === 780 && eT.B === 106 && Math.abs(eT.N2 * eT.tasa - eT.C) < 5, `típica de EMA20, 2016–2025: ${eT.N1} velas fuera, ${eT.A} compras; la copia ${eT.N2} velas, ≈ ${eT.B}, salieron ${eT.C}`)
  for (const per of guardado.periodos) {
    const w = G.vistaPestana(prueba, precios, g.pestanas[per.desde], per.desde)
    ok(cerca(Ve.cifrasEjemplo(w, 'tipica').tasa, per.tasa, 1e-12), `${per.desde}: la frecuencia del ejemplo es la tasa guardada (${per.tasa.toFixed(4)})`)
    for (const k of ['mejor', 'tipica', 'peor']) {
      const dentro = new Uint8Array(w.i1 + 1); for (const o of w.copias[k].ops) for (let j = o.e + 1; j <= o.x; j++) dentro[j] = 1
      let fuera = 0; for (let j = w.i0; j <= w.i1; j++) if (!dentro[j]) fuera++
      ok(Ve.cifrasEjemplo(w, k).N2 === fuera && Ve.cifrasEjemplo(w, k).C === w.copias[k].operaciones, `${per.desde} · ${k}: velas fuera contadas una a una, ${fuera}`)
    }
  }
  ok(renderToString(h(require(R + '/components/BuilderAyuda.js').default, { texto: 'x', abiertoInicial: true })).includes('z-index:1000'), 'los demás «?» siguen con su zIndex de siempre')
  HTMLElement.prototype.cloneNode = HTMLElement.prototype.cloneNode || function () { const c = document.createElement('span'); c.remove = () => c.parentNode?.removeChild(c); return c }   // lo que usa el «?» al medirse; el DOM falso no mide
  document.querySelector = (s) => s === '[data-ayuda-ventana]' ? document.body.conAtributo('data-ayuda-ventana')[0] || null : null
  const tecla = (key) => { for (const f of [...(document.oyentes.keydown || [])]) f({ key }) }
  m = await monta(); D.pulsa(q(m, 'data-ver-velas-arriba')); await D.espera(20)
  const botonQ = () => m.raiz.busca(n => n.getAttribute('aria-label') === 'Ayuda: Cómo nacen las copias'), ventanaQ = () => document.body.conAtributo('data-ayuda-ventana')[0] || null
  const miles = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  ok(!!botonQ() && botonQ().parentNode.parentNode.contains(q(m, 'data-titulo-velas')) && q(m, 'data-titulo-velas').textContent === 'Tu estrategia', 'el «?», junto al título, sin cambiar el título')
  for (const [k, c] of [['estrategia', 'tipica'], ['mejor', 'mejor'], ['tipica', 'tipica'], ['peor', 'peor']]) {
    D.pulsa(q(m, 'data-copia-velas', k)); await D.espera(10)
    D.pulsa(botonQ()); await D.espera(10)
    const e = Ve.cifrasEjemplo(wC, c), X = '13,5 %', t = ventanaQ()?.textContent || ''
    ok(t === `¿Por qué la copia no hace las mismas operaciones que tu estrategia?Las copias no repiten tus operaciones: solo copian tu forma de VENDER.1. Cuándo compran: al azar, con tu misma frecuencia. Tú compras en el ${X} de las velas en que estás fuera; la copia, en cada vela en que está fuera, compra con esa misma probabilidad (en la apertura siguiente).2. Cuándo venden: con tus mismas reglas de venta y tus mismos stops.Por eso la duración cambia (tu regla de venta, aplicada desde otro día de compra, se cumple antes o después) y el número de operaciones también.Ejemplo con esta prueba: tú estás fuera ${miles(e.N1)} velas y haces ${e.A} compras → ${X}. La copia está fuera ${miles(e.N2)} velas → ${miles(e.N2)} × ${X} ≈ ${e.B} compras; le salieron ${e.C}.Así la prueba contesta una sola pregunta: ¿tu momento de compra aporta algo? Todo lo demás es igual que en tu estrategia.`, `vista ${k}: el texto entero, con ${miles(e.N2)} velas, ≈ ${e.B} y ${e.C}`)
    ok(D.propsDe(ventanaQ()).style.zIndex > D.propsDe(q(m, 'data-velas-azar')).style.zIndex, `vista ${k}: la ventana del «?», por encima de la pantalla de velas`)
    tecla('Escape'); await D.espera(10)
    ok(!ventanaQ() && !!q(m, 'data-velas-azar'), `vista ${k}: Esc cierra el «?» y las velas siguen abiertas`)
  }
  tecla('Escape'); await D.espera(10)
  ok(!q(m, 'data-velas-azar'), 'sin el «?» abierto, Esc cierra las velas'); m.quita(); await D.espera(5)
  const fuenteV = require('fs').readFileSync(path.join(R, 'components/BuilderAzarVelas.js'), 'utf8')
  ok(fuenteV.includes("e.key === 'Escape'") && fuenteV.includes("import('lightweight-charts')"), 'Esc cierra; lightweight-charts, como el resto de la app')

  const html = renderToString(h(Res, { prueba, resultado: guardado, graficosInicial: g, preciosInicial: precios }))
  ok(html.includes('data-pantalla="resultado-azar"') && html.includes('data-abanico="p95"') && html.includes('data-ver-velas-arriba'), 'renderToString, sin error')
  const htmlV = (cual) => renderToString(h(Ve.default, { v: G.vistaPestana(prueba, precios, g.pestanas.completo, 'completo'), simbolo: 'AAPL', inicial: cual }))
  ok(['estrategia', 'mejor', 'tipica', 'peor'].every(c => htmlV(c).includes('data-tabla-velas')) && !htmlV('estrategia').includes('copiaCompra') && htmlV('peor').includes('copiaCompra'), 'renderToString de las cuatro vistas, sin error')

  console.log(fallos ? `azar-graficos: ${fallos} fallos` : `azar-graficos: todas bien · ${(bytes / 1024).toFixed(0)} KB por prueba`)
  process.exit(fallos ? 1 : 0)
})().catch(e => { console.log('✗', e.stack || e.message || e); process.exit(1) })
