// components/BuilderSenales.js — «Señales en el gráfico» del paso 1 (V9.1050; docs/builder.md, §16). Sin dinero: ni ganancias, ni
// curva, ni % de aciertos. Arriba, el valor (cualquiera con precios guardados) y las fechas (por defecto, los 2 últimos años). El
// gráfico de precio (lightweight-charts, como el resto de la app) con las medias de la regla, la zona gris donde el filtro no deja
// comprar y las flechas de compra (▲ verde) y venta (▼ naranja); un panel por oscilador; y una franja por condición del filtro y de
// la compra. Todo sale de lib/builder/senales.js (el mismo motor que el backtest y el paso 2). Se recalcula solo, con una pequeña
// espera mientras se escribe.
//   cargaSimbolos() → [símbolos]; cargaVelas(simbolo, desde, hasta) → velas diarias. Para las pruebas de montaje: velasIniciales
//   ({ simbolo: velas }), simbolosIniciales, simboloInicial, desdeInicial, hastaInicial.
import { useState, useEffect, useRef, useMemo } from 'react'
import { B, S } from '../lib/builder/estilo'
import { calculaSenales, calentamientoDe } from '../lib/builder/senales'
import { leeFiltro, aTexto } from '../lib/builder/tarjetas'
import CampoFecha from './CampoFecha'
import Ayuda from './BuilderAyuda'

const VERDE = '#3fb950', NARANJA = '#f0883e', MORADO = '#a371f7', AZUL = '#58a6ff'
const restaAnios = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCFullYear(d.getUTCFullYear() - n); return d.toISOString().slice(0, 10) }
const restaDias = (iso, n) => new Date(Date.parse(iso + 'T00:00:00Z') - n * 864e5).toISOString().slice(0, 10)
const fechaCorta = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
const ESPERA_MS = 250
const AYUDA = 'Las flechas son las compras (▲ verde, en la vela en que se compra) y las ventas (▼ naranja) que hace el motor con esta regla en este valor y estas fechas: las mismas del backtest y de la prueba del paso 2. Las franjas de abajo dicen, vela a vela, si se cumple cada condición (pintado = sí). La zona gris es donde el filtro no deja comprar. No se enseña dinero: aquí se mira si la regla compra y vende donde esperas.'

