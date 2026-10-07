// scripts/guardian/fixture.js — genera el fixture de precios CONGELADO del guardián.
//
//   node scripts/guardian/fixture.js
//
// Descarga de Yahoo las velas diarias de ^GSPC, AAPL, NVDA y SAN.MC entre DESDE y HASTA y construye las
// semanales con lib/velasSemanales.js, la misma función que usa el motor. Escribe test/fixtures/precios.json,
// que va COMMITEADO: son cotizaciones públicas, y congelarlas es lo que hace que el guardián dé siempre el
// mismo resultado para el mismo código. Solo hay que volver a ejecutarlo si se quiere cambiar el fixture, y
// entonces cambian los resultados de referencia de todas las estrategias.
//
// Precios redondeados a 4 decimales para que el fichero no pese el doble sin necesidad: el guardián
// comprueba reglas, no rentabilidades al céntimo.
const fs = require('fs')
const path = require('path')
const { preparaEsm, RAIZ } = require('./cargaEsm')

const SIMBOLOS = ['^GSPC', 'AAPL', 'NVDA', 'SAN.MC']
const DESDE = '2019-01-01'
const HASTA = '2025-12-31'
const DESTINO = path.join(RAIZ, 'test', 'fixtures', 'precios.json')
const r4 = (v) => Math.round(v * 1e4) / 1e4

async function diarias(simbolo) {
  const p1 = Math.floor(Date.parse(DESDE + 'T00:00:00Z') / 1000)
  const p2 = Math.floor(Date.parse(HASTA + 'T23:59:59Z') / 1000)
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(simbolo)}?interval=1d&period1=${p1}&period2=${p2}`
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', Accept: 'application/json' } })
  if (!r.ok) throw new Error(`${simbolo}: HTTP ${r.status}`)
  const j = await r.json()
  const res = j?.chart?.result?.[0]
  const q = res?.indicators?.quote?.[0]
  if (!res?.timestamp || !q) throw new Error(`${simbolo}: respuesta sin velas`)
  const velas = []
  res.timestamp.forEach((t, i) => {
    const c = q.close?.[i]
    if (c == null || isNaN(c)) return
    velas.push({ date: new Date(t * 1000).toISOString().slice(0, 10), open: r4(q.open?.[i] || c), high: r4(q.high?.[i] || c),
      low: r4(q.low?.[i] || c), close: r4(c), volume: q.volume?.[i] || 0 })
  })
  return velas.filter(v => v.date >= DESDE && v.date <= HASTA)
}
const columnas = (velas) => ({ fecha: velas.map(v => v.date), o: velas.map(v => v.open), h: velas.map(v => v.high),
  l: velas.map(v => v.low), c: velas.map(v => v.close), v: velas.map(v => v.volume) })

;(async () => {
  await preparaEsm()
  const { semanalesDesdeDiarias } = require(path.join(RAIZ, 'lib', 'velasSemanales.js'))
  const salida = { generado: new Date().toISOString().slice(0, 10), fuente: 'Yahoo Finance (velas diarias)', desde: DESDE, hasta: HASTA, simbolos: {} }
  for (const s of SIMBOLOS) {
    const d = await diarias(s)
    // Todas las semanas están cerradas: el fixture termina en una fecha pasada.
    const w = semanalesDesdeDiarias(d, { semanaEnCurso: () => false })
    salida.simbolos[s] = { diario: columnas(d), semanal: columnas(w) }
    console.log(`${s}: ${d.length} velas diarias (${d[0].date} → ${d[d.length - 1].date}), ${w.length} semanales`)
  }
  fs.mkdirSync(path.dirname(DESTINO), { recursive: true })
  fs.writeFileSync(DESTINO, JSON.stringify(salida))
  console.log(`Escrito ${path.relative(RAIZ, DESTINO)}: ${(fs.statSync(DESTINO).size / 1024).toFixed(1)} KB`)
})().catch(e => { console.error('Error al generar el fixture:', e.message); process.exit(1) })
