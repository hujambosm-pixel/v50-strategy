// scripts/comprobaciones/comparar-planes.js — «Comparar planes» (docs/builder.md §128): las cuentas de lib/builder/comparaPlanes.js a mano
// con el motor, y la pantalla montada de verdad en Node (domFalso.js) dentro del paso 3. Las corre comunes.sh. Termina en 0 si todo va bien.
//   1 · Cifras: las de la tarjeta = las de la pestaña (cifrasPlan); «Crecimiento de 100 €» acaba en 100 × (1 + CAGR)^años; con QQQ plano, 100.
//   2 · Qué se compara: dinero distinto → ⚠ en aportado, final, impuestos y comisiones; periodo distinto → también CAGR, TIR y caída; los tramos, siempre.
//   3 · La respuesta de /api/plan con el VL de QQQ y SPY (§128) no cambia ninguna cifra de la pestaña.
//   4 · Montada: tarjetas, avisos, ★, fichas, QQQ/SPY, modos del gráfico, «Volver al plan», «Abrir», y los dos tonos;
//       §135: sin cabecera de pasos ni pestañas al comparar, y «Ocultar ▲» (una línea por plan, mismas cifras, gráfico de 470 px).
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://falso.invalid'; process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'clave-falsa-de-la-prueba'
const path = require('path')
const C0 = require('./cargador'), R = C0.RAIZ, D = require('./domFalso')
let fallos = 0
const ok = (c, t) => { console.log(`${c ? 'OK  ' : 'MAL '} ${t}`); if (!c) fallos++ }
const cerca = (a, b, tol = 1e-9) => Number.isFinite(a) && Math.abs(a - b) <= tol * Math.max(1, Math.abs(b))
const dia = (f, n) => new Date(Date.parse(f + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10)
const EMA = { tipo: 'editor', motor: 1, formato: 1, nombre: 'EMA2', stops: [{ id: 'inicial', pct: 8, tipo: 'porcentaje', motivo: 'stop' }],
  entrada: { orden: { tipo: 'apertura' }, senal: { c: 'cruza', de: { c: 'precioVsMedia', p: { lado: 'encima', tipo: 'EMA', periodo: '$ema' } } } },
  salidas: [{ si: { c: 'cruza', de: { c: 'precioVsMedia', p: { lado: 'debajo', tipo: 'EMA', periodo: '$ema' } } }, tipo: 'condicion', motivo: 'cruce_bajista', precio: 'apertura' }],
  parametros: { lista: [{ max: 400, min: 2, paso: 1, tipo: 'entero', nombre: 'ema', defecto: 20, ventana: true, descripcion: 'Periodo de la EMA' }], version: 1, restricciones: [] } }
// Los mismos datos a mano que planes-pantalla.js: la acción va de 100 a 114 (el plan entra a 105 y sale a 114); QQQ y SPY, planos en 100.
const PERIODO = [[100, 100, 100, 100], [100, 105, 100, 104], [105, 108, 104, 107], [107, 111, 106, 110], [110, 113, 109, 112], [112, 116, 111, 115],
  [115, 119, 114, 118], [118, 121, 117, 120], [120, 120, 112, 113], [114, 115, 113, 114], [114, 115, 113, 114], [114, 115, 113, 114]]
const datosMano = (fechasPeriodo) => {
  const cal = Array.from({ length: 300 }, (_, i) => dia('2019-01-01', i)), fechas = [...cal, ...fechasPeriodo]
  const vela = (date, [open, high, low, close]) => ({ date, open, high, low, close, volume: 1000 })
  const TEST = fechas.map((f, i) => vela(f, i < 300 ? [100, 100, 100, 100] : PERIODO[i - 300])), OCI = fechas.map(f => vela(f, [50, 50, 50, 50]))
  const plano = fechas.map(date => ({ date, open: 100, close: 100 }))
  return { fechas, qqq: plano, spy: plano, etf: fechas.map(() => null), qqqVelas: plano, velas: { TEST, OCI } }
}
const ESTR = { id: 'x', name: 'EMA2', definition: EMA, params: { ema: 2 } }
const planMano = (fs, extra = {}) => ({ tipo: 'plan', formato: 1, calculo: 1, dinero: { capitalInicial: 10000, aportaciones: { frecuencia: 'ninguna' }, extraordinarias: [] },
  piezas: [{ id: 'e', tipo: 'estrategia', estrategia: ESTR, activo: 'TEST', peso: 1, ocioso: 'OCI', aportacionDentro: 'espera', apalancamiento: 1 }],
  reparto: { aportacionesA: 'pesos', rebalanceo: { calendario: 'nunca', banda: null } }, impuestos: { regimen: 'ES-ahorro', reglaDosMeses: true }, costes: null, periodo: { desde: fs[0], hasta: fs[fs.length - 1] }, ...extra })

;(async () => {
  D.pon(); await C0.prepara(); C0.registra(R)
  const P = require(R + '/lib/planes/plan.js'), E = require(R + '/lib/planes/evalua.js'), Pa = require(R + '/lib/builder/planPantalla.js'), K = require(R + '/lib/builder/comparaPlanes.js')
  // La respuesta de /api/plan, como la da ahora (§128: patrimonio y VL de las cuatro referencias). sinVlRefs: como antes (QQQ y SPY sin VL).
  const conResp = (plan, datos, sinVlRefs = false) => { const e0 = E.evaluaPlan(plan, datos, { detalle: true }), ej0 = Object.fromEntries(E.referenciasDe(plan).filter(x => ['OCIOSO_LIQUIDEZ', 'ACTIVO', 'QQQ', 'SPY'].includes(x.id)).map(x => [x.id, P.ejecutaPlan(x.plan, datos, { detalle: false })]))
    return { evaluacion: e0, curvas: Object.fromEntries(Object.entries(ej0).map(([id, r]) => [id, sinVlRefs && ['QQQ', 'SPY'].includes(id) ? { patrimonio: r.serie.map(x => x.patrimonio) } : { patrimonio: r.serie.map(x => x.patrimonio), vl: r.serie.map(x => x.vl) }])), ordenesReferencias: Object.fromEntries(Object.entries(ej0).map(([id, r]) => [id, r.costes.ordenes])) } }

  // ── 1 · Cifras ──
  const fs = [...Array.from({ length: 11 }, (_, i) => dia('2020-03-02', i)), '2030-03-02'], anios = (Date.parse('2030-03-02') - Date.parse('2020-03-02')) / 864e5 / 365.25
  const pA = planMano(fs), dA = datosMano(fs), rA = conResp(pA, dA), cA = K.cifrasComparacion(rA, pA), sA = Pa.cifrasPlan(rA, pA)
  const FIN_PLAN = 10000 * 114 / 105 - (10000 / 105 * 9) * 0.19   // 10.694,29 €: compra a 105, vende a 114, 19 % de 857,14 €
  ok(cerca(cA.valores.final, FIN_PLAN) && cA.valores.final === sA.seis.final, `«Tienes al final» = el de la pestaña = 10.694,29 € (obtenido ${cA.valores.final})`)
  ok(['aportado', 'twr', 'tir', 'impuestos', 'costes'].every(k => cA.valores[k] === sA.seis[k]) && cA.valores.caida === sA.seis.caidaPct && cA.valores.t1 === (sA.tramos[0]?.cagr ?? null), 'aportado, CAGR, TIR, caída, impuestos, comisiones y tramos: los de la pestaña')
  const finC = cA.crec[cA.crec.length - 1]
  ok(cerca(finC, 100 * FIN_PLAN / 10000, 1e-9), `«Crecimiento de 100 €» sin aportaciones: 100 × final / 10.000 = 106,94 € (obtenido ${finC.toFixed(4)})`)
  ok(cerca(finC / 100, Math.pow(1 + cA.valores.twr, anios), 1e-9), 'y = 100 × (1 + CAGR del plan)^años')
  ok(cA.refs.QQQ && cA.refs.QQQ.crec.every(x => cerca(x, 100)) && cerca(cA.refs.QQQ.twr, 0, 1e-12) && cerca(cA.refs.SPY.final, 10000), 'QQQ y SPY planos en 100: su línea se queda en 100 €, CAGR 0 %, final 10.000 €')
  ok(cA.refs.QQQ.twr === sA.alternativas.find(x => x.id === 'QQQ').twr && cA.refs.SPY.final === sA.alternativas.find(x => x.id === 'SPY').final, 'el Buy&Hold de cada tarjeta = la fila de «Sin estrategia» de su pestaña (mismo dinero y periodo)')
  // Con 300 €/mes, el final cambia pero el crecimiento de 100 € sigue siendo (1 + CAGR)^años: no depende de cuánto se aporta.
  const pB = planMano(fs, { dinero: { capitalInicial: 10000, aportaciones: { importe: 300, frecuencia: 'mensual', crecimientoAnual: 0 }, extraordinarias: [] } }), rB = conResp(pB, datosMano(fs)), cB = K.cifrasComparacion(rB, pB)
  ok(cB.valores.aportado > cA.valores.aportado && cerca(cB.crec[cB.crec.length - 1] / 100, Math.pow(1 + cB.valores.twr, anios), 1e-9), `con aportaciones: aporta más (${cB.valores.aportado} €) y el crecimiento de 100 € sigue siendo (1 + CAGR)^años`)
  ok(K.puntosFrente(0.1507, 0.183) === '−3,23' && K.puntosFrente(0.2, 0.15) === '+5,00' && K.puntosFrente(null, 0.1) === '—', 'los puntos frente a QQQ/SPY: 15,07 % − 18,30 % = −3,23; 20 % − 15 % = +5,00')

  // ── 2 · Qué se compara ──
  const fila = (id, nombre, plan) => ({ id, nombre, plan })
  let dif = K.diferencias([fila(1, 'A', pA), fila(2, 'B', pB)])
  ok(!dif.dinero && dif.periodo && dif.costes, 'A sin aportaciones y B con 300 €/mes: dinero distinto, mismo periodo y costes')
  const f = (k) => K.FILAS_COMPARAR.find(x => x.k === k)
  ok(['aportado', 'final', 'impuestos', 'costes'].every(k => !K.comparable(f(k), dif)) && ['twr', 'tir', 'caida', 't1', 't2'].every(k => K.comparable(f(k), dif)), 'dinero distinto: no se comparan aportado, final, impuestos ni comisiones; sí CAGR, TIR, caída y tramos')
  let av = K.avisosComparar(dif)
  ok(av.length === 1 && av[0].id === 'dinero' && av[0].detalle === '«A»: 10.000 €, sin aportaciones · «B»: 10.000 € + 300 €/mes', `el aviso dice qué mete cada uno (${av[0]?.detalle})`)
  const mej = K.mejores([cA.valores, cB.valores], dif)
  ok(!('final' in mej) && !('aportado' in mej) && mej.twr === Math.max(cA.valores.twr, cB.valores.twr), 'la ★ no se da en «Tienes al final» (no se compara) y sí en el CAGR')
  const fs2 = [...Array.from({ length: 11 }, (_, i) => dia('2021-01-01', i)), '2022-12-31'], pC = planMano(fs2)
  dif = K.diferencias([fila(1, 'A', pA), fila(3, 'C', pC)])
  ok(dif.dinero && !dif.periodo && ['twr', 'tir', 'caida', 'final'].every(k => !K.comparable(f(k), dif)) && ['t1', 't2'].every(k => K.comparable(f(k), dif)), 'periodo distinto: tampoco CAGR, TIR ni caída; los tramos sí')
  av = K.avisosComparar(dif)
  ok(av.length === 1 && av[0].id === 'periodo' && av[0].detalle === '«A»: 02/03/2020–02/03/2030 · «C»: 2021–2022', `el aviso del periodo (${av[0]?.detalle})`)
  const pD = planMano(fs, { costes: { comisionPct: 0.1, comisionMinEur: 0, horquillaPct: { QQQ: 0, ETF: 0, SPY: 0 } } })
  dif = K.diferencias([fila(1, 'A', pA), fila(4, 'D', pD)])
  ok(dif.dinero && dif.periodo && !dif.costes && K.avisosComparar(dif).map(x => x.id).join() === 'costes' && K.FILAS_COMPARAR.every(x => K.comparable(x, dif)), 'solo la comisión distinta: un aviso, y todo se compara')
  { const fI = K.FILAS_COMPARAR.find(x => x.k === 'impuestos'), fT = K.FILAS_COMPARAR.find(x => x.k === 'twr'), fF = K.FILAS_COMPARAR.find(x => x.k === 'final')
    ok(K.avisoCelda(fI, dif)?.startsWith('⚠ No tienen los mismos impuestos o comisiones') && K.avisoCelda(fT, dif) === null && K.avisoCelda(fF, dif) === null, '§137: solo la comisión distinta: ⚠ con su aviso en impuestos y comisiones; nada en CAGR ni final') }
  { const t = K.textoRef({ id: 'QQQ', nombre: 'Buy&Hold QQQ' }, planMano(['2016-01-01', '2025-12-31']), { final: 64625.4, twr: 0.17454 }, 0.20537)
    // A mano: 20,537 − 17,454 = 3,083 → «+3,08».
    ok(t.includes('20,537 % − 17,454 % = +3,08') && t.includes('64.625 €') && t.includes('10.000 €, sin aportaciones') && t.includes('2016–2025') && !t.includes('cada aportación'), '§137: textoRef: dinero, periodo, final y la resta de puntos que cuadra a mano (20,537 − 17,454 = +3,08)') }
  ok(K.textoDinero(pB) === '10.000 € + 300 €/mes' && K.textoDinero(pA) === '10.000 €, sin aportaciones' && K.textoPeriodo({ periodo: { desde: '2016-01-01', hasta: '2025-12-31' } }) === '2016–2025', 'textos: «10.000 € + 300 €/mes», «10.000 €, sin aportaciones», «2016–2025»')
  ok(K.textoBloque(pA) === 'EMA2 · una acción, TEST · ocioso OCI', `el bloque de la tarjeta (${K.textoBloque(pA)})`)
  ok(K.modoGrafico(null, { dinero: false, periodo: true }) === 'crec' && K.modoGrafico(null, { dinero: true, periodo: true }) === 'eur' && K.modoGrafico('eur', { dinero: false, periodo: true }) === 'eur', 'el gráfico: «Crecimiento de 100 €» por defecto si el dinero o el periodo no coinciden; si no, «Tu dinero en €»')
  const calc = [{ id: 1, nombre: 'A', color: 'a', c: cA }, { id: 2, nombre: 'B', color: 'b', c: cB }], refs = [{ id: 'QQQ', nombre: 'Buy&Hold QQQ', color: 'q' }]
  let g = K.lineasGrafico(calc, { modo: 'eur', dif: { dinero: false, periodo: true }, refs })
  ok(g.lineas.length === 2 && g.refsFuera, 'en € con dinero distinto: sin QQQ/SPY (cada plan tendría los suyos)')
  g = K.lineasGrafico(calc, { modo: 'crec', dif: { dinero: false, periodo: true }, refs })
  ok(g.lineas.length === 3 && g.lineas[2].ref && !g.refsFuera, 'en «Crecimiento de 100 €»: con QQQ')
  const t = K.tablaAnios(calc, refs)
  ok(t.cols.length === 3 && t.filas.length === cA.anios.length && t.filas[0].valores[0] === cA.anios[0].r, 'Año a año: una columna por plan y por referencia, una fila por año')
  ok(JSON.stringify(K.elegidosIniciales([{ id: 1 }, { id: 2 }, { id: 3 }], [3, 9], [1])) === '[3]' && JSON.stringify(K.elegidosIniciales([{ id: 1 }, { id: 2 }, { id: 3 }], [9], [2, 1])) === '[2,1]' && JSON.stringify(K.elegidosIniciales(Array.from({ length: 6 }, (_, i) => ({ id: i + 1 })), null, [])) === '[1,2,3,4]', 'los elegidos al entrar: los recordados que existen; si no, los abiertos; si no, los 4 primeros')
  ok(JSON.stringify(K.alterna([1, 2], 2)) === '[1]' && JSON.stringify(K.alterna([1], 1)) === '[1]' && JSON.stringify(K.alterna([1, 2, 3, 4], 5)) === '[1,2,3,4]' && JSON.stringify(K.alterna([1], 3)) === '[1,3]', 'fichas: quitar (nunca el último), poner (como mucho 4)')

  // ── 3 · El VL de QQQ y SPY en la respuesta no cambia ninguna cifra de la pestaña ──
  const sinVl = Pa.cifrasPlan(conResp(pA, dA, true), pA), conVl = Pa.cifrasPlan(rA, pA), sinVlB = Pa.cifrasPlan(conResp(pB, datosMano(fs), true), pB), conVlB = Pa.cifrasPlan(rB, pB)
  ok(JSON.stringify(sinVl) === JSON.stringify(conVl) && JSON.stringify(sinVlB) === JSON.stringify(conVlB), 'cifrasPlan: idéntico con y sin el VL de QQQ y SPY (regla de oro: ninguna cifra cambia)')

  // ── 4 · Montada dentro del paso 3 ──
  const React = require(path.join(R, 'node_modules', 'react')), RDC = require(path.join(R, 'node_modules', 'react-dom', 'client')), h = React.createElement
  const BPlan = require(R + '/components/BuilderPlan.js').default
  const filas = [{ id: 1, nombre: 'Plan A', huella: 'h', created_at: '2026-10-01T10:00:00Z', updated_at: '2026-10-02T10:00:00Z', plan: pA },
    { id: 2, nombre: 'Plan B', huella: 'h', created_at: '2026-10-01T10:00:00Z', updated_at: '2026-10-03T10:00:00Z', plan: pB },
    { id: 3, nombre: 'Plan C', huella: 'h', created_at: '2026-10-01T10:00:00Z', updated_at: '2026-10-04T10:00:00Z', plan: pC }]
  const resp = new Map([[JSON.stringify(pA), rA], [JSON.stringify(pB), rB], [JSON.stringify(pC), conResp(pC, datosMano(fs2))]])
  const pedidos = []
  const calcula = async (p) => { pedidos.push(JSON.stringify(p)); await D.espera(5); const r = resp.get(JSON.stringify(p)); if (!r) throw new Error('plan desconocido'); return r }
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => [], text: async () => '[]' })
  const monta = (o = {}) => D.monta(h(BPlan, { estrategias: [ESTR], deps: { ctx: null, calcula }, tema: o.tema || 'oscuro', inicial: { planes: filas, orden: ['g1', 'g2'], pestana: 'g1', simbolos: ['TEST'], pruebas: [], anchoPestanas: 1400, comparando: true, compararElegidos: [1, 2], ...o.inicial } }), RDC)
  let m = monta(); await D.espera(80)
  const q = (k, val) => m.raiz.conAtributo(k, val)
  ok(q('data-comparar').length === 1 && q('data-columna', 'izquierda').length === 0, 'al comparar, se ve la comparación en lugar del plan')
  ok(q('data-tarjeta-plan').map(n => n.getAttribute('data-tarjeta-plan')).join() === '1,2', 'una tarjeta por plan elegido (A y B)')
  ok(q('data-valor', 'final').every(n => n.getAttribute('data-comparable') === 'no' && n.textContent.startsWith('⚠')) && q('data-valor', 'twr').every(n => n.getAttribute('data-comparable') === 'si'), '«Tienes al final» con ⚠ (dinero distinto); el CAGR se compara')
  // §137: sin franja amarilla; el aviso, en el tooltip del ⚠ de cada cifra que toca.
  ok(q('data-avisos-comparar').length === 0 && q('data-valor', 'final').every(n => (n.getAttribute('title') || '').startsWith('⚠ No meten el mismo dinero («Plan A»')) && q('data-valor', 'twr').every(n => !n.getAttribute('title')) && q('data-valor', 't1').every(n => !n.getAttribute('title')), '§137: sin franja arriba; «No meten el mismo dinero», en el tooltip del ⚠ del final (el CAGR y los tramos, sin ⚠)')
  ok(q('data-mejor', 'si').every(n => ['twr', 'tir', 'caida', 't1', 't2'].includes(n.getAttribute('data-valor'))) && q('data-mejor', 'si').length >= 1, 'la ★, solo en filas que se comparan')
  ok(q('data-ref-fila', 'QQQ').length === 2 && q('data-ref-fila', 'SPY').length === 2 && q('data-puntos', 'QQQ')[0].textContent.startsWith('('), 'QQQ y SPY en cada tarjeta, con los puntos que les saca')
  { const fq = q('data-ref-fila', 'QQQ')[0], t = fq.getAttribute('title') || ''
    ok(fq.textContent.startsWith('CAGR Buy&Hold QQQ') && t.includes('MISMO dinero') && t.includes('Su CAGR') && t.includes(q('data-puntos', 'QQQ')[0].textContent.slice(1, -1)), '§137: «CAGR Buy&Hold QQQ», con sus cuentas en el tooltip (y los mismos puntos que se ven)') }
  ok(q('data-prueba-plan', 'sinPrueba').length === 2 && q('data-prueba-plan', 'sinPrueba')[0].textContent === 'Estrategia: sin prueba del paso 2', 'la línea de la prueba del paso 2 de cada plan')
  ok(q('data-modo', 'crec')[0]?.getAttribute('aria-pressed') === 'true' && q('data-linea').length === 4, 'el gráfico: «Crecimiento de 100 €» (dinero distinto), 2 planes + QQQ + SPY')
  ok(q('data-anio').length > 0 && q('data-tabla', 'anios-comparar').length === 1, '«Año a año»')
  // §135: al comparar, sin la cabecera de pasos ni las pestañas de planes; «Ocultar ▲» pliega las tarjetas a una línea y agranda el gráfico.
  ok(q('data-ruta').length === 0 && q('data-planes').length === 0, '§135: al comparar, sin la cabecera de pasos ni las pestañas de planes')
  const altoGraf = () => Number(q('data-grafico', 'comparar')[0]?.getAttribute('height'))
  const finTarjetas = q('data-valor', 'final').map(n => n.textContent).join('|'), cagrTarjetas = q('data-valor', 'twr').map(n => n.textContent).join('|')
  ok(altoGraf() === 330 && q('data-resumen-planes').length === 0, '§135: de entrada, tarjetas abiertas y gráfico de 330 px')
  D.pulsa(q('data-boton', 'plegar')[0]); await D.espera(10)
  ok(q('data-tarjeta-plan').length === 0 && q('data-linea-plan').map(n => n.getAttribute('data-linea-plan')).join() === '1,2' && altoGraf() === 470, '§135: «Ocultar ▲»: una línea por plan y el gráfico de 470 px')
  ok(q('data-valor', 'final').map(n => n.textContent).join('|') === finTarjetas && q('data-valor', 'twr').map(n => n.textContent).join('|') === cagrTarjetas, '§135: plegado, las mismas cifras (con su ⚠ y su ★) que en las tarjetas')
  ok(q('data-puntos', 'QQQ').length === 2 && q('data-puntos', 'SPY').length === 2 && q('data-abrir-plan').length === 2 && q('data-boton', 'plegar')[0].textContent.startsWith('Mostrar'), '§135: plegado, puntos frente a QQQ y SPY, «Abrir» y «Mostrar todas las cifras ▼»')
  D.pulsa(q('data-boton', 'plegar')[0]); await D.espera(10)
  ok(q('data-tarjeta-plan').length === 2 && q('data-resumen-planes').length === 0 && altoGraf() === 330, '§135: «Mostrar todas las cifras ▼» vuelve a las tarjetas')
  D.pulsa(q('data-elige-ref', 'SPY')[0]); await D.espera(10)
  ok(q('data-ref-fila', 'SPY').length === 0 && q('data-linea').length === 3, 'quitar SPY: fuera de las tarjetas y del gráfico')
  D.pulsa(q('data-modo', 'eur')[0]); await D.espera(10)
  ok(q('data-linea').length === 2 && q('data-nota-grafico')[0].textContent.startsWith('⚠'), '«Tu dinero en €» con dinero distinto: sin QQQ y con el aviso')
  D.pulsa(q('data-elige-plan', '3')[0]); await D.espera(80)
  ok(q('data-tarjeta-plan').length === 3 && (q('data-valor', 'twr')[0].getAttribute('title') || '').startsWith('⚠ No tienen el mismo periodo') && q('data-valor', 'twr').every(n => n.getAttribute('data-comparable') === 'no'), 'añadir C (otro periodo): 3 tarjetas, aviso del periodo y el CAGR ya no se compara')
  const nPedidos = pedidos.length
  D.pulsa(q('data-elige-plan', '3')[0]); await D.espera(20); D.pulsa(q('data-elige-plan', '3')[0]); await D.espera(40)
  ok(pedidos.length === nPedidos, `quitar y volver a poner C no repite el cálculo (${pedidos.length} pedidos)`)
  D.pulsa(q('data-elige-plan', '1')[0]); D.pulsa(q('data-elige-plan', '2')[0]); await D.espera(10)
  ok(q('data-tarjeta-plan').length === 1, 'nunca se queda sin ninguno: quitar A y B deja C')
  D.pulsa(q('data-boton', 'volver-plan')[0]); await D.espera(30)
  ok(q('data-comparar').length === 0 && q('data-columna', 'izquierda').length === 1, '«← Volver al plan»: vuelve el plan abierto')
  ok(q('data-ruta').length > 0 && q('data-planes').length === 1, '§135: al volver, la cabecera de pasos y las pestañas de planes vuelven')
  const b = q('data-boton', 'comparar')[0]
  ok(b && !b.hasAttribute('disabled'), 'el botón «Comparar planes», activo (3 planes guardados)')
  D.pulsa(b); await D.espera(40)
  ok(q('data-comparar').length === 1 && q('data-tarjeta-plan').map(n => n.getAttribute('data-tarjeta-plan')).join() === '3', 'y vuelve a la comparación con lo elegido')
  D.pulsa(q('data-abrir-plan', '3')[0]); await D.espera(60)
  // El plan abierto (A, hecho a mano y no con planDe) cuenta como cambiado: antes de abrir otro, pregunta, como siempre.
  ok(m.raiz.textContent.includes('Tienes cambios sin guardar'), '«Abrir» con cambios sin guardar en la pestaña abierta: pregunta antes')
  D.pulsa(q('data-salida', 'salir')[0]); await D.espera(60)
  ok(q('data-comparar').length === 0 && q('data-pestana', 'g3').length === 1 && q('data-pestana', 'g3')[0].getAttribute('aria-selected') === 'true', '«Abrir»: el plan en su pestaña')
  m.quita(); await D.espera(5)
  m = monta({ tema: 'claro' }); await D.espera(60)
  const raiz = q('data-comparar')[0]
  ok(raiz.getAttribute('data-tema') === 'claro' && String(raiz.getAttribute('style') || '').includes('--sc-fondo') || raiz.getAttribute('data-tema') === 'claro', 'el tono claro llega a la comparación (data-tema="claro")')
  m.quita(); await D.espera(5)

  console.log(fallos ? `\n${fallos} FALLOS` : '\nTodo bien')
  process.exit(fallos ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
