// lib/graficoPaneles.js — qué dibuja el gráfico del backtest individual a partir de las velas, del
// `grafico` de la estrategia y de los indicadores del usuario. Funciones PURAS: no tocan
// lightweight-charts ni el DOM, así que se pueden probar sin navegador. CandleChart solo aplica el plan.
//
// LAS SERIES DECLARADAS (grafico.series, ver lib/graficoEstrategia.js) se reparten por su `panel`:
//   · 'precio'          sobre las velas, en la escala del precio.
//   · 'rsi' y 'macd'    en el panel de siempre de ese nombre, que comparten con el RSI/MACD de la
//                       estrategia de antes y con los del usuario.
//   · cualquier otro    en un panel propio, creado para él, después de los de siempre.
//
// UNA SERIE QUE YA SE DIBUJA NO SE DIBUJA DOS VECES. Las claves que datos.js mete en las velas (emaR,
// rsi, macdLine…) ya las pinta el código de siempre en su sitio. Si la estrategia las declara en ESE
// mismo sitio, la declaración solo aporta niveles, escala y nombre del panel. Si las declara en otro
// sitio, se ignora la declaración: dibujarla en dos paneles confundiría más que no hacerlo.
//
// LOS NIVELES DE LA ESTRATEGIA MANDAN. Si el panel lleva niveles declarados, sustituyen a los de siempre
// del RSI de la estrategia (sobrecompra, sobreventa y 50) y a los del usuario: tres juegos de rayas en
// el mismo panel no se leen. Sin niveles declarados todo queda como estaba.
//
// Sin `grafico`, planDeclarado devuelve un plan vacío y planPaneles devuelve exactamente los paneles de
// siempre, con las mismas condiciones.

// Campo de cada vela de chartData en el que datos.js deja cada clave de `indicators`, alias incluidos.
const CAMPO_EN_VELA = {
  emaR: 'emaR', emaFast: 'emaR', emaL: 'emaL', emaSlow: 'emaL', ema3: 'ema3',
  macdLine: 'macdLine', signalLine: 'signalLine', histogram: 'histogram',
  rsi: 'rsiLine', rsiLine: 'rsiLine', rsiMA: 'rsiMA',
  bbUpper: 'bbUpper', bbMid: 'bbMid', bbLower: 'bbLower',
  volume: 'volume', volumeAvg: 'volumeAvg',
}
// Dónde las dibuja ya CandleChart. El volumen y su media van en las velas pero el gráfico no los pinta
// como de la estrategia, así que no están aquí: declarados, se dibujan donde diga su panel.
const PANEL_DE_SIEMPRE = {
  emaR: 'precio', emaL: 'precio', ema3: 'precio', bbUpper: 'precio', bbMid: 'precio', bbLower: 'precio',
  macdLine: 'macd', signalLine: 'macd', histogram: 'macd', rsiLine: 'rsi', rsiMA: 'rsi',
}
// Colores por defecto de las declaradas sin color, distintos de los de las series de siempre.
const COLORES = ['#00d4ff', '#f0c040', '#e879f9', '#a3e635', '#fb923c', '#7dd3fc', '#f472b6', '#94a3b8']
// Alto por defecto de un panel de indicador. Era 120: con la escala fija 0-100 el RSI quedaba casi
// plano y las etiquetas del eje se pisaban. Cada panel se puede ajustar arrastrando su borde superior, y
// el alto se recuerda por tipo de panel (ver altoPanelDe y CandleChart).
export const ALTO_PANEL_DEFECTO = 180
export const ALTO_PANEL_MIN = 80
export const ALTO_PANEL_MAX = 600
const ALTO_PANEL = ALTO_PANEL_DEFECTO
// Alto de un panel: el guardado si es razonable, el de por defecto si no.
export function altoPanelDe(altos, id) {
  const h = Number(altos?.[id])
  return Number.isFinite(h) && h >= ALTO_PANEL_MIN && h <= ALTO_PANEL_MAX ? Math.round(h) : ALTO_PANEL_DEFECTO
}

