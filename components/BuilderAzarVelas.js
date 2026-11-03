// components/BuilderAzarVelas.js — «Ver en velas» del resultado del paso 2: las velas del valor en ese periodo, a pantalla completa (boceto «Pulsar una copia → velas a pantalla completa»; docs/builder.md, §62 y §65).
// lightweight-charts, como el resto de la app. Cuatro vistas: tu estrategia (tus compras ▲ y ventas ▼ azules y la zona sombreada mientras estás dentro) o una copia (además, sus compras ● y ventas ○ naranjas). La leyenda enciende y apaga cada capa. Debajo, la tabla.
//   v: lo que pinta la pestaña (lib/azarGraficos.js vistaPestana). inicial: 'estrategia' (solo tus operaciones) o la copia ('mejor', 'tipica', 'peor'). onCierra: × y Esc.
import { useEffect, useRef, useState } from 'react'
import { B, S } from '../lib/builder/estilo'
import Ayuda from './BuilderAyuda'
import { euros, numero } from '../lib/resultadoAzar'

const AZUL = '#58a6ff', NARANJA = '#f0883e', ZONA = '#182431'   // Color sólido, apenas más claro que el fondo: con transparencia, las barras solapadas sumarían color al juntarse las velas.
export const NOMBRES_COPIA = { mejor: ['La mejor copia', 'la mejor copia'], tipica: ['La típica', 'la copia típica'], peor: ['La peor copia', 'la peor copia'] }
const NS = 'http://www.w3.org/2000/svg'
// Las capas que la leyenda enciende y apaga: [clave, texto, símbolo, color, si es de la copia]. Se recuerdan en el navegador.
export const CAPAS_VELAS = [['tuCompra', 'Tu estrategia compra', '▲', AZUL, false], ['tuVenta', 'Tu estrategia vende', '▼', AZUL, false], ['tuDentro', 'Tu estrategia dentro', null, AZUL, false], ['copiaCompra', 'La copia compra', '●', NARANJA, true], ['copiaVenta', 'La copia vende', '○', NARANJA, true]]
const TODAS = Object.fromEntries(CAPAS_VELAS.map(([k]) => [k, true]))
const CLAVE_CAPAS = 'builder_azar_velas_capas'
const leeCapas = () => { try { const g = JSON.parse(window.localStorage.getItem(CLAVE_CAPAS)); if (g && typeof g === 'object') return { ...TODAS, ...g } } catch (_) {} return TODAS }
// El icono de velas de «Ver en velas».
export const IconoVelas = ({ tamano = 14 }) => <svg width={tamano} height={tamano} viewBox="0 0 16 16" aria-hidden="true" style={{ display: 'block', flexShrink: 0 }}><path d="M4.5 1v3M4.5 11v4M11.5 2v2M11.5 9v3" stroke="currentColor" strokeWidth="1.5" fill="none"/><rect x="2.5" y="4" width="4" height="7" rx="0.5" fill="currentColor"/><rect x="9.5" y="4" width="4" height="5" rx="0.5" fill="currentColor"/></svg>
// La escala normal: el rango de las velas con un poco de aire, sin bajar nunca de 0 (por eso sin márgenes: son ellos los que lo llevaban a −25).
export function rangoNormal(r) {
  if (!r?.priceRange) return r
  const { minValue: a, maxValue: b } = r.priceRange, aire = (b - a) * 0.08
  return { priceRange: { minValue: Math.max(0, a - aire), maxValue: b + aire }, margins: { above: 0, below: 0 } }
}
// Los días dentro de una operación: para la zona sombreada, una entrada por vela de i0 a i1 (la zona de dentro, con color; la de fuera, transparente).
export function zonaDentro(velas, i0, i1, ops) {
  const dentro = new Uint8Array(i1 + 1)
  for (const o of ops) for (let j = Math.max(o.e, i0); j <= Math.min(o.x, i1); j++) dentro[j] = 1
  const out = []
  for (let j = i0; j <= i1; j++) out.push({ time: velas[j].date, value: 1, color: dentro[j] ? ZONA : 'rgba(0,0,0,0)' })
  return out
}
// Las marcas de tu estrategia: ▲ debajo de la vela al comprar y ▼ encima al vender. Sin vender dentro del periodo, se cierra al último día (la norma de cierre).
export function marcasEstrategia(velas, ops, capas = TODAS) {
  const out = []
  for (const o of ops) { if (capas.tuCompra) out.push({ time: velas[o.e].date, position: 'belowBar', color: AZUL, shape: 'arrowUp', text: '' }); if (capas.tuVenta) out.push({ time: velas[o.x].date, position: 'aboveBar', color: AZUL, shape: 'arrowDown', text: '' }) }
  return out.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0))
}
// Los puntos de la copia, a su precio: { time, precio, compra }.
export const puntosCopia = (velas, ops) => ops.flatMap(o => [{ time: velas[o.e].date, precio: o.entrada, compra: true }, { time: velas[o.x].date, precio: o.salida, compra: false }])

