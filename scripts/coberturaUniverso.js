// scripts/coberturaUniverso.js — ¿cuántos miembros históricos del índice tienen precios en la caché? SOLO LECTURA.
//
//   node scripts/coberturaUniverso.js                         universo NDX, cada 1 de enero desde el primero del universo
//   opciones: --universo NDX · --copia backups/precios_simbolos_antes_….json (la copia de precios_simbolos de antes de la
//             descarga: con ella, las velas anómalas se miran solo en los símbolos NUEVOS; sin ella, en todos los del
//             universo) · --json fichero.json (vuelca el resultado)
//
// QUÉ MIDE, a cada 1 de enero (desde el primero en que el universo tiene miembros):
//   · miembros: los tramos de public.universo_miembros que cubren ese día (desde <= día < hasta).
//   · con precios: el símbolo de Yahoo del miembro tiene alguna vela entre el 1 y el 10 de enero de ese año, y el tramo no
//     está marcado como posible ticker reutilizado (abajo). Si no, es «sin precios», con el porqué (sin símbolo, Yahoo no
//     lo tiene —404—, el historial empieza después o termina antes, posible ticker reutilizado).
//   · los 20 más volátiles del año anterior: volatilidad = desviación típica de los rendimientos logarítmicos diarios del
//     cierre en el año natural anterior, anualizada (× √252), de los miembros con precios a ese 1 de enero con al menos 120
//     rendimientos ese año. Los miembros SIN precios no tienen volatilidad medible (justo es lo que falta), así que no se
//     pueden ordenar: el hueco entre los 20 más volátiles va de 0 (si los que faltan fueran tranquilos) a min(faltan, 20) / 20
//     (si todos estuvieran entre los más volátiles). Se da esa cota superior y el umbral de volatilidad del puesto 20.
//   · velas anómalas: el criterio de lib/cachePrecios.js (esAnomala, el mismo con el que guardar_velas cuenta
//     precios_simbolos.velas_anomalas): algún precio <= 0, low > high, u open o close fuera de [low, high]. Aparte (no es
//     una anomalía de la caché, solo un aviso) los saltos de cierre a cierre de más del 60 % en un día.
//
// TICKERS REUTILIZADOS. Yahoo da la historia del ticker de HOY: si otra empresa lo usa ahora, lo que devuelve es suyo. Por
// cada tramo de un miembro que YA SALIÓ del índice y tiene velas, se comprueba que los precios cubren su tramo:
//   · la primera vela no es posterior a su «desde» (con 10 días de margen y contando desde 2005-01-03, el inicio de la
//     descarga), salvo que la primera vela caiga en el mismo año que el «desde» (salió a bolsa ese año);
//   · la última vela no es anterior a su «hasta» (10 días de margen), salvo si salió por adquisición o quiebra (aviso);
//   · dentro del tramo: ningún salto de cierre a cierre de ×2 o ÷2 en un día, ni un hueco de más de 10 días naturales
//     entre dos velas (el cierre más largo de la bolsa en el periodo, tras el 11-S, fue de 6).
// Si la primera vela es posterior al «hasta», la primera vela es posterior al «desde» (sin salida a bolsa ese año), o hay
// salto o hueco, se marca POSIBLE TICKER REUTILIZADO y ese tramo cuenta como «sin precios» todos sus años. En los miembros
// que siguen en el índice, lo mismo es solo un aviso (historial que empieza tarde: otro instrumento, una reorganización).
// Cambios de ticker (los ALIAS de scripts/universoNasdaq100.js: FB → META…): no se guarda la fecha del cambio, así que se
// comprueba TODO el tramo de esa entidad, que la incluye: sin hueco ni salto.
//
// Lee por la Management API en transacciones de solo lectura (BEGIN READ ONLY … ROLLBACK). No escribe nada.
const fs = require('fs')
const path = require('path')
const { consulta, ALIAS } = require('./universoNasdaq100')
const NL = String.fromCharCode(10)

