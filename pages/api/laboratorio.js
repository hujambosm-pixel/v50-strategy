// pages/api/laboratorio.js — laboratorio de señales: ejecuta UNA configuración en UN periodo y devuelve solo el resumen
// (lib/laboratorio.js). El cliente lo llama una vez por periodo, con su barra de progreso, y guarda la prueba en
// lab_pruebas (lib/registroLab.js).
//
//   POST { config: { senales: { disparador, filtros }, universo, periodos, intervalo, entrada, salida },
//          periodo: { desde, hasta } (uno de config.periodos), nSim? }
//   → { resultado (ejecutaPeriodo), simbolos, sinDatos: [...], tiempos: { datosMs, calculoMs, totalMs } }
//   Prueba de SALIDAS (config.prueba = 'salidas', LOTE_2): { config: { prueba, entradas, salidas, universo, periodos,
//   intervalo, entrada }, periodo } → lo mismo con ejecutaPeriodoSalidas (lib/laboratorioSalidas.js); los datos llegan
//   hasta diasTrasPeriodo(tope) después del periodo, para que quepa el tope de tiempo.
//   ESTRATEGIA COMPLETA (config.prueba = 'estrategias', LOTE_3): { config: { prueba, senales, salidas, universo, periodos,
//   intervalo, entrada }, periodo } → ejecutaPeriodoEstrategias (lib/laboratorioEstrategias.js); se lee siempre QQQ (la
//   referencia de comprar y mantener).
//   CARTERA (config.prueba = 'cartera', CARTERA_1): { config: { prueba, regla, etf, periodos, … }, periodo } →
//   ejecutaPeriodoCartera (lib/laboratorioCartera.js) con QQQ, el ETF y SPY de la caché (desde 3 años antes, para calentar
//   la ventana de 252 velas) y los dividendos de lib/dividendosCartera.json (rentabilidad total).
//
// Datos: los miembros del Nasdaq-100 (universo_miembros) y las velas diarias de la caché (precios_diarios, por la función
// leer_velas, exactas) con el JWT del usuario: desde 3 años antes del periodo (calentamiento de los indicadores; la
// ruptura de 252 velas y las medias de 200 lo necesitan) hasta 45 días después (salidas de hasta 20 velas). QQQ, solo si
// algún filtro lo usa.
import { exigeAuth } from '../../lib/verificaJwt'
import { entradas, calculables, topeDe, indicadoresSalidas } from '../../lib/senales'
import { ejecutaPeriodo, semillaLab, N_SIM_LAB } from '../../lib/laboratorio'
import { huella, validaConfig, esConfigSalidas, esConfigEstrategias, esConfigCartera } from '../../lib/lotesLab'
import { ejecutaPeriodoCartera, alineaDatos, N_SIM_CARTERA } from '../../lib/laboratorioCartera'
import DIVIDENDOS from '../../lib/dividendosCartera.json'
import { ejecutaPeriodoSalidas, calculablesIndicadores, decisionesDe, indicadoresPrueba, diasTrasPeriodo } from '../../lib/laboratorioSalidas'
import { ejecutaPeriodoEstrategias } from '../../lib/laboratorioEstrategias'

export const config = { maxDuration: 60 }
const SUPA_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPA_KEY = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const FECHA = /^\d{4}-\d{2}-\d{2}$/
const EN_PARALELO = 12
const masDias = (f, d) => new Date(Date.parse(f + 'T00:00:00Z') + d * 864e5).toISOString().slice(0, 10)
const masAnios = (f, a) => `${Number(f.slice(0, 4)) + a}${f.slice(4)}`

