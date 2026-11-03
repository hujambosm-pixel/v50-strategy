// components/BuilderAzarVelas.js — «Ver en velas» del resultado del paso 2: las velas del valor en ese periodo, a pantalla completa (boceto «Pulsar una copia → velas a pantalla completa»; docs/builder.md, §62).
// lightweight-charts, como el resto de la app. Tus compras ▲ y ventas ▼ azules y la zona sombreada mientras estás dentro; las compras ● y ventas ○ naranjas de la copia elegida. Debajo, la tabla lado a lado.
//   v: lo que pinta la pestaña (lib/azarGraficos.js vistaPestana). inicial: 'estrategia' (solo tus operaciones) o la copia ('mejor', 'tipica', 'peor'). onCierra: × y Esc.
import { useEffect, useRef, useState } from 'react'
import { B, S } from '../lib/builder/estilo'
import { euros, numero } from '../lib/resultadoAzar'

const AZUL = '#58a6ff', NARANJA = '#f0883e', ZONA = 'rgba(88,166,255,0.09)'
export const NOMBRES_COPIA = { mejor: ['La mejor', 'la mejor copia'], tipica: ['La típica', 'la copia típica'], peor: ['La peor', 'la peor copia'] }
const NS = 'http://www.w3.org/2000/svg'
// Los días dentro de una operación: para la zona sombreada, una entrada por vela de i0 a i1 (la zona de dentro, con color; la de fuera, transparente).
export function zonaDentro(velas, i0, i1, ops) {
  const dentro = new Uint8Array(i1 + 1)
  for (const o of ops) for (let j = Math.max(o.e, i0); j <= Math.min(o.x, i1); j++) dentro[j] = 1
  const out = []
  for (let j = i0; j <= i1; j++) out.push({ time: velas[j].date, value: 1, color: dentro[j] ? ZONA : 'rgba(0,0,0,0)' })
  return out
}
// Las marcas de tu estrategia: ▲ debajo de la vela al comprar y ▼ encima al vender. Sin vender dentro del periodo, se cierra al último día (la norma de cierre).
export function marcasEstrategia(velas, ops) {
  const out = []
  for (const o of ops) { out.push({ time: velas[o.e].date, position: 'belowBar', color: AZUL, shape: 'arrowUp', text: '' }); out.push({ time: velas[o.x].date, position: 'aboveBar', color: AZUL, shape: 'arrowDown', text: '' }) }
  return out.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0))
}
// Los puntos de la copia, a su precio: { time, precio, compra }.
export const puntosCopia = (velas, ops) => ops.flatMap(o => [{ time: velas[o.e].date, precio: o.entrada, compra: true }, { time: velas[o.x].date, precio: o.salida, compra: false }])

const FILAS = [['final', 'Final (10.000 € al empezar)', x => euros(x.final)], ['operaciones', 'Operaciones', x => x.operaciones], ['ganadoras', 'Ganadoras', x => x.ganadoras == null ? '—' : `${numero(x.ganadoras, 1, true)} %`], ['caida', 'Peor caída', x => `${numero(x.caida, 1, true)} %`], ['dentro', 'Tiempo dentro', x => `${numero(x.dentro, 1, true)} %`]]

