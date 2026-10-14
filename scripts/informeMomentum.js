// scripts/informeMomentum.js — informe breve de la regla «momentum» del screener (lib/screener.js), frente a la de
// volatilidad. SOLO LECTURA (Management API, BEGIN READ ONLY … ROLLBACK).
//
//   node scripts/informeMomentum.js            universo NDX, años 2016–2026, N = 20 en detalle (10 y 30 de contraste)
//   opciones: --universo NDX · --desde 2016 · --hasta 2026 · --n 20
//
// Por año (N del detalle): los seleccionados con su momentum, cuántos coinciden con los N de volatilidad ese año y los
// elegibles no medibles (con el porqué). Para N = 10, 20 y 30: símbolos distintos en 2016–2020, 2021–2025 y 2016–2025.
const { consulta } = require('./universoNasdaq100')
const { leeCierres } = require('./coberturaUniverso')
const { preparaEsm } = require('./guardian/cargaEsm')
const NL = String.fromCharCode(10)

const args = process.argv.slice(2)
const opcion = (n, def = null) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : def }
const lee = (q) => consulta('BEGIN READ ONLY;' + NL + 'SET LOCAL extra_float_digits = 1;' + NL + q + NL + 'ROLLBACK;')
const lit = (s) => s == null ? 'NULL' : "'" + String(s).replace(/'/g, "''") + "'"

;(async () => {
  const UNIVERSO = opcion('--universo', 'NDX')
  const DESDE = Number(opcion('--desde', 2016)), HASTA = Number(opcion('--hasta', 2026)), N = Number(opcion('--n', 20))
  await preparaEsm()
  const { seleccion, seleccionMomentum } = require('../lib/screener')
  const miembros = await lee(`SELECT simbolo, simbolo_yahoo, nombre, desde::text, hasta::text, motivo_salida, excluido_motivo
    FROM public.universo_miembros WHERE indice = ${lit(UNIVERSO)} ORDER BY desde, simbolo;`)
  const simbolos = [...new Set(miembros.map(t => t.simbolo_yahoo).filter(Boolean))].sort()
  const velas = await leeCierres(lee, simbolos, `${DESDE - 2}-01-01`)
  const anios = []; for (let y = DESDE; y <= HASTA; y++) anios.push(y)
  const pct = (x) => x == null ? '—' : `${x >= 0 ? '+' : ''}${(100 * x).toFixed(0)} %`

  console.log(`SCREENER POR MOMENTUM · universo ${UNIVERSO} · ${DESDE}–${HASTA}`)
  console.log('Regla: momentum del año Y = cierre del último día de bolsa antes del 1-1-Y / el del último antes del 1-1-(Y−1) − 1;')
  console.log('medible con >= 120 rendimientos en Y−1 y vela en los dos días; cada 1 de enero, los N con mayor momentum; empate por')
  console.log('símbolo; solo velas anteriores al 1 de enero.')
  console.log('')
  console.log(`N = ${N}`)
  console.log('1 ene  días de bolsa            elegibles  no medibles  corte   coinciden con volatilidad  seleccionados (momentum)')
  const sel = {}
  for (const n of [10, 20, 30]) { sel[n] = {}; for (const y of anios) sel[n][y] = { m: seleccionMomentum(y, n, miembros, velas), v: seleccion(y, n, miembros, velas) } }
  for (const y of anios) {
    const { m, v } = sel[N][y]
    const vs = new Set(v.seleccionados.map(x => x.simbolo))
    const comunes = m.seleccionados.filter(x => vs.has(x.simbolo)).length
    console.log(`${y}   ${m.diaIni} → ${m.diaFin}   ${String(m.elegibles).padStart(9)}  ${String(m.sinMedida.length).padStart(11)}  ${pct(m.corte).padStart(6)}  `
      + `${`${comunes}/${m.seleccionados.length}`.padStart(25)}  ${m.seleccionados.map(x => `${x.simbolo} ${pct(x.momentum)}`).join(' · ')}`)
  }
  console.log('')
  console.log('Elegibles no medibles por momentum (motivo):')
  for (const y of anios) {
    const s = sel[N][y].m.sinMedida
    console.log(`   ${y} (${s.length}): ${s.length ? s.map(x => x.motivo === 'sin velas' ? x.simbolo : `${x.simbolo} [${x.motivo}]`).join(', ') : '—'}`)
  }
  console.log('')
  const bloques = [[2016, 2020], [2021, 2025], [2016, 2025]]
  const distintos = (n, r, a, b) => new Set(anios.filter(y => y >= a && y <= b).flatMap(y => sel[n][y][r].seleccionados.map(x => x.simbolo))).size
  console.log('Símbolos distintos            ' + bloques.map(([a, b]) => `${a}–${b}`.padEnd(11)).join(''))
  for (const n of [10, 20, 30]) for (const [r, nombre] of [['m', 'momentum'], ['v', 'volatilidad']])
    console.log(`   N = ${String(n).padEnd(2)} ${nombre.padEnd(12)}      ${bloques.map(([a, b]) => String(distintos(n, r, a, b)).padEnd(11)).join('')}`)
})().catch(e => { console.error('FALLO', e.message); process.exit(1) })
