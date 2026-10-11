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
//   walkForward    el resultado de walkForward en esta temporalidad si ya está calculado, o null
// Sale { lista: [{ id, tipo: 'info' | 'aviso' | 'bien', titulo, puntos[], umbral }], enLaPractica: { id, texto } }.
import { fmt } from './utils'
import { mediana, media, ordenaFilas, estabilidad, claveCombinacion, cagrDeMetricas, NOMBRES_CAGR, MIN_TOTAL, MIN_POR_ACTIVO } from './optimizacion'
import { percentil, rangoRelativo } from './robustez'

// ── Umbrales (PROVISIONALES: se ajustarán con el uso) ──────────────────────────────────────────────────────────────
export const UMBRALES = {
  rangoPlano: 0.30,          // R1: rango relativo por debajo → el resultado casi no depende del parámetro
  rangoAlto: 0.80,           // R1: por encima → el parámetro importa mucho
  parametroCasiNada: 0.25,   // R1: un parámetro «casi no pesa» si su rango es < 25 % del rango del que más pesa
  percentilBajo: 25,         // R2: la guardada «por debajo» de la rejilla
  percentilAlto: 75,         // R2: «por encima»
  sesgoPuntos: 5,            // R3: media − mediana > máx(5 puntos, 25 % de |mediana|)…
  sesgoRelativo: 0.25,
  sesgoMinActivos: 5,        // R3: …con al menos 5 activos
  validasMin: 0.50,          // R4: aviso si las válidas son < 50 % de la rejilla
  comparaValidas: 0.60,      // R5: las válidas de una temporalidad < 60 % de las de la otra
  comparaMetrica: 2,         // R5: diferencia de la mediana de la métrica, en puntos
  comparaAcierto: 5,         // R5: diferencia de la mediana del % de acierto, en puntos
  compensaPuntos: 3,         // R6: mejor válida − guardada
  picoPuntos: 2,             // R7: pico aislado si la media de sus vecinas < mejor − máx(2 puntos, 15 % de |mejor|)
  picoRelativo: 0.15,
  operacionesMin: 10,        // R7: pocas operaciones si la mediana de operaciones por activo < 10
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
  const umbral = `Umbral: rango relativo < ${nu(U.rangoPlano)} (casi no depende) o > ${nu(U.rangoAlto)} (importa mucho)`
  if (rr != null && rr < U.rangoPlano) return { id: 'R1', tipo: 'aviso', plano: true, rr, titulo: `El resultado casi no depende del parámetro (de ${pc(p10)} a ${pc(p90)}).`,
    puntos: [...puntos, 'Cuando cualquier valor da casi lo mismo, el resultado puede venir más de los activos que de la señal. Si la lista se formó con valores que ya sabías que habían subido, el resultado está inflado.'], umbral }
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
  const per = otras.length ? (otras.filter(x => x < g.cagrMediana).length + 0.5 * otras.filter(x => x === g.cagrMediana).length) / otras.length * 100 : 50
  const med = mediana(validasDe(filas).map(f => f.cagrMediana))
  const zona = per < U.percentilBajo ? 'por debajo' : per > U.percentilAlto ? 'por encima' : 'en la zona media'
  return { id: 'R2', tipo: per < U.percentilBajo ? 'aviso' : per > U.percentilAlto ? 'bien' : 'info', percentil: per,
    titulo: `La configuración guardada queda ${zona} de la rejilla (percentil ${fmt(per, 0)}).`,
    puntos: [`Guardada (${textoParams(g.params, claves)}): ${pc(g.cagrMediana)} frente a una mediana de la rejilla de ${pc(med)}.`], umbral }
}

// R3 · ¿Unos pocos activos tiran del resultado? (la combinación seleccionada)
export function reglaSesgo({ seleccionada, tipoCagr, claves }) {
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
    puntos: [`Seleccionada (${textoParams(seleccionada.params, claves)}), ${vals.length} activos. Los que más se alejan ${arriba ? 'por arriba' : 'por abajo'}: ${lejos.map(([s, v]) => `${s} ${pc(v)}`).join(', ')}.`], umbral }
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
    if (Math.abs(dm) >= U.comparaMetrica || Math.abs(da) >= U.comparaAcierto) {
      const may = (t) => t[0].toUpperCase() + t.slice(1)
      const partes = []
      if (Math.abs(dm) >= U.comparaMetrica) partes.push(`${may(dm >= 0 ? b : a)} sale mejor: ${pts(dm)} más de ${nombre}`)
      if (Math.abs(da) >= U.comparaAcierto) partes.push(`${partes.length ? (da >= 0 ? b : a) : may(da >= 0 ? b : a)} acierta más: ${pts(da)} más de % de acierto`)
      titulo = partes.join('; ') + ' (medianas)' + (Math.abs(dm) < U.comparaMetrica ? `, con un ${nombre} parecido: ${pts(dm)} de diferencia` : '') + '.'
    } else titulo = 'Diario y semanal salen parecidos.'
  }
  puntos.push('Las mismas velas no abarcan el mismo tiempo: 20 velas semanales son unas 20 semanas; 20 diarias, unas 4.')
  return { id: 'R5', tipo: injusta ? 'aviso' : 'info', titulo, puntos,
    umbral: `Umbral: diferencia ≥ ${fmt(U.comparaMetrica, 0)} puntos de métrica o ≥ ${fmt(U.comparaAcierto, 0)} de acierto; válidas de una < ${fmt(U.comparaValidas * 100, 0)} % de las de la otra` }
}

