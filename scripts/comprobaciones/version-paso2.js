// scripts/comprobaciones/version-paso2.js — «versión 2» desde las pruebas del paso 2, la guardia del paso 1 al ir a una tesis y la guía al día (docs/builder.md, §63). Montado con estado y efectos (domFalso.js, la base simulada). Las corre comunes.sh. Termina en 0 si todo va bien.
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://falso.invalid'; process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'clave-falsa-de-la-prueba'
const path = require('path')
const C0 = require('./cargador'), R = C0.RAIZ, D = require('./domFalso')
let fallos = 0
const ok = (c, t) => { console.log(`${c ? 'OK  ' : 'MAL '} ${t}`); if (!c) fallos++ }
const EMA = { tipo: 'editor', motor: 1, formato: 1, nombre: 'EMA', stops: [{ id: 'inicial', pct: 8, tipo: 'porcentaje', motivo: 'stop' }],
  entrada: { orden: { tipo: 'apertura' }, senal: { c: 'cruza', de: { c: 'precioVsMedia', p: { lado: 'encima', tipo: 'EMA', periodo: '$ema' } } } },
  salidas: [{ si: { c: 'cruza', de: { c: 'precioVsMedia', p: { lado: 'debajo', tipo: 'EMA', periodo: '$ema' } } }, tipo: 'condicion', motivo: 'cruce_bajista', precio: 'apertura' }],
  parametros: { lista: [{ max: 400, min: 2, paso: 1, tipo: 'entero', nombre: 'ema', defecto: 20, ventana: true, descripcion: 'Periodo de la EMA' }], version: 1, restricciones: [] } }

