// pages/api/closes.js — últimos N closes de cualquier ticker via Yahoo Finance
export default async function handler(req, res) {
  const { symbol, days = '300' } = req.query
  if (!symbol) return res.status(400).json({ error: 'symbol required' })

  const nDays = Math.min(Math.max(Number(days) || 300, 30), 1500)
  const period1 = Math.floor(Date.now() / 1000) - nDays * 24 * 3600
  const period2 = Math.floor(Date.now() / 1000)

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${period1}&period2=${period2}&interval=1d`
  try {
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
      }
    })
    if (!r.ok) return res.status(502).json({ error: `Yahoo fetch failed: ${r.status}` })
    const json = await r.json()
    const result = json?.chart?.result?.[0]
    const rawCloses = result?.indicators?.quote?.[0]?.close || []
    const closes = rawCloses.filter(v => v != null && !isNaN(v))
    if (closes.length < 10) return res.status(404).json({ error: `Sin datos para ${symbol}` })
    res.status(200).json(closes)
  } catch(e) {
    res.status(500).json({ error: e.message })
  }
}
