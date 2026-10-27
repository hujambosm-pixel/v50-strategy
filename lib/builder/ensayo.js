// lib/builder/ensayo.js — la pestaña «Señales en el gráfico» del paso 1 (V9.1054; docs/builder.md, §20). Puro, salvo
// cifrasRegla, que es asíncrona porque llama al núcleo.
//   · Las fechas: el ENSAYO 2010–2015 por defecto (los años de antes de los del paso 2), o la primera mitad de la historia si el
//     valor tiene menos de 4 años antes de 2016; y si unas fechas tocan 2016–2025, la nota de que son los años del paso 2.
//   · Las casillas de prueba: una por cada número de cada fila de las tarjetas (y de los stops, la orden, el objetivo y el tiempo),
//     con su valor en pantalla y el guardado; y aplicarlas a la estrategia SIN tocarla (devuelve una copia).
//   · Las cifras: LAS MISMAS DE «BACKTEST DE UN VALOR». Se llama al mismo núcleo que /api/datos (lib/backtestActivo.js, con el
//     intérprete del editor) con las velas guardadas, el 100 % del capital y su comisión, y a la misma calcMetrics (lib/utils.js)
//     con los mismos argumentos que pages/index.js. No hay ningún cálculo nuevo de dinero.
import { backtestActivo } from '../backtestActivo'
import { calcMetrics, metricasSinOperaciones } from '../utils'
import { semanalesDesdeDiarias } from '../velasSemanales'
import { normalizaComisiones } from '../comisiones'
import { CONDICIONES_EDITOR } from '../editor/definicion'
import { leeFiltro, leeCompra, leeVenta, leeProteccion, leeOrden, escribeFiltro, escribeCompra, escribeVenta, conNumero, plantillaFila, opDe, nombreCond, ponNumeroStop, ponVelasOrden, ponNivelOrden, ponSalida, CAMPOS_STOP_TARJETA, TIPOS_STOP } from './tarjetas'

// ── Fechas ──
export const ENSAYO = Object.freeze({ desde: '2010-01-01', hasta: '2015-12-31' })
export const PASO2 = Object.freeze({ desde: '2016-01-01', hasta: '2025-12-31' })
export const NOTA_PASO2 = 'Estas fechas incluyen 2016–2025, los años que usa el paso 2 para la prueba contra el azar.'
const fechaCorta = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
// Las fechas del ensayo de un valor con sus velas (diarias, ordenadas). Si tiene al menos 4 años de precios antes de 2016, el
// 2010–2015; si no, la primera mitad de su historia, con un aviso que lo dice.
export function fechasEnsayo(velas, simbolo = 'Este valor') {
  if (!velas?.length) return { ...ENSAYO, aviso: null }
  const primera = velas[0].date, ultima = velas[velas.length - 1].date
  if ((Date.parse(PASO2.desde) - Date.parse(primera)) / (365.25 * 864e5) >= 4) return { ...ENSAYO, aviso: null }
  const mitad = velas[Math.floor((velas.length - 1) / 2)].date
  return { desde: primera, hasta: mitad, aviso: `${simbolo} solo tiene precios desde el ${fechaCorta(primera)}: menos de 4 años antes de 2016. El ensayo es la primera mitad de su historia, del ${fechaCorta(primera)} al ${fechaCorta(mitad)} (de ${fechaCorta(primera)} a ${fechaCorta(ultima)} hay precios).` }
}
export const tocaPaso2 = (desde, hasta) => !!desde && !!hasta && desde <= PASO2.hasta && hasta >= PASO2.desde

