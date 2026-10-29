// lib/builder/barraCambios.js — la barra de arriba del paso 1 (V9.1073; docs/builder.md, §39): ¿lo que se ve es la estrategia
// guardada?, y la lista corta de lo cambiado, tanto en las tarjetas como en las casillas de prueba de «Señales en el gráfico».
// Puro: no guarda nada. `orig` y `est` son { def, valores, nombre, descripcion } (estadoDe de components/BuilderEditor.js); `est`
// ya con las casillas de prueba aplicadas (conCasillas).
import { jsonCanonico } from '../lotesLab'
import { valoresDe } from '../editor/definicion'
import { aplicaPrueba, camposDePrueba, valorCampo, MODOS_ORDEN } from './ensayo'
import { leeFiltro, leeCompra, leeVenta, leeProteccion, nombreCond, aTexto, TIPOS_STOP } from './tarjetas'

const intervaloDe = (vs) => vs?.intervalo === 'semanal' ? 'semanal' : 'diario'
const nombreVelas = (i) => i === 'semanal' ? 'semanales' : 'diarias'
const limpio = (t) => String(t || '').trim()
// Las casillas de prueba sobre la estrategia de las tarjetas (como «Guardar en la estrategia»). Unas velas iguales a las de las
// tarjetas no son un cambio: se quitan, para no escribir «diario» donde la estrategia no lo decía.
export function conCasillas(est, cambios, opciones) {
  const cs = { ...(cambios || {}) }
  if (cs.intervalo && cs.intervalo === intervaloDe(est.valores)) delete cs.intervalo
  return Object.keys(cs).length ? { ...est, ...aplicaPrueba({ def: est.def, valores: est.valores }, cs, opciones) } : est
}
// Lo que se compara: la definición, los valores (las velas, aparte: sin escribir son diarias), el nombre y la descripción.
const firma = (e) => { const { intervalo, ...vs } = e.valores || {}; return jsonCanonico({ def: e.def, valores: vs, intervalo: intervaloDe(e.valores), nombre: limpio(e.nombre), descripcion: limpio(e.descripcion) }) }
export const hayCambios = (orig, est) => firma(orig) !== firma(est)

// Las filas de las tarjetas, por su nombre («Compro: RSI»), y los números de las casillas, por su sitio.
function filas(e) {
  const xs = []
  for (const [lee, bloque] of [[leeFiltro, 'Solo opero'], [leeCompra, 'Compro'], [leeVenta, 'Vendo']]) {
    try { const r = lee(e.def); if (r.ok) for (const f of r.filas) xs.push(`${bloque}: ${nombreCond(f.cond.c)}`) } catch (_) {}
  }
  try { for (const { s } of leeProteccion(e.def).stops) xs.push(`Stop: ${TIPOS_STOP.find(t => t.tipo === s.tipo)?.nombre || s.tipo}`) } catch (_) {}
  return xs
}
function numeros(e) {
  const out = new Map()
  let vs; try { vs = valoresDe(e.def, e.valores) } catch (_) { return out }
  let cs; try { cs = camposDePrueba(e.def) } catch (_) { return out }
  const vistos = {}
  for (const x of cs) {
    const base = `${x.bloque}|${x.nombre}`, n = vistos[base] = (vistos[base] ?? -1) + 1
    for (const y of x.partes) if (typeof y === 'object') out.set(`${base}|${n}|${y.etiqueta}`, { campo: y.campo, nombre: x.nombre, etiqueta: y.etiqueta, valor: valorCampo(e.def, vs, y.campo) })
  }
  return out
}
const textoValor = (c, v) => c.tipo === 'modoOrden' ? (MODOS_ORDEN.find(([k]) => k === v)?.[1] || v) : aTexto(v)
// La lista de lo cambiado, en frases cortas: «SuperTrend · Periodo: 12 (guardado 10)», «fila nueva: Compro: RSI»…
export function listaCambios(orig, est) {
  const out = []
  if (limpio(est.nombre) !== limpio(orig.nombre)) out.push(`nombre «${limpio(est.nombre)}» (guardado «${limpio(orig.nombre)}»)`)
  if (limpio(est.descripcion) !== limpio(orig.descripcion)) out.push('descripción cambiada')
  const io = intervaloDe(orig.valores), ie = intervaloDe(est.valores)
  if (io !== ie) out.push(`velas ${nombreVelas(ie)} (guardado ${nombreVelas(io)})`)
  const fo = filas(orig), fe = filas(est), quedan = [...fo]
  for (const f of fe) { const k = quedan.indexOf(f); if (k >= 0) quedan.splice(k, 1); else out.push(`fila nueva: ${f}`) }
  for (const f of quedan) out.push(`fila quitada: ${f}`)
  const no = numeros(orig)
  for (const [k, x] of numeros(est)) {
    const g = no.get(k)
    if (!g || g.valor === x.valor) continue
    out.push(x.campo.tipo === 'modoOrden' ? `Cómo compro: ${textoValor(x.campo, x.valor)} (guardado: ${textoValor(x.campo, g.valor)})` : `${x.nombre} · ${x.etiqueta}: ${textoValor(x.campo, x.valor)} (guardado ${textoValor(x.campo, g.valor)})`)
  }
  const sinRepetir = [...new Set(out)]
  return sinRepetir.length || !hayCambios(orig, est) ? sinRepetir : ['otros cambios en la regla']
}
// La lista en una línea: las 3 primeras y «y N más».
export const resumenCambios = (xs, max = 3) => xs.length <= max ? xs.join(' · ') : `${xs.slice(0, max).join(' · ')} y ${xs.length - max} más`
