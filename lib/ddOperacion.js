// lib/ddOperacion.js — el drawdown de UNA operación: lo que llegó a sufrir mientras estaba abierta.
//
// POR QUÉ EXISTE. Las etiquetas enseñaban «Max DD estrategia», que no era de la operación sino de la
// curva entera de la estrategia: el mismo número repetido en todas las etiquetas. Y el panel del
// activo enseñaba `cesionPct`, que mide otra cosa —del máximo hasta el PRECIO DE SALIDA, no hasta el
// peor valle—: en la operación de ^GSPC del 01/08/2024 al 05/08/2024 una decía −7,46 % y la otra
// −4,75 %. Las dos son útiles y se muestran las dos, pero solo una es el drawdown.
//
// LA DEFINICIÓN (la decide Sergi). Mayor caída porcentual, mientras la posición estaba abierta, desde
// el máximo más alto alcanzado hasta el mínimo más bajo POSTERIOR a ese máximo. El máximo arranca en
// el precio de ENTRADA y se actualiza con los high; los mínimos salen de los low. El precio de SALIDA
// entra siempre como candidato a mínimo, incluso cuando su vela no cuenta: es un precio que la
// posición vivió de verdad, el último, y sin él una operación podía enseñar un drawdown MENOR que su
// propia pérdida —el caso del 05/08/2024, que salía en la apertura—.
//
// DENTRO DE UNA VELA NO SE SABE EL ORDEN. No hay datos intrabarra: una vela con high 102 y low 100 no
// dice si primero tocó 102 y luego 100 o al contrario. La convención, y es una decisión: el low de una
// vela se mide contra el máximo alcanzado ANTES de esa vela, y solo después su high actualiza el
// máximo. Así una operación que sube vela a vela da drawdown CERO, que es lo que se espera de ella;
// con la convención contraria —high primero— cualquier vela con high distinto de low inventaría una
// caída, porque toda vela toca su mínimo en algún momento. El precio pagado por esta elección: cuando
// el máximo y el desplome caen en la MISMA vela, la caída se mide desde el máximo anterior y no desde
// el high de esa vela, así que queda algo corta. Sin datos intrabarra no hay forma de acertar en los
// dos casos, y se prefiere el que no inventa caídas que la operación no sufrió.
//
// QUÉ VELAS CUENTAN. Solo precios que la posición vivió. El momento dentro de la vela se deduce del
// PRECIO, no de la razón de salida: ninguna estrategia declara cómo entra, y las que declaran
// exitReason lo hacen con once nombres distintos. precio == open → en la apertura; precio == close →
// al cierre; cualquier otro → nivel intradía.
//
//   Vela de ENTRADA
//     · en la apertura        → cuenta entera.
//     · al cierre             → no cuenta: no hay precios después del cierre en esa vela.
//     · a un nivel intradía   → cuenta, con el high entero y el low limitado al precio de entrada.
//           Sin datos intrabarra no se sabe si ese low fue antes o después de entrar. Limitarlo puede
//           PERDERSE un drawdown real; contarlo entero puede INVENTARSE uno que la posición nunca
//           sufrió. Se prefiere el error que no inventa.
//   Vela de SALIDA
//     · en la apertura        → no cuenta (pero el precio de salida sigue siendo candidato a mínimo).
//     · al cierre             → cuenta entera.
//     · nivel por debajo del open (stop)     → low limitado al precio de salida, high entero.
//     · nivel por encima del open (objetivo) → high limitado al precio de salida, low entero.
//   Una sola vela: las dos reglas a la vez sobre la misma vela. Si cualquiera de las dos la excluye,
//   queda el precio de entrada como máximo de partida y el de salida como candidato a mínimo.
//   Vela con open == close: el precio es a la vez el uno y el otro y no hay nada que lo desempate. Se
//   trata como apertura, es decir, la vela cuenta: esconder su recorrido sería ocultar una caída que
//   la posición pudo sufrir, y de las dos lecturas posibles esa es la que miente.
//
// El resultado es cero o negativo, en porcentaje sobre el máximo. En semanal es idéntico, sobre las
// velas semanales.

