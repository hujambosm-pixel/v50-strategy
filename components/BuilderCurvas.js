// components/BuilderCurvas.js — en «Resultados» del paso 2, debajo de la tabla (V9.1051; docs/builder.md, §17): una pestaña por
// periodo y, en cada una, dos tarjetas. Las CIFRAS son las guardadas (las mismas de la tabla: lib/builder/pruebaGuiada.js
// filasResultado); las curvas y las copias solo se dibujan (lib/builder/curvasPrueba.js). Una prueba antigua, sin curvas guardadas,
// lo dice y enseña sus cifras y la barra.
//   1 · «Cómo creció el dinero, frente al azar» (laboratorio de cartera): la estrategia, 40 copias al azar de peor a mejor y el QQQ;
//       debajo, la caída desde el máximo; las cifras frente al QQQ; y la barra 0–100 con el 95 y la estrategia.
//   2 · «Dónde queda tu estrategia entre las 1.000 copias» (laboratorio de operaciones): el histograma de la ganancia media por
//       operación de las copias, la línea de lo que hay que superar y la marca de la estrategia en su valor.
import { useState, useRef, useEffect } from 'react'
import { B, S } from '../lib/builder/estilo'
import { nombrePeriodo, claveCurvas } from '../lib/builder/pruebaGuiada'
import { comunNormal, nombreVariante } from '../lib/editor/lotes'
import { caidas, histograma, deCada, PUNTOS, decodificaMedias } from '../lib/builder/curvasPrueba'

const AZUL = '#58a6ff', ROJO = '#ff8b8b', AMARILLO = '#f2cc60', GRIS = '#5b6675', CLARO = '#c9d4df'
const pct = (x) => x == null || !Number.isFinite(x) ? '—' : `${(Math.round(x * 10) / 10).toFixed(1).replace('.', ',')} %`   // la misma de la tabla
const num1 = (x) => x == null || !Number.isFinite(x) ? '—' : (Math.round(x * 10) / 10).toFixed(1).replace('.', ',')
const euros = (x) => `${Math.round(x).toLocaleString('de-DE')} €`
const pctOp = (x) => x == null || !Number.isFinite(x) ? '—' : `${(x * 100).toFixed(2).replace('.', ',')} %`
export const ANTIGUA_CURVA = 'Esta prueba es antigua: la curva no se guardó.'
export const ANTIGUA_COPIAS = 'Esta prueba es antigua: las copias al azar no se guardaron.'
export const COMO_LEER_CURVA = 'Si tu línea azul va dentro del abanico gris, el azar consigue lo mismo con las mismas operaciones. Para que cuente como ventaja, tiene que terminar por encima de 95 de cada 100 copias. El QQQ es solo referencia: no cambia el veredicto.'
export const COMO_LEER_HISTO = 'Cada barra gris es cuántas copias al azar ganaron esa media por operación. Si la línea azul queda a la derecha de la amarilla, en este periodo elige mejor que el azar cuándo estar dentro.'

function Caja({ titulo, subtitulo, children, datos }) {
  return (
    <div {...datos} style={{ border: `1px solid ${B.borde}`, borderRadius: B.radioTarjeta, padding: 14, marginTop: 12, background: B.fondo }}>
      <div style={{ fontWeight: 700, color: B.titulo, fontSize: 16 }}>{titulo}</div>
      <div data-subtitulo style={{ ...S.secundario, fontSize: 13, marginTop: 2 }}>{subtitulo}</div>
      {children}
    </div>
  )
}

