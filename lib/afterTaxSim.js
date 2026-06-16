// lib/afterTaxSim.js
// Simulación de IRPF de la base del ahorro sobre las curvas de equity del multibacktest.
// Post-procesado 100% en frontend: NO toca el motor (pages/api/multibacktest.js).
// Solo para modos POOL (compartido/concentrado/positionsizing), donde la ganancia
// realizada compuesta por trade = pnlSimple (el pool ya compone).

// Tramos progresivos de la base del ahorro (IRPF). Se aplican desde cero cada año.
//   [techoAcumulado, tipoMarginal]
const TRAMOS_AHORRO = [
  [6000, 0.19],      // hasta 6.000 €: 19%
  [50000, 0.21],     // 6.000–50.000 €: 21%
  [200000, 0.23],    // 50.000–200.000 €: 23%
  [300000, 0.27],    // 200.000–300.000 €: 27%
  [Infinity, 0.28],  // >300.000 €: 28%
]

// Impuesto progresivo por tramos sobre la ganancia gravable de UN año (desde cero).
export function calcImpuestoTramos(gananciaAnual) {
  if (!(gananciaAnual > 0)) return 0
  let tax = 0, prev = 0
  for (const [techo, tipo] of TRAMOS_AHORRO) {
    if (gananciaAnual <= prev) break
    const tramo = Math.min(gananciaAnual, techo) - prev
    tax += tramo * tipo
    prev = techo
    if (gananciaAnual <= techo) break
  }
  return tax
}

// Curva de estrategia activa después de impuestos.
//   compoundCurve: [{date, value}]  — curva compuesta pre-impuesto (capitalIni + Σ pnlSimple)
//   allTrades:     trades del multibacktest (pool) con {exitDate, pnlSimple}
// Modelo: impuesto anual a cada 31/12 sobre la ganancia realizada compuesta del año,
// con compensación de pérdidas arrastradas (saldoPendiente) y tramos progresivos.
// El último punto SIEMPRE liquida el año parcial final (aunque no se cruce su 31/12),
// para que la curva activa sea 100% comparable con el B&H en el punto final.
export function taxStrategyCurve(compoundCurve, allTrades, capitalIni) {
  if (!Array.isArray(compoundCurve) || compoundCurve.length === 0) return compoundCurve
  const lastDate = compoundCurve[compoundCurve.length - 1].date

  // 1. Agrupar ganancia realizada (pnlSimple) por año natural de exitDate.
  const gainByYear = {}
  for (const t of (allTrades || [])) {
    if (!t || !t.exitDate || !isFinite(t.pnlSimple)) continue
    const y = String(t.exitDate).slice(0, 4)
    gainByYear[y] = (gainByYear[y] || 0) + t.pnlSimple
  }
  const years = Object.keys(gainByYear).sort()
  if (!years.length) return compoundCurve.map(p => ({ date: p.date, value: p.value }))

  // 2. Impuesto por año con arrastre de pérdidas + fecha de cargo.
  //    Año completo → cargo a su 31/12; año parcial final (31/12 > lastDate) → cargo en lastDate.
  const events = []  // {chargeDate, tax}
  let saldoPendiente = 0  // pérdidas pendientes de compensar (valor positivo)
  for (const y of years) {
    const net = gainByYear[y]
    let tax = 0
    if (net > 0) {
      const offset = Math.min(saldoPendiente, net)
      saldoPendiente -= offset
      tax = calcImpuestoTramos(net - offset)
    } else if (net < 0) {
      saldoPendiente += -net
    }
    if (tax > 0) {
      const finDeAnio = `${y}-12-31`
      const chargeDate = finDeAnio <= lastDate ? finDeAnio : lastDate
      events.push({ chargeDate, tax })
    }
  }
  if (!events.length) return compoundCurve.map(p => ({ date: p.date, value: p.value }))
  events.sort((a, b) => a.chargeDate.localeCompare(b.chargeDate))

  // 3. Valor pre-impuesto de la curva en cada chargeDate (último punto con date <= chargeDate).
  for (const e of events) {
    let v = compoundCurve[0].value
    for (let i = 0; i < compoundCurve.length; i++) {
      if (compoundCurve[i].date <= e.chargeDate) v = compoundCurve[i].value
      else break
    }
    e.boundaryValue = v
  }

  // 4. Recorrer la curva detrayendo impuestos vía factor multiplicativo.
  //    afterTax = value · factor;  en cada cargo: factor -= tax / V_pre-impuesto.
  //    Escalones interiores aplican en el siguiente punto tras el 31/12; el cargo final
  //    (chargeDate == lastDate) se aplica también al último punto (inclusive).
  const applyStep = (e) => {
    if (e.boundaryValue > 0) {
      factor -= e.tax / e.boundaryValue
      if (factor < 0) factor = 0
    }
  }
  let factor = 1, ei = 0
  const lastIdx = compoundCurve.length - 1
  return compoundCurve.map((p, idx) => {
    while (ei < events.length && events[ei].chargeDate < p.date) applyStep(events[ei++])
    if (idx === lastIdx) {
      while (ei < events.length && events[ei].chargeDate <= p.date) applyStep(events[ei++])
    }
    return { date: p.date, value: p.value * factor }
  })
}

// Curva buy&hold después de impuestos.
//   bhCurve: [{date, value}]
// Impuesto ÚNICO al final del periodo sobre la plusvalía total (valorFinal - capitalIni).
// Solo se reduce el último punto (escalón final). Sin arrastre (evento único).
export function taxBHCurve(bhCurve, capitalIni) {
  if (!Array.isArray(bhCurve) || bhCurve.length === 0) return bhCurve
  const lastIdx = bhCurve.length - 1
  const plusvalia = bhCurve[lastIdx].value - capitalIni
  const tax = calcImpuestoTramos(plusvalia)
  if (tax <= 0) return bhCurve.map(p => ({ date: p.date, value: p.value }))
  return bhCurve.map((p, idx) => ({ date: p.date, value: idx === lastIdx ? p.value - tax : p.value }))
}
