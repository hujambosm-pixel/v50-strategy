// lib/condiciones/nucleo.js — el NÚCLEO del catálogo único de condiciones (docs/catalogo-condiciones.md, commit 1 del plan).
// Puro: sin red, sin fechas del sistema. Nadie lo usa todavía salvo lib/senales.js (validaDeclarados y defectos, que
// vivían allí y se mueven tal cual): ningún resultado cambia.
//
// UNA CONDICIÓN da, por vela, true | false | null. null = «sin dato» (calentamiento, dato ausente o no válido): nunca es
// verdadero, y con «sin dato» no se entra ni se cambia de estado (decisión 1). El valor en t solo puede depender de las
// velas hasta el cierre de t: lo comprueba sinMirarAlFuturo para cualquier condición.
//
// Los combinadores trabajan con series de tres valores (arrays de la misma longitud) y devuelven otra serie de tres valores.
import { proyectarSemanal as _proyectarSemanal } from '../filtros'

// ── Lógica de tres valores (Kleene) ──
// Y: false si alguno es false; si no, null si alguno es null; si no, true. Sin series, true (el neutro).
export function Y(...series) {
  const n = series.length ? series[0].length : 0
  const out = new Array(n)
  for (let t = 0; t < n; t++) {
    let r = true
    for (const s of series) { const v = s[t]; if (v === false) { r = false; break } if (v !== true) r = null }
    out[t] = r
  }
  return out
}
// O: true si alguno es true; si no, null si alguno es null; si no, false. Sin series, false (el neutro).
export function O(...series) {
  const n = series.length ? series[0].length : 0
  const out = new Array(n)
  for (let t = 0; t < n; t++) {
    let r = false
    for (const s of series) { const v = s[t]; if (v === true) { r = true; break } if (v !== false) r = null }
    out[t] = r
  }
  return out
}
// NO: invierte true y false; «sin dato» sigue siendo «sin dato».
export const NO = (serie) => serie.map(v => v === true ? false : v === false ? true : null)

// ── Evento ──
// cruza: la condición PASA de falsa a verdadera en t (true en t y false en t−1). null si falta el dato en t o en t−1
// (y en la primera vela). Es el aEvento de lib/senales.js con «sin dato» explícito: aEvento(c)[t] === (cruza(c)[t] === true).
export function cruza(serie) {
  return serie.map((v, t) => {
    if (t === 0) return null
    const a = serie[t - 1]
    if ((v !== true && v !== false) || (a !== true && a !== false)) return null
    return v === true && a === false
  })
}

// ── Histéresis ──
// Estado con memoria: pasa a verdadero en la vela en que `entra` es true y vuelve a falso en la que `sale` es true («salir
// por debajo de A y volver por encima de B»). Con «sin dato» en la condición que tocaría mirar, el estado no cambia. Antes
// de su primer cambio vale `inicial` (por defecto null: sin dato). Si las dos son true en la misma vela, solo se mira la que
// puede cambiar el estado (estando dentro, la de salir; fuera o sin estado, la de entrar; sin estado, después la de salir).
export function histeresis(entra, sale, inicial = null) {
  let estado = inicial
  return entra.map((e, t) => {
    const s = sale[t]
    if (estado === true) { if (s === true) estado = false }
    else if (e === true) estado = true
    else if (estado === null && s === true) estado = false
    return estado
  })
}

// ── Activo de referencia (decisión 3) ──
// La condición de la referencia se calcula en SUS sesiones; en cada fecha del activo se usa el último valor de la
// referencia con fecha anterior (o igual, con mismoDia) a la del activo. Las dos listas de fechas, en orden.
//   mismoDia: true usa la vela de la referencia del mismo día, que solo es «ya cerrada» si la referencia cierra antes o a
//   la vez que el activo (QQQ para un valor de Nueva York: lo que hace mercadoAlcista). Con una referencia que cierra más
//   tarde (QQQ para un valor de Madrid) tiene que ser false: si no, se miraría al futuro.
// Sin vela de la referencia todavía, null.
export function alineaReferencia(fechasActivo, fechasRef, serieRef, { mismoDia = true } = {}) {
  let j = -1
  return fechasActivo.map(f => {
    while (j + 1 < fechasRef.length && (mismoDia ? fechasRef[j + 1] <= f : fechasRef[j + 1] < f)) j++
    return j >= 0 ? (serieRef[j] ?? null) : null
  })
}

