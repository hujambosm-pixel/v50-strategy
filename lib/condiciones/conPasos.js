// lib/condiciones/conPasos.js — «Condición con pasos» (docs/builder.md §243; boceto bocetos/condiciones-con-pasos.html, aceptado por
// Sergi el 24/11). PURO. Una condición que RECUERDA lo que pasó antes: un tramo («Mientras…»), un orden (paso 1 → paso 2), puntos de
// referencia que se recuerdan (el máximo del tramo, el precio de la última señal…) y cuántas veces. Un solo motor: hoy lo usa la señal
// del Replay; más adelante, las alertas, el screener y las estrategias.
//
// def = { version: 1,
//   mientras: null | { filas },               un TRAMO: fuera de él no hay nada; al empezar uno nuevo, todo vuelve a empezar
//   paso1: { filas, daSenal? },               lo primero que tiene que pasar (con paso 2, daSenal dice si también salta aquí)
//   paso2: null | { filas },                  lo que se espera después del paso 1 (da la señal)
//   anula: null | { filas },                  si pasa antes del paso 2, se olvida el paso 1 (solo con paso 2)
//   veces: 'cada' | 'primera',                cada vez que se cumple, o solo la primera hasta que «vuelva a empezar»
//   empieza: 'paso1' | 'tramo' | 'maxHist' | 'nunca' }   cuándo vuelve a empezar (paso1: solo con paso 2; tramo: solo con «Mientras»)
// Una fila es la del catálogo de siempre { quien, si, velas: 'diarias' | 'semanales', union?: 'Y' | 'O' } (como las de las alertas y
// las reglas del bloque «Con pesos»), o una fila de MOVIMIENTO { mov: 'cae' | 'sube' | 'mueve', pct, desde, quien, union? }:
//   «cae un pct % desde…» (cierre ≤ ref × (1 − pct %)), «sube…» (cierre ≥ ref × (1 + pct %)), «se mueve… (arriba o abajo)» (cualquiera).
//   desde (el punto de referencia, con el CIERRE del símbolo de la fila):
//     maxHist   el cierre más alto de toda su historia hasta ese día
//     maxTramo / minTramo   el más alto / más bajo desde que empezó el tramo (solo con «Mientras»)
//     maxSenal / minSenal   el más alto / más bajo desde la última señal (o desde el principio, o desde que empezó el tramo)
//     senal     el cierre de la vela de la última señal (sin señal todavía: la fila no se cumple)
//     paso1     el cierre de la vela del paso 1 (solo en el paso 2 y en «se anula si»)
//     compra    tu última compra (opciones.compras = [{ fecha, precio }], la del Replay); sin compra, la fila no se cumple
// «Y además» une antes que «o bien» (A y B o C = (A y B) o C). Un paso PASA a cumplirse en la vela en que cualquiera de sus grupos pasa
// a cumplirse (la anterior no se cumplía), mirando cada grupo por separado (como la señal con «o bien», §240). «Mientras» es un estado:
// se mira si se cumple, no si pasa a cumplirse.
// Cada vela, en este orden: 1) el tramo (empieza: todo a cero; acaba: nada hasta el siguiente); 2) los puntos de referencia con el cierre
// de hoy; 3) «vuelve a empezar con un máximo histórico nuevo» (el del símbolo principal); 4) con paso 2: «se anula si» (gana si cae el
// mismo día que el paso 2), el paso 2, y luego el paso 1 (arma o vuelve a armar); sin paso 2: el paso 1. Tras una señal (o armar el paso
// 1) los puntos que dependen de ella cambian y lo de hoy se vuelve a mirar con ellos: así «se mueve un 10 % desde la última señal» no
// salta en la misma vela de la señal.
import { serieFilas, validaFilas, MAX_FILAS_REGLA } from '../planes/pesos'
import { alineaReferencia } from './nucleo'

export const MOVIMIENTOS = Object.freeze(['cae', 'sube', 'mueve'])
export const REFERENCIAS = Object.freeze(['maxHist', 'maxTramo', 'minTramo', 'maxSenal', 'minSenal', 'senal', 'paso1', 'compra'])
export const VECES = Object.freeze(['cada', 'primera'])
export const EMPIEZA = Object.freeze(['paso1', 'tramo', 'maxHist', 'nunca'])
const RE_SIMBOLO = /^[A-Z0-9.^=-]{1,30}$/
const esQuien = (q) => q === 'valor' || (typeof q === 'string' && RE_SIMBOLO.test(q))

