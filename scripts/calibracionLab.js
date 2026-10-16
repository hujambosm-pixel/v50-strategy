// scripts/calibracionLab.js — CALIBRACIÓN del laboratorio de ESTRATEGIAS COMPLETAS (LOTE_3, criterio 4).
//
//   node scripts/calibracionLab.js [universos=50] [--escribe]
//
// Aplica cada combinación del LOTE_3, tal cual, sobre universos SINTÉTICOS sin ninguna ventaja posible: paseo aleatorio
// geométrico (sin autocorrelación), 100 valores × 5 años, deriva y volatilidad diarias parecidas a las de los valores del
// Nasdaq-100, todos miembros todo el periodo; más dos estrategias de control (entrada con probabilidad 1/20 y salida con
// probabilidad fija). Mismo motor que la API (lib/laboratorioEstrategias.js, 1000 simulaciones). Por combinación: % de
// universos con percentil >= 95 (falsos aprobados en un periodo), percentil medio y deciles. CALIBRADA si los falsos
// aprobados son <= CRITERIOS[4].maxFalsosAprobados %. Con --escribe guarda el resultado en lib/calibracionLab.json junto a
// la huella del lote (si el lote cambia, la calibración deja de valer). No lee la base de datos ni la red.
const path = require('path'), fs = require('fs')
const RAIZ = path.join(__dirname, '..')
const { preparaEsm } = require('./guardian/cargaEsm')
const NU = Number(process.argv.find(a => /^\d+$/.test(a)) || 50), ESCRIBE = process.argv.includes('--escribe')
const MU = 0.0006, SIGMA = 0.02, N_VALORES = 100, ANIOS = 5, CAL = 260, TRAS = 200, FRAC_NOCHE = 0.3, N_SIM = 1000, SEMILLA = 20261016
;(async () => {
  await preparaEsm()
  const E = require(path.join(RAIZ, 'lib/laboratorioEstrategias')), Ls = require(path.join(RAIZ, 'lib/laboratorioSalidas'))
  const S = require(path.join(RAIZ, 'lib/senales')), Lab = require(path.join(RAIZ, 'lib/lotesLab')), { generador, semillaDeActivo } = require(path.join(RAIZ, 'lib/azar'))
  // Días hábiles: CAL de calentamiento (la SMA 50 y el RSI necesitan velas antes), 5 años de periodo y TRAS después.
  const fechas = []
  for (let d = Date.UTC(2014, 11, 1); fechas.length < CAL + ANIOS * 252 + TRAS; d += 864e5) { const w = new Date(d).getUTCDay(); if (w && w < 6) fechas.push(new Date(d).toISOString().slice(0, 10)) }
  const desde = fechas[CAL], hasta = fechas[CAL + ANIOS * 252 - 1]
  const normal = (rnd) => { let u = 0; while (!u) u = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd()) }
  const serie = (rnd) => {
    const v = [], sn = SIGMA * Math.sqrt(FRAC_NOCHE), sd = SIGMA * Math.sqrt(1 - FRAC_NOCHE)
    let c = 100
    for (const date of fechas) {
      const o = c * Math.exp(MU * FRAC_NOCHE + sn * normal(rnd)), cl = o * Math.exp(MU * (1 - FRAC_NOCHE) + sd * normal(rnd))
      v.push({ date, open: o, high: Math.max(o, cl) * Math.exp(Math.abs(normal(rnd)) * SIGMA * 0.4), low: Math.min(o, cl) * Math.exp(-Math.abs(normal(rnd)) * SIGMA * 0.4), close: cl, volume: 1e6 })
      c = cl
    }
    return v
  }
  const tramos = [{ desde: '2000-01-01', hasta: null, excluido_motivo: null }]
  // Estrategias: las 12 del lote y dos controles.
  const delLote = (it) => ({ id: it.id, nombre: it.nombre, tope: S.topeDe(it.salidas), senalesDe: (v) => S.entradas(v, it), calcDe: (v) => { const cs = S.calculables(v, it), ci = Ls.calculablesIndicadores(v, S.indicadoresSalidas(it.salidas)); return ci.map((x, t) => x && cs[t]) }, decisionesDe: (v) => Ls.decisionesDe(v, it.salidas) })
  const control = (id, q) => ({ id, nombre: `Control: entrada con probabilidad 1/20, salida con probabilidad 1/${1 / q} (tope 120)`, tope: 120, control: true,
    senalesDe: (v) => { const rnd = generador(semillaDeActivo(SEMILLA, `${id}|entrada|${v[1].close.toFixed(8)}`)); return v.map(() => rnd() < 0.05) }, calcDe: (v) => v.map(() => true),
    decisionesDe: (v) => { const rnd = generador(semillaDeActivo(SEMILLA, `${id}|salida|${v[1].close.toFixed(8)}`)); return [() => rnd() < q] } })
  const ESTR = [...Lab.LOTE_3.items.map(delLote), control('C1', 1 / 10), control('C2', 1 / 40)]
  const res = Object.fromEntries(ESTR.map(s => [s.id, []])), t0 = Date.now()
  for (let u = 0; u < NU; u++) {
    const velas = [...Array(N_VALORES)].map((_, j) => serie(generador(semillaDeActivo(SEMILLA, `u${u}|v${j}`))))
    for (const s of ESTR) {
      const valores = velas.map((v, j) => ({ sym: `V${j}`, velas: v, tramos, calculables: s.calcDe(v), senales: s.senalesDe(v) }))
      const r = E.ejecutaPeriodoEstrategias({ valores, desde, hasta, decisionesDe: s.decisionesDe, tope: s.tope, nSim: N_SIM, semilla: semillaDeActivo(SEMILLA, `${s.id}|u${u}`) })
      res[s.id].push({ percentil: r.azar.percentil, operaciones: r.operaciones, duracion: r.duracionMedia, aproximadas: r.azar.aproximadas, imposibles: r.azar.imposibles })
    }
    if ((u + 1) % 5 === 0 || u === 0) console.log(`  ${u + 1}/${NU} universos · ${((Date.now() - t0) / 1000).toFixed(0)} s`)
  }
  const umbral = Lab.CRITERIOS[4].maxFalsosAprobados
  const resumen = (xs) => {
    const aprob = xs.filter(x => x.percentil >= 95).length, d = new Array(10).fill(0)
    for (const x of xs) d[Math.min(9, Math.floor(x.percentil / 10))]++
    const md = (f) => xs.reduce((a, x) => a + f(x), 0) / xs.length
    const pct = Math.round(aprob / xs.length * 1000) / 10
    return { universos: xs.length, aprobados: aprob, pctAprobados: pct, percentilMedio: Math.round(md(x => x.percentil) * 10) / 10, deciles: d,
      operacionesMedias: Math.round(md(x => x.operaciones)), duracionMedia: Math.round(md(x => x.duracion) * 10) / 10,
      aproximadas: xs.reduce((a, x) => a + x.aproximadas, 0), imposibles: xs.reduce((a, x) => a + x.imposibles, 0), calibrada: pct <= umbral }
  }
  const items = {}, controles = {}
  for (const s of ESTR) (s.control ? controles : items)[s.id] = { nombre: s.nombre, ...resumen(res[s.id]) }
  console.log(`\nCalibración del LOTE_3 · ${NU} universos sintéticos sin ventaja (paseo aleatorio geométrico, ${N_VALORES} valores × ${ANIOS} años, deriva ${MU} y volatilidad ${SIGMA} diarias) · ${N_SIM} simulaciones`)
  console.log('| Combinación | Operaciones (media) | Duración (días) | >= 95 en un periodo | Percentil medio | Deciles 0–10 … 90–100 | ¿Calibrada? |\n|---|---|---|---|---|---|---|')
  for (const [id, x] of [...Object.entries(items), ...Object.entries(controles)])
    console.log(`| ${id} ${x.nombre} | ${x.operacionesMedias} | ${x.duracionMedia} | ${x.pctAprobados} % (${x.aprobados}/${x.universos}) | ${x.percentilMedio} | ${x.deciles.join(' · ')} | ${x.calibrada ? 'sí' : 'NO'} |`)
  console.log(`\n${((Date.now() - t0) / 1000).toFixed(0)} s en total`)
  if (ESCRIBE) {
    const ruta = path.join(RAIZ, 'lib/calibracionLab.json')
    const actual = JSON.parse(fs.readFileSync(ruta, 'utf8') || '{}')
    actual.LOTE_3 = { huellaLote: Lab.LOTE_3_HASH, version: process.env.VERSION_LAB || null, fecha: new Date().toISOString().slice(0, 10),
      metodo: 'paseo aleatorio geométrico sin autocorrelación (apertura = cierre anterior × e^noche, cierre = apertura × e^día); todos los valores miembros todo el periodo; estrategia al azar de lib/laboratorioEstrategias.js',
      parametros: { universos: NU, valores: N_VALORES, anios: ANIOS, derivaDiaria: MU, volatilidadDiaria: SIGMA, fraccionNoche: FRAC_NOCHE, nSim: N_SIM, semilla: SEMILLA },
      umbralFalsosAprobados: umbral, items, controles }
    fs.writeFileSync(ruta, JSON.stringify(actual, null, 1) + '\n')
    console.log(`Escrito lib/calibracionLab.json (huella del lote ${Lab.LOTE_3_HASH.slice(0, 12)}…)`)
  }
})().catch(e => { console.error('FALLO', e.stack || e); process.exit(1) })
