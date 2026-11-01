// scripts/comprobaciones/tesisSeguridad.js — la prueba de seguridad de «Imágenes y adjuntos» (docs/tesis.md) contra la base de VERDAD. No va en comunes.sh.
//   node scripts/comprobaciones/tesisSeguridad.js sql       las políticas, con dos usuarios y anon, en una transacción que SIEMPRE se deshace (termina en un error a propósito).
//   node scripts/comprobaciones/tesisSeguridad.js anon      por HTTP, sin cuentas: el bucket de verdad y anon. Sube un archivo con la clave de servicio a la carpeta _humo y lo borra.
//   node scripts/comprobaciones/tesisSeguridad.js usuarios  por HTTP, con lib/tesisArchivos.js: crea DOS usuarios de prueba temporales con la API de administración, con una
//                                                           tesis cada uno, comprueba que B no llega a nada de A y borra usuarios, tesis y archivos al terminar, salga bien o mal.
// Nunca toca los datos de Sergi. La clave de servicio se pide a la Management API, se queda en memoria y no se imprime. Termina en 0 si todo va bien.
const path = require('path'), fs = require('fs'), crypto = require('crypto')
const C0 = require('./cargador'), R = C0.RAIZ
const { consulta, leeToken } = require('../universoNasdaq100')
let fallos = 0
const ok = (c, t) => { console.log(`${c ? 'OK  ' : 'MAL '} ${t}`); if (!c) fallos++ }
const env = Object.fromEntries(fs.readFileSync(path.join(R, '.env.local'), 'utf8').split(/\r?\n/).filter(l => /^[A-Z_]+=/.test(l)).map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }))
const URL_S = env.NEXT_PUBLIC_SUPABASE_URL, ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const BUCKET = 'tesis-archivos'

async function claveServicio() {
  const ref = /https?:\/\/([^.]+)\./.exec(URL_S)[1]
  const token = leeToken()
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${token}` } })
  if (!r.ok) throw new Error(`no se pudo leer la clave de servicio (HTTP ${r.status})`)
  const k = (await r.json()).find(x => x.name === 'service_role')
  if (!k?.api_key) throw new Error('el proyecto no tiene clave service_role')
  return k.api_key
}

// ── sql: las políticas, en una transacción que se deshace siempre ──
const A_ID = crypto.randomUUID(), B_ID = crypto.randomUUID()
const rutaDe = (u, t, c, n) => `'${u}/' || ${t} || '/${c}/${n}'`
const prueba = (nombre, cuerpo, espera) => `
  BEGIN ${cuerpo}; GET DIAGNOSTICS filas = ROW_COUNT; res := res || jsonb_build_object('n', ${lit(nombre)}, 'r', 'filas:' || filas, 'e', ${lit(espera)});
  EXCEPTION WHEN OTHERS THEN res := res || jsonb_build_object('n', ${lit(nombre)}, 'r', 'error:' || SQLSTATE, 'e', ${lit(espera)}); END;`
function lit(s) { return `'${String(s).replace(/'/g, "''")}'` }
const como = (u) => u ? `PERFORM set_config('role', 'authenticated', true); PERFORM set_config('request.jwt.claims', '{"sub":"${u}","role":"authenticated"}', true);`
  : `PERFORM set_config('role', 'anon', true); PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);`
