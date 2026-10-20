// lib/editor/guardar.js — lo que se guarda de una estrategia del editor en `strategies` (docs/editor-visual.md, E5).
//
// La fila lleva la definición en `definition` (con tipo 'editor'), `code_js` a null y en `params` los VALORES de sus
// parámetros: los de la declaración, con los que mande el cliente encima. Si la orden de entrada es AL CIERRE, además
// `entradaAlCierre: true`, como la 1.4: el filtro de entrada y el gráfico lo leen de ahí (lib/filtroEntrada.js). La
// temporalidad de la estrategia (`intervalo`, el distintivo D/S) se conserva si viene. Una definición que no valide no se
// guarda: el servidor contesta 422 con sus errores.
import { validaDefinicion, valoresDe } from './definicion'
import { esDefinicionEditor } from './fuente'

export function preparaGuardado(definicion, guardados = {}) {
  if (!esDefinicionEditor(definicion)) return { ok: false, errores: ['No es una definición del editor.'] }
  const g = guardados && typeof guardados === 'object' ? guardados : {}
  const errores = validaDefinicion(definicion, g)
  if (errores.length) return { ok: false, errores }
  const params = valoresDe(definicion, g)
  if (definicion.entrada?.orden?.tipo === 'cierre') params.entradaAlCierre = true
  if (g.intervalo === 'diario' || g.intervalo === 'semanal') params.intervalo = g.intervalo
  return { ok: true, params }
}
