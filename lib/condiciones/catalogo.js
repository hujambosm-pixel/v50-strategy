// lib/condiciones/catalogo.js — las condiciones de NIVEL del catálogo único (commit 3 del plan de docs/catalogo-condiciones.md).
// Puro. Cada condición: { id, nombre, tipo: 'nivel', parametros (declarados: el editor pinta el formulario con ellos),
// valida(p) → [errores], frase(p), calentamiento(p) → velas, serie(velas, p, ctx) → [true | false | null] }.
//
// REGLAS (las de §2 y §7 del documento): el valor en t usa solo las velas hasta el cierre de t; «sin dato» (null) cuando
// falta el indicador o el precio (calentamiento, dato ausente o no válido; volumen 0 = no válido); comparaciones ESTRICTAS
// (>, <). El evento («cruza») no es una condición del catálogo sino un combinador (lib/condiciones/nucleo.js: cruza).
// Los indicadores, con su caché: lib/condiciones/indicadores.js.
//
// Las señales del laboratorio (lib/senales.js) se construyen con estas condiciones y conservan su id, sus parámetros y su
// frase: las huellas de los lotes no cambian y sus series son las mismas.
import { media, rsi, maximoPrevio, precios, memo } from './indicadores'
import { validaDeclarados, alineaReferencia } from './nucleo'
import { calcSMAEstricta } from '../indicadores'

const fmtNum = (x) => String(x).replace('.', ',')
const LADOS = ['encima', 'debajo']
const pMedia = (prefijo, etiqueta, tipo, periodo, max = 1000) => [
  { clave: `tipo${prefijo}`, etiqueta: `Tipo de ${etiqueta}`, tipo: 'opcion', defecto: tipo, opciones: ['EMA', 'SMA'] },
  { clave: `periodo${prefijo}`, etiqueta: `Periodo de ${etiqueta}`, tipo: 'entero', defecto: periodo, min: 1, max, unidad: 'velas' },
]
const pLado = (defecto = 'encima') => ({ clave: 'lado', etiqueta: 'Lado', tipo: 'opcion', defecto, opciones: LADOS })
const compara = (a, b, lado) => lado === 'debajo' ? a < b : a > b
const define = (c) => ({ ...c, tipo: 'nivel', valida: c.valida || ((p) => validaDeclarados(c.parametros, p)) })

// Precio (cierre) frente a su media: cierre[t] > media[t] (encima) o < (debajo).
export const precioVsMedia = define({
  id: 'precioVsMedia', nombre: 'Precio frente a la media',
  parametros: [...pMedia('', 'la media', 'SMA', 200), pLado()],
  frase: (p) => `el cierre está por ${p.lado === 'debajo' ? 'debajo' : 'encima'} de su ${p.tipo} de ${p.periodo}`,
  calentamiento: (p) => p.periodo,
  serie: (velas, p) => {
    const c = precios(velas, 'close'), m = media(velas, p.tipo, p.periodo)
    return velas.map((_, t) => c[t] != null && m[t] != null ? compara(c[t], m[t], p.lado) : null)
  },
})

// Dos medias: rápida[t] > lenta[t] (o <, con lado «debajo»).
export const mediaVsMedia = define({
  id: 'mediaVsMedia', nombre: 'Una media frente a otra',
  parametros: [...pMedia('Rapida', 'la media rápida', 'EMA', 10), ...pMedia('Lenta', 'la media lenta', 'EMA', 11), pLado()],
  valida: (p) => {
    const e = validaDeclarados(mediaVsMedia.parametros, p)
    if (!e.length && !(p.periodoRapida < p.periodoLenta)) e.push('El periodo de la media rápida tiene que ser menor que el de la lenta.')
    return e
  },
  frase: (p) => `la ${p.tipoRapida} de ${p.periodoRapida} está por ${p.lado === 'debajo' ? 'debajo' : 'encima'} de la ${p.tipoLenta} de ${p.periodoLenta}`,
  calentamiento: (p) => Math.max(p.periodoRapida, p.periodoLenta),
  serie: (velas, p) => {
    const r = media(velas, p.tipoRapida, p.periodoRapida), l = media(velas, p.tipoLenta, p.periodoLenta)
    return velas.map((_, t) => r[t] != null && l[t] != null ? compara(r[t], l[t], p.lado) : null)
  },
})

