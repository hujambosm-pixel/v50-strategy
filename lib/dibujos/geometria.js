// lib/dibujos/geometria.js — las CUENTAS de los dibujos sobre el gráfico de un valor (docs/builder.md §207; boceto
// bocetos/dibujar-graficos.html). Puro: no toca la red, ni React, ni lightweight-charts. La pantalla (CandleChart) solo traduce
// «índice de vela» ↔ píxel; todo lo demás sale de aquí.
//
// CÓMO SE GUARDA UN PUNTO. Por FECHA ('AAAA-MM-DD') y PRECIO, nunca por número de vela: así el mismo dibujo vale en diario y en semanal.
//   Al dibujar, el punto va siempre a una vela (la del clic, o una vela futura a la derecha de la última): fechaDeIndice redondea.
//   Al pintar, indiceDeFecha da su sitio en las velas que se ven, con decimales si la fecha cae entre dos velas (un miércoles en semanal
//   queda entre su lunes y el siguiente: 2/7 de vela más allá del lunes).
//   A la DERECHA de la última vela (el futuro) se cuenta en sesiones de lunes a viernes (diario) o en semanas (semanal); a la izquierda
//   de la primera, igual hacia atrás. Así un punto puesto en una vela futura vuelve a esa misma vela.
//
// Las fechas se tratan en UTC (sin horas): 'AAAA-MM-DD' → días desde 1970.

const DIA = 86400000
export const diasDe = (f) => Math.round(Date.parse(String(f).slice(0, 10) + 'T00:00:00Z') / DIA)
export const fechaDe = (dias) => new Date(dias * DIA).toISOString().slice(0, 10)
const esHabil = (dias) => { const s = new Date(dias * DIA).getUTCDay(); return s !== 0 && s !== 6 }

// Sesiones de lunes a viernes d con a < d ≤ b (a ≤ b, en días).
function habilesEntre(a, b) {
  if (b <= a) return 0
  const n = b - a, sem = Math.floor(n / 7)
  let c = sem * 5
  for (let d = a + sem * 7 + 1; d <= b; d++) if (esHabil(d)) c++
  return c
}
// La sesión de lunes a viernes que queda n sesiones después (n > 0) o antes (n < 0) del día `dias`.
function sumaHabiles(dias, n) {
  let d = dias, paso = n < 0 ? -1 : 1, quedan = Math.abs(n)
  while (quedan > 0) { d += paso; if (esHabil(d)) quedan-- }
  return d
}

// 'semanal' si las velas van de semana en semana (la mediana de los últimos 20 huecos es de 4 días o más); si no, 'diario'.
export function intervaloDe(fechas) {
  const n = fechas?.length || 0
  if (n < 2) return 'diario'
  const h = []
  for (let i = Math.max(1, n - 20); i < n; i++) h.push(diasDe(fechas[i]) - diasDe(fechas[i - 1]))
  h.sort((x, y) => x - y)
  return h[Math.floor(h.length / 2)] >= 4 ? 'semanal' : 'diario'
}

// Primera posición i con dias(fechas[i]) ≥ d (búsqueda binaria; fechas en orden).
function primeraNoMenor(dd, d) {
  let lo = 0, hi = dd.length
  while (lo < hi) { const m = (lo + hi) >> 1; if (dd[m] < d) lo = m + 1; else hi = m }
  return lo
}

// Prepara las fechas de las velas una vez (para no convertirlas en cada punto).
export function escala(fechas, intervalo) {
  const dd = (fechas || []).map(diasDe)
  return { dd, intervalo: intervalo || intervaloDe(fechas) }
}

// Sitio de una fecha en las velas: índice de vela, con decimales entre dos velas. null si no hay velas.
export function indiceDeFecha(esc, fecha) {
  const { dd, intervalo } = esc, n = dd.length
  if (!n) return null
  const d = diasDe(fecha)
  const ult = dd[n - 1], pri = dd[0]
  if (d > ult) return (n - 1) + (intervalo === 'semanal' ? (d - ult) / 7 : habilesEntre(ult, d))
  if (d < pri) return -(intervalo === 'semanal' ? (pri - d) / 7 : habilesEntre(d, pri))
  const i = primeraNoMenor(dd, d)
  if (dd[i] === d) return i
  return (i - 1) + (d - dd[i - 1]) / (dd[i] - dd[i - 1])
}

