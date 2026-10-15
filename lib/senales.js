// lib/senales.js — catálogo de señales del laboratorio (Fase de laboratorio, entrega 1). Puro: no toca el motor ni la red.
//
// Cada señal: { id, clase: 'disparador' | 'filtro', nombre, frase(params), parametros: [{ clave, etiqueta, tipo: 'entero' |
// 'numero' | 'opcion', defecto, min, max, opciones }], valida(params) → [errores], condicion(velas, params, ctx) →
// [true|false|null], calcula(velas, params, ctx) → [boolean] }.
// Las velas son { date: 'YYYY-MM-DD', open, high, low, close, volume } en orden de fecha (la forma del motor).
//
// REGLAS COMUNES
// · Solo se usan datos hasta el CIERRE de la vela t: el valor en t no depende de nada posterior (la entrada en la apertura
//   de t+1 la hace el laboratorio, no la señal).
// · Cada condición vale true, false o null («no calculable»: calentamiento, dato ausente o no válido —null, NaN, precio
//   <= 0, volumen 0— en la vela o en su ventana). null nunca da true.
// · DISPARADORES = EVENTOS: true solo en la vela en que la condición pasa de falsa a verdadera: condición true en t y
//   false (calculable) en t−1. Así no se disparan al acabar el calentamiento ni justo después de un hueco, y no se repiten
//   mientras la condición siga verdadera. FILTROS = ESTADOS: true en cada vela en que la condición es true.
// · Combinación (entradas): entrada en t = disparador[t] Y todos los filtros[t].
// · Indicadores: EMA y RSI de Wilder, los de lib/backtester.js (calcEMA arranca con la SMA de los N primeros; calcRSI con
//   las medias simples de N diferencias y luego el suavizado de Wilder); SMA, calcSMAEstricta de lib/indicadores.js (null
//   si falta algún dato de la ventana). Cada indicador se calcula una vez por serie: caché por array de velas y clave de
//   parámetros (WeakMap), así no se mezcla entre activos.
import { calcEMA, calcRSI, calcATR } from './backtester'
import { calcSMAEstricta } from './indicadores'

// ── Utilidades ─────────────────────────────────────────────────────────────────────────────────────────────────────────
const finito = (x) => typeof x === 'number' && Number.isFinite(x)
const precioOk = (x) => finito(x) && x > 0
const CACHE = new WeakMap()
function memo(velas, clave, calcular) {
  let m = CACHE.get(velas)
  if (!m) { m = new Map(); CACHE.set(velas, m) }
  if (!m.has(clave)) m.set(clave, calcular())
  return m.get(clave)
}
// Precios de un campo, con los no válidos como null.
const precios = (velas, campo) => memo(velas, `precio|${campo}`, () => velas.map(v => precioOk(v?.[campo]) ? v[campo] : null))
// Media móvil (EMA o SMA) del cierre.
export function media(velas, tipo, periodo) {
  return memo(velas, `media|${tipo}|${periodo}`, () => {
    const c = precios(velas, 'close')
    return tipo === 'SMA' ? calcSMAEstricta(c, periodo) : calcEMA(c, periodo).map(x => finito(x) ? x : null)
  })
}
export function rsi(velas, periodo) {
  return memo(velas, `rsi|${periodo}`, () => calcRSI(precios(velas, 'close'), periodo).map(x => finito(x) ? x : null))
}
// Condición true/false/null → evento (true solo al pasar de false a true).
export function aEvento(cond) {
  return cond.map((c, t) => c === true && t > 0 && cond[t - 1] === false)
}
const aEstado = (cond) => cond.map(c => c === true)
const fmtNum = (x) => String(x).replace('.', ',')