// Errores de la petición (vacío si vale).
export function validaPeticionLab(c, periodo) {
  const e = []
  if (!c || typeof c !== 'object') return ['Falta la configuración.']
  e.push(...validaConfig(c))
  if (esConfigCartera(c)) {
    if (!periodo || !(c.periodos || []).some(p => p.desde === periodo.desde && p.hasta === periodo.hasta)) e.push('El periodo pedido no es uno de los de la configuración.')
    return e
  }
  if (c.intervalo !== 'diario') e.push('Por ahora el laboratorio solo trabaja en diario.')
  if (c.universo?.indice !== 'NDX') e.push('Por ahora el único universo es el Nasdaq-100 (miembros en cada fecha).')
  if (!esConfigSalidas(c) && !esConfigEstrategias(c) && (c.salida?.tipo !== 'velas' || !Number.isInteger(c.salida?.n) || c.salida.n < 1 || c.salida.n > 250)) e.push('La salida tiene que ser un número entero de velas entre 1 y 250.')
  if (!Array.isArray(c.periodos) || !c.periodos.length || !c.periodos.every(p => FECHA.test(p?.desde) && FECHA.test(p?.hasta) && p.desde < p.hasta)) e.push('Los periodos no son válidos.')
  if (!periodo || !(c.periodos || []).some(p => p.desde === periodo.desde && p.hasta === periodo.hasta)) e.push('El periodo pedido no es uno de los de la configuración.')
  return e
}

