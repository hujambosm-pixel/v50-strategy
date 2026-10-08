// lib/nucleoBacktest.js — el NÚCLEO del backtest de una estrategia sobre un activo, sin la respuesta HTTP.
//
// Lo que hace /api/datos desde que tiene las velas preparadas hasta las métricas: ejecutar run() solo con
// las velas cerradas, normalizar `grafico`, el cierre virtual de la posición abierta, los filtros de
// entrada, las operaciones del periodo, buildTrades y las métricas (ganancias, curvas de equity y
// drawdowns). NO construye chartData ni el resto de la respuesta: eso sigue en la ruta, que lo usa tal
// cual, y lo usará también el optimizador para probar combinaciones de parámetros sin pagar esa parte.
// El orden de los pasos es exactamente el de antes, para que la respuesta no cambie en un solo byte.
//
// Entradas:
//   run        la función run() del code_js YA compilada (compilar es cosa de quien llama: su error se
//              distingue del de ejecutar).
//   velas      { conCalentamiento, periodo, iDesde } tal como salen de recortaConCalentamiento, con
//              sp500Close y filtroActivo ya inyectados en cada vela.
//   params     los parámetros de la estrategia (objeto), que run() recibe encima de capital, años y asignación.
//   cond       { capital_ini, years, allocation_pct, comisiones (normalizadas), desde, hasta, sp500Data,
//                filtros: null | { mapa, fechas, esNoStrategy, motivos: () => motivosDeBloqueo(...) },
//                grafico: true para normalizar y devolver `grafico` (la ruta); false lo omite (optimizador) }
// Devuelve { resultado (lo que devolvió run()), dataCerradas, grafico, trades, heredadas, nAjustados,
//            metricas: { gananciaSimple, capitalReinv, ganBH, curves, maxDDStrategyFloat } }.
// Un error al EJECUTAR run() sale marcado con _tipoFallo = 'codigo_estrategia', como siempre.

import { ajustaPreciosAVela, cuentaAjustados } from './precioEnVela'
import { ddPctDeOperacion, indicePorFecha } from './ddOperacion'
import { filtraPorEntrada } from './filtroEntrada'
import { operacionesPorFiltro } from './operacionesPorFiltro'
import { soloCerradas } from './sesion'
import { posicionesHeredadas } from './periodo'
import { comisionDe, sinComisiones } from './comisiones'
import { normalizaGrafico, marcaBloqueadas } from './graficoEstrategia'

export function calcEquityCurves(trades, data, capitalIni, startDate, sp500Data) {
  const filtered = data.filter(d=>new Date(d.date)>=new Date(startDate))
  if (!filtered.length) return {
    strategyCurve:[],bhCurve:[],sp500BHCurve:[],compoundCurve:[],
    maxDDStrategy:0,maxDDBH:0,maxDDSP500:0,maxDDCompound:0,
    maxDDStrategyDate:null,maxDDBHDate:null,maxDDSP500Date:null,maxDDCompoundDate:null
  }
  const p0   = filtered[0].close
  const step = Math.max(1, Math.floor(filtered.length/300))
  const sampled = filtered.filter((_,i)=>i%step===0||i===filtered.length-1)
  const strategyCurve=[], bhCurve=[], sp500BHCurve=[], compoundCurve=[]
  let lastStrat=capitalIni, lastCompound=capitalIni
  let sp0Close=null
  if (sp500Data) { const sp0=sp500Data.find(d=>d.date>=filtered[0].date); if(sp0) sp0Close=sp0.close }
  sampled.forEach(d=>{
    const exits=trades.filter(t=>t.exitDate<=d.date)
    if (exits.length) {
      lastStrat    = capitalIni+exits.reduce((s,t)=>s+t.pnlSimple,0)
      lastCompound = exits[exits.length-1].capitalTras
    }
    strategyCurve.push({date:d.date,value:lastStrat})
    compoundCurve.push({date:d.date,value:lastCompound})
    bhCurve.push({date:d.date,value:capitalIni*(d.close/p0)})
    if (sp500Data&&sp0Close) {
      let spBar=null
      for(let i=sp500Data.length-1;i>=0;i--){if(sp500Data[i].date<=d.date){spBar=sp500Data[i];break}}
      if (spBar) sp500BHCurve.push({date:d.date,value:capitalIni*(spBar.close/sp0Close)})
    }
  })
  const calcDD = (curve) => {
    let peak=curve[0]?.value||capitalIni, maxDD=0, maxDDDate=null
    curve.forEach(p=>{
      if(p.value>peak) peak=p.value
      const dd=(peak-p.value)/peak*100
      if(dd>maxDD){maxDD=dd;maxDDDate=p.date}
    })
    return {maxDD,maxDDDate}
  }
  return {
    strategyCurve,bhCurve,sp500BHCurve,compoundCurve,
    ...Object.fromEntries(['Strategy','BH','SP500','Compound'].map((n,i)=>{
      const curve=[strategyCurve,bhCurve,sp500BHCurve,compoundCurve][i]
      const {maxDD,maxDDDate}=calcDD(curve)
      return [[`maxDD${n}`,maxDD],[`maxDD${n}Date`,maxDDDate]]
    }).flat())
  }
}

