// scripts/comprobaciones/alertas.js — el MOTOR de las alertas (lib/alertas/motor.js, docs/builder.md §216). Las corre comunes.sh.
// Termina en 0 si todo da lo esperado. Todas las cifras, a mano.
//
// VELAS INVENTADAS (lun 16/11 a lun 23/11/2026; cierres):
//   X:   10, 10, 10, 9, 12 (vie 20/11), 13 (lun 23/11).  SMA (3) del cierre: jue 19 (10 + 10 + 9) / 3 = 9,667 → 9 debajo;
//        vie 20 (10 + 9 + 12) / 3 = 10,333 → 12 encima: el viernes «el cierre cruza por encima de su SMA 3» (el jueves estaba debajo).
//        lun 23 (9 + 12 + 13) / 3 = 11,333 → 13 encima, pero ya lo estaba: no cruza.
//   QQQ: 1, 2, 3, 4, 5 → vie 20: 5 > (3 + 4 + 5) / 3 = 4: encima de su SMA 3.   QQQ al revés (5 … 1): 1 < 2: debajo.
process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://arnes.invalid'; process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'clave-falsa-del-arnes'
const C0 = require('./cargador'), R = C0.RAIZ
let fallos = 0
const ok = (c, t) => { console.log(`${c ? 'OK  ' : 'MAL '} ${t}`); if (!c) fallos++ }
const cerca = (a, b, tol = 1e-9) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tol * Math.max(1, Math.abs(b))
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b)

