// lib/screener/filtros.js — el CATÁLOGO de filtros del screener y cómo se evalúa una vista (docs/screener.md). Lógica PURA.
//
// Cada filtro: id, piso ('F' fundamentales · 'T' técnico), grupo, nombre, y o bien
//   · numérico: unidad, op por defecto ('≥' | '≤'), valor por defecto, dec (decimales) y v(e) → número o null;
//   (desde V9.1167 todos son numéricos: se pueden ordenar). titulo(e): el tooltip de su celda (de dónde sale la cifra); orden(e): el
//   valor para ordenar cuando v(e) es null (p. ej. «sin deuda a corto» = el mejor); signo: con «+» si es positivo.
// fuente: de dónde sale el dato (Yahoo se pinta en amarillo). ayuda: [título, explicación, ejemplo] para su «?» (ejemplos
// con cifras inventadas que cuadran con calculadora). formula(e): la cuenta con las cifras de esa empresa, para el cajón.
// Un dato que falta (null) NO pasa el filtro (la tabla lo dice con «—»), salvo la cobertura de intereses cuando la empresa no
// declara gasto de intereses (no paga: la cubre).
//
// Piso técnico (parte 2, fase 2a): las cifras salen de e.t (lib/screener/datos.js, conTecnico; lib/screener/tecnico.js), con el
// cierre de la última vela cerrada. Los niveles y figuras aún no se pueden encender.
// «Da señal de compra con…» (fase 2b, §11): conEstrategia (la vista guarda también el id de la estrategia, c.estrategia); v(e) = hace
// cuántas velas fue la señal (e.senal, lib/screener/senales.js; la pantalla lo calcula con /api/screener-senales); pasa con
// «en las últimas N velas» (pasaCon) y su celda dice «la última» / «hace N velas» (texto). Sin estrategia elegida no quita nada.

import { ETF_SECTOR } from './tecnico'
import { pasaSenal, textoHace } from './senales'

