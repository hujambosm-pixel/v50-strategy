// scripts/comprobaciones/plan-filtros-pantalla.js — LA PANTALLA de los filtros del plan (docs/builder.md §152): la caja «Filtros · cuándo
// se puede comprar» del bloque (components/FiltrosDelPlan.js, lib/builder/filtrosPlan.js). Las corre comunes.sh. Termina en 0 si todo va bien.
// 1 · Puro: fila de pantalla ↔ fila guardada (ida y vuelta), sin cambios = null, todas las condiciones del catálogo valen como filtro.
// 2 · A mano (las 30 sesiones de plan-filtros.js): la fila hecha CON LA PANTALLA («REF: cierre sobre su SMA (3)») compra en d14 a 110
//     y acaba en 10.000 × 142 / 110 = 12.909,09 €, igual que la fila escrita a mano en el plan.
// 3 · La caja montada (domFalso.js): sin filtros propios, con ellos (la pregunta), el interruptor, de quién, las velas, quitar, repetida.
// 4 · Dentro del plan: la caja sale, el plan se calcula con la fila y sigue siendo de «una acción»; la línea «tal como la usa este plan».
process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://arnes.invalid'; process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'clave-falsa-del-arnes'
const path = require('path')
const C0 = require('./cargador'), R = C0.RAIZ, D = require('./domFalso')
let fallos = 0
const ok = (c, t) => { console.log(`${c ? 'OK  ' : 'MAL '} ${t}`); if (!c) fallos++ }
const cerca = (a, b, tol = 1e-9) => Number.isFinite(a) && Math.abs(a - b) <= tol * Math.max(1, Math.abs(b))
const txt = (x) => JSON.stringify(x)
const hasta = async (cond, max = 20000) => { const t0 = Date.now(); do { await D.espera(5); try { if (cond()) { await D.espera(5); return true } } catch (_) {} } while (Date.now() - t0 < max); return false }