// Fecha de la vela `indice` (se redondea a la vela más cercana; a la derecha de la última, una vela futura).
export function fechaDeIndice(esc, indice) {
  const { dd, intervalo } = esc, n = dd.length
  if (!n || !Number.isFinite(indice)) return null
  const k = Math.round(indice)
  if (k >= 0 && k < n) return fechaDe(dd[k])
  if (k >= n) { const m = k - (n - 1); return fechaDe(intervalo === 'semanal' ? dd[n - 1] + 7 * m : sumaHabiles(dd[n - 1], m)) }
  return fechaDe(intervalo === 'semanal' ? dd[0] + 7 * k : sumaHabiles(dd[0], k))
}

// ── Rectas ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Puntos ya colocados en las velas que se ven: { i (índice de vela), p (precio) }.
// Precio de la recta que pasa por a y b en la vela i (si a y b están en la misma vela, el de a).
export function precioEnRecta(a, b, i) {
  if (a.i === b.i) return a.p
  return a.p + (b.p - a.p) * (i - a.i) / (b.i - a.i)
}
// CANAL PARALELO: la recta a–b y otra paralela que pasa por c. Devuelve los dos extremos de la paralela.
export function paralela(a, b, c) {
  const d = c.p - precioEnRecta(a, b, c.i)
  return [{ i: a.i, p: a.p + d }, { i: b.i, p: b.p + d }]
}

// ── Imán ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// El precio de la vela (apertura, máximo, mínimo o cierre) más cercano a `precio`. Vela en el formato del gráfico { open, high, low, close }.
export function iman(vela, precio) {
  if (!vela) return precio
  let mejor = precio, dist = Infinity
  for (const v of [vela.open, vela.high, vela.low, vela.close]) {
    if (!Number.isFinite(v)) continue
    const x = Math.abs(v - precio)
    if (x < dist) { dist = x; mejor = v }
  }
  return mejor
}

// ── Fibonacci ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Como TradingView: se dibuja del primer extremo (a) al segundo (b); el nivel 0 queda en b y el 1 en a.
// Ej.: de 100 (mínimo) a 150 (máximo): 0 → 150; 0,382 → 150 − 50 × 0,382 = 130,90; 0,5 → 125; 0,618 → 119,10; 1 → 100.
export const NIVELES_FIB = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1]
export function nivelesFibonacci(precioA, precioB, niveles = NIVELES_FIB) {
  return niveles.map(nivel => ({ nivel, precio: precioB + (precioA - precioB) * nivel }))
}

// ── Medir ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// De a a b: cuánto sube o baja (precio y %) y cuántas velas hay entre los dos.
export function medir(a, b) {
  const diferencia = b.p - a.p
  return { diferencia, porcentaje: a.p ? diferencia / a.p * 100 : null, velas: Math.round(Math.abs(b.i - a.i)) }
}

// ── Posición larga y corta ────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Larga: stop por debajo de la entrada y objetivo por encima. Corta: al revés.
export function posicionValida(lado, entrada, stop, objetivo) {
  if (![entrada, stop, objetivo].every(Number.isFinite)) return false
  return lado === 'corta' ? (stop > entrada && objetivo < entrada) : (stop < entrada && objetivo > entrada)
}
// Objetivo de salida al crearla: a 2 R (el doble de lo que se arriesga por acción).
export const objetivoPorDefecto = (entrada, stop, R = 2) => entrada + (entrada - stop) * R
// Cuántas acciones, arriesgando `arriesgo` € si salta el stop. Se redondea HACIA ABAJO para no pasar de lo que quieres arriesgar.
// Ej.: entrada 182,40, stop 178,00 → 4,40 por acción; 100 ÷ 4,40 = 22,7 → 22 acciones; 22 × 182,40 = 4.012,80 €; arriesgas 96,80 €.
export function accionesPorRiesgo(entrada, stop, arriesgo) {
  const r = Math.abs(entrada - stop)
  if (!(r > 0) || !(arriesgo > 0) || !(entrada > 0)) return { acciones: 0, invertido: 0, riesgo: 0 }
  const acciones = Math.floor(arriesgo / r + 1e-9)
  return { acciones, invertido: acciones * entrada, riesgo: acciones * r }
}
// Cifras de la posición: lo que gana o pierde en % por acción y la relación ganancia / riesgo (R:R).
export function cifrasPosicion(entrada, stop, objetivo) {
  const r = Math.abs(entrada - stop)
  return {
    pierdePct: Math.abs(stop - entrada) / entrada * 100,
    ganaPct: Math.abs(objetivo - entrada) / entrada * 100,
    rr: r > 0 ? Math.abs(objetivo - entrada) / r : null,
  }
}
// ¿Qué tocó antes, después de la vela de entrada? Recorre las velas desde la SIGUIENTE a la de entrada. Si en la misma vela toca el
// stop y el objetivo, cuenta el STOP (por prudencia: dentro de la vela no se sabe qué fue antes).
// velas: las del gráfico { date, high, low }; inicio: índice (entero) de la vela de entrada.
// → { que: 'stop' | 'objetivo', fecha } · { que: 'abierta' } (aún no tocó ninguno) · { que: 'futuro' } (la entrada está a la derecha de la última vela).
export function resultadoPosicion(lado, stop, objetivo, velas, inicio) {
  const n = velas?.length || 0
  const k = Math.round(inicio)
  if (k >= n - 1) return { que: k >= n ? 'futuro' : 'abierta' }
  for (let i = Math.max(0, k + 1); i < n; i++) {
    const v = velas[i]
    const tocaStop = lado === 'corta' ? v.high >= stop : v.low <= stop
    if (tocaStop) return { que: 'stop', fecha: v.date }
    const tocaObj = lado === 'corta' ? v.low <= objetivo : v.high >= objetivo
    if (tocaObj) return { que: 'objetivo', fecha: v.date }
  }
  return { que: 'abierta' }
}