// ── MaxDD con flotante: curva que incluye P&L no realizado de posiciones abiertas ──
// Equivalente al "toggle flotante" del gráfico de equity en el backtesting individual.
export function calcMaxDDFloat(trades, data, capitalIni) {
  if (!trades.length || !data.length) return 0
  // Acumular PnL cerrado de forma incremental para evitar O(n×m)
  const exitMap = {}  // exitDate → cumulative pnlSimple increment
  for (const t of trades) {
    if (t.exitDate) exitMap[t.exitDate] = (exitMap[t.exitDate] || 0) + (t.pnlSimple || 0)
  }
  // Trades abiertos en un momento dado: los que entryDate <= date < exitDate
  // Ordenamos por entryDate para poder hacer un barrido eficiente
  const byEntry = [...trades].sort((a, b) => (a.entryDate || '').localeCompare(b.entryDate || ''))
  let peak = capitalIni, maxDD = 0, cumulClosed = 0
  for (const bar of data) {
    const { date, close } = bar
    if (exitMap[date]) cumulClosed += exitMap[date]
    let openPnl = 0
    for (const t of byEntry) {
      if (!t.entryDate || t.entryDate > date) break   // ordenados: podemos parar
      if (t.exitDate && t.exitDate <= date) continue  // ya cerrado
      if (close && t.entryPrice && t.shares) openPnl += (close - t.entryPrice) * t.shares
    }
    const val = capitalIni + cumulClosed + openPnl
    if (val > peak) peak = val
    const dd = peak > 0 ? (peak - val) / peak * 100 : 0
    if (dd > maxDD) maxDD = dd
  }
  return maxDD
}

