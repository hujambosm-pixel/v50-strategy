// lib/builder/ayuda.js — los textos de ayuda del Builder, en un solo sitio para reutilizarlos en todas sus pantallas
// (el «?» junto a cada término y el plegable «Cómo leer estos resultados»). Solo texto: no decide nada.

export const AYUDA = Object.freeze({
  copias: 'La app hace 500 copias de tu estrategia (1.000 en el laboratorio) que compran y venden las mismas veces y durante el mismo tiempo, pero en fechas elegidas al azar. Son estrategias sin ninguna ventaja.',
  gana: 'En qué puesto queda tu estrategia entre esas copias. «Gana a 95 %» quiere decir que solo 5 de cada 100 copias lo hicieron mejor: es difícil que sea suerte. Ejemplo: «Gana a 25,5 %» quiere decir que 3 de cada 4 copias lo hicieron mejor.',
  umbral: 'Pasa si gana al menos al 95 % de las copias en todos los periodos. Una estrategia sin ventaja lo consigue por casualidad como mucho 5 veces de cada 100 en cada periodo.',
  p5p95: 'P5–P95: el rango donde cae el 90 % central de las copias al azar.',
  calibracion: 'Antes de fiarse de la comparación, la app prueba la estrategia en 50 mercados inventados donde nadie puede tener ventaja. Si ahí «aprobara» en más de 5 de los 50, la comparación no sería justa y no se usaría.',
  laboratorio_lote: 'Laboratorio: compara la ganancia media por operación en todos los valores del Nasdaq-100. Lote: simula la cartera real (30 valores, como mucho 4 posiciones) y compara su crecimiento anual. Si la calibración acepta el laboratorio, decide él; si no, decide el lote.',
  cagr: 'CAGR: lo que crece el dinero de media cada año, con interés compuesto.',
  caida: 'Caída máxima: la mayor bajada desde un máximo hasta el punto más bajo siguiente. Mide cuánto habrías tenido que aguantar.',
  qqq: 'Lo que habría hecho comprar QQQ el primer día y no tocarlo. Sirve de referencia: si tu estrategia gana menos y no cae mucho menos, quizá no compensa.',
})

// El «?» de «Gana a … de las copias» explica las copias y el puesto juntos.
export const AYUDA_GANA = `${AYUDA.copias} ${AYUDA.gana}`

// «Cómo leer estos resultados»: todos los textos, en el orden en que se leen.
export const COMO_LEER = Object.freeze([
  ['Las copias al azar', AYUDA.copias],
  ['Gana a … de las copias', AYUDA.gana],
  ['Pasa / No llega', AYUDA.umbral],
  ['P5–P95', AYUDA.p5p95],
  ['La calibración', AYUDA.calibracion],
  ['Laboratorio y lote', AYUDA.laboratorio_lote],
  ['CAGR', AYUDA.cagr],
  ['Caída máxima', AYUDA.caida],
  ['QQQ sin hacer nada', AYUDA.qqq],
])
