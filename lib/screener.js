// lib/screener.js — screener por reglas del universo histórico (Fase 8a): qué miembros del índice pueden recibir
// ENTRADAS cada año según la volatilidad del año anterior. Lógica PURA: no habla con Supabase ni con Yahoo; recibe los
// tramos de public.universo_miembros y las velas diarias, y decide. Quien la use hace las lecturas.
//
// Un miembro es una fila de universo_miembros: { simbolo, simbolo_yahoo, desde: 'YYYY-MM-DD', hasta: 'YYYY-MM-DD' | null,
// excluido_motivo, … }. Una vela es { date: 'YYYY-MM-DD', close, … } (la forma del motor). velasPorSimbolo va por
// símbolo de Yahoo.
//
// VOLATILIDAD DE UN AÑO: desviación típica muestral de los rendimientos logarítmicos diarios del cierre, ln(c / c_prev),
// de las velas de ese año natural, anualizada (× √252). Cada rendimiento cuenta en el año de su vela de llegada, así que
// el primero del año sale del último cierre del año anterior. Solo cuentan los pares con los dos cierres > 0. Es la
// MISMA definición que la SQL que usaba scripts/coberturaUniverso.js (lag(close) y stddev_samp), que ahora usa esta.
//
// LA REGLA DEL SCREENER: el 1 de enero del año Y, entre los elegibles (miembros ese día, sin excluir, con símbolo de
// Yahoo, y una sola clase por empresa: ver unaClasePorEmpresa), los N con mayor volatilidad del año Y−1, calculada SOLO con velas anteriores al 1 de enero de Y. Empates: por
// símbolo de Yahoo, en orden alfabético. Los elegibles sin volatilidad medible (sin velas o con menos de 120
// rendimientos) no entran y se devuelven aparte.
//
// LA MÁSCARA solo limita ENTRADAS: un seleccionado el 1 de enero de Y puede recibir entradas desde ese día hasta el
// siguiente 1 de enero o hasta su salida del índice, lo primero que llegue. Quien entra al índice a mitad de año espera al
// siguiente 1 de enero. Las salidas de las posiciones abiertas no dependen de ella.
export const MIN_RENDIMIENTOS = 120
const ANUALIZA = Math.sqrt(252)

const primeroDeEnero = (anio) => `${anio}-01-01`
const cubre = (t, dia) => t.desde <= dia && (t.hasta == null || dia < t.hasta)

// { año: { primera: fecha de la primera vela del año, n: rendimientos, vol: anualizada o null si n < 2 } } de una serie.
export function estadisticasAnuales(velas) {
  const orden = [...(velas || [])].sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0)
  const porAnio = {}
  for (let i = 0; i < orden.length; i++) {
    const v = orden[i], anio = Number(v.date.slice(0, 4))
    const a = porAnio[anio] ||= { primera: v.date, r: [] }
    const prev = i > 0 ? orden[i - 1].close : null
    if (prev > 0 && v.close > 0) a.r.push(Math.log(v.close / prev))
  }
  const res = {}
  for (const [anio, { primera, r }] of Object.entries(porAnio)) {
    let vol = null
    if (r.length >= 2) {
      const media = r.reduce((s, x) => s + x, 0) / r.length
      vol = Math.sqrt(r.reduce((s, x) => s + (x - media) ** 2, 0) / (r.length - 1)) * ANUALIZA
    }
    res[anio] = { primera, n: r.length, vol }
  }
  return res
}

// Volatilidad anualizada del año natural `anio`, o null si hay menos de MIN_RENDIMIENTOS rendimientos.
export function volatilidadAnual(velas, anio) {
  const a = estadisticasAnuales(velas)[anio]
  return a && a.n >= MIN_RENDIMIENTOS && a.vol != null ? a.vol : null
}

