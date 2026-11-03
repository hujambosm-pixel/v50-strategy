// scripts/comprobaciones/tesis-enlaces.js — «Relacionado» en los dos sentidos (docs/tesis.md): desde una estrategia o un plan, sus tesis. El Builder y la pantalla Tesis MONTADOS (domFalso.js, con la base simulada): 0, 1 y varias tesis; tesis borrada; plan de una pestaña sin guardar; la guardia de cambios sin guardar. Las corre comunes.sh. Termina en 0 si todo va bien.
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://falso.invalid'; process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'clave-falsa-de-la-prueba'
const path = require('path')
const C0 = require('./cargador'), R = C0.RAIZ, D = require('./domFalso')
let fallos = 0
const ok = (c, t) => { console.log(`${c ? 'OK  ' : 'MAL '} ${t}`); if (!c) fallos++ }
const EMA = { tipo: 'editor', motor: 1, formato: 1, nombre: 'EMA2', stops: [{ id: 'inicial', pct: 8, tipo: 'porcentaje', motivo: 'stop' }],
  entrada: { orden: { tipo: 'apertura' }, senal: { c: 'cruza', de: { c: 'precioVsMedia', p: { lado: 'encima', tipo: 'EMA', periodo: '$ema' } } } },
  salidas: [{ si: { c: 'cruza', de: { c: 'precioVsMedia', p: { lado: 'debajo', tipo: 'EMA', periodo: '$ema' } } }, tipo: 'condicion', motivo: 'cruce_bajista', precio: 'apertura' }],
  parametros: { lista: [{ max: 400, min: 2, paso: 1, tipo: 'entero', nombre: 'ema', defecto: 20, ventana: true, descripcion: 'Periodo de la EMA' }], version: 1, restricciones: [] } }

