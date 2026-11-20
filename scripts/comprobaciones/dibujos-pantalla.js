// scripts/comprobaciones/dibujos-pantalla.js — la PANTALLA de los dibujos sobre el gráfico (lib/dibujos/pantalla.js y
// components/DibujosGrafico.js, docs/builder.md §208). Las corre comunes.sh. Termina en 0 si todo da lo esperado.
// 1) Lo puro con un conversor inventado: la vela i en x = 10·i y el precio p en y = 200 − p (panel de 100 × 580). Cifras a mano.
// 2) CandleChart sin `dibujar`: el HTML, carácter a carácter el de antes (lo que había en el commit anterior, con git show).
// 3) El montaje con estado sobre un gráfico de mentira: elegir herramienta, clics, arrastrar, imán, deshacer, borrar, atajos, memoria por valor.
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
  const props = (simbolo) => ({ ...refs, data: VELAS, simbolo })
  const m = D.monta(React.createElement(Dib, props('AAPL')), RDC); await D.espera(40)
  const memo = () => DG._memoriaDibujos.get('AAPL') || []
  const ev = (x, y, extra = {}) => { let parado = false; return { button: 0, clientX: x, clientY: y, target: lienzo, ctrlKey: false, stopPropagation() { parado = true }, preventDefault() {}, get parado() { return parado }, ...extra } }
  const lanza = (t, e) => { for (const f of wrap.oyentes[t] || []) f(e); return e }
  const tecla = (key, extra = {}) => { for (const f of OV.keydown || []) f({ key, target: document.body, preventDefault() {}, stopPropagation() {}, ...extra }) }
  const boton = (id) => slot.busca(n => n.getAttribute('data-herr') === id)
  ok(!!boton('tendencia') && !!boton('canal') && !!boton('iman') && !!boton('papelera') && slot.todos(n => n.nodeName === 'BUTTON' && n.getAttribute('data-herr')).length === 12, 'la barra lateral, en su hueco: 9 herramientas + imán, deshacer y borrar todo')
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

  console.log(fallos ? `\n${fallos} FALLOS` : '\nTodo en verde')
  process.exit(fallos ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
