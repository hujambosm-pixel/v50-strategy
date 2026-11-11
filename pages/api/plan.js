// pages/api/plan.js — ejecuta un PLAN DE INVERSIÓN (lib/planes/; docs/planes-inversion.md). Solo el motor: la pantalla
// definitiva irá en el futuro «Builder» guiado (decisión 9). Sirve para probarlo desde la app o con «Copiar para Claude».
//
//   POST { plan, rodantes?: { duracion?: 10, hastaElFinal?: false, desde?, hasta? }, curvas?: false }
//   → { evaluacion: { plan: { medidas, ejecucion }, referencias: [...], comparaciones: [...], descorrelacion? }, rodantes?, curvas?, ordenesReferencias?, huella, tiempos }
//   curvas (docs/builder.md §48, la pantalla del paso 3): con una pieza «estrategia», el patrimonio y el VL de cada día de las referencias
//   OCIOSO_LIQUIDEZ y ACTIVO ({ id: { patrimonio: [...], vl: [...] } }, en las fechas de la serie del plan), con el mismo motor y los mismos
//   datos; las medidas siguen siendo las de evaluacion.referencias. §51: con curvas, también ordenesReferencias: { id: costes.ordenes de su
//   ejecución } de OCIOSO_LIQUIDEZ, ACTIVO, QQQ y SPY (evaluaPlan no las devuelve): las filas de la tabla de la pantalla. §57: en curvas, también el patrimonio
//   de QQQ y SPY (las líneas que se pueden marcar en el gráfico); ya se ejecutaban para contar sus órdenes. §128: también su VL («Comparar
//   planes»: «Crecimiento de 100 €» y «Año a año» de QQQ y SPY); las cuatro llevan patrimonio y VL. Ninguna cifra cambia.
//
// Datos: lib/planes/datosServidor.js (QQQ, SPY y el ETF del plan, con dividendos, desde 3 años antes del periodo; las velas de
// la referencia de cada pieza de cartera que la tenga; con una pieza «estrategia», las del valor, del ocioso y de los índices de
// su regla: docs/builder.md §47).
import { exigeAuth } from '../../lib/verificaJwt'
import { validaPlan, huellaPlan, usaEtf, motivoListaNoCalculable } from '../../lib/planes/plan'
import { comisionesDePlan, normalizaComisiones } from '../../lib/comisiones'
import handlerMultibacktest from './multibacktest'
import { evaluaPlan, iniciosRodantes, referenciasDe } from '../../lib/planes/evalua'
import { ejecutaPlan } from '../../lib/planes/plan'
import { cargaDatosPlan } from '../../lib/planes/datosServidor'

export const config = { maxDuration: 60 }

