// lib/replay/conPasosGrafico.js — el minigráfico de la «Condición con pasos» en la ventana de la señal del Replay (docs/builder.md §245;
// boceto bocetos/condiciones-con-pasos.html; decidido por Sergi el 24/11: dos modos, «Velas inventadas» y «Velas reales», y en los dos
// el escenario completo marcado). PURO: las velas inventadas, la búsqueda de unas donde el escenario SÍ ocurra, y lo que hay que
// dibujar (tramos, ● paso 1 armado, ▲ señal, ✕ anulado y la línea del precio de referencia con su %), en una ventana de velas.
import { validaConPasos, senalesConPasos, simbolosConPasos } from '../condiciones/conPasos'
import { senalesCondicion } from './senales'

// Generador con semilla (mulberry32): las mismas velas para la misma semilla.
function rng(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 } }

// Velas inventadas: tramos de ~70 velas con su tendencia (sube, baja o de lado) y ruido diario (como el boceto). Fechas en días de diario.
export const N_INVENTADAS = 760
export function velasInventadas(semilla, n = N_INVENTADAS) {
  const r = rng(semilla), out = []
  let c = 100, deriva = 0, d = Date.UTC(2019, 0, 2)
  for (let i = 0; i < n; i++) {
    if (i % 70 === 0) deriva = (r() - 0.42) * 0.004
    const o = c, mov = deriva + (r() - 0.5) * 0.034
    c = Math.max(5, o * (1 + mov))
    const h = Math.max(o, c) * (1 + r() * 0.012), l = Math.min(o, c) * (1 - r() * 0.012)
    while ([0, 6].includes(new Date(d).getUTCDay())) d += 864e5
    out.push({ date: new Date(d).toISOString().slice(0, 10), open: o, high: h, low: l, close: c, volume: 1000 })
    d += 864e5
  }
  return out
}

// §247: la señal del minigráfico: { tipo: 'pasos', def } o { tipo: 'condicion', filas } (la de siempre, del catálogo; solo ▲). Por
// compatibilidad, una def de pasos sin «tipo» también vale.
export const comoSenal = (s) => (s && s.tipo ? s : { tipo: 'pasos', def: s })
export function senalValida(s) {
  const x = comoSenal(s)
  if (x.tipo === 'condicion') return Array.isArray(x.filas) && x.filas.length > 0
  return !!x.def && validaConPasos(x.def).length === 0
}
// Calcula el escenario sobre unas velas. velasDe(q) → velas del símbolo q (en inventadas, las mismas para todos).
export function escenario(senal, velasDe, simbolo, compras = []) {
  const x = comoSenal(senal), v = velasDe(simbolo) || []
  const fechas = v.map(y => y.date)
  if (x.tipo === 'condicion') {
    const vd = (q) => (q === 'valor' ? velasDe(simbolo) : velasDe(q)) || []
    const ss = senalesCondicion(x.filas, vd, fechas)
    return { simbolo, velas: v, fechas, r: { senales: ss, detalle: ss.map(f => ({ fecha: f, paso: null, movimientos: [] })), eventos: [], tramos: [] } }
  }
  return { simbolo, velas: v, fechas, r: senalesConPasos(x.def, velasDe, fechas, { simbolo, compras }) }
}

// 🎲 Unas velas inventadas donde el escenario dé al menos una señal: prueba semillas desde `desde` (hasta `intentos`).
// Devuelve { semilla, velas, r } o null si en ninguna salta (p. ej. «desde tu última compra»: en velas inventadas no compras).
export function buscaInventadas(senal, simbolo, desde = 1, intentos = 40) {
  if (!senalValida(senal)) return null
  for (let k = 0; k < intentos; k++) {
    const s = desde + k, v = velasInventadas(s)
    const e = escenario(senal, () => v, simbolo)
    if (e.r.senales.length) return { semilla: s, ...e }
  }
  return null
}

// Los símbolos que hay que cargar aparte en «Velas reales» (todos menos el principal).
export const otrosSimbolos = (senal, simbolo) => {
  const x = comoSenal(senal)
  const qs = x.tipo === 'condicion' ? (x.filas || []).map(f => f?.quien) : simbolosConPasos(x.def)
  return [...new Set(qs)].filter(q => q && q !== simbolo && q !== 'valor')
}

