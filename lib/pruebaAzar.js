// lib/pruebaAzar.js — el paso 2 del Builder, «Probarla contra el azar», con el azar re-simulado de lib/azarReglas.js (docs/builder.md,
// §44). Sin pantalla (la pantalla es components/BuilderAzar.js). La regla es REGLA_AZAR_REGLAS, sin cambiar nada.
//
// REGISTRO CONGELADO (sql/pruebas_azar.sql). Al confirmar se guarda la FOTO exacta de la estrategia (fotoDe: id, name, definition,
// params) con su huella (sha256 del JSON canónico), el valor, las velas, los periodos, la regla y una semilla entera nueva. Las tablas
// son de solo añadir: una prueba confirmada no se cambia ni se borra, y tiene como mucho un resultado.
//
//   ejecutarPrueba(prueba, precios, alProgresar)   usa SOLO lo guardado en `prueba` (la foto, la semilla, el valor, las velas y la
//                                     regla), nunca la estrategia de ahora: repetirla con los mismos precios da exactamente lo mismo.
//                                     precios: { símbolo: velas DIARIAS } (el valor y los índices del filtro de mercado de la regla).
//                                     Etapas para alProgresar({ etapa, hecho, total }): 'fiabilidad', 'comparar', 'veredicto'. Cede el
//                                     control (setTimeout 0) entre mercados ficticios para no congelar la página.
//   comprobarPrecios(foto, precios, valor, velas)   lo de «Antes de empezar»: si los precios cubren los dos periodos con sus velas de
//                                     calentamiento y cuántas operaciones haría la estrategia en cada uno (el motor del paso 1, sin azar).
//   confirmarPrueba / guardarResultado / listarPruebas / leerResultado   el acceso a la base por REST (PostgREST), como lib/registroLab.js.
//
// CADA PERIODO, como el paso 1 con «Otras fechas» (lib/builder/senales.js calculaSenales): las velas (las semanales se hacen con las
// diarias, lib/velasSemanales.js), el calentamiento que pide la regla (calentamientoDe) antes de la primera vela del periodo y nada
// después de la última (recortaConCalentamiento). La estrategia, con el intérprete y sus referencias (el filtro de mercado cuenta);
// cuentan las operaciones que ENTRAN en el periodo (una abierta al final se valora al cierre de la última vela). Las copias
// (copiasReSimuladas): la tasa de entradas de la estrategia, compran a la apertura y venden con sus reglas y sus stops, sin el filtro
// de mercado. La fiabilidad (fiabilidad, mercado a mercado con `primero`): 200 mercados ficticios por bloques de 20 velas.
import { REGLA_AZAR_REGLAS, TEXTO_VEREDICTO_REGLAS, copiasReSimuladas, fiabilidad, intervaloWilson, tasaDeEntradas, veredicto } from './azarReglas'
import { interpreta } from './editor/interprete'
import { valoresDe } from './editor/definicion'
import { esDefinicionEditor } from './editor/fuente'
import { calentamientoDe } from './builder/senales'
import { leeFiltro } from './builder/tarjetas'
import { recortaConCalentamiento } from './periodo'
import { semanalesDesdeDiarias } from './velasSemanales'
import { soloCerradas } from './sesion'
import { huella, jsonCanonico } from './lotesLab'

export const FORMATO_RESULTADO = 1
export const PERIODOS_AZAR = REGLA_AZAR_REGLAS.periodos.map(([desde, hasta]) => ({ desde, hasta, nombre: `${desde.slice(0, 4)}–${hasta.slice(0, 4)}` }))
export const ETAPAS_AZAR = ['fiabilidad', 'comparar', 'veredicto']
const copia = (x) => JSON.parse(JSON.stringify(x))
const params = (p) => { try { return typeof p === 'string' ? JSON.parse(p || '{}') : (p || {}) } catch (_) { return {} } }
const ceder = () => new Promise(r => setTimeout(r, 0))
const iso = (d) => String(d).slice(0, 10)

// ── La foto y su huella ──
// Lo que se congela de una fila de `strategies`: su id, su nombre, su definición y sus valores (params como objeto).
export const fotoDe = (fila) => copia({ id: fila.id, name: fila.name, definition: fila.definition, params: params(fila.params) })
export const huellaEstrategia = (fila) => huella(fotoDe(fila))
export const esDeTarjetas = (fila) => !!fila && esDefinicionEditor(fila.definition)
// Una semilla entera nueva (0 … 2³² − 1).
export function semillaNueva() {
  const c = globalThis.crypto
  if (c?.getRandomValues) return c.getRandomValues(new Uint32Array(1))[0]
  return Math.floor(Math.random() * 4294967296)
}

