// pages/api/chartdata.js — OHLCV data for a single symbol (used by signal comparison charts)

function stooqSym(symbol) {
  const MAP={
    '^GSPC':'spy.us','^NDX':'ndx.us','^IBEX':'ibex.es','^GDAXI':'dax.de',
    '^FTSE':'ftse.uk','^N225':'n225.jp','BTC-USD':'btc-usd.v','ETH-USD':'eth-usd.v',
    'GC=F':'gc.f','CL=F':'cl.f',
    '^IXIC':'ndx.us','^DJI':'dji.us','^FCHI':'cac.fr','^STOXX50E':'sx5e.de','^HSI':'hsi.hk',
  }
  if(MAP[symbol]) return MAP[symbol]
  if(symbol.endsWith('=F')) return symbol.replace('=F','').toLowerCase()+'.f'
  if(symbol.includes('-')) return symbol.toLowerCase()+'.v'
  if(symbol.startsWith('^')) return symbol.slice(1).toLowerCase()+'.us'
  return symbol.toLowerCase()+'.us'
}

async function fetchOHLCV(symbol) {
  const sym = stooqSym(symbol)
  const url = `https://stooq.com/q/d/l/?s=${sym}&i=d`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10000)
  try {
    const res = await fetch(url, { signal: controller.signal })
    const text = await res.text()
    if (!text || text.includes('No data') || text.trim().length < 50) return null
    return text.trim().split('\n').slice(1).filter(l => l.trim()).map(l => {
      const [date, open, high, low, close] = l.split(',')
      return { date, open: parseFloat(open), high: parseFloat(high), low: parseFloat(low), close: parseFloat(close) }
    }).filter(d => d.close && !isNaN(d.close)).sort((a, b) => a.date.localeCompare(b.date))
  } catch { return null }
  finally { clearTimeout(timer) }
}

export default async function handler(req, res) {
  const { symbol, years = '5' } = req.query
  if (!symbol) return res.status(400).json({ error: 'symbol required' })
  try {
    const data = await fetchOHLCV(symbol)
    if (!data?.length) return res.status(404).json({ error: `Sin datos para ${symbol}` })
    const cutoff = new Date()
    cutoff.setFullYear(cutoff.getFullYear() - Math.min(Number(years) || 5, 20))
    const cutoffStr = cutoff.toISOString().slice(0, 10)
    const filtered = data.filter(d => d.date >= cutoffStr)
    res.status(200).json(filtered)
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error interno' })
  }
}
