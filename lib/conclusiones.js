// lib/conclusiones.js — «Conclusiones» de los resultados del optimizador: reglas fijas y frases con los números reales.
// Sin IA, sin red, sin backtests nuevos: los mismos resultados dan siempre las mismas conclusiones.
//
// Entra lo que la pantalla ya tiene calculado (en la temporalidad elegida y con la métrica principal elegida):
//   filas          las de la tabla (agregaOptimizacion): params, cuenta / motivo, cagrMediana, cagrMedia, porActivo…
//   valores        los valores de la rejilla por parámetro (res.valores)
//   claveGuardada  claveCombinacion de la configuración guardada
//   seleccionada   la fila seleccionada (o null)
//   tipoCagr       'simple' | 'compuesto' (la métrica principal)
//   comparar       { tp, porTemporalidad: { diario: filas, semanal: filas } } con «Comparar diario y semanal», o null
//   walkForward    el resultado de walkForward en esta temporalidad si ya está calculado, o null; con
//                  origenReferencia ('guardada' | 'defecto' | 'otra') y referenciaParams
//   periodo        { desde, hasta } de la optimización (para «poca historia»)
//   azar           la prueba contra el azar (lib/azar.js) de la seleccionada en esta temporalidad, si está calculada
//   edge           el Edge Ratio de las entradas contra el azar (lib/edge.js), ídem
// Sale { lista: [{ id, tipo: 'info' | 'aviso' | 'bien', titulo, puntos[], umbral }], enLaPractica: { frases[], texto } }.
import { fmt, fmtDate } from './utils'
import { mediana, media, ordenaFilas, estabilidad, claveCombinacion, cagrDeMetricas, NOMBRES_CAGR, MIN_TOTAL, MIN_POR_ACTIVO } from './optimizacion'
import { percentil, rangoRelativo } from './robustez'
import { AZAR, TEXTO_VEREDICTO, TEXTO_VEREDICTO_CAIDA } from './azar'
import { EDGE_CORTO_MAX } from './edge'

// ── Umbrales (PROVISIONALES: se ajustarán con el uso) ──────────────────────────────────────────────────────────────
export const UMBRALES = {
  rangoPlano: 0.30,          // R1: rango relativo por debajo → el resultado casi no depende del parámetro
  rangoAlto: 0.80,           // R1: por encima → el parámetro importa mucho
  rejillaEstrecha: 2,        // R1: rejilla estrecha si en todos los parámetros máximo / mínimo < 2
  parametroCasiNada: 0.25,   // R1: un parámetro «casi no pesa» si su rango es < 25 % del rango del que más pesa
  percentilBajo: 25,         // R2: la guardada «por debajo» de la rejilla
  percentilAlto: 75,         // R2: «por encima»
  sesgoPuntos: 5,            // R3: media − mediana > máx(5 puntos, 25 % de |mediana|)…
  sesgoRelativo: 0.25,
  sesgoMinActivos: 5,        // R3: …con al menos 5 activos
  validasMin: 0.50,          // R4: aviso si las válidas son < 50 % de la rejilla
  comparaValidas: 0.60,      // R5: las válidas de una temporalidad < 60 % de las de la otra
  comparaMetrica: 2,         // R5: diferencia de la mediana de la métrica, en puntos…
  comparaRelativo: 0.20,     // R5: …o relativa, sobre la menor de las dos
  comparaAcierto: 5,         // R5: diferencia de la mediana del % de acierto, en puntos
  compensaPuntos: 3,         // R6: mejor válida − guardada
  wfSinEleccion: 0.30,       // R6: walk-forward no fiable si ≥ 30 % de los años de prueba no tienen combinación válida
  picoPuntos: 2,             // R7: pico aislado si la media de sus vecinas < mejor − máx(2 puntos, 15 % de |mejor|)
  picoRelativo: 0.15,
  operacionesMin: 10,        // R7: pocas operaciones si la mediana de operaciones por activo < 10
  historiaMin: 0.50,         // R9: poca historia si las velas del activo cubren < 50 % del periodo analizado
}
const U = UMBRALES

const pc = (v, d = 2) => fmt(v, d, ' %')
const nu = (v, d = 2) => fmt(v, d)
const pts = (v) => `${fmt(Math.abs(v), 2)} ${Math.abs(v) === 1 ? 'punto' : 'puntos'}`
const agregable = (c) => c == null ? null : (c <= -99 ? -100 : c)
const textoValor = (v) => typeof v === 'number' ? fmt(v, Number.isInteger(v) ? 0 : 2) : v === true ? 'sí' : v === false ? 'no' : String(v)
const textoParams = (p, claves) => claves.map(k => `${k} ${textoValor(p[k])}`).join(' · ')
const validasDe = (filas) => (filas || []).filter(f => f.cuenta && f.cagrMediana != null)
const mejorDe = (filas) => ordenaFilas(validasDe(filas), 'cagrMediana', true)[0] || null

