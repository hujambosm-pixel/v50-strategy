// lib/periodo.js — el periodo del backtest y el calentamiento de los indicadores.
//
// POR QUÉ EXISTE. Hasta ahora ninguna ruta calentaba los indicadores. El `+ 1` año que pedían
// datos.js y multibacktest se descargaba y se TIRABA: el recorte ocurría antes de que la estrategia
// viera los datos, así que el `code_js` calculaba sus EMAs sobre el array ya recortado. En el modo
// Años no se notaba porque cinco años tapan el error de siembra mucho antes de que importe; en el
// modo Fechas era descarado. Medido con el rango 2024-01-02 → 2025-06-30: «Régimen alcista + stop
// ATR», que usa una MA200, pasaba de 65 operaciones a 34, y «33.1 Máximos históricos + ATR», con 52
// semanas, de 15 a 1. No es un sesgo: es que el indicador no existe durante los primeros N velas del
// periodo y la estrategia no puede operar.
//
// LA REGLA (la decide Sergi):
//   · La estrategia recibe la serie COMPLETA: calentamiento + periodo. No se toca ningún code_js.
//   · Solo cuentan las operaciones cuya ENTRADA esté dentro del periodo. Una entrada el primer día,
//     decidida con el cierre anterior, cuenta.
//   · El capital inicial empieza en la fecha de inicio; métricas y curvas, solo dentro del periodo.
//   · El cierre por fin de periodo va en la última vela CERRADA que no pase de la fecha de fin.
//   · Calentamiento = max(3 × el periodo más largo de esa corrida, 250 velas diarias / 60 semanales),
//     limitado a lo que haya disponible.
//
// POR QUÉ 3×, Y NO 2×. Medido sobre ^GSPC, error relativo máximo de una EMA en los 60 días
// siguientes al arranque, según cuántas velas previas tenga:
//     EMA10    1×: 0,199 %   2×: 0,012 %   3×: 0,016 %
//     EMA50    1×: 1,307 %   2×: 0,127 %   3×: 0,011 %
//     EMA100   1×: 0,673 %   2×: 0,158 %   3×: 0,029 %
//     EMA200   1×: 0,464 %   2×: 0,207 %   3×: 0,042 %
// Con 2× no se baja del 0,1 % en EMA100 ni en EMA200. Con 3× sí, y con margen.
//
// EL SUELO existe porque el periodo más largo se detecta de los `params`, y hay code_js que llevan
// algún periodo como literal dentro del código. 250 velas diarias y 60 semanales cubren con holgura
// todos los literales que se han encontrado en las estrategias habilitadas: el mayor es el 75 de
// «13 RSI», que sale de los 250 diarios. (Un `?? 52` como el de `params.barrasWarmup ?? 52` NO es una
// ventana de indicador: es un «no operes las primeras 52 velas». Ver abajo.)

// LO QUE EL SUELO NO ARREGLA. La familia «Máximos históricos» (33, 33.1, 33.2) no lleva ventana: su
// nivel es el máximo ACUMULADO de los high desde `bars[0]`, así que su señal depende de dónde empiece
// el array y no converge con más calentamiento —al contrario, cuanto más atrás empieza, más alto
// arranca el máximo y menos rupturas hay—. Medido: «33.2 Máximos + ATR + volumen» en ^GSPC da 0
// operaciones en 2024-01-02→2025-06-30 con las 250 velas de la regla y 8 si se ejecuta con toda la
// historia. No es un fallo del calentamiento: es que esas estrategias no tienen un resultado propio
// hasta que se les acote la ventana en el code_js. Está en el informe, sin tocar ningún code_js.
const SUELO = { diario: 250, semanal: 60 }
const VECES = 3
// Claves de params que son periodos de indicador. Lista por patrón y no cerrada: una estrategia nueva
// con `fooPeriod` entra sola. `mult`, `factor`, `thr` y compañía quedan fuera a propósito: son
// multiplicadores y umbrales, no ventanas.
const RE_CLAVE = /(period|periodo|ema|sma|^ma$|ma_|maPeriod|rsi|atr|bb|vol|length|lookback|ventana|window)/i
const RE_NO = /(mult|factor|thr|pct|stddev|desv|kAtr|ratio|peso|weight)/i

// MACD: sus tres params no son ventanas sueltas, y además ninguno de los tres nombres casa con
// RE_CLAVE, así que el MACD era invisible para el detector y caía en el suelo. La memoria efectiva es
// la EMA LENTA más la EMA de la SEÑAL, porque la señal se calcula encima de la línea: 26 + 9 = 35 en
// la configuración de serie. Medido: «7 MACD crossovers» en AAPL semanal entraba el 2024-05-20 con el
// suelo de 60 velas y el 2024-05-13 con toda la historia; con 3 × 35 = 105 coinciden.
function memoriaMacd(obj) {
  if (!obj || typeof obj !== 'object') return 0
  const lenta = Number(obj.macdSlow), senal = Number(obj.macdSignal)
  if (!Number.isFinite(lenta) || lenta < 2 || lenta > 2000) return 0
  return lenta + (Number.isFinite(senal) && senal >= 1 && senal <= 2000 ? senal : 0)
}

// El periodo más largo que usa una corrida: los params de la estrategia y los de sus filtros.
export function periodoMasLargo(params, filtros) {
  let max = 0
  const mira = (obj) => {
    const m = memoriaMacd(obj)
    if (m > max) max = m
    if (!obj || typeof obj !== 'object') return
    for (const [k, v] of Object.entries(obj)) {
      if (!RE_CLAVE.test(k) || RE_NO.test(k)) continue
      const n = Number(v)
      if (Number.isFinite(n) && n >= 2 && n <= 2000 && n > max) max = n
    }
  }
  let p = params
  if (typeof p === 'string') { try { p = JSON.parse(p) } catch (_) { p = null } }
  mira(p)
  for (const f of Array.isArray(filtros) ? filtros : []) {
    if (f?.activo === false) continue
    mira(f?.params)
  }
  return max
}

