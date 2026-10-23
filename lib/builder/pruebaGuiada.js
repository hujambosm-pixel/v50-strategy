// lib/builder/pruebaGuiada.js — el paso 2 del Builder, «Probarla contra el azar» (docs/builder.md, tanda 2): la prueba guiada.
// El usuario solo confirma qué se prueba; lo demás va solo y en orden: 1 congelar, 2 calibrar, 3 comparar con el azar (la
// prueba A / B del lote y el laboratorio con todos los miembros del Nasdaq-100) y 4 el veredicto.
// No hay cálculo nuevo: lo que hace cada etapa es lo MISMO que hace hoy el modo Lotes del editor (components/EditorLotes.js:
// congela, ejecuta, calibra y ejecutaLab), copiado aquí sin cambios para que el Builder no dependa de esa pantalla, y lo que
// guarda en editor_lotes y lab_pruebas tiene la misma forma: «Mi trabajo», el modo Lotes y «Copiar lote completo» lo leen igual.
// Reanudar: lo hecho se lee de la base (el lote en editor_lotes; la ejecución del lote, la calibración y el laboratorio en
// lab_pruebas) y se sigue desde la primera etapa que falte.
// Las dependencias (la red, el registro, la calibración) entran por parámetro: así se prueba con el arnés.
import { FORMATO_LOTE, PERIODOS_DEFECTO, MAX_VARIANTES, validaLote, huellasLote, peticionVariante, semillaVariante, superaAzar, superaEnTodos, resumenLote, comunNormal, esUniversoDinamico, nombreUniversoLote, nombreVariante, huellaSeleccion, REGLAS_UNIVERSO, N_UNIVERSO } from '../editor/lotes'
import { valoresDe } from '../editor/definicion'
import { esDefinicionEditor } from '../editor/fuente'
import { calibraDefinicion, veredictoEditorLab, VERSION_CALIBRACION, CALIBRACION, PERCENTIL_SUPERA_LAB } from '../editor/laboratorio'
import { preparaCartera, realCartera, comparaConServidor, creaPrueba, resumenPrueba, motivoNoAdmitida, bhDe } from '../azarCartera'
import { resumenCurva } from '../respuestaMc'
import { cargaUniversoMc } from '../universoMc'
import { universoDePeriodo } from '../screener'
import { semillaDe } from '../azar'
import { jsonCanonico } from '../lotesLab'

export const ETAPAS = Object.freeze([
  { id: 'congelar', titulo: 'Congelar', frase: 'Guarda lo que confirmaste para que no se pueda cambiar.' },
  { id: 'calibrar', titulo: 'Verificación de sesgos', ayuda: 'sesgos', frase: 'Ejecuta tu estrategia en 50 mercados ficticios donde ninguna puede tener ventaja. Si ahí saliera «buena» a menudo, el laboratorio de operaciones no sería justo con ella. Solo se hace la primera vez.' },
  { id: 'comparar', titulo: 'Comparar con el azar', frase: 'Ejecuta el laboratorio de cartera y el laboratorio de operaciones, periodo a periodo.' },
  { id: 'veredicto', titulo: 'Veredicto', frase: 'Manda el laboratorio de operaciones si la estrategia pasa la verificación de sesgos (si no la pasa, queda sin veredicto); sin verificación, el laboratorio de cartera.' },
])
// Nombres del Builder (tanda 2c; lib/builder/ayuda.js): «laboratorio de operaciones» = el laboratorio (editorLab),
// «laboratorio de cartera» = la prueba A / B del lote (editorLote), «verificación de sesgos» = la calibración
// (editorCalibracion). Solo cambian los textos: los registros y sus nombres internos son los de siempre.
// Lo común por defecto (el de un lote nuevo del modo Lotes): Nasdaq-100 por momentum, N = 30, dos periodos, diario,
// concentrado con 4 posiciones por fuerza relativa, 500 simulaciones.
export const OPCIONES_UNIVERSO = Object.freeze(Object.keys(REGLAS_UNIVERSO).flatMap(regla => N_UNIVERSO.map(n => ({ clave: `${regla}|${n}`, regla, n, texto: `Nasdaq-100 · los ${n} ${REGLAS_UNIVERSO[regla]}` }))))
export const comunDefecto = (universo = { tipo: 'ndx', regla: 'momentum', n: 30 }, periodos = PERIODOS_DEFECTO) => ({ universo, periodos: periodos.map(p => ({ ...p })), intervalo: 'diario', capitalIni: 10000, modoAsig: 'concentrado',
  sizeRules: { maxPosiciones: 4, prioridad: 'fuerza_relativa', criterioUso: 'desempate', rsWindow: 63 }, comisiones: null, nSim: 500 })
