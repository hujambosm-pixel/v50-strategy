// lib/builder/misListas.js — «Mi trabajo» del Builder en dos pestañas (V9.1042; docs/builder.md, §9). Puro (async solo por las
// huellas). «Mis estrategias»: una fila por estrategia (las de código y las del editor), sin pruebas mezcladas. «Mis pruebas»: una
// fila por prueba congelada (editor_lotes). Sale de lo mismo que «Mi trabajo» (strategies, editor_lotes y lab_pruebas) y el veredicto
// es el de la pantalla del paso 2 (estadoDesde y veredictoVariante de lib/builder/pruebaGuiada.js): lo que dice la fila es lo que
// enseña la prueba al abrirla. Una estrategia del editor está en una prueba si la huella de su definición con sus valores es la de
// una variante de esa prueba (como en «Mi trabajo»). §58: la línea compacta: el resultado de la prueba del paso 2 (pruebas_azar, con la huella de la estrategia de ahora), los planes que la usan y qué toca ahora.
import { esDefinicionEditor } from '../editor/fuente'
import { validaDefinicion, huellaDefinicion, valoresDe } from '../editor/definicion'
import { reglaPartes } from './tarjetas'
import { comunNormal, esUniversoDinamico, nombreVariante, REGLAS_UNIVERSO } from '../editor/lotes'
import { estadoDesde, veredictoVariante, nombrePeriodo } from './pruebaGuiada'
import { NOTA_CODIGO } from './miTrabajo'
import { partesNombre } from './versiones'
import { huellaEstrategia } from '../pruebaAzar'
import { esSemanal, estadoPrueba, fechaCorta } from './planPantalla'
import { fotoDelPlan } from './planesGuardados'

const num = (x) => x == null || !Number.isFinite(x) ? '—' : String(Math.round(x * 10) / 10).replace('.', ',')
const params = (p) => { try { return typeof p === 'string' ? JSON.parse(p || '{}') : (p || {}) } catch (_) { return {} } }

// El chip del veredicto: [tipo de chip de lib/builder/estilo.js, texto]. Las mismas palabras que el paso 2.
export const CHIP = Object.freeze({
  pasa: ['supera', 'Pasa'], noLlega: ['noSupera', 'No llega'], sinVeredicto: ['neutro', 'Sin veredicto'],
  sinResultados: ['neutro', 'Sin resultados todavía'], sinProbar: ['neutro', 'Sin probar'], borrador: ['borrador', 'Borrador'],
})
// §58: la columna «Prueba contra el azar»: [tipo de chip, texto].
export const CHIP_AZAR = Object.freeze({ pasa: ['supera', 'Pasa'], noPasa: ['noSupera', 'No pasa'], sinPrueba: ['neutro', 'Sin probar'], borrador: ['borrador', 'Borrador'] })
export const AYUDA_MI_TRABAJO = Object.freeze({
  queEs: 'Una estrategia es una regla de compra y venta; una prueba, la comprobación contra el azar de una o varias estrategias; un plan, una estrategia con tu dinero. Ejemplo: «EMA20» es la regla, se prueba en AAPL en el paso 2 y «EMA20 con 10.000 €» es su plan.',
  fila: 'Pulsa el nombre de una estrategia para abrirla; deja el ratón encima para ver su regla. Ejemplo: en «SuperTrend 10/3», «compro cuando el SuperTrend (10, 3) cambia a alcista…». Duplicar abre una copia nueva y la original no cambia.',
  azar: 'El resultado de la prueba del paso 2 con la regla de ahora: si cambias la regla, vuelve a «Sin probar». Para pasar, tiene que ganar al 95 % de las copias que compran en fechas al azar. Ejemplo: gana a 960 de 1.000 copias en los dos periodos (96 %): pasa. «Ver» abre la prueba.',
  planes: 'Cuántos planes guardados usan esta estrategia. «Abrir» lo lleva al paso 3 con ese plan. Ejemplo: con 2 planes, «Abrir» despliega los 2 nombres para elegir.',
})
const claveChip = (pasa) => pasa === true ? 'pasa' : pasa === false ? 'noLlega' : 'sinVeredicto'

// «Valores y periodos» de una prueba.
export function textoValores(lote) {
  const c = comunNormal(lote?.comun), u = c.universo
  return esUniversoDinamico(u) ? `Nasdaq-100 · los ${u.n} ${REGLAS_UNIVERSO[u.regla] || u.regla}` : `lista fija de ${(u.symbols || []).length} valores (${(u.symbols || []).slice(0, 4).join(', ')}${(u.symbols || []).length > 4 ? '…' : ''})`
}
export const textoPeriodos = (lote) => comunNormal(lote?.comun).periodos.map(nombrePeriodo).join(' y ')

