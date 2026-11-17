// lib/screener/colores.js — los COLORES del screener en un solo sitio (docs/screener.md §14; boceto bocetos/screener-colores.html).
// Dos tonos que se alternan con el botón «☀ Claro / ☾ Oscuro» de la barra de arriba (pages/index.js):
//   · oscuro = «Estilo Finviz»: los colores medidos en la captura de Sergi (fondo 34,38,47; filas alternas 44,48,59…).
//   · claro  = «Papel gris»: papel apagado, con poco brillo y poco color.
// La pantalla no usa los colores directamente sino variables CSS («var(--sc-…)»): el tono se cambia poniendo las variables en el
// div de la pantalla (varsTema), sin volver a pintar nada. B y S tienen las MISMAS claves que lib/builder/estilo.js (lo que usaba
// la pantalla), pero con las variables. Para llevarlo a toda la app más adelante, cada pantalla tendrá que pasar a variables así.
import { B as B0 } from '../builder/estilo'
import { PALETAS, temaValido } from '../temas'

// §177: los dos tonos viven en lib/temas.js (los mismos valores de siempre del screener), comunes a toda la app.
export const TEMAS = PALETAS
export const TEMA_POR_DEFECTO = 'oscuro'
export { temaValido }

// Las variables CSS de un tono: { '--sc-fondo': '#22262f', … } (para el style del div de la pantalla).
export const varsTema = (t) => Object.fromEntries(Object.entries(TEMAS[temaValido(t)]).map(([k, v]) => ['--sc-' + k, v]))
const v = (k) => `var(--sc-${k})`

// Lo mismo que B de lib/builder/estilo.js, con variables (letra, tamaño y radios, iguales).
export const B = Object.freeze({
  letra: B0.letra, base: B0.base, radioTarjeta: B0.radioTarjeta, radioBoton: B0.radioBoton, aire: B0.aire,
  fondo: v('fondo'), tarjeta: v('tarjeta'), cabecera: v('cabecera'), borde: v('borde'), texto: v('texto'), titulo: v('titulo'),
  secundario: v('secundario'), apagado: v('apagado'), enlace: v('enlace'), verde: v('verde'), pasoFondo: v('pasoFondo'), pasoBorde: v('pasoBorde'),
  rayado: v('rayado'), hover: v('hover'), sel: v('sel'), selBorde: v('selBorde'), caja: v('caja'), fuente: v('fuente'), fuenteYahoo: v('fuenteYahoo'), sombra: v('sombra'),
})
export const ROJO = v('rojo'), VERDE = v('verde'), AMARILLO = v('amarillo')
// §22: los colores de los minigráficos de «Charts» (las tres EMA, la rejilla y la línea del cierre).
export const GRAF = Object.freeze({ ema200: v('ema200'), ema50: v('ema50'), ema20: v('ema20'), rejilla: v('rejilla'), linea: v('linea') })

const CHIPS = { noSupera: [v('chipRojo'), v('rojo')], neutro: [v('chipNeutro'), v('chipNeutroTexto')] }
export const S = {
  pagina: { flex: 1, overflowY: 'auto', padding: 20, minWidth: 0, background: B.fondo, color: B.texto, fontFamily: B.letra, fontSize: B.base, lineHeight: 1.45 },
  tarjeta: { background: B.tarjeta, border: `1px solid ${B.borde}`, borderRadius: B.radioTarjeta, overflow: 'hidden' },
  secundario: { color: B.secundario },
  apagado: { color: B.apagado, fontSize: 12 },
  boton: { fontFamily: B.letra, fontSize: B.base, padding: '8px 14px', borderRadius: B.radioBoton, cursor: 'pointer', border: `1px solid ${B.borde}`, background: v('boton'), color: B.texto },
  botonVerde: { fontFamily: B.letra, fontSize: B.base, padding: '9px 16px', borderRadius: B.radioBoton, cursor: 'pointer', border: `1px solid ${v('botonVerde')}`, background: v('botonVerde'), color: v('sobreVerde'), fontWeight: 700 },
  botonDesactivado: { fontFamily: B.letra, fontSize: B.base, padding: '9px 16px', borderRadius: B.radioBoton, cursor: 'not-allowed', border: `1px solid ${v('desactivado')}`, background: v('desactivado'), color: v('sobreDesactivado'), fontWeight: 700 },
  enlace: { background: 'none', border: 'none', padding: 0, fontFamily: B.letra, fontSize: B.base, color: B.enlace, cursor: 'pointer', textAlign: 'left' },
  chip: (tipo) => { const [bg, fg] = CHIPS[tipo] || CHIPS.neutro; return { display: 'inline-block', padding: '2px 10px', borderRadius: 999, background: bg, color: fg, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' } },
}

// Las reglas que no caben en un style: filas alternas y la fila entera resaltada al pasar el ratón (pedido por Sergi el 11/11).
export const CSS_TABLA = '[data-screener] [data-tabla] tbody tr:nth-child(even){background:var(--sc-rayado)}'
  + '[data-screener] [data-tabla] tbody tr[data-fila]:hover{background:var(--sc-hover) !important}'
  // §19: las listas de los <select> del navegador (estrategia, velas): la app las pinta oscuras para todo (styles/globals.css,
  // «select option»); en el screener, con el tono de la pantalla.
  + '[data-screener] select option{background:var(--sc-tarjeta);color:var(--sc-texto)}'
  // §17: el desplegable de cifras (components/ScreenerCifras.js): la fila se resalta y ✎ / papelera solo se ven al pasar el ratón.
  + '[data-lista-cifras] [data-fila-cifra]:hover{background:var(--sc-hover)}[data-lista-cifras] .sc-ic{opacity:0}'
  + '[data-lista-cifras] [data-fila-cifra]:hover .sc-ic{opacity:1}[data-lista-cifras] .sc-ic:hover{color:var(--sc-enlace) !important}'