const args = process.argv.slice(2)
const opcion = (n, def = null) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : def }
const lee = (q) => consulta('BEGIN READ ONLY;' + NL + q + NL + 'ROLLBACK;')
const lit = (s) => s == null ? 'NULL' : "'" + String(s).replace(/'/g, "''") + "'"
const arr = (xs) => `ARRAY[${xs.map(lit).join(',')}]::text[]`
const MIN_RENDIMIENTOS = 120, TOP = 20, MARGEN_DIAS = 10, SALTO = 0.6
const SALTO_TRAMO = 2, HUECO_TRAMO = 10, INICIO_DESCARGA = '2005-01-03'

const masDias = (f, d) => new Date(Date.parse(f + 'T00:00:00Z') + d * 86400000).toISOString().slice(0, 10)
const cubre = (t, dia) => t.desde <= dia && (t.hasta == null || dia < t.hasta)
const claveTramo = (t) => `${t.simbolo}|${t.nombre}|${t.desde}`
const salidaSinCotizar = (t) => /^(adquisición|quiebra)/.test(t.motivo_salida || '')

// Revisión de un tramo. ps: su fila de precios_simbolos; est: { salto: {fecha, ratio}, hueco: {fecha, dias} } dentro del tramo.
// Devuelve { reutilizado, motivos: [...] (por qué se marca), avisos: [...] }.
function revisaTramo(t, p, est) {
  const r = { reutilizado: false, motivos: [], avisos: [] }
  if (!t.simbolo_yahoo || !p || !p.velas) return r
  const salio = t.hasta != null
  const marca = (m) => { if (salio) { r.reutilizado = true; r.motivos.push(m) } else r.avisos.push(m) }
  const ref = t.desde > INICIO_DESCARGA ? t.desde : INICIO_DESCARGA
  if (salio && p.primera >= t.hasta) marca(`Yahoo empieza el ${p.primera}, después de su salida`)
  else if (p.primera > masDias(ref, MARGEN_DIAS) && p.primera.slice(0, 4) !== t.desde.slice(0, 4))
    marca(`Yahoo empieza el ${p.primera}, después de entrar (${t.desde}) y sin salir a bolsa ese año`)
  if (salio && p.ultima < masDias(t.hasta, -MARGEN_DIAS) && p.primera < t.hasta)
    r.avisos.push(`Yahoo termina el ${p.ultima}, antes de su salida (${t.hasta})${salidaSinCotizar(t) ? '; salió por adquisición o quiebra' : ''}`)
  if (est?.salto && (est.salto.ratio >= SALTO_TRAMO || est.salto.ratio <= 1 / SALTO_TRAMO))
    marca(`salto de ${est.salto.ratio >= 1 ? '×' + est.salto.ratio.toFixed(2) : '÷' + (1 / est.salto.ratio).toFixed(2)} el ${est.salto.fecha}`)
  if (est?.hueco && est.hueco.dias > HUECO_TRAMO) marca(`hueco de ${est.hueco.dias} días sin velas hasta el ${est.hueco.fecha}`)
  return r
}

// Por qué un miembro no tiene precios a un 1 de enero.
function porQueSinPrecios(t, p, anio, rev) {
  if (!t.simbolo_yahoo) return 'sin símbolo de Yahoo'
  if (rev?.reutilizado) return 'POSIBLE TICKER REUTILIZADO: ' + rev.motivos.join('; ')
  if (!p) return 'no descargado'
  if (!p.velas) return 'Yahoo no lo tiene (404)'
  if (p.primera > `${anio}-01-${MARGEN_DIAS}`) return `historial de Yahoo desde ${p.primera}`
  if (p.ultima < `${anio}-01-01`) return `historial de Yahoo hasta ${p.ultima}`
  return 'sin velas a primeros de enero'
}

// Cobertura de un 1 de enero. tramos: filas del universo; ps: precios_simbolos por símbolo; anual: {símbolo: {año: {primera,
// n, vol}}}; revisiones: {claveTramo: revisaTramo(...)}.
function coberturaAnio(tramos, ps, anual, anio, revisiones = {}) {
  const dia = `${anio}-01-01`
  const miembros = tramos.filter(t => cubre(t, dia))
  const con = [], sin = []
  for (const t of miembros) {
    const a = t.simbolo_yahoo && anual[t.simbolo_yahoo]?.[anio]
    const rev = revisiones[claveTramo(t)]
    if (a && a.primera <= `${anio}-01-${MARGEN_DIAS}` && !rev?.reutilizado) con.push({ ...t, aviso: !!rev?.avisos.length })
    else sin.push({ ...t, porque: porQueSinPrecios(t, ps[t.simbolo_yahoo], anio, rev) })
  }
  // Los más volátiles del año anterior, entre los miembros con precios.
  const medibles = con.map(t => ({ t, a: anual[t.simbolo_yahoo]?.[anio - 1] })).filter(x => x.a && x.a.n >= MIN_RENDIMIENTOS && x.a.vol != null)
    .sort((x, y) => y.a.vol - x.a.vol)
  const top = medibles.slice(0, TOP)
  return {
    anio, miembros: miembros.length, con: con.length, sin: sin.length, pctSin: miembros.length ? sin.length / miembros.length : 0,
    faltan: sin.map(t => ({ simbolo: t.simbolo, simbolo_yahoo: t.simbolo_yahoo, nombre: t.nombre, motivo_salida: t.motivo_salida, hasta: t.hasta, porque: t.porque })),
    conAviso: con.filter(t => t.aviso).map(t => t.simbolo),
    volatiles: { medibles: medibles.length, top: top.map(x => ({ simbolo: x.t.simbolo, vol: x.a.vol })), umbral: top.length === TOP ? top[TOP - 1].a.vol : null,
      cotaSuperior: Math.min(sin.length, TOP) / TOP },
  }
}

module.exports = { coberturaAnio, porQueSinPrecios, revisaTramo, claveTramo, cubre, MIN_RENDIMIENTOS, TOP, MARGEN_DIAS, SALTO_TRAMO, HUECO_TRAMO }

if (require.main === module) (async () => {
  const UNIVERSO = opcion('--universo', 'NDX')
  const t0 = Date.now()
  const tramos = (await lee(`SELECT simbolo, simbolo_yahoo, nombre, desde::text, hasta::text, motivo_salida FROM public.universo_miembros
    WHERE indice = ${lit(UNIVERSO)} ORDER BY desde, simbolo;`))
  if (!tramos.length) { console.error(`El universo «${UNIVERSO}» no existe.`); process.exit(1) }
  const simbolos = [...new Set(tramos.map(t => t.simbolo_yahoo).filter(Boolean))].sort()
  const filasPs = await lee(`SELECT simbolo, primera_fecha::text AS primera, ultima_fecha::text AS ultima, velas, velas_anomalas, motivo_recarga
    FROM public.precios_simbolos WHERE simbolo = ANY(${arr(simbolos)});`)
  const ps = Object.fromEntries(filasPs.map(p => [p.simbolo, p]))
  const primerDia = tramos.reduce((m, t) => t.desde < m ? t.desde : m, '9999')
  const anio0 = Number(primerDia.slice(0, 4)) + (primerDia.slice(5) === '01-01' ? 0 : 1)
  const desdeVelas = `${anio0 - 1}-01-01`
  const filasAnual = await lee(`SET LOCAL statement_timeout = '180s';
    WITH r AS (SELECT simbolo, fecha, close, lag(close) OVER (PARTITION BY simbolo ORDER BY fecha) AS prev
      FROM public.precios_diarios WHERE simbolo = ANY(${arr(simbolos)}) AND fecha >= ${lit(desdeVelas)})
    SELECT simbolo, extract(year FROM fecha)::int AS anio, min(fecha)::text AS primera,
      count(*) FILTER (WHERE prev > 0 AND close > 0)::int AS n,
      stddev_samp(ln(close / prev)) FILTER (WHERE prev > 0 AND close > 0) * sqrt(252) AS vol
    FROM r GROUP BY 1, 2;`)
  const anual = {}
  for (const f of filasAnual) (anual[f.simbolo] ||= {})[f.anio] = { primera: f.primera, n: f.n, vol: f.vol == null ? null : Number(f.vol) }

  // Mayor salto y mayor hueco DENTRO de cada tramo con velas (pares de velas consecutivas, las dos dentro del tramo).
  const conDatos = tramos.filter(t => t.simbolo_yahoo && ps[t.simbolo_yahoo]?.velas > 0)
  const valores = conDatos.map((t, i) => `(${i}, ${lit(t.simbolo_yahoo)}, ${lit(t.desde)}::date, ${lit(t.hasta)}::date)`).join(',\n      ')
  const filasTramo = conDatos.length ? await lee(`SET LOCAL statement_timeout = '180s';
    WITH t(id, s, d, h) AS (VALUES ${valores}),
    r AS (SELECT simbolo, fecha, close, lag(close) OVER w AS prev, lag(fecha) OVER w AS fprev FROM public.precios_diarios
      WHERE simbolo = ANY(${arr([...new Set(conDatos.map(t => t.simbolo_yahoo))])}) WINDOW w AS (PARTITION BY simbolo ORDER BY fecha)),
    x AS (SELECT t.id, r.fecha, r.close / r.prev AS ratio, abs(ln(r.close / r.prev)) AS mag, r.fecha - r.fprev AS dias
      FROM t JOIN r ON r.simbolo = t.s AND r.fprev >= t.d AND (t.h IS NULL OR r.fecha < t.h) WHERE r.prev > 0 AND r.close > 0)
    SELECT id, (array_agg(fecha::text ORDER BY mag DESC))[1] AS fsalto, (array_agg(ratio ORDER BY mag DESC))[1] AS ratio,
      max(dias)::int AS dias, (array_agg(fecha::text ORDER BY dias DESC))[1] AS fhueco
    FROM x GROUP BY id;`) : []
  const est = {}
  for (const f of filasTramo) est[f.id] = { salto: { fecha: f.fsalto, ratio: Number(f.ratio) }, hueco: { fecha: f.fhueco, dias: f.dias } }
  const revisiones = {}
  conDatos.forEach((t, i) => { revisiones[claveTramo(t)] = { t, est: est[i], ...revisaTramo(t, ps[t.simbolo_yahoo], est[i]) } })

  const hoy = new Date().toISOString().slice(0, 10)
  const anios = []
  for (let y = anio0; `${y}-01-01` <= hoy; y++) anios.push(coberturaAnio(tramos, ps, anual, y, revisiones))

  // Símbolos nuevos (no estaban en la copia de antes de la descarga), para las velas anómalas.
  const COPIA = opcion('--copia')
  let nuevos = simbolos
  if (COPIA) {
    const antes = new Set(JSON.parse(fs.readFileSync(path.resolve(COPIA), 'utf8')).precios_simbolos.map(p => p.simbolo))
    nuevos = simbolos.filter(s => !antes.has(s))
  }
  const conVelas = nuevos.filter(s => ps[s]?.velas > 0)
  const anomalas = conVelas.length ? await lee(`SELECT simbolo, fecha::text, open, high, low, close FROM public.precios_diarios
    WHERE simbolo = ANY(${arr(conVelas)}) AND (NOT (open > 0 AND high > 0 AND low > 0 AND close > 0) OR low > high
      OR open < low OR open > high OR close < low OR close > high) ORDER BY simbolo, fecha LIMIT 5000;`) : []
  const saltos = conVelas.length ? await lee(`SET LOCAL statement_timeout = '180s';
    WITH r AS (SELECT simbolo, fecha, close, lag(close) OVER (PARTITION BY simbolo ORDER BY fecha) AS prev
      FROM public.precios_diarios WHERE simbolo = ANY(${arr(conVelas)}))
    SELECT simbolo, fecha::text, prev, close FROM r WHERE prev > 0 AND close > 0 AND abs(ln(close / prev)) > ln(${1 + SALTO})
    ORDER BY simbolo, fecha LIMIT 5000;`) : []

  // ── Informe ──
  const pct = (x) => (100 * x).toFixed(1).padStart(5) + ' %'
  const tramoTxt = (t) => `${t.desde} → ${t.hasta || 'hoy'}`
  console.log(`COBERTURA DEL UNIVERSO ${UNIVERSO} (${tramos.length} tramos, ${simbolos.length} símbolos de Yahoo; ${filasPs.length} en la caché, `
    + `${filasPs.filter(p => !p.velas).length} de ellos sin datos en Yahoo)`)
  console.log('«Con precios» = alguna vela entre el 1 y el 10 de enero y el tramo no marcado como posible ticker reutilizado.')
  console.log(`Volatilidad del año anterior: desviación típica anualizada de los rendimientos logarítmicos diarios, con >= ${MIN_RENDIMIENTOS}`)
  console.log(`rendimientos. Hueco en los ${TOP} más volátiles: cota superior = min(faltan, ${TOP}) / ${TOP} (los que faltan no se pueden medir).`)
  console.log('')
  console.log('1 ene   miembros  con   sin   % sin    ordenables  vol. puesto 20  hueco top 20 (máx.)  con aviso')
  for (const a of anios) {
    console.log(`${a.anio}   ${String(a.miembros).padStart(8)}  ${String(a.con).padStart(3)}  ${String(a.sin).padStart(4)}  ${pct(a.pctSin)}  `
      + `${String(a.volatiles.medibles).padStart(10)}  ${a.volatiles.umbral == null ? '         —' : (100 * a.volatiles.umbral).toFixed(0).padStart(10) + ' %'}  `
      + `${pct(a.volatiles.cotaSuperior).padStart(19)}  ${a.conAviso.length ? a.conAviso.join(' ') : '—'}`)
  }
  console.log('')
  console.log('MIEMBROS SIN PRECIOS, por 1 de enero (nombre · símbolo · por qué · salida del índice)')
  for (const a of anios) {
    if (!a.faltan.length) { console.log(`${a.anio}: ninguno`); continue }
    console.log(`${a.anio}:`)
    for (const f of a.faltan) console.log(`   ${f.nombre} (${f.simbolo}${f.simbolo_yahoo && f.simbolo_yahoo !== f.simbolo ? ` → ${f.simbolo_yahoo}` : ''}) · ${f.porque}`
      + ` · ${f.hasta ? `sale ${f.hasta}: ${String(f.motivo_salida || 'sin motivo').slice(0, 110)}` : 'sigue en el índice'}`)
  }
  const revs = Object.values(revisiones)
  const marcados = revs.filter(r => r.reutilizado)
  console.log('')
  console.log(`POSIBLES TICKERS REUTILIZADOS (${marcados.length} de ${revs.filter(r => r.t.hasta).length} tramos de miembros que ya salieron y tienen velas;`
    + ' no cuentan como «con precios»)')
  for (const r of marcados) console.log(`   ${r.t.nombre} (${r.t.simbolo_yahoo}) · tramo ${tramoTxt(r.t)} · Yahoo ${ps[r.t.simbolo_yahoo].primera} → ${ps[r.t.simbolo_yahoo].ultima} · ${r.motivos.join('; ')}`)
  const avisados = revs.filter(r => r.avisos.length)
  console.log(`AVISOS (no cambian el recuento): ${avisados.length}`)
  for (const r of avisados) console.log(`   ${r.t.nombre} (${r.t.simbolo_yahoo}) · tramo ${tramoTxt(r.t)} · ${r.avisos.join('; ')}`)
  console.log('')
  console.log('CAMBIOS DE TICKER (se revisa todo el tramo, que incluye la fecha del cambio)')
  for (const [viejo, nuevo] of Object.entries(ALIAS)) {
    const ts = revs.filter(r => r.t.simbolo === nuevo)
    if (!ts.length) { console.log(`   ${viejo} → ${nuevo} · sin velas en la caché (${tramos.filter(t => t.simbolo === nuevo).map(t => `${t.nombre}: ${t.simbolo_yahoo ? 'Yahoo sin datos' : 'sin símbolo de Yahoo'}`).join(', ') || 'no es miembro'})`); continue }
    for (const r of ts) {
      const e = r.est
      const res = r.reutilizado || r.avisos.some(a => /salto|hueco/.test(a)) ? '✗ ' + [...r.motivos, ...r.avisos].join('; ') : '✓ sin hueco ni salto'
      console.log(`   ${viejo} → ${nuevo} (${r.t.nombre}, Yahoo ${r.t.simbolo_yahoo}) · tramo ${tramoTxt(r.t)} · mayor salto ${e ? `${((e.salto.ratio - 1) * 100).toFixed(0)} % el ${e.salto.fecha}` : '—'}`
        + ` · mayor hueco ${e ? `${e.hueco.dias} días` : '—'} · ${res}`)
    }
  }
  console.log('')
  console.log(`VELAS ANÓMALAS (criterio esAnomala) en ${conVelas.length} símbolos${COPIA ? ' nuevos' : ''} con velas: ${anomalas.length}`
    + (anomalas.length ? ` en ${new Set(anomalas.map(a => a.simbolo)).size} símbolos` : ''))
  const porSimbolo = (filas) => { const m = {}; for (const f of filas) (m[f.simbolo] ||= []).push(f); return m }
  for (const [s, fs_] of Object.entries(porSimbolo(anomalas)))
    console.log(`   ${s.padEnd(8)} ${fs_.length} · ${fs_.slice(0, 4).map(f => `${f.fecha} (o ${f.open} h ${f.high} l ${f.low} c ${f.close})`).join(', ')}${fs_.length > 4 ? ', …' : ''}`)
  console.log(`Aviso aparte: saltos de cierre a cierre de más del ${SALTO * 100} % en un día: ${saltos.length}`
    + (saltos.length ? ` en ${new Set(saltos.map(a => a.simbolo)).size} símbolos` : ''))
  for (const [s, fs_] of Object.entries(porSimbolo(saltos)))
    console.log(`   ${s.padEnd(8)} ${fs_.length} · ${fs_.slice(0, 4).map(f => `${f.fecha} ${Number(f.prev).toFixed(2)} → ${Number(f.close).toFixed(2)}`).join(', ')}${fs_.length > 4 ? ', …' : ''}`)
  console.log(`\n(${((Date.now() - t0) / 1000).toFixed(1)} s)`)
  const JSON_ = opcion('--json')
  if (JSON_) fs.writeFileSync(JSON_, JSON.stringify({ universo: UNIVERSO, anios, revisiones: revs, anomalas, saltos }, null, 1))
})().catch(e => { console.error('FALLO', e.message); process.exit(1) })
