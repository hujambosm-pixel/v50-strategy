// components/ScreenerCharts.js — la pestaña «Charts» del screener (docs/screener.md §22; boceto bocetos/screener-charts-custom.html):
// un minigráfico por valor, en el orden y con el buscador de la tabla. Cada gráfico pide sus velas cuando se ve (se cargan según
// bajas, 4 a la vez) y las guarda en `cache` (un Map del screener: se vacía tras «Actualizar precios»). Al pasar el ratón, una
// cruz como Finviz: el precio a la derecha, la fecha abajo y arriba la leyenda de esa vela (A/M/m/C y las EMA). Pulsar → cajón.
// Solo dibuja: las cifras salen de lib/screener/graficos.js (velas, EMA, escala, fechas) y lib/screener/columnas.js (cifras).
import { useEffect, useMemo, useRef, useState } from 'react'
import { B, ROJO, VERDE, GRAF } from '../lib/screener/colores'
import { MARCOS, decPrecio, geometria, marcasFecha, textoFecha, velasGrafico } from '../lib/screener/graficos'
import { COLUMNA } from '../lib/screener/columnas'
import { fmt, pasa } from '../lib/screener/filtros'

export const A_LA_VEZ = 4
const TAM = { grande: { porFila: 4, W: 380, H: 200 }, peq: { porFila: 6, W: 250, H: 120 } }
const corto = (t) => t.replace(/^Precio frente a la /, '').replace(/ \(3 meses\)$/, '')