// UNA CLASE POR EMPRESA (V9.991). Algunas empresas tienen varias clases de acciones en el índice a la vez (GOOG y GOOGL,
// FOX y FOXA, LBTYA y LBTYK, DISCA y DISCK…). Se agrupan por EMPRESA —el nombre sin el sufijo de clase: «(Class A)»,
// «Class C», «Series A»…— y de cada empresa solo puede entrar UNA clase: la que lleva más tiempo en el índice ese día (el
// «desde» más antiguo de su tramo); si empatan, la de símbolo de Yahoo alfabéticamente primero. Es una regla fija (no
// mira precios ni volumen) y se aplica antes de medir. Las clases que quedan fuera se devuelven aparte (otrasClases).
export const empresaDe = (nombre) => String(nombre || '').replace(/\s*\((Class|Series) [A-Z]\)\s*$/i, '').replace(/\s+(Class|Series) [A-Z]\s*$/i, '').trim().toLowerCase()
export function unaClasePorEmpresa(elegibles) {
  const porEmpresa = new Map()
  for (const t of elegibles) { const k = empresaDe(t.nombre) || t.simbolo_yahoo; if (!porEmpresa.has(k)) porEmpresa.set(k, []); porEmpresa.get(k).push(t) }
  const quedan = [], otrasClases = []
  for (const [empresa, ts] of porEmpresa) {
    const orden = [...ts].sort((a, b) => a.desde < b.desde ? -1 : a.desde > b.desde ? 1 : a.simbolo_yahoo < b.simbolo_yahoo ? -1 : a.simbolo_yahoo > b.simbolo_yahoo ? 1 : 0)
    quedan.push(orden[0]); for (const t of orden.slice(1)) otrasClases.push({ simbolo: t.simbolo_yahoo, queda: orden[0].simbolo_yahoo, empresa })
  }
  const enOrden = new Set(quedan)
  return { elegibles: elegibles.filter(t => enOrden.has(t)), otrasClases: otrasClases.sort((a, b) => a.simbolo < b.simbolo ? -1 : 1) }
}
// Miembros del índice en `fecha` que el screener puede considerar: sin excluir a mano y con símbolo de Yahoo.
export function elegiblesEn(fecha, miembros) {
  return (miembros || []).filter(t => cubre(t, fecha) && !t.excluido_motivo && t.simbolo_yahoo)
}

// Selección del 1 de enero de `anio`: { fecha, elegibles, seleccionados: [{ simbolo, vol, miembro }], sinVolatilidad:
// [{ simbolo, motivo, n }], corte: vol del último seleccionado o null }. simbolo es el de Yahoo; un símbolo de Yahoo con
// dos tramos el mismo día cuenta una vez.
export function seleccion(anio, N, miembros, velasPorSimbolo) {
  const fecha = primeroDeEnero(anio)
  const vistos = new Set(), todos = []
  for (const t of elegiblesEn(fecha, miembros)) if (!vistos.has(t.simbolo_yahoo)) { vistos.add(t.simbolo_yahoo); todos.push(t) }
  const { elegibles, otrasClases } = unaClasePorEmpresa(todos)
  const medibles = [], sinVolatilidad = []
  for (const t of elegibles) {
    // Solo el pasado: nada del 1 de enero de `anio` en adelante.
    const pasado = (velasPorSimbolo?.[t.simbolo_yahoo] || []).filter(v => v.date < fecha)
    const a = estadisticasAnuales(pasado)[anio - 1]
    const vol = a && a.n >= MIN_RENDIMIENTOS ? a.vol : null
    if (vol != null) medibles.push({ simbolo: t.simbolo_yahoo, vol, miembro: t })
    else sinVolatilidad.push({ simbolo: t.simbolo_yahoo, motivo: pasado.length ? `${a ? a.n : 0} rendimientos en ${anio - 1}` : 'sin velas', n: a ? a.n : 0 })
  }
  medibles.sort((x, y) => y.vol - x.vol || (x.simbolo < y.simbolo ? -1 : x.simbolo > y.simbolo ? 1 : 0))
  sinVolatilidad.sort((x, y) => x.simbolo < y.simbolo ? -1 : 1)
  const seleccionados = medibles.slice(0, Math.max(0, N))
  return { fecha, elegibles: elegibles.length, seleccionados, sinVolatilidad, otrasClases, corte: seleccionados.length ? seleccionados[seleccionados.length - 1].vol : null }
}

