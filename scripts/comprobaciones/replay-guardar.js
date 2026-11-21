// scripts/comprobaciones/replay-guardar.js — GUARDAR y ABRIR los Replays (lib/replay/guardados.js, components/MisReplays.js y el nombre del
// panel; docs/builder.md §232). Las corre comunes.sh. Sin red ni base: las peticiones van a un fetch de mentira que apunta lo que le piden.
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
  const G = require(R + '/lib/replay/guardados.js'), M = require(R + '/lib/replay/motor.js')
  const base = { version: 1, valores: ['A'], desde: D6[0], hoy: D6[0], capitalInicial: 10000, comision: 1, ejecucion: 'apertura', acciones: [], retrocesos: 0, terminada: false }

  // ── Qué se guarda ──
  ok(G.nombreDe(base) === 'A · desde 02/01/2024', 'nombre propuesto: «A · desde 02/01/2024»')
  ok(!G.hayQueGuardar(base) && G.hayQueGuardar({ ...base, hoy: D6[1] }) && G.hayQueGuardar({ ...base, acciones: [{}] }), 'recién empezado no se guarda; tras avanzar u operar, sí')
  // Compra a mercado el d1 (50 %, stop 98) → entra el 03/01 a 101 con 49 acciones y sale el 04/01 a 98: −149 € (−1,5 %), 1 operación.
  const e = { ...base, hoy: D6[5], acciones: [{ fecha: D6[0], simbolo: 'A', tipo: 'orden', id: 1, lado: 1, entrada: null, stop: 98, objetivo: null, tam: { modo: 'invertir', pct: 50 } }] }
  const g = G.paraGuardar({ ...e, resumen: { viejo: 1 } }, VELAS, M.calcula(e, VELAS))
  ok(igual(g.resumen, { final: 9851, pct: -1.49, operaciones: 1 }) || (Math.abs(g.resumen.final - 9851) < 1e-9 && Math.abs(g.resumen.pct + 1.49) < 1e-9 && g.resumen.operaciones === 1),
    `resumen: 9.851 € (−1,49 %), 1 operación (${JSON.stringify(g.resumen)})`)
  ok(igual(Object.entries(G.deGuardado(g)).sort(), Object.entries(e).sort()), 'al abrir se quita el resumen y queda el estado tal cual')
  ok(igual(G.deGuardado({ valores: ['A'], desde: D6[0], hoy: D6[0] }).acciones, []), 'un estado sin acciones se abre con la lista vacía')

  // ── Las peticiones a la base ──
  const pedidas = []
  const fetchFalso = async (url, op = {}) => { pedidas.push({ url, metodo: op.method || 'GET', body: op.body ? JSON.parse(op.body) : null, prefer: op.headers?.Prefer })
    return { ok: true, status: 200, json: async () => (op.method === 'POST' ? [{ id: 'uuid-1' }] : [{ id: 'uuid-1', nombre: 'x', estado: {} }]) } }
  const ctx = { url: 'http://base', headers: { apikey: 'k' }, fetch: fetchFalso }
  ok(await G.crearSimulacion(ctx, '  Mi replay  ', g) === 'uuid-1', 'crear: devuelve el id de la fila nueva')
  ok(pedidas[0].metodo === 'POST' && pedidas[0].url === 'http://base/rest/v1/simulaciones' && pedidas[0].body.tipo === 'replay' && pedidas[0].body.nombre === 'Mi replay' && pedidas[0].prefer === 'return=representation',
    'crear: POST a simulaciones con tipo «replay» y el nombre sin espacios')
  await G.guardarSimulacion(ctx, 'uuid-1', { estado: g })
  ok(pedidas[1].metodo === 'PATCH' && /id=eq\.uuid-1$/.test(pedidas[1].url) && igual(Object.keys(pedidas[1].body), ['estado']), 'guardar: PATCH de esa fila, solo el estado')
  await G.guardarSimulacion(ctx, 'uuid-1', { nombre: '' })
  ok(pedidas[2].body.nombre === 'Replay', 'un nombre vacío se guarda como «Replay» (la base exige de 1 a 120 letras)')
  await G.borrarSimulacion(ctx, 'uuid-1')
  ok(pedidas[3].metodo === 'DELETE' && /id=eq\.uuid-1$/.test(pedidas[3].url), 'borrar: DELETE de esa fila')
  await G.leerSimulaciones(ctx)
  ok(/tipo=eq\.replay/.test(pedidas[4].url) && /order=actualizada\.desc/.test(pedidas[4].url), 'leer: solo los replay, el último guardado primero')
  let error = ''
  try { await G.crearSimulacion({ ...ctx, fetch: async () => ({ ok: false, status: 403, json: async () => ({ message: 'sin permiso' }) }) }, 'x', g) } catch (x) { error = x.message }
  ok(error === 'No se pudo guardar el replay (HTTP 403: sin permiso).', `si la base no deja: «${error}»`)
  ok(G.filtraSimulaciones([{ nombre: 'Prueba de Ácme', estado: { valores: ['ACME'] } }, { nombre: 'otro', estado: { valores: ['^GSPC'] } }], 'acme').length === 1 &&
     G.filtraSimulaciones([{ nombre: 'Prueba de Ácme', estado: { valores: ['ACME'] } }, { nombre: 'otro', estado: { valores: ['^GSPC'] } }], 'gspc').length === 1, 'buscar sin mayúsculas ni acentos, por nombre o valor')

  // ── La ventana «Mis replays» ──
  const React = require(R + '/node_modules/react'), RDC = require(R + '/node_modules/react-dom/client')
  const MR = require(R + '/components/MisReplays.js').default
  const filas = [{ id: 'a', nombre: 'A · desde 02/01/2024', actualizada: '2026-11-21T10:00:00Z', estado: g }, { id: 'b', nombre: 'Otro', actualizada: '2026-11-20T10:00:00Z', estado: { valores: ['B'], desde: D6[0], hoy: D6[1], resumen: { pct: 3.25, operaciones: 2 } } }]
  const abiertos = [], borrados = []
  let m = D.monta(React.createElement(MR, { filas, abiertoId: 'b', onAbrir: f => abiertos.push(f.id), onBorrar: id => borrados.push(id), onCerrar() {} }), RDC); await D.espera(20)
  const fila = (id) => m.raiz.busca(n => n.getAttribute('data-fila-replay') === id)
  ok(/desde 02\/01\/2024 · vas por el 09\/01\/2024 · 1 operación/.test(fila('a').textContent) && /−1,5 %/.test(fila('a').textContent), `fila: «desde 02/01/2024 · vas por el 09/01/2024 · 1 operación» y −1,5 % (${fila('a').textContent.slice(0, 140)})`)
  ok(/abierto ahora/.test(fila('b').textContent) && /\+3,3 %/.test(fila('b').textContent), 'el que está abierto lo dice; +3,3 %')
  D.pulsa(m.raiz.busca(n => n.getAttribute('data-abrir-replay') === 'a')); await D.espera(10)
  ok(igual(abiertos, ['a']), '«Abrir» avisa con su fila')
  D.pulsa(m.raiz.busca(n => n.getAttribute('data-borrar-replay') === 'a')); await D.espera(10)
  ok(!borrados.length && /¿Borrarlo\?/.test(fila('a').textContent), 'la papelera pregunta en la fila antes de borrar')
  D.pulsa(m.raiz.busca(n => n.getAttribute('data-si-borrar') === 'a')); await D.espera(10)
  ok(igual(borrados, ['a']), '«Sí» lo borra')
  D.escribe(m.raiz.busca(n => n.hasAttribute('data-buscar-replays')), 'otro'); await D.espera(10)
  ok(!fila('a') && !!fila('b'), 'buscar «otro» deja solo esa fila')
  m.quita()
  m = D.monta(React.createElement(MR, { filas: [], onAbrir() {}, onBorrar() {}, onCerrar() {} }), RDC); await D.espera(20)
  ok(!!m.raiz.busca(n => n.hasAttribute('data-sin-replays')), 'sin ninguno: dice cómo empezar uno')
  m.quita()

  // ── El nombre en el panel ──
  const P = require(R + '/components/PanelReplay.js')
  const nombres = []; let misAbre = 0
  const est0 = { ...base }, r0 = M.calcula(est0, VELAS)
  m = D.monta(React.createElement(P.PanelOperar, { estado: est0, simbolo: 'A', r: r0, cif: M.cifras(est0, VELAS, r0), ahora: 100, onAccion() {}, onTerminar() {}, nombre: 'A · desde 02/01/2024', onNombre: t => nombres.push(t), guardado: 'guardado', onMisReplays: () => misAbre++ }), RDC); await D.espera(20)
  const txt = (sel) => m.raiz.busca(n => n.hasAttribute(sel))?.textContent || ''
  ok(/A · desde 02\/01\/2024/.test(txt('data-nombre-replay')) && /✓ guardado/.test(txt('data-guardado-replay')), 'el panel enseña el nombre y «✓ guardado»')
  D.pulsa(m.raiz.busca(n => n.hasAttribute('data-cambiar-nombre'))); await D.espera(10)
  D.escribe(m.raiz.busca(n => n.hasAttribute('data-casilla-nombre')), 'Mi primer replay'); await D.espera(10)
  D.propsDe(m.raiz.busca(n => n.hasAttribute('data-casilla-nombre'))).onKeyDown({ key: 'Enter' }); await D.espera(10)
  ok(igual(nombres, ['Mi primer replay']), '✎ + escribir + Enter cambia el nombre')
  D.pulsa(m.raiz.busca(n => n.hasAttribute('data-mis-replays-boton'))); await D.espera(10)
  ok(misAbre === 1, '«📂 Mis replays» abre la lista')
  m.quita()

  console.log(fallos ? `\n${fallos} FALLOS` : '\nTodo en verde')
  process.exit(fallos ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
