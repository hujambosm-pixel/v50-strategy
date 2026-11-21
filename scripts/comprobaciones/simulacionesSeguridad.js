// scripts/comprobaciones/simulacionesSeguridad.js — la seguridad de public.simulaciones (docs/builder.md, §224) contra la base de VERDAD. No va en comunes.sh. Uso: node scripts/comprobaciones/simulacionesSeguridad.js
// Dos usuarios simulados y anon, en una transacción que SIEMPRE se deshace (termina en un error a propósito): ni un usuario ni una fila se quedan. No toca los datos de Sergi. Y comprueba con la clave anon, por HTTP, que no se lee ni se escribe nada. Termina en 0 si todo va bien.
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
const crea = (nombre, estado = '{}', tipo = 'replay') => `INSERT INTO public.simulaciones (tipo, nombre, estado) VALUES (${lit(tipo)}, ${lit(nombre)}, ${lit(estado)}::jsonb)`
const ESTADO = '{"version":1,"valores":["AAPL"],"velas":"diario","desde":"2020-01-02","hoy":"2020-03-02","capitalInicial":10000,"ordenes":[],"operaciones":[],"retrocesos":0}'
;(async () => {
  const q = `DO $prueba$
DECLARE filas bigint; res jsonb := '[]'::jsonb; v text;
BEGIN
  INSERT INTO auth.users (id, aud, role, email) VALUES ('${A}', 'authenticated', 'authenticated', 'a-${A}@prueba.invalid'), ('${B}', 'authenticated', 'authenticated', 'b-${B}@prueba.invalid');
  ${como(A)}
  ${prueba('A crea un replay (dueño por defecto)', crea('Replay de prueba', ESTADO), 'filas:1')}
  ${prueba('A crea un paper trading', crea('Paper de prueba', '{}', 'paper'), 'filas:1')}
  ${prueba('A crea uno sin decir el tipo (replay por defecto)', `INSERT INTO public.simulaciones (nombre) VALUES ('Sin tipo')`, 'filas:1')}
  SELECT tipo INTO v FROM public.simulaciones WHERE nombre = 'Sin tipo';
  res := res || jsonb_build_object('n', 'el tipo por defecto es replay', 'r', v, 'e', 'replay');
  ${prueba('A las lee', 'PERFORM 1 FROM public.simulaciones', 'filas:3')}
  ${prueba('A cambia el estado y el nombre', `UPDATE public.simulaciones SET nombre = 'Replay AAPL 2020', estado = jsonb_set(estado, '{hoy}', '"2020-03-03"') WHERE nombre = 'Replay de prueba'`, 'filas:1')}
  SELECT estado->>'hoy' INTO v FROM public.simulaciones WHERE nombre = 'Replay AAPL 2020';
  res := res || jsonb_build_object('n', 'el estado guardado es el nuevo', 'r', v, 'e', '2020-03-03');
  ${prueba('no admite un tipo desconocido', crea('Mal', '{}', 'real'), 'error:23514')}
  ${prueba('no admite un nombre vacío', crea('   '), 'error:23514')}
  ${prueba('no admite un nombre de más de 120 letras', crea('x'.repeat(121)), 'error:23514')}
  ${prueba('no admite un estado que no sea un objeto', crea('Lista', '[]'), 'error:23514')}
  ${prueba('no admite un estado de más de 1 MB', `INSERT INTO public.simulaciones (nombre, estado) VALUES ('Grande', jsonb_build_object('x', repeat('x', 1050000)))`, 'error:23514')}
  ${prueba('A no puede cambiar el tipo', `UPDATE public.simulaciones SET tipo = 'paper' WHERE nombre = 'Sin tipo'`, 'error:42501')}
  ${prueba('A no puede poner las fechas a mano', 'UPDATE public.simulaciones SET actualizada = now()', 'error:42501')}
  ${prueba('A no puede crear una a nombre de B', `INSERT INTO public.simulaciones (user_id, nombre) VALUES ('${B}', 'Ajena')`, 'error:42501')}
  ${prueba('A puede borrar una suya', "DELETE FROM public.simulaciones WHERE nombre = 'Sin tipo'", 'filas:1')}
  ${como(B)}
  ${prueba('B no ve las de A', `PERFORM 1 FROM public.simulaciones WHERE user_id = '${A}'`, 'filas:0')}
  ${prueba('B no ve ninguna fila', 'PERFORM 1 FROM public.simulaciones', 'filas:0')}
  ${prueba('B no cambia las de A', `UPDATE public.simulaciones SET estado = '{}' WHERE user_id = '${A}'`, 'filas:0')}
  ${prueba('B no se apropia de las de A', `UPDATE public.simulaciones SET user_id = '${B}' WHERE user_id = '${A}'`, 'error:42501')}
  ${prueba('B no borra las de A', `DELETE FROM public.simulaciones WHERE user_id = '${A}'`, 'filas:0')}
  ${prueba('B crea la suya', crea('Replay de B'), 'filas:1')}
  ${como(A)}
  SELECT count(*)::text INTO v FROM public.simulaciones WHERE estado->>'hoy' = '2020-03-03';
  res := res || jsonb_build_object('n', 'las de A siguen igual tras todo lo que intentó B', 'r', v, 'e', '1');
  ${prueba('A no ve la de B', `PERFORM 1 FROM public.simulaciones WHERE user_id = '${B}'`, 'filas:0')}
  ${como(null)}
  ${prueba('anon no lee', 'PERFORM 1 FROM public.simulaciones', 'error:42501')}
  ${prueba('anon no crea', crea('De anon'), 'error:42501')}
  ${prueba('anon no cambia', "UPDATE public.simulaciones SET estado = '{}'", 'error:42501')}
  ${prueba('anon no borra', 'DELETE FROM public.simulaciones', 'error:42501')}
  RAISE EXCEPTION 'RESULTADO:%', res;   -- se deshace TODO, a propósito
END $prueba$;`
  let txt = ''
  try { await consulta(q); txt = '' } catch (e) { txt = String(e.message || e) }
  const m = txt.match(/RESULTADO:(\[.*\])/s)
  if (!m) { console.error('No llegó el resultado:', txt.slice(0, 500)); process.exit(2) }
  for (const x of JSON.parse(m[1].replace(/\\"/g, '"'))) ok(x.r === x.e, `${x.n} (${x.r})`)
  const quedan = await consulta(`SELECT (SELECT count(*) FROM auth.users WHERE id IN ('${A}', '${B}'))::int AS usuarios, (SELECT count(*) FROM public.simulaciones WHERE user_id IN ('${A}', '${B}'))::int AS filas`)
  ok(quedan[0].usuarios === 0 && quedan[0].filas === 0, 'la transacción se ha deshecho: ni un usuario ni una fila')
  const r = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/simulaciones?select=*`, { headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY } })
  ok(r.status === 401 || r.status === 403, `por HTTP, la clave anon no lee (HTTP ${r.status})`)
  const w = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/simulaciones`, { method: 'POST', headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: '{"nombre":"De anon","estado":{}}' })
  ok(w.status === 401 || w.status === 403, `por HTTP, la clave anon no escribe (HTTP ${w.status})`)
  console.log(fallos ? `simulacionesSeguridad: ${fallos} fallos` : 'simulacionesSeguridad: todas bien')
  process.exitCode = fallos ? 1 : 0
})().catch(e => { console.error('ERROR', e.message || e); process.exitCode = 2 })
