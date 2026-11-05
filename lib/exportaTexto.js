// lib/exportaTexto.js — «📋 Copiar para Claude»: el texto en Markdown compacto (tablas Markdown, coma decimal) de los
// resultados del optimizador y del multibacktest. Puro: da formato a los MISMOS objetos que pinta la pantalla (filas,
// conclusiones, robustez, walk-forward, pruebas contra el azar…) o a las celdas ya pintadas; no recalcula nada.
// Sin gráficos: de cada histograma basta con real, mediana, P5–P95 y percentil.
import { fmt } from './utils'
import { TEXTO_VEREDICTO, TEXTO_VEREDICTO_CAIDA } from './azar'
import { normalizaFiltrosEntrada, filtrosActivos } from './filtros'
import { resumenCurva } from './respuestaMc'
import { notaTemporalidad } from './condicionesSimulacion'
import { veredictoLab } from './laboratorio'
import { fraseRegla, fraseSalidas, fraseEntrada } from './senales'
import { veredictoOficial, notaResimulado, criterioDePrueba, CRITERIOS, textoCriterio, NOTA_PERMUTACION, calibracionDe, calibracionLote } from './lotesLab'

const NC = 'no calculado'
export const num = (v, d = 2) => v == null || !Number.isFinite(Number(v)) ? '—' : fmt(Number(v), d)
export const pct = (v, d = 2) => v == null || !Number.isFinite(Number(v)) ? '—' : fmt(Number(v), d, ' %')
const celda = (x) => x == null || x === '' ? '—' : String(x).replace(/\|/g, '/').replace(/\s*\n\s*/g, ' ').trim() || '—'
const valorParam = (v) => typeof v === 'number' ? fmt(v, Number.isInteger(v) ? 0 : 2) : v === true ? 'sí' : v === false ? 'no' : String(v)
export const textoParams = (p) => p ? Object.entries(p).map(([k, v]) => `${k} ${valorParam(v)}`).join(' · ') : '—'

// Tabla Markdown. `filas`: arrays de celdas (cualquier valor; null/'' → «—»).
export function tablaMd(cabeceras, filas) {
  if (!filas?.length) return '(sin filas)'
  const linea = (cs) => `| ${cs.map(celda).join(' | ')} |`
  return [linea(cabeceras), `|${cabeceras.map(() => '---').join('|')}|`, ...filas.map(linea)].join('\n')
}
const seccion = (titulo, cuerpo) => `## ${titulo}\n\n${cuerpo == null || cuerpo === '' ? NC : cuerpo}`

// Cabecera común: título, versión, fecha y una lista de pares [etiqueta, valor] (se omiten los vacíos).
export function cabeceraMd({ titulo, version, fecha, datos = [] }) {
  const lineas = datos.filter(([, v]) => v != null && v !== '' && !(Array.isArray(v) && !v.length))
    .map(([k, v]) => `- ${k}: ${Array.isArray(v) ? v.join('; ') : v}`)
  return [`# ${titulo}`, [`Trading Simulator${version ? ` ${version}` : ''}`, fecha].filter(Boolean).join(' · '), '', ...lineas].join('\n')
}
export const textoComisiones = (c) => c ? `compra ${num(c.compra)} €, venta ${num(c.venta)} €, ${num(c.porcentaje)} % por operación` : '—'
export const textoPeriodo = (desde, hasta) => `${fechaEs(desde)} → ${fechaEs(hasta)}`
export function fechaEs(iso) { if (!iso) return '—'; const s = String(iso).slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : s }

// ── Piezas comunes ─────────────────────────────────────────────────────────────────────────────────────────────────
// Resumen de una distribución del azar (resumenAzar / resumenCaida de lib/azar.js): real, mediana, P5–P95, percentil.
const filaAzar = (nombre, r, f, textos) => !r ? [nombre, '—', '—', '—', '—', NC]
  : [nombre, f(r.real), f(r.mediana), r.p5 == null ? '—' : `${f(r.p5)} – ${f(r.p95)}`, r.percentil == null ? '—' : num(r.percentil, 1),
    textos ? (r.veredicto ? textos[r.veredicto] : '—') : 'solo informativo']
const CAB_AZAR = ['Medida', 'Real', 'Mediana del azar', 'P5–P95 del azar', 'Percentil', 'Veredicto']

export function conclusionesMd(c) {
  if (!c?.lista) return null
  const icono = { info: 'ℹ', aviso: '⚠', bien: '✓' }
  const bloques = c.lista.map(x => [`- ${icono[x.tipo] || '·'} **${x.titulo}**`, ...(x.puntos || []).map(p => `  - ${p}`), x.umbral ? `  - _${x.umbral}_` : null].filter(Boolean).join('\n'))
  return [...bloques, '', `**En la práctica:** ${c.enLaPractica?.texto || '—'}`].join('\n')
}

// ── Optimizador ───────────────────────────────────────────────────────────────────────────────────────────────────
// d = { cabecera (para cabeceraMd), rejilla {param: valores}, combinaciones, metrica, comparacion [{ tp, resumen }],
//       conclusiones, seleccionada (fila de agregaOptimizacion) + guardada, robustez (calculaRobustez), walkForward,
//       azar (resultado de la prueba contra el azar), edge (resultado del Edge Ratio) }; las no calculadas, null.
export function textoOptimizacion(d) {
  const partes = [cabeceraMd(d.cabecera)]
  partes.push(seccion('Rejilla', d.rejilla ? [
    tablaMd(['Parámetro', 'Valores'], Object.entries(d.rejilla).map(([k, v]) => [k, v.length > 12 ? `${valorParam(v[0])} … ${valorParam(v[v.length - 1])} (${v.length} valores)` : v.map(valorParam).join(', ')])),
    '', `Combinaciones: ${d.combinaciones ?? '—'} · métrica principal: ${d.metrica || '—'}`].join('\n') : null))
  if (d.comparacion) partes.push(seccion('Comparación de temporalidades', tablaMd(['Temporalidad', 'Válidas', 'Mejor válida', 'Su métrica', 'Mediana de las válidas', 'Guardada'],
    d.comparacion.map(({ tp, resumen: r }) => [tp, `${r.validas} de ${r.total}`, r.mejor ? textoParams(r.mejor.params) : '—', pct(r.mejor?.cagrMediana), pct(r.medianaValidas),
      !r.guardada ? 'no está en la rejilla' : r.guardada.cuenta ? pct(r.guardada.cagrMediana) : `no válida (${r.guardada.motivo || 'sin resultado'})`]))))
  partes.push(seccion('Conclusiones', conclusionesMd(d.conclusiones)))
  const f = d.seleccionada
  partes.push(seccion('Combinación seleccionada', f ? [
    `${textoParams(f.params)}${d.esGuardada ? ' (★ la configuración guardada)' : ''}${f.temporalidad ? ` · ${f.temporalidad}` : ''}`, '',
    tablaMd([`${d.metrica || 'CAGR'} · mediana`, '· media', 'DD mediana', 'DD peor', 'Ops.', 'Activos +', 'F. benef.', 'T. invert.', '% acierto · mediana', 'Válida'],
      [[pct(f.cagrMediana), pct(f.cagrMedia), pct(f.ddMediana), pct(f.ddPeor), num(f.operaciones, 0), `${f.activosPositivos ?? '—'}/${f.activos ?? '—'}`, num(f.factorBeneficio),
        pct(f.tiempoInvertido, 0), pct(f.winRateMediana, 1), f.cuenta ? 'sí' : `no (${f.motivo || 'sin resultado'})`]]),
    '', '**Año a año** (mediana y media entre activos, valorado a fin de año)', '',
    tablaMd(['Año', 'Mediana', 'Media', 'Operaciones'], (f.porAnio || []).map(a => [`${a.anio}${a.sinDatos ? ' (sin datos)' : a.parcial ? ' (parcial)' : ''}`, pct(a.mediana), pct(a.media), num(a.operaciones, 0)])),
    '', '**Desglose por activo**', '',
    tablaMd(['Activo', 'Ops.', 'CAGR simple', 'CAGR compuesto', 'Max DD', '% acierto', 'F. benef.'],
      Object.entries(f.porActivo || {}).map(([s, m]) => [s, num(m.operaciones, 0), pct(m.cagr), pct(m.cagrCompuesto), pct(m.maxDD), pct(m.winRate, 1), num(m.factorBeneficio)])),
  ].join('\n') : 'ninguna seleccionada'))
  partes.push(seccion('Dentro / fuera de muestra', robustezMd(d.robustez)))
  partes.push(seccion('Walk-forward', walkForwardMd(d.walkForward)))
  partes.push(seccion('Prueba contra el azar (combinación seleccionada)', azarMd(d.azar)))
  partes.push(seccion('Calidad de las entradas (Edge Ratio)', edgeMd(d.edge)))
  return partes.join('\n\n') + '\n'
}

