// scripts/comprobaciones/filtros-extra.js — las filas de filtro EXTRA del intérprete (def.filtrosExtra; docs/builder.md §149).
// Las corre comunes.sh. Termina en 0 si todo da lo esperado.
//
// A mano. 30 sesiones, de lunes a viernes, desde el lunes 02/03/2020 (6 semanas: d0…d29). Cada vela abre al cierre de la anterior.
//   VAL (el valor): 100 plano las dos primeras semanas (d0–d9); desde d10 cierra a 104, 106, 108… (+2 cada día).
//     Su SMA (3): en d10, (100 + 100 + 104) / 3 = 101,33 → el cierre (104) pasa a estar por encima; ya no vuelve a bajar.
//     «De estado»: cierre > SMA (3) (cierto desde d10). «De un momento»: el cierre CRUZA por encima de su SMA (3) (solo en d10).
//     Sin filtros: señal al cierre de d10 → compra a la apertura de d11 = 104.
//   REF (otro símbolo, diario): 50 plano hasta d12; d13 = 52, y sigue subiendo. Cierre > SMA (3): 50 > 50 no; en d13, 52 > 50,67 sí.
//     → con la fila «REF: cierre > SMA (3)», de estado: señal y filtro al cierre de d13 → compra a la apertura de d14 = cierre de d13 = 110.
//     → de un momento: el cruce de d10 estaba bloqueado y no hay otro → NINGUNA operación.
//   REF2: 20 plano hasta d16; d17 = 21. Con las dos filas (REF y REF2): compra a la apertura de d18 = cierre de d17 = 118.
//   REFW (para la fila SEMANAL): semanas 0 y 1 a 50, semana 2 a 60, semana 3 a 70… Cierre semanal > SMA (2) semanal: semana 1, 50 > 50
//     no; semana 2, 60 > 55 sí. §195: la semana 2 se conoce AL CIERRE de su última sesión, el viernes d14 (como en la realidad); del
//     lunes al jueves (d10–d13) vale la semana 1 (no) → compra a la apertura del lunes d15 = cierre de d14 = 112. (Antes de §195 se
//     esperaba al lunes para mirarla y compraba el martes d16 a 114.)
//   VAL en semanal («Este valor», semanas): semana 1 cierra a 100 (SMA 100: no), semana 2 a 112 (SMA 106: sí) → también d15 a 112.
process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://arnes.invalid'; process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'clave-falsa-del-arnes'
const C0 = require('./cargador'), R = C0.RAIZ
let fallos = 0
const ok = (c, t) => { console.log(`${c ? 'OK  ' : 'MAL '} ${t}`); if (!c) fallos++ }

