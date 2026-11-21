// scripts/comprobaciones/replay-operar.js — OPERAR en el Replay (lib/replay/orden.js y components/PanelReplay.js, docs/builder.md §228).
// Las corre comunes.sh. Termina en 0 si todo da lo esperado. Cuentas a mano con las velas de replay.js (10.000 €, 1 € por orden).
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
  const O = require(R + '/lib/replay/orden.js'), M = require(R + '/lib/replay/motor.js')
  const F = (o) => ({ lado: 1, mercado: true, entrada: '', stop: '', objetivo: '', modo: 'invertir', pct: 20, ...o })

  // ── Comprobar la orden (precio de ahora 100) ──
  ok(igual(O.compruebaOrden(F({ stop: '98', objetivo: '108' }), 100).orden, { lado: 1, entrada: null, clase: null, stop: 98, objetivo: 108, tam: { modo: 'invertir', pct: 20 } }), 'a mercado con stop 98 y objetivo 108: vale')
  ok(O.compruebaOrden(F({ mercado: false, entrada: '95' }), 100).orden.clase === 'limite' && O.compruebaOrden(F({ mercado: false, entrada: '103,5' }), 100).orden.entrada === 103.5, 'compra a 95 con el precio a 100: límite; «103,5» con coma se lee 103,50')
  ok(O.compruebaOrden(F({ mercado: false, entrada: '103' }), 100).orden.clase === 'stop' && O.compruebaOrden(F({ lado: -1, mercado: false, entrada: '103' }), 100).orden.clase === 'limite', 'compra a 103: stop; corto a 103: límite')
  ok(/por debajo/.test(O.compruebaOrden(F({ stop: '101' }), 100).error) && /por encima/.test(O.compruebaOrden(F({ lado: -1, stop: '99' }), 100).error), 'stop al otro lado: no se envía y dice dónde va')
  ok(/por encima/.test(O.compruebaOrden(F({ objetivo: '99' }), 100).error), 'objetivo por debajo en una compra: no')
  ok(/stop/.test(O.compruebaOrden(F({ modo: 'arriesgar', pct: 1 }), 100).error) && /entrada/.test(O.compruebaOrden(F({ mercado: false }), 100).error) && /%/.test(O.compruebaOrden(F({ pct: 0 }), 100).error), 'arriesgar sin stop, «en un precio» sin precio, 0 %: avisos')
  // El stop de una orden «en un precio» se compara con la ENTRADA, no con el precio de ahora: compra a 95 con stop 97 → no (97 > 95).
  ok(/por debajo/.test(O.compruebaOrden(F({ mercado: false, entrada: '95', stop: '97' }), 100).error), 'en un precio, el stop se mira contra la entrada (compra a 95 con stop 97: no)')
  ok(O.explicaPrecio(1, '95', 100) === 'Orden límite: compra si baja hasta 95,00 (ahora 100,00)' && O.explicaPrecio(1, '103', 100) === 'Orden stop: compra si sube hasta 103,00 (ahora 100,00)', 'en palabras: «límite: compra si baja…» / «stop: compra si sube…»')
  ok(O.explicaPrecio(-1, '103', 100) === 'Orden límite: vende en corto si sube hasta 103,00 (ahora 100,00)' && O.explicaPrecio(-1, '97', 100) === 'Orden stop: vende en corto si baja hasta 97,00 (ahora 100,00)', 'en corto, al revés')
  const est = { version: 1, valores: ['A'], desde: D6[0], hoy: D6[0], capitalInicial: 10000, comision: 1, ejecucion: 'apertura', acciones: [{ id: 4 }], retrocesos: 0 }
  ok(igual(O.nuevaAccion(est, 'A', { lado: 1 }), { fecha: D6[0], simbolo: 'A', tipo: 'orden', id: 5, lado: 1 }), 'la acción nueva lleva la fecha de hoy y el id siguiente (5)')
  ok(O.textoOrden({ lado: 1, entrada: null, stop: 98, objetivo: null, tam: { modo: 'invertir', pct: 20 } }) === 'Compra a mercado · invertir 20 % · stop 98,00' && O.textoOrden({ lado: -1, entrada: 103, clase: 'limite', stop: null, objetivo: 96, tam: { modo: 'arriesgar', pct: 1 } }) === 'Corto límite a 103,00 · arriesgar 1 % · objetivo 96,00', 'cómo se lee una orden en una línea')

  // ── Marcas en el gráfico ── compra el d1 (stop 98) → entra el d2 a 101, sale el d3 a 98: −2,97 %.
  const conOrden = { ...est, hoy: D6[5], acciones: [{ fecha: D6[0], simbolo: 'A', tipo: 'orden', id: 1, lado: 1, entrada: null, stop: 98, objetivo: null, tam: { modo: 'invertir', pct: 50 } }] }
  const r = M.calcula(conOrden, VELAS)
  ok(igual(O.marcasDe(r).map(m => [m.date, m.shape, m.text]), [[D6[1], 'arrowUp', '#1'], [D6[2], 'circle', '#1 −3 %']]), `marcas: ▲ «#1» el 03/01 y «#1 −3 %» el 04/01 (${JSON.stringify(O.marcasDe(r).map(m => m.text))})`)

  // ── El panel de la derecha ──
  const React = require(R + '/node_modules/react'), RDC = require(R + '/node_modules/react-dom/client')
  const P = require(R + '/components/PanelReplay.js')
  const acciones = []; let termina = null
  const hoy2 = { ...conOrden, hoy: D6[1] }, r2 = M.calcula(hoy2, VELAS), c2 = M.cifras(hoy2, VELAS, r2)
  let m = D.monta(React.createElement(P.PanelOperar, { estado: hoy2, simbolo: 'A', r: r2, cif: c2, ahora: 104, onAccion: a => acciones.push(a), onTerminar: v => { termina = v } }), RDC); await D.espera(20)
  const txt = (sel) => m.raiz.busca(n => n.hasAttribute(sel))?.textContent || ''
  // El d2 entró: 49 acciones a 101; liquidez 5.050; al cierre (104) 10.146 €.
  ok(/10\.146 €/.test(txt('data-cifras-replay')) && /5\.050 €/.test(txt('data-cifras-replay')) && /\+146 € · 1,5 %/.test(txt('data-cifras-replay')), `cifras: tu dinero 10.146 €, liquidez 5.050 €, ganancia +146 € (1,5 %) (${txt('data-cifras-replay').slice(0, 140)})`)
  ok(/Abierta #1/.test(txt('data-posicion-replay')) && /Largo 49 a 101,00/.test(txt('data-posicion-replay')) && /Stop 98,00/.test(txt('data-posicion-replay')), 'posición abierta: #1 largo 49 a 101,00, stop 98,00')
  D.pulsa(m.raiz.busca(n => n.hasAttribute('data-cerrar-replay'))); await D.espera(10)
  ok(igual(acciones[0], { fecha: D6[1], simbolo: 'A', tipo: 'cerrar' }), '«Cerrar a mercado» manda «cerrar» con la fecha de hoy')
  const boton = (sel, val) => m.raiz.busca(n => n.getAttribute(sel) === val)
  // §233: el panel ya solo pone órdenes A MERCADO (las de un precio se marcan en el gráfico). Corto a mercado con el precio a 104.
  D.pulsa(boton('data-lado', '-1')); await D.espera(10)
  ok(/Vender en corto a mercado/.test(txt('data-enviar-orden')), 'en corto, el botón dice «Vender en corto a mercado»')
  D.escribe(m.raiz.busca(n => n.hasAttribute('data-stop')), '100'); await D.espera(10)
  D.pulsa(m.raiz.busca(n => n.hasAttribute('data-enviar-orden'))); await D.espera(10)
  ok(acciones.length === 1 && /por encima/.test(txt('data-error-orden')), 'stop 100 en un corto con el precio a 104: no se pone, aviso rojo')
  D.escribe(m.raiz.busca(n => n.hasAttribute('data-stop')), '110'); await D.espera(10)
  D.pulsa(m.raiz.busca(n => n.hasAttribute('data-enviar-orden'))); await D.espera(10)
  ok(acciones.length === 2 && igual({ ...acciones[1] }, { fecha: D6[1], simbolo: 'A', tipo: 'orden', id: 2, lado: -1, entrada: null, clase: null, stop: 110, objetivo: null, tam: { modo: 'invertir', pct: 20 } }), `con stop 110: se pone la orden a mercado (${JSON.stringify(acciones[1])})`)
  ok(m.raiz.busca(n => n.hasAttribute('data-stop')).value === '' && txt('data-error-orden') === '', 'después, las casillas de precio quedan vacías')
  D.pulsa(m.raiz.busca(n => n.hasAttribute('data-terminar'))); await D.espera(10)
  ok(termina === true, '«Terminar» pide cerrar todo al cierre de hoy')
  m.quita()
  // Con una orden viva: «✕» la cancela.
  const viva = { ...est, hoy: D6[2], acciones: [{ fecha: D6[0], simbolo: 'A', tipo: 'orden', id: 7, lado: 1, entrada: 90, clase: 'limite', stop: null, objetivo: null, tam: { modo: 'invertir', pct: 20 } }] }
  const r3 = M.calcula(viva, VELAS); acciones.length = 0
  m = D.monta(React.createElement(P.PanelOperar, { estado: viva, simbolo: 'A', r: r3, cif: M.cifras(viva, VELAS, r3), ahora: 99, onAccion: a => acciones.push(a), onTerminar() {} }), RDC); await D.espera(20)
  ok(/Compra límite a 90,00 · invertir 20 %/.test(txt('data-ordenes-vivas')), 'órdenes vivas: «Compra límite a 90,00 · invertir 20 %»')
  D.pulsa(m.raiz.busca(n => n.getAttribute('data-cancelar') === '7')); await D.espera(10)
  ok(igual(acciones[0], { fecha: D6[2], tipo: 'cancelar', id: 7 }), '✕ la cancela (sin preguntar)')
  m.quita()
  // Terminada: sin «Nueva orden», con «Reabrir».
  const fin = { ...conOrden, terminada: true }, r4 = M.calcula(fin, VELAS)
  m = D.monta(React.createElement(P.PanelOperar, { estado: fin, simbolo: 'A', r: r4, cif: M.cifras(fin, VELAS, r4), ahora: 111, onAccion() {}, onTerminar() {} }), RDC); await D.espera(20)
  ok(!m.raiz.busca(n => n.hasAttribute('data-nueva-orden')) && /Reabrir/.test(txt('data-terminar')), 'terminada: no se puede operar; el botón dice «Reabrir»')
  m.quita()

  // ── Debajo del gráfico ──
  m = D.monta(React.createElement(P.ResultadosReplay, { estado: conOrden, r, cif: M.cifras(conOrden, VELAS, r), velas: VELAS.A, simbolo: 'A' }), RDC); await D.espera(20)
  const res = () => m.raiz.busca(n => n.hasAttribute('data-resultados-replay')).textContent
  ok(/Operaciones · 1/.test(res()) && /−149,00 €/.test(res()) && /stop/.test(res()) && /2 órdenes, 2,00 € de comisiones/.test(res()), `operaciones: #1 −149,00 € por stop; 2 órdenes, 2,00 € de comisiones (${res().slice(0, 200)})`)
  D.pulsa(m.raiz.busca(n => n.getAttribute('data-vista-replay') === 'curva')); await D.espera(10)
  // Curva: 10.000 · 10.146 · 9.851 ×4 → peor caída 9.851 / 10.146 − 1 = −2,9 % (−295 €) el 04/01.
  ok(/Peor caída −2,9 %/.test(res()) && /295 €/.test(res()) && /04\/01\/2024/.test(res()), `curva: peor caída −2,9 % (−295 €) el 04/01/2024 (${(m.raiz.busca(n => n.hasAttribute('data-caida-replay')) || {}).textContent})`)
  m.quita()

  console.log(fallos ? `\n${fallos} FALLOS` : '\nTodo en verde')
  process.exit(fallos ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
