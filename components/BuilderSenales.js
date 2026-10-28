// components/BuilderSenales.js — la pestaña «Señales en el gráfico» del paso 1 (V9.1050; V9.1054: docs/builder.md, §20).
// Arriba, en una fila: el valor (cualquiera con precios guardados), las fechas («Ensayo · 2010–2015» por defecto, u «Otras fechas»),
// las velas de la estrategia (solo se muestran) y una casilla por cada número de la regla, SOLO PARA PROBAR: no tocan la estrategia
// (la casilla cambiada dice «(guardado: X)»; «Volver a los guardados» y «Guardar estos valores en la estrategia» solo salen si algo
// es distinto de lo guardado). Debajo, el gráfico de precio (lightweight-charts) con las medias y los canales de la regla, la zona
// gris donde el filtro no deja comprar, las flechas de compra y venta y, DENTRO DEL MISMO GRÁFICO (la misma escala de tiempo), una
// franja por condición del filtro y de la compra; un panel por oscilador. A la derecha, las cifras de la regla frente a comprar y
// mantener: LAS DE «BACKTEST DE UN VALOR» (lib/builder/ensayo.js cifrasRegla: el mismo núcleo y la misma calcMetrics). Nada se
// guarda. Se recalcula solo, 250 ms después del último cambio.
//   def, valores: la estrategia en pantalla (con los cambios de «Tarjetas»); guardado: { def, valores } la guardada. cambios /
//   onCambios: las casillas de prueba ({ clave: valor }), que viven en el editor mientras está abierto. onGuardarValores(): guarda.
//   cargaSimbolos() → [símbolos] o [{ simbolo, nombre }] (V9.1058: el selector busca por ticker y por nombre); cargaVelas(simbolo) →
//   velas diarias; comisiones: las de «Backtest de un valor».
//   Para las pruebas de montaje: velasIniciales ({ simbolo: velas }), simbolosIniciales, simboloInicial, fechasInicial
//   ({ desde, hasta }: «Otras fechas»), cifrasIniciales, verZonaInicial (V9.1061: la zona gris del filtro, mostrada u oculta),
//   verOpsInicial (V9.1063: las líneas de las operaciones, mostradas u ocultas).
import { useState, useEffect, useRef, useMemo } from 'react'
import { B, S } from '../lib/builder/estilo'
import { calculaSenales } from '../lib/builder/senales'
import { leeFiltro, aTexto, deTexto } from '../lib/builder/tarjetas'
import { validaDefinicion, valoresDe } from '../lib/editor/definicion'
import { fechasEnsayo, tocaPaso2, NOTA_PASO2, camposDePrueba, valorCampo, aplicaPrueba, cifrasRegla, MIN_OPERACIONES } from '../lib/builder/ensayo'
import { fmt } from '../lib/utils'
import CampoFecha from './CampoFecha'
import BuscadorValor from './BuscadorValor'
import Ayuda from './BuilderAyuda'
import { NOTA_LINEA_SWING } from '../lib/builder/fichas'
import { tramosLinea, lineaOperacion, COLOR_GANA, COLOR_PIERDE } from '../lib/graficoPaneles'