const params = (p) => { try { return typeof p === 'string' ? JSON.parse(p || '{}') : (p || {}) } catch (_) { return {} } }
export const esSemanal = (fila) => params(fila?.params).intervalo === 'semanal'

// El lote que se confirma: las variantes salen de estrategias guardadas del editor (copia de su definición y sus valores).
export function loteDesde({ estrategias, universo, periodos, nombre }) {
  const variantes = []
  for (const s of estrategias) {
    let raiz = String(s.name || 'Variante').trim().slice(0, 70), nm = raiz, j = 2
    while (variantes.some(v => v.nombre === nm)) nm = `${raiz} (${j++})`
    variantes.push({ id: `V${variantes.length + 1}`, nombre: nm, definicion: JSON.parse(JSON.stringify(s.definition)), valores: valoresDe(s.definition, params(s.params)) })
  }
  return { formato: FORMATO_LOTE, nombre: String(nombre || '').trim(), descripcion: '', comun: comunDefecto(universo, periodos), variantes }
}
export const nombrePropuesto = (estrategias, hoy = new Date().toISOString().slice(0, 10)) => estrategias.length
  ? `${estrategias[0].name}${estrategias.length > 1 ? ` y ${estrategias.length - 1} más` : ''} · ${hoy}` : `Prueba · ${hoy}`
// Los errores de validaLote, junto al campo al que se refieren y en frase sencilla.
export function erroresPorCampo(lote, extra = []) {
  const out = { nombre: [], variantes: [], universo: [], periodos: [], general: [...extra] }
  for (const e of validaLote(lote)) {
    if (/necesita un nombre/.test(e)) out.nombre.push('Ponle un nombre a la prueba.')
    else if (/^Variante|De 1 a \d+ variantes/.test(e)) out.variantes.push(/De 1 a/.test(e) ? `Elige al menos una estrategia (y no más de ${MAX_VARIANTES}).` : e)
    else if (/^Periodo|periodos repetidos|De 1 a \d+ periodos/.test(e)) out.periodos.push(e)
    else if (/universo|activos|concentrado/.test(e)) out.universo.push(e)
    else out.general.push(e.replace(/^El lote /, 'La prueba '))
  }
  return out
}
const fmtFecha = (f) => `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}`
// Una fecha vacía o imposible (en el formulario llega como '') no deja un guion suelto: «(fecha por corregir)–2020».
const anioDe = (f) => /^\d{4}-\d{2}-\d{2}$/.test(f || '') ? f.slice(0, 4) : '(fecha por corregir)'
export const nombrePeriodo = (p) => `${anioDe(p.desde)}–${anioDe(p.hasta)}`
const miles = (x) => String(x).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
// «Qué se prueba», exacto según lo que se ejecuta.
export function textoQueSePrueba(lote) {
  const c = comunNormal(lote.comun), u = c.universo, ps = c.periodos.map(nombrePeriodo).join(' y ')
  const donde = esUniversoDinamico(u) ? `los ${u.n} valores del Nasdaq-100 ${REGLAS_UNIVERSO[u.regla]} de cada año` : `una lista fija de ${u.symbols.length} valores`
  return [
    `Laboratorio de cartera: cada estrategia opera en ${donde} (como mucho ${c.sizeRules.maxPosiciones} posiciones a la vez), en ${ps}. Su crecimiento anual (CAGR) se compara con ${miles(c.nSim)} copias que hacen las mismas operaciones en fechas al azar; pasa si gana al 95 % de ellas en todos los periodos.`,
    `Laboratorio de operaciones: la misma estrategia en todos los valores del Nasdaq-100 de esos periodos. Su ganancia media por operación se compara con ${miles(CALIBRACION.nSim)} copias al azar; antes, la verificación de sesgos comprueba en ${CALIBRACION.universos} mercados ficticios sin ventaja que esa comparación es justa con ella.`,
    'Si la estrategia pasa la verificación de sesgos, decide el laboratorio de operaciones; si no la pasa, queda sin veredicto. Sin verificación, decide el laboratorio de cartera.',
  ]
}

