// lib/indicadoresVentana.js — la lista de la ventana «Indicadores» del gráfico (docs/builder.md §212; boceto
// bocetos/grafico-indicadores-alertas.html, pestaña 2): grupos, búsqueda sin mayúsculas ni acentos (también por palabras sueltas
// como «ema» o «bandas») y favoritos. Puro: el catálogo es CATALOGO_INDICADORES de lib/indicadores.js.
import { CATALOGO_INDICADORES, TIPOS_DISPONIBLES } from './indicadores'

export const GRUPOS = [
  { id: 'todos', nombre: 'Todos' },
  { id: 'favoritos', nombre: '☆ Favoritos' },
  { id: 'precio', nombre: 'Sobre el precio' },
  { id: 'panel', nombre: 'En panel aparte' },
]
// Otras palabras con las que se busca cada uno.
const PALABRAS = {
  medias: 'media movil ema sma exponencial simple tendencia',
  bollinger: 'bandas desviacion volatilidad',
  rsi: 'fuerza relativa sobrecompra sobreventa oscilador',
  macd: 'convergencia divergencia histograma oscilador',
  volumen: 'volume',
}
export const sinAcentos = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
export const dondeVa = (tipo) => (CATALOGO_INDICADORES[tipo]?.destino === 'precio' ? 'precio' : 'panel')
export const textoDonde = (tipo) => (dondeVa(tipo) === 'precio' ? 'sobre el precio' : 'en panel aparte')

// Los tipos que se ven con ese grupo y esa búsqueda (todas las palabras buscadas tienen que aparecer).
export function listaIndicadores(grupo = 'todos', busqueda = '', favoritos = []) {
  const palabras = sinAcentos(busqueda).split(/\s+/).filter(Boolean)
  const fav = new Set(favoritos)
  return TIPOS_DISPONIBLES.filter(t => {
    if (grupo === 'favoritos' && !fav.has(t)) return false
    if ((grupo === 'precio' || grupo === 'panel') && dondeVa(t) !== grupo) return false
    const texto = sinAcentos(`${CATALOGO_INDICADORES[t].nombre} ${PALABRAS[t] || ''}`)
    return palabras.every(p => texto.includes(p))
  })
}
