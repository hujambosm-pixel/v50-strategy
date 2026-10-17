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
import { veredictoOficial, notaResimulado, criterioDePrueba, CRITERIOS, textoCriterio, NOTA_PERMUTACION, calibracionDe, calibracionLote, NOMBRE_ALCANCE } from './lotesLab'
import { fraseTransicion } from './laboratorioCartera'
import SINTETICOS from './etfSinteticos.json'

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
  const filtros = filtrosActivos(normalizaFiltrosEntrada(pet?.filtros)).map(f => `${f.tipo} (${f.ambito}${f.params ? `: ${Object.entries(f.params).map(([k, v]) => `${k} ${v}`).join(', ')}` : ''})`)
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
    if (config?.prueba === 'cartera') return reglaCarteraCorta(config)
    if (config?.prueba === 'exploracion') return `${config.nombre} (${config.combinaciones} combinaciones)`
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
// ── Laboratorio de CARTERA (CARTERA_1) ──
// «Regla de Sergi (caída del 10 % en 252 velas) + QLD».
export function reglaCarteraCorta(config) {
  if (config?.regla?.id === 'filtro') { const f = config.regla.filtro || {}
    return `Mezcla 50 % QQQ + 50 % ${nombreEtfCartera(config.etf)} con filtro ${textoMediaFiltro(f)} · fuera: ${NOMBRE_ALCANCE[f.alcance] || '—'}` }
  if (config?.regla?.id === 'mezcla') { const w = config.regla.estados.MEZCLA.pesos, cal = config.regla.transiciones.find(t => t.calendario)?.calendario
    return `Mezcla fija ${num(w.QQQ * 100, 0)} % QQQ + ${num(w.ETF * 100, 0)} % ${config?.etf || 'ETF'} (rebalanceo ${cal || '—'})` }
  const c = (config?.regla?.transiciones || []).flatMap(t => t.si || []).find(s => s.c === 'caidaDesdeMaximo')
  return `${config?.regla?.nombre || 'Regla'}${c ? ` (caída del ${c.pct == null ? '…' : num(c.pct, Number.isInteger(c.pct) ? 0 : 1)} % en ${c.ventana ?? '…'} velas)` : ''} + ${config?.etf || '—'}`
}
export const periodoCartera = (p) => `${String(p.desde).slice(0, 4)}–${String(p.hasta).slice(0, 4)}${p.total ? ' (total)' : ''}`
const pc1 = (x) => x == null ? '—' : pct(x * 100, 1)
export const CAB_CARTERA = ['Periodo', 'CAGR', 'QQQ', '50/50', 'SPY', '¿Supera a QQQ?', 'Caída máxima', 'CAGR / caída', 'Peor año', 'Apalancado', 'Liquidez', 'Ciclos', 'Operaciones', 'Azar: CAGR mediano', 'P5–P95', 'Percentil']
export const filasCartera = (periodos) => (periodos || []).map(p => [periodoCartera(p), pctR(p.cagr), pctR(p.referencias?.qqq?.cagr), pctR(p.referencias?.mitad?.cagr), pctR(p.referencias?.spy?.cagr),
  p.supera?.qqq ? 'sí' : 'no', p.caidaMaxima == null ? '—' : `${pc1(p.caidaMaxima)} (${fechaEs(p.fechaCaida)})`, num(p.cagrPorCaida, 2), p.peorAnio ? `${p.peorAnio.anio}: ${pc1(p.peorAnio.rentabilidad)}` : '—',
  pc1(p.tiempoApalancado), pc1(p.tiempoLiquidez), num(p.ciclos, 0), num(p.operaciones, 0), pctR(p.azar?.media), p.azar?.p5 == null ? '—' : `${pctR(p.azar.p5)} – ${pctR(p.azar.p95)}`, num(p.azar?.percentil, 1)])
export const CAB_CARTERA_REF = ['Periodo', 'Referencia', 'CAGR', 'Caída máxima', 'CAGR / caída', 'Peor año']
export const filasCarteraRef = (periodos) => (periodos || []).flatMap(p => [['qqq', 'Comprar y mantener QQQ'], ['mitad', '50 % QQQ + 50 % ETF (rebalanceo anual)'], ['spy', 'Comprar y mantener SPY']].map(([k, n]) => { const r = p.referencias?.[k] || {}
  return [periodoCartera(p), n, pctR(r.cagr), r.caidaMaxima == null ? '—' : `${pc1(r.caidaMaxima)} (${fechaEs(r.fechaCaida)})`, num(r.cagrPorCaida, 2), r.peorAnio ? `${r.peorAnio.anio}: ${pc1(r.peorAnio.rentabilidad)}` : '—'] }))
export const CAB_CICLOS = ['Entrada', 'Máximo de referencia', 'Entradas al ETF', 'Salidas del ETF', 'Fin', 'Rentabilidad del ciclo']
const listaFechas = (fs, corto) => !fs?.length ? '0' : corto ? `${fs.length} (${fechaEs(fs[0])}${fs.length > 1 ? ` … ${fechaEs(fs[fs.length - 1])}` : ''})` : `${fs.length}: ${fs.map(fechaEs).join(', ')}`
export const filasCiclos = (p, { corto = true } = {}) => (p?.tablaCiclos || []).map(c => [fechaEs(c.inicio), num(c.maxRef, 2), listaFechas(c.entradasEtf, corto), listaFechas(c.salidasEtf, corto),
  c.abierto ? 'abierto (valorado al último cierre)' : fechaEs(c.fin), pc1(c.rentabilidad)])
