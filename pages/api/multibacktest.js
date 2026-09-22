// pages/api/multibacktest.js
// Backtest de cartera multi-activo — Slots iguales | Capital compartido | Pesos personalizados

import { calcEMA as _libEMA, calcSMA, calcRSI, calcATR as _libATR, calcMACD } from '../../lib/backtester'
import { normalizaFiltrosEntrada, hayFiltrosActivos, clavesAuxiliares, construirFiltroActivoMap, filtrosActivos,
         requiereSemanalDelActivo, proyectarSemanal } from '../../lib/filtros'
import { fetchAV } from './datos'

const SUPA_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPA_KEY = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

function calcEMA(values, period) {
  if (!values?.length || period < 1) return []
  const k = 2 / (period + 1)
  const out = new Array(values.length).fill(null)
  let sum = 0, valid = 0
  for (let i = 0; i < values.length; i++) {
    if (values[i] == null) continue
    sum += values[i]; valid++
    if (valid < period) continue
    if (valid === period) { out[i] = sum / period; continue }
    out[i] = values[i] * k + out[i - 1] * (1 - k)
  }
  return out
}
// ── Align external close series to asset dates with forward-fill (for market filters) ──
function buildAlignedCloses(externalData, assetDates) {
  if (!externalData?.length) return assetDates.map(()=>null)
  const closeMap = {}
  externalData.forEach(d => { closeMap[d.date] = d.close })
  const aligned = []
  let last = null
  for (const date of assetDates) {
    if (closeMap[date] != null) last = closeMap[date]
    aligned.push(last)
  }
  return aligned
}

// ── Compute EMA on native weekly series then forward-fill to daily asset dates ──
function buildAlignedWeekly(weeklyData, assetDates, emaPeriod) {
  if (!weeklyData?.length || !assetDates?.length)
    return { closes: assetDates.map(()=>null), ema: assetDates.map(()=>null) }
  // La regla de la última semana CERRADA (corregida en V9.709) vive ahora en proyectarSemanal, en
  // lib/filtros.js, para que no haya dos calendarios que puedan divergir. Aquí solo se preparan las
  // series semanales y se proyectan ambas con esa misma regla.
  const sorted = [...weeklyData].sort((a,b)=>a.date.localeCompare(b.date))
  const wDates  = sorted.map(d=>d.date)
  const wCloses = sorted.map(d=>d.close)
  const wEma    = calcEMA(wCloses, Math.max(1, emaPeriod))
  return {
    closes: proyectarSemanal(wCloses, wDates, assetDates),
    ema:    proyectarSemanal(wEma,    wDates, assetDates),
  }
}

// ── Rebuild compound capitalTras after filtering trades ──
// Se llama SOLO cuando un filtro de mercado ha eliminado operaciones, para recomponer la cadena
// de interés compuesto sobre las que sobreviven.
// El cierre virtual (posición abierta al final del periodo) participa como una operación más:
// es lo que ya hacía buildTrades antes de filtrar, y lo que hacen los otros tres modos, que
// realizan su P&L en su exitDate. Excluirlo lo devolvía INTACTO, conservando el capitalTras
// calculado sobre la cadena SIN filtrar; como buildSlotsCurves lee el capitalTras de la última
// salida y el cierre virtual es siempre la última, la curva compuesta de Slots saltaba el último
// día al valor sin filtrar (beneficio inflado + escalón vertical al final).
// La guarda restante es defensiva —buildTrades ya exige entryPrice>0 && exitPrice>0— pero debe
// arrastrar el capital acumulado en curso: devolver el trade tal cual filtraría el mismo valor
// obsoleto que causaba el bug.
function rebuildCapitalTras(trades, initCapital) {
  let capital = initCapital
  return trades.map(t => {
    if (!t.exitPrice || !t.entryPrice) return { ...t, capitalTras: capital }
    const pnlComp = capital * ((t.exitPrice - t.entryPrice) / t.entryPrice)
    capital += pnlComp
    return { ...t, capitalTras: capital }
  })
}

// Adaptador sobre fetchAV (Stooq primario + Yahoo fallback, con timeouts) — MISMA fuente robusta
// que los gráficos individuales (datos.js). Mantiene la firma de fetchData y el contrato null-on-failure
// que espera multibacktest.js. Antes usaba solo Yahoo → NVDA y otros llegaban truncados (~21 may).
async function fetchData(symbol, years=5, fromDate=null, toDate=null, interval='1d') {
  return (await fetchDataConMotivo(symbol, years, fromDate, toDate, interval)).data
}
// Igual que fetchData, pero sin reducir a null los casos sin velas: dice POR QUÉ no hay datos. Los activos
// pedidos se descargan con esta para poder avisar de los que se quedan fuera; las series auxiliares siguen
// con fetchData.
//   { data }                                                   → hay velas en el periodo
//   { data: null, motivo: 'descargaFallida' }                   → la descarga no trae nada: símbolo inexistente
//                                                                  o fallo del proveedor (no se distingue)
//   { data: null, motivo: 'sinVelasEnPeriodo', disponibleDesde, disponibleHasta }
//                                                               → hay datos, pero ninguno en el periodo pedido
async function fetchDataConMotivo(symbol, years=5, fromDate=null, toDate=null, interval='1d') {
  try {
    const avInterval = (interval === '1wk' || interval === 'w') ? 'w' : 'd'
    // +1 año de buffer para warm-up de la EMA (igual que datos.js). En modo Fechas se piden los años que
    // hay desde fromDate hasta hoy (nunca menos que antes): con solo `years` —5 por defecto, el cliente no
    // lo manda en rango— un rango largo llegaba ya truncado. El modo Años pide exactamente lo mismo.
    const anios = (fromDate && toDate) ? Math.max(years, _aniosHastaHoy(fromDate)) : years
    const bruto = await fetchAV(symbol, Math.ceil(anios) + 1, avInterval)
    if (!bruto?.length) return { data: null, motivo: 'descargaFallida' }
    let data
    if (fromDate && toDate) {
      data = bruto.filter(d => d.date >= fromDate && d.date <= toDate)
    } else {
      const cut = new Date(); cut.setFullYear(cut.getFullYear() - Math.ceil(years))
      const cutStr = cut.toISOString().slice(0, 10)
      data = bruto.filter(d => d.date >= cutStr)
    }
    return data.length
      ? { data }
      : { data: null, motivo: 'sinVelasEnPeriodo', disponibleDesde: bruto[0].date, disponibleHasta: bruto[bruto.length - 1].date }
  } catch { return { data: null, motivo: 'descargaFallida' } }
}
// Activos pedidos que no llegan a assetResults por no tener velas utilizables, con su motivo (ver
// fetchDataConMotivo). `descargas`: símbolo → resultado de fetchDataConMotivo.
function _activosExcluidos(simbolos, descargas) {
  return [...new Set(simbolos)]
    .filter(s => !descargas[s]?.data?.length)
    .map(s => {
      const r = descargas[s] || { motivo: 'descargaFallida' }
      return r.motivo === 'sinVelasEnPeriodo'
        ? { symbol: s, motivo: r.motivo, disponibleDesde: r.disponibleDesde, disponibleHasta: r.disponibleHasta }
        : { symbol: s, motivo: 'descargaFallida' }
    })
    .sort((a, b) => a.symbol.localeCompare(b.symbol))
}
// Mensaje del 400 cuando NINGÚN activo pedido tiene datos, según el motivo (ver fetchDataConMotivo). Si
// todos fallaron en la descarga devuelve null: cada camino conserva entonces su mensaje de fallo.
function _mensajeTodosExcluidos(excluidos, cfg) {
  const sinVelas = excluidos.filter(e => e.motivo === 'sinVelasEnPeriodo')
    .sort((a, b) => a.disponibleDesde.localeCompare(b.disponibleDesde) || a.symbol.localeCompare(b.symbol))
  const fallidos = excluidos.filter(e => e.motivo !== 'sinVelasEnPeriodo')
  if (!sinVelas.length) return null
  const fmt = f => f.split('-').reverse().join('/')
  const lista = (xs, txt) => xs.slice(0, 6).map(txt).join(', ') + (xs.length > 6 ? ` y ${xs.length - 6} más` : '')
  const modoRango = !!(cfg?.fromDate && cfg?.toDate)
  const periodo = modoRango ? `entre el ${fmt(cfg.fromDate)} y el ${fmt(cfg.toDate)}` : `en los últimos ${cfg?.years ?? 5} años`
  const disponibles = lista(sinVelas, e => `${e.symbol} ${fmt(e.disponibleDesde)}–${fmt(e.disponibleHasta)}`)
  if (!fallidos.length) {
    const posteriores = modoRango && sinVelas.every(e => e.disponibleDesde > cfg.toDate)
    return `Ningún activo tiene velas ${periodo}${posteriores ? ': el rango es anterior a los datos de todos ellos' : ''}. Datos disponibles: ${disponibles}.`
  }
  return `Ningún activo tiene datos ${periodo}: ${sinVelas.length} sin velas en ese periodo (datos disponibles: ${disponibles}) y ${fallidos.length} con la descarga fallida (${lista(fallidos, e => e.symbol)}).`
}
const _aniosHastaHoy = (fecha) => (Date.now() - new Date(fecha)) / (365.25 * 86400000)

// Inicio de la simulación de un activo (ar.startDate). En modo Fechas es fromDate: la curva arranca en la
// primera vela ≥ fromDate, o en la primera disponible si es posterior. En modo Años, última vela − años.
function _inicioSimulacion(data, cfg) {
  if (cfg?.fromDate && cfg?.toDate) return cfg.fromDate
  const cutoff = new Date(data[data.length - 1].date)
  cutoff.setFullYear(cutoff.getFullYear() - (cfg.years ?? 5))
  return cutoff.toISOString().split('T')[0]
}

// Muestreo de fechas para curvas: intervalos fijos (cada step días) + SIEMPRE las fechas
// donde cambia la ocupación (entryDate/exitDate de cada operación), para que el "capital empleado"
// no se pierda picos de posiciones cortas (1-2 días) que caen entre muestras. Dedup + orden asc.
// `extra` añade fechas sueltas que el dibujo necesita aunque no caigan en el muestreo: hoy, el pico y el
// valle del máximo drawdown, que se calculan sobre el eje COMPLETO y podrían quedarse entre dos muestras.
// Pasan por el mismo Set, así que no duplican ni desordenan.
function _sampledWithChanges(filteredDates, step, trades, extra) {
  const inAxis = new Set(filteredDates)
  const set = new Set()
  filteredDates.forEach((d, i) => { if (i % step === 0 || i === filteredDates.length - 1) set.add(d) })
  ;(trades || []).forEach(t => {
    if (t.entryDate && inAxis.has(t.entryDate)) set.add(t.entryDate)
    if (t.exitDate && inAxis.has(t.exitDate)) set.add(t.exitDate)
  })
  ;(extra || []).forEach(d => { if (d && inAxis.has(d)) set.add(d) })
  return [...set].sort()
}

// Eje de DIBUJO de las series POR ACTIVO. A diferencia de sampledDates, NO fuerza dentro las fechas de
// entrada y salida: con muchas operaciones aquello se saturaba casi al eje completo y, multiplicado por
// el número de activos, disparaba el tamaño de la respuesta —~1,4 MB con 20 activos a 10 años y ~15 MB
// con 40 a 40, por encima del límite de 4,5 MB de Vercel—. Aquí el techo es duro: ~400 fechas
// equiespaciadas pase lo que pase. La PRIMERA y la ÚLTIMA van siempre, la última porque es el valor final
// de la serie y tiene que ser exacto, no el de la muestra anterior.
// Solo afecta al dibujo de esas series: las curvas de la estrategia, la caja y todas las métricas siguen
// con su propio muestreo y su propio eje.
const MAX_PUNTOS_ACTIVO = 400
function _ejeDibujoActivos(filteredDates, max = MAX_PUNTOS_ACTIVO) {
  const n = filteredDates?.length || 0
  if (!n) return []
  if (n <= max) return [...filteredDates]
  const paso = Math.ceil(n / max)
  const set = new Set()
  for (let i = 0; i < n; i += paso) set.add(filteredDates[i])
  set.add(filteredDates[0])
  set.add(filteredDates[n - 1])
  return [...set].sort()
}
// Dos decimales bastan para dibujar y recortan ~15 % de cada punto serializado.
const _r2 = (v) => Number.isFinite(v) ? Math.round(v * 100) / 100 : 0

// ── Contribución por activo y capital no invertido ───────────────────────────
// Convención (la misma en los cuatro modos): cada línea de activo ARRANCA EN CERO y mide BENEFICIO, no
// capital. La caja arranca con el capital inicial completo y sí es capital.
//
//   contribución(activo, fecha) = realizado acumulado + P&L no realizado
//   caja(fecha)                 = capital inicial − coste de lo abierto
//
// El coste de lo abierto quedó FUERA de la línea del activo a propósito (V9.762): incluirlo la hacía
// saltar al abrir la posición y caer al cerrarla, y esos dientes de sierra son capital moviéndose, no
// resultado. A cambio, Σ contribuciones + caja YA NO reproduce floatCompoundCurve: el capital invertido
// en cada momento no está en ninguna de las dos series. Es una decisión tomada por legibilidad, no un
// descuadre; por eso tampoco hay ya comprobación de esa identidad.
// Agrupa por símbolo REAL (_realSymbol): en multicartera el mismo ticker aparece una vez por estrategia.
const _claveActivo = (t) => t?._realSymbol ?? t?.symbol

// Para los tres modos de pool (compartido, concentrado, position sizing), que comparten estructura:
// `executedTrades` son las ejecuciones REALES —las descartadas por capital y las de pnlPct no finito ya
// quedaron fuera— y `capitalAtEntryMap` da el capital asignado en cada entrada.
// Dos ejes: las series por activo van en el reducido (_ejeDibujoActivos) y la caja se queda en el de
// siempre, que es una sola serie y no pesa. Se recorre la unión de ambos una vez, porque el cálculo de
// cada fecha es lo caro y no se puede repetir dos veces.
function _seriesPorActivoPool(sampledDates, ejeActivos, executedTrades, allCandidates, capitalAtEntryMap, symbolDataMap, capitalIni) {
  const activos = [...new Set([...(executedTrades || []), ...(allCandidates || [])].map(_claveActivo).filter(Boolean))].sort()
  const series = Object.fromEntries(activos.map(s => [s, []]))
  const cashCurve = []
  const enActivos = new Set(ejeActivos || [])
  const enCaja = new Set(sampledDates || [])
  ;[...new Set([...(sampledDates || []), ...(ejeActivos || [])])].sort().forEach(date => {
    const aporte = Object.fromEntries(activos.map(s => [s, 0]))
    // Realizado: MISMO conjunto que compoundCurve (ejecuciones con exitDate <= date).
    // La guarda `aporte[clave] == null` descarta una operación sin símbolo, que si no se sumaría a una
    // clave inexistente y desaparecería de la atribución sin que nadie lo notase.
    ;(executedTrades || []).forEach(t => {
      const clave = _claveActivo(t)
      if (t.exitDate <= date && aporte[clave] != null) aporte[clave] += (t.pnlSimple || 0)
    })
    // Abierto: MISMO conjunto y MISMO cálculo que floatCompoundCurve. El `exitDate > date` estricto deja
    // fuera los cierres virtuales en su propia fecha, que ya están contados arriba como realizado.
    let costeAbierto = 0
    ;(allCandidates || []).forEach(t => {
      if (!(t.entryDate <= date && t.exitDate > date)) return
      const capEntry = capitalAtEntryMap[`${t.symbol}:${t.entryDate}`]
      if (capEntry == null) return
      const clave = _claveActivo(t)
      if (aporte[clave] == null) return
      // El coste SOLO va a la caja. En la línea del activo entraría y saldría al abrir y cerrar, y esos
      // dientes de sierra son capital moviéndose, no beneficio: tapan lo que el gráfico quiere contar.
      costeAbierto += capEntry
      const fData = symbolDataMap[t.symbol] || []
      let closePx = null
      for (let i = fData.length - 1; i >= 0; i--) { if (fData[i].date <= date) { closePx = fData[i].close; break } }
      if (closePx != null && t.entryPx) aporte[clave] += (closePx - t.entryPx) / t.entryPx * capEntry
    })
    if (enActivos.has(date)) activos.forEach(s => series[s].push({ date, value: _r2(aporte[s]) }))
    if (enCaja.has(date)) cashCurve.push({ date, value: capitalIni - costeAbierto })
  })
  return { assetCurves: activos.map(symbol => ({ symbol, data: series[symbol] })), cashCurve }
}

// Tamaño aproximado de assetCurves: ~40 bytes por punto {date,value} serializado.
// `nFechas` es el techo por serie: con el eje reducido no puede pasar de MAX_PUNTOS_ACTIVO + 1, así que
// el tamaño total crece solo con el número de activos y nunca con el de operaciones.
function _tamanoAssetCurves(assetCurves) {
  const nPuntos = (assetCurves || []).reduce((s, a) => s + (a.data?.length || 0), 0)
  return {
    nActivos: (assetCurves || []).length,
    nFechas: assetCurves?.[0]?.data?.length || 0,
    nPuntos,
    kbAprox: Math.round(nPuntos * 34 / 1024),   // ~34 B por punto con el valor ya redondeado a 2 decimales
  }
}