// Parámetros de una media (tipo + periodo) con un prefijo de clave.
const paramsMedia = (prefijo, etiqueta, tipo, periodo, maxPeriodo = 500) => [
  { clave: `tipo${prefijo}`, etiqueta: `Tipo de ${etiqueta}`, tipo: 'opcion', defecto: tipo, opciones: ['EMA', 'SMA'] },
  { clave: `periodo${prefijo}`, etiqueta: `Periodo de ${etiqueta}`, tipo: 'entero', defecto: periodo, min: 1, max: maxPeriodo },
]
// Validación genérica según la declaración de parámetros (todos obligatorios).
function validaDeclarados(parametros, params) {
  const errores = []
  for (const p of parametros) {
    const v = params?.[p.clave]
    if (v == null || v === '') { errores.push(`Falta «${p.etiqueta}».`); continue }
    if (p.tipo === 'opcion') { if (!p.opciones.includes(v)) errores.push(`«${p.etiqueta}» tiene que ser ${p.opciones.join(' o ')}.`); continue }
    if (!finito(v)) { errores.push(`«${p.etiqueta}» tiene que ser un número.`); continue }
    if (p.tipo === 'entero' && !Number.isInteger(v)) errores.push(`«${p.etiqueta}» tiene que ser un número entero.`)
    if (p.min != null && v < p.min) errores.push(`«${p.etiqueta}» no puede ser menor que ${fmtNum(p.min)}.`)
    if (p.max != null && v > p.max) errores.push(`«${p.etiqueta}» no puede ser mayor que ${fmtNum(p.max)}.`)
  }
  return errores
}
const defectos = (parametros) => Object.fromEntries(parametros.map(p => [p.clave, p.defecto]))

// ── Disparadores ───────────────────────────────────────────────────────────────────────────────────────────────────────
// 1. Cruce de medias: rápida[t] > lenta[t] y rápida[t−1] <= lenta[t−1].
const P_CRUCE = [...paramsMedia('Rapida', 'la media rápida', 'EMA', 10), ...paramsMedia('Lenta', 'la media lenta', 'EMA', 11)]
const cruceMedias = {
  id: 'cruceMedias', clase: 'disparador', nombre: 'Cruce de medias', parametros: P_CRUCE,
  frase: (p) => `La ${p.tipoRapida} de ${p.periodoRapida} cruza por encima de la ${p.tipoLenta} de ${p.periodoLenta}`,
  valida: (p) => {
    const e = validaDeclarados(P_CRUCE, p)
    if (!e.length && !(p.periodoRapida < p.periodoLenta)) e.push('El periodo de la media rápida tiene que ser menor que el de la lenta.')
    return e
  },
  condicion: (velas, p) => {
    const r = media(velas, p.tipoRapida, p.periodoRapida), l = media(velas, p.tipoLenta, p.periodoLenta)
    return velas.map((_, t) => r[t] != null && l[t] != null ? r[t] > l[t] : null)
  },
}
// 2. Ruptura: cierre[t] > el mayor de los máximos de las N velas anteriores (t−N … t−1).
const P_RUPTURA = [{ clave: 'n', etiqueta: 'Velas anteriores', tipo: 'entero', defecto: 20, min: 1, max: 1000 }]
// Para cada t, el máximo de los máximos de t−N … t−1, o null si alguno falta (o t < N).
function maximoPrevio(velas, n) {
  return memo(velas, `maxPrevio|${n}`, () => {
    const h = precios(velas, 'high'), out = new Array(velas.length).fill(null)
    for (let t = n; t < velas.length; t++) {
      let m = -Infinity, ok = true
      for (let j = t - n; j < t; j++) { if (h[j] == null) { ok = false; break } if (h[j] > m) m = h[j] }
      if (ok) out[t] = m
    }
    return out
  })
}
const ruptura = {
  id: 'ruptura', clase: 'disparador', nombre: 'Ruptura de máximos', parametros: P_RUPTURA,
  frase: (p) => p.n === 252 ? 'Nuevo máximo de 52 semanas: el cierre supera el máximo de las 252 velas anteriores'
    : `El cierre supera el máximo de las ${p.n} velas anteriores`,
  valida: (p) => validaDeclarados(P_RUPTURA, p),
  condicion: (velas, p) => {
    const c = precios(velas, 'close'), mx = maximoPrevio(velas, p.n)
    return velas.map((_, t) => c[t] != null && mx[t] != null ? c[t] > mx[t] : null)
  },
}
// 3. Precio cruza la media: cierre[t] > media[t] y cierre[t−1] <= media[t−1].
const P_PRECIO_MEDIA = paramsMedia('', 'la media', 'SMA', 50)
const precioCruzaMedia = {
  id: 'precioCruzaMedia', clase: 'disparador', nombre: 'El precio cruza la media', parametros: P_PRECIO_MEDIA,
  frase: (p) => `El cierre cruza por encima de la ${p.tipo} de ${p.periodo}`,
  valida: (p) => validaDeclarados(P_PRECIO_MEDIA, p),
  condicion: (velas, p) => {
    const c = precios(velas, 'close'), m = media(velas, p.tipo, p.periodo)
    return velas.map((_, t) => c[t] != null && m[t] != null ? c[t] > m[t] : null)
  },
}
// 4. Retroceso en tendencia: RSI[t] < umbral y cierre[t] > media[t]; evento cuando la condición conjunta empieza.
const P_RETROCESO = [
  { clave: 'periodoRsi', etiqueta: 'Periodo del RSI', tipo: 'entero', defecto: 2, min: 1, max: 100 },
  { clave: 'umbral', etiqueta: 'Umbral del RSI', tipo: 'numero', defecto: 10, min: 0, max: 100 },
  ...paramsMedia('Media', 'la media de tendencia', 'SMA', 200),
]
const retroceso = {
  id: 'retroceso', clase: 'disparador', nombre: 'Retroceso en tendencia', parametros: P_RETROCESO,
  frase: (p) => `El RSI de ${p.periodoRsi} baja de ${fmtNum(p.umbral)} con el cierre por encima de la ${p.tipoMedia} de ${p.periodoMedia}`,
  valida: (p) => validaDeclarados(P_RETROCESO, p),
  condicion: (velas, p) => {
    const c = precios(velas, 'close'), r = rsi(velas, p.periodoRsi), m = media(velas, p.tipoMedia, p.periodoMedia)
    return velas.map((_, t) => c[t] != null && r[t] != null && m[t] != null ? (r[t] < p.umbral && c[t] > m[t]) : null)
  },
}

