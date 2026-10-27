// lib/editor/exporta.js — EXPORTAR una estrategia del editor a code_js (docs/editor-visual.md, decisión 7). Puro.
//
// exportaCodeJs(definicion, valores) devuelve el TEXTO de un code_js autónomo que hace exactamente lo mismo que el
// intérprete (lib/editor/interprete.js, motor 1): la definición va como datos (const DEF) y debajo un motor pequeño, una
// copia del intérprete y de las condiciones del catálogo que usa, escrito sin imports. Solo usa los ayudantes que el motor da
// a todo code_js (calcEMA, calcRSI, calcATR: los mismos del catálogo); la SMA estricta va copiada dentro. run.parametros
// es la declaración de la definición, así que el optimizador y el calentamiento siguen funcionando.
// La copia ya NO se edita en el editor: es una estrategia de código más, para retocarla a mano.
// No se puede exportar una definición con filtro de mercado: un code_js no recibe las velas de otro ticker.
// MOTOR_EXPORTADO es la versión del motor que se copia; si el intérprete cambia (motor 2), esto se actualiza con él. La
// prueba (exportado = intérprete, byte a byte, en run() entero) lo vigila.
import { MOTOR, fraseDefinicion, huellaDefinicion, valoresDe, validaDefinicion, CONDICIONES_EDITOR } from './definicion'

export const MOTOR_EXPORTADO = 1