async function pruebaSql() {
  const insFila = (t, ruta, extra = '') => `INSERT INTO public.tesis_adjuntos (tesis_id, clase, ruta, nombre, tipo, bytes${extra ? ', user_id' : ''}) VALUES (${t}, 'adjunto', ${ruta}, 'x.txt', 'text/plain', 5${extra ? `, ${extra}` : ''})`
  const insObj = (ruta) => `INSERT INTO storage.objects (bucket_id, name) VALUES ('${BUCKET}', ${ruta})`
  const delObj = (ruta) => `DELETE FROM storage.objects WHERE bucket_id = '${BUCKET}' AND name = ${ruta}`
  const rA = rutaDe(A_ID, 'ta', 'adjunto', 'a.txt'), rB = rutaDe(B_ID, 'tb', 'adjunto', 'b.txt')
  const q = `DO $prueba$
DECLARE ta bigint; tb bigint; filas bigint; res jsonb := '[]'::jsonb;
BEGIN
  INSERT INTO auth.users (id, aud, role, email) VALUES ('${A_ID}', 'authenticated', 'authenticated', 'a-${A_ID}@prueba.invalid'), ('${B_ID}', 'authenticated', 'authenticated', 'b-${B_ID}@prueba.invalid');
  INSERT INTO public.tesis_inversion (user_id, titulo) VALUES ('${A_ID}', 'A') RETURNING id INTO ta;
  INSERT INTO public.tesis_inversion (user_id, titulo) VALUES ('${B_ID}', 'B') RETURNING id INTO tb;
  PERFORM set_config('storage.allow_delete_query', 'true', true);
  -- A, lo suyo: sí.
  ${como(A_ID)}
  ${prueba('A sube a su carpeta', insObj(rA), 'filas:1')}
  ${prueba('A crea la fila en su tesis', insFila('ta', rA), 'filas:1')}
  ${prueba('A ve su fila', "PERFORM 1 FROM public.tesis_adjuntos WHERE tesis_id = ta", 'filas:1')}
  ${prueba('A ve su archivo', `PERFORM 1 FROM storage.objects WHERE bucket_id = '${BUCKET}' AND name = ${rA}`, 'filas:1')}
  ${prueba('A no puede cambiar su fila (sin UPDATE)', "UPDATE public.tesis_adjuntos SET nombre = 'otro' WHERE tesis_id = ta", 'error:42501')}
  ${prueba('A no puede cambiar su archivo (sin UPDATE)', `UPDATE storage.objects SET metadata = '{}' WHERE bucket_id = '${BUCKET}' AND name = ${rA}`, 'filas:0')}
  ${prueba('una fila de más de 50 MB, no', "INSERT INTO public.tesis_adjuntos (tesis_id, clase, ruta, nombre, bytes) VALUES (ta, 'adjunto', " + rutaDe(A_ID, 'ta', 'adjunto', 'g.txt') + ", 'g', 52428801)", 'error:23514')}
  ${prueba('una fila de 0 bytes, no', "INSERT INTO public.tesis_adjuntos (tesis_id, clase, ruta, nombre, bytes) VALUES (ta, 'adjunto', " + rutaDe(A_ID, 'ta', 'adjunto', 'v.txt') + ", 'v', 0)", 'error:23514')}
  -- B, lo de A: nada.
  ${como(B_ID)}
  ${prueba('B no ve las filas de A', 'PERFORM 1 FROM public.tesis_adjuntos WHERE tesis_id = ta', 'filas:0')}
  ${prueba('B no ve los archivos de A', `PERFORM 1 FROM storage.objects WHERE bucket_id = '${BUCKET}' AND name = ${rA}`, 'filas:0')}
  ${prueba('B no ve nada en el bucket', `PERFORM 1 FROM storage.objects WHERE bucket_id = '${BUCKET}'`, 'filas:0')}
  ${prueba('B no puede subir a la carpeta de A', insObj(rutaDe(A_ID, 'ta', 'adjunto', 'intruso.txt')), 'error:42501')}
  ${prueba('B no puede crear una fila en la tesis de A', insFila('ta', rutaDe(B_ID, 'ta', 'adjunto', 'c.txt')), 'error:42501')}
  ${prueba('B no puede apuntar a la ruta de A desde su tesis', insFila('tb', rutaDe(A_ID, 'ta', 'adjunto', 'd.txt')), 'error:42501')}
  ${prueba('B no puede poner a A como dueño (sin permiso en esa columna)', insFila('ta', rutaDe(A_ID, 'ta', 'adjunto', 'e.txt'), `'${A_ID}'`), 'error:42501')}
  ${prueba('B no puede borrar la fila de A', 'DELETE FROM public.tesis_adjuntos WHERE tesis_id = ta', 'filas:0')}
  ${prueba('B no puede borrar el archivo de A', delObj(rA), 'filas:0')}
  ${prueba('B no puede mover el archivo de A', `UPDATE storage.objects SET name = 'x' WHERE bucket_id = '${BUCKET}' AND name = ${rA}`, 'filas:0')}
  ${prueba('B sí sube a su carpeta', insObj(rB), 'filas:1')}
  ${prueba('B sí crea la fila en su tesis', insFila('tb', rB), 'filas:1')}
  ${prueba('B ve solo lo suyo', 'PERFORM 1 FROM public.tesis_adjuntos', 'filas:1')}
  -- anon: nada.
  ${como(null)}
  ${prueba('anon no lee la tabla', 'PERFORM 1 FROM public.tesis_adjuntos', 'error:42501')}
  ${prueba('anon no crea filas', insFila('ta', rutaDe(A_ID, 'ta', 'adjunto', 'f.txt')), 'error:42501')}
  ${prueba('anon no borra filas', 'DELETE FROM public.tesis_adjuntos', 'error:42501')}
  ${prueba('anon no ve el bucket', `PERFORM 1 FROM storage.objects WHERE bucket_id = '${BUCKET}'`, 'filas:0')}
  ${prueba('anon no sube', insObj(rutaDe(A_ID, 'ta', 'adjunto', 'h.txt')), 'error:42501')}
  ${prueba('anon no borra archivos', delObj(rA), 'filas:0')}
  -- A sigue teniendo lo suyo después de todo; y al borrar la tesis, sus filas se van.
  ${como(A_ID)}
  ${prueba('tras todo, A conserva su fila', 'PERFORM 1 FROM public.tesis_adjuntos WHERE tesis_id = ta', 'filas:1')}
  ${prueba('tras todo, A conserva su archivo', `PERFORM 1 FROM storage.objects WHERE bucket_id = '${BUCKET}' AND name = ${rA}`, 'filas:1')}
  ${prueba('A borra su tesis y la fila se va con ella', 'DELETE FROM public.tesis_inversion WHERE id = ta', 'filas:1')}
  ${prueba('y ya no queda la fila', 'PERFORM 1 FROM public.tesis_adjuntos WHERE tesis_id = ta', 'filas:0')}
  RAISE EXCEPTION 'RESULTADO:%', res;   -- se deshace TODO, a propósito
END $prueba$;`
  let txt = ''
  try { await consulta(q); txt = '' } catch (e) { txt = String(e.message || e) }
  const m = /RESULTADO:(\[[\s\S]*\])/.exec(txt)
  if (!m) throw new Error(`la prueba no llegó al final: ${txt.slice(0, 500)}`)
  for (const x of JSON.parse(m[1])) ok(x.r === x.e, `${x.n} (${x.r}${x.r === x.e ? '' : `; se esperaba ${x.e}`})`)
  const quedan = await consulta(`SELECT (SELECT count(*) FROM auth.users WHERE id IN ('${A_ID}', '${B_ID}'))::int AS usuarios, (SELECT count(*) FROM public.tesis_adjuntos)::int AS filas, (SELECT count(*) FROM storage.objects WHERE bucket_id = '${BUCKET}')::int AS archivos`)
  ok(quedan[0].usuarios === 0, 'la transacción se ha deshecho: ni un usuario de prueba ha llegado a existir')
  console.log(`(en la base ahora mismo: ${quedan[0].filas} filas y ${quedan[0].archivos} archivos)`)
}