export function robustezMd(r) {
  if (!r) return null
  if (r.insuficiente) return `Años con datos insuficientes (${r.anios?.length ?? 0}).`
  const dentro = r.anios.filter(a => a.anio < r.corte).map(a => a.anio), fuera = r.anios.filter(a => a.anio >= r.corte).map(a => a.anio)
  const tr = (v) => v.length ? `${v[0]}–${v[v.length - 1]}` : '—'
  const fi = r.ficha, m = r.metricas || {}
  const puesto = (p, b) => p?.puesto ? `${p.puesto} de ${p.de}` : `no válida (${b?.motivo || '—'})`
  return [`Dentro ${tr(dentro)} · fuera ${tr(fuera)} · corte ${r.corte} · criterio ${r.criterio}`,
    fi ? `Elegida con los datos de dentro: ${textoParams(fi.params)}` : (r.rejillaPequena ? 'Rejilla demasiado pequeña para medir meseta.' : 'Ninguna combinación válida dentro.'),
    ...(fi ? ['', tablaMd(['', 'Dentro', 'Fuera'], [['CAGR simple · mediana', pct(fi.dentro.cagrMediana), pct(fi.fuera.cagrMediana)], ['Puesto', puesto(fi.puestoDentro, fi.dentro), puesto(fi.puestoFuera, fi.fuera)],
      ['Operaciones', num(fi.dentro.operaciones, 0), num(fi.fuera.operaciones, 0)], ['% acierto · mediana', pct(fi.dentro.winRateMediana, 1), pct(fi.fuera.winRateMediana, 1)]]),
      '', `Degradación (fuera / dentro): ${fi.degradacion == null ? '—' : pct(fi.degradacion, 0)}`] : []),
    `Spearman dentro / fuera: ${num(m.rho)} (${m.n ?? '—'} combinaciones) · rango fuera P10–P90: ${pct(m.p10Fuera)} – ${pct(m.p90Fuera)} (relativo ${num(m.rangoRelativo)})`].join('\n')
}

export function walkForwardMd(w) {
  if (!w?.resumen) return null
  const r = w.resumen
  const ref = w.origenReferencia === 'guardada' ? 'guardada' : w.origenReferencia === 'defecto' ? 'valores por defecto de la estrategia' : w.referenciaParams ? textoParams(w.referenciaParams) : '—'
  return [`Años de prueba: ${w.prueba?.length ? `${w.prueba[0]}–${w.prueba[w.prueba.length - 1]}` : '—'} · ${w.sinEleccion ?? 0} de ${w.prueba?.length ?? 0} sin combinación válida (cuentan como 0 %) · referencia fija: ${ref}`, '',
    tablaMd(['', 'CAGR simple'], [['Walk-forward', pct(r.wf)], ['Referencia fija', pct(r.referencia)], ['Mediana de la rejilla', pct(r.mediana)], ['Oráculo (mejor de cada año, a posteriori)', pct(r.oraculo)]]),
    '', `Eficiencia: ${num(r.eficiencia)} · supera a la referencia ${r.superaReferencia ? `${r.superaReferencia.gana} de ${r.superaReferencia.de}` : '—'} años · a la mediana ${r.superaMediana ? `${r.superaMediana.gana} de ${r.superaMediana.de}` : '—'}`, '',
    tablaMd(['Año', 'Elegida', 'WF', 'Referencia', 'Mediana', 'Oráculo'],
      (w.anios || []).map(f => [f.anio?.anio ?? f.anio, f.elegida ? textoParams(f.elegida.params) : `sin elección (${f.sinEleccion || '—'})`, pct(f.wf), pct(f.referencia), pct(f.mediana), pct(f.oraculo)]))].join('\n')
}

// Prueba contra el azar del optimizador (lib/azar.js): global, caída y por activo.
export function azarMd(a) {
  if (!a?.global) return null
  const g = a.global, c = g.caida
  const cuenta = (r) => r?.cuenta ? ` (por debajo ${r.cuenta.debajo}, iguales ${r.cuenta.iguales}, por encima ${r.cuenta.encima})` : ''
  return [`${num(a.nSim, 0)} simulaciones${a.semilla != null ? ` · semilla ${a.semilla}` : ''} · ${g.activos ?? '—'} activos · CAGR simple; la caída, igual para la estrategia y el azar (curva simple al cierre).`, '',
    tablaMd(CAB_AZAR, [filaAzar('CAGR simple (mediana entre activos)', g, pct, TEXTO_VEREDICTO), filaAzar('Caída máxima (mediana entre activos)', c, pct, TEXTO_VEREDICTO_CAIDA)]),
    `Recuento del CAGR${cuenta(g)}.`, '',
    tablaMd(['Activo', 'Ops.', 'Real', 'Mediana del azar', 'Percentil', 'Veredicto', 'Caída real', 'Caída del azar', 'Percentil caída'],
      Object.entries(a.porActivo || {}).map(([s, x]) => x.error ? [s, '—', '—', '—', '—', `sin datos: ${x.error}`, '—', '—', '—']
        : [s + (a.pocaHistoria?.includes(s) ? ' (poca historia)' : ''), num(x.k, 0), pct(x.real), pct(x.mediana), x.percentil == null ? '—' : num(x.percentil, 1),
          x.veredicto ? TEXTO_VEREDICTO[x.veredicto] : x.k ? 'sin veredicto (menos de 3 operaciones)' : 'sin operaciones', pct(x.caida?.real), pct(x.caida?.mediana), x.caida?.percentil == null ? '—' : num(x.caida.percentil, 1)]))].join('\n')
}

export function edgeMd(e) {
  if (!e?.filas) return null
  return [`${num(e.entradas, 0)} entradas con ATR en ${e.activos ?? '—'} activos · ${num(e.nSim, 0)} simulaciones${e.semilla != null ? ` · semilla ${e.semilla}` : ''}`, '',
    tablaMd(['N', 'Entradas usadas', 'Real', 'Mediana del azar', 'P5–P95 del azar', 'Percentil', 'Veredicto'],
      e.filas.map(f => [f.N, num(f.usadas, 0), num(f.real), num(f.mediana), f.p5 == null ? '—' : `${num(f.p5)} – ${num(f.p95)}`, f.percentil == null ? '—' : num(f.percentil, 1), f.veredicto ? TEXTO_VEREDICTO[f.veredicto] : 'sin entradas suficientes']))].join('\n')
}