// La línea pequeña de «Cómo le fue»: qué laboratorio decide y su percentil en cada periodo.
function lineaVeredicto(fila, est, v, ver) {
  const cn = comunNormal(fila.lote.comun)
  if (ver.decide === 'laboratorio') {
    if (ver.pasa === null) return 'La verificación de sesgos no la acepta: el laboratorio de operaciones no decide'
    const ps = est.lab[v.id] || []
    return `Decide el laboratorio de operaciones · percentil ${ps.map(p => `${nombrePeriodo(p)}: ${num(p.azar?.percentil)}`).join(' · ')}`
  }
  if (ver.decide === 'lote') {
    const abV = (est.ab?.resultados || []).find(x => x.id === v.id)
    const ps = Array.isArray(abV?.periodos) ? abV.periodos : abV?.A ? [{ ...cn.periodos[0], A: abV.A }] : []
    return `Decide el laboratorio de cartera (sin verificación de sesgos) · percentil ${ps.map(p => `${nombrePeriodo(p)}: ${num(p.A?.cagr?.percentil)}`).join(' · ')}`
  }
  return 'La prueba aún no ha terminado'
}

// El resultado de una variante de una prueba: { chip, linea, decide, pasa, completa }.
export function resultadoVariante(fila, est, v) {
  const abV = (est.ab?.resultados || []).find(x => x.id === v.id)
  const ver = veredictoVariante({ cal: est.cal[v.id], lab: est.lab[v.id], abVariante: abV })
  const chip = ver.decide ? claveChip(ver.pasa) : 'sinResultados'
  const completa = !!(est.cal[v.id] && est.lab[v.id] && est.ab)
  return { chip, linea: lineaVeredicto(fila, est, v, ver), decide: ver.decide, pasa: ver.pasa, completa }
}

// La verificación de sesgos de una prueba: «Superada», «No superada», «No se hizo (prueba antigua)» o «Pendiente».
export function textoSesgosPrueba(fila, est) {
  const vs = fila.lote.variantes, cal = vs.map(v => est.cal[v.id])
  if (cal.every(Boolean)) {
    const si = vs.filter((v, k) => cal[k].calibrada), no = vs.filter((v, k) => !cal[k].calibrada)
    if (!no.length) return { clave: 'superada', texto: 'Superada' }
    if (!si.length) return { clave: 'noSuperada', texto: 'No superada' }
    return { clave: 'mixta', texto: `Superada en ${si.map(nombreVariante).join(', ')}; no superada en ${no.map(nombreVariante).join(', ')}` }
  }
  const algoHecho = !!est.ab || vs.some(v => est.lab[v.id])
  if (cal.some(Boolean)) return { clave: 'aMedias', texto: `Hecha en ${vs.filter((v, k) => cal[k]).map(nombreVariante).join(', ')}; falta en las demás` }
  return algoHecho ? { clave: 'noSeHizo', texto: 'No se hizo (prueba antigua)' } : { clave: 'pendiente', texto: 'Pendiente' }
}

// «Mis pruebas»: una fila por prueba congelada, la más reciente arriba (el orden de editor_lotes).
export function construyeMisPruebas({ lotes = [], pruebas = [] }) {
  const out = []
  for (const f of lotes) {
    if (f?.lote?.tipo === 'planes') {
      out.push({ clave: `l:${f.id}`, id: f.id, nombre: f.nombre, planes: true, estrategias: [], valores: '—', periodos: '—', sesgos: { clave: 'noAplica', texto: '—' }, veredictos: [], nota: 'Prueba de planes (paso 3): su pantalla llegará más adelante.' })
      continue
    }
    const est = estadoDesde(f, pruebas)
    const veredictos = f.lote.variantes.map(v => ({ id: v.id, nombre: nombreVariante(v), ...resultadoVariante(f, est, v) }))
    out.push({ clave: `l:${f.id}`, id: f.id, nombre: f.nombre, planes: false, estrategias: f.lote.variantes.map(nombreVariante), valores: textoValores(f.lote), periodos: textoPeriodos(f.lote),
      sesgos: textoSesgosPrueba(f, est), veredictos })
  }
  return out
}

