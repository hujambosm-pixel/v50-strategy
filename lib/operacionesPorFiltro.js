// lib/operacionesPorFiltro.js — las operaciones de «0 No Strategy», en un solo sitio.
//
// POR QUÉ EXISTE. Esta lógica estaba DUPLICADA en pages/api/datos.js y en pages/api/multibacktest.js,
// y las dos copias habían divergido: una exigía no tener posición para entrar y la otra no, una marcaba
// la salida con exitReason y la otra no, y una recortaba por la fecha de inicio y la otra tampoco. Dos
// copias de la misma regla se desincronizan en cuanto una de las dos cambie, y eso ya había pasado.
//
// Y además ninguna de las dos cumplía la regla acordada: las dos salían al CIERRE de la vela en que
// aparece el filtro, no en la apertura de la siguiente. Entraban con un día de retardo y salían sin
// retardo: asimétrico, y por tanto optimista o pesimista según el hueco de apertura de cada día.
//
// LA REGLA, que se decide siempre con la vela CERRADA:
//   · Estado del filtro: libre o bloqueado según el cierre de la vela t (mercado y activo combinados).
//   · ENTRADA por ESTADO, no por transición: al cierre de t, si NO hay posición y el filtro está libre,
//     y existe la vela t+1 → entrada en la APERTURA de t+1.
//   · SALIDA: al cierre de t, si hay posición y el filtro está bloqueado → salida en la APERTURA de t+1.
//   · En la vela en que se decide una salida NO se decide además una entrada: la siguiente entrada
//     posible se decide al cierre de la vela siguiente.
//   · Fin del periodo con posición abierta, o bloqueo en la última vela: salida al CIERRE de esa vela,
//     marcada como cierre por fin de periodo. No hay t+1 donde ejecutar, y es la única salida posible.
//
// NUNCA se usa información posterior al cierre de t para decidir en t. El precio de ejecución es la
// apertura de t+1, que no se conoce al decidir —y no hace falta conocerla: se manda una orden a mercado
// y se llena a lo que abra.
//
// POR QUÉ «por estado» y no «por transición». La versión anterior entraba solo cuando el filtro pasaba
// de bloqueado a libre. Si el filtro estaba libre y, por cualquier motivo, no había posición, el motor
// se quedaba fuera hasta que el filtro bloqueara y volviera a liberarse. Por estado no puede pasar.

// `filtroLibre(fecha)` devuelve true si NINGÚN filtro bloquea en esa fecha. El criterio de «libre» se
// queda fuera a propósito: cada ruta construye su mapa con construirFiltroActivoMap y lo consulta como
// le corresponde, y aquí solo se decide QUÉ operación sale de ese estado.
//
// `desde` recorta las velas anteriores a la fecha de inicio de la simulación. multibacktest lo pasa
// porque ya lo hacía; datos.js no, porque nunca lo hizo. Mantenerlo evita cambiar lo que cada ruta
// consideraba el principio del periodo.
//
// Devuelve las operaciones en el MISMO formato que esperan buildTrades y los consumidores de siempre:
// { entryDate, entryPrice, exitDate, exitPrice, exitReason } y _virtualClose en los cierres de periodo.
export function operacionesPorFiltro(barras, filtroLibre, { desde = null } = {}) {
  const ops = []
  if (!Array.isArray(barras) || !barras.length) return ops

  let enPosicion = false
  let entrada = null

  for (let i = 0; i < barras.length; i++) {
    const bar = barras[i]
    if (desde && bar.date < desde) continue
    const libre = filtroLibre(bar.date)
    const siguiente = barras[i + 1]

    if (enPosicion) {
      if (!libre) {
        if (siguiente) {
          ops.push({ ...entrada, exitDate: siguiente.date, exitPrice: siguiente.open, exitReason: 'filter_exit' })
        } else {
          // Última vela y el filtro bloquea: no hay apertura siguiente donde ejecutar.
          ops.push({ ...entrada, exitDate: bar.date, exitPrice: bar.close, exitReason: 'virtual_close', _virtualClose: true })
        }
        enPosicion = false
        entrada = null
      }
      // Decidida o no la salida, en esta vela no se decide una entrada.
      continue
    }

    if (libre && siguiente) {
      enPosicion = true
      entrada = { entryDate: siguiente.date, entryPrice: siguiente.open }
    }
  }

  // El periodo acaba con la posición abierta: se cierra al cierre de la última vela.
  if (enPosicion) {
    const ultima = barras[barras.length - 1]
    ops.push({ ...entrada, exitDate: ultima.date, exitPrice: ultima.close, exitReason: 'virtual_close', _virtualClose: true })
  }

  return ops
}

// ¿Es la estrategia «0 No Strategy»? Se decide por el NOMBRE de la fila, que es lo que hay en la base,
// y no por la bandera que manda el cliente: la bandera es una pista que puede venir de una lista
// obsoleta, y la fila es la verdad. Mismo criterio que usa el cliente, para que no puedan divergir.
export const esNoStrategyPorNombre = (nombre) => /No Strategy/i.test(String(nombre || ''))

export default operacionesPorFiltro
