// components/ComparaPlanes.js — la pantalla «COMPARAR PLANES» del paso 3 (docs/builder.md §128; boceto bocetos/comparar-planes.html,
// opción A). Solo pinta: los cálculos, en lib/builder/comparaPlanes.js; los resultados de cada plan (la misma respuesta de /api/plan
// que su pestaña) llegan de components/BuilderPlan.js, que es quien los pide.
// Con los dos tonos del screener (lib/screener/colores.js, botón «☀ Claro / ☾ Oscuro» de la barra de arriba): variables CSS en el div.
//   planes: los guardados ([{ id, nombre, plan }]); elegidos: sus ids (hasta 4); refs: los ids de QQQ/SPY marcados.
//   resultados: { id: { estado: 'calculando' | 'error' | 'motivo' | 'ok', texto?, respuesta?, plan? } }; prueba(id): la línea de la
//   prueba del paso 2 de su estrategia ({ texto, clave } o null). log / modo (null = el de por defecto) del gráfico.
import { useMemo, useState, useEffect, useRef } from 'react'
import { B, S, varsTema, CSS_TABLA } from '../lib/screener/colores'
import Ayuda from './BuilderAyuda'
import { marcasLog, separaEtiquetas } from '../lib/builder/escalaGrafico'
import { AYUDA_COMPARAR, FILAS_COMPARAR, MAX_COMPARAR, MOTIVO_NO_COMPARABLE, NOTA_EUROS_FUERA, REFS_COMPARAR, TEXTO_SIN_PLANES, avisosComparar, cifrasComparacion, comparable, diferencias,
  lineasGrafico, mejores, modoGrafico, notaCrecimiento, puntosFrente, tablaAnios, textoBloque, textoDinero, textoPeriodo } from '../lib/builder/comparaPlanes'
import { euros, pct } from '../lib/builder/planPantalla'

// El ancho real del gráfico (como useAncho de components/BuilderPlan.js, copiado aquí para que los dos archivos no se importen el uno al otro).
function useAncho(defecto) {
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

// Los colores de las líneas de cada plan y de QQQ/SPY, en los dos tonos (los del boceto).
const COLORES = {
  oscuro: { p: ['#57aefb', '#b48cff', '#34c759', '#e3a13b'], QQQ: '#9a9eab', SPY: '#d8dae1', aviso: '#4a4126' },
  claro: { p: ['#2f5f96', '#6a3fb5', '#2f6f35', '#b86e00'], QQQ: '#77716a', SPY: '#4a463f', aviso: '#e6d6a3' },
}
const v = (k) => `var(--sc-${k})`
const celda = { padding: '5px 12px', borderBottom: `1px solid ${v('rayado')}`, fontSize: 13 }
const btn = (on) => ({ ...S.boton, padding: '5px 11px', fontSize: 13, border: `1px solid ${on ? v('selBorde') : B.borde}`, ...(on ? { background: v('sel'), color: v('titulo'), fontWeight: 700 } : {}) })
const colorCifra = (k, x) => !Number.isFinite(x) ? undefined : k === 'caida' ? v('rojo') : ['aportado', 'impuestos', 'costes'].includes(k) ? undefined : x >= 0 ? v('verde') : v('rojo')
const valorCifra = (k, x) => ['twr', 'tir', 'caida', 't1', 't2'].includes(k) ? pct(x) : euros(x, 0)

function Ficha({ on, color, texto, onClick, titulo, data }) {
  return <button type="button" aria-pressed={on} title={titulo} onClick={onClick} {...data} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 999, cursor: 'pointer', fontFamily: B.letra, fontSize: 13,
    border: `1px solid ${on ? v('selBorde') : B.borde}`, background: on ? v('sel') : 'transparent', color: on ? B.titulo : B.secundario }}>
    <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: '50%', background: color, display: 'inline-block', opacity: on ? 1 : 0.5 }}/>{on ? '☑' : '☐'} {texto}</button>
}

