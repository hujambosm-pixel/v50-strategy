// lib/asignaCartera.js — el NÚCLEO DE ASIGNACIÓN de la multicartera (modos Concentrado y Compartido), fuera de
// pages/api/multibacktest.js para poder reutilizarlo en las simulaciones contra el azar. Puro: sin red ni fechas.
//
// asignaCartera(candidatos, opciones) recibe los candidatos de todos los activos —las operaciones de cada activo,
// generadas por su estrategia de forma independiente, con { symbol, entryDate, exitDate, pnlPct, entryPx, stopPx, … }
// y, en Concentrado, su puntuación _ps (y _psValid, _rsRaw, _momRaw, _proxRaw para la puerta)— y decide día a día
// cuáles se ejecutan y con cuánto capital:
//   1. Orden: por entryDate; a igual fecha, Concentrado por _ps (menor = antes) y después por símbolo (alfabético si
//      prioridad = 'alfabetico'); Compartido por símbolo (o por symbolOrder). La opción `ps` sustituye a _ps.
//      ORDENA EL ARRAY EN SITIO: quien llama sigue usando ese mismo array (curvas, ocupación), como antes.
//   2. Cada fecha de entrada o salida: primero se cierra lo que sale (el neto vuelve al pool) y luego se abren las
//      entradas del día de los activos sin posición abierta.
//      Concentrado: máximo de posiciones (con sameDayOpen para las que abren y cierran el mismo día), puerta en
//      modo «Filtro» (fuerza relativa, momentum o máximo de 52 semanas; si la métrica no es válida, deja pasar) y
//      capital = mín(pool libre, patrimonio / mín(maxPosiciones, n)).
//      Compartido: capital = mín(patrimonio / n, pool libre), sin máximo de posiciones.
//   3. Al final del periodo, las que siguen abiertas se cierran con netoDeOperacion (su comisión) y se anotan como
//      ejecutadas, en los DOS modos (V9.990; antes Compartido solo devolvía su capital al pool, sin comisión y sin
//      anotarlas, así que su resultado no llegaba a la curva compuesta ni a las estadísticas).
//   Slots (solo para las simulaciones; el servidor no pasa por aquí): cada activo con su capital fijo (capitalIni / n),
//      que compone dentro de su slot con netoDeOperacion; se ejecutan todas sus operaciones, sin reordenar.
// La PUERTA (bloqueaPuerta) usa el valor real de la métrica (_psValid, _rsRaw…), nunca `ps`: el orden y la puerta van
// por separado (la prueba B cambia el orden y deja la puerta como está).
// Devuelve { candidatos (el mismo array, ordenado), ejecutadas, capitalAtEntryMap, poolLibre, contadores }.
// Las cuentas son LITERALMENTE las que había en buildConcentradoCurves y buildCompartidoCurves (mismo orden de las
// operaciones en coma flotante): la respuesta del multibacktest no cambia ni un byte.
import { netoDeOperacion, sinComisiones, COMISIONES_CERO } from './comisiones'

const porSimbolo = (a, b) => a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0

export function comparadorCandidatos({ modo = 'concentrado', prioridad = 'alfabetico', symbolOrder = null, ps = null } = {}) {
  if (modo === 'compartido' && !ps) return (a, b) => {
    if (a.entryDate < b.entryDate) return -1
    if (a.entryDate > b.entryDate) return 1
    if (symbolOrder) return symbolOrder.indexOf(a.symbol) - symbolOrder.indexOf(b.symbol)
    return a.symbol < b.symbol ? -1 : 1
  }
  const puntua = ps || ((c) => c._ps)
  return (a, b) => {
    if (a.entryDate < b.entryDate) return -1
    if (a.entryDate > b.entryDate) return 1
    if (!ps && prioridad === 'alfabetico') return porSimbolo(a, b)
    // Desempate final alfabético por símbolo cuando la puntuación empata (p. ej. mismo ticker en dos estrategias
    // → RS idéntico) → orden determinista y reproducible.
    return ((puntua(a) ?? 0) - (puntua(b) ?? 0)) || porSimbolo(a, b)
  }
}

