// scripts/comprobaciones/huellas.js — las huellas de las pruebas congeladas del editor (PRUEBA_EDITOR_1, RETROCESOS_1 y
// PRUEBA_BUILDER_1 · 2026-10-22), recalculadas con el código del árbol de trabajo (lib/editor/lotes.js, huellasLote) frente a la
// guardada en editor_lotes. La base se lee en SOLO LECTURA con scripts/guardian/lecturaBd.js (el token de «supabase login» o
// SUPABASE_ACCESS_TOKEN; el proyecto, de .env.local); aquí no hay ninguna credencial.
const C0 = require('./cargador')
const { consultaSoloLectura } = require('../guardian/lecturaBd')
const ESPERADAS = [['PRUEBA_EDITOR_1', 'a2cdfd85'], ['RETROCESOS_1', '23c5006c'], ['PRUEBA_BUILDER_1 · 2026-10-22', '0d6726ec']]
;(async () => {
  await C0.prepara(); C0.registra(C0.RAIZ)
  const LO = require(C0.RAIZ + '/lib/editor/lotes.js')
  const filas = await consultaSoloLectura("SELECT nombre, lote, hash_lote FROM editor_lotes WHERE nombre IN ('PRUEBA_EDITOR_1', 'RETROCESOS_1', 'PRUEBA_BUILDER_1 · 2026-10-22');")
  let f = 0
  for (const [nombre, h0] of ESPERADAS) {
    const l = filas.find(x => x.nombre === nombre)
    if (!l) { console.log(`✗ ${nombre}: no está en editor_lotes`); f++; continue }
    const h = await LO.huellasLote(l.lote), bien = h.lote === l.hash_lote && h.lote.startsWith(h0)
    if (!bien) f++
    console.log(`${bien ? '✓' : '✗'} huella de ${nombre}: ${h.lote.slice(0, 8)}…`)
  }
  process.exit(f ? 1 : 0)
})().catch(e => { console.log('✗', e.message || e); process.exit(1) })
