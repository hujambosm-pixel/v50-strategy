// scripts/comprobaciones/plan-filtros.js — los FILTROS DEL PLAN: el plan calcula con la estrategia efectiva (docs/builder.md §150).
// Las corre comunes.sh. Termina en 0 si todo da lo esperado.
//
// A mano. 300 sesiones planas de calentamiento y 30 del periodo (de lunes a viernes, desde el lunes 02/03/2020: d0…d29), las mismas
// de filtros-extra.js. Cada vela abre al cierre de la anterior. 10.000 €, sin aportaciones, sin costes ni impuestos, ocioso en liquidez.
//   VAL: 100 plano hasta d9; desde d10 cierra a 104, 106… (+2 al día); d29 cierra a 142. La estrategia («de estado»): compro cuando
//     el cierre está sobre su SMA (3), a la apertura siguiente. Sin filtros: compra en d11 a 104 → acaba en 10.000 × 142 / 104.
//   REF (50 plano hasta d12; d13 = 52…): con la fila «REF: cierre > SMA (3)» compra en d14 a 110 → 10.000 × 142 / 110 = 12.909,09 €.
//   REF2 (20 plano hasta d16; d17 = 21…): con las dos filas compra en d18 a 118 → 10.000 × 142 / 118.
//   REFW (semanas a 50, 50, 60, 70…): con la fila semanal «cierre > SMA (2)» compra en d16 a 114 → 10.000 × 142 / 114.
process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://arnes.invalid'; process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'clave-falsa-del-arnes'
const C0 = require('./cargador'), R = C0.RAIZ, D = require('./domFalso')
let fallos = 0
const ok = (c, t) => { console.log(`${c ? 'OK  ' : 'MAL '} ${t}`); if (!c) fallos++ }
const cerca = (a, b, tol = 1e-9) => Number.isFinite(a) && Math.abs(a - b) <= tol * Math.max(1, Math.abs(b))
const txt = (x) => JSON.stringify(x)

