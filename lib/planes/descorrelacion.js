// lib/planes/descorrelacion.js — ¿el dinero ocioso ayuda cuando la estrategia cae? (P8, versión «una acción»; docs/planes-inversion.md
// §10). Puro.
//
// Las N peores caídas de la ESTRATEGIA SOLA (su curva sin el ocioso, en % sobre su valor liquidativo: lib/planes/estrategia.js
// curvaSola), cada una de su pico a su valle, con la fecha en que recupera el pico (o null), y lo que hizo el activo ocioso en esa
// MISMA ventana (de su cierre del día del pico a su cierre del día del valle; la liquidez, 0). Cada caída es un tramo distinto: de un
// pico a la vuelta a ese pico (o al final); dentro de un tramo solo cuenta su peor valle.

// Los tramos bajo el agua de una curva: [{ iPico, iValle, iRecuperacion, caida }] (caída en fracción, negativa).
export function tramosBajoElAgua(valores) {
  const out = []
  let iPico = 0, actual = null
  for (let i = 0; i < valores.length; i++) {
    if (valores[i] >= valores[iPico]) {
      if (actual) { actual.iRecuperacion = i; out.push(actual); actual = null }
      iPico = i
      continue
    }
    const dd = valores[i] / valores[iPico] - 1
    if (!actual) actual = { iPico, iValle: i, iRecuperacion: null, caida: dd }
    else if (dd < actual.caida) { actual.iValle = i; actual.caida = dd }
  }
  if (actual) out.push(actual)
  return out
}

// fechas, curva (la estrategia sola) y ocioso (los cierres del ocioso en las mismas fechas, o null para la liquidez), del mismo largo.
export function descorrelacion({ fechas, curva, ocioso = null, n = 5 }) {
  const tramos = tramosBajoElAgua(curva).sort((a, b) => a.caida - b.caida || a.iPico - b.iPico).slice(0, n)
  return tramos.map(t => ({
    pico: fechas[t.iPico], valle: fechas[t.iValle], recuperacion: t.iRecuperacion == null ? null : fechas[t.iRecuperacion],
    caida: t.caida, ocioso: ocioso ? ocioso[t.iValle] / ocioso[t.iPico] - 1 : 0,
  }))
}
