// components/PlanDetalle.js — la pestaña «Detalle» del plan (docs/builder.md §156; boceto bocetos/detalle-plan.html, pestaña 1).
// Enseña por dentro el MISMO cálculo de «Tu dinero» (un solo cálculo): no pide nada ni calcula nada del plan; pinta lo que prepara
// lib/builder/detallePlan.js con el libro del motor. Parte 2: la línea de arriba, la línea que suma, «Qué aportó cada valor» (con la fila
// del dinero ocioso) y «Cómo crece» («El plan», con el mismo gráfico de «Tu dinero» y los «comprar y mantener» del plan, y «Valor a
// valor»). Lo demás del boceto (ganancias mensuales, dónde está tu dinero, resultados por operación, historial, velas de un valor)
// llega en las partes siguientes; mientras, sigue la pestaña «La cartera por dentro».
//   detalle: lo de detallePlan · cifras: lo de cifrasPlan (las filas de los «comprar y mantener») · graficoPlan: el gráfico de «Tu dinero»
//   ya montado (lo pone BuilderPlan) · onIrAValor(símbolo): el «↗» · viejas: el cálculo es el anterior (se atenúa).
import { useEffect, useRef, useState } from 'react'
import { B, S } from '../lib/builder/estilo'
import Ayuda from './BuilderAyuda'
import { separaEtiquetas } from '../lib/builder/escalaGrafico'
import { AYUDA_DETALLE, nombreOcioso } from '../lib/builder/detallePlan'
import { euros, fechaCorta, numero, pct } from '../lib/builder/planPantalla'

const VERDE = '#7ee2a0', ROJO = '#ff8b8b', AZUL = '#58a6ff', AMARILLO = '#f2cc60', GRIS = '#4b5868'
export const COLORES_VALORES = ['#58a6ff', '#7ee2a0', '#f0883e', '#d2a8ff', '#56d4dd', '#ff8b8b', '#e3b341', '#a5d6ff', '#ffa198', '#b4f1b4']
const celda = { padding: '7px 10px', borderBottom: `1px solid ${B.borde}`, textAlign: 'left', verticalAlign: 'top' }
const num = { ...celda, textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }
const cab = { ...celda, color: B.secundario, fontWeight: 600, fontSize: 12, background: B.cabecera }
const cabNum = { ...cab, textAlign: 'right' }
const signo = (v) => Number.isFinite(v) && v > 0 ? VERDE : Number.isFinite(v) && v < 0 ? ROJO : undefined
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
  const n = curvas.fechas.length, IZQ = 76, DER = 150, H = 330, ARR = 16, ABJ = 24
  const orden = [...curvas.series].filter(s => s.rol === 'valor').sort((a, b) => Math.abs(b.v[n - 1]) - Math.abs(a.v[n - 1]))
  const colorDe = new Map(orden.map((s, k) => [s.simbolo, k < COLORES_VALORES.length ? COLORES_VALORES[k] : GRIS]))
  const series = curvas.series.map(s => ({ ...s, color: s.rol === 'ocioso' ? AMARILLO : colorDe.get(s.simbolo), nombre: s.rol === 'ocioso' ? `Ocioso · ${nombreOcioso(s.simbolo)}` : s.simbolo }))
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
      <svg data-grafico="valores" data-series={series.length} width={W} height={H + 20} role="img" aria-label={resumen} style={{ display: 'block', fontFamily: B.letra }}>
        {marcasLineales(lo, hi).map((t, k) => <g key={k}><line x1={IZQ} x2={W - DER} y1={y(t)} y2={y(t)} stroke={t === 0 ? '#3a4656' : '#1b2430'}/><text x={IZQ - 6} y={y(t) + 4} textAnchor="end" fontSize={12} fill={B.apagado}>{conSigno(t)}</text></g>)}
        {anios.filter((_, k) => k % cada === 0).map(([i, a]) => <text key={a} x={x(i)} y={H - 6} fontSize={12} fill={B.apagado}>{a}</text>)}
        {series.filter(s => s.simbolo !== elegido).map(s => <polyline key={s.simbolo} data-linea-valor={s.simbolo} points={ruta(s.v)} fill="none" stroke={s.color} strokeWidth={1.3} strokeDasharray={s.rol === 'ocioso' ? '5 3' : undefined} strokeLinejoin="round" opacity={sel ? 0.25 : 0.95}/>)}
        {sel && <polyline data-linea-valor={sel.simbolo} data-elegida="si" points={ruta(sel.v)} fill="none" stroke={sel.color === GRIS ? B.titulo : sel.color} strokeWidth={2.6} strokeLinejoin="round"/>}
        {etq.map(e => <text key={e.t} x={W - DER + 8} y={e.y + 4} fontSize={12} fill={e.color === GRIS ? B.texto : e.color} fontWeight={e.fuerte ? 700 : 400} opacity={sel && !e.fuerte ? 0.45 : 1}>{e.t}</text>)}
        {hov != null && <><line x1={x(hov)} x2={x(hov)} y1={ARR} y2={H - ABJ} stroke={B.titulo} strokeWidth={1} opacity={0.6}/>
          <text data-valores-dato x={IZQ} y={H + 14} fontSize={12} fill={B.texto}>{`${fechaCorta(curvas.fechas[hov])} · ${sel ? `${sel.nombre}: ${conSigno(sel.v[hov])} ganados hasta ese día` : `todos los valores: ${conSigno(total(hov))} ganados hasta ese día`}`}</text></>}
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

