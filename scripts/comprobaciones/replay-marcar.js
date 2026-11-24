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
  ok(igual(B.lineasDe(r3, 'A', B.FORM_INICIAL, 99).map(l => [l.id, l.texto]), [['viva:7:entrada', 'Compra límite ⇕'], ['viva:7:stop', 'Stop −5,6 % ⇕']]), 'orden viva: su entrada y su stop (85 frente a 90: −5,6 %), arrastrables')
  const mv2 = B.accionMover(viva, r3, 'viva:7:entrada', 97, 99)
  ok(igual(mv2.accion, { fecha: D6[2], simbolo: 'A', tipo: 'mover', id: 7, entrada: 97, clase: 'limite' }) && B.accionMover(viva, r3, 'viva:7:entrada', 100, 99).accion.clase === 'stop',
    'entrada a 97 (por debajo de 99): sigue siendo límite; a 100 pasaría a stop')
  ok(/otro lado de su stop/.test(B.accionMover(viva, r3, 'viva:7:entrada', 84, 99).error), 'la entrada no puede pasar por debajo de su stop (85)')
  // El 05/01 el mínimo (95) llega a 97 y abre a 97 → compra a 97: 2.000 € ÷ 97 = 20,6 → 20 acciones.
  const r4 = M.calcula({ ...viva, hoy: D6[3], acciones: [...viva.acciones, mv2.accion] }, VELAS)
  ok(r4.posiciones.A && r4.posiciones.A.precioMedio === 97 && r4.posiciones.A.acciones === 20 && r4.posiciones.A.fecha === D6[3], `la orden movida se cumple el 05/01 a 97 con 20 acciones (${JSON.stringify(r4.posiciones.A)})`)

  ok(igual(B.accionMover(viva, r3, 'viva:7:stop', null, 99).accion, { fecha: D6[2], simbolo: 'A', tipo: 'mover', id: 7, stop: null }) && /no se puede quitar/.test(B.accionMover(viva, r3, 'viva:7:entrada', null, 99).error), 'casilla vacía: quita el stop; la entrada no se puede quitar')
  ok(/número/.test(B.accionMover(viva, r3, 'viva:7:stop', NaN, 99).error), 'un texto que no es un número: aviso')

  // ── Las casillas de la orden viva en el panel del gráfico (§250) ──
  {
    const React = require(R + '/node_modules/react'), RDC = require(R + '/node_modules/react-dom/client'), P = require(R + '/components/PanelReplay.js')
    const movidos = []
    let marcaLinea = null
    const pp = (arr) => ({ estado: viva, simbolo: 'A', r: r3, ahora: 99, total: 10000, form: B.FORM_INICIAL, onMarcar() {}, onMarcarLinea: id => { marcaLinea = id }, onAccion() {}, onMover: (id, p) => movidos.push([id, p]), arrastre: arr })
    let mm = D.monta(React.createElement(P.PanelGrafico, pp(null)), RDC); await D.espera(20)
    const cas = (id) => mm.raiz.busca(n => n.getAttribute('data-casilla-viva') === id)
    ok(cas('viva:7:entrada').value === '90' && cas('viva:7:stop').value === '85' && cas('viva:7:objetivo').value === '', 'la orden viva tiene sus casillas: entrada 90, stop 85, objetivo vacío')
    D.escribe(cas('viva:7:objetivo'), '104,5'); await D.espera(10)
    D.propsDe(cas('viva:7:objetivo')).onKeyDown({ key: 'Enter' }); await D.espera(10)
    ok(igual(movidos, [['viva:7:objetivo', 104.5]]), `escribir 104,5 en el objetivo y Enter: se lo pone a la orden (${JSON.stringify(movidos)})`)
    D.pulsa(mm.raiz.busca(n => n.getAttribute('data-marcar-linea') === 'viva:7:stop')); await D.espera(10)
    ok(marcaLinea === 'viva:7:stop', '§250: el 🎯 del stop pide marcar esa línea en el gráfico')
    D.pulsa(mm.raiz.busca(n => n.getAttribute('data-quitar-linea') === 'viva:7:stop')); await D.espera(10)
    ok(igual(movidos[1], ['viva:7:stop', null]), '§250: el ✕ del stop lo quita')
    mm.quita()
    mm = D.monta(React.createElement(P.PanelGrafico, pp({ id: 'viva:7:stop', precio: 87.25 })), RDC); await D.espera(20)
    ok(cas('viva:7:stop').value === '87,25', 'mientras se arrastra su línea, la casilla del stop va con ella (87,25)')
    mm.quita()
  }

  // ── Dos «mover» del mismo día se juntan ──
  const a1 = B.anade([], { fecha: D6[1], simbolo: 'A', tipo: 'mover', stop: 100 })
  const a2 = B.anade(a1, { fecha: D6[1], simbolo: 'A', tipo: 'mover', objetivo: 110 })
  const a3 = B.anade(a2, { fecha: D6[1], simbolo: 'A', tipo: 'mover', stop: 101 })
  ok(igual(a3, [{ fecha: D6[1], simbolo: 'A', tipo: 'mover', stop: 101, objetivo: 110 }]), 'arrastrar varias veces el mismo día deja un solo «mover» con lo último')
  ok(B.anade(a3, { fecha: D6[1], simbolo: 'A', tipo: 'mover', id: 7, entrada: 97 }).length === 2, 'otra cosa (una orden viva): acción aparte')

  // ── El panel del gráfico con el formulario de fuera (§250) ──
  const React = require(R + '/node_modules/react'), RDC = require(R + '/node_modules/react-dom/client')
  const P = require(R + '/components/PanelReplay.js')
  const est0 = { ...base, acciones: [], hoy: D6[0] }, r0 = M.calcula(est0, VELAS), c0 = M.cifras(est0, VELAS, r0)
  let marcar = 0, cancela = 0, form = F
  const props = (o = {}) => ({ estado: est0, simbolo: 'A', r: r0, ahora: 100, total: c0.final, onAccion() {}, form, onMarcar: (lado) => { marcar = lado }, onCancelaMarca: () => cancela++, ...o })
  let m = D.monta(React.createElement(P.PanelGrafico, props()), RDC); await D.espera(20)
  const txt = (sel) => m.raiz.busca(n => n.hasAttribute(sel))?.textContent || ''
  ok(!m.raiz.busca(n => n.hasAttribute('data-entrada')) && !m.raiz.busca(n => n.hasAttribute('data-enviar-orden')) && /🎯 Compra/.test(m.raiz.textContent), '§250: en un precio, solo 🎯 Compra / 🎯 Venta (sin casilla de entrada ni botones a mercado)')
  ok(!/doble clic en el gráfico|Orden en un precio/.test(m.raiz.textContent), '§234: sin textos fijos («o doble clic…», «Orden en un precio…»)')
  D.pulsa(m.raiz.busca(n => n.getAttribute('data-marcar-replay') === '-1')); await D.espera(10)
  ok(marcar === -1, '§234: «🎯 Venta» avisa a la página con el lado −1')
  m.quita()
  form = { ...B.FORM_INICIAL, mercado: false, entrada: '100', stop: '97' }
  m = D.monta(React.createElement(P.PanelGrafico, props({ captura: 'objetivo' })), RDC); await D.espera(20)
  // Entrada 100, stop 97, 20 % de 10.000 €: 2.000 / 100 = 20 acciones; arriesgas 20 × 3 = 60 €.
  ok(/20 acciones/.test(txt('data-estima-replay')) && /arriesgas 60 €/.test(txt('data-estima-replay')), `marcando (entrada 100, stop 97): ≈ 20 acciones · arriesgas 60 € (${txt('data-estima-replay')})`)
  ok(/marca el Objetivo/.test(txt('data-guia-marca')) && /Entrada 100 · Stop 97 \(−3,0 %\)/.test(txt('data-guia-marca')) && /Enter: ponerla sin objetivo/.test(txt('data-guia-marca')) && /MARCANDO/.test(txt('data-marcando')),
    `marcando: guía con lo marcado (Entrada 100 · Stop 97) y «Enter: ponerla sin objetivo» (${txt('data-guia-marca')})`)
  ok(!m.raiz.busca(n => n.hasAttribute('data-enviar-orden')) && !m.raiz.busca(n => n.hasAttribute('data-marcar-replay')), 'marcando: sin el botón de mercado ni el de 🎯')
  m.quita()

  // ── §250: los modos de la tarjeta ⚙ (stop: % / lo marco / sin stop; objetivo: R:R / lo marco / sin objetivo) ──
  {
    const marca = (o, clics) => { let c = B.empiezaMarca({ ...B.FORM_INICIAL, ...o }, 1); for (const p of clics) c = B.conClic(c.f, c.captura, p, 104); return c }
    let c5 = marca({ stopModo: 'no', tpModo: 'rr', rr: '2' }, [100])
    ok(c5.listo && c5.f.stop === '' && c5.f.objetivo === '', 'sin stop (y R:R): un clic en la entrada 100 y lista, sin stop ni objetivo (sin stop no hay R:R)')
    c5 = marca({ stopModo: 'pct', stopPct: '5', tpModo: 'no' }, [100])
    ok(c5.listo && c5.f.stop === '95' && c5.f.objetivo === '', 'stop a 5 % y sin objetivo: entrada 100 → stop 95, lista')
    c5 = marca({ stopModo: 'marco', stopPct: '10', tpModo: 'no' }, [100])
    ok(c5.captura === 'stop' && c5.f.stop === '', '«Lo marco yo» aunque haya un % guardado: tras la entrada, se marca el stop')
    c5 = marca({ stopModo: 'marco', tpModo: 'no' }, [100, 95])
    ok(c5.listo && c5.f.stop === '95' && c5.f.objetivo === '', 'lo marco yo y sin objetivo: entrada 100 y stop 95, lista')
    c5 = marca({ stopModo: 'pct', stopPct: '5', tpModo: 'marco', rr: '2' }, [100])
    ok(c5.captura === 'objetivo' && c5.f.stop === '95' && c5.f.objetivo === '', 'stop a 5 % y objetivo «Lo marco yo» (aunque haya R:R guardado): tras la entrada, se marca el objetivo')
    ok(B.modoStop({ stopPct: '' }) === 'marco' && B.modoStop({ stopPct: '7' }) === 'pct' && B.modoObjetivo({ rr: '2' }) === 'rr' && B.modoObjetivo({}) === 'marco', 'formularios de antes (sin modos): con un % es «pct», sin él «marco»; igual el R:R')
  }

  // ── §233: lo marcado ES la orden ──
  const cl = B.conClic({ ...B.FORM_INICIAL, mercado: false, entrada: '100', stop: '97' }, 'objetivo', 106, 100)
  ok(cl.listo === true && cl.captura === null, 'el clic del objetivo deja la orden lista para ponerse')
  ok(igual(B.ordenDeMarca(cl.f, 100).orden, { lado: 1, entrada: 100, clase: 'stop', stop: 97, objetivo: 106, tam: { modo: 'invertir', pct: 20 } }), 'la orden marcada: compra stop a 100, stop 97, objetivo 106')
  const sinObj = B.ordenDeMarca({ ...cl.f, objetivo: '95' }, 100)
  ok(sinObj.orden && sinObj.orden.objetivo === null && /sin objetivo/.test(sinObj.aviso), 'objetivo al otro lado: se pone sin objetivo y lo avisa')
  ok(B.ordenDeMarca({ ...B.FORM_INICIAL, entrada: '95', stop: '', objetivo: '' }, 100).orden.clase === 'limite', 'solo la entrada (Enter tras marcarla): compra límite a 95 sin stop ni objetivo')
  ok(B.lineasDe(vacio, 'A', { ...F }, 100, false, true)[0].texto === 'MARCANDO · Entrada ⇕', 'mientras se marca, la primera línea dice «MARCANDO»')

  // ── §234: botones con lado, «Stop a X %» y R:R ──
  let c4 = B.empiezaMarca({ ...B.FORM_INICIAL, stopPct: '10', rr: '2' }, 1)
  ok(c4.f.lado === 1 && c4.f.ladoFijo === true && c4.captura === 'entrada', '«🎯 Compra»: lado fijo de compra, marca la entrada')
  c4 = B.conClic(c4.f, c4.captura, 100, 104)
  ok(c4.listo === true && c4.f.stop === '90' && c4.f.objetivo === '120', `Stop a 10 % y R:R 1 : 2, entrada 100 → stop 90 y objetivo 120, en un clic (${c4.f.stop} / ${c4.f.objetivo})`)
  const v4 = B.conClic(B.empiezaMarca({ ...B.FORM_INICIAL, stopPct: '10', rr: '2' }, -1).f, 'entrada', 100, 96)
  ok(v4.listo && v4.f.lado === -1 && v4.f.stop === '110' && v4.f.objetivo === '80', 'en corto: entrada 100 → stop 110 y objetivo 80')
  let rq4 = B.conClic(B.empiezaMarca({ ...B.FORM_INICIAL, rr: '2' }, 1).f, 'entrada', 100, 104)
  ok(rq4.captura === 'stop' && rq4.f.stop === '', 'solo R:R: tras la entrada, se marca el stop')
  rq4 = B.conClic(rq4.f, rq4.captura, 95, 104)
  ok(rq4.listo && rq4.f.objetivo === '110', 'solo R:R 1 : 2: entrada 100 y stop 95 → objetivo 110')
  const s4 = B.conClic(B.empiezaMarca({ ...B.FORM_INICIAL, stopPct: '5' }, 1).f, 'entrada', 100, 104)
  ok(s4.captura === 'objetivo' && s4.f.stop === '95', 'solo Stop a 5 %: entrada 100 → stop 95 y se marca el objetivo')
  const l4 = B.conClic(B.empiezaMarca({ ...B.FORM_INICIAL }, 1).f, 'entrada', 100, 104)
  const l5 = B.conClic(l4.f, l4.captura, 103, 104)
  ok(l5.f.lado === 1 && l5.captura === 'objetivo', 'con «🎯 Compra», un stop por encima no lo convierte en corto (el lado lo dio el botón)')
  ok(B.ordenDeMarca({ ...l5.f, objetivo: '110' }, 104).error, '…y la orden no se pone: el stop de una compra va por debajo de la entrada')
  const m4 = B.mueveBorrador({ ...B.FORM_INICIAL, mercado: false, lado: 1, ladoFijo: true, entrada: '100', stop: '90', objetivo: '120', stopPct: '10', rr: '2' }, 'entrada', 110, 104)
  ok(m4.stop === '99' && m4.objetivo === '132', 'arrastrar la entrada a 110 con 10 % y 1 : 2: stop 99, objetivo 132')
  const m5 = B.mueveBorrador({ ...B.FORM_INICIAL, mercado: false, lado: 1, ladoFijo: true, entrada: '100', stop: '90', objetivo: '120', rr: '2' }, 'stop', 95, 104)
  ok(m5.objetivo === '110', 'arrastrar el stop a 95 con 1 : 2: objetivo 110')
  const d4 = B.deMercado({ ...B.FORM_INICIAL, stopPct: '10', rr: '1' }, -1, 50)
  ok(d4.lado === -1 && d4.mercado && d4.stop === '55' && d4.objetivo === '45', 'venta a mercado con el precio a 50, 10 % y 1 : 1: stop 55, objetivo 45')
  ok(B.deMercado({ ...B.FORM_INICIAL, stop: '48', stopPct: '10', rr: '2' }, 1, 50).stop === '48' && B.deMercado({ ...B.FORM_INICIAL, stop: '48', stopPct: '10', rr: '2' }, 1, 50).objetivo === '54', 'a mercado, un stop escrito a mano manda (48) y el objetivo sale de él (50 + 2 × 2 = 54)')
  const dd = B.dobleClic({ ...B.FORM_INICIAL, lado: -1, stopPct: '10', rr: '2' }, 100, 96)
  ok(dd.listo && dd.f.lado === -1 && dd.f.stop === '110', 'doble clic con 10 % y 1 : 2: la orden entera con el lado del último botón (corto)')

  // ── §236: las cajas del gráfico ──
  const rc = { operaciones: [{ num: 1, simbolo: 'A', lado: 1, fechaEntrada: D6[1], fechaSalida: D6[2], precioEntrada: 101, precioSalida: 98, stop: 98, objetivo: 110 }, { num: 2, simbolo: 'B', fechaEntrada: D6[1], fechaSalida: D6[2] }],
    posiciones: { A: { num: 3, lado: 1, acciones: 20, precioMedio: 100, fecha: D6[3], stop: 95, objetivo: 110 } },
    ordenesVivas: [{ id: 7, simbolo: 'A', fecha: D6[4], lado: 1, entrada: 120, clase: 'stop', stop: 114, objetivo: 132 }] }
  const cj = B.cajasDe(rc, 'A', { ...B.FORM_INICIAL, mercado: false, lado: -1, entrada: '100', stop: '105', objetivo: '' }, 104, D6[5], false, true)
  ok(igual(cj.map(c => [c.tipo, c.desde, c.hasta]), [['cerrada', D6[1], D6[2]], ['posicion', D6[3], null], ['viva', D6[4], null], ['borrador', D6[5], null]]),
    `cajas: la cerrada (de su entrada a su salida, solo de A), la posición y la orden viva hasta el hueco, y la que se marca desde hoy (${JSON.stringify(cj.map(c => c.tipo))})`)
  ok(cj[0].stop === 98 && cj[0].objetivo === 110 && igual(cj[0].textos, {}), 'la cerrada lleva su stop y su objetivo, sin textos')
  ok(cj[1].textos.stop === 'Stop −5,0 %' && cj[1].textos.objetivo === 'Objetivo +10,0 %' && cj[1].lineas.stop === 'pos:A:stop', 'posición a 100, stop 95 y objetivo 110: «Stop −5,0 %», «Objetivo +10,0 %», y sigue a su línea')
  ok(cj[2].textos.entrada === 'Compra stop · sin ejecutar' && cj[2].textos.stop === 'Stop −5,0 %' && cj[2].textos.objetivo === 'Objetivo +10,0 %', 'orden viva (compra stop a 120, stop 114, objetivo 132): «sin ejecutar», −5 % y +10 %')
  ok(cj[3].entrada === 100 && cj[3].stop === 105 && cj[3].objetivo === null && /MARCANDO/.test(cj[3].textos.entrada), 'la que se marca: corto a 100 con stop 105, sin objetivo todavía, «MARCANDO»')
  ok(B.cajasDe(rc, 'A', B.FORM_INICIAL, 104, D6[5], true).length === 3, 'terminada: sin la del borrador')
  // §238: una orden límite a 90 puesta el 02/01 y bajada a 89 el 04/01 (nunca se cumple): su caja empieza el 04/01, el día del cambio.
  const rm = M.calcula({ ...base, hoy: D6[5], acciones: [{ fecha: D6[0], simbolo: 'A', tipo: 'orden', id: 1, lado: 1, entrada: 90, clase: 'limite', stop: null, objetivo: null, tam: { modo: 'invertir', pct: 20 } }, { fecha: D6[2], simbolo: 'A', tipo: 'mover', id: 1, entrada: 89 }] }, VELAS)
  const cm = B.cajasDe(rm, 'A', B.FORM_INICIAL, 104, D6[5]).find(c => c.tipo === 'viva')
  ok(cm && cm.desde === D6[2] && cm.entrada === 89, `orden viva cambiada: su caja empieza el día del último cambio (${cm && cm.desde}), con la entrada de ahora (89)`)
  const rsc = M.calcula({ ...base, hoy: D6[5], acciones: [{ fecha: D6[0], simbolo: 'A', tipo: 'orden', id: 1, lado: 1, entrada: 90, clase: 'limite', stop: null, objetivo: null, tam: { modo: 'invertir', pct: 20 } }] }, VELAS)
  ok(B.cajasDe(rsc, 'A', B.FORM_INICIAL, 104, D6[5]).find(c => c.tipo === 'viva').desde === D6[0], 'sin cambios, desde el día en que se puso')
  const rr9 = M.calcula({ ...base, hoy: D6[5], acciones: [{ fecha: D6[0], simbolo: 'A', tipo: 'orden', id: 1, lado: 1, entrada: null, stop: 98, objetivo: 120, tam: { modo: 'invertir', pct: 50 } }] }, VELAS)
  ok(rr9.operaciones[0] && rr9.operaciones[0].stop === 98 && rr9.operaciones[0].objetivo === 120, 'el motor guarda en cada operación cerrada su stop y su objetivo')

  // ── §233: quitar una operación ── op 1 (orden 1, compra el 03/01 a 101, stop movido) y la orden 2 a mercado el 05/01 (entra el 08/01 a 96).
  const conDos = { ...base, hoy: D6[5], acciones: [
    { fecha: D6[0], simbolo: 'A', tipo: 'orden', id: 1, lado: 1, entrada: null, stop: 98, objetivo: null, tam: { modo: 'invertir', pct: 50 } },
    { fecha: D6[1], simbolo: 'A', tipo: 'mover', stop: 97.5 },
    { fecha: D6[3], simbolo: 'A', tipo: 'orden', id: 2, lado: 1, entrada: null, stop: null, objetivo: null, tam: { modo: 'invertir', pct: 20 } }] }
  const rd = M.calcula(conDos, VELAS)
  ok(rd.operaciones.length === 1 && igual(rd.operaciones[0].ids, [1]) && igual(rd.posiciones.A.ids, [2]), 'cada operación sabe qué órdenes la abrieron (ids)')
  const sin1 = B.quitaOperacion(conDos, rd.operaciones[0])
  const rs = M.calcula(sin1, VELAS)
  ok(igual(sin1.acciones.map(a => a.id ?? a.tipo), [2]) && sin1.borradas === 1, 'quitar la 1: se van su orden y su «mover»; queda la orden 2; «borradas» 1')
  // Sin la 1, el 08/01 hay 10.000 €: 2.000 € ÷ 96 = 20,8 → 20 acciones a 96.
  ok(rs.operaciones.length === 0 && rs.posiciones.A.acciones === 20 && rs.posiciones.A.precioMedio === 96, `recalculado: sin la operación 1, la 2 compra 20 a 96 (${JSON.stringify(rs.posiciones.A)})`)
  ok(B.quitaOperacion(conDos, { ids: [9], simbolo: 'A' }) === null, 'una operación sin su orden: no se toca nada')

  // ── La papelera del historial ──
  const quitadas = []
  m = D.monta(React.createElement(P.ResultadosReplay, { estado: conDos, r: rd, cif: M.cifras(conDos, VELAS, rd), velas: VELAS.A, simbolo: 'A', onQuitar: op => quitadas.push(op.ids) }), RDC); await D.espera(20)
  D.pulsa(m.raiz.busca(n => n.getAttribute('data-quitar-op') === '1')); await D.espera(10)
  ok(!quitadas.length && /¿Quitarla\?/.test(m.raiz.busca(n => n.hasAttribute('data-resultados-replay')).textContent), 'la papelera pregunta en la fila')
  D.pulsa(m.raiz.busca(n => n.getAttribute('data-si-quitar') === '1')); await D.espera(10)
  ok(igual(quitadas, [[1]]), '«Sí» quita la operación 1')
  ok(!!m.raiz.busca(n => n.getAttribute('data-quitar-op') === '2'), 'la abierta también tiene papelera')
  m.quita()

  console.log(fallos ? `\n${fallos} FALLOS` : '\nTodo en verde')
  process.exit(fallos ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