// R1 · ¿Importa el parámetro?
export function reglaImporta({ filas, valores, nombre }) {
  const v = validasDe(filas).map(f => f.cagrMediana)
  if (v.length < 3) return null
  const p10 = percentil(v, 0.1), p90 = percentil(v, 0.9), med = mediana(v), rr = rangoRelativo(p10, p90, med)
  const puntos = [`${nombre} (mediana entre activos) de las ${v.length} combinaciones válidas: de ${pc(p10)} a ${pc(p90)} (P10–P90), con una mediana de ${pc(med)}; rango relativo ${rr == null ? '— (mediana casi 0)' : nu(rr)}.`]
  // Con dos o más parámetros: cuánto mueve cada uno la mediana, agrupando por su valor.
  const variados = Object.keys(valores || {}).filter(k => valores[k].length > 1)
  let porParametro = []
  if (variados.length >= 2) {
    porParametro = variados.map(k => {
      const meds = valores[k].map(x => mediana(validasDe(filas).filter(f => f.params[k] === x).map(f => f.cagrMediana))).filter(m => m != null)
      return { k, rango: meds.length ? Math.max(...meds) - Math.min(...meds) : 0, min: meds.length ? Math.min(...meds) : null, max: meds.length ? Math.max(...meds) : null }
    }).sort((a, b) => b.rango - a.rango)
    const top = porParametro[0]
    const resto = porParametro.slice(1).map(x => `${x.k}, ${pts(x.rango)}${x.rango < top.rango * U.parametroCasiNada ? ' (casi no pesa)' : ''}`)
    puntos.push(`Pesa más ${top.k}: según su valor, la mediana va de ${pc(top.min)} a ${pc(top.max)} (${pts(top.rango)}). ${resto.length > 1 ? 'Los demás' : 'El otro'}: ${resto.join('; ')}.`)
  }
  const umbral = `Umbral: rango relativo < ${nu(U.rangoPlano)} (casi no cambia) o > ${nu(U.rangoAlto)} (importa mucho); rejilla estrecha si en todos los parámetros máximo / mínimo < ${fmt(U.rejillaEstrecha, 0)}`
  if (rr != null && rr < U.rangoPlano) {
    // Rejilla estrecha: todos los parámetros numéricos (y positivos) con máximo / mínimo < 2. Variar poco es lo esperable,
    // así que no cuenta como «plano» para «En la práctica».
    const estrecha = variados.length > 0 && variados.every(k => valores[k].every(x => typeof x === 'number' && x > 0) && Math.max(...valores[k]) / Math.min(...valores[k]) < U.rejillaEstrecha)
    return { id: 'R1', tipo: estrecha ? 'info' : 'aviso', plano: !estrecha, estrecha, rr, titulo: `El parámetro casi no cambia el resultado (de ${pc(p10)} a ${pc(p90)}).`,
      puntos: [...puntos, 'Es buena señal de estabilidad (una meseta), pero también significa que el parámetro no es lo que decide: la pregunta es si la señal aporta algo frente a comprar estos mismos activos. La prueba contra el azar lo aclarará.',
        ...(estrecha ? [`La rejilla es estrecha (${variados.map(k => `${k} ${textoValor(Math.min(...valores[k]))}–${textoValor(Math.max(...valores[k]))}`).join(', ')}): es normal que varíe poco; amplíala para saber si el parámetro importa.`] : [])], umbral }
  }
  if (rr != null && rr > U.rangoAlto) return { id: 'R1', tipo: 'aviso', rr, titulo: 'El parámetro importa mucho: elige con cuidado y valida fuera de muestra.', puntos, umbral }
  return { id: 'R1', tipo: 'info', rr, titulo: rr == null ? 'No se puede medir cuánto importa el parámetro: la mediana de la rejilla es casi 0.' : `El parámetro influye de forma moderada (de ${pc(p10)} a ${pc(p90)}).`, puntos, umbral }
}

