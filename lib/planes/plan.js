// lib/planes/plan.js — el MOTOR de los planes de inversión (docs/planes-inversion.md, §2–§3 y §8). Puro: recibe los datos
// ya alineados (los de lib/laboratorioCartera.js, alineaDatos: QQQ, el ETF y SPY con rentabilidad total) y no toca la red.
//
// FORMATO 1:
// {
//   tipo: 'plan', formato: 1, calculo: 1, nombre?, descripcion?, etf: 'QLD' | 'TQQQ' | 'x2' | 'x3' (si alguna pieza lo usa),
//   dinero: { capitalInicial, aportaciones: { importe, frecuencia: 'mensual' | 'trimestral' | 'anual' | 'ninguna',
//             crecimientoAnual (%) }, extraordinarias: [{ fecha, importe }] },
//   piezas: [{ id, tipo: 'cartera', regla, peso } | { id, tipo: 'activo', activo: 'QQQ' | 'SPY' | 'ETF' | 'LIQUIDEZ', peso }],
//   reparto: { aportacionesA: 'infraponderada' | 'pesos', rebalanceo: { calendario: 'nunca' | 'anual' | 'trimestral',
//              banda: null | fracción } },
//   impuestos: { regimen: 'ES-ahorro' | 'ninguno', reglaDosMeses: true },
//   costes: null | { comisionPct, comisionMinEur, horquillaPct: { QQQ, ETF, SPY } },
//   periodo: { desde, hasta },
// }
// Huella: sha256 del JSON canónico sin nombre ni descripción (lib/lotesLab.js). calculo: la versión de este motor.
//
// EJECUCIÓN, cada día de bolsa i del periodo (los mismos tiempos que la cartera: se decide al cierre, se actúa a la
// apertura siguiente):
//   1. el primer día de bolsa de JULIO, el impuesto del año anterior (decisión 4), de la persona: con la liquidez de las
//      piezas y, si no basta, vendiendo a prorrata de su valor;
//   2. cada pieza de cartera ejecuta la transición que decidió la víspera y sus rebalanceos de calendario (la máquina de
//      estados de lib/laboratorioCartera.js, con SU dinero);
//   3. las aportaciones (el capital inicial el primer día; luego, el primer día de bolsa de cada mes, trimestre o año): a las
//      piezas que más se han quedado atrás de su peso, rellenando sus huecos sin vender (decisión 2), o con los pesos; dentro
//      de una pieza, con los pesos de su estado (o la proporción que ya tiene; 100 % QQQ si está vacía);
//   4. el rebalanceo entre piezas, si se pidió (calendario y / o banda sobre los pesos de la víspera): vende y compra;
//   5. al cierre: el patrimonio, el valor liquidativo (VL) y, en las piezas de cartera, las transiciones para mañana.
// LOTES Y FISCALIDAD: FIFO por valor para TODA la persona (dos piezas con QQQ comparten los lotes), en euros, con el coste de
// cada compra dentro de su precio y el de cada venta restado de lo cobrado. REGLA DE LOS DOS MESES (art. 33.5.f LIRPF): si
// una venta da pérdida y se compran valores homogéneos en los dos meses anteriores (que sigan en cartera) o posteriores, esa
// pérdida (en proporción a los valores recomprados) no se computa ese año: pasa a los valores recomprados y se computa al
// venderlos. Simplificación: se aplica al resultado neto de cada venta (no lote a lote). Tramos del ahorro sobre importes
// reales, compensación de pérdidas de 4 años y, al final, liquidación de todo (como comprar y mantener).
//
// PIEZA «ESTRATEGIA» (P8, versión «una acción»; docs/builder.md §47; como mucho una por plan):
//   { id, tipo: 'estrategia', estrategia: { id, name, definition, params } (la foto de la estrategia de tarjetas, como el paso 2),
//     activo: 'AAPL', peso, ocioso: 'LIQUIDEZ' | 'QQQ' | 'GLD' | <cualquier símbolo de la caché>, aportacionDentro?: 'espera' (por
//     defecto) | 'compra', apalancamiento?: 1 | 2 | 3, velas?: 'diarias' }
//   Sus operaciones son las del paso 1 y el paso 2 en ese valor con velas diarias (lib/planes/estrategia.js). Con una operación
//   abierta, el dinero de la pieza está en el valor (o en su sintético ×2 / ×3); fuera, en el ocioso (nunca apalancado). Cada cambio
//   es una venta y una compra reales (costes, lotes FIFO e impuestos, también del ocioso): al ENTRAR (paso 2), se vende el ocioso a
//   la apertura y se compra el valor al precio de la entrada; al SALIR, se vende al precio de la salida y se compra el ocioso a la
//   apertura si la salida fue a la apertura y, si fue dentro de la vela (un stop), al cierre. El dinero nuevo que llega a la pieza
//   (paso 3 y rebalanceos) con una operación abierta: con 'espera', al ocioso (entra con la siguiente compra); con 'compra', compra
//   más del valor a la apertura de ese día. El que llega el mismo día de una entrada entra con ella, en los dos modos. datos.velas: { símbolo: velas diarias } del valor, del ocioso (salvo QQQ, SPY y liquidez,
//   que son los del plan) y de los índices de su regla. Un plan sin esta pieza se ejecuta exactamente como antes.
import { CONDICIONES, preparaRegla, estadoDeInicio, velasCondiciones, cambiaPeriodo, validaRegla } from '../laboratorioCartera'
import { calcImpuestoTramos } from '../afterTaxSim'
import { jsonCanonico, sha256Hex } from '../lotesLab'
import { validaPiezaEstrategia, simboloDentro, operacionesDe, serieDe as serieDeEstrategia, precioOperacion, salidaAlAbrir, curvaSola, apalancamientoDe } from './estrategia'