// ── Lo que ya está hecho (para reanudar) ──
const ultima = (xs) => (xs || []).reduce((m, x) => (!m || String(x.creado) > String(m.creado) ? x : m), null)
const mismosPeriodos = (a, b) => jsonCanonico((a || []).map(p => ({ desde: p.desde, hasta: p.hasta }))) === jsonCanonico((b || []).map(p => ({ desde: p.desde, hasta: p.hasta })))
export const huellaVarianteDe = (fila, v) => (fila?.huellas?.variantes || []).find(x => x.id === v.id)?.huella
// pruebas: filas de lab_pruebas (config, resultados, creado). Devuelve { ab, cal: { id }, lab: { id } } con lo último de cada uno.
export function estadoDesde(fila, pruebas) {
  const cn = comunNormal(fila.lote.comun)
  const ab = ultima(pruebas.filter(p => p.config?.prueba === 'editorLote' && p.config.hashLote === fila.hash_lote))
  const cal = {}, lab = {}
  for (const v of fila.lote.variantes) {
    const h = huellaVarianteDe(fila, v)
    const c = ultima(pruebas.filter(p => p.config?.prueba === 'editorCalibracion' && p.config.huella === h && p.config.version === VERSION_CALIBRACION))
    const l = ultima(pruebas.filter(p => p.config?.prueba === 'editorLab' && p.config.huellaVariante === h && mismosPeriodos(p.config.periodos, cn.periodos)))
    cal[v.id] = c?.resultados || null; lab[v.id] = l?.resultados?.periodos || null
  }
  return { ab: ab ? { resultados: ab.resultados.variantes, resumen: ab.resultados.resumen, creado: ab.creado, versionApp: ab.version_app } : null, cal, lab }
}
// Lo hecho de un lote, leído del registro (deps.listar = listarPruebas): su ejecución A / B y, por variante, la calibración
// y el laboratorio (las mismas consultas que el modo Lotes).
export async function leeHecho(fila, { listar, ctx }) {
  const pruebas = []
  const q = async (filtro, limite) => { pruebas.push(...await listar(ctx, { limite, soloResumen: false, filtro })) }
  await q(`&config->>prueba=eq.editorLote&config->>hashLote=eq.${fila.hash_lote}`, 1)
  for (const v of fila.lote.variantes) {
    const h = huellaVarianteDe(fila, v); if (!h) continue
    await q(`&config->>prueba=eq.editorCalibracion&config->>huella=eq.${h}`, 5)
    await q(`&config->>prueba=eq.editorLab&config->>huellaVariante=eq.${h}`, 20)
  }
  return estadoDesde(fila, pruebas)
}
// El estado de cada etapa:'hecho' | 'pendiente' (y, para la calibración, si se salta porque ya estaba).
export function etapasDe(fila, est) {
  if (!fila) return { congelar: 'pendiente', calibrar: 'pendiente', comparar: 'pendiente', veredicto: 'pendiente' }
  const vs = fila.lote.variantes, cal = vs.every(v => est.cal[v.id]), comp = !!est.ab && vs.every(v => est.lab[v.id])
  return { congelar: 'hecho', calibrar: cal ? 'hecho' : 'pendiente', comparar: comp ? 'hecho' : 'pendiente', veredicto: cal && comp ? 'hecho' : 'pendiente' }
}
// Para la pantalla: el estado de cada etapa con su nota si falta solo una parte (la prueba del lote o el laboratorio).
export function etapasConNotas(fila, est) {
  const m = etapasDe(fila, est), out = Object.fromEntries(Object.entries(m).map(([k, v]) => [k, { estado: v }]))
  if (fila && m.comparar === 'pendiente') {
    const conLab = fila.lote.variantes.filter(v => est.lab[v.id]).length
    if (est.ab && conLab < fila.lote.variantes.length) out.comparar.nota = 'El laboratorio de cartera ya está hecho; falta el laboratorio de operaciones.'
    else if (!est.ab && conLab) out.comparar.nota = 'El laboratorio de operaciones ya está hecho; falta el laboratorio de cartera.'
  }
  return out
}
export const completo = (e) => Object.values(e).every(x => x === 'hecho')