// R2 · ¿Dónde queda la guardada? Percentil entre las válidas (proporción de las demás que quedan por debajo).
export function reglaGuardada({ filas, claveGuardada, claves }) {
  const umbral = `Umbral: por debajo si percentil < ${U.percentilBajo}; por encima si > ${U.percentilAlto} (entre las válidas)`
  const g = (filas || []).find(f => claveCombinacion(f.params) === claveGuardada)
  if (!g) return { id: 'R2', tipo: 'info', titulo: 'La configuración guardada no está en esta rejilla: no se puede situar.', puntos: ['Amplía la rejilla para incluirla si quieres compararla.'], umbral }
  if (!g.cuenta || g.cagrMediana == null) return { id: 'R2', tipo: 'aviso', titulo: 'La configuración guardada no es válida aquí.', puntos: [`${textoParams(g.params, claves)}: ${g.motivo || 'sin resultado'}.`], umbral }
  const otras = validasDe(filas).filter(f => f !== g).map(f => f.cagrMediana)
  if (!otras.length) return null   // una sola combinación válida (p. ej. rejilla de un solo valor): no hay con qué situarla
  const per = otras.length ? (otras.filter(x => x < g.cagrMediana).length + 0.5 * otras.filter(x => x === g.cagrMediana).length) / otras.length * 100 : 50
  const med = mediana(validasDe(filas).map(f => f.cagrMediana))
  const zona = per < U.percentilBajo ? 'por debajo' : per > U.percentilAlto ? 'por encima' : 'en la zona media'
  return { id: 'R2', tipo: per < U.percentilBajo ? 'aviso' : per > U.percentilAlto ? 'bien' : 'info', percentil: per,
    titulo: `La configuración guardada queda ${zona} de la rejilla (percentil ${fmt(per, 0)}).`,
    puntos: [`Guardada (${textoParams(g.params, claves)}): ${pc(g.cagrMediana)} frente a una mediana de la rejilla de ${pc(med)}.`], umbral }
}

// R3 · ¿Unos pocos activos tiran del resultado? (la combinación seleccionada)
export function reglaSesgo({ seleccionada, tipoCagr, claves, pocaHistoria = [] }) {
  if (!seleccionada) return null
  const vals = Object.entries(seleccionada.porActivo || {}).map(([s, m]) => [s, agregable(cagrDeMetricas(m, tipoCagr))]).filter(([, v]) => v != null)
  if (vals.length < U.sesgoMinActivos) return null
  const med = seleccionada.cagrMediana, me = seleccionada.cagrMedia
  if (med == null || me == null) return null
  const lim = Math.max(U.sesgoPuntos, U.sesgoRelativo * Math.abs(med)), d = me - med
  const umbral = `Umbral: |media − mediana| > máx(${fmt(U.sesgoPuntos, 0)} puntos, ${fmt(U.sesgoRelativo * 100, 0)} % de |mediana|), con al menos ${U.sesgoMinActivos} activos`
  if (Math.abs(d) <= lim) return null
  const arriba = d > 0
  const lejos = vals.filter(([, v]) => arriba ? v > med : v < med).sort((a, b) => arriba ? b[1] - a[1] : a[1] - b[1]).slice(0, 3)
  return { id: 'R3', tipo: 'aviso',
    titulo: arriba ? `La media (${pc(me)}) va muy por encima de la mediana (${pc(med)}): unos pocos activos tiran del resultado. Fíate de la mediana.`
      : `La media (${pc(me)}) cae muy por debajo de la mediana (${pc(med)}): unos pocos activos hunden el resultado. Fíate de la mediana.`,
    puntos: [`Seleccionada (${textoParams(seleccionada.params, claves)}), ${vals.length} activos. Los que más se alejan ${arriba ? 'por arriba' : 'por abajo'}: ${lejos.map(([s, v]) => `${s} ${pc(v)}${pocaHistoria.some(x => x.s === s) ? ' (poca historia)' : ''}`).join(', ')}.`], umbral }
}

