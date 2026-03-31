export default async function handler(req, res) {
  const { from } = req.query

  const period1 = from
    ? Math.floor(new Date(from).getTime() / 1000)
    : Math.floor(Date.now() / 1000) - 10 * 365 * 24 * 3600
  const period2 = Math.floor(Date.now() / 1000)

  try {
    // 1. SP500 daily closes from Yahoo Finance
    const sp500Url = `https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC?period1=${period1}&period2=${period2}&interval=1d`
    const sp500Res = await fetch(sp500Url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
      }
    })
    if (!sp500Res.ok) return res.status(500).json({ error: 'sp500 fetch failed: ' + sp500Res.status })
    const sp500Json = await sp500Res.json()
    const sp500Result = sp500Json?.chart?.result?.[0]
    const timestamps = sp500Result?.timestamp || []
    const closes = sp500Result?.indicators?.quote?.[0]?.close || []

    const sp500Map = {}
    for (let i = 0; i < timestamps.length; i++) {
      if (closes[i] == null) continue
      const date = new Date(timestamps[i] * 1000).toISOString().slice(0, 10)
      sp500Map[date] = closes[i]
    }
    if (!Object.keys(sp500Map).length) return res.status(404).json({ error: 'no sp500 data' })

    // 2. EUR/USD daily rates from Frankfurter
    const fromDate = new Date(period1 * 1000).toISOString().slice(0, 10)
    const toDate = new Date().toISOString().slice(0, 10)
    const fxUrl = `https://api.frankfurter.app/${fromDate}..${toDate}?from=EUR&to=USD`
    const fxRes = await fetch(fxUrl, { headers: { 'Accept': 'application/json' } })
    if (!fxRes.ok) return res.status(500).json({ error: 'fx fetch failed: ' + fxRes.status })
    const fxJson = await fxRes.json()
    const fxRates = fxJson?.rates || {}
    if (!Object.keys(fxRates).length) return res.status(404).json({ error: 'no fx data' })

    // 3. Merge all dates, forward-fill both series
    const allDates = [...new Set([...Object.keys(sp500Map), ...Object.keys(fxRates)])].sort()
    const history = []
    let lastSp500 = null, lastEurUsd = null

    for (const date of allDates) {
      if (sp500Map[date] != null) lastSp500 = sp500Map[date]
      if (fxRates[date]?.USD != null) lastEurUsd = fxRates[date].USD
      if (lastSp500 != null && lastEurUsd != null) {
        history.push({ date, sp500_usd: lastSp500, eur_usd: lastEurUsd })
      }
    }

    return res.status(200).json({ history })
  } catch(e) {
    return res.status(500).json({ error: e.message })
  }
}
