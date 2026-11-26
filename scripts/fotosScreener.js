// scripts/fotosScreener.js — las FOTOS SEMANALES del screener (public.screener_fotos, sql/screener_fotos.sql; docs/screener.md §29).
// Una foto por LUNES: el valor de cada filtro de cada empresa con lo que se sabía al cierre del viernes anterior
// (lib/screener/enFecha.js). Las usa la fuente «Vista del screener» del Replay.
//
//   node scripts/fotosScreener.js                 las que faltan, desde el primer lunes de 2011 hasta el de esta semana
//   node scripts/fotosScreener.js --todas         las rehace todas (tras cambiar una fórmula)
//   node scripts/fotosScreener.js --desde 2020-01-06 --hasta 2020-12-28   solo esas (las rehace)
//   node scripts/fotosScreener.js --ensayo        lo calcula todo y dice el tamaño, sin escribir
//   node scripts/fotosScreener.js --compara-hoy   comprueba la foto del último cierre: sus cifras de fundamentales, con el MISMO
//                                                 precio, frente a las de la pantalla (metricasDe con todas las cuentas). Solo pueden
//                                                 diferir las empresas con algún documento de la SEC posterior a ese cierre. No escribe.
//
// CÓMO (para no llenar la memoria): una empresa cada vez (sus cuentas, sus splits y sus velas de la caché), todas sus fechas; al
// final, la mediana del P/S de cada sector en cada fecha y la fuerza del sector (SPY y los ETF de sectores). Tarda unos minutos.
// Lee y escribe por la Management API local (conecta como postgres), como scripts/cargaScreener.js.
const { preparaEsm } = require('./guardian/cargaEsm')
const { consulta } = require('./universoNasdaq100')

