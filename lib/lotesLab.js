// lib/lotesLab.js — lotes OFICIALES del laboratorio de señales: configuraciones declaradas de antemano, congeladas, con su
// huella. Una prueba solo es «oficial» si su configuración coincide exactamente (misma huella) con un elemento de un lote
// declarado aquí; cualquier otra es «exploratoria» (lib/registroLab.js). Puro (la huella usa crypto.subtle, que existe
// igual en el navegador y en Node).
//
// HUELLA: sha256 del JSON CANÓNICO (claves de los objetos en orden, sin espacios; los arrays conservan su orden). La del
// lote entero está escrita abajo (LOTE_1_HASH) y la comprueba una prueba: si alguien toca el lote, deja de cuadrar.
import { validaCombinacion, validaSalidas } from './senales'
import { veredictoLab } from './laboratorio'
import CALIBRACION from './calibracionLab.json'
import { validaRegla, reglaFiltro, COSTES_DEFECTO, validaCostes } from './laboratorioCartera'
import SINTETICOS from './etfSinteticos.json'

// JSON canónico: objetos con las claves ordenadas, recursivamente.
export function jsonCanonico(x) {
  if (x === null || typeof x !== 'object') return JSON.stringify(x)
  if (Array.isArray(x)) return '[' + x.map(jsonCanonico).join(',') + ']'
  return '{' + Object.keys(x).filter(k => x[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + jsonCanonico(x[k])).join(',') + '}'
}
export async function sha256Hex(texto) {
  const datos = new TextEncoder().encode(texto)
  const h = await globalThis.crypto.subtle.digest('SHA-256', datos)
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('')
}
export const huella = (x) => sha256Hex(jsonCanonico(x))
const congela = (x) => { if (x && typeof x === 'object') { Object.values(x).forEach(congela); Object.freeze(x) } return x }

// ── LOTE_1 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
const cruce = (tipo, rapida, lenta) => ({ id: 'cruceMedias', params: { tipoRapida: tipo, periodoRapida: rapida, tipoLenta: tipo, periodoLenta: lenta } })
const ruptura = (n) => ({ id: 'ruptura', params: { n } })
export const LOTE_1 = congela({
  id: 'LOTE_1',
  nombre: 'Lote 1 · señales clásicas',
  comun: {
    universo: { indice: 'NDX', regla: 'miembros del Nasdaq-100 en cada fecha', fuente: 'universo_miembros', sinExcluidos: true },
    intervalo: 'diario',
    entrada: 'apertura de la vela siguiente',
    salida: { tipo: 'velas', n: 20 },
    periodos: [{ desde: '2016-01-01', hasta: '2020-12-31' }, { desde: '2021-01-01', hasta: '2025-12-31' }],
    minimoOperaciones: 100,
    criterio: { medida: 'mediana del rendimiento por operación', percentilMinimo: 95, frente: 'azar', periodos: 'ambos' },
  },
  items: [
    { id: '1a', nombre: 'Cruce EMA 10 / EMA 11', disparador: cruce('EMA', 10, 11), filtros: [] },
    { id: '1b', nombre: 'Cruce EMA 20 / EMA 50', disparador: cruce('EMA', 20, 50), filtros: [] },
    { id: '1c', nombre: 'Cruce EMA 50 / EMA 200', disparador: cruce('EMA', 50, 200), filtros: [] },
    { id: '2', nombre: 'Ruptura de 20 velas', disparador: ruptura(20), filtros: [] },
    { id: '3', nombre: 'Ruptura de 55 velas', disparador: ruptura(55), filtros: [] },
    { id: '4', nombre: 'Nuevo máximo de 52 semanas', disparador: ruptura(252), filtros: [] },
    { id: '5', nombre: 'El precio cruza la SMA 50', disparador: { id: 'precioCruzaMedia', params: { tipo: 'SMA', periodo: 50 } }, filtros: [] },
    { id: '6', nombre: 'Retroceso: RSI 2 < 10 sobre la SMA 200', disparador: { id: 'retroceso', params: { periodoRsi: 2, umbral: 10, tipoMedia: 'SMA', periodoMedia: 200 } }, filtros: [] },
    { id: '7', nombre: 'Ruptura de 20 velas con volumen alto', disparador: ruptura(20), filtros: [{ id: 'volumenAlto', params: { k: 1.5, n: 20 } }] },
    { id: '8', nombre: 'Ruptura de 20 velas con mercado alcista', disparador: ruptura(20), filtros: [{ id: 'mercadoAlcista', params: { tipo: 'SMA', periodo: 200 } }] },
  ],
})
// sha256 del JSON canónico de LOTE_1 (comprobado en una prueba).
export const LOTE_1_HASH = '74510542b541a9f4073514b9125bf5a07c1fb466bb1041db69969c5307621a29'

// ── LOTE_2 · salidas ───────────────────────────────────────────────────────────────────────────────────────────────────
// Mide cada SALIDA por separado: las entradas son al azar y fijas (las mismas señales para todas las salidas), así la
// entrada no aporta nada. Días candidatos de cada valor: miembro del índice, con datos, con TODOS los indicadores del
// calentamiento calculados (el mismo para todas las salidas) y con vela de entrada; cada uno es señal con probabilidad
// 1/20 (semilla declarada). Una operación por valor a la vez: las señales con la posición abierta se ignoran y se
// cuentan. Medida principal: la MEDIA por operación frente al azar por permutación exacta (lib/laboratorioSalidas.js).
const tope = (n) => ({ id: 'tiempoMaximo', params: { n } })
const bajoMedia = (tipo, periodo) => ({ id: 'cierreBajoMedia', params: { tipo, periodo } })
export const LOTE_2 = congela({
  id: 'LOTE_2',
  tipo: 'salidas',
  nombre: 'Lote 2 · salidas',
  comun: {
    universo: { indice: 'NDX', regla: 'miembros del Nasdaq-100 en cada fecha', fuente: 'universo_miembros', sinExcluidos: true },
    intervalo: 'diario',
    entrada: 'apertura de la vela siguiente',
    entradas: {
      tipo: 'azar', probabilidad: 0.05, semilla: 20261016,
      calentamiento: [{ indicador: 'EMA', periodo: 10 }, { indicador: 'EMA', periodo: 20 }, { indicador: 'SMA', periodo: 50 }, { indicador: 'ATR', periodo: 14 }, { indicador: 'RSI', periodo: 14 }],
    },
    unaOperacionPorValor: true,
    periodos: [{ desde: '2016-01-01', hasta: '2020-12-31' }, { desde: '2021-01-01', hasta: '2025-12-31' }],
    minimoOperaciones: 100,
    criterio: { medida: 'media del rendimiento por operación', percentilMinimo: 95, frente: 'azar: mismas entradas, duraciones reales del valor', metodoAzar: 'permutación exacta de las duraciones reales de cada valor, sin solapes', periodos: 'ambos' },
  },
  items: [
    { id: 'S1', nombre: 'Cierre bajo la EMA 10 (tope 120)', salidas: [bajoMedia('EMA', 10), tope(120)] },
    { id: 'S2', nombre: 'Cierre bajo la EMA 20 (tope 120)', salidas: [bajoMedia('EMA', 20), tope(120)] },
    { id: 'S3', nombre: 'Cierre bajo la SMA 50 (tope 120)', salidas: [bajoMedia('SMA', 50), tope(120)] },
    { id: 'S4', nombre: 'Stop móvil 3 ATR 14 (tope 120)', salidas: [{ id: 'stopMovilATR', params: { k: 3, n: 14 } }, tope(120)] },
    { id: 'S5', nombre: 'Stop fijo 2 ATR 14 o 20 velas', salidas: [{ id: 'stopFijoATR', params: { k: 2, n: 14 } }, tope(20)] },
    { id: 'S6', nombre: 'RSI 14 > 70 o 60 velas', salidas: [{ id: 'rsiSobrecompra', params: { n: 14, umbral: 70 } }, tope(60)] },
  ],
})
// sha256 del JSON canónico de LOTE_2 (comprobado en una prueba).
export const LOTE_2_HASH = 'c9df02acc17d61b028d5582aab2034325edb0d85ceeb1f4f8912450b06d43fab'

// ── LOTE_3 · estrategias completas ─────────────────────────────────────────────────────────────────────────────────────
// Entrada (disparador del catálogo de señales) + salida (salidas del catálogo con su tope) contra la MISMA estrategia hecha
// al azar: por valor, las mismas duraciones reales en fechas de señal al azar entre los días válidos, sin solaparse
// (lib/laboratorioEstrategias.js). Criterio 4: solo da veredicto si la combinación está CALIBRADA (falsos aprobados en un
// periodo <= 10 % en la calibración con paseos aleatorios sin ventaja, lib/calibracionLab.json).
const ENTRADAS_L3 = {
  E1: { nombre: 'Cruce EMA 10 / EMA 11', disparador: cruce('EMA', 10, 11) },
  E2: { nombre: 'Cruce EMA 20 / EMA 50', disparador: cruce('EMA', 20, 50) },
  E3: { nombre: 'El precio cruza la SMA 50', disparador: { id: 'precioCruzaMedia', params: { tipo: 'SMA', periodo: 50 } } },
  E4: { nombre: 'El RSI 14 cruza por encima de 55', disparador: { id: 'rsiCruzaArriba', params: { periodoRsi: 14, umbral: 55 } } },
}
const SALIDAS_L3 = {
  X1: { nombre: 'cierre bajo la EMA 10 (tope 120)', salidas: [bajoMedia('EMA', 10), tope(120)] },
  X2: { nombre: 'cierre bajo la SMA 50 (tope 120)', salidas: [bajoMedia('SMA', 50), tope(120)] },
  X3: { nombre: 'RSI 14 > 70 o 60 velas', salidas: [{ id: 'rsiSobrecompra', params: { n: 14, umbral: 70 } }, tope(60)] },
}
export const LOTE_3 = congela({
  id: 'LOTE_3',
  tipo: 'estrategias',
  criterioVersion: 4,
  nombre: 'Lote 3 · estrategias completas',
  comun: {
    universo: { indice: 'NDX', regla: 'miembros del Nasdaq-100 en cada fecha', fuente: 'universo_miembros', sinExcluidos: true },
    intervalo: 'diario',
    entrada: 'apertura de la vela siguiente',
    unaOperacionPorValor: true,
    periodos: [{ desde: '2016-01-01', hasta: '2020-12-31' }, { desde: '2021-01-01', hasta: '2025-12-31' }],
    minimoOperaciones: 100,
    criterio: { medida: 'media del rendimiento por operación', percentilMinimo: 95, periodos: 'ambos',
      frente: 'la misma estrategia al azar: las duraciones reales de cada valor en fechas de señal al azar entre los días válidos, sin solaparse',
      calibracion: 'solo combinaciones calibradas: falsos aprobados en un periodo <= 10 % con paseos aleatorios sin ventaja' },
  },
  items: Object.entries(ENTRADAS_L3).flatMap(([e, E]) => Object.entries(SALIDAS_L3).map(([x, X]) => ({
    id: `${e}${x}`, nombre: `${E.nombre} · ${X.nombre}`, disparador: E.disparador, filtros: [], salidas: X.salidas }))),
})
// sha256 del JSON canónico de LOTE_3 (comprobado en una prueba).
export const LOTE_3_HASH = '21d20102aff447d48818779a9210a46f4bc470232bfd633531627380dbd46b0b'

// ── CARTERA_1 · QQQ + apalancado ───────────────────────────────────────────────────────────────────────────────────────
// Máquinas de estados sobre el QQQ (lib/laboratorioCartera.js). Todo se mide en el QQQ, con cierres; se ejecuta a la
// apertura siguiente. La liquidez renta el 0 %. Rentabilidad total (dividendos reinvertidos) para todos los ETF.
const caida = (pct, ventana = 252) => ({ c: 'caidaDesdeMaximo', pct, ventana })
const cruceQqq = { c: 'cruceMedias', tipo: 'EMA', rapida: 10, lenta: 11 }
const ENTRADA_CICLO = (pct, fraccion = 0.5) => ({ desde: 'NORMAL', hacia: 'APALANCADO', si: [caida(pct), cruceQqq], hacer: [{ mover: 'QQQ', a: 'ETF', fraccionCartera: fraccion }], fijaMaxRef: true, iniciaCiclo: true })
const ESTADOS_CARTERA = {
  NORMAL: { nombre: 'Normal', composicion: '100 % QQQ' },
  APALANCADO: { nombre: 'Apalancado', composicion: 'QQQ + ETF apalancado (al entrar desde NORMAL, la mitad del valor pasa al ETF)' },
  ESPERA: { nombre: 'Espera', composicion: 'QQQ + liquidez al 0 %' },
}
// La regla de Sergi. pct: la caída desde el máximo (10 %).
export const reglaSergi = (pct = 10) => ({
  id: 'sergi', nombre: 'Regla de Sergi', inicial: 'NORMAL', estados: ESTADOS_CARTERA,
  transiciones: [
    ENTRADA_CICLO(pct),
    { desde: 'APALANCADO', hacia: 'ESPERA', si: [{ c: 'cierreBajoMedia', tipo: 'EMA', periodo: 10 }], hacer: [{ mover: 'ETF', a: 'LIQUIDEZ', todo: true }] },
    { desde: 'ESPERA', hacia: 'NORMAL', si: [{ c: 'cierreSobreMedia', tipo: 'EMA', periodo: 10 }, { c: 'haSuperadoMaxRef' }], hacer: [{ mover: 'LIQUIDEZ', a: 'QQQ', todo: true }], terminaCiclo: true },
    { desde: 'ESPERA', hacia: 'APALANCADO', si: [{ c: 'cierreSobreMedia', tipo: 'EMA', periodo: 10 }, { c: 'noHaSuperadoMaxRef' }], hacer: [{ mover: 'LIQUIDEZ', a: 'ETF', todo: true }] },
  ],
})
// La regla simple (comparación): misma entrada; el ETF hasta el primer cierre del QQQ por encima del máximo de referencia.
// fraccion: la parte del valor de la cartera que pasa al ETF en cada ciclo (0,5 en CARTERA_1; con 0,5 sale idéntica).
export const reglaSimple = (pct = 10, fraccion = 0.5) => ({
  id: 'simple', nombre: 'Regla simple', inicial: 'NORMAL', estados: { NORMAL: ESTADOS_CARTERA.NORMAL, APALANCADO: ESTADOS_CARTERA.APALANCADO },
  transiciones: [
    ENTRADA_CICLO(pct, fraccion),
    { desde: 'APALANCADO', hacia: 'NORMAL', si: [{ c: 'cierreSobreMaxRef' }], hacer: [{ mover: 'ETF', a: 'QQQ', todo: true }], terminaCiclo: true },
  ],
})
const P_QLD = [{ desde: '2008-01-01', hasta: '2015-12-31' }, { desde: '2016-01-01', hasta: '2020-12-31' }, { desde: '2021-01-01', hasta: '2025-12-31' }, { desde: '2008-01-01', hasta: '2025-12-31', total: true }]
const P_TQQQ = [{ desde: '2011-01-01', hasta: '2015-12-31' }, { desde: '2016-01-01', hasta: '2020-12-31' }, { desde: '2021-01-01', hasta: '2025-12-31' }, { desde: '2011-01-01', hasta: '2025-12-31', total: true }]
export const CARTERA_1 = congela({
  id: 'CARTERA_1',
  tipo: 'cartera',
  criterioVersion: 5,
  nombre: 'Cartera 1 · QQQ + apalancado',
  comun: {
    base: 'QQQ',
    precios: 'rentabilidad total: velas de la caché (ajustadas por splits) + dividendos reinvertidos (lib/dividendosCartera.json)',
    ejecucion: 'condiciones al cierre de t sobre el precio del QQQ; ejecución a la apertura de t+1',
    liquidez: '0 %',
    inicio: 'cada periodo empieza en NORMAL: 100 % QQQ comprado a la apertura de su primer día; un ciclo abierto al final se valora al último cierre',
    referencias: ['comprar y mantener QQQ', '50 % QQQ + 50 % ETF con rebalanceo el primer día hábil de cada año', 'comprar y mantener SPY'],
    azar: 'los ciclos reales como bloques (con su secuencia de estados y duraciones) en fechas de inicio al azar, sin solaparse, 1000 simulaciones',
    criterio: { orientativo: true, frente: 'comprar y mantener QQQ', subperiodos: 'el CAGR supera al del QQQ en todos los subperiodos',
      azar: 'además, percentil del CAGR >= 95 en el total si la variante está calibrada (falsos aprobados <= 10 %)' },
  },
  items: [
    { id: 'V1', nombre: 'Regla de Sergi + QLD', regla: reglaSergi(), etf: 'QLD', periodos: P_QLD },
    { id: 'V2', nombre: 'Regla de Sergi + TQQQ', regla: reglaSergi(), etf: 'TQQQ', periodos: P_TQQQ },
    { id: 'V3', nombre: 'Regla simple + QLD', regla: reglaSimple(), etf: 'QLD', periodos: P_QLD },
    { id: 'V4', nombre: 'Regla simple + TQQQ', regla: reglaSimple(), etf: 'TQQQ', periodos: P_TQQQ },
  ],
})
// sha256 del JSON canónico de CARTERA_1 (comprobado en una prueba).
export const CARTERA_1_HASH = '09f81f87c5053ea15828f298221c494a209156c23406f9371c521d1796892538'

// ── CARTERA_2 · mezclas fijas ──────────────────────────────────────────────────────────────────────────────────────────
// «Mezcla fija»: un único estado con qqq % QQQ + (100 − qqq) % ETF y un rebalanceo por calendario a esos pesos. No elige
// momentos: no tiene prueba contra el azar. Con qqq = 100 es comprar y mantener QQQ; con qqq = 0, comprar y mantener el ETF.
export const reglaMezcla = (qqq = 50, frecuencia = 'anual') => ({
  id: 'mezcla', nombre: 'Mezcla fija', inicial: 'MEZCLA',
  estados: { MEZCLA: { nombre: 'Mezcla', composicion: `${qqq} % QQQ + ${100 - qqq} % ETF (rebalanceo ${frecuencia})`, pesos: { QQQ: qqq / 100, ETF: (100 - qqq) / 100 } } },
  transiciones: [{ desde: 'MEZCLA', hacia: 'MEZCLA', calendario: frecuencia, rebalancea: true }],
})
const comparaCon = (item, etf) => ({ lote: 'CARTERA_1', item, nombre: `Regla simple + ${etf} (CARTERA_1 · ${item})`, regla: reglaSimple() })
export const CARTERA_2 = congela({
  id: 'CARTERA_2',
  tipo: 'cartera',
  criterioVersion: 6,
  nombre: 'Cartera 2 · mezclas fijas',
  comun: { ...CARTERA_1.comun, azar: 'sin azar: una mezcla fija no elige momentos',
    criterio: { comparativo: true, frente: ['comprar y mantener QQQ', 'la regla simple de CARTERA_1 con el mismo ETF (V3 / V4)'], impuestos: true } },
  items: [
    { id: 'M1', nombre: 'Mezcla fija 50 % QQQ + 50 % QLD (rebalanceo anual)', regla: reglaMezcla(50, 'anual'), etf: 'QLD', periodos: P_QLD, comparaCon: comparaCon('V3', 'QLD') },
    { id: 'M2', nombre: 'Mezcla fija 50 % QQQ + 50 % TQQQ (rebalanceo anual)', regla: reglaMezcla(50, 'anual'), etf: 'TQQQ', periodos: P_TQQQ, comparaCon: comparaCon('V4', 'TQQQ') },
  ],
})
// sha256 del JSON canónico de CARTERA_2 (comprobado en una prueba).
export const CARTERA_2_HASH = '1f6cb77df8a86b830be513308f885e01490aed7f0cc239c52da7ff877da60d2a'

// ── CARTERA_3 · mezcla con filtro de tendencia (V9.986) ────────────────────────────────────────────────────────────────
// La mezcla 50 % QQQ + 50 % ETF (×2 o ×3 SINTÉTICO de V9.984) con un filtro: fuera del mercado (solo el apalancado o todo)
// mientras el QQQ cierra por debajo de su SMA 50 o 200 (evaluación diaria). Desde 1999, con los sintéticos. Liquidez al 0 %.
// El ETF sintético (lib/etfSintetico.js) con los parámetros calibrados en V9.984 (lib/etfSinteticos.json).
const SINTETICOS_CFG = { comision: SINTETICOS.comision, ajuste: SINTETICOS.ajuste, tipos: SINTETICOS.tipos, calibrados: SINTETICOS.version, frente: { 2: 'QLD', 3: 'TQQQ' } }
const P_1999 = [{ desde: '1999-01-01', hasta: '2025-12-31', total: true }, { desde: '1999-01-01', hasta: '2007-12-31' }, { desde: '2008-01-01', hasta: '2015-12-31' },
  { desde: '2016-01-01', hasta: '2020-12-31' }, { desde: '2021-01-01', hasta: '2025-12-31' }]
export const NOMBRE_ALCANCE = Object.freeze({ apalancado: 'solo el apalancado', todo: 'todo a liquidez' })
const itemFiltro = (id, periodo, alcance, etf) => ({ id, nombre: `Filtro SMA ${periodo} · ${NOMBRE_ALCANCE[alcance]} · ${etf === 'x3' ? '×3' : '×2'} sintético`, regla: reglaFiltro(periodo, 'diario', alcance), etf, periodos: P_1999 })
export const CARTERA_3 = congela({
  id: 'CARTERA_3',
  tipo: 'cartera',
  criterioVersion: 7,
  nombre: 'Cartera 3 · mezcla con filtro de tendencia',
  comun: {
    base: 'QQQ',
    precios: 'rentabilidad total; el ETF es el ×2 / ×3 SINTÉTICO de V9.984 sobre el QQQ (lib/etfSintetico.js), calibrado con QLD y TQQQ',
    ejecucion: 'la media del QQQ al cierre de cada día (o al último cierre de la semana); ejecución a la apertura siguiente',
    liquidez: '0 %',
    inicio: 'cada periodo empieza DENTRO si el QQQ cerraba sobre su media el último día evaluable antes del periodo y FUERA si no; sin datos para calentar la media (1999), DENTRO hasta que la media existe',
    referencias: ['mezcla 50 % QQQ + 50 % ETF sin filtro (rebalanceo anual)', 'comprar y mantener QQQ', 'comprar y mantener SPY', 'QQQ con el mismo filtro sin apalancar (100 % QQQ ↔ 100 % liquidez)'],
    sinteticos: SINTETICOS_CFG,
    azar: 'los periodos FUERA reales como bloques con sus duraciones, colocados al azar en el periodo sin solaparse; 1000 simulaciones con semilla fija; medida: CAGR / caída máxima',
    criterio: { orientativo: true, frente: 'la mezcla 50/50 sin filtro', medida: 'CAGR / caída máxima', subperiodos: 'mayor en el total y en al menos 3 de los 4 subperiodos',
      azar: 'además, percentil >= 95 en el total si la variante está calibrada (falsos aprobados <= 10 %)' },
  },
  items: [
    itemFiltro('F1', 50, 'apalancado', 'x2'), itemFiltro('F2', 50, 'apalancado', 'x3'), itemFiltro('F3', 50, 'todo', 'x2'), itemFiltro('F4', 50, 'todo', 'x3'),
    itemFiltro('F5', 200, 'apalancado', 'x2'), itemFiltro('F6', 200, 'apalancado', 'x3'), itemFiltro('F7', 200, 'todo', 'x2'), itemFiltro('F8', 200, 'todo', 'x3'),
  ],
})
// sha256 del JSON canónico de CARTERA_3 (comprobado en una prueba).
export const CARTERA_3_HASH = '4d21e68f3d1b7ef1f26ce7863eae7799a4def8e90df2e3e79996d2ecc50a7f4a'

// ── Exploraciones de cartera (no son lotes: no tienen veredicto; cada una cuenta como tantas pruebas exploratorias como
// combinaciones tiene) ──
const PERIODOS_ETF = { QLD: P_QLD, TQQQ: P_TQQQ }
const COMUN_EXPLORACION = (({ base, precios, ejecucion, liquidez, inicio, referencias }) => ({ base, precios, ejecucion, liquidez, inicio, referencias }))(CARTERA_1.comun)
export const EXPLORACIONES = congela({
  curvaRiesgo: {
    prueba: 'exploracion', tipo: 'curvaRiesgo', nombre: 'Curva de riesgo', etfs: ['QLD', 'TQQQ'],
    familias: [{ id: 'mezcla', nombre: 'Mezcla fija (rebalanceo anual)', frecuencia: 'anual' }, { id: 'simple', nombre: 'Regla simple (caída 10 %, ventana 252)', pct: 10, ventana: 252 }],
    puntos: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100], periodos: PERIODOS_ETF, combinaciones: 2 * 2 * 11, ...COMUN_EXPLORACION, calculo: 2, costes: COSTES_DEFECTO,
  },
  sensibilidad: {
    prueba: 'exploracion', tipo: 'sensibilidad', nombre: 'Mapa de sensibilidad', etfs: ['QLD', 'TQQQ'],
    regla: 'simple', fraccion: 0.5, ventana: 252, caidas: [5, 7.5, 10, 12.5, 15, 17.5, 20, 22.5, 25], porDefecto: 10, zonaEstablePuntos: 1,
    periodos: PERIODOS_ETF, fueraDeMuestra: { QLD: { elige: P_QLD[0], prueba: { desde: '2016-01-01', hasta: '2025-12-31' } }, TQQQ: { elige: P_TQQQ[0], prueba: { desde: '2016-01-01', hasta: '2025-12-31' } } },
    combinaciones: 2 * 9, ...COMUN_EXPLORACION, calculo: 2, costes: COSTES_DEFECTO,
  },
  // V9.984: prueba de estrés 1999–2025 con ETF apalancados SINTÉTICOS (lib/etfSintetico.js), calibrados con QLD y TQQQ.
  estres: {
    prueba: 'exploracion', tipo: 'estres', nombre: 'Prueba de estrés 1999–2025', etfs: ['x2', 'x3'],
    familias: [{ id: 'mezcla', nombre: 'Mezcla fija (rebalanceo anual)', frecuencia: 'anual' }],
    puntos: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100], anioAnio: 50,
    periodos: [{ desde: '1999-01-01', hasta: '2025-12-31', total: true }, { desde: '1999-01-01', hasta: '2007-12-31' }, { desde: '2008-01-01', hasta: '2015-12-31' },
      { desde: '2016-01-01', hasta: '2020-12-31' }, { desde: '2021-01-01', hasta: '2025-12-31' }],
    sinteticos: SINTETICOS_CFG,
    combinaciones: 2 * 11, ...COMUN_EXPLORACION, calculo: 2, costes: COSTES_DEFECTO,
  },
  // V9.986: el mapa de la media del filtro de tendencia (CARTERA_3) con el ×3 sintético: SMA de 20 a 250 días (de 10 en 10)
  // en diario y de 4 a 50 semanas (de 2 en 2) en semanal, para los dos alcances. Medida: CAGR / caída máxima. Zona estable:
  // a menos del 10 % del mejor. Fuera de muestra: el mejor periodo de la media en 1999–2010 y su resultado en 2011–2025,
  // frente a la mediana y a las medias de 50 y 200 días (10 y 40 semanas en semanal).
  mapaMedia: {
    prueba: 'exploracion', tipo: 'mapaMedia', nombre: 'Mapa de la media', etfs: ['x3'], alcances: ['apalancado', 'todo'],
    diario: Array.from({ length: 24 }, (_, i) => 20 + 10 * i), semanal: Array.from({ length: 24 }, (_, i) => 4 + 2 * i), medida: 'cagrPorCaida', zonaEstable: 0.1,
    periodos: [{ desde: '1999-01-01', hasta: '2025-12-31', total: true }, { desde: '1999-01-01', hasta: '2010-12-31', elige: true }, { desde: '2011-01-01', hasta: '2025-12-31', prueba: true }],
    comparaCon: { diario: [50, 200], semanal: [10, 40] }, sinteticos: SINTETICOS_CFG,
    combinaciones: 2 * (24 + 24), ...COMUN_EXPLORACION, precios: CARTERA_3.comun.precios, inicio: CARTERA_3.comun.inicio, calculo: 2, costes: COSTES_DEFECTO,
  },
})
export const esConfigExploracion = (config) => config?.prueba === 'exploracion'
// La regla simple con su caída, su ventana y su fracción (la de una exploración).
export const reglaSimpleCon = (pct, ventana = 252, fraccion = 0.5) => { const r = reglaSimple(pct, fraccion); return { ...r, transiciones: r.transiciones.map(t => ({ ...t, si: t.si.map(s => s.c === 'caidaDesdeMaximo' ? { ...s, ventana } : s) })) } }

