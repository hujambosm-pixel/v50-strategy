// lib/editor/fuente.js — lo que el motor ejecuta de una fila de `strategies` (docs/editor-visual.md, E4).
//
// Una estrategia es su `code_js` (texto) o, si su columna `definition` es una definición del editor ({ tipo: 'editor' }),
// la FUENTE { definicion }. El motor pasa esa fuente por donde antes pasaba el texto: los dos sitios que compilan run()
// (lib/backtestActivo.js y runCodeJsAsset en pages/api/multibacktest.js) y esquemaDeCodigo (lib/parametrosEstrategia.js)
// la reconocen y usan el intérprete (lib/editor/interprete.js), que devuelve lo mismo que run(). Una fila sin definición del
// editor sigue siendo su code_js, exactamente como antes.
import { interpreta } from './interprete'

export const esDefinicionEditor = (d) => !!d && typeof d === 'object' && d.tipo === 'editor'
export const esFuenteEditor = (f) => !!f && typeof f === 'object' && esDefinicionEditor(f.definicion)
// La fuente de una fila: { definicion } o su code_js (o null).
export const fuenteDeFila = (row) => esDefinicionEditor(row?.definition) ? { definicion: row.definition } : (row?.code_js || null)
// El run() de una fuente del editor, con su declaración de parámetros (run.parametros) y el contexto (velas de referencia).
export function runDeEditor(fuente, ctx = {}) {
  const run = (bars, params) => interpreta(fuente.definicion, bars, params || {}, ctx)
  run.parametros = fuente.definicion.parametros || { version: 1, lista: [] }
  return run
}
// El ticker del filtro de mercado de una fuente del editor (para descargar sus velas), o null.
export const tickerFiltroMercado = (f) => esFuenteEditor(f) ? (f.definicion.filtroMercado?.ticker || null) : null