;(async () => {
  D.pon(); await C0.prepara(); C0.registra(R)
  const P = require(R + '/lib/planes/plan.js'), Es = require(R + '/lib/planes/estrategia.js'), Pa = require(R + '/lib/builder/planPantalla.js'), Li = require(R + '/lib/planes/lista.js')

  const habiles = (desde, n, atras = false) => { const out = []; for (let d = new Date(desde + 'T00:00:00Z'); out.length < n; d = new Date(d.getTime() + (atras ? -864e5 : 864e5))) { const w = d.getUTCDay(); if (w >= 1 && w <= 5) out.push(d.toISOString().slice(0, 10)) } return atras ? out.reverse() : out }
  const per = habiles('2020-03-02', 30), cal = habiles('2020-02-28', 300, true), fechas = [...cal, ...per]
  const serie = (cierres) => fechas.map((date, k) => { const i = k - 300, c = i < 0 ? cierres(0) : cierres(i), o = i <= 0 ? c : cierres(i - 1); return { date, open: o, high: Math.max(o, c), low: Math.min(o, c), close: c, volume: 1000 } })
  const VAL = serie(i => i < 10 ? 100 : 104 + 2 * (i - 10)), REF = serie(i => i < 13 ? 50 : 52 + 2 * (i - 13)), REF2 = serie(i => i < 17 ? 20 : 21 + (i - 17)), REFW = serie(i => i < 10 ? 50 : 60 + 10 * (Math.floor(i / 5) - 2))
  const plano = fechas.map(date => ({ date, open: 100, close: 100 }))
  const datos = () => ({ fechas, qqq: plano, spy: plano, etf: fechas.map(() => null), qqqVelas: plano, velas: { VAL, REF, REF2, REFW } })
  ok(per[0] === '2020-03-02' && cal[299] === '2020-02-28' && per[14] === '2020-03-20' && VAL[300 + 29].close === 142, 'las fechas y los precios del ejemplo')

  const sobre = (periodo) => ({ c: 'precioVsMedia', p: { tipo: 'SMA', periodo, lado: 'encima' } })
  const ESTADO = { tipo: 'editor', motor: 1, formato: 1, nombre: 'P', entrada: { orden: { tipo: 'apertura' }, senal: sobre(3) }, stops: [{ id: 'inicial', tipo: 'porcentaje', pct: 50, motivo: 'stop' }], salidas: [] }
  const foto = (definition = ESTADO) => ({ id: 'x', name: 'Sigue la tendencia', definition, params: {} })
  const plan = (pieza = {}, definition = ESTADO) => ({ tipo: 'plan', formato: 1, calculo: 1, dinero: { capitalInicial: 10000, aportaciones: { frecuencia: 'ninguna' }, extraordinarias: [] },
    piezas: [{ id: 'e', tipo: 'estrategia', estrategia: foto(definition), activo: 'VAL', peso: 1, ocioso: 'LIQUIDEZ', aportacionDentro: 'espera', apalancamiento: 1, ...pieza }],
    reparto: { aportacionesA: 'pesos', rebalanceo: { calendario: 'nunca', banda: null } }, impuestos: { regimen: 'ninguno', reglaDosMeses: true }, costes: null, periodo: { desde: per[0], hasta: per[29] } })
  const corre = (p) => { const r = P.ejecutaPlan(p, datos()); return { r, ops: r.estrategias.e.operaciones.map(o => [o.entryDate, o.entryPrice]), final: r.valorNeto } }
  const fREF = { quien: 'REF', si: sobre(3) }, fREF2 = { quien: 'REF2', si: sobre(3) }, fSem = { quien: 'REFW', si: sobre(2), velas: 'semanal' }

  // ── 1 · Sin filtros del plan: el plan de siempre ──
  const sin = corre(plan())
  ok(txt(sin.ops) === txt([[per[11], 104]]) && cerca(sin.final, 10000 * 142 / 104), `sin filtros: compra en d11 a 104 y acaba en 10.000 × 142 / 104 = ${(10000 * 142 / 104).toFixed(2)} € (${sin.final})`)
  ok(Es.definicionEfectiva(plan().piezas[0]) === ESTADO && Es.definicionEfectiva(plan({ filtros: { filas: [] } }).piezas[0]) === ESTADO && !Es.cambiaFiltros(plan({ filtros: { propios: true, filas: [] } }).piezas[0]), 'sin cambios, la estrategia efectiva es la MISMA definición de la foto')
  ok(txt(corre(plan({ filtros: { filas: [] } })).r.serie) === txt(sin.r.serie), 'con el campo vacío, el resultado es idéntico día a día')

  // ── 2 · Una fila añadida en el plan ──
  const uno = corre(plan({ filtros: { filas: [fREF] } }))
  ok(P.validaPlan(plan({ filtros: { filas: [fREF] } })).length === 0, `el plan con una fila de filtro es válido ${P.validaPlan(plan({ filtros: { filas: [fREF] } })).join(' ')}`)
  ok(txt(uno.ops) === txt([[per[14], 110]]) && cerca(uno.final, 10000 * 142 / 110), `con «REF sobre su SMA (3)»: compra en d14 a 110 y acaba en 12.909,09 € (${uno.final})`)
  // La prueba de oro: el mismo filtro puesto en la estrategia (el paso 1) da el mismo plan.
  const enEstrategia = corre(plan({}, { ...ESTADO, filtroMercado: { ticker: 'REF', si: sobre(3) } }))
  ok(txt(enEstrategia.ops) === txt(uno.ops) && txt(enEstrategia.r.serie.map(p => p.patrimonio)) === txt(uno.r.serie.map(p => p.patrimonio)), 'PRUEBA DE ORO: la fila en el plan = el mismo filtro puesto en la estrategia (mismo patrimonio cada día)')
  ok(txt(Es.simbolosDe(plan({ filtros: { filas: [fREF, fREF2] } }).piezas[0])) === txt(['VAL', 'REF', 'REF2']) && txt(Es.simbolosDe(plan().piezas[0])) === txt(['VAL']), 'el plan pide las velas de los símbolos de sus filas')

  // ── 3 · Varios símbolos y una fila semanal ──
  const dos = corre(plan({ filtros: { filas: [fREF, fREF2] } }))
  ok(txt(dos.ops) === txt([[per[18], 118]]) && cerca(dos.final, 10000 * 142 / 118), `dos símbolos: compra en d18 a 118 (${txt(dos.ops)})`)
  const sem = corre(plan({ filtros: { filas: [fSem] } }))
  ok(txt(sem.ops) === txt([[per[16], 114]]) && cerca(sem.final, 10000 * 142 / 114), `una fila semanal sobre velas diarias: compra en d16 a 114 (${txt(sem.ops)})`)
  const efSem = Es.definicionEfectiva(plan({ velas: 'semanales', filtros: { filas: [fSem] } }).piezas[0]), efDia = Es.definicionEfectiva(plan({ filtros: { filas: [fSem] } }).piezas[0])
  ok(efDia.filtrosExtra[0].velas === 'semanal' && !('velas' in efSem.filtrosExtra[0]), 'con el plan en velas semanales, la fila ya es semanal de por sí (sin la marca)')

  // ── 4 · Los filtros propios de la estrategia: se respetan o no se aplican ──
  const CON_PROPIO = { ...ESTADO, filtroMercado: { ticker: 'REF', si: sobre(3) } }
  ok(Es.tieneFiltrosPropios(CON_PROPIO) && !Es.tieneFiltrosPropios(ESTADO) && Es.propiosSeparables(CON_PROPIO), 'la estrategia del ejemplo lleva un filtro propio, separable')
  const respeta = corre(plan({ filtros: { filas: [fREF2] } }, CON_PROPIO)), soloPlan = corre(plan({ filtros: { propios: false, filas: [fREF2] } }, CON_PROPIO)), ninguno = corre(plan({ filtros: { propios: false, filas: [] } }, CON_PROPIO))
  ok(txt(respeta.ops) === txt([[per[18], 118]]), `respetando el propio (REF) y añadiendo REF2: d18 a 118 (${txt(respeta.ops)})`)
  const fREF3 = { quien: 'REF', si: sobre(3) }, soloOtro = corre(plan({ filtros: { propios: false, filas: [fREF3] } }, { ...ESTADO, filtroMercado: { ticker: 'REF2', si: sobre(3) } }))
  ok(txt(soloOtro.ops) === txt([[per[14], 110]]), `sin el propio (REF2) y solo con el del plan (REF): d14 a 110 (${txt(soloOtro.ops)})`)
  ok(txt(soloPlan.ops) === txt([[per[18], 118]]) && txt(ninguno.ops) === txt([[per[11], 104]]), 'sin el propio y sin filas: como la estrategia sin filtros, d11 a 104')
  ok(!('filtroMercado' in Es.definicionEfectiva(plan({ filtros: { propios: false, filas: [] } }, CON_PROPIO).piezas[0])) && 'filtroMercado' in CON_PROPIO, 'la foto guardada no se toca: solo cambia la que usa el plan')

  // ── 5 · Validación ──
  ok(P.validaPlan(plan({ filtros: { filas: [{ quien: 'ref', si: sobre(3) }] } })).length >= 1 && P.validaPlan(plan({ filtros: 'x' })).length >= 1 && P.validaPlan(plan({ filtros: { propios: 'no' } })).length >= 1, 'una fila mal hecha o un campo raro: el plan lo dice y no se calcula')

  // ── 6 · La pantalla: ajustes, plan guardado y la petición de la lista ──
  const est = foto(), a0 = { ...Pa.AJUSTES_PLAN, activo: 'VAL', ocioso: 'LIQUIDEZ' }
  ok(Pa.AJUSTES_PLAN.filtros === null && Pa.filtrosDelPlan(a0) === null && Pa.filtrosDelPlan({ filtros: { propios: true, filas: [] } }) === null && !('filtros' in Pa.planDe(a0, est).piezas[0]), 'sin filtros del plan, la pieza no lleva el campo (el plan guardado es el de siempre)')
  const aF = { ...a0, filtros: { propios: false, filas: [fREF, fSem] } }, pF = Pa.planDe(aF, est)
  ok(txt(pF.piezas[0].filtros) === txt({ propios: false, filas: [fREF, fSem] }) && txt(Pa.ajustesDe(pF).filtros) === txt(pF.piezas[0].filtros) && Pa.ajustesDe(Pa.planDe(a0, est)).filtros === null, 'los filtros se guardan con el plan y vuelven iguales al abrirlo')
  ok(txt(Pa.planDe({ ...a0, filtros: { filas: [fREF] } }, est).piezas[0].filtros) === txt({ filas: [fREF] }), 'respetando los propios, no se guarda «propios»')
  const PD = require(R + '/components/backtesting/PlanPorDentro.js'), Api = require(R + '/pages/api/plan.js')
  const aL = (filtros) => ({ ...a0, donde: 'lista', lista: Li.mergeLista({ simbolos: ['VAL', 'REF'], modo: 'compartido' }), filtros })
  const cSin = PD.peticionPorDentro({ a: aL(null), estrategia: est }), cCon = PD.peticionPorDentro({ a: aL({ filas: [fREF2] }), estrategia: est })
  ok(cSin.strategyId === 'x' && !('definicionEditor' in cSin) && !('paramsEditor' in cSin), 'la petición de la lista sin filtros del plan: la de siempre, con el id de la estrategia')
  ok(cCon.strategyId === null && txt(cCon.definicionEditor) === txt({ ...ESTADO, filtrosExtra: [fREF2] }) && txt(cCon.paramsEditor) === '{}' && txt({ ...cCon, strategyId: 'x', definicionEditor: undefined, paramsEditor: undefined }) === txt(cSin), 'con filtros del plan: la misma petición, pero con la estrategia efectiva dentro (sin id)')
  const pSin = Pa.planDe(aL(null), est), pCon = Pa.planDe(aL({ filas: [fREF2] }), est)
  ok(Api.errorCuerpoLista(pSin, pSin.piezas[0], cSin) === null && Api.errorCuerpoLista(pCon, pCon.piezas[0], cCon) === null && Api.errorCuerpoLista(pCon, pCon.piezas[0], cSin) !== null && Api.errorCuerpoLista(pSin, pSin.piezas[0], cCon) !== null, '/api/plan solo acepta la petición con los filtros de su plan')

  console.log(`plan-filtros: ${fallos ? `${fallos} fallos` : 'todo bien'}`)
  process.exit(fallos ? 1 : 0)
})().catch(e => { console.error(e); process.exit(2) })
