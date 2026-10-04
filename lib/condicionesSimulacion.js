// lib/condicionesSimulacion.js — las condiciones de la simulación, en un solo sitio.
//
// QUÉ SON. Lo que define CÓMO se mide una estrategia, no QUÉ hace: el periodo, el capital inicial, el
// capital que se pone en cada operación y la temporalidad de las velas. Hasta ahora tres de los cuatro
// vivían en columnas de la tabla `strategies` (`years`, `capital_ini`, `allocation_pct`) y la cuarta en
// `params.intervalo`, así que cambiar el periodo de un backtest obligaba a editar la estrategia, y dos
// estrategias podían acabar medidas en periodos distintos sin que nada lo avisara. Medido en el audit
// previo: de las 45 estrategias activas y habilitadas, una (`23.0 EMA20 breakouts (open)`) lleva
// `years = 20` frente a 5, y el ranking la comparaba con las otras 44 como si midiera lo mismo.
//
// LA TEMPORALIDAD ES LA EXCEPCIÓN, y se queda siendo de la estrategia. Una estrategia semanal
// ejecutada en diario no es la misma estrategia con otra ventana: es otra estrategia. Así que la
// temporalidad de la fila es su VALOR POR DEFECTO —de ahí `temporalidadDeEstrategia`— y el panel
// permite cambiarla para explorar, sin que ese cambio sea la estrategia.
//
// ESTE MÓDULO NO ARMA PETICIONES, a propósito. Las dos pantallas siguen construyendo su cuerpo como
// siempre; lo único que cambia es de dónde salen los valores. Era la forma de añadir el panel sin
// mover ni un byte de lo que viaja al servidor, y está verificado que no se mueve.

export const TEMPORALIDADES = ['diario', 'semanal']

// Los defaults son los valores que el código ya usaba cuando la fila no decía nada: `years || 5`,
// `capital_ini || 10000`, `allocation_pct` 100 (las 78 filas de la tabla valen 100) e `intervalo`
// 'diario' cuando `params` no trae el campo (21 filas de 78 no lo traen).
export const CONDICIONES_DEFAULT = Object.freeze({
  years: 5,
  capitalIni: 10000,
  capitalPorOperacion: 100,
  temporalidad: 'diario',
})

// La temporalidad que declara una estrategia en sus `params`. `params` es una columna de TEXTO, no
// jsonb, así que hay que parsearla a mano y un JSON roto no puede tumbar la pantalla: cae al default.
export function temporalidadDeEstrategia(estrategia) {
  try {
    const p = typeof estrategia?.params === 'string'
      ? JSON.parse(estrategia.params || '{}')
      : (estrategia?.params || {})
    return TEMPORALIDADES.includes(p.intervalo) ? p.intervalo : CONDICIONES_DEFAULT.temporalidad
  } catch (_) { return CONDICIONES_DEFAULT.temporalidad }
}

// Saneado de los campos numéricos. Cada uno cae a SU default si no es un número utilizable, sin
// invalidar el resto: un capital en blanco no debe dejar el periodo a medias.
export function saneaAnios(v) {
  const n = Math.round(Number(v))
  return Number.isFinite(n) && n >= 1 && n <= 20 ? n : CONDICIONES_DEFAULT.years
}
export function saneaCapital(v) {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : CONDICIONES_DEFAULT.capitalIni
}
// El capital por operación es un porcentaje del capital disponible. Se admite por encima de 100 porque
// el motor ya lo acepta (`buildTrades` multiplica sin tope), y poner un tope aquí cambiaría lo que hoy
// se puede pedir. 0 no: una operación de cero euros no es una operación.
export function saneaPorcentaje(v) {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : CONDICIONES_DEFAULT.capitalPorOperacion
}

// Las condiciones con las que arranca el panel para una estrategia: exactamente los mismos valores que
// el código leía de la fila antes de que existiera el panel, para que la primera corrida tras cargar
// una estrategia sea la de siempre.
export function condicionesIniciales(estrategia) {
  return {
    years: saneaAnios(estrategia?.years ?? CONDICIONES_DEFAULT.years),
    capitalIni: saneaCapital(estrategia?.capital_ini ?? CONDICIONES_DEFAULT.capitalIni),
    capitalPorOperacion: CONDICIONES_DEFAULT.capitalPorOperacion,
    temporalidad: temporalidadDeEstrategia(estrategia),
  }
}

export default { TEMPORALIDADES, CONDICIONES_DEFAULT, temporalidadDeEstrategia,
                 saneaAnios, saneaCapital, saneaPorcentaje, condicionesIniciales }
