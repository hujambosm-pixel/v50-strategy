// components/BuilderDibujo.js — «Dibujo de la regla» del paso 1 (V9.1050; docs/builder.md, §16): un diagrama de flujo HORIZONTAL,
// de izquierda a derecha, dibujado SIEMPRE a partir de la regla de la pantalla (las mismas lecturas de las tarjetas,
// lib/builder/tarjetas.js; nunca con IA). Cada vela, al cierre → 1 · FILTRO (si hay) → 2 · COMPRO SI → [¿Llega al máximo de la
// señal?] → Compro → Tengo la acción → 3 · VENDO SI → Vendo. Ramas «No» hacia abajo; la vuelta al principio, discontinua.
// En cada rombo, como mucho 3 condiciones; si hay más, «y N más», que se despliega al pulsarlo. V9.1061: se adapta al ancho de la
// tarjeta: cada rombo y cada caja, a la medida de su texto (nada se sale); si no cabe en una fila, en dos (la compra arriba y lo que
// pasa con la acción abajo, unidas por una flecha); y si tampoco, se encoge un poco o hace scroll.
import { useState, useEffect, useRef } from 'react'
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
    compra: { titulo: `${filtro.ok && filtro.filas.length ? 2 : 1} · COMPRO SI`, modo: compra.filas.length > 1 ? (compra.modo === 'alguna' ? 'AL MENOS UNA' : 'TODAS') : null, lineas: compra.ok ? ((orden.modo === 'ruptura' || orden.modo === 'swing' || orden.modo === 'lineaBajista') && !compra.filas.length ? [{ texto: 'siempre: la orden está puesta en cada vela' }] : lineas(compra.filas)) : [{ texto: 'la regla de compra del Editor clásico' }] },
    // V9.1055: la orden en el nivel de ruptura, su rombo.
    // V9.1059: la orden en el último máximo de swing, su rombo. V9.1077: y la orden en la línea de tendencia bajista.
    orden: orden.modo === 'lineaBajista' ? { titulo: `¿Supera la línea de tendencia bajista (swing ${v[String(orden.izquierda).slice(1)] ?? orden.izquierda}/${v[String(orden.derecha).slice(1)] ?? orden.derecha}, máximos de las ${v[String(orden.velas).slice(1)] ?? orden.velas} últimas velas)?`, modo: null, lineas: [{ texto: 'compro en la línea; si la vela abre ya por encima, a la apertura' }, { texto: orden.siSube === 'invalidar' ? 'si el último máximo sube, no hay línea' : 'si el último máximo sube, se une con el anterior más alto' }, { texto: 'cada línea, una sola vez' }] }
    : orden.modo === 'swing' ? { titulo: `¿Supera el último máximo de swing (${v[String(orden.izquierda).slice(1)] ?? orden.izquierda}/${v[String(orden.derecha).slice(1)] ?? orden.derecha}) confirmado?`, modo: null, lineas: [{ texto: 'compro a ese nivel; si la vela abre ya por encima, a la apertura' }, { texto: 'cada swing, una sola vez' }] }
    : orden.modo === 'ruptura' ? { titulo: `¿Supera el máximo de las ${v[String(orden.velas).slice(1)] ?? orden.velas} velas anteriores?`, modo: null, lineas: [{ texto: 'compro a ese nivel; si la vela abre ya por encima, a la apertura' }] }
    : orden.modo === 'maximo' ? { titulo: '¿Llega al máximo de la señal?', modo: null, lineas: [
      ...(ajuste ? [{ texto: `si no llega, la orden ${ajuste}` }] : []),
      ...(orden.cancelar ? [{ texto: `se cancela si ${fraseFila(orden.cancelar, v)}` }] : []),
    ] } : null,
    venta: { titulo: `${filtro.ok && filtro.filas.length ? 3 : 2} · VENDO SI`, modo: venta.filas.length > 1 ? (venta.modo === 'todas' ? 'TODAS' : 'BASTA UNA') : null, lineas: venta.ok ? lineas(venta.filas) : [], proteccion },
    compro: orden.modo === 'lineaBajista' ? 'Compro en la línea de tendencia bajista' : orden.modo === 'swing' ? 'Compro en el último máximo de swing' : orden.modo === 'ruptura' ? 'Compro en el nivel de ruptura' : orden.modo === 'maximo' ? 'Compro en el máximo de la señal' : 'Compro a la apertura de la vela siguiente',
  }
}

