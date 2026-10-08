// pages/api/ranking-activo.js — el ranking de UN activo con TODAS sus estrategias en una sola petición.
//
// POR QUÉ. El ranking pedía /api/datos una vez por activo y estrategia: 25 activos × 55 estrategias son 1.375
// peticiones por tanda, cada una con su viaje, su autenticación, su lectura de la estrategia y su
// respuesta con chartData. Aquí el servidor hace el backtest de cada estrategia sobre ese activo con
// lib/backtestActivo.js —el MISMO código que /api/datos: periodo, calentamiento, filtros y núcleo— y
// devuelve solo lo que el ranking guarda en ranking_results.
//
// LAS VELAS, UNA VEZ. Cada descarga (símbolo, años, intervalo) se hace una sola vez por petición y cada
// estrategia recibe una COPIA, porque el backtest les inyecta sp500Close y filtroActivo. Son las mismas
// llamadas que haría /api/datos, así que cada estrategia ve exactamente las mismas velas. Con el interruptor
// de la caché de precios encendido, además, salen de la caché (ver lib/cachePreciosServidor.js).
//
// Petición: { simbolo, estrategias: [{ id, intervalo, params? }], capitalIni, aniosRanking, minTrades, fromDate,
//             toDate, comisiones, filtros } — las condiciones del ranking, las mismas para todas; la
//             temporalidad, la de cada estrategia.
// Respuesta: { simbolo, resultados: { [id]: r } }, con r =
//   { status: 200, metricas: {…} | null, condiciones }  métricas como las guarda calcMetricas (null si no hay
//                                                      operaciones o no llega a minTrades: no se escribe fila)
//   { status: 400 | 422 | 500, error, tipo?, estrategia?, errores? }  el error de ESA estrategia, igual que
//                                                      lo daría /api/datos; las demás siguen. `params` en una
//                                                      estrategia son CAMBIOS a sus params guardados (como el
//                                                      campo params de /api/datos); si no valen, 422 con tipo
//                                                      'parametros' y la lista de errores.

import { exigeAuth } from '../../lib/verificaJwt'
import { conCachePrecios } from '../../lib/cachePreciosServidor'
import { normalizaComisiones } from '../../lib/comisiones'
import { backtestActivo, descargaCompartida } from '../../lib/backtestActivo'
import { metricasRanking } from '../../lib/metricasRanking'
import { fetchAV } from './datos'

const SUPA_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPA_KEY = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const MAX_ESTRATEGIAS = 200
const RE_ID = /^[0-9A-Za-z-]{1,64}$/

// Holgura para las 55 estrategias de un activo (medido: unos pocos segundos como mucho).
export const config = { maxDuration: 60 }

export default function handler(req, res) {
  return conCachePrecios(req, () => handlerRankingActivo(req, res))
}


async function handlerRankingActivo(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).end()
    const auth = await exigeAuth('ranking-activo', req, req.query?.action)
    if (!auth.ok) return res.status(401).json({ error: 'no autenticado' })
    const _jwt = req.headers['x-supa-jwt'] || null

    const { simbolo, estrategias, capitalIni = 10000, aniosRanking = 5, minTrades = 0, fromDate = null, toDate = null,
            comisiones = null, filtros } = req.body || {}
    if (!simbolo || typeof simbolo !== 'string') return res.status(400).json({ error: 'simbolo requerido' })
    if (!Array.isArray(estrategias) || !estrategias.length || estrategias.length > MAX_ESTRATEGIAS)
      return res.status(400).json({ error: `estrategias: entre 1 y ${MAX_ESTRATEGIAS}` })
    const lista = [], vistos = new Set()
    for (const e of estrategias) {
      if (!e || typeof e.id !== 'string' || !RE_ID.test(e.id)) return res.status(400).json({ error: 'id de estrategia no válido' })
      if (!vistos.has(e.id)) { vistos.add(e.id); lista.push({ id: e.id, intervalo: e.intervalo, params: e.params ?? null }) }
    }
    const _com = normalizaComisiones(comisiones)

    // Las estrategias, de una vez, con el JWT del usuario (como /api/datos).
    const filas = new Map()
    try {
      const r = await fetch(`${SUPA_URL}/rest/v1/strategies?id=in.(${lista.map(e => e.id).join(',')})&select=id,code_js,params,name`,
        { headers: { apikey: SUPA_KEY, Authorization: `Bearer ${_jwt}` } })
      if (r.ok) for (const f of (await r.json()) || []) filas.set(f.id, f)
    } catch (_) {}

    const fetchCompartido = descargaCompartida(fetchAV)
    const resultados = {}
    for (const { id, intervalo, params } of lista) {
      const row = filas.get(id) || {}
      const codeJs = row.code_js || null, stratName = row.name || null
      if (!codeJs) {
        resultados[id] = { status: 400, error: 'Esta estrategia no tiene código generado. Abre el editor y usa "Generar con Claude".' }
        continue
      }
      try {
        // El mismo cuerpo que mandaba calcMetricas a /api/datos: sin `years` (vale 5 por defecto, y con
        // fromDate/toDate no se usa para el periodo) y con allocation_pct 100.
        const b = await backtestActivo({ simbolo, codeJs, stratParams: row.params || null, stratName,
          capital_ini: capitalIni, years: 5, allocation_pct: 100, filtros, intervalo, fromDate, toDate, comisiones: _com, params },
          { fetchAV: fetchCompartido, grafico: false })
        const m = b._nucleo.metricas
        resultados[id] = {
          status: 200,
          metricas: metricasRanking({ trades: b._nucleo.trades, gananciaSimple: m.gananciaSimple, startDate: b.data[0].date,
            ultimaFecha: b.data[b.data.length - 1].date, maxDDStrategyFloat: m.maxDDStrategyFloat,
            maxDDStrategy: m.curves.maxDDStrategy }, { capitalIni, years: aniosRanking, minTrades }),
          condiciones: { intervalo, desde: fromDate, hasta: toDate, capitalIni, comisiones, filtros: filtros ?? [] },
        }
      } catch (e) {
        if (e && e._tipoFallo === 'parametros') {
          resultados[id] = { status: 422, error: e.message, tipo: 'parametros', errores: e.errores }
        } else if (e && e._tipoFallo === 'codigo_estrategia') {
          const quien = stratName || id
          console.error(`[ranking-activo] error en el code_js de la estrategia "${quien}" para ${simbolo}:`, e.message)
          resultados[id] = { status: 422, error: e.message, tipo: 'codigo_estrategia', estrategia: quien }
        } else {
          console.error(`[ranking-activo] fallo al calcular ${simbolo} con "${stratName || id}":`, e.message)
          resultados[id] = { status: 500, error: e.message }
        }
      }
    }
    return res.status(200).json({ simbolo, resultados })
  } catch (e) {
    console.error('[ranking-activo] unhandled crash:', e.message, e.stack)
    return res.status(500).json({ error: 'Internal error: ' + e.message })
  }
}
