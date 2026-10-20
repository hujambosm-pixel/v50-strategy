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
import { media, atr } from '../condiciones/indicadores'
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

export function interpreta(def, bars, params = {}, ctx = {}) {
  const v = valoresDe(def, params), n = bars.length
  const en = def.entrada, o = resuelve(en.orden, v)
  const sSenal = serieCond(en.senal, bars, v, ctx), sCancel = en.cancelar ? serieCond(en.cancelar, bars, v, ctx) : null
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
  const trades = [], eventos = [], ordenes = []
  let orden = null, pos = null
  const nuevaOrden = (t) => {
    const nivel = o.tipo === 'stop' || o.tipo === 'limite' ? nivelOrden(t) : null
    const fijos = {}; for (const s of stops) { const x = fijaConVela(s, t); if (x !== undefined) fijos[s.id] = x }
    eventos.push({ date: bars[t].date, tipo: 'senal', panel: 'precio', precio: nivel ?? bars[t].close, texto: 'Señal: orden' })
    return { senal: t, nivel, fijos, g: nivel != null ? { id: 'o' + bars[t].date, lado: 'compra', clase: o.tipo === 'limite' ? 'limite' : 'stop', niveles: [], fin: 'abierta' } : null }
  }
  const entra = (precio, fecha, e, ord) => {
    const niveles = {}
    for (const s of stops) {
      if (s.tipo === 'nivel' || s.tipo === 'minimoVelas') niveles[s.id] = ord.fijos[s.id] ?? null
      else if (s.tipo === 'porcentaje') niveles[s.id] = precio * (1 - s.pct / 100)
      else if (s.tipo === 'atr') { const a = atr(bars, s.periodo)[ord.senal]; niveles[s.id] = a == null ? null : precio - s.k * a }
      else niveles[s.id] = null
    }
    const hist = []
    for (const s of stops) if (s.historialAlEntrar && niveles[s.id] != null) hist.push({ date: fecha, stopPx: niveles[s.id] })
    const inicial = stops.map(s => niveles[s.id]).find(x => x != null) ?? null
    pos = { entrada: precio, fecha, e, niveles, hist, riesgo: inicial != null ? precio - inicial : null }
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
      if (!orden && sSenal[t] === true && (!sMercado || sMercado[t] === true)) {
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
    if (pos) {
      let salio = false
      for (const s of stops) {
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

  const openPosition = pos ? { entryDate: pos.fecha, entryPrice: pos.entrada, stopPx: stops.map(s => pos.niveles[s.id]).find(x => x != null) ?? null } : null
  // Las medias de la definición, como series del gráfico.
  const ms = [...mediasDe(resuelve({ entrada: def.entrada, stops: def.stops, salidas: def.salidas }, v)).values()].filter(m => ['EMA', 'SMA'].includes(m.tipo) && Number.isInteger(m.periodo))
  const indicators = {}, series = []
  ms.forEach((m, k) => { const clave = `m${k + 1}`; indicators[clave] = media(bars, m.tipo, m.periodo); series.push({ clave, nombre: `${m.tipo}${m.periodo}`, panel: 'precio', tipo: 'linea', equivale: { tipo: 'medias', tipoMA: m.tipo.toLowerCase(), periodo: m.periodo } }) })
  return {
    trades, indicators, openPosition,
    grafico: { version: 1, series, eventos, ordenes: orden?.g ? [...ordenes, orden.g] : ordenes,
      motivosPosibles: { cancelacion: sCancel ? ['Cancelada'] : [], salida: [...new Set([...stops.map(s => s.motivo), ...salidas.map(s => s.motivo)])] } },
  }
}
