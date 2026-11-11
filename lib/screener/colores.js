// lib/screener/colores.js — los COLORES del screener en un solo sitio (docs/screener.md §14; boceto bocetos/screener-colores.html).
// Dos tonos que se alternan con el botón «☀ Claro / ☾ Oscuro» de la barra de arriba (pages/index.js):
//   · oscuro = «Estilo Finviz»: los colores medidos en la captura de Sergi (fondo 34,38,47; filas alternas 44,48,59…).
//   · claro  = «Papel gris»: papel apagado, con poco brillo y poco color.
// La pantalla no usa los colores directamente sino variables CSS («var(--sc-…)»): el tono se cambia poniendo las variables en el
// div de la pantalla (varsTema), sin volver a pintar nada. B y S tienen las MISMAS claves que lib/builder/estilo.js (lo que usaba
// la pantalla), pero con las variables. Para llevarlo a toda la app más adelante, cada pantalla tendrá que pasar a variables así.
import { B as B0 } from '../builder/estilo'

export const TEMAS = Object.freeze({
  oscuro: {
    fondo: '#22262f', tarjeta: '#22262f', cabecera: '#353945', borde: '#4c5263', rayado: '#2c303b', hover: '#454b5c', sel: '#263766', selBorde: '#2f91ef',
    texto: '#f3f3f5', titulo: '#ffffff', secundario: '#c3c6d0', apagado: '#9a9eab', enlace: '#57aefb',
    verde: '#34a341', rojo: '#f0624c', amarillo: '#f2cc60', caja: '#22262f', boton: '#373c49',
    pasoFondo: '#1f3527', pasoBorde: '#34a341', botonVerde: '#2f7d45', sobreVerde: '#ffffff', desactivado: '#4c5263', sobreDesactivado: '#22262f',
    fuente: '#353945', fuenteYahoo: '#4a4126', chipRojo: '#4a2c2c', chipNeutro: '#353945', chipNeutroTexto: '#c3c6d0', sombra: 'rgba(0,0,0,0.5)',
    ema200: '#e3a13b', ema50: '#b48cff', ema20: '#4dd0e1', rejilla: '#2f333d', linea: '#79c0ff',
  },
  claro: {
    fondo: '#d6d2c8', tarjeta: '#dedad1', cabecera: '#cfcac0', borde: '#b3ada1', rayado: '#d6d2c8', hover: '#c6bfae', sel: '#c2bcae', selBorde: '#2f5f96',
    texto: '#33302b', titulo: '#1f1c18', secundario: '#5f5a52', apagado: '#77716a', enlace: '#2f5f96',
    verde: '#2f6f35', rojo: '#a3402e', amarillo: '#8a6300', caja: '#e5e2da', boton: '#cfcac0',
    pasoFondo: '#cbd8c3', pasoBorde: '#2f6f35', botonVerde: '#2f6f35', sobreVerde: '#ffffff', desactivado: '#b3ada1', sobreDesactivado: '#dedad1',
    fuente: '#cfcac0', fuenteYahoo: '#e6d6a3', chipRojo: '#e3c8bf', chipNeutro: '#cfcac0', chipNeutroTexto: '#5f5a52', sombra: 'rgba(0,0,0,0.25)',
    ema200: '#b86e00', ema50: '#6a3fb5', ema20: '#0f7f8f', rejilla: '#cbc6bb', linea: '#2f5f96',
  },
})
export const TEMA_POR_DEFECTO = 'oscuro'
export const temaValido = (t) => (t === 'claro' ? 'claro' : 'oscuro')

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