// ── El veredicto (la regla de «Mi trabajo»: manda el laboratorio calibrado; sin calibración, la prueba del lote) ──
export function veredictoVariante({ cal, lab, abVariante }) {
  if (cal && lab) {
    const v = veredictoEditorLab(cal, lab)
    return { decide: 'laboratorio', pasa: v === 'pasa' ? true : v === 'no pasa' ? false : null, texto: v === 'pasa' ? 'Pasa: en el laboratorio de operaciones gana al 95 % de las copias al azar en todos los periodos.' : v === 'no pasa' ? 'No llega: en algún periodo del laboratorio de operaciones no gana al 95 % de las copias al azar.' : 'Sin veredicto: la verificación de sesgos dice que con esta estrategia el laboratorio de operaciones no es justo.' }
  }
  if (abVariante) {
    const s = typeof abVariante.supera === 'boolean' ? abVariante.supera : superaEnTodos(abVariante)
    return { decide: 'lote', pasa: s, texto: s ? 'Pasa: en el laboratorio de cartera gana al 95 % de las copias al azar en todos los periodos (sin verificación de sesgos).' : 'No llega: en algún periodo del laboratorio de cartera no gana al 95 % de las copias al azar (sin verificación de sesgos).' }
  }
  return { decide: null, pasa: null, texto: 'Todavía sin resultados.' }
}
// La tabla de resultados: una fila por variante y periodo.
export function filasResultado(fila, est) {
  const cn = comunNormal(fila.lote.comun), out = []
  for (const v of fila.lote.variantes) {
    const abV = (est.ab?.resultados || []).find(x => x.id === v.id), labV = est.lab[v.id], ver = veredictoVariante({ cal: est.cal[v.id], lab: labV, abVariante: abV })
    cn.periodos.forEach((p, k) => {
      const pa = Array.isArray(abV?.periodos) ? abV.periodos.find(x => x.desde === p.desde && x.hasta === p.hasta) : k === 0 && abV ? abV : null
      const pl = (labV || []).find(x => x.desde === p.desde && x.hasta === p.hasta)
      const pctA = pa?.A?.cagr?.percentil ?? null, pctL = pl?.azar?.percentil ?? null
      const pasaFila = ver.decide === 'laboratorio' ? (ver.pasa === null ? null : pctL != null && pctL >= PERCENTIL_SUPERA_LAB) : ver.decide === 'lote' ? (pctA != null && pctA >= 95) : null
      // qqq: QQQ comprar y mantener de la misma ejecución del lote (lo guardado; un lote antiguo sin ello, null). Solo informativo.
      out.push({ variante: nombreVariante(v), id: v.id, periodo: p, cagr: pa?.real?.cagr ?? null, maxDD: pa?.real?.maxDD ?? null, qqq: pa?.refs?.qqq ?? null, percentilLote: pctA, percentilLab: pctL, pasa: pasaFila, decide: ver.decide })
    })
  }
  return out
}

