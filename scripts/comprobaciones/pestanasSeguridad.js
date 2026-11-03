// scripts/comprobaciones/pestanasSeguridad.js — la seguridad de builder_pestanas (docs/builder.md, §54) contra la base de VERDAD. No va en comunes.sh. Uso: node scripts/comprobaciones/pestanasSeguridad.js
// Dos usuarios simulados y anon, en una transacción que SIEMPRE se deshace (termina en un error a propósito): ni un usuario ni una fila se quedan. No toca los datos de Sergi. Y comprueba con la clave anon, por HTTP, que no se lee nada. Termina en 0 si todo va bien.
const path = require('path'), fs = require('fs'), crypto = require('crypto')
const R = path.resolve(__dirname, '..', '..')
const { consulta } = require('../universoNasdaq100')
let fallos = 0
const ok = (c, t) => { console.log(`${c ? 'OK  ' : 'MAL '} ${t}`); if (!c) fallos++ }
const env = Object.fromEntries(fs.readFileSync(path.join(R, '.env.local'), 'utf8').split(/\r?\n/).filter(l => /^[A-Z_]+=/.test(l)).map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }))
const A = crypto.randomUUID(), B = crypto.randomUUID()
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`
const prueba = (nombre, cuerpo, espera) => `
  BEGIN ${cuerpo}; GET DIAGNOSTICS filas = ROW_COUNT; res := res || jsonb_build_object('n', ${lit(nombre)}, 'r', 'filas:' || filas, 'e', ${lit(espera)});
  EXCEPTION WHEN OTHERS THEN res := res || jsonb_build_object('n', ${lit(nombre)}, 'r', 'error:' || SQLSTATE, 'e', ${lit(espera)}); END;`
const como = (u) => u ? `PERFORM set_config('role', 'authenticated', true); PERFORM set_config('request.jwt.claims', '{"sub":"${u}","role":"authenticated"}', true);`
  : `PERFORM set_config('role', 'anon', true); PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);`
// Lo mismo que hace PostgREST con guardarPestanas (el upsert solo con planes).
const upsert = (ids) => `INSERT INTO public.builder_pestanas (planes) VALUES ('{${ids}}') ON CONFLICT (user_id) DO UPDATE SET planes = EXCLUDED.planes`
;(async () => {
  const q = `DO $prueba$
DECLARE filas bigint; res jsonb := '[]'::jsonb; v text;
BEGIN
  INSERT INTO auth.users (id, aud, role, email) VALUES ('${A}', 'authenticated', 'authenticated', 'a-${A}@prueba.invalid'), ('${B}', 'authenticated', 'authenticated', 'b-${B}@prueba.invalid');
  ${como(A)}
  ${prueba('A crea su fila (con el dueño por defecto)', upsert('7,4'), 'filas:1')}
  ${prueba('A la lee', 'PERFORM 1 FROM public.builder_pestanas', 'filas:1')}
  ${prueba('A la cambia con el mismo upsert', upsert('4,7,9'), 'filas:1')}
  SELECT planes::text INTO v FROM public.builder_pestanas;
  res := res || jsonb_build_object('n', 'el orden guardado se lee tal cual', 'r', v, 'e', '{4,7,9}');
  ${prueba('A no puede crear una fila a nombre de B', `INSERT INTO public.builder_pestanas (user_id, planes) VALUES ('${B}', '{1}')`, 'error:42501')}
  ${prueba('A no puede borrar (sin DELETE)', 'DELETE FROM public.builder_pestanas', 'error:42501')}
  ${prueba('A no puede poner la fecha a mano', "UPDATE public.builder_pestanas SET updated_at = now()", 'error:42501')}
  ${como(B)}
  ${prueba('B no ve las pestañas de A', `PERFORM 1 FROM public.builder_pestanas WHERE user_id = '${A}'`, 'filas:0')}
  ${prueba('B no ve ninguna fila', 'PERFORM 1 FROM public.builder_pestanas', 'filas:0')}
  ${prueba('B no cambia las de A', `UPDATE public.builder_pestanas SET planes = '{1}' WHERE user_id = '${A}'`, 'filas:0')}
  ${prueba('B no se apropia de las de A', `UPDATE public.builder_pestanas SET user_id = '${B}' WHERE user_id = '${A}'`, 'error:42501')}
  ${prueba('B no borra las de A', `DELETE FROM public.builder_pestanas WHERE user_id = '${A}'`, 'error:42501')}
  ${prueba('B crea la suya', upsert('1'), 'filas:1')}
  ${como(A)}
  SELECT planes::text INTO v FROM public.builder_pestanas;
  res := res || jsonb_build_object('n', 'las de A siguen igual tras todo lo que intentó B', 'r', v, 'e', '{4,7,9}');
  ${como(null)}
  ${prueba('anon no lee', 'PERFORM 1 FROM public.builder_pestanas', 'error:42501')}
  ${prueba('anon no crea', upsert('1'), 'error:42501')}
  ${prueba('anon no cambia', "UPDATE public.builder_pestanas SET planes = '{1}'", 'error:42501')}
  RAISE EXCEPTION 'RESULTADO:%', res;   -- se deshace TODO, a propósito
END $prueba$;`
  let txt = ''
  try { await consulta(q); txt = '' } catch (e) { txt = String(e.message || e) }
  const m = txt.match(/RESULTADO:(\[.*\])/s)
  if (!m) { console.error('No llegó el resultado:', txt.slice(0, 500)); process.exit(2) }
  for (const x of JSON.parse(m[1].replace(/\\"/g, '"'))) ok(x.r === x.e, `${x.n} (${x.r})`)
  const quedan = await consulta(`SELECT (SELECT count(*) FROM auth.users WHERE id IN ('${A}', '${B}'))::int AS usuarios, (SELECT count(*) FROM public.builder_pestanas WHERE user_id IN ('${A}', '${B}'))::int AS filas`)
  ok(quedan[0].usuarios === 0 && quedan[0].filas === 0, 'la transacción se ha deshecho: ni un usuario ni una fila')
  const r = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/builder_pestanas?select=*`, { headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY } })
  ok(r.status === 401 || r.status === 403, `por HTTP, la clave anon no lee (HTTP ${r.status})`)
  const w = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/builder_pestanas?on_conflict=user_id`, { method: 'POST', headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }, body: '{"planes":[1]}' })
  ok(w.status === 401 || w.status === 403, `por HTTP, la clave anon no escribe (HTTP ${w.status})`)
  console.log(fallos ? `pestanasSeguridad: ${fallos} fallos` : 'pestanasSeguridad: todas bien')
  process.exit(fallos ? 1 : 0)
})().catch(e => { console.error('ERROR', e.message || e); process.exit(2) })
