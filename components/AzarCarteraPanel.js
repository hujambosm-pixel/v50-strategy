// «Prueba contra el azar (cartera)» en los resultados de la multicartera (lib/azarCartera.js). Se calcula al desplegarla:
// repite la petición de la ejecución con conCandidatos: true, recompone la cartera real (tiene que dar lo mismo que el
// servidor; si no, no sigue) y simula en el navegador, por tandas, las pruebas A (señal al azar) y B (orden al azar).
import { useState, useEffect, useRef } from 'react'
import { MONO, fmt } from '../lib/utils'
import { AZAR, TEXTO_VEREDICTO, TEXTO_VEREDICTO_CAIDA } from '../lib/azar'
import { motivoNoAdmitida, semillaCartera, preparaCartera, realCartera, comparaConServidor, creaPrueba, resumenPrueba, bhDe } from '../lib/azarCartera'

// La petición de cada resultado, sin tocar el resultado: pages/index.js la anota al recibirlo.
const PETICIONES = new WeakMap()
export function anotaPeticionMc(resultado, cuerpo) { if (resultado && typeof resultado === 'object') PETICIONES.set(resultado, cuerpo) }
// Caché por configuración (la petición) y número de simulaciones; vive mientras la página siga abierta.
const CACHE = new Map()
export const peticionMcDe = (resultado) => (resultado && PETICIONES.get(resultado)) || null
// Para «Copiar para Claude»: la prueba ya calculada (la última, con su número de simulaciones) de cada resultado, o por
// qué no está. No calcula nada.
export function pruebasCalculadas(resultados = []) {
  return resultados.filter(r => r && r.result && r.id !== '__portfolio__').map(r => {
    const pet = PETICIONES.get(r.result) || null, motivo = motivoNoAdmitida(pet, 'A')
    if (motivo) return { nombre: r.name, motivo }
    const pref = `${JSON.stringify(pet)}|`
    const e = [...CACHE.entries()].filter(([k, v]) => k.startsWith(pref) && v.estado === 'hecho').map(([, v]) => v).pop()
    return e ? { nombre: r.name, nSim: e.n, semilla: semillaCartera(pet), bh: e.bh, A: e.res.A, B: e.res.B, motivoB: e.motivoB } : { nombre: r.name, motivo: 'no calculada' }
  })
}

const GRIS = 'var(--text-legible)', TAM = 12
const caja = { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 6, padding: '10px 12px', margin: '10px 16px' }
const pct = (v, d = 2) => fmt(v, d, ' %'), num = (v, d = 2) => fmt(v, d)
const TEXTO_RATIO = TEXTO_VEREDICTO

function useAncho(minimo = 320, inicial = 640) {
  const ref = useRef(null)
  const [ancho, setAncho] = useState(inicial)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const mide = () => { const w = Math.floor(el.clientWidth); if (w > 0) setAncho(Math.max(minimo, w)) }
    mide()
    const ro = new ResizeObserver(mide)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, ancho]
}

