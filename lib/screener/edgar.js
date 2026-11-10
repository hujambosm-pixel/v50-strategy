// lib/screener/edgar.js — de los «companyfacts» de la SEC (EDGAR) a las filas de public.screener_cuentas (docs/screener.md).
// Lógica PURA: recibe el JSON de https://data.sec.gov/api/xbrl/companyfacts/CIK##########.json y devuelve filas; no habla
// con la red ni con la base (eso lo hace scripts/cargaScreener.js).
//
// CONCEPTOS. Cada concepto nuestro tiene una lista de partidas XBRL por orden de preferencia (las empresas no usan todas la
// misma). Para CADA FECHA DE CIERRE se usa la primera partida de la lista que tenga ese dato: así, si una empresa cambió de
// partida un año (pasa mucho con las ventas en 2018, al llegar la norma ASC 606), la serie no se corta.
//   · tipo 'flujo' (ventas, beneficio, caja generada…): cifras de un periodo con inicio y fin.
//   · tipo 'saldo' (activos, deuda, caja…): cifras de un día (el cierre del ejercicio o del trimestre).
//
// PERIODOS.
//   · 'FY' (anual): flujos de unos 12 meses (entre 350 y 380 días) presentados en un 10-K, 10-K/A, 20-F o 40-F; saldos de esos
//     mismos documentos con fecha igual al fin de uno de esos ejercicios.
//   · 'TTM' (últimos 12 meses), SOLO del último trimestre presentado si es posterior al último ejercicio: para un flujo,
//     ejercicio + lo que va de año ahora − lo mismo del año anterior (los 10-Q traen «lo que va de año» con inicio en el
//     comienzo del ejercicio); para un saldo, el del último trimestre. Si falta una pieza, no hay TTM de ese concepto (la
//     pantalla usa entonces el último FY y lo dice).
//   · Si la misma cifra (mismo inicio y fin) sale en varios documentos (cada 10-K repite los años anteriores, a veces
//     corregidos), vale la del documento MÁS RECIENTE; `conocido_desde` guarda el día del PRIMERO en que apareció.
//
// UNIDADES. Importes en 'USD' (o la moneda de un 20-F: EUR, por ejemplo; las razones no dependen de la moneda); el BPA en
// 'USD/shares'; las acciones en 'shares'.

export const CONCEPTOS = {
  ventas: { tipo: 'flujo', unidad: 'moneda', etiquetas: ['us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax', 'us-gaap:Revenues', 'us-gaap:SalesRevenueNet', 'us-gaap:RevenueFromContractWithCustomerIncludingAssessedTax', 'us-gaap:SalesRevenueGoodsNet', 'ifrs-full:Revenue'] },
  beneficio_neto: { tipo: 'flujo', unidad: 'moneda', etiquetas: ['us-gaap:NetIncomeLoss', 'us-gaap:ProfitLoss', 'ifrs-full:ProfitLossAttributableToOwnersOfParent', 'ifrs-full:ProfitLoss'] },
  beneficio_operativo: { tipo: 'flujo', unidad: 'moneda', etiquetas: ['us-gaap:OperatingIncomeLoss', 'ifrs-full:ProfitLossFromOperatingActivities'] },
  beneficio_antes_impuestos: { tipo: 'flujo', unidad: 'moneda', etiquetas: ['us-gaap:IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest', 'us-gaap:IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments', 'us-gaap:IncomeLossFromContinuingOperationsBeforeIncomeTaxesDomestic', 'ifrs-full:ProfitLossBeforeTax'] },
  gasto_intereses: { tipo: 'flujo', unidad: 'moneda', etiquetas: ['us-gaap:InterestExpense', 'us-gaap:InterestExpenseNonoperating', 'us-gaap:InterestExpenseDebt', 'us-gaap:InterestAndDebtExpense', 'ifrs-full:InterestExpense', 'ifrs-full:FinanceCosts'] },
  flujo_operativo: { tipo: 'flujo', unidad: 'moneda', etiquetas: ['us-gaap:NetCashProvidedByUsedInOperatingActivities', 'us-gaap:NetCashProvidedByUsedInOperatingActivitiesContinuingOperations', 'ifrs-full:CashFlowsFromUsedInOperatingActivities'] },
  inversion_capex: { tipo: 'flujo', unidad: 'moneda', etiquetas: ['us-gaap:PaymentsToAcquirePropertyPlantAndEquipment', 'us-gaap:PaymentsToAcquireProductiveAssets', 'ifrs-full:PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities'] },
  bpa_diluido: { tipo: 'flujo', unidad: 'bpa', etiquetas: ['us-gaap:EarningsPerShareDiluted', 'us-gaap:EarningsPerShareBasicAndDiluted', 'ifrs-full:DilutedEarningsLossPerShare'] },
  acciones_diluidas: { tipo: 'flujo', unidad: 'acciones', etiquetas: ['us-gaap:WeightedAverageNumberOfDilutedSharesOutstanding', 'ifrs-full:WeightedAverageNumberOfSharesOutstandingDiluted'] },
  activos: { tipo: 'saldo', unidad: 'moneda', etiquetas: ['us-gaap:Assets', 'ifrs-full:Assets'] },
  pasivo_corriente: { tipo: 'saldo', unidad: 'moneda', etiquetas: ['us-gaap:LiabilitiesCurrent', 'ifrs-full:CurrentLiabilities'] },
  patrimonio: { tipo: 'saldo', unidad: 'moneda', etiquetas: ['us-gaap:StockholdersEquity', 'us-gaap:StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest', 'ifrs-full:EquityAttributableToOwnersOfParent', 'ifrs-full:Equity'] },
  caja: { tipo: 'saldo', unidad: 'moneda', etiquetas: ['us-gaap:CashAndCashEquivalentsAtCarryingValue', 'us-gaap:CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents', 'us-gaap:Cash', 'ifrs-full:CashAndCashEquivalents'] },
  inversiones_corto: { tipo: 'saldo', unidad: 'moneda', etiquetas: ['us-gaap:ShortTermInvestments', 'us-gaap:MarketableSecuritiesCurrent', 'us-gaap:AvailableForSaleSecuritiesDebtSecuritiesCurrent', 'ifrs-full:CurrentInvestments'] },
  deuda_corto: { tipo: 'saldo', unidad: 'moneda', etiquetas: ['us-gaap:DebtCurrent', 'us-gaap:LongTermDebtAndCapitalLeaseObligationsCurrent', 'us-gaap:LongTermDebtCurrent', 'ifrs-full:CurrentBorrowingsAndCurrentPortionOfNoncurrentBorrowings', 'ifrs-full:ShorttermBorrowings'] },
  papel_comercial: { tipo: 'saldo', unidad: 'moneda', etiquetas: ['us-gaap:CommercialPaper', 'us-gaap:ShortTermBorrowings'] },
  deuda_largo: { tipo: 'saldo', unidad: 'moneda', etiquetas: ['us-gaap:LongTermDebtNoncurrent', 'us-gaap:LongTermDebtAndCapitalLeaseObligations', 'us-gaap:LongTermDebtAndFinanceLeaseObligationsNoncurrent' , 'ifrs-full:NoncurrentPortionOfNoncurrentBorrowings', 'ifrs-full:LongtermBorrowings'] },
}

