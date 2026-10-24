// lib/builder/fichas.js — la FICHA de cada condición del catálogo en el Builder (V9.1047; docs/builder.md, §13). Puro.
// El cálculo de cada condición está en lib/condiciones/catalogo.js (id, parámetros con sus rangos, calentamiento y serie); aquí
// solo lo que se enseña, sin tocar la definición guardada de las estrategias:
//   · grupo y nombre corto (el del catálogo);
//   · fila: la plantilla de la fila en una línea, con los números editables («RSI (2) < 15»);
//   · que / ejemplo: qué es cada número y un valor válido, para el mensaje de error («El nivel del RSI va de 0 a 100 (por
//     ejemplo, 15).»); el rango es el del catálogo (el mismo que comprueba la validación al guardar);
//   · nota(r, x): la nota gris, distinta según la tarjeta (filtro, compra, venta o cancelar la orden) y según los números;
//   · frase(r, x): el trozo de «La regla, en una frase»;
//   · explicacion: 2–3 frases en español sencillo con un ejemplo numérico (el «?» del catálogo y el de cada fila);
//   · aplica: 'ambos' (este valor o un índice) o 'valor' (solo este valor, con el motivo en una frase).
// Las velas previas que necesita cada condición son su calentamiento del catálogo (velasPrevias).
// El catálogo en pantalla (CATALOGO) son entradas: una condición con, si hace falta, unos valores de partida y «cruza»; así
// «Cruce de dos medias» es la condición «Una media frente a otra» que se cumple solo la vela del cruce.
import { CONDICIONES_EDITOR } from '../editor/definicion'

const fmt = (x) => typeof x === 'number' ? (Number.isInteger(x) && Math.abs(x) >= 1000 ? x.toLocaleString('de-DE') : String(x).replace('.', ',')).replace(/^-/, '−') : String(x ?? '')
// El plazo de una media (o de una ventana) en palabras, por las velas que abarca (en semanal, 5 días de mercado por vela).
// 5 velas diarias: corta; 20: de un mes; 50: de plazo medio; 200: larga, de casi un año.
export function plazo(n, intervalo = 'diario') {
  if (typeof n !== 'number' || !Number.isFinite(n)) return ''
  const d = intervalo === 'semanal' ? n * 5 : n
  return d <= 10 ? 'corta' : d <= 31 ? 'de un mes' : d <= 130 ? 'de plazo medio' : d <= 180 ? 'larga, de medio año' : d <= 260 ? 'larga, de casi un año' : 'muy larga, de más de un año'
}
// Lo que abarcan n velas, en palabras («de un mes», «de unos 3 meses», «de un año»…).
export function duracion(n, intervalo = 'diario') {
  if (typeof n !== 'number' || !Number.isFinite(n)) return ''
  const d = intervalo === 'semanal' ? n * 5 : n, meses = d / 21
  if (d < 15) return `de ${fmt(n)} ${n === 1 ? 'vela' : 'velas'}`
  if (meses < 1.5) return 'de un mes'
  if (meses < 10.5) return `de unos ${Math.round(meses)} meses`
  if (meses < 15) return 'de un año'
  return `de unos ${Math.round(d / 252)} años`
}
const ultimas = (n) => n === 1 ? 'la última vela' : `las ${fmt(n)} últimas velas`
const media = (tipo) => tipo === 'EMA' ? 'media exponencial' : 'media'
// Una nota por tarjeta: { filtro, compra, venta, cancelar }; la que falte, la de compra («cancelar» sin texto propio: «cancela si…»).
// «1,5 veces» (con k = 1, sin número: «supera su media»).
const veces = (r, x) => r.k === 1 && x.n('k') !== '[?]' ? '' : `${x.n('k')} veces `
const segun = (t, o) => o[t] ?? (t === 'cancelar' ? `cancela si ${o.compra}` : o.compra)

export const SOLO_VALOR = 'Esta condición solo se puede aplicar a este valor'
const VOLUMEN_INDICE = ' En un índice (QQQ, SPY…) se mira el volumen del fondo; en algunos ETF el volumen de Yahoo no es fiable.'

