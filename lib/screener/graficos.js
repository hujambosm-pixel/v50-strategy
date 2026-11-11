// lib/screener/graficos.js — los minigráficos de la pestaña «Charts» del screener (docs/screener.md §22; boceto
// bocetos/screener-charts-custom.html, decidido con Sergi el 10/11 y el 11/11). Lógica PURA: de las velas DIARIAS guardadas
// (las mismas de «Actualizar precios», 5 años) a lo que se dibuja. Ninguna cifra del screener cambia.
//
//   · Diario = las últimas 126 velas (6 meses) · Semanal = 104 (2 años; semanas de lunes a viernes, lib/velasSemanales.js,
//     fechadas en su lunes) · Mensual = 60 (5 años; cada mes, fechado en su primera sesión).
//   · Las EMA 200, 50 y 20 se calculan SIEMPRE con las velas diarias (media() de lib/condiciones/indicadores.js, la del Builder y
//     la del filtro): en una vela semanal o mensual, la línea vale lo que valía la EMA diaria en su último día. Así la EMA 200 del
//     gráfico es la misma del filtro «Precio frente a la EMA 200».
import { media } from '../condiciones/indicadores'
import { lunesDeSemana, semanalesDesdeDiarias } from '../velasSemanales'
import { fmt } from './filtros'

export const MARCOS = Object.freeze({
  diario: { velas: 126, texto: '6 meses', boton: 'Diario' },
  semanal: { velas: 104, texto: '2 años', boton: 'Semanal' },
  mensual: { velas: 60, texto: '5 años', boton: 'Mensual' },
})
// Los ajustes de «Charts» que se guardan con la vista (vista.charts). cifras: las de debajo de cada gráfico (ids de
// lib/screener/columnas.js) o null = las de los filtros encendidos.
export const CHARTS_POR_DEFECTO = Object.freeze({ tam: 'grande', tipo: 'velas', marco: 'semanal', ema200: true, ema50: true, ema20: false, vol: true, cifras: null })
export function normalizaCharts(c, limpiaCifras) {
  const d = CHARTS_POR_DEFECTO, x = c && typeof c === 'object' ? c : {}
  const si = (k) => typeof x[k] === 'boolean' ? x[k] : d[k]
  return {
    tam: x.tam === 'peq' ? 'peq' : 'grande', tipo: x.tipo === 'linea' ? 'linea' : 'velas', marco: MARCOS[x.marco] ? x.marco : d.marco,
    ema200: si('ema200'), ema50: si('ema50'), ema20: si('ema20'), vol: si('vol'), cifras: limpiaCifras ? limpiaCifras(x.cifras) : null,
  }
}

const finito = (n) => typeof n === 'number' && Number.isFinite(n)
// Las velas que sirven (como tecnicoDe: con fecha y cierre > 0).
export const velasValidas = (diarias) => (diarias || []).filter(x => x && x.date && finito(x.close) && x.close > 0)

// Agrupa las diarias en velas de su marco. Cada vela: { date (inicio), fin (último día), o, h, l, c, vol, i (índice de su último
// día en las diarias) }.
function agrupa(d, marco) {
  if (marco === 'diario') return d.map((x, i) => ({ date: x.date, fin: x.date, o: x.open ?? x.close, h: x.high ?? x.close, l: x.low ?? x.close, c: x.close, vol: Number(x.volume) || 0, i }))
  if (marco === 'semanal') {
    const sem = semanalesDesdeDiarias(d), ult = new Map()
    d.forEach((x, i) => ult.set(lunesDeSemana(x.date), i))
    return sem.map(s => ({ date: s.date, fin: d[ult.get(s.date)].date, o: s.open, h: s.high, l: s.low, c: s.close, vol: s.volume, i: ult.get(s.date) }))
  }
  const out = []
  d.forEach((x, i) => {
    const k = x.date.slice(0, 7), a = out[out.length - 1], h = x.high ?? x.close, l = x.low ?? x.close
    if (!a || a.k !== k) { out.push({ k, date: x.date, fin: x.date, o: x.open ?? x.close, h, l, c: x.close, vol: Number(x.volume) || 0, i }); return }
    a.fin = x.date; a.h = Math.max(a.h, h); a.l = Math.min(a.l, l); a.c = x.close; a.vol += Number(x.volume) || 0; a.i = i
  })
  return out.map(({ k, ...v }) => v)
}

// Lo que se dibuja: las últimas N velas del marco, cada una con las EMA de su último día; y el cambio del último día (%).
export function velasGrafico(diarias, marco = 'semanal') {
  const d = velasValidas(diarias)
  if (!d.length) return { velas: [], cambio: null, ultimo: null }
  const e200 = media(d, 'EMA', 200), e50 = media(d, 'EMA', 50), e20 = media(d, 'EMA', 20)
  const todas = agrupa(d, MARCOS[marco] ? marco : 'semanal')
  const velas = todas.slice(-MARCOS[MARCOS[marco] ? marco : 'semanal'].velas).map(v => ({ ...v, e200: e200[v.i] ?? null, e50: e50[v.i] ?? null, e20: e20[v.i] ?? null }))
  const n = d.length
  return { velas, cambio: n > 1 ? (d[n - 1].close / d[n - 2].close - 1) * 100 : null, ultimo: d[n - 1] }
}