export const CAB_IMPUESTOS = ['Año', 'Plusvalía realizada (FIFO)', 'Impuesto del año sin compensar']
export const filasImpuestos = (p) => p?.impuestos?.calculo === 2 ? (p.impuestos.plusvaliasPorAnio || []).map(x => [x.anio, num(x.plusvalia, 0) + ' €', num(x.compensado, 0) + ' €', num(x.base, 0) + ' €', num(x.impuesto, 0) + ' €', fechaEs(x.pagadoEl)])
  : (p?.impuestos?.plusvaliasPorAnio || []).map(x => [x.anio, num(x.plusvalia, 0) + ' €', num(x.impuestoSinCompensar, 0) + ' €'])
export const resumenImpuestos = (p) => p?.impuestos?.calculo === 2 ? `Cálculo 2, con ${num(p.impuestos.capital, 0)} € al empezar: impuestos pagados ${num(p.impuestos.totalPagado, 0)} € (${num(p.impuestos.pagadoDuranteEuros, 0)} € durante el periodo, salidos de la cartera, y ${num(p.impuestos.impuestoFinal, 0)} € al vender todo al final); valor final neto ${num(p.impuestos.valorFinalNeto, 0)} € (CAGR neto ${pctR(p.impuestos.cagrNeto)}); comprar y mantener QQQ: ${num(p.impuestos.qqqTotalPagado, 0)} € de impuestos al vender al final y ${num(p.impuestos.qqqValorFinalNeto, 0)} € netos.`
  : p?.impuestos ? `Con ${num(p.impuestos.capital, 0)} € al empezar: impuestos pagados ${num(p.impuestos.totalPagado, 0)} € (con compensación de pérdidas de años anteriores) y valor final neto ${num(p.impuestos.valorFinalNeto, 0)} €; comprar y mantener QQQ: ${num(p.impuestos.qqqTotalPagado, 0)} € de impuestos al vender al final y ${num(p.impuestos.qqqValorFinalNeto, 0)} € netos.` : '—'
export const NOTA_IMPUESTOS = 'Estimación con los tramos del ahorro y la compensación de la app (lib/afterTaxSim.js) sobre las plusvalías realizadas FIFO por activo. No incluye: el impuesto de los dividendos (se reinvierten), la regla de los dos meses (las pérdidas con recompra del mismo ETF en dos meses se aplazan), el cambio de divisa ni que el impuesto pagado deja de rentar (la curva neta resta lo pagado).'
// Cálculo 2 (V9.988): impuestos en caja (lib/laboratorioCartera.js, impuestosEnCajaDe).
export const textoCalculo = (c) => c === 2 ? 'cálculo 2 (impuestos en caja: salen de la cartera el primer día hábil del año siguiente)' : 'cálculo 1 (el de los lotes congelados: impuestos restados aparte)'
export const calculoDeConfig = (config) => config?.calculo ?? 1
export const CAB_IMPUESTOS_2 = ['Año', 'Plusvalía neta (FIFO)', 'Pérdidas compensadas (4 años)', 'Base', 'Impuesto', 'Pagado el']
export const cabImpuestos = (p) => p?.impuestos?.calculo === 2 ? CAB_IMPUESTOS_2 : CAB_IMPUESTOS
export const NOTA_IMPUESTOS_2 = 'Cálculo 2: el impuesto de cada año (plusvalías FIFO por activo, tramos del ahorro, compensación de las pérdidas de los 4 años anteriores) sale de la cartera el primer día hábil del año siguiente: con la liquidez y, si no basta, vendiendo a prorrata (esa venta también genera plusvalía). Al final se vende todo y se paga lo que falte, como comprar y mantener. El CAGR, la caída, el azar y los criterios son antes de impuestos. No incluye todavía la regla de los dos meses ni el impuesto de los dividendos.'
// Costes por operación (cálculo 2, V9.989).
export const textoCostesConfig = (c) => !c ? 'sin costes por operación' : `comisión ${num(c.comisionPct, 2)} % (mínimo ${num(c.comisionMinEur, 2)} €) y media horquilla ${num(c.horquillaPct.QQQ, 2)} % en QQQ y ${num(c.horquillaPct.ETF, 2)} % en el ETF`
export const CAB_COSTES = ['Periodo', 'Operaciones (órdenes)', 'Coste pagado (10.000 € al empezar)']
export const filasCostes = (periodos) => (periodos || []).filter(p => p.costes).map(p => [periodoCartera(p), num(p.costes.operaciones, 0), num(p.costes.pagados, 2) + ' €'])
export const notaImpuestos = (p) => p?.impuestos?.calculo === 2 ? NOTA_IMPUESTOS_2 : NOTA_IMPUESTOS
export const CAB_CAL_CARTERA = ['Universos', 'Falsos aprobados (>= 95 en el total)', 'Percentil medio', 'Deciles 0–10 … 90–100', 'Ciclos medios', 'Supera a QQQ sin ventaja', '¿Calibrada?']
export const filaCalibracionCartera = (c) => c ? [num(c.universos, 0), `${num(c.pctAprobados, 1)} % (${c.aprobados} de ${c.universos})`, num(c.percentilMedio, 1), c.deciles.join(' · '), num(c.ciclosMedios, 1), `${num(c.pctSuperaQqq, 1)} %`, c.calibrada ? 'sí' : 'NO'] : null
// ── Mezcla con filtro de tendencia (CARTERA_3, V9.987) ──
export const AVISO_LIQUIDEZ = 'Liquidez al 0 %: el dinero fuera del mercado no renta nada (ni letras del Tesoro ni ningún interés).'
export const nombreEtfCartera = (etf) => etf === 'x2' ? '×2 sintético' : etf === 'x3' ? '×3 sintético' : (etf || '—')
export const textoMediaFiltro = (f) => { if (!f?.periodo) return '—'; const p = String(f.periodo).replace('.', ','); return f.evaluacion === 'semanal' ? `SMA de ${p} semanas (semanal)` : `SMA ${p} (diario)` }
export const esConfigFiltro = (config) => config?.regla?.id === 'filtro'
const baTexto = (r) => r?.bajoAgua ? textoBajoAgua(r.bajoAgua) : '—'
const caidaPV = (r) => r?.caidaMaxima == null ? '—' : r.bajoAgua?.pico ? `${pc1(r.caidaMaxima)} (${fechaEs(r.bajoAgua.pico)} → ${fechaEs(r.bajoAgua.valle)})` : pc1(r.caidaMaxima)
const peor = (r) => r?.peorAnio ? `${r.peorAnio.anio}: ${pc1(r.peorAnio.rentabilidad)}` : '—'
const euros0 = (x) => x == null ? '—' : num(x, 0) + ' €'
export const CAB_FILTRO = ['Periodo', 'CAGR', 'Caída máxima (pico → valle)', 'Tiempo bajo el agua', 'Peor año', 'CAGR / caída', 'Mezcla sin filtro: CAGR / caída', '¿Mejora a la mezcla?', 'Tiempo fuera', 'Salidas / entradas', 'Empieza', 'Valor final neto (10.000 €)']
export const filasFiltro = (periodos) => (periodos || []).map(p => [periodoCartera(p), pctR(p.cagr), caidaPV(p), baTexto(p), peor(p), num(p.cagrPorCaida, 2), num(p.referencias?.mitad?.cagrPorCaida, 2),
  p.mejoraMezcla ? 'sí' : 'no', pc1(p.filtro?.tiempoFuera), `${num(p.filtro?.salidas, 0)} / ${num(p.filtro?.entradas, 0)}`, p.filtro?.empiezaFuera ? 'FUERA' : 'DENTRO', euros0(p.impuestos?.valorFinalNeto)])
