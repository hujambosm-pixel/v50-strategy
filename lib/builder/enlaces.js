// lib/builder/enlaces.js — los parámetros ENLAZADOS del editor por tarjetas (V9.1067; docs/builder.md, §33). Puro.
// Un «uso» es cada sitio de la estrategia que usa un indicador con números: una fila de «Solo opero cuando…» (las del valor; las de
// un índice son de otro ticker), de «Compro cuando…» o de «Vendo cuando…», un stop o la orden de «Cómo compro». Los usos de la misma
// FAMILIA (el mismo indicador: SuperTrend, swing, una media de un tipo, ATR, RSI, Bollinger, MACD) con los MISMOS números van
// enlazados: cambiar un número en uno lo cambia en todos los del grupo, y se dibuja una sola línea. Un uso se puede SOLTAR para darle
// números propios (se dibuja aparte); volver a enlazarlo le pone los números del grupo de su familia.
// Nada de esto se guarda en la estrategia: al abrirla, los usos con los mismos números salen enlazados y los que tienen números
// distintos, sueltos (lo guardado no cambia ni un byte). Lo único que vive en la pantalla es qué usos se han soltado (`sueltos`).
import { leeFiltro, leeCompra, leeVenta, leeProteccion, leeOrden } from './tarjetas'
import { valorCampo, ponCampo } from './ensayo'

const ST = ['supertrend', ['periodo', 'k']], SW = ['swing', ['izquierda', 'derecha']], LB = ['lineaBajista', ['izquierda', 'derecha', 'velas']]   // V9.1076: LB
const FAMILIA_COND = {
  supertrendAlcista: ST, supertrendCambiaAlcista: ST, supertrendCambiaBajista: ST,
  minimosCrecientes: SW, maximosCrecientes: SW, cierreSobreSwing: SW, cierreBajoSwing: SW, estructuraAlcista: SW, rompeLineaBajista: LB,
  precioVsMedia: (p) => [`media:${p.tipo}`, ['periodo']], mediaPendiente: (p) => [`media:${p.tipo}`, ['periodo']], distanciaMedia: (p) => [`media:${p.tipo}`, ['periodo']],
  atrPct: ['atr', ['periodo']], rsiNivel: ['rsi', ['periodo']], bollingerBanda: ['bollinger', ['periodo', 'desviaciones']],
  macdSenal: ['macd', ['rapida', 'lenta', 'senal']], macdCero: ['macd', ['rapida', 'lenta', 'senal']],
}
const FAMILIA_STOP = { supertrend: ['supertrend', [['periodo', ['periodo']], ['k', ['k']]]], swingMinimo: ['swing', [['izquierda', ['izquierda']], ['derecha', ['derecha']]]],
  atr: ['atr', [['periodo', ['periodo']]]], atrCompra: ['atr', [['periodo', ['periodo']]]], emaMinimo: ['media:EMA', [['periodo', ['periodo']]]] }   // V9.1076: emaMinimo
const FAMILIA_ORDEN = { supertrend: ['supertrend', ['periodo', 'k']], swing: ['swing', ['izquierda', 'derecha']], lineaBajista: LB }
// El nombre de cada familia y cómo se escribe con sus números (para la casilla única de «Señales en el gráfico»).
export const NOMBRE_FAMILIA = (f) => f === 'supertrend' ? 'SuperTrend' : f === 'swing' ? 'Swing' : f === 'lineaBajista' ? 'Línea bajista' : f.startsWith('media:') ? f.slice(6) : f === 'atr' ? 'ATR' : f === 'rsi' ? 'RSI' : f === 'bollinger' ? 'Bollinger' : f === 'macd' ? 'MACD' : f
const DONDE = { filtro: 'filtro', compra: 'compra', venta: 'venta', stop: 'stop', orden: 'orden' }

