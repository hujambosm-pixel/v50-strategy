// pages/api/plan.js — ejecuta un PLAN DE INVERSIÓN (lib/planes/; docs/planes-inversion.md). Solo el motor: la pantalla
// definitiva irá en el futuro «Builder» guiado (decisión 9). Sirve para probarlo desde la app o con «Copiar para Claude».
//
//   POST { plan, rodantes?: { duracion?: 10, hastaElFinal?: false, desde?, hasta? } }
//   → { evaluacion: { plan: { medidas, ejecucion }, referencias: [...], comparaciones: [...], descorrelacion? }, rodantes?, huella, tiempos }
//
// Datos: lib/planes/datosServidor.js (QQQ, SPY y el ETF del plan, con dividendos, desde 3 años antes del periodo; las velas de
// la referencia de cada pieza de cartera que la tenga; con una pieza «estrategia», las del valor, del ocioso y de los índices de
// su regla: docs/builder.md §47).
import { exigeAuth } from '../../lib/verificaJwt'
import { validaPlan, huellaPlan, usaEtf } from '../../lib/planes/plan'
import { evaluaPlan, iniciosRodantes } from '../../lib/planes/evalua'
import { cargaDatosPlan } from '../../lib/planes/datosServidor'

export const config = { maxDuration: 60 }
const SUPA_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPA_KEY = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

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
    if (usaEtf(plan) && !plan.etf) return res.status(400).json({ error: 'El plan usa el ETF pero no dice cuál (plan.etf).' })
    const c = await cargaDatosPlan(plan, { d0, d1, supaUrl: SUPA_URL, headers })
    if (c.error) return res.status(500).json({ error: c.error })
    const t1 = Date.now()
    const evaluacion = evaluaPlan(plan, c.datos, { detalle: true })
    const ro = rodantes ? iniciosRodantes(plan, c.datos, { desde: rodantes.desde || plan.periodo.desde, hasta: rodantes.hasta || plan.periodo.hasta, duracion: rodantes.duracion ?? 10, hastaElFinal: !!rodantes.hastaElFinal }) : null
    return res.status(200).json({ evaluacion, ...(ro ? { rodantes: ro } : {}), huella: await huellaPlan(plan), tiempos: { datosMs: t1 - t0, calculoMs: Date.now() - t1 } })
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Error interno' })
  }
}
