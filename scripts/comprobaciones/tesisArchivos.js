// scripts/comprobaciones/tesisArchivos.js — «Imágenes y adjuntos» de la pantalla «Tesis» (docs/tesis.md). Las corre comunes.sh. Termina en 0 si todo va bien.
// Sin base de datos ni navegador: lib/tesisArchivos.js con un fetch falso (método, dirección y cuerpo de cada llamada), sus piezas puras y el SQL.
// La seguridad con dos usuarios, aparte: scripts/comprobaciones/tesisSeguridad.js (habla con la base de verdad).
const path = require('path'), fs = require('fs')
const C0 = require('./cargador'), R = C0.RAIZ
let fallos = 0
const ok = (c, t) => { console.log(`${c ? 'OK  ' : 'MAL '} ${t}`); if (!c) fallos++ }
const lanza = async (fn) => { try { await fn(); return null } catch (e) { return e.message } }

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
