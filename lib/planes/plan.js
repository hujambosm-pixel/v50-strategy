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
import { comparadorCandidatos, techoConcentrado, capitalCompartido } from '../asignaCartera'
import { validaPiezaPesos, simbolosPesos, objetivoDe, repartoAportacion, ordenesVolver, fueraDeBanda, FRECUENCIA_VOLVER, MAX_COSTE_ORDEN_PESOS, simbolosAcciones, simbolosFilas, serieFilas, maximoHasta, cierreEn } from './pesos'
// PIEZA «PESOS» (§193; lib/planes/pesos.js): un reparto entre símbolos (y la liquidez del bloque). El dinero que le llega se compra en ese
// momento (según los pesos de ahora, los de partida, al más atrasado o a su liquidez); «volver a los pesos» el primer día de cada mes,
// trimestre o año, o a la apertura siguiente a un cierre en que algún peso se ha separado más de N puntos. Regla del 1 %: una orden cuya
// comisión pasa del 1 % no se hace y su dinero espera en el bloque para ESE símbolo (P.espera) y se suma a su siguiente compra (o se reparte al volver a los pesos). De
// momento va sola en el plan (sin reglas; con estrategias, más adelante).

export const FORMATO_PLAN = 1
export const CALCULO_PLAN = 1
export const ACTIVOS = ['QQQ', 'ETF', 'SPY']
export const AÑOS_COMPENSACION = 4
export const MES_PAGO_IMPUESTO = '07'
export const AVISO_LISTA_SIN_MOTOR = 'Con una lista, «Tu dinero» todavía no se calcula: llegará más adelante. Mientras, «La cartera por dentro».'
// ── «Una lista» en «Tu dinero» (fase 6 de «el plan con lista», docs/builder.md §89) ──
// La pieza estrategia con donde: 'lista' toma del Backtesting solo las DECISIONES (los candidatos de cada valor con su puntuación y si
// pasan la puerta, de /api/multibacktest con conCandidatos; el orden, comparadorCandidatos; el capital de cada entrada, techoConcentrado
// y capitalCompartido de lib/asignaCartera.js) y pone el dinero con la lógica del plan (compras y ventas reales, comisión por orden,
// lotes, venta final). De momento, sin apalancar y solo «Capital compartido» o «Capital concentrado». Sin aportaciones, sin impuestos y
// con el ocioso en liquidez acaba con EXACTAMENTE el dinero de «La cartera por dentro» (la prueba de oro, plan-tu-dinero-lista.js).
// §91 (fase 7): las aportaciones y el dinero que sale de una venta esperan en el ocioso hasta la siguiente compra (decisión de Sergi,
// 07/11): lo que queda en la liquidez de la pieza al cierre del día pasa al ocioso a ese cierre (salvo el último día, y salvo que la
// orden cueste más del 1 % de lo que se mueve); para comprar, se vende del ocioso a la apertura SOLO lo que falta. El capital de cada
// entrada se calcula con el dinero libre = liquidez + lo que vale el ocioso a la apertura.
export const MODOS_LISTA_PLAN = ['compartido', 'concentrado']
export const AVISO_LISTA_OCIOSO_EN_LISTA = 'Con una lista, el dinero ocioso no puede ser uno de los valores de la lista: elige otro.'
const MAX_COSTE_OCIOSO = 0.01   // §91: no se mueve al ocioso un importe si la orden cuesta más del 1 % de él
export const AVISO_LISTA_MODO = 'Con una lista, «Tu dinero» de momento solo se calcula con «Capital compartido» o «Capital concentrado»: los demás repartos llegarán más adelante. Mientras, «La cartera por dentro».'
export const AVISO_LISTA_SIMPLE = 'Con una lista, «Tu dinero» de momento se calcula sin apalancar.'
const piezaLista = (plan) => (plan?.piezas || []).find(x => x.tipo === 'estrategia' && x.donde === 'lista') || null
// ── VARIOS BLOQUES (docs/builder.md §185; decisiones de Sergi del 15/11 y 17/11) ──
// Con DOS o más piezas «estrategia» (los bloques) el plan es UNA SOLA CUENTA: el dinero libre (aportaciones y lo que sale de cada venta)
// y el dinero ocioso son de la cuenta (la pieza interna «cuenta», con el ocioso del plan: el mismo en todos los bloques), y cada bloque
// solo tiene sus posiciones. Cada día: 1) salen las posiciones de cada bloque y su dinero vuelve a la cuenta; 2) entran las aportaciones
// en la cuenta; 3) entran las compras del día, primero las del bloque MÁS ATRASADO respecto a su % (peso − su valor ÷ patrimonio, a la
// apertura); cada compra se paga con la liquidez de la cuenta y, si falta, vendiendo del ocioso solo lo necesario; 4) al cierre, lo que
// queda en la liquidez de la cuenta pasa al ocioso (la regla del 1 %, como con una lista).
//   · reparto.dineroLibre: 'tope' (por defecto) = ningún bloque compra por encima de su % del patrimonio de ese día (peso × patrimonio a la
//     apertura − lo que ya vale el bloque); 'prioridad' = sin tope (solo el orden del más atrasado).
//   · Dentro de un bloque con lista, el reparto entre sus valores calcula con el PRESUPUESTO del bloque (con tope: peso × patrimonio; ej.
//     11.000 € y 60 % → 6.600 €; «concentrado, máx. 4» → hasta 1.650 € por valor); un bloque de un valor compra lo que le deja su tope.
//   · Nunca se vende para volver al reparto (reparto.rebalanceo: 'nunca'); sin apalancar y sin «compra más acción» (de momento).
//   · Los impuestos son de la cuenta: lotes FIFO y regla de los dos meses por valor (un valor en dos bloques comparte sus lotes); el de
//     julio sale de la liquidez de la cuenta, luego del ocioso y, si no basta, de las posiciones de todos los bloques a prorrata.
//   · §196: un bloque «Con pesos» (sin señales) coge lo que le falta para su % (peso × patrimonio a la apertura − lo que vale) SOLO del
//     DINERO NUEVO que entra en la cuenta ese día (aportaciones y lo que sale de las ventas de los otros bloques; lo de una venta a mitad
//     de sesión cuenta como nuevo al día siguiente), en su turno del «más atrasado primero» y siempre con su tope (también con «solo
//     prioridad»). Así no hace órdenes cada día por diferencias pequeñas y el dinero que ya espera en el ocioso queda para las señales.
//     Su liquidez (la de su peso y la que espera por la regla del 1 %) es suya, no de la cuenta; sus reglas y «volver a los pesos», igual.
// Con UNA sola pieza «estrategia», nada de esto: el cálculo de siempre.
// §196: un bloque «Con pesos» también cuenta como bloque (y nada más: con piezas de activo o de cartera no hay bloques).
export const esBloque = (x) => x?.tipo === 'estrategia' || x?.tipo === 'pesos'
export const esBloques = (plan) => (plan?.piezas || []).filter(esBloque).length > 1
export const DINERO_LIBRE = ['tope', 'prioridad']
// La lista (los candidatos del Backtesting) de una pieza: con varios bloques, datos.listas[id]; con una, datos.lista.
const listaDe = (datos, P) => datos.listas?.[P.id] || datos.lista
// Por qué no se puede calcular este plan con lista (null si se puede, o si no tiene lista).
// §112: con el Nasdaq-100 (universo dinámico) también se calcula; sus valores no son los marcados sino los del universo en el periodo
// (simbolosLista: los de la petición o los de los candidatos). Sin ellos, el ocioso solo se compara con los marcados de «Lista manual».
const esUniversoDinamico = (P) => !!P?.lista?.universo && P.lista.universo !== 'manual'
// §185: con varios bloques, `pieza` dice de qué bloque con lista (por defecto, el primero).
export function motivoListaNoCalculable(plan, simbolosLista = null, pieza = null) {
  const P = pieza || piezaLista(plan)
  if (!P) return null
  if (!MODOS_LISTA_PLAN.includes(P.lista?.modo)) return AVISO_LISTA_MODO
  if ((simbolosLista || (esUniversoDinamico(P) ? [] : P.lista?.simbolos) || []).includes(P.ocioso)) return AVISO_LISTA_OCIOSO_EN_LISTA
  if ((plan.piezas.length !== 1 && !esBloques(plan)) || apalancamientoDe(P) !== 1) return AVISO_LISTA_SIMPLE   // §92: los impuestos ya cuentan
  return null
}
// El plan que se calcula hoy con lista: el mismo, sin apalancar (§91: las aportaciones y el ocioso ya cuentan; §92: los impuestos también).
// Devuelve { plan, ignorado } con lo que se ha dejado fuera de lo que puso la persona ('apalancamiento').
export function planListaCalculable(plan) {
  const P = piezaLista(plan)
  if (!P) return { plan, ignorado: [] }
  const ignorado = []
  if (apalancamientoDe(P) !== 1) ignorado.push('apalancamiento')
  return { ignorado, plan: { ...plan,
    piezas: plan.piezas.map(x => x === P ? { ...x, apalancamiento: 1 } : x) } }
}
// Las velas de un valor de la lista (las de los candidatos: fechas, aperturas y cierres) en las fechas del plan. Un día sin vela de ese
// valor, su último cierre (para valorar lo que se tenga; ese día no hay operaciones suyas).
function serieLista(activo, fechas) {
  const m = new Map(activo.fechas.map((f, k) => [f, k]))
  let ult = null
  return fechas.map(f => { const k = m.get(f); if (k != null && activo.cierra[k] != null) { ult = activo.cierra[k]; return { open: activo.abre[k] ?? ult, close: ult } } return ult == null ? null : { open: ult, close: ult } })
}
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
      else if (x?.tipo === 'pesos') e.push(...validaPiezaPesos(x).map(y => `${dd}: ${y}`))   // §193
      else e.push(`${dd}: el tipo tiene que ser «cartera», «activo», «estrategia» o «pesos».`)
    }
    if (ps.some(x => x?.tipo === 'pesos') && ps.some(x => !esBloque(x))) e.push('Un bloque «Con pesos» solo puede ir con otros bloques (de estrategia o con pesos).')   // §193, §196
    if (esBloques(p)) {   // §185: varios bloques
      if (ps.some(x => !esBloque(x))) e.push('Con varios bloques, todos tienen que ser de estrategia o con pesos.')
      if (ps.some(x => x?.id === 'cuenta')) e.push('Con varios bloques, ningún bloque se puede llamar «cuenta».')
      const es = ps.filter(x => x?.tipo === 'estrategia'), ocio = es[0]?.ocioso
      if (new Set(es.map(x => x?.ocioso)).size > 1) e.push('Con varios bloques, el dinero ocioso es de la cuenta: el mismo en todos.')
      else if (es.some(x => x?.donde !== 'lista' && x?.activo === ocio)) e.push('Con varios bloques, el dinero ocioso no puede ser el valor de un bloque.')
      else if (ocio && ocio !== 'LIQUIDEZ' && ps.some(x => x?.tipo === 'pesos' && [...simbolosPesos(x), ...simbolosAcciones(x)].includes(ocio))) e.push(`Con varios bloques, el dinero ocioso (${ocio}) no puede estar en un bloque «Con pesos».`)   // §196
      if (es.some(x => apalancamientoDe(x) !== 1)) e.push('Con varios bloques, de momento sin apalancar.')
      if (es.some(x => x?.aportacionDentro === 'compra')) e.push('Con varios bloques, de momento sin «compra más acción».')
      const rb0 = p.reparto?.rebalanceo || {}
      if (rb0.calendario !== 'nunca' || rb0.banda != null) e.push('Con varios bloques, de momento no se vende para volver al reparto («nunca»).')
      if (p.reparto?.dineroLibre != null && !DINERO_LIBRE.includes(p.reparto.dineroLibre)) e.push('El dinero libre entre bloques: «tope» o «prioridad».')
    }
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
// EL LIBRO (docs/builder.md §155; opción `libro`, apagada por defecto: sin ella la salida es exactamente la de siempre). Solo APUNTA lo
// que el motor ya hace; no cambia ningún cálculo. Devuelve en `libro`:
//   · movimientos: cada compra y venta ({ fecha, tipo: 'compra' | 'venta', pieza, simbolo, rol, unidades, precio, importe (lo que valen
//     las participaciones: sin la comisión), coste }), cada aportación, cada pago de impuestos y, el último día, la venta de todo
//     ('ventaFinal', una por símbolo) y el impuesto final ('impuestoFinal'), en el orden en que pasan;
//   · porSimbolo: { símbolo: { rol, compras, ventas, costes, valorFinal, ganado = ventas + valorFinal − compras } }, antes de comisiones;
//   · operaciones: cada posición de un valor de la estrategia, desde que se abre hasta que se queda a cero ({ pieza, simbolo, entryDate,
//     entryPrice, exitDate, exitPrice, compras, ventas, costes, unidades, resultado = ventas − compras, abierta? }); la que sigue abierta
//     el último día se cierra en la venta final (abierta: true). Una posición puede tener varias compras (aportaciones) y ventas
//     (el impuesto de julio): aquí van sus totales;
//   · reparto: por día de la serie, al cierre, { valores, ocioso, liquidez, otros } en euros (suman el patrimonio);
//   · curvas (§156): { símbolo: [lo ganado con él hasta el cierre de cada día de la serie] } de los valores y del ocioso (lo cobrado − lo
//     comprado + lo que vale lo que se tiene; antes de comisiones); el último día es su `ganado` de porSimbolo;
//   · senales (§163, solo con lista): { generadas, ejecutadas, motivos: { yaDentro, slots, filtro, dinero }, descartadas: [{ simbolo, entryDate,
//     exitDate, motivo, ret, cap, hipotetico }], porSimbolo: { símbolo: { generadas, ejecutadas } } }: cada candidato del Backtesting que llega
//     a su día, y qué le pasó con el dinero de ESTE plan;
//   · enValor (§162): { símbolo: [lo que vale lo que se tiene de él al cierre de cada día] }, de los mismos símbolos que curvas;
//   · puente: { aportado, ganadoValores, ganadoOcioso, ganadoOtros, costes, impuestos, valorNeto, descuadre }: aportado + lo ganado −
//     costes − impuestos = valorNeto (descuadre: lo que falta para cuadrar; 0 salvo redondeo).
// rol de un símbolo en una pieza: 'valor' (el de la estrategia o los de su lista), 'ocioso' (el dinero ocioso de una pieza estrategia) u
// 'otro' (piezas de activo, de cartera y la cesta). Si el ocioso es el mismo símbolo que el valor, cuenta como 'valor'.
export function ejecutaPlan(plan, datos, { detalle = true, libro = false } = {}) {
  const { fechas } = datos
  // §89: con «Una lista», solo lo que ya sabe calcular (motivoListaNoCalculable) y con los candidatos del Backtesting (datos.lista).
  const BLOQ = esBloques(plan)   // §185
  if (BLOQ) {
    for (const x of plan.piezas) if (x.donde === 'lista') {
      const L = listaDe(datos, x)
      if (!L?.activos) throw new Error(`Faltan los candidatos de la lista del bloque ${x.id} (los de /api/multibacktest).`)
      const motivo = motivoListaNoCalculable(plan, L.activos.map(ac => ac.symbol), x); if (motivo) throw new Error(motivo)
    }
  } else {
    { const motivo = motivoListaNoCalculable(plan, datos.lista?.activos ? datos.lista.activos.map(ac => ac.symbol) : null); if (motivo) throw new Error(motivo) }
    if ((piezaLista(plan) || plan.piezas.some(x => x.tipo === 'cesta')) && !datos.lista?.activos) throw new Error('Faltan los candidatos de la lista (los de /api/multibacktest).')
  }
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
  for (const x of EST) {
    // Con lista, los valores de la lista con las velas de sus candidatos, en su orden; sin lista, el valor de la estrategia.
    if (x.donde === 'lista') { for (const ac of listaDe(datos, x).activos) if (!simbolos.includes(ac.symbol)) { simbolos.push(ac.symbol); serieDe[ac.symbol] = serieLista(ac, fechas) } }
    else anade(simboloDentro(x))
    anade(x.ocioso)
  }
  for (const x of plan.piezas) if (x.tipo === 'activo') anade(x.activo)
  // §193: los símbolos de un bloque «Con pesos» (QQQ y SPY, los del plan); todos tienen que tener precio el primer día.
  for (const x of plan.piezas) if (x.tipo === 'pesos') for (const s of simbolosPesos(x)) {
    anade(s)
    if (!(serieDe[s]?.[i0]?.open > 0)) throw new Error(`${s} no tiene precios al empezar el plan (${fechas[i0]}).`)
  }
  // §194: los de sus reglas (los que puede llegar a comprar, sin exigir precio el primer día) y las velas de lo que miran sus condiciones.
  for (const x of plan.piezas) if (x.tipo === 'pesos') {
    for (const s of simbolosAcciones(x)) anade(s)
    for (const s of simbolosFilas(x)) if (!datos.velas?.[s]?.length) throw new Error(`Faltan las velas de ${s} (lo mira una regla del bloque).`)
  }
  // §95: la pieza «cesta» (solo en la referencia «Buy&Hold de la lista»): los valores de la lista, con las mismas velas que la pieza con lista.
  const cesta = plan.piezas.some(x => x.tipo === 'cesta') ? datos.lista.activos.map(ac => ac.symbol) : []
  if (cesta.length) for (const ac of datos.lista.activos) if (!simbolos.includes(ac.symbol)) { simbolos.push(ac.symbol); serieDe[ac.symbol] = serieLista(ac, fechas) }
  const precio = (a, i, campo = 'open') => a === 'LIQUIDEZ' ? 1 : serieDe[a][i]?.[campo]
  const conImpuestos = plan.impuestos?.regimen === 'ES-ahorro', dosMeses = conImpuestos && plan.impuestos?.reglaDosMeses !== false
  const cst = plan.costes ? { com: plan.costes.comisionPct / 100, min: plan.costes.comisionMinEur, h: Object.fromEntries(simbolos.map(a => [a, (plan.costes.horquillaPct?.[a] ?? 0) / 100])) } : null
  let costesPagados = 0, ordenes = 0
  const costeOrden = (a, X) => { if (a === 'LIQUIDEZ' || !(X > 0)) return 0; ordenes++; if (!cst) return 0; const c = (cst.com > 0 || cst.min > 0 ? Math.max(cst.com * X, cst.min) : 0) + X * cst.h[a]; costesPagados += c; return c }

  // ── Lotes de la persona, ganancias por año y la regla de los dos meses ──
  const lotes = Object.fromEntries(simbolos.map(a => [a, []])), ganancias = {}, pendientesDosMeses = Object.fromEntries(simbolos.map(a => [a, []])), diferidas = []
  const suma = (anio, x) => { ganancias[anio] = (ganancias[anio] || 0) + x }
  // §155: el libro (solo si se pide). rolDe: qué es el símbolo a en la pieza P. Las posiciones abiertas de los valores, por pieza y símbolo.
  const LB = libro ? { movimientos: [], porSimbolo: {}, operaciones: [], abiertas: new Map(), reparto: [], curvas: {}, enValor: {}, senales: { generadas: 0, ejecutadas: 0, motivos: { yaDentro: 0, slots: 0, filtro: 0, dinero: 0 }, descartadas: [], porSimbolo: {} } } : null
  // §185: con varios bloques, lo de cada bloque: { compras, ventas, costes, valorFinal, ganado } (antes de comisiones, como porSimbolo) y
  // su curva (lo ganado con él hasta el cierre de cada día).
  if (LB && BLOQ) { const BQ = plan.piezas.filter(esBloque); LB.porBloque = Object.fromEntries(BQ.map(x => [x.id, { compras: 0, ventas: 0, costes: 0, valorFinal: 0, ganado: 0 }])); LB.curvasBloque = Object.fromEntries(BQ.map(x => [x.id, []])) }   // §196: también los «Con pesos»
  const rolDe = (P, a) => P.tipo === 'cuenta' ? (a === P.ocioso ? 'ocioso' : 'otro') : P.tipo === 'pesos' ? 'valor' : P.tipo !== 'estrategia' ? 'otro' : (P.donde === 'lista' ? P.simbolosLista.has(a) : a === P.dentroDe) ? 'valor' : a === P.ocioso ? 'ocioso' : 'otro'
  const apunta = (tipo, P, a, i, u, p, importe, c) => {
    const rol = rolDe(P, a), S = LB.porSimbolo[a] || (LB.porSimbolo[a] = { rol, compras: 0, ventas: 0, costes: 0, valorFinal: 0, ganado: 0 })
    if (rol === 'valor') S.rol = 'valor'
    S[tipo === 'compra' ? 'compras' : 'ventas'] += importe; S.costes += c
    LB.movimientos.push({ fecha: fechas[i], tipo, pieza: P.id, simbolo: a, rol, unidades: u, precio: p, importe, coste: c })
    if (rol !== 'valor') return
    if (BLOQ) { const B = LB.porBloque[P.id]; B[tipo === 'compra' ? 'compras' : 'ventas'] += importe; B.costes += c }   // §185
    const k = `${P.id}|${a}`
    let op = LB.abiertas.get(k)
    if (!op) { if (tipo !== 'compra') return; op = { pieza: P.id, simbolo: a, entryDate: fechas[i], entryPrice: p, exitDate: null, exitPrice: null, compras: 0, ventas: 0, costes: 0, unidades: 0 }; LB.abiertas.set(k, op) }
    op.costes += c
    if (tipo === 'compra') { op.compras += importe; op.unidades += u }
    else { op.ventas += importe; if (!(P.h[a] > 1e-12)) { op.exitDate = fechas[i]; op.exitPrice = p; op.resultado = op.ventas - op.compras; LB.operaciones.push(op); LB.abiertas.delete(k) } }
  }
  // px: el precio de la orden si no es la apertura de i (las entradas y salidas de una pieza estrategia, el ocioso al cierre).
  const compra = (P, a, C, i, px) => {
    if (!(C > 0)) return
    if (a === 'LIQUIDEZ') { P.h.LIQUIDEZ += C; return }
    const c = costeOrden(a, C), u = (C - c) / (px ?? precio(a, i))
    if (!(u > 0)) { if (LB) apunta('compra', P, a, i, 0, px ?? precio(a, i) ?? null, C - c, c); return }   // §155: dinero que no llega a comprar nada (el motor lo pierde): se apunta para que el libro cuadre
    P.h[a] += u
    if (LB) apunta('compra', P, a, i, u, px ?? precio(a, i), C - c, c)
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
    if (LB) apunta('venta', P, a, i, u, p, X, c)
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
  // §185: con varios bloques, la cuenta (liquidez y ocioso comunes) es una pieza más (suma en el patrimonio y en la venta final).
  const BLOQUES = BLOQ ? piezas.filter(esBloque) : null
  // §196: el ocioso de la cuenta, el de los bloques de estrategia (con solo bloques «Con pesos», liquidez). nuevo: el dinero nuevo del día.
  const CUENTA = BLOQ ? { id: 'cuenta', tipo: 'cuenta', peso: 0, ocioso: plan.piezas.find(x => x.tipo === 'estrategia')?.ocioso || 'LIQUIDEZ', h: { ...Object.fromEntries(simbolos.map(a => [a, 0])), LIQUIDEZ: 0 }, nuevo: 0, nuevoManana: 0 } : null
  if (BLOQ) { piezas.push(CUENTA); for (const P of BLOQUES) { P.tarde = 0; if (P.tipo === 'pesos') P.franja = [] } }
  for (const P of piezas) if (P.tipo === 'pesos') { P.espera = {}; P.objetivo = objetivoDe(P); P.simbolosPesos = [...new Set([...simbolosPesos(P), ...simbolosAcciones(P)])]; P.frecuenciaVolver = FRECUENCIA_VOLVER[P.volver.cada] || null; P.bandaRota = false
    // §194: las reglas, sus series en las fechas del plan y su estado.
    P.objetivoActual = P.objetivo; P.reglas = P.reglas || []; P.enCurso = null; P.pendiente = null
    if (P.reglas.length) {
      const vd = (s) => datos.velas?.[s]
      P.serieR = P.reglas.map(r => serieFilas(r.filas, vd, fechas)); P.serieCuando = P.reglas.map(r => r.despues.tipo === 'cuando' ? serieFilas(r.despues.filas, vd, fechas) : null)
      P.maxR = P.reglas.map(r => maximoHasta(r.filas[0].quien, vd, fechas)); P.cierreR = P.reglas.map(r => cierreEn(r.filas[0].quien, vd, fechas))
      P.disparos = P.reglas.map(() => 0); P.armada = P.reglas.map(() => true); P.maxDisparo = P.reglas.map(() => null); P.historial = []; P.estados = []
    }
  }   // §193
  // Las piezas estrategia: sus operaciones del periodo (con los precios a los que se ejecutan) y su estado.
  const idx = Object.fromEntries(fechas.map((f, i) => [f, i]))
  for (const P of piezas) if (P.tipo === 'estrategia' && P.donde === 'lista') {
    // §89: los candidatos de todos los valores, en el orden del Backtesting, agrupados por su fecha de entrada.
    const L = listaDe(datos, P), o = L.opciones || {}
    const cands = L.activos.flatMap(ac => ac.candidatos || []).sort(comparadorCandidatos({ modo: o.modo, prioridad: o.prioridad }))
    P.entradas = new Map()
    for (const t of cands) {
      for (const f of [t.entryDate, t.exitDate]) if (f && (idx[f] == null || idx[f] < i0 || idx[f] > i1)) throw new Error(`Pieza ${P.id}: la operación de ${t.symbol} del ${f} cae fuera de las fechas del plan.`)
      if (!P.entradas.has(t.entryDate)) P.entradas.set(t.entryDate, [])
      P.entradas.get(t.entryDate).push(t)
    }
    P.modoLista = o.modo; P.nLista = o.n; P.maxPos = o.maxPosiciones ?? 5; P.simbolosLista = new Set(L.activos.map(ac => ac.symbol))
    P.abiertas = new Map(); P.ops = []; P.franja = []; P.dentroDe = null; P.calentamiento = null
  } else if (P.tipo === 'estrategia') {
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
  // §89: las salidas y entradas del día i de una pieza con lista, como el Backtesting (asignaCompartido / asignaConcentrado de
  // lib/asignaCartera.js): primero salen las abiertas que salen hoy (en el orden en que entraron) y su dinero vuelve a la liquidez de
  // la pieza; luego entran las del día, en su orden, cada una con el capital de su modo. Comprar y vender son órdenes reales del plan
  // (compra / vende: comisión por orden, lotes). Una operación que entra y sale el mismo día se compra y se vende en el acto.
  const capsAbiertas = (P) => { let s = 0; for (const x of P.abiertas.values()) s += x.cap; return s }
  // §91: el dinero libre de la pieza (liquidez + lo que vale su ocioso a la apertura de i) y, antes de comprar, vender del ocioso lo que
  // falte para tener cap en la liquidez (algo más por la comisión de esa venta; si no basta, todo el ocioso).
  const conOcioso = (P) => P.ocioso !== 'LIQUIDEZ' && P.h[P.ocioso] > 0
  const libre = (P, i) => P.h.LIQUIDEZ + (conOcioso(P) && precio(P.ocioso, i) > 0 ? P.h[P.ocioso] * precio(P.ocioso, i) : 0)
  const consigue = (P, cap, i) => {
    const falta = cap - P.h.LIQUIDEZ
    if (!(falta > 1e-9) || !conOcioso(P)) return
    const px = precio(P.ocioso, i), valor = P.h[P.ocioso] * px
    if (!(px > 0)) return
    let X = falta
    if (cst) { const h = cst.h[P.ocioso] || 0, X1 = falta / (1 - cst.com - h); X = cst.com * X1 >= cst.min ? X1 : (falta + cst.min) / (1 - h) }
    P.h.LIQUIDEZ += vende(P, P.ocioso, X >= valor * (1 - 1e-12) ? P.h[P.ocioso] : X / px, i)
  }
  // §91: lo que queda en la liquidez de la pieza, al ocioso al cierre de i (si la orden no cuesta más del 1 % de lo que se mueve).
  // §187: campo 'open' = a la apertura (con varios bloques, el dinero que ya estaba a esa hora).
  const sobranteAlOcioso = (P, i, campo = 'close') => {
    const C = P.h.LIQUIDEZ
    if (P.ocioso === 'LIQUIDEZ' || !(C > 0.01) || !(precio(P.ocioso, i, campo) > 0)) return
    if (cst && (cst.com > 0 || cst.min > 0 ? Math.max(cst.com * C, cst.min) : 0) + C * (cst.h[P.ocioso] || 0) > MAX_COSTE_OCIOSO * C) return
    P.h.LIQUIDEZ = 0; compra(P, P.ocioso, C, i, precio(P.ocioso, i, campo))
  }
  const cierraLista = (P, x, i) => {
    P.h.LIQUIDEZ += vende(P, x.t.symbol, P.h[x.t.symbol], i, x.t.exitPx)
    if (detalle) operaciones.push({ fecha: fechas[i], pieza: P.id, simbolo: x.t.symbol, de: 'dentro', a: 'ocioso', precio: x.t.exitPx })
  }
  // §163: las señales del día, con el libro: cada candidato cuenta como generado y, si no entra, su motivo ('yaDentro': ya tenía ese valor;
  // 'slots': sin hueco libre; 'filtro': no pasa el filtro de la prioridad; 'dinero': sin dinero) y lo que habría ganado con el dinero que le
  // tocaba (cap × (salida / entrada − 1); 0 si no había dinero). Solo apunta: no cambia ninguna decisión.
  const senal = (t, motivo, cap = 0) => {
    const S = LB.senales, ps = S.porSimbolo[t.symbol] || (S.porSimbolo[t.symbol] = { generadas: 0, ejecutadas: 0 })
    S.generadas++; ps.generadas++
    if (motivo === 'ejecutada') { S.ejecutadas++; ps.ejecutadas++; return }
    S.motivos[motivo]++
    const ret = t.entryPx > 0 && Number.isFinite(t.exitPx) ? t.exitPx / t.entryPx - 1 : null
    S.descartadas.push({ simbolo: t.symbol, entryDate: t.entryDate, exitDate: t.exitDate, motivo, ret, cap, hipotetico: ret == null ? null : cap * ret })
  }
  // ── §185: varios bloques ──
  // 1) Las salidas del día de un bloque (su dinero queda en la liquidez del bloque hasta pasarlo a la cuenta).
  // SOLO LO QUE SE PODRÍA HACER EN LA REALIDAD (norma de Sergi, 15/11): el dinero de una venta que NO es a la apertura (un stop a mitad de
  // sesión, una venta al cierre) no ha llegado cuando se compra a la apertura: espera en el bloque (P.tarde) y pasa a la cuenta después de
  // las compras del día.
  const salidasBloque = (P, i) => {
    if (P.donde === 'lista') {
      for (const [sym, x] of P.abiertas) if (x.t.exitDate === fechas[i]) {
        const antes = P.h.LIQUIDEZ; cierraLista(P, x, i); P.abiertas.delete(sym)
        if (x.t.exitPx !== precio(sym, i)) P.tarde += P.h.LIQUIDEZ - antes
      }
      return
    }
    const t = P.ops[P.k]
    if (t && P.dentro && t.exitDate && idx[t.exitDate] === i) {
      const cobrado = vende(P, P.dentroDe, P.h[P.dentroDe], i, t.pxSalida)
      P.h.LIQUIDEZ += cobrado; if (!t.alAbrir) P.tarde += cobrado
      P.dentro = false; P.k++
      if (detalle) operaciones.push({ fecha: fechas[i], pieza: P.id, de: 'dentro', a: 'ocioso', precio: t.exitPrice, motivo: t.exitReason })
    }
  }
  // La liquidez de los bloques a la cuenta (todo = también la que llegó a mitad de sesión).
  // §196: el bloque «Con pesos» se queda su liquidez; lo que llega a la cuenta cuenta como dinero nuevo (hoy, o mañana si llegó tarde).
  const aCuenta = (todo) => { for (const P of BLOQUES) { if (P.tipo === 'pesos') continue; const x = P.h.LIQUIDEZ - (todo ? 0 : P.tarde); if (x > 0) { CUENTA.h.LIQUIDEZ += x; P.h.LIQUIDEZ -= x; if (todo) CUENTA.nuevoManana += x; else CUENTA.nuevo += x } if (todo) P.tarde = 0 } }
  const enPosiciones = (P, i) => P.tipo === 'pesos' ? valorPieza(P, i) : valorPieza(P, i) - P.h.LIQUIDEZ   // lo que vale lo invertido del bloque (sin el dinero que aún espera; el «Con pesos», todo)
  // Del dinero de la cuenta a una compra de P: vende del ocioso lo que falte y pasa el dinero al bloque (sin coste: es la misma cuenta).
  const daBloque = (P, cap, i) => { consigue(CUENTA, cap, i); const x = Math.min(cap, CUENTA.h.LIQUIDEZ); CUENTA.h.LIQUIDEZ -= x; P.h.LIQUIDEZ += x; return x }
  const tieneEntrada = (P, i) => P.donde === 'lista' ? (P.entradas.get(fechas[i]) || []).length > 0 : (!P.dentro && P.ops[P.k] && idx[P.ops[P.k].entryDate] === i)
  // 3) Las compras del día: primero el bloque más atrasado respecto a su % (a la apertura; si empatan, el orden del plan).
  const entradasBloques = (i) => {
    const quien = BLOQUES.filter(P => P.tipo === 'pesos' ? CUENTA.nuevo >= 0.01 : tieneEntrada(P, i))   // §196
    if (!quien.length) return
    const pat = piezas.reduce((s, P) => s + valorPieza(P, i), 0), tope = plan.reparto?.dineroLibre !== 'prioridad'
    const atraso = new Map(quien.map(P => [P, P.peso - (pat > 0 ? enPosiciones(P, i) / pat : 0)]))
    quien.sort((a, b) => atraso.get(b) - atraso.get(a))
    for (const P of quien) {
      const hueco = () => tope ? Math.max(0, P.peso * pat - enPosiciones(P, i)) : Infinity   // lo que aún cabe en el bloque
      if (P.tipo === 'pesos') {   // §196: con el dinero nuevo del día, hasta su % (siempre con tope)
        const C = Math.min(libre(CUENTA, i), CUENTA.nuevo, Math.max(0, P.peso * pat - enPosiciones(P, i)))
        if (C >= 0.01) { const x = daBloque(P, C, i); P.h.LIQUIDEZ -= x; CUENTA.nuevo -= x; invierte(P, x, i) }
        continue
      }
      if (P.donde === 'lista') { entradasListaBloque(P, i, hueco, tope ? P.peso * pat : null); continue }
      const t = P.ops[P.k]
      const C = Math.min(libre(CUENTA, i), hueco())
      if (C >= 0.01) { const x = daBloque(P, C, i); P.h.LIQUIDEZ -= x; compra(P, P.dentroDe, x, i, t.pxEntrada) }
      P.dentro = true
      if (detalle) operaciones.push({ fecha: fechas[i], pieza: P.id, de: 'ocioso', a: 'dentro', precio: t.entryPrice })
      if (t.exitDate && idx[t.exitDate] === i) salidasBloque(P, i)   // entra y sale el mismo día
    }
  }
  // Las compras del día de un bloque con lista: el reparto entre sus valores (el de operaLista) con el presupuesto del bloque (con tope,
  // peso × patrimonio; sin tope, el dinero libre de la cuenta + lo que ya tiene invertido) y como mucho lo que le cabe y lo que hay libre.
  const entradasListaBloque = (P, i, hueco, presupuesto) => {
    const f = fechas[i]
    if (LB) for (const t of P.entradas.get(f) || []) if (P.abiertas.has(t.symbol)) senal(t, 'yaDentro')
    const entries = (P.entradas.get(f) || []).filter(t => !P.abiertas.has(t.symbol))
    const pool = () => presupuesto != null ? Math.max(0, presupuesto - capsAbiertas(P)) : libre(CUENTA, i)
    const disponible = () => Math.min(libre(CUENTA, i), hueco())
    const abre = (t, cap) => {
      if (LB) senal(t, 'ejecutada')
      cap = daBloque(P, cap, i); P.h.LIQUIDEZ -= cap
      compra(P, t.symbol, cap, i, t.entryPx)
      P.ops.push({ symbol: t.symbol, entryDate: t.entryDate, entryPrice: t.entryPx, exitDate: t.exitDate, exitPrice: t.exitPx, capital: cap })
      if (detalle) operaciones.push({ fecha: f, pieza: P.id, simbolo: t.symbol, de: 'ocioso', a: 'dentro', precio: t.entryPx })
      const x = { t, cap }
      if (t.exitDate === f) { cierraLista(P, x, i); return true }
      P.abiertas.set(t.symbol, x); return false
    }
    if (P.modoLista === 'concentrado') {
      let sameDayOpen = 0
      for (const t of entries) {
        const D = disponible(), { capMaxPorPosicion } = techoConcentrado(pool(), capsAbiertas(P), P.maxPos, P.nLista)
        if (P.maxPos - P.abiertas.size - sameDayOpen <= 0) { if (LB) senal(t, 'slots', Math.min(D, capMaxPorPosicion)); continue }
        if (t.pasaPuerta === false) { if (LB) senal(t, 'filtro', Math.min(D, capMaxPorPosicion)); continue }
        const cap = Math.min(D, capMaxPorPosicion)
        if (cap < 0.01) { if (LB) senal(t, 'dinero'); continue }
        if (abre(t, cap)) sameDayOpen++
      }
    } else {
      for (const t of entries) {
        const { capPorSlot } = capitalCompartido(pool(), capsAbiertas(P), P.nLista), cap = Math.min(capPorSlot, disponible())
        if (cap < 0.01) { if (LB) senal(t, 'dinero'); continue }
        abre(t, cap)
      }
    }
  }
  // El impuesto de julio con varios bloques: de la liquidez de la cuenta, luego del ocioso y luego de las posiciones de todos los bloques
  // a prorrata de su valor (el capital asignado de cada abierta de una lista baja en la misma proporción).
  const pagaImpuestoBloques = (T, i) => {
    let resto = T
    const x = Math.min(CUENTA.h.LIQUIDEZ, resto); CUENTA.h.LIQUIDEZ -= x; resto -= x
    if (resto > 1e-9 && conOcioso(CUENTA)) { consigue(CUENTA, resto, i); const y = Math.min(CUENTA.h.LIQUIDEZ, resto); CUENTA.h.LIQUIDEZ -= y; resto -= y }
    for (let intento = 0; intento < 5 && resto > 1e-9; intento++) {
      let tot = 0
      for (const P of BLOQUES) for (const a of simbolos) if (P.h[a] > 0 && precio(a, i) > 0) tot += P.h[a] * precio(a, i)
      if (!(tot > 0)) break
      const f = Math.min(1, resto / tot * (cst ? 1.01 : 1))
      let cobrado = 0
      for (const P of BLOQUES) for (const a of simbolos) if (P.h[a] > 0 && precio(a, i) > 0) { cobrado += vende(P, a, P.h[a] * f, i); const ab = P.abiertas?.get?.(a); if (ab) ab.cap *= 1 - f }
      const usa = Math.min(cobrado, resto); resto -= usa
      if (cobrado > usa) CUENTA.h.LIQUIDEZ += cobrado - usa
    }
    fiscal.pagado += T - Math.max(0, resto)
    if (LB) LB.movimientos.push({ fecha: fechas[i], tipo: 'impuesto', importe: T - Math.max(0, resto) })
  }
  const operaLista = (P, i) => {
    const f = fechas[i]
    for (const [sym, x] of P.abiertas) if (x.t.exitDate === f) { cierraLista(P, x, i); P.abiertas.delete(sym) }
    if (LB) for (const t of P.entradas.get(f) || []) if (P.abiertas.has(t.symbol)) senal(t, 'yaDentro')
    const entries = (P.entradas.get(f) || []).filter(t => !P.abiertas.has(t.symbol))
    if (!entries.length) return
    const abre = (t, cap) => {
      if (LB) senal(t, 'ejecutada')
      consigue(P, cap, i); cap = Math.min(cap, P.h.LIQUIDEZ)   // §91: con el ocioso en liquidez, no cambia nada
      P.h.LIQUIDEZ -= cap
      compra(P, t.symbol, cap, i, t.entryPx)
      P.ops.push({ symbol: t.symbol, entryDate: t.entryDate, entryPrice: t.entryPx, exitDate: t.exitDate, exitPrice: t.exitPx, capital: cap })
      if (detalle) operaciones.push({ fecha: f, pieza: P.id, simbolo: t.symbol, de: 'ocioso', a: 'dentro', precio: t.entryPx })
      const x = { t, cap }
      if (t.exitDate === f) { cierraLista(P, x, i); return true }
      P.abiertas.set(t.symbol, x); return false
    }
    if (P.modoLista === 'concentrado') {
      if (!(libre(P, i) > 0.01)) { if (LB) for (const t of entries) senal(t, 'dinero'); return }
      let sameDayOpen = 0
      for (const t of entries) {
        const slotsLibresEfectivos = P.maxPos - P.abiertas.size - sameDayOpen
        const L = libre(P, i)
        const { capMaxPorPosicion } = techoConcentrado(L, capsAbiertas(P), P.maxPos, P.nLista)
        if (slotsLibresEfectivos <= 0) { if (LB) senal(t, 'slots', Math.min(L, capMaxPorPosicion)); continue }
        if (t.pasaPuerta === false) { if (LB) senal(t, 'filtro', Math.min(L, capMaxPorPosicion)); continue }
        const capPorEntrada = Math.min(L, capMaxPorPosicion)
        if (capPorEntrada < 0.01) { if (LB) senal(t, 'dinero'); continue }
        if (abre(t, capPorEntrada)) sameDayOpen++
      }
    } else {
      if (!(libre(P, i) > 0)) { if (LB) for (const t of entries) senal(t, 'dinero'); return }
      for (const t of entries) {
        const { capPorSlot } = capitalCompartido(libre(P, i), capsAbiertas(P), P.nLista)
        if (capPorSlot < 0.01) { if (LB) senal(t, 'dinero'); continue }
        abre(t, capPorSlot)
      }
    }
  }
  // §193: el bloque «Con pesos». valeOrden: la regla del 1 % (sin apuntar la orden). Lo que vale cada cosa del bloque a la apertura de i (o
  // al cierre), con su liquidez sin el dinero que espera. compraPesos: una compra del bloque; si no se puede (sin precio ese día o por la
  // regla del 1 %), el dinero espera en el bloque.
  const valeOrden = (a, X) => X > 0.01 && (!cst || (cst.com > 0 || cst.min > 0 ? Math.max(cst.com * X, cst.min) : 0) + X * (cst.h[a] || 0) <= MAX_COSTE_ORDEN_PESOS * X)
  // P.espera: { símbolo: euros } que esperan para ese símbolo (están en la liquidez del bloque y se suman a su siguiente compra).
  const esperaTotal = (P) => Object.values(P.espera).reduce((t, x) => t + x, 0)
  const valoresPesos = (P, i, campo = 'open') => { const o = { LIQUIDEZ: Math.max(0, P.h.LIQUIDEZ - esperaTotal(P)) }; for (const s of P.simbolosPesos) o[s] = P.h[s] > 0 ? P.h[s] * (precio(s, i, campo) || 0) : 0; return o }
  const compraPesos = (P, s, X, i) => {
    if (!(X > 0)) return
    if (s === 'LIQUIDEZ') { P.h.LIQUIDEZ += X; return }
    if (!(precio(s, i) > 0) || !valeOrden(s, X)) { P.h.LIQUIDEZ += X; P.espera[s] = (P.espera[s] || 0) + X; return }
    compra(P, s, X, i)
  }
  // Saca de la liquidez el dinero que espera ({ símbolo: euros }; si el impuesto de julio ha usado la liquidez, lo que quede, a prorrata).
  const sacaEspera = (P) => {
    const E = esperaTotal(P), f = E > 0 ? Math.min(1, P.h.LIQUIDEZ / E) : 0, out = {}
    for (const [s, x] of Object.entries(P.espera)) { out[s] = x * f; P.h.LIQUIDEZ -= x * f }
    P.espera = {}
    return out
  }
  // Volver a los pesos: vende lo que sobra (regla del 1 %), y con lo cobrado (y lo que esperaba) compra lo que falta, a la apertura de i.
  // §194: a los pesos `obj` (por defecto, los que tocan ahora: los de partida o los que dejó una regla con «quedarse»). Devuelve lo movido.
  const volverPesos = (P, i, obj = P.objetivoActual) => {
    P.espera = {}   // lo que esperaba cuenta como liquidez: lo que pase de su peso se reparte
    const v = valoresPesos(P, i), { sobra, falta } = ordenesVolver(obj, v)
    let caja = 0, hubo = false, movido = 0
    for (const [s, X] of Object.entries(sobra)) {
      if (s === 'LIQUIDEZ') { P.h.LIQUIDEZ -= X; caja += X; movido += X; continue }
      if (!(precio(s, i) > 0) || !valeOrden(s, X)) continue
      caja += vende(P, s, X >= v[s] * (1 - 1e-12) ? P.h[s] : X / precio(s, i), i); hubo = true; movido += X
    }
    const F = Object.values(falta).reduce((t, x) => t + x, 0)
    if (F > 0) for (const [s, X] of Object.entries(falta)) { const c = Math.min(X, caja * X / F); if (s !== 'LIQUIDEZ') hubo = true; compraPesos(P, s, c, i) }
    else P.h.LIQUIDEZ += caja
    if (F > 0 && caja > F) P.h.LIQUIDEZ += caja - F
    if (hubo && detalle) operaciones.push({ fecha: fechas[i], pieza: P.id, volverPesos: true })
    return movido
  }
  // §194: las reglas. pesosDe: la proporción de cada cosa (sin ceros). mueve: X € de `de` a `a` (regla del 1 % en la venta).
  const pesosDe = (v) => { const T = Object.values(v).reduce((t, x) => t + x, 0); return T > 0 ? Object.fromEntries(Object.entries(v).filter(([, x]) => x > 1e-9 * T).map(([s, x]) => [s, x / T])) : {} }
  const mueve = (P, de, a, X, v, i) => {
    if (!(X > 0)) return 0
    let caja
    if (de === 'LIQUIDEZ') { caja = Math.min(X, v.LIQUIDEZ); P.h.LIQUIDEZ -= caja }
    else { if (!(precio(de, i) > 0) || !valeOrden(de, X)) return 0; caja = vende(P, de, X >= v[de] * (1 - 1e-12) ? P.h[de] : X / precio(de, i), i) }
    compraPesos(P, a, caja, i)
    return X
  }
  // Al cierre de i: «una vez por caída» se rearma con un cierre por encima del máximo del día en que se cumplió; con una regla en curso,
  // se mira si acaba (mantener, después); si no, la primera regla que se cumple queda pendiente para la apertura siguiente.
  const decideReglas = (P, i) => {
    P.reglas.forEach((r, k) => { if (!P.armada[k] && P.maxDisparo[k] != null && P.cierreR[k][i] != null && P.cierreR[k][i] > P.maxDisparo[k]) P.armada[k] = true })
    if (P.pendiente) return
    if (P.enCurso) {
      const E = P.enCurso, r = P.reglas[E.k]
      if (fechas[i] < E.hasta) return
      if (r.despues.tipo === 'quedarse') { P.enCurso = null; return }
      if (r.despues.tipo === 'partida' || P.serieCuando[E.k][i] === true) P.pendiente = { tipo: 'partida', k: E.k, cumple: fechas[i] }
      return
    }
    for (let k = 0; k < P.reglas.length; k++) {
      const r = P.reglas[k]
      if ((r.repetir === 'unaVez' && P.disparos[k] > 0) || (r.repetir === 'porCaida' && !P.armada[k])) continue
      if (P.serieR[k][i] === true) { P.pendiente = { tipo: 'regla', k, cumple: fechas[i], maxRef: P.maxR[k][i] }; return }
    }
  }
  // A la apertura de i: lo que quedó pendiente la víspera.
  const ejecutaPendiente = (P, i) => {
    const pe = P.pendiente
    P.pendiente = null
    let movido = 0
    if (pe.tipo === 'partida') { P.objetivoActual = P.objetivo; movido = volverPesos(P, i, P.objetivo); P.enCurso = null }
    else {
      const r = P.reglas[pe.k], a = r.accion
      if (a.tipo === 'pesos') movido = volverPesos(P, i, objetivoDe(a))
      else {
        const v = valoresPesos(P, i), T = Object.values(v).reduce((t, x) => t + x, 0)
        const X = a.tipo === 'moverBloque' ? Math.min(a.pct / 100 * T, v[a.de] || 0) : a.tipo === 'moverActivo' ? a.pct / 100 * (v[a.de] || 0) : (v[a.de] || 0)
        movido = mueve(P, a.de, a.tipo === 'vender' ? 'LIQUIDEZ' : a.a, X, v, i)
      }
      P.objetivoActual = a.tipo === 'pesos' ? objetivoDe(a) : pesosDe(valoresPesos(P, i))
      P.disparos[pe.k]++
      if (r.repetir === 'porCaida') { P.armada[pe.k] = false; P.maxDisparo[pe.k] = pe.maxRef }
      P.enCurso = { k: pe.k, desde: fechas[i], hasta: masMeses(fechas[i], r.mantenerMeses) }
    }
    const que = pe.tipo === 'partida' ? 'partida' : P.reglas[pe.k].accion.tipo
    P.historial.push({ cumple: pe.cumple, actua: fechas[i], regla: pe.k + 1, que, movido, pesos: pesosDe(valoresPesos(P, i)) })
    if (detalle) operaciones.push({ fecha: fechas[i], pieza: P.id, regla: pe.k + 1, que })
  }
  // Paso 2 del día: lo pendiente de una regla o, si no, volver a los pesos (nunca mientras una regla «mantiene»).
  const operaPesos = (P, i) => {
    if (P.pendiente) return ejecutaPendiente(P, i)
    if (P.enCurso && fechas[i] < P.enCurso.hasta) return
    if (P.bandaRota || (P.frecuenciaVolver && cambiaPeriodo(fechas[i - 1], fechas[i], P.frecuenciaVolver))) volverPesos(P, i)
  }
  // Dinero nuevo dentro de una pieza.
  const invierte = (P, C, i) => {
    if (!(C > 0)) return
    if (P.tipo === 'activo') return compra(P, P.activo, C, i)
    if (P.tipo === 'pesos') {   // §193: con lo que esperaba, según el modo del bloque
      // §194: con una regla en curso, según los pesos de ese momento (para no deshacerla); «al más atrasado», hacia los pesos que tocan.
      const modo = P.enCurso ? 'ahora' : P.aportaciones
      const esp = sacaEspera(P), partes = repartoAportacion(modo, C, modo === 'partida' ? P.objetivo : P.objetivoActual, valoresPesos(P, i))
      for (const [s, x] of Object.entries(esp)) partes[s] = (partes[s] || 0) + x
      for (const [s, X] of Object.entries(partes)) compraPesos(P, s, X, i)
      return
    }
    // §95: comprar y mantener la lista a partes iguales: el dinero que llega se reparte igual entre los valores que cotizan ese día (una
    // orden por valor) y no se vende nunca. Si ninguno cotiza, espera en liquidez.
    if (P.tipo === 'cesta') { const ok = cesta.filter(a => precio(a, i) > 0); if (!ok.length) { P.h.LIQUIDEZ += C; return } for (const a of ok) compra(P, a, C / ok.length, i); return }
    if (P.tipo === 'estrategia' && P.donde === 'lista') { P.h.LIQUIDEZ += C; return }   // §89: espera en la liquidez de la pieza
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
  // §92 (fase 8): con una lista, el impuesto sale de la liquidez de la pieza, luego del ocioso (solo lo que falte) y, si no basta, de los
  // valores abiertos a prorrata de su valor; el capital asignado de cada abierta baja en la misma proporción (es lo que cuenta el reparto).
  const pagaImpuestoLista = (P, T, i) => {
    let resto = T
    const x = Math.min(P.h.LIQUIDEZ, resto); P.h.LIQUIDEZ -= x; resto -= x
    if (resto > 1e-9 && conOcioso(P)) { consigue(P, resto, i); const y = Math.min(P.h.LIQUIDEZ, resto); P.h.LIQUIDEZ -= y; resto -= y }
    for (let intento = 0; intento < 5 && resto > 1e-9; intento++) {
      let tot = 0
      for (const [sym] of P.abiertas) if (P.h[sym] > 0 && precio(sym, i) > 0) tot += P.h[sym] * precio(sym, i)
      if (!(tot > 0)) break
      const f = Math.min(1, resto / tot * (cst ? 1.01 : 1))
      let cobrado = 0
      for (const [sym, ab] of P.abiertas) if (P.h[sym] > 0 && precio(sym, i) > 0) { cobrado += vende(P, sym, P.h[sym] * f, i); ab.cap *= 1 - f }
      const usa = Math.min(cobrado, resto); resto -= usa
      if (cobrado > usa) P.h.LIQUIDEZ += cobrado - usa
    }
    fiscal.pagado += T - Math.max(0, resto)
    if (LB) LB.movimientos.push({ fecha: fechas[i], tipo: 'impuesto', importe: T - Math.max(0, resto) })
  }
  const pagaImpuesto = (T, i) => {
    if (!(T > 0)) return
    if (BLOQ) return pagaImpuestoBloques(T, i)   // §185
    { const PL = piezas.find(P => P.tipo === 'estrategia' && P.donde === 'lista'); if (PL) return pagaImpuestoLista(PL, T, i) }   // §92
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
    if (LB) LB.movimientos.push({ fecha: fechas[i], tipo: 'impuesto', importe: T - Math.max(0, resto) })
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
    if (BLOQ) { CUENTA.h.LIQUIDEZ += A; CUENTA.nuevo += A; return }   // §185: a la cuenta; los bloques lo cogen al comprar (§196: dinero nuevo)
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
    if (BLOQ) { CUENTA.nuevo = CUENTA.nuevoManana; CUENTA.nuevoManana = 0; for (const P of BLOQUES) { if (P.tipo === 'pesos') { if (i > i0) operaPesos(P, i); P.bandaRota = false } else salidasBloque(P, i) } aCuenta(false) }   // §185, §196
    else for (const P of piezas) if (P.tipo === 'cartera') {
      if (P.pendiente) { ejecuta(P, P.pendiente.k, i); P.pendiente = null }
      if (i > i0) for (const tr of P.calendario) if ((tr.desde === P.estado || tr.desde === '*') && cambiaPeriodo(fechas[i - 1], fechas[i], tr.calendario)) { if (aPesos(P, P.regla.estados[tr.hacia].pesos, i) && detalle) operaciones.push({ fecha: fechas[i], pieza: P.id, de: P.estado, a: tr.hacia, rebalanceo: true }); P.estado = tr.hacia; break }
    } else if (P.tipo === 'estrategia' && P.donde === 'lista') { if (i > i0) operaLista(P, i) }   // el primer día, tras entrar el dinero (3)
    else if (P.tipo === 'estrategia') operaEstrategia(P, i)
    else if (P.tipo === 'pesos') { if (i > i0) operaPesos(P, i); P.bandaRota = false }   // §193, §194
    // 3. Aportaciones: participaciones al VL de la apertura (antes de entrar el dinero).
    const A = importeDelDia(i)
    if (A > 0) {
      const patAntes = piezas.reduce((s, P) => s + valorPieza(P, i), 0)
      const vlAntes = participaciones > 0 ? patAntes / participaciones : 1
      participaciones += A / vlAntes; aportado += A
      flujos.push({ fecha: fechas[i], importe: -A })
      if (LB) LB.movimientos.push({ fecha: fechas[i], tipo: 'aportacion', importe: A })
      reparte(A, i)
    }
    // §185: las compras del día; §187: lo que sobra de lo que había a la apertura (aportaciones, ventas a la apertura) va al ocioso A LA
    // APERTURA, como con un bloque; lo que llegó a mitad de sesión, al cierre (abajo).
    if (BLOQ) { entradasBloques(i); if (i < i1) sobranteAlOcioso(CUENTA, i, 'open'); aCuenta(true) }
    else if (i === i0) for (const P of piezas) if (P.tipo === 'estrategia' && P.donde === 'lista') operaLista(P, i)
    // 4. Rebalanceo entre piezas (calendario o banda de la víspera).
    if (piezas.length > 1 && i > i0 && ((rb.calendario !== 'nunca' && cambiaPeriodo(fechas[i - 1], fechas[i], rb.calendario)) || bandaRota)) { if (rebalanceaPiezas(i)) rebalanceosPiezas++ }
    bandaRota = false
    // 5. Al cierre (antes, el ocioso de una pieza estrategia que ha salido hoy dentro de la vela, a su cierre).
    for (const P of EST.length ? piezas : []) if (P.tipo === 'estrategia' && P.ociosoAlCierre) { aOcioso(P, i, precio(P.ocioso, i, 'close')); P.ociosoAlCierre = false }
    if (BLOQ) { if (i < i1) sobranteAlOcioso(CUENTA, i) }   // §185
    else if (i < i1) for (const P of EST.length ? piezas : []) if (P.tipo === 'estrategia' && P.donde === 'lista') sobranteAlOcioso(P, i)   // §91
    const pat = piezas.reduce((s, P) => s + valorPieza(P, i, 'close'), 0)
    serie.push({ date: fechas[i], vl: participaciones > 0 ? pat / participaciones : 1, patrimonio: pat, aportado, aportadoHoy: A, ...(detalle ? { piezas: Object.fromEntries(piezas.map(P => [P.id, valorPieza(P, i, 'close')])) } : {}) })
    if (LB) {   // §155: dónde está el dinero al cierre
      const d = { valores: 0, ocioso: 0, liquidez: 0, otros: 0 }
      for (const P of piezas) { d.liquidez += P.h.LIQUIDEZ; for (const a of simbolos) if (P.h[a] > 0) { const r = rolDe(P, a); d[r === 'valor' ? 'valores' : r === 'ocioso' ? 'ocioso' : 'otros'] += P.h[a] * precio(a, i, 'close') } }
      LB.reparto.push(d)
      // §156: lo ganado hasta hoy con cada valor y con el ocioso (lo cobrado − lo comprado + lo que vale al cierre lo que se tiene)
      for (const a in LB.porSimbolo) { const S = LB.porSimbolo[a]; if (S.rol === 'otro') continue
        let u = 0; for (const P of piezas) u += P.h[a]
        if (!LB.curvas[a]) LB.curvas[a] = new Array(serie.length - 1).fill(0)
        if (!LB.enValor[a]) LB.enValor[a] = new Array(serie.length - 1).fill(0)
        const vHoy = u > 0 ? u * precio(a, i, 'close') : 0
        LB.curvas[a].push(S.ventas - S.compras + vHoy); LB.enValor[a].push(vHoy) }
      if (BLOQ) for (const P of BLOQUES) { const B = LB.porBloque[P.id]; LB.curvasBloque[P.id].push(B.ventas - B.compras + valorPieza(P, i, 'close') - P.h.LIQUIDEZ) }   // §185
    }
    // Con lista, la franja es la parte del dinero de la pieza que está en algún valor de la lista (de 0 a 1; §91: el ocioso no cuenta).
    // §185: con varios bloques, la parte del patrimonio que está en las posiciones de cada bloque.
    if (BLOQ) for (const P of BLOQUES) P.franja.push(pat > 0 ? valorPieza(P, i, 'close') / pat : 0)
    else for (const P of EST.length ? piezas : []) if (P.tipo === 'estrategia') P.franja.push(P.donde === 'lista' ? (() => { const v = valorPieza(P, i, 'close'); return v > 0 ? 1 - (P.h.LIQUIDEZ + (P.ocioso !== 'LIQUIDEZ' ? P.h[P.ocioso] * precio(P.ocioso, i, 'close') : 0)) / v : 0 })() : P.dentro ? 1 : 0)
    for (const P of piezas) if (P.tipo === 'pesos') {   // §193, §194
      if (i < i1 && P.reglas.length) decideReglas(P, i)
      if (P.volver.cada === 'banda' && i < i1) P.bandaRota = fueraDeBanda(P.objetivoActual, valoresPesos(P, i, 'close'), P.volver.puntos)
      if (P.estados) P.estados.push(P.enCurso ? P.enCurso.k + 1 : 0)
    }
    if (rb.banda != null && piezas.length > 1 && pat > 0) bandaRota =piezas.some(P => Math.abs(valorPieza(P, i, 'close') / pat - P.peso) > rb.banda)
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
    ordenes++   // la venta final de este símbolo
    const X = u * pc
    if (cst) costeVentaFinal += (cst.com > 0 || cst.min > 0 ? Math.max(cst.com * X, cst.min) : 0) + X * cst.h[a]
    for (const l of lotes[a]) latente += l.u * (pc - l.coste) + l.ajuste
    if (LB) {   // §155: la venta final de este símbolo; su coste se reparte entre las piezas que lo tienen, por participaciones
      const cFin = cst ? (cst.com > 0 || cst.min > 0 ? Math.max(cst.com * X, cst.min) : 0) + X * cst.h[a] : 0
      const S = LB.porSimbolo[a] || (LB.porSimbolo[a] = { rol: 'otro', compras: 0, ventas: 0, costes: 0, valorFinal: 0, ganado: 0 })
      S.valorFinal += X; S.costes += cFin
      if (BLOQ) for (const P of BLOQUES) if (P.h[a] > 0) { const B = LB.porBloque[P.id]; B.valorFinal += P.h[a] * pc; B.costes += cFin * P.h[a] / u }   // §185
      LB.movimientos.push({ fecha: fechas[i1], tipo: 'ventaFinal', simbolo: a, rol: S.rol, unidades: u, precio: pc, importe: X, coste: cFin })
      for (const P of piezas) { const op = P.h[a] > 0 ? LB.abiertas.get(`${P.id}|${a}`) : null; if (!op) continue
        op.ventas += P.h[a] * pc; op.costes += cFin * P.h[a] / u; op.exitDate = fechas[i1]; op.exitPrice = pc; op.resultado = op.ventas - op.compras; op.abierta = true
        LB.operaciones.push(op); LB.abiertas.delete(`${P.id}|${a}`) }
    }
  }
  if (conImpuestos) {
    const yFin = fechas[i1].slice(0, 4), yIni = Number(fechas[i0].slice(0, 4))
    for (let y = yIni; y < Number(yFin); y++) if (!fiscal.pagados.has(String(y))) impuestoFinal += liquida(String(y), ganancias[String(y)] || 0, 'al final (pendiente)')
    impuestoFinal += liquida(yFin, (ganancias[yFin] || 0) + latente - costeVentaFinal, 'al final (venta de todo)')
  }
  const valorNeto = Math.max(0, ult.patrimonio - costeVentaFinal - impuestoFinal)
  let elLibro = null
  if (LB) {   // §155
    if (impuestoFinal > 0) LB.movimientos.push({ fecha: fechas[i1], tipo: 'impuestoFinal', importe: impuestoFinal })
    const g = { valor: 0, ocioso: 0, otro: 0 }
    for (const S of Object.values(LB.porSimbolo)) { S.ganado = S.ventas + S.valorFinal - S.compras; g[S.rol] += S.ganado }
    if (BLOQ) for (const B of Object.values(LB.porBloque)) B.ganado = B.ventas + B.valorFinal - B.compras   // §185
    const costes = costesPagados + costeVentaFinal, impuestos = conImpuestos ? fiscal.pagado + impuestoFinal : 0
    elLibro = { movimientos: LB.movimientos, porSimbolo: LB.porSimbolo, operaciones: LB.operaciones, reparto: LB.reparto, curvas: LB.curvas, enValor: LB.enValor, ...(piezas.some(P => P.tipo === 'estrategia' && P.donde === 'lista') ? { senales: LB.senales } : {}), ...(BLOQ ? { porBloque: LB.porBloque, curvasBloque: LB.curvasBloque } : {}),
      puente: { aportado, ganadoValores: g.valor, ganadoOcioso: g.ocioso, ganadoOtros: g.otro, costes, impuestos, valorNeto, descuadre: valorNeto - (aportado + g.valor + g.ocioso + g.otro - costes - impuestos) } }
  }
  return { serie, flujos, valorNeto, aportado, patrimonio: ult.patrimonio, costes: { pagados: costesPagados + costeVentaFinal, ordenes, ventaFinal: costeVentaFinal },
    impuestos: conImpuestos ? { porAnio: fiscal.porAnio, pagados: fiscal.pagado + impuestoFinal, final: impuestoFinal, perdidasPendientes: fiscal.perdidas, dosMeses: diferidas } : null,
    operaciones: detalle ? operaciones : null, rebalanceosPiezas, i0, i1, ...(elLibro ? { libro: elLibro } : {}),
    // §194: de cada bloque «Con pesos» con reglas, cuándo actuó cada regla y, por día, qué regla estaba en curso (0 = ninguna).
    ...(piezas.some(P => P.tipo === 'pesos' && P.reglas.length) ? { pesos: Object.fromEntries(piezas.filter(P => P.tipo === 'pesos' && P.reglas.length).map(P => [P.id, { historial: P.historial, estados: P.estados }])) } : {}),
    // §197: con varios bloques, de cada bloque «Con pesos», la parte del patrimonio que está en él cada día (como la franja de un bloque de estrategia).
    ...(BLOQ && BLOQUES.some(P => P.tipo === 'pesos') ? { bloquesPesos: Object.fromEntries(BLOQUES.filter(P => P.tipo === 'pesos').map(P => [P.id, { dentro: P.franja }])) } : {}),...(EST.length ? { estrategias: estrategiasDe(piezas, datos, serieDe, idx, i0, i1, detalle) } : {}) }
}
// Lo que devuelve cada pieza estrategia: sus operaciones del periodo, la franja diaria «dentro» (1) / «en el ocioso» (0) al cierre y,
// con detalle, la curva de la estrategia sola y los cierres del ocioso en las mismas fechas (para lib/planes/descorrelacion.js).
function estrategiasDe(piezas, datos, serieDe, idx, i0, i1, detalle) {
  return Object.fromEntries(piezas.filter(P => P.tipo === 'estrategia').map(P => [P.id, P.donde === 'lista' ? {
    // §89: con lista, sus valores, las operaciones que entraron (con su capital) y la franja (parte del dinero dentro, de 0 a 1).
    lista: true, simbolos: (listaDe(datos, P)?.activos || []).map(ac => ac.symbol), modo: P.modoLista, ocioso: P.ocioso, operaciones: P.ops, dentro: P.franja,
  } : {
    activo: P.activo, simbolo: P.dentroDe, ocioso: P.ocioso, apalancamiento: apalancamientoDe(P), aportacionDentro: P.aportacionDentro || 'espera',
    calentamiento: P.calentamiento, operaciones: P.ops.map(t => ({ entryDate: t.entryDate, entryPrice: t.entryPrice, exitDate: t.exitDate, exitPrice: t.exitPrice, exitReason: t.exitReason })),
    dentro: P.franja,
    ...(detalle ? { curva: curvaSola(P.ops, serieDe[P.dentroDe], idx, i0, i1), cierresOcioso: P.ocioso === 'LIQUIDEZ' ? null : serieDe[P.ocioso].slice(i0, i1 + 1).map(v => v?.close ?? null) } : {}),
  }]))
}
