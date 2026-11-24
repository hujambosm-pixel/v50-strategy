// lib/condiciones/conPasos.js — «Condición con pasos» (docs/builder.md §243 y §246; boceto bocetos/condiciones-con-pasos.html, aceptado
// por Sergi el 24/11). PURO. Una condición que RECUERDA lo que pasó antes: un tramo («Mientras…»), un orden (paso 1 → paso 2), puntos de
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
// las reglas del bloque «Con pesos»), o una fila de MOVIMIENTO
//   { mov: 'cae' | 'sube' | 'mueve', pct, desde, quien, union?, cuando?: 'toca' | 'cierra', escalones?: true, n? }:
//   «cae un pct % desde…»: el NIVEL es ref × (1 − pct %); «sube…»: ref × (1 + pct %); «se mueve… (arriba o abajo)»: cualquiera de los dos.
//   cuando (§246, decidido por Sergi el 24/11; sin él, 'toca'):
//     'toca'   se cumple en la vela en que el precio LLEGA al nivel dentro de la vela (mínimo ≤ nivel al caer; máximo ≥ nivel al subir), y
//              el precio es el NIVEL EXACTO (o la apertura, si la vela ya abre pasado el nivel: hueco). Los puntos de referencia son los de
//              hasta la vela anterior (lo que se sabía al abrir).
//     'cierra' se cumple si el CIERRE pasa el nivel; el precio es el cierre. Los puntos de referencia incluyen la vela de hoy.
//   CADA NIVEL SALTA UNA SOLA VEZ (§246): con el mismo punto de referencia (mismo precio y fecha), un nivel que ya hizo saltar un paso no
//   vuelve a contar aunque el precio rebote y vuelva a caer; un punto de referencia nuevo (un máximo nuevo…) da un nivel nuevo.
//   escalones: «… y luego cada pct % más» desde el MISMO punto de referencia: con máximo 120 y 10 %, niveles 108, 96, 84…; cada escalón
//   salta una vez; si una vela pasa varios, salta una vez con el más hondo. (No es lo mismo que «desde la última señal»: 108 → 97,20.)
//   desde (el punto de referencia del símbolo de la fila; los MÁXIMOS con el máximo de cada vela y los MÍNIMOS con el mínimo):
//     maxHist   el más alto de toda su historia
//     maxN / minN   el más alto / más bajo de las últimas n velas (n de 2 a 5000; un año ≈ 252 en diario, 52 en semanal)
//     maxTramo / minTramo   el más alto / más bajo desde que empezó el tramo (solo con «Mientras»)
//     maxSenal / minSenal   el más alto / más bajo desde la última señal (o desde el principio, o desde que empezó el tramo)
//     senal     el precio de la última señal (el nivel exacto si saltó con un «toca»; si no, el cierre); sin señal, no se cumple
//     paso1     el precio del paso 1 (igual; solo en el paso 2 y en «se anula si»)
//     compra    tu última compra (opciones.compras = [{ fecha, precio }], la del Replay); sin compra, la fila no se cumple
// «Y además» une antes que «o bien» (A y B o C = (A y B) o C). Un paso PASA a cumplirse en la vela en que cualquiera de sus grupos pasa
// a cumplirse (la anterior no se cumplía), mirando cada grupo por separado (como la señal con «o bien», §240). «Mientras» es un estado:
// se mira si se cumple, no si pasa a cumplirse.
// Cada vela, en este orden: 1) el tramo (empieza: todo a cero; acaba: nada hasta el siguiente); 2) los puntos de referencia con la vela
// de hoy (guardando los de ayer para los «toca»); 3) «vuelve a empezar con un máximo histórico nuevo» (el del símbolo principal); 4) con
// paso 2: «se anula si» (gana si cae el mismo día que el paso 2), el paso 2, y luego el paso 1 (arma o vuelve a armar); sin paso 2: el
// paso 1. Tras una señal (o armar el paso 1) los niveles usados se dan por gastados, los puntos que dependen de ella cambian y lo de hoy
// se vuelve a mirar con ellos: así «se mueve un 10 % desde la última señal» no salta en la misma vela de la señal.
import { serieFilas, validaFilas, MAX_FILAS_REGLA } from '../planes/pesos'
import { alineaReferencia } from './nucleo'