const velasDe = (j) => (j?.fecha || []).map((date, i) => ({ date, open: j.open[i], high: j.high[i], low: j.low[i], close: j.close[i], volume: j.volumen[i] }))

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' })
  const auth = await exigeAuth('laboratorio', req)
  if (!auth.ok) return res.status(401).json({ error: 'no autenticado' })
  const { config: cfg, periodo, nSim = N_SIM_LAB } = req.body || {}
  const errores = validaPeticionLab(cfg, periodo)
  if (!(Number.isInteger(nSim) && nSim >= 10 && nSim <= 5000)) errores.push('El número de simulaciones tiene que estar entre 10 y 5000.')
  if (errores.length) return res.status(400).json({ error: errores.join(' '), errores })
  const t0 = Date.now()
  const headers = { apikey: SUPA_KEY, Authorization: `Bearer ${req.headers['x-supa-jwt']}` }
  const get = async (ruta) => {
    const r = await fetch(`${SUPA_URL}/rest/v1/${ruta}`, { headers })
    if (!r.ok) throw new Error(`Supabase respondió ${r.status} a ${ruta.split('?')[0]}`)
    return r.json()
  }
  try {
    const { desde, hasta } = periodo
    if (esConfigCartera(cfg)) {
      const pc = cfg.periodos.find(p => p.desde === desde && p.hasta === hasta)
      const lee = (sym) => get(`rpc/leer_velas?p_simbolo=${encodeURIComponent(sym)}&p_desde=${masAnios(desde, -3)}&p_hasta=${masDias(hasta, 5)}`).then(velasDe)
      const [qqq, etf, spy] = await Promise.all([lee('QQQ'), lee(cfg.etf), lee('SPY')])
      const t1 = Date.now()
      if (!qqq.length || !etf.length || !spy.length) return res.status(500).json({ error: `Faltan velas en la caché: ${[['QQQ', qqq], [cfg.etf, etf], ['SPY', spy]].filter(([, v]) => !v.length).map(([s]) => s).join(', ')}.` })
      const datos = alineaDatos({ qqq, etf: { simbolo: cfg.etf, velas: etf }, spy }, DIVIDENDOS.simbolos)
      const resultado = ejecutaPeriodoCartera({ datos, regla: cfg.regla, periodo: pc, nSim: Math.min(nSim, N_SIM_CARTERA * 5), semilla: semillaLab(await huella(cfg), desde) })
      const t2 = Date.now()
      return res.status(200).json({ resultado, simbolos: 3, sinDatos: [], dividendos: DIVIDENDOS.descargado, tiempos: { datosMs: t1 - t0, calculoMs: t2 - t1, totalMs: t2 - t0 } })
    }
    const miembros = await get('universo_miembros?indice=eq.NDX&select=simbolo_yahoo,desde,hasta,excluido_motivo')
    const tramos = {}
    for (const m of miembros) if (m.simbolo_yahoo && !m.excluido_motivo && m.desde <= hasta && (m.hasta == null || m.hasta > desde)) (tramos[m.simbolo_yahoo] ||= []).push(m)
    const simbolos = Object.keys(tramos).sort()
    const salidas = esConfigSalidas(cfg), estrategias = esConfigEstrategias(cfg)
    const senales = salidas ? (cfg.entradas.tipo === 'senal' ? cfg.entradas : null) : cfg.senales
    const tope = salidas || estrategias ? topeDe(cfg.salidas) : null
    const dDesde = masAnios(desde, -3), dHasta = masDias(hasta, tope != null ? diasTrasPeriodo(tope) : 45)
    const lee = (sym) => get(`rpc/leer_velas?p_simbolo=${encodeURIComponent(sym)}&p_desde=${dDesde}&p_hasta=${dHasta}`).then(velasDe)
    const series = {}
    for (let i = 0; i < simbolos.length; i += EN_PARALELO) {
      const lote = simbolos.slice(i, i + EN_PARALELO)
      const vs = await Promise.all(lote.map(lee))
      lote.forEach((s, k) => { series[s] = vs[k] })
    }
    const usaQqq = (senales?.filtros || []).some(f => f.id === 'mercadoAlcista')
    const qqq = usaQqq || estrategias ? await lee('QQQ') : null
    const t1 = Date.now()
    const ctx = qqq ? { qqq } : {}
    const semilla = semillaLab(await huella(cfg), desde)
    let resultado
    if (estrategias) {
      // Calculable: la señal de la entrada (disparador y filtros) y los indicadores de las salidas.
      const inds = indicadoresSalidas(cfg.salidas)
      const valores = simbolos.filter(s => series[s].length).map(sym => {
        const v = series[sym], ci = calculablesIndicadores(v, inds), cs = calculables(v, senales, ctx)
        return { sym, velas: v, tramos: tramos[sym], calculables: ci.map((x, t) => x && cs[t]), senales: entradas(v, senales, ctx) }
      })
      resultado = ejecutaPeriodoEstrategias({ valores, desde, hasta, decisionesDe: (v) => decisionesDe(v, cfg.salidas), tope, nSim, semilla, qqq })
    } else if (salidas) {
      // Calculable: los indicadores del calentamiento y de las salidas y, con un disparador, también su señal.
      const inds = indicadoresPrueba(cfg)
      const valores = simbolos.filter(s => series[s].length).map(sym => {
        const v = series[sym], ci = calculablesIndicadores(v, inds), cs = senales ? calculables(v, senales, ctx) : null
        return { sym, velas: v, tramos: tramos[sym], calculables: cs ? ci.map((x, t) => x && cs[t]) : ci, ...(senales ? { senales: entradas(v, senales, ctx) } : {}) }
      })
      resultado = ejecutaPeriodoSalidas({ valores, desde, hasta, entradas: senales ? null : cfg.entradas, decisionesDe: (v) => decisionesDe(v, cfg.salidas), tope, nSim, semilla })
    } else {
      const valores = simbolos.filter(s => series[s].length).map(sym => ({ sym, velas: series[sym], tramos: tramos[sym],
        entradas: entradas(series[sym], cfg.senales, ctx), calculables: calculables(series[sym], cfg.senales, ctx) }))
      resultado = ejecutaPeriodo({ valores, desde, hasta, nVelas: cfg.salida.n, nSim, semilla })
    }
    const t2 = Date.now()
    return res.status(200).json({ resultado, simbolos: simbolos.length, sinDatos: simbolos.filter(s => !series[s].length),
      ...(usaQqq && !qqq?.length ? { aviso: 'QQQ no tiene velas en la caché: el filtro de mercado no deja entrar nunca.' } : {}),
      tiempos: { datosMs: t1 - t0, calculoMs: t2 - t1, totalMs: t2 - t0 } })
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Error interno' })
  }
}