// ── MODO SLOTS: capital dividido en N partes iguales ─────────
function buildSlotsCurves(assetResults, capitalIni) {
  const n = assetResults.length
  if (!n) return _emptyCurves()
  const slotCapital = capitalIni / n
  const { allDates, startDate, filteredDates } = _commonDates(assetResults)
  if (!filteredDates.length) return _emptyCurves(startDate)

  const assetEquities = assetResults.map(ar => {
    const { trades, data } = ar
    const filtData = data ? data.filter(d => d.date >= startDate) : []
    const p0 = filtData.length ? filtData[0].close : null
    const byDate = {}
    filteredDates.forEach(date => {
      const exitsBefore = trades.filter(t => t.exitDate <= date)
      const simple = slotCapital + exitsBefore.reduce((s,t) => s + t.pnlSimple, 0)
      const compound = exitsBefore.length ? exitsBefore[exitsBefore.length-1].capitalTras : slotCapital
      const openTrades = trades.filter(t => t.entryDate <= date && (!t.exitDate || t.exitDate > date || (t._virtualClose && t.exitDate >= date)))
      const open = openTrades.length > 0
      let bh = slotCapital, closePx = null
      if (p0 && filtData.length) {
        let bar = null
        for (let i = filtData.length-1; i>=0; i--) { if (filtData[i].date <= date) { bar=filtData[i]; break } }
        if (bar) { bh = slotCapital * (bar.close / p0); closePx = bar.close }
      }
      // openPnl SOLO sobre posiciones estrictamente abiertas (exitDate > date o sin exitDate).
      // Las ya realizadas en `compound` (incl. cierres virtuales en su exitDate) se excluyen para
      // no contar su ganancia dos veces. `open`/ocupación siguen usando openTrades (sin tocar).
      const openPnl = openTrades.reduce((s,t) => { if(closePx==null) return s; if(t.exitDate && t.exitDate <= date) return s; const ep=t.entryPx??t.entryPrice; const capAtEntry=t.capitalTras/(1+t.pnlPct/100); return ep!=null ? s+(closePx-ep)/ep*capAtEntry : s }, 0)
      // COSTE de las posiciones abiertas: capital compuesto realmente asignado al entrar
      // (capitalTras deshaciendo el retorno del propio trade), sobre el MISMO conjunto y con el
      // MISMO filtro de exitDate que openPnl, para que ambos hablen siempre de las mismas
      // posiciones. Sustituye a `openSlots × slotCapital`: aquel numerador quedaba anclado al
      // capital INICIAL mientras el denominador de Cap.inv% (compoundCurve) sí crecía con los
      // beneficios, así que la ocupación se infravaloraba más cuanto mejor iba la estrategia.
      const openCost = openTrades.reduce((s,t) => { if(t.exitDate && t.exitDate <= date) return s; return s + t.capitalTras/(1+t.pnlPct/100) }, 0)
      byDate[date] = { simple, compound, open, bh, openPnl, openCost }
    })
    return byDate
  })

  const simpleCurve=[], compoundCurve=[], bhCurve=[], occupancyCurve=[], floatSimpleCurve=[], floatCompoundCurve=[]
  // Contribución por activo y caja (ver _seriesPorActivoPool): aquí los tres sumandos ya están calculados
  // por activo y fecha en assetEquities; el realizado acumulado es `compound − slotCapital`, porque
  // `compound` arranca en el slot y la línea del activo tiene que arrancar en cero.
  const clavesSlots = assetResults.map(ar => _claveActivo(ar))
  const activosSlots = [...new Set(clavesSlots)].sort()
  const cashCurve = []
  // Métricas sobre el eje COMPLETO, antes de muestrear: el muestreo solo decide qué se dibuja.
  const _met = _metricasEjeCompleto(filteredDates, _posicionesSlots(assetResults, startDate), capitalIni)
  const step = Math.max(1, Math.floor(filteredDates.length / 400))
  _sampledWithChanges(filteredDates, step, assetResults.flatMap(ar=>ar.trades||[]),
    [_met.maxDDFechaPico, _met.maxDDFechaValle]).forEach(date => {
    let totSimple=0, totCompound=0, totBH=0, openSlots=0, totOpenPnl=0, totOpenCost=0
    assetEquities.forEach((byDate) => {
      const e = byDate[date]
      if (e) { totSimple+=e.simple; totCompound+=e.compound; totBH+=e.bh; if(e.open)openSlots++; totOpenPnl+=e.openPnl||0; totOpenCost+=e.openCost||0 }
    })
    cashCurve.push({ date, value: capitalIni - totOpenCost })
    simpleCurve.push({ date, value: totSimple })
    compoundCurve.push({ date, value: totCompound })
    bhCurve.push({ date, value: totBH })
    // CAPITAL EMPLEADO unificado: euros de COSTE de las posiciones abiertas (Σ capital de entrada),
    // igual que en los otros tres modos (allí, Σ capitalAtEntryMap).
    occupancyCurve.push({ date, value: totOpenCost })
    floatSimpleCurve.push({ date, value: totSimple+totOpenPnl })
    floatCompoundCurve.push({ date, value: totCompound+totOpenPnl })
  })

  // Series por activo en su PROPIO eje, el reducido: son tantas como activos y son las únicas que pueden
  // disparar el tamaño de la respuesta. Los sumandos ya están calculados por activo y fecha en
  // assetEquities, que cubre el eje completo, así que esto es solo releerlos en las fechas que se dibujan.
  // El realizado acumulado es `compound − slotCapital`, porque compound arranca en el slot y la línea del
  // activo tiene que arrancar en cero.
  const seriesSlots = Object.fromEntries(activosSlots.map(s => [s, []]))
  _ejeDibujoActivos(filteredDates).forEach(date => {
    const aporte = Object.fromEntries(activosSlots.map(s => [s, 0]))
    assetEquities.forEach((byDate, i) => {
      const e = byDate[date]
      if (e) aporte[clavesSlots[i]] += (e.compound - slotCapital) + (e.openPnl||0)
    })
    activosSlots.forEach(s => seriesSlots[s].push({ date, value: _r2(aporte[s]) }))
  })

  const tInvEstrategia = _met.tInv
  const avgCapOccupancy = _met.capInvPct
  const _totalSenalesSlots = assetResults.reduce((s, ar) => s + (ar.trades?.length || 0), 0)
  const senalStatsSlots = {
    generadas:             _totalSenalesSlots,
    ejecutadas:            _totalSenalesSlots,
    descartadasPorSlots:   0,
    descartadasPorCapital: 0,
    descartadasPorRiesgo:  0,
    winRateDescartadas:    null,
    pfDescartadas:         null,
    pnlHipoteticoDescartadas: 0,
  }
  return { simpleCurve, compoundCurve, bhCurve, occupancyCurve, startDate, floatSimpleCurve, floatCompoundCurve, tInvEstrategia, avgCapOccupancy, senalStats: senalStatsSlots,
    assetCurves: activosSlots.map(symbol => ({ symbol, data: seriesSlots[symbol] })), cashCurve,
    ..._calcDD(simpleCurve, compoundCurve, bhCurve, capitalIni), ..._calcFloatDD(floatSimpleCurve, floatCompoundCurve, capitalIni),
    ..._ddFlotanteCompuesto(_met), avgCapOccupancyEur: _met.capInvEur, metricasActivo: _met.porActivo }
}

// ── Stop INICIAL de un trade — fuente ÚNICA para los cuatro modos de asignación ──
// Antes se leía `stopHistory[0].stopPx` sin mirar la fecha. Con estrategias cuyo stop no existe
// al entrar y aparece varias velas después (p.ej. cuando una vela cierra bajo la EMA20), ese
// primer nivel del historial se estaba usando como si fuera el stop de la vela de entrada:
// look-ahead puro, y además con un nivel que puede quedar por encima del precio de entrada.
// Reglas:
//   1. stopHistory[0] SOLO vale si su fecha es <= entryDate (o si el registro no lleva fecha,
//      caso en el que se asume contemporáneo de la entrada = comportamiento previo).
//   2. Si el trade NO trae stopHistory, se cae a t.stopPx — que el flush de posición abierta
//      rellena y hasta ahora se ignoraba. Sin historial, stopPx es un stop fijo de todo el
//      trade (misma convención que usa CandleChart al dibujarlo como línea horizontal).
//   3. Si HAY historial pero su primer nivel es posterior a la entrada, se devuelve null y NO
//      se cae a stopPx: en ese escenario stopPx es también un nivel posterior (el último), así
//      que usarlo reintroduciría el mismo look-ahead que estamos corrigiendo.
// null = el trade se abrió sin stop conocido.
function _stopInicial(t) {
  if (!t) return null
  const h = Array.isArray(t.stopHistory) ? t.stopHistory[0] : null
  if (h && h.stopPx != null) {
    if (h.date == null || t.entryDate == null || h.date <= t.entryDate) return h.stopPx
    return null
  }
  return t.stopPx ?? null
}

// ── MODO CAPITAL COMPARTIDO: pool libre repartido entre slots activos ──
// symbolOrder: array opcional de símbolos para desempate en entradas simultáneas
//   null → desempate alfabético (modo compartido estándar)
//   array → desempate por posición en la lista (modo ranking)
function buildCompartidoCurves(assetResults, capitalIni, symbolOrder = null) {
  const n = assetResults.length
  if (!n) return _emptyCurves()
  const { startDate, filteredDates } = _commonDates(assetResults)
  if (!filteredDates.length) return _emptyCurves(startDate)

  // Recopilar todos los trades de todos los activos con pnlPct pre-calculado
  const allCandidates = assetResults.flatMap(ar =>
    (ar.trades || []).map(t => ({
      symbol:       ar.symbol,
      // Símbolo REAL del activo. En multicartera `symbol` es sintético (TICKER#estrategia) y sin esto la
      // agrupación por activo de _claveActivo se queda con el sintético: un ticker que opera en dos
      // estrategias saldría partido en dos, y assetStats, que busca por símbolo real, no encontraría sus
      // métricas. En el handler normal es undefined y _claveActivo cae en `symbol`, como siempre.
      _realSymbol:  ar._realSymbol,
      entryDate:    t.entryDate,
      exitDate:     t.exitDate,
      pnlPct:       t.pnlPct,
      entryPx:      t.entryPrice ?? t.entryPx,
      stopPx:       _stopInicial(t),
      dias:         t.dias,
      _virtualClose: !!t._virtualClose,
    }))
  ).sort((a, b) => {
    if (a.entryDate < b.entryDate) return -1
    if (a.entryDate > b.entryDate) return 1
    if (symbolOrder) return symbolOrder.indexOf(a.symbol) - symbolOrder.indexOf(b.symbol)
    return a.symbol < b.symbol ? -1 : 1
  })

  if (!allCandidates.length) return buildSlotsCurves(assetResults, capitalIni)

  const senalesGeneradasC = allCandidates.length
  let cntEjecutadasC = 0, cntDescCapitalC = 0
  let pnlHipEurC = 0
  const pnlDescartadosC = []

  // Pool de capital libre y slots abiertos
  let poolLibre = capitalIni
  const openSlots = {}          // { symbol: { trade, capAsignado } }
  const executedTrades = []
  const capitalAtEntryMap = {}  // `${symbol}:${entryDate}` → capAsignado

  // Agrupar entradas por fecha
  const entriesByDate = {}
  allCandidates.forEach(t => {
    if (!entriesByDate[t.entryDate]) entriesByDate[t.entryDate] = []
    entriesByDate[t.entryDate].push(t)
  })

  // Timeline: todas las fechas de entrada y salida relevantes
  const eventDates = [...new Set([
    ...allCandidates.map(t => t.entryDate),
    ...allCandidates.map(t => t.exitDate).filter(d => d != null),
  ])].sort()

  eventDates.forEach(date => {
    // 1. Cerrar primero (libera capital para nuevas entradas del mismo día)
    const toClose = Object.keys(openSlots).filter(sym => openSlots[sym].trade.exitDate === date)
    toClose.forEach(symbol => {
      const { trade, capAsignado, totalPortfolioAtEntry: _tpAtEntry } = openSlots[symbol]
      if (!isFinite(trade.pnlPct)) { poolLibre += capAsignado; delete openSlots[symbol]; return }  // skip NaN/Infinity
      const capFinal = capAsignado * (1 + trade.pnlPct / 100)
      poolLibre += capFinal
      const _distC = (trade.stopPx && trade.entryPx && trade.entryPx > trade.stopPx)
        ? (trade.entryPx - trade.stopPx) / trade.entryPx : null
      const _riesgoC = _distC ? capAsignado * _distC : capAsignado * 0.05
      executedTrades.push({
        ...trade,
        _capitalAtEntry: capAsignado,
        _totalPortfolioAtEntry: _tpAtEntry || capitalIni,
        capitalTras: capFinal,
        pnlSimple: capFinal - capAsignado,
        riesgoAcum: _riesgoC,
      })
      delete openSlots[symbol]
    })

    // 2. Abrir entradas del día (solo activos sin posición abierta)
    const entries = (entriesByDate[date] || []).filter(t => !openSlots[t.symbol])
    if (entries.length > 0 && poolLibre <= 0) {
      const _openCapsBlkC = Object.values(openSlots).reduce((s, slot) => s + (slot.capAsignado || 0), 0)
      const _capMaxBlkC = (poolLibre + _openCapsBlkC) / n
      entries.forEach(t => {
        cntDescCapitalC++
        if (isFinite(t.pnlPct)) { pnlDescartadosC.push(t.pnlPct); pnlHipEurC += _capMaxBlkC * t.pnlPct / 100 }
      })
    }
    if (entries.length > 0 && poolLibre > 0) {
      entries.forEach(t => {
        // Recalculate per entrant: poolLibre and openSlots change with each iteration
        const openCapsTotal = Object.values(openSlots).reduce((s, slot) => s + (slot.capAsignado || 0), 0)
        const totalPortfolio = poolLibre + openCapsTotal
        const capPorSlot = Math.min(totalPortfolio / n, poolLibre)
        if (capPorSlot < 0.01) { cntDescCapitalC++; if (isFinite(t.pnlPct)) { pnlDescartadosC.push(t.pnlPct); pnlHipEurC += (totalPortfolio / n) * t.pnlPct / 100 } return }
        cntEjecutadasC++
        poolLibre -= capPorSlot
        // Same-day trade (entryDate === exitDate): abrir y cerrar atómicamente
        // para evitar que quede bloqueado en openSlots sin salida
        if (t.exitDate === date) {
          if (isFinite(t.pnlPct)) {
            const capFinal = capPorSlot * (1 + t.pnlPct / 100)
            poolLibre += capFinal
            const _distSD = (t.stopPx && t.entryPx && t.entryPx > t.stopPx)
              ? (t.entryPx - t.stopPx) / t.entryPx : null
            const _riesgoSD = _distSD ? capPorSlot * _distSD : capPorSlot * 0.05
            executedTrades.push({
              ...t,
              _capitalAtEntry: capPorSlot,
              _totalPortfolioAtEntry: totalPortfolio,
              capitalTras: capFinal,
              pnlSimple: capFinal - capPorSlot,
              riesgoAcum: _riesgoSD,
            })
          } else {
            poolLibre += capPorSlot  // NaN: devolver capital sin P&L
          }
          // NO añadir a openSlots — se resuelve inmediatamente
        } else {
          openSlots[t.symbol] = { trade: t, capAsignado: capPorSlot, totalPortfolioAtEntry: totalPortfolio }
          capitalAtEntryMap[`${t.symbol}:${t.entryDate}`] = capPorSlot
        }
      })
    }
  })

  // Cerrar posiciones que quedaron abiertas al final (exitDate: null — trade abierto al cierre del periodo)
  Object.entries(openSlots).forEach(([sym, slot]) => {
    const capFinal = slot.capAsignado * (1 + (slot.trade.pnlPct || 0) / 100)
    poolLibre += capFinal
    delete openSlots[sym]
  })

  // Build symbol → filtered OHLCV map para curva flotante
  const symbolDataMap = {}
  assetResults.forEach(ar => { symbolDataMap[ar.symbol] = ar.data ? ar.data.filter(d => d.date >= startDate) : [] })

  // Construir curvas fecha a fecha
  // Métricas sobre el eje COMPLETO, antes de muestrear: el muestreo solo decide qué se dibuja.
  const _met = _metricasEjeCompleto(filteredDates, _posicionesPool(executedTrades, symbolDataMap), capitalIni)
  const step = Math.max(1, Math.floor(filteredDates.length / 400))
  const sampledDates = _sampledWithChanges(filteredDates, step, executedTrades,
    [_met.maxDDFechaPico, _met.maxDDFechaValle])
  const _ejeActivos = _ejeDibujoActivos(filteredDates)

  const simpleCurve = [], compoundCurve = [], floatSimpleCurve = [], floatCompoundCurve = []

  sampledDates.forEach(date => {
    const closedSoFar = executedTrades.filter(t => t.exitDate <= date)
    // Compound: capitalIni + suma de pnlSimple de trades cerrados
    // (= pool_libre + capital locked in open slots, sin flotar)
    const val = capitalIni + closedSoFar.reduce((s, t) => s + t.pnlSimple, 0)
    compoundCurve.push({ date, value: val })
    // Simple: base fija = capitalIni
    const simpleVal = capitalIni + closedSoFar.reduce((s, t) => s + capitalIni * (t.pnlPct / 100), 0)
    simpleCurve.push({ date, value: simpleVal })

    // Float: P&L no realizado de todos los trades activos
    const activeNow = allCandidates.filter(t => t.entryDate <= date && t.exitDate > date)
    let openPnlSimple = 0, openPnlCompound = 0
    activeNow.forEach(t => {
      const capEntry = capitalAtEntryMap[`${t.symbol}:${t.entryDate}`]
      if (capEntry == null) return
      const fData = symbolDataMap[t.symbol] || []
      let closePx = null
      for (let i = fData.length - 1; i >= 0; i--) { if (fData[i].date <= date) { closePx = fData[i].close; break } }
      if (closePx != null && t.entryPx) {
        const ret = (closePx - t.entryPx) / t.entryPx
        openPnlSimple += ret * capEntry
        openPnlCompound += ret * capEntry
      }
    })
    floatSimpleCurve.push({ date, value: simpleVal + openPnlSimple })
    floatCompoundCurve.push({ date, value: val + openPnlCompound })
  })

  // Ocupación: % del capital total desplegado en posiciones abiertas (capital-weighted)
  const occupancyCurve = sampledDates.map((date, i) => {
    const openTrades = allCandidates.filter(t =>
      capitalAtEntryMap[`${t.symbol}:${t.entryDate}`] != null &&
      t.entryDate <= date && (!t.exitDate || t.exitDate > date || (t._virtualClose && t.exitDate >= date))
    )
    // CAPITAL EMPLEADO unificado: COSTE de entrada de las posiciones abiertas (Σ capEntry), en EUROS.
    const openCapTotal = openTrades.reduce((s, t) => s + (capitalAtEntryMap[`${t.symbol}:${t.entryDate}`] || 0), 0)
    return { date, value: openCapTotal }  // euros de coste
  })
  const tInvEstrategia = _met.tInv
  const avgCapOccupancy = _met.capInvPct

  // B&H combinado
  const slotBH = capitalIni / n
  const bhCurve = sampledDates.map(date => {
    let total = 0
    assetResults.forEach(ar => {
      const filtData = ar.data ? ar.data.filter(d => d.date >= startDate) : []
      const p0 = filtData.length ? filtData[0].close : null
      if (!p0) { total += slotBH; return }
      let bar = null
      for (let i = filtData.length - 1; i >= 0; i--) { if (filtData[i].date <= date) { bar = filtData[i]; break } }
      total += bar ? slotBH * (bar.close / p0) : slotBH
    })
    return { date, value: total }
  })

  const _descWinsCC = pnlDescartadosC.filter(p => p >= 0)
  const _descGrossWinCC = _descWinsCC.reduce((s, p) => s + p, 0)
  const _descGrossLossCC = Math.abs(pnlDescartadosC.filter(p => p < 0).reduce((s, p) => s + p, 0))
  const senalStatsC = {
    generadas:             senalesGeneradasC,
    ejecutadas:            cntEjecutadasC,
    descartadasPorSlots:   0,
    descartadasPorCapital: cntDescCapitalC,
    winRateDescartadas:    pnlDescartadosC.length ? _descWinsCC.length / pnlDescartadosC.length * 100 : null,
    pfDescartadas:         _descGrossLossCC > 0 ? _descGrossWinCC / _descGrossLossCC : _descGrossWinCC > 0 ? 99 : null,
    pnlHipoteticoDescartadas: pnlHipEurC,
  }

  return {
    simpleCurve, compoundCurve, bhCurve, occupancyCurve, startDate,
    executedTrades, floatSimpleCurve, floatCompoundCurve,
    tInvEstrategia, avgCapOccupancy, senalStats: senalStatsC,
    ..._seriesPorActivoPool(sampledDates, _ejeActivos, executedTrades, allCandidates, capitalAtEntryMap, symbolDataMap, capitalIni),
    ..._calcDD(simpleCurve, compoundCurve, bhCurve, capitalIni),
    ..._calcFloatDD(floatSimpleCurve, floatCompoundCurve, capitalIni),
    ..._ddFlotanteCompuesto(_met), avgCapOccupancyEur: _met.capInvEur, metricasActivo: _met.porActivo
  }
}