function Grafico({ lineas, log }) {
  const [ref, W] = useAncho(900)
  const IZQ = 76, DER = 120, H = 330, ARR = 14, ABA = 26
  const t = (f) => Date.parse(f)
  const todos = lineas.flatMap(l => l.v.filter(x => Number.isFinite(x) && x > 0))
  const fechas = lineas.flatMap(l => [l.fechas[0], l.fechas[l.fechas.length - 1]]).filter(Boolean)
  if (!todos.length || !fechas.length) return null
  const t0 = Math.min(...fechas.map(t)), t1 = Math.max(...fechas.map(t)), lo = Math.min(...todos), hi = Math.max(...todos)
  const f = log ? Math.log : (x) => x, lo2 = log ? lo : 0
  const x = (fe) => IZQ + (t(fe) - t0) / ((t1 - t0) || 1) * (W - IZQ - DER)
  const y = (val) => ARR + (1 - (f(Math.max(val, log ? lo : -Infinity)) - f(lo2)) / ((f(hi) - f(lo2)) || 1)) * (H - ARR - ABA)
  const marcas = log ? marcasLog(lo, hi) : [0, 1, 2, 3, 4].map(k => lo2 + (hi - lo2) * k / 4)
  const anios = []; for (let a = new Date(t0).getUTCFullYear() + 1; a <= new Date(t1).getUTCFullYear(); a++) anios.push(a)
  const paso = Math.max(1, Math.ceil(anios.length / Math.max(1, Math.floor((W - IZQ - DER) / 44))))
  const etq = separaEtiquetas(lineas.map(l => ({ t: euros(l.v[l.v.length - 1], 0), color: l.color, y: y(l.v[l.v.length - 1]), id: l.id })), ARR, H - ABA)
  const ruta = (l) => l.v.map((val, i) => Number.isFinite(val) ? `${x(l.fechas[i]).toFixed(1)},${y(val).toFixed(1)}` : null).filter(Boolean).join(' ')
  return (
    <div ref={ref} style={{ width: '100%' }}>
      <svg data-grafico="comparar" width={W} height={H} role="img" aria-label={`Plan a plan, ${log ? 'escala logarítmica' : 'escala normal'}: ${lineas.map(l => `${l.nombre} termina en ${euros(l.v[l.v.length - 1], 0)}`).join('; ')}.`} style={{ display: 'block', fontFamily: B.letra }}>
        {marcas.map((m, k) => <g key={k}><line x1={IZQ} x2={W - DER} y1={y(m)} y2={y(m)} stroke={v('rejilla')}/><text x={IZQ - 6} y={y(m) + 4} textAnchor="end" fontSize={12} fill={B.apagado}>{euros(m, 0)}</text></g>)}
        {anios.filter((_, k) => k % paso === 0).map(a => <text key={a} x={x(`${a}-01-01`)} y={H - 6} fontSize={12} fill={B.apagado} textAnchor="middle">{a}</text>)}
        {[...lineas].reverse().map(l => <polyline key={l.id} data-linea={l.id} points={ruta(l)} fill="none" stroke={l.color} strokeWidth={l.ref ? 1.3 : 1.8} strokeDasharray={l.ref ? '5 3' : undefined} strokeLinejoin="round"/>)}
        {etq.map(e => <text key={e.id} data-etiqueta={e.id} x={W - DER + 8} y={e.y + 4} fontSize={12} fontWeight={600} fill={e.color}>{e.t}</text>)}
      </svg>
    </div>
  )
}