// Los usos: [{ id, familia, donde, campos: { clave: campo } }] (campo: el de lib/builder/ensayo.js, para leer y escribir el número).
export function usosDe(def) {
  const out = []
  const filas = (t, lee) => { const r = lee(def); if (!r.ok) return; r.filas.forEach((f, k) => {
    if (t === 'filtro' && f.quien && f.quien !== 'valor') return
    const fam = FAMILIA_COND[f.cond?.c]; if (!fam) return
    const [familia, claves] = typeof fam === 'function' ? fam(f.cond.p || {}) : fam
    out.push({ id: `${t}|${k}`, familia, donde: t, campos: Object.fromEntries(claves.map(c => [c, { tipo: 'fila', tarjeta: t, k, clave: c }])) })
  }) }
  filas('filtro', leeFiltro); filas('compra', leeCompra); filas('venta', leeVenta)
  leeProteccion(def).stops.forEach(({ s, editable }, k) => {
    const fam = FAMILIA_STOP[s.tipo]; if (!fam || !editable) return
    out.push({ id: `stop|${s.id || k}`, familia: fam[0], donde: 'stop', campos: Object.fromEntries(fam[1].map(([c, ruta]) => [c, { tipo: 'stop', k, ruta }])) })
  })
  const o = leeOrden(def), fo = o.ok ? FAMILIA_ORDEN[o.modo] : null
  if (fo) out.push({ id: 'orden', familia: fo[0], donde: 'orden', campos: Object.fromEntries(fo[1].map(c => [c, { tipo: 'orden', clave: c }])) })
  return out
}
const firma = (def, valores, u) => JSON.stringify(Object.keys(u.campos).sort().map(c => valorCampo(def, valores, u.campos[c])))
// Los grupos enlazados (dos o más usos de la misma familia con los mismos números y sin soltar): [{ familia, usos: [uso, …] }].
export function gruposDe(def, valores = {}, sueltos = new Set()) {
  const g = new Map()
  for (const u of usosDe(def)) { if (sueltos.has(u.id)) continue; const k = `${u.familia}|${firma(def, valores, u)}`; if (!g.has(k)) g.set(k, { familia: u.familia, usos: [] }); g.get(k).usos.push(u) }
  return [...g.values()].filter(x => x.usos.length > 1)
}
// Cómo está cada uso: id → 'enlazado' | 'suelto' | null (null: no hay otro uso de su familia con el que enlazarse).
export function estadoEnlaces(def, valores = {}, sueltos = new Set()) {
  const usos = usosDe(def), enGrupo = new Set(gruposDe(def, valores, sueltos).flatMap(g => g.usos.map(u => u.id)))
  return Object.fromEntries(usos.map(u => [u.id, usos.some(x => x !== u && x.familia === u.familia) ? (enGrupo.has(u.id) ? 'enlazado' : 'suelto') : null]))
}
// Tras un cambio de la estrategia (antes → despues), si se ha cambiado UN número de UN uso enlazado, el mismo número en los demás
// usos de su grupo. Solo con la misma forma (los mismos usos, de la misma familia): añadir, quitar o mover filas no propaga nada.
export function propagaEnlaces(antes, despues, valores = {}, sueltos = new Set()) {
  const ua = usosDe(antes), ud = usosDe(despues)
  if (ua.length !== ud.length || ua.some((u, j) => u.id !== ud[j].id || u.familia !== ud[j].familia)) return despues
  const cambios = []
  ud.forEach((u, j) => { for (const c of Object.keys(u.campos)) { const a = valorCampo(antes, valores, ua[j].campos[c]), d = valorCampo(despues, valores, u.campos[c]); if (a !== d) cambios.push({ u, c, d }) } })
  if (cambios.length !== 1) return despues
  const { u, c, d } = cambios[0], grupo = gruposDe(antes, valores, sueltos).find(g => g.usos.some(x => x.id === u.id))
  if (!grupo) return despues
  let r = { def: despues, valores }
  for (const x of grupo.usos) if (x.id !== u.id && valorCampo(r.def, r.valores, x.campos[c]) !== d) r = ponCampo(r, x.campos[c], d)
  return r.def
}
// Volver a enlazar un uso suelto: deja de estar suelto y toma los números del grupo de su familia (el más grande; si no hay grupo,
// los del primer otro uso de su familia). Devuelve { def, valores, sueltos }.
export function enlazaUso(def, valores, sueltos, id) {
  const libres = new Set([...sueltos].filter(x => x !== id)), usos = usosDe(def), u = usos.find(x => x.id === id)
  if (!u) return { def, valores, sueltos: libres }
  const grupos = gruposDe(def, valores, libres).filter(g => g.familia === u.familia && !g.usos.some(x => x.id === id)).sort((a, b) => b.usos.length - a.usos.length)
  const modelo = grupos[0]?.usos[0] || usos.find(x => x.id !== id && x.familia === u.familia && !libres.has(x.id))
  let r = { def, valores }
  if (modelo) for (const c of Object.keys(u.campos)) { const v = valorCampo(def, valores, modelo.campos[c]); if (v != null && valorCampo(r.def, r.valores, u.campos[c]) !== v) r = ponCampo(r, u.campos[c], v) }
  return { ...r, sueltos: libres }
}
// Dónde se usa un grupo, en palabras: «compra, venta y stop».
export const dondeGrupo = (g) => { const xs = [...new Set(g.usos.map(u => DONDE[u.donde]))]; return xs.length > 1 ? `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}` : xs[0] }
// Las opciones de las casillas de prueba (lib/builder/ensayo.js camposDePrueba y aplicaPrueba) con los grupos enlazados.
export const opcionesCasillas = (def, valores = {}, sueltos = new Set()) => { let grupos = []; try { grupos = gruposDe(def, valores, sueltos) } catch (_) {} return { grupos, nombreFamilia: NOMBRE_FAMILIA, dondeGrupo } }
export const AYUDA_ENLACE = 'Las filas que usan el mismo indicador con los mismos números van ENLAZADAS (🔗): cambiar un número en una lo cambia en todas, y en el gráfico se dibuja una sola línea. Pulsa 🔗 en una fila para soltarla y darle números propios: se dibuja su línea aparte, con su leyenda. Vuelve a pulsarlo para enlazarla otra vez (toma los números del grupo). Ejemplo: «SuperTrend 10/3» entra cuando el SuperTrend (10, 3) cambia a alcista, sale cuando cambia a bajista y pone el stop en su línea: las tres van enlazadas. Si quieres entrar con uno rápido (10/3) y salir con uno más lento (10/5), suelta la fila de «Vendo» y ponle 5 de multiplicador.'