// Los índices que usa la regla (filtro de mercado y filas del filtro sobre otro valor): hay que pasar sus velas en `precios`.
export function tickersDe(def) {
  const out = new Set()
  try { for (const f of leeFiltro(def).filas) if (f.quien && f.quien !== 'valor') out.add(f.quien) } catch (_) {}
  if (def?.filtroMercado?.ticker) out.add(def.filtroMercado.ticker)
  return [...out]
}

// Las velas de la prueba a partir de las diarias: solo las cerradas y, con 'semanales', las semanas hechas con ellas.
const velasDe = (diarias, velas) => { const d = soloCerradas(diarias || []); return velas === 'semanales' ? semanalesDesdeDiarias(d) : d }

// Lo que ve la estrategia en un periodo: las velas con su calentamiento hasta la última del periodo, las referencias recortadas
// igual, sus operaciones y cuántas entran en el periodo. Lo mismo para «Antes de empezar» y para la prueba.
export function preparaPeriodo({ def, valores, velasValor, referencias = {}, desde, hasta, intervalo }) {
  const nCal = calentamientoDe(def, valores, intervalo)
  const corte = recortaConCalentamiento(velasValor, desde, hasta, nCal)
  if (!corte.periodo.length) return { nCal, corte, bars: [], reales: [], operaciones: 0 }
  const bars = corte.conCalentamiento, ultima = bars[bars.length - 1].date
  const refs = Object.fromEntries(Object.entries(referencias).map(([k, xs]) => [k, (xs || []).filter(b => b.date <= ultima)]))
  const r = interpreta(def, bars, valores, { referencias: refs })
  const reales = r.openPosition ? [...r.trades, r.openPosition] : r.trades
  const d0 = corte.periodo[0].date
  const operaciones = reales.filter(t => t.entryDate >= d0 && t.entryDate <= ultima).length
  return { nCal, corte, bars, refs, reales, operaciones }
}

const fechaCorta = (d) => { const [a, m, x] = iso(d).split('-'); return `${x}/${m}/${a}` }
// «Antes de empezar»: { ok, primera, ultima, faltan: [texto del tramo], operaciones: [n por periodo], ceros: [nombres], pocas: bool }.
// precios: { símbolo: diarias }.
export function comprobarPrecios(foto, precios, valor, velas) {
  const def = foto.definition, v = valoresDe(def, params(foto.params)), intervalo = velas === 'semanales' ? 'semanal' : 'diario'
  const diarias = soloCerradas(precios?.[valor] || [])
  const out = { ok: false, primera: diarias[0]?.date || null, ultima: diarias[diarias.length - 1]?.date || null, faltan: [], operaciones: [], ceros: [], pocas: false }
  const P0 = PERIODOS_AZAR[0], P1 = PERIODOS_AZAR[PERIODOS_AZAR.length - 1]
  const revisa = (quien, xs) => {
    const vs = velasDe(xs, velas)
    if (!vs.length) { out.faltan.push({ quien, tramo: `todo el periodo (${P0.nombre.slice(0, 4)}–${P1.nombre.slice(5)})` }); return }
    const c = recortaConCalentamiento(vs, P0.desde, P1.hasta, calentamientoDe(def, v, intervalo))
    const nCal = calentamientoDe(def, v, intervalo)
    if (!c.periodo.length || c.periodo[0].date > P0.desde.slice(0, 4) + '-01-15' || c.calentamientoReal < nCal)
      out.faltan.push({ quien, tramo: `las ${nCal} velas antes del ${fechaCorta(P0.desde)} (calentamiento de los indicadores)${c.periodo.length ? `: hay precios desde el ${fechaCorta(vs[0].date)}` : ''}` })
    const u = vs[vs.length - 1].date
    if (u < P1.hasta && !(velas === 'semanales' && u >= '2025-12-29')) out.faltan.push({ quien, tramo: `el tramo del ${fechaCorta(u)} al ${fechaCorta(P1.hasta)}` })
  }
  revisa(valor, diarias)
  const tickers = tickersDe(def)
  for (const t of tickers) revisa(t, precios?.[t] || [])
  if (out.faltan.length) return out
  const velasValor = velasDe(diarias, velas), referencias = Object.fromEntries(tickers.map(t => [t, velasDe(precios[t], velas)]))
  for (const p of PERIODOS_AZAR) {
    const pp = preparaPeriodo({ def, valores: v, velasValor, referencias, desde: p.desde, hasta: p.hasta, intervalo })
    out.operaciones.push(pp.operaciones)
    if (!pp.operaciones) out.ceros.push(p.nombre)
  }
  out.pocas = out.operaciones.some(n => n < REGLA_AZAR_REGLAS.pocasOperaciones)
  out.ok = !out.ceros.length
  return out
}