// ── Multibacktest ─────────────────────────────────────────────────────────────────────────────────────────────────
// Los datos de la cabecera a partir de las peticiones de la ejecución (las anota components/AzarCarteraPanel.js), la
// lista de estrategias (para nombre y parámetros), los avisos de cobertura y el periodo de la respuesta, y las pruebas
// calculadas (simulaciones y semilla).
export function datosCabeceraMulticartera({ peticiones = [], estrategias = [], lista = '', avisos = null, periodo = null, pruebas = [], universo = null }) {
  const pet = peticiones[0] || null
  const sr = pet?.sizeRules || pet?.cfg?.sizeRules || {}
  const nombres = [...new Set(peticiones.map(p => p.strategyId))].map(id => {
    const s = estrategias.find(x => x.id === id)
    let p = s?.params
    try { p = typeof p === 'string' ? JSON.parse(p) : p } catch (_) { p = null }
    return `${s?.name || id}${p && Object.keys(p).length ? ` (${textoParams(p)})` : ''}`
  })
  const modos = [...new Set(peticiones.map(p => p.modoAsig))]
  const umbral = sr.prioridad === 'momentum' ? sr.momGateThr ?? 10 : sr.prioridad === 'max52' ? sr.proxGateThr ?? 10 : sr.rsGateThr ?? 0
  const opcionesConc = modos.includes('concentrado') ? ` · máx. ${sr.maxPosiciones ?? 5} posiciones · prioridad ${sr.prioridad || 'alfabetico'}`
    + (sr.prioridad === 'fuerza_relativa' ? ` (ventana ${sr.rsWindow ?? 63})` : sr.prioridad === 'momentum' ? ` (N ${sr.momentumN ?? 20})` : '')
    + ` · ${sr.criterioUso === 'filtro' ? `Filtro (umbral ${umbral} %)` : 'Desempate'}` : ''
  const filtros = filtrosActivos(normalizaFiltrosEntrada(pet?.filtros)).map(f => `${f.tipo} (${f.ambito}${f.params ? `: ${Object.entries(f.params).map(([k, v]) => `${k} ${v}`).join(', ')}` : ''}${f.calculo === 2 ? '; cálculo 2' : ''})`)
  const conSim = pruebas.filter(x => x.nSim)
  return [
    ['Estrategias', nombres],
    // Universo dinámico (Fase 8a): qué universo y lo que ha hecho; sin él, la línea no aparece.
    ['Universo', pet?.universo ? (pet.universo.regla === 'momentum'
      ? `Nasdaq-100 · ${pet.universo.n} con más momentum de 12 meses (regla momentum: rentabilidad del último día de bolsa de hace dos años al del año anterior, sin saltar el último mes; empieza en 2016, y en 2016–2018 el 14–22 % de los elegibles no tiene datos)`
      : `Nasdaq-100 · ${pet.universo.n} más volátiles del año anterior (regla ${pet.universo.regla}; empieza en 2016, y en 2016–2018 el 14–22 % de los elegibles no tiene datos)`)
      + (universo ? ` · ${universo.descartadasPorUniverso} entradas descartadas por universo · ${universo.cierresSinCotizacion} cierres por dejar de cotizar`
        + [['B&H QQQ', universo.qqqBHCurve], ['B&H universo', universo.bhUniversoCurve]].map(([n, c]) => { const r = resumenCurva(c); return r ? ` · ${n}: CAGR ${pct(r.cagr)}, caída máxima ${pct(r.maxDD)}` : '' }).join('') : '') : null],
    ['Activos', pet ? `${pet.symbols.length}${pet.universo ? ' (los del universo en el periodo)' : lista ? ` (lista ${lista})` : ''}: ${pet.symbols.join(', ')}` : null],
    ['Activos excluidos', avisos?.excluidos?.length ? avisos.excluidos.map(e => typeof e === 'string' ? e : `${e.symbol}${e.motivo ? ` (${e.motivo})` : ''}`) : null],
    ['Activos con histórico corto', avisos?.cortos?.length ? avisos.cortos.map(c => `${c.symbol} desde ${fechaEs(c.desde)}`) : null],
    ['Periodo', periodo ? textoPeriodo(periodo.desde, periodo.hasta) : null],
    // Si alguna estrategia declara otra temporalidad, se dice (en el multibacktest manda la del panel).
    ['Temporalidad', (() => { const iv = pet?.intervalo || 'diario'; const nota = notaTemporalidad(iv, [...new Set(peticiones.map(p => p.strategyId))].map(id => estrategias.find(x => x.id === id)).filter(Boolean)); return nota ? `${iv} (${nota})` : iv })()],
    ['Capital', pet?.cfg?.capitalIni != null ? `${fmt(Number(pet.cfg.capitalIni), 0)} €` : null],
    ['Comisiones', pet ? textoComisiones(pet.comisiones) : null],
    ['Modo de asignación', modos.length ? `${modos.join(', ')}${opcionesConc}` : null],
    ['Filtros activos', filtros.length ? filtros : 'ninguno'],
    ['Prueba contra el azar (cartera)', conSim.length ? conSim.map(x => `${x.nombre}: ${x.nSim} simulaciones, semilla ${x.semilla}`) : null],
  ]
}
// d = { cabecera, tabla: { titulo, cabeceras, filas: [{ celdas, activo: bool }] } (las celdas tal como están pintadas),
//       azar: [{ nombre, nSim, semilla, bh, A, B, motivoB, motivo }] (la prueba de cartera calculada de cada estrategia) }.
export function textoMulticartera(d) {
  const partes = [cabeceraMd(d.cabecera)]
  const t = d.tabla
  partes.push(seccion(t?.titulo || 'Comparativa', t?.filas?.length ? tablaMd(t.cabeceras, t.filas.map(f => f.activo ? [`  ↳ ${f.celdas[0]}`, ...f.celdas.slice(1)] : f.celdas)) : null))
  const az = d.azar || []
  partes.push(seccion('Prueba contra el azar (cartera)', az.length ? az.map(azarCarteraMd).join('\n\n') : null))
  return partes.join('\n\n') + '\n'
}
const MEDIDAS_CARTERA = [['CAGR compuesto', 'cagr', pct, TEXTO_VEREDICTO], ['Caída máxima (con flotante)', 'maxDD', pct, TEXTO_VEREDICTO_CAIDA],
  ['CAGR / caída', 'ratio', num, TEXTO_VEREDICTO], ['Capital invertido medio', 'capInv', pct, null]]
// Solo en la prueba A, informativa (sin veredicto): CAGR / capital invertido medio.
const MEDIDA_CAPITAL = ['CAGR / capital invertido medio', 'capRatio', pct, null]
export function azarCarteraMd(x) {
  const recuento = (r) => r?.cagr?.cuenta ? `\nRecuento del CAGR: por debajo ${r.cagr.cuenta.debajo}, iguales ${r.cagr.cuenta.iguales}, por encima ${r.cagr.cuenta.encima}.` : ''
  const bloque = (titulo, r, motivo, conCapital = false) => [`**${titulo}**`, '', motivo ? motivo : r ? tablaMd(CAB_AZAR, [...MEDIDAS_CARTERA, ...(conCapital && r.capRatio ? [MEDIDA_CAPITAL] : [])].map(([n, k, f, t]) => filaAzar(n, r[k], f, t))) + recuento(r) : NC].join('\n')
  return [`### ${x.nombre}`, x.motivo ? x.motivo : [
    `${num(x.nSim, 0)} simulaciones${x.semilla != null ? ` · semilla ${x.semilla}` : ''}${x.bh ? ` · B&H Diversif. de la misma ejecución: CAGR ${pct(x.bh.cagr)}, caída máxima ${pct(x.bh.maxDD)}` : ''}`
      // Universo dinámico: sus referencias y el aviso de sesgo (sin universo, nada de esto).
      + (x.refs ? ['universo', 'qqq'].map(k => x.refs[k] ? ` · B&H ${k === 'qqq' ? 'QQQ' : 'universo'}: CAGR ${pct(x.refs[k].cagr)}, caída máxima ${pct(x.refs[k].maxDD)}` : '').join('')
        + (x.sinColocar ? ` · en A, ${num(x.sinColocar, 0)} colocaciones de activo no cupieron en su tramo` : '') + `\n\n${x.aviso}` : ''), '',
    bloque('A · Señal al azar, reparto real', x.A, null, true), '', bloque('B · Señal real, orden al azar', x.B, x.motivoB)].join('\n')].join('\n')
}

