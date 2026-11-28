// scripts/comprobaciones/plan-reglas-detalle.js — lo que se ve de las reglas del bloque «Con pesos» (docs/builder.md §200): la fila
// «El bloque N sin sus reglas» de «Tu dinero», la franja de estado y la tabla «Cuándo actuó cada regla» de «Detalle», y cuántas reglas
// lleva en la portada y en «Comparar planes». Las corre comunes.sh. Termina en 0 si todo da lo esperado. Sin comisiones ni impuestos.
//
// A MANO (30 sesiones desde el lunes 06/01/2020; 10.000 €; ocioso en liquidez; cada vela abre y cierra igual):
//   Bloque a 50 %: «Con pesos» 100 % A (A siempre a 100).   Bloque p 50 %: «Con pesos» 80 % B + 20 % T (B siempre a 10).
//   T: 10 las sesiones 0–2, 5 de la 3 a la 19 y 8 desde la 20.
//   Regla 1 del bloque p: si T cae ≥ 40 % desde su máximo → pasar a 50 % B + 50 % T, mantener 1 mes, después volver a los de partida, solo una vez.
//   · Día 0: p compra 4.000 € de B (400) y 1.000 € de T (100).
//   · Cierre del día 3 (09/01): T a 5, cae un 50 % → se cumple. Actúa el día 4 (10/01) a la apertura: el bloque vale 4.000 + 500 = 4.500 €;
//     a 50/50 tocan 2.250 € cada uno → vende 1.750 € de B y compra 1.750 € de T (350 T; ahora 225 B y 450 T). Movió 1.750 €.
//   · Mantener 1 mes: hasta el 10/02 (sesión 25). Al cierre del 10/02 acaba; vuelve a los de partida el 11/02 (sesión 26) a la apertura,
//     con T a 8: 2.250 + 3.600 = 5.850 € → 80/20 = 4.680 / 1.170 → vende 2.430 € de T y compra 2.430 € de B. Movió 2.430 €.
//   · Final: a 5.000 + p 5.850 = 10.850 €. Sin la regla: 5.000 + 4.000 + 100 × 8 = 9.800 €.
//   · Franja: «ninguna regla» las sesiones 0–3 y 26–29 (8 de 30), «regla 1» de la 4 a la 25 (22 de 30).
process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://arnes.invalid'; process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'clave-falsa-del-arnes'
const C0 = require('./cargador'), R = C0.RAIZ
let fallos = 0
const ok = (c, t) => { console.log(`${c ? 'OK  ' : 'MAL '} ${t}`); if (!c) fallos++ }
const cerca = (a, b, tol = 1e-9) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tol * Math.max(1, Math.abs(b))
const dia = (f, n) => { const out = []; for (let d = new Date(f + 'T00:00:00Z'); out.length <= n; d = new Date(d.getTime() + 864e5)) { const w = d.getUTCDay(); if (w >= 1 && w <= 5) out.push(d.toISOString().slice(0, 10)) } return out[n] }

