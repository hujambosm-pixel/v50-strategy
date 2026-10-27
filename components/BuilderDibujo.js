// components/BuilderDibujo.js — «Dibujo de la regla» del paso 1 (V9.1050; docs/builder.md, §16): un diagrama de flujo HORIZONTAL,
// de izquierda a derecha, dibujado SIEMPRE a partir de la regla de la pantalla (las mismas lecturas de las tarjetas,
// lib/builder/tarjetas.js; nunca con IA). Cada vela, al cierre → 1 · FILTRO (si hay) → 2 · COMPRO SI → [¿Llega al máximo de la
// señal?] → Compro → Tengo la acción → 3 · VENDO SI → Vendo. Ramas «No» hacia abajo; la vuelta al principio, discontinua.
// En cada rombo, como mucho 3 condiciones; si hay más, «y N más», que se despliega al pulsarlo. En pantallas estrechas, scroll.
import { useState } from 'react'
import { B } from '../lib/builder/estilo'
import { leeFiltro, leeCompra, leeVenta, leeOrden, leeProteccion, fraseFila, fraseStopTarjeta, nombreQuien, AJUSTES, leeModoStops } from '../lib/builder/tarjetas'

const MORADO = '#a371f7', AZUL = '#58a6ff', NARANJA = '#f0883e', GRIS = '#9fb0c3', VERDE = '#3fb950', VERDE_AZULADO = '#3dd6c3', SI = '#56d364', NO = '#ff9b9b'
const LETRA = 12, LINEA = 16, MAX = 3
const corta = (t, n = 46) => t.length > n ? t.slice(0, n - 1) + '…' : t
const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`

// Las líneas de cada rombo, a partir de la definición: [{ texto, color?, completo }].
export function contenidoDibujo(def, valores) {
  const filtro = leeFiltro(def), compra = leeCompra(def), venta = leeVenta(def), orden = leeOrden(def), prot = leeProteccion(def)
  const v = valores || {}
  const lineas = (filas, quien = null) => filas.map(f => { const t = fraseFila(f, v, {}, quien ? f.quien : 'valor'); return { texto: t } })
  const proteccion = []
  if (prot.tiempo.estado === 'velas') proteccion.push({ texto: `como muy tarde a las ${v[String(prot.tiempo.valor).slice(1)] ?? prot.tiempo.valor} velas`, color: VERDE_AZULADO })
  for (const { s } of prot.stops) proteccion.push({ texto: fraseStopTarjeta(s, v), color: VERDE_AZULADO })
  if (prot.stops.length > 1 && leeModoStops(def) === 'masAlto') proteccion.push({ texto: 'con varios stops, manda el más alto', color: VERDE_AZULADO })
  if (prot.objetivo.estado === 'veces') proteccion.push({ texto: `objetivo: ${String(v[String(prot.objetivo.valor).slice(1)] ?? prot.objetivo.valor).replace('.', ',')} veces lo que arriesgo`, color: VERDE_AZULADO })
  const ajuste = AJUSTES.find(([k]) => k === orden.ajuste)?.[1]
  return {
    filtro: filtro.ok && filtro.filas.length ? { titulo: '1 · FILTRO', modo: 'TODAS', lineas: lineas(filtro.filas, true) } : null,
    compra: { titulo: `${filtro.ok && filtro.filas.length ? 2 : 1} · COMPRO SI`, modo: compra.filas.length > 1 ? (compra.modo === 'alguna' ? 'AL MENOS UNA' : 'TODAS') : null, lineas: compra.ok ? ((orden.modo === 'ruptura' || orden.modo === 'swing') && !compra.filas.length ? [{ texto: 'siempre: la orden está puesta en cada vela' }] : lineas(compra.filas)) : [{ texto: 'la regla de compra del Editor clásico' }] },
    // V9.1055: la orden en el nivel de ruptura, su rombo.
    // V9.1059: la orden en el último máximo de swing, su rombo.
    orden: orden.modo === 'swing' ? { titulo: `¿Supera el último máximo de swing (${v[String(orden.izquierda).slice(1)] ?? orden.izquierda}/${v[String(orden.derecha).slice(1)] ?? orden.derecha}) confirmado?`, modo: null, lineas: [{ texto: 'compro a ese nivel; si la vela abre ya por encima, a la apertura' }, { texto: 'cada swing, una sola vez' }] }
    : orden.modo === 'ruptura' ? { titulo: `¿Supera el máximo de las ${v[String(orden.velas).slice(1)] ?? orden.velas} velas anteriores?`, modo: null, lineas: [{ texto: 'compro a ese nivel; si la vela abre ya por encima, a la apertura' }] }
    : orden.modo === 'maximo' ? { titulo: '¿Llega al máximo de la señal?', modo: null, lineas: [
      ...(ajuste ? [{ texto: `si no llega, la orden ${ajuste}` }] : []),
      ...(orden.cancelar ? [{ texto: `se cancela si ${fraseFila(orden.cancelar, v)}` }] : []),
    ] } : null,
    venta: { titulo: `${filtro.ok && filtro.filas.length ? 3 : 2} · VENDO SI`, modo: venta.filas.length > 1 ? (venta.modo === 'todas' ? 'TODAS' : 'BASTA UNA') : null, lineas: venta.ok ? lineas(venta.filas) : [], proteccion },
    compro: orden.modo === 'swing' ? 'Compro en el último máximo de swing' : orden.modo === 'ruptura' ? 'Compro en el nivel de ruptura' : orden.modo === 'maximo' ? 'Compro en el máximo de la señal' : 'Compro a la apertura de la vela siguiente',
  }
}

// Un texto partido en líneas de como mucho n caracteres.
function parte(texto, n) {
  const out = []; let l = ''
  for (const w of texto.split(' ')) { if ((l + ' ' + w).trim().length > n && l) { out.push(l); l = w } else l = (l + ' ' + w).trim() }
  if (l) out.push(l)
  return out
}

export default function BuilderDibujo({ def, valores, error = null, expandidosInicial = null }) {
  const [expandidos, setExpandidos] = useState(() => new Set(expandidosInicial || []))
  if (error) return <div data-dibujo="error" style={{ color: '#ff8b8b', padding: '12px 4px' }}>{error}</div>
  const c = contenidoDibujo(def, valores)
  const alterna = (k) => setExpandidos(s => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n })
  // ── Las piezas, de izquierda a derecha ──
  const Y0 = 150, HUECO = 56
  const nodos = []
  const rombo = (clave, d, color) => {
    if (!d) return
    const visibles = expandidos.has(clave) ? d.lineas : d.lineas.slice(0, MAX), mas = d.lineas.length - visibles.length
    // Cada condición, en una o dos líneas (si no cabe, «…» y el texto entero al pasar el ratón).
    const enLineas = (x) => { const ls = parte(x.texto, 40), dos = ls.slice(0, 2); if (ls.length > 2) dos[1] = corta(dos[1] + ' ' + ls.slice(2).join(' '), 40); return dos.map((t, k) => ({ ...x, texto: t, completo: x.texto, sigue: k > 0 })) }
    const filas = [...visibles.flatMap(enLineas), ...(mas > 0 ? [{ texto: `y ${mas} más`, mas: true }] : []), ...(expandidos.has(clave) && d.lineas.length > MAX ? [{ texto: 'ver menos', menos: true }] : []), ...(d.proteccion || []).flatMap(enLineas)]
    const ancho = 340, alto = Math.max(130, 76 + (filas.length + (d.modo ? 1 : 0)) * LINEA * 1.4)
    nodos.push({ clave, tipo: 'rombo', color, ancho, alto, d, filas })
  }
  nodos.push({ clave: 'inicio', tipo: 'ovalo', ancho: 150, alto: 60, texto: ['Cada vela,', 'al cierre'], color: GRIS })
  rombo('filtro', c.filtro, MORADO)
  rombo('compra', c.compra, AZUL)
  rombo('orden', c.orden, GRIS)
  nodos.push({ clave: 'compro', tipo: 'caja', ancho: 190, alto: 64, texto: parte(c.compro, 22), color: VERDE })
  nodos.push({ clave: 'dentro', tipo: 'caja', ancho: 150, alto: 64, texto: ['Tengo la acción'], color: GRIS })
  rombo('venta', c.venta, NARANJA)
  nodos.push({ clave: 'vendo', tipo: 'ovalo', ancho: 190, alto: 64, texto: parte('Vendo a la apertura de la vela siguiente', 22), color: NARANJA })
  let x = 30
  for (const n of nodos) { n.x = x; n.cx = x + n.ancho / 2; x += n.ancho + HUECO }
  const ancho = x, altoMax = Math.max(...nodos.map(n => n.alto)), yNo = Y0 + altoMax / 2 + 70, alto = yNo + 120
  const N = Object.fromEntries(nodos.map(n => [n.clave, n]))
  const flechas = [], etiquetas = []
  nodos.forEach((n, k) => {
    const sig = nodos[k + 1]; if (!sig) return
    flechas.push({ d: `M${n.x + n.ancho},${Y0} L${sig.x - 4},${Y0}` })
    if (n.tipo === 'rombo') etiquetas.push({ x: n.x + n.ancho + 8, y: Y0 - 8, t: 'Sí', color: SI })
  })
  // Ramas «No» de la compra (filtro, compra, orden) a «No compro hoy», que vuelve al principio.
  const ramasCompra = ['filtro', 'compra', 'orden'].map(k => N[k]).filter(Boolean)
  const cajaNo = { x: ramasCompra[0].cx - 110, ancho: Math.max(240, ramasCompra[ramasCompra.length - 1].cx - ramasCompra[0].cx + 220), y: yNo, alto: 56 }
  for (const r of ramasCompra) { flechas.push({ d: `M${r.cx},${Y0 + r.alto / 2} L${r.cx},${yNo - 4}` }); etiquetas.push({ x: r.cx + 8, y: Y0 + r.alto / 2 + 18, t: 'No', color: NO }) }
  flechas.push({ d: `M${cajaNo.x},${yNo + 28} L${N.inicio.cx},${yNo + 28} L${N.inicio.cx},${Y0 + 34}` })
  const v = N.venta, cajaSigo = { x: v.cx - 125, ancho: 250, y: yNo, alto: 56 }
  flechas.push({ d: `M${v.cx},${Y0 + v.alto / 2} L${v.cx},${yNo - 4}` }); etiquetas.push({ x: v.cx + 8, y: Y0 + v.alto / 2 + 18, t: 'No', color: NO })
  flechas.push({ d: `M${cajaSigo.x},${yNo + 28} L${N.dentro.cx},${yNo + 28} L${N.dentro.cx},${Y0 + 36}` })
  const vuelta = `M${N.vendo.cx},${Y0 - 34} L${N.vendo.cx},26 L${N.inicio.cx},26 L${N.inicio.cx},${Y0 - 34}`
  const texto = (lineas, cx, cy, color = B.titulo, peso = 600) => lineas.map((l, k) => <text key={k} x={cx} y={cy + (k - (lineas.length - 1) / 2) * LINEA + 4} textAnchor="middle" fontSize={LETRA} fontWeight={peso} fill={color}>{l}</text>)
  return (
    <div data-dibujo="ok" style={{ overflowX: 'auto', paddingBottom: 6 }}>
      <svg width={ancho} height={alto} viewBox={`0 0 ${ancho} ${alto}`} role="img" aria-label="Dibujo de la regla" style={{ display: 'block', fontFamily: B.letra }}>
        <defs><marker id="punta" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill={B.secundario}/></marker></defs>
        <path d={vuelta} fill="none" stroke={B.apagado} strokeDasharray="5 5" markerEnd="url(#punta)"/>
        <text x={(N.inicio.cx + N.vendo.cx) / 2} y={18} textAnchor="middle" fontSize={LETRA} fill={B.secundario}>después de vender, vuelvo a empezar</text>
        {flechas.map((f, k) => <path key={k} d={f.d} fill="none" stroke={B.secundario} strokeWidth="1.5" markerEnd="url(#punta)"/>)}
        {etiquetas.map((e, k) => <text key={k} x={e.x} y={e.y} fontSize={LETRA} fontWeight="700" fill={e.color}>{e.t}</text>)}
        {nodos.map(n => {
          if (n.tipo === 'ovalo') return <g key={n.clave} data-nodo={n.clave}><rect x={n.x} y={Y0 - n.alto / 2} width={n.ancho} height={n.alto} rx={n.alto / 2} fill={B.tarjeta} stroke={n.color} strokeWidth="2"/>{texto(n.texto, n.cx, Y0)}</g>
          if (n.tipo === 'caja') return <g key={n.clave} data-nodo={n.clave}><rect x={n.x} y={Y0 - n.alto / 2} width={n.ancho} height={n.alto} rx="8" fill={n.color === VERDE ? '#14301f' : B.tarjeta} stroke={n.color} strokeWidth="2"/>{texto(n.texto, n.cx, Y0)}</g>
          const top = Y0 - n.alto / 2, pts = `${n.cx},${top} ${n.x + n.ancho},${Y0} ${n.cx},${top + n.alto} ${n.x},${Y0}`
          const cab = [n.d.titulo, ...(n.d.modo ? [`(${n.d.modo})`] : [])]
          const y1 = Y0 - ((cab.length + n.filas.length) * LINEA) / 2 + LINEA / 2
          return (
            <g key={n.clave} data-nodo={n.clave}>
              <polygon points={pts} fill={B.tarjeta} stroke={n.color} strokeWidth="2"/>
              {cab.map((l, k) => <text key={'c' + k} x={n.cx} y={y1 + k * LINEA + 4} textAnchor="middle" fontSize={LETRA} fontWeight="700" fill={n.color}>{l}</text>)}
              {n.filas.map((f, k) => (
                <text key={k} x={n.cx} y={y1 + (cab.length + k) * LINEA + 4} textAnchor="middle" fontSize={LETRA - 0.5} fill={f.mas || f.menos ? B.enlace : f.color || B.texto}
                  data-mas={f.mas ? 'si' : undefined} style={f.mas || f.menos ? { cursor: 'pointer', textDecoration: 'underline' } : undefined} onClick={f.mas || f.menos ? () => alterna(n.clave) : undefined}>
                  {f.texto}{!f.mas && !f.menos && <title>{f.completo || f.texto}</title>}
                </text>
              ))}
            </g>
          )
        })}
        <g data-nodo="noCompro"><rect x={cajaNo.x} y={yNo} width={cajaNo.ancho} height={cajaNo.alto} rx="8" fill={B.fondo} stroke={B.borde}/>{texto(['No compro hoy:', 'espero a la siguiente vela'], cajaNo.x + cajaNo.ancho / 2, yNo + 28, B.secundario, 500)}</g>
        <g data-nodo="sigoDentro"><rect x={cajaSigo.x} y={yNo} width={cajaSigo.ancho} height={cajaSigo.alto} rx="8" fill={B.fondo} stroke={B.borde}/>{texto(['Sigo dentro:', 'miro la siguiente vela'], cajaSigo.x + cajaSigo.ancho / 2, yNo + 28, B.secundario, 500)}</g>
      </svg>
      {!c.venta.lineas.length && !c.venta.proteccion.length && <div style={{ color: '#ff8b8b', fontSize: 13 }}>Falta una forma de salir: una condición de venta, un stop o una salida por tiempo.</div>}
    </div>
  )
}
