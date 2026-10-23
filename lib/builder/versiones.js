// lib/builder/versiones.js — las VERSIONES de una estrategia del Builder (docs/builder.md, §10). Puro.
// Una prueba congelada guarda su propia COPIA de cada estrategia (lote.variantes[].definicion y valores), así que cambiar la
// estrategia nunca cambia lo probado. Para que la estrategia probada siga además en «Mis estrategias» tal como se probó, al
// guardar un cambio de una estrategia que ya está en alguna prueba no se sobrescribe: se crea una estrategia nueva con el mismo
// nombre y « · versión N». No hay columna ni campo nuevo: la versión se lee del nombre (sin sufijo, la versión 1).
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