// Un minigráfico (SVG): velas o línea, EMA, volumen, rayas del precio, fechas y la cruz.
export function Grafico({ velas, ajustes, grande, marco, conCruz = true, cruzInicial = null }) {
  const { W, H } = TAM[grande ? 'grande' : 'peq']
  const g = geometria(velas, ajustes, W, H, true)
  const [cruz, setCruz] = useState(cruzInicial)   // { i, yy } en unidades del viewBox
  const marcas = marcasFecha(velas, marco, grande)
  const n = velas.length, u = velas[n - 1]
  const mueve = (e) => {
    const r = e.currentTarget.getBoundingClientRect?.(); if (!r || !r.width) return
    const xx = (e.clientX - r.left) * W / r.width, yy = (e.clientY - r.top) * H / r.height
    const i = Math.max(0, Math.min(n - 1, Math.floor(xx / g.paso)))
    setCruz({ i, yy: Math.max(g.arriba, Math.min(g.abajo, yy)) })
  }
  const linea = (k, color) => {
    let d = ''; velas.forEach((v, i) => { if (v[k] == null) return; d += (d ? 'L' : 'M') + g.x(i).toFixed(1) + ' ' + g.y(v[k]).toFixed(1) })
    return d ? <path data-ema={k} d={d} fill="none" stroke={color} strokeWidth={1.2}/> : null
  }
  const leyendaDe = (v) => {
    const d = decPrecio(v.c)
    return <>
      <tspan>{textoFecha(v, marco)} </tspan>
      <tspan fill={B.apagado}>A </tspan>{fmt(v.o, d)}<tspan fill={B.apagado}> M </tspan>{fmt(v.h, d)}<tspan fill={B.apagado}> m </tspan>{fmt(v.l, d)}<tspan fill={B.apagado}> C </tspan>{fmt(v.c, d)}
      {ajustes.ema200 && v.e200 != null && <tspan fill={GRAF.ema200}> EMA200 {fmt(v.e200, d)}</tspan>}
      {ajustes.ema50 && v.e50 != null && <tspan fill={GRAF.ema50}> EMA50 {fmt(v.e50, d)}</tspan>}
      {ajustes.ema20 && v.e20 != null && <tspan fill={GRAF.ema20}> EMA20 {fmt(v.e20, d)}</tspan>}</>
  }
  const c = cruz && velas[cruz.i]
  return (
    <svg data-grafico viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', cursor: 'crosshair' }} fontFamily="inherit"
      onMouseMove={conCruz ? mueve : undefined} onMouseLeave={conCruz ? () => setCruz(null) : undefined}>
      {g.rayas.map((r, k) => <g key={k}><line x1={0} x2={g.ancho} y1={r.y} y2={r.y} stroke={GRAF.rejilla} strokeWidth={0.6}/>
        <text x={g.ancho + 3} y={r.y + 3} fontSize={9} fill={B.apagado}>{r.t}</text></g>)}
      {marcas.map(m => <g key={'f' + m.i} data-marca={m.t}>
        <line x1={g.x(m.i) - g.paso / 2} x2={g.x(m.i) - g.paso / 2} y1={g.arriba} y2={g.volBase} stroke={GRAF.rejilla} strokeWidth={m.anio ? 0.9 : 0.5}/>
        <text x={g.x(m.i) - g.paso / 2 + 2} y={H - 2} fontSize={9} fill={m.anio ? B.secundario : B.apagado} fontWeight={m.anio ? 700 : 400}>{m.t}</text></g>)}
      {ajustes.vol && velas.map((v, i) => { const h = g.volY(v.vol)
        return h > 0 ? <rect key={'v' + i} x={g.x(i) - g.paso * 0.35} width={Math.max(0.6, g.paso * 0.7)} y={g.volBase - h} height={h} fill={v.c >= v.o ? VERDE : ROJO} opacity={0.35}/> : null })}
      {ajustes.tipo === 'linea'
        ? <path data-linea d={velas.map((v, i) => (i ? 'L' : 'M') + g.x(i).toFixed(1) + ' ' + g.y(v.c).toFixed(1)).join('')} fill="none" stroke={GRAF.linea} strokeWidth={1.4}/>
        : velas.map((v, i) => { const sube = v.c >= v.o, col = sube ? VERDE : ROJO, t = Math.min(g.y(v.o), g.y(v.c)), alto = Math.max(0.8, Math.abs(g.y(v.o) - g.y(v.c)))
            return <g key={i} data-vela={i}><line x1={g.x(i)} x2={g.x(i)} y1={g.y(v.h)} y2={g.y(v.l)} stroke={col} strokeWidth={0.8}/>
              <rect x={g.x(i) - Math.max(0.4, g.paso * 0.32)} width={Math.max(0.8, g.paso * 0.64)} y={t} height={alto} fill={col}/></g> })}
      {ajustes.ema20 && linea('e20', GRAF.ema20)}
      {ajustes.ema50 && linea('e50', GRAF.ema50)}
      {ajustes.ema200 && linea('e200', GRAF.ema200)}
      {/* el último cierre, en azul en el eje */}
      {u && <g data-ultimo><rect x={g.ancho + 1} y={g.y(u.c) - 6} width={g.ejeY - 1} height={12} fill={B.selBorde}/>
        <text x={g.ancho + 3} y={g.y(u.c) + 3} fontSize={9} fill="#ffffff">{fmt(u.c, decPrecio(u.c))}</text></g>}
      {/* leyenda: en «Grandes», la última vela; con la cruz, la de la cruz */}
      {(c || (grande && u)) && <text data-leyenda x={2} y={11} fontSize={grande ? 9.5 : 8.5} fill={B.texto}
        style={{ paintOrder: 'stroke' }} stroke={B.tarjeta} strokeWidth={3} strokeOpacity={0.85}>{leyendaDe(c || u)}</text>}
      {c && <g data-cruz={cruz.i} pointerEvents="none">
        <line x1={g.x(cruz.i)} x2={g.x(cruz.i)} y1={g.arriba} y2={g.volBase} stroke={B.secundario} strokeWidth={0.6} strokeDasharray="3 2"/>
        <line x1={0} x2={g.ancho} y1={cruz.yy} y2={cruz.yy} stroke={B.secundario} strokeWidth={0.6} strokeDasharray="3 2"/>
        <rect x={g.ancho + 1} y={cruz.yy - 6} width={g.ejeY - 1} height={12} fill={B.cabecera} stroke={B.borde} strokeWidth={0.5}/>
        <text data-cruz-precio x={g.ancho + 3} y={cruz.yy + 3} fontSize={9} fill={B.titulo}>{fmt(g.precioDe(cruz.yy), g.dec + 1)}</text>
        {(() => { const t = textoFecha(c, marco), w = t.length * 5 + 6, x0 = Math.max(0, Math.min(g.ancho - w, g.x(cruz.i) - w / 2))
          return <><rect x={x0} y={H - 12} width={w} height={12} fill={B.cabecera} stroke={B.borde} strokeWidth={0.5}/>
            <text data-cruz-fecha x={x0 + 3} y={H - 3} fontSize={9} fill={B.titulo}>{t}</text></> })()}
      </g>}
    </svg>)
}