// ¿La puerta del modo «Filtro» deja fuera este candidato? Con el valor CRUDO de la métrica activa y su validez; si no es
// válida, deja pasar. _momRaw/_rsRaw son FRACCIONES (0.10 = 10 %) y los umbrales llegan en %; _proxRaw es cierre / máximo.
export function bloqueaPuerta(t, { prioridad = 'alfabetico', criterioUso = 'desempate', rsGateThr = 0, momGateThr = 10, proxGateThr = 10 } = {}) {
  if (!(criterioUso === 'filtro' && (prioridad === 'fuerza_relativa' || prioridad === 'momentum' || prioridad === 'max52') && t._psValid === true)) return false
  if (prioridad === 'fuerza_relativa') return t._rsRaw <= rsGateThr / 100
  if (prioridad === 'momentum') return t._momRaw <= momGateThr / 100
  return t._proxRaw < (1 - proxGateThr / 100)
}

const riesgoDe = (t, cap) => {
  const dist = (t.stopPx && t.entryPx && t.entryPx > t.stopPx) ? (t.entryPx - t.stopPx) / t.entryPx : null
  return dist ? cap * dist : cap * 0.05
}

export function asignaCartera(candidatos, opciones = {}) {
  const { modo = 'concentrado', capitalIni, n, maxPosiciones = 5, prioridad = 'alfabetico', criterioUso = 'desempate',
    rsGateThr = 0, momGateThr = 10, proxGateThr = 10, comisiones = COMISIONES_CERO, symbolOrder = null, ps = null } = opciones
  const allCandidates = candidatos
  if (modo === 'slots') return asignaSlots(allCandidates, { capitalIni, n, comisiones })
  allCandidates.sort(comparadorCandidatos({ modo, prioridad, symbolOrder, ps }))
  return modo === 'compartido'
    ? asignaCompartido(allCandidates, { capitalIni, n, comisiones })
    : asignaConcentrado(allCandidates, { capitalIni, n, maxPosiciones, prioridad, criterioUso, rsGateThr, momGateThr, proxGateThr, comisiones })
}