// Histograma del CAGR de las simulaciones, con la línea del real y la del B&H Diversificado; a todo el ancho.
function Histograma({ sims, real, bh }) {
  const [ref, W] = useAncho()
  const H = 190, L = 40, Rm = 16, T = 20, B = 30, NB = 40
  const v = Array.from(sims || []).filter(Number.isFinite)
  if (!v.length) return null
  const extra = [real, bh].filter(Number.isFinite)
  let x0 = Math.min(...v, ...extra), x1 = Math.max(...v, ...extra)
  if (x1 === x0) { x0 -= 1; x1 += 1 }
  const pad = (x1 - x0) * 0.03; x0 -= pad; x1 += pad
  const ancho = (x1 - x0) / NB, cuenta = new Array(NB).fill(0)
  for (const x of v) cuenta[Math.min(NB - 1, Math.floor((x - x0) / ancho))]++
  const max = Math.max(...cuenta)
  const px = (x) => L + (x - x0) / (x1 - x0) * (W - L - Rm), alto = (k) => k / max * (H - T - B)
  const texto = { fill: GRIS, fontSize: TAM, fontFamily: MONO }
  const linea = (x, color, rotulo, dash) => <g><line x1={px(x)} x2={px(x)} y1={T - 6} y2={H - B} stroke={color} strokeWidth="2" strokeDasharray={dash} />
    <text x={px(x)} y={T - 8} textAnchor={px(x) > W - 90 ? 'end' : px(x) < L + 60 ? 'start' : 'middle'} style={{ ...texto, fill: color }}>{rotulo}</text></g>
  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: TAM, color: GRIS, marginBottom: 2 }}>
        <span><span style={{ color: GRIS }}>▮</span> CAGR compuesto de cada simulación</span><span><span style={{ color: 'var(--accent)' }}>━</span> Real</span>
        {Number.isFinite(bh) && <span><span style={{ color: '#a0b4c8' }}>╌</span> B&H Diversif.</span>}</div>
      <div ref={ref} style={{ width: '100%' }}>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }} role="img" aria-label="Histograma del CAGR de las simulaciones con el real y el B&H">
          {cuenta.map((k, i) => k > 0 && <rect key={i} x={px(x0 + i * ancho) + 0.5} y={H - B - alto(k)} width={Math.max(1, px(x0 + (i + 1) * ancho) - px(x0 + i * ancho) - 1)} height={alto(k)} fill={GRIS} opacity="0.55">
            <title>{`${pct(x0 + i * ancho)} a ${pct(x0 + (i + 1) * ancho)}: ${k} simulaciones`}</title></rect>)}
          <line x1={L} x2={W - Rm} y1={H - B} y2={H - B} stroke="var(--border)" strokeWidth="1" />
          {Array.from({ length: 5 }, (_, i) => x0 + (x1 - x0) * i / 4).map((x, i) => <text key={i} x={px(x)} y={H - B + 18} textAnchor="middle" style={texto}>{pct(x, 1)}</text>)}
          {Number.isFinite(bh) && linea(bh, '#a0b4c8', `B&H ${pct(bh, 1)}`, '5 4')}
          {Number.isFinite(real) && linea(real, 'var(--accent)', `real ${pct(real, 1)}`)}
        </svg>
      </div>
    </div>
  )
}

function Bloque({ titulo, pregunta, r, bh, nSim, motivo }) {
  const c = { padding: '3px 8px', textAlign: 'right', fontSize: TAM }
  const filas = r ? [
    ['CAGR compuesto', r.cagr, (v) => pct(v), TEXTO_VEREDICTO],
    ['Caída máxima (con flotante)', r.maxDD, (v) => pct(v), TEXTO_VEREDICTO_CAIDA],
    ['CAGR / caída', r.ratio, (v) => num(v), TEXTO_RATIO],
    ['Capital invertido medio', r.capInv, (v) => pct(v), null],
  ] : []
  return (
    <div style={{ ...caja, margin: '10px 0 0' }}>
      <div style={{ fontSize: TAM, color: 'var(--text)', fontWeight: 700 }}>{titulo}</div>
      <div style={{ fontSize: TAM, color: GRIS, marginBottom: 6 }}>{pregunta}</div>
      {motivo ? <div style={{ fontSize: TAM, color: GRIS }}>{motivo}</div> : (<>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: TAM }}>
            <thead><tr style={{ color: GRIS }}>{['Medida', 'Real', 'Mediana del azar', 'P5–P95 del azar', 'Percentil', 'Veredicto'].map((t, i) => <th key={t} style={{ ...c, textAlign: i === 0 || i === 5 ? 'left' : 'right', fontWeight: 400 }}>{t}</th>)}</tr></thead>
            <tbody>{filas.map(([nombre, x, f, textos]) => (
              <tr key={nombre} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ ...c, textAlign: 'left' }}>{nombre}</td><td style={c}>{x.real == null ? '—' : f(x.real)}</td><td style={c}>{x.mediana == null ? '—' : f(x.mediana)}</td>
                <td style={c}>{x.p5 == null ? '—' : `${f(x.p5)} – ${f(x.p95)}`}</td><td style={c}>{textos && x.percentil != null ? fmt(x.percentil, 1) : '—'}</td>
                <td style={{ ...c, textAlign: 'left' }}>{textos ? (x.veredicto ? textos[x.veredicto] : '—') : 'Solo informativo'}</td>
              </tr>))}</tbody>
          </table>
        </div>
        <Histograma sims={r.simsCagr} real={r.cagr.real} bh={bh?.cagr} />
        <div style={{ fontSize: TAM, color: GRIS }}>{bh ? `B&H Diversif. de la misma ejecución: CAGR ${pct(bh.cagr)}${bh.maxDD != null ? ` · caída máxima ${pct(bh.maxDD)}` : ''}.` : ''} {fmt(nSim, 0)} simulaciones.</div>
      </>)}
    </div>
  )
}

