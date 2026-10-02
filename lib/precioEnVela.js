// lib/precioEnVela.js — un precio de ejecución tiene que haber existido en su vela.
//
// POR QUÉ EXISTE. El motor aceptaba sin mirar el precio que declarara cada estrategia. La auditoría
// encontró 68 entradas a un precio que NO se negoció ese día: cuatro estrategias (23.1, 23.2, 23.3 y
// 26) colocan la orden en el MÁXIMO DE LA VELA ANTERIOR y daban por hecho el llenado a ese nivel,
// pero la vela abría por encima. Ejemplo medido: ^GSPC el 2023-03-21, orden en 3956,62 —máximo del
// día anterior— con la vela abriendo en 3975,89 y mínimo en 3971,19. El precio declarado no se tocó
// en ningún momento de esa sesión, y el llenado era siempre mejor que la realidad.
//
// LA REGLA, decidida por Sergi: si el precio declarado queda fuera de [low, high] de su vela, la
// operación se ejecuta en la APERTURA de esa vela, porque el hueco de apertura disparó la orden al
// abrir. Si está dentro del rango, se respeta tal cual. Igual en diario y en semanal, cada uno con
// su vela.
//
// NO ES UNA CORRECCIÓN DE ESTRATEGIA, es de realismo. Una orden a 100 con la vela abriendo en 110 se
// llena a 110, no a 100, y da igual qué lógica la colocó. Por eso vive en el motor y no en el
// code_js: cualquier estrategia futura hereda la regla sin tener que acordarse de ella.

// Índice fecha → vela. Se construye una vez por activo y se reutiliza para todas sus operaciones.
export function indiceDeVelas(barras) {
  const idx = {}
  if (Array.isArray(barras)) for (const b of barras) if (b && b.date) idx[b.date] = b
  return idx
}

// Margen de tolerancia. Los precios vienen en coma flotante y un `high` comparado con un precio
// calculado puede diferir en los últimos bits; sin esta holgura se "corregirían" operaciones que
// estaban bien.
const TOL = 1e-6

// Devuelve { precio, ajuste } para un precio declarado en una fecha.
//   ajuste = null                      el precio existió en la vela (o no hay vela: no se toca)
//   ajuste = { campo, declarado, ejecutado }   se ejecutó en la apertura
function aplica(campo, declarado, vela) {
  if (!vela || vela.low == null || vela.high == null || vela.open == null) return { precio: declarado, ajuste: null }
  if (declarado >= vela.low - TOL && declarado <= vela.high + TOL) return { precio: declarado, ajuste: null }
  return { precio: vela.open, ajuste: { campo, declarado, ejecutado: vela.open } }
}

// Ajusta entradas y salidas de una lista de operaciones en crudo.
// Marca cada operación corregida con `precioAjustado`, un ARRAY: una misma operación puede tener la
// entrada y la salida fuera de su vela, y con un solo objeto se perdería una de las dos.
// Si una fecha no tiene vela —no debería pasar— la operación no se toca y se marca `sinVela`, para
// que se pueda contar aparte en vez de desaparecer en silencio.
export function ajustaPreciosAVela(rawTrades, barras) {
  if (!Array.isArray(rawTrades) || !rawTrades.length) return rawTrades
  const idx = indiceDeVelas(barras)
  if (!Object.keys(idx).length) return rawTrades

  return rawTrades.map(t => {
    const vEnt = idx[t.entryDate]
    const vSal = idx[t.exitDate]
    const sinVela = []
    if (t.entryDate && !vEnt) sinVela.push('entrada')
    if (t.exitDate && !vSal) sinVela.push('salida')

    const e = aplica('entrada', t.entryPrice, vEnt)
    const s = aplica('salida', t.exitPrice, vSal)
    const ajustes = [e.ajuste, s.ajuste].filter(Boolean)

    if (!ajustes.length && !sinVela.length) return t
    return {
      ...t,
      entryPrice: e.precio,
      exitPrice: s.precio,
      ...(ajustes.length ? { precioAjustado: ajustes } : {}),
      ...(sinVela.length ? { sinVela } : {}),
    }
  })
}

// Cuántas operaciones de una lista llevan precio corregido. Lo usan las rutas para informar del
// recuento sin tener que cambiar la forma de lo que devuelve buildTrades.
export const cuentaAjustados = (trades) =>
  Array.isArray(trades) ? trades.filter(t => t && t.precioAjustado).length : 0

export default ajustaPreciosAVela
