// scripts/calibracionCartera3.js — CALIBRACIÓN de CARTERA_3 (mezcla con filtro de tendencia, criterio 7).
//
//   node scripts/calibracionCartera3.js [universos=200] [--escribe]
//
// Cada variante de CARTERA_3, tal cual, sobre universos SINTÉTICOS sin ninguna ventaja posible: el QQQ como paseo aleatorio
// geométrico (sin autocorrelación) con la deriva y la volatilidad diarias del QQQ real con dividendos en 1999–2025 (media
// logarítmica 0,000394, volatilidad 1,70 %, el 27,6 % de la varianza en la noche), en el calendario de días laborables del
// periodo total (desde el 10/03/1999, como el QQQ real: sin datos antes para calentar la media), y el ETF construido a
// diario como en V9.984 (lib/etfSintetico.js: k × el rendimiento del QQQ menos la comisión, (k − 1) × el tipo a corto real
// de ese día y el ajuste calibrado). Liquidez al 0 %. Mismo motor que la API (ejecutaPeriodoCartera, 1000 simulaciones del
// azar por bloques FUERA, medida CAGR / caída máxima). FALSO APROBADO: percentil >= 95 en el periodo total. CALIBRADA si
// los falsos aprobados son <= CRITERIOS[7].maxFalsosAprobados %. Las variantes se reparten entre procesos (una por proceso).
// Con --escribe lo guarda en lib/calibracionLab.json (clave CARTERA_3) junto a la huella del lote. No lee la base de datos
// ni la red.
const path = require('path'), fs = require('fs'), { fork } = require('child_process'), os = require('os')
const RAIZ = path.join(__dirname, '..')
const { preparaEsm } = require('./guardian/cargaEsm')
const NU = Number(process.argv.find(a => /^\d+$/.test(a)) || 200), ESCRIBE = process.argv.includes('--escribe'), iV = process.argv.indexOf('--variante')
const MU = 0.000394, SIGMA = 0.01701, FRAC_NOCHE = 0.276, N_SIM = 1000, SEMILLA = 20261018, DESDE = '1999-03-10', HASTA = '2025-12-31'

// Una variante (en su propio proceso): devuelve sus números al proceso principal.
async function variante(id) {
  await preparaEsm()
  const C = require(path.join(RAIZ, 'lib/laboratorioCartera')), S = require(path.join(RAIZ, 'lib/etfSintetico')), Lab = require(path.join(RAIZ, 'lib/lotesLab')), { generador, semillaDeActivo } = require(path.join(RAIZ, 'lib/azar'))
  const it = Lab.CARTERA_3.items.find(x => x.id === id), k = it.etf === 'x3' ? 3 : 2, sc = Lab.CARTERA_3.comun.sinteticos, periodo = it.periodos.find(p => p.total)
  const normal = (rnd) => { let u = 0; while (!u) u = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd()) }
  const fechas = []; for (let d = new Date(Date.parse(DESDE + 'T00:00:00Z')); d.toISOString().slice(0, 10) <= HASTA; d.setUTCDate(d.getUTCDate() + 1)) if (d.getUTCDay() % 6) fechas.push(d.toISOString().slice(0, 10))
  const sn = SIGMA * Math.sqrt(FRAC_NOCHE), sd = SIGMA * Math.sqrt(1 - FRAC_NOCHE)
  const xs = [], t0 = Date.now()
  for (let u = 0; u < NU; u++) {
    const rnd = generador(semillaDeActivo(SEMILLA, `u${u}`)), q = []   // el mismo QQQ para todas las variantes
    let c = 100
    for (const date of fechas) { const o = c * Math.exp(MU * FRAC_NOCHE + sn * normal(rnd)), cl = o * Math.exp(MU * (1 - FRAC_NOCHE) + sd * normal(rnd)); q.push({ date, open: o, high: Math.max(o, cl), low: Math.min(o, cl), close: cl, volume: 1 }); c = cl }
    const etf = S.construyeSintetico(q, { k, comision: sc.comision[k], ajuste: sc.ajuste[k] })
    const datos = C.alineaDatos({ qqq: q, etf: { simbolo: 'SINTETICO', velas: etf }, spy: q }, { QQQ: [], SPY: [], SINTETICO: [] })
    const r = C.ejecutaPeriodoCartera({ datos, regla: it.regla, periodo, nSim: N_SIM, semilla: semillaDeActivo(SEMILLA, `${id}|u${u}`), puntosCurva: 1e9 })
    xs.push({ percentil: r.azar.percentil, ciclos: r.ciclos, mejora: r.mejoraMezcla, tiempoFuera: r.filtro.tiempoFuera })
  }
  const conCiclos = xs.filter(x => x.percentil != null), aprob = conCiclos.filter(x => x.percentil >= 95).length, d = new Array(10).fill(0)
  for (const x of conCiclos) d[Math.min(9, Math.floor(x.percentil / 10))]++
  const pct = conCiclos.length ? Math.round(aprob / conCiclos.length * 1000) / 10 : null, r1 = (x) => Math.round(x * 10) / 10
  return { nombre: it.nombre, universos: conCiclos.length, sinCiclos: xs.length - conCiclos.length, aprobados: aprob, pctAprobados: pct,
    percentilMedio: conCiclos.length ? r1(conCiclos.reduce((a, x) => a + x.percentil, 0) / conCiclos.length) : null, deciles: d,
    ciclosMedios: r1(xs.reduce((a, x) => a + x.ciclos, 0) / xs.length), tiempoFueraMedio: r1(xs.reduce((a, x) => a + x.tiempoFuera, 0) / xs.length * 100),
    pctMejoraMezcla: r1(xs.filter(x => x.mejora).length / xs.length * 100), calibrada: pct != null && pct <= Lab.CRITERIOS[7].maxFalsosAprobados, segundos: Math.round((Date.now() - t0) / 1000) }
}

