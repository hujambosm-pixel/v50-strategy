// lib/respuestaMc.js — lectura de las respuestas de /api/multibacktest en el navegador, y resumen de una curva de
// referencia (B&H de QQQ o del universo).
//
// LÍMITE DE TAMAÑO. Vercel corta las respuestas de más de 4,5 MB y devuelve su propia página de error (413,
// FUNCTION_PAYLOAD_TOO_LARGE), que no es JSON: res.json() fallaba con un «Unexpected token» que no dice nada. Aquí se
// reconoce y se explica qué hacer. Cualquier otra respuesta que no sea JSON da un error con su código HTTP.
export const LIMITE_RESPUESTA_MB = 4.5
export const MENSAJE_DEMASIADO_GRANDE = `La respuesta del servidor supera el límite de ${String(LIMITE_RESPUESTA_MB).replace('.', ',')} MB de Vercel. `
  + 'Divide el periodo en tramos más cortos (por ejemplo, de 5 años) o usa menos activos.'

export function esDemasiadoGrande(status, texto) {
  return status === 413 || /PAYLOAD_TOO_LARGE|Entity Too Large/i.test(String(texto || ''))
}

// El JSON de la respuesta (con su error de siempre si lo trae); si no es JSON, lanza un Error con el motivo.
export async function leeRespuestaMc(res) {
  const texto = await res.text()
  try { return JSON.parse(texto) } catch (_) {}
  if (esDemasiadoGrande(res.status, texto)) throw new Error(MENSAJE_DEMASIADO_GRANDE)
  throw new Error(`Respuesta no válida del servidor (HTTP ${res.status}).`)
}

// CAGR (con la misma cuenta que la curva compuesta en el cliente) y caída máxima de una curva [{ date, value }].
export function resumenCurva(curva) {
  if (!curva || curva.length < 2) return null
  const a = curva[0], b = curva[curva.length - 1]
  const anios = (new Date(b.date) - new Date(a.date)) / (365.25 * 864e5)
  const cagr = (Math.pow(Math.max(b.value, 0.01) / Math.max(a.value, 0.01), 1 / Math.max(anios, 0.01)) - 1) * 100
  let pico = -Infinity, maxDD = 0
  for (const p of curva) { if (p.value > pico) pico = p.value; if (pico > 0) maxDD = Math.max(maxDD, (pico - p.value) / pico * 100) }
  return { cagr, maxDD }
}