export const REFERENCIAS_FILTRO = [['mitad', 'Mezcla 50/50 sin filtro (rebalanceo anual)'], ['qqq', 'Comprar y mantener QQQ'], ['spy', 'Comprar y mantener SPY'], ['qqqFiltro', 'QQQ con el mismo filtro sin apalancar']]
export const CAB_FILTRO_REF = ['Periodo', 'Referencia', 'CAGR', 'Caída máxima (pico → valle)', 'Tiempo bajo el agua', 'Peor año', 'CAGR / caída', 'Tiempo fuera', 'Valor final neto (10.000 €)']
export const filasFiltroRef = (periodos) => (periodos || []).flatMap(p => REFERENCIAS_FILTRO.map(([k, n]) => { const r = p.referencias?.[k] || {}
  return [periodoCartera(p), n, pctR(r.cagr), caidaPV(r), baTexto(r), peor(r), num(r.cagrPorCaida, 2), r.tiempoFuera == null ? '—' : pc1(r.tiempoFuera), euros0(r.valorFinalNeto)] }))
export const CAB_AZAR_FILTRO = ['Periodo', 'Periodos FUERA (bloques)', 'Percentil del CAGR / caída', 'Azar: mediana', 'P5–P95', 'Simulaciones']
export const filasAzarFiltro = (periodos) => (periodos || []).map(p => [periodoCartera(p), num(p.ciclos, 0), num(p.azar?.percentil, 1), num(p.azar?.media, 2), p.azar?.p5 == null ? '—' : `${num(p.azar.p5, 2)} – ${num(p.azar.p95, 2)}`, p.azar?.nota || num(p.azar?.nSim, 0)])
export const CAB_FUERA = ['Salida', 'Vuelta', 'Días de mercado fuera', 'Rentabilidad de la cartera fuera']
export const filasFuera = (p) => (p?.tablaCiclos || []).map(c => [fechaEs(c.inicio), c.abierto ? 'sin volver (al final del periodo)' : fechaEs(c.fin), num(c.dias, 0), pc1(c.rentabilidad)])
export const CAB_ANIO_FILTRO = ['Año', 'Cartera', 'Mezcla sin filtro', 'QQQ', 'SPY', 'QQQ con filtro']
export const filasAnioFiltro = (p) => (p?.anioAnio || []).map(a => [a.anio, pctR(a.cartera), pctR(a.mezcla), pctR(a.qqq), pctR(a.spy), pctR(a.qqqFiltro)])
export const CAB_CAL_FILTRO = ['Universos', 'Falsos aprobados (>= 95 en el total)', 'Percentil medio', 'Deciles 0–10 … 90–100', 'Periodos FUERA medios', 'Tiempo fuera medio', 'Mejora a la mezcla sin ventaja', '¿Calibrada?']
export const filaCalibracionFiltro = (c) => c ? [num(c.universos, 0), `${num(c.pctAprobados, 1)} % (${c.aprobados} de ${c.universos})`, num(c.percentilMedio, 1), c.deciles.join(' · '), num(c.ciclosMedios, 1), `${num(c.tiempoFueraMedio, 1)} %`, `${num(c.pctMejoraMezcla, 1)} %`, c.calibrada ? 'sí' : 'NO'] : null
export const notaCalibracionFiltro = (l) => l ? `QQQ en paseo aleatorio sin ventaja (media log ${l.parametros?.derivaLogDiaria}, volatilidad ${l.parametros?.volatilidadDiaria} diarias, como el QQQ de 1999–2025), ETF sintético de V9.984 y liquidez al 0 %; ${l.parametros?.universos} universos, ${l.fecha}, ${l.version}.` : ''
export const notaMediaDesde = (ps) => { const p = (ps || []).find(x => x.filtro?.mediaDesde && x.filtro.mediaDesde > x.fechaIni); return p ? `Sin datos antes de ${fechaEs(p.fechaIni)} para calentar la media: el periodo empieza DENTRO y el filtro actúa desde el ${fechaEs(p.filtro.mediaDesde)}.` : '' }
function textoFiltro(d) {
  const c = d.clas || {}, ps = d.periodos || [], cal = c.oficial ? calibracionDe(c.lote, c.item) : null, l = calibracionLote('CARTERA_3'), tot = ps.find(p => p.total)
  const partes = [cabeceraMd({ ...d.cabecera, datos: [['Prueba', 'cartera: mezcla 50/50 con filtro de tendencia sobre el QQQ'], ['Regla', d.regla], ['ETF', nombreEtfCartera(d.config?.etf)], ['Liquidez', '0 %'],
    ['Tipo', c.oficial ? `oficial · ${c.lote} · ${c.item}` : 'exploratoria'], ['Cálculo', textoCalculo(calculoDeConfig(d.config))], ['Huella de la configuración', c.hash], ['Prueba registrada', d.id != null ? `id ${d.id}` : 'no guardada'],
    ['Veredicto (orientativo)', d.veredicto], ['Periodos FUERA', ps.map(p => `${periodoCartera(p)}: ${p.ciclos}`).join('; ')], ...(d.cabecera?.datos || [])] })]
  partes.push(`> ${AVISO_LIQUIDEZ} ETF sintéticos calibrados con los reales; antes de 2006 no existían: es una reconstrucción.`)
  partes.push(seccion('Regla (estados y transiciones)', d.config?.regla ? [...Object.entries(d.config.regla.estados).map(([k, e]) => `- **${k}**: ${e.composicion}`), '', ...d.config.regla.transiciones.map((t, i) => `${i + 1}. ${fraseTransicion(t, d.config.regla)}`), '', `Inicio de cada periodo: ${d.config.inicio || '—'}`].join('\n') : null))
  partes.push(seccion('Configuración', d.config ? '```json\n' + JSON.stringify(d.config, null, 1) + '\n```' : null))
  partes.push(seccion('Resultado por periodo', ps.length ? tablaMd(CAB_FILTRO, filasFiltro(ps)) + `\n\n${textoCriterio(c, c.oficial ? 'cartera' : 'filtro')} Precios de rentabilidad total. ${notaMediaDesde(ps)}` : null))
  partes.push(seccion('Referencias', ps.length ? tablaMd(CAB_FILTRO_REF, filasFiltroRef(ps)) : null))
  partes.push(seccion('Prueba contra el azar (los periodos FUERA reales colocados al azar, sin solaparse; medida CAGR / caída máxima)', ps.length ? tablaMd(CAB_AZAR_FILTRO, filasAzarFiltro(ps)) : null))
  partes.push(seccion(`Año a año · ${tot ? periodoCartera(tot) : '—'}`, tot?.anioAnio ? tablaMd(CAB_ANIO_FILTRO, filasAnioFiltro(tot)) : null))
  partes.push(seccion('Periodos FUERA más largos (hasta 15 por periodo)', ps.length ? ps.map(p => `### ${periodoCartera(p)} (${num(p.ciclos, 0)} en total)\n\n` + tablaMd(CAB_FUERA, filasFuera(p))).join('\n\n') : null))
  if (ps.some(p => p.costes)) partes.push(seccion(`Costes por operación (${textoCostesConfig(d.config?.costes)})`, tablaMd(CAB_COSTES, filasCostes(ps))))
  partes.push(seccion('Impuestos (estimación)', ps.length ? ps.map(p => `### ${periodoCartera(p)}\n\n` + tablaMd(cabImpuestos(p), filasImpuestos(p)) + `\n\n${resumenImpuestos(p)}`).join('\n\n') + `\n\n${notaImpuestos(ps[0])}` : null))
  partes.push(seccion('Calibración de esta variante', !c.oficial ? 'Exploratoria: no tiene calibración propia.' : cal ? tablaMd(CAB_CAL_FILTRO, [filaCalibracionFiltro(cal)]) + `\n\n${notaCalibracionFiltro(l)}` : 'Sin calibración: el azar no da veredicto.'))
  if (tot?.curva?.fechas) {
    const cada = Math.max(1, Math.ceil(tot.curva.fechas.length / 40)), filas = []
    for (let j = 0; j < tot.curva.fechas.length; j += cada) filas.push([fechaEs(tot.curva.fechas[j]), num(tot.curva.estrategia[j], 3), num(tot.curva.mitad[j], 3), num(tot.curva.qqq[j], 3), num(tot.curva.spy[j], 3)])
    partes.push(seccion(`Curva de ${periodoCartera(tot)} (valor de 1 al empezar; unos 40 puntos)`, tablaMd(['Fecha', 'Cartera', 'Mezcla sin filtro', 'QQQ', 'SPY'], filas)))
  }
  return partes.join('\n\n') + '\n'
}
export function textoCartera(d) {
  if (esConfigFiltro(d.config)) return textoFiltro(d)
  const c = d.clas || {}, ps = d.periodos || [], cal = c.oficial ? calibracionDe(c.lote, c.item) : null, l = calibracionLote('CARTERA_1')
  const partes = [cabeceraMd({ ...d.cabecera, datos: [['Prueba', 'cartera (máquina de estados sobre el QQQ y un ETF apalancado)'], ['Regla', d.regla], ['ETF', d.config?.etf],
    ['Tipo', c.oficial ? `oficial · ${c.lote} · ${c.item}` : 'exploratoria'], ['Cálculo', textoCalculo(calculoDeConfig(d.config))], ['Huella de la configuración', c.hash], ['Prueba registrada', d.id != null ? `id ${d.id}` : 'no guardada'],
    ['Veredicto (orientativo)', d.veredicto], ['Ciclos', ps.map(p => `${periodoCartera(p)}: ${p.ciclos}`).join('; ')], ...(d.cabecera?.datos || [])] })]
  partes.push(seccion('Regla (estados y transiciones)', d.config?.regla ? [...Object.entries(d.config.regla.estados).map(([k, e]) => `- **${k}**: ${e.composicion}`), '', ...d.config.regla.transiciones.map((t, i) => `${i + 1}. ${fraseTransicion(t, d.config.regla)}`)].join('\n') : null))
  partes.push(seccion('Configuración', d.config ? '```json\n' + JSON.stringify(d.config, null, 1) + '\n```' : null))
  partes.push(seccion('Resultado por periodo', ps.length ? tablaMd(CAB_CARTERA, filasCartera(ps)) + `\n\n${textoCriterio(c, 'cartera')} Precios de rentabilidad total (dividendos reinvertidos). Azar: los ciclos reales como bloques en fechas de inicio al azar, sin solaparse.` : null))
  partes.push(seccion('Referencias', ps.length ? tablaMd(CAB_CARTERA_REF, filasCarteraRef(ps)) : null))
  if (ps.some(p => p.comparacion)) partes.push(seccion(`Comparación con ${ps.find(p => p.comparacion).comparacion.nombre}`, tablaMd(CAB_COMPARACION, filasComparacion(ps))))
  partes.push(seccion('Ciclos', ps.length ? ps.map(p => `### ${periodoCartera(p)}\n\n` + tablaMd(CAB_CICLOS, filasCiclos(p, { corto: false }))).join('\n\n') : null))
  if (ps.some(p => p.costes)) partes.push(seccion(`Costes por operación (${textoCostesConfig(d.config?.costes)})`, tablaMd(CAB_COSTES, filasCostes(ps))))
  partes.push(seccion('Impuestos (estimación)', ps.length ? ps.map(p => `### ${periodoCartera(p)}\n\n` + tablaMd(cabImpuestos(p), filasImpuestos(p)) + `\n\n${resumenImpuestos(p)}`).join('\n\n') + `\n\n${notaImpuestos(ps[0])}` : null))
  partes.push(seccion('Calibración de esta variante', !c.oficial ? 'Exploratoria: no tiene calibración propia.' : cal ? tablaMd(CAB_CAL_CARTERA, [filaCalibracionCartera(cal)]) + `\n\nQQQ en paseo aleatorio sin ventaja (media log ${l?.parametros?.derivaLogDiaria}, volatilidad ${l?.parametros?.volatilidadDiaria} diarias; coste anual del ETF x2 ${l?.parametros?.costeAnual?.[2]}, x3 ${l?.parametros?.costeAnual?.[3]}), ${l?.fecha}, ${l?.version}.` : 'Sin calibración: el azar no da veredicto.'))
  const curvas = ps.find(p => p.total) || ps[ps.length - 1]
  if (curvas?.curva?.fechas) {
    const cada = Math.max(1, Math.ceil(curvas.curva.fechas.length / 40)), filas = []
    for (let j = 0; j < curvas.curva.fechas.length; j += cada) filas.push([fechaEs(curvas.curva.fechas[j]), num(curvas.curva.estrategia[j], 3), num(curvas.curva.qqq[j], 3), num(curvas.curva.mitad[j], 3), num(curvas.curva.spy[j], 3)])
    partes.push(seccion(`Curva de ${periodoCartera(curvas)} (valor de 1 al empezar; unos 40 puntos)`, tablaMd(['Fecha', 'Cartera', 'QQQ', '50/50', 'SPY'], filas)))
  }
  return partes.join('\n\n') + '\n'
}
// Comparación de una cartera con otra regla sobre los mismos datos (CARTERA_2 frente a V3 / V4).
export const CAB_COMPARACION = ['Periodo', 'CAGR', 'Comparada: CAGR', 'Caída máxima', 'Comparada: caída', 'Valor final neto', 'Comparada: neto', 'Comparada: ciclos', '¿Supera a la comparada?']
export const filasComparacion = (periodos) => (periodos || []).filter(p => p.comparacion).map(p => [periodoCartera(p), pctR(p.cagr), pctR(p.comparacion.cagr), pc1(p.caidaMaxima), pc1(p.comparacion.caidaMaxima),
  num(p.impuestos?.valorFinalNeto, 0) + ' €', num(p.comparacion.valorFinalNeto, 0) + ' €', num(p.comparacion.ciclos, 0), p.comparacion.supera ? 'sí' : 'no'])