// ── anon: el bucket de verdad y anon, por HTTP y sin cuentas ──
const cabeceras = (token, extra = {}) => ({ apikey: ANON, Authorization: `Bearer ${token}`, ...extra })
async function pruebaAnon() {
  const srv = await claveServicio()
  const hs = { apikey: srv, Authorization: `Bearer ${srv}` }
  const carpeta = `_humo/${crypto.randomUUID()}`, ruta = `${carpeta}/guía.txt`.replace('í', 'i')
  const obj = (r) => `${URL_S}/storage/v1/object/${BUCKET}/${r}`
  const subeCon = (r, tipo, cab = hs) => fetch(obj(r), { method: 'POST', headers: { ...cab, 'Content-Type': tipo }, body: 'hola' })
  try {
    ok((await subeCon(ruta, 'text/plain')).ok, 'la clave de servicio sube un txt')
    ok(!(await subeCon(`${carpeta}/a.svg`, 'image/svg+xml')).ok, 'el bucket rechaza un svg, aunque suba la clave de servicio')
    ok(!(await subeCon(`${carpeta}/a.html`, 'text/html')).ok, 'el bucket rechaza un html')
    ok(!(await subeCon(ruta, 'text/plain')).ok, 'un archivo no se sobrescribe')
    const grande = await fetch(obj(`${carpeta}/g.txt`), { method: 'POST', headers: { ...hs, 'Content-Type': 'text/plain' }, body: Buffer.alloc(52428801, 97) })
    ok(!grande.ok, `el bucket rechaza 50 MB y un byte (HTTP ${grande.status})`)
    const f = await (await fetch(`${URL_S}/storage/v1/object/sign/${BUCKET}/${ruta}`, { method: 'POST', headers: { ...hs, 'Content-Type': 'application/json' }, body: JSON.stringify({ expiresIn: 60 }) })).json()
    const firmada = `${URL_S}/storage/v1${f.signedURL}`
    const ver = await fetch(firmada)
    ok(ver.ok && await ver.text() === 'hola', 'la URL firmada lee el archivo')
    console.log(`     cabeceras al verlo: content-type=${ver.headers.get('content-type')} · x-frame-options=${ver.headers.get('x-frame-options')} · csp=${ver.headers.get('content-security-policy')} · disposition=${ver.headers.get('content-disposition')}`)
    const baja = await fetch(`${firmada}&download=${encodeURIComponent('Guía ñ.txt')}`)
    ok(/attachment/.test(baja.headers.get('content-disposition') || '') && (baja.headers.get('content-disposition') || '').includes(encodeURIComponent('Guía ñ.txt')), `descargar lleva el nombre original: ${baja.headers.get('content-disposition')}`)
    ok(!(await fetch(`${URL_S}/storage/v1/object/public/${BUCKET}/${ruta}`)).ok, 'el bucket es privado: sin firma, nada')
    // anon
    const anon = cabeceras(ANON)
    ok(!(await fetch(obj(ruta), { headers: anon })).ok, 'anon no descarga')
    ok(!(await fetch(`${URL_S}/storage/v1/object/sign/${BUCKET}/${ruta}`, { method: 'POST', headers: { ...anon, 'Content-Type': 'application/json' }, body: '{"expiresIn":60}' })).ok, 'anon no firma URL')
    const l = await fetch(`${URL_S}/storage/v1/object/list/${BUCKET}`, { method: 'POST', headers: { ...anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ prefix: carpeta }) })
    ok(!l.ok || !(await l.json()).length, 'anon no lista la carpeta')
    ok(!(await subeCon(`${carpeta}/anon.txt`, 'text/plain', anon)).ok, 'anon no sube')
    await fetch(`${URL_S}/storage/v1/object/${BUCKET}`, { method: 'DELETE', headers: { ...anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: [ruta] }) })
    ok((await fetch(obj(ruta), { headers: hs })).ok, 'anon no borra: el archivo sigue ahí')
    ok((await fetch(`${URL_S}/rest/v1/tesis_adjuntos?select=id`, { headers: anon })).status === 401, 'anon no lee la tabla')
    ok(!(await fetch(`${URL_S}/rest/v1/tesis_adjuntos`, { method: 'POST', headers: { ...anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ tesis_id: 3, clase: 'adjunto', ruta: 'x', nombre: 'x', bytes: 1 }) })).ok, 'anon no crea filas')
  } finally {
    await fetch(`${URL_S}/storage/v1/object/${BUCKET}`, { method: 'DELETE', headers: { ...hs, 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: [ruta, `${carpeta}/a.svg`, `${carpeta}/a.html`, `${carpeta}/g.txt`, `${carpeta}/anon.txt`] }) })
    const q = await consulta(`SELECT count(*)::int AS n FROM storage.objects WHERE bucket_id = '${BUCKET}' AND name LIKE '_humo/%'`)
    ok(q[0].n === 0, 'la carpeta de la prueba queda vacía')
  }
}

