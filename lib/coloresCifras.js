// lib/coloresCifras.js — los colores de las cifras de una estrategia (V9.1073; docs/builder.md, §39). Salen de la tabla RESUMEN de
// «Backtest de un valor» (buildUnifiedRows, pages/index.js) y los usan también las cifras del paso 1 del Builder («Señales en el
// gráfico», components/BuilderSenales.js), en las dos columnas («Tu regla» y «Comprar y mantener»). Solo colores: ninguna cuenta.
//   · CAGR, Ganancia y la rentabilidad del periodo: verde si es ≥ 0, rojo si es negativa.
//   · Max Drawdown: siempre rojo. Pérdida media, roja; ganancia media, verde.
//   · Win Rate: verde desde el 50 %. Factor de beneficio: verde desde 1.
//   · Operaciones y Tiempo invertido: amarillo.
export const COLOR_SUBE = '#00e5a0', COLOR_BAJA = '#ff4d6d', COLOR_CUENTA = '#ffd166'
export const colorSigno = (v) => v >= 0 ? COLOR_SUBE : COLOR_BAJA
export const colorWinRate = (wr) => wr >= 50 ? COLOR_SUBE : COLOR_BAJA
export const colorFactor = (f) => f >= 1 ? COLOR_SUBE : COLOR_BAJA
export const COLOR_DRAWDOWN = COLOR_BAJA, COLOR_OPERACIONES = COLOR_CUENTA, COLOR_TIEMPO = COLOR_CUENTA
// El «?» de la fila «Max Drawdown» (las dos pantallas).
export const AYUDA_MAX_DD = 'La mayor caída desde un máximo hasta un mínimo posterior, contando cada día lo que vale la operación abierta (vela a vela). Ej.: compras a 100, sube a 120, baja a 90 y vendes a 110 → Max Drawdown −25 %.'