// Número con COMA decimal, como en el resto de la aplicación (f2 de lib/utils.js, con los decimales
// que se pidan). Lo usan las marcas, las etiquetas y el eje de precios del gráfico.
export function coma(v, dec = 2) {
  if (v == null || !Number.isFinite(Number(v))) return '-'
  return Number(v).toLocaleString('es-ES', { minimumFractionDigits: dec, maximumFractionDigits: dec })
}

const finito = (v) => typeof v === 'number' && Number.isFinite(v)

// Valores alineados por índice con las velas → puntos {time, value}, sin nulos ni no finitos.
function aPuntos(valores, data) {
  const out = []
  for (let i = 0; i < data.length && i < valores.length; i++) {
    if (finito(valores[i])) out.push({ time: data[i].date, value: valores[i] })
  }
  return out
}

/**
 * Series declaradas por la estrategia, ya convertidas en lo que hay que dibujar.
 * @returns {{ precio: Spec[], paneles: { id, nombres: string[], escala, niveles, series: Spec[] }[] }}
 *   Spec = { clave, nombre, tipo: 'linea'|'histograma', color, puntos, escala }
 */
export function planDeclarado(data, grafico) {
  const plan = { precio: [], paneles: [] }
  if (!grafico || !Array.isArray(grafico.series) || !grafico.series.length) return plan
  if (!Array.isArray(data) || !data.length) return plan
  const porPanel = new Map()
  const panel = (id) => {
    if (!porPanel.has(id)) porPanel.set(id, { id, nombres: [], escala: null, niveles: [], series: [] })
    return porPanel.get(id)
  }
  grafico.series.forEach((s, i) => {
    if (!s || typeof s.clave !== 'string') return
    const destino = typeof s.panel === 'string' && s.panel ? s.panel : 'precio'
    const campo = CAMPO_EN_VELA[s.clave]
    const deSiempre = campo ? PANEL_DE_SIEMPRE[campo] : undefined
    if (deSiempre && deSiempre !== destino) return          // ya se dibuja en otro sitio: no se duplica
    let puntos = null
    if (!deSiempre) {
      if (Array.isArray(s.valores)) puntos = aPuntos(s.valores, data)
      else if (campo) puntos = aPuntos(data.map(d => d[campo]), data)
    }
    const spec = puntos && puntos.length ? {
      clave: s.clave, nombre: s.nombre || s.clave, tipo: s.tipo === 'histograma' ? 'histograma' : 'linea',
      color: s.color || COLORES[i % COLORES.length], puntos, escala: s.escala || null,
    } : null
    if (destino === 'precio') { if (spec) plan.precio.push(spec); return }
    const p = panel(destino)
    p.nombres.push(s.nombre || s.clave)
    if (!p.escala && s.escala) p.escala = s.escala
    for (const n of (Array.isArray(s.niveles) ? s.niveles : [])) {
      if (finito(n?.valor)) p.niveles.push({ valor: n.valor, texto: n.texto || '', color: n.color || null })
    }
    if (spec) p.series.push(spec)
  })
  // La escala es del PANEL: todas sus series declaradas la comparten, aunque solo una la traiga.
  for (const p of porPanel.values()) for (const sp of p.series) if (!sp.escala) sp.escala = p.escala
  plan.paneles = [...porPanel.values()]
  return plan
}

/**
 * Paneles que hay que montar, en orden: primero los de siempre (MACD, RSI) y después los propios de la
 * estrategia. Cada uno dice qué lleva de cada fuente.
 * @param base        la lista PANELES_INDICADORES de CandleChart
 * @param usuario     indicadores del usuario ya calculados, por destino (calculaIndicadoresUsuario)
 * @returns [{ id, base, propias, declarado, usuario, alto, etiqueta, nivelesDeclarados }]
 */