// ── Las fichas, por id de condición ──
// x: { tarjeta, intervalo, negada, incl, bajo, n: (clave) → número o «[?]» si tiene error, S: el sujeto («el valor» o el
// índice), V: ¿es este valor?, el(nombre, femenino): «su …» o «el … de QQQ», cierre: «el cierre» o «el cierre de QQQ» }.
export const FICHAS = Object.freeze({
  precioVsMedia: {
    grupo: 'precio', nombre: 'Cierre frente a su media',
    fila: ['Cierre', { k: 'lado', tipo: 'op' }, { k: 'tipo', tipo: 'media' }, '(', { k: 'periodo', tipo: 'num' }, ')'],
    que: { periodo: 'El periodo de la media' }, ejemplo: { periodo: 20 },
    explicacion: 'Compara el cierre de cada vela con su media: el promedio de los cierres de las últimas N velas. La SMA es la media simple; la EMA da más peso a las velas recientes y reacciona antes. Ejemplo: con «Cierre > SMA (200)», si la media de los últimos 200 cierres es 95 € y hoy cierra a 100 €, se cumple; si cierra a 90 €, no.',
    nota: (r, x) => { const P = plazo(r.periodo, x.intervalo), a = !x.bajo
      return segun(x.tarjeta, { filtro: a ? `tendencia al alza: sobre su media ${P}` : `tendencia a la baja: bajo su media ${P}`, compra: a ? `va por encima de su media ${P}` : `ha caído bajo su media ${P}`,
        venta: a ? `ha subido por encima de su media ${P}` : `ha perdido su media ${P}`, cancelar: a ? `cancela si sube sobre su media ${P}` : `cancela si pierde su media ${P}` }) },
    frase: (r, x) => x.incl ? `${x.cierre} está en o por ${x.bajo ? 'debajo' : 'encima'} de su ${media(r.tipo)} de ${x.n('periodo')} velas` : `${x.S} cierra ${x.bajo ? 'bajo' : 'sobre'} su ${media(r.tipo)} de ${x.n('periodo')} velas`,
  },
  mediaVsMedia: {
    grupo: 'precio', nombre: 'Una media frente a otra',
    fila: [{ k: 'tipoRapida', tipo: 'media' }, '(', { k: 'periodoRapida', tipo: 'num' }, ')', { k: 'lado', tipo: 'op' }, { k: 'tipoLenta', tipo: 'media' }, '(', { k: 'periodoLenta', tipo: 'num' }, ')'],
    que: { periodoRapida: 'El periodo de la media rápida', periodoLenta: 'El periodo de la media lenta' }, ejemplo: { periodoRapida: 10, periodoLenta: 50 },
    explicacion: 'Compara dos medias del cierre: una rápida (de pocas velas) y una lenta (de muchas). Si la rápida va por encima, los precios recientes son más altos que los de antes: tendencia al alza. Ejemplo: con «EMA (10) > EMA (50)», si la EMA de 10 vale 105 € y la de 50 vale 100 €, se cumple.',
    nota: (r, x) => { const a = !x.bajo, R = plazo(r.periodoRapida, x.intervalo), L = plazo(r.periodoLenta, x.intervalo)
      return segun(x.tarjeta, { filtro: a ? 'tendencia al alza: la media rápida va sobre la lenta' : 'tendencia a la baja: la media rápida va bajo la lenta', compra: a ? `la media ${R} va sobre la ${L}` : `la media ${R} va bajo la ${L}`,
        venta: a ? 'la media rápida vuelve sobre la lenta' : 'la media rápida cae bajo la lenta: la tendencia se gira', cancelar: a ? 'cancela si la media rápida sube sobre la lenta' : 'cancela si la media rápida cae bajo la lenta' }) },
    frase: (r, x) => `${x.el(`${media(r.tipoRapida)} de ${x.n('periodoRapida')} velas`, true)} está ${x.incl ? 'en o ' : ''}por ${x.bajo ? 'debajo' : 'encima'} de la ${media(r.tipoLenta)} de ${x.n('periodoLenta')} velas`,
  },
  mediaPendiente: {
    grupo: 'precio', nombre: 'La media sube o baja',
    fila: [{ k: 'tipo', tipo: 'media' }, '(', { k: 'periodo', tipo: 'num' }, ')', { k: 'lado', tipo: 'op' }, 'la de hace', { k: 'n', tipo: 'num' }, 'velas'],
    que: { periodo: 'El periodo de la media', n: 'El número de velas atrás' }, ejemplo: { periodo: 50, n: 5 },
    explicacion: 'Mira si la media va subiendo o bajando: compara lo que vale hoy con lo que valía hace N velas. Ejemplo: con «SMA (50) > la de hace 5 velas», si hoy la media de 50 vale 102 € y hace 5 velas valía 100 €, la media sube y se cumple; si vale lo mismo, no.',
    nota: (r, x) => { const P = plazo(r.periodo, x.intervalo), a = !x.bajo
      return segun(x.tarjeta, { filtro: a ? `su media ${P} sube: tendencia al alza` : `su media ${P} baja: tendencia a la baja`, compra: a ? `su media ${P} va subiendo` : `su media ${P} va bajando`,
        venta: a ? `su media ${P} ha vuelto a subir` : `su media ${P} ha empezado a bajar`, cancelar: a ? `cancela si su media ${P} sube` : `cancela si su media ${P} baja` }) },
    frase: (r, x) => `${x.el(`${media(r.tipo)} de ${x.n('periodo')} velas`, true)} está ${x.incl ? 'igual o ' : ''}más ${x.bajo ? 'baja' : 'alta'} que hace ${x.n('n')} velas`,
  },
  distanciaMedia: {
    grupo: 'precio', nombre: 'Cierre cerca de su media',
    fila: ['Cierre a menos de', { k: 'pct', tipo: 'num' }, '% de su', { k: 'tipo', tipo: 'media' }, '(', { k: 'periodo', tipo: 'num' }, ')'],
    que: { pct: 'La distancia', periodo: 'El periodo de la media' }, ejemplo: { pct: 3, periodo: 20 },
    explicacion: 'Mide lo lejos que está el cierre de su media, en % de la media, hacia arriba o hacia abajo. Se cumple si está a menos de ese %; justo en el % no cuenta. Ejemplo: con 3 % y la SMA (20) en 100 €, se cumple si cierra entre 97 € y 103 € (sin contar 97 ni 103).',
    nota: (r, x) => { const P = plazo(r.periodo, x.intervalo), d = `${fmt(r.pct)} %`
      return x.negada ? segun(x.tarjeta, { compra: `a un ${d} o más de su media ${P}`, filtro: `alejado de su media ${P}`, venta: `se ha alejado de su media ${P}`, cancelar: `cancela si se aleja un ${d} de su media` })
        : segun(x.tarjeta, { compra: `a menos de un ${d} de su media ${P}`, filtro: `sin alejarse de su media ${P}`, venta: `ha vuelto cerca de su media ${P}`, cancelar: `cancela si vuelve cerca de su media ${P}` }) },
    frase: (r, x) => `${x.cierre} está a ${x.negada ? `un ${x.n('pct')} % o más` : `menos de un ${x.n('pct')} %`} de su ${media(r.tipo)} de ${x.n('periodo')} velas`,
  },
  cambioPrecio: {
    grupo: 'precio', nombre: 'Cierre frente al de hace N velas',
    fila: ['Cierre', { k: 'lado', tipo: 'op' }, 'el de hace', { k: 'n', tipo: 'num' }, 'velas'],
    que: { n: 'El número de velas atrás' }, ejemplo: { n: 5 },
    explicacion: 'Compara el cierre de hoy con el de hace N velas. Ejemplo: con «Cierre > el de hace 5 velas», si hace 5 velas cerró a 100 € y hoy cierra a 101 €, se cumple; si hoy cierra a 100 € justos, no: tiene que ser más alto.',
    nota: (r, x) => { const a = !x.bajo, u = ultimas(r.n)
      return segun(x.tarjeta, { filtro: a ? `ha subido en ${u}` : `ha bajado en ${u}`, compra: a ? `cierra más alto que hace ${fmt(r.n)} velas` : `cierra más bajo que hace ${fmt(r.n)} velas`,
        venta: a ? `ya ha subido en ${u}` : `ha bajado en ${u}`, cancelar: a ? `cancela si sube en ${u}` : `cancela si baja en ${u}` }) },
    frase: (r, x) => `${x.cierre} es ${x.incl ? 'igual o ' : ''}más ${x.bajo ? 'bajo' : 'alto'} que el de hace ${x.n('n')} velas`,
  },
  caidaDesdeMaximo: {
    grupo: 'precio', nombre: 'Caída desde el máximo',
    fila: ['Caída ≥', { k: 'pct', tipo: 'num' }, '% desde el máximo de', { k: 'ventana', tipo: 'num' }, 'velas'],
    que: { pct: 'La caída', ventana: 'El número de velas del máximo' }, ejemplo: { pct: 10, ventana: 252 },
    explicacion: 'Mira el cierre más alto de las últimas N velas y se cumple cuando el precio ha caído al menos un X % desde ahí; sigue cumpliéndose hasta que vuelva a superar ese máximo. Ejemplo: con 10 % y 252 velas (un año en diario), si el máximo fue 200 € y cierra a 180 € o menos, se cumple.',
    nota: (r, x) => { const D = duracion(r.ventana, x.intervalo), d = `${fmt(r.pct)} %`
      return x.negada ? segun(x.tarjeta, { compra: `a menos de un ${d} de su máximo ${D}`, filtro: 'sigue cerca de su máximo', cancelar: `cancela si vuelve cerca de su máximo` })
        : segun(x.tarjeta, { compra: `ha caído al menos un ${d} desde su máximo ${D}`, filtro: `en retroceso: −${d} o más desde su máximo`, venta: `ha caído un ${d} desde su máximo`, cancelar: `cancela si cae un ${d} desde su máximo` }) },
    frase: (r, x) => x.negada ? `${x.S} está a menos de un ${x.n('pct')} % de su máximo de las últimas ${x.n('ventana')} velas` : `${x.S} ha caído al menos un ${x.n('pct')} % desde su máximo de las últimas ${x.n('ventana')} velas`,
  },
  rsiNivel: {
    grupo: 'osciladores', nombre: 'RSI frente a un nivel',
    fila: ['RSI (', { k: 'periodo', tipo: 'num' }, ')', { k: 'lado', tipo: 'op' }, { k: 'umbral', tipo: 'num' }],
    que: { periodo: 'El periodo del RSI', umbral: 'El nivel del RSI' }, ejemplo: { periodo: 2, umbral: 15 },
    explicacion: 'El RSI mide de 0 a 100 si un valor ha subido o bajado mucho últimamente. Con 2 velas reacciona muy rápido. RSI (2) < 15 significa que en las 2 últimas velas ha caído con mucha fuerza: por ejemplo, un valor que cae un 3 % y luego un 2 %.',
    nota: (r, x) => { const u = ultimas(r.periodo)
      if (x.bajo && r.umbral <= 30) return segun(x.tarjeta, { filtro: `muy castigado en ${u}`, compra: `ha caído mucho en ${u}`, venta: 'se ha desplomado', cancelar: 'cancela si se desploma' })
      if (!x.bajo && r.umbral >= 70) return segun(x.tarjeta, { filtro: `con mucha fuerza en ${u}`, compra: `ha subido mucho en ${u}`, venta: 'ya ha rebotado con fuerza', cancelar: 'cancela si sube con fuerza' })
      return segun(x.tarjeta, x.bajo ? { compra: 'le falta fuerza', venta: 'ha perdido fuerza', cancelar: 'cancela si pierde fuerza' } : { compra: 'tiene fuerza', venta: 'ha recuperado fuerza', cancelar: 'cancela si recupera fuerza' }) },
    frase: (r, x) => x.incl ? `${x.el(`RSI de ${x.n('periodo')} velas`)} está en ${x.n('umbral')} o por ${x.bajo ? 'debajo' : 'encima'}` : `${x.el(`RSI de ${x.n('periodo')} velas`)} ${x.bajo ? 'baja' : 'sube'} de ${x.n('umbral')}`,
  },
  macdSenal: {
    grupo: 'osciladores', nombre: 'MACD frente a su señal',
    fila: ['MACD (', { k: 'rapida', tipo: 'num' }, ',', { k: 'lenta', tipo: 'num' }, ',', { k: 'senal', tipo: 'num' }, ')', { k: 'lado', tipo: 'op' }, 'su señal'],
    que: { rapida: 'La media rápida del MACD', lenta: 'La media lenta del MACD', senal: 'La señal del MACD' }, ejemplo: { rapida: 12, lenta: 26, senal: 9 },
    explicacion: 'El MACD es la diferencia entre una media exponencial rápida (12 velas) y una lenta (26); su señal es la media exponencial de 9 velas del propio MACD. Si el MACD va por encima de su señal, el impulso al alza crece. Ejemplo: con el MACD en 1,5 y la señal en 1,2, se cumple «MACD > su señal».',
    nota: (r, x) => !x.bajo ? segun(x.tarjeta, { filtro: 'impulso al alza', compra: 'el impulso gira al alza', venta: 'el impulso vuelve al alza', cancelar: 'cancela si el impulso gira al alza' })
      : segun(x.tarjeta, { filtro: 'impulso a la baja', compra: 'el impulso se frena', venta: 'el impulso se frena: la subida pierde fuerza', cancelar: 'cancela si el impulso se frena' }),
    frase: (r, x) => `${x.el(`MACD (${x.n('rapida')}, ${x.n('lenta')}, ${x.n('senal')})`)} está ${x.incl ? 'en o ' : ''}por ${x.bajo ? 'debajo' : 'encima'} de su señal`,
  },
  macdCero: {
    grupo: 'osciladores', nombre: 'MACD frente a 0',
    fila: ['MACD (', { k: 'rapida', tipo: 'num' }, ',', { k: 'lenta', tipo: 'num' }, ')', { k: 'lado', tipo: 'op' }, '0'],
    que: { rapida: 'La media rápida del MACD', lenta: 'La media lenta del MACD' }, ejemplo: { rapida: 12, lenta: 26 },
    explicacion: 'El MACD por encima de 0 quiere decir que la media exponencial rápida (12 velas) va por encima de la lenta (26): tendencia al alza. Ejemplo: con la EMA de 12 en 103 € y la de 26 en 100 €, el MACD vale 3, por encima de 0, y «MACD > 0» se cumple.',
    nota: (r, x) => !x.bajo ? segun(x.tarjeta, { filtro: 'tendencia al alza (MACD positivo)', compra: 'MACD positivo: la media rápida va sobre la lenta', venta: 'el MACD vuelve a ser positivo', cancelar: 'cancela si el MACD pasa a positivo' })
      : segun(x.tarjeta, { filtro: 'tendencia a la baja (MACD negativo)', compra: 'MACD negativo: la media rápida va bajo la lenta', venta: 'el MACD pasa a negativo: la tendencia se gira', cancelar: 'cancela si el MACD pasa a negativo' }),
    frase: (r, x) => `${x.el(`MACD (${x.n('rapida')}, ${x.n('lenta')})`)} está ${x.incl ? `en 0 o por ${x.bajo ? 'debajo' : 'encima'}` : `por ${x.bajo ? 'debajo' : 'encima'} de 0`}`,
  },
  rocNivel: {
    grupo: 'osciladores', nombre: 'ROC: cambio en % en N velas',
    fila: ['Cambio en', { k: 'n', tipo: 'num' }, 'velas', { k: 'lado', tipo: 'op' }, { k: 'umbral', tipo: 'num' }, '%'],
    que: { n: 'El número de velas', umbral: 'El nivel del cambio' }, ejemplo: { n: 10, umbral: 5 },
    explicacion: 'El ROC es lo que ha cambiado el cierre en las últimas N velas, en %. Ejemplo: con «Cambio en 10 velas > 5 %», si hace 10 velas cerró a 100 € y hoy a 106 €, el cambio es +6 % y se cumple; a 105 € justos (+5 %), no. Admite niveles negativos: «< −5 %» es que ha caído más de un 5 %.',
    nota: (r, x) => { const u = ultimas(r.n), v = fmt(Math.abs(r.umbral))
      const s = !x.bajo ? (r.umbral >= 0 ? `ha subido más de un ${v} % en ${u}` : `ha caído menos de un ${v} % en ${u}`) : (r.umbral <= 0 ? `ha caído más de un ${v} % en ${u}` : `ha subido menos de un ${v} % en ${u}`)
      return segun(x.tarjeta, { compra: s }) },
    frase: (r, x) => `${x.V ? 'el cambio' : `el cambio de ${x.S}`} en las ${x.n('n')} últimas velas es ${x.incl ? 'igual o ' : ''}${x.bajo ? 'menor' : 'mayor'} que ${x.n('umbral')} %`,
  },
  bollingerBanda: {
    grupo: 'volatilidad', nombre: 'Cierre frente a una banda de Bollinger',
    fila: ['Cierre', { k: 'lado', tipo: 'op' }, 'banda', { k: 'banda', tipo: 'opcion' }, 'de Bollinger (', { k: 'periodo', tipo: 'num' }, ',', { k: 'desviaciones', tipo: 'num' }, ')'],
    que: { periodo: 'El periodo de las bandas', desviaciones: 'Las desviaciones de las bandas' }, ejemplo: { periodo: 20, desviaciones: 2 },
    explicacion: 'Las bandas de Bollinger se ponen a 2 desviaciones por encima y por debajo de la media de 20 velas: marcan lo que es un movimiento normal, y cerrar fuera es raro. Ejemplo: con la media en 100 € y la desviación en 3 €, la banda inferior está en 94 € y la superior en 106 €; «Cierre < banda inferior» se cumple si cierra por debajo de 94 €.',
    nota: (r, x) => { const inf = r.banda !== 'superior'
      if (inf && x.bajo) return segun(x.tarjeta, { filtro: 'cae con una fuerza poco normal', compra: 'ha caído más de lo normal: posible rebote', venta: 'se ha hundido más de lo normal', cancelar: 'cancela si se hunde bajo su banda inferior' })
      if (!inf && !x.bajo) return segun(x.tarjeta, { filtro: 'sube con una fuerza poco normal', compra: 'sube más de lo normal', venta: 'ha subido más de lo normal: posible techo', cancelar: 'cancela si se dispara sobre su banda superior' })
      return segun(x.tarjeta, { compra: `por ${x.bajo ? 'debajo' : 'encima'} de su banda ${r.banda}`, cancelar: `cancela si queda por ${x.bajo ? 'debajo' : 'encima'} de su banda ${r.banda}` }) },
    frase: (r, x) => `${x.cierre} está ${x.incl ? 'en o ' : ''}por ${x.bajo ? 'debajo' : 'encima'} de la banda ${r.banda} de Bollinger (${x.n('periodo')} velas, ${x.n('desviaciones')} desviaciones)`,
  },
  atrPct: {
    grupo: 'volatilidad', nombre: 'ATR en % del precio',
    fila: ['ATR (', { k: 'periodo', tipo: 'num' }, ') en % del precio', { k: 'lado', tipo: 'op' }, { k: 'umbral', tipo: 'num' }, '%'],
    que: { periodo: 'El periodo del ATR', umbral: 'El nivel del ATR' }, ejemplo: { periodo: 14, umbral: 3 },
    explicacion: 'El ATR es lo que se mueve el precio de media en cada vela (de máximo a mínimo, contando los saltos entre velas) en las últimas N velas. Aquí se pone en % del cierre, para comparar valores caros y baratos. Ejemplo: un ATR de 3 € con el cierre en 100 € es un 3 %; «ATR (14) en % del precio > 2 %» se cumple.',
    nota: (r, x) => !x.bajo ? segun(x.tarjeta, { filtro: 'mercado nervioso', compra: `se mueve mucho: más de un ${fmt(r.umbral)} % por vela`, cancelar: `cancela si se mueve más de un ${fmt(r.umbral)} % por vela` })
      : segun(x.tarjeta, { filtro: 'mercado tranquilo', compra: `se mueve poco: menos de un ${fmt(r.umbral)} % por vela`, cancelar: `cancela si se mueve menos de un ${fmt(r.umbral)} % por vela` }),
    frase: (r, x) => `${x.el(`ATR de ${x.n('periodo')} velas`)} es ${x.incl ? 'igual o ' : ''}${x.bajo ? 'menor' : 'mayor'} que un ${x.n('umbral')} % del cierre`,
  },
  volumenAlto: {
    grupo: 'volumen', nombre: 'Volumen alto',
    fila: ['Volumen >', { k: 'k', tipo: 'num' }, '× su media de', { k: 'n', tipo: 'num' }, 'velas'],
    que: { k: 'Las veces la media', n: 'El número de velas de la media' }, ejemplo: { k: 1.5, n: 20 },
    explicacion: 'Compara el volumen de la vela (las acciones negociadas) con la media del volumen de las N velas anteriores. Ejemplo: con «Volumen > 1,5 × su media de 20 velas», si la media es 1 millón, se cumple con más de 1,5 millones.' + VOLUMEN_INDICE,
    nota: (r, x) => x.negada ? segun(x.tarjeta, { compra: 'se negocia lo normal o menos' }) : segun(x.tarjeta, { compra: r.k === 1 ? 'se negocia más de lo normal' : `se negocia más de ${fmt(r.k)} veces lo normal` }),
    frase: (r, x) => x.negada ? `${x.el('volumen')} es como mucho ${veces(r, x)}su media de las ${x.n('n')} velas anteriores` : `${x.el('volumen')} supera ${veces(r, x)}su media de las ${x.n('n')} velas anteriores`,
  },
  volumenBajo: {
    grupo: 'volumen', nombre: 'Volumen bajo',
    fila: ['Volumen <', { k: 'k', tipo: 'num' }, '× su media de', { k: 'n', tipo: 'num' }, 'velas'],
    que: { k: 'Las veces la media', n: 'El número de velas de la media' }, ejemplo: { k: 1, n: 20 },
    explicacion: 'Se cumple cuando el volumen de la vela no llega a K veces la media del volumen de las N velas anteriores. Ejemplo: con «Volumen < 1 × su media de 20 velas», si la media es 1 millón, se cumple con menos de 1 millón (con 1 millón justo, no).' + VOLUMEN_INDICE,
    nota: (r, x) => x.negada ? segun(x.tarjeta, { compra: 'se negocia lo normal o más' }) : segun(x.tarjeta, { compra: r.k === 1 ? 'se negocia menos de lo normal' : `se negocia menos de ${fmt(r.k)} veces lo normal` }),
    frase: (r, x) => x.negada ? `${x.el('volumen')} es al menos ${veces(r, x)}su media de las ${x.n('n')} velas anteriores` : `${x.el('volumen')} no llega a ${veces(r, x)}su media de las ${x.n('n')} velas anteriores`,
  },
  nuevoMaximo: {
    grupo: 'rupturas', nombre: 'Nuevo máximo de N velas',
    fila: ['Cierre > máximo de las', { k: 'n', tipo: 'num' }, 'velas anteriores'],
    que: { n: 'El número de velas' }, ejemplo: { n: 20 },
    explicacion: 'Se cumple cuando el cierre supera el precio más alto (los máximos de cada vela) de las N velas anteriores, sin contar la de hoy. Ejemplo: con 20 velas, si el máximo de las 20 anteriores fue 50 € y hoy cierra a 50,5 €, se cumple; a 50 € justos, no.',
    nota: (r, x) => x.negada ? segun(x.tarjeta, { compra: 'no rompe su máximo reciente' }) : segun(x.tarjeta, { filtro: `en máximos ${duracion(r.n, x.intervalo)}`, compra: `rompe su máximo ${duracion(r.n, x.intervalo)}`, venta: 'ha llegado a máximos' }),
    frase: (r, x) => x.negada ? `${x.S} cierra en o por debajo del máximo de las ${x.n('n')} velas anteriores` : `${x.S} cierra por encima del máximo de las ${x.n('n')} velas anteriores`,
  },
  nuevoMinimo: {
    grupo: 'rupturas', nombre: 'Nuevo mínimo de N velas',
    fila: ['Cierre < mínimo de las', { k: 'n', tipo: 'num' }, 'velas anteriores'],
    que: { n: 'El número de velas' }, ejemplo: { n: 20 },
    explicacion: 'Se cumple cuando el cierre queda por debajo del precio más bajo (los mínimos de cada vela) de las N velas anteriores, sin contar la de hoy. Ejemplo: con 20 velas, si el mínimo de las 20 anteriores fue 40 € y hoy cierra a 39,5 €, se cumple; a 40 € justos, no.',
    nota: (r, x) => x.negada ? segun(x.tarjeta, { compra: 'no marca mínimos' }) : segun(x.tarjeta, { filtro: `en mínimos ${duracion(r.n, x.intervalo)}`, compra: `rompe su mínimo ${duracion(r.n, x.intervalo)}`, venta: `pierde su mínimo ${duracion(r.n, x.intervalo)}` }),
    frase: (r, x) => x.negada ? `${x.S} cierra en o por encima del mínimo de las ${x.n('n')} velas anteriores` : `${x.S} cierra por debajo del mínimo de las ${x.n('n')} velas anteriores`,
  },
  cercaMaximo: {
    grupo: 'rupturas', nombre: 'Cierre cerca del máximo de N velas',
    fila: ['Cierre a menos de', { k: 'pct', tipo: 'num' }, '% del máximo de', { k: 'n', tipo: 'num' }, 'velas'],
    que: { pct: 'La distancia', n: 'El número de velas' }, ejemplo: { pct: 5, n: 50 },
    explicacion: 'Mira el precio más alto de las últimas N velas (contando la de hoy) y se cumple si el cierre está a menos de ese % por debajo. Ejemplo: con 5 % y 50 velas, si el máximo fue 100 €, se cumple al cerrar por encima de 95 €; a 95 € justos, no.',
    nota: (r, x) => x.negada ? segun(x.tarjeta, { compra: `a un ${fmt(r.pct)} % o más de su máximo ${duracion(r.n, x.intervalo)}`, cancelar: `cancela si se aleja un ${fmt(r.pct)} % de su máximo` }) : segun(x.tarjeta, { compra: `a menos de un ${fmt(r.pct)} % de su máximo ${duracion(r.n, x.intervalo)}`, venta: 'ha vuelto cerca de su máximo', cancelar: 'cancela si vuelve cerca de su máximo' }),
    frase: (r, x) => `${x.cierre} está a ${x.negada ? `un ${x.n('pct')} % o más` : `menos de un ${x.n('pct')} %`} del máximo de las ${x.n('n')} últimas velas`,
  },
  fuerzaRelativaPercentil: {
    grupo: 'mercado', nombre: 'Fuerza relativa en el Nasdaq-100', aplica: 'valor',
    motivo: 'la fuerza relativa compara este valor con los demás del Nasdaq-100; a un índice (QQQ, SPY…) no se le puede aplicar.',
    fila: ['Fuerza relativa', { k: 'lado', tipo: 'op' }, 'percentil', { k: 'umbral', tipo: 'num' }],
    que: { umbral: 'El percentil' }, ejemplo: { umbral: 80 },
    explicacion: 'Ordena los valores del Nasdaq-100 por lo que han subido en los últimos 12 meses (con más peso los meses recientes) y dice qué puesto ocupa este, de 0 a 100. Ejemplo: percentil 80 = ha subido más que el 80 % de los demás. Solo se puede aplicar a este valor, no a un índice.',
    nota: (r, x) => !x.bajo ? segun(x.tarjeta, { compra: `sube más que el ${fmt(r.umbral)} % del Nasdaq-100`, venta: 'sigue entre los que más suben' })
      : segun(x.tarjeta, { compra: `sube menos que el ${fmt(100 - r.umbral)} % del Nasdaq-100`, venta: 'ha dejado de estar entre los que más suben' }),
    frase: (r, x) => `${x.el('fuerza relativa en el Nasdaq-100', true)} está ${x.incl ? 'en o ' : ''}por ${x.bajo ? 'debajo' : 'encima'} del percentil ${x.n('umbral')}`,
  },
})

