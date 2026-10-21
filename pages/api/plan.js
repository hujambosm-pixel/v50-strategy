// pages/api/plan.js — ejecuta un PLAN DE INVERSIÓN (lib/planes/; docs/planes-inversion.md). Solo el motor: la pantalla
// definitiva irá en el futuro «Builder» guiado (decisión 9). Sirve para probarlo desde la app o con «Copiar para Claude».
//
//   POST { plan, rodantes?: { duracion?: 10, hastaElFinal?: false, desde?, hasta? } }
//   → { evaluacion: { plan: { medidas, ejecucion }, referencias: [...], comparaciones: [...] }, rodantes?, huella, tiempos }
//
// Datos: QQQ, SPY y el ETF del plan (QLD / TQQQ de la caché, o el sintético ×2 / ×3 sobre el QQQ de rentabilidad total, como
// CARTERA_3) desde 3 años antes del periodo (calentamiento de las medias de las piezas de cartera), con los dividendos de
// lib/dividendosCartera.json; y las velas de la referencia de cada pieza de cartera que la tenga (regla.referencia).
import { exigeAuth } from '../../lib/verificaJwt'
import { validaPlan, huellaPlan, usaEtf } from '../../lib/planes/plan'
import { evaluaPlan, iniciosRodantes } from '../../lib/planes/evalua'
import { alineaDatos, alineaVelasReferencia, preciosTotales } from '../../lib/laboratorioCartera'
import { construyeSintetico } from '../../lib/etfSintetico'
import SINTETICOS from '../../lib/etfSinteticos.json'
import DIVIDENDOS from '../../lib/dividendosCartera.json'

export const config = { maxDuration: 60 }
const SUPA_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPA_KEY = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const masDias = (f, d) => new Date(Date.parse(f + 'T00:00:00Z') + d * 864e5).toISOString().slice(0, 10)
const masAnios = (f, a) => `${Number(f.slice(0, 4)) + a}${f.slice(4)}`
const velasDe = (j) => (j?.fecha || []).map((date, i) => ({ date, open: j.open[i], high: j.high[i], low: j.low[i], close: j.close[i], volume: j.volumen[i] }))

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' })
  const auth = await exigeAuth('plan', req)
  if (!auth.ok) return res.status(401).json({ error: 'no autenticado' })
  const { plan, rodantes = null } = req.body || {}
  const errores = validaPlan(plan)
  if (rodantes && !(rodantes.duracion == null || (Number.isInteger(rodantes.duracion) && rodantes.duracion >= 1 && rodantes.duracion <= 30))) errores.push('La duración de los inicios rodantes, de 1 a 30 años.')
  if (errores.length) return res.status(400).json({ error: errores.join(' '), errores })
  const t0 = Date.now()
  const headers = { apikey: SUPA_KEY, Authorization: `Bearer ${req.headers['x-supa-jwt']}` }
  try {
    const d0 = rodantes?.desde && rodantes.desde < plan.periodo.desde ? rodantes.desde : plan.periodo.desde
    const d1 = rodantes?.hasta && rodantes.hasta > plan.periodo.hasta ? rodantes.hasta : plan.periodo.hasta
    const lee = async (sym) => {
      const r = await fetch(`${SUPA_URL}/rest/v1/rpc/leer_velas?p_simbolo=${encodeURIComponent(sym)}&p_desde=${masAnios(d0, -3)}&p_hasta=${masDias(d1, 5)}`, { headers })
      if (!r.ok) throw new Error(`Supabase respondió ${r.status} a leer_velas (${sym})`)
      return velasDe(await r.json())
    }
    const sint = ['x2', 'x3'].includes(plan.etf), conEtf = !!plan.etf
    const [qqq, spy, etfV] = await Promise.all([lee('QQQ'), lee('SPY'), conEtf && !sint ? lee(plan.etf) : Promise.resolve([])])
    const faltan = [['QQQ', qqq], ['SPY', spy], ...(conEtf && !sint ? [[plan.etf, etfV]] : [])].filter(([, v]) => !v.length).map(([s]) => s)
    if (faltan.length) return res.status(500).json({ error: `Faltan velas en la caché: ${faltan.join(', ')}.` })
    const k = plan.etf === 'x3' ? 3 : 2
    const etf = sint ? construyeSintetico(preciosTotales(qqq, DIVIDENDOS.simbolos.QQQ), { k, comision: SINTETICOS.comision[k], ajuste: SINTETICOS.ajuste[k] }) : etfV
    const datos = alineaDatos({ qqq, etf: { simbolo: sint ? 'SINTETICO' : (plan.etf || 'QQQ'), velas: conEtf ? etf : qqq }, spy }, sint ? { ...DIVIDENDOS.simbolos, SINTETICO: [] } : DIVIDENDOS.simbolos)
    if (!conEtf) datos.etf = datos.etf.map(() => null)
    // La referencia de las piezas de cartera que miran otro ticker.
    const refs = [...new Set(plan.piezas.filter(p => p.tipo === 'cartera' && p.regla?.referencia).map(p => p.regla.referencia))]
    if (refs.length) {
      const vr = await Promise.all(refs.map(lee)), falta = refs.filter((_, i) => !vr[i].length)
      if (falta.length) return res.status(500).json({ error: `Faltan velas en la caché: ${falta.join(', ')}.` })
      datos.velasRef = Object.fromEntries(refs.map((s, i) => [s, alineaVelasReferencia(datos.fechas, vr[i])]))
    }
    if (usaEtf(plan) && !conEtf) return res.status(400).json({ error: 'El plan usa el ETF pero no dice cuál (plan.etf).' })
    const t1 = Date.now()
    const evaluacion = evaluaPlan(plan, datos, { detalle: true })
    const ro = rodantes ? iniciosRodantes(plan, datos, { desde: rodantes.desde || plan.periodo.desde, hasta: rodantes.hasta || plan.periodo.hasta, duracion: rodantes.duracion ?? 10, hastaElFinal: !!rodantes.hastaElFinal }) : null
    return res.status(200).json({ evaluacion, ...(ro ? { rodantes: ro } : {}), huella: await huellaPlan(plan), tiempos: { datosMs: t1 - t0, calculoMs: Date.now() - t1 } })
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Error interno' })
  }
}
