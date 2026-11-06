// scripts/comprobaciones/plan-lista.js — «Una lista» en el bloque del plan (fase 3 de «el plan con lista», docs/builder.md §80). Las corre comunes.sh. Termina en 0 si todo va bien.
// 1 · lib/planes/lista.js: valores de partida (los de una instalación nueva del Backtesting, filtros vacíos) y saneado campo a campo.
// 2 · Un plan de «Una acción» es EXACTAMENTE el de antes (planDe frente a la versión anterior, VIEJO, con 300 ajustes al azar) y sin `donde` ni `lista`.
// 3 · Un plan con lista: se valida, va y vuelve idéntico (ajustesDe → planDe), y el motor y /api/plan lo rechazan con el aviso (todavía no se calcula).
// 4 · La pantalla del paso 3 (renderToString y montada con estado en domFalso.js): con lista salen las piezas del Backtesting, el aviso de la prueba y ningún cálculo.
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://falso.invalid'; process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'clave-falsa-de-la-prueba'
const path = require('path')
const C0 = require('./cargador'), R = C0.RAIZ, D = require('./domFalso')
if (!process.env.VIEJO) { console.error('Falta VIEJO: la carpeta con la copia de la versión anterior (la hace comunes.sh).'); process.exit(2) }
const V = path.resolve(process.env.VIEJO)
let fallos = 0
const ok = (c, t) => { console.log(`${c ? 'OK  ' : 'MAL '} ${t}`); if (!c) fallos++ }
const EMA = { tipo: 'editor', motor: 1, formato: 1, nombre: 'EMA2', stops: [{ id: 'inicial', pct: 8, tipo: 'porcentaje', motivo: 'stop' }],
  entrada: { orden: { tipo: 'apertura' }, senal: { c: 'cruza', de: { c: 'precioVsMedia', p: { lado: 'encima', tipo: 'EMA', periodo: '$ema' } } } },
  salidas: [{ si: { c: 'cruza', de: { c: 'precioVsMedia', p: { lado: 'debajo', tipo: 'EMA', periodo: '$ema' } } }, tipo: 'condicion', motivo: 'cruce_bajista', precio: 'apertura' }],
  parametros: { lista: [{ max: 400, min: 2, paso: 1, tipo: 'entero', nombre: 'ema', defecto: 20, ventana: true, descripcion: 'Periodo de la EMA' }], version: 1, restricciones: [] } }