function asignaConcentrado(allCandidates, { capitalIni, n, maxPosiciones, prioridad, criterioUso, rsGateThr, momGateThr, proxGateThr, comisiones }) {
  const conCom = !sinComisiones(comisiones)
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
      const _netoK = netoDeOperacion(capAsignado, trade.pnlPct, comisiones)
      const capFinal = _netoK.capitalFinal
      poolLibre += capFinal
      executedTrades.push({
        ...trade,
        _capitalAtEntry: capAsignado,
        _totalPortfolioAtEntry: _tpAtEntry || capitalIni,
        capitalTras: capFinal,
        pnlSimple: capFinal - capAsignado,
        // La comision REALMENTE pagada: solo viaja cuando hay comision (con comision cero, respuesta idéntica).
        ...(conCom ? { comision: _netoK.comisionTotal, pnlNeto: _netoK.pnlNeto,
                       pnlPctNeto: _netoK.pnlPctNeto } : {}),
        riesgoAcum: riesgoDe(trade, capAsignado),
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
      // Las que abren y cierran el mismo día no pasan por openSlots: sameDayOpen las descuenta de los huecos.
      let sameDayOpen = 0
      entries.forEach(t => {
        const posicionesAbiertas = Object.keys(openSlots).length
        const slotsLibresEfectivos = maxPosiciones - posicionesAbiertas - sameDayOpen
        const openCapsTotal = Object.values(openSlots).reduce((s, sl) => s + (sl.capAsignado || 0), 0)
        const capitalTotal = poolLibre + openCapsTotal
        // Techo por posición: dividir entre el mínimo real de slots disponibles
        // (si hay menos activos que maxPosiciones, cada activo recibe mayor fracción)
        const slotsEfectivos = Math.min(maxPosiciones, n)
        const capMaxPorPosicion = capitalTotal / slotsEfectivos
        if (slotsLibresEfectivos <= 0) { cntDescSlots++; if (isFinite(t.pnlPct)) { pnlDescartados.push(t.pnlPct); pnlHipEur += capMaxPorPosicion * t.pnlPct / 100 } return }
        // PUERTA (modo «Filtro»): ver bloqueaPuerta.
        if (bloqueaPuerta(t, { prioridad, criterioUso, rsGateThr, momGateThr, proxGateThr })) {
          cntDescGate++
          if (isFinite(t.pnlPct)) { pnlDescartados.push(t.pnlPct); pnlHipEur += capMaxPorPosicion * t.pnlPct / 100 }
          return
        }
        const capPorEntrada = Math.min(poolLibre, capMaxPorPosicion)
        if (capPorEntrada < 0.01) { cntDescCapital++; if (isFinite(t.pnlPct)) { pnlDescartados.push(t.pnlPct); pnlHipEur += capMaxPorPosicion * t.pnlPct / 100 } return }
        cntEjecutadas++
        poolLibre -= capPorEntrada
        const totalPortfolio = capitalTotal
        if (t.exitDate === date) {
          if (isFinite(t.pnlPct)) {
            const _netoKD = netoDeOperacion(capPorEntrada, t.pnlPct, comisiones)
            const capFinal = _netoKD.capitalFinal
            poolLibre += capFinal
            executedTrades.push({
              ...t,
              _capitalAtEntry: capPorEntrada,
              _totalPortfolioAtEntry: totalPortfolio,
              capitalTras: capFinal,
              pnlSimple: capFinal - capPorEntrada,
              ...(conCom ? { comision: _netoKD.comisionTotal, pnlNeto: _netoKD.pnlNeto,
                             pnlPctNeto: _netoKD.pnlPctNeto } : {}),
              riesgoAcum: riesgoDe(t, capPorEntrada),
            })
          } else { poolLibre += capPorEntrada }
          sameDayOpen++
        } else {
          openSlots[t.symbol] = { trade: t, capAsignado: capPorEntrada, totalPortfolioAtEntry: totalPortfolio }
          capitalAtEntryMap[`${t.symbol}:${t.entryDate}`] = capPorEntrada
        }
      })
    }
  })

  // Las que siguen abiertas al final del periodo (su exitDate cae más allá de la última fecha común): se cierran
  // con su comisión y se anotan como ejecutadas.
  Object.entries(openSlots).forEach(([, slot]) => {
    const { trade, capAsignado, totalPortfolioAtEntry } = slot
    const _netoF = netoDeOperacion(capAsignado, trade.pnlPct || 0, comisiones)
    const capFinal = _netoF.capitalFinal
    poolLibre += capFinal
    executedTrades.push({
      ...trade,
      _capitalAtEntry: capAsignado,
      _totalPortfolioAtEntry: totalPortfolioAtEntry || capitalIni,
      capitalTras: capFinal,
      pnlSimple: capFinal - capAsignado,
      ...(conCom ? { comision: _netoF.comisionTotal, pnlNeto: _netoF.pnlNeto,
                     pnlPctNeto: _netoF.pnlPctNeto } : {}),
      riesgoAcum: riesgoDe(trade, capAsignado),
    })
  })
  Object.keys(openSlots).forEach(sym => { delete openSlots[sym] })

  return { candidatos: allCandidates, ejecutadas: executedTrades, capitalAtEntryMap, poolLibre,
    contadores: { generadas: senalesGeneradas, ejecutadas: cntEjecutadas, descartadasPorSlots: cntDescSlots,
      descartadasPorCapital: cntDescCapital, descartadasPorGate: cntDescGate, pnlHipEur, pnlDescartados } }
}

