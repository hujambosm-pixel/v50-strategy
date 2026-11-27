// scripts/comprobaciones/plan-pesos-reglas.js — las REGLAS «si… entonces…» del bloque «Con pesos» (docs/builder.md §194). Las corre
// comunes.sh. Termina en 0 si todo da lo esperado. Sin comisiones ni impuestos; cada vela abre y cierra al mismo precio.
//
// VELAS INVENTADAS (sesiones de lunes a viernes desde el 01/02/2021; el plan empieza el 01/03/2021 y acaba el 07/05/2021):
//   S: siempre 100.   T: 100 hasta el 04/03; 70 el 04/03; 55 el 05/03 y el 08/03; 60 del 09/03 al 15/04 salvo: 101 del 15/04 al 21/04;
//   60 desde el 22/04.
// ESCENARIO 1 · «80/20 que compra en caídas»: 10.000 € en 80 % S + 20 % T (80 S y 20 T). Regla: SI T cae ≥ 40 % desde su máximo histórico
//   (diarias) → pasar a 60/40, MANTENER 1 mes, DESPUÉS volver a los de partida, REPETIR una vez por caída.
//   · Cierre del 05/03: T a 55 ≤ 100 × 0,6 → se cumple. Apertura del 08/03 (T a 55): S 8.000 + T 1.100 = 9.100 → 60/40 = 5.460 / 3.640:
//     vende 2.540 € de S (25,4) y compra 46,1818 T → 54,6 S y 66,1818 T.
//   · Mantener hasta el 08/04 (un mes): al cierre del 08/04 acaba → apertura del 09/04 (T a 60): 5.460 + 3.970,91 = 9.430,91 → 80/20 =
//     7.544,73 / 1.886,18: vende 2.084,73 € de T y compra 20,8473 S → 75,4473 S y 31,4364 T.
//   · Del 09/04 al 14/04 T sigue un 40 % por debajo de 100, pero la regla NO se repite (una vez por caída). El 15/04 T cierra a 101 > 100:
//     se rearma. El 22/04 T cierra a 60 ≤ 101 × 0,6 = 60,6 → se cumple; apertura del 23/04: 7.544,73 + 1.886,18 → 60/40 = 5.658,55 /
//     3.772,36. Mantener hasta el 23/05 (después del final). Final (07/05): 5.658,55 + 62,8727 × 60 = 9.430,91 €.
//   · Sin reglas (80/20, nunca): 8.000 + 20 × 60 = 9.200 €.
//   · «Cada vez que se cumpla»: tras volver el 09/04, al cierre del 09/04 se cumple otra vez → actúa el 12/04.
//   · «Solo una vez»: una sola vez (y la vuelta).
//   · «Volver cuando T cierre por encima de su SMA (3)» en vez de «volver a los de partida»: tras mantener (08/04), espera; el 15/04
//     (101 > 73,67) se cumple → vuelve el 16/04.
// ESCENARIO 2 · 60 % S + 40 % T, regla «T cae ≥ 40 %» con otras acciones (MANTENER 0, DESPUÉS quedarse, una vez por caída):
//   · Mover el 20 % de TODO el bloque de S a T: 08/03, S 6.000 + T 2.200 = 8.200 → 1.640 € de S → 43,6 S y 69,8182 T. Final: 4.360 +
//     69,8182 × 60 = 8.549,09 €.
//   · Mover el 50 % de lo que hay en S a T: 3.000 € → 30 S y 94,5455 T → 3.000 + 5.672,73 = 8.672,73 €.
//   · Vender todo T (a la liquidez del bloque): 2.200 € → final 6.000 + 2.200 = 8.200 €.
//   · Con «quedarse», «volver a los pesos cada año» ya no vuelve a 60/40 sino a los pesos que dejó la regla.
// ESCENARIO 3 · VELAS SEMANALES. T2: 100 hasta el martes 02/03; 55 desde el miércoles 03/03. Con la fila en DIARIAS se cumple al cierre
//   del 03/03 y actúa el jueves 04/03; en SEMANALES, la semana del 01/03 cierra el viernes 05/03 → actúa el lunes 08/03.
// ESCENARIO 4 · «Y» antes que «O»: U cae un 50 % (cumple) y V no se mueve (no cumple): U Y V → no; U Y V O U → sí; V O U → sí.
process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://arnes.invalid'; process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'clave-falsa-del-arnes'
const C0 = require('./cargador'), R = C0.RAIZ
let fallos = 0
const ok = (c, t) => { console.log(`${c ? 'OK  ' : 'MAL '} ${t}`); if (!c) fallos++ }
const cerca = (a, b, tol = 1e-6) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tol * Math.max(1, Math.abs(b))
const txt = (x) => JSON.stringify(x)

