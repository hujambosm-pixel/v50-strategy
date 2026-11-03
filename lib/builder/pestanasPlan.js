// lib/builder/pestanasPlan.js — las PESTAÑAS DE PLANES del paso 3 (docs/builder.md, §54): qué planes están abiertos y en qué orden, cuál se abre al entrar y cuáles
// caben en la fila. Puro: no toca la red ni React. Cada pestaña es una clave: «g<id>» (un plan guardado) o «n<k>» (uno nuevo, sin guardar).
export const claveDe = (id) => `g${id}`
export const idDe = (clave) => clave?.startsWith('g') ? Number(clave.slice(1)) : null
// Lo que se guarda en la base: los ids de los planes guardados abiertos, en orden. Un plan nuevo sin guardar no se recuerda.
export const idsDe = (orden) => (orden || []).map(idDe).filter(x => x != null)
// Las pestañas al entrar. guardadas: los ids leídos de la base (si un plan ya no existe, se ignora); null: esta persona aún no tiene fila, y se abren todos sus planes.
export function ordenInicial(guardadas, planes) {
  if (guardadas == null) return planes.map(p => claveDe(p.id))
  const hay = new Set(planes.map(p => Number(p.id)))
  return [...new Set(guardadas.map(Number))].filter(id => hay.has(id)).map(claveDe)
}
export const conPestana = (orden, clave) => orden.includes(clave) ? orden : [...orden, clave]
export const sinPestana = (orden, clave) => orden.filter(x => x !== clave)
export const trasDe = (orden, clave, nueva) => { const k = orden.indexOf(clave); return k < 0 ? [...orden, nueva] : [...orden.slice(0, k + 1), nueva, ...orden.slice(k + 1)] }
export const cambiaClave = (orden, vieja, nueva) => orden.map(x => x === vieja ? nueva : x)
// La pestaña que se abre al cerrar `clave`: la siguiente o, si era la última, la anterior; null si no queda ninguna.
export function vecina(orden, clave) {
  const k = orden.indexOf(clave), resto = sinPestana(orden, clave)
  return k < 0 || !resto.length ? null : resto[Math.min(k, resto.length - 1)]
}
// Qué se abre al entrar en el paso 3: { clave } (un plan guardado, que se añade a las pestañas si no estaba), { nuevo: true } (un plan nuevo) o { clave: null } (ninguna: «Ningún plan abierto»).
//   planId: el pedido desde una tesis. Si ya no existe, además { noExiste: true }, y se sigue como si se entrara sin pedir nada.
//   estrategiaId: el plan guardado más reciente de esa estrategia; sin ninguno, un plan nuevo con ella. Sin estrategia: el más reciente de los abiertos.
export function eligeEntrada({ planes, orden, estrategiaId = null, planId = null, fotoDe }) {
  const reciente = (xs) => [...xs].sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))[0] || null
  const noExiste = planId != null && !planes.some(p => Number(p.id) === Number(planId))
  if (planId != null && !noExiste) return { clave: claveDe(planId) }
  const extra = noExiste ? { noExiste: true } : {}
  if (estrategiaId != null) {
    const r = reciente(planes.filter(p => String(fotoDe(p.plan)?.id) === String(estrategiaId)))
    return r ? { clave: claveDe(r.id), ...extra } : { nuevo: true, ...extra }
  }
  const r = reciente(planes.filter(p => orden.includes(claveDe(p.id))))
  if (r) return { clave: claveDe(r.id), ...extra }
  const nueva = orden.find(c => idDe(c) == null)
  if (nueva) return { clave: nueva, ...extra }
  return planes.length ? { clave: null, ...extra } : { nuevo: true, ...extra }
}

// ── Cuáles caben en la fila (sin medir el navegador: una estimación por el nombre, un poco por encima para no quedarse corto) ──
export const ANCHO_NOMBRE_MAX = 170, ANCHO_ICONOS = 84, ANCHO_ANADIR = 150, ANCHO_MAS = 62, HUECO_PESTANAS = 6
export const anchoPestana = (nombre) => Math.min(ANCHO_NOMBRE_MAX, 24 + String(nombre || '').length * 7.6) + ANCHO_ICONOS
// claves: en orden; anchos: { clave: px }; disponible: el ancho de la fila para las pestañas. La abierta se ve siempre: si no cabe en su sitio, ocupa el último hueco.
export function repartePestanas(claves, anchos, disponible, actual) {
  const a = (c) => anchos[c] + HUECO_PESTANAS
  if (claves.reduce((s, c) => s + a(c), 0) <= disponible) return { visibles: claves, ocultas: [] }
  const hueco = disponible - ANCHO_MAS
  let visibles = []
  let usado = 0
  for (const c of claves) { if (usado + a(c) > hueco) break; visibles.push(c); usado += a(c) }
  if (actual && claves.includes(actual) && !visibles.includes(actual)) {
    while (visibles.length && usado + a(actual) > hueco) usado -= a(visibles.pop())
    visibles.push(actual)
  }
  if (!visibles.length && claves.length) visibles = [claves[0]]
  return { visibles, ocultas: claves.filter(c => !visibles.includes(c)) }
}