// La barra de 0 a 100 con la marca del 95 y la de la estrategia.
export function Barra({ percentil, total }) {
  const x = Math.max(0, Math.min(100, percentil ?? 0))
  return (
    <div data-barra style={{ marginTop: 14 }}>
      <div style={{ fontSize: 13, color: B.texto, marginBottom: 6 }}>Al final, de peor a mejor de las {total} copias</div>
      <div style={{ position: 'relative', height: 14, background: B.borde, borderRadius: 7, margin: '0 4px' }}>
        <div style={{ position: 'absolute', left: '95%', top: -4, bottom: -4, width: 2, background: AMARILLO }} title="95: para pasar"/>
        {percentil != null && <div style={{ position: 'absolute', left: `calc(${x}% - 7px)`, top: 0, width: 14, height: 14, borderRadius: 7, background: AZUL, border: `2px solid ${B.titulo}` }}/>}
      </div>
      <div style={{ position: 'relative', height: 34, fontSize: 12, margin: '4px 4px 0' }}>
        <span style={{ position: 'absolute', left: 0, color: B.apagado }}>0</span>
        <span style={{ position: 'absolute', right: 0, color: B.apagado }}>100</span>
        <span style={{ position: 'absolute', left: '95%', transform: 'translateX(-100%)', color: AMARILLO, whiteSpace: 'nowrap', top: 16 }}>95 · para pasar</span>
        {percentil != null && <span data-marca-estrategia style={{ position: 'absolute', left: `${Math.min(x, 70)}%`, color: AZUL, whiteSpace: 'nowrap' }}>Tu estrategia: mejor que {num1(percentil)} de cada 100</span>}
      </div>
    </div>
  )
}

/// El ancho real del gráfico (V9.1053): el dibujo se hace a ese ancho, 1 unidad = 1 píxel, así las letras miden lo mismo (12 px)
// en cualquier pantalla en vez de crecer con el ancho. Sin navegador (el montaje), 820.
function useAncho(defecto = 820) {
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
const LETRA = 12
// Las etiquetas al final de las líneas, sin pisarse: de arriba abajo, cada una al menos SEP por debajo de la anterior; y si la
// última se sale por abajo, se suben las de encima lo justo.
const SEP = 16
export function separaEtiquetas(etq, arriba, abajo) {
  const xs = etq.map(e => ({ ...e })).sort((a, b) => a.y - b.y)
  for (let k = 0; k < xs.length; k++) xs[k].y = Math.max(xs[k].y, arriba, k ? xs[k - 1].y + SEP : -Infinity)
  for (let k = xs.length - 1, tope = abajo; k >= 0; k--) { xs[k].y = Math.min(xs[k].y, tope); tope = xs[k].y - SEP }
  return xs
}
// Las marcas del eje en escala logarítmica (en euros): 1, 2 y 5 por cada potencia de 10 que caiga dentro (solo las de 1 si salen
// demasiadas); si salen menos de tres, cuatro repartidas a la misma distancia.
export function marcasLog(lo, hi) {
  const out = []
  for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++) for (const m of [1, 2, 5]) { const v = m * 10 ** e; if (v >= lo && v <= hi) out.push(v) }
  const solo1 = out.filter(v => Math.abs(Math.log10(v) - Math.round(Math.log10(v))) < 1e-9)
  if (out.length > 6 && solo1.length >= 3) return solo1
  if (out.length >= 3) return out
  return [0, 1, 2, 3].map(k => lo * (hi / lo) ** (k / 3))
}

