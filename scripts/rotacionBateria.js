// scripts/rotacionBateria.js — la BATERÍA de la rotación por momentum (plan de Sergi del 09/11, declarado antes de mirar;
// docs/builder.md §127). Con los precios REALES de la caché (solo lectura, token de «supabase login») y los miembros del
// Nasdaq-100 de cada fecha (universo_miembros, una clase por empresa). No escribe nada en la base.
// Uso: node scripts/rotacionBateria.js [--sims 1000]      Deja el informe en scripts/comprobaciones/salida/rotacion-bateria.json.
//
// Común: 10.000 €, diario, Nasdaq-100 de cada fecha, opción A, costes 0,185 € por orden (Sergi: 0,37 € al comprar, repartido)
// + deslizamiento 0,05 %. Periodos 2016–2020, 2021–2025 (los del veredicto) y 2016–2025 (informativo). Azar: 1.000 copias.
// Grupos: A (9) mensual, sin saltar, L 63/126/252 × K 3/5/10 · B (6) L 126/252 saltando 21 × K 3/5/10 · C las 3 mejores de A+B
// con rebalanceo semanal · D las 3 mejores con el filtro QQQ > SMA 200. «Mejores» = mayor CAGR en el PEOR de los dos periodos
// (decidido por mí: premia la que va bien en los dos). E (velas semanales) queda para después.
// Regla de paso: 1) CAGR > B&H QQQ y > B&H a partes iguales en los dos periodos; 2) percentil del CAGR ≥ 95 en los dos;
// 3) Max DD no peor que el del QQQ en más de 10 puntos en los dos; 4) vecinas (L y K de al lado) también bien; 5) con costes.
const path = require('path'), fs = require('fs')
const RAIZ = process.env.RAIZ_APP || path.resolve(__dirname, '..')
const { prepara: preparaSwc, registra } = require(path.join(RAIZ, 'scripts/comprobaciones/cargador.js'))
const { consultaSoloLectura } = require(path.join(RAIZ, 'scripts/guardian/lecturaBd.js'))
const arg = (n, d) => { const k = process.argv.indexOf(n); return k > 0 ? process.argv[k + 1] : d }
const NSIM = Number(arg('--sims', 1000))

