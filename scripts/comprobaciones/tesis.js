// scripts/comprobaciones/tesis.js — la pantalla «Tesis» (V9.1092; docs/tesis.md). Las corre comunes.sh. Termina en 0 si todo va bien.
// Sin base de datos ni navegador:
// 1 · lib/tesis.js con un fetch falso: crear, cambiar, marcar revisada y borrar (método, dirección y cuerpo de cada llamada), y el 401
//     a través de ctxConSesion (lib/supabase.js): renueva la sesión y reintenta una vez con el token nuevo.
// 2 · Las piezas puras: cuentas por estado, búsqueda sin tildes, orden por revisada_en, «creada hoy» / «revisada hace X días», fechas.
// 3 · Montaje (renderToString con estado) de components/TesisPanel.js: lista vacía, tres tesis de estados distintos con sus filtros y
//     cuentas, un filtro, una búsqueda, cambios sin guardar, una nueva, las dos preguntas (sin guardar, borrar) y la ficha «(borrado)».
const path = require('path')
const C0 = require('./cargador'), R = C0.RAIZ
let fallos = 0
const ok = (c, t) => { console.log(`${c ? 'OK  ' : 'MAL '} ${t}`); if (!c) fallos++ }
const cuenta = (html, s) => html.split(s).length - 1

