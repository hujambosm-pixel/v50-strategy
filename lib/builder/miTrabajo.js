// lib/builder/miTrabajo.js — «Mi trabajo» del Builder (docs/builder.md, §4). Puro (async solo por las huellas).
// Una fila por estrategia (code_js y del editor) y una por lote congelado, con su paso (1 Crear / 2 Prueba / 3 Plan), su
// estado, el resumen de su último veredicto y la acción siguiente. Sale de lo que ya existe: strategies, editor_lotes y
// lab_pruebas (editorLote = prueba A / B de un lote; editorCalibracion y editorLab = el laboratorio con calibración;
// planLote = un lote de planes). Una estrategia del editor se reconoce en un lote por la HUELLA de su definición con sus
// valores (si se cambió después de congelar, ya no es la del lote).
import { esDefinicionEditor } from '../editor/fuente'
import { validaDefinicion, huellaDefinicion } from '../editor/definicion'
import { veredictoEditorLab, PERCENTIL_SUPERA_LAB } from '../editor/laboratorio'
import { PERCENTIL_SUPERA } from '../editor/lotes'

export const ESTADOS = Object.freeze({ borrador: 'Borrador', guardada: 'Guardada', congelada: 'Congelada', supera: 'Supera al azar', noSupera: 'No supera al azar', sinVeredicto: 'Sin veredicto', mejora: 'Mejora a la referencia', noMejora: 'No mejora a la referencia' })
const num = (x) => x == null || !Number.isFinite(x) ? '—' : String(Math.round(x * 10) / 10).replace('.', ',')
const params = (p) => { try { return typeof p === 'string' ? JSON.parse(p || '{}') : (p || {}) } catch (_) { return {} } }
// Las de código no entran en la prueba guiada del paso 2 (solo definiciones del editor).
export const NOTA_CODIGO = 'Las de código no entran en la prueba guiada; se prueban contra el azar en Backtesting.'
const masReciente = (a, b) => !a || String(b.creado) > String(a.creado) ? b : a

// El veredicto de una variante en una ejecución A / B de un lote (la forma de V9.1024 con periodos, o la de antes con A).
function veredictoAB(v) {
  if (!v) return null
  const ps = Array.isArray(v.periodos) ? v.periodos : v.A ? [{ A: v.A }] : []
  if (!ps.length) return null
  const pc = ps.map(p => p.A?.cagr?.percentil)
  const supera = typeof v.supera === 'boolean' ? v.supera : pc.every(x => x != null && x >= PERCENTIL_SUPERA)
  return { supera, texto: `Laboratorio de cartera: percentil ${pc.map(num).join(' · ')}` }
}

