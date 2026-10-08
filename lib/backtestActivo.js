// lib/backtestActivo.js — un backtest COMPLETO de una estrategia sobre un activo, tal como lo hace /api/datos:
// periodo y calentamiento, las descargas (el activo, ^GSPC y las series que pidan los filtros), el mapa de
// filtros, la inyección de sp500Close y filtroActivo en las velas, la compilación del code_js y el núcleo
// (lib/nucleoBacktest.js). Movido TAL CUAL desde pages/api/datos.js para que lo compartan /api/datos y
// /api/ranking-activo (el ranking: una petición por activo con todas sus estrategias) sin duplicar nada.
//
// p: { simbolo, codeJs, stratParams (texto, como en la columna), stratName, capital_ini, years,
//      allocation_pct, filtros, intervalo, fromDate, toDate, comisiones (ya normalizadas) }
// deps.fetchAV(símbolo, años, intervalo): la descarga de pages/api/datos.js (u otra con el mismo contrato).
//   Las velas que devuelve se MODIFICAN (se les inyecta sp500Close, filtroActivo…): quien la reutilice entre
//   backtests tiene que dar copias.
// deps.grafico: true normaliza y devuelve `grafico` (/api/datos); false lo omite (ranking, optimizador).
// Los errores salen como en la ruta: el del code_js (al compilar o al ejecutar run()) marcado con
// _tipoFallo = 'codigo_estrategia'; cualquier otro, tal cual.

import { calcEMA, calcSMA, calcRSI, calcATR, calcMACD } from './backtester'
import { esNoStrategyPorNombre } from './operacionesPorFiltro'
import { normalizaFiltrosEntrada, hayFiltrosActivos, clavesAuxiliares, construirFiltroActivoMap, filtrosActivos,
         requiereSemanalDelActivo, proyectarSemanal, fuerzaFiltrosSemanales, motivosDeBloqueo } from './filtros'
import { normalizaPeriodo, velasCalentamiento, recortaConCalentamiento } from './periodo'
import { nucleoBacktest } from './nucleoBacktest'

