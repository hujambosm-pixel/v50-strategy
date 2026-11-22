// lib/replay/orden.js — de lo que rellena Sergi en el panel del Replay a una ACCIÓN del motor (lib/replay/motor.js), con sus avisos.
// PURO. Docs: docs/builder.md §228.
//
// FORMULARIO: { lado: 1 | -1, mercado: true | false, entrada, stop, objetivo, modo: 'invertir' | 'arriesgar', pct }
// (números o null; entrada solo sin «a mercado»). «ahora» = el cierre de la vela de hoy (la que ves).
import { claseDe } from './motor'

const num = (x) => (x === '' || x == null ? null : Number(String(x).replace(',', '.')))
const ok = (x) => Number.isFinite(x) && x > 0

export function compruebaOrden(f, ahora) {
  const entrada = f.mercado ? null : num(f.entrada), stop = num(f.stop), objetivo = num(f.objetivo), pct = num(f.pct)
  const largo = f.lado > 0, ref = f.mercado ? ahora : entrada
  if (!f.mercado && !ok(entrada)) return { error: 'Falta el precio de entrada (o elige «a mercado»).' }
  if (stop != null && !ok(stop)) return { error: 'El stop tiene que ser un precio mayor que 0.' }
  if (objetivo != null && !ok(objetivo)) return { error: 'El objetivo tiene que ser un precio mayor que 0.' }
  if (stop != null && (largo ? stop >= ref : stop <= ref)) return { error: largo ? 'En una compra el stop va por debajo de la entrada.' : 'En un corto el stop va por encima de la entrada.' }
  if (objetivo != null && (largo ? objetivo <= ref : objetivo >= ref)) return { error: largo ? 'En una compra el objetivo va por encima de la entrada.' : 'En un corto el objetivo va por debajo de la entrada.' }
  if (!ok(pct) || pct > 100) return { error: 'El % tiene que estar entre 0 y 100.' }
  if (f.modo === 'arriesgar' && stop == null) return { error: 'Para arriesgar un % hace falta un stop.' }
  return { orden: { lado: largo ? 1 : -1, entrada, clase: entrada == null ? null : claseDe(f.lado, entrada, ahora), stop, objetivo, tam: { modo: f.modo === 'arriesgar' ? 'arriesgar' : 'invertir', pct } } }
}

// La acción que se añade al estado (con la fecha de hoy y un id nuevo).
export function nuevaAccion(estado, simbolo, orden) {
  const id = (estado.acciones || []).reduce((m, a) => Math.max(m, a.id || 0), 0) + 1
  return { fecha: estado.hoy, simbolo, tipo: 'orden', id, ...orden }
}

// Cómo se lee una orden, en una línea: «Compra a mercado · invertir 20 % · stop 98,00 · objetivo 108,00».
const eur = (x) => Number(x).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' })
export function textoOrden(o) {
  const que = o.lado > 0 ? 'Compra' : 'Corto'
  const como = o.entrada == null ? 'a mercado' : `${o.clase === 'limite' ? 'límite' : 'stop'} a ${eur(o.entrada)}`
  const tam = o.tam?.modo === 'arriesgar' ? `arriesgar ${o.tam.pct} %` : `invertir ${o.tam?.pct} %`
  return [`${que} ${como}`, tam, o.stop != null ? `stop ${eur(o.stop)}` : null, o.objetivo != null ? `objetivo ${eur(o.objetivo)}` : null].filter(Boolean).join(' · ')
}

// Marcas para el gráfico (customMarkers de CandleChart): ▲ compra / ▼ corto en la entrada y un punto verde o rojo en la salida.
// §234: la etiqueta «#n ±x %» ya no va en el punto: la pone el gráfico en su caja, con la línea de la entrada a la salida (tradesDe).
export function marcasDe(r) {
  const m = []
  for (const o of r.operaciones) {
    m.push({ date: o.fechaEntrada, position: o.lado > 0 ? 'belowBar' : 'aboveBar', shape: o.lado > 0 ? 'arrowUp' : 'arrowDown', color: '#58a6ff', text: `#${o.num}` })
    m.push({ date: o.fechaSalida, position: o.lado > 0 ? 'aboveBar' : 'belowBar', shape: 'circle', color: o.resultado > 0 ? '#3fb950' : '#f85149', text: '' })
  }
  for (const [, p] of Object.entries(r.posiciones)) m.push({ date: p.fecha, position: p.lado > 0 ? 'belowBar' : 'aboveBar', shape: p.lado > 0 ? 'arrowUp' : 'arrowDown', color: '#58a6ff', text: `#${p.num}` })
  return m.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}

// §234: las operaciones CERRADAS de un valor como las del gráfico de la Watchlist (prop trades de CandleChart): la línea verde o roja de la
// entrada a la salida y la caja «#n ±x %» (con el número de la operación en el Replay, aunque hayas quitado alguna).
export const tradesDe = (r, simbolo) => (r?.operaciones || []).filter(o => o.simbolo === simbolo && o.fechaSalida)
  .map(o => ({ num: o.num, entryDate: o.fechaEntrada, exitDate: o.fechaSalida, entryPrice: o.precioEntrada, exitPrice: o.precioSalida, pnlPct: o.pct, lado: o.lado }))

// Lo que hará una orden en un precio, en palabras: «Orden límite: compra si baja hasta 95,00 (ahora 100,00)».
export function explicaPrecio(lado, entrada, ahora) {
  const e = num(entrada)
  if (!ok(e) || !ok(ahora)) return null
  const clase = claseDe(lado, e, ahora), largo = lado > 0
  const que = largo ? 'compra' : 'vende en corto', mov = (clase === 'limite') === largo ? 'baja' : 'sube'
  return `Orden ${clase === 'limite' ? 'límite' : 'stop'}: ${que} si ${mov} hasta ${eur(e)} (ahora ${eur(ahora)})`
}
