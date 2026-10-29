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
  console.log(fallos ? `sintéticas: ${fallos} fallos` : 'sintéticas: todas bien')
  process.exit(fallos ? 1 : 0)
})().catch(e => { console.error(e); process.exit(2) })
