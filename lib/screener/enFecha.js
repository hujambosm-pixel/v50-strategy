// lib/screener/enFecha.js — las cifras del screener EN UNA FECHA DEL PASADO, con lo que se sabía ese día (paso 3 de «la lista
// del screener de cada día», docs/screener.md §28). Lógica PURA: no habla con la red ni con la base.
//
// QUÉ SE SABÍA EL DÍA `fecha` (un viernes de cierre, normalmente):
//   · Cuentas: solo las filas de screener_cuentas con `conocido_desde` ≤ fecha (el día en que la cifra apareció por primera vez
//     en un documento de la SEC). Ojo (fuga pequeña, dicha a Sergi): si un documento posterior CORRIGIÓ la cifra, se usa la
//     corregida (la base guarda la última versión), aunque se supiera más tarde.
//   · Precio: el cierre de ese día de precios_diarios (AJUSTADO por los splits hasta hoy). Por eso las acciones se pasan a la
//     escala de hoy con TODOS los splits posteriores al documento (metricasDe con precio_fecha = null → factorEntre hasta hoy).
//     Ejemplo NVDA 07/06/2024 (antes del 10:1 del 10/06/2024): cierre ajustado 120,89 $ (sin ajustar, 1.208,88 $). Acciones:
//     las del trimestre que acaba el 28/04/2024 (se conocen desde el 29/05/2024); la base guarda la cifra del 10-Q de mayo de 2025,
//     ya posterior al split, 24.890 millones (presentado después del split → × 1) → 120,89 × 24.890 = 3,009 billones de $, lo
//     mismo que 1.208,88 × 2.489 millones (las acciones de entonces).
//   · PEG esperado de Yahoo: el último del historial (public.screener_peg, sql/screener_peg.sql) con fecha ≤ ese día y como mucho
//     PEG_DIAS_MAX (400) días antes (decisión de Sergi del 27/11/2026: Yahoo solo guarda puntos sueltos desde el 10/06/2024, con
//     huecos de más de un año). Sin ninguno → null (no pasa). En las semanas en que MENOS DE LA MITAD de las empresas tienen PEG (antes
//     del 10/06/2024: entre 2015 y 2023 hay puntos sueltos de unas 100 de 599), la foto no lleva la columna y el filtro «no se aplica»
//     (quitaCamposVacios): si no, dejaría fuera a todas las que no tienen ninguno. La pantalla dice desde cuándo se aplica.
//   · Técnico: las velas de los ANIOS_TECNICO años anteriores, hasta ese día incluido (tecnicoDe, igual que hoy).
//   · P/S del sector: la mediana entre las empresas de ese mismo día (medianasPorSector, igual que hoy).
// Con esto, la foto de HOY (fecha = el último cierre) da las mismas cifras que la pantalla del screener (salvo las cuentas que
// la SEC presentó después del cierre y el PEG esperado, que la pantalla toma de la última carga).
import { metricasDe, medianasPorSector } from './metricas'
import { tecnicoDe, cifrasTecnicas, fuerzaSector, ANIOS_TECNICO } from './tecnico'
import { FILTROS_ACTIVOS } from './filtros'

// Las filas de cuentas que se conocían el día `fecha` (incluido).
export function cuentasEnFecha(cuentas, fecha) {
  return (cuentas || []).filter(c => {
    const d = String(c.conocido_desde || c.presentado || '').slice(0, 10)
    return d && d <= fecha
  })
}

// El PEG esperado que se sabía el día `fecha`: pegs = [{ fecha, peg }] (ordenados o no) → { peg, fecha } | null.
export const PEG_DIAS_MAX = 400
export function pegEnFecha(pegs, fecha, dias = PEG_DIAS_MAX) {
  const desde = restaDias(fecha, dias)
  let mejor = null
  for (const p of pegs || []) {
    const f = String(p.fecha).slice(0, 10)
    if (f > fecha || f < desde || !Number.isFinite(Number(p.peg))) continue
    if (!mejor || f > mejor.fecha) mejor = { peg: Number(p.peg), fecha: f }
  }
  return mejor
}