function asignaCompartido(allCandidates, { capitalIni, n, comisiones }) {
  const conCom = !sinComisiones(comisiones)
  const senalesGeneradasC = allCandidates.length
  let cntEjecutadasC = 0, cntDescCapitalC = 0
  let pnlHipEurC = 0
  const pnlDescartadosC = []

  let poolLibre = capitalIni
  const openSlots = {}          // { symbol: { trade, capAsignado } }
  const executedTrades = []
  const capitalAtEntryMap = {}  // `${symbol}:${entryDate}` → capAsignado

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
    // 1. Cerrar primero (libera capital para nuevas entradas del mismo día)
    const toClose = Object.keys(openSlots).filter(sym => openSlots[sym].trade.exitDate === date)
    toClose.forEach(symbol => {
      const { trade, capAsignado, totalPortfolioAtEntry: _tpAtEntry } = openSlots[symbol]
      if (!isFinite(trade.pnlPct)) { poolLibre += capAsignado; delete openSlots[symbol]; return }  // skip NaN/Infinity
      // El capital que vuelve al pool es el NETO (con comision cero, exactamente capAsignado × (1 + pnlPct/100)).
      const _netoC = netoDeOperacion(capAsignado, trade.pnlPct, comisiones)
      const capFinal = _netoC.capitalFinal
      poolLibre += capFinal
      executedTrades.push({
        ...trade,
        _capitalAtEntry: capAsignado,
        _totalPortfolioAtEntry: _tpAtEntry || capitalIni,
        capitalTras: capFinal,
        pnlSimple: capFinal - capAsignado,
        ...(conCom ? { comision: _netoC.comisionTotal, pnlNeto: _netoC.pnlNeto,
                       pnlPctNeto: _netoC.pnlPctNeto } : {}),
        riesgoAcum: riesgoDe(trade, capAsignado),
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
        if (t.exitDate === date) {
          if (isFinite(t.pnlPct)) {
            const _netoSD = netoDeOperacion(capPorSlot, t.pnlPct, comisiones)
            const capFinal = _netoSD.capitalFinal
            poolLibre += capFinal
            executedTrades.push({
              ...t,
              _capitalAtEntry: capPorSlot,
              _totalPortfolioAtEntry: totalPortfolio,
              capitalTras: capFinal,
              pnlSimple: capFinal - capPorSlot,
              ...(conCom ? { comision: _netoSD.comisionTotal, pnlNeto: _netoSD.pnlNeto,
                             pnlPctNeto: _netoSD.pnlPctNeto } : {}),
              riesgoAcum: riesgoDe(t, capPorSlot),
            })
          } else {
            poolLibre += capPorSlot  // NaN: devolver capital sin P&L
          }
        } else {
          openSlots[t.symbol] = { trade: t, capAsignado: capPorSlot, totalPortfolioAtEntry: totalPortfolio }
          capitalAtEntryMap[`${t.symbol}:${t.entryDate}`] = capPorSlot
        }
      })
    }
  })

  // Posiciones que quedaron abiertas al final: se cierran con su comisión y se anotan como ejecutadas, como en Concentrado
  // (V9.990).
  Object.entries(openSlots).forEach(([sym, slot]) => {
    const { trade, capAsignado, totalPortfolioAtEntry } = slot
    const _netoF = netoDeOperacion(capAsignado, trade.pnlPct || 0, comisiones)
    const capFinal = _netoF.capitalFinal
    poolLibre += capFinal
    executedTrades.push({
      ...trade,
      _capitalAtEntry: capAsignado,
      _totalPortfolioAtEntry: totalPortfolioAtEntry || capitalIni,
      capitalTras: capFinal,
      pnlSimple: capFinal - capAsignado,
      ...(conCom ? { comision: _netoF.comisionTotal, pnlNeto: _netoF.pnlNeto,
                     pnlPctNeto: _netoF.pnlPctNeto } : {}),
      riesgoAcum: riesgoDe(trade, capAsignado),
    })
    delete openSlots[sym]
  })

  return { candidatos: allCandidates, ejecutadas: executedTrades, capitalAtEntryMap, poolLibre,
    contadores: { generadas: senalesGeneradasC, ejecutadas: cntEjecutadasC, descartadasPorSlots: 0,
      descartadasPorCapital: cntDescCapitalC, descartadasPorGate: 0, pnlHipEur: pnlHipEurC, pnlDescartados: pnlDescartadosC } }
}

// Slots: cada activo con capitalIni / n que compone dentro de su slot; todas sus operaciones se ejecutan, en el orden
// recibido (el de los activos y, dentro de cada uno, el de sus operaciones, que es el del servidor).
function asignaSlots(allCandidates, { capitalIni, n, comisiones }) {
  const slot = capitalIni / n, capital = {}, executedTrades = []
  for (const t of allCandidates) {
    const c0 = capital[t.symbol] ?? slot
    const neto = netoDeOperacion(c0, isFinite(t.pnlPct) ? t.pnlPct : 0, comisiones)
    executedTrades.push({ ...t, _capitalAtEntry: c0, capitalTras: neto.capitalFinal, pnlSimple: neto.capitalFinal - c0 })
    capital[t.symbol] = neto.capitalFinal
  }
  return { candidatos: allCandidates, ejecutadas: executedTrades, capitalAtEntryMap: {}, poolLibre: null,
    contadores: { generadas: allCandidates.length, ejecutadas: executedTrades.length, descartadasPorSlots: 0, descartadasPorCapital: 0, descartadasPorGate: 0, pnlHipEur: 0, pnlDescartados: [] } }
}