// El motor, como texto. Sin comillas invertidas ni interpolaciones dentro (va en un String.raw).
const RUNTIME = String.raw`
// ── Motor del editor visual (motor 1), copiado para que este código sea autónomo. Hace lo mismo que lib/editor/interprete.js:
// decide con la vela CERRADA (la señal al cierre de t, la orden actúa en t + 1); «sin dato» (null) nunca dispara nada.
function interpretaEditor(def, bars, params) {
  var cache = new Map()
  function memo(clave, calcular) { if (!cache.has(clave)) cache.set(clave, calcular()); return cache.get(clave) }
  function finito(x) { return typeof x === 'number' && Number.isFinite(x) }
  function precioOk(x) { return finito(x) && x > 0 }
  function precios(campo) { return memo('precio|' + campo, function () { return bars.map(function (v) { return precioOk(v && v[campo]) ? v[campo] : null }) }) }
  function smaEstricta(valores, periodo) {
    var n = valores ? valores.length : 0, out = new Array(n).fill(null)
    if (!n || !(periodo >= 1)) return out
    var suma = 0, malos = 0
    for (var i = 0; i < n; i++) {
      if (finito(valores[i])) suma += valores[i]; else malos++
      if (i >= periodo) { var sale = valores[i - periodo]; if (finito(sale)) suma -= sale; else malos-- }
      if (i >= periodo - 1 && malos === 0) out[i] = suma / periodo
    }
    return out
  }
  function media(tipo, periodo) {
    return memo('media|' + tipo + '|' + periodo, function () {
      var c = precios('close')
      return tipo === 'SMA' ? smaEstricta(c, periodo) : calcEMA(c, periodo).map(function (x) { return finito(x) ? x : null })
    })
  }
  function rsi(periodo) { return memo('rsi|' + periodo, function () { return calcRSI(precios('close'), periodo).map(function (x) { return finito(x) ? x : null }) }) }
  function maximoPrevio(n) {
    return memo('maxPrevio|' + n, function () {
      var h = precios('high'), out = new Array(bars.length).fill(null)
      for (var t = n; t < bars.length; t++) {
        var m = -Infinity, ok = true
        for (var j = t - n; j < t; j++) { if (h[j] == null) { ok = false; break } if (h[j] > m) m = h[j] }
        if (ok) out[t] = m
      }
      return out
    })
  }
  function atr(periodo) {
    return memo('atr|' + periodo, function () {
      if (bars.length < periodo) return bars.map(function () { return null })
      var a = calcATR(bars.map(function (v) { return { high: v && v.high, low: v && v.low, close: v && v.close } }), periodo)
      return bars.map(function (_, i) { return finito(a[i]) && a[i] > 0 ? a[i] : null })
    })
  }
  function compara(a, b, lado, comparacion) { return comparacion === '≥' ? (lado === 'debajo' ? a <= b : a >= b) : (lado === 'debajo' ? a < b : a > b) }
  function caidaPrep(c, p) {
    var n = c.length, M = new Array(n).fill(null), si = new Array(n).fill(false)
    for (var t = p.ventana - 1; t < n; t++) {
      var m = -Infinity, j = -1
      for (var i = t - p.ventana + 1; i <= t; i++) if (c[i] >= m) { m = c[i]; j = i }
      var mn = Infinity
      for (var k = j; k <= t; k++) if (c[k] < mn) mn = c[k]
      M[t] = m; si[t] = mn <= m * (1 - p.pct / 100)
    }
    return { M: M, si: si }
  }
  // Las condiciones del catálogo que admite el editor.
  var CONDICIONES = {
    precioVsMedia: function (p) { var c = precios('close'), m = media(p.tipo, p.periodo); return bars.map(function (_, t) { return c[t] != null && m[t] != null ? compara(c[t], m[t], p.lado, p.comparacion) : null }) },
    mediaVsMedia: function (p) { var r = media(p.tipoRapida, p.periodoRapida), l = media(p.tipoLenta, p.periodoLenta); return bars.map(function (_, t) { return r[t] != null && l[t] != null ? compara(r[t], l[t], p.lado, p.comparacion) : null }) },
    rsiNivel: function (p) { var r = rsi(p.periodo); return bars.map(function (_, t) { return r[t] != null ? compara(r[t], p.umbral, p.lado) : null }) },
    nuevoMaximo: function (p) { var c = precios('close'), mx = maximoPrevio(p.n); return bars.map(function (_, t) { return c[t] != null && mx[t] != null ? c[t] > mx[t] : null }) },
    volumenAlto: function (p) {
      var v = precios('volume')
      var mPrev = memo('volMediaPrevia|' + p.n, function () { var m = smaEstricta(v, p.n); return bars.map(function (_, t) { return t >= 1 ? m[t - 1] : null }) })
      return bars.map(function (_, t) { return v[t] != null && mPrev[t] != null ? v[t] > p.k * mPrev[t] : null })
    },
    caidaDesdeMaximo: function (p) {
      var c = precios('close'), si = memo('caida|' + p.ventana + '|' + p.pct, function () { return caidaPrep(c, p) }).si, malos = 0
      return bars.map(function (_, t) {
        if (c[t] == null) malos++
        if (t >= p.ventana && c[t - p.ventana] == null) malos--
        return t < p.ventana - 1 || malos > 0 ? null : si[t]
      })
    },
    /*FUERZA_RELATIVA*/
  }
  // Lógica de tres valores (true / false / null).
  function Y(series) { var n = series.length ? series[0].length : 0, out = new Array(n); for (var t = 0; t < n; t++) { var r = true; for (var s = 0; s < series.length; s++) { var v = series[s][t]; if (v === false) { r = false; break } if (v !== true) r = null } out[t] = r } return out }
  function O(series) { var n = series.length ? series[0].length : 0, out = new Array(n); for (var t = 0; t < n; t++) { var r = false; for (var s = 0; s < series.length; s++) { var v = series[s][t]; if (v === true) { r = true; break } if (v !== false) r = null } out[t] = r } return out }
  function NO(serie) { return serie.map(function (v) { return v === true ? false : v === false ? true : null }) }
  function cruza(serie) { return serie.map(function (v, t) { if (t === 0) return null; var a = serie[t - 1]; if ((v !== true && v !== false) || (a !== true && a !== false)) return null; return v === true && a === false }) }
  function histeresis(entra, sale) { var estado = null; return entra.map(function (e, t) { var s = sale[t]; if (estado === true) { if (s === true) estado = false } else if (e === true) estado = true; else if (estado === null && s === true) estado = false; return estado }) }
  // Los valores: los defectos de la declaración con los recibidos encima.
  var v = {}
  ;((def.parametros && def.parametros.lista) || []).forEach(function (p) { v[p.nombre] = Object.prototype.hasOwnProperty.call(params || {}, p.nombre) ? params[p.nombre] : p.defecto })
  function resuelve(x) {
    if (typeof x === 'string' && x.charAt(0) === '$') return v[x.slice(1)]
    if (Array.isArray(x)) return x.map(resuelve)
    if (x && typeof x === 'object') { var o = {}; Object.keys(x).forEach(function (k) { o[k] = resuelve(x[k]) }); return o }
    return x
  }
  function activa(a) {
    if (a === undefined || a === true) return true
    if (a === false) return false
    if (typeof a === 'string' && a.charAt(0) === '$') return v[a.slice(1)] === true
    if (a && typeof a === 'object' && a.param) return v[a.param] === a.igual
    return false
  }
  function serieCond(c) {
    if (!c) return bars.map(function () { return null })
    if (c.c === 'Y') return Y(c.de.map(serieCond))
    if (c.c === 'O') return O(c.de.map(serieCond))
    if (c.c === 'NO') return NO(serieCond(c.de))
    if (c.c === 'cruza') return cruza(serieCond(c.de))
    if (c.c === 'histeresis') return histeresis(serieCond(c.entra), serieCond(c.sale))
    return CONDICIONES[c.c](resuelve(c.p || {}))
  }
  function mediasDe(x, out) {
    if (Array.isArray(x)) x.forEach(function (y) { mediasDe(y, out) })
    else if (x && typeof x === 'object') {
      if (x.c === 'precioVsMedia' && x.p) out.set(x.p.tipo + '|' + x.p.periodo, { tipo: x.p.tipo, periodo: x.p.periodo })
      if (x.c === 'mediaVsMedia' && x.p) { out.set(x.p.tipoRapida + '|' + x.p.periodoRapida, { tipo: x.p.tipoRapida, periodo: x.p.periodoRapida }); out.set(x.p.tipoLenta + '|' + x.p.periodoLenta, { tipo: x.p.tipoLenta, periodo: x.p.periodoLenta }) }
      if (x.media) out.set(x.media.tipo + '|' + x.media.periodo, { tipo: x.media.tipo, periodo: x.media.periodo })
      Object.keys(x).forEach(function (k) { if (k !== 'p' && k !== 'media') mediasDe(x[k], out) })
    }
    return out
  }

  var n = bars.length, en = def.entrada, o = resuelve(en.orden)
  var sSenal = serieCond(en.senal), sCancel = en.cancelar ? serieCond(en.cancelar) : null
  var revisaEntrada = en.revisaSalidasEnLaVelaDeEntrada !== false
  var stops = (def.stops || []).filter(function (s) { return activa(s.activa) }).map(function (s) { var r = resuelve(s); r._si = s.tipo === 'trailing' ? serieCond(s.si) : null; return r })
  var salidas = (def.salidas || []).filter(function (s) { return activa(s.activa) }).map(function (s) { var r = resuelve(s); r._si = s.tipo === 'condicion' ? serieCond(s.si) : null; return r })
  function valor(campo, t) { return bars[t] ? bars[t][campo] : undefined }
  function extremo(campo, desde, hasta, max) { var m = null; for (var j = Math.max(0, desde); j <= hasta; j++) { var x = valor(campo, j); if (x == null) return null; if (m === null || (max ? x > m : x < m)) m = x } return m }
  function nivelOrden(t) { return o.nivel.campo === 'high' ? extremo('high', t - o.nivel.velas + 1, t, true) : o.nivel.campo === 'low' ? extremo('low', t - o.nivel.velas + 1, t, false) : valor('close', t) }
  function fijaConVela(s, t) {
    if (s.tipo === 'nivel') { var xs = s.de.map(function (x) { return x.campo ? valor(x.campo, t) : media(x.media.tipo, x.media.periodo)[t] }); return xs.some(function (x) { return x == null }) ? null : Math.min.apply(null, xs) }
    if (s.tipo === 'minimoVelas') return extremo('low', t - s.n + 1, t, false)
    return undefined
  }
  var trades = [], eventos = [], ordenes = [], orden = null, pos = null
  function nuevaOrden(t) {
    var nivel = o.tipo === 'stop' || o.tipo === 'limite' ? nivelOrden(t) : null
    var fijos = {}; stops.forEach(function (s) { var x = fijaConVela(s, t); if (x !== undefined) fijos[s.id] = x })
    eventos.push({ date: bars[t].date, tipo: 'senal', panel: 'precio', precio: nivel != null ? nivel : bars[t].close, texto: 'Señal: orden' })
    return { senal: t, nivel: nivel, fijos: fijos, g: nivel != null ? { id: 'o' + bars[t].date, lado: 'compra', clase: o.tipo === 'limite' ? 'limite' : 'stop', niveles: [], fin: 'abierta' } : null }
  }
  function entra(precio, fecha, e, ord) {
    var niveles = {}
    stops.forEach(function (s) {
      if (s.tipo === 'nivel' || s.tipo === 'minimoVelas') niveles[s.id] = ord.fijos[s.id] != null ? ord.fijos[s.id] : null
      else if (s.tipo === 'porcentaje') niveles[s.id] = precio * (1 - s.pct / 100)
      else if (s.tipo === 'atr') { var a = atr(s.periodo)[ord.senal]; niveles[s.id] = a == null ? null : precio - s.k * a }
      else niveles[s.id] = null
    })
    var hist = []
    stops.forEach(function (s) { if (s.historialAlEntrar && niveles[s.id] != null) hist.push({ date: fecha, stopPx: niveles[s.id] }) })
    var inicial = stops.map(function (s) { return niveles[s.id] }).find(function (x) { return x != null })
    if (inicial === undefined) inicial = null
    pos = { entrada: precio, fecha: fecha, e: e, niveles: niveles, hist: hist, riesgo: inicial != null ? precio - inicial : null }
  }
  function sale(b, precio, motivo, stopPx) {
    trades.push({ entryDate: pos.fecha, exitDate: b.date, entryPrice: pos.entrada, exitPrice: precio, exitReason: motivo, stopPx: stopPx, stopHistory: pos.hist.slice() })
    pos = null
  }

  for (var i = 1; i < n; i++) {
    var b = bars[i], t = i - 1
    // ── FUERA ──
    if (!pos) {
      if (orden && sCancel && sCancel[t] === true) {
        if (orden.g) { orden.g.fin = 'cancelada'; orden.g.finDate = bars[t].date; orden.g.motivo = 'Cancelada'; ordenes.push(orden.g) }
        orden = null
        continue
      }
      if (!orden && sSenal[t] === true) {
        orden = nuevaOrden(t)
        if (o.tipo === 'cierre') { entra(bars[t].close, bars[t].date, t, orden); orden = null }
        else if (o.tipo === 'apertura') { entra(b.open, b.date, i, orden); orden = null; if (!revisaEntrada) continue }
      }
      if (orden && orden.nivel != null) {
        var cand = nivelOrden(t)
        if (cand != null && ((o.ajuste === 'soloBaja' && cand < orden.nivel) || (o.ajuste === 'soloSube' && cand > orden.nivel))) {
          orden.nivel = cand
          stops.forEach(function (s) { var x = fijaConVela(s, t); if (x !== undefined) orden.fijos[s.id] = x })
        }
        if (orden.g) orden.g.niveles.push({ date: b.date, precio: orden.nivel, decididaEn: bars[t].date })
        var lim = o.tipo === 'limite'
        var llena = lim ? (b.open <= orden.nivel || b.low <= orden.nivel) : (b.open >= orden.nivel || b.high >= orden.nivel)
        if (llena) {
          var precio = lim ? (b.open <= orden.nivel ? b.open : orden.nivel) : (b.open >= orden.nivel ? b.open : orden.nivel)
          if (orden.g) { orden.g.fin = 'ejecutada'; orden.g.finDate = b.date; orden.g.entryDate = b.date; ordenes.push(orden.g) }
          var ord = orden; orden = null
          entra(precio, b.date, i, ord)
          if (!revisaEntrada) continue
        }
      }
    }
    // ── DENTRO ──
    if (pos) {
      var salio = false
      for (var k = 0; k < stops.length; k++) {
        var s = stops[k]
        if (s.tipo === 'trailing') {
          if (s._si[t] === true) {
            var c2
            if (s.nivel.atr) { var a2 = atr(s.nivel.atr.periodo)[t]; c2 = a2 == null || bars[t].close == null ? null : bars[t].close - s.nivel.atr.k * a2 }
            else c2 = extremo(s.nivel.campo || 'low', t - (s.nivel.velas || 1) + 1, t, false)
            var valido = c2 != null && (!s.soloSobreEntrada || c2 > pos.entrada)
            var fecha = s.fechaHistorial === 'anterior' ? bars[t].date : b.date
            var actual = pos.niveles[s.id]
            if (valido && (s.historial != null ? s.historial : 'siSube') === 'cadaVez') { pos.niveles[s.id] = actual === null ? c2 : Math.max(actual, c2); pos.hist.push({ date: fecha, stopPx: pos.niveles[s.id] }) }
            else if (valido && (actual === null || c2 > actual)) { pos.niveles[s.id] = c2; pos.hist.push({ date: fecha, stopPx: c2 }) }
          }
        }
        var lvl = pos.niveles[s.id]
        if (lvl != null) {
          if (b.open <= lvl) { sale(b, b.open, s.motivo, lvl); salio = true; break }
          if (b.low <= lvl) { sale(b, lvl, s.motivo, lvl); salio = true; break }
          if (s.retiraSiSupera) { var otro = pos.niveles[s.retiraSiSupera]; if (otro !== null && otro !== undefined && otro > lvl) pos.niveles[s.id] = null }
        }
      }
      if (salio) continue
      for (var q = 0; q < salidas.length; q++) {
        var x = salidas[q]
        if (x.tipo === 'condicion' && x._si[t] === true) { sale(b, b.open, x.motivo, null); salio = true; break }
        if (x.tipo === 'objetivo' && pos.riesgo != null && pos.riesgo > 0) {
          var obj = pos.entrada + x.multiploR * pos.riesgo
          if (b.open >= obj) { sale(b, b.open, x.motivo, null); salio = true; break }
          if (b.high >= obj) { sale(b, obj, x.motivo, null); salio = true; break }
        }
        if (x.tipo === 'tope' && i - pos.e >= x.velas) { sale(b, b.open, x.motivo, null); salio = true; break }
      }
      if (salio) continue
    }
  }

  var abierto = null
  if (pos) { var sp = stops.map(function (s) { return pos.niveles[s.id] }).find(function (y) { return y != null }); abierto = { entryDate: pos.fecha, entryPrice: pos.entrada, stopPx: sp === undefined ? null : sp } }
  var ms = Array.from(mediasDe(resuelve({ entrada: def.entrada, stops: def.stops, salidas: def.salidas }), new Map()).values()).filter(function (m) { return ['EMA', 'SMA'].indexOf(m.tipo) >= 0 && Number.isInteger(m.periodo) })
  var indicators = {}, series = []
  ms.forEach(function (m, k) { var clave = 'm' + (k + 1); indicators[clave] = media(m.tipo, m.periodo); series.push({ clave: clave, nombre: m.tipo + m.periodo, panel: 'precio', tipo: 'linea', equivale: { tipo: 'medias', tipoMA: m.tipo.toLowerCase(), periodo: m.periodo } }) })
  var motivos = []
  stops.concat(salidas).forEach(function (s) { if (motivos.indexOf(s.motivo) < 0) motivos.push(s.motivo) })
  return {
    trades: trades, indicators: indicators, openPosition: abierto,
    grafico: { version: 1, series: series, eventos: eventos, ordenes: orden && orden.g ? ordenes.concat([orden.g]) : ordenes,
      motivosPosibles: { cancelacion: sCancel ? ['Cancelada'] : [], salida: motivos } },
  }
}

function run(bars, params) { return interpretaEditor(DEF, bars, params || {}) }
run.parametros = DEF.parametros || { version: 1, lista: [] }
`