// El dinero en el tiempo (estrategia, copias, QQQ), en escala logarítmica (V9.1053: la misma distancia es el mismo %), y, debajo,
// la caída desde el máximo.
function GraficoCurvas({ c, maxDDReal, maxDDQqq }) {
  const [ref, W] = useAncho()
  const IZQ = 72, DER = 150, H1 = 300, H2 = 120, ARR = 24, n = c.fechas.length
  const series = [...c.copias, c.estrategia, ...(c.qqq ? [c.qqq] : [])]
  const vals = series.flat().filter(v => Number.isFinite(v) && v > 0), lo = Math.min(...vals), hi = Math.max(...vals)
  const L = Math.log, lLo = L(lo), lHi = L(hi)
  const x = (i) => IZQ + (n > 1 ? i / (n - 1) : 0) * (W - IZQ - DER)
  const y = (v) => ARR + (1 - (L(Math.max(v, lo)) - lLo) / ((lHi - lLo) || 1)) * (H1 - ARR - 24)
  const ruta = (s, fy = y, idx = null) => s.map((v, i) => v == null ? null : `${x(idx ? idx[i] : i).toFixed(1)},${fy(v).toFixed(1)}`).filter(Boolean).join(' ')
  const fin = (s) => s.at(-1)
  const etq = separaEtiquetas([{ t: 'Tu estrategia', v: fin(c.estrategia), color: AZUL }, ...(c.qqq ? [{ t: 'QQQ (solo referencia)', v: fin(c.qqq), color: CLARO }] : []), { t: 'copia: la mejor', v: fin(c.copias.at(-1)), color: B.apagado }, { t: 'copia: la peor', v: fin(c.copias[0]), color: B.apagado }]
    .filter(e => Number.isFinite(e.v)).map(e => ({ ...e, y: y(e.v) })), ARR, H1 - 30)
  const eur = (v) => v / PUNTOS * c.capitalIni, aPuntos = (e) => e / c.capitalIni * PUNTOS
  const ticks = marcasLog(eur(lo), eur(hi)).map(aPuntos)
  const anios = []; c.fechas.forEach((f, i) => { if (i === 0 || f.slice(0, 4) !== c.fechas[i - 1].slice(0, 4)) anios.push([i, f.slice(0, 4)]) })
  // Caídas
  const dE = caidas(c.estrategia), dQ = c.qqq ? caidas(c.qqq) : null
  const minDD = Math.min(-1, ...dE.serie.filter(Number.isFinite), ...(dQ ? dQ.serie.filter(Number.isFinite) : []))
  const y2 = (v) => H1 + 18 + (v / minDD) * (H2 - 20)
  const xMax = dE.i >= 0 ? x(dE.i) : null, aLaIzq = xMax != null && xMax > W - DER - 60
  return (
    <div ref={ref} style={{ width: '100%', marginTop: 8 }}>
      <svg viewBox={`0 0 ${W} ${H1 + H2 + 30}`} width={W} height={H1 + H2 + 30} role="img" aria-label="Cómo creció el dinero, frente al azar (escala logarítmica)" style={{ display: 'block', fontFamily: B.letra }}>
        <text data-escala="log" x={4} y={12} fontSize={LETRA} fill={B.apagado}>escala logarítmica</text>
        {ticks.map((t, k) => <g key={k}><line x1={IZQ} x2={W - DER} y1={y(t)} y2={y(t)} stroke="#1b2430"/><text x={IZQ - 6} y={y(t) + 4} textAnchor="end" fontSize={LETRA} fill={B.apagado}>{euros(eur(t))}</text></g>)}
        {anios.map(([i, a]) => <text key={a} x={x(i)} y={H1 - 6} fontSize={LETRA} fill={B.apagado}>{a}</text>)}
        <g data-copias={c.copias.length}>{c.copias.map((s, k) => <polyline key={k} points={ruta(s, y, c.iCopias)} fill="none" stroke={GRIS} strokeWidth="0.8" strokeOpacity="0.7"/>)}</g>
        {c.qqq && <polyline data-linea="qqq" points={ruta(c.qqq)} fill="none" stroke={CLARO} strokeWidth="1.4" strokeDasharray="5 4"/>}
        <polyline data-linea="estrategia" points={ruta(c.estrategia)} fill="none" stroke={AZUL} strokeWidth="2.6"/>
        {etq.map((e, k) => <text key={k} data-etiqueta={e.t} x={W - DER + 8} y={e.y + 4} fontSize={LETRA} fill={e.color} fontWeight={e.color === AZUL ? 700 : 400}>{e.t}</text>)}
        <text x={IZQ} y={H1 + 12} fontSize={LETRA} fill={ROJO}>Caída desde el máximo</text>
        <line x1={IZQ} x2={W - DER} y1={y2(0)} y2={y2(0)} stroke="#1b2430"/>
        {dQ && <polyline points={ruta(dQ.serie, y2)} fill="none" stroke={B.apagado} strokeWidth="0.9"/>}
        <polyline data-linea="caida" points={ruta(dE.serie, y2)} fill="none" stroke={ROJO} strokeWidth="1.6"/>
        {xMax != null && <g data-caida-maxima><circle cx={xMax} cy={y2(dE.serie[dE.i])} r="3.5" fill={ROJO}/><text x={aLaIzq ? xMax - 6 : xMax + 6} textAnchor={aLaIzq ? 'end' : 'start'} y={y2(dE.serie[dE.i]) + 4} fontSize={LETRA} fontWeight="700" fill={ROJO}>−{num1(maxDDReal).replace(/^-/, '')} %</text></g>}
        <text x={W - DER + 8} y={y2(minDD / 2) + 4} fontSize={LETRA} fill={B.apagado}>{dQ ? `QQQ: −${num1(maxDDQqq)} %` : ''}</text>
      </svg>
    </div>
  )
}

