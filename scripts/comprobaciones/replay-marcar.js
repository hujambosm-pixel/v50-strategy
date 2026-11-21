// scripts/comprobaciones/replay-marcar.js — MARCAR LA ORDEN EN EL GRÁFICO del Replay (lib/replay/borrador.js, components/PanelReplay.js;
// docs/builder.md §229). Las corre comunes.sh. Termina en 0 si todo da lo esperado. Cuentas a mano con las velas de replay-operar.js
// (10.000 €, 1 € por orden).
process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://arnes.invalid'; process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'clave-falsa-del-arnes'
const C0 = require('./cargador'), R = C0.RAIZ, D = require('./domFalso')
let fallos = 0
const ok = (c, t) => { console.log(`${c ? 'OK  ' : 'MAL '} ${t}`); if (!c) fallos++ }
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const D6 = ['2024-01-02', '2024-01-03', '2024-01-04', '2024-01-05', '2024-01-08', '2024-01-09']
const v = (date, open, high, low, close) => ({ date, open, high, low, close })
const VELAS = { A: [v(D6[0], 100, 102, 99, 100), v(D6[1], 101, 105, 100, 104), v(D6[2], 104, 106, 98, 99), v(D6[3], 97, 99, 95, 96), v(D6[4], 96, 110, 96, 108), v(D6[5], 109, 112, 107, 111)] }