// ── Exploraciones de cartera (curva de riesgo y mapa de sensibilidad) ──
export const AVISO_EXPLORACION = 'Exploración: sirve para ver la forma de los resultados y elegir el nivel de riesgo, no para escoger el máximo. Con pocos ciclos, el mejor valor suele ser suerte.'
export const CAB_CURVA = ['% en el ETF', 'Familia', 'CAGR', 'Caída máxima', 'Peor año', 'CAGR / caída', 'Valor final neto (10.000 €)', 'Ciclos']
export function filasCurva(periodo, familias) {
  const out = []
  for (const f of familias) for (const p of periodo.familias[f.id] || []) out.push([`${p.pct} %`, f.nombre, pctR(p.cagr), pc1(p.caidaMaxima), p.peorAnio ? `${p.peorAnio.anio}: ${pc1(p.peorAnio.rentabilidad)}` : '—', num(p.cagrPorCaida, 2), num(p.valorFinalNeto, 0) + ' €', f.id === 'mezcla' ? '—' : num(p.ciclos, 0)])
  const q = periodo.referencias?.qqq, s = periodo.referencias?.spy
  if (q) out.push(['—', 'Comprar y mantener QQQ', pctR(q.cagr), pc1(q.caidaMaxima), q.peorAnio ? `${q.peorAnio.anio}: ${pc1(q.peorAnio.rentabilidad)}` : '—', num(q.cagrPorCaida, 2), num(q.valorFinalNeto, 0) + ' €', '—'])
  if (s) out.push(['—', 'Comprar y mantener SPY', pctR(s.cagr), pc1(s.caidaMaxima), s.peorAnio ? `${s.peorAnio.anio}: ${pc1(s.peorAnio.rentabilidad)}` : '—', num(s.cagrPorCaida, 2), '—', '—'])
  return out
}
export const cabMapa = (parte) => ['Caída', ...parte.valores[0].porPeriodo.map(p => `CAGR ${periodoCartera(p)}`), 'Caída máxima (total)', 'Ciclos (total)', 'Percentil del azar (total)', 'Zona estable']
export const filasMapa = (parte) => parte.valores.map(v => { const t = v.porPeriodo.find(p => p.total)
  return [`${num(v.pct, 1)} %`, ...v.porPeriodo.map(p => pctR(p.cagr)), pc1(t?.caidaMaxima), num(t?.ciclos, 0), num(t?.percentil, 1), v.zonaEstable ? 'sí' : ''] })