// ── MODO CAPITAL CONCENTRADO: pool compartido con techo por posición según maxPosiciones ──
// prioridad: 'alfabetico' | 'score_metricas' | 'momentum' | 'fuerza_relativa' | 'max52'
// momentumN: lookback en días para criterio 'momentum' (default 20)
// sp500Data: array de barras del SP500 (para fuerza_relativa)
// symbolsList: array ordenado de símbolos del watchlist (para score_metricas legacy)
// scoreMap: {symbol: scoreMetricas} para prioridad 'score_metricas'
function buildConcentradoCurves(assetResults, capitalIni, maxPosiciones = 5, prioridad = 'alfabetico', momentumN = 20, sp500Data = null, symbolsList = null, scoreMap = null, criterioUso = 'desempate', rsGateThr = 0, momGateThr = 10, proxGateThr = 10, rsWindow = 63) {
  const n = assetResults.length
  if (!n) return _emptyCurves()
  const { startDate, filteredDates } = _commonDates(assetResults)
  if (!filteredDates.length) return _emptyCurves(startDate)

  // ── Índices de fecha por activo (para cálculo de scores de prioridad) ─────
  const _dataMap = {}
  const _dateIdxMap = {}
  assetResults.forEach(ar => {
    _dataMap[ar.symbol] = ar.data || []
    const m = {}
    ;(ar.data || []).forEach((d, i) => { m[d.date] = i })
    _dateIdxMap[ar.symbol] = m
  })

  // ── Función de score: menor score = mayor prioridad (entra antes) ──────────
  function _priorityScore(t) {
    if (prioridad === 'alfabetico') return null  // handled inline in sort
    if (prioridad === 'score_metricas' || prioridad === 'ranking') {
      // 'ranking' mantenido como alias legacy — ambos usan scoreMap si disponible
      if (scoreMap) {
        const s = scoreMap[t.symbol] ?? null
        return s != null ? -s : 999  // mayor score → entra antes
      }
      // fallback: orden por symbolsList
      const ri = symbolsList ? symbolsList.indexOf(t.symbol) : -1
      return ri >= 0 ? ri : (symbolsList ? symbolsList.length : 999)
    }
    // Campos CRUDOS + flag de validez por candidato (para gates con umbral, sin la ambigüedad de _ps=0).
    // _psValid se refiere a la métrica ACTIVA (prioridad). El _ps devuelto NO cambia (orden idéntico).
    const data = _dataMap[t.symbol] || []
    const idx  = _dateIdxMap[t.symbol]?.[t.entryDate]
    if (idx == null || data.length === 0) { t._psValid = false; return 0 }

    if (prioridad === 'momentum') {
      const N = Math.max(1, momentumN || 20)
      if (idx < N) { t._psValid = false; return 0 }   // sin historial suficiente
      const ret = (data[idx].close - data[idx - N].close) / data[idx - N].close
      t._momRaw = ret; t._psValid = true
      return -ret  // mayor retorno → score más bajo → entra antes
    }
    if (prioridad === 'fuerza_relativa') {
      const LB = Math.max(2, Math.trunc(rsWindow) || 63)  // ventana en VELAS (configurable, default 63)
      if (idx < LB) { t._psValid = false; return 0 }  // sin historial suficiente del activo
      const retAsset = (data[idx].close - data[idx - LB].close) / data[idx - LB].close
      if (!sp500Data || !sp500Data.length) {
        console.warn('[concentrado] fuerza_relativa: sp500Data no disponible, usando momentum N=63')
        t._psValid = false; return -retAsset  // sin SP500 → RS no calculable → no válido (gate deja pasar)
      }
      let spIdx = -1
      for (let i = sp500Data.length - 1; i >= 0; i--) {
        if (sp500Data[i].date <= t.entryDate) { spIdx = i; break }
      }
      if (spIdx < LB) { t._psValid = false; return -retAsset }  // SP500 sin 63 barras en esa fecha
      const retSP = (sp500Data[spIdx].close - sp500Data[spIdx - LB].close) / sp500Data[spIdx - LB].close
      const rs = retAsset - retSP
      t._rsRaw = rs; t._psValid = true
      return -rs  // mayor alfa vs SP500 → entra antes
    }
    if (prioridad === 'max52') {
      const LB = Math.min(idx, 251)
      let max252 = -Infinity
      for (let i = idx - LB; i <= idx; i++) {
        const h = (data[i].high != null ? data[i].high : data[i].close)
        if (h > max252) max252 = h
      }
      if (max252 <= 0 || max252 === -Infinity) { t._psValid = false; return 0 }
      const ratio = data[idx].close / max252
      t._proxRaw = ratio                 // 1.0 = en el máximo; 0.9 = 10% por debajo
      t._psValid = idx >= 251            // válido solo con la ventana completa de 252 barras
      return -ratio  // más cercano al máximo → entra antes
    }
    return 0
  }

  const allCandidates = assetResults.flatMap(ar =>
    (ar.trades || []).map(t => {
      const c = {
        symbol:        ar.symbol,
        // Símbolo REAL del activo. En multicartera `symbol` es sintético (TICKER#estrategia) y sin esto la
        // agrupación por activo de _claveActivo se queda con el sintético: un ticker que opera en dos
        // estrategias saldría partido en dos, y assetStats, que busca por símbolo real, no encontraría sus
        // métricas. En el handler normal es undefined y _claveActivo cae en `symbol`, como siempre.
        _realSymbol:   ar._realSymbol,
        entryDate:     t.entryDate,
        exitDate:      t.exitDate,
        pnlPct:        t.pnlPct,
        entryPx:       t.entryPrice ?? t.entryPx,
        stopPx:        _stopInicial(t),
        dias:          t.dias,
        _virtualClose: !!t._virtualClose,
      }
      c._ps = _priorityScore(c)
      return c
    })
  )
  allCandidates.sort((a, b) => {
    if (a.entryDate < b.entryDate) return -1
    if (a.entryDate > b.entryDate) return 1
    if (prioridad === 'alfabetico') return a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0
    // Desempate final alfabético por símbolo cuando el score de prioridad empata (p.ej. mismo ticker
    // en dos estrategias → RS idéntico) → orden determinista y reproducible.
    return ((a._ps ?? 0) - (b._ps ?? 0)) || (a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0)
  })

  if (!allCandidates.length) return buildSlotsCurves(assetResults, capitalIni)

  const senalesGeneradas = allCandidates.length
  let cntEjecutadas = 0, cntDescSlots = 0, cntDescCapital = 0, cntDescGate = 0
  let pnlHipEur = 0
  const pnlDescartados = []

  let poolLibre = capitalIni
  const openSlots = {}
  const executedTrades = []
  const capitalAtEntryMap = {}

  const entriesByDate = {}
  allCandidates.forEach(t => {
    if (!entriesByDate[t.entryDate]) entriesByDate[t.entryDate] = []
    entriesByDate[t.entryDate].push(t)
  })

  const eventDates = [...new Set([
    ...allCandidates.map(t => t.entryDate),
    ...allCandidates.map(t => t.exitDate).filter(d => d != null),
  ])].sort()

  eventDates.forEach(date => {
    // 1. Cerrar primero (libera capital)
    const toClose = Object.keys(openSlots).filter(sym => openSlots[sym].trade.exitDate === date)
    toClose.forEach(symbol => {
      const { trade, capAsignado, totalPortfolioAtEntry: _tpAtEntry } = openSlots[symbol]
      if (!isFinite(trade.pnlPct)) { poolLibre += capAsignado; delete openSlots[symbol]; return }
      const capFinal = capAsignado * (1 + trade.pnlPct / 100)
      poolLibre += capFinal
      const _dist = (trade.stopPx && trade.entryPx && trade.entryPx > trade.stopPx)
        ? (trade.entryPx - trade.stopPx) / trade.entryPx : null
      executedTrades.push({
        ...trade,
        _capitalAtEntry: capAsignado,
        _totalPortfolioAtEntry: _tpAtEntry || capitalIni,
        capitalTras: capFinal,
        pnlSimple: capFinal - capAsignado,
        riesgoAcum: _dist ? capAsignado * _dist : capAsignado * 0.05,
      })
      delete openSlots[symbol]
    })

    // 2. Abrir entradas: cada una calcula su tamaño dinámicamente
    const entries = (entriesByDate[date] || []).filter(t => !openSlots[t.symbol])
    if (entries.length > 0 && poolLibre <= 0.01) {
      const _openCapsBlk = Object.values(openSlots).reduce((s, sl) => s + (sl.capAsignado || 0), 0)
      const _capMaxBlk = (poolLibre + _openCapsBlk) / Math.min(maxPosiciones, n)
      entries.forEach(t => {
        cntDescCapital++
        if (isFinite(t.pnlPct)) { pnlDescartados.push(t.pnlPct); pnlHipEur += _capMaxBlk * t.pnlPct / 100 }
      })
    }
    if (entries.length > 0 && poolLibre > 0.01) {
      // BUG B fix: contador de same-day trades abiertos en este batch
      // (no añaden a openSlots, así que slotsLibres debe compensarlo manualmente)
      let sameDayOpen = 0
      entries.forEach(t => {
        const posicionesAbiertas = Object.keys(openSlots).length
        // BUG B fix: descontar same-day trades del mismo batch para no superar maxPosiciones
        const slotsLibresEfectivos = maxPosiciones - posicionesAbiertas - sameDayOpen
        const openCapsTotal = Object.values(openSlots).reduce((s, sl) => s + (sl.capAsignado || 0), 0)
        const capitalTotal = poolLibre + openCapsTotal
        // Techo por posición: dividir entre el mínimo real de slots disponibles
        // (si hay menos activos que maxPosiciones, cada activo recibe mayor fracción)
        const slotsEfectivos = Math.min(maxPosiciones, n)
        const capMaxPorPosicion = capitalTotal / slotsEfectivos
        if (slotsLibresEfectivos <= 0) { cntDescSlots++; if (isFinite(t.pnlPct)) { pnlDescartados.push(t.pnlPct); pnlHipEur += capMaxPorPosicion * t.pnlPct / 100 } return }
        // GATE (filtro de entrada): activo si criterioUso==='filtro' y la métrica activa es gateable.
        // Vía limpia con valor CRUDO + flag de validez (sin la ambigüedad de _ps=0). _momRaw/_rsRaw son
        // FRACCIONES (0.10 = 10%); los umbrales llegan en % → se dividen por 100. _proxRaw es ratio close/max252.
        // Si _psValid===false (sin historial/SP500) DEJA PASAR (no filtra ante la duda).
        if (criterioUso === 'filtro' && (prioridad === 'fuerza_relativa' || prioridad === 'momentum' || prioridad === 'max52') && t._psValid === true) {
          let _gateBloquea = false
          if (prioridad === 'fuerza_relativa')  _gateBloquea = t._rsRaw  <= rsGateThr  / 100   // RS <= umbral% (default 0 → ≡ gate actual)
          else if (prioridad === 'momentum')    _gateBloquea = t._momRaw <= momGateThr / 100    // subió menos del umbral% → fuera
          else if (prioridad === 'max52')       _gateBloquea = t._proxRaw < (1 - proxGateThr / 100) // más lejos del X% del máximo → fuera
          if (_gateBloquea) {
            cntDescGate++
            if (isFinite(t.pnlPct)) { pnlDescartados.push(t.pnlPct); pnlHipEur += capMaxPorPosicion * t.pnlPct / 100 }
            return
          }
        }
        const capPorEntrada = Math.min(poolLibre, capMaxPorPosicion)
        if (capPorEntrada < 0.01) { cntDescCapital++; if (isFinite(t.pnlPct)) { pnlDescartados.push(t.pnlPct); pnlHipEur += capMaxPorPosicion * t.pnlPct / 100 } return }
        cntEjecutadas++
        poolLibre -= capPorEntrada
        const totalPortfolio = capitalTotal
        if (t.exitDate === date) {
          if (isFinite(t.pnlPct)) {
            const capFinal = capPorEntrada * (1 + t.pnlPct / 100)
            poolLibre += capFinal
            const _dist = (t.stopPx && t.entryPx && t.entryPx > t.stopPx)
              ? (t.entryPx - t.stopPx) / t.entryPx : null
            executedTrades.push({
              ...t,
              _capitalAtEntry: capPorEntrada,
              _totalPortfolioAtEntry: totalPortfolio,
              capitalTras: capFinal,
              pnlSimple: capFinal - capPorEntrada,
              riesgoAcum: _dist ? capPorEntrada * _dist : capPorEntrada * 0.05,
            })
          } else { poolLibre += capPorEntrada }
          sameDayOpen++  // BUG B fix: contabilizar slot consumido aunque no esté en openSlots
        } else {
          openSlots[t.symbol] = { trade: t, capAsignado: capPorEntrada, totalPortfolioAtEntry: totalPortfolio }
          capitalAtEntryMap[`${t.symbol}:${t.entryDate}`] = capPorEntrada
        }
      })
    }
  })

  // Cerrar posiciones abiertas al final del periodo (exitDate null o futuro)
  // BUG C fix: también registrar en executedTrades para que la compoundCurve
  // y assetStats los contabilicen correctamente
  Object.entries(openSlots).forEach(([, slot]) => {
    const { trade, capAsignado, totalPortfolioAtEntry } = slot
    const capFinal = capAsignado * (1 + (trade.pnlPct || 0) / 100)
    poolLibre += capFinal
    const _dist = (trade.stopPx && trade.entryPx && trade.entryPx > trade.stopPx)
      ? (trade.entryPx - trade.stopPx) / trade.entryPx : null
    executedTrades.push({
      ...trade,
      _capitalAtEntry: capAsignado,
      _totalPortfolioAtEntry: totalPortfolioAtEntry || capitalIni,
      capitalTras: capFinal,
      pnlSimple: capFinal - capAsignado,
      riesgoAcum: _dist ? capAsignado * _dist : capAsignado * 0.05,
    })
  })
  Object.keys(openSlots).forEach(sym => { delete openSlots[sym] })

  const symbolDataMap = {}
  assetResults.forEach(ar => { symbolDataMap[ar.symbol] = ar.data ? ar.data.filter(d => d.date >= startDate) : [] })

  // Métricas sobre el eje COMPLETO, antes de muestrear: el muestreo solo decide qué se dibuja.
  const _met = _metricasEjeCompleto(filteredDates, _posicionesPool(executedTrades, symbolDataMap), capitalIni)
  const step = Math.max(1, Math.floor(filteredDates.length / 400))
  const sampledDates = _sampledWithChanges(filteredDates, step, executedTrades,
    [_met.maxDDFechaPico, _met.maxDDFechaValle])
  const _ejeActivos = _ejeDibujoActivos(filteredDates)

  const simpleCurve = [], compoundCurve = [], floatSimpleCurve = [], floatCompoundCurve = []
  sampledDates.forEach(date => {
    const closedSoFar = executedTrades.filter(t => t.exitDate <= date)
    const val = capitalIni + closedSoFar.reduce((s, t) => s + t.pnlSimple, 0)
    compoundCurve.push({ date, value: val })
    const simpleVal = capitalIni + closedSoFar.reduce((s, t) => s + capitalIni * (t.pnlPct / 100), 0)
    simpleCurve.push({ date, value: simpleVal })
    const activeNow = allCandidates.filter(t => t.entryDate <= date && t.exitDate > date)
    let openPnlSimple = 0, openPnlCompound = 0
    activeNow.forEach(t => {
      const capEntry = capitalAtEntryMap[`${t.symbol}:${t.entryDate}`]
      if (capEntry == null) return
      const fData = symbolDataMap[t.symbol] || []
      let closePx = null
      for (let i = fData.length - 1; i >= 0; i--) { if (fData[i].date <= date) { closePx = fData[i].close; break } }
      if (closePx != null && t.entryPx) {
        const ret = (closePx - t.entryPx) / t.entryPx
        openPnlSimple += ret * capEntry
        openPnlCompound += ret * capEntry
      }
    })
    floatSimpleCurve.push({ date, value: simpleVal + openPnlSimple })
    floatCompoundCurve.push({ date, value: val + openPnlCompound })
  })

  const occupancyCurve = sampledDates.map((date, i) => {
    const openTrades = allCandidates.filter(t =>
      capitalAtEntryMap[`${t.symbol}:${t.entryDate}`] != null &&
      t.entryDate <= date && (!t.exitDate || t.exitDate > date || (t._virtualClose && t.exitDate >= date))
    )
    // CAPITAL EMPLEADO unificado: COSTE de entrada de las posiciones abiertas (Σ capEntry), en EUROS.
    // Sin (1+ret): estable, no se mueve con el precio (mismo criterio que Cap. disponible del Dashboard).
    const openCapTotal = openTrades.reduce((s, t) => s + (capitalAtEntryMap[`${t.symbol}:${t.entryDate}`] || 0), 0)
    return { date, value: openCapTotal }  // euros de coste
  })
  const tInvEstrategia = _met.tInv
  const avgCapOccupancy = _met.capInvPct

  const slotBH = capitalIni / n
  const bhCurve = sampledDates.map(date => {
    let total = 0
    assetResults.forEach(ar => {
      const filtData = ar.data ? ar.data.filter(d => d.date >= startDate) : []
      const p0 = filtData.length ? filtData[0].close : null
      if (!p0) { total += slotBH; return }
      let bar = null
      for (let i = filtData.length - 1; i >= 0; i--) { if (filtData[i].date <= date) { bar = filtData[i]; break } }
      total += bar ? slotBH * (bar.close / p0) : slotBH
    })
    return { date, value: total }
  })

  const _descWinsC = pnlDescartados.filter(p => p >= 0)
  const _descGrossWinC = _descWinsC.reduce((s, p) => s + p, 0)
  const _descGrossLossC = Math.abs(pnlDescartados.filter(p => p < 0).reduce((s, p) => s + p, 0))
  const senalStats = {
    generadas:            senalesGeneradas,
    ejecutadas:           cntEjecutadas,
    descartadasPorSlots:  cntDescSlots,
    descartadasPorCapital: cntDescCapital,
    descartadasPorGate:   cntDescGate,
    winRateDescartadas:   pnlDescartados.length ? _descWinsC.length / pnlDescartados.length * 100 : null,
    pfDescartadas:        _descGrossLossC > 0 ? _descGrossWinC / _descGrossLossC : _descGrossWinC > 0 ? 99 : null,
    pnlHipoteticoDescartadas: pnlHipEur,
  }

  return {
    simpleCurve, compoundCurve, bhCurve, occupancyCurve, startDate,
    executedTrades, floatSimpleCurve, floatCompoundCurve,
    tInvEstrategia, avgCapOccupancy, senalStats,
    ..._seriesPorActivoPool(sampledDates, _ejeActivos, executedTrades, allCandidates, capitalAtEntryMap, symbolDataMap, capitalIni),
    ..._calcDD(simpleCurve, compoundCurve, bhCurve, capitalIni),
    ..._calcFloatDD(floatSimpleCurve, floatCompoundCurve, capitalIni),
    ..._ddFlotanteCompuesto(_met), avgCapOccupancyEur: _met.capInvEur, metricasActivo: _met.porActivo
  }
}

