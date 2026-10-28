// pages/api/velas.js — las velas DIARIAS de un valor para el paso 1 del Builder (V9.1071; docs/builder.md, §37).
//
// POR QUÉ EXISTE. El paso 1 leía las velas solo de la caché de Supabase (rpc/leer_velas desde 1990): sin la vela de hoy, con
// el retraso de cada valor según cuándo se usó por última vez en un backtest (QQQ llegaba al 26/10/2026 un 28/10) y sin los
// valores que no están en la caché (SAN.MC). Ahora sale por el MISMO camino que «Backtest de un valor»: diariasConCache
// (lib/cachePreciosServidor.js: lo guardado más lo último de Yahoo, guardando lo cerrado que falte) y, si la caché falla, la
// descarga de Yahoo de siempre (descargaYahoo, pages/api/datos.js). La última vela se marca en curso con marcaDiariaEnCurso,
// como en fetchAVDetalle.
//
// Toda la historia guardada: la ventana es de ANIOS años (desde 1986, antes que cualquier vela guardada; leer_velas se pedía desde
// 1990) y con tramoAnterior: false, para no descargar ni guardar años antiguos que la caché no tenga. Un valor que no está en
// la caché se descarga entero (range=40y) y se guarda, como haría un backtest.
//
// GET ?simbolo=X, con sesión (x-supa-jwt). Responde { velas, semanaAbierta, origen }:
//   velas          diarias ordenadas, sin fechas repetidas; la última con enCurso: true si su sesión sigue abierta.
//   semanaAbierta  el lunes (ISO) de la última semana si todavía no ha cerrado (semanaEnCurso, lib/sesion.js), o null. Con él
//                  las semanales del paso 1 marcan la semana en curso como lo hace fetchAVDetalle.
//   origen         'cache' o 'yahoo'.
import { exigeAuth } from '../../lib/verificaJwt'
import { descargaYahoo } from './datos'
import { diariasConCache } from '../../lib/cachePreciosServidor'
import { marcaDiariaEnCurso, semanaEnCurso } from '../../lib/sesion'
import { lunesDeSemana } from '../../lib/velasSemanales'

export const ANIOS = 40

// Ordenadas por fecha y sin repetidas (se queda la última que llega con cada fecha): lightweight-charts se rompe con una sola.
export function ordenaUnicas(velas) {
  const porFecha = new Map()
  for (const v of velas || []) if (v?.date) porFecha.set(v.date, v)
  return [...porFecha.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()
  const auth = await exigeAuth('velas', req, null)
  if (!auth.ok) return res.status(401).json({ error: 'no autenticado' })
  const simbolo = typeof req.query?.simbolo === 'string' ? req.query.simbolo.trim() : ''
  if (!simbolo || simbolo.length > 30) return res.status(400).json({ error: 'simbolo requerido' })
  const jwt = req.headers['x-supa-jwt'] || null
  const urlRango = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(simbolo)}?interval=1d&range=${ANIOS}y`
  let r = null, origen = null
  if (jwt) {
    try {
      r = await diariasConCache(simbolo, ANIOS, { jwt, descarga: descargaYahoo, urlRango, tramoAnterior: false })
      origen = 'cache'
    } catch (e) {
      console.log(`[velas] ${simbolo}: ${e.message}; se sigue con la descarga de Yahoo`)
      r = null
    }
  }
  if (!r?.rawData?.length) {
    r = await descargaYahoo(urlRango)
    origen = 'yahoo'
  }
  if (!r?.rawData?.length) return res.status(404).json({ error: `Sin datos para ${simbolo}` })
  const velas = marcaDiariaEnCurso(ordenaUnicas(r.rawData), r.tsUltima, r.metaSesion).barras
  const lunes = lunesDeSemana(velas[velas.length - 1].date)
  const semanaAbierta = lunes && semanaEnCurso(lunes, r.metaSesion) === true ? lunes : null
  return res.status(200).json({ velas, semanaAbierta, origen })
}