// ── Regla «momentum» (Fase 8a, paso 4; declarada antes de ver resultados) ─────────────────────────────────────────────
// Momentum del año Y = cierre del último día con cotización anterior al 1 de enero de Y / cierre del último día con
// cotización anterior al 1 de enero de Y−1, menos 1 (12 meses completos, sin saltar el último mes). Medible solo con al
// menos 120 rendimientos diarios en Y−1 (el umbral de la volatilidad) y con cotización en las dos fechas. Cada 1 de enero,
// los N elegibles con mayor momentum; empate por símbolo; solo velas anteriores al 1 de enero de Y.
// «El último día con cotización» anterior a una fecha es el último día de bolsa: la fecha más repetida entre las últimas
// velas anteriores a ella de los elegibles (con empate, la más reciente). «Cotización en esa fecha» = el valor tiene vela
// ese día; así no se usa el cierre viejo de un valor que dejó de cotizar o tiene un hueco al final del año.
const ultimaAntes = (velas, f) => { let u = null; for (const v of velas) if (v.date < f && (!u || v.date > u.date)) u = v; return u }
function ultimoDiaDeBolsa(series, f) {
  const cuenta = new Map()
  for (const vs of series) { const u = ultimaAntes(vs, f); if (u) cuenta.set(u.date, (cuenta.get(u.date) || 0) + 1) }
  let mejor = null
  for (const [d, k] of cuenta) if (!mejor || k > mejor.k || (k === mejor.k && d > mejor.d)) mejor = { d, k }
  return mejor ? mejor.d : null
}
// Momentum de una serie para el año `anio` con los dos días de bolsa dados: { momentum, motivo } (momentum null si no es
// medible, con el porqué).
export function momentumAnual(velas, anio, diaFin, diaIni) {
  const a = estadisticasAnuales(velas)[anio - 1]
  if (!velas?.length) return { momentum: null, motivo: 'sin velas' }
  if (!a || a.n < MIN_RENDIMIENTOS) return { momentum: null, motivo: `${a ? a.n : 0} rendimientos en ${anio - 1}` }
  const fin = velas.find(v => v.date === diaFin), ini = velas.find(v => v.date === diaIni)
  if (!fin || !(fin.close > 0)) return { momentum: null, motivo: `sin cotización el ${diaFin}` }
  if (!ini || !(ini.close > 0)) return { momentum: null, motivo: `sin cotización el ${diaIni}` }
  return { momentum: fin.close / ini.close - 1, motivo: null }
}
// Selección por momentum del 1 de enero de `anio`, con la forma de seleccion(): seleccionados [{ simbolo, momentum, valor,
// miembro }], sinMedida [{ simbolo, motivo }], corte, y los dos días de bolsa usados.
export function seleccionMomentum(anio, N, miembros, velasPorSimbolo) {
  const fecha = primeroDeEnero(anio), fechaIni = primeroDeEnero(anio - 1)
  const vistos = new Set(), todos = []
  for (const t of elegiblesEn(fecha, miembros)) if (!vistos.has(t.simbolo_yahoo)) { vistos.add(t.simbolo_yahoo); todos.push(t) }
  const { elegibles, otrasClases } = unaClasePorEmpresa(todos)
  // Solo el pasado: nada del 1 de enero de `anio` en adelante.
  const pasado = Object.fromEntries(elegibles.map(t => [t.simbolo_yahoo, (velasPorSimbolo?.[t.simbolo_yahoo] || []).filter(v => v.date < fecha)]))
  const series = Object.values(pasado).filter(v => v.length)
  const diaFin = ultimoDiaDeBolsa(series, fecha), diaIni = ultimoDiaDeBolsa(series, fechaIni)
  const medibles = [], sinMedida = []
  for (const t of elegibles) {
    const r = momentumAnual(pasado[t.simbolo_yahoo], anio, diaFin, diaIni)
    if (r.momentum != null) medibles.push({ simbolo: t.simbolo_yahoo, momentum: r.momentum, valor: r.momentum, miembro: t })
    else sinMedida.push({ simbolo: t.simbolo_yahoo, motivo: r.motivo })
  }
  medibles.sort((x, y) => y.momentum - x.momentum || (x.simbolo < y.simbolo ? -1 : x.simbolo > y.simbolo ? 1 : 0))
  sinMedida.sort((x, y) => x.simbolo < y.simbolo ? -1 : 1)
  const seleccionados = medibles.slice(0, Math.max(0, N))
  return { fecha, elegibles: elegibles.length, seleccionados, sinMedida, otrasClases, corte: seleccionados.length ? seleccionados[seleccionados.length - 1].momentum : null, diaFin, diaIni }
}
// Las reglas del screener, por nombre (el de universo_screener.regla).
export const REGLAS = { volatilidad: seleccion, momentum: seleccionMomentum }

