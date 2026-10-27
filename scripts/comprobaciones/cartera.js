// scripts/comprobaciones/cartera.js — CARTERA_1–3 y las cuatro exploraciones, IDÉNTICAS a la versión anterior (VIEJO).
// Datos: el QQQ REAL de datos/foto_mom.json (2005 en adelante), SPY = QQQ, ETF sintético ×2 / ×3 (lib/etfSintetico.js, los
// parámetros calibrados) y, para CARTERA_1/2, QLD y TQQQ reales de la foto si están; si no, el sintético. Para cada elemento de
// los lotes de cartera: ejecutaPeriodoCartera de cada periodo con su semilla (200 simulaciones); para las exploraciones:
// curvaRiesgoEtf, sensibilidadEtf (200 simulaciones), estresParte y mapaMediaParte. JSON de ahora = JSON de antes.
const path = require('path')
const C0 = require('./cargador'), R = C0.RAIZ
if (!process.env.VIEJO) { console.error('Falta VIEJO: la carpeta con la copia de la versión anterior (la hace comunes.sh).'); process.exit(2) }
const V = path.resolve(process.env.VIEJO)
const DATOS = process.env.COMPROBACIONES_DATOS || path.join(__dirname, 'datos')
;(async () => {
  await C0.prepara(); C0.registra(R); C0.registra(V)
  const foto = require(path.join(DATOS, 'foto_mom.json'))
  const velasDe = (sym) => { const r = foto[sym]; if (!r?.quote) return null; const q = r.quote; return r.timestamp.map((ts, i) => ({ date: new Date((ts + (r.meta.gmtoffset || 0)) * 1000).toISOString().slice(0, 10), open: q.open[i], high: q.high[i], low: q.low[i], close: q.close[i], volume: q.volume[i] })).filter(v => v.open > 0 && v.close > 0) }
  const qqq = velasDe('QQQ')
  const corre = async (raiz) => {
    const L = require(raiz + '/lib/lotesLab.js'), C = require(raiz + '/lib/laboratorioCartera.js'), X = require(raiz + '/lib/exploracionCartera.js'), S = require(raiz + '/lib/etfSintetico.js'), SIN = require(raiz + '/lib/etfSinteticos.json')
    const sintetico = (k) => ({ simbolo: 'SINTETICO', velas: S.construyeSintetico(C.preciosTotales(qqq, []), { k, comision: SIN.comision[k], ajuste: SIN.ajuste[k] }) })
    const datosDe = (etf) => { const k = ['QLD', 'x2'].includes(etf) ? 2 : 3, real = velasDe(etf)
      return C.alineaDatos({ qqq, etf: real ? { simbolo: etf, velas: real } : sintetico(k), spy: qqq }, { QQQ: [], SPY: [], SINTETICO: [], [etf]: [] }) }
    const out = {}
    for (const lote of [L.CARTERA_1, L.CARTERA_2, L.CARTERA_3]) for (const it of lote.items) {
      const cfg = L.configDeItem(lote, it.id), d = datosDe(it.etf)
      out[`${lote.id}·${it.id}`] = it.periodos.map(p => C.ejecutaPeriodoCartera({ datos: d, regla: it.regla, periodo: p, nSim: 200, semilla: 7, calculo: cfg.calculo ?? 1, costes: cfg.costes ?? null }))
    }
    const E = L.EXPLORACIONES
    for (const etf of E.curvaRiesgo.etfs) out[`curvaRiesgo·${etf}`] = X.curvaRiesgoEtf({ datos: datosDe(etf), config: E.curvaRiesgo, etf })
    for (const etf of E.sensibilidad.etfs) out[`sensibilidad·${etf}`] = await X.sensibilidadEtf({ datos: datosDe(etf), config: E.sensibilidad, etf, nSim: 200 })
    for (const parte of E.estres.etfs) out[`estres·${parte}`] = X.estresParte({ datos: datosDe(parte), config: E.estres, parte })
    for (const parte of E.mapaMedia.etfs) out[`mapaMedia·${parte}`] = X.mapaMediaParte({ datos: datosDe(parte), config: E.mapaMedia, parte })
    return out
  }
  const t0 = Date.now()
  const a = await corre(V), b = await corre(R)
  let fallos = 0
  for (const k of Object.keys(a)) {
    const ja = JSON.stringify(a[k]), jb = JSON.stringify(b[k]), igual = ja === jb
    if (!igual) fallos++
    console.log(`${igual ? '✓' : '✗'} ${k}: ${igual ? 'idéntico a la versión anterior' : 'DISTINTO'} (${(jb.length / 1024).toFixed(0)} KB)`)
  }
  console.log(`\n${Object.keys(a).length} resultados · ${fallos ? fallos + ' DISTINTOS' : 'todos idénticos byte a byte'} · ${((Date.now() - t0) / 1000).toFixed(0)} s`)
  process.exit(fallos ? 1 : 0)
})().catch(e => { console.error('FALLO', e.stack); process.exit(2) })