// La condición de fuerza relativa va SOLO si la definición la usa: el motor calcula el percentil (con todo el Nasdaq-100)
// para un code_js que nombra el campo de la vela (lib/fuerzaRelativa.js: usaFuerzaRelativa), y sin ella no hace falta.
const FUERZA_RELATIVA = "fuerzaRelativaPercentil: function (p) { return bars.map(function (v) { return typeof (v && v.rsPercentil) === 'number' && Number.isFinite(v.rsPercentil) ? compara(v.rsPercentil, p.umbral, p.lado) : null }) },"

// ¿Se puede exportar? [] si sí; si no, los motivos.
export function motivosNoExportable(def, valores = {}) {
  const e = [...validaDefinicion(def, valores)]
  if (def?.motor !== MOTOR_EXPORTADO || MOTOR !== MOTOR_EXPORTADO) e.push(`El exportador copia el motor ${MOTOR_EXPORTADO}; esta definición es del motor ${def?.motor}.`)
  if (def?.filtroMercado) e.push('Una estrategia con filtro de mercado no se puede exportar: un code_js no recibe las velas de otro ticker.')
  // V9.1055: el motor copiado no tiene las piezas de las Tortugas.
  if (def?.entrada?.orden?.tipo === 'ruptura' || def?.stopsModo || (def?.stops || []).some(s => s?.tipo === 'atrCompra' || s?.tipo === 'minimoMovil')) e.push('El exportador todavía no sabe copiar las piezas de V9.1055 (orden en el nivel de ruptura, stop fijo por el ATR de la vela anterior a la compra, stop que sube con el mínimo de N velas o «manda el más alto»).')
  const nuevas = [...new Set(condicionesUsadas(def))].filter(c => !EXPORTABLES.includes(c))
  if (nuevas.length) e.push(`El exportador todavía no sabe copiar ${nuevas.length > 1 ? 'estas condiciones' : 'esta condición'} (añadidas en V9.1047): ${nuevas.map(c => `«${CONDICIONES_EDITOR[c]?.nombre || c}»`).join(', ')}.`)
  return e
}
// Las condiciones del catálogo que el motor copiado (RUNTIME) sabe calcular. Las del Builder de V9.1047 no están: una
// definición que las use no se exporta (se dice por qué) en vez de dar un code_js que fallaría.
const EXPORTABLES = ['precioVsMedia', 'mediaVsMedia', 'rsiNivel', 'nuevoMaximo', 'volumenAlto', 'caidaDesdeMaximo', 'fuerzaRelativaPercentil']
const condicionesUsadas = (x, out = []) => {
  if (Array.isArray(x)) x.forEach(y => condicionesUsadas(y, out))
  else if (x && typeof x === 'object') { if (typeof x.c === 'string' && CONDICIONES_EDITOR[x.c]) out.push(x.c); for (const [k, y] of Object.entries(x)) if (k !== 'p' && k !== 'diseno') condicionesUsadas(y, out) }
  return out
}

