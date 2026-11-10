// lib/screener/filtros.js — el CATÁLOGO de filtros del screener y cómo se evalúa una vista (docs/screener.md). Lógica PURA.
//
// Cada filtro: id, piso ('F' fundamentales · 'T' técnico), grupo, nombre, y o bien
//   · numérico: unidad, op por defecto ('≥' | '≤'), valor por defecto, dec (decimales) y v(e) → número o null;
//   · de sí o no (bool): v(e) → true | false | null y mostrar(e) → texto con sus cifras.
// fuente: de dónde sale el dato (Yahoo se pinta en amarillo). ayuda: [título, explicación, ejemplo] para su «?» (ejemplos
// con cifras inventadas que cuadran con calculadora). formula(e): la cuenta con las cifras de esa empresa, para el cajón.
// Un dato que falta (null) NO pasa el filtro (la tabla lo dice con «—»), salvo la cobertura de intereses cuando la empresa no
// declara gasto de intereses (no paga: la cubre).
//
// Los del piso técnico llegan en la parte 2 del screener: hoy la pestaña «2 · Técnico» los enseña sin poder encenderlos.

const fmt = (x, d = 1) => x == null || !Number.isFinite(x) ? '—' : x.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: 'always' })
const Mn = (x) => x == null ? '—' : fmt(x, 0) + ' M'
export { fmt }

