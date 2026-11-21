// lib/alertas/pantalla.js — lo que la PANTALLA de alertas necesita y no depende de React (docs/builder.md §218): la frase «Así se lee»,
// lo que le falta al precio para llegar, el resumen corto de cada alerta y las líneas del gráfico. Puro.
import { fmt, filasDe, sentidoToca } from './motor'
import { fraseFilasRegla } from '../builder/reglasPesos'

const num = (x) => typeof x === 'number' && Number.isFinite(x)
const pct = (x) => (Number.isInteger(x) ? String(x) : fmt(x))
export const fechaEs = (f) => (typeof f === 'string' && /^\d{4}-\d{2}-\d{2}/.test(f) ? `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}` : '')

// El resumen corto (lista de alertas): «Toca 235,00» · «Cierra por debajo de 205,00» · «Se mueve un 3 % en el día» · «Condición: …».
export function resumenAlerta(a) {
  const r = a?.regla || {}
  if (a?.tipo === 'toca') return `Toca ${fmt(r.nivel)}`
  if (a?.tipo === 'cierra') return `Cierra por ${r.lado === 'debajo' ? 'debajo' : 'encima'} de ${fmt(r.nivel)}`
  if (a?.tipo === 'movimiento') return `${r.sentido === 'sube' ? 'Sube' : r.sentido === 'baja' ? 'Cae' : 'Se mueve'} un ${pct(r.pct)} % en el día`
  if (a?.tipo === 'condicion') return fraseFilasRegla(filasDe(a)).replace(/^./, c => c.toUpperCase())
  return 'Señal de una estrategia'
}
export const TEXTO_DESPUES = Object.freeze({ una_vez: 'una vez', una_al_dia: 'una vez al día', cada_vez: 'cada vez' })
export const CUANDO_SE_MIRA = Object.freeze({ toca: 'cada 15 min', movimiento: 'cada 15 min', cierra: 'al cierre', condicion: 'al cierre', estrategia: 'al cierre' })

// «Así se lee»: la frase que dice exactamente cuándo saltará.
export function asiSeLee(a) {
  const r = a?.regla || {}, s = a?.simbolo || '…'
  let t
  if (a?.tipo === 'toca') t = num(r.nivel) ? `Avisa cuando ${s} ${r.sentido === 'baja' ? 'baje' : 'suba'} hasta ${fmt(r.nivel)} (basta con que el ${r.sentido === 'baja' ? 'mínimo' : 'máximo'} del día llegue a ese precio, aunque sea un momento). Se mira cada 15 minutos mientras cotiza.` : 'Pon el precio.'
  else if (a?.tipo === 'cierra') t = num(r.nivel) ? `Avisa cuando ${s} cierre por ${r.lado === 'debajo' ? 'debajo' : 'encima'} de ${fmt(r.nivel)} (cuenta solo el cierre: si lo pasa durante el día y cierra al otro lado, no salta). Se mira al cierre.` : 'Pon el precio.'
  else if (a?.tipo === 'movimiento') t = num(r.pct) ? `Avisa cuando ${s} ${r.sentido === 'sube' ? 'suba' : r.sentido === 'baja' ? 'caiga' : 'suba o caiga'} un ${pct(r.pct)} % o más desde el cierre de ayer (ej.: ayer cerró en 100,00 → salta a ${r.sentido === 'sube' ? fmt(100 + r.pct) : fmt(100 - r.pct)}${r.sentido === 'ambos' ? ` o a ${fmt(100 + r.pct)}` : ''}). Se mira cada 15 minutos mientras cotiza.` : 'Pon el %.'
  else if (a?.tipo === 'condicion') t = `Avisa al cierre del día en que se cumpla: ${fraseFilasRegla(filasDe(a))}.`
  else t = 'Llegará más adelante.'
  const d = a?.despues === 'cada_vez' ? ' Después vuelve a avisar cada vez que vuelva a pasar (primero tiene que dejar de cumplirse).'
    : a?.despues === 'una_al_dia' ? ' Después puede volver a avisar al día siguiente, si se sigue cumpliendo.'
    : ' Avisa una vez y se apaga.'
  const c = a?.caduca ? ` Caduca después del ${fechaEs(a.caduca)}.` : ''
  return t + d + c
}

// Lo que le falta al precio de ahora para llegar al nivel, en %: (nivel − ahora) ÷ ahora. null si no hay nivel o precio.
export function distancia(a, ahora) {
  const n = a?.regla?.nivel
  return (a?.tipo === 'toca' || a?.tipo === 'cierra') && num(n) && num(ahora) && ahora > 0 ? (n - ahora) / ahora * 100 : null
}
export const textoDistancia = (d) => (d == null ? '' : `${d > 0 ? '+' : d < 0 ? '−' : ''}${fmt(Math.abs(d))} %`)

// Las líneas del gráfico (CandleChart, prop priceAlarms): las alertas ENCENDIDAS de precio («toca» y «cierra») de ese valor, con la forma de
// las alarmas de siempre ({ id, symbol, price_level, condition_detail }). Verde si avisa al subir, roja al bajar.
export const lineasDeAlertas = (alertas, simbolo) => (alertas || [])
  .filter(a => a.activa && (a.tipo === 'toca' || a.tipo === 'cierra') && num(a.regla?.nivel) && String(a.simbolo).toUpperCase() === String(simbolo || '').toUpperCase())
  .map(a => ({ id: a.id, symbol: a.simbolo, price_level: a.regla.nivel, condition_detail: (a.tipo === 'toca' ? a.regla.sentido === 'sube' : a.regla.lado === 'encima') ? 'price_above' : 'price_below', nueva: true }))

// Al arrastrar la línea: el nivel nuevo; en «toca», si cruza al otro lado del precio de ahora, la dirección cambia sola.
export function reglaArrastrada(a, nivel, ahora) {
  if (a.tipo === 'toca') return { ...a.regla, nivel, sentido: sentidoToca(nivel, ahora) || a.regla.sentido }
  return { ...a.regla, nivel }
}

// Una alerta nueva en blanco para la ventana: «Toca el precio» en el precio pulsado (o el de ahora), «una vez».
export function alertaNueva(simbolo, precio, ahora) {
  const nivel = num(precio) ? Math.round(precio * 100) / 100 : num(ahora) ? Math.round(ahora * 100) / 100 : null
  return { simbolo: String(simbolo || '').toUpperCase(), tipo: 'toca', regla: { nivel, sentido: sentidoToca(nivel, ahora) || 'sube' }, despues: 'una_vez', activa: true, caduca: null, nota: null }
}
