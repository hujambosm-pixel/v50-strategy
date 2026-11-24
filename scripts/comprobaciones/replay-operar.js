// scripts/comprobaciones/replay-operar.js — OPERAR en el Replay (lib/replay/orden.js y components/PanelReplay.js, docs/builder.md §228 y §250).
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
  ok(igual(O.marcasDe(r).map(m => [m.date, m.shape, m.text]), [[D6[1], 'arrowUp', '#1'], [D6[2], 'circle', '']]), `marcas: ▲ «#1» el 03/01 y un punto (sin texto) el 04/01 (${JSON.stringify(O.marcasDe(r).map(m => m.text))})`)
  // §234: la operación cerrada, para la línea y la caja «#1 −3 %» del gráfico: de 101 (03/01) a 98 (04/01), −2,97 %.
  const tr = O.tradesDe(r, 'A')
  ok(tr.length === 1 && tr[0].num === 1 && tr[0].entryDate === D6[1] && tr[0].exitDate === D6[2] && tr[0].entryPrice === 101 && tr[0].exitPrice === 98 && Math.abs(tr[0].pnlPct - (98 / 101 - 1) * 100) < 1e-9, `operación para el gráfico: #1 de 101 a 98, ${tr[0] && tr[0].pnlPct.toFixed(2)} %`)
  ok(O.tradesDe(r, 'B').length === 0, 'las de otro valor no salen')

  // ── El panel de la derecha (§250: cifras, ⚙ y Terminar) ──
  const React = require(R + '/node_modules/react'), RDC = require(R + '/node_modules/react-dom/client')
  const P = require(R + '/components/PanelReplay.js')
  const acciones = []; let termina = null
  const hoy2 = { ...conOrden, hoy: D6[1] }, r2 = M.calcula(hoy2, VELAS), c2 = M.cifras(hoy2, VELAS, r2)
  let m = D.monta(React.createElement(P.PanelOperar, { estado: hoy2, simbolo: 'A', r: r2, cif: c2, onTerminar: v => { termina = v } }), RDC); await D.espera(20)
  const txt = (sel) => m.raiz.busca(n => n.hasAttribute(sel))?.textContent || ''
  // El d2 entró: 49 acciones a 101; liquidez 5.050; al cierre (104) 10.146 €.
  ok(/10\.146 €/.test(txt('data-cifras-replay')) && /5\.050 €/.test(txt('data-cifras-replay')) && /\+146 € · 1,5 %/.test(txt('data-cifras-replay')), `cifras: tu dinero 10.146 €, liquidez 5.050 €, ganancia +146 € (1,5 %) (${txt('data-cifras-replay').slice(0, 140)})`)
  // §249: invertido de media (0 + 5.096 / 10.146) / 2 = 25,1 %; tiempo con algo dentro 1 de 2 velas = 50,0 %; 1 día: sin CAGR.
  ok(/Invertido de media25,1 %/.test(txt('data-cifras-replay')) && /Tiempo con algo dentro50,0 %/.test(txt('data-cifras-replay')) && /CAGR—/.test(txt('data-cifras-replay')), 'cifras nuevas: invertido de media 25,1 %, tiempo dentro 50,0 %, CAGR «—» (menos de 90 días)')
  ok(!m.raiz.busca(n => n.hasAttribute('data-nueva-orden')) && !m.raiz.busca(n => n.hasAttribute('data-posicion-replay')), '§250: a la derecha ya no está «Nueva orden» ni la posición (van dentro del gráfico)')
  D.pulsa(m.raiz.busca(n => n.hasAttribute('data-terminar'))); await D.espera(10)
  ok(termina === true, '«Terminar» pide cerrar todo al cierre de hoy')
  m.quita()
  // ⚙: la tarjeta «Valores por defecto» en lugar de las cifras.
  let form = { ...F({ mercado: true }), stopPct: '5', rr: '2' }, cfgCerrada = false
  const onForm = g => { form = typeof g === 'function' ? g(form) : g }
  m = D.monta(React.createElement(P.PanelOperar, { estado: hoy2, simbolo: 'A', r: r2, cif: c2, onTerminar() {}, cfg: true, form, onForm, onCfg: v => { cfgCerrada = v === false } }), RDC); await D.espera(20)
  ok(!!m.raiz.busca(n => n.hasAttribute('data-tarjeta-defecto')) && !m.raiz.busca(n => n.hasAttribute('data-cifras-replay')), '⚙: sale la tarjeta «Valores por defecto» en lugar de las cifras')
  const def = (k) => m.raiz.busca(n => n.getAttribute('data-def') === k)
  const dv = (k) => D.propsDe(def(k)).value
  ok(dv('stopModo') === 'pct' && dv('stopPct') === '5' && dv('tpModo') === 'rr' && dv('rr') === '2' && dv('tipo') === 'precio', 'con stop a 5 % y R:R 2 guardados: «A un % de la entrada» 5 y «Por R:R» 2; tipo «En un precio»')
  D.escribe(def('stopModo'), 'no'); await D.espera(10)
  D.escribe(def('tipo'), 'mercado'); await D.espera(10)
  ok(form.stopModo === 'no' && form.tipo === 'mercado', 'cambiar el stop a «Sin stop» y el tipo a «A mercado» cambia el formulario')
  form = { ...form, stopPct: '', rr: '' }
  D.escribe(def('stopModo'), 'pct'); await D.espera(10)
  D.escribe(def('tpModo'), 'rr'); await D.espera(10)
  ok(form.stopPct === '5' && form.rr === '2', 'elegir «A un %» y «Por R:R» con las casillas vacías las rellena con 5 % y 1 : 2')
  D.pulsa(m.raiz.busca(n => n.hasAttribute('data-cerrar-defecto'))); await D.espera(10)
  ok(cfgCerrada, '«← Cifras» vuelve a las cifras')
  m.quita()

  // ── El panel dentro del gráfico (§250) ──
  const pg = (o) => React.createElement(P.PanelGrafico, { estado: hoy2, simbolo: 'A', r: r2, ahora: 104, total: c2.final, form: F({}), onMarcar() {}, onAccion: a => acciones.push(a), onCfg() {}, ...o })
  m = D.monta(pg({}), RDC); await D.espera(20)
  ok(/Abierta #1/.test(txt('data-posicion-replay')) && /Largo 49 a 101,00/.test(txt('data-posicion-replay')) && /Stop 98,00/.test(txt('data-posicion-replay')), 'posición abierta: #1 largo 49 a 101,00, stop 98,00')
  D.pulsa(m.raiz.busca(n => n.hasAttribute('data-cerrar-replay'))); await D.espera(10)
  ok(igual(acciones[0], { fecha: D6[1], simbolo: 'A', tipo: 'cerrar' }), '«Cerrar ✕» manda «cerrar» con la fecha de hoy')
  const boton = (sel, val) => m.raiz.busca(n => n.getAttribute(sel) === val)
  ok(/🎯 Compra/.test(boton('data-marcar-replay', '1')?.textContent || '') && /🎯 Venta/.test(boton('data-marcar-replay', '-1')?.textContent || '') && !boton('data-enviar-orden', '1') && !!m.raiz.busca(n => n.hasAttribute('data-cfg-replay')),
    'tipo «En un precio»: botones 🎯 Compra / 🎯 Venta y ⚙ (sin botones a mercado)')
  m.quita()
  // Tipo «A mercado» con stop a 5 %: «Venta» con el precio a 104 → corto a mercado con stop 104 × 1,05 = 109,20.
  m = D.monta(pg({ form: F({ tipo: 'mercado', stopPct: '5' }) }), RDC); await D.espera(20)
  ok(/^Compra$/.test(boton('data-enviar-orden', '1')?.textContent || '') && /^Venta$/.test(boton('data-enviar-orden', '-1')?.textContent || '') && !boton('data-marcar-replay', '1'), 'tipo «A mercado»: botones «Compra» / «Venta» sin 🎯')
  D.pulsa(boton('data-enviar-orden', '-1')); await D.espera(10)
  ok(acciones.length === 2 && igual({ ...acciones[1] }, { fecha: D6[1], simbolo: 'A', tipo: 'orden', id: 2, lado: -1, entrada: null, clase: null, stop: 109.2, objetivo: null, tam: { modo: 'invertir', pct: 20 } }), `«Venta» pone el corto a mercado con stop 109,20 (${JSON.stringify(acciones[1])})`)
  m.quita()
  // Arriesgar un % sin stop: no se puede, aviso rojo.
  m = D.monta(pg({ form: F({ tipo: 'mercado', stopModo: 'no', modo: 'arriesgar', pct: 1 }) }), RDC); await D.espera(20)
  D.pulsa(boton('data-enviar-orden', '1')); await D.espera(10)
  ok(acciones.length === 2 && /stop/.test(txt('data-error-orden')), `arriesgar un % sin stop: no se pone, aviso rojo (${txt('data-error-orden')})`)
  m.quita()
  // Con una orden viva: «✕» la cancela.
  const viva = { ...est, hoy: D6[2], acciones: [{ fecha: D6[0], simbolo: 'A', tipo: 'orden', id: 7, lado: 1, entrada: 90, clase: 'limite', stop: null, objetivo: null, tam: { modo: 'invertir', pct: 20 } }] }
  const r3 = M.calcula(viva, VELAS); acciones.length = 0
  m = D.monta(pg({ estado: viva, r: r3, ahora: 99 }), RDC); await D.espera(20)
  ok(/Compra límite a 90,00 · invertir 20 %/.test(txt('data-ordenes-vivas')), 'órdenes vivas: «Compra límite a 90,00 · invertir 20 %»')
  D.pulsa(m.raiz.busca(n => n.getAttribute('data-cancelar') === '7')); await D.espera(10)
  ok(igual(acciones[0], { fecha: D6[2], tipo: 'cancelar', id: 7 }), '✕ la cancela (sin preguntar)')
  m.quita()
  // Terminada: sin botones de operar; a la derecha, «Reabrir».
  const fin = { ...conOrden, terminada: true }, r4 = M.calcula(fin, VELAS)
  m = D.monta(pg({ estado: fin, r: r4, ahora: 111 }), RDC); await D.espera(20)
  ok(!boton('data-marcar-replay', '1') && !m.raiz.busca(n => n.hasAttribute('data-cerrar-replay')), 'terminada: no se puede operar desde el gráfico')
  m.quita()
  m = D.monta(React.createElement(P.PanelOperar, { estado: fin, simbolo: 'A', r: r4, cif: M.cifras(fin, VELAS, r4), onTerminar() {} }), RDC); await D.espera(20)
  ok(/Reabrir/.test(txt('data-terminar')), 'terminada: el botón de la derecha dice «Reabrir»')
  m.quita()

  // ── Debajo del gráfico ──
  m = D.monta(React.createElement(P.ResultadosReplay, { estado: conOrden, r, cif: M.cifras(conOrden, VELAS, r), velas: VELAS.A, simbolo: 'A' }), RDC); await D.espera(20)
  const res = () => m.raiz.busca(n => n.hasAttribute('data-resultados-replay')).textContent
  ok(/Operaciones · 1/.test(res()) && /−149,00 €/.test(res()) && /stop/.test(res()) && /2 órdenes, 2,00 € de comisiones/.test(res()), `operaciones: #1 −149,00 € por stop; 2 órdenes, 2,00 € de comisiones (${res().slice(0, 200)})`)
  D.pulsa(m.raiz.busca(n => n.getAttribute('data-vista-replay') === 'curva')); await D.espera(10)
  // Curva: 10.000 · 10.146 · 9.851 ×4 → peor caída 9.851 / 10.146 − 1 = −2,9 % (−295 €) el 04/01.
  ok(/Peor caída −2,9 %/.test(res()) && /295 €/.test(res()) && /04\/01\/2024/.test(res()), `curva: peor caída −2,9 % (−295 €) el 04/01/2024 (${(m.raiz.busca(n => n.hasAttribute('data-caida-replay')) || {}).textContent})`)
  m.quita()
  // §251: la tabla, con la última arriba y ordenable. Tres operaciones inventadas: #1 −5 €, #2 +10 €, #3 +3 €.
  const tres = [{ num: 1, resultado: -5, simbolo: 'A' }, { num: 2, resultado: 10, simbolo: 'A' }, { num: 3, resultado: 3, simbolo: 'A' }]
  ok(P.ordenaOps(tres, { col: 'num', dir: 'desc' }).map(o => o.num).join() === '3,2,1', 'por defecto, la última arriba: #3, #2, #1')
  ok(P.ordenaOps(tres, { col: 'resultado', dir: 'desc' }).map(o => o.num).join() === '2,3,1' && P.ordenaOps(tres, { col: 'resultado', dir: 'asc' }).map(o => o.num).join() === '1,3,2', 'por resultado: de más a menos #2, #3, #1; al revés #1, #3, #2')
  m = D.monta(React.createElement(P.ResultadosReplay, { estado: conOrden, r, cif: M.cifras(conOrden, VELAS, r), velas: VELAS.A, simbolo: 'A' }), RDC); await D.espera(20)
  const cab = (id) => m.raiz.busca(n => n.getAttribute('data-col-ops') === id)
  ok(/# ▼/.test(cab('num').textContent) && /Capital invertido/.test(cab('capital').textContent), 'la tabla sale ordenada por # (▼) y tiene «Capital invertido»')
  ok(/4\.949 €/.test(m.raiz.busca(n => n.getAttribute('data-fila-op') === '1').textContent), 'capital invertido de #1: 49 × 101 = 4.949 €')
  D.pulsa(cab('resultado')); await D.espera(10)
  ok(/Resultado ▼/.test(cab('resultado').textContent), 'pulsar «Resultado» ordena por él (▼); otra vez, al revés')
  D.pulsa(cab('resultado')); await D.espera(10)
  ok(/Resultado ▲/.test(cab('resultado').textContent), '… y al pulsar otra vez, ▲')
  m.quita()

  console.log(fallos ? `\n${fallos} FALLOS` : '\nTodo en verde')
  process.exit(fallos ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