// ── Build full trade objects from raw { entryDate, exitDate, entryPrice, exitPrice } ──
// REALISMO DEL PRECIO. `barras` llega para poder comprobar que el precio declarado por la
// estrategia existió en su vela. Si no, la operación se ejecuta en la apertura: el hueco de
// apertura disparó la orden al abrir. Ver lib/precioEnVela.js. Sin `barras` no se toca nada,
// así que una llamada antigua se comporta igual que siempre.
export function buildTrades(rawTrades, capitalIni, allocationPct = 100, barras = null, comisiones = null) {
  const fixedAlloc = capitalIni * (allocationPct / 100)
  let compoundCapital = capitalIni
  const conCom = !sinComisiones(comisiones)
  // Indice fecha -> vela UNA vez para toda la serie: con un find por operacion esto seria
  // cuadratico, y hay estrategias con cientos de operaciones sobre miles de velas.
  const idxBarras = barras ? indicePorFecha(barras) : null
  return (barras ? ajustaPreciosAVela(rawTrades, barras) : rawTrades)
    .filter(t => t.entryDate && t.exitDate && t.entryPrice > 0 && t.exitPrice > 0)
    .map(t => {
      // COMISIONES. La de COMPRA se paga ANTES de comprar, asi que reduce el capital que entra en el
      // mercado y con el las acciones; la de VENTA sale del importe que se recupera. Es la regla de
      // Sergi: capital invertido = asignado − comision de compra, capital final = invertido ×
      // (1 + pnlPct/100) − comision de venta. Restarla del RESULTADO en vez del capital invertido
      // daria `comision × pnlPct` de mas, y la comprobacion a mano de tres operaciones lo cazo.
      //
      // La cuenta sigue partiendo de los PRECIOS y las acciones, no de netoDeOperacion: esa funcion
      // parte de pnlPct, y rehacerla desde el porcentaje cambiaria el orden de las operaciones en
      // coma flotante y moveria los resultados de hoy en los ultimos digitos. Con comision cero cada
      // resta es de 0 exacto, asi que esta funcion devuelve lo mismo que siempre, bit a bit.
      const pnlPct         = (t.exitPrice / t.entryPrice - 1) * 100
      const comCompraS     = conCom ? comisionDe({ importeCompra: fixedAlloc }, comisiones).compra : 0
      const invSimple      = fixedAlloc - comCompraS
      const sharesSimple   = invSimple / t.entryPrice
      const brutoSimple    = (t.exitPrice - t.entryPrice) * sharesSimple
      const comVentaS      = conCom ? comisionDe({ importeVenta: invSimple + brutoSimple }, comisiones).venta : 0
      const comSimple      = comCompraS + comVentaS
      const pnlSimple      = brutoSimple - comCompraS - comVentaS

      const compAlloc      = compoundCapital * (allocationPct / 100)
      const comCompraC     = conCom ? comisionDe({ importeCompra: compAlloc }, comisiones).compra : 0
      const invCompound    = compAlloc - comCompraC
      const sharesCompound = invCompound / t.entryPrice
      const brutoCompound  = (t.exitPrice - t.entryPrice) * sharesCompound
      const comVentaC      = conCom ? comisionDe({ importeVenta: invCompound + brutoCompound }, comisiones).venta : 0
      const comComp        = comCompraC + comVentaC
      compoundCapital     += brutoCompound - comCompraC - comVentaC

      const dias = Math.max(1, Math.round((new Date(t.exitDate) - new Date(t.entryDate)) / 86400000))

      // DRAWDOWN DE LA OPERACION. Se calcula aqui, en el servidor, y no en cada grafico: por aqui
      // pasan TODAS las operaciones de todas las rutas, y el Gantt no tiene velas con las que
      // calcularlo. Las velas del panel del activo son ademas una descarga distinta de la que vio
      // el motor, asi que calcularlo alli podria dar dos drawdowns para la misma operacion.
      return { ...t, shares: sharesSimple, pnlSimple, pnlPct, capitalTras: compoundCapital, dias,
        entryPx: t.entryPrice, exitPx: t.exitPrice, tipo: t.exitReason ?? null,
        // Los campos de la comision SOLO viajan cuando hay comision: con comision cero la respuesta
        // tiene que ser identica byte a byte a la de antes de este cambio. Quien los lee lo hace con
        // `campo ?? la expresion de siempre`, asi que el camino viejo sigue siendo el camino por
        // defecto. `_capitalAtEntry` es el capital compuesto asignado a la operacion: con comision,
        // `capitalTras / (1 + pnlPct/100)` ya no lo recupera.
        ...(conCom ? { pnlNeto: pnlSimple,
                       pnlPctNeto: fixedAlloc > 0 ? pnlSimple / fixedAlloc * 100 : pnlPct,
                       comision: comSimple, comisionCompuesta: comComp,
                       _capitalAtEntry: compAlloc } : {}),
        ddOperacion: barras ? ddPctDeOperacion(t, barras, idxBarras) : null }
    })
}

// Claves de `indicators` que viajan dentro de cada vela de chartData (ver «Inject indicators»), alias
// incluidos. Si la estrategia declara una de estas en `grafico.series`, sus valores no se copian otra
// vez: el gráfico los lee de las velas.
const CLAVES_EN_VELAS = new Set(['emaR', 'emaFast', 'emaL', 'emaSlow', 'ema3', 'macdLine', 'signalLine', 'histogram',
  'rsi', 'rsiLine', 'rsiMA', 'bbUpper', 'bbMid', 'bbLower', 'volume', 'volumeAvg'])

