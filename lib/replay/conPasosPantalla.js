// lib/replay/conPasosPantalla.js — la «Condición con pasos» en la ventana de la señal del Replay (docs/builder.md §244; boceto
// bocetos/condiciones-con-pasos.html, pestaña 1). PURO: textos, la condición nueva, los ejemplos, las opciones que valen en cada
// momento y el arreglo tras cada cambio (ajustaConPasos), para que lo que sale de la ventana pase siempre validaConPasos
// (lib/condiciones/conPasos.js) salvo lo que el usuario tiene que escribir (un %, una condición).
import { fraseFilasRegla } from '../builder/reglasPesos'
import { nombreQuien } from '../builder/tarjetas'

export const SECCIONES = Object.freeze(['mientras', 'paso1', 'paso2', 'anula'])
export const MOV_TEXTO = Object.freeze([['cae', 'cae un'], ['sube', 'sube un'], ['mueve', 'se mueve un']])
export const REF_TEXTO = Object.freeze({
  maxHist: 'su máximo histórico', maxTramo: 'el máximo del tramo', minTramo: 'el mínimo del tramo',
  maxSenal: 'el máximo desde la última señal', minSenal: 'el mínimo desde la última señal',
  senal: 'el precio de la última señal', paso1: 'el precio del paso 1', compra: 'tu última compra (Replay)',
})

// Desde dónde se puede medir un movimiento en cada sección (en «Mientras…» no hay movimientos).
export function referenciasPara(seccion, def) {
  if (seccion === 'mientras') return []
  const r = ['maxHist']
  if (def?.mientras) r.push('maxTramo', 'minTramo')
  r.push('maxSenal', 'minSenal', 'senal')
  if (seccion === 'paso2' || seccion === 'anula') r.push('paso1')
  r.push('compra')
  return r
}

// «Vuelve a empezar»: las opciones que valen (las mismas reglas que validaConPasos). [] = no se pregunta (vale «nunca»).
export function opcionesEmpieza(def) {
  if (def?.veces === 'primera') return [
    ...(def.paso2 ? [['paso1', 'con el siguiente paso 1']] : []), ...(def.mientras ? [['tramo', 'con un tramo nuevo']] : []), ['maxHist', 'con un máximo histórico nuevo']]
  if (def?.paso2) return [['maxHist', 'con un máximo histórico nuevo'], ['nunca', 'nunca']]
  return []
}

export const filaMovimientoNueva = (quien, desde = 'maxHist') => ({ mov: 'cae', pct: 10, desde, quien })
export const conPasosNueva = (sim) => ({ version: 1, mientras: null, paso1: { filas: [filaMovimientoNueva(sim)] }, paso2: null, anula: null, veces: 'cada', empieza: 'nunca' })

// Tras cada cambio: lo que ya no tiene sentido se quita o se pone en su valor más cercano.
export function ajustaConPasos(d) {
  const def = { version: 1, mientras: null, paso2: null, anula: null, ...d }
  if (!def.paso2) {
    def.anula = null
    if (def.paso1 && 'daSenal' in def.paso1) { const { daSenal, ...p } = def.paso1; def.paso1 = p }
  }
  if (def.mientras) def.mientras = { filas: (def.mientras.filas || []).filter(f => f && f.mov === undefined) }
  for (const k of ['paso1', 'paso2', 'anula']) {
    if (!def[k]) continue
    const ok = referenciasPara(k, def)
    def[k] = { ...def[k], filas: (def[k].filas || []).map(f => f && f.mov !== undefined && !ok.includes(f.desde) ? { ...f, desde: 'maxHist' } : f) }
  }
  if (!['cada', 'primera'].includes(def.veces)) def.veces = 'cada'
  const ops = opcionesEmpieza(def).map(o => o[0])
  if (!ops.length) def.empieza = 'nunca'
  else if (!ops.includes(def.empieza)) def.empieza = ops[0]
  return def
}