// ── La prueba ──
// La fila de pruebas_azar (sin id, user_id ni creada_en, que pone la base).
export async function nuevaPrueba({ fila, valor, velas, version = null, semilla = semillaNueva() }) {
  if (!esDeTarjetas(fila)) throw new Error('Solo se pueden probar estrategias de tarjetas.')
  if (!['diarias', 'semanales'].includes(velas)) throw new Error(`Velas no válidas: ${velas}.`)
  const foto = fotoDe(fila)
  return { estrategia_id: fila.id, estrategia_nombre: fila.name, estrategia_foto: foto, estrategia_huella: await huella(foto), valor, velas,
    periodos: PERIODOS_AZAR.map(p => [p.desde, p.hasta]), regla: copia(REGLA_AZAR_REGLAS), semilla, version_app: version }
}

const mediana = (xs) => { const v = Float64Array.from(xs).sort(); return v.length % 2 ? v[v.length >> 1] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2 }

export async function ejecutarPrueba(prueba, precios, alProgresar = () => {}, { cede = ceder } = {}) {
  const R = REGLA_AZAR_REGLAS
  if (jsonCanonico(prueba.regla) !== jsonCanonico(R)) throw new Error('La regla guardada en esta prueba no es la de esta versión de la app: no se puede calcular aquí.')
  const foto = prueba.estrategia_foto, def = foto.definition, v = valoresDe(def, params(foto.params))
  const intervalo = prueba.velas === 'semanales' ? 'semanal' : 'diario'
  const periodos = (prueba.periodos || []).map(([desde, hasta]) => ({ desde, hasta, nombre: `${desde.slice(0, 4)}–${hasta.slice(0, 4)}` }))
  const tickers = tickersDe(def)
  const velasValor = velasDe(precios?.[prueba.valor], prueba.velas), referencias = Object.fromEntries(tickers.map(t => [t, velasDe(precios?.[t], prueba.velas)]))
  const estrategia = (refs) => ({ definicion: def, params: v, ctx: { referencias: refs } })
  const base = `pruebaAzar|${prueba.semilla}`
  const pp = periodos.map(p => {
    const x = preparaPeriodo({ def, valores: v, velasValor, referencias, desde: p.desde, hasta: p.hasta, intervalo })
    if (!x.bars.length) throw new Error(`No hay velas de ${prueba.valor} en ${p.nombre}.`)
    if (!x.operaciones) throw new Error(`En ${p.nombre} la estrategia no haría ninguna operación: no se puede probar.`)
    return { ...p, ...x, tasa: tasaDeEntradas(x.bars, x.reales, { desde: p.desde, hasta: p.hasta }).tasa }
  })
  // 1 · Fiabilidad: los mercados ficticios de cada periodo, de uno en uno.
  const total = periodos.length * R.mercados
  let hecho = 0
  alProgresar({ etapa: 'fiabilidad', hecho, total })
  for (const p of pp) {
    let aprobados = 0, sinOperaciones = 0
    for (let m = 0; m < R.mercados; m++) {
      const f = fiabilidad(p.bars, estrategia(p.refs), { mercados: 1, primero: m, bloque: R.bloque, copias: R.copias, semilla: `${base}|${p.desde}|fiabilidad`, desde: p.desde, hasta: p.hasta, tasa: p.tasa })
      aprobados += f.aprobados; sinOperaciones += f.sinOperaciones
      hecho++
      alProgresar({ etapa: 'fiabilidad', hecho, total })
      await cede()
    }
    p.fiabilidad = { mercados: R.mercados, aprobados, sinOperaciones, pct: aprobados / R.mercados * 100, intervalo: intervaloWilson(aprobados, R.mercados) }
  }
  // 2 · Comparar con el azar: la estrategia contra sus 1.000 copias en cada periodo.
  alProgresar({ etapa: 'comparar', hecho: 0, total: pp.length })
  for (let k = 0; k < pp.length; k++) {
    const p = pp[k]
    p.copias = copiasReSimuladas(p.bars, estrategia(p.refs), p.reales, { n: R.copias, semilla: `${base}|${p.desde}|copias`, desde: p.desde, hasta: p.hasta })
    alProgresar({ etapa: 'comparar', hecho: k + 1, total: pp.length })
    await cede()
  }
  // 3 · Veredicto.
  alProgresar({ etapa: 'veredicto', hecho: 0, total: 1 })
  const resumen = pp.map(p => {
    const c = p.copias, cagrs = c.copias.map(x => x.cagr)
    const orden = c.copias.map((x, i) => [x.cagr, i]).sort((a, b) => a[0] - b[0] || a[1] - b[1]), tipica = c.copias[orden[(orden.length - 1) >> 1][1]]
    return { nombre: p.nombre, desde: p.desde, hasta: p.hasta, primera: c.desde, ultima: c.hasta, velas: p.corte.periodo.length, calentamiento: p.corte.calentamientoReal,
      cagr: c.real.cagr, caida: c.real.caida, operaciones: c.real.operaciones, tasa: c.tasa, percentil: c.percentil, gana: c.percentil != null && c.percentil >= R.gana,
      mediana: mediana(cagrs), copiaTipica: { cagr: tipica.cagr, caida: tipica.caida, operaciones: tipica.operaciones },
      pocasOperaciones: c.real.operaciones < R.pocasOperaciones, aprobadosFalsos: p.fiabilidad.pct, fiabilidad: p.fiabilidad, cagrCopias: cagrs }
  })
  const ver = veredicto({ aprobadosFalsos: resumen.map(p => p.aprobadosFalsos), periodos: resumen.map(p => ({ percentil: p.percentil, operaciones: p.operaciones })) })
  const usadas = velasValor.filter(b => b.date >= pp[0].bars[0].date && b.date <= pp[pp.length - 1].bars[pp[pp.length - 1].bars.length - 1].date).map(b => [b.date, b.open, b.high, b.low, b.close])
  const resultado = { formato: FORMATO_RESULTADO, valor: prueba.valor, velas: prueba.velas, estrategia_huella: prueba.estrategia_huella, semilla: prueba.semilla,
    precios: { primera: usadas[0][0], ultima: usadas[usadas.length - 1][0], velas: usadas.length, huella: await huella(usadas) },
    periodos: resumen, aprobadosFalsos: resumen.map(p => p.aprobadosFalsos), veredicto: ver.veredicto, texto: ver.texto, pocasOperaciones: ver.pocasOperaciones }
  alProgresar({ etapa: 'veredicto', hecho: 1, total: 1 })
  return resultado
}