// R9 · Activos con poca historia en el periodo (de la combinación seleccionada).
const dia = (iso) => Date.parse(`${String(iso).slice(0, 10)}T00:00:00Z`)
// La primera y la última vela de un activo en el periodo: las de sus métricas (primeraVela / ultimaVela, que salen de
// las velas del backtest sin calentamiento); si faltan, del año a año: el primer y el último año con velas.
export function velasDeActivo(m, desde = null) {
  if (m?.primeraVela) return { primera: String(m.primeraVela).slice(0, 10), ultima: m.ultimaVela ? String(m.ultimaVela).slice(0, 10) : null }
  const con = (m?.porAnio || []).filter(a => !a.sinDatos)
  if (!con.length) return null
  const a0 = con[0], a1 = con[con.length - 1]
  return { primera: a0.primeraVela || (desde && String(desde) > `${a0.anio}-01-01` ? String(desde).slice(0, 10) : `${a0.anio}-01-01`),
    ultima: a1.ultimaVela || `${a1.anio}-12-31` }
}
// Fracción del periodo analizado [Desde, fin] que cubren sus velas; fin = Hasta, sin pasar de la última vela de todos.
export function activosPocaHistoria({ seleccionada, periodo, tipoCagr = 'simple' }) {
  if (!seleccionada || !periodo?.desde) return []
  const vs = Object.entries(seleccionada.porActivo || {}).map(([s, m]) => ({ s, m, v: velasDeActivo(m, periodo.desde) })).filter(x => x.v)
  const ultimas = vs.map(x => x.v.ultima).filter(Boolean).sort()
  const finIso = [periodo.hasta, ultimas[ultimas.length - 1]].filter(Boolean).sort()[0]
  const ini = dia(periodo.desde), fin = finIso ? dia(finIso) : NaN
  if (!(fin > ini)) return []
  return vs.map(({ s, m, v }) => {
    const p = Math.max(ini, dia(v.primera)), u = Math.min(fin, v.ultima ? dia(v.ultima) : fin)
    return { s, primera: v.primera, cubre: Math.max(0, fin - p) / (fin - ini), anios: Math.max(0, u - p) / 86400000 / 365.25, cagr: agregable(cagrDeMetricas(m, tipoCagr)) }
  }).filter(x => x.cubre < U.historiaMin).sort((a, b) => a.cubre - b.cubre)
}
export function reglaHistoria({ pocaHistoria, seleccionada, claves }) {
  if (!seleccionada || !pocaHistoria?.length) return null
  const n = pocaHistoria.length
  return { id: 'R9', tipo: 'aviso',
    titulo: `${n} ${n === 1 ? 'activo tiene' : 'activos tienen'} poca historia en este periodo: su CAGR se calcula con pocos años y puede inflar o hundir la media.`,
    puntos: [`Seleccionada (${textoParams(seleccionada.params, claves)}): ${pocaHistoria.map(x => `${x.s}: desde ${fmtDate(x.primera)}, ${fmt(x.anios, 1)} años, CAGR ${pc(x.cagr)}`).join('; ')}.`,
      'Si la lista se formó con valores que ya sabías que habían subido, el resultado está inflado.'],
    umbral: `Umbral: sus velas cubren < ${fmt(U.historiaMin * 100, 0)} % del periodo analizado` }
}

// R4 · ¿Hay suficientes combinaciones válidas?
export function reglaValidas({ filas, valores }) {
  const total = (filas || []).length, val = validasDe(filas)
  if (!total || val.length >= total * U.validasMin) return null
  const variados = Object.keys(valores || {}).filter(k => valores[k].length > 1)
  const zona = variados.map(k => {
    const vs = [...new Set(val.map(f => f.params[k]))]
    if (!vs.length) return null
    if (vs.every(x => typeof x === 'number')) { const o = vs.sort((a, b) => a - b); return `${k} ${textoValor(o[0])}–${textoValor(o[o.length - 1])}` }
    return `${k} ${vs.map(textoValor).join(' / ')}`
  }).filter(Boolean)
  return { id: 'R4', tipo: 'aviso', titulo: `Solo ${val.length} de ${total} combinaciones son válidas (${fmt(val.length / total * 100, 0)} %).`,
    puntos: [val.length ? `Solo son válidas ${zona.join(' · ')}.` : 'Ninguna combinación es válida.',
      `Las demás se apartan por pocas operaciones (mínimo ${MIN_TOTAL} en total y ${MIN_POR_ACTIVO} en cada activo) o por no tener resultado.`],
    umbral: `Umbral: válidas < ${fmt(U.validasMin * 100, 0)} % de la rejilla` }
}

