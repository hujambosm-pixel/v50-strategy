// pages/api/optimiza.js — el OPTIMIZADOR: un activo × N combinaciones de parámetros de una estrategia.
//
// Petición: { estrategia (id), simbolo, intervalo ('diario' | 'semanal'), desde, hasta (fechas FIJAS, siempre),
//             capitalIni, comisiones, filtros, combinaciones: [{ …params }] }
// Cada combinación son CAMBIOS a los params guardados (como el campo params de /api/datos), validados contra la
// declaración run.parametros de la estrategia. Respuesta:
//   { simbolo, estrategia, intervalo, desde, hasta, calentamiento, resultados: [{ params, status, metricas | errores | error }] }
//   en el MISMO orden que las combinaciones; las que no valen llevan su error y las demás siguen.
// Las métricas (lib/metricasRanking.js: metricasOptimizacion) son las del ranking y las del resumen del
// backtest, más el resultado año a año. Sin chartData ni operaciones.
//
// LAS VELAS, UNA VEZ. Cada descarga se hace una sola vez por petición (descargaCompartida) y, con el
// interruptor de la caché de precios encendido, sale de la caché, como en /api/ranking-activo.
//
// EL CALENTAMIENTO ES COMÚN: el MÁXIMO del que pediría cada combinación de la petición (ventanas declaradas
// y filtros). Así todas empiezan a operar con el MISMO estado de datos: si cada una calentara lo suyo, una EMA
// de 50 vería más historia previa que una de 5 y una diferencia de resultado podría venir de dónde empieza la
// serie y no del parámetro. El efecto: una combinación con ventanas cortas ve más calentamiento que en un
// backtest individual (/api/datos con esos params), lo que solo puede cambiar el estado heredado al empezar el
// periodo; con el mismo calentamiento (/api/datos acepta `calentamiento`) el resultado es idéntico.

import { exigeAuth } from '../../lib/verificaJwt'
import { conCachePrecios } from '../../lib/cachePreciosServidor'
import { normalizaComisiones } from '../../lib/comisiones'
import { backtestActivo, descargaCompartida } from '../../lib/backtestActivo'
import { metricasOptimizacion } from '../../lib/metricasRanking'
import { esquemaDeCodigo, paramsEfectivos, ventanasDeclaradas } from '../../lib/parametrosEstrategia'
import { normalizaFiltrosEntrada, fuerzaFiltrosSemanales } from '../../lib/filtros'
import { velasCalentamiento } from '../../lib/periodo'
import { fetchAV } from './datos'

const SUPA_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPA_KEY = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
// Tope de combinaciones por petición: medido, unos 4-5 ms por combinación en diario con 5 años (1 V50 en
// AAPL: 300 en 1,2 s sin filtros y 1,4 s con un filtro), así que 300 quedan holgadas incluso para los 10 s por
// defecto de Vercel sin Fluid compute, aunque su CPU sea más lenta. Con más, se divide en varias peticiones.
export const MAX_COMBINACIONES = 300
const RE_ID = /^[0-9A-Za-z-]{1,64}$/
const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/

export const config = { maxDuration: 60 }

export default function handler(req, res) {
  return conCachePrecios(req, () => handlerOptimiza(req, res))
}