export function planPaneles(base, data, indType, declarado, usuario) {
  const porId = new Map((declarado?.paneles || []).map(p => [p.id, p]))
  const out = []
  for (const b of base || []) {
    const propias = !!b.hayDatos(data, indType)
    const delUsuario = usuario?.[b.id] || []
    const dec = porId.get(b.id) || null
    porId.delete(b.id)
    out.push({ id: b.id, base: b, propias, declarado: dec, usuario: delUsuario,
      hay: propias || delUsuario.length > 0 || !!dec,
      nivelesDeclarados: !!dec?.niveles.length })
  }
  for (const dec of porId.values()) {
    out.push({ id: dec.id, base: null, propias: false, declarado: dec, usuario: [], hay: true,
      alto: ALTO_PANEL, etiqueta: dec.nombres.join(' · ') || dec.id, nivelesDeclarados: dec.niveles.length > 0 })
  }
  return out
}

/**
 * Flechas de entrada y salida de cada operación. Antes se suprimían si las velas traían un RSI
 * (`_isRsiMode`); ya no: las flechas son lo que dice cuándo se entró y se salió, y sin ellas no se puede
 * comprobar nada a ojo.
 * Las flechas NO dependen del botón Razonamiento. Lo único que depende de él es el TEXTO de la de
 * salida —su motivo, en corto—: con el botón apagado sale vacío, como siempre.
 * @returns {{ nativas: object[], oblicuas: object[] }} marcadores de lightweight-charts y del SVG
 */
export function flechasDeOperaciones(trades, visuals, razonamiento = false) {
  const nativas = [], oblicuas = []
  if (visuals?.arrows === false) return { nativas, oblicuas }
  ;(trades || []).forEach(t => {
    const _as = visuals?.arrowsShape || 'arrowUp'
    const _asExit = _as === 'arrowUp' ? 'arrowDown' : _as === 'arrowDown' ? 'arrowUp' : _as
    if (_as === 'oblicua') {
      if (t.entryDate) oblicuas.push({ date: t.entryDate, anchor: 'low', text: '↗', color: visuals?.arrowsColor || '#00d4ff' })
      if (t.exitDate)  oblicuas.push({ date: t.exitDate, anchor: 'high', text: '↘', color: t.pnlPct >= 0 ? '#00e5a0' : '#ff4d6d' })
    } else {
      if (t.entryDate) nativas.push({ time: t.entryDate, position: 'belowBar', color: visuals?.arrowsColor || '#00d4ff', shape: _as, text: '' })
      if (t.exitDate)  nativas.push({ time: t.exitDate, position: 'aboveBar', color: t.pnlPct >= 0 ? '#00e5a0' : '#ff4d6d', shape: _asExit,
        text: razonamiento ? motivoDeSalida(t).corto : '' })
    }
  })
  return { nativas, oblicuas }
}

// ── Razonamiento: eventos de la estrategia, motivo de salida y cambios de stop ─────────────────────
//
// Lo que explica cada operación. Solo se dibuja con el botón «Razonamiento» encendido; las flechas y las
// líneas de siempre no dependen de él.
//
// MOTIVOS DE SALIDA. Las estrategias los escriben en exitReason con nombres internos, y con más de una
// forma para lo mismo. Esta tabla los traduce a castellano llano: un texto corto para la marca y uno largo
// para el tooltip. Están TODOS los que aparecen en el code_js de las estrategias de la base de datos más
// los dos que pone el motor (virtual_close y filter_exit). Uno que no esté aquí se enseña tal cual, sin
// guiones bajos: mejor un nombre interno que nada.
const MOTIVOS_SALIDA = {
  stop:              ['Stop',          'Salida por el stop'],
  stop_fijo:         ['Stop fijo',     'Salida por el stop fijo'],
  trailing_stop:     ['Trailing',      'Salida por el stop dinámico (trailing)'],
  trailing_exit:     ['Trailing',      'Salida por el stop dinámico (trailing)'],
  stop_emergencia:   ['Emergencia',    'Salida de emergencia'],
  stop_atr:          ['Stop ATR',      'Salida por el stop de ATR'],
  target:            ['Objetivo',      'Objetivo de beneficio alcanzado'],
  signal:            ['Señal',         'Señal de salida de la estrategia'],
  ema_cross_down:    ['Cruce medias',  'Cruce a la baja de las medias'],
  close_below_ema20: ['Bajo EMA20',    'Cierre por debajo de la EMA20'],
  cross_below_ema:   ['Bajo la EMA',   'Cruce del precio a la baja de la EMA'],
  bajo_media:        ['Bajo la media', 'Cierre por debajo de la media'],
  rotura_low_ema:    ['Rompe mínimo',  'Rotura del mínimo de la vela que cerró bajo la EMA'],
  cross_down:        ['Cruce bajista', 'Cruce bajista'],
  cross_baj:         ['Cruce bajista', 'Cruce bajista'],
  macd_cross:        ['Cruce MACD',    'Cruce del MACD con su señal'],
  macd_cross_down:   ['Cruce MACD',    'Cruce a la baja del MACD con su señal'],
  hist_bajo_cero:    ['Histograma <0', 'Histograma del MACD por debajo de cero'],
  slope_down:        ['Pendiente',     'Cambio de pendiente a la baja'],
  virtual_close:     ['Abierta',       'Sigue abierta: cierre ficticio al final del periodo'],
  filter_exit:       ['Filtro',        'Salida por el filtro de mercado'],
}
export const MOTIVOS_CONOCIDOS = Object.keys(MOTIVOS_SALIDA)

