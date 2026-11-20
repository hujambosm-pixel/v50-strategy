// lib/dibujos/pantalla.js — QUÉ se pinta de cada dibujo y DÓNDE (docs/builder.md §208; boceto bocetos/dibujar-graficos.html, opción A).
// Puro: no toca React ni lightweight-charts. La capa (components/DibujosGrafico.js) le pasa un «conversor» cv con
//   x(i) → píxel de la vela i (con decimales; también a la derecha de la última) · y(p) → píxel del precio p
//   i(x) → vela (con decimales) del píxel x       · p(y) → precio del píxel y
//   ancho, alto: el panel de las velas (sin el eje de precios ni el de fechas) · esc: escala de fechas de lib/dibujos/geometria.js
// y recibe una lista de elementos SVG sencillos { el, a (atributos), txt? } que la capa pinta tal cual.
import { escala, indiceDeFecha, fechaDeIndice, paralela, nivelesFibonacci, PUNTOS_DE, limpiaDibujo, medir, posicionValida, objetivoPorDefecto, accionesPorRiesgo, cifrasPosicion, resultadoPosicion } from './geometria'

// ── Herramientas de la barra lateral (las de la parte 3; larga, corta y medir llegan en la parte 5) ──
export const HERRAMIENTAS = [
  { id: 'cursor', nombre: 'Cursor: elegir y mover dibujos', atajo: 'Esc' },
  { id: 'tendencia', nombre: 'Línea de tendencia', atajo: 'Alt+T', ayuda: 'clic en el inicio y clic en el fin (o arrastra)' },
  { id: 'rayo', nombre: 'Línea que se alarga hacia la derecha', atajo: 'Alt+A', ayuda: 'clic en el inicio y clic en otro punto de la línea' },
  { id: 'horizontal', nombre: 'Línea horizontal (soporte o resistencia)', atajo: 'Alt+H', ayuda: 'un clic en el precio' },
  { id: 'vertical', nombre: 'Línea vertical (una fecha)', atajo: 'Alt+V', ayuda: 'un clic en la vela' },
  { id: 'canal', nombre: 'Canal paralelo', atajo: 'Alt+C', ayuda: 'clic en el inicio y en el fin de la línea, y un tercer clic donde va la paralela' },
  { id: 'fibonacci', nombre: 'Retroceso de Fibonacci', atajo: 'Alt+F', ayuda: 'clic en un extremo del movimiento y clic en el otro (p. ej., en el mínimo y luego en el máximo)' },
  { id: 'rectangulo', nombre: 'Rectángulo (zona de precios)', atajo: 'Alt+R', ayuda: 'clic en una esquina y clic en la contraria' },
  { id: 'larga', nombre: 'Posición larga (entrada, stop y objetivo)', atajo: 'Alt+L', ayuda: 'clic en la entrada y clic en el stop (por debajo); el objetivo sale a 2 R y luego se arrastra' },
  { id: 'corta', nombre: 'Posición corta', atajo: 'Alt+S', ayuda: 'clic en la entrada y clic en el stop (por encima); el objetivo sale a 2 R y luego se arrastra' },
  { id: 'texto', nombre: 'Texto', atajo: 'Alt+X', ayuda: 'clic donde quieras escribir; Intro para terminar' },
  { id: 'medir', nombre: 'Medir (precio, % y velas)', atajo: 'Mayús + arrastrar', ayuda: 'clic en un punto y clic en otro (o arrastra; también Mayús + arrastrar con el cursor). No se guarda' },
]
// Clics que hace falta dar con cada herramienta (la posición se pone con 2: el objetivo sale solo).
export const necesita = (h) => ({ larga: 2, corta: 2, medir: 2 })[h] ?? PUNTOS_DE[h]
export const ATAJOS = { t: 'tendencia', a: 'rayo', h: 'horizontal', v: 'vertical', c: 'canal', f: 'fibonacci', r: 'rectangulo', x: 'texto', l: 'larga', s: 'corta', m: 'medir' }
export const COLORES = ['#4c9aff', '#f0b429', '#26a69a', '#ef5350', '#c792ea', '#f3f3f5']
export const COLOR_DE = { tendencia: '#4c9aff', rayo: '#4c9aff', horizontal: '#f0b429', vertical: '#9aa0ad', canal: '#4c9aff', fibonacci: '#c792ea', rectangulo: '#4c9aff', texto: '#f3f3f5', larga: '#26a69a', corta: '#ef5350' }
export const colorDe = (d) => d.color || COLOR_DE[d.tipo] || '#4c9aff'
export const grosorDe = (d) => d.grosor || 1
// Tamaños de letra del texto (§210): la barrita va de uno a otro con − y +.
export const TAMANOS_TEXTO = [10, 11, 13, 16, 20, 24, 32]
export const tamDe = (d) => d.tam || 13

