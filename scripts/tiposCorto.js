// scripts/tiposCorto.js — tipos a corto en dólares para los ETF apalancados sintéticos (lib/etfSintetico.js).
//
//   node scripts/tiposCorto.js            descarga de FRED y escribe lib/tiposCortoUsd.json
//   node scripts/tiposCorto.js --csv f    lee el CSV ya descargado (curl -o f "https://fred.stlouisfed.org/graph/fredgraph.csv?id=DTB3&cosd=1998-01-01")
//                                         (desde algunas redes el fetch de Node no llega a FRED y curl sí)
//
// Serie DTB3 de FRED (Reserva Federal de St. Louis): letras del Tesoro de EE. UU. a 3 meses, mercado secundario, tipo de
// descuento en % anual, diaria (días hábiles). Los días sin dato (festivos, «.») no se guardan; quien la usa toma el último
// dato conocido. Solo lee de FRED; no toca la base de datos.
const fs = require('fs'), path = require('path')
const DESDE = '1998-01-01'
;(async () => {
  const url = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=DTB3&cosd=${DESDE}`
  const iCsv = process.argv.indexOf('--csv')
  let txt = iCsv > 0 ? fs.readFileSync(process.argv[iCsv + 1], 'utf8') : null
  for (let intento = 0; intento < 4 && !txt; intento++) {
    try { const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'text/csv' } }); if (!r.ok) throw new Error(`HTTP ${r.status}`); txt = await r.text() }
    catch (e) { console.log(`  FRED: ${e.message}, reintento`); await new Promise(r => setTimeout(r, [2000, 5000, 15000][intento] || 15000)) }
  }
  if (!txt) throw new Error('FRED sin respuesta')
  const filas = txt.trim().split(/\r?\n/).slice(1).map(l => l.split(',')).filter(([f, v]) => f >= DESDE && v && v !== '.' && Number.isFinite(Number(v))).map(([f, v]) => [f, Number(v)])
  if (filas.length < 1000) throw new Error(`FRED devolvió solo ${filas.length} filas`)
  const out = { fuente: 'FRED, serie DTB3: letras del Tesoro de EE. UU. a 3 meses (mercado secundario), tipo de descuento en % anual, diario', url: 'https://fred.stlouisfed.org/series/DTB3',
    descargado: new Date().toISOString().slice(0, 10), desde: filas[0][0], hasta: filas[filas.length - 1][0], fechas: filas.map(x => x[0]), tipos: filas.map(x => x[1]) }
  fs.writeFileSync(path.join(__dirname, '..', 'lib', 'tiposCortoUsd.json'), JSON.stringify(out) + '\n')
  const anios = {}; for (const [f, v] of filas) (anios[f.slice(0, 4)] ||= []).push(v)
  console.log(`DTB3: ${filas.length} días (${out.desde} → ${out.hasta}) · media por año: ${Object.entries(anios).map(([a, vs]) => `${a} ${(vs.reduce((s, x) => s + x, 0) / vs.length).toFixed(2)}`).join(' · ')}`)
  console.log('Escrito lib/tiposCortoUsd.json')
})().catch(e => { console.error('FALLO', e.message); process.exit(1) })
