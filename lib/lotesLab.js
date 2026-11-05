// lib/lotesLab.js — la HUELLA (sha256 del JSON canónico) con que se congelan las pruebas del paso 2, las estrategias y los
// planes; la «mezcla fija» de la alternativa 50 % QQQ + 50 % ETF de los planes (lib/planes/evalua.js), y la forma de la fila
// de un lote de planes (pages/api/planes-lote.js). Puro (la huella usa crypto.subtle, que existe igual en el navegador y en
// Node). Los lotes del Laboratorio (LOTE_1–3) y de Carteras (CARTERA_1–3) se retiraron (docs/builder.md, §74 y §75).
//
// HUELLA: sha256 del JSON CANÓNICO (claves de los objetos en orden, sin espacios; los arrays conservan su orden).

// JSON canónico: objetos con las claves ordenadas, recursivamente.
export function jsonCanonico(x) {
  if (x === null || typeof x !== 'object') return JSON.stringify(x)
  if (Array.isArray(x)) return '[' + x.map(jsonCanonico).join(',') + ']'
  return '{' + Object.keys(x).filter(k => x[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + jsonCanonico(x[k])).join(',') + '}'
}
export async function sha256Hex(texto) {
  const datos = new TextEncoder().encode(texto)
  const h = await globalThis.crypto.subtle.digest('SHA-256', datos)
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('')
}
export const huella = (x) => sha256Hex(jsonCanonico(x))

// ── Mezcla fija (la usa la alternativa «Lo mismo a 50 % QQQ + 50 % ETF» de los planes, lib/planes/evalua.js) ──
// «Mezcla fija»: un único estado con qqq % QQQ + (100 − qqq) % ETF y un rebalanceo por calendario a esos pesos. No elige
// momentos: no tiene prueba contra el azar. Con qqq = 100 es comprar y mantener QQQ; con qqq = 0, comprar y mantener el ETF.
export const reglaMezcla = (qqq = 50, frecuencia = 'anual') => ({
  id: 'mezcla', nombre: 'Mezcla fija', inicial: 'MEZCLA',
  estados: { MEZCLA: { nombre: 'Mezcla', composicion: `${qqq} % QQQ + ${100 - qqq} % ETF (rebalanceo ${frecuencia})`, pesos: { QQQ: qqq / 100, ETF: (100 - qqq) / 100 } } },
  transiciones: [{ desde: 'MEZCLA', hacia: 'MEZCLA', calendario: frecuencia, rebalancea: true }],
})

// La ejecución de un LOTE DE PLANES (V9.1033, lib/planes/lotes.js; congelado en editor_lotes con tipo 'planes').
export const esConfigPlanLote = (config) => config?.prueba === 'planLote'
// Errores de una configuración del registro (lab_pruebas): hoy solo la ejecución de un lote de planes.
export function validaConfig(config) {
  if (esConfigPlanLote(config)) return /^[0-9a-f]{64}$/.test(config?.hashLote || '') && Array.isArray(config?.variantes) && config.variantes.length && config.variantes.every(v => v?.id && /^[0-9a-f]{64}$/.test(v.huella || '')) ? [] : ['La ejecución de un lote de planes necesita la huella del lote y las de sus variantes.']
  return ['Configuración no válida: el registro solo admite la ejecución de un lote de planes.']
}
