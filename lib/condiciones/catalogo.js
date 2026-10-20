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
import { semanalesDesdeDiarias, lunesDeSemana } from '../velasSemanales'

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

// Caída desde el máximo (la de CARTERA_1, movida tal cual de lib/laboratorioCartera.js en V9.1002). Sobre los cierres c:
// M[t] = máximo de cierre de t−ventana+1 … t (el último día con ese máximo); si[t]: el mínimo de cierre desde ese día hasta
// t está al menos pct % por debajo de M[t] («está, o ha estado desde el máximo, al menos pct % por debajo sin haberlo
// vuelto a superar»; ninguno lo supera: es el máximo de la ventana). Antes de la ventana completa, M null y si false: así la
// usa la máquina de estados de la cartera, que mira si[t] y M[t] (el máximo de referencia).
export function caidaDesdeMaximoPrep(c, p) {
  const n = c.length, M = new Array(n).fill(null), si = new Array(n).fill(false)
  for (let t = p.ventana - 1; t < n; t++) {
    let m = -Infinity, j = -1
    for (let i = t - p.ventana + 1; i <= t; i++) if (c[i] >= m) { m = c[i]; j = i }
    let mn = Infinity
    for (let i = j; i <= t; i++) if (c[i] < mn) mn = c[i]
    M[t] = m; si[t] = mn <= m * (1 - p.pct / 100)
  }
  return { M, si }
}
// Como condición del catálogo: «sin dato» antes de la ventana completa y si falta algún cierre en la ventana.
export const caidaDesdeMaximo = define({
  id: 'caidaDesdeMaximo', nombre: 'Caída desde el máximo de N velas',
  parametros: [
    { clave: 'ventana', etiqueta: 'Velas del máximo', tipo: 'entero', defecto: 252, min: 2, max: 2000, unidad: 'velas' },
    { clave: 'pct', etiqueta: 'Caída', tipo: 'numero', defecto: 10, min: 0, max: 100, unidad: '%' },
  ],
  frase: (p) => `el cierre está, o ha estado desde el máximo de cierre de las últimas ${p.ventana} velas, al menos un ${fmtNum(p.pct)} % por debajo de ese máximo sin haberlo vuelto a superar`,
  calentamiento: (p) => p.ventana,
  serie: (velas, p) => {
    const c = precios(velas, 'close'), { si } = memo(velas, `caida|${p.ventana}|${p.pct}`, () => caidaDesdeMaximoPrep(c, p))
    let malos = 0
    return velas.map((_, t) => {
      if (c[t] == null) malos++
      if (t >= p.ventana && c[t - p.ventana] == null) malos--
      return t < p.ventana - 1 || malos > 0 ? null : si[t]
    })
  },
})

// ── Evaluación SEMANAL con velas semanales reales (decisión 7) ──
// La condición `c` calculada en las velas SEMANALES (lib/velasSemanales.js, de las diarias) y puesta en el día que CIERRA
// cada semana: el día t cierra su semana si la vela diaria siguiente es de otra semana (el calendario se sabe de antemano);
// la última vela no se da por cerrada. El resto de los días, «sin dato» (ahí no se evalúa). Comprobado en V9.1002 con el QQQ
// 2005–2026 y 26 medias: en todos los cierres de semana, la misma media que mediaSemanal de la cartera.
export function enSemanal(c, velas, p) {
  return memo(velas, `semanal|${c.id}|${JSON.stringify(p)}`, () => {
    const sem = semanalesDesdeDiarias(velas), s = c.serie(sem, p), k = Object.fromEntries(sem.map((w, j) => [w.date, j]))
    const out = velas.map(() => null)
    for (let t = 0; t < velas.length - 1; t++) {
      const lunes = lunesDeSemana(velas[t].date)
      if (lunesDeSemana(velas[t + 1].date) !== lunes && k[lunes] != null) out[t] = s[k[lunes]]
    }
    return out
  })
}

