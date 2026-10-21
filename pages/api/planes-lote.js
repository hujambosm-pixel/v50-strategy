// pages/api/planes-lote.js — LOTES DE PLANES en editor_lotes (lib/planes/lotes.js; docs/planes-inversion.md, decisión 10).
// Solo el motor: la pantalla irá en el futuro «Builder». Todo con el JWT del usuario (RLS «dueño» de editor_lotes y lab_pruebas).
//
//   POST { accion: 'congelar', lote, versionApp? } → 201 { fila } | 409 (ya congelado: misma huella) | 400 (errores)
//   POST { accion: 'listar' }                      → { filas } (solo los de tipo 'planes')
//   POST { accion: 'ejecutar', id, versionApp? }   → { lote, resultados, resumen, registro } — cada variante con su plan, sus
//     referencias, los inicios rodantes y el veredicto del criterio; se guarda en lab_pruebas (prueba 'planLote').
import { exigeAuth } from '../../lib/verificaJwt'
import { validaLotePlanes, huellasLotePlanes, evaluaVariante, resumenLotePlanes, esLotePlanes } from '../../lib/planes/lotes'
import { cargaDatosPlan } from '../../lib/planes/datosServidor'
import { filaDePrueba } from '../../lib/registroLab'

export const config = { maxDuration: 60 }
const SUPA_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPA_KEY = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' })
  const auth = await exigeAuth('planes-lote', req)
  if (!auth.ok) return res.status(401).json({ error: 'no autenticado' })
  const { accion, lote, id, versionApp = null } = req.body || {}
  const headers = { apikey: SUPA_KEY, Authorization: `Bearer ${req.headers['x-supa-jwt']}`, 'Content-Type': 'application/json' }
  try {
    if (accion === 'congelar') {
      const errores = validaLotePlanes(lote)
      if (errores.length) return res.status(400).json({ error: errores.join(' '), errores })
      const huellas = await huellasLotePlanes(lote)
      const r = await fetch(`${SUPA_URL}/rest/v1/editor_lotes`, { method: 'POST', headers: { ...headers, Prefer: 'return=representation' },
        body: JSON.stringify({ version_app: versionApp, nombre: lote.nombre.trim(), lote, hash_lote: huellas.lote, huellas }) })
      if (r.status === 409) return res.status(409).json({ error: 'Ese lote ya está congelado (misma huella).', hash_lote: huellas.lote })
      if (!r.ok) return res.status(500).json({ error: `No se pudo congelar el lote (HTTP ${r.status}).` })
      const j = await r.json()
      return res.status(201).json({ fila: Array.isArray(j) ? j[0] : j })
    }
    if (accion === 'listar') {
      const r = await fetch(`${SUPA_URL}/rest/v1/editor_lotes?select=id,creado,version_app,nombre,lote,hash_lote,huellas&order=creado.desc,id.desc&limit=100`, { headers })
      if (!r.ok) return res.status(500).json({ error: `No se pudieron leer los lotes (HTTP ${r.status}).` })
      return res.status(200).json({ filas: (await r.json()).filter(f => esLotePlanes(f.lote)) })
    }
    if (accion === 'ejecutar') {
      if (!Number.isInteger(id)) return res.status(400).json({ error: 'Falta el id del lote.' })
      const r = await fetch(`${SUPA_URL}/rest/v1/editor_lotes?id=eq.${id}&select=id,nombre,lote,hash_lote,huellas`, { headers })
      if (!r.ok) return res.status(500).json({ error: `No se pudo leer el lote (HTTP ${r.status}).` })
      const [fila] = await r.json()
      if (!fila || !esLotePlanes(fila.lote)) return res.status(404).json({ error: 'No hay ningún lote de planes con ese id.' })
      const t0 = Date.now(), resultados = [], cache = {}
      for (const v of fila.lote.variantes) {
        const clave = v.plan.etf || '-'
        if (!cache[clave]) { const c = await cargaDatosPlan(v.plan, { d0: v.plan.periodo.desde, d1: v.plan.periodo.hasta, supaUrl: SUPA_URL, headers }); if (c.error) return res.status(500).json({ error: c.error }); cache[clave] = c.datos }
        resultados.push(evaluaVariante(fila.lote, v, cache[clave]))
      }
      const resumen = resumenLotePlanes(resultados, fila.lote.comun.referencia)
      // El registro (lab_pruebas): exploratoria, con la huella del lote y las de sus variantes.
      let registro = null
      try {
        const compacto = resultados.map(x => ({ id: x.id, nombre: x.nombre, veredicto: x.veredicto, medidas: { twr: x.medidas.twr, twrNeto: x.medidas.twrNeto, tir: x.medidas.tir, caida: x.medidas.caida.caida, valorNeto: x.medidas.valorNeto, aportado: x.medidas.aportado, impuestos: x.medidas.impuestosPagados, costes: x.medidas.costesPagados },
          comparaciones: x.comparaciones, rodantes: x.rodantes ? { n: x.rodantes.n, ganaA: x.rodantes.ganaA, twrNetoMediano: x.rodantes.resumen.plan.twrNeto?.mediana ?? null } : null }))
        const f = await filaDePrueba({ config: { prueba: 'planLote', hashLote: fila.hash_lote, nombre: fila.nombre, comun: fila.lote.comun, variantes: fila.huellas.variantes }, resultados: { variantes: compacto, resumen }, versionApp })
        const g = await fetch(`${SUPA_URL}/rest/v1/lab_pruebas`, { method: 'POST', headers: { ...headers, Prefer: 'return=representation' }, body: JSON.stringify(f) })
        registro = g.ok ? { guardado: true } : { guardado: false, error: `HTTP ${g.status}` }
      } catch (e) { registro = { guardado: false, error: e.message } }
      return res.status(200).json({ lote: { id: fila.id, nombre: fila.nombre, hash_lote: fila.hash_lote }, resultados, resumen, registro, tiempos: { totalMs: Date.now() - t0 } })
    }
    return res.status(400).json({ error: 'La acción tiene que ser congelar, listar o ejecutar.' })
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Error interno' })
  }
}
