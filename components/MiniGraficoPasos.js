// components/MiniGraficoPasos.js — el minigráfico de la «Condición con pasos» en la ventana de la señal del Replay (docs/builder.md §245).
// Dos modos (decidido por Sergi el 24/11): «Velas inventadas» (🎲 busca unas donde el escenario ocurra) y «Velas reales» (las del valor
// del Replay con toda su historia, o «🎲 Valor al azar» de tu Watchlist). En los dos, el escenario completo: tramo sombreado, ● paso 1
// armado, ▲ señal, ✕ anulado y, en los «cae / sube un %», la línea del precio de referencia con su %. Las cuentas, en
// lib/replay/conPasosGrafico.js (puro); las medias de la condición, con graficoSenal (lib/replay/senales.js).
import { useState, useEffect, useMemo } from 'react'
import Ayuda from './BuilderAyuda'
import { buscaInventadas, escenario, otrosSimbolos, ventanaDe, dibujoEscenario, senalValida, comoSenal, AYUDA_MINI } from '../lib/replay/conPasosGrafico'
import { graficoSenal } from '../lib/replay/senales'

const K = { caja: '#353945', borde: '#4c5263', texto: '#f3f3f5', gris: '#a9adb8', azul: '#58a6ff', lila: '#bc8cff', rojo: '#f85149', verde: '#3fb950', ambar: '#d29922' }
const boton = (on = false, activo = true) => ({ background: on ? 'rgba(88,166,255,0.18)' : K.caja, color: K.texto, border: `1px solid ${on ? K.azul : K.borde}`, borderRadius: 5,
  padding: '2px 8px', font: 'inherit', cursor: activo ? 'pointer' : 'default', opacity: activo ? 1 : 0.4, width: 'auto' })
const W = 680, H = 230, M = { l: 6, r: 56, t: 10, b: 20 }
const fmt = (x) => Number.isFinite(x) ? x.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'
const fmtF = (f) => (f ? `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}` : '')