// R5 · Diario frente a semanal (solo comparando).
export function reglaTemporalidades({ comparar, nombre }) {
  if (!comparar) return null
  const [a, b] = Object.keys(comparar.porTemporalidad)
  const va = validasDe(comparar.porTemporalidad[a]), vb = validasDe(comparar.porTemporalidad[b])
  const puntos = []
  const menos = Math.min(va.length, vb.length), mas = Math.max(va.length, vb.length)
  let injusta = false
  if (mas > 0 && menos < mas * U.comparaValidas) {
    injusta = true
    const [tm, tM] = va.length < vb.length ? [a, b] : [b, a]
    puntos.push(`${tm[0].toUpperCase() + tm.slice(1)} tiene ${menos} combinaciones válidas frente a ${mas} de ${tM}: la comparación de la tarjeta de arriba no es del todo justa.`)
  }
  const claveB = new Map(vb.map(f => [claveCombinacion(f.params), f]))
  const pares = va.map(f => [f, claveB.get(claveCombinacion(f.params))]).filter(([, g]) => g)
  let titulo
  if (!pares.length) titulo = 'Diario y semanal no tienen combinaciones válidas en común: no se pueden comparar.'
  else {
    const ma = mediana(pares.map(([f]) => f.cagrMediana)), mb = mediana(pares.map(([, g]) => g.cagrMediana))
    const aa = mediana(pares.map(([f]) => f.winRateMediana)), ab = mediana(pares.map(([, g]) => g.winRateMediana))
    const dm = mb - ma, da = ab != null && aa != null ? ab - aa : 0
    puntos.push(`Sobre las ${pares.length} combinaciones válidas en las dos: ${nombre} ${a} ${pc(ma)} · ${b} ${pc(mb)}; % de acierto ${a} ${pc(aa, 1)} · ${b} ${pc(ab, 1)} (medianas).`)
    // La métrica: diferencia clara si ≥ 2 puntos o ≥ 20 % sobre la menor de las dos (en valor absoluto, si no es casi 0).
    const menor = Math.min(Math.abs(ma), Math.abs(mb)), rel = menor >= 0.01 ? Math.abs(dm) / menor : null
    const claraM = Math.abs(dm) >= U.comparaMetrica || (rel != null && rel >= U.comparaRelativo - 1e-9)   // (tolerancia de coma flotante)
    if (claraM || Math.abs(da) >= U.comparaAcierto) {
      const may = (t) => t[0].toUpperCase() + t.slice(1)
      const partes = []
      if (claraM) partes.push(`${may(dm >= 0 ? b : a)} sale mejor: ${pts(dm)} más de ${nombre}${rel != null ? ` (un ${fmt(rel * 100, 0)} % más)` : ''}`)
      if (Math.abs(da) >= U.comparaAcierto) partes.push(`${partes.length ? (da >= 0 ? b : a) : may(da >= 0 ? b : a)} acierta más: ${pts(da)} más de % de acierto`)
      titulo = partes.join('; ') + ' (medianas)' + (!claraM ? `, con un ${nombre} parecido: ${pts(dm)} de diferencia` : '') + '.'
    } else titulo = 'Diario y semanal salen parecidos.'
  }
  puntos.push('Las mismas velas no abarcan el mismo tiempo: 20 velas semanales son unas 20 semanas; 20 diarias, unas 4.')
  return { id: 'R5', tipo: injusta ? 'aviso' : 'info', titulo, puntos,
    umbral: `Umbral: diferencia de métrica ≥ ${fmt(U.comparaMetrica, 0)} puntos o ≥ ${fmt(U.comparaRelativo * 100, 0)} % sobre la menor, o ≥ ${fmt(U.comparaAcierto, 0)} puntos de acierto; válidas de una < ${fmt(U.comparaValidas * 100, 0)} % de las de la otra` }
}

// El walk-forward: años de prueba sin combinación válida (cuentan como 0 %), si es fiable y su veredicto.
export function veredictoWalkForward(wf, claves = []) {
  const r = wf?.resumen
  if (!r) return null
  const M = wf.prueba?.length || 0, N = wf.sinEleccion || 0
  const fiable = !(M > 0 && N >= U.wfSinEleccion * M)
  const veredicto = !fiable || r.wf == null ? null
    : r.referencia != null && r.wf <= r.referencia ? 'fija' : r.mediana != null && r.wf <= r.mediana ? 'azar' : 'reoptimizar'
  const referencia = wf.origenReferencia === 'guardada' ? 'guardada' : wf.origenReferencia === 'defecto' ? 'valores por defecto de la estrategia'
    : wf.referenciaParams ? `elegida en el walk-forward: ${textoParams(wf.referenciaParams, claves.length ? claves : Object.keys(wf.referenciaParams))}` : 'sin indicar'
  return { N, M, fiable, veredicto, referencia, resumen: r }
}