;(async () => {
  D.pon()
  await C0.prepara(); C0.registra(R)
  const B = require(R + '/lib/replay/borrador.js'), M = require(R + '/lib/replay/motor.js')

  // ── Tres clics seguidos: Entrada → Stop → Objetivo ──
  let c = B.empiezaMarca({ ...B.FORM_INICIAL, entrada: '50', stop: '40' })
  ok(c.captura === 'entrada' && c.f.entrada === '' && c.f.stop === '' && c.f.mercado === false, '🎯 borra el borrador anterior y empieza por la Entrada')
  c = B.conClic(c.f, c.captura, 103.456, 100)
  ok(c.f.entrada === '103,46' && c.captura === 'stop', '1.er clic: Entrada 103,46 (redondeada a 2 decimales) y sigue con el Stop')
  c = B.conClic(c.f, c.captura, 99.5, 100)
  ok(c.f.stop === '99,5' && c.f.lado === 1 && c.captura === 'objetivo', '2.º clic: Stop 99,5 por debajo → compra; sigue con el Objetivo')
  c = B.conClic(c.f, c.captura, 110, 100)
  ok(c.f.objetivo === '110' && c.captura === null, '3.er clic: Objetivo 110 y se acaba el marcado')
  const corto = B.conClic({ ...B.FORM_INICIAL, mercado: false, entrada: '103' }, 'stop', 106, 100).f
  ok(corto.lado === -1, 'stop 106 por encima de una entrada 103 → corto')
  ok(B.dobleClic(B.FORM_INICIAL, 0.12345).f.entrada === '0,1235' && B.dobleClic(B.FORM_INICIAL, 98.7).captura === 'stop', 'doble clic: Entrada ahí (4 decimales si vale menos de 1) y sigue con el Stop')
  ok(!B.hayBorrador(B.FORM_INICIAL) && B.hayBorrador({ ...B.FORM_INICIAL, stop: '90' }) && !B.hayBorrador({ ...B.FORM_INICIAL, entrada: '99' }), 'borrador = algún precio puesto (a mercado, la casilla de entrada no cuenta)')

  // ── Lo que dice el panel: acciones, riesgo y R:R ── entrada 100, stop 97, objetivo 106, 10.000 €.
  const F = { ...B.FORM_INICIAL, mercado: false, entrada: '100', stop: '97', objetivo: '106' }
  ok(igual(B.estima(F, 10000, 100), { acciones: 20, coste: 2000, arriesgas: 60, rr: 2 }), 'invertir 20 %: 2.000 € ÷ 100 = 20 acciones, arriesgas 20 × 3 = 60 €, R:R 6 ÷ 3 = 2')
  ok(igual(B.estima({ ...F, modo: 'arriesgar', pct: 1 }, 10000, 100), { acciones: 33, coste: 3300, arriesgas: 99, rr: 2 }), 'arriesgar 1 %: 100 € ÷ 3 = 33,3 → 33 acciones (3.300 €), arriesgas 99 €')

  // ── Las líneas del gráfico ──
  const vacio = { posiciones: {}, ordenesVivas: [] }
  const L = B.lineasDe(vacio, 'A', F, 100)
  ok(igual(L.map(l => [l.id, l.texto]), [['bor:entrada', 'SIN ENVIAR · Entrada ⇕'], ['bor:stop', 'Stop −3,0 % ⇕'], ['bor:objetivo', 'Objetivo +6,0 % ⇕']]) && L.every(l => l.arrastrable),
    `borrador: tres líneas arrastrables, «SIN ENVIAR» en la primera, % frente a la entrada (${JSON.stringify(L.map(l => l.texto))})`)
  ok(B.lineasDe(vacio, 'A', { ...B.FORM_INICIAL, stop: '97' }, 100)[0].texto === 'SIN ENVIAR · Stop −3,0 % ⇕', 'a mercado solo con stop: el rótulo va en el stop y el % se mide con el precio de ahora')
  ok(B.lineasDe(vacio, 'A', F, 100, true).length === 0, 'terminada: sin borrador')

  // ── Arrastrar el stop de la posición ── compra a mercado el d1 (invertir 50 %, stop 98): entra el 03/01 a 101 con 49 acciones.
  const base = { version: 1, valores: ['A'], desde: D6[0], hoy: D6[1], capitalInicial: 10000, comision: 1, ejecucion: 'apertura', retrocesos: 0,
    acciones: [{ fecha: D6[0], simbolo: 'A', tipo: 'orden', id: 1, lado: 1, entrada: null, stop: 98, objetivo: null, tam: { modo: 'invertir', pct: 50 } }] }
  const r1 = M.calcula(base, VELAS)
  const lp = B.lineasDe(r1, 'A', B.FORM_INICIAL, 104)
  ok(igual(lp.map(l => [l.id, l.texto, l.arrastrable]), [['pos:A:medio', '#1 Largo 49', false], ['pos:A:stop', '#1 Stop −3,0 % ⇕', true]]), `posición: precio medio (fijo) y stop 98 (−3,0 % frente a 101) arrastrable (${JSON.stringify(lp.map(l => l.texto))})`)
  ok(/por debajo del precio de ahora/.test(B.accionMover(base, r1, 'pos:A:stop', 105, 104).error), 'stop de la compra a 105 con el precio a 104: no se mueve, aviso')
  const mv = B.accionMover(base, r1, 'pos:A:stop', 102.004, 104)
  ok(igual(mv.accion, { fecha: D6[1], simbolo: 'A', tipo: 'mover', stop: 102 }), 'stop a 102: acción «mover» con la fecha de hoy')
  // El 04/01 el mínimo (98) toca 102 → vende a 102: (102 − 101) × 49 − 1 − 1 = 47 €. Sin moverlo vendía a 98 (−149 €).
  const r2 = M.calcula({ ...base, hoy: D6[5], acciones: [...base.acciones, mv.accion] }, VELAS)
  ok(r2.operaciones.length === 1 && r2.operaciones[0].precioSalida === 102 && Math.abs(r2.operaciones[0].resultado - 47) < 1e-9 && r2.operaciones[0].fechaSalida === D6[2],
    `con el stop movido a 102: sale el 04/01 a 102 y gana 47 € (${r2.operaciones.map(o => o.precioSalida + ' ' + o.resultado)})`)

  // ── Arrastrar la entrada de una orden viva ── compra límite a 90 el d1; el 04/01 (precio 99) se sube a 97.
  const viva = { ...base, hoy: D6[2], acciones: [{ fecha: D6[0], simbolo: 'A', tipo: 'orden', id: 7, lado: 1, entrada: 90, clase: 'limite', stop: 85, objetivo: null, tam: { modo: 'invertir', pct: 20 } }] }
  const r3 = M.calcula(viva, VELAS)
  ok(igual(B.lineasDe(r3, 'A', B.FORM_INICIAL, 99).map(l => [l.id, l.texto]), [['viva:7:entrada', 'Compra límite ⇕'], ['viva:7:stop', 'Stop (compra límite) ⇕']]), 'orden viva: su entrada y su stop, arrastrables')
  const mv2 = B.accionMover(viva, r3, 'viva:7:entrada', 97, 99)
  ok(igual(mv2.accion, { fecha: D6[2], simbolo: 'A', tipo: 'mover', id: 7, entrada: 97, clase: 'limite' }) && B.accionMover(viva, r3, 'viva:7:entrada', 100, 99).accion.clase === 'stop',
    'entrada a 97 (por debajo de 99): sigue siendo límite; a 100 pasaría a stop')
  ok(/otro lado de su stop/.test(B.accionMover(viva, r3, 'viva:7:entrada', 84, 99).error), 'la entrada no puede pasar por debajo de su stop (85)')
  // El 05/01 el mínimo (95) llega a 97 y abre a 97 → compra a 97: 2.000 € ÷ 97 = 20,6 → 20 acciones.
  const r4 = M.calcula({ ...viva, hoy: D6[3], acciones: [...viva.acciones, mv2.accion] }, VELAS)
  ok(r4.posiciones.A && r4.posiciones.A.precioMedio === 97 && r4.posiciones.A.acciones === 20 && r4.posiciones.A.fecha === D6[3], `la orden movida se cumple el 05/01 a 97 con 20 acciones (${JSON.stringify(r4.posiciones.A)})`)

  // ── Dos «mover» del mismo día se juntan ──
  const a1 = B.anade([], { fecha: D6[1], simbolo: 'A', tipo: 'mover', stop: 100 })
  const a2 = B.anade(a1, { fecha: D6[1], simbolo: 'A', tipo: 'mover', objetivo: 110 })
  const a3 = B.anade(a2, { fecha: D6[1], simbolo: 'A', tipo: 'mover', stop: 101 })
  ok(igual(a3, [{ fecha: D6[1], simbolo: 'A', tipo: 'mover', stop: 101, objetivo: 110 }]), 'arrastrar varias veces el mismo día deja un solo «mover» con lo último')
  ok(B.anade(a3, { fecha: D6[1], simbolo: 'A', tipo: 'mover', id: 7, entrada: 97 }).length === 2, 'otra cosa (una orden viva): acción aparte')

  // ── El panel con el formulario de fuera ──
  const React = require(R + '/node_modules/react'), RDC = require(R + '/node_modules/react-dom/client')
  const P = require(R + '/components/PanelReplay.js')
  const est0 = { ...base, acciones: [], hoy: D6[0] }, r0 = M.calcula(est0, VELAS), c0 = M.cifras(est0, VELAS, r0)
  let marcar = 0, cancela = 0, form = F
  const props = (o = {}) => ({ estado: est0, simbolo: 'A', r: r0, cif: c0, ahora: 100, onAccion() {}, onTerminar() {}, form, onForm: g => { form = typeof g === 'function' ? g(form) : g }, onMarcar: () => marcar++, onCancelaMarca: () => cancela++, ...o })
  let m = D.monta(React.createElement(P.PanelOperar, props()), RDC); await D.espera(20)
  const txt = (sel) => m.raiz.busca(n => n.hasAttribute(sel))?.textContent || ''
  ok(/SIN ENVIAR/.test(txt('data-sin-enviar')) && m.raiz.busca(n => n.hasAttribute('data-entrada')).value === '100', 'con borrador: «SIN ENVIAR» y la entrada marcada en su casilla')
  ok(/20 acciones/.test(txt('data-estima-replay')) && /arriesgas 60 €/.test(txt('data-estima-replay')) && /R:R 1 : 2,0/.test(txt('data-estima-replay')), `≈ 20 acciones · arriesgas 60 € · R:R 1 : 2,0 (${txt('data-estima-replay')})`)
  ok(/−3,0 %/.test(txt('data-nueva-orden')) && /6,0 %/.test(txt('data-nueva-orden')), 'el % del stop y del objetivo junto a sus casillas')
  D.pulsa(m.raiz.busca(n => n.hasAttribute('data-marcar-replay'))); await D.espera(10)
  ok(marcar === 1, '«🎯 Marcar en el gráfico» avisa a la página')
  D.pulsa(m.raiz.busca(n => n.hasAttribute('data-descartar-orden'))); await D.espera(10)
  ok(form.entrada === '' && form.stop === '' && form.objetivo === '' && cancela === 1, '«Descartar» borra los precios y el marcado')
  m.quita()
  m = D.monta(React.createElement(P.PanelOperar, props({ captura: 'stop' })), RDC); await D.espera(20)
  ok(/marcar el Stop/.test(txt('data-guia-marca')) && !m.raiz.busca(n => n.hasAttribute('data-marcar-replay')), 'marcando: «▶ Clic en el gráfico para marcar el Stop» en lugar del botón')
  m.quita()

  // ── Al avanzar con la orden sin enviar ──
  let enviada = null, sin = 0
  const pv = (f) => ({ estado: est0, simbolo: 'A', form: f, ahora: 100, onEnviar: a => { enviada = a }, onSinEnviar: () => sin++, onCancelar() {} })
  m = D.monta(React.createElement(P.VentanaSinEnviar, pv({ ...B.FORM_INICIAL, mercado: false, entrada: '', stop: '97' })), RDC); await D.espera(20)
  D.pulsa(m.raiz.busca(n => n.hasAttribute('data-enviar-avanzar'))); await D.espera(10)
  ok(enviada === null && /entrada/.test(txt('data-error-sin-enviar')), 'sin entrada: «Enviarla y avanzar» no envía y dice qué falta')
  D.pulsa(m.raiz.busca(n => n.hasAttribute('data-avanzar-sin'))); await D.espera(10)
  ok(sin === 1, '«Avanzar sin enviarla»')
  m.quita()
  m = D.monta(React.createElement(P.VentanaSinEnviar, pv(F)), RDC); await D.espera(20)
  D.pulsa(m.raiz.busca(n => n.hasAttribute('data-enviar-avanzar'))); await D.espera(10)
  ok(igual(enviada, { fecha: D6[0], simbolo: 'A', tipo: 'orden', id: 1, lado: 1, entrada: 100, clase: 'stop', stop: 97, objetivo: 106, tam: { modo: 'invertir', pct: 20 } }),
    `completa: «Enviarla y avanzar» manda la orden (${JSON.stringify(enviada)})`)
  m.quita()

  console.log(fallos ? `\n${fallos} FALLOS` : '\nTodo en verde')
  process.exit(fallos ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
