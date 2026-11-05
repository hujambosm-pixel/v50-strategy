// lib/registroLab.js — la fila que se guarda en public.lab_pruebas (sql/lab_pruebas.sql). Hoy solo la usa la ejecución de
// un lote de planes (pages/api/planes-lote.js, prueba 'planLote'), que siempre es exploratoria. Las pruebas del Laboratorio,
// sus lotes oficiales y su pantalla se retiraron (docs/builder.md, §75).
//
// La tabla es de solo añadir para el usuario (RLS: leer e insertar lo suyo; ni cambiar ni borrar), y los resultados no
// pueden pasar de MAX_RESULTADOS_BYTES (también lo comprueba la tabla).
import { huella, validaConfig } from './lotesLab'

export const MAX_RESULTADOS_BYTES = 50 * 1024
const tamano = (x) => new TextEncoder().encode(JSON.stringify(x ?? null)).length

// { hash, oficial, lote, item } de una configuración: ya no quedan lotes oficiales, así que siempre es exploratoria.
export async function clasificaConfig(config) {
  return { hash: await huella(config), oficial: false, lote: null, item: null }
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
