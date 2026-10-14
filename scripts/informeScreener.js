// scripts/informeScreener.js — qué seleccionaría el screener por volatilidad (lib/screener.js) en el universo histórico.
// SOLO LECTURA.
//
//   node scripts/informeScreener.js                    universo NDX, N = 10, 20 y 30, años 2016 a 2026
//   opciones: --universo NDX · --n 10,20,30 · --desde 2016 · --hasta 2026 · --mascara 20 (el N cuya máscara se imprime)
//             · --json fichero.json (vuelca selecciones y máscaras)
//
// QUÉ DA, por cada N:
//   · por año (1 de enero): los seleccionados con su volatilidad del año anterior, el corte (la del último), los
//     elegibles sin volatilidad medible (sin velas o con menos de 120 rendimientos) y cuántos repiten del año anterior;
//     aparte, los seleccionados sin ninguna vela en los 10 primeros días del año (no se podrían comprar);
//   · símbolos DISTINTOS que aparecen alguna vez en 2016–2020, 2021–2025 y 2016–2025 (lo que tendría que cargar el
//     multibacktest);
//   · coincidencia con la lista «V50» de la watchlist: cuáles de sus activos salen y en qué años.
// Y la máscara de entradas del N de --mascara, en formato compacto.
//
// Lee por la Management API en transacciones de solo lectura (BEGIN READ ONLY … ROLLBACK), como coberturaUniverso.js.
const fs = require('fs')
const { consulta } = require('./universoNasdaq100')
const { leeCierres } = require('./coberturaUniverso')
const { preparaEsm } = require('./guardian/cargaEsm')
const NL = String.fromCharCode(10)