// R6 · ¿Compensa cambiar la guardada? (+ el veredicto del walk-forward si ya está calculado)
export function reglaCompensa({ filas, claveGuardada, claves, walkForward }) {
  const mejor = mejorDe(filas), g = (filas || []).find(f => claveCombinacion(f.params) === claveGuardada)
  if (!mejor || !g || !g.cuenta || g.cagrMediana == null || validasDe(filas).length < 2) return null   // con una sola válida no hay alternativa
  const d = mejor.cagrMediana - g.cagrMediana
  const puntos = [`Mejor válida (${textoParams(mejor.params, claves)}): ${pc(mejor.cagrMediana)}; guardada: ${pc(g.cagrMediana)}.`]
  const v = veredictoWalkForward(walkForward, claves)
  if (v) {
    const r = v.resumen
    puntos.push(`Walk-forward (cada año se elige solo con el pasado): ${pc(r.wf)} frente a ${pc(r.referencia)} de la referencia fija (${v.referencia}) y ${pc(r.mediana)} de la mediana de la rejilla; eficiencia ${r.eficiencia == null ? '—' : nu(r.eficiencia)}.`)
    puntos.push(`${v.N} de ${v.M} años sin combinación válida (cuentan como 0 %).`)
    puntos.push(!v.fiable ? 'El walk-forward no es fiable aquí: en muchos años no había combinaciones con operaciones suficientes.'
      : v.veredicto === 'fija' ? `Reoptimizar no supera a la referencia fija: quédate con la fija (${v.referencia}).`
      : v.veredicto === 'azar' ? 'Reoptimizar supera a la referencia fija, pero no a elegir al azar (la mediana de la rejilla).'
      : 'El walk-forward respalda reoptimizar: supera a la referencia fija y a elegir al azar.')
  }
  const umbral = `Umbral: ${fmt(U.compensaPuntos, 0)} puntos` + (v ? `; walk-forward no fiable si ≥ ${fmt(U.wfSinEleccion * 100, 0)} % de los años de prueba no tienen combinación válida` : '')
  if (d < U.compensaPuntos) return { id: 'R6', tipo: 'bien', diferencia: d, titulo: mejor === g ? 'La configuración guardada es la mejor válida de la rejilla.' : `La mejor solo supera a la guardada en ${pts(d)}, dentro de muestra: no compensa cambiarla.`, puntos, umbral }
  return { id: 'R6', tipo: 'info', diferencia: d, titulo: `Diferencia notable (${pts(d)}), pero dentro de muestra: compruébala en Dentro/fuera y Walk-forward antes de cambiar.`, puntos, umbral }
}

// R7 · Avisos de forma de la mejor: en el borde de la rejilla, pico aislado, pocas operaciones.
export function reglaForma({ filas, valores, claves }) {
  const mejor = mejorDe(filas)
  if (!mejor) return null
  const variados = Object.keys(valores || {}).filter(k => valores[k].length > 1)
  const existe = new Set((filas || []).map(f => claveCombinacion(f.params)))
  const bordes = []
  for (const k of variados) {
    const l = valores[k], i = l.indexOf(mejor.params[k])
    for (const [j, lado] of [[i - 1, 'abajo'], [i + 1, 'arriba']]) {
      if (j < 0 || j >= l.length) bordes.push(`${k} por ${lado} (${textoValor(mejor.params[k])} es el ${lado === 'abajo' ? 'primer' : 'último'} valor)`)
      else if (!existe.has(claveCombinacion({ ...mejor.params, [k]: l[j] }))) bordes.push(`${k} por ${lado} (la combinación vecina es imposible)`)
    }
  }
  const est = variados.length ? estabilidad(mejor, filas, valores, 'cagrMediana') : null
  const limPico = mejor.cagrMediana - Math.max(U.picoPuntos, U.picoRelativo * Math.abs(mejor.cagrMediana))
  const pico = est && est.mediaVecinas != null && est.mediaVecinas < limPico
  const ops = mediana(Object.values(mejor.porActivo || {}).map(m => m.operaciones))
  const pocas = ops != null && ops < U.operacionesMin
  const puntos = []
  if (bordes.length) puntos.push(`Está en el borde de la rejilla por ${bordes.join(' y ')}: amplía el rango en esa dirección.`)
  if (pico) puntos.push(`Pico aislado: sus vecinas dan de media ${pc(est.mediaVecinas)} frente a su ${pc(mejor.cagrMediana)}.`)
  if (pocas) puntos.push(`Pocas operaciones: mediana de ${fmt(ops, 0)} por activo.`)
  const umbral = `Umbrales: pico si sus vecinas < mejor − máx(${fmt(U.picoPuntos, 0)} puntos, ${fmt(U.picoRelativo * 100, 0)} %); pocas operaciones si mediana por activo < ${U.operacionesMin}`
  if (!puntos.length && !variados.length) return null   // rejilla de un solo valor: sin vecinas ni bordes que mirar
  const nombreMejor = textoParams(mejor.params, claves)
  if (!puntos.length) return { id: 'R7', tipo: 'bien', borde: false, pico: false, pocas: false, titulo: `La mejor (${nombreMejor}) no muestra señales raras: está dentro de la rejilla, sus vecinas rinden parecido y opera lo suficiente.`,
    puntos: est?.mediaVecinas != null ? [`Sus vecinas dan de media ${pc(est.mediaVecinas)} frente a su ${pc(mejor.cagrMediana)}; mediana de ${fmt(ops, 0)} operaciones por activo.`] : [], umbral }
  return { id: 'R7', tipo: 'aviso', borde: bordes.length > 0, pico, pocas, titulo: `Cuidado con la mejor (${nombreMejor}).`, puntos, umbral }
}