export const LOTES = congela({ LOTE_1, LOTE_2, LOTE_3, CARTERA_1, CARTERA_2, CARTERA_3 })
export const HUELLAS_LOTES = Object.freeze({ LOTE_1: LOTE_1_HASH, LOTE_2: LOTE_2_HASH, LOTE_3: LOTE_3_HASH, CARTERA_1: CARTERA_1_HASH, CARTERA_2: CARTERA_2_HASH, CARTERA_3: CARTERA_3_HASH })

// ── Versiones del criterio de veredicto ────────────────────────────────────────────────────────────────────────────────
// Un lote lleva su versión en `criterioVersion`; sin ella (LOTE_1 y LOTE_2, cuyas huellas no se tocan) es la 1.
//   1 · el declarado en cada lote: >= minimoOperaciones y percentil >= 95 con SU azar en todos los periodos.
//   2 · V9.976, LOTE_3 en adelante: en las pruebas de SALIDAS hace falta además percentil >= 95 con el azar RE-SIMULADO
//       (la misma secuencia de señales con duraciones del valor) en todos los periodos. Con una salida que depende del
//       precio, la salida decide cuándo llega la siguiente entrada: el hueco de cada operación delata cómo le fue y la
//       permutación sale torcida (calibración V9.976 en paseos aleatorios sin ventaja: percentil 0 en S1–S5 y 100 en S6),
//       mientras que el re-simulado compara el proceso entero (tampoco es perfecto con los stops: S4 >= 95 en el 26 %).
//       Se queda definido para la trazabilidad; ningún lote lo usa (lo sustituye el 3).
//   3 · V9.977, el de los lotes nuevos (LOTE_3 en adelante): en las pruebas de SALIDAS decide SOLO el azar re-simulado
//       (>= minimoOperaciones y percentil de la media >= 95 en todos los periodos), y solo con salidas de tipos calibrados
//       (cierreBajoMedia, rsiSobrecompra, tiempoMaximo y sus combinaciones). Con un stop (stopMovilATR, stopFijoATR) no hay
//       veredicto: «sin veredicto: azar no calibrado para stops». La permutación se sigue calculando, solo informativa. Las
//       pruebas de ENTRADAS (salida fija) siguen como con el 1.
export const CRITERIOS = congela({
  1: { version: 1, desde: 'V9.969', salidas: 'propio', salidasConResimulado: false },
  2: { version: 2, desde: 'V9.976', salidas: 'ambos', salidasConResimulado: true },
  3: { version: 3, desde: 'V9.977', salidas: 'resimulado', salidasCalibradas: ['cierreBajoMedia', 'rsiSobrecompra', 'tiempoMaximo'] },
  4: { version: 4, desde: 'V9.978', estrategias: true, maxFalsosAprobados: 10 },
  5: { version: 5, desde: 'V9.980', cartera: true, maxFalsosAprobados: 10 },
  6: { version: 6, desde: 'V9.982', cartera: true, comparativo: true },
  7: { version: 7, desde: 'V9.986', cartera: true, filtro: true, maxFalsosAprobados: 10, minSubperiodos: 3 },
})
//   4 · V9.978, ESTRATEGIAS COMPLETAS (LOTE_3): pasa si la combinación está calibrada (en lib/calibracionLab.json, hecha
//       para la huella exacta del lote: falsos aprobados en un periodo <= maxFalsosAprobados %) y, en todos los periodos,
//       hay >= minimoOperaciones y percentil de la media >= 95 frente a la estrategia al azar. Sin calibrar: «sin
//       veredicto: azar no calibrado para esta combinación».
export const CRITERIO_ACTUAL = 3              // pruebas de entradas y de salidas en lotes nuevos
export const CRITERIO_ACTUAL_ESTRATEGIAS = 4  // pruebas de estrategias completas
//   5 · V9.980, CARTERAS (CARTERA_1), orientativo (hay pocos ciclos): «mejor que comprar y mantener QQQ» si el CAGR supera al
//       del QQQ en TODOS los subperiodos; y «… y que el azar» si además el percentil del CAGR es >= 95 en el total y la
//       variante está calibrada (falsos aprobados <= maxFalsosAprobados % en lib/calibracionLab.json).
export const CRITERIO_ACTUAL_CARTERA = 5
export const VEREDICTOS_CARTERA = Object.freeze({
  noMejora: 'no mejora a comprar y mantener QQQ en todos los subperiodos',
  mejorSinAzar: 'mejor que comprar y mantener QQQ (azar sin veredicto: variante no calibrada)',
  mejorNoAzar: 'mejor que comprar y mantener QQQ, pero no que el azar',
  mejorYAzar: 'mejor que comprar y mantener QQQ y que el azar',
  comparativo: 'comparativo: sin veredicto de ventaja',
  filtroNoMejora: 'no mejora a la mezcla sin filtro (CAGR / caída)',
  filtroMejoraSinAzar: 'mejora a la mezcla sin filtro (azar sin veredicto: variante no calibrada)',
  filtroMejoraNoAzar: 'mejora a la mezcla sin filtro, pero el filtro no elige mejor que el azar',
  filtroMejoraYAzar: 'mejora a la mezcla sin filtro y el filtro elige bien',
})
//   7 · V9.986, CARTERA_3 (filtro de tendencia), orientativo: «mejora a la mezcla sin filtro» si su CAGR / caída máxima es
//       mayor que el de la mezcla 50/50 sin filtro en el total y en al menos minSubperiodos (3) de los 4 subperiodos; «… y el
//       filtro elige bien» si además el percentil del azar (bloques FUERA al azar, medida CAGR / caída) es >= 95 en el total
//       y la variante está calibrada (falsos aprobados <= maxFalsosAprobados %).
//   6 · V9.982, CARTERA_2 (mezclas fijas): COMPARATIVO, sin veredicto de ventaja (no eligen momentos): se comparan con comprar y
//       mantener QQQ y con la regla simple de CARTERA_1 del mismo ETF, con impuestos.
const esLoteCartera = (loteId) => LOTES[loteId]?.tipo === 'cartera'
export function veredictoCartera({ oficial, lote, item }, periodos) {
  if (!oficial) return 'sin veredicto'
  if (CRITERIOS[versionCriterio(lote)]?.comparativo) return VEREDICTOS_CARTERA.comparativo
  if (CRITERIOS[versionCriterio(lote)]?.filtro) {
    const c7 = CRITERIOS[versionCriterio(lote)], subs = (periodos || []).filter(p => !p.total), total = (periodos || []).find(p => p.total)
    if (!total?.mejoraMezcla || subs.filter(p => p.mejoraMezcla).length < c7.minSubperiodos) return VEREDICTOS_CARTERA.filtroNoMejora
    if (!calibracionDe(lote, item)?.calibrada) return VEREDICTOS_CARTERA.filtroMejoraSinAzar
    return total.azar?.percentil != null && total.azar.percentil >= 95 ? VEREDICTOS_CARTERA.filtroMejoraYAzar : VEREDICTOS_CARTERA.filtroMejoraNoAzar
  }
  const subs = (periodos || []).filter(p => !p.total), total = (periodos || []).find(p => p.total)
  if (!subs.length || !subs.every(p => p.supera?.qqq)) return VEREDICTOS_CARTERA.noMejora
  const cal = calibracionDe(lote, item)
  if (!cal?.calibrada) return VEREDICTOS_CARTERA.mejorSinAzar
  return total?.azar?.percentil != null && total.azar.percentil >= 95 ? VEREDICTOS_CARTERA.mejorYAzar : VEREDICTOS_CARTERA.mejorNoAzar
}
export const SIN_VEREDICTO_NO_CALIBRADA = 'sin veredicto: azar no calibrado para esta combinación'
// La calibración de un elemento (o null): solo vale si se hizo para la huella del lote tal como está.
export const calibracionDe = (loteId, item) => { const c = CALIBRACION?.[loteId]; return c && c.huellaLote === HUELLAS_LOTES[loteId] ? c.items?.[item] || null : null }
export const calibracionLote = (loteId) => { const c = CALIBRACION?.[loteId]; return c && c.huellaLote === HUELLAS_LOTES[loteId] ? c : null }
const esLoteEstrategias = (loteId) => LOTES[loteId]?.tipo === 'estrategias'
export const SIN_VEREDICTO_STOPS = 'sin veredicto: azar no calibrado para stops'
export const NOTA_PERMUTACION = 'no calibrada con salidas que dependen del precio'
export const versionCriterio = (loteId) => LOTES[loteId]?.criterioVersion ?? 1
const esLoteSalidas = (loteId) => LOTES[loteId]?.tipo === 'salidas'
// Los periodos con el re-simulado en el lugar del azar principal (null si a alguno le falta).
function conResimulado(periodos) {
  if (!periodos?.length || periodos.some(p => p?.otrosAzares?.resimulado?.percentil == null)) return null
  return periodos.map(p => ({ ...p, azar: { ...p.azar, percentil: p.otrosAzares.resimulado.percentil } }))
}
// Salidas de una regla que el criterio no sabe juzgar (las que no están entre sus tipos calibrados).
export const salidasNoCalibradas = (reglas, version) => { const c = CRITERIOS[version]?.salidasCalibradas; return c ? (reglas || []).map(r => r.id).filter(id => !c.includes(id)) : [] }
// Veredicto de una prueba con la versión de criterio de su lote (o la que se pida). clas: { oficial, lote, salidas } (salidas:
// las reglas de salida de una prueba de salidas; el criterio 3 las necesita para saber si hay un stop).
export function veredictoOficial({ oficial, lote, item, salidas: reglas }, periodos, version = versionCriterio(lote)) {
  if (esLoteCartera(lote) || periodos?.[0]?.prueba === 'cartera') return veredictoCartera({ oficial, lote, item }, periodos)
  if (esLoteEstrategias(lote) || periodos?.[0]?.prueba === 'estrategias') {
    if (!oficial) return 'sin veredicto'
    if (CRITERIOS[version]?.estrategias && !calibracionDe(lote, item)?.calibrada) return SIN_VEREDICTO_NO_CALIBRADA
    return veredictoLab(oficial, periodos)
  }
  const v = veredictoLab(oficial, periodos), esSalidas = esLoteSalidas(lote) || periodos?.[0]?.prueba === 'salidas'
  if (!oficial || !esSalidas) return v
  if (CRITERIOS[version]?.salidas === 'resimulado') {
    if (salidasNoCalibradas(reglas, version).length) return SIN_VEREDICTO_STOPS
    if (v === 'datos insuficientes') return v
    const r = conResimulado(periodos)
    return r ? veredictoLab(oficial, r) : 'no pasa'
  }
  if (v !== 'pasa' || !CRITERIOS[version]?.salidasConResimulado) return v
  const r = conResimulado(periodos)
  return r ? veredictoLab(oficial, r) : 'no pasa'
}
// La versión de criterio con que se lee una prueba: la de su lote si es oficial; la vigente si es exploratoria.
export const criterioDePrueba = ({ oficial, lote }, tipo = null) => oficial ? versionCriterio(lote) : tipo === 'estrategias' ? CRITERIO_ACTUAL_ESTRATEGIAS : CRITERIO_ACTUAL
// El criterio de una prueba en palabras (corto: para el historial).
// tipo: 'entradas' | 'salidas' | 'estrategias' (o true / false: salidas / entradas).
export function textoCriterio({ oficial, lote, item, salidas: reglas }, tipo, { corto = false } = {}) {
  const t = tipo === true ? 'salidas' : tipo === false || tipo == null ? 'entradas' : tipo, esSalidas = t === 'salidas'
  const v = criterioDePrueba({ oficial, lote }, t), c = CRITERIOS[v]
  // Filtro de tendencia (CARTERA_3, criterio 7); tipo 'filtro': una exploratoria con esa regla.
  if (t === 'filtro' || (t === 'cartera' && oficial && CRITERIOS[versionCriterio(lote)]?.filtro)) {
    const of = t === 'cartera', cal = of ? calibracionDe(lote, item) : null, c7 = CRITERIOS[7]
    if (corto) return !of ? '7: CAGR / caída frente a la mezcla y azar' : cal?.calibrada ? '7: CAGR / caída frente a la mezcla · azar calibrado' : '7: CAGR / caída frente a la mezcla · azar sin veredicto'
    return `${of ? 'Criterio 7 (orientativo)' : 'Exploratoria, sin veredicto (criterio vigente para el filtro: 7)'}: «mejora a la mezcla sin filtro» si su CAGR / caída máxima es mayor que el de la mezcla 50/50 sin filtro en el total y en al menos ${c7.minSubperiodos} de los 4 subperiodos; «… y el filtro elige bien» si además el percentil del azar (los periodos FUERA reales colocados al azar, medida CAGR / caída) es >= 95 en el total y la variante está calibrada (falsos aprobados <= ${c7.maxFalsosAprobados} %). Liquidez al 0 %.`
      + (of ? (cal ? ` Esta variante ${cal.calibrada ? 'SÍ' : 'NO'} está calibrada (${cal.pctAprobados} % de falsos aprobados en ${cal.universos} universos).` : ' Esta variante no tiene calibración: el azar no da veredicto.') : '')
  }
  if (t === 'cartera' && oficial && CRITERIOS[versionCriterio(lote)]?.comparativo) {
    const v = versionCriterio(lote)
    return corto ? `${v}: comparativo (sin azar)` : `Criterio ${v} (comparativo): sin veredicto de ventaja; una mezcla fija no elige momentos, así que no hay prueba contra el azar. Se compara con comprar y mantener QQQ y con la regla simple de CARTERA_1 del mismo ETF, con impuestos.`
  }
  if (t === 'cartera') {
    const pre = oficial ? `Criterio ${CRITERIO_ACTUAL_CARTERA} (orientativo)` : `Exploratoria, sin veredicto (criterio vigente: ${CRITERIO_ACTUAL_CARTERA})`, cal = oficial ? calibracionDe(lote, item) : null
    if (corto) return !oficial ? `${CRITERIO_ACTUAL_CARTERA}: CAGR frente a QQQ y azar` : cal?.calibrada ? `${CRITERIO_ACTUAL_CARTERA}: CAGR frente a QQQ · azar calibrado` : `${CRITERIO_ACTUAL_CARTERA}: CAGR frente a QQQ · azar sin veredicto`
    return `${pre}: «mejor que comprar y mantener QQQ» si el CAGR supera al del QQQ en todos los subperiodos; y «… y que el azar» si además el percentil del CAGR es >= 95 en el total y la variante está calibrada (falsos aprobados <= ${CRITERIOS[5].maxFalsosAprobados} %).`
      + (oficial ? (cal ? ` Esta variante ${cal.calibrada ? 'SÍ' : 'NO'} está calibrada (${cal.pctAprobados} % de falsos aprobados en ${cal.universos} universos).` : ' Esta variante no tiene calibración: el azar no da veredicto.') : '')
  }
  if (t === 'estrategias') {
    const pre = oficial ? `Criterio ${v}` : `Exploratoria, sin veredicto (criterio vigente: ${v})`, cal = oficial ? calibracionDe(lote, item) : null
    const base = `pasa si la combinación está calibrada (falsos aprobados en un periodo <= ${CRITERIOS[4].maxFalsosAprobados} % con paseos aleatorios sin ventaja) y, en todos los periodos, hay al menos 100 operaciones y percentil de la media >= 95 frente a la misma estrategia al azar`
    if (corto) return !oficial ? `${v}: media frente a la estrategia al azar ≥ 95` : cal?.calibrada ? `${v}: calibrada · media frente al azar ≥ 95` : `${v}: sin veredicto (no calibrada)`
    return `${pre}: ${base}.` + (oficial ? (cal ? ` Esta combinación ${cal.calibrada ? 'SÍ' : 'NO'} está calibrada (${cal.pctAprobados} % de falsos aprobados en ${cal.universos} universos).` : ` Esta combinación no tiene calibración: ${SIN_VEREDICTO_NO_CALIBRADA}.`) : ' Las exploratorias no tienen calibración propia.')
  }
  const pre = oficial ? `Criterio ${v}` : `Exploratoria, sin veredicto (criterio vigente: ${v})`
  const regla = (azar) => `pasa si en todos los periodos hay al menos 100 operaciones y percentil de la media >= 95 ${azar}`
  if (!esSalidas) return corto ? `${v}: mediana, percentil ≥ 95` : `${pre}: pasa si en todos los periodos hay al menos 100 operaciones y percentil de la mediana >= 95 frente al azar.`
  if (c.salidas === 'resimulado') {
    const malas = salidasNoCalibradas(reglas, v)
    if (malas.length) return corto ? `${v}: sin veredicto (stops)` : `${pre}: ${SIN_VEREDICTO_STOPS} (${malas.join(', ')}). Con stops el re-simulado no está calibrado, y la permutación no sirve con salidas que dependen del precio.`
    return corto ? `${v}: media, re-simulado ≥ 95` : `${pre}: ${regla('con el azar RE-SIMULADO')}. La permutación es solo informativa: ${NOTA_PERMUTACION}.`
  }
  if (c.salidas === 'ambos') return corto ? `${v}: media, permutación y re-simulado ≥ 95` : `${pre}: ${regla('con el azar de permutación Y con el re-simulado')}.`
  return corto ? `${v}: media, permutación ≥ 95` : `${pre} (el declarado en el lote): ${regla('con el azar de permutación')}; el re-simulado se enseña al lado.`
}
// Nota para las pruebas de un lote de salidas con criterio 1 cuyo «pasa» registrado no se sostiene con el re-simulado. Se
// calcula de los resultados guardados (el registro es de solo añadir: no se reescribe). null si no toca o no se puede
// saber (sin re-simulado guardado).
export const NOTA_RESIMULADO = 'Pasa con el criterio declarado; no se sostiene con el azar re-simulado (V9.976)'
export function notaResimulado({ oficial, lote, veredicto, periodos }) {
  if (!oficial || veredicto !== 'pasa' || !esLoteSalidas(lote) || versionCriterio(lote) >= 2) return null
  const r = conResimulado(periodos)
  return r && veredictoLab(true, r) !== 'pasa' ? NOTA_RESIMULADO : null
}

