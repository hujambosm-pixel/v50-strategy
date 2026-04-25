// pages/api/generate-strategy.js
// Llama Anthropic API para generar code_js + code_pine + summary desde descripción en lenguaje natural

const SYSTEM = `You are a quantitative trading strategy developer. Given a strategy description, generate:
1. JavaScript backtesting code
2. Equivalent Pine Script v5
3. A brief summary

## JavaScript Code Interface

Define exactly ONE function called \`run\`. Available helpers (already in scope — do NOT redeclare or require them):
- calcEMA(closes_array, period) → number[]
- calcSMA(closes_array, period) → number[]
- calcRSI(closes_array, period) → number[]
- calcATR(bars_array, period) → number[]  (bars_array items have {high,low,close})
- calcMACD(closes_array, fast, slow, sig) → {line:number[], signal:number[]}

Function signature:
\`\`\`
function run(bars, params) {
  // bars: Array<{ date:string, open:number, high:number, low:number, close:number, volume:number }>
  // params: { capital_ini:number, years:number, allocation_pct:number }
  // Must return:
  return {
    trades: [
      { entryDate:'YYYY-MM-DD', exitDate:'YYYY-MM-DD', entryPrice:number, exitPrice:number }
    ],
    indicators: {
      emaR: number_array,   // optional — fast line shown on chart (length === bars.length)
      emaL: number_array,   // optional — slow line shown on chart
    }
  }
}
\`\`\`

Rules:
- ONE position at a time (no overlapping trades)
- Only long trades (buy low, sell high)
- entryDate/exitDate must be real dates from bars[]
- entryPrice/exitPrice must be real prices (use bar.close)
- Do NOT use Date constructor, Math.random(), or require()
- If a position is still open at the last bar, close it at the last bar's close
- Handle null values from indicator arrays (warm-up period)

## Response Format

Respond with ONLY a valid JSON object — no markdown fences, no explanation outside the JSON:
{
  "code_js": "function run(bars, params) { ... }",
  "code_pine": "//@version=5\\nstrategy(...) ...",
  "summary": "2-3 sentences describing the strategy logic"
}`

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { description } = req.body || {}
  if (!description?.trim()) return res.status(400).json({ error: 'description requerida' })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY no configurada en el servidor' })

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        system: SYSTEM,
        messages: [{ role: 'user', content: `Generate a backtesting strategy for: ${description}` }],
      }),
    })

    if (!resp.ok) {
      const err = await resp.text()
      return res.status(502).json({ error: `Anthropic error: ${err}` })
    }

    const data = await resp.json()
    const raw = data.content?.[0]?.text || ''

    // Extract JSON from response (may have surrounding whitespace)
    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) throw new Error('La respuesta no contiene JSON válido')

    const parsed = JSON.parse(match[0])
    if (!parsed.code_js) throw new Error('La respuesta no incluye code_js')

    return res.status(200).json({
      code_js:   parsed.code_js   || '',
      code_pine: parsed.code_pine || '',
      summary:   parsed.summary   || '',
    })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
