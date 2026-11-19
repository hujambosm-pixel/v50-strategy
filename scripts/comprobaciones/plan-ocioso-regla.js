// scripts/comprobaciones/plan-ocioso-regla.js — el DINERO OCIOSO CON SU PROPIA REGLA (docs/builder.md §203; boceto
// bocetos/ocioso-con-regla.html). Las corre comunes.sh. Termina en 0 si todo da lo esperado. Sin comisiones ni impuestos; cada vela abre y
// cierra al mismo precio.
//
// VELAS INVENTADAS (sesiones de lunes a viernes desde el 01/02/2021; el plan va del lunes 01/03/2021 al miércoles 10/03/2021, 8 sesiones):
//   A (el valor de la estrategia): siempre 10 → la estrategia (cruce del cierre sobre su EMA 2) no entra nunca: todo el dinero es ocioso.
//   G (el ocioso): 10 hasta el 23/02; 9 el 24/02, 9,5 el 25/02, 10 el 26/02; en marzo 11, 12, 9, 9, 11, 12, 13, 13.   H: siempre 5.
// REGLA: «G: cierre sobre su SMA (3), velas diarias» (está en G mientras se cumpla); si no, en liquidez (o en H).
//   Al cierre: 26/02 10 > 9,5 sí · 01/03 11 > 10,17 sí · 02/03 12 > 11 sí · 03/03 9 < 10,67 NO · 04/03 9 < 10 NO · 05/03 11 > 9,67 sí ·
//   08/03, 09/03, 10/03 sí.
// A MANO (10.000 €): el 01/03 manda lo del 26/02 (sí) → 10.000 / 11 = 909,0909 G. El 04/03 (lo del 03/03: no) se venden a la apertura a 9 →
//   8.181,82 € en liquidez. El 08/03 (lo del 05/03: sí) se compran a 12 → 681,8182 G. Final a 13: 10.000 × 9 × 13 / (11 × 12) = 8.863,64 €.
//   Estado de cada día (1 = en G): 1 1 1 0 0 1 1 1. Sin regla (siempre en G): 909,0909 × 13 = 11.818,18 €.
//   Con «si no se cumple, en H»: el 04/03 los 8.181,82 € van a H (1.636,36 H a 5) y el 08/03 vuelven a G: el mismo final, 8.863,64 €.
//   Igual con «Una lista» (la lista no entra nunca: el dinero va al ocioso al cierre del 01/03, también a 11) y con DOS BLOQUES de lista al
//   50 % (el ocioso es de la cuenta: lo compra a la apertura del 01/03 a 11).
process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://arnes.invalid'; process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'clave-falsa-del-arnes'
const C0 = require('./cargador'), R = C0.RAIZ
let fallos = 0
const ok = (c, t) => { console.log(`${c ? 'OK  ' : 'MAL '} ${t}`); if (!c) fallos++ }
const cerca = (a, b, tol = 1e-9) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tol * Math.max(1, Math.abs(b))
const EMA = { tipo: 'editor', motor: 1, formato: 1, nombre: 'EMA2', stops: [{ id: 'inicial', pct: 8, tipo: 'porcentaje', motivo: 'stop' }],
  entrada: { orden: { tipo: 'apertura' }, senal: { c: 'cruza', de: { c: 'precioVsMedia', p: { lado: 'encima', tipo: 'EMA', periodo: '$ema' } } } },
  salidas: [{ si: { c: 'cruza', de: { c: 'precioVsMedia', p: { lado: 'debajo', tipo: 'EMA', periodo: '$ema' } } }, tipo: 'condicion', motivo: 'cruce_bajista', precio: 'apertura' }],
  parametros: { lista: [{ max: 400, min: 2, paso: 1, tipo: 'entero', nombre: 'ema', defecto: 20, ventana: true, descripcion: 'Periodo de la EMA' }], version: 1, restricciones: [] } }
const FOTO = { id: 'x', name: 'Cruce de medias 50/200', definition: EMA, params: { ema: 2 } }

