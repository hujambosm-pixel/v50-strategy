// lib/screener/datos.js — leer las empresas del screener desde la pantalla (docs/screener.md). Las cifras de cada empresa
// ya vienen calculadas en la columna `metricas` (las calcula scripts/cargaScreener.js con lib/screener/metricas.js): la
// pantalla no lee las ~150.000 filas de cuentas.
//   ctx: { url, headers, fetch } — ctxConSesion() de lib/supabase.js.
import { medianasPorSector } from './metricas'
import { cifrasTecnicas, fuerzaSector, tecnicoDe, ANIOS_TECNICO, REFERENCIAS_TECNICO } from './tecnico'
import { deColumnasBd } from '../cachePrecios'

const COLUMNAS = 'simbolo,nombre,sector,sector_fuente,en_sp500,en_ndx,en_listas,precio,precio_fecha,peg_esperado,peg_esperado_fecha,aviso,actualizada,metricas,tecnico'
const PAGINA = 1000   // el máximo de filas por petición de la API de Supabase

const jsonDe = async (r, que) => { if (!r.ok) { let m = ''; try { m = (await r.json())?.message || '' } catch (_) {} throw new Error(`No se pudo ${que} (HTTP ${r.status}${m ? `: ${m}` : ''}).`) } return r.status === 204 ? null : r.json() }

// Las filas tal cual, por páginas.
export async function leerFilasEmpresas({ url, headers, fetch: f = fetch }) {
  const filas = []
  for (let desde = 0; ; desde += PAGINA) {
    const r = await f(`${url}/rest/v1/screener_empresas?select=${COLUMNAS}&order=simbolo.asc&limit=${PAGINA}&offset=${desde}`, { headers })
    const p = await jsonDe(r, 'leer las empresas del screener')
    filas.push(...(p || []))
    if (!p || p.length < PAGINA) break
  }
  return filas
}

// De las filas de la base a las empresas de la pantalla: { simbolo, nombre, sector, …, moneda, cuentasHasta, fechas, piezas, m }
// (la forma de metricasDe). Las que aún no tienen métricas se quedan con todo a null (no pasan ningún filtro encendido).
export function empresasDeFilas(filas) {
  const lista = (filas || []).map(r => {
    const x = r.metricas || {}
    return {
      simbolo: r.simbolo, nombre: r.nombre, sector: r.sector, sectorFuente: r.sector_fuente,
      en_sp500: !!r.en_sp500, en_ndx: !!r.en_ndx, en_listas: !!r.en_listas,
      precio: r.precio != null ? Number(r.precio) : null, precioFecha: r.precio_fecha || null, pegFecha: r.peg_esperado_fecha || null,
      aviso: r.aviso || null, actualizada: r.actualizada || null, tecnico: r.tecnico || null,
      moneda: x.moneda || null, cuentasHasta: x.cuentasHasta || null, fechas: x.fechas || {}, piezas: x.piezas || {}, m: { ...(x.m || {}) },
    }
  })
  medianasPorSector(lista)
  return lista
}

// La fecha más reciente de la carga (para la línea «datos del …»).
export function fechaDatos(empresas) {
  let max = null
  for (const e of empresas || []) if (e.actualizada && (!max || e.actualizada > max)) max = e.actualizada
  return max
}

// ── Piso técnico (parte 2) ──
// Las empresas con sus cifras técnicas en `t` ({ emaDist, dist52, rvol, var3m, sector }; lib/screener/tecnico.js). refs = { SPY: tecnico,
// XLK: tecnico, … } (para la fuerza del sector). Devuelve una lista nueva (no cambia las empresas que recibe).
export function conTecnico(empresas, refs) {
  return (empresas || []).map(e => ({ ...e, t: { ...cifrasTecnicas(e.tecnico), sector: fuerzaSector(e.sector, refs) } }))
}
// El técnico de SPY y de los ETF de sectores, con las velas de la caché de precios (leer_velas; la caché solo guarda velas
// cerradas): la misma ventana que la ruta /api/screener-tecnico (desde el mismo día de hace ANIOS_TECNICO años, UTC). Uno que
// falle o no esté en la caché se queda fuera (sin él, la fuerza de su sector sale «—»).
export async function leerReferencias({ url, fetch: f = fetch }, hoy = new Date().toISOString().slice(0, 10)) {
  const [y, m, d] = hoy.split('-').map(Number)
  const desde = new Date(Date.UTC(y - ANIOS_TECNICO, m - 1, d)).toISOString().slice(0, 10)
  const refs = {}
  await Promise.all(REFERENCIAS_TECNICO.map(async s => {
    try {
      const r = await f(`${url}/rest/v1/rpc/leer_velas`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ p_simbolo: s, p_desde: desde }) })
      if (!r.ok) return
      const t = tecnicoDe(deColumnasBd(await r.json()))
      if (t) refs[s] = t
    } catch (_) {}
  }))
  return refs
}
// §22: las velas DIARIAS de un valor para los gráficos de «Charts»: las de la caché (leer_velas), con la misma ventana que el
// técnico (5 años). Devuelve las velas del motor ({ date, open, high, low, close, volume }); lanza un error si la petición falla.
export async function leerVelasGrafico({ url, fetch: f = fetch }, simbolo, hoy = new Date().toISOString().slice(0, 10)) {
  const [y, m, d] = hoy.split('-').map(Number)
  const desde = new Date(Date.UTC(y - ANIOS_TECNICO, m - 1, d)).toISOString().slice(0, 10)
  const r = await f(`${url}/rest/v1/rpc/leer_velas`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ p_simbolo: simbolo, p_desde: desde }) })
  return deColumnasBd(await jsonDe(r, `leer los precios de ${simbolo}`))
}
// La fecha de precios más reciente del técnico (para la línea «precios del …»).
export function fechaTecnico(empresas) {
  let max = null
  for (const e of empresas || []) { const x = e.tecnico?.fecha; if (x && (!max || x > max)) max = x }
  return max
}