// El texto del code_js. Los valores (los guardados) van como defectos de la declaración: así el code_js se comporta igual
// aunque la fila nueva no lleve params, y el optimizador los sigue pudiendo cambiar.
export async function exportaCodeJs(def, valores = {}, { version = null } = {}) {
  const e = motivosNoExportable(def, valores)
  if (e.length) throw new Error(e.join(' '))
  const v = valoresDe(def, valores)
  const copia = JSON.parse(JSON.stringify(def))
  delete copia.diseno
  if (copia.parametros?.lista) copia.parametros.lista = copia.parametros.lista.map(p => ({ ...p, defecto: v[p.nombre] }))
  const huella = await huellaDefinicion(def, valores)
  const frase = fraseDefinicion(def, valores).replace(/\s+/g, ' ')
  const lineas = []
  for (let r = frase; r.length; ) { let k = r.length <= 110 ? r.length : r.lastIndexOf(' ', 110); if (k <= 0) k = Math.min(110, r.length); lineas.push(r.slice(0, k).trim()); r = r.slice(k).trim() }
  return [
    `// ${def.nombre || 'Estrategia'} — EXPORTADA del editor visual${version ? ` (${version})` : ''}, motor ${MOTOR_EXPORTADO}.`,
    `// Huella de la definición con sus valores: ${huella}.`,
    '// Esta copia ya no se edita en el editor: es una estrategia de código. Hace lo mismo que la del editor mientras no se toque.',
    '//',
    ...lineas.map(l => `// ${l}`),
    '',
    `const DEF = ${JSON.stringify(copia, null, 2)}`,
    RUNTIME.replace('/*FUERZA_RELATIVA*/', /"fuerzaRelativaPercentil"/.test(JSON.stringify(def)) ? FUERZA_RELATIVA : '// (sin la fuerza relativa: esta estrategia no la usa)'),
  ].join('\n')
}