export const MOVIMIENTOS = Object.freeze(['cae', 'sube', 'mueve'])
export const REFERENCIAS = Object.freeze(['maxHist', 'maxN', 'minN', 'maxTramo', 'minTramo', 'maxSenal', 'minSenal', 'senal', 'paso1', 'compra'])
export const CUANDO = Object.freeze(['toca', 'cierra'])
export const VECES = Object.freeze(['cada', 'primera'])
export const EMPIEZA = Object.freeze(['paso1', 'tramo', 'maxHist', 'nunca'])
export const N_MIN = 2, N_MAX = 5000
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
      if (f.cuando !== undefined && !CUANDO.includes(f.cuando)) e.push(`${d}: «toca» o «cierra».`)
      if (f.escalones !== undefined && typeof f.escalones !== 'boolean') e.push(`${d}: «en escalones», sí o no.`)
      if (!REFERENCIAS.includes(f.desde)) e.push(`${d}: falta desde dónde se mide.`)
      else if ((f.desde === 'maxTramo' || f.desde === 'minTramo') && !conTramo) e.push(`${d}: «el máximo / mínimo del tramo» necesita un «Mientras…».`)
      else if (f.desde === 'paso1' && !conPaso1Ref) e.push(`${d}: «el precio del paso 1» solo vale en el paso 2 o en «se anula si».`)
      else if ((f.desde === 'maxN' || f.desde === 'minN') && !(Number.isInteger(f.n) && f.n >= N_MIN && f.n <= N_MAX)) e.push(`${d}: las velas, de ${N_MIN} a ${N_MAX}.`)
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

// Máximo (o mínimo) de una ventana de velas con su fecha: [i0, i1] dentro de v.
function extremo(v, i0, i1, mayor) {
  let m = null, f = null
  for (let j = Math.max(0, i0); j <= i1; j++) {
    const x = mayor ? v[j].high : v[j].low
    if (x != null && (m == null || (mayor ? x > m : x < m))) { m = x; f = v[j].date }
  }
  return m == null ? null : { valor: m, fecha: f }
}