let contador = 0
export const nuevoId = () => 'd' + Date.now().toString(36) + (contador++).toString(36)

// Un dibujo nuevo con sus puntos { fecha, precio }. null si no vale (lo comprueba limpiaDibujo, la misma que al guardar).
export function creaDibujo(tipo, puntos, extra = {}) {
  return limpiaDibujo({ id: extra.id || nuevoId(), tipo, puntos, ...extra })
}

// Números en español: 1.234,56.
export function num(v, dec = 2) {
  if (!Number.isFinite(v)) return '—'
  const [e, d] = Math.abs(v).toFixed(dec).split('.')
  return (v < 0 ? '−' : '') + e.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (d ? ',' + d : '')
}
export const fechaCorta = (f) => { const [a, m, d] = String(f).split('-'); return `${d}/${m}/${a}` }
// Decimales del precio: 2, o 4 por debajo de 1 € (divisas, centavos).
export const decimalesDe = (p) => (Math.abs(p) < 1 ? 4 : 2)

// Los puntos del dibujo en píxeles: { x, y, i, p }.
export function enPantalla(d, cv) {
  return d.puntos.map(pt => { const i = indiceDeFecha(cv.esc, pt.fecha); return { i, p: pt.precio, x: cv.x(i), y: cv.y(pt.precio) } })
}

// Recta por a y b alargada hasta el borde (derecho si b está a la derecha de a).
function alBorde(a, b, ancho) {
  if (Math.abs(b.x - a.x) < 1e-9) return { x: a.x, y: b.y >= a.y ? 1e5 : -1e5 }
  const xb = b.x >= a.x ? ancho : 0
  return { x: xb, y: a.y + (b.y - a.y) * (xb - a.x) / (b.x - a.x) }
}

const L = (x1, y1, x2, y2, stroke, sw = 1, extra = {}) => ({ el: 'line', a: { x1, y1, x2, y2, stroke, 'stroke-width': sw, ...extra } })