export const textoFueraDeMuestra = (parte) => { const f = parte.fueraDeMuestra
  return `Elegido con el mejor CAGR solo en ${periodoCartera(f.eligeEn)}: caída del ${num(f.elegido, 1)} % (CAGR allí ${pctR(f.cagrElegidoEnPrimero)}). En ${periodoCartera(f.pruebaEn)}: ${pctR(f.cagrElegido)}, frente a la mediana de los 9 valores ${pctR(f.medianaNueve)}, al ${num(f.porDefecto, 0)} % por defecto ${pctR(f.cagrPorDefecto)} y a comprar y mantener QQQ ${pctR(f.cagrQqq)}.` }
// ── Prueba de estrés 1999–2025 con ETF sintéticos (V9.985) ──
export const AVISO_SINTETICOS = 'ETF sintéticos calibrados con los reales; antes de 2006 no existían: es una reconstrucción.'
export const VALIDACION_SINTETICOS = SINTETICOS
const signo = (x, d = 2) => x == null ? '—' : `${x >= 0 ? '+' : ''}${num(x * 100, d)}`
const caidaFechas = (c) => `${pc1(c.caida)} (${fechaEs(c.pico)} → ${fechaEs(c.valle)})`
// La validación de los sintéticos frente a QLD y TQQQ reales (lib/etfSinteticos.json, scripts/calibraSinteticos.js).
export const CAB_VALIDACION = ['Sintético', 'Frente a', 'Tramo', 'Ajuste anual', 'CAGR real', 'CAGR sintético', 'Diferencia media anual (puntos)', 'Diferencia media absoluta', 'Correlación diaria', 'Caída máxima real', 'Caída máxima sintética']
export const filasValidacion = (S = SINTETICOS) => Object.entries(S.calibracion).map(([k, c]) => { const v = S.validacion[c.frente]
  return [`×${k}`, c.frente, `${fechaEs(v.desde)} → ${fechaEs(v.hasta)} (${v.aniosCompletos} años completos)`, `${num(S.ajuste[k] * 100, 3)} % (+ comisión ${num(S.comision[k] * 100, 2)} % + ${k - 1} × tipo a corto)`,
    pctR(v.cagrReal), pctR(v.cagrSintetico), signo(v.diferenciaMediaAnual), num(v.diferenciaMediaAbsoluta * 100, 2), num(v.correlacionDiaria, 4), caidaFechas(v.caidaReal), caidaFechas(v.caidaSintetica)] })