// Máscara de entradas de anioInicio a anioFin (los dos incluidos): { símbolo: [[desde, hasta), …] } con los intervalos de
// años consecutivos fusionados. selecciones (opcional) recibe { año: seleccion(...) } para no recalcularlas. regla: la de
// REGLAS con la que se calculan las que falten (por defecto, volatilidad).
export function mascaraUniverso(anioInicio, anioFin, N, miembros, velasPorSimbolo, selecciones = null, regla = 'volatilidad') {
  const mascara = {}
  for (let y = anioInicio; y <= anioFin; y++) {
    const s = selecciones?.[y] || REGLAS[regla](y, N, miembros, velasPorSimbolo)
    const fin = primeroDeEnero(y + 1)
    for (const { simbolo, miembro } of s.seleccionados) {
      // El tramo que cubre el 1 de enero manda: si sale antes de fin de año, las entradas acaban en su «hasta».
      const hasta = miembro.hasta != null && miembro.hasta < fin ? miembro.hasta : fin
      const lista = mascara[simbolo] ||= []
      const ultimo = lista[lista.length - 1]
      if (ultimo && ultimo[1] === s.fecha) ultimo[1] = hasta
      else lista.push([s.fecha, hasta])
    }
  }
  return mascara
}

// ¿Puede `simbolo` recibir una entrada en `fecha` según la máscara?
export function admiteEntrada(mascara, simbolo, fecha) {
  return (mascara?.[simbolo] || []).some(([d, h]) => d <= fecha && fecha < h)
}

// ── Desde la tabla public.universo_screener ──────────────────────────────────────────────────────────────────────────
// Las selecciones guardadas ({ regla, n, anio, simbolo_yahoo, posicion, volatilidad }) con la forma de seleccion(): por
// año, los elegidos en orden de puesto y, de cada uno, su tramo de universo_miembros que cubre el 1 de enero (el que
// decide hasta cuándo recibe entradas). Un elegido sin tramo elegible ese día no puede recibir entradas y se cuenta
// aparte (sinTramo): no debería pasar si la tabla salió de estos mismos miembros.
export function seleccionesDeTabla(filas, miembros) {
  const porAnio = {}
  for (const f of [...(filas || [])].sort((a, b) => a.anio - b.anio || a.posicion - b.posicion)) (porAnio[f.anio] ||= []).push(f)
  const selecciones = {}, sinTramo = []
  for (const [anio, fs] of Object.entries(porAnio)) {
    const fecha = primeroDeEnero(anio)
    const tramos = new Map()
    for (const t of elegiblesEn(fecha, miembros)) if (!tramos.has(t.simbolo_yahoo)) tramos.set(t.simbolo_yahoo, t)
    const seleccionados = []
    for (const f of fs) {
      const miembro = tramos.get(f.simbolo_yahoo)
      if (miembro) seleccionados.push({ simbolo: f.simbolo_yahoo, vol: f.volatilidad, miembro })
      else sinTramo.push(`${f.simbolo_yahoo} ${anio}`)
    }
    selecciones[anio] = { fecha, seleccionados, corte: seleccionados.length ? seleccionados[seleccionados.length - 1].vol : null }
  }
  return { selecciones, sinTramo }
}

