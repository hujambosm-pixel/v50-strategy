// scripts/comprobaciones/alertasSeguridad.js — la seguridad de alertas y alertas_saltos (docs/builder.md, §215) contra la base de VERDAD. No va en comunes.sh. Uso: node scripts/comprobaciones/alertasSeguridad.js
// Dos usuarios simulados y anon, en una transacción que SIEMPRE se deshace (termina en un error a propósito): ni un usuario ni una fila se quedan. No toca los datos de Sergi. Y comprueba con la clave anon, por HTTP, que no se lee ni se escribe nada. Termina en 0 si todo va bien.
const path = require('path'), fs = require('fs'), crypto = require('crypto')
const R = path.resolve(__dirname, '..', '..')
const { consulta } = require('../universoNasdaq100')
let fallos = 0
const ok = (c, t) => { console.log(`${c ? 'OK  ' : 'MAL '} ${t}`); if (!c) fallos++ }
const env = Object.fromEntries(fs.readFileSync(path.join(R, '.env.local'), 'utf8').split(/\r?\n/).filter(l => /^[A-Z_]+=/.test(l)).map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }))
const A = crypto.randomUUID(), B = crypto.randomUUID(), AL = crypto.randomUUID(), BL = crypto.randomUUID()
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`
const prueba = (nombre, cuerpo, espera) => `
  BEGIN ${cuerpo}; GET DIAGNOSTICS filas = ROW_COUNT; res := res || jsonb_build_object('n', ${lit(nombre)}, 'r', 'filas:' || filas, 'e', ${lit(espera)});
  EXCEPTION WHEN OTHERS THEN res := res || jsonb_build_object('n', ${lit(nombre)}, 'r', 'error:' || SQLSTATE, 'e', ${lit(espera)}); END;`
const como = (u) => u ? `PERFORM set_config('role', 'authenticated', true); PERFORM set_config('request.jwt.claims', '{"sub":"${u}","role":"authenticated"}', true);`
  : `PERFORM set_config('role', 'anon', true); PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);`
const nueva = (sim, tipo, regla, extra = '') => `INSERT INTO public.alertas (simbolo, tipo, regla${extra ? ', despues' : ''}) VALUES (${lit(sim)}, ${lit(tipo)}, ${lit(regla)}::jsonb${extra ? `, ${lit(extra)}` : ''})`
const TOCA = '{"nivel":220,"sentido":"baja"}'
;(async () => {
  const q = `DO $prueba$
