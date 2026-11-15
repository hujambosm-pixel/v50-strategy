// lib/builder/filtrosPlan.js — lo que pinta la caja «Filtros · cuándo se puede comprar» del bloque del plan
// (components/FiltrosDelPlan.js; docs/builder.md §152). Puro: no toca la red ni React.
//
// Los filtros del plan se guardan en el ajuste `filtros` (lib/builder/planPantalla.js, §150): null = el plan no cambia nada, o
// { propios?: false, filas: [{ quien, si, velas? }] }. Aquí, el paso de esas filas a las FILAS DE PANTALLA del creador de estrategias
// ({ cond, env } de lib/builder/tarjetas.js, con `quien` y `velas`) y la vuelta, los filtros propios de la estrategia (su «Solo opero
// cuando…»), el aviso de una fila repetida, la línea «La estrategia, tal como la usa este plan» y los textos de los «?».
import { filaDe, envuelve, leeFiltro, filaNueva, soloDelValor, INDICES, nombreQuien, fraseFila, erroresFila } from './tarjetas'
import { filtrosDelPlan } from './planPantalla'
import { jsonCanonico } from '../lotesLab'
import { valoresDe } from '../editor/definicion'

// La opción «Otro símbolo…» del selector «De quién» (no es un símbolo: abre el buscador).
export const OTRO = '__otro__'
const params = (p) => { try { return typeof p === 'string' ? JSON.parse(p || '{}') : (p || {}) } catch (_) { return {} } }

// ── Las filas del plan, en pantalla ──
// Cada fila guardada { quien, si, velas? } como fila de pantalla { cond, env, quien, velas: 'semanal' | null }. Una que no sea una fila
// del creador (no debería haberlas: todas nacen aquí) se conserva tal cual: { rara: true, quien, si, velas }.
export const filasDePantalla = (filtros) => (Array.isArray(filtros?.filas) ? filtros.filas : []).map(r => {
  const f = filaDe(r?.si), velas = r?.velas === 'semanal' ? 'semanal' : null
  return f ? { ...f, quien: r.quien, velas } : { rara: true, quien: r?.quien, si: r?.si, velas }
})
export const respetaPropios = (filtros) => filtros?.propios !== false
// Lo que se guarda en el ajuste `filtros`: null si el plan no cambia nada (un plan sin filtros es el de siempre).
export const guardaFiltros = (filas, propios = true) => filtrosDelPlan({ filtros: { propios: propios !== false, filas: filas.map(f => ({ quien: f.quien, si: f.rara ? f.si : envuelve(f), ...(f.velas === 'semanal' ? { velas: 'semanal' } : {}) })) } })
// La fila nueva de una condición del catálogo: en «Este valor» si solo se puede mirar en el valor; si no, en el Nasdaq-100 (QQQ), como en
// el creador. Con las velas del plan.
export const filaNuevaPlan = (clave) => ({ ...filaNueva(clave), quien: soloDelValor(clave) ? 'valor' : INDICES[0].t, velas: null })

// ── De quién ──
// «Este valor», los cuatro índices, el símbolo que ya lleve la fila (si es otro) y «Otro símbolo…».
export const opcionesQuienPlan = (actual) => [
  { v: 'valor', t: 'Este valor' }, ...INDICES.map(i => ({ v: i.t, t: i.nombre })),
  ...(actual && actual !== 'valor' && !INDICES.some(i => i.t === actual) ? [{ v: actual, t: nombreQuien(actual) }] : []),
  { v: OTRO, t: 'Otro símbolo…' }]

// ── Con qué velas se mira una fila ──
// Con el plan en velas diarias, cada fila elige: diarias o semanales (la semana ya cerrada). Con el plan en semanales, todas semanales.
// La fuerza relativa frente al Nasdaq-100 solo existe en velas diarias: no se ofrece en semanales.
export const soloDiaria = (f) => !f.rara && f.cond?.c === 'fuerzaRelativaPercentil'
export const intervaloFila = (f, velasPlan) => velasPlan === 'semanales' || f.velas === 'semanal' ? 'semanal' : 'diario'

// ── Los filtros propios de la estrategia ──
// { hay, separables, filas: [{ cond, env, quien }], valores, frases: [texto] }. separables = se pueden apagar en el plan (las
// estrategias hechas con las tarjetas). valores: los números de la estrategia (los «$parámetros» de sus filas).
export function filtrosPropios(estrategia) {
  const def = estrategia?.definition
  if (!def) return { hay: false, separables: false, filas: [], valores: {}, frases: [] }
  let valores = {}
  try { valores = valoresDe(def, params(estrategia.params)) } catch (_) {}
  let r = { ok: false, filas: [] }
  try { r = leeFiltro(def) } catch (_) {}
  const frases = r.filas.map(f => { try { return mayuscula(fraseFila(f, valores, {}, f.quien)) } catch (_) { return nombreQuien(f.quien) } })
  return { hay: r.ok ? r.filas.length > 0 : !!def.filtroMercado, separables: r.ok, filas: r.filas, valores, frases }
}
const mayuscula = (t) => t.charAt(0).toUpperCase() + t.slice(1)
// La frase de una fila del plan (para avisos y para la pregunta).
export const fraseFilaPlan = (f) => { if (f.rara) return 'una condición'; try { return mayuscula(fraseFila(f, {}, {}, f.quien)) } catch (_) { return nombreQuien(f.quien) } }
// Los errores de cada fila del plan (los mismos del creador): [{ clave: frase }].
export const erroresFilasPlan = (filas) => filas.map(f => { if (f.rara) return {}; try { return erroresFila(f, {}, null, f.quien) } catch (_) { return {} } })

