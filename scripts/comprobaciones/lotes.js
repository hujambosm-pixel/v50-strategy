// scripts/comprobaciones/lotes.js — las huellas de los lotes congelados LOTE_1–3 y CARTERA_1–3, recalculadas con el código del
// árbol de trabajo (y, si se da VIEJO, también con la versión anterior), frente a las guardadas en lib/lotesLab.js (HUELLAS_LOTES).
const path = require('path')
const C0 = require('./cargador')
;(async () => {
  await C0.prepara()
  let distintas = 0
  for (const raiz of [...(process.env.VIEJO ? [path.resolve(process.env.VIEJO)] : []), C0.RAIZ]) {
    C0.registra(raiz); const L = require(raiz + '/lib/lotesLab.js')
    for (const [id, h] of Object.entries(L.HUELLAS_LOTES)) {
      const x = await L.huella(L.LOTES[id]); if (x !== h) distintas++
      console.log(raiz === C0.RAIZ ? 'ahora' : 'antes', id, x === h ? 'igual' : 'DISTINTA', String(x).slice(0, 16), h.slice(0, 16))
    }
  }
  process.exit(distintas ? 1 : 0)
})().catch(e => { console.error('FALLO', e); process.exit(2) })
