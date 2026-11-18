// scripts/comprobaciones/plan-pesos-bloques.js — el bloque «Con pesos» JUNTO A OTROS BLOQUES en la cuenta común (docs/builder.md §196).
// Las corre comunes.sh. Termina en 0 si todo da lo esperado. Sin comisiones ni impuestos salvo que se diga; cada vela abre y cierra igual.
//
// A MANO (5 sesiones desde el lunes 06/01/2020; 10.000 €; ocioso en liquidez):
//   Bloque X 50 %: lista [A] (concentrado máx. 1), compra A a 10 el día 0 y la vende a 12 el día 2 (a la apertura).
//   Bloque P 50 %: «Con pesos» 100 % B.
//   1 · B siempre a 20. Día 0: entran 10.000 € (dinero nuevo). X compra 500 A (5.000 €); P coge su 50 %: 5.000 € → 250 B.
//       Día 2: X vende 500 A a 12 = 6.000 € (dinero nuevo). Patrimonio 6.000 + 5.000 = 11.000 → a P le caben 5.500 − 5.000 = 500 € → 25 B.
//       Los otros 5.500 € se quedan en la cuenta para las señales. Final: 5.500 + 275 × 20 = 11.000 €.
//   2 · B a 25 desde el día 2: P vale 6.250 de 12.250 (más de su 50 %) → no coge nada. Final 6.000 + 250 × 25 = 12.250 €.
//   3 · Sin señales de X y 1.000 €/mes (29/01 → 04/02/2020): día 0, P coge 5.000 € (250 B) y el resto espera en la cuenta. El 03/02 entran
//       1.000 € (nuevos): patrimonio 11.000 → a P le caben 500 € → 25 B. El dinero que ya esperaba no lo coge. Final 11.000 €.
//   4 · Dos bloques «Con pesos» (100 % A y 100 % B) al 50 % = UN bloque 50 % A + 50 % B con los pesos de partida (sin aportaciones), al
//       céntimo, con 0,1 % por orden e impuestos.
//   5 · Una regla del bloque P (B cae ≥ 40 % desde su máximo → vender B): B cae a 10 el día 3 → el día 4 vende 275 B a 10 = 2.750 € que se
//       quedan EN EL BLOQUE (su liquidez), no en la cuenta: al cierre del día 4, P vale 2.750 € y la cuenta 5.500 €.
process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://arnes.invalid'; process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'clave-falsa-del-arnes'
const C0 = require('./cargador'), R = C0.RAIZ
let fallos = 0
const ok = (c, t) => { console.log(`${c ? 'OK  ' : 'MAL '} ${t}`); if (!c) fallos++ }
const cerca = (a, b, tol = 1e-9) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tol * Math.max(1, Math.abs(b))
const dia = (f, n) => { const out = []; for (let d = new Date(f + 'T00:00:00Z'); out.length <= n; d = new Date(d.getTime() + 864e5)) { const w = d.getUTCDay(); if (w >= 1 && w <= 5) out.push(d.toISOString().slice(0, 10)) } return out[n] }
const EMA = { tipo: 'editor', motor: 1, formato: 1, nombre: 'EMA2', stops: [{ id: 'inicial', pct: 8, tipo: 'porcentaje', motivo: 'stop' }],
  entrada: { orden: { tipo: 'apertura' }, senal: { c: 'cruza', de: { c: 'precioVsMedia', p: { lado: 'encima', tipo: 'EMA', periodo: '$ema' } } } },
  salidas: [{ si: { c: 'cruza', de: { c: 'precioVsMedia', p: { lado: 'debajo', tipo: 'EMA', periodo: '$ema' } } }, tipo: 'condicion', motivo: 'cruce_bajista', precio: 'apertura' }],
  parametros: { lista: [{ max: 400, min: 2, paso: 1, tipo: 'entero', nombre: 'ema', defecto: 20, ventana: true, descripcion: 'Periodo de la EMA' }], version: 1, restricciones: [] } }
const FOTO = { id: 'x', name: 'Cruce de medias 50/200', definition: EMA, params: { ema: 2 } }

