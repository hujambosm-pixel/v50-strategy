// lib/registroLab.js — registro de las pruebas del laboratorio de señales en public.lab_pruebas (sql/lab_pruebas.sql).
// Lo usa la pantalla components/LaboratorioPanel.js. Cada prueba guarda su configuración, la huella de esa configuración y un RESUMEN de resultados.
//
// OFICIAL O EXPLORATORIA. Una prueba es oficial solo si la huella de su configuración coincide EXACTAMENTE con la de un
// elemento de un lote declarado (lib/lotesLab.js); entonces se guardan el lote y el elemento. Cualquier otra
// configuración —un parámetro distinto, otro periodo, otra salida— queda como exploratoria, con lote y elemento nulos.
// Llevar la cuenta de todas (contadorPruebas) es lo que permite juzgar un resultado sabiendo cuántas cosas se probaron.
//
// La tabla es de solo añadir para el usuario (RLS: leer e insertar lo suyo; ni cambiar ni borrar), y los resultados no
// pueden pasar de MAX_RESULTADOS_BYTES (también lo comprueba la tabla).
import { LOTES, configDeItem, huella, validaConfig, notaResimulado } from './lotesLab'

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
  const errores = validaConfig(config)
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

// Las últimas pruebas (sin los resultados si soloResumen), de la más nueva a la más vieja. `select` (columnas de PostgREST,
// también rutas JSON con alias) sustituye a las de soloResumen; `filtro`, condiciones extra («&lote=eq.LOTE_1»).
export async function listarPruebas({ url, headers, fetch: f = fetch }, { limite = 100, soloResumen = true, select = null, filtro = '' } = {}) {
  const cols = select || (soloResumen ? 'id,creado,version_app,lote,item_lote,oficial,hash_config' : '*')
  const r = await f(`${url}/rest/v1/lab_pruebas?select=${cols}${filtro}&order=creado.desc,id.desc&limit=${limite}`, { headers })
  if (!r.ok) throw new Error(`No se pudieron leer las pruebas (HTTP ${r.status}).`)
  return r.json()
}
// Para el historial de la pantalla: lo de cada prueba sin traer los resultados enteros (veredicto, percentil, operaciones y
// percentil del azar re-simulado de cada periodo con rutas JSON; hasta 3 periodos).
const COLS_PERIODOS = [0, 1, 2].map(k => `p${k}:resultados->periodos->${k}->azar->>percentil,o${k}:resultados->periodos->${k}->>operaciones,`
  + `r${k}:resultados->periodos->${k}->otrosAzares->resimulado->>percentil`).join(',')
export const SELECT_HISTORIAL = 'id,creado,version_app,lote,item_lote,oficial,hash_config,config,veredicto:resultados->>veredicto,' + COLS_PERIODOS
// Los periodos resumidos de una fila de esas columnas (lo que necesitan veredictoLab y notaResimulado).
export const periodosDeFila = (f) => [0, 1, 2].filter(k => f[`o${k}`] != null).map(k => ({ operaciones: Number(f[`o${k}`]),
  azar: { percentil: f[`p${k}`] == null ? null : Number(f[`p${k}`]) }, otrosAzares: { resimulado: { percentil: f[`r${k}`] == null ? null : Number(f[`r${k}`]) } } }))
export const notaDeFila = (f) => notaResimulado({ oficial: f.oficial, lote: f.lote, veredicto: f.veredicto, periodos: periodosDeFila(f) })
// Una prueba entera (con sus resultados).
export async function leerPrueba(ctx, id) {
  const filas = await listarPruebas(ctx, { limite: 1, select: '*', filtro: `&id=eq.${Number(id)}` })
  if (!filas.length) throw new Error(`No existe la prueba ${id}.`)
  return filas[0]
}
// Estado de cada elemento de un lote según el registro: { [item]: { estado, id, creado, veces, nota } } con el veredicto de
// su prueba oficial MÁS RECIENTE (estado 'pendiente' si nunca se ejecutó) y su nota (notaResimulado), si la lleva.
export async function estadoLote(ctx, lote) {
  const filas = await listarPruebas(ctx, { limite: 1000, select: `id,creado,oficial,lote,item_lote,veredicto:resultados->>veredicto,${COLS_PERIODOS}`, filtro: `&oficial=eq.true&lote=eq.${encodeURIComponent(lote.id)}` })
  const out = Object.fromEntries(lote.items.map(it => [it.id, { estado: 'pendiente', id: null, creado: null, veces: 0, nota: null }]))
  for (const x of filas) {   // de la más nueva a la más vieja
    const e = out[x.item_lote]
    if (!e) continue
    if (!e.veces) Object.assign(e, { estado: x.veredicto || 'sin resultado', id: x.id, creado: x.creado, nota: notaDeFila(x) })
    e.veces++
  }
  return out
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
  // Una EXPLORACIÓN (V9.982) es una fila que contiene muchas combinaciones: cuenta como tantas pruebas exploratorias como
  // combinaciones tiene (config.combinaciones).
  const [total0, oficiales, expl] = await Promise.all([cuenta(''), cuenta('&oficial=eq.true'),
    listarPruebas({ url, headers, fetch: f }, { limite: 1000, select: 'id,combinaciones:config->combinaciones', filtro: '&config->>prueba=eq.exploracion' })])
  const total = total0 + expl.reduce((s, x) => s + Math.max(0, (Number(x.combinaciones) || 1) - 1), 0)
  return { total, oficiales, exploratorias: total - oficiales, exploraciones: expl.length }
}