export function motivoDeSalida(t) {
  const r = t?._virtualClose ? 'virtual_close' : t?.exitReason
  if (r == null || r === '') return { corto: '', largo: 'Salida' }
  const m = MOTIVOS_SALIDA[r]
  if (m) return { corto: m[0], largo: m[1] }
  const txt = String(r).replace(/_/g, ' ')
  return { corto: corta(txt), largo: txt }
}

// Aspecto de cada tipo de evento. En un panel propio la marca va SOBRE la línea (inBar): un cruce del RSI
// con 55 se ve justo donde cruza.
const ESTILO_EVENTO = {
  armado: { shape: 'circle', color: '#c084fc', posicion: 'belowBar' },
  senal:  { shape: 'square', color: '#f0c040', posicion: 'aboveBar' },
  cruce:  { shape: 'circle', color: '#00d4ff', posicion: 'aboveBar' },
  aviso:  { shape: 'square', color: '#ff9f43', posicion: 'aboveBar' },
}
const MAX_TEXTO_MARCA = 24
// Texto de la marca: si no cabe, se corta, y el entero queda en el tooltip.
function corta(s) { return s.length > MAX_TEXTO_MARCA ? s.slice(0, MAX_TEXTO_MARCA - 1).trimEnd() + '…' : s }
const precio2 = (v) => coma(v, 2)

/**
 * Marcas del razonamiento, listas para lightweight-charts.
 * @param data      velas del gráfico (chartData)
 * @param trades    operaciones (con exitReason y stopHistory)
 * @param grafico   el `grafico` normalizado de la estrategia, o null
 * @param razonamiento  el botón: apagado, todo vacío
 * @param paneles   ids de los paneles que existen además del precio (los declarados)
 * @returns {{ precio: object[], paneles: Object<string, object[]>, notas: Map<string, {texto,color}[]>,
 *             ordenes: { id, puntos, color, abierta, heredada, titulo }[] }}
 *   `notas` es el texto completo de cada vela, para el tooltip. `ordenes`, las líneas de las órdenes
 *   pendientes de la estrategia (ver el punto 3).
 */