;(async () => {
  await C0.prepara(); C0.registra(R)
  const P = require(R + '/lib/planes/plan.js'), Ev = require(R + '/lib/planes/evalua.js'), Pp = require(R + '/lib/builder/planPantalla.js'), Dp = require(R + '/lib/builder/detallePlan.js'), Cp = require(R + '/lib/builder/comparaPlanes.js')
  const React = require('react'), { renderToString } = require('react-dom/server'), PlanDetalle = require(R + '/components/PlanDetalle.js').default
  const F = Array.from({ length: 30 }, (_, k) => dia('2020-01-06', k))
  const vela = (date, px) => ({ date, open: px, high: px, low: px, close: px, volume: 1000 })
  const T = F.map((_, i) => i < 3 ? 10 : i < 20 ? 5 : 8)
  const plano = F.map(date => ({ date, open: 100, close: 100 }))
  const datos = { fechas: F, qqq: plano, spy: plano, etf: F.map(() => null), qqqVelas: plano, velas: { A: F.map(f => vela(f, 100)), B: F.map(f => vela(f, 10)), T: F.map((f, i) => vela(f, T[i])) } }
  const regla = { filas: [{ quien: 'T', si: { c: 'caidaDesdeMaximoHistorico', p: { pct: 40 } }, velas: 'diarias' }], accion: { tipo: 'pesos', pesos: [{ simbolo: 'B', peso: 0.5 }, { simbolo: 'T', peso: 0.5 }] }, mantenerMeses: 1, despues: { tipo: 'partida' }, repetir: 'unaVez' }
  const bloque = (id, ps, peso, reglas) => ({ id, tipo: 'pesos', peso, pesos: ps.map(([simbolo, w]) => ({ simbolo, peso: w })), volver: { cada: 'nunca' }, aportaciones: 'partida', ...(reglas ? { reglas } : {}) })
  const plan = { tipo: 'plan', formato: 1, calculo: 1, dinero: { capitalInicial: 10000, aportaciones: { frecuencia: 'ninguna' }, extraordinarias: [] },
    piezas: [bloque('a', [['A', 1]], 0.5), bloque('p', [['B', 0.8], ['T', 0.2]], 0.5, [regla])],
    reparto: { aportacionesA: 'pesos', rebalanceo: { calendario: 'nunca', banda: null } }, impuestos: { regimen: 'ninguno', reglaDosMeses: true }, costes: null, periodo: { desde: F[0], hasta: F[F.length - 1] } }
  ok(P.validaPlan(plan).length === 0, `el plan de prueba es válido (${P.validaPlan(plan).join(' ')})`)

  // ── 1 · «Tu dinero»: la fila «El bloque 2 sin sus reglas» ──
  const ev = Ev.evaluaPlan(plan, datos, { detalle: true, libro: true })
  ok(cerca(ev.plan.medidas.valorNeto, 10850), `con la regla, 10.850 € (${ev.plan.medidas.valorNeto})`)
  const sr = ev.referencias.find(r => r.id === 'SINREGLAS_p')
  ok(!!sr && sr.nombre === 'La parte 2 sin sus reglas' && cerca(sr.medidas.valorNeto, 9800), `«El bloque 2 sin sus reglas» = 9.800 € (${sr?.nombre}, ${sr?.medidas.valorNeto})`)
  ok(!ev.referencias.some(r => r.id === 'SINREGLAS_a'), 'el bloque 1, sin reglas, no tiene esa fila')
  const sinR = { ...plan, piezas: [plan.piezas[0], bloque('p', [['B', 0.8], ['T', 0.2]], 0.5)] }
  ok(!Ev.referenciasDe(sinR).some(r => r.id.startsWith('SINREGLAS_')), 'sin reglas en ningún bloque, no sale ninguna fila «sin sus reglas»')
  ok(cerca(Ev.evaluaPlan(sinR, datos, { detalle: false }).plan.medidas.valorNeto, sr.medidas.valorNeto), 'la fila «sin sus reglas» da lo mismo que quitar las reglas del plan')
  const respuesta = { evaluacion: ev, ordenesReferencias: Object.fromEntries(ev.referencias.map(r => [r.id, 0])), huella: 'x' }
  const cf = Pp.cifrasPlan(respuesta, plan), fila = cf.alternativas.find(x => x.id === 'SINREGLAS_p')
  const ids = cf.alternativas.map(x => x.id)
  ok(!!fila && fila.bloque === 2 && fila.sinReglas && cf.conSinReglas, `en la tabla de «Tu dinero», con el color del bloque 2 (bloque ${fila?.bloque})`)
  ok(ids.indexOf('SINREGLAS_p') > ids.indexOf('BLOQUE_p') && ids.indexOf('SINREGLAS_p') < ids.indexOf('QQQ'), `detrás de «Solo el bloque N» y antes de los Buy&Hold (${ids.join(', ')})`)
  ok(/sin ninguna de sus reglas/.test(Pp.AYUDA_PESOS.sinReglas) && /70\.700 €.*68\.200 €.*2\.500 €/.test(Pp.AYUDA_PESOS.sinReglas), 'su «?» explica la fila con un ejemplo que cuadra (70.700 − 68.200 = 2.500)')

  // ── 2 · «Detalle»: cuándo actuó cada regla y la franja ──
  const det = Dp.detallePlan({ evaluacion: ev }, plan), rg = det?.reglas
  ok(Array.isArray(rg) && rg.length === 1 && rg[0].id === 'p' && rg[0].n === 2, `una tarjeta, la del bloque 2 (${JSON.stringify(rg?.map(x => [x.id, x.n]))})`)
  const r = rg[0], [f1, f2] = r.filas
  ok(r.filas.length === 2, `dos filas: la regla y la vuelta (${r.filas.length})`)
  ok(f1.cumple === '2020-01-09' && f1.actua === '2020-01-10' && f1.regla === 1 && !f1.vuelta && f1.que === 'Pasa a 50 % B + 50 % T' && cerca(f1.movido, 1750) && /50 % B/.test(f1.pesos) && /50 % T/.test(f1.pesos),
    `regla 1: se cumplió el 09/01, actuó el 10/01, «Pasa a 50 % B + 50 % T», movió 1.750 € (${JSON.stringify(f1)})`)
  ok(f2.cumple === '2020-02-10' && f2.actua === '2020-02-11' && f2.vuelta && f2.que === 'Acaba la regla 1: vuelve a los pesos de partida' && cerca(f2.movido, 2430) && f2.pesos === '80 % B + 20 % T',
    `vuelta: se cumplió el 10/02, actuó el 11/02, movió 2.430 €, queda 80 % B + 20 % T (${JSON.stringify(f2)})`)
  ok(JSON.stringify(r.tramos.map(t => [t.estado, t.desde, t.hasta, t.dias])) === JSON.stringify([[0, F[0], F[3], 4], [1, F[4], F[25], 22], [0, F[26], F[29], 4]]), `franja: ninguna (4) · regla 1 (22) · ninguna (4) (${JSON.stringify(r.tramos)})`)
  ok(cerca(r.tiempo[0].parte, 8 / 30) && cerca(r.tiempo[1].parte, 22 / 30) && r.tiempo.length === 2, `tiempo: ninguna regla 8/30, regla 1 22/30 (${r.tiempo.map(t => t.parte).join(', ')})`)
  ok(r.reglas.length === 1 && /^Regla 1: si /.test(r.reglas[0].frase), `la frase de la regla, la de «Así se lee» (${r.reglas[0].frase.slice(0, 60)}…)`)
  ok(Dp.detallePlan({ evaluacion: Ev.evaluaPlan(sinR, datos, { detalle: true, libro: true }) }, sinR).reglas === null, 'sin reglas, «Detalle» no tiene esa tarjeta')
  const txt = Dp.textoDetalle(det, { nombre: 'Prueba' })
  ok(/CUÁNDO ACTUÓ CADA REGLA · BLOQUE 2/.test(txt) && /2020-01-10\t1\tPasa a 50 % B \+ 50 % T\t1750\.00 €/.test(txt), '«Copiar para Claude» las incluye')
  ok(/«Movió» 800 €/.test(Dp.AYUDA_DETALLE.reglas) && /20 %/.test(Dp.AYUDA_DETALLE.franjaReglas), 'sus «?» con ejemplo (4.000 € 80/20 → 60/40: 800 €; 504 de 2.520 días = 20 %)')

  // ── 3 · Montaje SWC de «Detalle» con la tarjeta ──
  let html = ''
  try { html = renderToString(React.createElement(PlanDetalle, { detalle: det, cifras: cf })).replace(/<!-- -->/g, '') } catch (e) { console.error(e) }
  ok(/data-tarjeta="detalle-reglas-2"/.test(html), 'la tarjeta «Bloque 2 · cuándo actuó cada regla» se pinta')
  ok((html.match(/data-tramo-regla="/g) || []).length === 3 && /data-tabla="reglas-2"/.test(html) && (html.match(/data-fila-regla="1"/g) || []).length === 2, 'con sus 3 tramos de franja y sus 2 filas')
  ok(/actuó 1 vez/.test(html) && /regla 1 en curso · 73 % del tiempo/.test(html) && /ninguna regla en curso · 27 % del tiempo/.test(html), 'arriba «actuó 1 vez» y debajo de la franja 27 % / 73 % del tiempo')
  ok(/1\.750 €/.test(html) && /2\.430 €/.test(html), 'lo movido, en euros')

  // ── 4 · Portada y «Comparar planes»: cuántas reglas ──
  // (en la pantalla, el bloque 1 es siempre de estrategia)
  const cartera = Cp.textoBloque({ ...plan, piezas: [{ id: 'e', tipo: 'estrategia', estrategia: { name: 'Cruce de medias 50/200' }, peso: 0.5, ocioso: 'LIQUIDEZ' }, plan.piezas[1]] })
  const src = require('fs').readFileSync(R + '/lib/builder/comparaPlanes.js', 'utf8'), srcPanel = require('fs').readFileSync(R + '/components/BuilderPanel.js', 'utf8')
  ok(/1 regla/.test(src) && /1 regla/.test(srcPanel), 'portada y «Comparar planes» dicen cuántas reglas lleva el bloque')
  ok(cartera.includes('con pesos B/T y 1 regla (50 %)'), `«Comparar planes»: ${cartera}`)

  console.log(`plan-reglas-detalle: ${fallos ? `${fallos} fallos` : 'todo bien'}`)
  process.exit(fallos ? 1 : 0)
})().catch(e => { console.error(e); process.exit(2) })