// Un paso «bonito» para las rayas del precio (1, 2, 2,5 o 5 × 10^k) con unas `cuantas` rayas.
export function pasoBonito(rango, cuantas = 3) {
  if (!(rango > 0)) return 1
  const bruto = rango / cuantas, p = Math.pow(10, Math.floor(Math.log10(bruto))), r = bruto / p
  return (r <= 1 ? 1 : r <= 2 ? 2 : r <= 2.5 ? 2.5 : r <= 5 ? 5 : 10) * p
}
const decimales = (paso) => paso >= 1 ? 0 : paso >= 0.1 ? 1 : 2

// La geometría: W × H (unidades del viewBox), eje de precios a la IZQUIERDA (ejeY, pedido por Sergi el 11/11; las velas van de
// ejeY a W), arriba un hueco para la leyenda (leyenda: su alto, 0 si no hay), fechas abajo (alto de 12 si las hay) y volumen
// (18 % de lo que queda) encima de las fechas. Devuelve { x(i), y(p), precioDe(y), paso, ancho, arriba, abajo, rayas: [{ p, y, t }], … }.
export function geometria(velas, ajustes, W, H, conFechas = true, leyenda = 0) {
  const ejeY = 40, fechas = conFechas ? 12 : 0, ancho = W - ejeY
  const volH = ajustes.vol ? Math.round((H - fechas) * 0.18) : 0
  const arriba = 4 + leyenda, abajo = H - fechas - volH - 2
  const ves = (v) => [v.h, v.l, ...(ajustes.ema200 ? [v.e200] : []), ...(ajustes.ema50 ? [v.e50] : []), ...(ajustes.ema20 ? [v.e20] : [])].filter(finito)
  let mx = -Infinity, mn = Infinity
  for (const v of velas) for (const p of ves(v)) { if (p > mx) mx = p; if (p < mn) mn = p }
  if (!(mx > mn)) { const c = finito(mx) ? mx : 1; mx = c * 1.01; mn = c * 0.99 }
  const margen = (mx - mn) * 0.04; mx += margen; mn -= margen
  const y = (p) => arriba + (mx - p) / (mx - mn) * (abajo - arriba)
  const precioDe = (yy) => mx - (yy - arriba) / (abajo - arriba) * (mx - mn)
  const paso = ancho / Math.max(1, velas.length)
  const x = (i) => ejeY + i * paso + paso / 2
  const pr = pasoBonito(mx - mn, 3), dec = decimales(pr), rayas = []
  for (let p = Math.ceil(mn / pr) * pr; p <= mx + 1e-9; p += pr) rayas.push({ p, y: y(p), t: fmt(p, dec) })
  let volMax = 0; for (const v of velas) if (v.vol > volMax) volMax = v.vol
  const volY = (vol) => volMax > 0 ? vol / volMax * volH : 0
  return { W, H, ejeY, ancho, arriba, abajo, fechas, volH, volBase: H - fechas, mx, mn, y, precioDe, paso, x, rayas, dec, volY }
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const INICIALES = ['E', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']
// Las fechas debajo del gráfico (decidido el 11/11): los años siempre; en «Grandes», además, los meses (diario) o la inicial del
// mes cada trimestre (semanal: A, J, O). Se compara la fecha de INICIO de cada vela: la semana de año nuevo empieza en diciembre y
// es de diciembre (el año nuevo sale en la primera semana que empieza en enero). Devuelve [{ i, t, anio }].
export function marcasFecha(velas, marco, grande) {
  const out = []
  for (let i = 1; i < velas.length; i++) {
    const a = velas[i - 1].date, b = velas[i].date
    const ya = a.slice(0, 4), yb = b.slice(0, 4), ma = Number(a.slice(5, 7)) - 1, mb = Number(b.slice(5, 7)) - 1
    if (yb !== ya) { out.push({ i, t: yb, anio: true }); continue }
    if (!grande || ma === mb) continue
    if (marco === 'diario') out.push({ i, t: MESES[mb], anio: false })
    else if (marco === 'semanal' && mb % 3 === 0) out.push({ i, t: INICIALES[mb], anio: false })
  }
  return out
}
// La fecha de una vela en la cruz: diario «05/01/2026», semanal «sem. 05/01/2026», mensual «ene 2026».
export function textoFecha(v, marco) {
  const [yy, mm, dd] = v.date.split('-')
  if (marco === 'mensual') return `${MESES[Number(mm) - 1]} ${yy}`
  return (marco === 'semanal' ? 'sem. ' : '') + `${dd}/${mm}/${yy}`
}
// Los decimales de un precio en la leyenda.
export const decPrecio = (p) => !finito(p) ? 2 : p >= 1000 ? 0 : 2