// ── El acceso a la base (ctx = { url, headers, fetch? }) ──
const jsonDe = async (r, que) => { if (!r.ok) throw new Error(`No se pudo ${que} (HTTP ${r.status}).`); return r.json() }
// Inserta la prueba en pruebas_azar y devuelve la fila guardada. datos: lo de nuevaPrueba.
export async function confirmarPrueba({ url, headers, fetch: f = fetch }, datos) {
  const fila = datos.estrategia_huella ? datos : await nuevaPrueba(datos)
  const r = await f(`${url}/rest/v1/pruebas_azar`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify(fila) })
  const j = await jsonDe(r, 'confirmar la prueba')
  return Array.isArray(j) ? j[0] : j
}
// Inserta el resultado de una prueba; si ya tiene uno, no hace nada y devuelve el que había.
export async function guardarResultado(ctx, pruebaId, resultado, version = null) {
  const { url, headers, fetch: f = fetch } = ctx
  const r = await f(`${url}/rest/v1/pruebas_azar_resultados?on_conflict=prueba_id`, { method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'resolution=ignore-duplicates,return=representation' },
    body: JSON.stringify({ prueba_id: pruebaId, resultado, version_app: version }) })
  if (r.status !== 409) { const j = await jsonDe(r, 'guardar el resultado'); const x = Array.isArray(j) ? j[0] : j; if (x) return { ...x, nuevo: true } }
  const ya = await leerResultado(ctx, pruebaId)
  if (!ya) throw new Error('No se pudo guardar el resultado.')
  return { ...ya, nuevo: false }
}
// Las pruebas de una estrategia, de la más nueva a la más vieja, con el veredicto de su resultado (o resultado: null, sin terminar).
export async function listarPruebas({ url, headers, fetch: f = fetch }, estrategiaId) {
  const cols = 'id,creada_en,estrategia_id,estrategia_nombre,estrategia_foto,estrategia_huella,valor,velas,periodos,regla,semilla,version_app,'
    + 'res:pruebas_azar_resultados(id,creado_en,veredicto:resultado->>veredicto,texto:resultado->>texto)'
  const r = await f(`${url}/rest/v1/pruebas_azar?select=${cols}&estrategia_id=eq.${encodeURIComponent(estrategiaId)}&order=creada_en.desc,id.desc&limit=200`, { headers })
  const filas = await jsonDe(r, 'leer las pruebas')
  return filas.map(({ res, ...x }) => ({ ...x, resultado: (Array.isArray(res) ? res[0] : res) || null }))
}
// El resultado entero de una prueba (o null).
export async function leerResultado({ url, headers, fetch: f = fetch }, pruebaId) {
  const r = await f(`${url}/rest/v1/pruebas_azar_resultados?select=*&prueba_id=eq.${Number(pruebaId)}&limit=1`, { headers })
  const j = await jsonDe(r, 'leer el resultado')
  return j[0] || null
}