// ── Los grupos y las entradas del catálogo, en este orden ──
export const GRUPOS_CATALOGO = Object.freeze([
  ['precio', 'Precio y medias'], ['osciladores', 'Osciladores'], ['volatilidad', 'Volatilidad'], ['volumen', 'Volumen'], ['rupturas', 'Rupturas'], ['mercado', 'Mercado'],
])
export const AVISO_GRUPO = Object.freeze({ mercado: 'Para filtrar por un índice (QQQ, SPY…), añade cualquier condición a «Solo opero cuando…» y elige el índice en su fila.' })
const cruce = (que) => `Se cumple solo en la vela en que ${que}, no en las siguientes.`
// { clave, c (la condición), env? ('cruza'), p? (valores de partida, encima de los del catálogo), nombre, explicacion, buscar }
export const CATALOGO = Object.freeze([
  { clave: 'precioVsMedia', c: 'precioVsMedia', buscar: 'precio cierre media sma ema tendencia encima debajo' },
  { clave: 'cruceCierreMedia', c: 'precioVsMedia', env: 'cruza', p: { tipo: 'EMA', periodo: 20 }, nombre: 'El cierre cruza su media', buscar: 'cruce cruza precio cierre media sma ema',
    explicacion: cruce('el cierre pasa al otro lado de su media') + ' Ejemplo: con «Cierre cruza ↑ EMA (20)», ayer cerró a 98 € con la media en 99 € y hoy cierra a 101 € con la media en 99,5 €: se cumple hoy, y mañana ya no aunque siga por encima. «cruza ↓» es lo mismo hacia abajo.' },
  { clave: 'mediaVsMedia', c: 'mediaVsMedia', p: { periodoLenta: 50 }, buscar: 'media medias sma ema tendencia rapida lenta' },
  { clave: 'cruceMedias', c: 'mediaVsMedia', env: 'cruza', p: { periodoLenta: 50 }, nombre: 'Cruce de dos medias', buscar: 'cruce cruza medias sma ema rapida lenta',
    explicacion: cruce('la media rápida pasa al otro lado de la lenta') + ' Ejemplo: con «EMA (10) cruza ↑ EMA (50)», ayer la de 10 valía 99 € y la de 50, 100 €; hoy la de 10 vale 100,5 € y la de 50, 100,2 €: se cumple hoy, y mañana ya no.' },
  { clave: 'mediaPendiente', c: 'mediaPendiente', buscar: 'media pendiente sube baja tendencia sma ema' },
  { clave: 'distanciaMedia', c: 'distanciaMedia', buscar: 'distancia cerca media porcentaje' },
  { clave: 'cambioPrecio', c: 'cambioPrecio', buscar: 'cierre sube baja hace velas precio cambio' },
  { clave: 'caidaDesdeMaximo', c: 'caidaDesdeMaximo', buscar: 'caida retroceso maximo drawdown precio' },
  { clave: 'rsiNivel', c: 'rsiNivel', buscar: 'rsi oscilador sobreventa sobrecompra nivel' },
  { clave: 'rsiCruza', c: 'rsiNivel', env: 'cruza', p: { umbral: 30 }, nombre: 'El RSI cruza un nivel', buscar: 'rsi cruce cruza nivel oscilador',
    explicacion: cruce('el RSI pasa al otro lado del nivel') + ' Ejemplo: con «RSI (14) cruza ↑ 30», ayer el RSI estaba en 28 y hoy en 33: se cumple hoy (deja atrás una caída fuerte); mañana, aunque esté en 35, ya no.' },
  { clave: 'macdSenal', c: 'macdSenal', buscar: 'macd senal oscilador impulso' },
  { clave: 'macdCruce', c: 'macdSenal', env: 'cruza', nombre: 'El MACD cruza su señal', buscar: 'macd cruce cruza senal impulso',
    explicacion: cruce('el MACD pasa al otro lado de su señal: el giro del impulso') + ' Ejemplo: ayer el MACD valía 0,8 y la señal 1,0; hoy el MACD vale 1,1 y la señal 1,0: «MACD cruza ↑ su señal» se cumple hoy y mañana ya no.' },
  { clave: 'macdCero', c: 'macdCero', buscar: 'macd cero tendencia oscilador' },
  { clave: 'rocNivel', c: 'rocNivel', buscar: 'roc cambio porcentaje momentum subida caida oscilador' },
  { clave: 'bollingerInferior', c: 'bollingerBanda', p: { banda: 'inferior', lado: 'debajo' }, nombre: 'Cierre bajo la banda inferior de Bollinger', buscar: 'bollinger banda inferior volatilidad caida' },
  { clave: 'bollingerSuperior', c: 'bollingerBanda', p: { banda: 'superior', lado: 'encima' }, nombre: 'Cierre sobre la banda superior de Bollinger', buscar: 'bollinger banda superior volatilidad subida' },
  { clave: 'atrPct', c: 'atrPct', buscar: 'atr volatilidad movimiento porcentaje' },
  { clave: 'volumenAlto', c: 'volumenAlto', buscar: 'volumen alto negociacion' },
  { clave: 'volumenBajo', c: 'volumenBajo', buscar: 'volumen bajo negociacion' },
  { clave: 'nuevoMaximo', c: 'nuevoMaximo', buscar: 'ruptura maximo breakout nuevo' },
  { clave: 'nuevoMinimo', c: 'nuevoMinimo', buscar: 'ruptura minimo nuevo caida' },
  { clave: 'cercaMaximo', c: 'cercaMaximo', buscar: 'cerca maximo distancia ruptura' },
  { clave: 'fuerzaRelativaPercentil', c: 'fuerzaRelativaPercentil', buscar: 'fuerza relativa rs mercado nasdaq percentil momentum' },
].filter(e => CONDICIONES_EDITOR[e.c] && FICHAS[e.c]).map(e => ({ ...e, grupo: FICHAS[e.c].grupo, nombre: e.nombre || FICHAS[e.c].nombre, explicacion: e.explicacion || FICHAS[e.c].explicacion })))
export const entradaCatalogo = (clave) => CATALOGO.find(e => e.clave === clave) || null