// Cuántas velas de calentamiento pedir.
export function velasCalentamiento(params, filtros, intervalo = 'diario') {
  const suelo = SUELO[intervalo === 'semanal' ? 'semanal' : 'diario']
  return Math.max(VECES * periodoMasLargo(params, filtros), suelo)
}

// Normaliza el periodo pedido a { desde, hasta }. «Últimos N años» es un caso particular:
// desde = hoy − N años, hasta = hoy. Así el resto del motor tiene UN solo camino.
export function normalizaPeriodo({ years, fromDate, toDate, hoy = new Date() } = {}) {
  if (fromDate && toDate) return { desde: String(fromDate), hasta: String(toDate), modo: 'rango' }
  const n = Math.max(1, Math.ceil(Number(years) || 5))
  const d = new Date(hoy.getTime())
  d.setFullYear(d.getFullYear() - n)
  return { desde: d.toISOString().slice(0, 10), hasta: hoy.toISOString().slice(0, 10), modo: 'anios' }
}

// Parte una serie en lo que ve la estrategia y lo que es el periodo.
//   conCalentamiento  desde `calentamiento` velas antes de `desde` hasta `hasta` — lo que recibe run()
//   periodo           de `desde` a `hasta` — gráfico, curvas, métricas y mapa de filtros
//   iDesde            índice de la primera vela del periodo dentro de conCalentamiento
//   calentamientoReal cuántas velas previas se han podido poner (puede ser menos de las pedidas)
export function recortaConCalentamiento(barras, desde, hasta, calentamiento) {
  const vacio = { conCalentamiento: [], periodo: [], iDesde: 0, calentamientoReal: 0 }
  if (!Array.isArray(barras) || !barras.length) return vacio
  const hastaOk = hasta || barras[barras.length - 1].date
  const dentro = barras.filter(b => b.date <= hastaOk)
  if (!dentro.length) return vacio
  let i0 = dentro.findIndex(b => b.date >= desde)
  if (i0 < 0) return { conCalentamiento: [], periodo: [], iDesde: 0, calentamientoReal: 0 }
  const pedidas = Math.max(0, Math.floor(calentamiento) || 0)
  const inicio = Math.max(0, i0 - pedidas)
  const conCalentamiento = dentro.slice(inicio)
  return {
    conCalentamiento,
    periodo: dentro.slice(i0),
    iDesde: i0 - inicio,
    calentamientoReal: i0 - inicio,
  }
}

// Posiciones que ya estaban abiertas al empezar el periodo: operaciones que entraron antes de `desde`
// y seguían vivas. Con la opción (a) la estrategia llega «dentro», así que no puede entrar hasta que
// salga, y eso explica por qué el periodo puede empezar sin operar. Se informa en el resumen para que
// el dato no haya que deducirlo.
export function posicionesHeredadas(trades, desde) {
  if (!Array.isArray(trades) || !desde) return []
  return trades
    .filter(t => t && t.entryDate && t.entryDate < desde && (!t.exitDate || t.exitDate >= desde))
    .map(t => ({ entryDate: t.entryDate, entryPrice: t.entryPrice ?? t.entryPx ?? null, exitDate: t.exitDate ?? null }))
}

// Devuelve los indicadores a la rejilla del PERIODO. Los calcula la estrategia sobre la serie con
// calentamiento, y se consumen alineados por ÍNDICE con las velas del periodo: datos.js los inyecta
// en chartData con `arr[i]` y asset-detail rechaza cualquier array cuya longitud no sea la de las
// barras. Sin este recorte las curvas saldrían desplazadas `iDesde` velas, que es exactamente el
// error que el calentamiento venía a arreglar. Si el array llega corto se rellena con null por el
// final (la vela en curso, que run() no vio pero el gráfico sí pinta). Los escalares —obLevel,
// osLevel— pasan intactos: no son series.
export function recortaIndicadores(indicators, iDesde, n) {
  if (!indicators || typeof indicators !== 'object') return {}
  const i0 = Math.max(0, Math.floor(iDesde) || 0)
  const largo = Math.max(0, Math.floor(n) || 0)
  const out = {}
  for (const [k, v] of Object.entries(indicators)) {
    if (!Array.isArray(v)) { out[k] = v; continue }
    const s = v.slice(i0, i0 + largo)
    while (s.length < largo) s.push(null)
    out[k] = s
  }
  return out
}

// Marcas con fecha —zonas de filtro, cruces, marcadores— que caen dentro del periodo. Las del
// calentamiento existen, porque la estrategia ha mirado esas velas de verdad, pero no son del
// backtest y el gráfico no tiene dónde pintarlas. Una marca sin fecha se conserva: no se puede
// decidir, y descartarla sería peor que dejarla pasar.
export function marcasDelPeriodo(lista, desde, hasta) {
  if (!Array.isArray(lista)) return []
  return lista.filter(m => {
    const f = m?.date ?? m?.from
    if (!f) return true
    return (!desde || f >= desde) && (!hasta || f <= hasta)
  })
}

export default { normalizaPeriodo, velasCalentamiento, periodoMasLargo, recortaConCalentamiento,
                 posicionesHeredadas, recortaIndicadores, marcasDelPeriodo }
