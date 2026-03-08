// pages/api/groq-help.js — Tooltips de ayuda con Groq API
// Requiere variable de entorno: GROQ_API_KEY

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

  // Key priority: env var (Vercel) → header from client (localStorage)
  const apiKey = process.env.GROQ_API_KEY || req.headers['x-groq-key'] || ''
  if (!apiKey) return res.status(400).json({ error: 'No hay Groq API Key configurada. Añádela en ⚙ Configuración.' })

  try {
    const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        max_tokens: 200,
        temperature: 0.1,   // muy baja → respuestas precisas y consistentes
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Explica este parámetro de la app: "${topic}"${context ? `. Contexto adicional: ${context}` : ''}` }
        ]
      })
    })
    if (!resp.ok) {
      const err = await resp.text()
      return res.status(502).json({ error: `Groq error: ${err}` })
    }
    const data = await resp.json()
    const text = data.choices?.[0]?.message?.content || ''
    res.status(200).json({ text })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
