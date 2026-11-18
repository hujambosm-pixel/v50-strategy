// components/PlanDetalle.js — la pestaña «Detalle» del plan (docs/builder.md §156; boceto bocetos/detalle-plan.html, pestaña 1).
// Enseña por dentro el MISMO cálculo de «Tu dinero» (un solo cálculo): no pide nada ni calcula nada del plan; pinta lo que prepara
// lib/builder/detallePlan.js con el libro del motor. Parte 2: la línea de arriba, la línea que suma, «Qué aportó cada valor» (con la fila
// del dinero ocioso) y «Cómo crece» («El plan», con el mismo gráfico de «Tu dinero» y los «comprar y mantener» del plan, y «Valor a
// valor»). §157 (parte 3a): ganancias mensuales, dónde está tu dinero cada día y resultados por operación. §158 (parte 3b): el
// historial (tabla con buscador, Gantt y Excel del Backtesting) y «Copiar para Claude». §159 (parte 4a): «Todos los movimientos». §162 (parte 5a): fila de cifras, columnas por valor como el Backtesting y buscador en toda la fila. §161 (parte 4c): también con un solo valor (sin la tabla por valor; sus velas a la vista). §160 (parte 4b): las velas de cada valor (pulsando un valor de la tabla) y la «Vista de gráficos»; §164 (parte 5c): con el gráfico del Backtesting, y del historial o de una barra a su operación. §166 (parte 5e): «⤢ Ampliar» en cada gráfico.
// «La cartera por dentro» sigue mientras Sergi no compruebe que «Detalle» lo tiene todo.
//   detalle: lo de detallePlan · cifras: lo de cifrasPlan (las filas de los «comprar y mantener») · graficoPlan: el gráfico de «Tu dinero»
//   ya montado (lo pone BuilderPlan) · onIrAValor(símbolo): el «↗» · viejas: el cálculo es el anterior (se atenúa).
import { createContext, Fragment, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { B, C, S } from '../lib/builder/estilo'
import Ayuda from './BuilderAyuda'
import { separaEtiquetas } from '../lib/builder/escalaGrafico'
import { AYUDA_DETALLE, textoSenales, filtraMovimientos, historial, nombreOcioso, focoDeOperacion, senalesGrafico, textoDetalle, tradesBacktesting } from '../lib/builder/detallePlan'
import ConLimpiar from './LimpiarBusqueda'
import BotonCopiar from './BotonCopiar'
import GanttChart from './GanttChart'
import { AssetSignalChart } from './BacktestCharts'
import { euros, fechaCorta, numero, pct } from '../lib/builder/planPantalla'

// §178: como variables (cambian con el tono ☀/☾).
const VERDE = C.verde, ROJO = C.rojo, AZUL = C.azul, AMARILLO = C.amarillo, GRIS = C.gris
// §188: los colores de los bloques (el 1, azul, como siempre); los mismos en el panel de la izquierda (BuilderPlan) y aquí.
export const COLORES_BLOQUE = [C.azul, C.naranja, C.morado, C.cian, C.verde]
export const colorBloque = (n) => COLORES_BLOQUE[((n || 1) - 1) % COLORES_BLOQUE.length]
const Punto = ({ n }) => <span aria-hidden="true" style={{ display: 'inline-block', width: 9, height: 9, borderRadius: '50%', background: colorBloque(n), marginRight: 6, flex: 'none' }}/>
export const COLORES_VALORES = [C.azul, C.verde, C.naranja, C.morado, C.cian, C.rojo, C.dorado, C.azulClaro, C.rojoClaro, C.verdeClaro]
const celda = { padding: '7px 10px', borderBottom: `1px solid ${B.borde}`, textAlign: 'left', verticalAlign: 'top' }
const num = { ...celda, textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }
const cab = { ...celda, color: B.secundario, fontWeight: 600, fontSize: 12, background: B.cabecera }
const cabNum = { ...cab, textAlign: 'right' }
const signo = (v) => Number.isFinite(v) && v > 0 ? VERDE : Number.isFinite(v) && v < 0 ? ROJO : undefined
export const pctSigno = (v, d = 1) => !Number.isFinite(v) ? '—' : `${v > 0 ? '+' : ''}${pct(v, d)}`
export const conSigno = (v, d = 0) => !Number.isFinite(v) ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${euros(Math.abs(v), d)}`
const boton = (on) => ({ fontFamily: B.letra, fontSize: 13, padding: '4px 11px', cursor: 'pointer', borderRadius: 6, border: `1px solid ${on ? B.siguienteBorde : B.borde}`, background: on ? B.siguienteFondo : B.fondo, color: on ? B.titulo : B.texto, fontWeight: on ? 700 : 400 })

function useAncho(defecto = 760) {
  const ref = useRef(null)
  const [w, setW] = useState(defecto)
  useEffect(() => {
    const el = ref.current; if (!el) return
    const mide = () => { const x = el.clientWidth; if (x > 0) setW(Math.round(x)) }
    mide()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(mide) : null
    ro?.observe(el)
    return () => ro?.disconnect()
  }, [])
  return [ref, w]
}
// §166 (parte 5e) · AMPLIAR un gráfico: «⤢ Ampliar» encima de él lo abre a pantalla completa (Esc o «✕ Cerrar» para volver). Dentro, los
// gráficos leen el alto disponible de AmpliadoCtx (y el ancho lo miden ellos): salen más altos y más anchos, con más detalle de fechas.
export const AmpliadoCtx = createContext(null)
export const altoAmpliado = (amp, normal, menos = 0) => amp?.alto ? Math.max(normal, amp.alto - menos) : normal
export function Ampliable({ titulo, children }) {
  const [on, setOn] = useState(false)
  useEffect(() => {
    if (!on) return
    const k = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setOn(false) } }
    window.addEventListener('keydown', k, true)
    return () => window.removeEventListener('keydown', k, true)
  }, [on])
  const alto = on && typeof window !== 'undefined' ? Math.max(300, (window.innerHeight || 800) - 150) : null
  return (
    <div data-ampliable={titulo}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 2 }}><button type="button" data-amplia={titulo} onClick={() => setOn(true)} title="Ver este gráfico a pantalla completa (Esc para volver)" style={{ fontFamily: B.letra, fontSize: 12, padding: '2px 8px', borderRadius: 5, cursor: 'pointer', border: `1px solid ${B.borde}`, background: B.fondo, color: B.secundario }}>⤢ Ampliar</button></div>
      {!on && children}
      {on && <div data-ampliado={titulo} role="dialog" aria-label={`${titulo} a pantalla completa`} style={{ position: 'fixed', inset: 0, zIndex: 3000, background: C.fondoAmpliado, padding: '16px 24px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}><b style={{ color: B.titulo, fontSize: 16 }}>{titulo}</b>
          <button type="button" data-cierra-ampliado onClick={() => setOn(false)} style={{ marginLeft: 'auto', fontFamily: B.letra, fontSize: 13, padding: '5px 12px', borderRadius: 6, cursor: 'pointer', border: `1px solid ${B.borde}`, background: B.tarjeta, color: B.texto }}>✕ Cerrar (Esc)</button></div>
        <AmpliadoCtx.Provider value={{ alto }}><div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>{children}</div></AmpliadoCtx.Provider>
      </div>}
    </div>
  )
}
// Marcas «redondas» de un eje normal (1, 2 o 5 por su potencia de 10), unas 5.
export function marcasLineales(lo, hi, cuantas = 5) {
  if (!(hi > lo)) return [lo]
  const bruto = (hi - lo) / cuantas, p = 10 ** Math.floor(Math.log10(bruto)), paso = [1, 2, 5, 10].map(m => m * p).find(x => x >= bruto) || 10 * p
  const out = []
  for (let v = Math.ceil(lo / paso) * paso; v <= hi + paso * 1e-9; v += paso) out.push(Math.abs(v) < paso * 1e-9 ? 0 : v)
  return out
}

// «Valor a valor»: lo ganado con cada valor (y con el ocioso) hasta cada día, en euros. Los 10 que más pesan, de color; el resto, en
// gris. Pulsar un valor (en la leyenda o en la tabla) lo resalta. Al pasar el ratón, la fecha y lo ganado hasta ese día.
export function GraficoValores({ curvas, elegido = null, onElegir = null, ocioso = 'LIQUIDEZ' }) {
  const [ref, W] = useAncho()
  const [hov, setHov] = useState(null)
  const amp = useContext(AmpliadoCtx)
  const n = curvas.fechas.length, IZQ = 76, DER = 150, H = altoAmpliado(amp, 330, 60), ARR = 16, ABJ = 24
  const orden = [...curvas.series].filter(s => s.rol === 'valor').sort((a, b) => Math.abs(b.v[n - 1]) - Math.abs(a.v[n - 1]))
  const colorDe = new Map(orden.map((s, k) => [s.simbolo, k < COLORES_VALORES.length ? COLORES_VALORES[k] : GRIS]))
  // §188: las series de «Bloque a bloque» llevan bloque = su número (y su color de siempre).
  const series = curvas.series.map(s => ({ ...s, color: s.rol === 'ocioso' ? AMARILLO : s.bloque ? colorBloque(s.bloque) : colorDe.get(s.simbolo), nombre: s.rol === 'ocioso' ? `Ocioso · ${nombreOcioso(s.simbolo)}` : s.simbolo }))
  const deBloques = curvas.series.some(s => s.bloque)
  if (!series.length || n < 2) return <div data-sin-valores style={{ ...S.secundario }}>Sin operaciones que dibujar.</div>
  let lo = 0, hi = 0
  for (const s of series) for (const v of s.v) { if (v < lo) lo = v; if (v > hi) hi = v }
  if (hi === lo) hi = lo + 1
  const paso = Math.max(1, Math.ceil(n / 600))
  const x = (i) => IZQ + i / (n - 1) * (W - IZQ - DER), y = (v) => ARR + (1 - (v - lo) / (hi - lo)) * (H - ARR - ABJ)
  const ruta = (v) => { const out = []; for (let i = 0; i < n; i += paso) out.push(`${x(i).toFixed(1)},${y(v[i]).toFixed(1)}`); if ((n - 1) % paso) out.push(`${x(n - 1).toFixed(1)},${y(v[n - 1]).toFixed(1)}`); return out.join(' ') }
  const anios = []; curvas.fechas.forEach((f, i) => { if (i === 0 || f.slice(0, 4) !== curvas.fechas[i - 1].slice(0, 4)) anios.push([i, f.slice(0, 4)]) })
  const cada = Math.max(1, Math.ceil(anios.length / Math.max(1, Math.floor((W - IZQ - DER) / 44))))
  // Etiquetas al final: las 8 que más pesan, el ocioso y la elegida.
  const conEtiqueta = series.filter(s => s.rol === 'ocioso' || s.simbolo === elegido || orden.findIndex(o => o.simbolo === s.simbolo) < 8)
  const etq = separaEtiquetas(conEtiqueta.map(s => ({ t: `${s.nombre} ${conSigno(s.v[n - 1])}`, color: s.color, y: y(s.v[n - 1]), fuerte: s.simbolo === elegido })), ARR, H - ABJ)
  const sel = series.find(s => s.simbolo === elegido) || null
  const total = (i) => series.filter(s => s.rol === 'valor').reduce((t, s) => t + s.v[i], 0)
  const resumen = `Lo ganado con cada valor hasta cada día, en euros, del ${fechaCorta(curvas.fechas[0])} al ${fechaCorta(curvas.fechas[n - 1])}: ` + series.map(s => `${s.nombre} ${conSigno(s.v[n - 1])}`).join('; ') + '.'
  return (
    <div ref={ref} style={{ width: '100%', marginTop: 6 }}>
      <svg data-grafico={deBloques ? "bloques" : "valores"} data-series={series.length} width={W} height={H + 20} role="img" aria-label={resumen} style={{ display: 'block', fontFamily: B.letra }}>
        {marcasLineales(lo, hi).map((t, k) => <g key={k}><line x1={IZQ} x2={W - DER} y1={y(t)} y2={y(t)} stroke={t === 0 ? C.ejeCero : C.rejilla}/><text x={IZQ - 6} y={y(t) + 4} textAnchor="end" fontSize={12} fill={B.apagado}>{conSigno(t)}</text></g>)}
        {anios.filter((_, k) => k % cada === 0).map(([i, a]) => <text key={a} x={x(i)} y={H - 6} fontSize={12} fill={B.apagado}>{a}</text>)}
        {series.filter(s => s.simbolo !== elegido).map(s => <polyline key={s.simbolo} data-linea-valor={s.simbolo} points={ruta(s.v)} fill="none" stroke={s.color} strokeWidth={1.3} strokeDasharray={s.rol === 'ocioso' ? '5 3' : undefined} strokeLinejoin="round" opacity={sel ? 0.25 : 0.95}/>)}
        {sel && <polyline data-linea-valor={sel.simbolo} data-elegida="si" points={ruta(sel.v)} fill="none" stroke={sel.color === GRIS ? B.titulo : sel.color} strokeWidth={2.6} strokeLinejoin="round"/>}
        {etq.map(e => <text key={e.t} x={W - DER + 8} y={e.y + 4} fontSize={12} fill={e.color === GRIS ? B.texto : e.color} fontWeight={e.fuerte ? 700 : 400} opacity={sel && !e.fuerte ? 0.45 : 1}>{e.t}</text>)}
        {hov != null && <><line x1={x(hov)} x2={x(hov)} y1={ARR} y2={H - ABJ} stroke={B.titulo} strokeWidth={1} opacity={0.6}/>
          <text data-valores-dato x={IZQ} y={H + 14} fontSize={12} fill={B.texto}>{`${fechaCorta(curvas.fechas[hov])} · ${sel ? `${sel.nombre}: ${conSigno(sel.v[hov])} ganados hasta ese día` : `${deBloques ? "todos los bloques" : "todos los valores"}: ${conSigno(total(hov))} ganados hasta ese día`}`}</text></>}
        <rect x={IZQ} y={ARR} width={Math.max(0, W - IZQ - DER)} height={H - ARR - ABJ} fill="transparent" onMouseLeave={() => setHov(null)} onMouseMove={e => { const r = e.currentTarget.getBoundingClientRect(); const i = Math.round((e.clientX - r.left) / Math.max(1, r.width) * (n - 1)); setHov(Math.max(0, Math.min(n - 1, i))) }}/>
      </svg>
      <div data-leyenda-valores style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
        {series.map(s => <button key={s.simbolo} type="button" data-chip-valor={s.simbolo} aria-pressed={s.simbolo === elegido} onClick={() => onElegir?.(s.simbolo === elegido ? null : s.simbolo)} title={s.simbolo === elegido ? 'Pulsa para dejar de resaltarlo' : 'Pulsa para resaltarlo'}
          style={{ fontFamily: B.letra, fontSize: 12, padding: '2px 8px', borderRadius: 4, cursor: 'pointer', background: B.fondo, color: s.simbolo === elegido ? B.titulo : B.texto, fontWeight: s.simbolo === elegido ? 700 : 400, border: `1px solid ${s.simbolo === elegido ? B.siguienteBorde : B.borde}`, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: s.color, display: 'inline-block' }}/>{s.nombre}</button>)}
      </div>
    </div>
  )
}

// §157 · Ganancias mensuales: una fila por año, 12 meses y «Año». Color según el signo, más intenso cuanto más se movió.
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const fondoDe = (p) => !Number.isFinite(p) || p === 0 ? 'transparent' : `rgba(${p > 0 ? '63,185,80' : '248,81,73'},${(0.12 + Math.min(0.55, Math.abs(p) * 4)).toFixed(2)})`
export function TablaMensual({ anios }) {
  const c = { padding: '5px 4px', borderBottom: `1px solid ${B.borde}`, textAlign: 'right', fontSize: 12, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }
  return (
    <div style={{ overflowX: 'auto' }}><table data-tabla="detalle-mensual" style={{ borderCollapse: 'collapse', width: '100%' }}>
      <thead><tr><th style={{ ...cab, padding: '5px 6px' }}>Año</th>{MESES.map(m => <th key={m} style={{ ...cabNum, padding: '5px 4px' }}>{m}</th>)}<th style={{ ...cabNum, padding: '5px 6px' }}>Año</th></tr></thead>
      <tbody>{anios.map(f => <tr key={f.anio} data-mes-anio={f.anio}>
        <td style={{ ...c, textAlign: 'left', color: B.secundario, paddingLeft: 6 }}>{f.anio}</td>
        {f.meses.map((x, k) => <td key={k} data-mes={`${f.anio}-${k + 1}`} title={x ? `${MESES[k]} ${f.anio}: ${pct(x.pct)} · ${conSigno(x.euros, 0)}` : undefined} style={{ ...c, background: x ? fondoDe(x.pct) : 'transparent', color: x ? B.titulo : B.apagado }}>{x ? numero(x.pct * 100, 1) : ''}</td>)}
        <td data-mes-total={f.anio} title={`${f.anio}: ${pct(f.pct)} · ${conSigno(f.euros, 0)}`} style={{ ...c, fontWeight: 700, color: signo(f.pct) || B.texto, paddingRight: 6 }}>{pct(f.pct, 1)}</td>
      </tr>)}</tbody>
    </table></div>
  )
}
// §157 · Dónde está tu dinero cada día: tres franjas apiladas (valores abajo, ocioso, liquidez arriba), en % del dinero de ese día.
export function GraficoDondeEsta({ donde, ocioso = 'LIQUIDEZ' }) {
  const [ref, W] = useAncho()
  const [hov, setHov] = useState(null)
  const amp = useContext(AmpliadoCtx)
  const { fechas, dias, media } = donde, n = dias.length, IZQ = 46, DER = 10, H = altoAmpliado(amp, 150, 40), ARR = 6, ABJ = 22
  if (n < 2) return null
  const paso = Math.max(1, Math.ceil(n / 700)), idx = []; for (let i = 0; i < n; i += paso) idx.push(i); if (idx[idx.length - 1] !== n - 1) idx.push(n - 1)
  const x = (i) => IZQ + i / (n - 1) * (W - IZQ - DER), y = (f) => ARR + (1 - f) * (H - ARR - ABJ)
  const banda = (abajo, arriba) => `${idx.map(i => `${x(i).toFixed(1)},${y(arriba(dias[i])).toFixed(1)}`).join(' ')} ${[...idx].reverse().map(i => `${x(i).toFixed(1)},${y(abajo(dias[i])).toFixed(1)}`).join(' ')}`
  const anios = []; fechas.forEach((f, i) => { if (i === 0 || f.slice(0, 4) !== fechas[i - 1].slice(0, 4)) anios.push([i, f.slice(0, 4)]) })
  const cada = Math.max(1, Math.ceil(anios.length / Math.max(1, Math.floor((W - IZQ - DER) / 44))))
  const sinOc = ocioso === 'LIQUIDEZ', d = hov != null ? dias[hov] : null
  const resumen = `Dónde está tu dinero cada día, de media: en valores el ${pct(media.valores, 0)}${sinOc ? '' : `, en el ocioso el ${pct(media.ocioso, 0)}`} y en liquidez el ${pct(media.liquidez, 0)}.`
  return (
    <div ref={ref} style={{ width: '100%' }}>
      <svg data-grafico="donde-esta" data-dias={n} width={W} height={H + 18} role="img" aria-label={resumen} style={{ display: 'block', fontFamily: B.letra }}>
        {/* §188: con varios bloques, la parte en valores partida por bloque (cada uno con su color) */}
        {donde.bloques ? donde.bloques.map((b, k) => <polygon key={b.n} data-banda={`bloque-${b.n}`} points={banda(z => z.bq.slice(0, k).reduce((t, q) => t + q, 0), z => z.bq.slice(0, k + 1).reduce((t, q) => t + q, 0))} fill={colorBloque(b.n)} opacity={0.85}/>)
          : <polygon data-banda="valores" points={banda(() => 0, z => z.valores)} fill={AZUL} opacity={0.85}/>}
        <polygon data-banda="ocioso" points={banda(z => z.valores, z => z.valores + z.ocioso)} fill={AMARILLO} opacity={0.6}/>
        <polygon data-banda="liquidez" points={banda(z => z.valores + z.ocioso, () => 1)} fill={GRIS} opacity={0.7}/>
        {[0, 0.5, 1].map(t => <text key={t} x={IZQ - 6} y={y(t) + 4} textAnchor="end" fontSize={11} fill={B.apagado}>{pct(t, 0)}</text>)}
        {anios.filter((_, k) => k % cada === 0).map(([i, a]) => <text key={a} x={x(i)} y={H - 6} fontSize={11} fill={B.apagado}>{a}</text>)}
        {d && <><line x1={x(hov)} x2={x(hov)} y1={ARR} y2={H - ABJ} stroke={B.titulo} strokeWidth={1}/>
          <text data-donde-dato x={IZQ} y={H + 13} fontSize={12} fill={B.texto}>{`${fechaCorta(fechas[hov])} · en valores ${pct(d.valores, 0)}${donde.bloques ? ` (${donde.bloques.map((b, k) => `bloque ${b.n} ${pct(d.bq[k], 0)}`).join(', ')})` : ''}${sinOc ? '' : ` · en el ocioso ${pct(d.ocioso, 0)}`} · en liquidez ${pct(d.liquidez, 0)}`}</text></>}
        <rect x={IZQ} y={ARR} width={Math.max(0, W - IZQ - DER)} height={H - ARR - ABJ} fill="transparent" onMouseLeave={() => setHov(null)} onMouseMove={e => { const r = e.currentTarget.getBoundingClientRect(); const i = Math.round((e.clientX - r.left) / Math.max(1, r.width) * (n - 1)); setHov(Math.max(0, Math.min(n - 1, i))) }}/>
      </svg>
      <div data-leyenda-donde style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', fontSize: 12, color: B.secundario, marginTop: 4 }}>
        {donde.bloques ? donde.bloques.map(b => <span key={b.n} data-leyenda-bloque={b.n}><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: colorBloque(b.n), marginRight: 5 }}/>bloque {b.n} · {pct(b.media, 0)} de media</span>)
          : <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: AZUL, marginRight: 5 }}/>en valores · {pct(media.valores, 0)} de media</span>}
        {!sinOc && <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: AMARILLO, marginRight: 5 }}/>en el ocioso ({nombreOcioso(ocioso)}) · {pct(media.ocioso, 0)}</span>}
        <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: GRIS, marginRight: 5 }}/>en liquidez · {pct(media.liquidez, 0)}</span>
      </div>
    </div>
  )
}
// §157 · Resultados por operación: una barra por operación (verde gana, roja pierde), en euros.
export function BarrasOperaciones({ datos, onPulsa = null }) {
  const [ref, W] = useAncho()
  const [hov, setHov] = useState(null)
  const amp = useContext(AmpliadoCtx)
  const { ops } = datos, n = ops.length, IZQ = 62, DER = 10, H = altoAmpliado(amp, 130, 30), ARR = 6, ABJ = 6
  if (!n) return <div data-sin-operaciones style={S.secundario}>Sin operaciones.</div>
  let lo = 0, hi = 0; for (const o of ops) { if (o.resultado < lo) lo = o.resultado; if (o.resultado > hi) hi = o.resultado }
  if (hi === lo) hi = lo + 1
  const ancho = (W - IZQ - DER) / n, hueco = ancho >= 4 ? Math.min(2, ancho * 0.3) : 0
  const y = (v) => ARR + (1 - (v - lo) / (hi - lo)) * (H - ARR - ABJ), y0 = y(0)
  const o = hov != null ? ops[hov] : null
  return (
    <div ref={ref} style={{ width: '100%' }}>
      <svg data-grafico="por-operacion" data-barras={n} width={W} height={H + 18} role="img" aria-label={`${n} operaciones: ${datos.ganan} ganan y ${datos.pierden} pierden.`} style={{ display: 'block', fontFamily: B.letra }}>
        {[hi, 0, lo].filter((t, k, a) => a.indexOf(t) === k).map(t => <text key={t} x={IZQ - 6} y={y(t) + 4} textAnchor="end" fontSize={11} fill={B.apagado}>{conSigno(t)}</text>)}
        <line x1={IZQ} x2={W - DER} y1={y0} y2={y0} stroke={C.ejeCero}/>
        {ops.map((op, i) => { const yv = y(op.resultado); return <rect key={i} x={IZQ + i * ancho + hueco / 2} width={Math.max(0.6, ancho - hueco)} y={Math.min(yv, y0)} height={Math.max(0.6, Math.abs(yv - y0))} fill={op.resultado >= 0 ? VERDE : ROJO} opacity={hov == null || hov === i ? 1 : 0.55}/> })}
        {o && <text data-operacion-dato x={IZQ} y={H + 13} fontSize={12} fill={B.texto}>{`${o.simbolo} · ${fechaCorta(o.entryDate)} → ${fechaCorta(o.exitDate)}${o.abierta ? ' (seguía abierta)' : ''} · ${conSigno(o.resultado, 2)} · ${o.pct == null ? '—' : `${o.pct > 0 ? '+' : ''}${pct(o.pct, 1)}`}`}</text>}
        <rect x={IZQ} y={ARR} width={Math.max(0, W - IZQ - DER)} height={H - ARR - ABJ} fill="transparent" style={onPulsa ? { cursor: 'pointer' } : undefined} onClick={onPulsa ? () => { if (hov != null) onPulsa(ops[hov]) } : undefined} onMouseLeave={() => setHov(null)} onMouseMove={e => { const r = e.currentTarget.getBoundingClientRect(); const i = Math.floor((e.clientX - r.left) / Math.max(1, r.width) * n); setHov(Math.max(0, Math.min(n - 1, i))) }}/>
      </svg>
    </div>
  )
}

// §158 · El historial: «Tabla» (50 cada vez, la más reciente arriba, con buscador por valor) o «Gantt» (el del Backtesting, tal cual), y
// «Excel» (exportHistorial del Backtesting, tal cual; se carga al pulsarlo).
const POR_PAGINA = 50
// §159: «Todos los movimientos» (movs): además de las operaciones, el ocioso, los impuestos y las aportaciones, con el dinero al cierre.
const COLOR_MOV = { aportacion: B.enlace, impuesto: C.rojo, ocioso: C.amarillo, valor: undefined, otro: undefined }
export function Historial({ ops, movs = [], desde, hasta, nombre = 'plan', inicial = null, onOperacion = null }) {
  const [vista, setVista] = useState(inicial?.vista || 'tabla')
  const [busca, setBusca] = useState(inicial?.busca || '')
  const [cuantas, setCuantas] = useState(POR_PAGINA)
  const [excel, setExcel] = useState(null)
  const lista = historial(ops, busca)
  const trades = tradesBacktesting(busca ? [...lista].reverse() : ops)
  const descarga = async () => {
    setExcel('…')
    try { const { exportHistorial } = await import('../lib/exportTimeline'); exportHistorial({ mcResult: { allTrades: trades, slotCapital: null }, mcSelected: [...new Set(trades.map(t => t.symbol))], baseCfg: {}, stratName: nombre }); setExcel(null) }
    catch (e) { setExcel(`No se pudo crear el Excel: ${e.message || e}`) }
  }
  const tot = lista.reduce((s, o) => s + o.resultado, 0)
  const conMovs = vista === 'movimientos', listaM = conMovs ? filtraMovimientos(movs, busca) : []
  // §188: con varios bloques, la columna «Bloque» (su número con su color; «—» lo de la cuenta). Se busca escribiendo «bloque 2».
  const conBloque = ops.some(o => o.bloque), celdaBloque = (n) => <td style={{ ...celda, whiteSpace: 'nowrap' }} data-bloque-fila={n || ''}>{n ? <span style={{ display: 'inline-flex', alignItems: 'center' }}><Punto n={n}/>{n}</span> : <span style={{ color: B.apagado }}>—</span>}</td>
  return (<>
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
      <span role="group" aria-label="Cómo ver el historial" style={{ display: 'inline-flex', gap: 6 }}>
        <button type="button" data-vista-historial="tabla" aria-pressed={vista === 'tabla'} onClick={() => { setVista('tabla'); setCuantas(POR_PAGINA) }} style={boton(vista === 'tabla')}>Operaciones ({numero(ops.length, 0)})</button>
        <button type="button" data-vista-historial="movimientos" aria-pressed={vista === 'movimientos'} onClick={() => { setVista('movimientos'); setCuantas(POR_PAGINA) }} title="Además de las operaciones: el dinero ocioso, los impuestos de cada julio y las aportaciones" style={boton(vista === 'movimientos')}>Todos los movimientos</button>
        <button type="button" data-vista-historial="gantt" aria-pressed={vista === 'gantt'} onClick={() => setVista('gantt')} style={boton(vista === 'gantt')}>📅 Gantt</button></span>
      <ConLimpiar valor={busca} onLimpia={() => { setBusca(''); setCuantas(POR_PAGINA) }}>
        <input data-busca-historial type="text" value={busca} placeholder={conBloque ? 'Buscar valor o «bloque 2»…' : 'Buscar valor…'} aria-label="Buscar un valor en el historial" onChange={e => { setBusca(e.target.value); setCuantas(POR_PAGINA) }}
          style={{ fontFamily: B.letra, fontSize: 13, background: B.fondo, color: B.texto, border: `1px solid ${B.borde}`, borderRadius: 6, padding: '5px 8px', width: 150 }}/></ConLimpiar>
      {busca && !conMovs && <span data-historial-filtro style={{ ...S.secundario, fontSize: 13 }}>{numero(lista.length, 0)} de {numero(ops.length, 0)} · {conSigno(tot, 0)}</span>}
      {busca && conMovs && <span data-historial-filtro style={{ ...S.secundario, fontSize: 13 }}>{numero(listaM.length, 0)} de {numero(movs.length, 0)} movimientos</span>}
      {!conMovs && <button type="button" data-excel-historial onClick={descarga} disabled={!lista.length} title="Descarga estas operaciones en un Excel" style={{ ...boton(false), marginLeft: 'auto' }}>📊 Excel</button>}
      {excel && excel !== '…' && <span style={{ color: ROJO, fontSize: 12 }}>{excel}</span>}
    </div>
    {conMovs ? (!listaM.length ? <div data-historial-vacio style={S.secundario}>{busca ? `Ningún movimiento de «${busca}».` : 'Sin movimientos.'}</div>
      : <><div style={{ overflowX: 'auto' }}><table data-tabla="detalle-movimientos" style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead><tr><th style={cab}>Fecha</th>{conBloque && <th style={cab}>Bloque</th>}<th style={cab}>Qué pasa</th>{['Importe', 'Comisión', 'En valores', `En el ocioso (${listaM[0].nombreOcioso})`].map(h => <th key={h} style={cabNum}>{h}</th>)}</tr></thead>
        <tbody>{listaM.slice(0, cuantas).map(m => <tr key={m.k} data-movimiento={m.tipo}>
          <td style={{ ...celda, whiteSpace: 'nowrap' }}>{fechaCorta(m.fecha)}</td>{conBloque && celdaBloque(m.bloque)}<td style={{ ...celda, color: COLOR_MOV[m.clase] || B.texto }}>{m.que}</td>
          <td style={{ ...num, color: m.tipo === 'impuesto' || m.tipo === 'impuestoFinal' ? ROJO : B.texto }}>{m.signo < 0 ? '−' : '+'}{euros(m.importe, 2)}</td><td style={{ ...num, color: B.secundario }}>{m.coste ? euros(m.coste, 2) : ''}</td>
          <td style={{ ...num, color: B.secundario }}>{euros(m.enValores, 0)}</td><td style={{ ...num, color: B.secundario }}>{euros(m.enOcioso, 0)}</td></tr>)}</tbody>
      </table></div>
      {listaM.length > cuantas && <div style={{ marginTop: 8 }}><button type="button" data-mas-historial onClick={() => setCuantas(c => c + POR_PAGINA)} style={boton(false)}>Ver {numero(Math.min(POR_PAGINA, listaM.length - cuantas), 0)} más (quedan {numero(listaM.length - cuantas, 0)})</button></div>}</>)
    : vista === 'gantt' ? <div data-gantt-detalle style={{ height: Math.min(560, 90 + 26 * new Set(trades.map(t => t.symbol)).size), display: 'flex', flexDirection: 'column', border: `1px solid ${B.borde}`, borderRadius: 6, overflow: 'hidden' }}>
        <GanttChart trades={trades} startDate={desde} endDate={hasta} modoAsig="compartido" sinDescartados/></div>
      : !lista.length ? <div data-historial-vacio style={S.secundario}>Ninguna operación de «{busca}».</div>
      : <><div style={{ overflowX: 'auto' }}><table data-tabla="detalle-historial" style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead><tr>{conBloque && <th style={cab}>Bloque</th>}<th style={cab}>Valor</th><th style={cab}>Compra</th><th style={cab}>Venta</th>{['Acciones', 'Precio de compra', 'Precio de venta', 'Resultado', '%'].map(h => <th key={h} style={cabNum}>{h}</th>)}</tr></thead>
        <tbody>{lista.slice(0, cuantas).map((o, k) => <tr key={`${o.simbolo}-${o.entryDate}-${k}`} data-operacion={o.simbolo} onClick={onOperacion ? () => onOperacion(o) : undefined} title={onOperacion ? `Pulsa para ver esta operación en el gráfico de ${o.simbolo}` : undefined} style={onOperacion ? { cursor: 'pointer' } : undefined}>
          {conBloque && celdaBloque(o.bloque)}<td style={{ ...celda, color: B.texto }}>{o.simbolo}</td>
          <td style={celda}>{fechaCorta(o.entryDate)}</td><td style={celda}>{fechaCorta(o.exitDate)}{o.abierta && <span title="Seguía abierta el último día: se cuenta vendida ese día" style={{ color: AMARILLO }}> · abierta</span>}</td>
          <td style={num}>{numero(o.unidades, o.unidades < 10 ? 4 : 2)}</td><td style={num}>{euros(o.entryPrice, 2)}</td><td style={num}>{euros(o.exitPrice, 2)}</td>
          <td style={{ ...num, color: signo(o.resultado) }}>{conSigno(o.resultado, 2)}</td><td style={{ ...num, color: signo(o.pct) }}>{o.pct == null ? '—' : `${o.pct > 0 ? '+' : ''}${pct(o.pct, 1)}`}</td>
        </tr>)}</tbody>
      </table></div>
      {lista.length > cuantas && <div style={{ marginTop: 8 }}><button type="button" data-mas-historial onClick={() => setCuantas(c => c + POR_PAGINA)} style={boton(false)}>Ver {numero(Math.min(POR_PAGINA, lista.length - cuantas), 0)} más (quedan {numero(lista.length - cuantas, 0)})</button></div>}</>}
  </>)
}

// §164 (parte 5c) · LAS VELAS de un valor: el gráfico del Backtesting TAL CUAL (AssetSignalChart de components/BacktestCharts.js: sus velas,
// la rueda para acercar, arrastrar, las etiquetas y el globo de cada operación), con las operaciones de ESTE plan. Él mismo pide sus velas
// (/api/chartdata) cuando se ve. foco: { n, from, to } = centrar en esas fechas y resaltar la operación n de ese valor (la del historial).
const aniosHasta = (desde) => Math.max(1, Math.ceil((Date.now() - Date.parse(desde + 'T00:00:00Z')) / (365.25 * 864e5)) + 1)
export function VelasValor({ sim, ops, desde, hasta, alto: altoNormal = 400, foco = null, etiquetas = true }) {
  const alto = altoAmpliado(useContext(AmpliadoCtx), altoNormal)
  const senales = useMemo(() => senalesGrafico(ops, sim, nombreSenales), [ops, sim])
  const rango = useMemo(() => foco ? { from: foco.from, to: foco.to } : { from: desde, to: hasta }, [foco?.from, foco?.to, desde, hasta])
  const n = senales[0]?.trades.length || 0
  return (
    <div data-velas-valor={sim} data-operaciones={n} data-foco={foco ? foco.n : undefined}>
      <AssetSignalChart key={`${sim}|${foco?.n ?? ''}`} symbol={sim} stratSignals={senales} years={aniosHasta(desde)} height={alto} rangoVisible={rango} verEtiquetas={etiquetas} ruedaTrasClic
        onReady={({ highlightTrade }) => { if (foco?.n) setTimeout(() => highlightTrade?.(foco.n), 150) }}/>
    </div>
  )
}
const nombreSenales = 'Operaciones del plan'
// §164 · «Vista de gráficos»: un gráfico por valor, los del Backtesting (cada uno pide sus velas cuando se ve). «Ver en grande» lo abre arriba.
function VistaGraficos({ filas, ops, desde, hasta, onElegir }) {
  return (
    <div data-vista-graficos style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {filas.map(f => <div key={f.simbolo} data-grafico-pequeno={f.simbolo} style={{ border: `1px solid ${B.borde}`, borderRadius: 6, padding: '6px 8px', background: B.fondo }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, marginBottom: 4 }}><b style={{ color: B.titulo }}>{f.simbolo}</b><span style={{ color: signo(f.aporto) }}>{conSigno(f.aporto)}</span><span style={{ color: B.secundario }}>{numero(f.operaciones, 0)} operaciones · {pct(f.ganadoras, 1)} ganan</span>
          <button type="button" data-ver-grande={f.simbolo} onClick={() => onElegir(f.simbolo)} style={{ ...boton(false), marginLeft: 'auto' }}>Ver en grande ↑</button></div>
        <VelasValor sim={f.simbolo} ops={ops} desde={desde} hasta={hasta} alto={300}/>
      </div>)}
    </div>
  )
}

// §162 · Las cifras de arriba de «Detalle».
function FilaCifras({ c }) {
  const caja = { background: B.tarjeta, border: `1px solid ${B.borde}`, borderRadius: 8, padding: '7px 10px', minWidth: 0 }
  const peq = { color: B.secundario, fontSize: 12, display: 'flex', alignItems: 'center', gap: 2 }
  const una = (id, titulo, valor, color, sub = null, titulo2 = null) => <div data-cifra-detalle={id} style={caja} title={titulo2 || undefined}><div style={peq}>{titulo}</div><div style={{ fontSize: 17, fontWeight: 700, color: color || B.titulo }}>{valor}</div>{sub && <div style={{ ...S.apagado }}>{sub}</div>}</div>
  return (
    <div data-fila-cifras style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginTop: 10 }}>
      {una('cagr', <>CAGR del plan<Ayuda texto={AYUDA_DETALLE.cifras} etiqueta="Las cifras de «Detalle»"/></>, pct(c.cagr), signo(c.cagr))}
      {una('ganancia', 'Ganancia', pctSigno(c.gananciaPct, 0), signo(c.ganancia), conSigno(c.ganancia, 0))}
      {una('caida', 'Peor caída', pct(c.caidaPct, 1), ROJO, conSigno(c.caidaEur, 0))}
      {una('ganadoras', 'Ganadoras', pct(c.ganadoras, 1), null, `${numero(c.ganan, 0)} de ${numero(c.operaciones, 0)}`)}
      {una('pf', 'Profit Factor', c.pf == null ? '—' : numero(c.pf, 2), c.pf == null ? null : c.pf >= 1 ? VERDE : ROJO)}
      {una('en-valores', 'Dinero en valores', pct(c.enValores, 0), null, 'de media', `De media, ${euros(c.enValoresEur, 0)} en valores`)}
      {una('tiempo', 'Tiempo con algo invertido', pct(c.tiempoInvertido, 0), null, `${numero(Math.round(c.tiempoInvertido * c.dias), 0)} de ${numero(c.dias, 0)} días`)}
    </div>
  )
}

const Tarjeta = ({ id, titulo, ayuda, derecha = null, children }) => (
  <div data-tarjeta={id} style={{ ...S.tarjeta, marginTop: 14 }}>
    <div style={{ ...S.cabeceraTarjeta, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>{titulo}{ayuda && <Ayuda texto={ayuda} etiqueta={typeof titulo === 'string' ? titulo : id}/>}{derecha && <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 6, alignItems: 'center', fontWeight: 400 }}>{derecha}</span>}</div>
    <div style={S.cuerpo}>{children}</div>
  </div>
)

// §188 · «Qué aportó cada bloque»: una fila por bloque (pulsarla despliega sus valores; «Expandir todo» los abre todos), la del dinero ocioso
// de la cuenta y la de todos los bloques juntos. Mismas columnas que «Qué aportó cada valor».
const COLUMNAS_DETALLE = [['Aportó', AYUDA_DETALLE.tabla], ['Aportó %', AYUDA_DETALLE.aportoPct], ['CAGR de su aportación', AYUDA_DETALLE.cagrValor], ['Operaciones'], ['Ganadoras'], ['Profit Factor'], ['Peor caída', AYUDA_DETALLE.caidaValor], ['Dinero en él', AYUDA_DETALLE.enEl], ['Tiempo dentro']]
function celdasCifras(f, { quien, enElTexto = null, opsExtra = null } = {}) {
  return [
    <td key="a" style={{ ...num, color: signo(f.aporto) }}>{conSigno(f.aporto)}</td>,
    <td key="b" style={{ ...num, color: signo(f.aportoPct) }}>{pctSigno(f.aportoPct)}</td>,
    <td key="c" style={{ ...num, color: signo(f.cagr) }}>{pct(f.cagr)}</td>,
    <td key="d" style={num}>{opsExtra || numero(f.operaciones, 0)}</td>,
    <td key="e" style={num}>{pct(f.ganadoras, 1)}</td>,
    <td key="f" style={num}>{f.pf == null ? '—' : numero(f.pf, 2)}</td>,
    <td key="g" style={{ ...num, color: f.caidaEur < 0 ? ROJO : undefined }} title={f.compartido ? `${quien} está en varios bloques: su caída no se puede separar` : f.caidaEur < 0 ? `${conSigno(f.caidaEur, 0)} de lo ganado con ${quien}` : 'Sin caídas'}>{f.caidaPct == null || !(f.caidaEur < 0) ? '—' : pct(f.caidaPct, 1)}</td>,
    <td key="h" style={num} title={f.compartido ? `${quien} está en varios bloques: el motor lleva sus acciones juntas` : `De media, ${euros(f.enElEur, 0)} en ${quien}`}>{enElTexto ?? (f.enEl == null ? '—' : pct(f.enEl, 1))}</td>,
    <td key="i" style={num}>{pct(f.dentro, 0)}</td>,
  ]
}
// §191: la fila del dinero ocioso (las dos tablas): lo que aportó, su CAGR, sus órdenes, su peor caída, cuánto dinero tuvo de media y la parte
// de los días con algo en él. Sin ganadoras ni Profit Factor («—» con el motivo al pasar el ratón).
const SIN_OPERACIONES_OCIOSO = 'El dinero ocioso no hace operaciones con resultado: entra y sale a trozos cuando los bloques sueltan o piden dinero, sin ninguna regla que acierte o falle. Para saber si te ayuda, mira lo que aportó y la fila «El mismo plan con el dinero ocioso en liquidez» de «Tu dinero».'
function celdasOcioso(ocioso, s) {
  const sinOc = ocioso.simbolo === 'LIQUIDEZ', gris = { ...num, fontWeight: 400, color: B.secundario }
  return [
    <td key="a" style={{ ...num, color: signo(ocioso.aporto) }}>{sinOc ? euros(0, 0) : conSigno(ocioso.aporto)}</td>,
    <td key="b" style={{ ...num, color: signo(ocioso.aporto) }}>{sinOc ? '' : pctSigno(s.aportado > 0 ? ocioso.aporto / s.aportado : null)}</td>,
    <td key="c" data-cagr-ocioso style={{ ...num, color: signo(ocioso.cagr) }} title={sinOc ? undefined : 'Lo que aportó el ocioso a tu plan, al año (no es la rentabilidad del oro: tu dinero solo estuvo ahí parte del tiempo)'}>{sinOc ? '' : pct(ocioso.cagr)}</td>,
    <td key="d" style={gris}>{sinOc ? 'sin órdenes' : `${numero(ocioso.ordenes, 0)} órdenes`}</td>,
    <td key="e" style={gris} title={sinOc ? undefined : SIN_OPERACIONES_OCIOSO}>{sinOc ? '' : '—'}</td>,
    <td key="f" style={gris} title={sinOc ? undefined : SIN_OPERACIONES_OCIOSO}>{sinOc ? '' : '—'}</td>,
    <td key="g" data-caida-ocioso style={{ ...num, color: ocioso.caidaEur < 0 ? ROJO : undefined }} title={sinOc ? undefined : ocioso.caidaEur < 0 ? `${conSigno(ocioso.caidaEur, 0)} de lo ganado con el ocioso` : 'Sin caídas'}>{sinOc || ocioso.caidaPct == null || !(ocioso.caidaEur < 0) ? (sinOc ? '' : '—') : pct(ocioso.caidaPct, 1)}</td>,
    <td key="h" style={gris} title={sinOc ? 'En liquidez, de media' : `En el ocioso, de media${ocioso.liquidez >= 0.005 ? `; además, ${pct(ocioso.liquidez, 0)} en liquidez` : ''}`}>{pct(sinOc ? ocioso.liquidez : (ocioso.media || 0), 0)}</td>,
    <td key="i" data-dentro-ocioso style={num}>{sinOc ? '' : pct(ocioso.dentro, 0)}</td>,
  ]
}
function TablaBloques({ bloques, total, ocioso, s, cifras, senales, abiertos, abiertoTotal, todosAbiertos, onTotal, onAbre, onTodos, onVelas, onIrAValor, elegido }) {
  const nombreOc = nombreOcioso(ocioso.simbolo)
  return (
    <Tarjeta id="detalle-bloques" titulo="Qué aportó cada bloque" ayuda={`${AYUDA_DETALLE.bloques} ${AYUDA_DETALLE.ocioso}`}
      derecha={<button type="button" data-expande-bloques aria-expanded={todosAbiertos} onClick={onTodos} style={boton(false)}>{todosAbiertos ? 'Plegar todo ▴' : 'Expandir todo ▾'}</button>}>
      <div style={{ overflowX: 'auto' }}><table data-tabla="detalle-bloques" style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead><tr><th style={cab}>Bloque / valor</th>{COLUMNAS_DETALLE.map(([h, a]) => <th key={h} data-columna={h} style={cabNum}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>{h}{a && <Ayuda texto={a} etiqueta={h}/>}</span></th>)}</tr></thead>
        <tbody>
          <tr data-fila-total style={{ fontWeight: 700, color: B.titulo, background: B.cabecera }}>
            <td style={celda}><button type="button" data-pliega-total aria-expanded={abiertoTotal} onClick={onTotal} title={abiertoTotal ? 'Ocultar los bloques' : 'Ver los bloques'} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: B.titulo, fontFamily: B.letra, fontSize: 'inherit', fontWeight: 700, textAlign: 'left' }}>{abiertoTotal ? '▾' : '▸'} Los {numero(bloques.length, 0)} bloques <span style={{ fontWeight: 400, color: B.secundario }}>(sin el ocioso)</span></button></td>
            {celdasCifras({ ...total, dentro: cifras?.tiempoInvertido, enEl: total.enValores, enElEur: total.enValoresEur }, { quien: 'los valores',
              opsExtra: <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, justifyContent: 'flex-end' }}>{numero(total.operaciones, 0)}{senales && <span data-senales title={textoSenales(senales)} style={{ fontSize: 10, fontWeight: 400, cursor: 'help', borderRadius: 3, padding: '1px 4px', color: senales.pct >= 0.995 ? VERDE : C.naranjaVivo, background: senales.pct >= 0.995 ? 'rgba(126,226,160,0.10)' : 'rgba(255,159,67,0.12)' }}>{Math.round(senales.pct * 100)} %</span>}</span> })}
          </tr>
          {abiertoTotal && bloques.map(b => { const ab = abiertos.has(b.n)
            return <Fragment key={b.n}>
              <tr data-fila-bloque={b.n} style={{ fontWeight: 700, color: B.titulo }}>
                <td style={{ ...celda, paddingLeft: 24 }}>
                  <button type="button" data-pliega-bloque={b.n} aria-expanded={ab} onClick={() => onAbre(b.n)} title={ab ? 'Ocultar sus valores' : 'Ver sus valores'} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: B.titulo, fontFamily: B.letra, fontSize: 'inherit', fontWeight: 700, display: 'inline-flex', alignItems: 'center', textAlign: 'left' }}>{ab ? '▾' : '▸'}&nbsp;<Punto n={b.n}/>Bloque {b.n} · {b.nombre}</button>
                  <div data-resumen-bloque-detalle style={{ ...S.apagado, fontWeight: 400, paddingLeft: 30 }}>{pct(b.peso, 0)} de tu dinero · {b.donde} · velas {b.velas}</div>
                </td>
                {celdasCifras(b, { quien: `el bloque ${b.n}` })}
              </tr>
              {ab && b.valores.map(v => <tr key={v.simbolo} data-valor-bloque={`${b.n}-${v.simbolo}`} aria-selected={v.simbolo === elegido} style={v.simbolo === elegido ? { background: B.cabecera } : undefined}>
                <td style={{ ...celda, paddingLeft: 60 }}>
                  <button type="button" data-elige-valor={v.simbolo} onClick={() => onVelas(v.simbolo)} title={`Pulsa para ver las velas de ${v.simbolo} con sus operaciones`} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: B.texto, fontFamily: B.letra, fontSize: 'inherit' }}>{v.simbolo}</button>
                  {onIrAValor && <button type="button" data-ir-valor={v.simbolo} onClick={() => onIrAValor(v.simbolo)} title={`Abrir ${v.simbolo} en la Watchlist`} style={{ background: 'none', border: 'none', padding: '0 0 0 6px', cursor: 'pointer', color: B.enlace, fontSize: 13 }}>↗</button>}
                  {v.compartido && <span title="Este valor está también en otro bloque" style={{ ...S.apagado, marginLeft: 6 }}>· en varios bloques</span>}
                </td>
                {celdasCifras(v, { quien: v.simbolo })}
              </tr>)}
              {ab && !b.valores.length && <tr><td colSpan={10} style={{ ...celda, ...S.apagado, paddingLeft: 60 }}>Sin operaciones en el periodo.</td></tr>}
            </Fragment> })}
          <tr data-fila-ocioso style={{ fontWeight: 700, color: B.titulo }}>
            <td style={celda}>Dinero ocioso de la cuenta · {nombreOc}</td>
            {celdasOcioso(ocioso, s)}
          </tr>
        </tbody>
      </table></div>
    </Tarjeta>
  )
}

export default function PlanDetalle({ detalle, cifras, graficoPlan = null, onIrAValor = null, viejas = false, inicial = null, nombre = null, version = null }) {
  const [modo, setModo] = useState(inicial?.modo || 'plan')
  const [elegido, setElegido] = useState(inicial?.elegido || null)
  const [abierta, setAbierta] = useState(inicial?.abierta ?? false)   // §167: los valores, plegados al entrar (pedido por Sergi)
  // §188: con varios bloques, los bloques abiertos en «Qué aportó cada bloque» (de entrada, plegados) y el resaltado de «Bloque a bloque».
  const [abiertosB, setAbiertosB] = useState(() => new Set(inicial?.bloquesAbiertos || []))
  const [elegidoB, setElegidoB] = useState(null)
  const [abiertoTotalB, setAbiertoTotalB] = useState(!!inicial?.totalBloquesAbierto)   // §191: «Los N bloques» arriba, plegada al entrar
  // §160: el valor cuyas velas se ven en «Cómo crece» (null = el gráfico del plan) y si la «Vista de gráficos» está abierta.
  const [verValor, setVerValor] = useState(inicial?.verValor || null)
  const [vistaG, setVistaG] = useState(!!inicial?.vistaGraficos)
  // §164: la operación pulsada en el historial o en «Resultados por operación» ({ n, from, to }; null = todo el periodo).
  const [foco, setFoco] = useState(null)
  const crece = useRef(null)
  if (!detalle) return <div data-sin-detalle style={{ ...S.tarjeta, ...S.cuerpo, ...S.secundario }}>Este cálculo no trae el detalle. Cambia cualquier ajuste del plan y se calculará de nuevo.</div>
  const { cabecera: c, suma: s, filas, total, ocioso } = detalle
  // §161: con un solo valor, sin la tabla por valor, sin «Valor a valor» ni «Vista de gráficos», y sus velas siempre a la vista.
  const unValor = !!detalle.unValor, simVelas = unValor ? detalle.simbolo : verValor
  const nombreOc = nombreOcioso(ocioso.simbolo), sinOcioso = ocioso.simbolo === 'LIQUIDEZ'
  const parte = (id, color, texto) => <span key={id} data-suma={id} style={{ color, whiteSpace: 'nowrap', ...(detalle.bloques ? { display: 'inline-flex', alignItems: 'center' } : {}) }}>{texto}</span>
  const bloques = detalle.bloques || null, todosAbiertos = !!bloques && abiertoTotalB && bloques.every(b => abiertosB.has(b.n))
  const ganadoTexto = (v, donde) => `${v < 0 ? '−' : '+'} ${euros(Math.abs(v), 0)} ${v < 0 ? 'perdidos' : 'ganados'} ${donde}`
  const elige = (sim) => { setElegido(sim); setModo('valores') }
  const abreOperacion = (o) => { const fo = focoDeOperacion(detalle.porOperacion?.ops || [], o); if (fo) abreVelas(o.simbolo, fo) }
  const abreVelas = (sim, fo = null) => { setVerValor(sim); setFoco(fo); try { crece.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }) } catch (_) {} }
  const bh = (cifras?.alternativas || []).filter(x => x.id !== 'OCIOSO_LIQUIDEZ')
  return (
    <div data-vista-detalle data-cifras-viejas={viejas ? 'si' : undefined} title={viejas ? 'Calculando con tus ajustes de ahora: estas cifras son del cálculo anterior.' : undefined} style={{ display: 'flex', flexDirection: 'column', opacity: viejas ? 0.4 : 1, transition: 'opacity 0.15s' }}>
      <div data-detalle-cabecera style={{ ...S.secundario, fontSize: 13, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap', marginTop: 10 }}>
        <span>{c.bloques ? `${numero(c.bloques, 0)} bloques · ` : ''}{unValor ? `1 valor (${detalle.simbolo})` : c.valores === 1 ? '1 valor' : `${numero(c.valores, 0)} valores`}{c.conOperaciones < c.valores ? ` (${numero(c.conOperaciones, 0)} con operaciones)` : ''}{c.bloques ? '' : ` · velas ${c.velas}`} · {fechaCorta(c.desde)} → {fechaCorta(c.hasta)} · {numero(c.operaciones, 0)} operaciones · {numero(c.ordenes, 0)} órdenes</span>
        <Ayuda etiqueta="Órdenes" texto={`${AYUDA_DETALLE.ordenes} En este plan: ${numero(c.ordenesValores, 0)} de la estrategia${c.ordenesOcioso ? ` + ${numero(c.ordenesOcioso, 0)} del dinero ocioso` : ''}${c.ordenesOtras ? ` + ${numero(c.ordenesOtras, 0)} más` : ''} = ${numero(c.ordenes, 0)} órdenes y ${euros(s.costes, 2)} de comisiones.`}/>
        <span style={{ marginLeft: 'auto' }}><BotonCopiar obtenerTexto={() => textoDetalle(detalle, { nombre, version })} titulo="Copia el detalle del plan en texto, para pegarlo en una conversación con Claude"/></span>
      </div>
      <div data-detalle-suma data-cuadra={s.cuadra ? 'si' : 'no'} style={{ display: 'flex', gap: '4px 9px', alignItems: 'center', flexWrap: 'wrap', background: B.cabecera, border: `1px solid ${B.borde}`, borderRadius: B.radioBoton, padding: '9px 12px', marginTop: 8, fontVariantNumeric: 'tabular-nums' }}>
        {parte('aportado', B.texto, `${euros(s.aportado, 0)} que pusiste`)}
        {bloques ? bloques.map(b => parte(`bloque-${b.n}`, signo(b.aporto) || B.texto, <><Punto n={b.n}/>{ganadoTexto(b.aporto, `con el bloque ${b.n}`)}</>))
          : parte('valores', signo(s.valores) || B.texto, `${s.valores < 0 ? '−' : '+'} ${euros(Math.abs(s.valores), 0)} ${s.valores < 0 ? 'perdidos' : 'ganados'} en los valores`)}
        {!sinOcioso && parte('ocioso', signo(s.ocioso) || B.texto, `${s.ocioso < 0 ? '−' : '+'} ${euros(Math.abs(s.ocioso), 0)} ${s.ocioso < 0 ? 'perdidos' : 'ganados'} en el ocioso`)}
        {Math.abs(s.otros) >= 0.005 && parte('otros', signo(s.otros) || B.texto, `${s.otros < 0 ? '−' : '+'} ${euros(Math.abs(s.otros), 0)} en lo demás`)}
        {parte('costes', s.costes > 0 ? ROJO : B.texto, `− ${euros(s.costes, 0)} de comisiones`)}
        {parte('impuestos', s.impuestos > 0 ? ROJO : B.texto, `− ${euros(s.impuestos, 0)} de impuestos`)}
        <span style={{ color: B.texto }}>=</span>
        <b data-suma="final" style={{ color: B.titulo, fontSize: 17, whiteSpace: 'nowrap' }}>{euros(s.final, 0)}</b>
        <span data-suma-nota style={{ color: s.cuadra ? B.apagado : ROJO, fontSize: 12 }}>{s.cuadra ? '= «Tienes al final» de «Tu dinero» ✓' : '✕ no cuadra con «Tu dinero» (no debería pasar)'}</span>
        <Ayuda etiqueta="La suma del plan" texto={`${bloques ? AYUDA_DETALLE.sumaBloques : AYUDA_DETALLE.suma} En este plan, al céntimo: ${euros(s.aportado, 2)} ${bloques ? bloques.map(b => `${b.aporto < 0 ? '−' : '+'} ${euros(Math.abs(b.aporto), 2)} (bloque ${b.n})`).join(' ') : `${s.valores < 0 ? '−' : '+'} ${euros(Math.abs(s.valores), 2)}`} ${sinOcioso ? '' : `${s.ocioso < 0 ? '−' : '+'} ${euros(Math.abs(s.ocioso), 2)} `}− ${euros(s.costes, 2)} − ${euros(s.impuestos, 2)} = ${euros(s.final, 2)}.`}/>
      </div>

      {/* §162: la fila de cifras (las de la tabla del Backtesting que más se miran) */}
      {detalle.cifras && <FilaCifras c={detalle.cifras}/>}

      {bloques && <TablaBloques bloques={bloques} total={total} ocioso={ocioso} s={s} cifras={detalle.cifras} senales={detalle.senales} abiertos={abiertosB} abiertoTotal={abiertoTotalB} onTotal={() => setAbiertoTotalB(x => !x)} todosAbiertos={todosAbiertos}
        onAbre={(n) => setAbiertosB(x => { const y = new Set(x); if (y.has(n)) y.delete(n); else y.add(n); return y })} onTodos={() => { setAbiertoTotalB(!todosAbiertos); setAbiertosB(todosAbiertos ? new Set() : new Set(bloques.map(b => b.n))) }} onVelas={abreVelas} onIrAValor={onIrAValor} elegido={verValor}/>}
      {!unValor && !bloques && <Tarjeta id="detalle-valores" titulo="Qué aportó cada valor" ayuda={`${AYUDA_DETALLE.tabla} ${AYUDA_DETALLE.ocioso}`}>
        <div style={{ overflowX: 'auto' }}><table data-tabla="detalle-valores" style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead><tr><th style={cab}>Valor</th>{[['Aportó', AYUDA_DETALLE.tabla], ['Aportó %', AYUDA_DETALLE.aportoPct], ['CAGR de su aportación', AYUDA_DETALLE.cagrValor], ['Operaciones'], ['Ganadoras'], ['Profit Factor'], ['Peor caída', AYUDA_DETALLE.caidaValor], ['Dinero en él', AYUDA_DETALLE.enEl], ['Tiempo dentro']].map(([h, a]) => <th key={h} data-columna={h} style={cabNum}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>{h}{a && <Ayuda texto={a} etiqueta={h}/>}</span></th>)}</tr></thead>
          <tbody>
            <tr data-fila-total style={{ fontWeight: 700, color: B.titulo }}>
              <td style={celda}><button type="button" data-pliega-valores aria-expanded={abierta} onClick={() => setAbierta(x => !x)} title={abierta ? 'Ocultar los valores' : 'Ver los valores'} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: B.titulo, fontFamily: B.letra, fontSize: 'inherit', fontWeight: 700 }}>{abierta ? '▾' : '▸'} {filas.length === 1 ? filas[0].simbolo : `Los ${numero(filas.length, 0)} valores`}</button></td>
              <td style={{ ...num, color: signo(total.aporto) }}>{conSigno(total.aporto)}</td><td style={{ ...num, color: signo(total.aportoPct) }}>{pctSigno(total.aportoPct)}</td><td style={{ ...num, color: signo(total.cagr) }}>{pct(total.cagr)}</td>
              <td style={num}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, justifyContent: 'flex-end' }}>{numero(total.operaciones, 0)}{detalle.senales && <span data-senales title={textoSenales(detalle.senales)} style={{ fontSize: 10, fontWeight: 400, cursor: 'help', borderRadius: 3, padding: '1px 4px', color: detalle.senales.pct >= 0.995 ? VERDE : C.naranjaVivo, background: detalle.senales.pct >= 0.995 ? 'rgba(126,226,160,0.10)' : 'rgba(255,159,67,0.12)' }}>{Math.round(detalle.senales.pct * 100)} %</span>}</span></td><td style={num}>{pct(total.ganadoras, 1)}</td><td style={num}>{total.pf == null ? '—' : numero(total.pf, 2)}</td><td style={{ ...num, color: total.caidaEur < 0 ? ROJO : undefined }} title={total.caidaEur < 0 ? `${conSigno(total.caidaEur, 0)} de lo ganado con los valores` : 'Sin caídas'}>{total.caidaPct == null || !(total.caidaEur < 0) ? '—' : pct(total.caidaPct, 1)}</td>
              <td style={num} title={`De media, ${euros(total.enValoresEur, 0)} en valores`}>{pct(total.enValores, 0)}</td><td style={num}>{pct(detalle.cifras?.tiempoInvertido, 0)}</td>
            </tr>
            {abierta && filas.length > 1 && filas.map(f => <tr key={f.simbolo} data-valor={f.simbolo} aria-selected={f.simbolo === elegido} style={f.simbolo === elegido ? { background: B.cabecera } : undefined}>
              <td style={{ ...celda, paddingLeft: 24 }}>
                <button type="button" data-elige-valor={f.simbolo} onClick={() => abreVelas(f.simbolo)} title={`Pulsa para ver las velas de ${f.simbolo} con sus operaciones`} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: B.texto, fontFamily: B.letra, fontSize: 'inherit', fontWeight: f.simbolo === elegido ? 700 : 400 }}>{f.simbolo}</button>
                {onIrAValor && <button type="button" data-ir-valor={f.simbolo} onClick={() => onIrAValor(f.simbolo)} title={`Abrir ${f.simbolo} en la Watchlist`} style={{ background: 'none', border: 'none', padding: '0 0 0 6px', cursor: 'pointer', color: B.enlace, fontSize: 13 }}>↗</button>}
              </td>
              <td style={{ ...num, color: signo(f.aporto) }}>{conSigno(f.aporto)}</td><td style={{ ...num, color: signo(f.aportoPct) }}>{pctSigno(f.aportoPct)}</td><td style={{ ...num, color: signo(f.cagr) }}>{pct(f.cagr)}</td>
              <td style={num} title={(() => { const ps = detalle.senales?.porSimbolo?.[f.simbolo]; return ps ? `De ${ps.generadas} señales de ${f.simbolo}, entraron ${ps.ejecutadas}` : undefined })()}>{numero(f.operaciones, 0)}</td><td style={num}>{pct(f.ganadoras, 1)}</td><td style={num}>{f.pf == null ? '—' : numero(f.pf, 2)}</td>
              <td style={{ ...num, color: f.caidaEur < 0 ? ROJO : undefined }} title={f.caidaEur < 0 ? `${conSigno(f.caidaEur, 0)} de lo ganado con ${f.simbolo}` : 'Sin caídas'}>{f.caidaPct == null || !(f.caidaEur < 0) ? '—' : pct(f.caidaPct, 1)}</td>
              <td style={num} data-en-el={f.simbolo} title={`De media, ${euros(f.enElEur, 0)} en ${f.simbolo}`}>{pct(f.enEl, 1)}</td><td style={num}>{pct(f.dentro, 0)}</td>
            </tr>)}
            <tr data-fila-ocioso style={{ fontWeight: 700, color: B.titulo }}>
              <td style={celda}>Dinero ocioso · {nombreOc}</td>
              {celdasOcioso(ocioso, s)}
            </tr>
          </tbody>
        </table></div>
      </Tarjeta>}

      <div ref={crece}/>
      {simVelas && <Tarjeta id="detalle-velas" titulo={`${simVelas} · sus velas con las operaciones del plan`} ayuda={AYUDA_DETALLE.velas}
        derecha={unValor ? null : <button type="button" data-volver-velas onClick={() => { setVerValor(null); setFoco(null) }} style={boton(false)}>← Volver al gráfico del plan</button>}>
        <Ampliable titulo={`${simVelas} · sus velas con las operaciones del plan`}><VelasValor sim={simVelas} ops={detalle.porOperacion?.ops || []} desde={c.desde} hasta={c.hasta} alto={420} foco={foco && foco.sim === simVelas ? foco : null}/></Ampliable>
        {foco && foco.sim === simVelas && <div data-foco-linea style={{ ...S.secundario, fontSize: 12, marginTop: 4, display: 'flex', gap: 10, alignItems: 'center' }}>Centrado en la operación del {fechaCorta(foco.entryDate)} al {fechaCorta(foco.exitDate)} ({conSigno(foco.resultado, 2)}). Con la rueda del ratón te alejas.<button type="button" data-todo-periodo onClick={() => setFoco(null)} style={boton(false)}>Ver todo el periodo</button></div>}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', fontSize: 12, color: B.secundario, marginTop: 6 }}><span><span style={{ color: VERDE }}>▲</span> compra</span><span><span style={{ color: VERDE }}>▼</span> / <span style={{ color: ROJO }}>▼</span> venta</span><span><span style={{ color: VERDE }}>━</span> operación que gana</span><span><span style={{ color: ROJO }}>━</span> operación que pierde</span>
          {(() => { const f = filas.find(x => x.simbolo === simVelas); return f ? <span style={{ marginLeft: 'auto' }}>aportó <b style={{ color: signo(f.aporto) }}>{conSigno(f.aporto)}</b> · {numero(f.operaciones, 0)} operaciones · {pct(f.ganadoras, 1)} ganan</span> : null })()}</div>
      </Tarjeta>}
      {(!verValor || unValor) && <Tarjeta id="detalle-crece" titulo="Cómo crece" ayuda={modo === 'valores' && !unValor ? AYUDA_DETALLE.valorAValor : modo === 'bloques' && bloques ? AYUDA_DETALLE.bloqueABloque : AYUDA_DETALLE.bh}
        derecha={unValor ? null : <span role="group" aria-label="Qué se dibuja" style={{ display: 'inline-flex', gap: 6 }}>
          <button type="button" data-modo-crece="plan" aria-pressed={modo === 'plan'} onClick={() => setModo('plan')} style={boton(modo === 'plan')}>El plan</button>
          {bloques && detalle.curvasBloques && <button type="button" data-modo-crece="bloques" aria-pressed={modo === 'bloques'} onClick={() => setModo('bloques')} style={boton(modo === 'bloques')}>Bloque a bloque</button>}
          <button type="button" data-modo-crece="valores" aria-pressed={modo === 'valores'} onClick={() => setModo('valores')} style={boton(modo === 'valores')}>Valor a valor</button></span>}>
        {modo === 'plan' || unValor ? <>
          <Ampliable titulo="Cómo crece · el plan">{graficoPlan}</Ampliable>
          {bh.length > 0 && <div style={{ overflowX: 'auto', marginTop: 10 }}><table data-tabla="detalle-bh" style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead><tr><th style={cab}>Los «comprar y mantener», con las reglas de tu plan</th>{['Tienes al final', 'CAGR', 'Peor caída'].map(h => <th key={h} style={cabNum}>{h}</th>)}</tr></thead>
            <tbody>{bh.map(x => <tr key={x.id} data-fila-bh={x.id} style={x.id === 'PLAN' ? { fontWeight: 700, color: B.titulo } : { color: B.secundario }}>
              <td style={celda}>{x.nombre}</td><td style={num}>{euros(x.final, 0)}</td><td style={{ ...num, color: signo(x.twr) }}>{pct(x.twr)}</td><td style={{ ...num, color: signo(x.caida) }}>{pct(x.caida)}</td></tr>)}</tbody>
          </table></div>}
        </> : modo === 'bloques' && bloques && detalle.curvasBloques ? <Ampliable titulo="Cómo crece · bloque a bloque"><GraficoValores curvas={detalle.curvasBloques} elegido={elegidoB} onElegir={setElegidoB} ocioso={ocioso.simbolo}/></Ampliable>
        : <Ampliable titulo="Cómo crece · valor a valor"><GraficoValores curvas={detalle.curvas} elegido={elegido} onElegir={setElegido} ocioso={ocioso.simbolo}/></Ampliable>}
      </Tarjeta>}
      {/* §157 (parte 3a) */}
      {detalle.mensuales?.length > 0 && <Tarjeta id="detalle-mensual" titulo="Ganancias mensuales" ayuda={AYUDA_DETALLE.mensuales}><Ampliable titulo="Ganancias mensuales"><TablaMensual anios={detalle.mensuales}/></Ampliable></Tarjeta>}
      {detalle.donde && <Tarjeta id="detalle-donde" titulo="Dónde está tu dinero cada día" ayuda={bloques ? `${AYUDA_DETALLE.dondeEsta} ${AYUDA_DETALLE.dondeBloques}` : AYUDA_DETALLE.dondeEsta}><Ampliable titulo="Dónde está tu dinero cada día"><GraficoDondeEsta donde={detalle.donde} ocioso={ocioso.simbolo}/></Ampliable></Tarjeta>}
      {detalle.porOperacion && <Tarjeta id="detalle-por-operacion" titulo="Resultados por operación" ayuda={AYUDA_DETALLE.porOperacion}
        derecha={<span data-resumen-operaciones style={{ color: B.secundario, fontSize: 13 }}>{numero(detalle.porOperacion.ops.length, 0)} · <span style={{ color: VERDE }}>{numero(detalle.porOperacion.ganan, 0)} ganan</span> · <span style={{ color: ROJO }}>{numero(detalle.porOperacion.pierden, 0)} pierden</span></span>}>
        <Ampliable titulo="Resultados por operación"><BarrasOperaciones datos={detalle.porOperacion} onPulsa={abreOperacion}/></Ampliable></Tarjeta>}
      {/* §158 (parte 3b) */}
      {detalle.porOperacion && <Tarjeta id="detalle-historial" titulo={`Historial · ${numero(detalle.porOperacion.ops.length, 0)} operaciones`} ayuda={`${AYUDA_DETALLE.historial} ${AYUDA_DETALLE.movimientos}`}>
        <Historial ops={detalle.porOperacion.ops} movs={detalle.movimientos || []} onOperacion={abreOperacion} desde={detalle.cabecera.desde} hasta={detalle.cabecera.hasta} nombre={nombre || 'plan'} inicial={inicial?.historial || null}/></Tarjeta>}
      {/* §160 (parte 4b) */}
      {filas.length > 0 && !unValor && <Tarjeta id="detalle-vista-graficos" titulo="Vista de gráficos" ayuda={AYUDA_DETALLE.vistaGraficos}
        derecha={<button type="button" data-abre-vista-graficos aria-expanded={vistaG} onClick={() => setVistaG(x => !x)} style={boton(vistaG)}>{vistaG ? 'Ocultar ▴' : `Ver un gráfico por valor (${numero(filas.length, 0)}) ▾`}</button>}>
        {vistaG ? <VistaGraficos filas={filas} ops={detalle.porOperacion?.ops || []} desde={c.desde} hasta={c.hasta} onElegir={(s) => abreVelas(s)}/>
          : <div style={S.secundario}>Cerrada: al abrirla, cada gráfico pide sus velas cuando llega a la vista.</div>}
      </Tarjeta>}
    </div>
  )
}
