// lib/builder/vistaPlan.js — lo que la pantalla del plan dice de una VISTA DEL SCREENER usada como valores (docs/builder.md §275).
// Puro: los filtros de la vista en una línea, cuántos valores hay cada semana y los avisos.
import { FILTROS } from '../screener/filtros'
import { textoEncendido } from '../screener/opciones'
import { normalizaVista } from '../screener/vista'
import { avisoNoSeAplica } from '../replay/vistaReplay'
import { universoDeSemanas } from '../planes/vistaUniverso'

// La primera foto del screener que se pide (si las fotos empiezan más tarde, /api/replay-vista lo dice y se pide desde su primera).
export const DESDE_FOTOS = '2011-01-03'

// Los filtros encendidos de la vista, como en la línea de encendidos del screener: ['ROCE ≥ 25 %', …], y los sectores que quita.
export function filtrosDeVista(vista) {
  const v = normalizaVista(vista || {})
  const filtros = FILTROS.filter(f => !f.proximamente && v.filtros[f.id]?.on).map(f => `${f.columna || f.nombre} ${textoEncendido(f, v.filtros[f.id])}`)
  return { filtros, sectoresFuera: (v.sectoresFuera || []).length }
}
export function lineaFiltros(vista) {
  const { filtros, sectoresFuera } = filtrosDeVista(vista)
  const partes = [...filtros, ...(sectoresFuera ? [`sin ${sectoresFuera} sector${sectoresFuera === 1 ? '' : 'es'}`] : [])]
  return partes.length ? partes.join(' · ') : 'Ningún filtro encendido'
}

// Cuántos valores pasan cada semana del periodo (el menor y el mayor) y cuántos distintos.
export function cuentaVista(semanas, desde, hasta) {
  const u = universoDeSemanas(semanas, desde, hasta)
  const n = (semanas || []).filter(([l], k, s) => (s[k + 1]?.[0] ?? '9999-12-31') > desde && l <= hasta).map(s => new Set(s[1]).size)
  return { distintos: u.simbolos.length, semanas: n.length, min: n.length ? Math.min(...n) : 0, max: n.length ? Math.max(...n) : 0 }
}
export const textoCuenta = (c) => !c.semanas ? '' : `Cada lunes, entre ${c.min} y ${c.max} valores · ${c.distintos} distintos en el periodo`

// El filtro que no se aplica en todo el periodo (el PEG esperado antes de junio de 2024), con el texto del Replay.
export function avisoVista(datos) {
  if (!datos || datos.error || !(datos.noSeAplican || []).length) return null
  const nombre = (id) => { const f = FILTROS.find(x => x.id === id); return f ? (f.columna || f.nombre) : id }
  return avisoNoSeAplica(datos.noSeAplican, datos.seAplicaDesde || {}, nombre) || null
}

export const AYUDA_VISTA = 'Cada LUNES, los valores que se pueden comprar son los que pasaban esta vista del screener con lo que se sabía ese día (las cuentas publicadas hasta entonces y los precios hasta el viernes). La estrategia decide cuándo comprar y cuándo vender: lo comprado se queda aunque el valor salga de la lista. Si la señal de la estrategia es «de estado» (p. ej. «cierre por encima de su media»), compra en cuanto el valor entra en la lista si se sigue cumpliendo. Se usa la vista tal como está ahora en el screener: si la cambias allí, el plan cambia. Límites: no hay datos antes de 2011 y solo están las empresas que existen hoy (faltan las que desaparecieron), así que el pasado sale algo mejor de lo que fue. Ejemplo: la vista «Empresas con poca deuda» deja pasar 25 valores el lunes 05/03/2018; si «Sigue la tendencia» da señal en 3 de ellos esa semana, solo esos 3 se pueden comprar.'