// RSI de Wilder frente a un nivel: RSI[t] > umbral (encima) o < (debajo).
export const rsiNivel = define({
  id: 'rsiNivel', nombre: 'RSI frente a un nivel',
  parametros: [
    { clave: 'periodo', etiqueta: 'Periodo del RSI', tipo: 'entero', defecto: 14, min: 1, max: 100, unidad: 'velas' },
    { clave: 'umbral', etiqueta: 'Nivel', tipo: 'numero', defecto: 50, min: 0, max: 100 },
    pLado(),
  ],
  frase: (p) => `el RSI de ${p.periodo} está por ${p.lado === 'debajo' ? 'debajo' : 'encima'} de ${fmtNum(p.umbral)}`,
  calentamiento: (p) => p.periodo + 1,
  serie: (velas, p) => {
    const r = rsi(velas, p.periodo)
    return velas.map((_, t) => r[t] != null ? compara(r[t], p.umbral, p.lado) : null)
  },
})

// Nuevo máximo de N velas: cierre[t] > el mayor de los máximos de t−N … t−1 (sin la vela t).
export const nuevoMaximo = define({
  id: 'nuevoMaximo', nombre: 'Nuevo máximo de N velas',
  parametros: [{ clave: 'n', etiqueta: 'Velas anteriores', tipo: 'entero', defecto: 20, min: 1, max: 1000, unidad: 'velas' }],
  frase: (p) => `el cierre supera el máximo de las ${p.n} velas anteriores`,
  calentamiento: (p) => p.n,
  serie: (velas, p) => {
    const c = precios(velas, 'close'), mx = maximoPrevio(velas, p.n)
    return velas.map((_, t) => c[t] != null && mx[t] != null ? c[t] > mx[t] : null)
  },
})

// Volumen alto: volumen[t] > k × la media del volumen de las N velas anteriores (t−N … t−1). Volumen 0 = sin dato.
// AVISO (para el editor): en índices (^GSPC, ^NDX…) y en algunos ETF el volumen de Yahoo no es fiable.
export const volumenAlto = define({
  id: 'volumenAlto', nombre: 'Volumen alto',
  aviso: 'En índices y en algunos ETF el volumen de Yahoo no es fiable: no uses esta condición ahí.',
  parametros: [
    { clave: 'k', etiqueta: 'Veces la media', tipo: 'numero', defecto: 1.5, min: 0, max: 100, unidad: 'veces' },
    { clave: 'n', etiqueta: 'Velas de la media', tipo: 'entero', defecto: 20, min: 1, max: 500, unidad: 'velas' },
  ],
  frase: (p) => `el volumen supera ${fmtNum(p.k)} veces la media de las ${p.n} velas anteriores`,
  calentamiento: (p) => p.n + 1,
  serie: (velas, p) => {
    const v = precios(velas, 'volume')   // volumen > 0 y finito; 0 cuenta como no válido
    const mPrev = memo(velas, `volMediaPrevia|${p.n}`, () => {
      const m = calcSMAEstricta(v, p.n)   // m[t] = media de t−n+1 … t → la de las n anteriores a t es m[t−1]
      return velas.map((_, t) => t >= 1 ? m[t - 1] : null)
    })
    return velas.map((_, t) => v[t] != null && mPrev[t] != null ? v[t] > p.k * mPrev[t] : null)
  },
})

// ── Activo de referencia (decisión 3) ──
// La condición `c` calculada en las velas de la REFERENCIA (en sus sesiones) y llevada a las fechas del activo con
// alineaReferencia: en cada fecha, el último valor de la referencia con fecha <= la del activo (mismoDia; con una referencia
// que cierra más tarde que el activo hay que pasar mismoDia: false). Sin velas de la referencia, todo «sin dato».
export function enReferencia(c, velas, velasRef, p, { mismoDia = true } = {}) {
  if (!velasRef?.length) return velas.map(() => null)
  const s = memo(velasRef, `nivel|${c.id}|${JSON.stringify(p)}`, () => c.serie(velasRef, p))
  return alineaReferencia(velas.map(v => v.date), velasRef.map(v => v.date), s, { mismoDia })
}

export const CONDICIONES_NIVEL = Object.freeze({ precioVsMedia, mediaVsMedia, rsiNivel, nuevoMaximo, volumenAlto })
