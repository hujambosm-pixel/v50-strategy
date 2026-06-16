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

// Suma un día natural a una fecha 'YYYY-MM-DD' en UTC (evita off-by-one por zona horaria).
function addDay(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

// Curva de estrategia activa después de impuestos (RESTA ACUMULADA con escalones visibles).
//   compoundCurve: [{date, value}]  — curva compuesta pre-impuesto (capitalIni + Σ pnlSimple)
//   allTrades:     trades del multibacktest (pool) con {exitDate, pnlSimple}
// Modelo: impuesto anual a cada 31/12 sobre la ganancia realizada compuesta del año,
// con compensación de pérdidas arrastradas (saldoPendiente) y tramos progresivos.
// El último punto SIEMPRE liquida el año parcial final (aunque no se cruce su 31/12),
// para que la curva activa sea 100% comparable con el B&H en el punto final.
// El impuesto se RESTA acumulado (la amplitud se preserva, no se comprime). En cada
// fecha de pago se inyectan dos vértices para forzar una caída casi vertical:
//   · 31/12 de años completos → vértice "antes" en chargeDate, "después" en chargeDate+1día
//   · liquidación final        → último punto en lastDate exacto (no se extiende el periodo)
// Devuelve { curve, taxByDate } con taxByDate[fecha] = { accum, paid? }.
export function taxStrategyCurve(compoundCurve, allTrades, capitalIni) {
  if (!Array.isArray(compoundCurve) || compoundCurve.length === 0) return { curve: compoundCurve, taxByDate: {} }
  const lastDate = compoundCurve[compoundCurve.length - 1].date
  const plain = () => ({ curve: compoundCurve.map(p => ({ date: p.date, value: p.value })), taxByDate: {} })

  // 1. Agrupar ganancia realizada (pnlSimple) por año natural de exitDate.
  const gainByYear = {}
  for (const t of (allTrades || [])) {
    if (!t || !t.exitDate || !isFinite(t.pnlSimple)) continue
    const y = String(t.exitDate).slice(0, 4)
    gainByYear[y] = (gainByYear[y] || 0) + t.pnlSimple
  }
  const years = Object.keys(gainByYear).sort()
  if (!years.length) return plain()

  // 2. Impuesto por año con arrastre de pérdidas + fecha de cargo.
  //    Año completo → cargo a su 31/12; año parcial final (31/12 > lastDate) → cargo en lastDate.
  const events = []  // {chargeDate, tax, isFinal}
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
      const isFinal = finDeAnio > lastDate
      events.push({ chargeDate: isFinal ? lastDate : finDeAnio, tax, isFinal })
    }
  }
  if (!events.length) return plain()
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

  // 4. Construir la curva restando el impuesto acumulado, con vértices de escalón.
  //    afterTax = value - accum;  en cada pago accum sube de golpe.
  //    taxByDate: accum (Σ tax con chargeDate <= fecha) en cada fecha; paid solo en chargeDates.
  const taxByDate = {}
  const out = []
  const pushPt = (date, value) => {
    if (out.length && out[out.length - 1].date === date) out[out.length - 1] = { date, value }
    else out.push({ date, value })
  }
  let accum = 0, ei = 0
  const lastIdx = compoundCurve.length - 1
  compoundCurve.forEach((p, idx) => {
    // Escalones de años completos (chargeDate < fecha del punto): vértices antes/después.
    while (ei < events.length && !events[ei].isFinal && events[ei].chargeDate < p.date) {
      const e = events[ei++]
      pushPt(e.chargeDate, e.boundaryValue - accum)        // antes de restar este impuesto
      accum += e.tax
      pushPt(addDay(e.chargeDate), e.boundaryValue - accum) // después (+1 día)
      taxByDate[e.chargeDate] = { paid: e.tax, accum }
    }
    if (idx === lastIdx) {
      // Liquidación final (chargeDate == lastDate): se aplica el/los impuesto(s) justo antes
      // del último punto. El penúltimo punto real ya quedó a valor pleno (accum previo) y este
      // último, en lastDate exacto, lleva el valor neto → caída vertical sin extender el periodo.
      while (ei < events.length && events[ei].chargeDate <= p.date) {
        const e = events[ei++]
        accum += e.tax
        taxByDate[e.chargeDate] = { paid: (taxByDate[e.chargeDate]?.paid || 0) + e.tax, accum }
      }
      pushPt(p.date, p.value - accum)  // último punto en lastDate, valor neto final
      if (accum > 0 && !(p.date in taxByDate)) taxByDate[p.date] = { accum }
    } else {
      pushPt(p.date, p.value - accum)
      if (accum > 0 && !(p.date in taxByDate)) taxByDate[p.date] = { accum }
    }
  })
  return { curve: out, taxByDate }
}

// Curva buy&hold después de impuestos.
//   bhCurve: [{date, value}]
// Impuesto ÚNICO al final del periodo sobre la plusvalía total (valorFinal - capitalIni).
// Liquidación en lastDate exacto: penúltimo punto a valor pleno, último a valor neto
// (caída vertical al final sin extender el periodo). Devuelve { curve, taxByDate }.
export function taxBHCurve(bhCurve, capitalIni) {
  if (!Array.isArray(bhCurve) || bhCurve.length === 0) return { curve: bhCurve, taxByDate: {} }
  const lastIdx = bhCurve.length - 1
  const lastDate = bhCurve[lastIdx].date
  const plusvalia = bhCurve[lastIdx].value - capitalIni
  const tax = calcImpuestoTramos(plusvalia)
  const curve = bhCurve.map((p, idx) => ({ date: p.date, value: idx === lastIdx ? p.value - tax : p.value }))
  const taxByDate = tax > 0 ? { [lastDate]: { paid: tax, accum: tax } } : {}
  return { curve, taxByDate }
}