// La configuración de una prueba —señales y parámetros, universo, periodos, temporalidad, entrada y salida— con la forma
// que se guarda en lab_pruebas.config. La de un elemento de lote se arma igual, así que una prueba libre con exactamente
// la misma configuración tiene la misma huella (y cuenta como oficial).
export function configDe({ disparador, filtros = [] }, { universo, periodos, intervalo, entrada, salida }) {
  return { senales: { disparador, filtros }, universo, periodos, intervalo, entrada, salida }
}
// La de una prueba de SALIDAS: entradas (las al azar del lote, o { tipo: 'senal', disparador, filtros } en las
// exploratorias), la lista de salidas (con «O») y lo común.
export function configSalidasDe({ salidas, entradas }, { universo, periodos, intervalo, entrada }) {
  return { prueba: 'salidas', entradas, salidas, universo, periodos, intervalo, entrada }
}
export const esConfigSalidas = (config) => config?.prueba === 'salidas'
export const esConfigEstrategias = (config) => config?.prueba === 'estrategias'
export const esConfigCartera = (config) => config?.prueba === 'cartera'
// La ejecución de un LOTE DEL EDITOR (V9.1020, docs/editor-visual.md E10): el lote está congelado en editor_lotes; aquí
// solo su huella, su nombre, lo común y las huellas de sus variantes. Siempre exploratoria en este registro.
export const esConfigEditorLote = (config) => config?.prueba === 'editorLote'
// El LABORATORIO de una estrategia del editor (V9.1027, lib/editor/laboratorio.js): su definición y sus valores en los
// miembros del Nasdaq-100, frente a la misma estrategia al azar. Aquí solo la forma; la definición la valida la ruta
// (lib/editor/definicion.js importa este archivo). Siempre exploratoria en este registro; la calibración va aparte
// (prueba 'editorCalibracion').
export const esConfigEditorLab = (config) => config?.prueba === 'editorLab'
export const esConfigEditorCalibracion = (config) => config?.prueba === 'editorCalibracion'
// V9.1051: las curvas de una ejecución de un lote del editor (una fila por variante y periodo; solo para dibujarlas).
export const esConfigEditorCurvas = (config) => config?.prueba === 'editorCurvas'
// La ejecución de un LOTE DE PLANES (V9.1033, lib/planes/lotes.js; congelado en editor_lotes con tipo 'planes').
export const esConfigPlanLote = (config) => config?.prueba === 'planLote'
// La de una prueba de CARTERA: la regla (máquina de estados), el ETF, los periodos y lo común.
// (sinteticos: los parámetros de los ETF sintéticos cuando el ETF es x2 / x3, CARTERA_3; sin ellos la huella no cambia.)
// (calculo: 2 en las pruebas nuevas, V9.988: impuestos en caja; sin él es el cálculo 1, el de los lotes congelados.)
// (costes: los costes por operación del cálculo 2, V9.989; entran en la huella.)
export function configCarteraDe({ regla, etf, periodos, comparaCon, calculo, costes }, { base, precios, ejecucion, liquidez, inicio, referencias, sinteticos }) {
  return { prueba: 'cartera', regla, etf, periodos, comparaCon, base, precios, ejecucion, liquidez, inicio, referencias, sinteticos, calculo, costes }
}
// La de una prueba de ESTRATEGIA COMPLETA: entrada (disparador y filtros del catálogo), salidas (con «O») y lo común.
export function configEstrategiaDe({ disparador, filtros = [], salidas }, { universo, periodos, intervalo, entrada }) {
  return { prueba: 'estrategias', senales: { disparador, filtros }, salidas, universo, periodos, intervalo, entrada }
}
export function configDeItem(lote, itemId) {
  const it = lote.items.find(x => x.id === itemId)
  if (!it) throw new Error(`El lote ${lote.id} no tiene el elemento «${itemId}».`)
  if (lote.tipo === 'estrategias') return configEstrategiaDe(it, lote.comun)
  if (lote.tipo === 'cartera') return configCarteraDe(it, lote.comun)
  return lote.tipo === 'salidas' ? configSalidasDe({ salidas: it.salidas, entradas: lote.comun.entradas }, lote.comun) : configDe(it, lote.comun)
}
// Errores de las señales de una configuración, sea de entradas (LOTE_1) o de salidas (LOTE_2).
export function validaConfig(config) {
  if (esConfigEditorLab(config)) return config?.definicion?.tipo === 'editor' && config.valores && typeof config.valores === 'object' && config.universo?.indice === 'NDX' && config.intervalo === 'diario'
    && Array.isArray(config.periodos) && config.periodos.length && config.periodos.every(p => /^\d{4}-\d{2}-\d{2}$/.test(p?.desde) && /^\d{4}-\d{2}-\d{2}$/.test(p?.hasta) && p.desde < p.hasta)
    ? [] : ['El laboratorio de una estrategia del editor necesita su definición, sus valores, el Nasdaq-100, velas diarias y periodos válidos.']
  if (esConfigPlanLote(config)) return /^[0-9a-f]{64}$/.test(config?.hashLote || '') && Array.isArray(config?.variantes) && config.variantes.length && config.variantes.every(v => v?.id && /^[0-9a-f]{64}$/.test(v.huella || '')) ? [] : ['La ejecución de un lote de planes necesita la huella del lote y las de sus variantes.']
  if (esConfigEditorCurvas(config)) return /^[0-9a-f]{64}$/.test(config?.hashLote || '') && typeof config?.variante === 'string' && config.variante && /^\d{4}-\d{2}-\d{2}$/.test(config?.desde) && /^\d{4}-\d{2}-\d{2}$/.test(config?.hasta) && config.desde < config.hasta
    ? [] : ['Las curvas de un lote del editor necesitan la huella del lote, la variante y el periodo.']
  if (esConfigEditorCalibracion(config)) return /^[0-9a-f]{64}$/.test(config?.huella || '') && Number.isInteger(config?.version) ? [] : ['La calibración de una estrategia del editor necesita su huella y su versión.']
  if (esConfigEditorLote(config)) return /^[0-9a-f]{64}$/.test(config?.hashLote || '') && Array.isArray(config?.variantes) && config.variantes.length && config.variantes.every(v => v?.id && /^[0-9a-f]{64}$/.test(v.huella || ''))
    ? [] : ['La ejecución de un lote del editor necesita la huella del lote y las de sus variantes.']
  if (esConfigEstrategias(config)) return [...validaCombinacion(config?.senales || {}), ...validaSalidas(config?.salidas)]
  if (esConfigExploracion(config)) {
    const e = []
    if (!['curvaRiesgo', 'sensibilidad', 'estres', 'mapaMedia'].includes(config?.tipo)) e.push('La exploración tiene que ser la curva de riesgo, el mapa de sensibilidad, la prueba de estrés o el mapa de la media.')
    const sint = ['estres', 'mapaMedia'].includes(config?.tipo), validos = sint ? ['x2', 'x3'] : ['QLD', 'TQQQ']
    if (!Array.isArray(config?.etfs) || !config.etfs.length || !config.etfs.every(x => validos.includes(x))) e.push(`Los ETF tienen que ser ${validos.join(' o ')}.`)
    if (sint && !(config.sinteticos?.ajuste && config.sinteticos?.comision)) e.push('Faltan los parámetros de los ETF sintéticos.')
    if (config?.tipo === 'mapaMedia' && !(Array.isArray(config.alcances) && config.alcances.length && config.alcances.every(a => NOMBRE_ALCANCE[a]) && [...(config.diario || []), ...(config.semanal || [])].every(v => Number.isInteger(v) && v >= 2 && v <= 1000) && (config.diario?.length || config.semanal?.length))) e.push('El mapa de la media necesita alcances y periodos de media enteros.')
    if (!(Number.isInteger(config?.combinaciones) && config.combinaciones > 0)) e.push('Falta el número de combinaciones.')
    if (config?.calculo !== undefined && config.calculo !== 2) e.push('La versión del cálculo tiene que ser la 2 (o ninguna: la 1, la de los lotes congelados).')
    if (config?.costes !== undefined) { if (config.calculo !== 2) e.push('Los costes por operación solo existen con el cálculo 2.'); else e.push(...validaCostes(config.costes)) }
    return e
  }
  if (esConfigCartera(config)) {
    const e = validaRegla(config?.regla)
    if (config?.comparaCon) e.push(...validaRegla(config.comparaCon.regla).map(x => `Comparación: ${x}`))
    if (!['QLD', 'TQQQ'].includes(config?.etf) && !(['x2', 'x3'].includes(config?.etf) && config.sinteticos?.ajuste && config.sinteticos?.comision)) e.push('El ETF tiene que ser QLD, TQQQ o un sintético ×2 / ×3 con sus parámetros.')
    if (!Array.isArray(config?.periodos) || !config.periodos.length || !config.periodos.every(p => /^\d{4}-\d{2}-\d{2}$/.test(p?.desde) && /^\d{4}-\d{2}-\d{2}$/.test(p?.hasta) && p.desde < p.hasta)) e.push('Los periodos no son válidos.')
    if (config?.calculo !== undefined && config.calculo !== 2) e.push('La versión del cálculo tiene que ser la 2 (o ninguna: la 1, la de los lotes congelados).')
    if (config?.costes !== undefined) { if (config.calculo !== 2) e.push('Los costes por operación solo existen con el cálculo 2.'); else e.push(...validaCostes(config.costes)) }
    return e
  }
  if (!esConfigSalidas(config)) return validaCombinacion(config?.senales || {})
  const e = [...validaSalidas(config.salidas)], en = config.entradas
  if (en?.tipo === 'senal') e.push(...validaCombinacion(en))
  else if (en?.tipo === 'azar') {
    if (!(typeof en.probabilidad === 'number' && en.probabilidad > 0 && en.probabilidad <= 1)) e.push('La probabilidad de entrada tiene que estar entre 0 y 1.')
    if (!Number.isInteger(en.semilla)) e.push('Las entradas al azar necesitan una semilla entera.')
    if (!Array.isArray(en.calentamiento)) e.push('Las entradas al azar necesitan su calentamiento.')
  } else e.push('Faltan las entradas (al azar o un disparador).')
  return e
}
// Errores de un lote: elementos con señales no válidas o ids repetidos.
export function validaLote(lote) {
  const errores = [], vistos = new Set()
  for (const it of lote.items) {
    if (vistos.has(it.id)) errores.push(`Elemento repetido: ${it.id}.`)
    vistos.add(it.id)
    errores.push(...validaConfig(configDeItem(lote, it.id)).map(e => `${it.id}: ${e}`))
  }
  return errores
}