;(async () => {
  await preparaSwc(); registra(RAIZ)
  const { azarRotacion, rotar } = require(path.join(RAIZ, 'lib/rotacion.js'))
  const { elegiblesEn, unaClasePorEmpresa } = require(path.join(RAIZ, 'lib/universoDinamico.js'))
  const { precioVsMedia } = require(path.join(RAIZ, 'lib/condiciones/catalogo.js'))

  // 1 · Miembros y precios.
  const miembros = await consultaSoloLectura(`select simbolo, simbolo_yahoo, nombre, desde::text as desde, hasta::text as hasta, excluido_motivo from public.universo_miembros where indice = 'NDX';`)
  const enAlgunMomento = [...new Set(miembros.filter(t => t.simbolo_yahoo && !t.excluido_motivo && (t.hasta == null || t.hasta >= '2015-01-01')).map(t => t.simbolo_yahoo))].sort()
  const leer = async (s) => {
    const r = await consultaSoloLectura(`SET LOCAL extra_float_digits = 1; select * from public.leer_velas('${s.replace(/'/g, "''")}', '2013-06-01', '2025-12-31');`)
    const v = r[r.length - 1]?.leer_velas
    if (!v || !v.fecha?.length) return null
    const out = []
    for (let k = 0; k < v.fecha.length; k++) if (v.open[k] > 0 && v.close[k] > 0) out.push({ date: v.fecha[k], open: v.open[k], high: v.high[k], low: v.low[k], close: v.close[k] })
    return out
  }
  const qqq = await leer('QQQ')
  const velas = {}, sinPrecios = []
  for (const s of enAlgunMomento) { const v = await leer(s); if (v && v.length) velas[s] = v; else sinPrecios.push(s) }
  console.log(`Miembros del NDX desde 2015: ${enAlgunMomento.length} · con precios: ${Object.keys(velas).length} · sin precios: ${sinPrecios.length}`)
  const fechas = qqq.map(v => v.date)

  // Miembros de cada fecha (una clase por empresa), con caché por fecha.
  const cacheM = new Map()
  const miembro = (s, f) => { if (!cacheM.has(f)) cacheM.set(f, new Set(unaClasePorEmpresa(elegiblesEn(f, miembros)).elegibles.map(t => t.simbolo_yahoo))); return cacheM.get(f).has(s) }
  const mercadoQQQ = precioVsMedia.serie(qqq, { tipo: 'SMA', periodo: 200, lado: 'encima' })

  const PERIODOS = [['2016-01-01', '2020-12-31', '2016–2020'], ['2021-01-01', '2025-12-31', '2021–2025'], ['2016-01-01', '2025-12-31', '2016–2025']]
  const costes = { comisionPct: 0, comisionMinEur: 0.185, deslizPct: 0.05 }
  const comun = { fechas, velas, capital: 10000, miembro, costes }

  // 2 · Referencias por periodo: B&H QQQ (compra a la apertura del primer día y vende al cierre del último, con costes) y B&H a
  //     partes iguales de los miembros (K = todos, sin criterio: entran los que entran al índice con lo de los que salen).
  const ref = {}
  for (const [desde, hasta, nom] of PERIODOS) {
    const bhQ = rotar({ ...comun, velas: { QQQ: qqq }, miembro: () => true, desde, hasta, K: 1, criterio: () => 0 })
    const bhI = rotar({ ...comun, desde, hasta, K: 500, criterio: () => 0 })
    ref[nom] = { qqq: { cagr: bhQ.cagr, caida: bhQ.caida, final: bhQ.final }, iguales: { cagr: bhI.cagr, caida: bhI.caida, final: bhI.final } }
    console.log(`${nom}: B&H QQQ ${(bhQ.cagr * 100).toFixed(2)} % (caída ${(bhQ.caida * 100).toFixed(1)} %) · B&H a partes iguales ${(bhI.cagr * 100).toFixed(2)} % (caída ${(bhI.caida * 100).toFixed(1)} %)`)
  }

  // 3 · Las configuraciones.
  const corre = (cfg) => {
    const res = { cfg, periodos: {} }
    for (const [desde, hasta, nom] of PERIODOS) {
      const o = { ...comun, desde, hasta, K: cfg.K, rebalanceo: cfg.rebalanceo, criterio: { tipo: 'momentum', L: cfg.L, saltar: cfg.saltar }, mercado: cfg.mercado ? mercadoQQQ : null }
      const a = azarRotacion(o, { nSim: nom === '2016–2025' ? Math.min(NSIM, 200) : NSIM, semilla: 20261111 })
      const r = a.real, rf = ref[nom]
      res.periodos[nom] = { cagr: r.cagr, caida: r.caida, final: r.final, ordenes: r.ordenes, comisiones: r.comisiones, deslizamiento: r.deslizamiento, tiempoDentro: r.tiempoDentro,
        decisionesCortas: r.decisionesCortas, percentilCagr: a.percentilCagr, percentilCaida: a.percentilCaida, medianaAzar: a.mediana,
        ganaQQQ: r.cagr > rf.qqq.cagr, ganaIguales: r.cagr > rf.iguales.cagr, caidaOk: r.caida >= rf.qqq.caida - 0.10 }
    }
    const v = ['2016–2020', '2021–2025'].map(n => res.periodos[n])
    res.reglas = { r1: v.every(p => p.ganaQQQ && p.ganaIguales), r2: v.every(p => p.percentilCagr >= 95), r3: v.every(p => p.caidaOk) }
    res.pasa123 = res.reglas.r1 && res.reglas.r2 && res.reglas.r3
    res.peorCagr = Math.min(...v.map(p => p.cagr))
    const f = (x) => (x * 100).toFixed(2).padStart(6)
    console.log(`${cfg.id.padEnd(22)} ` + ['2016–2020', '2021–2025', '2016–2025'].map(n => { const p = res.periodos[n]; return `${n}: ${f(p.cagr)} % p${p.percentilCagr.toFixed(0).padStart(3)} caída ${(p.caida * 100).toFixed(1)}` }).join(' · ') + `  ${res.pasa123 ? '✓ 1-3' : '✗'} ${JSON.stringify(res.reglas)}`)
    return res
  }
  const nombre = (c) => `${c.grupo} L${c.L}${c.saltar ? '-s' + c.saltar : ''} K${c.K}${c.rebalanceo === 'semanal' ? ' sem' : ''}${c.mercado ? ' QQQ>SMA200' : ''}`
  const cfgs = []
  for (const L of [63, 126, 252]) for (const K of [3, 5, 10]) cfgs.push({ grupo: 'A', L, K, saltar: 0, rebalanceo: 'mensual' })
  for (const L of [126, 252]) for (const K of [3, 5, 10]) cfgs.push({ grupo: 'B', L, K, saltar: 21, rebalanceo: 'mensual' })
  const t0 = Date.now(), resultados = []
  for (const c of cfgs) { c.id = nombre(c); resultados.push(corre(c)) }
  const mejores = [...resultados].sort((a, b) => b.peorCagr - a.peorCagr).slice(0, 3)
  for (const m of mejores) { const c = { ...m.cfg, grupo: 'C', rebalanceo: 'semanal' }; c.id = nombre(c); resultados.push(corre(c)) }
  for (const m of mejores) { const c = { ...m.cfg, grupo: 'D', mercado: true }; c.id = nombre(c); resultados.push(corre(c)) }

  // 4 · Vecinas (regla 4) de las que pasan 1–3 en A y B: las de L o K de al lado (misma S) también pasan 1–3.
  const AB = resultados.filter(r => r.cfg.grupo === 'A' || r.cfg.grupo === 'B'), Ls = [63, 126, 252], Ks = [3, 5, 10]
  for (const r of resultados) {
    const base = AB.find(x => x.cfg.L === r.cfg.L && x.cfg.K === r.cfg.K && x.cfg.saltar === r.cfg.saltar)
    const vec = AB.filter(x => x.cfg.saltar === r.cfg.saltar && ((x.cfg.K === r.cfg.K && Math.abs(Ls.indexOf(x.cfg.L) - Ls.indexOf(r.cfg.L)) === 1) || (x.cfg.L === r.cfg.L && Math.abs(Ks.indexOf(x.cfg.K) - Ks.indexOf(r.cfg.K)) === 1)))
    r.vecinas = vec.map(x => ({ id: x.cfg.id, pasa123: x.pasa123 }))
    r.pasa = r.pasa123 && vec.length > 0 && vec.every(x => x.pasa123) && (!base || base.pasa123)
  }
  const pasan = resultados.filter(r => r.pasa)
  console.log(`\n${resultados.length} configuraciones en ${((Date.now() - t0) / 1000).toFixed(0)} s · pasan las 5 reglas: ${pasan.length ? pasan.map(r => r.cfg.id).join(', ') : 'ninguna'}`)
  const sal = path.join(RAIZ, 'scripts/comprobaciones/salida'); fs.mkdirSync(sal, { recursive: true })
  fs.writeFileSync(path.join(sal, 'rotacion-bateria.json'), JSON.stringify({ fecha: new Date().toISOString(), nSim: NSIM, costes, sinPrecios, ref, resultados: resultados.map(r => ({ ...r, cfg: { ...r.cfg } })) }, null, 1))
})().catch(e => { console.error('FALLO', e.stack); process.exit(1) })