const VACIO = Object.freeze([])   // la misma lista vacía en cada repintado (si no, el escenario se recalcularía siempre y ▶ volvería a la señal 1)
// §247: senal = { tipo: 'condicion', filas } («Una condición»: solo ▲) o { tipo: 'pasos', def }; def sola = con pasos (como en §245).
export default function MiniGraficoPasos({ def, senal: senalProp = null, simbolo, velas = VACIO, cargaVelas = null, simbolosAzar = VACIO, compras = VACIO, hoy = null }) {
  const sim = String(simbolo || '').toUpperCase()
  const [modo, setModo] = useState('inventadas')
  const [semilla, setSemilla] = useState(1)
  const [otro, setOtro] = useState(null)          // «🎲 Valor al azar» en velas reales (null = el del Replay)
  const [extra, setExtra] = useState({})          // velas de otros símbolos ya cargadas
  const [k, setK] = useState(0)                   // la señal que se ve
  const firma = JSON.stringify(senalProp || { tipo: 'pasos', def })
  const senal = useMemo(() => comoSenal(JSON.parse(firma)), [firma])   // la misma mientras no cambie (si no, ▶ volvería a la señal 1)
  const valida = senalValida(senal)
  const cerradas = useMemo(() => (velas || []).filter(v => v && v.date && !v.enCurso), [velas])
  const principal = otro ? extra[otro] : cerradas
  const faltan = useMemo(() => modo !== 'reales' || !valida ? [] : [...otrosSimbolos(senal, sim), ...(otro ? [otro] : [])].filter(q => !extra[q]), [modo, valida, senal, sim, otro, extra])
  useEffect(() => {
    if (!faltan.length || !cargaVelas) return
    let vivo = true
    Promise.all(faltan.map(q => Promise.resolve(cargaVelas(q)).then(v => [q, (v || []).filter(x => !x.enCurso)]).catch(() => [q, []])))
      .then(ls => { if (vivo) setExtra(x => ({ ...x, ...Object.fromEntries(ls) })) })
    return () => { vivo = false }
  }, [faltan.join(','), cargaVelas])   // eslint-disable-line
  const e = useMemo(() => {
    if (!valida) return null
    if (modo === 'inventadas') return buscaInventadas(senal, sim, semilla) || { sinNada: true }
    if (faltan.length) return { cargando: true }
    if (!principal?.length) return { sinVelas: true }
    return escenario(senal, (q) => (q === sim || q === 'valor' ? principal : extra[q] || []), sim, otro ? VACIO : compras)
  }, [valida, modo, senal, sim, semilla, faltan.length, principal, extra, otro, compras])   // eslint-disable-line
  const n = e?.velas?.length || 0, senales = e?.r?.senales || []
  useEffect(() => { setK(0) }, [e])
  const idxDe = useMemo(() => new Map((e?.fechas || []).map((f, i) => [f, i])), [e])
  const iSenal = senales.length ? idxDe.get(senales[Math.min(k, senales.length - 1)]) : null
  const [a, b] = n ? ventanaDe(n, iSenal) : [0, 0]
  const dib = useMemo(() => (n ? dibujoEscenario(e, a, b) : null), [e, a, b])   // eslint-disable-line
  const medias = useMemo(() => (n ? graficoSenal(senal, e.velas, sim)?.series || [] : []), [e])   // eslint-disable-line

  const cabecera = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
      <b>Así se vería</b>
      <button type="button" data-mini-modo="inventadas" style={boton(modo === 'inventadas')} onClick={() => setModo('inventadas')}>Velas inventadas</button>
      <button type="button" data-mini-modo="reales" style={boton(modo === 'reales')} onClick={() => setModo('reales')}>Velas reales</button>
      {modo === 'inventadas' && <button type="button" data-mini-otras="" style={boton()} title="Otras velas inventadas donde el escenario también ocurra"
        onClick={() => setSemilla((e?.semilla || semilla) + 1)}>🎲 Otras velas</button>}
      {modo === 'reales' && <>
        <button type="button" data-mini-azar="" style={boton(false, simbolosAzar.length > 0)} disabled={!simbolosAzar.length} title="Mirar el escenario en otro valor de tu Watchlist"
          onClick={() => { const l = simbolosAzar.filter(x => x && x !== sim && x !== otro); if (l.length) setOtro(l[Math.floor(Math.random() * l.length)]) }}>🎲 Valor al azar</button>
        {otro && <button type="button" data-mini-volver="" style={boton()} onClick={() => setOtro(null)}>Volver a {sim}</button>}
      </>}
      <Ayuda texto={AYUDA_MINI} etiqueta="Así se vería" zIndice={10100}/>
    </div>)
  let cuerpo
  if (!valida) cuerpo = <div style={{ color: K.gris }}>{senal.tipo === 'condicion' ? 'Añade una condición y aquí verás dónde salta.' : 'Arregla lo que sale en rojo y aquí verás el escenario.'}</div>
  else if (e?.cargando) cuerpo = <div style={{ color: K.gris }}>Cargando velas…</div>
  else if (e?.sinVelas) cuerpo = <div style={{ color: K.ambar }}>No hay velas de {otro || sim}.</div>
  else if (e?.sinNada) cuerpo = <div data-mini-sin-nada="" style={{ color: K.ambar }}>En {40} juegos de velas inventadas no salta ninguna vez{senal.tipo === 'pasos' ? ' (¿usas «tu última compra»? En velas inventadas no hay compras)' : ''}. Prueba con «Velas reales».</div>
  else {
    const ys = []
    for (let i = a; i <= b; i++) ys.push(e.velas[i].high, e.velas[i].low)
    for (const l of dib.lineas) ys.push(l.p0, l.p1)
    const lo = Math.min(...ys.filter(x => x > 0)), hi = Math.max(...ys)
    const X = (i) => M.l + (W - M.l - M.r) * (b === a ? 0.5 : (i - a) / (b - a))
    const Y = (p) => M.t + (H - M.t - M.b) * (1 - (Math.log(p) - Math.log(lo)) / Math.max(1e-9, Math.log(hi) - Math.log(lo)))
    const cw = Math.max(1, (W - M.l - M.r) / (b - a + 1) * 0.6)
    const iHoy = hoy && modo === 'reales' && !otro ? idxDe.get(hoy) : null
    const anios = []
    for (let i = a + 1; i <= b; i++) if (e.fechas[i].slice(0, 4) !== e.fechas[i - 1].slice(0, 4)) anios.push(i)
    cuerpo = (<>
      <svg data-mini-grafico="" viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block', background: 'rgba(0,0,0,0.15)', borderRadius: 5 }} fontSize="10" fill={K.gris}>
        {dib.tramos.map(([x, y], j) => <rect key={'t' + j} data-mini-tramo="" x={X(x) - cw / 2} y={M.t} width={Math.max(1, X(y) - X(x) + cw)} height={H - M.t - M.b} fill={K.azul} opacity="0.1"/>)}
        {[0, 1, 2, 3].map(j => { const p = Math.exp(Math.log(lo) + (Math.log(hi) - Math.log(lo)) * j / 3); return <g key={'g' + j}><line x1={M.l} x2={W - M.r} y1={Y(p)} y2={Y(p)} stroke={K.borde} strokeWidth="0.5"/><text x={W - M.r + 4} y={Y(p) + 3}>{fmt(p)}</text></g> })}
        {anios.map(i => <text key={'a' + i} x={X(i)} y={H - 5} textAnchor="middle">{e.fechas[i].slice(0, 4)}</text>)}
        {iHoy != null && iHoy >= a && iHoy <= b && <g data-mini-hoy=""><line x1={X(iHoy)} x2={X(iHoy)} y1={M.t} y2={H - M.b} stroke={K.ambar} strokeDasharray="3 3"/><text x={X(iHoy) + 3} y={M.t + 9} fill={K.ambar}>hoy en el Replay</text></g>}
        {Array.from({ length: b - a + 1 }, (_, j) => { const i = a + j, v = e.velas[i], sube = v.close >= v.open
          return <g key={'v' + i}><line x1={X(i)} x2={X(i)} y1={Y(v.high)} y2={Y(v.low)} stroke={sube ? K.verde : K.rojo} strokeWidth="0.7"/>
            <rect x={X(i) - cw / 2} y={Y(Math.max(v.open, v.close))} width={cw} height={Math.max(0.6, Math.abs(Y(v.open) - Y(v.close)))} fill={sube ? K.verde : K.rojo}/></g> })}
        {medias.map((s, j) => <polyline key={'m' + j} fill="none" stroke={s.color} strokeWidth="1"
          points={Array.from({ length: b - a + 1 }, (_, q) => a + q).filter(i => s.valores[i] > 0).map(i => `${X(i).toFixed(1)},${Y(s.valores[i]).toFixed(1)}`).join(' ')}/>)}
        {dib.lineas.map((l, j) => { const elegida = l.i1 === iSenal, x0 = X(l.i0), x1 = X(l.i1), y0 = Y(l.p0), y1 = Y(l.p1)
          // §246: punto en la referencia, línea discontinua hasta la vela de la señal, raya y punto en el precio EXACTO; texto solo en la elegida.
          return <g key={'l' + j} data-mini-linea={l.texto} data-mini-elegida={elegida ? '' : undefined} opacity={elegida ? 1 : 0.3}>
            {!l.fuera && <circle cx={x0} cy={y0} r="2.5" fill={K.lila}/>}
            <line x1={x0} y1={y0} x2={x1} y2={y0} stroke={K.lila} strokeDasharray="4 3" strokeWidth="1"/>
            <line x1={x1} y1={y0} x2={x1} y2={y1} stroke={K.lila} strokeDasharray="2 2" strokeWidth="1"/>
            <line x1={x1 - 9} y1={y1} x2={x1 + 9} y2={y1} stroke={K.lila} strokeWidth="1.5"/>
            <circle cx={x1} cy={y1} r="2.5" fill={K.texto} stroke={K.lila}/>
            {elegida && <text data-mini-nivel="" x={x1 + 12} y={y1 + 3} fill={K.lila} fontWeight="bold">{l.precio} · {l.texto}</text>}</g> })}
        {dib.marcas.map((m, j) => { const v = e.velas[m.i], x = X(m.i)
          if (m.tipo === 'senal') { const y = Y(v.low) + 4; return <path key={'s' + j} data-mini-marca="senal" d={`M${x} ${y} l-5 9 h10 z`} fill={K.lila} opacity={m.i === iSenal ? 1 : 0.45}><title>{m.texto}</title></path> }
          if (m.tipo === 'armado') return <circle key={'r' + j} data-mini-marca="armado" cx={x} cy={Y(v.high) - 6} r="3.5" fill={K.azul}><title>{m.texto}</title></circle>
          return <text key={'x' + j} data-mini-marca="anulado" x={x} y={Y(v.high) - 3} textAnchor="middle" fill={K.rojo} fontSize="12" fontWeight="bold">✕<title>{m.texto}</title></text> })}
      </svg>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, color: K.gris, flexWrap: 'wrap' }}>
        <span data-mini-n={senales.length}>{senales.length} {senales.length === 1 ? 'señal' : 'señales'} en {modo === 'inventadas' ? 'estas velas inventadas' : `toda la historia de ${otro || sim}${otro ? ` (en lugar de ${sim})` : ''}`}</span>
        {senales.length > 0 && <>
          <button type="button" data-mini-anterior="" style={boton(false, k > 0)} disabled={k <= 0} onClick={() => setK(x => Math.max(0, x - 1))}>◀</button>
          <span data-mini-k="">señal {Math.min(k, senales.length - 1) + 1} de {senales.length} · {fmtF(senales[Math.min(k, senales.length - 1)])}</span>
          <button type="button" data-mini-siguiente="" style={boton(false, k < senales.length - 1)} disabled={k >= senales.length - 1} onClick={() => setK(x => Math.min(senales.length - 1, x + 1))}>▶</button>
        </>}
        {modo === 'reales' && !otro && <span style={{ color: K.ambar }}>aquí ves también lo de después de hoy</span>}
        {medias.length > 0 && <span>{medias.map(s => <span key={s.clave} style={{ color: s.color, marginLeft: 6 }}>{s.nombre}</span>)}</span>}
      </div>
    </>)
  }
  return <div data-mini-pasos={modo} style={{ marginTop: 10, borderTop: `1px solid ${K.borde}`, paddingTop: 8 }}>{cabecera}{cuerpo}</div>
}