// ── Lo que sale de la ficha ──
export const fichaDe = (id) => FICHAS[id] || null
export const aplicaA = (id) => FICHAS[id]?.aplica || (CONDICIONES_EDITOR[id]?.campo ? 'valor' : 'ambos')
// El aviso de una condición que solo se aplica a este valor: «Esta condición solo se puede aplicar a este valor: …».
export const avisoSoloValor = (id) => aplicaA(id) === 'valor' ? `${SOLO_VALOR}: ${FICHAS[id]?.motivo || 'necesita datos del valor que un índice no tiene.'}` : null
// Las velas previas que necesita (su calentamiento del catálogo) con unos valores.
export const velasPrevias = (id, p) => { try { return CONDICIONES_EDITOR[id].calentamiento(p) } catch (_) { return null } }
// El mensaje de un número fuera de rango, con un ejemplo válido: «El nivel del RSI va de 0 a 100 (por ejemplo, 15).»
export function errorRango(que, v, decl, ej) {
  const ejemplo = ` (por ejemplo, ${fmt(ej)})`
  if (typeof v !== 'number' || !Number.isFinite(v)) return `${que} tiene que ser un número${ejemplo}.`
  if (decl.tipo === 'entero' && !Number.isInteger(v)) return `${que} tiene que ser un número entero${ejemplo}.`
  if ((decl.min != null && v < decl.min) || (decl.max != null && v > decl.max)) {
    if (decl.min != null && decl.max != null) return `${que} va de ${fmt(decl.min)} a ${fmt(decl.max)}${ejemplo}.`
    return decl.min != null ? `${que} tiene que ser ${fmt(decl.min)} o más${ejemplo}.` : `${que} tiene que ser como mucho ${fmt(decl.max)}${ejemplo}.`
  }
  return null
}
export { fmt as fmtFicha }
