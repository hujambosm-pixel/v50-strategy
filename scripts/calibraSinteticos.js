// scripts/calibraSinteticos.js — calibra y VALIDA los ETF apalancados sintéticos (lib/etfSintetico.js) frente a los reales.
//
//   node scripts/calibraSinteticos.js [--escribe]
//
// Lee de la caché (solo lectura, por la Management API, como scripts/backup.js) las velas exactas de QQQ, QLD y TQQQ, les
// suma los dividendos (lib/dividendosCartera.json: rentabilidad total) y, para k = 2 (frente a QLD, desde su primer día
// hasta el 31/12/2025) y k = 3 (frente a TQQQ, ídem), busca el AJUSTE anual constante con el que el CAGR del sintético es
// el del real en ese tramo (bisección). Después valida: rendimiento real frente a sintético por año y total, diferencia
// media anual (con signo y en valor absoluto, años completos), correlación de los rendimientos diarios y caída máxima real
// frente a sintética. Avisa si la diferencia media anual supera 1 punto. Con --escribe guarda todo en lib/etfSinteticos.json.
const path = require('path'), fs = require('fs')
const RAIZ = path.join(__dirname, '..')
const { preparaEsm } = require('./guardian/cargaEsm')
const { consulta } = require('./universoNasdaq100')
const ESCRIBE = process.argv.includes('--escribe'), HASTA = '2025-12-31'
;(async () => {
  await preparaEsm()
  const S = require(path.join(RAIZ, 'lib/etfSintetico')), C = require(path.join(RAIZ, 'lib/laboratorioCartera'))
  const D = JSON.parse(fs.readFileSync(path.join(RAIZ, 'lib/dividendosCartera.json'), 'utf8'))
  const lee = async (s) => (await consulta(`BEGIN READ ONLY; SET LOCAL extra_float_digits = 1; SELECT fecha::text AS date, open, high, low, close FROM public.precios_diarios WHERE simbolo = '${s}' ORDER BY fecha; ROLLBACK;`))
    .map(x => ({ date: x.date, open: Number(x.open), high: Number(x.high), low: Number(x.low), close: Number(x.close) }))
  const qqq = C.preciosTotales(await lee('QQQ'), D.simbolos.QQQ)
  const out = { version: process.env.VERSION_LAB || null, fecha: new Date().toISOString().slice(0, 10), comision: S.COMISION, tipos: 'DTB3 (lib/tiposCortoUsd.json)', ajuste: {}, calibracion: {}, validacion: {} }
  for (const [k, sym] of [[2, 'QLD'], [3, 'TQQQ']]) {
    const real = C.preciosTotales(await lee(sym), D.simbolos[sym]), desde = real[0].date
    const tramo = qqq.filter(v => v.date >= desde && v.date <= HASTA)
    const cagrDe = (aj) => { const s = S.construyeSintetico(tramo, { k, ajuste: aj }); return S.valida(real, s, desde, HASTA) }
    const objetivo = cagrDe(0).cagrReal
    let lo = -0.2, hi = 0.2
    for (let it = 0; it < 80; it++) { const m = (lo + hi) / 2; if (cagrDe(m).cagrSintetico > objetivo) lo = m; else hi = m }
    const ajuste = Math.round((lo + hi) / 2 * 1e6) / 1e6, v = cagrDe(ajuste)
    out.ajuste[k] = ajuste; out.calibracion[k] = { frente: sym, desde, hasta: v.hasta }; out.validacion[sym] = v
    const p = (x) => `${(x * 100).toFixed(2)} %`
    console.log(`\n×${k} frente a ${sym} (${v.desde} → ${v.hasta}, ${v.dias} días): ajuste ${(ajuste * 100).toFixed(3)} % anual (además de la comisión ${(S.COMISION[k] * 100).toFixed(2)} % y ${k - 1} × el tipo a corto)`)
    console.log(`  CAGR real ${p(v.cagrReal)} · sintético ${p(v.cagrSintetico)} · diferencia media anual ${p(v.diferenciaMediaAnual)} (en valor absoluto ${p(v.diferenciaMediaAbsoluta)}, ${v.aniosCompletos} años completos) · correlación diaria ${v.correlacionDiaria.toFixed(4)}`)
    console.log(`  caída máxima real ${p(v.caidaReal.caida)} (${v.caidaReal.pico} → ${v.caidaReal.valle}) · sintética ${p(v.caidaSintetica.caida)} (${v.caidaSintetica.pico} → ${v.caidaSintetica.valle})`)
    console.log('  ' + v.anios.map(a => `${a.anio}: ${p(a.real)} / ${p(a.sintetico)} (${a.diferencia >= 0 ? '+' : ''}${(a.diferencia * 100).toFixed(2)})`).join(' · '))
    if (Math.abs(v.diferenciaMediaAnual) > 0.01 || v.diferenciaMediaAbsoluta > 0.01) console.log(`  ⚠ AVISO: la diferencia media anual supera 1 punto (${Math.abs(v.diferenciaMediaAnual) > 0.01 ? 'con signo' : 'en valor absoluto'}).`)
  }
  if (ESCRIBE) { fs.writeFileSync(path.join(RAIZ, 'lib/etfSinteticos.json'), JSON.stringify(out, null, 1) + '\n'); console.log('\nEscrito lib/etfSinteticos.json') }
})().catch(e => { console.error('FALLO', e.stack || e); process.exit(1) })