const num = (x) => Number.isFinite(x) ? x.toLocaleString('es-ES', { maximumFractionDigits: 2 }) : '¿?'
// Una fila de movimiento en palabras: «el cierre de AAPL cae un 10 % desde su máximo histórico».
export function fraseMovimiento(f) {
  const m = (MOV_TEXTO.find(x => x[0] === f.mov) || MOV_TEXTO[0])[1]
  return `el cierre de ${nombreQuien(f.quien)} ${m} ${num(f.pct)} %${f.mov === 'mueve' ? ' (arriba o abajo)' : ''} desde ${REF_TEXTO[f.desde] || '¿?'}`
}
// Las filas de un paso (del catálogo o de movimiento), unidas con «y» / «o».
export function fraseFilasPasos(filas) {
  return (filas || []).map((f, k) => {
    const { union, ...sola } = f || {}
    const t = sola.mov !== undefined ? fraseMovimiento(sola) : fraseFilasRegla([sola])
    return `${k ? (union === 'O' ? ' o ' : ' y ') : ''}${t}`
  }).join('') || '…'
}

// «Así se lee» (como lee() del boceto), en texto llano.
export function fraseConPasos(def) {
  if (!def?.paso1) return ''
  const vez = def.veces === 'primera' ? 'la primera vez que' : 'cada vez que'
  let t = def.mientras ? `Mientras ${fraseFilasPasos(def.mientras.filas)}: ` : ''
  t += def.paso2
    ? `primero, ${fraseFilasPasos(def.paso1.filas)}${def.paso1.daSenal ? ' (y ya da señal)' : ''}; después, ${vez} ${fraseFilasPasos(def.paso2.filas)} → señal.`
    : `${vez} ${fraseFilasPasos(def.paso1.filas)} → señal.`
  if (def.anula && def.paso2) t += ` Si antes ${fraseFilasPasos(def.anula.filas)}, se olvida el paso 1.`
  if (def.veces === 'primera') t += ` Vuelve a empezar ${(opcionesEmpieza(def).find(o => o[0] === def.empieza) || [, ''])[1]}.`
  else if (def.paso2 && def.empieza === 'maxHist') t += ' Con un máximo histórico nuevo, vuelve a esperar el paso 1.'
  if (def.mientras) t += ' Fuera del tramo, nada.'
  return t.charAt(0).toUpperCase() + t.slice(1)
}
// Corta, para el selector de la barra.
export const textoCortoConPasos = (def) => {
  const t = fraseConPasos(def)
  return t.length > 90 ? t.slice(0, 88) + '…' : t
}

// Los 3 ejemplos de Sergi (24/11), sobre el valor del Replay.
const ema = (lado, periodo) => ({ c: 'precioVsMedia', p: { lado, tipo: 'EMA', periodo } })
const cruce = (lado) => ({ c: 'mediaVsMedia', p: { tipoRapida: 'EMA', periodoRapida: 10, tipoLenta: 'EMA', periodoLenta: 20, lado } })
export const EJEMPLOS_CON_PASOS = Object.freeze([
  { id: 'caidas', nombre: 'Cae un 10 % desde el máximo histórico y luego cada ±10 %',
    def: (s) => ({ version: 1, mientras: null, paso1: { filas: [{ mov: 'cae', pct: 10, desde: 'maxHist', quien: s }], daSenal: true },
      paso2: { filas: [{ mov: 'mueve', pct: 10, desde: 'senal', quien: s }] }, anula: null, veces: 'cada', empieza: 'maxHist' }) },
  { id: 'retrocesos', nombre: 'Sobre la EMA 200, cada caída del 5 % desde el máximo o la última señal',
    def: (s) => ({ version: 1, mientras: { filas: [{ quien: s, velas: 'diarias', si: ema('encima', 200) }] },
      paso1: { filas: [{ mov: 'cae', pct: 5, desde: 'maxSenal', quien: s }] }, paso2: null, anula: null, veces: 'cada', empieza: 'nunca' }) },
  { id: 'cruce', nombre: 'Tras el cruce de la EMA 10 sobre la EMA 20, solo el primer retroceso',
    def: (s) => ({ version: 1, mientras: null, paso1: { filas: [{ quien: s, velas: 'diarias', si: cruce('encima') }] },
      paso2: { filas: [{ quien: s, velas: 'diarias', si: ema('debajo', 10) }] }, anula: { filas: [{ quien: s, velas: 'diarias', si: cruce('debajo') }] },
      veces: 'primera', empieza: 'paso1' }) },
])

