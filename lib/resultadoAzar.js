// lib/resultadoAzar.js — lo que pinta la pantalla «Resultado de la prueba» del paso 2 (components/BuilderAzarResultado.js; docs/builder.md,
// §46), calculado SOLO con el resultado guardado en pruebas_azar_resultados (lib/pruebaAzar.js, formato 1). Nunca recalcula la prueba.
//
//   histogramaCopias(cagrs, real, { barras })   las barras del histograma de los CAGR de las copias (iguales de anchas, de la mínima a
//                                     la máxima), la mediana, el listón del 95 % y dónde caen el listón y la estrategia (0 … 1).
//   textosResultado(resultado)        el caso del veredicto ('pasa' | 'unoPasa' | 'ningunoPasa' | 'sinVeredicto'), su texto y los avisos
//                                     de pocas operaciones.
//
// EL LISTÓN DEL 95 %: la copia número ⌈0,95 · n⌉ de menor a mayor (con 1.000, la 950.ª). Con la regla (percentilDe, empates la mitad),
// una estrategia por encima de esa cifra gana a ≥ 95 % de las copias y una por debajo, no: «a la derecha del listón» es pasar.
import { REGLA_AZAR_REGLAS } from './azarReglas'

const R = REGLA_AZAR_REGLAS
// Números en español: «99,2», «32,89»; con `limpio`, sin «,0» al final («96» y no «96,0»).
export const numero = (x, d = 1, limpio = false) => {
  if (x == null || !Number.isFinite(x)) return '—'
  const t = x.toFixed(d).replace('.', ',')
  return limpio ? t.replace(/,0+$/, '') : t
}
export const pctTexto = (x) => numero(x, 1, true)

export function histogramaCopias(cagrs, real, { barras = 30 } = {}) {
  const s = Float64Array.from(cagrs || []).sort(), n = s.length
  if (!n) return null
  const minimo = s[0], maximo = s[n - 1], mediana = n % 2 ? s[n >> 1] : (s[n / 2 - 1] + s[n / 2]) / 2
  const liston = s[Math.ceil(0.95 * n) - 1]
  // Todas iguales: una sola barra de 1 punto de ancho alrededor de esa cifra.
  const lo = maximo > minimo ? minimo : minimo - 0.5, hi = maximo > minimo ? maximo : minimo + 0.5, k = maximo > minimo ? barras : 1
  const ancho = (hi - lo) / k
  const cuenta = new Array(k).fill(0)
  for (const x of s) cuenta[Math.min(k - 1, Math.floor((x - lo) / ancho))]++
  const pos = (x) => (x - lo) / (hi - lo)
  const fuera = real == null || !Number.isFinite(real) ? null : real < lo ? 'izquierda' : real > hi ? 'derecha' : null
  return {
    barras: cuenta.map((c, i) => ({ desde: lo + i * ancho, hasta: lo + (i + 1) * ancho, n: c })), maxN: Math.max(...cuenta), copias: n,
    minimo, mediana, maximo, liston, lo, hi,
    posMinimo: pos(minimo), posMediana: pos(mediana), posMaximo: pos(maximo), posListon: pos(liston),
    posEstrategia: real == null || !Number.isFinite(real) ? null : Math.min(1, Math.max(0, pos(real))), fuera,
  }
}

export function textosResultado(resultado) {
  const ps = resultado.periodos || []
  let caso, texto
  if (resultado.veredicto === 'sinVeredicto') {
    caso = 'sinVeredicto'
    const malos = ps.filter(p => p.aprobadosFalsos >= R.sinVeredicto)
    const peor = (malos.length ? malos : ps).reduce((a, p) => p.aprobadosFalsos > a.aprobadosFalsos ? p : a)
    texto = `En los mercados ficticios aprobó por error ${pctTexto(peor.aprobadosFalsos)} de cada 100 veces en ${peor.nombre} (el límite es ${R.sinVeredicto}). Con esta estrategia la prueba no es fiable, así que no se puede decir si pasa o no.`
  } else if (resultado.veredicto === 'pasa') {
    caso = 'pasa'
    texto = `Gana al ${pctTexto(ps[0].percentil)} % de las copias en ${ps[0].nombre} y al ${pctTexto(ps[1].percentil)} % en ${ps[1].nombre}. Supera el ${R.gana} % en los dos: lo más probable es que su momento de compra aporte algo de verdad, no solo suerte.`
  } else {
    const buenos = ps.filter(p => p.gana), malos = ps.filter(p => !p.gana)
    if (buenos.length) {
      caso = 'unoPasa'
      const [b] = buenos, [m] = malos
      texto = `Gana al ${pctTexto(b.percentil)} % de las copias en ${b.nombre}, pero solo al ${pctTexto(m.percentil)} % en ${m.nombre}. Para pasar tenía que ganar al ${R.gana} % en los dos. Lo más probable: en ${b.nombre} tuvo suerte o el mercado le favoreció.`
    } else {
      caso = 'ningunoPasa'
      texto = `Gana al ${pctTexto(ps[0].percentil)} % de las copias en ${ps[0].nombre} y al ${pctTexto(ps[1].percentil)} % en ${ps[1].nombre}. No llega al ${R.gana} % en ninguno: su momento de compra no se distingue del azar.`
    }
  }
  const avisos = ps.filter(p => p.operaciones < R.pocasOperaciones)
    .map(p => `Aviso: en ${p.nombre} hizo solo ${p.operaciones} operaciones (menos de ${R.pocasOperaciones}). El resultado puede ser casualidad.`)
  const fiable = ps.every(p => p.aprobadosFalsos < R.sinVeredicto)
  return { caso, texto, avisos, fiable }
}