export function marcasRazonamiento(data, trades, grafico, razonamiento, paneles) {
  const out = { precio: [], paneles: {}, notas: new Map(), ordenes: [] }
  if (!razonamiento || !Array.isArray(data) || !data.length) return out
  const fechas = new Set(data.map(d => d.date))
  const existe = paneles instanceof Set ? paneles : new Set(paneles || [])
  const nota = (fecha, texto, color) => {
    if (!out.notas.has(fecha)) out.notas.set(fecha, [])
    out.notas.get(fecha).push({ texto, color })
  }
  // 1. Eventos declarados por la estrategia, en su panel y en la vela de su fecha. Una fecha que no es
  //    una vela del gráfico —fuera del periodo— no se marca.
  for (const e of (Array.isArray(grafico?.eventos) ? grafico.eventos : [])) {
    if (!e || !fechas.has(e.date)) continue
    const estilo = ESTILO_EVENTO[e.tipo]
    if (!estilo) continue
    const panel = e.panel || 'precio'
    if (panel !== 'precio' && !existe.has(panel)) continue
    const extra = Number.isFinite(e.precio) ? precio2(e.precio) : Number.isFinite(e.valor) ? precio2(e.valor) : ''
    const largo = [e.texto || e.tipo, extra].filter(Boolean).join(' · ')
    const marca = { time: e.date, position: panel === 'precio' ? estilo.posicion : 'inBar', color: estilo.color,
      shape: estilo.shape, size: 1, text: corta(largo) }
    if (panel === 'precio') out.precio.push(marca)
    else (out.paneles[panel] ||= []).push(marca)
    nota(e.date, largo, estilo.color)
  }
  // 2. Deducido de las operaciones: cada cambio de stop, en la vela que lo decidió (la fecha que trae
  //    stopHistory), con una marca pequeña; y el motivo de la salida, en el tooltip (en la flecha va el
  //    corto, ver flechasDeOperaciones).
  for (const t of trades || []) {
    const hist = Array.isArray(t?.stopHistory) ? t.stopHistory : []
    hist.forEach((h, i) => {
      if (!h || !fechas.has(h.date) || !Number.isFinite(h.stopPx)) return
      out.precio.push({ time: h.date, position: 'belowBar', color: '#ff4d6d', shape: 'circle', size: 0.5, text: '' })
      const inicial = i === 0 && t.entryDate && h.date <= t.entryDate
      nota(h.date, `${inicial ? 'Stop inicial' : 'Stop'} a ${precio2(h.stopPx)}`, '#ff4d6d')
    })
    if (t?.exitDate && fechas.has(t.exitDate)) {
      nota(t.exitDate, `Salida: ${motivoDeSalida(t).largo}`, t.pnlPct >= 0 ? '#00e5a0' : '#ff4d6d')
    }
  }
  // 3. Órdenes pendientes de la estrategia (grafico.ordenes, ya normalizadas: cada nivel en una vela vista
  //    y decidido con una vela anterior). Se dibujan como el stop, escalonadas, pero DISCONTINUAS y en
  //    naranja: un punto por cada vela en la que rige su nivel. La línea arranca en la vela que la decidió
  //    —la de señal— para que una orden de un solo nivel no quede en un punto invisible.
  //    · Ejecutada: termina en la vela de entrada, donde ya está la flecha.
  //    · Cancelada: ✕ en la vela de la cancelación, con el motivo en el tooltip.
  //    · Abierta: llega hasta la vela en curso (el normalizador ya la prolongó) y lleva su etiqueta en el
  //      eje. Nada que ver con las órdenes REALES del usuario (pendingOrders): esas son líneas que cruzan
  //      todo el gráfico, más gruesas y de otros colores, y no cambian.
  //    · Heredada del calentamiento: atenuada, y empieza en la primera vela del periodo.
  for (const o of (Array.isArray(grafico?.ordenes) ? grafico.ordenes : [])) {
    const niveles = (Array.isArray(o?.niveles) ? o.niveles : []).filter(l => l && fechas.has(l.date) && Number.isFinite(l.precio))
    if (!niveles.length) continue
    const heredada = !!o.heredada
    const color = heredada ? COLOR_ORDEN_HEREDADA : COLOR_ORDEN
    const puntos = []
    const d0 = niveles[0].decididaEn
    if (!heredada && d0 && fechas.has(d0) && d0 < niveles[0].date) puntos.push({ time: d0, value: niveles[0].precio })
    for (const l of niveles) puntos.push({ time: l.date, value: l.precio })
    const abierta = o.fin === 'abierta'
    out.ordenes.push({ id: o.id, puntos, color, abierta, heredada, titulo: abierta ? 'orden estrategia' : '' })
    const lado = o.lado === 'venta' ? 'venta' : 'compra'
    nota(puntos[0].time, heredada
      ? `Orden de ${lado} viva desde antes del periodo, a ${precio2(niveles[0].precio)}`
      : `Orden de ${lado} colocada a ${precio2(niveles[0].precio)}`, color)
    for (let i = 1; i < niveles.length; i++) {
      const a = niveles[i - 1].precio, b = niveles[i].precio
      if (b !== a && !niveles[i].prolongado) nota(niveles[i].date, `Orden ${b < a ? 'baja' : 'sube'} a ${precio2(b)}`, color)
    }
    const ult = niveles[niveles.length - 1]
    if (o.fin === 'cancelada' && o.finDate && fechas.has(o.finDate)) {
      out.precio.push({ time: o.finDate, position: 'aboveBar', color, shape: 'circle', size: 0, text: '✕' })
      nota(o.finDate, `Orden cancelada${o.motivo ? ': ' + o.motivo : ''}`, color)
    } else if (o.fin === 'ejecutada' && o.entryDate && fechas.has(o.entryDate)) {
      nota(o.entryDate, `Orden ejecutada (nivel ${precio2(ult.precio)})`, color)
    } else if (o.fin === 'bloqueada' && o.entryDate && fechas.has(o.entryDate)) {
      // Entrada que el filtro no dejó hacer: la orden se habría llenado aquí. Marca propia (⊘), distinta
      // de la ✕ de cancelación, y sin flecha: no hay operación.
      out.precio.push({ time: o.entryDate, position: 'belowBar', color, shape: 'circle', size: 0, text: '⊘' })
      nota(o.entryDate, `Entrada bloqueada: ${o.motivo || 'Filtro en rojo'}`, color)
    } else if (abierta) {
      nota(ult.date, `Orden abierta a ${precio2(ult.precio)}${ult.prolongado ? ', sigue en la vela en curso' : ''}`, color)
    }
  }
  return out
}
const COLOR_ORDEN = '#ff9f43'
const COLOR_ORDEN_HEREDADA = 'rgba(255,159,67,0.4)'