// ── Filtros ────────────────────────────────────────────────────────────────────────────────────────────────────────────
// 5. Volumen alto: volumen[t] > k × la media del volumen de las N velas anteriores (t−N … t−1). Volumen 0 = no válido.
const P_VOLUMEN = [
  { clave: 'k', etiqueta: 'Veces la media', tipo: 'numero', defecto: 1.5, min: 0, max: 100 },
  { clave: 'n', etiqueta: 'Velas de la media', tipo: 'entero', defecto: 20, min: 1, max: 500 },
]
const volumenAlto = {
  id: 'volumenAlto', clase: 'filtro', nombre: 'Volumen alto', parametros: P_VOLUMEN,
  frase: (p) => `El volumen supera ${fmtNum(p.k)} veces la media de las ${p.n} velas anteriores`,
  valida: (p) => validaDeclarados(P_VOLUMEN, p),
  condicion: (velas, p) => {
    const v = precios(velas, 'volume')   // volumen > 0 y finito; 0 cuenta como no válido
    const mPrev = memo(velas, `volMediaPrevia|${p.n}`, () => {
      const m = calcSMAEstricta(v, p.n)   // m[t] = media de t−n+1 … t → la de las n anteriores a t es m[t−1]
      return velas.map((_, t) => t >= 1 ? m[t - 1] : null)
    })
    return velas.map((_, t) => v[t] != null && mPrev[t] != null ? v[t] > p.k * mPrev[t] : null)
  },
}
// 6. Mercado alcista: el cierre de QQQ > su media, con la última vela de QQQ de fecha <= la de t. ctx.qqq = velas de QQQ.
const P_MERCADO = paramsMedia('', 'la media de QQQ', 'SMA', 200)
const mercadoAlcista = {
  id: 'mercadoAlcista', clase: 'filtro', nombre: 'Mercado alcista (QQQ)', parametros: P_MERCADO,
  frase: (p) => `QQQ está por encima de su ${p.tipo} ${p.periodo}`,
  valida: (p) => validaDeclarados(P_MERCADO, p),
  condicion: (velas, p, ctx = {}) => {
    const q = ctx.qqq || []
    if (!q.length) return velas.map(() => null)
    const qc = precios(q, 'close'), qm = media(q, p.tipo, p.periodo)
    // Estado de QQQ por vela suya, y para cada vela del activo la última de QQQ con fecha <= la suya (las dos en orden).
    const estadoQ = memo(q, `alcista|${p.tipo}|${p.periodo}`, () => q.map((_, j) => qc[j] != null && qm[j] != null ? qc[j] > qm[j] : null))
    let j = -1
    return velas.map(v => {
      while (j + 1 < q.length && q[j + 1].date <= v.date) j++
      return j >= 0 ? estadoQ[j] : null
    })
  },
}

