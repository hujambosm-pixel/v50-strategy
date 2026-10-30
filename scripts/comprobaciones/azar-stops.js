// scripts/comprobaciones/azar-stops.js — diagnóstico del azar con stops (paso 2 del Builder, parte 1; docs/builder.md, «Paso 2 · azar
// con stops: diagnóstico»). Solo mercados FICTICIOS: no prueba ninguna estrategia real ni toca la app. No está en comunes.sh.
//
// Uso:   node scripts/comprobaciones/azar-stops.js [--mercados 200] [--copias 1000]        (unos minutos)
//
// MERCADOS. Cada día de QQQ (foto de precios de scripts/comprobaciones/datos/foto_mom.json) se guarda como cuatro cocientes:
// salto = apertura / cierre anterior, máximo / apertura, mínimo / apertura y cierre / apertura. Un mercado ficticio baraja esos
// días (a: día a día; b: por bloques de 20 días seguidos, que conservan las rachas de volatilidad) y los encadena desde 100:
// apertura = cierre anterior × salto, y el máximo, el mínimo y el cierre, la apertura × su cociente. Como cada día es uno real
// entero, máximo ≥ max(apertura, cierre) y mínimo ≤ min(apertura, cierre) por construcción (se comprueba). Barajar quita
// cualquier relación entre el pasado y el futuro: no hay ventaja posible. 60 velas de calentamiento + 1.260 medidas (5 años).
//
// LA «ESTRATEGIA» SIN VENTAJA. Señal al azar (probabilidad 1/20 en cada vela cerrada), compra a la apertura siguiente, una
// operación a la vez, y una salida del motor de tarjetas: el INTÉRPRETE de la app (lib/editor/interprete.js, interpreta), sin
// cambios. La señal entra al intérprete como la condición «volumen alto» (volumen > 1 × el de la vela anterior) sobre un volumen
// inventado que solo sube en las velas de señal. Para las copias, la operación que abre cada vela de entrada posible se saca
// también con el intérprete (varias pasadas, cada una con señal en todas las velas que faltan) y se comprueba que la estrategia
// rehecha con esa tabla da EXACTAMENTE las mismas operaciones que el intérprete.
// Medida: CAGR compuesto (todo el capital en cada operación, sin comisiones) en los 5 años; una operación abierta al final se
// valora al último cierre. Aprobado falso: la estrategia gana al ≥ 95 % de las copias (percentilDe de lib/azar.js, empates la mitad).
//
// COPIAS
//   resim   re-simulada: entradas al azar (1/20) y la MISMA salida aplicada desde cada entrada (la tabla del intérprete).
//   resimP  igual, con la tasa de entradas de la estrategia: operaciones / velas sin posición (lo que se puede medir en una real).
//   durac   la de lib/azar.js (paso 2 de hoy): las mismas k duraciones, en fechas al azar sin solaparse (colocaAlAzar, pctAlAzar).
//   lote2   el re-simulado de LOTE_2 (sorteaSecuencial, en velas): las mismas señales y duraciones sacadas de las reales.
//   lib     (§43) resimP hecho con lib/azarReglas.js (tablaSalidas con entradas forzadas + copiasReSimuladas), con la misma semilla
//           que resimP: se comprueba que su tabla y su percentil son los mismos.
const path = require('path')
const C0 = require('./cargador')

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? Number(process.argv[i + 1]) : d }
const MERCADOS = arg('mercados', 200), COPIAS = arg('copias', 1000)
const CAL = 60, N = 1260, P = 1 / 20, BLOQUE = 20, ANIOS = N / 252