// ── Lo que se guarda (tabla dibujos_grafico, §206) ────────────────────────────────────────────────────────────────────────────────────
// Cuántos puntos lleva cada tipo. «Medir» no se guarda: es de un momento.
//   tendencia: 2 · rayo (línea que se alarga hacia la derecha): 2 · horizontal: 1 · vertical: 1 · canal: 3 (la recta y un punto de la
//   paralela) · rectangulo: 2 (esquinas) · fibonacci: 2 · larga / corta: 3 (entrada, stop —su fecha marca el final de la caja— y objetivo) ·
//   texto: 1.
export const PUNTOS_DE = { tendencia: 2, rayo: 2, horizontal: 1, vertical: 1, canal: 3, rectangulo: 2, fibonacci: 2, larga: 3, corta: 3, texto: 1 }
export const MAX_DIBUJOS = 300
const FECHA = /^\d{4}-\d{2}-\d{2}$/
const COLOR = /^#[0-9a-fA-F]{6}$/

// Un dibujo tal como se guarda, o null si no vale. Se queda solo con lo conocido (lo demás se tira).
export function limpiaDibujo(d) {
  if (!d || typeof d !== 'object') return null
  const tipo = d.tipo
  if (!PUNTOS_DE[tipo]) return null
  const id = typeof d.id === 'string' && d.id.length >= 1 && d.id.length <= 40 ? d.id : null
  if (!id) return null
  const puntos = Array.isArray(d.puntos) ? d.puntos : []
  if (puntos.length !== PUNTOS_DE[tipo]) return null
  const pts = []
  for (const p of puntos) {
    if (!p || !FECHA.test(String(p.fecha)) || !Number.isFinite(p.precio) || !(p.precio > 0)) return null
    pts.push({ fecha: p.fecha, precio: p.precio })
  }
  const out = { id, tipo, puntos: pts }
  if (COLOR.test(String(d.color))) out.color = d.color
  if (Number.isInteger(d.grosor) && d.grosor >= 1 && d.grosor <= 4) out.grosor = d.grosor
  if (tipo === 'texto') out.texto = typeof d.texto === 'string' ? d.texto.slice(0, 200) : ''
  if (tipo === 'texto' && Number.isInteger(d.tam) && d.tam >= 8 && d.tam <= 48) out.tam = d.tam   // tamaño de letra (§210); sin él, 13
  if ((tipo === 'larga' || tipo === 'corta') && Number.isFinite(d.arriesgo) && d.arriesgo >= 0) out.arriesgo = d.arriesgo
  return out
}
// La lista entera: quita los que no valen y los ids repetidos (se queda el primero); como mucho MAX_DIBUJOS.
export function limpiaDibujos(lista) {
  if (!Array.isArray(lista)) return []
  const vistos = new Set(), out = []
  for (const d of lista) {
    const x = limpiaDibujo(d)
    if (!x || vistos.has(x.id)) continue
    vistos.add(x.id); out.push(x)
    if (out.length >= MAX_DIBUJOS) break
  }
  return out
}