// ── Duplicados con los indicadores del usuario ───────────────────────────────────────────────────
//
// Cada serie declarada puede decir a qué indicador del catálogo EQUIVALE (`equivale`: tipo, periodo…).
// Si el usuario tiene activado ese mismo indicador —mismo tipo, mismos parámetros y mismo intervalo—, se
// dibuja SOLO el de la estrategia, que es el que decidió con velas cerradas: el del usuario se oculta en
// ESTE gráfico, sin tocar su lista, y la leyenda lo dice. Si el intervalo difiere —una EMA semanal
// calculada por la estrategia encima de velas diarias— no es el mismo indicador y se dibujan los dos.

// Intervalo de las velas del gráfico, por la separación mediana entre fechas.
export function intervaloDeVelas(data) {
  if (!Array.isArray(data) || data.length < 3) return 'diario'
  const saltos = []
  for (let i = 1; i < data.length && saltos.length < 60; i++) {
    const d = (Date.parse(data[i].date) - Date.parse(data[i - 1].date)) / 86400000
    if (Number.isFinite(d) && d > 0) saltos.push(d)
  }
  if (!saltos.length) return 'diario'
  saltos.sort((a, b) => a - b)
  return saltos[Math.floor(saltos.length / 2)] >= 5 ? 'semanal' : 'diario'
}
// Campo de la vela de una clave de `indicators` (las que datos.js mete en las velas), para la leyenda.
export const campoEnVela = (clave) => CAMPO_EN_VELA[clave] || null
// Parámetros que identifican a cada tipo, con los MISMOS valores por defecto con los que CandleChart los
// calcula (calculaIndicadoresUsuario).
const PARAMS_IGUALES = { rsi: [['periodo', 14]], macd: [['rapido', 12], ['lento', 26], ['senal', 9]],
  bollinger: [['periodo', 20], ['desviaciones', 2]] }
