// lib/condicionesSimulacion.js — las condiciones de la simulación, en un solo sitio.
//
// QUÉ SON. Lo que define CÓMO se mide una estrategia, no QUÉ hace: el periodo, el capital inicial y la
// temporalidad de las velas. Dos de las tres vivían en columnas de la tabla `strategies` (`years` y
// `capital_ini`) y la tercera en `params.intervalo`, así que cambiar el periodo de un backtest obligaba
// a editar la estrategia, y dos estrategias podían acabar medidas en periodos distintos sin que nada lo
// avisara. Medido en el audit previo: de las 45 estrategias activas y habilitadas, una
// (`23.0 EMA20 breakouts (open)`) lleva `years = 20` frente a 5, y el ranking la comparaba con las
// otras 44 como si midiera lo mismo.
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
// `capital_ini || 10000` e `intervalo` 'diario' cuando `params` no trae el campo (21 filas de 78 no lo
// traen).
//
// NO HAY «CAPITAL POR OPERACIÓN». El motor recibe un `allocation_pct` y la columna sigue en la tabla,
// pero en el backtest individual siempre se entra con el 100 % del capital disponible, así que no es una
// condición que haya nada que elegir: viaja como 100 fijo. En el multibacktest el reparto lo decide su
// modo de asignación —slots, pool compartido, concentrado o position sizing—, que tiene su propio panel.
export const CONDICIONES_DEFAULT = Object.freeze({
  years: 5,
  capitalIni: 10000,
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

// Las condiciones con las que arranca el panel para una estrategia: exactamente los mismos valores que
// el código leía de la fila antes de que existiera el panel, para que la primera corrida tras cargar
// una estrategia sea la de siempre.
export function condicionesIniciales(estrategia) {
  return {
    years: saneaAnios(estrategia?.years ?? CONDICIONES_DEFAULT.years),
    capitalIni: saneaCapital(estrategia?.capital_ini ?? CONDICIONES_DEFAULT.capitalIni),
    temporalidad: temporalidadDeEstrategia(estrategia),
  }
}

// Las condiciones del RANKING: las mismas para todas las estrategias. La temporalidad no está
// aquí a propósito, porque no es común: la pone cada estrategia con `temporalidadDeEstrategia`.
// Lee de `settings.ranking`, donde viven el resto de los ajustes del ranking, y cae a los mismos
// valores que el ranking usaba de hecho hasta ahora (5 años y 10.000 €), para que activar esto no
// cambie ningún número por sí solo.
export function condicionesDelRanking(settings) {
  const r = settings && typeof settings === 'object' ? settings.ranking : null
  return {
    years: saneaAnios(r?.rankingYears ?? CONDICIONES_DEFAULT.years),
    capitalIni: saneaCapital(r?.rankingCapital ?? CONDICIONES_DEFAULT.capitalIni),
    minTrades: (() => {
      const n = Math.round(Number(r?.minTrades))
      return Number.isFinite(n) && n >= 1 ? n : 3
    })(),
  }
}

export default { TEMPORALIDADES, CONDICIONES_DEFAULT, temporalidadDeEstrategia,
                 saneaAnios, saneaCapital, condicionesIniciales, condicionesDelRanking }