;(async () => {
  D.pon(); await C0.prepara(); C0.registra(R)
  const React = require(path.join(R, 'node_modules', 'react')), RDC = require(path.join(R, 'node_modules', 'react-dom', 'client')), { renderToString } = require(path.join(R, 'node_modules', 'react-dom', 'server'))
  const h = React.createElement
  const BP = require(R + '/components/BuilderPanel.js').default, TP = require(R + '/components/TesisPanel.js').default, Pa = require(R + '/lib/builder/planPantalla.js'), T = require(R + '/lib/tesis.js')
  const est = (id, name) => ({ id, name, definition: EMA, params: { ema: 2 } })
  const ests = [est('e0', 'Sin tesis'), est('e1', 'Con una'), est('e2', 'Con dos')]
  const fila = (id, nombre, e) => ({ id, nombre, huella: 'h', created_at: '2026-10-01T10:00:00Z', updated_at: '2026-10-02T10:00:00Z', plan: Pa.planDe({ ...Pa.AJUSTES_PLAN, ocioso: 'GLD' }, e, nombre) })
  const PLANES = [fila(10, 'Plan sin tesis', ests[0]), fila(11, 'Plan con una', ests[1]), fila(12, 'Plan con dos', ests[2])]
  const tesis = (id, titulo, relacionados, dias = id) => ({ id, titulo, relacionados, created_at: '2026-10-01T10:00:00Z', updated_at: '2026-10-01T10:00:00Z', revisada_en: new Date(Date.UTC(2026, 9, dias)).toISOString(), texto: '', estado: 'idea' })
  const TESIS = [
    tesis(1, 'Primera', [{ tipo: 'estrategia', id: 'e1' }, { tipo: 'plan', id: '11' }, { tipo: 'estrategia', id: 'e2' }, { tipo: 'plan', id: '12' }]),
    tesis(2, 'Segunda', [{ tipo: 'estrategia', id: 'e2' }, { tipo: 'plan', id: '12' }]),
    tesis(3, 'Enlaza cosas borradas', [{ tipo: 'estrategia', id: 'borrada' }, { tipo: 'plan', id: '999' }]),
  ]
  // ── Piezas puras ──
  ok(T.tesisDe(TESIS, 'estrategia', 'e0').length === 0, '0 tesis: ninguna')
  ok(T.tesisDe(TESIS, 'estrategia', 'e1').map(t => t.id).join() === '1', '1 tesis: esa')
  ok(T.tesisDe(TESIS, 'estrategia', 'e2').map(t => t.id).join() === '2,1', 'varias: la más reciente primero')
  ok(T.tesisDe(TESIS, 'plan', 11).map(t => t.id).join() === '1', 'un plan por su número, aunque el enlace lo guarde en texto')
  ok(T.tesisDe(TESIS, 'plan', null).length === 0, 'un plan sin guardar (sin id): ninguna')
  ok(T.tesisDe(TESIS, 'estrategia', '11').length === 0 && T.tesisDe(TESIS, 'plan', 'e1').length === 0, 'estrategia y plan no se mezclan aunque coincida el número')
  ok(T.tesisDe([{ id: 9, titulo: 'x', relacionados: null }, { id: 8, titulo: 'y' }], 'plan', 1).length === 0 && T.tesisDe(null, 'plan', 1).length === 0, 'sin relacionados o sin tesis: nada, sin error')

  const J = (x, status = 200) => ({ ok: true, status, json: async () => x, text: async () => JSON.stringify(x) })
  const base = (lista = TESIS) => { const b = { tesis: lista, leidas: 0, escrituras: 0 }
    globalThis.fetch = async (u, o = {}) => {
      const s = String(u), m = o.method || 'GET'
      if (m !== 'GET' && !s.includes('builder_pestanas')) b.escrituras++
      if (s.includes('builder_pestanas')) return m === 'POST' ? J(null, 201) : J([{ planes: [10, 11, 12] }])
      if (s.includes('planes_inversion')) return J(PLANES)
      if (s.includes('tesis_inversion')) { b.leidas++; return J(b.tesis) }
      return J([])
    }
    return b }
  const api = async () => ({ ok: false, status: 500, json: async () => ({ error: 'sin motor en esta prueba' }) })
  const props = (o = {}) => ({ estrategias: ests, visible: true, apiFetch: api, abrir: null, ...o })
  const LARGO = 120
  const enlace = (m, id) => m.raiz.busca(n => n.getAttribute('data-enlace-tesis') === String(id))
  const varias = (m) => m.raiz.busca(n => n.getAttribute('data-enlace-tesis-varias') != null)

  // ── «Mi trabajo»: la columna «Tesis» ──
  let b = base(), abiertas = [], m = D.monta(h(BP, props({ onAbrirTesis: id => abiertas.push(id) })), RDC); await D.espera(LARGO)
  ok(m.raiz.todos(n => n.nodeName === 'TH').some(n => n.textContent.includes('Tesis')), 'Mi trabajo: columna «Tesis»')
  const celda = (id) => m.raiz.busca(n => n.getAttribute('data-fila-estrategia') === id).todos(n => n.getAttribute('data-celda-tesis') != null)[0]
  ok(celda('e0').textContent === '', 'sin tesis: vacía')
  ok(celda('e1').textContent === 'Primera', `una: su título (${celda('e1').textContent})`)
  ok(celda('e2').textContent.includes('2 tesis') && celda('e2').todos(n => n.getAttribute('data-enlace-tesis-varias') != null)[0].getAttribute('title') === 'Segunda · Primera', 'varias: «N tesis», con los títulos en el tooltip')
  D.pulsa(celda('e1').todos(n => n.getAttribute('data-enlace-tesis') === '1')[0]); ok(abiertas.join() === '1', 'pulsar una: abre esa tesis')
  D.pulsa(celda('e2').todos(n => n.getAttribute('data-enlace-tesis-varias') != null)[0]); await D.espera(5)
  ok(m.raiz.conAtributo('data-menu', 'tesis').length === 1, 'pulsar «N tesis»: la lista')
  D.pulsa(m.raiz.conAtributo('data-menu', 'tesis')[0].todos(n => n.getAttribute('data-enlace-tesis') === '2')[0]); await D.espera(5)
  ok(abiertas.join() === '1,2' && !m.raiz.conAtributo('data-menu', 'tesis').length, 'elegir en la lista: abre esa y se cierra')
  ok(b.escrituras === 0, 'mirar y pulsar no escribe nada en la base')
  m.quita(); await D.espera(5)

  // ── Pasos 1 y 2: en la cabecera, a la derecha de la ruta ──
  for (const [t, vistaInicial] of [['paso 1', e => ({ editor: e })], ['paso 2', e => ({ azar: { estrategiaId: e.id } })]]) {
    for (const [e, una, n] of [[ests[0], null, 0], [ests[1], 1, 1], [ests[2], null, 2]]) {
      abiertas = []; b = base(); m = D.monta(h(BP, props({ vistaInicial: vistaInicial(e), onAbrirTesis: id => abiertas.push(id), cargaVelas: null })), RDC); await D.espera(LARGO)
      const cab = m.raiz.busca(x => x.getAttribute('data-cabecera-b') != null)
      if (!cab) { ok(false, `${t}: sin cabecera`); m.quita(); continue }
      const tx = cab.textContent
      if (n === 0) ok(!tx.includes('Tesis'), `${t}, 0 tesis: nada`)
      if (n === 1) { ok(tx.includes('💡 Primera ›') && !tx.includes('Tesis:'), `${t}, 1 tesis: «💡 Primera ›»`); ok(enlace(m, una).getAttribute('title') === 'Abrir la tesis', `${t}, 1 tesis: tooltip`); D.pulsa(enlace(m, una)); ok(abiertas.join() === '1', `${t}, 1 tesis: pulsar abre`) }
      if (n === 2) { ok(tx.includes('💡 Tesis (2) ▾'), `${t}, varias: «💡 Tesis (2) ▾»`); ok(varias(m).getAttribute('title') === 'Abrir la tesis', `${t}, varias: tooltip`); D.pulsa(varias(m)); await D.espera(5); D.pulsa(enlace(m, 2)); await D.espera(5); ok(abiertas.join() === '2', `${t}, varias: elegir abre`) }
      m.quita(); await D.espera(5)
    }
  }

  // ── Paso 3: según el plan de la pestaña activa ──
  const avisos = (x) => x.raiz.busca(n => n.getAttribute('data-avisos') != null)?.textContent || ''
  for (const [planId, esperado] of [[10, null], [11, '💡 Primera ›'], [12, '💡 Tesis (2) ▾']]) {
    b = base(); m = D.monta(h(BP, props({ abrir: { planId, n: 1 }, onAbrirTesis: () => {} })), RDC); await D.espera(LARGO)
    ok(esperado ? avisos(m).includes(esperado) : !avisos(m).includes('Tesis'), `paso 3, plan ${planId}: ${esperado || 'sin enlace'}`)
    if (planId === 11) {
      const antes = avisos(m); ok(antes.indexOf('💡 Primera') > antes.indexOf('Probarla ahora') && antes.includes('Probarla ahora'), 'va junto a «Sin prueba · Probarla ahora»')
    }
    m.quita(); await D.espera(5)
  }
  // Una pestaña sin guardar, directamente: abrir la estrategia sin planes guardados.
  b = base(); globalThis.fetch = (f0 => async (u, o) => String(u).includes('planes_inversion') ? J([]) : f0(u, o))(globalThis.fetch)
  m = D.monta(h(BP, props({ estrategias: [ests[1]], vistaInicial: { plan: { estrategiaId: 'e1' } }, onAbrirTesis: () => {} })), RDC); await D.espera(LARGO)
  ok(!!m.raiz.busca(n => n.getAttribute('data-aviso') === 'sin-guardar') && !avisos(m).includes('Tesis'), 'plan de una pestaña sin guardar: sin enlace, aunque su estrategia tenga tesis')
  m.quita(); await D.espera(5)

  // ── La guardia de cambios sin guardar, con la misma página de pages/index.js ──
  const Sustituto = ({ valor }) => h('div', { 'data-texto': '' }, valor)
  const ctxTP = () => ({ url: 'https://falso.invalid', headers: {}, fetch: (...a) => globalThis.fetch(...a) })
  function Pagina({ inicial, onVista }) {
    const [panel, setPanel] = React.useState(inicial), [pedida, setPedida] = React.useState(null), salida = React.useRef(null)
    const abrirTesis = (id) => { const seguir = () => { setPedida(Number(id)); setPanel('tesis') }; if (panel === 'builder' && salida.current?.(seguir)) return; seguir() }
    return h('div', null,
      h('div', { 'data-builder': panel }, h(BP, props({ visible: panel === 'builder', salida, abrir: { planId: 11, n: 1 }, onAbrirTesis: abrirTesis }))),
      panel === 'tesis' && h(TP, { estrategias: ests, abrirId: pedida, onAbierta: () => setPedida(null), deps: { ctx: ctxTP(), Editor: Sustituto } }))
  }
  b = base(); m = D.monta(h(Pagina, { inicial: 'builder' }), RDC); await D.espera(LARGO)
  D.pulsa(enlace(m, 1)); await D.espera(LARGO)
  ok(m.raiz.busca(n => n.getAttribute('data-builder') != null).getAttribute('data-builder') === 'tesis', 'sin cambios: pasa a la pestaña Tesis')
  ok(m.raiz.busca(n => n.getAttribute('data-item') === '1')?.getAttribute('aria-current') === 'true', 'con esa tesis abierta, no con la más reciente')
  m.quita(); await D.espera(5)
  b = base(); m = D.monta(h(Pagina, { inicial: 'builder' }), RDC); await D.espera(LARGO)
  const cap = m.raiz.busca(n => n.nodeName === 'INPUT' && n.getAttribute('aria-label') === 'Dinero inicial')
  D.propsDe(cap).onFocus(); D.escribe(cap, '25000'); await D.espera(5); D.propsDe(cap).onBlur(); await D.espera(5)
  D.pulsa(enlace(m, 1)); await D.espera(10)
  ok(m.raiz.conAtributo('data-pregunta', 'sin-guardar').length === 1 && m.raiz.busca(n => n.getAttribute('data-builder') != null).getAttribute('data-builder') === 'builder', 'con cambios sin guardar: pregunta y no se va')
  D.pulsa(m.raiz.busca(n => n.getAttribute('data-salida') === 'cancelar')); await D.espera(10)
  ok(m.raiz.busca(n => n.getAttribute('data-builder') != null).getAttribute('data-builder') === 'builder', '«Cancelar»: sigue en el plan')
  D.pulsa(enlace(m, 1)); await D.espera(10); D.pulsa(m.raiz.busca(n => n.getAttribute('data-salida') === 'salir')); await D.espera(LARGO)
  ok(m.raiz.busca(n => n.getAttribute('data-builder') != null).getAttribute('data-builder') === 'tesis' && m.raiz.busca(n => n.getAttribute('data-item') === '1')?.getAttribute('aria-current') === 'true', '«Salir sin guardar»: a esa tesis')
  m.quita(); await D.espera(5)

  // ── La pantalla Tesis: la pedida, una ya borrada, y sin pedir ninguna ──
  const montaTP = (abrirId, onAbierta) => D.monta(h(TP, { estrategias: ests, abrirId, onAbierta, deps: { ctx: ctxTP(), Editor: Sustituto } }), RDC)
  const actual = (x) => x.raiz.busca(n => n.getAttribute('data-item') != null && n.getAttribute('aria-current') === 'true')?.getAttribute('data-item')
  let at = 0; b = base(); m = montaTP(2, () => at++); await D.espera(LARGO)
  ok(actual(m) === '2' && at === 1, `la pedida (${actual(m)}), y avisa de que ya está atendida`); ok(!m.raiz.busca(n => n.getAttribute('data-fallo') != null), 'sin aviso de fallo'); m.quita(); await D.espera(5)
  at = 0; b = base(); m = montaTP(99, () => at++); await D.espera(LARGO)
  ok(m.raiz.busca(n => n.getAttribute('data-fallo') != null)?.textContent.includes('ya no existe') && actual(m) === '3' && at === 1, 'tesis borrada mientras tanto: lo dice y abre la más reciente'); m.quita(); await D.espera(5)
  at = 0; b = base([]); m = montaTP(99, () => at++); await D.espera(LARGO)
  ok(m.raiz.busca(n => n.getAttribute('data-fallo') != null)?.textContent.includes('ya no existe') && at === 1, 'borrada y sin ninguna más: lo dice, sin error'); m.quita(); await D.espera(5)
  at = 0; b = base(); m = montaTP(null, () => at++); await D.espera(LARGO)
  ok(actual(m) === '3' && at === 0 && !m.raiz.busca(n => n.getAttribute('data-fallo') != null), 'sin pedir ninguna: la más reciente, como siempre'); m.quita(); await D.espera(5)

  // ── «Relacionado» en la línea de estado, a la derecha ──
  const t1 = TESIS[0], html = renderToString(h(TP, { estrategias: ests, onAbrirEstrategia: () => {}, onAbrirPlan: () => {}, deps: { ctx: null, Editor: Sustituto }, inicial: { tesis: TESIS, planes: PLANES, abierta: 1, borrador: { titulo: t1.titulo, texto: 'hola', estado: 'idea', relacionados: t1.relacionados } } }))
  const pos = (s) => html.indexOf(s)
  ok(pos('data-fechas') < pos('data-relacionado') && pos('data-revisada') < pos('data-relacionado') && pos('data-relacionado') < pos('data-texto'), 'el orden: título, estado y revisión, «Relacionado», editor')
  ok(/data-revisada[^>]*>[^<]*<\/button><div data-relacionado="true" style="position:relative;margin-left:auto;min-width:0;max-width:100%"><div style="[^"]*flex-wrap:wrap[^"]*justify-content:flex-end/.test(html), 'en la MISMA línea, pegado a la derecha; si no cabe, baja alineado a la derecha')
  ok(pos('data-ficha="estrategia-e1"') < pos('data-anadir') && pos('data-anadir') < pos('data-texto'), 'las fichas y «+ Añadir estrategia o plan» al final de la línea')

  const panelCon = (rel) => renderToString(h(TP, { estrategias: ests, onAbrirEstrategia: () => {}, onAbrirPlan: () => {}, deps: { ctx: null, Editor: Sustituto }, inicial: { tesis: [{ ...t1, relacionados: rel }], planes: PLANES, abierta: 1, borrador: { titulo: t1.titulo, texto: 'hola', estado: 'idea', relacionados: rel }, anadiendo: true } }))
  for (const [rel, nombre] of [[[], '0 fichas'], [[{ tipo: 'estrategia', id: 'e1' }], '1 ficha'], [[{ tipo: 'estrategia', id: 'e1' }, { tipo: 'estrategia', id: 'e2' }, { tipo: 'plan', id: '10' }, { tipo: 'plan', id: '11' }], 'varias fichas']]) {
    const x = panelCon(rel); ok((x.match(/data-ficha=/g) || []).length === rel.length && x.indexOf('data-revisada') < x.indexOf('data-relacionado') && x.indexOf('data-anadir') < x.indexOf('data-texto') && x.includes('position:absolute;top:100%;right:0'), `${nombre}: mismas piezas y la lista de elegir, anclada a la derecha`)
  }
  const fuente = (f) => require('fs').readFileSync(path.join(R, 'components', f), 'utf8')
  ok(fuente('TesisEditor.js').includes('height: calc(100vh - 380px)') && fuente('TesisPanel.js').includes("height: 'calc(100vh - 380px)'") && !fuente('TesisEditor.js').includes('424px'), 'el editor gana el alto de la línea que ya no está')

  // ── El contador de enlaces de la lista ──
  const CR = (rel, e = ests, p = PLANES) => T.cuentaRelacionados(rel, e, p)
  for (const [rel, n, pista] of [
    [[], 0, ''], [null, 0, ''], [[{ tipo: 'plan', id: 10 }], 1, '1 plan relacionado'], [[{ tipo: 'estrategia', id: 'e1' }], 1, '1 estrategia relacionada'],
    [[{ tipo: 'estrategia', id: 'e1' }, { tipo: 'estrategia', id: 'e2' }], 2, '2 estrategias relacionadas'], [[{ tipo: 'plan', id: 10 }, { tipo: 'plan', id: 11 }], 2, '2 planes relacionados'],
    [[{ tipo: 'estrategia', id: 'e1' }, { tipo: 'plan', id: 10 }], 2, '1 estrategia y 1 plan relacionados'], [[{ tipo: 'estrategia', id: 'e1' }, { tipo: 'estrategia', id: 'e2' }, { tipo: 'plan', id: 10 }], 3, '2 estrategias y 1 plan relacionados'],
    [[{ tipo: 'estrategia', id: 'borrada' }, { tipo: 'plan', id: 9999 }, { tipo: 'otro', id: 'e1' }, null], 0, ''], [[{ tipo: 'estrategia', id: 'borrada' }, { tipo: 'plan', id: 10 }], 1, '1 plan relacionado']]) {
    const c = CR(rel); ok(c.total === n && c.pista === pista, `${JSON.stringify(rel)}: ${n}, «${pista}» (${c.total}, «${c.pista}»)`)
  }
  const tesisL = [tesis(1, 'Sin', []), tesis(2, 'Una', [{ tipo: 'plan', id: '10' }]), tesis(3, 'Varias', [{ tipo: 'estrategia', id: 'e1' }, { tipo: 'estrategia', id: 'e2' }, { tipo: 'plan', id: '10' }]), tesis(4, 'Borrado', [{ tipo: 'plan', id: '9999' }])]
  const conta = (x, id) => x.raiz.busca(n => n.getAttribute('data-item') === String(id))?.todos(n => n.getAttribute('data-enlaces') != null)[0] || null
  const clipYEnlace = renderToString(h(TP, { estrategias: ests, deps: { ctx: null, Editor: Sustituto }, inicial: { tesis: tesisL, planes: PLANES, resumen: { bytes: 0, porTesis: { 2: { adjuntos: 1, imagenes: 0, bytes: 1 } } } } }))
  ok(clipYEnlace.indexOf('data-clip="1"') > 0 && clipYEnlace.indexOf('data-clip="1"') < clipYEnlace.indexOf('data-enlaces="1"'), 'junto al clip, detrás')
  const estiloDe = (a) => (clipYEnlace.slice(clipYEnlace.indexOf(a)).match(/style="([^"]*)"/) || [])[1]
  ok(estiloDe('data-clip="1"') === estiloDe('data-enlaces="1"'), 'mismo tamaño y color que el clip')
  b = base(tesisL); m = D.monta(h(TP, { estrategias: ests, deps: { ctx: ctxTP(), Editor: Sustituto }, inicial: { tesis: tesisL, planes: PLANES, abierta: 3, borrador: { titulo: 'Varias', texto: '', estado: 'idea', relacionados: tesisL[2].relacionados }, resumen: { bytes: 0, porTesis: {} }, archivos: [] } }), RDC); await D.espera(LARGO)
  ok(!conta(m, 1) && conta(m, 2).getAttribute('data-enlaces') === '1' && conta(m, 2).getAttribute('title') === '1 plan relacionado', 'sin enlaces, nada; con 1, «1 plan relacionado»')
  ok(conta(m, 3).getAttribute('data-enlaces') === '3' && conta(m, 3).getAttribute('title') === '2 estrategias y 1 plan relacionados', 'con varios, «2 estrategias y 1 plan relacionados»')
  ok(!conta(m, 4), 'un enlace a algo borrado no cuenta')
  const escriturasL = b.escrituras
  D.pulsa(m.raiz.busca(n => n.getAttribute('data-ficha') === 'plan-10').todos(n => (n.getAttribute('aria-label') || '').startsWith('Quitar'))[0]); await D.espera(5)
  ok(conta(m, 3).getAttribute('data-enlaces') === '2' && conta(m, 3).getAttribute('title') === '2 estrategias relacionadas', 'al quitar un enlace baja sin recargar')
  D.pulsa(m.raiz.busca(n => n.getAttribute('data-anadir') != null)); await D.espera(5)
  D.pulsa(m.raiz.busca(n => n.getAttribute('data-elegir') != null).todos(n => n.nodeName === 'BUTTON' && n.textContent === PLANES[1].nombre)[0]); await D.espera(5)
  ok(conta(m, 3).getAttribute('data-enlaces') === '3' && conta(m, 3).getAttribute('title') === '2 estrategias y 1 plan relacionados', 'al añadir un enlace sube sin recargar')
  ok(conta(m, 2).getAttribute('data-enlaces') === '1' && b.escrituras === escriturasL, 'las otras no cambian y el contador no escribe en la base')
  D.pulsa(m.raiz.busca(n => n.getAttribute('data-descartar') != null)); await D.espera(LARGO)
  ok(conta(m, 3).getAttribute('data-enlaces') === '3' && m.raiz.conAtributo('data-ficha', 'plan-10').length === 1, 'descartar: vuelve a lo guardado')
  m.quita(); await D.espera(5)
  const conNueva = renderToString(h(TP, { estrategias: ests, deps: { ctx: null, Editor: Sustituto }, inicial: { tesis: tesisL, planes: PLANES, nueva: true, borrador: { titulo: 'Nueva tesis', texto: '', estado: 'idea', relacionados: [{ tipo: 'estrategia', id: 'e1' }] } } }))
  ok(conNueva.indexOf('data-enlaces="1"') > conNueva.indexOf('data-item="nueva"') && conNueva.indexOf('data-enlaces="1"') < conNueva.indexOf('data-item="4"'), 'la nueva sin guardar también lo enseña')

  console.log(fallos ? `${fallos} FALLOS` : 'tesis-enlaces: todo bien')
  process.exit(fallos ? 1 : 0)
})().catch(e => { console.log('✗', e.stack || e.message || e); process.exit(1) })
