// lib/screener/sectores.js — el SECTOR de cada empresa del screener (docs/screener.md).
//
// Dos fuentes, por orden:
//   · 'GICS': la clasificación oficial del S&P 500 (11 sectores), de la lista de Wikipedia. Solo la tienen sus miembros.
//   · 'SIC': el código de actividad que la empresa declara a la SEC (4 cifras), agrupado aquí en esos mismos 11 sectores.
//     Es una APROXIMACIÓN (el SIC es antiguo y no distingue, p. ej., software de servicios informáticos igual que GICS), así
//     que la pantalla dice de cuál sale.
// Un código SIC que no encaja en ningún tramo queda en 'Otros' (no se quita con ningún chip de sectores).

export const SECTORES = [
  'Tecnología', 'Salud', 'Financieras', 'Consumo discrecional', 'Comunicación', 'Industria', 'Consumo básico',
  'Energía', 'Utilities', 'Inmobiliario', 'Materiales',
]
// Los que la vista quita por defecto (decisión de Sergi: sus tesis excluyen financieras, energía, utilities, materiales e
// inmobiliario).
export const SECTORES_FUERA_POR_DEFECTO = ['Financieras', 'Energía', 'Utilities', 'Materiales', 'Inmobiliario']
// Por qué se recomienda quitar cada uno (tooltip de su casilla en el screener, docs/screener.md §19).
export const POR_QUE_FUERA = {
  'Financieras': 'Bancos y aseguradoras trabajan con dinero ajeno: la deuda es su materia prima. El ROCE, la deuda / patrimonio y la caja no se leen como en el resto: saldrían mal (o bien) sin motivo.',
  'Energía': 'Petroleras y gasistas ganan según el precio del petróleo y del gas: un año de precios altos las hace parecer muy rentables y baratas, y al siguiente lo contrario.',
  'Utilities': 'Eléctricas y aguas son negocios regulados con mucha deuda por naturaleza (centrales, redes): suspenderían siempre los filtros de deuda, aunque sean sólidas.',
  'Materiales': 'Minas, químicas y acero dependen del precio de las materias primas: su rentabilidad sube y baja con el ciclo, no con la calidad del negocio.',
  'Inmobiliario': 'Las SOCIMI (REIT) se financian con deuda y reparten casi todo; su beneficio contable incluye amortizaciones de edificios que no reflejan el negocio (se miran con otras cifras, como el FFO).',
}

const GICS = {
  'Information Technology': 'Tecnología', 'Health Care': 'Salud', 'Financials': 'Financieras',
  'Consumer Discretionary': 'Consumo discrecional', 'Communication Services': 'Comunicación', 'Industrials': 'Industria',
  'Consumer Staples': 'Consumo básico', 'Energy': 'Energía', 'Utilities': 'Utilities', 'Real Estate': 'Inmobiliario',
  'Materials': 'Materiales',
}
export const sectorDeGics = (g) => GICS[g] || null

// Tramos [desde, hasta] de SIC → sector. Se mira de arriba abajo: el PRIMERO que contiene el código manda (por eso los
// tramos estrechos van antes que los anchos que los contienen).
const TRAMOS_SIC = [
  [6798, 6798, 'Inmobiliario'],            // REIT
  [6500, 6599, 'Inmobiliario'],
  [6000, 6799, 'Financieras'],
  [1300, 1399, 'Energía'],                 // petróleo y gas
  [2900, 2999, 'Energía'],                 // refino
  [4610, 4619, 'Energía'],                 // oleoductos
  [4900, 4999, 'Utilities'],
  [2830, 2836, 'Salud'],                   // farmacia y biotecnología
  [3840, 3851, 'Salud'],                   // aparatos médicos
  [8000, 8099, 'Salud'],
  [5047, 5047, 'Salud'], [5122, 5122, 'Salud'], [6324, 6324, 'Salud'],
  [1000, 1499, 'Materiales'],              // minería (sin petróleo, ya arriba)
  [2600, 2699, 'Materiales'],              // papel
  [2800, 2899, 'Materiales'],              // química (sin farmacia, ya arriba)
  [3200, 3399, 'Materiales'],              // vidrio, cemento, metales
  [2400, 2499, 'Materiales'],              // madera
  [3570, 3579, 'Tecnología'], [3600, 3699, 'Tecnología'], [3820, 3829, 'Tecnología'], [7370, 7379, 'Tecnología'],
  [3660, 3669, 'Tecnología'],
  [4800, 4899, 'Comunicación'], [2710, 2799, 'Comunicación'], [7810, 7819, 'Comunicación'], [7812, 7812, 'Comunicación'],
  [2000, 2199, 'Consumo básico'],          // alimentación, bebidas, tabaco
  [2840, 2844, 'Consumo básico'],
  [5400, 5499, 'Consumo básico'], [5141, 5199, 'Consumo básico'], [5912, 5912, 'Consumo básico'],
  [2200, 2399, 'Consumo discrecional'], [2500, 2599, 'Consumo discrecional'], [3000, 3199, 'Consumo discrecional'],
  [3710, 3716, 'Consumo discrecional'], [3940, 3949, 'Consumo discrecional'], [5000, 5999, 'Consumo discrecional'],
  [7000, 7299, 'Consumo discrecional'], [7900, 7999, 'Consumo discrecional'], [5800, 5899, 'Consumo discrecional'],
  [1500, 1799, 'Industria'], [3400, 3569, 'Industria'], [3580, 3599, 'Industria'], [3700, 3799, 'Industria'],
  [3800, 3839, 'Industria'], [4000, 4799, 'Industria'], [7300, 7369, 'Industria'], [7380, 7399, 'Industria'],
  [8700, 8799, 'Industria'],
]
export function sectorDeSic(sic) {
  const n = Number(sic)
  if (!Number.isFinite(n) || n <= 0) return null
  for (const [a, b, s] of TRAMOS_SIC) if (n >= a && n <= b) return s
  return 'Otros'
}

// El sector de una empresa y su fuente: GICS si lo hay, si no SIC.
export function sectorDe({ gics, sic }) {
  const g = sectorDeGics(gics)
  if (g) return { sector: g, sector_fuente: 'GICS' }
  const s = sectorDeSic(sic)
  return s ? { sector: s, sector_fuente: 'SIC' } : { sector: null, sector_fuente: null }
}