// El universo dinámico de un periodo [desde, hasta) a partir de la tabla: la máscara de entradas (todos los años de la
// tabla), los símbolos que pueden recibir alguna entrada en el periodo (los activos del multibacktest), los elegidos de
// cada año que toca el periodo (para el B&H del universo) y el primer año con selección.
export function universoDePeriodo(filas, miembros, desde, hasta) {
  const { selecciones, sinTramo } = seleccionesDeTabla(filas, miembros)
  const anios = Object.keys(selecciones).map(Number).sort((a, b) => a - b)
  if (!anios.length) return { mascara: {}, simbolos: [], elegidos: {}, primerAnio: null, ultimoAnio: null, sinTramo }
  const N = Math.max(...(filas || []).map(f => f.n))
  const mascara = mascaraUniverso(anios[0], anios[anios.length - 1], N, miembros, null, selecciones)
  const simbolos = Object.keys(mascara).filter(s => mascara[s].some(([d, h]) => d < hasta && h > desde)).sort()
  const elegidos = {}
  for (const y of anios) if (primeroDeEnero(y) < hasta && primeroDeEnero(y + 1) > desde) elegidos[y] = selecciones[y].seleccionados.map(x => x.simbolo)
  return { mascara: Object.fromEntries(simbolos.map(s => [s, mascara[s]])), simbolos, elegidos, primerAnio: anios[0], ultimoAnio: anios[anios.length - 1], sinTramo }
}

// ── B&H del universo ─────────────────────────────────────────────────────────────────────────────────────────────────
// Reparto igual entre los elegidos de cada año, rebalanceado al cierre de la primera fecha del eje de cada año (la
// primera del periodo, el primer año). Entre rebalanceos no se toca nada: un valor que sale del índice a mitad de año
// se mantiene; uno que deja de cotizar queda en su último cierre, que es pasarlo a liquidez. Un elegido que no cotiza el
// día del rebalanceo (sin velas hasta ese día o ya sin cotizar) no recibe nada: su parte queda en liquidez. Sin
// comisiones, como los demás B&H.
//   elegidos: { año: [símbolo] } · series: { símbolo: [{ date, close }] } en orden · fechas: el eje · capitalIni.
// Devuelve [{ date, value }] en las fechas del eje.
export function bhUniverso(elegidos, series, fechas, capitalIni) {
  const cursores = {}
  const cierre = (s, d) => {   // último cierre <= d (series en orden; el eje avanza, así que el cursor también)
    const v = series[s]; if (!v?.length) return null
    let c = cursores[s] ?? -1
    while (c + 1 < v.length && v[c + 1].date <= d) c++
    cursores[s] = c
    return c >= 0 ? v[c].close : null
  }
  const cotiza = (s, d) => { const v = series[s]; return !!v?.length && v[0].date <= d && v[v.length - 1].date >= d }
  let liquidez = capitalIni, acciones = {}, anioActual = null
  const out = []
  for (const d of fechas) {
    const valor = () => liquidez + Object.entries(acciones).reduce((s, [sym, k]) => s + k * (cierre(sym, d) ?? 0), 0)
    const anio = Number(d.slice(0, 4))
    if (anio !== anioActual) {
      const total = valor()
      const lista = (elegidos[anio] || [])
      const parte = lista.length ? total / lista.length : 0
      acciones = {}; liquidez = total
      for (const s of lista) {
        const px = cotiza(s, d) ? cierre(s, d) : null
        if (px > 0) { acciones[s] = parte / px; liquidez -= parte }
      }
      anioActual = anio
    }
    out.push({ date: d, value: valor() })
  }
  return out
}