// El histograma de la ganancia media por operación de las copias.
function Histograma({ medias, p95, media }) {
  const [ref, W] = useAncho()
  const h = histograma(medias, 32, [p95, media]), IZQ = 40, DER = 20, H = 220, ABA = 40
  const maxN = Math.max(1, ...h.barras.map(b => b.n))
  const x = (v) => IZQ + (v - h.min) / ((h.max - h.min) || 1) * (W - IZQ - DER)
  const y = (k) => H - ABA - (k / maxN) * (H - ABA - 30)
  const ticks = [h.min, (h.min + h.max) / 2, h.max]
  // El texto junto a una línea vertical va a su derecha o, en la mitad derecha, a su izquierda: así nunca se corta.
  const lado = (xv) => xv > W / 2 ? { x: xv - 4, textAnchor: 'end' } : { x: xv + 4, textAnchor: 'start' }
  const abajo = (xv) => xv < IZQ + 50 ? { x: xv, textAnchor: 'start' } : xv > W - DER - 50 ? { x: xv, textAnchor: 'end' } : { x: xv, textAnchor: 'middle' }
  return (
    <div ref={ref} style={{ width: '100%', marginTop: 8 }}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label="Las copias al azar del laboratorio de operaciones" style={{ display: 'block', fontFamily: B.letra }}>
        <g data-barras={h.barras.length}>{h.barras.map((b, k) => <rect key={k} x={x(b.desde) + 0.5} y={y(b.n)} width={Math.max(0.5, x(b.hasta) - x(b.desde) - 1)} height={H - ABA - y(b.n)} fill={GRIS}/>)}</g>
        <line x1={IZQ} x2={W - DER} y1={H - ABA} y2={H - ABA} stroke={B.borde}/>
        {ticks.map((t, k) => <text key={k} {...abajo(x(t))} y={H - ABA + 16} fontSize={LETRA} fill={B.apagado}>{pctOp(t)}</text>)}
        {Number.isFinite(p95) && <g data-p95><line x1={x(p95)} x2={x(p95)} y1={18} y2={H - ABA} stroke={AMARILLO} strokeWidth="1.6" strokeDasharray="5 4"/><text data-texto-p95 {...lado(x(p95))} y={14} fontSize={LETRA} fill={AMARILLO}>95 de cada 100 (lo que hay que superar)</text></g>}
        {Number.isFinite(media) && <g data-estrategia><line x1={x(media)} x2={x(media)} y1={30} y2={H - ABA} stroke={AZUL} strokeWidth="2.6"/><text {...abajo(x(media))} y={H - 6} fontSize={LETRA} fontWeight="700" fill={AZUL}>tu estrategia</text></g>}
      </svg>
    </div>
  )
}

