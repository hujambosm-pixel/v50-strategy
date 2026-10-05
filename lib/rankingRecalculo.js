// lib/rankingRecalculo.js — los filtros del ranking y el recálculo por tandas.
//
// DOS COSAS QUE ERAN LA MISMA. El ranking aplicaba los filtros que hubiera en la pantalla en ese
// momento, y no los guardaba: dos filas de `ranking_results` podían estar medidas con filtros
// distintos sin que nada lo dijera, y bastaba tener `indiceEma` encendido para explorar para que
// todo el ranking saliera filtrado. Ahora el ranking tiene SUS filtros —ninguno por defecto— y cada
// fila guarda con cuáles se calculó. Y en cuanto las filas llevan sus condiciones, se puede
// preguntar cuáles están al día, que es lo que hace falta para reanudar un recálculo interrumpido.
//
// POR QUÉ NINGUNO POR DEFECTO. Un filtro de mercado quita operaciones a TODAS las estrategias por
// igual, pero no en la misma proporción: una estrategia que entra poco y aguanta meses apenas lo
// nota, y una que entra cada semana se queda sin la mitad. El ranking sirve para elegir entre
// estrategias, así que el filtro deja de ser una condición común y pasa a ser parte de lo que se
// mide. Sin filtros se mide la estrategia; con filtros, la estrategia MÁS el filtro. Las dos cosas
// son legítimas, pero la primera es la que no sorprende.

import { mergeFiltros } from './filtros'
import { normalizaComisiones } from './comisiones'

// Ninguno. No es `null`: `mergeFiltros(null)` devuelve los dos filtros de siempre con `indiceEma`
// encendido —eso es lo que ve una instalación nueva en la pantalla— y aquí haría justo lo contrario
// de lo que se pretende. La lista vacía es legítima y `mergeFiltros` la respeta.
export const FILTROS_RANKING_DEFAULT = []

// Cuántos activos por tanda, cuántos días de desfase se toleran al buscar pendientes.
export const TANDA_DEFAULT = 25
export const DIAS_TOLERANCIA_DEFAULT = 7

// Los filtros con los que mide el ranking. Sin `rankingFiltrosPropios`, ninguno.
export function filtrosDelRanking(settings) {
  const r = settings && typeof settings === 'object' ? settings.ranking : null
  if (!r || !r.rankingFiltrosPropios) return []
  return mergeFiltros(Array.isArray(r.rankingFiltros) ? r.rankingFiltros : [])
}

export function tandaDelRanking(settings) {
  const n = Math.round(Number(settings?.ranking?.rankingTandaTam))
  return Number.isFinite(n) && n >= 1 && n <= 200 ? n : TANDA_DEFAULT
}
export function diasToleranciaDelRanking(settings) {
  const n = Math.round(Number(settings?.ranking?.rankingPendientesDias))
  return Number.isFinite(n) && n >= 0 && n <= 365 ? n : DIAS_TOLERANCIA_DEFAULT
}

// ── La huella de unas condiciones ─────────────────────────────────────────────────────────
//
// Lo que se compara para decidir si una fila está al día. Es una CADENA canónica, no el objeto: dos
// listas de filtros con los mismos filtros en otro orden, o con las claves de params en otro orden,
// son las mismas condiciones, y `JSON.stringify` diría que no. Así que se ordena todo antes.
const nf = (v) => { const n = Number(v); return Number.isFinite(n) ? Math.round(n * 1e6) / 1e6 : null }

export function huellaFiltros(lista) {
  const l = mergeFiltros(Array.isArray(lista) ? lista : [])
  const activos = l.filter(f => f.activo)
  if (!activos.length) return '-'
  return activos
    .map(f => f.tipo + '@' + f.ambito + ':' +
      Object.keys(f.params || {}).sort().map(k => k + '=' + f.params[k]).join(','))
    .sort().join('|')
}
export function huellaComisiones(c) {
  const n = normalizaComisiones(c)
  return nf(n.compra) + '/' + nf(n.venta) + '/' + nf(n.porcentaje)
}