const args = process.argv.slice(2)
const opcion = (n, def = null) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : def }
const lee = (q) => consulta('BEGIN READ ONLY;' + NL + q + NL + 'ROLLBACK;')
const lit = (s) => s == null ? 'NULL' : "'" + String(s).replace(/'/g, "''") + "'"
const LISTA = 'V50', MARGEN_DIAS = 10
const BLOQUES = [[2016, 2020], [2021, 2025], [2016, 2025]]

;(async () => {
  const UNIVERSO = opcion('--universo', 'NDX')
  const NS = opcion('--n', '10,20,30').split(',').map(Number)
  const DESDE = Number(opcion('--desde', 2016)), HASTA = Number(opcion('--hasta', 2026))
  const N_MASCARA = Number(opcion('--mascara', 20))
  const t0 = Date.now()
  await preparaEsm()
  const { seleccion, mascaraUniverso, MIN_RENDIMIENTOS } = require('../lib/screener')

  const miembros = await lee(`SELECT simbolo, simbolo_yahoo, nombre, desde::text, hasta::text, motivo_salida, excluido_motivo
    FROM public.universo_miembros WHERE indice = ${lit(UNIVERSO)} ORDER BY desde, simbolo;`)
  if (!miembros.length) { console.error(`El universo «${UNIVERSO}» no existe.`); process.exit(1) }
  const simbolos = [...new Set(miembros.map(t => t.simbolo_yahoo).filter(Boolean))].sort()
  // Desde dos años antes: el primer rendimiento del año DESDE−1 necesita el último cierre del anterior.
  const velas = await leeCierres(lee, simbolos, `${DESDE - 2}-01-01`)
  const lista = (await lee(`SELECT w.symbol FROM public.watchlist_lists l JOIN public.watchlist_list_members m ON m.list_id = l.id
    JOIN public.watchlist w ON w.id = m.watchlist_id WHERE l.name = ${lit(LISTA)} ORDER BY w.symbol;`)).map(f => f.symbol)

  const anios = []; for (let y = DESDE; y <= HASTA; y++) anios.push(y)
  const pct = (x) => x == null ? '—' : (100 * x).toFixed(0) + ' %'
  const tieneEnero = (s, y) => (velas[s] || []).some(v => v.date >= `${y}-01-01` && v.date <= `${y}-01-${MARGEN_DIAS}`)
  const resultado = {}

  console.log(`SCREENER POR VOLATILIDAD · universo ${UNIVERSO} (${miembros.length} tramos, ${simbolos.length} símbolos de Yahoo, `
    + `${Object.keys(velas).length} con velas desde ${DESDE - 2}) · años ${DESDE}–${HASTA} · N = ${NS.join(', ')}`)
  console.log(`Regla: el 1 de enero, entre los miembros del índice sin excluir y con símbolo de Yahoo, los N con mayor volatilidad`)
  console.log(`del año anterior (desv. típica de los rendimientos log. diarios × √252, >= ${MIN_RENDIMIENTOS} rendimientos), solo con velas`)
  console.log(`anteriores a ese día. Empates por símbolo. Lista ${LISTA} (${lista.length}): ${lista.join(' ')}`)

  for (const N of NS) {
    const sel = {}
    for (const y of anios) sel[y] = seleccion(y, N, miembros, velas)
    const mascara = mascaraUniverso(DESDE, HASTA, N, miembros, velas, sel)
    resultado[N] = { selecciones: sel, mascara }
    console.log('')
    console.log('═'.repeat(118))
    console.log(`N = ${N}`)
    console.log('═'.repeat(118))
    console.log('1 ene  elegibles  sin vol.  corte  repiten  seleccionados (volatilidad del año anterior)')
    let previo = null
    for (const y of anios) {
      const s = sel[y], actuales = s.seleccionados.map(x => x.simbolo)
      const repiten = previo ? actuales.filter(x => previo.includes(x)).length : null
      console.log(`${y}   ${String(s.elegibles).padStart(9)}  ${String(s.sinVolatilidad.length).padStart(8)}  ${pct(s.corte).padStart(5)}  `
        + `${(repiten == null ? '—' : `${repiten}/${actuales.length}`).padStart(7)}  ${s.seleccionados.map(x => `${x.simbolo} ${pct(x.vol)}`).join(' · ')}`)
      previo = actuales
    }
    console.log('Elegibles sin volatilidad medible:')
    for (const y of anios) {
      const sv = sel[y].sinVolatilidad
      console.log(`   ${y} (${sv.length}): ${sv.length ? sv.map(x => x.motivo === 'sin velas' ? x.simbolo : `${x.simbolo} [${x.motivo}]`).join(', ') : '—'}`)
    }
    const sinEnero = anios.flatMap(y => sel[y].seleccionados.filter(x => !tieneEnero(x.simbolo, y)).map(x => `${x.simbolo} ${y}`))
    console.log(`Seleccionados sin vela entre el 1 y el ${MARGEN_DIAS} de enero (no se podrían comprar ese día): ${sinEnero.length ? sinEnero.join(', ') : 'ninguno'}`)
    const distintos = (a, b) => new Set(anios.filter(y => y >= a && y <= b).flatMap(y => sel[y].seleccionados.map(x => x.simbolo)))
    console.log('Símbolos distintos: ' + [...BLOQUES, [DESDE, HASTA]].map(([a, b]) => `${a}–${b}: ${distintos(a, b).size}`).join(' · '))
    const coincide = lista.map(s => ({ s, ys: anios.filter(y => sel[y].seleccionados.some(x => x.simbolo === s)) }))
    const miembroAlguna = new Set(miembros.map(t => t.simbolo_yahoo))
    console.log(`Coincidencia con la lista ${LISTA}: ` + (coincide.filter(c => c.ys.length).map(c => `${c.s} (${c.ys.join(', ')})`).join(' · ') || 'ninguno'))
    const fuera = coincide.filter(c => !c.ys.length)
    console.log(`   no seleccionados: ${fuera.filter(c => miembroAlguna.has(c.s)).map(c => c.s).join(' ') || '—'} · `
      + `nunca miembros del índice: ${fuera.filter(c => !miembroAlguna.has(c.s)).map(c => c.s).join(' ') || '—'}`)
  }

  const mk = resultado[N_MASCARA]?.mascara
  if (mk) {
    console.log('')
    console.log(`MÁSCARA DE ENTRADAS, N = ${N_MASCARA} (${Object.keys(mk).length} símbolos; [desde, hasta), años como «AA», mes y día solo si no es 1 de enero)`)
    const corta = (f) => f.slice(5) === '01-01' ? f.slice(2, 4) : f.slice(2)
    for (const s of Object.keys(mk).sort()) console.log(`   ${s.padEnd(6)} ${mk[s].map(([d, h]) => `${corta(d)}→${corta(h)}`).join(' ')}`)
  }
  console.log(`\n(${((Date.now() - t0) / 1000).toFixed(1)} s)`)
  const JSON_ = opcion('--json')
  if (JSON_) fs.writeFileSync(JSON_, JSON.stringify({ universo: UNIVERSO, lista, resultado: Object.fromEntries(Object.entries(resultado).map(([N, r]) => [N, {
    selecciones: Object.fromEntries(Object.entries(r.selecciones).map(([y, s]) => [y, { ...s, seleccionados: s.seleccionados.map(({ simbolo, vol }) => ({ simbolo, vol })) }])),
    mascara: r.mascara }])) }, null, 1))
})().catch(e => { console.error('FALLO', e.message); process.exit(1) })
