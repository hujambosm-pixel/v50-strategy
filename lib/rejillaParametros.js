// lib/rejillaParametros.js — las combinaciones de parámetros que probará el optimizador (función pura).
//
// Una REJILLA dice, para cada parámetro que se quiere variar, qué valores probar:
//   { emaR: { min: 5, max: 20, paso: 1 }, emaL: [8, 10, 12], stopLoss: ['tecnico_ema', 'ninguno'], reentry: [true, false] }
// Los parámetros que no aparecen no se varían: corren con su valor guardado. rejillaSugerida(esquema) da la
// rejilla por defecto de la declaración: la rejilla sugerida de cada numérico, todas las opciones de cada
// opción y los dos valores de cada sí/no.
//
// generaRejilla(esquema, rejilla, { base, max }) valida cada valor contra la declaración (tipo, rango, paso,
// opciones), descarta las combinaciones que no cumplen las restricciones (con `base`, los params guardados,
// para los parámetros que no se varían) y devuelve las que quedan. Antes de generar nada cuenta el producto:
// si pasa de `max`, no genera y lo dice.

import { validaCombinacion } from './parametrosEstrategia'

const decimales = (x) => { const s = String(x); const i = s.indexOf('.'); return i < 0 ? 0 : s.length - i - 1 }

// Los valores de un rango { min, max, paso }, sin la deriva de la coma flotante (0,1 + 0,2).
export function valoresDeRango({ min, max, paso }) {
  if (![min, max, paso].every(v => typeof v === 'number' && Number.isFinite(v)) || !(paso > 0) || max < min) return null
  const d = Math.max(decimales(min), decimales(paso))
  const n = Math.floor((max - min) / paso + 1e-9)
  if (n > 100000) return null
  return Array.from({ length: n + 1 }, (_, k) => Number((min + k * paso).toFixed(d)))
}

export function rejillaSugerida(esquema) {
  const rejilla = {}
  for (const p of esquema?.lista || []) {
    if (p.tipo === 'sino') rejilla[p.nombre] = [p.defecto, !p.defecto]
    else if (p.tipo === 'opcion') rejilla[p.nombre] = [...p.opciones]
    else if (p.sugerido) rejilla[p.nombre] = { ...p.sugerido }
  }
  return rejilla
}

/**
 * @returns {{ combinaciones: object[], total: number, porRestriccion: number, errores: string[], valores: object }}
 *   total: combinaciones antes de las restricciones (el producto); porRestriccion: las descartadas por ellas.
 *   Con errores (un valor que no vale, una rejilla que no es de esta estrategia) o si total > max, no se
 *   genera ninguna combinación.
 */
export function generaRejilla(esquema, rejilla, { base = {}, max = 100000 } = {}) {
  const salida = (extra) => ({ combinaciones: [], total: 0, porRestriccion: 0, errores: [], valores: {}, ...extra })
  if (!esquema || !Array.isArray(esquema.lista)) return salida({ errores: ['La estrategia no declara sus parámetros (run.parametros).'] })
  if (!rejilla || typeof rejilla !== 'object' || Array.isArray(rejilla)) return salida({ errores: ['La rejilla tiene que ser un objeto { parámetro: valores }.'] })
  const porNombre = new Map(esquema.lista.map(p => [p.nombre, p]))
  const errores = [], valores = {}
  for (const [nombre, spec] of Object.entries(rejilla)) {
    const p = porNombre.get(nombre)
    if (!p) { errores.push(`«${nombre}» no es un parámetro declarado de esta estrategia.`); continue }
    const lista = Array.isArray(spec) ? spec : (spec && typeof spec === 'object') ? valoresDeRango(spec) : null
    if (!lista) { errores.push(`«${nombre}»: hace falta una lista de valores o { min, max, paso } válidos.`); continue }
    const unicos = [...new Set(lista)]
    if (!unicos.length) { errores.push(`«${nombre}»: la lista de valores está vacía.`); continue }
    // Cada valor por separado (tipo, rango, paso, opciones), sin las restricciones: esas son de la combinación.
    const sinRestr = { ...esquema, restricciones: [] }
    for (const v of unicos) { const r = validaCombinacion(sinRestr, { [nombre]: v }); if (!r.ok) errores.push(...r.errores) }
    valores[nombre] = unicos
  }
  const nombres = Object.keys(valores)
  const total = nombres.length ? nombres.reduce((t, n) => t * valores[n].length, 1) : 0
  if (errores.length) return salida({ errores, total, valores })
  if (total > max) return salida({ errores: [`La rejilla tiene ${total} combinaciones; el máximo es ${max}.`], total, valores })
  const combinaciones = []
  let porRestriccion = 0
  const recorre = (i, actual) => {
    if (i === nombres.length) {
      if (validaCombinacion(esquema, actual, base).ok) combinaciones.push({ ...actual }); else porRestriccion++
      return
    }
    for (const v of valores[nombres[i]]) { actual[nombres[i]] = v; recorre(i + 1, actual) }
    delete actual[nombres[i]]
  }
  if (nombres.length) recorre(0, {})
  return { combinaciones, total, porRestriccion, errores: [], valores }
}