export const FILTROS = [
  { id: 'roce', piso: 'F', grupo: 'Rentabilidad', nombre: 'ROCE', unidad: '%', op: '≥', valor: 25, dec: 1, fuente: 'EDGAR', v: e => e.m.roce,
    ayuda: ['ROCE (rentabilidad del capital empleado)', 'Beneficio operativo (antes de intereses e impuestos) ÷ capital empleado (activos − deudas a corto plazo). Es la más importante de las de rentabilidad: no depende de cómo se financie la empresa.', 'Beneficio operativo 300 M ÷ (activos 1.500 M − pasivo a corto 300 M) = 300 ÷ 1.200 = 25 %.'],
    formula: e => `${Mn(e.piezas.ebit)} ÷ (${Mn(e.piezas.activos)} − ${Mn(e.piezas.pasivoCorto)})` },
  { id: 'roa', piso: 'F', grupo: 'Rentabilidad', nombre: 'ROA', unidad: '%', op: '≥', valor: 10, dec: 1, fuente: 'EDGAR', v: e => e.m.roa,
    ayuda: ['ROA (rentabilidad de los activos)', 'Beneficio neto ÷ todo lo que tiene la empresa (activos). Evita que una empresa parezca rentable solo por endeudarse.', 'Beneficio 120 M ÷ activos 1.000 M = 12 %.'],
    formula: e => `${Mn(e.piezas.beneficio)} ÷ ${Mn(e.piezas.activos)}` },
  { id: 'roe', piso: 'F', grupo: 'Rentabilidad', nombre: 'ROE', unidad: '%', op: '≥', valor: 15, dec: 1, fuente: 'EDGAR', v: e => e.m.roe,
    ayuda: ['ROE (rentabilidad del patrimonio)', 'Beneficio neto ÷ patrimonio de los accionistas. Es la más famosa, pero se puede inflar con deuda: úsala solo como primer filtro. Con patrimonio negativo no hay ROE.', 'Beneficio 120 M ÷ patrimonio 600 M = 20 %.'],
    formula: e => `${Mn(e.piezas.beneficio)} ÷ ${Mn(e.piezas.patrimonio)}` },
  { id: 'roeMejora', piso: 'F', grupo: 'Rentabilidad', nombre: 'ROE mejor que hace 3 años', bool: true, fuente: 'EDGAR', v: e => e.m.roeMejora,
    mostrar: e => `${fmt(e.m.roeFy)} %${e.m.roeFyAnio ? ' (' + e.m.roeFyAnio + ')' : ''} frente a ${fmt(e.m.roe3)} %${e.m.roe3Anio ? ' (' + e.m.roe3Anio + ')' : ''}`,
    ayuda: ['ROE mejor que hace 3 años', '¿El negocio mejora o empeora? Compara el ROE del último ejercicio anual con el de 3 ejercicios antes. Las empresas cuya rentabilidad venía cayendo suelen ir peor después.', 'ROE del último ejercicio 20 % frente a 16 % tres ejercicios antes → ✓ mejora.'] },
  { id: 'cajaCubre', piso: 'F', grupo: 'Deuda', nombre: 'Caja ≥ deuda a corto plazo', bool: true, fuente: 'EDGAR', v: e => e.m.cajaCubre,
    mostrar: e => `${Mn(e.piezas.caja)} frente a ${Mn(e.piezas.deudaCorto)}`,
    ayuda: ['Caja ≥ deuda a corto plazo', 'La deuda que vence en los próximos 12 meses es la peligrosa: si no se puede pagar o refinanciar, hay riesgo de quiebra. Caja = caja + inversiones a corto plazo.', 'Caja 400 M y deuda que vence este año 250 M → ✓ la cubre.'] },
  { id: 'cobInt', piso: 'F', grupo: 'Deuda', nombre: 'Cobertura de intereses', unidad: 'veces', op: '≥', valor: 3, dec: 1, fuente: 'EDGAR', v: e => e.m.cobInt,
    sinDato: e => e.m.sinIntereses ? 'no paga intereses' : null,
    ayuda: ['Cobertura de intereses', 'Beneficio operativo ÷ intereses que paga. Dice si la deuda se puede sostener. Mínimo 3 veces; mejor de dos cifras. Si la empresa no declara gasto de intereses, cuenta como que la cubre.', 'Beneficio operativo 300 M ÷ intereses 25 M = 12 veces.'],
    formula: e => e.m.sinIntereses ? 'no declara gasto de intereses' : `${Mn(e.piezas.ebit)} ÷ ${Mn(e.piezas.intereses)}` },
  { id: 'deudaNeta', piso: 'F', grupo: 'Deuda', nombre: 'Deuda neta', unidad: 'M', op: '≤', valor: 0, dec: 0, fuente: 'EDGAR', v: e => e.m.deudaNeta,
    ayuda: ['Deuda neta', 'Deuda total − caja. Si sale negativa, la empresa tiene más dinero que deudas. En millones de la moneda de sus cuentas (casi siempre dólares).', 'Deuda 500 M − caja 700 M = −200 M → tiene 200 M más de lo que debe.'],
    formula: e => `${Mn(e.piezas.deudaTotal)} − ${Mn(e.piezas.caja)}` },
  { id: 'de', piso: 'F', grupo: 'Deuda', nombre: 'Deuda / patrimonio', unidad: '', op: '≤', valor: 1, dec: 2, fuente: 'EDGAR', v: e => e.m.de,
    ayuda: ['Deuda / patrimonio (D/E)', 'Deuda total ÷ patrimonio. Más de 1 = mucha deuda. Es un primer filtro: no dice si la empresa puede pagarla (para eso, la cobertura de intereses). Con patrimonio negativo no se calcula.', 'Deuda 300 M ÷ patrimonio 600 M = 0,50.'],
    formula: e => `${Mn(e.piezas.deudaTotal)} ÷ ${Mn(e.piezas.patrimonio)}` },
  { id: 'ventas5', piso: 'F', grupo: 'Crecimiento', nombre: 'Ventas: crecimiento en 5 años', unidad: '%', op: '≥', valor: 50, dec: 0, fuente: 'EDGAR', v: e => e.m.ventas5,
    ayuda: ['Crecimiento de las ventas en 5 años', 'Cuánto han crecido las ventas en 5 ejercicios, en total (último ejercicio anual frente al de 5 años antes). Capta empresas que crecen aunque aún ganen poco.', 'De 800 M a 1.400 M: 1.400 ÷ 800 = 1,75 → +75 %.'],
    formula: e => `${Mn(e.m.ventasHace5)} → ${Mn(e.m.ventasUltFy)}` },
  { id: 'fcf', piso: 'F', grupo: 'Crecimiento', nombre: 'Flujo de caja libre', unidad: 'M', op: '≥', valor: 0, dec: 0, fuente: 'EDGAR', v: e => e.m.fcf,
    ayuda: ['Flujo de caja libre', 'Dinero que genera el negocio − lo que invierte en instalaciones y equipos. Positivo = se financia sola, sin pedir prestado. Últimos 12 meses si los hay; si no, el último ejercicio.', 'Genera 350 M − invierte 120 M = 230 M.'],
    formula: e => `${Mn(e.piezas.flujoOper)} − ${Mn(e.piezas.capex)}` },
  { id: 'per', piso: 'F', grupo: 'Precio', nombre: 'PER', unidad: '', op: '≤', valor: 30, dec: 1, fuente: 'EDGAR + precio', v: e => e.m.per,
    ayuda: ['PER (precio ÷ beneficio)', 'Cuánto pagas por cada dólar de beneficio de un año (últimos 12 meses). Menos de 20, bajo; 20–30, medio; más de 30, exige mucho crecimiento. Sin beneficio no hay PER. Solo con cuentas en dólares.', 'Capitalización 20.000 M ÷ beneficio 1.000 M = 20.'],
    formula: e => e.m.per == null ? (e.moneda && e.moneda !== 'USD' ? `cuentas en ${e.moneda}: no se calcula` : 'sin beneficio') : `${Mn(e.m.capitalizacion)} ÷ ${Mn(e.piezas.beneficio)}` },
  { id: 'pegPas', piso: 'F', grupo: 'Precio', nombre: 'PEG con crecimiento pasado', unidad: '', op: '≤', valor: 1.5, dec: 2, fuente: 'EDGAR', v: e => e.m.pegPas,
    ayuda: ['PEG con crecimiento pasado', 'PER ÷ lo que creció el beneficio cada año en los últimos 5 ejercicios. Se puede calcular en cualquier fecha pasada (servirá para probarlo). Se usa el beneficio neto y no el beneficio por acción porque el de hace 5 años no está ajustado por los splits.', 'PER 30 ÷ crecimiento 20 % al año = 1,5.'],
    formula: e => e.m.pegPas == null ? 'sin PER o sin crecimiento' : `${fmt(e.m.per)} ÷ ${fmt(e.m.crecPasado)}` },
  { id: 'pegEsp', piso: 'F', grupo: 'Precio', nombre: 'PEG esperado', unidad: '', op: '≤', valor: 1.5, dec: 2, fuente: 'Yahoo · solo hoy', v: e => e.m.pegEsp,
    ayuda: ['PEG esperado (analistas)', 'El PEG que publica Yahoo con el crecimiento que esperan los analistas para los próximos 5 años. Menos de 1, barata; 1–2, normal; 2–3, cara; más de 3, muy cara. Solo existe el dato de hoy: no sirve para probar en el pasado.', 'PER 30 ÷ crecimiento esperado 25 % al año = 1,2.'],
    formula: e => e.m.pegEsp == null ? 'Yahoo no lo da' : `dato de Yahoo${e.pegFecha ? ' del ' + e.pegFecha.split('-').reverse().join('/') : ''}` },
  { id: 'psSector', piso: 'F', grupo: 'Precio', nombre: 'Precio/ventas bajo la mediana de su sector', bool: true, fuente: 'EDGAR + precio',
    v: e => e.m.ps != null && e.m.psSector != null ? e.m.ps <= e.m.psSector : null,
    mostrar: e => `${fmt(e.m.ps, 2)} frente a ${fmt(e.m.psSector, 2)}`,
    ayuda: ['Precio/ventas frente a su sector', 'Capitalización ÷ ventas, comparado con la mediana de las empresas del universo de su mismo sector. Sirve también para empresas que aún no ganan dinero.', '10.000 M ÷ 2.000 M de ventas = 5; la mediana del sector es 4 → más cara que su sector (✗).'] },
  // Piso 2 (parte 2 del screener): se enseñan sin poder encenderlos.
  { id: 'ema200', piso: 'T', grupo: 'Tendencia y precio', nombre: 'Precio por encima de la EMA 200', proximamente: true },
  { id: 'dist52', piso: 'T', grupo: 'Tendencia y precio', nombre: 'Cerca del máximo de 52 semanas', proximamente: true },
  { id: 'rvol', piso: 'T', grupo: 'Tendencia y precio', nombre: 'Volumen relativo', proximamente: true },
  { id: 'sector', piso: 'T', grupo: 'Tendencia y precio', nombre: 'Su sector va mejor que el SPY (3 meses)', proximamente: true },
  { id: 'senal', piso: 'T', grupo: 'Tus estrategias', nombre: 'Da señal de compra hoy con…', proximamente: true },
  { id: 'nivel', piso: 'T', grupo: 'Niveles y figuras · por decidir', nombre: 'Rompe un nivel importante', proximamente: true },
  { id: 'estructura', piso: 'T', grupo: 'Niveles y figuras · por decidir', nombre: 'Cazador · Estructura (HH/HL, BOS…)', proximamente: true },
]
export const FILTRO = Object.fromEntries(FILTROS.map(f => [f.id, f]))
export const FILTROS_ACTIVOS = FILTROS.filter(f => !f.proximamente)