export function nucleoBacktest(run, velas, params, cond) {
  const { conCalentamiento: dataConCal, periodo: data, iDesde } = velas
  const { capital_ini, years, allocation_pct, comisiones, desde, hasta, sp500Data, filtros = null } = cond
  const userParams = params || {}
  // LAS ESTRATEGIAS SOLO VEN VELAS CERRADAS. La vela en curso se queda fuera de run(): su cierre
  // todavía va a cambiar, así que cualquier decisión tomada con ella es provisional. `data` sigue
  // completo para el gráfico y las curvas, que sí deben pintarla. Ver lib/sesion.js.
  const dataCerradas = soloCerradas(dataConCal)
  let _result
  try {
    _result = run(dataCerradas, { capital_ini, years, allocation_pct, ...userParams })
  } catch (e) { e._tipoFallo = 'codigo_estrategia'; throw e }
  let rawTrades        = _result.trades       ?? []
  // Lo que la estrategia quiere que se VEA (sus series, sus eventos y sus órdenes). Opcional: sin él,
  // normalizaGrafico devuelve null y la respuesta no cambia en nada. Se normaliza con los indicadores
  // CRUDOS, porque la longitud que hay que comprobar es la de las velas que vio run(), no la del
  // periodo. Las claves que ya viajan dentro de cada vela no se copian. Ver lib/graficoEstrategia.js.
  const grafico = cond.grafico ? normalizaGrafico(_result.grafico, {
    fechasVistas: dataCerradas.map(d => d.date), iDesde, n: data.length, desde, hasta,
    fechaEnCurso: dataConCal.length > dataCerradas.length ? dataConCal[dataConCal.length - 1].date : null,
    indicators: _result.indicators, conocidas: CLAVES_EN_VELAS,
  }) : null

  // ── Flush virtual: posición abierta al final del periodo ──
  // La ultima vela CERRADA que no pasa de la fecha de fin, no la ultima que llego: el cierre por
  // fin de periodo tampoco puede usar una vela a medias. Es la misma regla que runCodeJsAsset,
  // que ya la aplicaba; aqui se seguia cogiendo la ultima vela de `data`.
  const lastBar = dataCerradas[dataCerradas.length - 1]
  const openPos = _result.openPosition ?? null
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

  // ── Aplicar filtros de mercado ──
  if (filtros) {
    // SOLO «0 No Strategy» recibe operaciones fabricadas a partir de los filtros, y se decide
    // por el NOMBRE de la fila, no por la bandera del cliente: esta ruta nunca la ha recibido.
    // Antes la condición era `rawTrades.length === 0 && !openPos`, sin mirar de qué estrategia
    // se trataba, así que CUALQUIERA que no generara señales en el periodo recibía operaciones
    // inventadas por el filtro y firmadas con su nombre. «28 Rebote RS» se llevaba 53 en ^GSPC
    // y 43 en AAPL, y acababan en ranking_results como si fueran su rendimiento.
    if (filtros.esNoStrategy) {
      if (rawTrades.length === 0 && !openPos) {
        rawTrades.push(...operacionesPorFiltro(dataCerradas, (f) => filtros.mapa[f] !== false, { desde }))
      }
    } else {
      // Estrategia normal: descartar trades cuya entrada fue bloqueada por el filtro.
      // El estado que decide es el del CIERRE ANTERIOR al inicio de la vela de entrada, no el
      // de esa vela: cuando la orden se llena —en la apertura o al tocar un nivel— el cierre
      // de ese dia todavia no existe. Ver lib/filtroEntrada.js.
      rawTrades = filtraPorEntrada(rawTrades, filtros.mapa, filtros.fechas,
        { entradaAlCierre: userParams.entradaAlCierre === true })
      // Las órdenes de `grafico` cuya entrada acaba de descartar el filtro, marcadas como bloqueadas y
      // con el filtro que lo hizo. Solo si la estrategia devuelve `grafico`. Ver lib/graficoEstrategia.js.
      if (grafico) marcaBloqueadas(grafico, { filtroActivoMap: filtros.mapa, assetDates: filtros.fechas,
        entradaAlCierre: userParams.entradaAlCierre === true, motivos: filtros.motivos() })
    }
  }

  // ── Enrich trades ──
  // SOLO cuentan las operaciones cuya ENTRADA está dentro del periodo. La estrategia ha visto el
  // calentamiento y puede haber abierto antes: esas no son del periodo. Se descartan ANTES de
  // buildTrades para que el capital compuesto arranque en la primera operación del periodo, que
  // es lo que significa «el capital inicial empieza en la fecha de inicio».
  const heredadas = posicionesHeredadas(rawTrades, desde)
  rawTrades = rawTrades.filter(t => t.entryDate >= desde)
  const trades = buildTrades(rawTrades, capital_ini, allocation_pct, dataCerradas, comisiones)
  const nAjustados = cuentaAjustados(trades)

  // ── Summary metrics ──
  const gananciaSimple = trades.reduce((s, t) => s + t.pnlSimple, 0)
  const capitalReinv   = trades.length ? trades[trades.length - 1].capitalTras : capital_ini
  const p0 = data[0].close, pN = data[data.length - 1].close
  const ganBH = capital_ini * (pN / p0 - 1)
  // ── Equity curves ──
  const curves = calcEquityCurves(trades, data, capital_ini, data[0].date, sp500Data)
  // ── MaxDD con flotante (P&L no realizado incluido) ── igual que toggle "Flotante" del gráfico
  const maxDDStrategyFloat = calcMaxDDFloat(trades, data, capital_ini)

  return { resultado: _result, dataCerradas, grafico, trades, heredadas, nAjustados,
    metricas: { gananciaSimple, capitalReinv, ganBH, curves, maxDDStrategyFloat } }
}