// La ventana que se ve: `ancho` velas que acaban un poco después de la señal k (o las últimas si no hay señales).
export const ANCHO = 250
export function ventanaDe(n, idxSenal, ancho = ANCHO) {
  if (n <= ancho) return [0, n - 1]
  const fin = idxSenal == null ? n - 1 : Math.min(n - 1, idxSenal + Math.round(ancho * 0.25))
  return [Math.max(0, fin - ancho + 1), fin]
}

const pct = (x) => `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x * 100).toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`
const fmtF = (f) => `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}`

// Lo que hay que dibujar dentro de [a, b] (índices de las velas). Índices relativos a las velas, no a la ventana.
//   tramos: [[i0, i1]] · marcas: [{ i, tipo: 'armado' | 'senal' | 'anulado', texto }] · lineas: [{ i0, p0, i1, p1, texto }] (la referencia
//   y el cierre de la señal; si la referencia cae antes de la ventana, i0 = a y fuera: true).
export function dibujoEscenario(e, a, b) {
  const idx = new Map(e.fechas.map((f, i) => [f, i])), dentro = (i) => i != null && i >= a && i <= b
  const tramos = (e.r.tramos || []).map(t => [idx.get(t.desde), t.hasta ? idx.get(t.hasta) : e.fechas.length - 1])
    .filter(([x, y]) => x != null && y != null && y >= a && x <= b).map(([x, y]) => [Math.max(a, x), Math.min(b, y)])
  const marcas = [], lineas = []
  for (const ev of e.r.eventos || []) {
    const i = idx.get(ev.fecha)
    if (!dentro(i) || !['armado', 'anulado'].includes(ev.tipo)) continue
    marcas.push({ i, tipo: ev.tipo, texto: `${ev.tipo === 'armado' ? 'Paso 1 armado' : 'Anulado: se olvida el paso 1'} · ${fmtF(ev.fecha)} · cierre ${num(e.velas[i].close)}` })
  }
  for (const d of e.r.detalle || []) {
    const i = idx.get(d.fecha)
    if (!dentro(i)) continue
    const por = (d.movimientos || []).map(m => `${m.quien}: de ${num(m.precioRef)} (${fmtF(m.fechaRef)}) a ${num(m.precio)}, ${pct(m.cambio)}`).join(' · ')
    const m = (d.movimientos || []).find(x => x.quien === e.simbolo) || (d.movimientos || [])[0]
    const propio = m && (!e.simbolo || m.quien === e.simbolo)
    marcas.push({ i, tipo: 'senal', texto: `Señal${d.paso ? ` (paso ${d.paso})` : ''} · ${fmtF(d.fecha)} · ${propio ? `a ${num(m.precio)}` : `cierre ${num(e.velas[i].close)}`}${por ? `\n${por}` : ''}` })
    if (propio) {
      // §246: del punto de referencia (el máximo de su vela, p. ej.) al precio exacto de la señal (el nivel, o la apertura si hubo hueco).
      const i0 = idx.get(m.fechaRef)
      lineas.push({ i0: i0 == null || i0 < a ? a : i0, fuera: i0 == null || i0 < a, p0: m.precioRef, i1: i, p1: m.precio, texto: pct(m.cambio), precio: num(m.precio) })
    }
  }
  return { tramos, marcas, lineas }
}
const num = (x) => Number.isFinite(x) ? x.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'

export const AYUDA_MINI = '«VELAS INVENTADAS»: unas velas de mentira donde tu escenario ocurre al menos una vez (🎲 busca otras). Todos los símbolos de la condición usan esas mismas velas, y «tu última compra» no existe (no hay compras).\n' +
  '«VELAS REALES»: las del valor del Replay, con TODA su historia (también lo que viene después de «hoy» en el Replay: no lo mires si no quieres saberlo). «🎲 Valor al azar» la mira en otro valor de tu Watchlist.\n\n' +
  'Se marca el escenario completo: sombreado azul = dentro del tramo («Mientras…»); ● = paso 1 armado; ▲ = señal; ✕ = anulado. En los «cae / sube un %», un punto en el precio de referencia, una línea discontinua hasta la vela de la señal y una raya en el precio EXACTO de la señal, con el precio y el %. La señal elegida (◀ ▶) se ve marcada; las demás, tenues. ' +
  'Pasa el ratón por una marca para ver el porqué.\n\nEjemplo: máximo histórico 120 (el máximo de la vela del 03/02); el 17/03 el precio baja hasta 106 → señal a 108,00: la línea va de 120 a 108 y dice «108,00 · −10,0 %».'
