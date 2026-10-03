// lib/filtroEntrada.js — ¿deja el filtro entrar en esta operación?
//
// POR QUÉ EXISTE. Los tres sitios que descartan operaciones por filtro —datos.js, y las dos ramas de
// multibacktest— hacían literalmente `filtroActivoMap[t.entryDate] !== false`, es decir, decidían con
// el estado del filtro en el CIERRE de la vela en la que se entra. Y una entrada se ejecuta en la
// apertura de esa vela o al tocar un nivel durante ella: cuando la orden se llena, el cierre de ese
// día todavía no existe. El filtro estaba dando una confirmación del propio día que nadie podía
// tener, y con ella permitía justo las entradas que acababan bien y bloqueaba las que acababan mal.
// No es un detalle: medido sobre 5.879 operaciones, quitarlo se lleva la mitad del resultado de las
// estrategias que más dependen del filtro, y una de ellas pasa a perder dinero.
//
// LA REGLA (la decide Sergi, y es la de toda la aplicación): una decisión se toma con la vela CERRADA
// y actúa desde la siguiente. Una entrada ejecutada durante la vela k solo está permitida si el
// filtro estaba LIBRE en el último cierre ANTERIOR al inicio de la vela k. Lo que pase durante la
// vela k no anula una entrada ya hecha, y los filtros NO cierran posiciones abiertas: solo deciden
// si se puede entrar.
//
// TRES CASOS DE BORDE, los tres decididos:
//
//   1. PRIMERA VELA de la serie. No hay cierre anterior. Se PERMITE, que es la convención fail-open
//      de todos los filtros (sin dato, el filtro no bloquea). Hoy no afecta a ninguna operación:
//      ninguna estrategia entra en la primera vela, porque todas necesitan una vela cerrada para su
//      señal. Es una decisión de borde, no un caso real.
//
//   2. ENTRADAS AL CIERRE. Una estrategia que entra al cierre de su vela de señal toma la decisión
//      CON ese cierre, que es el mismo que fija el estado del filtro de esa vela: ahí el dato sí está
//      disponible en el instante de entrar. Esas estrategias usan el estado de su PROPIA vela, y solo
//      se reconocen porque lo declaran en sus params con `entradaAlCierre: true`. No se deduce del
//      precio a propósito: hay operaciones cuyo precio de entrada coincide con el cierre por
//      casualidad, y una coincidencia numérica no es una declaración de intenciones.
//
//   3. INTERVALOS DISTINTOS entre el filtro y la estrategia. Aquí «la vela anterior» es la vela
//      anterior de la REJILLA DE LA ESTRATEGIA, y eso NO es siempre el último cierre del filtro.
//      Con una estrategia semanal y un filtro diario, la regla pide el cierre del viernes anterior y
//      esto da el estado de la semana anterior: medido, discrepan en el 31 % de las operaciones.
//      Es una limitación conocida y aceptada de momento. Arreglarla exige evaluar cada filtro en su
//      propia rejilla y, para el ámbito «activo», descargar la serie diaria del símbolo en corridas
//      semanales, que hoy no se descarga; va en un commit aparte, junto con el hecho de que un filtro
//      configurado como «diario» en una corrida semanal hoy no es diario (acaba siendo una EMA sobre
//      cierres de lunes, en mercado, o sobre cierres semanales, en activo).

// Fecha cuyo cierre decide si esta entrada está permitida.
// Devuelve null cuando no hay cierre anterior (primera vela de la serie) y la propia `entryDate`
// cuando la estrategia entra al cierre o cuando la fecha no está en la rejilla —ese último caso no
// debería ocurrir, y si ocurre se deja el comportamiento de siempre en vez de abrir la puerta sin
// mirar—.
export function fechaQueDecide(assetDates, entryDate, entradaAlCierre = false, indice = null) {
  if (entradaAlCierre) return entryDate
  if (!Array.isArray(assetDates) || !assetDates.length) return entryDate
  const i = indice ? indice.get(entryDate) : assetDates.indexOf(entryDate)
  if (i == null || i < 0) return entryDate
  if (i === 0) return null
  return assetDates[i - 1]
}

// ¿Permite el filtro esta entrada? Sin mapa (ningún filtro encendido) siempre permite.
export function permiteEntrada(filtroActivoMap, assetDates, entryDate, { entradaAlCierre = false, indice = null } = {}) {
  if (!filtroActivoMap) return true
  const fecha = fechaQueDecide(assetDates, entryDate, entradaAlCierre, indice)
  if (fecha === null) return true          // primera vela: fail-open
  return filtroActivoMap[fecha] !== false
}

// Filtra una lista de operaciones por la regla. El índice fecha → posición se construye UNA vez
// aquí: con indexOf por operación esto sería cuadrático, y hay series de miles de velas.
export function filtraPorEntrada(trades, filtroActivoMap, assetDates, { entradaAlCierre = false } = {}) {
  if (!Array.isArray(trades) || !trades.length || !filtroActivoMap) return trades
  const indice = new Map()
  if (Array.isArray(assetDates)) for (let i = 0; i < assetDates.length; i++) indice.set(assetDates[i], i)
  return trades.filter(t => permiteEntrada(filtroActivoMap, assetDates, t.entryDate, { entradaAlCierre, indice }))
}

export default filtraPorEntrada