;(async () => {
  D.pon(); await C0.prepara(); C0.registra(R)
  const React = require(path.join(R, 'node_modules', 'react')), RDC = require(path.join(R, 'node_modules', 'react-dom', 'client')), h = React.createElement
  const Ed = require(R + '/components/BuilderEditor.js'), BP = require(R + '/components/BuilderPanel.js').default, V = require(R + '/lib/builder/versiones.js')
  const fila = { id: 'e1', name: 'Mi EMA', description: 'una', definition: { ...EMA, nombre: 'Mi EMA', descripcion: 'una' }, params: { ema: 20, intervalo: 'diario' } }
  const foto = (def = fila.definition, params = fila.params, name = fila.name) => ({ id: fila.id, name, definition: def, params })
  const prueba = (o = {}) => ({ id: 1, creada_en: '2026-10-30T10:00:00Z', estrategia_id: 'e1', estrategia_nombre: 'Mi EMA', estrategia_foto: foto(), estrategia_huella: 'h', valor: 'AAPL', velas: 'diarias', res: null, ...o })

  // ── 1 · Qué prueba cuenta ──
  const reglaDe = (ema) => [fila.definition, { ema, intervalo: 'diario' }]
  ok(V.pruebasDeLaRegla([prueba()], ...reglaDe(20)).join() === 'Prueba contra el azar · AAPL · velas diarias del 30/10/2026', 'la que probó esta regla: su nombre')
  ok(V.pruebasDeLaRegla([prueba()], ...reglaDe(50)).length === 0, 'una prueba de otra regla no cuenta')
  ok(V.pruebasDeLaRegla([prueba({ estrategia_foto: foto({ ...fila.definition, nombre: 'Otro nombre', descripcion: 'otra' }) })], ...reglaDe(20)).length === 1, 'cambiar el nombre o la descripción no la saca de su prueba')
  ok(V.pruebasDeLaRegla([], ...reglaDe(20)).length === 0 && V.pruebasDeLaRegla(null, ...reglaDe(20)).length === 0 && V.pruebasDeLaRegla([{ id: 9 }], ...reglaDe(20)).length === 0, 'sin pruebas, o una sin foto: ninguna, sin error')

  // ── 2 · Guardar, montado de verdad ──
  const J = (x, status = 200) => ({ ok: true, status, json: async () => x, text: async () => JSON.stringify(x) })
  const base = (pruebas, o = {}) => { const b = { pruebas, leidas: [] }
    globalThis.fetch = async (u) => { const s = String(u)
      if (s.includes('pruebas_azar')) { b.leidas.push(s); if (o.falla) return { ok: false, status: 500, json: async () => ({}) }; return J(b.pruebas) }
      if (s.includes('tesis_inversion')) return J(o.tesis || [])
      return J([]) }
    return b }
  const servidor = (o = {}) => { const a = []; const f = async (u, q = {}) => { if (u === '/api/strategies') { a.push({ metodo: q.method, cuerpo: JSON.parse(q.body) }); if (o.falla) return { ok: false, status: 500, json: async () => ({ error: 'falla la base' }) }; return { ok: true, status: 200, json: async () => ({ id: q.method === 'POST' ? 'e2' : JSON.parse(q.body).id }) } } return { ok: false, status: 404, json: async () => ({}) } }; f.llamadas = a; return f }
  const q = (m, k, v) => m.raiz.busca(n => n.getAttribute(k) != null && (v == null || n.getAttribute(k) === String(v)))
  const LARGO = 120
  const est = (o = {}) => ({ def: fila.definition, valores: { ema: 20, intervalo: 'diario' }, nombre: 'Mi EMA', descripcion: 'una', ...o })
  const montaEd = async (estadoInicial, api, extra = {}) => { const guardadas = []; const m = D.monta(h(Ed.default, { fila, estrategias: [fila], apiFetch: api, estadoInicial, onGuardada: (x, i) => guardadas.push([x, i]), ...extra }), RDC); await D.espera(LARGO); m.guardadas = guardadas; return m }
  const copiaFila = JSON.stringify(fila)

  let b = base([prueba()]), api = servidor(), m = await montaEd(est({ valores: { ema: 50, intervalo: 'diario' } }), api)
  ok(b.leidas.length === 1 && b.leidas[0].includes('estrategia_id=eq.e1'), 'lee las pruebas de esa estrategia')
  ok(q(m, 'data-boton', 'guardar-valores').getAttribute('title')?.includes('versión 2') || D.propsDe(q(m, 'data-boton', 'guardar-valores')).title.includes('versión 2'), 'antes de guardar, el botón avisa de la versión 2')
  D.pulsa(q(m, 'data-boton', 'guardar-valores')); await D.espera(LARGO)
  let l = api.llamadas
  ok(l.length === 1 && l[0].metodo === 'POST' && l[0].cuerpo.name === 'Mi EMA · versión 2' && l[0].cuerpo.params.ema === 50 && !('id' in l[0].cuerpo), `cambiar la regla: POST de «${l[0]?.cuerpo.name}», nueva, sin tocar la original`)
  ok(l.every(x => x.metodo !== 'PUT') && JSON.stringify(fila) === copiaFila, 'la original no se escribe')
  m.quita(); await D.espera(5)

  b = base([prueba()]); api = servidor(); m = await montaEd(est({ nombre: 'Otro nombre', descripcion: 'otra' }), api)
  D.pulsa(q(m, 'data-boton', 'guardar-valores')); await D.espera(LARGO)
  l = api.llamadas
  ok(l.length === 1 && l[0].metodo === 'PUT' && l[0].cuerpo.id === 'e1' && l[0].cuerpo.name === 'Otro nombre' && l[0].cuerpo.params.ema === 20, 'cambiar nombre y descripción: PUT sobre la misma')
  m.quita(); await D.espera(5)

  b = base([]); api = servidor(); m = await montaEd(est({ valores: { ema: 50, intervalo: 'diario' } }), api)
  D.pulsa(q(m, 'data-boton', 'guardar-valores')); await D.espera(LARGO)
  ok(api.llamadas[0]?.metodo === 'PUT' && api.llamadas[0].cuerpo.id === 'e1' && api.llamadas[0].cuerpo.name === 'Mi EMA', 'sin prueba: cambiar la regla se guarda sobre la misma')
  m.quita(); await D.espera(5)

  b = base([prueba({ estrategia_foto: foto(fila.definition, { ema: 10, intervalo: 'diario' }) })]); api = servidor(); m = await montaEd(est({ valores: { ema: 50, intervalo: 'diario' } }), api)
  D.pulsa(q(m, 'data-boton', 'guardar-valores')); await D.espera(LARGO)
  ok(api.llamadas[0]?.metodo === 'PUT', 'con una prueba de una regla anterior: se guarda sobre la misma'); m.quita(); await D.espera(5)

  b = base([prueba()], { falla: true }); api = servidor(); m = await montaEd(est({ valores: { ema: 50, intervalo: 'diario' } }), api)
  ok(!!q(m, 'data-aviso', 'pruebas-sin-leer'), 'si no se pueden leer sus pruebas: lo avisa en una línea'); m.quita(); await D.espera(5)
  b = base([prueba()]); m = await montaEd(est(), servidor())
  ok(!q(m, 'data-aviso', 'pruebas-sin-leer'), 'si se pueden leer: sin aviso'); m.quita(); await D.espera(5)

  // Nueva o copia, sin id: no pide nada.
  b = base([prueba()]); m = await montaEd(null, servidor(), { fila: { ...fila, id: null, name: 'Copia', copiaDe: 'Mi EMA' } })
  ok(b.leidas.length === 0, 'una copia sin guardar no pide pruebas'); m.quita(); await D.espera(5)

  // ── 3 · La guardia del paso 1, con el Builder de verdad ──
  const tesis = [{ id: 7, titulo: 'Mi tesis', relacionados: [{ tipo: 'estrategia', id: 'e1' }], created_at: '2026-10-01T10:00:00Z', updated_at: '2026-10-01T10:00:00Z', revisada_en: null }]
  const nombre = (x) => x.raiz.busca(n => n.getAttribute('id') === 'nombre-estrategia')
  const abre = async (apiX, o = {}) => { b = base([prueba()], { tesis, ...o }); const a = []; const x = D.monta(h(BP, { estrategias: [fila], visible: true, apiFetch: apiX, vistaInicial: { editor: fila }, onAbrirTesis: id => a.push(id), onGuardada: () => {} }), RDC); await D.espera(LARGO); x.abiertas = a; return x }
  m = await abre(servidor())
  ok(!!q(m, 'data-enlace-tesis', 7), 'el paso 1 enseña su tesis')
  D.pulsa(q(m, 'data-enlace-tesis', 7)); await D.espera(10)
  ok(m.abiertas.join() === '7' && !q(m, 'data-pregunta', 'sin-guardar'), 'sin cambios: va a la tesis, sin preguntar'); m.quita(); await D.espera(5)

  m = await abre(servidor()); D.escribe(nombre(m), 'Otro'); await D.espera(10)
  D.pulsa(q(m, 'data-enlace-tesis', 7)); await D.espera(10)
  const ven = q(m, 'data-pregunta', 'sin-guardar')
  ok(!!ven && m.abiertas.length === 0 && ven.textContent.includes('Tienes cambios sin guardar en «Otro»') && !!q(m, 'data-salida', 'guardar') && !!q(m, 'data-salida', 'salir') && !!q(m, 'data-salida', 'cancelar'), 'con cambios: la ventana propia, Guardar / Salir sin guardar / Cancelar, y no se va')
  D.pulsa(q(m, 'data-salida', 'cancelar')); await D.espera(10)
  ok(!q(m, 'data-pregunta', 'sin-guardar') && m.abiertas.length === 0 && nombre(m).value === 'Otro', '«Cancelar»: sigue ahí, con lo escrito')
  D.pulsa(q(m, 'data-enlace-tesis', 7)); await D.espera(10); D.pulsa(q(m, 'data-salida', 'salir')); await D.espera(LARGO)
  ok(m.abiertas.join() === '7' && nombre(m).value === 'Mi EMA', '«Salir sin guardar»: va a la tesis y vuelve a lo guardado'); m.quita(); await D.espera(5)

  api = servidor(); m = await abre(api); D.escribe(nombre(m), 'Otro'); await D.espera(10)
  D.pulsa(q(m, 'data-enlace-tesis', 7)); await D.espera(10); D.pulsa(q(m, 'data-salida', 'guardar')); await D.espera(LARGO)
  ok(api.llamadas.length === 1 && api.llamadas[0].metodo === 'PUT' && api.llamadas[0].cuerpo.name === 'Otro' && m.abiertas.join() === '7', '«Guardar» (solo el nombre): PUT sobre la misma y va a la tesis'); m.quita(); await D.espera(5)

  api = servidor({ falla: true }); m = await abre(api); D.escribe(nombre(m), 'Otro'); await D.espera(10)
  D.pulsa(q(m, 'data-enlace-tesis', 7)); await D.espera(10); D.pulsa(q(m, 'data-salida', 'guardar')); await D.espera(LARGO)
  ok(m.abiertas.length === 0 && q(m, 'data-pregunta', 'sin-guardar')?.textContent.includes('falla la base'), 'si «Guardar» falla: lo dice, sigue la ventana y no se va'); m.quita(); await D.espera(5)

  // ── 4 · La guía ──
  const { GUIA } = require(R + '/lib/builder/ayuda.js'), texto = JSON.stringify(GUIA)
  for (const x of ['laboratorio', 'Laboratorio', 'lote', 'Nasdaq', 'sesgos', 'QQQ', 'P5–P95', 'No llega', 'misma duración', '500 copias']) ok(!texto.includes(x), `la guía no habla de «${x}»`)
  for (const x of ['1.000 copias', '200 mercados ficticios', 'bloques de 20', 'versión 2', '2016–2020', '2021–2025', 'menos de 30 operaciones', 'pasó por suerte', 'Sin veredicto', 'Ver en velas']) ok(texto.includes(x), `la guía dice «${x}»`)
  ok(GUIA.every(g => g.titulo && g.parrafos.length), 'cada apartado con su texto')
  const G = D.monta(h(require(R + '/components/BuilderGuia.js').default, { onVolver: () => {} }), RDC); await D.espera(5)
  ok(G.raiz.conAtributo('data-guia').length === GUIA.length && !G.raiz.textContent.includes('laboratorio'), `la pantalla de la guía: ${GUIA.length} apartados, sin laboratorios`); G.quita()

  console.log(fallos ? `version-paso2: ${fallos} fallos` : 'version-paso2: todas bien')
  process.exit(fallos ? 1 : 0)
})().catch(e => { console.log('✗', e.stack || e.message || e); process.exit(1) })