// R6 · ¿Compensa cambiar la guardada? (+ el veredicto del walk-forward si ya está calculado)
export function reglaCompensa({ filas, claveGuardada, claves, walkForward }) {
  const mejor = mejorDe(filas), g = (filas || []).find(f => claveCombinacion(f.params) === claveGuardada)
  if (!mejor || !g || !g.cuenta || g.cagrMediana == null) return null
  const d = mejor.cagrMediana - g.cagrMediana
  const puntos = [`Mejor válida (${textoParams(mejor.params, claves)}): ${pc(mejor.cagrMediana)}; guardada: ${pc(g.cagrMediana)}.`]
  const r = walkForward?.resumen
  if (r) {
    puntos.push(`Walk-forward (cada año se elige solo con el pasado): ${pc(r.wf)} frente a ${pc(r.referencia)} de la referencia fija y ${pc(r.mediana)} de la mediana de la rejilla; eficiencia ${r.eficiencia == null ? '—' : nu(r.eficiencia)}.`)
    puntos.push(r.wf != null && r.referencia != null && r.wf <= r.referencia ? 'Reoptimizar no supera a la referencia fija: quédate con la fija.'
      : r.wf != null && r.mediana != null && r.wf <= r.mediana ? 'Reoptimizar supera a la referencia fija, pero no a elegir al azar (la mediana de la rejilla).'
      : 'El walk-forward respalda reoptimizar: supera a la referencia fija y a elegir al azar.')
  }
  const umbral = `Umbral: ${fmt(U.compensaPuntos, 0)} puntos`
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
  const nombreMejor = textoParams(mejor.params, claves)
  if (!puntos.length) return { id: 'R7', tipo: 'bien', borde: false, pico: false, pocas: false, titulo: `La mejor (${nombreMejor}) no muestra señales raras: está dentro de la rejilla, sus vecinas rinden parecido y opera lo suficiente.`,
    puntos: est?.mediaVecinas != null ? [`Sus vecinas dan de media ${pc(est.mediaVecinas)} frente a su ${pc(mejor.cagrMediana)}; mediana de ${fmt(ops, 0)} operaciones por activo.`] : [], umbral }
  return { id: 'R7', tipo: 'aviso', borde: bordes.length > 0, pico, pocas, titulo: `Cuidado con la mejor (${nombreMejor}).`, puntos, umbral }
}

// R8 · «En la práctica»: UNA frase, la de mayor prioridad que se cumpla.
export function enLaPractica(lista) {
  const r = (id) => lista.find(c => c.id === id)
  // (Hueco para la Fase 4: una regla «¿supera al azar?» irá aquí, con la prioridad que se decida.)
  if (r('R1')?.plano) return { id: 'R1', texto: 'Esto dice más de los activos que de la estrategia: la prueba contra el azar lo aclarará.' }
  if (r('R7')?.pico || r('R7')?.borde) return { id: 'R7', texto: 'La mejor no es fiable todavía: revisa la zona.' }
  const r6 = r('R6')
  if (r6 && r6.diferencia < U.compensaPuntos) return { id: 'R6', texto: 'Mantén la configuración guardada.' }
  if (r6) return { id: 'R6', texto: 'Hay una zona prometedora: valídala fuera de muestra.' }
  return { id: 'ninguna', texto: 'Sin señales claras; revisa Dentro/fuera y Walk-forward.' }
}

export function conclusiones({ filas, valores, claveGuardada, seleccionada = null, tipoCagr = 'simple', comparar = null, walkForward = null }) {
  const nombre = NOMBRES_CAGR[tipoCagr] || 'CAGR'
  const claves = Object.keys(valores || {}).filter(k => valores[k].length > 1)
  const ctx = { filas, valores, claveGuardada, seleccionada, tipoCagr, comparar, walkForward, nombre, claves: claves.length ? claves : Object.keys(valores || {}) }
  const lista = [reglaImporta(ctx), reglaGuardada(ctx), reglaSesgo(ctx), reglaValidas(ctx), reglaTemporalidades(ctx), reglaCompensa(ctx), reglaForma(ctx)].filter(Boolean)
  return { lista, enLaPractica: enLaPractica(lista) }
}
