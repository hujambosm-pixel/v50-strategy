// lib/builder/misListas.js — la lista «Mis estrategias» de «Mi trabajo» del Builder (V9.1042; docs/builder.md, §9 y §59). Puro (async solo por las huellas): una fila por estrategia (las de código y las del editor).
// §58: la línea compacta: el resultado de la prueba del paso 2 (pruebas_azar, con la huella de la estrategia de ahora), los planes que la usan y qué toca ahora.
import { esDefinicionEditor } from '../editor/fuente'
import { validaDefinicion, valoresDe } from '../editor/definicion'
import { reglaPartes } from './tarjetas'
import { partesNombre } from './versiones'
import { huellaEstrategia } from '../pruebaAzar'
import { esSemanal, estadoPrueba, fechaCorta } from './planPantalla'
import { fotoDelPlan } from './planesGuardados'

const params = (p) => { try { return typeof p === 'string' ? JSON.parse(p || '{}') : (p || {}) } catch (_) { return {} } }

export const NOTA_CODIGO = 'Las de código no se pueden probar contra el azar aquí, en el Builder. Para probarla aquí, rehazla en tarjetas.'
// §58: la columna «Prueba contra el azar»: [tipo de chip, texto].
export const CHIP_AZAR = Object.freeze({ pasa: ['supera', 'Pasa'], noPasa: ['noSupera', 'No pasa'], sinPrueba: ['neutro', 'Sin probar'], borrador: ['borrador', 'Borrador'] })
export const AYUDA_MI_TRABAJO = Object.freeze({
  tesis: 'Las tesis que enlazan esta estrategia en su «Relacionado». Pulsa para abrirla en la pestaña «Tesis». Ejemplo: «Growth investing» abre esa tesis; «2 tesis ▾» despliega la lista para elegir.',
  queEs: 'Una estrategia es una regla de compra y venta; una prueba, la comprobación contra el azar de una estrategia; un plan, una estrategia con tu dinero. Ejemplo: «EMA20» es la regla, se prueba en AAPL en el paso 2 y «EMA20 con 10.000 €» es su plan.',
  fila: 'Pulsa el nombre de una estrategia para abrirla; deja el ratón encima para ver su regla. Ejemplo: en «SuperTrend 10/3», «compro cuando el SuperTrend (10, 3) cambia a alcista…». Duplicar abre una copia nueva y la original no cambia.',
  azar: 'El resultado de la prueba del paso 2 con la regla de ahora: si cambias la regla, vuelve a «Sin probar». Para pasar, tiene que ganar al 95 % de las copias que compran en fechas al azar. Ejemplo: gana a 960 de 1.000 copias en los dos periodos (96 %): pasa. «Ver» abre la prueba.',
  planes: 'Cuántos planes guardados usan esta estrategia. «Abrir» lo lleva al paso 3 con ese plan. Ejemplo: con 2 planes, «Abrir» despliega los 2 nombres para elegir.',
})

// «Mis estrategias»: una fila por estrategia. Primero las del editor (por nombre y versión), después las de código (en su orden).
//   estrategia, nombre (sin el sufijo de versión), version, subtitulo, origen ('editor' | 'código'),
//   chip (clave de CHIP), linea, toca { texto, accion, nota }. §58: planes [{ id, nombre }] (los guardados con la foto de esta estrategia) y azar { clave, detalle, hay } (null en las de código o
//   si pruebasAzar no se ha podido leer: null). Con pruebasAzar, «Qué toca ahora» sale de la prueba del paso 2: sin ella, probarla; con ella (pase o no, §48), convertirla en plan.
export async function construyeMisEstrategias({ estrategias = [], planes = [], pruebasAzar = null }) {
  const filas = await filasBase({ estrategias })
  const planesDe = (id) => planes.filter(p => String(fotoDelPlan(p.plan)?.id) === String(id)).map(p => ({ id: p.id, nombre: p.nombre }))
  return Promise.all(filas.map(async f => {
    const s = f.estrategia, conPlanes = { ...f, planes: planesDe(s.id) }
    if (f.origen === 'código' || !pruebasAzar) return { ...conPlanes, azar: null }
    if (f.chip === 'borrador') return { ...conPlanes, azar: { clave: 'borrador', detalle: null, hay: false } }
    const e = estadoPrueba(pruebasAzar.filter(p => String(p.estrategia_id) === String(s.id)), await huellaEstrategia(s))
    const azar = { clave: e.clave, hay: !!e.fila, detalle: e.fila ? `${fechaCorta(e.fila.creada_en).slice(0, 5)} · ${e.fila.valor}` : null }
    const toca = e.clave === 'sinPrueba' ? { texto: 'Probarla contra el azar', accion: { tipo: 'azar', estrategiaId: s.id } }
      : esSemanal(s) ? { texto: '—', accion: null, nota: 'Las semanales llegarán más adelante al paso 3' } : { texto: 'Convertirla en plan', accion: { tipo: 'plan', estrategiaId: s.id } }
    return { ...conPlanes, azar, toca }
  }))
}
async function filasBase({ estrategias }) {
  const editor = [], codigo = []
  for (const s of estrategias) {
    const { base, version } = partesNombre(s.name || '(sin nombre)')
    const fila = { clave: `e:${s.id}`, estrategia: s, nombre: base, version, desactivada: s.enabled === false }
    if (!esDefinicionEditor(s.definition)) {
      codigo.push({ ...fila, origen: 'código', subtitulo: String(s.description || '').trim(), chip: 'sinProbar', linea: 'Las de código no tienen veredicto guardado', toca: { texto: '—', accion: null, nota: NOTA_CODIGO } })
      continue
    }
    const vs = params(s.params)
    // Debajo del nombre, la regla completa (la misma frase que «La regla, en una frase» del editor), sin cortar.
    // La regla por bloques (V9.1049): subtitulo es el texto entero; partes, los bloques para pintarlos con su color.
    let partes = null, sub = ''; try { partes = reglaPartes(s.definition, valoresDe(s.definition, vs)); sub = partes.map(x => x.texto).join(' ') } catch (_) { sub = String(s.description || '') }
    if (validaDefinicion(s.definition, vs).length) { editor.push({ ...fila, origen: 'editor', subtitulo: sub, partes, chip: 'borrador', linea: 'Tiene algo por corregir: todavía no se puede probar', toca: { texto: 'Terminarla', accion: { tipo: 'editor' } } }); continue }
    editor.push({ ...fila, origen: 'editor', subtitulo: sub, partes, chip: 'sinProbar', linea: '', toca: { texto: 'Probarla contra el azar', accion: { tipo: 'azar', estrategiaId: s.id } } })
  }
  editor.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es') || a.version - b.version)
  return [...editor, ...codigo]
}
export const FILTROS_ESTRATEGIAS = [['editor', 'De tarjetas'], ['codigo', 'De código']]
export const filtraEstrategias = (filas, filtro) => (filas || []).filter(f => filtro === 'codigo' ? f.origen === 'código' : f.origen !== 'código')
