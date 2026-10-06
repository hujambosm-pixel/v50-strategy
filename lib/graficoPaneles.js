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
const ALTO_PANEL = 120

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
 * @returns {{ nativas: object[], oblicuas: object[] }} marcadores de lightweight-charts y del SVG
 */
export function flechasDeOperaciones(trades, visuals) {
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
      if (t.exitDate)  nativas.push({ time: t.exitDate, position: 'aboveBar', color: t.pnlPct >= 0 ? '#00e5a0' : '#ff4d6d', shape: _asExit, text: '' })
    }
  })
  return { nativas, oblicuas }
}

export default { planDeclarado, planPaneles, flechasDeOperaciones }
