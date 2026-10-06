// lib/diagnostico.js — diagnóstico de una estrategia a partir del resultado de su backtest.
//
// POR QUÉ EXISTE. Sergi quiere que la aplicación le diga cómo se COMPORTA cada estrategia, no solo
// cuánto gana: si sus reglas actúan, de dónde sale el beneficio, si es estable de un año a otro. Y lo
// quiere calculado por la propia aplicación, sin IA: cada frase sale de una plantilla y de números que
// se pueden comprobar a mano.
//
// QUÉ USA. Solo la respuesta que ya llega al cliente: `trades` (pnlSimple/pnlNeto, pnlPct, dias,
// exitReason, comision…) y, si la estrategia lo declara, `grafico` (órdenes y motivosPosibles). El
// motor no cambia. Función PURA: mismo resultado para los mismos datos, sin tocar nada.
//
// CADA BLOQUE SOLO SI HAY DATOS PARA CALCULARLO. Un bloque sin datos no se inventa: no aparece.
// Los casos llamativos llevan `aviso: true` y cuentan en el resumen («3 avisos»).

import { motivoDeSalida, coma } from './graficoPaneles'

// Umbrales de aviso, juntos para poder discutirlos.
export const UMBRALES = {
  concentracion: 50,        // % del beneficio que aportan las 3 mejores
  entradaMinima: 25,        // % de señales que acaban en entrada
  bloqueoMaximo: 50,        // % de señales bloqueadas por filtro
  rachaPerdedora: 5,        // pérdidas seguidas
  huecosMaximo: 30,         // % de entradas llenadas por encima del nivel de la orden
  sobrecosteMaximo: 1,      // % medio de sobrecoste en esas entradas
  comisionesMaximo: 20,     // % del beneficio bruto que se va en comisiones
}