DECLARE filas bigint; res jsonb := '[]'::jsonb; v text;
BEGIN
  INSERT INTO auth.users (id, aud, role, email) VALUES ('${A}', 'authenticated', 'authenticated', 'a-${A}@prueba.invalid'), ('${B}', 'authenticated', 'authenticated', 'b-${B}@prueba.invalid');
  ${como(A)}
  ${prueba('A crea una alerta «Toca» (dueño por defecto)', nueva('AAPL', 'toca', TOCA), 'filas:1')}
  ${prueba('A crea otra de cualquier símbolo (^GSPC), «una al día»', nueva('^GSPC', 'movimiento', '{"pct":3,"sentido":"ambos"}', 'una_al_dia'), 'filas:1')}
  ${prueba('A las lee', 'PERFORM 1 FROM public.alertas', 'filas:2')}
  SELECT despues || '/' || activa::text || '/' || armada::text INTO v FROM public.alertas WHERE simbolo = 'AAPL';
  res := res || jsonb_build_object('n', 'por defecto: una vez, encendida y armada', 'r', v, 'e', 'una_vez/true/true');
  ${prueba('A la cambia (nivel y nota)', `UPDATE public.alertas SET regla = '{"nivel":215,"sentido":"baja"}', nota = 'soporte' WHERE simbolo = 'AAPL'`, 'filas:1')}
  ${prueba('A la apaga y la vuelve a encender', `UPDATE public.alertas SET activa = false WHERE simbolo = 'AAPL'`, 'filas:1')}
  ${prueba('no admite un tipo que no existe', nueva('AAPL', 'adivina', '{}'), 'error:23514')}
  ${prueba('no admite un símbolo en minúsculas', nueva('aapl', 'toca', TOCA), 'error:23514')}
  ${prueba('no admite una regla que no sea un objeto', nueva('AAPL', 'toca', '[1,2]'), 'error:23514')}
  ${prueba('no admite un «después» que no existe', nueva('AAPL', 'toca', TOCA, 'nunca'), 'error:23514')}
  ${prueba('A no puede crear una alerta a nombre de B', `INSERT INTO public.alertas (user_id, simbolo, tipo) VALUES ('${B}', 'AAPL', 'toca')`, 'error:42501')}
  ${prueba('A no puede poner su id a mano', `INSERT INTO public.alertas (id, simbolo, tipo) VALUES ('${AL}', 'AAPL', 'toca')`, 'error:42501')}
  ${prueba('A no puede poner la fecha a mano', 'UPDATE public.alertas SET actualizada = now()', 'error:42501')}
  ${prueba('A no puede poner el origen a mano', `UPDATE public.alertas SET origen = '${AL}'`, 'error:42501')}
  ${prueba('A apunta un salto en su alerta', `INSERT INTO public.alertas_saltos (alerta_id, simbolo, precio, detalle) SELECT id, simbolo, 214.6, '{"minimo":214.6}' FROM public.alertas WHERE simbolo = 'AAPL'`, 'filas:1')}
  ${prueba('A marca el salto como visto', 'UPDATE public.alertas_saltos SET visto = true', 'filas:1')}
  ${prueba('A no puede cambiar el precio de un salto', 'UPDATE public.alertas_saltos SET precio = 1', 'error:42501')}
  ${como(null)}
  PERFORM set_config('role', 'postgres', true);
  INSERT INTO public.alertas (id, user_id, simbolo, tipo) VALUES ('${BL}', '${B}', 'MSFT', 'toca');
  ${como(A)}
  ${prueba('A no puede apuntar un salto en la alerta de B', `INSERT INTO public.alertas_saltos (alerta_id, simbolo) VALUES ('${BL}', 'MSFT')`, 'error:42501')}
  ${como(B)}
  ${prueba('B solo ve su alerta', 'PERFORM 1 FROM public.alertas', 'filas:1')}
  ${prueba('B no ve las de A', `PERFORM 1 FROM public.alertas WHERE user_id = '${A}'`, 'filas:0')}
  ${prueba('B no ve los saltos de A', 'PERFORM 1 FROM public.alertas_saltos', 'filas:0')}
  ${prueba('B no cambia las de A', `UPDATE public.alertas SET activa = false WHERE user_id = '${A}'`, 'filas:0')}
  ${prueba('B no se apropia de las de A', `UPDATE public.alertas SET user_id = '${B}' WHERE user_id = '${A}'`, 'error:42501')}
  ${prueba('B no borra las de A', `DELETE FROM public.alertas WHERE user_id = '${A}'`, 'filas:0')}
  ${prueba('B no marca como vistos los saltos de A', 'UPDATE public.alertas_saltos SET visto = false', 'filas:0')}
  ${prueba('B no borra los saltos de A', 'DELETE FROM public.alertas_saltos', 'filas:0')}
  ${como(A)}
  SELECT count(*)::text INTO v FROM public.alertas_saltos WHERE visto;
  res := res || jsonb_build_object('n', 'el salto de A sigue (y visto) tras todo lo que intentó B', 'r', v, 'e', '1');
  ${prueba('A borra su alerta de AAPL', "DELETE FROM public.alertas WHERE simbolo = 'AAPL'", 'filas:1')}
  SELECT count(*)::text INTO v FROM public.alertas_saltos;
  res := res || jsonb_build_object('n', 'al borrar la alerta se borran sus saltos', 'r', v, 'e', '0');
  ${como(null)}
  ${prueba('anon no lee alertas', 'PERFORM 1 FROM public.alertas', 'error:42501')}
  ${prueba('anon no lee saltos', 'PERFORM 1 FROM public.alertas_saltos', 'error:42501')}
  ${prueba('anon no crea alertas', nueva('AAPL', 'toca', TOCA), 'error:42501')}
  ${prueba('anon no cambia', 'UPDATE public.alertas SET activa = false', 'error:42501')}
  ${prueba('anon no borra', 'DELETE FROM public.alertas', 'error:42501')}
  RAISE EXCEPTION 'RESULTADO:%', res;   -- se deshace TODO, a propósito
END $prueba$;`
  let txt = ''
  try { await consulta(q); txt = '' } catch (e) { txt = String(e.message || e) }
  const m = txt.match(/RESULTADO:(\[.*\])/s)
  if (!m) { console.error('No llegó el resultado:', txt.slice(0, 800)); process.exit(2) }
  for (const x of JSON.parse(m[1].replace(/\\"/g, '"'))) ok(x.r === x.e, `${x.n} (${x.r})`)
  const quedan = await consulta(`SELECT (SELECT count(*) FROM auth.users WHERE id IN ('${A}', '${B}'))::int AS usuarios, (SELECT count(*) FROM public.alertas WHERE user_id IN ('${A}', '${B}'))::int AS filas`)
  ok(quedan[0].usuarios === 0 && quedan[0].filas === 0, 'la transacción se ha deshecho: ni un usuario ni una fila')
  for (const t of ['alertas', 'alertas_saltos']) {
    const r = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${t}?select=*`, { headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY } })
    ok(r.status === 401 || r.status === 403, `por HTTP, la clave anon no lee ${t} (HTTP ${r.status})`)
  }
  const w = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/alertas`, { method: 'POST', headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: '{"simbolo":"AAPL","tipo":"toca","regla":{}}' })
  ok(w.status === 401 || w.status === 403, `por HTTP, la clave anon no escribe (HTTP ${w.status})`)
  console.log(fallos ? `alertasSeguridad: ${fallos} fallos` : 'alertasSeguridad: todas bien')
  process.exitCode = fallos ? 1 : 0
})().catch(e => { console.error('ERROR', e.message || e); process.exitCode = 2 })
