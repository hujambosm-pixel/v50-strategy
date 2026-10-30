// scripts/comprobaciones/azar-reglas.js — vigila lib/azarReglas.js (paso 2 del Builder, azar re-simulado; docs/builder.md, §43). Solo
// velas INVENTADAS (un paseo aleatorio con semilla fija): no prueba ninguna estrategia real con precios reales.
//
// Uso:   node scripts/comprobaciones/azar-reglas.js                         (la versión corta de comunes.sh: unos segundos)
//        node scripts/comprobaciones/azar-reglas.js --mercados 200 --copias 1000   (la de verdad, con el tiempo de fiabilidad())
//
// Con 60 + 1.260 velas diarias inventadas y la estrategia «nuevo máximo de 20 velas» con cada salida de §42 (S1 stop fijo ATR × 2,
// S4 manda el más alto de S1 y el mínimo de 10 velas, S5 SuperTrend): copiasReSimuladas (percentil, mediana) y fiabilidad() (aprobados
// falsos). Lo mismo con fechas semanales para S4 (las mismas velas y la misma semilla: todo igual salvo el CAGR, que cuenta los años).
// La versión corta compara la huella de todo el resultado con la guardada (HUELLA): si cambia sin querer, falla. Termina en 0 si todo
// va bien.
const path = require('path')
const C0 = require('./cargador')
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? Number(process.argv[i + 1]) : d }
const MERCADOS = arg('mercados', 8), COPIAS = arg('copias', 200), CORTA = MERCADOS === 8 && COPIAS === 200
const HUELLA = '3ee29dbc'

;(async () => {
  await C0.prepara(); C0.registra(C0.RAIZ)
  const AR = require(path.join(C0.RAIZ, 'lib/azarReglas.js'))
  const { generador, semillaDe } = require(path.join(C0.RAIZ, 'lib/azar.js'))
  const { interpreta } = require(path.join(C0.RAIZ, 'lib/editor/interprete.js'))
  const { validaDefinicion } = require(path.join(C0.RAIZ, 'lib/editor/definicion.js'))

  // Paseo aleatorio con rachas de volatilidad: OHLC coherente por construcción.
  const inventa = (n, paso) => {
    const rnd = generador(semillaDe('azarReglas|velas')), out = []
    let c = 100, vol = 0.012
    for (let i = 0, d = Date.UTC(2019, 0, 7); out.length < n; d += paso * 864e5) {
      if (paso === 1 && [0, 6].includes(new Date(d).getUTCDay())) continue
      vol = Math.min(0.04, Math.max(0.006, vol * (0.9 + 0.2 * rnd())))
      const o = c * (1 + vol * (rnd() - 0.5) * 0.5), cl = o * (1 + vol * (rnd() - 0.48) * 2.5)
      out.push({ date: new Date(d).toISOString().slice(0, 10), open: o, high: Math.max(o, cl) * (1 + vol * rnd()), low: Math.min(o, cl) * (1 - vol * rnd()), close: cl, volume: 1000 })
      c = cl; i++
    }
    return out
  }
  const diarias = inventa(1320, 1), semanales = inventa(1320, 7)
  const def = (nombre, stops, extra = {}) => ({ tipo: 'editor', formato: 1, motor: 1, nombre, parametros: { version: 1, lista: [] },
    entrada: { senal: { c: 'nuevoMaximo', p: { n: 20 } }, orden: { tipo: 'apertura' } }, stops, salidas: [], ...extra })
  const atrCompra = { id: 'atrCompra1', tipo: 'atrCompra', motivo: 'stop', k: 2, periodo: 14, historialAlEntrar: true }
  const minimo10 = { id: 'minimoMovil1', tipo: 'minimoMovil', motivo: 'stop_minimo', n: 10, historialAlEntrar: true }
  const casos = [['S1', def('S1', [atrCompra]), diarias], ['S4', def('S4', [atrCompra, minimo10], { stopsModo: 'masAlto' }), diarias],
    ['S5', def('S5', [{ id: 'supertrend1', tipo: 'supertrend', motivo: 'stop_supertrend', periodo: 10, k: 3, historialAlEntrar: true }]), diarias],
    ['S4 semanal', def('S4', [atrCompra, minimo10], { stopsModo: 'masAlto' }), semanales]]
  const f2 = (x) => x == null ? null : Math.round(x * 1e6) / 1e6
  const res = []
  let fallos = 0
  for (const [id, d, velas] of casos) {
    if (validaDefinicion(d).length) throw new Error(`${id} no es válida`)
    const desde = velas[60].date, r = interpreta(d, velas)
    const reales = r.openPosition ? [...r.trades, r.openPosition] : r.trades
    const t0 = Date.now()
    const c = AR.copiasReSimuladas(velas, d, reales, { n: COPIAS, semilla: `azarReglas|${d.nombre}`, desde })
    const t1 = Date.now()
    const fi = AR.fiabilidad(velas, d, { mercados: MERCADOS, copias: COPIAS, semilla: `azarReglas|${d.nombre}`, desde })
    const t2 = Date.now()
    if (!(c.copias.length === COPIAS && c.copias.every(x => Number.isFinite(x.cagr) && x.caida >= 0 && x.caida < 100 && x.operaciones >= 0))) { fallos++; console.log(`✗ ${id}: copias raras`) }
    const v = AR.veredicto({ aprobadosFalsos: fi.pct, periodos: [{ percentil: c.percentil, operaciones: c.real.operaciones }, { percentil: c.percentil, operaciones: c.real.operaciones }] })
    console.log(`${id.padEnd(10)} ${velas.length - 60} velas · ${c.real.operaciones} operaciones · tasa ${c.tasa.toFixed(4)} · CAGR ${c.real.cagr.toFixed(2)} % (caída ${c.real.caida.toFixed(1)} %) · mediana de las copias ${c.mediana.toFixed(2)} % · percentil ${c.percentil.toFixed(1)} · ${((t1 - t0) / 1000).toFixed(1)} s`)
    console.log(`${''.padEnd(10)} fiabilidad: ${fi.aprobados} de ${fi.mercados} mercados con aprobado falso = ${fi.pct.toFixed(1)} % [${fi.intervalo.map(x => x.toFixed(1)).join('–')}] · ${((t2 - t1) / 1000).toFixed(1)} s · veredicto de ejemplo: ${v.texto}${v.pocasOperaciones ? ' (pocas operaciones)' : ''}`)
    res.push([id, c.real.operaciones, f2(c.tasa), f2(c.real.cagr), f2(c.real.caida), f2(c.mediana), f2(c.percentil), c.copias.slice(0, 5).map(x => [f2(x.cagr), f2(x.caida), x.operaciones]), fi.aprobados, fi.sinOperaciones, f2(fi.tasa)])
  }
  const h = semillaDe(JSON.stringify(res)).toString(16).padStart(8, '0')
  if (CORTA) {
    const bien = h === HUELLA
    if (!bien) fallos++
    console.log(`${bien ? '✓' : '✗'} huella de azarReglas: ${h}${bien ? '' : ` (guardada: ${HUELLA})`}`)
  } else console.log(`huella (solo cuenta la de la versión corta): ${h}`)
  process.exit(fallos ? 1 : 0)
})().catch(e => { console.error(e); process.exit(2) })