// ── Lo que se pinta ──
// → { trazos: [...] (lo visible, recortado al panel), eje: [...] (etiquetas en el eje, fuera del recorte),
//     golpe: [...] (lo invisible que recoge el ratón), asas: [{ k, x, y }] (los puntos que se arrastran) }
export function formas(d, cv, { elegido = false } = {}) {
  const col = colorDe(d), sw = grosorDe(d), P = enPantalla(d, cv), { ancho, alto } = cv
  const trazos = [], eje = [], golpe = []
  const G = (x1, y1, x2, y2) => golpe.push(L(x1, y1, x2, y2, 'transparent', 10, { 'pointer-events': 'stroke' }))
  let asas = P.map((q, k) => ({ k, x: q.x, y: q.y }))
  const [a, b, c] = P
  const dec = decimalesDe(P[0].p)
  switch (d.tipo) {
    case 'tendencia':
      trazos.push(L(a.x, a.y, b.x, b.y, col, sw)); G(a.x, a.y, b.x, b.y); break
    case 'rayo': {
      const e = alBorde(a, b, ancho)
      trazos.push(L(a.x, a.y, e.x, e.y, col, sw)); G(a.x, a.y, e.x, e.y); break
    }
    case 'horizontal':
      trazos.push(L(0, a.y, ancho, a.y, col, sw)); G(0, a.y, ancho, a.y)
      if (a.y >= 0 && a.y <= alto) eje.push({ el: 'etiqueta', a: { x: ancho, y: a.y, fondo: col, ancla: 'eje' }, txt: num(a.p, dec) })   // fuera de la vista, sin etiqueta
      asas = [{ k: 0, x: Math.min(Math.max(a.x, 12), ancho - 12), y: a.y }]; break
    case 'vertical':
      trazos.push(L(a.x, 0, a.x, alto, col, sw)); G(a.x, 0, a.x, alto)
      if (a.x >= 0 && a.x <= ancho) eje.push({ el: 'etiqueta', a: { x: a.x, y: alto, fondo: col, ancla: 'fecha' }, txt: fechaCorta(d.puntos[0].fecha) })
      asas = [{ k: 0, x: a.x, y: Math.min(Math.max(a.y, 12), alto - 12) }]; break
    case 'canal': {
      const [pa, pb] = paralela(a, b, c).map(q => ({ ...q, x: cv.x(q.i), y: cv.y(q.p) }))
      trazos.push({ el: 'polygon', a: { points: `${a.x},${a.y} ${b.x},${b.y} ${pb.x},${pb.y} ${pa.x},${pa.y}`, fill: col, 'fill-opacity': 0.08, stroke: 'none' } })
      trazos.push(L(a.x, a.y, b.x, b.y, col, sw), L(pa.x, pa.y, pb.x, pb.y, col, sw))
      trazos.push(L((a.x + pa.x) / 2, (a.y + pa.y) / 2, (b.x + pb.x) / 2, (b.y + pb.y) / 2, col, 1, { 'stroke-dasharray': '4 4', opacity: 0.5 }))
      G(a.x, a.y, b.x, b.y); G(pa.x, pa.y, pb.x, pb.y)
      asas = [{ k: 0, x: a.x, y: a.y }, { k: 1, x: b.x, y: b.y }, { k: 2, x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 }]; break
    }
    case 'rectangulo': {
      const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y), w = Math.abs(b.x - a.x), h = Math.abs(b.y - a.y)
      trazos.push({ el: 'rect', a: { x, y, width: w, height: h, fill: col, 'fill-opacity': 0.15, stroke: col, 'stroke-width': sw } })
      golpe.push({ el: 'rect', a: { x, y, width: w, height: h, fill: 'transparent', stroke: 'transparent', 'stroke-width': 10, 'pointer-events': elegido ? 'all' : 'stroke' } })
      asas = [{ k: 0, x: a.x, y: a.y }, { k: 1, x: b.x, y: b.y }]; break
    }
    case 'fibonacci': {
      const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x)
      trazos.push(L(a.x, a.y, b.x, b.y, col, 1, { 'stroke-dasharray': '3 3', opacity: 0.6 }))
      for (const n of nivelesFibonacci(a.p, b.p)) {
        const y = cv.y(n.precio)
        trazos.push(L(x0, y, x1, y, col, sw, { opacity: n.nivel === 0 || n.nivel === 1 ? 1 : 0.75 }))
        trazos.push({ el: 'text', a: { x: x0 - 4, y: y + 4, fill: col, 'font-size': 10.5, 'text-anchor': 'end' }, txt: `${String(n.nivel).replace('.', ',')} (${num(n.precio, dec)})` })
        G(x0, y, x1, y)
      }
      break
    }
    case 'larga': case 'corta': {
      const larga = d.tipo === 'larga', [e, s, o] = P
      const x0 = e.x, x1 = s.x, ent = e.p, stp = s.p, obj = o.p
      const L0 = Math.min(x0, x1), W = Math.abs(x1 - x0)
      trazos.push({ el: 'rect', a: { x: L0, y: Math.min(e.y, o.y), width: W, height: Math.abs(o.y - e.y), fill: '#26a69a', 'fill-opacity': 0.22 } })
      trazos.push({ el: 'rect', a: { x: L0, y: Math.min(e.y, s.y), width: W, height: Math.abs(s.y - e.y), fill: '#ef5350', 'fill-opacity': 0.22 } })
      trazos.push(L(L0, e.y, L0 + W, e.y, '#d0d4dc', 1.2))
      const cf = cifrasPosicion(ent, stp, obj)
      const arriba = Math.min(o.y, s.y), abajo = Math.max(o.y, s.y)
      const yObj = larga ? arriba - 5 : abajo + 17, yStp = larga ? abajo + 17 : arriba - 5
      trazos.push({ el: 'rotulo', a: { x: L0, y: yObj, fondo: '#1d6b63' }, txt: `Objetivo ${num(obj, dec)} · gana ${num(cf.ganaPct, 1)} % · ${num(cf.rr, 1)} R` })
      trazos.push({ el: 'rotulo', a: { x: L0, y: yStp, fondo: '#8a2f2d' }, txt: `Stop ${num(stp, dec)} · pierde ${num(cf.pierdePct, 1)} %` })
      let tE = `Entrada ${num(ent, dec)}`
      if (d.arriesgo > 0) { const a = accionesPorRiesgo(ent, stp, d.arriesgo); tE += ` · ${a.acciones} ${a.acciones === 1 ? 'acción' : 'acciones'} (${num(a.invertido, 0)} €) arriesgando ${num(a.riesgo, 0)} €` }
      trazos.push({ el: 'rotulo', a: { x: L0 + W + 4, y: e.y + 4, fondo: '#3a3f4b', izq: L0 }, txt: tE })
      const r = cv.velas ? resultadoPosicion(d.tipo, stp, obj, cv.velas, Math.round(e.i)) : null
      if (r && r.que !== 'futuro') {
        const txt = r.que === 'stop' ? `→ tocó el STOP el ${fechaCorta(r.fecha)}` : r.que === 'objetivo' ? `→ llegó al OBJETIVO el ${fechaCorta(r.fecha)}` : '→ aún no ha tocado ni stop ni objetivo'
        trazos.push({ el: 'text', a: { x: L0, y: (larga ? yStp : yObj) + 16, fill: r.que === 'stop' ? '#ef5350' : r.que === 'objetivo' ? '#26a69a' : '#9aa0ad', 'font-size': 11.5 }, txt })
      }
      golpe.push({ el: 'rect', a: { x: L0, y: arriba, width: W, height: abajo - arriba, fill: 'transparent', 'pointer-events': 'all' } })
      asas = [{ k: 0, x: x0, y: e.y }, { k: 1, x: x0, y: s.y }, { k: 2, x: x0, y: o.y }, { k: 3, x: x1, y: e.y }]
      break
    }
    case 'texto': {
      const t = d.texto || '', tam = tamDe(d), w = Math.max(24, t.length * tam * 0.6), alto = tam + 7
      trazos.push({ el: 'text', a: { x: a.x, y: a.y, fill: col, 'font-size': tam, 'paint-order': 'stroke', stroke: 'rgba(8,12,20,0.85)', 'stroke-width': 3 }, txt: t })
      golpe.push({ el: 'rect', a: { x: a.x - 3, y: a.y - tam - 2, width: w + 6, height: alto, fill: 'transparent', 'pointer-events': 'all' } })
      if (elegido) trazos.push({ el: 'rect', a: { x: a.x - 3, y: a.y - tam - 2, width: w + 6, height: alto, fill: 'none', stroke: col, 'stroke-width': 1, 'stroke-dasharray': '3 2' } })
      asas = []; break
    }
  }
  return { trazos, eje, golpe, asas: elegido ? asas : [] }
}