export const FORMATO_PLAN = 1
export const CALCULO_PLAN = 1
export const ACTIVOS = ['QQQ', 'ETF', 'SPY']
export const AÑOS_COMPENSACION = 4
export const MES_PAGO_IMPUESTO = '07'
const FRECUENCIAS_APORTACION = ['mensual', 'trimestral', 'anual', 'ninguna']
const fecha = (x) => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x)
const esCalendario = (tr) => !!tr.calendario

// ── Validación y huella ──
export function validaPlan(p) {
  const e = []
  if (!p || p.tipo !== 'plan' || p.formato !== FORMATO_PLAN) return [`El plan tiene que ser de tipo «plan» y formato ${FORMATO_PLAN}.`]
  if (p.calculo !== CALCULO_PLAN) e.push(`La versión del cálculo tiene que ser la ${CALCULO_PLAN}.`)
  const d = p.dinero || {}
  if (!(Number.isFinite(d.capitalInicial) && d.capitalInicial >= 0)) e.push('El capital inicial tiene que ser un número (0 o más).')
  const a = d.aportaciones || { frecuencia: 'ninguna' }
  if (!FRECUENCIAS_APORTACION.includes(a.frecuencia)) e.push('Las aportaciones: mensuales, trimestrales, anuales o ninguna.')
  if (a.frecuencia !== 'ninguna' && !(Number.isFinite(a.importe) && a.importe > 0)) e.push('El importe de cada aportación tiene que ser mayor que 0.')
  if (a.crecimientoAnual != null && !(Number.isFinite(a.crecimientoAnual) && a.crecimientoAnual > -50 && a.crecimientoAnual < 50)) e.push('El crecimiento anual de la aportación, entre −50 y 50 %.')
  for (const x of d.extraordinarias || []) if (!fecha(x?.fecha) || !(Number.isFinite(x.importe) && x.importe > 0)) e.push('Una aportación extraordinaria necesita fecha e importe.')
  if (!(d.capitalInicial > 0) && a.frecuencia === 'ninguna' && !(d.extraordinarias || []).length) e.push('Sin capital inicial ni aportaciones no hay nada que invertir.')
  const ps = p.piezas
  if (!Array.isArray(ps) || !ps.length || ps.length > 5) e.push('De 1 a 5 piezas.')
  else {
    const ids = new Set()
    for (const [k, x] of ps.entries()) {
      const dd = `Pieza ${x?.id || k + 1}`
      if (!/^[A-Za-z0-9_-]{1,20}$/.test(x?.id || '') || ids.has(x.id)) e.push(`${dd}: necesita un id corto distinto de los demás.`)
      ids.add(x?.id)
      if (!(Number.isFinite(x?.peso) && x.peso > 0 && x.peso <= 1)) e.push(`${dd}: el peso, entre 0 y 1.`)
      if (x?.tipo === 'cartera') e.push(...validaRegla(x.regla).map(y => `${dd}: ${y}`))
      else if (x?.tipo === 'activo') { if (![...ACTIVOS, 'LIQUIDEZ'].includes(x.activo)) e.push(`${dd}: el activo tiene que ser QQQ, SPY, el ETF o liquidez.`) }
      else if (x?.tipo === 'estrategia') e.push(...validaPiezaEstrategia(x).map(y => `${dd}: ${y}`))
      else e.push(`${dd}: el tipo tiene que ser «cartera», «activo» o «estrategia».`)
    }
    if (ps.filter(x => x?.tipo === 'estrategia').length > 1) e.push('Por ahora, como mucho una pieza «estrategia» por plan.')
    const suma = ps.reduce((s, x) => s + (Number(x?.peso) || 0), 0)
    if (Math.abs(suma - 1) > 1e-9) e.push('Los pesos de las piezas tienen que sumar 1 (100 %).')
    if (usaEtf(p) && !['QLD', 'TQQQ', 'x2', 'x3'].includes(p.etf)) e.push('El ETF tiene que ser QLD, TQQQ o un sintético ×2 / ×3.')
  }
  const r = p.reparto || {}
  if (!['infraponderada', 'pesos'].includes(r.aportacionesA)) e.push('Las aportaciones van a la infraponderada o con los pesos.')
  const rb = r.rebalanceo || {}
  if (!['nunca', 'anual', 'trimestral'].includes(rb.calendario)) e.push('El rebalanceo entre piezas: nunca, anual o trimestral.')
  if (rb.banda != null && !(Number.isFinite(rb.banda) && rb.banda > 0 && rb.banda < 0.5)) e.push('La banda de rebalanceo, entre 0 y 0,5 (50 puntos).')
  if (!['ES-ahorro', 'ninguno'].includes(p.impuestos?.regimen)) e.push('Los impuestos: «ES-ahorro» o «ninguno».')
  const c = p.costes
  if (c != null && !(c.comisionPct >= 0 && c.comisionPct <= 5 && c.comisionMinEur >= 0 && c.comisionMinEur <= 1000 && ACTIVOS.every(x => (c.horquillaPct?.[x] ?? 0) >= 0 && (c.horquillaPct?.[x] ?? 0) <= 5))) e.push('Los costes: comisión de 0 a 5 %, mínimo de 0 a 1000 €, horquilla de 0 a 5 %.')
  if (!fecha(p.periodo?.desde) || !fecha(p.periodo?.hasta) || !(p.periodo.desde < p.periodo.hasta)) e.push('El periodo necesita dos fechas (desde < hasta).')
  return e
}
export const usaEtf = (p) => (p?.piezas || []).some(x => (x.tipo === 'activo' && x.activo === 'ETF') || (x.tipo === 'cartera' && JSON.stringify(x.regla || {}).includes('"ETF"')))
export const paraHuellaPlan = (p) => { const { nombre: _n, descripcion: _d, ...resto } = p || {}; return resto }
export const huellaPlan = (p) => sha256Hex(jsonCanonico(paraHuellaPlan(p)))