// §89: con «Una lista», la pantalla manda también cuerpoLista, la MISMA petición de «La cartera por dentro» (peticionPorDentro). Aquí se
// comprueba que corresponde a este plan y se pide a /api/multibacktest (en este mismo proceso, con la sesión de la persona) con
// conCandidatos: los candidatos de cada valor, que el motor del plan reparte con su dinero.
// §112: con el Nasdaq-100, los valores son los del universo en el periodo (las claves de la máscara, en orden) y el universo es el del bloque.
export function errorCuerpoLista(plan, pieza, c) {
  if (!c || typeof c !== 'object' || !c.cfg) return 'Falta la petición de la lista (cuerpoLista).'
  const univ = pieza.lista?.universo && pieza.lista.universo !== 'manual' ? pieza.lista.universo : null
  const valores = univ
    ? !!c.universo?.mascara && typeof c.universo.mascara === 'object' && `ndx_${c.universo.regla === 'momentum' ? 'mom' : 'vol'}_${c.universo.n}` === univ && Array.isArray(c.symbols) && JSON.stringify(c.symbols) === JSON.stringify(Object.keys(c.universo.mascara).sort())
    : c.universo == null && JSON.stringify(c.symbols) === JSON.stringify(pieza.lista?.simbolos)
  const igual = String(c.strategyId) === String(pieza.estrategia?.id) && valores && c.modoAsig === pieza.lista?.modo
    && c.cfg.capitalIni === plan.dinero.capitalInicial * pieza.peso && c.cfg.fromDate === plan.periodo.desde && c.cfg.toDate === plan.periodo.hasta && c.intervalo === 'diario'
    && JSON.stringify(normalizaComisiones(c.comisiones)) === JSON.stringify(comisionesDePlan(plan.costes)) && JSON.stringify(c.filtros || []) === JSON.stringify(pieza.lista?.filtros || [])
  return igual ? null : 'La petición de la lista no corresponde a este plan.'
}
function pideMultibacktest(req, body) {
  return new Promise((resolve, reject) => {
    const res = { statusCode: 200, setHeader() {}, status(c) { this.statusCode = c; return this }, json(o) { resolve({ status: this.statusCode, json: o }) }, send(o) { resolve({ status: this.statusCode, json: o }) }, end() { resolve({ status: this.statusCode, json: null }) } }
    Promise.resolve(handlerMultibacktest({ method: 'POST', body, headers: req.headers, query: {} }, res)).catch(reject)
  })
}
const SUPA_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPA_KEY = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' })
  const auth = await exigeAuth('plan', req)
  if (!auth.ok) return res.status(401).json({ error: 'no autenticado' })
  const { plan, rodantes = null, curvas = false } = req.body || {}
  const errores = validaPlan(plan)
  if (rodantes && !(rodantes.duracion == null || (Number.isInteger(rodantes.duracion) && rodantes.duracion >= 1 && rodantes.duracion <= 30))) errores.push('La duración de los inicios rodantes, de 1 a 30 años.')
  if (errores.length) return res.status(400).json({ error: errores.join(' '), errores })
  const pLista = plan.piezas.find(x => x.tipo === 'estrategia' && x.donde === 'lista')
  if (pLista) {   // §89
    const motivo = errorCuerpoLista(plan, pLista, req.body?.cuerpoLista) || motivoListaNoCalculable(plan, req.body.cuerpoLista.symbols)
    if (motivo) return res.status(400).json({ error: motivo })
  }
  const t0 = Date.now()
  const headers = { apikey: SUPA_KEY, Authorization: `Bearer ${req.headers['x-supa-jwt']}` }
  try {
    const d0 = rodantes?.desde && rodantes.desde < plan.periodo.desde ? rodantes.desde : plan.periodo.desde
    const d1 = rodantes?.hasta && rodantes.hasta > plan.periodo.hasta ? rodantes.hasta : plan.periodo.hasta
    if (usaEtf(plan) && !plan.etf) return res.status(400).json({ error: 'El plan usa el ETF pero no dice cuál (plan.etf).' })
    const c = await cargaDatosPlan(plan, { d0, d1, supaUrl: SUPA_URL, headers })
    if (c.error) return res.status(500).json({ error: c.error })
    let finalPorDentro = null
    if (pLista) {
      const r = await pideMultibacktest(req, { ...req.body.cuerpoLista, conCandidatos: true })
      if (r.status !== 200 || !r.json?.candidatosAzar) return res.status(r.status === 401 ? 401 : 500).json({ error: r.json?.error || `La lista no se pudo calcular (HTTP ${r.status}).` })
      c.datos.lista = r.json.candidatosAzar
      const cc = r.json.compoundCurve || []
      finalPorDentro = cc.length ? cc[cc.length - 1].value : null
    }
    const t1 = Date.now()
    const evaluacion = evaluaPlan(plan, c.datos, { detalle: true })
    const ro = rodantes ? iniciosRodantes(plan, c.datos, { desde: rodantes.desde || plan.periodo.desde, hasta: rodantes.hasta || plan.periodo.hasta, duracion: rodantes.duracion ?? 10, hastaElFinal: !!rodantes.hastaElFinal }) : null
    const ej = curvas && plan.piezas.some(x => x.tipo === 'estrategia') ? referenciasDe(plan).filter(x => ['OCIOSO_LIQUIDEZ', 'ACTIVO', 'QQQ', 'SPY'].includes(x.id)).map(x => [x.id, ejecutaPlan(x.plan, c.datos, { detalle: false })]) : null
    const cu = ej ? Object.fromEntries(ej.map(([id, r]) => [id, { patrimonio: r.serie.map(p => p.patrimonio), vl: r.serie.map(p => p.vl) }])) : null
    const ordenesReferencias = ej ? Object.fromEntries(ej.map(([id, r]) => [id, r.costes.ordenes])) : null
    return res.status(200).json({ evaluacion, ...(ro ? { rodantes: ro } : {}), ...(cu ? { curvas: cu, ordenesReferencias } : {}), ...(pLista ? { finalPorDentro } : {}), huella: await huellaPlan(plan), tiempos: { datosMs: t1 - t0, calculoMs: Date.now() - t1 } })
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Error interno' })
  }
}
