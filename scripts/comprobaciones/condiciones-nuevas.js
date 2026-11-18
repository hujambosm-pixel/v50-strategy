// scripts/comprobaciones/condiciones-nuevas.js — las dos condiciones nuevas del catálogo (docs/builder.md §192): «Caída desde el
// máximo histórico» y «Primera vela del mes, trimestre o año». Las corre comunes.sh. Termina en 0 si todo da lo esperado.
//
// A MANO.
//   Caída ≥ 40 % desde el máximo histórico, cierres 100, 120, 90, 72, 80, 119, 121, 70, (falta), 72,60:
//     d0 máx 100 · d1 máx 120 · d2 90 (−25 %) no · d3 72 = 120 × 0,6 → sí · d4 80 y d5 119: sigue (no ha superado 120) → sí
//     d6 121: máximo nuevo → no · d7 70 ≤ 121 × 0,6 = 72,60 → sí · d8 sin cierre → sin dato · d9 72,60: sigue → sí
//   Primera vela, diarias 28/12/2023, 29/12, 02/01/2024 (el 1 de enero cierra la bolsa), 03/01, 28/03, 01/04, 02/04, 01/07:
//     año: —, no, SÍ, no, no, no, no, no · trimestre: —, no, SÍ, no, no, SÍ, no, SÍ · mes: —, no, SÍ, no, SÍ (marzo), SÍ, no, SÍ
//   Semanales (lunes) 15/12/2025, 22/12, 29/12, 05/01/2026, 23/03, 30/03, 06/04: la semana cuenta para el periodo de su jueves.
//     La del 29/12/2025 tiene el jueves 01/01/2026 → primera de 2026; la del 30/03/2026, el jueves 02/04 → primera del 2.º trimestre.
//     año: —, no, SÍ, no, no, no, no · trimestre: —, no, SÍ, no, no, SÍ, no
//   Una estrategia «compro en la primera vela del año, a la apertura siguiente» con 2023-12-28 … 2024-01-05 compra el 03/01/2024.
process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://arnes.invalid'; process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'clave-falsa-del-arnes'
const C0 = require('./cargador'), R = C0.RAIZ
let fallos = 0
const ok = (c, t) => { console.log(`${c ? 'OK  ' : 'MAL '} ${t}`); if (!c) fallos++ }
const txt = (x) => JSON.stringify(x)

