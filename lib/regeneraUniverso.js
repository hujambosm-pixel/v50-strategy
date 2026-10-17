// lib/regeneraUniverso.js — «Regenerar universo» desde la pantalla del multibacktest (V9.994), sin tarea programada.
//
// La selección del screener de cada año (public.universo_screener) la escribe scripts/generaScreener.js. Si al empezar un
// año aún no está el año en curso, la app lo detecta (anioQueFalta) y lo avisa; el botón «Regenerar universo» calcula ese
// año en el navegador con lib/screener.js —las dos reglas, N = 10, 20 y 30, con los miembros de universo_miembros y los
// cierres de la caché (rpc/leer_velas) de los dos años anteriores: lo mismo que lee el script— y lo escribe con
// regenera_universo_anio (sql/universo_regenera.sql), que guarda antes la COPIA de lo que había ese año, registra la
// escritura con su huella de antes y de después y permite revertirla (revierte_universo_escritura).
// Solo se escribe un año completo: si a los precios les falta diciembre del año anterior, no se escribe nada.
import { REGLAS } from './screener'

export const NS_UNIVERSO = [10, 20, 30]
export const REGLAS_UNIVERSO = ['volatilidad', 'momentum']
const EN_PARALELO = 12

// El año en curso si no tiene ninguna fila en las filas leídas de universo_screener (null si está o si no hay filas).
export function anioQueFalta(filas, hoy = new Date().toISOString().slice(0, 10)) {
  if (!Array.isArray(filas) || !filas.length) return null
  const y = Number(hoy.slice(0, 4))
  return filas.some(f => Number(f.anio) === y) ? null : y
}

// Las filas de un año para universo_screener (las mismas que escribiría scripts/generaScreener.js).
export function filasDelAnio(anio, miembros, velas) {
  const filas = []
  for (const regla of REGLAS_UNIVERSO) for (const N of NS_UNIVERSO)
    REGLAS[regla](anio, N, miembros, velas).seleccionados.forEach((x, i) => filas.push({ regla, n: N, anio, simbolo_yahoo: x.simbolo, posicion: i + 1, volatilidad: regla === 'momentum' ? x.momentum : x.vol }))
  return filas
}

// Calcula y escribe el año. ctx: { url, headers, fetch? }. alProgreso(texto). Devuelve lo que devuelve la función SQL
// ({ id, anio, huella_antes, huella_despues, filas_antes, filas }) y cuántos símbolos se leyeron.
export async function regeneraAnio(anio, { url, headers, fetch: f = fetch, alProgreso = () => {} }) {
  const get = async (ruta) => { const r = await f(`${url}/rest/v1/${ruta}`, { headers }); if (!r.ok) throw new Error(`La base respondió ${r.status} a ${ruta.split('?')[0]}`); return r.json() }
  alProgreso('Leyendo los miembros del índice…')
  const miembros = await get('universo_miembros?indice=eq.NDX&select=simbolo,simbolo_yahoo,nombre,desde,hasta,motivo_salida,excluido_motivo&order=desde,simbolo')
  const fecha = `${anio}-01-01`, cubre = (t) => t.desde <= fecha && (t.hasta == null || fecha < t.hasta)
  const simbolos = [...new Set(miembros.filter(t => cubre(t) && !t.excluido_motivo && t.simbolo_yahoo).map(t => t.simbolo_yahoo))].sort()
  const velas = {}
  for (let i = 0; i < simbolos.length; i += EN_PARALELO) {
    alProgreso(`Leyendo precios: ${Math.min(i + EN_PARALELO, simbolos.length)} de ${simbolos.length} valores…`)
    const lote = simbolos.slice(i, i + EN_PARALELO)
    const rs = await Promise.all(lote.map(s => get(`rpc/leer_velas?p_simbolo=${encodeURIComponent(s)}&p_desde=${anio - 2}-01-01&p_hasta=${anio - 1}-12-31`)))
    lote.forEach((s, k) => { const j = rs[k] || {}; velas[s] = (j.fecha || []).map((date, x) => ({ date, close: j.close[x] })) })
  }
  // Un año completo: la mayoría de los valores tienen que llegar a la última semana de diciembre del año anterior.
  const conDiciembre = simbolos.filter(s => { const v = velas[s]; return v.length && v[v.length - 1].date >= `${anio - 1}-12-20` }).length
  if (conDiciembre < simbolos.length * 0.8) throw new Error(`A los precios de la caché les falta diciembre de ${anio - 1} (${conDiciembre} de ${simbolos.length} valores llegan): actualiza la caché antes de regenerar.`)
  alProgreso('Calculando la selección…')
  const filas = filasDelAnio(anio, miembros, velas)
  alProgreso('Escribiendo (con copia previa y registro)…')
  const r = await f(`${url}/rest/v1/rpc/regenera_universo_anio`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_anio: anio, p_filas: filas }) })
  const j = await r.json().catch(() => null)
  if (!r.ok) throw new Error(`No se pudo escribir: ${j?.message || `HTTP ${r.status}`}`)
  return { ...j, simbolos: simbolos.length }
}

// Revierte una escritura (vuelve a poner la copia de antes), solo si nadie ha cambiado ese año después.
export async function revierteEscritura(id, { url, headers, fetch: f = fetch }) {
  const r = await f(`${url}/rest/v1/rpc/revierte_universo_escritura`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_id: id }) })
  const j = await r.json().catch(() => null)
  if (!r.ok) throw new Error(`No se pudo revertir: ${j?.message || `HTTP ${r.status}`}`)
  return j
}
