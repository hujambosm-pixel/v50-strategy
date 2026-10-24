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
import { media, rsi, maximoPrevio, precios, memo, atr, minimoPrevio, maximoHasta, macd, bollinger } from './indicadores'
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
// comparacion (V9.1012, opcional): '>' (por defecto, estricta: el empate no cuenta) o '≥' (el empate cuenta). La no
// estricta existe para reproducir estrategias antiguas que comparaban así (el cruce de la 1 V50: EMA rápida ≥ lenta).
const compara = (a, b, lado, comparacion) => comparacion === '≥'
  ? (lado === 'debajo' ? a <= b : a >= b)
  : (lado === 'debajo' ? a < b : a > b)
const pComparacion = { clave: 'comparacion', etiqueta: 'Comparación', tipo: 'opcion', defecto: '>', opciones: ['>', '≥'], opcional: true,
  ayuda: '«≥» cuenta el empate como cumplido. Déjalo en «>» salvo para reproducir una estrategia antigua.' }
const define = (c) => ({ ...c, tipo: 'nivel', valida: c.valida || ((p) => validaDeclarados(c.parametros, p)) })

// Precio (cierre) frente a su media: cierre[t] > media[t] (encima) o < (debajo).
export const precioVsMedia = define({
  id: 'precioVsMedia', nombre: 'Precio frente a la media',
  parametros: [...pMedia('', 'la media', 'SMA', 200), pLado(), pComparacion],
  frase: (p) => `el cierre está por ${p.lado === 'debajo' ? 'debajo' : 'encima'} de su ${p.tipo} de ${p.periodo}${p.comparacion === '≥' ? ' (o en ella)' : ''}`,
  calentamiento: (p) => p.periodo,
  serie: (velas, p) => {
    const c = precios(velas, 'close'), m = media(velas, p.tipo, p.periodo)
    return velas.map((_, t) => c[t] != null && m[t] != null ? compara(c[t], m[t], p.lado, p.comparacion) : null)
  },
})

