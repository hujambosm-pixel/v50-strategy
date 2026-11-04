// lib/builder/ayuda.js — la guía «Cómo se prueba una estrategia» del Builder (components/BuilderGuia.js; docs/builder.md, §63): el sistema de hoy, el paso 2 (lib/pruebaAzar.js y lib/azarReglas.js). Solo texto: no decide ni calcula nada. Las cifras salen de la regla, REGLA_AZAR_REGLAS.
import { REGLA_AZAR_REGLAS } from '../azarReglas'

const R = REGLA_AZAR_REGLAS, miles = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
const [P1, P2] = R.periodos.map(([d, h]) => `${d.slice(0, 4)}–${h.slice(0, 4)}`)
const POR_ERROR = Math.round(R.mercados * 0.05)

export const GUIA = Object.freeze([
  { titulo: 'Qué es una prueba', parrafos: [
    'Una prueba es lo que confirmas en el paso 2: una estrategia de tarjetas en un valor, con velas diarias o semanales. Al confirmarla se guarda una foto exacta de la estrategia y la semilla del azar, antes de ver ningún resultado. Ese resultado ya no cambia, aunque luego cambies la estrategia.',
    `Ejemplo: «Cruce de medias 50/200 en AAPL, velas diarias», en los periodos ${P1} y ${P2}. Los periodos son fijos: los años anteriores son los que usas para crearla en el paso 1, y probarla ahí sería hacer trampa sin querer.`,
  ] },
  { titulo: 'Para qué sirve probar contra el azar', parrafos: [
    'Cualquier estrategia gana dinero algunas veces, sobre todo en un valor que sube. La prueba responde a una sola pregunta: ¿gana por su momento de compra, o habría ganado lo mismo comprando en cualquier fecha?',
    'Para saberlo, la app compara tu estrategia con muchas copias que compran al azar y venden igual que ella. Si queda por encima de casi todas, en los dos periodos, es difícil que sea suerte.',
  ] },
  { titulo: 'Las copias al azar', parrafos: [
    `En cada periodo se simulan ${miles(R.copias)} copias. Cada una compra en fechas al azar, a la apertura, con la misma frecuencia que tu estrategia. Después vende con las mismas reglas y los mismos stops que ella. Hace una sola operación a la vez y no usa el filtro de mercado. Lo que queda abierto el último día se vende a su cierre. Sin comisiones ni impuestos.`,
    'Ejemplo: si tu estrategia hizo 57 operaciones en un periodo con 394 días sin estar dentro, compró en 14,5 de cada 100 de esos días. Cada copia también compra, cada día sin posición, con esa probabilidad: unas veces hará más operaciones que tu estrategia y otras menos.',
  ] },
  { titulo: 'Qué quiere decir «Ganó al X %»', parrafos: [
    `Es el puesto de tu estrategia entre las copias, por su crecimiento anual. «Ganó al ${R.gana} %» quiere decir que solo 5 de cada 100 copias lo hicieron mejor.`,
    '«Ganó al 11,3 %» quiere decir lo contrario: casi 9 de cada 10 copias lo hicieron mejor. Ahí su momento de compra no aporta nada que el azar no consiga.',
  ] },
  { titulo: `Por qué hay que ganar al ${R.gana} % en los dos periodos`, parrafos: [
    `Pasa si gana al ${R.gana} % de las copias en ${P1} y también en ${P2}. Una estrategia sin ventaja llega al ${R.gana} % por suerte unas 5 veces de cada 100 en un periodo. Si se prueban muchas ideas, alguna lo conseguirá sin merecerlo. Pedirlo en los dos lo hace mucho más difícil, y muestra que funciona en mercados distintos.`,
    `Ejemplo: 99,2 % en ${P1} y 11,3 % en ${P2} no pasa. Lo más probable es que en el primero tuviera suerte o el mercado le favoreciera.`,
    `Con menos de ${R.pocasOperaciones} operaciones en un periodo, la pantalla avisa: el resultado puede ser casualidad.`,
  ] },
  { titulo: 'La fiabilidad de la prueba', parrafos: [
    `Antes de dar un veredicto, la app comprueba que la propia prueba no favorece a tu estrategia. Crea ${R.mercados} mercados ficticios con los días del mismo valor barajados en bloques de ${R.bloque} días, y en cada uno enfrenta a una estrategia que compra al azar contra sus copias. Ahí nadie tiene ventaja, así que lo normal es aprobar por error unas ${POR_ERROR} de ${R.mercados} veces, un 5 %.`,
    `Si aprueba por error ${R.sinVeredicto} de cada 100 veces o más, en cualquiera de los periodos, la app dice «Sin veredicto»: con esa estrategia la prueba no es fiable. Ejemplo: 12 de ${R.mercados} son un 6 % y la prueba sirve; 20 de ${R.mercados} son un 10 % y queda sin veredicto.`,
  ] },
  { titulo: 'Cómo leer el resultado', parrafos: [
    'El gráfico enseña cómo crecen 10.000 € al empezar, en escala logarítmica: la misma subida en % mide lo mismo arriba y abajo. Tu estrategia es la línea azul. Las 5 líneas grises resumen las copias: por debajo del percentil 95 quedan 95 de cada 100.',
    `Ejemplo: si el percentil 95 termina en 25.250 € y tu estrategia en 15.965 €, muchas copias lo hicieron mejor. También se ven tres copias concretas: la de mayor final, la del medio y la de menor final. Con «Ver en velas» se ven sus compras y ventas junto a las tuyas.`,
    `Hay tres pestañas: ${P1}, ${P2} y los diez años completos. El veredicto sale solo de los dos periodos. La pestaña completa es informativa y no cuenta.`,
  ] },
  { titulo: 'Si cambias la estrategia o borras una prueba', parrafos: [
    'Si cambias la regla de una estrategia con prueba, se guarda como «<nombre> · versión 2», sin prueba, y la original se queda con la suya. Si solo cambias el nombre o la descripción, se guarda sobre la misma.',
    'Puedes borrar una prueba, pero ten cuidado: si borras las que no pasan y te quedas solo con las que pasan, puedes estar quedándote con una que pasó por suerte. Ejemplo: de 20 ideas sin ventaja, lo esperable es que alguna llegue al 95 % en un periodo.',
  ] },
])
