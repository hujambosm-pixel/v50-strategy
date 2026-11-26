// scripts/comprobaciones/replay-vista.js — el Replay con una VISTA DEL SCREENER como valores (lib/replay/vistaReplay.js,
// pages/api/replay-vista.js, components/Replay.js y ReplayVarios.js; docs/builder.md §270). Las corre comunes.sh. Termina en 0 si todo da
// lo esperado. Semanas inventadas: lunes 08/01/2024 → A y B; lunes 15/01/2024 → B y C; lunes 22/01/2024 → C.
process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://arnes.invalid'; process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'clave-falsa-del-arnes'
const C0 = require('./cargador'), R = C0.RAIZ, DF = require('./domFalso')
let fallos = 0
const ok = (c, t) => { console.log(`${c ? 'OK  ' : 'MAL '} ${t}`); if (!c) fallos++ }
const J = JSON.stringify

;(async () => {
  DF.pon()
  await C0.prepara(); C0.registra(R)
  const V = require(R + '/lib/replay/vistaReplay.js')
  const SEM = [['2024-01-08', ['A', 'B']], ['2024-01-15', ['B', 'C']], ['2024-01-22', ['C']]]
  const fuente = { tipo: 'vista', id: 1, nombre: 'Rentables', vista: { filtros: {} }, semanas: SEM, noSeAplican: [] }

  // ── 1 · La lista de cada día ──
  ok(V.semanaDe(SEM, '2024-01-05') === -1 && J(V.listaEnDia(fuente, '2024-01-05')) === '[]', 'antes del primer lunes: sin lista')
  ok(J(V.listaEnDia(fuente, '2024-01-08')) === '["A","B"]' && J(V.listaEnDia(fuente, '2024-01-12')) === '["A","B"]', 'del lunes 08/01 al viernes 12/01: A y B')
  ok(J(V.listaEnDia(fuente, '2024-01-16')) === '["B","C"]' && J(V.listaEnDia(fuente, '2024-03-01')) === '["C"]', 'el 16/01: B y C; después del último lunes, la última lista')
  const c = V.cambiosEnDia(fuente, '2024-01-17')
  ok(c.lunes === '2024-01-15' && J(c.entran) === '["C"]' && J(c.salen) === '["A"]', 'la semana del 15/01: entra C, sale A')
  ok(J(V.cambiosEnDia(fuente, '2024-01-09').entran) === '[]', 'la primera semana no «entra» nadie (no hay anterior)')
  ok(J(V.unionSemanas(SEM)) === '["A","B","C"]' && J(V.unionSemanas(SEM, '2024-01-16')) === '["B","C"]', 'todos los que alguna semana están: A, B y C; desde el 16/01, B y C')
  ok(V.textoVista(fuente, '2024-01-17') === 'Vista «Rentables» · semana del 15/01/2024: 2 valores · entran C · salen A', `la cabecera (${V.textoVista(fuente, '2024-01-17')})`)

  // ── 2 · Señales y rejilla ──
  const sen = { A: { entradas: ['2024-01-10', '2024-01-16'], salidas: ['2024-01-18'] }, C: { entradas: ['2024-01-10', '2024-01-23'] } }
  const f = V.filtraSenalesVista(sen, fuente)
  ok(J(f.A.entradas) === '["2024-01-10"]' && J(f.A.salidas) === '["2024-01-18"]', 'A: cuenta la señal del 10/01 (está en la lista), no la del 16/01 (ya salió); las salidas, todas')
  ok(J(f.C.entradas) === '["2024-01-23"]', 'C: la del 10/01 no (aún no estaba), la del 23/01 sí')
  ok(V.filtraSenalesVista(sen, null) === sen, 'sin vista, las señales tal cual')
  const r = { posiciones: { A: { cantidad: 10 } }, ordenesVivas: [] }
  ok(J(V.visiblesVista(fuente, '2024-01-23', r, ['A', 'B', 'C'])) === '["A","C"]', 'en la rejilla el 23/01: C (de la lista) y A (posición abierta aunque salió)')
  ok(J(V.visiblesVista(fuente, '2024-01-23', { posiciones: {}, ordenesVivas: [{ simbolo: 'B' }] }, ['A', 'B', 'C'])) === '["B","C"]', 'una orden viva también lo deja a la vista')
  ok(J(V.visiblesVista(null, '2024-01-23', r, ['A', 'B'])) === '["A","B"]', 'sin vista: todos los valores')

  // ── 3 · La ruta del servidor (lo puro) ──
  const API = require(R + '/pages/api/replay-vista.js')
  ok(API.lunesDe('2024-01-17') === '2024-01-15' && API.lunesDe('2024-01-15') === '2024-01-15' && API.lunesDe('2024-01-21') === '2024-01-15', 'lunesDe: miércoles 17 y domingo 21 → lunes 15; el lunes, él mismo')
  ok(API.erroresPeticion({ vista: { filtros: {} }, desde: '2024-01-01' }).length === 0 && API.erroresPeticion({ desde: 'ayer' }).length === 2, 'la petición: vista y fecha')

  // ── 4 · La ventana de empezar (components/Replay.js) ──
  const React = require(R + '/node_modules/react'), RDC = require(R + '/node_modules/react-dom/client')
  const RP = require(R + '/components/Replay.js')
  let varios = null, pedidas = 0
  const pide = async (vista, desde) => { pedidas++; return { semanas: SEM, noSeAplican: ['pegEsp'] } }
  const VU = Array.from({ length: 300 }, (_, k) => ({ date: new Date(Date.UTC(2020, 0, 1) + k * 864e5).toISOString().slice(0, 10), open: 1, high: 1, low: 1, close: 1 }))
  const w = DF.monta(React.createElement(RP.VentanaReplay, { simbolo: 'AMD', velas: VU, listas: [{ nombre: 'L', simbolos: ['X', 'Y'] }], vistas: [{ id: 7, nombre: 'Rentables', vista: { filtros: {} } }], pideSemanas: pide,
    onEmpezar() {}, onEmpezarVarios: (n) => { varios = n }, onCancelar() {} }), RDC)
  await DF.espera(20)
  const fu = w.raiz.busca(n => n.hasAttribute('data-fuente-replay'))
  ok(/Vista del screener «Rentables» \(la de cada semana\)/.test(fu.textContent), 'en «Valores» salen tus vistas del screener')
  DF.escribe(fu, 'v:7'); await DF.espera(20)
  DF.escribe(w.raiz.busca(n => n.hasAttribute('data-fecha-replay')), '2024-01-10'); await DF.espera(450)
  const tv = w.raiz.busca(n => n.hasAttribute('data-vista-replay'))?.textContent || ''
  ok(pedidas >= 1 && /entre 1 y 2 valores; 3 distintos en 3 semanas/.test(tv), `pide la lista de cada lunes y dice cuántos (${tv.slice(0, 90)})`)
  ok(/no se aplica: PEG esperado/.test(tv), 'avisa de que el PEG esperado no se aplica en el pasado')
  DF.pulsa(w.raiz.busca(n => n.hasAttribute('data-empezar-replay'))); await DF.espera(10)
  ok(varios && J(varios.valores) === '["A","B","C"]' && varios.fuente?.tipo === 'vista' && varios.fuente.id === 7 && varios.fuente.semanas.length === 3 && varios.fecha === '2024-01-10',
    `«Empezar» abre la rejilla con todos los que alguna semana pasan la vista y guarda las semanas (${J(varios && { valores: varios.valores, fuente: varios.fuente && { id: varios.fuente.id, n: varios.fuente.semanas.length } })})`)
  const w2 = DF.monta(React.createElement(RP.VentanaReplay, { simbolo: 'AMD', velas: VU, listas: [], vistas: [{ id: 7, nombre: 'R', vista: { filtros: {} } }], pideSemanas: async () => ({ error: 'Las fotos del screener empiezan el lunes 03/01/2011: empieza ese día o después.', semanas: [] }),
    onEmpezar() {}, onEmpezarVarios() {}, onCancelar() {} }), RDC)
  await DF.espera(20); DF.escribe(w2.raiz.busca(n => n.hasAttribute('data-fuente-replay')), 'v:7'); await DF.espera(450)
  ok(/empiezan el lunes 03\/01\/2011/.test(w2.raiz.busca(n => n.hasAttribute('data-error-replay'))?.textContent || ''), 'si no hay fotos para esa fecha, lo dice y no deja empezar')

  // ── 5 · La rejilla (components/ReplayVarios.js) ──
  const RV = require(R + '/components/ReplayVarios.js')
  const vela = (date, c) => ({ date, open: c, high: c, low: c, close: c })
  const dias = ['2024-01-10', '2024-01-11', '2024-01-16', '2024-01-17', '2024-01-23']
  const VR = { A: dias.map(d => vela(d, 100)), B: dias.map(d => vela(d, 50)), C: dias.map(d => vela(d, 20)), '^GSPC': dias.map(d => vela(d, 4000)) }
  const Falso = (p) => React.createElement('div', { 'data-grafico-falso': p.simbolo })
  const m = DF.monta(React.createElement(RV.default, { inicial: { nuevo: { valores: ['A', 'B', 'C'], fecha: '2024-01-10', capitalInicial: 10000, comision: 1, ejecucion: 'apertura', fuente } }, cargaVelas: async (s) => VR[s] || [], onSalir() {}, Grafico: Falso }), RDC)
  await DF.espera(80)
  const celdas = () => m.raiz.todos(n => n.hasAttribute('data-celda-varios')).map(n => n.getAttribute('data-celda-varios')).sort()
  ok(J(celdas()) === '["A","B"]', `el 10/01 en la rejilla solo A y B (C aún no está en la vista) (${J(celdas())})`)
  const cab = m.raiz.busca(n => n.hasAttribute('data-vista-varios-texto'))?.textContent || ''
  ok(/Vista «Rentables» · semana del 08\/01\/2024: 2 valores/.test(cab) && /2 de 3 valores/.test(m.raiz.textContent), `la cabecera dice la vista, la semana y «2 de 3 valores» (${cab.slice(0, 80)})`)

  console.log(`replay-vista: ${fallos ? fallos + ' fallos' : 'todo bien'}`); process.exit(fallos ? 1 : 0)
})()