// ── Laboratorio de señales ────────────────────────────────────────────────────────────────────────────────────────
// Las MISMAS celdas que pinta la pantalla (components/LaboratorioPanel.js). Rendimientos en fracción → %.
const pctR = (x, d = 2) => x == null ? '—' : pct(x * 100, d)
const periodoLab = (p) => `${p.desde.slice(0, 4)}–${p.hasta.slice(0, 4)}`
export const CAB_LAB = ['Periodo', 'Operaciones', 'Ignoradas', 'Mediana', 'Media', '% acierto', 'Mediana del azar', 'P5–P95 del azar', 'Percentil', 'Veredicto']
export const filasLab = (periodos, oficial) => (periodos || []).map(p => [periodoLab(p), num(p.operaciones, 0), num(p.ignoradas, 0), pctR(p.mediana), pctR(p.media),
  pct(p.acierto, 1), pctR(p.azar?.mediana), p.azar?.p5 == null ? '—' : `${pctR(p.azar.p5)} – ${pctR(p.azar.p95)}`, num(p.azar?.percentil, 1),
  veredictoLab(oficial, [p])])
export const CAB_LAB_DETALLE = ['Periodo', 'Eventos', 'Ignoradas', 'Sin entrada', 'Cerradas por fin de datos', 'Ganancia media', 'Pérdida media', 'Valores', 'Sin datos']
export const filasLabDetalle = (periodos, datos = []) => (periodos || []).map((p, k) => [periodoLab(p), num(p.eventos, 0), num(p.ignoradas, 0), num(p.sinEntrada, 0),
  num(p.finDatos, 0), pctR(p.gananciaMedia), pctR(p.perdidaMedia), datos[k]?.simbolos == null ? '—' : num(datos[k].simbolos, 0), datos[k]?.sinDatos ? num(datos[k].sinDatos.length, 0) : '—'])
export const CAB_LAB_EDGE = ['Periodo', 'Edge 5 velas', 'Edge 10 velas', 'Edge 20 velas']
export const filasLabEdge = (periodos) => (periodos || []).map(p => [periodoLab(p), ...[5, 10, 20].map(n => num(p.edge?.[n], 2))])
export const AVISO_POCAS_LAB = 'Con menos de 30 operaciones por activo el resultado es sobre todo ruido.'
export const SIN_SECTOR_LAB = 'No hay datos de sector en la base de datos (universo_miembros no lo guarda): este desglose no se puede calcular.'
// ── Laboratorio de SALIDAS (LOTE_2) ──
const esSalidas = (config) => config?.prueba === 'salidas'
// La regla entera en castellano, de una prueba de entradas, de salidas o de una estrategia completa.
export function reglaLab(config) {
  try {
    if (config?.prueba === 'estrategias') return `${fraseEntrada(config.senales)}; ${fraseSalidas(config.salidas)}`
    if (!esSalidas(config)) return fraseRegla(config.senales, config.salida?.n)
    const en = config.entradas
    const entra = en?.tipo === 'azar' ? `Entrar al azar (fijo: cada día candidato con probabilidad 1 de ${num(1 / en.probabilidad, 0)}, semilla ${en.semilla})`
      : fraseEntrada(en)
    return `${entra}; ${fraseSalidas(config.salidas)}`
  } catch (_) { return '—' }
}
const diasN = (x) => x == null ? '—' : num(x, 1)
// Los dos azares de las salidas, uno junto al otro: el de permutación y el re-simulado (V9.976: los dos cuentan en el
// criterio 2). El veredicto de cada periodo, con la versión de criterio del lote de la prueba.
const rangoR = (a) => a?.p5 == null ? '—' : `${pctR(a.p5)} – ${pctR(a.p95)}`
export const CAB_LAB_S = ['Periodo', 'Operaciones', 'Ignoradas', 'Media', 'Permutación: media', 'P5–P95', 'Percentil', 'Re-simulado: media', 'P5–P95', 'Percentil', 'Veredicto']
// Con el criterio 3 decide el re-simulado y la permutación es solo informativa: la cabecera lo dice.
export const permutacionInformativa = (clas = {}) => CRITERIOS[criterioDePrueba(clas)]?.salidas === 'resimulado'
export const cabLabSalidas = (clas = {}) => permutacionInformativa(clas)
  ? ['Periodo', 'Operaciones', 'Ignoradas', 'Media', 'Re-simulado: media', 'P5–P95', 'Percentil', 'Permutación (informativa): media', 'P5–P95', 'Percentil', 'Veredicto'] : CAB_LAB_S
// clas: { oficial, lote, salidas (reglas de salida) }. Con el criterio 3 el re-simulado va primero.
export const filasLabSalidas = (periodos, clas = {}) => (periodos || []).map(p => {
  const r = p.otrosAzares?.resimulado, perm = [pctR(p.azar?.media), rangoR(p.azar), num(p.azar?.percentil, 1)], re = [pctR(r?.media), rangoR(r), num(r?.percentil, 1)]
  return [periodoLab(p), num(p.operaciones, 0), num(p.ignoradas, 0), pctR(p.media), ...(permutacionInformativa(clas) ? [...re, ...perm] : [...perm, ...re]),
    veredictoOficial({ oficial: !!clas.oficial, lote: clas.lote, salidas: clas.salidas }, [p])] })
// El criterio de una prueba de salidas en palabras (lib/lotesLab.js, textoCriterio).
export const textoCriterioSalidas = (clas = {}) => textoCriterio(clas, true)
export const CAB_LAB_S_INFO = ['Periodo', 'Mediana', 'P5 (peor 5 %)', '% acierto', 'Duración media (días)', 'Duración del azar', 'Media por día en mercado', 'Salidas: condición / tiempo / fin']
export const filasLabSalidasInfo = (periodos) => (periodos || []).map(p => [periodoLab(p), pctR(p.mediana), pctR(p.p5), pct(p.acierto, 1), diasN(p.duracionMedia),
  diasN(p.azar?.duracionMedia), pctR(p.mediaPorDia, 3), p.porMotivo ? `${num(p.porMotivo.condicion, 0)} / ${num(p.porMotivo.tiempo, 0)} / ${num(p.porMotivo.fin, 0)}` : '—'])
export const CAB_LAB_S_OTROS = ['Periodo', 'Del enunciado: media', 'percentil', 'duración', 'Duración del re-simulado']
export const filasLabSalidasOtros = (periodos) => (periodos || []).map(p => { const h = p.otrosAzares?.hueco, r = p.otrosAzares?.resimulado
  return [periodoLab(p), pctR(h?.media), num(h?.percentil, 1), diasN(h?.duracionMedia), diasN(r?.duracionMedia)] })
export const CAB_LAB_S_DETALLE = ['Periodo', 'Días candidatos', 'Señales', 'Ignoradas', 'Sin entrada', 'Cerradas por fin de datos', 'Ganancia media', 'Pérdida media', 'Valores', 'Sin datos']
export const filasLabSalidasDetalle = (periodos, datos = []) => (periodos || []).map((p, k) => [periodoLab(p), num(p.candidatos, 0), num(p.eventos, 0), num(p.ignoradas, 0), num(p.sinEntrada, 0),
  num(p.finDatos, 0), pctR(p.gananciaMedia), pctR(p.perdidaMedia), datos[k]?.simbolos == null ? '—' : num(datos[k].simbolos, 0), datos[k]?.sinDatos ? num(datos[k].sinDatos.length, 0) : '—'])
// Desgloses (las mismas tablas en la pantalla y en el texto).
export const CAB_LAB_ANIO = (salidas) => salidas ? ['Año', 'Operaciones', 'Media', 'Mediana'] : ['Año', 'Operaciones', 'Mediana']
export const filasLabAnio = (periodos, salidas) => (periodos || []).flatMap(p => (p.porAnio || []).map(a => salidas ? [a.anio, num(a.operaciones, 0), pctR(a.media), pctR(a.mediana)] : [a.anio, num(a.operaciones, 0), pctR(a.mediana)]))
export const CAB_LAB_ACTIVO = (salidas) => salidas ? ['Activo', 'Operaciones', 'Media', 'Mediana', '% acierto', 'Duración media (días)'] : ['Activo', 'Operaciones', 'Mediana', 'Media', '% acierto']
export const filasLabActivo = (p, salidas) => (p.porActivo || []).map(a => salidas ? [a.sym, num(a.operaciones, 0), pctR(a.media), pctR(a.mediana), pct(a.acierto, 1), diasN(a.duracionMedia)]
  : [a.sym, num(a.operaciones, 0), pctR(a.mediana), pctR(a.media), pct(a.acierto, 1)])