// ── Activo de referencia (decisión 3) ──
// La condición `c` calculada en las velas de la REFERENCIA (en sus sesiones) y llevada a las fechas del activo con
// alineaReferencia: en cada fecha, el último valor de la referencia con fecha <= la del activo (mismoDia; con una referencia
// que cierra más tarde que el activo hay que pasar mismoDia: false). Sin velas de la referencia, todo «sin dato».
export function enReferencia(c, velas, velasRef, p, { mismoDia = true } = {}) {
  if (!velasRef?.length) return velas.map(() => null)
  const s = memo(velasRef, `nivel|${c.id}|${JSON.stringify(p)}`, () => c.serie(velasRef, p))
  return alineaReferencia(velas.map(v => v.date), velasRef.map(v => v.date), s, { mismoDia })
}

export const CONDICIONES_NIVEL = Object.freeze({ precioVsMedia, mediaVsMedia, rsiNivel, nuevoMaximo, volumenAlto, caidaDesdeMaximo })

// ── Condiciones de UNIVERSO (comparan el valor con los demás el mismo día) ──
// Fuerza relativa por percentil (§3.1, lib/fuerzaRelativa.js): el percentil de la rentabilidad ponderada de 12 meses del
// valor entre los miembros del Nasdaq-100 de ese día, con datos hasta el cierre de t. No sale de las velas del valor: lo
// calcula quien tiene el universo (el servidor) y lo deja en cada vela, en el campo rsPercentil (0–100 o null). La
// condición lee ese campo; sin él, sin dato.
export const fuerzaRelativaPercentil = define({
  id: 'fuerzaRelativaPercentil', nombre: 'Fuerza relativa (percentil en el Nasdaq-100)', campo: 'rsPercentil',
  parametros: [
    { clave: 'umbral', etiqueta: 'Percentil', tipo: 'numero', defecto: 80, min: 0, max: 100, unidad: 'percentil' },
    pLado(),
  ],
  frase: (p) => `la fuerza relativa (percentil en el Nasdaq-100) está por ${p.lado === 'debajo' ? 'debajo' : 'encima'} de ${fmtNum(p.umbral)}`,
  calentamiento: () => 253,
  serie: (velas, p) => velas.map(v => typeof v?.rsPercentil === 'number' && Number.isFinite(v.rsPercentil) ? compara(v.rsPercentil, p.umbral, p.lado) : null),
})
export const CONDICIONES_UNIVERSO = Object.freeze({ fuerzaRelativaPercentil })

// ── Filtros del backtest (FiltrosPanel, lib/filtros.js): la variante HEREDADA, CÁLCULO 1 (decisiones 1, 2 y 4) ──
// Los filtros del backtest evalúan estas comparaciones sobre series que lib/filtros.js ya ha alineado con la rejilla del
// activo (relleno hacia delante y EMA sobre esa rejilla; en semanal, la última semana cerrada). Conservan lo de siempre:
// sin dato, DEJAN PASAR (fail-open), y el precio frente a la media con «≥». Lo nuevo del catálogo (sin dato = no entra;
// «>») no se aplica aquí: cambiaría la batería. Movido tal cual desde las pruebas de cada filtro en V9.1009.
export const FILTROS_CALCULO_1 = Object.freeze({
  // indiceEma: cierre ≥ EMA
  precioVsMedia: (c, e) => c == null || e == null ? true : c >= e,
  // cruceEma: EMA rápida > EMA lenta (un estado, aunque se llame «cruce»)
  mediaVsMedia: (er, el) => er == null || el == null ? true : er > el,
  // macd: línea > señal
  macdVsSenal: (l, s) => l == null || s == null ? true : l > s,
  // rsi: banda inclusiva min ≤ RSI ≤ max (min > max no deja pasar nada)
  rsiRango: (v, lo, hi) => v == null ? true : (v >= lo && v <= hi),
})