// ── Una fila del plan igual que una de la estrategia (no hace nada) ──
// Solo cuenta si los filtros de la estrategia se respetan y la fila se mira con las velas del plan.
export function filasRepetidas(filas, propios, respeta = true) {
  if (!respeta || !propios?.filas?.length) return []
  const clave = (f, valores) => { try { return jsonCanonico([f.quien, envuelve({ cond: { ...f.cond, p: Object.fromEntries(Object.entries(f.cond.p || {}).map(([k, v]) => [k, typeof v === 'string' && v.startsWith('$') ? valores[v.slice(1)] : v])) }, env: f.env })]) } catch (_) { return null } }
  const suyas = new Set(propios.filas.map(f => clave(f, propios.valores)).filter(Boolean))
  return filas.map((f, k) => !f.rara && f.velas !== 'semanal' && suyas.has(clave(f, {})) ? k : -1).filter(k => k >= 0)
}

// ── «La estrategia, tal como la usa este plan» ──
// Las partes de la línea: [{ t, azul }] (azul = lo que el plan cambia respecto a la estrategia guardada).
export function usoDeLaEstrategia({ nombre, velasEst, velasPlan, donde, propios, respeta, nPlan }) {
  const n = propios?.filas?.length || 0, f = (k) => `${k} filtro${k === 1 ? '' : 's'}`
  return [
    { t: nombre || 'sin estrategia' },
    velasPlan !== velasEst ? { t: `velas ${velasPlan} (creada en ${velasEst})`, azul: true } : { t: `velas ${velasPlan}` },
    { t: donde },
    !propios?.hay ? (nPlan ? null : { t: 'sin filtros' }) : !respeta ? { t: n ? `sin sus ${f(n)} propio${n === 1 ? '' : 's'}` : 'sin sus filtros propios', azul: true } : { t: n ? `con sus ${f(n)}` : 'con sus filtros' },
    nPlan ? { t: `+ ${f(nPlan)} del plan`, azul: true } : null,
  ].filter(Boolean)
}

// ── Textos ──
export const AYUDA_FILTROS_PLAN = 'Un filtro no vende lo que ya tienes: solo impide COMPRAR mientras no se cumple. Los de la estrategia son su «Solo opero cuando…»; los que añadas aquí valen solo para este plan (la estrategia guardada no cambia) y funcionan igual: forman parte de la señal de compra. '
  + 'Por eso depende de cómo sea la señal. Si es «de un momento» (un cruce, una ruptura) y ese día el filtro no se cumple, esa compra se pierde y se espera a la siguiente señal. Si es «de estado» (por ejemplo, «el cierre está por encima de su media») compra en cuanto el filtro deja de bloquear, si la señal sigue cumpliéndose. '
  + 'Ejemplo con el filtro «Nasdaq-100 (QQQ): cierre por encima de su SMA (200)»: el 3 de marzo tu estrategia da señal, pero el QQQ cierra a 480 con su media en 500 → no compra. El 20 de marzo el QQQ cierra a 505, por encima de su media: una estrategia «de cruce» sigue sin comprar (su cruce fue el día 3) y espera al cruce siguiente; una «de estado» compra a la apertura del día 21.'
export const AYUDA_PROPIOS = '«Se respetan»: para comprar se tienen que cumplir los filtros de la estrategia Y los que añadas en este plan. «No se aplican»: este plan calcula sin los filtros de la estrategia, solo con los añadidos aquí. La estrategia guardada no cambia. Ejemplo: la estrategia lleva «QQQ por encima de su SMA (200)»; con «No se aplican» y ningún filtro añadido, el plan compra también cuando el QQQ está por debajo de su media.'
export const AYUDA_QUIEN_PLAN = '«Este valor»: la condición se mira en cada valor que se va a comprar. ' + INDICES.map(i => i.ayuda).join(' ') + ' «Otro símbolo…»: cualquier valor con precios guardados (por ejemplo, el oro, GLD). Un filtro solo decide si se puede comprar; no obliga a vender.'
export const AYUDA_VELAS_FILA = 'Con qué velas se mira este filtro. «Diarias»: al cierre de cada día. «Semanales»: con la última semana ya cerrada, que vale desde el lunes siguiente. Ejemplo: «cierre por encima de su SMA (40)» en semanales mira la media de 40 semanas (unos 9 meses); si la semana del 2 al 6 de marzo cierra por encima, el filtro se cumple del lunes 9 al viernes 13.'
export const TEXTO_SOLO_DIARIA = 'La fuerza relativa frente al Nasdaq-100 solo se calcula con velas diarias.'
