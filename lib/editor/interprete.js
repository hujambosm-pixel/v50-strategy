// lib/editor/interprete.js — el INTÉRPRETE de las definiciones del editor (docs/editor-visual.md, E2–E3; motor 1). Puro.
//
// interpreta(definicion, bars, params, ctx) devuelve EXACTAMENTE lo que devuelve run() de un code_js:
//   { trades, indicators, openPosition, grafico }
// con trades { entryDate, exitDate, entryPrice, exitPrice, exitReason, stopPx, stopHistory }, para que el motor, el
// multibacktest, el azar, el guardián y los lotes funcionen sin cambios. bars: las velas CERRADAS (con calentamiento) que
// el motor da a run(); params: los valores guardados; ctx.referencias: { ticker: velas } para el filtro de mercado.
//
// LA REGLA DE LA VELA CERRADA, por construcción. Para cada vela i (t = i − 1 es la última cerrada):
//   FUERA, sin orden: si la señal se cumple al cierre de t (y el filtro de mercado), se arma la orden con los datos de t.
//     · apertura: se compra a la apertura de i.      · cierre: se compra al cierre de t (la decisión es con ese cierre).
//     · stop / límite: nivel = el máximo (o el campo pedido) de las N velas hasta t; rige en i.
//   FUERA, con orden viva: si la cancelación se cumple al cierre de t, se cancela y no se hace nada más en la vela. Si no,
//     el nivel se ajusta con t (soloBaja / soloSube) y, si la vela i lo alcanza, se llena (abre más allá: a la apertura).
//   DENTRO: los stops, en su orden (un trailing primero sube con t y luego se comprueba en i; uno fijo se comprueba y, si
//     otro lo supera, se retira); después las salidas (por condición, a la apertura de i; objetivo en R; tope de velas, a la
//     apertura de la vela N + 1). Una salida termina la vela: no se vuelve a entrar en la misma vela.
// «Sin dato» no dispara nada (decisión 1): una condición vale si es true, nunca si es null.
import { CONDICIONES_EDITOR, valoresDe, resuelve, activa } from './definicion'
import { Y, O, NO, cruza, histeresis } from '../condiciones/nucleo'
import { media, atr, maximoPrevio, minimoPrevio, swings, swingPrevio, ordenSwing } from '../condiciones/indicadores'
import { enReferencia } from '../condiciones/catalogo'

// La serie de tres valores de una condición (el catálogo ya guarda en caché cada indicador por serie).
export function serieCond(c, bars, v, ctx = {}) {
  if (!c) return bars.map(() => null)
  if (c.c === 'Y') return Y(...c.de.map(x => serieCond(x, bars, v, ctx)))
  if (c.c === 'O') return O(...c.de.map(x => serieCond(x, bars, v, ctx)))
  if (c.c === 'NO') return NO(serieCond(c.de, bars, v, ctx))
  if (c.c === 'cruza') return cruza(serieCond(c.de, bars, v, ctx))
  if (c.c === 'histeresis') return histeresis(serieCond(c.entra, bars, v, ctx), serieCond(c.sale, bars, v, ctx))
  return CONDICIONES_EDITOR[c.c].serie(bars, resuelve(c.p || {}, v), ctx)
}
// Las medias que aparecen en la definición (para las series del gráfico).
function mediasDe(x, out = new Map()) {
  if (Array.isArray(x)) x.forEach(y => mediasDe(y, out))
  else if (x && typeof x === 'object') {
    if (x.c === 'precioVsMedia' && x.p) out.set(`${x.p.tipo}|${x.p.periodo}`, { tipo: x.p.tipo, periodo: x.p.periodo })
    if (x.c === 'mediaVsMedia' && x.p) { out.set(`${x.p.tipoRapida}|${x.p.periodoRapida}`, { tipo: x.p.tipoRapida, periodo: x.p.periodoRapida }); out.set(`${x.p.tipoLenta}|${x.p.periodoLenta}`, { tipo: x.p.tipoLenta, periodo: x.p.periodoLenta }) }
    if (x.media) out.set(`${x.media.tipo}|${x.media.periodo}`, { tipo: x.media.tipo, periodo: x.media.periodo })
    for (const [k, y] of Object.entries(x)) if (k !== 'p' && k !== 'media') mediasDe(y, out)
  }
  return out
}