// ── MODO POSITION SIZING: tamaño variable basado en stop loss ──
function buildPositionSizingCurves(assetResults, capitalIni, sizeRules) {
  const { riskPerTrade=5, maxPortfolioPct=20, maxAccumRisk=20, assumedStopPct=20 } = sizeRules || {}
  const riskPct   = riskPerTrade / 100
  const maxPctCap = maxPortfolioPct / 100
  const maxAccum  = maxAccumRisk / 100
  // Distancia de stop ASUMIDA para trades sin stop inicial válido. Antes, esos trades se
  // dimensionaban al techo de cartera E IMPUTABAN LA POSICIÓN ENTERA al riesgo acumulado
  // (riesgo = capital × maxPctCap), lo que con 20%/20% dejaba sitio para UNA sola posición
  // simultánea y hundía el modo. Ahora se les asigna una distancia plausible y siguen la MISMA
  // fórmula que los trades con stop real, así que riskPerTrade vuelve a tener efecto sobre ellos.
  const _asum = Number(assumedStopPct)
  const assumedDist = (Number.isFinite(_asum) && _asum > 0) ? _asum / 100 : 0.20
  const assumedPctShown = assumedDist * 100
  const n = assetResults.length
  if (!n) return _emptyCurves()
  const { startDate, filteredDates } = _commonDates(assetResults)
  if (!filteredDates.length) return _emptyCurves(startDate)

  const allCandidates = assetResults.flatMap(ar =>
    (ar.trades || []).map(t => ({
      symbol:        ar.symbol,
      // Símbolo REAL del activo. En multicartera `symbol` es sintético (TICKER#estrategia) y sin esto la
      // agrupación por activo de _claveActivo se queda con el sintético: un ticker que opera en dos
      // estrategias saldría partido en dos, y assetStats, que busca por símbolo real, no encontraría sus
      // métricas. En el handler normal es undefined y _claveActivo cae en `symbol`, como siempre.
      _realSymbol:   ar._realSymbol,
      entryDate:     t.entryDate,
      exitDate:      t.exitDate,
      pnlPct:        t.pnlPct,
      entryPrice:    t.entryPrice ?? t.entryPx,
      stopPx:        _stopInicial(t),
      dias:          Math.round((new Date(t.exitDate) - new Date(t.entryDate)) / 86400000),
      _virtualClose: !!t._virtualClose,
    }))
  ).sort((a, b) => a.entryDate < b.entryDate ? -1 : a.entryDate > b.entryDate ? 1 : a.symbol < b.symbol ? -1 : 1)

  if (!allCandidates.length) return buildSlotsCurves(assetResults, capitalIni)

  const senalesGeneradasPS = allCandidates.length
  let cntEjecutadasPS = 0, cntDescRiesgoPS = 0, cntDescCapitalPS = 0
  let cntSinStopPS = 0   // ejecutadas que se dimensionaron con la distancia ASUMIDA
  let pnlHipEurPS = 0
  const pnlDescartadosPS = []

  let poolLibre = capitalIni
  let riesgoAcumulado = 0
  const openSlots = {}          // { symbol: { trade, capAsignado, riesgoAsignado } }
  const executedTrades = []
  const capitalAtEntryMap = {}  // `${symbol}:${entryDate}` → capAsignado

  const entriesByDate = {}
  allCandidates.forEach(t => {
    if (!entriesByDate[t.entryDate]) entriesByDate[t.entryDate] = []
    entriesByDate[t.entryDate].push(t)
  })

  const eventDates = [...new Set([
    ...allCandidates.map(t => t.entryDate),
    ...allCandidates.map(t => t.exitDate),
  ])].sort()

  eventDates.forEach(date => {
    // 1. Cerrar posiciones que cierran hoy
    const toClose = Object.keys(openSlots)
      .filter(sym => openSlots[sym].trade.exitDate === date)
    toClose.forEach(symbol => {
      const { trade, capAsignado, riesgoAsignado, totalPortfolioAtEntry: _tpAtEntryPS } = openSlots[symbol]
      if (!isFinite(trade.pnlPct)) {
        poolLibre += capAsignado
        riesgoAcumulado -= riesgoAsignado
        delete openSlots[symbol]
        return
      }
      const capFinal = capAsignado * (1 + trade.pnlPct / 100)
      poolLibre += capFinal
      const riesgoAntes = riesgoAcumulado
      riesgoAcumulado -= riesgoAsignado
      executedTrades.push({
        ...trade,
        _capitalAtEntry: capAsignado,
        _totalPortfolioAtEntry: _tpAtEntryPS || capitalIni,
        capitalTras: capFinal,
        pnlSimple: capFinal - capAsignado,
        riesgoAcum: riesgoAntes,
      })
      delete openSlots[symbol]
    })

    // 2. Abrir entradas de hoy
    const entries = (entriesByDate[date] || [])
      .filter(t => !openSlots[t.symbol])

    entries.forEach(t => {
      if (!isFinite(t.pnlPct)) return
      const ep = t.entryPrice
      if (!ep || ep <= 0) return

      // Capital dinámico: capitalIni + ganancias realizadas hasta ahora
      const capitalActual = capitalIni + executedTrades.reduce((s, x) => s + x.pnlSimple, 0)
      const _openCapsPS = Object.values(openSlots).reduce((s, slot) => s + (slot.capAsignado || 0), 0)
      const _totalPortfolioPS = poolLibre + _openCapsPS

      // Sin stop inicial válido → distancia ASUMIDA. A partir de aquí el trade recorre
      // exactamente el mismo camino que uno con stop real (mismo sizing, mismo riesgo imputado).
      let distancia, _sinStop = false
      if (t.stopPx != null && t.stopPx > 0 && ep > t.stopPx) {
        distancia = (ep - t.stopPx) / ep
      } else {
        distancia = assumedDist
        _sinStop = true
      }

      let capAsignado = Math.min(
        capitalActual * riskPct / distancia,   // riesgo por trade
        capitalActual * maxPctCap              // techo de cartera por trade
      )
      const riesgoEsteTrade = capAsignado * distancia

      const _capSizedPS = capAsignado  // tamaño dimensionado antes del clamp a poolLibre
      if (riesgoAcumulado + riesgoEsteTrade > capitalActual * maxAccum) { cntDescRiesgoPS++; if (isFinite(t.pnlPct)) { pnlDescartadosPS.push(t.pnlPct); pnlHipEurPS += _capSizedPS * t.pnlPct / 100 } return }
      if (capAsignado > poolLibre) capAsignado = poolLibre
      if (capAsignado <= 0) { cntDescCapitalPS++; if (isFinite(t.pnlPct)) { pnlDescartadosPS.push(t.pnlPct); pnlHipEurPS += _capSizedPS * t.pnlPct / 100 } return }
      cntEjecutadasPS++
      if (_sinStop) cntSinStopPS++

      if (t.exitDate === date) {
        const capFinal = capAsignado * (1 + t.pnlPct / 100)
        poolLibre -= capAsignado
        poolLibre += capFinal
        executedTrades.push({
          ...t,
          _capitalAtEntry: capAsignado,
          _totalPortfolioAtEntry: _totalPortfolioPS,
          capitalTras: capFinal,
          pnlSimple: capFinal - capAsignado,
          riesgoAcum: riesgoAcumulado,
        })
        return
      }

      poolLibre -= capAsignado
      riesgoAcumulado += riesgoEsteTrade
      openSlots[t.symbol] = { trade: t, capAsignado, riesgoAsignado: riesgoEsteTrade, totalPortfolioAtEntry: _totalPortfolioPS }
      capitalAtEntryMap[`${t.symbol}:${t.entryDate}`] = capAsignado
    })
  })

  // ── Build symbol → filtered OHLCV map para curva flotante ──
  const symbolDataMap = {}
  assetResults.forEach(ar => { symbolDataMap[ar.symbol] = ar.data ? ar.data.filter(d => d.date >= startDate) : [] })

  // ── Construir curvas (mismo patrón que buildCompartidoCurves) ──
  // Métricas sobre el eje COMPLETO, antes de muestrear: el muestreo solo decide qué se dibuja.
  const _met = _metricasEjeCompleto(filteredDates, _posicionesPool(executedTrades, symbolDataMap), capitalIni)
  const step = Math.max(1, Math.floor(filteredDates.length / 400))
  const sampledDates = _sampledWithChanges(filteredDates, step, executedTrades,
    [_met.maxDDFechaPico, _met.maxDDFechaValle])
  const _ejeActivos = _ejeDibujoActivos(filteredDates)

  const simpleCurve = [], compoundCurve = [], floatSimpleCurve = [], floatCompoundCurve = []

  sampledDates.forEach(date => {
    const closedSoFar = executedTrades.filter(t => t.exitDate <= date)
    const val = capitalIni + closedSoFar.reduce((s, t) => s + t.pnlSimple, 0)
    compoundCurve.push({ date, value: val })
    const simpleVal = capitalIni + closedSoFar.reduce((s, t) => s + capitalIni * (t.pnlPct / 100), 0)
    simpleCurve.push({ date, value: simpleVal })

    const activeNow = allCandidates.filter(t => t.entryDate <= date && t.exitDate > date)
    let openPnlSimple = 0, openPnlCompound = 0
    activeNow.forEach(t => {
      const capEntry = capitalAtEntryMap[`${t.symbol}:${t.entryDate}`]
      if (capEntry == null) return
      const fData = symbolDataMap[t.symbol] || []
      let closePx = null
      for (let i = fData.length - 1; i >= 0; i--) { if (fData[i].date <= date) { closePx = fData[i].close; break } }
      if (closePx != null && t.entryPrice) {
        const ret = (closePx - t.entryPrice) / t.entryPrice
        openPnlSimple += ret * capEntry
        openPnlCompound += ret * capEntry
      }
    })
    floatSimpleCurve.push({ date, value: simpleVal + openPnlSimple })
    floatCompoundCurve.push({ date, value: val + openPnlCompound })
  })

  const occupancyCurve = sampledDates.map((date, i) => {
    const openTrades = allCandidates.filter(t =>
      capitalAtEntryMap[`${t.symbol}:${t.entryDate}`] != null &&
      t.entryDate <= date && (!t.exitDate || t.exitDate > date || (t._virtualClose && t.exitDate >= date))
    )
    // CAPITAL EMPLEADO unificado: COSTE de entrada de las posiciones abiertas (Σ capEntry), en EUROS.
    const openCapTotal = openTrades.reduce((s, t) => s + (capitalAtEntryMap[`${t.symbol}:${t.entryDate}`] || 0), 0)
    return { date, value: openCapTotal }  // euros de coste
  })
  const tInvEstrategia = _met.tInv
  const avgCapOccupancy = _met.capInvPct

  const slotBH = capitalIni / n
  const bhCurve = sampledDates.map(date => {
    let total = 0
    assetResults.forEach(ar => {
      const filtData = ar.data ? ar.data.filter(d => d.date >= startDate) : []
      const p0 = filtData.length ? filtData[0].close : null
      if (!p0) { total += slotBH; return }
      let bar = null
      for (let i = filtData.length - 1; i >= 0; i--) { if (filtData[i].date <= date) { bar = filtData[i]; break } }
      total += bar ? slotBH * (bar.close / p0) : slotBH
    })
    return { date, value: total }
  })

  const _descWinsPS = pnlDescartadosPS.filter(p => p >= 0)
  const _descGrossWinPS = _descWinsPS.reduce((s, p) => s + p, 0)
  const _descGrossLossPS = Math.abs(pnlDescartadosPS.filter(p => p < 0).reduce((s, p) => s + p, 0))
  const senalStatsPS = {
    generadas:             senalesGeneradasPS,
    ejecutadas:            cntEjecutadasPS,
    descartadasPorSlots:   0,
    descartadasPorRiesgo:  cntDescRiesgoPS,
    descartadasPorCapital: cntDescCapitalPS,
    // Aviso: operaciones ejecutadas que se dimensionaron con la distancia asumida por no tener
    // stop conocido en la vela de entrada (ver _stopInicial).
    sinStopInicial:        cntSinStopPS,
    distanciaAsumidaPct:   assumedPctShown,
    winRateDescartadas:    pnlDescartadosPS.length ? _descWinsPS.length / pnlDescartadosPS.length * 100 : null,
    pfDescartadas:         _descGrossLossPS > 0 ? _descGrossWinPS / _descGrossLossPS : _descGrossWinPS > 0 ? 99 : null,
    pnlHipoteticoDescartadas: pnlHipEurPS,
  }

  return {
    simpleCurve, compoundCurve, bhCurve, occupancyCurve, startDate,
    executedTrades, floatSimpleCurve, floatCompoundCurve,
    tInvEstrategia, avgCapOccupancy, senalStats: senalStatsPS,
    ..._seriesPorActivoPool(sampledDates, _ejeActivos, executedTrades, allCandidates, capitalAtEntryMap, symbolDataMap, capitalIni),
    ..._calcDD(simpleCurve, compoundCurve, bhCurve, capitalIni),
    ..._calcFloatDD(floatSimpleCurve, floatCompoundCurve, capitalIni),
    ..._ddFlotanteCompuesto(_met), avgCapOccupancyEur: _met.capInvEur, metricasActivo: _met.porActivo
  }
}