// Comparación de precios con tolerancia relativa: son float que vienen de dividir y multiplicar, así
// que `===` contra el open o el close falla por el último bit y mandaría una vela a la rama que no es.
function mismoPrecio(a, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false
  return Math.abs(a - b) <= Math.max(1e-6, Math.abs(b) * 1e-9)
}
const _r2 = (v) => Math.round(v * 100) / 100

// Índice fecha → posición en el array de velas. Se construye UNA vez por serie y se reutiliza para
// todas las operaciones: buscar con find por cada una convertía el cálculo en cuadrático.
export function indicePorFecha(barras) {
  const idx = {}
  if (!Array.isArray(barras)) return idx
  for (let i = 0; i < barras.length; i++) if (barras[i] && barras[i].date) idx[barras[i].date] = i
  return idx
}

// Drawdown de una operación. Devuelve { ddPct, maxPx, maxFecha, minPx, minFecha } o null si no hay
// datos para calcularlo: un null es honesto, un cero se leería como «no sufrió nada».
export function ddDeOperacion(t, barras, idx = null) {
  if (!t || !Array.isArray(barras) || !barras.length) return null
  const mapa = idx || indicePorFecha(barras)
  const i0 = mapa[t.entryDate], i1 = mapa[t.exitDate]
  if (i0 == null || i1 == null || i1 < i0) return null
  const eP = Number(t.entryPrice ?? t.entryPx), sP = Number(t.exitPrice ?? t.exitPx)
  if (!Number.isFinite(eP) || !Number.isFinite(sP) || eP <= 0) return null

  let max = eP, maxFecha = t.entryDate
  let dd = 0, ddMaxPx = eP, ddMaxFecha = t.entryDate, minPx = null, minFecha = null
  const mide = (bajo, fecha) => {
    if (!Number.isFinite(bajo) || !(max > 0)) return
    const caida = (bajo - max) / max * 100
    // Estrictamente peor: con empate se queda el primero, que es el valle más cercano al máximo.
    if (caida < dd) { dd = caida; ddMaxPx = max; ddMaxFecha = maxFecha; minPx = bajo; minFecha = fecha }
  }

  const unaVela = i0 === i1
  for (let i = i0; i <= i1; i++) {
    const b = barras[i]
    if (!b) continue
    let alto = Number.isFinite(b.high) ? b.high : b.close
    let bajo = Number.isFinite(b.low) ? b.low : b.close
    let cuenta = true
    if (i === i0) {
      if (mismoPrecio(eP, b.close) && !mismoPrecio(eP, b.open)) cuenta = false
      else if (!mismoPrecio(eP, b.open)) bajo = Math.max(bajo, eP)
    }
    if (i === i1) {
      if (mismoPrecio(sP, b.open) && !mismoPrecio(sP, b.close)) cuenta = false
      else if (!mismoPrecio(sP, b.close)) {
        if (sP < b.open) bajo = Math.max(bajo, sP)
        else alto = Math.min(alto, sP)
      }
    }
    if (!cuenta) continue
    if (unaVela && bajo > alto) continue   // los dos recortes se cruzan: la vela no dice nada
    // El low contra el máximo de ANTES de esta vela, y solo después el high actualiza el máximo. Ver
    // la nota sobre el orden dentro de una vela, arriba.
    mide(bajo, b.date)
    if (Number.isFinite(alto) && alto > max) { max = alto; maxFecha = b.date }
  }
  // El precio de salida, siempre, y al final: es el último precio que vivió la posición.
  mide(sP, t.exitDate)

  return { ddPct: _r2(dd), maxPx: ddMaxPx, maxFecha: ddMaxFecha, minPx, minFecha }
}

// Solo el porcentaje, que es lo que viaja en cada operación y lo que pintan las etiquetas.
export function ddPctDeOperacion(t, barras, idx = null) {
  const d = ddDeOperacion(t, barras, idx)
  return d ? d.ddPct : null
}

export default ddDeOperacion