export default function BuilderCurvas({ fila, est, resultados, veredictos, periodoInicial = 0, varianteInicial = null }) {
  const cn = comunNormal(fila.lote.comun), vs = fila.lote.variantes
  const [k, setK] = useState(periodoInicial)
  const [vid, setVid] = useState(varianteInicial || vs[0]?.id)
  const v = vs.find(x => x.id === vid) || vs[0], p = cn.periodos[k] || cn.periodos[0]
  const r = resultados.find(x => x.id === v.id && x.periodo.desde === p.desde && x.periodo.hasta === p.hasta) || {}
  const curvas = est.curvas?.[claveCurvas(v.id, p)] || null   // solo las pruebas nuevas (V9.1051)
  const medias = pl0 => decodificaMedias(pl0?.copias)
  const ver = veredictos.find(x => x.v.id === v.id) || {}
  const abV = (est.ab?.resultados || []).find(x => x.id === v.id)
  // Como la tabla (filasResultado): una prueba muy antigua guarda un solo periodo sin lista de periodos.
  const pa = Array.isArray(abV?.periodos) ? abV.periodos.find(x => x.desde === p.desde && x.hasta === p.hasta) : (k === 0 && abV ? abV : null)
  const pl = (est.lab[v.id] || []).find(x => x.desde === p.desde && x.hasta === p.hasta) || null
  const capital = curvas?.capitalIni ?? cn.capitalIni ?? 10000, ms = medias(pl)
  const papel = (decide) => decide ? 'decide el veredicto' : 'solo informativo'
  const nCart = pa?.nSim ?? cn.nSim, nOps = pl?.azar?.nSim ?? 1000
  return (
    <div data-curvas style={{ marginTop: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 700, color: B.titulo }}>Cómo le fue, periodo a periodo</span>
        {vs.length > 1 && <select aria-label="Estrategia" value={v.id} onChange={e => setVid(e.target.value)} style={{ fontFamily: B.letra, fontSize: B.base, background: B.fondo, color: B.texto, border: `1px solid ${B.borde}`, borderRadius: B.radioBoton, padding: '4px 8px', width: 'auto' }}>{vs.map(x => <option key={x.id} value={x.id}>{nombreVariante(x)}</option>)}</select>}
      </div>
      <div role="tablist" aria-label="Periodo" style={{ display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap' }}>
        {cn.periodos.map((q, j) => <button key={j} role="tab" aria-selected={j === k} onClick={() => setK(j)} style={{ ...S.boton, padding: '6px 14px', fontSize: 13, ...(j === k ? { background: B.cabecera, borderColor: B.siguienteBorde, color: B.titulo, fontWeight: 700 } : { background: 'transparent', color: B.secundario }) }}>{nombrePeriodo(q)}</button>)}
      </div>

      {pa && <Caja datos={{ 'data-tarjeta-curva': nombrePeriodo(p) }} titulo="Cómo creció el dinero, frente al azar"
        subtitulo={`${fila.nombre} · Laboratorio de cartera · ${nombreVariante(v)} · ${nombrePeriodo(p)} · dinero inicial ${euros(capital)} · ${papel(ver.decide === 'lote')}`}>
        {curvas ? <GraficoCurvas c={curvas} maxDDReal={r.maxDD} maxDDQqq={r.qqq?.maxDD}/> : <div data-antigua="curva" style={{ ...S.secundario, marginTop: 10 }}>{ANTIGUA_CURVA}</div>}
        {curvas && <div style={{ ...S.apagado, marginTop: 2 }}>Azul: tu estrategia · gris: {curvas.copias.length} de las {nCart} copias al azar, repartidas de peor a mejor · discontinua: QQQ sin hacer nada (solo referencia).</div>}
        <div data-cifras style={{ marginTop: 10, color: B.texto, lineHeight: 1.7 }}>
          <div>Crecimiento anual: <strong>{pct(r.cagr)}</strong> · QQQ: {r.qqq ? pct(r.qqq.cagr) : '—'}</div>
          <div>Caída máxima: <strong>{pct(r.maxDD)}</strong> · QQQ: {r.qqq ? pct(r.qqq.maxDD) : '—'}</div>
        </div>
        <Barra percentil={r.percentilLote} total={nCart}/>
        <div style={{ ...S.secundario, fontSize: 13, marginTop: 4 }}><strong style={{ color: B.titulo }}>Cómo leerlo.</strong> {COMO_LEER_CURVA}</div>
      </Caja>}

      {pl ? <Caja datos={{ 'data-tarjeta-copias': nombrePeriodo(p) }} titulo={`Dónde queda tu estrategia entre las ${nOps.toLocaleString('de-DE')} copias`}
        subtitulo={`${fila.nombre} · Laboratorio de operaciones · ${nombreVariante(v)} · ${nombrePeriodo(p)} · ganancia media por operación · ${papel(ver.decide === 'laboratorio')}`}>
        {ms?.length ? <Histograma medias={ms} p95={pl.azar?.p95} media={pl.media}/> : <div data-antigua="copias" style={{ ...S.secundario, marginTop: 10 }}>{ANTIGUA_COPIAS}</div>}
        <div data-cifras-copias style={{ marginTop: 8, color: B.texto }}>
          Tu estrategia: <strong>{pctOp(pl.media)} por operación</strong> · mejor que {deCada(pl.azar?.percentil, nOps) ?? '—'} de cada {nOps.toLocaleString('de-DE')} · lo que hay que superar (95 de cada 100): {pctOp(pl.azar?.p95)}
        </div>
        <div style={{ ...S.secundario, fontSize: 13, marginTop: 4 }}>{COMO_LEER_HISTO}</div>
      </Caja> : <div data-sin-operaciones style={{ ...S.secundario, marginTop: 12 }}>Esta prueba no tiene laboratorio de operaciones en este periodo.</div>}
    </div>
  )
}
