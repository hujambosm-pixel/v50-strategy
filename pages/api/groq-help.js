// pages/api/groq-help.js — Tooltips de ayuda con Groq API (y el botón «Probar» de Ajustes)
// La clave es la del usuario (cabecera x-groq-key); el modelo y la dirección, los de lib/groq.js.
import { claveGroqDe, llamaGroq, cuerpoErrorGroq } from '../../lib/groq'

const SYSTEM_PROMPT = `Eres el asistente de ayuda integrado en una aplicación de backtesting de estrategias de trading basada en cruces de EMAs (V50 Strategy App).
Tu función es explicar de forma PRECISA y TÉCNICA el funcionamiento de cada parámetro o concepto de la aplicación.

REGLAS ESTRICTAS:
- Responde ÚNICAMENTE sobre el parámetro o concepto preguntado.
- Sé EXACTO y TÉCNICO. No inventes ni aproximes.
- Máximo 4-5 frases. Formato: explicación directa, sin saludos ni relleno.
- Si el concepto tiene impacto en la estrategia, menciona ese impacto.
- No uses markdown (negrita, cursiva, listas). Solo texto plano.`

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const { topic, context } = req.body
  if (!topic) return res.status(400).json({ error: 'topic requerido' })

  const apiKey = claveGroqDe(req)
  if (!apiKey) return res.status(400).json({ error: 'No hay Groq API Key configurada. Añádela en ⚙ Configuración.' })

  const r = await llamaGroq(apiKey, {
    max_tokens: 200,
    temperature: 0.1,   // muy baja → respuestas precisas y consistentes
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `Explica este parámetro de la app: "${topic}"${context ? `. Contexto adicional: ${context}` : ''}` }
    ]
  })
  if (!r.ok) return res.status(502).json(cuerpoErrorGroq(r.error))
  res.status(200).json({ text: r.texto })
}
