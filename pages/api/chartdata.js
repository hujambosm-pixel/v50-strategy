// pages/api/chartdata.js — OHLCV data for a single symbol (used by signal comparison charts)
//
// El volumen se pide y se devuelve aunque hoy no lo dibuje nadie: el nombre del endpoint ya decía OHLCV
// y solo entregaba OHLC, así que AssetSignalChart no podía tener un panel de volumen ni queriendo. Va
// como `?? null` igual que el resto de campos; una barra sin volumen no se descarta, porque el filtro
// de barras válidas sigue siendo el cierre.

// `interval` es '1d' o '1wk', y NUNCA llega crudo del cliente: quien llama lo valida antes contra esos
// dos valores. El diario es el valor por defecto en los dos niveles, así que los usos que no lo pidan
// —la parrilla de minigráficos y el backtest individual— no cambian en nada.
async function fetchOHLCV(symbol, years = 5, interval = '1d') {
  try {
    const encoded = encodeURIComponent(symbol)
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encoded}?interval=${interval}&range=${Math.min(years, 20)}y`
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
      volume: q?.volume?.[i] ?? null,
    })).filter(d => d.close && !isNaN(d.close))
      .sort((a, b) => a.date.localeCompare(b.date))
  } catch { return null }
}

export default async function handler(req, res) {
  const { symbol, years = '5', intervalo } = req.query
  if (!symbol) return res.status(400).json({ error: 'symbol required' })
  try {
    const y = Math.min(Number(years) || 5, 20)
    // Lista cerrada: cualquier otra cosa cae en diario. Nada del cliente llega a la URL del proveedor.
    const iv = intervalo === 'semanal' || intervalo === '1wk' ? '1wk' : '1d'
    const data = await fetchOHLCV(symbol, y, iv)
    if (!data?.length) return res.status(404).json({ error: `Sin datos para ${symbol}` })
    res.status(200).json(data)
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error interno' })
  }
}
