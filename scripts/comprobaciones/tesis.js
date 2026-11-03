// scripts/comprobaciones/tesis.js — la pantalla «Tesis» (V9.1092; docs/tesis.md). Las corre comunes.sh. Termina en 0 si todo va bien.
// Sin base de datos ni navegador:
// 1 · lib/tesis.js con un fetch falso: crear, cambiar, marcar revisada y borrar (método, dirección y cuerpo de cada llamada), y el 401
//     a través de ctxConSesion (lib/supabase.js): renueva la sesión y reintenta una vez con el token nuevo.
// 2 · Las piezas puras: cuentas por estado, búsqueda sin tildes, orden por revisada_en, «creada hoy» / «revisada hace X días», fechas.
// 3 · Montaje (renderToString con estado) de components/TesisPanel.js: lista vacía, tres tesis de estados distintos con sus filtros y
//     cuentas, un filtro, una búsqueda, cambios sin guardar, una nueva, las dos preguntas (sin guardar, borrar) y la ficha «(borrado)».
// 4 · El editor (V9.1093): TipTap necesita un navegador (un DOM) para montarse y aquí no lo hay, así que la pantalla se monta con un SUSTITUTO
//     (deps.Editor, que pinta el valor); del TipTap de verdad se comprueba su esquema (qué admite; sin imágenes). Además: la conversión de texto
//     plano, el texto sin etiquetas, «● sin guardar», el pegado de Word, las imágenes, los enlaces, los contrastes y que TipTap no se carga fuera de la pestaña.
// 5 · Fechas en hora de Madrid (23:30 UTC, cambio de hora de octubre, con el ordenador en otra zona), «Revisada: —», tooltips, «Descartar cambios»,
//     la ventana de salida con sus tres caminos (también guardar que falla) y el buscador (solo títulos, con texto, ✕, acentos, trozo resaltado).
const path = require('path'), fs = require('fs')
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
  ok(b.titulo === 'Semis 2027' && b.texto === 'línea 1\nlínea 2' && b.estado === 'estudio' && JSON.stringify(b.relacionados) === '[{"tipo":"estrategia","id":"5"}]' && !('revisada_en' in b) && !('created_at' in b) && !('user_id' in b),
    'crear: título limpio, texto con saltos tal cual, estado, enlaces válidos, y sin revisada_en, created_at ni user_id')
  await T.cambiarTesis(ctx, 7, { titulo: 'Semis', texto: 'b', estado: 'marcha', relacionados: [] }, ahora)
  l = llamadas.pop(); b = JSON.parse(l.o.body)
  ok(l.o.method === 'PATCH' && l.u.includes('id=eq.7') && b.texto === 'b' && b.estado === 'marcha' && !('revisada_en' in b) && !('created_at' in b) && !('updated_at' in b), 'guardar: PATCH de id=7 con el texto y el estado; NO cambia ni la creación ni la revisión')
  await T.marcarRevisada(ctx, 7, ahora)
  l = llamadas.pop(); b = JSON.parse(l.o.body)
  ok(l.o.method === 'PATCH' && l.u.includes('id=eq.7') && JSON.stringify(Object.keys(b)) === '["revisada_en"]' && b.revisada_en === ahora.toISOString(), 'marcar revisada: solo revisada_en = ahora, sin tocar el texto')
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
    { id: 2, titulo: 'Oro como cobertura', texto: 'Si caen los tipos reales, el oro sube.', estado: 'marcha', relacionados: [], created_at: dias(0), updated_at: dias(0), revisada_en: null },
    { id: 3, titulo: 'Bancos europeos', texto: 'Tecnología bancaria y márgenes.', estado: 'idea', relacionados: [], created_at: dias(10), updated_at: dias(10), revisada_en: null },
  ]
  const c = T.cuentasTesis(tres)
  ok(c.todas === 3 && c.idea === 1 && c.estudio === 1 && c.marcha === 1 && c.descartada === 0, 'cuentas: 3 · idea 1 · estudio 1 · marcha 1 · descartada 0')
  ok(JSON.stringify(T.ordenTesis(tres).map(t => t.id)) === '[2,1,3]', 'orden: lo más reciente arriba; las sin revisar, por su creación (2, 1, 3)')
  ok(JSON.stringify(T.buscaTesis(tres, 'TECNOLOGIA', true).map(t => t.id)) === '[3]' && T.buscaTesis(tres, 'nvda maximos', true).length === 1, 'búsqueda con el texto: en títulos y textos, sin mayúsculas ni tildes')
  ok(T.haceTexto(tres[1]) === 'creada hoy' && T.haceTexto(tres[0]) === 'revisada hace 3 días' && T.haceTexto(tres[2]) === 'creada hace 10 días', `«${T.haceTexto(tres[1])}», «${T.haceTexto(tres[0])}», «${T.haceTexto(tres[2])}»`)
  ok(T.fechaCorta(new Date(2026, 9, 5, 12)) === '05/10/2026', 'fecha dd/mm/aaaa')

  // ── 3 · Montaje ──
  const React = require(path.join(R, 'node_modules', 'react'))
  const { renderToString } = require(path.join(R, 'node_modules', 'react-dom', 'server'))
  const P = require(path.join(R, 'components', 'TesisPanel.js')).default
  const B0 = require(path.join(R, 'lib', 'builder', 'estilo.js')).B
  const EMA = { tipo: 'editor', motor: 1, formato: 1, nombre: 'x', stops: [], entrada: { orden: { tipo: 'apertura' }, senal: { c: 'cruza', de: { c: 'precioVsMedia', p: { lado: 'encima', tipo: 'EMA', periodo: 20 } } } }, salidas: [] }
  const estrategias = [{ id: 'e1', name: 'Cruce EMA20', definition: EMA, params: {} }, { id: 'c1', name: 'De código', definition: null, code: 'x' }]
  const planes = [{ id: 3, nombre: 'Mi plan QQQ' }]
  const Sustituto = ({ valor }) => React.createElement('div', { 'data-texto': '', 'data-sustituto': '' }, valor)   // en Node no hay DOM para TipTap (arriba)
  const monta = (inicial, extra = {}) => renderToString(React.createElement(P, { estrategias, planes, deps: { ctx, Editor: Sustituto }, inicial: { planes, ...inicial }, onAbrirEstrategia: () => {}, ...extra })).split('<!-- -->').join('')   // sin los separadores de texto de React
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
  ok(h.includes(`>Creada ${T.fechaCorta(tres[0].created_at)}<`) && h.includes(`>Revisada ${T.fechaCorta(tres[0].revisada_en)}<`) && h.includes('✓ Marcar como revisada hoy'), 'fechas de creada y revisada, y «Marcar como revisada hoy»')
  ok(/data-texto[^>]*data-sustituto/.test(h) && h.includes('Entrar si NVDA supera máximos.') && !h.includes('<textarea'), 'el texto va en el editor (aquí, su sustituto), con su texto, y ya no hay cuadro de texto plano')
  ok(h.includes('Estrategia · Cruce EMA20') && h.includes('Plan · Mi plan QQQ') && h.includes('data-borrado') && h.includes('Estrategia · (borrado)') && cuenta(h, 'data-abrir') === 1, 'Relacionado: estrategia con «Abrir», plan sin él y la borrada como «(borrado)» con su ×')
  {
    const rel = [{ tipo: 'plan', id: '3' }, { tipo: 'plan', id: '404' }]
    const hp = monta({ tesis: [fila({ id: 9, relacionados: rel })], abierta: 9, borrador: { titulo: 'x', texto: '', estado: 'idea', relacionados: rel } }, { onAbrirPlan: () => {} })
    ok(cuenta(hp, 'data-abrir-plan') === 1 && hp.includes('data-abrir-plan="3"') && hp.includes('Plan · (borrado)'), '«Abrir» en el plan que existe; el borrado, «(borrado)» y sin «Abrir»')
  }
  ok(cuenta(h, 'aria-label="Quitar') === 3, 'cada ficha con su ×')
  h = monta({ ...abre1, filtro: 'marcha' })
  ok(cuenta(h, 'data-item="') === 1 && h.includes('data-item="2"') && /data-filtro="marcha" aria-pressed="true"/.test(h), 'filtro «En marcha»: solo la del oro')
  h = monta({ ...abre1, busca: 'tecnologia', enTexto: true })
  ok(cuenta(h, 'data-item="') === 1 && h.includes('data-item="3"') && h.includes('Todas (1)') && h.includes('Idea (1)') && h.includes('En estudio (0)'), 'búsqueda «tecnologia»: solo «Bancos europeos», con las cuentas de lo encontrado')
  h = monta({ ...abre1, borrador: { ...abre1.borrador, texto: abre1.borrador.texto + ' Y más.' } })
  ok(h.includes('● sin guardar') && !/data-guardar="true" disabled=""/.test(h), 'con cambios: «● sin guardar» y Guardar activo')
  h = monta({ ...abre1, borrador: { ...abre1.borrador, estado: 'descartada' } })
  ok(h.includes('● sin guardar') && /data-estado-boton="descartada" aria-pressed="true"/.test(h) && h.includes('#ff8b8b'), 'cambiar el estado a Descartada: botón marcado (rojo) y sin guardar')
  h = monta({ ...abre1, borrador: { ...abre1.borrador, texto: 'otro' }, pregunta: true })
  const ventana = h.slice(h.indexOf('data-pregunta="sin-guardar"'))
  ok(ventana.includes('Tienes cambios sin guardar en «Semiconductores 2027».') && !ventana.includes('¿Guardarlos?') && ['>Guardar<', '>Salir sin guardar<', '>Cancelar<'].every(s => ventana.includes(s)), 'ventana propia de cambios sin guardar: Guardar / Salir sin guardar / Cancelar')
  h = monta({ ...abre1, borrando: true })
  ok(h.includes('¿Borrar la tesis «Semiconductores 2027»? Desaparece del todo.') && h.includes('Sí, borrar') && h.includes('#f85149'), 'aviso de borrar con «Sí, borrar» / «Cancelar» y la papelera roja')
  h = monta({ tesis: tres, nueva: true, borrador: { titulo: 'Nueva tesis', texto: '', estado: 'idea', relacionados: [] } })
  ok(h.includes('data-item="nueva"') && h.includes('● sin guardar') && !/data-guardar="true" disabled=""/.test(h) && h.includes('Sin guardar todavía') && cuenta(h, 'data-item="') === 4, 'nueva: arriba de la lista, en Idea, sin guardar y con Guardar activo')
  h = monta({ ...abre1, anadiendo: true })
  ok(h.includes('Estrategias de tarjetas') && h.includes('>Cruce EMA20<') && !h.includes('>De código<') && h.includes('Planes guardados') && h.includes('>Mi plan QQQ<'), '«+ Añadir estrategia o plan»: las de tarjetas (no las de código) y los planes guardados')
  h = monta({ ...abre1, borrador: { ...abre1.borrador, titulo: '  ' } })
  ok(h.includes('Ponle un título.') && /data-guardar="true" disabled=""/.test(h), 'sin título: no deja guardar y dice por qué')

  // ── 4 · El editor (V9.1093) ──
  // Sin el sustituto: la pantalla se monta con el aviso de carga y TipTap NI SE CARGA (va en su trozo aparte).
  const conTiptap = () => Object.keys(require.cache).some(k => /[\\/]@tiptap[\\/]/.test(k))
  h = renderToString(React.createElement(P, { estrategias, deps: { ctx }, inicial: { planes, ...abre1 } }))
  ok(h.includes('Cargando el editor…') && !conTiptap(), 'montaje sin navegador: «Cargando el editor…», sin fallar y sin cargar TipTap')
  const leer = (...r) => fs.readFileSync(path.join(R, ...r), 'utf8')
  const fuentePanel = leer('components', 'TesisPanel.js'), fuenteEditor = leer('components', 'TesisEditor.js')
  ok(/dynamic\(\(\) => import\('\.\/TesisEditor'\), \{ ssr: false/.test(fuentePanel) && !/@tiptap/.test(fuentePanel) && !/@tiptap|TesisEditor/.test(leer('pages', 'index.js')) && !/@tiptap/.test(leer('lib', 'tesis.js')), 'TipTap solo en components/TesisEditor.js, cargado con import dinámico y ssr: false')
  ok(!/dangerouslySetInnerHTML/.test(fuentePanel + fuenteEditor) && fuenteEditor.includes('immediatelyRender: false'), 'el contenido nunca se pinta como HTML en crudo: solo a través del editor')
  const nextPaginas = path.join(R, '.next', 'static', 'chunks', 'pages')
  const trozos = fs.existsSync(nextPaginas) ? fs.readdirSync(nextPaginas).filter(x => /^index-.*\.js$/.test(x)) : []
  if (trozos.length) ok(trozos.every(x => !/tiptap|ProseMirror/i.test(fs.readFileSync(path.join(nextPaginas, x), 'utf8'))), 'en el build, el trozo de la página principal no lleva TipTap')
  const ED = require(path.join(R, 'components', 'TesisEditor.js'))
  const { getSchema } = require(path.join(R, 'node_modules', '@tiptap', 'core'))
  const esquema = getSchema(ED.extensionesTesis())
  const nodos = Object.keys(esquema.nodes), marcas = Object.keys(esquema.marks)
  ok(['heading', 'bulletList', 'orderedList', 'listItem', 'table', 'tableRow', 'tableHeader', 'tableCell', 'recuadro', 'horizontalRule'].every(x => nodos.includes(x)), `editor: admite títulos, listas, tablas, recuadro y línea (${nodos.length} tipos de bloque)`)
  ok(['bold', 'italic', 'underline', 'strike', 'textStyle', 'highlight', 'link'].every(x => marcas.includes(x)), 'editor: admite negrita, cursiva, subrayado, tachado, color, resaltado y enlace')
  ok(!nodos.includes('image') && nodos.includes('imagenTesis') && !nodos.includes('codeBlock') && !nodos.includes('blockquote') && !marcas.includes('code'), 'editor: NO admite imágenes sueltas ni código (se descartan al abrir y al pegar); solo su propia referencia')
  ok(fuenteEditor.includes('levels: [1, 2, 3]'), 'editor: títulos de nivel 1 a 3')
  ok(['deshacer', 'rehacer', 'negrita', 'cursiva', 'subrayado', 'tachado', 'color', 'resalte', 'vinetas', 'numerada', 'sangria-mas', 'sangria-menos', 'tabla', 'fila-mas', 'fila-menos', 'columna-mas', 'columna-menos', 'tabla-borrar', 'recuadro', 'linea', 'imagen', 'enlace', 'quitar-formato'].every(b => fuenteEditor.includes(`id="${b}"`)) && ['Texto normal', 'Título 1', 'Título 2', 'Título 3'].every(x => fuenteEditor.includes(x)), 'barra: los 23 botones y los 4 estilos')

  // Conversión de texto plano a HTML.
  const plano = 'Si a < b & c > d\n\n"comillas" y \'simples\'\r\nfin'
  ok(T.textoAHtml(plano) === '<p>Si a &lt; b &amp; c &gt; d</p><p></p><p>&quot;comillas&quot; y &#39;simples&#39;</p><p>fin</p>', `texto plano → párrafos con todo escapado: ${T.textoAHtml(plano)}`)
  ok(T.textoAHtml('') === '' && T.textoAHtml(null) === '', 'sin texto, sin párrafos')
  const rico = '<h2>Tesis</h2><p>Chips <strong>IA</strong> de R&amp;D &lt;fuerte&gt;</p><ul><li><p>uno</p></li></ul><table><tbody><tr><td><p>celda</p></td></tr></tbody></table><p><a target="_blank" href="https://x.com/?a>b">enlace</a></p>'
  ok(T.textoAHtml(rico) === rico && T.esHtmlTesis(rico) && T.esHtmlTesis('<div data-recuadro=""><p>x</p></div>') && T.esHtmlTesis('<hr>'), 'lo que ya es HTML del editor se abre tal cual')
  ok(['<b> no es un bloque', 'a < b', '<p> mayor que 5', 'precio <p>', 'texto normal', ''].every(x => !T.esHtmlTesis(x)), 'lo que no es HTML del editor se trata como texto plano («<p> mayor que 5», «a < b»…)')
  ok(T.textoAHtml('<p> mayor que 5') === '<p>&lt;p&gt; mayor que 5</p>', 'un «<p>» escrito a mano en una tesis antigua se ve como texto, no se interpreta')
  // Texto sin etiquetas: búsqueda, vistas previas y lista.
  ok(T.textoSinEtiquetas(rico) === 'Tesis Chips IA de R&D <fuerte> uno celda enlace', `sin etiquetas: «${T.textoSinEtiquetas(rico)}»`)
  ok(T.textoSinEtiquetas(plano) === plano, 'el texto plano se queda como está')
  const conHtml = [{ id: 1, titulo: 'A', texto: rico }, { id: 2, titulo: 'B', texto: 'tabla strong en plano' }]
  ok(T.buscaTesis(conHtml, 'strong', true).map(t => t.id).join() === '2' && T.buscaTesis(conHtml, 'href', true).length === 0 && T.buscaTesis(conHtml, 'amp', true).length === 0 && T.buscaTesis(conHtml, 'x.com', true).length === 0, 'buscar «strong», «href», «amp» o la dirección de un enlace no encuentra las etiquetas')
  ok(T.buscaTesis(conHtml, 'r&d', true).map(t => t.id).join() === '1' && T.buscaTesis(conHtml, 'chips ia celda', true).map(t => t.id).join() === '1' && T.buscaTesis(conHtml, 'fuerte', true).length === 1, 'buscar el texto de verdad sí lo encuentra, también «R&D»')
  const conRica = { id: 8, titulo: 'Tesis rica', texto: rico, estado: 'idea', relacionados: [], created_at: dias(1), updated_at: dias(1), revisada_en: dias(1) }
  h = monta({ tesis: [conRica], abierta: 8, borrador: { titulo: 'Tesis rica', texto: rico, estado: 'idea', relacionados: [] } })
  const trozoLista = h.slice(h.indexOf('data-lista'), h.indexOf('data-abierta'))
  ok(!/&lt;|strong|<h2/.test(trozoLista) && trozoLista.includes('Tesis rica'), 'en la lista de la izquierda no aparece ninguna etiqueta')

  // «● sin guardar»: al abrir, no; al cambiar, sí.
  const antigua = { id: 9, titulo: 'Antigua', texto: 'línea 1\nlínea 2', estado: 'idea', relacionados: [], created_at: dias(5), updated_at: dias(5), revisada_en: dias(5) }
  const bordeAntigua = { titulo: 'Antigua', texto: antigua.texto, estado: 'idea', relacionados: [] }
  h = monta({ tesis: [antigua], abierta: 9, borrador: bordeAntigua })
  ok(!h.includes('data-sin-guardar'), 'abrir una tesis antigua en texto plano: sin «● sin guardar»')
  const baseAntigua = { html: T.textoAHtml(antigua.texto), valor: antigua.texto }
  ok(T.valorDelEditor(baseAntigua.html, false, baseAntigua) === antigua.texto, 'el editor con lo mismo que al abrir devuelve lo guardado, no el HTML (deshacer deja también sin marca)')
  const cambiada = T.valorDelEditor('<p>línea 1 y más</p><p>línea 2</p>', false, baseAntigua)
  ok(cambiada === '<p>línea 1 y más</p><p>línea 2</p>', 'al cambiar, el valor es el HTML')
  h = monta({ tesis: [antigua], abierta: 9, borrador: { ...bordeAntigua, texto: cambiada } })
  ok(h.includes('● sin guardar') && !/data-guardar="true" disabled=""/.test(h), 'y entonces sale «● sin guardar» con Guardar activo')
  ok(T.valorDelEditor('<p></p>', true, baseAntigua) === '', 'borrarlo todo guarda vacío')
  ok(T.valorDelEditor('<p></p>', true, { html: '<p></p>', valor: '' }) === '', 'una nueva sin tocar sigue vacía')
  h = monta({ tesis: [conRica], abierta: 8, borrador: { titulo: 'Tesis rica', texto: rico, estado: 'idea', relacionados: [] } })
  ok(!h.includes('data-sin-guardar'), 'abrir una tesis ya en HTML: sin marca')
  const guardadaHtml = JSON.parse((await T.cambiarTesis(ctx, 8, { titulo: 'x', texto: rico, estado: 'idea', relacionados: [] }, ahora), llamadas.pop().o.body))
  ok(guardadaHtml.texto === rico, 'guardar manda el HTML en la columna «texto», tal cual')

  // Pegar desde Word.
  const WORD = `<html xmlns:o="urn:schemas-microsoft-com:office:office"><head><style>p.MsoNormal{color:red}</style></head><body><!--StartFragment--><p class=MsoTitle>Mi título<o:p></o:p></p><h4 style='color:#1F3864'>Sub</h4><p class=MsoNormal><b>Negrita</b> <span style='color:black;font-weight:bold;mso-bidi-font-weight:normal'>negro</span><o:p></o:p></p>`
    + `<p class=MsoListParagraph style='text-indent:-18.0pt;mso-list:l0 level1 lfo1'><![if !supportLists]><span style='font-family:Symbol'><span style='mso-list:Ignore'>·<span style='font:7.0pt "Times New Roman"'>&nbsp; </span></span></span><![endif]>Uno<o:p></o:p></p>`
    + `<p class=MsoListParagraph style='mso-list:l0 level2 lfo1'><![if !supportLists]><span><span style='mso-list:Ignore'>o</span></span><![endif]>Dentro<o:p></o:p></p>`
    + `<p class=MsoListParagraph style='mso-list:l0 level1 lfo1'><![if !supportLists]><span><span style='mso-list:Ignore'>·</span></span><![endif]>Dos<o:p></o:p></p><p class=MsoNormal>Entre medias</p>`
    + `<p class=MsoListParagraph style='mso-list:l1 level1 lfo2'><!--[if !supportLists]--><span><span style='mso-list:Ignore'>1.&nbsp;</span></span><!--[endif]-->Numerado<o:p></o:p></p><table><tr><td><b>A</b></td></tr></table><!--EndFragment--></body></html>`
  const limpio = T.limpiarPegado(WORD)
  ok(limpio.includes('<ul><li>Uno<ul><li>Dentro</li></ul></li><li>Dos</li></ul>') && limpio.includes('<ol><li>Numerado</li></ol>'), 'Word: sus listas se vuelven listas de verdad, con niveles y numeración')
  ok(limpio.includes('<h1>Mi título</h1>') && /<h3[^>]*>Sub<\/h3>/.test(limpio) && limpio.includes('<b>Negrita</b>') && limpio.includes('<table>'), 'Word: conserva títulos, negritas y tablas')
  ok(!/color|mso-|<o:p|<!|supportLists|<style|Symbol|·/.test(limpio) && limpio.includes('font-weight:bold'), 'Word: fuera el ruido, las viñetas escritas y los colores (el negrita por estilo se queda)')
  const propio = '<span data-pm-slice="1 1 []" style="color: red">x</span>'
  ok(T.limpiarPegado(propio) === propio, 'lo copiado del propio editor conserva sus colores')
  ok(!/<script|alert/.test(T.limpiarPegado('<p>a</p><script>alert(1)</script>')), 'un <script> pegado desaparece')

  // Imágenes: qué hacer con lo pegado o arrastrado.
  ok(T.AVISO_IMAGEN === undefined && !fuenteEditor.includes('llegarán en la próxima') && fuenteEditor.includes('handlePaste') && fuenteEditor.includes('handleDrop'), 'el bloqueo de antes ya no está; se atiende al pegar y al arrastrar')
  const U1 = '11111111-2222-3333-4444-555555555555', U2 = '99999999-2222-3333-4444-555555555555', UI = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
  const rutaI = `${U1}/7/imagen/${UI}.png`, carp = `${U1}/7/imagen/`
  const opc = { carpeta: carp, esImagen: (f) => /^image\/(png|jpeg|gif|webp)$/.test(f.type), avisoTipo: 'tipo' }
  const img = (o) => JSON.stringify(T.imagenEnPegado({ ...opc, ...o }))
  const PNG = { name: 'image.png', type: 'image/png' }, AVI = 'Las imágenes pegadas junto con texto no se copian: pégalas una a una.'
  ok(T.AVISO_IMAGENES_PEGADAS === AVI, 'el aviso de una línea, tal cual')
  ok(img({ archivos: [PNG] }) === '{"subir":true,"bloquea":true,"aviso":null}', 'una imagen sola (captura): se sube')
  ok(img({ html: `<img src="https://web/a.png">`, archivos: [PNG] }) === '{"subir":true,"bloquea":true,"aviso":null}', 'una imagen copiada de una web, sin texto: se sube, sin aviso')
  ok(img({ html: '<p>x</p>', texto: 'x', archivos: [PNG] }) === '{"subir":false,"bloquea":false,"aviso":null}', 'Word o Excel (texto más su «foto»): entra el texto, sin aviso')
  ok(img({ html: '<p>x</p><img src="a.png">', texto: 'x' }) === `{"subir":false,"bloquea":false,"aviso":"${AVI}"}`, 'texto con una imagen: entra el texto y avisa')
  ok(img({ texto: 'x' }) === '{"subir":false,"bloquea":false,"aviso":null}', 'texto normal: nada que avisar')
  ok(img({ archivos: [{ name: 'a.pdf', type: 'application/pdf' }] }) === '{"subir":false,"bloquea":true,"aviso":"tipo"}', 'un archivo que no es imagen, en el texto: no entra y avisa')
  ok(img({ html: `<p>x</p><img data-archivo="${rutaI}" data-tamano="ancho">`, texto: 'x' }) === '{"subir":false,"bloquea":false,"aviso":null}', 'copiar y pegar una imagen de esta misma tesis: se queda, sin aviso')
  // Solo las referencias de la carpeta propia y de esta tesis.
  const q = (h, c = carp) => T.quitarImagenesAjenas(h, c)
  ok(q(`<p>a</p><img data-archivo="${rutaI}" data-tamano="pequena">`).html === `<p>a</p><img data-archivo="${rutaI}" data-tamano="pequena">` && q(`<img data-archivo="${rutaI}">`).quitadas === 0, 'la referencia propia, tal cual')
  ok(['<img src="data:image/png;base64,AAAA">', '<img src="https://web/x.png">', `<img data-archivo="${U2}/7/imagen/${UI}.png">`, `<img data-archivo="${U1}/8/imagen/${UI}.png">`, `<img data-archivo="${U1}/7/adjunto/${UI}.png">`, `<img data-archivo="${U1}/7/imagen/../../x.png">`, `<IMG SRC=x onerror='a>b'>`].every(e => { const r = q(`<p>a</p>${e}<p>b</p>`); return r.quitadas === 1 && r.html === '<p>a</p><p>b</p>' }), 'fuera: data:, webs, otro usuario, otra tesis, otra clase, rutas con «..» y un onerror')
  ok(q(`<img data-archivo="${rutaI}">`, null).quitadas === 1, 'en una nueva sin guardar no hay carpeta: ninguna vale')
  ok(T.rutaImagenValida(rutaI) && !T.rutaImagenValida(`${U1}/7/imagen/${UI}.svg`) && !T.rutaImagenValida('x') && !T.rutaImagenValida(null), 'forma de una ruta de imagen (nunca svg)')
  // La referencia en «texto»: reconocer, listar y limpiar.
  const conImagen = `<p>Antes</p><img data-archivo="${rutaI}" data-tamano="mediana"><p>Después</p>`, empieza = `<img data-archivo="${rutaI}" data-tamano="ancho"><p></p>`
  ok(T.esHtmlTesis(conImagen) && T.esHtmlTesis(empieza) && T.textoAHtml(empieza) === empieza && !T.esHtmlTesis('<img src="x"> texto'), 'un texto que EMPIEZA por una imagen sigue siendo HTML del editor (si no, se vería como texto plano)')
  ok(T.textoSinEtiquetas(conImagen) === 'Antes Después' && T.buscaTesis([{ id: 1, titulo: 'x', texto: conImagen }], 'imagen', true).length === 0, 'buscar no encuentra la ruta de una imagen')
  ok(JSON.stringify(T.rutasEnTexto(conImagen + empieza)) === `["${rutaI}"]` && T.rutasEnTexto('<p>a</p>').length === 0 && T.rutasEnTexto(null).length === 0, 'rutas en el texto, sin repetir')
  const filasI = [{ id: 1, clase: 'imagen', ruta: rutaI }, { id: 2, clase: 'imagen', ruta: 'otra' }, { id: 3, clase: 'adjunto', ruta: 'adj' }]
  ok(T.imagenesSobrantes(filasI, conImagen).map(f => f.id).join() === '2' && T.imagenesSobrantes(filasI, '<p></p>', conImagen).map(f => f.id).join() === '2' && T.imagenesSobrantes(filasI, '').map(f => f.id).join() === '1,2', 'sobran las imágenes que no están en el texto; los adjuntos, nunca')
  ok(T.bytesDe(conImagen) < 200 && !conImagen.includes('src='), 'la imagen cuenta solo su referencia en el límite de 100 KB')
  // El nodo de verdad, sin DOM: de HTML a nodo y de nodo a HTML.
  const nImg = esquema.nodes.imagenTesis, regla = nImg.spec.parseDOM[0]
  const elem = (a) => ({ getAttribute: (k) => a[k] ?? null })
  ok(regla.tag === 'img[data-archivo]' && regla.getAttrs(elem({ 'data-archivo': rutaI })).archivo === rutaI && regla.getAttrs(elem({ 'data-archivo': 'https://web/x.png' })) === false, 'el editor solo lee una referencia con forma de ruta de imagen')
  const salida = JSON.stringify(nImg.spec.toDOM(nImg.create({ archivo: rutaI, tamano: 'pequena' })))
  ok(salida === JSON.stringify(['img', { 'data-archivo': rutaI, 'data-tamano': 'pequena' }]), `lo que se guarda no lleva URL: ${salida}`)
  ok(nImg.create({ archivo: rutaI }).attrs.tamano === 'mediana' && T.tamanoImagen('raro') === 'mediana' && T.TAMANOS_IMAGEN.map(x => x.ancho).join() === '33,60,100' && T.TAMANOS_IMAGEN.map(x => x.nombre).join() === 'Pequeña,Mediana,Ancho completo', 'tres tamaños (33 %, 60 % por defecto y 100 %)')
  ok(!/setAttribute\('src'[\s\S]{0,40}getHTML/.test(fuenteEditor) && fuenteEditor.includes(`#79c0ff`) && fuenteEditor.includes('Subiendo imagen…') && fuenteEditor.includes('AVISO_SIN_GUARDAR'), 'borde azul, «Subiendo imagen…» y el aviso de la tesis sin guardar')
  // Limpieza desde la pantalla.
  ok(fuentePanel.includes('limpiaImagenes(r.id, () => r.texto, () => textoAhora.current)') && fuentePanel.includes('if (fila) limpiaImagenes(fila.id, () => fila.texto)') && fuentePanel.includes('await borrarTodoDeTesis(ctx(), fila.id); await borrarTesis(ctx(), fila.id)'), 'limpieza: al guardar, al descartar y al borrar la tesis (primero los archivos)')
  h = monta({ tesis: [conRica], abierta: 8, borrador: { titulo: 'x', texto: 'y', estado: 'idea', relacionados: [] } })
  ok(h.includes('data-guardar'), 'la pantalla se monta con el editor nuevo')

  // Enlaces.
  ok(T.direccionEnlace('nvidia.com') === 'https://nvidia.com' && T.direccionEnlace('http://a.b') === 'http://a.b' && T.direccionEnlace('mailto:a@b.c') === 'mailto:a@b.c' && T.direccionEnlace('x.com:8080/a') === 'https://x.com:8080/a', 'enlaces: con https si falta, http, correo y con puerto')
  ok(['javascript:alert(1)', 'JavaScript:x', 'java script:x', 'data:text/html,x', 'vbscript:x', '', '   '].every(x => T.direccionEnlace(x) === null), 'enlaces: javascript:, data: y vacíos, rechazados')
  ok(/target: '_blank'/.test(fuenteEditor) && /noopener/.test(fuenteEditor), 'los enlaces se abren en pestaña nueva')

  // Contrastes (WCAG): la hoja gris y los colores que se pueden elegir.
  const lum = (hex) => { const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2] }
  const contraste = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }
  const H = T.HOJA
  ok(H.fondo !== '#000000' && H.texto !== '#ffffff' && contraste(H.texto, H.fondo) >= 7, `letra sobre la hoja: ${contraste(H.texto, H.fondo).toFixed(1)}:1 (mínimo 7:1)`)
  ok(contraste(H.titulo, H.fondo) > contraste(H.texto, H.fondo) && contraste(H.titulo, H.cabecera) >= 7 && contraste(H.enlace, H.fondo) >= 7, `títulos más claros, cabecera de tabla ${contraste(H.titulo, H.cabecera).toFixed(1)}:1, enlaces ${contraste(H.enlace, H.fondo).toFixed(1)}:1`)
  ok(contraste(H.texto, H.recuadroFondo) >= 7, `letra sobre el recuadro: ${contraste(H.texto, H.recuadroFondo).toFixed(1)}:1`)
  ok(T.COLORES_LETRA.length >= 6 && T.COLORES_LETRA.length <= 8 && T.COLORES_LETRA.every(x => contraste(x.color, H.fondo) >= 7), `${T.COLORES_LETRA.length} colores de letra, todos ≥ 7:1 (el peor, ${Math.min(...T.COLORES_LETRA.map(x => contraste(x.color, H.fondo))).toFixed(1)}:1)`)
  ok(T.COLORES_RESALTE.length >= 3 && T.COLORES_RESALTE.length <= 4 && T.COLORES_RESALTE.every(x => contraste(H.texto, x.color) >= 4.5), `${T.COLORES_RESALTE.length} resaltados, se lee la letra encima (el peor, ${Math.min(...T.COLORES_RESALTE.map(x => contraste(H.texto, x.color))).toFixed(1)}:1)`)

  // ── 5 · Fechas, salir sin guardar y buscador ──
  // Hora de Madrid, con el ordenador en otra zona a propósito (Nueva York): antes salía el día de allí.
  const zona = process.env.TZ
  process.env.TZ = 'America/New_York'
  ok(new Date('2026-07-15T23:30:00Z').getDate() === 15 && T.fechaCorta('2026-07-15T23:30:00Z') === '16/07/2026' && T.fechaHora('2026-07-15T23:30:00Z') === '16/07/2026 a las 01:30', 'verano, 23:30 UTC: en Madrid ya es el día siguiente, a la 01:30 (con el ordenador en Nueva York)')
  ok(T.fechaCorta('2026-12-15T23:30:00Z') === '16/12/2026' && T.fechaHora('2026-12-15T23:30:00Z') === '16/12/2026 a las 00:30', 'invierno, 23:30 UTC: en Madrid, las 00:30 del día siguiente')
  ok(T.fechaHora('2026-10-31T23:21:14.485576+00:00') === '01/11/2026 a las 00:21', 'la tesis de las 23:21 UTC del 31/10: «01/11/2026 a las 00:21» (la medianoche es 00, no 24)')
  ok(T.fechaHora('2026-10-25T00:30:00Z') === '25/10/2026 a las 02:30' && T.fechaHora('2026-10-25T01:30:00Z') === '25/10/2026 a las 02:30', 'cambio de hora de octubre: las 02:30 ocurren dos veces (00:30 y 01:30 UTC)')
  ok(T.fechaHora('2026-10-24T22:30:00Z') === '25/10/2026 a las 00:30' && T.fechaHora('2026-10-25T22:30:00Z') === '25/10/2026 a las 23:30' && T.fechaHora('2026-10-25T23:30:00Z') === '26/10/2026 a las 00:30', 'el día del cambio: antes suma 2 horas, después suma 1 (23:30 UTC ya es el 26)')
  ok(T.diasEntre('2026-10-24T22:30:00Z', '2026-10-25T23:30:00Z') === 1 && T.diasEntre('2026-10-31T23:21:00Z', '2026-11-01T22:00:00Z') === 0, 'los días pasados se cuentan en días de Madrid, también con el cambio de hora')
  if (zona === undefined) delete process.env.TZ; else process.env.TZ = zona
  ok(T.fechaCorta(null) === '—' && T.fechaHora(null) === '—' && T.fechaCorta('nada') === '—', 'sin fecha, o una que no se entiende: «—»')

  // «Revisada: —» y tooltips.
  const creada = { id: 3, titulo: 'Breakouts', texto: 'x', estado: 'idea', relacionados: [], created_at: '2026-10-31T23:21:14Z', updated_at: '2026-10-31T23:21:14Z', revisada_en: null }
  const borrador3 = { titulo: 'Breakouts', texto: 'x', estado: 'idea', relacionados: [] }
  h = monta({ tesis: [creada], abierta: 3, borrador: borrador3 })
  ok(h.includes('>Revisada: —<') && h.includes('>Creada 01/11/2026<') && h.includes('title="Creada el 01/11/2026 a las 00:21"'), 'guardada y sin revisar: «Creada 01/11/2026 · Revisada: —», con el tooltip de día y hora')
  ok(T.haceTexto(creada, new Date('2026-11-01T12:00:00Z')) === 'creada hoy', 'en la lista, una sin revisar dice «creada…»')
  h = monta({ tesis: [{ ...creada, revisada_en: '2026-11-05T19:05:00Z' }], abierta: 3, borrador: borrador3 })
  ok(h.includes('>Revisada 05/11/2026<') && h.includes('title="Revisada el 05/11/2026 a las 20:05"') && !h.includes('Revisada: —'), 'tras «Marcar como revisada hoy»: su fecha, con el tooltip de día y hora')
  ok(T.haceTexto({ ...creada, revisada_en: '2026-10-31T23:21:30Z' }, new Date('2026-11-01T12:00:00Z')) === 'revisada hoy', 'revisarla un momento después de crearla ya cuenta como revisada')
  h = monta({ tesis: [creada], nueva: true, borrador: { titulo: 'Nueva tesis', texto: '', estado: 'idea', relacionados: [] } })
  ok(h.includes('Sin guardar todavía') && h.includes('>Revisada: —<') && /data-revisada="true" disabled=""/.test(h), 'nueva: «Sin guardar todavía · Revisada: —», y sin poder marcarla aún')
  ok(!('revisada_en' in T.camposDe({ titulo: 'x', revisada_en: 'a', created_at: 'b' })) && !('created_at' in T.camposDe({ titulo: 'x', created_at: 'b' })), 'lo que se guarda nunca lleva fechas, ni aunque vinieran en el borrador')
  ok(/revisada_en  timestamptz,/.test(leer('sql', 'tesis_inversion.sql')) && !/revisada_en\s+timestamptz NOT NULL/.test(leer('sql', 'tesis_inversion.sql')), 'la tabla admite la revisión vacía')

  // «Descartar cambios»: solo con cambios sin guardar.
  h = monta({ tesis: [creada], abierta: 3, borrador: borrador3 })
  ok(!h.includes('data-descartar') && !h.includes('Descartar cambios'), 'sin cambios: no hay «Descartar cambios»')
  h = monta({ tesis: [creada], abierta: 3, borrador: { ...borrador3, texto: 'otro' } })
  ok(h.includes('data-descartar') && h.includes('>Descartar cambios<') && h.indexOf('data-guardar') < h.indexOf('data-descartar'), 'con cambios: «Descartar cambios», junto a «Guardar»')
  h = monta({ tesis: [creada], nueva: true, borrador: { titulo: 'Nueva tesis', texto: '', estado: 'idea', relacionados: [] } })
  ok(h.includes('>Descartar cambios<'), 'en una nueva sin guardar, también')
  ok(fuentePanel.includes(`if (nueva) siguiente(tesis || []); else if (fila) abre(fila)`), 'descartar: la nueva desaparece (se abre la siguiente); la guardada vuelve a lo guardado, con el editor nuevo')
  ok(fuentePanel.includes(`setBorr(borradorDe(t))`) && fuentePanel.includes(`setHoja(n => n + 1); setNueva(false)`), 'abrir vuelve al título, el texto, el estado y los enlaces guardados')
  const guardada = T.igualesTesis(borrador3, { titulo: 'Breakouts', texto: 'x', estado: 'idea', relacionados: [] })
  ok(guardada && !T.igualesTesis({ ...borrador3, relacionados: [{ tipo: 'plan', id: '1' }] }, borrador3) && !T.igualesTesis({ ...borrador3, estado: 'marcha' }, borrador3) && !T.igualesTesis({ ...borrador3, titulo: 'Y' }, borrador3), 'lo guardado no marca cambios; cambiar título, estado o enlaces, sí')

  // La ventana de salida, sus tres caminos.
  const camino = async (que, guardarDa) => { const hecho = []; const r = await T.respondeSalida(que, { guardar: async () => { hecho.push('guardar'); return guardarDa }, descartar: () => hecho.push('descartar'), seguir: () => hecho.push('seguir') }); return `${r}:${hecho.join('+')}` }
  ok(await camino('guardar', true) === 'sigue:guardar+seguir', 'Guardar: guarda y continúa')
  ok(await camino('guardar', false) === 'fallo:guardar', 'Guardar que falla: NO continúa')
  ok(await camino('salir') === 'sigue:descartar+seguir', 'Salir sin guardar: descarta y continúa')
  ok(await camino('cancelar') === 'queda:', 'Cancelar: te quedas, sin tocar nada')
  const conFallo = { ...ctx, fetch: async () => responde(500, { message: 'caída' }) }
  let e3 = null; try { await T.cambiarTesis(conFallo, 3, borrador3) } catch (e) { e3 = e.message }
  ok(e3 === 'No se pudo guardar los cambios (HTTP 500: caída).', `guardar que falla da su error: «${e3}»`)
  h = monta({ tesis: [creada], abierta: 3, borrador: { ...borrador3, texto: 'otro' }, pregunta: true, falloPregunta: true, fallo: e3 })
  ok(h.slice(h.indexOf('data-pregunta="sin-guardar"')).includes(`⚠ ${e3}`) && h.includes('data-pregunta="sin-guardar"'), 'si guardar falla, la ventana sigue abierta y muestra el error')
  h = monta({ tesis: [creada], abierta: 3, borrador: { ...borrador3, titulo: ' ' }, pregunta: true })
  ok(h.includes('data-aviso-pregunta') && h.includes('Ponle un título.') && /data-salida="guardar" disabled=""/.test(h) && !/data-salida="salir" disabled=""/.test(h), 'sin título no se puede guardar: dice por qué y deja salir sin guardar')
  ok(!/confirm\(/.test(fuentePanel) && fuentePanel.includes(`window.addEventListener('beforeunload', avisa)`), 'ni un confirm() del navegador; al cerrar o recargar sigue avisando el navegador')
  ok(fuentePanel.includes('conGuardia(() => onAbrirPlan(f.id))'), '«Abrir» de un plan también pregunta si hay cambios')
  ok(fuentePanel.includes('data-nueva onClick={() => conGuardia(creaNueva)}') && fuentePanel.includes('conGuardia(() => abre(t))') && fuentePanel.includes('conGuardia(() => onAbrirEstrategia(f.fila))') && fuentePanel.includes('salida.current = (seguir)'), 'pregunta en la pantalla: otra tesis, «+ Nueva tesis» y «Abrir»')
  ok(leer('pages', 'index.js').includes(`e.target.tagName==='SELECT'||e.target.isContentEditable) return`), 'escribir en el editor no abre el buscador de símbolos')
  // Las salidas desde fuera de la pantalla: pages/index.js es demasiado grande para montarlo aquí, así que se mira su código (y se probó con clics en el navegador).
  const fuenteIndex = leer('pages', 'index.js')
  ok(fuenteIndex.includes(`if(sidePanel==='tesis'&&tesisSalida.current?.(seguir)) return; if(sidePanel==='builder'&&builderSalida.current?.(seguir)) return; seguir()`), 'salirDeTesis: en Tesis o en el Builder y con cambios pregunta y sigue al responder; si no, sigue sin más')
  ok(fuenteIndex.includes(`else salirDeTesis(()=>setSidePanel(item.id))`) && fuenteIndex.includes(`className="header-logo" onClick={()=>salirDeTesis(()=>{`) && fuenteIndex.includes(`onClick={()=>salirDeTesis(handleLogout)}`), 'también preguntan el menú, el logo y «Cerrar sesión»')
  const llamadasPanel = fuenteIndex.split('\n').map((x, k) => [x, k + 1]).filter(([x]) => /setSidePanel\(/.test(x)).length
  ok(fuenteIndex.includes(), 'abrir una tesis desde el Builder también pregunta')
  ok(llamadasPanel === 17, `los sitios que cambian de pestaña siguen siendo los revisados (${llamadasPanel}; si cambia, mirar si el nuevo saca de Tesis sin preguntar: docs/tesis.md)`)

  // El buscador.
  const tres2 = [
    { id: 1, titulo: 'Métricas para screener', texto: '<p>Sin más</p>', estado: 'idea', relacionados: [], created_at: dias(1), revisada_en: null },
    { id: 2, titulo: 'Growth investing', texto: '<p>Una frase larga que sirve para <strong>describir</strong> la entrada del valor y lo que tiene que pasar después de comprar.</p><p><a href="https://descripcion.example/scr">enlace</a></p>', estado: 'idea', relacionados: [], created_at: dias(2), revisada_en: null },
    { id: 3, titulo: 'Bancos', texto: 'La descripción en texto plano de antes', estado: 'idea', relacionados: [], created_at: dias(3), revisada_en: null },
  ]
  const idsDe = (xs) => xs.map(t => t.id).join()
  const textoDe = (trozos) => trozos.map(x => x.t).join('')
  const marcado = (trozos) => trozos.filter(x => x.marca).map(x => x.t).join('|')
  ok(idsDe(T.buscaTesis(tres2, 'descripcion')) === '' && idsDe(T.buscaTesis(tres2, 'BANCOS')) === '3', 'por defecto, SOLO en los títulos')
  ok(idsDe(T.buscaTesis(tres2, 'metricas')) === '1' && idsDe(T.buscaTesis(tres2, 'MÉTRICAS')) === '1', 'sin distinguir mayúsculas ni acentos, en el título')
  ok(idsDe(T.buscaTesis(tres2, 'descripcion', true)) === '3' && idsDe(T.buscaTesis(tres2, 'DESCRIPCIÓN', true)) === '3', 'con el texto: «descripcion» encuentra «descripción», y no la dirección de un enlace')
  ok(idsDe(T.buscaTesis(tres2, 'scr', true)) === '1,2,3' && T.buscaTesis(tres2, 'example', true).length === 0 && T.buscaTesis(tres2, 'strong', true).length === 0, 'con el texto: «scr» en las tres; «example» y «strong» (dirección y etiqueta) en ninguna')
  ok(idsDe(T.buscaTesis(tres2, '')) === '1,2,3', 'sin nada escrito (también tras pulsar ✕), todas')
  const linea = T.lineaCoincidencia(tres2[1], 'scr')
  ok(marcado(linea) === 'scr' && textoDe(linea).includes('para describir la entrada') && textoDe(linea).startsWith('…') && textoDe(linea).endsWith('…') && textoDe(linea).length < 90 && !/<|href/.test(textoDe(linea)), `la línea corta, con lo buscado resaltado: «${textoDe(linea)}»`)
  const lineaAcento = T.lineaCoincidencia(tres2[2], 'descripcion')
  ok(marcado(lineaAcento) === 'descripción' && textoDe(lineaAcento) === 'La descripción en texto plano de antes', `con acentos, se resalta la palabra original: «${marcado(lineaAcento)}»`)
  ok(T.lineaCoincidencia(tres2[0], 'screener') === null && T.lineaCoincidencia(tres2[0], 'METRICAS') === null, 'si coincide en el título, no hay línea')
  ok(marcado(T.lineaCoincidencia(tres2[0], 'metricas sin')) === 'Sin', 'dos palabras, una en el título y otra en el texto: la línea, por la del texto')
  ok(T.lineaCoincidencia(tres2[0], 'nada') === null && T.lineaCoincidencia(tres2[0], '') === null, 'sin nada que enseñar, sin línea')
  ok(textoDe(T.lineaCoincidencia({ titulo: 'x', texto: '<p>a &lt;b&gt; c</p>' }, 'c')) === 'a <b> c', 'la línea es texto visible (lo escrito con «<» no es una etiqueta)')
  h = monta({ tesis: tres2, abierta: 1, borrador: { titulo: tres2[0].titulo, texto: tres2[0].texto, estado: 'idea', relacionados: [] } })
  ok(/data-buscar-texto="true" aria-pressed="false"/.test(h) && h.includes('title="Buscar solo en títulos"') && h.includes('placeholder="Buscar en los títulos…"') && !h.includes('data-borrar-busca'), 'de entrada: el icono apagado, «Buscar solo en títulos» y sin ✕ (no hay nada escrito)')
  h = monta({ tesis: tres2, abierta: 1, borrador: { titulo: tres2[0].titulo, texto: tres2[0].texto, estado: 'idea', relacionados: [] }, enTexto: true })
  ok(/data-buscar-texto="true" aria-pressed="true"/.test(h) && h.includes('title="Buscar también en el texto"') && h.includes(B0.siguienteBorde) && !h.includes('data-linea-texto'), 'encendido: resaltado, «Buscar también en el texto»; sin buscar nada, sin líneas')
  const bor1 = { titulo: tres2[0].titulo, texto: tres2[0].texto, estado: 'idea', relacionados: [] }
  h = monta({ tesis: tres2, abierta: 1, borrador: bor1, busca: 'scr' })
  ok(h.includes('data-borrar-busca') && h.includes('>✕<') && cuenta(h, 'data-item="') === 1 && h.includes('data-item="1"') && !h.includes('data-linea-texto') && /<mark[^>]*>scr<\/mark>/.test(h), 'buscar «scr» solo en títulos: una tesis, resaltada en el título, sin línea, y con la ✕')
  ok(fuentePanel.includes(`onClick={() => { setBusca('');`), 'la ✕ borra lo escrito')
  h = monta({ tesis: tres2, abierta: 1, borrador: bor1, busca: 'scr', enTexto: true })
  const trozoLista2 = h.slice(h.indexOf('data-lista'), h.indexOf('data-abierta'))
  ok(cuenta(trozoLista2, 'data-item="') === 3 && cuenta(trozoLista2, 'data-linea-texto') === 2 && cuenta(trozoLista2, '<mark') === 3 && !/href|&lt;strong/.test(trozoLista2), 'buscar «scr» con el texto: tres tesis; una resaltada en el título y dos con su línea resaltada')
  h = monta({ tesis: [{ ...tres2[0], titulo: '<b>x</b> scr' }], abierta: 1, borrador: bor1, busca: 'scr' })
  ok(h.slice(h.indexOf('data-lista'), h.indexOf('data-abierta')).includes('&lt;b&gt;x&lt;/b&gt;'), 'un título con «<b>» se ve como texto: resaltar nunca interpreta HTML')
  const memoria = () => { const m = {}; return { m, getItem: (k) => m[k] ?? null, setItem: (k, v) => { m[k] = v } } }
  const alm = memoria()
  ok(T.leeBuscarEnTexto(alm) === false, 'recordar: apagado por defecto')
  T.guardaBuscarEnTexto(true, alm)
  ok(T.leeBuscarEnTexto(alm) === true, 'recordar: encendido se queda encendido')
  T.guardaBuscarEnTexto(false, alm)
  ok(T.leeBuscarEnTexto(alm) === false, 'recordar: y apagado, apagado')
  const roto = { getItem: () => { throw new Error('bloqueado') }, setItem: () => { throw new Error('bloqueado') } }
  let sinFallo = true; try { T.guardaBuscarEnTexto(true, roto); sinFallo = T.leeBuscarEnTexto(roto) === false && T.leeBuscarEnTexto() === false } catch (_) { sinFallo = false }
  ok(sinFallo, 'con el navegador sin permiso para guardar: ni falla ni se enciende')

  console.log(fallos ? `tesis: ${fallos} fallos` : 'tesis: todas bien')
  process.exit(fallos ? 1 : 0)
})().catch(e => { console.error(e); process.exit(2) })
