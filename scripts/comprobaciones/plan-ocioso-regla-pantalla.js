// scripts/comprobaciones/plan-ocioso-regla-pantalla.js — la PANTALLA de la regla del dinero ocioso (docs/builder.md §204; boceto
// bocetos/ocioso-con-regla.html): lo puro (la fila por defecto, «Así se lee», el paso a la pieza y la vuelta por los ajustes del plan,
// con un bloque y con varios) y el montaje con estado («Cuándo está dentro», la fila de entrada, «+ condición», velas semanales,
// «Si no se cumple» en otro símbolo, volver a «Siempre» y la liquidez, que la esconde). Las corre comunes.sh. Termina en 0 si todo da lo
// esperado.
process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://arnes.invalid'; process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'clave-falsa-del-arnes'
const C0 = require('./cargador'), R = C0.RAIZ, D = require('./domFalso')
let fallos = 0
const ok = (c, t) => { console.log(`${c ? 'OK  ' : 'MAL '} ${t}`); if (!c) fallos++ }
const EMA = { tipo: 'editor', motor: 1, formato: 1, nombre: 'EMA2', stops: [{ id: 'inicial', pct: 8, tipo: 'porcentaje', motivo: 'stop' }],
  entrada: { orden: { tipo: 'apertura' }, senal: { c: 'cruza', de: { c: 'precioVsMedia', p: { lado: 'encima', tipo: 'EMA', periodo: '$ema' } } } },
  salidas: [{ si: { c: 'cruza', de: { c: 'precioVsMedia', p: { lado: 'debajo', tipo: 'EMA', periodo: '$ema' } } }, tipo: 'condicion', motivo: 'cruce_bajista', precio: 'apertura' }],
  parametros: { lista: [{ max: 400, min: 2, paso: 1, tipo: 'entero', nombre: 'ema', defecto: 20, ventana: true, descripcion: 'Periodo de la EMA' }], version: 1, restricciones: [] } }
const FOTO = { id: 'x', name: 'Cruce de medias 50/200', definition: EMA, params: { ema: 2 } }