export default function AzarCarteraPanel({ resultados = [], apiFetch = null }) {
  const lista = resultados.filter(r => r && r.result && r.id !== '__portfolio__')
  const [abierta, setAbierta] = useState(false)
  const [selId, setSelId] = useState(null)
  const sel = lista.find(r => r.id === selId) || lista[0] || null
  const [nSim, setNSim] = useState(AZAR.simulaciones)
  const [textoN, setTextoN] = useState(String(AZAR.simulaciones))
  const [progreso, setProgreso] = useState(null)
  const [, setVersion] = useState(0)
  const pet = sel ? PETICIONES.get(sel.result) || null : null
  const motivo = sel ? motivoNoAdmitida(pet, 'A') : null
  const clave = pet && !motivo ? `${JSON.stringify(pet)}|${nSim}` : null
  const entrada = clave ? CACHE.get(clave) : null
  const aplicaN = () => { const v = Math.round(Number(String(textoN).replace(/\./g, '').replace(',', '.'))); const n = Number.isFinite(v) ? Math.min(AZAR.maxSimulaciones, Math.max(AZAR.minSimulaciones, v)) : AZAR.simulaciones; setNSim(n); setTextoN(String(n)) }
  useEffect(() => {
    if (!abierta || !clave || !apiFetch || entrada) return
    const e = { estado: 'calculando' }
    CACHE.set(clave, e)
    const peticion = pet, n = nSim
    ;(async () => {
      try {
        const t0 = Date.now()
        setProgreso({ clave, texto: 'Pidiendo los candidatos al servidor…' })
        const r = await apiFetch('/api/multibacktest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...peticion, conCandidatos: true }) })
        const j = await r.json().catch(() => null)
        if (!r.ok || !j?.candidatosAzar) throw new Error(j?.error || `HTTP ${r.status}`)
        const msDatos = Date.now() - t0
        const P = preparaCartera(j.candidatosAzar)
        const real = realCartera(P)
        const cmp = comparaConServidor(real, j)
        if (!cmp.ok) {
          Object.assign(e, { estado: 'error', error: `La cartera recompuesta no coincide con la ejecución (diferencias: CAGR ${cmp.dif.cagr.toExponential(1)}, caída ${cmp.dif.maxDD.toExponential(1)}, capital invertido ${cmp.dif.capInv.toExponential(1)}); la prueba no se calcula.` })
        } else {
          const semilla = semillaCartera(peticion), res = {}, motivoB = motivoNoAdmitida(peticion, 'B'), t1 = Date.now()
          for (const tipo of motivoB ? ['A'] : ['A', 'B']) {
            const pr = creaPrueba(P, { tipo, nSim: n, semilla })
            while (!pr.hecho()) {
              pr.avanza(25)
              setProgreso({ clave, texto: `Prueba ${tipo}: ${pr.hechas()} de ${n} simulaciones…` })
              await new Promise(ok => setTimeout(ok, 0))   // cede el hilo entre tandas
            }
            res[tipo] = { ...resumenPrueba(real, pr.sims), simsCagr: pr.sims.cagr }
          }
          Object.assign(e, { estado: 'hecho', res, motivoB, bh: bhDe(j), msDatos, msSim: Date.now() - t1, n })
        }
      } catch (err) { Object.assign(e, { estado: 'error', error: err?.message || 'error' }) }
      setProgreso(null); setVersion(v => v + 1)
    })()
  }, [abierta, clave])
  if (!lista.length) return null
  const cabecera = (
    <button onClick={() => setAbierta(a => !a)} aria-expanded={abierta} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--text)', fontFamily: MONO, fontSize: TAM, fontWeight: 700 }}>
      {abierta ? '▾ Prueba contra el azar (cartera)' : '▸ Prueba contra el azar (cartera)'}</button>)
  if (!abierta) return <div style={caja}>{cabecera}</div>
  return (
    <div style={{ ...caja, fontFamily: MONO }}>{cabecera}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginTop: 6, fontSize: TAM, color: GRIS }}>
        {lista.length > 1 && <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>Estrategia
          <select value={sel?.id || ''} onChange={e => setSelId(e.target.value)} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontFamily: MONO, fontSize: TAM, padding: '3px 6px' }}>
            {lista.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>}
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>Simulaciones
          <input value={textoN} onChange={e => setTextoN(e.target.value)} onBlur={aplicaN} onKeyDown={e => { if (e.key === 'Enter') aplicaN() }} inputMode="numeric"
            style={{ width: 70, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontFamily: MONO, fontSize: TAM, padding: '3px 6px' }} />
          <span>({fmt(AZAR.minSimulaciones, 0)}–{fmt(AZAR.maxSimulaciones, 0)})</span></label>
      </div>
      {motivo && <div style={{ fontSize: TAM, color: GRIS, marginTop: 8 }}>{motivo}</div>}
      {!motivo && !apiFetch && <div style={{ fontSize: TAM, color: GRIS, marginTop: 8 }}>No disponible aquí.</div>}
      {!motivo && progreso?.clave === clave && <div role="status" style={{ fontSize: TAM, color: GRIS, marginTop: 8 }}>⏳ {progreso.texto}</div>}
      {entrada?.estado === 'error' && <div style={{ fontSize: TAM, color: '#ff4d6d', marginTop: 8 }}>{entrada.error}</div>}
      {entrada?.estado === 'hecho' && (<>
        <div style={{ fontSize: TAM, color: GRIS, marginTop: 8 }}>{`La cartera real recompuesta en el navegador coincide con la ejecución. Tiempo: candidatos ${fmt(entrada.msDatos / 1000, 1)} s · simulación ${fmt(entrada.msSim / 1000, 1)} s.`}</div>
        <Bloque titulo="A · Señal al azar, reparto real" pregunta="¿Acierta la estrategia CUÁNDO entrar, con la misma forma de repartir el capital?" r={entrada.res.A} bh={entrada.bh} nSim={entrada.n} />
        <Bloque titulo="B · Señal real, orden al azar" pregunta="¿Acierta la cartera EN QUÉ activos poner el dinero, con las mismas señales?" r={entrada.res.B} bh={entrada.bh} nSim={entrada.n} motivo={entrada.motivoB} />
        <div style={{ fontSize: TAM, color: GRIS, lineHeight: 1.5, marginTop: 8 }}>
          Cómo leer esto: en A, cada activo repite sus operaciones (mismo número, mismas duraciones) en fechas al azar y la cartera las reparte con sus
          reglas de siempre; en B, las señales son las reales y lo único al azar es el orden en que se eligen cuando compiten por el capital o los huecos
          (la puerta del modo «Filtro», si la hay, sigue igual). El percentil es el % de simulaciones por debajo del real (en la caída, por encima: caer
          menos es mejor): ≥ {AZAR.supera} supera al azar; {AZAR.algoMejor}–{AZAR.supera} algo mejor; {AZAR.algoPeor}–{AZAR.algoMejor} no se distingue;
          {' '}{AZAR.peor}–{AZAR.algoPeor} algo peor; por debajo de {AZAR.peor}, peor. Si A no supera al azar pero B sí, la ventaja está en la selección de
          activos; si ninguna lo supera, el resultado viene de los activos y del periodo. Aproximación: el azar entra y sale en aperturas.
        </div>
      </>)}
    </div>
  )
}
