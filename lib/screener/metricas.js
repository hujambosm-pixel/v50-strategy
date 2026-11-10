// lib/screener/metricas.js — las CIFRAS de cada empresa que usan los filtros del screener (docs/screener.md). Lógica PURA:
// recibe la fila de public.screener_empresas y sus filas de public.screener_cuentas; no habla con la base.
//
// QUÉ DATO SE USA DE CADA CONCEPTO («el último»): el de fecha de cierre más reciente entre el anual (FY) y el de los últimos
// 12 meses (TTM). Si ese dato es de más de 400 días antes que la fecha de referencia de la empresa (la más reciente de
// ventas y activos), se considera que la empresa YA NO LO PRESENTA:
//   · las partidas que muchas empresas no tienen (inversiones a corto, papel comercial, deuda a corto o a largo) cuentan 0;
//   · las demás quedan sin dato (—) y el filtro que las necesita no pasa.
//
// FÓRMULAS (importes en millones, en la moneda de sus cuentas):
//   Beneficio operativo: si la empresa no lo declara, beneficio antes de impuestos + gasto de intereses (piezas.ebitAprox).
//   ROCE = beneficio operativo ÷ (activos − pasivo corriente) · ROA = beneficio neto ÷ activos · ROE = beneficio neto ÷
//   patrimonio (sin dato si el patrimonio es 0 o negativo).
//   ROE mejor que hace 3 años: ROE del último ejercicio (FY) frente al del ejercicio de 3 años antes (los dos anuales).
//   Caja = caja + inversiones a corto · Deuda a corto = deuda a corto + papel comercial · Deuda total = deuda a corto + a largo.
//   Cobertura de intereses = beneficio operativo ÷ gasto de intereses (si no declara intereses: «no paga intereses», cuenta
//   como que la cubre). Deuda neta = deuda total − caja. D/E = deuda total ÷ patrimonio.
//   Ventas en 5 años = ventas del último ejercicio ÷ las de 5 ejercicios antes − 1.
//   Flujo de caja libre = flujo de las operaciones − inversión en inmovilizado (capex).
//   Capitalización = último cierre × acciones (media diluida del último periodo). PER = capitalización ÷ beneficio neto
//   (sin dato si el beneficio es 0 o negativo). P/S = capitalización ÷ ventas. Solo con cuentas en dólares: con cuentas en
//   otra moneda (p. ej. ASML, en euros) el precio en dólares no se puede dividir entre ellas → sin dato.
//   Crecimiento pasado = crecimiento anual compuesto del BENEFICIO NETO en 5 ejercicios (no el del BPA: el BPA de hace 5
//   años de la SEC no está ajustado por los splits posteriores). PEG pasado = PER ÷ ese crecimiento (en %). Sin dato si
//   cualquiera de los dos beneficios es 0 o negativo.
//   PEG esperado = el de Yahoo (solo hoy). Crecimiento esperado = PER ÷ PEG esperado (en % al año).
//   P/S del sector: la mediana del P/S de las empresas del universo de su mismo sector (la pone medianasPorSector).
const DIA = 86400000
const dias = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / DIA)
const M = 1e6
const OPCIONALES = new Set(['inversiones_corto', 'papel_comercial', 'deuda_corto', 'deuda_largo'])

const div = (a, b) => (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b) || b === 0) ? null : a / b