function textoLaboratorioSalidas(d) {
  const c = { ...(d.clas || {}), salidas: d.config?.salidas }, ps = d.periodos || []
  const nota = notaResimulado({ oficial: c.oficial, lote: c.lote, veredicto: d.veredicto, periodos: ps })
  const partes = [cabeceraMd({ ...d.cabecera, datos: [['Prueba', 'salidas (la entrada no aporta nada: al azar y fija, o el disparador de una exploratoria)'], ['Regla', d.regla],
    ['Tipo', c.oficial ? `oficial · ${c.lote} · elemento ${c.item}` : 'exploratoria'], ['Huella de la configuración', c.hash], ['Prueba registrada', d.id != null ? `id ${d.id}` : 'no guardada'],
    ['Veredicto', d.veredicto], ['Nota', nota], ...(d.cabecera?.datos || [])] })]
  partes.push(seccion('Configuración', d.config ? '```json\n' + JSON.stringify(d.config, null, 1) + '\n```' : null))
  partes.push(seccion('Resultado por periodo (medida principal: media por operación)', ps.length ? tablaMd(cabLabSalidas(c), filasLabSalidas(ps, c)) + '\n\nRendimiento por operación bruto. '
    + `Dos azares, ${ps.map(p => `${periodoLab(p)} ${num(p.azar?.nSim, 0)} simulaciones, semilla ${p.azar?.semilla ?? '—'}`).join('; ')}: PERMUTACIÓN (mismas entradas, las duraciones reales de cada valor repartidas al azar sin solapes) y RE-SIMULADO (la misma secuencia de señales con duraciones del valor: cambian las entradas que se abren). `
    + `Veredicto solo en las oficiales. ${textoCriterioSalidas(c)}` + (permutacionInformativa(c) ? ` Permutación: ${NOTA_PERMUTACION}.` : '') + (nota ? `\n\n**Nota:** ${nota}.` : '') : null))
  partes.push(seccion('Medidas informativas', ps.length ? tablaMd(CAB_LAB_S_INFO, filasLabSalidasInfo(ps)) : null))
  partes.push(seccion('Azar del enunciado (solo informativo: recorta las duraciones largas y no está calibrado)', ps.length ? tablaMd(CAB_LAB_S_OTROS, filasLabSalidasOtros(ps)) : null))
  partes.push(seccion('Detalle', ps.length ? tablaMd(CAB_LAB_S_DETALLE, filasLabSalidasDetalle(ps, d.datos)) : null))
  partes.push(seccion('Por año', ps.length ? tablaMd(CAB_LAB_ANIO(true), filasLabAnio(ps, true)) : null))
  partes.push(seccion('Por activo', ps.length ? `${AVISO_POCAS_LAB}\n\n` + ps.map(p => `### ${periodoLab(p)}\n\n` + tablaMd(CAB_LAB_ACTIVO(true), filasLabActivo(p, true))).join('\n\n') : null))
  partes.push(seccion('Por sector', SIN_SECTOR_LAB))
  const sin = ps.map((p, k) => d.datos?.[k]?.sinDatos?.length ? `${periodoLab(p)}: ${d.datos[k].sinDatos.join(', ')}` : null).filter(Boolean)
  partes.push(seccion('Valores del índice sin velas en la base', sin.length ? sin.join('\n') : 'ninguno'))
  return partes.join('\n\n') + '\n'
}
// ── Laboratorio de ESTRATEGIAS COMPLETAS (LOTE_3) ──
export const CAB_LAB_E = ['Periodo', 'Operaciones', 'Ignoradas', 'Media', 'Estrategia al azar: media', 'P5–P95', 'Percentil', 'Veredicto']
export const filasLabEstrategias = (periodos, clas = {}) => (periodos || []).map(p => [periodoLab(p), num(p.operaciones, 0), num(p.ignoradas, 0), pctR(p.media),
  pctR(p.azar?.media), rangoR(p.azar), num(p.azar?.percentil, 1), veredictoOficial({ oficial: !!clas.oficial, lote: clas.lote, item: clas.item }, [p])])
export const CAB_LAB_E_INFO = ['Periodo', 'Mediana', 'P5 (peor 5 %)', '% acierto', 'Duración media (días)', 'Media por día en mercado', 'QQQ por día (comprar y mantener)', 'Salidas: condición / tiempo / fin']
export const filasLabEstrategiasInfo = (periodos) => (periodos || []).map(p => [periodoLab(p), pctR(p.mediana), pctR(p.p5), pct(p.acierto, 1), diasN(p.duracionMedia),
  pctR(p.mediaPorDia, 3), pctR(p.qqq?.porDia, 3), p.porMotivo ? `${num(p.porMotivo.condicion, 0)} / ${num(p.porMotivo.tiempo, 0)} / ${num(p.porMotivo.fin, 0)}` : '—'])
export const CAB_LAB_E_DETALLE = ['Periodo', 'Días candidatos', 'Señales', 'Ignoradas', 'Sin entrada', 'Cerradas por fin de datos', 'Ganancia media', 'Pérdida media', 'Simulaciones aproximadas', 'Valores', 'Sin datos']
export const filasLabEstrategiasDetalle = (periodos, datos = []) => (periodos || []).map((p, k) => [periodoLab(p), num(p.candidatos, 0), num(p.eventos, 0), num(p.ignoradas, 0), num(p.sinEntrada, 0),
  num(p.finDatos, 0), pctR(p.gananciaMedia), pctR(p.perdidaMedia), num(p.azar?.aproximadas, 0), datos[k]?.simbolos == null ? '—' : num(datos[k].simbolos, 0), datos[k]?.sinDatos ? num(datos[k].sinDatos.length, 0) : '—'])
