// pages/api/screener-senales.js — «Da señal de compra con…» del screener (parte 2, fase 2b; docs/screener.md §11).
//
// POST { estrategia: { definition, params }, simbolos: [...] } (como mucho MAX_SIMBOLOS por llamada: la pantalla los manda por
// tandas, y solo los que pasan los fundamentales), con sesión (x-supa-jwt). Solo estrategias de TARJETAS con velas DIARIAS.
// Por cada símbolo: las velas diarias cerradas de los últimos 5 años por el MISMO camino que «Actualizar precios» y el paso 1 del
// Builder (velasCerradasDe de pages/api/screener-tecnico.js: la caché más lo último de Yahoo, con la vela de hoy si la sesión ya
// cerró) y senalDe (lib/screener/senales.js). Los índices de la regla (filtro de mercado), una vez por llamada.
// No guarda nada: la respuesta es { resultados: [{ simbolo, senal | null, error? }] }. Un fallo en un símbolo no para los demás.
import { exigeAuth } from '../../lib/verificaJwt'
import { velasCerradasDe } from './screener-tecnico'
import { senalDe } from '../../lib/screener/senales'
import { tickersDe } from '../../lib/pruebaAzar'
import { esDefinicionEditor } from '../../lib/editor/fuente'
import { validaDefinicion } from '../../lib/editor/definicion'

export const config = { maxDuration: 60 }
export const MAX_SIMBOLOS = 10
const CONCURRENCIA = 5
const SIMBOLO_OK = /^[A-Z0-9.^=-]{1,20}$/
const MAX_ESTRATEGIA = 100000   // caracteres de la estrategia en JSON

const params = (p) => { try { return typeof p === 'string' ? JSON.parse(p || '{}') : (p || {}) } catch (_) { return {} } }

export function erroresPeticion(body) {
  const e = []
  const est = body?.estrategia, simbolos = body?.simbolos
  if (!Array.isArray(simbolos) || !simbolos.length || simbolos.length > MAX_SIMBOLOS || !simbolos.every(s => typeof s === 'string' && SIMBOLO_OK.test(s)))
    e.push(`hacen falta de 1 a ${MAX_SIMBOLOS} símbolos válidos`)
  if (!est || typeof est !== 'object' || JSON.stringify(est).length > MAX_ESTRATEGIA || !esDefinicionEditor(est.definition)) e.push('la estrategia tiene que ser una de tarjetas')
  else {
    const errs = validaDefinicion(est.definition)
    if (errs.length) e.push(`la estrategia no es válida: ${errs[0]}`)
    if (params(est.params).intervalo === 'semanal') e.push('por ahora, solo estrategias con velas diarias')
  }
  return e
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const auth = await exigeAuth('screener-senales', req, null)
  if (!auth.ok) return res.status(401).json({ error: 'no autenticado' })
  const jwt = req.headers['x-supa-jwt']
  const errs = erroresPeticion(req.body)
  if (errs.length) return res.status(400).json({ error: errs.join('; ') })
  const { definition: def } = req.body.estrategia, p = params(req.body.estrategia.params)
  const referencias = {}
  for (const t of tickersDe(def)) {
    try { referencias[t] = await velasCerradasDe(t, jwt) } catch (_) { referencias[t] = [] }
    if (!referencias[t].length) return res.status(200).json({ resultados: req.body.simbolos.map(simbolo => ({ simbolo, senal: null, error: `sin precios de ${t} (filtro de mercado)` })) })
  }
  const unSimbolo = async (simbolo) => {
    const velas = await velasCerradasDe(simbolo, jwt)
    if (!velas.length) return { simbolo, senal: null, error: 'sin velas' }
    const senal = senalDe({ def, params: p, velas, referencias })
    return senal?.error ? { simbolo, senal: null, error: senal.error } : { simbolo, senal }
  }
  const resultados = []
  const simbolos = req.body.simbolos
  for (let i = 0; i < simbolos.length; i += CONCURRENCIA) {
    const tanda = await Promise.all(simbolos.slice(i, i + CONCURRENCIA).map(s =>
      unSimbolo(s).catch(e => ({ simbolo: s, senal: null, error: e?.message || 'fallo' }))))
    resultados.push(...tanda)
  }
  return res.status(200).json({ resultados })
}