// V9.1059: los swings que usa una definición, sin repetir: [{ lado: 'max' | 'min', L, R }] (las condiciones del valor —no las del
// filtro de mercado, que son de otro ticker—, la orden en el último máximo de swing y el stop bajo el último mínimo de swing).
const LADO_SWING = { minimosCrecientes: 'min', maximosCrecientes: 'max', cierreSobreSwing: 'max', cierreBajoSwing: 'min' }
export function swingsDe(def, v) {
  const out = new Map(), pon = (lado, L, R) => { if (Number.isInteger(L) && Number.isInteger(R)) out.set(`${lado}|${L}|${R}`, { lado, L, R }) }
  const hojas = (x) => { if (Array.isArray(x)) x.forEach(hojas); else if (x && typeof x === 'object') { if (LADO_SWING[x.c] && x.p) { const p = resuelve(x.p, v); pon(LADO_SWING[x.c], p.izquierda, p.derecha) } for (const [k, y] of Object.entries(x)) if (k !== 'p') hojas(y) } }
  hojas({ senal: def.entrada?.senal, cancelar: def.entrada?.cancelar, salidas: def.salidas, stops: def.stops })
  const o = resuelve(def.entrada?.orden || {}, v)
  if (o.tipo === 'swing') pon('max', o.nivel?.izquierda, o.nivel?.derecha)
  for (const s of resuelve((def.stops || []).filter(s => activa(s.activa, v)), v)) if (s.tipo === 'swingMinimo') pon('min', s.izquierda, s.derecha)
  return [...out.values()]
}

