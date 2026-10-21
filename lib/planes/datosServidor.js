// lib/planes/datosServidor.js — los datos de un plan, leídos de la caché de Supabase (solo en el servidor): QQQ, SPY y el ETF
// del plan (QLD / TQQQ de la caché, o el sintético ×2 / ×3 sobre el QQQ de rentabilidad total, como CARTERA_3) desde 3 años
// antes de d0 hasta 5 días después de d1, con los dividendos de lib/dividendosCartera.json; y las velas de la referencia de
// cada pieza de cartera que la tenga. Lo usan pages/api/plan.js y pages/api/planes-lote.js.
import { alineaDatos, alineaVelasReferencia, preciosTotales } from '../laboratorioCartera'
import { construyeSintetico } from '../etfSintetico'
import SINTETICOS from '../etfSinteticos.json'
import DIVIDENDOS from '../dividendosCartera.json'

const masDias = (f, d) => new Date(Date.parse(f + 'T00:00:00Z') + d * 864e5).toISOString().slice(0, 10)
const masAnios = (f, a) => `${Number(f.slice(0, 4)) + a}${f.slice(4)}`
const velasDe = (j) => (j?.fecha || []).map((date, i) => ({ date, open: j.open[i], high: j.high[i], low: j.low[i], close: j.close[i], volume: j.volumen[i] }))

// Devuelve { datos } o { error } (faltan velas). supaUrl y headers: los de la petición (el JWT del usuario).
export async function cargaDatosPlan(plan, { d0, d1, supaUrl, headers, f = fetch }) {
  const lee = async (sym) => {
    const r = await f(`${supaUrl}/rest/v1/rpc/leer_velas?p_simbolo=${encodeURIComponent(sym)}&p_desde=${masAnios(d0, -3)}&p_hasta=${masDias(d1, 5)}`, { headers })
    if (!r.ok) throw new Error(`Supabase respondió ${r.status} a leer_velas (${sym})`)
    return velasDe(await r.json())
  }
  const sint = ['x2', 'x3'].includes(plan.etf), conEtf = !!plan.etf
  const [qqq, spy, etfV] = await Promise.all([lee('QQQ'), lee('SPY'), conEtf && !sint ? lee(plan.etf) : Promise.resolve([])])
  const faltan = [['QQQ', qqq], ['SPY', spy], ...(conEtf && !sint ? [[plan.etf, etfV]] : [])].filter(([, v]) => !v.length).map(([s]) => s)
  if (faltan.length) return { error: `Faltan velas en la caché: ${faltan.join(', ')}.` }
  const k = plan.etf === 'x3' ? 3 : 2
  const etf = sint ? construyeSintetico(preciosTotales(qqq, DIVIDENDOS.simbolos.QQQ), { k, comision: SINTETICOS.comision[k], ajuste: SINTETICOS.ajuste[k] }) : etfV
  const datos = alineaDatos({ qqq, etf: { simbolo: sint ? 'SINTETICO' : (plan.etf || 'QQQ'), velas: conEtf ? etf : qqq }, spy }, sint ? { ...DIVIDENDOS.simbolos, SINTETICO: [] } : DIVIDENDOS.simbolos)
  if (!conEtf) datos.etf = datos.etf.map(() => null)
  const refs = [...new Set(plan.piezas.filter(p => p.tipo === 'cartera' && p.regla?.referencia).map(p => p.regla.referencia))]
  if (refs.length) {
    const vr = await Promise.all(refs.map(lee)), falta = refs.filter((_, i) => !vr[i].length)
    if (falta.length) return { error: `Faltan velas en la caché: ${falta.join(', ')}.` }
    datos.velasRef = Object.fromEntries(refs.map((s, i) => [s, alineaVelasReferencia(datos.fechas, vr[i])]))
  }
  return { datos }
}