// ── «Copiar para Claude»: toda la configuración, la huella y las cifras, en texto plano ──
const num = (x, d = 2) => x == null || !Number.isFinite(x) ? '—' : x.toFixed(d).replace('.', ',')
export function textoParaClaude(prueba, resultado) {
  const R = prueba.regla || REGLA_AZAR_REGLAS, L = []
  L.push(`Prueba contra el azar (paso 2 del Builder) · prueba ${prueba.id ?? '(sin guardar)'} · ${prueba.creada_en ? iso(prueba.creada_en) : ''} · app ${prueba.version_app || '—'}`)
  L.push(`Estrategia: ${prueba.estrategia_nombre} (id ${prueba.estrategia_id})`)
  L.push(`Huella de la estrategia (sha256 de la foto): ${prueba.estrategia_huella}`)
  L.push(`Valor: ${prueba.valor} · velas ${prueba.velas} · semilla ${prueba.semilla}`)
  L.push(`Periodos: ${(prueba.periodos || []).map(([a, b]) => `${a} → ${b}`).join(' y ')}`)
  L.push(`Regla: ${R.copias} copias re-simuladas (tasa de entradas de la estrategia, compra a la apertura, salen con sus reglas y stops, sin filtro de mercado); ${R.mercados} mercados ficticios por bloques de ${R.bloque} velas; pasa si gana al ≥ ${R.gana} % de las copias en los dos periodos; «Sin veredicto» si los aprobados falsos son ≥ ${R.sinVeredicto} % en alguno; aviso si < ${R.pocasOperaciones} operaciones.`)
  L.push(`Foto de la estrategia: ${JSON.stringify(prueba.estrategia_foto)}`)
  if (!resultado) { L.push('Resultado: sin terminar.'); return L.join('\n') }
  L.push(`Precios usados: ${resultado.precios.velas} velas del ${resultado.precios.primera} al ${resultado.precios.ultima} · huella ${resultado.precios.huella}`)
  L.push(`VEREDICTO: ${resultado.texto}${resultado.pocasOperaciones ? ' (aviso: pocas operaciones)' : ''}`)
  for (const p of resultado.periodos) {
    L.push(`${p.nombre} (${p.primera} → ${p.ultima}, ${p.velas} velas, ${p.calentamiento} de calentamiento): estrategia CAGR ${num(p.cagr)} %, caída máx. ${num(p.caida, 1)} %, ${p.operaciones} operaciones${p.pocasOperaciones ? ' (pocas)' : ''}, tasa de entradas ${num(p.tasa, 4)}`)
    L.push(`  copias: mediana del CAGR ${num(p.mediana)} %; copia típica CAGR ${num(p.copiaTipica.cagr)} %, caída máx. ${num(p.copiaTipica.caida, 1)} %, ${p.copiaTipica.operaciones} operaciones; gana al ${num(p.percentil, 1)} % de las copias → ${p.gana ? 'pasa' : 'no pasa'} este periodo`)
    L.push(`  fiabilidad: ${p.fiabilidad.aprobados} aprobados por error de ${p.fiabilidad.mercados} mercados ficticios (${num(p.aprobadosFalsos, 1)} %; intervalo del 95 % ${p.fiabilidad.intervalo.map(x => num(x, 1)).join('–')} %)${p.fiabilidad.sinOperaciones ? `; ${p.fiabilidad.sinOperaciones} sin operaciones` : ''}`)
  }
  return L.join('\n')
}
export const TEXTOS_VEREDICTO = TEXTO_VEREDICTO_REGLAS
