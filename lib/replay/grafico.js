// lib/replay/grafico.js — las cuentas del modo Replay en el gráfico grande de un valor (docs/builder.md §226). PURO.
// El gráfico recibe solo las velas hasta «hoy» (así las medias, el RSI y cualquier indicador se calculan sin ver el futuro), y al avanzar
// la ventana visible se desplaza con él (misma anchura, pegada a la última vela).

// Las velas hasta hoy (incluida).
export const recortaVelas = (velas, hoy) => (Array.isArray(velas) && hoy ? velas.filter(v => v.date <= hoy) : velas)

// La vela en la que empieza: la última que hay en esa fecha o antes (nunca la primera ni la última de todas: tiene que quedar algo
// que ver antes y algo que descubrir después). null si hay menos de 3 velas.
export function velaDeInicio(velas, fecha) {
  if (!Array.isArray(velas) || velas.length < 3) return null
  let i = velas.length - 1
  while (i > 0 && velas[i].date > fecha) i--
  i = Math.min(Math.max(i, 1), velas.length - 2)
  return velas[i].date
}

// Inicio propuesto: hace N años desde la última vela (por defecto 1).
export function inicioHace(velas, anos = 1) {
  if (!Array.isArray(velas) || !velas.length) return null
  const f = new Date(velas[velas.length - 1].date + 'T12:00:00Z')
  f.setUTCFullYear(f.getUTCFullYear() - anos)
  return velaDeInicio(velas, f.toISOString().slice(0, 10))
}

// Inicio al azar: deja como poco 100 velas antes (para ver la historia) y 60 después (para tener algo que operar); si no caben, en medio.
export function inicioAlAzar(velas, azar = Math.random) {
  if (!Array.isArray(velas) || velas.length < 3) return null
  const n = velas.length, lo = Math.min(100, Math.floor(n / 3)), hi = Math.max(lo, n - 1 - Math.min(60, Math.floor(n / 3)))
  return velas[Math.min(n - 2, Math.max(1, lo + Math.floor(azar() * (hi - lo + 1))))].date
}

const masDias = (f, n) => { const d = new Date(f + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const dias = (a, b) => Math.round((new Date(b + 'T12:00:00Z') - new Date(a + 'T12:00:00Z')) / 86400000)

// Al pasar de la vela «de» a la vela «a», la ventana visible se mueve los mismos días (misma anchura).
export function desplazaRango(rango, de, a) {
  if (!rango || !rango.from || !rango.to || !de || !a) return rango
  const n = dias(de, a)
  return { from: masDias(rango.from, n), to: masDias(rango.to, n) }
}

// Posición de hoy: «vela 37 de 512» (contando desde la de inicio).
export function posicion(velas, desde, hoy) {
  const vs = Array.isArray(velas) ? velas : []
  const i = vs.filter(v => v.date >= desde && v.date <= hoy).length
  const total = vs.filter(v => v.date >= desde).length
  return { vela: i, total, quedan: total - i }
}

// La vela n puestos más allá de hoy (n < 0: hacia atrás), sin pasar de la primera (desde) ni de la última. null si no se mueve.
export function vecina(velas, desde, hoy, n) {
  if (!Array.isArray(velas) || !velas.length || !n) return null
  let i = velas.length - 1
  while (i > 0 && velas[i].date > hoy) i--
  let j = Math.max(0, Math.min(velas.length - 1, i + n))
  while (j < velas.length - 1 && velas[j].date < desde) j++
  const f = velas[j].date
  return f === hoy ? null : f
}