// ── Semanal ──
// Una serie medida en velas SEMANALES (las de lib/velasSemanales.js, fechadas en su lunes) sobre las fechas diarias del
// activo, con la regla de la última semana CERRADA (la de los filtros; el valor de una semana se usa desde el lunes
// siguiente). Es la misma función de lib/filtros.js: un solo calendario.
export const proyectaSemanal = (serie, fechasSemanales, fechasActivo) => _proyectarSemanal(serie, fechasSemanales, fechasActivo)

// ── Parámetros declarados (movido tal cual de lib/senales.js) ──
// Cada parámetro: { clave, etiqueta, tipo: 'entero' | 'numero' | 'opcion' | 'ticker', defecto, min, max, opciones }. Todos
// obligatorios salvo los que llevan opcional: true (V9.1012). 'ticker' (V9.1003): un símbolo de Yahoo en mayúsculas (^GSPC, QQQ, SAN.MC, BRK-B, EURUSD=X…).
const finito = (x) => typeof x === 'number' && Number.isFinite(x)
const fmtNum = (x) => String(x).replace('.', ',')
const RE_TICKER = /^\^?[A-Z0-9][A-Z0-9.=-]{0,14}$/
export function validaDeclarados(parametros, params) {
  const errores = []
  for (const p of parametros) {
    const v = params?.[p.clave]
    if (v == null || v === '') { if (!p.opcional) errores.push(`Falta «${p.etiqueta}».`); continue }   // opcional (V9.1012): sin él, su defecto
    if (p.tipo === 'ticker') { if (typeof v !== 'string' || !RE_TICKER.test(v)) errores.push(`«${p.etiqueta}» tiene que ser un ticker de Yahoo en mayúsculas (como QQQ, ^GSPC o SAN.MC).`); continue }
    if (p.tipo === 'opcion') { if (!p.opciones.includes(v)) errores.push(`«${p.etiqueta}» tiene que ser ${p.opciones.join(' o ')}.`); continue }
    if (!finito(v)) { errores.push(`«${p.etiqueta}» tiene que ser un número.`); continue }
    if (p.tipo === 'entero' && !Number.isInteger(v)) errores.push(`«${p.etiqueta}» tiene que ser un número entero.`)
    if (p.min != null && v < p.min) errores.push(`«${p.etiqueta}» no puede ser menor que ${fmtNum(p.min)}.`)
    if (p.max != null && v > p.max) errores.push(`«${p.etiqueta}» no puede ser mayor que ${fmtNum(p.max)}.`)
  }
  return errores
}
export const defectos = (parametros) => Object.fromEntries(parametros.map(p => [p.clave, p.defecto]))

// ── Sin mirar al futuro ──
// La prueba de truncado: para cada t de `ts`, la condición calculada con las velas HASTA t (velas.slice(0, t + 1)) tiene que
// dar en t lo mismo que con la serie entera. calcula(velas) → serie de tres valores. Devuelve las t en que no coincide
// ([] = no mira al futuro en esas velas). Las velas nuevas son copias, así que una caché por array no la engaña.
export function sinMirarAlFuturo(calcula, velas, ts) {
  const entera = calcula(velas)
  const malas = []
  for (const t of ts) {
    const corta = calcula(velas.slice(0, t + 1).map(v => ({ ...v })))
    const a = corta[t] ?? null, b = entera[t] ?? null
    if (!(a === b || (typeof a === 'number' && typeof b === 'number' && Object.is(a, b)))) malas.push(t)
  }
  return malas
}
