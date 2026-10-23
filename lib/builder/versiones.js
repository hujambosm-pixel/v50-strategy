// lib/builder/versiones.js — las VERSIONES de una estrategia del Builder (docs/builder.md, §10). Puro.
// Una prueba congelada guarda su propia COPIA de cada estrategia (lote.variantes[].definicion y valores), así que cambiar la
// estrategia nunca cambia lo probado. Para que la estrategia probada siga además en «Mis estrategias» tal como se probó, al
// guardar un cambio de una estrategia que ya está en alguna prueba no se sobrescribe: se crea una estrategia nueva con el mismo
// nombre y « · versión N». No hay columna ni campo nuevo: la versión se lee del nombre (sin sufijo, la versión 1).
import { valoresDe } from '../editor/definicion'

const RE = /^(.*?) · versión (\d+)$/

export function partesNombre(nombre) {
  const s = String(nombre || '').trim(), m = s.match(RE)
  return m ? { base: m[1], version: Number(m[2]) } : { base: s, version: 1 }
}
export const nombreVersion = (base, version) => version > 1 ? `${base} · versión ${version}` : base
// La versión siguiente de `nombre` entre las estrategias que ya existen (la mayor con la misma base, + 1).
export function siguienteVersion(nombre, estrategias = []) {
  const { base, version } = partesNombre(nombre)
  const max = estrategias.reduce((m, s) => { const p = partesNombre(s?.name); return p.base === base ? Math.max(m, p.version) : m }, version)
  return { base, version: max + 1, nombre: nombreVersion(base, max + 1) }
}

// Qué hace «Guardar y pasar al paso 2» (lo mismo que guarda el editor de siempre, components/EditorPanel.js: la definición con su
// nombre y descripción y, en params, los valores de sus parámetros con la temporalidad).
//   fila: la de partida (con id si está guardada); est: { def, valores, nombre, descripcion } en pantalla; orig: el est de partida;
//   enPrueba: las pruebas congeladas donde está la estrategia de partida (nombres); estrategias: todas (para numerar la versión).
// Devuelve { metodo: 'ninguno' | 'POST' | 'PUT', cuerpo, version: null | { nombre, numero, pruebas, deLaPrueba } }.
// La definición solo cambia lo que ha cambiado: abierta y guardada sin tocar, es la misma, byte a byte (y no se escribe nada).
export function planGuardado({ fila, est, orig, enPrueba = [], estrategias = [], cambiaRegla }) {
  const nombre = String(est.nombre || '').trim(), desc = String(est.descripcion || '').trim()
  const nuevaVersion = !!fila?.id && enPrueba.length > 0 && cambiaRegla
  const sv = nuevaVersion ? siguienteVersion(nombre, estrategias) : null
  const nombreFinal = sv ? sv.nombre : nombre
  let def = est.def
  if (def.nombre !== nombreFinal) def = { ...def, nombre: nombreFinal }
  if (desc && def.descripcion !== desc) def = { ...def, descripcion: desc }
  const cuerpo = { name: nombreFinal, description: desc || null, definition: def, params: { ...valoresDe(def, est.valores), intervalo: est.valores?.intervalo === 'semanal' ? 'semanal' : 'diario' } }
  const version = sv ? { nombre: sv.nombre, numero: sv.version, pruebas: enPrueba, deLaPrueba: partesNombre(fila.name).version } : null
  if (!fila?.id || nuevaVersion) return { metodo: 'POST', cuerpo: { ...cuerpo, years: fila?.years ?? 5, capital_ini: fila?.capital_ini ?? 10000, color: fila?.color || '#a78bfa' }, version }
  const igual = JSON.stringify(est.def) === JSON.stringify(orig.def) && JSON.stringify(est.valores) === JSON.stringify(orig.valores) && nombre === String(orig.nombre || '').trim() && desc === String(orig.descripcion || '').trim()
  return { metodo: igual ? 'ninguno' : 'PUT', cuerpo: { id: fila.id, ...cuerpo }, version: null }
}
// El aviso ANTES de guardar cuando se va a crear una versión nueva.
export const avisoVersion = (v) => {
  const ps = v.pruebas.map(p => `«${p}»`), y = (xs) => xs.length > 1 ? `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}` : xs[0]
  return `Esta estrategia ya está en ${ps.length > 1 ? 'las pruebas' : 'la prueba'} ${y(ps)}. Al guardar se creará la versión ${v.numero} («${v.nombre}»); ${ps.length > 1 ? 'las pruebas' : 'la prueba'} ${y(ps)} ${ps.length > 1 ? 'seguirán' : 'seguirá'} con la versión ${v.deLaPrueba}.`
}
