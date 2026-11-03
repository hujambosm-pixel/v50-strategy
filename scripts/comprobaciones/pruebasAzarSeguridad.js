// scripts/comprobaciones/pruebasAzarSeguridad.js — ¿quién puede borrar una prueba contra el azar? (sql/pruebas_azar_borrar.sql; docs/builder.md, §60). Con usuarios simulados, en una transacción que SIEMPRE se deshace (termina en un error a propósito): no queda nada escrito.
// Uso: node scripts/comprobaciones/pruebasAzarSeguridad.js. Termina en 0 si todo va bien. A: un usuario de verdad, sin tocar sus filas (la prueba es de ensayo). B: otro que no existe.
const { consulta } = require('../universoNasdaq100')
const B = '00000000-0000-4000-8000-00000000000b'
const como = (u) => u ? `PERFORM set_config('role', 'authenticated', true); PERFORM set_config('request.jwt.claims', '{"sub":"${u}","role":"authenticated"}', true);`
  : `PERFORM set_config('role', 'anon', true); PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);`
const yo = `PERFORM set_config('role', 'postgres', true); PERFORM set_config('request.jwt.claims', '', true);`
const q = `DO $$
DECLARE a uuid; p bigint; n int; res text := ''; f jsonb; nada int;
BEGIN
  SELECT id INTO a FROM auth.users ORDER BY created_at LIMIT 1;
  INSERT INTO public.pruebas_azar (user_id, estrategia_id, estrategia_nombre, estrategia_foto, estrategia_huella, valor, velas, periodos, regla, semilla)
    VALUES (a, gen_random_uuid(), 'ensayo seguridad', '{}'::jsonb, repeat('0', 64), 'X', 'diarias', '[]'::jsonb, '{}'::jsonb, 1) RETURNING id INTO p;
  INSERT INTO public.pruebas_azar_resultados (prueba_id, user_id, resultado) VALUES (p, a, '{}'::jsonb);
  INSERT INTO public.pruebas_azar_graficos (prueba_id, user_id, datos) VALUES (p, a, '{}'::jsonb);
  -- B no borra lo de A: 0 filas.
  ${como(B)}
  DELETE FROM public.pruebas_azar WHERE id = p; GET DIAGNOSTICS n = ROW_COUNT; res := res || 'B_borra=' || n || ';';
  -- B no ve ni borra el resultado de A.
  BEGIN DELETE FROM public.pruebas_azar_resultados WHERE prueba_id = p; res := res || 'B_resultado=sin_error;'; EXCEPTION WHEN insufficient_privilege THEN res := res || 'B_resultado=denegado;'; END;
  -- El gráfico (§61): B no lo ve, ni añade uno en una prueba de A, ni lo borra.
  SELECT count(*) INTO n FROM public.pruebas_azar_graficos WHERE prueba_id = p; res := res || 'B_ve_grafico=' || n || ';';
  BEGIN INSERT INTO public.pruebas_azar_graficos (prueba_id, datos) VALUES (p, '{}'::jsonb); res := res || 'B_anade_grafico=sin_error;'; EXCEPTION WHEN insufficient_privilege THEN res := res || 'B_anade_grafico=denegado;'; END;
  BEGIN DELETE FROM public.pruebas_azar_graficos WHERE prueba_id = p; res := res || 'B_borra_grafico=sin_error;'; EXCEPTION WHEN insufficient_privilege THEN res := res || 'B_borra_grafico=denegado;'; END;
  -- anon: nada.
  ${como(null)}
  BEGIN DELETE FROM public.pruebas_azar WHERE id = p; res := res || 'anon=sin_error;'; EXCEPTION WHEN insufficient_privilege THEN res := res || 'anon=denegado;'; END;
  BEGIN SELECT count(*) INTO n FROM public.pruebas_azar_graficos; res := res || 'anon_grafico=sin_error;'; EXCEPTION WHEN insufficient_privilege THEN res := res || 'anon_grafico=denegado;'; END;
  -- A tampoco puede cambiarla, ni borrar el resultado y dejar la prueba.
  ${como('__A__')}
  BEGIN UPDATE public.pruebas_azar SET valor = 'Y' WHERE id = p; res := res || 'A_cambia=sin_error;'; EXCEPTION WHEN insufficient_privilege THEN res := res || 'A_cambia=denegado;'; END;
  BEGIN DELETE FROM public.pruebas_azar_resultados WHERE prueba_id = p; res := res || 'A_resultado=sin_error;'; EXCEPTION WHEN insufficient_privilege THEN res := res || 'A_resultado=denegado;'; END;
  -- A ve su gráfico.
  SELECT count(*) INTO n FROM public.pruebas_azar_graficos WHERE prueba_id = p; res := res || 'A_ve_grafico=' || n || ';';
  -- A sí borra la suya, y el resultado y el gráfico se van con ella.
  DELETE FROM public.pruebas_azar WHERE id = p; GET DIAGNOSTICS n = ROW_COUNT; res := res || 'A_borra=' || n || ';';
  ${yo}
  SELECT count(*) INTO n FROM public.pruebas_azar WHERE id = p; res := res || 'quedan_pruebas=' || n || ';';
  SELECT count(*) INTO n FROM public.pruebas_azar_resultados WHERE prueba_id = p; res := res || 'quedan_resultados=' || n || ';';
  SELECT count(*) INTO n FROM public.pruebas_azar_graficos WHERE prueba_id = p; res := res || 'quedan_graficos=' || n || ';';
  RAISE EXCEPTION 'RESULTADO:%', res;
END $$;`
;(async () => {
  const usuario = (await consulta('SELECT id FROM auth.users ORDER BY created_at LIMIT 1;'))[0].id
  let msg = ''
  try { await consulta(q.replace(/__A__/g, usuario)) } catch (e) { msg = String(e.message || e) }
  const m = msg.match(/RESULTADO:([^\n"]*)/)
  if (!m) { console.log('✗ no se pudo comprobar:', msg.slice(0, 400)); process.exit(1) }
  const r = Object.fromEntries(m[1].split(';').filter(Boolean).map(x => x.split('=')))
  const espera = { B_borra: '0', B_resultado: 'denegado', anon: 'denegado', A_cambia: 'denegado', A_resultado: 'denegado', A_borra: '1', quedan_pruebas: '0', quedan_resultados: '0', B_ve_grafico: '0', B_anade_grafico: 'denegado', B_borra_grafico: 'denegado', anon_grafico: 'denegado', A_ve_grafico: '1', quedan_graficos: '0' }
  let f = 0
  for (const [k, v] of Object.entries(espera)) { const b = r[k] === v; if (!b) f++; console.log(`${b ? '✓' : '✗'} ${k}: ${r[k]} (debe ser ${v})`) }
  const t = await consulta('SELECT count(*)::int AS n FROM public.pruebas_azar;')
  console.log(`Pruebas en la base al terminar: ${t[0].n} (la transacción se ha deshecho)`)
  process.exit(f ? 1 : 0)
})().catch(e => { console.log('✗', e.message || e); process.exit(1) })
