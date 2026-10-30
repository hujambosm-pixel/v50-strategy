// scripts/comprobaciones/sinteticas.js — pruebas del motor con velas inventadas y el resultado calculado a mano (docs/builder.md, §41).
// Las corre comunes.sh. Termina en 0 si todas dan lo calculado.
//
// 1 · El stop «trailing» con «manda el más alto» (V9.1079). Regla: en cada vela manda el más alto de los stops activos, y el stop
//     nunca baja. Compra a 100 a la apertura de la vela 3 (la 2 cierra a 100,5, por encima del máximo de las 2 anteriores, 100); stop
//     fijo del 8 % = 92; trailing «cierre − 1 × ATR (1)» (el ATR de 1 vela es el rango verdadero de esa vela) que se mira en cada vela
//     (la condición «cierre ≤ su SMA de 1» siempre se cumple). Candidato de cada vela cerrada, en vigor desde la siguiente:
//       vela 2: 100,5 − 10 = 90,5 · vela 3: 101 − 7 = 94 · vela 4: 102 − 6 = 96 · vela 5: 101 − 6 = 95 · vela 6: 102 − 4 = 98
//     → el stop que manda en las velas 3, 4, 5, 6 y 7: 92, 94, 96, 96 (el 95 no lo baja), 98. La vela 7 abre a 101 y baja a 97 →
//     vende a 98. Con la vela 7 abriendo a 97,50 (por debajo del stop), vende a la apertura, 97,50.
// 2 · «Últimos N años» en el paso 1 = en «Backtest de un valor» (V9.1080): más abajo.
const path = require('path')
const C0 = require('./cargador')
let fallos = 0
const ok = (c, t) => { console.log(`${c ? 'OK  ' : 'MAL '} ${t}`); if (!c) fallos++ }
const velas = (xs) => xs.map(([open, high, low, close], i) => ({ date: new Date(Date.UTC(2020, 0, 1) + i * 864e5).toISOString().slice(0, 10), open, high, low, close, volume: 1000 }))
;(async () => {
  await C0.prepara(); C0.registra(C0.RAIZ)
  const { interpreta } = require(path.join(C0.RAIZ, 'lib/editor/interprete.js'))
  const { validaDefinicion } = require(path.join(C0.RAIZ, 'lib/editor/definicion.js'))
  const def = { tipo: 'editor', formato: 1, motor: 1, nombre: 'trailing + manda el más alto', parametros: { version: 1, lista: [] },
    entrada: { senal: { c: 'nuevoMaximo', p: { n: 2 } }, orden: { tipo: 'apertura' } },
    stops: [{ id: 'porcentaje1', tipo: 'porcentaje', motivo: 'stop', pct: 8, historialAlEntrar: true },
      { id: 'trailing2', tipo: 'trailing', motivo: 'trailing_exit', si: { c: 'precioVsMedia', p: { tipo: 'SMA', periodo: 1, lado: 'debajo', comparacion: '≥' } }, nivel: { atr: { k: 1, periodo: 1 } }, historial: 'siSube', fechaHistorial: 'vela' }],
    stopsModo: 'masAlto', salidas: [] }
  ok(validaDefinicion(def).length === 0, `la definición es válida ${validaDefinicion(def).join(' ')}`)
  const base = [[99, 100, 98, 99], [99, 100, 98, 99.5], [99.5, 101, 91, 100.5], [100, 103, 96, 101], [101, 103, 97, 102], [102, 103, 97, 101], [101, 103, 99, 102]]
  for (const [nombre, v7, salida] of [['toca el stop dentro de la vela', [101, 101.5, 97, 99], 98], ['abre por debajo del stop', [97.5, 99, 96, 98], 97.5]]) {
    const v = velas([...base, v7]), r = interpreta(def, v), t = r.trades[0], k = (d) => v.findIndex(b => b.date === d)
    const hist = t ? t.stopHistory.map(h => [k(h.date), h.stopPx]) : null
    ok(r.trades.length === 1 && k(t.entryDate) === 3 && t.entryPrice === 100, `${nombre}: compra en la vela 3 a 100`)
    ok(JSON.stringify(hist) === '[[3,92],[4,94],[5,96],[7,98]]', `${nombre}: el stop que manda es 92, 94, 96, 96, 98 (historial ${JSON.stringify(hist)})`)
    ok(t && k(t.exitDate) === 7 && t.exitPrice === salida && t.stopPx === 98, `${nombre}: vende en la vela 7 a ${salida} (obtenido: ${t ? `${k(t.exitDate)} a ${t.exitPrice}, stop ${t.stopPx}` : 'nada'})`)
  }
  // 2 · «Últimos N años» en el paso 1 (V9.1080) = «Últimos N años» en «Backtest de un valor». Velas inventadas (una por día de lunes a
  //     viernes, de 2012 hasta ayer: subidas y bajadas de 60 velas sobre una tendencia) y la estrategia de la línea bajista con su stop
  //     EMA. «Backtest de un valor» pide years: 5 al núcleo (pages/api/datos.js → lib/backtestActivo.js, normalizaPeriodo) y calcula
  //     las cifras como pages/index.js (calcMetrics y el Max Drawdown vela a vela); el paso 1 pasa a cifrasRegla las fechas de
  //     normalizaPeriodo({ years: 5 }). A mano: el inicio es hoy − 5 años y el fin, hoy; la primera vela, la primera de lunes a
  //     viernes desde ese día; la última, la de ayer.
  {
    const { backtestActivo } = require(path.join(C0.RAIZ, 'lib/backtestActivo.js'))
    const { cifrasRegla } = require(path.join(C0.RAIZ, 'lib/builder/ensayo.js'))
    const { normalizaPeriodo } = require(path.join(C0.RAIZ, 'lib/periodo.js'))
    const { calcMetrics, metricasSinOperaciones } = require(path.join(C0.RAIZ, 'lib/utils.js'))
    const { curvasVelaAVela, caidaMaxima } = require(path.join(C0.RAIZ, 'lib/ddVelaAVela.js'))
    const { normalizaComisiones } = require(path.join(C0.RAIZ, 'lib/comisiones.js'))
    const hoy = new Date().toISOString().slice(0, 10), xs = []
    for (let d = Date.UTC(2012, 0, 2), k = 0; new Date(d).toISOString().slice(0, 10) < hoy; d += 864e5) {
      const dia = new Date(d).getUTCDay(); if (dia === 0 || dia === 6) continue
      const c = 100 * Math.exp(0.0003 * k) * (1 + 0.12 * Math.sin(k / 60 * Math.PI)) + 3 * Math.sin(k * 1.7), o = c - Math.sin(k * 0.9)
      xs.push({ date: new Date(d).toISOString().slice(0, 10), open: o, high: Math.max(o, c) + 1 + Math.abs(Math.sin(k)), low: Math.min(o, c) - 1 - Math.abs(Math.cos(k)), close: c, volume: 1000 }); k++
    }
    const lb = { tipo: 'editor', formato: 1, motor: 1, nombre: 'Línea bajista + EMA10', parametros: { version: 1, lista: [], restricciones: [] },
      entrada: { senal: { c: 'rompeLineaBajista', p: { izquierda: 2, derecha: 2, velas: 120, siSube: 'unir' } }, orden: { tipo: 'apertura' } },
      stops: [{ id: 'nivel1', tipo: 'nivel', motivo: 'stop', de: [{ campo: 'low' }], historialAlEntrar: true }, { id: 'emaMinimo2', tipo: 'emaMinimo', motivo: 'trailing_exit', periodo: 10, historialAlEntrar: true }],
      stopsModo: 'masAlto', salidas: [] }
    const fetchAV = async () => xs.map(v => ({ ...v }))
    const b = await backtestActivo({ simbolo: 'SINT', codeJs: { definicion: lb }, stratParams: JSON.stringify({ intervalo: 'diario' }), stratName: lb.nombre, capital_ini: 10000, years: 5, allocation_pct: 100,
      filtros: [], intervalo: 'diario', fromDate: null, toDate: null, comisiones: normalizaComisiones(null) }, { fetchAV, grafico: false })
    const n = b._nucleo, me = n.metricas
    const m = calcMetrics(n.trades, 10000, me.capitalReinv, me.gananciaSimple, me.ganBH || 0, b.data[0].date, b.data[b.data.length - 1].date, 5) || metricasSinOperaciones(10000, me.ganBH || 0, b.data[0].date, b.data[b.data.length - 1].date, 5)
    const ddBV = caidaMaxima(curvasVelaAVela(n.trades, b.data, 10000, { comisiones: normalizaComisiones(null), allocationPct: 100 }).compuesta, 10000).maxDD
    const per = normalizaPeriodo({ years: 5 })
    const p1 = await cifrasRegla({ def: lb, valores: { intervalo: 'diario' }, intervalo: 'diario', simbolo: 'SINT', velas: { SINT: xs }, desde: per.desde, hasta: per.hasta })
    const inicio = new Date(Date.UTC(+hoy.slice(0, 4) - 5, +hoy.slice(5, 7) - 1, +hoy.slice(8, 10))).toISOString().slice(0, 10)
    const primera = xs.find(v => v.date >= inicio).date
    console.log(`     Backtest de un valor: ${b.desde} → ${b.hasta} · velas ${b.data[0].date} … ${b.data[b.data.length - 1].date} · ${m.n} operaciones · CAGR ${m.cagrC} · Max DD ${ddBV}`)
    console.log(`     Paso 1:               ${per.desde} → ${per.hasta} · velas ${p1.desde} … ${p1.hasta} · ${p1.regla.operaciones} operaciones · CAGR ${p1.regla.cagr} · Max DD ${p1.regla.maxDD}`)
    ok(per.desde === inicio && b.desde === inicio && per.hasta === hoy && b.hasta === hoy, `«Últimos 5 años»: del ${inicio} (hoy − 5 años) a hoy (${hoy}) en las dos pantallas`)
    ok(p1.desde === primera && b.data[0].date === primera && p1.hasta === xs[xs.length - 1].date && b.data[b.data.length - 1].date === xs[xs.length - 1].date, `primera vela ${primera} y última ${xs[xs.length - 1].date} en las dos`)
    ok(m.n > 0 && p1.regla.operaciones === m.n && p1.regla.cagr === m.cagrC && p1.regla.maxDD === ddBV, `mismas operaciones (${m.n}), mismo CAGR y mismo Max Drawdown`)
    ok(p1.bh.cagr === m.cagrBH, 'comprar y mantener el mismo valor: el mismo CAGR')
  }
  // 3 · Paso 2 · azar re-simulado (lib/azarReglas.js, §43): la operación que abre una entrada forzada, calculada a mano. 15 velas;
  //     compra a la apertura de la vela 2 (101) y de la 9 (99). ATR(1) = el rango verdadero de la vela: vela 1 = 102 − 99 = 3; vela 8 =
  //     97,5 − 97 = 0,5. Mínimo de 3 velas: el menor mínimo de las 3 anteriores (en la 2 aún no hay 3: sin stop).
  //     S1 stop fijo ATR(1) × 2. Entrada 2: 101 − 6 = 95; ningún mínimo lo toca hasta la vela 14, que abre a 94 → vende a 94 (12 velas).
  //        Entrada 9: 99 − 1 = 98; la vela 11 baja a 97,8 → vende a 98 (2 velas).
  //     S3 mínimo de 3 velas. Entrada 2: velas 3–6 → 99, 99, 100, 101; la 6 abre a 102 y baja a 99,5 → vende a 101 (4 velas).
  //        Entrada 9: velas 9–12 → 96,5, 96,5, 97, 97,8; la 12 abre a 98,4 y baja a 97,6 → vende a 97,8 (3 velas).
  //     S4 manda el más alto de S1 y S3. Entrada 2: 95, 99, 99, 100, 101 → vende a 101 en la 6 (manda S3). Entrada 9: 98 (S1 > 96,5,
  //        96,5, 97) → vende a 98 en la 11 (manda S1).
  //     Y la tasa de entradas: 4 operaciones con 80 velas sin posición → 0,05.
  {
    const AR = require(path.join(C0.RAIZ, 'lib/azarReglas.js'))
    const v = velas([[100, 101, 99, 100], [100, 102, 99, 101], [101, 104, 100, 103], [103, 105, 101, 104], [104, 106, 102, 105], [105, 106, 101, 102],
      [102, 103, 99.5, 100], [100, 100.5, 96.5, 97], [97, 97.5, 97, 97.2], [99, 100, 98.5, 99.8], [99.8, 101, 99, 100.5], [100.5, 101, 97.8, 98.4],
      [98.4, 99, 97.6, 98.9], [98.9, 99.5, 98, 98.2], [94, 95, 93, 94.5]])
    const base = (nombre, stops, extra = {}) => ({ tipo: 'editor', formato: 1, motor: 1, nombre, parametros: { version: 1, lista: [] },
      entrada: { senal: { c: 'nuevoMaximo', p: { n: 2 } }, orden: { tipo: 'apertura' } }, stops, salidas: [], ...extra })
    const s1 = { id: 'atrCompra1', tipo: 'atrCompra', motivo: 'stop', k: 2, periodo: 1, historialAlEntrar: true }
    const s3 = { id: 'minimoMovil1', tipo: 'minimoMovil', motivo: 'stop_minimo', n: 3, historialAlEntrar: true }
    const casos = [['S1 stop fijo ATR × 2', base('S1', [s1]), [[2, 14, 94], [9, 11, 98]]], ['S3 mínimo de 3 velas', base('S3', [s3]), [[2, 6, 101], [9, 12, 97.8]]],
      ['S4 manda el más alto', base('S4', [s1, s3], { stopsModo: 'masAlto' }), [[2, 6, 101], [9, 11, 98]]]]
    for (const [nombre, d, esperado] of casos) {
      ok(validaDefinicion(d).length === 0, `${nombre}: la definición es válida ${validaDefinicion(d).join(' ')}`)
      const tab = AR.tablaSalidas(v, d), obt = esperado.map(([e]) => [e, tab.salida[e], tab.precio[e]])
      ok(JSON.stringify(obt) === JSON.stringify(esperado) && esperado.every(([e, x]) => tab.velasDe(e) === x - e),
        `${nombre}: tablaSalidas de las entradas 2 y 9 = ${esperado.map(([e, x, p]) => `vela ${x} a ${p}`).join(', ')} (obtenido: ${obt.map(([, x, p]) => `vela ${x} a ${p}`).join(', ')})`)
      // Las mismas operaciones con interpreta y las entradas forzadas en 2 y 9 (S1 sigue dentro en la 9: una sola).
      const r = interpreta(d, v, {}, { entradasForzadas: new Set([2, 9]) }), k = (f) => v.findIndex(b => b.date === f)
      const dir = r.trades.map(t => [k(t.entryDate), k(t.exitDate), t.exitPrice]), quiere = d.nombre === 'S1' ? [esperado[0]] : esperado
      ok(JSON.stringify(dir) === JSON.stringify(quiere), `${nombre}: interpreta con entradas forzadas en 2 y 9 da ${JSON.stringify(dir)}`)
    }
    // Sin la opción, el intérprete no cambia: con la señal de siempre (nuevo máximo de 2 velas) no hay ninguna entrada forzada.
    ok(JSON.stringify(interpreta(casos[1][1], v)) === JSON.stringify(interpreta(casos[1][1], v, {}, {})), 'sin entradasForzadas, el mismo resultado')
    const fechas = Array.from({ length: 101 }, (_, i) => new Date(Date.UTC(2020, 0, 1) + i * 864e5).toISOString().slice(0, 10))
    const plana = fechas.map(date => ({ date, open: 100, high: 101, low: 99, close: 100, volume: 1000 }))
    const ops = [[1, 6], [20, 25], [40, 45], [60, 65]].map(([e, x]) => ({ entryDate: fechas[e], exitDate: fechas[x], entryPrice: 100, exitPrice: 100 }))
    const ta = AR.tasaDeEntradas(plana, ops)
    ok(ta.operaciones === 4 && ta.libres === 80 && ta.tasa === 0.05, `tasa de entradas: 4 operaciones / 80 velas sin posición = 0,05 (obtenido: ${ta.operaciones} / ${ta.libres} = ${ta.tasa})`)
    // Semanales: la misma tabla con las fechas de una vela por semana (solo cambian las fechas).
    const sem = v.map((b, i) => ({ ...b, date: new Date(Date.UTC(2020, 0, 6) + i * 7 * 864e5).toISOString().slice(0, 10) }))
    const t1 = AR.tablaSalidas(v, casos[2][1]), t2 = AR.tablaSalidas(sem, casos[2][1])
    ok(JSON.stringify([...t1.salida, ...t1.precio]) === JSON.stringify([...t2.salida, ...t2.precio]), 'semanales: la misma tabla')
  }
  console.log(fallos ? `sintéticas: ${fallos} fallos` : 'sintéticas: todas bien')
  process.exit(fallos ? 1 : 0)
})().catch(e => { console.error(e); process.exit(2) })
