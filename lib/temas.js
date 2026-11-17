// lib/temas.js — los DOS TONOS de la app, en un solo sitio (docs/builder.md §177). Decisión de Sergi (17/11): toda la app irá
// con los tonos del screener: oscuro = «Estilo Finviz» (menos oscuro y con menos contraste que el de antes: cansa menos la vista)
// y claro = «Papel gris». Los usan lib/screener/colores.js (variables --sc-…) y lib/builder/estilo.js (variables --bd-…).
// Las dos paletas tienen las MISMAS claves (lo vigila scripts/comprobaciones/screener.js).
//   Las claves de la segunda línea de cada tono (resultado, siguiente…, chips) son las que el Builder usaba y el screener no tenía.

export const PALETAS = Object.freeze({
  oscuro: Object.freeze({
    fondo: '#22262f', tarjeta: '#22262f', cabecera: '#353945', borde: '#4c5263', rayado: '#2c303b', hover: '#454b5c', sel: '#263766', selBorde: '#2f91ef',
    texto: '#f3f3f5', titulo: '#ffffff', secundario: '#c3c6d0', apagado: '#9a9eab', enlace: '#57aefb',
    verde: '#34a341', rojo: '#f0624c', amarillo: '#f2cc60', caja: '#22262f', boton: '#373c49',
    pasoFondo: '#1f3527', pasoBorde: '#34a341', botonVerde: '#2f7d45', sobreVerde: '#ffffff', desactivado: '#4c5263', sobreDesactivado: '#22262f',
    fuente: '#353945', fuenteYahoo: '#4a4126', chipRojo: '#4a2c2c', chipNeutro: '#353945', chipNeutroTexto: '#c3c6d0', sombra: 'rgba(0,0,0,0.5)',
    ema200: '#e3a13b', ema50: '#b48cff', ema20: '#4dd0e1', rejilla: '#2f333d', linea: '#79c0ff',
    resultado: '#e3e5ea', siguienteFondo: '#263766', siguienteBorde: '#2f91ef',
    chipSupera: '#1f3527', chipSuperaTexto: '#5fd36e', chipNoSupera: '#4a2c2c', chipNoSuperaTexto: '#f0624c', chipBorrador: '#4a4126', chipBorradorTexto: '#f2cc60',
    cVerde: '#7ee2a0', cRojo: '#ff8b8b', cAmarillo: '#f2cc60', cAzul: '#58a6ff', cMorado: '#d2a8ff', cMoradoCaja: '#a371f7', cNaranja: '#f0883e', cNaranjaVivo: '#ff9f43', cCian: '#56d4dd',
    cDorado: '#e3b341', cAzulClaro: '#a5d6ff', cRojoClaro: '#ffa198', cVerdeClaro: '#b4f1b4', cGrisLinea: '#6e7681', cGrisClaro: '#d0d7de', cGris: '#4b5868', cRojoFuerte: '#f85149',
    cRejilla: '#2f333d', cEjeCero: '#4c5263', cMarca: '#5a4a12', cFondoNo: '#4a2c2c', cHover: '#263766', cFondoAmpliado: 'rgba(34,38,47,0.97)',
  }),
  claro: Object.freeze({
    fondo: '#d6d2c8', tarjeta: '#dedad1', cabecera: '#cfcac0', borde: '#b3ada1', rayado: '#d6d2c8', hover: '#c6bfae', sel: '#c2bcae', selBorde: '#2f5f96',
    texto: '#33302b', titulo: '#1f1c18', secundario: '#5f5a52', apagado: '#77716a', enlace: '#2f5f96',
    verde: '#2f6f35', rojo: '#a3402e', amarillo: '#8a6300', caja: '#e5e2da', boton: '#cfcac0',
    pasoFondo: '#cbd8c3', pasoBorde: '#2f6f35', botonVerde: '#2f6f35', sobreVerde: '#ffffff', desactivado: '#b3ada1', sobreDesactivado: '#dedad1',
    fuente: '#cfcac0', fuenteYahoo: '#e6d6a3', chipRojo: '#e3c8bf', chipNeutro: '#cfcac0', chipNeutroTexto: '#5f5a52', sombra: 'rgba(0,0,0,0.25)',
    ema200: '#b86e00', ema50: '#6a3fb5', ema20: '#0f7f8f', rejilla: '#cbc6bb', linea: '#2f5f96',
    resultado: '#3d3a34', siguienteFondo: '#c9d3df', siguienteBorde: '#2f5f96',
    chipSupera: '#cbd8c3', chipSuperaTexto: '#2f6f35', chipNoSupera: '#e3c8bf', chipNoSuperaTexto: '#a3402e', chipBorrador: '#e6d6a3', chipBorradorTexto: '#6b4d00',
    cVerde: '#2f6f35', cRojo: '#a3402e', cAmarillo: '#8a6300', cAzul: '#2f5f96', cMorado: '#6a3fb5', cMoradoCaja: '#6a3fb5', cNaranja: '#b05a00', cNaranjaVivo: '#b05a00', cCian: '#0f7f8f',
    cDorado: '#8a6300', cAzulClaro: '#4f7fb5', cRojoClaro: '#c0604f', cVerdeClaro: '#4f8f4f', cGrisLinea: '#8f897d', cGrisClaro: '#4d4840', cGris: '#8f897d', cRojoFuerte: '#b3261e',
    cRejilla: '#cbc6bb', cEjeCero: '#9b958a', cMarca: '#e6d6a3', cFondoNo: '#e3c8bf', cHover: '#c2bcae', cFondoAmpliado: 'rgba(214,210,200,0.98)',
  }),
})
export const temaValido = (t) => (t === 'claro' ? 'claro' : 'oscuro')
