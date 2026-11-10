// lib/screener/vista.js — el formato de una VISTA del screener (lo que se guarda en public.screener_vistas.vista) y las
// vistas de ejemplo (docs/screener.md). Lógica PURA.
//
// Formato 1: { tipo: 'vista_screener', version: 1, universo: { sp500, ndx, listas }, sectoresFuera: [sector…],
//   filtros: { id: { on, op, valor } } (todos los del catálogo que se pueden encender), pegRazonable: 2 }.
// Lo que no se guarda (es de la pantalla): el orden de la tabla, el buscador y «ver también los que no pasan».
import { FILTROS_ACTIVOS } from './filtros'
import { SECTORES_FUERA_POR_DEFECTO } from './sectores'

export const PEG_RAZONABLE = 2

// Una vista nueva: todos los filtros apagados con sus valores por defecto; `on` = ids encendidos; `valores` y `ops` cambian
// los de algunos filtros.
export function vistaNueva({ on = [], valores = {}, ops = {}, sectoresFuera = SECTORES_FUERA_POR_DEFECTO } = {}) {
  const filtros = {}
  for (const f of FILTROS_ACTIVOS) filtros[f.id] = { on: on.includes(f.id), op: ops[f.id] || f.op || null, valor: valores[f.id] ?? (f.valor ?? null) }
  return { tipo: 'vista_screener', version: 1, universo: { sp500: true, ndx: true, listas: true }, sectoresFuera: [...sectoresFuera], filtros, pegRazonable: PEG_RAZONABLE }
}

// Las vistas de ejemplo (decididas con Sergi el 08/11, nombres genéricos). «Rentabilidad y poca deuda» lleva en el boceto
// también «Precio por encima de la EMA 200», que llega con el piso técnico.
export const VISTAS_EJEMPLO = [
  { nombre: 'Rentabilidad y poca deuda', vista: vistaNueva({ on: ['roce', 'roa', 'roeMejora', 'cajaCubre', 'cobInt'] }) },
  { nombre: 'Crecer a buen precio', vista: vistaNueva({ on: ['ventas5', 'fcf', 'de', 'pegEsp'], valores: { de: 0.5, pegEsp: 1 } }) },
  { nombre: 'Alerta de precio caro', vista: vistaNueva({ on: ['per', 'pegEsp'], valores: { per: 30, pegEsp: 3 }, ops: { per: '≥', pegEsp: '≥' }, sectoresFuera: [] }) },
]

// Completa una vista leída (de la base o de una versión anterior) con lo que le falte, sin cambiar lo que tiene: así un
// filtro nuevo del catálogo aparece apagado en las vistas viejas.
export function normalizaVista(v) {
  const base = vistaNueva({ sectoresFuera: Array.isArray(v?.sectoresFuera) ? v.sectoresFuera : SECTORES_FUERA_POR_DEFECTO })
  const filtros = { ...base.filtros }
  for (const [id, c] of Object.entries(v?.filtros || {})) if (filtros[id]) filtros[id] = { ...filtros[id], ...c }
  return { ...base, universo: { ...base.universo, ...(v?.universo || {}) }, filtros, pegRazonable: Number(v?.pegRazonable) > 0 ? Number(v.pegRazonable) : PEG_RAZONABLE }
}

// Para «cambios sin guardar»: la vista en texto canónico (claves ordenadas).
export function textoVista(v) {
  const ord = (x) => Array.isArray(x) ? x.map(ord) : x && typeof x === 'object' ? Object.fromEntries(Object.keys(x).sort().map(k => [k, ord(x[k])])) : x
  return JSON.stringify(ord(normalizaVista(v)))
}