;(async () => {
  await C0.prepara(); C0.registra(R)
  const Cat = require(R + '/lib/condiciones/catalogo.js'), N = require(R + '/lib/condiciones/nucleo.js'), Df = require(R + '/lib/editor/definicion.js')
  const H = require(R + '/lib/editor/historia.js'), I = require(R + '/lib/editor/interprete.js'), Fi = require(R + '/lib/builder/fichas.js')
  const velas = (fechas, cierres) => fechas.map((date, i) => { const c = cierres[i], o = i && cierres[i - 1] != null ? cierres[i - 1] : c; return { date, open: o, high: c == null ? null : Math.max(o ?? c, c), low: c == null ? null : Math.min(o ?? c, c), close: c, volume: 1000 } })
  const dias = (n, desde = '2020-01-06') => { const out = []; for (let d = new Date(desde + 'T00:00:00Z'); out.length < n; d = new Date(d.getTime() + 864e5)) { const w = d.getUTCDay(); if (w >= 1 && w <= 5) out.push(d.toISOString().slice(0, 10)) } return out }

  // ── 1 · Caída desde el máximo histórico ──
  const K = Cat.caidaDesdeMaximoHistorico
  const V1 = velas(dias(10), [100, 120, 90, 72, 80, 119, 121, 70, null, 72.6])
  const s1 = K.serie(V1, { pct: 40 })
  ok(txt(s1) === txt([false, false, false, true, true, true, false, true, null, true]), `la serie a mano (${txt(s1)})`)
  ok(txt(Cat.caidaDesdeMaximoHistoricoPrep(V1.map(v => v.close), { pct: 40 }).M) === txt([100, 120, 120, 120, 120, 120, 121, 121, 121, 121]), 'el máximo de referencia de cada día')
  ok(K.calentamiento({ pct: 40 }) === Cat.HISTORIA_COMPLETA && Cat.HISTORIA_COMPLETA === 15000, 'pide toda la historia (15.000 velas)')
  ok(K.valida({ pct: 40 }).length === 0 && K.valida({ pct: 120 }).length === 1 && K.valida({}).length === 1, 'valida el porcentaje (0 a 100) y que esté')
  const largo = velas(dias(300), Array.from({ length: 300 }, (_, i) => 100 + 30 * Math.sin(i / 9) + (i % 7)))
  ok(N.sinMirarAlFuturo(v => K.serie(v, { pct: 15 }), largo, [0, 5, 50, 120, 299]).length === 0, 'no mira al futuro')
  ok(txt(K.serie(V1, { pct: 40 })) === txt(s1), 'pedirla dos veces da lo mismo (la caché no se estropea)')

  // ── 2 · Primera vela del mes, trimestre o año ──
  const P = Cat.primeraVelaPeriodo
  const fd = ['2023-12-28', '2023-12-29', '2024-01-02', '2024-01-03', '2024-03-28', '2024-04-01', '2024-04-02', '2024-07-01']
  const D = velas(fd, fd.map((_, i) => 100 + i))
  ok(txt(P.serie(D, { cada: 'anio' })) === txt([null, false, true, false, false, false, false, false]), `diarias · año (${txt(P.serie(D, { cada: 'anio' }))})`)
  ok(txt(P.serie(D, { cada: 'trimestre' })) === txt([null, false, true, false, false, true, false, true]), 'diarias · trimestre')
  ok(txt(P.serie(D, { cada: 'mes' })) === txt([null, false, true, false, true, true, false, true]), 'diarias · mes (el 28/03 también es la primera de marzo en esta lista)')
  const fw = ['2025-12-15', '2025-12-22', '2025-12-29', '2026-01-05', '2026-03-23', '2026-03-30', '2026-04-06']
  const W = velas(fw, fw.map((_, i) => 100 + i))
  ok(fw.every(f => new Date(f + 'T00:00:00Z').getUTCDay() === 1), 'las semanas del ejemplo empiezan en lunes')
  ok(txt(P.serie(W, { cada: 'anio' })) === txt([null, false, true, false, false, false, false]), `semanales · año: la del 29/12/2025 es la primera de 2026 (${txt(P.serie(W, { cada: 'anio' }))})`)
  ok(txt(P.serie(W, { cada: 'trimestre' })) === txt([null, false, true, false, false, true, false]), 'semanales · trimestre: la del 30/03/2026 es la primera del 2.º')
  ok(P.valida({ cada: 'anio' }).length === 0 && P.valida({ cada: 'semana' }).length === 1, 'valida el periodo')
  ok(N.sinMirarAlFuturo(v => P.serie(v, { cada: 'mes' }), largo, [0, 5, 22, 120, 299]).length === 0, 'no mira al futuro')
  // Las semanales que salen de las diarias (lib/velasSemanales.js): la primera semana de 2021 es la del lunes 04/01/2021 (jueves 07/01).
  const Sm = require(R + '/lib/velasSemanales.js')
  const dd = velas(dias(40, '2020-12-01'), Array.from({ length: 40 }, (_, i) => 100 + i))
  const sem = Sm.semanalesDesdeDiarias(dd), sS = P.serie(sem, { cada: 'anio' })
  ok(sem.filter((_, j) => sS[j] === true).map(w => w.date).join() === '2021-01-04', `con las semanas de las diarias, la primera de 2021 empieza el 04/01/2021 (${sem.filter((_, j) => sS[j] === true).map(w => w.date).join()})`)
  // En una estrategia diaria, una fila en semanas (enSemanal) se cumple el día que cierra esa semana.
  const enS = Cat.enSemanal(P, dd, { cada: 'anio' })
  ok(dd.filter((_, t) => enS[t] === true).map(v => v.date).join() === '2021-01-08', `en semanas sobre diarias: se conoce al cierre del viernes 08/01/2021 (${dd.filter((_, t) => enS[t] === true).map(v => v.date).join()})`)

  // ── 3 · En una estrategia (el intérprete del paso 1) ──
  const fe = ['2023-12-27', '2023-12-28', '2023-12-29', '2024-01-02', '2024-01-03', '2024-01-04', '2024-01-05']
  const VE = velas(fe, [100, 101, 102, 103, 104, 105, 106])
  const def = { tipo: 'editor', motor: 1, formato: 1, nombre: 'P', entrada: { orden: { tipo: 'apertura' }, senal: { c: 'primeraVelaPeriodo', p: { cada: 'anio' } } }, stops: [{ id: 'inicial', tipo: 'porcentaje', pct: 50, motivo: 'stop' }], salidas: [] }
  ok(Df.validaDefinicion(def).length === 0, `una estrategia con la condición es válida (${txt(Df.validaDefinicion(def))})`)
  const r = I.interpreta(def, VE, {}, {}), ops = [...r.trades, ...(r.openPosition ? [r.openPosition] : [])].map(t => [t.entryDate, t.entryPrice])
  ok(txt(ops) === txt([['2024-01-03', 103]]), `compra a la apertura del 03/01/2024, a 103 € (el cierre del 02/01) (${txt(ops)})`)
  const defH = { ...def, entrada: { ...def.entrada, senal: { c: 'caidaDesdeMaximoHistorico', p: { pct: 40 } } } }
  ok(Df.validaDefinicion(defH).length === 0 && H.velasNecesarias(defH) === 15000 && H.conHistoria(250, defH) === 16500, 'con la caída histórica, la estrategia pide toda la historia (15.000 + margen)')
  ok(H.velasNecesarias(def) === 1 && H.conHistoria(250, def) === 250, 'con la primera vela, nada más que lo de siempre')

  // ── 4 · En el catálogo del Builder ──
  const e1 = Fi.entradaCatalogo('caidaDesdeMaximoHistorico'), e2 = Fi.entradaCatalogo('primeraVelaPeriodo')
  ok(e1 && e1.grupo === 'precio' && e1.nombre === 'Caída desde el máximo histórico' && /80 × 0,6 = 48/.test(e1.explicacion), 'la caída histórica sale en «Precio y medias», con su ejemplo')
  ok(e2 && e2.grupo === 'calendario' && Fi.GRUPOS_CATALOGO.some(([g, t]) => g === 'calendario' && t === 'Calendario'), 'la primera vela sale en el grupo nuevo «Calendario»')
  ok(Fi.aplicaA('caidaDesdeMaximoHistorico') === 'ambos' && Fi.aplicaA('primeraVelaPeriodo') === 'ambos', 'las dos valen para este valor y para un índice')
  ok(Fi.fichaDe('primeraVelaPeriodo').frase({ cada: 'trimestre' }, { negada: false }) === 'es la primera vela de un trimestre nuevo', 'su frase')

  console.log(`condiciones-nuevas: ${fallos ? `${fallos} fallos` : 'todo bien'}`)
  process.exit(fallos ? 1 : 0)
})().catch(e => { console.error(e); process.exit(2) })
