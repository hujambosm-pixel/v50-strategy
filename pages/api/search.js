// pages/api/search.js
// Proxy a Yahoo Finance para buscar nombre real de un símbolo
export default async function handler(req, res) {
  const { q } = req.query
  if (!q || q.length < 1) return res.status(400).json({ error: 'Falta símbolo' })

  try {
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=8&newsCount=0&enableFuzzyQuery=false&quotesQueryId=tss_match_phrase_query`
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'application/json',
      }
    })
    if (!r.ok) return res.status(200).json([])
    const data = await r.json()
    const quotes = (data.quotes || []).slice(0, 8)
    res.status(200).json(quotes.map(q => ({
      symbol: q.symbol,
      name: q.shortname || q.longname || q.symbol,
      type: q.typeDisp || q.quoteType || '',
      exchange: q.exchDisp || q.exchange || '',
    })))
  } catch (e) {
    // Nunca fallar al cliente, devolver vacío
    res.status(200).json([])
  }
}