export function metricasDe(empresa, cuentas) {
  const por = {}
  for (const f of cuentas || []) (por[f.concepto] ||= []).push({ ...f, valor: Number(f.valor) })
  for (const k in por) por[k].sort((a, b) => a.fin < b.fin ? -1 : a.fin > b.fin ? 1 : (a.periodo === 'TTM' ? 1 : -1))
  const ultimoDe = (k) => { const l = por[k]; return l && l.length ? l[l.length - 1] : null }
  const ref = ['ventas', 'activos'].map(ultimoDe).filter(Boolean).reduce((m, f) => f.fin > m ? f.fin : m, '')
  const moneda = (ultimoDe('activos') || ultimoDe('ventas'))?.unidad || null
  const fechas = {}
  const ult = (k) => {
    const f = ultimoDe(k)
    if (!f || !ref || dias(f.fin, ref) > 400) return OPCIONALES.has(k) && ref ? 0 : null
    fechas[k] = f.fin
    return f.unidad === 'shares' || /\/shares$/.test(f.unidad) ? f.valor : f.valor / M
  }
  const fy = (k) => (por[k] || []).filter(f => f.periodo === 'FY')
  // El anual de unos `n` años antes del último anual (± 45 días), o null.
  const fyAntes = (k, n) => {
    const l = fy(k); const u = l[l.length - 1]; if (!u) return { ultimo: null, antes: null }
    const objetivo = new Date(Date.parse(u.fin)); objetivo.setUTCFullYear(objetivo.getUTCFullYear() - n)
    const o = objetivo.toISOString().slice(0, 10)
    const a = l.find(f => Math.abs(dias(f.fin, o)) <= 45)
    return { ultimo: u, antes: a || null }
  }

  const p = {
    ventas: ult('ventas'), beneficio: ult('beneficio_neto'), ebit: ult('beneficio_operativo'), intereses: ult('gasto_intereses'),
    antesImp: ult('beneficio_antes_impuestos'), flujoOper: ult('flujo_operativo'), capex: ult('inversion_capex'), acciones: ult('acciones_diluidas'),
    activos: ult('activos'), pasivoCorto: ult('pasivo_corriente'), patrimonio: ult('patrimonio'),
    cajaSola: ult('caja'), invCorto: ult('inversiones_corto'), deudaCortoSola: ult('deuda_corto'), papel: ult('papel_comercial'),
    deudaLargo: ult('deuda_largo'),
  }
  // Beneficio operativo: si no lo declara, beneficio antes de impuestos + intereses (la aproximación habitual del EBIT).
  p.ebitAprox = p.ebit == null && p.antesImp != null
  if (p.ebitAprox) p.ebit = p.antesImp + (p.intereses || 0)
  p.caja = p.cajaSola == null ? null : p.cajaSola + (p.invCorto || 0)
  p.deudaCorto = (p.deudaCortoSola ?? 0) + (p.papel ?? 0)
  p.deudaTotal = p.deudaCorto + (p.deudaLargo ?? 0)
  if (!ref) { p.deudaCorto = null; p.deudaTotal = null }

  const m = {}
  m.roce = p.activos != null && p.pasivoCorto != null ? pct(div(p.ebit, p.activos - p.pasivoCorto)) : null
  m.roa = pct(div(p.beneficio, p.activos))
  m.roe = p.patrimonio > 0 ? pct(div(p.beneficio, p.patrimonio)) : null
  const bn3 = fyAntes('beneficio_neto', 3), pt3 = fyAntes('patrimonio', 3)
  const roeFy = (b, pa) => b && pa && pa.valor > 0 && Math.abs(dias(b.fin, pa.fin)) <= 45 ? b.valor / pa.valor * 100 : null
  m.roeFy = roeFy(bn3.ultimo, pt3.ultimo); m.roe3 = roeFy(bn3.antes, pt3.antes)
  m.roeFyAnio = bn3.ultimo ? Number(bn3.ultimo.fin.slice(0, 4)) : null; m.roe3Anio = bn3.antes ? Number(bn3.antes.fin.slice(0, 4)) : null
  m.roeMejora = m.roeFy != null && m.roe3 != null ? m.roeFy > m.roe3 : null
  m.cajaCubre = p.caja != null && p.deudaCorto != null ? p.caja >= p.deudaCorto : null
  m.sinIntereses = p.ebit != null && !(p.intereses > 0)
  m.cobInt = m.sinIntereses ? null : div(p.ebit, p.intereses)
  m.deudaNeta = p.deudaTotal != null && p.caja != null ? p.deudaTotal - p.caja : null
  m.de = p.patrimonio > 0 && p.deudaTotal != null ? p.deudaTotal / p.patrimonio : null
  const v5 = fyAntes('ventas', 5)
  m.ventasHace5 = v5.antes ? v5.antes.valor / M : null; m.ventasUltFy = v5.ultimo ? v5.ultimo.valor / M : null
  m.ventas5 = m.ventasHace5 > 0 && m.ventasUltFy != null ? (m.ventasUltFy / m.ventasHace5 - 1) * 100 : null
  m.fcf = p.flujoOper != null && p.capex != null ? p.flujoOper - p.capex : null

  const enDolares = moneda === 'USD'
  const precio = empresa?.precio != null ? Number(empresa.precio) : null
  m.capitalizacion = enDolares && precio != null && p.acciones > 0 ? precio * p.acciones / M : null
  m.per = m.capitalizacion != null && p.beneficio > 0 ? m.capitalizacion / p.beneficio : null
  m.ps = m.capitalizacion != null && p.ventas > 0 ? m.capitalizacion / p.ventas : null
  const b5 = fyAntes('beneficio_neto', 5)
  m.crecPasado = b5.ultimo && b5.antes && b5.ultimo.valor > 0 && b5.antes.valor > 0 ? (Math.pow(b5.ultimo.valor / b5.antes.valor, 1 / 5) - 1) * 100 : null
  m.pegPas = m.per != null && m.crecPasado > 0 ? m.per / m.crecPasado : null
  m.pegEsp = empresa?.peg_esperado != null && Number(empresa.peg_esperado) > 0 ? Number(empresa.peg_esperado) : null
  m.crecEsperado = m.per != null && m.pegEsp != null ? m.per / m.pegEsp : null
  m.psSector = null   // lo pone medianasPorSector

  return { simbolo: empresa?.simbolo, nombre: empresa?.nombre, sector: empresa?.sector, sectorFuente: empresa?.sector_fuente,
    precio, precioFecha: empresa?.precio_fecha || null, pegFecha: empresa?.peg_esperado_fecha || null, aviso: empresa?.aviso || null,
    en_sp500: !!empresa?.en_sp500, en_ndx: !!empresa?.en_ndx, en_listas: !!empresa?.en_listas,
    moneda, cuentasHasta: ref || null, fechas, piezas: p, m }
}
const pct = (x) => x == null ? null : x * 100

// Pone en cada empresa m.psSector = la mediana del P/S de las de su sector (solo las que tienen P/S). Devuelve { sector: mediana }.
export function medianasPorSector(lista) {
  const por = {}
  for (const e of lista) if (e.sector && e.m.ps != null) (por[e.sector] ||= []).push(e.m.ps)
  const med = {}
  for (const [s, a] of Object.entries(por)) { const o = [...a].sort((x, y) => x - y), k = o.length >> 1; med[s] = o.length % 2 ? o[k] : (o[k - 1] + o[k]) / 2 }
  for (const e of lista) e.m.psSector = e.sector && med[e.sector] != null ? med[e.sector] : null
  return med
}
