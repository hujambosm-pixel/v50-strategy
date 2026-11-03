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
  ok(sinMontar() && etq().length === 7, `las etiquetas, sin montarse (${etq().length})`)
  const celda = (k) => q(m, 'data-cifra', k).textContent
  ok(celda('periodo-2016-01-01').includes('✓ ganó al 99,2 %') && celda('periodo-2021-01-01').includes('✕ ganó al 11,3 %'), 'el veredicto: las dos filas')
  ok(q(m, 'data-nota-gana').textContent.includes('solo informativo, no cuenta para el veredicto') && q(m, 'data-gana-a').textContent === `${RA.pctTexto(g.pestanas.completo.percentil)} %`, `completa: ganó al ${q(m, 'data-gana-a').textContent}, solo informativo`)
  ok(/\d\.\d{3} €/.test(celda('final-estrategia')) && /\d\.\d{3} €/.test(celda('final-mejor')) && /\d\.\d{3} €/.test(celda('final-tipica')) && /\d\.\d{3} €/.test(celda('final-peor')), 'los finales de tu estrategia y de las 3 copias')
  ok(celda('fiabilidad').includes('Fiable ✓'), 'fiabilidad')
  for (const [k, pct] of [['2016-01-01', '99,2 %'], ['2021-01-01', '11,3 %']]) {
    D.pulsa(q(m, 'data-pestana-azar', k)); await D.espera(10)
    ok(q(m, 'data-gana-a').textContent === pct && !q(m, 'data-nota-gana').textContent.includes('solo informativo'), `${k}: ganó al ${pct}, sin «solo informativo»`)
    ok(celda('periodo-2016-01-01').includes('99,2 %') && celda('periodo-2021-01-01').includes('11,3 %'), `${k}: las dos filas siguen a la vista`)
    ok(lineas(m) === '5+estrategia,mejor,peor,tipica' && sinMontar(), `${k}: sus líneas, con las etiquetas sin montarse`)
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
  const html = renderToString(h(Res, { prueba, resultado: guardado, graficosInicial: g, preciosInicial: precios }))
  ok(html.includes('data-pantalla="resultado-azar"') && html.includes('data-abanico="p95"'), 'renderToString, sin error')

  console.log(fallos ? `azar-graficos: ${fallos} fallos` : `azar-graficos: todas bien · ${(bytes / 1024).toFixed(0)} KB por prueba`)
  process.exit(fallos ? 1 : 0)
})().catch(e => { console.log('✗', e.stack || e.message || e); process.exit(1) })
