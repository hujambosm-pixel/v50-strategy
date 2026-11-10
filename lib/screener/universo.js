// lib/screener/universo.js — QUÉ EMPRESAS mira el screener (docs/screener.md). Lógica PURA: recibe las listas ya leídas.
//
// Universo (decisión de Sergi, 07/11): S&P 500 (lista actual de Wikipedia) + Nasdaq-100 (miembros actuales de
// public.universo_miembros) + los valores de las listas de la Watchlist que presentan cuentas a la SEC. Unas 600 empresas.
// Las empresas que han salido del índice o de las listas se quedan en la base con sus marcas a false (no se borran: más
// adelante servirán para probar vistas en el pasado sin el sesgo de supervivencia).
//
// SÍMBOLOS. Se guardan como en Yahoo (el resto de la app usa esos): «BRK.B» de Wikipedia o de la SEC pasa a «BRK-B».

// CIK ANTERIOR: empresas que se han reorganizado en una sociedad nueva (otra CIK) que aún no ha presentado cuentas anuales;
// mientras, sus cuentas se leen de la CIK de antes. Revisar en cada carga: cuando la nueva tenga su 10-K, quitarla de aquí.
export const CIK_ANTERIOR = Object.freeze({
  2115436: 34088,   // ExxonMobil (XOM): nueva sociedad matriz en 2026; las cuentas siguen en Exxon Mobil Corp
})

export const aYahoo = (s) => String(s || '').trim().toUpperCase().replace(/\./g, '-')

// sp500: [{ simbolo, nombre, gics, cik }] · ndx: [{ simbolo_yahoo, nombre }] · listas: [símbolo de Yahoo]
// tickersSec: el company_tickers.json de la SEC ({ "0": { cik_str, ticker, title }, … }).
// Devuelve [{ simbolo, cik, nombre, gics, en_sp500, en_ndx, en_listas }] por orden alfabético, y aparte los que no se
// encontraron en la SEC (sinCik), que no entran (sin CIK no hay cuentas).
export function universoDe({ sp500 = [], ndx = [], listas = [], tickersSec = {} }) {
  const sec = new Map()
  for (const t of Object.values(tickersSec)) {
    const s = aYahoo(t.ticker)
    if (!sec.has(s)) sec.set(s, { cik: Number(t.cik_str), nombre: t.title })
  }
  const m = new Map()
  const toma = (simbolo) => {
    const s = aYahoo(simbolo)
    if (!s) return null
    if (!m.has(s)) m.set(s, { simbolo: s, cik: null, nombre: null, gics: null, en_sp500: false, en_ndx: false, en_listas: false })
    return m.get(s)
  }
  for (const e of sp500) { const f = toma(e.simbolo); if (!f) continue; f.en_sp500 = true; f.gics = e.gics || null; f.nombre = e.nombre || f.nombre; if (e.cik) f.cik = Number(e.cik) }
  for (const e of ndx) { const f = toma(e.simbolo_yahoo); if (!f) continue; f.en_ndx = true; f.nombre = f.nombre || e.nombre || null }
  // De las listas, solo los que la SEC conoce (fuera índices, ETF de fuera, criptomonedas, futuros…).
  for (const s of listas) { if (sec.has(aYahoo(s))) toma(s).en_listas = true }
  const sinCik = []
  const res = []
  for (const f of [...m.values()].sort((a, b) => a.simbolo < b.simbolo ? -1 : a.simbolo > b.simbolo ? 1 : 0)) {
    const s = sec.get(f.simbolo)
    if (!f.cik && s) f.cik = s.cik
    if (!f.nombre && s) f.nombre = s.nombre
    if (!f.cik) { sinCik.push(f.simbolo); continue }
    res.push(f)
  }
  return { empresas: res, sinCik }
}

// La tabla «constituents» de la página de Wikipedia del S&P 500 → [{ simbolo, nombre, gics, cik }]. Columnas: símbolo,
// nombre, sector GICS, subsector, sede, fecha de alta, CIK, fundación. Si la página cambia de forma, devuelve [] y quien
// llama debe parar (no se puede «perder» el S&P 500 en silencio).
export function sp500DeWikipedia(html) {
  const i = String(html || '').indexOf('id="constituents"')
  if (i < 0) return []
  const tabla = html.slice(i, html.indexOf('</table>', i))
  const limpio = (s) => s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#160;/g, ' ').replace(/&nbsp;/g, ' ').trim()
  const res = []
  for (const fila of tabla.split('<tr').slice(1)) {
    const c = fila.split(/<td[^>]*>/).slice(1).map(limpio)
    if (c.length < 7) continue
    res.push({ simbolo: c[0], nombre: c[1], gics: c[2], cik: Number(c[6]) || null })
  }
  return res
}