// La primera fecha de la ventana del técnico: el mismo día de hace ANIOS_TECNICO años (UTC), como la pantalla.
export function inicioTecnico(fecha) {
  const [y, m, d] = fecha.split('-').map(Number)
  return new Date(Date.UTC(y - ANIOS_TECNICO, m - 1, d)).toISOString().slice(0, 10)
}

// Las velas (ordenadas) de la ventana del técnico que acaba en `fecha` (incluida). Búsqueda binaria: las llamadas son muchas.
export function velasHasta(velas, fecha) {
  const v = velas || []
  const ini = inicioTecnico(fecha)
  const corte = (f) => { let lo = 0, hi = v.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (v[mid].date < f) lo = mid + 1; else hi = mid } return lo }
  return v.slice(corte(ini), corte(fecha + '~'))   // '~' > cualquier carácter de una fecha: incluye `fecha`
}

// La empresa como la ve la pantalla del screener (la forma de lib/screener/datos.js, con `t`), en la fecha. `empresa` = su fila
// de screener_empresas (simbolo, nombre, sector, en_*…); velas = sus velas diarias (todas, ordenadas); refs = { SPY: velas, XLK:
// velas, … }; pegs = su historial del PEG esperado [{ fecha, peg }] (opcional). La mediana del sector se pone después, entre todas
// las del día (empresasEnFecha).
export function empresaEnFecha(empresa, cuentas, splits, velas, fecha, pegs = null) {
  const vv = velasHasta(velas, fecha)
  const tecnico = tecnicoDe(vv)
  const ultima = vv.length ? vv[vv.length - 1] : null
  // Si el valor no cotizaba ese día (o no hay velas de esa semana), sin precio: lo que depende de él sale sin dato.
  const precio = ultima && ultima.date >= restaDias(fecha, 7) ? ultima.close : null
  const pg = pegEnFecha(pegs, fecha)
  const r = metricasDe({ ...empresa, precio, precio_fecha: null, peg_esperado: pg ? pg.peg : null }, cuentasEnFecha(cuentas, fecha), splits)
  return {
    simbolo: empresa.simbolo, nombre: empresa.nombre, sector: empresa.sector, sectorFuente: empresa.sector_fuente,
    en_sp500: !!empresa.en_sp500, en_ndx: !!empresa.en_ndx, en_listas: !!empresa.en_listas,
    precio, precioFecha: ultima ? ultima.date : null, pegFecha: pg ? pg.fecha : null, tecnico,
    moneda: r.moneda, cuentasHasta: r.cuentasHasta, fechas: r.fechas, piezas: r.piezas, m: r.m,
  }
}
const restaDias = (f, n) => new Date(Date.parse(f + 'T00:00:00Z') - n * 86400000).toISOString().slice(0, 10)

// Todas las empresas del día, con la mediana del P/S de su sector y las cifras técnicas en `t` (como conTecnico de datos.js).
// datos = [{ empresa, cuentas, splits, velas, pegs? }]; refs = { SPY: velas, XLK: velas, … }.
export function empresasEnFecha(datos, refs, fecha) {
  const lista = (datos || []).map(d => empresaEnFecha(d.empresa, d.cuentas, d.splits, d.velas, fecha, d.pegs))
  medianasPorSector(lista)
  const tr = {}
  for (const [s, v] of Object.entries(refs || {})) { const t = tecnicoDe(velasHasta(v, fecha)); if (t) tr[s] = t }
  return lista.map(e => ({ ...e, t: { ...cifrasTecnicas(e.tecnico), sector: fuerzaSector(e.sector, tr) } }))
}