;(async () => {
  D.pon(); await C0.prepara(); C0.registra(R)
  const React = require(path.join(R, 'node_modules', 'react')), RDC = require(path.join(R, 'node_modules', 'react-dom', 'client')), h = React.createElement
  const F = require(R + '/lib/builder/filtrosPlan.js'), T = require(R + '/lib/builder/tarjetas.js'), Pa = require(R + '/lib/builder/planPantalla.js'), P = require(R + '/lib/planes/plan.js'), Es = require(R + '/lib/planes/estrategia.js')
  const Caja = require(R + '/components/FiltrosDelPlan.js').default, BPlan = require(R + '/components/BuilderPlan.js').default
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => [], text: async () => '[]' })
  const texto = (n) => n.nodeType === 3 ? (n.nodeValue ?? n.data ?? '') : (n.childNodes || []).map(texto).join('')
  const sobre = (tipo, periodo, lado = 'encima') => ({ c: 'precioVsMedia', p: { tipo, periodo, lado } })
  const ESTADO = { tipo: 'editor', motor: 1, formato: 1, nombre: 'P', entrada: { orden: { tipo: 'apertura' }, senal: sobre('SMA', 3) }, stops: [{ id: 'inicial', tipo: 'porcentaje', pct: 50, motivo: 'stop' }], salidas: [] }
  const CON = { ...ESTADO, filtroMercado: { ticker: 'QQQ', si: sobre('SMA', 200) }, entrada: { orden: { tipo: 'apertura' }, senal: { c: 'Y', de: [sobre('EMA', 50), sobre('SMA', 3)] } }, diseno: { filtrosValor: 1 } }
  const est = (definition = ESTADO) => ({ id: 'x', name: 'Sigue la tendencia', definition, params: { intervalo: 'diario' } })
  const claves = T.GRUPOS.flatMap(g => g.conds)
  const cMedia = claves.find(c => { const f = T.filaNueva(c); return f.cond.c === 'precioVsMedia' && !f.env && f.cond.p.lado === 'encima' })

  // ── 1 · Puro ──
  ok(F.guardaFiltros([], true) === null && txt(F.guardaFiltros([], false)) === txt({ propios: false, filas: [] }), 'sin filas y respetando los propios: null (el plan de siempre); sin filas y sin respetarlos: { propios: false, filas: [] }')
  ok(F.filasDePantalla(null).length === 0 && F.respetaPropios(null) === true && F.respetaPropios({ propios: false, filas: [] }) === false, 'sin el ajuste: ninguna fila y los propios se respetan')
  const nueva = F.filaNuevaPlan(cMedia)
  ok(!!cMedia && nueva.quien === 'QQQ' && nueva.velas === null && nueva.cond.c === 'precioVsMedia', `una fila nueva del catálogo nace en el Nasdaq-100 (QQQ) y con las velas del plan (${cMedia})`)
  const soloValor = claves.filter(c => T.soloDelValor(c))
  ok(soloValor.length > 0 && soloValor.every(c => F.filaNuevaPlan(c).quien === 'valor'), `las ${soloValor.length} condiciones que solo se pueden mirar en el valor nacen en «Este valor»`)
  let idaVuelta = 0, validas = 0, malas = []
  for (const c of claves) for (const velas of [null, 'semanal']) {
    const f = { ...F.filaNuevaPlan(c), velas }, g = F.guardaFiltros([f], true), v = F.filasDePantalla(g)
    if (v.length === 1 && !v[0].rara && txt(v[0]) === txt(f) && txt(F.guardaFiltros(v, true)) === txt(g) && txt(Object.keys(g.filas[0])) === txt(velas ? ['quien', 'si', 'velas'] : ['quien', 'si'])) idaVuelta++
    const e = P.validaPlan(Pa.planDe({ ...Pa.AJUSTES_PLAN, activo: 'VAL', filtros: g }, est()))
    if (!e.length) validas++; else malas.push(`${c}: ${e[0]}`)
  }
  ok(idaVuelta === claves.length * 2, `fila de pantalla → guardada → pantalla: idéntica en las ${claves.length} condiciones del catálogo, con velas del plan y semanales (${idaVuelta}/${claves.length * 2})`)
  ok(validas === claves.length * 2, `y el plan con cada una como filtro es válido (${validas}/${claves.length * 2}) ${malas.slice(0, 3).join(' | ')}`)
  const conNo = { ...nueva, env: 'NO', quien: 'valor' }, conCruce = { ...nueva, env: 'cruza', quien: '^GSPC', velas: 'semanal' }
  const g2 = F.guardaFiltros([conNo, conCruce], false)
  ok(g2.propios === false && g2.filas[0].si.c === 'NO' && g2.filas[1].si.c === 'cruza' && g2.filas[1].quien === '^GSPC' && g2.filas[1].velas === 'semanal' && txt(F.filasDePantalla(g2)) === txt([conNo, conCruce]), 'con NO, con «cruza», otro símbolo y semanal: va y vuelve igual')
  ok(F.filasDePantalla({ filas: [{ quien: 'QQQ', si: { c: 'Y', de: [sobre('SMA', 3), sobre('SMA', 5)] } }] })[0].rara === true && txt(F.guardaFiltros(F.filasDePantalla({ filas: [{ quien: 'QQQ', si: { c: 'Y', de: [sobre('SMA', 3), sobre('SMA', 5)] } }] }))) === txt({ filas: [{ quien: 'QQQ', si: { c: 'Y', de: [sobre('SMA', 3), sobre('SMA', 5)] } }] }), 'una fila que no es del creador se conserva tal cual')
  const ops = F.opcionesQuienPlan('GLD').map(o => o.v)
  ok(txt(ops) === txt(['valor', 'QQQ', 'SPY', 'IWM', 'DIA', 'GLD', F.OTRO]) && txt(F.opcionesQuienPlan('QQQ').map(o => o.v)) === txt(['valor', 'QQQ', 'SPY', 'IWM', 'DIA', F.OTRO]), `de quién: este valor, los 4 índices, el símbolo que ya lleve y «Otro símbolo…» (${ops.join(' ')})`)
  // Los filtros propios
  const pSin = F.filtrosPropios(est()), pCon = F.filtrosPropios(est(CON))
  ok(!pSin.hay && pCon.hay && pCon.separables && pCon.filas.length === 2 && pCon.frases.length === 2 && pCon.frases[0].includes('QQQ') && pCon.frases[0].includes('200'), `los propios de la estrategia: ${pCon.frases.join(' | ')}`)
  const igual = { cond: sobre('SMA', 200), env: null, quien: 'QQQ', velas: null }
  ok(txt(F.filasRepetidas([{ ...nueva, quien: 'SPY' }, igual], pCon, true)) === txt([1]) && F.filasRepetidas([igual], pCon, false).length === 0 && F.filasRepetidas([{ ...igual, velas: 'semanal' }], pCon, true).length === 0 && F.filasRepetidas([{ ...igual, quien: 'SPY' }], pCon, true).length === 0,
    'fila repetida: solo la idéntica a una de la estrategia, con los propios respetados y las mismas velas')
  const uso = (o) => F.usoDeLaEstrategia({ nombre: 'Sigue la tendencia', velasEst: 'diarias', velasPlan: 'diarias', donde: 'en AAPL', propios: pSin, respeta: true, nPlan: 0, ...o })
  ok(uso({}).map(p => p.t).join(' · ') === 'Sigue la tendencia · velas diarias · en AAPL · sin filtros' && uso({}).every(p => !p.azul), `la línea, sin cambios: «${uso({}).map(p => p.t).join(' · ')}», nada en azul`)
  const u2 = uso({ velasPlan: 'semanales', propios: pCon, respeta: false, nPlan: 1 })
  ok(u2.map(p => p.t).join(' · ') === 'Sigue la tendencia · velas semanales (creada en diarias) · en AAPL · sin sus 2 filtros propios · + 1 filtro del plan' && txt(u2.map(p => !!p.azul)) === txt([false, true, false, true, true]), `con cambios: «${u2.map(p => p.t).join(' · ')}», en azul lo que cambia`)
  ok(uso({ propios: pCon, nPlan: 2 }).map(p => p.t).join(' · ') === 'Sigue la tendencia · velas diarias · en AAPL · con sus 2 filtros · + 2 filtros del plan', 'respetando los propios y con dos del plan')
  for (const [n, t] of Object.entries({ AYUDA_FILTROS_PLAN: F.AYUDA_FILTROS_PLAN, AYUDA_PROPIOS: F.AYUDA_PROPIOS, AYUDA_VELAS_FILA: F.AYUDA_VELAS_FILA })) ok(t.includes('Ejemplo'), `${n} lleva un ejemplo`)
  ok(F.AYUDA_FILTROS_PLAN.includes('«de un momento»') && F.AYUDA_FILTROS_PLAN.includes('«de estado»'), 'el «?» de los filtros explica la señal «de un momento» y la «de estado»')

  // ── 2 · A mano: la fila hecha con la pantalla calcula lo mismo que la escrita a mano ──
  const habiles = (desde, n, atras = false) => { const out = []; for (let d = new Date(desde + 'T00:00:00Z'); out.length < n; d = new Date(d.getTime() + (atras ? -864e5 : 864e5))) { const w = d.getUTCDay(); if (w >= 1 && w <= 5) out.push(d.toISOString().slice(0, 10)) } return atras ? out.reverse() : out }
  const per = habiles('2020-03-02', 30), cal = habiles('2020-02-28', 300, true), fechas = [...cal, ...per]
  const serie = (cierres) => fechas.map((date, k) => { const i = k - 300, c = i < 0 ? cierres(0) : cierres(i), o = i <= 0 ? c : cierres(i - 1); return { date, open: o, high: Math.max(o, c), low: Math.min(o, c), close: c, volume: 1000 } })
  const VAL = serie(i => i < 10 ? 100 : 104 + 2 * (i - 10)), REF = serie(i => i < 13 ? 50 : 52 + 2 * (i - 13)), REFW = serie(i => i < 10 ? 50 : 60 + 10 * (Math.floor(i / 5) - 2))
  const plano = fechas.map(date => ({ date, open: 100, close: 100 }))
  const datos = () => ({ fechas, qqq: plano, spy: plano, etf: fechas.map(() => null), qqqVelas: plano, velas: { VAL, REF, REFW } })
  const aBase = { ...Pa.AJUSTES_PLAN, activo: 'VAL', periodo: 'otras', desde: per[0], hasta: per[29], capital: 10000, aportacion: 0, ocioso: 'LIQUIDEZ', impuestos: 'ninguno', comision: 0 }
  const corre = (filtros) => { const p = Pa.planDe({ ...aBase, filtros }, est()), e = P.validaPlan(p); if (e.length) throw new Error(e.join(' ')); const r = P.ejecutaPlan(p, datos()); return { ops: r.estrategias.e.operaciones.map(o => [o.entryDate, o.entryPrice]), final: r.valorNeto, p } }
  const conNumeros = (f, cambios) => Object.entries(cambios).reduce((x, [k, v]) => T.conNumero(x, k, v), f)
  const filaRef = { ...conNumeros(F.filaNuevaPlan(cMedia), { tipo: 'SMA', periodo: 3 }), quien: 'REF' }
  const sin = corre(null), con = corre(F.guardaFiltros([filaRef], true)), aMano = corre({ filas: [{ quien: 'REF', si: sobre('SMA', 3) }] })
  ok(txt(sin.ops) === txt([[per[11], 104]]) && cerca(sin.final, 10000 * 142 / 104), `sin filtros: compra en d11 a 104 y acaba en ${(10000 * 142 / 104).toFixed(2)} € (${sin.final})`)
  ok(!('filtros' in sin.p.piezas[0]), 'y el plan guardado no lleva el campo `filtros`')
  ok(txt(con.ops) === txt([[per[14], 110]]) && cerca(con.final, 10000 * 142 / 110), `con la fila de la pantalla «REF: cierre sobre su SMA (3)»: compra en d14 a 110 y acaba en 12.909,09 € (${con.final})`)
  ok(txt(con.ops) === txt(aMano.ops) && con.final === aMano.final, 'igual que la misma fila escrita a mano en el plan')
  const semW = corre(F.guardaFiltros([{ ...conNumeros(F.filaNuevaPlan(cMedia), { tipo: 'SMA', periodo: 2 }), quien: 'REFW', velas: 'semanal' }], true))
  ok(txt(semW.ops) === txt([[per[16], 114]]) && cerca(semW.final, 10000 * 142 / 114), `con una fila semanal hecha en la pantalla: compra en d16 a 114 (${txt(semW.ops)})`)
  ok(con.p.piezas[0].donde === undefined && Es.cambiaFiltros(con.p.piezas[0]), 'con filtros y un valor, el plan sigue siendo de «una acción»')

  // ── 3 · La caja, montada ──
  const valores = [{ simbolo: 'GLD', nombre: 'Oro' }, { simbolo: '^GSPC', nombre: 'S&P 500' }, { simbolo: 'QQQ', nombre: 'Nasdaq-100' }]
  const monta = async (estrategia, filtros0 = null, velasPlan = 'diarias', inicial = null) => {
    const st = { filtros: filtros0, llamadas: [] }
    const el = () => h(Caja, { estrategia, filtros: st.filtros, velasPlan, valores, inicial, onCambia: (f) => { st.llamadas.push(f); st.filtros = f; m.pinta(el()) } })
    const m = D.monta(el(), RDC); await D.espera(30)
    return { m, st, r: m.raiz }
  }
  const tiene = (r, k) => r.busca(n => n.getAttribute(k) != null)
  const boton = (r, k, v) => r.busca(n => n.getAttribute(k) === v)
  const elige = async (n, v) => { D.propsDe(n).onChange({ target: { value: v } }); await D.espera(20) }
  // a) sin filtros propios
  let x = await monta(est())
  ok(!boton(x.r, 'data-caja', 'sin-propios') && !boton(x.r, 'data-caja', 'estrategia') && !texto(x.r).includes('no lleva filtros propios') && !texto(x.r).includes('Ninguno.') && !!boton(x.r, 'data-caja', 'plan'), '§154: sin filtros propios, solo la caja azul: ni frase ni «Ninguno.»')
  ok(!!x.r.busca(n => n.nodeName === 'BUTTON' && n.getAttribute('aria-label') === 'Ayuda: Filtros · cuándo se puede comprar'), 'el «?» de la caja de filtros')
  D.pulsa(boton(x.r, 'data-boton', 'anadir-filtro')); await D.espera(30)
  ok(!boton(document.body, 'data-pregunta', 'filtros-propios') && !!document.body.busca(n => n.getAttribute('data-catalogo-plan') != null), 'sin propios, «+ Añadir filtro» abre el catálogo sin preguntar')
  const cat = document.body.busca(n => n.getAttribute('data-catalogo-plan') != null)
  ok(cat.conAtributo('data-cond-plan').length === claves.length, `el catálogo entero: ${cat.conAtributo('data-cond-plan').length} condiciones (${claves.length})`)
  const busca = cat.busca(n => n.getAttribute('data-buscar') === 'catalogo-plan')
  D.escribe(busca, 'caida'); await D.espera(30)
  const cat2 = document.body.busca(n => n.getAttribute('data-catalogo-plan') != null)
  ok(cat2.conAtributo('data-cond-plan').length > 0 && cat2.conAtributo('data-cond-plan').length < claves.length && cat2.conAtributo('data-cond-plan').some(n => texto(n).toLowerCase().includes('caída')), 'buscar «caida» (sin acento) encuentra «caída»')
  ok(!!cat2.busca(n => n.getAttribute('data-limpiar-busqueda') != null), 'el buscador lleva su ✕ para limpiar')
  D.pulsa(cat2.busca(n => n.getAttribute('data-limpiar-busqueda') != null)); await D.espera(30)
  D.pulsa(document.body.busca(n => n.getAttribute('data-cond-plan') === cMedia).busca(n => n.nodeName === 'BUTTON')); await D.espera(30)
  ok(x.st.llamadas.length === 1 && txt(x.st.filtros) === txt(F.guardaFiltros([F.filaNuevaPlan(cMedia)], true)) && !('propios' in x.st.filtros), `elegir una condición añade la fila (${txt(x.st.filtros)})`)
  ok(!document.body.busca(n => n.getAttribute('data-catalogo-plan') != null) && x.r.conAtributo('data-fila-plan').length === 1 && !tiene(x.r, 'data-sin-filtros'), 'el catálogo se cierra y la fila sale en la caja azul')
  // de quién, velas, número y quitar
  const fila0 = () => x.r.busca(n => n.getAttribute('data-fila-plan') === '0')
  const sel = (et) => fila0().busca(n => n.nodeName === 'SELECT' && n.getAttribute('aria-label') === et)
  ok(txt(sel('De quién').todos(n => n.nodeName === 'OPTION').map(texto)) === txt(['Este valor', ...T.INDICES.map(i => i.nombre), 'Otro símbolo…']), 'el selector «De quién»: este valor, los cuatro índices y «Otro símbolo…»')
  await elige(sel('De quién'), 'SPY')
  ok(x.st.filtros.filas[0].quien === 'SPY', 'cambiar de quién: SPY')
  await elige(sel('De quién'), F.OTRO)
  ok(!!tiene(x.r, 'data-otro-simbolo') && x.st.filtros.filas[0].quien === 'SPY', '«Otro símbolo…» abre el buscador (y no cambia nada todavía)')
  const bus = tiene(x.r, 'data-otro-simbolo').busca(n => n.nodeName === 'INPUT')
  D.escribe(bus, 'oro'); await D.espera(30)
  const opcionOro = tiene(x.r, 'data-otro-simbolo').busca(n => n.getAttribute('data-opcion-valor') === 'GLD')
  if (opcionOro) D.propsDe(opcionOro).onMouseDown({ preventDefault() {} })
  await D.espera(30)
  ok(x.st.filtros.filas[0].quien === 'GLD' && !tiene(x.r, 'data-otro-simbolo') && sel('De quién').todos(n => n.nodeName === 'OPTION').some(o => (o.getAttribute('value') ?? D.propsDe(o).value) === 'GLD'), `elegido en el buscador (buscando «oro»): GLD (${x.st.filtros.filas[0].quien})`)
  await elige(sel('Con qué velas se mira'), 'semanal')
  ok(x.st.filtros.filas[0].velas === 'semanal', 'con qué velas se mira: semanales → la fila guarda velas: semanal')
  await elige(sel('Con qué velas se mira'), 'diaria')
  ok(!('velas' in x.st.filtros.filas[0]), 'y de vuelta a diarias, sin la marca')
  const num = fila0().busca(n => n.nodeName === 'INPUT')
  D.escribe(num, '150'); await D.espera(30)
  ok(T.filaDe(x.st.filtros.filas[0].si).cond.p.periodo === 150, 'cambiar el número de la fila: 150')
  D.escribe(fila0().busca(n => n.nodeName === 'INPUT'), 'abc'); await D.espera(30)
  ok(fila0().busca(n => n.getAttribute('data-error-fila') != null) != null, 'un número mal escrito: la fila lo dice en rojo')
  D.pulsa(fila0().busca(n => n.nodeName === 'BUTTON' && n.getAttribute('aria-label') === 'Quitar esta condición')); await D.espera(30)
  ok(x.st.filtros === null && x.r.conAtributo('data-fila-plan').length === 0, 'quitar la única fila: el ajuste vuelve a null (el plan de siempre)')
  x.m.quita(); await D.espera(5)
  // b) con filtros propios: la pregunta
  x = await monta(est(CON))
  ok(!!boton(x.r, 'data-caja', 'estrategia') && x.r.conAtributo('data-propio').length === 2 && !!tiene(x.r, 'data-modo-propios') && x.r.busca(n => n.getAttribute('data-filtros-plan') != null).getAttribute('data-respeta') === 'si', 'con filtros propios: la caja morada con sus 2 filtros y «Se respetan / No se aplican»')
  D.pulsa(boton(x.r, 'data-boton', 'anadir-filtro')); await D.espera(30)
  const preg = () => boton(document.body, 'data-pregunta', 'filtros-propios')
  ok(!!preg() && texto(preg()).includes('«Sigue la tendencia» ya lleva filtros propios') && preg().todos(n => n.nodeName === 'BUTTON').map(texto).join('|') === 'Cancelar|Solo los del plan|Respetar los dos', 'al añadir el primer filtro, pregunta: Cancelar / Solo los del plan / Respetar los dos')
  D.pulsa(boton(preg(), 'data-respuesta', 'cancelar')); await D.espera(30)
  ok(!preg() && !document.body.busca(n => n.getAttribute('data-catalogo-plan') != null) && x.st.llamadas.length === 0, 'Cancelar: no pasa nada')
  D.pulsa(boton(x.r, 'data-boton', 'anadir-filtro')); await D.espera(30); D.pulsa(boton(preg(), 'data-respuesta', 'solo')); await D.espera(30)
  ok(x.st.llamadas.length === 0 && !!document.body.busca(n => n.getAttribute('data-catalogo-plan') != null), '«Solo los del plan» abre el catálogo (todavía sin cambiar nada)')
  D.pulsa(document.body.busca(n => n.getAttribute('data-cond-plan') === cMedia).busca(n => n.nodeName === 'BUTTON')); await D.espera(30)
  ok(x.st.filtros.propios === false && x.st.filtros.filas.length === 1 && x.r.busca(n => n.getAttribute('data-filtros-plan') != null).getAttribute('data-respeta') === 'no', 'al elegir la condición: la fila y propios: false (los de la estrategia, tachados)')
  D.pulsa(boton(x.r, 'data-boton', 'anadir-filtro')); await D.espera(30)
  ok(!preg() && !!document.body.busca(n => n.getAttribute('data-catalogo-plan') != null), 'el segundo filtro ya no pregunta')
  D.pulsa(boton(document.body, 'data-respuesta', 'cancelar-catalogo')); await D.espera(30)
  const modo = (t) => tiene(x.r, 'data-modo-propios').todos(n => n.nodeName === 'BUTTON').find(b => texto(b) === t)
  D.pulsa(modo('Se respetan')); await D.espera(30)
  ok(!('propios' in x.st.filtros) && x.st.filtros.filas.length === 1, 'el interruptor «Se respetan»: fuera propios: false, la fila sigue')
  x.m.quita(); await D.espera(5)
  x = await monta(est(CON))
  D.pulsa(boton(x.r, 'data-boton', 'anadir-filtro')); await D.espera(30); D.pulsa(boton(preg(), 'data-respuesta', 'ambos')); await D.espera(30)
  D.pulsa(document.body.busca(n => n.getAttribute('data-cond-plan') === cMedia).busca(n => n.nodeName === 'BUTTON')); await D.espera(30)
  ok(!('propios' in x.st.filtros) && x.st.filtros.filas.length === 1, '«Respetar los dos»: la fila, sin tocar los propios')
  x.m.quita(); await D.espera(5)
  // c) el interruptor sin filas
  x = await monta(est(CON))
  const modoC = (t) => tiene(x.r, 'data-modo-propios').todos(n => n.nodeName === 'BUTTON').find(b => texto(b) === t)
  D.pulsa(modoC('No se aplican')); await D.espera(30)
  ok(txt(x.st.filtros) === txt({ propios: false, filas: [] }), '«No se aplican» sin filas del plan: { propios: false, filas: [] } (la estrategia sin sus filtros)')
  D.pulsa(modoC('Se respetan')); await D.espera(30)
  ok(x.st.filtros === null, 'y «Se respetan» lo deja otra vez en null')
  x.m.quita(); await D.espera(5)
  // d) una fila repetida y el plan en semanales
  x = await monta(est(CON), F.guardaFiltros([igual], true))
  ok(!!x.r.busca(n => n.getAttribute('data-aviso-combinacion') === 'repetida') && texto(x.r).includes('Es igual que un filtro que ya lleva la estrategia'), 'una fila idéntica a una de la estrategia: aviso amarillo')
  x.m.quita(); await D.espera(5)
  x = await monta(est(CON), F.guardaFiltros([igual], false))
  ok(!x.r.busca(n => n.getAttribute('data-aviso-combinacion') === 'repetida'), 'sin respetar los propios, ya no es repetida')
  x.m.quita(); await D.espera(5)
  x = await monta(est(), F.guardaFiltros([nueva], true), 'semanales')
  ok(!x.r.busca(n => n.nodeName === 'SELECT' && n.getAttribute('aria-label') === 'Con qué velas se mira') && texto(tiene(x.r, 'data-velas-fila')) === 'velas semanales', 'con el plan en velas semanales, la fila no elige velas: «velas semanales»')
  x.m.quita(); await D.espera(5)
  // e) una estrategia cuyos filtros no se pueden separar
  const RARA = { ...ESTADO, filtroMercado: { ticker: 'QQQ', si: { c: 'O', de: [sobre('SMA', 200), sobre('SMA', 50)] } } }
  x = await monta(est(RARA))
  ok(F.filtrosPropios(est(RARA)).hay && !F.filtrosPropios(est(RARA)).separables && !!tiene(x.r, 'data-no-separables') && !tiene(x.r, 'data-modo-propios'), 'filtros propios que no se pueden separar: sin interruptor, «se respetan siempre»')
  D.pulsa(boton(x.r, 'data-boton', 'anadir-filtro')); await D.espera(30)
  ok(!preg() && !!document.body.busca(n => n.getAttribute('data-catalogo-plan') != null), 'y no pregunta al añadir')
  x.m.quita(); await D.espera(5)

  // ── 4 · Dentro del plan ──
  const pedidos = []
  const calcula = async (plan) => { pedidos.push(plan); const E = require(R + '/lib/planes/evalua.js'); const ev = E.evaluaPlan(plan, datos(), { detalle: true }); return { evaluacion: ev, curvas: {}, ordenesReferencias: {}, huella: 'h' } }
  const mp = D.monta(h(BPlan, { estrategias: [est()], estrategiaId: 'x', apiFetch: async () => ({ ok: true, status: 200, json: async () => ({}) }), deps: { ctx: null, calcula },
    inicial: { planes: [], simbolos: ['VAL', 'REF'], pruebas: [], huella: 'h', huellas: { x: 'h' }, ajustes: { ...aBase } } }), RDC)
  await hasta(() => pedidos.length >= 1)
  const cajaPlan = () => mp.raiz.busca(n => n.getAttribute('data-filtros-plan') != null), usoPlan = () => texto(mp.raiz.busca(n => n.getAttribute('data-uso-estrategia') != null))
  ok(!!cajaPlan() && pedidos.length >= 1 && !('filtros' in pedidos[0].piezas[0]), 'el plan enseña la caja de filtros y, sin filtros, pide el plan de siempre')
  ok(usoPlan() === 'La estrategia, tal como la usa este plan: Sigue la tendencia · velas diarias · en VAL · sin filtros', `la línea de arriba: «${usoPlan()}»`)
  D.pulsa(boton(cajaPlan(), 'data-boton', 'anadir-filtro')); await D.espera(30)
  D.pulsa(document.body.busca(n => n.getAttribute('data-cond-plan') === cMedia).busca(n => n.nodeName === 'BUTTON'))
  await hasta(() => pedidos.length >= 2)
  const ult = pedidos[pedidos.length - 1]
  ok(pedidos.length >= 2 && txt(ult.piezas[0].filtros) === txt(F.guardaFiltros([F.filaNuevaPlan(cMedia)], true)) && ult.piezas[0].donde === undefined && ult.piezas[0].activo === 'VAL', 'al añadir un filtro, el plan se vuelve a calcular con la fila y sigue siendo de «una acción» (no una lista de uno)')
  ok(usoPlan().endsWith('· sin filtros') === false && usoPlan().includes('+ 1 filtro del plan') && mp.raiz.conAtributo('data-cambia').length === 1, `y la línea lo dice en azul: «${usoPlan()}»`)
  mp.quita(); await D.espera(5)

  console.log(fallos ? `plan-filtros-pantalla: ${fallos} fallos` : 'plan-filtros-pantalla: todas bien')
  process.exit(fallos ? 1 : 0)
})().catch(e => { console.log('✗', e.stack || e.message || e); process.exit(1) })