// ── Las casillas de prueba ──
// Cada número de la estrategia que se puede probar: { clave, bloque, partes } donde partes es la fila escrita como en las tarjetas
// (textos y casillas { campo, etiqueta }). campo: { tipo: 'fila', tarjeta, k, clave } | { tipo: 'stop', k, ruta } | { tipo: 'orden' }
// | { tipo: 'objetivo' } | { tipo: 'tiempo' }.
const BLOQUE = { filtro: 'Solo opero', compra: 'Compro', venta: 'Vendo' }
const claveDe = (c) => c.tipo === 'fila' ? `${c.tarjeta}|${c.k}|${c.clave}` : c.tipo === 'stop' ? `stop|${c.k}|${c.ruta.join('.')}` : c.tipo === 'orden' && c.clave ? `orden|${c.clave}` : c.tipo
export function camposDePrueba(def) {
  const out = []
  const filas = (t, lee) => { const r = lee(def); if (!r.ok) return; r.filas.forEach((f, k) => {
    const decl = Object.fromEntries((CONDICIONES_EDITOR[f.cond.c]?.parametros || []).map(d => [d.clave, d])), p = f.cond.p || {}
    const partes = plantillaFila(f.cond.c).map(x => typeof x === 'string' ? x : x.tipo === 'op' ? opDe(f) : x.tipo === 'num' ? { campo: { tipo: 'fila', tarjeta: t, k, clave: x.k }, etiqueta: decl[x.k]?.etiqueta || x.k } : x.tipo === 'grupoFuerza' ? 'Nasdaq-100' : String(p[x.k] ?? decl[x.k]?.defecto ?? ''))
    if (partes.some(x => typeof x === 'object')) out.push({ bloque: `${BLOQUE[t]}${t === 'filtro' && f.quien !== 'valor' ? ` (${f.quien})` : ''}`, nombre: nombreCond(f.cond.c), partes })
  }) }
  filas('filtro', leeFiltro); filas('compra', leeCompra); filas('venta', leeVenta)
  const o = leeOrden(def)
  if (o.ok && o.modo === 'maximo') out.push({ bloque: 'Orden', nombre: 'Orden en el máximo', partes: ['máximo de', { campo: { tipo: 'orden' }, etiqueta: 'Velas de la orden' }, 'velas'] })
  if (o.ok && o.modo === 'ruptura') out.push({ bloque: 'Compro', nombre: 'Orden en el nivel de ruptura', partes: ['máximo de', { campo: { tipo: 'orden' }, etiqueta: 'Velas anteriores de la ruptura' }, 'velas'] })
  // V9.1059: la orden en el último máximo de swing (L / R).
  if (o.ok && o.modo === 'swing') out.push({ bloque: 'Compro', nombre: 'Orden en el último máximo de swing', partes: ['máximo de swing', { campo: { tipo: 'orden', clave: 'izquierda' }, etiqueta: 'Velas a la izquierda del swing de la orden' }, '/', { campo: { tipo: 'orden', clave: 'derecha' }, etiqueta: 'Velas a la derecha del swing de la orden' }] })
  const prot = leeProteccion(def)
  prot.stops.forEach(({ s, editable }, k) => {
    if (!editable) return
    const campos = (CAMPOS_STOP_TARJETA[s.tipo] || []).map(([ruta, que]) => ({ campo: { tipo: 'stop', k, ruta }, etiqueta: que }))
    if (!campos.length) return
    const nombre = TIPOS_STOP.find(t => t.tipo === s.tipo)?.nombre || s.tipo
    const partes = s.tipo === 'porcentaje' ? [campos[0], '% bajo la compra'] : s.tipo === 'minimoVelas' ? ['mínimo de', campos[0], 'velas'] : s.tipo === 'atr' || s.tipo === 'atrCompra' ? [campos[0], '× ATR (', campos[1], ')'] : s.tipo === 'minimoMovil' ? ['mínimo de', campos[0], 'velas (sube)'] : s.tipo === 'swingMinimo' ? ['bajo el mínimo de swing', campos[0], '/', campos[1]] : s.tipo === 'trailing' ? ['bajo su media (', campos[0], '), sube al mínimo de', campos[1], 'velas'] : campos.flatMap((c, j) => j ? [' · ', c] : [c])
    out.push({ bloque: 'Stop', nombre, partes })
  })
  if (prot.objetivo.estado === 'veces') out.push({ bloque: 'Objetivo', nombre: 'Objetivo de ganancia', partes: ['ganar', { campo: { tipo: 'objetivo' }, etiqueta: 'Veces lo que arriesgo' }, 'veces lo que arriesgo'] })
  if (prot.tiempo.estado === 'velas') out.push({ bloque: 'Tiempo', nombre: 'Salida por tiempo', partes: ['a las', { campo: { tipo: 'tiempo' }, etiqueta: 'Velas' }, 'velas'] })
  for (const x of out) for (const y of x.partes) if (typeof y === 'object') y.clave = claveDe(y.campo)
  return out
}
// Lo que hay escrito en el sitio de un campo (un número, o «$nombre» si es un parámetro), o undefined si no existe.
function bruto(def, c) {
  if (c.tipo === 'fila') { const r = (c.tarjeta === 'filtro' ? leeFiltro : c.tarjeta === 'compra' ? leeCompra : leeVenta)(def); return r.ok ? r.filas[c.k]?.cond?.p?.[c.clave] : undefined }
  if (c.tipo === 'stop') { const s = (def.stops || [])[c.k]; return s ? c.ruta.reduce((x, k) => x?.[k], s) : undefined }
  if (c.tipo === 'orden') return def?.entrada?.orden?.nivel?.[c.clave || 'velas']
  const sal = (def.salidas || []).find(s => s?.tipo === (c.tipo === 'objetivo' ? 'objetivo' : 'tope'))
  return sal ? sal[c.tipo === 'objetivo' ? 'multiploR' : 'velas'] : undefined
}
// El valor de un campo con estos valores de los parámetros (resuelto), o null si el campo no existe.
export function valorCampo(def, valores, c) {
  const x = bruto(def, c)
  if (x === undefined) return null
  return typeof x === 'string' && x.startsWith('$') ? (valores[x.slice(1)] ?? null) : x
}
// La estrategia con un número cambiado, como hace la casilla de las tarjetas (V9.1053): si es un parámetro con nombre, su valor;
// si no, el número en su sitio. Devuelve { def, valores } nuevos; los de entrada no se tocan.
export function ponCampo({ def, valores }, c, v) {
  const x = bruto(def, c)
  if (typeof x === 'string' && x.startsWith('$')) return { def, valores: { ...valores, [x.slice(1)]: v } }
  if (c.tipo === 'fila') {
    if (c.tarjeta === 'filtro') { const r = leeFiltro(def); return { def: escribeFiltro(def, r.filas.map((f, j) => j === c.k ? { ...conNumero(f, c.clave, v), quien: f.quien } : f)), valores } }
    const lee = c.tarjeta === 'compra' ? leeCompra : leeVenta, esc = c.tarjeta === 'compra' ? escribeCompra : escribeVenta, r = lee(def)
    return { def: esc(def, r.filas.map((f, j) => j === c.k ? conNumero(f, c.clave, v) : f), r.modo || 'todas'), valores }
  }
  if (c.tipo === 'stop') return { def: ponNumeroStop(def, c.k, c.ruta, v), valores }
  if (c.tipo === 'orden') return { def: c.clave ? ponNivelOrden(def, c.clave, v) : ponVelasOrden(def, v), valores }
  return { def: ponSalida(def, c.tipo === 'objetivo' ? 'objetivo' : 'tope', c.tipo === 'objetivo' ? 'multiploR' : 'velas', v), valores }
}
// Todas las casillas cambiadas ({ clave: valor }) aplicadas sobre { def, valores }. Las claves que ya no existen se ignoran.
export function aplicaPrueba(est, cambios) {
  const campos = Object.fromEntries(camposDePrueba(est.def).flatMap(x => x.partes.filter(y => typeof y === 'object').map(y => [y.clave, y.campo])))
  let r = { def: est.def, valores: est.valores }
  for (const [k, v] of Object.entries(cambios || {})) if (campos[k]) r = ponCampo(r, campos[k], v)
  return r
}

