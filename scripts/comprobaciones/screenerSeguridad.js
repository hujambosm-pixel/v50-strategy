// scripts/comprobaciones/screenerSeguridad.js — permisos de las tablas del screener (sql/screener.sql) en la base de verdad, cada
// prueba dentro de BEGIN … ROLLBACK (no queda nada escrito). La lanza Claude aparte (no va en comunes.sh): node scripts/comprobaciones/screenerSeguridad.js
// Usuario A = el de Sergi; B = uno inventado (solo para leer: no existe, así que no puede crear filas).
const { consulta } = require('../universoNasdaq100')
const A = 'c006506d-084b-4c2e-a458-70c5caa35d3a', Bu = '00000000-0000-4000-8000-000000000001'
const como = (u) => `SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claims', '{"sub":"${u}","role":"authenticated"}', true);`
let fallos = 0
const prueba = async (nombre, sql, espera) => {
  try { const r = await consulta(`BEGIN; ${sql} ROLLBACK;`); if (espera === 'error') fallos++; console.log(espera === 'error' ? '✗' : '✓', nombre, JSON.stringify(r).slice(0, 120)) }
  catch (e) { if (espera !== 'error') fallos++; console.log(espera === 'error' ? '✓' : '✗', nombre, '→', e.message.slice(0, 90)) }
}
;(async () => {
  const ins = `INSERT INTO public.screener_vistas (nombre, vista) VALUES ('rls', '{"tipo":"vista_screener"}');`
  await prueba('A crea y ve la suya', `${como(A)} ${ins} SELECT count(*) AS mias FROM public.screener_vistas WHERE nombre = 'rls';`)
  await prueba('B no ve la de A', `${como(A)} ${ins} RESET ROLE; ${como(Bu)} SELECT count(*) AS de_otro FROM public.screener_vistas WHERE nombre = 'rls';`)
  await prueba('A no puede poner otro dueño', `${como(A)} INSERT INTO public.screener_vistas (nombre, vista, user_id) VALUES ('x', '{"tipo":"vista_screener"}', '${Bu}');`, 'error')
  await prueba('tipo distinto, rechazado', `${como(A)} INSERT INTO public.screener_vistas (nombre, vista) VALUES ('x', '{"tipo":"otra"}');`, 'error')
  await prueba('anon no lee vistas', `SET LOCAL ROLE anon; SELECT count(*) FROM public.screener_vistas;`, 'error')
  await prueba('anon no lee empresas', `SET LOCAL ROLE anon; SELECT count(*) FROM public.screener_empresas;`, 'error')
  await prueba('con sesión lee empresas', `${como(A)} SELECT count(*) AS empresas FROM public.screener_empresas;`)
  await prueba('con sesión no escribe empresas', `${como(A)} UPDATE public.screener_empresas SET precio = 1 WHERE simbolo = 'AAPL';`, 'error')
  await prueba('con sesión no escribe cuentas', `${como(A)} DELETE FROM public.screener_cuentas WHERE cik = 320193;`, 'error')
  // Parte 2 (sql/screener_tecnico.sql): la columna `tecnico` solo se escribe con guardar_tecnico_screener.
  const t = `'{"fecha":"2026-11-06","cierre":200.5,"ema200":180.25,"max52":210,"volUlt":1000,"volMedio50":900,"cierre3m":190,"velas":1260}'`
  await prueba('con sesión no escribe tecnico directamente', `${como(A)} UPDATE public.screener_empresas SET tecnico = '{}' WHERE simbolo = 'AAPL';`, 'error')
  await prueba('guardar_tecnico_screener escribe SOLO tecnico', `${como(A)} SELECT public.guardar_tecnico_screener('AAPL', ${t}) AS ok; RESET ROLE;
    SELECT tecnico->>'cierre' AS cierre, tecnico ? 'en' AS con_hora, precio IS NOT DISTINCT FROM (SELECT precio FROM public.screener_empresas WHERE simbolo='AAPL') AS precio_igual FROM public.screener_empresas WHERE simbolo = 'AAPL';`)
  await prueba('§16: guarda también ema50 y ema20', `${como(A)} SELECT public.guardar_tecnico_screener('AAPL', '{"fecha":"2026-11-06","cierre":1,"ema50":2.5,"ema20":3.5}'); RESET ROLE;
    DO $$ BEGIN IF (SELECT (tecnico->>'ema50')::numeric <> 2.5 OR (tecnico->>'ema20')::numeric <> 3.5 FROM public.screener_empresas WHERE simbolo='AAPL') THEN RAISE EXCEPTION 'no guardó ema50/ema20'; END IF; END $$;`)
  await prueba('§16: ema20 negativa, rechazada', `${como(A)} SELECT public.guardar_tecnico_screener('AAPL', '{"fecha":"2026-11-06","cierre":1,"ema20":-1}');`, 'error')
  await prueba('guardar_tecnico_screener: claves de más se quitan', `${como(A)} SELECT public.guardar_tecnico_screener('AAPL', '{"fecha":"2026-11-06","cierre":1,"precio":5}'); RESET ROLE;
    DO $$ BEGIN IF (SELECT tecnico ? 'precio' FROM public.screener_empresas WHERE simbolo='AAPL') THEN RAISE EXCEPTION 'guardó una clave de más'; END IF; END $$;`)
  await prueba('guardar_tecnico_screener: símbolo fuera del screener → false', `${como(A)} DO $$ BEGIN IF public.guardar_tecnico_screener('ZZZZ9', '{"fecha":"2026-11-06","cierre":1}') THEN RAISE EXCEPTION 'ZZZZ9 no debería estar'; END IF; END $$;`)
  await prueba('anon no puede llamar a guardar_tecnico_screener', `SET LOCAL ROLE anon; SELECT public.guardar_tecnico_screener('AAPL', ${t});`, 'error')
  await prueba('sin usuario, rechazado', `SET LOCAL ROLE authenticated; SELECT public.guardar_tecnico_screener('AAPL', ${t});`, 'error')
  await prueba('fecha futura, rechazada', `${como(A)} SELECT public.guardar_tecnico_screener('AAPL', '{"fecha":"2099-01-01","cierre":1}');`, 'error')
  await prueba('cierre 0, rechazado', `${como(A)} SELECT public.guardar_tecnico_screener('AAPL', '{"fecha":"2026-11-06","cierre":0}');`, 'error')
  await prueba('número negativo, rechazado', `${como(A)} SELECT public.guardar_tecnico_screener('AAPL', '{"fecha":"2026-11-06","cierre":1,"ema200":-3}');`, 'error')
  await prueba('texto en un número, rechazado', `${como(A)} SELECT public.guardar_tecnico_screener('AAPL', '{"fecha":"2026-11-06","cierre":1,"max52":"x"}');`, 'error')
  await prueba('más de 2 KB, rechazado', `${como(A)} SELECT public.guardar_tecnico_screener('AAPL', jsonb_build_object('fecha','2026-11-06','cierre',1,'relleno',repeat('x',3000)));`, 'error')
  console.log(`screenerSeguridad: ${fallos ? fallos + ' fallos' : 'todo bien'}`); process.exit(fallos ? 1 : 0)
})()
