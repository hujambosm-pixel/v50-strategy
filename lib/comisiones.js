// lib/comisiones.js — el coste de operar, en un solo sitio.
//
// POR QUÉ EN UN SOLO SITIO. El dinero del backtest no se calculaba en un sitio, se calculaba en nueve:
// las dos copias de `buildTrades`, `rebuildCapitalTras`, los cuatro constructores de curvas —slots,
// compartido, concentrado y position sizing— y los dos sitios que DESHACÍAN el retorno para recuperar
// el coste de entrada (`capitalTras / (1 + pnlPct/100)`). Siete de esos nueve derivan el dinero de
// `pnlPct`, no de los euros que calculó `buildTrades`, así que una comisión metida solo ahí la
// habrían ignorado en silencio los tres modos de pool. De ahí `netoDeOperacion`: una sola fórmula
// que llaman todos.
//
// LA REGLA (la decide Sergi):
//   · Configuración: comisión fija por COMPRA (€), fija por VENTA (€) y un PORCENTAJE por operación
//     (% sobre el importe negociado, que se cobra en la compra y en la venta). Por defecto, todo a 0.
//   · Compra:  capital invertido = capital asignado − comisión de compra (fija + % del importe).
//   · Venta:   capital final = capital invertido × (1 + pnlPct/100) − comisión de venta
//              (fija + % del importe de salida).
//
// `pnlPct` NO SE TOCA: sigue siendo el movimiento del precio. Lo leen el tooltip de la operación y
// `ddOperacion`, que compara el precio contra el máximo de la operación, y meterle la comisión dentro
// haría que una operación «subió un 2,3 %» dejara de querer decir eso. El resultado neto viaja aparte
// en `pnlNeto` y `pnlPctNeto`, y de ahí lo toman las métricas, el CAGR, las curvas y la simulación
// fiscal.
//
// DIVISA. La comisión se aplica en la misma unidad que el resto de los importes del backtest. Hoy el
// motor no conoce la divisa —no hay una sola mención de `currency` en datos.js, multibacktest.js ni
// asset-detail.js— y los precios en dólares se etiquetan como euros sin convertir, así que una
// comisión plana en euros es COHERENTE con el resto de los números precisamente porque el resto de los
// números ya llaman euros a los dólares. Cuando se convierta la divisa, esto será lo único que ya
// estaba bien, y habrá que convertir todo lo demás, no esto.

export const COMISIONES_CERO = Object.freeze({ compra: 0, venta: 0, porcentaje: 0 })

// Las del bróker de Sergi, y el valor inicial de los Ajustes: 0,36 € por compra y nada por la
// venta. El porcentaje existe porque otros brókeres cobran así, y a 0 no cuesta nada.
export const COMISIONES_DEFECTO = Object.freeze({ compra: 0.36, venta: 0, porcentaje: 0 })

// Las comisiones que valen según los Ajustes del usuario. Si nunca las ha tocado, las del bróker:
// un backtest sin comisiones es el que miente, así que el valor por defecto no puede ser cero.
// `settings.comisiones` vive donde el resto de los ajustes (user_settings + localStorage).
export function comisionesDeAjustes(settings) {
  const c = settings && typeof settings === 'object' ? settings.comisiones : null
  if (!c) return { ...COMISIONES_DEFECTO }
  return {
    compra: Number.isFinite(Number(c.compra)) ? Math.max(0, Number(c.compra)) : COMISIONES_DEFECTO.compra,
    venta: Number.isFinite(Number(c.venta)) ? Math.max(0, Number(c.venta)) : COMISIONES_DEFECTO.venta,
    porcentaje: Number.isFinite(Number(c.porcentaje)) ? Math.max(0, Number(c.porcentaje)) : COMISIONES_DEFECTO.porcentaje,
  }
}

const num = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0 }

// Las comisiones con las que mide el RANKING. Por defecto las mismas que todo lo demás —las de
// «Comisiones por defecto»—, y si se marca `rankingComisionesPropias` las suyas. Existe la opción
// porque el ranking se usa para elegir, y puede interesar compararlo con otro coste sin cambiar
// el de los backtests que se miran de uno en uno.
export function comisionesDelRanking(settings) {
  const r = settings && typeof settings === 'object' ? settings.ranking : null
  if (r && r.rankingComisionesPropias) return normalizaComisiones(r.rankingComisiones)
  return comisionesDeAjustes(settings)
}