// Un valor: cabecera (símbolo, nombre, cambio del día), el gráfico y las cifras de debajo.
function Ficha({ e, dentro, datos, ajustes, cifras, vista, pide, onDetalle }) {
  const ref = useRef(null)
  useEffect(() => {
    if (datos) return
    const n = ref.current
    if (typeof window === 'undefined' || typeof window.IntersectionObserver !== 'function' || !n) { pide(e.simbolo); return }
    const io = new window.IntersectionObserver(xs => { if (xs.some(x => x.isIntersecting)) { pide(e.simbolo); io.disconnect() } }, { rootMargin: '300px' })
    io.observe(n); return () => io.disconnect()
  }, [e.simbolo, !!datos])
  const grande = ajustes.tam === 'grande'
  const g = useMemo(() => datos?.velas ? velasGrafico(datos.velas, ajustes.marco) : null, [datos, ajustes.marco])
  const cambio = g?.cambio
  return (
    <div ref={ref} data-ficha={e.simbolo} data-pasa={dentro ? '1' : '0'} onClick={() => onDetalle(e.simbolo)} title="Pulsa para ver el detalle"
      style={{ background: B.tarjeta, border: `1px solid ${B.borde}`, borderRadius: 7, padding: '5px 7px 4px', cursor: 'pointer', opacity: dentro ? 1 : 0.45, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, whiteSpace: 'nowrap', overflow: 'hidden' }}>
        <b style={{ color: B.enlace, fontSize: grande ? 15 : 13 }}>{e.simbolo}</b>
        <span style={{ color: B.secundario, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }} title={e.nombre}>{e.nombre}</span>
        {cambio != null && <span data-cambio style={{ fontSize: 12, fontWeight: 600, color: cambio >= 0 ? VERDE : ROJO }} title="Cambio del último día">{cambio >= 0 ? '+' : ''}{fmt(cambio, 2)} %</span>}
      </div>
      <div style={{ minHeight: grande ? 120 : 70 }}>
        {!datos || datos.cargando ? <div style={{ color: B.apagado, fontSize: 12, padding: '20px 0', textAlign: 'center' }}>Cargando…</div>
          : datos.error ? <div data-error-grafico style={{ color: ROJO, fontSize: 12, padding: '20px 0', textAlign: 'center' }} title={datos.error}>Sin precios</div>
          : !g.velas.length ? <div style={{ color: B.apagado, fontSize: 12, padding: '20px 0', textAlign: 'center' }}>Sin precios guardados</div>
          : <Grafico velas={g.velas} ajustes={ajustes} grande={grande} marco={ajustes.marco}/>}
      </div>
      {cifras.length > 0 && <div data-cifras-ficha style={{ display: 'flex', gap: '2px 10px', flexWrap: 'wrap', fontSize: 11, color: B.secundario, borderTop: `1px solid ${B.borde}`, paddingTop: 3, marginTop: 2 }}>
        {cifras.map(id => { const c = COLUMNA[id]; if (!c) return null
          const cf = c.filtro && vista.filtros[id], mal = !!cf?.on && !pasa(e, c.filtro, cf)
          return <span key={id} data-cifra-ficha={id} title={c.tip ? c.tip(e, vista) : undefined}>{corto(c.titulo)} <b style={{ color: mal ? ROJO : B.texto, fontWeight: 600 }}>{c.texto(e, vista)}</b></span> })}
      </div>}
    </div>)
}

// filas: los valores (en el orden de la tabla); pasaTodo: Set de los que pasan; ajustes: vista.charts; cifras: ids de debajo;
// cache: Map símbolo → { velas } | { cargando } | { error }; leeVelas(símbolo) → velas diarias.
export default function ScreenerCharts({ filas, pasaTodo, ajustes, cifras, vista, cache, leeVelas, onDetalle }) {
  const [, setVer] = useState(0)
  const cola = useRef([]), activos = useRef(0), vivo = useRef(true)
  useEffect(() => { vivo.current = true; return () => { vivo.current = false } }, [])
  const sigue = () => {
    while (activos.current < A_LA_VEZ && cola.current.length) {
      const s = cola.current.shift(); activos.current++
      Promise.resolve().then(() => leeVelas(s))
        .then(velas => cache.set(s, { velas: velas || [] }), err => cache.set(s, { error: err?.message || 'fallo' }))
        .then(() => { activos.current--; if (vivo.current) { setVer(x => x + 1); sigue() } })
    }
  }
  const pide = (s) => { if (cache.has(s)) return; cache.set(s, { cargando: true }); cola.current.push(s); sigue() }
  const { porFila } = TAM[ajustes.tam === 'peq' ? 'peq' : 'grande']
  return (
    <div data-charts data-tam={ajustes.tam} style={{ display: 'grid', gridTemplateColumns: `repeat(${porFila}, minmax(0, 1fr))`, gap: 8, padding: 10 }}>
      {filas.map(e => <Ficha key={e.simbolo} e={e} dentro={pasaTodo.has(e.simbolo)} datos={cache.get(e.simbolo)} ajustes={ajustes} cifras={cifras} vista={vista} pide={pide} onDetalle={onDetalle}/>)}
    </div>)
}
export { MARCOS }