const VERDE = '#3fb950', NARANJA = '#f0883e', MORADO = '#a371f7', AZUL = '#58a6ff', AMARILLO = '#f2cc60', ROJO = '#ff8b8b', VERDE_CIFRA = '#7ee2a0', GRIS_BH = '#8b98a8'
const fechaCorta = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
const ESPERA_MS = 250
// V9.1062: el «?» de los swings de la leyenda: los dos tramos y el stop rojo.
const AYUDA_SWINGS = `${NOTA_LINEA_SWING} El stop activo (rojo) solo se dibuja mientras hay una operación abierta; donde coincide con el mínimo de swing en vigor, se ve solo el rojo.`
const AYUDA = 'Las flechas son las compras (▲ verde, en la vela en que se compra) y las ventas (▼ naranja) que hace el motor con esta regla en este valor y estas fechas: las mismas de «Backtest de un valor» y de la prueba del paso 2. Las franjas de debajo de las velas dicen, vela a vela, si se cumple cada condición y cada pieza (la ruptura, tocar el stop, tener una operación abierta; pintado = sí) y van en la misma escala de tiempo: cada marca queda justo debajo de su vela, también al hacer zoom. La zona gris es donde el filtro no deja comprar.'
const AYUDA_ENSAYO = 'El ensayo son los años 2010–2015, ANTES de los que usa el paso 2 (2016–2025). Ajustar la regla mirando 2016–2025 y luego probarla en esos mismos años sería hacer trampa sin querer: la regla saldría bien porque se ha hecho a la medida de esos años. Ejemplo: si aquí cambias el máximo de 20 a 25 velas porque en 2010–2015 compra mejor, el paso 2 dirá después si eso funciona en años que no has mirado.'
const AYUDA_CASILLAS = 'Cada casilla es un número de la regla. Cambiarla es solo para probar: el gráfico y las cifras se recalculan al momento, pero la estrategia no cambia. Ejemplo: con «Compro: máximo de 20 velas», escribe 25 y verás las compras con 25; la estrategia sigue con 20 hasta que pulses «Guardar estos valores en la estrategia». Al salir del paso 1 y volver a entrar, salen siempre los valores guardados.'
const AYUDA_CIFRAS = 'Las mismas cifras que «Backtest de un valor» con este valor y estas fechas, con el 100 % del capital y su comisión (los filtros de su panel no cuentan: no son de la estrategia). Compuesto: cada operación usa todo el dinero acumulado. CAGR: lo que crece el dinero cada año, de media. Max Drawdown: la mayor caída desde un máximo. Win Rate: el % de operaciones que ganan. Factor de beneficio: lo ganado entre lo perdido (2 = se gana el doble de lo que se pierde). Tiempo invertido: el % del tiempo con la acción comprada. Ejemplo: CAGR 12 % con Tiempo invertido 40 % es crecer un 12 % al año estando dentro menos de la mitad del tiempo.'
export const LINEA_CIFRAS = (sym) => `Compuesto: cada operación usa todo el dinero acumulado. Referencia: comprar y mantener ${sym} en las mismas fechas. Comisión: la de «Backtest de un valor».`
const signo = (v, d = 2) => v == null || !Number.isFinite(v) ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmt(Math.abs(v), d)} %`

// ── El gráfico de precio con las franjas dentro, y los osciladores (solo en el navegador) ──
// V9.1061: el gráfico usa todo el ancho de su columna y el alto libre de la pantalla (como mínimo, MIN_PRECIO para las velas). El
// nombre de cada franja va en una línea fina de texto justo ENCIMA de su franja, alineado a la izquierda (ya no en una columna
// aparte): las velas, las franjas y los osciladores empiezan en el mismo borde izquierdo. H es el alto de la zona de dibujo (sin el
// eje de fechas): el gráfico se crea con H + el eje y, si el eje mide otra cosa, se corrige al momento, así que cada franja cae a la
// altura prevista. Sin el logo de lightweight-charts: el enlace a TradingView va debajo del gráfico. La zona gris del filtro, muy
// suave y DETRÁS de las velas (se crea antes que ellas); verZona la enseña u oculta sin rehacer el gráfico.
const ALTO_PRECIO = 360, MIN_PRECIO = 300, ETIQ = 14, BANDA = 10, FILA = ETIQ + BANDA + 2, HUECO = 8, ANCHO_EJE = 72, EJE_TIEMPO = 28, ALTO_OSC = 130
export const altoGrafico = (nFranjas, precio = ALTO_PRECIO) => precio + (nFranjas ? HUECO + nFranjas * FILA : 0)
export const COLOR_ZONA = 'rgba(139,155,173,0.045)'
// El alto que queda libre para las velas: lo que se ve del contenedor que hace scroll (o de la ventana), menos lo que hay encima del
// gráfico y lo que va debajo (las franjas, el eje, los osciladores y la línea de debajo).
function altoLibre(el, abajo) {
  let p = el.parentElement
  while (p && !/(auto|scroll)/.test(getComputedStyle(p).overflowY)) p = p.parentElement
  const arriba = p ? el.getBoundingClientRect().top - p.getBoundingClientRect().top + p.scrollTop : el.getBoundingClientRect().top + window.scrollY
  const visto = p ? p.clientHeight : window.innerHeight
  return Math.max(MIN_PRECIO, Math.floor(visto - arriba - abajo))
}
function Graficos({ r, verZona = true, verOps = true }) {
  const caja = useRef(null), precio = useRef(null), osc = useRef([]), zonaSerie = useRef(null), verZonaR = useRef(verZona), opsSeries = useRef([]), verOpsR = useRef(verOps)
  const franjas = r.franjas
  const [altoPrecio, setAltoPrecio] = useState(ALTO_PRECIO)
  const H = altoGrafico(franjas.length, altoPrecio)
  useEffect(() => {
    const abajo = (franjas.length ? HUECO + franjas.length * FILA : 0) + EJE_TIEMPO + r.osciladores.length * (ALTO_OSC + 26) + 44
    let h = null
    const mide = () => { if (!caja.current) return; const a = altoLibre(caja.current, abajo); setAltoPrecio(x => Math.abs(x - a) < 4 ? x : a) }
    const tarde = () => { clearTimeout(h); h = setTimeout(mide, 150) }
    mide(); window.addEventListener('resize', tarde)
    return () => { clearTimeout(h); window.removeEventListener('resize', tarde) }
  }, [franjas.length, r.osciladores.length])
  useEffect(() => { verZonaR.current = verZona; zonaSerie.current?.applyOptions({ visible: verZona }) }, [verZona])
  useEffect(() => { verOpsR.current = verOps; opsSeries.current.forEach(s => s.applyOptions({ visible: verOps })) }, [verOps])
  useEffect(() => {
    if (!precio.current || !r?.velas?.length) return
    let vivo = true, charts = []
    import('lightweight-charts').then(({ createChart, CrosshairMode, LineStyle, LineType }) => {
      if (!vivo || !precio.current) return
      // El eje de la derecha con el mismo ancho en todos: así los osciladores quedan alineados con las velas.
      const opciones = (alto) => ({ height: alto, layout: { background: { color: B.fondo }, textColor: B.secundario, fontFamily: B.letra, attributionLogo: false }, grid: { vertLines: { color: '#1b2430' }, horzLines: { color: '#1b2430' } },
        crosshair: { mode: CrosshairMode.Normal }, rightPriceScale: { borderColor: B.borde, minimumWidth: ANCHO_EJE }, timeScale: { borderColor: B.borde }, width: precio.current.clientWidth })
      const ch = createChart(precio.current, opciones(H + EJE_TIEMPO)); charts.push(ch)
      const altoDibujo = ch.paneSize?.().height
      if (altoDibujo > 0 && altoDibujo !== H) ch.resize(precio.current.clientWidth, H + EJE_TIEMPO + H - altoDibujo)
      const abajo = franjas.length ? (H - altoPrecio + 6) / H : 0.05
      // La zona gris donde el filtro no deja comprar: solo en la parte del precio, antes que las velas (queda detrás).
      zonaSerie.current = null
      if (r.bloqueado.some(Boolean) && franjas.some(f => f.tarjeta === 'filtro')) {
        const zona = ch.addHistogramSeries({ priceScaleId: 'zona', color: COLOR_ZONA, priceLineVisible: false, lastValueVisible: false, visible: verZonaR.current })
        ch.priceScale('zona').applyOptions({ scaleMargins: { top: 0, bottom: abajo - 0.01 }, visible: false })
        zona.setData(r.velas.map((v, k) => ({ time: v.date, value: r.bloqueado[k] ? 1 : 0 })))
        zonaSerie.current = zona
      }
      const velas = ch.addCandlestickSeries({ upColor: '#26a69a', downColor: '#ef5350', borderVisible: false, wickUpColor: '#26a69a', wickDownColor: '#ef5350' })
      ch.priceScale('right').applyOptions({ scaleMargins: { top: 0.05, bottom: abajo } })
      velas.setData(r.velas.map(v => ({ time: v.date, open: v.open, high: v.high, low: v.low, close: v.close })))
      const linea = (l, ancho = 2) => {
        const serie = () => ch.addLineSeries({ color: l.color, lineWidth: ancho, lineStyle: l.discontinua ? LineStyle.Dashed : LineStyle.Solid, lineType: l.escalera ? LineType.WithSteps : LineType.Simple, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false })
        // V9.1057: con tramos (el stop activo), una línea por tramo: una serie une sus puntos por encima de los huecos.
        if (l.tramos) { for (const t of l.tramos) serie().setData(t.map(([k, x]) => ({ time: r.velas[k].date, value: x }))); return }
        // V9.1062: los niveles de los swings, en tramos horizontales sueltos (lib/graficoPaneles.js tramosLinea); el punteado, tenue.
        if (l.segmentos) {
          const { puntos, sueltos } = tramosLinea(l.valores, r.velas.map(v => v.date))
          const s = () => ch.addLineSeries({ color: l.color, lineWidth: ancho, lineStyle: l.punteada ? LineStyle.Dotted : LineStyle.Solid, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false })
          if (puntos.length) s().setData(puntos)
          for (const p of sueltos) s().setData([p])
          return
        }
        serie().setData(r.velas.map((v, k) => l.valores[k] != null ? { time: v.date, value: l.valores[k] } : { time: v.date }))
      }
      for (const m of r.medias) linea(m)
      for (const c of r.canales || []) linea(c)
      // V9.1063: cada operación, una línea de la entrada a la salida (verde si gana, roja si pierde), la misma de «Backtest de un
      // valor»; verOps la enseña u oculta sin rehacer el gráfico.
      opsSeries.current = (r.operaciones || []).map(t => {
        const l = lineaOperacion(t), s = ch.addLineSeries({ color: l.color, lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, visible: verOpsR.current })
        s.setData(l.puntos)
        return s
      })
      // Las franjas: una serie de barras por condición, cada una en su banda (debajo de la línea de su nombre), en la MISMA escala de
      // tiempo que las velas.
      franjas.forEach((f, i) => {
        const id = `franja${i}`, y0 = altoPrecio + HUECO + i * FILA + ETIQ
        const s = ch.addHistogramSeries({ priceScaleId: id, priceLineVisible: false, lastValueVisible: false, base: 0 })
        ch.priceScale(id).applyOptions({ scaleMargins: { top: y0 / H, bottom: 1 - (y0 + BANDA) / H }, visible: false })
        const color = f.color || (f.tarjeta === 'filtro' ? MORADO : AZUL)   // (las de venta y las piezas traen el suyo)
        s.setData(r.velas.map((v, k) => ({ time: v.date, value: 1, color: f.cumple[k] === true ? color : 'rgba(139,155,173,0.10)' })))
      })
      const marcas = [...r.compras.map(c => ({ time: c.date, position: 'belowBar', color: VERDE, shape: 'arrowUp', text: '' })), ...r.ventas.map(c => ({ time: c.date, position: 'aboveBar', color: NARANJA, shape: 'arrowDown', text: '' }))].sort((a, b) => a.time.localeCompare(b.time))
      velas.setMarkers(marcas)
      // V9.1059: y un punto en la vela de cada swing (los máximos arriba, los mínimos abajo). V9.1061: un puntito de 2 px un poco por
      // encima del máximo (o por debajo del mínimo), para no tapar la vela (las marcas de lightweight-charts no bajan de un tamaño).
      for (const lado of ['max', 'min']) {
        const ps = (r.puntosSwing || []).filter(p => p.lado === lado).sort((a, b) => a.date.localeCompare(b.date))
        if (!ps.length) continue
        const s = ch.addLineSeries({ color: lado === 'max' ? VERDE : NARANJA, lineVisible: false, pointMarkersVisible: true, pointMarkersRadius: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false })
        s.setData(ps.map(p => ({ time: p.date, value: p.precio * (lado === 'max' ? 1.006 : 0.994) })))
      }
      ch.timeScale().fitContent()
      r.osciladores.forEach((o, j) => {
        const el = osc.current[j]; if (!el) return
        const c2 = createChart(el, opciones(ALTO_OSC)); charts.push(c2)
        o.lineas.forEach((l, k) => {
          const s = c2.addLineSeries({ color: k ? NARANJA : AZUL, lineWidth: 2, priceLineVisible: false, lastValueVisible: false })
          s.setData(r.velas.map((v, i) => l.valores[i] != null ? { time: v.date, value: l.valores[i] } : { time: v.date }))
          if (k === 0 && o.nivel != null) s.createPriceLine({ price: o.nivel, color: AMARILLO, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: String(o.nivel).replace('.', ',') })
        })
        c2.timeScale().fitContent()
      })
      // Los osciladores se mueven con el gráfico de precio (tienen las mismas velas, también los huecos sin dato).
      ch.timeScale().subscribeVisibleLogicalRangeChange(rg => { if (rg) charts.slice(1).forEach(c => c.timeScale().setVisibleLogicalRange(rg)) })
      const ajusta = () => charts.forEach(c => c.applyOptions({ width: precio.current?.clientWidth || 600 }))
      const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(ajusta) : null
      ro?.observe(precio.current)
      charts.ro = ro
    })
    return () => { vivo = false; zonaSerie.current = null; opsSeries.current = []; charts.ro?.disconnect(); charts.forEach(c => c.remove()) }
  }, [r, H])
  return (
    <div ref={caja}>
      <div style={{ position: 'relative' }}>
        <div ref={precio} data-grafico="precio" data-franjas={franjas.length} data-alto-precio={altoPrecio} style={{ width: '100%', minHeight: H + EJE_TIEMPO }}/>
        {franjas.map((f, i) => (
          <div key={i} data-franja={f.nombre} title={`${f.nombre} · ${f.cumple.filter(x => x === true).length} velas${f.frase && f.frase !== f.nombre ? `\n${f.frase}` : ''}`}
            style={{ position: 'absolute', left: 2, top: altoPrecio + HUECO + i * FILA, height: ETIQ, maxWidth: `calc(100% - ${ANCHO_EJE + 8}px)`, display: 'flex', alignItems: 'center', gap: 4, pointerEvents: 'none', zIndex: 3,
              fontSize: 11, lineHeight: `${ETIQ}px`, color: f.color || (f.tarjeta === 'filtro' ? MORADO : '#8db8ff'), background: 'rgba(15,20,25,0.85)', padding: '0 4px', borderRadius: 3, whiteSpace: 'nowrap', boxSizing: 'border-box' }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{f.nombre}</span>
            <span style={{ flexShrink: 0, color: B.secundario }}>· {f.cumple.filter(x => x === true).length} velas</span>
          </div>
        ))}
      </div>
      {r.osciladores.map((o, j) => (
        <div key={j} data-oscilador={o.nombre} style={{ marginTop: 8 }}>
          <div style={{ fontSize: 12, color: B.secundario }}>{o.nombre}{o.nivel != null ? ` · nivel ${aTexto(o.nivel)}` : ''}{o.lineas.length > 1 ? ' · MACD en azul, señal en naranja' : ''}</div>
          <div ref={el => { osc.current[j] = el }} style={{ width: '100%', minHeight: ALTO_OSC }}/>
        </div>
      ))}
    </div>
  )
}

// ── Las cifras de la derecha ──
function Curva100({ curvas }) {
  const a = curvas.regla, b = curvas.bh, W = 340, H = 130
  if (a.length < 2) return null
  const vals = [...a, ...b].map(p => p.value).filter(Number.isFinite), lo = Math.min(100, ...vals), hi = Math.max(100, ...vals)
  const x = (i, n) => (i / (n - 1)) * W, y = (v) => 6 + (1 - (v - lo) / ((hi - lo) || 1)) * (H - 12)
  const ruta = (cs) => cs.map((p, i) => `${x(i, cs.length).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ')
  return (
    <div data-curva100>
      <div style={{ position: 'relative' }}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height={H} role="img" aria-label="Cómo habría crecido 100: tu regla frente a comprar y mantener" style={{ display: 'block' }}>
          <line x1="0" x2={W} y1={y(100)} y2={y(100)} stroke={B.borde} strokeDasharray="3 3" vectorEffect="non-scaling-stroke"/>
          {b.length > 1 && <polyline points={ruta(b)} fill="none" stroke={GRIS_BH} strokeWidth="1.5" vectorEffect="non-scaling-stroke"/>}
          <polyline data-linea="regla" points={ruta(a)} fill="none" stroke={AZUL} strokeWidth="2.2" vectorEffect="non-scaling-stroke"/>
        </svg>
        <span style={{ position: 'absolute', left: 2, top: y(100) - 16, fontSize: 11, color: B.apagado }}>100</span>
      </div>
      <div style={{ display: 'flex', gap: 14, fontSize: 12, color: B.secundario, marginTop: 6, flexWrap: 'wrap' }}>
        <span><span style={{ display: 'inline-block', width: 14, height: 3, background: AZUL, verticalAlign: 'middle' }}/> Tu regla: {fmt(a[a.length - 1].value, 0)}</span>
        <span><span style={{ display: 'inline-block', width: 14, height: 3, background: GRIS_BH, verticalAlign: 'middle' }}/> Comprar y mantener: {fmt(b[b.length - 1]?.value, 0)}</span>
      </div>
    </div>
  )
}
// V9.1057: la fila «Comisiones pagadas»: lo que descuenta el núcleo de «Backtest de un valor» (lib/builder/ensayo.js cifrasRegla), con
// su cuenta. Solo comisión fija por compra: «30 × 0,36 € = 10,80 €» (V9.1060: solo el importe, sin el % del capital inicial).
export function textoComisiones(com) {
  const eur = (x) => `${fmt(x, 2)} €`, n = com.operaciones
  const tras = eur(com.total)
  if (!com.compra && !com.venta && !com.porcentaje) return '0,00 € · «Backtest de un valor» no tiene comisión'
  if (!com.venta && !com.porcentaje) return `${n} × ${eur(com.compra)} = ${tras}`
  const partes = [com.compra ? `${n} compras × ${eur(com.compra)}` : null, com.venta ? `${n} ventas × ${eur(com.venta)}` : null, com.porcentaje ? `${fmt(com.porcentaje, 2)} % del importe en cada compra y en cada venta` : null].filter(Boolean)
  return `${partes.join(' + ')} = ${tras}`
}
export function TablaCifras({ c, simbolo }) {
  const poca = c.regla.operaciones < MIN_OPERACIONES
  const col = poca ? B.apagado : null
  const filas = [
    ['CAGR', <span style={{ color: col || (c.regla.cagr >= 0 ? VERDE_CIFRA : ROJO), fontWeight: 700 }}>{signo(c.regla.cagr)}</span>, signo(c.bh.cagr)],
    ['Max Drawdown', <span style={{ color: col || ROJO, fontWeight: 700 }}>{signo(c.regla.maxDD == null ? null : -c.regla.maxDD)}</span>, signo(c.bh.maxDD == null ? null : -c.bh.maxDD)],
    ['Win Rate', <strong style={{ color: col || B.titulo }}>{c.regla.winRate == null ? '—' : `${fmt(c.regla.winRate, 1)} %`}</strong>, '—'],
    ['Factor de beneficio', <strong style={{ color: col || B.titulo }}>{c.regla.factor == null ? '—' : fmt(c.regla.factor, 2)}</strong>, '—'],
    ['Operaciones', <strong style={{ color: col || B.titulo }}>{c.regla.operaciones}</strong>, '1'],
    ['Ganancia / pérdida media', <span style={{ color: col || B.texto }}><span style={{ color: col || VERDE_CIFRA }}>{c.regla.gananciaMedia == null ? '—' : `+${fmt(c.regla.gananciaMedia, 2)}`}</span> / <span style={{ color: col || ROJO }}>{c.regla.perdidaMedia == null ? '—' : `−${fmt(c.regla.perdidaMedia, 2)} %`}</span></span>, '—'],
    ['Tiempo invertido', <span style={{ color: col || B.texto }}>{fmt(c.regla.tiempoInvertido, 0)} %</span>, '100 %'],
  ]
  const celda = { padding: '7px 6px', borderBottom: `1px solid ${B.borde}`, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }
  const com = c.comisiones
  return (
    <table data-cifras style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
      <thead><tr>
        <th scope="col" style={{ ...celda, textAlign: 'left' }}/>
        <th scope="col" style={{ ...celda, fontSize: 12, color: poca ? B.apagado : B.secundario }}>Tu regla</th>
        <th scope="col" style={{ ...celda, fontSize: 12, color: B.secundario }}>Comprar y mantener {simbolo}</th>
      </tr></thead>
      <tbody>{filas.map(([n, a, b]) => <tr key={n} data-fila-cifra={n}><td style={{ ...celda, textAlign: 'left', color: B.secundario }}>{n}</td><td style={celda}>{a}</td><td style={{ ...celda, color: b === '—' ? B.apagado : B.texto }}>{b}</td></tr>)}
        {com && <tr data-fila-cifra="Comisiones pagadas"><td style={{ ...celda, textAlign: 'left', color: B.secundario }}>Comisiones pagadas</td><td colSpan={2} style={{ ...celda, color: B.texto }}>{textoComisiones(com)}</td></tr>}</tbody>
    </table>
  )
}

