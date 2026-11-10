// pages/api/screener-tecnico.js — «Actualizar precios» del screener (parte 2, fase 2a; docs/screener.md).
//
// POST { simbolos: [...] } (como mucho MAX_SIMBOLOS por llamada: la pantalla los manda por tandas), con sesión (x-supa-jwt).
// Por cada símbolo, a la vez de CONCURRENCIA en CONCURRENCIA:
//   1. Las velas diarias de los últimos ANIOS_TECNICO años por el MISMO camino que «Backtest de un valor» y el paso 1 del Builder:
//      diariasConCache (lo guardado + lo último de Yahoo, guardando en la caché lo cerrado que falte) y, si la caché falla, la
//      descarga de Yahoo de siempre. tramoAnterior: false (no se descargan años antiguos que la caché no tenga).
//   2. Fuera la vela en curso (marcaDiariaEnCurso: con la sesión de NY abierta, cuenta el cierre de ayer).
//   3. tecnicoDe (lib/screener/tecnico.js) y, si es una empresa del screener, guardar_tecnico_screener con el JWT del usuario
//      (sql/screener_tecnico.sql: solo escribe la columna `tecnico`). SPY y los ETF de sectores no se guardan (no están en el
//      screener, salvo SPY si está en una lista): la respuesta los trae igual.
// Responde { resultados: [{ simbolo, tecnico | null, guardado, error? }] }. Un fallo en un símbolo no para los demás.
import { exigeAuth } from '../../lib/verificaJwt'
import { descargaYahoo } from './datos'
import { ordenaUnicas } from './velas'
import { diariasConCache } from '../../lib/cachePreciosServidor'
import { marcaDiariaEnCurso, soloCerradas } from '../../lib/sesion'
import { tecnicoDe, ANIOS_TECNICO } from '../../lib/screener/tecnico'

export const config = { maxDuration: 60 }
export const MAX_SIMBOLOS = 10
const CONCURRENCIA = 5
const SIMBOLO_OK = /^[A-Z0-9.^=-]{1,20}$/

async function guarda(simbolo, tecnico, jwt) {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const r = await fetch(`${url}/rest/v1/rpc/guardar_tecnico_screener`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_simbolo: simbolo, p_tecnico: tecnico }),
  })
  if (!r.ok) { let m = ''; try { m = (await r.json())?.message || '' } catch (_) {} throw new Error(`no se pudo guardar (HTTP ${r.status}${m ? ': ' + m : ''})`) }
  return (await r.json()) === true
}

async function unSimbolo(simbolo, jwt) {
  const urlRango = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(simbolo)}?interval=1d&range=${ANIOS_TECNICO}y`
  let r = null
  try {
    r = await diariasConCache(simbolo, ANIOS_TECNICO, { jwt, descarga: descargaYahoo, urlRango, tramoAnterior: false })
  } catch (e) {
    console.log(`[screener-tecnico] ${simbolo}: ${e.message}; se sigue con la descarga de Yahoo`)
    r = null
  }
  if (!r?.rawData?.length) r = await descargaYahoo(urlRango)
  if (!r?.rawData?.length) return { simbolo, tecnico: null, guardado: false, error: 'sin velas' }
  const velas = soloCerradas(marcaDiariaEnCurso(ordenaUnicas(r.rawData), r.tsUltima, r.metaSesion).barras)
  const tecnico = tecnicoDe(velas)
  if (!tecnico) return { simbolo, tecnico: null, guardado: false, error: 'sin velas cerradas' }
  return { simbolo, tecnico, guardado: await guarda(simbolo, tecnico, jwt) }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const auth = await exigeAuth('screener-tecnico', req, null)
  if (!auth.ok) return res.status(401).json({ error: 'no autenticado' })
  const jwt = req.headers['x-supa-jwt']
  const simbolos = req.body?.simbolos
  if (!Array.isArray(simbolos) || !simbolos.length || simbolos.length > MAX_SIMBOLOS || !simbolos.every(s => typeof s === 'string' && SIMBOLO_OK.test(s)))
    return res.status(400).json({ error: `hacen falta de 1 a ${MAX_SIMBOLOS} símbolos válidos` })
  const resultados = []
  for (let i = 0; i < simbolos.length; i += CONCURRENCIA) {
    const tanda = await Promise.all(simbolos.slice(i, i + CONCURRENCIA).map(s =>
      unSimbolo(s, jwt).catch(e => ({ simbolo: s, tecnico: null, guardado: false, error: e?.message || 'fallo' }))))
    resultados.push(...tanda)
  }
  return res.status(200).json({ resultados })
}