;(async () => {
  D.pon(); await C0.prepara(); C0.registra(R); C0.registra(V)
  const Li = require(R + '/lib/planes/lista.js'), Pa = require(R + '/lib/builder/planPantalla.js'), PaV = require(V + '/lib/builder/planPantalla.js'), Pl = require(R + '/lib/planes/plan.js'), Lt = require(R + '/lib/lotesLab.js')
  const est = { id: 'x', name: 'Cruce de medias 50/200', definition: EMA, params: { ema: 2 } }

  // ── 1 · Valores de partida y saneado ──
  const d0 = Li.mergeLista(null)
  ok(Lt.jsonCanonico(d0) === Lt.jsonCanonico(Li.LISTA_DEFECTO), 'mergeLista(null) = LISTA_DEFECTO')
  ok(d0.universo === 'manual' && d0.simbolos.length === 0 && d0.modo === 'concentrado' && d0.maxPosiciones === 4 && d0.prioridad === 'alfabetico' && d0.criterioUso === 'filtro' && d0.momentumN === 20 && d0.rsWindow === 63 && d0.calculoPrioridad === 2,
    `los de una instalación nueva del Backtesting (${d0.modo}, máx. ${d0.maxPosiciones}, ${d0.prioridad}, ${d0.criterioUso}, ${d0.momentumN}, ${d0.rsWindow})`)
  ok(Array.isArray(d0.filtros) && d0.filtros.length === 0, 'los filtros empiezan sin ninguno (en el Backtesting vienen con «Benchmark > EMA 10» encendido)')
  const s1 = Li.mergeLista({ simbolos: ['AAPL', 'MSFT', 'AAPL', 7, 'mal símbolo'], maxPosiciones: '6', momentumN: 999, modo: 'raro', prioridad: 'momentum', pesos: { AAPL: '60', MSFT: 40, NVDA: 10 }, universo: 'ndx_mom_20', filtros: [{ tipo: 'indiceEma', ambito: 'mercado', activo: true, params: { periodo: 200 } }] })
  ok(s1.simbolos.join() === 'AAPL,MSFT', `símbolos sin repetir y válidos (${s1.simbolos})`)
  ok(s1.maxPosiciones === 6 && s1.momentumN === 20 && s1.modo === 'concentrado' && s1.prioridad === 'momentum', `cada campo por su cuenta: «6» → 6, 999 → 20, «raro» → concentrado, momentum se queda`)
  ok(Lt.jsonCanonico(s1.pesos) === Lt.jsonCanonico({ AAPL: 60, MSFT: 40 }), `pesos solo de los símbolos de la lista (${JSON.stringify(s1.pesos)})`)
  ok(s1.universo === 'ndx_mom_20' && s1.filtros.length === 1 && s1.filtros[0].activo && s1.filtros[0].params.periodo === 200, 'universo y filtros guardados tal cual (saneados por lib/filtros.js)')
  ok(Lt.jsonCanonico(Li.mergeLista(s1)) === Lt.jsonCanonico(s1), 'mergeLista de una lista ya saneada no cambia nada')
  ok(Li.validaLista(d0).some(e => e.includes('al menos un valor')), 'sin valores: «elige al menos un valor de la lista»')
  ok(Li.validaLista({ ...d0, universo: 'ndx_vol_10', modo: 'slots' }).some(e => e.includes('Capital concentrado')), 'Nasdaq-100 con slots: solo «Capital concentrado»')
  ok(Li.validaLista({ ...d0, universo: 'ndx_vol_10' }).length === 0, 'Nasdaq-100 con concentrado y sin símbolos: vale (los pone el universo)')

  // ── 2 · «Una acción»: el plan de siempre ──
  let semilla = 41827; const azar = () => (semilla = (semilla * 16807) % 2147483647) / 2147483647
  const elige = (xs) => xs[Math.floor(azar() * xs.length)]
  let iguales = 0, sinClaves = 0
  for (let k = 0; k < 300; k++) {
    const a = { ...PaV.AJUSTES_PLAN, activo: elige(['AAPL', 'MSFT', 'NVDA']), periodo: elige(['todo', 'p1', 'p2', 'otras']), capital: Math.round(azar() * 50000), aportacion: elige([0, 300, 1000]), sube: azar() < 0.5, ocioso: elige(['LIQUIDEZ', 'QQQ', 'GLD']),
      apalancamiento: elige([1, 2, 3]), impuestos: elige(['ES-ahorro', 'ninguno']), comisionTipo: elige(['pct', 'fija', 'pctMin']), comision: elige([0, 0.1, 0.25]) }
    const nuevo = Pa.planDe({ ...a, donde: 'accion', lista: Li.LISTA_DEFECTO }, est), viejo = PaV.planDe(a, est)
    if (Lt.jsonCanonico(nuevo) === Lt.jsonCanonico(viejo)) iguales++
    if (!('donde' in nuevo.piezas[0]) && !('lista' in nuevo.piezas[0])) sinClaves++
  }
  ok(iguales === 300, `planDe con «Una acción»: idéntico a la versión anterior en ${iguales}/300 ajustes al azar`)
  ok(sinClaves === 300, `y sin \`donde\` ni \`lista\` en la pieza (${sinClaves}/300)`)
  const pAccion = Pa.planDe(Pa.AJUSTES_PLAN, est), aAccion = Pa.ajustesDe(pAccion)
  ok(aAccion.donde === 'accion' && Lt.jsonCanonico(aAccion.lista) === Lt.jsonCanonico(Li.LISTA_DEFECTO), 'ajustesDe de un plan de antes: «Una acción» y la lista de partida')

  // ── 3 · Con lista ──
  const aL = { ...Pa.AJUSTES_PLAN, donde: 'lista', lista: { ...Li.LISTA_DEFECTO, simbolos: ['AAPL', 'MSFT', 'NVDA'], modo: 'slots', maxPosiciones: '5' } }
  const pL = Pa.planDe(aL, est)
  ok(pL.piezas[0].donde === 'lista' && pL.piezas[0].lista.simbolos.join() === 'AAPL,MSFT,NVDA' && pL.piezas[0].lista.maxPosiciones === 5, 'la pieza lleva donde: lista y la lista saneada («5» → 5)')
  ok(Pl.validaPlan(pL).length === 0, `el plan con lista es válido ${Pl.validaPlan(pL).join(' ')}`)
  const pL2 = Pa.planDe(Pa.ajustesDe(pL), est)
  ok(Lt.jsonCanonico(pL2) === Lt.jsonCanonico(pL), 'ida y vuelta: planDe(ajustesDe(plan)) idéntico')
  const pVacio = Pa.planDe({ ...aL, lista: { ...aL.lista, simbolos: [] } }, est)
  ok(Pl.validaPlan(pVacio).some(e => e.includes('al menos un valor')), 'sin valores, el plan no es válido (no se puede guardar)')
  ok(Pl.validaPlan({ ...pL, piezas: [{ ...pL.piezas[0], donde: 'otra' }] }).some(e => e.includes('una acción o una lista')), 'un `donde` desconocido no es válido')
  let lanza = null; try { Pl.ejecutaPlan(pL, { fechas: ['2016-01-04'] }) } catch (e) { lanza = e.message }
  ok(lanza === Pl.AVISO_LISTA_SIN_MOTOR, `el motor no calcula un plan con lista: «${lanza}»`)
  const textoL = Pa.textoParaClaudePlan({ ajustes: aL, estrategia: est, plan: pL, cifras: null, estado: null, resultadoPrueba: null, version: 'V' })
  ok(textoL.includes('Dónde: una lista, lista manual de 3 valores (AAPL, MSFT, NVDA) · reparto: Slots iguales · filtros: ninguno'), '«Copiar para Claude» dice la lista, el reparto y los filtros')

  // ── 4 · La pantalla ──
  const React = require(path.join(R, 'node_modules', 'react')), { renderToString } = require(path.join(R, 'node_modules', 'react-dom', 'server')), RDC = require(path.join(R, 'node_modules', 'react-dom', 'client'))
  const BP = require(R + '/components/BuilderPlan.js').default, PA = require(R + '/lib/pruebaAzar.js')
  const datosLista = { watchlist: [{ symbol: 'AAPL', name: 'Apple', list_ids: [1] }, { symbol: 'MSFT', name: 'Microsoft', list_ids: [1] }, { symbol: 'NVDA', name: 'Nvidia', list_ids: [2] }], wlLists: [{ id: 1, name: 'Tecnológicas' }, { id: 2, name: 'Chips' }], rankingData: {} }
  const prueba = (veredicto) => [{ id: 1, estrategia_id: 'x', estrategia_foto: PA.fotoDe(est), valor: 'AAPL', velas: 'diarias', creada_en: '2026-10-30T10:00:00Z', resultado: { veredicto } }]
  let calculos = 0
  const props = (o = {}, ini = {}) => ({ estrategias: [est], estrategiaId: 'x', datosLista, deps: { ctx: null, calcula: async () => { calculos++; throw new Error('no debe calcular') } }, inicial: { planes: [], pestana: 'n1', simbolos: ['AAPL'], pruebas: prueba('pasa'), resultadoPrueba: { periodos: [] }, ...ini }, ...o })
  const html = (ini) => renderToString(React.createElement(BP, props({}, ini))).split('<!-- -->').join('')
  const hA = html({ ajustes: { activo: 'AAPL' } })
  ok(!hA.includes('data-lista') && hA.includes('✓ Pasa el azar') && !hA.includes('MODO DE ASIGNACIÓN'), 'con «Una acción»: sin piezas de lista y «✓ Pasa el azar» como siempre')
  ok(!/disabled=""[^>]*>Una lista</.test(hA) && !hA.includes('Llegará cuando los pasos 1 y 2'), '«Una lista» ya se puede pulsar')
  const hL = html({ ajustes: aL })
  ok(['data-lista="valores"', 'data-lista="reparto"', 'data-lista="filtros"', 'Lista manual', 'MODO DE ASIGNACIÓN', 'FILTROS DE MERCADO', 'FILTROS DEL ACTIVO', 'data-sin-motor-lista'].every(t => hL.includes(t)), 'con lista: universo, selector, reparto, filtros y el aviso de «Tu dinero»')
  ok(hL.includes('3 seleccionados') && hL.includes('Tecnológicas') && hL.includes('Nvidia'), 'el selector con la Watchlist: «3 seleccionados», sus listas y sus valores')
  ok(hL.includes('✓ Pasa en AAPL · la lista aún no tiene prueba') && !hL.includes('✓ Pasa el azar'), '«✓ Pasa en AAPL · la lista aún no tiene prueba»')
  ok(!hL.includes('SELECCIÓN MÚLTIPLE'), 'el reparto, un solo modo (sin «compara modos»)')
  ok(html({ ajustes: aL, pruebas: prueba('noPasa') }).includes('✕ No pasa en AAPL · la lista aún no tiene prueba'), '«✕ No pasa en AAPL · la lista aún no tiene prueba»')
  ok(html({ ajustes: aL, pruebas: [] }).includes('Sin prueba · la lista aún no tiene prueba'), '«Sin prueba · la lista aún no tiene prueba»')
  // Montada, con estado: de «Una acción» a «Una lista», marcar valores, cambiar el reparto, añadir un filtro, y volver.
  const m = D.monta(React.createElement(BP, props({}, { ajustes: { activo: 'AAPL' } })), RDC); await D.espera(60)
  const boton = (t) => m.raiz.busca(n => n.nodeName === 'BUTTON' && n.textContent === t)
  D.pulsa(boton('Una lista')); await D.espera(30)
  ok(m.raiz.conAtributo('data-lista', 'valores').length === 1 && m.raiz.textContent.includes('0 seleccionados'), 'al pulsar «Una lista»: el selector, con 0 seleccionados')
  const fila = (sim) => m.raiz.busca(n => n.nodeName === 'DIV' && typeof D.propsDe(n)?.onMouseOver === 'function' && n.todos(c => c.textContent === sim && c.childNodes.length === 1 && c.childNodes[0].nodeType === 3).length > 0)
  D.pulsa(fila('MSFT')); await D.espera(10); D.pulsa(fila('NVDA')); await D.espera(10)
  ok(m.raiz.textContent.includes('2 seleccionados'), `marcar MSFT y NVDA: 2 seleccionados`)
  const modo = m.raiz.busca(n => n.nodeName === 'DIV' && n.textContent === 'Slots iguales' && typeof D.propsDe(n).onClick === 'function')
  D.pulsa(modo); await D.espera(10)
  ok(m.raiz.textContent.includes('Slots iguales') && !m.raiz.textContent.includes('Máx. activos simultáneos'), 'elegir «Slots iguales» (sin «Máx. activos simultáneos», que es de concentrado)')
  ok(calculos === 0 && m.raiz.conAtributo('data-sin-motor-lista').length === 1 && !m.raiz.conAtributo('data-calculando').length, 'con lista no se pide ningún cálculo')
  D.pulsa(boton('Una acción')); await D.espera(700)
  ok(!m.raiz.conAtributo('data-lista').length, 'de vuelta a «Una acción»: sin piezas de lista')
  ok(calculos >= 1, 'y vuelve a calcular el plan de siempre')
  D.pulsa(boton('Una lista')); await D.espera(10)
  ok(m.raiz.textContent.includes('2 seleccionados'), 'y al volver a «Una lista», la lista sigue ahí (2 seleccionados)')
  m.quita()

  console.log(fallos ? `FALLOS: ${fallos}` : 'plan-lista: todo bien')
  process.exit(fallos ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