;(async () => {
  await C0.prepara(); C0.registra(C0.RAIZ)
  const { interpreta } = require(path.join(C0.RAIZ, 'lib/editor/interprete.js'))
  const { validaDefinicion } = require(path.join(C0.RAIZ, 'lib/editor/definicion.js'))
  const { generador, semillaDe, percentilDe, colocaAlAzar, pctAlAzar } = require(path.join(C0.RAIZ, 'lib/azar.js'))
  const AR = require(path.join(C0.RAIZ, 'lib/azarReglas.js'))

  // ── Los días de QQQ como cocientes ──
  const q = require('./datos/foto_mom.json').QQQ.quote
  const dias = []
  for (let i = 1; i < q.close.length; i++) {
    const [o, h, l, c, c0] = [q.open[i], q.high[i], q.low[i], q.close[i], q.close[i - 1]]
    if (![o, h, l, c, c0].every(x => x > 0)) continue
    dias.push({ g: o / c0, h: Math.max(h, o, c) / o, l: Math.min(l, o, c) / o, c: c / o })
  }
  const baraja = (xs, rnd) => { const a = xs.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] } return a }
  const fechas = (() => { const out = [], d = new Date(Date.UTC(2000, 0, 3)); while (out.length < CAL + N) { const w = d.getUTCDay(); if (w && w < 6) out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1) } return out })()
  let incoherentes = 0
  function mercado(modo, m) {
    const rnd = generador(semillaDe(`azarStops|${modo}|${m}`))
    let orden
    if (modo === 'dia') orden = baraja(dias, rnd)
    else { const bloques = []; for (let i = 0; i + BLOQUE <= dias.length; i += BLOQUE) bloques.push(dias.slice(i, i + BLOQUE)); orden = baraja(bloques, rnd).flat() }
    const velas = []
    let prev = 100
    for (let i = 0; i < CAL + N; i++) {
      const x = orden[i], open = prev * x.g, close = open * x.c, high = open * x.h, low = open * x.l
      if (!(high >= Math.max(open, close) && low <= Math.min(open, close))) incoherentes++
      velas.push({ date: fechas[i], open, high, low, close, volume: 1000 })
      prev = close
    }
    return velas
  }

  // ── Las salidas (definiciones del editor, validadas) ──
  const SENAL = { c: 'volumenAlto', p: { k: 1, n: 1 } }, SIEMPRE = { c: 'precioVsMedia', p: { tipo: 'SMA', periodo: 1, lado: 'debajo', comparacion: '≥' } }
  const def = (nombre, stops, salidas = [], extra = {}) => ({ tipo: 'editor', formato: 1, motor: 1, nombre, parametros: { version: 1, lista: [] },
    entrada: { senal: SENAL, orden: { tipo: 'apertura' } }, stops, salidas, ...extra })
  const atrCompra = { id: 'atrCompra1', tipo: 'atrCompra', motivo: 'stop', k: 2, periodo: 14, historialAlEntrar: true }
  const minimo10 = { id: 'minimoMovil1', tipo: 'minimoMovil', motivo: 'stop_minimo', n: 10, historialAlEntrar: true }
  const SALIDAS = [
    ['S1', 'stop fijo ATR(14) × 2 desde la compra', def('S1', [atrCompra])],
    ['S2', 'trailing ATR(14) × 3', def('S2', [{ id: 'trailing1', tipo: 'trailing', motivo: 'trailing_exit', si: SIEMPRE, nivel: { atr: { k: 3, periodo: 14 } }, historial: 'siSube', fechaHistorial: 'vela' }])],
    ['S3', 'mínimo de 10 velas', def('S3', [minimo10])],
    ['S4', 'manda el más alto de S1 y S3', def('S4', [atrCompra, minimo10], [], { stopsModo: 'masAlto' })],
    ['S5', 'línea de SuperTrend 10/3', def('S5', [{ id: 'supertrend1', tipo: 'supertrend', motivo: 'stop_supertrend', periodo: 10, k: 3, historialAlEntrar: true }])],
    ['S6', 'control: tope de 20 velas', def('S6', [], [{ tipo: 'tope', velas: 20, motivo: 'tiempo' }])],
  ]
  for (const [id, , d] of SALIDAS) { const e = validaDefinicion(d); if (e.length) throw new Error(`${id} no es válida: ${e.join(' ')}`) }

  const n = CAL + N, T0 = CAL - 1   // señales en t = T0 … n − 2 (entradas en las velas medidas CAL … n − 1)
  const conSenales = (velas, si) => { let v = 1000; return velas.map((b, t) => { if (si(t)) v++; return { ...b, volume: v } }) }
  const idx = new Map(fechas.map((f, i) => [f, i]))

  // La operación que abre cada vela de entrada e (CAL … n − 1): { x: vela de salida, px: precio de salida }. Abierta al final: x = n − 1
  // al cierre.
  function tabla(velas, d) {
    const x = new Int32Array(n).fill(-1), px = new Float64Array(n)
    let faltan = n - CAL, pasadas = 0
    while (faltan > 0) {
      const r = interpreta(d, conSenales(velas, t => t >= T0 && t <= n - 2 && x[t + 1] < 0))
      pasadas++
      let nuevas = 0
      for (const tr of r.trades) { const e = idx.get(tr.entryDate); if (x[e] < 0) { x[e] = idx.get(tr.exitDate); px[e] = tr.exitPrice; nuevas++ } }
      if (r.openPosition) { const e = idx.get(r.openPosition.entryDate); if (x[e] < 0) { x[e] = n - 1; px[e] = velas[n - 1].close; nuevas++ } }
      if (!nuevas) throw new Error('la tabla no avanza')
      faltan -= nuevas
    }
    return { x, px, pasadas }
  }
  // Recorre una lista de señales (en orden) con la tabla: operaciones { e, x, r } y velas de señal posibles sin posición.
  function recorre(tab, velas, senalesT) {
    const ops = []
    let libreDesde = T0
    for (const t of senalesT) { if (t < libreDesde) continue; const e = t + 1; ops.push({ e, x: tab.x[e], r: tab.px[e] / velas[e].open }); libreDesde = tab.x[e] }
    return ops
  }
  const cagr = (ops) => { let k = 1; for (const o of ops) k *= o.r; return (Math.pow(k, 1 / ANIOS) - 1) * 100 }
  // Señales al azar con probabilidad p en las velas libres, saltando con esperas geométricas (lo mismo que un sorteo por vela).
  function resim(tab, velas, p, rnd) {
    const ops = [], lp = Math.log(1 - p)
    let t = T0
    while (true) {
      t += Math.floor(Math.log(1 - rnd()) / lp)
      if (t > n - 2) break
      const e = t + 1
      ops.push({ r: tab.px[e] / velas[e].open }); t = tab.x[e]
    }
    return cagr(ops)
  }
  const abre = (velas) => velas.slice(CAL).map(b => b.open), cierra = (velas) => velas.slice(CAL).map(b => b.close)

  const TIPOS = ['resim', 'resimP', 'durac', 'lote2', 'lib']
  const res = {}   // res[modo][salida] = { aprob: {tipo: n}, ...}
  const t0 = Date.now()
  let comprobadas = 0, pasadasTot = 0, libIgual = 0, libCasos = 0
  for (const modo of ['dia', 'bloques']) {
    res[modo] = {}
    for (const [id] of SALIDAS) res[modo][id] = { aprob: Object.fromEntries(TIPOS.map(k => [k, 0])), pctMedio: Object.fromEntries(TIPOS.map(k => [k, 0])), cagrReal: 0, cagrCopia: Object.fromEntries(TIPOS.map(k => [k, 0])), ops: 0, dias: 0, sinOps: 0 }
    for (let m = 0; m < MERCADOS; m++) {
      const velas = mercado(modo, m), A = abre(velas), Cc = cierra(velas)
      const rs = generador(semillaDe(`azarStops|senales|${modo}|${m}`)), senalesT = []
      for (let t = T0; t <= n - 2; t++) if (rs() < P) senalesT.push(t)
      const conjunto = new Set(senalesT)
      for (const [id, , d] of SALIDAS) {
        const tab = tabla(velas, d); pasadasTot += tab.pasadas
        const ops = recorre(tab, velas, senalesT)
        // La estrategia directamente con el intérprete: tiene que dar las mismas operaciones.
        const r = interpreta(d, conSenales(velas, t => conjunto.has(t)))
        const directas = r.trades.map(tr => [idx.get(tr.entryDate), idx.get(tr.exitDate), tr.exitPrice])
        if (r.openPosition) directas.push([idx.get(r.openPosition.entryDate), n - 1, velas[n - 1].close])
        if (JSON.stringify(directas) !== JSON.stringify(ops.map(o => [o.e, o.x, tab.px[o.e]]))) throw new Error(`${modo} ${m} ${id}: la tabla no reproduce al intérprete`)
        comprobadas++
        const real = cagr(ops), k = ops.length, R = res[modo][id]
        R.cagrReal += real / MERCADOS; R.ops += k / MERCADOS
        // Velas de señal posibles sin posición (para la tasa de entradas de resimP) y las duraciones en velas (para durac y lote2).
        let libres = 0, libreDesde = T0, j = 0
        for (let t = T0; t <= n - 2; t++) { if (t < libreDesde) continue; libres++; if (j < k && ops[j].e === t + 1) { libreDesde = ops[j].x; j++ } }
        const durs = ops.map(o => Math.max(1, o.x - o.e)), enMercado = durs.reduce((s, x) => s + x, 0)
        R.dias += enMercado / N * 100 / MERCADOS
        if (!k) { R.sinOps++; continue }
        const sims = Object.fromEntries(TIPOS.map(tp => [tp, new Float64Array(COPIAS)]))
        const rnd = (tp) => generador(semillaDe(`azarStops|copias|${tp}|${modo}|${m}|${id}`))
        const r1 = rnd('resim'), r2 = rnd('resimP'), r3 = rnd('durac'), r4 = rnd('lote2'), pHat = k / libres
        // lib: la tabla con entradas forzadas (tiene que ser la del volumen inventado) y las copias de lib/azarReglas.js.
        const tl = AR.tablaSalidas(velas, d, { desde: fechas[CAL] })
        let tablaIgual = tl.desde === CAL && tl.hasta === n - 1
        for (let e = CAL; e < n; e++) if (tl.salida[e] !== tab.x[e] || tl.precio[e] !== tab.px[e]) tablaIgual = false
        const realesLib = r.openPosition ? [...r.trades, r.openPosition] : r.trades
        const cl = AR.copiasReSimuladas(velas, d, realesLib, { n: COPIAS, semilla: `azarStops|copias|resimP|${modo}|${m}|${id}`, tabla: tl })
        if (Math.abs(cl.tasa - pHat) > 1e-12) tablaIgual = false
        cl.copias.forEach((c, s) => { sims.lib[s] = c.cagr })
        for (let s = 0; s < COPIAS; s++) {
          sims.resim[s] = resim(tab, velas, P, r1)
          sims.resimP[s] = resim(tab, velas, pHat, r2)
          // durac: lib/azar.js tal cual (posiciones en las 1.260 velas medidas).
          let f = 1
          for (const { inicio, d: dd } of colocaAlAzar(N, durs, r3)) f *= 1 + pctAlAzar(A, Cc, inicio, dd) / 100
          sims.durac[s] = (Math.pow(f, 1 / ANIOS) - 1) * 100
          // lote2: las mismas señales; con la posición cerrada, una duración sacada de las reales; sale a la apertura de e + d.
          f = 1; let libre = T0
          for (const t of senalesT) {
            if (t < libre) continue
            const e = t + 1, dd = durs[Math.floor(r4() * k)], xs = e + dd
            f *= (xs < n ? velas[xs].open : velas[n - 1].close) / velas[e].open; libre = Math.min(xs, n - 1)
          }
          sims.lote2[s] = (Math.pow(f, 1 / ANIOS) - 1) * 100
        }
        libCasos++
        if (tablaIgual && cl.percentil === percentilDe(sims.resimP, real)) libIgual++
        for (const tp of TIPOS) {
          const p = tp === 'lib' ? cl.percentil : percentilDe(sims[tp], real)
          if (p >= 95) R.aprob[tp]++
          R.pctMedio[tp] += p / MERCADOS
          const v = Array.from(sims[tp]).sort((a, b) => a - b); R.cagrCopia[tp] += v[v.length >> 1] / MERCADOS
        }
      }
      if ((m + 1) % 50 === 0) console.error(`${modo}: ${m + 1}/${MERCADOS} mercados · ${((Date.now() - t0) / 1000).toFixed(0)} s`)
    }
  }

  // ── Informe ──
  const wilson = (x, nn) => { const z = 1.96, p = x / nn, den = 1 + z * z / nn, c = (p + z * z / (2 * nn)) / den, h = z * Math.sqrt(p * (1 - p) / nn + z * z / (4 * nn * nn)) / den; return [(c - h) * 100, (c + h) * 100] }
  const f1 = (x) => x.toFixed(1).replace('.', ',')
  console.log(`azar-stops · ${MERCADOS} mercados por manera × ${COPIAS} copias · ${dias.length} días de QQQ · OHLC incoherentes: ${incoherentes}`)
  console.log(`tabla del intérprete comprobada en ${comprobadas} casos (${(pasadasTot / comprobadas).toFixed(1)} pasadas de media) · ${((Date.now() - t0) / 1000).toFixed(0)} s`)
  console.log('\n% de mercados con aprobado falso (gana al ≥ 95 % de las copias), [intervalo del 95 %]')
  console.log(`lib/azarReglas.js: misma tabla, misma tasa y mismo percentil que resimP en ${libIgual} de ${libCasos} casos`)
  console.log(['mercados', 'salida', ...TIPOS.map(t => t.padEnd(22))].join(' | '))
  for (const modo of Object.keys(res)) for (const [id, nombre] of SALIDAS) {
    const R = res[modo][id]
    console.log([modo.padEnd(8), `${id} ${nombre}`.padEnd(40), ...TIPOS.map(tp => { const [a, b] = wilson(R.aprob[tp], MERCADOS); return `${f1(R.aprob[tp] / MERCADOS * 100)} % [${f1(a)}–${f1(b)}]`.padEnd(22) })].join(' | '))
  }
  console.log('\nPercentil medio · CAGR real medio frente a la mediana media de las copias · operaciones y % del tiempo invertido de la estrategia')
  for (const modo of Object.keys(res)) for (const [id] of SALIDAS) {
    const R = res[modo][id]
    console.log(`${modo.padEnd(8)} ${id}  pct ${TIPOS.map(tp => `${tp} ${f1(R.pctMedio[tp])}`).join(' · ')}  ·  CAGR real ${f1(R.cagrReal)} % / copias ${TIPOS.map(tp => `${tp} ${f1(R.cagrCopia[tp])}`).join(' · ')}  ·  ${f1(R.ops)} ops, ${f1(R.dias)} % invertido${R.sinOps ? `, ${R.sinOps} sin ops` : ''}`)
  }
  process.exit(0)
})().catch(e => { console.error(e); process.exit(1) })