const Tarjeta = ({ id, titulo, ayuda, derecha = null, children }) => (
  <div data-tarjeta={id} style={{ ...S.tarjeta, marginTop: 14 }}>
    <div style={{ ...S.cabeceraTarjeta, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>{titulo}{ayuda && <Ayuda texto={ayuda} etiqueta={typeof titulo === 'string' ? titulo : id}/>}{derecha && <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 6, alignItems: 'center', fontWeight: 400 }}>{derecha}</span>}</div>
    <div style={S.cuerpo}>{children}</div>
  </div>
)

export default function PlanDetalle({ detalle, cifras, graficoPlan = null, onIrAValor = null, viejas = false, inicial = null }) {
  const [modo, setModo] = useState(inicial?.modo || 'plan')
  const [elegido, setElegido] = useState(inicial?.elegido || null)
  const [abierta, setAbierta] = useState(true)
  if (!detalle) return <div data-sin-detalle style={{ ...S.tarjeta, ...S.cuerpo, ...S.secundario }}>Este cálculo no trae el detalle. Cambia cualquier ajuste del plan y se calculará de nuevo.</div>
  const { cabecera: c, suma: s, filas, total, ocioso } = detalle
  const nombreOc = nombreOcioso(ocioso.simbolo), sinOcioso = ocioso.simbolo === 'LIQUIDEZ'
  const parte = (id, color, texto) => <span data-suma={id} style={{ color, whiteSpace: 'nowrap' }}>{texto}</span>
  const elige = (sim) => { setElegido(sim); setModo('valores') }
  const bh = (cifras?.alternativas || []).filter(x => x.id !== 'OCIOSO_LIQUIDEZ')
  return (
    <div data-vista-detalle data-cifras-viejas={viejas ? 'si' : undefined} title={viejas ? 'Calculando con tus ajustes de ahora: estas cifras son del cálculo anterior.' : undefined} style={{ display: 'flex', flexDirection: 'column', opacity: viejas ? 0.4 : 1, transition: 'opacity 0.15s' }}>
      <div data-detalle-cabecera style={{ ...S.secundario, fontSize: 13, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap', marginTop: 10 }}>
        <span>{c.valores === 1 ? '1 valor' : `${numero(c.valores, 0)} valores`}{c.conOperaciones < c.valores ? ` (${numero(c.conOperaciones, 0)} con operaciones)` : ''} · velas {c.velas} · {fechaCorta(c.desde)} → {fechaCorta(c.hasta)} · {numero(c.operaciones, 0)} operaciones · {numero(c.ordenes, 0)} órdenes</span>
        <Ayuda etiqueta="Órdenes" texto={`${AYUDA_DETALLE.ordenes} En este plan: ${numero(c.ordenesValores, 0)} de la estrategia${c.ordenesOcioso ? ` + ${numero(c.ordenesOcioso, 0)} del dinero ocioso` : ''}${c.ordenesOtras ? ` + ${numero(c.ordenesOtras, 0)} más` : ''} = ${numero(c.ordenes, 0)} órdenes y ${euros(s.costes, 2)} de comisiones.`}/>
      </div>
      <div data-detalle-suma data-cuadra={s.cuadra ? 'si' : 'no'} style={{ display: 'flex', gap: '4px 9px', alignItems: 'center', flexWrap: 'wrap', background: B.cabecera, border: `1px solid ${B.borde}`, borderRadius: B.radioBoton, padding: '9px 12px', marginTop: 8, fontVariantNumeric: 'tabular-nums' }}>
        {parte('aportado', B.texto, `${euros(s.aportado, 0)} que pusiste`)}
        {parte('valores', signo(s.valores) || B.texto, `${s.valores < 0 ? '−' : '+'} ${euros(Math.abs(s.valores), 0)} ${s.valores < 0 ? 'perdidos' : 'ganados'} en los valores`)}
        {!sinOcioso && parte('ocioso', signo(s.ocioso) || B.texto, `${s.ocioso < 0 ? '−' : '+'} ${euros(Math.abs(s.ocioso), 0)} ${s.ocioso < 0 ? 'perdidos' : 'ganados'} en el ocioso`)}
        {Math.abs(s.otros) >= 0.005 && parte('otros', signo(s.otros) || B.texto, `${s.otros < 0 ? '−' : '+'} ${euros(Math.abs(s.otros), 0)} en lo demás`)}
        {parte('costes', s.costes > 0 ? ROJO : B.texto, `− ${euros(s.costes, 0)} de comisiones`)}
        {parte('impuestos', s.impuestos > 0 ? ROJO : B.texto, `− ${euros(s.impuestos, 0)} de impuestos`)}
        <span style={{ color: B.texto }}>=</span>
        <b data-suma="final" style={{ color: B.titulo, fontSize: 17, whiteSpace: 'nowrap' }}>{euros(s.final, 0)}</b>
        <span data-suma-nota style={{ color: s.cuadra ? B.apagado : ROJO, fontSize: 12 }}>{s.cuadra ? '= «Tienes al final» de «Tu dinero» ✓' : '✕ no cuadra con «Tu dinero» (no debería pasar)'}</span>
        <Ayuda etiqueta="La suma del plan" texto={`${AYUDA_DETALLE.suma} En este plan, al céntimo: ${euros(s.aportado, 2)} ${s.valores < 0 ? '−' : '+'} ${euros(Math.abs(s.valores), 2)} ${sinOcioso ? '' : `${s.ocioso < 0 ? '−' : '+'} ${euros(Math.abs(s.ocioso), 2)} `}− ${euros(s.costes, 2)} − ${euros(s.impuestos, 2)} = ${euros(s.final, 2)}.`}/>
      </div>

      <Tarjeta id="detalle-valores" titulo="Qué aportó cada valor" ayuda={`${AYUDA_DETALLE.tabla} ${AYUDA_DETALLE.ocioso}`}>
        <div style={{ overflowX: 'auto' }}><table data-tabla="detalle-valores" style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead><tr><th style={cab}>Valor</th>{['Aportó', 'Operaciones', 'Ganadoras', 'Profit Factor', 'Tiempo dentro'].map(h => <th key={h} style={cabNum}>{h}</th>)}</tr></thead>
          <tbody>
            <tr data-fila-total style={{ fontWeight: 700, color: B.titulo }}>
              <td style={celda}><button type="button" data-pliega-valores aria-expanded={abierta} onClick={() => setAbierta(x => !x)} title={abierta ? 'Ocultar los valores' : 'Ver los valores'} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: B.titulo, fontFamily: B.letra, fontSize: 'inherit', fontWeight: 700 }}>{abierta ? '▾' : '▸'} {filas.length === 1 ? filas[0].simbolo : `Los ${numero(filas.length, 0)} valores`}</button></td>
              <td style={{ ...num, color: signo(total.aporto) }}>{conSigno(total.aporto)}</td><td style={num}>{numero(total.operaciones, 0)}</td><td style={num}>{pct(total.ganadoras, 1)}</td><td style={num}>{total.pf == null ? '—' : numero(total.pf, 2)}</td>
              <td style={{ ...num, fontWeight: 400, color: B.secundario }}>{pct(total.enValores, 0)} del dinero, de media</td>
            </tr>
            {abierta && filas.length > 1 && filas.map(f => <tr key={f.simbolo} data-valor={f.simbolo} aria-selected={f.simbolo === elegido} style={f.simbolo === elegido ? { background: B.cabecera } : undefined}>
              <td style={{ ...celda, paddingLeft: 24 }}>
                <button type="button" data-elige-valor={f.simbolo} onClick={() => elige(f.simbolo === elegido && modo === 'valores' ? null : f.simbolo)} title="Pulsa para verlo resaltado en «Valor a valor»" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: B.texto, fontFamily: B.letra, fontSize: 'inherit', fontWeight: f.simbolo === elegido ? 700 : 400 }}>{f.simbolo}</button>
                {onIrAValor && <button type="button" data-ir-valor={f.simbolo} onClick={() => onIrAValor(f.simbolo)} title={`Abrir ${f.simbolo} en la Watchlist`} style={{ background: 'none', border: 'none', padding: '0 0 0 6px', cursor: 'pointer', color: B.enlace, fontSize: 13 }}>↗</button>}
              </td>
              <td style={{ ...num, color: signo(f.aporto) }}>{conSigno(f.aporto)}</td><td style={num}>{numero(f.operaciones, 0)}</td><td style={num}>{pct(f.ganadoras, 1)}</td><td style={num}>{f.pf == null ? '—' : numero(f.pf, 2)}</td><td style={num}>{pct(f.dentro, 0)}</td>
            </tr>)}
            <tr data-fila-ocioso style={{ fontWeight: 700, color: B.titulo }}>
              <td style={celda}>Dinero ocioso · {nombreOc}</td>
              <td style={{ ...num, color: signo(ocioso.aporto) }}>{sinOcioso ? euros(0, 0) : conSigno(ocioso.aporto)}</td>
              <td style={{ ...num, fontWeight: 400, color: B.secundario }}>{sinOcioso ? 'sin órdenes' : `${numero(ocioso.ordenes, 0)} órdenes`}</td><td style={num}></td><td style={num}></td>
              <td style={{ ...num, fontWeight: 400, color: B.secundario }}>{pct(sinOcioso ? ocioso.liquidez : (ocioso.media || 0), 0)} del dinero, de media{!sinOcioso && ocioso.liquidez >= 0.005 ? ` (+ ${pct(ocioso.liquidez, 0)} en liquidez)` : ''}</td>
            </tr>
          </tbody>
        </table></div>
      </Tarjeta>

      <Tarjeta id="detalle-crece" titulo="Cómo crece" ayuda={modo === 'valores' ? AYUDA_DETALLE.valorAValor : AYUDA_DETALLE.bh}
        derecha={<span role="group" aria-label="Qué se dibuja" style={{ display: 'inline-flex', gap: 6 }}>
          <button type="button" data-modo-crece="plan" aria-pressed={modo === 'plan'} onClick={() => setModo('plan')} style={boton(modo === 'plan')}>El plan</button>
          <button type="button" data-modo-crece="valores" aria-pressed={modo === 'valores'} onClick={() => setModo('valores')} style={boton(modo === 'valores')}>Valor a valor</button></span>}>
        {modo === 'plan' ? <>
          {graficoPlan}
          {bh.length > 0 && <div style={{ overflowX: 'auto', marginTop: 10 }}><table data-tabla="detalle-bh" style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead><tr><th style={cab}>Los «comprar y mantener», con las reglas de tu plan</th>{['Tienes al final', 'CAGR', 'Peor caída'].map(h => <th key={h} style={cabNum}>{h}</th>)}</tr></thead>
            <tbody>{bh.map(x => <tr key={x.id} data-fila-bh={x.id} style={x.id === 'PLAN' ? { fontWeight: 700, color: B.titulo } : { color: B.secundario }}>
              <td style={celda}>{x.nombre}</td><td style={num}>{euros(x.final, 0)}</td><td style={{ ...num, color: signo(x.twr) }}>{pct(x.twr)}</td><td style={{ ...num, color: signo(x.caida) }}>{pct(x.caida)}</td></tr>)}</tbody>
          </table></div>}
        </> : <GraficoValores curvas={detalle.curvas} elegido={elegido} onElegir={setElegido} ocioso={ocioso.simbolo}/>}
      </Tarjeta>
      <div data-detalle-falta style={{ ...S.apagado, marginTop: 12 }}>Las ganancias mensuales, el historial de operaciones y los gráficos de cada valor llegarán a esta pestaña; mientras, siguen en «La cartera por dentro».</div>
    </div>
  )
}