const FORMULARIOS_ANUALES = new Set(['10-K', '10-K/A', '20-F', '20-F/A', '40-F', '40-F/A'])
const FORMULARIOS_TRIMESTRALES = new Set(['10-Q', '10-Q/A'])
const DIA = 86400000
const dias = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / DIA)

// Los hechos de una partida 'taxonomía:Nombre' en la unidad del concepto: [{ start?, end, val, form, filed, fy, fp }].
function hechosDe(facts, etiqueta, unidad) {
  const [tax, nombre] = etiqueta.split(':')
  const units = facts?.[tax]?.[nombre]?.units
  if (!units) return { unidad: null, hechos: [] }
  let clave
  if (unidad === 'bpa') clave = Object.keys(units).find(u => /\/shares$/.test(u))
  else if (unidad === 'acciones') clave = units.shares ? 'shares' : null
  else clave = units.USD ? 'USD' : Object.keys(units).find(u => /^[A-Z]{3}$/.test(u))
  return clave ? { unidad: clave, hechos: units[clave] } : { unidad: null, hechos: [] }
}

// De varias apariciones de la misma cifra (mismo inicio y fin), la del documento más reciente, con el día del primero.
function unaPorPeriodo(hechos) {
  const m = new Map()
  for (const h of hechos) {
    const k = (h.start || '') + '|' + h.end
    const y = m.get(k)
    if (!y) m.set(k, { ...h, primero: h.filed })
    else {
      if (h.filed > y.filed || (h.filed === y.filed && h.accn > y.accn)) m.set(k, { ...h, primero: y.primero < h.filed ? y.primero : h.filed })
      else if (h.filed < y.primero) y.primero = h.filed
    }
  }
  return [...m.values()]
}

// Los fines de ejercicio de la empresa: las fechas de fin de los flujos anuales de sus 10-K / 20-F (de cualquier partida).
export function finesDeEjercicio(facts) {
  const fines = new Set()
  for (const c of Object.values(CONCEPTOS)) {
    if (c.tipo !== 'flujo' || c.unidad !== 'moneda') continue
    for (const et of c.etiquetas) for (const h of hechosDe(facts, et, c.unidad).hechos) {
      if (FORMULARIOS_ANUALES.has(h.form) && h.start) { const d = dias(h.start, h.end); if (d >= 350 && d <= 380) fines.add(h.end) }
    }
  }
  return fines
}