export function interpreta(def, bars, params = {}, ctx = {}) {
  const v = valoresDe(def, params), n = bars.length
  const en = def.entrada, o = resuelve(en.orden, v)
  // V9.1055: con la orden en el nivel de ruptura la señal es opcional (sin ella, la orden está siempre puesta).
  // V9.1059: lo mismo con la orden en el último máximo de swing.
  const sSenal = (o.tipo === 'ruptura' || o.tipo === 'swing') && !en.senal ? bars.map(() => true) : serieCond(en.senal, bars, v, ctx), sCancel = en.cancelar ? serieCond(en.cancelar, bars, v, ctx) : null
  const masAlto = def.stopsModo === 'masAlto'
  // Filtro de mercado (decisión 8): la condición en el ticker de referencia, en sus sesiones, llevada a las fechas del valor.
  const fm = def.filtroMercado
  const sMercado = fm ? enReferencia({ id: `fm|${JSON.stringify(fm.si)}`, serie: (vs) => serieCond(fm.si, vs, v) }, bars, ctx.referencias?.[fm.ticker] || [], {}) : null
  const revisaEntrada = en.revisaSalidasEnLaVelaDeEntrada !== false
  const stops = (def.stops || []).filter(s => activa(s.activa, v)).map(s => ({ ...resuelve(s, v), _si: s.tipo === 'trailing' ? serieCond(s.si, bars, v, ctx) : null }))
  const salidas = (def.salidas || []).filter(s => activa(s.activa, v)).map(s => ({ ...resuelve(s, v), _si: s.tipo === 'condicion' ? serieCond(s.si, bars, v, ctx) : null }))
  const valor = (campo, t) => bars[t]?.[campo]
  const extremo = (campo, desde, hasta, max) => { let m = null; for (let j = Math.max(0, desde); j <= hasta; j++) { const x = valor(campo, j); if (x == null) return null; if (m === null || (max ? x > m : x < m)) m = x } return m }
  // El nivel de la orden con los datos de la vela t.
  // high: el máximo de las N velas hasta t; low: el mínimo; close: el cierre de t.
  const nivelOrden = (t) => o.nivel.campo === 'high' ? extremo('high', t - o.nivel.velas + 1, t, true)
    : o.nivel.campo === 'low' ? extremo('low', t - o.nivel.velas + 1, t, false) : valor('close', t)
  // Los stops que se fijan con la vela de la señal (o con la que mueve la orden).
  const fijaConVela = (s, t) => {
    if (s.tipo === 'nivel') { const xs = s.de.map(x => x.campo ? valor(x.campo, t) : media(bars, x.media.tipo, x.media.periodo)[t]); return xs.some(x => x == null) ? null : Math.min(...xs) }
    if (s.tipo === 'minimoVelas') return extremo('low', t - s.n + 1, t, false)
    return undefined
  }
  // V9.1055: el stop activo con «manda el más alto»: el mayor nivel (el primero, si empatan), o null.
  const maxNiveles = (niveles) => { let m = null; for (const s of stops) { const x = niveles[s.id]; if (x != null && (m === null || x > m.nivel)) m = { nivel: x, s } } return m }
  // V9.1055: el nivel de ruptura de la vela i (el máximo de las N anteriores, sin ella).
  const nivelRuptura = o.tipo === 'ruptura' ? maximoPrevio(bars, o.nivel.velas) : null
  // V9.1059: el nivel de la orden en el último máximo de swing en la vela i (null si no hay o si ese swing ya se superó).
  const nivelSwing = o.tipo === 'swing' ? ordenSwing(bars, o.nivel.izquierda, o.nivel.derecha) : null
  // V9.1059: los stops que suben: el mínimo de las n velas anteriores, o el último mínimo de swing confirmado hasta la anterior.
  const serieSube = (s) => s.tipo === 'minimoMovil' ? minimoPrevio(bars, s.n) : s.tipo === 'swingMinimo' ? swingPrevio(bars, 'min', s.izquierda, s.derecha) : null
  const trades = [], eventos = [], ordenes = []
  let orden = null, pos = null
  const nuevaOrden = (t) => {
    const nivel = o.tipo === 'stop' || o.tipo === 'limite' ? nivelOrden(t) : null
    const fijos = {}; for (const s of stops) { const x = fijaConVela(s, t); if (x !== undefined) fijos[s.id] = x }
    eventos.push({ date: bars[t].date, tipo: 'senal', panel: 'precio', precio: nivel ?? bars[t].close, texto: 'Señal: orden' })
    return { senal: t, nivel, fijos, g: nivel != null ? { id: 'o' + bars[t].date, lado: 'compra', clase: o.tipo === 'limite' ? 'limite' : 'stop', niveles: [], fin: 'abierta' } : null }
  }
  const nuevaOrdenRuptura = (t, lvl, texto = 'Ruptura: compra') => {
    const fijos = {}; for (const s of stops) { const x = fijaConVela(s, t); if (x !== undefined) fijos[s.id] = x }
    eventos.push({ date: bars[t + 1].date, tipo: 'senal', panel: 'precio', precio: lvl, texto })
    return { senal: t, nivel: lvl, fijos, g: null }
  }
  const entra = (precio, fecha, e, ord) => {
    const niveles = {}
    for (const s of stops) {
      if (s.tipo === 'nivel' || s.tipo === 'minimoVelas') niveles[s.id] = ord.fijos[s.id] ?? null
      else if (s.tipo === 'porcentaje') niveles[s.id] = precio * (1 - s.pct / 100)
      else if (s.tipo === 'atr') { const a = atr(bars, s.periodo)[ord.senal]; niveles[s.id] = a == null ? null : precio - s.k * a }
      // V9.1055: con el ATR de la vela anterior a la de la compra (sin mirar el futuro), una sola vez.
      else if (s.tipo === 'atrCompra') { const a = e >= 1 ? atr(bars, s.periodo)[e - 1] : null; niveles[s.id] = a == null ? null : precio - s.k * a }
      // V9.1055: el mínimo de las n velas anteriores a la de la compra; dentro, sube con cada vela.
      else if (s.tipo === 'minimoMovil') niveles[s.id] = e >= 1 ? minimoPrevio(bars, s.n)[e] : null
      // V9.1059: el último mínimo de swing confirmado hasta el cierre de la vela anterior a la compra; dentro, sube con cada vela.
      else if (s.tipo === 'swingMinimo') niveles[s.id] = swingPrevio(bars, 'min', s.izquierda, s.derecha)[e] ?? null
      else niveles[s.id] = null
    }
    const hist = []
    // V9.1055: con «manda el más alto», el historial y el riesgo inicial (el del objetivo en R) son los del stop activo.
    if (masAlto) {
      const m = maxNiveles(niveles); if (m) hist.push({ date: fecha, stopPx: m.nivel })
      pos = { entrada: precio, fecha, e, niveles, hist, riesgo: m ? precio - m.nivel : null, activo: m ? m.nivel : null }
      return
    }
    for (const s of stops) if (s.historialAlEntrar && niveles[s.id] != null) hist.push({ date: fecha, stopPx: niveles[s.id] })
    const inicial = stops.map(s => niveles[s.id]).find(x => x != null) ?? null
    pos = { entrada: precio, fecha, e, niveles, hist, riesgo: inicial != null ? precio - inicial : null }
  }
  // V9.1055: el stop que sube con el mínimo de las n velas anteriores (las cerradas hasta t): solo sube; cada subida, al historial.
  // V9.1059: y el que sube con el último mínimo de swing confirmado.
  const subeStop = (s, t, b) => {
    const serie = serieSube(s)
    if (!serie) return
    const cand = serie[t + 1], actual = pos.niveles[s.id]
    if (cand != null && (actual == null || cand > actual)) { pos.niveles[s.id] = cand; if (!masAlto) pos.hist.push({ date: b.date, stopPx: cand }) }
  }
  const sale = (b, precio, motivo, stopPx) => {
    trades.push({ entryDate: pos.fecha, exitDate: b.date, entryPrice: pos.entrada, exitPrice: precio, exitReason: motivo, stopPx, stopHistory: [...pos.hist] })
    pos = null
  }

  for (let i = 1; i < n; i++) {
    const b = bars[i], t = i - 1
    // ── FUERA ──
    if (!pos) {
      if (orden && sCancel && sCancel[t] === true) {
        if (orden.g) { orden.g.fin = 'cancelada'; orden.g.finDate = bars[t].date; orden.g.motivo = 'Cancelada'; ordenes.push(orden.g) }
        orden = null
        continue
      }
      // V9.1055: la orden en el nivel de ruptura. Se rehace en cada vela con las N anteriores; compra si el máximo de la vela lo
      // SUPERA (a ese nivel, o a la apertura si abre ya por encima). No hay orden viva entre velas.
      if (o.tipo === 'ruptura') {
        const lvl = nivelRuptura[i]
        if (sSenal[t] === true && (!sMercado || sMercado[t] === true) && lvl != null && b.high > lvl) {
          const ord = nuevaOrdenRuptura(t, lvl)
          entra(b.open > lvl ? b.open : lvl, b.date, i, ord)
          if (!revisaEntrada) continue
        }
      }
      // V9.1059: la orden en el último máximo de swing: igual, con el nivel del último swing confirmado y aún sin superar.
      else if (o.tipo === 'swing') {
        const lvl = nivelSwing[i]
        if (sSenal[t] === true && (!sMercado || sMercado[t] === true) && lvl != null && b.high > lvl) {
          const ord = nuevaOrdenRuptura(t, lvl, 'Swing: compra')
          entra(b.open > lvl ? b.open : lvl, b.date, i, ord)
          if (!revisaEntrada) continue
        }
      }
      else if (!orden && sSenal[t] === true && (!sMercado || sMercado[t] === true)) {
        orden = nuevaOrden(t)
        if (o.tipo === 'cierre') { entra(bars[t].close, bars[t].date, t, orden); orden = null }
        else if (o.tipo === 'apertura') { entra(b.open, b.date, i, orden); orden = null; if (!revisaEntrada) continue }
      }
      if (orden && orden.nivel != null) {
        // Ajuste con la vela t (la última cerrada): soloBaja / soloSube; y los stops que se fijan con la vela que la mueve.
        const cand = nivelOrden(t)
        if (cand != null && ((o.ajuste === 'soloBaja' && cand < orden.nivel) || (o.ajuste === 'soloSube' && cand > orden.nivel))) {
          orden.nivel = cand
          for (const s of stops) { const x = fijaConVela(s, t); if (x !== undefined) orden.fijos[s.id] = x }
        }
        if (orden.g) orden.g.niveles.push({ date: b.date, precio: orden.nivel, decididaEn: bars[t].date })
        const lim = o.tipo === 'limite'
        const llena = lim ? (b.open <= orden.nivel || b.low <= orden.nivel) : (b.open >= orden.nivel || b.high >= orden.nivel)
        if (llena) {
          const precio = lim ? (b.open <= orden.nivel ? b.open : orden.nivel) : (b.open >= orden.nivel ? b.open : orden.nivel)
          if (orden.g) { orden.g.fin = 'ejecutada'; orden.g.finDate = b.date; orden.g.entryDate = b.date; ordenes.push(orden.g) }
          const ord = orden; orden = null
          entra(precio, b.date, i, ord)
          if (!revisaEntrada) continue
        }
      }
    }
    // ── DENTRO ──
    if (pos && masAlto) {
      // V9.1055: «manda el más alto». Primero suben los stops que se mueven (con las velas cerradas); después, el stop activo es
      // el mayor de todos: salta dentro de la vela a su precio, o a la apertura si abre ya por debajo.
      for (const s of stops) subeStop(s, t, b)
      const m = maxNiveles(pos.niveles)
      if (m && m.nivel !== pos.activo) { pos.hist.push({ date: b.date, stopPx: m.nivel }); pos.activo = m.nivel }
      let salio = false
      if (m) {
        if (b.open <= m.nivel) { sale(b, b.open, m.s.motivo, m.nivel); salio = true }
        else if (b.low <= m.nivel) { sale(b, m.nivel, m.s.motivo, m.nivel); salio = true }
      }
      if (salio) continue
      for (const s of salidas) {
        if (s.tipo === 'condicion' && s._si[t] === true) { sale(b, b.open, s.motivo, null); salio = true; break }
        if (s.tipo === 'objetivo' && pos.riesgo != null && pos.riesgo > 0) {
          const obj = pos.entrada + s.multiploR * pos.riesgo
          if (b.open >= obj) { sale(b, b.open, s.motivo, null); salio = true; break }
          if (b.high >= obj) { sale(b, obj, s.motivo, null); salio = true; break }
        }
        if (s.tipo === 'tope' && i - pos.e >= s.velas) { sale(b, b.open, s.motivo, null); salio = true; break }
      }
      if (salio) continue
    }
    else if (pos) {
      let salio = false
      for (const s of stops) {
        if (s.tipo === 'minimoMovil' || s.tipo === 'swingMinimo') subeStop(s, t, b)
        if (s.tipo === 'trailing') {
          if (s._si[t] === true) {
            const cand = s.nivel.atr ? (() => { const a = atr(bars, s.nivel.atr.periodo)[t]; return a == null || bars[t].close == null ? null : bars[t].close - s.nivel.atr.k * a })()
              : extremo(s.nivel.campo || 'low', t - (s.nivel.velas || 1) + 1, t, false)
            const valido = cand != null && (!s.soloSobreEntrada || cand > pos.entrada)
            const fecha = s.fechaHistorial === 'anterior' ? bars[t].date : b.date
            const actual = pos.niveles[s.id]
            if (valido && (s.historial ?? 'siSube') === 'cadaVez') { pos.niveles[s.id] = actual === null ? cand : Math.max(actual, cand); pos.hist.push({ date: fecha, stopPx: pos.niveles[s.id] }) }
            else if (valido && (actual === null || cand > actual)) { pos.niveles[s.id] = cand; pos.hist.push({ date: fecha, stopPx: cand }) }
          }
        }
        const lvl = pos.niveles[s.id]
        if (lvl != null) {
          if (b.open <= lvl) { sale(b, b.open, s.motivo, lvl); salio = true; break }
          if (b.low <= lvl) { sale(b, lvl, s.motivo, lvl); salio = true; break }
          if (s.retiraSiSupera) { const otro = pos.niveles[s.retiraSiSupera]; if (otro !== null && otro !== undefined && otro > lvl) pos.niveles[s.id] = null }
        }
      }
      if (salio) continue
      for (const s of salidas) {
        if (s.tipo === 'condicion' && s._si[t] === true) { sale(b, b.open, s.motivo, null); salio = true; break }
        if (s.tipo === 'objetivo' && pos.riesgo != null && pos.riesgo > 0) {
          const obj = pos.entrada + s.multiploR * pos.riesgo
          if (b.open >= obj) { sale(b, b.open, s.motivo, null); salio = true; break }
          if (b.high >= obj) { sale(b, obj, s.motivo, null); salio = true; break }
        }
        if (s.tipo === 'tope' && i - pos.e >= s.velas) { sale(b, b.open, s.motivo, null); salio = true; break }
      }
      if (salio) continue
    }
  }

  const openPosition = pos ? { entryDate: pos.fecha, entryPrice: pos.entrada, stopPx: masAlto ? (maxNiveles(pos.niveles)?.nivel ?? null) : stops.map(s => pos.niveles[s.id]).find(x => x != null) ?? null } : null
  // Las medias de la definición, como series del gráfico.
  const ms = [...mediasDe(resuelve({ entrada: def.entrada, stops: def.stops, salidas: def.salidas }, v)).values()].filter(m => ['EMA', 'SMA'].includes(m.tipo) && Number.isInteger(m.periodo))
  const indicators = {}, series = []
  ms.forEach((m, k) => { const clave = `m${k + 1}`; indicators[clave] = media(bars, m.tipo, m.periodo); series.push({ clave, nombre: `${m.tipo}${m.periodo}`, panel: 'precio', tipo: 'linea', equivale: { tipo: 'medias', tipoMA: m.tipo.toLowerCase(), periodo: m.periodo } }) })
  // V9.1055: el canal de compra de la ruptura (verde) y el mínimo de los stops que suben con él (naranja), sobre el precio.
  if (o.tipo === 'ruptura') { indicators.ruptura = nivelRuptura; series.push({ clave: 'ruptura', nombre: `Máximo de ${o.nivel.velas} velas`, panel: 'precio', tipo: 'linea', color: '#3fb950' }) }
  for (const s of stops) if (s.tipo === 'minimoMovil' && !indicators[`minimo${s.n}`]) { indicators[`minimo${s.n}`] = minimoPrevio(bars, s.n); series.push({ clave: `minimo${s.n}`, nombre: `Mínimo de ${s.n} velas`, panel: 'precio', tipo: 'linea', color: '#f0883e' }) }
  // V9.1059: los swings que usa la regla: un punto en la vela de cada swing (los máximos arriba, los mínimos abajo) y la línea del
  // último swing confirmado, que empieza en la vela siguiente a la confirmación (swingPrevio), nunca en la del swing.
  for (const { lado, L, R } of swingsDe(def, v)) {
    const clave = `swing${lado === 'max' ? 'Max' : 'Min'}${L}_${R}`
    indicators[clave] = swingPrevio(bars, lado, L, R)
    series.push({ clave, nombre: `Último ${lado === 'max' ? 'máximo' : 'mínimo'} de swing (${L}/${R})`, panel: 'precio', tipo: 'linea', color: lado === 'max' ? '#3fb950' : '#f0883e', escalera: true })
    for (const s of swings(bars, lado, L, R).lista) eventos.push({ date: bars[s.v].date, tipo: lado === 'max' ? 'swingMax' : 'swingMin', panel: 'precio', precio: s.precio, texto: `${lado === 'max' ? 'Máximo' : 'Mínimo'} de swing (${L}/${R}), confirmado al cierre del ${bars[s.conf].date}` })
  }
  return {
    trades, indicators, openPosition,
    grafico: { version: 1, series, eventos, ordenes: orden?.g ? [...ordenes, orden.g] : ordenes,
      motivosPosibles: { cancelacion: sCancel ? ['Cancelada'] : [], salida: [...new Set([...stops.map(s => s.motivo), ...salidas.map(s => s.motivo)])] } },
  }
}