// ── Métricas ligeras (para las simulaciones; NO sustituyen a las del servidor) ────────────────────────────────────
// A partir de las operaciones ejecutadas y las velas diarias de cada activo ({ date, close } ascendentes, desde el
// inicio): patrimonio compuesto valorado al cierre de cada fecha del eje = capital inicial + resultado de las
// cerradas + flotante de las abiertas ((cierre − entrada) / entrada × capital de entrada). La misma definición que
// _metricasEjeCompleto del servidor (Max DD flotante y Cap. invertido %), sin lo que solo sirve para dibujar.
//   fechas: el eje diario completo (las fechas comunes desde el inicio).
// Devuelve { curva: [{ date, value }], cagr (compuesto, sobre la curva diaria), maxDD (%), capInvPct, tInv }.
export function metricasCartera(ejecutadas, preciosPorSimbolo, fechas, capitalIni) {
  const nF = fechas?.length || 0
  if (!nF) return { curva: [], cagr: null, maxDD: 0, capInvPct: 0, tInv: 0 }
  const FIN = '9999-99-99'
  const pos = (ejecutadas || []).filter(t => t && t.entryDate && Number.isFinite(t._capitalAtEntry) && Number.isFinite(t.pnlSimple))
    .map(t => ({ entryDate: t.entryDate, exitDate: t.exitDate || null, coste: t._capitalAtEntry, realizado: t.pnlSimple,
      entryPx: t.entryPx ?? t.entryPrice ?? null, precios: preciosPorSimbolo[t.symbol] || [], _i: 0 }))
  const cmp = (a, b) => a < b ? -1 : a > b ? 1 : 0
  const porEntrada = [...pos].sort((a, b) => cmp(a.entryDate, b.entryDate))
  const porSalida = [...pos].sort((a, b) => cmp(a.exitDate || FIN, b.exitDate || FIN))
  const precio = (p, date) => {
    const arr = p.precios
    if (!arr.length) return null
    let i = p._i
    while (i + 1 < arr.length && arr[i + 1].date <= date) i++
    p._i = i
    return arr[i].date <= date ? arr[i].close : null
  }
  let iEnt = 0, iSal = 0, realizado = 0, abiertas = [], pico = capitalIni, maxDD = 0, dias = 0, sumaPct = 0
  const curva = new Array(nF)
  fechas.forEach((date, k) => {
    while (iSal < porSalida.length && (porSalida[iSal].exitDate || FIN) <= date) realizado += porSalida[iSal++].realizado
    while (iEnt < porEntrada.length && porEntrada[iEnt].entryDate <= date) abiertas.push(porEntrada[iEnt++])
    let costeDia = 0, noReal = 0
    const vivas = []
    for (const p of abiertas) {
      if ((p.exitDate || FIN) <= date) { if (p.entryDate === date) costeDia += p.coste; continue }
      vivas.push(p)
      const px = precio(p, date)
      noReal += (px != null && p.entryPx > 0) ? ((px - p.entryPx) / p.entryPx) * p.coste : 0
      costeDia += p.coste
    }
    abiertas = vivas
    const v = capitalIni + realizado + noReal
    curva[k] = { date, value: v }
    if (v > pico) pico = v
    if (pico > 0) { const dd = (pico - v) / pico * 100; if (dd > maxDD) maxDD = dd }
    if (costeDia > 0) { dias++; if (v > 0) sumaPct += costeDia / v * 100 }
  })
  const anios = (new Date(fechas[nF - 1]) - new Date(fechas[0])) / (365.25 * 86400000)
  const fin = curva[nF - 1].value
  const cagr = anios > 0 ? (Math.pow(Math.max(fin, 0.01) / Math.max(capitalIni, 0.01), 1 / Math.max(anios, 0.01)) - 1) * 100 : null
  return { curva, cagr, maxDD, capInvPct: sumaPct / nF, tInv: dias / nF * 100 }
}
