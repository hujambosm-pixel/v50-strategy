// lib/groq.js — la ÚNICA definición del modelo y la dirección de Groq, y la llamada que usan todos: los tooltips y el
// botón «Probar» de Ajustes (/api/groq-help), las condiciones en lenguaje natural (/api/conditions), el asistente de
// estrategias (/api/strategy-ai), la importación del diario (/api/tradelog) y el resumen de estrategias del editor
// (components/StrategyEditorPanel.js, que llama desde el navegador).
//
// POR QUÉ (V9.996). Groq retiró llama-3.1-8b-instant y llama-3.3-70b-versatile para las cuentas gratuitas y de
// desarrollador el 16/08/2026 (solo siguen para contratos de empresa): las peticiones con esos nombres devolvían error y
// «Probar» solo decía «Error». Su sustituto en producción es la familia openai/gpt-oss; se usa un solo modelo en todos
// los sitios, el grande, que es el sustituto que Groq indica para el 70b. Para cambiarlo, solo aquí.
//
// LA CLAVE es siempre la del usuario (Ajustes → Integraciones, en su navegador), que viaja en la cabecera x-groq-key
// (en /api/tradelog, en el cuerpo de la petición, como siempre).
// No hay variable de entorno: GROQ_API_KEY no existe en Vercel y, si existiera, pasaría por delante de la del usuario.
export const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
export const GROQ_MODELO = 'openai/gpt-oss-120b'

// gpt-oss razona antes de contestar y ese razonamiento cuenta dentro de max_tokens: con los topes de antes (200 tokens en
// un tooltip) podía gastarse todo pensando y devolver la respuesta vacía. Se le pide razonamiento bajo y se le da un
// margen fijo encima del tope de la respuesta.
const MARGEN_RAZONAMIENTO = 1000

// La clave de una petición a una ruta de /api: solo la cabecera x-groq-key.
export const claveGroqDe = (req) => String(req?.headers?.['x-groq-key'] || '').trim()

// Lo que dice Groq de un error: { status, codigo, mensaje }. Groq responde { error: { message, type, code } }.
export function errorGroq(status, texto) {
  let codigo = null, mensaje = String(texto || '').trim()
  try {
    const e = JSON.parse(texto)?.error
    if (e) { codigo = e.code || e.type || null; mensaje = e.message || mensaje }
  } catch (_) {}
  return { status, codigo, mensaje: mensaje || `HTTP ${status}` }
}
// «HTTP 404 · model_not_found: The model … does not exist», para enseñarlo tal cual.
export const textoErrorGroq = (e) => `HTTP ${e.status}${e.codigo ? ` · ${e.codigo}` : ''}${e.mensaje ? `: ${e.mensaje}` : ''}`

// Una llamada al chat de Groq. Devuelve { ok: true, texto } o { ok: false, error: { status, codigo, mensaje } }; un fallo
// de red sale con status 0. No lanza.
export async function llamaGroq(clave, { messages, max_tokens, temperature }) {
  try {
    const res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${clave}` },
      body: JSON.stringify({ model: GROQ_MODELO, messages, max_tokens: max_tokens + MARGEN_RAZONAMIENTO, temperature, reasoning_effort: 'low' }),
    })
    if (!res.ok) return { ok: false, error: errorGroq(res.status, await res.text()) }
    const data = await res.json()
    return { ok: true, texto: data?.choices?.[0]?.message?.content || '' }
  } catch (e) {
    return { ok: false, error: { status: 0, codigo: 'red', mensaje: e?.message || String(e) } }
  }
}

// La respuesta de una ruta de /api cuando Groq falla: 502 con el detalle, para que el cliente lo enseñe.
export const cuerpoErrorGroq = (e) => ({ error: `Groq: ${textoErrorGroq(e)}`, groq: e })