// ── Validar: lista de errores en castellano ([] = bien) ──
function validaPaso(p, nombre, { conPaso1Ref = false, conTramo = false } = {}) {
  const fs = p?.filas
  if (!Array.isArray(fs) || !fs.length || fs.length > MAX_FILAS_REGLA) return [`${nombre}: de 1 a ${MAX_FILAS_REGLA} condiciones.`]
  const e = []
  fs.forEach((f, k) => {
    const d = `${nombre}, condición ${k + 1}`
    if (k > 0 && !['Y', 'O'].includes(f?.union)) e.push(`${d}: tiene que decir «y además» u «o bien».`)
    if (f && f.mov !== undefined) {
      if (!MOVIMIENTOS.includes(f.mov)) e.push(`${d}: tiene que ser «cae», «sube» o «se mueve».`)
      if (!(Number.isFinite(f.pct) && f.pct > 0 && f.pct < 100)) e.push(`${d}: el %, mayor que 0 y menor que 100.`)
      if (!esQuien(f.quien)) e.push(`${d}: de quién tiene que ser un símbolo.`)
      if (!REFERENCIAS.includes(f.desde)) e.push(`${d}: falta desde dónde se mide.`)
      else if ((f.desde === 'maxTramo' || f.desde === 'minTramo') && !conTramo) e.push(`${d}: «el máximo / mínimo del tramo» necesita un «Mientras…».`)
      else if (f.desde === 'paso1' && !conPaso1Ref) e.push(`${d}: «el precio del paso 1» solo vale en el paso 2 o en «se anula si».`)
    } else {
      const { union, ...sola } = f || {}
      e.push(...validaFilas([{ ...sola, quien: sola.quien === 'valor' ? 'A' : sola.quien }], d).map(x => x.replace(`${d}, condición 1`, d)))
    }
  })
  return e
}
export function validaConPasos(def) {
  if (!def || typeof def !== 'object') return ['Falta la condición.']
  const e = [], conTramo = !!def.mientras, conPaso2 = !!def.paso2
  if (def.mientras) e.push(...validaPaso(def.mientras, 'Mientras', { conTramo }).filter(x => !/condición \d+: (el %|falta desde|tiene que ser «cae)/.test(x)))
  if (def.mientras?.filas?.some(f => f && f.mov !== undefined)) e.push('Mientras: solo condiciones del catálogo (los «cae / sube un %» van en los pasos).')
  if (!def.paso1) e.push('Falta el paso 1.')
  else e.push(...validaPaso(def.paso1, 'Paso 1', { conTramo }))
  if (def.paso1 && def.paso1.daSenal !== undefined && typeof def.paso1.daSenal !== 'boolean') e.push('Paso 1: «también da señal», sí o no.')
  if (conPaso2) e.push(...validaPaso(def.paso2, 'Paso 2', { conPaso1Ref: true, conTramo }))
  if (def.anula) {
    if (!conPaso2) e.push('«Se anula si…» solo tiene sentido con un paso 2.')
    else e.push(...validaPaso(def.anula, 'Se anula si', { conPaso1Ref: true, conTramo }))
  }
  if (!VECES.includes(def.veces)) e.push('Cuántas veces: «cada vez» o «solo la primera».')
  if (!EMPIEZA.includes(def.empieza)) e.push('Falta cuándo vuelve a empezar.')
  else if (def.empieza === 'paso1' && !conPaso2) e.push('«Vuelve a empezar con el siguiente paso 1» necesita un paso 2.')
  else if (def.empieza === 'tramo' && !conTramo) e.push('«Vuelve a empezar con un tramo nuevo» necesita un «Mientras…».')
  return e
}

// Los símbolos cuyas velas hacen falta.
export const simbolosConPasos = (def) => [...new Set(['mientras', 'paso1', 'paso2', 'anula'].flatMap(k => (def?.[k]?.filas || []).map(f => f?.quien)).filter(Boolean))]

// «Y además» une antes que «o bien»: los índices de las filas, por grupos.
export function grupos(filas) {
  const gs = [[]]
  ;(filas || []).forEach((f, k) => { if (k > 0 && f?.union === 'O') gs.push([k]); else gs[gs.length - 1].push(k) })
  return gs
}