// Las cifras del ejemplo del «?», de la vista abierta (en «Tu estrategia», la típica). Velas fuera como en la tasa de lib/azarReglas.js: la vela de compra cuenta como fuera, porque en ella se sorteó.
export function cifrasEjemplo(v, cual) {
  const ops = v.copias[cual || 'tipica'].ops, N1 = v.estrategia.libres, A = v.estrategia.operaciones, tasa = N1 ? A / N1 : 0
  const N2 = v.i1 - v.i0 + 1 - ops.reduce((s, o) => s + o.x - o.e, 0)
  return { tasa, N1, A, N2, B: Math.round(N2 * tasa), C: ops.length }
}
const entero = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
const parrafo = { display: 'block', marginTop: 8 }
function AyudaCopias({ v, cual }) {
  const c = cifrasEjemplo(v, cual), X = `${numero(c.tasa * 100, c.tasa < 0.01 ? 2 : 1)} %`
  return <Ayuda etiqueta="Cómo nacen las copias" zIndice={2600} texto={<span data-ayuda-copias style={{ display: 'block' }}>
    <span style={{ display: 'block', fontWeight: 700, color: B.titulo }}>¿Por qué la copia no hace las mismas operaciones que tu estrategia?</span>
    <span style={parrafo}>Las copias no repiten tus operaciones: solo copian tu forma de VENDER.</span>
    <span style={parrafo}>1. Cuándo compran: al azar, con tu misma frecuencia. Tú compras en el {X} de las velas en que estás fuera; la copia, en cada vela en que está fuera, compra con esa misma probabilidad (en la apertura siguiente).</span>
    <span style={parrafo}>2. Cuándo venden: con tus mismas reglas de venta y tus mismos stops.</span>
    <span style={parrafo}>Por eso la duración cambia (tu regla de venta, aplicada desde otro día de compra, se cumple antes o después) y el número de operaciones también.</span>
    <span data-ejemplo-copias style={parrafo}>Ejemplo con esta prueba: tú estás fuera {entero(c.N1)} velas y haces {entero(c.A)} {c.A === 1 ? 'compra' : 'compras'} → {X}. La copia está fuera {entero(c.N2)} velas → {entero(c.N2)} × {X} ≈ {entero(c.B)} {c.B === 1 ? 'compra' : 'compras'}; le salieron {entero(c.C)}.</span>
    <span style={parrafo}>Así la prueba contesta una sola pregunta: ¿tu momento de compra aporta algo? Todo lo demás es igual que en tu estrategia.</span>
  </span>}/>
}

const FILAS = [['final', 'Final (10.000 € al empezar)', x => euros(x.final)], ['operaciones', 'Operaciones', x => x.operaciones], ['ganadoras', 'Ganadoras', x => x.ganadoras == null ? '—' : `${numero(x.ganadoras, 1, true)} %`], ['caida', 'Peor caída', x => `${numero(x.caida, 1, true)} %`], ['dentro', 'Tiempo dentro', x => `${numero(x.dentro, 1, true)} %`]]

