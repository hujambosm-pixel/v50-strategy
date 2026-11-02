// scripts/comprobaciones/tesisArchivos.js — «Imágenes y adjuntos» de la pantalla «Tesis» (docs/tesis.md). Las corre comunes.sh. Termina en 0 si todo va bien.
// Sin base de datos ni navegador: lib/tesisArchivos.js con un fetch falso (método, dirección y cuerpo de cada llamada), sus piezas puras y el SQL.
// La seguridad con dos usuarios, aparte: scripts/comprobaciones/tesisSeguridad.js (habla con la base de verdad).
const path = require('path'), fs = require('fs')
const C0 = require('./cargador'), R = C0.RAIZ
let fallos = 0
const ok = (c, t) => { console.log(`${c ? 'OK  ' : 'MAL '} ${t}`); if (!c) fallos++ }
const lanza = async (fn) => { try { await fn(); return null } catch (e) { return e.message } }
const B_AMAR = () => '#f2cc60'

;(async () => {
  await C0.prepara(); C0.registra(R)
  const A = require(path.join(R, 'lib', 'tesisArchivos.js'))
  const leer = (...r) => fs.readFileSync(path.join(R, ...r), 'utf8')

  // ── 1 · Piezas puras ──
  const t = A.tamanoLegible
  ok(t(87040) === '85 KB' && t(1153434) === '1,1 MB' && t(52428800) === '50 MB' && t(1073741824) === '1 GB' && t(1288490188) === '1,2 GB' && t(512) === '512 bytes' && t(0) === '0 bytes' && t(1024) === '1 KB',
    `tamaños con coma decimal: ${[87040, 1153434, 52428800, 1073741824, 1288490188, 512].map(t).join(' · ')}`)
  ok(t(1048575) === '1 MB' && t(1073741823) === '1 GB' && t(10485760) === '10 MB', 'sin «1024 KB» ni «1024 MB» en las fronteras')
  ok(['a.PNG', 'b.jpg', 'c.jpeg', 'd.gif', 'e.webp'].every(n => A.visorDe(n) === 'imagen') && A.visorDe('guía.PDF') === 'pdf' && ['x.docx', 'x.doc', 'x.xlsx', 'x.xls', 'x.pptx', 'x.ppt', 'x.csv', 'x.txt', 'sin'].every(n => A.visorDe(n) === 'descargar'), 'extensión → visor: imagen, pdf o descargar')
  ok(A.tipoDe('Mi guía.PDF').extension === 'pdf' && A.tipoDe('Mi guía.PDF').mime === 'application/pdf' && A.tipoDe('a.jpg').mime === 'image/jpeg' && A.tipoDe('a.csv', 'application/vnd.ms-excel').mime === 'text/csv', 'el tipo sale de la extensión, no de lo que diga el navegador')
  ok(A.tipoDe('image', 'image/png').extension === 'png' && A.tipoDe('', 'image/webp').extension === 'webp', 'una captura pegada sin extensión: la de su tipo')
  ok(['a.svg', 'a.html', 'a.htm', 'a.exe', 'a.js', 'sin'].every(n => A.tipoDe(n) === null) && A.tipoDe('a', 'image/svg+xml') === null && A.tipoDe('a.svg', 'image/png') === null && A.tipoDe('a', 'text/html') === null, 'svg, html y demás: rechazados')
  ok(A.esImagenAdmitida('a.png') && A.esImagenAdmitida('x', 'image/gif') && !A.esImagenAdmitida('a.pdf') && !A.esImagenAdmitida('a.svg') && !A.esImagenAdmitida('a.bmp', 'image/bmp'), 'imágenes para el texto: png, jpg, gif y webp')
  ok(A.cabe(100, 0) === null && A.cabe(52428800, 0) === null && A.cabe(52428801, 0) === 'archivo' && A.cabe(0, 0) === 'vacio', '¿cabe? 50 MB justos sí; un byte más, no; vacío, no')
  ok(A.cabe(1, 1073741823) === null && A.cabe(2, 1073741823) === 'total' && A.MAX_TOTAL === 1073741824, '¿cabe? hasta 1.073.741.824 bytes en total')
  ok(A.avisoPesa('Guía.pdf', 62914560) === '⚠ «Guía.pdf» pesa 60 MB: el máximo por archivo es 50 MB.', A.avisoPesa('Guía.pdf', 62914560))
  ok(A.avisoEspacio(1073741824) === '⚠ No queda espacio: usas 1 GB de 1 GB. Borra adjuntos que no necesites.', A.avisoEspacio(1073741824))
  ok(A.AVISO_SIN_GUARDAR === 'Guarda la tesis antes de añadir archivos.' && A.AVISO_TIPO === 'Ese tipo de archivo no se puede añadir.', 'los otros dos avisos, tal cual')
  ok(A.avisoDe({ name: 'a.svg', size: 5 }) === A.AVISO_TIPO && A.avisoDe({ name: 'a.pdf', size: 52428801 }).includes('pesa 50 MB') && A.avisoDe({ name: 'a.pdf', size: 10 }, 1073741823).startsWith('⚠ No queda') && A.avisoDe({ name: 'a.pdf', size: 0 }) === '⚠ «a.pdf» está vacío.' && A.avisoDe({ name: 'a.pdf', size: 10 }) === null, 'el aviso de cada caso')
  const largo = 'ñ'.repeat(300) + '.docx'
  ok(A.nombreLimpio(largo).length === 200 && A.nombreLimpio(largo).endsWith('.docx') && A.nombreLimpio('  Mi   guía.pdf ') === 'Mi guía.pdf' && A.nombreLimpio('') === 'archivo', 'nombre original: tildes, hasta 200, sin perder la extensión')
  const jwt = (o) => `x.${Buffer.from(JSON.stringify(o)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}.y`
  const U = '11111111-2222-3333-4444-555555555555'
  ok(A.usuarioDe({ headers: { Authorization: `Bearer ${jwt({ sub: U, nombre: 'ñandú' })}` } }) === U && A.usuarioDe({ headers: { Authorization: 'Bearer anon' } }) === null && A.usuarioDe({ headers: {} }) === null, 'el usuario sale del token; sin sesión, null')
  const res = A.resumenArchivos([{ tesis_id: 1, clase: 'adjunto', bytes: 10 }, { tesis_id: 1, clase: 'imagen', bytes: 5 }, { tesis_id: 2, clase: 'adjunto', bytes: '7' }])
  ok(res.bytes === 22 && res.porTesis[1].adjuntos === 1 && res.porTesis[1].imagenes === 1 && res.porTesis[1].bytes === 15 && res.porTesis[2].bytes === 7, 'resumen por tesis y total')

  // La tienda de URL del editor: todas en un lote; si una falla, se pide una vez más.
  const lotes = []
  let responder = (rs) => Object.fromEntries(rs.map(x => [x, `https://f/${x}?v=${lotes.length}`]))
  const ti = A.tiendaUrls(async (rs) => { lotes.push(rs); return responder(rs) })
  let cambios = 0
  const deja = ti.oye(() => { cambios++ })
  ti.pide('a'); ti.pide('b'); ti.pide('a')
  await new Promise(x => setTimeout(x, 0))
  ok(lotes.length === 1 && lotes[0].join() === 'a,b' && ti.url('a') === 'https://f/a?v=1' && cambios === 1, 'las imágenes que se abren juntas salen en UN solo lote')
  ti.pide('a'); await new Promise(x => setTimeout(x, 0))
  ok(lotes.length === 1, 'la que ya tiene URL no se pide otra vez')
  ti.fallo('a'); await new Promise(x => setTimeout(x, 0))
  ok(lotes.length === 2 && ti.url('a') === 'https://f/a?v=2' && !ti.rota('a'), 'si no carga (ha caducado), se pide una vez más')
  ti.fallo('a'); await new Promise(x => setTimeout(x, 0))
  ok(lotes.length === 2 && ti.url('a') === null && ti.rota('a'), 'y si vuelve a fallar: «Imagen no disponible», sin insistir')
  responder = () => { throw new Error('caída') }
  ti.pide('c'); await new Promise(x => setTimeout(x, 0))
  ok(ti.rota('c') && ti.url('c') === null, 'sin poder firmar: tampoco se rompe')
  ti.pon('d', 'https://u'); deja(); const c0 = cambios; ti.pon('e', 'x')
  ok(ti.url('d') === 'https://u' && cambios === c0, 'una recién subida trae su URL; quien deja de oír, no recibe más')

  // ── 2 · Las llamadas ──
  const llamadas = []
  const responde = (status, cuerpo) => ({ ok: status < 400, status, json: async () => cuerpo })
  const fila = (o = {}) => ({ id: 3, tesis_id: 7, clase: 'adjunto', ruta: `${U}/7/adjunto/a.pdf`, nombre: 'Guía.pdf', tipo: 'application/pdf', bytes: 9, created_at: '2026-11-02T00:00:00Z', ...o })
  let filaFalla = false, bucketFalla = false
  const ctx = { url: 'https://x', headers: { apikey: 'k', Authorization: `Bearer ${jwt({ sub: U })}`, 'Content-Type': 'application/json' }, fetch: async (u, o = {}) => {
    llamadas.push({ u, o })
    if (u.includes('/storage/v1/object/sign/')) return responde(200, o.body.includes('paths') ? JSON.parse(o.body).paths.map(p => p === 'no' ? { path: p, error: 'x', signedURL: null } : { path: p, error: null, signedURL: `/object/sign/tesis-archivos/${p}?token=t` }) : { signedURL: '/object/sign/tesis-archivos/r?token=t' })
    if (u.includes('/storage/v1/object/')) return bucketFalla ? responde(500, { message: 'caída' }) : responde(200, o.method === 'DELETE' ? [] : { Key: 'k' })
    if (o.method === 'POST') return filaFalla ? responde(403, { message: 'row-level security' }) : responde(201, [fila()])
    if (o.method === 'DELETE') return responde(204, null)
    return responde(200, u.includes('offset=') ? [] : [fila(), fila({ id: 4, clase: 'imagen', ruta: `${U}/7/imagen/b.png` })])
  } }
  const archivo = { name: 'Guía de 24 páginas.PDF', type: 'application/x-raro', size: 9 }
  let r = await A.subir(ctx, { tesisId: 7, clase: 'adjunto', archivo })
  const [sube, crea] = llamadas.splice(0)
  ok(new RegExp(`^https://x/storage/v1/object/tesis-archivos/${U}/7/adjunto/[0-9a-f-]{36}\\.pdf$`).test(sube.u) && sube.o.method === 'POST' && sube.o.body === archivo && sube.o.headers['Content-Type'] === 'application/pdf' && sube.o.headers['x-upsert'] === 'false', 'subir: a <usuario>/<tesis>/<clase>/<uuid>.<ext>, sin el nombre en la ruta, con su tipo y sin sobrescribir')
  const b = JSON.parse(crea.o.body)
  ok(crea.u.startsWith('https://x/rest/v1/tesis_adjuntos?') && crea.o.method === 'POST' && b.tesis_id === 7 && b.clase === 'adjunto' && b.nombre === archivo.name && b.tipo === 'application/pdf' && b.bytes === 9 && sube.u.endsWith(b.ruta) && !('user_id' in b), 'subir: la fila con el nombre ORIGINAL y sin user_id (lo pone la base)')
  ok(r.id === 3, 'subir devuelve la fila')
  filaFalla = true
  let e = await lanza(() => A.subir(ctx, { tesisId: 7, clase: 'imagen', archivo: { name: 'a.png', type: 'image/png', size: 4 } }))
  filaFalla = false
  const [s2, , limpia] = llamadas.splice(0)
  ok(/No se pudo guardar «a\.png» \(HTTP 403/.test(e || '') && limpia?.o.method === 'DELETE' && JSON.parse(limpia.o.body).prefixes[0] === s2.u.split('/tesis-archivos/')[1], 'si la fila falla, borra lo subido y da el error')
  bucketFalla = true
  e = await lanza(() => A.subir(ctx, { tesisId: 7, clase: 'adjunto', archivo }))
  bucketFalla = false
  ok(/No se pudo subir «Guía de 24 páginas\.PDF» \(HTTP 500: caída\)/.test(e || '') && llamadas.splice(0).length === 1, 'si el bucket falla, no se crea la fila')
  e = await lanza(() => A.subir(ctx, { tesisId: 7, clase: 'adjunto', archivo: { name: 'x.svg', type: 'image/svg+xml', size: 4 } }))
  ok(e === A.AVISO_TIPO && !llamadas.length, 'un svg no llega ni a salir')
  e = await lanza(() => A.subir({ ...ctx, headers: { apikey: 'k' } }, { tesisId: 7, clase: 'adjunto', archivo }))
  ok(/no hay sesión/.test(e || '') && !llamadas.length, 'sin sesión no se sube')
  // Con progreso (XMLHttpRequest).
  const sobres = []
  class XHR { constructor() { this.upload = {}; this.h = {} } open(m, u) { this.m = m; this.u = u } setRequestHeader(k, v) { this.h[k] = v } send() { sobres.push(this); this.upload.onprogress({ lengthComputable: true, loaded: 31, total: 50 }); this.status = XHR.estado; this.responseText = '{"Key":"k"}'; this.onload() } }
  globalThis.XMLHttpRequest = XHR; XHR.estado = 200
  const vistos = []
  await A.subir(ctx, { tesisId: 7, clase: 'adjunto', archivo, alProgreso: (x) => vistos.push(x) })
  ok(vistos[0] === 0.62 && sobres[0].m === 'POST' && sobres[0].h['Content-Type'] === 'application/pdf' && llamadas.splice(0).length === 1, 'con progreso: 62 %, por XMLHttpRequest, y la fila por fetch')
  XHR.estado = 401
  await A.subir(ctx, { tesisId: 7, clase: 'adjunto', archivo, alProgreso: () => {} })
  ok(llamadas.splice(0).length === 2, 'con el token caducado (401): repite por ctx.fetch, que renueva la sesión')
  delete globalThis.XMLHttpRequest

  const xs = await A.listar(ctx, 7)
  ok(xs.length === 2 && /tesis_id=eq\.7&order=created_at\.desc,id\.desc/.test(llamadas.pop().u), 'listar: de esa tesis, el más reciente primero')
  const paginas = []
  const ctxPag = { ...ctx, fetch: async (u) => { paginas.push(u); return responde(200, u.includes('offset=0') ? Array.from({ length: 1000 }, () => ({ tesis_id: 1, clase: 'adjunto', bytes: 2 })) : [{ tesis_id: 2, clase: 'imagen', bytes: 3 }]) } }
  ok(await A.espacioUsado(ctxPag) === 2003 && paginas.length === 2 && !paginas[0].includes('tesis_id=eq'), 'espacio usado: la suma de TODAS las tesis, por páginas')
  ok(await A.urlFirmada(ctx, 'r', 60) === 'https://x/storage/v1/object/sign/tesis-archivos/r?token=t' && JSON.parse(llamadas.pop().o.body).expiresIn === 60, 'URL firmada, con su caducidad')
  const lote = await A.urlsFirmadas(ctx, ['a', 'no', 'a', 'b'])
  const pl = JSON.parse(llamadas.pop().o.body)
  ok(Object.keys(lote).join() === 'a,b' && lote.a.startsWith('https://x/storage/v1/object/sign/') && pl.paths.join() === 'a,no,b' && pl.expiresIn === 3600, 'en lote: 1 hora, sin repetir, y sin las que no se pueden firmar')
  ok(Object.keys(await A.urlsFirmadas(ctx, [])).length === 0 && !llamadas.length, 'sin rutas, sin llamada')
  let abierta = null
  await A.descargar(ctx, { ruta: 'r', nombre: 'Guía ñ & co.pdf' }, (u) => { abierta = u }); llamadas.pop()
  ok(abierta === 'https://x/storage/v1/object/sign/tesis-archivos/r?token=t&download=Gu%C3%ADa%20%C3%B1%20%26%20co.pdf', 'descargar: con el nombre ORIGINAL')
  ok(await A.borrar(ctx, [fila(), fila({ id: 4, ruta: 'otra' })]) === 2, 'borrar devuelve cuántos')
  const [bb, bf] = llamadas.splice(0)
  ok(bb.u === 'https://x/storage/v1/object/tesis-archivos' && bb.o.method === 'DELETE' && JSON.parse(bb.o.body).prefixes.join() === `${U}/7/adjunto/a.pdf,otra` && bf.u.endsWith('tesis_adjuntos?id=in.(3,4)') && bf.o.method === 'DELETE', 'borrar: primero el archivo y luego la fila')
  bucketFalla = true
  e = await lanza(() => A.borrar(ctx, [fila()]))
  bucketFalla = false
  ok(/No se pudo borrar el archivo/.test(e || '') && llamadas.splice(0).length === 1, 'si el archivo no se puede borrar, la fila se queda')
  ok(await A.borrar(ctx, []) === 0 && !llamadas.length, 'borrar nada: sin llamadas')
  ok(await A.borrarTodoDeTesis(ctx, 7) === 2 && llamadas.length === 3 && llamadas[0].u.includes('tesis_id=eq.7'), 'borrar todo lo de una tesis')
  llamadas.length = 0

  // ── Piezas de la zona Adjuntos y del visor ──
  ok(A.etiquetaTipo('a.PDF').texto === 'PDF' && A.etiquetaTipo('a.pdf').color === '#d1242f' && A.etiquetaTipo('a.docx').texto === 'DOCX' && A.etiquetaTipo('a.docx').color === '#1f6feb' && A.etiquetaTipo('a.xlsx').color === '#1a7f37' && A.etiquetaTipo('a.csv').texto === 'CSV' && A.etiquetaTipo('a.csv').color === '#57606a', 'etiquetas: PDF rojo, DOCX azul, XLSX verde, el resto su extensión en gris')
  ok(A.nombreDocumento('a.docx') === 'Word' && A.nombreDocumento('a.xls') === 'Excel' && A.nombreDocumento('a.pptx') === 'PowerPoint', '«Los archivos de Word / Excel / PowerPoint…»')
  ok(A.avisoBorrarTesis({ adjuntos: 2, imagenes: 3, bytes: 1153434 }) === 'Se borran también sus 2 adjuntos y 3 imágenes del texto (1,1 MB en total). No se puede recuperar.', A.avisoBorrarTesis({ adjuntos: 2, imagenes: 3, bytes: 1153434 }))
  ok(A.avisoBorrarTesis({ adjuntos: 1, imagenes: 0, bytes: 87040 }) === 'Se borran también sus 1 adjunto (85 KB en total). No se puede recuperar.' && A.avisoBorrarTesis({ adjuntos: 0, imagenes: 1, bytes: 1024 }).includes('1 imagen del texto') && A.avisoBorrarTesis({ adjuntos: 0, imagenes: 0, bytes: 0 }) === null && A.avisoBorrarTesis(undefined) === null, 'con uno solo y sin archivos: sin aviso de más')
  const G = 1073741824
  ok(A.colorEspacio(0) === '#3fb950' && A.colorEspacio(G * 0.79) === '#3fb950' && A.colorEspacio(G * 0.8) === '#d4a72c' && A.colorEspacio(G * 0.949) === '#d4a72c' && A.colorEspacio(G * 0.95) === '#f85149', 'barra de espacio: verde, ámbar desde el 80 % y roja desde el 95 %')
  ok(A.porcentajeEspacio(G / 2) === 50 && A.porcentajeEspacio(G * 2) === 100 && A.porcentajeEspacio(0) === 0, 'la barra no se sale')

  // ── Montaje de la zona y del visor (sin navegador) ──
  const React = require(path.join(R, 'node_modules', 'react')), { renderToString } = require(path.join(R, 'node_modules', 'react-dom', 'server'))
  const P = require(path.join(R, 'components', 'TesisPanel.js')).default
  const pinta = (o) => renderToString(React.createElement(P, { estrategias: [], deps: { ctx, Editor: () => React.createElement('div', { 'data-texto': '' }) }, inicial: { planes: [], ...o } })).split('<!-- -->').join('')
  const cuenta = (h, s) => h.split(s).length - 1
  const tes = { id: 7, titulo: 'Semis', texto: '', estado: 'idea', relacionados: [], created_at: '2026-10-01T10:00:00Z', revisada_en: null }
  const otra = { ...tes, id: 8, titulo: 'Oro' }
  const bor = { titulo: 'Semis', texto: '', estado: 'idea', relacionados: [] }
  const arch = [
    fila({ id: 1, nombre: 'Guía de 24 páginas con un nombre larguísimo.pdf', ruta: 'r1', bytes: 1153434 }),
    fila({ id: 2, nombre: 'Hoja.xlsx', ruta: 'r2', bytes: 87040 }),
    fila({ id: 3, nombre: 'Informe.docx', ruta: 'r3', bytes: 1024 }),
    fila({ id: 4, nombre: 'Captura.png', ruta: 'r4', bytes: 2048 }),
    fila({ id: 5, nombre: 'Datos.csv', ruta: 'r5', bytes: 10 }),
    fila({ id: 6, clase: 'imagen', nombre: 'Pegada.png', ruta: 'r6', bytes: 2048 }),
  ]
  const base = { tesis: [tes, otra], abierta: 7, borrador: bor, archivos: arch, urls: { r1: 'https://f/r1', r4: 'https://f/r4', r6: 'https://f/r6' }, resumen: A.resumenArchivos(arch) }
  let h = pinta(base)
  ok(h.includes('Adjuntos (5)') && cuenta(h, 'data-adjunto="') === 5 && !h.includes('Pegada.png') && h.includes('Ocupan 1,2 MB') && h.indexOf('data-adjuntos') < h.indexOf('data-relacionado') && h.indexOf('data-texto') < h.indexOf('data-adjuntos'), 'la zona: debajo del editor y encima de «Relacionado», sin las imágenes del texto')
  ok(h.includes('Arrastra archivos aquí o') && h.includes('+ Añadir archivos') && /type="file"[^>]*multiple/.test(h), '«Arrastra archivos aquí o» y «+ Añadir archivos» (varios a la vez)')
  ok(h.includes('<img src="https://f/r4"') && ['data-etiqueta-tipo="PDF"', 'data-etiqueta-tipo="XLSX"', 'data-etiqueta-tipo="DOCX"', 'data-etiqueta-tipo="CSV"'].every(x => h.includes(x)), 'miniaturas: la imagen, y la etiqueta del tipo en lo demás')
  ok(h.includes('title="Guía de 24 páginas con un nombre larguísimo.pdf"') && h.includes('85 KB · solo descargar') && h.includes('1 KB · solo descargar') && h.includes('>1,1 MB<') && cuenta(h, 'data-borrar-adjunto') === 5 && cuenta(h, 'data-descargar-adjunto') === 5, 'cada tarjeta: nombre con tooltip, tamaño («· solo descargar» en Word y Excel), descargar y borrar')
  ok(h.includes('Espacio usado (todas las tesis)') && h.includes('1,2 MB de 1 GB') && /data-espacio-barra[^>]*#3fb950/.test(h), 'abajo de la lista: el espacio usado, con su barra verde')
  ok(h.includes('data-clip="4"') === false && h.includes('data-clip="5"') && !/data-item="8"[\s\S]*?data-clip[\s\S]*?data-espacio/.test(h.slice(h.indexOf('data-item="8"'), h.indexOf('data-espacio'))), 'el clip con el número, solo en la tesis con adjuntos (las imágenes no cuentan)')
  h = pinta({ ...base, subidas: [{ id: 'a', nombre: 'Guía.pdf', progreso: 0.62 }], avisosAdjuntos: [A.avisoPesa('Grande.pdf', 62914560)], arrastrando: true })
  ok(h.includes('Subiendo… 62 %') && h.includes('width:62%') && h.includes('⚠ «Grande.pdf» pesa 60 MB') && h.includes('Suelta aquí para añadirlos a esta tesis') && h.includes('dashed'), 'mientras sube: fila con barra y «Subiendo… 62 %»; avisos; recuadro discontinuo al arrastrar')
  h = pinta({ tesis: [tes], nueva: true, borrador: bor, archivos: [] })
  ok(h.includes('Adjuntos (0)') && h.includes('data-adjuntos-sin-guardar') && h.includes(A.AVISO_SIN_GUARDAR) && !h.includes('+ Añadir archivos') && h.includes(B_AMAR()), 'tesis nueva: se ve la tarjeta y, en vez de los botones, el aviso en ámbar')
  h = pinta({ ...base, borrando: true })
  ok(h.includes('Desaparece del todo.') && h.includes('Se borran también sus 5 adjuntos y 1 imagen del texto (1,2 MB en total). No se puede recuperar.'), 'borrar una tesis con archivos: lo dice')
  h = pinta({ ...base, tesis: [{ ...tes }], resumen: A.resumenArchivos([]), borrando: true })
  ok(h.includes('Desaparece del todo.') && !h.includes('data-detalle-pregunta'), 'sin archivos, el aviso de siempre')
  h = pinta({ ...base, borrandoAdjunto: arch[1] })
  const v = h.slice(h.indexOf('data-pregunta="borrar-adjunto"'))
  ok(v.includes('¿Borrar «Hoja.xlsx»?') && v.includes('Se borra de la nube de la app y no se puede recuperar. El archivo de tu PC no se toca.') && v.indexOf('Cancelar') < v.indexOf('Sí, borrar') && v.includes('#f85149'), 'borrar un adjunto: su ventana, «Cancelar» y «Sí, borrar» en rojo')
  const conVisor = (id, clase = 'adjunto') => pinta({ ...base, visor: { clase, id } })
  h = conVisor(1)
  const barra = h.slice(h.indexOf('data-visor'))
  ok(barra.includes('1 de 5') && barra.includes('Guía de 24 páginas') && barra.includes('1,1 MB · de la tesis «Semis»') && ['data-visor-descargar', 'Abrir en pestaña nueva', 'data-visor-cerrar', 'data-visor-anterior', 'data-visor-siguiente'].every(x => barra.includes(x)), 'visor: «1 de 5», tipo, nombre, tamaño, «de la tesis», Descargar, Abrir en pestaña nueva y ×')
  ok(/<iframe[^>]*data-vista="pdf"[^>]*src="https:\/\/f\/r1"/.test(barra) && !/sandbox/.test(barra), 'PDF: el visor del navegador, con la URL firmada en un iframe')
  ok(cuenta(barra, 'data-visor-miniatura') === 5 && /data-visor-miniatura="1" aria-current="true"/.test(barra) && barra.includes('#79c0ff'), 'la tira de miniaturas, con la abierta en azul')
  h = conVisor(4)
  ok(/data-vista="imagen"/.test(h) && h.includes('zoom-in') && h.includes('alt="Captura.png"') && h.includes('4 de 5'), 'imagen: ajustada, clic para verla a tamaño real')
  h = conVisor(3)
  ok(h.includes('Los archivos de Word no se ven dentro de la app') && h.includes('Descárgalo para abrirlo en tu PC. Si quieres leerlo aquí, guárdalo como PDF y súbelo.') && h.includes('data-descargar-grande') && !/<iframe/.test(h), 'Word: el aviso, «Descargar» y sin iframe')
  h = conVisor(2)
  ok(h.includes('Los archivos de Excel no se ven dentro de la app'), 'Excel: lo mismo')
  h = conVisor(6, 'imagen')
  ok(h.includes('1 de 1') && h.includes('alt="Pegada.png"') && !h.includes('data-visor-tira'), 'pulsar dos veces una imagen del texto: el visor, por las imágenes de la tesis')
  ok(!pinta(base).includes('data-visor='), 'cerrado, no hay visor')
  const fA = leer('components', 'TesisAdjuntos.js')
  ok(fA.includes(`window.addEventListener('keydown', tecla, true)`) && fA.includes(`window.removeEventListener('keydown', tecla, true)`) && ['Escape', 'ArrowLeft', 'ArrowRight'].every(x => fA.includes(x)), 'Esc y flechas, solo mientras el visor está abierto')
  ok(!/pdfjs|pdf\.js|react-pdf/.test(fA) && !/"pdfjs|"react-pdf/.test(leer('package.json')), 'sin librerías de PDF')
  ok(leer('components', 'TesisPanel.js').includes('await borrarTodoDeTesis(ctx(), fila.id); await borrarTesis(ctx(), fila.id)'), 'borrar una tesis: si los archivos fallan, la tesis no se borra')

  // ── Leer al lado del texto (opción B) ──
  const ancha = { ...base, ancho: 1400 }
  h = pinta(ancha)
  ok(h.includes('data-ver-al-lado') && h.includes('title="Ver al lado del texto"') && !h.includes('data-panel-lado') && !h.includes('data-lista-plegada') && h.includes('data-lista'), 'ventana ancha: el botón en la cabecera de Adjuntos; sin pulsarlo, todo como en A')
  h = pinta({ ...base, ancho: 1099 })
  ok(!h.includes('data-ver-al-lado'), 'menos de 1100 px: sin botón')
  h = pinta({ ...base, ancho: 1099, lado: true })
  ok(!h.includes('data-panel-lado') && h.includes('data-lista') && !h.includes('data-lista-plegada'), 'y aunque se recordara abierto: se usa A')
  h = pinta({ ...base, ancho: 1100, lado: true })
  ok(h.includes('data-panel-lado') && h.includes('grid-template-columns:44px minmax(0, 1fr) 560px') && h.includes('data-lista-plegada') && h.includes('title="Mostrar la lista de tesis"') && !h.includes('data-espacio='), 'modo B: la lista plegada (44 px), con su botón, y el panel de 560 px')
  const pan = h.slice(h.indexOf('data-panel-lado'))
  ok(pan.includes('Adjuntos (5) · 1,2 MB') && pan.includes('+ Añadir') && pan.includes('data-lado-ampliar') && pan.includes('data-lado-cerrar') && cuenta(pan, 'data-lado-fila="') === 5, 'cabecera «Adjuntos (N) · X MB», «+ Añadir», ampliar, × y las filas compactas')
  ok(/data-lado-fila="1" aria-current="true"[^>]*background:#13283f/.test(pan.replace(/ title="[^"]*"/g, '')) && /<iframe[^>]*data-vista="pdf"/.test(pan) && pan.includes('data-lado-descargar'), 'la abierta con fondo #13283f y, debajo, su visor (el PDF del navegador) con «Descargar»')
  ok(h.indexOf('data-texto') < h.indexOf('data-panel-lado') && h.includes('data-adjuntos'), 'el editor sigue a la izquierda, y la zona de borrar, debajo')
  h = pinta({ ...base, ancho: 1400, lado: true, ladoElegido: 3 })
  ok(h.slice(h.indexOf('data-panel-lado')).includes('Los archivos de Word no se ven dentro de la app') && !h.slice(h.indexOf('data-panel-lado')).includes('<iframe'), 'con un Word elegido: su aviso')
  h = pinta({ ...base, ancho: 1400, lado: true, ladoElegido: 4 })
  ok(h.slice(h.indexOf('data-panel-lado')).includes('alt="Captura.png"'), 'con una imagen: la imagen')
  h = pinta({ ...base, ancho: 1400, lado: true, listaAbierta: true })
  ok(h.includes('data-lista') && h.includes('data-espacio') && h.includes('grid-template-columns:360px minmax(0, 1fr) 560px') && h.includes('title="Plegar la lista de tesis"') && h.includes('data-panel-lado'), 'desplegar la lista: vuelve entera, con el panel abierto')
  h = pinta({ ...base, ancho: 1400, lado: true, archivos: [], resumen: A.resumenArchivos([]) })
  ok(h.includes('Esta tesis no tiene adjuntos.') && !h.includes('data-lado-descargar'), 'sin adjuntos: lo dice')
  h = pinta({ tesis: [tes], nueva: true, borrador: bor, archivos: [], ancho: 1400, lado: true })
  ok(h.slice(h.indexOf('data-panel-lado')).includes(A.AVISO_SIN_GUARDAR) && !h.includes('data-lado-anadir'), 'nueva sin guardar: el aviso, sin «+ Añadir»')
  h = pinta({ ...base, ancho: 1400, visor: { clase: 'adjunto', id: 1 } })
  ok(h.slice(h.indexOf('data-visor')).includes('data-ver-al-lado'), 'el botón también en la barra del visor')
  h = pinta({ ...base, ancho: 900, visor: { clase: 'adjunto', id: 1 } })
  ok(!h.includes('data-ver-al-lado'), 'y con la ventana estrecha, tampoco ahí')
  h = pinta({ ...base, ancho: 1400, lado: true, borrador: { ...bor, texto: 'otro' }, pregunta: true })
  ok(h.includes('data-pregunta="sin-guardar"') && h.includes('data-panel-lado') && ['>Guardar<', '>Salir sin guardar<', '>Cancelar<'].every(x => h.includes(x)), 'la guardia de cambios sin guardar, igual con el panel abierto')
  const alm = (() => { const m = {}; return { getItem: (k) => m[k] ?? null, setItem: (k, x) => { m[k] = x } } })()
  ok(A.leeAlLado(alm) === false, 'recordar: apagado por defecto')
  A.guardaAlLado(true, alm)
  ok(A.leeAlLado(alm) === true, 'recordar: encendido')
  const rotoAlm = { getItem: () => { throw new Error('x') }, setItem: () => { throw new Error('x') } }
  let sinFallo = true; try { A.guardaAlLado(true, rotoAlm); sinFallo = A.leeAlLado(rotoAlm) === false } catch (_) { sinFallo = false }
  ok(sinFallo && A.ANCHO_MIN_LADO === 1100, 'con el navegador sin permiso: ni falla ni se enciende')
  const fP = leer('components', 'TesisPanel.js')
  ok(fP.includes('Date.now() - firmadasEn.current < 50 * 60000') && fP.includes(".filter(r => !urlsAhora.current[r])"), 'las URL no cambian a mitad de lectura: guardar no recarga el PDF abierto')

  // ── 3 · El SQL guardado ──
  const sql = leer('sql', 'tesis_adjuntos.sql')
  ok(/QUÉ\./.test(sql) && /QUIÉN\./.test(sql) && /REVERSIÓN/.test(sql) && /'tesis-archivos', false, 52428800/.test(sql), 'sql/tesis_adjuntos.sql: QUÉ, QUIÉN, REVERSIÓN y bucket privado de 50 MB')
  const cuerpoSql = sql.split('\n').filter(l => !l.startsWith('--')).join('\n')
  ok(!/svg|html/i.test(cuerpoSql), 'el bucket no admite svg ni html')
  ok(['image/png', 'wordprocessingml', 'spreadsheetml', 'presentationml', 'text/csv', 'text/plain'].every(m => cuerpoSql.includes(m)), 'los tipos de la lib están en el bucket')
  ok(!/FOR UPDATE/.test(cuerpoSql) && !/GRANT[^;]*UPDATE/.test(cuerpoSql) && /REVOKE ALL ON public\.tesis_adjuntos FROM anon/.test(cuerpoSql), 'sin UPDATE; anon, nada')

  console.log(fallos ? `tesisArchivos: ${fallos} fallos` : 'tesisArchivos: todas bien')
  process.exit(fallos ? 1 : 0)
})().catch(e => { console.error(e); process.exit(2) })