// «Mis estrategias»: una fila por estrategia. Primero las del editor (por nombre y versión), después las de código (en su orden).
//   estrategia, nombre (sin el sufijo de versión), version, subtitulo, origen ('editor' | 'código'), ultimaPrueba { id, nombre } | null,
//   chip (clave de CHIP), linea, toca { texto, accion, nota }. §58: planes [{ id, nombre }] (los guardados con la foto de esta estrategia) y azar { clave, detalle, hay } (null en las de código o
//   si pruebasAzar no se ha podido leer: null). Con pruebasAzar, «Qué toca ahora» sale de la prueba del paso 2: sin ella, probarla; con ella (pase o no, §48), convertirla en plan.
export async function construyeMisEstrategias({ estrategias = [], lotes = [], pruebas = [], planes = [], pruebasAzar = null }) {
  const filas = await filasBase({ estrategias, lotes, pruebas })
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
async function filasBase({ estrategias, lotes, pruebas }) {
  const enLotes = {}
  for (const f of lotes) if (f?.lote?.tipo !== 'planes') for (const v of f?.huellas?.variantes || []) (enLotes[v.huella] ||= []).push({ fila: f, id: v.id })
  const ultimaEjec = {}
  for (const p of pruebas) { const c = p?.config || {}; if (c.prueba === 'editorLote' && c.hashLote && (!ultimaEjec[c.hashLote] || String(p.creado) > String(ultimaEjec[c.hashLote]))) ultimaEjec[c.hashLote] = String(p.creado) }
  const editor = [], codigo = []
  for (const s of estrategias) {
    const { base, version } = partesNombre(s.name || '(sin nombre)')
    const fila = { clave: `e:${s.id}`, estrategia: s, nombre: base, version, desactivada: s.enabled === false, ultimaPrueba: null }
    if (!esDefinicionEditor(s.definition)) {
      codigo.push({ ...fila, origen: 'código', subtitulo: String(s.description || '').trim(), chip: 'sinProbar', linea: 'Las de código no tienen veredicto guardado', toca: { texto: '—', accion: null, nota: NOTA_CODIGO } })
      continue
    }
    const vs = params(s.params)
    // Debajo del nombre, la regla completa (la misma frase que «La regla, en una frase» del editor), sin cortar.
    // La regla por bloques (V9.1049): subtitulo es el texto entero; partes, los bloques para pintarlos con su color.
    let partes = null, sub = ''; try { partes = reglaPartes(s.definition, valoresDe(s.definition, vs)); sub = partes.map(x => x.texto).join(' ') } catch (_) { sub = String(s.description || '') }
    if (validaDefinicion(s.definition, vs).length) { editor.push({ ...fila, origen: 'editor', subtitulo: sub, partes, chip: 'borrador', linea: 'Tiene algo por corregir: todavía no se puede probar', toca: { texto: 'Terminarla', accion: { tipo: 'editor' } } }); continue }
    const h = await huellaDefinicion(s.definition, vs)
    const ls = (enLotes[h] || []).slice().sort((a, b) => String(ultimaEjec[b.fila.hash_lote] || b.fila.creado).localeCompare(String(ultimaEjec[a.fila.hash_lote] || a.fila.creado)))
    if (!ls.length) { editor.push({ ...fila, origen: 'editor', subtitulo: sub, partes, huella: h, chip: 'sinProbar', linea: '', toca: { texto: 'Probarla contra el azar', accion: { tipo: 'prueba', estrategiaId: s.id } } }); continue }
    const ref = ls[0], v = ref.fila.lote.variantes.find(x => x.id === ref.id), est = estadoDesde(ref.fila, pruebas), r = resultadoVariante(ref.fila, est, v)
    const abrir = { tipo: 'prueba', loteId: ref.fila.id }
    const toca = r.chip === 'pasa' ? { texto: 'Convertirla en plan (paso 3)', accion: { tipo: 'plan', estrategiaId: s.id } }
      : r.chip === 'sinResultados' ? { texto: 'Continuar la prueba', accion: abrir }
      : !r.completa && r.decide === 'lote' ? { texto: 'Verificar sesgos y probar en el laboratorio de operaciones', accion: abrir }
      : { texto: 'Revisar la prueba', accion: abrir }
    editor.push({ ...fila, origen: 'editor', subtitulo: sub, partes, huella: h, ultimaPrueba: { id: ref.fila.id, nombre: ref.fila.nombre }, chip: r.chip, linea: r.linea, toca })
  }
  editor.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es') || a.version - b.version)
  return [...editor, ...codigo]
}
export const FILTROS_ESTRATEGIAS = [['editor', 'De tarjetas'], ['codigo', 'De código']]
export const filtraEstrategias = (filas, filtro) => (filas || []).filter(f => filtro === 'codigo' ? f.origen === 'código' : f.origen !== 'código')