// ── MODO PESOS PERSONALIZADOS: cada activo con su % fijo ─────
// weights: {symbol: pct}  (pct en 0–100, suma = 100)
function buildCustomCurves(assetResults, capitalIni, weights) {
  const n = assetResults.length
  if (!n) return _emptyCurves()
  const { filteredDates, startDate } = _commonDates(assetResults)
  if (!filteredDates.length) return _emptyCurves(startDate)

  // Capital por activo según su peso
  const assetEquities = assetResults.map(ar => {
    const pct = weights?.[ar.symbol] ?? (100 / n)
    const slotCapital = capitalIni * (pct / 100)
    const { trades, data } = ar
    const filtData = data ? data.filter(d => d.date >= startDate) : []
    const p0 = filtData.length ? filtData[0].close : null
    const byDate = {}
    filteredDates.forEach(date => {
      const exitsBefore = trades.filter(t => t.exitDate <= date)
      // Reescalar pnlSimple al capital real del slot (el backtest usó slotCapital=capitalIni/n)
      // pnlPct es independiente → recalcular
      const simple = slotCapital + exitsBefore.reduce((s,t) => s + (slotCapital * t.pnlPct / 100), 0)
      // Para compuesta: escalar capitalTras (fue calculado con capitalIni/n)
      const origSlot = capitalIni / n  // capital usado en el backtest original
      const scale = slotCapital / origSlot
      const compound = exitsBefore.length
        ? slotCapital + (exitsBefore[exitsBefore.length-1].capitalTras - origSlot) * scale
        : slotCapital
      const openTrades = trades.filter(t => t.entryDate <= date && (!t.exitDate || t.exitDate > date || (t._virtualClose && t.exitDate >= date)))
      const open = openTrades.length > 0
      let bh = slotCapital, closePx = null
      if (p0 && filtData.length) {
        let bar = null
        for (let i = filtData.length-1; i>=0; i--) { if (filtData[i].date <= date) { bar=filtData[i]; break } }
        if (bar) { bh = slotCapital * (bar.close / p0); closePx = bar.close }
      }
      const openPnl = openTrades.reduce((s,t) => { if(closePx==null) return s; const ep=t.entryPx??t.entryPrice; return ep!=null ? s+(closePx-ep)/ep*slotCapital : s }, 0)
      byDate[date] = { simple, compound, open, bh, openPnl }
    })
    return { byDate, slotCapital }
  })

  const simpleCurve=[], compoundCurve=[], bhCurve=[], occupancyCurve=[], floatSimpleCurve=[], floatCompoundCurve=[]
  const totalSlots = assetResults.length
  const step = Math.max(1, Math.floor(filteredDates.length / 400))
  _sampledWithChanges(filteredDates, step, assetResults.flatMap(ar=>ar.trades||[])).forEach(date => {
    let totSimple=0, totCompound=0, totBH=0, openSlots=0, totOpenPnl=0
    assetEquities.forEach(({ byDate }) => {
      const e = byDate[date]
      if (e) { totSimple+=e.simple; totCompound+=e.compound; totBH+=e.bh; if(e.open)openSlots++; totOpenPnl+=e.openPnl||0 }
    })
    simpleCurve.push({ date, value: totSimple })
    compoundCurve.push({ date, value: totCompound })
    bhCurve.push({ date, value: totBH })
    occupancyCurve.push({ date, value: (openSlots/totalSlots)*100 })
    floatSimpleCurve.push({ date, value: totSimple+totOpenPnl })
    floatCompoundCurve.push({ date, value: totCompound+totOpenPnl })
  })

  return { simpleCurve, compoundCurve, bhCurve, occupancyCurve, startDate, floatSimpleCurve, floatCompoundCurve, ..._calcDD(simpleCurve, compoundCurve, bhCurve, capitalIni), ..._calcFloatDD(floatSimpleCurve, floatCompoundCurve, capitalIni) }
}

// ── Helpers ──────────────────────────────────────────────────
function _emptyCurves(startDate=null) {
  return { simpleCurve:[], compoundCurve:[], bhCurve:[], occupancyCurve:[], startDate,
    maxDDSimple:0, maxDDSimpleDate:null, maxDDCompound:0, maxDDCompoundDate:null, maxDDBH:0, maxDDBHDate:null,
    floatSimpleCurve:[], floatCompoundCurve:[],
    maxDDFloatSimple:0, maxDDFloatSimpleDate:null, maxDDFloatCompound:0, maxDDFloatCompoundDate:null }
}
function _commonDates(assetResults) {
  const dateSet = new Set()
  assetResults.forEach(ar => { if (ar.data) ar.data.forEach(d => dateSet.add(d.date)) })
  const allDates = [...dateSet].sort()
  const startDate = assetResults.reduce((mx, ar) => {
    const s = ar.startDate?.toISOString?.().split('T')[0] || ar.startDate
    return s > mx ? s : mx
  }, '0000-00-00')
  const filteredDates = allDates.filter(d => d >= startDate)
  return { allDates, startDate, filteredDates }
}

// ── Cobertura del periodo solicitado ─────────────────────────
// Hay dos topes SILENCIOSOS que hacen que un backtest cubra menos de lo pedido, y se avisan por separado
// porque sus causas son distintas:
//  · Histórico corto por activo: su primera vela es posterior al inicio pedido. Puede ser un activo que
//    empezó a cotizar más tarde o una fuente que no tiene más histórico de ese activo. Con lo que devuelve
//    fetchAV —no dice qué fuente sirvió— NO se puede distinguir cuál de las dos, así que la causa no se
//    informa en lugar de adivinarla.
//  · Recorte del modo rango: el cliente no manda `years` en modo rango y el motor caía a 5 años, así que
//    un rango largo se simulaba solo en sus últimos 5 aunque hubiera datos. Ya no ocurre: fetchData
//    descarga desde fromDate y _inicioSimulacion arranca en fromDate. La comprobación se mantiene, por su
//    condición EXACTA, como guarda: si el recorte volviera, el aviso reaparece en vez de callarse.
//  · Activos excluidos: pedidos que no tienen NINGUNA vela en el periodo, o cuya descarga no trajo nada,
//    y por eso no llegan a assetResults (el reparto de capital y el B&H se hacen sin ellos). No pueden
//    salir como cortos porque aquí solo se recorre assetResults: llegan aparte, ya calculados, en
//    `excluidos` (ver _activosExcluidos) y viajan en su propia lista, sin mezclarse con los cortos.
// Tolerancia de 10 días naturales en las dos comparaciones: el inicio pedido es una fecha de calendario y
// la primera vela real puede llegar días después por fin de semana, festivo o vela semanal.
const _TOLERANCIA_INICIO_DIAS = 10
const _diasEntre = (desde, hasta) => (new Date(hasta) - new Date(desde)) / 86400000
function _coberturaHistorico(assetResults, curves, cfg, excluidos = []) {
  const modoRango = !!(cfg?.fromDate && cfg?.toDate)
  const solicitadoDesde = modoRango ? cfg.fromDate : (curves?.startDate ?? null)
  // Por símbolo REAL: en portfolioMode cada ticker aparece una vez por estrategia con los mismos datos.
  const primera = {}, datosDesde = {}
  for (const ar of assetResults || []) {
    if (!ar?.data?.length) continue
    const sym = ar._realSymbol ?? ar.symbol
    if (sym in datosDesde) continue
    datosDesde[sym] = ar.data[0].date
    // Primera vela que la curva usa de verdad para este activo (las anteriores a startDate se descartan)
    primera[sym] = ar.data.find(d => d.date >= curves?.startDate)?.date ?? null
  }
  const cc = curves?.compoundCurve || []
  const realDesde = cc[0]?.date ?? null
  const realHasta = cc[cc.length - 1]?.date ?? null
  const cortos = solicitadoDesde
    ? Object.entries(datosDesde)
        .filter(([, desde]) => _diasEntre(solicitadoDesde, desde) > _TOLERANCIA_INICIO_DIAS)
        .map(([symbol, desde]) => ({ symbol, desde }))
        .sort((a, b) => a.desde.localeCompare(b.desde) || a.symbol.localeCompare(b.symbol))
    : []
  const recorteRango = modoRango && cfg.years == null && realDesde && curves.startDate > cfg.fromDate
    && _diasEntre(cfg.fromDate, realDesde) > _TOLERANCIA_INICIO_DIAS
    ? { pedidoDesde: cfg.fromDate, pedidoHasta: cfg.toDate, simuladoDesde: realDesde, simuladoHasta: realHasta, aniosMotor: cfg.years ?? 5 }
    : null
  // null cuando todo cubre lo pedido: la respuesta OMITE entonces el campo y el aviso desaparece solo.
  const avisos = (cortos.length || recorteRango || excluidos.length)
    ? { solicitadoDesde, solicitadoHasta: modoRango ? cfg.toDate : null, realDesde, realHasta, cortos, recorteRango, excluidos }
    : null
  return { primera, avisos }
}
function _calcDD(simpleCurve, compoundCurve, bhCurve, capitalIni) {
  const calcDD = curve => {
    let peak=curve[0]?.value||capitalIni, maxDD=0, maxDDDate=null, ddPeak=peak, ddValley=peak
    curve.forEach(p=>{ if(p.value>peak)peak=p.value; const dd=(peak-p.value)/peak*100; if(dd>maxDD){maxDD=dd;maxDDDate=p.date;ddPeak=peak;ddValley=p.value} })
    return { maxDD, maxDDDate, maxDDEur: ddValley - ddPeak }
  }
  const { maxDD:maxDDSimple, maxDDDate:maxDDSimpleDate, maxDDEur:maxDDSimpleEur } = calcDD(simpleCurve)
  const { maxDD:maxDDCompound, maxDDDate:maxDDCompoundDate, maxDDEur:maxDDCompoundEur } = calcDD(compoundCurve)
  const { maxDD:maxDDBH, maxDDDate:maxDDBHDate, maxDDEur:maxDDBHEur } = calcDD(bhCurve)
  return { maxDDSimple, maxDDSimpleDate, maxDDCompound, maxDDCompoundDate, maxDDBH, maxDDBHDate, maxDDSimpleEur, maxDDCompoundEur, maxDDBHEur }
}
function _calcFloatDD(floatSimpleCurve, floatCompoundCurve, capitalIni) {
  const calcDD = curve => {
    if(!curve?.length) return { maxDD:0, maxDDDate:null, maxDDEur:0 }
    let peak=curve[0]?.value||capitalIni, maxDD=0, maxDDDate=null, ddPeak=peak, ddValley=peak
    curve.forEach(p=>{ if(!p)return; if(p.value>peak)peak=p.value; const dd=(peak-p.value)/peak*100; if(dd>maxDD){maxDD=dd;maxDDDate=p.date;ddPeak=peak;ddValley=p.value} })
    return { maxDD, maxDDDate, maxDDEur: ddValley - ddPeak }
  }
  const { maxDD:maxDDFloatSimple, maxDDDate:maxDDFloatSimpleDate, maxDDEur:maxDDFloatSimpleEur } = calcDD(floatSimpleCurve)
  const { maxDD:maxDDFloatCompound, maxDDDate:maxDDFloatCompoundDate, maxDDEur:maxDDFloatCompoundEur } = calcDD(floatCompoundCurve)
  return { maxDDFloatSimple, maxDDFloatSimpleDate, maxDDFloatCompound, maxDDFloatCompoundDate, maxDDFloatSimpleEur, maxDDFloatCompoundEur }
}

// ── MÉTRICAS SOBRE EL EJE DIARIO COMPLETO ────────────────────────────────────
// PRINCIPIO: las métricas se miden aquí, barra a barra, sobre TODAS las fechas del periodo. El muestreo
// (_sampledWithChanges) existe solo para dibujar. Hasta V9.765 el Max DD flotante, el T.invertido y el
// Cap.invertido% se calculaban sobre las ~400 fechas muestreadas, que además fuerzan dentro todas las
// entradas y salidas: los días con posición quedaban sobrerrepresentados y las dos ocupaciones salían
// sesgadas al alza, mientras el Max DD podía saltarse el extremo real por caer entre dos muestras.
//
// `posiciones` normaliza los cuatro modos de asignación a una sola forma:
//   { clave, entryDate, exitDate, coste, realizado, entryPx, precios }
//   clave     símbolo REAL (_claveActivo), para agrupar por activo
//   coste     capital que sale de la caja al abrir la posición
//   realizado resultado en euros que se consolida al cerrarla
//   precios   barras del activo filtradas desde startDate, ascendentes
// De ahí salen, con las mismas cuentas para todos los modos:
//   patrimonio(fecha)   = capital inicial + realizado acumulado + P&L no realizado a precio de mercado
//   contribución(activo)= realizado acumulado del activo + su P&L no realizado   (arranca en cero)
//
// COSTE: una sola pasada por fechas, con punteros incrementales sobre las posiciones ordenadas por
// entrada y por salida y un cursor de precio por posición. Nunca recorre todas las operaciones en cada
// día —recorrer todas las operaciones por barra es O(días × operaciones)—, sino O(días + Σ días
// abiertos), que es lo que aguanta un periodo de 40 años con muchas operaciones.
const _FIN = '9999-99-99'   // exitDate ausente = sigue abierta al final del periodo
const _cmpFecha = (a, b) => a < b ? -1 : a > b ? 1 : 0

