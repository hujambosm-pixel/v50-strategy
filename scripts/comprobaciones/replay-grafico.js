// scripts/comprobaciones/replay-grafico.js — el modo Replay del gráfico grande (lib/replay/grafico.js y components/Replay.js,
// docs/builder.md §226). Las corre comunes.sh. Termina en 0 si todo da lo esperado. Las fechas, a mano.
//
// VELAS INVENTADAS: 10 sesiones seguidas, del lun 02/01/2023 (d0) al vie 13/01/2023 (d9), sin fines de semana.
process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://arnes.invalid'; process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'clave-falsa-del-arnes'
const C0 = require('./cargador'), R = C0.RAIZ, D = require('./domFalso')
let fallos = 0
const ok = (c, t) => { console.log(`${c ? 'OK  ' : 'MAL '} ${t}`); if (!c) fallos++ }
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const F = ['2023-01-02', '2023-01-03', '2023-01-04', '2023-01-05', '2023-01-06', '2023-01-09', '2023-01-10', '2023-01-11', '2023-01-12', '2023-01-13']
const VELAS = F.map((date, i) => ({ date, open: 10 + i, high: 11 + i, low: 9 + i, close: 10.5 + i }))

;(async () => {
  D.pon()
  const OV = {}
  window.addEventListener = (t, f) => { (OV[t] ||= []).push(f) }
  window.removeEventListener = (t, f) => { OV[t] = (OV[t] || []).filter(x => x !== f) }
  await C0.prepara(); C0.registra(R)
  const G = require(R + '/lib/replay/grafico.js'), M = require(R + '/lib/replay/motor.js')

  // ── Lo puro ──
  ok(igual(G.recortaVelas(VELAS, F[4]).map(v => v.date), F.slice(0, 5)), 'recortar hasta el vie 06/01: las 5 primeras velas (el futuro no llega al gráfico)')
  ok(G.velaDeInicio(VELAS, '2023-01-07') === F[4], 'empezar el sáb 07/01 (sin vela) → el vie 06/01, la de antes')
  ok(G.velaDeInicio(VELAS, '2022-01-01') === F[1] && G.velaDeInicio(VELAS, '2030-01-01') === F[8], 'nunca la primera ni la última: queda algo antes y algo por descubrir')
  ok(G.velaDeInicio(VELAS.slice(0, 2), F[0]) === null, 'con menos de 3 velas no hay Replay')
  ok(G.inicioHace(VELAS, 1) === F[1], 'hace 1 año desde el 13/01/2023 = 13/01/2022: antes de todo → la 2.ª vela')
  ok(G.inicioAlAzar(VELAS, () => 0) === F[3] && G.inicioAlAzar(VELAS, () => 0.999) === F[6], 'al azar con 10 velas: entre la 4.ª (deja 3 antes) y la 7.ª (deja 3 después)')
  ok(G.vecina(VELAS, F[2], F[4], 1) === F[5] && G.vecina(VELAS, F[2], F[4], 5) === F[9], 'una vela más: lun 09/01; cinco más: vie 13/01')
  ok(G.vecina(VELAS, F[2], F[9], 1) === null && G.vecina(VELAS, F[2], F[8], 5) === F[9], 'en la última no avanza; cinco desde la penúltima: se queda en la última')
  ok(G.vecina(VELAS, F[2], F[4], -1) === F[3] && G.vecina(VELAS, F[2], F[3], -5) === F[2] && G.vecina(VELAS, F[2], F[2], -1) === null, 'atrás: una; cinco desde el 05/01 se para en el inicio (04/01); en el inicio no retrocede')
  ok(igual(G.desplazaRango({ from: '2022-10-06', to: '2023-01-18' }, F[4], F[5]), { from: '2022-10-09', to: '2023-01-21' }), 'del vie 06/01 al lun 09/01 la ventana se mueve 3 días (misma anchura)')
  ok(igual(G.posicion(VELAS, F[2], F[4]), { vela: 3, total: 8, quedan: 5 }), 'empezando el 04/01 y hoy el 06/01: vela 3 de 8, quedan 5')
  ok(igual(G.rangoVer(VELAS, F[5], 3), { from: F[3], to: '2023-01-21' }) && igual(G.rangoVer(VELAS, F[1], 120), { from: F[0], to: '2023-01-15' }) && G.rangoVer(VELAS, F[5], 0) === null, '«Ver 3» con hoy el lun 09/01: del jue 05/01 al 21/01 (12 días de margen); «Ver 120» con pocas velas: desde la primera; «Libre»: no toca la ventana')
  // Retroceder con el motor: suma un retroceso.
  const e0 = { version: 1, valores: ['X'], desde: F[2], hoy: F[2], acciones: [], retrocesos: 0 }
  const e1 = M.irA(e0, G.vecina(VELAS, F[2], F[2], 1)), e2 = M.irA(e1, G.vecina(VELAS, F[2], e1.hoy, -1))
  ok(e1.hoy === F[3] && e1.retrocesos === 0 && e2.hoy === F[2] && e2.retrocesos === 1, 'avanzar no cuenta; volver atrás suma un retroceso')

  // ── La barra de abajo ──
  const React = require(R + '/node_modules/react'), RDC = require(R + '/node_modules/react-dom/client')
  const RP = require(R + '/components/Replay.js')
  const pasos = []; let salidas = 0
  const barra = (estado) => React.createElement(RP.BarraReplay, { velas: VELAS, estado, onIr: n => pasos.push(n), onSalir: () => { salidas++ } })
  let m = D.monta(barra({ ...e0, hoy: F[4], retrocesos: 2 }), RDC); await D.espera(20)
  const texto = () => m.raiz.busca(n => n.hasAttribute('data-barra-replay')).textContent
  ok(/Hoy en el replay: vie 06\/01\/2023/.test(texto()) && /vela 3 de 8/.test(texto()) && /2 retrocesos/.test(texto()), `la barra dice «Hoy en el replay: vie 06/01/2023 · vela 3 de 8 · 2 retrocesos» (${texto().slice(0, 120)})`)
  const tecla = (key, extra = {}) => { let parado = false; for (const f of OV.keydown || []) f({ key, target: { tagName: 'DIV' }, preventDefault() {}, stopPropagation() { parado = true }, ...extra }); return parado }
  const boton = (t) => m.raiz.busca(n => n.nodeName === 'BUTTON' && n.textContent === t)
  const varias = () => m.raiz.busca(n => n.hasAttribute('data-varias'))
  D.pulsa(boton('▶|')); D.pulsa(varias()); D.pulsa(boton('|◀')); await D.espera(10)
  const nv = () => m.raiz.busca(n => n.hasAttribute('data-n-velas')).value
  ok(igual(pasos, [1, 5, -1]) && varias().textContent === '▶▶' && String(nv()) === '5', '▶| una vela, ▶▶ cinco (el número dentro del botón, 5 de entrada), |◀ una atrás')
  const orden = m.raiz.busca(n => n.hasAttribute('data-barra-replay')).textContent
  ok(orden.indexOf('▶') < orden.indexOf('|◀') && orden.indexOf('|◀') < orden.indexOf('▶|') && orden.indexOf('▶|') < orden.indexOf('▶▶'), `§239: ▶ reproducir primero (con su velocidad dentro), luego |◀ ▶| y ▶▶ (${orden.slice(0, 40)})`)
  pasos.length = 0
  D.escribe(m.raiz.busca(n => n.hasAttribute('data-n-velas')), '3'); await D.espera(10)
  D.pulsa(varias()); tecla('ArrowRight', { shiftKey: true }); tecla('ArrowLeft', { shiftKey: true }); await D.espera(10)
  ok(igual(pasos, [3, 3, -3]) && String(nv()) === '3', `casilla a 3: ▶▶, Mayús + → y Mayús + ← mueven 3 (${JSON.stringify(pasos)})`)
  D.escribe(m.raiz.busca(n => n.hasAttribute('data-n-velas')), '1'); await D.espera(10)
  ok(String(nv()) === '2', 'la casilla no baja de 2 (para una vela está ▶|)')
  D.escribe(m.raiz.busca(n => n.hasAttribute('data-n-velas')), '5'); await D.espera(10)
  pasos.length = 0
  const p1 = tecla('ArrowRight'); tecla('ArrowRight', { shiftKey: true }); tecla('ArrowLeft'); await D.espera(10)
  ok(igual(pasos, [1, 5, -1]) && p1, 'teclas → (una), Mayús + → (cinco), ← (atrás); no siguen hacia otras teclas de la app')
  pasos.length = 0
  tecla('ArrowRight', { target: { tagName: 'INPUT' } })
  ok(pasos.length === 0, 'escribiendo en una casilla, las flechas no mueven el Replay')
  ok(tecla(' ') === true, 'el espacio reproduce y no abre el buscador de símbolos')
  await D.espera(1150)
  ok(pasos.length >= 1 && pasos.every(n => n === 1), `reproduciendo a 2 velas por segundo: avanza de una en una (${pasos.length} en ~1 s)`)
  tecla(' '); pasos.length = 0; await D.espera(700)
  ok(pasos.length === 0, 'otro espacio para')
  D.pulsa(m.raiz.busca(n => n.hasAttribute('data-salir-replay')))
  ok(salidas === 1, '«✕ Salir» sale del Replay')
  m.quita()
  m = D.monta(barra({ ...e0, hoy: F[9] }), RDC); await D.espera(20)
  ok(/última vela/.test(m.raiz.busca(n => n.hasAttribute('data-barra-replay')).textContent) && D.propsDe(boton("▶|")).disabled === true, 'en la última vela: «última vela» y ▶| apagado')
  m.quita()
  // §248: con una estrategia, el selector «a qué salta» y «N entradas · M salidas».
  let tipo = null
  const senalE = { elegida: 'e:1', opciones: [{ valor: 'e:1', texto: 'Estrategia «X»' }], onElige() {}, onSiguiente() {}, onAnterior() {}, estado: 'lista', n: 4,
    tipos: { valor: 'ambas', onCambia: v => { tipo = v } }, textoN: '2 entradas · 2 salidas' }
  m = D.monta(React.createElement(RP.BarraReplay, { velas: VELAS, estado: { ...e0, hoy: F[4] }, onIr() {}, onSalir() {}, senal: senalE }), RDC); await D.espera(20)
  const ts = m.raiz.busca(n => n.hasAttribute('data-tipo-salto'))
  D.escribe(ts, 'salidas'); await D.espera(10)
  ok(ts && tipo === 'salidas' && /2 entradas · 2 salidas/.test(m.raiz.busca(n => n.hasAttribute('data-n-senales')).textContent), 'con una estrategia: «a qué salta» (elige «salidas») y «2 entradas · 2 salidas»')
  m.quita()
  m = D.monta(React.createElement(RP.BarraReplay, { velas: VELAS, estado: { ...e0, hoy: F[4] }, onIr() {}, onSalir() {}, senal: { ...senalE, tipos: undefined, textoN: undefined, n: 3 } }), RDC); await D.espera(20)
  ok(!m.raiz.busca(n => n.hasAttribute('data-tipo-salto')) && /3 señales en total/.test(m.raiz.busca(n => n.hasAttribute('data-n-senales')).textContent), 'con una condición: sin ese selector y «3 señales en total»')
  m.quita()

  // ── La ventana de empezar ──
  let empezo = null, cancelo = 0
  m = D.monta(React.createElement(RP.VentanaReplay, { simbolo: 'AAPL', velas: VELAS, onEmpezar: f => { empezo = f }, onCancelar: () => { cancelo++ } }), RDC); await D.espera(20)
  const v = () => m.raiz.busca(n => n.hasAttribute('data-ventana-replay')).textContent
  ok(/Replay de AAPL/.test(v()) && /Empiezas el mar 03\/01\/2023: verás las velas hasta ese día y quedan 8 por descubrir \(hay datos desde el 02\/01\/2023\)/.test(v()), `propone «hace 1 año» (aquí, la 2.ª vela, mar 03/01) y dice cuántas quedan (${v().slice(0, 160)})`)
  D.escribe(m.raiz.busca(n => n.hasAttribute('data-fecha-replay')), '2023-01-08'); await D.espera(10)
  ok(/Empiezas el vie 06\/01\/2023: verás las velas hasta ese día y quedan 5 por descubrir/.test(v()), 'eligiendo el dom 08/01: empieza el vie 06/01, quedan 5')
  D.pulsa(m.raiz.busca(n => n.hasAttribute('data-empezar-replay')))
  ok(empezo === F[4], '«Empezar» con el 06/01')
  for (const f of OV.keydown || []) f({ key: 'Escape', target: { tagName: 'DIV' }, preventDefault() {}, stopPropagation() {} })
  ok(cancelo === 1, 'Esc cierra la ventana')
  m.quita()

  // ── §242: la historia del Replay (toda la guardada, solo cerradas; semanales hechas con las diarias) ──
  const DI = [['2024-01-01',10,12,9,11],['2024-01-02',11,13,10,12],['2024-01-05',12,15,11,14],['2024-01-08',14,14,8,9],['2024-01-09',9,10,7,8,true]].map(([date,open,high,low,close,enCurso]) => ({ date, open, high, low, close, volume: 100, ...(enCurso ? { enCurso } : {}) }))
  ok(igual(G.historiaReplay(DI, 'diario').map(v => v.date), ['2024-01-01','2024-01-02','2024-01-05','2024-01-08']), 'diario: todas menos la vela en curso')
  const SE = G.historiaReplay(DI, 'semanal', '2024-01-08')
  ok(SE.length === 1 && SE[0].date === '2024-01-01' && SE[0].open === 10 && SE[0].high === 15 && SE[0].low === 9 && SE[0].close === 14 && SE[0].volume === 300, `semanal: la semana del 01/01 (abre 10, máx 15, mín 9, cierra 14, vol 300); la del 08/01 está abierta y no sale (${JSON.stringify(SE)})`)
  ok(G.historiaReplay(DI.slice(0, 4), 'semanal', null).length === 2, 'semanal sin semana abierta: la del 08/01 (solo con su lunes) sí sale')

  // ── §241: «Hace 1 / 5 / 10 años»; apagados si el gráfico no tiene tantos años cargados ──
  // Una vela cada 7 días del 02/01/2015 al 30/12/2022: 7,99 años (2.921 días ÷ 365,25).
  const LARGAS = []; for (let d = new Date(Date.UTC(2015, 0, 2)); d <= new Date(Date.UTC(2022, 11, 30)); d = new Date(d.getTime() + 7 * 864e5)) LARGAS.push({ date: d.toISOString().slice(0, 10), open: 10, high: 11, low: 9, close: 10 })
  ok(Math.abs(G.anosCargados(LARGAS) - 2919 / 365.25) < 1e-9 && G.anosCargados([]) === 0, `años cargados: ${G.anosCargados(LARGAS).toFixed(2)} (2.919 días ÷ 365,25)`)
  m = D.monta(React.createElement(RP.VentanaReplay, { simbolo: 'AAPL', velas: LARGAS, onEmpezar() {}, onCancelar() {} }), RDC); await D.espera(20)
  const bh = (t) => m.raiz.busca(n => n.getAttribute && n.getAttribute('data-hace') === t)
  ok(bh('Hace 1 año') && bh('Hace 5 años') && bh('Hace 10 años') && !bh('Hace 2 años'), 'botones «Hace 1 año», «Hace 5 años», «Hace 10 años» (ya no «Hace 2 años»)')
  ok(!D.propsDe(bh('Hace 5 años')).disabled && D.propsDe(bh('Hace 10 años')).disabled && /solo tiene 8 años/.test(D.propsDe(bh('Hace 10 años')).title), `con 8 años cargados: 5 encendido; 10 apagado y lo dice (${D.propsDe(bh('Hace 10 años')).title})`)
  D.pulsa(bh('Hace 5 años')); await D.espera(10)
  ok(m.raiz.busca(n => n.hasAttribute('data-fecha-replay')) && D.propsDe(m.raiz.busca(n => n.hasAttribute('data-fecha-replay'))).value === G.inicioHace(LARGAS, 5) && G.inicioHace(LARGAS, 5) <= '2017-12-30', `«Hace 5 años» pone ${G.inicioHace(LARGAS, 5)} (la vela del 30/12/2017 o antes)`)
  m.quita()

  // ── El botón de arriba ──
  const RDS = require(R + '/node_modules/react-dom/server')
  ok(/⏪ Replay/.test(RDS.renderToString(React.createElement(RP.BotonReplay, { activo: false, onClick() {} }))) && /Salir del Replay/.test(RDS.renderToString(React.createElement(RP.BotonReplay, { activo: true, onClick() {} }))), 'botón «⏪ Replay»; encendido, su ayuda dice «Salir del Replay»')

  console.log(fallos ? `\n${fallos} FALLOS` : '\nTodo en verde')
  process.exit(fallos ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
