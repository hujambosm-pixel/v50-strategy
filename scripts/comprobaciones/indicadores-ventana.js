// scripts/comprobaciones/indicadores-ventana.js — la ventana «📈 Indicadores» del gráfico (lib/indicadoresVentana.js y
// components/VentanaIndicadores.js, docs/builder.md §212). Las corre comunes.sh. Termina en 0 si todo da lo esperado.
process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://arnes.invalid'; process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'clave-falsa-del-arnes'
const C0 = require('./cargador'), R = C0.RAIZ, D = require('./domFalso')
let fallos = 0
const ok = (c, t) => { console.log(`${c ? 'OK  ' : 'MAL '} ${t}`); if (!c) fallos++ }
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b)

;(async () => {
  D.pon()
  const OV = {}
  window.addEventListener = (t, f) => { (OV[t] ||= []).push(f) }
  window.removeEventListener = (t, f) => { OV[t] = (OV[t] || []).filter(x => x !== f) }
  await C0.prepara(); C0.registra(R)
  const V = require(R + '/lib/indicadoresVentana.js'), I = require(R + '/lib/indicadores.js')

  // ── Lo puro ──
  ok(igual(V.listaIndicadores(), I.TIPOS_DISPONIBLES), `«Todos»: los ${I.TIPOS_DISPONIBLES.length} del catálogo (${I.TIPOS_DISPONIBLES.join(', ')})`)
  ok(igual(V.listaIndicadores('precio'), ['medias', 'bollinger']), '«Sobre el precio»: medias y Bollinger')
  ok(igual(V.listaIndicadores('panel'), ['rsi', 'macd', 'volumen']), '«En panel aparte»: RSI, MACD y volumen')
  ok(igual(V.listaIndicadores('todos', 'EMA'), ['medias']) && igual(V.listaIndicadores('todos', 'movil'), ['medias']) && igual(V.listaIndicadores('todos', 'Móvil'), ['medias']), 'buscar «EMA», «movil» o «Móvil» (sin mayúsculas ni acentos): medias')
  ok(igual(V.listaIndicadores('todos', 'bandas'), ['bollinger']) && igual(V.listaIndicadores('todos', 'oscilador'), ['rsi', 'macd']), '«bandas» → Bollinger; «oscilador» → RSI y MACD')
  ok(igual(V.listaIndicadores('todos', 'media rsi'), []), 'todas las palabras tienen que estar («media rsi»: ninguno)')
  ok(igual(V.listaIndicadores('favoritos', '', ['rsi', 'nada']), ['rsi']) && igual(V.listaIndicadores('favoritos'), []), 'favoritos: solo los marcados')

  // ── El montaje ──
  const React = require(R + '/node_modules/react'), RDC = require(R + '/node_modules/react-dom/client')
  const VI = require(R + '/components/VentanaIndicadores.js').default
  const anadidos = []; let cerrada = 0
  const enGrafico = [I.nuevoIndicador('medias', 0)]
  localStorage.removeItem('indicadores.favoritos')
  const m = D.monta(React.createElement(VI, { enGrafico, onAnadir: t => anadidos.push(t), onCerrar: () => { cerrada++ } }), RDC); await D.espera(30)
  const filas = () => m.raiz.todos(n => n.hasAttribute('data-indicador')).map(n => n.getAttribute('data-indicador'))
  ok(igual(filas(), I.TIPOS_DISPONIBLES), 'al abrir: la lista entera')
  ok(/En el gráfico: Medias · 1/.test(m.raiz.busca(n => n.hasAttribute('data-en-grafico')).textContent), 'abajo dice lo que ya hay en el gráfico («Medias · 1»)')
  D.pulsa(m.raiz.busca(n => n.getAttribute('data-indicador') === 'rsi')); await D.espera(10)
  D.pulsa(m.raiz.busca(n => n.getAttribute('data-indicador') === 'macd')); await D.espera(10)
  ok(igual(anadidos, ['rsi', 'macd']) && cerrada === 0, 'un clic añade (RSI y MACD) y la ventana sigue abierta')
  D.escribe(m.raiz.busca(n => n.nodeName === 'INPUT'), 'bandas'); await D.espera(20)
  ok(igual(filas(), ['bollinger']), 'buscar «bandas»: Bollinger')
  D.pulsa(m.raiz.busca(n => n.hasAttribute('data-limpia'))); await D.espera(20)
  ok(filas().length === I.TIPOS_DISPONIBLES.length, 'la ✕ limpia la búsqueda')
  D.pulsa(m.raiz.busca(n => n.getAttribute('data-grupo') === 'panel')); await D.espera(20)
  ok(igual(filas(), ['rsi', 'macd', 'volumen']), 'grupo «En panel aparte»')
  const e = { stopPropagation() {} }
  D.propsDe(m.raiz.busca(n => n.getAttribute('data-fav') === 'volumen')).onClick(e); await D.espera(20)
  ok(igual(JSON.parse(localStorage.getItem('indicadores.favoritos')), ['volumen']) && anadidos.length === 2, '☆ marca Volumen como favorito (se guarda en el navegador) sin añadirlo')
  D.pulsa(m.raiz.busca(n => n.getAttribute('data-grupo') === 'favoritos')); await D.espera(20)
  ok(igual(filas(), ['volumen']), 'grupo «Favoritos»: Volumen')
  for (const f of OV.keydown || []) f({ key: 'Escape', stopPropagation() {} })
  ok(cerrada === 1, 'Esc cierra la ventana')
  m.quita()

  // ── La leyenda del gráfico ya no tiene «+ Indicador» ──
  const RDS = require(R + '/node_modules/react-dom/server'), CC = require(R + '/components/CandleChart.js').default
  const h = RDS.renderToString(React.createElement(CC, { data: [{ date: '2024-01-02', open: 1, high: 2, low: 0.5, close: 1.5 }], onIndicadores: () => {}, indicadoresUsuario: [] }))
  ok(!h.includes('+ Indicador') && !h.includes('Añadir indicador'), 'la leyenda del gráfico ya no tiene «+ Indicador» (lo hace la ventana)')

  console.log(fallos ? `\n${fallos} FALLOS` : '\nTodo en verde')
  process.exit(fallos ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
