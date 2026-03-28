export default async function handler(req, res) {
  const { symbol } = req.query
  if (!symbol) return res.status(400).json({error:'symbol required'})
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=3mo`
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
      }
    })
    if (!r.ok) return res.status(404).json({error:'no data'})
    const json = await r.json()
    const closes = json?.chart?.result?.[0]?.indicators?.quote?.[0]?.close
    if (!closes?.length) return res.status(404).json({error:'no closes'})
    const prices = closes.filter(p => p != null)
    return res.status(200).json({prices})
  } catch(e) {
    return res.status(500).json({error:e.message})
  }
}