// La calibración de la combinación de una prueba (lib/calibracionLab.json), para la pantalla y el texto.
export const CAB_LAB_CAL = ['Universos', 'Falsos aprobados (>= 95)', 'Percentil medio', 'Deciles 0–10 … 90–100', 'Operaciones medias', '¿Calibrada?']
export const filaCalibracion = (c) => c ? [num(c.universos, 0), `${num(c.pctAprobados, 1)} % (${c.aprobados} de ${c.universos})`, num(c.percentilMedio, 1), c.deciles.join(' · '), num(c.operacionesMedias, 0), c.calibrada ? 'sí' : 'NO'] : null
export function textoCalibracion(clas = {}) {
  if (!clas.oficial) return 'Exploratoria: no tiene calibración propia (solo se calibran las combinaciones declaradas en un lote).'
  const c = calibracionDe(clas.lote, clas.item), l = calibracionLote(clas.lote)
  if (!c) return `Sin calibración para ${clas.lote} · ${clas.item}: sin veredicto.`
  return tablaMd(CAB_LAB_CAL, [filaCalibracion(c)]) + `\n\nPaseos aleatorios sin ventaja (${l?.parametros?.valores ?? '—'} valores × ${l?.parametros?.anios ?? '—'} años, deriva ${l?.parametros?.derivaDiaria ?? '—'} y volatilidad ${l?.parametros?.volatilidadDiaria ?? '—'} diarias), ${l?.fecha || '—'}, ${l?.version || '—'}. Calibrada si los falsos aprobados en un periodo son <= ${l?.umbralFalsosAprobados ?? 10} %.`
}
function textoLaboratorioEstrategias(d) {
  const c = d.clas || {}, ps = d.periodos || []
  const partes = [cabeceraMd({ ...d.cabecera, datos: [['Prueba', 'estrategia completa (entrada + salida) frente a la misma estrategia al azar'], ['Regla', d.regla],
    ['Tipo', c.oficial ? `oficial · ${c.lote} · elemento ${c.item}` : 'exploratoria'], ['Huella de la configuración', c.hash], ['Prueba registrada', d.id != null ? `id ${d.id}` : 'no guardada'],
    ['Veredicto', d.veredicto], ...(d.cabecera?.datos || [])] })]
  partes.push(seccion('Configuración', d.config ? '```json\n' + JSON.stringify(d.config, null, 1) + '\n```' : null))
  partes.push(seccion('Resultado por periodo (medida principal: media por operación)', ps.length ? tablaMd(CAB_LAB_E, filasLabEstrategias(ps, c)) + '\n\nRendimiento por operación bruto. '
    + `Estrategia al azar: por valor, las mismas duraciones reales en fechas de señal al azar entre los días válidos, sin solaparse (${ps.map(p => `${periodoLab(p)} ${num(p.azar?.nSim, 0)} simulaciones, semilla ${p.azar?.semilla ?? '—'}`).join('; ')}). `
    + `Veredicto solo en las oficiales. ${textoCriterio(c, 'estrategias')}` : null))
  partes.push(seccion('Calibración de esta combinación', textoCalibracion(c)))
  partes.push(seccion('Medidas informativas', ps.length ? tablaMd(CAB_LAB_E_INFO, filasLabEstrategiasInfo(ps)) : null))
  partes.push(seccion('Detalle', ps.length ? tablaMd(CAB_LAB_E_DETALLE, filasLabEstrategiasDetalle(ps, d.datos)) : null))
  partes.push(seccion('Por año', ps.length ? tablaMd(CAB_LAB_ANIO(true), filasLabAnio(ps, true)) : null))
  partes.push(seccion('Por activo', ps.length ? `${AVISO_POCAS_LAB}\n\n` + ps.map(p => `### ${periodoLab(p)}\n\n` + tablaMd(CAB_LAB_ACTIVO(true), filasLabActivo(p, true))).join('\n\n') : null))
  partes.push(seccion('Por sector', SIN_SECTOR_LAB))
  const sin = ps.map((p, k) => d.datos?.[k]?.sinDatos?.length ? `${periodoLab(p)}: ${d.datos[k].sinDatos.join(', ')}` : null).filter(Boolean)
  partes.push(seccion('Valores del índice sin velas en la base', sin.length ? sin.join('\n') : 'ninguno'))
  return partes.join('\n\n') + '\n'
}
// d = { cabecera, regla, clas { hash, oficial, lote, item }, config, veredicto, periodos, datos [{ simbolos, sinDatos }], id }.
export function textoLaboratorio(d) {
  if (d.config?.prueba === 'estrategias') return textoLaboratorioEstrategias(d)
  if (esSalidas(d.config)) return textoLaboratorioSalidas(d)
  const c = d.clas || {}, ps = d.periodos || []
  const partes = [cabeceraMd({ ...d.cabecera, datos: [['Regla', d.regla], ['Tipo', c.oficial ? `oficial · ${c.lote} · elemento ${c.item}` : 'exploratoria'],
    ['Huella de la configuración', c.hash], ['Prueba registrada', d.id != null ? `id ${d.id}` : 'no guardada'], ['Veredicto', d.veredicto], ...(d.cabecera?.datos || [])] })]
  partes.push(seccion('Configuración', d.config ? '```json\n' + JSON.stringify(d.config, null, 1) + '\n```' : null))
  partes.push(seccion('Resultado por periodo', ps.length ? tablaMd(CAB_LAB, filasLab(ps, c.oficial)) + '\n\nRendimiento por operación bruto (salida / entrada − 1). '
    + `Azar: ${ps.map(p => `${periodoLab(p)} ${num(p.azar?.nSim, 0)} simulaciones, semilla ${p.azar?.semilla ?? '—'}`).join('; ')}. `
    + `Veredicto solo en las oficiales. ${textoCriterio(c, false)}` : null))
  partes.push(seccion('Detalle', ps.length ? tablaMd(CAB_LAB_DETALLE, filasLabDetalle(ps, d.datos)) : null))
  partes.push(seccion('Edge Ratio (solo informativo)', ps.length ? tablaMd(CAB_LAB_EDGE, filasLabEdge(ps)) : null))
  partes.push(seccion('Por año', ps.length ? tablaMd(['Año', 'Operaciones', 'Mediana'], ps.flatMap(p => (p.porAnio || []).map(a => [a.anio, num(a.operaciones, 0), pctR(a.mediana)]))) : null))
  partes.push(seccion('Por activo', ps.length ? `${AVISO_POCAS_LAB}\n\n` + ps.map(p => `### ${periodoLab(p)}\n\n` + tablaMd(['Activo', 'Operaciones', 'Mediana', 'Media', '% acierto'],
    (p.porActivo || []).map(a => [a.sym, num(a.operaciones, 0), pctR(a.mediana), pctR(a.media), pct(a.acierto, 1)]))).join('\n\n') : null))
  partes.push(seccion('Por sector', SIN_SECTOR_LAB))
  const sin = ps.map((p, k) => d.datos?.[k]?.sinDatos?.length ? `${periodoLab(p)}: ${d.datos[k].sinDatos.join(', ')}` : null).filter(Boolean)
  partes.push(seccion('Valores del índice sin velas en la base', sin.length ? sin.join('\n') : 'ninguno'))
  return partes.join('\n\n') + '\n'
}