// ── ¿Está esta fila al día? ───────────────────────────────────────────────────────────────
//
// EL PERIODO ES EL CASO RARO. `periodo_desde` y `periodo_hasta` son fechas absolutas que se calculan
// desde HOY («últimos 5 años»), así que una fila calculada ayer trae el periodo de ayer y comparar
// las fechas al día exacto dejaría TODO pendiente cada mañana. Lo que se compara es:
//   · que el periodo mida los años configurados (±4 días, que absorbe el día del mes y los bisiestos)
//   · que no esté más desfasado que `diasTolerancia` (7 por defecto)
// La tolerancia es el parámetro que decide qué significa «pendiente»: con 7 días, reanudar un
// recálculo interrumpido hace dos horas no repite nada, y volver dentro de un mes lo repite todo
// —que es lo correcto, porque con un mes más de precios las métricas ya no son las mismas—.
const DIA = 86400000
const DIAS_AÑO = 365.25
export function periodoAlDia(fila, { years, hoy = new Date(), diasTolerancia = DIAS_TOLERANCIA_DEFAULT }) {
  if (!fila?.periodo_desde || !fila?.periodo_hasta) return false
  const d = Date.parse(fila.periodo_desde + 'T00:00:00Z')
  const h = Date.parse(fila.periodo_hasta + 'T00:00:00Z')
  if (!Number.isFinite(d) || !Number.isFinite(h)) return false
  const largoDias = (h - d) / DIA
  if (Math.abs(largoDias - years * DIAS_AÑO) > 4) return false
  const hoyMs = Date.parse(hoy.toISOString().slice(0, 10) + 'T00:00:00Z')
  const desfase = (hoyMs - h) / DIA
  return desfase >= -1 && desfase <= diasTolerancia
}

// `cond` son las condiciones actuales del ranking, con la temporalidad YA resuelta para la
// estrategia de esa fila: es lo único que no es común, así que quien llama la pone.
export function filaAlDia(fila, cond, opts = {}) {
  if (!fila) return false
  if ((fila.intervalo || null) !== (cond.intervalo || null)) return false
  if (nf(fila.capital_ini) !== nf(cond.capitalIni)) return false
  if (huellaComisiones(fila.comisiones) !== huellaComisiones(cond.comisiones)) return false
  // `filtros` a null = fila vieja, de antes de que se guardaran: no se sabe con qué se calculó, así
  // que no está al día aunque hoy el ranking vaya sin filtros. No saberlo no es cumplirlo.
  if (fila.filtros == null) return false
  if (huellaFiltros(fila.filtros) !== huellaFiltros(cond.filtros)) return false
  return periodoAlDia(fila, { years: cond.years, hoy: opts.hoy, diasTolerancia: opts.diasTolerancia })
}

// ── Qué activos faltan ────────────────────────────────────────────────────────────────────
//
// Un activo está al día si tiene AL MENOS UNA fila al día. No se exige una por estrategia porque
// una fila solo se escribe si su estrategia llega al mínimo de operaciones: exigirlas todas dejaría
// pendiente para siempre a cualquier activo donde alguna estrategia no cualifique.
//
// EL LÍMITE DE ESTO, dicho claro: un activo donde NINGUNA estrategia cualifica no tiene ninguna
// fila, y desde `ranking_results` no se puede distinguir de uno que no se ha calculado nunca. Sale
// como pendiente siempre. Se recalculará cada vez, costando sus peticiones y sin dejar rastro.
export function activosPendientes(filas, simbolos, cond, opts = {}) {
  const alDia = new Set()
  for (const f of filas || []) {
    const sym = (f.symbol || '').toUpperCase()
    if (!sym || alDia.has(sym)) continue
    // La temporalidad de la fila es la que declara SU estrategia. Se acepta la que traiga la fila
    // mientras coincida con la de esa estrategia; quien llama pasa el mapa.
    const iv = opts.intervaloDe ? opts.intervaloDe(f.strategy_id) : f.intervalo
    if (iv == null) continue            // estrategia desaparecida o deshabilitada: la fila no cuenta
    if (filaAlDia(f, { ...cond, intervalo: iv }, opts)) alDia.add(sym)
  }
  return (simbolos || []).filter(s => !alDia.has((s || '').toUpperCase()))
}

// ── Tandas ────────────────────────────────────────────────────────────────────────────────
export function enTandas(lista, tamano) {
  const n = Math.max(1, Math.round(Number(tamano) || TANDA_DEFAULT))
  const out = []
  for (let i = 0; i < (lista || []).length; i += n) out.push(lista.slice(i, i + n))
  return out
}

export default {
  FILTROS_RANKING_DEFAULT, TANDA_DEFAULT, DIAS_TOLERANCIA_DEFAULT,
  filtrosDelRanking, tandaDelRanking, diasToleranciaDelRanking,
  huellaFiltros, huellaComisiones, periodoAlDia, filaAlDia, activosPendientes, enTandas,
}