;(async () => {
  await C0.prepara(); C0.registra(R)
  const P = require(R + '/lib/planes/plan.js'), Li = require(R + '/lib/planes/lista.js'), Ev = require(R + '/lib/planes/evalua.js')
  const vela = (date, px) => ({ date, open: px, high: px, low: px, close: px, volume: 1000 })
  const activo = (symbol, F, precios, candidatos) => ({ symbol, fechas: F, abre: precios, cierra: precios, candidatos: candidatos.map(([e, pe, s, ps]) => ({ symbol, entryDate: F[e], entryPx: pe, exitDate: F[s], exitPx: ps })) })
  const lista = (activos) => ({ opciones: { modo: 'concentrado', n: 1, maxPosiciones: 1, prioridad: 'alfabetico' }, activos })
  const datosDe = (F, listas, velas) => { const plano = F.map(date => ({ date, open: 100, close: 100 })); return { fechas: F, qqq: plano, spy: plano, etf: F.map(() => null), qqqVelas: plano, velas: Object.fromEntries(Object.entries(velas).map(([s, ps]) => [s, F.map((f, i) => vela(f, ps[i]))])), listas } }
  const bloqueX = (peso, ocioso = 'LIQUIDEZ') => ({ id: 'x', tipo: 'estrategia', estrategia: FOTO, activo: 'A', peso, ocioso, aportacionDentro: 'espera', apalancamiento: 1, velas: 'diarias', donde: 'lista', lista: Li.mergeLista({ simbolos: ['A'], modo: 'concentrado', maxPosiciones: 1 }) })
  const bloqueP = (id, ps, peso, reglas) => ({ id, tipo: 'pesos', peso, pesos: ps.map(([simbolo, w]) => ({ simbolo, peso: w })), volver: { cada: 'nunca' }, aportaciones: 'partida', ...(reglas ? { reglas } : {}) })
  const plan = (piezas, F, { aport = null, costes = null, impuestos = 'ninguno' } = {}) => ({ tipo: 'plan', formato: 1, calculo: 1,
    dinero: { capitalInicial: 10000, aportaciones: aport ? { importe: aport, frecuencia: 'mensual' } : { frecuencia: 'ninguna' }, extraordinarias: [] }, piezas,
    reparto: { aportacionesA: 'pesos', rebalanceo: { calendario: 'nunca', banda: null } }, impuestos: { regimen: impuestos, reglaDosMeses: true }, costes, periodo: { desde: F[0], hasta: F[F.length - 1] } })
  const uds = (r, id, sym) => r.libro.movimientos.filter(m => m.pieza === id && m.simbolo === sym && m.tipo === 'compra').reduce((s, m) => s + m.unidades, 0)
  const F = Array.from({ length: 5 }, (_, k) => dia('2020-01-06', k))
  const LX = { x: lista([activo('A', F, [10, 10, 12, 12, 12], [[0, 10, 2, 12]])]) }

  // ── 1 y 2 · El dinero nuevo de una venta, hasta su % ──
  {
    const p1 = plan([bloqueX(0.5), bloqueP('p', [['B', 1]], 0.5)], F)
    ok(P.validaPlan(p1).length === 0 && P.esBloques(p1), `un bloque de estrategia y uno «Con pesos» forman un plan de bloques válido (${P.validaPlan(p1).join(' ')})`)
    const r = P.ejecutaPlan(p1, datosDe(F, LX, { B: [20, 20, 20, 20, 20] }), { libro: true })
    ok(cerca(uds(r, 'x', 'A'), 500) && cerca(uds(r, 'p', 'B'), 275), `X compra 500 A; P, 250 B el día 0 y 25 más el día 2 (${uds(r, 'x', 'A')}, ${uds(r, 'p', 'B')})`)
    const cB = r.libro.movimientos.filter(m => m.pieza === 'p' && m.tipo === 'compra').map(m => `${m.fecha} ${m.importe}`)
    ok(cB.join() === `${F[0]} 5000,${F[2]} 500`, `P compra 5.000 € el día 0 y 500 € el día 2 (${cB.join(' · ')})`)
    ok(cerca(r.valorNeto, 11000) && cerca(r.serie[4].piezas.cuenta, 5500), `final 11.000 €; 5.500 € esperan en la cuenta (${r.valorNeto}, ${r.serie[4].piezas.cuenta})`)
    ok(cerca(r.libro.porBloque.p.ganado, 0) && cerca(r.libro.porBloque.x.ganado, 1000) && Math.abs(r.libro.puente.descuadre) < 1e-6, 'por bloque: X +1.000 €, P 0 € (B no se mueve); la línea que suma cuadra')
    const r2 = P.ejecutaPlan(p1, datosDe(F, LX, { B: [20, 20, 25, 25, 25] }), { libro: true })
    ok(cerca(uds(r2, 'p', 'B'), 250) && cerca(r2.valorNeto, 12250), `con B a 25, P ya pasa de su 50 %: no coge nada; final 12.250 € (${uds(r2, 'p', 'B')}, ${r2.valorNeto})`)
  }

  // ── 3 · Aportaciones: solo el dinero nuevo ──
  {
    const F3 = ['2020-01-29', '2020-01-30', '2020-01-31', '2020-02-03', '2020-02-04']
    const p3 = plan([bloqueX(0.5), bloqueP('p', [['B', 1]], 0.5)], F3, { aport: 1000 })
    const r = P.ejecutaPlan(p3, datosDe(F3, { x: lista([activo('A', F3, [10, 10, 10, 10, 10], [])]) }, { B: F3.map(() => 20) }), { libro: true })
    const cB = r.libro.movimientos.filter(m => m.pieza === 'p' && m.tipo === 'compra').map(m => `${m.fecha} ${m.importe}`)
    ok(cB.join() === '2020-01-29 5000,2020-02-03 500', `día 0, 5.000 €; con los 1.000 € del 03/02, solo los 500 € que le caben (${cB.join(' · ')})`)
    ok(cerca(r.valorNeto, 11000) && cerca(r.serie[4].piezas.cuenta, 5500), `final 11.000 €; en la cuenta 5.500 € (${r.valorNeto}, ${r.serie[4].piezas.cuenta})`)
  }

  // ── 4 · Dos bloques «Con pesos» = uno con los dos símbolos ──
  {
    const G = Array.from({ length: 400 }, (_, k) => dia('2018-01-02', k)), A = G.map((_, i) => 100 * (1 + 0.3 * Math.sin(i / 40)) + i * 0.05), B = G.map((_, i) => 50 + 10 * Math.cos(i / 25) + i * 0.02)
    const D = datosDe(G, {}, { A, B }), cst = { comisionPct: 0.1, comisionMinEur: 0, horquillaPct: {} }
    const dos = P.ejecutaPlan(plan([bloqueP('a', [['A', 1]], 0.5), bloqueP('b', [['B', 1]], 0.5)], G, { costes: cst, impuestos: 'ES-ahorro' }), D, { libro: true })
    const uno = P.ejecutaPlan(plan([bloqueP('u', [['A', 0.5], ['B', 0.5]], 1)], G, { costes: cst, impuestos: 'ES-ahorro' }), D)
    ok(cerca(dos.valorNeto, uno.valorNeto) && cerca(dos.impuestos.pagados, uno.impuestos.pagados) && dos.costes.ordenes === uno.costes.ordenes, `dos bloques (100 % A y 100 % B) = un bloque 50/50: ${dos.valorNeto.toFixed(4)} / ${uno.valorNeto.toFixed(4)} €`)
    ok(Math.abs(dos.libro.puente.descuadre) < 1e-6 && cerca(dos.libro.porBloque.a.ganado + dos.libro.porBloque.b.ganado, dos.libro.puente.ganadoValores), 'lo ganado por bloque suma lo ganado en valores')
    const refs = Ev.referenciasDe(plan([bloqueP('a', [['A', 1]], 0.5), bloqueP('b', [['B', 1]], 0.5)], G)).map(x => x.id)
    ok(refs.includes('BLOQUE_a') && refs.includes('BLOQUE_b'), `las filas «Solo el bloque N» también con bloques «Con pesos» (${refs.join(', ')})`)
  }

  // ── 5 · Una regla del bloque: lo vendido se queda en el bloque ──
  {
    const regla = { filas: [{ quien: 'B', si: { c: 'caidaDesdeMaximoHistorico', p: { pct: 40 } }, velas: 'diarias' }], accion: { tipo: 'vender', de: 'B' }, mantenerMeses: 0, despues: { tipo: 'quedarse' }, repetir: 'unaVez' }
    const r = P.ejecutaPlan(plan([bloqueX(0.5), bloqueP('p', [['B', 1]], 0.5, [regla])], F), datosDe(F, LX, { B: [20, 20, 20, 10, 10] }))
    ok(r.pesos?.p?.historial?.[0]?.actua === F[4] && cerca(r.serie[4].piezas.p, 2750) && cerca(r.serie[4].piezas.cuenta, 5500), `el día 4 vende 275 B a 10: 2.750 € en el bloque, la cuenta sigue con 5.500 € (${r.serie[4].piezas.p}, ${r.serie[4].piezas.cuenta})`)
  }

  // ── 6 · Validación ──
  {
    const v = (piezas) => P.validaPlan(plan(piezas, F))
    ok(v([bloqueX(0.5, 'GLD'), bloqueP('p', [['GLD', 1]], 0.5)]).some(x => x.includes('no puede estar en un bloque «Con pesos»')), 'el ocioso de la cuenta no puede estar en un bloque «Con pesos»')
    ok(v([bloqueP('p', [['B', 1]], 0.5), { id: 'q', tipo: 'activo', activo: 'QQQ', peso: 0.5 }]).some(x => x.includes('solo puede ir con otros bloques')), 'con piezas de activo, no')
    ok(v([bloqueP('p', [['B', 1]], 0.5), bloqueP('cuenta', [['A', 1]], 0.5)]).some(x => x.includes('«cuenta»')), 'ningún bloque se puede llamar «cuenta»')
    ok(v([bloqueP('a', [['A', 1]], 0.6), bloqueP('b', [['B', 1]], 0.4)]).length === 0, 'dos bloques «Con pesos» solos, válidos (ocioso: liquidez)')
  }

  console.log(`plan-pesos-bloques: ${fallos ? `${fallos} fallos` : 'todo bien'}`)
  process.exit(fallos ? 1 : 0)
})().catch(e => { console.error(e); process.exit(2) })