// ── usuarios: dos usuarios temporales, por HTTP y con la lib de verdad ──
async function pruebaUsuarios() {
  await C0.prepara(); C0.registra(R)
  const L = require(path.join(R, 'lib', 'tesisArchivos.js')), T = require(path.join(R, 'lib', 'tesis.js'))
  const srv = await claveServicio()
  const hs = { apikey: srv, Authorization: `Bearer ${srv}`, 'Content-Type': 'application/json' }
  const creados = []
  const crea = async (letra) => {
    const email = `prueba-tesis-${letra}-${crypto.randomUUID()}@prueba.invalid`, password = crypto.randomBytes(24).toString('hex')
    const r = await fetch(`${URL_S}/auth/v1/admin/users`, { method: 'POST', headers: hs, body: JSON.stringify({ email, password, email_confirm: true }) })
    if (!r.ok) throw new Error(`no se pudo crear el usuario ${letra} (HTTP ${r.status})`)
    const id = (await r.json()).id
    creados.push(id)
    const s = await fetch(`${URL_S}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) })
    if (!s.ok) throw new Error(`no se pudo entrar como ${letra} (HTTP ${s.status})`)
    return { id, ctx: { url: URL_S, headers: { apikey: ANON, Authorization: `Bearer ${(await s.json()).access_token}` }, fetch } }
  }
  const fallaCon = async (fn) => { try { await fn(); return false } catch (_) { return true } }
  let a, b
  try {
    a = await crea('a'); b = await crea('b')
    const tA = await T.crearTesis(a.ctx, { titulo: 'Prueba A', texto: '', estado: 'idea', relacionados: [] })
    const tB = await T.crearTesis(b.ctx, { titulo: 'Prueba B', texto: '', estado: 'idea', relacionados: [] })
    const archivo = (name, type, txt) => new File([txt], name, { type })
    const fA = await L.subir(a.ctx, { tesisId: tA.id, clase: 'adjunto', archivo: archivo('Guía ñ.txt', 'text/plain', 'secreto de A') })
    const iA = await L.subir(a.ctx, { tesisId: tA.id, clase: 'imagen', archivo: archivo('c.png', 'image/png', 'png de A') })
    ok(fA.nombre === 'Guía ñ.txt' && fA.ruta.startsWith(`${a.id}/${tA.id}/adjunto/`), 'A sube: fila con el nombre original y ruta en su carpeta')
    ok((await L.listar(a.ctx, tA.id)).length === 2 && await L.espacioUsado(a.ctx) === fA.bytes + iA.bytes, 'A lista lo suyo y ve su espacio usado')
    const firmada = await L.urlFirmada(a.ctx, fA.ruta, 60)
    ok(await (await fetch(firmada)).text() === 'secreto de A', 'A lee su archivo con una URL firmada')
    ok(Object.keys(await L.urlsFirmadas(a.ctx, [fA.ruta, iA.ruta])).length === 2, 'A firma en lote')
    const obj = (r) => `${URL_S}/storage/v1/object/${BUCKET}/${r}`

    // B contra A.
    ok((await L.listar(b.ctx, tA.id)).length === 0, 'B no lista los archivos de A')
    ok(await L.espacioUsado(b.ctx) === 0, 'B no cuenta lo de A en su espacio')
    ok(await fallaCon(() => L.urlFirmada(b.ctx, fA.ruta, 60)), 'B no firma una URL de A')
    ok(Object.keys(await L.urlsFirmadas(b.ctx, [fA.ruta, iA.ruta])).length === 0, 'B no firma en lote las de A')
    ok(!(await fetch(obj(fA.ruta), { headers: b.ctx.headers })).ok, 'B no descarga el archivo de A')
    ok(await fallaCon(() => L.descargar(b.ctx, fA, () => {})), 'B no descarga con descargar()')
    const lista = await fetch(`${URL_S}/storage/v1/object/list/${BUCKET}`, { method: 'POST', headers: { ...b.ctx.headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ prefix: `${a.id}/${tA.id}/adjunto` }) })
    ok(!lista.ok || !(await lista.json()).length, 'B no lista la carpeta de A en el bucket')
    ok(!(await fetch(obj(`${a.id}/${tA.id}/adjunto/${crypto.randomUUID()}.txt`), { method: 'POST', headers: { ...b.ctx.headers, 'Content-Type': 'text/plain' }, body: 'intruso' })).ok, 'B no sube a la carpeta de A')
    ok(!(await fetch(obj(fA.ruta), { method: 'PUT', headers: { ...b.ctx.headers, 'Content-Type': 'text/plain' }, body: 'cambiado' })).ok, 'B no cambia el archivo de A')
    const filaCon = (o) => fetch(`${URL_S}/rest/v1/tesis_adjuntos`, { method: 'POST', headers: { ...b.ctx.headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ clase: 'adjunto', nombre: 'x', bytes: 1, ...o }) })
    ok(!(await filaCon({ tesis_id: tA.id, ruta: `${b.id}/${tA.id}/adjunto/x.txt` })).ok, 'B no crea una fila apuntando a la tesis de A')
    ok(!(await filaCon({ tesis_id: tB.id, ruta: `${a.id}/${tA.id}/adjunto/x.txt` })).ok, 'B no crea una fila con una ruta de A')
    await L.borrar(b.ctx, [fA, iA])
    await L.borrarTodoDeTesis(b.ctx, tA.id)
    ok((await L.listar(a.ctx, tA.id)).length === 2 && await (await fetch(firmada)).text() === 'secreto de A', 'B intenta borrar lo de A y no pasa nada: filas y archivos siguen ahí')

    // anon contra A.
    const anon = { url: URL_S, headers: { apikey: ANON, Authorization: `Bearer ${ANON}` }, fetch }
    ok(await fallaCon(() => L.listar(anon, tA.id)), 'anon no lista')
    ok(await fallaCon(() => L.urlFirmada(anon, fA.ruta, 60)), 'anon no firma')
    ok(!(await fetch(obj(fA.ruta), { headers: anon.headers })).ok, 'anon no descarga')
    await fetch(`${URL_S}/storage/v1/object/${BUCKET}`, { method: 'DELETE', headers: { ...anon.headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: [fA.ruta] }) })
    ok((await L.listar(a.ctx, tA.id)).length === 2 && await (await fetch(firmada)).text() === 'secreto de A', 'anon intenta borrar y el archivo sigue ahí')

    // Lo propio de B sí funciona, y A borra lo suyo.
    await L.subir(b.ctx, { tesisId: tB.id, clase: 'adjunto', archivo: archivo('b.txt', 'text/plain', 'de B') })
    ok((await L.listar(b.ctx, tB.id)).length === 1, 'B sí sube a lo suyo')
    ok(await L.borrarTodoDeTesis(a.ctx, tA.id) === 2 && (await L.listar(a.ctx, tA.id)).length === 0 && !(await fetch(firmada)).ok, 'A borra lo suyo: filas y archivos fuera (y la URL firmada ya no sirve)')
    await T.borrarTesis(a.ctx, tA.id)
  } finally {
    // Limpieza, salga bien o mal: archivos con la clave de servicio, tesis y usuarios.
    for (const id of creados) {
      const objetos = await consulta(`SELECT name FROM storage.objects WHERE bucket_id = '${BUCKET}' AND name LIKE '${id}/%'`)
      if (objetos.length) await fetch(`${URL_S}/storage/v1/object/${BUCKET}`, { method: 'DELETE', headers: hs, body: JSON.stringify({ prefixes: objetos.map(x => x.name) }) })
      await consulta(`DELETE FROM public.tesis_inversion WHERE user_id = '${id}'`)
      const r = await fetch(`${URL_S}/auth/v1/admin/users/${id}`, { method: 'DELETE', headers: hs })
      if (!r.ok) console.log(`MAL  no se pudo borrar el usuario ${id} (HTTP ${r.status}): bórralo a mano en Supabase`)
    }
    if (creados.length) {
      const lista = creados.map(x => `'${x}'`).join(',')
      const q = await consulta(`SELECT (SELECT count(*) FROM auth.users WHERE id IN (${lista}))::int AS u, (SELECT count(*) FROM public.tesis_inversion WHERE user_id IN (${lista}))::int AS t, (SELECT count(*) FROM public.tesis_adjuntos WHERE user_id IN (${lista}))::int AS f, (SELECT count(*) FROM storage.objects WHERE bucket_id = '${BUCKET}' AND (${creados.map(x => `name LIKE '${x}/%'`).join(' OR ')}))::int AS o`)
      ok(!q[0].u && !q[0].t && !q[0].f && !q[0].o, `limpieza: quedan ${q[0].u} usuarios, ${q[0].t} tesis, ${q[0].f} filas y ${q[0].o} archivos de la prueba`)
    }
  }
}

;(async () => {
  const modo = process.argv[2]
  if (modo === 'sql') await pruebaSql()
  else if (modo === 'anon') await pruebaAnon()
  else if (modo === 'usuarios') await pruebaUsuarios()
  else { console.log('Uso: node scripts/comprobaciones/tesisSeguridad.js sql | anon | usuarios'); process.exit(2) }
  console.log(fallos ? `tesisSeguridad ${modo}: ${fallos} fallos` : `tesisSeguridad ${modo}: todas bien`)
  process.exit(fallos ? 1 : 0)
})().catch(e => { console.error('ERROR', e.message || e); process.exit(2) })