const args = process.argv.slice(2)
const opcion = (n, def = null) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : def }
const ENSAYO = args.includes('--ensayo'), TODAS = args.includes('--todas'), COMPARA_HOY = args.includes('--compara-hoy')
const DESDE = opcion('--desde'), HASTA = opcion('--hasta')
const PRIMER_LUNES = '2011-01-03'
const lit = (s) => s == null ? 'NULL' : "'" + String(s).replace(/'/g, "''") + "'"
const DIA = 86400000
const masDias = (f, n) => new Date(Date.parse(f + 'T00:00:00Z') + n * DIA).toISOString().slice(0, 10)

// Los lunes entre a y b (incluidos), a partir del primer lunes >= a.
function lunes(a, b) {
  let d = new Date(Date.parse(a + 'T00:00:00Z'))
  while (d.getUTCDay() !== 1) d = new Date(d.getTime() + DIA)
  const out = []
  for (let f = d.toISOString().slice(0, 10); f <= b; f = masDias(f, 7)) out.push(f)
  return out
}

async function velasDe(simbolo, desde) {
  const r = await consulta(`BEGIN READ ONLY; SET LOCAL extra_float_digits = 1;
    SELECT json_agg(json_build_array(fecha::text, high, close, volumen) ORDER BY fecha) AS d FROM public.precios_diarios
    WHERE simbolo = ${lit(simbolo)} AND fecha >= ${lit(desde)}; ROLLBACK;`)
  const fila = Array.isArray(r) ? r.find(x => x && 'd' in x) : null
  return (fila?.d || []).map(([date, high, close, volume]) => ({ date, high, close, volume: volume ?? 0 }))
}

;(async () => {
  await preparaEsm()
  const F = require('../lib/screener/enFecha')
  const { medianasPorSector } = require('../lib/screener/metricas')
  const { fuerzaSector, tecnicoDe, REFERENCIAS_TECNICO, MERCADO } = require('../lib/screener/tecnico')
  const t0 = Date.now()

  // Fechas: el calendario de SPY da el cierre de cada lunes (el último día con mercado antes de él).
  const hoy = new Date().toISOString().slice(0, 10)
  const refs = {}
  for (const s of REFERENCIAS_TECNICO) refs[s] = await velasDe(s, '2005-01-01')
  const diasSpy = refs[MERCADO].map(v => v.date)
  if (!diasSpy.length) throw new Error('no hay velas de SPY en la caché')
  const cierreDe = (lun) => { let lo = 0, hi = diasSpy.length; while (lo < hi) { const m = (lo + hi) >> 1; if (diasSpy[m] < lun) lo = m + 1; else hi = m } return lo > 0 ? diasSpy[lo - 1] : null }
  let fechas = lunes(DESDE || PRIMER_LUNES, HASTA || hoy).filter(l => { const c = cierreDe(l); return c && c >= masDias(l, -10) })
  if (COMPARA_HOY) fechas = [fechas[fechas.length - 1]]
  else if (!TODAS && !DESDE && !HASTA) {
    const hechas = new Set((await consulta(`SELECT fecha::text AS f FROM public.screener_fotos;`)).map(x => x.f))
    fechas = fechas.filter(f => !hechas.has(f))
  }
  if (!fechas.length) { console.log('No falta ninguna foto.'); return }
  const cierres = fechas.map(cierreDe)
  console.log(`${fechas.length} fotos: del ${fechas[0]} al ${fechas[fechas.length - 1]}`)

  const empresas = await consulta(`SELECT e.simbolo, e.cik, e.nombre, e.sector, e.sector_fuente, e.en_sp500, e.en_ndx, e.en_listas, s.splits
    FROM public.screener_empresas e LEFT JOIN public.precios_splits s USING (simbolo) ORDER BY e.simbolo;`)
  const desdeVelas = F.inicioTecnico(cierres[0])
  // porFecha[i] = [{ s, sector, ps, vals }]: lo justo (la empresa entera de 830 fechas × 600 empresas no cabe en la memoria). vals
  // = los valores de la foto con el P/S del sector y la fuerza del sector aún vacíos (dependen de las demás empresas del día).
  const porFecha = fechas.map(() => [])
  const iPs = F.CAMPOS_FOTO.indexOf('psSector'), iSec = F.CAMPOS_FOTO.indexOf('sector')
  const { cifrasTecnicas } = require('../lib/screener/tecnico')
  const comp = { iguales: 0, conDocNuevo: 0, distintas: [] }
  const FUND = F.CAMPOS_FOTO.filter(c => require('../lib/screener/filtros').FILTRO[c].piso === 'F' && c !== 'psSector')
  const { metricasDe } = require('../lib/screener/metricas')
  let n = 0
  for (const emp of empresas) {
    const cuentas = emp.cik == null ? [] : await consulta(`SELECT concepto, periodo, fin::text AS fin, valor::text AS valor, unidad,
      presentado::text AS presentado, conocido_desde::text AS conocido_desde FROM public.screener_cuentas WHERE cik = ${Number(emp.cik)};`)
    const velas = await velasDe(emp.simbolo, desdeVelas)
    const pegs = await consulta(`SELECT fecha::text AS fecha, peg FROM public.screener_peg WHERE simbolo = ${lit(emp.simbolo)};`)
    for (let i = 0; i < fechas.length; i++) {
      const e = F.empresaEnFecha(emp, cuentas, emp.splits || [], velas, cierres[i], pegs)
      if (e.precio == null && !e.cuentasHasta) continue
      e.m.psSector = null; e.t = { ...cifrasTecnicas(e.tecnico), sector: null }
      porFecha[i].push({ s: e.simbolo, sector: e.sector, ps: e.m.ps, vals: F.valoresDe(e) })
      if (COMPARA_HOY) {
        const hoyM = metricasDe({ ...emp, precio: e.precio, precio_fecha: null, peg_esperado: e.m.pegEsp }, cuentas, emp.splits || [])
        const h = F.valoresDe({ ...e, m: { ...hoyM.m, psSector: null }, piezas: hoyM.piezas }), f = F.valoresDe(e)
        const dif = FUND.filter(c => { const k = F.CAMPOS_FOTO.indexOf(c); return JSON.stringify(h[k]) !== JSON.stringify(f[k]) })
        if (!dif.length) comp.iguales++
        else if (cuentas.some(c => (c.conocido_desde || c.presentado) > cierres[i])) comp.conDocNuevo++
        else comp.distintas.push(emp.simbolo + ': ' + dif.join(', '))
      }
    }
    if (++n % 50 === 0) console.log(`  ${n}/${empresas.length} empresas · ${Math.round((Date.now() - t0) / 1000)} s`)
  }

  // Mediana del sector, fuerza del sector, valores y escritura (de 10 en 10 fotos).
  let bytes = 0, escritas = 0
  const lote = []
  const escribe = async () => {
    if (!lote.length || ENSAYO) { lote.length = 0; return }
    await consulta(`INSERT INTO public.screener_fotos (fecha, cierre, campos, datos) VALUES ${lote.join(',\n')}
      ON CONFLICT (fecha) DO UPDATE SET cierre = EXCLUDED.cierre, campos = EXCLUDED.campos, datos = EXCLUDED.datos, hecha = now();`)
    escritas += lote.length; lote.length = 0
  }
  let ultima = null
  for (let i = 0; i < fechas.length; i++) {
    const lista = porFecha[i]
    // La mediana del P/S de cada sector entre las empresas del día (lo mismo que medianasPorSector).
    const med = medianasPorSector(lista.map(x => ({ sector: x.sector, m: { ps: x.ps } })))
    const tr = {}
    for (const s of REFERENCIAS_TECNICO) { const t = tecnicoDe(F.velasHasta(refs[s], cierres[i])); if (t) tr[s] = t }
    const datos = {}
    for (const x of lista) {
      const m = x.sector ? med[x.sector] : null
      x.vals[iPs] = x.ps != null && m > 0 ? F.redondea((x.ps / m - 1) * 100) : null
      x.vals[iSec] = F.redondea(fuerzaSector(x.sector, tr))
      datos[x.s] = x.vals
    }
    const foto = F.quitaCamposVacios({ campos: F.CAMPOS_FOTO, datos })
    const txt = JSON.stringify(foto.datos)
    bytes += txt.length
    lote.push(`(${lit(fechas[i])}, ${lit(cierres[i])}, ARRAY[${foto.campos.map(lit).join(', ')}]::text[], ${lit(txt)}::jsonb)`)
    if (lote.length >= 10) await escribe()
    porFecha[i] = null
    ultima = { fecha: fechas[i], cierre: cierres[i], foto }
  }
  await escribe()

  if (COMPARA_HOY) {
    console.log(`Foto del ${ultima.fecha} (cierre ${ultima.cierre}): ${comp.iguales} empresas con los fundamentales iguales a la pantalla; ${comp.conDocNuevo} distintas por un documento de la SEC posterior al cierre; ${comp.distintas.length} distintas SIN motivo${comp.distintas.length ? ':\n' + comp.distintas.join('\n') : '.'}`)
    process.exit(comp.distintas.length ? 1 : 0)
  }
  const tam = ENSAYO ? null : await consulta(`SELECT count(*) AS fotos, pg_size_pretty(pg_total_relation_size('public.screener_fotos')) AS tamano FROM public.screener_fotos;`)
  console.log(`Hecho en ${Math.round((Date.now() - t0) / 1000)} s: ${fechas.length} fotos (${Math.round(bytes / 1e6)} MB de texto)${ENSAYO ? ' · ENSAYO: no se ha escrito nada' : ` · escritas ${escritas} · en la base: ${JSON.stringify(tam[0])}`}`)
})().catch(e => { console.error('Las fotos del screener han fallado:', e.message); process.exit(1) })
