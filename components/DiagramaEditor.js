// components/DiagramaEditor.js — el diagrama de una definición del editor (docs/editor-visual.md, E7). Solo ver: SVG propio,
// sin librerías, con disposición automática. El formato 1 tiene un ciclo fijo, así que los estados salen de la definición:
//   FUERA ──señal──▶ (ORDEN VIVA ──se llena──▶) DENTRO, ORDEN VIVA ──cancelar──▶ FUERA, y cada stop o salida ACTIVA (con
// los valores actuales) es una flecha de DENTRO a FUERA, en el orden en que se comprueba. El filtro de mercado va como
// condición añadida a la señal. Los textos son las frases de lib/editor/definicion.js, recortadas; la entera, en el título.
import { fraseCond, fraseStop, valoresDe, activa, resuelve } from '../lib/editor/definicion'

const LILA = '#a78bfa', VERDE = '#00e5a0', ROJO = '#ff4d6d', AMBAR = '#ffb020'
const recorta = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s)
const fmt = (x) => String(x).replace('.', ',')

function Estado({ x, y, w, h, texto, sub, color }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={10} fill="var(--bg)" stroke={color} strokeWidth={1.5}/>
      <text x={x + w / 2} y={y + h / 2 - (sub ? 4 : -4)} textAnchor="middle" fontSize={12} fontWeight={700} fill={color}>{texto}</text>
      {sub && <text x={x + w / 2} y={y + h / 2 + 11} textAnchor="middle" fontSize={9} fill="var(--text-legible)">{sub}</text>}
    </g>
  )
}

export default function DiagramaEditor({ def, valores = {} }) {
  let v = {}
  try { v = valoresDe(def, valores) } catch (_) {}
  const en = def?.entrada || {}, o = en.orden || {}
  const conOrden = o.tipo === 'stop' || o.tipo === 'limite'
  const frase = (c) => { try { return fraseCond(c, v) } catch (_) { return '…' } }
  const senal = frase(en.senal) + (def?.filtroMercado ? ` y en ${def.filtroMercado.ticker} ${frase(def.filtroMercado.si)}` : '')
  const salidas = []
  for (const s of def?.stops || []) if (activa(s.activa, v)) { let t = s.tipo; try { t = fraseStop(s, v) } catch (_) {} salidas.push({ etiqueta: `stop ${s.id || ''}`.trim(), texto: t, color: ROJO }) }
  for (const s of def?.salidas || []) if (activa(s.activa, v)) {
    const r = resuelve(s, v)
    salidas.push({ etiqueta: s.motivo || s.tipo, color: AMBAR,
      texto: s.tipo === 'condicion' ? `a la apertura siguiente cuando ${frase(s.si)}` : s.tipo === 'objetivo' ? `objetivo a ${fmt(r.multiploR)} veces el riesgo inicial` : `como mucho ${r.velas} velas` })
  }
  const W = 460, h = 44, y0 = 30, wE = 104
  const xF = 8, xO = 178, xD = W - wE - 8
  const xT = xF + wE / 2 + 4 * salidas.length + 8   // los textos de las salidas, a la derecha de todas las líneas que suben a FUERA
  const yS = y0 + h + 34, paso = 26
  const H = yS + Math.max(1, salidas.length) * paso + (conOrden && en.cancelar ? 30 : 6)
  const orden = o.tipo === 'apertura' ? 'compra a la apertura siguiente' : o.tipo === 'cierre' ? 'compra al cierre' : ''
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', fontFamily: 'inherit' }} role="img" aria-label="Diagrama de la estrategia">
      <defs>
        {[['fl', 'var(--text-legible)'], ['flV', VERDE], ['flR', ROJO], ['flA', AMBAR], ['flL', LILA]].map(([id, c]) => (
          <marker key={id} id={id} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill={c}/></marker>
        ))}
      </defs>
      <Estado x={xF} y={y0} w={wE} h={h} texto="FUERA" sub="sin posición" color="var(--text-legible)"/>
      {conOrden && <Estado x={xO} y={y0} w={wE} h={h} texto="ORDEN VIVA" sub={`${o.tipo === 'stop' ? 'stop' : 'límite'} · ${o.ajuste === 'soloBaja' ? 'solo baja' : o.ajuste === 'soloSube' ? 'solo sube' : 'fija'}`} color={LILA}/>}
      <Estado x={xD} y={y0} w={wE} h={h} texto="DENTRO" sub="con posición" color={VERDE}/>
      {/* señal */}
      <line x1={xF + wE} y1={y0 + h / 2} x2={(conOrden ? xO : xD) - 2} y2={y0 + h / 2} stroke={VERDE} strokeWidth={1.4} markerEnd="url(#flV)"/>
      <text x={xF + wE + 4} y={y0 - 8} fontSize={9.5} fill="var(--text)"><title>{senal}</title>señal: {recorta(senal, conOrden ? 34 : 50)}</text>
      {!conOrden && orden && <text x={xF + wE + 6} y={y0 + h / 2 + 13} fontSize={9} fill="var(--text-legible)">{orden}</text>}
      {conOrden && <>
        <line x1={xO + wE} y1={y0 + h / 2} x2={xD - 2} y2={y0 + h / 2} stroke={VERDE} strokeWidth={1.4} markerEnd="url(#flV)"/>
        <text x={xO + wE + 4} y={y0 + h / 2 - 5} fontSize={9} fill="var(--text-legible)">se llena</text>
      </>}
      {/* stops y salidas: de DENTRO a FUERA, en el orden en que se comprueban */}
      {salidas.length === 0 && <text x={xD} y={yS + 4} fontSize={9.5} fill={ROJO}>sin stops ni salidas activos</text>}
      {salidas.map((s, k) => {
        const y = yS + k * paso, xa = xD + wE / 2 - k * 4
        return (
          <g key={k}>
            <path d={`M ${xa} ${y0 + h} L ${xa} ${y} L ${xF + wE / 2 + k * 4} ${y} L ${xF + wE / 2 + k * 4} ${y0 + h + 2}`} fill="none" stroke={s.color} strokeWidth={1.1} strokeOpacity={0.8} markerEnd={`url(#${s.color === ROJO ? 'flR' : 'flA'})`}/>
            <text x={xT} y={y - 4} fontSize={9} fill="var(--text)"><title>{s.texto}</title>{k + 1}. {s.etiqueta}: {recorta(s.texto, 48)}</text>
          </g>
        )
      })}
      {conOrden && en.cancelar && (() => {
        const y = H - 12, t = frase(en.cancelar)
        return (
          <g>
            <path d={`M ${xO + wE / 2} ${y0 + h} L ${xO + wE / 2} ${y} L ${xF + 12} ${y} L ${xF + 12} ${y0 + h + 2}`} fill="none" stroke={LILA} strokeWidth={1.1} strokeDasharray="4 3" markerEnd="url(#flL)"/>
            <text x={xF + 18} y={y - 4} fontSize={9} fill={LILA}><title>{t}</title>cancelar: {recorta(t, 52)}</text>
          </g>
        )
      })()}
    </svg>
  )
}