export default function BuilderAzarVelas({ v, simbolo, velasTexto = 'diarias', inicial = 'estrategia', onCierra }) {
  const [cual, setCual] = useState(inicial === 'estrategia' ? null : inicial)   // null: solo tu estrategia
  const [fallo, setFallo] = useState(null)
  const [capas, setCapas] = useState(leeCapas)
  const [escala, setEscala] = useState('log')
  const caja = useRef(null), capa = useRef(null), grafico = useRef(null), redibuja = useRef(null), ponCapas = useRef(null), ponEscala = useRef(null), cualR = useRef(cual), capasR = useRef(capas), escalaR = useRef(escala)
  cualR.current = cual; capasR.current = capas; escalaR.current = escala
  const copia = cual ? v.copias[cual] : null
  const marcaCapa = (k) => { const x = { ...capas, [k]: !capas[k] }; setCapas(x); try { window.localStorage.setItem(CLAVE_CAPAS, JSON.stringify(x)) } catch (_) {} }
  useEffect(() => { const f = (e) => { if (e.key === 'Escape' && !document.querySelector('[data-ayuda-ventana]')) onCierra?.() };   /* con el «?» abierto, Esc cierra solo el «?» */ document.addEventListener('keydown', f); return () => document.removeEventListener('keydown', f) }, [onCierra])
  useEffect(() => { redibuja.current?.() }, [cual])
  useEffect(() => { ponCapas.current?.() }, [capas])
  useEffect(() => { ponEscala.current?.() }, [escala])
  useEffect(() => {
    let vivo = true, ch = null, ro = null
    import('lightweight-charts').then(({ createChart, CrosshairMode, PriceScaleMode }) => {
      if (!vivo || !caja.current) return
      ch = createChart(caja.current, { autoSize: true, layout: { background: { color: B.tarjeta }, textColor: B.secundario, attributionLogo: false }, grid: { vertLines: { color: '#1b2430' }, horzLines: { color: '#1b2430' } }, crosshair: { mode: CrosshairMode.Normal }, rightPriceScale: { borderColor: B.borde }, timeScale: { borderColor: B.borde, minBarSpacing: 0.1 } })   // Sin minBarSpacing (0,5 por defecto), en una ventana estrecha no cabe todo el periodo.
      grafico.current = ch
      const zona = ch.addHistogramSeries({ priceScaleId: 'zona', priceLineVisible: false, lastValueVisible: false, base: 0 })
      ch.priceScale('zona').applyOptions({ scaleMargins: { top: 0, bottom: 0 }, visible: false })
      zona.setData(zonaDentro(v.velas, v.i0, v.i1, v.estrategia.ops))
      const velas = ch.addCandlestickSeries({ priceLineVisible: false, lastValueVisible: false, upColor: '#26a69a', downColor: '#ef5350', borderVisible: false, wickUpColor: '#26a69a', wickDownColor: '#ef5350', autoscaleInfoProvider: (base) => escalaR.current === 'normal' ? rangoNormal(base()) : base() })
      velas.setData(v.velas.slice(v.i0, v.i1 + 1).map(b => ({ time: b.date, open: b.open, high: b.high, low: b.low, close: b.close })))
      // ● y ○ de la copia: una capa SVG encima, porque lightweight-charts no tiene marcas huecas. Se recoloca al moverse o hacer zoom.
      const dibuja = () => {
        const svg = capa.current; if (!svg) return
        while (svg.firstChild) svg.removeChild(svg.firstChild)
        const k = cualR.current; if (!k) return
        for (const p of puntosCopia(v.velas, v.copias[k].ops)) {
          if (!capasR.current[p.compra ? 'copiaCompra' : 'copiaVenta']) continue
          const x = ch.timeScale().timeToCoordinate(p.time), y = velas.priceToCoordinate(p.precio)
          if (x == null || y == null || x < 0 || x > ch.timeScale().width()) continue   // fuera de las velas, no sobre el eje de precios
          const c = document.createElementNS(NS, 'circle')
          c.setAttribute('cx', x); c.setAttribute('cy', y); c.setAttribute('r', 4); c.setAttribute('stroke', NARANJA); c.setAttribute('stroke-width', 1.5); c.setAttribute('fill', p.compra ? NARANJA : B.tarjeta)
          svg.appendChild(c)
        }
      }
      redibuja.current = dibuja
      let pendiente = null
      const tarde = () => { if (pendiente) return; pendiente = requestAnimationFrame(() => { pendiente = null; dibuja() }) }
      ch.timeScale().subscribeVisibleLogicalRangeChange(tarde)
      ch.subscribeCrosshairMove(tarde)   // al arrastrar en vertical cambia la escala de precios sin mover el tiempo
      ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(tarde) : null
      ro?.observe(caja.current)
      ponCapas.current = () => { velas.setMarkers(marcasEstrategia(v.velas, v.estrategia.ops, capasR.current)); zona.applyOptions({ visible: capasR.current.tuDentro }); dibuja() }
      // La escala recoloca las velas en el siguiente pintado: los círculos, después.
      ponEscala.current = () => { const log = escalaR.current === 'log'; ch.priceScale('right').applyOptions({ mode: log ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal, autoScale: true, scaleMargins: log ? { top: 0.05, bottom: 0.05 } : { top: 0, bottom: 0 } }); requestAnimationFrame(tarde) }
      ponCapas.current(); ponEscala.current()
      ch.timeScale().fitContent()
      tarde()
    }).catch(e => { if (vivo) setFallo(e.message) })
    return () => { vivo = false; ro?.disconnect(); redibuja.current = null; ponCapas.current = null; ponEscala.current = null; try { ch?.remove() } catch (_) {} grafico.current = null }
  }, [v])

  return (
    <div data-velas-azar role="dialog" aria-modal="true" aria-label={`Velas de ${simbolo}`} style={{ position: 'fixed', inset: 0, zIndex: 2500, background: '#010409', color: B.texto, fontFamily: B.letra, display: 'flex', flexDirection: 'column', gap: 10, padding: '14px 20px', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <div data-titulo-velas style={{ fontSize: 17, fontWeight: 700, color: B.titulo }}>Tu estrategia{cual && <> frente a <span style={{ color: NARANJA }}>{NOMBRES_COPIA[cual][1]}</span></>}</div>
          <AyudaCopias v={v} cual={cual}/>
        </div>
        <span data-periodo-velas style={{ fontSize: 13, color: B.secundario }}>{simbolo} · {v.pestana.nombre} · velas {velasTexto}</span>
        <div role="group" aria-label="Qué ver" style={{ display: 'flex' }}>
          {[[null, 'Tu estrategia'], ...Object.entries(NOMBRES_COPIA).map(([k, [t]]) => [k, t])].map(([k, t]) => <button key={t} data-copia-velas={k || 'estrategia'} aria-pressed={cual === k} onClick={() => setCual(k)} style={{ padding: '6px 12px', border: `1px solid ${B.borde}`, background: cual === k ? '#1f2937' : 'transparent', color: cual === k ? B.titulo : B.secundario, fontFamily: B.letra, fontSize: 13, fontWeight: cual === k ? 700 : 400, cursor: 'pointer' }}>{t}</button>)}
        </div>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: B.secundario }}>Rueda: zoom · arrastrar: moverse</span>
        <div role="group" aria-label="Escala del precio" style={{ display: 'flex' }}>
          {[['log', 'Log'], ['normal', 'Normal']].map(([k, t]) => <button key={k} data-escala-velas={k} aria-pressed={escala === k} onClick={() => setEscala(k)} style={{ padding: '3px 8px', border: `1px solid ${B.borde}`, background: escala === k ? '#1f2937' : 'transparent', color: escala === k ? B.titulo : B.secundario, fontFamily: B.letra, fontSize: 12, fontWeight: escala === k ? 700 : 400, cursor: 'pointer' }}>{t}</button>)}
        </div>
        <button data-cerrar-velas aria-label="Cerrar" title="Cerrar (Esc)" onClick={onCierra} style={{ ...S.boton, width: 36, height: 36, padding: 0, fontSize: 20, lineHeight: 1 }}>×</button>
      </div>
      <div data-leyenda-velas style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 18px', fontSize: 12.5 }}>
        {CAPAS_VELAS.filter(c => cual || !c[4]).map(([k, t, simbolo, color]) => <button key={k} data-capa-velas={k} aria-pressed={!!capas[k]} title={capas[k] ? 'Pulsa para ocultarlo' : 'Pulsa para mostrarlo'} onClick={() => marcaCapa(k)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: 0, border: 0, background: 'transparent', color: B.texto, fontFamily: B.letra, fontSize: 12.5, cursor: 'pointer', opacity: capas[k] ? 1 : 0.45, textDecoration: capas[k] ? 'none' : 'line-through' }}>{simbolo ? <span style={{ color }}>{simbolo}</span> : <span style={{ width: 14, height: 10, background: 'rgba(88,166,255,0.12)' }}/>}{t}</button>)}
      </div>
      <div style={{ flex: 1, minHeight: 200, position: 'relative', border: `1px solid ${B.borde}`, borderRadius: B.radioTarjeta, overflow: 'hidden' }}>
        <div ref={caja} data-grafico-velas style={{ position: 'absolute', inset: 0 }}/>
        <svg ref={capa} data-capa-copia aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 3 }}/>
        {fallo && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ff8b8b' }}>✕ No se pudo dibujar: {fallo}</div>}
      </div>
      <table data-tabla-velas style={{ borderCollapse: 'collapse', fontSize: 13, background: B.tarjeta, border: `1px solid ${B.borde}`, width: '100%' }}>
        <thead><tr>{['', 'Tu estrategia', ...(copia ? [NOMBRES_COPIA[cual][1].replace(/^la /, 'La ')] : [])].map((t, k) => <th key={k} style={{ padding: '5px 12px', fontWeight: 400, fontSize: 12, color: B.secundario, textAlign: 'left' }}>{t}</th>)}</tr></thead>
        <tbody>{FILAS.map(([k, t, f]) => <tr key={k} data-fila-velas={k} style={{ borderTop: `1px solid ${B.borde}` }}>
          <td style={{ padding: '5px 12px', color: B.secundario }}>{k === 'dentro' ? `Tiempo dentro de ${simbolo}` : t}</td>
          <td style={{ padding: '5px 12px', color: AZUL, fontWeight: 600 }}>{f(v.estrategia)}</td>
          {copia && <td style={{ padding: '5px 12px', color: NARANJA, fontWeight: 600 }}>{f(copia)}</td>}
        </tr>)}</tbody>
      </table>
    </div>
  )
}