// Todas las filas del catálogo de la condición (para dibujar sus medias en el gráfico).
export const filasCatalogoConPasos = (def) => SECCIONES.flatMap(k => (def?.[k]?.filas || []).filter(f => f && f.mov === undefined).map(({ union, ...r }) => r))

export const AYUDA_PASOS = Object.freeze({
  general: 'Una condición que RECUERDA lo que pasó antes. Se lee de arriba abajo: primero el tramo («Mientras…»), luego el paso 1, luego el paso 2. ' +
    'Se mira al cierre de cada vela, con lo que se sabía ese día.\n\nEjemplo: máximo histórico 100 → cierra a 90 (−10 %): señal. Después, cada ±10 % desde la última señal: a 81 o a 99.',
  mientras: 'Fuera del tramo no hay señales. Al empezar un tramo nuevo, todo vuelve a empezar (también «el máximo del tramo»).\n\n' +
    'Ejemplo: sobre la EMA 200 del 01/03 al 10/09: un tramo. Cae debajo el 11/09: se acaba. Vuelve encima el 02/12: tramo nuevo, máximo nuevo.',
  paso1: 'Lo primero que tiene que pasar. Sin paso 2, da la señal. Con paso 2, solo «arma» el paso 2 (salvo que marques «este paso también da señal»).\n\n' +
    'Ejemplo: «la EMA 10 cruza por encima de la EMA 20» sin señal → se queda esperando al primer retroceso.',
  paso2: 'Lo que se espera DESPUÉS del paso 1. Solo se mira cuando el paso 1 ya pasó (y no se anuló). Da la señal.',
  anula: 'Si pasa esto ANTES del paso 2, se olvida el paso 1 y se espera otro.\n\nEjemplo: cruce hacia arriba el 05/04; antes de retroceder, cruza hacia abajo el 20/04: ese cruce ya no da señal.',
  veces: '«Cada vez que se cumpla»: cada vela en que el paso pasa a cumplirse.\n«Solo la primera vez»: tras la señal, nada hasta que «vuelva a empezar».\n\n' +
    'Ejemplo: tras un cruce, el precio cierra bajo la EMA 10 tres veces: con «solo la primera», una señal; con «cada vez», tres.',
  movimiento: '«Cae / sube / se mueve un X % desde…»: se compara el CIERRE de la vela con un precio que se recuerda.\n' +
    '· Su máximo histórico: el cierre más alto hasta ese día.\n· El máximo / mínimo del tramo: desde que empezó el «Mientras…».\n' +
    '· El máximo / mínimo desde la última señal (o desde el principio).\n· El precio de la última señal: el cierre de esa vela.\n' +
    '· El precio del paso 1: el cierre de la vela del paso 1 (en el paso 2 y en «se anula si»).\n· Tu última compra: el precio al que compraste tú en este Replay (sin compra, no se cumple).\n\n' +
    'Ejemplo: máximo histórico 120 y «cae un 10 %» → se cumple al cerrar a 108 o menos (120 × 0,90 = 108).\n' +
    'Con tu compra: la señal dice 90 y no compras; compras a mano a 85. «Cae un 10 % desde la última señal» → 81; «desde tu última compra» → 76,50.',
})
