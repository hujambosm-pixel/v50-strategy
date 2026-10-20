// lib/fuerzaRelativaServidor.js — el campo rsPercentil en el MOTOR (SOLO servidor). La lógica está en lib/fuerzaRelativa.js.
//
// Solo se calcula si el code_js de la estrategia nombra rsPercentil (usaFuerzaRelativa): ninguna otra respuesta cambia.
// Lee de la caché de precios (Supabase, con el JWT del usuario, las mismas lecturas que el laboratorio): los miembros del
// índice (universo_miembros) y las velas DIARIAS de los miembros que lo son en algún momento de la ventana, y las del valor
// evaluado. La ventana: desde 400 días antes de la primera vela que ve la estrategia (para las 252 sesiones de la
// rentabilidad ponderada) hasta el final del periodo. La distribución se recuerda en la memoria del proceso 10 minutos por
// índice y ventana, así que un ranking o un multibacktest con muchos valores la calculan una vez.
//
// percentiles(simbolo, desde, hasta) → { fecha: percentil | null } (diario) o null si no se puede (sin sesión, sin velas
// del índice); el motor lo pone en cada vela con percentilesParaBarras y, si es null, deja el campo en null y lo avisa.
import { distribucion, percentilesDe, INDICE_FUERZA_RELATIVA } from './fuerzaRelativa'

const SUPA_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPA_KEY = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
export const MEMORIA_FR_MS = 10 * 60 * 1000
const EN_PARALELO = 12
const memoria = new Map()   // `${indice}|${desde}|${hasta}` → { hasta: ms, promesa }
export const vaciaMemoriaFuerzaRelativa = () => memoria.clear()
const masDias = (f, d) => new Date(Date.parse(f + 'T00:00:00Z') + d * 864e5).toISOString().slice(0, 10)
const velasDe = (j) => (j?.fecha || []).map((date, i) => ({ date, open: j.open[i], high: j.high[i], low: j.low[i], close: j.close[i], volume: j.volumen[i] }))

// El proveedor para una petición: null sin JWT (entonces el campo va a null y se avisa).
export function proveedorFuerzaRelativa(req, { indice = INDICE_FUERZA_RELATIVA, fetch: f = globalThis.fetch } = {}) {
  const jwt = req?.headers?.['x-supa-jwt']
  if (!jwt || !SUPA_URL) return null
  const headers = { apikey: SUPA_KEY, Authorization: `Bearer ${jwt}` }
  const get = async (ruta) => { const r = await f(`${SUPA_URL}/rest/v1/${ruta}`, { headers }); if (!r.ok) throw new Error(`Supabase respondió ${r.status} a ${ruta.split('?')[0]}`); return r.json() }
  const lee = (sym, d0, d1) => get(`rpc/leer_velas?p_simbolo=${encodeURIComponent(sym)}&p_desde=${d0}&p_hasta=${d1}`).then(velasDe)
  // La distribución de una ventana (con las velas de los miembros, que sirven también si el valor es miembro).
  const distDe = (d0, d1) => {
    const k = `${indice}|${d0}|${d1}`, m = memoria.get(k)
    if (m && m.hasta > Date.now()) return m.promesa
    const promesa = (async () => {
      const miembros = await get(`universo_miembros?indice=eq.${encodeURIComponent(indice)}&select=simbolo_yahoo,desde,hasta,excluido_motivo`)
      const syms = [...new Set(miembros.filter(x => x.simbolo_yahoo && !x.excluido_motivo && x.desde <= d1 && (x.hasta == null || x.hasta > d0)).map(x => x.simbolo_yahoo))].sort()
      const velas = {}
      for (let i = 0; i < syms.length; i += EN_PARALELO) {
        const lote = syms.slice(i, i + EN_PARALELO), vs = await Promise.all(lote.map(s => lee(s, d0, d1).catch(() => [])))
        lote.forEach((s, j) => { velas[s] = vs[j] })
      }
      return { dist: distribucion(miembros, velas), velas }
    })()
    memoria.set(k, { hasta: Date.now() + MEMORIA_FR_MS, promesa })
    promesa.catch(() => memoria.delete(k))
    return promesa
  }
  return async function percentiles(simbolo, desde, hasta) {
    const d0 = masDias(desde, -400).slice(0, 7) + '-01'   // al primer día del mes: la misma ventana para muchos valores
    const { dist, velas } = await distDe(d0, hasta)
    if (!dist.fechas.length) return null
    const propias = velas[simbolo]?.length ? velas[simbolo] : await lee(simbolo, d0, hasta).catch(() => [])
    if (!propias.length) return null
    return percentilesDe(propias, dist, { ticker: simbolo })
  }
}