export const AYUDAS = {
  exigido: ['Crecimiento que exige el precio', 'PER ÷ el PEG que te parece razonable (por defecto 2). Es el crecimiento anual del beneficio que haría falta durante 5 años para que el precio fuera razonable. Compáralo con lo que esperan los analistas.', 'PER 40 ÷ PEG 2 = 20 % al año. Si los analistas esperan un 12 %, el precio pide más de lo esperado.'],
  sectores: ['Sectores que se quitan', 'Las financieras, energía, utilities, materiales e inmobiliario tienen otras reglas de deuda y márgenes: comparadas con el resto, saldrían mal o bien sin motivo. Por defecto se quitan; puedes volver a incluirlas. El sector es el oficial del S&P 500 (GICS); en las demás, una aproximación con el código de actividad que declaran a la SEC (SIC).', null],
  cuenta: ['Cuántos valores quita', 'El número rojo dice cuántos valores de los que llegan a ese piso no pasan este filtro (mirándolo solo a él). Sirve para ver qué filtro es el que más recorta.', 'Llegan 300 valores; 120 tienen ROCE menor que 25 % → «−120».'],
}

// ¿Pasa la empresa el filtro con la configuración c = { on, op, valor }? Un filtro apagado pasa siempre.
export function pasa(e, f, c) {
  if (!c || !c.on || f.proximamente) return true
  const x = f.v(e)
  if (f.bool) return x === true
  if (x == null) return !!(f.sinDato && f.sinDato(e))
  return c.op === '≥' ? x >= c.valor : x <= c.valor
}

