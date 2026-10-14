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
// Yahoo), los N con mayor volatilidad del año Y−1, calculada SOLO con velas anteriores al 1 de enero de Y. Empates: por
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

// Miembros del índice en `fecha` que el screener puede considerar: sin excluir a mano y con símbolo de Yahoo.
export function elegiblesEn(fecha, miembros) {
  return (miembros || []).filter(t => cubre(t, fecha) && !t.excluido_motivo && t.simbolo_yahoo)
}

// Selección del 1 de enero de `anio`: { fecha, elegibles, seleccionados: [{ simbolo, vol, miembro }], sinVolatilidad:
// [{ simbolo, motivo, n }], corte: vol del último seleccionado o null }. simbolo es el de Yahoo; un símbolo de Yahoo con
// dos tramos el mismo día cuenta una vez.
export function seleccion(anio, N, miembros, velasPorSimbolo) {
  const fecha = primeroDeEnero(anio)
  const vistos = new Set(), elegibles = []
  for (const t of elegiblesEn(fecha, miembros)) if (!vistos.has(t.simbolo_yahoo)) { vistos.add(t.simbolo_yahoo); elegibles.push(t) }
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
  return { fecha, elegibles: elegibles.length, seleccionados, sinVolatilidad, corte: seleccionados.length ? seleccionados[seleccionados.length - 1].vol : null }
}

// Máscara de entradas de anioInicio a anioFin (los dos incluidos): { símbolo: [[desde, hasta), …] } con los intervalos de
// años consecutivos fusionados. selecciones (opcional) recibe { año: seleccion(...) } para no recalcularlas.
export function mascaraUniverso(anioInicio, anioFin, N, miembros, velasPorSimbolo, selecciones = null) {
  const mascara = {}
  for (let y = anioInicio; y <= anioFin; y++) {
    const s = selecciones?.[y] || seleccion(y, N, miembros, velasPorSimbolo)
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
