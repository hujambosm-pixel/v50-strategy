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
  D.pulsa(boton('▶|')); D.pulsa(varias()); D.pulsa(boton('◀')); await D.espera(10)
  ok(igual(pasos, [1, 5, -1]) && varias().textContent === '▶▶ 5', '▶| una vela, ▶▶ cinco (las de la casilla, 5 de entrada), ◀ una atrás')
  pasos.length = 0
  D.escribe(m.raiz.busca(n => n.hasAttribute('data-n-velas')), '3'); await D.espera(10)
  D.pulsa(varias()); tecla('ArrowRight', { shiftKey: true }); tecla('ArrowLeft', { shiftKey: true }); await D.espera(10)
  ok(igual(pasos, [3, 3, -3]) && varias().textContent === '▶▶ 3', `casilla a 3: ▶▶, Mayús + → y Mayús + ← mueven 3 (${JSON.stringify(pasos)})`)
  D.escribe(m.raiz.busca(n => n.hasAttribute('data-n-velas')), '1'); await D.espera(10)
  ok(varias().textContent === '▶▶ 2', 'la casilla no baja de 2 (para una vela está ▶|)')
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

  // ── La ventana de empezar ──
  let empezo = null, cancelo = 0
  m = D.monta(React.createElement(RP.VentanaReplay, { simbolo: 'AAPL', velas: VELAS, onEmpezar: f => { empezo = f }, onCancelar: () => { cancelo++ } }), RDC); await D.espera(20)
  const v = () => m.raiz.busca(n => n.hasAttribute('data-ventana-replay')).textContent
  ok(/Replay de AAPL/.test(v()) && /Verás hasta el mar 03\/01\/2023; quedan 8 velas/.test(v()), `propone «hace 1 año» (aquí, la 2.ª vela, mar 03/01) y dice cuántas quedan (${v().slice(0, 160)})`)
  D.escribe(m.raiz.busca(n => n.hasAttribute('data-fecha-replay')), '2023-01-08'); await D.espera(10)
  ok(/Verás hasta el vie 06\/01\/2023; quedan 5 velas/.test(v()), 'eligiendo el dom 08/01: empieza el vie 06/01, quedan 5')
  D.pulsa(m.raiz.busca(n => n.hasAttribute('data-empezar-replay')))
  ok(empezo === F[4], '«Empezar» con el 06/01')
  for (const f of OV.keydown || []) f({ key: 'Escape', target: { tagName: 'DIV' }, preventDefault() {}, stopPropagation() {} })
  ok(cancelo === 1, 'Esc cierra la ventana')
  m.quita()

  // ── El botón de arriba ──
  const RDS = require(R + '/node_modules/react-dom/server')
  ok(/⏪ Replay/.test(RDS.renderToString(React.createElement(RP.BotonReplay, { activo: false, onClick() {} }))) && /Salir del Replay/.test(RDS.renderToString(React.createElement(RP.BotonReplay, { activo: true, onClick() {} }))), 'botón «⏪ Replay»; encendido, su ayuda dice «Salir del Replay»')

  console.log(fallos ? `\n${fallos} FALLOS` : '\nTodo en verde')
  process.exit(fallos ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
