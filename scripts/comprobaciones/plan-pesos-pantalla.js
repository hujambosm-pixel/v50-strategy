// scripts/comprobaciones/plan-pesos-pantalla.js — la PANTALLA del bloque «Con pesos» (docs/builder.md §197; boceto
// bocetos/bloque-con-pesos.html, pestaña 1): los ajustes (planDe / ajustesDe), la parte del dinero de cada bloque «Con pesos» que da el
// motor (bloquesPesos) para «Tu dinero» y «Detalle», y el montaje con estado («+ Añadir bloque ▾», secciones 1–3). Las corre comunes.sh.
// Termina en 0 si todo da lo esperado.
//
// A MANO (el caso 1 de plan-pesos-bloques.js; 5 sesiones; 10.000 €; sin costes; ocioso en liquidez):
//   Bloque X 50 %: lista [A], compra 500 A a 10 el día 0 y las vende a 12 el día 2. Bloque P 50 %: «Con pesos» 100 % B, siempre a 20.
//   Día 0: P compra 250 B (5.000 €) de 10.000 → su parte, 5.000 / 10.000 = 0,5. Día 2: X vende (6.000 €); P coge 500 € → 275 B = 5.500 €
//   de 11.000 = 0,5. Así todos los días: 0,5. Lo ganado por P, 0 € (B no se mueve); por X, +1.000 €.
process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://arnes.invalid'; process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'clave-falsa-del-arnes'
const C0 = require('./cargador'), R = C0.RAIZ, D = require('./domFalso')
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
  D.pon()
  await C0.prepara(); C0.registra(R)
  const P = require(R + '/lib/planes/plan.js'), Li = require(R + '/lib/planes/lista.js'), Pa = require(R + '/lib/builder/planPantalla.js'), Dp = require(R + '/lib/builder/detallePlan.js'), Lt = require(R + '/lib/lotesLab.js')

  // ── 1 · Los ajustes del bloque «Con pesos» ──
  {
    const a0 = { ...Pa.AJUSTES_PLAN, activo: 'AAPL', ocioso: 'LIQUIDEZ', impuestos: 'ninguno' }
    const a1 = Pa.anadeBloque(a0, 'x', 'pesos')
    const b = a1.bloques[0]
    ok(a1.peso === 50 && b.peso === 50 && b.tipo === 'pesos' && b.pesos.length === 1 && b.pesos[0].simbolo === '' && b.pesos[0].peso === 100 && b.volver.cada === 'nunca' && b.aportaciones === 'ahora' && !b.reglas,
      '«+ Añadir bloque ▾» → «Con pesos»: 50 % y 50 %, en blanco (un activo sin elegir al 100 %), sin volver a los pesos y sin reglas')
    const pv = Pa.planDe(a1, FOTO)
    ok(P.validaPlan(pv).some(e => /Falta elegir el activo en «1 · Pesos de partida»/.test(e)) && !P.validaPlan(pv).some(e => /no es un símbolo válido/.test(e)), `en blanco no se calcula y lo dice en palabras (${P.validaPlan(pv).join(' ')})`)
    { const BPm = require(R + '/components/BuilderPlan.js')
      ok(BPm.enBloques('Pieza b2: Falta algo.', pv) === 'Bloque 2: Falta algo.' && BPm.enBloques('Pieza zz: algo', pv) === 'Pieza zz: algo' && BPm.enBloques('Sin capital.', pv) === 'Sin capital.', '§201: en pantalla «Pieza b2:» pasa a «Bloque 2:» (un id que no está, o un texto sin pieza, igual)') }
    ok(Pa.resumenPesos(b) === '100 % ¿?', `resumen en blanco: «${Pa.resumenPesos(b)}»`)
    const a2 = { ...a1, peso: 60, bloques: [{ ...b, peso: 40, pesos: [{ simbolo: 'SPY', peso: 80 }, { simbolo: 'TQQQ', peso: 20 }], volver: { cada: 'banda', puntos: 15 }, aportaciones: 'atras' }] }
    const p = Pa.planDe(a2, FOTO)
    const x = p.piezas[1]
    ok(x.tipo === 'pesos' && x.id === 'b2' && x.peso === 0.4 && x.pesos.map(q => `${q.simbolo}:${q.peso}`).join() === 'SPY:0.8,TQQQ:0.2' && x.volver.cada === 'banda' && x.volver.puntos === 15 && x.aportaciones === 'atras' && !('reglas' in x),
      'planDe: la pieza «pesos» del motor (los % pasan a fracciones; con «banda», sus puntos)')
    ok(P.validaPlan(p).length === 0, `y es un plan válido (${P.validaPlan(p).join(' ')})`)
    ok(!('puntos' in Pa.planDe({ ...a2, bloques: [{ ...a2.bloques[0], volver: { cada: 'mes', puntos: 15 } }] }, FOTO).piezas[1].volver), 'sin «banda», la pieza no lleva puntos')
    const v = Pa.ajustesDe(p)
    ok(v.bloques[0].tipo === 'pesos' && v.bloques[0].peso === 40 && v.bloques[0].pesos.map(q => `${q.simbolo}:${q.peso}`).join() === 'SPY:80,TQQQ:20' && v.bloques[0].volver.puntos === 15 && Lt.jsonCanonico(Pa.planDe(v, FOTO)) === Lt.jsonCanonico(p),
      'ida y vuelta: planDe(ajustesDe(plan)) es el mismo plan')
    const reglas = [{ si: { c: 'x' }, entonces: { tipo: 'pesos' } }]
    const pr = Pa.planDe({ ...a2, bloques: [{ ...a2.bloques[0], reglas }] }, FOTO)
    ok(Lt.jsonCanonico(pr.piezas[1].reglas) === Lt.jsonCanonico(reglas) && Lt.jsonCanonico(Pa.ajustesDe(pr).bloques[0].reglas) === Lt.jsonCanonico(reglas), 'las reglas «si… entonces…» se guardan tal cual (ida y vuelta)')
    ok(Pa.resumenPesos({ ...a2.bloques[0], reglas }) === '80 % SPY + 20 % TQQQ · 1 regla' && Pa.resumenPesos({ pesos: [{ simbolo: 'LIQUIDEZ', peso: 12.5 }, { simbolo: 'GLD', peso: 87.5 }] }) === '12,50 % liquidez + 87,50 % GLD', 'el resumen de una línea')
    ok(Pa.sumaPesosBloque({ pesos: [{ peso: 33.3 }, { peso: 33.3 }, { peso: 33.4 }] }) === 100 && Pa.sumaPesosBloque({ pesos: [{ peso: 80 }, { peso: '' }] }) === 80, 'lo que suman los pesos (33,3 + 33,3 + 33,4 = 100; vacío cuenta 0)')
    ok(P.validaPlan(Pa.planDe({ ...a2, bloques: [{ ...a2.bloques[0], pesos: [{ simbolo: 'SPY', peso: 80 }, { simbolo: 'TQQQ', peso: 10 }] }] }, FOTO)).some(e => /sumar 100 %/.test(e)), 'si no suman 100 %, el motor lo dice')
    const q = Pa.quitaBloque(a2, 'b2')
    ok(!('bloques' in q) && Lt.jsonCanonico(Pa.planDe(q, FOTO)) === Lt.jsonCanonico(Pa.planDe(a0, FOTO)), 'quitar el bloque «Con pesos»: el plan de un bloque de siempre, idéntico')
  }

  // ── 2 · El motor: la parte del dinero en el bloque «Con pesos» (bloquesPesos) y «Detalle» por bloque ──
  {
    const vela = (date, px) => ({ date, open: px, high: px, low: px, close: px, volume: 1000 })
    const F = Array.from({ length: 5 }, (_, k) => dia('2020-01-06', k)), plano = F.map(date => ({ date, open: 100, close: 100 }))
    const LX = { x: { opciones: { modo: 'concentrado', n: 1, maxPosiciones: 1, prioridad: 'alfabetico' }, activos: [{ symbol: 'A', fechas: F, abre: [10, 10, 12, 12, 12], cierra: [10, 10, 12, 12, 12], candidatos: [{ symbol: 'A', entryDate: F[0], entryPx: 10, exitDate: F[2], exitPx: 12 }] }] } }
    const datos = { fechas: F, qqq: plano, spy: plano, etf: F.map(() => null), qqqVelas: plano, velas: { B: F.map(f => vela(f, 20)) }, listas: LX }
    const plan = { tipo: 'plan', formato: 1, calculo: 1, dinero: { capitalInicial: 10000, aportaciones: { frecuencia: 'ninguna' }, extraordinarias: [] },
      piezas: [{ id: 'x', tipo: 'estrategia', estrategia: FOTO, activo: 'A', peso: 0.5, ocioso: 'LIQUIDEZ', aportacionDentro: 'espera', apalancamiento: 1, velas: 'diarias', donde: 'lista', lista: Li.mergeLista({ simbolos: ['A'], modo: 'concentrado', maxPosiciones: 1 }) },
        { id: 'p', tipo: 'pesos', peso: 0.5, pesos: [{ simbolo: 'B', peso: 1 }], volver: { cada: 'nunca' }, aportaciones: 'partida' }],
      reparto: { aportacionesA: 'pesos', rebalanceo: { calendario: 'nunca', banda: null } }, impuestos: { regimen: 'ninguno', reglaDosMeses: true }, costes: null, periodo: { desde: F[0], hasta: F[4] } }
    const r = P.ejecutaPlan(plan, datos, { libro: true })
    const dp = r.bloquesPesos?.p?.dentro || []
    ok(dp.length === 5 && dp.every(f => cerca(f, 0.5)), `la parte del dinero en el bloque «Con pesos», 0,5 cada día (${dp.join(', ')})`)
    ok(cerca(r.valorNeto, 11000), `final 11.000 € (${r.valorNeto})`)
    const sinPesos = P.ejecutaPlan({ ...plan, piezas: [{ ...plan.piezas[0], peso: 1 }] }, { ...datos, lista: LX.x }, { libro: true })
    ok(!('bloquesPesos' in sinPesos), 'sin bloque «Con pesos», la salida del motor no cambia (no lleva bloquesPesos)')
    const det = Dp.detallePlan({ evaluacion: { plan: { ejecucion: r, medidas: { valorNeto: r.valorNeto } } } }, plan)
    const bP = det?.bloques?.find(z => z.id === 'p'), bX = det?.bloques?.find(z => z.id === 'x')
    ok(det?.bloques?.length === 2 && bP?.n === 2 && bP.nombre === 'Con pesos · 100 % B' && bP.donde === 'B', `«Detalle»: dos bloques; el 2, «${bP?.nombre}» en ${bP?.donde}`)
    ok(cerca(bP?.aporto, 0) && cerca(bX?.aporto, 1000) && cerca(bP?.enEl, 0.5), `por bloque: X +1.000 €, P 0 €, con el 50 % del dinero de media (${bX?.aporto}, ${bP?.aporto}, ${bP?.enEl})`)
  }

  // ── 3 · La pantalla: «+ Añadir bloque ▾» y las secciones 1–3 ──
  {
    const path = require('path'), React = require(path.join(R, 'node_modules', 'react')), RDC = require(path.join(R, 'node_modules', 'react-dom', 'client'))
    const BP = require(R + '/components/BuilderPlan.js').default
    let pedidos = []
    const props = (ini) => ({ estrategias: [FOTO], estrategiaId: 'x', datosLista: { watchlist: [{ symbol: 'AAPL', name: 'Apple', list_ids: [] }], wlLists: [], rankingData: {} },
      deps: { ctx: null, calcula: async (...xs) => { pedidos.push(xs); throw new Error('sin motor en la prueba') } }, inicial: { planes: [], pestana: 'n1', simbolos: ['AAPL', 'SPY', 'TQQQ', 'GLD'], pruebas: [], resultadoPrueba: null, ...ini } })
    const hasta = async (cond, max = 20000) => { const t0 = Date.now(); do { await D.espera(5); try { if (cond()) { await D.espera(5); return true } } catch (_) {} } while (Date.now() - t0 < max); return false }
    {
      const m = D.monta(React.createElement(BP, props({ ajustes: { activo: 'AAPL', ocioso: 'LIQUIDEZ' } })), RDC); await D.espera(60)
      const boton = (id) => m.raiz.conAtributo('data-boton', id)[0]
      ok(/Añadir bloque ▾/.test(boton('anadir-bloque')?.textContent || '') && !m.raiz.conAtributo('data-menu', 'anadir-bloque').length, '«+ Añadir bloque ▾», con el desplegable cerrado')
      D.pulsa(boton('anadir-bloque')); await hasta(() => !!boton('anadir-bloque-pesos'))
      ok(!!boton('anadir-bloque-estrategia') && !!boton('anadir-bloque-pesos') && /Con una estrategia/.test(m.raiz.conAtributo('data-menu', 'anadir-bloque')[0]?.textContent) && /Con pesos/.test(m.raiz.conAtributo('data-menu', 'anadir-bloque')[0]?.textContent), 'al pulsarlo: «Con una estrategia» y «Con pesos»')
      D.pulsa(boton('anadir-bloque-pesos')); await hasta(() => m.raiz.conAtributo('data-tipo-bloque', 'pesos').length === 1)
      const bq = m.raiz.conAtributo('data-tipo-bloque', 'pesos')[0]
      ok(!!bq && bq.getAttribute('data-bloque') === '2' && !m.raiz.conAtributo('data-menu', 'anadir-bloque').length && m.raiz.conAtributo('data-parte').map(z => z.textContent).join('|') === '50 %|50 %', 'añade el bloque 2 «Con pesos» al 50 % y cierra el desplegable')
      ok(['1', '2', '3'].every(s => bq.conAtributo('data-seccion-pesos', s).length === 1) && /1 · Pesos de partida/.test(bq.textContent) && /2 · Volver a los pesos del bloque/.test(bq.textContent) && /3 · El dinero que le llega/.test(bq.textContent), 'con sus tres secciones')
      ok(/Con pesos · 100 % ¿\?/.test(bq.textContent) && bq.conAtributo('data-suma-pesos', '100').length === 1, 'en blanco: «Con pesos · 100 % ¿?» y «Suman 100 % ✓»')
      await hasta(() => m.raiz.conAtributo('data-errores-plan').length > 0)
      { const tx = m.raiz.conAtributo('data-errores-plan')[0]?.textContent || ''
        ok(/Bloque 2: Falta elegir el activo en «1 · Pesos de partida»/.test(tx) && !/Pieza|no es un símbolo válido/.test(tx), `sin activo elegido no se calcula y lo dice en palabras («${tx}»)`) }
      { const sr = m.raiz.conAtributo('data-sin-resultado').map(z => z.textContent).join('|')
        ok(sr === 'Tu plan se calculará cuando arregles lo que sale en rojo arriba.', `§202: a la derecha, que se calculará al arreglarlo (no «Calculando tu plan…» sin fin): «${sr}»`) }
      m.quita(); await D.espera(5)
    }
    {
      pedidos = []
      const ini = { activo: 'AAPL', ocioso: 'LIQUIDEZ', peso: 60, dineroLibre: 'tope', bloques: [{ ...Pa.bloquePesosNuevo('b2', 40), pesos: [{ simbolo: 'SPY', peso: 80 }, { simbolo: 'TQQQ', peso: 20 }] }] }
      const m = D.monta(React.createElement(BP, props({ ajustes: ini })), RDC); await D.espera(60)
      const bq = () => m.raiz.conAtributo('data-tipo-bloque', 'pesos')[0]
      const pieza = () => pedidos[pedidos.length - 1]?.[0]?.piezas?.find(z => z.tipo === 'pesos')
      await hasta(() => pedidos.length > 0)
      ok(/Con pesos · 80 % SPY \+ 20 % TQQQ/.test(bq().textContent) && /volver a los pesos: nunca · el dinero que llega: según los pesos de ahora/.test(bq().textContent), 'la fila resume el bloque')
      ok(pieza()?.pesos?.map(q => `${q.simbolo}:${q.peso}`).join() === 'SPY:0.8,TQQQ:0.2' && pieza().peso === 0.4, 'lo que se calcula: la pieza «pesos» al 40 % con 80/20')
      const seg = (sec, texto) => bq().conAtributo('data-seccion-pesos', sec)[0].conAtributo('aria-pressed').find(z => z.textContent === texto)
      D.pulsa(seg('2', 'Si alguno se separa')); await hasta(() => bq().conAtributo('data-banda').length === 1)
      await hasta(() => pieza()?.volver?.cada === 'banda')
      ok(bq().conAtributo('data-banda').length === 1 && pieza()?.volver?.puntos === 10, '«Si alguno se separa»: sale «más de 10 puntos» y se calcula con ellos')
      D.pulsa(seg('3', 'Al que más se ha quedado atrás')); await hasta(() => pieza()?.aportaciones === 'atras')
      ok(pieza()?.aportaciones === 'atras' && /el dinero que llega: al que más se ha quedado atrás/.test(bq().textContent), '«El dinero que le llega»: al que más se ha quedado atrás')
      D.pulsa(bq().conAtributo('data-boton', 'anadir-activo')[0]); await hasta(() => bq().conAtributo('data-fila-peso').length === 3)
      ok(bq().conAtributo('data-fila-peso').length === 3 && bq().conAtributo('data-suma-pesos', '100').length === 1, '«+ Añadir activo»: una fila más (con lo que falta para el 100 %: 0 %)')
      D.pulsa(bq().conAtributo('data-fila-peso', '2')[0].conAtributo('data-boton', 'quitar-activo')[0]); await hasta(() => bq().conAtributo('data-fila-peso').length === 2)
      ok(bq().conAtributo('data-fila-peso').length === 2, 'la papelera quita esa fila')
      const quitar0 = bq().conAtributo('data-boton', 'quitar-activo')[0]
      D.pulsa(quitar0); await hasta(() => bq().conAtributo('data-fila-peso').length === 1)
      ok(bq().conAtributo('data-suma-pesos', '20').length === 1 && /Suman 20 %/.test(bq().textContent) && bq().conAtributo('data-boton', 'quitar-activo')[0].getAttribute('disabled') != null, 'quitando SPY quedan 20 %: lo dice en rojo; con un solo activo, la papelera se apaga')
      D.pulsa(m.raiz.conAtributo('data-boton', 'quitar-bloque')[0]); await hasta(() => !m.raiz.conAtributo('data-tipo-bloque', 'pesos').length)
      ok(!m.raiz.conAtributo('data-tipo-bloque', 'pesos').length && m.raiz.conAtributo('data-parte')[0]?.textContent === '100 %', '«Quitar»: vuelve a un bloque al 100 %')
      m.quita(); await D.espera(5)
    }
  }

  console.log(fallos ? `plan-pesos-pantalla: ${fallos} fallo(s)` : 'plan-pesos-pantalla: todo bien')
  process.exit(fallos ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