const fmt = (x, d = 1) => x == null || !Number.isFinite(x) ? '—' : x.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: 'always' })
const fechaTx = (iso) => iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '—'
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
  // V9.1167: los tres filtros que eran de sí o no (ROE mejor que hace 3 años, caja ≥ deuda a corto, P/S bajo su sector) pasan a ser
  // NÚMEROS (se pueden ordenar); se quedan con su id para que las vistas guardadas sigan teniéndolos encendidos (vista.js los completa).
  { id: 'roeMejora', piso: 'F', grupo: 'Rentabilidad', nombre: 'Cambio del ROE en 3 años', unidad: 'puntos', op: '≥', valor: 0, dec: 1, signo: true, fuente: 'EDGAR',
    v: e => e.m.roeFy != null && e.m.roeFy > 0 && e.m.roe3 != null ? e.m.roeFy - e.m.roe3 : null,
    titulo: e => e.m.roeFy == null || e.m.roe3 == null ? 'Sin los dos ejercicios para comparar' : `ROE ${fmt(e.m.roeFy)} %${e.m.roeFyAnio ? ' (' + e.m.roeFyAnio + ')' : ''} frente a ${fmt(e.m.roe3)} %${e.m.roe3Anio ? ' (' + e.m.roe3Anio + ')' : ''}${e.m.roeFy <= 0 ? ' · el ROE de ahora no es positivo: no cuenta como mejora' : ''}`,
    ayuda: ['Cambio del ROE en 3 años (en puntos)', '¿El negocio mejora o empeora? ROE del último ejercicio anual − ROE de 3 ejercicios antes, en puntos. Solo cuenta si el ROE de ahora es positivo: una empresa que pierde menos que antes no «mejora» a efectos del filtro. Las empresas cuya rentabilidad venía cayendo suelen ir peor después.', 'ROE del último ejercicio 20 % y 16 % tres ejercicios antes: 20 − 16 = +4 puntos → mejora.'],
    formula: e => e.m.roeFy == null || e.m.roe3 == null ? 'sin los dos ejercicios' : `${fmt(e.m.roeFy)} % − ${fmt(e.m.roe3)} %` },
  { id: 'cajaCubre', piso: 'F', grupo: 'Deuda', nombre: 'Caja / deuda a corto plazo', unidad: 'veces', op: '≥', valor: 1, dec: 2, fuente: 'EDGAR',
    v: e => e.piezas.caja != null && e.piezas.deudaCorto > 0 ? e.piezas.caja / e.piezas.deudaCorto : null,
    sinDato: e => e.piezas.caja != null && e.piezas.deudaCorto === 0 ? 'sin deuda a corto' : null,
    orden: e => e.piezas.caja != null && e.piezas.deudaCorto === 0 ? Infinity : null,
    titulo: e => `Caja ${Mn(e.piezas.caja)} frente a deuda a corto ${Mn(e.piezas.deudaCorto)}`,
    ayuda: ['Caja / deuda a corto plazo (en veces)', 'Cuántas veces cubre la caja (caja + inversiones a corto plazo) la deuda que vence en los próximos 12 meses, que es la peligrosa: si no se puede pagar o refinanciar, hay riesgo de quiebra. Sin deuda a corto, la cubre siempre.', 'Caja 400 M ÷ deuda que vence este año 250 M = 1,60 veces → la cubre.'],
    formula: e => `${Mn(e.piezas.caja)} ÷ ${Mn(e.piezas.deudaCorto)}` },
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
  { id: 'psSector', piso: 'F', grupo: 'Precio', nombre: 'Precio/ventas frente a su sector', unidad: '%', op: '≤', valor: 0, dec: 1, signo: true, fuente: 'EDGAR + precio',
    v: e => e.m.ps != null && e.m.psSector > 0 ? (e.m.ps / e.m.psSector - 1) * 100 : null,
    titulo: e => `P/S ${fmt(e.m.ps, 2)} frente a ${fmt(e.m.psSector, 2)} de la mediana de su sector`,
    ayuda: ['Precio/ventas frente a su sector (en %)', 'Capitalización ÷ ventas (P/S), comparado con la mediana de las empresas del universo de su mismo sector: cuánto más cara (+) o más barata (−) que la típica de su sector. Sirve también para empresas que aún no ganan dinero.', 'P/S 5 y mediana del sector 4: 5 ÷ 4 − 1 = +25 % → más cara que su sector.'],
    formula: e => `${fmt(e.m.ps, 2)} ÷ ${fmt(e.m.psSector, 2)} − 1` },
  // Piso 2 · Técnico (parte 2, fase 2a).
  { id: 'ema200', piso: 'T', grupo: 'Tendencia y precio', nombre: 'Precio frente a la EMA 200', unidad: '%', op: '≥', valor: 0, dec: 1, signo: true, fuente: 'precios',
    v: e => e.t?.emaDist ?? null,
    titulo: e => e.tecnico?.ema200 ? `Cierre ${fmt(e.tecnico.cierre, 2)} frente a EMA 200 ${fmt(e.tecnico.ema200, 2)} (velas diarias, ${fechaTx(e.tecnico.fecha)})` : 'Sin precios o con menos de 200 velas',
    ayuda: ['Precio frente a la EMA 200 (en %)', 'Cuánto está el último cierre por encima (+) o por debajo (−) de su media exponencial de 200 velas diarias (la misma EMA que usa el Builder). Por encima = tendencia de fondo alcista.', 'Cierre 105 y EMA 200 en 100: 105 ÷ 100 − 1 = +5 % → por encima.'],
    formula: e => e.tecnico?.ema200 ? `${fmt(e.tecnico.cierre, 2)} ÷ ${fmt(e.tecnico.ema200, 2)} − 1` : 'sin EMA 200' },
  // §16: la EMA 50 (tendencia de medio plazo) y la EMA 20 (de corto), detrás de la 200 (orden decidido con Sergi el 11/11).
  { id: 'ema50', piso: 'T', grupo: 'Tendencia y precio', nombre: 'Precio frente a la EMA 50', unidad: '%', op: '≥', valor: 0, dec: 1, signo: true, fuente: 'precios',
    v: e => e.t?.ema50Dist ?? null,
    titulo: e => e.tecnico?.ema50 ? `Cierre ${fmt(e.tecnico.cierre, 2)} frente a EMA 50 ${fmt(e.tecnico.ema50, 2)} (velas diarias, ${fechaTx(e.tecnico.fecha)})` : 'Sin precios o sin la EMA 50 calculada (pulsa «Actualizar precios»)',
    ayuda: ['Precio frente a la EMA 50 (en %)', 'Cuánto está el último cierre por encima (+) o por debajo (−) de su media exponencial de 50 velas diarias: la tendencia de medio plazo.', 'Cierre 110 y EMA 50 en 100: 110 ÷ 100 − 1 = +10 % → por encima.'],
    formula: e => e.tecnico?.ema50 ? `${fmt(e.tecnico.cierre, 2)} ÷ ${fmt(e.tecnico.ema50, 2)} − 1` : 'sin EMA 50' },
  { id: 'ema20', piso: 'T', grupo: 'Tendencia y precio', nombre: 'Precio frente a la EMA 20', unidad: '%', op: '≥', valor: 0, dec: 1, signo: true, fuente: 'precios',
    v: e => e.t?.ema20Dist ?? null,
    titulo: e => e.tecnico?.ema20 ? `Cierre ${fmt(e.tecnico.cierre, 2)} frente a EMA 20 ${fmt(e.tecnico.ema20, 2)} (velas diarias, ${fechaTx(e.tecnico.fecha)})` : 'Sin precios o sin la EMA 20 calculada (pulsa «Actualizar precios»)',
    ayuda: ['Precio frente a la EMA 20 (en %)', 'Lo mismo con la media exponencial de 20 velas diarias: la tendencia de corto plazo. Un valor un poco por debajo de su EMA 20 pero por encima de la 50 y la 200 suele ser un retroceso dentro de una subida.', 'Cierre 98 y EMA 20 en 100: 98 ÷ 100 − 1 = −2 % → un poco por debajo.'],
    formula: e => e.tecnico?.ema20 ? `${fmt(e.tecnico.cierre, 2)} ÷ ${fmt(e.tecnico.ema20, 2)} − 1` : 'sin EMA 20' },
  { id: 'dist52', piso: 'T', grupo: 'Tendencia y precio', nombre: 'Distancia al máximo de 52 semanas', unidad: '%', op: '≤', valor: 5, dec: 1, fuente: 'precios',
    v: e => e.t?.dist52 ?? null,
    titulo: e => e.tecnico?.max52 ? `Máximo de 52 semanas ${fmt(e.tecnico.max52, 2)} · cierre ${fmt(e.tecnico.cierre, 2)} (${fechaTx(e.tecnico.fecha)})` : 'Sin un año de precios',
    ayuda: ['Distancia al máximo de 52 semanas (en %)', 'Cuánto le falta al último cierre para volver al máximo de las últimas 52 semanas (252 velas diarias, contando la de hoy). 0 % = está en máximos. Los valores cerca de sus máximos suelen ser los más fuertes.', 'Máximo 120 y cierre 114: (120 − 114) ÷ 120 = 5 %.'],
    formula: e => e.tecnico?.max52 ? `(${fmt(e.tecnico.max52, 2)} − ${fmt(e.tecnico.cierre, 2)}) ÷ ${fmt(e.tecnico.max52, 2)}` : 'sin un año de precios' },
  { id: 'rvol', piso: 'T', grupo: 'Tendencia y precio', nombre: 'Volumen relativo', unidad: 'veces', op: '≥', valor: 2, dec: 2, fuente: 'precios',
    v: e => e.t?.rvol ?? null,
    titulo: e => e.tecnico?.volMedio50 ? `Volumen ${fmt(e.tecnico.volUlt, 0)} frente a ${fmt(e.tecnico.volMedio50, 0)} de media (${fechaTx(e.tecnico.fecha)})` : 'Sin volumen',
    ayuda: ['Volumen relativo (en veces)', 'Volumen de la última vela ÷ volumen medio de las 50 anteriores. Mucho volumen = entra dinero grande: confirma una ruptura. Es de UN día: cambia mucho de un día a otro.', '2,4 M de acciones hoy ÷ 1,2 M de media = 2,00 veces.'],
    formula: e => e.tecnico?.volMedio50 ? `${fmt(e.tecnico.volUlt, 0)} ÷ ${fmt(e.tecnico.volMedio50, 0)}` : 'sin volumen' },
  { id: 'sector', piso: 'T', grupo: 'Tendencia y precio', nombre: 'Su sector frente al SPY (3 meses)', unidad: 'puntos', op: '≥', valor: 0, dec: 1, signo: true, fuente: 'precios',
    v: e => e.t?.sector ?? null,
    titulo: e => e.t?.sector == null ? (ETF_SECTOR[e.sector] ? `Sin precios de ${ETF_SECTOR[e.sector]} o del SPY` : 'Su sector no tiene ETF') : `${ETF_SECTOR[e.sector]} (${e.sector}) frente al SPY en 3 meses (63 velas)`,
    ayuda: ['Su sector frente al SPY (en puntos)', 'Lo que ha subido en 3 meses (63 velas) el ETF de su sector (XLK tecnología, XLV salud…) menos lo que ha subido el SPY. Positivo = su sector va mejor que el mercado. Es igual para todas las empresas del mismo sector.', 'Sector +8 % y SPY +5 % en 3 meses: 8 − 5 = +3 puntos → va mejor.'],
    formula: e => ETF_SECTOR[e.sector] ? `${ETF_SECTOR[e.sector]} − SPY (3 meses)` : 'sin ETF de sector' },
  { id: 'senal', piso: 'T', grupo: 'Tus estrategias', nombre: 'Da señal de compra en las últimas', columna: 'Señal de compra', unidad: 'velas', op: '≤', valor: 1, dec: 0, fuente: 'tu estrategia',
    conEstrategia: true, v: e => e.senal?.hace ?? null, pasaCon: (x, c) => pasaSenal(x, c.valor), texto: x => textoHace(x),
    titulo: e => e.senal ? (e.senal.hace == null ? `Sin señal de compra en las últimas 20 velas (hasta el ${fechaTx(e.senal.ultima)})`
      : e.senal.tipo === 'nivel' ? `Compró el ${fechaTx(e.senal.fecha)} a ${fmt(e.senal.precio, 2)} al tocar el nivel de la orden` : `Señal al cierre del ${fechaTx(e.senal.fecha)}: compra con la orden de tu estrategia (a la apertura siguiente, si es esa)`)
      : e.senalError ? `No se ha podido calcular: ${e.senalError}` : 'Aún no calculado (solo se calcula para los que pasan los fundamentales)',
    ayuda: ['Da señal de compra con una de tus estrategias', 'Usa una de tus estrategias de tarjetas (de velas diarias) con el mismo motor que el paso 1 del Builder. Pasa si la estrategia da señal de compra en las últimas N velas cerradas (1 = solo la última) sin tener ya la operación abierta. Con la compra a la apertura siguiente, una señal en la última vela quiere decir comprar mañana. Con una orden en un nivel (ruptura del máximo, swing…), cuenta la vela en que compró. Solo se calcula para los valores que pasan los fundamentales; tarda unos segundos.', 'Con «Cruce de medias 50/200» y N = 3: un valor cuyas medias se cruzaron hace 1 vela pasa («hace 1 vela»); uno en que se cruzaron hace 5 velas, no.'],
    formula: e => e.senal?.hace != null ? textoHace(e.senal.hace) + (e.senal.tipo === 'nivel' ? ` · compró a ${fmt(e.senal.precio, 2)}` : '') : 'sin señal' },
  { id: 'nivel', piso: 'T', grupo: 'Niveles y figuras · por decidir', nombre: 'Rompe un nivel importante', proximamente: true },
  { id: 'estructura', piso: 'T', grupo: 'Niveles y figuras · por decidir', nombre: 'Cazador · Estructura (HH/HL, BOS…)', proximamente: true },
]
// El valor recomendado de cada filtro (para empezar; referencias habituales y los umbrales de las tesis de Sergi, no recomendaciones
// de inversión). Va como 4.º elemento de su ayuda.
export const RECOMENDADO = {
  roce: '≥ 25 % (30 % = muy exigente).',
  roa: '≥ 10 %.',
  roe: '≥ 15 %.',
  roeMejora: '≥ 0 puntos (que no empeore).',
  cajaCubre: '≥ 1 vez (1,5 si quieres margen).',
  cobInt: '≥ 3 veces (mejor ≥ 10).',
  deudaNeta: '≤ 0 (más caja que deuda).',
  de: '≤ 1 (0,5 = prudente).',
  ventas5: '≥ 50 % (≈ 8,4 % al año).',
  fcf: '> 0 (≥ 0 en el filtro).',
  per: '≤ 20 bajo · ≤ 30 medio.',
  pegPas: '≤ 1 barato · ≤ 2 razonable.',
  pegEsp: '≤ 1 barato · ≤ 2 razonable.',
  psSector: '≤ 0 % (no más cara que su sector).',
  ema200: '≥ 0 % (por encima de la EMA 200).',
  ema50: '≥ 0 % (por encima de la EMA 50).',
  ema20: '≥ 0 % (por encima) para seguir la subida · ≤ 0 % para comprar en un retroceso.',
  dist52: '≤ 5 % (≤ 10 % si quieres más valores).',
  rvol: '≥ 1,5 veces (≥ 2 = día de mucho volumen).',
  sector: '≥ 0 puntos (su sector va mejor que el mercado).',
  senal: '1 vela (solo la última: comprar mañana) · 3–5 si no lo miras cada día.',
}
for (const fl of FILTROS) if (fl.ayuda && RECOMENDADO[fl.id]) fl.ayuda = [...fl.ayuda.slice(0, 3), RECOMENDADO[fl.id]]
export const FILTRO = Object.fromEntries(FILTROS.map(f => [f.id, f]))
export const FILTROS_ACTIVOS = FILTROS.filter(f => !f.proximamente)