;(async () => {
  await C0.prepara(); C0.registra(R)
  const M = require(R + '/lib/alertas/motor.js')
  const alerta = (o) => ({ simbolo: 'X', tipo: 'toca', regla: { nivel: 100, sentido: 'sube' }, despues: 'una_vez', activa: true, armada: true, caduca: null, ultimo_salto: null, creada: '2026-11-01T15:00:00Z', ...o })
  const dia = (abre, maximo, minimo, ahora) => ({ abre, maximo, minimo, ahora })
  const ctx = (d, o = {}) => ({ fecha: '2026-11-20', dia: d, cerrada: false, cierreAyer: 100, ...o })
  const AHORA = '2026-11-20T17:00:00.000Z'

  // ── 1 · Validar ──
  ok(M.validaAlerta(alerta()).length === 0, '«Toca 100, al subir» es válida')
  ok(M.validaAlerta(alerta({ regla: { nivel: 0, sentido: 'sube' } })).length === 1 && M.validaAlerta(alerta({ regla: { nivel: 100 } })).length === 1, 'sin precio o sin sentido, un aviso cada uno')
  ok(M.validaAlerta(alerta({ simbolo: 'aapl' })).length === 1 && M.validaAlerta(alerta({ despues: 'siempre' })).length === 1 && M.validaAlerta(alerta({ caduca: '20/11' })).length === 1, 'símbolo en minúsculas, «después» raro y fecha mal escrita: no valen')
  ok(M.validaAlerta(alerta({ tipo: 'movimiento', regla: { pct: 5, sentido: 'ambos' } })).length === 0 && M.validaAlerta(alerta({ tipo: 'movimiento', regla: { pct: 100, sentido: 'baja' } })).length === 1, '«Se mueve un 5 %» vale; un 100 % no')
  ok(M.validaAlerta(alerta({ tipo: 'estrategia', regla: {} })).length === 1, '«Señal de una estrategia», todavía no')
  // La alerta de ALAB tal como la copió sql/alertas.sql (EMA 10 cruza por debajo de la EMA 11).
  const ALAB = alerta({ simbolo: 'ALAB', tipo: 'condicion', despues: 'cada_vez', regla: { filas: [{ quien: 'valor', velas: 'diarias', si: { c: 'cruza', de: { c: 'mediaVsMedia', p: { tipoRapida: 'EMA', periodoRapida: 10, tipoLenta: 'EMA', periodoLenta: 11, lado: 'debajo' } } } }] } })
  ok(igual(M.validaAlerta(ALAB), []), `la alerta de ALAB copiada de la tabla vieja es válida (${M.validaAlerta(ALAB).join(' | ') || 'sin avisos'})`)
  ok(M.filasDe(ALAB)[0].quien === 'ALAB' && ALAB.regla.filas[0].quien === 'valor', '«valor» se lee como el símbolo de la alerta (sin cambiar la alerta)')

  // ── 2 · Toca el precio ──
  ok(M.sentidoToca(231, 230) === 'sube' && M.sentidoToca(220, 230) === 'baja', 'la dirección se pone sola: 231 con el precio a 230 → al subir; 220 → al bajar')
  ok(igual(M.seCumple(alerta(), ctx(dia(98, 101, 97, 99))), { cumple: true, precio: 100 }), 'sube a 100: máximo 101 → salta a 100 (aunque ahora esté a 99)')
  ok(igual(M.seCumple(alerta(), ctx(dia(102, 103, 101, 102))), { cumple: true, precio: 102 }), 'abre a 102, por encima de 100 → salta a la apertura, 102')
  ok(M.seCumple(alerta(), ctx(dia(98, 99.5, 97, 99))).cumple === false, 'máximo 99,50 → no')
  ok(M.seCumple(alerta(), ctx(dia(98, 100, 97, 99))).cumple === true, 'máximo justo 100 → sí (tocar es llegar)')
  const baja = alerta({ regla: { nivel: 100, sentido: 'baja' } })
  ok(igual(M.seCumple(baja, ctx(dia(101, 102, 99, 101))), { cumple: true, precio: 100 }) && igual(M.seCumple(baja, ctx(dia(99, 100.5, 98, 99))), { cumple: true, precio: 99 }), 'baja a 100: mínimo 99 → a 100; abre a 99 → a 99')
  ok(M.seCumple(baja, ctx(dia(101, 102, 100.2, 101))).cumple === false, 'mínimo 100,20 → no')
  // Creada hoy (a las 11:00 de Nueva York): el máximo de 232 de antes no cuenta, solo el precio de ahora.
  const nueva = alerta({ regla: { nivel: 231, sentido: 'sube' }, creada: '2026-11-20T16:00:00Z' })
  ok(M.seCumple(nueva, ctx(dia(229, 232, 228, 230))).cumple === false, 'creada hoy con AAPL a 230: el máximo de 232 de antes no la hace saltar')
  ok(igual(M.seCumple(nueva, ctx(dia(229, 232, 228, 231.5))), { cumple: true, precio: 231.5 }), '… y salta si ahora está a 231,50 (a ese precio)')
  ok(M.seCumple(nueva, ctx(dia(229, 232, 228, 230), { fecha: '2026-11-23' })).cumple === true, 'al día siguiente ya cuenta el máximo del día')
  ok(M.seCumple(alerta({ creada: '2026-11-21T11:00:00Z' }), ctx(dia(98, 101, 97, 99))).cumple === false, 'creada el sábado 21 con la vela del viernes 20 (máximo 101, ahora 99): no salta por el viernes')
  ok(M.seCumple(alerta({ tipo: 'movimiento', regla: { pct: 5, sentido: 'baja' }, creada: '2026-11-20T16:00:00Z' }), ctx(dia(99, 100, 95, 96))).cumple === false, '«cae un 5 %» creada hoy con el mínimo en 95 y ahora a 96: no salta por el mínimo de antes')
  ok(M.diaNY('2026-11-20T23:30:00Z', 'Europe/Madrid') === '2026-11-21' && M.diaNY('2026-11-20T23:30:00Z') === '2026-11-20', 'cada bolsa con su hora: las 23:30 UTC del 20 ya son el 21 en Madrid, pero el 20 en Nueva York')
  ok(M.diaNY('2026-11-21T03:00:00Z') === '2026-11-20' && M.diaNY('2026-11-20T14:30:00Z') === '2026-11-20', 'el día en Nueva York: las 03:00 UTC del 21 son las 22:00 del 20 allí')
  ok(M.seCumple(alerta(), ctx(dia(null, null, null, null))).cumple === null, 'sin precio: no se sabe')

  // ── 3 · Cierra por encima / por debajo ──
  const cierra = alerta({ tipo: 'cierra', regla: { nivel: 250, lado: 'encima' } })
  ok(M.seCumple(cierra, ctx(dia(245, 252, 244, 251))).cumple === null, 'durante la sesión no se mira')
  ok(M.seCumple(cierra, ctx(dia(245, 252, 244, 248), { cerrada: true })).cumple === false, '«Cierra por encima de 250»: un máximo de 252 que cierra en 248 NO salta')
  ok(igual(M.seCumple(cierra, ctx(dia(245, 252, 244, 251), { cerrada: true })), { cumple: true, precio: 251 }), 'cierra en 251 → salta a 251')
  ok(M.seCumple(cierra, ctx(dia(245, 252, 244, 250), { cerrada: true })).cumple === false, 'cierra justo en 250 → no (tiene que pasar al otro lado)')
  ok(M.seCumple(alerta({ tipo: 'cierra', regla: { nivel: 250, lado: 'debajo' } }), ctx(dia(255, 256, 247, 249), { cerrada: true })).cumple === true, '«por debajo de 250», cierre 249 → sí')

  // ── 4 · Se mueve un % (desde el cierre de ayer, 100) ──
  const mov = (sentido) => alerta({ tipo: 'movimiento', regla: { pct: 5, sentido } })
  ok(igual(M.seCumple(mov('baja'), ctx(dia(99, 100, 95, 96))), { cumple: true, precio: 95, sentido: 'baja' }), 'cae un 5 %: ayer 100, mínimo 95 → salta a 95')
  ok(M.seCumple(mov('baja'), ctx(dia(99, 100, 95.01, 96))).cumple === false, 'mínimo 95,01 → no')
  ok(M.seCumple(mov('baja'), ctx(dia(94, 96, 93, 95))).precio === 94, 'abre a 94 (ya un 6 % abajo) → salta a la apertura, 94')
  ok(igual(M.seCumple(mov('sube'), ctx(dia(101, 105, 100, 104))), { cumple: true, precio: 105, sentido: 'sube' }), 'sube un 5 %: máximo 105 → a 105')
  ok(M.seCumple(mov('ambos'), ctx(dia(100, 106, 94, 104))).sentido === 'sube', 'en los dos sentidos y tocó los dos: cuenta el más cerca de ahora (104 está a 1 de 105 y a 9 de 95)')
  ok(M.seCumple(mov('baja'), ctx(dia(99, 100, 95, 96), { cierreAyer: null })).cumple === null, 'sin el cierre de ayer: no se sabe')

  // ── 5 · Condición del catálogo ──
  const fechas = ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-23']
  const velas = (cierres) => cierres.map((c, k) => ({ date: fechas[k], open: c, high: c, low: c, close: c, volume: 1000 }))
  const V = { X: velas([10, 10, 10, 9, 12, 13]), QQQ: velas([1, 2, 3, 4, 5, 6]), QQQb: velas([5, 4, 3, 2, 1, 1]) }
  const hasta = (f, mapa = {}) => (s) => (V[mapa[s] || s] || []).filter(v => v.date <= f)
  const cruce = { quien: 'valor', velas: 'diarias', si: { c: 'cruza', de: { c: 'precioVsMedia', p: { lado: 'encima', tipo: 'SMA', periodo: 3 } } } }
  const qqq = { quien: 'QQQ', velas: 'diarias', union: 'Y', si: { c: 'precioVsMedia', p: { lado: 'encima', tipo: 'SMA', periodo: 3 } } }
  const cond = (filas) => alerta({ tipo: 'condicion', regla: { filas } })
  ok(M.validaAlerta(cond([cruce, qqq])).length === 0 && M.validaAlerta(cond([cruce, { ...qqq, union: 'O' }])).length === 1, 'dos filas con «Y» valen; con «O», no (todas a la vez)')
  const cc = (f, o = {}) => ctx(dia(12, 12, 12, 12), { fecha: f, cerrada: true, velasDe: hasta(f, o.mapa), ...o })
  ok(M.seCumple(cond([cruce]), cc('2026-11-20')).cumple === true, 'vie 20/11: el cierre 12 cruza por encima de su SMA 3 (10,33) → sí')
  ok(M.seCumple(cond([cruce]), cc('2026-11-19')).cumple === false && M.seCumple(cond([cruce]), cc('2026-11-23')).cumple === false, 'jue 19 (9 bajo 9,67) y lun 23 (ya estaba encima) → no')
  ok(M.seCumple(cond([cruce]), { ...cc('2026-11-20'), cerrada: false }).cumple === null, 'durante la sesión no se mira')
  ok(M.seCumple(cond([cruce]), { ...cc('2026-11-20'), velasDe: hasta('2026-11-19') }).cumple === null, 'si aún no está la vela de hoy: no se sabe (no se mira con la de ayer)')
  ok(M.seCumple(cond([cruce, qqq]), cc('2026-11-20')).cumple === true, '… y QQQ encima de su SMA 3 (5 > 4) → sí')
  ok(M.seCumple(cond([cruce, qqq]), cc('2026-11-20', { mapa: { QQQ: 'QQQb' } })).cumple === false, 'con QQQ debajo (1 < 2) → no')

  // ── 6 · Después de saltar ──
  const si = { cumple: true, precio: 100 }, nosi = { cumple: false }, nose = { cumple: null, motivo: 'se mira al cierre' }
  const c20 = { fecha: '2026-11-20' }, c23 = { fecha: '2026-11-23' }
  ok(igual(M.decide(alerta(), si, c20, AHORA), { salta: true, cambios: { activa: false, ultimo_salto: AHORA }, precio: 100 }), 'una vez: salta y se apaga')
  ok(igual(M.decide(alerta(), nosi, c20, AHORA), { salta: false, cambios: {} }) && M.decide(alerta(), nose, c20, AHORA).cambios && !M.decide(alerta(), nose, c20, AHORA).salta, 'si no se cumple o no se sabe: nada cambia')
  ok(!M.decide(alerta({ activa: false }), si, c20, AHORA).salta, 'apagada: no salta')
  const dia1 = alerta({ despues: 'una_al_dia', ultimo_salto: '2026-11-20T15:00:00Z' })
  ok(!M.decide(dia1, si, c20, AHORA).salta, 'una vez al día: ya saltó hoy (a las 10:00 de Nueva York) → no')
  ok(igual(M.decide(dia1, si, c23, AHORA), { salta: true, cambios: { ultimo_salto: AHORA }, precio: 100 }), '… al día siguiente sí, y sigue encendida')
  ok(igual(M.decide(alerta({ caduca: '2026-11-20' }), si, c20, AHORA).salta, true), 'caduca el 20/11: ese día todavía vale')
  ok(igual(M.decide(alerta({ caduca: '2026-11-20' }), si, c23, AHORA), { salta: false, cambios: { activa: false }, motivo: 'caducada' }), '… el 23/11 se apaga sin saltar')
  // Cada vez: una semana con «Toca 100, al subir» (máximos del día).
  let a = alerta({ despues: 'cada_vez', creada: '2026-11-01T15:00:00Z' }), saltos = []
  const semana = [['2026-11-16', 101], ['2026-11-16', 101.5], ['2026-11-17', 102], ['2026-11-18', 99], ['2026-11-19', 100], ['2026-11-20', 98]]
  for (const [f, mx] of semana) {
    const p = M.pasada(a, ctx(dia(mx - 1, mx, mx - 2, mx - 0.5), { fecha: f }), f + 'T18:00:00Z')
    if (p.salta) saltos.push(f)
    a = { ...a, ...p.cambios }
  }
  ok(igual(saltos, ['2026-11-16', '2026-11-19']), `cada vez: salta el 16 (101), no al volver a mirar ni el 17 (sigue arriba), se rearma el 18 (99) y salta el 19 (100); el 20 se rearma (${saltos.join(', ')})`)
  ok(a.armada === true && a.activa === true, '… y queda armada y encendida')

  // ── 7 · El texto del aviso ──
  ok(M.fmt(1234.5) === '1.234,50' && M.fmt(0.12345) === '0,1235' && M.fmt(-3) === '−3,00' && M.fmt(null) === '—', 'números a la española: 1.234,50 · 0,1235 · −3,00')
  ok(igual(M.fraseSalto(alerta({ simbolo: 'CRDO', regla: { nivel: 111.12, sentido: 'baja' } }), { cumple: true, precio: 111.12 }, ctx(dia(113, 114, 110.4, 112.05))), { titulo: 'CRDO tocó 111,12', texto: 'Mínimo del día 110,40 · ahora 112,05' }), 'aviso: «CRDO tocó 111,12» · «Mínimo del día 110,40 · ahora 112,05»')
  ok(M.fraseSalto(mov('baja'), M.seCumple(mov('baja'), ctx(dia(99, 100, 95, 96))), ctx(dia(99, 100, 95, 96))).titulo === 'X cae un 5 % en el día', 'aviso del movimiento: «X cae un 5 % en el día»')

  // ── 8 · Lo que enseña la pantalla (lib/alertas/pantalla.js, §218) ──
  const Pa = require(R + '/lib/alertas/pantalla.js')
  const t235 = alerta({ simbolo: 'AAPL', regla: { nivel: 235, sentido: 'sube' } })
  ok(Pa.resumenAlerta(t235) === 'Toca 235,00' && Pa.resumenAlerta(alerta({ tipo: 'cierra', regla: { nivel: 205, lado: 'debajo' } })) === 'Cierra por debajo de 205,00' && Pa.resumenAlerta(mov('ambos')) === 'Se mueve un 5 % en el día', 'resúmenes: «Toca 235,00» · «Cierra por debajo de 205,00» · «Se mueve un 5 % en el día»')
  ok(Pa.asiSeLee(t235).startsWith('Avisa cuando AAPL suba hasta 235,00 (basta con que el máximo del día') && Pa.asiSeLee(t235).endsWith('Avisa una vez y se apaga.'), '«Así se lee» de «Toca 235»')
  ok(Pa.asiSeLee(mov('baja')).includes('caiga un 5 % o más desde el cierre de ayer (ej.: ayer cerró en 100,00 → salta a 95,00)'), '«Así se lee» del movimiento con su ejemplo (100 → 95)')
  ok(Pa.asiSeLee(alerta({ despues: 'cada_vez', caduca: '2026-12-31' })).endsWith('primero tiene que dejar de cumplirse). Caduca después del 31/12/2026.'), '«Así se lee» con «cada vez» y fecha de caducidad')
  ok(/^Avisa al cierre del día en que se cumpla: .*ALAB/.test(Pa.asiSeLee(ALAB)), `«Así se lee» de la condición de ALAB: ${Pa.asiSeLee(ALAB).slice(0, 120)}`)
  ok(cerca(Pa.distancia(t235, 228.4), (235 - 228.4) / 228.4 * 100) && Pa.textoDistancia(Pa.distancia(t235, 228.4)) === '+2,89 %' && Pa.distancia(mov('baja'), 100) === null, 'distancia: 235 con el precio a 228,40 → +2,89 %; el movimiento no tiene')
  const ls = Pa.lineasDeAlertas([t235, { ...alerta({ simbolo: 'AAPL', tipo: 'cierra', regla: { nivel: 205, lado: 'debajo' } }), id: 'b' }, { ...t235, id: 'c', activa: false }, { ...mov('baja'), simbolo: 'AAPL' }, { ...t235, id: 'd', simbolo: 'MSFT' }], 'aapl')
  ok(ls.length === 2 && ls[0].condition_detail === 'price_above' && ls[1].condition_detail === 'price_below' && ls[1].price_level === 205, 'líneas del gráfico: solo las de precio encendidas de ese valor (verde al subir, roja al bajar)')
  ok(igual(Pa.reglaArrastrada(t235, 220, 228.4), { nivel: 220, sentido: 'baja' }) && igual(Pa.reglaArrastrada(alerta({ tipo: 'cierra', regla: { nivel: 205, lado: 'debajo' } }), 210, 228.4), { nivel: 210, lado: 'debajo' }), 'arrastrar «Toca 235» por debajo del precio (220): pasa a avisar al bajar; «cierra» solo cambia el nivel')
  ok(igual(Pa.alertaNueva('aapl', 231.456, 228.4), { simbolo: 'AAPL', tipo: 'toca', regla: { nivel: 231.46, sentido: 'sube' }, despues: 'una_vez', activa: true, caduca: null, nota: null }) && Pa.alertaNueva('X', null, 50).regla.nivel === null && Pa.textoDistancia(-0.00001) === '0,00 %' && Pa.textoDistancia(-0.5) === '−0,50 %', 'alerta nueva: en el precio pulsado redondeado (231,46, al subir); con «+ Nueva», el precio vacío; distancias con 2 decimales')

  // ── 9 · Montaje (renderToString) del panel y la ventana ──
  const React = require(R + '/node_modules/react'), RDS = require(R + '/node_modules/react-dom/server')
  const PA = require(R + '/components/PanelAlertas.js')
  const estado = { alertas: [{ ...t235, id: 'a1' }, { ...alerta({ simbolo: 'AAPL', tipo: 'cierra', regla: { nivel: 205, lado: 'debajo' } }), id: 'a2', activa: false, ultimo_salto: '2026-11-03T15:47:00Z' }, { ...t235, id: 'a3', simbolo: 'MSFT' }],
    saltos: [{ id: 7, simbolo: 'AAPL', cuando: '2026-11-03T15:47:00Z', visto: false, detalle: { titulo: 'AAPL cerró por debajo de 205,00', texto: 'Cierre 204,10' } }], disponible: true, cambiar: async () => {}, borrar: async () => {}, vistos: async () => {} }
  const hp = RDS.renderToString(React.createElement(PA.PanelAlertas, { simbolo: 'AAPL', ahora: 228.4, estado, onNueva: () => {}, onEditar: () => {} })).split('<!-- -->').join('')
  ok(hp.includes('EN AAPL (1)') && hp.includes('Toca 235,00') && hp.includes('+2,89 % del precio') && hp.includes('EN OTROS VALORES (1)') && hp.includes('MSFT') && hp.includes('APAGADAS (1)'), '§220: TODAS las alertas: «En AAPL (1)» con +2,89 %, «En otros valores (1)» con MSFT y una apagada (plegada)')
  ok(hp.includes('SALTARON') && hp.includes('1 sin ver') && hp.includes('AAPL cerró por debajo de 205,00') && hp.includes('✓ Vista') && hp.includes('data-borrar-alerta') && !hp.includes('>Borrar<'), '«Saltaron» de todos los valores, con «✓ Vista»; la papelera borra sin preguntar')
  const he = RDS.renderToString(React.createElement(PA.PanelAlertas, { simbolo: 'AAPL', ahora: 228.4, estado, onNueva: () => {}, onEditar: () => {}, elegida: 'a1', estiloLineas: PA.ESTILO_LINEAS_DEFECTO, onEstiloLineas: () => {} })).split('<!-- -->').join('')
  ok(/data-alerta="a1" data-elegida="1"/.test(he) && he.includes('Líneas ▾') && he.includes('🎯') && !he.includes('▲') && PA.ESTILO_LINEAS_DEFECTO.color === '#ffd166' && PA.ESTILO_LINEAS_DEFECTO.trazo === 2, '§219: la alerta elegida en el gráfico sale resaltada; «Líneas ▾»; §222: 🎯 = alerta de precio; por defecto amarillas y discontinuas')
  const hv = RDS.renderToString(React.createElement(PA.VentanaAlerta, { inicial: Pa.alertaNueva('AAPL', 235, 228.4), ahora: 228.4, onGuardar: async () => {}, onCerrar: () => {} })).split('<!-- -->').join('')
  ok(hv.includes('Nueva alerta') && hv.includes('Crear alerta') && hv.includes('Avisa cuando AAPL suba hasta 235,00') && hv.includes('avisará al SUBIR'), 'la ventana nueva: «Así se lee» y «avisará al SUBIR hasta él»')
  const hv2 = RDS.renderToString(React.createElement(PA.VentanaAlerta, { inicial: { ...t235, id: 'a1' }, ahora: 228.4, onGuardar: async () => {}, onCerrar: () => {} })).split('<!-- -->').join('')
  ok(hv2.includes('Cambiar alerta') && hv2.includes('>Guardar<'), 'con una alerta guardada: «Cambiar alerta» y «Guardar»')

  // ── 10 · «Condición del catálogo» en la ventana (§221) ──
  const condAAPL = { simbolo: 'AAPL', tipo: 'condicion', despues: 'una_vez', activa: true, regla: { filas: [{ quien: 'AAPL', velas: 'diarias', si: { c: 'cruza', de: { c: 'precioVsMedia', p: { lado: 'encima', tipo: 'SMA', periodo: 200 } } } }] } }
  ok(M.validaAlerta(condAAPL).length === 0, 'una condición con el símbolo del valor (no «valor») es válida')
  const hc = RDS.renderToString(React.createElement(PA.VentanaAlerta, { inicial: condAAPL, ahora: 228.4, onGuardar: async () => {}, onCerrar: () => {} })).split('<!-- -->').join('')
  ok(hc.includes('Avisa al cierre del día en que se cumpla todo esto') && hc.includes('data-fila-alerta="0"') && hc.includes('velas diarias') && hc.includes('+ condición') && hc.includes('Avisa al cierre del día en que se cumpla:') && hc.includes('Crear alerta') && !hc.includes('disabled=""><option'), 'la ventana con una condición: su fila (con «velas diarias»), «+ condición» y «Así se lee»')
  const hv0 = RDS.renderToString(React.createElement(PA.VentanaAlerta, { inicial: { ...condAAPL, regla: { filas: [] } }, ahora: 228.4, onGuardar: async () => {}, onCerrar: () => {} })).split('<!-- -->').join('')
  ok(hv0.includes('Pon al menos una condición.') && !hv0.includes('de 1 a 6 condiciones'), 'sin condiciones: «Pon al menos una condición» (sin el aviso rojo de la validación)')
  const hA = RDS.renderToString(React.createElement(PA.VentanaAlerta, { inicial: { ...ALAB, id: 'x' }, ahora: 20, onGuardar: async () => {}, onCerrar: () => {} })).split('<!-- -->').join('')
  ok(hA.includes('Cambiar alerta') && hA.includes('data-fila-alerta="0"') && hA.includes('Avisa al cierre del día en que se cumpla: pasa a cumplirse que la media exponencial de 10 velas de ALAB está por debajo de la media exponencial de 11 velas.'), 'la de ALAB (copiada con «valor») se puede abrir y cambiar')

  console.log(fallos ? `\n${fallos} FALLOS` : '\nTODO BIEN')
  process.exit(fallos ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
