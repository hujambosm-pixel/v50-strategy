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
  console.log(`screenerSeguridad: ${fallos ? fallos + ' fallos' : 'todo bien'}`); process.exit(fallos ? 1 : 0)
})()