// ── Las etapas (lo mismo que el modo Lotes) ──
// deps: { apiFetch, ctx: { url, headers }, f (fetch), guardar (guardarPrueba), version, progreso(texto, fraccion), parar() }
export async function congela(lote, deps) {
  const { f = fetch, ctx } = deps
  const huellas = await huellasLote(lote)
  const fila = { version_app: deps.version || null, nombre: lote.nombre.trim(), lote, hash_lote: huellas.lote, huellas }
  const r = await f(`${ctx.url}/rest/v1/editor_lotes`, { method: 'POST', headers: { ...ctx.headers, 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify(fila) })
  if (r.status === 409) {   // ya estaba congelado (misma huella): se sigue con el que hay
    const g = await f(`${ctx.url}/rest/v1/editor_lotes?hash_lote=eq.${huellas.lote}&select=id,creado,version_app,nombre,lote,hash_lote,huellas`, { headers: ctx.headers })
    const [x] = g.ok ? await g.json() : []
    if (x) return { fila: x, yaExistia: true }
    throw new Error('Esa prueba ya estaba congelada, pero no se pudo leer.')
  }
  if (!r.ok) throw new Error(`No se pudo congelar (HTTP ${r.status}).`)
  const j = await r.json()
  return { fila: Array.isArray(j) ? j[0] : j, yaExistia: false }
}
export async function calibra(fila, v, deps, opciones = {}) {
  const h = huellaVarianteDe(fila, v)
  const cal = await calibraDefinicion(v.definicion, v.valores || {}, { semilla: semillaDe(`editor-calibracion|${h}`), parar: deps.parar, cede: () => new Promise(r => setTimeout(r, 0)),
    alProgreso: (k, n) => deps.progreso?.(`${nombreVariante(v)}: mercado ficticio ${k} de ${n}`, k / n), ...opciones })
  await deps.guardar({ config: { prueba: 'editorCalibracion', huella: h, version: VERSION_CALIBRACION }, resultados: cal, versionApp: deps.version }, deps.ctx)
  return cal
}
export async function ejecutaLab(fila, v, deps) {
  const h = huellaVarianteDe(fila, v), cn = comunNormal(fila.lote.comun)
  const config = { prueba: 'editorLab', definicion: v.definicion, valores: v.valores || {}, universo: { indice: 'NDX' }, intervalo: 'diario', periodos: cn.periodos.map(p => ({ desde: p.desde, hasta: p.hasta })), huellaVariante: h }
  const periodos = []
  for (const [k, p] of config.periodos.entries()) {
    if (deps.parar?.()) throw new Error('Parado a petición tuya.')
    deps.progreso?.(`${nombreVariante(v)}: laboratorio de operaciones, ${nombrePeriodo(p)}`, k / config.periodos.length)
    const r = await deps.apiFetch('/api/laboratorio', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ config, periodo: p }) })
    let j = null; try { j = await r.json() } catch (_) {}
    if (!r.ok) throw new Error(`El servidor no pudo calcular el laboratorio de ${nombrePeriodo(p)}: ${j?.error || `HTTP ${r.status}`}`)
    const x = j.resultado
    periodos.push({ desde: x.desde, hasta: x.hasta, operaciones: x.operaciones, media: x.media, mediana: x.mediana, acierto: x.acierto, duracionMedia: x.duracionMedia, fueraDelIndice: x.fueraDelIndice,
      azar: x.azar, qqq: x.qqq ? { total: x.qqq.total, porDia: x.qqq.porDia } : null, miembros: j.simbolos, sinDatos: (j.sinDatos || []).length })
  }
  await deps.guardar({ config, resultados: { periodos, hashLote: fila.hash_lote }, versionApp: deps.version }, deps.ctx)
  return periodos
}
export async function ejecutaAB(fila, deps) {
  const lote = fila.lote, cn = comunNormal(lote.comun)
  const detente = () => { if (deps.parar?.()) throw new Error('Parado a petición tuya.') }
  const uPer = []
  if (esUniversoDinamico(cn.universo)) {
    deps.progreso?.('leyendo el universo del Nasdaq-100…', 0)
    const datosU = await (deps.cargaUniverso || cargaUniversoMc)(cn.universo.n, { ...deps.ctx, regla: cn.universo.regla })
    for (const p of cn.periodos) {
      const up = universoDePeriodo(datosU.filas, datosU.miembros, p.desde, p.hasta)
      if (!up.simbolos.length) throw new Error(`${nombreUniversoLote(cn.universo)}: sin selección en ${nombrePeriodo(p)}.`)
      uPer.push({ ...up, huella: await huellaSeleccion(up.elegidos) })
    }
  }
  const resultados = [], total = lote.variantes.length * cn.periodos.length
  let hechos = 0
  for (const [k, v] of lote.variantes.entries()) {
    const out = { id: v.id, nombre: nombreVariante(v), periodos: [] }
    for (const [ip, p] of cn.periodos.entries()) {
      detente()
      const etq = `${nombreVariante(v)} · ${nombrePeriodo(p)}`
      deps.progreso?.(`${etq}: backtest`, hechos / total)
      const pet = peticionVariante(lote, v, p, uPer[ip] || null)
      const r = await deps.apiFetch('/api/multibacktest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pet) })
      let j = null; try { j = await r.json() } catch (_) {}
      if (!r.ok || !j?.candidatosAzar) throw new Error(`El servidor no pudo calcular ${etq}: ${j?.error || `HTTP ${r.status}`}`)
      const P = preparaCartera(j.candidatosAzar, { mascara: pet.universo?.mascara || null }), real = realCartera(P), cmp = comparaConServidor(real, j, 1e-6, P.o.capitalIni)
      const rp = { desde: p.desde, hasta: p.hasta, real, coincide: cmp.ok !== false, activos: pet.symbols.length, nSim: cn.nSim, semilla: semillaVariante(fila.hash_lote, v.id, p, 'A', lote.comun), bh: bhDe(j),
        ...(j.universo ? { descartadas: j.universo.descartadasPorUniverso ?? null, refs: { universo: resumenCurva(j.universo.bhUniversoCurve), qqq: resumenCurva(j.universo.qqqBHCurve) }, huellaSeleccion: uPer[ip]?.huella || null } : {}) }
      for (const tipo of ['A', 'B']) {
        if (motivoNoAdmitida(pet, tipo)) continue
        const pr = creaPrueba(P, { tipo, nSim: cn.nSim, semilla: semillaVariante(fila.hash_lote, v.id, p, tipo, lote.comun) })
        while (!pr.hecho()) {
          detente()
          pr.avanza(25); deps.progreso?.(`${etq}: laboratorio de cartera, copias ${tipo}, ${pr.hechas()} de ${cn.nSim}`, (hechos + (tipo === 'A' ? 0 : 0.5) + pr.hechas() / cn.nSim / 2) / total)
          await new Promise(res => setTimeout(res, 0))
        }
        rp[tipo] = resumenPrueba(real, pr.sims)
        if (tipo === 'A' && pet.universo) rp.sinColocar = pr.stats.sinColocar
      }
      out.periodos.push(rp); hechos++
    }
    out.supera = superaEnTodos(out)
    resultados.push(out)
  }
  const resumen = resumenLote(resultados, cn.periodos.length)
  const compacto = resultados.map(x => ({ id: x.id, nombre: x.nombre, supera: x.supera, periodos: x.periodos.map(p => ({ desde: p.desde, hasta: p.hasta, activos: p.activos, coincide: p.coincide, nSim: p.nSim, semilla: p.semilla, bh: p.bh,
    real: { cagr: p.real.cagr, maxDD: p.real.maxDD, ratio: p.real.ratio ?? null, capInv: p.real.capInv },
    A: p.A ? { cagr: p.A.cagr, maxDD: p.A.maxDD, ratio: p.A.ratio } : null, B: p.B ? { cagr: p.B.cagr, maxDD: p.B.maxDD, ratio: p.B.ratio } : null, supera: superaAzar(p.A),
    ...(p.refs ? { refs: p.refs, descartadas: p.descartadas, sinColocar: p.sinColocar ?? null, huellaSeleccion: p.huellaSeleccion } : {}) })) }))
  await deps.guardar({ config: { prueba: 'editorLote', hashLote: fila.hash_lote, nombre: fila.nombre, comun: lote.comun, variantes: fila.huellas.variantes }, resultados: { variantes: compacto, resumen }, versionApp: deps.version }, deps.ctx)
  return { resultados: compacto, resumen, creado: new Date().toISOString(), versionApp: deps.version || null }
}

// Encadena lo que falte, en orden. al(etapa, cambio) informa a la pantalla. est se va completando y se devuelve.
// opciones.calibracion: para las pruebas (menos universos y simulaciones); en la app, los de siempre.
export async function encadena(fila, est, deps, al, opciones = {}) {
  const e = { ...est, cal: { ...est.cal }, lab: { ...est.lab } }
  const vs = fila.lote.variantes
  al('congelar', { estado: 'hecho' })
  // 2. Calibración: solo las variantes que no la tienen.
  if (vs.every(v => e.cal[v.id])) al('calibrar', { estado: 'hecho', nota: 'Ya estaba verificada: se salta.' })
  else {
    for (const [k, v] of vs.entries()) {
      if (e.cal[v.id]) continue
      al('calibrar', { estado: 'enMarcha', progreso: 0, texto: `${nombreVariante(v)} (${k + 1} de ${vs.length})` })
      e.cal[v.id] = await calibra(fila, v, { ...deps, progreso: (t, x) => al('calibrar', { estado: 'enMarcha', texto: t, progreso: x }) }, opciones.calibracion)
    }
    al('calibrar', { estado: 'hecho' })
  }
  // 3. Comparar: la prueba del lote (si falta) y el laboratorio de cada variante (si falta).
  if (!e.ab) { al('comparar', { estado: 'enMarcha', progreso: 0, texto: 'laboratorio de cartera' }); e.ab = await ejecutaAB(fila, { ...deps, progreso: (t, x) => al('comparar', { estado: 'enMarcha', texto: t, progreso: x * 0.5 }) }) }
  for (const [k, v] of vs.entries()) {
    if (e.lab[v.id]) continue
    e.lab[v.id] = await ejecutaLab(fila, v, { ...deps, progreso: (t, x) => al('comparar', { estado: 'enMarcha', texto: t, progreso: 0.5 + (k + x) / vs.length * 0.5 }) })
  }
  al('comparar', { estado: 'hecho' })
  al('veredicto', { estado: 'hecho' })
  return e
}
export { esDefinicionEditor, fmtFecha }
