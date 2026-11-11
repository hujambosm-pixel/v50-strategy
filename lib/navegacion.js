// lib/navegacion.js — el botón «← Atrás» de la barra de arriba (docs/builder.md §124; pedido por Sergi el 11/11). Lógica PURA.
// Cada vez que se cambia de sección (Screener, Tesis, Builder, Watchlist…), se apunta de dónde se venía; «← Atrás» vuelve a la
// última apuntada y la quita. Solo secciones (no las pestañas de dentro), solo «atrás» (sin «adelante») y las últimas MAX_ATRAS.

// Los nombres del menú de la izquierda (pages/index.js), para el tooltip «Volver a: …».
export const NOMBRE_SECCION = Object.freeze({
  builder: 'Builder', config: 'Backtest de un valor', editor: 'Editor', alarms: 'Alertas', watchlist: 'Watchlist', tesis: 'Tesis',
  fundamentals: 'Fundamentals', screener: 'Screener', multi: 'Backtesting', optimiza: 'Optimización', tradelog: 'TradeLog', risk: 'Risk Mgmt',
})
export const MAX_ATRAS = 20

// Al pasar de la sección `de` a la sección `a`: apunta `de` (si es otra; sin repetir la última) y deja solo las últimas MAX_ATRAS.
export function apuntaAtras(pila, de, a) {
  if (!de || de === a) return pila
  const p = pila[pila.length - 1] === de ? pila : [...pila, de]
  return p.length > MAX_ATRAS ? p.slice(-MAX_ATRAS) : p
}
// «← Atrás» estando en `actual`: { destino, pila } (la pila sin el destino ni lo que repita la sección de ahora); destino null si
// no hay adonde volver.
export function vuelveAtras(pila, actual) {
  const p = [...pila]
  while (p.length && p[p.length - 1] === actual) p.pop()
  const destino = p.pop() ?? null
  return { destino, pila: p }
}
// El tooltip del botón.
export const textoAtras = (pila, actual) => {
  const { destino } = vuelveAtras(pila, actual)
  return destino ? `Volver a: ${NOMBRE_SECCION[destino] || destino}` : 'Aún no hay una sección anterior'
}