// Acepta lo que llegue en el cuerpo de la petición y devuelve siempre los tres campos. Un valor
// absurdo cae a 0 sin invalidar los otros dos: una comisión mal escrita no debe cambiar las otras.
export function normalizaComisiones(c) {
  if (!c || typeof c !== 'object') return COMISIONES_CERO
  return { compra: num(c.compra), venta: num(c.venta), porcentaje: num(c.porcentaje) }
}

// ¿Hay algo que cobrar? Es la puerta del camino rápido, y también la que decide si la respuesta lleva
// los campos nuevos: con comisión cero no los lleva, para que sea idéntica byte a byte a la de antes.
export function sinComisiones(c) {
  return !c || (!num(c.compra) && !num(c.venta) && !num(c.porcentaje))
}

// La comisión en euros de una compra y/o de una venta por sus importes negociados. La usa
// `buildTrades`, que calcula el dinero a partir de los PRECIOS y las acciones y no de `pnlPct`:
// reescribirlo para que pasara por `netoDeOperacion` cambiaría el orden de las operaciones en coma
// flotante y movería los resultados de hoy en los últimos dígitos, que es justo lo que este cambio
// no puede hacer.
export function comisionDe({ importeCompra = 0, importeVenta = 0 } = {}, c) {
  const cfg = normalizaComisiones(c)
  const compra = importeCompra > 0 ? cfg.compra + importeCompra * cfg.porcentaje / 100 : 0
  const venta  = importeVenta  > 0 ? cfg.venta  + importeVenta  * cfg.porcentaje / 100 : 0
  return { compra, venta, total: compra + venta }
}

// El resultado de UNA operación sobre un capital asignado, con la comisión ya descontada.
//   capitalInvertido  lo que de verdad entra en el mercado (asignado − comisión de compra)
//   capitalFinal      lo que queda al cerrar, ya sin la comisión de venta
//   pnlNeto           capitalFinal − capitalAsignado, en euros
//   pnlPctNeto        ese mismo resultado sobre el capital asignado, en %
//   comisionTotal     lo que se ha pagado entre las dos patas
//
// EL CAMINO RÁPIDO NO ES UNA OPTIMIZACIÓN, es el contrato. Con comisión cero cada valor reproduce
// EXACTAMENTE la expresión que usaba antes el sitio que lo consume: `capitalFinal` sale de
// `cap * (1 + pnlPct/100)` —lo que hacían los cuatro constructores de curvas— y `pnlNeto` de
// `cap * (pnlPct/100)` —lo que hacían sus curvas simples—. Los dos no son el mismo número en coma
// flotante (difieren en el último bit), y eso es a propósito: así los resultados de hoy no se mueven
// ni un dígito. En cuanto hay comisión, los dos salen de la misma cadena y la diferencia desaparece.
export function netoDeOperacion(capitalAsignado, pnlPct, c) {
  if (sinComisiones(c)) {
    return {
      capitalInvertido: capitalAsignado,
      capitalFinal: capitalAsignado * (1 + pnlPct / 100),
      pnlNeto: capitalAsignado * (pnlPct / 100),
      pnlPctNeto: pnlPct,
      comisionTotal: 0,
    }
  }
  const cfg = normalizaComisiones(c)
  // El % de la compra se cobra sobre el capital ASIGNADO. La versión exacta sería resolver el importe
  // negociado X de `X + fija + X·pct/100 = asignado`; la diferencia es de segundo orden en `pct` y la
  // regla la fijó Sergi así. Con `porcentaje = 0` las dos coinciden.
  const comCompra = cfg.compra + capitalAsignado * cfg.porcentaje / 100
  const capitalInvertido = capitalAsignado - comCompra
  const brutoSalida = capitalInvertido * (1 + pnlPct / 100)
  const comVenta = cfg.venta + brutoSalida * cfg.porcentaje / 100
  const capitalFinal = brutoSalida - comVenta
  const pnlNeto = capitalFinal - capitalAsignado
  return {
    capitalInvertido, capitalFinal, pnlNeto,
    pnlPctNeto: capitalAsignado > 0 ? pnlNeto / capitalAsignado * 100 : pnlPct,
    comisionTotal: comCompra + comVenta,
  }
}

export default { COMISIONES_CERO, COMISIONES_DEFECTO, comisionesDeAjustes, comisionesDelRanking,
                 normalizaComisiones, sinComisiones, comisionDe, netoDeOperacion }