// Una casilla de prueba: el número con coma; si es distinto del guardado, en ámbar y con «(guardado: X)».
function Casilla({ valor, guardado, etiqueta, onCambia }) {
  const [t, setT] = useState(aTexto(valor))
  useEffect(() => { if (deTexto(t) !== valor) setT(aTexto(valor)) }, [valor])
  const malo = typeof deTexto(t) !== 'number', distinto = guardado != null && valor !== guardado
  return (<>
    <input type="text" inputMode="decimal" value={t} aria-label={etiqueta} title={etiqueta} aria-invalid={malo} data-casilla-cambiada={distinto ? 'si' : undefined}
      onChange={e => { setT(e.target.value); const v = deTexto(e.target.value); if (typeof v === 'number') onCambia(v) }}
      style={{ fontFamily: B.letra, fontSize: 14, width: `${Math.max(2, String(t).length) + 2}ch`, minWidth: 0, textAlign: 'center', padding: '3px 4px', borderRadius: 6, background: B.tarjeta, color: B.titulo,
        border: `1px solid ${malo ? ROJO : distinto ? '#d9a53a' : B.borde}` }}/>
    {distinto && <span data-guardado style={{ fontSize: 12, color: '#e0c27a' }}>(guardado: {aTexto(guardado)})</span>}
  </>)
}