// Una franja: los tramos seguidos en que la condición se cumple, como trozos de una barra.
function Franja({ nombre, color, cumple, titulo }) {
  const n = cumple.length, tramos = []
  let ini = -1
  cumple.forEach((x, k) => { if (x === true && ini < 0) ini = k; if (x !== true && ini >= 0) { tramos.push([ini, k]); ini = -1 } })
  if (ini >= 0) tramos.push([ini, n])
  const veces = cumple.filter(x => x === true).length
  return (
    <div data-franja={nombre} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
      <span title={titulo} style={{ width: 240, flexShrink: 0, fontSize: 12, color, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nombre}</span>
      <div style={{ position: 'relative', flex: 1, height: 12, background: B.fondo, border: `1px solid ${B.borde}`, borderRadius: 3, overflow: 'hidden' }}>
        {tramos.map(([a, b], k) => <div key={k} style={{ position: 'absolute', left: `${(a / n) * 100}%`, width: `${Math.max(((b - a) / n) * 100, 0.15)}%`, top: 0, bottom: 0, background: color }}/>)}
      </div>
      <span style={{ ...S.apagado, width: 70, textAlign: 'right' }}>{veces} {veces === 1 ? 'vela' : 'velas'}</span>
    </div>
  )
}

// El gráfico de precio y los osciladores (solo en el navegador).
function Graficos({ r }) {
  const precio = useRef(null), osc = useRef([])
  useEffect(() => {
    if (!precio.current || !r?.velas?.length) return
    let vivo = true, charts = []
    import('lightweight-charts').then(({ createChart, CrosshairMode, LineStyle }) => {
      if (!vivo || !precio.current) return
      const opciones = (alto) => ({ height: alto, layout: { background: { color: B.fondo }, textColor: B.secundario, fontFamily: B.letra }, grid: { vertLines: { color: '#1b2430' }, horzLines: { color: '#1b2430' } },
        crosshair: { mode: CrosshairMode.Normal }, rightPriceScale: { borderColor: B.borde }, timeScale: { borderColor: B.borde }, width: precio.current.clientWidth })
      const ch = createChart(precio.current, opciones(360)); charts.push(ch)
      const t = (d) => d
      const velas = ch.addCandlestickSeries({ upColor: '#26a69a', downColor: '#ef5350', borderVisible: false, wickUpColor: '#26a69a', wickDownColor: '#ef5350' })
      velas.setData(r.velas.map(v => ({ time: t(v.date), open: v.open, high: v.high, low: v.low, close: v.close })))
      // La zona gris donde el filtro no deja comprar: una barra en su propia escala, de arriba abajo.
      if (r.bloqueado.some(Boolean) && r.franjas.some(f => f.tarjeta === 'filtro')) {
        const zona = ch.addHistogramSeries({ priceScaleId: 'zona', color: 'rgba(139,155,173,0.16)', priceLineVisible: false, lastValueVisible: false })
        ch.priceScale('zona').applyOptions({ scaleMargins: { top: 0, bottom: 0 }, visible: false })
        zona.setData(r.velas.map((v, k) => ({ time: t(v.date), value: r.bloqueado[k] ? 1 : 0 })))
      }
      for (const m of r.medias) {
        const s = ch.addLineSeries({ color: m.color, lineWidth: 2, lineStyle: m.discontinua ? LineStyle.Dashed : LineStyle.Solid, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false })
        s.setData(r.velas.map((v, k) => m.valores[k] != null ? { time: t(v.date), value: m.valores[k] } : null).filter(Boolean))
      }
      const marcas = [...r.compras.map(c => ({ time: c.date, position: 'belowBar', color: VERDE, shape: 'arrowUp', text: '' })), ...r.ventas.map(c => ({ time: c.date, position: 'aboveBar', color: NARANJA, shape: 'arrowDown', text: '' }))].sort((a, b) => a.time.localeCompare(b.time))
      velas.setMarkers(marcas)
      ch.timeScale().fitContent()
      r.osciladores.forEach((o, j) => {
        const el = osc.current[j]; if (!el) return
        const c2 = createChart(el, opciones(130)); charts.push(c2)
        o.lineas.forEach((l, k) => {
          const s = c2.addLineSeries({ color: k ? NARANJA : AZUL, lineWidth: 2, priceLineVisible: false, lastValueVisible: false })
          s.setData(r.velas.map((v, i) => l.valores[i] != null ? { time: t(v.date), value: l.valores[i] } : null).filter(Boolean))
          if (k === 0 && o.nivel != null) s.createPriceLine({ price: o.nivel, color: '#f2cc60', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: String(o.nivel).replace('.', ',') })
        })
        c2.timeScale().fitContent()
      })
      // Los osciladores se mueven con el gráfico de precio.
      ch.timeScale().subscribeVisibleLogicalRangeChange(rg => { if (rg) charts.slice(1).forEach(c => c.timeScale().setVisibleLogicalRange(rg)) })
      const ajusta = () => charts.forEach(c => c.applyOptions({ width: precio.current?.clientWidth || 600 }))
      window.addEventListener('resize', ajusta)
      charts.ajusta = ajusta
    })
    return () => { vivo = false; if (charts.ajusta) window.removeEventListener('resize', charts.ajusta); charts.forEach(c => c.remove()) }
  }, [r])
  return (
    <div>
      <div ref={precio} data-grafico="precio" style={{ width: '100%', minHeight: 360 }}/>
      {r.osciladores.map((o, j) => (
        <div key={j} data-oscilador={o.nombre} style={{ marginTop: 8 }}>
          <div style={{ fontSize: 12, color: B.secundario }}>{o.nombre}{o.nivel != null ? ` · nivel ${aTexto(o.nivel)}` : ''}{o.lineas.length > 1 ? ' · MACD en azul, señal en naranja' : ''}</div>
          <div ref={el => { osc.current[j] = el }} style={{ width: '100%', minHeight: 130 }}/>
        </div>
      ))}
    </div>
  )
}

export default function BuilderSenales({ def, valores, intervalo = 'diario', error = null, cargaSimbolos = null, cargaVelas = null, velasIniciales = null, simbolosIniciales = null, simboloInicial = 'AAPL', desdeInicial = null, hastaInicial = null }) {
  const [simbolos, setSimbolos] = useState(simbolosIniciales || [simboloInicial])
  const [simbolo, setSimbolo] = useState(simboloInicial)
  const [velas, setVelas] = useState(velasIniciales || {})
  const [hasta, setHasta] = useState(hastaInicial)
  const [desde, setDesde] = useState(desdeInicial)
  const [cargando, setCargando] = useState(false)
  const [fallo, setFallo] = useState(null)
  const ticker = useMemo(() => { try { return leeFiltro(def).filas.find(f => f.quien !== 'valor')?.quien || def?.filtroMercado?.ticker || null } catch (_) { return def?.filtroMercado?.ticker || null } }, [def])
  useEffect(() => { if (!simbolosIniciales && cargaSimbolos) cargaSimbolos().then(xs => { if (xs?.length) setSimbolos(xs) }).catch(() => {}) }, [])
  // Las velas del valor (y del índice del filtro): las fechas, con el calentamiento delante (en días de calendario, con margen).
  const nCal = useMemo(() => { try { return calentamientoDe(def, valores, intervalo) } catch (_) { return 250 } }, [def, valores, intervalo])
  useEffect(() => {
    if (!cargaVelas) return
    let vivo = true
    const pide = [simbolo, ...(ticker ? [ticker] : [])].filter(s => !velas[s])
    if (!pide.length) return
    setCargando(true); setFallo(null)
    Promise.all(pide.map(s => cargaVelas(s).then(v => [s, v]))).then(rs => { if (vivo) setVelas(x => ({ ...x, ...Object.fromEntries(rs) })) })
      .catch(e => { if (vivo) setFallo(`No se pudieron leer los precios guardados: ${e.message}`) }).finally(() => { if (vivo) setCargando(false) })
    return () => { vivo = false }
  }, [simbolo, ticker])
  const vs = velas[simbolo] || []
  const ultima = vs.length ? vs[vs.length - 1].date : null
  const hastaEf = hasta || ultima, desdeEf = desde || (hastaEf ? restaAnios(hastaEf, 2) : null)
  // El cálculo, con una pequeña espera mientras se escribe; se mide lo que tarda.
  const [r, setR] = useState(null)
  const [ms, setMs] = useState(null)
  const calcula = () => {
    if (error || !vs.length || !desdeEf) return null
    const t0 = (typeof performance !== 'undefined' ? performance : Date).now()
    const out = calculaSenales({ def, valores, velas: vs, referencias: ticker ? { [ticker]: velas[ticker] || [] } : {}, desde: desdeEf, hasta: hastaEf, intervalo })
    return { out, ms: Math.round(((typeof performance !== 'undefined' ? performance : Date).now() - t0) * 10) / 10 }
  }
  const primera = useRef(true)
  useEffect(() => {
    if (primera.current && velasIniciales) { primera.current = false; return }
    const h = setTimeout(() => { try { const c = calcula(); setR(c?.out || null); setMs(c?.ms ?? null) } catch (e) { setFallo(`No se pudo calcular: ${e.message}`) } }, ESPERA_MS)
    return () => clearTimeout(h)
  }, [def, valores, vs, desdeEf, hastaEf, error, velas[ticker]])
  // En el montaje (con velas dadas), el cálculo directo, sin esperar.
  const directo = useMemo(() => velasIniciales && !r ? calcula() : null, [])
  const res = r || directo?.out || null, tarda = ms ?? directo?.ms ?? null

  if (error) return <div data-senales="error" style={{ color: '#ff8b8b', padding: '12px 4px' }}>{error}</div>
  return (
    <div data-senales="ok">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600, color: B.titulo, fontFamily: B.letra, fontSize: B.base }}>Valor:
          <select aria-label="Valor" value={simbolo} onChange={e => setSimbolo(e.target.value)} style={{ fontFamily: B.letra, fontSize: B.base, background: B.fondo, color: B.texto, border: `1px solid ${B.borde}`, borderRadius: B.radioBoton, padding: '5px 8px', width: 'auto' }}>
            {simbolos.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>Desde <CampoFecha valor={desdeEf || ''} onCambio={setDesde} style={{ width: 110 }}/></span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>hasta <CampoFecha valor={hastaEf || ''} onCambio={setHasta} style={{ width: 110 }}/></span>
        <Ayuda texto={AYUDA} etiqueta="Señales en el gráfico"/>
        {tarda != null && <span data-tiempo style={{ ...S.apagado, marginLeft: 'auto' }}>calculado en {aTexto(tarda)} ms{tarda > 500 ? ' (con periodos largos tarda más)' : ''}</span>}
      </div>
      {cargando && <div style={{ ...S.apagado, marginTop: 8 }}>Leyendo los precios guardados…</div>}
      {fallo && <div style={{ color: '#ff8b8b', marginTop: 8 }}>{fallo}</div>}
      {!cargando && !vs.length && !fallo && <div style={{ ...S.apagado, marginTop: 8 }}>Elige un valor para ver las señales.</div>}
      {res && <>
        <div data-contador style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', margin: '10px 0 6px', color: B.texto }}>
          <span><span style={{ color: VERDE }}>▲</span> compra · <span style={{ color: NARANJA }}>▼</span> vende</span>
          {res.medias.map(m => <span key={m.nombre} style={{ color: m.color }}>{m.discontinua ? '— —' : '—'} {m.nombre}</span>)}
          {res.franjas.some(f => f.tarjeta === 'filtro') && <span><span style={{ display: 'inline-block', width: 14, height: 10, background: 'rgba(139,155,173,0.35)', marginRight: 4 }}/>filtro: no opero</span>}
          <strong data-cuenta style={{ marginLeft: 'auto' }}>En este periodo: {res.compras.length} {res.compras.length === 1 ? 'compra' : 'compras'} · {res.ventas.length} {res.ventas.length === 1 ? 'venta' : 'ventas'}</strong>
        </div>
        {res.avisos.map((a, k) => <div key={k} data-aviso-senales style={{ color: '#f2cc60', fontSize: 13 }}>{a}</div>)}
        <Graficos r={res}/>
        {res.franjas.length > 0 && <div style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 600, color: B.titulo, marginBottom: 2 }}>Se cumple cada condición (pintado = sí):</div>
          {res.franjas.map((f, k) => <Franja key={k} nombre={f.nombre} titulo={f.frase} color={f.tarjeta === 'filtro' ? MORADO : AZUL} cumple={f.cumple}/>)}
          <div style={{ ...S.apagado, marginTop: 4 }}>De {fechaCorta(res.velas[0].date)} a {fechaCorta(res.velas[res.velas.length - 1].date)} · {res.velas.length} velas · {simbolo}</div>
        </div>}
      </>}
    </div>
  )
}
export { restaDias }
