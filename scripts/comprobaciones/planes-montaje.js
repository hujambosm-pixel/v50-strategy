// scripts/comprobaciones/planes-montaje.js — la pantalla del paso 3 MONTADA de verdad en Node (domFalso.js: con estado y efectos, con la base y /api/plan simuladas; docs/builder.md, §56). Las corre comunes.sh. Termina en 0 si todo va bien.
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
  const React = require(path.join(R, 'node_modules', 'react')), RDC = require(path.join(R, 'node_modules', 'react-dom', 'client'))
  const h = React.createElement
  const BP = require(R + '/components/BuilderPanel.js').default, BPlan = require(R + '/components/BuilderPlan.js').default, Pa = require(R + '/lib/builder/planPantalla.js'), Pl = require(R + '/lib/planes/plan.js'), Lt = require(R + '/lib/lotesLab.js')
  const est = (id, name) => ({ id, name, definition: EMA, params: { ema: 2 } })
  const ests = [est('e4', 'Copia editor 23'), est('e7', 'Prueba editor EMA20'), est('e6', 'SuperTrend 10/3')]
  // Las de Sergi (03/11/2026): el plan 4 es el primero Y el cambiado más recientemente, así que si se pierde el plan pedido sale el 4 (lo que vio en la pantalla).
  const fila = (id, nombre, e, cuando) => ({ id, nombre, huella: 'h', created_at: '2026-10-01T10:00:00Z', updated_at: cuando, plan: Pa.planDe({ ...Pa.AJUSTES_PLAN, ocioso: 'GLD' }, e, nombre) })
  const PLANES = [fila(4, 'Copia editor 23 / gold', ests[0], '2026-11-01T23:20:21Z'), fila(6, 'SuperTrend 10/3 / gold', ests[2], '2026-10-31T18:20:40Z'), fila(7, 'Prueba editor EMA20', ests[1], '2026-11-01T23:18:57Z')]
  // La base simulada. tarda: los ms de cada lectura de la base (la carrera entre leer los planes y leer las pestañas).
  const base = (pestanas, tarda = {}) => {
    const b = { pestanas, escritas: [] }
    const J = (x, status = 200) => ({ ok: true, status, json: async () => x, text: async () => JSON.stringify(x) })
    globalThis.fetch = async (u, o = {}) => {
      const s = String(u), m = o.method || 'GET'
      if (s.includes('builder_pestanas')) { await D.espera(tarda.pestanas || 0); if (m === 'POST') { b.pestanas = JSON.parse(o.body).planes; b.escritas.push(b.pestanas); return J(null, 201) } return J(b.pestanas == null ? [] : [{ planes: b.pestanas }]) }
      if (s.includes('planes_inversion')) { await D.espera(tarda.planes || 0); return J(PLANES) }
      return J([])
    }
    return b
  }
  const api = async () => ({ ok: false, status: 500, json: async () => ({ error: 'sin motor en esta prueba' }) })
  const vista = (m) => ({ activa: m.raiz.busca(n => n.getAttribute('aria-selected') === 'true')?.getAttribute('data-pestana') ?? null, ruta: m.raiz.conAtributo('data-ruta', 'estrategia')[0]?.textContent ?? null, pestanas: m.raiz.conAtributo('data-pestana').map(n => n.getAttribute('data-pestana')).join() })
  const props = (o = {}) => ({ estrategias: ests, visible: true, apiFetch: api, abrir: null, ...o })
  const LARGO = 120

  // ── 1 · «Abrir» un plan desde una tesis (§55): la pestaña activa y la ruta ──
  const debeSer6 = (m, t) => { const v = vista(m); ok(v.activa === 'g6' && v.ruta === 'SuperTrend 10/3', `${t}: activa ${v.activa}, ruta «${v.ruta}»`); return v }
  // Builder sin montar: se monta ya con el plan pedido.
  let b = base([4, 7, 6]), m = D.monta(h(BP, props({ abrir: { planId: 6, n: 1 } })), RDC)
  await D.espera(LARGO); let v = debeSer6(m, 'sin montar, plan abierto y no primero')
  ok(v.pestanas === 'g4,g7,g6', `las pestañas, en su orden (${v.pestanas})`); m.quita(); await D.espera(5)
  b = base([4, 7]); m = D.monta(h(BP, props({ abrir: { planId: 6, n: 2 } })), RDC)
  await D.espera(LARGO); v = debeSer6(m, 'sin montar, plan no abierto')
  ok(v.pestanas === 'g4,g7,g6' && b.pestanas.join() === '4,7,6', `se añade al final y se guarda (${b.pestanas})`); m.quita(); await D.espera(5)
  // Builder ya montado: primero el paso 3 por su barra (sin pedir plan), luego se oculta (la tesis) y se pide.
  const hastaPaso3 = async () => {
    const x = D.monta(h(BP, props()), RDC); await D.espera(30)
    D.pulsa(x.raiz.busca(n => n.getAttribute('data-paso') === '3')); await D.espera(LARGO)
    return x
  }
  for (const [t, pest, tarda] of [['plan abierto y no primero', [4, 7, 6], {}], ['plan no abierto', [4, 7], {}], ['las pestañas se leen después que los planes', [4, 7, 6], { pestanas: 40 }], ['los planes se leen después que las pestañas', [4, 7, 6], { planes: 40 }]]) {
    b = base(pest, tarda); m = await hastaPaso3()
    ok(vista(m).activa === 'g4', `montado (${t}): sin pedir nada, el más reciente, g4`)
    m.pinta(h(BP, props({ visible: false }))); await D.espera(5)
    m.pinta(h(BP, props({ abrir: { planId: 6, n: 3 } }))); await D.espera(LARGO + 40)
    debeSer6(m, `montado, ${t}`)
    ok(vista(m).pestanas === 'g4,g7,g6', `  con todas las pestañas (${vista(m).pestanas})`); m.quita(); await D.espera(5)
  }
  // Un plan que ya no existe: el aviso, y lo de siempre.
  b = base([4, 7, 6]); m = D.monta(h(BP, props({ abrir: { planId: 99, n: 4 } })), RDC); await D.espera(LARGO)
  ok(vista(m).activa === 'g4' && m.raiz.conAtributo('data-aviso', 'plan-no-existe').length === 1, 'un plan borrado: lo avisa y abre lo de siempre'); m.quita(); await D.espera(5)
  // Toda la cadena, con la ficha de verdad de la tesis y la misma página de pages/index.js (Builder oculto; pulsar «Abrir»).
  const TP = require(R + '/components/TesisPanel.js').default
  const Sustituto = ({ valor }) => h('div', { 'data-texto': '' }, valor)
  const tesisDe = (rel) => { const t = { id: 22, titulo: 'Prueba adjuntos', texto: '', estado: 'estudio', relacionados: rel, created_at: '2026-11-01T10:00:00Z', updated_at: '2026-11-01T10:00:00Z' }; return { tesis: [t], abierta: 22, borrador: { titulo: t.titulo, texto: '', estado: 'estudio', relacionados: rel }, planes: PLANES.map(p => ({ id: p.id, nombre: p.nombre })) } }
  function Pagina({ inicial }) {
    const [panel, setPanel] = React.useState(inicial.panel), [abrir, setAbrir] = React.useState(null), [visto, setVisto] = React.useState(inicial.panel === 'builder')
    React.useEffect(() => { if (panel === 'builder') setVisto(true) }, [panel])
    return h('div', null,
      (visto || panel === 'builder') && h('div', { 'data-builder': panel === 'builder' ? 'visible' : 'oculto' }, h(BP, props({ visible: panel === 'builder', abrir }))),
      panel === 'tesis' && h(TP, { estrategias: ests, deps: { ctx: { url: 'https://falso.invalid', headers: {}, fetch: globalThis.fetch }, Editor: Sustituto }, inicial: tesisDe(inicial.rel), onAbrirEstrategia: (s) => { setAbrir({ fila: { ...s }, n: Date.now() }); setPanel('builder') }, onAbrirPlan: (id) => { setAbrir({ planId: Number(id), n: Date.now() }); setPanel('builder') } }),
      panel !== 'tesis' && h('button', { 'data-a-tesis': '', onClick: () => setPanel('tesis') }, 'Tesis'))
  }
  b = base([4, 7, 6]); m = D.monta(h(Pagina, { inicial: { panel: 'tesis', rel: [{ tipo: 'plan', id: '6' }] } }), RDC); await D.espera(30)
  D.pulsa(m.raiz.busca(n => n.getAttribute('data-abrir-plan') === '6')); await D.espera(LARGO)
  debeSer6(m, 'la cadena entera, de la ficha «Plan» de la tesis, con el Builder sin montar'); m.quita(); await D.espera(5)
  b = base([4, 7, 6]); m = D.monta(h(Pagina, { inicial: { panel: 'builder', rel: [{ tipo: 'plan', id: '6' }] } }), RDC); await D.espera(30)
  D.pulsa(m.raiz.busca(n => n.getAttribute('data-paso') === '3')); await D.espera(LARGO)
  ok(vista(m).activa === 'g4', 'la cadena: el paso 3 abierto, g4 activa')
  D.pulsa(m.raiz.busca(n => n.getAttribute('data-a-tesis') != null)); await D.espera(10)
  D.pulsa(m.raiz.busca(n => n.getAttribute('data-abrir-plan') === '6')); await D.espera(LARGO)
  debeSer6(m, 'la cadena entera, con el Builder ya montado en el paso 3'); m.quita(); await D.espera(5)
  // La ficha de la ESTRATEGIA del mismo nombre va al paso 1, no a un plan (son dos cosas: «Estrategia · SuperTrend 10/3» y «Plan · SuperTrend 10/3 / gold»).
  b = base([4, 7, 6]); m = D.monta(h(Pagina, { inicial: { panel: 'tesis', rel: [{ tipo: 'estrategia', id: 'e6' }] } }), RDC); await D.espera(30)
  const fichaE = m.raiz.busca(n => n.getAttribute('data-ficha') === 'estrategia-e6')
  ok(!!fichaE && fichaE.textContent.includes('Estrategia · SuperTrend 10/3'), 'la ficha de una estrategia dice «Estrategia · …», y la de un plan, «Plan · …»')

  // ── 2 · Los campos de euros con punto de miles (§56) ──
  ok(Pa.textoEuros(10000) === '10.000' && Pa.textoEuros(1000) === '1.000' && Pa.textoEuros(300) === '300' && Pa.textoEuros(1234.5) === '1.234,5' && Pa.textoEuros(0.37) === '0,37' && Pa.textoEuros('') === '' && Pa.textoEuros(1234567) === '1.234.567', 'textoEuros, a mano: 10.000, 1.000, 300, 1.234,5, 0,37, vacío, 1.234.567')
  const r0 = PLANES[0]
  b = base([4]); m = D.monta(h(BPlan, { estrategias: ests, apiFetch: api, planId: 4 }), RDC); await D.espera(LARGO)
  const casilla = (t) => m.raiz.busca(n => n.nodeName === 'INPUT' && n.getAttribute('aria-label') === t)
  const cap = casilla('Dinero inicial'), apo = casilla('Aportación mensual')
  ok(cap.value === '10.000' && apo.value === '300', `se ven con punto de miles: «${cap.value}», «${apo.value}»`)
  ok(!m.raiz.busca(n => n.getAttribute('data-sucia') != null) && !m.raiz.busca(n => n.getAttribute('data-boton') === 'guardar-cambios'), 'solo con verlo, el plan guardado no tiene cambios')
  D.propsDe(cap).onFocus(); await D.espera(5)
  ok(cap.value === '10000', `al entrar en el campo, sin puntos: «${cap.value}»`)
  D.propsDe(cap).onBlur(); await D.espera(5)
  ok(cap.value === '10.000' && !m.raiz.busca(n => n.getAttribute('data-boton') === 'guardar-cambios'), 'entrar y salir sin escribir: igual y sin cambios')
  D.propsDe(cap).onFocus(); await D.espera(5)
  D.escribe(cap, '25000'); await D.espera(5)
  ok(cap.value === '25000' && !!m.raiz.busca(n => n.getAttribute('data-boton') === 'guardar-cambios'), 'al escribir, sin puntos y con cambios')
  D.propsDe(cap).onBlur(); await D.espera(5)
  ok(cap.value === '25.000', `al salir: «${cap.value}»`)
  D.propsDe(cap).onFocus(); await D.espera(5)
  D.escribe(cap, '10.5'); await D.espera(5)
  ok(cap.value === '10,5', `un punto tecleado sigue siendo coma (§51): «${cap.value}»`)
  D.escribe(cap, '10000'); await D.espera(5); D.propsDe(cap).onBlur(); await D.espera(5)
  ok(cap.value === '10.000' && !m.raiz.busca(n => n.getAttribute('data-boton') === 'guardar-cambios'), 'volver a 10000: ya no hay cambios')
  m.quita(); await D.espera(5)
  const ida = Pa.planDe(Pa.ajustesDe(r0.plan), r0.plan.piezas[0].estrategia, r0.nombre)
  ok(Lt.jsonCanonico(Pl.paraHuellaPlan(ida)) === Lt.jsonCanonico(Pl.paraHuellaPlan(r0.plan)) && await Pl.huellaPlan(ida) === await Pl.huellaPlan(r0.plan), 'ida y vuelta plan → ajustes → plan: la misma huella')

  // ── 3 · Las casillas del gráfico (§57): se ocultan y se recuerdan ──
  const dia = (f, n) => new Date(Date.parse(f + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10)
  const E = require(R + '/lib/planes/evalua.js'), fs2 = [...Array.from({ length: 11 }, (_, i) => dia('2021-01-01', i)), '2022-12-31']
  const PERIODO = [[100, 100, 100, 100], [100, 105, 100, 104], [105, 108, 104, 107], [107, 111, 106, 110], [110, 113, 109, 112], [112, 116, 111, 115], [115, 119, 114, 118], [118, 121, 117, 120], [120, 120, 112, 113], [114, 115, 113, 114], [114, 115, 113, 114], [114, 115, 113, 114]]
  const cal = Array.from({ length: 300 }, (_, i) => dia('2019-01-01', i)), todas = [...cal, ...fs2], vela = (date, [open, high, low, close]) => ({ date, open, high, low, close, volume: 1000 })
  const plano = todas.map(date => ({ date, open: 100, close: 100 }))
  const datos = { fechas: todas, qqq: plano, spy: plano, etf: todas.map(() => null), qqqVelas: plano, velas: { TEST: todas.map((f, i) => vela(f, i < 300 ? [100, 100, 100, 100] : PERIODO[i - 300])), OCI: todas.map(f => vela(f, [50, 50, 50, 50])) } }
  const calcula = async (plan) => { const ev = E.evaluaPlan(plan, datos, { detalle: true }), ej = Object.fromEntries(E.referenciasDe(plan).filter(x => ['OCIOSO_LIQUIDEZ', 'ACTIVO', 'QQQ', 'SPY'].includes(x.id)).map(x => [x.id, Pl.ejecutaPlan(x.plan, datos, { detalle: false })]))
    return { evaluacion: ev, curvas: Object.fromEntries(Object.entries(ej).map(([id, r]) => [id, { patrimonio: r.serie.map(x => x.patrimonio), vl: r.serie.map(x => x.vl) }])), ordenesReferencias: Object.fromEntries(Object.entries(ej).map(([id, r]) => [id, r.costes.ordenes])), huella: 'h' } }
  const montaPlan = () => D.monta(h(BPlan, { estrategias: [est('e', 'EMA2')], estrategiaId: 'e', apiFetch: api, deps: { ctx: null, calcula }, inicial: { planes: [], simbolos: ['TEST'], pruebas: [], huella: 'h', huellas: { e: 'h' }, ajustes: { activo: 'TEST', ocioso: 'OCI', capital: 10000, aportacion: 0, periodo: 'otras', desde: fs2[0], hasta: fs2[11], impuestos: 'ES-ahorro', comision: 0 } } }), RDC)
  const lineas = (x) => x.raiz.conAtributo('data-linea').map(n => n.getAttribute('data-linea')).sort().join()
  const marca = (x, k) => { const c = x.raiz.busca(n => n.getAttribute('data-casilla') === k); c.checked = !c.checked; D.propsDe(c).onChange({ target: c }) }
  localStorage.clear(); m = montaPlan(); await D.espera(800)
  ok(lineas(m) === 'activo,aportado,ociosoLiquidez,plan', `al entrar: ${lineas(m)}`)
  marca(m, 'spy'); await D.espera(5); marca(m, 'aportado'); await D.espera(5)
  ok(lineas(m) === 'activo,ociosoLiquidez,plan,spy', `al marcar SPY y desmarcar lo aportado: ${lineas(m)}`)
  ok(JSON.parse(localStorage.getItem('builder_paso3_lineas')).spy === true, 'se guarda en el navegador'); m.quita(); await D.espera(5)
  m = montaPlan(); await D.espera(800)
  ok(lineas(m) === 'activo,ociosoLiquidez,plan,spy', `al volver, lo marcado se recuerda: ${lineas(m)}`); m.quita(); await D.espera(5)
  const lsBueno = window.localStorage; window.localStorage = { getItem() { throw new Error('bloqueado') }, setItem() { throw new Error('bloqueado') } }
  m = montaPlan(); await D.espera(800)
  ok(lineas(m) === 'activo,aportado,ociosoLiquidez,plan', 'con el almacén bloqueado: las de por defecto, sin error')
  marca(m, 'qqq'); await D.espera(5)
  ok(lineas(m).includes('qqq'), 'y se puede marcar igual'); m.quita(); await D.espera(5); window.localStorage = lsBueno

  // ── 4 · «Mi trabajo» compacto (§58) ──
  const Az = require(R + '/lib/pruebaAzar.js')
  const eC = { id: 'c1', name: 'Código con acentó', definition: null, code_js: 'x', description: 'Una regla escrita a mano', params: {} }
  const lista = [est('e4', 'Copia editor 23'), est('e7', 'Línea bajista'), est('e6', 'SuperTrend 10/3'), est('e9', 'Sin planes'), eC]
  const h7 = await Az.huellaEstrategia(lista[1]), h6 = await Az.huellaEstrategia(lista[2])
  const conPlan = (id, nombre, e) => fila(id, nombre, e, '2026-11-01T10:00:00Z')
  const planes4 = [conPlan(4, 'Copia / gold', lista[0]), conPlan(7, 'Línea / oro', lista[1]), conPlan(8, 'Línea / liquidez', lista[1])]
  const pruebasAz = [{ id: 1, creada_en: '2026-10-30T10:00:00Z', estrategia_id: 'e7', estrategia_nombre: 'Línea bajista', estrategia_huella: h7, valor: 'AAPL', velas: 'diarias', res: { id: 1, veredicto: 'noPasa', texto: 'x' } },
    { id: 2, creada_en: '2026-10-29T10:00:00Z', estrategia_id: 'e6', estrategia_nombre: 'SuperTrend 10/3', estrategia_huella: h6, valor: 'NVDA', velas: 'diarias', res: { id: 2, veredicto: 'pasa', texto: 'x' } },
    { id: 3, creada_en: '2026-10-28T10:00:00Z', estrategia_id: 'e4', estrategia_nombre: 'Copia editor 23', estrategia_huella: 'otra-regla-de-antes', valor: 'AAPL', velas: 'diarias', res: { id: 3, veredicto: 'pasa', texto: 'x' } }]
  const escrituras = []
  let borraBien = true
  const baseMT = () => { const J = (x, status = 200) => ({ ok: true, status, json: async () => x, text: async () => JSON.stringify(x) })
    globalThis.fetch = async (u, o = {}) => { const s = String(u), mt = o.method || 'GET'
      if (mt !== 'GET' && !s.includes('builder_pestanas')) escrituras.push(`${mt} ${s.replace('https://falso.invalid/rest/v1/', '')}`)
      if (s.includes('builder_pestanas')) return J(mt === 'POST' ? null : [{ planes: [4, 7, 8] }], mt === 'POST' ? 201 : 200)
      if (s.includes('planes_inversion')) return J(planes4)
      if (s.includes('pruebas_azar')) return J(pruebasAz)
      if (mt === 'DELETE') return borraBien ? J([{ id: 'e9' }]) : { ok: false, status: 403, json: async () => ({}) }
      return J([]) } }
  const hayQ = (x, k, v) => !!x.raiz.busca(n => n.getAttribute(k) != null && (v == null || n.getAttribute(k) === String(v)))
  const filaDe = (x, id) => x.raiz.busca(n => n.getAttribute('data-fila-estrategia') === id)
  const portada = async () => { const x = D.monta(h(BP, { estrategias: lista, visible: true, apiFetch: api, abrir: null }), RDC); await D.espera(LARGO); return x }
  baseMT(); m = await portada()
  const filtros = () => m.raiz.conAtributo('aria-pressed').map(n => n.textContent).join(' | ')
  ok(!hayQ(m, 'data-tarjeta', 'copia') && !hayQ(m, 'data-bloque', 'empezar') && !m.raiz.textContent.includes('Desde una de mis estrategias') && !m.raiz.textContent.includes('¿Desde dónde empiezas?'), 'sin «Desde una de mis estrategias» ni el bloque de arriba')
  ok(hayQ(m, 'data-boton', 'en-blanco') && hayQ(m, 'data-boton', 'desde-plantilla'), '«En blanco» y «Desde una plantilla», arriba a la derecha')
  ok(filtros() === 'De tarjetas (4) | De código (1)', `filtros: ${filtros()}`)
  ok(!hayQ(m, 'data-regla-fila') && m.raiz.conAtributo('data-nombre').every(n => n.getAttribute('title')?.length > 5 && n.style.whiteSpace === 'nowrap'), 'una línea por estrategia: la regla, en el tooltip del nombre')
  const cabeceras = m.raiz.busca(n => n.getAttribute('data-tabla') === 'estrategias').todos(n => n.nodeName === 'TH').map(n => n.textContent.replace('?', '').trim()).join(' · ')
  ok(cabeceras.startsWith('Estrategia · Versión · Prueba contra el azar · Planes · Tesis · Qué toca ahora'), `columnas: ${cabeceras}`)
  // Sin prueba, no pasa, pasa, y una prueba de una regla anterior (otra huella): esa no cuenta.
  const az = (id) => filaDe(m, id).busca(n => n.getAttribute('data-azar') != null)
  ok(az('e9').getAttribute('data-azar') === 'sinPrueba' && az('e9').textContent === 'Sin probar' && !filaDe(m, 'e9').busca(n => n.getAttribute('data-ver-prueba') != null), 'sin prueba: «Sin probar», sin «Ver»')
  ok(az('e7').textContent === 'No pasa30/10 · AAPLVer', `no pasa: «${az('e7').textContent}»`)
  ok(az('e6').textContent === 'Pasa29/10 · NVDAVer', `pasa: «${az('e6').textContent}»`)
  ok(az('e4').getAttribute('data-azar') === 'sinPrueba', 'una prueba de la regla de antes no cuenta: «Sin probar»')
  const toca = (id) => filaDe(m, id).busca(n => n.getAttribute('data-toca') != null)?.textContent
  ok(toca('e9') === 'Probarla contra el azar' && toca('e4') === 'Probarla contra el azar' && toca('e7') === 'Convertirla en plan' && toca('e6') === 'Convertirla en plan', '«Qué toca ahora»: sin prueba, probarla; con ella, convertirla en plan')
  const nPl = (id) => filaDe(m, id).busca(n => n.getAttribute('data-planes-n') != null)
  ok(nPl('e9').getAttribute('data-planes-n') === '0' && nPl('e4').getAttribute('data-planes-n') === '1' && nPl('e7').getAttribute('data-planes-n') === '2' && nPl('e7').getAttribute('title') === 'Línea / oro · Línea / liquidez', 'planes: cuántos, con los nombres en el tooltip')
  ok(filaDe(m, 'e4').busca(n => n.getAttribute('data-borrar-estrategia') != null).busca(n => n.getAttribute('stroke') === '#f85149') != null && !!filaDe(m, 'e4').busca(n => n.getAttribute('data-duplicar-estrategia') != null).busca(n => n.nodeName === 'svg'), 'iconos: duplicar y papelera ROJA')
  // El buscador
  const casillaB = () => m.raiz.busca(n => n.getAttribute('data-buscar') === 'mi-trabajo'), nFilas = () => m.raiz.conAtributo('data-fila-estrategia').length
  D.escribe(casillaB(), 'LINEA'); await D.espera(5)
  ok(nFilas() === 1 && !!filaDe(m, 'e7'), 'buscar «LINEA» encuentra «Línea bajista»: sin mayúsculas ni acentos')
  ok(hayQ(m, 'data-limpiar-busqueda'), 'con ✕ al escribir')
  D.pulsa(m.raiz.busca(n => n.getAttribute('data-limpiar-busqueda') != null)); await D.espera(5)
  ok(nFilas() === 4 && casillaB().value === '', 'la ✕ limpia')
  // La plantilla: desplegable opaco
  D.pulsa(m.raiz.busca(n => n.getAttribute('data-boton') === 'desde-plantilla')); await D.espera(5)
  const menuPl = m.raiz.busca(n => n.getAttribute('data-menu') === 'plantillas')
  ok(!!menuPl && menuPl.style.background === '#161f29' && menuPl.conAtributo('data-plantilla').length > 0, 'el desplegable de plantillas, con fondo opaco')
  // La papelera: cancelar no borra; si falla, lo dice y sigue; sí, borra solo esa
  const pulsaAtr = (k, v) => D.pulsa(m.raiz.busca(n => n.getAttribute(k) === v))
  pulsaAtr('data-borrar-estrategia', 'e9'); await D.espera(5)
  let vent = m.raiz.busca(n => n.getAttribute('data-pregunta') === 'borrar-estrategia')
  ok(!!vent && vent.textContent.includes('¿Eliminar esta estrategia? «Sin planes»') && !escrituras.length, 'la papelera pregunta antes, con el aviso de siempre')
  D.pulsa(vent.busca(n => n.nodeName === 'BUTTON' && n.textContent === 'Cancelar')); await D.espera(5)
  ok(!hayQ(m, 'data-pregunta', 'borrar-estrategia') && !escrituras.length && nFilas() === 4, 'cancelar: no se borra nada')
  pulsaAtr('data-borrar-estrategia', 'e7'); await D.espera(5)
  ok(m.raiz.busca(n => n.getAttribute('data-pregunta') === 'borrar-estrategia').textContent.includes('La usan 2 planes'), 'si la usan planes, lo dice')
  D.pulsa(m.raiz.busca(n => n.getAttribute('data-pregunta') === 'borrar-estrategia').busca(n => n.nodeName === 'BUTTON' && n.textContent === 'Cancelar')); await D.espera(5)
  borraBien = false; pulsaAtr('data-borrar-estrategia', 'e9'); await D.espera(5); pulsaAtr('data-boton', 'si-borrar-estrategia'); await D.espera(20)
  vent = m.raiz.busca(n => n.getAttribute('data-pregunta') === 'borrar-estrategia')
  ok(!!vent && vent.busca(n => n.getAttribute('data-aviso-pregunta') != null)?.textContent.includes('HTTP 403') && nFilas() === 4, 'si la base no deja borrar: lo dice y la fila sigue')
  borraBien = true; escrituras.length = 0; pulsaAtr('data-boton', 'si-borrar-estrategia'); await D.espera(20)
  ok(escrituras.length === 1 && escrituras[0] === 'DELETE strategies?id=eq.e9' && !filaDe(m, 'e9') && nFilas() === 3, `borra solo esa: ${escrituras.join()}`); escrituras.length = 0
  // Abrir un plan
  D.pulsa(filaDe(m, 'e4').busca(n => n.getAttribute('data-abrir-plan-fila') === '4')); await D.espera(LARGO)
  ok(vista(m).activa === 'g4' && hayQ(m, 'data-pantalla', 'plan'), 'con un plan: «Abrir» lleva al paso 3 con ese plan activo'); m.quita(); await D.espera(5)
  m = await portada()
  D.pulsa(filaDe(m, 'e7').busca(n => n.getAttribute('data-abrir-planes') != null && (n.getBoundingClientRect = () => ({ bottom: 100, left: 50 }), true))); await D.espera(5)
  const menuP = m.raiz.busca(n => n.getAttribute('data-menu') === 'planes')
  ok(!!menuP && menuP.conAtributo('data-abrir-plan-fila').length === 2 && menuP.style.background === '#161f29' && menuP.style.position === 'fixed', 'con varios: un desplegable opaco con los nombres')
  D.pulsa(menuP.busca(n => n.getAttribute('data-abrir-plan-fila') === '8')); await D.espera(LARGO)
  ok(vista(m).activa === 'g8', 'y abre el elegido, aunque no sea el primero'); m.quita(); await D.espera(5)
  // «Qué toca ahora» y «Ver» llevan al paso 2; el nombre y duplicar, al paso 1 (la copia, sin id)
  m = await portada()
  D.pulsa(filaDe(m, 'e9').busca(n => n.getAttribute('data-toca') != null)); await D.espera(LARGO)
  ok(m.raiz.busca(n => n.getAttribute('aria-current') === 'step')?.getAttribute('data-paso') === '2', '«Probarla contra el azar» lleva al paso 2'); m.quita(); await D.espera(5)
  m = await portada()
  D.pulsa(filaDe(m, 'e6').busca(n => n.getAttribute('data-ver-prueba') != null)); await D.espera(LARGO)
  ok(m.raiz.busca(n => n.getAttribute('aria-current') === 'step')?.getAttribute('data-paso') === '2', '«Ver» lleva al paso 2'); m.quita(); await D.espera(5)
  m = await portada()
  D.pulsa(filaDe(m, 'e7').busca(n => n.getAttribute('data-toca') != null)); await D.espera(LARGO)
  ok(vista(m).activa === 'g7' || vista(m).activa === 'g8', '«Convertirla en plan» con planes: abre el suyo'); m.quita(); await D.espera(5)
  const PB = require(R + '/components/BuilderPanel.js')
  const cop = PB.filaCopia(lista[1]), copC = PB.filaCopia(eC)
  ok(cop.id === null && cop.name === 'Línea bajista (copia)' && JSON.stringify(cop.definition) === JSON.stringify(lista[1].definition) && copC.id === null && copC.name === 'Código con acentó (copia)' && copC.code_js === 'x', 'duplicar: una copia sin id, «… (copia)», también de una de código; la original no se toca')
  m = await portada()
  D.pulsa(filaDe(m, 'e7').busca(n => n.getAttribute('data-duplicar-estrategia') != null)); await D.espera(LARGO)
  ok(m.raiz.conAtributo('data-ruta', 'estrategia')[0]?.textContent === 'Línea bajista (copia)' && !escrituras.length, 'el icono abre esa copia en el paso 1, sin guardar nada todavía'); m.quita(); await D.espera(5)
  // Las de código, en su filtro; y Mis pruebas sigue
  m = await portada()
  D.pulsa(m.raiz.conAtributo('aria-pressed').find(n => n.textContent.startsWith('De código'))); await D.espera(5)
  ok(nFilas() === 1 && filaDe(m, 'c1').textContent.includes('No se prueba aquí') && !!filaDe(m, 'c1').busca(n => n.getAttribute('data-duplicar-estrategia') === 'c1') && !!filaDe(m, 'c1').busca(n => n.getAttribute('data-borrar-estrategia') === 'c1'), 'una de código: su línea, sin prueba aquí, con los dos iconos')
  D.pulsa(m.raiz.busca(n => n.getAttribute('role') === 'tab' && n.textContent.startsWith('Mis pruebas'))); await D.espera(5)
  ok(hayQ(m, 'data-tabla', 'pruebas') && hayQ(m, 'data-buscar', 'mi-trabajo'), 'la pestaña «Mis pruebas» sigue, con el buscador')
  m.quita(); await D.espera(5)
  ok(!escrituras.length, `mirar y navegar por «Mi trabajo» no escribe nada en estrategias ni en planes (${escrituras.join() || 'ninguna'})`)
  // Sin poder leer las pruebas del paso 2: la fila dice «—» y sigue «Qué toca ahora» de antes.
  const Ml = require(R + '/lib/builder/misListas.js')
  const sinLeer = await Ml.construyeMisEstrategias({ estrategias: [lista[3]], lotes: [], pruebas: [], planes: [], pruebasAzar: null })
  ok(sinLeer[0].azar === null && sinLeer[0].toca.texto === 'Probarla contra el azar' && sinLeer[0].toca.accion.tipo === 'prueba', 'sin las pruebas del paso 2: «—» y la acción de siempre')

  console.log(fallos ? `planes-montaje: ${fallos} fallos` : 'planes-montaje: todas bien')
  process.exit(fallos ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