// filas de entrada: estrategias (de strategies), lotes (de editor_lotes) y pruebas (de lab_pruebas, con config y resultados).
export async function construyeMiTrabajo({ estrategias = [], lotes = [], pruebas = [] }) {
  // Las últimas ejecuciones por huella / lote.
  const ultLote = {}, ultCal = {}, ultLab = {}, ultPlan = {}
  for (const p of pruebas) {
    const c = p?.config || {}
    if (c.prueba === 'editorLote' && c.hashLote) ultLote[c.hashLote] = masReciente(ultLote[c.hashLote], p)
    else if (c.prueba === 'editorCalibracion' && c.huella) ultCal[c.huella] = masReciente(ultCal[c.huella], p)
    else if (c.prueba === 'editorLab' && c.huellaVariante) ultLab[c.huellaVariante] = masReciente(ultLab[c.huellaVariante], p)
    else if (c.prueba === 'planLote' && c.hashLote) ultPlan[c.hashLote] = masReciente(ultPlan[c.hashLote], p)
  }
  // Huella → variantes de lotes de estrategias.
  const enLotes = {}
  for (const f of lotes) if (f?.lote?.tipo !== 'planes') for (const v of f?.huellas?.variantes || []) (enLotes[v.huella] ||= []).push({ fila: f, id: v.id })
  const filas = []
  for (const s of estrategias) {
    const base = { clave: `e:${s.id}`, tipo: 'estrategia', nombre: s.name || '(sin nombre)', desactivada: s.enabled === false, estrategia: s }
    if (!esDefinicionEditor(s.definition)) {
      filas.push({ ...base, origen: 'código', paso: 1, estado: ESTADOS.guardada, resultado: '—', toca: { texto: '—', accion: null, nota: NOTA_CODIGO } })
      continue
    }
    const vs = params(s.params)
    if (validaDefinicion(s.definition, vs).length) { filas.push({ ...base, origen: 'editor', paso: 1, estado: ESTADOS.borrador, resultado: '—', toca: { texto: 'Terminarla en el editor', accion: { tipo: 'editor' } } }); continue }
    const h = await huellaDefinicion(s.definition, vs)
    const ls = enLotes[h] || []
    if (!ls.length) { filas.push({ ...base, origen: 'editor', paso: 1, estado: ESTADOS.guardada, resultado: '—', huella: h, toca: { texto: 'Probarla contra el azar', accion: { tipo: 'prueba', estrategiaId: s.id } } }); continue }
    // En algún lote: el más reciente con ejecución manda para la prueba A / B.
    const conRun = ls.map(x => ({ ...x, run: ultLote[x.fila.hash_lote] })).sort((a, b) => String(b.run?.creado || b.fila.creado).localeCompare(String(a.run?.creado || a.fila.creado)))
    const ref = conRun[0], ab = ref.run ? veredictoAB((ref.run.resultados?.variantes || []).find(v => v.id === ref.id)) : null
    const cal = ultCal[h]?.resultados || null, lab = ultLab[h]?.resultados?.periodos || null
    const loteAcc = { tipo: 'prueba', loteId: ref.fila.id }
    let estado, resultado, toca
    if (cal && lab) {
      const v = veredictoEditorLab(cal, lab)
      estado = v === 'pasa' ? ESTADOS.supera : v === 'no pasa' ? ESTADOS.noSupera : ESTADOS.sinVeredicto
      resultado = `Laboratorio de operaciones: percentil ${lab.map(p => num(p.azar?.percentil)).join(' · ')} (${cal.calibrada ? 'verificación de sesgos superada' : 'no supera la verificación de sesgos'})${ab ? ` · ${ab.texto}` : ''}`
      toca = v === 'pasa' ? { texto: 'Convertirla en plan (paso 3, próximamente)', accion: null } : { texto: 'Revisar la prueba', accion: loteAcc }
    } else if (ab) {
      estado = ab.supera ? ESTADOS.supera : ESTADOS.noSupera
      resultado = `${ab.texto} (prueba ${ref.fila.nombre})`
      toca = { texto: cal ? 'Probar en el laboratorio de operaciones' : 'Verificar sesgos y probar en el laboratorio de operaciones', accion: loteAcc }
    } else {
      estado = ESTADOS.congelada; resultado = `En la prueba ${ref.fila.nombre}, sin ejecutar`
      toca = { texto: 'Continuar la prueba', accion: loteAcc }
    }
    filas.push({ ...base, origen: 'editor', paso: 2, estado, resultado, huella: h, toca })
  }
  for (const f of lotes) {
    const base = { clave: `l:${f.id}`, tipo: 'lote', nombre: f.nombre, lote: f, origen: f.lote?.tipo === 'planes' ? 'prueba de planes' : 'prueba' }
    if (f.lote?.tipo === 'planes') {
      const run = ultPlan[f.hash_lote], r = run?.resultados?.resumen
      filas.push({ ...base, paso: 3, estado: !run ? ESTADOS.congelada : r?.mejoran > 0 ? ESTADOS.mejora : ESTADOS.noMejora, resultado: r?.texto || '—', toca: { texto: run ? 'Ver el resultado (pantalla de planes, próximamente)' : 'Ejecutarlo (pantalla de planes, próximamente)', accion: null } })
      continue
    }
    const run = ultLote[f.hash_lote], r = run?.resultados?.resumen
    filas.push({ ...base, paso: 2, estado: !run ? ESTADOS.congelada : r?.superan > 0 ? ESTADOS.supera : ESTADOS.noSupera, resultado: r?.texto ? r.texto.replace(/en la prueba A/g, 'en el laboratorio de cartera') : (run ? '—' : 'Sin ejecutar'), toca: { texto: run ? 'Ver el resultado' : 'Continuar la prueba', accion: { tipo: 'prueba', loteId: f.id } } })
  }
  // Primero lo del editor y los lotes (lo que tiene un paso siguiente); después las de código, en su orden.
  return [...filas.filter(f => f.origen !== 'código'), ...filas.filter(f => f.origen === 'código')]
}
export { PERCENTIL_SUPERA_LAB }