// Para la VISTA PREVIA mientras se pone un dibujo: completa los puntos que faltan con el del cursor.
export function provisional(tipo, puntos, cursor, esc = null) {
  if ((tipo === 'larga' || tipo === 'corta') && esc) return creaDibujo(tipo, colocaPosicion(tipo, puntos[0] || cursor, puntos.length ? cursor : cursor, esc), { id: 'provisional' })
  const n = PUNTOS_DE[tipo], pts = puntos.slice(0, n)
  while (pts.length < n) pts.push(cursor)
  return creaDibujo(tipo, pts, { id: 'provisional', texto: '' })
}

// ── Mover ──
// Todo el dibujo: dv velas (entero) a la derecha y dp en precio. Los precios no bajan de lo mínimo (un dibujo guardado los pide > 0).
export function mueve(d, esc, dv, dp) {
  return { ...d, puntos: d.puntos.map(pt => ({ fecha: fechaDeIndice(esc, indiceDeFecha(esc, pt.fecha) + dv), precio: Math.max(1e-6, pt.precio + dp) })) }
}
// Un punto: en la horizontal solo cambia el precio, en la vertical solo la fecha; en el canal, el 3.º es la paralela.
export function mueveAsa(d, k, pt) {
  if (d.tipo === 'larga' || d.tipo === 'corta') {
    const [e, s, o] = d.puntos
    let n
    if (k === 0) n = [{ fecha: pt.fecha < s.fecha ? pt.fecha : e.fecha, precio: pt.precio }, s, o]
    else if (k === 1) n = [e, { fecha: s.fecha, precio: pt.precio }, o]
    else if (k === 2) n = [e, s, { fecha: o.fecha, precio: pt.precio }]
    else if (pt.fecha > e.fecha) n = [e, { fecha: pt.fecha, precio: s.precio }, { fecha: pt.fecha, precio: o.precio }]
    else return d   // la caja no puede acabar antes de la entrada
    // Una posición que no vale (el stop al otro lado de la entrada…) no se acepta: se queda como estaba.
    return posicionValida(d.tipo, n[0].precio, n[1].precio, n[2].precio) ? { ...d, puntos: n } : d
  }
  const puntos = d.puntos.map((q, j) => {
    if (j !== k) return q
    if (d.tipo === 'horizontal') return { fecha: q.fecha, precio: pt.precio }
    if (d.tipo === 'vertical') return { fecha: pt.fecha, precio: q.precio }
    return { fecha: pt.fecha, precio: Math.max(1e-6, pt.precio) }
  })
  return { ...d, puntos }
}
// El asa 2 del canal se pinta en el centro de la paralela, pero lo que se guarda es UN punto por el que pasa la paralela:
// moverla equivale a poner ese punto donde está el ratón (la paralela pasa por él).