;(async () => {
  await C0.prepara(); C0.registra(R)
  const P = require(R + '/lib/planes/plan.js'), Li = require(R + '/lib/planes/lista.js'), O = require(R + '/lib/planes/ociosoRegla.js'), Ev = require(R + '/lib/planes/evalua.js'), Es = require(R + '/lib/planes/estrategia.js')
  const habiles = (desde, hasta) => { const out = []; for (let d = new Date(desde + 'T00:00:00Z'); d.toISOString().slice(0, 10) <= hasta; d = new Date(d.getTime() + 864e5)) { const w = d.getUTCDay(); if (w >= 1 && w <= 5) out.push(d.toISOString().slice(0, 10)) } return out }
  const TODAS = habiles('2021-02-01', '2021-03-10'), F = TODAS.filter(f => f >= '2021-03-01')
  const MARZO = [11, 12, 9, 9, 11, 12, 13, 13]
  const precioG = (f) => f >= '2021-03-01' ? MARZO[F.indexOf(f)] : f === '2021-02-24' ? 9 : f === '2021-02-25' ? 9.5 : 10
  const vela = (date, px) => ({ date, open: px, high: px, low: px, close: px, volume: 1000 })
  const serie = (fn) => TODAS.map(f => vela(f, fn(f)))
  const velas = { A: serie(() => 10), G: serie(precioG), H: serie(() => 5) }
  const plano = TODAS.map(date => ({ date, open: 100, close: 100 }))
  // Las fechas del plan con la historia de febrero delante (como en la app: el día i manda lo que dijo la regla al cierre de la víspera).
  const D = { fechas: TODAS, qqq: plano, spy: plano, etf: TODAS.map(() => null), qqqVelas: plano, velas }
  const LST = { opciones: { modo: 'concentrado', n: 1, maxPosiciones: 1, prioridad: 'alfabetico' }, activos: [{ symbol: 'A', fechas: TODAS, abre: TODAS.map(() => 10), cierra: TODAS.map(() => 10), candidatos: [] }] }
  const fila = { quien: 'G', si: { c: 'precioVsMedia', p: { lado: 'encima', tipo: 'SMA', periodo: 3 } }, velas: 'diarias' }
  const regla = (siNo = 'LIQUIDEZ', filas = [fila]) => ({ filas, siNo })
  const pieza = (o = {}) => ({ id: 'x', tipo: 'estrategia', estrategia: FOTO, activo: 'A', peso: 1, ocioso: 'G', aportacionDentro: 'espera', apalancamiento: 1, velas: 'diarias', ...o })
  const piezaLista = (o = {}) => pieza({ donde: 'lista', lista: Li.mergeLista({ simbolos: ['A'], modo: 'concentrado', maxPosiciones: 1 }), ...o })
  const plan = (piezas, reparto = {}) => ({ tipo: 'plan', formato: 1, calculo: 1, dinero: { capitalInicial: 10000, aportaciones: { frecuencia: 'ninguna' }, extraordinarias: [] },
    piezas, reparto: { aportacionesA: 'pesos', rebalanceo: { calendario: 'nunca', banda: null }, ...reparto }, impuestos: { regimen: 'ninguno', reglaDosMeses: true }, costes: null,
    periodo: { desde: F[0], hasta: F[F.length - 1] } })
  const corre = (p, datos = D, op = {}) => { const e = P.validaPlan(p); if (e.length) throw new Error(e.join(' | ')); return P.ejecutaPlan(p, datos, op) }
  const FINAL = 10000 * 9 * 13 / (11 * 12), SIEMPRE = 10000 / 11 * 13

  ok(TODAS[TODAS.length - 1] === '2021-03-10' && F.length === 8 && F[3] === '2021-03-04' && F[5] === '2021-03-08' && precioG('2021-03-03') === 9, 'las velas del ejemplo (8 sesiones en marzo)')
  ok(Es.simbolosDe(pieza({ ociosoRegla: regla('H', [fila, { ...fila, quien: 'QQQ', union: 'Y' }]) })).join() === 'A,G,H,QQQ', 'simbolosDe: también el de «si no se cumple» y los que miran sus condiciones (para cargar sus velas)')

  // ── 1 · Con un valor ──
  {
    const sin = corre(plan([pieza()]))
    ok(cerca(sin.valorNeto, SIEMPRE) && !('ociosoRegla' in sin), `sin regla, el ocioso de siempre: 11.818,18 € (${sin.valorNeto}) y la salida no lleva «ociosoRegla»`)
    const r = corre(plan([pieza({ ociosoRegla: regla() })]), D, { libro: true })
    ok(cerca(r.valorNeto, FINAL), `con la regla, 8.863,64 € (${r.valorNeto})`)
    ok(r.ociosoRegla?.estados?.join('') === '11100111' && r.ociosoRegla.dentro === 'G' && r.ociosoRegla.fuera === 'LIQUIDEZ', `estado de cada día 1 1 1 0 0 1 1 1 (${r.ociosoRegla?.estados?.join(' ')})`)
    const mv = r.libro.movimientos.filter(m => m.tipo === 'compra' || m.tipo === 'venta' || m.tipo === 'ventaFinal').map(m => `${m.fecha.slice(8)}/${m.fecha.slice(5, 7)} ${m.tipo} ${m.simbolo} a ${m.precio}`)
    ok(mv.join(' | ') === '01/03 compra G a 11 | 04/03 venta G a 9 | 08/03 compra G a 12 | 10/03 ventaFinal G a 13', `las órdenes: ${mv.join(' | ')}`)
    ok(cerca(r.libro.movimientos.find(m => m.tipo === 'venta').importe, 10000 / 11 * 9), 'la venta del 04/03: 8.181,82 €')
    const rH = corre(plan([pieza({ ociosoRegla: regla('H') })]), D, { libro: true })
    const mvH = rH.libro.movimientos.filter(m => m.tipo === 'compra' || m.tipo === 'venta' || m.tipo === 'ventaFinal').map(m => `${m.fecha.slice(8)} ${m.tipo} ${m.simbolo}`)
    ok(cerca(rH.valorNeto, FINAL) && mvH.join(',') === '01 compra G,04 venta G,04 compra H,08 venta H,08 compra G,10 ventaFinal G', `con «si no se cumple, en H»: el mismo final y G → H → G (${mvH.join(', ')})`)
    ok(rH.libro.porSimbolo.H?.rol === 'ocioso' && rH.libro.porSimbolo.G?.rol === 'ocioso', 'en el libro, G y H son los dos «ocioso» (no «otro»)')
    const ev = Ev.referenciasDe(plan([pieza({ ociosoRegla: regla() })])).find(x => x.id === 'OCIOSO_LIQUIDEZ')
    ok(ev && !('ociosoRegla' in ev.plan.piezas[0]) && ev.plan.piezas[0].ocioso === 'LIQUIDEZ' && P.validaPlan(ev.plan).length === 0, '«el mismo plan con el ocioso en liquidez» quita la regla (y es un plan válido)')
  }

  // ── 2 · Con una lista ──
  {
    const DL = { ...D, lista: LST }
    const sin = corre(plan([piezaLista()]), DL)
    ok(cerca(sin.valorNeto, SIEMPRE), `con lista, sin regla: 11.818,18 € (${sin.valorNeto})`)
    const r = corre(plan([piezaLista({ ociosoRegla: regla() })]), DL)
    ok(cerca(r.valorNeto, FINAL) && r.ociosoRegla.estados.join('') === '11100111', `con lista y la regla: 8.863,64 € (${r.valorNeto}), estados ${r.ociosoRegla.estados.join('')}`)
    ok(P.motivoListaNoCalculable(plan([piezaLista({ ociosoRegla: regla('A') })]), ['A']) === P.AVISO_LISTA_OCIOSO_EN_LISTA, 'con lista, «si no se cumple» no puede ser un valor de la lista')
  }

  // ── 3 · Con dos bloques (el ocioso es de la cuenta) ──
  {
    const DB = { ...D, listas: { x: LST, y: { ...LST, activos: [{ ...LST.activos[0], symbol: 'A2' }] } }, velas: { ...velas, A2: velas.A } }
    const b = (id, o = {}) => piezaLista({ id, peso: 0.5, ...(id === 'y' ? { activo: 'A2', lista: Li.mergeLista({ simbolos: ['A2'], modo: 'concentrado', maxPosiciones: 1 }) } : {}), ...o })
    const sin = corre(plan([b('x'), b('y')], { dineroLibre: 'tope' }), DB)
    ok(cerca(sin.valorNeto, SIEMPRE), `dos bloques, sin regla: 11.818,18 € (${sin.valorNeto})`)
    const r = corre(plan([b('x', { ociosoRegla: regla() }), b('y', { ociosoRegla: regla() })], { dineroLibre: 'tope' }), DB)
    ok(cerca(r.valorNeto, FINAL) && r.ociosoRegla.estados.join('') === '11100111', `dos bloques con la regla de la cuenta: 8.863,64 € (${r.valorNeto}), estados ${r.ociosoRegla.estados.join('')}`)
    ok(P.validaPlan(plan([b('x', { ociosoRegla: regla() }), b('y')])).some(e => /la regla del dinero ocioso es de la cuenta/.test(e)), 'con dos bloques, la regla tiene que ser la misma en todos')
  }

  // ── 4 · Lo que no vale ──
  {
    const err = (o) => P.validaPlan(plan([pieza(o)])).join(' ')
    ok(/no hace falta regla/.test(err({ ocioso: 'LIQUIDEZ', ociosoRegla: regla('H') })), 'con el ocioso en liquidez no hay regla')
    ok(/distinto de donde espera/.test(err({ ociosoRegla: regla('G') })), '«si no se cumple» distinto del ocioso')
    ok(/no puede ser el valor de la estrategia/.test(err({ ociosoRegla: regla('A') })), '«si no se cumple» no puede ser el valor de la estrategia')
    ok(/todas sus condiciones van con «Y»/.test(err({ ociosoRegla: regla('LIQUIDEZ', [fila, { ...fila, union: 'O' }]) })), 'solo «Y» (todas las condiciones a la vez)')
    ok(/de 1 a/.test(err({ ociosoRegla: regla('LIQUIDEZ', []) })), 'sin condiciones, no vale')
    let msg = ''
    try { corre(plan([pieza({ ociosoRegla: regla('LIQUIDEZ', [{ ...fila, quien: 'QQQ' }]) })])) } catch (e) { msg = e.message }
    ok(/Faltan las velas de QQQ \(lo mira la regla del dinero ocioso\)/.test(msg), `sin las velas de lo que mira la regla, lo dice («${msg}»)`)
    ok(O.sinReglaOcioso(pieza({ ociosoRegla: regla() })).ociosoRegla === undefined && O.sinReglaOcioso(pieza()).ocioso === 'G', 'sinReglaOcioso quita solo la regla')
  }

  console.log(fallos ? `plan-ocioso-regla: ${fallos} FALLOS` : 'plan-ocioso-regla: todo bien')
  process.exit(fallos ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
