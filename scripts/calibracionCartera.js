// scripts/calibracionCartera.js — CALIBRACIÓN del laboratorio de CARTERA (CARTERA_1, criterio 5).
//
//   node scripts/calibracionCartera.js [universos=50] [--escribe]
//
// Cada variante de CARTERA_1, tal cual, sobre universos SINTÉTICOS sin ninguna ventaja posible: el QQQ como paseo aleatorio
// geométrico (sin autocorrelación) con la deriva y la volatilidad diarias del QQQ real en 2008–2025 (media logarítmica
// 0,00055, volatilidad 1,42 %, el 34 % de la varianza en la noche), y el ETF construido a diario: L × el rendimiento del
// QQQ en la noche y en el día, con un coste anual (el medido en el QLD frente a 2× y en el TQQQ frente a 3×: 1,2 % y
// 2,6 %). La duración es la del periodo total de la variante (más 300 velas de calentamiento). Mismo motor que la API
// (ejecutaPeriodoCartera, 1000 simulaciones del azar). FALSO APROBADO: percentil del CAGR >= 95 en el total. CALIBRADA si
// los falsos aprobados son <= CRITERIOS[5].maxFalsosAprobados %. Con --escribe lo guarda en lib/calibracionLab.json (clave
// CARTERA_1) junto a la huella del lote. No lee la base de datos ni la red.
const path = require('path'), fs = require('fs')
const RAIZ = path.join(__dirname, '..')
const { preparaEsm } = require('./guardian/cargaEsm')
const NU = Number(process.argv.find(a => /^\d+$/.test(a)) || 50), ESCRIBE = process.argv.includes('--escribe')
const MU = 0.00055, SIGMA = 0.0142, FRAC_NOCHE = 0.34, COSTE = { 2: 0.012, 3: 0.026 }, CAL = 300, N_SIM = 1000, SEMILLA = 20261017
;(async () => {
  await preparaEsm()
  const C = require(path.join(RAIZ, 'lib/laboratorioCartera')), Lab = require(path.join(RAIZ, 'lib/lotesLab')), { generador, semillaDeActivo } = require(path.join(RAIZ, 'lib/azar'))
  const normal = (rnd) => { let u = 0; while (!u) u = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd()) }
  const fechasDesde = (inicio, n) => { const out = [], d = new Date(Date.parse(inicio + 'T00:00:00Z')); while (out.length < n) { if (d.getUTCDay() % 6) out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1) } return out }
  const universo = (u, fechas, L) => {
    const rnd = generador(semillaDeActivo(SEMILLA, `u${u}|${fechas.length}`)), sn = SIGMA * Math.sqrt(FRAC_NOCHE), sd = SIGMA * Math.sqrt(1 - FRAC_NOCHE), q = [], e = []
    let c = 100, ce = 100
    for (const date of fechas) {
      const o = c * Math.exp(MU * FRAC_NOCHE + sn * normal(rnd)), cl = o * Math.exp(MU * (1 - FRAC_NOCHE) + sd * normal(rnd))
      const oe = ce * (1 + L * (o / c - 1)), cle = oe * (1 + L * (cl / o - 1)) * (1 - COSTE[L] / 252)
      q.push({ date, open: o, high: Math.max(o, cl), low: Math.min(o, cl), close: cl, volume: 1 }); e.push({ date, open: oe, high: Math.max(oe, cle), low: Math.min(oe, cle), close: cle, volume: 1 })
      c = cl; ce = cle
    }
    return C.alineaDatos({ qqq: q, etf: { simbolo: 'ETF', velas: e }, spy: q }, { QQQ: [], ETF: [], SPY: [] })
  }
  const items = {}, t0 = Date.now()
  for (const it of Lab.CARTERA_1.items) {
    const tot = it.periodos.find(p => p.total), L = it.etf === 'QLD' ? 2 : 3
    const n = Math.round((Date.parse(tot.hasta) - Date.parse(tot.desde)) / 864e5 / 7 * 5) + CAL + 10, fechas = fechasDesde('2000-01-03', n)
    const periodo = { desde: fechas[CAL], hasta: fechas[n - 6], total: true }
    const xs = []
    for (let u = 0; u < NU; u++) {
      const datos = universo(u, fechas, L)
      const r = C.ejecutaPeriodoCartera({ datos, regla: it.regla, periodo, nSim: N_SIM, semilla: semillaDeActivo(SEMILLA, `${it.id}|u${u}`) })
      xs.push({ percentil: r.azar.percentil, ciclos: r.ciclos, superaQqq: r.supera.qqq })
    }
    const conCiclos = xs.filter(x => x.percentil != null), aprob = conCiclos.filter(x => x.percentil >= 95).length, d = new Array(10).fill(0)
    for (const x of conCiclos) d[Math.min(9, Math.floor(x.percentil / 10))]++
    const pct = conCiclos.length ? Math.round(aprob / conCiclos.length * 1000) / 10 : null
    items[it.id] = { nombre: it.nombre, universos: conCiclos.length, sinCiclos: xs.length - conCiclos.length, aprobados: aprob, pctAprobados: pct,
      percentilMedio: conCiclos.length ? Math.round(conCiclos.reduce((a, x) => a + x.percentil, 0) / conCiclos.length * 10) / 10 : null, deciles: d,
      ciclosMedios: Math.round(xs.reduce((a, x) => a + x.ciclos, 0) / xs.length * 10) / 10, pctSuperaQqq: Math.round(xs.filter(x => x.superaQqq).length / xs.length * 1000) / 10,
      calibrada: pct != null && pct <= Lab.CRITERIOS[5].maxFalsosAprobados }
    console.log(`  ${it.id} hecho · ${((Date.now() - t0) / 1000).toFixed(0)} s`)
  }
  console.log(`\nCalibración de CARTERA_1 · ${NU} universos sintéticos sin ventaja (QQQ en paseo aleatorio: media log ${MU}, volatilidad ${SIGMA} diarias; ETF x2 con ${COSTE[2] * 100} % y x3 con ${COSTE[3] * 100} % de coste anual) · ${N_SIM} simulaciones`)
  console.log('| Variante | Ciclos medios | >= 95 en el total (falsos aprobados) | Percentil medio | Deciles 0–10 … 90–100 | Supera al QQQ (informativo) | ¿Calibrada? |\n|---|---|---|---|---|---|---|')
  for (const [id, x] of Object.entries(items)) console.log(`| ${id} ${x.nombre} | ${x.ciclosMedios} | ${x.pctAprobados} % (${x.aprobados}/${x.universos}${x.sinCiclos ? `, ${x.sinCiclos} sin ciclos` : ''}) | ${x.percentilMedio} | ${x.deciles.join(' · ')} | ${x.pctSuperaQqq} % | ${x.calibrada ? 'sí' : 'NO'} |`)
  console.log(`\n${((Date.now() - t0) / 1000).toFixed(0)} s en total`)
  if (ESCRIBE) {
    const ruta = path.join(RAIZ, 'lib/calibracionLab.json'), actual = JSON.parse(fs.readFileSync(ruta, 'utf8') || '{}')
    actual.CARTERA_1 = { huellaLote: Lab.CARTERA_1_HASH, version: process.env.VERSION_LAB || null, fecha: new Date().toISOString().slice(0, 10),
      metodo: 'QQQ en paseo aleatorio geométrico sin autocorrelación; ETF = L × rendimiento del QQQ en la noche y en el día, menos el coste anual repartido por días; falso aprobado: percentil del CAGR >= 95 en el periodo total',
      parametros: { universos: NU, derivaLogDiaria: MU, volatilidadDiaria: SIGMA, fraccionNoche: FRAC_NOCHE, costeAnual: COSTE, nSim: N_SIM, semilla: SEMILLA },
      umbralFalsosAprobados: Lab.CRITERIOS[5].maxFalsosAprobados, items }
    fs.writeFileSync(ruta, JSON.stringify(actual, null, 1) + '\n')
    console.log(`Escrito lib/calibracionLab.json (CARTERA_1, huella ${Lab.CARTERA_1_HASH.slice(0, 12)}…)`)
  }
})().catch(e => { console.error('FALLO', e.stack || e); process.exit(1) })