export default function BuilderSenales({ def, valores, guardado = null, intervalo = 'diario', error = null, cambios = {}, onCambios = () => {}, onGuardarValores = null, guardando = false, msgGuardar = null,
  cargaSimbolos = null, cargaVelas = null, comisiones = null, velasIniciales = null, simbolosIniciales = null, simboloInicial = 'AAPL', fechasInicial = null, cifrasIniciales = null, verZonaInicial = true, verOpsInicial = true }) {
  const [simbolos, setSimbolos] = useState(simbolosIniciales || [simboloInicial])
  const valoresLista = useMemo(() => simbolos.map(s => typeof s === 'string' ? { simbolo: s, nombre: '' } : s), [simbolos])
  const [simbolo, setSimbolo] = useState(simboloInicial)
  const [velas, setVelas] = useState(velasIniciales || {})
  const [otras, setOtras] = useState(!!fechasInicial)
  const [desdeO, setDesdeO] = useState(fechasInicial?.desde || null)
  const [hastaO, setHastaO] = useState(fechasInicial?.hasta || null)
  const [cargando, setCargando] = useState(false)
  const [fallo, setFallo] = useState(null)
  // La estrategia con las casillas de prueba (una copia: la de verdad no se toca).
  const prueba = useMemo(() => { try { return aplicaPrueba({ def, valores }, cambios) } catch (_) { return { def, valores } } }, [def, valores, cambios])
  const errPrueba = useMemo(() => { if (error) return []; try { return validaDefinicion(prueba.def, prueba.valores) } catch (e) { return [e.message] } }, [prueba, error])
  const ticker = useMemo(() => { try { return leeFiltro(def).filas.find(f => f.quien !== 'valor')?.quien || def?.filtroMercado?.ticker || null } catch (_) { return def?.filtroMercado?.ticker || null } }, [def])
  useEffect(() => { if (!simbolosIniciales && cargaSimbolos) cargaSimbolos().then(xs => { if (xs?.length) setSimbolos(xs) }).catch(() => {}) }, [])
  // Las velas del valor, del índice del filtro y del S&P 500 (el núcleo lo pide; si falta, sigue sin él, como el servidor).
  useEffect(() => {
    if (!cargaVelas) return
    let vivo = true
    const pide = [simbolo, ...(ticker ? [ticker] : []), '^GSPC'].filter((s, k, xs) => !velas[s] && xs.indexOf(s) === k)
    if (!pide.length) return
    setCargando(true); setFallo(null)
    Promise.all(pide.map(s => cargaVelas(s).then(v => [s, v]).catch(e => s === '^GSPC' ? [s, []] : Promise.reject(e)))).then(rs => { if (vivo) setVelas(x => ({ ...x, ...Object.fromEntries(rs) })) })
      .catch(e => { if (vivo) setFallo(`No se pudieron leer los precios guardados: ${e.message}`) }).finally(() => { if (vivo) setCargando(false) })
    return () => { vivo = false }
  }, [simbolo, ticker])
  const vs = velas[simbolo] || []
  const ensayo = useMemo(() => fechasEnsayo(vs, simbolo), [vs, simbolo])
  const desde = otras ? (desdeO || ensayo.desde) : ensayo.desde, hasta = otras ? (hastaO || ensayo.hasta) : ensayo.hasta
  // Las señales y las cifras, 250 ms después del último cambio.
  const [res, setRes] = useState(null)
  const [cifras, setCifras] = useState(cifrasIniciales)
  const [verZona, setVerZona] = useState(verZonaInicial)   // V9.1061: el interruptor de la zona gris del filtro (en la leyenda)
  const [verOps, setVerOps] = useState(verOpsInicial)   // V9.1063: el de las líneas de las operaciones
  const [fCifras, setFCifras] = useState(null)
  const calcula = () => error || errPrueba.length || !vs.length ? null
    : calculaSenales({ def: prueba.def, valores: prueba.valores, velas: vs, referencias: ticker ? { [ticker]: velas[ticker] || [] } : {}, desde, hasta, intervalo })
  const directo = useMemo(() => velasIniciales && !res ? (() => { try { return calcula() } catch (_) { return null } })() : null, [])
  const primera = useRef(true)
  useEffect(() => {
    if (primera.current && velasIniciales) { primera.current = false; return }
    let vivo = true
    const h = setTimeout(async () => {
      try { if (vivo) setRes(calcula()) } catch (e) { if (vivo) setFallo(`No se pudo calcular: ${e.message}`) }
      if (error || errPrueba.length || !vs.length) return
      try {
        const c = await cifrasRegla({ def: prueba.def, valores: prueba.valores, intervalo, simbolo, velas: { ...velas, [simbolo]: vs }, desde, hasta, comisiones })
        if (vivo) { setCifras(c); setFCifras(null) }
      } catch (e) { if (vivo) { setCifras(null); setFCifras(`No se pudieron calcular las cifras: ${e.message}`) } }
    }, ESPERA_MS)
    return () => { vivo = false; clearTimeout(h) }
  }, [prueba, vs, desde, hasta, error, errPrueba.length, velas[ticker], velas['^GSPC'], comisiones])
  const r = res || directo

  // Las casillas: valor en pantalla (con la prueba) y el guardado.
  const filasCampos = useMemo(() => { try { return camposDePrueba(def) } catch (_) { return [] } }, [def])
  const vg = useMemo(() => { try { return guardado ? valoresDe(guardado.def, guardado.valores) : null } catch (_) { return null } }, [guardado])
  const enGuardado = (c) => guardado && vg ? valorCampo(guardado.def, vg, c) : null
  const casillas = filasCampos.flatMap(x => x.partes.filter(y => typeof y === 'object'))
  const distintos = casillas.filter(y => { const g = enGuardado(y.campo), v = valorCampo(prueba.def, prueba.valores, y.campo); return g != null && v !== g })
  const volver = () => {
    const out = {}
    for (const y of casillas) { const g = enGuardado(y.campo), v = valorCampo(def, valores, y.campo); if (g != null && v !== g) out[y.clave] = g }
    onCambios(out)
  }

  if (error) return <div data-senales="error" style={{ color: ROJO, padding: '12px 4px' }}>{error}</div>
  const seg = (activo) => ({ fontFamily: B.letra, fontSize: 13, minHeight: 34, padding: '0 12px', cursor: 'pointer', border: `1px solid ${activo ? AZUL : B.borde}`, background: activo ? '#1f3350' : B.fondo, color: activo ? B.titulo : B.secundario, fontWeight: activo ? 600 : 400 })
  const nombreEnsayo = ensayo.aviso ? `Ensayo · ${ensayo.desde.slice(0, 4)}–${ensayo.hasta.slice(0, 4)}` : 'Ensayo · 2010–2015'
  // V9.1060: la columna de las cifras empieza a la altura de la fila de controles; la fila, los avisos y el gráfico ocupan el ancho
  // que queda. Si no caben (pantallas estrechas), la columna baja debajo del gráfico.
  return (
    <div data-senales="ok" style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
      <div data-columna-izquierda style={{ flex: '999 1 700px', minWidth: 0 }}>
      <div data-fila-arriba style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600, color: B.titulo, fontFamily: B.letra, fontSize: B.base }}>Valor:
          <BuscadorValor valores={valoresLista} valor={simbolo} onCambia={setSimbolo}/>
        </span>
        <span role="group" aria-label="Fechas" style={{ display: 'inline-flex', alignItems: 'center' }}>
          <button data-fechas="ensayo" aria-pressed={!otras} onClick={() => setOtras(false)} style={{ ...seg(!otras), borderRadius: '6px 0 0 6px' }}>{nombreEnsayo}</button>
          <button data-fechas="otras" aria-pressed={otras} onClick={() => { setOtras(true); if (!desdeO) { setDesdeO(ensayo.desde); setHastaO(ensayo.hasta) } }} style={{ ...seg(otras), borderRadius: '0 6px 6px 0', borderLeft: 'none' }}>Otras fechas</button>
          <Ayuda texto={AYUDA_ENSAYO} etiqueta="Ensayo"/>
        </span>
        {otras && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>Desde <CampoFecha valor={desde || ''} onCambio={setDesdeO} style={{ width: 110 }}/> hasta <CampoFecha valor={hasta || ''} onCambio={setHastaO} style={{ width: 110 }}/></span>}
        <span data-velas style={{ color: B.secundario }}>Velas: <strong style={{ color: B.titulo }}>{intervalo === 'semanal' ? 'semanales' : 'diarias'}</strong> (las de la estrategia)</span>
        {filasCampos.length > 0 && <span style={{ width: 1, height: 26, background: B.borde }}/>}
        {filasCampos.map((x, k) => (
          <span key={k} data-casillas={x.nombre} title={x.nombre} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 8px', border: `1px solid ${x.partes.some(y => typeof y === 'object' && distintos.includes(y)) ? '#d9a53a' : B.borde}`, borderRadius: 8, background: B.fondo, fontSize: 13, color: B.secundario, whiteSpace: 'nowrap' }}>
            <span style={{ color: B.titulo, fontWeight: 600 }}>{x.bloque}:</span>
            {x.partes.map((y, j) => typeof y === 'string' ? <span key={j}>{y}</span>
              : <Casilla key={j} valor={valorCampo(prueba.def, prueba.valores, y.campo)} guardado={enGuardado(y.campo)} etiqueta={`${x.bloque} · ${y.etiqueta}`} onCambia={v => onCambios({ ...cambios, [y.clave]: v })}/>)}
          </span>
        ))}
        {filasCampos.length > 0 && <Ayuda texto={AYUDA_CASILLAS} etiqueta="Casillas de prueba"/>}
        {distintos.length > 0 && <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 8, flexWrap: 'wrap' }}>
          <button data-boton="volver" style={S.boton} onClick={volver}>Volver a los guardados</button>
          {onGuardarValores && <button data-boton="guardar-valores" style={guardando || errPrueba.length ? S.botonDesactivado : S.botonVerde} disabled={guardando || !!errPrueba.length} onClick={onGuardarValores}>{guardando ? 'Guardando…' : 'Guardar estos valores en la estrategia'}</button>}
        </span>}
      </div>
      <div style={{ ...S.apagado, marginTop: 6 }}>Las casillas son para probar: no cambian la estrategia hasta que pulses «Guardar estos valores en la estrategia». Al salir del paso 1 y volver a entrar, salen siempre los valores guardados.</div>
      {ensayo.aviso && !otras && <div data-aviso-ensayo style={{ color: AMARILLO, fontSize: 13, marginTop: 4 }}>{ensayo.aviso}</div>}
      {tocaPaso2(desde, hasta) && <div data-nota-paso2 style={{ color: AMARILLO, fontSize: 13, marginTop: 4 }}>{NOTA_PASO2}</div>}
      {msgGuardar && <div style={{ color: ROJO, marginTop: 4 }}>{msgGuardar}</div>}
      {errPrueba.length > 0 && <div data-error-prueba style={{ color: ROJO, marginTop: 6 }}>{errPrueba.map((e, k) => <div key={k}>{e}</div>)}</div>}
      {cargando && <div style={{ ...S.apagado, marginTop: 8 }}>Leyendo los precios guardados…</div>}
      {fallo && <div style={{ color: ROJO, marginTop: 8 }}>{fallo}</div>}
      {!cargando && !vs.length && !fallo && <div style={{ ...S.apagado, marginTop: 8 }}>Elige un valor para ver las señales.</div>}
      {r && !errPrueba.length && <section data-columna-grafico style={{ marginTop: 10, minWidth: 0 }}>
          <div data-contador style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', margin: '0 0 6px', color: B.texto, fontSize: 13 }}>
            <span><span style={{ color: VERDE }}>▲</span> compra · <span style={{ color: NARANJA }}>▼</span> vende</span>
            {(r.operaciones || []).length > 0 && <label data-interruptor-operaciones title="Enseña u oculta la línea de cada operación, de la compra a la venta" style={{ display: 'inline-flex', flexDirection: 'row', alignItems: 'center', gap: 5, cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit', color: 'inherit' }}>
              <input type="checkbox" aria-label="Enseñar la línea de cada operación" checked={verOps} onChange={e => setVerOps(e.target.checked)} style={{ margin: 0, cursor: 'pointer' }}/>
              <span><span style={{ color: COLOR_GANA }}>╱</span> gana · <span style={{ color: COLOR_PIERDE }}>╲</span> pierde</span></label>}
            {r.medias.map(m => <span key={m.nombre} style={{ color: m.color }}>{m.discontinua ? '— —' : '—'} {m.nombre}</span>)}
            {(r.canales || []).map(m => <span key={m.nombre} data-leyenda-canal={m.nombre} style={{ color: m.color }}>{m.punteada ? '┈┈' : m.discontinua ? '— —' : '—'} {m.nombre}</span>)}
            {(r.puntosSwing || []).length > 0 && <span data-leyenda-swings>● swing · ┈ hasta confirmarse · — desde que se puede usar<Ayuda texto={AYUDA_SWINGS} etiqueta="Swings"/></span>}
            {r.franjas.some(f => f.tarjeta === 'filtro') && (r.bloqueado.some(Boolean)
              ? <label data-interruptor-zona title="Enseña u oculta la zona gris donde el filtro no deja comprar (la franja del filtro sigue igual)" style={{ display: 'inline-flex', flexDirection: 'row', alignItems: 'center', gap: 5, cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit', color: 'inherit' }}>
                <input type="checkbox" aria-label="Enseñar la zona gris donde el filtro no deja comprar" checked={verZona} onChange={e => setVerZona(e.target.checked)} style={{ margin: 0, cursor: 'pointer' }}/>
                <span style={{ display: 'inline-block', width: 14, height: 10, background: 'rgba(139,155,173,0.35)' }}/>filtro: no opero</label>
              : <span><span style={{ display: 'inline-block', width: 14, height: 10, background: 'rgba(139,155,173,0.35)', marginRight: 4 }}/>filtro: no opero</span>)}
            <Ayuda texto={AYUDA} etiqueta="Señales en el gráfico"/>
            <strong data-cuenta style={{ marginLeft: 'auto' }}>En este periodo: {r.compras.length} {r.compras.length === 1 ? 'compra' : 'compras'} · {r.ventas.length} {r.ventas.length === 1 ? 'venta' : 'ventas'}</strong>
          </div>
          {r.avisos.map((a, k) => <div key={k} data-aviso-senales style={{ color: AMARILLO, fontSize: 13 }}>{a}</div>)}
          <Graficos r={r} verZona={verZona} verOps={verOps}/>
          <div style={{ ...S.apagado, marginTop: 4 }}>De {fechaCorta(r.velas[0].date)} a {fechaCorta(r.velas[r.velas.length - 1].date)} · {r.velas.length} velas · {simbolo}{r.franjas.length ? ' · debajo de las velas, una franja por condición y por pieza (pintado = se cumple), con su nombre encima' : ''} · gráfico: <a href="https://www.tradingview.com/" target="_blank" rel="noopener noreferrer" style={{ color: B.apagado }}>TradingView Lightweight Charts™</a></div>
        </section>}
      </div>
      {r && !errPrueba.length && <aside data-columna-cifras style={{ flex: '1 1 320px', maxWidth: 400, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ ...S.tarjeta, padding: 12 }}>
            <div data-linea-cifras style={{ fontSize: 12, color: B.secundario, lineHeight: 1.5, marginBottom: 6 }}>{LINEA_CIFRAS(simbolo)} <Ayuda texto={AYUDA_CIFRAS} etiqueta="Las cifras"/></div>
            {cifras ? <>
              <TablaCifras c={cifras} simbolo={simbolo}/>
              {cifras.regla.operaciones < MIN_OPERACIONES && <div data-pocas style={{ fontSize: 12, color: B.apagado, marginTop: 6 }}>Solo {cifras.regla.operaciones} {cifras.regla.operaciones === 1 ? 'operación' : 'operaciones'}: puede ser suerte.</div>}
            </> : <div style={S.apagado}>{fCifras || 'Calculando…'}</div>}
          </div>
          {cifras && <div style={{ ...S.tarjeta, padding: 12 }}>
            <div style={{ fontSize: 13, color: B.secundario, marginBottom: 6 }}>Cómo habría crecido 100 (en %, sin euros)</div>
            <Curva100 curvas={cifras.curvas}/>
          </div>}
          <div style={{ fontSize: 12, color: B.apagado, lineHeight: 1.5 }}>Solo para orientarte: no se guarda nada.</div>
      </aside>}
    </div>
  )
}
