// lib/editor/piezas.js — las piezas nuevas que pone el editor en una definición (stops con sus valores por defecto). Puro.
// Las usan el editor de siempre (components/EditorPanel.js) y el editor por tarjetas del Builder (components/BuilderEditor.js),
// así que un stop elegido en cualquiera de los dos queda igual.
const copia = (x) => JSON.parse(JSON.stringify(x))

export const CAMPOS_STOP = {
  nivel: { de: [{ campo: 'low' }] }, minimoVelas: { n: 3 }, porcentaje: { pct: 8 }, atr: { k: 2, periodo: 14 },
  atrCompra: { k: 2, periodo: 14 }, minimoMovil: { n: 10 },   // V9.1055: las piezas de las Tortugas
  trailing: { si: { c: 'precioVsMedia', p: { tipo: 'EMA', periodo: 10, lado: 'debajo' } }, nivel: { campo: 'low', velas: 1 }, historial: 'siSube', fechaHistorial: 'vela' },
}
// Los stops fijos nuevos se anotan en el historial al entrar (stopHistory): así el gráfico y el guardián ven el stop que
// explica una salida, también la del mismo día de la entrada. En el motor 1 es una opción de cada stop (la 1 V50 y la 23 la
// usan como sus code_js), así que la pantalla la pone por defecto.
export const stopPorDefecto = (tipo, n) => ({ id: `${tipo}${n}`, tipo, motivo: tipo === 'trailing' ? 'trailing_exit' : 'stop', ...copia(CAMPOS_STOP[tipo]), ...(tipo === 'trailing' ? {} : { historialAlEntrar: true }) })
// Un stop nuevo al final de la lista (con un id que no esté usado) y el cambio de tipo de uno (conserva su id, motivo y activa).
export function anadeStop(stops, tipo) {
  const ids = stops.map(s => s.id).filter(Boolean)
  let n = stops.length + 1; while (ids.includes(`${tipo}${n}`)) n++
  return [...stops, stopPorDefecto(tipo, n)]
}
export const cambiaTipoStop = (s, tipo, k) => ({ ...stopPorDefecto(tipo, k + 1), id: s.id, motivo: s.motivo, activa: s.activa })
