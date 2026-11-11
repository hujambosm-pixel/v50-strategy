// lib/screener/columnas.js — las columnas que se pueden ver en la pestaña «Custom» del screener (docs/screener.md §21; boceto
// bocetos/screener-charts-custom.html, opción 1 «casillas por grupos», decidida por Sergi el 10/11). Lógica PURA: no calcula
// ninguna cifra nueva, solo enseña las que la pantalla ya tiene (las de los filtros y unas pocas más de la misma empresa).
//
// Cada columna: { id, grupo, titulo (cabecera), v(e) → número o texto (para ordenar), texto(e, vista), tip(e, vista), filtro (el
// filtro del catálogo, si lo es), izquierda (texto alineado a la izquierda) }.
// La vista guarda columnas: null = «las de los filtros» (sector, precio y una por filtro encendido, como la pestaña «Filtros»), o
// la lista de ids en su orden, en cuanto se cambia algo en «Custom».
import { FILTROS, fmt } from './filtros'

// El valor de una celda de la tabla para el filtro f (antes en components/ScreenerPanel.js, que lo sigue exportando).
export function textoCelda(e, f) {
  const x = f.v(e)
  if (f.texto) return f.texto(x)
  if (x == null) return (f.sinDato && f.sinDato(e)) || '—'
  return (f.signo && x > 0 ? '+' : '') + fmt(x, f.dec ?? 1) + (f.unidad === '%' ? ' %' : f.unidad === 'M' ? ' M' : f.unidad === 'puntos' ? ' pt' : '')
}

const num = (x, dec, unidad = '', signo = false) => x == null ? '—' : (signo && x > 0 ? '+' : '') + fmt(x, dec) + unidad
const INDICES = [['en_sp500', 'S&P 500'], ['en_ndx', 'Nasdaq-100'], ['en_listas', 'Tus listas']]
const indiceDe = (e) => INDICES.filter(([k]) => e[k]).map(([, t]) => t).join(' · ') || '—'
// El crecimiento que exige el precio: PER ÷ PEG razonable de la vista (el mismo de la pestaña «Filtros»).
export const exigidoDe = (e, vista) => e.m?.per == null ? null : e.m.per / (vista?.pegRazonable || 2)

const deFiltro = (f) => ({ id: f.id, grupo: f.grupo, titulo: f.columna || f.nombre, filtro: f, v: f.v, texto: (e) => textoCelda(e, f), tip: (e) => f.titulo ? f.titulo(e) : undefined,
  orden: (e) => { const x = f.v(e); return x != null ? x : (f.orden ? f.orden(e) : null) } })
const delGrupo = (g) => FILTROS.filter(f => !f.proximamente && f.grupo === g).map(deFiltro)

const BASICOS = [
  { id: 'sec', grupo: 'Básicos', titulo: 'Sector', izquierda: true, v: e => e.sector || null, texto: e => (e.sector || '—') + (e.sectorFuente === 'SIC' ? '*' : ''),
    tip: e => e.sectorFuente === 'SIC' ? 'Sector aproximado con el código de actividad que declara a la SEC (SIC)' : 'Sector oficial del S&P 500 (GICS)' },
  { id: 'precio', grupo: 'Básicos', titulo: 'Precio $', v: e => e.precio, texto: e => num(e.precio, 2) },
  { id: 'capi', grupo: 'Básicos', titulo: 'Capitalización (M $)', v: e => e.m?.capitalizacion ?? null, texto: e => num(e.m?.capitalizacion, 0),
    tip: e => e.m?.capitalizacion == null ? 'Sin precio o con cuentas en otra moneda' : 'Precio × acciones diluidas, en millones de dólares' },
  { id: 'indice', grupo: 'Básicos', titulo: 'Índice', izquierda: true, v: e => indiceDe(e), texto: indiceDe, tip: () => 'En qué índices o listas tuyas está' },
]
const EXTRA_CRECIMIENTO = [
  { id: 'crecPasado', grupo: 'Crecimiento', titulo: 'Crec. beneficio pasado', v: e => e.m?.crecPasado ?? null, texto: e => num(e.m?.crecPasado, 1, ' %', true),
    tip: () => 'Lo que ha crecido el beneficio neto cada año, de media, en los últimos 5 años (el que usa el PEG con crecimiento pasado)' },
]
const EXTRA_PRECIO = [
  { id: 'ps', grupo: 'Precio', titulo: 'P/S', v: e => e.m?.ps ?? null, texto: e => num(e.m?.ps, 2), tip: () => 'Capitalización ÷ ventas de los últimos 12 meses' },
  { id: 'exigido', grupo: 'Precio', titulo: 'Crec. exigido', v: (e, vista) => exigidoDe(e, vista), texto: (e, vista) => num(exigidoDe(e, vista), 1, ' %'),
    tip: (e, vista) => e.m?.per == null ? 'Sin PER' : `PER ${fmt(e.m.per)} ÷ PEG ${fmt(vista?.pegRazonable || 2)}` },
  { id: 'esperado', grupo: 'Precio', titulo: 'Crec. esperado', v: e => e.m?.crecEsperado ?? null, texto: e => num(e.m?.crecEsperado, 1, ' %'),
    tip: e => e.m?.crecEsperado == null ? 'Yahoo no da el PEG esperado (o no hay PER)' : `PER ${fmt(e.m.per)} ÷ PEG esperado ${fmt(e.m.pegEsp, 2)} (Yahoo)` },
]
const EXTRA_TECNICO = [
  { id: 'var3m', grupo: 'Tendencia y precio', titulo: 'Variación 3 meses', v: e => e.t?.var3m ?? null, texto: e => num(e.t?.var3m, 1, ' %', true),
    tip: e => e.tecnico?.cierre3m ? `Cierre ${fmt(e.tecnico.cierre, 2)} frente a ${fmt(e.tecnico.cierre3m, 2)} hace 63 velas` : 'Sin 3 meses de precios' },
]