// Las filas de screener_cuentas de una empresa: [{ cik, concepto, periodo, fin, inicio, anio_fiscal, valor, unidad, etiqueta,
// presentado, conocido_desde }].
export function filasDeEmpresa(companyfacts) {
  const cik = Number(companyfacts?.cik)
  const facts = companyfacts?.facts || {}
  const fines = finesDeEjercicio(facts)
  const filas = []
  for (const [concepto, c] of Object.entries(CONCEPTOS)) {
    const anual = new Map()   // fin → fila
    const trimestral = []     // hechos de 10-Q de esta partida y las siguientes: { start, end, val, etiqueta, ... }
    for (const etiqueta of c.etiquetas) {
      const { unidad, hechos } = hechosDe(facts, etiqueta, c.unidad)
      if (!unidad) continue
      // Lo anual, solo de los documentos anuales (un 10-Q repite el balance del cierre del ejercicio y no debe taparlo).
      for (const h of unaPorPeriodo(hechos.filter(h => FORMULARIOS_ANUALES.has(h.form)))) {
        const anualOk = c.tipo === 'flujo'
          ? (h.start && dias(h.start, h.end) >= 350 && dias(h.start, h.end) <= 380)
          : (!h.start && fines.has(h.end))
        if (anualOk && !anual.has(h.end)) {
          anual.set(h.end, { cik, concepto, periodo: 'FY', fin: h.end, inicio: h.start || null, anio_fiscal: Number(h.end.slice(0, 4)), valor: h.val, unidad, etiqueta, presentado: h.filed, conocido_desde: h.primero })
        }
      }
      for (const h of unaPorPeriodo(hechos.filter(h => FORMULARIOS_TRIMESTRALES.has(h.form)))) trimestral.push({ ...h, etiqueta, unidad })
    }
    const listaFY = [...anual.values()].sort((a, b) => a.fin < b.fin ? -1 : 1)
    filas.push(...listaFY)
    const ttm = ultimoDoceMeses(c, listaFY, trimestral, cik, concepto)
    if (ttm) filas.push(ttm)
  }
  return filas
}

// Los últimos 12 meses, si hay un trimestre presentado posterior al último ejercicio (ver la cabecera). null si no.
function ultimoDoceMeses(c, listaFY, trimestral, cik, concepto) {
  const ultFY = listaFY[listaFY.length - 1]
  if (!ultFY) return null
  const posteriores = trimestral.filter(h => h.end > ultFY.fin)
  if (!posteriores.length) return null
  const fin = posteriores.reduce((m, h) => h.end > m ? h.end : m, '')
  if (c.tipo === 'saldo') {
    const h = posteriores.find(h => h.end === fin && !h.start)
    return h ? { cik, concepto, periodo: 'TTM', fin, inicio: null, anio_fiscal: null, valor: h.val, unidad: h.unidad, etiqueta: h.etiqueta, presentado: h.filed, conocido_desde: h.primero } : null
  }
  // Acciones (media del periodo): la del trimestre más corto que acaba en `fin` (la más cercana a hoy).
  if (c.unidad === 'acciones') {
    const h = posteriores.filter(h => h.end === fin && h.start).sort((a, b) => dias(a.start, a.end) - dias(b.start, b.end))[0]
    return h ? { cik, concepto, periodo: 'TTM', fin, inicio: h.start, anio_fiscal: null, valor: h.val, unidad: h.unidad, etiqueta: h.etiqueta, presentado: h.filed, conocido_desde: h.primero } : null
  }
  // El BPA de 12 meses no se suma por trimestres (cambia el número de acciones): lo calcula la pantalla (beneficio ÷ acciones).
  if (c.unidad === 'bpa') return null
  // Flujo: «lo que va de año» = el de inicio más antiguo con ese fin (empieza tras el último ejercicio).
  const ytd = posteriores.filter(h => h.end === fin && h.start && dias(ultFY.fin, h.start) >= -3 && dias(ultFY.fin, h.start) <= 10)
  const actual = ytd.sort((a, b) => a.start < b.start ? -1 : 1)[0]
  if (!actual) return null
  const largo = dias(actual.start, actual.end)
  if (largo >= 350) return null
  // El mismo tramo un año antes: inicio ≈ el del ejercicio anterior al último, mismo largo (± 7 días).
  const previo = trimestral.find(h => h.start && Math.abs(dias(ultFY.inicio || ultFY.fin, h.start)) <= 10 && Math.abs(dias(h.start, h.end) - largo) <= 7 && h.etiqueta === actual.etiqueta)
  if (!previo || ultFY.etiqueta !== actual.etiqueta) return null
  return { cik, concepto, periodo: 'TTM', fin, inicio: null, anio_fiscal: null, valor: ultFY.valor + actual.val - previo.val, unidad: actual.unidad, etiqueta: actual.etiqueta, presentado: actual.filed, conocido_desde: actual.primero }
}