export const avisoValidacion = (S = SINTETICOS) => Object.values(S.calibracion).filter(c => Math.abs(S.validacion[c.frente].diferenciaMediaAnual) > 0.01 || S.validacion[c.frente].diferenciaMediaAbsoluta > 0.01).map(c => `⚠ Frente a ${c.frente}, la diferencia media anual supera 1 punto.`)
export const CAB_VALIDACION_ANIOS = ['Año', 'QLD real', '×2 sintético', 'Diferencia (puntos)', 'TQQQ real', '×3 sintético', 'Diferencia (puntos)']
export function filasValidacionAnios(S = SINTETICOS) {
  const q = Object.fromEntries(S.validacion.QLD.anios.map(a => [a.anio, a])), t = Object.fromEntries(S.validacion.TQQQ.anios.map(a => [a.anio, a]))
  return [...new Set([...Object.keys(q), ...Object.keys(t)])].sort().map(a => [a, pctR(q[a]?.real), pctR(q[a]?.sintetico), signo(q[a]?.diferencia), pctR(t[a]?.real), pctR(t[a]?.sintetico), signo(t[a]?.diferencia)])
}
// Tiempo bajo el agua de la caída máxima: días naturales del pico a recuperarlo, o «sin recuperar».
export const textoBajoAgua = (b) => !b?.pico ? 'sin caída' : b.recuperacion ? `${num(b.dias, 0)} días (recupera el ${fechaEs(b.recuperacion)})` : `sin recuperar (${num(b.diasHastaElFinal, 0)} días hasta el final)`
export const CAB_ESTRES = ['% en el ETF', 'CAGR', 'Caída máxima (pico → valle)', 'Tiempo bajo el agua', 'Peor año', 'CAGR / caída', 'Valor final neto (10.000 €)']
const filaEstres = (nombre, p) => [nombre, pctR(p.cagr), p.bajoAgua?.pico ? `${pc1(p.caidaMaxima)} (${fechaEs(p.bajoAgua.pico)} → ${fechaEs(p.bajoAgua.valle)})` : pc1(p.caidaMaxima), textoBajoAgua(p.bajoAgua),
  p.peorAnio ? `${p.peorAnio.anio}: ${pc1(p.peorAnio.rentabilidad)}` : '—', num(p.cagrPorCaida, 2), p.valorFinalNeto == null ? '—' : num(p.valorFinalNeto, 0) + ' €']
