// pages/api/chartdata.js — OHLCV data for a single symbol (used by signal comparison charts)

async function fetchOHLCV(symbol, years = 5) {
  try {
    const encoded = encodeURIComponent(symbol)
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encoded}?interval=1d&range=${Math.min(years, 20)}y`
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
      }
    })
    if (!res.ok) return null
    const json = await res.json()
    const timestamps = json?.chart?.result?.[0]?.timestamp
    const q = json?.chart?.result?.[0]?.indicators?.quote?.[0]
    if (!timestamps?.length) return null
    return timestamps.map((ts, i) => ({
      date: new Date(ts * 1000).toISOString().slice(0, 10),
      open:  q?.open?.[i]  ?? null,
      high:  q?.high?.[i]  ?? null,
      low:   q?.low?.[i]   ?? null,
      close: q?.close?.[i] ?? null,
    })).filter(d => d.close && !isNaN(d.close))
      .sort((a, b) => a.date.localeCompare(b.date))
  } catch { return null }
}

export default async function handler(req, res) {
  const { symbol, years = '5' } = req.query
  if (!symbol) return res.status(400).json({ error: 'symbol required' })
  try {
    const y = Math.min(Number(years) || 5, 20)
    const data = await fetchOHLCV(symbol, y)
    if (!data?.length) return res.status(404).json({ error: `Sin datos para ${symbol}` })
    res.status(200).json(data)
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error interno' })
  }
}
