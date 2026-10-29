// lib/editor/historia.js — MÁS HISTORIA SOLO CUANDO HAGA FALTA (V9.1045; docs/builder.md, §12). Puro.
// Cada sitio que ejecuta una estrategia carga unas velas antes del periodo (el backtest y los laboratorios de cartera: las de
// lib/periodo.js, velasCalentamiento, al menos 250 en diario; el laboratorio de operaciones: 3 años; la verificación de sesgos:
// 260 en sus mercados ficticios). Una estrategia del editor cuya condición más larga necesita MÁS velas previas que esas recibe
// las que necesita más un margen, solo ella. Las que caben no cambian en nada (si cambiara para todas, cambiarían sus medias
// exponenciales y sus resultados).
import { CONDICIONES_EDITOR, resuelve, valoresDe, activa } from './definicion'
import { esDefinicionEditor, esFuenteEditor } from './fuente'

function condiciones(x, out = []) {
  if (Array.isArray(x)) x.forEach(y => condiciones(y, out))
  else if (x && typeof x === 'object') { if (CONDICIONES_EDITOR[x.c] && x.p) out.push(x); for (const [k, y] of Object.entries(x)) if (k !== 'p') condiciones(y, out) }
  return out
}
// Las velas previas que necesita la regla para poder decidir desde la primera vela del periodo: el calentamiento de cada
// condición del catálogo (entrada, cancelación, filtro de mercado, salidas y trailing) y las ventanas de los stops activos.
export function velasNecesarias(def, params = {}) {
  if (!esDefinicionEditor(def)) return 0
  const v = valoresDe(def, params)
  let n = 0
  for (const c of condiciones({ entrada: def.entrada, filtroMercado: def.filtroMercado, stops: def.stops, salidas: def.salidas })) {
    let x = null; try { x = CONDICIONES_EDITOR[c.c].calentamiento(resuelve(c.p, v)) } catch (_) {}
    if (Number.isFinite(x) && x > n) n = x
  }
  for (const s of resuelve((def.stops || []).filter(s => activa(s.activa, v)), v)) {
    for (const x of [...(s.de || []).filter(e => e.media).map(e => e.media.periodo), s.tipo === 'atr' ? s.periodo + 1 : 0, s.nivel?.atr ? s.nivel.atr.periodo + 1 : 0, s.tipo === 'minimoVelas' ? s.n : 0,
      s.tipo === 'atrCompra' ? s.periodo + 1 : 0, s.tipo === 'minimoMovil' ? s.n : 0, s.tipo === 'swingMinimo' ? s.izquierda + s.derecha + 1 : 0, s.tipo === 'supertrend' ? 4 * s.periodo : 0, s.tipo === 'emaMinimo' ? s.periodo : 0])   // V9.1055, V9.1059, V9.1064, V9.1076
      if (Number.isFinite(x) && x > n) n = x
  }
  // V9.1055: la orden en el nivel de ruptura mira las N velas anteriores.
  const o = resuelve(def.entrada?.orden || {}, v)
  if (o.tipo === 'ruptura' && Number.isFinite(o.nivel?.velas) && o.nivel.velas > n) n = o.nivel.velas
  // V9.1059: la orden en el último máximo de swing necesita al menos un swing (L + R + 1 velas).
  // V9.1067: la orden en la línea del SuperTrend, como sus condiciones (4 × N).
  if (o.tipo === 'supertrend' && Number.isFinite(o.nivel?.periodo) && 4 * o.nivel.periodo > n) n = 4 * o.nivel.periodo
  if (o.tipo === 'swing' && Number.isFinite(o.nivel?.izquierda + o.nivel?.derecha) && o.nivel.izquierda + o.nivel.derecha + 1 > n) n = o.nivel.izquierda + o.nivel.derecha + 1
  // V9.1076: la orden en la línea de tendencia bajista busca máximos en las N últimas velas (como su condición).
  if (o.tipo === 'lineaBajista' && Number.isFinite(o.nivel?.velas) && o.nivel.velas > n) n = o.nivel.velas
  return n
}
// El margen sobre lo necesario (las medias exponenciales y el ATR siguen convergiendo un poco después de su periodo).
export const margenHistoria = (n) => n + Math.max(20, Math.ceil(n * 0.1))
// Las velas previas que hay que cargar: `base` (lo de siempre) o, si la regla necesita más, lo que necesita con el margen.
export function conHistoria(base, def, params = {}) {
  const n = velasNecesarias(def, params)
  return n > base ? margenHistoria(n) : base
}
// Lo mismo con una fuente del motor (el code_js o { definicion }): las de código no cambian nunca.
export const conHistoriaFuente = (base, fuente, params = {}) => esFuenteEditor(fuente) ? conHistoria(base, fuente.definicion, params) : base
// Los años antes del periodo que lee el laboratorio de operaciones (3 de siempre; más si la regla lo necesita).
export function aniosHistoria(def, params = {}, semanal = false, base = 3) {
  const porAnio = semanal ? 52 : 252, n = velasNecesarias(def, params)
  return n > base * porAnio * 0.9 ? Math.ceil(margenHistoria(n) / porAnio) + 1 : base
}