;(async () => {
  await C0.prepara(); C0.registra(R)
  const I = require(R + '/lib/editor/interprete.js'), Df = require(R + '/lib/editor/definicion.js'), H = require(R + '/lib/editor/historia.js'), F = require(R + '/lib/editor/fuente.js'), Az = require(R + '/lib/pruebaAzar.js'), Ex = require(R + '/lib/editor/exporta.js')

  const dias = []; for (let d = new Date('2020-03-02T00:00:00Z'); dias.length < 30; d = new Date(d.getTime() + 864e5)) { const w = d.getUTCDay(); if (w >= 1 && w <= 5) dias.push(d.toISOString().slice(0, 10)) }
  const serie = (cierres) => cierres.map((c, i) => { const o = i ? cierres[i - 1] : c; return { date: dias[i], open: o, high: Math.max(o, c), low: Math.min(o, c), close: c, volume: 1000 } })
  const VAL = serie(dias.map((_, i) => i < 10 ? 100 : 104 + 2 * (i - 10)))
  const REF = serie(dias.map((_, i) => i < 13 ? 50 : 52 + 2 * (i - 13)))
  const REF2 = serie(dias.map((_, i) => i < 17 ? 20 : 21 + (i - 17)))
  const REFW = serie(dias.map((_, i) => i < 10 ? 50 : 60 + 10 * (Math.floor(i / 5) - 2)))
  const refs = { REF, REF2, REFW }
  ok(dias[0] === '2020-03-02' && dias[10] === '2020-03-16' && dias[14] === '2020-03-20' && dias[15] === '2020-03-23' && VAL[13].close === 110 && VAL[15].close === 114 && VAL[17].close === 118, 'las fechas y los precios del ejemplo')

  const sobre = (periodo) => ({ c: 'precioVsMedia', p: { tipo: 'SMA', periodo, lado: 'encima' } })
  const base = (senal) => ({ tipo: 'editor', motor: 1, formato: 1, nombre: 'P', entrada: { orden: { tipo: 'apertura' }, senal }, stops: [{ id: 'inicial', tipo: 'porcentaje', pct: 50, motivo: 'stop' }], salidas: [] })
  const ESTADO = base(sobre(3)), MOMENTO = base({ c: 'cruza', de: sobre(3) })
  const corre = (def, referencias = refs) => { const r = I.interpreta(def, VAL, {}, { referencias }); return [...r.trades, ...(r.openPosition ? [r.openPosition] : [])].map(t => [t.entryDate, t.entryPrice]) }
  const txt = (x) => JSON.stringify(x)
  const con = (def, filas) => ({ ...def, filtrosExtra: filas })

  // ── 1 · Sin filas: lo de siempre ──
  ok(txt(corre(ESTADO)) === txt([[dias[11], 104]]) && txt(corre(MOMENTO)) === txt([[dias[11], 104]]), `sin filtros, las dos compran en d11 a 104 (${txt(corre(ESTADO))})`)
  ok(txt(I.interpreta(con(ESTADO, []), VAL, {}, { referencias: refs })) === txt(I.interpreta(ESTADO, VAL, {}, { referencias: refs })), 'una lista vacía de filas da EXACTAMENTE lo mismo que no tener el campo')
  ok(Df.validaDefinicion(ESTADO).length === 0 && Df.validaDefinicion(con(ESTADO, [])).length === 0, 'las dos definiciones son válidas')

  // ── 2 · Una fila de otro símbolo (diaria): forma parte de la señal ──
  const fREF = { quien: 'REF', si: sobre(3) }
  ok(txt(corre(con(ESTADO, [fREF]))) === txt([[dias[14], 110]]), `de estado: compra cuando el filtro deja de bloquear, d14 a 110 (${txt(corre(con(ESTADO, [fREF])))})`)
  ok(corre(con(MOMENTO, [fREF])).length === 0, 'de un momento: el cruce bloqueado se pierde y no hay otro → ninguna operación')
  // La prueba de oro: la misma fila puesta como filtro de mercado de la estrategia (el paso 1) da lo mismo.
  ok(txt(corre(con(ESTADO, [fREF]))) === txt(corre({ ...ESTADO, filtroMercado: { ticker: 'REF', si: sobre(3) } })) && txt(corre(con(MOMENTO, [fREF]))) === txt(corre({ ...MOMENTO, filtroMercado: { ticker: 'REF', si: sobre(3) } })), 'una fila extra de un símbolo = el mismo filtro de mercado puesto en la estrategia')
  ok(corre(con(ESTADO, [fREF]), {}).length === 0, 'sin las velas del símbolo: «sin dato», no se entra')

  // ── 3 · Varios símbolos a la vez, y con el filtro de mercado de la estrategia ──
  const fREF2 = { quien: 'REF2', si: sobre(3) }
  ok(txt(corre(con(ESTADO, [fREF, fREF2]))) === txt([[dias[18], 118]]), `dos símbolos: tienen que cumplirse los dos, d18 a 118 (${txt(corre(con(ESTADO, [fREF, fREF2])))})`)
  ok(txt(corre(con({ ...ESTADO, filtroMercado: { ticker: 'REF', si: sobre(3) } }, [fREF2]))) === txt([[dias[18], 118]]), 'el filtro de mercado de la estrategia y una fila extra de otro símbolo: los dos')

  // ── 4 · «Este valor» (diaria): igual que ponerla en la señal ──
  const fVal = { quien: 'valor', si: { c: 'precioVsMedia', p: { tipo: 'SMA', periodo: 8, lado: 'encima' } } }
  ok(txt(corre(con(ESTADO, [fVal]))) === txt(corre(base({ c: 'Y', de: [fVal.si, sobre(3)] }))), 'una fila extra de «este valor» = la misma condición delante de la señal')

  // ── 5 · Una fila SEMANAL sobre velas diarias: la última semana ya cerrada ──
  const fSem = { quien: 'REFW', si: sobre(2), velas: 'semanal' }
  const rSem = corre(con(ESTADO, [fSem]))
  ok(txt(rSem) === txt([[dias[15], 112]]), `semanal de otro símbolo: la semana 2 se conoce al cierre del viernes d14 → compra el lunes d15 a 112 (${txt(rSem)})`)
  const rValSem = corre(con(ESTADO, [{ quien: 'valor', si: sobre(2), velas: 'semanal' }]))
  ok(txt(rValSem) === txt([[dias[15], 112]]), `semanal de «este valor»: el lunes d15 a 112 (${txt(rValSem)})`)
  ok(txt(corre(con(ESTADO, [{ quien: 'REFW', si: sobre(2) }]))) !== txt(rSem), 'la misma fila en diarias no es la semanal (otra cuenta)')
  ok(corre(con(MOMENTO, [fSem])).length === 0, 'semanal con señal de un momento: el cruce de d10 estaba bloqueado → ninguna')

  // ── 6 · Validación, símbolos, calentamiento, frase y exportación ──
  ok(Df.validaDefinicion(con(ESTADO, [fREF, fVal, fSem])).length === 0, 'tres filas correctas: válida')
  ok(Df.validaDefinicion(con(ESTADO, [{ quien: 'ref', si: sobre(3) }])).length === 1 && Df.validaDefinicion(con(ESTADO, [{ quien: 'REF', si: sobre(3), velas: 'diario' }])).length === 1 && Df.validaDefinicion(con(ESTADO, [{ quien: 'REF' }])).length >= 1 && Df.validaDefinicion(con(ESTADO, 'x')).length === 1, 'un símbolo mal escrito, unas velas raras, una fila sin condición o algo que no es una lista: se dice')
  ok(txt(F.tickersDeDefinicion(con({ ...ESTADO, filtroMercado: { ticker: 'SPY', si: sobre(3) } }, [fREF, fVal, fREF2, fREF]))) === txt(['SPY', 'REF', 'REF2']) && txt(F.tickersDeDefinicion(ESTADO)) === '[]' && txt(F.tickersReferencia({ definicion: con(ESTADO, [fREF]) })) === txt(['REF']) && txt(F.tickersReferencia('codigo')) === '[]', 'los símbolos de referencia: el del filtro de mercado y los de las filas, sin repetir')
  ok(txt(Az.tickersDe(con(ESTADO, [fREF, fVal]))) === txt(['REF']), 'tickersDe (planes y paso 2) también los ve')
  const n0 = H.velasNecesarias(ESTADO), nD = H.velasNecesarias(con(ESTADO, [{ quien: 'REF', si: sobre(200) }])), nS = H.velasNecesarias(con(ESTADO, [{ quien: 'REF', si: sobre(200), velas: 'semanal' }]))
  ok(nD >= 200 && nD > n0 && nS === (nD + 2) * 5, `el calentamiento: una fila diaria de 200 pide ${nD} velas; la misma en semanas, (${nD} + 2) × 5 = ${nS}`)
  const frase = Df.fraseDefinicion(con(ESTADO, [fREF, fSem]))
  ok(frase.includes('Solo se entra si en REF ') && frase.includes('Solo se entra si en REFW (velas semanales) '), 'la regla en castellano nombra cada fila')
  ok(Ex.motivosNoExportable(con(ESTADO, [fREF])).some(x => x.includes('filtros añadidos')), 'con filas extra no se exporta a código')
  ok(Df.huellaDefinicion && (await Df.huellaDefinicion(ESTADO)) !== (await Df.huellaDefinicion(con(ESTADO, [fREF]))), 'la huella de la regla cambia con una fila extra')

  console.log(`filtros-extra: ${fallos ? `${fallos} fallos` : 'todo bien'}`)
  process.exit(fallos ? 1 : 0)
})().catch(e => { console.error(e); process.exit(2) })