// ── Align external close series to asset dates with forward-fill ──
function buildAlignedCloses(externalData, assetDates) {
  if (!externalData?.length) return assetDates.map(() => null)
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

// ── Compute EMA on native weekly series then forward-fill both closes+EMA to daily dates ──
// Use this when a filter has intervalo:'semanal' — EMA is computed on the weekly series
// so periods like 200 refer to 200 weeks, not 200 daily bars.
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

export async function backtestActivo(p, { fetchAV, grafico = true }) {
  const { simbolo, codeJs, stratParams, stratName, capital_ini, years, allocation_pct, filtros, intervalo,
          fromDate, toDate, comisiones: _com } = p
  // ── Periodo y calentamiento ──────────────────────────────────────────────────────────
  // «Últimos N años» es un caso particular de desde/hasta, así que a partir de aquí hay UN
  // solo camino. El calentamiento se calcula con los periodos de la estrategia Y de sus
  // filtros, así que la lista de filtros se normaliza ANTES de descargar. Ver lib/periodo.js.
  const assetInterval = intervalo === 'semanal' ? 'w' : 'd'
  const esSemanal = assetInterval === 'w'
  // El filtro es la ventana operativa: en semanal no puede ser diario. Ver fuerzaFiltrosSemanales
  // en lib/filtros.js. No se rechaza la peticion: se corrige y se deja dicho en el log.
  const _ff = fuerzaFiltrosSemanales(normalizaFiltrosEntrada(filtros), esSemanal)
  const filtrosLista = _ff.lista
  if (_ff.forzados.length) console.log(`[filtros] ${simbolo}: estrategia semanal, filtros forzados a semanal: ${_ff.forzados.join(', ')}`)

  const { desde, hasta, modo } = normalizaPeriodo({ years, fromDate, toDate })
  const nCal = velasCalentamiento(stratParams, filtrosLista, esSemanal ? 'semanal' : 'diario')
  // Años que hay que pedir: los que van de hoy a la fecha de inicio, más el calentamiento
  // traducido a años, más uno de margen por festivos y por activos que empiezan tarde.
  const porAnio = esSemanal ? 52 : 252
  const aniosHastaDesde = Math.max(0, (Date.now() - Date.parse(desde)) / (365.25 * 86400000))
  const aniosPedir = Math.ceil(aniosHastaDesde + nCal / porAnio) + 1
  const allData = await fetchAV(simbolo, aniosPedir, assetInterval)
  const _corte = recortaConCalentamiento(allData, desde, hasta, nCal)
  if (!_corte.periodo.length) throw new Error('Sin datos para ' + simbolo + ' entre ' + desde + ' y ' + hasta)
  // `data` es el PERIODO: gráfico, curvas, métricas y mapa de filtros. `dataConCal` lleva
  // además el calentamiento y es lo único que ve la estrategia.
  const data = _corte.periodo
  const dataConCal = _corte.conCalentamiento
  console.log(`[periodo] ${simbolo} (${assetInterval}): ${modo} ${desde}→${hasta} · ${data.length} velas · calentamiento ${_corte.calentamientoReal}/${nCal} · ${aniosPedir}y pedidos`)
  const anyFiltroOn = hayFiltrosActivos(filtrosLista)
  let sp500Data = null
  const sp500Map = {}
  const auxDataMap = {} // ticker -> data (para todos los filtros no-GSPC, dedupado)
  // Fase 2C: SP500 en el timeframe del activo (assetInterval), SOLO para el sp500Close visual del RS
  // de cabecera. NO sustituye a sp500Data (diaria), que sigue alimentando filtros de mercado y B&H,
  // ni a d.sp500Close (que consumen las estrategias con filtro SP500). En diario se reutiliza sp500Data.
  let sp500DataTf = null
  // Serie SEMANAL del propio activo, para los filtros de ámbito activo que la pidan estando el
  // backtest en diario. Si el backtest ya corre en semanal, `data` YA son esas velas y no se pide
  // nada. Si la descarga falla queda a null → el filtro no participa (fail-open) y el símbolo se
  // anota en avisosFiltros para que el usuario sepa que se quedó sin filtrar.
  let activoSemanal = null
  const sinSerieSemanal = []
  const pideSemanalActivo = requiereSemanalDelActivo(filtrosLista) && assetInterval !== 'w'

  // TODAS las series auxiliares se recortan desde el inicio del CALENTAMIENTO, no del periodo:
  // las EMAs de los filtros de mercado se calculan sobre la serie alineada a `assetDates`, que
  // ahora incluye el calentamiento. Si la serie del índice empezara en la primera vela del
  // periodo, su EMA arrancaría en frío y el filtro decidiría con un valor que no es el suyo.
  const _desdeCal = dataConCal[0].date
  const fetchJobs = [
    fetchAV('^GSPC', aniosPedir)
      .then(r => { sp500Data = r.filter(d => d.date >= _desdeCal && d.date <= hasta); sp500Data.forEach(d => { sp500Map[d.date] = d.close }) })
      .catch(() => {}),
  ]
  // Segunda descarga SOLO en semanal (en diario, sp500DataTf = sp500Data → sin doble descarga)
  if (esSemanal) {
    fetchJobs.push(
      fetchAV('^GSPC', aniosPedir, 'w')
        .then(r => { sp500DataTf = r.filter(d => d.date >= _desdeCal && d.date <= hasta) })
        .catch(() => {})
    )
  }
  if (anyFiltroOn) {
    // Series externas únicas que piden los filtros de ámbito mercado (los de ámbito activo se
    // evalúan sobre `data`, ya descargada, así que no añaden ninguna petición).
    const auxKeys = clavesAuxiliares(filtrosLista, 'w', 'd')
    for (const akey of auxKeys) {
      const colonIdx = akey.lastIndexOf(':')
      const ticker = akey.slice(0, colonIdx), iv = akey.slice(colonIdx + 1)
      fetchJobs.push(fetchAV(ticker, aniosPedir, iv).then(r => { auxDataMap[akey] = r.filter(d => d.date >= _desdeCal && d.date <= hasta) }).catch(() => {}))
    }
  }
  // Una descarga más, en paralelo con las que ya hay: no alarga el camino crítico.
  if (pideSemanalActivo) {
    fetchJobs.push(
      fetchAV(simbolo, aniosPedir, 'w')
        // Desde el inicio del CALENTAMIENTO, no del periodo: el filtro también necesita que su
        // propia EMA esté convergida en la primera vela del periodo.
        .then(r => { activoSemanal = r.filter(d => d.date >= dataConCal[0].date && d.date <= hasta) })
        .catch(() => { sinSerieSemanal.push(simbolo) })
    )
  }
  await Promise.all(fetchJobs)
  if (pideSemanalActivo && !activoSemanal?.length && !sinSerieSemanal.includes(simbolo)) sinSerieSemanal.push(simbolo)

  // ── Compute filtroActivo per date ──
  // Con el calentamiento incluido: la EMA del filtro también tiene que llegar convergida al
  // primer día del periodo, y además así la regla de «el cierre anterior» tiene un cierre
  // anterior de verdad el primer día, en vez de caer en el fail-open de la primera vela.
  const assetDates = dataConCal.map(d => d.date)
  const filtroActivoMap = {} // date -> boolean (true = entrada permitida)
  // Las opciones con las que se construye el mapa, guardadas para poder explicar después qué filtro
  // bloqueaba cada entrada de `grafico` (motivosDeBloqueo), con las mismas series.
  let _optsFiltro = null
  let filterZonesFromFiltros = []

  if (anyFiltroOn) {
    // Resuelve el dataset para un ticker+interval (^GSPC diario → sp500Data, resto → auxDataMap)
    const resolveData = (ticker, iv) =>
      (ticker === '^GSPC' && iv !== 'w') ? sp500Data : (auxDataMap[`${ticker}:${iv}`] ?? sp500Data)

    // Proyecta una serie sobre las fechas del activo y calcula su EMA. Semanal y diario se
    // resuelven igual que antes; buildAlignedWeekly evita el look-ahead de las velas semanales.
    const alineado = (src, semanal, periodo) => semanal
      ? buildAlignedWeekly(src, assetDates, periodo)
      : (() => { const closes = buildAlignedCloses(src, assetDates); return { closes, ema: calcEMA(closes, periodo) } })()

    _optsFiltro = {
      // `dataConCal`, no `data`: un filtro de ambito activo en diario se evalua sobre ESTA serie,
      // y alineada sobre `assetDates` (calentamiento incluido) una serie que empiece en la primera
      // vela del periodo deja la EMA del filtro en null justo donde tenia que estar convergida.
      assetBars: dataConCal, assetDates, alineado,
      assetSymbol: simbolo,
      assetInterval: assetInterval === 'w' ? 'semanal' : 'diario',
      resolveMercado: (ticker, semanal) => resolveData(ticker, semanal ? 'w' : 'd'),
      resolveSemanalActivo: () => activoSemanal,
    }
    Object.assign(filtroActivoMap, construirFiltroActivoMap(filtrosLista, _optsFiltro))

    // Serie de visualización del índice: la del primer filtro de mercado que la use.
    const fIndice = filtrosActivos(filtrosLista).find(f => f.tipo === 'indiceEma' && f.ambito === 'mercado')
    const indiceMap = {}
    if (fIndice) {
      const src = resolveData(fIndice.params?.ticker, fIndice.params?.intervalo === 'semanal' ? 'w' : 'd')
      if (src) src.forEach(d => { indiceMap[d.date] = d.close })
    }
    // Sobre dataConCal: `data` es un slice suyo y comparte los mismos objetos, asi que el periodo
    // queda igual y las velas de calentamiento tambien reciben el dato.
    for (const d of dataConCal) d.indiceClose = indiceMap[d.date] ?? null

    // Build filterZones (franjas donde filtroActivo = false)
    let zoneStart = null
    for (const bar of data) {
      const blocked = !filtroActivoMap[bar.date]
      if (blocked && zoneStart === null)        zoneStart = bar.date
      else if (!blocked && zoneStart !== null) { filterZonesFromFiltros.push({ from: zoneStart, to: bar.date }); zoneStart = null }
    }
    if (zoneStart !== null) filterZonesFromFiltros.push({ from: zoneStart, to: data[data.length - 1].date })
  }

  // ── Inyectar sp500Close + filtroActivo en cada barra ──
  // sp500Close: serie diaria con match exacto — SIN CAMBIOS (la consumen las estrategias con filtro SP500).
  // sp500CloseTf: SP500 en el timeframe del activo con forward-fill, SOLO para el RS visual de la cabecera.
  //   En diario: idéntico a sp500Close (mismo valor exacto). En semanal: forward-fill de la serie semanal.
  // sp500CloseTf se alinea sobre las fechas del PERIODO porque solo lo lee la cabecera del
  // grafico, que vive en el periodo. Alinearlo sobre assetDates —calentamiento incluido— y
  // leerlo con el indice de `data` lo desplazaba `iDesde` velas.
  const sp500CloseTfAligned = assetInterval === 'w' ? buildAlignedCloses(sp500DataTf, data.map(d => d.date)) : null
  // La inyeccion recorre la serie CON calentamiento: `data` es un slice de `dataConCal` y comparte
  // los mismos objetos, asi que el periodo queda inyectado igual y ademas las velas de
  // calentamiento llegan a run() con su sp500Close y su filtroActivo. Sin esto, una estrategia que
  // mira sp500Close veia `undefined` justo en las velas con las que calienta sus indicadores.
  dataConCal.forEach(d => {
    d.sp500Close    = sp500Map[d.date] ?? null
    d.filtroActivo  = anyFiltroOn ? (filtroActivoMap[d.date] ?? true) : true
  })
  data.forEach((d, i) => { d.sp500CloseTf = assetInterval === 'w' ? (sp500CloseTfAligned[i] ?? null) : d.sp500Close })

  // ── Execute strategy in sandbox ──
  // COMPILAR y EJECUTAR el code_js van en su propio try, y no por capricho: hasta ahora un fallo
  // aquí caía en el MISMO catch que una descarga que no llega o un cálculo que revienta, salía
  // como 500 y el cliente lo apuntaba como «fallo de descarga». Así se perdieron cuatro días
  // buscando un problema de red que era una valla de Markdown en el código de una estrategia.
  //
  // El orden se conserva exactamente —compilar, leer los params, ejecutar— para no cambiar qué
  // error gana cuando hay varios. Y JSON.parse de los params se queda FUERA: unos params rotos
  // no son un error de código y siguen saliendo como 500, igual que antes.
  const wrappedCode = `"use strict";\n${codeJs}\nreturn run;`
  let runFn
  try {
    const getRunFn = new Function('calcEMA','calcSMA','calcRSI','calcATR','calcMACD', wrappedCode)
    runFn = getRunFn(calcEMA, calcSMA, calcRSI, calcATR, calcMACD)
  } catch (e) { e._tipoFallo = 'codigo_estrategia'; throw e }
  const userParams = stratParams ? JSON.parse(stratParams) : {}
  // Desde aquí hasta las métricas, el NÚCLEO: run() solo con las velas cerradas, grafico, cierre
  // virtual, filtros de entrada, operaciones del periodo y métricas. Ver lib/nucleoBacktest.js.
  const _nucleo = nucleoBacktest(runFn, _corte, userParams, {
    capital_ini, years, allocation_pct, comisiones: _com, desde, hasta, sp500Data, grafico,
    filtros: anyFiltroOn ? { mapa: filtroActivoMap, fechas: assetDates, esNoStrategy: esNoStrategyPorNombre(stratName),
      motivos: () => motivosDeBloqueo(filtrosLista, _optsFiltro) } : null,
  })

  return { desde, hasta, modo, nCal, data, _corte, anyFiltroOn, filterZonesFromFiltros, sinSerieSemanal, _nucleo }
}
