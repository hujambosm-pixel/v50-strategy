// scripts/comprobaciones/alertasComprobador.js — el COMPROBADOR de las alertas (scripts/alertas/comprobador.js, docs/builder.md §217) de
// principio a fin, contra la base LOCAL de verdad, con un USUARIO SIMULADO y PRECIOS INVENTADOS (sin Yahoo ni notificación). No va en
// comunes.sh. Uso: node scripts/comprobaciones/alertasComprobador.js. Al acabar (bien o mal) borra el usuario simulado y, en cascada, sus
// alertas y saltos: los datos de Sergi no se leen ni se tocan (se comprueba que sus alertas y saltos siguen iguales). Termina en 0 si todo va bien.
//
// PASADA a las 13:00 de Nueva York del vie 20/11/2026 (sesión abierta, salvo ZF, que ya cerró). Alertas, todas creadas el 01/11:
//   ZA «Toca 100, al subir», una vez · máximo 101 → SALTA a 100 y se apaga.
//   ZB «Cierra por encima de 50» · sesión abierta → no se mira.
//   ZC «Cae un 5 %», una vez al día · ayer 100, abre 99, mínimo 94 → SALTA a 95 y sigue encendida.
//   ZD «Toca 10, al bajar», cada vez, DESARMADA · mínimo 10,50 → no salta y se vuelve a armar.
//   ZE «Toca 1, al subir», caducaba el 19/11 → se apaga sin saltar.
//   ZF «El cierre cruza por encima de su SMA 3», una vez · cierres 10, 10, 10, 9, 12 (12 > 10,33; el jueves 9 < 9,67) → SALTA a 12.
//   ZG «Toca 500, al subir» · máximo 101 → no.   ZH «Toca 5, al bajar» · sin precios → no se mira (aviso).
// SEGUNDA PASADA con los mismos precios: nada salta (ZA y ZF apagadas; ZC ya saltó hoy).
const path = require('path'), fs = require('fs'), os = require('os'), crypto = require('crypto')
const { spawnSync } = require('child_process')
const { consulta } = require('../universoNasdaq100')
let fallos = 0
const ok = (c, t) => { console.log(`${c ? 'OK  ' : 'MAL '} ${t}`); if (!c) fallos++ }
const U = crypto.randomUUID()
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`
const COMPROBADOR = path.resolve(__dirname, '..', 'alertas', 'comprobador.js')
const ARCHIVO = path.join(os.tmpdir(), `alertas-precios-${U}.json`)

const dia = (abre, maximo, minimo, ahora) => ({ abre, maximo, minimo, ahora })
const abierta = (d, cierreAyer = 100) => ({ zona: 'America/New_York', fecha: '2026-11-20', cerrada: false, dia: d, cierreAyer, velas: [] })
const F = ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20']
const PRECIOS = {
  ZA: abierta(dia(99, 101, 98, 100.5)), ZB: abierta(dia(49, 52, 48, 51)), ZC: abierta(dia(99, 100, 94, 96)), ZD: abierta(dia(11, 11.5, 10.5, 11)),
  ZE: abierta(dia(1, 2, 1, 2)), ZG: abierta(dia(99, 101, 98, 100.5)),
  ZF: { zona: 'America/New_York', fecha: '2026-11-20', cerrada: true, dia: dia(12, 12, 12, 12), cierreAyer: 9, velas: [10, 10, 10, 9, 12].map((c, k) => ({ date: F[k], open: c, high: c, low: c, close: c, volume: 1000 })) },
}
const CRUCE = { filas: [{ quien: 'valor', velas: 'diarias', si: { c: 'cruza', de: { c: 'precioVsMedia', p: { lado: 'encima', tipo: 'SMA', periodo: 3 } } } }] }
const ALERTAS = [
  ['ZA', 'toca', { nivel: 100, sentido: 'sube' }, 'una_vez', true, null],
  ['ZB', 'cierra', { nivel: 50, lado: 'encima' }, 'una_vez', true, null],
  ['ZC', 'movimiento', { pct: 5, sentido: 'baja' }, 'una_al_dia', true, null],
  ['ZD', 'toca', { nivel: 10, sentido: 'baja' }, 'cada_vez', false, null],
  ['ZE', 'toca', { nivel: 1, sentido: 'sube' }, 'una_vez', true, '2026-11-19'],
  ['ZF', 'condicion', CRUCE, 'una_vez', true, null],
  ['ZG', 'toca', { nivel: 500, sentido: 'sube' }, 'una_vez', true, null],
  ['ZH', 'toca', { nivel: 5, sentido: 'baja' }, 'una_vez', true, null],
]
const corre = () => spawnSync(process.execPath, [COMPROBADOR, '--usuario', U, '--precios', ARCHIVO, '--ahora', '2026-11-20T18:00:00Z', '--sin-aviso', '--sin-registro'], { encoding: 'utf8' })
const foto = async () => (await consulta(`SELECT (SELECT md5(coalesce(string_agg(t::text, '|' ORDER BY id), '')) FROM public.alertas t WHERE user_id <> '${U}') AS a,
  (SELECT md5(coalesce(string_agg(t::text, '|' ORDER BY id), '')) FROM public.alertas_saltos t WHERE user_id <> '${U}') AS s`))[0]

;(async () => {
  const antes = await foto()
  try {
    fs.writeFileSync(ARCHIVO, JSON.stringify(PRECIOS))
    await consulta(`INSERT INTO auth.users (id, aud, role, email) VALUES ('${U}', 'authenticated', 'authenticated', 'alertas-${U}@prueba.invalid');
      INSERT INTO public.alertas (user_id, simbolo, tipo, regla, despues, armada, caduca, creada) VALUES ${ALERTAS.map(([s, t, r, d, ar, ca]) =>
        `('${U}', ${lit(s)}, ${lit(t)}, ${lit(JSON.stringify(r))}::jsonb, ${lit(d)}, ${ar}, ${ca ? lit(ca) : 'NULL'}, '2026-11-01T15:00:00Z')`).join(', ')};`)
    const r1 = corre()
    console.log(r1.stdout.trim().split(/\r?\n/).map(l => '      | ' + l).join('\n'))
    ok(r1.status === 0, `la primera pasada termina bien (código ${r1.status}${r1.stderr ? ': ' + r1.stderr.trim().slice(0, 200) : ''})`)
    ok(/Pasada: 8 alertas, 7 símbolos con precio, 3 saltan\./.test(r1.stdout), 'dice «8 alertas, 7 símbolos con precio, 3 saltan»')
    ok(/⚠ ZH: sin precios/.test(r1.stdout), 'avisa de que ZH no tiene precios')
    const est = Object.fromEntries((await consulta(`SELECT simbolo, activa, armada, ultimo_salto IS NOT NULL AS salto FROM public.alertas WHERE user_id = '${U}'`)).map(x => [x.simbolo, `${x.activa ? 'encendida' : 'apagada'}/${x.armada ? 'armada' : 'desarmada'}/${x.salto ? 'saltó' : '—'}`]))
    const espera = { ZA: 'apagada/armada/saltó', ZB: 'encendida/armada/—', ZC: 'encendida/armada/saltó', ZD: 'encendida/armada/—', ZE: 'apagada/armada/—', ZF: 'apagada/armada/saltó', ZG: 'encendida/armada/—', ZH: 'encendida/armada/—' }
    for (const s of Object.keys(espera)) ok(est[s] === espera[s], `${s}: ${est[s]} (debe ser ${espera[s]})`)
    const sal = await consulta(`SELECT simbolo, precio::float8 AS precio, detalle->>'titulo' AS titulo, cuando, visto FROM public.alertas_saltos WHERE user_id = '${U}' ORDER BY simbolo`)
    ok(sal.map(x => `${x.simbolo} ${x.precio}`).join(', ') === 'ZA 100, ZC 95, ZF 12', `«Saltaron»: ${sal.map(x => `${x.simbolo} a ${x.precio}`).join(', ')}`)
    ok(sal.map(x => x.titulo).join(' | ') === 'ZA tocó 100,00 | ZC cae un 5 % en el día | ZF: se cumple tu condición', `con su texto: ${sal.map(x => x.titulo).join(' | ')}`)
    ok(sal.every(x => !x.visto && String(x.cuando).startsWith('2026-11-20')), 'sin ver y con la hora de la pasada')
    const r2 = corre()
    ok(r2.status === 0 && /0 saltan\./.test(r2.stdout), `la segunda pasada, con los mismos precios, no hace saltar nada (${(r2.stdout.match(/Pasada.*$/m) || [''])[0]})`)
    ok(Number((await consulta(`SELECT count(*) AS n FROM public.alertas_saltos WHERE user_id = '${U}'`))[0].n) === 3, 'siguen 3 saltos')
  } catch (e) { ok(false, 'error: ' + e.message) } finally {
    try { fs.unlinkSync(ARCHIVO) } catch (_) {}
    await consulta(`DELETE FROM auth.users WHERE id = '${U}'`)
    const quedan = await consulta(`SELECT (SELECT count(*) FROM public.alertas WHERE user_id = '${U}') + (SELECT count(*) FROM public.alertas_saltos WHERE user_id = '${U}') AS n`)
    ok(Number(quedan[0].n) === 0, 'el usuario simulado y todo lo suyo, borrados')
    const despues = await foto()
    ok(antes.a === despues.a && antes.s === despues.s, 'las alertas y los saltos de los demás (los de Sergi) siguen idénticos')
  }
  console.log(fallos ? `\n${fallos} FALLOS` : '\nTODO BIEN')
  process.exit(fallos ? 1 : 0)
})()