// Evalúa una vista sobre las empresas (con sus métricas). Devuelve el embudo { universo, quitadosSector, f1, f2 } (listas),
// cuantos (id → cuántos quita cada filtro encendido, sobre lo que llega a su piso) y pasaTodo (Set de símbolos).
export function evaluaVista(empresas, vista) {
  const filtros = vista.filtros || {}
  const fuera = new Set(vista.sectoresFuera || [])
  const u = empresas.filter(e => enUniverso(e, vista) && !fuera.has(e.sector))
  const quitadosSector = empresas.filter(e => enUniverso(e, vista)).length - u.length
  const pisoF = FILTROS_ACTIVOS.filter(f => f.piso === 'F')
  const pisoT = FILTROS_ACTIVOS.filter(f => f.piso === 'T')
  const f1 = u.filter(e => pisoF.every(f => pasa(e, f, filtros[f.id])))
  const f2 = f1.filter(e => pisoT.every(f => pasa(e, f, filtros[f.id])))
  const cuantos = {}
  for (const f of FILTROS_ACTIVOS) {
    const c = filtros[f.id]; if (!c || !c.on) continue
    const base = f.piso === 'F' ? u : f1
    cuantos[f.id] = base.filter(e => !pasa(e, f, c)).length
  }
  return { universo: u, quitadosSector, f1, f2, cuantos, pasaTodo: new Set(f2.map(e => e.simbolo)) }
}
// La empresa está en el universo elegido (S&P 500, Nasdaq-100 y/o tus listas).
export function enUniverso(e, vista) {
  const u = vista.universo || { sp500: true, ndx: true, listas: true }
  return (u.sp500 && e.en_sp500) || (u.ndx && e.en_ndx) || (u.listas && e.en_listas)
}