// Dos medias: rápida[t] > lenta[t] (o <, con lado «debajo»).
export const mediaVsMedia = define({
  id: 'mediaVsMedia', nombre: 'Una media frente a otra',
  parametros: [...pMedia('Rapida', 'la media rápida', 'EMA', 10), ...pMedia('Lenta', 'la media lenta', 'EMA', 11), pLado(), pComparacion],
  valida: (p) => {
    const e = validaDeclarados(mediaVsMedia.parametros, p)
    if (!e.length && !(p.periodoRapida < p.periodoLenta)) e.push('El periodo de la media rápida tiene que ser menor que el de la lenta.')
    return e
  },
  frase: (p) => `la ${p.tipoRapida} de ${p.periodoRapida} está por ${p.lado === 'debajo' ? 'debajo' : 'encima'} de la ${p.tipoLenta} de ${p.periodoLenta}${p.comparacion === '≥' ? ' (o igual)' : ''}`,
  calentamiento: (p) => Math.max(p.periodoRapida, p.periodoLenta),
  serie: (velas, p) => {
    const r = media(velas, p.tipoRapida, p.periodoRapida), l = media(velas, p.tipoLenta, p.periodoLenta)
    return velas.map((_, t) => r[t] != null && l[t] != null ? compara(r[t], l[t], p.lado, p.comparacion) : null)
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

// ── Condiciones nuevas del Builder (V9.1047; docs/builder.md, §13) ──
// Solo usan lo que el motor ya calcula: las medias, el RSI, el ATR, el MACD y las bandas de Bollinger de lib/backtester.js
// (con la caché de lib/condiciones/indicadores.js), la media del volumen de volumenAlto y los precios de las velas. Las de
// arriba no cambian. Mismas reglas: «sin dato» si falta el indicador o un precio; comparaciones ESTRICTAS. Las que comparan
// un % se escriben sin dividir (c × 100 > ref × (100 + X)) para que el caso justo en el nivel no dependa del redondeo.
const pVelas = (clave, etiqueta, defecto, max = 1000, min = 1) => ({ clave, etiqueta, tipo: 'entero', defecto, min, max, unidad: 'velas' })
const pLadoTexto = (p, si, no) => p.lado === 'debajo' ? no : si

// La media sube (o baja): media[t] > media[t−n] (encima) o < (debajo).
export const mediaPendiente = define({
  id: 'mediaPendiente', nombre: 'La media sube o baja',
  parametros: [...pMedia('', 'la media', 'SMA', 50), pVelas('n', 'Velas atrás', 5, 500), pLado()],
  frase: (p) => `la ${p.tipo} de ${p.periodo} está por ${pLadoTexto(p, 'encima', 'debajo')} de su valor de hace ${p.n} velas`,
  calentamiento: (p) => p.periodo + p.n,
  serie: (velas, p) => {
    const m = media(velas, p.tipo, p.periodo)
    return velas.map((_, t) => t >= p.n && m[t] != null && m[t - p.n] != null ? compara(m[t], m[t - p.n], p.lado) : null)
  },
})

// El cierre cerca de su media: |cierre[t] − media[t]| < pct % de media[t] (hacia arriba o hacia abajo).
export const distanciaMedia = define({
  id: 'distanciaMedia', nombre: 'Cierre cerca de su media',
  parametros: [...pMedia('', 'la media', 'SMA', 20), { clave: 'pct', etiqueta: 'Distancia', tipo: 'numero', defecto: 3, min: 0.1, max: 100, unidad: '%' }],
  frase: (p) => `el cierre está a menos de un ${fmtNum(p.pct)} % de su ${p.tipo} de ${p.periodo}`,
  calentamiento: (p) => p.periodo,
  serie: (velas, p) => {
    const c = precios(velas, 'close'), m = media(velas, p.tipo, p.periodo)
    return velas.map((_, t) => c[t] != null && m[t] != null ? Math.abs(c[t] - m[t]) * 100 < m[t] * p.pct : null)
  },
})

// El cierre frente al de hace n velas: cierre[t] > cierre[t−n] (encima) o < (debajo).
export const cambioPrecio = define({
  id: 'cambioPrecio', nombre: 'Cierre frente al de hace N velas',
  parametros: [pVelas('n', 'Velas atrás', 5, 1000), pLado()],
  frase: (p) => `el cierre está por ${pLadoTexto(p, 'encima', 'debajo')} del de hace ${p.n} velas`,
  calentamiento: (p) => p.n,
  serie: (velas, p) => {
    const c = precios(velas, 'close')
    return velas.map((_, t) => t >= p.n && c[t] != null && c[t - p.n] != null ? compara(c[t], c[t - p.n], p.lado) : null)
  },
})

// ROC: el cambio del cierre en n velas, en %, frente a un nivel: (cierre[t] / cierre[t−n] − 1) × 100 > umbral (o <).
export const rocNivel = define({
  id: 'rocNivel', nombre: 'ROC (cambio en % en N velas) frente a un nivel',
  parametros: [pVelas('n', 'Velas', 10, 1000), { clave: 'umbral', etiqueta: 'Nivel', tipo: 'numero', defecto: 5, min: -100, max: 1000, unidad: '%' }, pLado()],
  frase: (p) => `el cambio del cierre en ${p.n} velas está por ${pLadoTexto(p, 'encima', 'debajo')} de ${fmtNum(p.umbral)} %`,
  calentamiento: (p) => p.n,
  serie: (velas, p) => {
    const c = precios(velas, 'close')
    return velas.map((_, t) => t >= p.n && c[t] != null && c[t - p.n] != null ? compara(c[t] * 100, c[t - p.n] * (100 + p.umbral), p.lado) : null)
  },
})

// MACD (calcMACD): la línea frente a su señal, o frente a 0.
const pMacd = (conSenal) => [
  { clave: 'rapida', etiqueta: 'Velas de la media rápida', tipo: 'entero', defecto: 12, min: 1, max: 500, unidad: 'velas' },
  { clave: 'lenta', etiqueta: 'Velas de la media lenta', tipo: 'entero', defecto: 26, min: 2, max: 1000, unidad: 'velas' },
  ...(conSenal ? [{ clave: 'senal', etiqueta: 'Velas de la señal', tipo: 'entero', defecto: 9, min: 1, max: 500, unidad: 'velas' }] : []),
  pLado(),
]
const validaMacd = (c) => (p) => {
  const e = validaDeclarados(c.parametros, p)
  if (!e.length && !(p.rapida < p.lenta)) e.push('La media rápida del MACD tiene que ser más corta que la lenta.')
  return e
}
export const macdSenal = define({
  id: 'macdSenal', nombre: 'MACD frente a su señal',
  parametros: pMacd(true),
  valida: (p) => validaMacd(macdSenal)(p),
  frase: (p) => `el MACD (${p.rapida}, ${p.lenta}, ${p.senal}) está por ${pLadoTexto(p, 'encima', 'debajo')} de su señal`,
  calentamiento: (p) => Math.max(p.rapida, p.lenta) + p.senal,
  serie: (velas, p) => {
    const { linea, senal } = macd(velas, p.rapida, p.lenta, p.senal)
    return velas.map((_, t) => linea[t] != null && senal[t] != null ? compara(linea[t], senal[t], p.lado) : null)
  },
})
export const macdCero = define({
  id: 'macdCero', nombre: 'MACD frente a 0',
  parametros: pMacd(false),
  valida: (p) => validaMacd(macdCero)(p),
  frase: (p) => `el MACD (${p.rapida}, ${p.lenta}) está por ${pLadoTexto(p, 'encima', 'debajo')} de 0`,
  calentamiento: (p) => Math.max(p.rapida, p.lenta),
  serie: (velas, p) => {
    const { linea } = macd(velas, p.rapida, p.lenta, 9)   // la línea no depende de la señal
    return velas.map((_, t) => linea[t] != null ? compara(linea[t], 0, p.lado) : null)
  },
})

// Bandas de Bollinger (calcBollinger): el cierre frente a la banda inferior o la superior.
export const bollingerBanda = define({
  id: 'bollingerBanda', nombre: 'Cierre frente a una banda de Bollinger',
  parametros: [
    { clave: 'banda', etiqueta: 'Banda', tipo: 'opcion', defecto: 'inferior', opciones: ['inferior', 'superior'] },
    { clave: 'periodo', etiqueta: 'Velas de la media', tipo: 'entero', defecto: 20, min: 2, max: 1000, unidad: 'velas' },
    { clave: 'desviaciones', etiqueta: 'Desviaciones', tipo: 'numero', defecto: 2, min: 0.1, max: 10 },
    pLado('debajo'),
  ],
  frase: (p) => `el cierre está por ${pLadoTexto(p, 'encima', 'debajo')} de la banda ${p.banda} de Bollinger (${p.periodo}, ${fmtNum(p.desviaciones)})`,
  calentamiento: (p) => p.periodo,
  serie: (velas, p) => {
    const c = precios(velas, 'close'), b = bollinger(velas, p.periodo, p.desviaciones), banda = p.banda === 'superior' ? b.superior : b.inferior
    return velas.map((_, t) => c[t] != null && banda[t] != null ? compara(c[t], banda[t], p.lado) : null)
  },
})

// ATR en % del cierre: ATR[t] / cierre[t] × 100 > umbral (o <).
export const atrPct = define({
  id: 'atrPct', nombre: 'ATR en % del precio',
  parametros: [
    { clave: 'periodo', etiqueta: 'Velas del ATR', tipo: 'entero', defecto: 14, min: 1, max: 200, unidad: 'velas' },
    { clave: 'umbral', etiqueta: 'Nivel', tipo: 'numero', defecto: 3, min: 0, max: 100, unidad: '%' },
    pLado(),
  ],
  frase: (p) => `el ATR de ${p.periodo} está por ${pLadoTexto(p, 'encima', 'debajo')} de un ${fmtNum(p.umbral)} % del cierre`,
  calentamiento: (p) => p.periodo,
  serie: (velas, p) => {
    const c = precios(velas, 'close'), a = atr(velas, p.periodo)
    return velas.map((_, t) => c[t] != null && a[t] != null ? compara(a[t] * 100, c[t] * p.umbral, p.lado) : null)
  },
})

// Volumen bajo: volumen[t] < k × la media del volumen de las n velas anteriores (la misma media que volumenAlto).
export const volumenBajo = define({
  id: 'volumenBajo', nombre: 'Volumen bajo',
  aviso: volumenAlto.aviso,
  parametros: [
    { clave: 'k', etiqueta: 'Veces la media', tipo: 'numero', defecto: 1, min: 0, max: 100, unidad: 'veces' },
    { clave: 'n', etiqueta: 'Velas de la media', tipo: 'entero', defecto: 20, min: 1, max: 500, unidad: 'velas' },
  ],
  frase: (p) => `el volumen no llega a ${fmtNum(p.k)} veces la media de las ${p.n} velas anteriores`,
  calentamiento: (p) => p.n + 1,
  serie: (velas, p) => {
    const v = precios(velas, 'volume')
    const mPrev = memo(velas, `volMediaPrevia|${p.n}`, () => {   // la misma cuenta (y la misma clave de caché) que volumenAlto
      const m = calcSMAEstricta(v, p.n)
      return velas.map((_, t) => t >= 1 ? m[t - 1] : null)
    })
    return velas.map((_, t) => v[t] != null && mPrev[t] != null ? v[t] < p.k * mPrev[t] : null)
  },
})

// Nuevo mínimo de N velas: cierre[t] < el menor de los mínimos de t−N … t−1 (sin la vela t).
export const nuevoMinimo = define({
  id: 'nuevoMinimo', nombre: 'Nuevo mínimo de N velas',
  parametros: [pVelas('n', 'Velas anteriores', 20, 1000)],
  frase: (p) => `el cierre baja del mínimo de las ${p.n} velas anteriores`,
  calentamiento: (p) => p.n,
  serie: (velas, p) => {
    const c = precios(velas, 'close'), mn = minimoPrevio(velas, p.n)
    return velas.map((_, t) => c[t] != null && mn[t] != null ? c[t] < mn[t] : null)
  },
})

// Cerca del máximo: el cierre a menos de pct % por debajo del mayor de los máximos de t−N+1 … t (contando la vela t).
export const cercaMaximo = define({
  id: 'cercaMaximo', nombre: 'Cierre cerca del máximo de N velas',
  parametros: [{ clave: 'pct', etiqueta: 'Distancia', tipo: 'numero', defecto: 5, min: 0.1, max: 100, unidad: '%' }, pVelas('n', 'Velas', 50, 1000)],
  frase: (p) => `el cierre está a menos de un ${fmtNum(p.pct)} % del máximo de las ${p.n} últimas velas`,
  calentamiento: (p) => p.n,
  serie: (velas, p) => {
    const c = precios(velas, 'close'), mx = maximoHasta(velas, p.n)
    return velas.map((_, t) => c[t] != null && mx[t] != null ? c[t] * 100 > mx[t] * (100 - p.pct) : null)
  },
})

export const CONDICIONES_NIVEL = Object.freeze({ precioVsMedia, mediaVsMedia, rsiNivel, nuevoMaximo, volumenAlto, caidaDesdeMaximo,
  mediaPendiente, distanciaMedia, cambioPrecio, rocNivel, macdSenal, macdCero, bollingerBanda, atrPct, volumenBajo, nuevoMinimo, cercaMaximo })

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
