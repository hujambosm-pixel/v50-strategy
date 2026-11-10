// lib/screener/datos.js — leer las empresas del screener desde la pantalla (docs/screener.md). Las cifras de cada empresa
// ya vienen calculadas en la columna `metricas` (las calcula scripts/cargaScreener.js con lib/screener/metricas.js): la
// pantalla no lee las ~150.000 filas de cuentas.
//   ctx: { url, headers, fetch } — ctxConSesion() de lib/supabase.js.
import { medianasPorSector } from './metricas'

const COLUMNAS = 'simbolo,nombre,sector,sector_fuente,en_sp500,en_ndx,en_listas,precio,precio_fecha,peg_esperado,peg_esperado_fecha,aviso,actualizada,metricas'
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
      aviso: r.aviso || null, actualizada: r.actualizada || null,
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