function _nuevoEstadoDD(capitalIni, primeraFecha) {
  return { valor: capitalIni, pico: capitalIni, picoFecha: primeraFecha,
    maxDD: 0, maxDDEur: 0, maxDDFechaPico: null, maxDDFechaValle: null,
    realizado: 0, dias: 0, sumaCoste: 0, sumaPct: 0 }
}
// Mismo cálculo de drawdown para la estrategia y para cada activo: esa es toda la gracia de tenerlo en
// una función. Se llama solo los días en que el valor cambia; un valor que no se mueve no puede crear un
// drawdown nuevo, así que saltárselos no altera el resultado y ahorra el recorrido.
function _pasoDD(st, valor, date) {
  st.valor = valor
  if (valor > st.pico) { st.pico = valor; st.picoFecha = date }
  if (st.pico > 0) {
    const dd = (st.pico - valor) / st.pico * 100
    if (dd > st.maxDD) {
      st.maxDD = dd; st.maxDDEur = valor - st.pico
      st.maxDDFechaPico = st.picoFecha; st.maxDDFechaValle = date
    }
  }
}
function _precioDe(pos, date) {
  const arr = pos.precios
  if (!arr || !arr.length) return null
  let i = pos._i || 0
  while (i + 1 < arr.length && arr[i + 1].date <= date) i++
  pos._i = i
  return arr[i].date <= date ? arr[i].close : null
}
function _resumeEstado(st, nFechas) {
  return {
    maxDD: st.maxDD, maxDDEur: st.maxDDEur,
    maxDDFechaPico: st.maxDDFechaPico, maxDDFechaValle: st.maxDDFechaValle,
    tInv: nFechas ? (st.dias / nFechas) * 100 : 0,
    capInvPct: nFechas ? st.sumaPct / nFechas : 0,
    capInvEur: nFechas ? st.sumaCoste / nFechas : 0,
  }
}
function _metricasEjeCompleto(fechas, posiciones, capitalIni) {
  const nF = fechas?.length || 0
  const vacio = { maxDD:0, maxDDEur:0, maxDDFechaPico:null, maxDDFechaValle:null, tInv:0, capInvPct:0, capInvEur:0 }
  if (!nF) return { ...vacio, porActivo: {} }
  const primera = fechas[0]
  // Copias propias: el cursor de precio (_i) se guarda en el objeto, y las dos ordenaciones no deben
  // tocar el array de quien llama.
  const pos = (posiciones || []).filter(p => p && p.entryDate && Number.isFinite(p.coste) && Number.isFinite(p.realizado))
    .map(p => ({ ...p, _i: 0 }))
  const porEntrada = [...pos].sort((a, b) => _cmpFecha(a.entryDate, b.entryDate))
  const porSalida  = [...pos].sort((a, b) => _cmpFecha(a.exitDate || _FIN, b.exitDate || _FIN))

  const estrategia = _nuevoEstadoDD(capitalIni, primera)
  const porActivo = new Map()
  const estadoDe = (k) => {
    let st = porActivo.get(k)
    if (!st) { st = _nuevoEstadoDD(capitalIni, primera); porActivo.set(k, st) }
    return st
  }
  ;[...new Set(pos.map(p => p.clave))].forEach(k => estadoDe(k))

  let iEnt = 0, iSal = 0, realizado = 0
  let abiertas = []
  for (const date of fechas) {
    // 1. Cierres del día: consolidan su resultado. Sus activos quedan "tocados" para que la curva de
    //    contribución de cada uno recoja hoy el salto de no realizado a realizado.
    const tocados = new Set()
    while (iSal < porSalida.length && (porSalida[iSal].exitDate || _FIN) <= date) {
      const p = porSalida[iSal++]
      realizado += p.realizado
      estadoDe(p.clave).realizado += p.realizado
      tocados.add(p.clave)
    }
    // 2. Entradas del día.
    while (iEnt < porEntrada.length && porEntrada[iEnt].entryDate <= date) abiertas.push(porEntrada[iEnt++])
    // 3. Las que siguen vivas aportan coste y P&L no realizado; las cerradas salen de la lista.
    let costeDia = 0, noRealDia = 0
    const costeAct = new Map(), flotAct = new Map()
    const vivas = []
    for (const p of abiertas) {
      if ((p.exitDate || _FIN) <= date) {
        // Abre y cierra el MISMO día: ocupó capital hoy aunque no llegue a la noche. Sin esto no contaba
        // para nada, porque el mapa de capital de entrada de los modos de pool no la registra.
        if (p.entryDate === date) {
          costeDia += p.coste
          costeAct.set(p.clave, (costeAct.get(p.clave) || 0) + p.coste)
        }
        continue
      }
      vivas.push(p)
      const px = _precioDe(p, date)
      const flot = (px != null && p.entryPx > 0) ? ((px - p.entryPx) / p.entryPx) * p.coste : 0
      costeDia += p.coste
      noRealDia += flot
      costeAct.set(p.clave, (costeAct.get(p.clave) || 0) + p.coste)
      flotAct.set(p.clave, (flotAct.get(p.clave) || 0) + flot)
    }
    abiertas = vivas
    // 4. Estrategia: patrimonio flotante del día y ocupación sobre ÉL, no sobre la curva realizada.
    const patrimonio = capitalIni + realizado + noRealDia
    _pasoDD(estrategia, patrimonio, date)
    if (costeDia > 0) {
      estrategia.dias++
      estrategia.sumaCoste += costeDia
      if (patrimonio > 0) estrategia.sumaPct += costeDia / patrimonio * 100
    }
    // 5. Activos: mismo denominador que la estrategia, para que los Cap.inv% sumen el suyo.
    for (const [k, c] of costeAct) {
      const st = estadoDe(k)
      st.dias++
      st.sumaCoste += c
      if (patrimonio > 0) st.sumaPct += c / patrimonio * 100
      tocados.add(k)
    }
    for (const k of flotAct.keys()) tocados.add(k)
    for (const k of tocados) {
      const st = estadoDe(k)
      _pasoDD(st, capitalIni + st.realizado + (flotAct.get(k) || 0), date)
    }
  }
  const resumenActivos = {}
  for (const [k, st] of porActivo) resumenActivos[k] = _resumeEstado(st, nF)
  return { ..._resumeEstado(estrategia, nF), porActivo: resumenActivos }
}
// El Max DD flotante de la estrategia sustituye al que _calcFloatDD saca de la curva muestreada,
// conservando los mismos nombres de campo para que el frontend no tenga que enterarse. Se escribe
// DESPUÉS de esparcir _calcFloatDD en el objeto de retorno, que es quien pierde con el empate.
function _ddFlotanteCompuesto(met) {
  return {
    maxDDFloatCompound:     met.maxDD,
    maxDDFloatCompoundDate: met.maxDDFechaValle,
    maxDDFloatCompoundEur:  met.maxDDEur,
  }
}
// Adaptadores: cada modo entrega sus posiciones en la forma común.
// Pool (compartido, concentrado, position sizing): executedTrades ya son las ejecuciones reales, con el
// capital de entrada y el resultado en euros. Incluyen las de entrada y salida el mismo día, que
// capitalAtEntryMap no registra; por eso se leen de aquí y ese mapa se queda como está.
function _posicionesPool(executedTrades, symbolDataMap) {
  return (executedTrades || []).map(t => ({
    clave:     _claveActivo(t),
    entryDate: t.entryDate,
    exitDate:  t.exitDate || null,
    coste:     t._capitalAtEntry,
    realizado: t.pnlSimple,
    entryPx:   t.entryPx ?? t.entryPrice ?? null,
    precios:   symbolDataMap[t.symbol] || [],
  }))
}
// Slots: cada activo compone dentro de su propio slot, así que el resultado NO es pnlSimple (calculado
// sobre la asignación fija) sino el incremento compuesto. capitalTras es el capital tras el trade, y
// deshaciendo su retorno sale el capital con el que entró.
function _posicionesSlots(assetResults, startDate) {
  const pos = []
  ;(assetResults || []).forEach(ar => {
    const precios = ar.data ? ar.data.filter(d => d.date >= startDate) : []
    const clave = _claveActivo(ar)
    ;(ar.trades || []).forEach(t => {
      if (!isFinite(t.pnlPct) || !Number.isFinite(t.capitalTras)) return
      const coste = t.capitalTras / (1 + t.pnlPct / 100)
      if (!Number.isFinite(coste)) return
      pos.push({
        clave, entryDate: t.entryDate, exitDate: t.exitDate || null,
        coste, realizado: t.capitalTras - coste,
        entryPx: t.entryPx ?? t.entryPrice ?? null, precios,
      })
    })
  })
  return pos
}

// ── buildTrades: convierte rawTrades {entryDate,exitDate,entryPrice,exitPrice} a trades enriquecidos ──
// Copia exacta de datos.js para mantener formato compatible con curvas de equity
function buildTrades(rawTrades, capitalIni, allocationPct = 100) {
  const fixedAlloc = capitalIni * (allocationPct / 100)
  let compoundCapital = capitalIni
  return rawTrades
    .filter(t => t.entryDate && t.exitDate && t.entryPrice > 0 && t.exitPrice > 0)
    .map(t => {
      const sharesSimple   = fixedAlloc / t.entryPrice
      const pnlSimple      = (t.exitPrice - t.entryPrice) * sharesSimple
      const pnlPct         = (t.exitPrice / t.entryPrice - 1) * 100
      const compAlloc      = compoundCapital * (allocationPct / 100)
      const sharesCompound = compAlloc / t.entryPrice
      const pnlCompound    = (t.exitPrice - t.entryPrice) * sharesCompound
      compoundCapital     += pnlCompound
      const dias = Math.max(1, Math.round((new Date(t.exitDate) - new Date(t.entryDate)) / 86400000))
      return { ...t, shares: sharesSimple, pnlSimple, pnlPct, capitalTras: compoundCapital, dias }
    })
}