export const filasEstres = (periodo) => [...periodo.puntos.map(p => filaEstres(`${p.pct} %`, p)),
  ...(periodo.referencias?.qqq ? [filaEstres('Comprar y mantener QQQ', periodo.referencias.qqq)] : []), ...(periodo.referencias?.spy ? [filaEstres('Comprar y mantener SPY', periodo.referencias.spy)] : [])]
export const cabAnioEstres = (parte) => ['Año', `${parte.anioAnio.pct} % en el ×${parte.k} (rebalanceo anual)`, 'QQQ', 'SPY']
export const filasAnioEstres = (parte) => parte.anioAnio.filas.map(f => [f.anio, pctR(f.cartera), pctR(f.qqq), pctR(f.spy)])
export function textoValidacionSinteticos(S = SINTETICOS) {
  return `> ${AVISO_SINTETICOS}\n\nCada día: rendimiento = k × rendimiento del QQQ (rentabilidad total) − coste; coste anual = comisión + (k − 1) × tipo a corto (letras del Tesoro a 3 meses, FRED DTB3) + un ajuste constante calibrado para que el CAGR del sintético sea el del real en su tramo. Apertura: k × el tramo cierre → apertura del QQQ. Calibrado en ${S.version || '—'}.\n\n`
    + tablaMd(CAB_VALIDACION, filasValidacion(S)) + (avisoValidacion(S).length ? '\n\n' + avisoValidacion(S).join('\n') : '\n\nDiferencia media anual por debajo de 1 punto en los dos.') + '\n\n### Año a año (real frente a sintético)\n\n' + tablaMd(CAB_VALIDACION_ANIOS, filasValidacionAnios(S))
}
// ── Mapa de la media (V9.987) ──
export const nombreLineaMapa = (l) => `${NOMBRE_ALCANCE[l.alcance] || l.alcance} · ${l.evaluacion === 'semanal' ? 'semanal' : 'diario'}`
export const cabMapaMedia = (l) => [l.evaluacion === 'semanal' ? 'SMA (semanas)' : 'SMA (días)', 'CAGR', 'Caída máxima', 'CAGR / caída', 'Tiempo fuera', 'Cambios', 'Zona estable',
  `CAGR / caída ${periodoCartera(l.fueraDeMuestra.eligeEn)}`, `CAGR / caída ${periodoCartera(l.fueraDeMuestra.pruebaEn)}`]
export const filasMapaMedia = (l) => l.valores.map(v => [num(v.periodo, 0), pctR(v.total.cagr), pc1(v.total.caidaMaxima), num(v.total.cagrPorCaida, 2), pc1(v.total.tiempoFuera), num(v.total.cambios, 0), v.zonaEstable ? 'sí' : '', num(v.elige.cagrPorCaida, 2), num(v.prueba.cagrPorCaida, 2)])
export const textoFueraMapa = (l) => { const f = l.fueraDeMuestra, u = l.evaluacion === 'semanal' ? ' semanas' : ''
  return `Elegida con el mejor CAGR / caída solo en ${periodoCartera(f.eligeEn)}: SMA ${f.elegido}${u} (allí ${num(f.enElige, 2)}). En ${periodoCartera(f.pruebaEn)}: ${num(f.enPrueba, 2)}, frente a la mediana de la línea ${num(f.mediana, 2)}${f.comparados.map(c => ` y a la SMA ${c.periodo}${u} ${num(c.enPrueba, 2)}`).join('')}.` }