// ── La FOTO de un día (lo que se guarda: una fila por fecha en screener_fotos) ──
// Por empresa, el valor de cada filtro (v(e) de lib/screener/filtros.js), en el orden de CAMPOS_FOTO; «sin dato pero pasa»
// (sin deuda a corto, no paga intereses: f.sinDato) se guarda como 'sd'. «Da señal de compra con…» no se guarda (se calcula
// aparte). El PEG esperado solo se guarda en las fotos en que alguna empresa lo tiene (quitaCamposVacios). Se redondea a 6 cifras significativas (la foto es para filtrar, no
// para enseñar; así solo una cifra a menos de una millonésima del corte podría cambiar de lado).
export const NO_EN_FOTO = new Set(['senal'])
// Las columnas que se quitan de una foto si MENOS DE LA MITAD de las empresas tienen dato ese día (así el filtro «no se aplica» en
// vez de dejar fuera a las que no lo tienen). Solo el PEG esperado: las demás salen de cuentas o de velas, y un dato que falta de
// verdad debe dejarlas fuera. Ejemplo: 100 de 599 con PEG → fuera la columna; 405 de 599 → se queda (las 194 sin PEG no pasan).
export const SOLO_CON_DATO = ['pegEsp']
export const MIN_CON_DATO = 0.5
export function quitaCamposVacios(foto) {
  const campos = foto?.campos || [], datos = foto?.datos || {}
  const filas = Object.values(datos)
  const quita = SOLO_CON_DATO.map(id => campos.indexOf(id)).filter(i => i >= 0 && filas.filter(v => v[i] != null).length < MIN_CON_DATO * filas.length)
  if (!quita.length) return foto
  const deja = (arr) => arr.filter((_, i) => !quita.includes(i))
  return { campos: deja(campos), datos: Object.fromEntries(Object.entries(datos).map(([s, v]) => [s, deja(v)])) }
}
export const CAMPOS_FOTO = FILTROS_ACTIVOS.filter(f => !NO_EN_FOTO.has(f.id) && !f.conEstrategia).map(f => f.id)
export const redondea = (x) => x == null || !Number.isFinite(x) ? null : Number(x.toPrecision(6))

export function valoresDe(e) {
  return CAMPOS_FOTO.map(id => {
    const f = FILTROS_ACTIVOS.find(x => x.id === id)
    const x = f.v(e)
    if (x == null) return f.sinDato && f.sinDato(e) ? 'sd' : null
    return redondea(x)
  })
}

// La foto: { campos: CAMPOS_FOTO, datos: { simbolo: [valores] } }; las que no tienen ni precio ni cuentas ese día, fuera.
export function fotoDe(empresas) {
  const datos = {}
  for (const e of empresas || []) {
    if (e.precio == null && !e.cuentasHasta) continue
    datos[e.simbolo] = valoresDe(e)
  }
  return quitaCamposVacios({ campos: CAMPOS_FOTO, datos })
}

// ── Evaluar una VISTA sobre una foto ──
// Igual que evaluaVista de lib/screener/filtros.js (universo y sectores de hoy de cada empresa, los dos pisos), pero con los
// valores guardados. fichas = { simbolo: { sector, en_sp500, en_ndx, en_listas } } (de screener_empresas). Devuelve
// { pasan: [simbolos], noSeAplican: [ids de filtros encendidos que la foto no tiene] }.
export function evaluaFoto(foto, fichas, vista) {
  const filtros = vista?.filtros || {}
  const fuera = new Set(vista?.sectoresFuera || [])
  const u = vista?.universo || { sp500: true, ndx: true, listas: true }
  const campos = foto?.campos || []
  const idx = Object.fromEntries(campos.map((c, i) => [c, i]))
  const encendidos = FILTROS_ACTIVOS.filter(f => filtros[f.id]?.on && !(f.conEstrategia && filtros[f.id].estrategia == null))
  const noSeAplican = encendidos.filter(f => idx[f.id] == null).map(f => f.id)
  const usar = encendidos.filter(f => idx[f.id] != null)
  const pasan = []
  for (const [s, vals] of Object.entries(foto?.datos || {})) {
    const fi = fichas?.[s]; if (!fi) continue
    if (!((u.sp500 && fi.en_sp500) || (u.ndx && fi.en_ndx) || (u.listas && fi.en_listas))) continue
    if (fuera.has(fi.sector)) continue
    const ok = usar.every(f => {
      const x = vals[idx[f.id]], c = filtros[f.id]
      if (x === 'sd') return true
      if (x == null) return false
      return c.op === '≥' ? x >= c.valor : x <= c.valor
    })
    if (ok) pasan.push(s)
  }
  return { pasan: pasan.sort(), noSeAplican }
}