export default function ComparaPlanes({ planes = [], elegidos = [], refs = [], resultados = {}, prueba = () => null, log = true, modo = null, tema = 'oscuro',
  onElegir, onRef, onLog, onModo, onAbrir, onDuplicar, onVolver }) {
  const col = COLORES[tema === 'claro' ? 'claro' : 'oscuro']
  const elegidas = useMemo(() => elegidos.map(id => planes.find(p => Number(p.id) === Number(id))).filter(Boolean), [planes, elegidos])
  const colorDe = (id) => col.p[Math.max(0, planes.findIndex(p => Number(p.id) === Number(id))) % col.p.length]
  const dif = useMemo(() => diferencias(elegidas), [elegidas])
  const calculados = useMemo(() => elegidas.map(p => {
    const r = resultados[p.id]
    if (r?.estado !== 'ok') return null
    try { return { id: p.id, nombre: p.nombre, color: colorDe(p.id), c: cifrasComparacion(r.respuesta, r.plan) } } catch (_) { return null }
  }).filter(Boolean), [elegidas, resultados, tema])
  const porId = Object.fromEntries(calculados.map(x => [x.id, x]))
  const mej = mejores(calculados.map(x => x.c.valores), dif)
  const refsVis = REFS_COMPARAR.filter(r => refs.includes(r.id)).map(r => ({ ...r, color: col[r.id] }))
  const m = modoGrafico(modo, dif)
  const { lineas, refsFuera } = lineasGrafico(calculados, { modo: m, dif, refs: refsVis })
  const tabla = tablaAnios(calculados, refsVis)
  const avisos = avisosComparar(dif)

  const tarjeta = (p) => {
    const r = resultados[p.id], cc = porId[p.id], pr = prueba(p.id), distinto = !dif.dinero || !dif.periodo
    return (
      <div key={p.id} data-tarjeta-plan={p.id} style={{ ...S.tarjeta, borderTop: `3px solid ${colorDe(p.id)}`, display: 'flex', flexDirection: 'column' }}>
        <div style={{ background: v('cabecera'), padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, color: B.titulo, fontSize: 14, overflowWrap: 'anywhere' }}>{p.nombre}</div>
            <div style={{ color: B.secundario, fontSize: 12 }}>{textoBloque(p.plan)}</div>
            <div data-condiciones style={{ fontSize: 12, marginTop: 2, color: distinto ? v('amarillo') : B.texto, fontWeight: distinto ? 600 : 400 }}>{textoPeriodo(p.plan)} · {textoDinero(p.plan)}</div>
          </div>
          <div style={{ display: 'flex', gap: 4, flex: 'none' }}>
            <button type="button" data-abrir-plan={p.id} title="Abrir este plan en su pestaña" onClick={() => onAbrir?.(p.id)} style={{ ...btn(false), padding: '3px 8px', fontSize: 12 }}>Abrir</button>
            <button type="button" data-duplicar-plan={p.id} title="Duplicar este plan" aria-label="Duplicar este plan" onClick={() => onDuplicar?.(p.id)} style={{ ...btn(false), padding: '3px 8px', fontSize: 12 }}>⧉</button>
          </div>
        </div>
        {!cc ? <div data-estado-plan={r?.estado || 'calculando'} style={{ padding: 12, fontSize: 13, color: r?.estado === 'error' ? v('rojo') : r?.estado === 'motivo' ? B.texto : B.secundario }}>
          {r?.estado === 'error' ? `✕ No se pudo calcular: ${r.texto}` : r?.estado === 'motivo' ? r.texto : 'Calculando…'}</div>
        : <table style={{ width: '100%', borderCollapse: 'collapse' }}><tbody>
          {FILAS_COMPARAR.map(f => {
            const x = cc.c.valores[f.k], comp = comparable(f, dif), hay = Number.isFinite(x), esMej = comp && hay && mej[f.k] != null && x === mej[f.k]
            return <tr key={f.k} data-fila={f.k}><td style={{ ...celda, color: B.texto }}>{f.t}</td>
              <td data-valor={f.k} data-comparable={comp ? 'si' : 'no'} data-mejor={esMej ? 'si' : undefined} title={!comp && hay ? MOTIVO_NO_COMPARABLE[f.tipo] : undefined}
                style={{ ...celda, textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', color: !comp && hay ? B.apagado : colorCifra(f.k, x) || B.texto, fontWeight: esMej ? 700 : 400 }}>
                {!comp && hay && <span style={{ color: v('amarillo') }}>⚠ </span>}{hay ? valorCifra(f.k, x) : '—'}{esMej && <span style={{ color: v('amarillo') }}> ★</span>}</td></tr>
          })}
          {refsVis.length > 0 && <tr><td colSpan={2} style={{ ...celda, color: B.secundario, fontSize: 12, borderTop: `1px solid ${B.borde}` }}>Sin estrategia, con tu mismo dinero y periodo (CAGR; entre paréntesis, lo que les sacas en puntos)</td></tr>}
          {refsVis.map(rf => { const b = cc.c.refs[rf.id]; if (!b) return null; const gana = cc.c.valores.twr >= b.twr
            return <tr key={rf.id} data-ref-fila={rf.id} title={`${rf.nombre} con el dinero y el periodo de este plan: ${euros(b.final, 0)} al final`}><td style={{ ...celda, color: B.texto }}>{rf.nombre}</td>
              <td style={{ ...celda, textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', color: B.texto }}>{pct(b.twr)} <span data-puntos={rf.id} style={{ fontSize: 12, color: gana ? v('verde') : v('rojo') }}>({puntosFrente(cc.c.valores.twr, b.twr)})</span></td></tr> })}
        </tbody></table>}
        <div style={{ flex: 1 }}/>
        {pr && <div data-prueba-plan={pr.clave} style={{ padding: '6px 12px', fontSize: 12, color: pr.clave === 'pasa' ? v('verde') : pr.clave === 'noPasa' ? v('rojo') : B.apagado }}>{pr.texto}</div>}
      </div>
    )
  }

  return (
    <div data-comparar data-tema={tema} style={{ ...varsTema(tema), colorScheme: tema === 'claro' ? 'light' : 'dark', background: B.fondo, color: B.texto, fontFamily: B.letra, fontSize: B.base, borderRadius: B.radioTarjeta, padding: 14, border: `1px solid ${B.borde}` }}>
      <style>{`${CSS_TABLA} [data-comparar] [data-tabla] tbody tr:hover td{background:var(--sc-hover)} [data-comparar] [data-tarjeta-plan] tbody tr:hover td{background:var(--sc-hover)}`}</style>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        <span style={{ fontSize: 18, fontWeight: 700, color: B.titulo, display: 'inline-flex', alignItems: 'center', gap: 2 }}>Comparar planes<Ayuda texto={AYUDA_COMPARAR.pantalla} etiqueta="Comparar planes"/></span>
        <span style={{ flex: 1 }}/>
        <button type="button" data-boton="volver-plan" onClick={onVolver} style={btn(false)}>← Volver al plan</button>
      </div>
      {planes.length < 2 ? <div data-sin-planes style={{ color: B.secundario }}>{TEXTO_SIN_PLANES}</div> : <>
        <div data-elegir style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ color: B.secundario, fontSize: 13 }}>Planes (hasta {MAX_COMPARAR}):</span>
          {planes.map(p => { const on = elegidos.map(Number).includes(Number(p.id)), lleno = !on && elegidos.length >= MAX_COMPARAR
            return <Ficha key={p.id} on={on} color={colorDe(p.id)} texto={p.nombre} data={{ 'data-elige-plan': p.id }} titulo={lleno ? `Como mucho ${MAX_COMPARAR}: quita uno antes` : on && elegidos.length === 1 ? 'Al menos uno' : undefined} onClick={() => onElegir?.(Number(p.id))}/> })}
          <span aria-hidden="true" style={{ width: 1, height: 20, background: B.borde, margin: '0 4px' }}/>
          <span style={{ color: B.secundario, fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 2 }}>Sin estrategia:<Ayuda texto={AYUDA_COMPARAR.refs} etiqueta="Sin estrategia"/></span>
          {REFS_COMPARAR.map(r => <Ficha key={r.id} on={refs.includes(r.id)} color={col[r.id]} texto={r.nombre} data={{ 'data-elige-ref': r.id }} onClick={() => onRef?.(r.id)}/>)}
        </div>
        {avisos.length > 0 && <div data-avisos-comparar style={{ background: col.aviso, borderLeft: `3px solid ${v('amarillo')}`, borderRadius: 6, padding: '8px 12px', marginBottom: 12, fontSize: 13, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {avisos.map(a => <div key={a.id} data-aviso-comparar={a.id}>⚠ <b style={{ color: B.titulo }}>{a.titulo}</b> ({a.detalle}). {a.que}</div>)}
        </div>}
        <div data-tarjetas style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10, marginBottom: 12 }}>{elegidas.map(tarjeta)}</div>
        <div data-tarjeta="grafico-comparar" style={{ ...S.tarjeta, marginBottom: 12 }}>
          <div style={{ background: v('cabecera'), padding: '8px 14px', fontWeight: 700, color: B.titulo, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>Plan a plan<Ayuda texto={AYUDA_COMPARAR.grafico} etiqueta="Plan a plan"/></span>
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 4, fontWeight: 400, flexWrap: 'wrap' }}>
              <button type="button" data-modo="crec" aria-pressed={m === 'crec'} onClick={() => onModo?.('crec')} style={btn(m === 'crec')}>Crecimiento de 100 €</button>
              <button type="button" data-modo="eur" aria-pressed={m === 'eur'} onClick={() => onModo?.('eur')} style={btn(m === 'eur')}>Tu dinero en €</button>
              <span aria-hidden="true" style={{ width: 1, background: B.borde, margin: '0 4px' }}/>
              <button type="button" data-escala="log" aria-pressed={log} onClick={() => onLog?.(true)} style={btn(log)}>Log</button>
              <button type="button" data-escala="normal" aria-pressed={!log} onClick={() => onLog?.(false)} style={btn(!log)}>Normal</button>
            </span>
          </div>
          <div data-nota-grafico style={{ fontSize: 12, color: m === 'eur' && refsFuera ? v('amarillo') : B.secundario, padding: '6px 14px 0' }}>{m === 'crec' ? notaCrecimiento(calculados, dif) : refsFuera || (!dif.dinero || !dif.periodo) ? NOTA_EUROS_FUERA : 'Todos meten el mismo dinero en el mismo periodo: las líneas se comparan.'}</div>
          <div style={{ padding: '6px 10px' }}>{lineas.length ? <Grafico lineas={lineas} log={log}/> : <div style={{ color: B.secundario, padding: 8 }}>Calculando…</div>}</div>
        </div>
        <div data-tarjeta="anios-comparar" style={S.tarjeta}>
          <div style={{ background: v('cabecera'), padding: '8px 14px', fontWeight: 700, color: B.titulo, display: 'flex', alignItems: 'center', gap: 2 }}>Año a año · rentabilidad del año<Ayuda texto={AYUDA_COMPARAR.anios} etiqueta="Año a año"/></div>
          <div style={{ overflowX: 'auto' }}><table data-tabla="anios-comparar" style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
            <thead><tr><th style={{ ...celda, textAlign: 'left', color: B.secundario, background: v('cabecera'), fontSize: 12 }}>Año</th>{tabla.cols.map(c => <th key={c.id} style={{ ...celda, textAlign: 'right', background: v('cabecera'), fontSize: 12, color: c.color, opacity: c.ref ? 0.8 : 1 }}>{c.nombre}</th>)}</tr></thead>
            <tbody>{tabla.filas.map(f => { const xs = f.valores.filter((x, i) => !tabla.cols[i].ref && Number.isFinite(x)), mx = xs.length > 1 ? Math.max(...xs) : null
              return <tr key={f.anio} data-anio={f.anio}><td style={celda}>{f.anio}</td>{f.valores.map((x, i) => <td key={tabla.cols[i].id} style={{ ...celda, textAlign: 'right', fontVariantNumeric: 'tabular-nums', opacity: tabla.cols[i].ref ? 0.8 : 1,
                color: Number.isFinite(x) ? (x >= 0 ? v('verde') : v('rojo')) : B.apagado, fontWeight: !tabla.cols[i].ref && x != null && x === mx ? 700 : 400 }}>{Number.isFinite(x) ? pct(x, 1) : '—'}</td>)}</tr> })}</tbody>
          </table></div>
        </div>
      </>}
    </div>
  )
}
