// lib/registroLab.js — registro de las pruebas del laboratorio de señales en public.lab_pruebas (sql/lab_pruebas.sql).
// Todavía sin pantalla. Cada prueba guarda su configuración, la huella de esa configuración y un RESUMEN de resultados.
//
// OFICIAL O EXPLORATORIA. Una prueba es oficial solo si la huella de su configuración coincide EXACTAMENTE con la de un
// elemento de un lote declarado (lib/lotesLab.js); entonces se guardan el lote y el elemento. Cualquier otra
// configuración —un parámetro distinto, otro periodo, otra salida— queda como exploratoria, con lote y elemento nulos.
// Llevar la cuenta de todas (contadorPruebas) es lo que permite juzgar un resultado sabiendo cuántas cosas se probaron.
//
// La tabla es de solo añadir para el usuario (RLS: leer e insertar lo suyo; ni cambiar ni borrar), y los resultados no
// pueden pasar de MAX_RESULTADOS_BYTES (también lo comprueba la tabla).
import { LOTES, configDeItem, huella } from './lotesLab'
import { validaCombinacion } from './senales'

export const MAX_RESULTADOS_BYTES = 50 * 1024
const tamano = (x) => new TextEncoder().encode(JSON.stringify(x ?? null)).length

// { hash, oficial, lote, item } de una configuración.
export async function clasificaConfig(config) {
  const hash = await huella(config)
  for (const lote of Object.values(LOTES)) {
    for (const it of lote.items) {
      if (await huella(configDeItem(lote, it.id)) === hash) return { hash, oficial: true, lote: lote.id, item: it.id }
    }
  }
  return { hash, oficial: false, lote: null, item: null }
}

// La fila que se guarda (sin id, creado ni user_id, que pone la base). Lanza si la configuración no es válida o los
// resultados son demasiado grandes.
export async function filaDePrueba({ config, resultados = null, versionApp = null }) {
  const errores = validaCombinacion(config?.senales || {})
  if (errores.length) throw new Error('Configuración no válida: ' + errores.join(' '))
  const bytes = tamano(resultados)
  if (bytes > MAX_RESULTADOS_BYTES) throw new Error(`Los resultados ocupan ${Math.round(bytes / 1024)} KB: el máximo es ${MAX_RESULTADOS_BYTES / 1024} KB (guarda solo el resumen).`)
  const c = await clasificaConfig(config)
  return { version_app: versionApp, lote: c.lote, item_lote: c.item, oficial: c.oficial, config, hash_config: c.hash, resultados }
}

// Guarda una prueba por REST (PostgREST) con las cabeceras de la sesión. Devuelve la fila guardada.
export async function guardarPrueba(prueba, { url, headers, fetch: f = fetch }) {
  const fila = await filaDePrueba(prueba)
  const r = await f(`${url}/rest/v1/lab_pruebas`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify(fila) })
  if (!r.ok) throw new Error(`No se pudo guardar la prueba (HTTP ${r.status}).`)
  const j = await r.json()
  return Array.isArray(j) ? j[0] : j
}

// Las últimas pruebas (sin los resultados si soloResumen), de la más nueva a la más vieja.
export async function listarPruebas({ url, headers, fetch: f = fetch }, { limite = 100, soloResumen = true } = {}) {
  const cols = soloResumen ? 'id,creado,version_app,lote,item_lote,oficial,hash_config' : '*'
  const r = await f(`${url}/rest/v1/lab_pruebas?select=${cols}&order=creado.desc,id.desc&limit=${limite}`, { headers })
  if (!r.ok) throw new Error(`No se pudieron leer las pruebas (HTTP ${r.status}).`)
  return r.json()
}

// Cuántas pruebas hay: total, oficiales y exploratorias.
export function contadorPruebas(filas = []) {
  const oficiales = filas.filter(x => x.oficial === true).length
  return { total: filas.length, oficiales, exploratorias: filas.length - oficiales }
}
// El contador pidiendo a la base solo los recuentos (Prefer: count=exact; Content-Range «0-0/N» o «*/0»), sin traer filas:
// así no lo corta el límite de filas de PostgREST.
export async function cuentaPruebas({ url, headers, fetch: f = fetch }) {
  const cuenta = async (filtro) => {
    const r = await f(`${url}/rest/v1/lab_pruebas?select=id${filtro}&limit=1`, { headers: { ...headers, Prefer: 'count=exact' } })
    if (!r.ok) throw new Error(`No se pudieron contar las pruebas (HTTP ${r.status}).`)
    const n = Number(String(r.headers.get('content-range') || '').split('/')[1])
    if (!Number.isFinite(n)) throw new Error('La base no devolvió el recuento de pruebas.')
    return n
  }
  const [total, oficiales] = await Promise.all([cuenta(''), cuenta('&oficial=eq.true')])
  return { total, oficiales, exploratorias: total - oficiales }
}