// ── Salidas (LOTE_2) ───────────────────────────────────────────────────────────────────────────────────────────────────
// Una salida depende de la OPERACIÓN abierta (vela y precio de entrada, máximo desde la entrada), así que no da una serie
// por vela: evalua(velas, params) prepara sus indicadores (una vez por serie, con la misma caché) y devuelve
// decide(op, t) → true | false | null, mirando SOLO hasta el cierre de t. op = { e (vela de entrada), entrada (su
// apertura), maxAlto (máximo de los máximos de e … t, lo lleva el laboratorio) }. null = no calculable en t (no sale).
// La ejecución la pone lib/laboratorioSalidas.js: condición al cierre de t → salida a la apertura de t+1; tiempoMaximo
// → salida al cierre de la vela N contando la de entrada; si coinciden en la misma vela, manda el tiempo.
// indicadores(params): lo que la salida necesita calculado (para el calentamiento común de las entradas al azar).
// ATR de Wilder: calcATR de lib/backtester.js, el mismo del que sale el de lib/edge.js (atrPrevio[i] = calcATR[i − 1]);
// aquí se usa el ATR EN t (con la vela t). Con un precio no válido el suavizado se rompe: desde ahí, null.
export function atr(velas, periodo) {
  return memo(velas, `atr|${periodo}`, () => {
    if (velas.length < periodo) return velas.map(() => null)
    const a = calcATR(velas.map(v => ({ high: v?.high, low: v?.low, close: v?.close })), periodo)
    return velas.map((_, i) => finito(a[i]) && a[i] > 0 ? a[i] : null)
  })
}
// La serie de un indicador declarado { indicador: 'EMA' | 'SMA' | 'ATR' | 'RSI', periodo }.
export function serieIndicador(velas, ind) {
  if (ind.indicador === 'ATR') return atr(velas, ind.periodo)
  if (ind.indicador === 'RSI') return rsi(velas, ind.periodo)
  return media(velas, ind.indicador, ind.periodo)
}
const P_BAJO_MEDIA = paramsMedia('', 'la media', 'EMA', 10)
const cierreBajoMedia = {
  id: 'cierreBajoMedia', clase: 'salida', nombre: 'Cierre bajo la media', parametros: P_BAJO_MEDIA,
  frase: (p) => `el cierre baja de la ${p.tipo} de ${p.periodo}`,
  valida: (p) => validaDeclarados(P_BAJO_MEDIA, p),
  indicadores: (p) => [{ indicador: p.tipo, periodo: p.periodo }],
  evalua: (velas, p) => {
    const c = precios(velas, 'close'), m = media(velas, p.tipo, p.periodo)
    return (op, t) => c[t] != null && m[t] != null ? c[t] < m[t] : null
  },
}
const P_ATR = (k) => [
  { clave: 'k', etiqueta: 'Veces el ATR', tipo: 'numero', defecto: k, min: 0, max: 50 },
  { clave: 'n', etiqueta: 'Periodo del ATR', tipo: 'entero', defecto: 14, min: 1, max: 200 },
]
// Stop móvil: cierre[t] < (máximo de los máximos desde la entrada hasta t) − k × ATR(n)[t]. Sube con el máximo.
const P_STOP_MOVIL = P_ATR(3)
const stopMovilATR = {
  id: 'stopMovilATR', clase: 'salida', nombre: 'Stop móvil con ATR', parametros: P_STOP_MOVIL,
  frase: (p) => `el cierre cae más de ${fmtNum(p.k)} ATR de ${p.n} por debajo del máximo desde la entrada`,
  valida: (p) => validaDeclarados(P_STOP_MOVIL, p),
  indicadores: (p) => [{ indicador: 'ATR', periodo: p.n }],
  evalua: (velas, p) => {
    const c = precios(velas, 'close'), a = atr(velas, p.n)
    return (op, t) => c[t] != null && a[t] != null && op.maxAlto != null ? c[t] < op.maxAlto - p.k * a[t] : null
  },
}
// Stop fijo: cierre[t] < precio de entrada − k × ATR(n) de la vela de señal (e − 1). No se mueve.
const P_STOP_FIJO = P_ATR(2)
const stopFijoATR = {
  id: 'stopFijoATR', clase: 'salida', nombre: 'Stop fijo con ATR', parametros: P_STOP_FIJO,
  frase: (p) => `el cierre cae más de ${fmtNum(p.k)} ATR de ${p.n} (los del día de la señal) por debajo del precio de entrada`,
  valida: (p) => validaDeclarados(P_STOP_FIJO, p),
  indicadores: (p) => [{ indicador: 'ATR', periodo: p.n }],
  evalua: (velas, p) => {
    const c = precios(velas, 'close'), a = atr(velas, p.n)
    return (op, t) => c[t] != null && a[op.e - 1] != null ? c[t] < op.entrada - p.k * a[op.e - 1] : null
  },
}
const P_RSI_SOBRE = [
  { clave: 'n', etiqueta: 'Periodo del RSI', tipo: 'entero', defecto: 14, min: 1, max: 100 },
  { clave: 'umbral', etiqueta: 'Umbral del RSI', tipo: 'numero', defecto: 70, min: 0, max: 100 },
]
const rsiSobrecompra = {
  id: 'rsiSobrecompra', clase: 'salida', nombre: 'RSI en sobrecompra', parametros: P_RSI_SOBRE,
  frase: (p) => `el RSI de ${p.n} supera ${fmtNum(p.umbral)}`,
  valida: (p) => validaDeclarados(P_RSI_SOBRE, p),
  indicadores: (p) => [{ indicador: 'RSI', periodo: p.n }],
  evalua: (velas, p) => {
    const r = rsi(velas, p.n)
    return (op, t) => r[t] != null ? r[t] > p.umbral : null
  },
}
// Tope de tiempo: N velas contando la de entrada (al cierre). Lo aplica el laboratorio; aquí solo se declara.
const P_TIEMPO = [{ clave: 'n', etiqueta: 'Velas como mucho', tipo: 'entero', defecto: 120, min: 1, max: 250 }]
const tiempoMaximo = {
  id: 'tiempoMaximo', clase: 'salida', nombre: 'Tiempo máximo', parametros: P_TIEMPO, tiempo: true,
  frase: (p) => `al cierre de la vela ${p.n} como mucho`,
  valida: (p) => validaDeclarados(P_TIEMPO, p),
  indicadores: () => [],
}
export const SALIDAS = Object.freeze({ cierreBajoMedia, stopMovilATR, stopFijoATR, rsiSobrecompra, tiempoMaximo })
export const CATALOGO_SALIDAS = Object.freeze(Object.values(SALIDAS))
export const parametrosSalidaPorDefecto = (id) => defectos(SALIDAS[id].parametros)
// Errores de una lista de salidas [{ id, params }] (se combinan con «O»: sale con la primera que salte). Hace falta
// exactamente un tiempoMaximo (sin tope una posición podría no cerrarse nunca) y al menos otra regla o el tope solo.
export function validaSalidas(reglas) {
  const errores = []
  if (!Array.isArray(reglas) || !reglas.length) return ['Falta la salida.']
  for (const r of reglas) {
    const s = SALIDAS[r?.id]
    if (!s) errores.push(`«${r?.id}» no es una salida del catálogo.`)
    else errores.push(...s.valida(r.params).map(e => `${s.nombre}: ${e}`))
  }
  const topes = reglas.filter(r => r?.id === 'tiempoMaximo').length
  if (topes !== 1) errores.push(topes ? 'Solo puede haber un tiempo máximo.' : 'Hace falta un tiempo máximo (tope de velas).')
  return errores
}
// Tope (N) y condiciones de una lista de salidas válida.
export const topeDe = (reglas) => reglas.find(r => r.id === 'tiempoMaximo').params.n
export const condicionesDe = (reglas) => reglas.filter(r => !SALIDAS[r.id].tiempo)
export const indicadoresSalidas = (reglas) => reglas.flatMap(r => SALIDAS[r.id].indicadores(r.params))
// «salir a la apertura siguiente cuando …, o al cierre de la vela N como mucho».
export function fraseSalidas(reglas) {
  const conds = condicionesDe(reglas).map(r => SALIDAS[r.id].frase(r.params)), n = topeDe(reglas)
  return conds.length ? `salir a la apertura siguiente cuando ${conds.join(' o ')}, o al cierre de la vela ${n} como mucho`
    : `salir al cierre de la vela ${n}`
}