export default function BuilderAzarVelas({ v, simbolo, velasTexto = 'diarias', inicial = 'estrategia', onCierra }) {
  const [cual, setCual] = useState(inicial === 'estrategia' ? null : inicial)   // null: solo tu estrategia
  const [fallo, setFallo] = useState(null)
  const caja = useRef(null), capa = useRef(null), grafico = useRef(null), redibuja = useRef(null), cualR = useRef(cual)
  cualR.current = cual
  const copia = cual ? v.copias[cual] : null
  useEffect(() => { const f = (e) => { if (e.key === 'Escape') onCierra?.() }; document.addEventListener('keydown', f); return () => document.removeEventListener('keydown', f) }, [onCierra])
  useEffect(() => { redibuja.current?.() }, [cual])
  useEffect(() => {
    let vivo = true, ch = null, ro = null
    import('lightweight-charts').then(({ createChart, CrosshairMode }) => {
      if (!vivo || !caja.current) return
      ch = createChart(caja.current, { autoSize: true, layout: { background: { color: B.tarjeta }, textColor: B.secundario, attributionLogo: false }, grid: { vertLines: { color: '#1b2430' }, horzLines: { color: '#1b2430' } }, crosshair: { mode: CrosshairMode.Normal }, rightPriceScale: { borderColor: B.borde }, timeScale: { borderColor: B.borde } })
      grafico.current = ch
      const zona = ch.addHistogramSeries({ priceScaleId: 'zona', priceLineVisible: false, lastValueVisible: false, base: 0 })
      ch.priceScale('zona').applyOptions({ scaleMargins: { top: 0, bottom: 0 }, visible: false })
      zona.setData(zonaDentro(v.velas, v.i0, v.i1, v.estrategia.ops))
      const velas = ch.addCandlestickSeries({ priceLineVisible: false, lastValueVisible: false, upColor: '#26a69a', downColor: '#ef5350', borderVisible: false, wickUpColor: '#26a69a', wickDownColor: '#ef5350' })
      velas.setData(v.velas.slice(v.i0, v.i1 + 1).map(b => ({ time: b.date, open: b.open, high: b.high, low: b.low, close: b.close })))
      velas.setMarkers(marcasEstrategia(v.velas, v.estrategia.ops))
      // ● y ○ de la copia: una capa SVG encima, porque lightweight-charts no tiene marcas huecas. Se recoloca al moverse o hacer zoom.
      const dibuja = () => {
        const svg = capa.current; if (!svg) return
        while (svg.firstChild) svg.removeChild(svg.firstChild)
        const k = cualR.current; if (!k) return
        for (const p of puntosCopia(v.velas, v.copias[k].ops)) {
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
      ch.timeScale().fitContent()
      tarde()
    }).catch(e => { if (vivo) setFallo(e.message) })
    return () => { vivo = false; ro?.disconnect(); redibuja.current = null; try { ch?.remove() } catch (_) {} grafico.current = null }
  }, [v])

  return (
    <div data-velas-azar role="dialog" aria-modal="true" aria-label={`Velas de ${simbolo}`} style={{ position: 'fixed', inset: 0, zIndex: 2500, background: '#010409', color: B.texto, fontFamily: B.letra, display: 'flex', flexDirection: 'column', gap: 10, padding: '14px 20px', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div data-titulo-velas style={{ fontSize: 17, fontWeight: 700, color: B.titulo }}>Tu estrategia{cual && <> frente a <span style={{ color: NARANJA }}>{NOMBRES_COPIA[cual][1]}</span></>}</div>
        <span data-periodo-velas style={{ fontSize: 13, color: B.secundario }}>{simbolo} · {v.pestana.nombre} · velas {velasTexto}</span>
        <div role="group" aria-label="Qué copia comparar" style={{ display: 'flex' }}>
          {Object.entries(NOMBRES_COPIA).map(([k, [t]]) => <button key={k} data-copia-velas={k} aria-pressed={cual === k} onClick={() => setCual(k)} style={{ padding: '6px 12px', border: `1px solid ${B.borde}`, background: cual === k ? '#1f2937' : 'transparent', color: cual === k ? B.titulo : B.secundario, fontFamily: B.letra, fontSize: 13, fontWeight: cual === k ? 700 : 400, cursor: 'pointer' }}>{t}</button>)}
        </div>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: B.secundario }}>Rueda: zoom · arrastrar: moverse</span>
        <button data-cerrar-velas aria-label="Cerrar" title="Cerrar (Esc)" onClick={onCierra} style={{ ...S.boton, width: 36, height: 36, padding: 0, fontSize: 20, lineHeight: 1 }}>×</button>
      </div>
      <div data-leyenda-velas style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 18px', fontSize: 12.5 }}>
        <span><span style={{ color: AZUL }}>▲</span> Tu estrategia compra</span><span><span style={{ color: AZUL }}>▼</span> Tu estrategia vende</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 14, height: 10, background: 'rgba(88,166,255,0.18)' }}/>Tu estrategia dentro</span>
        {cual && <><span><span style={{ color: NARANJA }}>●</span> La copia compra</span><span><span style={{ color: NARANJA }}>○</span> La copia vende</span></>}
      </div>
      <div style={{ flex: 1, minHeight: 200, position: 'relative', border: `1px solid ${B.borde}`, borderRadius: B.radioTarjeta, overflow: 'hidden' }}>
        <div ref={caja} data-grafico-velas style={{ position: 'absolute', inset: 0 }}/>
        <svg ref={capa} data-capa-copia aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 3 }}/>
        {fallo && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ff8b8b' }}>✕ No se pudo dibujar: {fallo}</div>}
      </div>
      <table data-tabla-velas style={{ borderCollapse: 'collapse', fontSize: 13, background: B.tarjeta, border: `1px solid ${B.borde}`, maxWidth: 760, width: '100%' }}>
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
