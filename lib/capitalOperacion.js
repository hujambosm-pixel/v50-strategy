// lib/capitalOperacion.js — el capital inicial y final de UNA operación, en capital compuesto.
//
// POR QUÉ EXISTE. Las etiquetas de los gráficos mezclaban dos magnitudes: enseñaban el capital en
// COMPUESTO (capitalTras) y el P&L en SIMPLE (pnlSimple). En la operación #24 de 23.1 sobre ^GSPC eso
// daba «Capital 7876,98» con «P&L +276,41», mientras el historial de la misma operación decía
// 7665 → 7877 y +211,87. Los dos números eran correctos por separado —276,41 es el 2,76 % de los
// 10.000 fijos del modo simple, y 211,87 el 2,76 % de los 7.665 que había de verdad— pero juntos en
// la misma etiqueta no describen ninguna realidad.
//
// La lógica venía de mcCapitalDeOperacion, en pages/index.js, que ya resolvía los dos modos y ya la
// usaban los gráficos del multiactivo. Aquí se saca a una función compartida para que las etiquetas
// del backtest individual, del multiactivo y del panel del activo lean TODAS de la misma fuente, que
// es la única forma de que no vuelvan a divergir.
//
// Devuelve { inversion, resultado }, y null en cada campo cuando no hay datos para calcularlo: una
// etiqueta con un guion es honesta, una con un número inventado no.
export function capitalDeOperacion(t, modoAsig) {
  // ── Modo POOL (capital compartido, concentrado, position sizing) ──
  // _capitalAtEntry viaja con la operación, y `entrada + pnlSimple` es el capital de salida POR
  // CONSTRUCCIÓN: en estos modos el motor define pnlSimple como capFinal − capAsignado, no como un
  // porcentaje sobre una asignación fija.
  const esPool = modoAsig === 'compartido' || modoAsig === 'concentrado' || modoAsig === 'positionsizing'
  if (esPool) {
    const ent = Number(t?._capitalAtEntry)
    if (!Number.isFinite(ent)) return { inversion: null, resultado: null }
    const pnl = Number(t?.pnlSimple)
    return { inversion: ent, resultado: Number.isFinite(pnl) ? ent + pnl : null }
  }

  // ── Modo SLOTS y backtest individual ──
  // No hay _capitalAtEntry. El capital de salida es capitalTras DIRECTAMENTE, y el de entrada se
  // deshace de ahí: capitalTras = capitalAntes × (1 + pnlPct/100). Sumar pnlSimple aquí daría un
  // número que no cuadra con ninguna curva, porque pnlSimple se mide sobre la asignación FIJA y
  // capitalTras sobre el capital compuesto: dos magnitudes distintas en el mismo objeto.
  //
  // Esta división da EXACTAMENTE el capitalTras de la operación anterior, que es lo que enseña el
  // historial del backtest individual (pages/index.js: capInvC = trades[idx-1].capitalTras), así que
  // etiqueta e historial coinciden sin tener que pasarse la lista entera.
  const tras = Number(t?.capitalTras), pct = Number(t?.pnlPct)
  if (!Number.isFinite(tras) || !Number.isFinite(pct)) return { inversion: null, resultado: null }
  const factor = 1 + pct / 100
  // pnlPct = −100 haría factor 0: pérdida total, sin capital de entrada recuperable de esta forma.
  //
  // CON COMISIONES la división ya no recupera el capital de entrada: capitalTras lleva descontada la
  // comisión de las dos patas, así que `capitalTras / (1 + pnlPct/100)` daría un número que no es ni
  // el capital asignado ni el invertido. Cuando hay comisión, buildTrades adjunta `_capitalAtEntry`
  // con el capital asignado de verdad y es ese el que manda. Sin comisión el campo no existe y se
  // usa la división de siempre, bit a bit. Ver lib/comisiones.js.
  const ent = Number(t?._capitalAtEntry)
  if (Number.isFinite(ent)) return { inversion: ent, resultado: tras }
  return { inversion: factor !== 0 ? tras / factor : null, resultado: tras }
}

// P&L en euros de la operación, en compuesto: lo que de verdad cambió el capital.
// Es capital final − capital inicial, que con asignación del 100 % es exactamente el
// `capInvC × (pnlPct/100)` del historial.
export function pnlCompuesto(t, modoAsig) {
  const { inversion, resultado } = capitalDeOperacion(t, modoAsig)
  if (inversion == null || resultado == null) return null
  return resultado - inversion
}

export default capitalDeOperacion