const eur = (v) => `${coma(v, 2)} €`
const pct = (v, d = 1) => `${coma(v, d)} %`
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`
const comillas = (s) => `«${s}»`
// Resultado en euros de una operación: el neto si hubo comisiones, el simple si no.
const pnlDe = (t) => Number(t?.pnlNeto ?? t?.pnlSimple ?? 0)
const cerradas = (trades) => (trades || []).filter(t => t && !t._virtualClose && t.exitDate)

/**
 * @param {object} r   la respuesta del backtest individual: { trades, grafico }
 * @returns {{ bloques: {id, titulo, frases: string[], aviso: boolean, datos: object}[], avisos: number, resumen: string }}
 */
export function diagnostico(r) {
  const trades = Array.isArray(r?.trades) ? r.trades : []
  const grafico = r?.grafico && typeof r.grafico === 'object' ? r.grafico : null
  const ordenes = Array.isArray(grafico?.ordenes) ? grafico.ordenes : []
  const bloques = []
  const bloque = (id, titulo, frases, aviso = false, datos = {}) => bloques.push({ id, titulo, frases, aviso: !!aviso, datos })

  // ── 1. Embudo de señales ──
  if (ordenes.length) {
    const n = ordenes.length
    const ejec = ordenes.filter(o => o.fin === 'ejecutada').length
    const abiertas = ordenes.filter(o => o.fin === 'abierta').length
    const canc = {}, bloq = {}
    let nBloq = 0, nCanc = 0
    for (const o of ordenes) {
      if (o.fin === 'cancelada') { nCanc++; const m = o.motivo || 'sin motivo'; canc[m] = (canc[m] || 0) + 1 }
      if (o.fin === 'bloqueada') {
        nBloq++
        const nombres = String(o.motivo || '').replace(/^Filtro en rojo:?\s*/, '').split(', ').filter(Boolean)
        for (const f of (nombres.length ? nombres : ['filtro sin nombre'])) bloq[f] = (bloq[f] || 0) + 1
      }
    }
    const tasa = ejec / n * 100
    const frases = [`De ${plural(n, 'señal', 'señales')}, ${ejec} ${ejec === 1 ? 'acabó' : 'acabaron'} en entrada (${pct(tasa)}).`]
    const partes = []
    if (nCanc) partes.push(`${plural(nCanc, 'se canceló', 'se cancelaron')}: ${Object.entries(canc).map(([m, k]) => `${k} por ${comillas(m)}`).join(', ')}`)
    if (nBloq) partes.push(`${nBloq} ${nBloq === 1 ? 'la bloqueó' : 'las bloquearon'} los filtros (${Object.entries(bloq).map(([f, k]) => `${f}: ${k}`).join(', ')})`)
    if (abiertas) partes.push(`${plural(abiertas, 'sigue abierta', 'siguen abiertas')}`)
    if (partes.length) frases.push(partes.join('; ') + '.')
    const aviso = tasa < UMBRALES.entradaMinima || nBloq / n * 100 > UMBRALES.bloqueoMaximo
    if (aviso) frases.push(nBloq / n * 100 > UMBRALES.bloqueoMaximo
      ? `Los filtros bloquean más de la mitad de las señales: la estrategia depende sobre todo de ellos.`
      : `Muy pocas señales llegan a entrar: casi todas se pierden antes de llenarse.`)
    bloque('embudo', 'Embudo de señales', frases, aviso, { senales: n, ejecutadas: ejec, canceladas: canc, bloqueadas: bloq, abiertas, tasa })
  }

  // ── 2. Reglas que nunca actúan ──
  const cerr = cerradas(trades)
  const posibles = grafico?.motivosPosibles && typeof grafico.motivosPosibles === 'object' ? grafico.motivosPosibles : null
  const cancOcurridas = new Set(ordenes.filter(o => o.fin === 'cancelada' && o.motivo).map(o => o.motivo.toLowerCase()))
  const salOcurridas = new Set(cerr.filter(t => t.exitReason).map(t => String(t.exitReason)))
  // Un motivo de salida declarado vale como código (exitReason) o como texto (su traducción).
  const salidaOcurrio = (m) => {
    const x = String(m).toLowerCase()
    for (const r of salOcurridas) {
      const tr = motivoDeSalida({ exitReason: r })
      if (r.toLowerCase() === x || tr.largo.toLowerCase() === x || tr.corto.toLowerCase() === x) return true
    }
    return false
  }
  const textoSalida = (m) => { const tr = motivoDeSalida({ exitReason: m }); return tr.largo !== String(m).replace(/_/g, ' ') ? tr.largo : String(m) }
  if (posibles) {
    const nuncaCanc = (Array.isArray(posibles.cancelacion) ? posibles.cancelacion : []).filter(m => !cancOcurridas.has(String(m).toLowerCase()))
    const nuncaSal = (Array.isArray(posibles.salida) ? posibles.salida : []).filter(m => !salidaOcurrio(m))
    const frases = [
      ...nuncaCanc.map(m => `La cancelación por ${comillas(String(m).toLowerCase())} no se ha activado en este periodo.`),
      ...nuncaSal.map(m => `La regla de salida ${comillas(textoSalida(m))} no ha actuado en este periodo.`),
    ]
    if (!frases.length) frases.push('Todas las reglas de cancelación y de salida declaradas han actuado al menos una vez.')
    bloque('reglas', 'Reglas que nunca actúan', frases, nuncaCanc.length + nuncaSal.length > 0, { nuncaCancelacion: nuncaCanc, nuncaSalida: nuncaSal })
  } else if (grafico && (cancOcurridas.size || salOcurridas.size)) {
    // Solo para las estrategias que usan el contrato `grafico`: sin él, las salidas ya están en el bloque 3.
    const partes = []
    if (cancOcurridas.size) partes.push(`cancelaciones por ${[...new Set(ordenes.filter(o => o.fin === 'cancelada' && o.motivo).map(o => o.motivo))].map(comillas).join(', ')}`)
    if (salOcurridas.size) partes.push(`salidas: ${[...salOcurridas].map(r => comillas(motivoDeSalida({ exitReason: r }).largo)).join(', ')}`)
    bloque('reglas', 'Reglas que han actuado',
      [`Han actuado: ${partes.join('; ')}.`, 'La estrategia no declara todos sus motivos posibles (grafico.motivosPosibles), así que no se puede saber cuáles no han actuado nunca.'],
      false, { cancelacion: [...cancOcurridas], salida: [...salOcurridas] })
  }

  if (!trades.length) {
    bloque('sin-operaciones', 'Sin operaciones', ['La estrategia no ha hecho ninguna operación en este periodo: no hay resultados que analizar.'], false)
    return cierra(bloques)
  }

  // ── 3. Salidas por motivo ──
  if (cerr.length) {
    const cuenta = {}
    for (const t of cerr) { const m = motivoDeSalida(t).largo; cuenta[m] = (cuenta[m] || 0) + 1 }
    const orden = Object.entries(cuenta).sort((a, b) => b[1] - a[1])
    const frases = [orden.map(([m, k]) => `${m}: ${pct(k / cerr.length * 100)} (${k})`).join(' · ') + '.']
    const abiertas = trades.length - cerr.length
    if (abiertas) frases.push(`${plural(abiertas, 'operación sigue abierta', 'operaciones siguen abiertas')} al final del periodo y no cuenta${abiertas === 1 ? '' : 'n'} aquí.`)
    bloque('salidas', 'Salidas por motivo', frases, false, { cuenta, cerradas: cerr.length })
  }

  // ── 4. Concentración del beneficio ──
  {
    const total = trades.reduce((s, t) => s + pnlDe(t), 0)
    if (total > 0 && trades.length >= 4) {
      const mejores = [...trades].sort((a, b) => pnlDe(b) - pnlDe(a)).slice(0, 3)
      const top = mejores.reduce((s, t) => s + pnlDe(t), 0)
      const cuota = top / total * 100
      const sin = total - top
      const frases = [`Las 3 mejores operaciones aportan el ${pct(cuota)} del beneficio total (${eur(top)} de ${eur(total)}).`,
        sin >= 0 ? `Sin ellas, el resultado sería de ${eur(sin)}.` : `Sin ellas, el resultado sería negativo: ${eur(sin)}.`]
      bloque('concentracion', 'Concentración del beneficio', frases, cuota > UMBRALES.concentracion, { total, top, cuota, sin })
    } else if (total <= 0) {
      bloque('concentracion', 'Concentración del beneficio', [`El resultado total es ${total < 0 ? 'negativo' : 'cero'} (${eur(total)}): no hay beneficio que concentrar.`], false, { total })
    }
  }

  // ── 5. Estabilidad por año ──
  if (cerr.length) {
    const porAnio = {}
    for (const t of cerr) { const a = String(t.exitDate).slice(0, 4); porAnio[a] = (porAnio[a] || 0) + pnlDe(t) }
    const anios = Object.keys(porAnio).sort()
    const positivos = anios.filter(a => porAnio[a] > 0).length
    const lista = anios.map(a => `${a}: ${porAnio[a] >= 0 ? '+' : ''}${eur(porAnio[a])}`).join(' · ')
    if (anios.length === 1) {
      bloque('estabilidad', 'Estabilidad por año', [`Solo hay un año con operaciones cerradas (${lista}): no se puede medir la estabilidad entre años.`], false, { porAnio, positivos })
    } else {
      const aviso = positivos < anios.length / 2
      bloque('estabilidad', 'Estabilidad por año',
        [`${positivos} de ${anios.length} años positivos. ${lista}.`, ...(aviso ? ['Más de la mitad de los años terminan en pérdidas.'] : [])],
        aviso, { porAnio, positivos })
    }
  }

  // ── 6. Rachas ──
  if (cerr.length) {
    const orden = [...cerr].sort((a, b) => String(a.exitDate).localeCompare(String(b.exitDate)))
    let maxP = 0, maxG = 0, p = 0, g = 0
    for (const t of orden) {
      const v = pnlDe(t)
      if (v < 0) { p++; g = 0 } else if (v > 0) { g++; p = 0 } else { p = 0; g = 0 }
      maxP = Math.max(maxP, p); maxG = Math.max(maxG, g)
    }
    const aviso = maxP >= UMBRALES.rachaPerdedora
    bloque('rachas', 'Rachas', [`Como máximo, ${plural(maxP, 'pérdida seguida', 'pérdidas seguidas')} y ${plural(maxG, 'ganancia seguida', 'ganancias seguidas')}.`,
      ...(aviso ? [`Una racha de ${maxP} pérdidas seguidas pone a prueba la confianza en la estrategia.`] : [])], aviso, { maxPerdidas: maxP, maxGanancias: maxG })
  }

  // ── 7. Huecos de apertura ──
  {
    const nivelEntrada = new Map()
    for (const o of ordenes) {
      if (o.fin !== 'ejecutada' || !o.entryDate) continue
      const l = (o.niveles || []).find(x => x.date === o.entryDate)
      if (l && Number.isFinite(l.precio)) nivelEntrada.set(o.entryDate, l.precio)
    }
    const conOrden = trades.filter(t => nivelEntrada.has(t.entryDate) && Number.isFinite(t.entryPrice))
    if (conOrden.length) {
      const huecos = conOrden.filter(t => t.entryPrice > nivelEntrada.get(t.entryDate) * (1 + 1e-9))
      const cuota = huecos.length / conOrden.length * 100
      const sobre = huecos.length ? huecos.reduce((s, t) => s + (t.entryPrice / nivelEntrada.get(t.entryDate) - 1) * 100, 0) / huecos.length : 0
      const aviso = cuota > UMBRALES.huecosMaximo || sobre > UMBRALES.sobrecosteMaximo
      bloque('huecos', 'Huecos de apertura', [huecos.length
        ? `${pct(cuota)} de las entradas (${huecos.length} de ${conOrden.length}) se llenaron en la apertura por encima del nivel de la orden, con un sobrecoste medio del ${pct(sobre, 2)}.`
        : `Ninguna de las ${conOrden.length} entradas se llenó por encima del nivel de la orden.`], aviso, { entradas: conOrden.length, huecos: huecos.length, cuota, sobrecoste: sobre })
    }
  }

  // ── 8. Duración ──
  {
    const gan = cerr.filter(t => pnlDe(t) > 0 && Number.isFinite(t.dias)), per = cerr.filter(t => pnlDe(t) < 0 && Number.isFinite(t.dias))
    if (gan.length && per.length) {
      const mg = gan.reduce((s, t) => s + t.dias, 0) / gan.length, mp = per.reduce((s, t) => s + t.dias, 0) / per.length
      const aviso = mp > mg
      bloque('duracion', 'Duración', [`Las ganadoras duran de media ${coma(mg, 1)} días y las perdedoras ${coma(mp, 1)}.`,
        ...(aviso ? ['Las perdedoras duran más que las ganadoras: las pérdidas se dejan correr.'] : [])], aviso, { ganadoras: mg, perdedoras: mp })
    }
  }

  // ── 9. Comisiones ──
  {
    const conCom = trades.filter(t => Number.isFinite(t.comision))
    if (conCom.length) {
      const pagado = conCom.reduce((s, t) => s + t.comision, 0)
      const neto = trades.reduce((s, t) => s + pnlDe(t), 0)
      const bruto = neto + pagado
      const peso = bruto > 0 ? pagado / bruto * 100 : null
      const aviso = peso != null && peso > UMBRALES.comisionesMaximo
      bloque('comisiones', 'Comisiones', [peso != null
        ? `Se han pagado ${eur(pagado)} en comisiones: el ${pct(peso)} del beneficio antes de comisiones (${eur(bruto)}).`
        : `Se han pagado ${eur(pagado)} en comisiones, sobre un resultado antes de comisiones de ${eur(bruto)}.`], aviso, { pagado, bruto, peso })
    }
  }
  return cierra(bloques)
}

function cierra(bloques) {
  const avisos = bloques.filter(b => b.aviso).length
  return { bloques, avisos, resumen: avisos ? plural(avisos, 'aviso', 'avisos') : 'Sin avisos' }
}

export default diagnostico