;(async () => {
  await C0.prepara(); C0.registra(R)
  const P = require(R + '/lib/planes/plan.js'), W = require(R + '/lib/planes/pesos.js')
  const habiles = (desde, hasta) => { const out = []; for (let d = new Date(desde + 'T00:00:00Z'); d.toISOString().slice(0, 10) <= hasta; d = new Date(d.getTime() + 864e5)) { const w = d.getUTCDay(); if (w >= 1 && w <= 5) out.push(d.toISOString().slice(0, 10)) } return out }
  const TODAS = habiles('2021-02-01', '2021-05-07'), F = TODAS.filter(f => f >= '2021-03-01')
  const vela = (date, px) => ({ date, open: px, high: px, low: px, close: px, volume: 1000 })
  const precioT = (f) => f < '2021-03-04' ? 100 : f === '2021-03-04' ? 70 : f <= '2021-03-08' ? 55 : (f >= '2021-04-15' && f <= '2021-04-21') ? 101 : 60
  const precioT2 = (f) => f < '2021-03-03' ? 100 : 55
  const serie = (fn) => TODAS.map(f => vela(f, fn(f)))
  const velas = { S: serie(() => 100), T: serie(precioT), T2: serie(precioT2), U: serie(f => f < '2021-03-03' ? 100 : 50), V: serie(() => 100) }
  const plano = F.map(date => ({ date, open: 100, close: 100 }))
  const D = { fechas: F, qqq: plano, spy: plano, etf: F.map(() => null), qqqVelas: plano, velas }
  const plan = (bloque) => ({ tipo: 'plan', formato: 1, calculo: 1, dinero: { capitalInicial: 10000, aportaciones: { frecuencia: 'ninguna' }, extraordinarias: [] },
    piezas: [bloque], reparto: { aportacionesA: 'pesos', rebalanceo: { calendario: 'nunca', banda: null } }, impuestos: { regimen: 'ninguno', reglaDosMeses: true }, costes: null,
    periodo: { desde: F[0], hasta: F[F.length - 1] } })
  const pesos = (ps) => ps.map(([simbolo, peso]) => ({ simbolo, peso }))
  const bloque = (ps, reglas, volver = { cada: 'nunca' }) => ({ id: 'p', tipo: 'pesos', peso: 1, pesos: pesos(ps), volver, aportaciones: 'ahora', reglas })
  const caida = (quien, pct = 40, velasF = 'diarias') => ({ quien, si: { c: 'caidaDesdeMaximoHistorico', p: { pct } }, velas: velasF })
  const regla = (o) => ({ filas: [caida('T')], accion: { tipo: 'pesos', pesos: pesos([['S', 0.6], ['T', 0.4]]) }, mantenerMeses: 1, despues: { tipo: 'partida' }, repetir: 'porCaida', ...o })
  const corre = (b) => { const p = plan(b), e = P.validaPlan(p); if (e.length) throw new Error(e.join(' | ')); return P.ejecutaPlan(p, D) }
  const acto = (r) => r.pesos.p.historial.map(h => `${h.cumple}→${h.actua} ${h.que}`)

  ok(F[0] === '2021-03-01' && F[F.length - 1] === '2021-05-07' && precioT('2021-03-05') === 55 && precioT('2021-04-15') === 101 && precioT('2021-04-22') === 60, 'las velas del ejemplo')

  // ── 1 · «80/20 que compra en caídas» ──
  {
    const r = corre(bloque([['S', 0.8], ['T', 0.2]], [regla({})]))
    ok(txt(acto(r)) === txt(['2021-03-05→2021-03-08 pesos', '2021-04-08→2021-04-09 partida', '2021-04-22→2021-04-23 pesos']), `actúa el 08/03, vuelve el 09/04, no repite hasta el máximo nuevo y vuelve a actuar el 23/04 (${txt(acto(r))})`)
    const h = r.pesos.p.historial
    ok(cerca(h[0].movido, 2540) && cerca(h[0].pesos.S, 0.6) && cerca(h[1].movido, 2084.727272727) && cerca(h[1].pesos.S, 0.8), `08/03 mueve 2.540 € (a 60/40); 09/04 mueve 2.084,73 € (a 80/20) (${h[0].movido.toFixed(2)} / ${h[1].movido.toFixed(2)})`)
    ok(cerca(r.valorNeto, 9430.909090909), `final 9.430,91 € (${r.valorNeto.toFixed(4)})`)
    const sin = corre(bloque([['S', 0.8], ['T', 0.2]], []))
    ok(cerca(sin.valorNeto, 9200) && !sin.pesos, `sin reglas, 9.200 € (y sin nada nuevo en la respuesta) (${sin.valorNeto.toFixed(2)})`)
    const est = r.pesos.p.estados, idx = (f) => F.indexOf(f)
    ok(est.length === F.length && est[idx('2021-03-05')] === 0 && est[idx('2021-03-08')] === 1 && est[idx('2021-04-08')] === 1 && est[idx('2021-04-09')] === 0 && est[idx('2021-04-23')] === 1, 'por día, qué regla está en curso (para la franja del «Detalle»)')
    const siempre = corre(bloque([['S', 0.8], ['T', 0.2]], [regla({ repetir: 'siempre' })]))
    ok(acto(siempre)[2] === '2021-04-09→2021-04-12 pesos', `«cada vez que se cumpla»: vuelve a actuar el 12/04 (${txt(acto(siempre))})`)
    const unaVez = corre(bloque([['S', 0.8], ['T', 0.2]], [regla({ repetir: 'unaVez' })]))
    ok(acto(unaVez).length === 2, `«solo una vez»: actúa y vuelve, nada más (${txt(acto(unaVez))})`)
    const cuando = corre(bloque([['S', 0.8], ['T', 0.2]], [regla({ despues: { tipo: 'cuando', filas: [{ quien: 'T', si: { c: 'precioVsMedia', p: { tipo: 'SMA', periodo: 3, lado: 'encima' } }, velas: 'diarias' }] } })]))
    ok(acto(cuando)[1] === '2021-04-15→2021-04-16 partida', `«volver cuando T cierre sobre su SMA (3)»: vuelve el 16/04 (${txt(acto(cuando))})`)
  }

  // ── 2 · Otras acciones (mantener 0, quedarse) ──
  {
    const r2 = (accion) => corre(bloque([['S', 0.6], ['T', 0.4]], [regla({ accion, mantenerMeses: 0, despues: { tipo: 'quedarse' } })]))
    const a = r2({ tipo: 'moverBloque', pct: 20, de: 'S', a: 'T' }), b = r2({ tipo: 'moverActivo', pct: 50, de: 'S', a: 'T' }), c = r2({ tipo: 'vender', de: 'T' })
    ok(cerca(a.valorNeto, 4360 + (40 + 1640 / 55) * 60) && cerca(a.pesos.p.historial[0].movido, 1640), `mover el 20 % del bloque de S a T: 1.640 €, final 8.549,09 € (${a.valorNeto.toFixed(2)})`)
    ok(cerca(b.valorNeto, 3000 + (40 + 3000 / 55) * 60), `mover el 50 % de lo que hay en S: final 8.672,73 € (${b.valorNeto.toFixed(2)})`)
    ok(cerca(c.valorNeto, 8200) && c.pesos.p.historial.length === 1, `vender todo T: final 8.200 €; el 22/04 se vuelve a cumplir (T marcó 101) pero no hay T que vender: §279, no actúa ni se apunta (${c.valorNeto.toFixed(2)}, ${c.pesos.p.historial.length} apunte)`)
    ok(a.pesos.p.estados[F.indexOf('2021-03-08')] === 0, 'con mantener 0 y «quedarse», la regla no queda en curso')
    // «Quedarse» y «volver cada año»: el plan cruza un año solo en otra prueba; aquí, «cada mes» (el 01/04 y el 03/05) vuelve a los pesos QUE DEJÓ la regla.
    const m = P.ejecutaPlan(plan(bloque([['S', 0.6], ['T', 0.4]], [regla({ accion: { tipo: 'moverBloque', pct: 20, de: 'S', a: 'T' }, mantenerMeses: 0, despues: { tipo: 'quedarse' } })], { cada: 'mes' })), D, { libro: true })
    const pesoS = 4360 / 8200, tAbr = 4360 + 69.8181818 * 60
    const cS = m.libro.movimientos.find(x => x.tipo === 'compra' && x.simbolo === 'S' && x.fecha === '2021-04-01')
    ok(cS && cerca(cS.importe, pesoS * tAbr - 4360, 1e-5) && cerca(m.valorNeto, tAbr, 1e-5), `con «quedarse», «cada mes» (01/04) vuelve a los pesos nuevos (${(pesoS * 100).toFixed(2)} % S): compra ${cS ? cS.importe.toFixed(2) : '—'} € de S (a 60/40 serían ${(0.6 * tAbr - 4360).toFixed(2)})`)
  }

  // ── 3 · Velas semanales ──
  {
    const fila = (velasF) => [{ quien: 'T2', si: { c: 'caidaDesdeMaximoHistorico', p: { pct: 40 } }, velas: velasF }]
    const dia = corre(bloque([['S', 0.8], ['T', 0.2]], [regla({ filas: fila('diarias') })])), sem = corre(bloque([['S', 0.8], ['T', 0.2]], [regla({ filas: fila('semanales') })]))
    ok(acto(dia)[0] === '2021-03-03→2021-03-04 pesos', `en diarias: se cumple el miércoles 03/03 y actúa el jueves 04/03 (${acto(dia)[0]})`)
    ok(acto(sem)[0] === '2021-03-05→2021-03-08 pesos', `en semanales: se conoce al cierre del viernes 05/03 y actúa el lunes 08/03 (${acto(sem)[0]})`)
  }

  // ── 4 · «Y» antes que «O» ──
  {
    const vd = (s) => velas[s], f = (q, union) => ({ ...caida(q, 40), ...(union ? { union } : {}) }), dia = F.indexOf('2021-03-10')
    ok(W.serieFilas([f('U'), f('V', 'Y')], vd, F)[dia] === false, 'U Y V → no')
    ok(W.serieFilas([f('U'), f('V', 'Y'), f('U', 'O')], vd, F)[dia] === true, 'U Y V O U → sí ((U y V) o U)')
    ok(W.serieFilas([f('V'), f('U', 'O')], vd, F)[dia] === true && W.serieFilas([f('V'), f('U', 'O')], vd, F)[0] === false, 'V O U → sí (y antes de la caída, no)')
  }

  // ── 5 · Validación y datos ──
  {
    const v = (reglas) => W.validaPiezaPesos(bloque([['S', 0.8], ['T', 0.2]], reglas))
    ok(v([regla({})]).length === 0, 'una regla válida')
    ok(v([regla({ accion: { tipo: 'pesos', pesos: pesos([['S', 0.6], ['T', 0.3]]) } })]).some(x => x.includes('suman 90 %')), 'los pesos nuevos tienen que sumar 100 %')
    ok(v([regla({ accion: { tipo: 'moverBloque', pct: 20, de: 'S', a: 'S' } })]).some(x => x.includes('a dónde va')), 'mover: de y a distintos')
    ok(v([regla({ mantenerMeses: 200 })]).some(x => x.includes('MANTENER')) && v([regla({ repetir: 'x' })]).some(x => x.includes('REPETIR')), 'mantener y repetir')
    ok(v([regla({ filas: [{ quien: 'T', si: { c: 'noExiste' } }] })]).some(x => x.includes('no es una condición del catálogo')), 'condiciones del catálogo')
    ok(v([regla({ filas: [caida('T'), { ...caida('S') }] })]).some(x => x.includes('«Y» u «O»')), 'de la 2.ª fila en adelante, «Y» u «O»')
    ok(v(Array.from({ length: 6 }, () => regla({}))).some(x => x.includes('como mucho 5')), 'como mucho 5 reglas')
    let msg = ''; try { corre(bloque([['S', 0.8], ['T', 0.2]], [regla({ filas: [caida('ZZZ')] })])) } catch (e) { msg = e.message }
    ok(/Faltan las velas de ZZZ/.test(msg), `sin las velas de lo que mira una regla, lo dice (${msg})`)
    ok(txt(W.simbolosFilas(bloque([['S', 1]], [regla({ despues: { tipo: 'cuando', filas: [caida('U')] } })]))) === txt(['T', 'U']) && txt(W.simbolosAcciones(bloque([['S', 1]], [regla({ accion: { tipo: 'moverBloque', pct: 10, de: 'S', a: 'GLD' } })]))) === txt(['S', 'GLD']), 'los símbolos que miran y que compran las reglas')
  }

  console.log(`plan-pesos-reglas: ${fallos ? `${fallos} fallos` : 'todo bien'}`)
  process.exit(fallos ? 1 : 0)
})().catch(e => { console.error(e); process.exit(2) })