async function handlerOptimiza(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).end()
    const auth = await exigeAuth('optimiza', req, req.query?.action)
    if (!auth.ok) return res.status(401).json({ error: 'no autenticado' })
    const _jwt = req.headers['x-supa-jwt'] || null

    const { estrategia, simbolo, intervalo = 'diario', desde, hasta, capitalIni = 10000, comisiones = null, filtros = [],
            combinaciones } = req.body || {}
    if (typeof estrategia !== 'string' || !RE_ID.test(estrategia)) return res.status(400).json({ error: 'estrategia: id no válido' })
    if (!simbolo || typeof simbolo !== 'string') return res.status(400).json({ error: 'simbolo requerido' })
    if (!RE_FECHA.test(String(desde)) || !RE_FECHA.test(String(hasta)) || !(desde < hasta))
      return res.status(400).json({ error: 'desde y hasta: fechas fijas AAAA-MM-DD, desde antes que hasta' })
    if (!Array.isArray(combinaciones) || !combinaciones.length || combinaciones.length > MAX_COMBINACIONES)
      return res.status(400).json({ error: `combinaciones: entre 1 y ${MAX_COMBINACIONES} por petición` })
    const _com = normalizaComisiones(comisiones)
    const iv = intervalo === 'semanal' ? 'semanal' : 'diario'

    // La estrategia, con el JWT del usuario.
    let row = null
    try {
      const r = await fetch(`${SUPA_URL}/rest/v1/strategies?id=eq.${estrategia}&select=code_js,params,name`,
        { headers: { apikey: SUPA_KEY, Authorization: `Bearer ${_jwt}` } })
      if (r.ok) row = (await r.json())?.[0] || null
    } catch (_) {}
    if (!row?.code_js) return res.status(400).json({ error: 'Esta estrategia no tiene código generado. Abre el editor y usa "Generar con Claude".' })
    const esquema = esquemaDeCodigo(row.code_js)
    if (!esquema) {
      const errores = ['Esta estrategia no declara sus parámetros (run.parametros): no se pueden cambiar.']
      return res.status(422).json({ error: 'Parámetros no válidos: ' + errores[0], tipo: 'parametros', errores })
    }
    const guardados = row.params ? JSON.parse(row.params) : {}

    // Cada combinación, validada; las buenas cuentan para el calentamiento común (ver la cabecera).
    const filtrosLista = fuerzaFiltrosSemanales(normalizaFiltrosEntrada(filtros), iv === 'semanal').lista
    const resultados = combinaciones.map(c => ({ params: c }))
    let calentamiento = 0
    for (const r of resultados) {
      const e = paramsEfectivos(guardados, r.params, esquema)
      if (!e.ok) { Object.assign(r, { status: 422, tipo: 'parametros', errores: e.errores }); continue }
      calentamiento = Math.max(calentamiento, velasCalentamiento(e.params, filtrosLista, iv, ventanasDeclaradas(esquema, e.params)))
    }

    const fetchCompartido = descargaCompartida(fetchAV)
    for (const r of resultados) {
      if (r.status) continue
      try {
        const b = await backtestActivo({ simbolo, codeJs: row.code_js, stratParams: row.params || null, stratName: row.name || null,
          capital_ini: capitalIni, years: 5, allocation_pct: 100, filtros, intervalo: iv, fromDate: desde, toDate: hasta,
          comisiones: _com, params: r.params, calentamiento }, { fetchAV: fetchCompartido, grafico: false })
        const m = b._nucleo.metricas
        r.status = 200
        r.metricas = metricasOptimizacion({ trades: b._nucleo.trades, capitalReinv: m.capitalReinv, gananciaSimple: m.gananciaSimple,
          ganBH: m.ganBH, startDate: b.data[0].date, ultimaFecha: b.data[b.data.length - 1].date,
          maxDDStrategyFloat: m.maxDDStrategyFloat, maxDDStrategy: m.curves.maxDDStrategy }, { capitalIni, years: 5, desde, hasta })
      } catch (e) {
        if (e && e._tipoFallo === 'parametros') Object.assign(r, { status: 422, tipo: 'parametros', errores: e.errores })
        else if (e && e._tipoFallo === 'codigo_estrategia') Object.assign(r, { status: 422, tipo: 'codigo_estrategia', error: e.message })
        else Object.assign(r, { status: 500, error: e?.message || 'error' })
      }
    }
    return res.status(200).json({ simbolo, estrategia, intervalo: iv, desde, hasta, calentamiento, resultados })
  } catch (e) {
    console.error('[optimiza] unhandled crash:', e.message, e.stack)
    return res.status(500).json({ error: 'Internal error: ' + e.message })
  }
}
