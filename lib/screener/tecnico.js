// lib/screener/tecnico.js — las cifras del piso TÉCNICO del screener (parte 2, fase 2a; docs/screener.md). Lógica PURA.
//
// tecnicoDe(velas) recibe velas DIARIAS CERRADAS ({ date, open, high, low, close, volume }, ordenadas; la vela en curso ya
// quitada) y devuelve lo que se guarda en public.screener_empresas.tecnico (sql/screener_tecnico.sql):
//   { fecha, cierre, ema200, ema50, ema20, max52, volUlt, volMedio50, cierre3m, velas }
//   · fecha / cierre: la última vela cerrada.
//   · ema200: la EMA de 200 del cierre con la MISMA función que el Builder (media() de lib/condiciones/indicadores.js, que usa
//     calcEMA: arranca con la media simple de las 200 primeras). Depende de dónde empiecen las velas: con 5 años (~1.260 velas)
//     el peso del arranque es (1 − 2/201)^1.060 ≈ 0,003 %: despreciable. Con menos de 200 velas, null.
//   · ema50 / ema20 (docs/screener.md §16): lo mismo con 50 y 20 velas. Con menos velas, null.
//   · max52: el máximo (high) de las últimas 252 velas, contando la última (52 semanas ≈ 252 sesiones). null con menos de 252.
//   · volUlt / volMedio50: el volumen de la última vela y la media de las 50 ANTERIORES (sin contarla). null si falta alguno.
//   · cierre3m: el cierre de 63 velas antes (3 meses ≈ 63 sesiones). null con menos de 64 velas.
//   · velas: cuántas velas se usaron.
// Las cifras de los filtros salen de ahí (cifrasTecnicas): así lo guardado son precios, y una fórmula se puede cambiar sin
// volver a descargar.
import { media } from '../condiciones/indicadores'

export const ANIOS_TECNICO = 5
export const VELAS_52S = 252
export const VELAS_3M = 63
export const VELAS_VOLUMEN = 50

// El ETF SPDR de cada sector (los 11 sectores GICS de lib/screener/sectores.js). 'Otros' no tiene.
export const ETF_SECTOR = {
  'Tecnología': 'XLK', 'Salud': 'XLV', 'Financieras': 'XLF', 'Consumo discrecional': 'XLY', 'Comunicación': 'XLC',
  'Industria': 'XLI', 'Consumo básico': 'XLP', 'Energía': 'XLE', 'Utilities': 'XLU', 'Inmobiliario': 'XLRE', 'Materiales': 'XLB',
}
export const MERCADO = 'SPY'
// Lo que no está en el screener pero hace falta: el mercado (SPY) y los ETF de sectores.
export const REFERENCIAS_TECNICO = [MERCADO, ...Object.values(ETF_SECTOR)]

const finito = (x) => typeof x === 'number' && Number.isFinite(x)
const r = (x) => finito(x) ? x : null

export function tecnicoDe(velas) {
  const v = (velas || []).filter(x => x && x.date && finito(x.close) && x.close > 0)
  const n = v.length
  if (!n) return null
  const u = v[n - 1]
  const ema = n >= 200 ? media(v, 'EMA', 200)[n - 1] : null
  const ema50 = n >= 50 ? media(v, 'EMA', 50)[n - 1] : null, ema20 = n >= 20 ? media(v, 'EMA', 20)[n - 1] : null
  let max52 = null
  if (n >= VELAS_52S) {
    max52 = -Infinity
    for (let i = n - VELAS_52S; i < n; i++) { const h = finito(v[i].high) && v[i].high > 0 ? v[i].high : v[i].close; if (h > max52) max52 = h }
  }
  let volMedio50 = null
  if (n > VELAS_VOLUMEN) {
    let s = 0, ok = true
    for (let i = n - 1 - VELAS_VOLUMEN; i < n - 1; i++) { const x = v[i].volume; if (!finito(x) || x < 0) { ok = false; break } s += x }
    if (ok) volMedio50 = s / VELAS_VOLUMEN
  }
  return {
    fecha: u.date, cierre: u.close, ema200: r(ema), ema50: r(ema50), ema20: r(ema20), max52: r(max52),
    volUlt: finito(u.volume) && u.volume >= 0 ? u.volume : null, volMedio50: r(volMedio50),
    cierre3m: n > VELAS_3M ? v[n - 1 - VELAS_3M].close : null, velas: n,
  }
}

// Las cifras de los filtros a partir de lo guardado (t = tecnicoDe): en % o en veces; null si falta el dato.
//   emaDist: (cierre ÷ EMA 200 − 1) × 100 · ema50Dist / ema20Dist: lo mismo con la EMA 50 y la 20 · dist52: (máximo − cierre) ÷ máximo × 100 · rvol: volumen ÷ media de 50
//   var3m: (cierre ÷ cierre de hace 63 velas − 1) × 100
export function cifrasTecnicas(t) {
  if (!t) return { emaDist: null, ema50Dist: null, ema20Dist: null, dist52: null, rvol: null, var3m: null }
  return {
    emaDist: t.ema200 > 0 ? (t.cierre / t.ema200 - 1) * 100 : null,
    ema50Dist: t.ema50 > 0 ? (t.cierre / t.ema50 - 1) * 100 : null,
    ema20Dist: t.ema20 > 0 ? (t.cierre / t.ema20 - 1) * 100 : null,
    dist52: t.max52 > 0 ? Math.max(0, (t.max52 - t.cierre) / t.max52 * 100) : null,
    rvol: t.volMedio50 > 0 && t.volUlt != null ? t.volUlt / t.volMedio50 : null,
    var3m: t.cierre3m > 0 ? (t.cierre / t.cierre3m - 1) * 100 : null,
  }
}

// Fuerza del sector de una empresa: variación en 3 meses de su ETF − la del SPY, en puntos. ref = { simbolo: tecnico } de
// REFERENCIAS_TECNICO. Solo si las dos llegan a la MISMA fecha (si no, se compararían periodos distintos).
export function fuerzaSector(sector, ref) {
  const etf = ETF_SECTOR[sector]
  const a = etf && ref?.[etf], b = ref?.[MERCADO]
  if (!a || !b || a.fecha !== b.fecha) return null
  const va = cifrasTecnicas(a).var3m, vb = cifrasTecnicas(b).var3m
  return va != null && vb != null ? va - vb : null
}