;(async () => {
  await C0.prepara(); C0.registra(R)
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://falso.supabase.co'; process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'clave-anonima-falsa'
  // supabase-js falso: getSession devuelve un token nuevo (para el 401).
  const cli = require.resolve(path.join(R, 'lib', 'supabaseClient.js'))
  let renovadas = 0
  require.cache[cli] = { id: cli, filename: cli, loaded: true, exports: { getSupabase: () => ({ auth: { getSession: async () => { renovadas++; return { data: { session: { access_token: 'nuevo' } } } } } }) } }
  const SB = require(path.join(R, 'lib', 'supabase.js'))
  const T = require(path.join(R, 'lib', 'tesis.js'))

  // ── 1 · La capa de la base ──
  const llamadas = []
  const fila = (o = {}) => ({ id: 7, titulo: 'Semis', texto: 'a', estado: 'idea', relacionados: [], created_at: '2026-10-01T10:00:00Z', updated_at: '2026-10-01T10:00:00Z', revisada_en: '2026-10-01T10:00:00Z', ...o })
  const responde = (status, cuerpo) => ({ ok: status < 400, status, json: async () => cuerpo })
  const ctx = { url: 'https://x', headers: { apikey: 'k', Authorization: 'Bearer t' }, fetch: async (u, o = {}) => { llamadas.push({ u, o }); return o.method === 'DELETE' ? responde(200, [fila()]) : responde(o.method ? 201 : 200, [fila()]) } }
  const ahora = new Date('2026-10-31T12:00:00Z')
  await T.crearTesis(ctx, { titulo: '  Semis   2027 ', texto: 'línea 1\nlínea 2', estado: 'estudio', relacionados: [{ tipo: 'estrategia', id: 5 }, { tipo: 'otro', id: 1 }] }, ahora)
  let l = llamadas.pop(), b = JSON.parse(l.o.body)
  ok(l.o.method === 'POST' && l.u.startsWith('https://x/rest/v1/tesis_inversion?select=') && l.o.headers.Prefer === 'return=representation', 'crear: POST a tesis_inversion con return=representation')
  ok(b.titulo === 'Semis 2027' && b.texto === 'línea 1\nlínea 2' && b.estado === 'estudio' && JSON.stringify(b.relacionados) === '[{"tipo":"estrategia","id":"5"}]' && b.revisada_en === ahora.toISOString() && !('user_id' in b),
    'crear: título limpio, texto con saltos tal cual, estado, enlaces válidos, revisada_en = ahora y sin user_id')
  await T.cambiarTesis(ctx, 7, { titulo: 'Semis', texto: 'b', estado: 'marcha', relacionados: [] }, ahora)
  l = llamadas.pop(); b = JSON.parse(l.o.body)
  ok(l.o.method === 'PATCH' && l.u.includes('id=eq.7') && b.texto === 'b' && b.estado === 'marcha' && b.revisada_en === ahora.toISOString(), 'cambiar: PATCH de id=7 con el texto, el estado y revisada_en = ahora')
  await T.marcarRevisada(ctx, 7, ahora)
  l = llamadas.pop(); b = JSON.parse(l.o.body)
  ok(l.o.method === 'PATCH' && l.u.includes('id=eq.7') && JSON.stringify(Object.keys(b)) === '["revisada_en"]', 'marcar revisada: solo revisada_en, sin tocar el texto')
  ok(await T.borrarTesis(ctx, 7) === true && llamadas.pop().o.method === 'DELETE', 'borrar: DELETE de id=7')
  const vacio = { ...ctx, fetch: async () => responde(200, []) }
  let e1 = null; try { await T.borrarTesis(vacio, 8) } catch (e) { e1 = e.message }
  ok(/ya no existe/.test(e1 || ''), `borrar una que no existe: «${e1}»`)
  let e2 = null; try { await T.listarTesis({ ...ctx, fetch: async () => responde(500, { message: 'caída' }) }) } catch (e) { e2 = e.message }
  ok(e2 === 'No se pudo leer tus tesis (HTTP 500: caída).', `error al leer: «${e2}»`)
  ok(T.problemaDe({ titulo: '   ', texto: '' }) === 'Ponle un título.' && T.problemaDe({ titulo: 'x', texto: 'é'.repeat(60000) }) != null && T.problemaDe({ titulo: 'x', texto: 'é'.repeat(50000) }) == null,
    'sin título o con más de 100 KB no se guarda (60.000 «é» = 120 KB no; 50.000 = 100.000 bytes sí)')

  // 401 → renueva y reintenta (ctxConSesion, el token vigente en cada llamada).
  const vistos = []
  globalThis.fetch = async (u, o) => { vistos.push(o.headers.Authorization); return o.headers.Authorization === 'Bearer nuevo' ? responde(201, [fila({ id: 9 })]) : responde(401, { message: 'JWT expired' }) }
  SB.setCurrentJwt('viejo')
  const r401 = await T.crearTesis(SB.ctxConSesion(), { titulo: 'X', texto: '' }, ahora)
  ok(r401?.id === 9 && renovadas === 1 && JSON.stringify(vistos) === '["Bearer viejo","Bearer nuevo"]', `401: renueva la sesión una vez y reintenta con el token nuevo (${vistos.join(' → ')})`)
  vistos.length = 0
  await T.listarTesis(SB.ctxConSesion())
  ok(vistos[0] === 'Bearer nuevo', 'la llamada siguiente ya sale con el token vigente (nada congelado)')

  // ── 2 · Piezas puras ──
  const dias = (n) => { const x = new Date(); x.setDate(x.getDate() - n); return x.toISOString() }   // días de calendario (el cambio de hora no cuenta)
  const tres = [
    { id: 1, titulo: 'Semiconductores 2027', texto: 'La demanda de chips de IA sigue fuerte.\nEntrar si NVDA supera máximos.', estado: 'estudio', relacionados: [{ tipo: 'estrategia', id: 'e1' }, { tipo: 'plan', id: 3 }, { tipo: 'estrategia', id: 'borrada' }], created_at: dias(30), updated_at: dias(3), revisada_en: dias(3) },
    { id: 2, titulo: 'Oro como cobertura', texto: 'Si caen los tipos reales, el oro sube.', estado: 'marcha', relacionados: [], created_at: dias(0), updated_at: dias(0), revisada_en: dias(0) },
    { id: 3, titulo: 'Bancos europeos', texto: 'Tecnología bancaria y márgenes.', estado: 'idea', relacionados: [], created_at: dias(10), updated_at: dias(10), revisada_en: dias(10) },
  ]
  const c = T.cuentasTesis(tres)
  ok(c.todas === 3 && c.idea === 1 && c.estudio === 1 && c.marcha === 1 && c.descartada === 0, 'cuentas: 3 · idea 1 · estudio 1 · marcha 1 · descartada 0')
  ok(JSON.stringify(T.ordenTesis(tres).map(t => t.id)) === '[2,1,3]', 'orden: la revisada más reciente arriba (2, 1, 3)')
  ok(JSON.stringify(T.buscaTesis(tres, 'TECNOLOGIA').map(t => t.id)) === '[3]' && T.buscaTesis(tres, 'nvda maximos').length === 1, 'búsqueda en títulos y textos, sin mayúsculas ni tildes')
  ok(T.haceTexto(tres[1]) === 'creada hoy' && T.haceTexto(tres[0]) === 'revisada hace 3 días' && T.haceTexto(tres[2]) === 'creada hace 10 días', `«${T.haceTexto(tres[1])}», «${T.haceTexto(tres[0])}», «${T.haceTexto(tres[2])}»`)
  ok(T.fechaCorta(new Date(2026, 9, 5, 12)) === '05/10/2026', 'fecha dd/mm/aaaa')

  // ── 3 · Montaje ──
  const React = require(path.join(R, 'node_modules', 'react'))
  const { renderToString } = require(path.join(R, 'node_modules', 'react-dom', 'server'))
  const P = require(path.join(R, 'components', 'TesisPanel.js')).default
  const EMA = { tipo: 'editor', motor: 1, formato: 1, nombre: 'x', stops: [], entrada: { orden: { tipo: 'apertura' }, senal: { c: 'cruza', de: { c: 'precioVsMedia', p: { lado: 'encima', tipo: 'EMA', periodo: 20 } } } }, salidas: [] }
  const estrategias = [{ id: 'e1', name: 'Cruce EMA20', definition: EMA, params: {} }, { id: 'c1', name: 'De código', definition: null, code: 'x' }]
  const planes = [{ id: 3, nombre: 'Mi plan QQQ' }]
  const monta = (inicial, extra = {}) => renderToString(React.createElement(P, { estrategias, planes, deps: { ctx }, inicial: { planes, ...inicial }, onAbrirEstrategia: () => {}, ...extra })).split('<!-- -->').join('')   // sin los separadores de texto de React
  let h = monta({ tesis: [] })
  ok(h.includes('Aún no tienes tesis. Pulsa «+ Nueva tesis» para escribir la primera.') && h.includes('Todas (0)') && h.includes('Mis tesis de inversión') && h.includes('+ Nueva tesis'), 'lista vacía: el aviso, «Todas (0)» y «+ Nueva tesis»')
  const abre1 = { tesis: tres, abierta: 1, borrador: { titulo: tres[0].titulo, texto: tres[0].texto, estado: 'estudio', relacionados: tres[0].relacionados } }
  h = monta(abre1)
  ok(['Todas (3)', 'Idea (1)', 'En estudio (1)', 'En marcha (1)', 'Descartada (0)'].every(s => h.includes(s)), 'filtros con sus cuentas: Todas (3) · Idea (1) · En estudio (1) · En marcha (1) · Descartada (0)')
  ok(cuenta(h, 'data-item="') === 3 && h.indexOf('data-item="2"') < h.indexOf('data-item="1"') && h.indexOf('data-item="1"') < h.indexOf('data-item="3"'), 'las tres en la lista, por revisada_en')
  ok(/data-item="1" aria-current="true"/.test(h), 'la abierta, resaltada')
  ok(h.includes('revisada hace 3 días') && h.includes('creada hoy') && h.includes('creada hace 10 días'), '«revisada hace 3 días», «creada hoy», «creada hace 10 días»')
  ok(h.includes('data-estado="estudio"') && h.includes('data-estado="marcha"') && h.includes('data-estado="idea"') && h.includes('#79c0ff') && h.includes('#56d364'), 'etiquetas de estado con su color (En estudio azul, En marcha verde, Idea gris)')
  ok(!h.includes('data-sin-guardar') && /data-guardar="true" disabled=""/.test(h), 'sin cambios: ni «● sin guardar» ni Guardar activo')
  ok(h.includes(`Creada ${T.fechaCorta(tres[0].created_at)} · Revisada ${T.fechaCorta(tres[0].revisada_en)}`) && h.includes('✓ Marcar como revisada hoy'), 'fechas de creada y revisada, y «Marcar como revisada hoy»')
  ok(/<textarea[^>]*data-texto[^>]*style="[^"]*min-height:400px[^"]*resize:vertical[^"]*overflow-y:auto/.test(h) && h.includes('Entrar si NVDA supera máximos.'), 'cuadro de texto: mínimo 400 px, se estira hacia abajo, barra vertical propia, con su texto')
  ok(h.includes('Estrategia · Cruce EMA20') && h.includes('Plan · Mi plan QQQ') && h.includes('data-borrado') && h.includes('Estrategia · (borrado)') && cuenta(h, 'data-abrir') === 1, 'Relacionado: estrategia con «Abrir», plan sin él y la borrada como «(borrado)» con su ×')
  ok(cuenta(h, 'aria-label="Quitar') === 3, 'cada ficha con su ×')
  h = monta({ ...abre1, filtro: 'marcha' })
  ok(cuenta(h, 'data-item="') === 1 && h.includes('data-item="2"') && /data-filtro="marcha" aria-pressed="true"/.test(h), 'filtro «En marcha»: solo la del oro')
  h = monta({ ...abre1, busca: 'tecnologia' })
  ok(cuenta(h, 'data-item="') === 1 && h.includes('data-item="3"') && h.includes('Todas (1)') && h.includes('Idea (1)') && h.includes('En estudio (0)'), 'búsqueda «tecnologia»: solo «Bancos europeos», con las cuentas de lo encontrado')
  h = monta({ ...abre1, borrador: { ...abre1.borrador, texto: abre1.borrador.texto + ' Y más.' } })
  ok(h.includes('● sin guardar') && !/data-guardar="true" disabled=""/.test(h), 'con cambios: «● sin guardar» y Guardar activo')
  h = monta({ ...abre1, borrador: { ...abre1.borrador, estado: 'descartada' } })
  ok(h.includes('● sin guardar') && /data-estado-boton="descartada" aria-pressed="true"/.test(h) && h.includes('#ff8b8b'), 'cambiar el estado a Descartada: botón marcado (rojo) y sin guardar')
  h = monta({ ...abre1, borrador: { ...abre1.borrador, texto: 'otro' }, pregunta: true })
  ok(h.includes('Tienes cambios sin guardar en «Semiconductores 2027». ¿Guardarlos?') && ['>Guardar<', '>Descartar<', '>Cancelar<'].every(s => h.includes(s)), 'pregunta de cambios sin guardar: Guardar / Descartar / Cancelar')
  h = monta({ ...abre1, borrando: true })
  ok(h.includes('¿Borrar la tesis «Semiconductores 2027»? Desaparece del todo.') && h.includes('Sí, borrar') && h.includes('#f85149'), 'aviso de borrar con «Sí, borrar» / «Cancelar» y la papelera roja')
  h = monta({ tesis: tres, nueva: true, borrador: { titulo: 'Nueva tesis', texto: '', estado: 'idea', relacionados: [] } })
  ok(h.includes('data-item="nueva"') && h.includes('● sin guardar') && !/data-guardar="true" disabled=""/.test(h) && h.includes('Sin guardar todavía') && cuenta(h, 'data-item="') === 4, 'nueva: arriba de la lista, en Idea, sin guardar y con Guardar activo')
  h = monta({ ...abre1, anadiendo: true })
  ok(h.includes('Estrategias de tarjetas') && h.includes('>Cruce EMA20<') && !h.includes('>De código<') && h.includes('Planes guardados') && h.includes('>Mi plan QQQ<'), '«+ Añadir estrategia o plan»: las de tarjetas (no las de código) y los planes guardados')
  h = monta({ ...abre1, borrador: { ...abre1.borrador, titulo: '  ' } })
  ok(h.includes('Ponle un título.') && /data-guardar="true" disabled=""/.test(h), 'sin título: no deja guardar y dice por qué')

  console.log(fallos ? `tesis: ${fallos} fallos` : 'tesis: todas bien')
  process.exit(fallos ? 1 : 0)
})().catch(e => { console.error(e); process.exit(2) })