// ── Las cifras (las de «Backtest de un valor») ──
const CAPITAL = 10000
// velas: { simbolo: velas DIARIAS } con el valor, los índices del filtro y ^GSPC (el núcleo lo pide siempre; si no está, sigue
// sin él, como el servidor cuando falla esa descarga). Las semanales se construyen como en pages/api/datos.js.
export async function cifrasRegla({ def, valores, intervalo = 'diario', simbolo, velas, desde, hasta, comisiones = null }) {
  const fetchAV = async (s, _anios, iv = 'd') => {
    const xs = velas[s]
    if (!xs?.length) throw new Error(`Sin datos para ${s}`)
    return (iv === 'w' ? semanalesDesdeDiarias(xs) : xs).map(v => ({ ...v }))   // copias: el núcleo escribe en las velas
  }
  const b = await backtestActivo({ simbolo, codeJs: { definicion: def }, stratParams: JSON.stringify(valores), stratName: def?.nombre || null, capital_ini: CAPITAL, years: 5, allocation_pct: 100,
    filtros: [], intervalo, fromDate: desde, toDate: hasta, comisiones: normalizaComisiones(comisiones) }, { fetchAV, grafico: false })
  const n = b._nucleo, { gananciaSimple, capitalReinv, ganBH, curves } = n.metricas
  const startDate = b.data[0].date, ultimaFecha = b.data[b.data.length - 1].date
  // Como pages/index.js: calcMetrics con los mismos argumentos; sin operaciones, metricasSinOperaciones.
  const m = calcMetrics(n.trades, CAPITAL, capitalReinv, gananciaSimple, ganBH || 0, startDate, ultimaFecha, 5) || metricasSinOperaciones(CAPITAL, ganBH || 0, startDate, ultimaFecha, 5)
  const base100 = (cs) => (cs || []).map(p => ({ date: p.date, value: p.value / CAPITAL * 100 }))
  // V9.1057: las comisiones pagadas, las que descuenta el núcleo en la columna compuesta (comisionCompuesta de cada operación, compra y
  // venta; con comisión cero el núcleo no la anota y es 0), y su % sobre el capital inicial.
  const cfg = normalizaComisiones(comisiones), pagadas = n.trades.reduce((s, t) => s + (t.comisionCompuesta || 0), 0)
  return {
    regla: { cagr: m.cagrC, maxDD: m.ddComp, winRate: m.winRate, factor: m.factorBen, operaciones: m.n, gananciaMedia: m.avgWin, perdidaMedia: m.avgLoss, tiempoInvertido: m.tiempoInvPct },
    bh: { cagr: m.cagrBH, maxDD: curves.maxDDBH, operaciones: 1, tiempoInvertido: 100 },
    curvas: { regla: base100(curves.compoundCurve), bh: base100(curves.bhCurve) },
    comisiones: { ...cfg, operaciones: n.trades.length, total: pagadas, capital: CAPITAL, pct: pagadas / CAPITAL * 100 },
    desde: startDate, hasta: ultimaFecha, trades: n.trades, metricas: m,
  }
}
export const MIN_OPERACIONES = 30
