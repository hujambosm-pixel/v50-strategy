// lib/universoMc.js — el universo dinámico en la pantalla del multibacktest (Fase 8a): leer de la base la selección del
// screener y los miembros del índice, y decidir qué dice y si se puede pulsar el botón de ejecutar. Con universo dinámico
// los activos NO son los marcados en la lista manual: son los de la máscara en el periodo (universoDePeriodo).
import { universoDePeriodo } from './screener'

export const INICIO_UNIVERSO = '2016-01-01'
// 'manual' → null; 'ndx_vol_20' → 20.
export const nDeUniverso = (v) => (!v || v === 'manual') ? null : (Number(String(v).split('_').pop()) || null)
export const nombreUniverso = (n) => `Nasdaq-100 · ${n} más volátiles`

// Las filas de public.universo_screener (regla «volatilidad», ese N) y de public.universo_miembros (NDX), por REST con
// las cabeceras de la sesión. Lanza si alguna lectura falla.
export async function cargaUniversoMc(n, { url, headers, fetch: f = fetch }) {
  const [rf, rm] = await Promise.all([
    f(`${url}/rest/v1/universo_screener?regla=eq.volatilidad&n=eq.${n}&select=regla,n,anio,simbolo_yahoo,posicion,volatilidad`, { headers }),
    f(`${url}/rest/v1/universo_miembros?indice=eq.NDX&select=simbolo,simbolo_yahoo,nombre,desde,hasta,excluido_motivo`, { headers }),
  ])
  if (!rf.ok || !rm.ok) throw new Error('No se pudo leer el universo de la base de datos.')
  return { filas: await rf.json(), miembros: await rm.json() }
}

// Estado del botón de ejecutar con universo dinámico (null con «Lista manual»: el botón de siempre).
//   datos: lo de cargaUniversoMc (o { error }) · fromDate/toDate: el periodo que se va a pedir · estrategias: las elegidas.
// Devuelve { activo, texto, motivo, universo } — universo (el de universoDePeriodo) solo si se puede ejecutar.
export function estadoUniversoMc({ universo: v, datos, fromDate, toDate, estrategias = [] }) {
  const n = nDeUniverso(v)
  if (!n) return null
  const nombre = nombreUniverso(n)
  const no = (motivo) => ({ activo: false, texto: `▶ EJECUTAR — ${motivo}`, motivo, universo: null })
  if (!datos) return no(`cargando ${nombre}…`)
  if (datos.error) return no(datos.error)
  if (!fromDate || fromDate < INICIO_UNIVERSO) return no('el universo empieza el 01/01/2016')
  const u = universoDePeriodo(datos.filas, datos.miembros, fromDate, toDate || '9999-12-31')
  if (!u.simbolos.length) return no(`${nombre}: sin selección en ese periodo`)
  const ids = (estrategias || []).filter(Boolean)
  if (ids.includes('__portfolio__')) return no('el universo dinámico no admite ◈ Multicartera')
  if (ids.length === 0) return no('elige una estrategia')
  if (ids.length > 1) return no('con universo dinámico, una sola estrategia')
  return { activo: true, texto: `▶ EJECUTAR — ${nombre} (${u.simbolos.length} activos)`, motivo: null, universo: u }
}
