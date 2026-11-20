// scripts/comprobaciones/dibujosSeguridad.js — la seguridad de dibujos_grafico (docs/builder.md, §206) contra la base de VERDAD. No va en comunes.sh. Uso: node scripts/comprobaciones/dibujosSeguridad.js
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
// Lo mismo que hará PostgREST al guardar (upsert con simbolo y dibujos; con merge-duplicates pone las dos columnas).
const upsert = (sim, dib) => `INSERT INTO public.dibujos_grafico (simbolo, dibujos) VALUES (${lit(sim)}, ${lit(dib)}::jsonb) ON CONFLICT (user_id, simbolo) DO UPDATE SET simbolo = EXCLUDED.simbolo, dibujos = EXCLUDED.dibujos`
const UNO = '[{"id":"d1","tipo":"tendencia","puntos":[{"fecha":"2024-01-02","precio":185.5},{"fecha":"2024-03-01","precio":179.2}]}]'
const DOS = '[{"id":"d1","tipo":"tendencia","puntos":[{"fecha":"2024-01-02","precio":185.5},{"fecha":"2024-03-01","precio":179.2}]},{"id":"d2","tipo":"horizontal","puntos":[{"fecha":"2024-02-01","precio":190}]}]'
;(async () => {
  const q = `DO $prueba$
DECLARE filas bigint; res jsonb := '[]'::jsonb; v text;
BEGIN
  INSERT INTO auth.users (id, aud, role, email) VALUES ('${A}', 'authenticated', 'authenticated', 'a-${A}@prueba.invalid'), ('${B}', 'authenticated', 'authenticated', 'b-${B}@prueba.invalid');
  ${como(A)}
  ${prueba('A guarda sus dibujos de AAPL (dueño por defecto)', upsert('AAPL', UNO), 'filas:1')}
  ${prueba('A guarda los de MSFT (otra fila)', upsert('MSFT', '[]'), 'filas:1')}
  ${prueba('A los lee', 'PERFORM 1 FROM public.dibujos_grafico', 'filas:2')}
  ${prueba('A cambia los de AAPL con el mismo upsert', upsert('AAPL', DOS), 'filas:1')}
  SELECT jsonb_array_length(dibujos)::text INTO v FROM public.dibujos_grafico WHERE simbolo = 'AAPL';
  res := res || jsonb_build_object('n', 'AAPL tiene ahora 2 dibujos (no se duplicó la fila)', 'r', v, 'e', '2');
  ${prueba('no admite un símbolo en minúsculas', upsert('aapl', '[]'), 'error:23514')}
  ${prueba('no admite algo que no sea una lista', upsert('NVDA', '{"a":1}'), 'error:23514')}
  ${prueba('no admite más de 200 KB por valor', `INSERT INTO public.dibujos_grafico (simbolo, dibujos) VALUES ('TSLA', jsonb_build_array(repeat('x', 210000)))`, 'error:23514')}
  ${prueba('A no puede crear una fila a nombre de B', `INSERT INTO public.dibujos_grafico (user_id, simbolo, dibujos) VALUES ('${B}', 'AAPL', '[]')`, 'error:42501')}
  ${prueba('A no puede poner la fecha a mano', "UPDATE public.dibujos_grafico SET updated_at = now()", 'error:42501')}
  ${prueba('A puede borrar los suyos de MSFT', "DELETE FROM public.dibujos_grafico WHERE simbolo = 'MSFT'", 'filas:1')}
  ${como(B)}
  ${prueba('B no ve los dibujos de A', `PERFORM 1 FROM public.dibujos_grafico WHERE user_id = '${A}'`, 'filas:0')}
  ${prueba('B no ve ninguna fila', 'PERFORM 1 FROM public.dibujos_grafico', 'filas:0')}
  ${prueba('B no cambia los de A', `UPDATE public.dibujos_grafico SET dibujos = '[]' WHERE user_id = '${A}'`, 'filas:0')}
  ${prueba('B no se apropia de los de A', `UPDATE public.dibujos_grafico SET user_id = '${B}' WHERE user_id = '${A}'`, 'error:42501')}
  ${prueba('B no borra los de A', `DELETE FROM public.dibujos_grafico WHERE user_id = '${A}'`, 'filas:0')}
  ${prueba('B guarda los suyos de AAPL (misma acción, otra fila)', upsert('AAPL', '[]'), 'filas:1')}
  ${como(A)}
  SELECT jsonb_array_length(dibujos)::text INTO v FROM public.dibujos_grafico WHERE simbolo = 'AAPL';
  res := res || jsonb_build_object('n', 'los de A siguen igual tras todo lo que intentó B', 'r', v, 'e', '2');
  ${como(null)}
  ${prueba('anon no lee', 'PERFORM 1 FROM public.dibujos_grafico', 'error:42501')}
  ${prueba('anon no crea', upsert('AAPL', '[]'), 'error:42501')}
  ${prueba('anon no cambia', "UPDATE public.dibujos_grafico SET dibujos = '[]'", 'error:42501')}
  ${prueba('anon no borra', 'DELETE FROM public.dibujos_grafico', 'error:42501')}
  RAISE EXCEPTION 'RESULTADO:%', res;   -- se deshace TODO, a propósito
END $prueba$;`
  let txt = ''
  try { await consulta(q); txt = '' } catch (e) { txt = String(e.message || e) }
  const m = txt.match(/RESULTADO:(\[.*\])/s)
  if (!m) { console.error('No llegó el resultado:', txt.slice(0, 500)); process.exit(2) }
  for (const x of JSON.parse(m[1].replace(/\\"/g, '"'))) ok(x.r === x.e, `${x.n} (${x.r})`)
  const quedan = await consulta(`SELECT (SELECT count(*) FROM auth.users WHERE id IN ('${A}', '${B}'))::int AS usuarios, (SELECT count(*) FROM public.dibujos_grafico WHERE user_id IN ('${A}', '${B}'))::int AS filas`)
  ok(quedan[0].usuarios === 0 && quedan[0].filas === 0, 'la transacción se ha deshecho: ni un usuario ni una fila')
  const r = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/dibujos_grafico?select=*`, { headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY } })
  ok(r.status === 401 || r.status === 403, `por HTTP, la clave anon no lee (HTTP ${r.status})`)
  const w = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/dibujos_grafico?on_conflict=user_id,simbolo`, { method: 'POST', headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }, body: '{"simbolo":"AAPL","dibujos":[]}' })
  ok(w.status === 401 || w.status === 403, `por HTTP, la clave anon no escribe (HTTP ${w.status})`)
  console.log(fallos ? `dibujosSeguridad: ${fallos} fallos` : 'dibujosSeguridad: todas bien')
  process.exitCode = fallos ? 1 : 0
})().catch(e => { console.error('ERROR', e.message || e); process.exitCode = 2 })
