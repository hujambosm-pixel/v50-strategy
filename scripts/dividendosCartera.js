// scripts/dividendosCartera.js — dividendos de los ETF del laboratorio de cartera (QQQ, QLD, TQQQ, SPY).
//
//   node scripts/dividendosCartera.js            descarga de Yahoo y escribe lib/dividendosCartera.json
//
// POR QUÉ. La caché de precios (precios_diarios) guarda los precios de Yahoo tal como los usa el motor: ajustados por
// SPLITS pero NO por dividendos (ver pages/api/datos.js, fetchAVDetalle). Cambiarlos cambiaría todos los backtests. El
// laboratorio de cartera mide RENTABILIDAD TOTAL: toma las velas de la caché y les suma los dividendos de este fichero
// (lib/laboratorioCartera.js, rentabilidadTotal): el día de la fecha ex-dividendo, el dividendo se reinvierte al cierre.
// Los importes de Yahoo vienen en la misma escala de splits que los precios (comprobado: el dividendo / cierre de ese día
// da rentabilidades del 0,1–0,6 % en QQQ y SPY).
// Solo lee de Yahoo (chart v8 con events=div); no toca la base de datos.
const fs = require('fs'), path = require('path')
const SIMBOLOS = ['QQQ', 'QLD', 'TQQQ', 'SPY']
const DESDE = '1998-01-01'   // V9.984: desde 1998 (QQQ desde marzo de 1999, para la prueba de estrés)
;(async () => {
  const p1 = Math.floor(Date.parse(DESDE + 'T00:00:00Z') / 1000), p2 = Math.floor(Date.now() / 1000)
  const out = { fuente: 'Yahoo Finance, chart v8, events=div (importe por acción en la escala de splits de los precios de la caché)', descargado: new Date().toISOString().slice(0, 10), simbolos: {} }
  for (const s of SIMBOLOS) {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s)}?interval=1d&period1=${p1}&period2=${p2}&events=div`
    let j = null
    for (let intento = 0; intento < 4 && !j; intento++) {
      try {
        const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', Accept: 'application/json' } })
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        j = await r.json()
      } catch (e) { console.log(`  ${s}: ${e.message}, reintento`); await new Promise(r => setTimeout(r, [2000, 5000, 15000][intento] || 15000)) }
    }
    if (!j) throw new Error(`${s}: sin respuesta de Yahoo`)
    const divs = Object.values(j?.chart?.result?.[0]?.events?.dividends || {})
      .map(d => ({ fecha: new Date(d.date * 1000).toISOString().slice(0, 10), importe: d.amount })).sort((a, b) => a.fecha < b.fecha ? -1 : 1)
    out.simbolos[s] = divs
    console.log(`${s}: ${divs.length} dividendos${divs.length ? ` (${divs[0].fecha} → ${divs[divs.length - 1].fecha})` : ''}`)
    await new Promise(r => setTimeout(r, 800))
  }
  fs.writeFileSync(path.join(__dirname, '..', 'lib', 'dividendosCartera.json'), JSON.stringify(out, null, 1) + '\n')
  console.log('Escrito lib/dividendosCartera.json')
})().catch(e => { console.error('FALLO', e.message); process.exit(1) })
