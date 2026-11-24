// scripts/comprobaciones/con-pasos-pantalla.js — la «Condición con pasos» en la ventana de la señal del Replay (docs/builder.md §244):
// textos, ejemplos, el arreglo tras cada cambio (lib/replay/conPasosPantalla.js), la señal con velas INVENTADAS calculada a mano, y la
// ventana montada (components/Replay.js VentanaSenal + components/EditorConPasos.js + FilasAlerta con movimientos). Las corre comunes.sh.
const C0 = require('./cargador'), R = C0.RAIZ, D = require('./domFalso')
let fallos = 0
const ok = (c, t) => { console.log(`${c ? 'OK  ' : 'MAL '} ${t}`); if (!c) fallos++ }
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const ordena = (x) => Array.isArray(x) ? x.map(ordena) : x && typeof x === 'object' ? Object.fromEntries(Object.keys(x).sort().map(k => [k, ordena(x[k])])) : x
const mismo = (a, b) => igual(ordena(a), ordena(b))
const fecha = (i) => new Date(Date.UTC(2020, 0, 1) + i * 864e5).toISOString().slice(0, 10)

;(async () => {
  await C0.prepara(); C0.registra(R)
  const P = require(R + '/lib/replay/conPasosPantalla.js')
  const { validaConPasos, senalesConPasos } = require(R + '/lib/condiciones/conPasos.js')
  const S = require(R + '/lib/replay/senales.js')

  // ── Textos ──
  ok(P.fraseMovimiento({ mov: 'cae', pct: 10, desde: 'maxHist', quien: 'AAPL' }) === 'el precio de AAPL cae un 10 % desde su máximo histórico', 'una fila de movimiento en palabras')
  ok(P.fraseMovimiento({ mov: 'mueve', pct: 2.5, desde: 'senal', quien: 'AAPL' }) === 'el precio de AAPL se mueve un 2,5 % (arriba o abajo) desde el precio de la última señal', '«se mueve», con decimales en castellano')
  ok(P.fraseMovimiento({ mov: 'cae', pct: 10, desde: 'maxN', n: 252, quien: 'AAPL', cuando: 'cierra', escalones: true }) === 'el cierre de AAPL cae un 10 % desde el máximo de las últimas 252 velas, y luego cada 10 % más',
    '§246: «el cierre de», las últimas 252 velas y los escalones, en palabras')

  // ── La nueva y los ejemplos: válidos, y «Así se lee» ──
  ok(validaConPasos(P.conPasosNueva('AAPL')).length === 0, 'la condición nueva ya es válida (cae un 10 % desde su máximo histórico, cada vez)')
  ok(P.fraseConPasos(P.conPasosNueva('AAPL')) === 'Cada vez que el precio de AAPL cae un 10 % desde su máximo histórico → señal.', `«Así se lee» de la nueva (${P.fraseConPasos(P.conPasosNueva('AAPL'))})`)
  for (const x of P.EJEMPLOS_CON_PASOS) { const d = x.def('AAPL'); ok(validaConPasos(d).length === 0 && mismo(P.ajustaConPasos(d), d), `ejemplo «${x.nombre}»: válido y ya ajustado (${validaConPasos(d).join(' | ')})`) }
  const e1 = P.fraseConPasos(P.EJEMPLOS_CON_PASOS[0].def('AAPL'))
  ok(e1 === 'Primero, el precio de AAPL cae un 10 % desde su máximo histórico (y ya da señal); después, cada vez que el precio de AAPL se mueve un 10 % (arriba o abajo) desde el precio de la última señal → señal. Con un máximo histórico nuevo, vuelve a esperar el paso 1.', `«Así se lee» del ejemplo 1 (${e1})`)
  const e3 = P.fraseConPasos(P.EJEMPLOS_CON_PASOS[2].def('AAPL'))
  ok(/^Primero, la media exponencial de 10 velas de AAPL está por encima de la media exponencial de 20 velas; después, la primera vez que AAPL cierra bajo su media exponencial de 10 velas → señal\. Si antes .* por debajo .*, se olvida el paso 1\. Vuelve a empezar con el siguiente paso 1\.$/.test(e3), `«Así se lee» del ejemplo 3 (${e3})`)
  ok(/^Mientras AAPL cierra sobre su media exponencial de 200 velas: cada vez que .*Fuera del tramo, nada\.$/.test(P.fraseConPasos(P.EJEMPLOS_CON_PASOS[1].def('AAPL'))), '«Así se lee» con «Mientras…» empieza por él y acaba en «Fuera del tramo, nada.»')

  // ── El arreglo tras cada cambio ──
  const d3 = P.EJEMPLOS_CON_PASOS[2].def('AAPL')
  const sin2 = P.ajustaConPasos({ ...d3, paso1: { ...d3.paso1, daSenal: true }, paso2: null })
  ok(sin2.anula === null && !('daSenal' in sin2.paso1) && sin2.empieza === 'maxHist' && validaConPasos(sin2).length === 0, `quitar el paso 2: se va «se anula si» y «también da señal»; «con el siguiente paso 1» pasa a «máximo histórico nuevo» (${sin2.empieza})`)
  const d2 = P.EJEMPLOS_CON_PASOS[1].def('AAPL')
  const tramo = P.ajustaConPasos({ ...d2, paso1: { filas: [{ mov: 'cae', pct: 5, desde: 'maxTramo', quien: 'AAPL' }] } })
  ok(tramo.paso1.filas[0].desde === 'maxTramo', 'con «Mientras…», «el máximo del tramo» se queda')
  const sinTramo = P.ajustaConPasos({ ...tramo, mientras: null })
  ok(sinTramo.paso1.filas[0].desde === 'maxHist' && validaConPasos(sinTramo).length === 0, 'quitar «Mientras…»: «el máximo del tramo» pasa a «su máximo histórico»')
  ok(P.ajustaConPasos({ ...P.conPasosNueva('A'), paso1: { filas: [{ mov: 'cae', pct: 5, desde: 'paso1', quien: 'A' }] } }).paso1.filas[0].desde === 'maxHist', '«el precio del paso 1» no vale en el paso 1: pasa a «su máximo histórico»')
  ok(igual(P.referenciasPara('paso2', d2), ['maxHist', 'maxN', 'minN', 'maxTramo', 'minTramo', 'maxSenal', 'minSenal', 'senal', 'paso1', 'compra']) && igual(P.referenciasPara('paso1', P.conPasosNueva('A')), ['maxHist', 'maxN', 'minN', 'maxSenal', 'minSenal', 'senal', 'compra']) && P.referenciasPara('mientras', d2).length === 0,
    'desde dónde: el tramo solo con «Mientras…», el paso 1 solo en el paso 2 y «se anula si», nada en «Mientras…»')
  ok(igual(P.opcionesEmpieza({ veces: 'primera', paso2: {}, mientras: {} }).map(o => o[0]), ['paso1', 'tramo', 'maxHist']) && igual(P.opcionesEmpieza({ veces: 'cada', paso2: {} }).map(o => o[0]), ['maxHist', 'nunca']) && P.opcionesEmpieza({ veces: 'cada' }).length === 0,
    '«vuelve a empezar»: las opciones que valen en cada caso')

  // ── La señal del ejemplo 1 con velas inventadas (a mano) ──
  // Cierres 100, 95, 90, 92, 99, 89,1, 120, 108. Máximo histórico 100.
  //   vela 2: 90 ≤ 100 × 0,90 → paso 1 (da señal). Referencia «última señal» = 90.
  //   vela 4: 99 ≥ 90 × 1,10 → señal (paso 2). Referencia = 99.
  //   vela 5: 89,1 ≤ 99 × 0,90 → señal. (El paso 1 se vuelve a cumplir, 89,1 ≤ 90, pero ya está armado.)
  //   vela 6: 120, máximo histórico nuevo → vuelve a esperar el paso 1 (el +34 % desde 89,1 no cuenta).
  //   vela 7: 108 ≤ 120 × 0,90 → paso 1: señal.  → velas 2, 4, 5 y 7.
  const cierres = [100, 95, 90, 92, 99, 89.1, 120, 108]
  const V = cierres.map((c, i) => ({ date: fecha(i), open: c, high: c, low: c, close: c, volume: 1 }))
  const F = V.map(v => v.date)
  const r1 = senalesConPasos(P.EJEMPLOS_CON_PASOS[0].def('A'), () => V, F, { simbolo: 'A' })
  ok(igual(r1.senales, [F[2], F[4], F[5], F[7]]), `ejemplo 1: señales en las velas 2, 4, 5 y 7 (${JSON.stringify(r1.senales)})`)
  // «Tu última compra»: compras a mano a 95 en la vela 1 → «cae un 5 % desde tu última compra» = 90,25 → vela 2 (90). La vela 5 (89,1) ya
  // no: es el mismo nivel de la misma compra (§246: cada nivel salta una vez). Sin compra, nada.
  const conCompra = { ...P.conPasosNueva('A'), paso1: { filas: [{ mov: 'cae', pct: 5, desde: 'compra', quien: 'A' }] } }
  ok(igual(senalesConPasos(conCompra, () => V, F, { simbolo: 'A', compras: [{ fecha: F[1], precio: 95 }] }).senales, [F[2]]) && senalesConPasos(conCompra, () => V, F, { simbolo: 'A' }).senales.length === 0,
    'desde tu última compra (95 en la vela 1): 95 × 0,95 = 90,25 → señal en la vela 2 (la 5, mismo nivel: no); sin compra, ninguna')

  // ── La barra: qué velas pedir y qué dibujar ──
  const sQ = { tipo: 'pasos', def: { ...d2, mientras: { filas: [{ quien: 'QQQ', velas: 'diarias', si: { c: 'precioVsMedia', p: { lado: 'encima', tipo: 'EMA', periodo: 200 } } }] } } }
  ok(igual(S.simbolosSenal(sQ, 'AAPL', () => []), ['QQQ']), 'con pasos: hay que pedir las velas de QQQ (el «Mientras…»), no las de AAPL')
  const V3 = Array.from({ length: 30 }, (_, i) => ({ date: fecha(i), open: 100 + i, high: 100 + i, low: 100 + i, close: 100 + i, volume: 1 }))
  const g = S.graficoSenal({ tipo: 'pasos', def: P.EJEMPLOS_CON_PASOS[2].def('AAPL') }, V3, 'AAPL')
  ok(g && igual(g.series.map(x => x.nombre), ['EMA 10', 'EMA 20']), `con pasos: se dibujan las medias de todas sus filas (EMA 10 y 20 del cruce y del retroceso) (${g && g.series.map(x => x.nombre)})`)

  // ── La ventana montada ──
  D.pon()
  const React = require(R + '/node_modules/react'), RDC = require(R + '/node_modules/react-dom/client')
  const { VentanaSenal } = require(R + '/components/Replay.js')
  const attr = (raiz, k, v) => raiz.busca(n => n.getAttribute && n.getAttribute(k) != null && (v == null || n.getAttribute(k) === String(v)))
  let aceptada = null
  const m = D.monta(React.createElement(VentanaSenal, { simbolo: 'aapl', senal: null, onAceptar: x => { aceptada = x }, onCancelar: () => {} }), RDC); await D.espera(20)
  ok(attr(m.raiz, 'data-modo-senal', 'condicion') && attr(m.raiz, 'data-modo-senal', 'pasos') && !attr(m.raiz, 'data-editor-pasos'), 'la ventana empieza en «Una condición», con la pestaña «Condición con pasos» al lado')
  ok(D.propsDe(attr(m.raiz, 'data-aceptar-senal')).disabled === true, 'sin condición, «Usar esta señal» apagado')
  D.pulsa(attr(m.raiz, 'data-modo-senal', 'pasos')); await D.espera(20)
  ok(attr(m.raiz, 'data-editor-pasos') && attr(m.raiz, 'data-fila-mov', 0) && /Cada vez que el precio de AAPL cae un 10 % desde su máximo histórico/.test(attr(m.raiz, 'data-asi-se-lee-pasos').textContent),
    'con pasos: el paso 1 nace con «el precio de AAPL cae un 10 % desde su máximo histórico» y su «Así se lee»')
  ok(!attr(m.raiz, 'data-boton', 'anadir-movimiento') === false && !attr(m.raiz, 'data-seccion-pasos', 'paso2') && attr(m.raiz, 'data-pon-seccion', 'paso2') && attr(m.raiz, 'data-pon-seccion', 'mientras') && !attr(m.raiz, 'data-pon-seccion', 'anula'),
    'botones «+ cae / sube un %», «+ Mientras…» y «+ Paso 2»; «+ Se anula si…» solo con paso 2')
  D.escribe(attr(m.raiz, 'data-pct-mov', 0), '15'); await D.espera(10)
  ok(/cae un 15 %/.test(attr(m.raiz, 'data-asi-se-lee-pasos').textContent), 'cambiar el % se ve en «Así se lee»')
  D.escribe(attr(m.raiz, 'data-pct-mov', 0), ''); await D.espera(10)
  ok(attr(m.raiz, 'data-errores-pasos') && D.propsDe(attr(m.raiz, 'data-aceptar-senal')).disabled === true, 'sin %: el error en rojo y «Usar esta señal» apagado')
  D.escribe(attr(m.raiz, 'data-pct-mov', 0), '10'); await D.espera(10)
  // §246: «el cierre de», «el máximo de las últimas N velas» (nace con 252) y «y luego cada 10 % más».
  D.escribe(attr(m.raiz, 'data-cuando-mov', 0), 'cierra'); await D.espera(10)
  D.escribe(attr(m.raiz, 'data-desde-mov', 0), 'maxN'); await D.espera(10)
  const esc = attr(m.raiz, 'data-escalones-mov', 0); esc.checked = true; D.propsDe(esc).onChange({ target: esc }); await D.espera(10)
  ok(D.propsDe(attr(m.raiz, 'data-n-mov', 0)).value === 252 && /el cierre de AAPL cae un 10 % desde el máximo de las últimas 252 velas, y luego cada 10 % más/.test(attr(m.raiz, 'data-asi-se-lee-pasos').textContent),
    '«el cierre de», «últimas 252 velas» y escalones: se ven en «Así se lee»')
  D.escribe(attr(m.raiz, 'data-desde-mov', 0), 'maxHist'); await D.espera(10)
  D.escribe(attr(m.raiz, 'data-cuando-mov', 0), 'toca'); await D.espera(10)
  esc.checked = false; D.propsDe(attr(m.raiz, 'data-escalones-mov', 0)).onChange({ target: esc }); await D.espera(10)
  ok(!attr(m.raiz, 'data-n-mov', 0) && /Cada vez que el precio de AAPL cae un 10 % desde su máximo histórico → señal/.test(attr(m.raiz, 'data-asi-se-lee-pasos').textContent), 'y de vuelta: sin las velas y como al principio')
  D.pulsa(attr(m.raiz, 'data-pon-seccion', 'paso2')); await D.espera(20)
  const p2 = attr(m.raiz, 'data-seccion-pasos', 'paso2')
  ok(p2 && attr(m.raiz, 'data-da-senal') && attr(m.raiz, 'data-pon-seccion', 'anula') && /el precio del paso 1/.test(p2.textContent), 'al poner el paso 2: sale, con «este paso también da señal» en el paso 1 y «+ Se anula si…»; el paso 2 mide desde el precio del paso 1')
  const ck = attr(m.raiz, 'data-da-senal'); ck.checked = true; D.propsDe(ck).onChange({ target: ck }); await D.espera(10)
  D.pulsa(attr(m.raiz, 'data-aceptar-senal')); await D.espera(10)
  ok(aceptada && aceptada.tipo === 'pasos' && aceptada.def.paso1.daSenal === true && aceptada.def.paso2.filas[0].desde === 'paso1' && validaConPasos(aceptada.def).length === 0,
    `«Usar esta señal» da { tipo: 'pasos', def } válida (${JSON.stringify(aceptada && aceptada.def.paso2)})`)
  D.escribe(attr(m.raiz, 'data-ejemplo-pasos'), 'cruce'); await D.espera(20)
  ok(attr(m.raiz, 'data-seccion-pasos', 'anula') && D.propsDe(attr(m.raiz, 'data-veces-pasos')).value === 'primera' && D.propsDe(attr(m.raiz, 'data-empieza-pasos')).value === 'paso1', 'cargar el ejemplo del cruce: «se anula si», «solo la primera vez» y «con el siguiente paso 1»')
  D.pulsa(attr(m.raiz, 'data-quita-seccion', 'paso2')); await D.espera(20)
  ok(!attr(m.raiz, 'data-seccion-pasos', 'anula') && !attr(m.raiz, 'data-da-senal') && D.propsDe(attr(m.raiz, 'data-empieza-pasos')).value === 'maxHist', 'quitar el paso 2 quita «se anula si» y deja «vuelve a empezar» en una opción que vale')
  m.quita()
  // Abrir con una señal con pasos ya elegida: empieza en su pestaña, con ella.
  const m2 = D.monta(React.createElement(VentanaSenal, { simbolo: 'AAPL', senal: { tipo: 'pasos', def: P.EJEMPLOS_CON_PASOS[1].def('AAPL') }, onAceptar: () => {}, onCancelar: () => {} }), RDC); await D.espera(20)
  ok(attr(m2.raiz, 'data-seccion-pasos', 'mientras') && !attr(attr(m2.raiz, 'data-seccion-pasos', 'mientras'), 'data-boton', 'anadir-movimiento'), 'abrir con una con pasos: sale ella; en «Mientras…» no hay «+ cae / sube un %»')
  m2.quita()
  // La de siempre (una condición) sigue igual: da { tipo: 'condicion', filas }.
  aceptada = null
  const fila = { quien: 'AAPL', velas: 'diarias', si: { c: 'precioVsMedia', p: { lado: 'encima', tipo: 'EMA', periodo: 20 } } }
  const m3 = D.monta(React.createElement(VentanaSenal, { simbolo: 'AAPL', senal: { tipo: 'condicion', filas: [fila] }, onAceptar: x => { aceptada = x }, onCancelar: () => {} }), RDC); await D.espera(20)
  D.pulsa(attr(m3.raiz, 'data-aceptar-senal')); await D.espera(10)
  ok(aceptada && aceptada.tipo === 'condicion' && aceptada.filas.length === 1 && aceptada.filas[0].si.p.periodo === 20, 'una condición del catálogo: da { tipo: \'condicion\', filas } como antes')
  m3.quita()
  // Las alertas (FilasAlerta sin movimientos): sin «+ cae / sube un %».
  const FA = require(R + '/components/FilasAlerta.js').default
  const m4 = D.monta(React.createElement(FA, { simbolo: 'AAPL', filas: [fila], onCambia: () => {} }), RDC); await D.espera(20)
  ok(!attr(m4.raiz, 'data-boton', 'anadir-movimiento') && attr(m4.raiz, 'data-boton', 'anadir-condicion-alerta'), 'en las alertas, solo «+ condición» (como antes)')
  m4.quita()

  console.log(fallos ? `\n${fallos} FALLOS` : '\nTodo en verde')
  process.exit(fallos ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