// ── El motor ──
// velasDe(quien) → velas DIARIAS (o las del intervalo del gráfico) del símbolo; fechas: las del valor principal.
// opciones: { simbolo (el principal: el de «máximo histórico nuevo»), compras: [{ fecha, precio }] }.
// Devuelve { senales: [fecha], detalle: [{ fecha, paso, movimientos: [{ quien, mov, pct, desde, cuando, escalon, nivel, precioRef, fechaRef,
//            precio, cambio }] }], eventos: [{ fecha, tipo: 'tramo' | 'finTramo' | 'armado' | 'anulado' | 'reinicio' | 'senal', paso? }],
//            tramos: [{ desde, hasta }] }. En movimientos, precio = el de la fila (nivel exacto, apertura si hubo hueco, o cierre).
export function senalesConPasos(def, velasDe, fechas, opciones = {}) {
  const vacio = { senales: [], detalle: [], eventos: [], tramos: [] }
  if (!def || !Array.isArray(fechas) || !fechas.length || validaConPasos(def).length) return vacio
  const n = fechas.length, sim = opciones.simbolo || null
  const compras = (opciones.compras || []).filter(c => c && c.fecha && Number.isFinite(c.precio)).sort((a, b) => (a.fecha < b.fecha ? -1 : 1))
  const resuelve = (q) => (q === 'valor' && sim ? sim : q)
  const velas = (q) => velasDe(resuelve(q)) || []

  // Velas (abre, máx., mín., cierre) y máximo histórico (con TODA la historia del símbolo: hasta hoy y hasta ayer) alineados a las fechas.
  const cache = new Map()
  const datos = (q) => {
    const s = resuelve(q)
    if (cache.has(s)) return cache.get(s)
    const v = velas(s), fs = v.map(x => x.date), al = (arr) => alineaReferencia(fechas, fs, arr)
    let m = null, mf = null
    const hoy = [], ayer = []
    for (const x of v) { ayer.push(m == null ? null : { valor: m, fecha: mf }); if (x.high != null && (m == null || x.high > m)) { m = x.high; mf = x.date } hoy.push(m == null ? null : { valor: m, fecha: mf }) }
    // Alineado: en una fecha sin vela del símbolo, abre/máx./mín. no valen (null) y el cierre es el último conocido.
    const propia = alineaReferencia(fechas, fs, fs).map((f, i) => f === fechas[i])
    const d = {
      v, fs, propia, cierre: al(v.map(x => x.close)),
      abre: al(v.map(x => x.open)).map((x, i) => propia[i] ? x : null), alto: al(v.map(x => x.high)).map((x, i) => propia[i] ? x : null),
      bajo: al(v.map(x => x.low)).map((x, i) => propia[i] ? x : null),
      maxHist: al(hoy), maxHistAyer: al(ayer), idx: al(v.map((_, j) => j)), nCache: new Map(),
    }
    cache.set(s, d)
    return d
  }
  // Máximo / mínimo de las últimas N velas del símbolo, hasta hoy (incluida) o hasta ayer.
  const ultimasN = (d, i, nv, mayor, conHoy) => {
    const j = d.idx[i]
    if (j == null) return null
    const fin = conHoy && d.propia[i] ? j : (d.propia[i] ? j - 1 : j)
    if (fin < 0) return null
    const k = `${nv}|${mayor ? 1 : 0}|${fin}`
    if (!d.nCache.has(k)) d.nCache.set(k, extremo(d.v, fin - nv + 1, fin, mayor))
    return d.nCache.get(k)
  }
  const pasos = { mientras: def.mientras, paso1: def.paso1, paso2: def.paso2 || null, anula: def.paso2 ? def.anula || null : null }
  // Cada fila: o su serie del catálogo (sin estado), o la de movimiento (se mira en el bucle con los puntos de referencia).
  const prep = {}
  for (const [k, p] of Object.entries(pasos)) {
    if (!p) continue
    prep[k] = {
      gs: grupos(p.filas),
      filas: p.filas.map(f => f.mov !== undefined ? { f, q: resuelve(f.quien), toca: f.cuando !== 'cierra', gastado: {} } : { f, s: serieFilas([{ quien: resuelve(f.quien), si: f.si, velas: f.velas }], (q) => velas(q), fechas) }),
    }
  }
  const simbolos = [...new Set(Object.values(prep).flatMap(p => p.filas.filter(x => x.q).map(x => x.q)).concat(sim ? [sim] : []))]
  // Puntos de referencia por símbolo: { valor, fecha }; R = con la vela de hoy, A = los de ayer (para los «toca»).
  const vacioR = () => ({ maxTramo: null, minTramo: null, maxSenal: null, minSenal: null, senal: null, paso1: null })
  const R = {}, A = {}
  for (const s of simbolos) { R[s] = vacioR(); A[s] = vacioR() }
  const pon = (s, k, v, f) => { R[s][k] = v == null ? null : { valor: v, fecha: f } }
  const ref = (x, i) => {
    const s = x.q, desde = x.f.desde
    if (desde === 'maxHist') { const d = datos(s); return (x.toca ? d.maxHistAyer : d.maxHist)[i] || null }
    if (desde === 'maxN' || desde === 'minN') return ultimasN(datos(s), i, x.f.n, desde === 'maxN', !x.toca)
    if (desde === 'compra') {
      let c = null
      for (const y of compras) { if (x.toca ? y.fecha < fechas[i] : y.fecha <= fechas[i]) c = y; else break }
      return c ? { valor: c.precio, fecha: c.fecha } : null
    }
    if (desde === 'senal' || desde === 'paso1') return R[s]?.[desde] || null   // cambian durante la vela (señal o paso 1 de hoy)
    return (x.toca ? A : R)[s]?.[desde] || null
  }
  // Una fila de movimiento en la vela i: null o { dir, k, nivel, precio, r } (k = escalón; el más hondo que se pasa ese día).
  const tol = (v) => v * 1e-9   // un precio justo en el nivel cuenta (90 × 1,10 da 99,00000000000001)
  const evalMov = (x, i) => {
    const d = datos(x.q), r = ref(x, i)
    if (!r || !(r.valor > 0) || d.cierre[i] == null) return null
    const p = x.f.pct / 100, mejor = []
    for (const dir of x.f.mov === 'mueve' ? ['cae', 'sube'] : [x.f.mov]) {
      const g = x.gastado[dir], ya = g && g.valor === r.valor && g.fecha === r.fecha ? g.k : 0
      if (!x.f.escalones && ya >= 1) continue
      const t = x.toca ? (dir === 'cae' ? d.bajo[i] : d.alto[i]) : d.cierre[i]
      if (t == null) continue
      const nivel = (k) => r.valor * (dir === 'cae' ? 1 - k * p : 1 + k * p)
      const pasa = (k) => dir === 'cae' ? t <= nivel(k) + tol(r.valor) : t >= nivel(k) - tol(r.valor)
      let k = 0
      if (x.f.escalones) { const tope = dir === 'cae' ? Math.floor((1 - 1e-9) / p) : 1e6; for (let j = ya + 1; j <= tope && pasa(j); j++) k = j }
      else if (pasa(1)) k = 1
      if (!k) continue
      const L = nivel(k), o = d.abre[i]
      const precio = !x.toca ? d.cierre[i] : o != null && (dir === 'cae' ? o <= L + tol(r.valor) : o >= L - tol(r.valor)) ? o : L
      mejor.push({ dir, k, nivel: L, precio, r, distancia: o != null ? Math.abs(o - L) : 0 })
    }
    if (!mejor.length) return null
    return mejor.sort((a, b) => a.distancia - b.distancia)[0]
  }
  const valorFila = (x, i) => x.s ? x.s[i] === true : !!evalMov(x, i)
  const estado = (k, i) => prep[k].gs.map(g => g.every(j => valorFila(prep[k].filas[j], i)))
  const previo = {}
  const pasa = (k, i) => { if (!prep[k]) return false; const ahora = estado(k, i), antes = previo[k] || []; previo[k] = ahora; return ahora.some((v, g) => v && !antes[g]) }
  const remira = (ks, i) => { for (const k of ks) if (prep[k]) previo[k] = estado(k, i) }
  // Lo que movió el paso k en la vela i (y gasta sus niveles).
  const usa = (k, i) => {
    const out = []
    for (const x of prep[k].filas) {
      if (!x.q) continue
      const e = evalMov(x, i)
      if (!e) continue
      x.gastado[e.dir] = { valor: e.r.valor, fecha: e.r.fecha, k: e.k }
      out.push({ quien: x.q, mov: e.dir, pct: x.f.pct, desde: x.f.desde, cuando: x.toca ? 'toca' : 'cierra', escalon: e.k, nivel: e.nivel,
        precioRef: e.r.valor, fechaRef: e.r.fecha, precio: e.precio, cambio: e.precio / e.r.valor - 1 })
    }
    return out
  }
  // El precio de cada símbolo en un paso: el de su fila de movimiento (si saltó) o el cierre.
  const precioDe = (s, i, movs) => { const m = movs.find(y => y.quien === s); return m ? m.precio : datos(s).cierre[i] }

  const out = { senales: [], detalle: [], eventos: [], tramos: [] }
  const evento = (i, tipo, paso) => out.eventos.push(paso ? { fecha: fechas[i], tipo, paso } : { fecha: fechas[i], tipo })
  let enTramo = !pasos.mientras, fase = 0   // 0 espera el paso 1 · 1 armado (espera el paso 2) · 2 hecho (hasta que vuelva a empezar)
  // Al empezar (o empezar un tramo): los máximos / mínimos parten de la vela de hoy; para los «toca» de hoy, aún no hay (A vacío).
  const ceroTramo = (i) => {
    for (const s of simbolos) {
      const d = datos(s), hi = d.alto[i] ?? d.cierre[i], lo = d.bajo[i] ?? d.cierre[i]
      pon(s, 'maxTramo', hi, fechas[i]); pon(s, 'maxSenal', hi, fechas[i]); pon(s, 'minTramo', lo, fechas[i]); pon(s, 'minSenal', lo, fechas[i])
      pon(s, 'senal', null); pon(s, 'paso1', null); A[s] = vacioR()
    }
  }
  const senal = (i, paso) => {
    const movs = usa(paso === 1 ? 'paso1' : 'paso2', i)
    out.senales.push(fechas[i]); out.detalle.push({ fecha: fechas[i], paso, movimientos: movs }); evento(i, 'senal', paso)
    for (const s of simbolos) { const c = precioDe(s, i, movs); pon(s, 'senal', c, fechas[i]); pon(s, 'maxSenal', c, fechas[i]); pon(s, 'minSenal', c, fechas[i]) }
    remira(['paso1', 'paso2', 'anula'], i)
  }
  for (let i = 0; i < n; i++) {
    // 1) El tramo.
    let nuevo = false
    if (pasos.mientras) {
      const on = estado('mientras', i).some(Boolean)
      if (on && !enTramo) { enTramo = true; nuevo = true; fase = 0; ceroTramo(i); for (const k of ['paso1', 'paso2', 'anula']) previo[k] = []; out.tramos.push({ desde: fechas[i], hasta: null }); evento(i, 'tramo') }
      else if (!on && enTramo) { enTramo = false; fase = 0; out.tramos[out.tramos.length - 1].hasta = fechas[i - 1]; evento(i, 'finTramo') }
      if (!on) continue
    } else if (i === 0) { ceroTramo(0); nuevo = true }
    // 2) Los puntos de referencia con la vela de hoy (los de ayer quedan en A).
    if (!nuevo) for (const s of simbolos) {
      for (const k of ['maxTramo', 'minTramo', 'maxSenal', 'minSenal']) A[s][k] = R[s][k]
      const d = datos(s), hi = d.alto[i] ?? d.cierre[i], lo = d.bajo[i] ?? d.cierre[i]
      if (hi == null) continue
      for (const [k, mayor] of [['maxTramo', true], ['minTramo', false], ['maxSenal', true], ['minSenal', false]]) {
        const r = R[s][k], x = mayor ? hi : lo
        if (!r || (mayor ? x > r.valor : x < r.valor)) pon(s, k, x, fechas[i])
      }
    }
    // 3) Vuelve a empezar con un máximo histórico nuevo (el del símbolo principal; sin él, el del primer símbolo).
    const sp = sim || simbolos[0]
    if (def.empieza === 'maxHist' && sp && i > 0 && fase !== 0) {
      const d = datos(sp), h = d.maxHist[i], a = d.maxHist[i - 1]
      if (h && a && h.valor > a.valor) { fase = 0; evento(i, 'reinicio') }
    }
    // 4) Los pasos (se miran todos cada vela, para saber cuándo PASAN a cumplirse).
    const t1 = pasa('paso1', i), t2 = pasa('paso2', i), tA = pasa('anula', i)
    if (pasos.paso2) {
      if (fase === 1 && tA) { usa('anula', i); fase = 0; evento(i, 'anulado'); remira(['anula'], i) }
      else if (fase === 1 && t2) { senal(i, 2); if (def.veces === 'primera') fase = 2 }
      if (t1 && (fase === 0 || def.empieza === 'paso1')) {
        fase = 1
        const movs = usa('paso1', i)
        for (const s of simbolos) pon(s, 'paso1', precioDe(s, i, movs), fechas[i])
        evento(i, 'armado')
        if (def.paso1.daSenal) { out.senales.push(fechas[i]); out.detalle.push({ fecha: fechas[i], paso: 1, movimientos: movs }); evento(i, 'senal', 1)
          for (const s of simbolos) { const c = precioDe(s, i, movs); pon(s, 'senal', c, fechas[i]); pon(s, 'maxSenal', c, fechas[i]); pon(s, 'minSenal', c, fechas[i]) } }
        remira(['paso1', 'paso2', 'anula'], i)
      }
    } else if (t1 && fase === 0) { senal(i, 1); if (def.veces === 'primera') fase = 2 }
  }
  return out
}