export const AYUDAS = {
  exigido: ['Crecimiento que exige el precio', 'PER ÷ el PEG que te parece razonable (por defecto 2). Es el crecimiento anual del beneficio que haría falta durante 5 años para que el precio fuera razonable. Al lado, el que esperan los analistas (PER ÷ PEG esperado de Yahoo): si el exigido es mayor, sale en rojo (el precio pide más de lo esperado).', 'PER 40 ÷ PEG 2 = 20 % al año. Si los analistas esperan un 12 %, el precio pide más de lo esperado.', '1,5–2.'],
  sectores: ['Sectores', 'Marcados, los sectores que se miran; desmarcados y en gris, los que se quitan (pulsa uno para cambiarlo). Se recomienda quitar financieras, energía, utilities, materiales e inmobiliario: tienen otras reglas de deuda y márgenes, y comparadas con el resto saldrían mal o bien sin motivo. Por defecto se quitan; pasa el ratón por cada uno para ver por qué. El sector es el oficial del S&P 500 (GICS); en las demás, una aproximación con el código de actividad que declaran a la SEC (SIC).', null],
  mercado: ['Mercado a favor', 'Una sola línea para todo el screener: el SPY por encima o por debajo de su EMA 200 de velas diarias. No quita valores: solo te lo recuerda (muchas estrategias solo compran con el mercado por encima).', 'SPY cierra en 540 y su EMA 200 está en 515: 540 ÷ 515 − 1 = +4,9 % → por encima.', null],
  precios: ['Actualizar precios', 'Descarga el último cierre de cada valor del universo (unas 600 empresas, más el SPY y los ETF de sectores) y vuelve a calcular las cifras del piso técnico. Tarda unos 2–3 minutos; se puede parar. Los precios se guardan en la caché de la app, la misma de los backtests. Los precios NO se actualizan solos: solo con este botón (más adelante, con las Alertas, cada día tras el cierre de Nueva York). Los fundamentales no cambian: se cargan una vez por semana.', null, null],
  cuenta: ['Cuántos valores quita', 'El número rojo dice cuántos valores de los que llegan a ese piso no pasan este filtro (mirándolo solo a él). Sirve para ver qué filtro es el que más recorta.', 'Llegan 300 valores; 120 tienen ROCE menor que 25 % → «−120».'],
}

// ¿Pasa la empresa el filtro con la configuración c = { on, op, valor }? Un filtro apagado pasa siempre.
export function pasa(e, f, c) {
  if (!c || !c.on || f.proximamente) return true
  if (f.conEstrategia && c.estrategia == null) return true   // sin estrategia elegida no quita nada
  const x = f.v(e)
  if (f.pasaCon) return f.pasaCon(x, c)
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
