// lib/builder/ayuda.js — los textos de ayuda del Builder, en un solo sitio para reutilizarlos en todas sus pantallas: el «?»
// junto a cada término, el plegable «Cómo leer estos resultados», el plegable «Cómo funciona esta prueba» (con los datos
// guardados de cada prueba) y la página «Guía de las pruebas». Solo texto: no decide ni calcula nada.
//
// Los nombres del Builder (tanda 2c): «laboratorio de operaciones» (la prueba del laboratorio: media por operación en todo el
// Nasdaq-100), «laboratorio de cartera» (la prueba A / B del lote: la cartera real), «verificación de sesgos» (la
// calibración) y «mercados ficticios» (sus universos sintéticos). V9.1041: en pantalla, el grupo confirmado y congelado (un
// «lote» de editor_lotes) se llama «prueba» (QUE_ES_PRUEBA), y «prueba» no se usa para nada más. Lo que dicen
// sale de lib/editor/laboratorio.js, lib/laboratorioEstrategias.js y lib/azarCartera.js.
import { CALIBRACION, MAX_FALSOS_APROBADOS, PERCENTIL_SUPERA_LAB } from '../editor/laboratorio'

const UNIVERSOS = CALIBRACION.universos, MAX_APROBADOS = Math.floor(UNIVERSOS * MAX_FALSOS_APROBADOS / 100)

export const AYUDA = Object.freeze({
  copias: 'La app hace 500 copias de tu estrategia en el laboratorio de cartera y 1.000 en el laboratorio de operaciones. Hacen las mismas operaciones, en los mismos valores y con la misma duración, pero empezando en fechas elegidas al azar. Son estrategias sin ninguna ventaja.',
  gana: 'En qué puesto queda tu estrategia entre esas copias. «Gana a 95 %» quiere decir que solo 5 de cada 100 copias lo hicieron mejor: es difícil que sea suerte. Ejemplo: «Gana a 25,5 %» quiere decir que 3 de cada 4 copias lo hicieron mejor.',
  umbral: `Pasa si gana al menos al ${PERCENTIL_SUPERA_LAB} % de las copias en todos los periodos. Una estrategia sin ventaja lo consigue por casualidad como mucho 5 veces de cada 100 en cada periodo.`,
  p5p95: 'P5–P95: el rango donde cae el 90 % central de las copias al azar.',
  sesgos: `Antes de fiarse del laboratorio de operaciones, la app prueba tu estrategia en ${UNIVERSOS} mercados ficticios (precios inventados al azar) donde nadie puede tener ventaja. Si ahí quedara por encima de ${PERCENTIL_SUPERA_LAB} en más de ${MAX_APROBADOS} de los ${UNIVERSOS}, la comparación la favorecería: no se usaría y la estrategia quedaría sin veredicto.`,
  operaciones_cartera: 'Laboratorio de operaciones: compara la ganancia media por operación en todos los valores del Nasdaq-100. Laboratorio de cartera: simula la cartera real (30 valores, como mucho 4 posiciones) y compara su crecimiento anual. Si la estrategia pasa la verificación de sesgos, decide el laboratorio de operaciones; si no la pasa, se queda sin veredicto. Solo si no hay verificación, decide el de cartera.',
  cagr: 'CAGR: lo que crece el dinero de media cada año, con interés compuesto.',
  caida: 'Caída máxima: la mayor bajada desde un máximo hasta el punto más bajo siguiente. Mide cuánto habrías tenido que aguantar.',
  qqq: 'Lo que habría hecho comprar QQQ el primer día y no tocarlo. Sirve de referencia: si tu estrategia gana menos y no cae mucho menos, quizá no compensa.',
  // El chip de cada fila de resultados: dice de qué laboratorio sale (el que decide para esa variante).
  chipOperaciones: `Se refiere al laboratorio de operaciones (no al de cartera): en este periodo, tu estrategia gana (≥) o no gana (<) al menos al ${PERCENTIL_SUPERA_LAB} % de sus copias al azar. Para pasar, tiene que conseguirlo en todos los periodos.`,
  chipCartera: 'Se refiere al laboratorio de cartera (esta prueba no tiene verificación de sesgos, así que decide el de cartera): en este periodo, tu cartera gana (≥) o no gana (<) al menos al 95 % de sus copias al azar. Para pasar, tiene que conseguirlo en todos los periodos.',
})

// Qué es una prueba (la palabra del Builder para el grupo confirmado y congelado; en la base, un «lote» de editor_lotes).
export const QUE_ES_PRUEBA = 'Una prueba es lo que confirmas en el paso 2: qué variantes, en qué valores y en qué periodos. Una vez confirmada, ya no se puede cambiar. Ejemplo: PRUEBA_BUILDER_1 es una prueba con 1 variante, los 30 valores con más momentum del Nasdaq-100 y 2 periodos (2016–2020 y 2021–2025).'