// ── «📋 Copiar lote completo» (V9.992) ──
// Junta en UN texto las variantes ejecutadas de un lote (la prueba oficial más reciente de cada una), sin repetir lo común:
// la cabecera del lote y lo común (normas, método, referencias, criterio) una vez; de cada variante, sus secciones sin el
// JSON de la configuración, la curva de 40 puntos ni los detalles por activo y operación; una sección idéntica a la de una
// variante anterior se sustituye por «igual que en …»; los periodos FUERA, los 5 más largos por periodo. Si pasa de
// MAX_LOTE caracteres, se quitan primero las secciones menos importantes y, al final, se corta con un aviso.
// filas: [{ item, nombre, fila }] (fila: la de lab_pruebas, con config, resultados, hash_config, id, creado, oficial,
// lote, item_lote, version_app); reglaDe(config): la regla en palabras.
export const MAX_LOTE = 50000
const QUITA_SECCION_LOTE = [/^Configuración$/, /^Curva de /, /^Detalle$/, /^Por activo$/, /^Por sector$/, /^Valores del índice sin velas/]
// Si no cabe (V9.994): primero el «año a año» y los impuestos se quedan solo en el periodo total; luego se quitan, por este
// orden, las secciones prescindibles; si aún no cabe, también esas dos; y al final se corta.
const SOLO_TOTAL_LOTE = [/^Impuestos/, /^Año a año/]
const PRESCINDIBLES_LOTE = [/^Ciclos$/, /^Por año$/, /^Medidas informativas$/, /^Azar del enunciado/, /^Edge Ratio/, /^Calibración de esta/]
// Después, los periodos FUERA también solo en el periodo total; luego, sin periodos FUERA; y, como último recurso, sin
// impuestos ni año a año.
const ULTIMO_RECURSO_LOTE = [/^Periodos FUERA/, /^Impuestos/, /^Año a año/]
// De una sección con una subsección por periodo («#### 2016–2020 …»), solo la del periodo total.
const soloPeriodoTotal = (p) => { const trozos = p.cuerpo.split(/^(?=#### )/m), tot = trozos.filter(x => /^#### .*\(total\)/.test(x))
  return tot.length && trozos.length > tot.length ? { ...p, titulo: `${p.titulo} · solo el periodo total`, cuerpo: tot.join('').trim() } : p }
const CABECERA_LOTE = ['Regla', 'ETF', 'Tipo', 'Cálculo', 'Prueba registrada', 'Veredicto', 'Veredicto (orientativo)', 'Ciclos', 'Periodos FUERA', 'Operaciones']
function seccionesDe(texto) {
  const lineas = texto.split('\n'), out = { cabecera: [], secciones: [] }
  let actual = null
  for (const l of lineas) {
    if (l.startsWith('## ')) { actual = { titulo: l.slice(3).trim(), lineas: [] }; out.secciones.push(actual) }
    else if (actual) actual.lineas.push(l)
    else out.cabecera.push(l)
  }
  return out
}
// Los periodos FUERA: de cada tabla, las 5 filas con más días fuera (en su orden de fechas).
function cincoMasLargos(lineas) {
  const out = []
  let tabla = []
  const vuelca = () => {
    if (tabla.length > 2) {
      const filas = tabla.slice(2).map((l, i) => ({ l, i, d: Number((l.split('|')[3] || '').replace(/\./g, '').replace(',', '.').trim()) || 0 }))
      const top = new Set(filas.sort((a, b) => b.d - a.d || a.i - b.i).slice(0, 5).map(f => f.i))
      out.push(tabla[0], tabla[1], ...tabla.slice(2).filter((_, i) => top.has(i)))
    } else out.push(...tabla)
    tabla = []
  }
  for (const l of lineas) { if (l.startsWith('|')) tabla.push(l); else { vuelca(); out.push(l) } }
  vuelca()
  return out
}
// La calibración de una variante en UNA línea (V9.998), para la cabecera de cada variante del lote completo: se queda
// aunque, por tamaño, se quite la sección «Calibración de esta variante». f: la fila de lab_pruebas.
export function lineaCalibracionLote(f) {
  if (!f?.oficial) return '- Calibración: exploratoria, sin calibración propia'
  const l = calibracionLote(f.lote)
  if (!l) return `- Calibración: el criterio de ${f.lote} no la usa`
  const c = calibracionDe(f.lote, f.item_lote)
  if (!c) return '- Calibración: esta variante no tiene calibración (el azar no da veredicto)'
  return `- Calibración: ${c.calibrada ? 'calibrada' : 'NO calibrada'} · falsos aprobados ${num(c.pctAprobados, 1)} % (${c.aprobados} de ${c.universos} universos; calibrada si <= ${l.umbralFalsosAprobados ?? 10} %)`
}
export function textoLoteCompleto({ lote, filas, version = null, fecha = null, reglaDe = (c) => '' }) {
  const ejecutadas = filas.filter(f => f.fila)
  const comun = Object.entries(lote.comun || {}).map(([k, v]) => `- ${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
  const cab = [`# ${lote.id} · ${lote.nombre} (lote completo)`, [`Trading Simulator${version ? ` ${version}` : ''}`, fecha].filter(Boolean).join(' · '), '',
    `Variantes ejecutadas: ${ejecutadas.length} de ${filas.length}${filas.length > ejecutadas.length ? ` (pendientes: ${filas.filter(f => !f.fila).map(f => f.item).join(', ')})` : ''}. De cada una, su prueba oficial más reciente.`,
    'Sin la curva de 40 puntos ni el JSON de la configuración; lo común va una vez.', '', '## Lo común del lote', '', ...comun]
  // Referencias: una fila (referencia y periodo) que ya salió en una variante anterior no se repite (V9.994): QQQ, SPY y la
  // mezcla sin filtro son las mismas en muchas variantes.
  // Año a año: una columna de referencia (QQQ, SPY, la mezcla, el QQQ con filtro) idéntica a una ya mostrada tampoco.
  const vistas = new Map(), bloques = [], filasRef = new Set(), columnasAnio = new Set()
  for (const { item, nombre, fila } of ejecutadas) {
    const f = fila, t = textoLaboratorio({ cabecera: { titulo: item }, regla: reglaDe(f.config), clas: { hash: f.hash_config, oficial: f.oficial, lote: f.lote, item: f.item_lote, salidas: f.config?.salidas },
      config: f.config, veredicto: f.resultados?.veredicto || '—', periodos: f.resultados?.periodos || [], datos: f.resultados?.datos || [], id: f.id })
    const { cabecera, secciones } = seccionesDe(t)
    const datos = [...cabecera.filter(l => l.startsWith('- ') && CABECERA_LOTE.some(k => l.startsWith(`- ${k}:`))), lineaCalibracionLote(f)]
    const partes = []
    for (const s of secciones) {
      if (QUITA_SECCION_LOTE.some(r => r.test(s.titulo))) continue
      let lineas = s.lineas, titulo = s.titulo
      if (/^Periodos FUERA más largos/.test(titulo)) { lineas = cincoMasLargos(lineas); titulo = 'Periodos FUERA más largos (los 5 más largos por periodo)' }
      const cuerpo = lineas.join('\n').trim(), clave = `${titulo}\n${cuerpo}`
      const repe = vistas.get(clave)
      if (!repe && /^Referencias$/.test(titulo)) {
        const tabla = lineas.filter(l => l.startsWith('|')), cab = tabla.slice(0, 2), nuevas = tabla.slice(2).filter(l => !filasRef.has(l))
        const quitadas = tabla.length - 2 - nuevas.length
        tabla.slice(2).forEach(l => filasRef.add(l)); vistas.set(clave, item)
        partes.push({ titulo, cuerpo: nuevas.length ? [...cab, ...nuevas].join('\n') + (quitadas ? `\n\n(Sin ${quitadas} filas que ya salieron en variantes anteriores.)` : '') : '(todas las filas ya salieron en variantes anteriores)' })
        continue
      }
      if (!repe && /^Año a año/.test(titulo)) {
        const tabla = lineas.filter(l => l.startsWith('|')).map(l => l.split('|').slice(1, -1).map(x => x.trim()))
        if (tabla.length > 2) {
          const cols = tabla[0].map((_, j) => j), firma = (j) => tabla.filter((_, i) => i !== 1).map(f => f[j]).join('|')
          const quedan = cols.filter(j => j < 2 || !columnasAnio.has(firma(j))), fuera = cols.filter(j => !quedan.includes(j)).map(j => tabla[0][j])
          cols.forEach(j => { if (j >= 2) columnasAnio.add(firma(j)) })
          const linea = (f) => `| ${quedan.map(j => f[j]).join(' | ')} |`
          partes.push({ titulo, cuerpo: [linea(tabla[0]), `|${quedan.map(() => '---').join('|')}|`, ...tabla.slice(2).map(linea)].join('\n') + (fuera.length ? `\n\n(Sin las columnas ${fuera.join(', ')}: iguales que en una variante anterior.)` : '') })
          vistas.set(clave, item)
          continue
        }
      }
      partes.push({ titulo, cuerpo: repe ? `(igual que en ${repe})` : cuerpo.replace(/^### /gm, '#### ') })
      if (!repe) vistas.set(clave, item)
    }
    bloques.push({ item, cabecera: `## ${item} · ${nombre} · ${fechaEs(f.creado)}${f.version_app ? ` · ${f.version_app}` : ''}`, datos, partes })
  }
  const arma = () => [...cab, ...bloques.flatMap(b => ['', b.cabecera, '', ...b.datos, ...b.partes.flatMap(p => ['', `### ${p.titulo}`, '', p.cuerpo])])].join('\n') + '\n'
  let texto = arma()
  if (texto.length > MAX_LOTE) { for (const b of bloques) b.partes = b.partes.map(p => SOLO_TOTAL_LOTE.some(r => r.test(p.titulo)) ? soloPeriodoTotal(p) : p); texto = arma() }
  for (const r of PRESCINDIBLES_LOTE) {
    if (texto.length <= MAX_LOTE) break
    for (const b of bloques) b.partes = b.partes.filter(p => !r.test(p.titulo))
    texto = arma()
  }
  if (texto.length > MAX_LOTE) { for (const b of bloques) b.partes = b.partes.map(p => /^Periodos FUERA/.test(p.titulo) ? soloPeriodoTotal(p) : p); texto = arma() }
  for (const r of ULTIMO_RECURSO_LOTE) {
    if (texto.length <= MAX_LOTE) break
    for (const b of bloques) b.partes = b.partes.filter(p => !r.test(p.titulo))
    texto = arma()
  }
  if (texto.length > MAX_LOTE) texto = texto.slice(0, MAX_LOTE - 200) + `\n\n(… recortado: el lote completo pasaba de ${MAX_LOTE} caracteres.)\n`
  return texto
}

// ── Lotes del editor (components/EditorLotes.js) ──────────────────────────────────────────────────────────────────
// d = { fila (la de editor_lotes: nombre, creado, hash_lote, huellas, lote), ejec ({ resultados, resumen, creado,
//       versionApp? }: el de la pantalla o el último del registro), version, avisoUniverso (texto), completo (bool),
//       frases ({ id de variante: la regla en castellano }) }. «Copiar para Claude»: cabecera, resultado y la prueba contra
// el azar de cada variante y periodo, con el MISMO formato que la del multibacktest (azarCarteraMd). «Copiar lote
// completo»: además, la declaración de cada variante (su regla, sus valores y su huella).
const periodoLote = (p) => `${fechaEs(p.desde)} → ${fechaEs(p.hasta)}`
export function textoLoteEditor(d) {
  const f = d.fila, lote = f.lote, c = lote.comun, ej = d.ejec
  const universo = c.universo || { tipo: 'lista', symbols: c.symbols || [] }, periodos = c.periodos || [{ desde: c.desde, hasta: c.hasta }]
  const din = universo.tipo === 'ndx', sr = c.sizeRules || {}
  const nombreV = (v) => (v?.nombre || '').trim() || v?.id
  const nP = periodos.length
  const datos = [
    ['Huella del lote', f.hash_lote], ['Congelado', `${fechaEs(String(f.creado).slice(0, 10))}${f.version_app ? ` (${f.version_app})` : ''}`],
    ['Universo', din ? `Nasdaq-100 dinámico · ${universo.n} ${universo.regla === 'momentum' ? 'con más momentum de 12 meses' : 'más volátiles del año anterior'} (regla ${universo.regla}); solo se puede entrar en un valor mientras está en el universo` : `lista fija de ${universo.symbols.length} activos: ${universo.symbols.join(', ')}`],
    ['Periodos', periodos.map(periodoLote)],
    ['Temporalidad', c.intervalo], ['Capital', `${fmt(Number(c.capitalIni), 0)} €`], ['Comisiones', 'ninguna'], ['Filtros activos', 'ninguno (la prueba contra el azar se hace sin filtros)'],
    ['Modo de asignación', `${c.modoAsig} · máx. ${sr.maxPosiciones ?? 5} posiciones · prioridad ${sr.prioridad || 'alfabetico'}${sr.prioridad === 'fuerza_relativa' ? ` (ventana ${sr.rsWindow ?? 63})` : ''} · ${sr.criterioUso === 'filtro' ? 'Filtro' : 'Desempate'}`],
    ['Prueba contra el azar (cartera)', `${num(c.nSim, 0)} simulaciones por variante, periodo y prueba; semilla de la huella del lote, la variante y el periodo`],
    ['Criterio del lote', `una variante supera al azar si el percentil de su CAGR en la prueba A es ≥ 95${nP > 1 ? ` en los ${nP} periodos` : ''}; la B, sin veredicto del lote`],
    ['Variantes', lote.variantes.map(v => `${nombreV(v)} (${v.id})`)],
    ['Ejecución', ej ? `${ej.creado ? fechaEs(String(ej.creado).slice(0, 10)) : '—'}${ej.versionApp ? ` (${ej.versionApp})` : ''}` : 'sin ejecutar'],
  ]
  const partes = [cabeceraMd({ titulo: `Lote del editor: ${f.nombre}`, version: d.version, fecha: new Date().toISOString().slice(0, 10), datos })]
  if (d.completo) {
    partes.push(seccion('Variantes (declaración congelada)', lote.variantes.map(v => {
      const h = (f.huellas?.variantes || []).find(x => x.id === v.id)?.huella
      return [`### ${nombreV(v)} (${v.id})`, `- Valores: ${textoParams(v.valores)}`, `- Huella: ${h || '—'}`, `- Regla: ${d.frases?.[v.id] || '—'}`].join('\n')
    }).join('\n\n')))
  }
  // El laboratorio (Nasdaq-100, contra la misma estrategia al azar), si se ha calculado algo: en «Copiar lote completo».
  if (d.completo && (d.lab || []).some(x => x.cal || x.periodos)) partes.push(seccion('Laboratorio (Nasdaq-100, contra la misma estrategia al azar)', [
    'Lo real: la media por operación de la variante en los miembros del Nasdaq-100; el azar: las mismas operaciones de cada valor (cuántas y cuánto duran) en fechas al azar. Veredicto: calibrada (≤ 10 % de universos sin ventaja con percentil ≥ 95) y percentil ≥ 95 en todos los periodos.', '',
    tablaMd(['Variante', 'Calibración: universos sin ventaja con percentil ≥ 95', 'Percentil medio sin ventaja', 'Periodo', 'Operaciones', 'Media', 'Azar: media', 'Percentil', 'Fuera del índice', 'Veredicto'],
      d.lab.flatMap(x => (x.periodos?.length ? x.periodos : [null]).map(p => [x.nombre, x.cal ? `${num(x.cal.pctAprobados, 1)} % (${x.cal.calibrada ? 'calibrada' : 'NO calibrada'})` : 'sin calibrar', x.cal ? num(x.cal.percentilMedio, 1) : '—',
        p ? periodoLote(p) : '—', p ? num(p.operaciones, 0) : '—', p ? pct(p.media * 100) : '—', p ? pct(p.azar?.media * 100) : '—', p?.azar?.percentil == null ? '—' : num(p.azar.percentil, 1), p ? (p.fueraDelIndice ?? '—') : '—', x.veredicto])))].join('\n')))
  if (!ej) { partes.push(seccion('Resultado', null)); return partes.join('\n\n') + '\n' }
  const filas = ej.resultados.flatMap(x => x.periodos.map((p) => [`${x.nombre}${x.supera ? ' ✓' : ''}`, periodoLote(p) + (p.coincide === false ? ' ⚠' : ''), pct(p.real?.cagr), pct(p.real?.maxDD),
    p.A?.cagr?.percentil == null ? '—' : num(p.A.cagr.percentil, 1), p.A?.cagr?.veredicto ? TEXTO_VEREDICTO[p.A.cagr.veredicto] || p.A.cagr.veredicto : '—',
    p.B?.cagr?.percentil == null ? '—' : num(p.B.cagr.percentil, 1), p.B?.cagr?.veredicto ? TEXTO_VEREDICTO[p.B.cagr.veredicto] || p.B.cagr.veredicto : '—', ...(din ? [p.descartadas ?? '—'] : [])]))
  partes.push(seccion('Resultado', [tablaMd(['Variante', 'Periodo', 'CAGR', 'Caída máx.', 'A: percentil', 'A: veredicto', 'B: percentil', 'B: veredicto', ...(din ? ['Descartadas por universo'] : [])], filas),
    '', ej.resumen?.texto || '', '✓ = supera al azar en todos los periodos.'].join('\n')))
  partes.push(seccion('Prueba contra el azar (cartera)', ej.resultados.flatMap(x => x.periodos.map(p => azarCarteraMd({ nombre: `${x.nombre} · ${periodoLote(p)}`, nSim: p.nSim ?? c.nSim, semilla: p.semilla ?? null, bh: p.bh || null,
    A: p.A, B: p.B, motivoB: p.B ? null : 'no aplica', ...(p.refs ? { refs: p.refs, aviso: d.avisoUniverso || '', sinColocar: p.sinColocar } : {}) }))).join('\n\n')))
  return partes.join('\n\n') + '\n'
}