// Un texto partido en líneas de como mucho n caracteres.
function parte(texto, n) {
  const out = []; let l = ''
  for (const w of texto.split(' ')) { if ((l + ' ' + w).trim().length > n && l) { out.push(l); l = w } else l = (l + ' ' + w).trim() }
  if (l) out.push(l)
  return out
}

// V9.1061: lo que ocupa un texto a LETRA px (una estimación por letra, un poco por arriba, para que nada se salga de su forma).
export function anchoTexto(t, tam = LETRA, negrita = false) {
  let w = 0
  for (const ch of String(t)) w += /[il.,:;'|!·]/.test(ch) ? 0.3 : /[fjtrI()[\]/ ]/.test(ch) ? 0.38 : /[mwMW]/.test(ch) ? 0.9 : /[A-ZÁÉÍÓÚÑ¿?%=>+]/.test(ch) ? 0.7 : /[0-9]/.test(ch) ? 0.62 : 0.58
  return w * tam * (negrita ? 1.08 : 1)
}
// El tamaño de un rombo para que TODAS sus líneas queden dentro: la línea a dy del centro tiene sitio para W · (1 − 2(|dy| + e) / H)
// (e: medio alto de letra). Se prueba con varios altos y se queda el que menos ocupa (W + peso · H: con peso alto, rombos más planos).
const MARGEN_ROMBO = 10, MEDIA_LETRA = 7
export function tamanoRombo(anchos, peso = 0.5) {
  const n = anchos.length, alcance = ((n - 1) / 2) * LINEA + MEDIA_LETRA
  let mejor = null
  for (let H = Math.max(110, Math.ceil(2 * alcance + 36)); H <= 640; H += 10) {
    const W = Math.max(170, ...anchos.map((w, k) => (w + 2 * MARGEN_ROMBO) / (1 - 2 * (Math.abs((k - (n - 1) / 2) * LINEA) + MEDIA_LETRA) / H)))
    if (!mejor || W + peso * H < mejor.ancho + peso * mejor.alto) mejor = { ancho: Math.ceil(W), alto: H }
  }
  return mejor
}

// La colocación (pura): los nodos, en una fila o en dos (la compra arriba; lo que pasa con la acción abajo), con los textos partidos
// para que quepan en anchoDisp. Prueba, en este orden: una fila; partida antes de «Compro»; partida antes de «Tengo la acción»; y lo
// mismo con menos hueco entre formas y con los textos más estrechos. Si nada cabe, la más estrecha (y el SVG se encoge un poco o hace
// scroll).
const MARGEN = 30
export function colocaDibujo(c, { expandidos = new Set(), anchoDisp = 1200 } = {}) {
  const intentos = []
  for (const ancho of [40, 32, 26, 22]) for (const peso of [1.5, 0.5]) for (const hueco of [56, 36]) for (const corte of ancho === 40 ? [null, 'compro', 'dentro'] : ['compro', 'dentro']) intentos.push({ ancho, peso, hueco, corte })
  let elegido = null
  for (const it of intentos) {
    const d = construye(c, expandidos, it.ancho, it.corte, it.hueco, it.peso)
    if (d.ancho <= anchoDisp) { elegido = d; break }
    if (!elegido || d.ancho < elegido.ancho) elegido = d
  }
  return elegido
}
const CAJA_NO = 44
function construye(c, expandidos, anchoLinea, corte, HUECO, peso) {
  const nodos = []
  const maxLineas = anchoLinea >= 40 ? 2 : 3
  const rombo = (clave, d, color) => {
    if (!d) return
    const visibles = expandidos.has(clave) ? d.lineas : d.lineas.slice(0, MAX), mas = d.lineas.length - visibles.length
    // Cada condición, en líneas de como mucho anchoLinea letras (si no cabe, «…» y el texto entero al pasar el ratón).
    const enLineas = (x) => { const ls = parte(x.texto, anchoLinea), pocas = ls.slice(0, maxLineas); if (ls.length > maxLineas) pocas[maxLineas - 1] = corta(pocas[maxLineas - 1] + ' ' + ls.slice(maxLineas).join(' '), anchoLinea); return pocas.map((t, k) => ({ ...x, texto: t, completo: x.texto, sigue: k > 0 })) }
    const filas = [...visibles.flatMap(enLineas), ...(mas > 0 ? [{ texto: `y ${mas} más`, mas: true }] : []), ...(expandidos.has(clave) && d.lineas.length > MAX ? [{ texto: 'ver menos', menos: true }] : []), ...(d.proteccion || []).flatMap(enLineas)]
    const cab = [...parte(d.titulo, Math.max(20, anchoLinea - 6)), ...(d.modo ? [`(${d.modo})`] : [])]
    const t = tamanoRombo([...cab.map(l => anchoTexto(l, LETRA, true)), ...filas.map(f => anchoTexto(f.texto, LETRA - 0.5))], peso)
    nodos.push({ clave, tipo: 'rombo', color, ...t, d, cab, filas })
  }
  const caja = (clave, tipo, texto, color, minimo) => {
    const ancho = Math.max(minimo, Math.ceil(Math.max(...texto.map(l => anchoTexto(l, LETRA, true))) + (tipo === 'ovalo' ? 56 : 28)))
    nodos.push({ clave, tipo, ancho, alto: tipo === 'ovalo' && texto.length < 3 ? 60 : 24 + texto.length * LINEA + 16, texto, color })
  }
  caja('inicio', 'ovalo', ['Cada vela,', 'al cierre'], GRIS, 120)
  rombo('filtro', c.filtro, MORADO)
  rombo('compra', c.compra, AZUL)
  rombo('orden', c.orden, GRIS)
  caja('compro', 'caja', parte(c.compro, 22), VERDE, 170)
  caja('dentro', 'caja', ['Tengo la acción'], GRIS, 150)
  rombo('venta', c.venta, NARANJA)
  caja('vendo', 'ovalo', parte('Vendo a la apertura de la vela siguiente', 22), NARANJA, 190)
  // Las filas.
  const k = corte ? nodos.findIndex(n => n.clave === corte) : -1
  const filas = k > 0 ? [nodos.slice(0, k), nodos.slice(k)] : [nodos]
  let anchoFilas = 0
  for (const fila of filas) { let x = MARGEN; for (const n of fila) { n.x = x; n.cx = x + n.ancho / 2; x += n.ancho + HUECO } anchoFilas = Math.max(anchoFilas, x - HUECO + MARGEN) }
  const dos = filas.length > 1
  const ancho = anchoFilas
  const N = Object.fromEntries(nodos.map(n => [n.clave, n]))
  const ramasCompra = ['filtro', 'compra', 'orden'].map(x => N[x]).filter(Boolean)
  // Las alturas: cada fila centrada en su Y; debajo de cada una, sus cajas del «No».
  const f1 = filas[0], alto1 = Math.max(...f1.map(n => n.alto)), Y0 = 50 + alto1 / 2, yNo1 = Y0 + alto1 / 2 + 36
  let Y1 = Y0, yNo2 = yNo1
  if (dos) { const alto2 = Math.max(...filas[1].map(n => n.alto)); Y1 = yNo1 + CAJA_NO + 44 + alto2 / 2; yNo2 = Y1 + alto2 / 2 + 36 }
  for (const n of f1) n.y = Y0
  if (dos) for (const n of filas[1]) n.y = Y1
  const yVuelta = yNo2 + CAJA_NO + 26, alto = dos ? yVuelta + 20 : yNo2 + CAJA_NO + 24
  const flechas = [], etiquetas = []
  for (const fila of filas) fila.forEach((n, j) => {
    const sig = fila[j + 1]; if (!sig) return
    flechas.push({ d: `M${n.x + n.ancho},${n.y} L${sig.x - 4},${sig.y}` })
    if (n.tipo === 'rombo') etiquetas.push({ x: n.x + n.ancho + 8, y: n.y - 8, t: 'Sí', color: SI })
  })
  // De una fila a la otra: a la derecha del último de arriba, baja por el pasillo y entra por arriba en el primero de abajo.
  let xPaso = null
  if (dos) {
    const ult = f1[f1.length - 1], pri = filas[1][0], yPasillo = yNo1 + CAJA_NO + 22
    xPaso = ult.x + ult.ancho + 24
    flechas.push({ d: `M${ult.x + ult.ancho},${Y0} L${xPaso},${Y0} L${xPaso},${yPasillo} L${pri.cx},${yPasillo} L${pri.cx},${Y1 - pri.alto / 2 - 4}`, paso: true })
    if (ult.tipo === 'rombo') etiquetas.push({ x: ult.x + ult.ancho + 6, y: Y0 - 8, t: 'Sí', color: SI })
  }
  // Ramas «No» de la compra (filtro, compra, orden) a «No compro hoy», que vuelve al principio.
  const izq = ramasCompra[0].cx - 110, der0 = Math.max(ramasCompra[0].cx + 130, ramasCompra[ramasCompra.length - 1].cx + 110)
  const der = xPaso != null && ramasCompra.includes(f1[f1.length - 1]) ? Math.min(der0, xPaso - 12) : der0
  const cajaNo = { x: izq, ancho: der - izq, y: yNo1, alto: CAJA_NO }
  for (const r of ramasCompra) { flechas.push({ d: `M${r.cx},${Y0 + r.alto / 2} L${r.cx},${yNo1 - 4}` }); etiquetas.push({ x: r.cx + 8, y: Y0 + r.alto / 2 + 18, t: 'No', color: NO }) }
  flechas.push({ d: `M${cajaNo.x},${yNo1 + CAJA_NO / 2} L${N.inicio.cx},${yNo1 + CAJA_NO / 2} L${N.inicio.cx},${Y0 + N.inicio.alto / 2 + 2}` })
  const v = N.venta, cajaSigo = { x: v.cx - 125, ancho: 250, y: yNo2, alto: CAJA_NO }
  flechas.push({ d: `M${v.cx},${v.y + v.alto / 2} L${v.cx},${yNo2 - 4}` }); etiquetas.push({ x: v.cx + 8, y: v.y + v.alto / 2 + 18, t: 'No', color: NO })
  flechas.push({ d: `M${cajaSigo.x},${yNo2 + CAJA_NO / 2} L${N.dentro.cx},${yNo2 + CAJA_NO / 2} L${N.dentro.cx},${N.dentro.y + N.dentro.alto / 2 + 4}` })
  // La vuelta al principio, discontinua: en una fila, por arriba; en dos, por debajo de todo y subiendo por el borde izquierdo.
  const ve = N.vendo
  const vuelta = dos ? `M${ve.cx},${ve.y + ve.alto / 2} L${ve.cx},${yVuelta} L12,${yVuelta} L12,26 L${N.inicio.cx},26 L${N.inicio.cx},${Y0 - N.inicio.alto / 2 - 4}`
    : `M${ve.cx},${Y0 - ve.alto / 2} L${ve.cx},26 L${N.inicio.cx},26 L${N.inicio.cx},${Y0 - N.inicio.alto / 2 - 4}`
  const textoVuelta = dos ? { x: (12 + ve.cx) / 2, y: yVuelta - 7 } : { x: (N.inicio.cx + ve.cx) / 2, y: 18 }
  return { nodos, filas: filas.map(f => f.map(n => n.clave)), ancho, alto, flechas, etiquetas, cajaNo, cajaSigo, vuelta, textoVuelta, anchoLinea, hueco: HUECO, corte: dos ? corte : null }
}

export default function BuilderDibujo({ def, valores, error = null, expandidosInicial = null, anchoInicial = 1200 }) {
  const [expandidos, setExpandidos] = useState(() => new Set(expandidosInicial || []))
  const [anchoDisp, setAnchoDisp] = useState(anchoInicial)
  const caja = useRef(null)
  // El ancho disponible (el de la tarjeta), medido en el navegador.
  useEffect(() => {
    const el = caja.current; if (!el) return
    const mide = () => { const w = Math.floor(el.clientWidth); if (w > 0) setAnchoDisp(x => Math.abs(x - w) < 2 ? x : w) }
    mide()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(mide) : null
    ro?.observe(el)
    return () => ro?.disconnect()
  }, [error])
  if (error) return <div data-dibujo="error" style={{ color: '#ff8b8b', padding: '12px 4px' }}>{error}</div>
  const c = contenidoDibujo(def, valores)
  const alterna = (k) => setExpandidos(s => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n })
  const L = colocaDibujo(c, { expandidos, anchoDisp })
  const { ancho, alto, cajaNo, cajaSigo } = L
  const texto = (lineas, cx, cy, color = B.titulo, peso = 600) => lineas.map((l, k) => <text key={k} x={cx} y={cy + (k - (lineas.length - 1) / 2) * LINEA + 4} textAnchor="middle" fontSize={LETRA} fontWeight={peso} fill={color}>{l}</text>)
  return (
    <div ref={caja} data-dibujo="ok" data-filas-dibujo={L.filas.length} style={{ overflowX: ancho * 0.8 > anchoDisp ? 'auto' : 'hidden', paddingBottom: 6 }}>
      {/* Si no cabe del todo, se encoge (hasta el 80 %); más estrecho que eso, scroll. */}
      <svg width={ancho} height={alto} viewBox={`0 0 ${ancho} ${alto}`} role="img" aria-label="Dibujo de la regla" data-ancho-dibujo={ancho}
        style={{ display: 'block', fontFamily: B.letra, width: '100%', maxWidth: ancho, minWidth: Math.ceil(ancho * 0.8), height: 'auto' }}>
        <defs><marker id="punta" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill={B.secundario}/></marker></defs>
        <path d={L.vuelta} fill="none" stroke={B.apagado} strokeDasharray="5 5" markerEnd="url(#punta)"/>
        <text x={L.textoVuelta.x} y={L.textoVuelta.y} textAnchor="middle" fontSize={LETRA} fill={B.secundario}>después de vender, vuelvo a empezar</text>
        {L.flechas.map((f, k) => <path key={k} d={f.d} data-flecha={f.paso ? 'paso' : undefined} fill="none" stroke={f.paso ? B.titulo : B.secundario} strokeWidth={f.paso ? 2 : 1.5} markerEnd="url(#punta)"/>)}
        {L.etiquetas.map((e, k) => <text key={k} x={e.x} y={e.y} fontSize={LETRA} fontWeight="700" fill={e.color}>{e.t}</text>)}
        {L.nodos.map(n => {
          if (n.tipo === 'ovalo') return <g key={n.clave} data-nodo={n.clave}><rect x={n.x} y={n.y - n.alto / 2} width={n.ancho} height={n.alto} rx={Math.min(n.alto, n.ancho) / 2} fill={B.tarjeta} stroke={n.color} strokeWidth="2"/>{texto(n.texto, n.cx, n.y)}</g>
          if (n.tipo === 'caja') return <g key={n.clave} data-nodo={n.clave}><rect x={n.x} y={n.y - n.alto / 2} width={n.ancho} height={n.alto} rx="8" fill={n.color === VERDE ? '#14301f' : B.tarjeta} stroke={n.color} strokeWidth="2"/>{texto(n.texto, n.cx, n.y)}</g>
          const top = n.y - n.alto / 2, pts = `${n.cx},${top} ${n.x + n.ancho},${n.y} ${n.cx},${top + n.alto} ${n.x},${n.y}`
          const total = n.cab.length + n.filas.length, y1 = n.y - ((total - 1) * LINEA) / 2
          return (
            <g key={n.clave} data-nodo={n.clave}>
              <polygon points={pts} fill={B.tarjeta} stroke={n.color} strokeWidth="2"/>
              {n.cab.map((l, k) => <text key={'c' + k} x={n.cx} y={y1 + k * LINEA + 4} textAnchor="middle" fontSize={LETRA} fontWeight="700" fill={n.color}>{l}</text>)}
              {n.filas.map((f, k) => (
                <text key={k} x={n.cx} y={y1 + (n.cab.length + k) * LINEA + 4} textAnchor="middle" fontSize={LETRA - 0.5} fill={f.mas || f.menos ? B.enlace : f.color || B.texto}
                  data-mas={f.mas ? 'si' : undefined} style={f.mas || f.menos ? { cursor: 'pointer', textDecoration: 'underline' } : undefined} onClick={f.mas || f.menos ? () => alterna(n.clave) : undefined}>
                  {f.texto}{!f.mas && !f.menos && <title>{f.completo || f.texto}</title>}
                </text>
              ))}
            </g>
          )
        })}
        <g data-nodo="noCompro"><rect x={cajaNo.x} y={cajaNo.y} width={cajaNo.ancho} height={cajaNo.alto} rx="8" fill={B.fondo} stroke={B.borde}/>{texto(['No compro hoy:', 'espero a la siguiente vela'], cajaNo.x + cajaNo.ancho / 2, cajaNo.y + cajaNo.alto / 2, B.secundario, 500)}</g>
        <g data-nodo="sigoDentro"><rect x={cajaSigo.x} y={cajaSigo.y} width={cajaSigo.ancho} height={cajaSigo.alto} rx="8" fill={B.fondo} stroke={B.borde}/>{texto(['Sigo dentro:', 'miro la siguiente vela'], cajaSigo.x + cajaSigo.ancho / 2, cajaSigo.y + cajaSigo.alto / 2, B.secundario, 500)}</g>
      </svg>
      {!c.venta.lineas.length && !c.venta.proteccion.length && <div style={{ color: '#ff8b8b', fontSize: 13 }}>Falta una forma de salir: una condición de venta, un stop o una salida por tiempo.</div>}
    </div>
  )
}
