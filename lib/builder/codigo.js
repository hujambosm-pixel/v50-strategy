// lib/builder/codigo.js — una ESTRATEGIA DE CÓDIGO en el Builder (V9.1048; docs/builder.md, §14). Puro.
// Una estrategia de código es un programa en JavaScript (code_js) con sus parámetros (params, un JSON en texto). En el Builder se
// ve con su código SOLO PARA LEER y se cambian sus parámetros (los números simples), su nombre, su descripción y sus velas (el
// `intervalo` de params). Lo demás de params (textos, listas, sí / no…) se enseña tal cual, sin poder cambiarlo.
// Abrir y guardar sin tocar no escribe nada (la fila queda idéntica, byte a byte). Al guardar un cambio, params se reescribe
// cambiando SOLO los valores tocados, en su sitio. La regla de versiones es la de las tarjetas (lib/builder/versiones.js): si la
// estrategia está en alguna prueba congelada y cambia lo que hace, se crea «Nombre · versión N» y la prueba sigue con la suya.
// (Hoy ninguna estrategia de código está en una prueba: el paso 2 solo admite las de tarjetas.)
import { esquemaDeCodigo } from '../parametrosEstrategia'
import { siguienteVersion, partesNombre } from './versiones'
import { errorRango } from './fichas'

export const AVISO_CODIGO = 'Esta estrategia está escrita como programa (código). No se puede ver ni cambiar en tarjetas. Puedes cambiar sus parámetros.'
export const AVISO_LEER = 'Solo para leer. Si hay que cambiarlo, pídelo.'
export const PASO2_CODIGO = 'Las estrategias de código no se pueden probar contra el azar aquí, en el Builder. Para probarla aquí, rehazla en tarjetas.'

export const esDeCodigo = (fila) => !!fila && !(fila.definition && typeof fila.definition === 'object' && fila.definition.tipo === 'editor')
export function paramsObjeto(p) {
  if (p && typeof p === 'object') return { ...p }
  try { const o = JSON.parse(p || '{}'); return o && typeof o === 'object' && !Array.isArray(o) ? o : {} } catch (_) { return null }
}
const esNumero = (v) => typeof v === 'number' && Number.isFinite(v)
// La declaración de parámetros del código (run.parametros), si la tiene. No lanza.
export function esquemaCodigo(codeJs) { try { return esquemaDeCodigo(codeJs || null) } catch (_) { return null } }
// La declaración de un parámetro por su nombre o uno de sus alias.
function declDe(esquema, nombre) {
  if (!esquema) return null
  const d = (esquema.lista || []).find(p => p.nombre === nombre)
  if (d) return d
  const real = Object.entries(esquema.alias || {}).find(([, as]) => (as || []).includes(nombre))?.[0]
  return real ? (esquema.lista || []).find(p => p.nombre === real) || null : null
}

// Lo que se enseña de params: { ok, editables: [{ nombre, valor, decl }], otros: [{ nombre, texto }], intervalo }.
//   ok: false si params no es un JSON de objeto (se enseña el texto tal cual, sin poder cambiar nada).
export function leeParametros(fila) {
  const o = paramsObjeto(fila?.params), esquema = esquemaCodigo(fila?.code_js)
  if (!o) return { ok: false, editables: [], otros: [], intervalo: 'diario', texto: String(fila?.params ?? ''), esquema }
  const editables = [], otros = []
  for (const [k, v] of Object.entries(o)) {
    if (k === 'intervalo') continue
    if (esNumero(v)) editables.push({ nombre: k, valor: v, decl: declDe(esquema, k) })
    else otros.push({ nombre: k, texto: JSON.stringify(v) })
  }
  return { ok: true, editables, otros, intervalo: o.intervalo === 'semanal' ? 'semanal' : 'diario', esquema }
}

// El error de un parámetro (con su rango declarado, si lo tiene): «El parámetro «emaR» va de 2 a 200 (por ejemplo, 10).»
export function errorParametro(nombre, v, decl) {
  const que = `El parámetro «${nombre}»`
  if (!decl) return esNumero(v) ? null : `${que} tiene que ser un número.`
  const tipo = decl.tipo === 'entero' ? 'entero' : 'numero'
  return errorRango(que, v, { tipo, min: decl.min ?? null, max: decl.max ?? null }, decl.defecto ?? 1)
}
export function erroresParametros(lectura, valores) {
  const out = {}
  for (const p of lectura.editables) { const e = errorParametro(p.nombre, valores[p.nombre], p.decl); if (e) out[p.nombre] = e }
  return out
}