;(async () => {
  D.pon()
  await C0.prepara(); C0.registra(R)
  const P = require(R + '/lib/planes/plan.js'), Pa = require(R + '/lib/builder/planPantalla.js'), O = require(R + '/lib/builder/ociosoReglaPantalla.js'), G = require(R + '/lib/builder/reglasPesos.js'), Lt = require(R + '/lib/lotesLab.js')
  const J = (x) => Lt.jsonCanonico(x)

  // ── 1 · Lo puro ──
  {
    const r = O.reglaOciosoNueva('GLD')
    ok(J(r) === J({ filas: [{ quien: 'GLD', si: { c: 'precioVsMedia', p: { lado: 'encima', tipo: 'EMA', periodo: 200 } }, velas: 'diarias' }], siNo: 'LIQUIDEZ' }), 'la fila por defecto: «GLD: cierre sobre su EMA 200, velas diarias»; si no, en liquidez')
    ok(J(G.filasGuardadasRegla(r.filas.map(G.filaDePantallaRegla))) === J(r.filas), 'la fila pasa a pantalla y vuelve idéntica')
    const fr = O.fraseOciosoRegla(r, 'GLD', { estrategia: 'Cruce de medias 50/200' })
    ok(/^El dinero que no usa «Cruce de medias 50\/200» va al oro \(GLD\) solo mientras se cumpla: GLD .*200.*espera en liquidez; vuelve al oro \(GLD\)/.test(fr) && /lo coge esté donde esté\.$/.test(fr), `«Así se lee»: «${fr}»`)
    const fr2 = O.fraseOciosoRegla({ ...r, siNo: 'SHV', filas: [{ ...r.filas[0], velas: 'semanales' }] }, 'GLD', { multi: true })
    ok(/no usa ningún bloque/.test(fr2) && /va a SHV/.test(fr2) && /velas semanales/.test(fr2) && /Si un bloque necesita/.test(fr2), `«Así se lee» con varios bloques, SHV y semanales: «${fr2}»`)
    ok(J(O.conY([{ quien: 'A', union: 'O' }, { quien: 'B', union: 'O' }])) === J([{ quien: 'A' }, { quien: 'B', union: 'Y' }]), 'todas las filas con «Y» (la primera, sin unión)')
    // Un bloque
    const sin = { ...Pa.AJUSTES_PLAN, activo: 'AAPL', ocioso: 'GLD' }
    const p0 = Pa.planDe(sin, FOTO)
    ok(!('ociosoRegla' in p0.piezas[0]) && !('ociosoRegla' in Pa.ajustesDe(p0)), 'sin regla: la pieza no lleva «ociosoRegla» (el plan de siempre) y los ajustes tampoco')
    const a1 = { ...sin, ociosoRegla: r }, p1 = Pa.planDe(a1, FOTO)
    ok(J(p1.piezas[0].ociosoRegla) === J(r) && P.validaPlan(p1).length === 0, `con regla: va a la pieza tal cual y el motor la acepta (${P.validaPlan(p1).join(' ')})`)
    ok(J(Pa.planDe(Pa.ajustesDe(p1), FOTO)) === J(p1), 'ida y vuelta por los ajustes: el mismo plan')
    ok(!('ociosoRegla' in Pa.planDe({ ...a1, ocioso: 'LIQUIDEZ' }, FOTO).piezas[0]), 'con el ocioso en liquidez la regla no va al plan')
    ok(P.validaPlan(Pa.planDe({ ...a1, ociosoRegla: { ...r, siNo: 'GLD' } }, FOTO)).some(e => /distinto de donde espera/.test(e)), '«Si no se cumple» igual que el ocioso: el motor lo dice')
    // Varios bloques: la misma regla en todas las piezas de estrategia, ninguna en la de «Con pesos»
    const a2 = { ...a1, peso: 40, dineroLibre: 'tope', bloques: [{ ...Pa.bloqueNuevo('b2', 30, 'MSFT', 'x'), foto: FOTO }, { ...Pa.bloquePesosNuevo('b3', 30), pesos: [{ simbolo: 'SPY', peso: 100 }] }] }
    const p2 = Pa.planDe(a2, FOTO, null, () => FOTO)
    ok(p2.piezas.filter(z => z.tipo === 'estrategia').every(z => J(z.ociosoRegla) === J(r)) && !('ociosoRegla' in p2.piezas.find(z => z.tipo === 'pesos')) && P.validaPlan(p2).length === 0, `varios bloques: la misma regla en los dos de estrategia y ninguna en el de pesos (${P.validaPlan(p2).join(' ')})`)
    ok(J(Pa.planDe(Pa.ajustesDe(p2), FOTO, null, () => FOTO)) === J(p2), 'varios bloques: ida y vuelta por los ajustes, el mismo plan')
  }

  // ── 2 · La pantalla ──
  {
    const path = require('path'), React = require(path.join(R, 'node_modules', 'react')), RDC = require(path.join(R, 'node_modules', 'react-dom', 'client'))
    const BP = require(R + '/components/BuilderPlan.js').default
    let pedidos = []
    const props = (ini) => ({ estrategias: [FOTO], estrategiaId: 'x', datosLista: { watchlist: [{ symbol: 'AAPL', name: 'Apple', list_ids: [] }], wlLists: [], rankingData: {} },
      deps: { ctx: null, calcula: async (...xs) => { pedidos.push(xs); throw new Error('sin motor en la prueba') } }, inicial: { planes: [], pestana: 'n1', simbolos: ['AAPL', 'SPY', 'QQQ', 'GLD', 'SHV'], pruebas: [], resultadoPrueba: null, ...ini } })
    const hasta = async (cond, max = 20000) => { const t0 = Date.now(); do { await D.espera(5); try { if (cond()) { await D.espera(5); return true } } catch (_) {} } while (Date.now() - t0 < max); return false }
    const pieza = () => pedidos[pedidos.length - 1]?.[0]?.piezas?.find(z => z.tipo === 'estrategia')
    const grupo = (m, nombre) => m.raiz.conAtributo('aria-label', nombre)[0]
    const pulsaSeg = (m, nombre, k) => D.pulsa(grupo(m, nombre).conAtributo('type', 'button')[k])
    {
      const m = D.monta(React.createElement(BP, props({ ajustes: { activo: 'AAPL', ocioso: 'LIQUIDEZ' } })), RDC); await D.espera(60)
      ok(!m.raiz.conAtributo('data-cuando-ocioso').length, 'con el ocioso en liquidez no sale «Cuándo está dentro»')
      pulsaSeg(m, 'Dinero ocioso', 2); await hasta(() => m.raiz.conAtributo('data-cuando-ocioso', 'siempre').length === 1)
      ok(m.raiz.conAtributo('data-cuando-ocioso', 'siempre').length === 1 && !m.raiz.conAtributo('data-ocioso-regla').length, 'con oro: «Cuándo está dentro» en «Siempre», sin regla')
      await hasta(() => pieza()?.ocioso === 'GLD')
      ok(pieza()?.ocioso === 'GLD' && !('ociosoRegla' in (pieza() || {})), 'lo que se calcula: oro, sin regla')
      pulsaSeg(m, 'Cuándo está dentro el dinero ocioso', 1); await hasta(() => m.raiz.conAtributo('data-ocioso-regla', '1').length === 1 && !!pieza()?.ociosoRegla)
      const caja = () => m.raiz.conAtributo('data-ocioso-regla')[0]
      ok(caja().conAtributo('data-fila', 'precioVsMedia').length === 1 && /Está en oro \(GLD\) mientras se cumpla todo esto/.test(caja().textContent), '«Solo cuando lo diga una regla»: sale la fila de entrada')
      ok(J(pieza()?.ociosoRegla) === J(O.reglaOciosoNueva('GLD')), 'lo que se calcula lleva la regla por defecto')
      ok(/va al oro \(GLD\) solo mientras se cumpla/.test(caja().conAtributo('data-asi-se-lee-ocioso')[0]?.textContent || ''), '«Así se lee» debajo')
      D.escribe(caja().conAtributo('data-velas-ocioso')[0], 'semanales'); await hasta(() => pieza()?.ociosoRegla?.filas?.[0]?.velas === 'semanales')
      ok(pieza()?.ociosoRegla?.filas?.[0]?.velas === 'semanales', 'la condición en velas semanales')
      D.pulsa(caja().conAtributo('data-boton', 'anadir-condicion-ocioso')[0]); await hasta(() => m.raiz.conAtributo('data-catalogo-ocioso').length === 1)
      const cat = m.raiz.conAtributo('data-catalogo-ocioso')[0]
      ok(!!cat && cat.conAtributo('data-cond-ocioso', 'caidaDesdeMaximoHistorico').length === 1, '«+ condición» abre el catálogo')
      D.pulsa(cat.conAtributo('data-cond-ocioso', 'rsiNivel')[0]?.conAtributo('type', 'button')[0] || cat.conAtributo('data-cond-ocioso')[0].conAtributo('type', 'button')[0])
      await hasta(() => !m.raiz.conAtributo('data-catalogo-ocioso').length && pieza()?.ociosoRegla?.filas?.length === 2)
      ok(pieza()?.ociosoRegla?.filas?.[1]?.union === 'Y' && pieza().ociosoRegla.filas[1].quien === 'GLD' && /y además/.test(caja().textContent), 'segunda condición «y además», sobre el mismo símbolo')
      pulsaSeg(m, 'Si no se cumple', 1); await hasta(() => caja().conAtributo('data-sino-otro').length === 1)
      ok(caja().conAtributo('data-sino-otro').length === 1 && pieza()?.ociosoRegla?.siNo === 'LIQUIDEZ', '«En otro símbolo…» abre el buscador (y aún no cambia nada)')
      pulsaSeg(m, 'Si no se cumple', 0); await hasta(() => !caja().conAtributo('data-sino-otro').length)
      ok(!caja().conAtributo('data-sino-otro').length && pieza()?.ociosoRegla?.siNo === 'LIQUIDEZ', '«Espera en liquidez» lo cierra')
      pulsaSeg(m, 'Cuándo está dentro el dinero ocioso', 0); await hasta(() => !m.raiz.conAtributo('data-ocioso-regla').length && pieza() && !('ociosoRegla' in pieza()))
      ok(!m.raiz.conAtributo('data-ocioso-regla').length && !('ociosoRegla' in (pieza() || { ociosoRegla: 1 })), '«Siempre»: fuera la regla (el plan de siempre)')
      m.quita(); await D.espera(5)
    }
    {
      // Un plan con la regla y «si no se cumple» en SHV: se abre con ella, con el buscador puesto.
      const a = { activo: 'AAPL', ocioso: 'GLD', ociosoRegla: { ...O.reglaOciosoNueva('GLD'), siNo: 'SHV' } }
      const m = D.monta(React.createElement(BP, props({ ajustes: a })), RDC); await D.espera(60)
      await hasta(() => pieza()?.ociosoRegla?.siNo === 'SHV')
      ok(m.raiz.conAtributo('data-cuando-ocioso', 'regla').length === 1 && m.raiz.conAtributo('data-sino-otro').length === 1 && pieza()?.ociosoRegla?.siNo === 'SHV', 'con «si no se cumple» en SHV: se ve y se calcula con SHV')
      ok(/va a SHV/.test(m.raiz.conAtributo('data-asi-se-lee-ocioso')[0]?.textContent || ''), '«Así se lee» dice SHV')
      pulsaSeg(m, 'Dinero ocioso', 0); await hasta(() => !m.raiz.conAtributo('data-cuando-ocioso').length && pieza()?.ocioso === 'LIQUIDEZ')
      ok(!m.raiz.conAtributo('data-cuando-ocioso').length && pieza()?.ocioso === 'LIQUIDEZ' && !('ociosoRegla' in pieza()), 'al pasar el ocioso a liquidez, la regla no se ve ni se calcula')
      m.quita(); await D.espera(5)
    }
  }

  console.log(fallos ? `plan-ocioso-regla-pantalla: ${fallos} fallo(s)` : 'plan-ocioso-regla-pantalla: todo bien')
  process.exit(fallos ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