// ── El motor ──
// velasDe(quien) → velas DIARIAS (o las del intervalo del gráfico) del símbolo; fechas: las del valor principal.
// opciones: { simbolo (el principal: el de «máximo histórico nuevo»), compras: [{ fecha, precio }] }.
// Devuelve { senales: [fecha], detalle: [{ fecha, paso, movimientos: [{ quien, mov, pct, desde, precioRef, fechaRef, precio, cambio }] }],
//            eventos: [{ fecha, tipo: 'tramo' | 'finTramo' | 'armado' | 'anulado' | 'reinicio' | 'senal', paso? }], tramos: [{ desde, hasta }] }.
export function senalesConPasos(def, velasDe, fechas, opciones = {}) {
  const vacio = { senales: [], detalle: [], eventos: [], tramos: [] }
  if (!def || !Array.isArray(fechas) || !fechas.length || validaConPasos(def).length) return vacio
  const n = fechas.length, sim = opciones.simbolo || null
  const compras = (opciones.compras || []).filter(c => c && c.fecha && Number.isFinite(c.precio)).sort((a, b) => (a.fecha < b.fecha ? -1 : 1))
  const resuelve = (q) => (q === 'valor' && sim ? sim : q)
  const velas = (q) => velasDe(resuelve(q)) || []

  // Cierres y máximo histórico (con TODA la historia del símbolo) alineados a las fechas, con la fecha de ese máximo.
  const cache = new Map()
  const datos = (q) => {
    const s = resuelve(q)
    if (cache.has(s)) return cache.get(s)
    const v = velas(s), fs = v.map(x => x.date)
    let m = null, mf = null
    const mx = [], mxf = []
    for (const x of v) { if (x.close != null && (m == null || x.close > m)) { m = x.close; mf = x.date } mx.push(m); mxf.push(mf) }
    const d = { cierre: alineaReferencia(fechas, fs, v.map(x => x.close)), maxHist: alineaReferencia(fechas, fs, mx), maxHistF: alineaReferencia(fechas, fs, mxf) }
    cache.set(s, d)
    return d
  }
  const pasos = { mientras: def.mientras, paso1: def.paso1, paso2: def.paso2 || null, anula: def.paso2 ? def.anula || null : null }
  // Cada fila: o su serie del catálogo (sin estado), o la de movimiento (se mira en el bucle con los puntos de referencia).
  const prep = {}
  for (const [k, p] of Object.entries(pasos)) {
    if (!p) continue
    prep[k] = { gs: grupos(p.filas), filas: p.filas.map(f => f.mov !== undefined ? { f, q: resuelve(f.quien) } : { f, s: serieFilas([{ quien: resuelve(f.quien), si: f.si, velas: f.velas }], (q) => velas(q), fechas) }) }
  }
  const simbolos = [...new Set(Object.values(prep).flatMap(p => p.filas.filter(x => x.q).map(x => x.q)).concat(sim ? [sim] : []))]
  // Puntos de referencia por símbolo: { valor, fecha }.
  const R = {}
  for (const s of simbolos) R[s] = { maxTramo: null, minTramo: null, maxSenal: null, minSenal: null, senal: null, paso1: null }
  const pon = (s, k, v, f) => { R[s][k] = v == null ? null : { valor: v, fecha: f } }
  const ref = (s, desde, i) => {
    if (desde === 'maxHist') { const d = datos(s); return d.maxHist[i] == null ? null : { valor: d.maxHist[i], fecha: d.maxHistF[i] } }
    if (desde === 'compra') { let c = null; for (const x of compras) { if (x.fecha <= fechas[i]) c = x; else break } return c ? { valor: c.precio, fecha: c.fecha } : null }
    return R[s]?.[desde] || null
  }
  const valorFila = (x, i) => {
    if (x.s) return x.s[i] === true
    const c = datos(x.q).cierre[i], r = ref(x.q, x.f.desde, i)
    if (c == null || !r || !(r.valor > 0)) return false
    const p = x.f.pct / 100, tol = r.valor * 1e-9   // un cierre justo en el umbral cuenta (90 × 1,10 da 99,00000000000001)
    const cae = c <= r.valor * (1 - p) + tol, sube = c >= r.valor * (1 + p) - tol
    return x.f.mov === 'cae' ? cae : x.f.mov === 'sube' ? sube : (cae || sube)
  }
  const estado = (k, i) => prep[k].gs.map(g => g.every(j => valorFila(prep[k].filas[j], i)))
  const previo = {}
  const pasa = (k, i) => { if (!prep[k]) return false; const ahora = estado(k, i), antes = previo[k] || []; previo[k] = ahora; return ahora.some((v, g) => v && !antes[g]) }
  const remira = (ks, i) => { for (const k of ks) if (prep[k]) previo[k] = estado(k, i) }
  const movimientos = (k, i) => prep[k].filas.filter(x => x.q && valorFila(x, i)).map(x => {
    const r = ref(x.q, x.f.desde, i), c = datos(x.q).cierre[i]
    return { quien: x.q, mov: x.f.mov, pct: x.f.pct, desde: x.f.desde, precioRef: r.valor, fechaRef: r.fecha, precio: c, cambio: c / r.valor - 1 }
  })

  const out = { senales: [], detalle: [], eventos: [], tramos: [] }
  const evento = (i, tipo, paso) => out.eventos.push(paso ? { fecha: fechas[i], tipo, paso } : { fecha: fechas[i], tipo })
  let enTramo = !pasos.mientras, fase = 0   // 0 espera el paso 1 · 1 armado (espera el paso 2) · 2 hecho (hasta que vuelva a empezar)
  const ceroTramo = (i) => { for (const s of simbolos) { const c = datos(s).cierre[i]; for (const k of ['maxTramo', 'minTramo', 'maxSenal', 'minSenal']) pon(s, k, c, fechas[i]); pon(s, 'senal', null); pon(s, 'paso1', null) } }
  if (enTramo) ceroTramo(0)
  const senal = (i, paso) => {
    out.senales.push(fechas[i]); out.detalle.push({ fecha: fechas[i], paso, movimientos: movimientos(paso === 1 ? 'paso1' : 'paso2', i) }); evento(i, 'senal', paso)
    for (const s of simbolos) { const c = datos(s).cierre[i]; pon(s, 'senal', c, fechas[i]); pon(s, 'maxSenal', c, fechas[i]); pon(s, 'minSenal', c, fechas[i]) }
    remira(['paso1', 'paso2', 'anula'], i)
  }
  for (let i = 0; i < n; i++) {
    // 1) El tramo.
    if (pasos.mientras) {
      const on = estado('mientras', i).some(Boolean)
      if (on && !enTramo) { enTramo = true; fase = 0; ceroTramo(i); for (const k of ['paso1', 'paso2', 'anula']) previo[k] = []; out.tramos.push({ desde: fechas[i], hasta: null }); evento(i, 'tramo') }
      else if (!on && enTramo) { enTramo = false; fase = 0; out.tramos[out.tramos.length - 1].hasta = fechas[i - 1]; evento(i, 'finTramo') }
      if (!on) continue
    }
    // 2) Los puntos de referencia con el cierre de hoy.
    for (const s of simbolos) {
      const c = datos(s).cierre[i]
      if (c == null) continue
      for (const [k, mayor] of [['maxTramo', true], ['minTramo', false], ['maxSenal', true], ['minSenal', false]]) {
        const r = R[s][k]
        if (!r || (mayor ? c > r.valor : c < r.valor)) pon(s, k, c, fechas[i])
      }
    }
    // 3) Vuelve a empezar con un máximo histórico nuevo (el del símbolo principal; sin él, el del primer símbolo).
    const sp = sim || simbolos[0]
    if (def.empieza === 'maxHist' && sp && i > 0 && fase !== 0) {
      const d = datos(sp)
      if (d.maxHist[i] != null && d.maxHist[i - 1] != null && d.maxHist[i] > d.maxHist[i - 1]) { fase = 0; evento(i, 'reinicio') }
    }
    // 4) Los pasos (se miran todos cada vela, para saber cuándo PASAN a cumplirse).
    const t1 = pasa('paso1', i), t2 = pasa('paso2', i), tA = pasa('anula', i)
    if (pasos.paso2) {
      if (fase === 1 && tA) { fase = 0; evento(i, 'anulado') }
      else if (fase === 1 && t2) { senal(i, 2); if (def.veces === 'primera') fase = 2 }
      if (t1 && (fase === 0 || def.empieza === 'paso1')) {
        fase = 1
        for (const s of simbolos) pon(s, 'paso1', datos(s).cierre[i], fechas[i])
        evento(i, 'armado')
        remira(['paso2', 'anula'], i)
        if (def.paso1.daSenal) senal(i, 1)
      }
    } else if (t1 && fase === 0) { senal(i, 1); if (def.veces === 'primera') fase = 2 }
  }
  return out
}
