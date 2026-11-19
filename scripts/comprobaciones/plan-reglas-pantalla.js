// scripts/comprobaciones/plan-reglas-pantalla.js — la PANTALLA de las reglas «si… entonces…» del bloque «Con pesos» (docs/builder.md
// §199; boceto bocetos/bloque-con-pesos.html): las filas de pantalla y la vuelta (lib/builder/reglasPesos.js), «Así se lee», los tres
// ejemplos (válidos para el motor y de ida y vuelta por los ajustes del plan) y el montaje con estado (sección 4, «+ Añadir regla»,
// ENTONCES, DESPUÉS «cuando…», ↑ ↓, borrar, el catálogo, «Cargar un ejemplo» con y sin pregunta). Las corre comunes.sh. Termina en 0
// si todo da lo esperado.
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
  const P = require(R + '/lib/planes/plan.js'), W = require(R + '/lib/planes/pesos.js'), Pa = require(R + '/lib/builder/planPantalla.js'), G = require(R + '/lib/builder/reglasPesos.js'), T = require(R + '/lib/builder/tarjetas.js'), Lt = require(R + '/lib/lotesLab.js')
  const J = (x) => Lt.jsonCanonico(x)

  // ── 1 · Lo puro: filas, ejemplos, frases ──
  {
    const blq = (e) => ({ ...Pa.bloquePesosNuevo('b2', 40), ...e.bloque() })
    for (const e of G.EJEMPLOS_PESOS) {
      const b = blq(e), a = { ...Pa.AJUSTES_PLAN, activo: 'AAPL', ocioso: 'LIQUIDEZ', peso: 60, bloques: [b] }
      const plan = Pa.planDe(a, FOTO), x = plan.piezas.find(z => z.tipo === 'pesos')
      ok(P.validaPlan(plan).length === 0 && J(x.reglas) === J(b.reglas), `ejemplo «${e.nombre}»: válido para el motor y sus reglas llegan tal cual (${P.validaPlan(plan).join(' ')})`)
      ok(J(Pa.ajustesDe(plan, FOTO).bloques) === J(a.bloques), `ejemplo «${e.nombre}»: ida y vuelta por los ajustes, idéntico`)
      for (const r of b.reglas) for (const fs of [r.filas, r.despues?.filas || []]) ok(J(G.filasGuardadasRegla(fs.map(G.filaDePantallaRegla))) === J(fs), `ejemplo «${e.nombre}»: las filas pasan a pantalla y vuelven idénticas`)
    }
    const fr = G.fraseBloquePesos(blq(G.EJEMPLOS_PESOS[0]))
    ok(fr[0] === 'El bloque empieza con 80 % SPY + 20 % TQQQ; cada año vuelve a sus pesos; el dinero que le llega va según los pesos de ese momento.', `«Así se lee», 1.ª línea: «${fr[0]}»`)
    ok(/^Regla 1: si .*TQQQ.*40.*, a la apertura siguiente pasa a 60 % SPY \+ 40 % TQQQ, lo mantiene al menos 12 meses y después vuelve a los pesos de partida; no se repite hasta que TQQQ cierre por encima del máximo/.test(fr[1]) && fr.length === 2, `«Así se lee», la regla: «${fr[1]}»`)
    const f2 = G.fraseBloquePesos(blq(G.EJEMPLOS_PESOS[1]))[1], f3 = G.fraseBloquePesos(blq(G.EJEMPLOS_PESOS[2]))[1]
    ok(/mueve un 20 % de todo el bloque de QQQ a TQQQ y después se queda así/.test(f2), `rota: «${f2}»`)
    ok(/\(velas semanales\)/.test(f3) && /pasa a 20 % QQQ \+ 50 % GLD \+ 30 % liquidez, lo mantiene al menos 1 mes y después vuelve a los pesos de partida cuando/.test(f3) && /se repite cada vez que se cumpla/.test(f3), `refugio: «${f3}»`)
    ok(G.fraseBloquePesos(Pa.bloquePesosNuevo('b2', 50))[1] === 'Sin reglas: los pesos solo cambian al volver a ellos (comprar y mantener).', 'sin reglas, lo dice')
    const c = G.catalogoRegla(''), ids = c.grupos.flatMap(g => g.conds)
    ok(ids.includes('caidaDesdeMaximoHistorico') && ids.includes('precioVsMedia') && ids.every(id => !T.soloDelValor(id)) && T.buscaCatalogo('').grupos.flatMap(g => g.conds).some(T.soloDelValor), `el catálogo de las reglas, sin las condiciones que solo valen dentro del Nasdaq-100 (${ids.length} condiciones)`)
    const b0 = { ...Pa.bloquePesosNuevo('b2', 50), pesos: [{ simbolo: 'SPY', peso: 80 }, { simbolo: 'TQQQ', peso: 20 }] }, rn = G.reglaNueva(b0)
    ok(W.validaReglasPesos({ reglas: [rn] }).length === 0 && rn.filas[0].quien === 'SPY' && rn.filas[0].si.c === 'caidaDesdeMaximoHistorico' && J(rn.accion.pesos) === J([{ simbolo: 'SPY', peso: 0.8 }, { simbolo: 'TQQQ', peso: 0.2 }]), 'regla nueva: válida, SI SPY cae desde su máximo, ENTONCES los pesos de partida')
    ok(J(G.accionNueva('moverBloque', b0)) === J({ tipo: 'moverBloque', pct: 20, de: 'SPY', a: 'TQQQ' }) && J(G.accionNueva('vender', b0)) === J({ tipo: 'vender', de: 'SPY' }), 'acción nueva al cambiar de tipo, con los símbolos del bloque')
    ok(J(G.mueveRegla([1, 2, 3], 1, -1)) === '[2,1,3]' && J(G.mueveRegla([1, 2, 3], 0, -1)) === '[1,2,3]', '↑ ↓ cambian el orden (y no se salen)')
    const dos = G.filasGuardadasRegla([{ ...G.filaDePantallaRegla(rn.filas[0]), union: 'O' }, { ...G.filaDePantallaRegla(rn.filas[0]), union: 'O' }])
    ok(!('union' in dos[0]) && dos[1].union === 'O', 'la primera fila va sin «Y / O»; las demás lo llevan')
  }

  // ── 2 · La pantalla ──
  {
    const path = require('path'), React = require(path.join(R, 'node_modules', 'react')), RDC = require(path.join(R, 'node_modules', 'react-dom', 'client'))
    const BP = require(R + '/components/BuilderPlan.js').default
    let pedidos = []
    const props = (ini) => ({ estrategias: [FOTO], estrategiaId: 'x', datosLista: { watchlist: [{ symbol: 'AAPL', name: 'Apple', list_ids: [] }], wlLists: [], rankingData: {} },
      deps: { ctx: null, calcula: async (...xs) => { pedidos.push(xs); throw new Error('sin motor en la prueba') } }, inicial: { planes: [], pestana: 'n1', simbolos: ['AAPL', 'SPY', 'TQQQ', 'QQQ', 'GLD'], pruebas: [], resultadoPrueba: null, ...ini } })
    const hasta = async (cond, max = 20000) => { const t0 = Date.now(); do { await D.espera(5); try { if (cond()) { await D.espera(5); return true } } catch (_) {} } while (Date.now() - t0 < max); return false }
    const pieza = () => pedidos[pedidos.length - 1]?.[0]?.piezas?.find(z => z.tipo === 'pesos')
    {
      const ini = { activo: 'AAPL', ocioso: 'LIQUIDEZ', peso: 60, dineroLibre: 'tope', bloques: [{ ...Pa.bloquePesosNuevo('b2', 40), pesos: [{ simbolo: 'SPY', peso: 80 }, { simbolo: 'TQQQ', peso: 20 }] }] }
      const m = D.monta(React.createElement(BP, props({ ajustes: ini })), RDC); await D.espera(60)
      const bq = () => m.raiz.conAtributo('data-tipo-bloque', 'pesos')[0], s4 = () => bq().conAtributo('data-seccion-pesos', '4')[0]
      const boton = (id, z = bq()) => z.conAtributo('data-boton', id)[0]
      ok(!!s4() && /4 · Reglas «si… entonces…»/.test(s4().textContent) && /Sin reglas/.test(s4().textContent) && !bq().conAtributo('data-aviso', 'reglas-guardadas').length, 'sección 4 «Reglas «si… entonces…»», sin reglas')
      ok(/El bloque empieza con 80 % SPY \+ 20 % TQQQ; nunca vuelve a sus pesos/.test(bq().conAtributo('data-asi-se-lee')[0]?.textContent || ''), '«Así se lee» con la frase del bloque')
      D.pulsa(boton('anadir-regla')); await hasta(() => bq().conAtributo('data-regla').length === 1)
      const rg = () => bq().conAtributo('data-regla', '0')[0]
      ok(rg().conAtributo('data-fila', 'caidaDesdeMaximoHistorico').length === 1 && /Con pesos · 80 % SPY \+ 20 % TQQQ · 1 regla/.test(bq().textContent), '«+ Añadir regla»: una regla con su condición; la fila del bloque dice «1 regla»')
      await hasta(() => pieza()?.reglas?.length === 1)
      ok(pieza()?.reglas?.[0]?.filas?.[0]?.si?.c === 'caidaDesdeMaximoHistorico' && pieza().reglas[0].accion.tipo === 'pesos', 'lo que se calcula lleva la regla')
      ok(/Regla 1: si .*SPY/.test(bq().conAtributo('data-frase-pesos', '1')[0]?.textContent || ''), '«Así se lee» añade la regla')
      D.escribe(rg().conAtributo('data-accion')[0], 'moverBloque'); await hasta(() => rg().conAtributo('data-mover').length === 1 && pieza()?.reglas?.[0]?.accion?.tipo === 'moverBloque')
      ok(/mover/.test(rg().conAtributo('data-mover')[0].textContent) && pieza()?.reglas?.[0]?.accion?.tipo === 'moverBloque', 'ENTONCES «Mover un % de todo el bloque»: pide el % y de dónde a dónde')
      D.escribe(rg().conAtributo('data-despues')[0], 'cuando'); await hasta(() => rg().conAtributo('data-filas-regla', '0-despues').length === 1 && pieza()?.reglas?.[0]?.despues?.tipo === 'cuando')
      ok(rg().conAtributo('data-filas-regla', '0-despues')[0].conAtributo('data-fila', 'precioVsMedia').length === 1 && pieza()?.reglas?.[0]?.despues?.tipo === 'cuando', 'DESPUÉS «Volver… cuando»: con su condición')
      D.escribe(rg().conAtributo('data-velas-regla')[0], 'semanales'); await hasta(() => pieza()?.reglas?.[0]?.filas?.[0]?.velas === 'semanales')
      ok(pieza()?.reglas?.[0]?.filas?.[0]?.velas === 'semanales', 'una condición en velas semanales')
      D.pulsa(boton('anadir-condicion', rg().conAtributo('data-filas-regla', '0-si')[0])); await hasta(() => m.raiz.conAtributo('data-catalogo-regla').length === 1)
      const cat = m.raiz.conAtributo('data-catalogo-regla')[0]
      ok(!!cat && cat.conAtributo('data-cond-regla', 'caidaDesdeMaximoHistorico').length === 1 && !cat.conAtributo('data-cond-regla').some(z => T.soloDelValor(z.getAttribute('data-cond-regla'))), '«+ condición» abre el catálogo, sin las que solo valen dentro del Nasdaq-100')
      D.pulsa(cat.conAtributo('data-cond-regla', 'precioVsMedia')[0].conAtributo('type', 'button')[0]); await hasta(() => !m.raiz.conAtributo('data-catalogo-regla').length && rg().conAtributo('data-filas-regla', '0-si')[0].conAtributo('data-fila-regla').length === 2 && pieza()?.reglas?.[0]?.filas?.length === 2)
      ok(pieza()?.reglas?.[0]?.filas?.[1]?.union === 'Y' && pieza().reglas[0].filas[1].quien === 'SPY', 'elegida: segunda condición «y además», sobre el mismo símbolo')
      D.escribe(rg().conAtributo('data-union')[0], 'O'); await hasta(() => pieza()?.reglas?.[0]?.filas?.[1]?.union === 'O')
      ok(pieza()?.reglas?.[0]?.filas?.[1]?.union === 'O', '«o bien» cambia la unión')
      D.pulsa(boton('anadir-regla')); await hasta(() => bq().conAtributo('data-regla').length === 2 && pieza()?.reglas?.length === 2)
      const antes = J(pieza()?.reglas?.map(r => r.accion.tipo))
      D.pulsa(bq().conAtributo('data-regla', '1')[0].conAtributo('data-boton', 'subir-regla')[0]); await hasta(() => J(pieza()?.reglas?.map(r => r.accion.tipo)) === '["pesos","moverBloque"]')
      ok(antes === '["moverBloque","pesos"]' && J(pieza()?.reglas?.map(r => r.accion.tipo)) === '["pesos","moverBloque"]', '↑ sube la regla 2 al primer lugar')
      D.pulsa(bq().conAtributo('data-regla', '0')[0].conAtributo('data-boton', 'borrar-regla')[0]); await hasta(() => bq().conAtributo('data-regla').length === 1 && pieza()?.reglas?.length === 1)
      ok(pieza()?.reglas?.length === 1 && pieza().reglas[0].accion.tipo === 'moverBloque', 'la papelera borra esa regla')
      D.pulsa(bq().conAtributo('data-ejemplo', 'refugio')[0]); await hasta(() => m.raiz.conAtributo('data-boton', 'si-ejemplo').length === 1)
      ok(/Oro como refugio/.test(m.raiz.textContent) && m.raiz.conAtributo('data-boton', 'si-ejemplo').length === 1, 'con el bloque ya hecho, «Cargar un ejemplo» pregunta antes')
      D.pulsa(m.raiz.conAtributo('data-boton', 'no-ejemplo')[0]); await hasta(() => !m.raiz.conAtributo('data-boton', 'si-ejemplo').length)
      ok(/80 % SPY \+ 20 % TQQQ · 1 regla/.test(bq().textContent), '«Cancelar» no cambia nada')
      D.pulsa(bq().conAtributo('data-ejemplo', 'refugio')[0]); await hasta(() => m.raiz.conAtributo('data-boton', 'si-ejemplo').length === 1)
      D.pulsa(m.raiz.conAtributo('data-boton', 'si-ejemplo')[0]); await hasta(() => /70 % QQQ \+ 30 % GLD · 1 regla/.test(bq().textContent) && pieza()?.reglas?.[0]?.despues?.tipo === 'cuando')
      ok(/70 % QQQ \+ 30 % GLD · 1 regla/.test(bq().textContent) && /cada trimestre/.test(bq().textContent) && pieza()?.reglas?.[0]?.despues?.tipo === 'cuando' && pieza().peso === 0.4, '«Sí, cargarlo»: el ejemplo entero, con su % del plan intacto (40 %)')
      m.quita(); await D.espera(5)
    }
    {
      const m = D.monta(React.createElement(BP, props({ ajustes: { activo: 'AAPL', ocioso: 'LIQUIDEZ' } })), RDC); await D.espera(60)
      D.pulsa(m.raiz.conAtributo('data-boton', 'anadir-bloque')[0]); await hasta(() => m.raiz.conAtributo('data-boton', 'anadir-bloque-pesos').length === 1)
      D.pulsa(m.raiz.conAtributo('data-boton', 'anadir-bloque-pesos')[0]); await hasta(() => m.raiz.conAtributo('data-tipo-bloque', 'pesos').length === 1)
      const bq = () => m.raiz.conAtributo('data-tipo-bloque', 'pesos')[0]
      D.pulsa(bq().conAtributo('data-ejemplo', 'caidas')[0]); await hasta(() => /80 % SPY \+ 20 % TQQQ · 1 regla/.test(bq().textContent))
      ok(/80 % SPY \+ 20 % TQQQ · 1 regla/.test(bq().textContent) && !m.raiz.conAtributo('data-boton', 'si-ejemplo').length, 'en un bloque en blanco, el ejemplo se carga sin preguntar')
      m.quita(); await D.espera(5)
    }
  }

  console.log(fallos ? `plan-reglas-pantalla: ${fallos} fallo(s)` : 'plan-reglas-pantalla: todo bien')
  process.exit(fallos ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