export const textoZonaMapa = (l, zona) => { const zs = l.valores.filter(v => v.zonaEstable).map(v => v.periodo), u = l.evaluacion === 'semanal' ? ' semanas' : ' días'
  return `Mejor CAGR / caída del total: ${num(l.mejorTotal, 2)} (SMA ${l.mejorPeriodo}${u}). Zona estable (a menos del ${num(zona * 100, 0)} % del mejor): ${zs.length ? zs.join(', ') + u : 'ninguna'}.` }
export const CAB_REF_MAPA = ['Periodo', 'Mezcla sin filtro: CAGR', 'Caída', 'CAGR / caída', 'QQQ: CAGR', 'Caída', 'CAGR / caída']
export const filasRefMapa = (parte) => (parte.referencias || []).map(r => [`${periodoCartera(r)} (${r.papel === 'total' ? 'total' : r.papel === 'elige' ? 'para elegir' : 'para comprobar'})`, pctR(r.mezcla.cagr), pc1(r.mezcla.caidaMaxima), num(r.mezcla.cagrPorCaida, 2), pctR(r.qqq.cagr), pc1(r.qqq.caidaMaxima), num(r.qqq.cagrPorCaida, 2)])
export function textoExploracion(d) {
  const c = d.config || {}, partes = [cabeceraMd({ ...d.cabecera, datos: [['Exploración', c.nombre], ['Cálculo', textoCalculo(calculoDeConfig(c))], ['Combinaciones', c.combinaciones], ['Huella de la configuración', d.clas?.hash], ['Prueba registrada', d.id != null ? `id ${d.id}` : 'no guardada'], ...(d.cabecera?.datos || [])] })]
  partes.push(`> ${AVISO_EXPLORACION}`)
  if (c.tipo === 'estres') partes.push(seccion('Validación de los ETF sintéticos', textoValidacionSinteticos()))
  partes.push(seccion('Configuración', '```json\n' + JSON.stringify(c, null, 1) + '\n```'))
  for (const [etf, r] of Object.entries(d.partes || {})) {
    if (c.tipo === 'mapaMedia') partes.push(seccion(`Mapa de la media · ETF sintético ×${r.k}`, `> ${AVISO_LIQUIDEZ}\n\n### Referencias\n\n` + tablaMd(CAB_REF_MAPA, filasRefMapa(r)) + '\n\n'
      + r.lineas.map(l => `### ${nombreLineaMapa(l)}\n\n` + tablaMd(cabMapaMedia(l), filasMapaMedia(l)) + `\n\n${textoZonaMapa(l, c.zonaEstable)}\n\n**Fuera de muestra:** ${textoFueraMapa(l)}`).join('\n\n')
      + '\n\nCambios: salidas + entradas en el periodo total. Tiempo fuera: parte de los días fuera del mercado. Sin azar (es una exploración).'))
    else if (c.tipo === 'estres') partes.push(seccion(`Prueba de estrés · ETF sintético ×${r.k} · Mezcla fija con rebalanceo anual`, r.periodos.map(p => `### ${periodoCartera(p)} (${fechaEs(p.fechaIni)} → ${fechaEs(p.fechaFin)})\n\n` + tablaMd(CAB_ESTRES, filasEstres(p))).join('\n\n')
      + `\n\n### Año a año · ${periodoCartera(r.periodos.find(p => p.total))}\n\n` + tablaMd(cabAnioEstres(r), filasAnioEstres(r)) + '\n\nValor final neto: estimación con 10.000 € al empezar (ventas FIFO al rebalancear y al final, tramos del ahorro). Tiempo bajo el agua: días naturales desde el pico de la caída máxima hasta volver a él.'))
    else if (c.tipo === 'curvaRiesgo') partes.push(seccion(`Curva de riesgo · ${etf}`, r.periodos.map(p => `### ${periodoCartera(p)}\n\n` + tablaMd(CAB_CURVA, filasCurva(p, c.familias))).join('\n\n')))
    else partes.push(seccion(`Mapa de sensibilidad · ${etf}`, tablaMd(cabMapa(r), filasMapa(r)) + `\n\nZona estable: CAGR total a menos de ${c.zonaEstablePuntos} punto del mejor (${pctR(r.mejorTotal)}).\n\n**Fuera de muestra:** ${textoFueraDeMuestra(r)}`))
  }
  return partes.join('\n\n') + '\n'
}
// d = { cabecera, regla, clas { hash, oficial, lote, item }, config, veredicto, periodos, datos [{ simbolos, sinDatos }], id }.
export function textoLaboratorio(d) {
  if (d.config?.prueba === 'exploracion') return textoExploracion(d)
  if (d.config?.prueba === 'cartera') return textoCartera(d)
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
    const datos = cabecera.filter(l => l.startsWith('- ') && CABECERA_LOTE.some(k => l.startsWith(`- ${k}:`)))
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