// R10 · ¿Supera al azar? La prueba contra el azar de la seleccionada (entradas al azar en los mismos activos y fechas,
// con las mismas duraciones), cuando está calculada en esta temporalidad. Siempre con el CAGR simple.
export function reglaAzar({ azar, seleccionada, claves }) {
  const g = azar?.global
  if (!seleccionada || !g || g.percentil == null) return null
  const conV = Object.values(azar.porActivo || {}).filter(x => x.veredicto)
  const n = (v) => conV.filter(x => x.veredicto === v).length
  const gc = g.caida
  return { id: 'R10', tipo: g.veredicto === 'supera' ? 'bien' : g.veredicto === 'algo' ? 'info' : 'aviso', veredicto: g.veredicto, percentil: g.percentil,
    veredictoCaida: gc?.veredicto || null, percentilCaida: gc?.percentil ?? null,
    titulo: `${TEXTO_VEREDICTO[g.veredicto]} (percentil ${fmt(g.percentil, 1)} de ${fmt(azar.nSim, 0)} simulaciones).`,
    puntos: [`Seleccionada (${textoParams(seleccionada.params, claves)}): CAGR simple ${pc(g.real)} (mediana entre activos) frente a una mediana del azar de ${pc(g.mediana)}; el azar va de ${pc(g.p5)} a ${pc(g.p95)} (P5–P95).`,
      `Por activo (con al menos ${AZAR.minOperaciones} operaciones): ${n('supera')} superan al azar, ${n('algo')} algo mejor, ${n('igual')} no se distinguen, ${n('algoPeor')} algo peor y ${n('peor')} peor, de ${conV.length}.`,
      ...(gc?.percentil != null ? [`Caída máxima (mediana entre activos): ${pc(gc.real)} frente a ${pc(gc.mediana)} del azar (P5–P95 de ${pc(gc.p5)} a ${pc(gc.p95)}); percentil ${fmt(gc.percentil, 1)}: ${TEXTO_VEREDICTO_CAIDA[gc.veredicto].toLowerCase()}.`] : []),
      'Aproximación: el azar entra y sale en aperturas; la estrategia real puede salir por stop dentro de la vela.'],
    umbral: `Umbral: supera si percentil ≥ ${AZAR.supera}; algo mejor si ${AZAR.algoMejor}–${AZAR.supera}; no se distingue si ${AZAR.algoPeor}–${AZAR.algoMejor}; algo peor si ${AZAR.peor}–${AZAR.algoPeor}; peor si < ${AZAR.peor} (lo mismo para la caída)` }
}

// R11 · Calidad de las entradas: el Edge Ratio de la seleccionada contra entradas al azar, por N, si está calculado.
const TRAMOS_EDGE = [['supera', 'supera al azar'], ['algo', 'algo mejor'], ['igual', 'no se distingue'], ['algoPeor', 'algo peor'], ['peor', 'peor que el azar']]
export function reglaEdge({ edge, seleccionada }) {
  const f = (edge?.filas || []).filter(x => x.percentil != null)
  if (!seleccionada || !f.length) return null
  const de = (v) => f.filter(x => x.veredicto === v).map(x => x.N)
  const plazo = (ns) => { const c = ns.some(N => N <= EDGE_CORTO_MAX), l = ns.some(N => N > EDGE_CORTO_MAX); return c && l ? 'corto y largo' : c ? 'corto' : 'largo' }
  const sup = de('supera'), peor = de('peor')
  // V9.994: con resultados MIXTOS (mejores que el azar en unos N y peores en otros) el título lo dice; antes solo destacaba
  // lo bueno.
  const mixto = sup.length && peor.length
  const titulo = mixto ? `Resultados mixtos: las entradas son mejores que el azar a ${plazo(sup)} plazo (N = ${sup.join(', ')}) y peores a ${plazo(peor)} plazo (N = ${peor.join(', ')}).`
    : sup.length ? `Las entradas son mejores que el azar a ${plazo(sup)} plazo.`
    : peor.length ? `Las entradas son peores que el azar a ${plazo(peor)} plazo.` : 'Las entradas no se distinguen del azar.'
  const linea = TRAMOS_EDGE.map(([v, t]) => [t, de(v)]).filter(([, ns]) => ns.length).map(([t, ns]) => `${t} en N = ${ns.join(', ')}`).join('; ')
  return { id: 'R11', tipo: mixto ? 'aviso' : sup.length ? 'bien' : peor.length ? 'aviso' : 'info', titulo,
    puntos: [`Edge Ratio de las entradas (MFE / MAE en ATR, contra entradas al azar en los mismos activos y fechas): ${linea[0].toUpperCase() + linea.slice(1)}.`,
      `Real frente a la mediana del azar: ${f.map(x => `N ${x.N} ${nu(x.real)} / ${nu(x.mediana)}`).join(' · ')} (${fmt(edge.nSim, 0)} simulaciones).`],
    umbral: `Umbral: supera si percentil ≥ ${AZAR.supera}; algo mejor si ${AZAR.algoMejor}–${AZAR.supera}; no se distingue si ${AZAR.algoPeor}–${AZAR.algoMejor}; algo peor si ${AZAR.peor}–${AZAR.algoPeor}; peor si < ${AZAR.peor}; corto plazo N ≤ ${EDGE_CORTO_MAX}` }
}