// Dos meses antes / después de una fecha (el mismo día del mes; si no existe, el último del mes).
export function masMeses(f, m) {
  const y = Number(f.slice(0, 4)), mo = Number(f.slice(5, 7)) - 1 + m, d = Number(f.slice(8, 10))
  const yy = y + Math.floor(mo / 12), mm = ((mo % 12) + 12) % 12, ult = new Date(Date.UTC(yy, mm + 1, 0)).getUTCDate()
  return `${yy}-${String(mm + 1).padStart(2, '0')}-${String(Math.min(d, ult)).padStart(2, '0')}`
}

// ── El motor ──
// datos: { fechas, qqq, etf, spy (totales { open, close }), qqqVelas, velasRef? }. Devuelve la serie diaria, los flujos, las
// operaciones, los impuestos por año y el valor neto al liquidar al final.
export function ejecutaPlan(plan, datos, { detalle = true } = {}) {
  const { fechas } = datos
  const i0 = fechas.findIndex(f => f >= plan.periodo.desde), i1 = fechas.reduce((m, f, i) => f <= plan.periodo.hasta ? i : m, -1)
  if (i0 < 0 || i1 <= i0) throw new Error(`Sin datos para ${plan.periodo.desde} → ${plan.periodo.hasta}.`)
  const ETF_ = usaEtf(plan)
  if (ETF_ && !datos.etf?.[i0]) throw new Error(`El ETF no tiene datos al empezar ${plan.periodo.desde}.`)
  if (plan.piezas.some(x => x.tipo === 'activo' && x.activo === 'SPY') && !datos.spy?.[i0]) throw new Error(`SPY no tiene datos al empezar ${plan.periodo.desde}.`)
  const serieDe = { QQQ: datos.qqq, ETF: datos.etf, SPY: datos.spy }
  // Los símbolos de la persona: QQQ, el ETF y SPY y, si hay pieza estrategia (o una referencia de comprar y mantener otro valor),
  // los suyos al final. Sin ellas, simbolos = ACTIVOS y todo se suma en el mismo orden que antes.
  const EST = plan.piezas.filter(x => x.tipo === 'estrategia'), simbolos = [...ACTIVOS]
  const anade = (s) => { if (s !== 'LIQUIDEZ' && !simbolos.includes(s)) { simbolos.push(s); serieDe[s] = serieDeEstrategia(s, datos) } }
  for (const x of EST) { anade(simboloDentro(x)); anade(x.ocioso) }
  for (const x of plan.piezas) if (x.tipo === 'activo') anade(x.activo)
  const precio = (a, i, campo = 'open') => a === 'LIQUIDEZ' ? 1 : serieDe[a][i]?.[campo]
  const conImpuestos = plan.impuestos?.regimen === 'ES-ahorro', dosMeses = conImpuestos && plan.impuestos?.reglaDosMeses !== false
  const cst = plan.costes ? { com: plan.costes.comisionPct / 100, min: plan.costes.comisionMinEur, h: Object.fromEntries(simbolos.map(a => [a, (plan.costes.horquillaPct?.[a] ?? 0) / 100])) } : null
  let costesPagados = 0, ordenes = 0
  const costeOrden = (a, X) => { if (!cst || a === 'LIQUIDEZ' || !(X > 0)) return 0; ordenes++; const c = (cst.com > 0 || cst.min > 0 ? Math.max(cst.com * X, cst.min) : 0) + X * cst.h[a]; costesPagados += c; return c }

  // ── Lotes de la persona, ganancias por año y la regla de los dos meses ──
  const lotes = Object.fromEntries(simbolos.map(a => [a, []])), ganancias = {}, pendientesDosMeses = Object.fromEntries(simbolos.map(a => [a, []])), diferidas = []
  const suma = (anio, x) => { ganancias[anio] = (ganancias[anio] || 0) + x }
  // px: el precio de la orden si no es la apertura de i (las entradas y salidas de una pieza estrategia, el ocioso al cierre).
  const compra = (P, a, C, i, px) => {
    if (!(C > 0)) return
    if (a === 'LIQUIDEZ') { P.h.LIQUIDEZ += C; return }
    const c = costeOrden(a, C), u = (C - c) / (px ?? precio(a, i))
    if (!(u > 0)) return
    P.h[a] += u
    const lote = { u, coste: C / u, fecha: fechas[i], ajuste: 0 }
    lotes[a].push(lote)
    // Recompra dentro de los dos meses DESPUÉS de una venta con pérdida: esa pérdida (por las unidades recompradas) se aplaza.
    if (dosMeses) for (const pe of pendientesDosMeses[a]) {
      if (!(pe.unidades > 1e-12) || fechas[i] > pe.hasta) continue
      const m = Math.min(pe.unidades, lote.u), D = m * pe.porUnidad
      pe.unidades -= m; suma(pe.anio, D); lote.ajuste -= D; diferidas.push({ fecha: pe.fecha, activo: a, euros: D, recompra: fechas[i] })
    }
  }
  // Vende u participaciones de a de la pieza P a la apertura de i: FIFO de la persona; devuelve lo cobrado (tras el coste).
  const vende = (P, a, u, i, px) => {
    if (!(u > 0)) return 0
    if (a === 'LIQUIDEZ') { const x = Math.min(u, P.h.LIQUIDEZ); P.h.LIQUIDEZ -= x; return x }
    u = Math.min(u, P.h[a]); if (!(u > 0)) return 0
    const p = px ?? precio(a, i), X = u * p, c = costeOrden(a, X), anio = fechas[i].slice(0, 4)
    let resto = u, G = -c
    while (resto > 1e-15 && lotes[a].length) {
      const l = lotes[a][0], x = Math.min(resto, l.u), parte = l.u > 0 ? x / l.u : 1
      G += x * (p - l.coste) + l.ajuste * parte
      l.ajuste -= l.ajuste * parte; l.u -= x; resto -= x
      if (l.u <= 1e-15) lotes[a].shift()
    }
    P.h[a] = Math.max(0, P.h[a] - u)
    if (G < 0 && dosMeses) {
      // Recompras en los dos meses ANTERIORES que siguen en cartera: la pérdida de esas unidades pasa a ellas.
      const desde = masMeses(fechas[i], -2), previas = lotes[a].filter(l => l.fecha >= desde && l.fecha < fechas[i] && l.u > 1e-15)
      const uPrev = previas.reduce((s, l) => s + l.u, 0), m = Math.min(u, uPrev), porUnidad = -G / u
      if (m > 0) { const D = m * porUnidad; for (const l of previas) l.ajuste -= D * (l.u / uPrev); G += D; diferidas.push({ fecha: fechas[i], activo: a, euros: D, recompra: 'antes' }) }
      // Lo que quede, a la espera de una recompra en los dos meses siguientes.
      if (u - m > 1e-12) pendientesDosMeses[a].push({ fecha: fechas[i], hasta: masMeses(fechas[i], 2), unidades: u - m, porUnidad, anio })
    }
    suma(anio, G)
    return X - c
  }

  // ── Las piezas ──
  const piezas = plan.piezas.map(x => ({ ...x, h: { ...Object.fromEntries(simbolos.map(a => [a, 0])), LIQUIDEZ: 0 } }))
  // Las piezas estrategia: sus operaciones del periodo (con los precios a los que se ejecutan) y su estado.
  const idx = Object.fromEntries(fechas.map((f, i) => [f, i]))
  for (const P of piezas) if (P.tipo === 'estrategia') {
    const o = operacionesDe(P, datos, fechas[i0], fechas[i1])
    for (const t of o.ops) for (const f of [t.entryDate, t.exitDate]) if (f && (idx[f] == null || idx[f] < i0 || idx[f] > i1)) throw new Error(`Pieza ${P.id}: la operación del ${f} cae fuera de las fechas del plan.`)
    P.ops = o.ops.map(t => ({ ...t, pxEntrada: precioOperacion(P, datos, t.entryDate, t.entryPrice), pxSalida: t.exitDate ? precioOperacion(P, datos, t.exitDate, t.exitPrice) : null, alAbrir: t.exitDate ? salidaAlAbrir(P, datos, t) : null }))
    P.calentamiento = o.calentamiento; P.dentroDe = simboloDentro(P); P.k = 0; P.dentro = false; P.ociosoAlCierre = false; P.franja = []
  }
  for (const P of piezas) if (P.tipo === 'cartera') {
    const vc = velasCondiciones(P.regla, datos)
    if (!vc) throw new Error(`Pieza ${P.id}: faltan las velas de su referencia (${P.regla.referencia}).`)
    P.vCond = vc; P.prep = preparaRegla(P.regla, vc)
    P.estado = P.regla.inicio ? estadoDeInicio(P.regla, P.prep.inicio, i0) : P.regla.inicial
    P.pendiente = null; P.ctx = { maxRef: null, superado: false }; P.ciclo = null; P.calendario = P.regla.transiciones.filter(esCalendario)
    if (P.estado !== P.regla.inicial && P.regla.transiciones.some(t => t.iniciaCiclo && t.hacia === P.estado)) P.ciclo = { maxRef: null }
  }
  const valorPieza = (P, i, campo = 'open') => P.h.LIQUIDEZ + simbolos.reduce((s, a) => s + (P.h[a] > 0 ? P.h[a] * precio(a, i, campo) : 0), 0)
  // Pieza estrategia: todo lo que tiene en liquidez, al ocioso (a la apertura de i, o al cierre con px).
  const aOcioso = (P, i, px) => { if (P.ocioso === 'LIQUIDEZ') return; const C = P.h.LIQUIDEZ; P.h.LIQUIDEZ = 0; compra(P, P.ocioso, C, i, px) }
  // Las entradas y salidas del día i (una salida y una entrada el mismo día, o las dos de una misma operación, en orden).
  const operaEstrategia = (P, i) => {
    for (;;) {
      const t = P.ops[P.k]
      if (!t) break
      if (P.dentro && t.exitDate && idx[t.exitDate] === i) {
        P.h.LIQUIDEZ += vende(P, P.dentroDe, P.h[P.dentroDe], i, t.pxSalida)
        P.dentro = false; P.k++; P.ociosoAlCierre = !t.alAbrir
        if (detalle) operaciones.push({ fecha: fechas[i], pieza: P.id, de: 'dentro', a: 'ocioso', precio: t.exitPrice, motivo: t.exitReason })
        continue
      }
      if (!P.dentro && idx[t.entryDate] === i) {
        if (P.ocioso !== 'LIQUIDEZ') P.h.LIQUIDEZ += vende(P, P.ocioso, P.h[P.ocioso], i)
        const C = P.h.LIQUIDEZ; P.h.LIQUIDEZ = 0
        compra(P, P.dentroDe, C, i, t.pxEntrada)
        P.dentro = true; P.ociosoAlCierre = false; P.entradaHoy = { i, px: t.pxEntrada }
        if (detalle) operaciones.push({ fecha: fechas[i], pieza: P.id, de: 'ocioso', a: 'dentro', precio: t.entryPrice })
        continue
      }
      break
    }
    if (!P.dentro && P.h.LIQUIDEZ > 0 && !P.ociosoAlCierre && P.k > 0 && idx[P.ops[P.k - 1].exitDate] === i) aOcioso(P, i)
  }
  // Dinero nuevo dentro de una pieza.
  const invierte = (P, C, i) => {
    if (!(C > 0)) return
    if (P.tipo === 'activo') return compra(P, P.activo, C, i)
    if (P.tipo === 'estrategia') {
      // El dinero que llega el día de una entrada entra con esa compra (p. ej., el capital inicial si la primera entra el primer día).
      if (P.dentro && P.entradaHoy?.i === i) return compra(P, P.dentroDe, C, i, P.entradaHoy.px)
      if (P.dentro && P.aportacionDentro === 'compra') return compra(P, P.dentroDe, C, i)
      if (P.ociosoAlCierre) { P.h.LIQUIDEZ += C; return }   // ha salido hoy dentro de la vela: todo al ocioso al cierre
      return compra(P, P.ocioso, C, i)
    }
    const pesos = P.regla.estados[P.estado]?.pesos
    let ws = pesos
    if (!ws) { const v = valorPieza(P, i); ws = v > 0 ? Object.fromEntries(['QQQ', 'ETF', 'LIQUIDEZ'].map(a => [a, (a === 'LIQUIDEZ' ? P.h.LIQUIDEZ : P.h[a] * precio(a, i)) / v])) : { QQQ: 1 } }
    for (const a of ['QQQ', 'ETF', 'LIQUIDEZ']) if (ws[a] > 0) compra(P, a, C * ws[a], i)
  }
  // La máquina de estados de una pieza (lo mismo que simula de lib/laboratorioCartera.js, con el dinero de la pieza).
  const aPesos = (P, pesos, i) => {
    const val = (a) => a === 'LIQUIDEZ' ? P.h.LIQUIDEZ : P.h[a] * precio(a, i)
    const total = val('QQQ') + val('ETF') + val('LIQUIDEZ'), objetivo = (a) => (pesos[a] || 0) * total
    let caja = 0, hubo = false
    for (const a of ['QQQ', 'ETF', 'LIQUIDEZ']) { const sobra = val(a) - objetivo(a); if (sobra > 1e-12 * total) { caja += vende(P, a, a === 'LIQUIDEZ' ? sobra : sobra / precio(a, i), i); hubo = true } }
    for (const a of ['QQQ', 'ETF', 'LIQUIDEZ']) { const falta = objetivo(a) - val(a); if (falta > 1e-12 * total && caja > 0) { const x = Math.min(falta, caja); compra(P, a, x, i); caja -= x } }
    if (caja > 0) P.h.LIQUIDEZ += caja
    return hubo
  }
  const ejecuta = (P, k, i) => {
    const tr = P.regla.transiciones[k], val = (a) => a === 'LIQUIDEZ' ? P.h.LIQUIDEZ : P.h[a] * precio(a, i)
    const total = val('QQQ') + val('ETF') + val('LIQUIDEZ')
    for (const m of tr.hacer) {
      const importe = Math.min(m.todo ? val(m.mover) : m.fraccionCartera * total, val(m.mover))
      if (!(importe > 0)) continue
      const cobrado = vende(P, m.mover, m.mover === 'LIQUIDEZ' ? importe : importe / precio(m.mover, i), i)
      compra(P, m.a, cobrado, i)
    }
    if (tr.rebalancea && !esCalendario(tr)) aPesos(P, P.regla.estados[tr.hacia].pesos, i)
    if (detalle) operaciones.push({ fecha: fechas[i], pieza: P.id, de: P.estado, a: tr.hacia })
    if (tr.iniciaCiclo) { P.ciclo = { maxRef: P.pendiente?.maxRef ?? null }; P.ctx = { maxRef: P.ciclo.maxRef, superado: false } }
    P.estado = tr.hacia
    if (tr.terminaCiclo && P.ciclo) { P.ciclo = null; P.ctx = { maxRef: null, superado: false } }
  }

  // ── Impuestos de la persona ──
  const fiscal = { perdidas: [], porAnio: [], pagado: 0, pagados: new Set() }
  const liquida = (anio, G, pagoEl) => {
    const y = Number(anio), quedan = fiscal.perdidas.filter(p => p.anio >= y - AÑOS_COMPENSACION && p.resto > 1e-9).map(p => ({ ...p }))
    let compensado = 0, base = 0, impuesto = 0
    if (G > 0) { for (const p of quedan) { if (compensado >= G) break; const x = Math.min(p.resto, G - compensado); p.resto -= x; compensado += x } base = G - compensado; impuesto = calcImpuestoTramos(base) }
    else if (G < 0) quedan.push({ anio: y, resto: -G })
    fiscal.perdidas = quedan.filter(p => p.resto > 1e-9)
    fiscal.porAnio.push({ anio, plusvalia: G, compensado, base, impuesto, pagadoEl: pagoEl })
    fiscal.pagados.add(anio)
    return impuesto
  }
  const pagaImpuesto = (T, i) => {
    if (!(T > 0)) return
    let resto = T
    const liq = piezas.reduce((s, P) => s + P.h.LIQUIDEZ, 0)
    if (liq > 0) { const f = Math.min(1, resto / liq); for (const P of piezas) { const x = P.h.LIQUIDEZ * f; P.h.LIQUIDEZ -= x; resto -= x } }
    // Lo que falte, vendiendo a prorrata del valor (algo más si hay costes, para que lo cobrado lo cubra).
    for (let intento = 0; intento < 5 && resto > 1e-9; intento++) {
      const tot = piezas.reduce((s, P) => s + simbolos.reduce((t, a) => t + P.h[a] * (precio(a, i) || 0), 0), 0)
      if (!(tot > 0)) break
      const f = Math.min(1, resto / tot * (cst ? 1.01 : 1))
      let cobrado = 0
      for (const P of piezas) for (const a of simbolos) if (P.h[a] > 0) cobrado += vende(P, a, P.h[a] * f, i)
      const usa = Math.min(cobrado, resto); resto -= usa
      if (cobrado > usa) { const sobra = cobrado - usa, liqTot = piezas.length; for (const P of piezas) P.h.LIQUIDEZ += sobra / liqTot }
    }
    fiscal.pagado += T - Math.max(0, resto)
  }

  // ── Aportaciones y reparto ──
  const ap = plan.dinero.aportaciones || { frecuencia: 'ninguna' }, crec = (ap.crecimientoAnual || 0) / 100
  const extra = [...(plan.dinero.extraordinarias || [])].sort((a, b) => a.fecha < b.fecha ? -1 : 1), usadas = new Set()
  const importeDelDia = (i) => {
    let A = 0
    if (i === i0) A += plan.dinero.capitalInicial || 0
    else if (ap.frecuencia !== 'ninguna' && cambiaPeriodo(fechas[i - 1], fechas[i], ap.frecuencia)) A += ap.importe * Math.pow(1 + crec, Number(fechas[i].slice(0, 4)) - Number(fechas[i0].slice(0, 4)))
    extra.forEach((x, k) => { if (!usadas.has(k) && x.fecha <= fechas[i]) { A += x.importe; usadas.add(k) } })
    return A
  }
  const reparte = (A, i) => {
    const V = piezas.map(P => valorPieza(P, i)), T = V.reduce((s, x) => s + x, 0) + A
    if (plan.reparto.aportacionesA === 'pesos') { piezas.forEach(P => invierte(P, A * P.peso, i)); return }
    const def = piezas.map((P, k) => Math.max(0, P.peso * T - V[k])), D = def.reduce((s, x) => s + x, 0)
    piezas.forEach((P, k) => invierte(P, D > A ? A * def[k] / D : def[k] + (A - D) * P.peso, i))
  }
  const rebalanceaPiezas = (i) => {
    const V = piezas.map(P => valorPieza(P, i)), T = V.reduce((s, x) => s + x, 0)
    if (!(T > 0)) return false
    let caja = 0
    piezas.forEach((P, k) => { const sobra = V[k] - P.peso * T; if (sobra > 1e-9 * T && V[k] > 0) { const f = sobra / V[k]; for (const a of [...simbolos, 'LIQUIDEZ']) if (P.h[a] > 0) caja += vende(P, a, P.h[a] * f, i) } })
    const V2 = piezas.map(P => valorPieza(P, i)), def = piezas.map((P, k) => Math.max(0, P.peso * T - V2[k])), D = def.reduce((s, x) => s + x, 0)
    if (D > 0) piezas.forEach((P, k) => invierte(P, caja * def[k] / D, i))
    else piezas.forEach(P => { P.h.LIQUIDEZ += caja * P.peso })
    return true
  }

  // ── El bucle ──
  const serie = [], flujos = [], operaciones = []
  let participaciones = 0, aportado = 0, rebalanceosPiezas = 0, bandaRota = false
  const rb = plan.reparto.rebalanceo || { calendario: 'nunca' }
  for (let i = i0; i <= i1; i++) {
    // 1. Impuesto del año anterior, el primer día de bolsa de julio.
    if (conImpuestos && i > i0 && fechas[i].slice(5, 7) === MES_PAGO_IMPUESTO && fechas[i - 1].slice(5, 7) !== MES_PAGO_IMPUESTO) {
      const y = String(Number(fechas[i].slice(0, 4)) - 1)
      if (y >= fechas[i0].slice(0, 4) && !fiscal.pagados.has(y)) pagaImpuesto(liquida(y, ganancias[y] || 0, fechas[i]), i)
    }
    // 2. Las piezas de cartera: la transición de la víspera y sus rebalanceos de calendario. Las piezas estrategia: sus entradas y
    //    salidas del día.
    for (const P of piezas) if (P.tipo === 'cartera') {
      if (P.pendiente) { ejecuta(P, P.pendiente.k, i); P.pendiente = null }
      if (i > i0) for (const tr of P.calendario) if ((tr.desde === P.estado || tr.desde === '*') && cambiaPeriodo(fechas[i - 1], fechas[i], tr.calendario)) { if (aPesos(P, P.regla.estados[tr.hacia].pesos, i) && detalle) operaciones.push({ fecha: fechas[i], pieza: P.id, de: P.estado, a: tr.hacia, rebalanceo: true }); P.estado = tr.hacia; break }
    } else if (P.tipo === 'estrategia') operaEstrategia(P, i)
    // 3. Aportaciones: participaciones al VL de la apertura (antes de entrar el dinero).
    const A = importeDelDia(i)
    if (A > 0) {
      const patAntes = piezas.reduce((s, P) => s + valorPieza(P, i), 0)
      const vlAntes = participaciones > 0 ? patAntes / participaciones : 1
      participaciones += A / vlAntes; aportado += A
      flujos.push({ fecha: fechas[i], importe: -A })
      reparte(A, i)
    }
    // 4. Rebalanceo entre piezas (calendario o banda de la víspera).
    if (piezas.length > 1 && i > i0 && ((rb.calendario !== 'nunca' && cambiaPeriodo(fechas[i - 1], fechas[i], rb.calendario)) || bandaRota)) { if (rebalanceaPiezas(i)) rebalanceosPiezas++ }
    bandaRota = false
    // 5. Al cierre (antes, el ocioso de una pieza estrategia que ha salido hoy dentro de la vela, a su cierre).
    for (const P of EST.length ? piezas : []) if (P.tipo === 'estrategia' && P.ociosoAlCierre) { aOcioso(P, i, precio(P.ocioso, i, 'close')); P.ociosoAlCierre = false }
    const pat = piezas.reduce((s, P) => s + valorPieza(P, i, 'close'), 0)
    serie.push({ date: fechas[i], vl: participaciones > 0 ? pat / participaciones : 1, patrimonio: pat, aportado, aportadoHoy: A, ...(detalle ? { piezas: Object.fromEntries(piezas.map(P => [P.id, valorPieza(P, i, 'close')])) } : {}) })
    for (const P of EST.length ? piezas : []) if (P.tipo === 'estrategia') P.franja.push(P.dentro ? 1 : 0)
    if (rb.banda != null && piezas.length > 1 && pat > 0) bandaRota = piezas.some(P => Math.abs(valorPieza(P, i, 'close') / pat - P.peso) > rb.banda)
    for (const P of piezas) if (P.tipo === 'cartera') {
      if (P.ciclo && P.ctx.maxRef != null && P.vCond[i].close > P.ctx.maxRef) P.ctx.superado = true
      if (i < i1) for (let k = 0; k < P.regla.transiciones.length; k++) {
        const tr = P.regla.transiciones[k]
        if (tr.desde !== P.estado || esCalendario(tr)) continue
        if (P.prep[k].every(({ s, pr }) => CONDICIONES[s.c].evalua(pr, i, P.ctx))) {
          const cMax = P.prep[k].find(x => CONDICIONES[x.s.c].maxRef)
          P.pendiente = { k, maxRef: tr.fijaMaxRef && cMax ? CONDICIONES[cMax.s.c].maxRef(cMax.pr, i) : null }
          break
        }
      }
    }
  }

  // ── Al final: se liquida todo al último cierre (costes de la venta e impuestos pendientes) ──
  const ult = serie[serie.length - 1]
  let costeVentaFinal = 0, latente = 0, impuestoFinal = 0
  for (const a of simbolos) {
    const pc = precio(a, i1, 'close'), u = piezas.reduce((s, P) => s + P.h[a], 0)
    if (!(u > 0)) continue
    const X = u * pc
    if (cst) costeVentaFinal += (cst.com > 0 || cst.min > 0 ? Math.max(cst.com * X, cst.min) : 0) + X * cst.h[a]
    for (const l of lotes[a]) latente += l.u * (pc - l.coste) + l.ajuste
  }
  if (conImpuestos) {
    const yFin = fechas[i1].slice(0, 4), yIni = Number(fechas[i0].slice(0, 4))
    for (let y = yIni; y < Number(yFin); y++) if (!fiscal.pagados.has(String(y))) impuestoFinal += liquida(String(y), ganancias[String(y)] || 0, 'al final (pendiente)')
    impuestoFinal += liquida(yFin, (ganancias[yFin] || 0) + latente - costeVentaFinal, 'al final (venta de todo)')
  }
  const valorNeto = Math.max(0, ult.patrimonio - costeVentaFinal - impuestoFinal)
  return { serie, flujos, valorNeto, aportado, patrimonio: ult.patrimonio, costes: { pagados: costesPagados + costeVentaFinal, ordenes, ventaFinal: costeVentaFinal },
    impuestos: conImpuestos ? { porAnio: fiscal.porAnio, pagados: fiscal.pagado + impuestoFinal, final: impuestoFinal, perdidasPendientes: fiscal.perdidas, dosMeses: diferidas } : null,
    operaciones: detalle ? operaciones : null, rebalanceosPiezas, i0, i1, ...(EST.length ? { estrategias: estrategiasDe(piezas, datos, serieDe, idx, i0, i1, detalle) } : {}) }
}
// Lo que devuelve cada pieza estrategia: sus operaciones del periodo, la franja diaria «dentro» (1) / «en el ocioso» (0) al cierre y,
// con detalle, la curva de la estrategia sola y los cierres del ocioso en las mismas fechas (para lib/planes/descorrelacion.js).
function estrategiasDe(piezas, datos, serieDe, idx, i0, i1, detalle) {
  return Object.fromEntries(piezas.filter(P => P.tipo === 'estrategia').map(P => [P.id, {
    activo: P.activo, simbolo: P.dentroDe, ocioso: P.ocioso, apalancamiento: apalancamientoDe(P), aportacionDentro: P.aportacionDentro || 'espera',
    calentamiento: P.calentamiento, operaciones: P.ops.map(t => ({ entryDate: t.entryDate, entryPrice: t.entryPrice, exitDate: t.exitDate, exitPrice: t.exitPrice, exitReason: t.exitReason })),
    dentro: P.franja,
    ...(detalle ? { curva: curvaSola(P.ops, serieDe[P.dentroDe], idx, i0, i1), cierresOcioso: P.ocioso === 'LIQUIDEZ' ? null : serieDe[P.ocioso].slice(i0, i1 + 1).map(v => v?.close ?? null) } : {}),
  }]))
}
