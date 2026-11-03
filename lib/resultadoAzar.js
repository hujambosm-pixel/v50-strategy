// lib/resultadoAzar.js — lo que pinta la pantalla «Resultado de la prueba» del paso 2 (components/BuilderAzarResultado.js; docs/builder.md,
// §46), calculado SOLO con el resultado guardado en pruebas_azar_resultados (lib/pruebaAzar.js, formato 1). Nunca recalcula la prueba.
//
//   textosResultado(resultado)        el caso del veredicto ('pasa' | 'unoPasa' | 'ningunoPasa' | 'sinVeredicto'), su texto y los avisos
//                                     de pocas operaciones.
//
import { REGLA_AZAR_REGLAS } from './azarReglas'

const R = REGLA_AZAR_REGLAS
// Números en español: «99,2», «32,89»; con `limpio`, sin «,0» al final («96» y no «96,0»).
export const numero = (x, d = 1, limpio = false) => {
  if (x == null || !Number.isFinite(x)) return '—'
  const t = x.toFixed(d).replace('.', ',')
  return limpio ? t.replace(/,0+$/, '') : t
}
export const pctTexto = (x) => numero(x, 1, true)

// Los euros, con punto de miles: «15.965 €».
export const euros = (x) => x == null || !Number.isFinite(x) ? '—' : `${String(Math.round(x)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')} €`
export const AYUDA_GRAFICO_AZAR = 'Cuánto dinero tendrías, empezando con 10.000 €, sin comisiones ni impuestos y vendiendo todo el último día. Ejemplo: si tu estrategia termina en 15.965 € y la zona gris llega hasta 25.250 €, muchas copias que compraron en fechas al azar lo hicieron mejor. La escala es logarítmica: la misma subida en % mide lo mismo arriba y abajo.'
export const AYUDA_ABANICO = 'Las 1.000 copias, resumidas. Cada línea gris dice por debajo de cuánto va un % de las copias en cada momento. Ejemplo: si el percentil 95 termina en 25.250 €, 950 de cada 1.000 copias terminan por debajo de 25.250 €. La mediana (percentil 50) es la del medio. Las zonas sombreadas van del 5 al 95 y del 25 al 75.'
export const AYUDA_COPIAS = 'Una copia compra en fechas al azar, tantas veces como tu estrategia, a la apertura del día siguiente, y vende con las mismas reglas y stops que ella, sin filtro de mercado. La mejor, la típica y la peor son 3 de las 1.000: la de mayor final, la del medio y la de menor final. Ejemplo: si la típica termina en 13.196 €, la mitad de las copias acaba por debajo y la otra mitad por encima.'
export const ayudaVeredicto = (t) => `${t.texto} Para pasar hay que ganar al ${R.gana} % de las copias en los dos periodos. Ejemplo: 99,2 % en uno y 11,3 % en el otro no pasa, porque no llega en los dos.`
export const ayudaFiabilidad = (resultado) => `${(resultado.periodos || []).map(p => `${p.nombre}: aprobó por error ${p.fiabilidad.aprobados} de ${p.fiabilidad.mercados} mercados ficticios (${pctTexto(p.aprobadosFalsos)} %).`).join(' ')} En mercados ficticios ninguna estrategia tiene ventaja, así que lo normal es aprobar por error unas 5 de cada 100 veces. El límite es ${R.sinVeredicto} de cada 100: desde ahí, la app no da veredicto. Ejemplo: 12 de 200 son 6 %, y la prueba sirve.`

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
