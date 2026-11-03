// scripts/comprobaciones/huellas.js — las huellas de las pruebas congeladas del editor (PRUEBA_EDITOR_1, RETROCESOS_1 y
// PRUEBA_BUILDER_1 · 2026-10-22), recalculadas con el código del árbol de trabajo (lib/editor/lotes.js, huellasLote) frente a la
// guardada. §59 (docs/builder.md): las filas de editor_lotes se borraron; estas tres quedan aquí como referencia fija en
// lotes-congelados.json, tal como estaban en la base, sin leer nada de ella.
const C0 = require('./cargador')
const ESPERADAS = [['PRUEBA_EDITOR_1', 'a2cdfd85'], ['RETROCESOS_1', '23c5006c'], ['PRUEBA_BUILDER_1 · 2026-10-22', '0d6726ec']]
;(async () => {
  await C0.prepara(); C0.registra(C0.RAIZ)
  const LO = require(C0.RAIZ + '/lib/editor/lotes.js')
  const filas = require('./lotes-congelados.json')
  let f = 0
  for (const [nombre, h0] of ESPERADAS) {
    const l = filas.find(x => x.nombre === nombre)
    if (!l) { console.log(`✗ ${nombre}: no está en lotes-congelados.json`); f++; continue }
    const h = await LO.huellasLote(l.lote), bien = h.lote === l.hash_lote && h.lote.startsWith(h0)
    if (!bien) f++
    console.log(`${bien ? '✓' : '✗'} huella de ${nombre}: ${h.lote.slice(0, 8)}…`)
  }
  process.exit(f ? 1 : 0)
})().catch(e => { console.log('✗', e.message || e); process.exit(1) })