if (iV > 0) variante(process.argv[iV + 1]).then(x => { process.send(x); process.exit(0) }).catch(e => { console.error('FALLO', e.stack || e); process.exit(1) })
else (async () => {
  await preparaEsm()
  const Lab = require(path.join(RAIZ, 'lib/lotesLab')), ids = Lab.CARTERA_3.items.map(i => i.id), items = {}, t0 = Date.now(), P = Math.max(1, Math.min(ids.length, os.cpus().length - 1))
  const cola = [...ids]
  await Promise.all(Array.from({ length: P }, async () => {
    while (cola.length) {
      const id = cola.shift()
      items[id] = await new Promise((ok, mal) => { const h = fork(__filename, [String(NU), '--variante', id]); let x = null; h.on('message', m => { x = m }); h.on('exit', c => c === 0 && x ? ok(x) : mal(new Error(`${id}: código ${c}`))) })
      console.log(`  ${id} hecho · ${items[id].segundos} s (${((Date.now() - t0) / 1000).toFixed(0)} s en total)`)
    }
  }))
  console.log(`\nCalibración de CARTERA_3 · ${NU} universos sintéticos sin ventaja (QQQ en paseo aleatorio: media log ${MU}, volatilidad ${SIGMA} diarias, ${FRAC_NOCHE * 100} % de la varianza en la noche; ETF sintético de V9.984; liquidez al 0 %) · ${N_SIM} simulaciones · ${P} procesos`)
  console.log('| Variante | Periodos FUERA medios | Tiempo fuera medio | >= 95 en el total (falsos aprobados) | Percentil medio | Deciles 0–10 … 90–100 | Mejora a la mezcla (informativo) | ¿Calibrada? |\n|---|---|---|---|---|---|---|---|')
  for (const id of ids) { const x = items[id]; console.log(`| ${id} ${x.nombre} | ${x.ciclosMedios} | ${x.tiempoFueraMedio} % | ${x.pctAprobados} % (${x.aprobados}/${x.universos}${x.sinCiclos ? `, ${x.sinCiclos} sin ciclos` : ''}) | ${x.percentilMedio} | ${x.deciles.join(' · ')} | ${x.pctMejoraMezcla} % | ${x.calibrada ? 'sí' : 'NO'} |`) }
  console.log(`\n${((Date.now() - t0) / 1000).toFixed(0)} s en total`)
  if (ESCRIBE) {
    const ruta = path.join(RAIZ, 'lib/calibracionLab.json'), actual = JSON.parse(fs.readFileSync(ruta, 'utf8') || '{}')
    actual.CARTERA_3 = { huellaLote: Lab.CARTERA_3_HASH, version: process.env.VERSION_LAB || null, fecha: new Date().toISOString().slice(0, 10),
      metodo: 'QQQ en paseo aleatorio geométrico sin autocorrelación (calendario laborable desde el 10/03/1999, sin calentamiento); ETF sintético de V9.984 (k × rendimiento − comisión − (k − 1) × tipo a corto real − ajuste); liquidez al 0 %; falso aprobado: percentil del CAGR / caída máxima >= 95 en el periodo total',
      parametros: { universos: NU, derivaLogDiaria: MU, volatilidadDiaria: SIGMA, fraccionNoche: FRAC_NOCHE, nSim: N_SIM, semilla: SEMILLA, desde: DESDE, hasta: HASTA },
      umbralFalsosAprobados: Lab.CRITERIOS[7].maxFalsosAprobados, items: Object.fromEntries(ids.map(id => { const { segundos, ...x } = items[id]; return [id, x] })) }
    fs.writeFileSync(ruta, JSON.stringify(actual, null, 1) + '\n')
    console.log(`Escrito lib/calibracionLab.json (CARTERA_3, huella ${Lab.CARTERA_3_HASH.slice(0, 12)}…)`)
  }
})().catch(e => { console.error('FALLO', e.stack || e); process.exit(1) })