// ── Catálogo y combinación ─────────────────────────────────────────────────────────────────────────────────────────────
// Cada señal declara su CONDICIÓN (true/false/null por vela); calcula la convierte en evento (disparadores) o en estado
// (filtros). El laboratorio (lib/laboratorio.js) usa también la condición para saber en qué velas la señal era calculable.
for (const s of [cruceMedias, ruptura, precioCruzaMedia, retroceso, volumenAlto, mercadoAlcista])
  s.calcula = (velas, p, ctx = {}) => (s.clase === 'disparador' ? aEvento : aEstado)(s.condicion(velas, p, ctx))
export const SENALES = Object.freeze({ cruceMedias, ruptura, precioCruzaMedia, retroceso, volumenAlto, mercadoAlcista })
export const CATALOGO = Object.freeze(Object.values(SENALES))
export const parametrosPorDefecto = (id) => defectos(SENALES[id].parametros)

// Errores de una combinación { disparador: { id, params }, filtros: [{ id, params }] }.
export function validaCombinacion(c) {
  const errores = []
  const d = SENALES[c?.disparador?.id]
  if (!d || d.clase !== 'disparador') errores.push('Falta un disparador válido.')
  else errores.push(...d.valida(c.disparador.params).map(e => `${d.nombre}: ${e}`))
  for (const f of c?.filtros || []) {
    const s = SENALES[f?.id]
    if (!s || s.clase !== 'filtro') errores.push(`«${f?.id}» no es un filtro del catálogo.`)
    else errores.push(...s.valida(f.params).map(e => `${s.nombre}: ${e}`))
  }
  return errores
}
// Primera letra en minúscula para encadenar frases, salvo en siglas («QQQ», «RSI»: segunda letra también mayúscula).
const enMinuscula = (s) => /^\p{Lu}\p{Lu}/u.test(s) ? s : s.replace(/^./, (x) => x.toLowerCase())
// Frase de una combinación: «disparador, si filtro y filtro».
export function fraseCombinacion(c) {
  const d = SENALES[c.disparador.id].frase(c.disparador.params)
  const fs = (c.filtros || []).map(f => enMinuscula(SENALES[f.id].frase(f.params)))
  return fs.length ? `${d}, si ${fs.join(' y ')}` : d
}
// La regla completa en castellano, para la pantalla del laboratorio: «Entrar cuando …, solo si … y …; salir a las N velas».
export function fraseRegla(c, nVelas) {
  const d = enMinuscula(SENALES[c.disparador.id].frase(c.disparador.params))
  const fs = (c.filtros || []).map(f => enMinuscula(SENALES[f.id].frase(f.params)))
  return `Entrar cuando ${d}${fs.length ? `, solo si ${fs.join(' y ')}` : ''}; salir a las ${nVelas} velas`
}
// Velas en que la combinación es CALCULABLE (no nula): la condición del disparador calculable en t y en t−1 (un evento
// necesita las dos) y la de cada filtro en t. Son las fechas en que podría haber habido una señal.
export function calculables(velas, c, ctx = {}) {
  const d = SENALES[c.disparador.id].condicion(velas, c.disparador.params, ctx)
  const fs = (c.filtros || []).map(f => SENALES[f.id].condicion(velas, f.params, ctx))
  return velas.map((_, t) => t > 0 && d[t] != null && d[t - 1] != null && fs.every(f => f[t] != null))
}
// Entradas de una combinación sobre una serie: entrada[t] = disparador[t] Y todos los filtros[t]. ctx: { qqq }.
export function entradas(velas, c, ctx = {}) {
  const errores = validaCombinacion(c)
  if (errores.length) throw new Error(errores.join(' '))
  const base = SENALES[c.disparador.id].calcula(velas, c.disparador.params, ctx)
  const filtros = (c.filtros || []).map(f => SENALES[f.id].calcula(velas, f.params, ctx))
  return base.map((x, t) => x && filtros.every(f => f[t]))
}