// El «?» de «Gana a … de las copias» explica las copias y el puesto juntos.
export const AYUDA_GANA = `${AYUDA.copias} ${AYUDA.gana}`

// «Cómo leer estos resultados»: todos los textos, en el orden en que se leen.
export const COMO_LEER = Object.freeze([
  ['Las copias al azar', AYUDA.copias],
  ['Gana a … de las copias', AYUDA.gana],
  ['Pasa / No llega', AYUDA.umbral],
  ['P5–P95', AYUDA.p5p95],
  ['Verificación de sesgos', AYUDA.sesgos],
  ['Laboratorio de operaciones y laboratorio de cartera', AYUDA.operaciones_cartera],
  ['CAGR', AYUDA.cagr],
  ['Caída máxima', AYUDA.caida],
  ['QQQ sin hacer nada', AYUDA.qqq],
])

// ── «Cómo funciona esta prueba»: los textos con los datos guardados de cada prueba y periodo ──
// Si un dato no está guardado, la frase se escribe sin él (no se recalcula nada).
const entero = (x) => String(Math.round(x)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
const pct2 = (x) => `${(Math.round(x * 10000) / 100).toFixed(2).replace('.', ',')} %`
const dec1 = (x) => (Math.round(x * 10) / 10).toFixed(1).replace('.', ',')
const fin = (x) => typeof x === 'number' && Number.isFinite(x)

// lab: un periodo guardado del laboratorio de operaciones ({ operaciones, media, azar: { media, nSim } }); nombre: «2016–2020».
export function textoOperaciones(nombre, lab) {
  const ops = fin(lab?.operaciones) ? ` En ${nombre} hizo ${entero(lab.operaciones)} operaciones en los valores del Nasdaq-100.` : ''
  const real = fin(lab?.media) ? ` de lo real (${pct2(lab.media)})` : ' de lo real', copias = fin(lab?.azar?.media) ? ` y de la copia típica (${pct2(lab.azar.media)})` : ' y de las copias'
  const n = fin(lab?.azar?.nSim) ? `, con ${entero(lab.azar.nSim)} copias` : ''
  return `Primero se ejecuta tu estrategia completa, con sus entradas y sus salidas (stop y objetivo incluidos).${ops} Cada copia al azar repite esas mismas operaciones, en el mismo valor y con la misma duración, pero empezando en fechas al azar y sin mirar ninguna regla. Se comparan la ganancia media por operación${real}${copias}${n}. Responde: ¿tu estrategia elige mejor que el azar cuándo estar dentro?`
}
// cartera: un periodo guardado del laboratorio de cartera ({ descartadas, nSim }); comun: lo común del lote (universo,
// sizeRules); dondeTxt: «los 30 valores con más momentum» (o la lista fija).
export function textoCartera(nombre, cartera, comun, dondeTxt) {
  const maxPos = comun?.sizeRules?.maxPosiciones, prio = comun?.sizeRules?.prioridad === 'fuerza_relativa' ? ' las de más fuerza relativa' : ' unas pocas'
  const pos = fin(maxPos) ? ` y como mucho ${maxPos} posiciones a la vez` : ''
  const desc = fin(cartera?.descartadas) ? ` Las señales en valores que ese año no estaban entre los elegidos se descartan (${entero(cartera.descartadas)} en ${nombre}).` : ''
  const huecos = fin(maxPos) ? ` Cuando hay más señales que huecos, solo entran${prio}.` : ''
  const n = fin(cartera?.nSim) ? `${entero(cartera.nSim)} copias al azar` : 'copias al azar'
  return `Simula la cartera que usarías de verdad: ${dondeTxt}${pos}.${desc}${huecos} Se compara su crecimiento anual con ${n}, que colocan las mismas señales (cuántas y cuánto duran, por valor) en fechas al azar y las reparten con la misma regla. Responde: ¿cuánto habrías ganado, comparado con el azar?`
}
// cal: la verificación de sesgos guardada ({ universos, conOperaciones, aprobados, percentilMedio, calibrada }).
export const INDICE_FICTICIO = 'En los mercados ficticios también hay un índice inventado: la media de sus 100 valores. Si tu estrategia tiene un filtro de índice (por ejemplo, QQQ > SMA 200), ahí se aplica a ese índice inventado.'
export function textoSesgos(cal) {
  const base = `Antes de fiarse del laboratorio de operaciones, la app lo prueba en ${cal?.universos || UNIVERSOS} mercados ficticios donde ninguna estrategia puede tener ventaja. Ahí solo debería quedar por encima de ${PERCENTIL_SUPERA_LAB} unas 2 o 3 veces de ${cal?.universos || UNIVERSOS}, por suerte.`
  if (!cal) return `${base} ${INDICE_FICTICIO} Esta estrategia todavía no tiene la verificación hecha.`
  const de = cal.conOperaciones ?? cal.universos
  let veces = ''
  if (fin(cal.aprobados) && fin(de)) {
    const pocos = cal.universos && de < Math.ceil(cal.universos * 0.8)
    veces = pocos ? ` Esta estrategia solo operó en ${de} de los ${cal.universos}: no hay datos suficientes, así que no se usa y queda sin veredicto.`
      : ` Esta estrategia lo hizo ${cal.aprobados} ${cal.aprobados === 1 ? 'vez' : 'veces'} de ${de}: ${cal.calibrada ? 'la comparación no la favorece y se usa.' : 'la comparación la favorece: no se usa y la estrategia queda sin veredicto.'}`
  }
  let medio = ''
  if (fin(cal.percentilMedio)) {
    const p = cal.percentilMedio
    medio = ` De media quedó en el puesto ${dec1(p)}; una comparación neutral daría cerca de 50, así que con esta estrategia la comparación ${p < 45 ? 'es más dura de la cuenta' : p > 55 ? 'es más blanda de la cuenta' : 'se comporta como una neutral'}.`
  }
  return `${base} ${INDICE_FICTICIO}` + veces + medio
}

// ── «Cómo se prueba una estrategia» (la guía: la página fija del Builder) ──
export const GUIA = Object.freeze([
  { titulo: 'Qué es una prueba', parrafos: [
    QUE_ES_PRUEBA,
    'Dentro de cada prueba trabajan dos laboratorios (el de operaciones y el de cartera) y la verificación de sesgos. Se explican más abajo.',
  ] },
  { titulo: 'Para qué sirve probar contra el azar', parrafos: [
    'Cualquier estrategia gana dinero algunas veces, incluso una que compra y vende sin ningún criterio, sobre todo en un mercado que sube. Probar contra el azar responde a una sola pregunta: ¿tu estrategia gana por sus reglas, o habría ganado lo mismo comprando y vendiendo a ciegas?',
    'Para saberlo, la app compara lo que hizo tu estrategia con muchas copias que hacen lo mismo pero sin ninguna regla. Si tu estrategia queda claramente por encima de casi todas, es difícil que sea suerte.',
  ] },
  { titulo: 'Las copias al azar', parrafos: [
    'Una copia al azar hace el mismo número de operaciones que tu estrategia, en los mismos valores y con la misma duración, pero empezando en fechas elegidas al azar. No mira ninguna regla: es tu estrategia sin su «inteligencia».',
    'Ejemplo: tu estrategia hizo 3 operaciones en Apple: compró el 3 de marzo y vendió a los 4 días, el 10 de junio y vendió a los 2 días, el 5 de octubre y vendió a los 6 días. Una copia hace 3 operaciones en Apple de 4, 2 y 6 días, pero empezando por ejemplo el 21 de enero, el 2 de agosto y el 14 de noviembre.',
    'Dentro de una copia, las operaciones de un mismo valor no se pisan (nunca hay dos a la vez en Apple), y solo empiezan en días en que el valor estaba en la lista que se prueba (el Nasdaq-100, o los 30 elegidos de ese año en el laboratorio de cartera). El laboratorio de operaciones hace 1.000 copias; el de cartera, 500.',
  ] },
  { titulo: 'Qué es el percentil («Gana a … de las copias»)', parrafos: [
    'Es el puesto de tu estrategia entre las copias. «Gana a 95 %» quiere decir que solo 5 de cada 100 copias lo hicieron mejor: es difícil que sea suerte.',
    '«Gana a 25,5 %» quiere decir lo contrario: 3 de cada 4 copias lo hicieron mejor. Ahí las reglas no aportan nada que el azar no consiga.',
  ] },
  { titulo: 'P5–P95', parrafos: [
    'Si pones todas las copias en fila, de peor a mejor, P5 es la que deja un 5 % por debajo y P95 la que deja un 5 % por encima. Entre las dos está el 90 % central de las copias: lo que el azar consigue normalmente. Para pasar, tu estrategia tiene que quedar por encima de P95.',
  ] },
  { titulo: 'Por qué pedimos 95 o más en todos los periodos', parrafos: [
    `Una estrategia sin ventaja queda por encima de ${PERCENTIL_SUPERA_LAB} por pura suerte unas 5 veces de cada 100. Si se prueban muchas ideas, alguna lo conseguirá en un periodo sin merecerlo.`,
    'Pedirlo en todos los periodos (por ejemplo, 2016–2020 y 2021–2025) lo hace mucho más difícil por suerte —si los periodos fueran independientes, 1 vez de cada 400 con dos periodos— y además muestra que la estrategia funciona en mercados distintos, no solo en uno.',
  ] },
  { titulo: 'Laboratorio de operaciones y laboratorio de cartera', parrafos: [
    'Laboratorio de operaciones: ejecuta tu estrategia completa en todos los valores que estuvieron en el Nasdaq-100 en cada periodo, sin límite de posiciones. Mide la ganancia media por operación y la compara con 1.000 copias. Responde: ¿tu estrategia elige mejor que el azar cuándo estar dentro?',
    'Laboratorio de cartera: simula la cartera que usarías de verdad: cada año, los 30 valores del Nasdaq-100 con más momentum, y como mucho 4 posiciones a la vez (si hay más señales que huecos, entran las de más fuerza relativa). Mide el crecimiento anual (CAGR) y lo compara con 500 copias que colocan las mismas señales en fechas al azar y las reparten con la misma regla. Responde: ¿cuánto habrías ganado, comparado con el azar? También hace otra comparación, solo informativa: tus señales reales, pero eligiendo al azar cuál entra cuando no caben todas.',
    'Cuál decide: el laboratorio de operaciones, si la estrategia pasa la verificación de sesgos. Si no la pasa, la estrategia queda sin veredicto (el laboratorio de cartera se sigue viendo, pero no decide). Solo cuando no hay verificación —pruebas antiguas— decide el laboratorio de cartera.',
  ] },
  { titulo: 'Verificación de sesgos', parrafos: [
    'Antes de fiarte de una báscula, la pruebas con algo que sabes que pesa cero. Aquí igual: antes de fiarse del laboratorio de operaciones, la app lo prueba con tu estrategia en mercados donde sabemos que nadie puede tener ventaja.',
    `Son ${UNIVERSOS} mercados ficticios de ${CALIBRACION.valores} valores y ${CALIBRACION.anios} años cada uno. Sus precios se inventan al azar día a día (un «paseo aleatorio», con una ligera subida de fondo y una volatilidad parecida a la de una acción, un 2 % diario). No son precios reales barajados: son inventados, así que ninguna regla puede saber nada del futuro. Siempre son ${UNIVERSOS}.`,
    `En cada mercado ficticio se hace el laboratorio de operaciones completo. Por suerte, debería quedar por encima de ${PERCENTIL_SUPERA_LAB} unas 2 o 3 veces de ${UNIVERSOS}. Si lo hace en más de ${MAX_APROBADOS} de ${UNIVERSOS} (más del ${MAX_FALSOS_APROBADOS} %), la comparación la favorece: no se usa y la estrategia queda sin veredicto. También hace falta que la estrategia opere en al menos ${Math.ceil(UNIVERSOS * 0.8)} de los ${UNIVERSOS}.`,
    INDICE_FICTICIO,
    'El percentil medio es el puesto medio de tu estrategia en esos mercados ficticios. Una comparación neutral daría cerca de 50. Más bajo quiere decir que, con esa estrategia, la comparación es más dura de la cuenta (le cuesta más pasar); más alto, que es más blanda.',
    'Se hace una sola vez por versión de la estrategia (sus reglas con sus valores) y se guarda: si esa misma versión entra después en otra prueba, la verificación se salta.',
  ] },
  { titulo: 'Limitación conocida: los stops y los objetivos', parrafos: [
    'Las copias no tienen stop ni objetivo: solo copian la duración de cada operación. Si la operación real salió a media sesión por un stop o un objetivo, la copia sale al cierre de ese mismo día.',
    'Un stop corta las pérdidas pronto y deja correr las ganancias, y eso las copias no lo reproducen. Por eso, con stops, la comparación puede salir más dura (o más blanda) de la cuenta. La verificación de sesgos sirve justo para medirlo: su percentil medio dice hacia dónde se inclina con tu estrategia, y si se inclina demasiado a favor, no se usa.',
  ] },
  { titulo: 'La referencia «QQQ sin hacer nada»', parrafos: [
    'Es lo que habría hecho comprar QQQ (el fondo que replica el Nasdaq-100) el primer día del periodo y no tocarlo hasta el final, en la misma ejecución que tu cartera. En la tabla se ven su crecimiento anual y su caída máxima.',
    'Sirve de referencia: si tu estrategia gana menos que QQQ y no cae mucho menos, quizá no compensa el esfuerzo. Es solo informativa: no cambia el veredicto.',
  ] },
])
