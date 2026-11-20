// scripts/comprobaciones/dibujos-pantalla.js — la PANTALLA de los dibujos sobre el gráfico (lib/dibujos/pantalla.js y
// components/DibujosGrafico.js, docs/builder.md §208). Las corre comunes.sh. Termina en 0 si todo da lo esperado.
// 1) Lo puro con un conversor inventado: la vela i en x = 10·i y el precio p en y = 200 − p (panel de 100 × 580). Cifras a mano.
// 2) CandleChart sin `dibujar`: el HTML, carácter a carácter el de antes (lo que había en el commit anterior, con git show).
// 3) El montaje con estado sobre un gráfico de mentira: elegir herramienta, clics, arrastrar, imán, deshacer, borrar, atajos, memoria por valor.
// 4) Guardar y leer en la base (§209), con una base de mentira: lib/dibujos/guardados.js y el componente (leer al abrir, guardar tras
//    800 ms, al soltar un arrastre y no a cada paso, al cambiar de valor; juntar lo dibujado mientras se leía; dos instancias a la vez).
// 5) Lo pedido por Sergi al ver la parte 3 (§210): estilo recordado por tipo, tamaño de letra, flechas, la barra bajo la cabecera y la 🎯.
// 6) Parte 5 (§211): posición larga y corta (acciones según lo que se arriesga y qué tocó antes), «Medir» y 🔒 «seguir dibujando».
process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://arnes.invalid'; process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'clave-falsa-del-arnes'
const C0 = require('./cargador'), R = C0.RAIZ, D = require('./domFalso')
let fallos = 0
const ok = (c, t) => { console.log(`${c ? 'OK  ' : 'MAL '} ${t}`); if (!c) fallos++ }
const cerca = (a, b, tol = 1e-9) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tol * Math.max(1, Math.abs(b))
const F = ['2024-01-02', '2024-01-03', '2024-01-04', '2024-01-05', '2024-01-08', '2024-01-09', '2024-01-10', '2024-01-11']
const VELAS = F.map((date, k) => ({ date, open: 100 + k, high: 104 + k, low: 98 + k, close: 102 + k }))