// Flechas del teclado (§210): ← → una vela (con Mayús, 10); ↑ ↓ un píxel de precio (con Mayús, 10), según la escala de ahora.
// → { dv, dpx } o null si no es una flecha.
export function pasoFlecha(key, shift) {
  const k = shift ? 10 : 1
  if (key === 'ArrowLeft') return { dv: -k, dpx: 0 }
  if (key === 'ArrowRight') return { dv: k, dpx: 0 }
  if (key === 'ArrowUp') return { dv: 0, dpx: k }
  if (key === 'ArrowDown') return { dv: 0, dpx: -k }
  return null
}
// Lo último elegido de cada tipo (color, grosor, tamaño de letra): los dibujos nuevos de ese tipo salen así (§210).
export function estiloRecordado(memo, tipo) {
  const e = memo?.[tipo] || {}, out = {}
  if (/^#[0-9a-fA-F]{6}$/.test(String(e.color))) out.color = e.color
  if (Number.isInteger(e.grosor) && e.grosor >= 1 && e.grosor <= 4) out.grosor = e.grosor
  if (tipo === 'texto' && Number.isInteger(e.tam) && e.tam >= 8 && e.tam <= 48) out.tam = e.tam
  if ((tipo === 'larga' || tipo === 'corta') && Number.isFinite(e.arriesgo) && e.arriesgo >= 0) out.arriesgo = e.arriesgo
  return out
}

// POSICIÓN al ponerla con dos clics: entrada (a) y stop (b). Si el stop cae al otro lado, se pone a un 3 % de la entrada. La caja llega
// a la vela del stop, y como poco 12 velas. El objetivo, a 2 R. Ej.: larga, entrada 100, stop 95 → objetivo 100 + 2 × 5 = 110.
export function colocaPosicion(tipo, a, b, esc) {
  const larga = tipo !== 'corta', e = a.precio
  let s = b.precio
  if (larga ? !(s < e) : !(s > e)) s = larga ? e * 0.97 : e * 1.03
  const ia = indiceDeFecha(esc, a.fecha), ib = indiceDeFecha(esc, b.fecha)
  const fin = fechaDeIndice(esc, ia + Math.max(12, Math.round(Math.abs(ib - ia))))
  return [{ fecha: a.fecha, precio: e }, { fecha: fin, precio: s }, { fecha: fin, precio: objetivoPorDefecto(e, s) }]
}
// MEDIR de a a b (puntos { fecha, precio }): caja, línea discontinua y «+12,30 (+2,10 %) · 8 velas». No se guarda.
export function formasMedir(a, b, cv) {
  const ia = indiceDeFecha(cv.esc, a.fecha), ib = indiceDeFecha(cv.esc, b.fecha)
  const x0 = cv.x(ia), x1 = cv.x(ib), y0 = cv.y(a.precio), y1 = cv.y(b.precio)
  const m = medir({ i: ia, p: a.precio }, { i: ib, p: b.precio }), sube = m.diferencia >= 0, col = sube ? '#26a69a' : '#ef5350'
  const dec = decimalesDe(a.precio), signo = sube ? '+' : '−'
  const txt = `${signo}${num(Math.abs(m.diferencia), dec)} (${signo}${num(Math.abs(m.porcentaje), 2)} %) · ${m.velas} velas`
  return { txt, trazos: [
    { el: 'rect', a: { x: Math.min(x0, x1), y: Math.min(y0, y1), width: Math.abs(x1 - x0), height: Math.abs(y1 - y0), fill: col, 'fill-opacity': 0.15 } },
    L(x0, y0, x1, y1, col, 1.5, { 'stroke-dasharray': '5 3' }),
    { el: 'rotulo', a: { x: Math.min(x0, x1), y: sube ? Math.min(y0, y1) - 6 : Math.max(y0, y1) + 18, fondo: sube ? '#1d6b63' : '#8a2f2d' }, txt },
  ] }
}

// Duplicar: la copia, 5 velas más a la derecha.
export const duplica = (d, esc) => ({ ...mueve(d, esc, 5, 0), id: nuevoId() })

export { escala }
