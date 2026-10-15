// lib/exportaTexto.js — «📋 Copiar para Claude»: el texto en Markdown compacto (tablas Markdown, coma decimal) de los
// resultados del optimizador y del multibacktest. Puro: da formato a los MISMOS objetos que pinta la pantalla (filas,
// conclusiones, robustez, walk-forward, pruebas contra el azar…) o a las celdas ya pintadas; no recalcula nada.
// Sin gráficos: de cada histograma basta con real, mediana, P5–P95 y percentil.
import { fmt } from './utils'
import { TEXTO_VEREDICTO, TEXTO_VEREDICTO_CAIDA } from './azar'
import { normalizaFiltrosEntrada, filtrosActivos } from './filtros'
import { resumenCurva } from './respuestaMc'

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
    ['Temporalidad', pet?.intervalo || 'diario'],
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