// R8 · «En la práctica»: dos frases como máximo.
//   A (la señal frente a los activos): con la prueba contra el azar calculada (R10), su veredicto. Si no: R1 plano (sin
//     rejilla estrecha) o R9 → la prueba contra el azar; si no, R7 con pico aislado o borde → revisa la zona. Si no se
//     cumple nada, no hay frase A.
//   B (la configuración): el veredicto del walk-forward si está calculado y es fiable; si no, R6 (diciendo que el
//     walk-forward no es fiable cuando lo está calculado pero no lo es); sin R6, «Sin señales claras».
const FRASE_AZAR = {
  supera: 'La señal aporta: supera a entrar al azar en estos mismos activos.',
  algo: 'La señal aporta poco: algo mejor que el azar, sin ser concluyente.',
  igual: 'La estrategia no se distingue de entrar al azar: el resultado viene de los activos.',
  algoPeor: 'La estrategia lo hace algo peor que entrar al azar, sin ser concluyente.',
  peor: 'La estrategia lo hace peor que entrar al azar en estos mismos activos.',
}
export function enLaPractica(lista, wf = null) {
  const r = (id) => lista.find(c => c.id === id)
  const r10 = r('R10')
  // No se distingue en el CAGR, pero cae menos que el azar (caída ≥ 95): su valor estaría en el control del riesgo.
  const A = r10 ? (r10.veredicto === 'igual' && r10.veredictoCaida === 'supera' ? 'No gana más que el azar, pero cae menos: su valor estaría en el control del riesgo.' : FRASE_AZAR[r10.veredicto])
    : r('R1')?.plano || r('R9') ? 'Aún no está claro si la estrategia aporta o son los activos: la prueba contra el azar lo aclarará.'
    : r('R7')?.pico || r('R7')?.borde ? 'La mejor no es fiable todavía: revisa la zona.' : null
  const r6 = r('R6')
  const segunR6 = !r6 ? null : r6.diferencia < U.compensaPuntos ? 'Mantén la configuración guardada.' : 'Hay una zona prometedora: valídala fuera de muestra.'
  let B
  if (wf?.fiable && wf.veredicto === 'fija') B = `Mantén la configuración fija (${wf.referencia}): en el walk-forward, reoptimizar no la supera.`
  else if (wf?.fiable && wf.veredicto === 'azar') B = `No compensa reoptimizar: en el walk-forward supera a la fija (${wf.referencia}), pero no a elegir al azar.`
  else if (wf?.fiable && wf.veredicto === 'reoptimizar') B = 'El walk-forward respalda reoptimizar: valida la zona fuera de muestra antes de cambiar.'
  else if (wf && !wf.fiable) B = `El walk-forward no es fiable aquí (${wf.N} de ${wf.M} años sin combinación válida)` + (segunR6 ? `; dentro de muestra: ${segunR6[0].toLowerCase() + segunR6.slice(1)}` : '.')
  else B = segunR6 || (A ? null : 'Sin señales claras; revisa Dentro/fuera y Walk-forward.')
  const frases = [A, B].filter(Boolean)
  return { frases, texto: frases.join(' ') }
}

export function conclusiones({ filas, valores, claveGuardada, seleccionada = null, tipoCagr = 'simple', comparar = null, walkForward = null, periodo = null, azar = null, edge = null }) {
  const nombre = NOMBRES_CAGR[tipoCagr] || 'CAGR'
  const claves = Object.keys(valores || {}).filter(k => valores[k].length > 1)
  const ctx = { filas, valores, claveGuardada, seleccionada, tipoCagr, comparar, walkForward, azar, edge, nombre, claves: claves.length ? claves : Object.keys(valores || {}),
    pocaHistoria: activosPocaHistoria({ seleccionada, periodo, tipoCagr }) }
  const lista = [reglaImporta(ctx), reglaAzar(ctx), reglaEdge(ctx), reglaGuardada(ctx), reglaSesgo(ctx), reglaHistoria(ctx), reglaValidas(ctx), reglaTemporalidades(ctx), reglaCompensa(ctx), reglaForma(ctx)].filter(Boolean)
  return { lista, enLaPractica: enLaPractica(lista, veredictoWalkForward(walkForward, ctx.claves)) }
}