// ── runCodeJsAsset: ejecuta code_js de una estrategia sobre un activo ──
// Sandbox idéntica a datos.js. Si falla → { trades:[], indicators:{}, filterZones:[] }
function runCodeJsAsset(data, sp500Data, codeJs, slotCapital, years, cfg) {
  try {
    const sp500Map = {}
    if (sp500Data) sp500Data.forEach(d => { sp500Map[d.date] = d.close })
    const enrichedData = data.map(d => ({ ...d, sp500Close: sp500Map[d.date] ?? null }))
    const wrappedCode = `"use strict";\n${codeJs}\nreturn run;`
    const getRunFn = new Function('calcEMA','calcSMA','calcRSI','calcATR','calcMACD', wrappedCode)
    const runFn = getRunFn(_libEMA, calcSMA, calcRSI, _libATR, calcMACD)
    const result = runFn(enrichedData, {
      ...(cfg || {}),
      capital_ini:    slotCapital,
      years:          cfg?.years ?? 5,
      allocation_pct: 100,
    })
    const rawTrades   = result.trades      ?? []
    const indicators  = result.indicators  ?? {}
    const filterZones = result.filterZones ?? []
    // Flush virtual: posición abierta al final del periodo
    const lastBar = data[data.length - 1]
    const openPos = result.openPosition ?? null
    if (openPos && openPos.entryDate && openPos.entryPrice > 0) {
      // Convención nueva: la estrategia expone openPosition explícitamente
      rawTrades.push({
        entryDate:     openPos.entryDate,
        exitDate:      lastBar.date,
        entryPrice:    openPos.entryPrice,
        exitPrice:     lastBar.close,
        stopPx:        openPos.stopPx ?? null,
        exitReason:    'virtual_close',
        _virtualClose: true,
      })
    } else if (rawTrades.length > 0) {
      // Fallback: convención antigua (push sin exitDate en entrada)
      const lastRaw = rawTrades[rawTrades.length - 1]
      if (lastRaw && !lastRaw.exitDate && lastRaw.entryPrice > 0) {
        rawTrades[rawTrades.length - 1] = {
          ...lastRaw,
          exitDate:      lastBar.date,
          exitPrice:     lastBar.close,
          _virtualClose: true,
        }
      }
    }
    const trades = buildTrades(rawTrades, slotCapital)
    return { trades, indicators, filterZones }
  } catch(e) {
    console.error('[runCodeJsAsset] error:', e.message)
    return { trades: [], indicators: {}, filterZones: [] }
  }
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

// ── Max Drawdown del precio de cierre (para B&H por activo) ──
function _calcPriceMaxDD(data, startDate) {
  const filtered = startDate ? data.filter(d => d.date >= startDate) : data
  if (!filtered.length) return { pct: 0, factor: 0 }
  const p0 = filtered[0].close
  let peak = filtered[0].close, maxDD = 0, ddPeak = peak, ddValley = peak
  filtered.forEach(d => {
    if (d.close > peak) peak = d.close
    const dd = (peak - d.close) / peak * 100
    if (dd > maxDD) { maxDD = dd; ddPeak = peak; ddValley = d.close }
  })
  return { pct: maxDD, factor: p0 > 0 ? (ddValley - ddPeak) / p0 : 0 }
}

// ── assetStats: métricas por activo con UNA sola convención en los cuatro modos ───────────────
// CONTRIBUCIÓN SOBRE EL CAPITAL INICIAL. La fila de un activo responde "cuánto aporta este activo a la
// cartera", no "cómo le fue al capital que le tocó". Antes cada modo usaba su propia base —slotCapital en
// Slots, el capital medio de entrada en Concentrado— y la fila del activo no se podía comparar ni con la
// de su estrategia ni con la del mismo activo en otro modo.
//   Max DD    sobre la curva `capital inicial + contribución del activo`, con la MISMA función que usa la
//             estrategia (_metricasEjeCompleto). Con un único activo esa curva ES la de la estrategia,
//             así que el Max DD sale idéntico por construcción, no por casualidad.
//   T.inv     días del eje COMPLETO con posición abierta en ese activo.
//   Cap.inv%  media diaria de (coste de lo abierto en el activo / patrimonio flotante de la ESTRATEGIA):
//             mismo denominador para todos, así que los porcentajes por activo suman el de la estrategia.
//   Cap.inv€  el mismo capital medio invertido, en euros. Sustituye a capInvertidoTotal, que sumaba el
//             capital de entrada de todas las operaciones: rotación acumulada, el mismo euro contado
//             tantas veces como se usara, y por eso salían 599.567 € con una cartera de 10.000 €.
//   G.Comp€   sin cambios. En los modos de pool es la suma de resultados reales del activo; en Slots, lo
//             que compuso su slot (capitalReinv − slotCapital). En ambos casos la suma por activos
//             reproduce el beneficio de la estrategia, que es capitalIni + Σ de esos mismos términos.
// `soloConEjecuciones` conserva el criterio de cada handler sobre qué filas existen: multicartera lista
// los activos que han operado; el handler normal lista todos los pedidos.
function _assetStatsUnificado({ assetResults, ejecucionesPorActivo, metricasActivo, slotCapital, startDate, esPool, pesoDe, conBreakdown, soloConEjecuciones }) {
  const claves = [], refPorClave = {}
  ;(assetResults || []).forEach(ar => {
    const k = _claveActivo(ar)
    if (!refPorClave[k]) { refPorClave[k] = ar; claves.push(k) }
  })
  return claves
    .filter(k => !soloConEjecuciones || (ejecucionesPorActivo[k] || []).length > 0)
    .map(clave => {
      const ar = refPorClave[clave]
      const ejec = ejecucionesPorActivo[clave] || []
      const m = metricasActivo?.[clave] || {}
      const wins   = ejec.filter(t => t.pnlPct >= 0)
      const losses = ejec.filter(t => t.pnlPct < 0)
      const ganSimple = ejec.reduce((s, t) => s + (t.pnlSimple || 0), 0)
      const ganComp = esPool ? ganSimple : (ar.capitalReinv ?? slotCapital) - slotCapital
      // B&H del activo: intacto, es la fila de comparación, no la de la estrategia.
      const filtData = ar.data?.filter(d => d.date >= startDate) ?? []
      const p0 = filtData[0]?.close
      const pN = filtData[filtData.length - 1]?.close
      const ganBH = (p0 && pN && p0 > 0) ? slotCapital * (pN / p0 - 1) : 0
      const { pct: priceMaxDD, factor: priceMaxDDFactor } = _calcPriceMaxDD(ar.data || [], startDate)
      return {
        symbol:      clave,
        trades:      ejec.length,
        wins:        wins.length,
        losses:      losses.length,
        winRate:     ejec.length ? (wins.length / ejec.length) * 100 : 0,
        ganSimple,
        ganComp,
        totalDias:   ejec.reduce((s, t) => s + (t.dias || 0), 0),
        weight:      pesoDe(clave),
        maxDD:       m.maxDD ?? 0,
        maxDDDate:   m.maxDDFechaValle ?? null,
        maxDDEur:    m.maxDDEur ?? 0,
        tInvertido:  m.tInv ?? 0,
        capInvMedio: m.capInvPct ?? 0,
        ganBH,
        priceMaxDD,
        priceMaxDDEur: slotCapital * priceMaxDDFactor,
        capInvMedioEur: m.capInvEur ?? 0,
        ...(conBreakdown ? { _stratBreakdown: (() => {
          const porStrat = new Map()
          ejec.forEach(t => {
            if (!porStrat.has(t._stratId)) porStrat.set(t._stratId, { id: t._stratId, name: t._stratName, trades: 0 })
            porStrat.get(t._stratId).trades++
          })
          return [...porStrat.values()].sort((a, b) => b.trades - a.trades)
        })() } : {}),
      }
    })
}
// Agrupa por símbolo REAL las ejecuciones que alimentan assetStats. En los modos de pool la clave va en
// el propio trade; en Slots los trades no llevan símbolo —se lo pone quien los saca de assetResults—, así
// que la clave sale de su activo.
function _ejecucionesPorActivo(trades) {
  const porClave = {}
  ;(trades || []).forEach(t => {
    const k = _claveActivo(t)
    if (!porClave[k]) porClave[k] = []
    porClave[k].push(t)
  })
  return porClave
}
function _ejecucionesPorActivoSlots(assetResults) {
  const porClave = {}
  ;(assetResults || []).forEach(ar => {
    const k = _claveActivo(ar)
    if (!porClave[k]) porClave[k] = []
    porClave[k].push(...(ar.trades || []))
  })
  return porClave
}

// ── PORTFOLIO MODE: N estrategias × M símbolos, un único pool ────────────────
// req.body: {
//   portfolioMode: true,
//   strategies: [{ id, name, symbols[] }],   // orden = prioridad de desempate
//   cfg: { capitalIni, years, fromDate?, toDate? },
//   modoAsig: 'concentrado' | 'compartido',
//   sizeRules: { maxPosiciones },             // prioridad forzada a 'alfabetico' (Fase 2: momentum/score)
//   intervalo: 'diario' | 'semanal',
// }
// Símbolo sintético: `${ticker}#${stratOrder.padStart(3,'0')}`
// → orden alfabético del sintético = (ticker, orden_estrategia)  → desempate determinista
// → buildConcentradoCurves no se modifica; ve N activos "distintos"
async function handlePortfolioMode(req, res) {
  const {
    strategies,
    cfg,
    modoAsig = 'concentrado',
    sizeRules: sizeRulesBody = null,
    filtros: filtrosCfg,
    intervalo,
  } = req.body

  if (!Array.isArray(strategies) || strategies.length < 2)
    return res.status(400).json({ error: 'portfolioMode requiere strategies[] con ≥2 entradas' })
  if (!cfg?.capitalIni)
    return res.status(400).json({ error: 'cfg.capitalIni requerido' })

  const sizeRules     = sizeRulesBody || {}
  const assetInterval = intervalo === 'semanal' ? '1wk' : '1d'

  try {
    // 1. Cargar code_js + params de cada estrategia desde Supabase (en paralelo)
    const stratMeta = await Promise.all(strategies.map(async (s, stratOrder) => {
      const base = { ...s, stratOrder, codeJs: null, effectiveCfg: cfg }
      if (!SUPA_URL || !SUPA_KEY) return base
      try {
        const sr = await fetch(
          `${SUPA_URL}/rest/v1/strategies?id=eq.${s.id}&select=code_js,params,name`,
          { headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` } }
        )
        if (!sr.ok) return base
        const row = (await sr.json())?.[0] || {}
        let stratParams = {}
        try { stratParams = row.params ? (typeof row.params === 'string' ? JSON.parse(row.params) : row.params) : {} } catch(_) {}
        return {
          ...s,
          stratOrder,
          name:        s.name || row.name || s.id,
          codeJs:      row.code_js || null,
          effectiveCfg: { ...cfg, ...stratParams },
        }
      } catch(_) { return base }
    }))

    // 2. Descargar OHLCV con cache por ticker (cada ticker solo una vez)
    const allTickers = [...new Set(stratMeta.flatMap(s => s.symbols || []))]
    const tickerCache = {}
    const descargas = {}   // ticker → resultado de fetchDataConMotivo, para avisar de los excluidos
    const BATCH = 4
    for (let i = 0; i < allTickers.length; i += BATCH) {
      const chunk = allTickers.slice(i, i + BATCH)
      await Promise.all(chunk.map(async ticker => {
        descargas[ticker] = await fetchDataConMotivo(ticker, cfg.years ?? 5, cfg.fromDate ?? null, cfg.toDate ?? null, assetInterval)
        tickerCache[ticker] = descargas[ticker].data
      }))
      if (i + BATCH < allTickers.length) await sleep(400)
    }

    let sp500Data = null
    try { sp500Data = await fetchData('^GSPC', cfg.years ?? 5, cfg.fromDate ?? null, cfg.toDate ?? null) } catch(_) {}
    // Fase 2B: SP500 en el timeframe del activo, SOLO para el gate de fuerza relativa.
    // Los demás consumidores (inyección a codeJs, filtros, B&H) siguen usando sp500Data diaria.
    // En diario, sp500DataTf === sp500Data (sin doble descarga).
    let sp500DataTf = sp500Data
    if (assetInterval === '1wk') { try { sp500DataTf = await fetchData('^GSPC', cfg.years ?? 5, cfg.fromDate ?? null, cfg.toDate ?? null, assetInterval) } catch(_) {} }

    // 3. Pre-contar pares válidos → slotCapital correcto antes de runCodeJsAsset
    let nPairs = 0
    for (const s of stratMeta) {
      if (!s.codeJs) continue
      for (const ticker of (s.symbols || []))
        if (tickerCache[ticker]?.length) nPairs++
    }
    if (!nPairs) {
      // Si TODOS los tickers pedidos se quedaron sin datos, se dice por qué; si hay datos pero ninguna
      // estrategia con código, el mensaje de siempre.
      const excluidos = _activosExcluidos(allTickers, descargas)
      const motivo = excluidos.length === allTickers.length ? _mensajeTodosExcluidos(excluidos, cfg) : null
      return res.status(400).json({ error: motivo ?? 'No hay pares (estrategia×símbolo) con datos válidos' })
    }
    const slotCapital = cfg.capitalIni / nPairs

    // 4. runCodeJsAsset por (estrategia, símbolo) → símbolo sintético determinista
    //    Símbolo sintético: `${ticker}#${stratOrder.padStart(3,'0')}`
    //    → el orden alfabético del sintético refleja (ticker, orden_estrategia)
    //    → buildConcentradoCurves ve N activos distintos; openSlots no colisiona
    //    Nota: slotCapital pasado a runCodeJsAsset solo afecta capitalTras del
    //    historial por símbolo — el pool recalcula todo desde pnlPct × capAsignado
    const assetResults = []
    for (const s of stratMeta) {
      if (!s.codeJs) continue
      const orderTag = String(s.stratOrder).padStart(3, '0')
      for (const ticker of (s.symbols || [])) {
        const data = tickerCache[ticker]
        if (!data?.length) continue
        const synSym = `${ticker}#${orderTag}`
        const { trades: rawTrades } = runCodeJsAsset(data, sp500Data, s.codeJs, slotCapital, cfg.years ?? 5, s.effectiveCfg)
        // Enriquecer cada trade con metadata de estrategia
        const trades = rawTrades.map(t => ({
          ...t,
          _stratId:    s.id,
          _stratName:  s.name,
          _stratOrder: s.stratOrder,
          _realSymbol: ticker,
        }))
        const startDate = _inicioSimulacion(data, cfg)
        assetResults.push({
          symbol:      synSym,
          _realSymbol: ticker,
          _stratId:    s.id,
          _stratName:  s.name,
          _stratOrder: s.stratOrder,
          data,
          trades,
          capitalReinv:   trades.length ? trades[trades.length - 1].capitalTras : slotCapital,
          gananciaSimple: trades.reduce((acc, t) => acc + t.pnlSimple, 0),
          startDate,
          blockEvents: {},
        })
      }
    }

    const n = assetResults.length
    if (!n) return res.status(400).json({ error: 'No se pudieron ejecutar señales para ningún par (estrategia×símbolo)' })

    // 4b. Filtros de mercado — portar el mismo bloque del path único
    //     Se ejecuta DESPUÉS de runCodeJsAsset (assetResults ya tiene trades con metadata)
    //     y ANTES de construir curvas. Los datos auxiliares se descargan UNA sola vez.
    const filtrosLista = normalizaFiltrosEntrada(filtrosCfg)
    const anyFiltroOn = hayFiltrosActivos(filtrosLista)
    const semanalPorSimbolo = {}   // ticker → serie semanal, solo si algún filtro de activo la pide
    const sinSerieSemanal = []     // tickers cuya serie semanal falló → operan sin ese filtro
    if (anyFiltroOn) {
      // Descargar UNA vez las series externas que piden los filtros de ámbito mercado. Los de
      // ámbito activo en DIARIO se evalúan sobre ar.data y no añaden ninguna petición.
      const filterAuxData = {}
      const filterFetchJobs = []
      const auxKeys = clavesAuxiliares(filtrosLista, '1wk', '1d')
      for (const akey of auxKeys) {
        const colonIdx = akey.lastIndexOf(':')
        const ticker = akey.slice(0, colonIdx), iv = akey.slice(colonIdx + 1)
        filterFetchJobs.push(fetchData(ticker, cfg.years ?? 5, cfg.fromDate ?? null, cfg.toDate ?? null, iv).then(r => { filterAuxData[akey] = r }).catch(() => {}))
      }
      if (filterFetchJobs.length) await Promise.all(filterFetchJobs)

      // Series SEMANALES de los propios activos, solo si algún filtro de ámbito activo las pide y el
      // backtest corre en diario (en semanal, ar.data YA son esas velas). Mismos lotes de 4 con
      // pausa de 400 ms que la descarga de activos, para no saturar al proveedor. Solo los tickers que
      // llegaron a assetResults: los excluidos no operan, así que ni se descarga ni se avisa su semanal.
      if (requiereSemanalDelActivo(filtrosLista) && assetInterval !== '1wk') {
        const tickersEnBacktest = [...new Set(assetResults.map(ar => ar._realSymbol))]
        for (let i = 0; i < tickersEnBacktest.length; i += BATCH) {
          const chunk = tickersEnBacktest.slice(i, i + BATCH)
          await Promise.all(chunk.map(async ticker => {
            const r = await fetchData(ticker, cfg.years ?? 5, cfg.fromDate ?? null, cfg.toDate ?? null, '1wk')
            if (r?.length) semanalPorSimbolo[ticker] = r
            else sinSerieSemanal.push(ticker)   // fail-open: opera sin filtro, pero se avisa
          }))
          if (i + BATCH < tickersEnBacktest.length) await sleep(400)
        }
      }

      const resolveFilterData = (ticker, iv) =>
        (ticker === '^GSPC' && iv !== '1wk') ? sp500Data : (filterAuxData[`${ticker}:${iv}`] ?? sp500Data)

      // Aplicar filtro por activo — ar.data = tickerCache[ar._realSymbol]
      // rebuildCapitalTras usa {...t} → preserva _stratId/_stratName/_realSymbol
      for (const ar of assetResults) {
        const assetDates = ar.data.map(d => d.date)
        const alineado = (src, semanal, periodo) => semanal
          ? buildAlignedWeekly(src, assetDates, periodo)
          : (() => { const closes = buildAlignedCloses(src, assetDates); return { closes, ema: calcEMA(closes, periodo) } })()
        const filtroActivoMap = construirFiltroActivoMap(filtrosLista, {
          assetBars: ar.data, assetDates, alineado,
          // Aquí ar.symbol es el símbolo SINTÉTICO (`ticker#orden`); el real es _realSymbol.
          assetSymbol: ar._realSymbol ?? ar.symbol,
          assetInterval: assetInterval === '1wk' ? 'semanal' : 'diario',
          resolveMercado: (ticker, semanal) => resolveFilterData(ticker, semanal ? '1wk' : '1d'),
          resolveSemanalActivo: (sym) => semanalPorSimbolo[sym] ?? null,
        })

        const filtered = ar.trades.filter(t => filtroActivoMap[t.entryDate] !== false)
        if (filtered.length !== ar.trades.length) {
          // rebuildCapitalTras hace {...t} → _stratId/_stratName/_realSymbol se preservan
          const rebuilt = rebuildCapitalTras(filtered, slotCapital)
          ar.trades = rebuilt
          ar.capitalReinv = rebuilt.length ? rebuilt[rebuilt.length - 1].capitalTras : slotCapital
          ar.gananciaSimple = rebuilt.reduce((s, t) => s + t.pnlSimple, 0)
        }
      }
    }

    // 5. Curvas — prioridad FORZADA a 'alfabetico' en esta fase
    //    (momentum/fuerza_relativa/scoreMap requieren lookups por synSym → Fase 2)
    const _maxPos   = sizeRules.maxPosiciones ?? 5
    const _momentN  = sizeRules.momentumN ?? 20
    const synList   = assetResults.map(ar => ar.symbol)
    let curves
    if (modoAsig === 'compartido') {
      curves = buildCompartidoCurves(assetResults, cfg.capitalIni)
    } else if (modoAsig === 'positionsizing') {
      // positionsizing: sizing por riesgo desde stopPx — slotCapital=capitalIni/nPairs es inocuo
      // (igual que concentrado: pool recalcula todo desde pnlPct × capAsignado)
      // executedTrades tendrá mismo problema de pérdida de metadata → cubierto por enrichedExec
      curves = buildPositionSizingCurves(assetResults, cfg.capitalIni, sizeRules || {})
    } else {
      // concentrado — Fase 3: desempate/gate por el criterio del usuario (fuerza_relativa/momentum),
      // reutilizando el mismo motor que el path normal. sp500DataTf ya en timeframe activo.
      // score_metricas/ranking necesitan scoreMap por símbolo REAL (no mapeable a synSym en Multicartera)
      // → se degradan a 'alfabetico' de forma segura.
      const _priorRaw = sizeRules.prioridad ?? 'alfabetico'
      const _prior    = (_priorRaw === 'score_metricas' || _priorRaw === 'ranking') ? 'alfabetico' : _priorRaw
      const _criterio = sizeRules.criterioUso ?? 'desempate'
      const _rsThr    = sizeRules.rsGateThr   ?? 0
      const _momThr   = sizeRules.momGateThr  ?? 10
      const _proxThr  = sizeRules.proxGateThr ?? 10
      const _rsWindow = sizeRules.rsWindow    ?? 63
      curves = buildConcentradoCurves(
        assetResults, cfg.capitalIni, _maxPos,
        _prior, _momentN, sp500DataTf, synList, null,
        _criterio, _rsThr, _momThr, _proxThr, _rsWindow
      )
    }

    // 6. assetStats agrupado por símbolo REAL (no sintético)
    //    buildConcentradoCurves reconstruye allCandidates con campos explícitos y pierde
    //    _stratId/_stratName/_realSymbol. Re-enriquecer executedTrades desde synMeta
    //    (assetResults sí conserva la metadata original del loop runCodeJsAsset).
    const synMeta = {}
    assetResults.forEach(ar => {
      synMeta[ar.symbol] = { _stratId: ar._stratId, _stratName: ar._stratName, _realSymbol: ar._realSymbol }
    })
    const enrichedExec = (curves.executedTrades || []).map(t => {
      const meta = synMeta[t.symbol] || {}
      return {
        ...t,
        _stratId:    t._stratId    ?? meta._stratId,
        _stratName:  t._stratName  ?? meta._stratName,
        _realSymbol: t._realSymbol ?? meta._realSymbol ?? (t.symbol || '').split('#')[0],
      }
    })
    // Fuente unificada: enrichedExec si hay executedTrades, fallback a trades directos (ya tienen metadata)
    const execSource = enrichedExec.length
      ? enrichedExec
      : assetResults.flatMap(ar => ar.trades)

    const execByRealSym = _ejecucionesPorActivo(execSource)
    const nRealSyms = Object.keys(execByRealSym).length || 1
    const assetStats = _assetStatsUnificado({
      assetResults, ejecucionesPorActivo: execByRealSym,
      metricasActivo: curves.metricasActivo, slotCapital, startDate: curves.startDate,
      esPool: true, pesoDe: () => 100 / nRealSyms, conBreakdown: true, soloConEjecuciones: true,
    })

    // 7. allTrades: restaurar symbol = realSymbol para el render de tabla (usa execSource enriquecido)
    const sourceTrades = execSource
      .map(t => ({ ...t, symbol: t._realSymbol || t.symbol.split('#')[0] }))
      .sort((a, b) => (a.exitDate || '').localeCompare(b.exitDate || ''))

    // 8. SP500 B&H benchmark
    let sp500BHCurve = []
    if (sp500Data?.length && curves.simpleCurve?.length) {
      const sp0 = sp500Data.find(d => d.date >= curves.startDate)
      if (sp0) {
        sp500BHCurve = curves.simpleCurve.map(({ date }) => {
          let bar = null
          for (let i = sp500Data.length - 1; i >= 0; i--) {
            if (sp500Data[i].date <= date) { bar = sp500Data[i]; break }
          }
          return bar ? { date, value: cfg.capitalIni * (bar.close / sp0.close) } : null
        }).filter(Boolean)
      }
    }

    const avgOccupancy = curves.avgCapOccupancy ?? (
      curves.occupancyCurve?.length
        ? curves.occupancyCurve.reduce((acc, p) => acc + p.value, 0) / curves.occupancyCurve.length
        : 0
    )

    // Cobertura del periodo pedido (ver _coberturaHistorico). Clave por símbolo real, como assetStats aquí.
    const cobertura = _coberturaHistorico(assetResults, curves, cfg, _activosExcluidos(allTickers, descargas))

    return res.status(200).json({
      ...curves,
      // Solo alimenta assetStats aquí arriba; no viaja (JSON.stringify descarta las claves undefined).
      metricasActivo: undefined,
      sp500BHCurve,
      // Solo presente si hay algo que avisar: símbolos cuya serie semanal no se pudo descargar y
      // que por tanto operaron SIN el filtro de activo en semanal (fail-open silencioso de otro modo).
      ...(sinSerieSemanal.length ? { avisosFiltros: { sinSerieSemanal } } : {}),
      // Solo presente si algo no cubre el periodo pedido: activos cortos y/o recorte del modo rango.
      ...(cobertura.avisos ? { avisosHistorico: cobertura.avisos } : {}),
      assetStats: assetStats.map(a => ({ ...a, primeraFecha: cobertura.primera[a.symbol] ?? null })),
      // Tamaño de las series por activo, para vigilar el coste de la respuesta.
      ...(curves.assetCurves ? { assetCurvesInfo: _tamanoAssetCurves(curves.assetCurves) } : {}),
      allTrades:       sourceTrades,
      avgOccupancy,
      tInvEstrategia:  curves.tInvEstrategia ?? 0,
      avgCapOccupancy: curves.avgCapOccupancy ?? avgOccupancy,
      n,
      slotCapital,
      modoAsig,
      startDate:       curves.startDate,
      senalStats:      curves.senalStats ?? null,
      portfolioMode:   true,
      strategyCount:   strategies.length,
    })
  } catch (err) {
    console.error('[handlePortfolioMode]', err)
    return res.status(500).json({ error: err.message || 'Error interno en portfolioMode' })
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  // ── NUEVA RAMA: portfolioMode ─────────────────────────────────────────────
  if (req.body?.portfolioMode) return handlePortfolioMode(req, res)
  // ── PATH EXISTENTE: estrategia única — sin cambio ninguno desde aquí ──────
  const { symbols, cfg: cfgInput, definition, modoAsig = 'slots', weights = {}, sizeRules: sizeRulesBody = null, strategyId = null, isNoStrategy = false, filtros: filtrosCfg, intervalo } = req.body
  const sizeRules = sizeRulesBody || cfgInput?.sizeRules || {}
  if (!Array.isArray(symbols) || !symbols.length) return res.status(400).json({ error: 'symbols requerido' })
  let cfg = cfgInput
  if (!cfg && definition) {
    const entry = definition.entry || {}
    const stop  = definition.stop  || {}
    const mgmt  = definition.management || {}
    const rawFilt = definition.filter || {}
    const filt    = rawFilt.conditions?.length ? rawFilt.conditions[0] : rawFilt
    cfg = {
      emaR:        entry.ma_fast   || 10,
      emaL:        entry.ma_slow   || 11,
      capitalIni:  definition.capitalIni || 10000,
      years:       definition.years      || 5,
      tipoStop:    stop.type === 'atr_based' ? 'atr' : stop.type === 'none' ? 'none' : 'tecnico',
      atrPeriod:   stop.atr_period || 14,
      atrMult:     stop.atr_mult   || 1.0,
      sinPerdidas: mgmt.sin_perdidas !== false,
      reentry:     mgmt.reentry     !== false,
      tipoFiltro:  filt.type        || 'none',
      sp500EmaR:   filt.sp500EmaR   || filt.ma_fast || 10,
      sp500EmaL:   filt.sp500EmaL   || filt.ma_slow || 20,
    }
  }
  if (!cfg) return res.status(400).json({ error: 'Se requiere cfg o definition' })

  // Fetch code_js y params desde Supabase si se proporcionó strategyId
  let codeJs = null
  let effectiveCfg = cfg
  if (strategyId && SUPA_URL && SUPA_KEY) {
    try {
      const sr = await fetch(
        `${SUPA_URL}/rest/v1/strategies?id=eq.${strategyId}&select=code_js,params`,
        { headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` } }
      )
      if (sr.ok) {
        const row = (await sr.json())?.[0] || {}
        codeJs = row.code_js || null
        let stratParams = {}
        try {
          stratParams = row.params
            ? (typeof row.params === 'string' ? JSON.parse(row.params) : row.params)
            : {}
        } catch(_) {}
        // cfg del frontend + params de Supabase (stratParams tiene prioridad)
        effectiveCfg = { ...cfg, ...stratParams }
      }
    } catch(_) { codeJs = null }
  }
  // Guard: sin code_js y no es "0 No Strategy" → error claro, nunca ejecutar estrategia hardcoded
  if (!codeJs && !isNoStrategy) {
    return res.status(400).json({ error: 'La estrategia no tiene código ejecutable (code_js). Comprueba que la estrategia esté guardada correctamente en Supabase.' })
  }

  try {
    // Descargar datos en batches para no saturar el proveedor
    const assetInterval = intervalo === 'semanal' ? '1wk' : '1d'
    const BATCH = 4
    const allData = {}
    const descargas = {}   // símbolo → resultado de fetchDataConMotivo, para avisar de los excluidos
    for (let i = 0; i < symbols.length; i += BATCH) {
      const chunk = symbols.slice(i, i+BATCH)
      await Promise.all(chunk.map(async sym => {
        descargas[sym] = await fetchDataConMotivo(sym, cfg.years ?? 5, cfg.fromDate ?? null, cfg.toDate ?? null, assetInterval)
        allData[sym] = descargas[sym].data
      }))
      if (i+BATCH < symbols.length) await sleep(400)
    }

    // SP500 para el filtro (siempre diario)
    let sp500Data = null
    try { sp500Data = await fetchData('^GSPC', cfg.years ?? 5, cfg.fromDate ?? null, cfg.toDate ?? null) } catch(_) {}
    // Fase 2B: SP500 en el timeframe del activo, SOLO para el gate de fuerza relativa.
    // Filtros de mercado, curva B&H y sp500Close inyectado al codeJs siguen usando sp500Data diaria.
    // En diario, sp500DataTf === sp500Data (sin doble descarga).
    let sp500DataTf = sp500Data
    if (assetInterval === '1wk') { try { sp500DataTf = await fetchData('^GSPC', cfg.years ?? 5, cfg.fromDate ?? null, cfg.toDate ?? null, assetInterval) } catch(_) {} }

    // ── Fetch datos auxiliares para filtros de mercado ──
    const filtrosLista = normalizaFiltrosEntrada(filtrosCfg)
    const anyFiltroOn = hayFiltrosActivos(filtrosLista)
    const filterAuxData = {} // key: `${ticker}:${iv}` → data
    const semanalPorSimbolo = {}   // símbolo → serie semanal, solo si algún filtro de activo la pide
    const sinSerieSemanal = []     // símbolos cuya serie semanal falló → operan sin ese filtro
    if (anyFiltroOn) {
      const filterFetchJobs = []
      // Solo las series externas de los filtros de ámbito mercado; los de ámbito activo en DIARIO
      // usan ar.data.
      const auxKeys = clavesAuxiliares(filtrosLista, '1wk', '1d')
      for (const akey of auxKeys) {
        const colonIdx = akey.lastIndexOf(':')
        const ticker = akey.slice(0, colonIdx), iv = akey.slice(colonIdx + 1)
        filterFetchJobs.push(
          fetchData(ticker, cfg.years ?? 5, cfg.fromDate ?? null, cfg.toDate ?? null, iv)
            .then(r => { filterAuxData[akey] = r }).catch(() => {})
        )
      }
      if (filterFetchJobs.length) await Promise.all(filterFetchJobs)

      // Series SEMANALES de los propios activos, solo si algún filtro de ámbito activo las pide y el
      // backtest corre en diario (en semanal, allData[sym] YA son esas velas). Mismos lotes de 4 con
      // pausa de 400 ms que la descarga de activos, para no saturar al proveedor. Solo los símbolos con
      // datos, que son los que llegan a assetResults: los excluidos no operan, así que ni se descarga ni
      // se avisa su semanal.
      if (requiereSemanalDelActivo(filtrosLista) && assetInterval !== '1wk') {
        const simbolosConDatos = symbols.filter(s => allData[s]?.length)
        for (let i = 0; i < simbolosConDatos.length; i += BATCH) {
          const chunk = simbolosConDatos.slice(i, i + BATCH)
          await Promise.all(chunk.map(async sym => {
            const r = await fetchData(sym, cfg.years ?? 5, cfg.fromDate ?? null, cfg.toDate ?? null, '1wk')
            if (r?.length) semanalPorSimbolo[sym] = r
            else sinSerieSemanal.push(sym)   // fail-open: opera sin filtro, pero se avisa
          }))
          if (i + BATCH < simbolosConDatos.length) await sleep(400)
        }
      }
    }

    // Capital por slot (base para pnlPct; reescalado en modos con pool compartido)
    const n = symbols.filter(s => allData[s]?.length).length
    // Sin ningún activo con datos: se dice por qué (sin velas en el periodo) y, si todo fue fallo de
    // descarga, el mensaje de siempre.
    if (!n) return res.status(400).json({ error: _mensajeTodosExcluidos(_activosExcluidos(symbols, descargas), cfg) ?? 'No se pudieron cargar datos de ningún símbolo' })
    const slotCapital = cfg.capitalIni / n

    // Ejecutar backtest individual por activo
    const assetResults = symbols.map(sym => {
      const data = allData[sym]
      if (!data?.length) return null
      if (codeJs) {
        // Motor code_js: sandbox por activo con slotCapital = capital total / nº activos
        const { trades } = runCodeJsAsset(data, sp500Data, codeJs, slotCapital, cfg.years ?? 5, effectiveCfg)
        const capitalReinv = trades.length ? trades[trades.length-1].capitalTras : slotCapital
        const gananciaSimple = trades.reduce((s,t) => s + t.pnlSimple, 0)
        const startDate = _inicioSimulacion(data, cfg)
        return { symbol: sym, data, trades, capitalReinv, gananciaSimple, startDate, blockEvents: {} }
      }
      // isNoStrategy: sin código → trades vacíos; los filtros los poblarán si están activos
      const startDate = _inicioSimulacion(data, cfg)
      return { symbol: sym, data, trades: [], capitalReinv: slotCapital, gananciaSimple: 0, startDate, blockEvents: {} }
    }).filter(Boolean)

    // ── Aplicar filtros de mercado a trades por activo ──
    let filterZones = []
    // Las filterZones de la respuesta se toman del PRIMER activo, así que solo son representativas
    // si todos los filtros activos son de ámbito mercado (iguales para todos los activos). En cuanto
    // haya alguno de ámbito activo, las zonas del primero no valen para el resto y no se emiten:
    // mejor sin campo que con un campo que miente.
    const zonasRepresentativas = filtrosActivos(filtrosLista).every(f => f.ambito === 'mercado')
    if (anyFiltroOn) {
      for (const ar of assetResults) {
        const assetDates = ar.data.map(d => d.date)

        // Resuelve dataset para ticker+interval (^GSPC diario → sp500Data)
        const resolveFilterData = (ticker, iv) =>
          (ticker === '^GSPC' && iv !== '1wk') ? sp500Data : (filterAuxData[`${ticker}:${iv}`] ?? sp500Data)

        const alineado = (src, semanal, periodo) => semanal
          ? buildAlignedWeekly(src, assetDates, periodo)
          : (() => { const closes = buildAlignedCloses(src, assetDates); return { closes, ema: calcEMA(closes, periodo) } })()

        const filtroActivoMap = construirFiltroActivoMap(filtrosLista, {
          assetBars: ar.data, assetDates, alineado,
          assetSymbol: ar.symbol,
          assetInterval: assetInterval === '1wk' ? 'semanal' : 'diario',
          resolveMercado: (ticker, semanal) => resolveFilterData(ticker, semanal ? '1wk' : '1d'),
          resolveSemanalActivo: (sym) => semanalPorSimbolo[sym] ?? null,
        })

        // Guardar filterZones del primer activo para incluirlas en la respuesta
        if (zonasRepresentativas && !filterZones.length) {
          let zoneStart = null
          for (const bar of ar.data) {
            const blocked = !filtroActivoMap[bar.date]
            if (blocked && zoneStart === null) zoneStart = bar.date
            else if (!blocked && zoneStart !== null) { filterZones.push({ from: zoneStart, to: bar.date }); zoneStart = null }
          }
          if (zoneStart !== null) filterZones.push({ from: zoneStart, to: ar.data[ar.data.length-1].date })
        }

        // "0 No Strategy": generar trades desde transiciones del filtro (solo si isNoStrategy)
        if (isNoStrategy && ar.trades.length === 0) {
          const genRaw = []
          let entryPx = null, entryDate = null
          const startDateStr = ar.startDate
          for (let i = 0; i < ar.data.length; i++) {
            const bar = ar.data[i]
            if (bar.date < startDateStr) continue
            const active = filtroActivoMap[bar.date] !== false
            const prevActive = i > 0 ? filtroActivoMap[ar.data[i-1].date] !== false : false
            if (!prevActive && active && i + 1 < ar.data.length) {
              // Entry at next bar's open (no look-ahead): price AND date from bar[i+1]
              // Consistent with datos.js filter path (entryIdx = i+1, date = data[i+1].date)
              entryPx = ar.data[i+1].open; entryDate = ar.data[i+1].date
            }
            if (prevActive && !active && entryPx != null) {
              genRaw.push({ entryDate, exitDate: bar.date, entryPrice: entryPx, exitPrice: bar.close })
              entryPx = null; entryDate = null
            }
          }
          if (entryPx != null) {
            const lastBar = ar.data[ar.data.length-1]
            genRaw.push({ entryDate, exitDate: lastBar.date, entryPrice: entryPx, exitPrice: lastBar.close, _virtualClose: true })
          }
          if (genRaw.length) {
            ar.trades = buildTrades(genRaw, slotCapital)
            ar.capitalReinv = ar.trades[ar.trades.length-1].capitalTras
            ar.gananciaSimple = ar.trades.reduce((s,t) => s + t.pnlSimple, 0)
          }
        } else {
          // Filtrar trades existentes por filtroActivoMap
          const filtered = ar.trades.filter(t => filtroActivoMap[t.entryDate] !== false)
          if (filtered.length !== ar.trades.length) {
            const rebuilt = rebuildCapitalTras(filtered, slotCapital)
            ar.trades = rebuilt
            ar.capitalReinv = rebuilt.length ? rebuilt[rebuilt.length-1].capitalTras : slotCapital
            ar.gananciaSimple = rebuilt.reduce((s,t) => s + t.pnlSimple, 0)
          }
        }
      }
    }

    // Calcular curvas según modo de asignación
    let curves
    if (modoAsig === 'compartido') {
      curves = buildCompartidoCurves(assetResults, cfg.capitalIni)
    } else if (modoAsig === 'concentrado') {
      const _prior    = sizeRules.prioridad  ?? 'alfabetico'
      const _momentN  = sizeRules.momentumN  ?? 20
      const _scoreMap = sizeRules.scoreMap   ?? null
      const _criterio = sizeRules.criterioUso ?? 'desempate'
      const _rsThr   = sizeRules.rsGateThr   ?? 0
      const _momThr  = sizeRules.momGateThr  ?? 10
      const _proxThr = sizeRules.proxGateThr ?? 10
      const _rsWindow = sizeRules.rsWindow   ?? 63   // ventana del gate RS en velas (default 63)
      curves = buildConcentradoCurves(assetResults, cfg.capitalIni, sizeRules.maxPosiciones ?? 5, _prior, _momentN, sp500DataTf, symbols, _scoreMap, _criterio, _rsThr, _momThr, _proxThr, _rsWindow)
    } else if (modoAsig === 'positionsizing') {
      curves = buildPositionSizingCurves(assetResults, cfg.capitalIni, sizeRules)
    } else {
      // 'slots' por defecto — también maneja legacy 'custom'
      curves = buildSlotsCurves(assetResults, cfg.capitalIni)
    }

    // Métricas por activo (tabla resumen). Una sola convención para los cuatro modos: contribución
    // sobre el capital inicial, con el Max DD medido por la MISMA función que la estrategia sobre el eje
    // diario completo. En los modos de pool las filas salen de las ejecuciones reales; en Slots, de los
    // trades de cada activo, que ahí se ejecutan todos.
    const _esPool = modoAsig === 'compartido' || modoAsig === 'concentrado' || modoAsig === 'positionsizing'
    const assetStats = _assetStatsUnificado({
      assetResults,
      ejecucionesPorActivo: _esPool
        ? _ejecucionesPorActivo(curves.executedTrades)
        : _ejecucionesPorActivoSlots(assetResults),
      metricasActivo: curves.metricasActivo,
      slotCapital,
      startDate: curves.startDate,
      esPool: _esPool,
      pesoDe: (clave) => weights?.[clave] ?? (100 / n),
      conBreakdown: false,
      soloConEjecuciones: false,
    })

    // % medio de capital invertido (usa avgCapOccupancy capital-weighted si está disponible)
    const avgOccupancy = curves.avgCapOccupancy ?? (
      curves.occupancyCurve.length
        ? curves.occupancyCurve.reduce((s,p)=>s+p.value,0)/curves.occupancyCurve.length
        : 0
    )

    // Historial combinado ordenado por fecha salida
    const sourceTrades = (modoAsig === 'compartido' || modoAsig === 'concentrado' || modoAsig === 'positionsizing')
      ? (curves.executedTrades || []).map(t => {
          if (t.riesgoAcum !== undefined) return t  // positionsizing ya lo tiene
          const ep = t.entryPrice ?? t.entryPx
          const stopIni = _stopInicial(t)
          const dist = (ep && stopIni && ep > stopIni) ? (ep - stopIni) / ep : null
          const cap = t._capitalAtEntry ?? slotCapital
          return { ...t, riesgoAcum: dist != null ? dist * cap : null }
        })
      : assetResults.flatMap(ar => ar.trades.map(t => {
          const ep = t.entryPrice ?? t.entryPx
          const stopIni = _stopInicial(t)
          const dist = (ep && stopIni && ep > stopIni) ? (ep - stopIni) / ep : null
          return { ...t, symbol: ar.symbol, riesgoAcum: dist != null ? dist * slotCapital : null }
        })).sort((a,b) => a.exitDate.localeCompare(b.exitDate))

    // SP500 B&H benchmark
    let sp500BHCurve = []
    if (sp500Data && sp500Data.length && curves.simpleCurve.length) {
      const startD = curves.startDate
      const filteredDates = curves.simpleCurve.map(p => p.date)
      const sp0 = sp500Data.find(d => d.date >= startD)
      if (sp0) {
        const sp0Close = sp0.close
        sp500BHCurve = filteredDates.map(date => {
          let spBar = null
          for (let i = sp500Data.length - 1; i >= 0; i--) {
            if (sp500Data[i].date <= date) { spBar = sp500Data[i]; break }
          }
          return spBar ? { date, value: cfg.capitalIni * (spBar.close / sp0Close) } : null
        }).filter(Boolean)
      }
    }

    // Cobertura del periodo pedido (ver _coberturaHistorico)
    const cobertura = _coberturaHistorico(assetResults, curves, cfg, _activosExcluidos(symbols, descargas))

    res.status(200).json({
      ...curves,
      // Solo alimenta assetStats aquí arriba; no viaja (JSON.stringify descarta las claves undefined).
      metricasActivo: undefined,
      sp500BHCurve,
      // Solo presente si hay algo que avisar: símbolos cuya serie semanal no se pudo descargar y
      // que por tanto operaron SIN el filtro de activo en semanal (fail-open silencioso de otro modo).
      ...(sinSerieSemanal.length ? { avisosFiltros: { sinSerieSemanal } } : {}),
      // Solo presente si algo no cubre el periodo pedido: activos cortos y/o recorte del modo rango.
      ...(cobertura.avisos ? { avisosHistorico: cobertura.avisos } : {}),
      assetStats: assetStats.map(a => ({ ...a, primeraFecha: cobertura.primera[a.symbol] ?? null })),
      // Tamaño de las series por activo, para vigilar el coste de la respuesta.
      ...(curves.assetCurves ? { assetCurvesInfo: _tamanoAssetCurves(curves.assetCurves) } : {}),
      allTrades: sourceTrades,
      avgOccupancy,
      tInvEstrategia: curves.tInvEstrategia ?? 0,
      avgCapOccupancy: curves.avgCapOccupancy ?? avgOccupancy,
      n,
      slotCapital,
      modoAsig,
      startDate: curves.startDate,
      blockEventsBySymbol: Object.fromEntries(assetResults.map(ar => [ar.symbol, ar.blockEvents])),
      senalStats: curves.senalStats ?? null,
      filterZones: filterZones.length ? filterZones : undefined,
    })
  } catch(err) {
    console.error(err)
    res.status(500).json({ error: err.message || 'Error interno' })
  }
}