const mismosParams = (ind, eq) => (PARAMS_IGUALES[ind.tipo] || null)?.every(([k, d]) => Number(ind[k] ?? d) === Number(eq[k] ?? d)) ?? false
const rotuloMedia = (m) => `${(m.tipoMA || 'ema').toUpperCase()}${Number(m.periodo) || 20}`

/**
 * @param lista    indicadores del usuario (su lista, que NO se modifica)
 * @param grafico  el `grafico` de la estrategia
 * @param data     velas del gráfico (para saber su intervalo)
 * @returns {{ lista, ocultos: Map<idIndicador, string[]>, tambien: Set<claveDeclarada> }}
 *   `lista`: la que hay que dibujar (la MISMA si no hay duplicados); `ocultos`: qué se ha ocultado de cada
 *   indicador del usuario; `tambien`: las series de la estrategia que el usuario también tenía.
 */
export function quitaDuplicados(lista, grafico, data) {
  const igual = { lista, ocultos: new Map(), tambien: new Set() }
  const series = (Array.isArray(grafico?.series) ? grafico.series : []).filter(s => s?.equivale?.tipo)
  if (!series.length || !Array.isArray(lista) || !lista.length) return igual
  const intervalo = intervaloDeVelas(data)
  const ocultos = new Map(), tambien = new Set()
  const oculta = (id, texto) => { if (!ocultos.has(id)) ocultos.set(id, []); ocultos.get(id).push(texto) }
  let cambia = false
  const nueva = lista.map(ind => {
    if (!ind || ind.visible === false) return ind
    let copia = ind
    for (const s of series) {
      const eq = s.equivale
      if (eq.tipo !== ind.tipo) continue
      if (eq.intervalo && eq.intervalo !== intervalo) continue
      if (ind.tipo === 'medias') {
        const medias = Array.isArray(copia.medias) ? copia.medias : []
        let toca = false
        const nuevas = medias.map(m => {
          if (!m?.activa || (m.tipoMA || 'ema') !== (eq.tipoMA || 'ema') || (Number(m.periodo) || 20) !== Number(eq.periodo)) return m
          toca = true; oculta(ind.id, rotuloMedia(m))
          return { ...m, activa: false }
        })
        if (toca) { copia = { ...copia, medias: nuevas }; tambien.add(s.clave) }
      } else if (copia.visible !== false && mismosParams(ind, eq)) {
        copia = { ...copia, visible: false }; oculta(ind.id, s.nombre || s.clave); tambien.add(s.clave)
      }
    }
    if (copia !== ind) cambia = true
    return copia
  })
  return cambia ? { lista: nueva, ocultos, tambien } : igual
}

// ── Etiquetas de los niveles en el eje, sin pisarse ──────────────────────────────────────────────
// Con la escala fija, se sabe a cuántos píxeles queda cada nivel. Se recorren en orden —primero los que
// declara la estrategia, que mandan— y uno que caería a menos de `separacion` píxeles de otro ya
// etiquetado se queda sin etiqueta (la línea sí se dibuja). Sin escala fija no se puede saber y se
// etiquetan todos, como antes.
export function etiquetasDeNiveles(niveles, escala, alto, separacion = 16) {
  const lista = Array.isArray(niveles) ? niveles : []
  if (!escala || !(escala.max > escala.min) || !(alto > 0)) return lista.map(() => true)
  const util = alto * 0.9
  const y = (v) => (escala.max - v) / (escala.max - escala.min) * util
  const puestas = []
  return lista.map(n => {
    const yy = y(n.valor)
    const libre = puestas.every(p => Math.abs(p - yy) >= separacion)
    if (libre) puestas.push(yy)
    return libre
  })
}

export default { planDeclarado, planPaneles, flechasDeOperaciones, motivoDeSalida, marcasRazonamiento, quitaDuplicados,
  intervaloDeVelas, etiquetasDeNiveles, altoPanelDe, coma }