// Los grupos de la ventana «⚙ Columnas», en este orden.
export const GRUPOS_COLUMNAS = [
  ['Básicos', BASICOS],
  ['Rentabilidad', delGrupo('Rentabilidad')],
  ['Deuda', delGrupo('Deuda')],
  ['Crecimiento', [...delGrupo('Crecimiento'), ...EXTRA_CRECIMIENTO]],
  ['Precio', [...delGrupo('Precio'), ...EXTRA_PRECIO]],
  ['Tendencia y precio', [...delGrupo('Tendencia y precio'), ...EXTRA_TECNICO]],
  ['Tus estrategias', delGrupo('Tus estrategias')],
]
export const COLUMNAS = GRUPOS_COLUMNAS.flatMap(([, l]) => l)
export const COLUMNA = Object.fromEntries(COLUMNAS.map(c => [c.id, c]))
for (const c of COLUMNAS) if (!c.orden) c.orden = c.v

// Las de los filtros: sector, precio y una por filtro encendido (en el orden del catálogo), y las del crecimiento exigido si
// están a la vista en «Filtros». Es lo que sale mientras la vista no tenga columnas propias.
export function columnasDeFiltros(vista) {
  const on = FILTROS.filter(f => !f.proximamente && vista?.filtros?.[f.id]?.on).map(f => f.id)
  return ['sec', 'precio', ...on, ...(vista?.verExigido ? ['exigido', 'esperado'] : [])]
}
// Las columnas que se ven en «Custom»: las de la vista (sin las que ya no existan ni repetidas) o, si no tiene, las de los filtros.
export function columnasDe(vista) {
  if (!Array.isArray(vista?.columnas)) return columnasDeFiltros(vista)
  return vista.columnas.filter((id, i, a) => COLUMNA[id] && a.indexOf(id) === i)
}
// Para guardar en la vista: null o la lista limpia.
export const columnasLimpias = (x) => Array.isArray(x) ? x.filter((id, i, a) => typeof id === 'string' && COLUMNA[id] && a.indexOf(id) === i) : null

// Cambios de la lista (devuelven la lista nueva; parten de las que se ven).
export const conColumna = (lista, id, on) => on ? (lista.includes(id) ? lista : [...lista, id]) : lista.filter(x => x !== id)
// Arrastrar «desde» y soltarla sobre «sobre»: queda justo delante de «sobre» (si viene de la izquierda, detrás, como en Finviz y en
// el boceto: ocupa su sitio).
export function mueveColumna(lista, desde, sobre) {
  if (desde === sobre || !lista.includes(desde) || !lista.includes(sobre)) return lista
  const i = lista.indexOf(desde), j = lista.indexOf(sobre)
  const r = lista.filter(x => x !== desde)
  r.splice(i < j ? r.indexOf(sobre) + 1 : r.indexOf(sobre), 0, desde)
  return r
}