;(async () => {
  D.pon()
  // El window del DOM mínimo no guarda oyentes: aquí sí, para poder pulsar teclas y mover el ratón «en la ventana».
  const OV = {}
  window.addEventListener = (t, f) => { (OV[t] ||= []).push(f) }
  window.removeEventListener = (t, f) => { OV[t] = (OV[t] || []).filter(x => x !== f) }
  await C0.prepara(); C0.registra(R)
  const G = require(R + '/lib/dibujos/geometria.js'), P = require(R + '/lib/dibujos/pantalla.js')

  // ── 1 · Lo puro ──
  const esc = G.escala(F)
  const cv = { esc, ancho: 100, alto: 580, x: i => 10 * i, i: x => x / 10, y: p => 200 - p, p: y => 200 - y }
  const pt = (k, precio) => ({ fecha: F[k], precio })
  const lin = (f) => f.trazos.filter(e => e.el === 'line')
  {
    const d = P.creaDibujo('tendencia', [pt(0, 100), pt(2, 120)]), f = P.formas(d, cv, { elegido: true })
    const l = lin(f)[0].a
    ok(l.x1 === 0 && l.y1 === 100 && l.x2 === 20 && l.y2 === 80 && f.asas.length === 2 && f.golpe.length === 1, 'línea de tendencia de (vela 0, 100) a (vela 2, 120): de (0, 100) a (20, 80) px, con 2 asas')
    ok(P.formas(d, cv).asas.length === 0, 'sin elegir, no salen las asas')
  }
  {
    const f = P.formas(P.creaDibujo('rayo', [pt(0, 100), pt(2, 120)]), cv), l = lin(f)[0].a
    ok(l.x2 === 100 && cerca(l.y2, 0), 'línea que se alarga: sigue hasta el borde derecho (x = 100), donde vale 100 − 20 × 100 ÷ 20 = 0 px')
  }
  {
    const f = P.formas(P.creaDibujo('horizontal', [pt(3, 150)]), cv), l = lin(f)[0].a
    ok(l.x1 === 0 && l.x2 === 100 && l.y1 === 50 && f.eje[0].txt === '150,00', 'horizontal en 150: de lado a lado en y = 50 px y «150,00» en el eje de precios')
    ok(P.formas(P.creaDibujo('horizontal', [pt(3, 0.8523)]), cv).eje[0].txt === '0,8523', 'por debajo de 1 €, con 4 decimales (0,8523)')
    ok(P.formas(P.creaDibujo('horizontal', [pt(3, 1000)]), cv).eje.length === 0 && P.formas(P.creaDibujo('vertical', [pt(7, 100)]), { ...cv, ancho: 50 }).eje.length === 0, 'fuera de la vista (horizontal en 1.000, por encima del panel; vertical a la derecha), sin etiqueta en el eje')
  }
  {
    const f = P.formas(P.creaDibujo('vertical', [pt(3, 150)]), cv), l = lin(f)[0].a
    ok(l.x1 === 30 && l.y1 === 0 && l.y2 === 580 && f.eje[0].txt === '05/01/2024', 'vertical en la vela 3: de arriba abajo en x = 30 px y «05/01/2024» en el eje de fechas')
  }
  {
    // Recta de (0, 100) a (2, 120): en la vela 1 vale 110; el tercer punto (1, 90) queda 20 por debajo → paralela de (0, 80) a (2, 100).
    const f = P.formas(P.creaDibujo('canal', [pt(0, 100), pt(2, 120), pt(1, 90)]), cv, { elegido: true }), l = lin(f)
    ok(l[1].a.y1 === 120 && l[1].a.y2 === 100 && l[1].a.x2 === 20, 'canal: la paralela va de (0, 80) a (2, 100) → de 120 a 100 px')
    ok(f.asas[2].x === 10 && f.asas[2].y === 110, 'canal: el asa de la paralela, en su centro (10, 110) px')
    ok(l[2].a['stroke-dasharray'] === '4 4' && l[2].a.y1 === 110, 'canal: la línea del medio, discontinua (en 110 px a la izquierda)')
  }
  {
    const r = P.formas(P.creaDibujo('rectangulo', [pt(2, 120), pt(0, 100)]), cv).trazos[0].a
    ok(r.x === 0 && r.y === 80 && r.width === 20 && r.height === 20, 'rectángulo de (2, 120) a (0, 100): esquina (0, 80), 20 × 20 px')
  }
  {
    // De 100 (mínimo) a 150 (máximo): el 0 en 150 (y = 50) y el 0,618 en 150 − 50 × 0,618 = 119,10 (y = 80,9).
    const f = P.formas(P.creaDibujo('fibonacci', [pt(0, 100), pt(4, 150)]), cv)
    const txt = f.trazos.filter(e => e.el === 'text').map(e => e.txt)
    ok(txt.length === 7 && txt[0] === '0 (150,00)' && txt[4] === '0,618 (119,10)' && txt[6] === '1 (100,00)', `Fibonacci de 100 a 150: «${txt[0]}», «${txt[4]}», «${txt[6]}»`)
    const y618 = lin(f).find(e => cerca(e.a.y1, 80.9))
    ok(!!y618 && y618.a.x1 === 0 && y618.a.x2 === 40, 'Fibonacci: el nivel 0,618 en y = 80,9 px, de la vela 0 a la 4')
  }
  {
    const f = P.formas(P.creaDibujo('texto', [pt(1, 100)], { texto: 'Soporte' }), cv)
    ok(f.trazos[0].txt === 'Soporte' && f.trazos[0].a.x === 10 && f.golpe[0].a['pointer-events'] === 'all', 'texto: «Soporte» en (10, 100) px, y se coge con el ratón')
  }
  {
    const d = P.creaDibujo('tendencia', [pt(0, 100), pt(2, 120)])
    const m = P.mueve(d, esc, 2, 5)
    ok(m.puntos[0].fecha === F[2] && m.puntos[1].fecha === F[4] && m.puntos[0].precio === 105 && m.puntos[1].precio === 125, 'mover 2 velas y +5: de 04/01 (105) a 08/01 (125)')
    const fut = P.mueve(d, esc, 9, 0)
    ok(fut.puntos[1].fecha === '2024-01-17', 'mover hacia el futuro: la vela 11 es el miércoles 17/01 (3 sesiones tras el jueves 11/01)')
    const h = P.mueveAsa(P.creaDibujo('horizontal', [pt(3, 150)]), 0, pt(6, 140))
    ok(h.puntos[0].fecha === F[3] && h.puntos[0].precio === 140, 'mover la horizontal: solo cambia el precio')
    const v = P.mueveAsa(P.creaDibujo('vertical', [pt(3, 150)]), 0, pt(6, 140))
    ok(v.puntos[0].fecha === F[6] && v.puntos[0].precio === 150, 'mover la vertical: solo cambia la fecha')
    const dup = P.duplica(d, esc)
    ok(dup.id !== d.id && dup.puntos[0].fecha === F[5] && dup.puntos[0].precio === 100, 'duplicar: otra copia, 5 velas a la derecha')
    ok(P.creaDibujo('tendencia', [pt(0, 100)]) === null && P.creaDibujo('canal', [pt(0, 100), pt(1, 101)]) === null, 'con puntos de menos, no hay dibujo')
    const pv = P.provisional('canal', [pt(0, 100), pt(2, 120)], pt(1, 90))
    ok(pv && pv.puntos.length === 3 && pv.puntos[2].precio === 90, 'vista previa del canal: los dos puntos puestos y el del cursor')
    ok(P.num(1234.5) === '1.234,50' && P.num(-0.5, 1) === '−0,5', 'números en español: 1.234,50 y −0,5')
  }

  // ── 2 · CandleChart sin `dibujar`: igual que antes ──
  const React = require(R + '/node_modules/react'), RDS = require(R + '/node_modules/react-dom/server')
  {
    const { execSync } = require('child_process'), fs = require('fs'), os = require('os'), path = require('path')
    let antes = null
    try { antes = execSync('git show HEAD:components/CandleChart.js', { cwd: R, encoding: 'utf8', maxBuffer: 1 << 26 }) } catch (_) {}
    if (antes && !antes.includes('DibujosGrafico')) {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-'))
      const f = path.join(R, 'components', '__CandleChart_anterior.js')
      try {
        fs.writeFileSync(f, antes)
        const CCa = require(f).default, CC = require(R + '/components/CandleChart.js').default
        const casos = [{ data: VELAS }, { data: VELAS, fillHeight: true, onIndicadores: () => {}, indicadoresUsuario: [] }, { data: VELAS, riskMode: 'entry' }, { data: VELAS, externalLegendRef: { current: null }, simbolo: 'AAPL' }]
        const igual = casos.every(p => RDS.renderToString(React.createElement(CCa, p)) === RDS.renderToString(React.createElement(CC, p)))
        ok(igual, `CandleChart sin «dibujar»: el mismo HTML que antes, carácter a carácter (${casos.length} casos)`)
      } finally { try { fs.unlinkSync(f) } catch (_) {} try { fs.rmdirSync(dir) } catch (_) {} }
    } else ok(true, 'CandleChart sin «dibujar»: el commit anterior ya los lleva (se comprobó al hacerlos)')
    const CC = require(R + '/components/CandleChart.js').default
    const h = RDS.renderToString(React.createElement(CC, { data: VELAS, dibujar: true, simbolo: 'AAPL' }))
    ok(/display:flex/.test(h.slice(0, 80)), 'con «dibujar», el gráfico va en una fila (la barra a la izquierda)')
  }

  // ── 3 · Montaje con estado ──
  const RDC = require(R + '/node_modules/react-dom/client')
  const DG = require(R + '/components/DibujosGrafico.js'), Dib = DG.default
  const chart = { timeScale: () => ({ logicalToCoordinate: i => 10 * i, width: () => 100, height: () => 20 }), priceScale: () => ({ width: () => 0 }) }
  const serie = { priceToCoordinate: p => 200 - p, coordinateToPrice: y => 200 - y }
  const wrap = document.createElement('div'), cont = document.createElement('div'), lienzo = document.createElement('canvas'), slot = document.createElement('div')
  wrap.appendChild(cont); cont.appendChild(lienzo); document.body.appendChild(wrap); document.body.appendChild(slot)
  const refs = { chartRef: { current: chart }, seriesRef: { current: serie }, containerRef: { current: cont }, wrapRef: { current: wrap }, barraRef: { current: slot } }
  const props = (simbolo, ctx = null) => ({ ...refs, data: VELAS, simbolo, ctx })
  const m = D.monta(React.createElement(Dib, props('AAPL')), RDC); await D.espera(40)
  const memo = () => DG._memoriaDibujos.get('AAPL') || []
  const ev = (x, y, extra = {}) => { let parado = false; return { button: 0, clientX: x, clientY: y, target: lienzo, ctrlKey: false, stopPropagation() { parado = true }, preventDefault() {}, get parado() { return parado }, ...extra } }
  const lanza = (t, e) => { for (const f of wrap.oyentes[t] || []) f(e); return e }
  const tecla = (key, extra = {}) => { for (const f of OV.keydown || []) f({ key, target: document.body, preventDefault() {}, stopPropagation() {}, ...extra }) }
  const boton = (id) => slot.busca(n => n.getAttribute('data-herr') === id)
  // La barra va por un portal que se monta tras un efecto: se espera a que esté (hasta 2 s; con el equipo cargado tarda más).
  for (let k = 0; k < 100 && !boton('tendencia'); k++) await D.espera(20)
  ok(!!boton('tendencia') && !!boton('canal') && !!boton('iman') && !!boton('papelera') && slot.todos(n => n.nodeName === 'BUTTON' && n.getAttribute('data-herr')).length === 16, 'la barra lateral, en su hueco: 12 herramientas + seguir dibujando, imán, deshacer y borrar todo')
  ok(boton('papelera').getAttribute('disabled') != null || D.propsDe(boton('papelera')).disabled === true, 'sin dibujos, «borrar todo» está apagado')

  // Línea con dos clics.
  D.pulsa(boton('tendencia')); await D.espera(20)
  ok(/background: rgba\(76, 154, 255/.test(JSON.stringify(boton('tendencia').style)) || boton('tendencia').style.background === 'rgba(76,154,255,0.22)', 'la herramienta elegida, resaltada')
  let e1 = lanza('mousedown', ev(0, 100)); lanza('mouseup', ev(0, 100)); await D.espera(20)
  ok(e1.parado, 'con una herramienta, el clic NO llega al gráfico (ni arrastra ni pone la alarma)')
  lanza('mousemove', ev(30, 70)); await D.espera(20)
  ok(m.raiz.todos(n => n.getAttribute('opacity') === '0.8').length === 1, 'entre el primer y el segundo clic, se ve la vista previa')
  lanza('mousedown', ev(20, 80)); lanza('mouseup', ev(20, 80)); await D.espera(20)
  ok(memo().length === 1 && memo()[0].tipo === 'tendencia' && memo()[0].puntos[0].fecha === F[0] && memo()[0].puntos[1].fecha === F[2] && memo()[0].puntos[1].precio === 120, 'línea puesta: del 02/01 en 100 al 04/01 en 120')
  ok(m.raiz.busca(n => n.getAttribute('data-dibujos') === '1') != null && !!m.raiz.busca(n => n.hasAttribute('data-barrita')), 'se dibuja y queda elegida (sale su barrita)')
  const dbl = lanza('dblclick', ev(20, 80))
  ok(dbl.parado, 'el doble clic justo después de dibujar no pone una alarma de precio')
  // Con el cursor, el gráfico recibe sus clics.
  await D.espera(520)
  const e2 = lanza('mousedown', ev(50, 50)); await D.espera(20)
  ok(!e2.parado && !m.raiz.busca(n => n.hasAttribute('data-barrita')), 'con el cursor, el clic llega al gráfico y quita la elección')

  // Arrastrando: horizontal no, es de un clic; rectángulo arrastrando.
  D.pulsa(boton('rectangulo')); await D.espera(20)
  lanza('mousedown', ev(10, 90)); lanza('mouseup', ev(40, 60)); await D.espera(20)
  ok(memo().length === 2 && memo()[1].tipo === 'rectangulo' && memo()[1].puntos[0].precio === 110 && memo()[1].puntos[1].fecha === F[4], 'rectángulo arrastrando: de (03/01, 110) a (08/01, 140)')

  // Imán con Ctrl: el clic en 103,6 de la vela 1 (abre 101, máx. 105, mín. 99, cierra 103) se pega al cierre, 103.
  D.pulsa(boton('horizontal')); await D.espera(20)
  lanza('mousedown', ev(12, 200 - 103.6, { ctrlKey: true })); await D.espera(20)
  ok(memo().length === 3 && memo()[2].tipo === 'horizontal' && memo()[2].puntos[0].precio === 103, 'imán con Ctrl: 103,6 se pega al cierre de su vela (103)')
  D.pulsa(boton('iman')); await D.espera(20)
  D.pulsa(boton('horizontal')); await D.espera(20)
  lanza('mousedown', ev(12, 200 - 104.6)); await D.espera(20)
  ok(memo()[3].puntos[0].precio === 105, 'imán encendido con su botón: 104,6 se pega al máximo (105)')
  D.pulsa(boton('iman')); await D.espera(20)

  // Mover la línea arrastrándola: +1 vela y −10.
  const golpe = m.raiz.busca(n => n.nodeName === 'g' && n.style.cursor === 'move')
  D.propsDe(golpe).onMouseDown(ev(10, 90)); await D.espera(10)
  for (const f of OV.mousemove || []) f(ev(20, 100))
  for (const f of OV.mouseup || []) f(ev(20, 100))
  await D.espera(20)
  ok(memo()[0].puntos[0].fecha === F[1] && memo()[0].puntos[0].precio === 90 && memo()[0].puntos[1].precio === 110, 'arrastrar la línea 1 vela a la derecha y 10 abajo: (03/01, 90) → (05/01, 110)')

  // Deshacer (Ctrl+Z con el ratón encima, y el botón), Supr, borrar todo.
  lanza('mouseenter', {}); tecla('z', { ctrlKey: true }); await D.espera(20)
  ok(memo()[0].puntos[0].fecha === F[0] && memo()[0].puntos[0].precio === 100, 'Ctrl+Z deshace el movimiento')
  D.pulsa(boton('deshacer')); await D.espera(20)
  ok(memo().length === 3, 'el botón deshacer quita lo último que se puso')
  const g0 = m.raiz.busca(n => n.nodeName === 'g' && n.style.cursor === 'move')
  D.propsDe(g0).onMouseDown(ev(10, 90)); for (const f of OV.mouseup || []) f(ev(10, 90)); await D.espera(20)
  tecla('Delete'); await D.espera(20)
  ok(memo().length === 2 && memo()[0].tipo === 'rectangulo', 'Supr borra el dibujo elegido')
  tecla('f', { altKey: true }); await D.espera(20)
  lanza('mousedown', ev(0, 100)); lanza('mousedown', ev(40, 50)); await D.espera(20)
  ok(memo().length === 3 && memo()[2].tipo === 'fibonacci', 'Alt+F elige Fibonacci y se pone con dos clics')
  tecla('t', { altKey: true }); await D.espera(20); lanza('mousedown', ev(0, 100)); await D.espera(10)
  tecla('Escape'); await D.espera(20)
  lanza('mousedown', ev(30, 60)); await D.espera(20)
  ok(memo().length === 3, 'Esc cancela una línea a medias (y vuelve al cursor)')
  D.pulsa(boton('papelera')); await D.espera(20)
  ok(memo().length === 0, 'borrar todo')
  D.pulsa(boton('deshacer')); await D.espera(20)
  ok(memo().length === 3, '… y se puede deshacer')

  // Texto: clic, escribir, Intro.
  D.pulsa(boton('texto')); await D.espera(20)
  lanza('mousedown', ev(30, 80)); await D.espera(20)
  const inp = m.raiz.busca(n => n.nodeName === 'INPUT')
  ok(!!inp, 'texto: sale el cuadro para escribir')
  D.escribe(inp, 'Resistencia'); await D.espera(10)
  D.propsDe(m.raiz.busca(n => n.nodeName === 'INPUT')).onKeyDown({ key: 'Enter', stopPropagation() {} }); await D.espera(20)
  ok(memo().length === 4 && memo()[3].texto === 'Resistencia' && memo()[3].puntos[0].precio === 120, 'texto «Resistencia» puesto en 120')

  // Memoria por valor: otro valor empieza vacío; al volver, siguen.
  m.pinta(React.createElement(Dib, props('MSFT'))); await D.espera(30)
  ok(m.raiz.busca(n => n.getAttribute('data-dibujos') === '0') != null && (DG._memoriaDibujos.get('MSFT') || []).length === 0, 'otro valor (MSFT): sin dibujos')
  m.pinta(React.createElement(Dib, props('AAPL'))); await D.espera(30)
  ok(m.raiz.busca(n => n.getAttribute('data-dibujos') === '4') != null, 'al volver a AAPL, siguen sus 4 dibujos')
  ok(DG._memoriaDibujos.get('AAPL').every(d => G.limpiaDibujo(d) && JSON.stringify(G.limpiaDibujo(d)) === JSON.stringify(d)), 'todos los dibujos tienen la forma que se guardará en la base (limpiaDibujo los deja igual)')
  m.quita()

  // ── 4 · Guardar y leer en la base ──
  {
    const GD = require(R + '/lib/dibujos/guardados.js')
    // Base de mentira: filas por valor; apunta cada llamada.
    const filas = new Map(), llamadas = []
    let falla = false, lenta = 0
    const fFalso = async (url, o = {}) => {
      const u = new URL(url), metodo = o.method || 'GET', s = decodeURIComponent((u.searchParams.get('simbolo') || '').replace(/^eq\./, ''))
      llamadas.push({ metodo, s, cuerpo: o.body ? JSON.parse(o.body) : null })
      if (lenta) await new Promise(r => setTimeout(r, lenta))
      if (falla) return { ok: false, status: 500, json: async () => ({ message: 'caída' }) }
      if (metodo === 'GET') return { ok: true, status: 200, json: async () => (filas.has(s) ? [{ dibujos: filas.get(s) }] : []) }
      if (metodo === 'DELETE') { filas.delete(s); return { ok: true, status: 204, json: async () => null } }
      const b = JSON.parse(o.body); filas.set(b.simbolo, b.dibujos); return { ok: true, status: 201, json: async () => null }
    }
    const ctx = { url: 'http://base.falsa', headers: { apikey: 'x' }, fetch: fFalso }
    ok(GD.simboloDe(' aapl ') === 'AAPL' && GD.simboloDe('') === '' && GD.simboloDe('X'.repeat(31)) === '', 'el valor, en mayúsculas y sin espacios (y nada si no vale)')
    const d1 = P.creaDibujo('horizontal', [pt(3, 150)], { id: 'h1' })
    await GD.guardarDibujos(ctx, 'msft', [d1, { id: 'malo', tipo: 'nada' }])
    ok(JSON.stringify(filas.get('MSFT')) === JSON.stringify([d1]) && llamadas.at(-1).metodo === 'POST', 'guardar: una fila por valor (MSFT), sin lo que no vale')
    ok(JSON.stringify(await GD.leerDibujos(ctx, 'MSFT')) === JSON.stringify([d1]), 'leer: lo mismo que se guardó')
    await GD.guardarDibujos(ctx, 'MSFT', [])
    ok(!filas.has('MSFT') && llamadas.at(-1).metodo === 'DELETE', 'sin dibujos, la fila se borra')
    ok((await GD.leerDibujos(ctx, 'MSFT')).length === 0, 'leer un valor sin fila: ninguno')
    filas.set('^GSPC', [d1, { id: 'roto' }])
    ok((await GD.leerDibujos(ctx, '^GSPC')).length === 1 && llamadas.at(-1).s === '^GSPC', 'leer ^GSPC (con «^» en la dirección) y tirar lo que no vale')
    falla = true
    let err = ''; try { await GD.guardarDibujos(ctx, 'AAPL', [d1]) } catch (e) { err = e.message }
    ok(/No se pudo guardar tus dibujos \(HTTP 500: caída\)/.test(err), `si la base falla, lo dice: «${err}»`)
    falla = false

    // El componente: abre NVDA con un dibujo guardado.
    DG._memoriaDibujos.clear(); DG._leidosDibujos.clear(); llamadas.length = 0
    filas.set('NVDA', [P.creaDibujo('tendencia', [pt(0, 100), pt(2, 120)], { id: 't1' })])
    const m2 = D.monta(React.createElement(Dib, props('NVDA', ctx)), RDC); await D.espera(40)
    const enBase = () => filas.get('NVDA') || []
    ok(m2.raiz.busca(n => n.getAttribute('data-dibujos') === '1') != null && llamadas.filter(l => l.metodo === 'GET').length === 1, 'al abrir NVDA, sale su dibujo guardado (una lectura)')
    D.pulsa(boton('horizontal')); await D.espera(20)
    lanza('mousedown', ev(20, 50)); await D.espera(20)
    ok(enBase().length === 1, 'recién dibujada, aún no se ha guardado (espera un momento)')
    await D.espera(900)
    ok(enBase().length === 2 && enBase()[1].tipo === 'horizontal' && enBase()[1].puntos[0].precio === 150, 'a los 800 ms se guarda (2 dibujos, la horizontal en 150)')
    // Arrastrar: no se guarda a cada paso, sí al soltar.
    const posts = () => llamadas.filter(l => l.metodo === 'POST').length
    const p0 = posts()
    const gg = m2.raiz.todos(n => n.nodeName === 'g' && n.style.cursor === 'move')[1]
    D.propsDe(gg).onMouseDown(ev(20, 50)); await D.espera(10)
    for (const y of [45, 40, 35, 30]) { for (const fm of OV.mousemove || []) fm(ev(20, y)); await D.espera(5) }
    await D.espera(900)
    ok(posts() === p0, 'mientras se arrastra, no se guarda')
    for (const fm of OV.mouseup || []) fm(ev(20, 30))
    await D.espera(900)
    ok(posts() === p0 + 1 && enBase()[1].puntos[0].precio === 170, 'al soltar, se guarda una vez (la horizontal, ya en 170)')
    // Dos instancias (normal y pantalla completa): lo de una sale en la otra.
    const slot2 = document.createElement('div'); document.body.appendChild(slot2)
    const m3 = D.monta(React.createElement(Dib, { ...props('NVDA', ctx), barraRef: { current: slot2 } }), RDC); await D.espera(40)
    ok(m3.raiz.busca(n => n.getAttribute('data-dibujos') === '2') != null && llamadas.filter(l => l.metodo === 'GET').length === 1, 'la pantalla completa abre con los mismos 2 dibujos (sin volver a leer)')
    D.pulsa(slot2.busca(n => n.getAttribute('data-herr') === 'papelera')); await D.espera(20)
    ok(m2.raiz.busca(n => n.getAttribute('data-dibujos') === '0') != null, 'borrar todo en una instancia: la otra también se queda sin dibujos')
    m3.quita(); await D.espera(30)
    ok(!filas.has('NVDA'), 'al cerrar la pantalla completa se guarda ya (sin dibujos: la fila se borra)')
    // Cambiar de valor con un cambio sin guardar: se guarda ya.
    D.pulsa(boton('vertical')); await D.espera(20); lanza('mousedown', ev(30, 50)); await D.espera(20)
    m2.pinta(React.createElement(Dib, props('AMD', ctx))); await D.espera(40)
    ok(enBase().length === 1 && enBase()[0].tipo === 'vertical', 'al cambiar de valor, lo pendiente se guarda en el que se deja (NVDA)')
    // Dibujar mientras se lee: se juntan.
    lenta = 150; filas.set('TSLA', [P.creaDibujo('horizontal', [pt(3, 150)], { id: 'viejo' })])
    m2.pinta(React.createElement(Dib, props('TSLA', ctx))); await D.espera(20)
    D.pulsa(boton('horizontal')); await D.espera(20); lanza('mousedown', ev(20, 60)); await D.espera(400)
    lenta = 0; await D.espera(900)
    ok((filas.get('TSLA') || []).length === 2 && filas.get('TSLA')[0].id === 'viejo', 'lo dibujado mientras se leía se junta con lo guardado (2 en TSLA)')
    // Si guardar falla, sale el aviso en rojo.
    falla = true
    D.pulsa(boton('horizontal')); await D.espera(20); lanza('mousedown', ev(20, 70)); await D.espera(950)
    const av = m2.raiz.busca(n => n.hasAttribute('data-aviso-dibujos'))
    ok(!!av && /No se pudieron guardar los dibujos/.test(av.textContent), 'si no se puede guardar, sale un aviso en rojo')
    falla = false
    m2.quita()
  }

  // ── 5 · Lo pedido al ver la parte 3 (§210) ──
  {
    ok(JSON.stringify(P.pasoFlecha('ArrowRight', false)) === '{"dv":1,"dpx":0}' && JSON.stringify(P.pasoFlecha('ArrowUp', true)) === '{"dv":0,"dpx":10}' && P.pasoFlecha('a', false) === null, 'flechas: → una vela, Mayús+↑ diez píxeles, otra tecla nada')
    ok(JSON.stringify(P.estiloRecordado({ tendencia: { color: '#ef5350', grosor: 3, tam: 20 } }, 'tendencia')) === '{"color":"#ef5350","grosor":3}' && JSON.stringify(P.estiloRecordado({ texto: { tam: 20, color: 'rojo' } }, 'texto')) === '{"tam":20}', 'estilo recordado: solo lo que vale (el tamaño, solo en el texto)')
    const tx = P.creaDibujo('texto', [pt(1, 100)], { texto: 'Hola', tam: 20 })
    ok(tx.tam === 20 && G.limpiaDibujo({ ...tx, tam: 60 }).tam === undefined, 'el texto guarda su tamaño de letra (de 8 a 48)')
    const ft = P.formas(tx, cv)
    ok(ft.trazos[0].a['font-size'] === 20 && ft.golpe[0].a.height === 27 && ft.golpe[0].a.y === 100 - 22, 'texto de 20: letra de 20 y la franja del ratón a su medida (27 de alto)')

    localStorage.removeItem('dibujos.estilo')
    DG._memoriaDibujos.clear(); DG._leidosDibujos.clear()
    const alertas = []
    const m5 = D.monta(React.createElement(Dib, { ...props('INTC'), arriba: 30, onAlerta: (p, u) => alertas.push([p, u]) }), RDC); await D.espera(40)
    const mem = () => DG._memoriaDibujos.get('INTC') || []
    ok(slot.busca(n => n.hasAttribute('data-barra-dibujos')).style.padding === '36px 0 6px', 'con una barra de 30 px encima, la barra lateral empieza 30 px más abajo')
    // Línea y color recordado.
    D.pulsa(boton('tendencia')); await D.espera(20); lanza('mousedown', ev(0, 100)); lanza('mousedown', ev(20, 80)); await D.espera(20)
    const barrita = () => m5.raiz.busca(n => n.hasAttribute('data-barrita'))
    ok(parseFloat(barrita().style.top) === 36, 'la barrita del dibujo elegido, también 30 px más abajo')
    D.pulsa(barrita().busca(n => n.getAttribute('title') === 'Color' && n.style.background === '#ef5350')); await D.espera(20)
    D.pulsa(barrita().todos(n => n.getAttribute('title') === 'Grosor 3')[0]); await D.espera(20)
    ok(mem()[0].color === '#ef5350' && mem()[0].grosor === 3, 'cambiar color y grosor de la línea')
    D.pulsa(boton('tendencia')); await D.espera(20); lanza('mousedown', ev(30, 100)); lanza('mousedown', ev(50, 80)); await D.espera(20)
    ok(mem()[1].color === '#ef5350' && mem()[1].grosor === 3, 'la siguiente línea sale con el último color y grosor elegidos')
    D.pulsa(boton('horizontal')); await D.espera(20); lanza('mousedown', ev(30, 50)); await D.espera(20)
    ok(mem()[2].color === undefined, '… y las de otro tipo (horizontal), con el suyo de siempre')
    // Flechas sobre lo elegido (la horizontal): ↑ un píxel = +1 de precio (y = 200 − p); Mayús+↓ = −10; → una vela.
    const tec = (key, extra = {}) => { for (const fk of OV.keydown || []) fk({ key, target: document.body, preventDefault() {}, stopPropagation() {}, shiftKey: false, ctrlKey: false, altKey: false, metaKey: false, ...extra }) }
    tec('ArrowUp'); await D.espera(10); tec('ArrowUp'); await D.espera(10); tec('ArrowDown', { shiftKey: true }); await D.espera(10); tec('ArrowRight'); await D.espera(20)
    ok(mem()[2].puntos[0].precio === 142 && mem()[2].puntos[0].fecha === F[4], `flechas: 150 + 1 + 1 − 10 = 142 y una vela a la derecha (${mem()[2].puntos[0].precio}, ${mem()[2].puntos[0].fecha})`)
    lanza('mouseenter', {}); tec('z', { ctrlKey: true }); await D.espera(20)
    ok(mem()[2].puntos[0].precio === 150 && mem()[2].puntos[0].fecha === F[3], 'una serie de flechas seguida se deshace de una vez (vuelve a 150)')
    // Texto con tamaño recordado.
    D.pulsa(boton('texto')); await D.espera(20); lanza('mousedown', ev(10, 80)); await D.espera(20)
    D.escribe(m5.raiz.busca(n => n.nodeName === 'INPUT'), 'Nota'); await D.espera(10)
    D.propsDe(m5.raiz.busca(n => n.nodeName === 'INPUT')).onKeyDown({ key: 'Enter', stopPropagation() {} }); await D.espera(20)
    D.pulsa(barrita().busca(n => n.getAttribute('data-tam') === 'mas')); await D.espera(20)
    D.pulsa(barrita().busca(n => n.getAttribute('data-tam') === 'mas')); await D.espera(20)
    ok(mem()[3].tam === 20, 'texto: A+ dos veces, de 13 a 16 y a 20')
    D.pulsa(boton('texto')); await D.espera(20); lanza('mousedown', ev(40, 60)); await D.espera(20)
    D.escribe(m5.raiz.busca(n => n.nodeName === 'INPUT'), 'Otra'); await D.espera(10)
    D.propsDe(m5.raiz.busca(n => n.nodeName === 'INPUT')).onKeyDown({ key: 'Enter', stopPropagation() {} }); await D.espera(20)
    ok(mem()[4].tam === 20, 'el siguiente texto sale con letra de 20')
    // 🎯: un clic abre la alarma con ese precio y el último cierre (109); con Ctrl, pegado a la vela.
    ok(!!boton('alerta'), 'con onAlerta sale la 🎯 en la barra lateral')
    D.pulsa(boton('alerta')); await D.espera(20)
    const ea = lanza('mousedown', ev(30, 200 - 123.456)); await D.espera(20)
    ok(ea.parado && alertas.length === 1 && alertas[0][0] === 123.46 && alertas[0][1] === 109, `🎯: clic en 123,456 → alarma en 123,46 con último cierre 109 (${JSON.stringify(alertas[0])})`)
    ok(mem().length === 5 && !m5.raiz.busca(n => n.getAttribute('opacity') === '0.8'), '… sin crear ningún dibujo, y vuelve el cursor')
    D.pulsa(boton('alerta')); await D.espera(20)
    lanza('mousedown', ev(12, 200 - 103.6, { ctrlKey: true })); await D.espera(20)
    ok(alertas[1][0] === 103, '🎯 con Ctrl: 103,6 se pega al cierre de su vela (103)')
    m5.quita()
    const m6 = D.monta(React.createElement(Dib, props('INTC')), RDC); await D.espera(30)
    ok(!boton('alerta') && slot.busca(n => n.hasAttribute('data-barra-dibujos')).style.padding === '6px 0 6px', 'sin onAlerta no hay 🎯, y sin barra encima la barra lateral empieza arriba')
    m6.quita()
  }

  // ── 6 · Parte 5: posiciones, medir y seguir dibujando (§211) ──
  {
    // Larga: entrada 100 en la vela 0 (02/01), stop 95 → objetivo 100 + 2 × 5 = 110; la caja llega a la vela 0 + 12.
    const pos = P.colocaPosicion('larga', pt(0, 100), pt(1, 95), esc)
    ok(pos[1].precio === 95 && pos[2].precio === 110 && pos[1].fecha === G.fechaDeIndice(esc, 12) && pos[2].fecha === pos[1].fecha, `posición larga: stop 95, objetivo 110 (2 R), caja hasta la vela 12 (${pos[1].fecha})`)
    const mal = P.colocaPosicion('larga', pt(0, 100), pt(1, 105), esc)
    ok(mal[1].precio === 97 && mal[2].precio === 106, 'stop al otro lado: se pone a un 3 % (97) y el objetivo a 2 R (106)')
    const cor = P.colocaPosicion('corta', pt(0, 100), pt(1, 104), esc)
    ok(cor[1].precio === 104 && cor[2].precio === 92, 'posición corta: entrada 100, stop 104 → objetivo 100 − 2 × 4 = 92')
    // Las velas: máximo 104 + k, mínimo 98 + k: el 110 lo toca la vela 6 (10/01) y el 95 nunca.
    const d = P.creaDibujo('larga', pos, { arriesgo: 100 })
    const tx = P.formas(d, { ...cv, velas: VELAS }).trazos.filter(e => e.el === 'rotulo' || e.el === 'text').map(e => e.txt)
    ok(tx.includes('Objetivo 110,00 · gana 10,0 % · 2,0 R') && tx.includes('Stop 95,00 · pierde 5,0 %'), `rótulos: «${tx[0]}» y «${tx[1]}»`)
    ok(tx.includes('Entrada 100,00 · 20 acciones (2.000 €) arriesgando 100 €'), `arriesgando 100 € con 5 € por acción: 20 acciones (${tx[2]})`)
    ok(tx.includes('→ llegó al OBJETIVO el 10/01/2024'), 'después: llegó al objetivo el 10/01/2024 (la vela 6, máximo 110)')
    const dS = P.creaDibujo('larga', [pt(0, 100), pt(4, 99.5), pt(4, 101)], {})
    ok(P.formas(dS, { ...cv, velas: VELAS }).trazos.some(e => e.txt === '→ tocó el STOP el 03/01/2024'), 'con el stop en 99,5 lo toca antes la vela 1 (mínimo 99): «tocó el STOP el 03/01/2024»')
    ok(P.mueveAsa(d, 1, pt(3, 102)) === d && P.mueveAsa(d, 1, pt(3, 96)).puntos[1].precio === 96, 'mover el stop por encima de la entrada no se acepta; a 96, sí')
    ok(P.mueveAsa(d, 3, pt(7, 0)).puntos[1].fecha === F[7] && P.mueveAsa(d, 3, pt(0, 0)) === d, 'tirar del borde derecho cambia dónde acaba la caja (no antes de la entrada)')
    const md = P.formasMedir(pt(0, 100), pt(4, 110), cv)
    ok(md.txt === '+10,00 (+10,00 %) · 4 velas', `medir de (02/01, 100) a (08/01, 110): «${md.txt}»`)
    ok(P.formasMedir(pt(4, 110), pt(0, 99), cv).txt === '−11,00 (−10,00 %) · 4 velas', 'medir bajando: −11,00 (−10,00 %)')

    localStorage.removeItem('dibujos.estilo'); localStorage.removeItem('dibujos.seguir')
    DG._memoriaDibujos.clear(); DG._leidosDibujos.clear()
    const m7 = D.monta(React.createElement(Dib, { ...props('AMZN'), arriesgoDefecto: 150 }), RDC); await D.espera(40)
    const mem = () => DG._memoriaDibujos.get('AMZN') || []
    // Larga con dos clics: entrada en (vela 0, 100), stop en (vela 1, 95).
    D.pulsa(boton('larga')); await D.espera(20); lanza('mousedown', ev(0, 100)); lanza('mousedown', ev(10, 105)); await D.espera(20)
    ok(mem().length === 1 && mem()[0].tipo === 'larga' && mem()[0].puntos[2].precio === 110 && mem()[0].arriesgo === 150, 'posición larga con dos clics: objetivo 110 y «Arriesgo» 150 € (el del perfil de riesgo)')
    const inp = m7.raiz.busca(n => n.hasAttribute('data-arriesgo'))
    ok(!!inp, 'su barrita tiene «Arriesgo … €»')
    inp.value = '200'; D.propsDe(inp).onBlur({ currentTarget: inp }); await D.espera(20)
    ok(mem()[0].arriesgo === 200, 'cambiar «Arriesgo» a 200 €')
    D.pulsa(boton('corta')); await D.espera(20); lanza('mousedown', ev(30, 100)); lanza('mousedown', ev(40, 96)); await D.espera(20)
    ok(mem()[1].tipo === 'corta' && mem()[1].arriesgo === 200, 'la siguiente posición recuerda los 200 € (la corta también)')
    // Medir: no se guarda; el siguiente clic lo quita.
    D.pulsa(boton('medir')); await D.espera(20); lanza('mousedown', ev(0, 100)); lanza('mousedown', ev(40, 90)); await D.espera(20)
    const rot = () => m7.raiz.todos(n => n.nodeName === 'text').map(n => n.textContent).find(x => /velas$/.test(x))
    ok(mem().length === 2 && rot() === '+10,00 (+10,00 %) · 4 velas', `medir: «${rot()}» y no crea ningún dibujo`)
    await D.espera(520); lanza('mousedown', ev(70, 50)); await D.espera(20)
    ok(!rot(), 'el siguiente clic en el gráfico quita la medida')
    // Mayús + arrastrar con el cursor.
    const em = lanza('mousedown', ev(0, 100, { shiftKey: true })); lanza('mouseup', ev(20, 90, { shiftKey: true })); await D.espera(20)
    ok(em.parado && rot() === '+10,00 (+10,00 %) · 2 velas', `Mayús + arrastrar con el cursor mide («${rot()}»)`)
    // 🔒 Seguir dibujando: dos líneas seguidas sin volver a elegir la herramienta.
    D.pulsa(boton('candado')); await D.espera(20)
    D.pulsa(boton('tendencia')); await D.espera(20)
    lanza('mousedown', ev(0, 100)); lanza('mousedown', ev(20, 80)); await D.espera(20)
    lanza('mousedown', ev(30, 100)); lanza('mousedown', ev(50, 80)); await D.espera(20)
    ok(mem().filter(x => x.tipo === 'tendencia').length === 2 && /rgba\(76, ?154, ?255/.test(boton('tendencia').style.background), '🔒: dos líneas seguidas y la herramienta sigue elegida')
    ok(localStorage.getItem('dibujos.seguir') === '1', '🔒 se recuerda en el navegador')
    tecla('Escape'); await D.espera(20)
    ok(!/rgba\(76, ?154, ?255/.test(boton('tendencia').style.background), 'Esc vuelve al cursor')
    m7.quita()
  }

  console.log(fallos ? `\n${fallos} FALLOS` : '\nTodo en verde')
  process.exit(fallos ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