// Lo que se edita: { nombre, descripcion, valores: { nombre: número }, intervalo }.
export function estadoCodigo(fila) {
  const l = leeParametros(fila)
  return { nombre: fila?.name || '', descripcion: fila?.description || '', valores: Object.fromEntries(l.editables.map(p => [p.nombre, p.valor])), intervalo: l.intervalo }
}
// params con los cambios: si no cambia nada, el texto de siempre; si cambia, el mismo objeto con solo esos valores cambiados (en su
// sitio) y la temporalidad.
export function paramsNuevos(fila, est) {
  const o = paramsObjeto(fila?.params)
  if (!o) return { cambia: false, texto: fila?.params ?? null }
  let cambia = false
  for (const [k, v] of Object.entries(est.valores || {})) if (o[k] !== v) { o[k] = v; cambia = true }
  const ivAntes = o.intervalo === 'semanal' ? 'semanal' : 'diario'
  if (est.intervalo !== ivAntes) { o.intervalo = est.intervalo; cambia = true }
  return { cambia, texto: cambia ? JSON.stringify(o) : (typeof fila.params === 'string' ? fila.params : JSON.stringify(fila.params ?? {})) }
}

// Qué hace «Guardar». Devuelve { metodo: 'ninguno' | 'PUT' | 'POST', cuerpo, version } como planGuardado de las tarjetas.
//   PUT: solo los campos que cambian (el código y lo demás no se mandan, así que no se tocan).
//   POST (una copia, o la versión nueva): la fila entera, con el mismo código.
export function planGuardadoCodigo({ fila, est, enPrueba = [], estrategias = [] }) {
  const nombre = String(est.nombre || '').trim(), desc = String(est.descripcion || '').trim()
  const p = paramsNuevos(fila, est)
  const nuevaVersion = !!fila?.id && enPrueba.length > 0 && p.cambia
  const sv = nuevaVersion ? siguienteVersion(nombre, estrategias) : null
  const version = sv ? { nombre: sv.nombre, numero: sv.version, pruebas: enPrueba, deLaPrueba: partesNombre(fila.name).version } : null
  if (!fila?.id || nuevaVersion) {
    const cuerpo = { name: sv ? sv.nombre : nombre, description: desc || null, definition: fila.definition ?? {}, code_js: fila.code_js, params: p.texto }
    for (const k of ['visuals', 'color', 'years', 'capital_ini', 'allocation_pct', 'observations']) if (fila[k] !== undefined && fila[k] !== null) cuerpo[k] = fila[k]
    return { metodo: 'POST', cuerpo, version }
  }
  const cambios = {}
  if (nombre !== String(fila.name || '').trim()) cambios.name = nombre
  if (desc !== String(fila.description || '').trim()) cambios.description = desc || null
  if (p.cambia) cambios.params = p.texto
  return Object.keys(cambios).length ? { metodo: 'PUT', cuerpo: { id: fila.id, ...cambios }, version: null } : { metodo: 'ninguno', cuerpo: { id: fila.id }, version: null }
}

// La copia nueva de una estrategia de código («Copiar y editar»): todo igual, sin id y «<nombre> (copia)».
export const filaCopiaCodigo = (s) => ({ ...JSON.parse(JSON.stringify(s)), id: null, name: `${s.name} (copia)`, copiaDe: s.name })

// El resumen hecho con la IA (Groq): el mismo de la pantalla antigua.
export const PROMPT_RESUMEN = `You are a professional quantitative trading analyst. Analyze the following JavaScript backtesting strategy code and its JSON parameters. Generate a concise summary in Spanish (max 300 words) with these sections. Use only bullet points and plain text — no markdown bold (**text**), no ### headers:

INDICADORES: Technical indicators used. Periods and parameters taken from the JSON (JSON values always override code defaults).

CONDICIONES DE ENTRADA: Each entry condition and trigger mechanism.

GESTIÓN Y SALIDA: Stop loss placement, trailing mechanisms, and all exit conditions combined in one section.

FILTROS: Any market filters or trade restrictions. Omit this section if none.

Use exact parameter values from the JSON. Be concise.`
export const mensajesResumen = (codeJs, paramsTexto) => [
  { role: 'system', content: PROMPT_RESUMEN },
  { role: 'user', content: `CODE:\n${codeJs}\n\nPARAMS:\n${paramsTexto || '{}'}` },
]
